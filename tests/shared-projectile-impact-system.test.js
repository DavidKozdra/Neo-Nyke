const {
  resolveCampaignProjectileStatusApplications,
  resolveCampaignProjectileDrain,
} = require('../js/simulation/SharedProjectileSystem');

describe('shared campaign projectile impact policy', () => {
  test('resolves ordered status payloads with one deterministic roll per effect', () => {
    const rolls = [0.1, 0.8];
    const applications = resolveCampaignProjectileStatusApplications({
      statusEffects: [
        { key: 'poison', stacks: 2, duration: 4, chance: 0.2 },
        { key: 'slow', stacks: 1, duration: 3, chance: 0.5 },
      ],
    }, {
      random: () => rolls.shift(),
      resolveProc: effect => ({ chance: effect.chance, effectMultiplier: effect.key === 'poison' ? 1.5 : 1 }),
    });

    expect(applications).toEqual([{ key: 'poison', stacks: 2, duration: 6, damageMultiplier: 1.5 }]);
  });

  test('uses one owner-agnostic drain calculation for browser and authority enemy records', () => {
    expect(resolveCampaignProjectileDrain({ drainHeal: 18 }, { hp: 60, max: 70 })).toEqual({
      healedAmount: 10, health: 70, maxHealth: 70,
    });
    expect(resolveCampaignProjectileDrain({ drainHeal: 18 }, { health: 60, maxHealth: 100 })).toEqual({
      healedAmount: 18, health: 78, maxHealth: 100,
    });
  });
});
