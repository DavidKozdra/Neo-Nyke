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
    'const ENEMY_UNIVERSAL_STAT_MULTIPLIER = 0.95;',
    extractFunction(source, 'softCapEnemyScale'),
    extractFunction(source, 'getEnemyLevelStatMultipliers'),
    extractFunction(source, 'getProgressionDepth'),
    extractFunction(source, 'scaleEnemyStats'),
  ].join('\n');

  function scaleAtDepth(floorsEntered, level = floorsEntered) {
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

    return scaleEnemyStats({ hp: 100, max: 100, dmg: 10, speed: 100, attackCd: 1, level }, 'hunter');
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

    expect(firstFloorAfterLoop.hp).toBe(899);
    expect(firstFloorAfterLoop.dmg).toBe(48);
    expect(firstFloorAfterLoop.speed).toBeCloseTo(156.52, 1);
  });

  test('starts the near-exponential level bonus only after level five', () => {
    const levelFive = scaleAtDepth(1, 5);
    const levelSix = scaleAtDepth(1, 6);
    const levelTen = scaleAtDepth(1, 10);
    const levelFifteen = scaleAtDepth(1, 15);

    expect(levelFive).toMatchObject({ hp: 95, dmg: 10, speed: 95, enemyLevelAttackSpeedMultiplier: 1 });
    expect(levelSix).toMatchObject({ hp: 114, dmg: 11 });
    expect(levelSix.speed).toBeCloseTo(97.375);
    expect(levelSix.enemyLevelAttackSpeedMultiplier).toBeCloseTo(1.07);
    expect(levelTen.hp).toBe(236);
    expect(levelTen.dmg).toBe(18);
    expect(levelTen.enemyLevelAttackSpeedMultiplier).toBeCloseTo(Math.pow(1.07, 5));
    expect(levelFifteen.hp).toBe(588);
    expect(levelFifteen.dmg).toBe(35);
    expect(levelFifteen.speed).toBeCloseTo(121.61, 1);
    expect(levelFifteen.enemyLevelAttackSpeedMultiplier).toBeCloseTo(Math.pow(1.07, 10));
  });
});
