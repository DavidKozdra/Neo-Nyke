const fs = require('node:fs');
const path = require('node:path');

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
  const coreSource = fs.readFileSync(path.join(__dirname, '../js/core/game-core.js'), 'utf8');
  const gameStateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');
  const difficultySource = coreSource.slice(coreSource.indexOf('export const DIFFICULTY_DEFS = {'));

  function getDifficultyBlock(key, nextKey) {
    return difficultySource.slice(
      difficultySource.indexOf(`  ${key}: {`),
      difficultySource.indexOf(`  ${nextKey}: {`),
    );
  }

  test('reduces random relic frequency and shop stock from Hard upward', () => {
    expect(getDifficultyBlock('hard', 'impossible')).toContain('itemDropChanceMultiplier: 0.65');
    expect(getDifficultyBlock('hard', 'impossible')).toContain('shopItemOffers: 2');
    expect(getDifficultyBlock('impossible', 'god')).toContain('itemDropChanceMultiplier: 0.45');
    expect(getDifficultyBlock('impossible', 'god')).toContain('shopItemOffers: 2');
    expect(getDifficultyBlock('god', 'custom')).toContain('itemDropChanceMultiplier: 0.3');
    expect(getDifficultyBlock('god', 'custom')).toContain('shopItemOffers: 1');
  });

  test.each([
    [0.65, 0.12, 0.078],
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
