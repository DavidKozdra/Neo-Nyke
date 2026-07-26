const { applyCampaignKillCharge, chargeRequirement, applyCampaignRevive, applyCampaignInsuranceOnHit, resolveCampaignHemesScarfRetaliation, getCampaignHemesScarfPassiveBleedStacks, advanceCampaignHemesScarfDrain, resolveCampaignKillAreaEffects, resolveCampaignSargesHammerDoubleKill, resolveCampaignMoggysCoatOpening, resolveCampaignRoomEntryItemEffects, applyCampaignRoomEntryReset } = require('../js/simulation/SharedEventItemSystem.js');
const { getCampaignPotionCarryCap } = require('../js/simulation/SharedPotionSystem.js');

describe('SharedEventItemSystem kill transactions', () => {
  test('advances every campaign charge item from one kill event', () => {
    const player = {
      hp: 50, maxHp: 100,
      items: { insurance: 1, keen_eye: 1, chrono_spring: 1, charged_adapter: 1, robot_arm: 1, hemes_scarf: 1 },
      insuranceChargeKills: 7,
      keenEyeChargeKills: 8,
      chronoSpringChargeKills: 5,
      escapeChargeKills: 18,
      robotArmChargeKills: 6,
      scarfChargeKills: 8,
    };
    const result = applyCampaignKillCharge(player, {
      itemStats: { overclockedWatchChance: 1, chargeSynergyReduction: 0 },
      random: () => 0,
    });
    expect(result.steps).toBe(2);
    expect(result.intents.filter(intent => intent.kind === 'ready').map(intent => intent.itemKey)).toEqual(
      ['insurance', 'keen_eye', 'chrono_spring', 'charged_adapter', 'robot_arm', 'hemes_scarf'],
    );
  });

  test('applies kill healing and difficulty-scaled crit surge canonically', () => {
    const player = { hp: 40, maxHp: 100, items: { generic_health_item: 2, crit_charm: 1 }, critCharmChargeKills: 2 };
    const result = applyCampaignKillCharge(player, {
      itemStats: { genericHealthItemHealRatio: 0.1, healingMultiplier: 1.5 },
      difficulty: 'easy', currentTick: 20, tickRate: 20, random: () => 1,
    });
    expect(player.hp).toBe(46);
    expect(player.critCharmBuffTime).toBe(4);
    expect(player.critCharmBuffUntilTick).toBe(100);
    expect(result.intents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'heal', amount: 6 }),
      expect.objectContaining({ kind: 'surge', itemKey: 'crit_charm' }),
    ]));
  });

  test('charge requirement shares adapter and tag synergy reductions', () => {
    expect(chargeRequirement({ items: { charged_adapter: 2 } }, 10, { chargeSynergyReduction: 2 })).toBe(6);
  });

  test('shares Sarge hammer double-kill arming, rearm, and tutorial exclusion', () => {
    const player = { equippedWeapon: 'sarges_hammer' };
    expect(resolveCampaignSargesHammerDoubleKill(player, { currentTime: 2 })).toEqual({ triggered: false, armedAt: 2 });
    expect(resolveCampaignSargesHammerDoubleKill(player, { currentTime: 2.8 })).toEqual({ triggered: true, rearmUntil: 3.3 });
    expect(player).toEqual(expect.objectContaining({ sargesHammerLastKillAt: 0, sargesHammerRearmAt: 3.3 }));
    expect(resolveCampaignSargesHammerDoubleKill(player, { currentTime: 3, tutorialDummy: true })).toEqual({ triggered: false });
    expect(player.sargesHammerLastKillAt).toBe(0);
  });

  test('revive state reset is identical for local, co-op, and rival fractions', () => {
    const target = { maxHp: 120, hp: 0, downed: true, downedAtTick: 4, reviveTicks: 20, reviveProgress: 0.5, vx: 8, vy: -2, stun: 1, dashTime: 0.4 };
    expect(applyCampaignRevive(target, { healthFraction: 0.4, currentTick: 100, tickRate: 20, invulnerabilitySeconds: 1.5 })).toMatchObject({ ok: true, health: 48 });
    expect(target).toEqual(expect.objectContaining({ downed: false, hp: 48, vx: 0, vy: 0, stun: 0, dashTime: 0, invulnerableUntilTick: 130 }));
  });

  test('plans campaign Bleed splash and Grave Zone from the same kill event', () => {
    const intents = resolveCampaignKillAreaEffects(
      { x: 400, y: 250 },
      { itemStats: { bleedSplashStacks: 2, graveZoneChance: 1, moveSpeedMultiplier: 1.2, graveZoneDamageTakenMultiplier: 1.32 } },
      { deathBleedStacks: 4, random: () => 0 },
    );
    expect(intents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'bleed_splash', x: 400, y: 250, radius: 124, stacks: 2, duration: 4.5 }),
      expect.objectContaining({ kind: 'grave_zone', radius: 118, duration: 2.5, pushPower: 408, damageTakenMultiplier: 1.32 }),
    ]));
  });

  test("plans Moggy's Coat's exact one-encounter Dark Drain opening", () => {
    const targets = [{ id: 'live' }, { id: 'dead', dead: true }, { id: 'friend', rivalFriend: true }];
    const opening = resolveCampaignMoggysCoatOpening(
      { moggysCoatPrimed: true, items: { moggys_coat: 2 } },
      targets,
      { isEligibleEnemy: enemy => !enemy.dead && !enemy.rivalFriend },
    );
    expect(opening).toEqual(expect.objectContaining({ consumePrime: true, stacks: 2, duration: 2, targets: [targets[0]] }));
    expect(resolveCampaignMoggysCoatOpening({ moggysCoatPrimed: false, items: { moggys_coat: 2 } }, targets))
      .toEqual({ consumePrime: false, stacks: 0, duration: 0, targets: [] });
  });

  test('resolves Insurance and Heme\'s Scarf from the same campaign hit facts', () => {
    const insured = { maxHp: 100, hp: 20, insuranceReady: true, insuranceActive: true, insuranceChargeKills: 9, items: { insurance: 1 } };
    expect(applyCampaignInsuranceOnHit(insured, { healthBeforeHit: 80, healthAfterHit: 20 }))
      .toEqual({ triggered: true, health: 50, protectedHealth: 50 });
    expect(insured).toEqual(expect.objectContaining({ hp: 50, insuranceReady: false, insuranceActive: false, insuranceChargeKills: 0 }));
    expect(resolveCampaignHemesScarfRetaliation(
      { itemStats: { scarfBleedsOnHit: 2 } }, { id: 'enemy' }, { damageDealt: 10, random: () => 0 },
    )).toEqual({ kind: 'bleed', stacks: 1, duration: 4, chance: 0.5 });
    expect(resolveCampaignHemesScarfRetaliation(
      { itemStats: { scarfBleedsOnHit: 2 } }, { id: 'immune', bleedImmune: true }, { damageDealt: 10, random: () => 0 },
    )).toBeNull();
  });

  test("keeps Heme's Scarf passive bleed target shared, including God's one-stack reduction", () => {
    expect(getCampaignHemesScarfPassiveBleedStacks({ type: 'hunter' }, { passiveBleedStacks: 3 })).toBe(3);
    expect(getCampaignHemesScarfPassiveBleedStacks({ type: 'god' }, { passiveBleedStacks: 3 })).toBe(2);
    expect(getCampaignHemesScarfPassiveBleedStacks({ type: 'god' }, { passiveBleedStacks: 1 })).toBe(1);
    expect(getCampaignHemesScarfPassiveBleedStacks({ type: 'hunter', bleedImmune: true }, { passiveBleedStacks: 3 })).toBe(0);
  });

  test("spends Heme's Scarf charge on a finite low-health bleed drain", () => {
    const player = { hp: 40, maxHp: 100, scarfHealReady: true, scarfHealTime: 0, itemStats: { bleedHealScale: 2, healingMultiplier: 1.5 } };
    const first = advanceCampaignHemesScarfDrain(player, 4, 0.05);
    expect(first).toEqual(expect.objectContaining({ started: true, active: true }));
    expect(first.heal).toBeCloseTo(0.018);
    expect(player).toEqual(expect.objectContaining({ scarfHealReady: false, scarfHealTime: 2.95 }));
    expect(player.hp).toBeCloseTo(40.018);
    const exhausted = advanceCampaignHemesScarfDrain({ hp: 40, maxHp: 100, scarfHealReady: false, scarfHealTime: 0, itemStats: { bleedHealScale: 2 } }, 4, 0.05);
    expect(exhausted).toEqual({ started: false, active: false, heal: 0 });
  });

  test('resolves Last Penny, Veggy\'s Pendant, and Mateo\'s Bag at one room-entry boundary', () => {
    const player = {
      hp: 80, maxHp: 100, coins: 4, storedPotions: 0, veggysRoomCounter: 2,
      items: { naked_kings_last_penny: 2, veggys_pendant: 2, mateos_bag: 1 },
    };
    const result = resolveCampaignRoomEntryItemEffects(player, { id: 'shop', type: 'shop' }, {
      firstReveal: true, floorNumber: 3, getPotionCarryCap: getCampaignPotionCarryCap,
    });
    expect(player).toEqual(expect.objectContaining({
      coins: 12, maxHp: 120, hp: 90, veggysRoomCounter: 0,
      storedPotions: 1, mateosBagRefillFloor: 3,
    }));
    expect(result.intents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'coins', amount: 8, stacks: 2 }),
      expect.objectContaining({ kind: 'max_hp', gain: 0.2, previousMaxHp: 100, maxHp: 120, healedAmount: 10 }),
      expect.objectContaining({ kind: 'stored_potion', potionCap: 3 }),
    ]));
    expect(getCampaignPotionCarryCap({ items: { mateos_bag: 3 } })).toBe(5);
  });

  test('clears the same transient defensive state at campaign and authority room boundaries', () => {
    const campaign = { inv: 0.4, stun: 1, vx: 12, vy: -8, dashTime: 0.2, dashX: 4, dashY: -3, cowardsWayTime: 2, mooggyZoomiesTime: 2, princessFlightTime: 2, blockActive: true, blockTimer: 2, roomDamageTaken: 16 };
    applyCampaignRoomEntryReset(campaign);
    expect(campaign).toEqual(expect.objectContaining({ inv: 0, stun: 0, vx: 0, vy: 0, dashTime: 0, dashX: 0, dashY: 0, cowardsWayTime: 0, mooggyZoomiesTime: 0, princessFlightTime: 0, blockActive: false, blockTimer: 0, roomDamageTaken: 0 }));

    const authority = { invulnerableUntilTick: 30, stunnedUntilTick: 30, vx: 12, vy: -8, dashUntilTick: 30, dashVx: 4, dashVy: -3, statusUntilTick: { cowards_way: 30, mooggy_zoomies: 30, flying_unhitable: 30 }, beamChannel: { moveKey: 'blood_beam' } };
    expect(applyCampaignRoomEntryReset(authority, { tickBased: true, currentTick: 12 })).toEqual({ ok: true, cancelledBeam: true });
    expect(authority).toEqual(expect.objectContaining({ invulnerableUntilTick: 12, stunnedUntilTick: 12, vx: 0, vy: 0, dashUntilTick: 12, dashVx: 0, dashVy: 0 }));
    expect(authority.statusUntilTick).toEqual({ cowards_way: 12, mooggy_zoomies: 12, flying_unhitable: 12 });
  });
});
