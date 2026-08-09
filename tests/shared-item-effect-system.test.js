const itemEffects = require('../js/simulation/SharedItemEffectSystem');

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
    }));
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
