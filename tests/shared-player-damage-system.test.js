const { resolveCampaignPlayerDamage } = require('../js/simulation/SharedPlayerDamageSystem');

describe('shared campaign player-damage policy', () => {
  test('applies defense, barrier, Iron Lung and the non-boss hit ceiling in one canonical order', () => {
    const result = resolveCampaignPlayerDamage({
      health: 120,
      maxHp: 120,
      damage: 90,
      damageMultiplier: 1.1,
      damageReduction: 0.1,
      flatDamageReduction: 4,
      barrier: 15,
      ironLungApplies: true,
    });

    // 90 × 1.1 × 0.9 - 4 = 85.1, then Iron Lung limits the incoming hit to
    // 24 and barrier absorbs 15. The result must be identical for campaign
    // and authority callers because neither owns this arithmetic anymore.
    expect(result).toEqual(expect.objectContaining({
      incoming: 24,
      absorbed: 15,
      barrier: 0,
      dealt: 9,
      health: 111,
    }));
  });

  test('keeps a healthy player alive through an otherwise lethal capped hit', () => {
    const result = resolveCampaignPlayerDamage({ health: 100, maxHp: 100, damage: 900 });
    expect(result.dealt).toBe(48);
    expect(result.health).toBe(52);

    const oneShot = resolveCampaignPlayerDamage({ health: 40, maxHp: 100, damage: 900 });
    expect(oneShot.dealt).toBe(39);
    expect(oneShot.health).toBe(1);
  });

  test('allows an explicitly authored damage-cap exception without changing common mitigation', () => {
    const result = resolveCampaignPlayerDamage({
      health: 100, maxHp: 100, damage: 80, damageReduction: 0.25,
      ignoreDamageCaps: true,
    });
    expect(result.dealt).toBe(60);
    expect(result.health).toBe(40);
  });
});
