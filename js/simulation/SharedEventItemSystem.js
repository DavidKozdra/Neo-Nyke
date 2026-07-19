(function initializeSharedEventItemSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEventItemApi() {
  'use strict';

  const count = (player, key) => Math.max(0, Math.floor(Number(player?.items?.[key] || 0)));

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
    const random = typeof options.random === 'function' ? options.random : Math.random;
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

  return { chargeRequirement, critCharmRequirement, applyCampaignKillCharge, applyCampaignRevive };
});
