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

describe('enemy loop damage reduction', () => {
  const corePath = path.join(__dirname, '../js/core/game-core.js');
  const coreSource = fs.readFileSync(corePath, 'utf8');
  const combatPath = path.join(__dirname, '../js/game/combat.js');
  const combatSource = fs.readFileSync(combatPath, 'utf8');
  const declarations = [
    extractFunction(combatSource, 'getCurrentLoopNumber'),
    extractFunction(combatSource, 'getEnemyDamageTakenMultiplier'),
  ].join('\n');

  function getMultiplier({ difficulty, loopNumber, elite = false }) {
    const reductionRates = {
      impossible: 0.05,
      god: 0.05,
    };
    const Neo = {
      MAX_FLOOR: 10,
      runLoopIndex: loopNumber - 1,
      getProgressionDepth: () => (loopNumber - 1) * 10 + 1,
      getDifficultyDef: () => ({
        enemyLoopDamageReduction: reductionRates[difficulty] || 0,
      }),
    };
    return new Function(
      'Neo',
      `${declarations}; return getEnemyDamageTakenMultiplier;`,
    )(Neo)({ elite });
  }

  test('configures the reduction only on progression difficulties after Hard', () => {
    const difficultySource = coreSource.slice(
      coreSource.indexOf('export const DIFFICULTY_DEFS'),
      coreSource.indexOf('export const CHALLENGE_DEFS'),
    );
    const hardBlock = difficultySource.slice(difficultySource.indexOf('  hard: {'), difficultySource.indexOf('  impossible: {'));
    const impossibleBlock = difficultySource.slice(difficultySource.indexOf('  impossible: {'), difficultySource.indexOf('  god: {'));
    const godBlock = difficultySource.slice(difficultySource.indexOf('  god: {'), difficultySource.indexOf('  custom: {'));
    const customBlock = difficultySource.slice(difficultySource.indexOf('  custom: {'));

    expect(hardBlock).not.toContain('enemyLoopDamageReduction');
    expect(impossibleBlock).toContain('enemyLoopDamageReduction: 0.05');
    expect(godBlock).toContain('enemyLoopDamageReduction: 0.05');
    expect(customBlock).not.toContain('enemyLoopDamageReduction');
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
