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

describe('enemy loop scaling', () => {
  const enemiesPath = path.join(__dirname, '../js/game/enemies.js');
  const source = fs.readFileSync(enemiesPath, 'utf8');
  const declarations = [
    extractFunction(source, 'softCapEnemyScale'),
    extractFunction(source, 'getProgressionDepth'),
    extractFunction(source, 'scaleEnemyStats'),
  ].join('\n');

  function scaleAtDepth(floorsEntered) {
    const Neo = {
      floor: ((floorsEntered - 1) % 10) + 1,
      floorsEntered,
      MAX_FLOOR: 10,
      gameElapsedTime: 0,
      gameMode: 'normal',
      endlessWave: 0,
      ENEMY_SCALING: {
        floor: 0.14,
        loop: 0.32,
        minute: 0.12,
        damageFloor: 0.095,
        damageLoop: 0.2,
        damageMinute: 0.055,
        speedFloor: 0.035,
        speedLoop: 0.07,
        speedMinute: 0.018,
        damageSoftCap: 2.15,
        bossDamageSoftCap: 2.45,
        speedSoftCap: 1.38,
        bossLoopHp: 0.2,
        bossLoopDamage: 0.05,
        endlessWaveHp: 0.12,
        endlessWaveDamage: 0.06,
        endlessWaveSpeed: 0.012,
        endlessWaveDamageSoftCap: 2.6,
        endlessWaveSpeedSoftCap: 1.5,
      },
      getActiveSandboxSettings: () => null,
      getDifficultyDef: () => ({
        statMultiplier: 1,
        bossStatMultiplier: 1,
        speedMultiplier: 1,
      }),
    };
    const scaleEnemyStats = new Function(
      'Neo',
      'isBossType',
      `${declarations}; return scaleEnemyStats;`,
    )(Neo, () => false);

    return scaleEnemyStats({ hp: 100, max: 100, dmg: 10, speed: 100 }, 'hunter');
  }

  test('keeps every scaled stat increasing when a run crosses into a new loop', () => {
    const floorTen = scaleAtDepth(10);
    const firstFloorAfterLoop = scaleAtDepth(11);

    expect(firstFloorAfterLoop.hp).toBeGreaterThan(floorTen.hp);
    expect(firstFloorAfterLoop.dmg).toBeGreaterThanOrEqual(floorTen.dmg);
    expect(firstFloorAfterLoop.speed).toBeGreaterThan(floorTen.speed);
  });

  test('uses cumulative floors visited for the floor component', () => {
    const firstFloorAfterLoop = scaleAtDepth(11);

    expect(firstFloorAfterLoop.hp).toBe(317);
    expect(firstFloorAfterLoop.dmg).toBe(23);
    expect(firstFloorAfterLoop.speed).toBeCloseTo(142.06, 1);
  });
});
