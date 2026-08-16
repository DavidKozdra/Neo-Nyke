const { getCampaignEnemyDamageTakenMultiplier } = require('../js/simulation/SharedDamageSystem');
const { CAMPAIGN_ENEMY_DIFFICULTY_PRESETS } = require('../js/simulation/SharedEnemyScalingSystem');


describe('enemy loop damage reduction', () => {
  function getMultiplier({ difficulty, loopNumber, elite = false }) {
    return getCampaignEnemyDamageTakenMultiplier(
      { elite },
      { ...CAMPAIGN_ENEMY_DIFFICULTY_PRESETS[difficulty], loopNumber },
    );
  }

  test('configures the reduction only on progression difficulties after Hard', () => {
    expect(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard.enemyLoopDamageReduction).toBeUndefined();
    expect(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.impossible.enemyLoopDamageReduction).toBe(0.05);
    expect(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.god.enemyLoopDamageReduction).toBe(0.05);
    expect(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.custom.enemyLoopDamageReduction).toBeUndefined();
  });

  test('does not reduce loop damage on Hard or lower difficulties', () => {
    expect(getMultiplier({ difficulty: 'easy', loopNumber: 4 })).toBe(1);
    expect(getMultiplier({ difficulty: 'medium', loopNumber: 4 })).toBe(1);
    expect(getMultiplier({ difficulty: 'hard', loopNumber: 4 })).toBe(1);
  });

  test('reduces incoming damage by 5% for each completed loop on Impossible and God', () => {
    expect(getMultiplier({ difficulty: 'impossible', loopNumber: 1 })).toBe(1);
    expect(getMultiplier({ difficulty: 'impossible', loopNumber: 2 })).toBeCloseTo(0.95);
    expect(getMultiplier({ difficulty: 'god', loopNumber: 4 })).toBeCloseTo(0.85);
  });

  test('stacks loop reduction with the existing elite reduction', () => {
    expect(getMultiplier({ difficulty: 'impossible', loopNumber: 2, elite: true })).toBeCloseTo(0.9025);
  });
});
