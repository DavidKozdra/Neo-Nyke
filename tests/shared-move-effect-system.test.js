const {
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
  planCampaignMagentaP90Burst,
  planCampaignDivineWeaponCombo,
  resolveCampaignSargesHammerWeapon,
  resolveCampaignLazerGlasses,
  resolveCampaignGoldenFleece,
  planCampaignConfiguredWeaponShot,
  planCampaignGroundSmash,
  planCampaignBladeJustice,
  advanceCampaignBladeJustice,
  resolveCampaignTitanHammer,
  advanceCampaignTitanHammer,
  resolveCampaignFloorLava,
  advanceCampaignFloorLavaTrail,
  planCampaignRandomPounce,
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
} = require('../js/simulation/SharedMoveEffectSystem');

describe('shared campaign move effects', () => {
  test("resolves Turtle Power-Up's charged burst, additive shell, and timed power", () => {
    expect(resolveCampaignTurtlePowerUp({
      chargeRatio: 1,
      health: 80,
      barrier: 7,
      aoeRadiusMultiplier: 1.2,
      aoeDamageMultiplier: 1.5,
    })).toEqual({
      chargeRatio: 1,
      radius: 120,
      damage: 66,
      barrierGain: 20,
      barrier: 27,
      durationSeconds: 6,
      power: 0.6,
    });
    expect(getCampaignTurtlePowerUpMultiplier({ turtlePowerUpUntilTick: 40, turtlePowerUpPower: 0.6 }, 39)).toBeCloseTo(1.6);
    expect(getCampaignTurtlePowerUpMultiplier({ turtlePowerUpUntilTick: 40, turtlePowerUpPower: 0.6 }, 40)).toBe(1);
  });

  test('plans the rival Claw Gauntlets two-swipe timing, damage, and bleed payload', () => {
    expect(planCampaignRivalClawGauntlets({ baseDamage: 40, knockback: 260 })).toEqual({
      initialDamage: 40, initialAngleOffset: -0.18,
      followupDelaySeconds: 0.12, followupDamage: 34, followupAngleOffset: 0.18,
      rangePadding: 48, knockback: 260, bleedStacks: 1, bleedDurationSeconds: 5, swingSeconds: 0.22,
    });
  });

  test('plans Potion Bath cleanse rewards, regen, protection, and status-scaled bursts', () => {
    const bath = planCampaignPotionBath({
      maxHp: 120,
      activeStatusCount: 2,
      aoeRadiusMultiplier: 1.5,
      aoeDamageMultiplier: 1.2,
      randomAngle: () => 0.5,
      randomDistance: () => 0,
    });

    expect(bath).toEqual(expect.objectContaining({
      immediateHeal: 12,
      regenHealPerPulse: 1,
      regenDurationSeconds: 5,
      statusResistanceSeconds: 20,
      invulnerabilitySeconds: 5,
      concealmentSeconds: 5,
      activeStatusCount: 2,
    }));
    expect(bath.bursts).toHaveLength(10);
    expect(bath.bursts[0]).toEqual(expect.objectContaining({ radius: 104.16, damage: 61, distance: 40 }));
  });

  test('plans Metao rival Potion Bath from the same hostile heal and burst policy', () => {
    const bath = planCampaignPotionBath({
      rival: true, maxHp: 500, baseDamage: 42, randomAngle: () => 0, randomDistance: () => 0,
    });
    expect(bath).toEqual(expect.objectContaining({ immediateHeal: 100, invulnerabilitySeconds: 5, bursts: expect.any(Array) }));
    expect(bath.bursts).toHaveLength(7);
    expect(bath.bursts[0]).toEqual({ angle: 0, distance: 40, radius: 56, damage: 42, visualRadius: 22, knockback: 100 });
  });

  test('resolves Healing Zone charge into campaign radius, lifetime, and steady pulse rates', () => {
    const zone = resolveCampaignHealingZone({ chargeRatio: 1, aoeRadiusMultiplier: 1.25 });
    expect(zone).toEqual(expect.objectContaining({
      chargeRatio: 1, radius: 155, durationSeconds: 9.6, damagePerSecond: 25, pulseIntervalSeconds: 0.5,
    }));
    expect(zone.healPerSecond).toBeCloseTo(16.192);
    expect(resolveCampaignHealingZone({ rival: true })).toEqual(expect.objectContaining({
      radius: 100, durationSeconds: 7.2, healPerSecond: 12.512, damagePerSecond: 20, pulseIntervalSeconds: 0.2,
    }));
  });

  test('resolves Fire Circle as its campaign follow-aura rather than catalog burst values', () => {
    expect(resolveCampaignFireCircle({ aoeRadiusMultiplier: 1.25, aoeDamageMultiplier: 1.5 })).toEqual({
      radius: 120,
      durationSeconds: 5.2,
      damagePerSecond: 27,
      pulseIntervalSeconds: 0.5,
      fireDurationSeconds: 2.8,
    });
  });

  test('resolves Mooggy Swipe charge into the campaign damage, reach, arc, and bleed payload', () => {
    const swipe = resolveCampaignMooggySwipe({
      chargeRatio: 1, godMode: true, anvilDamage: 3, anvilRange: 10,
      baseKnockback: 200, itemBleedChance: 0.08,
    });
    expect(swipe).toEqual(expect.objectContaining({
      chargeRatio: 1, damage: 188, range: 196, arc: Math.PI,
      knockback: 360, bleedChance: 0.6, bleedStacks: 2, bleedDurationSeconds: 5,
    }));
    expect(swipe.ringRadius).toBeCloseTo(53.2);
    expect(swipe.trauma).toBeCloseTo(0.34);
  });

  test('resolves Mooggy Hairball through the campaign AOE and freeze payload', () => {
    expect(resolveCampaignMooggyHairball({ aoeRadiusMultiplier: 1.25, aoeDamageMultiplier: 1.5 })).toEqual({
      radius: 165, damage: 51, knockback: 180,
      poisonStacks: 3, poisonDurationSeconds: 6,
      stunSeconds: 0.8, slowStacks: 1, slowDurationSeconds: 4,
    });
  });

  test('plans Crimson and Hammer Smash from the authored ground-slam payload', () => {
    const crimson = planCampaignGroundSmash({
      moveKey: 'crimson_smash', godMode: true, anvilDamage: 5, anvilRange: 10,
      aoeRadiusMultiplier: 1.25, aimDirection: 0, random: () => 0,
    });
    expect(crimson).toEqual(expect.objectContaining({ radius: 197.5, damage: 87, pvpDamage: 51, knockback: 320, destructibleDamage: 2 }));
    expect(crimson.projectileDescriptors).toHaveLength(8);
    expect(crimson.projectileDescriptors[0]).toEqual(expect.objectContaining({ spawnDistance: 79, speed: 460, damage: 39, knockback: 200 }));
    const hammer = planCampaignGroundSmash({ moveKey: 'hammer_smash', level: 8, random: () => 1 });
    expect(hammer).toEqual(expect.objectContaining({ radius: 148, damage: 46, stunSeconds: 0.7 }));
    expect(hammer.projectileDescriptors).toHaveLength(16);
    expect(hammer.projectileDescriptors[0]).toEqual(expect.objectContaining({ speed: 625, damage: 19, knockback: 260 }));
  });

  test('plans and advances Blade Justice as three live cursor-steered swords', () => {
    const justice = planCampaignBladeJustice({
      godMode: true, anvilDamage: 3, beamDamageMultiplier: 1.5, aimDirection: 0,
    });
    expect(justice).toEqual(expect.objectContaining({
      damage: 50, durationSeconds: 2.1, count: 3, radius: 16, reach: 120,
      turnRate: 9, swingRate: 7.5, contactCooldownSeconds: 0.22,
    }));
    expect(justice.blades).toEqual([
      expect.objectContaining({ index: 0, fanOffset: -0.5, swingPhase: 0 }),
      expect.objectContaining({ index: 1, fanOffset: 0, swingPhase: 0.7 }),
      expect.objectContaining({ index: 2, fanOffset: 0.5, swingPhase: 1.4 }),
    ]);
    const blade = { ...justice.blades[1], life: justice.durationSeconds };
    const step = advanceCampaignBladeJustice(blade, {
      effect: justice, delta: 0.05, aimDirection: Math.PI / 2, playerX: 100, playerY: 200,
    });
    expect(step).toEqual(expect.objectContaining({ active: true }));
    expect(blade.aim).toBeCloseTo(0.45);
    expect(blade.life).toBeCloseTo(2.05);
    expect(blade.x).not.toBe(100);
    expect(blade.y).toBeGreaterThan(200);
  });

  test('resolves Titan Hammer as a live summon with shared steering and slam cadence', () => {
    const hammer = resolveCampaignTitanHammer({
      godMode: true, anvilDamage: 4, aoeDamageMultiplier: 1.5, aoeRadiusMultiplier: 1.25,
      smashRadius: 130, cooldownSeconds: 6,
    });
    expect(hammer).toEqual(expect.objectContaining({
      damage: 141, radius: 121.875, followRadius: 120,
      turnRate: 10, followRate: 12, maxSwings: 2, swingCooldownSeconds: 1,
      contactDamage: 25, contactCooldownSeconds: 0.35,
    }));
    expect(hammer.durationSeconds).toBeCloseTo(4.2);
    const live = { x: 0, y: 0, angle: 0, life: hammer.durationSeconds, swingCooldown: 1, swinging: 1 };
    advanceCampaignTitanHammer(live, { effect: hammer, delta: 0.05, playerX: 10, playerY: 20, aimDirection: Math.PI / 2 });
    expect(live.angle).toBeCloseTo(0.5);
    expect(live.life).toBeCloseTo(4.15);
    expect(live.swingCooldown).toBeCloseTo(0.95);
    expect(live.swinging).toBeCloseTo(0.775);
    expect(live.x).toBeCloseTo((10 + Math.cos(0.5) * 120) * 0.6);
    expect(live.y).toBeCloseTo((20 + Math.sin(0.5) * 120) * 0.6);
  });

  test('resolves Floor Is Lava as a timed immunity plus stationary trail puddles', () => {
    expect(resolveCampaignFloorLava({ aoeRadiusMultiplier: 1.25, aoeDamageMultiplier: 1.5 })).toEqual({
      durationSeconds: 7.5,
      trailIntervalSeconds: 0.22,
      puddleRadius: 30,
      puddleDurationSeconds: 1.8,
      damagePerSecond: 21,
      pulseIntervalSeconds: 0.05,
      statusIntervalSeconds: 0.45,
      fireDurationSeconds: 2.8,
    });
    const player = { lavaWalkTime: 7.5, lavaTrailTick: 0 };
    const first = advanceCampaignFloorLavaTrail(player, 0.05);
    expect(first.puddle).toEqual(expect.objectContaining({ puddleRadius: 24, damagePerSecond: 14 }));
    expect(player).toEqual(expect.objectContaining({ lavaWalkTime: 7.45, lavaTrailTick: 0.22 }));
    expect(advanceCampaignFloorLavaTrail(player, 0.05).puddle).toBeNull();
  });

  test('plans Random Pounce with its authored burst and target-preserving fang volley', () => {
    const entities = Array.from({ length: 9 }, (_, index) => ({ id: `enemy-${index + 1}`, x: 100 + index * 10, y: 0 }));
    const pounce = planCampaignRandomPounce({
      originX: 0, originY: 0, entities,
      aoeRadiusMultiplier: 1.25, aoeDamageMultiplier: 1.5,
      anvilDamage: 3, anvilRange: 8, godMode: true, random: () => 0,
    });
    expect(pounce).toEqual(expect.objectContaining({
      radius: 210, burstBaseDamage: 78, burstDamage: 120, bleedStacks: 2, bleedDurationSeconds: 5,
    }));
    expect(pounce.fangs).toHaveLength(8);
    expect(pounce.fangs[0]).toEqual(expect.objectContaining({
      targetId: 'enemy-9', speed: 620, damage: 54, baseDamage: 34,
      homing: true, homingRadius: 380,
      hitOptions: expect.objectContaining({ critBonus: 0.35, bleedChance: 0.55 }),
    }));
  });

  test('plans Nail Shot as the campaign twelve-nail ricochet ring', () => {
    const nails = planCampaignNailShot({ anvilDamage: 2, beamDamageMultiplier: 1.5, projectileSpeedMultiplier: 1.25, extraBounces: 2, random: () => 0 });
    expect(nails).toHaveLength(12);
    expect(nails[0]).toEqual(expect.objectContaining({
      angle: 0, damage: 30, speed: 600, radius: 3, lifeSeconds: 1.8,
      knockback: 80, bouncesRemaining: 5,
      hitOptions: expect.objectContaining({ bleedChance: 0.08, drainChanceBonus: 0.05 }),
    }));
    expect(nails[6].angle).toBeCloseTo(Math.PI);
  });

  test('plans Laser Shockwave as the campaign full-height stationary rock column', () => {
    const shockwave = planCampaignLaserShockwave({ x: 300, wall: 28, roomHeight: 700, anvilDamage: 3 });
    expect(shockwave).toEqual(expect.objectContaining({ x: 300, top: 40, bottom: 660, step: 46, damage: 25 }));
    expect(shockwave.spikes).toHaveLength(14);
    expect(shockwave.spikes[0]).toEqual(expect.objectContaining({ x: 300, y: 40, radius: 18, lifeSeconds: 0.45, damage: 25, pierce: 99 }));
    expect(shockwave.spikes.at(-1).y).toBe(638);
  });

  test('resolves Chaos Burst into campaign follow-field timing and eruptions', () => {
    expect(resolveCampaignChaosBurst({ aoeRadiusMultiplier: 1.25, aoeDamageMultiplier: 1.5 })).toEqual(expect.objectContaining({
      fieldRadius: 225, durationSeconds: 1.8, intervalSeconds: 0.22, initialBurstCount: 4, burstRadius: 65, burstDamage: 27,
    }));
    expect(planCampaignChaosEruption({ originX: 10, originY: 20, aoeRadiusMultiplier: 1.25, aoeDamageMultiplier: 1.5, isMetao: true, random: () => 0 }))
      .toEqual(expect.objectContaining({ x: 40, y: 20, radius: 65, damage: 27, isMetao: true }));
    expect(resolveCampaignChaosBurst({ baseDamage: 25 })).toEqual(expect.objectContaining({ burstDamage: 25 }));
  });

  test('plans Holy Turrets with campaign edge clamping and scaled pulses', () => {
    expect(planCampaignHolyTurrets({})[0].damage).toBe(17);
    const turrets = planCampaignHolyTurrets({
      originX: 30, originY: 30, angle: Math.PI, wall: 28, roomWidth: 900, roomHeight: 700,
      aoeRadiusMultiplier: 1.25, aoeDamageMultiplier: 1.5, baseDamage: 40,
    });
    expect(turrets).toHaveLength(3);
    expect(turrets.every(turret => turret.x >= 44 && turret.y >= 44)).toBe(true);
    expect(turrets[1]).toEqual(expect.objectContaining({ radius: 26, durationSeconds: 6, intervalSeconds: 0.6, range: 360, burstRadius: 70, damage: 60 }));
  });

  test('plans Lightning Columns at the aimed target rather than caster range', () => {
    expect(planCampaignLightningColumns({ targetX: 400, targetY: 250, angle: 0, aoeRadiusMultiplier: 1.25 })).toEqual([
      expect.objectContaining({ x: 400, y: 208, radius: 67.5, durationSeconds: 4.5, intervalSeconds: 0.45, damage: 18 }),
      expect.objectContaining({ x: 400, y: 292, radius: 67.5 }),
    ]);
  });

  test('plans Lightning Cross as two telegraphed room-spanning strike lines', () => {
    const cross = planCampaignLightningCross({
      originX: 320, originY: 280, roomWidth: 960, roomHeight: 720, godMode: true,
      aoeRadiusMultiplier: 1.25, aoeDamageMultiplier: 1.5, beamDamageMultiplier: 1.2,
    });
    expect(cross).toEqual(expect.objectContaining({
      damage: 72, radius: 32.5, warnSeconds: 0.5, intervalSeconds: 0.14,
      durationSeconds: 0.9, healPct: 0.01, knockback: 120,
    }));
    expect(cross.lines).toEqual([
      { x1: 0, y1: 280, x2: 960, y2: 280 },
      { x1: 320, y1: 0, x2: 320, y2: 720 },
    ]);
  });

  test('plans Excalibur Strike as five staggered, clamped sword impacts', () => {
    const swords = planCampaignExcaliburStrike({
      targetX: 10, targetY: 10, wall: 28, roomWidth: 900, roomHeight: 700,
      aoeRadiusMultiplier: 1.25, aoeDamageMultiplier: 1.5, baseDamage: 40, random: () => 0,
    });
    expect(swords).toHaveLength(5);
    expect(swords[0]).toEqual(expect.objectContaining({
      x: 52, y: 52, delaySeconds: 0, fallSeconds: 0.34, hoverSeconds: 0.7, fadeSeconds: 0.3,
      phase: 'falling', angle: 0, spin: -5, radius: 95, damage: 60,
    }));
    expect(swords[4].delaySeconds).toBeCloseTo(0.28);
  });

  test('keeps Narwal Fight’s close sweep and forward tusk in one policy', () => {
    expect(resolveCampaignNarwalFight()).toEqual({
      sweep: { damage: 40, range: 136, arc: 1.45, knockback: 280 },
      projectile: expect.objectContaining({
        kind: 'narwal_fight', damage: 26, speed: 760, radius: 6,
        lifeSeconds: 0.92, knockback: 200, pierce: 2, spawnDistance: 22,
        hitOptions: { critBonus: 0.08 },
      }),
    });
  });

  test('plans the three-shot fireball volley with item-scaled splash and one recoil', () => {
    const volley = planCampaignFireballVolley({ aoeRadiusMultiplier: 1.25, aoeDamageMultiplier: 1.5 });
    expect(volley.recoil).toBe(150);
    expect(volley.projectiles).toEqual([
      expect.objectContaining({ angleOffset: -0.18, splash: 60, splashDamage: 21, blockedSplashDamage: 24, fireStacks: 2, splashFireStacks: 1 }),
      expect.objectContaining({ angleOffset: 0, splash: 60, splashDamage: 21, blockedSplashDamage: 24, fireStacks: 2, splashFireStacks: 1 }),
      expect.objectContaining({ angleOffset: 0.18, splash: 60, splashDamage: 21, blockedSplashDamage: 24, fireStacks: 2, splashFireStacks: 1 }),
    ]);
    expect(planCampaignFireballVolley({ baseDamage: 37 }).projectiles[0])
      .toEqual(expect.objectContaining({ damage: 37, splashDamage: 24, blockedSplashDamage: 27 }));
  });

  test('keeps Smite’s stab, beam-scaled blade, and destructible-capable chain together', () => {
    expect(resolveCampaignSmite({ godMode: true, beamDamageMultiplier: 1.5 })).toEqual(expect.objectContaining({
      stab: { damage: 20, range: 90, arc: 0.45, knockback: 220, destructibleDamage: 2, hitOptions: { lightning: true } },
      blade: expect.objectContaining({ damage: 36, speed: 820, radius: 7, lifeSeconds: 0.5, knockback: 80, pierce: 99, spawnDistance: 24 }),
      chain: { range: 280, jumpRange: 170, count: 5, baseDamage: 18, stepDamage: 4, knockback: 90, hitOptions: { lightning: true } },
    }));
  });

  test('uses the campaign Slash baseline instead of the move-catalog display stats', () => {
    expect(resolveCampaignUnarmedSlash({
      godMode: true, anvilDamage: 3, anvilRange: 5, characterKey: 'thorn_knight', bleedTagCount: 20,
    })).toEqual(expect.objectContaining({ damage: 59, range: 111, arc: 1.04, knockback: 340, bleedChance: 0.1 }));
  });

  test('plans Magenta P90 as five staggered seeded shots', () => {
    const shots = planCampaignMagentaP90Burst({ aimDirection: 1, random: () => 1 });
    expect(shots).toHaveLength(5);
    expect(shots).toEqual(expect.arrayContaining([
      { delaySeconds: 0, angle: 1.05 },
      { delaySeconds: 0.32, angle: 1.05 },
    ]));
  });

  test('plans Excalibur and Katana as raw-damage divine sweep combos', () => {
    expect(planCampaignDivineWeaponCombo({ weaponKey: 'excalibur', rawBaseDamage: 30, anvilDamage: 2, range: 120, knockback: 600 }))
      .toEqual(expect.objectContaining({ damage: 235, arc: Math.PI, rawDamage: true, strikes: [{ delaySeconds: 0, angleOffset: 0 }] }));
    expect(planCampaignDivineWeaponCombo({ weaponKey: 'katana_excalibur_777x', rawBaseDamage: 30, range: 130, knockback: 380 }))
      .toEqual(expect.objectContaining({ arc: 0.6, strikes: [
        { delaySeconds: 0, angleOffset: 0 },
        { delaySeconds: 0.05, angleOffset: Math.PI / 2 },
        { delaySeconds: 0.1, angleOffset: -Math.PI / 2 },
      ] }));
  });

  test('keeps Sarge’s equipped hammer as the campaign returning lightning weapon', () => {
    expect(resolveCampaignSargesHammerWeapon({ damage: 70, knockback: 540 })).toEqual({
      kind: 'sarges_hammer', damage: 70, speed: 720, radius: 11, lifeSeconds: 0.75,
      knockback: 540, pierce: 0, returning: true, lightning: true,
    });
  });

  test('keeps Lazer Glasses’ twin bouncing beam, fire proc, and chains in one policy', () => {
    expect(resolveCampaignLazerGlasses({
      beamDamageMultiplier: 1.5, beamChainTargets: 2, beamChainDamageMultiplier: 0.7,
    })).toEqual(expect.objectContaining({
      durationSeconds: 0.65, tickIntervalSeconds: 0.08, range: 430, bounces: 1,
      offsets: [-0.2, 0.2], damage: 13.5, knockback: 80,
      propDamage: 1, propPadding: 4, chainTargets: 2, chainRange: 145,
      chainDamageMultiplier: 0.7, chainKnockback: 55,
      hitOptions: { fireChance: 0.05, fireStacks: 1, fireDuration: 3, beamFx: true },
    }));
  });

  test('keeps Golden Fleece’s equipped healing pulse on the campaign timing', () => {
    expect(resolveCampaignGoldenFleece({ maxHp: 150, healingMultiplier: 1.2 }))
      .toEqual({ intervalSeconds: 2, healAmount: 10.799999999999999 });
  });

  test('keeps moving DeGale and P90 spread/recoil in the shared projectile-shot policy', () => {
    expect(planCampaignConfiguredWeaponShot({
      weaponKey: 'magenta_degale', aimDirection: 1, velocityX: 228, random: () => 1,
    })).toEqual({ angle: 1.18, recoilMultiplier: 2.4, movementRatio: 1, spread: 0.18 });
    expect(planCampaignConfiguredWeaponShot({ weaponKey: 'magenta_p90', aimDirection: 1, velocityX: 0, random: () => 1 }))
      .toEqual({ angle: 1, recoilMultiplier: 1, movementRatio: 0, spread: 0 });
  });

  test('resolves Kicky Kick as its direct blast, double shove, and doorway ejection', () => {
    expect(resolveCampaignKickyKick({ aoeRadiusMultiplier: 1.25, anvilDamage: 6 })).toEqual({
      radius: 172.5, damage: 190, blastKnockback: 400, impulseKnockback: 1440,
      roomMoveChance: 0.1, playerRecoil: 260,
    });
    expect(resolveCampaignKickyKick({ rival: true, baseDamage: 56 })).toEqual(expect.objectContaining({
      radius: 138, damage: 56, blastKnockback: 680, playerRecoil: 260,
    }));
    expect(getCampaignKickyKickRoomDirection(Math.PI / 4)).toBe('e');
    expect(isCampaignKickyKickRoomMoveEligible({ health: 100, type: 'hunter' }, 'combat')).toBe(true);
    expect(isCampaignKickyKickRoomMoveEligible({ health: 100, type: 'hunter', boss: true }, 'combat')).toBe(false);
    const values = [0, 0, 1];
    expect(planCampaignKickyKickRoomTransfer({
      enemy: { health: 100, type: 'hunter', radius: 15 }, angle: 0, roomType: 'combat',
      hasExit: direction => direction === 'e', roomWidth: 900, roomHeight: 700, wall: 28,
      random: () => values.shift(),
    })).toEqual({ direction: 'e', entryDirection: 'w', entryPoint: { x: 53, y: 384 } });
    expect(planCampaignKickyKickRoomTransfer({
      enemy: { health: 100, type: 'authored_boss' }, angle: 0, roomType: 'combat',
      hasExit: () => true, isBossType: type => type === 'authored_boss',
    })).toBeNull();
    expect(planCampaignKickyKickRoomTransfer({
      enemy: { health: 100, type: 'rival', radius: 15 }, angle: 0, roomType: 'combat', hasExit: () => true,
    })).toBeNull();
  });

  test('plans Wall of Toph as a campaign slam, shard ring, and wall-clearing barrier spokes', () => {
    const wall = planCampaignWallOfToph({
      originX: 100, originY: 200, anvilDamage: 3, anvilRange: 10,
      aoeRadiusMultiplier: 1.25, aoeDamageMultiplier: 1.5, godMode: true, random: () => 0,
    });
    expect(wall).toEqual(expect.objectContaining({ aoeRadius: 200, slamDamage: 108 }));
    expect(wall.shards).toHaveLength(12);
    expect(wall.shards[0]).toEqual(expect.objectContaining({
      x: 170, y: 200, angle: 0, speed: 440, radius: 7, lifeSeconds: 0.6,
      damage: 49, knockback: 200, pierce: 1,
      hitOptions: expect.objectContaining({ bleedChance: 0.2, bleedStacks: 1, bleedDuration: 4 }),
    }));
    expect(wall.barriers).toHaveLength(8);
    expect(wall.barriers[0]).toEqual(expect.objectContaining({ kind: 'cover_wall', w: 52, h: 52, hp: 8, maxHp: 8, ttl: 8 }));
    expect(wall.barriers[0].candidates.map(point => point.radius)).toEqual([164, 152, 140, 128, 116, 104, 92, 80]);

    const barriers = resolveCampaignWallOfTophBarriers(wall, {
      originX: 100, originY: 200, playerRadius: 18,
      // Force the east spoke to take its first legal inward slot while all
      // other spokes retain their authored outer-ring placement.
      isBlocked: (x, y) => y === 200 && x > 250,
    });
    expect(barriers).toHaveLength(8);
    expect(barriers[0]).toEqual(expect.objectContaining({ x: 240, y: 200, kind: 'cover_wall', ttl: 8 }));
  });
});
