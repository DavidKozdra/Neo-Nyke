(function initializeSharedEnemyScalingSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEnemyScalingApi() {
  'use strict';

  const ENEMY_UNIVERSAL_STAT_MULTIPLIER = 0.95;

  // One source of truth for the campaign curve. Browser campaign enemies and the
  // multiplayer authority both consume this exact object and calculation.
  const CAMPAIGN_ENEMY_SCALING = Object.freeze({
    floor: 0.14,
    levelHpBonus: 0.45,
    bossLevelHpRate: 0.055,
    bossLevelHpSoftCap: 3.25,
    bossLevelHpSoftCapCurve: 0.55,
    bossHpMinute: 0.055,
    loop: 0.26,
    loopHpCurve: 0.78,
    damageFloor: 0.095,
    damageLoop: 0.2,
    damageMinute: 0.085,
    damageTimeSoftCap: 1.9,
    speedFloor: 0.035,
    speedLoop: 0.07,
    speedMinute: 0.018,
    damageSoftCap: 2.15,
    bossDamageSoftCap: 2.45,
    speedSoftCap: 1.38,
    bossLoopHp: 0.20,
    bossLoopDamage: 0.05,
    endlessWaveHp: 0.12,
    endlessWaveDamage: 0.06,
    endlessWaveSpeed: 0.012,
    endlessWaveDamageSoftCap: 2.6,
    endlessWaveSpeedSoftCap: 1.5,
  });

  // Network room creation accepts a difficulty key from clients, but named
  // presets are authority-owned. Keeping the gameplay fields here gives the
  // browser campaign and server one canonical preset table; only `custom`
  // accepts sanitized client-provided overrides.
  const CAMPAIGN_ENEMY_DIFFICULTY_PRESETS = Object.freeze({
    easy: Object.freeze({
      key: 'easy',
      waveBonus: 0,
      eliteFloor: 8,
      eliteChance: 0.12,
      miniBossChanceMultiplier: 1,
      roomWeightBonus: 0,
      statMultiplier: 1,
      bossStatMultiplier: 0.8,
      enemyDamageMultiplier: 0.85,
      bossHpGrowthMultiplier: 0.65,
      hpFloorScaleBonus: -0.045,
      eliteHpMultiplier: 0.6,
      itemDropChanceMultiplier: 1.15,
      speedMultiplier: 1,
      bossProjectileSpeedMultiplier: 0.75,
      enemyReactionMultiplier: 1,
      rangedCadenceMultiplier: 1,
      supportPowerMultiplier: 1,
      shopPriceMultiplier: 1,
      ccResistScale: 0.04,
      statusResistScale: 0,
    }),
    medium: Object.freeze({
      key: 'medium',
      waveBonus: 0,
      eliteFloor: 8,
      eliteChance: 0.16,
      miniBossChanceMultiplier: 1.18,
      roomWeightBonus: 0.05,
      statMultiplier: 1.06,
      bossStatMultiplier: 0.95,
      enemyDamageMultiplier: 0.95,
      bossHpGrowthMultiplier: 0.9,
      itemDropChanceMultiplier: 1.1,
      hpFloorScaleBonus: -0.02,
      speedMultiplier: 1.03,
      bossProjectileSpeedMultiplier: 0.9,
      enemyReactionMultiplier: 1.06,
      rangedCadenceMultiplier: 0.95,
      supportPowerMultiplier: 1.08,
      shopPriceMultiplier: 1.08,
      ccResistScale: 0.12,
      statusResistScale: 0.06,
    }),
    hard: Object.freeze({
      key: 'hard',
      waveBonus: 1,
      eliteFloor: 7,
      eliteChance: 0.2,
      miniBossChanceMultiplier: 1.35,
      roomWeightBonus: 0.1,
      statMultiplier: 1.12,
      bossStatMultiplier: 1.16,
      enemyDamageMultiplier: 1,
      bossHpGrowthMultiplier: 1.15,
      hpFloorScaleBonus: 0.02,
      speedMultiplier: 1.06,
      bossProjectileSpeedMultiplier: 1.2,
      enemyReactionMultiplier: 1.12,
      rangedCadenceMultiplier: 0.9,
      supportPowerMultiplier: 1.14,
      shopPriceMultiplier: 1.16,
      ccResistScale: 0.30,
      statusResistScale: 0.16,
      enemyBleedDamageMultiplier: 0.8,
      itemDropChanceMultiplier: 0.8,
      shopItemOffers: 2,
    }),
    impossible: Object.freeze({
      key: 'impossible',
      waveBonus: 3,
      eliteFloor: 6,
      eliteChance: 0.26,
      miniBossChanceMultiplier: 1.6,
      roomWeightBonus: 0.16,
      statMultiplier: 1.22,
      bossStatMultiplier: 1.28,
      enemyDamageMultiplier: 1,
      bossHpGrowthMultiplier: 1.35,
      hpFloorScaleBonus: 0.05,
      speedMultiplier: 1.1,
      bossProjectileSpeedMultiplier: 1.3,
      enemyReactionMultiplier: 1.2,
      rangedCadenceMultiplier: 0.82,
      supportPowerMultiplier: 1.22,
      shopPriceMultiplier: 1.28,
      ccResistScale: 0.45,
      statusResistScale: 0.28,
      enemyLoopDamageReduction: 0.05,
      enemyBleedDamageMultiplier: 0.65,
      itemDropChanceMultiplier: 0.45,
      shopItemOffers: 2,
    }),
    god: Object.freeze({
      key: 'god',
      waveBonus: 4,
      eliteFloor: 5,
      eliteChance: 0.32,
      miniBossChanceMultiplier: 1.9,
      roomWeightBonus: 0.22,
      statMultiplier: 1.5,
      bossStatMultiplier: 1.6,
      enemyDamageMultiplier: 1,
      bossHpGrowthMultiplier: 1.65,
      hpFloorScaleBonus: 0.08,
      speedMultiplier: 1.14,
      bossProjectileSpeedMultiplier: 1.4,
      enemyReactionMultiplier: 1.28,
      rangedCadenceMultiplier: 0.74,
      supportPowerMultiplier: 1.3,
      shopPriceMultiplier: 1.42,
      ccResistScale: 0.6,
      statusResistScale: 0.4,
      enemyLoopDamageReduction: 0.05,
      enemyBleedDamageMultiplier: 0.5,
      itemDropChanceMultiplier: 0.3,
      shopItemOffers: 1,
      startRoomEliteCount: 2,
      rivalItemsPerFloor: 5,
      rivalLevelBonusPerFloor: 2,
    }),
    custom: Object.freeze({
      key: 'custom',
      waveBonus: 0,
      eliteFloor: 8,
      eliteChance: 0.12,
      miniBossChanceMultiplier: 1,
      roomWeightBonus: 0,
      statMultiplier: 1,
      bossStatMultiplier: 1,
      enemyDamageMultiplier: 1,
      bossHpGrowthMultiplier: 1,
      hpFloorScaleBonus: 0,
      speedMultiplier: 1,
      enemyReactionMultiplier: 1,
      rangedCadenceMultiplier: 1,
      supportPowerMultiplier: 1,
      shopPriceMultiplier: 1,
      ccResistScale: 0,
      statusResistScale: 0,
    }),
  });
  const DEFAULT_CAMPAIGN_ENEMY_DIFFICULTY = CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.medium;

  const DIFFICULTY_NUMERIC_BOUNDS = Object.freeze({
    waveBonus: [0, 20],
    statMultiplier: [0.1, 10],
    bossStatMultiplier: [0.1, 10],
    enemyDamageMultiplier: [0, 10],
    bossHpGrowthMultiplier: [0.1, 10],
    hpFloorScaleBonus: [-0.14, 2],
    speedMultiplier: [0.1, 5],
    eliteHpMultiplier: [0.1, 10],
    eliteChance: [0, 1],
    eliteFloor: [1, 10_000],
    miniBossChanceMultiplier: [0, 10],
    roomWeightBonus: [-1, 10],
    bossProjectileSpeedMultiplier: [0.1, 5],
    enemyReactionMultiplier: [0.1, 5],
    rangedCadenceMultiplier: [0.1, 5],
    supportPowerMultiplier: [0.1, 10],
    shopPriceMultiplier: [0.1, 10],
    itemDropChanceMultiplier: [0, 10],
    ccResistScale: [0, 10],
    statusResistScale: [0, 10],
    enemyBleedDamageMultiplier: [0, 10],
    enemyLoopDamageReduction: [0, 1],
    shopItemOffers: [1, 10],
    startRoomEliteCount: [0, 20],
    rivalItemsPerFloor: [0, 20],
    rivalLevelBonusPerFloor: [0, 20],
  });

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function sanitizeCampaignEnemyDifficulty(source, fallback = DEFAULT_CAMPAIGN_ENEMY_DIFFICULTY) {
    const input = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const base = fallback && typeof fallback === 'object' && !Array.isArray(fallback)
      ? fallback
      : DEFAULT_CAMPAIGN_ENEMY_DIFFICULTY;
    const result = { ...base };
    const requestedKey = String(input.key || base.key || 'medium').toLowerCase();
    result.key = ['easy', 'medium', 'hard', 'impossible', 'god', 'custom'].includes(requestedKey)
      ? requestedKey
      : 'medium';
    Object.entries(DIFFICULTY_NUMERIC_BOUNDS).forEach(([key, [minimum, maximum]]) => {
      if (!Object.prototype.hasOwnProperty.call(input, key)) return;
      const numeric = Number(input[key]);
      if (Number.isFinite(numeric)) result[key] = clamp(numeric, minimum, maximum);
    });
    return result;
  }

  function resolveCampaignEnemyDifficulty(source) {
    const input = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const requestedKey = String(input.key || 'medium').toLowerCase();
    const key = Object.prototype.hasOwnProperty.call(CAMPAIGN_ENEMY_DIFFICULTY_PRESETS, requestedKey)
      ? requestedKey
      : 'medium';
    const preset = CAMPAIGN_ENEMY_DIFFICULTY_PRESETS[key];
    return key === 'custom'
      ? sanitizeCampaignEnemyDifficulty(input, preset)
      : { ...preset };
  }

  function softCapEnemyScale(value, cap, curve = 0.35) {
    const numericValue = Math.max(1, Number(value) || 1);
    const numericCap = Math.max(1, Number(cap) || 1);
    if (numericValue <= numericCap) return numericValue;
    return numericCap + Math.sqrt(numericValue - numericCap) * curve;
  }

  function getEnemyLevelStatMultipliers(level, scaling = CAMPAIGN_ENEMY_SCALING) {
    const levelsAboveFive = Math.max(0, Math.floor(Number(level || 1)) - 5);
    if (levelsAboveFive <= 0) return { hp: 1, damage: 1, speed: 1, attackSpeed: 1 };
    const hpCredits = Math.floor(levelsAboveFive / 3);
    return {
      hp: 1 + hpCredits * (scaling.levelHpBonus ?? 0.15),
      damage: Math.pow(1.14, levelsAboveFive),
      speed: Math.min(1.35, Math.pow(1.025, levelsAboveFive)),
      attackSpeed: Math.min(2.25, Math.pow(1.07, levelsAboveFive)),
    };
  }

  function getBossLevelHpMultiplier(level, difficulty, scaling = CAMPAIGN_ENEMY_SCALING) {
    const levelsAboveOne = Math.max(0, Math.floor(Number(level || 1)) - 1);
    const difficultyGrowth = Math.max(0.25, Number(difficulty?.bossHpGrowthMultiplier ?? 1));
    const perLevelRate = Math.max(0, Number(scaling.bossLevelHpRate ?? 0.055)) * difficultyGrowth;
    return softCapEnemyScale(
      Math.pow(1 + perLevelRate, levelsAboveOne),
      scaling.bossLevelHpSoftCap ?? 3.25,
      scaling.bossLevelHpSoftCapCurve ?? 0.55,
    );
  }

  function getBossTimeHpMultiplier(gameMinutes, difficulty, scaling = CAMPAIGN_ENEMY_SCALING) {
    const difficultyGrowth = Math.max(0.25, Number(difficulty?.bossHpGrowthMultiplier ?? 1));
    const perMinuteRate = Math.max(0, Number(scaling.bossHpMinute ?? 0.055)) * difficultyGrowth;
    return 1 + Math.max(0, Number(gameMinutes || 0)) * perMinuteRate;
  }

  function getCampaignGodRunPressure(elapsedSeconds = 0) {
    const minutes = Math.max(0, Number(elapsedSeconds) || 0) / 60;
    return {
      minutes,
      damageMultiplier: Math.min(1.9, 1.18 + minutes * 0.045),
    };
  }

  function scaleCampaignEnemyStats(baseStats = {}, options = {}) {
    const scaling = options.scaling && typeof options.scaling === 'object'
      ? { ...CAMPAIGN_ENEMY_SCALING, ...options.scaling }
      : CAMPAIGN_ENEMY_SCALING;
    const difficulty = options.difficulty && typeof options.difficulty === 'object'
      ? options.difficulty
      : DEFAULT_CAMPAIGN_ENEMY_DIFFICULTY;
    const progressionDepth = Math.max(1, Number(options.progressionDepth) || 1);
    const enemyLevel = Math.max(1, Number(options.enemyLevel ?? baseStats.level) || progressionDepth);
    const elapsedSeconds = Math.max(0, Number(options.elapsedSeconds) || 0);
    const gameMinutes = elapsedSeconds / 60;
    const gameMode = String(options.gameMode || 'normal');
    const endlessWaveIndex = gameMode === 'endless' ? Math.max(0, Number(options.endlessWave) || 0) : 0;
    const type = String(options.type || baseStats.type || '');
    const isBoss = options.isBoss === true;
    const partySize = Math.max(1, Math.trunc(Number(options.partySize) || 1));
    const levelMultipliers = isBoss
      ? {
        hp: getBossLevelHpMultiplier(enemyLevel, difficulty, scaling),
        damage: type === 'god' ? 1 : softCapEnemyScale(Math.pow(1.05, Math.max(0, enemyLevel - 1)), 2.15, 0.22),
        speed: 1,
        attackSpeed: type === 'god' ? 1 : Math.min(1.35, Math.pow(1.02, Math.max(0, enemyLevel - 1))),
      }
      : getEnemyLevelStatMultipliers(enemyLevel, scaling);
    const loopNumber = Math.max(1, Math.floor((progressionDepth - 1) / Math.max(1, Number(options.maxFloor) || 10)) + 1);
    const floorsCleared = progressionDepth - 1;
    const hpFloorRate = Number(scaling.floor || 0) + Number(difficulty.hpFloorScaleBonus || 0);
    const floorMultiplier = 1 + floorsCleared * hpFloorRate;
    const loopMultiplier = 1
      + Number(scaling.loop || 0) * Math.pow(Math.max(0, loopNumber - 1), scaling.loopHpCurve ?? 1);
    const difficultyMultiplier = Math.max(0, Number(isBoss
      ? difficulty.bossStatMultiplier
      : difficulty.statMultiplier) || 1);
    const bossTimeHpMultiplier = isBoss ? getBossTimeHpMultiplier(gameMinutes, difficulty, scaling) : 1;
    const endlessHpMultiplier = 1 + endlessWaveIndex * Number(scaling.endlessWaveHp || 0);
    const endlessDamageMultiplier = 1 + endlessWaveIndex * Number(scaling.endlessWaveDamage || 0);
    const endlessSpeedMultiplier = 1 + endlessWaveIndex * Number(scaling.endlessWaveSpeed || 0);
    const bossLoopHpMultiplier = isBoss
      ? 1 + (loopNumber - 1) * Number(scaling.bossLoopHp || 0)
      : 1;
    const bossLoopDamageMultiplier = isBoss
      ? 1 + (loopNumber - 1) * Number(scaling.bossLoopDamage || 0)
      : 1;
    const hpScale = floorMultiplier * loopMultiplier * difficultyMultiplier * endlessHpMultiplier
      * bossLoopHpMultiplier * bossTimeHpMultiplier;
    const damageFloorMultiplier = 1 + floorsCleared * Number(scaling.damageFloor ?? scaling.floor);
    const damageLoopMultiplier = 1 + (loopNumber - 1) * Number(scaling.damageLoop ?? scaling.loop);
    const damageTimerMultiplier = softCapEnemyScale(
      1 + gameMinutes * Number(scaling.damageMinute ?? 0.085),
      scaling.damageTimeSoftCap ?? 1.9,
      0.3,
    );
    const damageSoftCap = isBoss ? (scaling.bossDamageSoftCap ?? 2.45) : (scaling.damageSoftCap ?? 2.15);
    // This final difficulty modifier is intentionally outside the progression
    // curve: Easy and Medium reduce every scaled enemy damage stat by their
    // authored percentage without also changing HP, speed, or soft-cap timing.
    const enemyDamageMultiplier = Math.max(0, Number(difficulty.enemyDamageMultiplier ?? 1));
    const damageScale = softCapEnemyScale(
      damageFloorMultiplier * damageLoopMultiplier * damageTimerMultiplier * difficultyMultiplier * endlessDamageMultiplier,
      endlessWaveIndex > 0 ? Math.max(damageSoftCap, scaling.endlessWaveDamageSoftCap) : damageSoftCap,
      isBoss ? 0.38 : 0.34,
    ) * bossLoopDamageMultiplier * enemyDamageMultiplier;
    const speedFloorMultiplier = 1 + floorsCleared * Number(scaling.speedFloor ?? 0.035);
    const speedLoopMultiplier = 1 + (loopNumber - 1) * Number(scaling.speedLoop ?? 0.07);
    const speedTimerMultiplier = 1 + gameMinutes * Number(scaling.speedMinute ?? 0.018);
    const speedScale = softCapEnemyScale(
      speedFloorMultiplier * speedLoopMultiplier * speedTimerMultiplier
        * Math.max(0, Number(difficulty.speedMultiplier) || 1) * endlessSpeedMultiplier,
      endlessWaveIndex > 0
        ? Math.max(scaling.speedSoftCap ?? 1.38, scaling.endlessWaveSpeedSoftCap)
        : (scaling.speedSoftCap ?? 1.38),
      0.16,
    );
    const baseHealth = Math.max(1, Number(baseStats.maxHealth ?? baseStats.health ?? baseStats.max ?? baseStats.hp) || 1);
    const baseDamage = Math.max(0, Number(baseStats.contactDamage ?? baseStats.damage ?? baseStats.dmg) || 0);
    const baseSpeed = Math.max(0, Number(baseStats.moveSpeed ?? baseStats.speed) || 0);
    let maxHealth = Math.max(1, Math.round(baseHealth * hpScale * levelMultipliers.hp * ENEMY_UNIVERSAL_STAT_MULTIPLIER));
    let contactDamage = Math.max(1, Math.round(baseDamage * damageScale * levelMultipliers.damage * ENEMY_UNIVERSAL_STAT_MULTIPLIER));
    let moveSpeed = baseSpeed * speedScale * levelMultipliers.speed * ENEMY_UNIVERSAL_STAT_MULTIPLIER;
    if (options.sandbox && typeof options.sandbox === 'object') {
      maxHealth = Math.max(1, Math.round(maxHealth * Math.max(0, Number(options.sandbox.enemyStatMultiplier) || 0)));
      contactDamage = Math.max(1, Math.round(contactDamage * Math.max(0, Number(options.sandbox.enemyStatMultiplier) || 0)));
      moveSpeed *= Math.max(0, Number(options.sandbox.enemySpeedMultiplier) || 0);
    }
    // These are part of the campaign spawn contract, not caller-owned boss
    // patches. Keeping them here makes browser and authority stats identical.
    if (isBoss) maxHealth = Math.max(1, Math.round(maxHealth * 2));
    if (type === 'god') {
      const pressure = getCampaignGodRunPressure(elapsedSeconds);
      maxHealth = Math.max(1, Math.round(maxHealth * 5));
      contactDamage = Math.max(1, Math.round(contactDamage * 2.2 * pressure.damageMultiplier));
      moveSpeed *= 1.06;
    }
    // One hero is exact campaign parity. Each extra network hero contributes one
    // campaign hero's damage budget, so authority HP scales linearly while enemy
    // damage and movement stay at the authored campaign values.
    maxHealth = Math.max(1, Math.round(maxHealth * partySize));
    return {
      ...baseStats,
      level: enemyLevel,
      maxHealth,
      health: maxHealth,
      contactDamage,
      moveSpeed,
      enemyLevelAttackSpeedMultiplier: levelMultipliers.attackSpeed,
    };
  }

  return {
    ENEMY_UNIVERSAL_STAT_MULTIPLIER,
    CAMPAIGN_ENEMY_SCALING,
    DEFAULT_CAMPAIGN_ENEMY_DIFFICULTY,
    CAMPAIGN_ENEMY_DIFFICULTY_PRESETS,
    sanitizeCampaignEnemyDifficulty,
    resolveCampaignEnemyDifficulty,
    softCapEnemyScale,
    getEnemyLevelStatMultipliers,
    getBossLevelHpMultiplier,
    getBossTimeHpMultiplier,
    getCampaignGodRunPressure,
    scaleCampaignEnemyStats,
  };
});
