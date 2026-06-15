const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName, dependencies = {}) {
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

  const names = Object.keys(dependencies);
  const values = Object.values(dependencies);
  return new Function(
    ...names,
    `${source.slice(start, end + 1)}; return ${functionName};`,
  )(...values);
}

describe('minor enemy pack pressure', () => {
  const enemiesSource = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');
  const updateSource = fs.readFileSync(path.join(__dirname, '../js/core/update.js'), 'utf8');
  const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');

  function createPackPressure(enemies) {
    const Neo = {
      enemies,
      dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    };
    const MINOR_PACK_ENEMY_TYPES = new Set(['hunter', 'charger', 'laser', 'cult_follower']);
    const MINOR_PACK_RADIUS = 260;
    const MINOR_PACK_MAX_ALLIES = 3;
    return extractFunction(enemiesSource, 'updateMinorEnemyPackPressure', {
      Neo,
      MINOR_PACK_ENEMY_TYPES,
      MINOR_PACK_RADIUS,
      MINOR_PACK_MAX_ALLIES,
    });
  }

  test('scales basic enemies with nearby basic allies and caps at three', () => {
    const hunter = { type: 'hunter', x: 0, y: 0, spawnT: 0 };
    const enemies = [
      hunter,
      { type: 'charger', x: 50, y: 0, spawnT: 0 },
      { type: 'laser', x: 100, y: 0, spawnT: 0 },
      { type: 'cult_follower', x: 150, y: 0, spawnT: 0 },
      { type: 'hunter', x: 200, y: 0, spawnT: 0 },
    ];
    const updatePackPressure = createPackPressure(enemies);

    expect(updatePackPressure(hunter)).toBe(3);
    expect(hunter.minorPackSpeedMultiplier).toBeCloseTo(1.12);
    expect(hunter.minorPackCooldownRate).toBeCloseTo(1.18);
    expect(hunter.minorPackDamageMultiplier).toBeCloseTo(1.09);
  });

  test('ignores distant, spawning, elite, and non-basic enemies', () => {
    const hunter = { type: 'hunter', x: 0, y: 0, spawnT: 0 };
    const enemies = [
      hunter,
      { type: 'hunter', x: 300, y: 0, spawnT: 0 },
      { type: 'charger', x: 40, y: 0, spawnT: 0.2 },
      { type: 'laser', x: 60, y: 0, spawnT: 0, elite: true },
      { type: 'sniper', x: 80, y: 0, spawnT: 0 },
    ];
    const updatePackPressure = createPackPressure(enemies);

    expect(updatePackPressure(hunter)).toBe(0);
    expect(hunter.minorPackDamageMultiplier).toBe(1);
  });

  test('applies pack speed, cooldown, and damage in shared combat paths', () => {
    expect(enemiesSource).toContain('maxSpeed * slowMultiplier * packSpeedMultiplier');
    expect(updateSource).toContain('enemy.attackCd - dt * minorPackCooldownRate');
    expect(worldSource).toContain('numericAmount * minorPackDamageMultiplier');
  });
});
