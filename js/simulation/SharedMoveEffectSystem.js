(function initializeSharedMoveEffectSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedMoveEffectApi() {
  'use strict';

  // Turtle Boy's charged Power-Up is a single campaign effect: a self-centred
  // burst, an additive shell, and a timed attack/move-speed multiplier. Keep
  // all mutable state outside this pure policy so browser and authority can
  // adapt it without reimplementing the formulas.
  function resolveCampaignTurtlePowerUp(options = {}) {
    if (options.rival) {
      const maximum = Math.max(0, Number(options.maxHealth || options.maxHp || 0));
      const barrierBefore = Math.max(0, Number(options.barrier || 0));
      const barrierGain = Math.round(maximum * 0.5);
      return { chargeRatio: 1, radius: 0, damage: 0, barrierGain, barrier: barrierBefore + barrierGain, durationSeconds: 0, power: 0 };
    }
    const chargeRatio = Math.max(0, Math.min(1, Number(options.chargeRatio) || 0));
    const health = Math.max(0, Number(options.health || 0));
    const barrierBefore = Math.max(0, Number(options.barrier || 0));
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const barrierGain = Math.round(health * 0.25);
    return {
      chargeRatio,
      radius: (60 + chargeRatio * 40) * radiusMultiplier,
      damage: Math.max(1, Math.round((18 + chargeRatio * 26) * damageMultiplier)),
      barrierGain,
      barrier: barrierBefore + barrierGain,
      durationSeconds: 1.5 + chargeRatio * 4.5,
      power: 0.6 * (0.4 + chargeRatio * 0.6),
    };
  }

  function getCampaignTurtlePowerUpMultiplier(player, currentTick = 0) {
    if (Number(currentTick) >= Number(player?.turtlePowerUpUntilTick || 0)) return 1;
    return 1 + Math.max(0, Number(player?.turtlePowerUpPower || 0));
  }

  // Mooggy's rival weapon is a committed two-swipe combo, rather than a
  // generic single melee hit. The adapters own target lookup and animation;
  // this policy keeps the timing, follow-up damage and bleed payload aligned.
  function planCampaignRivalClawGauntlets(options = {}) {
    const baseDamage = Math.max(1, Number(options.baseDamage || 1));
    return {
      initialDamage: baseDamage,
      initialAngleOffset: -0.18,
      followupDelaySeconds: 0.12,
      followupDamage: Math.max(1, Math.round(baseDamage * 0.85)),
      followupAngleOffset: 0.18,
      rangePadding: 48,
      knockback: Math.max(0, Number(options.knockback || 260)),
      bleedStacks: 1,
      bleedDurationSeconds: 5,
      swingSeconds: 0.22,
    };
  }

  function planCampaignPotionBath(options = {}) {
    const maxHp = Math.max(1, Number(options.maxHp || 1));
    // Metao's hostile variant is deliberately a compact version of the same
    // authored bath: a 20% self-heal, five seconds of safety, and seven
    // outward bursts.  Keeping it in this planner means the campaign body and
    // the multiplayer authority cannot quietly diverge into unrelated heals.
    if (options.rival) {
      const baseDamage = Math.max(1, Number(options.baseDamage || 1));
      const randomAngle = typeof options.randomAngle === 'function' ? options.randomAngle : () => 0.5;
      const randomDistance = typeof options.randomDistance === 'function' ? options.randomDistance : () => 0.5;
      const burstCount = 7;
      return {
        immediateHeal: Math.round(maxHp * 0.2),
        regenHealPerPulse: 0,
        regenDurationSeconds: 0,
        regenIntervalSeconds: 0,
        statusResistanceSeconds: 0,
        invulnerabilitySeconds: 5,
        concealmentSeconds: 0,
        activeStatusCount: 0,
        sparkleBoost: 1,
        bursts: Array.from({ length: burstCount }, (_, index) => ({
          angle: index / burstCount * Math.PI * 2 + Number(randomAngle() || 0) * 0.4,
          distance: 40 + Math.max(0, Math.min(1, Number(randomDistance() || 0))) * 110,
          radius: 56,
          damage: baseDamage,
          visualRadius: 22,
          knockback: 100,
        })),
      };
    }
    const activeStatusCount = Math.max(0, Math.trunc(Number(options.activeStatusCount) || 0));
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const randomAngle = typeof options.randomAngle === 'function' ? options.randomAngle : () => 0.5;
    const randomDistance = typeof options.randomDistance === 'function' ? options.randomDistance : () => 0.5;
    const sparkleBoost = 1 + activeStatusCount * 0.35;
    const burstCount = 7 + Math.round(activeStatusCount * 1.5);
    const burstRadius = 56 * radiusMultiplier * (1 + activeStatusCount * 0.12);
    const bursts = Array.from({ length: burstCount }, (_, index) => ({
      angle: index / burstCount * Math.PI * 2 + Number(randomAngle() || 0) * 0.4,
      distance: 40 + Math.max(0, Math.min(1, Number(randomDistance() || 0))) * 110,
      radius: burstRadius,
      damage: Math.round(30 * damageMultiplier * sparkleBoost),
      visualRadius: 22 * radiusMultiplier * sparkleBoost,
    }));
    return {
      immediateHeal: Math.round(maxHp * 0.1),
      regenHealPerPulse: Math.max(1, Math.round(maxHp * 0.01)),
      regenDurationSeconds: 5,
      regenIntervalSeconds: 0.5,
      statusResistanceSeconds: 20,
      invulnerabilitySeconds: 5,
      concealmentSeconds: 5,
      activeStatusCount,
      sparkleBoost,
      bursts,
    };
  }

  function resolveCampaignHealingZone(options = {}) {
    if (options.rival) {
      return {
        // Rival Gelleh uses the pre-charged hostile-zone variant. Keeping the
        // complete payload here makes its campaign and authority adapters use
        // one cadence instead of drifting into separate generic smash logic.
        chargeRatio: 0.6,
        radius: 100,
        durationSeconds: 7.2,
        healPerSecond: 7.36 * 1.7,
        damagePerSecond: 20,
        pulseIntervalSeconds: 0.2,
      };
    }
    const chargeRatio = Math.max(0, Math.min(1, Number(options.chargeRatio) || 0));
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    return {
      chargeRatio,
      radius: 62 * radiusMultiplier * (1 + chargeRatio),
      durationSeconds: 4.8 * (1 + chargeRatio),
      healPerSecond: 7.36 * (1 + chargeRatio * 1.2),
      damagePerSecond: 10 * (1 + chargeRatio * 1.5),
      pulseIntervalSeconds: 0.5,
    };
  }

  function resolveCampaignFireCircle(options = {}) {
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    return {
      radius: 96 * radiusMultiplier,
      durationSeconds: 5.2,
      damagePerSecond: 18 * damageMultiplier,
      pulseIntervalSeconds: 0.5,
      fireDurationSeconds: 2.8,
    };
  }

  function resolveCampaignMooggySwipe(options = {}) {
    const chargeRatio = Math.max(0, Math.min(1, Number(options.chargeRatio) || 0));
    const baseDamage = (options.godMode ? 72 : 44) + Number(options.anvilDamage || 0);
    const baseRange = 130 + Number(options.anvilRange || 0);
    const baseKnockback = Math.max(0, Number(options.baseKnockback || 0));
    const itemBleedChance = Math.max(0, Number(options.itemBleedChance || 0));
    return {
      chargeRatio,
      damage: Math.max(1, Math.round(baseDamage * (1 + chargeRatio * 1.5))),
      range: baseRange * (1 + chargeRatio * 0.4),
      arc: Math.PI * (0.72 + chargeRatio * 0.28),
      knockback: baseKnockback * (1 + chargeRatio * 0.8),
      bleedChance: 0.12 + chargeRatio * 0.4 + itemBleedChance,
      bleedStacks: chargeRatio >= 0.99 ? 2 : 1,
      bleedDurationSeconds: 5,
      propArcBonus: 0.25,
      propDamage: 1,
      ringRadius: 28 * (1 + chargeRatio * 0.9),
      trauma: chargeRatio > 0.25 ? 0.12 + chargeRatio * 0.22 : 0,
    };
  }

  function resolveCampaignMooggyHairball(options = {}) {
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const rival = !!options.rival;
    return {
      radius: 132 * radiusMultiplier,
      damage: rival ? Math.max(1, Math.round(Number(options.baseDamage || 1) * damageMultiplier)) : Math.max(1, Math.round(34 * damageMultiplier)),
      knockback: rival ? 170 : 180,
      poisonStacks: 3,
      poisonDurationSeconds: 6,
      stunSeconds: rival ? 0 : 0.8,
      slowStacks: 1,
      slowDurationSeconds: rival ? 1.2 : 4,
    };
  }

  // Princess's unarmed Narwal Fight is a coupled close sweep and forward tusk
  // projectile. Keep both parts in one descriptor so neither runtime can turn
  // it into the generic melee fallback.
  function resolveCampaignNarwalFight() {
    return {
      sweep: { damage: 40, range: 136, arc: 1.45, knockback: 280 },
      projectile: {
        kind: 'narwal_fight', damage: 26, speed: 760, radius: 6,
        lifeSeconds: 0.92, knockback: 200, pierce: 2,
        hitOptions: { critBonus: 0.08 }, spawnDistance: 22,
      },
    };
  }

  function planCampaignFireballVolley(options = {}) {
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const baseDamage = Math.max(1, Number(options.baseDamage ?? 22));
    return {
      recoil: 150,
      projectiles: [-1, 0, 1].map(index => ({
        angleOffset: index * 0.18,
        kind: 'fireball', damage: Math.max(1, Math.round(baseDamage * damageMultiplier)), speed: 560, radius: 8, lifeSeconds: 1.6,
        splash: 48 * radiusMultiplier,
        splashDamage: Math.max(1, Math.round(baseDamage * 0.64 * damageMultiplier)),
        blockedSplashDamage: Math.max(1, Math.round(baseDamage * (16 / 22) * damageMultiplier)),
        // A direct impact carries the full burn; the blast spreads one stack
        // to every entity in its radius (including the directly-hit target).
        fireStacks: 2, splashFireStacks: 1, fireDurationSeconds: 3.4,
      })),
    };
  }

  function resolveCampaignSmite(options = {}) {
    const beamDamageMultiplier = Math.max(0, Number(options.beamDamageMultiplier ?? 1));
    return {
      stab: { damage: 20, range: 90, arc: 0.45, knockback: 220, destructibleDamage: 2, hitOptions: { lightning: true } },
      blade: {
        kind: 'blade_justice', damage: Math.max(1, Math.round((options.godMode ? 24 : 18) * beamDamageMultiplier)),
        speed: 820, radius: 7, lifeSeconds: 0.5, knockback: 80, pierce: 99,
        hitOptions: { lightning: true }, spawnDistance: 24,
      },
      chain: { range: 280, jumpRange: 170, count: 5, baseDamage: 18, stepDamage: 4, knockback: 90, hitOptions: { lightning: true } },
    };
  }

  function resolveCampaignUnarmedSlash(options = {}) {
    const anvilDamage = Number(options.anvilDamage || 0);
    const anvilRange = Number(options.anvilRange || 0);
    const thornBleedReach = options.characterKey === 'thorn_knight'
      ? Math.min(34, Math.max(0, Number(options.bleedTagCount || 0)) * 3)
      : 0;
    return {
      damage: (options.godMode ? 56 : 24) + anvilDamage,
      range: 72 + anvilRange + thornBleedReach,
      arc: 1.04, knockback: 340,
      bleedChance: 0.1, bleedStacks: 1, bleedDurationSeconds: 5,
      propDamage: 1,
    };
  }

  // Knave Blade in the melee slot — the bare-hands twin of Knave's weapon, used
  // when no weapon is equipped. Numbers mirror the authored weapon sweep (tight
  // arc, fast recovery, heavy bleed) so the move and the weapon never drift.
  function resolveCampaignKnaveBlade(options = {}) {
    const anvilDamage = Number(options.anvilDamage || 0);
    const anvilRange = Number(options.anvilRange || 0);
    return {
      damage: (options.godMode ? 72 : 36) + anvilDamage,
      range: 96 + anvilRange,
      arc: 1.10,
      knockback: 240,
      bleedChance: 0.35, bleedStacks: 2, bleedDurationSeconds: 5,
      propDamage: 1,
      propArcBonus: 0.35,
    };
  }

  function planCampaignMagentaP90Burst(options = {}) {
    const count = Math.max(1, Math.floor(Number(options.count ?? 5)));
    const delaySeconds = Math.max(0, Number(options.delaySeconds ?? 0.08));
    const spread = Math.max(0, Number(options.spread ?? 0.05));
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    const baseAngle = Number(options.aimDirection || 0);
    return Array.from({ length: count }, (_, index) => ({
      delaySeconds: index * delaySeconds,
      angle: baseAngle + (Math.max(0, Math.min(1, Number(random() || 0))) * 2 - 1) * spread,
    }));
  }

  function planCampaignDivineWeaponCombo(options = {}) {
    const weaponKey = options.weaponKey === 'katana_excalibur_777x' ? 'katana_excalibur_777x' : 'excalibur';
    const damage = Math.max(1, Math.round(Number(options.rawBaseDamage || 0) * 7.77 + Number(options.anvilDamage || 0)));
    const range = Math.max(10, Number(options.range || 120));
    const knockback = Math.max(0, Number(options.knockback || 0));
    const arc = weaponKey === 'excalibur' ? Math.PI : 0.6;
    const strikes = weaponKey === 'excalibur'
      ? [{ delaySeconds: 0, angleOffset: 0 }]
      : [
        { delaySeconds: 0, angleOffset: 0 },
        { delaySeconds: 0.05, angleOffset: Math.PI / 2 },
        { delaySeconds: 0.1, angleOffset: -Math.PI / 2 },
      ];
    return { weaponKey, damage, range, knockback, arc, rawDamage: true, strikes };
  }

  function resolveCampaignSargesHammerWeapon(options = {}) {
    return {
      kind: 'sarges_hammer',
      damage: Math.max(1, Number(options.damage || 64)),
      speed: 720, radius: 11, lifeSeconds: 0.75,
      knockback: Math.max(0, Number(options.knockback || 520)),
      pierce: 0, returning: true, lightning: true,
    };
  }

  function resolveCampaignLazerGlasses(options = {}) {
    const beamDamageMultiplier = Math.max(0, Number(options.beamDamageMultiplier ?? 1));
    const beamChainTargets = Math.max(0, Math.floor(Number(options.beamChainTargets || 0)));
    const beamChainDamageMultiplier = Math.max(0, Number(options.beamChainDamageMultiplier ?? 0.6));
    return {
      durationSeconds: 0.65,
      tickIntervalSeconds: 0.08,
      range: 430,
      bounces: 1,
      offsets: [-0.2, 0.2],
      damage: 9 * beamDamageMultiplier,
      knockback: 80,
      propDamage: 1,
      propPadding: 4,
      hitOptions: { fireChance: 0.05, fireStacks: 1, fireDuration: 3, beamFx: true },
      chainTargets: beamChainTargets,
      chainRange: 145,
      chainDamageMultiplier: beamChainDamageMultiplier,
      chainKnockback: 55,
    };
  }

  function resolveCampaignGoldenFleece(options = {}) {
    const maxHp = Math.max(1, Number(options.maxHp || 1));
    const healingMultiplier = Math.max(0.05, Number(options.healingMultiplier ?? 1));
    return {
      intervalSeconds: 2,
      healAmount: maxHp * 0.06 * healingMultiplier,
    };
  }

  function planCampaignConfiguredWeaponShot(options = {}) {
    const weaponKey = String(options.weaponKey || '');
    const tuning = weaponKey === 'magenta_degale'
      ? { maxSpread: 0.18, recoilBonus: 1.4 }
      : weaponKey === 'magenta_p90'
        ? { maxSpread: 0.14, recoilBonus: 1 }
        : { maxSpread: 0, recoilBonus: 0 };
    const speed = Math.hypot(Number(options.velocityX || 0), Number(options.velocityY || 0));
    const movementRatio = Math.max(0, Math.min(1, (speed - 24) / (228 - 24)));
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    const spread = tuning.maxSpread * movementRatio;
    return {
      angle: Number(options.aimDirection || 0) + (Math.max(0, Math.min(1, Number(random() || 0))) * 2 - 1) * spread,
      recoilMultiplier: 1 + tuning.recoilBonus * movementRatio,
      movementRatio,
      spread,
    };
  }

  // Crimson Smash and Hammer Smash share campaign's ordinary ground-slam body.
  // Catalog move stats are cooldown/UI metadata here; the live move has always
  // used ATTACKS.smash (46 damage, 148 radius) plus anvil/item modifiers.
  function planCampaignGroundSmash(options = {}) {
    const moveKey = options.moveKey === 'hammer_smash' ? 'hammer_smash' : 'crimson_smash';
    const rival = !!options.rival;
    const anvilDamage = Number(options.anvilDamage || 0);
    const anvilRange = Number(options.anvilRange || 0);
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    const damage = rival ? Math.max(1, Number(options.baseDamage || 1)) : (options.godMode ? 82 : 46) + anvilDamage;
    const radius = (rival ? 140 : 148 + anvilRange) * radiusMultiplier;
    const projectileDescriptors = [];
    if (moveKey === 'crimson_smash') {
      for (let index = 0; index < 8; index += 1) {
        projectileDescriptors.push({
          angle: Number(options.aimDirection || 0) + index / 8 * Math.PI * 2,
          spawnDistance: radius * 0.4,
          speed: 460 + Math.max(0, Math.min(1, Number(random() || 0))) * 120,
          radius: 7, lifeSeconds: 0.62, damage: Math.round(damage * 0.45), knockback: 200, pierce: 1,
          hitOptions: { bleedChance: 0.2, bleedStacks: 1, bleedDuration: 4 },
        });
      }
    } else {
      const rockPerSide = 1 + (Math.max(1, Math.trunc(Number(options.level || 1))) % 5);
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(angle => {
        for (let index = 0; index < rockPerSide; index += 1) {
          projectileDescriptors.push({
            angle,
            spawnDistance: radius * 0.4 + index * 18,
            speed: 505 + Math.max(0, Math.min(1, Number(random() || 0))) * 120,
            radius: 7, lifeSeconds: 0.6, damage: Math.round(damage * 0.4) + 1, knockback: 260, pierce: 1,
          });
        }
      });
    }
    return {
      moveKey, radius, damage, pvpDamage: 46 + anvilDamage, bleedBonus: 26,
      knockback: 320, destructibleDamage: 2,
      stunSeconds: moveKey === 'hammer_smash' ? 0.7 : 0,
      projectileDescriptors,
    };
  }

  // Blade Justice is a formation of persistent cursor-steered swords, not an
  // instant beam. The policy owns their authored formation and motion while
  // each runtime adapts contact candidates to its own entity store.
  function planCampaignBladeJustice(options = {}) {
    const beamDamageMultiplier = Math.max(0, Number(options.beamDamageMultiplier ?? 1));
    const baseDamage = Number.isFinite(Number(options.baseDamage)) ? Number(options.baseDamage)
      : (options.godMode ? 30 : 22) + Number(options.anvilDamage || 0);
    const aim = Number(options.aimDirection || 0);
    return {
      damage: Math.max(1, Math.round(baseDamage * beamDamageMultiplier)),
      durationSeconds: 2.1,
      count: 3,
      radius: 16,
      reach: 120,
      turnRate: 9,
      swingRate: 7.5,
      swingArc: 0.7,
      contactCooldownSeconds: 0.22,
      destructibleCooldownSeconds: 0.4,
      knockback: 180,
      destructibleDamage: 2,
      blades: Array.from({ length: 3 }, (_, index) => ({
        index,
        fanOffset: (index - 1) * 0.5,
        aim,
        swingPhase: index * 0.7,
      })),
    };
  }

  function advanceCampaignBladeJustice(blade, options = {}) {
    if (!blade) return { active: false };
    const effect = options.effect || planCampaignBladeJustice(options);
    const delta = Math.max(0, Number(options.delta) || 0);
    blade.life = Number(blade.life ?? effect.durationSeconds) - delta;
    if (blade.life <= 0) return { active: false };
    const targetAim = Number(options.aimDirection ?? blade.aim ?? 0);
    const currentAim = Number(blade.aim || 0);
    const difference = Math.atan2(Math.sin(targetAim - currentAim), Math.cos(targetAim - currentAim));
    blade.aim = currentAim + Math.max(-effect.turnRate * delta, Math.min(effect.turnRate * delta, difference));
    blade.swingPhase = Number(blade.swingPhase || 0) + delta * effect.swingRate;
    const swing = Math.sin(blade.swingPhase) * effect.swingArc;
    const direction = blade.aim + Number(blade.fanOffset || 0) + swing;
    const orbit = effect.reach * (0.82 + 0.18 * Math.cos(blade.swingPhase));
    blade.x = Number(options.playerX || 0) + Math.cos(direction) * orbit;
    blade.y = Number(options.playerY || 0) + Math.sin(direction) * orbit;
    blade.angle = direction + Math.sign(Math.cos(blade.swingPhase)) * 0.5;
    return { active: true, x: blade.x, y: blade.y, angle: blade.angle };
  }

  // Anthony's playable attacks mirror the three attacks on the boss: a
  // life-draining bite, an aimed knife throw, and a homing freeze ball.
  function resolveCampaignAntonyBite(options = {}) {
    const baseDamage = Math.max(1, Number(options.baseDamage ?? 30) + Number(options.anvilDamage || 0));
    return {
      damage: baseDamage,
      range: 86 + Number(options.anvilRange || 0),
      arc: 0.66,
      knockback: 240,
      darkDrainChance: 0.35,
      darkDrainStacks: 2,
      darkDrainDurationSeconds: 4.2,
    };
  }

  function planCampaignAntonyKnifeThrow(options = {}) {
    const beamMultiplier = Math.max(0, Number(options.beamDamageMultiplier ?? 1));
    const speedMultiplier = Math.max(0.1, Number(options.projectileSpeedMultiplier ?? 1));
    return {
      kind: 'antony_knife',
      damage: Math.max(1, Math.round(Number(options.baseDamage ?? 34) * beamMultiplier)),
      speed: 760 * speedMultiplier,
      radius: 7,
      lifeSeconds: 1.45,
      knockback: 150,
      pierceCount: 1,
    };
  }

  function planCampaignAntonyFreezeBall(options = {}) {
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const speedMultiplier = Math.max(0.1, Number(options.projectileSpeedMultiplier ?? 1));
    const baseDamage = Math.max(1, Number(options.baseDamage ?? 40));
    return {
      kind: 'cold_death',
      damage: Math.max(1, Math.round(baseDamage * damageMultiplier)),
      speed: 525 * speedMultiplier,
      radius: 38 * radiusMultiplier,
      lifeSeconds: 3.4,
      knockback: 230,
      splashRadius: 120 * radiusMultiplier,
      splashDamage: Math.max(1, Math.round(baseDamage * 0.65 * damageMultiplier)),
      slowStacks: 1,
      slowDurationSeconds: 4,
      splashSlowDurationSeconds: 3,
      homing: true,
      homingTarget: 'enemy',
      homingRadius: 700,
      homingTurnRate: 0.65,
      homingSpeed: 570 * speedMultiplier,
      homingAccel: 1.1,
    };
  }

  // Titan Hammer is a living summon rather than an instant smash.  The
  // authority owns its hit resolution, while both runtimes use this descriptor
  // and motion step so its reach, lifetime, steering, slams, and contact chip
  // damage stay authored in exactly one place.
  function resolveCampaignTitanHammer(options = {}) {
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const baseDamage = (options.godMode ? 90 : 70) + Number(options.anvilDamage || 0);
    const damage = Math.max(1, Math.round(baseDamage * damageMultiplier));
    return {
      damage,
      radius: Math.max(1, Number(options.smashRadius ?? 130) * radiusMultiplier * 0.75),
      durationSeconds: Math.max(0.05, Number(options.cooldownSeconds || 0) * 0.7),
      followRadius: 120,
      turnRate: 10,
      followRate: 12,
      swingCooldownSeconds: 1,
      swingDurationSeconds: 1 / 4.5,
      maxSwings: 2,
      slamKnockback: 300,
      pvpKnockback: 280,
      stunSeconds: 0.6,
      destructibleDamage: 2,
      contactRadiusMultiplier: 0.32,
      contactCooldownSeconds: 0.35,
      contactDamage: Math.max(1, Math.round(damage * 0.18)),
      contactKnockback: 120,
    };
  }

  function advanceCampaignTitanHammer(hammer, options = {}) {
    if (!hammer) return null;
    const delta = Math.max(0, Number(options.delta) || 0);
    const effect = options.effect || resolveCampaignTitanHammer(options);
    const playerX = Number(options.playerX ?? 0);
    const playerY = Number(options.playerY ?? 0);
    const targetAngle = Number(options.aimDirection ?? hammer.angle ?? 0);
    let difference = (targetAngle - Number(hammer.angle || 0) + Math.PI) % (Math.PI * 2) - Math.PI;
    if (difference < -Math.PI) difference += Math.PI * 2;
    const turn = Math.min(Math.abs(difference), effect.turnRate * delta);
    hammer.angle = Number(hammer.angle || 0) + Math.sign(difference) * turn;
    const targetX = playerX + Math.cos(hammer.angle) * effect.followRadius;
    const targetY = playerY + Math.sin(hammer.angle) * effect.followRadius;
    const follow = Math.min(1, delta * effect.followRate);
    hammer.x = Number(hammer.x || 0) + (targetX - Number(hammer.x || 0)) * follow;
    hammer.y = Number(hammer.y || 0) + (targetY - Number(hammer.y || 0)) * follow;
    hammer.life = Math.max(0, Number(hammer.life || 0) - delta);
    hammer.swingCooldown = Math.max(0, Number(hammer.swingCooldown || 0) - delta);
    hammer.swinging = Math.max(0, Number(hammer.swinging || 0) - delta / effect.swingDurationSeconds);
    return hammer;
  }

  // Floor Is Lava is a movement effect, not a follow-aura.  The campaign gives
  // the caster a short lava-walk window and leaves small, stationary puddles
  // behind at a fixed cadence.  Keep the authored numbers here so both the
  // frame-driven campaign and the tick-driven authority adapt one policy.
  function resolveCampaignFloorLava(options = {}) {
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    return {
      durationSeconds: 7.5,
      trailIntervalSeconds: 0.22,
      puddleRadius: 24 * radiusMultiplier,
      puddleDurationSeconds: 1.8,
      damagePerSecond: 14 * damageMultiplier,
      pulseIntervalSeconds: 0.05,
      statusIntervalSeconds: 0.45,
      fireDurationSeconds: 2.8,
    };
  }

  function advanceCampaignFloorLavaTrail(player, delta, options = {}) {
    if (!player || Number(player.lavaWalkTime || 0) <= 0) return { active: false, puddle: null };
    const effect = resolveCampaignFloorLava(options);
    const elapsed = Math.max(0, Number(delta) || 0);
    player.lavaWalkTime = Math.max(0, Number(player.lavaWalkTime || 0) - elapsed);
    player.lavaTrailTick = Number(player.lavaTrailTick || 0) - elapsed;
    if (player.lavaTrailTick > 0) return { active: true, puddle: null };
    player.lavaTrailTick = effect.trailIntervalSeconds;
    return { active: true, puddle: effect };
  }

  // Reservoir sampling is how campaign Random Pounce chooses up to eight
  // enemies without biasing toward the front of the room's entity list.
  function selectCampaignRandomPounceTargets(entities, limit = 8, random = () => 0.5) {
    const targets = [];
    let seen = 0;
    for (const entity of Array.isArray(entities) ? entities : []) {
      if (!entity || entity.dead) continue;
      seen += 1;
      if (targets.length < limit) {
        targets.push(entity);
        continue;
      }
      const replacement = Math.floor(Math.max(0, Math.min(0.999999, Number(random() || 0))) * seen);
      if (replacement < limit) targets[replacement] = entity;
    }
    return targets;
  }

  function planCampaignPounceVolley(options = {}, config = {}) {
    const originX = Number(options.originX || 0);
    const originY = Number(options.originY || 0);
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const anvilDamage = Number(options.anvilDamage || 0);
    const anvilRange = Number(options.anvilRange || 0);
    const godMode = !!options.godMode;
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    const projectileCount = Math.max(1, Math.floor(Number(config.projectileCount || 8)));
    const targets = selectCampaignRandomPounceTargets(options.entities, projectileCount, random);
    const burstBaseDamage = Number.isFinite(Number(options.burstBaseDamage))
      ? Number(options.burstBaseDamage)
      : godMode ? Number(config.godBurstDamage || 78) : Number(config.burstDamage || 52);
    const projectileBaseDamage = Number.isFinite(Number(options.projectileBaseDamage ?? options.fangBaseDamage))
      ? Number(options.projectileBaseDamage ?? options.fangBaseDamage)
      : godMode ? Number(config.godProjectileDamage || 34) : Number(config.projectileDamage || 24);
    return {
      radius: (Number(config.radius || 160) + anvilRange) * radiusMultiplier,
      burstBaseDamage,
      // Campaign applies the AOE item multiplier to the authored base, then
      // adds forge damage afterwards; do not fold the forge bonus into it.
      burstDamage: Math.round(burstBaseDamage * damageMultiplier) + anvilDamage,
      projectiles: Array.from({ length: projectileCount }, (_, index) => {
        const target = targets.length ? targets[index % targets.length] : null;
        const spreadAngle = index / projectileCount * Math.PI * 2;
        const baseAngle = target
          ? Math.atan2(Number(target.y) - originY, Number(target.x) - originX) + (Number(random() || 0) - 0.5) * 0.5
          : spreadAngle;
        return {
          target,
          targetId: target?.id || null,
          angle: baseAngle,
          speed: target ? Number(config.homingSpeed || 620) : Number(config.speed || 560),
          radius: Number(config.projectileRadius || 5),
          lifeSeconds: Number(config.lifeSeconds || 1.1),
          damage: Math.round(projectileBaseDamage * damageMultiplier) + anvilDamage,
          baseDamage: projectileBaseDamage,
          knockback: Number(config.knockback || 180),
          homing: !!target,
          homingRadius: Number(config.homingRadius || 380),
          homingSpeed: Number(config.homingTopSpeed || 680),
          homingAccel: Number(config.homingAccel || 4.2),
          homingTurnRate: Number(config.homingTurnRate || 3.8),
          hitOptions: { ...(config.hitOptions || {}) },
        };
      }),
    };
  }

  function planCampaignRandomPounce(options = {}) {
    const plan = planCampaignPounceVolley(options, {
      radius: 160, burstDamage: 52, godBurstDamage: 78,
      projectileCount: 8, projectileDamage: 24, godProjectileDamage: 34,
      projectileRadius: 5, speed: 560, homingSpeed: 620, homingTopSpeed: 680,
      lifeSeconds: 1.1, knockback: 180, homingRadius: 380,
      homingAccel: 4.2, homingTurnRate: 3.8,
      hitOptions: { bleedChance: 0.55, bleedStacks: 2, bleedDuration: 5, critBonus: 0.35 },
    });
    return { ...plan, bleedStacks: 2, bleedDurationSeconds: 5, fangs: plan.projectiles };
  }

  function planCampaignIntenseBiscuits(options = {}) {
    const plan = planCampaignPounceVolley(options, {
      radius: 105, burstDamage: 28, godBurstDamage: 42,
      projectileCount: 5, projectileDamage: 11, godProjectileDamage: 16,
      projectileRadius: 7, speed: 480, homingSpeed: 520, homingTopSpeed: 570,
      lifeSeconds: 1.05, knockback: 110, homingRadius: 310,
      homingAccel: 3.8, homingTurnRate: 3.5,
      hitOptions: { critBonus: 0.1 },
    });
    return {
      ...plan,
      biscuits: plan.projectiles,
      healMaxHpRatioPerTarget: 0.02,
      healMaxHpRatioCap: 0.08,
    };
  }

  function planCampaignNailShot(options = {}) {
    const baseDamage = Number.isFinite(Number(options.baseDamage)) ? Number(options.baseDamage) : 18 + Number(options.anvilDamage || 0);
    const damage = Math.max(1, Math.round(baseDamage
      * Math.max(0, Number(options.beamDamageMultiplier ?? 1))));
    const speed = 480 * Math.max(0, Number(options.projectileSpeedMultiplier ?? 1));
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    const extraBounces = Math.max(0, Math.floor(Number(options.extraBounces || 0)));
    return Array.from({ length: 12 }, (_, index) => ({
      angle: index / 12 * Math.PI * 2 + Number(random() || 0) * 0.22,
      damage, speed, radius: 3, lifeSeconds: 1.8, knockback: 80,
      bouncesRemaining: 3 + extraBounces,
      hitOptions: { bleedChance: 0.08, drainChanceBonus: 0.05 },
    }));
  }

  function planCampaignLaserShockwave(options = {}) {
    const wall = Math.max(0, Number(options.wall ?? 28));
    const roomHeight = Math.max(wall * 2 + 24, Number(options.roomHeight ?? 700));
    const x = Number(options.x || 0);
    const damage = 22 + Number(options.anvilDamage || 0);
    const top = wall + 12;
    const bottom = roomHeight - wall - 12;
    const step = 46;
    const spikes = [];
    for (let y = top; y <= bottom; y += step) {
      spikes.push({ x, y, radius: 18, lifeSeconds: 0.45, damage, knockback: 220, pierce: 99,
        hitOptions: { bleedChance: 0.15, bleedStacks: 1, bleedDuration: 4 } });
    }
    return { x, top, bottom, step, damage, spikes };
  }

  function resolveCampaignChaosBurst(options = {}) {
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const baseDamage = Math.max(1, Number(options.baseDamage ?? 18));
    return {
      fieldRadius: 180 * radiusMultiplier,
      durationSeconds: 1.8,
      intervalSeconds: 0.22,
      initialBurstCount: 4,
      burstRadius: 52 * radiusMultiplier,
      burstDamage: Math.round(baseDamage * damageMultiplier),
      poisonDurationSeconds: 4.8,
      fireDurationSeconds: 3.5,
    };
  }

  function planCampaignChaosEruption(options = {}) {
    const burst = resolveCampaignChaosBurst(options);
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    const angle = Number(random() || 0) * Math.PI * 2;
    const distance = 30 + Math.max(0, Math.min(1, Number(random() || 0))) * 150;
    return {
      x: Number(options.originX || 0) + Math.cos(angle) * distance,
      y: Number(options.originY || 0) + Math.sin(angle) * distance,
      radius: burst.burstRadius,
      damage: burst.burstDamage,
      poisonDurationSeconds: burst.poisonDurationSeconds,
      fireDurationSeconds: burst.fireDurationSeconds,
      isMetao: !!options.isMetao,
    };
  }

  function planCampaignHolyTurrets(options = {}) {
    const originX = Number(options.originX || 0);
    const originY = Number(options.originY || 0);
    const angle = Number(options.angle || 0);
    const edgePad = Math.max(0, Number(options.wall ?? 28)) + 16;
    const width = Math.max(edgePad * 2, Number(options.roomWidth ?? 900));
    const height = Math.max(edgePad * 2, Number(options.roomHeight ?? 700));
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const rival = !!options.rival;
    // 33% Holy Turrets nerf: the former 26 damage pulse rounds to 17.
    const baseDamage = Math.max(1, Number(options.baseDamage ?? 17));
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    return Array.from({ length: 3 }, (_, index) => {
      const turretAngle = angle + (index - 1) * 0.7;
      return {
        aimAngle: turretAngle,
        x: clamp(originX + Math.cos(turretAngle) * 74, edgePad, width - edgePad),
        y: clamp(originY + Math.sin(turretAngle) * 74, edgePad, height - edgePad),
        radius: 26,
        durationSeconds: rival ? 4.5 : 6,
        intervalSeconds: rival ? 0.9 : 0.6,
        range: rival ? 300 : 360,
        burstRadius: (rival ? 48 : 56) * radiusMultiplier,
        damage: Math.max(1, Math.round(baseDamage * damageMultiplier * (rival ? 0.6 : 1))),
      };
    });
  }

  function planCampaignLightningColumns(options = {}) {
    const x = Number(options.targetX ?? options.originX ?? 0);
    const y = Number(options.targetY ?? options.originY ?? 0);
    const angle = Number(options.angle || 0);
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    return [-42, 42].map(offset => ({
      x: x + Math.cos(angle + Math.PI / 2) * offset,
      y: y + Math.sin(angle + Math.PI / 2) * offset,
      radius: 54 * radiusMultiplier, durationSeconds: 4.5, intervalSeconds: 0.45, damage: 18,
    }));
  }

  // Sarge's Lightning Cross is two independent, room-spanning strike-line
  // hazards.  The planner owns every gameplay number so campaign, authority,
  // and provisional clients cannot turn it into a one-frame cross-shaped AOE.
  function planCampaignLightningCross(options = {}) {
    const originX = Number(options.originX || 0);
    const originY = Number(options.originY || 0);
    const roomWidth = Math.max(1, Number(options.roomWidth ?? 900));
    const roomHeight = Math.max(1, Number(options.roomHeight ?? 700));
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const beamDamageMultiplier = Math.max(0, Number(options.beamDamageMultiplier ?? 1));
    const damage = Math.max(1, Math.round((options.godMode ? 40 : 30) * damageMultiplier * beamDamageMultiplier));
    return {
      damage,
      radius: 26 * radiusMultiplier,
      warnSeconds: 0.5,
      intervalSeconds: 0.14,
      durationSeconds: 0.9,
      healPct: 0.01,
      knockback: 120,
      lines: [
        { x1: 0, y1: originY, x2: roomWidth, y2: originY },
        { x1: originX, y1: 0, x2: originX, y2: roomHeight },
      ],
    };
  }

  function planCampaignExcaliburStrike(options = {}) {
    const wall = Math.max(0, Number(options.wall ?? 28));
    const edgePad = wall + 24;
    const width = Math.max(edgePad * 2, Number(options.roomWidth ?? 900));
    const height = Math.max(edgePad * 2, Number(options.roomHeight ?? 700));
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const godMode = !!options.godMode;
    const baseDamage = Math.max(1, Number(options.baseDamage ?? (godMode ? 58 : 46)));
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    const nextRandom = () => Math.max(0, Math.min(1, Number(random() || 0)));
    const cx = clamp(Number(options.targetX ?? options.originX ?? 0), edgePad, width - edgePad);
    const cy = clamp(Number(options.targetY ?? options.originY ?? 0), edgePad, height - edgePad);
    const clusterRadius = 150 * radiusMultiplier;
    const damage = Math.round(baseDamage * damageMultiplier);
    return Array.from({ length: 5 }, (_, index) => {
      const angle = nextRandom() * Math.PI * 2;
      const distance = index === 0 ? 0 : 28 + nextRandom() * Math.max(0, clusterRadius - 28);
      const visualAngle = nextRandom() * Math.PI * 2;
      const spin = (nextRandom() < 0.5 ? -1 : 1) * (5 + nextRandom() * 3);
      return {
        x: clamp(cx + Math.cos(angle) * distance, edgePad, width - edgePad),
        y: clamp(cy + Math.sin(angle) * distance, edgePad, height - edgePad),
        delaySeconds: index * 0.07, fallSeconds: 0.34, hoverSeconds: 0.7, fadeSeconds: 0.3,
        phase: 'falling', angle: visualAngle, spin,
        radius: 76 * radiusMultiplier, damage,
      };
    });
  }

  function getCampaignKickyKickRoomDirection(angle) {
    const x = Math.cos(Number(angle || 0));
    const y = Math.sin(Number(angle || 0));
    if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'e' : 'w';
    return y >= 0 ? 's' : 'n';
  }

  function isCampaignKickyKickRoomMoveEligible(enemy, roomType) {
    const health = Number(enemy?.health ?? enemy?.hp ?? 0);
    if (!enemy || enemy.dead || health <= 0) return false;
    if (['boss', 'god', 'ladder', 'challenge'].includes(roomType)) return false;
    if (['rival', 'mirror_knight', 'boss_spawner'].includes(enemy.type)) return false;
    return !enemy.boss && !enemy.miniBoss && enemy.type !== 'god';
  }

  // The blast deliberately does not use the generic AOE damage multiplier:
  // campaign's Princess move is an authored 184 base plus forge bonus.  Keep
  // its knockback and doorway ejection together so every authority uses the
  // same rules and RNG consumption order.
  function resolveCampaignKickyKick(options = {}) {
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const rival = !!options.rival;
    return {
      radius: 138 * radiusMultiplier,
      damage: rival ? Math.max(1, Number(options.baseDamage || 1)) : 184 + Number(options.anvilDamage || 0),
      blastKnockback: rival ? 680 : 400,
      impulseKnockback: 1440,
      roomMoveChance: 0.1,
      playerRecoil: 260,
    };
  }

  function planCampaignKickyKickRoomTransfer(options = {}) {
    const enemy = options.enemy;
    if (!isCampaignKickyKickRoomMoveEligible(enemy, options.roomType)
      || (typeof options.isBossType === 'function' && options.isBossType(enemy.type))) return null;
    const direction = getCampaignKickyKickRoomDirection(Number(options.angle || 0));
    if (typeof options.hasExit === 'function' && !options.hasExit(direction)) return null;
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    if (Number(random() || 0) >= 0.1) return null;
    const opposite = { n: 's', s: 'n', e: 'w', w: 'e' }[direction] || 'n';
    const width = Math.max(1, Number(options.roomWidth ?? 900));
    const height = Math.max(1, Number(options.roomHeight ?? 700));
    const wall = Math.max(0, Number(options.wall ?? 28));
    const radius = Math.max(8, Number(enemy?.radius ?? enemy?.r ?? 15));
    const laneX = width / 2 + (Math.max(0, Math.min(1, Number(random() || 0))) * 68 - 34);
    const laneY = height / 2 + (Math.max(0, Math.min(1, Number(random() || 0))) * 68 - 34);
    const entryPoint = opposite === 'n'
      ? { x: laneX, y: wall + radius + 10 }
      : opposite === 's'
        ? { x: laneX, y: height - wall - radius - 10 }
        : opposite === 'e'
          ? { x: width - wall - radius - 10, y: laneY }
          : { x: wall + radius + 10, y: laneY };
    return { direction, entryDirection: opposite, entryPoint };
  }

  // Wall of Toph is deliberately more than an ordinary smash: its authored
  // slam, twelve rock shards, and temporary eight-wall ring must all agree
  // between the frame-driven campaign and the authoritative 20 Hz server.
  // The wall slots carry every inward candidate rather than choosing a point
  // here. Collision is a runtime boundary concern (browser rectangles versus
  // room-state obstacles), while this shared policy owns the exact spokes,
  // dimensions, lifetime, and search cadence.
  function planCampaignWallOfToph(options = {}) {
    const originX = Number(options.originX || 0);
    const originY = Number(options.originY || 0);
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const damageMultiplier = Math.max(0, Number(options.aoeDamageMultiplier ?? 1));
    const aoeRadius = (150 + Number(options.anvilRange || 0)) * radiusMultiplier;
    const slamDamage = Math.round((options.godMode ? 70 : 46) * damageMultiplier) + Number(options.anvilDamage || 0);
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    const halfW = 26;
    const halfH = 26;
    const barrierRadius = aoeRadius * 0.82;
    const minimumBarrierRadius = barrierRadius * 0.45;
    const barrier = {
      kind: 'cover_wall', w: halfW * 2, h: halfH * 2, r: Math.hypot(halfW, halfH),
      hp: 8, maxHp: 8, ttl: 8, clearRadius: Math.hypot(halfW, halfH) + 12,
    };
    const barriers = Array.from({ length: 8 }, (_, index) => {
      const angle = index / 8 * Math.PI * 2;
      const candidates = [];
      for (let radius = barrierRadius; radius >= minimumBarrierRadius; radius -= 12) {
        candidates.push({ x: originX + Math.cos(angle) * radius, y: originY + Math.sin(angle) * radius, radius });
      }
      return { ...barrier, angle, candidates };
    });
    return {
      aoeRadius,
      slamDamage,
      shards: Array.from({ length: 12 }, (_, index) => {
        const angle = index / 12 * Math.PI * 2;
        return {
          x: originX + Math.cos(angle) * (aoeRadius * 0.35),
          y: originY + Math.sin(angle) * (aoeRadius * 0.35),
          angle, speed: 440 + Math.max(0, Math.min(1, Number(random() || 0))) * 120,
          radius: 7, lifeSeconds: 0.6, damage: Math.round(slamDamage * 0.45), knockback: 200, pierce: 1,
          hitOptions: { bleedChance: 0.2, bleedStacks: 1, bleedDuration: 4 },
        };
      }),
      barriers,
    };
  }

  function resolveCampaignWallOfTophBarriers(plan, options = {}) {
    const playerRadius = Math.max(0, Number(options.playerRadius || 0));
    const originX = Number(options.originX || 0);
    const originY = Number(options.originY || 0);
    const isBlocked = typeof options.isBlocked === 'function' ? options.isBlocked : () => false;
    return (plan?.barriers || []).flatMap(slot => {
      const candidate = (slot.candidates || []).find(point => (
        Math.hypot(point.x - originX, point.y - originY) >= playerRadius + Number(slot.w || 0) / 2
        && !isBlocked(point.x, point.y, Number(slot.clearRadius || 0))
      ));
      if (!candidate) return [];
      return [{
        kind: slot.kind, x: candidate.x, y: candidate.y, w: slot.w, h: slot.h, r: slot.r,
        hp: slot.hp, maxHp: slot.maxHp, ttl: slot.ttl,
      }];
    });
  }

  return {
    resolveCampaignTurtlePowerUp,
    getCampaignTurtlePowerUpMultiplier,
    planCampaignRivalClawGauntlets,
    planCampaignPotionBath,
    resolveCampaignHealingZone,
    resolveCampaignFireCircle,
    resolveCampaignMooggySwipe,
    resolveCampaignMooggyHairball,
    resolveCampaignNarwalFight,
    planCampaignFireballVolley,
    resolveCampaignSmite,
    resolveCampaignUnarmedSlash,
    resolveCampaignKnaveBlade,
    planCampaignMagentaP90Burst,
    planCampaignDivineWeaponCombo,
    resolveCampaignSargesHammerWeapon,
    resolveCampaignLazerGlasses,
    resolveCampaignGoldenFleece,
    planCampaignConfiguredWeaponShot,
    planCampaignGroundSmash,
    planCampaignBladeJustice,
    advanceCampaignBladeJustice,
    resolveCampaignAntonyBite,
    planCampaignAntonyKnifeThrow,
    planCampaignAntonyFreezeBall,
    resolveCampaignTitanHammer,
    advanceCampaignTitanHammer,
    resolveCampaignFloorLava,
    advanceCampaignFloorLavaTrail,
    selectCampaignRandomPounceTargets,
    planCampaignRandomPounce,
    planCampaignIntenseBiscuits,
    planCampaignNailShot,
    planCampaignLaserShockwave,
    resolveCampaignChaosBurst,
    planCampaignChaosEruption,
    planCampaignHolyTurrets,
    planCampaignLightningColumns,
    planCampaignLightningCross,
    planCampaignExcaliburStrike,
    getCampaignKickyKickRoomDirection,
    isCampaignKickyKickRoomMoveEligible,
    resolveCampaignKickyKick,
    planCampaignKickyKickRoomTransfer,
    planCampaignWallOfToph,
    resolveCampaignWallOfTophBarriers,
  };
});
