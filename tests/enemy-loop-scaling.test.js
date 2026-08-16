const fs = require('node:fs');
const path = require('node:path');

const {
  CAMPAIGN_ENEMY_SCALING,
  scaleCampaignEnemyStats,
} = require('../js/simulation/SharedEnemyScalingSystem');

describe('enemy loop scaling', () => {
  const coreSource = fs.readFileSync(path.join(__dirname, '../js/core/game-core.js'), 'utf8');

  // Mirrors js/game/enemies.js scaleEnemyStats(): the campaign wrapper feeds the
  // shared curve and maps its hp/max/dmg/speed names back onto campaign stats.
  function scaleCampaign(baseStats, options) {
    const scaled = scaleCampaignEnemyStats({
      ...baseStats,
      maxHealth: baseStats.max,
      health: baseStats.hp,
      contactDamage: baseStats.dmg,
      moveSpeed: baseStats.speed,
    }, {
      maxFloor: 10,
      gameMode: 'normal',
      endlessWave: 0,
      scaling: CAMPAIGN_ENEMY_SCALING,
      sandbox: null,
      ...options,
    });
    return {
      ...baseStats,
      hp: scaled.maxHealth,
      max: scaled.maxHealth,
      dmg: scaled.contactDamage,
      speed: scaled.moveSpeed,
      enemyLevelAttackSpeedMultiplier: scaled.enemyLevelAttackSpeedMultiplier,
    };
  }

  function scaleAtDepth(floorsEntered, level = floorsEntered) {
    return scaleCampaign({ hp: 100, max: 100, dmg: 10, speed: 100, attackCd: 1, level }, {
      type: 'hunter',
      isBoss: false,
      progressionDepth: floorsEntered,
      enemyLevel: level,
      elapsedSeconds: 0,
      difficulty: { statMultiplier: 1, bossStatMultiplier: 1, speedMultiplier: 1 },
    });
  }

  function scaleBossAtDepth(floorsEntered, level = floorsEntered, difficulty = {}, gameMinutes = 0) {
    return scaleCampaign({ hp: 1880, max: 1880, dmg: 20, speed: 124, attackCd: 1, level }, {
      type: 'artificer_knave',
      isBoss: true,
      progressionDepth: floorsEntered,
      enemyLevel: level,
      elapsedSeconds: gameMinutes * 60,
      difficulty: {
        statMultiplier: 1.06,
        bossStatMultiplier: 0.95,
        bossHpGrowthMultiplier: 0.9,
        hpFloorScaleBonus: -0.02,
        speedMultiplier: 1.03,
        ...difficulty,
      },
    });
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
    expect(firstFloorAfterLoop.hp).toBe(546);
    expect(firstFloorAfterLoop.dmg).toBe(48);
    expect(firstFloorAfterLoop.speed).toBeCloseTo(156.51, 1);
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
    expect(mediumHighLevelBoss.hp / mediumLowLevelBoss.hp).toBeGreaterThan(1.8);
    expect(mediumHighLevelBoss.max).toBe(mediumHighLevelBoss.hp);
    expect(mediumHighLevelBoss.enemyLevelAttackSpeedMultiplier).toBeCloseTo(Math.pow(1.02, 14));
  });

  test('elapsed time adds substantial boss-only HP pressure', () => {
    const immediateBoss = scaleBossAtDepth(2, 15, {}, 0);
    const fiveMinuteBoss = scaleBossAtDepth(2, 15, {}, 5);
    const tenMinuteBoss = scaleBossAtDepth(2, 15, {}, 10);

    expect(fiveMinuteBoss.hp).toBeGreaterThan(immediateBoss.hp * 1.23);
    expect(tenMinuteBoss.hp).toBeGreaterThan(immediateBoss.hp * 1.48);
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

  test('keeps the Easy and Medium boss nerfs in the shared difficulty table', () => {
    const difficultySource = coreSource.slice(
      coreSource.indexOf('export const DIFFICULTY_DEFS'),
      coreSource.indexOf('export const CHALLENGE_DEFS'),
    );
    const easyBlock = difficultySource.slice(difficultySource.indexOf('  easy: {'), difficultySource.indexOf('  medium: {'));
    const mediumBlock = difficultySource.slice(difficultySource.indexOf('  medium: {'), difficultySource.indexOf('  hard: {'));
    const hardBlock = difficultySource.slice(difficultySource.indexOf('  hard: {'), difficultySource.indexOf('  impossible: {'));

    expect(easyBlock).toContain('bossStatMultiplier: 0.8');
    expect(easyBlock).toContain('bossHpGrowthMultiplier: 0.65');
    expect(easyBlock).toContain('bossProjectileSpeedMultiplier: 0.75');
    expect(mediumBlock).toContain('bossStatMultiplier: 0.95');
    expect(mediumBlock).toContain('bossHpGrowthMultiplier: 0.9');
    expect(mediumBlock).toContain('bossProjectileSpeedMultiplier: 0.9');
    expect(hardBlock).toContain('bossStatMultiplier: 1.16');
    expect(hardBlock).toContain('bossHpGrowthMultiplier: 1.15');
    expect(hardBlock).toContain('bossProjectileSpeedMultiplier: 1.2');
  });

  test('reduces Easy and Medium boss health and damage from their previous profiles', () => {
    const easyBoss = scaleBossAtDepth(5, 8, {
      bossStatMultiplier: 0.8,
      bossHpGrowthMultiplier: 0.65,
      hpFloorScaleBonus: -0.045,
    }, 8);
    const previousEasyBoss = scaleBossAtDepth(5, 8, {
      bossStatMultiplier: 1,
      bossHpGrowthMultiplier: 0.75,
      hpFloorScaleBonus: -0.045,
    }, 8);
    const mediumBoss = scaleBossAtDepth(5, 8, {}, 8);
    const previousMediumBoss = scaleBossAtDepth(5, 8, {
      bossStatMultiplier: 1.08,
      bossHpGrowthMultiplier: 1,
    }, 8);

    expect(easyBoss.hp).toBeLessThan(previousEasyBoss.hp);
    expect(easyBoss.dmg).toBeLessThan(previousEasyBoss.dmg);
    expect(mediumBoss.hp).toBeLessThan(previousMediumBoss.hp);
    expect(mediumBoss.dmg).toBeLessThan(previousMediumBoss.dmg);
  });
});
