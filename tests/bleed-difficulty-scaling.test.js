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

describe('enemy bleed damage difficulty scaling', () => {
  const coreSource = fs.readFileSync(path.join(__dirname, '../js/core/game-core.js'), 'utf8');
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const scaleDeclaration = extractFunction(combatSource, 'scaleBleedDamageAgainstEnemy');

  function scaleBleed(difficultyMultiplier) {
    const Neo = {
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      getDifficultyDef: () => difficultyMultiplier == null
        ? {}
        : { enemyBleedDamageMultiplier: difficultyMultiplier },
    };
    const scaleBleedDamageAgainstEnemy = new Function(
      'Neo',
      'scaleDamageAgainstEnemy',
      'getEnemyBleedResistance',
      'NO_BLEED_BONUS_DAMAGE_OPTIONS',
      `${scaleDeclaration}; return scaleBleedDamageAgainstEnemy;`,
    )(Neo, () => 100, () => 1, {});

    return scaleBleedDamageAgainstEnemy({}, 1);
  }

  test('configures the requested Hard, Impossible, and God curve', () => {
    const difficultySource = coreSource.slice(
      coreSource.indexOf('export const DIFFICULTY_DEFS'),
      coreSource.indexOf('export const CHALLENGE_DEFS'),
    );

    expect(difficultySource).toContain('enemyBleedDamageMultiplier: 0.8');
    expect(difficultySource).toContain('enemyBleedDamageMultiplier: 0.65');
    expect(difficultySource).toContain('enemyBleedDamageMultiplier: 0.5');
  });

  test('reduces all enemy bleed ticks by the configured effectiveness', () => {
    expect(scaleBleed(null)).toBe(100);
    expect(scaleBleed(0.8)).toBe(80);
    expect(scaleBleed(0.65)).toBe(65);
    expect(scaleBleed(0.5)).toBe(50);
  });
});
