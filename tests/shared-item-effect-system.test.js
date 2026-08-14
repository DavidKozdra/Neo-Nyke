const itemEffects = require('../js/simulation/SharedItemEffectSystem');

const MIRROR_STRENGTH = itemEffects.MIRROR_ITEM_EFFECT_STRENGTH;

describe('shared campaign item effects', () => {
  test('derives the campaign HUD and gameplay values from the canonical item definitions', () => {
    const stats = itemEffects.deriveCampaignItemStats({
      items: { neo_knife: 2, tough_bandaid: 1, crit_charm: 1, attack_servo: 2, scholar_seal: 1 },
      equippedWeapon: 'claw_gauntlets', level: 1, xp: 0, xpToNext: 20,
    });
    expect(stats).toEqual(expect.objectContaining({
      bleedChance: 0.22,
      weaponBleedChance: 0.22,
      displayedBleedChance: 0.44,
      displayedCritChance: 0.025,
      attackSpeedMultiplier: 1.16,
      xpGainMultiplier: 1.15,
      darkDrainResistance: 0.1,
    }));
  });

  test('Tough Bandaid reduces incoming Dark Drain effectiveness per stack', () => {
    expect(itemEffects.deriveCampaignItemStats({ items: { tough_bandaid: 2 } }).darkDrainResistance).toBe(0.2);
    expect(itemEffects.deriveCampaignItemStats({ items: { tough_bandaid: 20 } }).darkDrainResistance).toBe(0.8);
  });

  test('syncs every authoritative player before movement and combat', () => {
    const state = {
      tick: 20,
      players: { p1: { items: { turtle_shell: 2, cloak_of_naked_king: 1, gold_vac: 1 }, level: 1 } },
    };
    itemEffects.syncCampaignItemStats(state);
    expect(state.players.p1.itemStats).toEqual(expect.objectContaining({
      moveSpeedMultiplier: 1.1,
      flatDamageReduction: 11,
      coinPickupMultiplier: 1,
    }));
  });

  test('uses the exact active Gold Vac stack count from campaign equipment state', () => {
    const stats = itemEffects.deriveCampaignItemStats({
      items: { gold_vac: 3 },
      equipmentEffects: { gold_vac: { time: 2, stacks: 2 } },
    });
    expect(stats.pickupVacuumRange).toBe(9999);
    expect(stats.coinPickupMultiplier).toBe(2.5);
  });

  test('derives Factor of Elements damage scaling per relic stack', () => {
    const stats = itemEffects.deriveCampaignItemStats({
      items: { factor_of_elements: 2 },
    });
    expect(stats.factorOfElementsDamagePerStatusStack).toBe(0.1);
  });

  test('buffs Mateo\'s Bag potion pickups by 10% and stored potions by 20% per stack', () => {
    expect(itemEffects.deriveCampaignItemStats({ items: { mateos_bag: 1 } })).toEqual(expect.objectContaining({
      potionPickupHealingMultiplier: 1.1,
      storedPotionHealingMultiplier: 1.2,
    }));
    expect(itemEffects.deriveCampaignItemStats({ items: { mateos_bag: 2 } })).toEqual(expect.objectContaining({
      potionPickupHealingMultiplier: 1.2,
      storedPotionHealingMultiplier: 1.4,
    }));
  });

  test('weakens every numeric mirror item effect by twelve percent from its neutral value', () => {
    const scaled = itemEffects.scaleCampaignItemEffects({
      scarfBleedsOnHit: 1,
      bleedChance: 0.2,
      beamDamageMultiplier: 1.35,
      damageReduction: 0.25,
      flatDamageReduction: 10,
      critChance: 0.01,
      critMultiplier: 1.606,
      fireResistance: 0.5,
      hasRobotArm: true,
    }, MIRROR_STRENGTH);

    expect(MIRROR_STRENGTH).toBe(0.88);
    expect(scaled).toEqual(expect.objectContaining({
      scarfBleedsOnHit: 0.88,
      beamDamageMultiplier: 1.308,
      damageReduction: 0.22,
      flatDamageReduction: 8.8,
      critChance: 0.01,
      critMultiplier: 1.606,
      fireResistance: 0.5,
      hasRobotArm: true,
    }));
    expect(scaled.bleedChance).toBeCloseTo(0.176);
  });

  test('preserves fractional mirror item counts as proportional proc chances', () => {
    expect(itemEffects.resolveFractionalItemEffectCount(0.88, () => 0.87)).toBe(1);
    expect(itemEffects.resolveFractionalItemEffectCount(0.88, () => 0.88)).toBe(0);
    expect(itemEffects.resolveFractionalItemEffectCount(1.76, () => 0.75)).toBe(2);
    expect(itemEffects.resolveFractionalItemEffectCount(1.76, () => 0.8)).toBe(1);
    expect(itemEffects.resolveFractionalItemEffectCount(0.88)).toBe(0);
  });

  test('plans Sweepy Box mines with campaign arm, blast, damage, and bleed scaling', () => {
    expect(itemEffects.planCampaignThornMine(3)).toEqual({
      count: 3, durationSeconds: 5, armSeconds: 0.18, triggerRadius: 34,
      blastRadius: 74, damage: 26, knockback: 170, bleedStacks: 2, bleedDuration: 5.3,
    });
  });

  test('plans El Barto Graffiti with its campaign chance and raw pulse profile', () => {
    expect(itemEffects.planCampaignElBartoGraffiti(2, () => 0.19)).toEqual({
      spawn: true, radius: 48, durationSeconds: 12, intervalSeconds: 0.65, damage: 24, knockback: 55,
    });
    expect(itemEffects.planCampaignElBartoGraffiti(2, () => 0.2).spawn).toBe(false);
    expect(itemEffects.planCampaignElBartoGraffiti(3, () => 1).spawn).toBe(true);
  });
});
