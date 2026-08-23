const {
  ZOOMIES_DAMAGE_MULTIPLIER,
  getCampaignZoomiesDamageMultiplier,
  scaleCampaignDamage,
} = require('../js/simulation/SharedDamageSystem');

// Mooggy's Zoomies is a 12-second movement buff. It also grants +5% outgoing
// damage while it runs, and campaign / authority track the buff in different
// shapes (mooggyZoomiesTime seconds vs a statusUntilTick deadline), so the two
// paths are easy to drift apart. These lock the value and both readers.
describe('Zoomies damage boost', () => {
  test('is a 5% bonus that only applies while the buff is active', () => {
    expect(ZOOMIES_DAMAGE_MULTIPLIER).toBe(1.05);
    expect(getCampaignZoomiesDamageMultiplier(true)).toBe(1.05);
    expect(getCampaignZoomiesDamageMultiplier(false)).toBe(1);
  });

  test('scales outgoing damage through the shared pipeline', () => {
    const base = scaleCampaignDamage({ damage: 100, enemy: {} });
    const zooming = scaleCampaignDamage({
      damage: 100,
      enemy: {},
      zoomiesDamageMultiplier: getCampaignZoomiesDamageMultiplier(true),
    });
    expect(base).toBe(100);
    expect(zooming).toBe(105);
  });

  test('stacks multiplicatively with other damage multipliers rather than replacing them', () => {
    const withoutZoomies = scaleCampaignDamage({
      damage: 100, enemy: {}, attackerDamageMultiplier: 1.2, glassCannon: true,
    });
    const withZoomies = scaleCampaignDamage({
      damage: 100,
      enemy: {},
      attackerDamageMultiplier: 1.2,
      glassCannon: true,
      zoomiesDamageMultiplier: getCampaignZoomiesDamageMultiplier(true),
    });
    expect(withoutZoomies).toBe(150);
    expect(withZoomies).toBe(Math.round(150 * 1.05));
  });

  test('does not alter raw damage, which bypasses multipliers by design', () => {
    const raw = scaleCampaignDamage({
      damage: 100,
      enemy: {},
      raw: true,
      zoomiesDamageMultiplier: getCampaignZoomiesDamageMultiplier(true),
    });
    expect(raw).toBe(100);
  });
});
