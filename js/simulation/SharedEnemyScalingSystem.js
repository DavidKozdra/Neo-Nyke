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

  // Legacy clients did not send a room difficulty. Preserve the campaign's
  // default Medium curve for those rooms rather than silently using neutral 1x.
  const DEFAULT_CAMPAIGN_ENEMY_DIFFICULTY = Object.freeze({
    key: 'medium',
    statMultiplier: 1.06,
    bossStatMultiplier: 0.95,
    bossHpGrowthMultiplier: 0.9,
    hpFloorScaleBonus: -0.02,
    speedMultiplier: 1.03,
    eliteHpMultiplier: 1,
    eliteChance: 0.16,
    eliteFloor: 8,
    miniBossChanceMultiplier: 1.18,
    roomWeightBonus: 0.05,
    bossProjectileSpeedMultiplier: 0.9,
    enemyReactionMultiplier: 1.06,
    rangedCadenceMultiplier: 0.95,
    supportPowerMultiplier: 1.08,
    shopPriceMultiplier: 1.08,
    itemDropChanceMultiplier: 1.1,
    ccResistScale: 0.12,
    statusResistScale: 0.06,
  });

  const DIFFICULTY_NUMERIC_BOUNDS = Object.freeze({
    statMultiplier: [0.1, 10],
    bossStatMultiplier: [0.1, 10],
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

  function scaleCampaignEnemyStats(baseStats = {}, options = {}) {
    const scaling = options.scaling && typeof options.scaling === 'object'
      ? { ...CAMPAIGN_ENEMY_SCALING, ...options.scaling }
      : CAMPAIGN_ENEMY_SCALING;
    const difficulty = options.difficulty && typeof options.difficulty === 'object'
      ? options.difficulty
      : DEFAULT_CAMPAIGN_ENEMY_DIFFICULTY;
    const progressionDepth = Math.max(1, Number(options.progressionDepth) || 1);
    const enemyLevel = Math.max(1, Number(options.enemyLevel ?? baseStats.level) || progressionDepth);
    const gameMinutes = Math.max(0, Number(options.elapsedSeconds) || 0) / 60;
    const gameMode = String(options.gameMode || 'normal');
    const endlessWaveIndex = gameMode === 'endless' ? Math.max(0, Number(options.endlessWave) || 0) : 0;
    const type = String(options.type || baseStats.type || '');
    const isBoss = options.isBoss === true;
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
    const damageScale = softCapEnemyScale(
      damageFloorMultiplier * damageLoopMultiplier * damageTimerMultiplier * difficultyMultiplier * endlessDamageMultiplier,
      endlessWaveIndex > 0 ? Math.max(damageSoftCap, scaling.endlessWaveDamageSoftCap) : damageSoftCap,
      isBoss ? 0.38 : 0.34,
    ) * bossLoopDamageMultiplier;
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
    sanitizeCampaignEnemyDifficulty,
    softCapEnemyScale,
    getEnemyLevelStatMultipliers,
    getBossLevelHpMultiplier,
    getBossTimeHpMultiplier,
    scaleCampaignEnemyStats,
  };
});
