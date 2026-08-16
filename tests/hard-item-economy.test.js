const fs = require('node:fs');
const path = require('node:path');
const { CAMPAIGN_ENEMY_DIFFICULTY_PRESETS } = require('../js/simulation/SharedEnemyScalingSystem');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  return source.slice(start, end + 1);
}

describe('hard difficulty item economy', () => {
  const gameStateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');

  test('tunes random relic frequency and shop stock from Hard upward', () => {
    expect(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard).toEqual(expect.objectContaining({
      itemDropChanceMultiplier: 0.8,
      shopItemOffers: 2,
    }));
    expect(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.impossible).toEqual(expect.objectContaining({
      itemDropChanceMultiplier: 0.45,
      shopItemOffers: 2,
    }));
    expect(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.god).toEqual(expect.objectContaining({
      itemDropChanceMultiplier: 0.3,
      shopItemOffers: 1,
    }));
  });

  test.each([
    [0.8, 0.12, 0.096],
    [0.45, 0.18, 0.081],
    [0.3, 0.9, 0.27],
  ])('applies multiplier %p to random source chance %p', (multiplier, baseChance, expected) => {
    const Neo = {
      getDifficultyDef: () => ({ itemDropChanceMultiplier: multiplier }),
      getItemStats: () => ({ itemDropChanceBonus: 0 }),
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    };
    const getRandomItemDropChance = new Function(
      'Neo',
      `${extractFunction(gameStateSource, 'getRandomItemDropChance')}; return getRandomItemDropChance;`,
    )(Neo);

    expect(getRandomItemDropChance(baseChance, 1)).toBeCloseTo(expected);
  });
});
