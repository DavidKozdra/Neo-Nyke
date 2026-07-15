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
    extractFunction(source, 'getBossLevelHpMultiplier'),
    extractFunction(source, 'getBossTimeHpMultiplier'),
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
        levelHpBonus: 0.45,
        bossLevelHpRate: 0.055,
        bossLevelHpSoftCap: 3.25,
        bossLevelHpSoftCapCurve: 0.55,
        bossHpMinute: 0.055,
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

  function scaleBossAtDepth(floorsEntered, level = floorsEntered, difficulty = {}, gameMinutes = 0) {
    const Neo = {
      floor: ((floorsEntered - 1) % 10) + 1,
      floorsEntered,
      MAX_FLOOR: 10,
      gameElapsedTime: gameMinutes * 60,
      gameMode: 'normal',
      endlessWave: 0,
      ENEMY_SCALING: {
        floor: 0.14,
        bossLevelHpRate: 0.055,
        bossLevelHpSoftCap: 3.25,
        bossLevelHpSoftCapCurve: 0.55,
        bossHpMinute: 0.055,
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
        statMultiplier: 1.06,
        bossStatMultiplier: 1.08,
        bossHpGrowthMultiplier: 1,
        hpFloorScaleBonus: -0.02,
        speedMultiplier: 1.03,
        ...difficulty,
      }),
    };
    const scaleEnemyStats = new Function(
      'Neo',
      'isBossType',
      `${declarations}; return scaleEnemyStats;`,
    )(Neo, type => type === 'artificer_knave');

    return scaleEnemyStats({ hp: 1880, max: 1880, dmg: 20, speed: 124, attackCd: 1, level }, 'artificer_knave');
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

    // Depth 11 -> floor((11-5)/3) = 2 HP credits (+90%). Lower than the old
    // +45%/level number (1114) now that HP earns a credit only every 3 levels;
    // the point of this test is that the FLOOR component stays cumulative across
    // the loop boundary, which the growing hp/dmg/speed below still demonstrate.
    expect(firstFloorAfterLoop.hp).toBe(572);
    expect(firstFloorAfterLoop.dmg).toBe(48);
    expect(firstFloorAfterLoop.speed).toBeCloseTo(156.52, 1);
  });

  test('starts the level bonus only after level five (HP linear, damage still scales)', () => {
    const levelFive = scaleAtDepth(1, 5);
    const levelSix = scaleAtDepth(1, 6);
    const levelTen = scaleAtDepth(1, 10);
    const levelFifteen = scaleAtDepth(1, 15);

    // HP earns one +45% credit every 3 levels above 5 now (was +45%/level, and
    // before that exponential 1.2^n), so a high-level player hitting a fresh
    // loop's floor 1 no longer faces multi-thousand-HP trash. Damage/speed/
    // attack-speed keep their original per-level curves — only HP is throttled.
    expect(levelFive).toMatchObject({ hp: 95, dmg: 10, speed: 95, enemyLevelAttackSpeedMultiplier: 1 });
    // Level 6 is still within the first HP credit's 3-level window: HP matches
    // level 5, while damage/speed/attack-speed already tick up per level.
    expect(levelSix).toMatchObject({ hp: 95, dmg: 11 });
    expect(levelSix.speed).toBeCloseTo(97.375);
    expect(levelSix.enemyLevelAttackSpeedMultiplier).toBeCloseTo(1.07);
    // Level 10 = floor((10-5)/3) = 1 HP credit -> +45% (was 309 at +45%/level).
    expect(levelTen.hp).toBe(138);
    expect(levelTen.dmg).toBe(18);
    expect(levelTen.enemyLevelAttackSpeedMultiplier).toBeCloseTo(Math.pow(1.07, 5));
    // Level 15 = floor((15-5)/3) = 3 HP credits -> +135% (was 523).
    expect(levelFifteen.hp).toBe(223);
    expect(levelFifteen.dmg).toBe(35);
    expect(levelFifteen.speed).toBeCloseTo(121.61, 1);
    expect(levelFifteen.enemyLevelAttackSpeedMultiplier).toBeCloseTo(Math.pow(1.07, 10));
  });

  test('applies meaningful compounded level HP scaling to bosses', () => {
    const mediumLowLevelBoss = scaleBossAtDepth(2, 2);
    const mediumHighLevelBoss = scaleBossAtDepth(2, 15);

    expect(mediumHighLevelBoss.hp).toBeGreaterThan(mediumLowLevelBoss.hp);
    expect(mediumHighLevelBoss.hp / mediumLowLevelBoss.hp).toBeGreaterThan(1.9);
    expect(mediumHighLevelBoss.max).toBe(mediumHighLevelBoss.hp);
    expect(mediumHighLevelBoss.enemyLevelAttackSpeedMultiplier).toBe(1);
  });

  test('elapsed time adds substantial boss-only HP pressure', () => {
    const immediateBoss = scaleBossAtDepth(2, 15, {}, 0);
    const fiveMinuteBoss = scaleBossAtDepth(2, 15, {}, 5);
    const tenMinuteBoss = scaleBossAtDepth(2, 15, {}, 10);

    expect(fiveMinuteBoss.hp).toBeGreaterThan(immediateBoss.hp * 1.27);
    expect(tenMinuteBoss.hp).toBeGreaterThan(immediateBoss.hp * 1.54);
    expect(tenMinuteBoss.max).toBe(tenMinuteBoss.hp);
  });

  test('difficulty strengthens flat, floor, level, and time boss HP pressure', () => {
    const mediumBoss = scaleBossAtDepth(2, 15);
    const harderBoss = scaleBossAtDepth(2, 15, {
      bossStatMultiplier: 1.16,
      bossHpGrowthMultiplier: 1.15,
      hpFloorScaleBonus: 0.02,
    });
    const mediumLateBoss = scaleBossAtDepth(2, 15, {}, 10);
    const harderLateBoss = scaleBossAtDepth(2, 15, {
      bossStatMultiplier: 1.16,
      bossHpGrowthMultiplier: 1.15,
      hpFloorScaleBonus: 0.02,
    }, 10);

    expect(harderBoss.hp).toBeGreaterThan(mediumBoss.hp);
    expect(harderLateBoss.hp / harderBoss.hp).toBeGreaterThan(mediumLateBoss.hp / mediumBoss.hp);
  });
});
