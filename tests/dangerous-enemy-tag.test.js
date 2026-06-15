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

function buildIsEnemyDangerous(maxHp) {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'js/game/combat.js'), 'utf8');
  const declaration = extractFunction(source, 'isEnemyDangerous');
  return new Function(
    'Neo',
    `const DANGEROUS_CRIT_CHANCE = 0.6;
     const ELITE_CRIT_MULTIPLIER = 1.4;
     ${declaration}
     return isEnemyDangerous;`,
  )({ player: { maxHp } });
}

describe('Dangerous enemy name tag', () => {
  test('base attack that meets or exceeds player max HP is dangerous', () => {
    const isEnemyDangerous = buildIsEnemyDangerous(15);
    expect(isEnemyDangerous({ dmg: 15 })).toBe(true);
    expect(isEnemyDangerous({ dmg: 20 })).toBe(true);
    expect(isEnemyDangerous({ dmg: 14 })).toBe(false);
  });

  test('heavy crit chance whose crit damage reaches max HP is dangerous', () => {
    const isEnemyDangerous = buildIsEnemyDangerous(15);
    // 11 * 1.4 = 15.4 >= 15 with >=60% crit chance
    expect(isEnemyDangerous({ dmg: 11, eliteCrit: 0.6 })).toBe(true);
    // same damage but crit chance below the 60% threshold
    expect(isEnemyDangerous({ dmg: 11, eliteCrit: 0.5 })).toBe(false);
    // high crit chance but crit damage still can't reach max HP
    expect(isEnemyDangerous({ dmg: 8, eliteCrit: 0.9 })).toBe(false);
  });

  test('falsy or harmless enemies are not dangerous', () => {
    const isEnemyDangerous = buildIsEnemyDangerous(15);
    expect(isEnemyDangerous(null)).toBe(false);
    expect(isEnemyDangerous({ dmg: 5 })).toBe(false);
  });

  test('name tag draws a red border for dangerous enemies', () => {
    const root = path.resolve(__dirname, '..');
    const entities = fs.readFileSync(path.join(root, 'js/draw/entities.js'), 'utf8');
    expect(entities).toContain('Neo.isEnemyDangerous?.(enemy)');
    expect(entities).toContain("Neo.ctx.strokeStyle = '#ff3b3b'");
  });
});
