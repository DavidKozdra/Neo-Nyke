
const {
  CAMPAIGN_ENEMY_SCALING,
  CAMPAIGN_ENEMY_DIFFICULTY_PRESETS,
  getCampaignGodRunPressure,
  scaleCampaignEnemyStats,
} = require('../js/simulation/SharedEnemyScalingSystem');

describe('enemy loop scaling', () => {

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

  test('keeps Easy, Medium, and Hard boss tuning in the shared difficulty table', () => {
    expect(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.easy).toEqual(expect.objectContaining({
      bossStatMultiplier: 0.8,
      enemyDamageMultiplier: 0.85,
      bossHpGrowthMultiplier: 0.65,
      bossProjectileSpeedMultiplier: 0.75,
    }));
    expect(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.medium).toEqual(expect.objectContaining({
      bossStatMultiplier: 0.95,
      enemyDamageMultiplier: 0.95,
      bossHpGrowthMultiplier: 0.9,
      bossProjectileSpeedMultiplier: 0.9,
    }));
    expect(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard).toEqual(expect.objectContaining({
      bossStatMultiplier: 1.16,
      enemyDamageMultiplier: 1,
      bossHpGrowthMultiplier: 1.15,
      bossProjectileSpeedMultiplier: 1.2,
    }));
  });

  test('reduces all Easy enemy damage by 15% and Medium enemy damage by 5%', () => {
    const base = { maxHealth: 100, contactDamage: 200, moveSpeed: 100 };
    const scaleDamage = enemyDamageMultiplier => scaleCampaignEnemyStats(base, {
      progressionDepth: 1,
      enemyLevel: 1,
      difficulty: {
        statMultiplier: 1,
        bossStatMultiplier: 1,
        speedMultiplier: 1,
        enemyDamageMultiplier,
      },
    }).contactDamage;
    const unchanged = scaleDamage(1);

    expect(scaleDamage(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.easy.enemyDamageMultiplier)).toBe(Math.round(unchanged * 0.85));
    expect(scaleDamage(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.medium.enemyDamageMultiplier)).toBe(Math.round(unchanged * 0.95));
    expect(scaleDamage(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard.enemyDamageMultiplier)).toBe(unchanged);
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

  test('owns campaign boss, God, and multiplayer party modifiers in the shared calculation', () => {
    const common = {
      progressionDepth: 1,
      enemyLevel: 1,
      elapsedSeconds: 0,
      difficulty: { statMultiplier: 1, bossStatMultiplier: 1, speedMultiplier: 1 },
    };
    const normal = scaleCampaignEnemyStats(
      { type: 'hunter', maxHealth: 100, contactDamage: 10, moveSpeed: 100 },
      { ...common, type: 'hunter' },
    );
    const boss = scaleCampaignEnemyStats(
      { type: 'queen_cult', maxHealth: 100, contactDamage: 10, moveSpeed: 100 },
      { ...common, type: 'queen_cult', isBoss: true },
    );
    const god = scaleCampaignEnemyStats(
      { type: 'god', maxHealth: 100, contactDamage: 10, moveSpeed: 100 },
      { ...common, type: 'god', isBoss: true },
    );
    const party = scaleCampaignEnemyStats(
      { type: 'hunter', maxHealth: 100, contactDamage: 10, moveSpeed: 100 },
      { ...common, type: 'hunter', partySize: 4 },
    );

    expect(boss.maxHealth).toBe(normal.maxHealth * 2);
    expect(god.maxHealth).toBe(boss.maxHealth * 5);
    expect(god.contactDamage).toBe(Math.round(boss.contactDamage * 2.2 * getCampaignGodRunPressure(0).damageMultiplier));
    expect(god.moveSpeed).toBeCloseTo(boss.moveSpeed * 1.06);
    expect(party.maxHealth).toBe(normal.maxHealth * 4);
    expect(party.contactDamage).toBe(normal.contactDamage);
    expect(party.moveSpeed).toBe(normal.moveSpeed);
  });

  test.each([
    {
      label: 'floor 1 Easy solo',
      base: { type: 'hunter', maxHealth: 84, contactDamage: 15, moveSpeed: 92, level: 1 },
      options: { type: 'hunter', progressionDepth: 1, enemyLevel: 1, elapsedSeconds: 0, difficultyKey: 'easy', partySize: 1 },
      expected: { maxHealth: 80, contactDamage: 12, moveSpeed: 87.4, attackSpeed: 1 },
    },
    {
      label: 'floor 10 Hard duo',
      base: { type: 'hunter', maxHealth: 84, contactDamage: 15, moveSpeed: 92, level: 12 },
      options: { type: 'hunter', progressionDepth: 10, enemyLevel: 12, elapsedSeconds: 480, difficultyKey: 'hard', partySize: 2 },
      expected: { maxHealth: 828, contactDamage: 91, moveSpeed: 151.070554, attackSpeed: 1.605781 },
    },
    {
      label: 'loop 2 Impossible trio',
      base: { type: 'cult_mage', maxHealth: 84, contactDamage: 18, moveSpeed: 58, level: 18 },
      options: { type: 'cult_mage', progressionDepth: 14, enemyLevel: 18, elapsedSeconds: 900, difficultyKey: 'impossible', partySize: 3 },
      expected: { maxHealth: 3576, contactDamage: 271, moveSpeed: 113.262559, attackSpeed: 2.25 },
    },
    {
      label: 'floor 7 Medium timed Cult Queen',
      base: { type: 'queen_cult', maxHealth: 912, contactDamage: 20, moveSpeed: 96, level: 9 },
      options: { type: 'queen_cult', isBoss: true, progressionDepth: 7, enemyLevel: 9, elapsedSeconds: 600, difficultyKey: 'medium', partySize: 1 },
      expected: { maxHealth: 6230, contactDamage: 71, moveSpeed: 130.248992, attackSpeed: 1.171659 },
    },
    {
      label: 'loop 2 God difficulty four-player final boss',
      base: { type: 'god', maxHealth: 920, contactDamage: 18, moveSpeed: 108, level: 20 },
      options: { type: 'god', isBoss: true, progressionDepth: 20, enemyLevel: 20, elapsedSeconds: 1200, difficultyKey: 'god', partySize: 4 },
      expected: { maxHealth: 4957480, contactDamage: 272, moveSpeed: 170.540439, attackSpeed: 1 },
    },
  ])('locks the shared parity matrix for $label', ({ base, options, expected }) => {
    const { difficultyKey, ...scalingOptions } = options;
    const result = scaleCampaignEnemyStats(base, {
      ...scalingOptions,
      maxFloor: 10,
      difficulty: CAMPAIGN_ENEMY_DIFFICULTY_PRESETS[difficultyKey],
    });

    expect(result.maxHealth).toBe(expected.maxHealth);
    expect(result.contactDamage).toBe(expected.contactDamage);
    expect(result.moveSpeed).toBeCloseTo(expected.moveSpeed, 5);
    expect(result.enemyLevelAttackSpeedMultiplier).toBeCloseTo(expected.attackSpeed, 5);
  });
});
