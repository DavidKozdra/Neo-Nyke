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

describe('cult mage nova', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');

  test('detonates when the nova timer crosses zero during an update', () => {
    const blasts = [];
    const rings = [];
    const Neo = {
      player: { x: 20, y: 0, r: 14 },
      getEnemyDifficultyTuning: () => ({ reaction: 1, rangedCadence: 1 }),
      ringBurst: (...args) => rings.push(args),
      blastRadius: (...args) => blasts.push(args),
    };
    const updateCultMageEnemy = new Function(
      'Neo',
      'steerEnemy',
      'trySteerEnemyToCover',
      `${extractFunction(source, 'updateCultMageEnemy')}; return updateCultMageEnemy;`,
    )(Neo, jest.fn(), jest.fn(() => false));

    const enemy = {
      type: 'cult_mage',
      x: 0,
      y: 0,
      r: 18,
      hp: 100,
      max: 100,
      dmg: 30,
      speed: 90,
      stun: 0,
      vx: 10,
      vy: 0,
      novaTimer: 0.05,
      novaCd: 1,
      windup: 0,
      beamTime: 0,
      attackCd: 1,
    };

    updateCultMageEnemy(enemy, 0.1);

    expect(rings).toHaveLength(1);
    expect(blasts).toHaveLength(1);
    expect(blasts[0]).toEqual([0, 0, 120, 33, '#c77bff', enemy, 300]);
    expect(enemy.novaTimer).toBe(0);
  });
});
