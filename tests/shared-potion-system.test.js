const { resolveCampaignPotionBaseHeal, resolveCampaignStoredPotion, resolveCampaignPotionPickup } = require('../js/simulation/SharedPotionSystem');

describe('shared campaign stored-potion policy', () => {
  test('derives the campaign difficulty-aware potion base before stored-potion modifiers', () => {
    expect(resolveCampaignPotionBaseHeal()).toBe(39);
    expect(resolveCampaignPotionBaseHeal({ difficulty: { statMultiplier: 1 }, healingMultiplier: 1.2 })).toBe(48);
  });

  test('uses the deterministic Drink Master roll and consumes exactly one stored potion', () => {
    const player = { hp: 20, maxHp: 120, storedPotions: 2 };
    const result = resolveCampaignStoredPotion(player, {
      itemStats: { potionDoubleChance: 0.5, storedPotionHealingMultiplier: 1.2 },
      baseHeal: 40,
      random: () => 0.25,
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true, doubled: true, requestedHeal: 96, healedAmount: 96, storedPotions: 1,
    }));
    expect(player).toEqual(expect.objectContaining({ hp: 116, storedPotions: 1 }));
  });

  test('does not consume a potion at full health or when none is stored', () => {
    const full = { hp: 100, maxHp: 100, storedPotions: 1 };
    expect(resolveCampaignStoredPotion(full)).toEqual(expect.objectContaining({ ok: false, reason: 'FULL_HP' }));
    expect(full.storedPotions).toBe(1);

    const empty = { hp: 25, maxHp: 100, storedPotions: 0 };
    expect(resolveCampaignStoredPotion(empty)).toEqual(expect.objectContaining({ ok: false, reason: 'EMPTY' }));
  });

  test('uses the campaign walk-over rule: heal while hurt, otherwise store only with Mateo\'s Bag', () => {
    const hurt = { hp: 60, maxHp: 120, storedPotions: 0, items: {} };
    expect(resolveCampaignPotionPickup(hurt, { baseHeal: 30, itemStats: { potionDoubleChance: 0.5 }, random: () => 0 }))
      .toEqual(expect.objectContaining({ ok: true, kind: 'heal', doubled: true, requestedHeal: 60, healedAmount: 60 }));
    expect(hurt).toEqual(expect.objectContaining({ hp: 120, storedPotions: 0 }));

    const bag = { hp: 120, maxHp: 120, storedPotions: 2, items: { mateos_bag: 1 } };
    expect(resolveCampaignPotionPickup(bag, { itemStats: { potionDoubleChance: 0.5 }, random: () => 0 }))
      .toEqual(expect.objectContaining({ ok: true, kind: 'stored', doubled: true, storedGain: 1, storedPotions: 3, potionCap: 3 }));
    expect(resolveCampaignPotionPickup({ hp: 120, maxHp: 120, storedPotions: 0, items: {} }))
      .toEqual(expect.objectContaining({ ok: false, reason: 'UNUSABLE' }));
  });

  test('applies Mateo\'s Bag pickup healing bonus before a hurt hero consumes the potion', () => {
    const player = { hp: 20, maxHp: 100, storedPotions: 0, items: { mateos_bag: 1 } };
    const result = resolveCampaignPotionPickup(player, {
      baseHeal: 40,
      itemStats: { potionPickupHealingMultiplier: 1.1 },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true, kind: 'heal', requestedHeal: 44, healedAmount: 44,
    }));
    expect(player.hp).toBe(64);
  });
});
