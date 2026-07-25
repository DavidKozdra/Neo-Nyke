const { resolveCampaignStoredPotion } = require('../js/simulation/SharedPotionSystem');

describe('shared campaign stored-potion policy', () => {
  test('uses the deterministic Drink Master roll and consumes exactly one stored potion', () => {
    const player = { hp: 20, maxHp: 120, storedPotions: 2 };
    const result = resolveCampaignStoredPotion(player, {
      itemStats: { potionDoubleChance: 0.5, storedPotionHealingMultiplier: 1.1 },
      baseHeal: 40,
      random: () => 0.25,
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true, doubled: true, requestedHeal: 88, healedAmount: 88, storedPotions: 1,
    }));
    expect(player).toEqual(expect.objectContaining({ hp: 108, storedPotions: 1 }));
  });

  test('does not consume a potion at full health or when none is stored', () => {
    const full = { hp: 100, maxHp: 100, storedPotions: 1 };
    expect(resolveCampaignStoredPotion(full)).toEqual(expect.objectContaining({ ok: false, reason: 'FULL_HP' }));
    expect(full.storedPotions).toBe(1);

    const empty = { hp: 25, maxHp: 100, storedPotions: 0 };
    expect(resolveCampaignStoredPotion(empty)).toEqual(expect.objectContaining({ ok: false, reason: 'EMPTY' }));
  });
});
