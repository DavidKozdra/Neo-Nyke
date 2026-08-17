(function initializeSharedEventItemSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEventItemApi() {
  'use strict';

  const deterministicRandom = () => 0.5;
  const count = (player, key) => Math.max(0, Math.floor(Number(player?.items?.[key] || 0)));
  const GENERIC_HEALTH_REGEN_DELAY_SECONDS = 5;
  const GENERIC_HEALTH_REGEN_INTERVAL_SECONDS = 1;

  function resetGenericHealthRegen(player) {
    if (!player) return false;
    player.genericHealthRegenDelay = GENERIC_HEALTH_REGEN_DELAY_SECONDS;
    player.genericHealthRegenAccum = 0;
    return true;
  }

  function advanceGenericHealthRegen(player, deltaSeconds, options = {}) {
    if (!player) return { active: false, healed: 0, pulses: [] };
    const regenRatio = Math.max(0, Number(options.itemStats?.genericHealthItemRegenRatio
      ?? player.itemStats?.genericHealthItemRegenRatio ?? 0));
    const maxHp = Math.max(0, Number(player.maxHp || 0));
    const delta = Math.max(0, Number(deltaSeconds || 0));
    if (regenRatio <= 0 || maxHp <= 0 || Number(player.hp || 0) <= 0 || player.downed) {
      player.genericHealthRegenDelay = GENERIC_HEALTH_REGEN_DELAY_SECONDS;
      player.genericHealthRegenAccum = 0;
      return { active: false, healed: 0, pulses: [] };
    }

    const delayBefore = Math.max(0, Number(player.genericHealthRegenDelay ?? GENERIC_HEALTH_REGEN_DELAY_SECONDS));
    player.genericHealthRegenDelay = Math.max(0, delayBefore - delta);
    const activeDelta = Math.max(0, delta - delayBefore);
    player.genericHealthRegenAccum = Math.max(0, Number(player.genericHealthRegenAccum || 0)) + activeDelta;
    const pulses = [];
    while (player.genericHealthRegenAccum >= GENERIC_HEALTH_REGEN_INTERVAL_SECONDS) {
      player.genericHealthRegenAccum -= GENERIC_HEALTH_REGEN_INTERVAL_SECONDS;
      const requested = maxHp * regenRatio;
      const before = Number(player.hp || 0);
      let gained;
      if (typeof options.heal === 'function') gained = Math.max(0, Number(options.heal(requested) || 0));
      else {
        player.hp = Math.min(maxHp, before + requested * Math.max(1, Number(options.itemStats?.healingMultiplier || player.itemStats?.healingMultiplier || 1)));
        gained = Math.max(0, Number(player.hp || 0) - before);
      }
      if (gained > 0) pulses.push(gained);
    }
    return { active: player.genericHealthRegenDelay <= 0, healed: pulses.reduce((sum, amount) => sum + amount, 0), pulses };
  }

  function chargeRequirement(player, baseRequirement, itemStats = {}) {
    return Math.max(1, Number(baseRequirement || 1) - count(player, 'charged_adapter')
      - Math.max(0, Number(itemStats.chargeSynergyReduction || 0)));
  }

  function critCharmRequirement(player, difficulty, itemStats) {
    const base = difficulty === 'easy' ? 3 : ['hard', 'impossible', 'god'].includes(difficulty) ? 7 : 5;
    return chargeRequirement(player, base, itemStats);
  }

  function advanceCharge(player, itemKey, field, readyField, requirement, steps, intents) {
    if (count(player, itemKey) <= 0 || player[readyField]) return;
    player[field] = Math.max(0, Number(player[field] || 0)) + steps;
    if (player[field] < requirement) return;
    player[field] = 0;
    player[readyField] = true;
    if (itemKey === 'insurance') player.insuranceActive = false;
    intents.push({ kind: 'ready', itemKey });
  }

  function applyCampaignKillCharge(player, options = {}) {
    if (!player) return { ok: false, intents: [] };
    const stats = options.itemStats || player.itemStats || {};
    const random = typeof options.random === 'function' ? options.random : deterministicRandom;
    const intents = [];
    const steps = (Number(stats.overclockedWatchChance || 0) > 0 && random() < Number(stats.overclockedWatchChance) ? 2 : 1)
      + (options.overcharged ? 1 : 0);
    const healRatio = Math.max(0, Number(stats.genericHealthItemHealRatio || 0));
    if (healRatio > 0 && Number(player.hp || 0) < Number(player.maxHp || 0)) {
      const baseAmount = Math.max(0, Number(player.hp || 0) * healRatio);
      const before = Number(player.hp || 0);
      let amount;
      if (typeof options.heal === 'function') {
        amount = Math.max(0, Number(options.heal(baseAmount) || 0));
      } else {
        player.hp = Math.min(Number(player.maxHp || before), before + baseAmount * Math.max(1, Number(stats.healingMultiplier || 1)));
        amount = player.hp - before;
      }
      if (amount > 0) intents.push({ kind: 'heal', itemKey: 'generic_health_item', amount });
    }
    advanceCharge(player, 'insurance', 'insuranceChargeKills', 'insuranceReady', chargeRequirement(player, 9, stats), steps, intents);
    advanceCharge(player, 'keen_eye', 'keenEyeChargeKills', 'keenEyeReady', chargeRequirement(player, 10, stats), steps, intents);
    if (count(player, 'crit_charm') > 0) {
      player.critCharmChargeKills = Math.max(0, Number(player.critCharmChargeKills || 0)) + steps;
      if (player.critCharmChargeKills >= critCharmRequirement(player, options.difficulty, stats)) {
        player.critCharmChargeKills = 0;
        player.critCharmBuffTime = Math.max(Number(player.critCharmBuffTime || 0), 4);
        if (Number.isFinite(Number(options.currentTick))) {
          player.critCharmBuffUntilTick = Math.max(Number(player.critCharmBuffUntilTick || 0), Number(options.currentTick) + 4 * Number(options.tickRate || 20));
        }
        intents.push({ kind: 'surge', itemKey: 'crit_charm', duration: 4 });
      }
    }
    advanceCharge(player, 'chrono_spring', 'chronoSpringChargeKills', 'chronoSpringReady', chargeRequirement(player, 7, stats), steps, intents);
    advanceCharge(player, 'charged_adapter', 'escapeChargeKills', 'escapeReady', chargeRequirement(player, 20, stats), steps, intents);
    advanceCharge(player, 'robot_arm', 'robotArmChargeKills', 'robotArmReady', chargeRequirement(player, 8, stats), steps, intents);
    if (Number(player.scarfHealTime || 0) <= 0) {
      advanceCharge(player, 'hemes_scarf', 'scarfChargeKills', 'scarfHealReady', chargeRequirement(player, 10, stats), steps, intents);
    }
    return { ok: true, steps, intents };
  }

  function applyCampaignRevive(player, options = {}) {
    if (!player) return { ok: false, reason: 'NO_PLAYER' };
    const healthFraction = Math.max(0.01, Math.min(1, Number(options.healthFraction ?? 0.45)));
    player.downed = false;
    player.downedAtTick = null;
    player.reviveTicks = 0;
    player.reviveProgress = 0;
    player.hp = Math.max(1, Math.round(Number(player.maxHp || 100) * healthFraction));
    player.vx = 0;
    player.vy = 0;
    player.stun = 0;
    player.dashTime = 0;
    if (Number.isFinite(Number(options.currentTick))) {
      player.invulnerableUntilTick = Math.max(Number(player.invulnerableUntilTick || 0), Number(options.currentTick) + Math.round(Number(options.invulnerabilitySeconds || 0) * Number(options.tickRate || 20)));
    } else if (Number(options.invulnerabilitySeconds || 0) > 0) {
      player.inv = Math.max(Number(player.inv || 0), Number(options.invulnerabilitySeconds));
    }
    return { ok: true, type: 'PLAYER_REVIVED', health: player.hp, healthFraction };
  }

  // Insurance only saves a hero when a single damage transaction crosses the
  // half-health threshold. Keep its charge reset here so campaign and
  // authority cannot agree on the heal while disagreeing about the next kill
  // charge cycle.
  function applyCampaignInsuranceOnHit(player, options = {}) {
    if (!player) return { triggered: false, health: 0 };
    const getItemCount = typeof options.getItemCount === 'function'
      ? options.getItemCount
      : candidate => count(candidate, 'insurance');
    const healthBeforeHit = Math.max(0, Number(options.healthBeforeHit ?? player.hp ?? 0));
    const healthAfterHit = Math.max(0, Number(options.healthAfterHit ?? player.hp ?? 0));
    const halfHealth = Math.max(0, Number(player.maxHp || 0) * 0.5);
    const eligible = getItemCount(player) > 0
      && !!player.insuranceReady
      && healthBeforeHit > halfHealth
      && healthAfterHit <= halfHealth;
    if (!eligible) return { triggered: false, health: healthAfterHit };
    player.hp = Math.max(healthAfterHit, halfHealth);
    player.insuranceReady = false;
    player.insuranceChargeKills = 0;
    player.insuranceActive = false;
    return { triggered: true, health: player.hp, protectedHealth: halfHealth };
  }

  // Heme's Scarf rolls after a real, non-status damage hit and retaliates only
  // against a living, bleedable enemy. The caller supplies local entity lookup
  // and status rendering/application; the chance and eligibility are shared.
  function resolveCampaignHemesScarfRetaliation(player, attacker, options = {}) {
    const stats = options.itemStats || player?.itemStats || {};
    if (!player || Number(options.damageDealt || 0) <= 0 || options.noInvFrames) return null;
    const chance = Math.min(0.75, Math.max(0, Number(stats.scarfBleedsOnHit || 0)) * 0.25);
    if (chance <= 0) return null;
    const random = typeof options.random === 'function' ? options.random : deterministicRandom;
    if (random() >= chance) return null;
    if (!attacker || attacker.dead || attacker.bleedImmune) return null;
    return { kind: 'bleed', stacks: 1, duration: 4, chance };
  }

  // Heme's Scarf continuously tops up its short bleed on every eligible enemy.
  // God keeps the campaign's one-stack reduction; adapters own only their
  // status-storage representation and visual feedback.
  function getCampaignHemesScarfPassiveBleedStacks(enemy, itemStats = {}) {
    if (!enemy || enemy.dead || enemy.bleedImmune) return 0;
    const stacks = Math.max(0, Math.floor(Number(itemStats.passiveBleedStacks || 0)));
    if (stacks <= 0) return 0;
    return enemy.type === 'god' ? Math.max(1, stacks - 1) : stacks;
  }

  function advanceCampaignHemesScarfDrain(player, totalBleed, delta, options = {}) {
    const stats = options.itemStats || player?.itemStats || {};
    if (!player || Number(stats.bleedHealScale || 0) <= 0) return { started: false, active: false, heal: 0 };
    const bleed = Math.max(0, Number(totalBleed || 0));
    const duration = Math.max(0, Number(player.scarfHealTime || 0));
    let started = false;
    if (bleed > 0 && Number(player.hp || 0) < 50 && player.scarfHealReady && duration <= 0) {
      player.scarfHealReady = false;
      player.scarfHealTime = 3;
      started = true;
    }
    if (Number(player.scarfHealTime || 0) <= 0) return { started, active: false, heal: 0 };
    player.scarfHealTime = Math.max(0, Number(player.scarfHealTime || 0) - Math.max(0, Number(delta || 0)));
    if (bleed <= 0 || Number(player.hp || 0) >= Number(player.maxHp || 0)) return { started, active: true, heal: 0 };
    const raw = Math.min(Number(player.maxHp || 0) * 0.0003 * bleed * Number(stats.bleedHealScale || 0) * delta, Number(player.maxHp || 0) * 0.025 * delta);
    const heal = Math.max(0, raw * Math.max(1, Number(stats.healingMultiplier || 1)));
    const before = Number(player.hp || 0);
    player.hp = Math.min(Number(player.maxHp || before), before + heal);
    return { started, active: true, heal: player.hp - before };
  }

  function resolveCampaignKillAreaEffects(enemy, player, options = {}) {
    if (!enemy || !player) return [];
    const stats = options.itemStats || player.itemStats || {};
    const random = typeof options.random === 'function' ? options.random : deterministicRandom;
    const intents = [];
    const bleedStacks = Math.max(0, Number(options.deathBleedStacks || 0));
    const splashStacks = Math.max(0, Number(stats.bleedSplashStacks || 0));
    if (bleedStacks > 0 && splashStacks > 0) intents.push({
      kind: 'bleed_splash', x: Number(enemy.x || 0), y: Number(enemy.y || 0),
      radius: 92 + Math.min(70, bleedStacks * 8), stacks: splashStacks, duration: 4.5,
    });
    if (Number(stats.graveZoneChance || 0) > 0 && random() < Number(stats.graveZoneChance || 0)) intents.push({
      kind: 'grave_zone', x: Number(enemy.x || 0), y: Number(enemy.y || 0), radius: 118, duration: 2.5,
      pushPower: 340 * Math.max(0, Number(stats.moveSpeedMultiplier || 1)),
      damageTakenMultiplier: Math.max(1, Number(stats.graveZoneDamageTakenMultiplier || 1)),
    });
    return intents;
  }

  // Sarge's equipped hammer rewards a pair of non-tutorial kills made within
  // one second. Time is an adapter input so campaign seconds and authority
  // ticks share the same rearm/consume transaction.
  function resolveCampaignSargesHammerDoubleKill(player, options = {}) {
    if (!player || options.tutorialDummy || player.equippedWeapon !== 'sarges_hammer') return { triggered: false };
    const currentTime = Math.max(0, Number(options.currentTime || 0));
    const lastKillAt = Math.max(0, Number(player.sargesHammerLastKillAt || 0));
    const rearmUntil = Math.max(0, Number(player.sargesHammerRearmAt || 0));
    if (lastKillAt > 0 && currentTime - lastKillAt <= 1 && currentTime >= rearmUntil) {
      player.sargesHammerRearmAt = currentTime + 0.5;
      player.sargesHammerLastKillAt = 0;
      return { triggered: true, rearmUntil: player.sargesHammerRearmAt };
    }
    player.sargesHammerLastKillAt = currentTime;
    return { triggered: false, armedAt: currentTime };
  }

  // A concealed kill arms Moggy's Coat. The next encounter consumes that
  // charge to open with Dark Drain on every eligible enemy. Both runtimes own
  // their local status application, but this resolver is the canonical answer
  // to what the proc consumes and which enemies it affects.
  function resolveCampaignMoggysCoatOpening(player, enemies, options = {}) {
    if (!player?.moggysCoatPrimed) return { consumePrime: false, stacks: 0, duration: 0, targets: [] };
    const getItemCount = typeof options.getItemCount === 'function'
      ? options.getItemCount
      : candidate => count(candidate, 'moggys_coat');
    const isEligibleEnemy = typeof options.isEligibleEnemy === 'function'
      ? options.isEligibleEnemy
      : candidate => !!candidate && !candidate.dead;
    const stacks = Math.max(0, Number(getItemCount(player) || 0));
    const targets = stacks > 0 && Array.isArray(enemies)
      ? enemies.filter(isEligibleEnemy)
      : [];
    return { consumePrime: true, stacks, duration: 2, targets };
  }

  // These three relics resolve at the campaign's room-entry boundary. The
  // shared transaction owns state mutation; each runtime turns its returned
  // intents into HUD/audio/particle presentation. `firstReveal` is deliberately
  // supplied by the room authority, since reveal ownership is session-wide in
  // multiplayer while the campaign has a single hero.
  function resolveCampaignRoomEntryItemEffects(player, room, options = {}) {
    if (!player || !room) return { ok: false, intents: [] };
    const getItemCount = typeof options.getItemCount === 'function'
      ? options.getItemCount
      : (candidate, itemKey) => count(candidate, itemKey);
    const getPotionCarryCap = typeof options.getPotionCarryCap === 'function'
      ? options.getPotionCarryCap
      : candidate => {
        const stacks = Math.max(0, Number(getItemCount(candidate, 'mateos_bag') || 0));
        return stacks > 0 ? 3 + (stacks - 1) : 0;
      };
    const awardCoins = typeof options.awardCoins === 'function'
      ? options.awardCoins
      : amount => { player.coins = Math.max(0, Number(player.coins || 0)) + amount; };
    const floorNumber = Number(options.floorNumber || 0);
    const intents = [];

    if (options.firstReveal) {
      const stacks = Math.max(0, Number(getItemCount(player, 'naked_kings_last_penny') || 0));
      if (stacks > 0) {
        const amount = Math.round(7 * (1 + (stacks - 1) * 0.2));
        awardCoins(amount);
        intents.push({ kind: 'coins', itemKey: 'naked_kings_last_penny', amount, stacks });
      }
    }

    const pendantStacks = Math.max(0, Number(getItemCount(player, 'veggys_pendant') || 0));
    if (pendantStacks > 0) {
      player.veggysRoomCounter = Math.max(0, Number(player.veggysRoomCounter || 0)) + 1;
      if (player.veggysRoomCounter >= 3) {
        player.veggysRoomCounter = 0;
        const gain = pendantStacks * 0.10;
        const previousMaxHp = Math.max(1, Number(player.maxHp || 1));
        const previousHp = Math.max(0, Number(player.hp || 0));
        player.maxHp = Math.round(previousMaxHp * (1 + gain));
        player.hp = Math.min(player.maxHp, previousHp + (player.maxHp - previousMaxHp) * 0.5);
        intents.push({
          kind: 'max_hp', itemKey: 'veggys_pendant', stacks: pendantStacks,
          gain, previousMaxHp, maxHp: player.maxHp, healedAmount: Math.max(0, player.hp - previousHp),
        });
      }
    }

    const potionCap = Math.max(0, Number(getPotionCarryCap(player) || 0));
    if (potionCap > 0 && room.type === 'shop'
      && Number(player.storedPotions || 0) <= 0
      && player.mateosBagRefillFloor !== floorNumber) {
      player.storedPotions = 1;
      player.mateosBagRefillFloor = floorNumber;
      intents.push({ kind: 'stored_potion', itemKey: 'mateos_bag', storedPotions: 1, potionCap });
    }

    return { ok: true, intents };
  }

  // Room changes deliberately clear short-lived defensive movement. The
  // campaign stores those values as seconds while the authority stores expiry
  // ticks, so this adapter centralizes the semantic reset without forcing a
  // client renderer to imitate server state.
  function applyCampaignRoomEntryReset(player, options = {}) {
    if (!player) return { ok: false, cancelledBeam: false };
    const tickBased = !!options.tickBased;
    const currentTick = Math.max(0, Number(options.currentTick || 0));
    const cancelledBeam = !!player.beamChannel;
    player.vx = 0;
    player.vy = 0;
    player.roomDamageTaken = 0;
    player.blockActive = false;
    player.blockTimer = 0;
    if (tickBased) {
      player.invulnerableUntilTick = currentTick;
      player.stunnedUntilTick = currentTick;
      player.dashUntilTick = currentTick;
      player.dashVx = 0;
      player.dashVy = 0;
      const statusUntil = player.statusUntilTick || (player.statusUntilTick = {});
      ['cowards_way', 'mooggy_zoomies', 'flying_unhitable'].forEach(key => { statusUntil[key] = currentTick; });
    } else {
      player.inv = 0;
      player.stun = 0;
      player.dashTime = 0;
      player.dashX = 0;
      player.dashY = 0;
      player.cowardsWayTime = 0;
      player.mooggyZoomiesTime = 0;
      player.princessFlightTime = 0;
    }
    return { ok: true, cancelledBeam };
  }

  return {
    chargeRequirement, critCharmRequirement, applyCampaignKillCharge, applyCampaignRevive,
    resetGenericHealthRegen, advanceGenericHealthRegen,
    applyCampaignInsuranceOnHit, resolveCampaignHemesScarfRetaliation,
    getCampaignHemesScarfPassiveBleedStacks,
    advanceCampaignHemesScarfDrain,
    resolveCampaignKillAreaEffects, resolveCampaignSargesHammerDoubleKill, resolveCampaignMoggysCoatOpening,
    resolveCampaignRoomEntryItemEffects,
    applyCampaignRoomEntryReset,
  };
});
