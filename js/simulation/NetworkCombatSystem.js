(function initializeNetworkCombatSystem(root, factory) {
  const contentApi = typeof require === 'function'
    ? { ...require('./SharedCombatContent.js'), ...require('./SharedMoveContent.js'), ...require('./SharedEnemyContent.js'), ...require('./SharedEnemyAISystem.js'), ...require('./SharedRivalSystem.js'), ...require('./SharedBossIntroSystem.js'), ...require('./SharedEnemyDropSystem.js'), ...require('./SharedEncounterSystem.js'), ...require('./SharedItemContent.js'), ...require('./SharedItemDefinitions.js'), ...require('./SharedEliteSystem.js'), ...require('./SharedItemEffectSystem.js'), ...require('./SharedEventItemSystem.js'), ...require('./SharedDamageSystem.js'), ...require('./SharedPlayerDamageSystem.js'), ...require('./SharedPotionSystem.js'), ...require('./SharedHazardSystem.js'), ...require('./SharedHitResolutionSystem.js'), ...require('./SharedStatusSystem.js'), ...require('./SharedProjectileSystem.js'), ...require('./SharedProgressionSystem.js'), ...require('./SharedRoomInteriorSystem.js'), ...require('./SharedWorldMutationSystem.js'), ...require('./SharedForgeSystem.js'), ...require('./SharedInventorySystem.js'), ...require('./SharedAcquisitionSystem.js'), ...require('./SharedChestSystem.js'), ...require('./SharedShopSystem.js'), ...require('./SharedEndlessIntermissionSystem.js'), ...require('./LoopContentSystem.js'), ...require('./SharedEndgameSystem.js'), ...require('./SharedSpecialRoomSystem.js'), ...require('./SharedRoomLifecycleSystem.js'), ...require('./SharedEnemyBehaviorSystem.js'), ...require('./CampaignMovementRules.js'), ...require('./SharedDashSystem.js'), ...require('./SharedBeamPathSystem.js'), ...require('./SharedMirrorCombatSystem.js'), ...require('./SharedMoveEffectSystem.js') }
    : { ...(root.NeoNyke?.content || {}), ...(root.NeoNyke?.simulation || {}) };
  const floorApi = typeof require === 'function' ? require('./DeterministicFloorGenerator.js') : (root.NeoNyke?.simulation || {});
  const api = factory(root.NeoNyke?.simulation || {}, contentApi, floorApi);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNetworkCombatSystemApi(browserApi, contentApi, floorApi) {
  'use strict';

  const generateFloorLayout = floorApi?.generateFloorLayout || browserApi?.generateFloorLayout;
  const MAX_FLOOR = 10;
  const STAIRS_DWELL_TICKS = 30; // ~1.5s at 20 Hz — a deliberate hold, not a walk-over.
  const REVIVE_DWELL_TICKS = 40; // ~2s standing over a downed ally to bring them back.
  const REVIVE_RADIUS = 44;
  const REVIVE_HEALTH_FRACTION = 0.4;
  const RIVAL_RESPAWN_TICKS = 60;
  const ATTACK_COOLDOWN_TICKS = 7;
  const PROJECTILE_SPEED = 520;
  const PROJECTILE_DAMAGE = 30;
  const PROJECTILE_LIFETIME_TICKS = 24;
  // Keep defeated enemies authoritative for the campaign's full 11-second
  // corpse presentation. Clients adapt these records into the same deadBodies
  // renderer; removing them after the old 0.4-second network flash made combat
  // visibly unlike single-player and made late snapshots lose the corpse.
  const ENEMY_DEATH_TICKS = 220;
  const BOSS_RUSH_ORDER = Object.freeze([
    'queen_cult', 'bulk_golem', 'antony_blemmye', 'handsome_devil', 'artificer_knave', 'god',
  ]);
  const ENCOUNTER_ROOM_TYPES = new Set(['start', 'combat', 'challenge', 'ladder', 'boss', 'god']);
  // Match the campaign: ordinary combat rooms remain escapable. Only authored
  // commitment encounters seal their doors until resolved.
  const LOCKING_ENCOUNTER_ROOM_TYPES = new Set(['challenge', 'ladder', 'boss', 'god']);
  const {
    CHARACTER_DEFAULT_WEAPONS = {},
    CHARACTER_STARTING_ITEMS = {},
    DEFAULT_WEAPON_ATTACKS = {},
    WEAPON_PROJECTILE_ATTACKS = {},
    PROJECTILE_TYPE_DEFS = {},
    buildCampaignWeaponProjectileConfig = () => null,
    WEAPON_BASE_STATS = {},
    MOVE_BASE_STATS = {},
    FLYING_UNTOUCHABLE_DURATION_SECONDS = 5,
    MOVE_SLOT_BY_KEY = {},
    KIT_ALTERNATIVES = {},
    CONTINUOUS_BEAM_MOVES = [],
    SHARED_BEHAVIOR_TYPES = [],
    createCampaignEnemyBehaviors = null,
    createCampaignRivalBrain = characterKey => ({ stance: characterKey === 'thorn_knight' ? 'hostile' : 'neutral', intention: characterKey === 'thorn_knight' ? 'engage' : 'observe' }),
    getCampaignRivalLoadout = () => [],
    resolveCampaignRivalDisposition = options => ({ brain: options.brain, transition: '', reason: '' }),
    createCampaignBulkGolemSplitPlan = () => [],
    resolveCampaignBossIntro = () => null,
    BEAM_CHANNEL_PROFILES = {},
    BEAM_RECOIL_ACCEL = 45,
    WIZARD_LAZER_EXTRA_RECOIL = 220,
    steerBeamChannelAngle = (_moveKey, angle) => Number(angle) || 0,
    getDefaultMoveLoadout = () => ({ melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' }),
    getMoveBaseCharges = () => 1,
    createPowerDiskBurstDescriptors = () => [],
    ENEMY_CATALOG = {},
    STANDARD_ENEMY_TYPES = [],
    BOSS_ENEMY_TYPES = [],
    ELITE_POWER_TYPES = [],
    resolveCampaignEliteProfile = base => base,
    resolveCampaignEliteCrit = () => ({ isCrit: false, multiplier: 1 }),
    resolveCampaignElitePlayerHitProcs = () => [],
    resolveCampaignEnemyAggressionHit = options => ({ damage: Number(options?.damage || 0), isCrit: false }),
    resolveCampaignEnemyDrop = () => null,
    getCampaignEnemyCoinReward = () => 0,
    getCampaignEnemyExperienceReward = () => 0,
    createCampaignCoinDropPlan = () => [],
    resolveCampaignBossBonusDrops = () => [],
    rollCampaignGodItem = () => '',
    resolveCampaignRivalKillReward = () => ({ coins: 0, experience: 0, finalRelic: false }),
    rollCampaignFinalRivalRelic = () => '',
    getEnemyDefinition = type => ENEMY_CATALOG[type],
    getCampaignEncounterPlan = () => [],
    getCampaignFloorBossType = () => 'queen_cult',
    createCampaignEndlessWavePlan = () => [],
    createCampaignBossRewardPlan = () => ({ ok: false, pickups: [] }),
    createCampaignGodEndgamePlan = () => [],
    resolveCampaignGodEndgameChoice = () => ({ ok: false, reason: 'ENDGAME_UNAVAILABLE' }),
    createCampaignLoopBlueRewardPlan = () => [],
    getLoopFloorPlan = () => ({ recoveryFraction: 0.2 }),
    invokeCampaignEnemyAI = () => false,
    segmentHitsCircle = () => null,
    getCharacterDefaultWeapon = characterKey => CHARACTER_DEFAULT_WEAPONS[characterKey] || 'thorns_bleed_blade',
    createCampaignItemChoices = () => [],
    createBossRushStarterItemPlan = () => [],
    createTreasureChestPlan = () => [],
    ITEM_DROP_ENTRIES = [],
    ITEM_DEFS = {},
    rollCampaignItem = () => '',
    rollCampaignScroll = () => '',
    WHITE_WEAPON_POOL = [],
    PURPLE_WEAPON_POOL = [],
    GOD_WEAPON_POOL = [],
    applyForgeCommand = () => ({ ok: false, reason: 'FORGE_UNAVAILABLE' }),
    collectCampaignItem: collectSharedCampaignItem = () => ({ ok: false }),
    applyInventoryCommand = () => ({ ok: false, reason: 'INVENTORY_UNAVAILABLE' }),
    applyAcquisitionCommand = () => ({ ok: false, reason: 'ACQUISITION_UNAVAILABLE' }),
    collectCampaignPickup = () => ({ ok: false, reason: 'ACQUISITION_UNAVAILABLE' }),
    getCampaignRichMansBluesCrystalReward = (floor, stacks) => (25 + Math.max(1, Math.floor(Number(floor) || 1)) * 2) * Math.max(0, Math.floor(Number(stacks) || 0)),
    createCampaignJesterGate = () => ({ ok: false, reason: 'ACQUISITION_UNAVAILABLE' }),
    useCampaignJesterGate = () => ({ ok: false, reason: 'ACQUISITION_UNAVAILABLE' }),
    openCampaignChest = () => ({ ok: false, reason: 'CHEST_UNAVAILABLE' }),
    claimCampaignChestSelection = () => ({ ok: false, reason: 'CHEST_UNAVAILABLE' }),
    activateEquipment = () => ({ ok: false, reason: 'EQUIPMENT_UNAVAILABLE' }),
    prepareCampaignChargedAdapterWarp = () => ({ ok: false, reason: 'EQUIPMENT_UNAVAILABLE' }),
    updateEquipmentEffects = () => [],
    stockCampaignShop = () => null,
    purchaseCampaignShop = () => ({ ok: false, reason: 'SHOP_UNAVAILABLE' }),
    createEndlessIntermissionChests = () => [],
    purchaseEndlessChest = () => ({ ok: false, reason: 'ENDLESS_UNAVAILABLE' }),
    applySpecialRoomChoice = () => ({ ok: false, reason: 'SPECIAL_ROOM_UNAVAILABLE' }),
    RANGED_BEHAVIORS = new Set(),
    SPAWN_LOCK_TICKS = 15,
    resolveRoomObstacleMovement = (_room, _entity, x, y) => ({ x, y, blockedX: false, blockedY: false }),
    circleIntersectsRoomObstacle = () => false,
    scaleCampaignDamage = options => Math.max(0, Number(options.damage || 0)),
    resolveCampaignCrit = () => ({ isCrit: false, critMultiplier: 1 }),
    createCampaignStatusMap = () => ({}),
    ensureCampaignStatuses = entity => entity?.statuses || {},
    clearCampaignStatus = () => {},
    applyCampaignStatus = () => null,
    getCampaignStatusStacks = () => 0,
    getCampaignPoisonDamageMultiplier = () => 1,
    getCampaignSlowMultiplier = () => 1,
    getCampaignBrittleDefenseMultiplier = () => 1,
    getCampaignBleedResistance = () => 1,
    getCampaignGenericStatusResistance = () => 0,
    tickCampaignStatuses = () => [],
    deriveCampaignItemStats = () => ({}),
    planCampaignThornMine = () => ({ count: 1, durationSeconds: 5, armSeconds: 0.18, triggerRadius: 34, blastRadius: 62, damage: 18, knockback: 170, bleedStacks: 1, bleedDuration: 4.5 }),
    planCampaignElBartoGraffiti = () => ({ spawn: false }),
    resolveCampaignPlayerDamage = () => ({ health: 0, dealt: 0, absorbed: 0, barrier: 0 }),
    resolveCampaignStoredPotion = () => ({ ok: false, reason: 'UNAVAILABLE' }),
    resolveCampaignPotionBaseHeal = () => 40,
    getCampaignPotionCarryCap = () => 0,
    resolveCampaignPotionPickup = () => ({ ok: false, reason: 'UNAVAILABLE' }),
    campaignHazardHitsEntity = () => false,
    campaignLavaHitsEntity = () => false,
    advanceCampaignExplosiveTrap = () => ({ ignored: true }),
    advanceCampaignLavaContact = () => ({ ignored: true }),
    resolveCampaignOnHitStatusProcs = () => [],
    syncCampaignItemStats = state => state,
    applyCampaignKillCharge = () => ({ ok: true, intents: [] }),
    applyCampaignInsuranceOnHit = player => ({ triggered: false, health: player?.hp || 0 }),
    resolveCampaignHemesScarfRetaliation = () => null,
    getCampaignHemesScarfPassiveBleedStacks = () => 0,
    advanceCampaignHemesScarfDrain = () => ({ started: false, active: false, heal: 0 }),
    resolveCampaignKillAreaEffects = () => [],
    resolveCampaignSargesHammerDoubleKill = () => ({ triggered: false }),
    resolveCampaignMoggysCoatOpening = () => ({ consumePrime: false, targets: [] }),
    resolveCampaignRoomEntryItemEffects = () => ({ ok: false, intents: [] }),
    applyCampaignRoomEntryReset = () => ({ ok: false, cancelledBeam: false }),
    applyCampaignRevive = player => ({ ok: true, health: player?.hp || 0 }),
    configureCampaignProjectile = projectile => projectile,
    rollCampaignProjectileBounces = () => 0,
    steerCampaignHomingProjectile = projectile => projectile,
    advanceCampaignProjectile = (projectile, delta) => {
      const previous = { x: projectile.x, y: projectile.y };
      projectile.x += Number(projectile.vx || 0) * delta;
      projectile.y += Number(projectile.vy || 0) * delta;
      return previous;
    },
    bounceCampaignProjectile = () => false,
    createCampaignSubSpawnDescriptors = () => [],
    planCampaignHammerThrow = () => ({ kind: 'sarges_hammer', damage: 46, speed: 680, radius: 11, lifeSeconds: 0.55, knockback: 300, pierce: 0, returning: true, lightning: true, homing: true, homingTarget: 'enemy', homingRadius: 700, homingSpeed: 760, homingAccel: 2.4, homingTurnRate: 2.6, recoil: 90 }),
    planCampaignSargesHammerDoubleKill = () => null,
    planCampaignLoveBomb = () => ({ kind: 'love_bomb', damage: 34, speed: 340, radius: 10, lifeSeconds: 1, aoeRadius: 48, sparkleChance: 0.25, knockback: 200, recoil: 30 }),
    planCampaignGhostBall = () => ({ kind: 'ghost_ball', damage: 34, radius: 18, startRadius: 18, speed: 300, acceleration: 6, minimumRadius: 8, decayPerSecond: 3, hitDecay: 6, enemyHitCooldownSeconds: 0.35, destructibleHitCooldownSeconds: 0.4, knockback: 140, destructibleDamage: 2 }),
    planCampaignDeathBall = () => ({ kind: 'death_ball', damage: 40, radius: 16, speed: 520, lifeSeconds: 1.6, knockback: 220, pierce: 4, recoil: 60 }),
    advanceCampaignGhostBall = () => ({ active: false, currentDamage: 0 }),
    findCampaignProjectileEntitySweepHit = () => null,
    findCampaignProjectileObstacleSweepHit = () => null,
    resolveCampaignProjectileStatusApplications = () => [],
    resolveCampaignProjectileDrain = () => ({ healedAmount: 0, health: 0 }),
    resolveCampaignProjectileDestructibleImpact = projectile => ({ directDamage: Number(projectile?.damage || 1), blast: null }),
    resolveCampaignEnemyProjectileBlast = () => null,
    planCampaignBoomerangReturn = () => null,
    resolveCampaignBoomerangCatch = () => ({ healedAmount: 0, health: 0, pickupImpulses: [] }),
    applyCampaignDestructibleDamage = () => ({ ok: false, drops: [] }),
    applyCampaignLevelUp = () => null,
    finishCampaignChallenge = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    createCampaignChallengeRewardPlan = () => ({ ok: false, pickups: [], xp: 0, weaponKey: '' }),
    resolveCampaignChallengePickup = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    startCampaignCircuitChallenge = () => ({ ok: false, switches: [] }),
    advanceCampaignCircuitChallenge = () => ({ ok: false, failed: false }),
    startCampaignStormChallenge = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    advanceCampaignStormChallenge = () => ({ ok: false, strikes: [], complete: false }),
    startCampaignSurvivalChallenge = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    advanceCampaignSurvivalChallenge = () => ({ ok: false, spawnCount: 0, failed: false, complete: false }),
    createCampaignTrialEnemyWavePlan = () => [],
    applyCampaignObeliskSeekerSteering = () => false,
    startCampaignRuneChallenge = () => ({ ok: false, runes: [] }),
    advanceCampaignRuneChallenge = () => ({ ok: false, spawnCount: 0, failed: false }),
    advanceCampaignChallengeRune = () => ({ ok: false }),
    startCampaignBombChallenge = () => ({ ok: false, bombs: [] }),
    advanceCampaignBombChallenge = () => ({ ok: false, spawnCount: 0, failed: false }),
    updateCampaignGardenNode = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    collectCampaignGardenFruit = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    advanceCampaignMovingWorldEntity = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    purchaseCampaignSecretVendor = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    lootCampaignSecretBossChest = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    prepareCampaignBowmanBaneEscape = () => ({ ok: false }),
    revealCampaignBowmanBaneEscape = () => ({ ok: false }),
    useCampaignLadder = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    rollCampaignChallengeType = () => 'mirror',
    createCampaignSecretRoomPlan = () => ({ ok: false, pickups: [] }),
    applyCampaignImpulse = () => ({ ok: false, reason: 'MOVEMENT_UNAVAILABLE' }),
    resolveCampaignDashBurst = () => ({ vx: 0, vy: 0, durationSeconds: 0.16, invulnerabilitySeconds: 0.18 }),
    resolveCampaignBlinkDestination = () => null,
    resolveCampaignNimrodStomp = () => ({ leapDistance: 108, radius: 108, damageMultiplier: 1, invulnerabilitySeconds: 0.32 }),
    planCampaignZipLightning = () => ({ hops: [], fallback: null }),
    planCampaignKnightSlashDash = () => ({ hops: [], fallback: null }),
    findCampaignNearestDashTarget = () => null,
    resolveCampaignPrincessShield = () => ({ barrierGain: 0, barrier: 0 }),
    shouldAutoCastCampaignPrincessShield = () => false,
    resolveCampaignTurtlePowerUp = () => ({ radius: 60, damage: 18, barrierGain: 0, barrier: 0, durationSeconds: 1.5, power: 0.24 }),
    getCampaignTurtlePowerUpMultiplier = () => 1,
    planCampaignRivalClawGauntlets = () => ({ initialDamage: 1, initialAngleOffset: -0.18, followupDelaySeconds: 0.12, followupDamage: 1, followupAngleOffset: 0.18, rangePadding: 48, knockback: 260, bleedStacks: 1, bleedDurationSeconds: 5, swingSeconds: 0.22 }),
    planCampaignPotionBath = () => ({ immediateHeal: 0, regenHealPerPulse: 0, regenDurationSeconds: 5, regenIntervalSeconds: 0.5, statusResistanceSeconds: 20, invulnerabilitySeconds: 5, concealmentSeconds: 5, bursts: [] }),
    resolveCampaignHealingZone = () => ({ radius: 62, durationSeconds: 4.8, healPerSecond: 7.36, damagePerSecond: 10, pulseIntervalSeconds: 0.5 }),
    resolveCampaignFireCircle = () => ({ radius: 96, durationSeconds: 5.2, damagePerSecond: 18, pulseIntervalSeconds: 0.5, fireDurationSeconds: 2.8 }),
    resolveCampaignMooggySwipe = () => ({ chargeRatio: 0, damage: 44, range: 130, arc: Math.PI * 0.72, knockback: 0, bleedChance: 0.12, bleedStacks: 1, bleedDurationSeconds: 5, propArcBonus: 0.25, propDamage: 1 }),
    resolveCampaignMooggyHairball = () => ({ radius: 132, damage: 34, knockback: 180, poisonStacks: 3, poisonDurationSeconds: 6, stunSeconds: 0.8, slowStacks: 1, slowDurationSeconds: 4 }),
    resolveCampaignNarwalFight = () => ({ sweep: { damage: 40, range: 136, arc: 1.45, knockback: 280 }, projectile: { kind: 'narwal_fight', damage: 26, speed: 760, radius: 6, lifeSeconds: 0.92, knockback: 200, pierce: 2, hitOptions: { critBonus: 0.08 }, spawnDistance: 22 } }),
    planCampaignFireballVolley = () => ({ recoil: 150, projectiles: [-0.18, 0, 0.18].map(angleOffset => ({ angleOffset, kind: 'fireball', damage: 22, speed: 560, radius: 8, lifeSeconds: 1.6, splash: 48, splashDamage: 14, blockedSplashDamage: 16, fireStacks: 2, fireDurationSeconds: 3.4 })) }),
    resolveCampaignSmite = () => ({ stab: { damage: 20, range: 90, arc: 0.45, knockback: 220, destructibleDamage: 2, hitOptions: { lightning: true } }, blade: { kind: 'blade_justice', damage: 18, speed: 820, radius: 7, lifeSeconds: 0.5, knockback: 80, pierce: 99, hitOptions: { lightning: true }, spawnDistance: 24 }, chain: { range: 280, jumpRange: 170, count: 5, baseDamage: 18, stepDamage: 4, knockback: 90, hitOptions: { lightning: true } } }),
    resolveCampaignUnarmedSlash = () => ({ damage: 24, range: 72, arc: 1.04, knockback: 340, bleedChance: 0.1, bleedStacks: 1, bleedDurationSeconds: 5, propDamage: 1 }),
    planCampaignMagentaP90Burst = () => Array.from({ length: 5 }, (_, index) => ({ delaySeconds: index * 0.08, angle: 0 })),
    planCampaignDivineWeaponCombo = () => ({ weaponKey: 'excalibur', damage: 186, range: 120, knockback: 600, arc: Math.PI, rawDamage: true, strikes: [{ delaySeconds: 0, angleOffset: 0 }] }),
    resolveCampaignSargesHammerWeapon = () => ({ kind: 'sarges_hammer', damage: 64, speed: 720, radius: 11, lifeSeconds: 0.75, knockback: 520, pierce: 0, returning: true, lightning: true }),
    resolveCampaignLazerGlasses = () => ({ durationSeconds: 0.65, tickIntervalSeconds: 0.08, range: 430, bounces: 1, offsets: [-0.2, 0.2], damage: 9, knockback: 80, propDamage: 1, propPadding: 4, hitOptions: { fireChance: 0.05, fireStacks: 1, fireDuration: 3, beamFx: true }, chainTargets: 0, chainRange: 145, chainDamageMultiplier: 0.6, chainKnockback: 55 }),
    resolveCampaignGoldenFleece = () => ({ intervalSeconds: 2, healAmount: 6 }),
    planCampaignConfiguredWeaponShot = options => ({ angle: Number(options?.aimDirection || 0), recoilMultiplier: 1, movementRatio: 0, spread: 0 }),
    buildCampaignRicochetBeamPath = () => [],
    campaignBeamPathHitsCircle = () => null,
    campaignBeamPathHitsRect = () => null,
    getCampaignPlayerBeamBounceCount = () => 1,
    planCampaignMirrorTactics = () => ({ action: 'wait', moveX: 0, moveY: 0, laserMove: 'blood_beam', smashMove: 'crimson_smash', dashMove: 'dash' }),
    planCampaignGroundSmash = () => ({ moveKey: 'crimson_smash', radius: 148, damage: 46, pvpDamage: 46, bleedBonus: 26, knockback: 320, destructibleDamage: 2, stunSeconds: 0, projectileDescriptors: [] }),
    planCampaignBladeJustice = () => ({ damage: 22, durationSeconds: 2.1, count: 3, radius: 16, reach: 120, turnRate: 9, swingRate: 7.5, swingArc: 0.7, contactCooldownSeconds: 0.22, destructibleCooldownSeconds: 0.4, knockback: 180, destructibleDamage: 2, blades: [] }),
    advanceCampaignBladeJustice = () => ({ active: false }),
    resolveCampaignTitanHammer = () => ({ damage: 70, radius: 97.5, durationSeconds: 4.55, followRadius: 120, turnRate: 10, followRate: 12, swingCooldownSeconds: 1, swingDurationSeconds: 1 / 4.5, maxSwings: 2, slamKnockback: 300, pvpKnockback: 280, stunSeconds: 0.6, destructibleDamage: 2, contactRadiusMultiplier: 0.32, contactCooldownSeconds: 0.35, contactDamage: 13, contactKnockback: 120 }),
    advanceCampaignTitanHammer = hammer => hammer,
    resolveCampaignFloorLava = () => ({ durationSeconds: 7.5, trailIntervalSeconds: 0.22, puddleRadius: 24, puddleDurationSeconds: 1.8, damagePerSecond: 14, pulseIntervalSeconds: 0.05, statusIntervalSeconds: 0.45, fireDurationSeconds: 2.8 }),
    planCampaignRandomPounce = () => ({ radius: 160, burstBaseDamage: 52, bleedStacks: 2, bleedDurationSeconds: 5, fangs: [] }),
    planCampaignNailShot = () => [],
    planCampaignLaserShockwave = () => ({ spikes: [] }),
    resolveCampaignChaosBurst = () => ({ fieldRadius: 180, durationSeconds: 1.8, intervalSeconds: 0.22, initialBurstCount: 4, burstRadius: 52, burstDamage: 18, poisonDurationSeconds: 4.8, fireDurationSeconds: 3.5 }),
    planCampaignChaosEruption = () => ({ x: 0, y: 0, radius: 52, damage: 18, poisonDurationSeconds: 4.8, fireDurationSeconds: 3.5, isMetao: false }),
    planCampaignHolyTurrets = () => [],
    planCampaignLightningColumns = () => [],
    planCampaignLightningCross = () => ({ damage: 30, radius: 26, warnSeconds: 0.5, intervalSeconds: 0.14, durationSeconds: 0.9, healPct: 0.01, knockback: 120, lines: [] }),
    planCampaignExcaliburStrike = () => [],
    resolveCampaignKickyKick = () => ({ radius: 138, damage: 184, blastKnockback: 400, impulseKnockback: 1440, playerRecoil: 260 }),
    planCampaignKickyKickRoomTransfer = () => null,
    planCampaignWallOfToph = () => ({ aoeRadius: 150, slamDamage: 46, shards: [], barriers: [] }),
    resolveCampaignWallOfTophBarriers = () => [],
  } = contentApi || {};
  const combatRandomByState = new WeakMap();
  // Authority code must never fall through to ambient randomness. The normal
  // simulation path always supplies RandomService; this deterministic value
  // also keeps direct/bootstrap calls reproducible when it is unavailable.
  const authorityFallbackRandom = () => 0.5;
  const CONTINUOUS_BEAM_MOVE_SET = new Set(CONTINUOUS_BEAM_MOVES);
  // Input button bit the client holds while its laser button is down. A channel
  // that has seen the bit ends as soon as it clears (release-to-stop, like the
  // campaign); a channel that never sees it simply runs its full duration.
  const BUTTON_LASER_HELD = 1;
  // The compact input bitfield carries hold state separately from the one-shot
  // action messages.  A smash action starts a charge; this bit decides when it
  // is released.  Keeping that timing on the authority prevents a client from
  // authoring a damage multiplier.
  const BUTTON_SMASH_HELD = 2;
  const BUTTON_DASH_HELD = 4;
  const BUTTON_MELEE_HELD = 8;
  const HOLD_TO_CHARGE_MOVES = Object.freeze({
    love_bomb_laser: Object.freeze({ maxChargeTicks: 100, button: BUTTON_LASER_HELD }),
    ghost_ball: Object.freeze({ maxChargeTicks: 100, button: BUTTON_LASER_HELD }),
    healing_zone: Object.freeze({ maxChargeTicks: 25, button: BUTTON_SMASH_HELD }),
    death_ball: Object.freeze({ maxChargeTicks: 100, button: BUTTON_SMASH_HELD }),
    turtle_powerup: Object.freeze({ maxChargeTicks: 25, button: BUTTON_SMASH_HELD }),
    nimrod_stomp: Object.freeze({ maxChargeTicks: 25, button: BUTTON_DASH_HELD }),
    mooggy_swipe: Object.freeze({ maxChargeTicks: 100, button: BUTTON_MELEE_HELD }),
  });
  const PLAYER_HIT_INVULNERABILITY_TICKS = 15; // campaign parity: 0.75 seconds
  // Actions use the reliable channel while held-state inputs are replaceable.
  // On a real connection the action can therefore arrive several authority
  // ticks before its first `button down` sample.  Do not turn that gap into an
  // accidental tap/release.
  const HELD_INPUT_GRACE_TICKS = 12; // 0.6 seconds at the 20 Hz authority tick
  const TURTLE_WAVE_HP_PER_SECOND = 2;
  const HEAVY_HIT_HEALTH_RATIO = 0.5;
  const HEAVY_KNOCKBACK_THRESHOLD = 6600;
  const HEAVY_HIT_STUN_SECONDS = 0.62;
  const HEAVY_KNOCKBACK_STUN_SECONDS = 0.46;
  const BEAM_STRUGGLE_DURATION_TICKS = 60;
  const BEAM_STRUGGLE_MASH_FORCE = 0.085;
  const HERO_PRIMARY_ATTACKS = Object.freeze(Object.fromEntries(
    Object.entries(CHARACTER_DEFAULT_WEAPONS).map(([characterKey, weaponKey]) => [characterKey, Object.freeze({
      characterKey,
      weaponKey,
      ...(WEAPON_BASE_STATS[weaponKey] || {}),
      ...(DEFAULT_WEAPON_ATTACKS[weaponKey] || {}),
      projectileKind: DEFAULT_WEAPON_ATTACKS[weaponKey]?.kind,
      kind: weaponKey,
      cooldownTicks: Math.max(1, Math.ceil(Number(WEAPON_BASE_STATS[weaponKey]?.cooldown || 0.5) * 20)),
    })]),
  ));
  const ENEMY_ARCHETYPES = ENEMY_CATALOG;
  // These are the campaign character multipliers applied to its 120 HP base.
  // Keep the authority's selected hero identical to createDefaultPlayer(),
  // rather than maintaining a separate multiplayer balance table.
  const HERO_BASE_STATS = Object.freeze({
    princess: Object.freeze({ maxHp: 131, moveSpeed: 216.6, damageMultiplier: 1.14, aoeRadiusMultiplier: 0.95 }),
    thorn_knight: Object.freeze({ maxHp: 120, moveSpeed: 228, damageMultiplier: 1 }),
    metao: Object.freeze({ maxHp: 120, moveSpeed: 228, damageMultiplier: 0.5 }),
    gelleh: Object.freeze({ maxHp: 120, moveSpeed: 228, damageMultiplier: 1 }),
    mooggy: Object.freeze({ maxHp: 130, moveSpeed: 228, damageMultiplier: 0.6 }),
    turtle_boy: Object.freeze({ maxHp: 144, moveSpeed: 228, damageMultiplier: 1 }),
    sarge: Object.freeze({ maxHp: 108, moveSpeed: 228, damageMultiplier: 1.05 }),
  });
  function getHeroPrimaryAttack(characterKey) {
    return HERO_PRIMARY_ATTACKS[characterKey] || HERO_PRIMARY_ATTACKS.thorn_knight;
  }

  function getCampaignWeaponAttack(weaponKey, characterKey = 'thorn_knight') {
    const key = WEAPON_BASE_STATS[weaponKey] ? weaponKey : getCharacterDefaultWeapon(characterKey);
    const behavior = DEFAULT_WEAPON_ATTACKS[key] || {};
    const projectileBehavior = WEAPON_PROJECTILE_ATTACKS[key] || {};
    return {
      characterKey,
      weaponKey: key,
      ...(WEAPON_BASE_STATS[key] || {}),
      ...behavior,
      ...projectileBehavior,
      // All defined projectile weapons retain their projectile identity even
      // when the hero who bought them is not their original starter hero.
      mode: behavior.mode || (key === 'magenta_p90' ? 'burst_projectile'
        : ['excalibur', 'katana_excalibur_777x'].includes(key) ? 'divine_combo'
          : key === 'sarges_hammer' ? 'sarges_hammer_weapon'
            : key === 'lazer_glasses' ? 'lazer_glasses'
          : projectileBehavior.projectileType ? 'projectile' : 'sweep'),
      projectileKind: behavior.kind,
      kind: key,
      cooldownTicks: Math.max(1, Math.ceil(Number(WEAPON_BASE_STATS[key]?.cooldown || 0.5) * 20)),
    };
  }

  function getNetworkCampaignRawMeleeDamage(player) {
    const poison = player?.statuses?.poison || {};
    const poisonMultiplier = getCampaignPoisonDamageMultiplier(
      Number(poison.stacks || 0), Number(poison.severity || 1),
    );
    const flatHitBonus = Math.max(0, Number(player?.itemStats?.flatHitDamageBonus || 0));
    return Math.max(1, (24 + Number(player?.attackPower || 0) + flatHitBonus)
      * Math.max(0.1, Number(player?.damageMultiplier || 1)) * poisonMultiplier);
  }

  function applyForgeStats(player, itemType, itemKey, baseStats) {
    const result = { ...(baseStats || {}) };
    const upgrades = player?.anvilUpgrades?.[itemType]?.[itemKey] || {};
    const schema = itemType === 'weapon'
      ? contentApi.WEAPON_UPGRADEABLE_STATS || {}
      : contentApi.MOVE_UPGRADEABLE_STATS || {};
    Object.entries(upgrades).forEach(([statKey, count]) => {
      if (!(statKey in result) || !schema[statKey]) return;
      result[statKey] = Number(result[statKey]) + Math.max(0, Math.floor(Number(count) || 0)) * Number(schema[statKey].step);
      if (statKey === 'cooldown') result[statKey] = Math.max(Number(baseStats[statKey]) * 0.5, result[statKey]);
    });
    return result;
  }

  function collectNetworkCampaignItem(player, itemKey) {
    return !!collectSharedCampaignItem(player, itemKey)?.ok;
  }

  // Kit picks come from untrusted clients: keep only slots this character has
  // alternatives for, and only moves from that slot's KIT_ALTERNATIVES list.
  // Returns null when any provided entry is invalid so callers can reject the
  // message instead of silently applying a different kit than the client chose.
  function sanitizeKitChoices(characterKey, kitChoices) {
    if (kitChoices === undefined || kitChoices === null) return {};
    if (typeof kitChoices !== 'object' || Array.isArray(kitChoices)) return null;
    const alternatives = KIT_ALTERNATIVES[characterKey] || {};
    const sanitized = {};
    for (const [slot, moveKey] of Object.entries(kitChoices)) {
      const options = alternatives[slot];
      if (!Array.isArray(options) || !options.includes(moveKey)) return null;
      if (moveKey !== options[0]) sanitized[slot] = moveKey;
    }
    return sanitized;
  }

  function applyNetworkHeroProfile(player, characterKey, kitChoices) {
    const key = HERO_BASE_STATS[characterKey] ? characterKey : 'thorn_knight';
    const profile = HERO_BASE_STATS[key];
    const previousMaximum = Math.max(1, Number(player.maxHp || profile.maxHp));
    const healthRatio = Math.max(0, Math.min(1, Number(player.hp ?? previousMaximum) / previousMaximum));
    player.characterKey = key;
    player.character = key;
    player.equippedWeapon = getCharacterDefaultWeapon(key);
    player.equippedMoves = getDefaultMoveLoadout(key);
    player.kitChoices = sanitizeKitChoices(key, kitChoices) || {};
    Object.assign(player.equippedMoves, player.kitChoices);
    player.ownedWeapons = { [player.equippedWeapon]: true };
    player.ownedMoves = Object.fromEntries(Object.values(player.equippedMoves).map(moveKey => [moveKey, true]));
    player.items = { ...(CHARACTER_STARTING_ITEMS[key] || {}) };
    player.equipmentSlots = key === 'metao' ? ['mateos_bag'] : [];
    player.moveCooldownUntilTick = {};
    // Charge pools are built lazily per move by ensureMoveChargeState (which reads
    // the character's base charges), so a character swap can't strand a stale pool.
    player.moveChargeState = {};
    player.statusUntilTick = {};
    player.statuses = createCampaignStatusMap();
    player.barrier = 0;
    player.maxHp = profile.maxHp;
    player.hp = Math.round(profile.maxHp * healthRatio);
    player.moveSpeed = profile.moveSpeed;
    player.damageMultiplier = profile.damageMultiplier;
    player.aoeRadiusMultiplier = Number(profile.aoeRadiusMultiplier || 1);
    // A network hero is immediately playable after character selection. Derive
    // the starter-item effects here rather than waiting for a later pickup or
    // tick, otherwise the authoritative damage path treats every hero as if
    // they had no items (notably Princess loses her 10% Glasses defense).
    player.itemStats = deriveCampaignItemStats(player, { aoeRadiusMultiplier: player.aoeRadiusMultiplier });
    return player;
  }

  function currentRoom(state, roomId = state.floorState?.currentRoomId) {
    return state.floorState?.layout?.rooms?.find(room => room.id === roomId) || null;
  }

  function authorityGameMode(state) {
    return String(state.matchRules?.gameMode || state.matchRules?.mode || state.gameMode || 'normal');
  }

  // Boss Rush is intentionally a serialized state machine: campaign uses
  // setTimeout for its between-boss pause, but an authority must be able to
  // checkpoint/recover that pause without either duplicating or skipping a
  // stage. Rewards are physical pickups where the campaign uses pickups, while
  // XP remains a direct party grant (the explicit co-op adapter).
  function ensureAuthorityBossRush(state, random, emitEvent) {
    if (authorityGameMode(state) !== 'boss_rush') return null;
    const rush = state.bossRush || (state.bossRush = {});
    if (!rush.initialized) {
      rush.initialized = true;
      rush.stage = 0;
      rush.active = true;
      rush.intermission = false;
      rush.nextSpawnTick = 0;
      rush.grantedPlayerIds = {};
      // The campaign starts Boss Rush at floor five so level/difficulty scaling
      // and scoped reward streams share that baseline.
      state.floorNumber = Math.max(5, Number(state.floorNumber || 1));
      const room = currentRoom(state);
      if (room) {
        room.type = 'combat';
        room.cleared = false;
        room.bossRushIntermission = false;
        room.doors = { n: false, s: false, e: false, w: false };
      }
    }
    activePlayers(state).forEach(player => {
      if (rush.grantedPlayerIds[player.id]) return;
      const stream = random?.scoped?.(`boss-rush:starting-items:${player.id}`);
      createBossRushStarterItemPlan(() => stream?.next?.() ?? 0.5).forEach(({ itemKey, elite }) => {
        if (!itemKey || !collectSharedCampaignItem(player, itemKey)?.ok) return;
        emitEvent('BOSS_RUSH_STARTER_ITEM_GRANTED', { playerId: player.id, itemKey, elite });
      });
      player.coins = Math.max(0, Number(player.coins || 0)) + 120;
      rush.grantedPlayerIds[player.id] = true;
      emitEvent('BOSS_RUSH_STARTED', { playerId: player.id, stage: 1, coins: player.coins });
    });
    return rush;
  }

  function awardAuthorityBossRushExperience(state, roomId, amount, emitEvent) {
    activePlayers(state).filter(player => !player.downed && player.roomId === roomId).forEach(player => {
      const gained = Math.max(1, Math.round(Number(amount || 0) * Math.max(0, Number(player.itemStats?.xpGainMultiplier || 1))));
      player.xp = Math.max(0, Number(player.xp || 0)) + gained;
      player.level = Math.max(1, Number(player.level || 1));
      player.xpToNext = Math.max(1, Number(player.xpToNext || 20));
      while (player.xp >= player.xpToNext) {
        player.xp -= player.xpToNext;
        applyCampaignLevelUp(player);
        emitEvent('PLAYER_LEVELED', { playerId: player.id, level: player.level, maxHealth: player.maxHp });
      }
      emitEvent('XP_AWARDED', { playerId: player.id, roomId, source: 'boss_rush_stage', amount: gained, xp: player.xp, level: player.level });
    });
  }

  function resolveAuthorityBossRushStageClear(state, room, emitEvent) {
    const rush = state.bossRush;
    if (!rush || authorityGameMode(state) !== 'boss_rush' || !rush.active || !room) return false;
    rush.active = false;
    rush.stage = Math.max(0, Number(rush.stage || 0)) + 1;
    if (rush.stage >= BOSS_RUSH_ORDER.length) {
      state.status = 'ended';
      emitEvent('BOSS_RUSH_COMPLETED', { roomId: room.id, stage: rush.stage });
      emitEvent('RUN_ENDED', { result: 'victory', reason: 'boss-rush-completed', floorNumber: Number(state.floorNumber || 5) });
      return true;
    }
    const random = combatRandomByState.get(state);
    const stream = random?.scoped?.(`boss-rush:stage:${rush.stage}:reward`);
    const centerX = Number(state.floorState?.width || 900) / 2;
    const centerY = Number(state.floorState?.height || 700) / 2;
    createCampaignCoinDropPlan(centerX, centerY - 20, 80 + rush.stage * 30, {
      random: () => stream?.next?.() ?? 0.5,
    }).forEach(descriptor => {
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = { id: pickupId, ...descriptor, roomId: room.id, radius: 13, amount: descriptor.value, spawnTick: state.tick };
      emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: 'coin', roomId: room.id, source: 'boss_rush_stage' });
    });
    const itemKey = rollCampaignItem(() => stream?.next?.() ?? 0.5, { elite: true });
    if (itemKey) {
      const itemId = state.allocateEntityId('pickup');
      state.pickups[itemId] = { id: itemId, type: 'item', key: itemKey, source: 'boss_rush_stage', roomId: room.id, x: centerX - 60, y: centerY, radius: 13, amount: 1, spawnTick: state.tick };
      emitEvent('PICKUP_SPAWNED', { pickupId: itemId, pickupType: 'item', itemKey, roomId: room.id, source: 'boss_rush_stage' });
    }
    const potionId = state.allocateEntityId('pickup');
    state.pickups[potionId] = { id: potionId, type: 'potion', source: 'boss_rush_stage', roomId: room.id, x: centerX + 60, y: centerY, radius: 13, amount: 1, spawnTick: state.tick };
    emitEvent('PICKUP_SPAWNED', { pickupId: potionId, pickupType: 'potion', roomId: room.id, source: 'boss_rush_stage' });
    awardAuthorityBossRushExperience(state, room.id, 40 + rush.stage * 20, emitEvent);
    const depth = 1 + Math.floor(Number(rush.stage || 1) / 2);
    room.shopStocked = false;
    room.shopOffers = [];
    room.shopMoveOffers = [];
    room.shopWeaponOffers = [];
    room.shopTradeOffer = null;
    const owner = activePlayers(state).find(player => player.roomId === room.id) || activePlayers(state)[0];
    const shopView = { ...room, type: 'shop' };
    stockCampaignShop({
      floorNumber: depth,
      elapsedSeconds: state.elapsedSeconds || 0,
      matchRules: state.matchRules || {},
    }, shopView, owner, random?.scoped?.(`boss-rush:intermission:${rush.stage}:shop`));
    room.shopOffers = shopView.shopOffers || [];
    room.shopMoveOffers = shopView.shopMoveOffers || [];
    room.shopWeaponOffers = shopView.shopWeaponOffers || [];
    room.shopTradeOffer = shopView.shopTradeOffer || null;
    room.shopStocked = true;
    room.bossRushIntermission = true;
    rush.intermission = true;
    rush.nextSpawnTick = 0;

    createEndlessIntermissionChests({
      waveNumber: rush.stage,
      modeKey: 'boss-rush',
      geometry: { width: state.floorState?.width, height: state.floorState?.height },
    }, random?.scoped?.(`boss-rush:intermission:${rush.stage}:chests`)).forEach(descriptor => {
      const id = state.allocateEntityId('interactable');
      state.interactables[id] = {
        ...descriptor, id, kind: 'intermission_chest', roomId: room.id, radius: 34, spawnTick: state.tick,
      };
      emitEvent('INTERACTABLE_SPAWNED', {
        interactableId: id, kind: 'intermission_chest', roomId: room.id, price: descriptor.price, source: 'boss_rush_intermission',
      });
    });
    const exitPickupId = state.allocateEntityId('pickup');
    state.pickups[exitPickupId] = {
      id: exitPickupId,
      type: 'bossRushNextBoss',
      stage: rush.stage,
      roomId: room.id,
      x: centerX,
      y: centerY - 132,
      radius: 20,
      spawnTick: state.tick,
    };
    emitEvent('BOSS_RUSH_STAGE_CLEARED', {
      roomId: room.id, stage: rush.stage, nextBossType: BOSS_RUSH_ORDER[rush.stage], exitPickupId,
    });
    return true;
  }

  function startAuthorityNextBossRushBoss(state, player, pickupId, emitEvent) {
    if (authorityGameMode(state) !== 'boss_rush') return false;
    const rush = state.bossRush;
    const room = currentRoom(state, player.roomId);
    if (!rush?.intermission || !room?.bossRushIntermission) return false;
    Object.entries(state.interactables || {}).forEach(([id, item]) => {
      if (item?.roomId === room.id && (item.intermissionShopChest || item.bossRushShopChest)) {
        delete state.interactables[id];
      }
    });
    Object.entries(state.pickups || {}).forEach(([id, pickup]) => {
      if (pickup?.roomId === room.id && pickup.type === 'bossRushNextBoss') delete state.pickups[id];
    });
    room.bossRushIntermission = false;
    room.shopStocked = false;
    room.shopOffers = [];
    room.shopMoveOffers = [];
    room.shopWeaponOffers = [];
    room.shopTradeOffer = null;
    room.cleared = false;
    rush.intermission = false;
    rush.active = true;
    rush.nextSpawnTick = 0;
    delete state.floorState?.encounters?.[room.id];
    emitEvent('BOSS_RUSH_NEXT_BOSS_READY', {
      playerId: player.id,
      roomId: room.id,
      stage: Number(rush.stage || 0) + 1,
      bossType: BOSS_RUSH_ORDER[rush.stage],
      pickupId,
    });
    return true;
  }

  function updateAuthorityBossRush(state, emitEvent) {
    const rush = state.bossRush;
    if (authorityGameMode(state) !== 'boss_rush' || !rush || rush.active || !Number(rush.nextSpawnTick)) return;
    if (state.tick < Number(rush.nextSpawnTick)) return;
    const room = currentRoom(state);
    if (!room) return;
    delete state.floorState?.encounters?.[room.id];
    room.cleared = false;
    room.bossRushIntermission = false;
    rush.nextSpawnTick = 0;
    rush.intermission = false;
    rush.active = true;
    emitEvent('BOSS_RUSH_NEXT_BOSS_READY', { roomId: room.id, stage: Number(rush.stage || 0) + 1, bossType: BOSS_RUSH_ORDER[rush.stage] });
  }

  function ensureAuthorityRivalRumble(state, random, emitEvent) {
    if (authorityGameMode(state) !== 'rival_rumble') return null;
    const rumble = state.rivalRumble || (state.rivalRumble = {});
    if (!rumble.initialized) {
      const selected = new Set(activePlayers(state).map(player => player.characterKey || player.character));
      const stream = random?.scoped?.('rival-rumble:order');
      rumble.order = Object.keys(HERO_BASE_STATS).filter(key => !selected.has(key))
        .map(key => ({ key, sort: stream?.next?.() ?? 0.5 }))
        .sort((left, right) => left.sort - right.sort).map(entry => entry.key);
      rumble.initialized = true;
      rumble.stage = 0;
      rumble.active = true;
      rumble.finale = false;
      rumble.nextSpawnTick = 0;
      rumble.grantedPlayerIds = {};
      state.floorNumber = Math.max(5, Number(state.floorNumber || 1));
      const room = currentRoom(state);
      if (room) { room.type = 'combat'; room.cleared = false; room.doors = { n: false, s: false, e: false, w: false }; }
    }
    activePlayers(state).forEach(player => {
      if (rumble.grantedPlayerIds[player.id]) return;
      const stream = random?.scoped?.(`rival-rumble:starting-items:${player.id}`);
      for (let index = 0; index < 3; index += 1) {
        const key = rollCampaignItem(() => stream?.next?.() ?? 0.5, { elite: index === 2 });
        if (key && collectSharedCampaignItem(player, key)?.ok) emitEvent('RIVAL_RUMBLE_STARTER_ITEM_GRANTED', { playerId: player.id, itemKey: key, elite: index === 2 });
      }
      player.coins = Math.max(0, Number(player.coins || 0)) + 120;
      rumble.grantedPlayerIds[player.id] = true;
      emitEvent('RIVAL_RUMBLE_STARTED', { playerId: player.id, stage: 1, total: rumble.order.length, coins: player.coins });
    });
    return rumble;
  }

  function spawnAuthorityRivalRumbleStage(state, room, emitEvent, random) {
    const rumble = state.rivalRumble;
    if (!rumble?.active || !room) return null;
    const characters = rumble.finale ? rumble.order : [rumble.order[rumble.stage]].filter(Boolean);
    const encounter = { roomId: room.id, roomType: room.type, status: 'active', enemyIds: [], startedTick: state.tick, rivalRumble: true, finale: !!rumble.finale, stage: rumble.stage };
    state.floorState.encounters[room.id] = encounter;
    const originalRoster = state.rivalRoster;
    state.rivalRoster = characters.map(characterKey => ({ characterKey, pendingSpawn: true, dead: false, friend: false, vendetta: !!rumble.finale }));
    spawnPendingRivals(state, room, emitEvent, random);
    state.rivalRoster = originalRoster;
    encounter.enemyIds.forEach(enemyId => {
      const enemy = state.enemies[enemyId];
      if (!enemy) return;
      enemy.rivalRumbleStage = rumble.stage;
      enemy.rivalRumbleFinale = !!rumble.finale;
      enemy.rivalVendetta = !!rumble.finale;
      enemy.rivalBrain = { ...enemy.rivalBrain, stance: 'hostile', intention: 'engage' };
      // Tournament rivals use the party's current level, rather than a normal
      // floor return's level curve. The finale preserves the campaign's returned
      // rival health bonus by doubling its opponent body.
      const level = Math.max(1, Math.min(9, Math.round(Math.max(...activePlayers(state).map(player => Number(player.level || 1)), 1))));
      const scale = 1 + Math.max(0, level - 1) * 0.16 + Math.floor(Math.max(0, rumble.stage) / 2) * 0.08;
      const finaleScale = rumble.finale ? 2 : 1;
      enemy.maxHealth = Math.max(1, Math.round(enemy.maxHealth * scale * finaleScale));
      enemy.health = enemy.maxHealth;
      enemy.contactDamage = Math.max(1, Math.round(enemy.contactDamage * scale));
      enemy.projectileDamage = Math.max(1, Math.round(enemy.projectileDamage * scale));
      enemy.rivalRumbleLevel = level;
    });
    emitEvent(rumble.finale ? 'RIVAL_RUMBLE_FINALE_STARTED' : 'RIVAL_RUMBLE_DUEL_STARTED', { roomId: room.id, stage: rumble.stage + 1, rivals: characters });
    return encounter;
  }

  function resolveAuthorityRivalRumbleClear(state, room, emitEvent) {
    const rumble = state.rivalRumble;
    if (!rumble || !rumble.active || !room) return false;
    if (rumble.finale) {
      rumble.active = false;
      state.status = 'ended';
      emitEvent('RIVAL_RUMBLE_COMPLETED', { roomId: room.id, total: rumble.order.length });
      emitEvent('RUN_ENDED', { result: 'victory', reason: 'rival-rumble-completed', floorNumber: Number(state.floorNumber || 5) });
      return true;
    }
    rumble.active = false;
    rumble.stage += 1;
    if (rumble.stage < rumble.order.length) {
      const random = combatRandomByState.get(state);
      const stream = random?.scoped?.(`rival-rumble:stage:${rumble.stage}:reward`);
      const x = Number(state.floorState?.width || 900) / 2;
      const y = Number(state.floorState?.height || 700) / 2;
      createCampaignCoinDropPlan(x, y - 20, 80 + rumble.stage * 30, { random: () => stream?.next?.() ?? 0.5 }).forEach(descriptor => {
        const id = state.allocateEntityId('pickup');
        state.pickups[id] = { id, ...descriptor, roomId: room.id, radius: 13, amount: descriptor.value, spawnTick: state.tick };
      });
      const key = rollCampaignItem(() => stream?.next?.() ?? 0.5, { elite: true });
      if (key) { const id = state.allocateEntityId('pickup'); state.pickups[id] = { id, type: 'item', key, source: 'rival_rumble_stage', roomId: room.id, x: x - 60, y, radius: 13, amount: 1, spawnTick: state.tick }; }
      const potionId = state.allocateEntityId('pickup');
      state.pickups[potionId] = { id: potionId, type: 'potion', source: 'rival_rumble_stage', roomId: room.id, x: x + 60, y, radius: 13, amount: 1, spawnTick: state.tick };
      awardAuthorityBossRushExperience(state, room.id, 40 + rumble.stage * 20, emitEvent);
    } else {
      rumble.finale = true;
    }
    rumble.nextSpawnTick = state.tick + 80;
    emitEvent('RIVAL_RUMBLE_STAGE_CLEARED', { roomId: room.id, stage: rumble.stage, finale: rumble.finale, nextSpawnTick: rumble.nextSpawnTick });
    return true;
  }

  function updateAuthorityRivalRumble(state, emitEvent) {
    const rumble = state.rivalRumble;
    if (authorityGameMode(state) !== 'rival_rumble' || !rumble || rumble.active || !Number(rumble.nextSpawnTick) || state.tick < rumble.nextSpawnTick) return;
    const room = currentRoom(state);
    if (!room) return;
    delete state.floorState?.encounters?.[room.id];
    room.cleared = false;
    rumble.nextSpawnTick = 0;
    rumble.active = true;
    emitEvent('RIVAL_RUMBLE_NEXT_FIGHT_READY', { roomId: room.id, stage: rumble.stage + 1, finale: rumble.finale });
  }

  // Treasure Hunt has a distinct run loop: defeating the vault boss yields a
  // key, then the party must escape through newly-hostile rooms before the
  // collapse timer expires.  This lives in serialized authority state rather
  // than the browser's legacy globals so reconnects cannot silently reset it.
  function ensureAuthorityTreasureHunt(state, random) {
    if (authorityGameMode(state) !== 'treasure_hunt') return null;
    const hunt = state.treasureHunt || (state.treasureHunt = {});
    const startRoom = state.floorState?.layout?.rooms?.find(room => room.type === 'start');
    if (!hunt.phase) {
      const stream = random?.scoped?.(`treasure-hunt:exit:${state.floorNumber}`);
      hunt.phase = 'seek';
      hunt.hasKey = false;
      hunt.collapseTimer = 0;
      hunt.collapseMax = 0;
      hunt.rockTick = 0;
      hunt.blastTick = 0;
      hunt.exitKind = stream?.next?.() < 0.5 ? 'ladder' : 'chest';
    }
    if (startRoom && !startRoom.treasureHuntExitKind) startRoom.treasureHuntExitKind = hunt.exitKind || 'ladder';
    return hunt;
  }

  function beginAuthorityTreasureHuntEscape(state, player, emitEvent, random) {
    const hunt = ensureAuthorityTreasureHunt(state, random);
    if (!hunt || hunt.phase !== 'seek') return false;
    hunt.phase = 'escape';
    hunt.hasKey = true;
    hunt.collapseMax = Math.max(70, 103 - Number(state.floorNumber || 1) * 3);
    hunt.collapseTimer = hunt.collapseMax;
    hunt.rockTick = 0.45;
    hunt.blastTick = 1.6;
    const rooms = state.floorState?.layout?.rooms || [];
    const startRoom = rooms.find(room => room.type === 'start');
    const trapCount = 2 + Math.min(3, Math.floor((Number(state.floorNumber || 1) - 1) / 3));
    rooms.forEach(room => {
      if (!room || room === startRoom) return;
      room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
      for (let index = 0; index < trapCount; index += 1) {
        const stream = random?.scoped?.(`treasure-hunt:trap:${state.floorNumber}:${room.id}:${index}`);
        const x = 100 + (stream?.next?.() ?? 0.5) * (Number(state.floorState?.width || 900) - 200);
        const y = 100 + (stream?.next?.() ?? 0.5) * (Number(state.floorState?.height || 700) - 200);
        room.hazards.push({ kind: 'explosive_trap', source: 'treasure_hunt_trap', x, y, r: 16, triggerRadius: 34, blastRadius: room.type === 'boss' ? 104 : 88, baseDamage: room.type === 'boss' ? 26 : 18, fuse: 0, fuseDuration: room.type === 'boss' ? 0.62 : 0.78, triggered: false, sparkTick: 0 });
      }
      if (room.id === player.roomId || room.type === 'boss' || room.type === 'god' || room.secret) return;
      room.treasureHuntOriginalType = room.treasureHuntOriginalType || room.type;
      room.type = 'combat';
      room.cleared = false;
      room.treasureHuntEscapePending = true;
      room.treasureHuntEscapeActive = false;
      delete state.floorState?.encounters?.[room.id];
    });
    player.coins = Math.max(0, Number(player.coins || 0)) + 75 + Number(state.floorNumber || 1) * 10;
    emitEvent('TREASURE_HUNT_ESCAPE_STARTED', { playerId: player.id, roomId: player.roomId, collapseTimer: hunt.collapseTimer, trapCount });
    return true;
  }

  function updateAuthorityTreasureHuntCollapse(state, fixedDelta, emitEvent, random) {
    const hunt = state.treasureHunt;
    if (authorityGameMode(state) !== 'treasure_hunt' || hunt?.phase !== 'escape') return;
    hunt.collapseTimer = Math.max(0, Number(hunt.collapseTimer || 0) - fixedDelta);
    const intensity = Math.max(0, Math.min(1, 1 - hunt.collapseTimer / Math.max(1, Number(hunt.collapseMax || 1))));
    hunt.blastTick = Number(hunt.blastTick || 0) - fixedDelta;
    if (hunt.blastTick <= 0) {
      activePlayers(state).filter(player => !player.downed).forEach(player => {
        const stream = random?.scoped?.(`treasure-hunt:collapse:${state.floorNumber}:${state.tick}:${player.id}`);
        const angle = (stream?.next?.() ?? 0.5) * Math.PI * 2;
        const distance = 45 + (stream?.next?.() ?? 0.5) * (150 - intensity * 35);
        const room = currentRoom(state, player.roomId);
        if (!room) return;
        room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
        room.hazards.push({ kind: 'bomb_aoe', source: 'dungeon_collapse', x: Math.max(76, Math.min(Number(state.floorState?.width || 900) - 76, player.x + Math.cos(angle) * distance)), y: Math.max(76, Math.min(Number(state.floorState?.height || 700) - 76, player.y + Math.sin(angle) * distance)), r: 20, blastRadius: 82 + intensity * 34, baseDamage: Math.round(15 + Number(state.floorNumber || 1) * 1.5 + intensity * 10), fuse: Math.max(0.7, 1.25 - intensity * 0.35), fuseDuration: Math.max(0.7, 1.25 - intensity * 0.35), sparkTick: 0, ttl: 2, enemy: true });
      });
      hunt.blastTick = Math.max(0.65, 2.15 - intensity * 1.25);
      emitEvent('TREASURE_HUNT_COLLAPSE', { collapseTimer: hunt.collapseTimer, intensity });
    }
    if (hunt.collapseTimer > 0) return;
    activePlayers(state).filter(player => !player.downed).forEach(player => {
      damagePlayer(state, player, Math.max(9999, Number(player.maxHp || 1) * 10), 'dungeon_collapse', emitEvent, 'dungeon_collapse', { ignoreInv: true, noInvFrames: true, applyDamageCaps: false });
    });
    hunt.collapseTimer = 15;
    hunt.blastTick = 0.8;
  }

  function prepareAuthorityTreasureHuntStartExit(state, room, emitEvent) {
    const hunt = state.treasureHunt;
    if (!hunt || hunt.phase !== 'escape' || !hunt.hasKey || room?.type !== 'start' || room.treasureHuntExitSpawned) return;
    room.treasureHuntExitSpawned = true;
    hunt.phase = 'returned';
    hunt.collapseTimer = 0;
    const x = Number(state.floorState?.width || 900) / 2;
    const y = Number(state.floorState?.height || 700) / 2;
    if ((room.treasureHuntExitKind || hunt.exitKind) === 'chest') {
      const id = state.allocateEntityId('interactable');
      state.interactables[id] = { id, kind: 'relic_chest', roomId: room.id, x, y, radius: 34, opened: false, treasureHuntExitChest: true, rewardType: 'item', spawnTick: state.tick };
      emitEvent('INTERACTABLE_SPAWNED', { interactableId: id, kind: 'relic_chest', roomId: room.id, source: 'treasure_hunt_exit' });
    } else {
      const id = state.allocateEntityId('interactable');
      state.interactables[id] = { id, kind: 'stairs', roomId: room.id, x, y, radius: 30, final: Number(state.floorNumber || 1) >= MAX_FLOOR, dwellByPlayer: {}, spawnTick: state.tick, treasureHuntExit: true };
      emitEvent('INTERACTABLE_SPAWNED', { interactableId: id, kind: 'stairs', roomId: room.id, source: 'treasure_hunt_exit' });
    }
    emitEvent('TREASURE_HUNT_RETURNED', { roomId: room.id, exitKind: room.treasureHuntExitKind || hunt.exitKind });
  }

  function openAuthorityEndlessIntermission(state, room, emitEvent, random) {
    if (authorityGameMode(state) !== 'endless' || !room || room.endlessIntermission) return;
    state.endlessWave = Math.max(0, Number(state.endlessWave || 0)) + 1;
    state.endlessWaveActive = false;
    room.endlessIntermission = true;
    room.shopStocked = false;
    room.shopOffers = [];
    room.shopMoveOffers = [];
    room.shopWeaponOffers = [];
    room.shopTradeOffer = null;
    const depth = 1 + Math.floor(Number(state.endlessWave || 1) / 2);
    const owner = activePlayers(state).find(player => player.roomId === room.id) || activePlayers(state)[0];
    const stockStream = random?.scoped?.(`endless:intermission:${state.endlessWave}:shop`);
    const shopView = { ...room, type: 'shop' };
    stockCampaignShop({ floorNumber: depth, elapsedSeconds: state.elapsedSeconds || 0, matchRules: state.matchRules || {} }, shopView, owner, stockStream);
    room.shopOffers = shopView.shopOffers || [];
    room.shopMoveOffers = shopView.shopMoveOffers || [];
    room.shopWeaponOffers = shopView.shopWeaponOffers || [];
    room.shopTradeOffer = shopView.shopTradeOffer || null;
    room.shopStocked = true;
    const chestStream = random?.scoped?.(`endless:intermission:${state.endlessWave}:chests`);
    createEndlessIntermissionChests({ waveNumber: state.endlessWave, geometry: { width: state.floorState?.width, height: state.floorState?.height } }, chestStream)
      .forEach(descriptor => {
        const id = state.allocateEntityId('interactable');
        state.interactables[id] = { ...descriptor, id, kind: 'endless_chest', roomId: room.id, radius: 34, spawnTick: state.tick };
        emitEvent('INTERACTABLE_SPAWNED', { interactableId: id, kind: 'endless_chest', roomId: room.id, price: descriptor.price });
      });
    const exitId = state.allocateEntityId('pickup');
    state.pickups[exitId] = {
      id: exitId, type: 'endlessNextWave', wave: state.endlessWave + 1, roomId: room.id,
      x: Number(state.floorState?.width || 900) / 2, y: Number(state.floorState?.height || 700) / 2 - 132,
      radius: 20, spawnTick: state.tick,
    };
    emitEvent('ENDLESS_INTERMISSION_OPENED', { roomId: room.id, wave: state.endlessWave, exitPickupId: exitId });
  }

  function startAuthorityEndlessWave(state, player, pickupId, emitEvent) {
    if (authorityGameMode(state) !== 'endless') return false;
    const room = currentRoom(state, player.roomId);
    if (!room?.endlessIntermission) return false;
    Object.entries(state.interactables || {}).forEach(([id, item]) => {
      if (item?.roomId === room.id && item.endlessShopChest) delete state.interactables[id];
    });
    Object.entries(state.pickups || {}).forEach(([id, pickup]) => {
      if (pickup?.roomId === room.id && pickup.type === 'endlessNextWave') delete state.pickups[id];
    });
    room.endlessIntermission = false;
    room.shopStocked = false;
    room.shopOffers = [];
    room.shopMoveOffers = [];
    room.shopWeaponOffers = [];
    room.shopTradeOffer = null;
    room.cleared = false;
    delete state.floorState?.encounters?.[room.id];
    state.endlessWaveActive = true;
    emitEvent('ENDLESS_WAVE_STARTED', { playerId: player.id, roomId: room.id, wave: Number(state.endlessWave || 0) + 1, pickupId });
    return true;
  }

  function getConnectedAuthorityRoom(state, room, direction) {
    if (!room || !direction) return null;
    const layout = state.floorState?.layout;
    const passage = room.secretPassages?.[direction];
    if (passage?.open) {
      return layout?.rooms?.find(candidate => candidate.gx === passage.targetGx && candidate.gy === passage.targetGy) || null;
    }
    if (!room.doors?.[direction]) return null;
    const vector = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[direction];
    if (!vector) return null;
    return layout?.rooms?.find(candidate => candidate.gx === room.gx + vector[0] && candidate.gy === room.gy + vector[1]) || null;
  }

  function authorityCanSpawnCampaignElite(state) {
    const mode = String(state.matchRules?.gameMode || state.matchRules?.mode || 'normal');
    if (mode === 'endless') return Number(state.endlessWave || 0) >= 2;
    const floor = Math.max(1, Number(state.floorNumber || 1));
    const loop = Math.max(1, Math.floor((floor - 1) / MAX_FLOOR) + 1);
    const eliteFloor = Math.max(1, Number(state.matchRules?.difficulty?.eliteFloor ?? 8) - (loop - 1) * 2);
    return floor >= eliteFloor && floor <= MAX_FLOOR;
  }

  // God mode: collecting every relic grants a 12s "godTimer" window that boosts
  // damage/speed and slashes cooldowns, exactly like the campaign. On the
  // authority the window end tick lives on the player as `godUntilTick`.
  const RELIC_KEYS = Object.freeze(Object.keys(ITEM_DEFS));
  function godModeActive(state, player) {
    return Number(state?.tick || 0) < Number(player?.godUntilTick || 0);
  }

  function getNetworkCampaignAttackSpeed(state, player) {
    const base = Math.max(0.2, Number(player?.attackSpeed || 1));
    const itemMultiplier = Math.max(0, Number(player?.itemStats?.attackSpeedMultiplier || 1));
    return Math.max(0.2, base * itemMultiplier * getCampaignTurtlePowerUpMultiplier(player, state?.tick));
  }
  function maybeGrantGodMode(state, player, emitEvent) {
    if (godModeActive(state, player)) return;
    if (!RELIC_KEYS.length) return;
    const items = player.items || {};
    if (!RELIC_KEYS.every(key => Number(items[key] || 0) > 0)) return;
    player.godUntilTick = state.tick + Math.round(12 * 20);
    emitEvent('GOD_MODE_GRANTED', { playerId: player.id, untilTick: player.godUntilTick });
  }

  function livingEncounterEnemies(state, roomId = state.floorState?.currentRoomId) {
    return Object.values(state.enemies || {}).filter(enemy => (
      enemy && enemy.roomId === roomId && !enemy.dead && Number(enemy.health) > 0
    ));
  }

  function isNetworkRoomLocked(state, roomId = state.floorState?.currentRoomId) {
    const room = currentRoom(state, roomId);
    if (!LOCKING_ENCOUNTER_ROOM_TYPES.has(room?.type)) return false;
    const encounter = state.floorState?.encounters?.[roomId];
    return encounter?.status === 'active' && livingEncounterEnemies(state, roomId).length > 0;
  }

  function encounterCount(room) {
    if (room?.type === 'boss' || room?.type === 'god') return 1;
    if (room?.type === 'challenge') return 3;
    if (room?.type === 'ladder') return 3;
    if (room?.type === 'combat') return 2;
    return 1;
  }

  function getEncounterPool(room, floorNumber) {
    if (room?.type === 'god') return ['god'];
    if (room?.type === 'boss') {
      const bosses = BOSS_ENEMY_TYPES.filter(type => !['god', 'bowman_bane'].includes(type));
      return bosses.length ? bosses : ['queen_cult'];
    }
    if (room?.type === 'start') return ['cult_follower'];
    const floor = Math.max(1, Number(floorNumber || 1));
    const pool = ['hunter', 'charger', 'laser', 'knave', 'cult_mage'];
    if (floor >= 3) pool.push('sniper', 'golem');
    if (floor >= 4) pool.push('summoner', 'shield_unit', 'healer');
    if (floor >= 6) pool.push('machine_gunner');
    if (room?.type === 'challenge') pool.push('golem', 'shield_unit', 'summoner');
    if (room?.type === 'ladder') pool.push('boss_spawner', 'healer');
    return pool.filter(type => STANDARD_ENEMY_TYPES.includes(type));
  }

  // Build the exact authoritative counterpart of campaign's mirror inventory
  // snapshot. The champion must retain the source hero's live kit and current
  // combat state; reducing it to just damage/range made the mirror challenge a
  // generic boss whenever an item, forge upgrade, or wounded source mattered.
  function createAuthorityMirrorKit(state, source) {
    const itemStats = { ...(source.itemStats || {}) };
    const attackSpeed = getNetworkCampaignAttackSpeed(state, source);
    const damageMultiplier = Math.max(0.1, Number(source.damageMultiplier || 1));
    const baseDamage = Math.max(1, (24 + Number(source.attackPower || 0)) * damageMultiplier);
    const equippedMoves = { ...(source.equippedMoves || {}) };
    const moveStats = {};
    Object.entries(equippedMoves).forEach(([slot, moveKey]) => {
      if (!MOVE_BASE_STATS[moveKey]) return;
      const forged = applyForgeStats(source, 'move', moveKey, MOVE_BASE_STATS[moveKey]);
      moveStats[moveKey] = {
        ...forged,
        damage: Math.max(1, Math.round((Number(forged.damage || baseDamage) + Number(source.attackPower || 0))
          * Math.max(0, Number(itemStats.levelEdgeDamageMultiplier || 1)))),
        cooldown: Math.max(0.12, Number(forged.cooldown || 0.5) / attackSpeed),
      };
      if (slot === 'laser') moveStats[moveKey].cooldown *= Number(source.laserCooldownMultiplier || 1);
    });
    const weaponKey = source.equippedWeapon || '';
    const weaponBase = WEAPON_BASE_STATS[weaponKey] || {};
    const forgedWeapon = weaponKey ? applyForgeStats(source, 'weapon', weaponKey, weaponBase) : null;
    const weaponStats = forgedWeapon ? {
      ...forgedWeapon,
      damage: Math.max(1, Math.round((weaponKey === 'excalibur' || weaponKey === 'katana_excalibur_777x'
        ? baseDamage * 7.77 : Number(forgedWeapon.damage || baseDamage)))),
      range: Math.max(40, Number(forgedWeapon.range || 90)),
      knockback: Math.max(0, Number(forgedWeapon.knockback || 140)),
      cooldown: Math.max(0.12, Number(forgedWeapon.cooldown || 0.5) / attackSpeed),
    } : null;
    const inventory = {
      playerState: { ...(source || {}) },
      character: source.characterKey || source.character || 'thorn_knight',
      level: Number(source.level || 1), xp: Number(source.xp || 0), xpToNext: Number(source.xpToNext || 20),
      hp: Math.max(1, Math.min(Number(source.maxHp || 120), Number(source.hp || source.maxHp || 120))),
      maxHp: Math.max(1, Number(source.maxHp || 120)), attackPower: Number(source.attackPower || 0),
      attackSpeed: Number(source.attackSpeed || 1), items: { ...(source.items || {}) },
      ownedMoves: { ...(source.ownedMoves || {}) }, ownedWeapons: { ...(source.ownedWeapons || {}) },
      equippedMoves, equippedWeapon: weaponKey, anvilUpgrades: { ...(source.anvilUpgrades || {}) },
      statuses: { ...(source.statuses || {}) }, barrier: Math.max(0, Number(source.barrier || 0)),
      moveStackOverrides: { ...(source.moveStackOverrides || {}) }, weaponChargeOverrides: { ...(source.weaponChargeOverrides || {}) },
    };
    return {
      inventory, itemStats, equippedMoves, weaponKey, weaponStats, moveStats, attackSpeed, baseDamage,
      hp: inventory.hp, maxHp: inventory.maxHp,
      beamDamage: Math.max(1, Math.round(Number(moveStats[equippedMoves.laser]?.damage || baseDamage)
        * Math.max(0, Number(itemStats.beamDamageMultiplier || 1)))),
      smashDamage: Math.max(1, Math.round(Number(moveStats[equippedMoves.smash]?.damage || baseDamage)
        * Math.max(0, Number(itemStats.aoeDamageMultiplier || 1)))),
      cooldowns: {
        melee: Math.max(0.18, Number(weaponStats?.cooldown || moveStats[equippedMoves.melee]?.cooldown || 0.4)),
        laser: Math.max(0.75, Number(moveStats[equippedMoves.laser]?.cooldown || 3.2)),
        smash: Math.max(1.1, Number(moveStats[equippedMoves.smash]?.cooldown || 4.2)),
        dash: Math.max(0.55, Number(moveStats[equippedMoves.dash]?.cooldown || 1.8)),
      },
    };
  }

  // Build a mirror-kit snapshot from the source player's authoritative loadout
  // and spawn a mirror champion that fights with it (the challenge-room boss).
  function spawnMirrorChampionEncounter(state, room, emitEvent) {
    const source = state.players?.[room.mirrorSourcePlayerId]
      || Object.values(state.players || {}).find(player => !player?.disconnected && player.roomId === room.id);
    if (!source) return null;
    const definition = getEnemyDefinition('mirror_knight');
    const kit = createAuthorityMirrorKit(state, source);
    // Match the campaign's mirror HP/speed: the champion carries the source
    // hero's max HP (min 180) and the campaign 228 base speed.
    const maxHealth = kit.maxHp;
    const enemyId = state.allocateEntityId('enemy');
    state.enemies[enemyId] = {
      id: enemyId,
      type: 'mirror_knight',
      spriteKey: source.characterKey || definition.spriteKey,
      behavior: 'mirror',
      roomId: room.id,
      x: Number(state.floorState.width || 900) / 2,
      y: Number(state.floorState.height || 700) / 2 - 150,
      vx: 0, vy: 0,
      radius: definition.radius,
      moveSpeed: 228,
      maxHealth,
      contactDamage: kit.baseDamage,
      projectileDamage: kit.baseDamage,
      elite: false, eliteTypes: [], elitePowers: [], patterns: [],
      boss: true, mirrorExactCopy: true,
      bleedImmune: false,
      statuses: createCampaignStatusMap(),
      contactCooldownUntilTick: 0,
      attackCooldownUntilTick: state.tick + 16,
      attackWindupUntilTick: 0,
      state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
      stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
      attackCd: 0.5,
      // Mirror kit read by updateMirrorChampion.
      attackSpeed: kit.attackSpeed,
      health: kit.hp,
      mirrorInventory: kit.inventory,
      mirrorPlayerState: kit.inventory.playerState,
      mirrorItems: kit.inventory.items,
      mirrorOwnedMoves: kit.inventory.ownedMoves,
      mirrorOwnedWeapons: kit.inventory.ownedWeapons,
      mirrorAnvilUpgrades: kit.inventory.anvilUpgrades,
      mirrorMoves: kit.equippedMoves,
      mirrorMoveStats: kit.moveStats,
      mirrorItemStats: kit.itemStats,
      mirrorWeapon: kit.weaponKey,
      mirrorWeaponStats: kit.weaponStats,
      mirrorCooldowns: kit.cooldowns,
      beamDamage: kit.beamDamage,
      smashDamage: kit.smashDamage,
    };
    const encounter = {
      roomId: room.id,
      roomType: room.type,
      status: 'active',
      enemyIds: [enemyId],
      startedTick: state.tick,
    };
    state.floorState.encounters[room.id] = encounter;
    applyAuthorityMoggysCoatOpening(state, room, emitEvent);
    emitEvent('ENEMY_SPAWNED', { enemyId, roomId: room.id, enemyType: 'mirror_knight', mirrorSourcePlayerId: source.id });
    return encounter;
  }

  function applyAuthorityMoggysCoatOpening(state, room, emitEvent) {
    const player = activePlayers(state).find(candidate => candidate.roomId === room?.id && candidate.moggysCoatPrimed);
    if (!player) return;
    const opening = resolveCampaignMoggysCoatOpening(player, livingEncounterEnemies(state, room.id), {
      isEligibleEnemy: enemy => enemy.type !== 'rival' || !enemy.rivalFriend,
    });
    if (!opening.consumePrime) return;
    player.moggysCoatPrimed = false;
    if (opening.stacks <= 0) return;
    opening.targets.forEach(enemy => {
      applyAuthorityStatus(state, enemy, 'dark_drain', opening.stacks, opening.duration, player.id);
    });
    if (opening.targets.length > 0) emitEvent('MOGGYS_COAT_TRIGGERED', {
      playerId: player.id, roomId: room.id, stacks: opening.stacks, targetCount: opening.targets.length,
    });
  }

  // Spawn any rivals marked to return this floor into the given combat room,
  // mirroring the slain character's default kit. Rivals hunt the nearest player.
  function spawnPendingRivals(state, room, emitEvent, randomService = combatRandomByState.get(state)) {
    if (!room || !ENCOUNTER_ROOM_TYPES.has(room.type) || room.type === 'start') return;
    const roster = Array.isArray(state.rivalRoster) ? state.rivalRoster : [];
    roster.forEach(entry => {
      if (!entry.pendingSpawn || entry.dead) return;
      entry.pendingSpawn = false;
      entry.spawnedInRoomId = room.id;
      const definition = getEnemyDefinition('rival');
      const characterKey = entry.characterKey;
      const spawnRandom = randomService?.scoped?.(`rival:spawn:${state.floorNumber}:${room.id}:${characterKey}`);
      const rivalLoadout = getCampaignRivalLoadout(characterKey, { random: () => spawnRandom ? spawnRandom.next() : 0.5 });
      const loadoutBySlot = Object.fromEntries(rivalLoadout.map(entry => [entry.slot, entry]));
      const equippedMoves = {
        melee: 'slash', laser: loadoutBySlot.laser?.key || getDefaultMoveLoadout(characterKey).laser,
        smash: loadoutBySlot.smash?.key || getDefaultMoveLoadout(characterKey).smash,
        dash: loadoutBySlot.dash?.key || getDefaultMoveLoadout(characterKey).dash,
      };
      const weaponKey = loadoutBySlot.melee?.key || getCharacterDefaultWeapon(characterKey);
      const profile = HERO_BASE_STATS[characterKey] || HERO_BASE_STATS.thorn_knight;
      const floorScale = 1 + (Number(state.floorNumber || 1) - 1) * 0.12;
      const baseDamage = Math.max(1, Math.round(24 * Number(profile.damageMultiplier || 1) * floorScale));
      const maxHealth = Math.max(220, Math.round(Number(profile.maxHp || 120) * 1.4 * floorScale));
      const enemyId = state.allocateEntityId('enemy');
      const moveStats = {};
      Object.values(equippedMoves).forEach(moveKey => {
        const base = MOVE_BASE_STATS[moveKey];
        if (base) moveStats[moveKey] = { damage: Math.max(1, Math.round(Number(base.damage || baseDamage) * Number(profile.damageMultiplier || 1) * floorScale)) };
      });
      const weaponBase = WEAPON_BASE_STATS[weaponKey] || {};
      state.enemies[enemyId] = {
        id: enemyId,
        type: 'rival',
        spriteKey: characterKey,
        behavior: 'mirror',
        roomId: room.id,
        rivalCharacterKey: characterKey,
        rivalFriend: !!entry.friend,
        rivalVendetta: !!entry.vendetta,
        x: Number(state.floorState.width || 900) / 2 + ((spawnRandom ? spawnRandom.next() : 0.5) - 0.5) * 120,
        y: Number(state.floorState.height || 700) / 2 - 120,
        vx: 0, vy: 0,
        radius: definition.radius,
        moveSpeed: 228,
        maxHealth, health: maxHealth,
        contactDamage: baseDamage,
        projectileDamage: baseDamage,
        elite: false, eliteTypes: [], elitePowers: [], patterns: [],
        boss: true, bleedImmune: false,
        statuses: createCampaignStatusMap(),
        contactCooldownUntilTick: 0,
        attackCooldownUntilTick: state.tick + 16,
        attackWindupUntilTick: 0,
        state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
        stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
        attackCd: 0.5, attackSpeed: 1,
        rivalBrain: createCampaignRivalBrain(characterKey),
        rivalMemory: { retreats: 0, warningsGiven: 0, provocations: 0, lastOutcome: 'Returning to the dungeon' },
        rivalLoadout,
        mirrorMoves: equippedMoves,
        mirrorMoveStats: moveStats,
        mirrorItemStats: { beamDamageMultiplier: 1, aoeDamageMultiplier: 1, bleedChance: 0 },
        mirrorWeapon: weaponKey,
        mirrorWeaponStats: weaponKey ? {
          damage: Math.max(1, Math.round(Number(weaponBase.damage || 24) * Number(profile.damageMultiplier || 1) * floorScale)),
          range: Math.max(40, Number(weaponBase.range || 90)),
          knockback: Math.max(0, Number(weaponBase.knockback || 140)),
        } : null,
        mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
        beamDamage: Math.max(1, Math.round((moveStats[equippedMoves.laser]?.damage || baseDamage))),
        smashDamage: Math.max(1, Math.round((moveStats[equippedMoves.smash]?.damage || baseDamage))),
      };
      const encounter = state.floorState.encounters[room.id];
      if (encounter && Array.isArray(encounter.enemyIds)) encounter.enemyIds.push(enemyId);
      emitEvent('ENEMY_SPAWNED', { enemyId, roomId: room.id, enemyType: 'rival', rivalCharacterKey: characterKey, vendetta: !!entry.vendetta });
    });
  }

  function ensureNetworkEncounter(state, random, emitEvent = () => {}, roomId = null) {
    const occupiedRoomId = roomId || Object.values(state.players || {}).find(player => !player?.disconnected)?.roomId || state.floorState?.currentRoomId;
    const room = currentRoom(state, occupiedRoomId);
    if (!room || !ENCOUNTER_ROOM_TYPES.has(room.type)) return null;
    if (authorityGameMode(state) === 'treasure_hunt' && room.treasureHuntEscapePending) {
      room.treasureHuntEscapePending = false;
      room.treasureHuntEscapeActive = true;
      emitEvent('TREASURE_HUNT_AMBUSH_STARTED', { roomId: room.id, floorNumber: state.floorNumber });
    }
    if (room.type === 'challenge') {
      room.challengeType = room.challengeType || rollCampaignChallengeType(
        state.floorNumber,
        () => random.scoped(`challenge:type:${state.floorNumber}:${room.id}`).next(),
      );
      if (!room.challengeStarted) {
        const existingStarter = Object.values(state.pickups || {}).find(pickup => pickup.type === 'challengeStarter' && pickup.roomId === room.id);
        if (!existingStarter) {
          const pickupId = state.allocateEntityId('pickup');
          state.pickups[pickupId] = {
            id: pickupId, type: 'challengeStarter', trial: room.challengeType, roomId: room.id,
            x: Number(state.floorState.width || 900) / 2,
            y: Number(state.floorState.height || 700) / 2,
            radius: 24, spawnTick: state.tick,
          };
          emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: 'challengeStarter', roomId: room.id, trial: room.challengeType });
        }
        return null;
      }
    }
    state.floorState.encounters = state.floorState.encounters || {};
    if (state.floorState.encounters[room.id]) {
      // A returning rival joins the party's current fight in progress.
      spawnPendingRivals(state, room, emitEvent, random);
      return state.floorState.encounters[room.id];
    }

    const gameMode = authorityGameMode(state);
    const rivalRumble = gameMode === 'rival_rumble' ? ensureAuthorityRivalRumble(state, random, emitEvent) : null;
    if (gameMode === 'rival_rumble') {
      if (!rivalRumble?.active) return null;
      return spawnAuthorityRivalRumbleStage(state, room, emitEvent, random);
    }

    // A started mirror challenge fields a single mirror champion mirroring the
    // activating player's kit, instead of the generic wave plan.
    if (room.type === 'challenge' && room.challengeType === 'mirror' && room.challengeStarted) {
      const encounter = spawnMirrorChampionEncounter(state, room, emitEvent);
      if (encounter) return encounter;
    }

    // Timed trials own their encounter pressure themselves. Storm is pure
    // hazard pressure, so a generic wave here would be multiplayer-only
    // gameplay and would also auto-clear the challenge before its timer ends.
    if (room.type === 'challenge' && ['circuit', 'storm', 'survival', 'runes', 'bomb'].includes(room.challengeType) && room.challengeStarted) {
      const encounter = { roomId: room.id, enemyIds: [], status: 'active', challengeTrial: room.challengeType };
      state.floorState.encounters[room.id] = encounter;
      return encounter;
    }

    const bossRush = gameMode === 'boss_rush' ? ensureAuthorityBossRush(state, random, emitEvent) : null;
    if (gameMode === 'boss_rush' && !bossRush?.active) return null;
    const stream = random.scoped(`enemy-spawning:${state.floorNumber}:${room.id}`);
    const plan = gameMode === 'endless'
      ? createCampaignEndlessWavePlan(Number(state.endlessWave || 0) + 1, {
        floorNumber: state.floorNumber, random: stream,
        roomWeightBonus: Number(state.matchRules?.difficulty?.roomWeightBonus || 0),
      })
      : gameMode === 'boss_rush'
        ? [BOSS_RUSH_ORDER[Math.max(0, Number(bossRush.stage || 0))]].filter(Boolean)
      : getCampaignEncounterPlan(room, {
      floorNumber: state.floorNumber,
      random: stream,
      difficulty: state.matchRules?.difficulty || {},
      challengeBonus: state.matchRules?.swarmRooms ? 2 : 0,
      roomWeightBonus: Number(state.matchRules?.difficulty?.roomWeightBonus || 0),
      });
    const enemyIds = [];
    for (let index = 0; index < plan.length; index += 1) {
      const enemyId = state.allocateEntityId('enemy');
      const angle = stream.next() * Math.PI * 2;
      const distance = 175 + stream.next() * 95;
      const type = plan[index];
      const archetype = getEnemyDefinition(type) || getEnemyDefinition('hunter');
      const healthScale = room.type === 'challenge' ? 1.25 : 1;
      const elite = !archetype.boss && room.type !== 'start' && stream.chance(room.type === 'challenge' ? 0.3 : 0.08);
      const enemyLevel = Math.max(
        1,
        Number(state.floorNumber || 1),
        ...activePlayers(state).map(player => Number(player.level || 1)),
      );
      const enemy = {
        id: enemyId,
        type,
        spriteKey: archetype.spriteKey,
        behavior: archetype.behavior,
        roomId: room.id,
        x: 450 + Math.cos(angle) * distance,
        y: 350 + Math.sin(angle) * Math.min(distance, 210),
        vx: 0,
        vy: 0,
        radius: archetype.radius,
        moveSpeed: archetype.moveSpeed * (room.type === 'challenge' ? 1.08 : 1),
        maxHealth: Math.round(archetype.maxHealth * healthScale),
        health: Math.round(archetype.maxHealth * healthScale),
        contactDamage: Math.round(archetype.contactDamage),
        projectileDamage: Math.max(5, Math.round(Number(archetype.projectileDamage || archetype.contactDamage * 0.75))),
        elite,
        eliteTypes: [], elitePowers: [],
        patterns: archetype.patterns || [],
        boss: !!archetype.boss,
        bleedImmune: !!archetype.bleedImmune,
        fireImmune: !!archetype.fireImmune,
        poisonImmune: !!archetype.poisonImmune,
        statuses: createCampaignStatusMap(),
        contactCooldownUntilTick: 0,
        attackCooldownUntilTick: state.tick + Math.max(4, Math.round(Number(archetype.attackCooldown || 1) * 20)) + stream.int(0, 6),
        attackWindupUntilTick: 0,
        state: 'chasing',
        facing: 1,
        spawnTick: state.tick,
        hitTick: -1,
        dead: false,
        // Campaign behavior state: seconds-based timers driven by the shared
        // authored bodies, seeded exactly like spawnEnemy() in game/enemies.js.
        stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0,
        swingTime: 0, dashTime: 0,
        attackCd: Math.max(0, Number(archetype.attackCooldown || 1)) + stream.next() * 0.3,
        ...(type === 'sniper'
          ? { sniperBehavior: (roll => (roll < 1 / 3 ? 'aggressive' : roll < 2 / 3 ? 'stayback' : 'melee'))(stream.next()) }
          : {}),
        ...(type === 'summoner' ? { summonCd: 4.4 } : {}),
        ...(type === 'shield_unit' ? { supportCd: 2.8 } : {}),
        ...(type === 'healer' ? { supportCd: 3 } : {}),
        ...(type === 'boss_spawner' ? { bossSpawnTimer: 30, bossSpawnWarnAt: 30, shoveCd: 3, shoveTimer: 0 } : {}),
        ...(type === 'cult_mage' ? { novaCd: 3, novaTimer: 0 } : {}),
        // Boss kits: seeded exactly like ENEMY_STATS in game/enemies.js.
        ...(type === 'queen_cult' ? { summonCd: 2.4, novaCd: 3, novaTimer: 0 } : {}),
        ...(type === 'bulk_golem' ? { splitReady: true, aoeTime: 3, jumpCd: 1.2 } : {}),
        ...(type === 'artificer_knave' ? { phase: 1 } : {}),
        ...(type === 'bowman_bane' ? { phase: 1, columnCd: 0, burstCd: 0, bowmanWarpCd: 2.8, thunderSmashCd: 0.6 } : {}),
        ...(type === 'antony_blemmye' ? { phase: 1, hammerCd: 1.55, biteCd: 1.15, slashCd: 2.05, deathBallCd: 5.4 } : {}),
        ...(type === 'handsome_devil' ? { phase: 1, spikeCd: 0.9, lavaGridCd: 2.4, devilLaserCd: 1.6, clawCd: 0.4, giantLaserCd: 3.6, beamRange: 560 } : {}),
        ...(type === 'god' ? { phase: 1, partitionAngles: [], partitionAngle: 0, partitionRotationDir: 1, partitionRotationSpeed: 0 } : {}),
      };
      if (elite) {
        const profile = resolveCampaignEliteProfile({
          maxHealth: enemy.maxHealth, health: enemy.health, damage: enemy.contactDamage,
          moveSpeed: enemy.moveSpeed, radius: enemy.radius, attackCooldown: enemy.attackCd,
          statusResistances: enemy.statusResistances, stunResistance: enemy.stunResistance,
          bleedResistance: enemy.bleedResistance, defenseMultiplier: enemy.defenseMultiplier,
        }, {
          level: enemyLevel,
          random: () => stream.next(),
          eliteHpMultiplier: state.matchRules?.difficulty?.eliteHpMultiplier ?? 1,
        });
        Object.assign(enemy, {
          level: enemyLevel,
          maxHealth: profile.maxHealth, health: profile.health, contactDamage: profile.damage,
          projectileDamage: Math.max(5, Math.round(Number(enemy.projectileDamage || 0) * Math.max(1, profile.damage / Math.max(1, archetype.contactDamage)))),
          moveSpeed: profile.moveSpeed, radius: profile.radius, attackCd: profile.attackCooldown,
          statusResistances: profile.statusResistances, stunResistance: profile.stunResistance,
          bleedResistance: profile.bleedResistance, defenseMultiplier: profile.defenseMultiplier,
          eliteTypes: profile.eliteTypes, eliteInventory: profile.eliteInventory,
          eliteBody: profile.eliteBody, eliteKnightMult: profile.eliteKnightMult,
          eliteUnfazed: profile.eliteUnfazed, elitePowers: profile.elitePowers,
          eliteProcs: profile.eliteProcs, eliteDurabilityV2: profile.eliteDurabilityV2,
          eliteLaserCd: profile.eliteLaserCd, eliteLaserModeIndex: profile.eliteLaserModeIndex,
          eliteCrit: profile.eliteCrit,
        });
      } else {
        enemy.level = enemyLevel;
      }
      state.enemies[enemyId] = enemy;
      enemyIds.push(enemyId);
      emitEvent('ENEMY_SPAWNED', {
        enemyId, roomId: room.id, enemyType: enemy.type, elite,
        elitePower: enemy.elitePowers?.find(power => power !== 'nothing') || null,
      });
      announceAuthorityBossIntro(state, enemy, emitEvent);
    }
    const encounter = {
      roomId: room.id,
      roomType: room.type,
      status: 'active',
      enemyIds,
      startedTick: state.tick,
      clearedTick: null,
      ...(gameMode === 'boss_rush' ? { bossRushStage: Number(bossRush.stage || 0) } : {}),
    };
    state.floorState.encounters[room.id] = encounter;
    applyAuthorityMoggysCoatOpening(state, room, emitEvent);
    // A rival scheduled to return this floor joins the first fight it reaches.
    spawnPendingRivals(state, room, emitEvent, random);
    // An accepted bounty plants its marked elite in the first combat room the
    // contract holder reaches, exactly like spawnAcceptedBountyTarget() in
    // game/specialRooms.js. Without this the authority created the contract and
    // never fielded a target, leaving an uncompletable bounty.
    spawnAcceptedBountyTargets(state, room, random, emitEvent);
    return encounter;
  }

  // Mirrors BOUNTY_DEFS in game/specialRooms.js. The reward payouts live with
  // the contract resolution in SharedSpecialRoomSystem; only what the authority
  // needs to field the target is duplicated here.
  const BOUNTY_TARGET_DEFS = Object.freeze({
    elite_hunter: Object.freeze({ enemyType: 'hunter', contractType: 'execution', title: 'Elite Hunter' }),
    elite_charger: Object.freeze({ enemyType: 'charger', contractType: 'capture', title: 'Elite Charger' }),
    elite_sniper: Object.freeze({ enemyType: 'sniper', contractType: 'theft', title: 'Elite Sniper' }),
  });

  function spawnAcceptedBountyTargets(state, room, random, emitEvent) {
    if (!room || room.type !== 'combat' || room.cleared) return;
    Object.values(state.players || {}).forEach(player => {
      const bounty = player?.activeBounty;
      if (!bounty || bounty.targetSpawned || player.disconnected) return;
      if (player.roomId !== room.id) return;
      const depth = Math.max(1, Number(state.floorNumber || 1));
      if (Number(bounty.returnDepth || 0) > depth) return;
      const def = BOUNTY_TARGET_DEFS[bounty.kind];
      if (!def) return;
      const living = Object.values(state.enemies || {})
        .find(enemy => enemy?.bountyTargetId === bounty.targetId && !enemy.dead);
      if (living) {
        bounty.targetSpawned = true;
        bounty.targetRoomKey = `${room.gx},${room.gy}`;
        return;
      }
      const archetype = getEnemyDefinition(def.enemyType) || getEnemyDefinition('hunter');
      const stream = random.scoped(`bounty-target:${bounty.targetId}`);
      const angle = stream.next() * Math.PI * 2;
      const distance = 180 + stream.next() * 90;
      const width = Number(state.floorState?.width || 900);
      const height = Number(state.floorState?.height || 700);
      // Escaped targets come back tougher, matching the campaign's escalation.
      const escapes = Math.max(0, Number(bounty.escapes || 0));
      const healthScale = 1.35 * (1 + escapes * 0.35);
      const damageScale = 1.18 * (1 + escapes * 0.22);
      const enemyId = state.allocateEntityId('enemy');
      state.enemies[enemyId] = {
        id: enemyId,
        type: def.enemyType,
        spriteKey: archetype.spriteKey,
        behavior: archetype.behavior,
        roomId: room.id,
        x: Math.max(90, Math.min(width - 90, width / 2 + Math.cos(angle) * distance)),
        y: Math.max(90, Math.min(height - 90, height / 2 + Math.sin(angle) * distance)),
        vx: 0,
        vy: 0,
        radius: archetype.radius,
        moveSpeed: archetype.moveSpeed,
        maxHealth: Math.max(1, Math.round(archetype.maxHealth * healthScale)),
        health: Math.max(1, Math.round(archetype.maxHealth * healthScale)),
        contactDamage: Math.max(1, Math.round(archetype.contactDamage * damageScale)),
        projectileDamage: Math.max(5, Math.round(Number(archetype.projectileDamage || archetype.contactDamage * 0.75) * damageScale)),
        elite: true,
        eliteTypes: ['knight', 'bounty'],
        elitePowers: [],
        patterns: archetype.patterns || [],
        boss: false,
        bleedImmune: !!archetype.bleedImmune,
        fireImmune: !!archetype.fireImmune,
        poisonImmune: !!archetype.poisonImmune,
        statuses: createCampaignStatusMap(),
        contactCooldownUntilTick: 0,
        attackCooldownUntilTick: state.tick + Math.max(4, Math.round(Number(archetype.attackCooldown || 1) * 20)),
        attackWindupUntilTick: 0,
        state: 'chasing',
        facing: 1,
        spawnTick: state.tick,
        hitTick: -1,
        dead: false,
        stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0,
        swingTime: 0, dashTime: 0,
        attackCd: Math.max(0, Number(archetype.attackCooldown || 1)) + stream.next() * 0.3,
        ...(def.enemyType === 'sniper' ? { sniperBehavior: 'stayback' } : {}),
        // Contract bookkeeping the reward path reads on kill.
        bountyTarget: true,
        bountyTargetId: bounty.targetId,
        bountyOwnerId: player.id,
        bountyContractKind: bounty.kind,
        bountyContractType: bounty.contractType || def.contractType,
        bountyName: bounty.targetName || def.title,
        bountyEscapes: escapes,
      };
      const encounter = state.floorState.encounters?.[room.id];
      if (encounter && Array.isArray(encounter.enemyIds)) encounter.enemyIds.push(enemyId);
      bounty.targetSpawned = true;
      bounty.targetRoomKey = `${room.gx},${room.gy}`;
      emitEvent('ENEMY_SPAWNED', {
        enemyId, roomId: room.id, enemyType: def.enemyType, elite: true, elitePower: null,
        bountyTarget: true, bountyName: bounty.targetName || def.title, playerId: player.id,
      });
    });
  }

  // Killing the marked elite resolves the contract for its holder. The campaign
  // additionally supports capture/theft interacts (game/specialRooms.js); on the
  // authority every contract resolves on the kill, so a multiplayer bounty is
  // always completable rather than silently stalling at "accepted".
  function resolveBountyTargetKill(state, enemy, playerId, emitEvent) {
    const owner = state.players?.[enemy.bountyOwnerId] || state.players?.[playerId];
    const bounty = owner?.activeBounty;
    if (!bounty || bounty.targetId !== enemy.bountyTargetId) return;
    const rewardMultiplier = Math.max(1, Number(bounty.rewardMultiplier || 1));
    const trophies = Math.max(1, 1 + Math.floor(Number(bounty.escapes || 0)));
    const randomService = combatRandomByState.get(state);
    const stream = randomService?.scoped(`bounty-reward:${bounty.targetId}`);
    let rewardKey = '';
    if (bounty.kind === 'elite_hunter') {
      owner.coins = Math.max(0, Number(owner.coins || 0)) + Math.round(90 * rewardMultiplier);
    } else if (bounty.kind === 'elite_charger') {
      collectSharedCampaignItem(owner, 'forge_voucher');
      owner.xp = Math.max(0, Number(owner.xp || 0))
        + Math.round((35 + Math.max(1, Number(state.floorNumber || 1)) * 5) * rewardMultiplier);
    } else if (bounty.kind === 'elite_sniper') {
      rewardKey = rollCampaignItem(stream ? () => stream.next() : authorityFallbackRandom, { elite: true }) || '';
      if (rewardKey) collectSharedCampaignItem(owner, rewardKey);
      if (Number(bounty.escapes || 0) > 0) {
        owner.coins = Math.max(0, Number(owner.coins || 0)) + Math.round(60 * rewardMultiplier);
      }
    }
    owner.bountyTrophies = Math.max(0, Number(owner.bountyTrophies || 0)) + trophies;
    owner.lastBountyStatus = `COMPLETE: ${bounty.targetName || bounty.kind}`;
    owner.activeBounty = null;
    emitEvent('BOUNTY_COMPLETED', {
      playerId: owner.id, killedBy: playerId, roomId: enemy.roomId, kind: bounty.kind,
      contractType: bounty.contractType, targetName: bounty.targetName || '',
      trophies, rewardKey, coins: Number(owner.coins || 0),
    });
  }

  function ensureNetworkRoomReward(state, random, emitEvent = () => {}, roomId = null) {
    const room = currentRoom(state, roomId);
    if (!room || room.type !== 'treasure') return null;
    state.floorState.rewards = state.floorState.rewards || {};
    const existingReward = state.floorState.rewards[room.id];
    if (existingReward) return state.interactables?.[existingReward.interactableIds?.[0]] || null;
    const stream = random.scoped(`loot:${state.floorNumber}:${room.id}`);
    const interactableIds = [];
    const chestPlan = createTreasureChestPlan({
      random: stream,
      floorNumber: state.floorNumber,
      geometry: state.floorState,
      itemChance: 0.9,
    });
    chestPlan.forEach(plannedChest => {
      const interactableId = state.allocateEntityId('interactable');
      const chest = {
        ...plannedChest,
        id: interactableId,
        kind: 'relic_chest',
        roomId: room.id,
        radius: 34,
        opened: false,
        claimedBy: null,
        spawnTick: state.tick,
      };
      state.interactables[interactableId] = chest;
      interactableIds.push(interactableId);
      emitEvent('INTERACTABLE_SPAWNED', { interactableId, kind: chest.kind, roomId: room.id });
    });
    state.floorState.rewards[room.id] = { interactableIds, status: 'available' };
    return state.interactables[interactableIds[0]];
  }

  function ensureAuthoritySpecialRoomContent(state, random, emitEvent, roomId) {
    const room = currentRoom(state, roomId);
    if (!room?.secret || room.type !== 'secret') return;
    const entrant = activePlayers(state).find(player => player.roomId === room.id);
    if (entrant && entrant.authorityLastSecretRoomId !== room.id) {
      entrant.authorityLastSecretRoomId = room.id;
      room.authoritySecretVisits = Math.max(0, Number(room.authoritySecretVisits || 0)) + 1;
      if (room.authoritySecretVisits >= 2 && room.secretKind !== 'bowman_bane') {
        room.secretKind = 'bowman_bane';
        room.cleared = false;
        room.bossStarted = true;
        room.secretLifecycleInitialized = true;
        const escape = prepareCampaignBowmanBaneEscape(room, entrant.characterKey);
        if (escape.ok) revealCampaignBowmanBaneEscape(room, entrant.characterKey);
        spawnAuthorityBowmanBane(state, room, emitEvent);
        return;
      }
    }
    if (room.secretLifecycleInitialized) return;
    const stream = random.scoped(`secret:lifecycle:${state.floorNumber}:${room.id}`);
    const plan = createCampaignSecretRoomPlan(room, {
      floorNumber: state.floorNumber,
      runLoopIndex: state.runLoopIndex ?? state.floorState?.runLoopIndex ?? 0,
      maxFloor: MAX_FLOOR,
      width: state.floorState?.width,
      height: state.floorState?.height,
      random: () => stream.next(),
      xpCost: 30,
      xpValue: 40 + Number(state.floorNumber || 1) * 5,
      rollItem: nextRandom => rollCampaignItem(nextRandom),
      rollEliteItem: nextRandom => rollCampaignItem(nextRandom, { elite: true }),
      previousRewardKey: entrant?.lastSecretVendorRewardKey,
    });
    if (!plan.ok) return;
    room.secretLifecycleInitialized = true;
    room.secretKind = plan.secretKind || room.secretKind;
    plan.pickups.forEach(descriptor => {
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = { id: pickupId, ...descriptor, roomId: room.id, radius: 22, spawnTick: state.tick };
      emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: descriptor.type, roomId: room.id });
    });
  }

  // The campaign dispatches these relics from `room:enter`. Online players
  // never own that browser event, so the authority detects the same durable
  // room-entry edge once per player. Room reveal is global to the co-op map:
  // the first entrant gets Last Penny; every entrant gets their own pendant
  // cadence and eligible Mateo refill.
  function applyAuthorityRoomEntryItemEffects(state, emitEvent) {
    const floorNumber = Math.max(1, Number(state.floorNumber || 1));
    activePlayers(state).forEach(player => {
      const room = currentRoom(state, player.roomId);
      if (!room) return;
      const entryKey = `${floorNumber}:${room.id}`;
      if (player.authorityLastRoomEntryKey === entryKey) return;
      const isInitialEntry = player.authorityLastRoomEntryKey == null;
      player.authorityLastRoomEntryKey = entryKey;
      // A freshly constructed player has no transient combat state to clear.
      // Subsequent room/floor/special-room entries use the campaign reset.
      if (!isInitialEntry) {
        const reset = applyCampaignRoomEntryReset(player, { tickBased: true, currentTick: state.tick });
        if (reset.cancelledBeam) endBeamChannel(state, player);
        delete player.weaponBeamChannel;
      }
      const firstReveal = !room.authorityRevealed;
      room.authorityRevealed = true;
      const result = resolveCampaignRoomEntryItemEffects(player, room, {
        firstReveal,
        floorNumber,
        getPotionCarryCap: getCampaignPotionCarryCap,
      });
      (result.intents || []).forEach(intent => emitEvent('ITEM_ROOM_ENTRY_EFFECT', {
        playerId: player.id,
        roomId: room.id,
        firstReveal,
        ...intent,
      }));
    });
  }

  // Multiplayer has one party-level presentation stream. Resolve the same
  // character-aware intro content as campaign, persist the selected key in the
  // authority snapshot, and let each browser's existing dialogue UI present it.
  function announceAuthorityBossIntro(state, enemy, emitEvent = () => {}) {
    if (!enemy?.boss || !enemy.type || enemy.bossIntro) return null;
    const floorState = state.floorState || (state.floorState = {});
    const played = floorState.bossIntroPlayed || (floorState.bossIntroPlayed = {});
    const characterKeys = activePlayers(state)
      .filter(player => player.roomId === enemy.roomId)
      .sort((first, second) => String(first.id).localeCompare(String(second.id)))
      .map(player => player.characterKey || player.character)
      .filter(Boolean);
    const intro = resolveCampaignBossIntro({
      enemyType: enemy.type,
      characterKeys,
      playedKeys: Object.keys(played).filter(key => played[key]),
    });
    if (!intro) return null;
    played[intro.key] = true;
    enemy.bossIntro = { key: intro.key, startedTick: state.tick };
    enemy.attackCd = Math.max(Number(enemy.attackCd || 0), 1.4);
    enemy.stun = Math.max(Number(enemy.stun || 0), 0.25);
    emitEvent('BOSS_INTRO', {
      enemyId: enemy.id,
      enemyType: enemy.type,
      roomId: enemy.roomId,
      introKey: intro.key,
      lines: intro.lines,
    });
    return intro;
  }

  function spawnAuthorityBowmanBane(state, room, emitEvent) {
    const existing = Object.values(state.enemies || {}).find(enemy => enemy?.roomId === room.id && enemy.type === 'bowman_bane' && !enemy.dead);
    if (existing) return existing;
    const definition = getEnemyDefinition('bowman_bane');
    if (!definition) return null;
    const id = state.allocateEntityId('enemy');
    const radius = Number(definition.radius || 36);
    const enemy = {
      id, type: 'bowman_bane', spriteKey: definition.spriteKey, behavior: definition.behavior, roomId: room.id,
      x: Number(state.floorState?.width || 900) / 2, y: Number(state.floorState?.height || 700) / 2 - 40,
      vx: 0, vy: 0, radius, moveSpeed: Number(definition.moveSpeed || 80), maxHealth: Number(definition.maxHealth || 2400), health: Number(definition.maxHealth || 2400),
      contactDamage: Number(definition.contactDamage || 50), projectileDamage: Number(definition.projectileDamage || 32),
      elite: false, eliteTypes: [], elitePowers: [], patterns: definition.patterns || [], boss: true, bleedImmune: true,
      statuses: createCampaignStatusMap(), contactCooldownUntilTick: 0, attackCooldownUntilTick: state.tick + 40, attackWindupUntilTick: 0,
      state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
      stun: 0.4, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
      attackCd: 2, attackSpeed: 1, phase: 1, columnCd: 0, burstCd: 0, bowmanWarpCd: 2.8, thunderSmashCd: 0.6,
    };
    state.enemies[id] = enemy;
    state.floorState.encounters = state.floorState.encounters || {};
    state.floorState.encounters[room.id] = { roomId: room.id, roomType: room.type, status: 'active', enemyIds: [id], startedTick: state.tick, secretBoss: true };
    emitEvent('ENEMY_SPAWNED', { enemyId: id, roomId: room.id, enemyType: 'bowman_bane', secretBoss: true });
    announceAuthorityBossIntro(state, enemy, emitEvent);
    emitEvent('BOWMAN_BANE_ESCAPE_REVEALED', { roomId: room.id, direction: room.baneEscapeDirection || '' });
    return enemy;
  }

  function scaleCampaignShopPrice(state, player, baseCost) {
    const depth = Math.max(1, Number(state.floorNumber || 1));
    const progression = 1 + Math.max(0, depth - 1) * 0.03 + Math.max(0, Number(state.elapsedSeconds || 0)) / 60 * 0.02;
    const xpProgress = Number(player?.items?.scholar_seal || 0) > 0
      ? Math.max(0, Math.min(1, Number(player.xp || 0) / Math.max(1, Number(player.xpToNext || 1))))
      : 0;
    return Math.max(1, Math.round(Number(baseCost || 0) * progression * (1 - xpProgress * 0.1)));
  }

  function campaignShopItemCost(state, player, itemIndex, itemKey) {
    const rarity = String(ITEM_DROP_ENTRIES.find(([key]) => key === itemKey)?.[2] || 'knight');
    const rarityMultiplier = rarity === 'god' ? 4.75 : rarity === 'wizard' ? 2.15 : 1;
    return scaleCampaignShopPrice(state, player, (32 + Number(state.floorNumber || 1) * 4 + itemIndex * 6) * rarityMultiplier);
  }

  function ensureCampaignShop(state, random, emitEvent = () => {}, roomId = null) {
    const room = currentRoom(state, roomId);
    if (!room || room.type !== 'shop') return null;
    if (room.shopStocked) return room.shopOffers;
    const stream = random.scoped(`shop-inventory:${state.floorNumber}:${room.id}`);
    const occupant = activePlayers(state).find(player => player.roomId === room.id) || null;
    stockCampaignShop(state, room, occupant, stream);
    emitEvent('SHOP_STOCKED', {
      roomId: room.id,
      offerCount: room.shopOffers?.length || 0,
      moveOfferCount: room.shopMoveOffers?.length || 0,
      weaponOfferCount: room.shopWeaponOffers?.length || 0,
      hasTrade: !room.shopTradeOffer?.unavailable,
    });
    return room.shopOffers;
  }

  function resolveShopPurchase(state, player, action, emitEvent) {
    const room = currentRoom(state, player.roomId);
    const shopRoom = ((authorityGameMode(state) === 'endless' && room?.endlessIntermission)
      || (authorityGameMode(state) === 'boss_rush' && room?.bossRushIntermission))
      ? { ...room, type: 'shop' }
      : room;
    const result = purchaseCampaignShop(state, shopRoom, player, action);
    if (!result.ok) return false;
    emitEvent('SHOP_PURCHASED', { playerId: player.id, roomId: room.id, ...result, itemKey: result.kind === 'item' ? result.key : undefined });
    return true;
  }

  function resolveForgeCommand(state, player, action, emitEvent) {
    const room = currentRoom(state, player?.roomId);
    if (!room || room.type !== 'anvil' || player?.downed) return false;
    const result = applyForgeCommand(player, action, { WEAPON_BASE_STATS, MOVE_BASE_STATS });
    if (!result.ok) {
      emitEvent('GAME_COMMAND_REJECTED', { playerId: player.id, command: 'FORGE_COMMIT', reason: result.reason });
      return false;
    }
    emitEvent('FORGE_COMMITTED', {
      playerId: player.id,
      roomId: room.id,
      currency: result.currency,
      xp: result.xp,
      gold: result.gold,
      stagedSteps: result.stagedSteps,
      voucherSteps: result.voucherSteps,
    });
    return true;
  }

  function resolveInventoryCommand(state, player, action, emitEvent, random) {
    // Mateo's Bag uses the same slot UI as the other tools, but its campaign
    // activation is the stored-potion action rather than a timed equipment
    // effect. Routing it here keeps the multiplayer slot from becoming a
    // no-op and preserves the full-health rival-sharing branch in
    // resolveUsePotion.
    if (action.action === 'ACTIVATE_EQUIPMENT' && action.itemKey === 'mateos_bag') {
      if (Number(player.items?.mateos_bag || 0) <= 0 || !player.equipmentSlots?.includes('mateos_bag')) {
        emitEvent('GAME_COMMAND_REJECTED', { playerId: player.id, command: action.action, reason: 'NOT_EQUIPPED' });
        return false;
      }
      resolveUsePotion(state, player, emitEvent, random);
      return true;
    }
    if (action.action === 'ACTIVATE_EQUIPMENT' && action.itemKey === 'charged_adapter') {
      const room = currentRoom(state, player.roomId);
      const targetRoom = state.floorState?.layout?.rooms?.find(candidate => candidate.type === 'ladder')
        || state.floorState?.layout?.rooms?.find(candidate => candidate.type === 'boss');
      const existingPortal = Object.values(state.pickups || {}).some(pickup => (
        pickup?.type === 'adapterPortal' && pickup.roomId === player.roomId
      ));
      const portal = prepareCampaignChargedAdapterWarp(player, {
        hasCurrentRoom: !!room,
        roomType: room?.type,
        hasTargetRoom: !!targetRoom,
        targetIsCurrent: targetRoom === room,
        hasExistingPortal: existingPortal,
        targetRoomId: targetRoom?.id,
        targetGx: targetRoom?.gx,
        targetGy: targetRoom?.gy,
        x: Number(player.x),
        y: Math.max(48, Number(player.y) - 96),
        activateDelayTicks: 15,
      });
      if (!portal.ok) {
        emitEvent('GAME_COMMAND_REJECTED', { playerId: player.id, command: action.action, reason: portal.reason });
        return false;
      }
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = { id: pickupId, ...portal, roomId: player.roomId, radius: 27, spawnTick: state.tick };
      emitEvent('ADAPTER_PORTAL_OPENED', { playerId: player.id, roomId: player.roomId, pickupId, targetRoomId: portal.targetRoomId });
      emitEvent('EQUIPMENT_ACTIVATED', {
        playerId: player.id, roomId: player.roomId, type: action.action, itemKey: 'charged_adapter', kind: 'ladder_warp', stacks: 1,
      });
      return true;
    }
    const result = action.action === 'ACTIVATE_EQUIPMENT'
      ? activateEquipment(player, action.itemKey, state.tick)
      : applyInventoryCommand(player, { ...action, type: action.action }, { MOVE_SLOT_BY_KEY, WEAPON_BASE_STATS });
    if (!result.ok) {
      emitEvent('GAME_COMMAND_REJECTED', { playerId: player.id, command: action.action, reason: result.reason });
      return false;
    }
    if (action.action === 'ACTIVATE_EQUIPMENT' && result.kind === 'panic') {
      player.statusUntilTick = {};
      livingEncounterEnemies(state, player.roomId).forEach(enemy => {
        const distance = Math.hypot(Number(enemy.x) - Number(player.x), Number(enemy.y) - Number(player.y));
        if (distance > 190 + (result.stacks - 1) * 28) return;
        const angle = Math.atan2(Number(enemy.y) - Number(player.y), Number(enemy.x) - Number(player.x));
        enemy.vx = Number(enemy.vx || 0) + Math.cos(angle) * (440 + (result.stacks - 1) * 55);
        enemy.vy = Number(enemy.vy || 0) + Math.sin(angle) * (440 + (result.stacks - 1) * 55);
        enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + Math.round((0.28 + (result.stacks - 1) * 0.05) * 20));
        damageEnemy(state, enemy, 8 + (result.stacks - 1) * 4, player.id, emitEvent, { attackKind: 'panic_button' });
      });
    } else if (action.action === 'ACTIVATE_EQUIPMENT' && result.kind === 'sparkle') {
      livingEncounterEnemies(state, player.roomId)
        .map(enemy => ({ enemy, distance: Math.hypot(Number(enemy.x) - Number(player.x), Number(enemy.y) - Number(player.y)) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, Math.min(12, 5 + (result.stacks - 1) * 2))
        .forEach(({ enemy }) => { enemy.critSparkleUntilTick = state.tick + (6 + result.stacks - 1) * 20; });
    } else if (action.action === 'ACTIVATE_EQUIPMENT' && action.itemKey === 'el_bartos_cape') {
      const graffiti = planCampaignElBartoGraffiti(result.stacks, () => random?.next?.('encounter') ?? 1);
      if (graffiti.spawn) createAbilityEntity(state, player, {
        kind: 'el_barto_graffiti', abilityId: 'el_bartos_cape', radius: graffiti.radius, damage: graffiti.damage,
        durationTicks: Math.round(graffiti.durationSeconds * 20), pulseIntervalTicks: Math.round(graffiti.intervalSeconds * 20), rawDamage: true, knockback: graffiti.knockback,
      });
    }
    emitEvent(action.action === 'ACTIVATE_EQUIPMENT' ? 'EQUIPMENT_ACTIVATED' : 'INVENTORY_CHANGED', {
      playerId: player.id, roomId: player.roomId, ...result,
    });
    return true;
  }

  function updatePlayerEquipmentEffects(state, emitEvent) {
    Object.values(state.players || {}).forEach(player => {
      if (!player || player.downed) return;
      if (player.equippedWeapon === 'golden_fleece') {
        const fleece = resolveCampaignGoldenFleece({ maxHp: player.maxHp, healingMultiplier: player.itemStats?.healingMultiplier });
        const intervalTicks = Math.max(1, fleece.intervalSeconds * 20);
        if (!Number.isFinite(Number(player.goldenFleeceNextTick))) player.goldenFleeceNextTick = state.tick + intervalTicks;
        if (state.tick >= Number(player.goldenFleeceNextTick)) {
          const before = Number(player.hp || 0);
          player.hp = Math.min(Number(player.maxHp || 1), before + fleece.healAmount);
          player.goldenFleeceNextTick += intervalTicks;
          const healedAmount = player.hp - before;
          if (healedAmount > 0) emitEvent('PLAYER_HEALED', {
            playerId: player.id, roomId: player.roomId, source: 'golden_fleece', healedAmount, health: player.hp,
          });
        }
      } else {
        delete player.goldenFleeceNextTick;
      }
      updateEquipmentEffects(player, state.tick).forEach(intent => {
        const enemies = livingEncounterEnemies(state, player.roomId);
        if (intent.kind === 'missiles') {
          const count = Math.min(4, intent.stacks);
          for (let index = 0; index < count; index += 1) {
            const target = enemies.slice().sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[index % Math.max(1, enemies.length)];
            const angle = target ? Math.atan2(target.y - player.y, target.x - player.x) : Number(player.aimDirection || 0) + (index - (count - 1) / 2) * 0.22;
            createPlayerProjectile(state, player, { kind: 'homing_missile', attackKind: intent.itemKey, damage: 16 * (1 + (count - 1) * 0.12), speed: 430, radius: 6, lifeTicks: 50 }, angle);
          }
        } else if (intent.kind === 'lightning') {
          enemies.map(enemy => ({ enemy, distance: Math.hypot(enemy.x - player.x, enemy.y - player.y) }))
            .filter(entry => entry.distance <= 300 + (intent.stacks - 1) * 22)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, Math.min(12, 7 + intent.stacks - 1))
            .forEach(({ enemy }) => damageEnemy(state, enemy, 15 + (intent.stacks - 1) * 3, player.id, emitEvent, { attackKind: intent.itemKey }));
          createAbilityEntity(state, player, { kind: 'lightning_column', abilityId: intent.itemKey, radius: 42, damage: 13 + (intent.stacks - 1) * 2, durationTicks: 11, pulseIntervalTicks: 5 });
        } else if (intent.kind === 'mines') {
          const mine = planCampaignThornMine(intent.stacks);
          for (let index = 0; index < mine.count; index += 1) {
            const angle = state.tick * 1.7 + index * Math.PI * 2 / Math.min(3, intent.stacks);
            createAbilityEntity(state, player, { kind: 'thorn_mine', abilityId: intent.itemKey, x: player.x + Math.cos(angle) * (42 + index * 12), y: player.y + Math.sin(angle) * (42 + index * 12), radius: mine.blastRadius, damage: mine.damage, durationTicks: Math.round(mine.durationSeconds * 20), firstPulseDelayTicks: Math.ceil(mine.armSeconds * 20), pulseIntervalTicks: 100, triggerRadius: mine.triggerRadius, knockback: mine.knockback, bleedStacks: mine.bleedStacks, bleedDuration: mine.bleedDuration });
          }
        }
        emitEvent('EQUIPMENT_EFFECT_PULSED', { playerId: player.id, roomId: player.roomId, ...intent });
      });
    });
  }

  function resolveSpecialRoomCommand(state, player, action, emitEvent, random) {
    const room = currentRoom(state, player?.roomId);
    const stream = random.scoped(`special:${state.floorNumber}:${room?.id}:${action.choiceId}`);
    const result = applySpecialRoomChoice(state, room, player, action.choiceId, stream);
    if (!result.ok) {
      emitEvent('GAME_COMMAND_REJECTED', { playerId: player.id, command: action.action, reason: result.reason });
      return false;
    }
    if (result.transitionToRoomId) {
      player.roomId = result.transitionToRoomId;
      player.x = Number(state.floorState?.width || 900) / 2;
      player.y = Number(state.floorState?.height || 700) / 2;
    }
    if (result.advanceFloor) advanceToNextFloor(state, emitEvent);
    emitEvent('SPECIAL_ROOM_CHOICE_APPLIED', {
      playerId: player.id,
      roomId: room.id,
      roomType: room.type,
      choiceId: action.choiceId,
      ...result,
    });
    return true;
  }

  function resolveAcquisitionCommand(state, player, action, emitEvent, random) {
    const nextScrollSerial = Math.max(0, Math.floor(Number(player?.scrollUseSerial || 0))) + 1;
    const selectedScope = [...(action.fromKeys || []), ...(action.picks || [])].join(',');
    const scrollRandom = action.action === 'SCROLL_APPLY'
      ? random.scoped(`scroll:${action.scrollKey}:use:${nextScrollSerial}:floor:${state.floorNumber}:choices:${selectedScope}`)
      : null;
    const result = applyAcquisitionCommand(player, action.action, action, {
      inShop: currentRoom(state, player.roomId)?.type === 'shop',
      floorNumber: state.floorNumber,
      random: scrollRandom ? () => scrollRandom.next() : undefined,
    });
    if (!result.ok) {
      emitEvent('GAME_COMMAND_REJECTED', { playerId: player.id, command: action.action, reason: result.reason });
      return false;
    }
    // syncCampaignItemStats operates on a complete authority state. Passing a
    // single player silently iterates no players, leaving newly acquired
    // defensive items inert until the run ends.
    syncCampaignItemStats(state, { currentTick: state.tick, lowerCombatCurse: !!state.matchRules?.lowerCombatCurse });
    emitEvent('ACQUISITION_APPLIED', { playerId: player.id, ...result });
    return true;
  }

  function nearestLivingPlayer(state, enemy) {
    let nearest = null;
    let nearestDistance = Infinity;
    Object.values(state.players || {}).forEach(player => {
      if (!player || player.disconnected || player.downed || player.roomId !== enemy.roomId) return;
      const distance = Math.hypot(Number(player.x) - enemy.x, Number(player.y) - enemy.y);
      if (distance < nearestDistance) {
        nearest = player;
        nearestDistance = distance;
      }
    });
    return { player: nearest, distance: nearestDistance };
  }

  function angleDifference(first, second) {
    return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
  }

  function defeatEnemy(state, enemy, playerId, emitEvent, options = {}) {
    if (enemy.dead) return;
    // The god cheats death once: instead of dying it revives at 90% HP with 3x
    // damage and enters phase 2 (Divine Rebirth), exactly like onEnemyDie. The
    // shared updateGod body drives phases 3-5 from there.
    if (enemy.type === 'god' && !enemy.rebirthUsed && !options.forceDeath) {
      enemy.rebirthUsed = true;
      enemy.health = Math.max(1, Math.round(Number(enemy.maxHealth || 1) * 0.9));
      enemy.hp = enemy.health;
      enemy.contactDamage = Math.round(Number(enemy.contactDamage || 40) * 3);
      enemy.dmg = enemy.contactDamage;
      enemy.moveSpeed = Number(enemy.moveSpeed || 108) * 1.18;
      enemy.speed = enemy.moveSpeed;
      enemy.phase = 2;
      enemy.windup = 0;
      enemy.beamTime = 0;
      enemy.dashTime = 0;
      enemy.state = 'godPhase2';
      enemy.invulnerableUntilTick = state.tick + Math.round(1.5 * 20);
      enemy.stunnedUntilTick = 0;
      emitEvent('ENEMY_SPOKE', { enemyId: enemy.id, roomId: enemy.roomId, text: 'DIVINE REBIRTH' });
      emitEvent('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'god_rebirth' });
      return;
    }
    // The Cult Queen cheats death once too, into her finisher windup (the
    // updateCultQueenBoss body root-holds her and detonates). If she hasn't yet
    // entered it via the HP threshold, start it here.
    if (enemy.type === 'queen_cult' && !enemy.queenFinisherDone && !enemy.queenFinisherActive && !options.forceDeath) {
      enemy.queenFinisherActive = true;
      enemy.queenFinisherTimer = 1.6;
      enemy.health = 1;
      enemy.hp = 1;
      emitEvent('ENEMY_SPOKE', { enemyId: enemy.id, roomId: enemy.roomId, text: 'Then burn with me!' });
      return;
    }
    // Rivals have an extra life: the first kill sends them back to hunt the
    // party on a later floor and arms their curse; the second kill is final.
    let rivalReward = null;
    if (enemy.type === 'rival' && enemy.rivalRumbleStage == null) {
      const entry = getRosterEntry(state, enemy.rivalCharacterKey);
      queuePartyRivalCurse(state, enemy.rivalCharacterKey, { descended: false });
      if (entry && Number(entry.lives || 2) > 1) {
        entry.lives = Number(entry.lives || 2) - 1;
        entry.dead = false;
        entry.returnFloor = Math.min(MAX_FLOOR, Number(state.floorNumber || 1) + 1);
        entry.pendingSpawn = false;
        entry.relationship = Number(entry.relationship || 0) - 5;
        emitEvent('RIVAL_DOWNED', { characterKey: enemy.rivalCharacterKey, returnFloor: entry.returnFloor, final: false });
      } else if (entry) {
        entry.dead = true;
        entry.lives = 0;
        entry.relationship = Number(entry.relationship || 0) - 5;
        emitEvent('RIVAL_DOWNED', { characterKey: enemy.rivalCharacterKey, final: true });
      }
      rivalReward = resolveCampaignRivalKillReward({
        floorNumber: state.floorNumber,
        finalDeath: !!entry?.dead,
        stolenLootCount: Array.isArray(entry?.loot) ? entry.loot.length : Array.isArray(enemy.rivalLoot) ? enemy.rivalLoot.length : 0,
        rivalBounty: !!state.matchRules?.rivalBounty,
      });
    }
    enemy.dead = true;
    enemy.state = 'dead';
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.deathTick = state.tick;
    emitEvent('ENEMY_DEFEATED', { enemyId: enemy.id, playerId, roomId: enemy.roomId });
    const bulkSplitPlan = options.forceDeath ? [] : createCampaignBulkGolemSplitPlan(enemy, {
      elite: authorityCanSpawnCampaignElite(state),
    });
    bulkSplitPlan.forEach(childPlan => {
      const child = spawnAuthorityMinion(state, enemy, childPlan.type, childPlan.x, childPlan.y, {
        elite: childPlan.elite, healthScale: childPlan.healthMultiplier,
      }, emitEvent);
      child.spawnedFromBulk = childPlan.spawnedFromBulk;
      child.contactDamage = Math.round(Number(child.contactDamage || 0) * childPlan.damageMultiplier);
      child.projectileDamage = Math.round(Number(child.projectileDamage || 0) * childPlan.damageMultiplier);
      emitEvent('BULK_GOLEM_SPLIT', { enemyId: enemy.id, childEnemyId: child.id, roomId: enemy.roomId });
    });
    if (enemy.bountyTarget && !options.forceDeath) resolveBountyTargetKill(state, enemy, playerId, emitEvent);
    const player = state.players?.[playerId];
    if (player) {
      player.kills = Math.max(0, Number(player.kills || 0)) + 1;
      if (enemy.type === 'rival') player.rivalReputation = Math.max(0, Number(player.rivalReputation || 0)) + 1;
      const sargesHammerResult = resolveCampaignSargesHammerDoubleKill(player, {
        tutorialDummy: !!enemy.tutorialDummy, currentTime: state.tick / 20,
      });
      if (sargesHammerResult.triggered) {
        const hammer = planCampaignSargesHammerDoubleKill({ baseDamage: getNetworkCampaignRawMeleeDamage(player) });
        const angle = Math.atan2(Number(enemy.y || player.y) - Number(player.y), Number(enemy.x || player.x) - Number(player.x));
        const projectile = createPlayerProjectile(state, player, {
          kind: hammer.kind, attackKind: 'sarges_hammer_double_kill', damage: hammer.damage,
          speed: hammer.speed, radius: hammer.radius, lifeTicks: Math.ceil(hammer.lifeSeconds * 20),
          knockback: hammer.knockback, pierce: hammer.pierce, homing: hammer.homing,
          homingTarget: hammer.homingTarget, homingRadius: hammer.homingRadius,
          homingSpeed: hammer.homingSpeed, homingAccel: hammer.homingAccel,
          homingTurnRate: hammer.homingTurnRate, returning: hammer.returning,
        }, angle);
        emitEvent('SARGES_HAMMER_DOUBLE_KILL', { playerId: player.id, enemyId: enemy.id, projectileId: projectile.id, roomId: enemy.roomId });
      }
      if (!player.moggysCoatPrimed && Number(player.items?.moggys_coat || 0) > 0 && isPlayerConcealed(state, player)) {
        player.moggysCoatPrimed = true;
        emitEvent('MOGGYS_COAT_PRIMED', { playerId: player.id, roomId: enemy.roomId });
      }
      // Rich Man's Blues pays its loop crystals on every real boss kill. The
      // campaign writes this to account meta; multiplayer keeps the same
      // spendable balance on the authoritative player wallet until the account
      // service performs its explicit merge.
      const bluesStacks = Math.max(0, Number(player.items?.rich_mans_blues || 0));
      const canonicalBoss = !!getEnemyDefinition(enemy.type)?.boss;
      const practiceMode = (state.gameMode || state.matchRules?.gameMode || state.matchRules?.mode) === 'practice';
      if (bluesStacks > 0 && canonicalBoss && !enemy.tutorialDummy && !practiceMode) {
        player.loopCrystals = Math.max(0, Number(player.loopCrystals || 0)) + bluesStacks;
        player.runCrystalsEarned = Math.max(0, Number(player.runCrystalsEarned || 0)) + bluesStacks;
        emitEvent('LOOP_CRYSTALS_AWARDED', {
          playerId: player.id, enemyId: enemy.id, roomId: enemy.roomId,
          itemKey: 'rich_mans_blues', amount: bluesStacks, loopCrystals: player.loopCrystals,
        });
      }
      const randomService = combatRandomByState.get(state);
      const killEffects = applyCampaignKillCharge(player, {
        itemStats: player.itemStats,
        difficulty: state.matchRules?.difficultyKey || 'medium',
        overcharged: !!state.matchRules?.overcharged,
        currentTick: state.tick,
        tickRate: 20,
        random: randomService ? () => randomService.next('encounter') : () => 0.5,
      });
      killEffects.intents.forEach(intent => emitEvent('ITEM_KILL_EFFECT', { playerId, enemyId: enemy.id, ...intent }));
      const areaEffects = resolveCampaignKillAreaEffects(enemy, player, {
        itemStats: player.itemStats,
        deathBleedStacks: getCampaignStatusStacks(enemy, 'bleed'),
        random: randomService ? () => randomService.next('encounter') : () => 0.5,
      });
      const room = currentRoom(state, enemy.roomId);
      areaEffects.forEach(intent => {
        if (intent.kind === 'bleed_splash') {
          livingEncounterEnemies(state, enemy.roomId).forEach(target => {
            if (target.id === enemy.id || Math.hypot(target.x - intent.x, target.y - intent.y) > intent.radius + Number(target.radius || 20)) return;
            applyAuthorityStatus(state, target, 'bleed', intent.stacks, intent.duration, player.id);
          });
        } else if (intent.kind === 'grave_zone' && room) {
          room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
          room.hazards.push({ kind: 'grave_zone', ...intent, ttl: intent.duration, enemy: true, ownerId: player.id, source: 'grave_zone' });
        }
        emitEvent('ITEM_KILL_EFFECT', { playerId, enemyId: enemy.id, ...intent });
      });
    }
    awardEncounterExperience(state, enemy, playerId, emitEvent);
    spawnEnemyDrops(state, enemy, player, emitEvent, options);
    if (rivalReward) spawnAuthorityRivalKillRewards(state, enemy, playerId, rivalReward, emitEvent);
    // Campaign force-resolves the God Council when the god's real life ends.
    // Their ordinary rewards still resolve, but their own death-interception
    // phases (rebirth, queen finisher, Bulk Golem split) must not prolong the
    // encounter or create a second boss wave.
    if (enemy.type === 'god' && !options.forceDeath && currentRoom(state, enemy.roomId)?.type === 'god') {
      Object.values(state.enemies || {}).forEach(other => {
        if (other.id === enemy.id || other.dead || other.roomId !== enemy.roomId || !getEnemyDefinition(other.type)?.boss) return;
        other.health = 0;
        other.hp = 0;
        other.rebirthUsed = true;
        other.queenFinisherDone = true;
        other.queenFinisherActive = false;
        other.splitReady = false;
        defeatEnemy(state, other, playerId, emitEvent, { forceDeath: true, suppressRoomClear: true });
      });
      spawnAuthorityGodEndgameChoices(state, enemy.roomId, emitEvent);
    }
    if (!options.suppressRoomClear) markEncounterCleared(state, enemy.roomId, emitEvent);
  }

  function awardEncounterExperience(state, enemy, playerId, emitEvent) {
    const baseAmount = getCampaignEnemyExperienceReward({
      ...enemy,
      // Campaign rewards classify bosses by canonical enemy type. Rivals carry
      // a `boss` presentation/combat flag but still receive normal kill XP.
      boss: !!getEnemyDefinition(enemy.type)?.boss,
    });
    if (baseAmount <= 0) return;
    const recipients = activePlayers(state).filter(player => !player.downed && player.roomId === enemy.roomId);
    recipients.forEach(player => {
      const amount = Math.max(1, Math.round(baseAmount * Math.max(0, Number(player.itemStats?.xpGainMultiplier || 1))));
      player.xp = Math.max(0, Number(player.xp || 0)) + amount;
      player.level = Math.max(1, Number(player.level || 1));
      player.xpToNext = Math.max(1, Number(player.xpToNext || 20));
      while (player.xp >= player.xpToNext) {
        player.xp -= player.xpToNext;
        applyCampaignLevelUp(player);
        emitEvent('PLAYER_LEVELED', { playerId: player.id, level: player.level, maxHealth: player.maxHp });
      }
      emitEvent('XP_AWARDED', { playerId: player.id, sourcePlayerId: playerId, amount, xp: player.xp, level: player.level });
    });
    const stats = state.runStats || (state.runStats = { killsByPlayer: {}, playerKills: {}, deathsByPlayer: {} });
    stats.killsByPlayer = stats.killsByPlayer || {};
    stats.killsByPlayer[playerId] = Number(stats.killsByPlayer[playerId] || 0) + 1;
    const killer = state.players?.[playerId];
    if (killer) killer.kills = Number(killer.kills || 0) + 1;
  }

  // Campaign has one hero, while multiplayer awards encounter progress to the
  // eligible party. Keep that explicit boundary adapter, but use the campaign
  // rival-specific payout and blue-relic roll for every other outcome.
  function spawnAuthorityRivalKillRewards(state, enemy, playerId, reward, emitEvent) {
    const randomService = combatRandomByState.get(state);
    const stream = randomService?.scoped?.(`rival:reward:${state.floorNumber}:${enemy.roomId}:${enemy.id}`);
    const nextRandom = stream ? () => stream.next() : authorityFallbackRandom;
    const coinAmount = Math.max(0, Number(reward?.coins || 0));
    if (coinAmount > 0) {
      const plan = createCampaignCoinDropPlan(enemy.x, enemy.y, coinAmount, {
        gameMode: state.matchRules?.gameMode || state.matchRules?.mode,
        coinRewardMultiplier: state.matchRules?.difficulty?.coinRewardMultiplier,
        random: nextRandom,
      });
      plan.forEach(descriptor => {
        const pickupId = state.allocateEntityId('pickup');
        state.pickups[pickupId] = {
          id: pickupId, ...descriptor, roomId: enemy.roomId, radius: 13,
          amount: descriptor.value, spawnTick: state.tick, source: 'rival_reward',
        };
        emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: 'coin', enemyId: enemy.id, source: 'rival_reward' });
      });
    }
    if (reward?.finalRelic) {
      const key = rollCampaignFinalRivalRelic(ITEM_DEFS, nextRandom);
      if (key) {
        const pickupId = state.allocateEntityId('pickup');
        state.pickups[pickupId] = {
          id: pickupId, type: 'item', key, source: 'rival_final', roomId: enemy.roomId,
          x: enemy.x, y: enemy.y - 8, radius: 13, amount: 1, spawnTick: state.tick,
        };
        emitEvent('RIVAL_FINAL_RELIC_SPAWNED', { playerId, enemyId: enemy.id, pickupId, itemKey: key, roomId: enemy.roomId });
      }
    }
    const baseExperience = Math.max(0, Number(reward?.experience || 0));
    if (baseExperience <= 0) return;
    activePlayers(state).filter(candidate => !candidate.downed && candidate.roomId === enemy.roomId).forEach(candidate => {
      const amount = Math.max(1, Math.round(baseExperience * Math.max(0, Number(candidate.itemStats?.xpGainMultiplier || 1))));
      candidate.xp = Math.max(0, Number(candidate.xp || 0)) + amount;
      candidate.level = Math.max(1, Number(candidate.level || 1));
      candidate.xpToNext = Math.max(1, Number(candidate.xpToNext || 20));
      while (candidate.xp >= candidate.xpToNext) {
        candidate.xp -= candidate.xpToNext;
        applyCampaignLevelUp(candidate);
        emitEvent('PLAYER_LEVELED', { playerId: candidate.id, level: candidate.level, maxHealth: candidate.maxHp });
      }
      emitEvent('XP_AWARDED', {
        playerId: candidate.id, sourcePlayerId: playerId, enemyId: enemy.id,
        source: 'rival_reward', amount, xp: candidate.xp, level: candidate.level,
      });
    });
  }

  function playerDamage(state, playerId, amount) {
    const attacker = state.players?.[playerId];
    const itemStats = attacker?.itemStats || {};
    return Math.max(0, Number(amount || 0))
      * Math.max(0.1, Number(attacker?.damageMultiplier || 1))
      * Math.max(0, Number(itemStats.kronosDamageMultiplier || 1))
      * Math.max(0, Number(itemStats.levelEdgeDamageMultiplier || 1));
  }

  function damageEnemy(state, enemy, damage, playerId, emitEvent, details = {}) {
    if (!enemy || enemy.dead) return false;
    // Befriended rivals are fully invulnerable (they fight for the party).
    if (enemy.rivalFriend) return false;
    // Boss invulnerability windows (god phase-shift/rebirth reposition) shrug off
    // damage entirely unless the caller forces it (the finisher self-kill does).
    if (!details.ignoreInv && state.tick < Number(enemy.invulnerableUntilTick || 0)) {
      emitEvent('ENEMY_HIT', { enemyId: enemy.id, playerId, damage: 0, absorbed: 0, health: enemy.health, blocked: true });
      return false;
    }
    const sparkleMultiplier = state.tick < Number(enemy.critSparkleUntilTick || 0) ? 2 : 1;
    const attacker = state.players?.[playerId];
    const loopNumber = Math.max(1, Math.floor((Math.max(1, Number(state.floorNumber || 1)) - 1) / MAX_FLOOR) + 1);
    let incoming = details.preScaled ? Math.max(0, Math.round(Number(damage || 0))) : scaleCampaignDamage({
      damage,
      raw: !!details.rawDamage,
      enemy,
      itemStats: attacker?.itemStats,
      attackPower: attacker?.attackPower,
      attackerDamageMultiplier: Math.max(0.1, Number(attacker?.damageMultiplier || 1)),
      isBoss: !!getEnemyDefinition(enemy.type)?.boss || !!enemy.miniBoss,
      hasBleed: getCampaignStatusStacks(enemy, 'bleed') > 0,
      applyBleedBonus: details.applyBleedBonus,
      glassCannon: !!state.matchRules?.glassCannon,
      loopNumber,
      enemyLoopDamageReduction: state.matchRules?.enemyLoopDamageReduction,
    });
    if (details.lightning) {
      const copperPennyStacks = Math.max(0, Number(attacker?.items?.copper_penny || 0));
      if (copperPennyStacks > 0) incoming = Math.max(1, Math.round(incoming * (1 + copperPennyStacks * 0.2)));
    }
    const randomService = combatRandomByState.get(state);
    const capeActive = Number(attacker?.equipmentEffectsUntilTick?.el_bartos_cape || 0) > Number(state.tick || 0);
    const canCrit = details.canCrit !== false;
    const crit = resolveCampaignCrit({
      itemStats: canCrit ? attacker?.itemStats : {},
      critBonus: details.critBonus,
      forced: canCrit && (sparkleMultiplier > 1 || (!!attacker?.elBartoAmbushReady && capeActive)),
      random: canCrit && randomService ? () => randomService.next('encounter') : () => 1,
    });
    if (crit.isCrit) incoming = Math.round(incoming * crit.critMultiplier);
    if (canCrit && attacker?.elBartoAmbushReady && capeActive) attacker.elBartoAmbushReady = false;
    // God-mode attackers hit harder for the duration of their window.
    if (attacker && godModeActive(state, attacker) && !details.ignoreGodMode) incoming = Math.round(incoming * 1.4);
    // Rivals shrug off a flat 20% of every hit (they're tougher than a normal
    // enemy of the same stats); the god takes 5% off the top like the campaign.
    if (enemy.type === 'rival') incoming = Math.max(1, Math.round(incoming * 0.8));
    else if (enemy.type === 'god') incoming = Math.max(1, Math.round(incoming * 0.95));
    const absorbed = Math.min(incoming, Math.max(0, Number(enemy.barrier || 0)));
    enemy.barrier = Math.max(0, Number(enemy.barrier || 0) - absorbed);
    const dealt = incoming - absorbed;
    enemy.health = Math.max(0, Number(enemy.health || 0) - dealt);
    enemy.hitTick = state.tick;
    // Campaign parity: a hit shield unit cannot re-shield for a moment.
    if (enemy.type === 'shield_unit') enemy._shieldHitLockout = 1.1;
    // Knockback + heavy-hit stun, mirroring hitEnemy in combat.js. Bosses and
    // elites resist crowd control (they're shoved less and stun-gate higher);
    // the impulse pushes the enemy away along the hit angle so the world's
    // physics carries the shove, then the client shakes on the ENEMY_HIT event.
    const knockback = Number(details.knockback || 0);
    if (knockback > 0 && Number.isFinite(Number(details.angle))) {
      const ccLevel = enemy.boss || enemy.type === 'god' ? 0.6 : enemy.elite ? 0.3 : 0;
      const resistFactor = 1 / (1 + ccLevel + Math.max(0, Number(enemy.stunResistance || 0)));
      const applied = knockback * resistFactor;
      applyCampaignImpulse(enemy, Number(details.angle), applied);
      enemy._lastHitAngle = Number(details.angle);
      // Heavy hits briefly stun: lost ≥40% max HP in one blow, or a big shove.
      const heavyHit = dealt >= Math.max(1, Number(enemy.maxHealth || 1)) * 0.4;
      const heavyKnockback = applied >= 260;
      if (heavyHit || heavyKnockback) {
        const stunTicks = Math.max(2, Math.round((heavyHit ? 0.32 : 0.18) * 20 * Math.max(0.28, 1 - ccLevel * 0.4)));
        enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + stunTicks);
      }
    }
    emitEvent('ENEMY_HIT', {
      enemyId: enemy.id,
      playerId,
      damage: dealt,
      absorbed,
      health: enemy.health,
      attackKind: details.attackKind,
      projectileId: details.projectileId,
      strike: details.strike,
      crit: crit.isCrit,
      // Impact weight drives the client's screenshake/hitstop on this hit.
      knockback: knockback > 0 ? knockback : undefined,
    });
    if (enemy.health <= 0) defeatEnemy(state, enemy, playerId, emitEvent);
    return true;
  }

  function getAuthorityStatusResistance(state, target, key) {
    const general = Number(target?.statusResistance || 0);
    const keyed = Number(target?.statusResistances?.[key] || 0);
    const ramped = getCampaignGenericStatusResistance(key, {
      statusResistScale: Number(state.matchRules?.statusResistScale || 0),
      elapsedSeconds: Number(state.tick || 0) / 20,
    });
    return Math.max(0, Math.min(0.95, Math.max(general, keyed, ramped)));
  }

  function applyAuthorityStatus(state, target, key, stacks, duration, ownerId, options = {}) {
    if (!target || target.dead || target.downed) return null;
    if (target.id && state.players?.[target.id]
      && Number(state.tick || 0) < Number(target.potionBathStatusResistUntilTick || 0)) return null;
    return applyCampaignStatus(target, key, stacks, duration, {
      resistance: options.resistance ?? getAuthorityStatusResistance(state, target, key),
      severity: options.severity ?? 1,
      playerColdBudget: !!options.playerColdBudget,
      ownerId,
      damageMultiplier: options.damageMultiplier,
    });
  }

  function applyFireStatus(state, enemy, stacks, duration, playerId) {
    const owner = state.players?.[playerId];
    const durationMultiplier = Math.max(1, Number(owner?.itemStats?.statusDurationMultiplier || 1))
      * (owner?.characterKey === 'metao' ? 1.15 : 1);
    return applyAuthorityStatus(state, enemy, 'fire', stacks, Number(duration || 0) * durationMultiplier, playerId);
  }

  function applyPoisonStatus(state, enemy, stacks, duration, playerId) {
    const owner = state.players?.[playerId];
    const durationMultiplier = Math.max(1, Number(owner?.itemStats?.statusDurationMultiplier || 1))
      * (owner?.characterKey === 'metao' ? 1.15 : 1);
    return applyAuthorityStatus(state, enemy, 'poison', stacks, Number(duration || 0) * durationMultiplier, playerId);
  }

  function applyAuthorityOnHitStatusProcs(state, enemy, player, hitOptions, random) {
    if (!enemy || enemy.dead || !player) return [];
    const statuses = ensureCampaignStatuses(enemy);
    const activeStatusCount = Object.values(statuses).filter(status => Number(status?.stacks || 0) > 0).length;
    const procs = resolveCampaignOnHitStatusProcs({
      itemStats: player.itemStats,
      hitOptions,
      activeStatusCount,
      copperPennyStacks: Number(player.items?.copper_penny || 0),
      targetSlowStacks: getCampaignStatusStacks(enemy, 'slow'),
      canBlind: enemy.type !== 'god' && !getEnemyDefinition(enemy.type)?.boss,
      random: typeof random === 'function' ? random : () => random?.next?.('encounter') ?? 1,
    });
    procs.forEach(proc => {
      if (proc.kind === 'status') {
        const durationMultiplier = proc.key === 'slow'
          ? 1
          : Math.max(1, Number(player.itemStats?.statusDurationMultiplier || 1))
            * (['fire', 'poison'].includes(proc.key) && player.characterKey === 'metao' ? 1.15 : 1);
        applyAuthorityStatus(state, enemy, proc.key, proc.stacks, Number(proc.duration || 0) * durationMultiplier, player.id, {
          damageMultiplier: proc.damageMultiplier,
        });
        return;
      }
      if (proc.kind === 'blind') {
        enemy.confusedBlindUntilTick = Math.max(
          Number(enemy.confusedBlindUntilTick || 0),
          Number(state.tick || 0) + Math.ceil(Math.max(0, Number(proc.seconds || 0)) * 20),
        );
        return;
      }
      const seconds = Math.max(0, Number(proc.seconds || 0));
      enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), Number(state.tick || 0) + Math.ceil(seconds * 20));
      if (proc.kind === 'freeze') {
        applyAuthorityStatus(state, enemy, 'slow', proc.slowStacks, proc.slowDuration, player.id);
      }
    });
    return procs;
  }

  function targetsInArc(state, player, angle, range, arc) {
    return livingEncounterEnemies(state, player.roomId)
      .map(enemy => ({
        enemy,
        distance: Math.hypot(enemy.x - player.x, enemy.y - player.y),
        angle: Math.atan2(enemy.y - player.y, enemy.x - player.x),
      }))
      .filter(candidate => candidate.distance <= range + Number(candidate.enemy.radius || 20)
        && angleDifference(candidate.angle, angle) <= arc)
      .sort((first, second) => first.distance - second.distance);
  }

  function rivalPlayers(state, player) {
    if (!state.matchRules?.friendlyFire) return [];
    return activePlayers(state).filter(candidate => candidate.id !== player.id
      && !candidate.downed && candidate.roomId === player.roomId);
  }

  function rivalTargetsInArc(state, player, angle, range, arc) {
    return rivalPlayers(state, player).filter(candidate => {
      const distance = Math.hypot(candidate.x - player.x, candidate.y - player.y);
      const targetAngle = Math.atan2(candidate.y - player.y, candidate.x - player.x);
      return distance <= range + Number(candidate.radius || 18) && angleDifference(targetAngle, angle) <= arc;
    });
  }

  function createPlayerProjectile(state, player, definition, angle) {
    const projectileId = state.allocateEntityId('projectile');
    const muzzleDistance = Number.isFinite(Number(definition.spawnDistance))
      ? Number(definition.spawnDistance)
      : Number(player.radius || 18) + 13;
    const randomService = combatRandomByState.get(state);
    const lifeTicks = Number(definition.lifeTicks || PROJECTILE_LIFETIME_TICKS);
    const projectile = {
      id: projectileId,
      type: definition.projectileKind || definition.kind,
      kind: definition.projectileKind || definition.kind,
      ownerId: player.id,
      hostile: false,
      roomId: definition.roomId || player.roomId,
      x: Number.isFinite(Number(definition.originX)) ? Number(definition.originX) : Number(player.x) + Math.cos(angle) * muzzleDistance,
      y: Number.isFinite(Number(definition.originY)) ? Number(definition.originY) : Number(player.y) + Math.sin(angle) * muzzleDistance,
      vx: Math.cos(angle) * Number(definition.speed ?? PROJECTILE_SPEED),
      vy: Math.sin(angle) * Number(definition.speed ?? PROJECTILE_SPEED),
      radius: Number(definition.radius || 8),
      damage: Number(definition.damage || PROJECTILE_DAMAGE),
      knockback: Math.max(0, Number(definition.knockback || 0)),
      // colour is derived client-side from `kind` (see NetworkGameView cosmetics)
      attackKind: definition.attackKind || definition.weaponKey || definition.kind,
      remainingPierces: Math.max(0, Number(definition.pierce || 0)),
      hitEnemyIds: [],
      spawnTick: state.tick,
      lifeTicks,
      splash: Number(definition.splash || 0),
      splashDamage: Number(definition.splashDamage || 0),
      aoeRadius: Number(definition.aoeRadius || 0),
      sparkleChance: Math.max(0, Math.min(1, Number(definition.sparkleChance || 0))),
      ghostBall: !!definition.ghostBall,
      ghostBallEffect: definition.ghostBallEffect || null,
      contactCooldownUntilTick: definition.contactCooldownUntilTick || {},
      targetX: Number.isFinite(Number(definition.targetX)) ? Number(definition.targetX) : null,
      targetY: Number.isFinite(Number(definition.targetY)) ? Number(definition.targetY) : null,
      fireStacks: Number(definition.fireStacks || 0),
      splashFireStacks: Number(definition.splashFireStacks || 0),
      fireDuration: Number(definition.fireDuration || 0),
      hitOptions: definition.hitOptions ? { ...definition.hitOptions } : null,
      homing: !!definition.homing,
      homingTarget: definition.homingTarget || null,
      homingTargetId: definition.homingTargetId || null,
      ignoreGodMode: !!definition.ignoreGodMode,
      homingSpeed: Number(definition.homingSpeed || definition.speed || PROJECTILE_SPEED),
      homingAccel: Number(definition.homingAccel || 0),
      homingTurnRate: Number(definition.homingTurnRate || 0),
      homingRadius: Number(definition.homingRadius || 0),
      returning: !!definition.returning,
      returnPhase: definition.returning ? 'out' : '',
      lightning: !!definition.lightning,
      bouncesRemaining: Math.max(0, Math.floor(Number(definition.bouncesRemaining || 0))),
      subSpawn: definition.subSpawn ? {
        ...definition.subSpawn,
        nextSpawnTick: state.tick + Math.max(1, Number(definition.subSpawn.intervalSeconds || 0.2) * 20),
      } : null,
    };
    configureCampaignProjectile(projectile, {
      enemy: false,
      itemStats: player.itemStats,
      random: randomService ? () => randomService.next('encounter') : () => 0.5,
      hasExplicitHoming: Object.prototype.hasOwnProperty.call(definition, 'homing'),
      hasExplicitBounces: Object.prototype.hasOwnProperty.call(definition, 'bouncesRemaining'),
    });
    projectile.expiresTick = state.tick + Math.ceil(Number(projectile.lifeTicks || lifeTicks));
    state.projectiles[projectileId] = projectile;
    return projectile;
  }

  function createConfiguredWeaponProjectile(state, player, definition, angle, random) {
    const config = buildCampaignWeaponProjectileConfig(definition.weaponKey, {
      angle,
      damage: definition.damage,
      knockback: definition.knockback,
      speed: definition.speed,
      r: definition.r,
      life: definition.life,
      projectileType: definition.projectileType,
      kind: definition.projectileKind,
      pierceCount: definition.pierceCount,
      hitOptions: definition.hitOptions,
      recoil: definition.recoil,
    });
    if (!config) return null;
    const shot = planCampaignConfiguredWeaponShot({
      weaponKey: definition.weaponKey, aimDirection: angle, velocityX: player.vx, velocityY: player.vy,
      random: () => random?.next?.('encounter') ?? 0.5,
    });
    const projectile = createPlayerProjectile(state, player, {
      ...definition,
      projectileKind: config.kind,
      speed: config.speed,
      radius: config.r,
      pierce: config.pierceCount,
      hitOptions: config.hitOptions,
      knockback: config.knockback,
      lifeTicks: Math.ceil(config.life * 20),
    }, shot.angle);
    if (config.recoil > 0) {
      const recoil = config.recoil * Number(shot.recoilMultiplier || 1);
      player.vx = Number(player.vx || 0) - Math.cos(shot.angle) * recoil;
      player.vy = Number(player.vy || 0) - Math.sin(shot.angle) * recoil;
    }
    return projectile;
  }

  function projectileTrajectory(projectile) {
    return {
      id: projectile.id,
      kind: projectile.kind,
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      radius: projectile.radius,
      spawnTick: projectile.spawnTick,
      expiresTick: projectile.expiresTick,
    };
  }

  function spawnCampaignGroundSmashRocks(state, player, smash) {
    return (smash.projectileDescriptors || []).map(rock => createPlayerProjectile(state, player, {
      kind: 'rock',
      attackKind: smash.moveKey,
      damage: rock.damage,
      speed: rock.speed,
      radius: rock.radius,
      lifeTicks: Math.round(rock.lifeSeconds * 20),
      pierce: rock.pierce,
      knockback: rock.knockback,
      hitOptions: rock.hitOptions,
      spawnDistance: rock.spawnDistance,
    }, rock.angle));
  }

  function createAbilityEntity(state, player, definition = {}) {
    state.abilityEntities = state.abilityEntities || {};
    const entityId = state.allocateEntityId('ability');
    const entity = {
      id: entityId,
      ownerId: player.id,
      roomId: player.roomId,
      x: Number(definition.x ?? player.x),
      y: Number(definition.y ?? player.y),
      radius: Math.max(1, Number(definition.radius || 32)),
      r: Math.max(1, Number(definition.radius || 32)),
      kind: String(definition.kind || definition.abilityId || definition.presentationKey || 'ability'),
      // `presentationKey` was the old checkpoint field. The source ability is
      // gameplay identity; visual presentation is derived locally by clients.
      abilityId: String(definition.abilityId || definition.presentationKey || definition.kind || 'ability'),
      damage: Math.max(0, Number(definition.damage || 0)),
      rawDamage: !!definition.rawDamage,
      triggerRadius: Math.max(0, Number(definition.triggerRadius || 0)),
      knockback: Math.max(0, Number(definition.knockback || 0)),
      bleedStacks: Math.max(0, Number(definition.bleedStacks || 0)),
      bleedDuration: Math.max(0, Number(definition.bleedDuration || 0)),
      heal: Math.max(0, Number(definition.heal || 0)),
      range: Math.max(0, Number(definition.range || 0)),
      burstRadius: Math.max(0, Number(definition.burstRadius || definition.radius || 0)),
      followOwner: !!definition.followOwner,
      spawnTick: state.tick,
      nextPulseTick: state.tick + Math.max(0, Number(definition.firstPulseDelayTicks || 0)),
      pulseIntervalTicks: Math.max(1, Number(definition.pulseIntervalTicks || 10)),
      pulseIndex: 0,
      nextStatusTick: Number(definition.nextStatusTick ?? state.tick),
      statusIntervalTicks: Math.max(1, Number(definition.statusIntervalTicks || 1)),
      emitPulseEvent: definition.emitPulseEvent !== false,
      isMetao: !!definition.isMetao,
      poisonDurationSeconds: Number(definition.poisonDurationSeconds || 0),
      fireDurationSeconds: Number(definition.fireDurationSeconds || 0),
      angle: Number(definition.angle || 0),
      swinging: Math.max(0, Number(definition.swinging || 0)),
      swingCooldownUntilTick: Math.max(0, Number(definition.swingCooldownUntilTick || 0)),
      swingsLeft: Math.max(0, Math.trunc(Number(definition.swingsLeft || 0))),
      contactCooldownUntilTick: definition.contactCooldownUntilTick || {},
      pendingSwing: !!definition.pendingSwing,
      life: Math.max(0, Number(definition.life || 0)),
      titanEffect: definition.titanEffect || null,
      justiceEffect: definition.justiceEffect || null,
      fanOffset: Number(definition.fanOffset || 0),
      aim: Number(definition.aim ?? definition.angle ?? 0),
      swingPhase: Number(definition.swingPhase || 0),
      phase: String(definition.phase || ''),
      spin: Number(definition.spin || 0),
      delayUntilTick: Math.max(0, Number(definition.delayUntilTick || 0)),
      impactTick: Math.max(0, Number(definition.impactTick || 0)),
      hoverUntilTick: Math.max(0, Number(definition.hoverUntilTick || 0)),
      fadeUntilTick: Math.max(0, Number(definition.fadeUntilTick || 0)),
      expiresTick: state.tick + Math.max(1, Number(definition.durationTicks || 20)),
    };
    state.abilityEntities[entityId] = entity;
    return entity;
  }

  function spawnPersistentMoveEntities(state, player, moveKey, stats, angle, options = {}) {
    const spawned = [];
    if (moveKey === 'healing_zone') {
      spawned.push(createAbilityEntity(state, player, {
        kind: 'healing_zone', abilityId: moveKey, radius: stats.range || 130,
        damage: stats.damage || 12, heal: 4, durationTicks: Math.round(Number(stats.duration || 3) * 20),
        pulseIntervalTicks: 10,
      }));
    } else if (moveKey === 'fire_circle') {
      const circle = resolveCampaignFireCircle({
        aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
        aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
      });
      spawned.push(createAbilityEntity(state, player, {
        kind: 'fire_circle', abilityId: moveKey, radius: circle.radius,
        damage: circle.damagePerSecond * circle.pulseIntervalSeconds, durationTicks: Math.round(circle.durationSeconds * 20),
        pulseIntervalTicks: Math.round(circle.pulseIntervalSeconds * 20), followOwner: true,
      }));
    } else if (moveKey === 'floor_lava') {
      // Floor Is Lava has no immediate aura. updateFloorLavaEffects creates
      // the campaign's stationary trail puddles as the hero moves.
    } else if (moveKey === 'chaos_burst') {
      const chaos = resolveCampaignChaosBurst({
        aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
        aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
      });
      spawned.push(createAbilityEntity(state, player, {
        kind: 'chaos_burst', abilityId: moveKey, radius: chaos.fieldRadius,
        burstRadius: chaos.burstRadius, damage: chaos.burstDamage,
        durationTicks: Math.round(chaos.durationSeconds * 20), pulseIntervalTicks: chaos.intervalSeconds * 20,
        followOwner: true, isMetao: player.characterKey === 'metao',
        poisonDurationSeconds: chaos.poisonDurationSeconds, fireDurationSeconds: chaos.fireDurationSeconds,
      }));
    } else if (moveKey === 'holy_turrets') {
      const turrets = planCampaignHolyTurrets({
        originX: player.x, originY: player.y, angle,
        wall: state.floorState?.wallThickness, roomWidth: state.floorState?.width, roomHeight: state.floorState?.height,
        aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier, aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
      });
      turrets.forEach(turret => {
        spawned.push(createAbilityEntity(state, player, {
          kind: 'holy_turret', abilityId: moveKey,
          x: turret.x, y: turret.y, radius: turret.radius, range: turret.range, burstRadius: turret.burstRadius,
          damage: turret.damage, durationTicks: Math.round(turret.durationSeconds * 20),
          pulseIntervalTicks: Math.round(turret.intervalSeconds * 20),
        }));
      });
    } else if (moveKey === 'lightning_columns') {
      const columns = planCampaignLightningColumns({
        originX: player.x, originY: player.y,
        targetX: Number.isFinite(Number(options.targetX)) ? Number(options.targetX) : player.x,
        targetY: Number.isFinite(Number(options.targetY)) ? Number(options.targetY) : player.y,
        angle, aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
      });
      columns.forEach(column => {
        spawned.push(createAbilityEntity(state, player, {
          kind: 'lightning_column', abilityId: moveKey,
          x: column.x, y: column.y, radius: column.radius, damage: column.damage,
          durationTicks: Math.round(column.durationSeconds * 20), pulseIntervalTicks: Math.round(column.intervalSeconds * 20),
        }));
      });
    }
    return spawned;
  }

  function updateAbilityEntities(state, emitEvent, random, inputs = {}, fixedDelta = 1 / 20) {
    Object.entries(state.abilityEntities || {}).forEach(([entityId, entity]) => {
      if (state.tick >= Number(entity.expiresTick || 0)) {
        delete state.abilityEntities[entityId];
        emitEvent('ABILITY_ENTITY_REMOVED', { entityId, roomId: entity.roomId, reason: 'expired' });
        return;
      }
      const owner = state.players?.[entity.ownerId];
      if (!owner || owner.disconnected || owner.roomId !== entity.roomId) {
        delete state.abilityEntities[entityId];
        return;
      }
      if (entity.followOwner) {
        entity.x = Number(owner.x);
        entity.y = Number(owner.y);
      }
      if (entity.kind === 'excalibur_strike') {
        if (state.tick < Number(entity.impactTick || 0)) {
          entity.phase = 'falling';
        } else if (state.tick < Number(entity.hoverUntilTick || 0)) {
          entity.phase = 'hover';
          entity.angle = Number(entity.angle || 0) + Number(entity.spin || 0) * fixedDelta;
        } else {
          entity.phase = 'fade';
        }
      }
      if (entity.kind === 'blade_justice') {
        const effect = entity.justiceEffect || planCampaignBladeJustice({ aimDirection: entity.aim });
        const inputAim = Number(inputs?.[owner.id]?.aimDirection);
        const aimDirection = Number.isFinite(inputAim) ? inputAim : Number(owner.aimDirection || entity.aim || 0);
        const step = advanceCampaignBladeJustice(entity, {
          effect, delta: fixedDelta, aimDirection, playerX: owner.x, playerY: owner.y,
        });
        if (!step.active) {
          delete state.abilityEntities[entityId];
          emitEvent('ABILITY_ENTITY_REMOVED', { entityId, roomId: entity.roomId, reason: 'expired' });
          return;
        }
        const contacts = entity.contactCooldownUntilTick || (entity.contactCooldownUntilTick = {});
        abilityTargetsInRadius(state, owner, entity.x, entity.y, entity.radius).forEach(enemy => {
          if (state.tick < Number(contacts[enemy.id] || 0)) return;
          damageEnemy(state, enemy, entity.damage, owner.id, emitEvent, {
            attackKind: 'blade_justice',
            angle: Math.atan2(enemy.y - owner.y, enemy.x - owner.x), knockback: effect.knockback,
          });
          contacts[enemy.id] = state.tick + Math.max(1, Math.ceil(effect.contactCooldownSeconds * 20));
        });
        const room = currentRoom(state, entity.roomId);
        (room?.destructibles || []).forEach(prop => {
          if (prop.broken || prop.hidden) return;
          const key = `prop:${prop.id || `${prop.x}:${prop.y}`}`;
          if (state.tick < Number(contacts[key] || 0)) return;
          if (Math.hypot(prop.x - entity.x, prop.y - entity.y) > Number(entity.radius || 0) + Number(prop.r || 12)) return;
          contacts[key] = state.tick + Math.max(1, Math.ceil(effect.destructibleCooldownSeconds * 20));
          damageNetworkDestructible(state, entity.roomId, prop, effect.destructibleDamage, emitEvent, random, {
            playerId: owner.id, attackKind: 'blade_justice',
          });
        });
        return;
      }
      if (entity.kind === 'titan_hammer') {
        const effect = entity.titanEffect || resolveCampaignTitanHammer({ cooldownSeconds: (Number(entity.expiresTick || state.tick) - state.tick) / 20 });
        const inputAim = Number(inputs?.[owner.id]?.aimDirection);
        const aimDirection = Number.isFinite(inputAim) ? inputAim : Number(owner.aimDirection || entity.angle || 0);
        entity.life = Number(entity.life || Math.max(0, (Number(entity.expiresTick || state.tick) - state.tick) / 20));
        advanceCampaignTitanHammer(entity, {
          effect, delta: fixedDelta, playerX: owner.x, playerY: owner.y, aimDirection,
        });
        if (entity.pendingSwing) {
          entity.pendingSwing = false;
          if (state.tick >= Number(entity.swingCooldownUntilTick || 0) && Number(entity.swingsLeft || 0) > 0) {
            entity.swingCooldownUntilTick = state.tick + Math.max(1, Math.ceil(effect.swingCooldownSeconds * 20));
            entity.swinging = 1;
            entity.swingsLeft = Math.max(0, Number(entity.swingsLeft || 0) - 1);
            const targetIds = [];
            abilityTargetsInRadius(state, owner, entity.x, entity.y, entity.radius).forEach(enemy => {
              const hitAngle = Math.atan2(enemy.y - entity.y, enemy.x - entity.x);
              damageEnemy(state, enemy, entity.damage, owner.id, emitEvent, {
                attackKind: 'titan_hammer', angle: hitAngle, knockback: effect.slamKnockback,
              });
              if (!enemy.dead) enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + Math.ceil(effect.stunSeconds * 20));
              targetIds.push(enemy.id);
            });
            rivalPlayers(state, owner).forEach(target => {
              const dx = target.x - entity.x;
              const dy = target.y - entity.y;
              if (dx * dx + dy * dy > (Number(entity.radius || 0) + Number(target.radius || 18)) ** 2) return;
              damagePlayer(state, target, playerDamage(state, owner.id, entity.damage), owner.id, emitEvent, 'titan_hammer', {
                angle: Math.atan2(dy, dx), knockback: effect.pvpKnockback,
              });
              targetIds.push(target.id);
            });
            const room = currentRoom(state, entity.roomId);
            (room?.destructibles || []).forEach(prop => {
              if (prop.broken || prop.hidden) return;
              if (Math.hypot(prop.x - entity.x, prop.y - entity.y) > Number(entity.radius || 0) + Number(prop.r || 12)) return;
              damageNetworkDestructible(state, entity.roomId, prop, effect.destructibleDamage, emitEvent, random, {
                playerId: owner.id, attackKind: 'titan_hammer',
              });
            });
            emitEvent('ABILITY_ENTITY_PULSED', {
              entityId, playerId: owner.id, roomId: entity.roomId, abilityId: 'titan_hammer',
              kind: 'slam', x: entity.x, y: entity.y, radius: entity.radius, targetIds,
            });
          }
        }
        const contactRadius = Number(entity.radius || 0) * effect.contactRadiusMultiplier;
        const contacts = entity.contactCooldownUntilTick || (entity.contactCooldownUntilTick = {});
        abilityTargetsInRadius(state, owner, entity.x, entity.y, contactRadius).forEach(enemy => {
          if (state.tick < Number(contacts[enemy.id] || 0)) return;
          const hitAngle = Math.atan2(enemy.y - entity.y, enemy.x - entity.x);
          damageEnemy(state, enemy, effect.contactDamage, owner.id, emitEvent, {
            attackKind: 'titan_hammer', angle: hitAngle, knockback: effect.contactKnockback,
          });
          contacts[enemy.id] = state.tick + Math.max(1, Math.ceil(effect.contactCooldownSeconds * 20));
        });
        return;
      }
      if (entity.kind === 'thorn_mine') {
        if (state.tick < Number(entity.nextPulseTick || 0)) return;
        const trigger = livingEncounterEnemies(state, entity.roomId)
          .filter(enemy => Math.hypot(enemy.x - entity.x, enemy.y - entity.y) <= Number(entity.triggerRadius || 34) + Number(enemy.radius || 20))
          .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
        if (!trigger) return;
        const targetIds = [];
        abilityTargetsInRadius(state, owner, entity.x, entity.y, entity.radius).forEach(enemy => {
          const hitAngle = Math.atan2(enemy.y - entity.y, enemy.x - entity.x);
          damageEnemy(state, enemy, entity.damage, owner.id, emitEvent, {
            attackKind: entity.abilityId, angle: hitAngle, knockback: entity.knockback,
          });
          if (!enemy.dead) applyAuthorityStatus(state, enemy, 'bleed', entity.bleedStacks, entity.bleedDuration, owner.id);
          targetIds.push(enemy.id);
        });
        delete state.abilityEntities[entityId];
        emitEvent('ABILITY_ENTITY_PULSED', { entityId, playerId: owner.id, roomId: entity.roomId, abilityId: entity.abilityId, kind: 'thorn_mine', x: entity.x, y: entity.y, radius: entity.radius, targetIds });
        return;
      }
      if (state.tick < Number(entity.nextPulseTick || 0)) return;
      entity.nextPulseTick = state.tick + Math.max(1, Number(entity.pulseIntervalTicks || 10));
      entity.pulseIndex = Number(entity.pulseIndex || 0) + 1;
      let pulseX = Number(entity.x);
      let pulseY = Number(entity.y);
      let pulseRadius = Number(entity.burstRadius || entity.radius || 32);
      if (entity.kind === 'chaos_burst') {
        const stream = random.scoped(`${entity.id}|pulse:${entity.pulseIndex}`);
        const pulseAngle = stream.next() * Math.PI * 2;
        const distance = 30 + stream.next() * Math.max(0, Number(entity.radius || 100) - 30);
        pulseX += Math.cos(pulseAngle) * distance;
        pulseY += Math.sin(pulseAngle) * distance;
        pulseRadius = Number(entity.burstRadius || 52);
      } else if (entity.kind === 'holy_turret') {
        const target = livingEncounterEnemies(state, entity.roomId)
          .map(enemy => ({ enemy, distance: Math.hypot(enemy.x - entity.x, enemy.y - entity.y) }))
          .filter(candidate => candidate.distance <= Number(entity.range || 360))
          .sort((first, second) => first.distance - second.distance)[0]?.enemy;
        if (!target) return;
        pulseX = Number(target.x);
        pulseY = Number(target.y);
      }
      const targetIds = [];
      // Accept legacy checkpoints while all newly created entities use the
      // gameplay-named `abilityId` field.
      const abilityId = entity.abilityId || entity.presentationKey;
      abilityTargetsInRadius(state, owner, pulseX, pulseY, pulseRadius).forEach(enemy => {
        damageEnemy(state, enemy, entity.damage, owner.id, emitEvent, {
          attackKind: abilityId,
          knockback: Number(entity.knockback || 0),
          // Campaign Healing Zone is authored as steady environmental damage,
          // not a weapon strike: no player damage scaling or crit rolls.
          ...(['healing_zone', 'fire_circle', 'lava'].includes(entity.kind) ? { preScaled: true, canCrit: false } : {}),
          ...(entity.rawDamage ? { rawDamage: true } : {}),
          ...(entity.kind === 'excalibur_strike' ? { ignoreGodMode: true } : {}),
        });
        if (!enemy.dead && abilityId === 'fire_circle') applyFireStatus(state, enemy, 1, 2.8, owner.id);
        if (!enemy.dead && abilityId === 'floor_lava' && state.tick >= Number(entity.nextStatusTick || 0)) {
          applyAuthorityStatus(state, enemy, 'fire', 1, Number(entity.fireDurationSeconds || 2.8), owner.id);
        }
        if (!enemy.dead && abilityId === 'chaos_burst') {
          applyPoisonStatus(state, enemy, 1, Number(entity.poisonDurationSeconds || 4.8), owner.id);
          if (entity.isMetao) applyFireStatus(state, enemy, 1, Number(entity.fireDurationSeconds || 3.5), owner.id);
        }
        targetIds.push(enemy.id);
      });
      if (entity.kind !== 'lava') damageRivalsInRadius(state, owner, pulseX, pulseY, pulseRadius, entity.damage, emitEvent, abilityId, targetIds);
      if (entity.kind === 'healing_zone') {
        const healTarget = livingRoomPlayers(state, entity.roomId)
          .map(player => ({ player, distance: Math.hypot(player.x - pulseX, player.y - pulseY) }))
          .filter(candidate => candidate.distance < pulseRadius)
          .sort((first, second) => first.distance - second.distance)[0]?.player;
        if (healTarget) {
          healTarget.hp = Math.min(Number(healTarget.maxHp || 100), Number(healTarget.hp || 0) + Number(entity.heal || 0));
        }
      }
      if (entity.kind === 'lava' && state.tick >= Number(entity.nextStatusTick || 0)) {
        entity.nextStatusTick = state.tick + Math.max(1, Number(entity.statusIntervalTicks || 1));
      }
      if (entity.emitPulseEvent) {
        emitEvent('ABILITY_ENTITY_PULSED', {
          entityId, playerId: owner.id, roomId: entity.roomId,
          abilityId, x: pulseX, y: pulseY,
          radius: pulseRadius, targetIds,
        });
      }
    });
  }

  function playerHasFloorLavaImmunity(state, player) {
    return Number(state?.tick || 0) < Number(player?.floorLavaUntilTick || 0);
  }

  function updateFloorLavaEffects(state) {
    Object.values(state.players || {}).forEach(player => {
      if (!player || player.downed || player.disconnected || !player.floorLavaUntilTick) return;
      if (state.tick >= Number(player.floorLavaUntilTick || 0)) return;
      if (state.tick < Number(player.floorLavaTrailNextTick || 0)) return;
      const lava = resolveCampaignFloorLava({
        aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
        aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
      });
      createAbilityEntity(state, player, {
        kind: 'lava', abilityId: 'floor_lava', radius: lava.puddleRadius,
        damage: lava.damagePerSecond * lava.pulseIntervalSeconds,
        durationTicks: Math.round(lava.puddleDurationSeconds * 20),
        pulseIntervalTicks: Math.max(1, Math.round(lava.pulseIntervalSeconds * 20)),
        statusIntervalTicks: Math.max(1, Math.round(lava.statusIntervalSeconds * 20)),
        fireDurationSeconds: lava.fireDurationSeconds,
        emitPulseEvent: false,
      });
      // Keep the 0.22-second authored cadence without rounding every puddle to
      // the same 20 Hz tick interval (which would drift over the full walk).
      player.floorLavaTrailNextTick = Number(player.floorLavaTrailNextTick || state.tick)
        + lava.trailIntervalSeconds * 20;
    });
  }

  // Mirrors the campaign's damageDestructible outcome chain (world.js): chip
  // toward broken, then pot loot, barrel blast, and hidden-prop reveal. The
  // visual FX are event-driven on the client from the emitted events.
  function damageNetworkDestructible(state, roomId, destructible, damage, emitEvent, random, context = {}) {
    const room = currentRoom(state, roomId);
    const loot = random?.stream?.('loot');
    const green = random?.scoped?.(`green:${state.floorNumber}:${roomId}:${destructible?.x},${destructible?.y}`);
    const result = applyCampaignDestructibleDamage(destructible, damage, {
      floorNumber: state.floorNumber,
      runLoopIndex: state.floorState?.runLoopIndex || 0,
      destructibles: room?.destructibles,
      itemChance: Math.min(0.5, 0.12 + Number(context.itemDropChanceBonus || 0)),
      greenRandom: green ? () => green.next() : () => 1,
      potRandom: loot ? () => loot.next() : () => 1,
      rollItem: stream => rollCampaignItem(stream),
    });
    if (!result.ok) return false;
    emitEvent(result.broken ? 'DESTRUCTIBLE_BROKEN' : 'DESTRUCTIBLE_HIT', {
      roomId,
      obstacleKind: destructible.kind,
      x: destructible.x,
      y: destructible.y,
      health: destructible.hp,
      reinforced: !!destructible.reinforced,
      ...context,
    });
    if (!result.broken) return true;
    result.drops.forEach(drop => {
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = { id: pickupId, ...drop, roomId, x: destructible.x, y: destructible.y, radius: 13, amount: drop.amount || 1, spawnTick: state.tick };
      emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: state.pickups[pickupId].type });
    });
    if (result.blast) {
      livingEncounterEnemies(state, roomId).forEach(enemy => {
        if (Math.hypot(enemy.x - destructible.x, enemy.y - destructible.y) > 130 + Number(enemy.radius || 20)) return;
        damageEnemy(state, enemy, 55, context.playerId || null, emitEvent, { attackKind: 'barrel_blast' });
      });
      (room?.destructibles || []).forEach(other => {
        if (other === destructible || other.broken || other.hidden) return;
        if (Math.hypot(other.x - destructible.x, other.y - destructible.y) > 130 + Number(other.r || 24)) return;
        damageNetworkDestructible(state, roomId, other, 55, emitEvent, random, context);
      });
    }
    if (result.secretDirection && room?.secretPassages?.[result.secretDirection]) room.secretPassages[result.secretDirection].open = true;
    return true;
  }

  function chipDestructiblesInArc(state, player, angle, range, arc, emitEvent, random) {
    const room = currentRoom(state, player.roomId);
    (room?.destructibles || []).forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const propRadius = Number(prop.r || 24);
      const distance = Math.hypot(prop.x - player.x, prop.y - player.y);
      // The campaign gives pots extra reach/arc forgiveness so swings connect.
      const pot = prop.kind === 'pot';
      if (distance > range + propRadius + (pot ? 24 : 8)) return;
      const touching = distance <= Number(player.radius || 18) + propRadius + (pot ? 32 : 18);
      const difference = angleDifference(Math.atan2(prop.y - player.y, prop.x - player.x), angle);
      if (!touching && difference > arc + (pot ? 0.45 : 0.25)) return;
      damageNetworkDestructible(state, player.roomId, prop, 1, emitEvent, random, { playerId: player.id });
    });
  }

  function chipDestructiblesInRadius(state, player, x, y, radius, damage, emitEvent, random) {
    const room = currentRoom(state, player.roomId);
    (room?.destructibles || []).forEach(prop => {
      if (prop.broken || prop.hidden) return;
      if (Math.hypot(prop.x - x, prop.y - y) > radius + Number(prop.r || 24)) return;
      damageNetworkDestructible(state, player.roomId, prop, damage, emitEvent, random, { playerId: player.id });
    });
  }

  function chipDestructiblesAlongBeam(state, player, angle, range, width, emitEvent, random) {
    const room = currentRoom(state, player.roomId);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    (room?.destructibles || []).forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const ox = prop.x - player.x;
      const oy = prop.y - player.y;
      const forward = ox * dx + oy * dy;
      const perpendicular = Math.abs(ox * -dy + oy * dx);
      if (forward < 0 || forward > range || perpendicular > width + Number(prop.r || 24)) return;
      damageNetworkDestructible(state, player.roomId, prop, 1, emitEvent, random, { playerId: player.id });
    });
  }

  function campaignBeamReflectRects(state, room) {
    const width = Number(state.floorState?.width || 900);
    const height = Number(state.floorState?.height || 700);
    const wall = Number(state.floorState?.wallThickness || 28);
    const door = Number(state.floorState?.doorWidth || 140);
    const halfWidth = (width - door) / 2;
    const halfHeight = (height - door) / 2;
    const rects = [
      { x: 0, y: 0, w: halfWidth, h: wall },
      { x: width - halfWidth, y: 0, w: halfWidth, h: wall },
      { x: 0, y: height - wall, w: halfWidth, h: wall },
      { x: width - halfWidth, y: height - wall, w: halfWidth, h: wall },
      { x: 0, y: 0, w: wall, h: halfHeight },
      { x: 0, y: height - halfHeight, w: wall, h: halfHeight },
      { x: width - wall, y: 0, w: wall, h: halfHeight },
      { x: width - wall, y: height - halfHeight, w: wall, h: halfHeight },
    ];
    const locked = isNetworkRoomLocked(state, room?.id);
    const hasExit = direction => !!room?.doors?.[direction] || !!room?.secretPassages?.[direction]?.open;
    const doorX = (width - door) / 2;
    const doorY = (height - door) / 2;
    if (locked || !hasExit('n')) rects.push({ x: doorX, y: 0, w: door, h: wall });
    if (locked || !hasExit('s')) rects.push({ x: doorX, y: height - wall, w: door, h: wall });
    if (locked || !hasExit('w')) rects.push({ x: 0, y: doorY, w: wall, h: door });
    if (locked || !hasExit('e')) rects.push({ x: width - wall, y: doorY, w: wall, h: door });
    (room?.structures || []).forEach(structure => {
      if (!structure || !Number.isFinite(Number(structure.x)) || !Number.isFinite(Number(structure.y))) return;
      const widthValue = Math.max(0, Number(structure.w || 0));
      const heightValue = Math.max(0, Number(structure.h || 0));
      if (!widthValue || !heightValue) return;
      if (structure.kind === 'pillar') {
        const footprintHeight = Math.max(6, heightValue * 0.28);
        rects.push({ x: Number(structure.x) - widthValue / 2, y: Number(structure.y) + heightValue / 2 - footprintHeight, w: widthValue, h: footprintHeight });
      } else {
        rects.push({ x: Number(structure.x) - widthValue / 2, y: Number(structure.y) - heightValue / 2, w: widthValue, h: heightValue });
      }
    });
    (room?.destructibles || []).forEach(prop => {
      if (prop?.broken || prop?.hidden || !['cover_wall', 'wall', 'secret_wall'].includes(prop?.kind)) return;
      rects.push(obstacleRect(prop));
    });
    return rects;
  }

  function resolveCampaignLazerGlassesTick(state, player, input, emitEvent, random) {
    const channel = player.weaponBeamChannel;
    if (!channel || state.tick > Number(channel.untilTick || 0)) {
      delete player.weaponBeamChannel;
      return;
    }
    if (state.tick + 0.0001 < Number(channel.nextTick || state.tick)) return;
    const liveAim = Number(input?.aimDirection);
    const baseAngle = Number.isFinite(liveAim) ? liveAim : Number(player.aimDirection || channel.angle || 0);
    player.aimDirection = baseAngle;
    channel.angle = baseAngle;
    channel.nextTick = Number(channel.nextTick || state.tick) + Number(channel.tickIntervalTicks || 1.6);
    const glasses = resolveCampaignLazerGlasses({
      beamDamageMultiplier: player.itemStats?.beamDamageMultiplier,
      beamChainTargets: player.itemStats?.beamChainTargets,
      beamChainDamageMultiplier: player.itemStats?.beamChainDamageMultiplier,
    });
    const room = currentRoom(state, player.roomId);
    const rects = campaignBeamReflectRects(state, room);
    const targetIds = [];
    const segments = [];
    for (const offset of glasses.offsets) {
      const path = buildCampaignRicochetBeamPath({
        originX: player.x, originY: player.y, angle: baseAngle + offset,
        range: glasses.range, maxBounces: glasses.bounces, rects,
      });
      path.forEach(segment => segments.push({ ...segment }));
      let target = null;
      let hitSegment = null;
      for (const enemy of livingEncounterEnemies(state, player.roomId)) {
        const padding = glasses.propPadding * Math.max(0, Number(player.itemStats?.beamWidthMultiplier || 1));
        hitSegment = campaignBeamPathHitsCircle(path, enemy.x, enemy.y, Number(enemy.radius || 20) + padding);
        if (hitSegment) { target = enemy; break; }
      }
      if (target) {
        const hitAngle = Number(hitSegment?.angle ?? baseAngle + offset);
        damageEnemy(state, target, glasses.damage, player.id, emitEvent, {
          attackKind: 'lazer_glasses', angle: hitAngle, knockback: glasses.knockback,
        });
        if (!target.dead) applyAuthorityOnHitStatusProcs(state, target, player, glasses.hitOptions, random);
        targetIds.push(target.id);
        const visited = new Set([target]);
        let source = target;
        for (let index = 0; index < glasses.chainTargets; index += 1) {
          const chained = livingEncounterEnemies(state, player.roomId)
            .filter(enemy => !visited.has(enemy) && Math.hypot(enemy.x - source.x, enemy.y - source.y) < glasses.chainRange)
            .sort((first, second) => Math.hypot(first.x - source.x, first.y - source.y) - Math.hypot(second.x - source.x, second.y - source.y))[0];
          if (!chained) break;
          visited.add(chained);
          const chainDamage = Math.max(1, Math.round(glasses.damage * glasses.chainDamageMultiplier));
          damageEnemy(state, chained, chainDamage, player.id, emitEvent, {
            attackKind: 'lazer_glasses', angle: Math.atan2(chained.y - source.y, chained.x - source.x), knockback: glasses.chainKnockback,
          });
          if (!chained.dead) applyAuthorityOnHitStatusProcs(state, chained, player, { beamFx: true }, random);
          targetIds.push(chained.id);
          source = chained;
        }
      }
      (room?.destructibles || []).forEach(prop => {
        if (prop?.broken || prop?.hidden || !campaignBeamPathHitsRect(path, obstacleRect(prop), glasses.propPadding)) return;
        damageNetworkDestructible(state, player.roomId, prop, glasses.propDamage, emitEvent, random, { playerId: player.id, attackKind: 'lazer_glasses' });
      });
    }
    emitEvent('PLAYER_WEAPON_BEAM_TICK', {
      playerId: player.id, roomId: player.roomId, weaponKey: 'lazer_glasses',
      aimDirection: baseAngle, originX: Number(player.x), originY: Number(player.y), targetIds, segments,
    });
    if (state.tick >= Number(channel.untilTick || 0)) delete player.weaponBeamChannel;
  }

  function applyAuthorityCampaignBeamChain(state, player, primaryEnemy, baseDamage, emitEvent, random, attackKind, targetIds) {
    const chains = Math.max(0, Number(player.itemStats?.beamChainTargets || 0));
    if (!chains || !primaryEnemy) return;
    const damageMultiplier = Math.max(0, Number(player.itemStats?.beamChainDamageMultiplier || 0.6));
    const visited = new Set([primaryEnemy]);
    let source = primaryEnemy;
    for (let index = 0; index < chains; index += 1) {
      const chained = livingEncounterEnemies(state, player.roomId)
        .filter(enemy => !visited.has(enemy) && Math.hypot(enemy.x - source.x, enemy.y - source.y) < 145)
        .sort((first, second) => Math.hypot(first.x - source.x, first.y - source.y) - Math.hypot(second.x - source.x, second.y - source.y))[0];
      if (!chained) break;
      visited.add(chained);
      const chainDamage = Math.max(1, Math.round(baseDamage * damageMultiplier));
      damageEnemy(state, chained, chainDamage, player.id, emitEvent, {
        attackKind, angle: Math.atan2(chained.y - source.y, chained.x - source.x), knockback: 55,
      });
      if (!chained.dead) applyAuthorityOnHitStatusProcs(state, chained, player, { beamFx: true }, random);
      targetIds.push(chained.id);
      source = chained;
    }
  }

  function resolveSweep(state, player, definition, angle, emitEvent, random, strike = 0, validationState = null) {
    // Co-op action validation can use a short authority-recorded transform
    // sample. Only eligibility reads this view; every damage/world mutation is
    // still applied to current authoritative entities below.
    const validationPlayer = validationState?.players?.[player.id]
      ? { ...player, ...validationState.players[player.id] } : player;
    const validationWorld = validationState ? {
      ...state,
      players: Object.fromEntries(Object.entries(state.players || {}).map(([id, entity]) => [id,
        validationState.players?.[id] ? { ...entity, ...validationState.players[id] } : entity,
      ])),
      enemies: Object.fromEntries(Object.entries(state.enemies || {}).map(([id, entity]) => [id,
        validationState.enemies?.[id] ? { ...entity, ...validationState.enemies[id] } : entity,
      ])),
    } : state;
    const targets = targetsInArc(validationWorld, validationPlayer, angle, Number(definition.range || 120), Number(definition.arc || 1.04));
    const sweepKnockback = Number(definition.knockback || 140);
    targets.forEach(candidate => {
      const enemy = state.enemies?.[candidate.enemy.id];
      if (!enemy || enemy.dead || enemy.roomId !== player.roomId) return;
      damageEnemy(state, enemy, definition.damage, player.id, emitEvent, {
        attackKind: definition.weaponKey,
        strike,
        angle: Math.atan2(candidate.enemy.y - validationPlayer.y, candidate.enemy.x - validationPlayer.x),
        knockback: sweepKnockback,
        rawDamage: !!definition.rawDamage,
      });
      if (!enemy.dead) applyAuthorityOnHitStatusProcs(state, enemy, player, {
        ...definition,
        itemBleedChance: Number(player.itemStats?.bleedChance || 0),
      }, random);
    });
    // PvP never passes validationState; its target check remains current-tick.
    const rivals = rivalTargetsInArc(validationWorld, validationPlayer, angle, Number(definition.range || 120), Number(definition.arc || 1.04));
    rivals.forEach(target => {
      const actualTarget = state.players?.[target.id];
      if (actualTarget) damagePlayer(state, actualTarget, playerDamage(state, player.id, definition.damage), player.id, emitEvent, definition.weaponKey);
    });
    chipDestructiblesInArc(state, player, angle, Number(definition.range || 120), Number(definition.arc || 1.04), emitEvent, random);
    return [...targets.map(candidate => candidate.enemy.id), ...rivals.map(candidate => candidate.id)];
  }

  function resolveSmite(state, player, definition, angle, emitEvent, random) {
    const smite = resolveCampaignSmite({
      godMode: godModeActive(state, player), beamDamageMultiplier: player.itemStats?.beamDamageMultiplier,
    });
    const targetIds = [];
    targetsInArc(state, player, angle, smite.stab.range, smite.stab.arc).forEach(candidate => {
      const enemy = candidate.enemy;
      damageEnemy(state, enemy, smite.stab.damage, player.id, emitEvent, {
        attackKind: definition.weaponKey, angle: candidate.angle, knockback: smite.stab.knockback, lightning: true,
      });
      if (!enemy.dead) applyAuthorityOnHitStatusProcs(state, enemy, player, smite.stab.hitOptions, random);
      targetIds.push(enemy.id);
    });
    const room = currentRoom(state, player.roomId);
    (room?.destructibles || []).forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const distance = Math.hypot(prop.x - player.x, prop.y - player.y);
      const propAngle = Math.atan2(prop.y - player.y, prop.x - player.x);
      if (distance > smite.stab.range + Number(prop.r || 16) || angleDifference(propAngle, angle) > smite.stab.arc) return;
      damageNetworkDestructible(state, player.roomId, prop, smite.stab.destructibleDamage, emitEvent, random, { playerId: player.id, attackKind: definition.weaponKey });
    });
    const blade = createPlayerProjectile(state, player, {
      weaponKey: definition.weaponKey,
      projectileKind: smite.blade.kind,
      attackKind: definition.weaponKey,
      speed: smite.blade.speed,
      radius: smite.blade.radius,
      damage: smite.blade.damage,
      color: definition.color || PROJECTILE_TYPE_DEFS[definition.projectileType]?.color,
      pierce: smite.blade.pierce,
      lifeTicks: Math.ceil(smite.blade.lifeSeconds * 20),
      knockback: smite.blade.knockback, hitOptions: smite.blade.hitOptions,
      lightning: true, spawnDistance: smite.blade.spawnDistance,
    }, angle);
    const used = new Set();
    let origin = { x: player.x, y: player.y };
    const segments = [];
    for (let jump = 0; jump < smite.chain.count; jump += 1) {
      const maximum = jump === 0 ? smite.chain.range : smite.chain.jumpRange;
      const candidates = [
        ...livingEncounterEnemies(state, player.roomId).map(enemy => ({ type: 'enemy', entity: enemy })),
        ...(room?.destructibles || []).filter(prop => !prop.broken && !prop.hidden).map(prop => ({ type: 'prop', entity: prop })),
      ].filter(candidate => !used.has(candidate.entity) && Math.hypot(candidate.entity.x - origin.x, candidate.entity.y - origin.y) < maximum)
        .sort((first, second) => Math.hypot(first.entity.x - origin.x, first.entity.y - origin.y) - Math.hypot(second.entity.x - origin.x, second.entity.y - origin.y));
      const next = candidates[0];
      if (!next) break;
      const target = next.entity;
      used.add(target);
      const damage = smite.chain.baseDamage + jump * smite.chain.stepDamage;
      segments.push({ fromX: origin.x, fromY: origin.y, toX: target.x, toY: target.y });
      if (next.type === 'enemy') {
        targetIds.push(target.id);
        damageEnemy(state, target, damage, player.id, emitEvent, {
          attackKind: definition.weaponKey, strike: jump,
          angle: Math.atan2(target.y - origin.y, target.x - origin.x), knockback: smite.chain.knockback, lightning: true,
        });
        if (!target.dead) applyAuthorityOnHitStatusProcs(state, target, player, smite.chain.hitOptions, random);
      } else {
        damageNetworkDestructible(state, player.roomId, target, Math.max(2, Math.round(damage / 10)), emitEvent, random, { playerId: player.id, attackKind: definition.weaponKey });
      }
      origin = target;
    }
    return { targetIds: [...new Set(targetIds)], projectileIds: [blade.id], segments };
  }

  function resolveMooggySwipeAttack(state, player, angle, chargeRatio, emitEvent, random, action = {}) {
    const base = MOVE_BASE_STATS.mooggy_swipe || {};
    const stats = applyForgeStats(player, 'move', 'mooggy_swipe', base);
    const primary = getHeroPrimaryAttack(player.characterKey);
    const swipe = resolveCampaignMooggySwipe({
      chargeRatio,
      godMode: godModeActive(state, player),
      anvilDamage: Number(stats.damage || 0) - Number(base.damage || 44),
      anvilRange: Number(stats.range || 0) - Number(base.range || 130),
      baseKnockback: Number(primary.knockback || 140),
      itemBleedChance: player.itemStats?.bleedChance,
    });
    const targetIds = [];
    livingEncounterEnemies(state, player.roomId).forEach(enemy => {
      const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      const enemyAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      if (distance > swipe.range + Number(enemy.radius || 20) || angleDifference(enemyAngle, angle) > swipe.arc) return;
      damageEnemy(state, enemy, swipe.damage, player.id, emitEvent, {
        attackKind: 'mooggy_swipe', angle, knockback: swipe.knockback,
      });
      // Campaign supplies the swipe's bleed as a hit option to hitEnemy(),
      // which rolls it alongside every other on-hit status proc. Applying it
      // directly here made every successful multiplayer swipe bleed.
      if (!enemy.dead) applyAuthorityOnHitStatusProcs(state, enemy, player, {
        bleedChance: swipe.bleedChance,
        bleedStacks: swipe.bleedStacks,
        bleedDuration: swipe.bleedDurationSeconds,
      }, random);
      targetIds.push(enemy.id);
    });
    chipDestructiblesInArc(state, player, angle, swipe.range, swipe.arc + swipe.propArcBonus, emitEvent, random);
    player.action = 'attack';
    player.actionTick = state.tick;
    player.actionKind = 'mooggy_swipe';
    player.actionMode = 'charged_sweep';
    player.aimDirection = angle;
    emitEvent('PLAYER_ATTACKED', {
      playerId: player.id, roomId: player.roomId, characterKey: player.characterKey,
      ...(action.predictionId ? { predictionId: action.predictionId } : {}),
      attackMode: 'charged_sweep', attackKind: 'mooggy_swipe', weaponKey: 'mooggy_swipe',
      aimDirection: angle, originX: Number(player.x), originY: Number(player.y),
      range: swipe.range, arc: swipe.arc, targetIds, chargeRatio: swipe.chargeRatio,
    });
    return { definition: swipe, targetIds };
  }

  function resolvePlayerAttack(state, player, action, emitEvent, random) {
    if (state.tick < Number(player.attackCooldownUntilTick || 0) || player.downed) return null;
    const angle = Number(action.aimDirection);
    if (!Number.isFinite(angle)) return null;
    if (!player.equippedWeapon && player.equippedMoves?.melee === 'mooggy_swipe') {
      const base = MOVE_BASE_STATS.mooggy_swipe || {};
      const stats = applyForgeStats(player, 'move', 'mooggy_swipe', base);
      const cooldownTicks = Math.max(1, Math.ceil(Number(stats.cooldown || 0.5) * 20 / getNetworkCampaignAttackSpeed(state, player)));
      return beginHeldCharge(state, player, 'mooggy_swipe', 'melee', angle, cooldownTicks, emitEvent, action);
    }
    const unarmedMeleeMove = !player.equippedWeapon ? player.equippedMoves?.melee : '';
    const authoredDefinition = unarmedMeleeMove === 'narwal_fight'
      ? { weaponKey: 'narwal_fight', mode: 'sweep_projectile', ...(MOVE_BASE_STATS.narwal_fight || {}) }
      : unarmedMeleeMove === 'fire_balls'
        ? { weaponKey: 'fire_balls', mode: 'fireball_volley', ...(MOVE_BASE_STATS.fire_balls || {}) }
        : unarmedMeleeMove === 'smite'
          ? { weaponKey: 'smite', mode: 'smite', ...(MOVE_BASE_STATS.smite || {}) }
          : unarmedMeleeMove === 'slash'
            ? { weaponKey: 'slash', mode: 'campaign_slash', ...(MOVE_BASE_STATS.slash || {}) }
            : getCampaignWeaponAttack(player.equippedWeapon, player.characterKey);
    const usesMoveStats = !player.equippedWeapon && ['narwal_fight', 'fire_balls', 'smite', 'slash'].includes(authoredDefinition.weaponKey);
    const upgradedStats = applyForgeStats(player, usesMoveStats ? 'move' : 'weapon', authoredDefinition.weaponKey,
      usesMoveStats ? MOVE_BASE_STATS[authoredDefinition.weaponKey] : WEAPON_BASE_STATS[authoredDefinition.weaponKey]);
    const definition = {
      ...authoredDefinition,
      ...upgradedStats,
      cooldownTicks: Math.max(1, Math.ceil(Number(upgradedStats.cooldown || 0.5) * 20)),
    };
    const projectileIds = [];
    let targetIds = [];
    let segments = [];

    if (definition.mode === 'lazer_glasses') {
      const glasses = resolveCampaignLazerGlasses({
        beamDamageMultiplier: player.itemStats?.beamDamageMultiplier,
        beamChainTargets: player.itemStats?.beamChainTargets,
        beamChainDamageMultiplier: player.itemStats?.beamChainDamageMultiplier,
      });
      player.weaponBeamChannel = {
        untilTick: state.tick + glasses.durationSeconds * 20,
        nextTick: state.tick,
        tickIntervalTicks: glasses.tickIntervalSeconds * 20,
        angle,
      };
    } else if (definition.mode === 'sarges_hammer_weapon') {
      const hammer = resolveCampaignSargesHammerWeapon({
        damage: upgradedStats.damage, knockback: upgradedStats.knockback,
      });
      projectileIds.push(createPlayerProjectile(state, player, {
        kind: hammer.kind, attackKind: definition.weaponKey,
        damage: hammer.damage, speed: hammer.speed, radius: hammer.radius,
        lifeTicks: Math.ceil(hammer.lifeSeconds * 20), knockback: hammer.knockback,
        pierce: hammer.pierce, returning: hammer.returning, lightning: hammer.lightning,
      }, angle).id);
    } else if (definition.mode === 'divine_combo') {
      const base = WEAPON_BASE_STATS[definition.weaponKey] || {};
      const combo = planCampaignDivineWeaponCombo({
        weaponKey: definition.weaponKey,
        rawBaseDamage: getNetworkCampaignRawMeleeDamage(player),
        anvilDamage: Number(upgradedStats.damage || 0) - Number(base.damage || 0),
        range: Number(upgradedStats.range || base.range || 120),
        knockback: Number(upgradedStats.knockback || base.knockback || 0),
      });
      Object.assign(definition, {
        damage: combo.damage, range: combo.range, knockback: combo.knockback,
        arc: combo.arc, rawDamage: combo.rawDamage,
      });
      const [first, ...followups] = combo.strikes;
      targetIds = resolveSweep(state, player, definition, angle + Number(first?.angleOffset || 0), emitEvent, random, 0, action.validationState);
      if (followups.length) {
        player.pendingWeaponStrikes = followups.map((strike, index) => ({
          dueTick: state.tick + Math.max(1, Math.round(Number(strike.delaySeconds || 0) * 20)),
          angle: angle + Number(strike.angleOffset || 0), definition, strike: index + 1,
        }));
      }
    } else if (definition.mode === 'campaign_slash') {
      const base = MOVE_BASE_STATS.slash || {};
      const slash = resolveCampaignUnarmedSlash({
        godMode: godModeActive(state, player),
        anvilDamage: Number(upgradedStats.damage || 0) - Number(base.damage || 32),
        anvilRange: Number(upgradedStats.range || 0) - Number(base.range || 90),
        characterKey: player.characterKey,
        bleedTagCount: player.itemStats?.tagCounts?.bleed,
      });
      definition.damage = slash.damage;
      definition.range = slash.range;
      definition.arc = slash.arc;
      definition.knockback = slash.knockback;
      definition.bleedChance = slash.bleedChance;
      definition.bleedStacks = slash.bleedStacks;
      definition.bleedDuration = slash.bleedDurationSeconds;
      definition.itemBleedChance = Number(player.itemStats?.bleedChance || 0);
      targetIds = resolveSweep(state, player, definition, angle, emitEvent, random, 0, action.validationState);
    } else if (definition.mode === 'fireball_volley' || (definition.mode === 'volley' && definition.weaponKey === 'metao_fire_staff')) {
      const volley = planCampaignFireballVolley({
        aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
        aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
      });
      volley.projectiles.forEach(fireball => {
        projectileIds.push(createPlayerProjectile(state, player, {
          kind: fireball.kind, attackKind: definition.weaponKey,
          damage: fireball.damage, speed: fireball.speed, radius: fireball.radius,
          lifeTicks: Math.ceil(fireball.lifeSeconds * 20), splash: fireball.splash,
          splashDamage: fireball.splashDamage, blockedSplashDamage: fireball.blockedSplashDamage,
          fireStacks: fireball.fireStacks, splashFireStacks: fireball.splashFireStacks,
          fireDuration: fireball.fireDurationSeconds,
        }, angle + fireball.angleOffset).id);
      });
      player.vx = Number(player.vx || 0) - Math.cos(angle) * volley.recoil;
      player.vy = Number(player.vy || 0) - Math.sin(angle) * volley.recoil;
    } else if (definition.mode === 'sweep_projectile') {
      const narwal = resolveCampaignNarwalFight();
      definition.range = narwal.sweep.range;
      definition.arc = narwal.sweep.arc;
      targetIds = resolveSweep(state, player, {
        weaponKey: definition.weaponKey,
        damage: narwal.sweep.damage,
        range: narwal.sweep.range,
        arc: narwal.sweep.arc,
        knockback: narwal.sweep.knockback,
      }, angle, emitEvent, random, 0, action.validationState);
      const tusk = narwal.projectile;
      projectileIds.push(createPlayerProjectile(state, player, {
        kind: tusk.kind, attackKind: definition.weaponKey,
        damage: tusk.damage, speed: tusk.speed, radius: tusk.radius,
        lifeTicks: Math.ceil(tusk.lifeSeconds * 20), knockback: tusk.knockback,
        pierce: tusk.pierce, hitOptions: tusk.hitOptions, spawnDistance: tusk.spawnDistance,
      }, angle).id);
    } else if (definition.mode === 'burst_projectile') {
      const burst = planCampaignMagentaP90Burst({
        aimDirection: angle, count: definition.burstCount, delaySeconds: definition.burstDelay,
        spread: definition.spread, random: () => random?.next?.('encounter') ?? 0.5,
      });
      const pending = player.pendingWeaponProjectiles || (player.pendingWeaponProjectiles = []);
      burst.forEach(shot => {
        if (shot.delaySeconds <= 0) {
          projectileIds.push(createConfiguredWeaponProjectile(state, player, definition, shot.angle, random).id);
        } else {
          pending.push({
            dueTick: state.tick + Math.max(1, Math.round(shot.delaySeconds * 20)),
            angle: shot.angle, definition,
          });
        }
      });
    } else if (definition.mode === 'projectile') {
      projectileIds.push(createConfiguredWeaponProjectile(state, player, {
        ...definition, returning: !!definition.returning,
      }, angle, random).id);
    } else if (definition.mode === 'volley') {
      const count = Math.max(1, Number(definition.count || 3));
      for (let index = 0; index < count; index += 1) {
        const offset = (index - (count - 1) / 2) * Number(definition.spread || 0.18);
        projectileIds.push(createPlayerProjectile(state, player, {
          ...definition,
          projectileKind: definition.projectileKind || 'fireball',
          attackKind: definition.weaponKey,
          lifeTicks: Math.ceil(Number(definition.life || 1.6) * 20),
        }, angle + offset).id);
      }
    } else if (definition.mode === 'sweep') {
      targetIds = resolveSweep(state, player, definition, angle, emitEvent, random, 0, action.validationState);
    } else if (definition.mode === 'double_sweep') {
      const offsets = definition.angleOffsets || [-0.18, 0.18];
      targetIds = resolveSweep(state, player, definition, angle + Number(offsets[0] || 0), emitEvent, random, 0);
      player.pendingWeaponStrikes = [{
        dueTick: state.tick + Math.max(1, Math.round(Number(definition.secondDelay || 0.12) * 20)),
        angle: angle + Number(offsets[1] || 0),
        definition,
      }];
    } else if (definition.mode === 'smite') {
      const result = resolveSmite(state, player, definition, angle, emitEvent, random);
      targetIds = result.targetIds;
      projectileIds.push(...result.projectileIds);
      segments = result.segments;
    }

    // God mode drops the melee cadence to a 0.2s cooldown (4 ticks).
    const godMeleeTicks = godModeActive(state, player) ? 4 : Number(definition.cooldownTicks || ATTACK_COOLDOWN_TICKS);
    player.attackCooldownUntilTick = state.tick + Math.max(1, Math.ceil(godMeleeTicks
      * Math.max(0.45, Number(player.cooldownMultiplier || 1))
      / getNetworkCampaignAttackSpeed(state, player)));
    player.action = 'attack';
    player.actionTick = state.tick;
    player.actionKind = definition.weaponKey;
    player.actionMode = definition.mode;
    player.aimDirection = angle;
    emitEvent('PLAYER_ATTACKED', {
      playerId: player.id,
      ...(action.predictionId ? { predictionId: action.predictionId } : {}),
      roomId: player.roomId,
      characterKey: player.characterKey,
      attackMode: definition.mode,
      attackKind: definition.weaponKey,
      weaponKey: definition.weaponKey,
      aimDirection: angle,
      originX: Number(player.x),
      originY: Number(player.y),
      color: definition.color,
      range: Number(definition.range || 0),
      arc: Number(definition.arc || 0),
      projectileIds,
      targetIds,
      segments,
    });
    projectileIds.forEach(projectileId => {
      if (action.predictionId && state.projectiles?.[projectileId]) state.projectiles[projectileId].predictionId = action.predictionId;
    });
    return { definition, projectileIds, targetIds };
  }

  function setPlayerAction(state, player, slot, moveKey, angle) {
    player.action = slot === 'dash' ? 'dash' : 'ability';
    player.actionTick = state.tick;
    player.actionKind = moveKey;
    player.actionMode = slot;
    player.aimDirection = angle;
  }

  function abilityTargetsInRadius(state, player, x, y, range) {
    return livingEncounterEnemies(state, player.roomId).filter(enemy => {
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const reach = range + Number(enemy.radius || 20);
      return dx * dx + dy * dy <= reach * reach;
    });
  }

  function abilityTargetsInBeam(state, player, angle, range, width) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    return livingEncounterEnemies(state, player.roomId).filter(enemy => {
      const ox = enemy.x - player.x;
      const oy = enemy.y - player.y;
      const forward = ox * dx + oy * dy;
      const perpendicular = Math.abs(ox * -dy + oy * dx);
      return forward >= 0 && forward <= range && perpendicular <= width + Number(enemy.radius || 20);
    });
  }

  function damageRivalsInRadius(state, player, x, y, range, damage, emitEvent, attackKind, targetIds) {
    rivalPlayers(state, player).forEach(target => {
      const dx = target.x - x;
      const dy = target.y - y;
      const reach = range + Number(target.radius || 18);
      if (dx * dx + dy * dy > reach * reach) return;
      damagePlayer(state, target, playerDamage(state, player.id, damage), player.id, emitEvent, attackKind);
      targetIds.push(target.id);
    });
  }

  function damageRivalsInBeam(state, player, angle, range, width, damage, emitEvent, attackKind, targetIds) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    rivalPlayers(state, player).forEach(target => {
      const ox = target.x - player.x;
      const oy = target.y - player.y;
      const forward = ox * dx + oy * dy;
      const perpendicular = Math.abs(ox * -dy + oy * dx);
      if (forward < 0 || forward > range || perpendicular > width + Number(target.radius || 18)) return;
      damagePlayer(state, target, playerDamage(state, player.id, damage), player.id, emitEvent, attackKind);
      targetIds.push(target.id);
    });
  }

  // ---------------------------------------------------------------------------
  // Move charges.
  //
  // The authority used to model every move as a single binary cooldown, so
  // multi-charge moves (Thorn's 2-charge dash, Warp's 4, Zoomies/Lightning
  // Cross/Nail Shot's 2) collapsed to one charge in multiplayer. This mirrors the
  // campaign's { charges, maxCharges, timers[] } model from game-state.js: each
  // spend pushes an independent recharge timer, and timers refill one charge each
  // as they expire, so charges come back one at a time rather than all at once.
  //
  // Timers are absolute ticks (not countdowns) to stay consistent with the rest of
  // the authority's *UntilTick fields and survive snapshot round-trips unchanged.
  // moveCooldownUntilTick is kept in sync as the soonest-ready tick so existing
  // readers (the HUD, SharedInventorySystem) keep working without knowing about
  // charges at all.
  // Full capacity for a move, base charges widened by any Extra Battery upgrade.
  function moveChargeCapacity(player, moveKey) {
    const base = getMoveBaseCharges(moveKey, player?.characterKey || player?.character);
    const overrideMax = Math.max(0, Math.floor(Number(player?.moveStackOverrides?.[moveKey] || 0)));
    return Math.max(1, base, overrideMax);
  }

  // Read-only view of a move's charges, safe to call before the move has ever been
  // cast and safe to call on a client-side snapshot. Pools are created lazily by
  // ensureMoveChargeState (so a character swap can't strand a stale pool), which
  // means a never-cast move has no stored pool — readers must not treat that as "no
  // charges" or they render an empty/one-pip HUD until the first cast. Always go
  // through this instead of indexing player.moveChargeState directly.
  function readMoveChargeState(player, moveKey) {
    const stored = player?.moveChargeState?.[moveKey];
    const maxCharges = moveChargeCapacity(player, moveKey);
    if (!stored) return { charges: maxCharges, maxCharges, timers: [] };
    // Reconcile capacity for display without mutating: a battery bought this tick
    // should read at its new size even before the authority's next reconcile.
    const charges = Math.max(0, Math.min(maxCharges, Math.floor(Number(stored.charges || 0))
      + Math.max(0, maxCharges - Math.max(1, Math.floor(Number(stored.maxCharges || 1))))));
    return {
      charges,
      maxCharges,
      timers: Array.isArray(stored.timers) ? stored.timers.slice() : [],
    };
  }

  // MUTATING: creates the stored pool if absent and reconciles its capacity in
  // place, then returns the live object. This writes authority state, so only the
  // simulation may call it — never a render/read path (use readMoveChargeState for
  // display). The `ensure` prefix marks the side effect at every call site.
  function ensureMoveChargeState(player, moveKey) {
    const pools = player.moveChargeState || (player.moveChargeState = {});
    const maxCharges = moveChargeCapacity(player, moveKey);
    let pool = pools[moveKey];
    if (!pool) {
      pool = { charges: maxCharges, maxCharges, timers: [] };
      pools[moveKey] = pool;
    }
    // Capacity can grow mid-run (Extra Battery). Credit new headroom as a ready
    // charge, matching tickCooldowns' reconciliation in the campaign.
    if (maxCharges > pool.maxCharges) {
      pool.charges = Math.min(maxCharges, pool.charges + (maxCharges - pool.maxCharges));
      pool.maxCharges = maxCharges;
    }
    return pool;
  }

  // Mirror the pool's soonest-ready tick onto moveCooldownUntilTick. A move with a
  // charge in hand reads as "ready now" (0) so anything gating on it lets the cast
  // through; otherwise it reads as the next timer to expire.
  function syncMoveCooldownMirror(player, moveKey, pool) {
    const cooldowns = player.moveCooldownUntilTick || (player.moveCooldownUntilTick = {});
    if (pool.charges > 0) cooldowns[moveKey] = 0;
    else if (pool.timers.length) cooldowns[moveKey] = Math.min(...pool.timers);
    else cooldowns[moveKey] = 0;
  }

  function hasMoveCharge(player, moveKey) {
    return ensureMoveChargeState(player, moveKey).charges > 0;
  }

  function spendMoveCharge(player, moveKey, readyAtTick) {
    const pool = ensureMoveChargeState(player, moveKey);
    if (pool.charges <= 0) return false;
    pool.charges -= 1;
    pool.timers.push(readyAtTick);
    syncMoveCooldownMirror(player, moveKey, pool);
    return true;
  }

  // Rewrite the most recently pushed timer — used when a held beam is released
  // early and its recharge must be pulled forward from the full-duration estimate.
  function rescheduleLatestMoveCharge(player, moveKey, readyAtTick) {
    const pool = ensureMoveChargeState(player, moveKey);
    if (!pool.timers.length) return;
    pool.timers[pool.timers.length - 1] = readyAtTick;
    syncMoveCooldownMirror(player, moveKey, pool);
  }

  function tickMoveCharges(state) {
    for (const player of Object.values(state.players || {})) {
      const pools = player?.moveChargeState;
      if (!pools) continue;
      for (const moveKey of Object.keys(pools)) {
        // Re-read through ensureMoveChargeState so an Extra Battery bought while the
        // move is idle still grows the pool — reconciling only pools with live
        // timers would silently drop the upgrade until the next cast.
        const pool = ensureMoveChargeState(player, moveKey);
        if (!pool.timers.length) continue;
        const pending = [];
        let restored = 0;
        for (const readyAt of pool.timers) {
          if (state.tick >= Number(readyAt)) restored += 1;
          else pending.push(readyAt);
        }
        if (restored > 0) {
          pool.timers = pending;
          pool.charges = Math.min(pool.maxCharges, pool.charges + restored);
        }
        syncMoveCooldownMirror(player, moveKey, pool);
      }
    }
  }

  function endBeamChannel(state, player) {
    const channel = player?.beamChannel;
    if (!channel) return;
    if (state.beamStruggles?.[player.id]) clearNetworkBeamStruggle(state, state.beamStruggles[player.id]);
    // The campaign starts the laser cooldown when the beam ENDS (held skills
    // recharge on release), so an early release must pull the cooldown forward
    // from the full-duration estimate written at cast time.
    rescheduleLatestMoveCharge(
      player,
      channel.moveKey,
      state.tick + Math.max(1, Number(channel.cooldownTicks || 1)),
    );
    player.beamChannel = null;
  }

  function beginHeldCharge(state, player, moveKey, slot, angle, cooldownTicks, emitEvent, action = {}) {
    const profile = HOLD_TO_CHARGE_MOVES[moveKey];
    if (!profile || player.heldCharge) return null;
    const scaledCooldownTicks = Math.max(1, Math.ceil(cooldownTicks * Math.max(0.45, Number(player.cooldownMultiplier || 1))));
    // Spend now, then rewrite the recharge deadline when the held move ends.
    // This matches the campaign's deferred held-skill recharge without allowing
    // a player to begin several charges on the same available pip.
    if (!spendMoveCharge(player, moveKey, state.tick + profile.maxChargeTicks + scaledCooldownTicks)) return null;
    player.heldCharge = {
      moveKey,
      slot,
      angle,
      dashMoveX: Math.max(-1, Math.min(1, Number(action.dashMoveX) || 0)),
      dashMoveY: Math.max(-1, Math.min(1, Number(action.dashMoveY) || 0)),
      targetX: Number.isFinite(Number(action.targetX)) ? Number(action.targetX) : null,
      targetY: Number.isFinite(Number(action.targetY)) ? Number(action.targetY) : null,
      predictionId: action.predictionId || null,
      startTick: state.tick,
      maxChargeTicks: profile.maxChargeTicks,
      cooldownTicks: scaledCooldownTicks,
      heldSeen: false,
      // An action and its replaceable input can arrive in either order. Give
      // the first held input a short window before treating it as a tap.
      releaseGraceUntilTick: state.tick + HELD_INPUT_GRACE_TICKS,
    };
    setPlayerAction(state, player, slot, moveKey, angle);
    emitEvent('PLAYER_ABILITY_CHARGING', {
      playerId: player.id, roomId: player.roomId, characterKey: player.characterKey,
      slot, abilityId: moveKey, aimDirection: angle,
      maxChargeTicks: profile.maxChargeTicks,
    });
    return { moveKey, slot, mode: 'charging' };
  }

  function updatePlayerHeldCharges(state, inputs, emitEvent, random) {
    Object.values(state.players || {}).forEach(player => {
      const charge = player?.heldCharge;
      if (!charge) return;
      const profile = HOLD_TO_CHARGE_MOVES[charge.moveKey];
      if (!profile) { player.heldCharge = null; return; }
      if (player.downed || player.disconnected) {
        player.heldCharge = null;
        return;
      }
      const input = inputs?.[player.id] || {};
      const buttons = Math.trunc(Number(input.buttons) || 0);
      if (buttons & profile.button) {
        charge.heldSeen = true;
        if (Number.isFinite(Number(input.aimDirection))) charge.angle = Number(input.aimDirection);
        charge.dashMoveX = Math.max(-1, Math.min(1, Number(input.moveX) || 0));
        charge.dashMoveY = Math.max(-1, Math.min(1, Number(input.moveY) || 0));
        if (Number.isFinite(Number(input.targetX))) charge.targetX = Number(input.targetX);
        if (Number.isFinite(Number(input.targetY))) charge.targetY = Number(input.targetY);
      }
      const startTick = Number.isFinite(Number(charge.startTick)) ? Number(charge.startTick) : state.tick;
      const elapsedTicks = Math.max(0, state.tick - startTick);
      const released = charge.heldSeen && !(buttons & profile.button);
      const tapWithoutInput = !charge.heldSeen && state.tick >= Number(charge.releaseGraceUntilTick || state.tick);
      const fullyCharged = elapsedTicks >= Math.max(1, Number(charge.maxChargeTicks || 1));
      if (!released && !tapWithoutInput && !fullyCharged) return;
      const ratio = Math.max(0, Math.min(1, elapsedTicks / Math.max(1, Number(charge.maxChargeTicks || 1))));
      player.heldCharge = null;
      const result = charge.slot === 'melee'
        ? resolveMooggySwipeAttack(state, player, charge.angle, ratio, emitEvent, random, {
          predictionId: charge.predictionId,
        })
        : resolvePlayerAbility(state, player, {
          action: charge.slot === 'dash' ? 'DASH' : 'ABILITY', abilityId: charge.moveKey, aimDirection: charge.angle,
          dashMoveX: charge.dashMoveX, dashMoveY: charge.dashMoveY,
          targetX: charge.targetX, targetY: charge.targetY,
        }, emitEvent, random, { releaseHeldCharge: true, chargeRatio: ratio });
      if (result && charge.moveKey === 'ghost_ball') {
        // Campaign starts this recharge only after the drifting orb fizzles,
        // not when its charge button is released.
        player.ghostBallCooldownTicks = Math.max(1, Number(charge.cooldownTicks || 1));
        rescheduleLatestMoveCharge(player, charge.moveKey, state.tick + 1200);
      } else {
        rescheduleLatestMoveCharge(player, charge.moveKey, state.tick + Math.max(1, Number(charge.cooldownTicks || 1)));
      }
    });
  }

  // The browser polls this once per campaign frame after cooldowns update.
  // Do the equivalent after action processing: a manual dash wins that tick,
  // while a Princess left below 15% HP spends her normal dash charge on Shield.
  function updateAutomaticPrincessShields(state, emitEvent, random) {
    Object.values(state.players || {}).forEach(player => {
      if (!player || player.downed || player.disconnected) return;
      if (!shouldAutoCastCampaignPrincessShield({
        characterKey: player.characterKey || player.character,
        dashMove: player.equippedMoves?.dash,
        isDashing: state.tick < Number(player.dashUntilTick || 0),
        isCharging: !!player.heldCharge,
        hp: player.hp,
        maxHp: player.maxHp,
      })) return;
      resolvePlayerAbility(state, player, {
        action: 'DASH',
        abilityId: 'princess_shield',
        aimDirection: Number(player.aimDirection) || 0,
      }, emitEvent, random);
    });
  }

  // Authored base damage of a player's equipped laser, with no item multipliers
  // applied. Beam-struggle backlash is balanced against this fixed number in the
  // campaign; using the scaled player.beamDamage would make the hit grow with
  // the victim's own upgrades.
  function playerBaseBeamDamage(player) {
    const moveKey = player?.equippedMoves?.laser || 'blood_beam';
    return Math.max(1, Number(MOVE_BASE_STATS[moveKey]?.damage || 10));
  }

  function clearNetworkBeamStruggle(state, struggle) {
    if (!struggle) return;
    const enemy = state.enemies?.[struggle.enemyId];
    if (enemy?.networkBeamStrugglePlayerId === struggle.playerId) delete enemy.networkBeamStrugglePlayerId;
    if (state.beamStruggles) {
      delete state.beamStruggles[struggle.playerId];
      if (struggle.opponentPlayerId) delete state.beamStruggles[struggle.opponentPlayerId];
    }
  }

  function resolveNetworkBeamStruggle(state, struggle, playerWon, emitEvent) {
    const player = state.players?.[struggle.playerId];
    const opponent = state.players?.[struggle.opponentPlayerId];
    const enemy = state.enemies?.[struggle.enemyId];
    clearNetworkBeamStruggle(state, struggle);
    if (player) endBeamChannel(state, player);
    if (opponent) endBeamChannel(state, opponent);
    if (enemy) enemy.beamTime = 0;
    if (opponent) {
      const winner = playerWon ? player : opponent;
      const loser = playerWon ? opponent : player;
      if (loser && !loser.downed) {
        // PvP keeps the item-scaled beam damage on purpose: a duel lost at the
        // beam is meant to be decisive, and both duellists opted in.
        const damage = Math.max(1, Math.round(Number(winner?.beamDamage || 0) + Number(loser.beamDamage || 0)));
        loser.stunnedUntilTick = Math.max(Number(loser.stunnedUntilTick || 0), state.tick + 24);
        damagePlayer(state, loser, damage, winner?.id, emitEvent, 'beam_struggle', {
          angle: Math.atan2(Number(loser.y) - Number(winner?.y || 0), Number(loser.x) - Number(winner?.x || 0)),
          knockback: 520,
          ignoreInv: true,
          ignoreDamageCaps: true,
        });
      }
    } else if (playerWon && enemy && !enemy.dead) {
      enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + 25);
      damageEnemy(state, enemy, 30, player?.id, emitEvent, { attackKind: 'beam_struggle', knockback: 360 });
    } else if (player && !player.downed) {
      player.stunnedUntilTick = Math.max(Number(player.stunnedUntilTick || 0), state.tick + 30);
      // Campaign parity (js/game/combat.js): the backlash is the enemy's beam
      // power plus the *authored base* damage of the player's laser — NOT
      // player.beamDamage, which has already been multiplied by the player's
      // beamDamageMultiplier items. Because this hit deliberately bypasses the
      // per-hit cap and one-shot guard, feeding a scaled number in let an
      // upgraded laser one-shot its own owner off a small beam enemy.
      const damage = Math.max(1, Math.round(
        Number(enemy?.dmg || enemy?.contactDamage || 0) + playerBaseBeamDamage(player),
      ));
      damagePlayer(state, player, damage, enemy?.id, emitEvent, 'beam_struggle', {
        angle: Number(enemy?.beamAngle || 0), knockback: 560, ignoreInv: true, ignoreDamageCaps: true,
      });
    }
    emitEvent('BEAM_STRUGGLE_RESOLVED', {
      playerId: struggle.playerId, enemyId: struggle.enemyId,
      opponentPlayerId: struggle.opponentPlayerId, playerWon,
      x: struggle.x, y: struggle.y,
    });
  }

  function registerNetworkBeamMash(state, player, emitEvent) {
    const struggle = state.beamStruggles?.[player.id];
    if (!struggle) return false;
    const direction = player.id === struggle.playerId ? 1 : -1;
    struggle.progress = Math.max(0, Math.min(1, Number(struggle.progress || 0.5) + BEAM_STRUGGLE_MASH_FORCE * direction));
    struggle.mashCount = Number(struggle.mashCount || 0) + 1;
    if (struggle.progress >= 1) resolveNetworkBeamStruggle(state, struggle, true, emitEvent);
    else if (struggle.progress <= 0) resolveNetworkBeamStruggle(state, struggle, false, emitEvent);
    return true;
  }

  function tryStartNetworkBeamStruggle(state, player, channel, emitEvent) {
    state.beamStruggles = state.beamStruggles || {};
    if (state.beamStruggles[player.id]) return state.beamStruggles[player.id];
    const playerRange = Number(BEAM_CHANNEL_PROFILES[channel.moveKey]?.range || 430);
    let opposingPlayer = null;
    if (state.matchRules?.mode === 'rival') {
      Object.values(state.players || {}).forEach(candidate => {
        if (!candidate || candidate.id === player.id || candidate.downed || candidate.roomId !== player.roomId || !candidate.beamChannel) return;
        if (state.beamStruggles[candidate.id]) return;
        const opponentAngle = Number(candidate.beamChannel.angle || candidate.aimDirection || 0);
        const dx = Number(candidate.x) - Number(player.x);
        const dy = Number(candidate.y) - Number(player.y);
        const distance = Math.hypot(dx, dy);
        const opponentRange = Number(BEAM_CHANNEL_PROFILES[candidate.beamChannel.moveKey]?.range || 430);
        const facingDot = Math.cos(channel.angle) * Math.cos(opponentAngle) + Math.sin(channel.angle) * Math.sin(opponentAngle);
        const lateralA = Math.abs(dx * Math.sin(channel.angle) - dy * Math.cos(channel.angle));
        const lateralB = Math.abs((-dx) * Math.sin(opponentAngle) - (-dy) * Math.cos(opponentAngle));
        if (facingDot <= -0.15 && distance <= Math.min(playerRange, opponentRange) && lateralA <= 24 && lateralB <= 24
          && (!opposingPlayer || distance < opposingPlayer.distance)) opposingPlayer = { player: candidate, distance };
      });
    }
    if (opposingPlayer) {
      const opponent = opposingPlayer.player;
      const struggle = {
        playerId: player.id, opponentPlayerId: opponent.id,
        startTick: state.tick, endTick: state.tick + BEAM_STRUGGLE_DURATION_TICKS,
        progress: 0.5, mashCount: 0,
        x: (Number(player.x) + Number(opponent.x)) / 2,
        y: (Number(player.y) + Number(opponent.y)) / 2,
      };
      state.beamStruggles[player.id] = struggle;
      state.beamStruggles[opponent.id] = struggle;
      emitEvent('BEAM_STRUGGLE_STARTED', { ...struggle });
      return struggle;
    }
    let nearest = null;
    Object.values(state.enemies || {}).forEach(enemy => {
      if (!enemy || enemy.dead || enemy.roomId !== player.roomId || Number(enemy.beamTime || 0) <= 0) return;
      const enemyAngle = Number(enemy.beamAngle || 0);
      const facingDot = Math.cos(channel.angle) * Math.cos(enemyAngle) + Math.sin(channel.angle) * Math.sin(enemyAngle);
      if (facingDot > -0.15) return;
      const dx = Number(enemy.x) - Number(player.x);
      const dy = Number(enemy.y) - Number(player.y);
      const distance = Math.hypot(dx, dy);
      const enemyRange = Number(enemy.beamRange || (enemy.type === 'god' ? 620 : 520));
      if (distance > Math.min(playerRange, enemyRange)) return;
      const playerLateral = Math.abs(dx * Math.sin(channel.angle) - dy * Math.cos(channel.angle));
      const enemyLateral = Math.abs((-dx) * Math.sin(enemyAngle) - (-dy) * Math.cos(enemyAngle));
      if (playerLateral > 24 || enemyLateral > 24) return;
      if (!nearest || distance < nearest.distance) nearest = { enemy, distance };
    });
    if (!nearest) return null;
    const struggle = {
      playerId: player.id,
      enemyId: nearest.enemy.id,
      startTick: state.tick,
      endTick: state.tick + BEAM_STRUGGLE_DURATION_TICKS,
      progress: 0.5,
      mashCount: 0,
      x: (Number(player.x) + Number(nearest.enemy.x)) / 2,
      y: (Number(player.y) + Number(nearest.enemy.y)) / 2,
    };
    state.beamStruggles[player.id] = struggle;
    nearest.enemy.networkBeamStrugglePlayerId = player.id;
    emitEvent('BEAM_STRUGGLE_STARTED', { ...struggle });
    return struggle;
  }

  function updateNetworkBeamStruggle(state, player, channel, emitEvent) {
    const struggle = state.beamStruggles?.[player.id];
    if (!struggle) return false;
    const enemy = state.enemies?.[struggle.enemyId];
    const opponent = state.players?.[struggle.opponentPlayerId];
    if ((!enemy && !opponent) || enemy?.dead || opponent?.downed || !channel || player.downed) {
      clearNetworkBeamStruggle(state, struggle);
      return false;
    }
    if (player.id !== struggle.playerId) return true;
    struggle.progress = Math.max(0, Math.min(1, Number(struggle.progress || 0.5) - (opponent ? 0 : 0.006)));
    const target = opponent || enemy;
    struggle.x = (Number(player.x) + Number(target.x)) / 2;
    struggle.y = (Number(player.y) + Number(target.y)) / 2;
    if (enemy) enemy.beamTime = Math.max(Number(enemy.beamTime || 0), 0.18);
    if (struggle.progress <= 0 || state.tick >= Number(struggle.endTick || 0)) {
      resolveNetworkBeamStruggle(state, struggle, false, emitEvent);
    }
    return true;
  }

  function updatePlayerBeamChannels(state, inputs, fixedDelta, emitEvent) {
    const randomService = combatRandomByState.get(state);
    const roll = () => (randomService ? randomService.next('encounter') : 1);
    for (const player of Object.values(state.players || {})) {
      const channel = player?.beamChannel;
      if (!channel) continue;
      if (player.downed || player.disconnected || state.tick >= Number(channel.untilTick || 0)) {
        endBeamChannel(state, player);
        continue;
      }
      const input = inputs?.[player.id] || {};
      const buttons = Math.trunc(Number(input.buttons) || 0);
      if (buttons & BUTTON_LASER_HELD) channel.heldSeen = true;
      else if (channel.heldSeen) {
        endBeamChannel(state, player);
        continue;
      }
      const profile = BEAM_CHANNEL_PROFILES[channel.moveKey] || {};
      const itemStats = player.itemStats || {};
      // Steer toward the freshest aim available: this tick's input stream when
      // present, otherwise the last aim the movement system recorded.
      const aimTarget = Number.isFinite(Number(input.aimDirection))
        ? Number(input.aimDirection)
        : Number(player.aimDirection) || 0;
      channel.angle = steerBeamChannelAngle(channel.moveKey, channel.angle, aimTarget, fixedDelta, {
        sweepDirection: channel.sweepDirection,
        laserWeightMultiplier: itemStats.laserWeightMultiplier,
      });
      const struggle = state.beamStruggles?.[player.id]
        || tryStartNetworkBeamStruggle(state, player, channel, emitEvent);
      if (struggle && updateNetworkBeamStruggle(state, player, channel, emitEvent)) continue;
      const weight = Math.max(0, Number(itemStats.laserWeightMultiplier ?? 1));
      const recoil = BEAM_RECOIL_ACCEL * weight + (channel.moveKey === 'wizard_lazer' ? WIZARD_LAZER_EXTRA_RECOIL : 0);
      if (recoil > 0) {
        player.vx = Number(player.vx || 0) - Math.cos(channel.angle) * recoil * fixedDelta;
        player.vy = Number(player.vy || 0) - Math.sin(channel.angle) * recoil * fixedDelta;
      }
      if (channel.moveKey === 'turtle_wave') {
        channel.turtleHpTimer = Number(channel.turtleHpTimer || 0) + fixedDelta;
        let exhausted = false;
        while (channel.turtleHpTimer >= 1) {
          channel.turtleHpTimer -= 1;
          const drain = Math.min(TURTLE_WAVE_HP_PER_SECOND, Math.max(0, Number(player.hp || 0) - 1));
          if (drain <= 0) { exhausted = true; break; }
          player.hp = Math.max(1, Number(player.hp || 0) - drain);
          if (player.hp <= 1) { exhausted = true; break; }
        }
        if (exhausted) {
          endBeamChannel(state, player);
          continue;
        }
      }
      channel.tickTimer = Number(channel.tickTimer || 0) - fixedDelta;
      if (channel.tickTimer > 0) continue;
      channel.tickTimer += Math.max(0.02, Number(profile.tickInterval || 0.08));
      const baseStats = MOVE_BASE_STATS[channel.moveKey] || {};
      const forged = applyForgeStats(player, 'move', channel.moveKey, baseStats);
      const forgeScale = Number(baseStats.damage || 0) > 0
        ? Math.max(0, Number(forged.damage || 0)) / Number(baseStats.damage)
        : 1;
      const turtleMult = (player.characterKey || player.character) === 'turtle_boy'
        ? 1 + Math.max(0, Number(player.turtleLaserSteps || 0)) * 0.15
        : 1;
      const tickDamage = Math.max(1, Number(profile.tickDamage || 10))
        * forgeScale * turtleMult * Math.max(0, Number(itemStats.beamDamageMultiplier || 1));
      const padding = Math.max(1, Number(profile.padding || 6)) * Math.max(0.1, Number(itemStats.beamWidthMultiplier || 1));
      const range = Number(profile.range || 430);
      const beamKnockback = Number(profile.knockback || 60);
      const fan = Array.isArray(profile.fan) ? profile.fan : [0];
      const targetIds = [];
      const hitThisTick = new Set();
      const room = currentRoom(state, player.roomId);
      const reflectRects = campaignBeamReflectRects(state, room);
      const bounces = getCampaignPlayerBeamBounceCount(channel.moveKey);
      fan.forEach(offset => {
        const beamAngle = channel.angle + offset;
        const beamPath = buildCampaignRicochetBeamPath({
          originX: player.x, originY: player.y, angle: beamAngle, range, maxBounces: bounces, rects: reflectRects,
        });
        livingEncounterEnemies(state, player.roomId).forEach(enemy => {
          const hitSegment = campaignBeamPathHitsCircle(beamPath, enemy.x, enemy.y, Number(enemy.radius || 20) + padding);
          if (!hitSegment) return;
          // An enemy straddling two fanned beams still takes one hit per tick.
          if (hitThisTick.has(enemy.id)) return;
          hitThisTick.add(enemy.id);
          damageEnemy(state, enemy, tickDamage, player.id, emitEvent, {
            attackKind: channel.moveKey, angle: hitSegment.angle, knockback: beamKnockback,
          });
          targetIds.push(enemy.id);
          if (enemy.dead) return;
          applyAuthorityOnHitStatusProcs(state, enemy, player, { beamFx: true }, roll);
          applyAuthorityCampaignBeamChain(state, player, enemy, tickDamage, emitEvent, roll, channel.moveKey, targetIds);
          if (channel.moveKey === 'blood_beam' && roll() < 0.05) {
            applyAuthorityStatus(state, enemy, 'bleed', 1, 3.2, player.id);
          }
          if (channel.moveKey === 'thorn_blood_beams' && roll() < 0.35) {
            applyAuthorityStatus(state, enemy, 'bleed', 1, 3.6, player.id);
          }
          if (channel.moveKey === 'mooggy_blood_beam') {
            if (roll() < 0.5) applyPoisonStatus(state, enemy, 2, 5, player.id);
            if (roll() < 0.18) enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + 28);
          }
        });
        rivalPlayers(state, player).forEach(target => {
          if (!campaignBeamPathHitsCircle(beamPath, target.x, target.y, Number(target.radius || 18) + padding)) return;
          damagePlayer(state, target, playerDamage(state, player.id, tickDamage), player.id, emitEvent, channel.moveKey);
          targetIds.push(target.id);
        });
        (room?.destructibles || []).forEach(prop => {
          if (prop?.broken || prop?.hidden || !campaignBeamPathHitsRect(beamPath, obstacleRect(prop), 4)) return;
          damageNetworkDestructible(state, player.roomId, prop, 1, emitEvent, roll, { playerId: player.id, attackKind: channel.moveKey });
        });
      });
      if (channel.moveKey === 'love_beam' && targetIds.length > 0) {
        const heal = Math.min(5, targetIds.length * 0.8) * Math.max(0.05, Number(itemStats.healingMultiplier || 1));
        const before = Number(player.hp || 0);
        player.hp = Math.min(Number(player.maxHp || 100), before + heal);
        if (player.hp > before) emitEvent('PLAYER_HEALED', {
          playerId: player.id, roomId: player.roomId, source: 'love_beam', healedAmount: player.hp - before, health: player.hp,
        });
      }
      if (channel.moveKey === 'holy_eye_beams' && targetIds.length > 0 && !channel.healRolled) {
        channel.healRolled = true;
        if (roll() < 0.25) {
          const before = Number(player.hp || 0);
          player.hp = Math.min(Number(player.maxHp || 100), before + Number(player.maxHp || 100) * 0.05
            * Math.max(0.05, Number(itemStats.healingMultiplier || 1)));
          if (player.hp > before) emitEvent('PLAYER_HEALED', {
            playerId: player.id, roomId: player.roomId, source: 'holy_eye_beams', healedAmount: player.hp - before, health: player.hp,
          });
        }
      }
    }
  }

  function resolvePlayerAbility(state, player, action, emitEvent, random, execution = {}) {
    if (player.downed) return null;
    const moveKey = String(action.abilityId || '');
    const slot = MOVE_SLOT_BY_KEY[moveKey];
    if (!slot || slot === 'melee' || player.equippedMoves?.[slot] !== moveKey) return null;
    const expectedAction = slot === 'dash' ? 'DASH' : 'ABILITY';
    if (action.action !== expectedAction) return null;
    const stats = applyForgeStats(player, 'move', moveKey, MOVE_BASE_STATS[moveKey] || {});
    if (!execution.releaseHeldCharge && !hasMoveCharge(player, moveKey)) return null;
    const angle = Number(action.aimDirection);
    if (!Number.isFinite(angle)) return null;
    const dashMoveX = Math.max(-1, Math.min(1, Number(action.dashMoveX) || 0));
    const dashMoveY = Math.max(-1, Math.min(1, Number(action.dashMoveY) || 0));
    // Campaign dashes follow movement when a direction is held, then fall back
    // to aim. Preserve that rule in the authoritative protocol.
    const dashAngle = Math.hypot(dashMoveX, dashMoveY) > 0.15
      ? Math.atan2(dashMoveY, dashMoveX)
      : angle;
    // God mode slashes ability cooldowns (laser 2.8s, smash 2s, dash 0.7x).
    const godCooldownMult = godModeActive(state, player)
      ? (slot === 'laser' ? 2.8 / Math.max(0.5, Number(stats.cooldown || 3.2)) : slot === 'smash' ? 2 / Math.max(0.5, Number(stats.cooldown || 4.2)) : 0.7)
      : 1;
    const cooldownTicks = Math.max(1, Math.ceil(
      Number(stats.cooldown || 0.5) * 20 * godCooldownMult / getNetworkCampaignAttackSpeed(state, player),
    ));
    if (HOLD_TO_CHARGE_MOVES[moveKey] && !execution.releaseHeldCharge) {
      return beginHeldCharge(state, player, moveKey, slot, angle, cooldownTicks, emitEvent, action);
    }
    const chargeRatio = Math.max(0, Math.min(1, Number(execution.chargeRatio || 0)));
    const projectileIds = [];
    const spawnedProjectiles = [];
    const abilityEntityIds = [];
    const targetIds = [];
    let mode = slot;
    let originX = Number(player.x);
    let originY = Number(player.y);
    let effectRadius = Number(stats.range || 0);
    let sweepDirection = 0;

    if (slot === 'dash') {
      const floor = state.floorState || {};
      const statusUntil = player.statusUntilTick || (player.statusUntilTick = {});
      if (moveKey === 'nimrod_stomp') {
        const stomp = resolveCampaignNimrodStomp({ chargeRatio, width: floor.width, height: floor.height, rangeMultiplier: player.itemStats?.aoeRadiusMultiplier });
        const room = currentRoom(state, player.roomId);
        const landing = resolveCampaignBlinkDestination({
          originX: player.x, originY: player.y,
          targetX: player.x + Math.cos(dashAngle) * stomp.leapDistance,
          targetY: player.y + Math.sin(dashAngle) * stomp.leapDistance,
          radius: player.radius, width: floor.width, height: floor.height, wall: floor.wallThickness,
          maxSearchRadius: 140, searchStep: 20,
          // Campaign's safe-landing search treats both permanent structures and
          // intact visible props as solid.  Stomping into a pot server-side
          // while campaign moves aside creates both a collision and damage
          // desync, so keep this predicate exactly aligned with other blinks.
          isBlocked: (x, y, radius) => (room?.structures || []).some(obstacle => (
            circleIntersectsRoomObstacle(x, y, radius, obstacle)
          )) || (room?.destructibles || []).some(obstacle => (
            !obstacle.broken && !obstacle.hidden && circleIntersectsRoomObstacle(x, y, radius, obstacle)
          )),
        });
        if (!landing) return null;
        player.x = landing.x;
        player.y = landing.y;
        const radius = stomp.radius;
        const damage = Math.max(1, Math.round(Number(stats.damage || 46) * stomp.damageMultiplier));
        effectRadius = radius;
        abilityTargetsInRadius(state, player, player.x, player.y, radius).forEach(enemy => {
          damageEnemy(state, enemy, damage, player.id, emitEvent, {
            attackKind: moveKey,
            angle: Math.atan2(enemy.y - player.y, enemy.x - player.x),
            knockback: 260,
          });
          targetIds.push(enemy.id);
        });
        damageRivalsInRadius(state, player, player.x, player.y, radius, damage, emitEvent, moveKey, targetIds);
        player.invulnerableUntilTick = Math.max(Number(player.invulnerableUntilTick || 0), state.tick + Math.ceil(stomp.invulnerabilitySeconds * 20));
        mode = 'dash_aoe';
      } else if (moveKey === 'flying_unhitable' || moveKey === 'cowards_way' || moveKey === 'mooggy_zoomies') {
        const authoredDuration = Math.max(0, Number(stats.duration ?? 3));
        const durationSeconds = moveKey === 'flying_unhitable'
          ? Math.min(FLYING_UNTOUCHABLE_DURATION_SECONDS, authoredDuration)
          : authoredDuration;
        const durationTicks = Math.max(1, Math.round(durationSeconds * 20));
        statusUntil[moveKey] = state.tick + durationTicks;
        mode = 'status';
      } else if (moveKey === 'princess_shield') {
        const shield = resolveCampaignPrincessShield({ maxHp: player.maxHp, barrier: player.barrier });
        player.barrier = shield.barrier;
        mode = 'shield';
      } else if (moveKey === 'dash') {
        // Plain dash is a 0.16s velocity glide with i-frames, exactly like the
        // campaign's castDashBurst — NOT a teleport. The movement system honors
        // dashUntilTick/dashVx/dashVy and holds the hero invulnerable.
        const dash = resolveCampaignDashBurst({
          aimDirection: dashAngle,
          attackSpeed: getNetworkCampaignAttackSpeed(state, player),
          godMode: godModeActive(state, player),
        });
        const dashTicks = Math.max(1, Math.round(dash.durationSeconds * 20));
        player.dashUntilTick = state.tick + dashTicks;
        player.dashVx = dash.vx;
        player.dashVy = dash.vy;
        player.vx = player.dashVx;
        player.vy = player.dashVy;
        player.invulnerableUntilTick = Math.max(Number(player.invulnerableUntilTick || 0), state.tick + Math.round(dash.invulnerabilitySeconds * 20));
        mode = 'dash';
      } else if (moveKey === 'zip_lightning') {
        const room = currentRoom(state, player.roomId);
        const safeLanding = point => resolveCampaignBlinkDestination({
          originX: player.x,
          originY: player.y,
          targetX: point.x,
          targetY: point.y,
          radius: player.radius,
          width: floor.width,
          height: floor.height,
          wall: floor.wallThickness,
          maxSearchRadius: 90,
          searchStep: 14,
          isBlocked: (x, y, radius) => (room?.structures || []).some(obstacle => (
            circleIntersectsRoomObstacle(x, y, radius, obstacle)
          )) || (room?.destructibles || []).some(obstacle => (
            !obstacle.broken && !obstacle.hidden && circleIntersectsRoomObstacle(x, y, radius, obstacle)
          )),
        });
        const enemies = livingEncounterEnemies(state, player.roomId);
        const plan = planCampaignZipLightning({
          entities: enemies,
          originX: player.x,
          originY: player.y,
          targetX: Number.isFinite(Number(action.targetX)) ? Number(action.targetX) : player.x + Math.cos(dashAngle) * 280,
          targetY: Number.isFinite(Number(action.targetY)) ? Number(action.targetY) : player.y + Math.sin(dashAngle) * 280,
          fallbackAngle: dashAngle,
          playerRadius: player.radius,
          level: player.level,
          resolveLanding: safeLanding,
        });
        const baseDamage = godModeActive(state, player) ? 34 : Number(stats.damage || 26);
        const lineDamage = Math.max(1, Math.round(baseDamage * 0.6));
        const lineRadius = 46 * Math.max(0, Number(player.itemStats?.aoeRadiusMultiplier || 1));
        const applyLine = (fromX, fromY, toX, toY) => {
          const lineLengthSquared = Math.max(1, (toX - fromX) ** 2 + (toY - fromY) ** 2);
          livingEncounterEnemies(state, player.roomId).forEach(enemy => {
            const t = Math.max(0, Math.min(1, ((enemy.x - fromX) * (toX - fromX) + (enemy.y - fromY) * (toY - fromY)) / lineLengthSquared));
            const x = fromX + (toX - fromX) * t;
            const y = fromY + (toY - fromY) * t;
            if (Math.hypot(enemy.x - x, enemy.y - y) > lineRadius + Number(enemy.radius || 20)) return;
            damageEnemy(state, enemy, lineDamage, player.id, emitEvent, { attackKind: moveKey, angle: Math.atan2(enemy.y - fromY, enemy.x - fromX), knockback: 150 });
            targetIds.push(enemy.id);
          });
        };
        plan.hops.forEach(hop => {
          player.x = hop.x;
          player.y = hop.y;
          player.vx = 0;
          player.vy = 0;
          applyLine(hop.fromX, hop.fromY, hop.x, hop.y);
          if (!hop.target.dead) {
            damageEnemy(state, hop.target, baseDamage, player.id, emitEvent, { attackKind: moveKey, angle: Math.atan2(hop.target.y - player.y, hop.target.x - player.x), knockback: 185 });
            targetIds.push(hop.target.id);
          }
          const chained = new Set([hop.targetId]);
          let chainSource = hop.target;
          for (let chainIndex = 0; chainIndex < 2; chainIndex += 1) {
            const next = findCampaignNearestDashTarget(livingEncounterEnemies(state, player.roomId), chainSource.x, chainSource.y, 156, chained);
            if (!next) break;
            chained.add(next.id);
            const chainDamage = Math.max(1, Math.round(baseDamage * (0.72 - chainIndex * 0.1)));
            damageEnemy(state, next.entity, chainDamage, player.id, emitEvent, { attackKind: moveKey, angle: Math.atan2(next.entity.y - chainSource.y, next.entity.x - chainSource.x), knockback: 120 });
            targetIds.push(next.entity.id);
            chainSource = next.entity;
          }
        });
        if (plan.fallback) {
          player.x = plan.fallback.x;
          player.y = plan.fallback.y;
          player.vx = 0;
          player.vy = 0;
          applyLine(plan.fallback.fromX, plan.fallback.fromY, plan.fallback.x, plan.fallback.y);
        }
        player.invulnerableUntilTick = Math.max(Number(player.invulnerableUntilTick || 0), state.tick + Math.ceil(0.26 * 20));
        mode = 'dash';
      } else if (moveKey === 'knight_slash_dash') {
        const room = currentRoom(state, player.roomId);
        const safeLanding = (point, context = {}) => {
          const resolve = target => resolveCampaignBlinkDestination({
            originX: player.x,
            originY: player.y,
            targetX: target.x,
            targetY: target.y,
            radius: player.radius,
            width: floor.width,
            height: floor.height,
            wall: floor.wallThickness,
            maxSearchRadius: 90,
            searchStep: 14,
            isBlocked: (x, y, radius) => (room?.structures || []).some(obstacle => (
              circleIntersectsRoomObstacle(x, y, radius, obstacle)
            )) || (room?.destructibles || []).some(obstacle => (
              !obstacle.broken && !obstacle.hidden && circleIntersectsRoomObstacle(x, y, radius, obstacle)
            )),
          });
          return resolve(point) || (context.alternate ? resolve(context.alternate) : null);
        };
        const plan = planCampaignKnightSlashDash({
          entities: livingEncounterEnemies(state, player.roomId),
          originX: player.x,
          originY: player.y,
          targetX: Number.isFinite(Number(action.targetX)) ? Number(action.targetX) : player.x + Math.cos(dashAngle) * 300,
          targetY: Number.isFinite(Number(action.targetY)) ? Number(action.targetY) : player.y + Math.sin(dashAngle) * 300,
          fallbackAngle: dashAngle,
          playerRadius: player.radius,
          resolveLanding: safeLanding,
        });
        const baseDamage = godModeActive(state, player) ? 56 : Number(stats.damage || 42);
        const lineDamage = Math.max(1, Math.round(baseDamage * 0.7));
        const lineRadius = 46 * Math.max(0, Number(player.itemStats?.aoeRadiusMultiplier || 1));
        const applyLine = (fromX, fromY, toX, toY) => {
          const lengthSquared = Math.max(1, (toX - fromX) ** 2 + (toY - fromY) ** 2);
          livingEncounterEnemies(state, player.roomId).forEach(enemy => {
            const t = Math.max(0, Math.min(1, ((enemy.x - fromX) * (toX - fromX) + (enemy.y - fromY) * (toY - fromY)) / lengthSquared));
            const x = fromX + (toX - fromX) * t;
            const y = fromY + (toY - fromY) * t;
            if (Math.hypot(enemy.x - x, enemy.y - y) > lineRadius + Number(enemy.radius || 20)) return;
            damageEnemy(state, enemy, lineDamage, player.id, emitEvent, { attackKind: moveKey, angle: Math.atan2(enemy.y - fromY, enemy.x - fromX), knockback: 170 });
            if (!enemy.dead) applyAuthorityStatus(state, enemy, 'bleed', 3, 5, player.id);
            targetIds.push(enemy.id);
          });
          (room?.destructibles || []).forEach(prop => {
            if (prop.broken || prop.hidden) return;
            const t = Math.max(0, Math.min(1, ((prop.x - fromX) * (toX - fromX) + (prop.y - fromY) * (toY - fromY)) / lengthSquared));
            const x = fromX + (toX - fromX) * t;
            const y = fromY + (toY - fromY) * t;
            if (Math.hypot(prop.x - x, prop.y - y) <= lineRadius + Number(prop.r || 12)) {
              damageNetworkDestructible(state, player.roomId, prop, 2, emitEvent, random, { playerId: player.id, attackKind: moveKey });
            }
          });
        };
        plan.hops.forEach(hop => {
          player.x = hop.x;
          player.y = hop.y;
          player.vx = 0;
          player.vy = 0;
          applyLine(hop.fromX, hop.fromY, hop.x, hop.y);
          if (!hop.target.dead) {
            damageEnemy(state, hop.target, baseDamage, player.id, emitEvent, { attackKind: moveKey, angle: Math.atan2(hop.target.y - player.y, hop.target.x - player.x), knockback: 185 });
            if (!hop.target.dead) applyAuthorityStatus(state, hop.target, 'bleed', 4, 5, player.id);
            targetIds.push(hop.target.id);
          }
        });
        if (plan.fallback) {
          player.x = plan.fallback.x;
          player.y = plan.fallback.y;
          player.vx = 0;
          player.vy = 0;
          applyLine(plan.fallback.fromX, plan.fallback.fromY, plan.fallback.x, plan.fallback.y);
        }
        player.invulnerableUntilTick = Math.max(Number(player.invulnerableUntilTick || 0), state.tick + Math.ceil(0.26 * 20));
        mode = 'dash';
      } else {
        // Blink-strike dashes (warp, zip_lightning, knight_slash_dash) teleport
        // and slash the line they cross — they are teleports in the campaign too.
        const minimum = Number(floor.wallThickness || 28) + Number(player.radius || 18);
        const before = { x: player.x, y: player.y };
        if (moveKey === 'warp') {
          const fallbackDistance = 300;
          const landing = resolveCampaignBlinkDestination({
            originX: player.x,
            originY: player.y,
            targetX: Number.isFinite(Number(action.targetX)) ? Number(action.targetX) : player.x + Math.cos(dashAngle) * fallbackDistance,
            targetY: Number.isFinite(Number(action.targetY)) ? Number(action.targetY) : player.y + Math.sin(dashAngle) * fallbackDistance,
            radius: player.radius,
            width: floor.width,
            height: floor.height,
            wall: floor.wallThickness,
            isBlocked: (x, y, radius) => (currentRoom(state, player.roomId)?.structures || []).some(obstacle => (
              circleIntersectsRoomObstacle(x, y, radius, obstacle)
            )) || (currentRoom(state, player.roomId)?.destructibles || []).some(obstacle => (
              !obstacle.broken && !obstacle.hidden && circleIntersectsRoomObstacle(x, y, radius, obstacle)
            )),
          });
          if (!landing) return null;
          player.x = landing.x;
          player.y = landing.y;
          player.vx = 0;
          player.vy = 0;
        } else {
          const distance = moveKey === 'zip_lightning' ? 230 : 170;
          player.x = Math.max(minimum, Math.min(Number(floor.width || 900) - minimum, player.x + Math.cos(dashAngle) * distance));
          player.y = Math.max(minimum, Math.min(Number(floor.height || 700) - minimum, player.y + Math.sin(dashAngle) * distance));
          player.vx = Math.cos(dashAngle) * distance * 5;
          player.vy = Math.sin(dashAngle) * distance * 5;
        }
        player.invulnerableUntilTick = Math.max(Number(player.invulnerableUntilTick || 0), state.tick + (moveKey === 'warp' ? 12 : 5));
        if (Number(stats.damage || 0) > 0) {
          livingEncounterEnemies(state, player.roomId).forEach(enemy => {
            const lineLength = Math.max(1, Math.hypot(player.x - before.x, player.y - before.y));
            const t = Math.max(0, Math.min(1, ((enemy.x - before.x) * (player.x - before.x) + (enemy.y - before.y) * (player.y - before.y)) / (lineLength * lineLength)));
            const px = before.x + (player.x - before.x) * t;
            const py = before.y + (player.y - before.y) * t;
            if (Math.hypot(enemy.x - px, enemy.y - py) > Number(enemy.radius || 20) + 28) return;
            damageEnemy(state, enemy, stats.damage, player.id, emitEvent, { attackKind: moveKey });
            targetIds.push(enemy.id);
          });
        }
        mode = moveKey === 'warp' ? 'warp' : 'dash';
      }
    } else if (slot === 'laser') {
      const projectileMoves = new Set(['love_bomb_laser', 'ghost_ball', 'power_disks', 'hammer_throw', 'nail_shot', 'laser_shockwave']);
      if (moveKey === 'blade_justice') {
        const base = MOVE_BASE_STATS.blade_justice || {};
        const justice = planCampaignBladeJustice({
          godMode: godModeActive(state, player),
          anvilDamage: Number(stats.damage || 0) - Number(base.damage || 60),
          beamDamageMultiplier: player.itemStats?.beamDamageMultiplier,
          aimDirection: angle,
        });
        justice.blades.forEach(blade => {
          const entity = createAbilityEntity(state, player, {
            kind: 'blade_justice', abilityId: moveKey,
            radius: justice.radius, damage: justice.damage,
            durationTicks: Math.round(justice.durationSeconds * 20),
            life: justice.durationSeconds, angle,
            justiceEffect: justice, fanOffset: blade.fanOffset,
            aim: blade.aim, swingPhase: blade.swingPhase,
            emitPulseEvent: false,
          });
          abilityEntityIds.push(entity.id);
        });
        effectRadius = justice.reach;
        mode = 'summon';
      } else if (moveKey === 'lightning_columns') {
        abilityEntityIds.push(...spawnPersistentMoveEntities(state, player, moveKey, stats, angle, action).map(entity => entity.id));
        mode = 'summon';
      } else if (moveKey === 'laser_shockwave') {
        const base = MOVE_BASE_STATS.laser_shockwave || {};
        const shockwave = planCampaignLaserShockwave({
          x: player.x,
          wall: state.floorState?.wallThickness,
          roomHeight: state.floorState?.height,
          anvilDamage: Number(stats.damage || 0) - Number(base.damage || 22),
        });
        shockwave.spikes.forEach(spike => {
          projectileIds.push(createPlayerProjectile(state, player, {
            kind: 'rock', attackKind: moveKey, damage: spike.damage,
            speed: 0, radius: spike.radius, lifeTicks: Math.round(spike.lifeSeconds * 20),
            pierce: spike.pierce, knockback: spike.knockback, hitOptions: spike.hitOptions,
            spawnDistance: 0, originX: spike.x, originY: spike.y,
          }, 0).id);
        });
        effectRadius = 18;
        mode = 'column';
      } else if (projectileMoves.has(moveKey)) {
        if (moveKey === 'love_bomb_laser') {
          const bomb = planCampaignLoveBomb({
            chargeRatio,
            // General player damage is applied by damageEnemy at impact; this
            // descriptor owns the laser-specific multiplier and flight shape.
            baseDamage: Number(stats.damage || 34),
            beamDamageMultiplier: player.itemStats?.beamDamageMultiplier,
            aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
            projectileSpeedMultiplier: player.itemStats?.projectileSpeedMultiplier,
            originX: player.x, originY: player.y,
            targetX: action.targetX, targetY: action.targetY,
            range: Number(stats.range || 420),
          });
          projectileIds.push(createPlayerProjectile(state, player, {
            kind: bomb.kind, attackKind: moveKey, damage: bomb.damage,
            speed: bomb.speed, radius: bomb.radius, lifeTicks: Math.round(bomb.lifeSeconds * 20),
            aoeRadius: bomb.aoeRadius, sparkleChance: bomb.sparkleChance, knockback: bomb.knockback,
          }, angle).id);
          player.vx = Number(player.vx || 0) - Math.cos(angle) * bomb.recoil;
          player.vy = Number(player.vy || 0) - Math.sin(angle) * bomb.recoil;
        } else if (moveKey === 'power_disks') {
          createPowerDiskBurstDescriptors({ characterKey: player.characterKey || player.character }).forEach(disk => {
            projectileIds.push(createPlayerProjectile(state, player, {
              kind: disk.kind,
              attackKind: moveKey,
              damage: disk.damage,
              speed: disk.speed,
              radius: disk.radius,
              lifeTicks: Math.ceil(disk.lifeSeconds * 20),
              spawnDistance: 0,
              hitOptions: disk.hitOptions,
              subSpawn: disk.subSpawn,
            }, disk.angle).id);
          });
        } else if (moveKey === 'nail_shot') {
          const base = MOVE_BASE_STATS.nail_shot || {};
          const nails = planCampaignNailShot({
            anvilDamage: Number(stats.damage || 0) - Number(base.damage || 18),
            beamDamageMultiplier: player.itemStats?.beamDamageMultiplier,
            projectileSpeedMultiplier: player.itemStats?.projectileSpeedMultiplier,
            extraBounces: rollCampaignProjectileBounces(player.itemStats?.projectileBounces, () => random?.next?.('encounter') ?? 0.5),
            random: () => random?.next?.('encounter') ?? 0.5,
          });
          nails.forEach(nail => {
            projectileIds.push(createPlayerProjectile(state, player, {
              kind: 'nail', attackKind: moveKey, damage: nail.damage,
              speed: nail.speed, radius: nail.radius, lifeTicks: Math.round(nail.lifeSeconds * 20),
              knockback: nail.knockback, bouncesRemaining: nail.bouncesRemaining,
              hitOptions: nail.hitOptions,
            }, nail.angle).id);
          });
        } else if (moveKey === 'hammer_throw') {
          // The authority's damage pipeline applies character/item damage at
          // impact, so the shared descriptor receives only the laser-specific
          // multiplier here. Everything else is the exact campaign projectile.
          const hammer = planCampaignHammerThrow({
            baseDamage: Number(stats.damage || 46),
            beamDamageMultiplier: player.itemStats?.beamDamageMultiplier,
          });
          projectileIds.push(createPlayerProjectile(state, player, {
            kind: hammer.kind, attackKind: moveKey, damage: hammer.damage,
            speed: hammer.speed, radius: hammer.radius, lifeTicks: Math.round(hammer.lifeSeconds * 20),
            pierce: hammer.pierce, knockback: hammer.knockback, returning: hammer.returning,
            lightning: hammer.lightning,
            homing: hammer.homing, homingTarget: hammer.homingTarget,
            homingRadius: hammer.homingRadius, homingSpeed: hammer.homingSpeed,
            homingAccel: hammer.homingAccel, homingTurnRate: hammer.homingTurnRate,
          }, angle).id);
          player.vx = Number(player.vx || 0) - Math.cos(angle) * hammer.recoil;
          player.vy = Number(player.vy || 0) - Math.sin(angle) * hammer.recoil;
        } else if (moveKey === 'ghost_ball') {
          const ball = planCampaignGhostBall({
            chargeRatio,
            // Generic hit scaling remains in damageEnemy; this policy owns the
            // laser multiplier, radius, decay, and contact cadence.
            baseDamage: Number(stats.damage || 34),
            beamDamageMultiplier: player.itemStats?.beamDamageMultiplier,
            aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          });
          projectileIds.push(createPlayerProjectile(state, player, {
            kind: ball.kind, attackKind: moveKey, damage: ball.damage,
            speed: 0, radius: ball.radius, lifeTicks: 9999, ghostBall: true,
            ghostBallEffect: ball, targetX: action.targetX, targetY: action.targetY,
            originX: player.x + Math.cos(angle) * (Number(player.radius || 18) + ball.startRadius * 0.4),
            originY: player.y + Math.sin(angle) * (Number(player.radius || 18) + ball.startRadius * 0.4),
            spawnDistance: 0,
          }, angle).id);
        } else {
          const count = moveKey === 'nail_shot' ? 8 : 1;
          for (let index = 0; index < count; index += 1) {
            const spread = count > 1 ? (index - (count - 1) / 2) * (moveKey === 'nail_shot' ? Math.PI * 2 / count : 0.14) : 0;
            const chargeDamage = moveKey === 'love_bomb_laser' || moveKey === 'ghost_ball'
              ? Math.max(1, Math.round(Number(stats.damage || 34) * (0.6 + chargeRatio * 1.6)))
              : Number(stats.damage || 20);
            const chargeRadius = moveKey === 'love_bomb_laser'
              ? 10 + chargeRatio * 6
              : moveKey === 'ghost_ball'
                ? 18 + chargeRatio * 22
                : 7;
            projectileIds.push(createPlayerProjectile(state, player, {
              kind: moveKey,
              attackKind: moveKey,
              damage: chargeDamage,
              speed: moveKey === 'ghost_ball' ? 300 : moveKey === 'love_bomb_laser' ? 340 + chargeRatio * 120 : 520,
              radius: chargeRadius,
              lifeTicks: Math.max(12, Math.round(Number(stats.range || 320) / 18)),
              pierce: moveKey === 'ghost_ball' ? 8 : 0,
              splash: moveKey === 'love_bomb_laser' ? 48 + chargeRatio * 42 : 0,
              splashDamage: chargeDamage,
            }, angle + spread).id);
          }
        }
        mode = 'projectile';
      } else if (moveKey === 'lightning_cross') {
        const cross = planCampaignLightningCross({
          originX: player.x, originY: player.y,
          roomWidth: state.floorState?.width, roomHeight: state.floorState?.height,
          godMode: godModeActive(state, player),
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
          beamDamageMultiplier: player.itemStats?.beamDamageMultiplier,
        });
        const room = currentRoom(state, player.roomId);
        if (!room) return null;
        room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
        cross.lines.forEach(line => room.hazards.push({
          kind: 'lightning_strike_line', source: moveKey, ownerId: player.id,
          x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2,
          r: cross.radius, warn: cross.warnSeconds, warnTick: 0, tick: 0,
          interval: cross.intervalSeconds, ttl: cross.durationSeconds,
          damage: cross.damage, healPct: cross.healPct, knockback: cross.knockback,
        }));
        effectRadius = cross.radius;
        mode = 'cross';
      } else if (CONTINUOUS_BEAM_MOVE_SET.has(moveKey)) {
        // Channelled beam: nothing is damaged at cast time. The channel below
        // is advanced by updatePlayerBeamChannels every tick — it steers toward
        // the player's live aim, deals its damage on the campaign's tick
        // cadence, and ends on release or when the duration runs out.
        if (moveKey === 'turtle_wave' && Number(player.hp || 0) <= 1) return null;
        if (moveKey === 'god_sweep') sweepDirection = (typeof random === 'function' ? random() : 0.5) < 0.5 ? -1 : 1;
        const profile = BEAM_CHANNEL_PROFILES[moveKey] || {};
        effectRadius = Number(profile.range || stats.range || 430);
        player.beamChannel = {
          moveKey,
          angle,
          sweepDirection,
          startTick: state.tick,
          untilTick: state.tick + Math.max(1, Math.round(Math.max(0.1, Number(profile.duration || stats.duration || 0.58)) * 20)),
          tickTimer: 0,
          turtleHpTimer: 0,
          healRolled: false,
          heldSeen: false,
          cooldownTicks: 0,
        };
        mode = 'beam';
      } else {
        const range = Number(stats.range || (moveKey === 'blade_justice' ? 90 : 470));
        const width = 24;
        effectRadius = range;
        abilityTargetsInBeam(state, player, angle, range, width).forEach(enemy => {
          damageEnemy(state, enemy, stats.damage, player.id, emitEvent, {
            attackKind: moveKey,
            angle: Math.atan2(enemy.y - player.y, enemy.x - player.x),
            knockback: 90,
          });
          targetIds.push(enemy.id);
        });
        damageRivalsInBeam(state, player, angle, range, width, stats.damage, emitEvent, moveKey, targetIds);
        chipDestructiblesAlongBeam(state, player, angle, range, width, emitEvent, random);
        mode = 'beam';
      }
    } else if (slot === 'smash') {
      if (moveKey === 'titan_hammer') {
        const base = MOVE_BASE_STATS.titan_hammer || {};
        const hammer = resolveCampaignTitanHammer({
          godMode: godModeActive(state, player),
          anvilDamage: Number(stats.damage || 0) - Number(base.damage || 70),
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
          // Titan Hammer is authored from the campaign smash footprint (130),
          // not its catalog targeting range (120).
          smashRadius: 130,
          cooldownSeconds: cooldownTicks / 20,
        });
        // Campaign recast replaces the current summon rather than leaving an
        // orphaned hammer to hit while the new one is active.
        Object.entries(state.abilityEntities || {}).forEach(([entityId, entity]) => {
          if (entity.kind === 'titan_hammer' && entity.ownerId === player.id) delete state.abilityEntities[entityId];
        });
        const entity = createAbilityEntity(state, player, {
          kind: 'titan_hammer', abilityId: moveKey,
          x: player.x, y: player.y, radius: hammer.radius, damage: hammer.damage,
          angle, durationTicks: Math.max(1, Math.round(hammer.durationSeconds * 20)),
          life: hammer.durationSeconds, swingsLeft: hammer.maxSwings, titanEffect: hammer,
          emitPulseEvent: false,
        });
        abilityEntityIds.push(entity.id);
        effectRadius = hammer.radius;
        mode = 'summon';
      } else if (moveKey === 'kicky_kick') {
        const base = MOVE_BASE_STATS.kicky_kick || {};
        const kick = resolveCampaignKickyKick({
          anvilDamage: Number(stats.damage || 0) - Number(base.damage || 184),
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
        });
        const room = currentRoom(state, player.roomId);
        effectRadius = kick.radius;
        chipDestructiblesInRadius(state, player, player.x, player.y, kick.radius, kick.damage, emitEvent, random);
        abilityTargetsInRadius(state, player, player.x, player.y, kick.radius).forEach(enemy => {
          const enemyAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
          damageEnemy(state, enemy, kick.damage, player.id, emitEvent, {
            attackKind: moveKey,
            angle: enemyAngle,
            // blastRadius forwards 90% of its authored 400 value to hitEnemy.
            knockback: kick.blastKnockback * 0.9,
          });
          targetIds.push(enemy.id);
          if (enemy.dead || Number(enemy.health || 0) <= 0) return;
          // Kicky Kick's second, massive shove is distinct from the blast hit.
          applyCampaignImpulse(enemy, enemyAngle, kick.impulseKnockback);
          const transfer = planCampaignKickyKickRoomTransfer({
            enemy,
            angle: enemyAngle,
            roomType: room?.type,
            roomWidth: state.floorState?.width,
            roomHeight: state.floorState?.height,
            wall: state.floorState?.wallThickness,
            hasExit: direction => !!getConnectedAuthorityRoom(state, room, direction),
            isBossType: type => !!getEnemyDefinition(type)?.boss,
            random: () => random?.next?.('encounter') ?? 0.5,
          });
          if (!transfer) return;
          const nextRoom = getConnectedAuthorityRoom(state, room, transfer.direction);
          if (!nextRoom) return;
          const sourceEncounter = state.floorState?.encounters?.[room?.id];
          const targetEncounter = state.floorState?.encounters?.[nextRoom.id];
          if (Array.isArray(sourceEncounter?.enemyIds)) {
            sourceEncounter.enemyIds = sourceEncounter.enemyIds.filter(id => id !== enemy.id);
          }
          if (Array.isArray(targetEncounter?.enemyIds) && !targetEncounter.enemyIds.includes(enemy.id)) {
            targetEncounter.enemyIds.push(enemy.id);
          }
          enemy.roomId = nextRoom.id;
          enemy.x = transfer.entryPoint.x;
          enemy.y = transfer.entryPoint.y;
          // Campaign only simulates the currently occupied room. Preserve this
          // launch while the target room is dormant instead of erasing it in
          // the authority's all-room enemy pass on the very same tick.
          enemy.preserveOffscreenImpulse = true;
          emitEvent('ENEMY_ROOM_TRANSFERRED', {
            enemyId: enemy.id,
            fromRoomId: room?.id,
            toRoomId: nextRoom.id,
            direction: transfer.direction,
            entryDirection: transfer.entryDirection,
            x: enemy.x,
            y: enemy.y,
            attackKind: moveKey,
          });
        });
        // PvP uses the same direct blast and outward shove, even though rivals
        // themselves are explicitly excluded from doorway ejection.
        rivalPlayers(state, player).forEach(target => {
          const dx = target.x - player.x;
          const dy = target.y - player.y;
          if (dx * dx + dy * dy > (kick.radius + Number(target.radius || 18)) ** 2) return;
          damagePlayer(state, target, playerDamage(state, player.id, kick.damage), player.id, emitEvent, moveKey, {
            angle: Math.atan2(dy, dx), knockback: kick.blastKnockback,
          });
          targetIds.push(target.id);
        });
        player.vx = Number(player.vx || 0) - Math.cos(angle) * kick.playerRecoil;
        player.vy = Number(player.vy || 0) - Math.sin(angle) * kick.playerRecoil;
        if (room) markEncounterCleared(state, room.id, emitEvent);
        mode = 'aoe';
      } else if (moveKey === 'wall_of_toph') {
        const base = MOVE_BASE_STATS.wall_of_toph || {};
        const wall = planCampaignWallOfToph({
          originX: player.x,
          originY: player.y,
          anvilDamage: Number(stats.damage || 0) - Number(base.damage || 46),
          anvilRange: Number(stats.range || 0) - Number(base.range || 150),
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
          godMode: godModeActive(state, player),
          random: () => random?.next?.('encounter') ?? 0.5,
        });
        const room = currentRoom(state, player.roomId);
        effectRadius = wall.aoeRadius;
        // Campaign's blast runs before the temporary cover rises, so it can
        // destroy authored props in its radius but never chips the new ring.
        chipDestructiblesInRadius(state, player, player.x, player.y, wall.aoeRadius, wall.slamDamage, emitEvent, random);
        abilityTargetsInRadius(state, player, player.x, player.y, wall.aoeRadius).forEach(enemy => {
          damageEnemy(state, enemy, wall.slamDamage, player.id, emitEvent, {
            attackKind: moveKey,
            angle: Math.atan2(enemy.y - player.y, enemy.x - player.x),
            knockback: 180,
            // The shared plan has already selected Wall of Toph's authored
            // god base (70 rather than 46), matching campaign's direct slam.
            ignoreGodMode: true,
          });
          targetIds.push(enemy.id);
        });
        damageRivalsInRadius(state, player, player.x, player.y, wall.aoeRadius, wall.slamDamage, emitEvent, moveKey, targetIds);
        const floor = state.floorState || {};
        const boundary = Number(floor.wallThickness || 28);
        const width = Number(floor.width || 900);
        const height = Number(floor.height || 700);
        const blockerObstacles = [
          ...(room?.structures || []),
          ...(room?.destructibles || []).filter(prop => !prop.broken && !prop.hidden
            && ['wall', 'cover_wall', 'secret_wall'].includes(prop.kind)),
        ];
        const barriers = resolveCampaignWallOfTophBarriers(wall, {
          originX: player.x,
          originY: player.y,
          playerRadius: player.radius,
          isBlocked: (x, y, clearRadius) => (
            x - clearRadius < boundary || x + clearRadius > width - boundary
            || y - clearRadius < boundary || y + clearRadius > height - boundary
            || blockerObstacles.some(obstacle => circleIntersectsRoomObstacle(x, y, clearRadius, obstacle))
          ),
        });
        if (room) {
          room.destructibles = room.destructibles || [];
          barriers.forEach((barrier, index) => {
            room.destructibles.push({
              id: `wall-of-toph:${player.id}:${state.tick}:${index}`,
              ...barrier,
              reinforced: false,
              broken: false,
              ownerId: player.id,
              spawnTick: state.tick,
            });
          });
        }
        wall.shards.forEach(shard => {
          const projectile = createPlayerProjectile(state, player, {
            kind: 'rock',
            attackKind: moveKey,
            damage: shard.damage,
            speed: shard.speed,
            radius: shard.radius,
            lifeTicks: Math.round(shard.lifeSeconds * 20),
            pierce: shard.pierce,
            knockback: shard.knockback,
            hitOptions: shard.hitOptions,
            originX: shard.x,
            originY: shard.y,
            spawnDistance: 0,
            ignoreGodMode: true,
          }, shard.angle);
          projectileIds.push(projectile.id);
          spawnedProjectiles.push(projectileTrajectory(projectile));
        });
        mode = 'aoe_projectile';
      } else if (moveKey === 'turtle_powerup') {
        const powerUp = resolveCampaignTurtlePowerUp({
          chargeRatio,
          health: player.hp,
          barrier: player.barrier,
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
        });
        const room = currentRoom(state, player.roomId);
        player.barrier = powerUp.barrier;
        player.turtlePowerUpUntilTick = state.tick + Math.max(1, Math.round(powerUp.durationSeconds * 20));
        player.turtlePowerUpPower = powerUp.power;
        effectRadius = powerUp.radius;
        abilityTargetsInRadius(state, player, player.x, player.y, powerUp.radius).forEach(enemy => {
          damageEnemy(state, enemy, powerUp.damage, player.id, emitEvent, {
            attackKind: moveKey,
            angle: Math.atan2(enemy.y - player.y, enemy.x - player.x),
            knockback: 120,
          });
          targetIds.push(enemy.id);
        });
        damageRivalsInRadius(state, player, player.x, player.y, powerUp.radius, powerUp.damage, emitEvent, moveKey, targetIds);
        (room?.destructibles || []).forEach(destructible => {
          if (destructible.broken || destructible.hidden) return;
          if (Math.hypot(Number(destructible.x) - player.x, Number(destructible.y) - player.y) > powerUp.radius + Number(destructible.r || 16)) return;
          damageNetworkDestructible(state, player.roomId, destructible, 1, emitEvent, random, {
            playerId: player.id,
            attackKind: moveKey,
          });
        });
        mode = 'support';
      } else if (moveKey === 'potion_bath') {
        const room = currentRoom(state, player.roomId);
        const statuses = ensureCampaignStatuses(player);
        const activeStatusCount = Object.values(statuses).filter(status => Number(status?.stacks || 0) > 0).length;
        const roll = () => random?.next?.('encounter') ?? 0.5;
        const bath = planCampaignPotionBath({
          maxHp: player.maxHp,
          activeStatusCount,
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
          randomAngle: roll,
          randomDistance: roll,
        });
        Object.keys(statuses).forEach(key => clearCampaignStatus(player, key));
        player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + bath.immediateHeal);
        player.potionBathStatusResistUntilTick = Math.max(Number(player.potionBathStatusResistUntilTick || 0), state.tick + Math.ceil(bath.statusResistanceSeconds * 20));
        player.potionBathInvulnerableUntilTick = Math.max(Number(player.potionBathInvulnerableUntilTick || 0), state.tick + Math.ceil(bath.invulnerabilitySeconds * 20));
        player.potionBathConcealedUntilTick = Math.max(Number(player.potionBathConcealedUntilTick || 0), state.tick + Math.ceil(bath.concealmentSeconds * 20));
        player.potionBathRegenUntilTick = state.tick + Math.ceil(bath.regenDurationSeconds * 20);
        player.potionBathRegenAccum = 0;
        player.potionBathRegenInterval = bath.regenIntervalSeconds;
        player.potionBathRegenHeal = bath.regenHealPerPulse;
        bath.bursts.forEach(burst => {
          const x = player.x + Math.cos(burst.angle) * burst.distance;
          const y = player.y + Math.sin(burst.angle) * burst.distance;
          abilityTargetsInRadius(state, player, x, y, burst.radius).forEach(enemy => {
            damageEnemy(state, enemy, burst.damage, player.id, emitEvent, {
              attackKind: moveKey,
              angle: Math.atan2(enemy.y - y, enemy.x - x),
              knockback: 160,
            });
            targetIds.push(enemy.id);
          });
          damageRivalsInRadius(state, player, x, y, burst.radius, burst.damage, emitEvent, moveKey, targetIds);
          (room?.destructibles || []).forEach(destructible => {
            if (destructible.broken || destructible.hidden) return;
            if (Math.hypot(Number(destructible.x) - x, Number(destructible.y) - y) > burst.radius + Number(destructible.r || 16)) return;
            damageNetworkDestructible(state, player.roomId, destructible, 1, emitEvent, random, { playerId: player.id, attackKind: moveKey });
          });
        });
        effectRadius = Math.max(0, ...bath.bursts.map(burst => burst.radius));
        mode = 'support';
      } else if (moveKey === 'floor_lava') {
        const lava = resolveCampaignFloorLava({
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
        });
        player.floorLavaUntilTick = state.tick + Math.max(1, Math.round(lava.durationSeconds * 20));
        player.floorLavaTrailNextTick = state.tick;
        effectRadius = lava.puddleRadius;
        mode = 'status';
      } else if (moveKey === 'random_pounce') {
        const base = MOVE_BASE_STATS.random_pounce || {};
        const pounce = planCampaignRandomPounce({
          originX: player.x,
          originY: player.y,
          entities: livingEncounterEnemies(state, player.roomId),
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
          anvilDamage: Number(stats.damage || 0) - Number(base.damage || 52),
          anvilRange: Number(stats.range || 0) - Number(base.range || 160),
          godMode: godModeActive(state, player),
          random: () => random?.next?.('encounter') ?? 0.5,
        });
        effectRadius = pounce.radius;
        chipDestructiblesInRadius(state, player, player.x, player.y, pounce.radius, pounce.burstDamage, emitEvent, random);
        abilityTargetsInRadius(state, player, player.x, player.y, pounce.radius).forEach(enemy => {
          damageEnemy(state, enemy, pounce.burstDamage, player.id, emitEvent, {
            attackKind: moveKey,
            angle: Math.atan2(enemy.y - player.y, enemy.x - player.x),
            knockback: 200,
            ignoreGodMode: true,
          });
          if (!enemy.dead) applyAuthorityStatus(state, enemy, 'bleed', pounce.bleedStacks, pounce.bleedDurationSeconds, player.id);
          targetIds.push(enemy.id);
        });
        damageRivalsInRadius(state, player, player.x, player.y, pounce.radius, pounce.burstBaseDamage, emitEvent, moveKey, targetIds);
        pounce.fangs.forEach(fang => {
          projectileIds.push(createPlayerProjectile(state, player, {
            kind: 'fang', attackKind: moveKey, damage: fang.damage,
            speed: fang.speed, radius: fang.radius, lifeTicks: Math.round(fang.lifeSeconds * 20),
            knockback: fang.knockback, hitOptions: fang.hitOptions,
            homing: fang.homing, homingTarget: 'enemy', homingTargetId: fang.targetId,
            homingRadius: fang.homingRadius, homingSpeed: fang.homingSpeed,
            homingAccel: fang.homingAccel, homingTurnRate: fang.homingTurnRate,
            ignoreGodMode: true,
          }, fang.angle).id);
        });
        mode = 'aoe_projectile';
      } else if (moveKey === 'mooggy_hairball') {
        const hairball = resolveCampaignMooggyHairball({
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
        });
        effectRadius = hairball.radius;
        chipDestructiblesInRadius(state, player, player.x, player.y, hairball.radius, hairball.damage, emitEvent, random);
        abilityTargetsInRadius(state, player, player.x, player.y, hairball.radius).forEach(enemy => {
          damageEnemy(state, enemy, hairball.damage, player.id, emitEvent, {
            attackKind: moveKey,
            angle: Math.atan2(enemy.y - player.y, enemy.x - player.x),
            knockback: hairball.knockback,
          });
          if (!enemy.dead) {
            applyPoisonStatus(state, enemy, hairball.poisonStacks, hairball.poisonDurationSeconds, player.id);
            enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + Math.ceil(hairball.stunSeconds * 20));
            applyAuthorityStatus(state, enemy, 'slow', hairball.slowStacks, hairball.slowDurationSeconds, player.id);
          }
          targetIds.push(enemy.id);
        });
        damageRivalsInRadius(state, player, player.x, player.y, hairball.radius, hairball.damage, emitEvent, moveKey, targetIds);
        mode = 'aoe';
      } else if (moveKey === 'chaos_burst') {
        const chaos = resolveCampaignChaosBurst({
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
        });
        const erupt = eruption => {
          abilityTargetsInRadius(state, player, eruption.x, eruption.y, eruption.radius).forEach(enemy => {
            damageEnemy(state, enemy, eruption.damage, player.id, emitEvent, {
              attackKind: moveKey,
              angle: Math.atan2(enemy.y - eruption.y, enemy.x - eruption.x),
              knockback: 200,
              ignoreGodMode: true,
            });
            if (!enemy.dead) {
              applyPoisonStatus(state, enemy, 1, eruption.poisonDurationSeconds, player.id);
              if (eruption.isMetao) applyFireStatus(state, enemy, 1, eruption.fireDurationSeconds, player.id);
            }
            targetIds.push(enemy.id);
          });
        };
        for (let index = 0; index < chaos.initialBurstCount; index += 1) {
          erupt(planCampaignChaosEruption({
            originX: player.x, originY: player.y,
            aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
            aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
            isMetao: player.characterKey === 'metao',
            random: () => random?.next?.('encounter') ?? 0.5,
          }));
        }
        abilityEntityIds.push(...spawnPersistentMoveEntities(state, player, moveKey, stats, angle).map(entity => entity.id));
        effectRadius = chaos.fieldRadius;
        mode = 'aoe';
      } else if (moveKey === 'excalibur_strike') {
        const swords = planCampaignExcaliburStrike({
          targetX: Number.isFinite(Number(action.targetX)) ? Number(action.targetX) : player.x,
          targetY: Number.isFinite(Number(action.targetY)) ? Number(action.targetY) : player.y,
          wall: state.floorState?.wallThickness, roomWidth: state.floorState?.width, roomHeight: state.floorState?.height,
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          aoeDamageMultiplier: player.itemStats?.aoeDamageMultiplier,
          godMode: godModeActive(state, player),
          random: () => random?.next?.('encounter') ?? 0.5,
        });
        swords.forEach(sword => {
          const impactTick = state.tick + Math.round((sword.delaySeconds + sword.fallSeconds) * 20);
          const hoverUntilTick = impactTick + Math.round(sword.hoverSeconds * 20);
          const fadeUntilTick = hoverUntilTick + Math.round(sword.fadeSeconds * 20);
          const entity = createAbilityEntity(state, player, {
            kind: 'excalibur_strike', abilityId: moveKey, x: sword.x, y: sword.y,
            radius: sword.radius, damage: sword.damage,
            firstPulseDelayTicks: impactTick - state.tick,
            pulseIntervalTicks: 999,
            durationTicks: fadeUntilTick - state.tick,
            phase: sword.phase, angle: sword.angle, spin: sword.spin,
            delayUntilTick: state.tick + Math.round(sword.delaySeconds * 20),
            impactTick, hoverUntilTick, fadeUntilTick,
          });
          abilityEntityIds.push(entity.id);
        });
        effectRadius = Math.max(0, ...swords.map(sword => sword.radius));
        originX = Number.isFinite(Number(action.targetX)) ? Number(action.targetX) : player.x;
        originY = Number.isFinite(Number(action.targetY)) ? Number(action.targetY) : player.y;
        mode = 'summon';
      } else if (moveKey === 'healing_zone') {
        const heal = 0;
        player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + heal);
        const statusUntil = player.statusUntilTick || (player.statusUntilTick = {});
        statusUntil[moveKey] = state.tick + Math.max(1, Math.round(Number(stats.duration || 3) * 20));
        if (moveKey === 'healing_zone') {
          const zone = resolveCampaignHealingZone({
            chargeRatio,
            aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          });
          const entity = createAbilityEntity(state, player, {
            kind: 'healing_zone', abilityId: moveKey,
            radius: zone.radius,
            damage: zone.damagePerSecond * zone.pulseIntervalSeconds,
            heal: zone.healPerSecond * zone.pulseIntervalSeconds,
            durationTicks: Math.round(zone.durationSeconds * 20),
            pulseIntervalTicks: Math.round(zone.pulseIntervalSeconds * 20),
          });
          abilityEntityIds.push(entity.id);
          effectRadius = entity.radius;
        }
        mode = 'support';
      } else if (moveKey === 'death_ball') {
        const ball = planCampaignDeathBall({
          chargeRatio,
          baseDamage: Number(stats.damage || 40),
          damageMultiplier: player.itemStats?.damageMultiplier,
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
        });
        projectileIds.push(createPlayerProjectile(state, player, {
          kind: ball.kind,
          attackKind: moveKey,
          damage: ball.damage,
          speed: ball.speed,
          radius: ball.radius,
          lifeTicks: Math.round(ball.lifeSeconds * 20),
          pierce: ball.pierce,
          knockback: ball.knockback,
          spawnDistance: Number(player.radius || 18) + ball.radius * 0.4,
        }, angle).id);
        player.vx = Number(player.vx || 0) - Math.cos(angle) * ball.recoil;
        player.vy = Number(player.vy || 0) - Math.sin(angle) * ball.recoil;
        mode = 'projectile';
      } else if (moveKey === 'holy_turrets') {
        abilityEntityIds.push(...spawnPersistentMoveEntities(state, player, moveKey, stats, angle).map(entity => entity.id));
        mode = 'summon';
      } else if (moveKey === 'crimson_smash' || moveKey === 'hammer_smash') {
        const base = MOVE_BASE_STATS[moveKey] || {};
        const smash = planCampaignGroundSmash({
          moveKey,
          godMode: godModeActive(state, player),
          anvilDamage: Number(stats.damage || 0) - Number(base.damage || 0),
          anvilRange: Number(stats.range || 0) - Number(base.range || 0),
          aoeRadiusMultiplier: player.itemStats?.aoeRadiusMultiplier,
          level: player.level,
          aimDirection: angle,
          random: () => random?.next?.('combat-variance') ?? 0.5,
        });
        effectRadius = smash.radius;
        chipDestructiblesInRadius(state, player, player.x, player.y, smash.radius, smash.destructibleDamage, emitEvent, random);
        abilityTargetsInRadius(state, player, player.x, player.y, smash.radius).forEach(enemy => {
          const hasBleed = getCampaignStatusStacks(enemy, 'bleed') > 0;
    const hasBloodOrb = Number(player.items?.orb_of_blood || 0) > 0;
    const damage = smash.damage + (hasBloodOrb && hasBleed ? smash.bleedBonus : 0);
          damageEnemy(state, enemy, damage, player.id, emitEvent, {
            attackKind: moveKey,
            angle: Math.atan2(enemy.y - player.y, enemy.x - player.x),
            knockback: smash.knockback,
            // God mode is represented by the campaign's authored 82 base here,
            // rather than NetworkCombatSystem's generic 1.4 multiplier.
            ignoreGodMode: true,
          });
          if (smash.stunSeconds > 0 && !enemy.dead) {
            enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + Math.ceil(smash.stunSeconds * 20));
          }
          targetIds.push(enemy.id);
        });
        damageRivalsInRadius(state, player, player.x, player.y, smash.radius, smash.pvpDamage, emitEvent, moveKey, targetIds);
        const rocks = spawnCampaignGroundSmashRocks(state, player, smash);
        projectileIds.push(...rocks.map(projectile => projectile.id));
        spawnedProjectiles.push(...rocks.map(projectileTrajectory));
        mode = 'aoe_projectile';
      } else {
        const centerDistance = 0;
        const centerX = player.x + Math.cos(angle) * centerDistance;
        const centerY = player.y + Math.sin(angle) * centerDistance;
        originX = centerX;
        originY = centerY;
        effectRadius = Number(stats.range || 140);
        chipDestructiblesInRadius(state, player, centerX, centerY, effectRadius, Number(stats.damage || 1), emitEvent, random);
        abilityTargetsInRadius(state, player, centerX, centerY, Number(stats.range || 140)).forEach(enemy => {
          // Smash AoE shoves enemies outward from the impact center.
          damageEnemy(state, enemy, stats.damage, player.id, emitEvent, {
            attackKind: moveKey,
            angle: Math.atan2(enemy.y - centerY, enemy.x - centerX),
            knockback: 260,
          });
          if (moveKey === 'random_pounce' && !enemy.dead) {
            applyAuthorityStatus(
              state,
              enemy,
              'bleed',
              2,
              5 * Math.max(1, Number(player.itemStats?.statusDurationMultiplier || 1)),
              player.id,
            );
          }
          targetIds.push(enemy.id);
        });
        damageRivalsInRadius(state, player, centerX, centerY, Number(stats.range || 140), stats.damage, emitEvent, moveKey, targetIds);
        if (['chaos_burst', 'fire_circle', 'floor_lava'].includes(moveKey)) {
          abilityEntityIds.push(...spawnPersistentMoveEntities(state, player, moveKey, stats, angle).map(entity => entity.id));
        }
        mode = 'aoe';
      }
    }

    const scaledCooldownTicks = Math.max(1, Math.ceil(cooldownTicks * Math.max(0.45, Number(player.cooldownMultiplier || 1))));
    if (execution.releaseHeldCharge) {
      // The charge was spent at hold start. Its timer is rescheduled by
      // updatePlayerHeldCharges at the actual release tick.
    } else if (player.beamChannel?.moveKey === moveKey && player.beamChannel.startTick === state.tick) {
      // Held beams recharge from the moment the channel ends, like the
      // campaign's queueHeldSkillRecharge. Assume the full duration here;
      // endBeamChannel rewrites this if the beam is released early.
      player.beamChannel.cooldownTicks = scaledCooldownTicks;
      spendMoveCharge(player, moveKey, player.beamChannel.untilTick + scaledCooldownTicks);
    } else {
      spendMoveCharge(player, moveKey, state.tick + scaledCooldownTicks);
    }
    const destinationX = Number(player.x);
    const destinationY = Number(player.y);
    const actionAngle = slot === 'dash' ? dashAngle : angle;
    setPlayerAction(state, player, slot, moveKey, actionAngle);
    emitEvent('PLAYER_ABILITY_USED', {
      playerId: player.id,
      ...(action.predictionId ? { predictionId: action.predictionId } : {}),
      roomId: player.roomId,
      characterKey: player.characterKey,
      slot,
      abilityId: moveKey,
      mode,
      aimDirection: actionAngle,
      cooldownTicks,
      originX,
      originY,
      destinationX,
      destinationY,
      effectRadius,
      sweepDirection,
      // Dash-glide velocity so the local caster can start the glide immediately.
      ...(moveKey === 'dash' ? { dashVx: Number(player.dashVx || 0), dashVy: Number(player.dashVy || 0) } : {}),
      projectileIds,
      spawnedProjectiles,
      abilityEntityIds,
      targetIds,
    });
    projectileIds.forEach(projectileId => {
      if (action.predictionId && state.projectiles?.[projectileId]) state.projectiles[projectileId].predictionId = action.predictionId;
    });
    return {
      moveKey, slot, mode, originX, originY, destinationX, destinationY,
      effectRadius, projectileIds, spawnedProjectiles, targetIds,
      abilityEntityIds,
    };
  }

  // Drink a stored potion. At full HP, a potion is instead shared with a nearby
  // wounded rival — healing it and befriending it for the rest of the run,
  // exactly like tryUsePotion in the campaign.
  function resolveUsePotion(state, player, emitEvent, random) {
    if (!player || player.downed) return;
    const stored = Number(player.storedPotions || 0);
    if (stored <= 0) {
      emitEvent('POTION_EMPTY', { playerId: player.id });
      return;
    }
    if (Number(player.hp || 0) >= Number(player.maxHp || 100)) {
      const woundedRival = livingEncounterEnemies(state, player.roomId).find(enemy => (
        enemy.type === 'rival' && !enemy.rivalFriend
          && Number(enemy.health || 0) < Number(enemy.maxHealth || 1)
          && Math.hypot(enemy.x - player.x, enemy.y - player.y) < 140
      ));
      if (woundedRival) {
        player.storedPotions = stored - 1;
        woundedRival.health = Number(woundedRival.maxHealth || 1);
        woundedRival.hp = woundedRival.health;
        woundedRival.rivalFriend = true;
        const entry = getRosterEntry(state, woundedRival.rivalCharacterKey);
        if (entry) { entry.friend = true; entry.vendetta = false; entry.relationship = Math.max(10, Number(entry.relationship || 0) + 10); }
        emitEvent('RIVAL_BEFRIENDED', { playerId: player.id, enemyId: woundedRival.id, characterKey: woundedRival.rivalCharacterKey });
        return;
      }
      emitEvent('POTION_FULL_HP', { playerId: player.id });
      return;
    }
    const itemStats = player.itemStats || {};
    const result = resolveCampaignStoredPotion(player, {
      itemStats,
      baseHeal: resolveCampaignPotionBaseHeal({
        difficulty: state.matchRules?.difficulty,
        difficultyPotionHealMultiplier: state.matchRules?.potionHealMultiplier,
        healingMultiplier: itemStats.healingMultiplier,
      }),
      random: () => random?.next?.('encounter') ?? 1,
    });
    if (!result.ok) {
      emitEvent(result.reason === 'FULL_HP' ? 'POTION_FULL_HP' : 'POTION_EMPTY', { playerId: player.id });
      return;
    }
    emitEvent('POTION_USED', {
      playerId: player.id,
      healedAmount: result.healedAmount,
      storedPotions: result.storedPotions,
      ...(result.doubled ? { doubled: true } : {}),
    });
  }

  function resolvePlayerInteraction(state, player, action, emitEvent, random) {
    if (!player || player.downed || player.pendingUpgrade) return false;
    const target = state.interactables?.[action.targetEntityId];
    if (!target || target.opened || target.activated || target.roomId !== player.roomId) return false;
    if (Math.hypot(Number(target.x) - Number(player.x), Number(target.y) - Number(player.y))
      > Number(target.radius || 30) + Number(player.radius || 18) + 38) return false;
    if (target.kind === 'endless_chest' || target.kind === 'intermission_chest') {
      const intermissionKey = authorityGameMode(state) === 'boss_rush'
        ? `boss-rush:chest:${state.bossRush?.stage || 0}:${target.id}`
        : `endless:chest:${state.endlessWave}:${target.id}`;
      const stream = random?.scoped?.(intermissionKey);
      const purchase = purchaseEndlessChest(player, target, {
        random: stream,
        rollItem: ({ elite }) => rollCampaignItem(() => stream?.next?.() ?? 0.5, { elite }),
      });
      if (!purchase.ok) {
        emitEvent('GAME_COMMAND_REJECTED', { playerId: player.id, command: 'ENDLESS_CHEST_PURCHASE', reason: purchase.reason });
        return false;
      }
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = { id: pickupId, type: 'item', key: purchase.rewardKey, roomId: target.roomId, x: target.x, y: target.y, radius: 13, spawnTick: state.tick };
      target.opened = true;
      emitEvent('ENDLESS_CHEST_PURCHASED', { playerId: player.id, interactableId: target.id, roomId: target.roomId, ...purchase });
      return true;
    }
    if (target.kind !== 'relic_chest') return false;
    const chestRandom = random?.scoped?.(`chest:open:${state.floorNumber}:${target.roomId}:${target.id}`);
    const opened = openCampaignChest(target, {
      floorNumber: state.floorNumber,
      random: chestRandom,
      groupId: target.id,
    });
    if (!opened.ok) return false;
    target.offeredTo = player.id;
    target.activatedTick = state.tick;
    emitEvent('CHEST_OPENED', { playerId: player.id, interactableId: target.id, roomId: target.roomId });
    const spawnPickup = descriptor => {
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = {
        id: pickupId, ...descriptor, roomId: target.roomId,
        x: Number(descriptor.x ?? target.x), y: Number(descriptor.y ?? target.y),
        radius: 13, amount: Number(descriptor.amount || 1), spawnTick: state.tick,
      };
      emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: descriptor.type, roomId: target.roomId });
    };
    spawnPickup({ type: 'coin', amount: opened.coinAmount, x: target.x, y: target.y });
    opened.pickups.forEach(spawnPickup);
    // The Treasure Hunt return chest is a key-gated reward followed by the
    // normal stairs. The shared chest resolver exposes this as `revealExit`;
    // materialize the exit here rather than letting the browser infer it.
    if (opened.revealExit) {
      const stairsId = state.allocateEntityId('interactable');
      state.interactables[stairsId] = {
        id: stairsId, kind: 'stairs', roomId: target.roomId, x: target.x, y: target.y,
        radius: 30, final: Number(state.floorNumber || 1) >= MAX_FLOOR, dwellByPlayer: {}, spawnTick: state.tick,
        treasureHuntExit: true,
      };
      emitEvent('INTERACTABLE_SPAWNED', { interactableId: stairsId, kind: 'stairs', roomId: target.roomId, source: 'treasure_hunt_exit_chest' });
    }
    if (!opened.selection) {
      target.claimedBy = player.id;
      const rewardState = state.floorState.rewards?.[target.roomId];
      if (rewardState) {
        rewardState.claimedIds = [...new Set([...(rewardState.claimedIds || []), target.id])];
        rewardState.status = (rewardState.interactableIds || []).every(id => state.interactables[id]?.opened) ? 'claimed' : 'available';
      }
      return true;
    }
    const optionIds = opened.selection.optionIds;
    if (!optionIds.length) return false;
    player.pendingUpgrade = {
      selectionEventId: opened.selection.selectionEventId,
      sourceEntityId: target.id,
      optionIds: optionIds.slice(),
      options: optionIds.map(optionId => ({ id: optionId })),
    };
    emitEvent('UPGRADE_OFFERED', { playerId: player.id, selectionEventId: opened.selection.selectionEventId, optionIds });
    return true;
  }

  function updateChestProximity(state, emitEvent, random) {
    Object.values(state.interactables || {}).forEach(chest => {
      if (chest.kind !== 'relic_chest' || chest.opened || chest.activated) return;
      if (Number(chest.spawnTick || 0) >= Number(state.tick || 0)) return;
      const player = activePlayers(state).find(candidate => !candidate.downed && !candidate.pendingUpgrade
        && candidate.roomId === chest.roomId
        && Math.hypot(Number(candidate.x) - Number(chest.x), Number(candidate.y) - Number(chest.y)) < 36);
      if (player) resolvePlayerInteraction(state, player, { targetEntityId: chest.id }, emitEvent, random);
    });
  }

  function resolveUpgradeSelection(state, player, action, emitEvent, random) {
    const pending = player?.pendingUpgrade;
    if (!pending || pending.selectionEventId !== action.selectionEventId || !pending.optionIds.includes(action.optionId)) return false;
    const source = state.interactables?.[pending.sourceEntityId];
    if (!source || source.opened) {
      player.pendingUpgrade = null;
      return false;
    }
    const claim = claimCampaignChestSelection(source, action.optionId);
    if (!claim.ok) return false;
    const loot = random?.stream?.('loot');
    const acquisition = collectAuthorityCampaignPickup(state, player, claim.itemKey, {
      duplicateChance: player.itemStats?.itemDuplicateChance,
      canDuplicate: claim.itemKey !== 'artificer_charger',
      random: loot ? () => loot.next() : authorityFallbackRandom,
      rollItem: (nextRandom, excludeKeys) => rollCampaignItem(nextRandom, { excludeKeys }),
    }, emitEvent);
    if (!acquisition.ok) return false;
    if (acquisition.jester?.ok) {
      Object.entries(acquisition.jester.bonusItemCounts).forEach(([itemKey, bonusAmount]) => {
        emitEvent('ITEM_BONUS_ACQUIRED', { playerId: player.id, itemKey, amount: bonusAmount, source: 'jesters_dice' });
      });
      emitEvent('JESTER_GATE_PENDING', { playerId: player.id, skipFloors: acquisition.jester.skipFloors });
    }
    source.claimedBy = player.id;
    source.openedTick = state.tick;
    const rewardState = state.floorState.rewards[source.roomId];
    if (rewardState) {
      rewardState.claimedIds = [...new Set([...(rewardState.claimedIds || []), source.id])];
      rewardState.status = (rewardState.interactableIds || []).every(id => state.interactables[id]?.opened)
        ? 'claimed'
        : 'available';
    }
    player.pendingUpgrade = null;
    emitEvent('UPGRADE_APPLIED', {
      playerId: player.id,
      roomId: source.roomId,
      selectionEventId: action.selectionEventId,
      optionId: action.optionId,
      itemKey: action.optionId,
      amount: acquisition.amount,
      duplicated: acquisition.duplicated,
      itemCount: Object.values(player.items || {}).reduce((total, count) => total + Number(count || 0), 0),
    });
    return true;
  }

  function updatePlayerActions(state, inputs, emitEvent, random) {
    Object.values(state.players || {}).forEach(player => {
      const pending = Array.isArray(player.pendingWeaponStrikes) ? player.pendingWeaponStrikes : [];
      player.pendingWeaponStrikes = pending.filter(strike => {
        if (state.tick < Number(strike.dueTick || 0)) return true;
        resolveSweep(state, player, strike.definition, strike.angle, emitEvent, random, Number(strike.strike || 1));
        player.action = 'attack';
        player.actionTick = state.tick;
        player.actionMode = strike.definition.mode;
        player.actionKind = strike.definition.weaponKey;
        player.aimDirection = strike.angle;
        emitEvent('PLAYER_ATTACK_FOLLOWUP', { playerId: player.id, weaponKey: strike.definition.weaponKey, aimDirection: strike.angle });
        return false;
      });
      const pendingProjectiles = Array.isArray(player.pendingWeaponProjectiles) ? player.pendingWeaponProjectiles : [];
      player.pendingWeaponProjectiles = pendingProjectiles.filter(shot => {
        if (state.tick < Number(shot.dueTick || 0)) return true;
        const projectile = createConfiguredWeaponProjectile(state, player, shot.definition || {}, Number(shot.angle || 0), random);
        emitEvent('PLAYER_WEAPON_PROJECTILE_SPAWNED', {
          playerId: player.id, weaponKey: shot.definition?.weaponKey, projectileId: projectile.id,
          aimDirection: Number(shot.angle || 0),
        });
        return false;
      });
      const actions = Array.isArray(inputs[player.id]?.actions) ? inputs[player.id].actions : [];
      if (state.tick < Number(player.stunnedUntilTick || 0)) {
        player.action = 'stunned';
        return;
      }
      actions.filter(action => action?.action === 'BEAM_MASH')
        .forEach(() => registerNetworkBeamMash(state, player, emitEvent));
      if (actions.some(action => action?.action === 'ATTACK' || action?.action === 'ABILITY')) {
        if (player.statusUntilTick) delete player.statusUntilTick.cowards_way;
      }
      const attack = actions.find(action => action?.action === 'ATTACK');
      if (attack) {
        const result = resolvePlayerAttack(state, player, attack, emitEvent, random);
        // Titan Hammer watches the same fresh primary-attack edge as campaign.
        // The ordinary weapon attack still resolves above; the summon consumes
        // this separate edge during its own authoritative update.
        Object.values(state.abilityEntities || {}).forEach(entity => {
          if (entity.kind === 'titan_hammer' && entity.ownerId === player.id && entity.roomId === player.roomId) {
            entity.pendingSwing = true;
          }
        });
        if (!result && attack.predictionId) {
          emitEvent('ACTION_REJECTED', {
            playerId: player.id, predictionId: attack.predictionId,
            reason: player.downed ? 'DOWNED' : 'COOLDOWN_OR_INVALID',
          });
        }
      }
      actions.filter(action => action?.action === 'ABILITY' || action?.action === 'DASH')
        .forEach(action => {
          const result = resolvePlayerAbility(state, player, action, emitEvent, random);
          if (!result && action.predictionId) {
            emitEvent('ACTION_REJECTED', {
              playerId: player.id, predictionId: action.predictionId,
              reason: player.downed ? 'DOWNED' : 'COOLDOWN_OR_INVALID',
            });
          }
        });
      actions.filter(action => action?.action === 'INTERACT')
        .forEach(action => resolvePlayerInteraction(state, player, action, emitEvent, random));
      actions.filter(action => action?.action === 'USE_POTION')
        .forEach(() => resolveUsePotion(state, player, emitEvent, random));
      actions.filter(action => action?.action === 'UPGRADE')
        .forEach(action => resolveUpgradeSelection(state, player, action, emitEvent, random));
      actions.filter(action => action?.action === 'SHOP_PURCHASE')
        .forEach(action => resolveShopPurchase(state, player, action, emitEvent));
      actions.filter(action => action?.action === 'FORGE_COMMIT')
        .forEach(action => resolveForgeCommand(state, player, action, emitEvent));
      actions.filter(action => ['EQUIP_MOVE', 'EQUIP_WEAPON', 'REORDER_EQUIPMENT', 'ACTIVATE_EQUIPMENT'].includes(action?.action))
        .forEach(action => resolveInventoryCommand(state, player, action, emitEvent, random));
      actions.filter(action => action?.action === 'SPECIAL_ROOM_CHOICE')
        .forEach(action => resolveSpecialRoomCommand(state, player, action, emitEvent, random));
      actions.filter(action => ['WIZARD_PAW_SELECT', 'EXTRA_BATTERY_SELECT', 'VOUCHER_REDEEM', 'SCROLL_APPLY'].includes(action?.action))
        .forEach(action => resolveAcquisitionCommand(state, player, action, emitEvent, random));
      resolveCampaignLazerGlassesTick(state, player, inputs[player.id], emitEvent, random);
      if (player.action !== 'idle' && state.tick - Number(player.actionTick || 0) > 4) player.action = 'idle';
    });
  }

  function damagePlayer(state, player, damage, sourceId, emitEvent, attackKind = 'contact', options = {}) {
    if (!player || player.downed) return;
    const statusUntil = player.statusUntilTick || {};
    const protectedByStatus = state.tick < Number(player.invulnerableUntilTick || 0)
      || state.tick < Number(statusUntil.flying_unhitable || 0)
      || state.tick < Number(statusUntil.cowards_way || 0)
      || state.tick < Number(statusUntil.potion_bath || 0)
      || state.tick < Number(player.potionBathInvulnerableUntilTick || 0);
    if (protectedByStatus && !options.ignoreInv) {
      emitEvent('PLAYER_DAMAGE_BLOCKED', { playerId: player.id, sourceId, roomId: player.roomId, attackKind });
      return;
    }
    const challengeModifiers = state.matchRules?.challengeModifiers || {};
    const noHitChallenge = !!(state.matchRules?.noHit || challengeModifiers.no_hit || challengeModifiers.noHit);
    // Campaign's Never Get Hit runs before damage mitigation: any real accepted
    // enemy hit terminates the run, including a hit a barrier would absorb.
    if (noHitChallenge && Number(damage || 0) > 0) {
      player.hp = 0;
      player.downed = true;
      player.downedAtTick = state.tick;
      player.vx = 0;
      player.vy = 0;
      player.deaths = Number(player.deaths || 0) + 1;
      const stats = state.runStats || (state.runStats = { killsByPlayer: {}, playerKills: {}, deathsByPlayer: {} });
      stats.deathsByPlayer = stats.deathsByPlayer || {};
      stats.deathsByPlayer[player.id] = Number(stats.deathsByPlayer[player.id] || 0) + 1;
      emitEvent('PLAYER_DOWNED', { playerId: player.id, sourceId, roomId: player.roomId, attackKind, reason: 'no_hit' });
      state.status = 'ended';
      emitEvent('RUN_ENDED', { result: 'defeat', reason: 'no_hit', floorNumber: Number(state.floorNumber || 1) });
      return;
    }
    const itemStats = player.itemStats || {};
    const healthBeforeHit = Math.max(0, Number(player.hp || 0));
    // Campaign status parity: Cold's slow stacks make defense brittle before
    // the shared damage pipeline applies armor. This must happen here rather
    // than in presentation so an authoritative hit has campaign mitigation.
    const brittleDefenseMultiplier = getCampaignBrittleDefenseMultiplier(
      getCampaignStatusStacks(player, 'slow'),
      Number(itemStats.negativeStatusMultiplier || 1),
    );
    // Campaign parity (game/world.js damagePlayer): a minor enemy fighting in a
    // pack hits harder. Scales the base amount, so damage reduction, barriers
    // and the per-hit cap below still apply on top.
    const packAttacker = sourceId ? state.enemies?.[sourceId] : null;
    const packDamageMultiplier = Math.max(1, Number(packAttacker?.minorPackDamageMultiplier || 1));
    const mirrorAttacker = packAttacker?.behavior === 'mirror' ? packAttacker : null;
    const mirrorStats = mirrorAttacker?.mirrorItemStats || {};
    const room = currentRoom(state, player.roomId);
    const sourceKey = String(options.sourceKey || attackKind || '').toLowerCase();
    const bossLike = !!packAttacker?.boss
      || !!getEnemyDefinition(packAttacker?.type)?.boss
      || room?.type === 'boss'
      || room?.type === 'god'
      || sourceKey.includes('boss')
      || sourceKey.includes('god')
      || sourceKey.includes('queen')
      || sourceKey.includes('artificer')
      || sourceKey.includes('golem');
    const eliteCrit = resolveCampaignEliteCrit(packAttacker, {
      random: () => combatRandomByState.get(state)?.next('encounter') ?? 1,
    });
    const aggressionHit = resolveCampaignEnemyAggressionHit({
      damage: Number(damage || 0) * eliteCrit.multiplier,
      enemy: packAttacker, sourceKey: options.sourceKey || attackKind,
      noEnemyAggression: options.noEnemyAggression || !!mirrorAttacker,
      elapsedSeconds: state.elapsedSeconds,
      overclockedWatchAggressionCut: itemStats.overclockedWatchAggressionCut,
      random: () => combatRandomByState.get(state)?.next('encounter') ?? 1,
    });
    const mirrorCrit = mirrorAttacker ? resolveCampaignCrit({
      itemStats: mirrorStats,
      random: () => combatRandomByState.get(state)?.next('encounter') ?? 1,
    }) : { isCrit: false, critMultiplier: 1 };
    const resolvedOptions = mirrorAttacker ? {
      ...options,
      noEnemyAggression: true,
      knockback: Number(options.knockback || 0) * Math.max(0, Number(mirrorStats.knockbackMultiplier || 1)),
    } : options;
    const resolvedDamage = resolveCampaignPlayerDamage({
      health: healthBeforeHit,
      maxHp: player.maxHp,
      damage: aggressionHit.damage * (mirrorCrit.isCrit ? mirrorCrit.critMultiplier : 1),
      damageMultiplier: packDamageMultiplier * (state.matchRules?.glassCannon || challengeModifiers.glass_cannon || challengeModifiers.glassCannon ? 1.35 : 1),
      damageReduction: Number(itemStats.damageReduction || 0) * brittleDefenseMultiplier,
      flatDamageReduction: itemStats.flatDamageReduction,
      barrier: player.barrier,
      ironLungApplies: itemStats.hasIronLung && room?.type !== 'boss' && room?.type !== 'god',
      bossLike,
      ...resolvedOptions,
    });
    const { absorbed } = resolvedDamage;
    player.barrier = resolvedDamage.barrier;
    player.hp = resolvedDamage.health;
    if (resolvedDamage.dealt > 0 && packAttacker?.elite) {
      const eliteProcs = resolveCampaignElitePlayerHitProcs(packAttacker, player, {
        negativeStatusMultiplier: itemStats.negativeStatusMultiplier,
        random: () => combatRandomByState.get(state)?.next('encounter') ?? 1,
      });
      eliteProcs.forEach(proc => {
        applyAuthorityStatus(state, player, proc.key, proc.stacks, proc.duration, packAttacker.id, {
          severity: Math.max(0, Number(itemStats.negativeStatusMultiplier ?? 1)),
          damageMultiplier: proc.damageMultiplier,
        });
        emitEvent('ELITE_STATUS_PROC', {
          playerId: player.id, enemyId: packAttacker.id, key: proc.key,
          stacks: proc.stacks, duration: proc.duration,
        });
      });
    }
    if (mirrorAttacker && (resolvedDamage.dealt > 0 || absorbed > 0)) {
      const effects = Array.isArray(resolvedOptions.statusEffects)
        ? resolvedOptions.statusEffects
        : (() => {
          const derived = [];
          const bleedChance = Number(mirrorStats.bleedChance || 0) + Math.min(0.35, Number(mirrorStats.scarfBleedsOnHit || 0) * 0.08);
          if (bleedChance > 0) derived.push({ key: 'bleed', chance: bleedChance, stacks: 1, duration: 4.2 });
          if (Number(mirrorStats.snakeKnifePoisonChance || 0) > 0) derived.push({ key: 'poison', chance: Number(mirrorStats.snakeKnifePoisonChance), stacks: 1, duration: 4.2 });
          if (Number(mirrorStats.weaponFatigueChance || 0) > 0) derived.push({ key: 'slow', chance: Number(mirrorStats.weaponFatigueChance), stacks: 1, duration: 4 });
          const activeStatusCount = Object.values(player.statuses || {}).filter(status => Number(status?.stacks || 0) > 0).length;
          const stunChance = Number(mirrorStats.confuseRayStunChance || 0)
            + Number(mirrorStats.weaponFatigueFreezeChance || 0)
            + (activeStatusCount >= 2 ? Number(mirrorStats.overstimulateStunChance || 0) : 0);
          if (stunChance > 0) derived.push({ key: 'stun', chance: stunChance, stacks: 1, duration: 0.55 });
          if (Number(resolvedOptions.fireStacks || 0) > 0) derived.push({ key: 'fire', chance: 1, stacks: Number(resolvedOptions.fireStacks), duration: Number(resolvedOptions.fireDuration || 3.2) });
          return derived;
        })();
      const stream = combatRandomByState.get(state)?.scoped(`${mirrorAttacker.id}|mirror-direct-procs:${state.tick}:${player.id}`);
      effects.forEach(effect => {
        if (!effect?.key || (stream ? stream.next() : 1) >= Number(effect.chance ?? 1)) return;
        applyAuthorityStatus(state, player, effect.key, Number(effect.stacks || 1), Number(effect.duration || 3), mirrorAttacker.id);
      });
    }
    const insuranceResult = applyCampaignInsuranceOnHit(player, {
      healthBeforeHit,
      healthAfterHit: player.hp,
    });
    if (insuranceResult.triggered) emitEvent('ITEM_DAMAGE_EFFECT', {
      playerId: player.id, itemKey: 'insurance', kind: 'insurance', health: player.hp,
    });
    let dealt = Math.max(0, healthBeforeHit - Number(player.hp || 0));
    player.hitTick = state.tick;
    const impulse = dealt > 0 && Number(resolvedOptions.knockback || 0) > 0
      ? applyCampaignImpulse(player, Number(resolvedOptions.angle || 0), Number(resolvedOptions.knockback || 0), Number(itemStats.anchorKnockbackResist || 0))
      : null;
    if (dealt > 0) {
      const stunResistance = Math.max(0, Number(itemStats.stunResistance || 0));
      const thresholdMultiplier = 1 + stunResistance * 0.35;
      const durationMultiplier = Math.max(0.28, 1 - stunResistance * 0.28)
        * Math.max(0, Number(itemStats.negativeStatusMultiplier ?? 1));
      const lostHalfHealth = dealt >= Math.max(1, Number(player.maxHp || 100))
        * HEAVY_HIT_HEALTH_RATIO * thresholdMultiplier;
      const knockback = Number(impulse?.magnitude || 0);
      const knockbackThreshold = HEAVY_KNOCKBACK_THRESHOLD * thresholdMultiplier;
      const heavyKnockback = knockback >= knockbackThreshold;
      if (lostHalfHealth || heavyKnockback) {
        let seconds = lostHalfHealth ? HEAVY_HIT_STUN_SECONDS : 0;
        if (heavyKnockback) {
          const excess = Math.max(0, Math.min(1, (knockback - knockbackThreshold) / knockbackThreshold));
          seconds = Math.max(seconds, HEAVY_KNOCKBACK_STUN_SECONDS + excess * 0.18);
        }
        player.stunnedUntilTick = Math.max(
          Number(player.stunnedUntilTick || 0),
          state.tick + Math.ceil(seconds * durationMultiplier * 20),
        );
      }
    }
    const attacker = state.enemies?.[sourceId];
    const scarfRetaliation = resolveCampaignHemesScarfRetaliation(player, attacker, {
      damageDealt: dealt,
      noInvFrames: resolvedOptions.noInvFrames,
      itemStats,
      random: () => combatRandomByState.get(state)?.next('encounter') ?? 1,
    });
    if (scarfRetaliation) {
      const durationMultiplier = Math.max(1, Number(itemStats.statusDurationMultiplier || 1));
      applyAuthorityStatus(state, attacker, scarfRetaliation.kind, scarfRetaliation.stacks, scarfRetaliation.duration * durationMultiplier, player.id);
      emitEvent('ITEM_DAMAGE_EFFECT', {
        playerId: player.id, itemKey: 'hemes_scarf', kind: 'retaliate_bleed', enemyId: attacker.id,
      });
    }
    // Campaign parity: a stored potion is an emergency response, not just a
    // HUD button. Resolve it after hit-trigger items so its random/pickup
    // transaction cannot change the event-proc stream for the damage frame.
    if (dealt > 0
      && player.hp > 0
      && player.hp < Number(player.maxHp || 100) * 0.10
      && Number(player.storedPotions || 0) > 0) {
      resolveUsePotion(state, player, emitEvent, combatRandomByState.get(state));
    }
    const newlyDowned = player.hp <= 0;
    // Normal hits grant the same short damage i-frames as the campaign. Without
    // this, a packed room can apply several independent contact/projectile hits
    // in consecutive 20 Hz ticks and make a healthy player appear to die in a
    // single network update. Status ticks deliberately opt out below.
    if (dealt > 0 && !resolvedOptions.noInvFrames) {
      player.invulnerableUntilTick = Math.max(
        Number(player.invulnerableUntilTick || 0),
        state.tick + PLAYER_HIT_INVULNERABILITY_TICKS,
      );
    }
    if (newlyDowned) {
      player.downed = true;
      player.downedAtTick = state.tick;
      player.vx = 0;
      player.vy = 0;
      player.deaths = Number(player.deaths || 0) + 1;
      const stats = state.runStats || (state.runStats = { killsByPlayer: {}, playerKills: {}, deathsByPlayer: {} });
      stats.deathsByPlayer = stats.deathsByPlayer || {};
      stats.deathsByPlayer[player.id] = Number(stats.deathsByPlayer[player.id] || 0) + 1;
      if (state.players?.[sourceId] && sourceId !== player.id) {
        const attacker = state.players[sourceId];
        attacker.playerKills = Number(attacker.playerKills || 0) + 1;
        stats.playerKills = stats.playerKills || {};
        stats.playerKills[sourceId] = Number(stats.playerKills[sourceId] || 0) + 1;
      }
      emitEvent('PLAYER_DOWNED', { playerId: player.id, sourceId, roomId: player.roomId, attackKind });
    }
    emitEvent('PLAYER_HIT', {
      playerId: player.id,
      enemyId: state.players?.[sourceId] ? undefined : sourceId,
      sourcePlayerId: state.players?.[sourceId] ? sourceId : undefined,
      damage: dealt,
      absorbed,
      health: player.hp,
      attackKind,
      crit: eliteCrit.isCrit || aggressionHit.isCrit || mirrorCrit.isCrit,
      knockbackAngle: impulse?.angle,
      knockbackMagnitude: impulse?.magnitude,
    });
  }

  function playerInsideRoomHazard(player, hazard) {
    return campaignHazardHitsEntity(hazard, player, { radius: hazard.triggerRadius || hazard.r || 16 });
  }

  // Boss-authored transient hazards (Bowman lightning columns/strike lines,
  // Devil red spikes and lava grid). Same shapes and cadence the campaign
  // pushes into Neo.hazards; ttl-limited and removed on expiry.
  function updateTransientEnemyHazards(state, room, players, fixedDelta, emitEvent) {
    let expired = false;
    room.hazards.forEach(hazard => {
      if (!hazard.enemy) return;
      if (hazard.kind === 'bomb_aoe') {
        hazard.fuse = Number(hazard.fuse || 0) - fixedDelta;
        if (hazard.fuse > 0) return;
        const damage = Math.max(1, Math.round(Number(hazard.baseDamage || 250) * (1 + Math.max(0, Number(state.floorNumber || 1) - 1) * 0.07 + Math.max(0, Number(state.elapsedSeconds || 0) / 60) * 0.04)));
        players.forEach(player => {
          if (Math.hypot(player.x - hazard.x, player.y - hazard.y) > Number(hazard.blastRadius || 150) + Number(player.radius || 18)) return;
          damagePlayer(state, player, damage, hazard.ownerId, emitEvent, hazard.source || 'bomb_aoe', {
            angle: Math.atan2(player.y - hazard.y, player.x - hazard.x), knockback: 240,
          });
        });
        const blastRadius = Number(hazard.blastRadius || 150);
        livingEncounterEnemies(state, room.id).forEach(enemy => {
          if (!campaignHazardHitsEntity(hazard, enemy, { radius: blastRadius })) return;
          damageEnemy(state, enemy, damage, hazard.ownerId || null, emitEvent, { attackKind: hazard.source || 'bomb_aoe' });
        });
        (room.destructibles || []).forEach(prop => {
          if (prop.broken || prop.hidden || !campaignHazardHitsEntity(hazard, prop, { radius: blastRadius })) return;
          damageNetworkDestructible(state, room.id, prop, damage, emitEvent, combatRandomByState.get(state), {
            attackKind: hazard.source || 'bomb_aoe', playerId: hazard.ownerId || null,
          });
        });
        emitEvent('BOMB_AOE_DETONATED', { roomId: room.id, x: hazard.x, y: hazard.y, damage, blastRadius: hazard.blastRadius });
        hazard.ttl = 0;
        expired = true;
        return;
      }
      if (hazard.kind === 'grave_zone') {
        hazard.ttl = Number(hazard.ttl || 0) - fixedDelta;
        if (hazard.ttl <= 0) { expired = true; return; }
        livingEncounterEnemies(state, room.id).forEach(enemy => {
          const dx = Number(enemy.x) - Number(hazard.x); const dy = Number(enemy.y) - Number(hazard.y);
          const distance = Math.hypot(dx, dy);
          if (distance <= 0.001 || distance > Number(hazard.radius || hazard.r || 118) + Number(enemy.radius || 20)) return;
          enemy.graveZoneVulnerableUntilTick = Math.max(Number(enemy.graveZoneVulnerableUntilTick || 0), state.tick + 4);
          enemy.graveZoneDamageTakenMultiplier = Math.max(Number(enemy.graveZoneDamageTakenMultiplier || 1), Number(hazard.damageTakenMultiplier || 1));
          const radius = Number(hazard.radius || hazard.r || 118) + Number(enemy.radius || 20);
          const push = Number(hazard.pushPower || 340) * Math.max(0.12, 1 - distance / radius);
          enemy.vx += dx / distance * push * fixedDelta;
          enemy.vy += dy / distance * push * fixedDelta;
          enemy.stun = Math.max(Number(enemy.stun || 0), 0.05);
        });
        return;
      }
      hazard.ttl = Number(hazard.ttl || 0) - fixedDelta;
      if (hazard.ttl <= 0) {
        expired = true;
        return;
      }
      if (hazard.kind === 'lightning_column') {
        // Lightning columns, including the Storm trial, telegraph before their
        // first damaging cadence exactly like the campaign hazard update.
        hazard.warn = Math.max(0, Number(hazard.warn || 0) - fixedDelta);
        if (hazard.warn > 0) return;
        hazard.tick = Number(hazard.tick || 0) - fixedDelta;
        if (hazard.tick <= 0) {
          hazard.tick = Number(hazard.interval || 0.38);
          players.forEach(player => {
            if (Math.hypot(player.x - hazard.x, player.y - hazard.y) > Number(hazard.r || 44) + Number(player.radius || 18)) return;
            damagePlayer(state, player, Number(hazard.damage || 10), hazard.ownerId, emitEvent, hazard.source || 'lightning_column', {
              angle: Math.atan2(player.y - hazard.y, player.x - hazard.x),
              knockback: 120,
            });
          });
        }
        return;
      }
      if (hazard.kind === 'healing_zone') {
        const owner = state.enemies?.[hazard.ownerId];
        if (owner && !owner.dead && Math.hypot(owner.x - hazard.x, owner.y - hazard.y) < Number(hazard.r || 100)) {
          const heal = Math.max(0, Number(hazard.healPerSecond || 0)) * fixedDelta;
          owner.health = Math.min(Number(owner.maxHealth || owner.health || 0), Number(owner.health || 0) + heal);
          owner.hp = owner.health;
        }
        hazard.tick = Number(hazard.tick || 0) - fixedDelta;
        if (hazard.tick > 0) return;
        const interval = Math.max(0.05, Number(hazard.damageInterval || 0.2));
        hazard.tick = interval;
        const damage = Math.max(1, Math.round(Number(hazard.damagePerSecond || 0) * interval));
        players.forEach(player => {
          if (Math.hypot(player.x - hazard.x, player.y - hazard.y) > Number(hazard.r || 100) + Number(player.radius || 18)) return;
          damagePlayer(state, player, damage, hazard.ownerId, emitEvent, 'healing_zone', {
            angle: Math.atan2(player.y - hazard.y, player.x - hazard.x), knockback: 35,
          });
        });
        return;
      }
      if (hazard.kind === 'chaos_burst') {
        const owner = state.enemies?.[hazard.ownerId];
        if (hazard.followEnemy && owner && !owner.dead) {
          hazard.x = Number(owner.x);
          hazard.y = Number(owner.y);
        }
        hazard.tick = Number(hazard.tick || 0) - fixedDelta;
        if (hazard.tick > 0) return;
        hazard.tick = Math.max(0.05, Number(hazard.interval || 0.22));
        const stream = combatRandomByState.get(state)?.scoped(`${hazard.id || `${room.id}:${hazard.ownerId}:chaos`}|${state.tick}`);
        const eruption = planCampaignChaosEruption({
          originX: hazard.x, originY: hazard.y,
          baseDamage: Number(hazard.damage || 18),
          random: () => stream ? stream.next() : 0.5,
        });
        players.forEach(player => {
          if (Math.hypot(player.x - eruption.x, player.y - eruption.y) > eruption.radius + Number(player.radius || 18)) return;
          damagePlayer(state, player, eruption.damage, hazard.ownerId, emitEvent, 'chaos_burst', {
            angle: Math.atan2(player.y - eruption.y, player.x - eruption.x), knockback: 120,
          });
          applyAuthorityStatus(state, player, 'poison', 1, Number(hazard.poisonDurationSeconds || eruption.poisonDurationSeconds), hazard.ownerId);
        });
        return;
      }
      if (hazard.kind === 'holy_turret') {
        const target = players
          .map(player => ({ player, distance: Math.hypot(player.x - hazard.x, player.y - hazard.y) }))
          .filter(candidate => candidate.distance <= Number(hazard.range || 360))
          .sort((left, right) => left.distance - right.distance || String(left.player.id).localeCompare(String(right.player.id)))[0]?.player;
        if (!target) return;
        const desiredAngle = Math.atan2(target.y - hazard.y, target.x - hazard.x);
        const currentAngle = Number(hazard.aimAngle || 0);
        const delta = Math.atan2(Math.sin(desiredAngle - currentAngle), Math.cos(desiredAngle - currentAngle));
        hazard.aimAngle = currentAngle + Math.max(-fixedDelta * 9, Math.min(fixedDelta * 9, delta));
        hazard.tick = Number(hazard.tick || 0) - fixedDelta;
        if (hazard.tick > 0) return;
        hazard.tick = Math.max(0.05, Number(hazard.interval || 0.6));
        players.forEach(player => {
          if (Math.hypot(player.x - target.x, player.y - target.y) > Number(hazard.burstRadius || 56) + Number(player.radius || 18)) return;
          damagePlayer(state, player, Number(hazard.damage || 17), hazard.ownerId, emitEvent, 'holy_turrets', {
            angle: Number(hazard.aimAngle || desiredAngle), knockback: 120,
          });
        });
        return;
      }
      if (hazard.kind === 'excalibur_strike') {
        hazard.impactDelay = Number(hazard.impactDelay || 0) - fixedDelta;
        if (hazard.impactDelay > 0 || hazard.impacted) return;
        hazard.impacted = true;
        players.forEach(player => {
          if (Math.hypot(player.x - hazard.x, player.y - hazard.y) > Number(hazard.r || 76) + Number(player.radius || 18)) return;
          damagePlayer(state, player, Number(hazard.damage || 46), hazard.ownerId, emitEvent, 'excalibur_strike', {
            angle: Math.atan2(player.y - hazard.y, player.x - hazard.x), knockback: 180,
          });
        });
        return;
      }
      if (hazard.kind === 'lightning_strike_line') {
        if (Number(hazard.warn || 0) > 0) {
          hazard.warn = Number(hazard.warn || 0) - fixedDelta;
          return;
        }
        hazard.tick = Number(hazard.tick || 0) - fixedDelta;
        if (hazard.tick <= 0) {
          hazard.tick = Number(hazard.interval || 0.12);
          players.forEach(player => {
            const hit = segmentHitsCircle(hazard.x1, hazard.y1, hazard.x2, hazard.y2, player.x, player.y, Number(hazard.r || 30) + Number(player.radius || 18));
            if (!hit) return;
            damagePlayer(state, player, Number(hazard.damage || 10), hazard.ownerId, emitEvent, hazard.source || 'lightning_strike', {
              angle: hit.angle,
              knockback: 150,
            });
          });
        }
        return;
      }
      if (hazard.kind === 'red_spikes') {
        hazard.armTime = Number(hazard.armTime || 0) - fixedDelta;
        if (hazard.armTime > 0 || hazard.hit) return;
        players.forEach(player => {
          if (hazard.hit) return;
          if (Math.hypot(player.x - hazard.x, player.y - hazard.y) > Number(hazard.r || 34) + Number(player.radius || 18)) return;
          hazard.hit = true;
          damagePlayer(state, player, Number(hazard.damage || 10), hazard.ownerId, emitEvent, hazard.source || 'red_spikes', {
            angle: Math.atan2(player.y - hazard.y, player.x - hazard.x),
            knockback: 170,
          });
          if (hazard.statusKey) {
            applyAuthorityStatus(state, player, hazard.statusKey, Number(hazard.statusStacks || 1), Number(hazard.statusDuration || 3), hazard.ownerId);
          }
        });
        return;
      }
      if (hazard.kind === 'lava') {
        const contact = advanceCampaignLavaContact(hazard, { delta: fixedDelta });
        players.forEach(player => {
          if (playerHasFloorLavaImmunity(state, player)) return;
          if (!campaignLavaHitsEntity(hazard, player)) return;
          damagePlayer(state, player, contact.damage, hazard.ownerId, emitEvent, hazard.source || 'lava', {
            ignoreInv: true, noInvFrames: true, applyDamageCaps: false,
          });
          if (contact.applyFire) applyAuthorityStatus(state, player, 'fire', Number(hazard.statusStacks || 1), 2.6, hazard.ownerId);
        });
      }
    });
    if (expired) room.hazards = room.hazards.filter(hazard => !hazard.enemy || Number(hazard.ttl || 0) > 0);
  }

  function updateRoomHazards(state, fixedDelta, emitEvent) {
    const rooms = state.floorState?.layout?.rooms || [];
    rooms.forEach(room => {
      if (!Array.isArray(room.hazards) || room.hazards.length === 0) return;
      const players = Object.values(state.players || {}).filter(player => !player.downed && player.roomId === room.id);
      updateTransientEnemyHazards(state, room, players, fixedDelta, emitEvent);
      room.hazards.forEach(hazard => {
        if (hazard.enemy) return;
        if (hazard.kind === 'thorn_mine') {
          hazard.armTime = Math.max(0, Number(hazard.armTime ?? 0.18) - fixedDelta);
          if (hazard.armTime > 0 || hazard.triggered) return;
          const triggerRadius = Number(hazard.triggerRadius || 34);
          const playerTrigger = players.find(player => campaignHazardHitsEntity(hazard, player, { radius: triggerRadius }));
          const enemyTrigger = livingEncounterEnemies(state, room.id).find(enemy => campaignHazardHitsEntity(hazard, enemy, { radius: triggerRadius }));
          const rockTrigger = Object.values(state.projectiles || {}).some(projectile => projectile?.kind === 'rock'
            && projectile.roomId === room.id && campaignHazardHitsEntity(hazard, projectile, { radius: triggerRadius }));
          if (!playerTrigger && !enemyTrigger && !rockTrigger) return;
          const mine = planCampaignThornMine(Number(hazard.stacks || 1));
          const blastRadius = Number(hazard.blastRadius || mine.blastRadius);
          const damage = Number(hazard.damage || mine.damage);
          const bleedStacks = Number(hazard.bleedStacks || mine.bleedStacks);
          const bleedDuration = Number(hazard.bleedDuration || mine.bleedDuration);
          players.forEach(player => {
            if (!campaignHazardHitsEntity(hazard, player, { radius: blastRadius })) return;
            damagePlayer(state, player, damage, `room-hazard:${room.id}`, emitEvent, hazard.source || 'thorn_mine', {
              angle: Math.atan2(player.y - hazard.y, player.x - hazard.x), knockback: mine.knockback,
            });
            applyAuthorityStatus(state, player, 'bleed', bleedStacks, bleedDuration, `room-hazard:${room.id}`);
          });
          livingEncounterEnemies(state, room.id).forEach(enemy => {
            if (!campaignHazardHitsEntity(hazard, enemy, { radius: blastRadius })) return;
            damageEnemy(state, enemy, damage, null, emitEvent, { attackKind: hazard.source || 'thorn_mine', rawDamage: true, knockback: mine.knockback });
            if (!enemy.dead) applyAuthorityStatus(state, enemy, 'bleed', bleedStacks, bleedDuration, null);
          });
          hazard.triggered = true;
          hazard.expired = true;
          emitEvent('ROOM_HAZARD_EXPLODED', { roomId: room.id, hazardKind: 'thorn_mine', x: hazard.x, y: hazard.y, blastRadius });
          return;
        }
        if (hazard.kind === 'lightning_strike_line' && hazard.source === 'lightning_cross') {
          hazard.ttl = Number(hazard.ttl || 0) - fixedDelta;
          if (hazard.ttl <= 0) {
            hazard.expired = true;
            return;
          }
          if (Number(hazard.warn || 0) > 0) {
            hazard.warn = Math.max(0, Number(hazard.warn || 0) - fixedDelta);
            // Campaign decrements first and permits the first strike in the
            // same frame that the telegraph reaches zero.
            if (hazard.warn > 0) return;
          }
          hazard.tick = Number(hazard.tick || 0) - fixedDelta;
          if (hazard.tick > 0) return;
          hazard.tick = Number(hazard.interval || 0.14);
          const owner = state.players?.[hazard.ownerId];
          if (!owner || owner.downed || owner.roomId !== room.id) return;
          livingEncounterEnemies(state, room.id).forEach(enemy => {
            const hit = segmentHitsCircle(
              hazard.x1, hazard.y1, hazard.x2, hazard.y2, enemy.x, enemy.y,
              Number(hazard.r || 26) + Number(enemy.radius || 20),
            );
            if (!hit) return;
            damageEnemy(state, enemy, Number(hazard.damage || 30), owner.id, emitEvent, {
              attackKind: 'lightning_cross', angle: hit.angle, knockback: Number(hazard.knockback || 120),
            });
            if (!enemy.dead) applyAuthorityOnHitStatusProcs(state, enemy, owner, { lightning: true }, combatRandomByState.get(state));
            const before = Number(owner.hp || 0);
            owner.hp = Math.min(Number(owner.maxHp || 100), before + Number(owner.maxHp || 100) * Number(hazard.healPct || 0));
            const healedAmount = owner.hp - before;
            if (healedAmount > 0) emitEvent('PLAYER_HEALED', {
              playerId: owner.id, source: 'lightning_cross', healedAmount, health: owner.hp,
            });
          });
          return;
        }
        if (Number(hazard.vx || 0) || Number(hazard.vy || 0)) {
          advanceCampaignMovingWorldEntity(hazard, fixedDelta, {
            width: state.floorState?.width,
            height: state.floorState?.height,
            margin: Number(hazard.boundaryMargin || hazard.r || 0),
          });
        }
        if (hazard.kind === 'lava') {
          const contact = advanceCampaignLavaContact(hazard, { delta: fixedDelta });
          players.forEach(player => {
            if (playerHasFloorLavaImmunity(state, player)) return;
            if (!campaignLavaHitsEntity(hazard, player)) return;
            damagePlayer(state, player, contact.damage, `room-hazard:${room.id}`, emitEvent, 'lava', {
              ignoreInv: true, noInvFrames: true, applyDamageCaps: false,
            });
            // Campaign lava burns as well as dealing its immediate contact
            // damage. The shared contact transition makes this a single
            // globally-timed burn refresh, matching the campaign zone.
            if (contact.applyFire) {
              applyAuthorityStatus(state, player, 'fire', Number(hazard.statusStacks || 1), 2.6, `room-hazard:${room.id}`);
            }
          });
          return;
        }
        if (hazard.kind !== 'explosive_trap') return;
        if (!hazard.triggered) {
          const trigger = players.find(player => playerInsideRoomHazard(player, { ...hazard, r: hazard.triggerRadius || 34 }));
          const transition = advanceCampaignExplosiveTrap(hazard, { triggered: !!trigger });
          if (!transition.justTriggered) return;
          hazard.triggeredTick = state.tick;
          emitEvent('ROOM_HAZARD_TRIGGERED', { roomId: room.id, hazardKind: hazard.kind, playerId: trigger.id, x: hazard.x, y: hazard.y });
          return;
        }
        const transition = advanceCampaignExplosiveTrap(hazard, { delta: fixedDelta });
        if (!transition.justExploded) return;
        players.forEach(player => {
          if (!campaignHazardHitsEntity(hazard, player, { radius: hazard.blastRadius || 88 })) return;
          damagePlayer(state, player, Number(hazard.baseDamage || 18), `room-hazard:${room.id}`, emitEvent, 'explosive_trap', {
            angle: Math.atan2(Number(player.y) - Number(hazard.y), Number(player.x) - Number(hazard.x)),
            knockback: Number(hazard.knockback || 220),
          });
        });
        const blastRadius = Number(hazard.blastRadius || 88);
        livingEncounterEnemies(state, room.id).forEach(enemy => {
          if (!campaignHazardHitsEntity(hazard, enemy, { radius: blastRadius })) return;
          damageEnemy(state, enemy, Number(hazard.baseDamage || 18), `room-hazard:${room.id}`, emitEvent, { attackKind: 'explosive_trap' });
        });
        (room.destructibles || []).forEach(prop => {
          if (prop.broken || prop.hidden || !campaignHazardHitsEntity(hazard, prop, { radius: blastRadius })) return;
          damageNetworkDestructible(state, room.id, prop, Number(hazard.baseDamage || 18), emitEvent, combatRandomByState.get(state), {
            attackKind: 'explosive_trap', playerId: null,
          });
        });
        emitEvent('ROOM_HAZARD_EXPLODED', { roomId: room.id, hazardKind: hazard.kind, x: hazard.x, y: hazard.y, blastRadius: hazard.blastRadius });
      });
      room.hazards = room.hazards.filter(hazard => !hazard.exploded && !hazard.expired);
    });
  }

  function updateAuthorityCircuitChallenges(state, fixedDelta, emitEvent) {
    (state.floorState?.layout?.rooms || []).forEach(room => {
      if (room?.type !== 'challenge' || !['circuit', 'stillness'].includes(room.challengeType)
        || !room.challengeStarted || room.cleared) return;
      const circuit = advanceCampaignCircuitChallenge(room, fixedDelta);
      if (!circuit.ok || !circuit.failed) return;
      const result = finishCampaignChallenge(room, 'failed', { text: 'CIRCUIT TIMED OUT' });
      if (result.ok) emitEvent('CHALLENGE_FAILED', { roomId: room.id, ...result });
    });
  }

  function updateAuthorityStormChallenges(state, fixedDelta, emitEvent, random) {
    (state.floorState?.layout?.rooms || []).forEach(room => {
      if (room?.type !== 'challenge' || room.challengeType !== 'storm' || !room.challengeStarted || room.cleared) return;
      // Campaign has one hero. Co-op is the necessary boundary adapter: use a
      // stable player id as that frame's storm target, so every reconnect and
      // replay resolves the same shared strike plan.
      const target = Object.values(state.players || {})
        .filter(player => player && !player.downed && player.roomId === room.id)
        .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
      if (!target) return;
      const stream = random?.scoped?.(`challenge:storm:${state.floorNumber}:${room.id}:${state.tick}`);
      const storm = advanceCampaignStormChallenge(room, fixedDelta, {
        floorNumber: state.floorNumber,
        target,
        width: state.floorState?.width,
        height: state.floorState?.height,
        random: stream ? () => stream.next() : () => 0.5,
      });
      if (!storm.ok) return;
      room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
      storm.strikes.forEach(strike => {
        room.hazards.push({
          kind: 'lightning_column', x: strike.x, y: strike.y, r: 52,
          ttl: 1.9, warn: 0.48, tick: 0, interval: 0.42,
          damage: 18 + Number(state.floorNumber || 1), enemy: true, source: 'storm',
        });
        emitEvent('STORM_STRIKE_TELEGRAPHED', { roomId: room.id, x: strike.x, y: strike.y, warn: 0.48 });
      });
      if (!storm.complete) return;
      // The timed trial has no enemies. Its active empty encounter becomes
      // clear only when the shared timer says so, never merely because the
      // generic encounter loop saw an empty enemy list.
      markEncounterCleared(state, room.id, emitEvent);
    });
  }

  function spawnAuthorityTrialWave(state, room, count, random, emitEvent, options = {}) {
    const stream = random?.scoped?.(`challenge:survival:${state.floorNumber}:${room.id}:${state.tick}`);
    const plan = createCampaignTrialEnemyWavePlan(count, {
      floorNumber: state.floorNumber, width: state.floorState?.width, height: state.floorState?.height,
      random: stream ? () => stream.next() : () => 0.5,
    });
    const encounter = state.floorState.encounters?.[room.id];
    plan.forEach(descriptor => {
      const type = options.type || descriptor.type;
      const archetype = getEnemyDefinition(type) || getEnemyDefinition('hunter');
      if (!archetype) return;
      const id = state.allocateEntityId('enemy');
      const radius = Number(archetype.radius || 16);
      const inset = Number(state.floorState?.wallThickness || 28) + radius;
      const desiredX = Math.max(inset, Math.min(Number(state.floorState?.width || 900) - inset, descriptor.x));
      const desiredY = Math.max(inset, Math.min(Number(state.floorState?.height || 700) - inset, descriptor.y));
      const placed = resolveRoomObstacleMovement(room, { x: desiredX, y: desiredY, radius }, desiredX, desiredY);
      state.enemies[id] = {
        id, type, spriteKey: archetype.spriteKey, behavior: archetype.behavior, roomId: room.id,
        x: placed.x, y: placed.y, vx: 0, vy: 0, radius, moveSpeed: Number(archetype.moveSpeed || 96) * 1.08,
        maxHealth: Math.round(Number(archetype.maxHealth || 40) * 1.25), health: Math.round(Number(archetype.maxHealth || 40) * 1.25),
        contactDamage: Number(archetype.contactDamage || 10), projectileDamage: Math.max(5, Number(archetype.projectileDamage || archetype.contactDamage || 10)),
        elite: false, eliteTypes: [], elitePowers: [], patterns: archetype.patterns || [], boss: false,
        bleedImmune: !!archetype.bleedImmune, fireImmune: !!archetype.fireImmune, poisonImmune: !!archetype.poisonImmune,
        statuses: createCampaignStatusMap(), contactCooldownUntilTick: 0,
        attackCooldownUntilTick: state.tick + Math.max(4, Math.round(Number(archetype.attackCooldown || 1) * 20)), attackWindupUntilTick: 0,
        state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
        stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
        attackCd: Math.max(0, Number(archetype.attackCooldown || 1)), obeliskSeeker: true,
        ...(type === 'sniper' ? { sniperBehavior: 'stayback' } : {}),
        ...(type === 'cult_mage' ? { novaCd: 3, novaTimer: 0 } : {}),
      };
      if (encounter?.enemyIds) encounter.enemyIds.push(id);
      emitEvent('ENEMY_SPAWNED', { enemyId: id, roomId: room.id, enemyType: type, challengeTrial: room.challengeType });
    });
  }

  function updateAuthoritySurvivalChallenges(state, fixedDelta, emitEvent, random) {
    (state.floorState?.layout?.rooms || []).forEach(room => {
      if (room?.type !== 'challenge' || room.challengeType !== 'survival' || !room.challengeStarted || room.cleared) return;
      const enemies = Object.values(state.enemies || {}).filter(enemy => enemy?.roomId === room.id);
      const survival = advanceCampaignSurvivalChallenge(room, fixedDelta, {
        floorNumber: state.floorNumber, enemies,
      });
      if (!survival.ok) return;
      if (survival.spawnCount > 0) spawnAuthorityTrialWave(state, room, survival.spawnCount, random, emitEvent);
      if (survival.attackers > 0) emitEvent('CHALLENGE_WARD_DAMAGED', {
        roomId: room.id, health: survival.obelisk.hp, maxHealth: survival.obelisk.maxHp, attackers: survival.attackers,
      });
      if (survival.failed) {
        const result = finishCampaignChallenge(room, 'failed', { text: 'RUNE DESTROYED' });
        if (result.ok) emitEvent('CHALLENGE_FAILED', { roomId: room.id, ...result });
        return;
      }
      if (!survival.complete) return;
      enemies.forEach(enemy => { delete state.enemies[enemy.id]; });
      markEncounterCleared(state, room.id, emitEvent);
    });
  }

  function updateAuthorityRuneChallenges(state, fixedDelta, emitEvent, random) {
    (state.floorState?.layout?.rooms || []).forEach(room => {
      if (room?.type !== 'challenge' || room.challengeType !== 'runes' || !room.challengeStarted || room.cleared) return;
      const runes = advanceCampaignRuneChallenge(room, fixedDelta, { floorNumber: state.floorNumber });
      if (!runes.ok) return;
      if (runes.spawnCount > 0) spawnAuthorityTrialWave(state, room, runes.spawnCount, random, emitEvent);
      if (!runes.failed) return;
      const result = finishCampaignChallenge(room, 'failed', { text: 'RUNES FADING' });
      if (result.ok) emitEvent('CHALLENGE_FAILED', { roomId: room.id, ...result });
    });
  }

  function updateAuthorityBombChallenges(state, fixedDelta, emitEvent, random) {
    (state.floorState?.layout?.rooms || []).forEach(room => {
      if (room?.type !== 'challenge' || room.challengeType !== 'bomb' || !room.challengeStarted || room.cleared) return;
      const bomb = advanceCampaignBombChallenge(room, fixedDelta, { floorNumber: state.floorNumber });
      if (!bomb.ok) return;
      if (bomb.spawnCount > 0) spawnAuthorityTrialWave(state, room, bomb.spawnCount, random, emitEvent);
      if (!bomb.failed) return;
      const centreX = Number(state.floorState?.width || 900) / 2;
      const centreY = Number(state.floorState?.height || 700) / 2;
      room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
      room.hazards.push({ kind: 'bomb_aoe', x: centreX, y: centreY, r: 150, blastRadius: 150, fuse: 3, fuseDuration: 3, baseDamage: 250, enemy: true, source: 'bomb_aoe' });
      const result = finishCampaignChallenge(room, 'failed', { text: 'BOMB DETONATED' });
      if (result.ok) emitEvent('CHALLENGE_FAILED', { roomId: room.id, ...result });
    });
  }

  function updateTemporaryDestructibles(state, fixedDelta, emitEvent) {
    (state.floorState?.layout?.rooms || []).forEach(room => {
      if (!Array.isArray(room.destructibles)) return;
      room.destructibles.forEach(prop => {
        if (prop.broken || !Number.isFinite(Number(prop.ttl))) return;
        prop.ttl = Number(prop.ttl) - fixedDelta;
        if (prop.ttl > 0) return;
        prop.broken = true;
        prop.hp = 0;
        emitEvent('DESTRUCTIBLE_BROKEN', { roomId: room.id, obstacleKind: prop.kind, x: prop.x, y: prop.y, expired: true });
      });
    });
  }

  function createEnemyProjectile(state, enemy, target) {
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    const projectileId = state.allocateEntityId('projectile');
    state.projectiles[projectileId] = {
      id: projectileId,
      type: enemy.type === 'hunter' ? 'hunter_arrow' : enemy.behavior === 'beam' ? 'enemy_beam_bolt' : enemy.behavior === 'burst' ? 'enemy_burst_round' : `${enemy.type}_shot`,
      ownerId: enemy.id,
      hostile: true,
      roomId: enemy.roomId,
      x: enemy.x + Math.cos(angle) * (Number(enemy.radius || 19) + 10),
      y: enemy.y + Math.sin(angle) * (Number(enemy.radius || 19) + 10),
      vx: Math.cos(angle) * 390,
      vy: Math.sin(angle) * 390,
      radius: enemy.behavior === 'beam' ? 9 : enemy.behavior === 'burst' ? 4 : 6,
      damage: Number(enemy.projectileDamage || 9),
      // colour is derived client-side from `behavior` (see NetworkGameView cosmetics)
      behavior: enemy.behavior,
      attackKind: enemy.type === 'hunter' ? 'hunter_arrow' : enemy.type,
      spawnTick: state.tick,
      expiresTick: state.tick + 30,
    };
    return projectileId;
  }

  function spawnSummonedEnemy(state, summoner, emitEvent, options = {}) {
    const definition = getEnemyDefinition(options.type || 'cult_follower');
    const enemyId = state.allocateEntityId('enemy');
    const angle = (Number(state.tick || 0) + Number(String(enemyId).replace(/\D/g, '') || 0)) * 1.7;
    const wall = Number(state.floorState?.wallThickness || 28) + Number(definition.radius || 12);
    const x = Number.isFinite(Number(options.x)) ? Number(options.x) : summoner.x + Math.cos(angle) * 48;
    const y = Number.isFinite(Number(options.y)) ? Number(options.y) : summoner.y + Math.sin(angle) * 48;
    state.enemies[enemyId] = {
      id: enemyId,
      type: definition.type,
      spriteKey: definition.spriteKey,
      behavior: definition.behavior,
      roomId: summoner.roomId,
      x: Math.max(wall, Math.min(Number(state.floorState?.width || 900) - wall, x)),
      y: Math.max(wall, Math.min(Number(state.floorState?.height || 700) - wall, y)),
      vx: 0, vy: 0,
      radius: definition.radius,
      moveSpeed: definition.moveSpeed,
      maxHealth: definition.maxHealth,
      health: definition.maxHealth,
      contactDamage: definition.contactDamage,
      projectileDamage: 6,
      contactCooldownUntilTick: 0,
      attackCooldownUntilTick: state.tick + 12,
      attackWindupUntilTick: 0,
      state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
      statuses: createCampaignStatusMap(),
      summonedBy: summoner.id,
      stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
      attackCd: Number(definition.attackCooldown || 0.85),
    };
    state.floorState?.encounters?.[summoner.roomId]?.enemyIds?.push(enemyId);
    emitEvent('ENEMY_SPAWNED', { enemyId, roomId: summoner.roomId, enemyType: definition.type, summonedBy: summoner.id });
  }

  function updateEnemySupport(state, enemy, emitEvent) {
    if (!['healer', 'shield'].includes(enemy.behavior) || state.tick < Number(enemy.supportCooldownUntilTick || 0)) return;
    const allies = livingEncounterEnemies(state, enemy.roomId).filter(candidate => candidate.id !== enemy.id);
    if (!allies.length) return;
    allies.sort((first, second) => (first.health / first.maxHealth) - (second.health / second.maxHealth));
    const target = allies[0];
    if (enemy.behavior === 'healer') target.health = Math.min(target.maxHealth, target.health + Math.max(8, Math.round(target.maxHealth * 0.12)));
    else target.barrier = Math.max(Number(target.barrier || 0), Math.round(target.maxHealth * 0.24));
    enemy.supportCooldownUntilTick = state.tick + (enemy.behavior === 'healer' ? 60 : 56);
    emitEvent('ENEMY_SUPPORT_USED', { enemyId: enemy.id, targetEnemyId: target.id, supportKind: enemy.behavior });
  }

  function moveEnemy(enemy, angle, multiplier, fixedDelta, floor, room) {
    const slowMultiplier = getCampaignSlowMultiplier(getCampaignStatusStacks(enemy, 'slow'));
    const speed = Number(enemy.moveSpeed || 72) * multiplier * slowMultiplier;
    enemy.vx = Math.cos(angle) * speed;
    enemy.vy = Math.sin(angle) * speed;
    enemy.facing = enemy.vx < 0 ? -1 : 1;
    const minimum = Number(floor.wallThickness || 28) + Number(enemy.radius || 20);
    const maximumX = Number(floor.width || 900) - minimum;
    const maximumY = Number(floor.height || 700) - minimum;
    const desiredX = Math.max(minimum, Math.min(maximumX, enemy.x + enemy.vx * fixedDelta));
    const desiredY = Math.max(minimum, Math.min(maximumY, enemy.y + enemy.vy * fixedDelta));
    const collision = resolveRoomObstacleMovement(room, enemy, desiredX, desiredY);
    if (collision.blockedX) enemy.vx = 0;
    if (collision.blockedY) enemy.vy = 0;
    enemy.x = collision.x;
    enemy.y = collision.y;
  }

  function scaleAuthorityStatusDamage(state, enemy, key, rawDamage, status) {
    const owner = state.players?.[status?.ownerId];
    const loopNumber = Math.max(1, Math.floor((Math.max(1, Number(state.floorNumber || 1)) - 1) / MAX_FLOOR) + 1);
    let staged = Math.max(0, Number(rawDamage || 0));
    if (key === 'bleed' || key === 'fire') {
      staged = scaleCampaignDamage({
        damage: staged,
        enemy,
        itemStats: owner?.itemStats,
        attackPower: owner?.attackPower,
        attackerDamageMultiplier: Math.max(0.1, Number(owner?.damageMultiplier || 1)),
        isBoss: !!getEnemyDefinition(enemy.type)?.boss || !!enemy.miniBoss,
        hasBleed: getCampaignStatusStacks(enemy, 'bleed') > 0,
        applyBleedBonus: key !== 'bleed',
        glassCannon: !!state.matchRules?.glassCannon,
        loopNumber,
        enemyLoopDamageReduction: state.matchRules?.enemyLoopDamageReduction,
      });
    }
    if (key === 'bleed') {
      const divisor = getCampaignBleedResistance(enemy, {
        progressionDepth: Number(state.floorNumber || 1),
        maxFloor: MAX_FLOOR,
      });
      const innateResistance = Math.max(0, Math.min(0.8, Number(enemy.bleedResistance || 0)));
      staged = staged / divisor
        * Math.max(0.2, 1 - innateResistance)
        * Math.max(0, Number(state.matchRules?.enemyBleedDamageMultiplier ?? 1));
    }
    return scaleCampaignDamage({
      damage: Math.max(1, Math.round(staged)),
      enemy,
      raw: true,
      loopNumber,
      enemyLoopDamageReduction: state.matchRules?.enemyLoopDamageReduction,
    });
  }

  function updateAuthorityStatuses(state, fixedDelta, emitEvent) {
    const owners = Object.values(state.players || {}).filter(player => player && !player.downed && !player.disconnected);
    // The campaign adds each enemy's bleed contribution before ticking its
    // statuses. Preserve that frame ordering so the Scarf's drain has the
    // same final-tick behavior in an authority room.
    const totalBleedByRoom = {};
    Object.values(state.enemies || {}).forEach(enemy => {
      if (!enemy || enemy.dead) return;
      ensureCampaignStatuses(enemy);
      owners.forEach(player => {
        if (player.roomId !== enemy.roomId) return;
        const targetStacks = getCampaignHemesScarfPassiveBleedStacks(enemy, player.itemStats || {});
        const currentStacks = getCampaignStatusStacks(enemy, 'bleed');
        if (targetStacks > currentStacks) applyAuthorityStatus(state, enemy, 'bleed', targetStacks - currentStacks, 0.25, player.id);
      });
      totalBleedByRoom[enemy.roomId] = (totalBleedByRoom[enemy.roomId] || 0)
        + getCampaignStatusStacks(enemy, 'bleed');
      tickCampaignStatuses(enemy, fixedDelta, {
        maxHp: enemy.maxHealth,
        isDead: () => !!enemy.dead,
        dealDamage: (key, rawDamage, status) => {
          const damage = scaleAuthorityStatusDamage(state, enemy, key, rawDamage, status);
          damageEnemy(state, enemy, damage, status.ownerId, emitEvent, {
            attackKind: key,
            preScaled: true,
            canCrit: false,
          });
          return damage;
        },
      });
    });
    Object.values(state.players || {}).forEach(player => {
      if (!player || player.downed || player.disconnected) return;
      ensureCampaignStatuses(player);
      const stats = player.itemStats || {};
      tickCampaignStatuses(player, fixedDelta, {
        maxHp: player.maxHp,
        targetKind: 'player',
        fireResistance: Number(stats.fireResistance || 0),
        playerColdBudget: true,
        getDurationDecay: key => key === 'bleed' ? Number(stats.bleedDurationDecayMultiplier || 1) : 1,
        isDead: () => !!player.downed,
        dealDamage: (key, rawDamage, status) => {
          const resistance = key === 'bleed' ? Number(stats.bleedResistance || 0) : 0;
          const severity = Number(stats.negativeStatusMultiplier || 1);
          const damage = Math.max(0.25, rawDamage * Math.max(0.2, 1 - resistance) * severity);
          damagePlayer(state, player, damage, status.ownerId || key, emitEvent, key, {
            ignoreInv: true,
            noInvFrames: true,
          });
          return damage;
        },
      });
    });
    Object.values(state.players || {}).forEach(player => {
      if (!player || player.downed || player.disconnected) return;
      const totalBleed = totalBleedByRoom[player.roomId] || 0;
      const drain = advanceCampaignHemesScarfDrain(player, totalBleed, fixedDelta, { itemStats: player.itemStats });
      if (drain.started) emitEvent('ITEM_DAMAGE_EFFECT', { playerId: player.id, roomId: player.roomId, itemKey: 'hemes_scarf', kind: 'drain_started' });
      if (drain.heal > 0) emitEvent('PLAYER_HEALED', { playerId: player.id, roomId: player.roomId, source: 'hemes_scarf', healedAmount: drain.heal, health: player.hp });
    });
  }

  function updatePotionBathEffects(state, fixedDelta, emitEvent) {
    Object.values(state.players || {}).forEach(player => {
      if (!player || player.downed || player.disconnected) return;
      if (state.tick > Number(player.potionBathRegenUntilTick || 0)) return;
      player.potionBathRegenAccum = Number(player.potionBathRegenAccum || 0) + fixedDelta;
      const interval = Math.max(0.05, Number(player.potionBathRegenInterval || 0.5));
      while (player.potionBathRegenAccum >= interval) {
        player.potionBathRegenAccum -= interval;
        const before = Number(player.hp || 0);
        player.hp = Math.min(Number(player.maxHp || 100), before + Math.max(1, Number(player.potionBathRegenHeal || 0)));
        const healedAmount = player.hp - before;
        if (healedAmount > 0) emitEvent('POTION_BATH_REGEN', { playerId: player.id, healedAmount, health: player.hp });
      }
    });
  }

  // --- authored campaign enemy behaviors on the authority -------------------
  // The shared behavior bodies (SharedEnemyBehaviorSystem) are the campaign's
  // per-enemy state machines. This context adapts them to authoritative state:
  // players instead of Neo.player, state.projectiles instead of Neo.projectiles,
  // gameplay events instead of particles.
  const SHARED_ENEMY_BEHAVIOR_SET = new Set(SHARED_BEHAVIOR_TYPES);
  const behaviorRuntime = { state: null, emitEvent: () => {} };

  function livingRoomPlayers(state, roomId) {
    return Object.values(state.players || {})
      .filter(player => player && !player.downed && !player.disconnected && player.roomId === roomId);
  }

  function isPlayerConcealed(state, player) {
    const statusUntil = player.statusUntilTick || {};
    return state.tick < Number(statusUntil.cowards_way || 0)
      || state.tick < Number(statusUntil.flying_unhitable || 0)
      || state.tick < Number(player.potionBathConcealedUntilTick || 0)
      || state.tick < Number(player.equipmentEffectsUntilTick?.el_bartos_cape || 0);
  }

  function behaviorPlayerAlias(player) {
    return { id: player.id, x: Number(player.x), y: Number(player.y), r: Number(player.radius || 18) };
  }

  function obstacleRect(obstacle) {
    const width = Number(obstacle.w || obstacle.size || (Number(obstacle.r || 16) * 2));
    const height = Number(obstacle.h || obstacle.size || (Number(obstacle.r || 16) * 2));
    return { x: Number(obstacle.x) - width / 2, y: Number(obstacle.y) - height / 2, w: width, h: height };
  }

  function coverRectsForRoom(room) {
    const rects = (room?.structures || []).map(obstacleRect);
    (room?.destructibles || []).forEach(prop => {
      if (prop.broken || prop.hidden) return;
      if (prop.kind !== 'wall' && prop.kind !== 'secret_wall' && prop.kind !== 'cover_wall') return;
      rects.push(obstacleRect(prop));
    });
    return rects;
  }

  function playerBeamSegment(player) {
    const channel = player.beamChannel;
    if (!channel) return null;
    const range = Number(BEAM_CHANNEL_PROFILES[channel.moveKey]?.range || 430);
    return {
      x1: Number(player.x),
      y1: Number(player.y),
      x2: Number(player.x) + Math.cos(Number(channel.angle || 0)) * range,
      y2: Number(player.y) + Math.sin(Number(channel.angle || 0)) * range,
    };
  }

  // Boss-summoned minions (Queen's faithful, god council): full enemy records
  // with campaign behavior seeds, optional elite tag and health scaling.
  function spawnAuthorityMinion(state, summoner, type, x, y, options = {}, emitEvent = () => {}) {
    const definition = getEnemyDefinition(type) || getEnemyDefinition('cult_follower');
    const enemyId = state.allocateEntityId('enemy');
    const wall = Number(state.floorState?.wallThickness || 28) + Number(definition.radius || 12);
    const elite = !!options.elite;
    const healthScale = Math.max(0.1, Number(options.healthScale || 1)) * (elite ? 1.35 : 1);
    const health = Math.round(Number(definition.maxHealth || 40) * healthScale);
    state.enemies[enemyId] = {
      id: enemyId,
      type: definition.type,
      spriteKey: definition.spriteKey,
      behavior: definition.behavior,
      roomId: summoner.roomId,
      x: Math.max(wall, Math.min(Number(state.floorState?.width || 900) - wall, Number(x))),
      y: Math.max(wall, Math.min(Number(state.floorState?.height || 700) - wall, Number(y))),
      vx: 0, vy: 0,
      radius: definition.radius,
      moveSpeed: definition.moveSpeed,
      maxHealth: health,
      health,
      contactDamage: Math.round(Number(definition.contactDamage || 8) * (elite ? 1.18 : 1)),
      projectileDamage: Math.max(5, Math.round(Number(definition.contactDamage || 8) * 0.75)),
      elite,
      eliteTypes: elite ? ['knight'] : [],
      elitePowers: [],
      patterns: definition.patterns || [],
      boss: !!definition.boss,
      bleedImmune: !!definition.bleedImmune,
      fireImmune: !!definition.fireImmune,
      statuses: createCampaignStatusMap(),
      contactCooldownUntilTick: 0,
      attackCooldownUntilTick: state.tick + 12,
      attackWindupUntilTick: 0,
      state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
      summonedBy: summoner.id,
      stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
      attackCd: options.hastened ? Math.min(0.8, Number(definition.attackCooldown || 1)) : Number(definition.attackCooldown || 1),
      // Council bosses need their own kit seeds so their authored bodies run.
      ...(definition.type === 'queen_cult' ? { summonCd: 2.4, novaCd: 3, novaTimer: 0 } : {}),
      ...(definition.type === 'bulk_golem' ? { splitReady: true, aoeTime: 3, jumpCd: 1.2 } : {}),
      ...(definition.type === 'artificer_knave' ? { phase: 1 } : {}),
      ...(definition.type === 'antony_blemmye' ? { phase: 1, hammerCd: 1.55, biteCd: 1.15, slashCd: 2.05, deathBallCd: 5.4 } : {}),
    };
    state.floorState?.encounters?.[summoner.roomId]?.enemyIds?.push(enemyId);
    emitEvent('ENEMY_SPAWNED', { enemyId, roomId: summoner.roomId, enemyType: definition.type, summonedBy: summoner.id, elite });
    return state.enemies[enemyId];
  }

  function spawnAuthorityFloorBoss(state, spawner, emitEvent) {
    const random = combatRandomByState.get(state);
    const stream = random?.scoped?.(`floor-boss:type:${state.floorNumber}`);
    const bossType = getCampaignFloorBossType(state.floorNumber, stream ? () => stream.next() : authorityFallbackRandom);
    const definition = getEnemyDefinition(bossType) || getEnemyDefinition('queen_cult');
    const encounter = state.floorState?.encounters?.[spawner.roomId];
    delete state.enemies[spawner.id];
    const bossId = state.allocateEntityId('enemy');
    // The campaign spawns the summoned boss at 72% of its normal health.
    const health = Math.round(Number(definition.maxHealth || 900) * 0.72);
    state.enemies[bossId] = {
      id: bossId,
      type: definition.type,
      spriteKey: definition.spriteKey,
      behavior: definition.behavior,
      roomId: spawner.roomId,
      x: spawner.x,
      y: spawner.y,
      vx: 0, vy: 0,
      radius: definition.radius,
      moveSpeed: definition.moveSpeed,
      maxHealth: health,
      health,
      contactDamage: definition.contactDamage,
      projectileDamage: Math.max(5, Math.round(Number(definition.contactDamage || 12) * 0.75)),
      elite: false, eliteTypes: [], elitePowers: [],
      patterns: definition.patterns || [],
      boss: true,
      bleedImmune: !!definition.bleedImmune,
      fireImmune: !!definition.fireImmune,
      statuses: createCampaignStatusMap(),
      contactCooldownUntilTick: 0,
      attackCooldownUntilTick: state.tick + 20,
      attackWindupUntilTick: 0,
      state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
      stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
      attackCd: Number(definition.attackCooldown || 1.2),
    };
    encounter?.enemyIds?.push(bossId);
    emitEvent('ENEMY_SPAWNED', { enemyId: bossId, roomId: spawner.roomId, enemyType: definition.type, summonedBy: spawner.id, boss: true });
    announceAuthorityBossIntro(state, state.enemies[bossId], emitEvent);
  }

  const enemyBehaviors = typeof createCampaignEnemyBehaviors === 'function' ? createCampaignEnemyBehaviors({
    getPlayer(enemy) {
      const players = livingRoomPlayers(behaviorRuntime.state, enemy.roomId)
        .filter(player => !isPlayerConcealed(behaviorRuntime.state, player));
      if (!players.length) return null;
      players.sort((first, second) => (
        Math.hypot(first.x - enemy.x, first.y - enemy.y) - Math.hypot(second.x - enemy.x, second.y - enemy.y)
      ));
      return behaviorPlayerAlias(players[0]);
    },
    getPlayers(enemy) {
      return livingRoomPlayers(behaviorRuntime.state, enemy.roomId).map(behaviorPlayerAlias);
    },
    getAllies(enemy) {
      return livingEncounterEnemies(behaviorRuntime.state, enemy.roomId)
        .filter(candidate => candidate.id !== enemy.id)
        .map(ally => {
          // The authored bodies read the campaign's hp/max aliases; allies that
          // have not run their own authored tick yet may not carry them.
          ally.hp = Number(ally.health || 0);
          ally.max = Math.max(1, Number(ally.maxHealth || 1));
          return ally;
        });
    },
    getTuning() {
      const difficulty = behaviorRuntime.state.matchRules?.difficulty || {};
      return {
        reaction: Number(difficulty.enemyReactionMultiplier || 1),
        rangedCadence: Number(difficulty.rangedCadenceMultiplier || 1),
        supportPower: Number(difficulty.supportPowerMultiplier || 1),
      };
    },
    getEvadeDifficultyRank() {
      // Campaign easy=0 … god=4; co-op defaults to medium's rank so plain
      // enemies keep a small juke chance like the campaign's standard runs.
      return Math.max(0, Math.trunc(Number(behaviorRuntime.state.matchRules?.difficulty?.evadeRank ?? 1)));
    },
    getFloor() {
      return Math.max(1, Number(behaviorRuntime.state.floorNumber || 1));
    },
    random(scope) {
      const service = combatRandomByState.get(behaviorRuntime.state);
      return service ? service.next(scope || 'encounter') : 0.5;
    },
    getSlowMultiplier(enemy) {
      return getCampaignSlowMultiplier(getCampaignStatusStacks(enemy, 'slow'));
    },
    bounds() {
      const floor = behaviorRuntime.state.floorState || {};
      return {
        wall: Number(floor.wallThickness || 28),
        width: Number(floor.width || 900),
        height: Number(floor.height || 700),
      };
    },
    isBlocked(enemy, x, y, r) {
      const room = currentRoom(behaviorRuntime.state, enemy.roomId);
      return (room?.structures || []).some(obstacle => circleIntersectsRoomObstacle(x, y, r, obstacle))
        || (room?.destructibles || []).some(obstacle => (
          !obstacle.broken && !obstacle.hidden && circleIntersectsRoomObstacle(x, y, r, obstacle)
        ));
    },
    getCoverRects(enemy) {
      return coverRectsForRoom(currentRoom(behaviorRuntime.state, enemy.roomId));
    },
    getHostileThreat(enemy, padding = 30) {
      const state = behaviorRuntime.state;
      for (const player of livingRoomPlayers(state, enemy.roomId)) {
        const segment = playerBeamSegment(player);
        if (!segment) continue;
        if (segmentHitsCircle(segment.x1, segment.y1, segment.x2, segment.y2, enemy.x, enemy.y, Number(enemy.radius || 18) + padding)) {
          return { segment, sourceId: `beam:${player.id}:${player.beamChannel.startTick}` };
        }
      }
      let best = null;
      Object.values(state.projectiles || {}).forEach(projectile => {
        if (projectile.hostile || projectile.roomId !== enemy.roomId) return;
        const vx = Number(projectile.vx || 0);
        const vy = Number(projectile.vy || 0);
        const speedSq = vx * vx + vy * vy;
        if (speedSq < 1600) return;
        const life = Math.max(0, (Number(projectile.expiresTick || 0) - state.tick) / 20);
        if (life <= 0) return;
        const dx = enemy.x - projectile.x;
        const dy = enemy.y - projectile.y;
        const toward = dx * vx + dy * vy;
        if (toward <= 0) return;
        const horizon = Math.min(0.7, Math.max(0.12, life));
        const timeToImpact = Math.max(0, Math.min(horizon, toward / speedSq));
        if (timeToImpact <= 0 || timeToImpact >= horizon) return;
        const projectedX = projectile.x + vx * timeToImpact;
        const projectedY = projectile.y + vy * timeToImpact;
        const dangerRadius = Number(enemy.radius || 18) + Number(projectile.radius || 0) + padding;
        if (Math.hypot(projectedX - enemy.x, projectedY - enemy.y) > dangerRadius) return;
        if (!best || timeToImpact < best.timeToImpact) {
          best = {
            segment: { x1: projectile.x, y1: projectile.y, x2: projectile.x + vx * horizon, y2: projectile.y + vy * horizon },
            sourceId: projectile.id,
            timeToImpact,
          };
        }
      });
      return best;
    },
    isPointThreatenedByPlayerBeam(enemy, x, y, radius = 24) {
      return livingRoomPlayers(behaviorRuntime.state, enemy.roomId).some(player => {
        const segment = playerBeamSegment(player);
        return segment && !!segmentHitsCircle(segment.x1, segment.y1, segment.x2, segment.y2, x, y, radius);
      });
    },
    damagePlayer(enemy, playerRef, damage, angle, knockback, source) {
      const state = behaviorRuntime.state;
      const player = state.players?.[playerRef.id];
      if (!player) return;
      if (enemy.networkBeamStrugglePlayerId === player.id && state.beamStruggles?.[player.id]) return;
      damagePlayer(state, player, damage, enemy.id, behaviorRuntime.emitEvent, source || enemy.type, { angle, knockback });
    },
    applyPlayerStatus(enemy, playerRef, key, stacks, duration) {
      const state = behaviorRuntime.state;
      const player = state.players?.[playerRef.id];
      if (player) applyAuthorityStatus(state, player, key, stacks, duration, enemy.id);
    },
    healEnemy(enemy, target, amount) {
      const gained = Math.min(
        Math.max(0, Number(target.maxHealth || target.max || 0) - Number(target.health || 0)),
        Math.max(0, Number(amount || 0)),
      );
      if (gained <= 0) return 0;
      target.health = Number(target.health || 0) + gained;
      target.hp = target.health;
      behaviorRuntime.emitEvent('ENEMY_HEALED', { enemyId: target.id, healerEnemyId: enemy.id, amount: gained, health: target.health });
      return gained;
    },
    grantBarrier(_enemy, target, amount) {
      const next = Math.max(0, Math.round(Number(amount || 0)));
      if (next > Number(target.barrier || 0)) {
        target.barrier = next;
        target.barrierAge = 0;
      }
    },
    spawnProjectile(enemy, descriptor) {
      const state = behaviorRuntime.state;
      const projectileId = state.allocateEntityId('projectile');
      state.projectiles[projectileId] = {
        id: projectileId,
        type: descriptor.kind || 'enemy_shot',
        ownerId: enemy.id,
        hostile: true,
        roomId: enemy.roomId,
        x: Number(descriptor.x), y: Number(descriptor.y),
        vx: Number(descriptor.vx), vy: Number(descriptor.vy),
        radius: Number(descriptor.r || 6),
        damage: Number(descriptor.damage || enemy.projectileDamage || 9),
        knockback: Number(descriptor.knockback || 120),
        statusEffects: Array.isArray(descriptor.statusEffects) ? descriptor.statusEffects : undefined,
        enemyBlast: descriptor.enemyBlast ? { ...descriptor.enemyBlast } : null,
        // Homing boss shots (Queen missiles, god swords) steer via the shared
        // projectile system; drain shots heal their owner on hit.
        ...(descriptor.homing ? {
          homing: true,
          homingTurnRate: Number(descriptor.homingTurnRate || 1.6),
          homingSpeed: Number(descriptor.homingSpeed || 280),
          homingAccel: Number(descriptor.homingAccel || 2.2),
        } : {}),
        ...(Number(descriptor.drainHeal || 0) > 0 ? { drainHeal: Number(descriptor.drainHeal) } : {}),
        behavior: enemy.behavior,
        attackKind: descriptor.source || enemy.type,
        spawnTick: state.tick,
        expiresTick: state.tick + Math.max(4, Math.round(Number(descriptor.life || 1.4) * 20)),
      };
      behaviorRuntime.emitEvent('ENEMY_ATTACKED', { enemyId: enemy.id, attackKind: descriptor.source || enemy.type, projectileId });
      return projectileId;
    },
    blastRadius(enemy, x, y, radius, damage, knockback, options = {}) {
      const state = behaviorRuntime.state;
      livingRoomPlayers(state, enemy.roomId).forEach(player => {
        const playerDistance = Math.hypot(player.x - x, player.y - y);
        if (playerDistance > radius + Number(player.radius || 18)) return;
        const angle = Math.atan2(player.y - y, player.x - x);
        // Optional distance falloff (Queen finisher: 5x at center → 1x at edge).
        const falloff = options.playerDamageFalloff;
        const scaled = falloff
          ? damage * (Number(falloff.centerMultiplier || 1)
            + (Number(falloff.edgeMultiplier || 1) - Number(falloff.centerMultiplier || 1))
            * Math.max(0, Math.min(1, playerDistance / Math.max(1, radius))))
          : damage;
        damagePlayer(state, player, Math.round(scaled), enemy.id, behaviorRuntime.emitEvent, `${enemy.type}_blast`, {
          angle,
          knockback,
          // The Cult Queen's explicitly telegraphed death-finisher is the one
          // authored exception: it must not be nullified by an unrelated hit
          // that happened just before the detonation.
          ignoreInv: !!options.playerDamageFalloff,
        });
      });
      behaviorRuntime.emitEvent('ENEMY_ATTACKED', {
        enemyId: enemy.id, attackKind: `${enemy.type}_blast`, originX: x, originY: y, effectRadius: radius,
      });
    },
    speak(enemy, text) {
      behaviorRuntime.emitEvent('ENEMY_SPOKE', { enemyId: enemy.id, roomId: enemy.roomId, text: String(text || '').slice(0, 120) });
    },
    holdAtOneHp(enemy) {
      enemy.health = Math.max(1, Number(enemy.health || 0));
      enemy.hp = enemy.health;
    },
    killEnemy(enemy) {
      damageEnemy(behaviorRuntime.state, enemy, Number(enemy.health || 0) + Number(enemy.barrier || 0) + 1, undefined, behaviorRuntime.emitEvent, {
        preScaled: true,
        canCrit: false,
        attackKind: `${enemy.type}_finisher`,
      });
    },
    spawnMinion(enemy, type, x, y, options = {}) {
      spawnAuthorityMinion(behaviorRuntime.state, enemy, type, x, y, options, behaviorRuntime.emitEvent);
    },
    spawnHazard(enemy, hazard) {
      const room = currentRoom(behaviorRuntime.state, enemy.roomId);
      if (!room) return;
      room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
      room.hazards.push({ ...hazard, ownerId: enemy.id });
    },
    spawnLightningColumns(enemy, playerRef, damage) {
      // Elite Lightning Columns mode: two pillars land near the target and
      // pulse a few times, matching the SP elite trait's authored hazard.
      const state = behaviorRuntime.state;
      const bounds = {
        wall: Number(state.floorState?.wallThickness || 28),
        width: Number(state.floorState?.width || 900),
        height: Number(state.floorState?.height || 700),
      };
      const service = combatRandomByState.get(state);
      const rand = (min, max) => min + (service ? service.next('encounter') : authorityFallbackRandom()) * (max - min);
      for (let index = 0; index < 2; index += 1) {
        this.spawnHazard(enemy, {
          kind: 'lightning_column',
          enemy: true,
          source: enemy.type || 'lightning_column',
          x: Math.max(bounds.wall + 60, Math.min(bounds.width - bounds.wall - 60, Number(playerRef.x) + rand(-70, 70))),
          y: Math.max(bounds.wall + 60, Math.min(bounds.height - bounds.wall - 60, Number(playerRef.y) + rand(-70, 70))),
          r: 46, ttl: 1.25, tick: 0, interval: 0.36, damage: Math.round(damage),
        });
      }
    },
    getElapsedSeconds() {
      return Number(behaviorRuntime.state.elapsedSeconds || Number(behaviorRuntime.state.tick || 0) / 20);
    },
    spawnSummon(enemy, type, x, y) {
      spawnSummonedEnemy(behaviorRuntime.state, enemy, behaviorRuntime.emitEvent, { type, x, y });
    },
    spawnFloorBoss(enemy) {
      spawnAuthorityFloorBoss(behaviorRuntime.state, enemy, behaviorRuntime.emitEvent);
    },
    emit(eventType, data) {
      const roomId = behaviorRuntime.state?.enemies?.[data?.enemyId]?.roomId;
      behaviorRuntime.emitEvent(eventType, roomId ? { roomId, ...data } : data);
    },
  }) : null;

  // Enemy shield decay, mirroring the campaign: after 5s a barrier bleeds away
  // at 20 points per second. Age resets whenever the barrier grows.
  function decayAuthorityEnemyBarrier(enemy, fixedDelta) {
    if (Number(enemy.barrier || 0) <= 0) {
      enemy.barrierAge = 0;
      return;
    }
    enemy.barrierAge = Number(enemy.barrierAge || 0) + fixedDelta;
    if (enemy.barrierAge > 5) {
      enemy.barrier = Math.max(0, Number(enemy.barrier || 0) - 20 * fixedDelta);
    }
  }

  // Campaign parity: minor enemies fighting in a pack press harder together.
  // Mirrors updateMinorEnemyPackPressure() in game/enemies.js — same eligible
  // types, 260px radius, 3-ally cap and per-stack multipliers. The shared
  // steerEnemy body already reads minorPackSpeedMultiplier; without this nothing
  // ever set it, so packed rooms were measurably softer in multiplayer.
  const MINOR_PACK_ENEMY_TYPES = new Set(['hunter', 'charger', 'laser', 'cult_follower']);
  const MINOR_PACK_RADIUS = 260;
  const MINOR_PACK_MAX_ALLIES = 3;

  function updateMinorEnemyPackPressure(state, enemy) {
    const eligible = enemy
      && MINOR_PACK_ENEMY_TYPES.has(enemy.type)
      && !enemy.elite
      && !enemy.miniBoss
      && !enemy.dead;
    if (!eligible) {
      if (enemy) {
        enemy.minorPackStacks = 0;
        enemy.minorPackSpeedMultiplier = 1;
        enemy.minorPackCooldownRate = 1;
        enemy.minorPackDamageMultiplier = 1;
      }
      return 0;
    }
    let nearbyAllies = 0;
    const allies = state.enemies || {};
    for (const key of Object.keys(allies)) {
      if (nearbyAllies >= MINOR_PACK_MAX_ALLIES) break;
      const ally = allies[key];
      if (!ally
        || ally === enemy
        || ally.dead
        || ally.elite
        || ally.miniBoss
        || ally.roomId !== enemy.roomId
        || !MINOR_PACK_ENEMY_TYPES.has(ally.type)) {
        continue;
      }
      if (Math.hypot(enemy.x - ally.x, enemy.y - ally.y) <= MINOR_PACK_RADIUS) nearbyAllies += 1;
    }
    const stacks = Math.min(MINOR_PACK_MAX_ALLIES, nearbyAllies);
    enemy.minorPackStacks = stacks;
    enemy.minorPackSpeedMultiplier = 1 + stacks * 0.04;
    enemy.minorPackCooldownRate = 1 + stacks * 0.06;
    enemy.minorPackDamageMultiplier = 1 + stacks * 0.03;
    return stacks;
  }

  function updateAuthoredEnemy(state, enemy, fixedDelta, emitEvent, floor) {
    // Campaign alias fields + per-tick timers (mirrors update.js's enemy wrapper).
    enemy.r = Number(enemy.radius || 18);
    enemy.speed = Number(enemy.moveSpeed || 96);
    enemy.dmg = Number(enemy.contactDamage || 10);
    enemy.hp = Number(enemy.health || 0);
    enemy.max = Math.max(1, Number(enemy.maxHealth || 1));
    enemy.stun = Math.max(0, (Number(enemy.stunnedUntilTick || 0) - state.tick) / 20);
    // Pack pressure also shortens the gap between attacks (campaign core/update.js).
    enemy.attackCd = Math.max(0, Number(enemy.attackCd || 0)
      - fixedDelta * Math.max(1, Number(enemy.minorPackCooldownRate || 1)));
    const foldGodInvulnerability = () => {
      if (Number(enemy.inv || 0) > 0) {
        enemy.invulnerableUntilTick = Math.max(Number(enemy.invulnerableUntilTick || 0), state.tick + Math.round(Number(enemy.inv) * 20));
        enemy.inv = 0;
      }
    };
    if (state.tick < Number(enemy.confusedBlindUntilTick || 0)) {
      enemy.vx *= 0.8;
      enemy.vy *= 0.8;
      enemy.state = 'confused';
    } else {
      const playersInRoom = livingRoomPlayers(state, enemy.roomId);
      if (!playersInRoom.length) {
        if (!enemy.preserveOffscreenImpulse) {
          enemy.vx = 0;
          enemy.vy = 0;
        }
        enemy.state = 'idle';
        return;
      }
      delete enemy.preserveOffscreenImpulse;
      if (playersInRoom.every(player => isPlayerConcealed(state, player))) {
        // Every hero is hidden (cape/flight/coward's way): roam and blind-fire
        // exactly like the campaign instead of freezing in place.
        enemyBehaviors.wanderEnemy(enemy, fixedDelta);
      } else {
        const eliteControlled = enemyBehaviors.updateEliteEnemyTraits(enemy, fixedDelta);
        if (!enemy.dead && !eliteControlled) {
          invokeCampaignEnemyAI(enemy, fixedDelta, enemyBehaviors);
        }
      }
    }
    // The god body sets `inv` in seconds during phase shifts; fold that into the
    // authoritative invulnerability tick so damageEnemy honors it this same tick.
    foldGodInvulnerability();
    if (enemy.dead || !state.enemies[enemy.id]) return;
    decayAuthorityEnemyBarrier(enemy, fixedDelta);
    const slowMultiplier = getCampaignSlowMultiplier(getCampaignStatusStacks(enemy, 'slow'));
    // Protect-trial seekers use the shared post-AI steering override just as
    // campaign does: their authored attack body can still run, but movement
    // converges on the ward instead of silently chasing a hero.
    const obelisk = currentRoom(state, enemy.roomId)?.challengeData?.obelisk;
    applyCampaignObeliskSeekerSteering(enemy, obelisk, fixedDelta, { speed: enemy.speed || enemy.moveSpeed || 90 });
    const minimum = Number(floor.wallThickness || 28) + enemy.r;
    const maximumX = Number(floor.width || 900) - minimum;
    const maximumY = Number(floor.height || 700) - minimum;
    if (enemy.airborne) {
      // Airborne bosses (Bulk Golem's jump) move on their scripted arc: clamp
      // to bounds only, no obstacle collisions mid-flight — like moveCircle.
      enemy.x = Math.max(minimum, Math.min(maximumX, enemy.x));
      enemy.y = Math.max(minimum, Math.min(maximumY, enemy.y));
      return;
    }
    const desiredX = Math.max(minimum, Math.min(maximumX, enemy.x + enemy.vx * fixedDelta * slowMultiplier));
    const desiredY = Math.max(minimum, Math.min(maximumY, enemy.y + enemy.vy * fixedDelta * slowMultiplier));
    const collision = resolveRoomObstacleMovement(currentRoom(state, enemy.roomId), enemy, desiredX, desiredY);
    if (collision.blockedX) enemy.vx *= -0.4;
    if (collision.blockedY) enemy.vy *= -0.4;
    enemy.x = collision.x;
    enemy.y = collision.y;
    if (Math.abs(enemy.vx) > 1) enemy.facing = enemy.vx < 0 ? -1 : 1;
    // Bodies that self-modify hp (Queen finisher hold-at-1, Antony bite-heal)
    // write the alias; fold it back to authoritative health.
    if (Number(enemy.hp) !== Number(enemy.health)) enemy.health = Math.max(0, Number(enemy.hp || 0));
  }

  function createAuthorityMirrorProjectile(state, enemy, angle, options = {}) {
    const projectileId = state.allocateEntityId('projectile');
    const mirrorStats = enemy.mirrorItemStats || {};
    const speed = Math.max(1, Number(options.speed || 760) * Math.max(0.1, Number(mirrorStats.projectileSpeedMultiplier || 1)));
    const explicitHoming = Object.prototype.hasOwnProperty.call(options, 'homing');
    const homingStrength = Math.max(0, Number(mirrorStats.projectileHomingStrength || 0));
    const grantedHoming = !explicitHoming && homingStrength > 0;
    const genericStatusEffects = () => {
      const effects = [];
      const bleedChance = Number(mirrorStats.bleedChance || 0) + Math.min(0.35, Number(mirrorStats.scarfBleedsOnHit || 0) * 0.08);
      if (bleedChance > 0) effects.push({ key: 'bleed', chance: bleedChance, stacks: 1, duration: 4.2 });
      if (Number(mirrorStats.snakeKnifePoisonChance || 0) > 0) effects.push({ key: 'poison', chance: Number(mirrorStats.snakeKnifePoisonChance), stacks: 1, duration: 4.2 });
      if (Number(mirrorStats.weaponFatigueChance || 0) > 0) effects.push({ key: 'slow', chance: Number(mirrorStats.weaponFatigueChance), stacks: 1, duration: 4 });
      const stunChance = Number(mirrorStats.confuseRayStunChance || 0) + Number(mirrorStats.weaponFatigueFreezeChance || 0);
      if (stunChance > 0) effects.push({ key: 'stun', chance: stunChance, stacks: 1, duration: 0.55 });
      if (Number(options.fireStacks || 0) > 0) effects.push({ key: 'fire', chance: 1, stacks: Number(options.fireStacks), duration: Number(options.fireDuration || 3.2) });
      return effects;
    };
    state.projectiles[projectileId] = {
      id: projectileId, type: options.type || 'mirror_shot', kind: options.kind || options.type || 'mirror_shot', ownerId: enemy.id, hostile: true, roomId: enemy.roomId,
      x: Number.isFinite(Number(options.originX)) ? Number(options.originX) : Number(enemy.x) + Math.cos(angle) * (Number(enemy.radius || 16) + 7),
      y: Number.isFinite(Number(options.originY)) ? Number(options.originY) : Number(enemy.y) + Math.sin(angle) * (Number(enemy.radius || 16) + 7),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: Number(options.radius || 6),
      damage: Math.max(1, Number(options.damage || enemy.contactDamage || 20)),
      knockback: Math.max(0, Number(options.knockback || 120) * Number(mirrorStats.knockbackMultiplier || 1)), attackKind: options.attackKind || 'mirror_weapon',
      spawnTick: state.tick, expiresTick: state.tick + Math.max(1, Math.ceil(Number(options.life || 1) * 20)),
      remainingPierces: Math.max(0, Number(options.pierce || 0)), hitEnemyIds: [],
      fireStacks: Number(options.fireStacks || 0), fireDuration: Number(options.fireDuration || 0),
      splashFireStacks: Math.max(0, Number(options.splashFireStacks || 0)),
      splash: Math.max(0, Number(options.splash || 0)), splashDamage: Math.max(0, Number(options.splashDamage || 0)),
      aoeRadius: Math.max(0, Number(options.aoeRadius || 0)),
      sparkleChance: Math.max(0, Math.min(1, Number(options.sparkleChance || 0))),
      hitOptions: options.hitOptions ? { ...options.hitOptions } : null,
      statusEffects: Array.isArray(options.statusEffects) ? options.statusEffects.map(effect => ({ ...effect })) : genericStatusEffects(),
      enemyBlast: options.enemyBlast ? { ...options.enemyBlast } : null,
      bouncesRemaining: Math.max(0, Math.floor(Number(options.bouncesRemaining || 0))) + Math.max(0, Math.floor(Number(mirrorStats.projectileBounces || 0))),
      homing: explicitHoming ? !!options.homing : grantedHoming, homingTargetId: options.homingTargetId || null,
      homingRadius: Math.max(0, Number(options.homingRadius ?? (grantedHoming ? 220 + homingStrength * 1400 : 0))),
      homingSpeed: Math.max(0, Number(options.homingSpeed ?? (grantedHoming ? speed : 0))),
      homingAccel: Math.max(0, Number(options.homingAccel ?? (grantedHoming ? 1.2 + homingStrength * 6 : 0))),
      homingTurnRate: Math.max(0, Number(options.homingTurnRate ?? (grantedHoming ? 0.75 + homingStrength * 3.5 : 0))),
      subSpawn: options.subSpawn ? {
        ...options.subSpawn,
        nextSpawnTick: state.tick + Math.max(1, Number(options.subSpawn.intervalSeconds || 0.2) * 20),
      } : null,
    };
    return projectileId;
  }

  function updateAuthorityRivalJusticeBlades(state, enemy, fixedDelta, emitEvent) {
    const blades = enemy.rivalJusticeBlades;
    if (!Array.isArray(blades) || blades.length === 0) return;
    const target = nearestLivingPlayer(state, enemy).player;
    const effect = enemy.rivalJusticeEffect || planCampaignBladeJustice({
      aimDirection: Number(enemy.beamAngle || 0), baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * 0.72)),
    });
    enemy.rivalJusticeEffect = effect;
    let write = 0;
    for (let read = 0; read < blades.length; read += 1) {
      const blade = blades[read];
      const step = advanceCampaignBladeJustice(blade, {
        effect, delta: fixedDelta,
        aimDirection: target ? Math.atan2(target.y - enemy.y, target.x - enemy.x) : Number(blade.aim || 0),
        playerX: enemy.x, playerY: enemy.y,
      });
      if (!step.active) continue;
      blade.hitCooldownUntilTick = Math.max(0, Number(blade.hitCooldownUntilTick || 0));
      livingRoomPlayers(state, enemy.roomId).forEach(player => {
        if (state.tick < blade.hitCooldownUntilTick) return;
        if (Math.hypot(player.x - blade.x, player.y - blade.y) > Number(effect.radius || 16) + Number(player.radius || 18)) return;
        blade.hitCooldownUntilTick = state.tick + Math.max(1, Math.ceil(Number(effect.contactCooldownSeconds || 0.22) * 20));
        damagePlayer(state, player, effect.damage, enemy.id, emitEvent, 'blade_justice', {
          angle: Math.atan2(player.y - enemy.y, player.x - enemy.x), knockback: effect.knockback,
        });
      });
      blades[write++] = blade;
    }
    blades.length = write;
  }

  function updateAuthorityMirrorChampion(state, enemy, fixedDelta, emitEvent, floor) {
    const target = nearestLivingPlayer(state, enemy);
    if (!target.player) { enemy.vx = 0; enemy.vy = 0; enemy.state = 'idle'; return; }
    const player = target.player;
    if (enemy.type === 'rival') updateAuthorityRivalJusticeBlades(state, enemy, fixedDelta, emitEvent);
    const angle = Math.atan2(Number(player.y) - Number(enemy.y), Number(player.x) - Number(enemy.x));
    const decrement = key => { enemy[key] = Math.max(0, Number(enemy[key] || 0) - fixedDelta); };
    decrement('attackCd'); decrement('mirrorLaserCd'); decrement('mirrorSmashCd'); decrement('mirrorDashCd');
    const moveEnemyToward = (moveX, moveY, acceleration = 6.2) => {
      const speed = Math.max(0, Number(enemy.speed || enemy.moveSpeed || 228))
        * (state.tick < Number(enemy.rivalHasteUntilTick || 0) ? 1.55 : 1);
      const blend = Math.min(1, Math.max(0, acceleration * fixedDelta));
      enemy.vx = Number(enemy.vx || 0) + (moveX * speed - Number(enemy.vx || 0)) * blend;
      enemy.vy = Number(enemy.vy || 0) + (moveY * speed - Number(enemy.vy || 0)) * blend;
      const inset = Number(floor.wallThickness || 28) + Number(enemy.radius || 16);
      const desiredX = Math.max(inset, Math.min(Number(floor.width || 900) - inset, Number(enemy.x) + enemy.vx * fixedDelta));
      const desiredY = Math.max(inset, Math.min(Number(floor.height || 700) - inset, Number(enemy.y) + enemy.vy * fixedDelta));
      const collision = resolveRoomObstacleMovement(currentRoom(state, enemy.roomId), enemy, desiredX, desiredY);
      if (collision.blockedX) enemy.vx *= -0.4;
      if (collision.blockedY) enemy.vy *= -0.4;
      enemy.x = collision.x;
      enemy.y = collision.y;
    };
    // The campaign's rival stance machine runs before any mirror action. This
    // prevents a guarded rival from becoming a multiplayer-only instant boss,
    // and gives low-health non-vendettas the same one-retreat-per-floor escape.
    const isRival = enemy.type === 'rival';
    const rivalBrain = isRival ? (enemy.rivalBrain || (enemy.rivalBrain = createCampaignRivalBrain(enemy.rivalCharacterKey))) : null;
    const rivalMemory = isRival ? (enemy.rivalMemory || (enemy.rivalMemory = { retreats: 0, warningsGiven: 0, provocations: 0, lastOutcome: 'Encountered the party' })) : null;
    const playerItemCount = Object.values(player.items || {}).reduce((total, count) => total + Math.max(0, Number(count || 0)), 0);
    const hasLineOfSight = enemyBehaviors?.hasLineOfSight
      ? enemyBehaviors.hasLineOfSight(enemy, enemy.x, enemy.y, player.x, player.y) : true;
    const disposition = isRival && resolveCampaignRivalDisposition({
      characterKey: enemy.rivalCharacterKey, brain: rivalBrain, friend: enemy.rivalFriend,
      vendetta: enemy.rivalVendetta, rivalRumbleStage: enemy.rivalRumbleStage,
      floorNumber: state.floorNumber, elapsedSeconds: Number(state.tick || 0) / 20,
      perception: {
        hpRatio: Number(enemy.health || 0) / Math.max(1, Number(enemy.maxHealth || 1)),
        hasLineOfSight, distance: target.distance,
        playerHpRatio: Number(player.hp || 0) / Math.max(1, Number(player.maxHp || 1)), playerItemCount,
      },
      hasHealingWeapon: false, claimedPickupPresent: false,
    });
    if (disposition?.transition) {
      rivalMemory.lastOutcome = disposition.reason;
      if (disposition.transition === 'warning') rivalMemory.warningsGiven = Number(rivalMemory.warningsGiven || 0) + 1;
      if (disposition.transition === 'hostile') rivalMemory.provocations = Number(rivalMemory.provocations || 0) + 1;
      emitEvent('RIVAL_DISPOSITION_CHANGED', {
        enemyId: enemy.id, roomId: enemy.roomId, stance: rivalBrain.stance,
        intention: rivalBrain.intention, reason: disposition.reason,
      });
    }
    // Campaign friends remain live world actors: they loosely shadow the hero
    // but never enter the hostile mirror action body. Freezing them at their
    // friendship position made multiplayer allies visibly and mechanically
    // unlike the campaign counterpart.
    if (enemy.rivalFriend) {
      if (target.distance > 170) moveEnemyToward(Math.cos(angle) * 0.8, Math.sin(angle) * 0.8, 3.4);
      else if (target.distance < 70) moveEnemyToward(-Math.cos(angle) * 0.5, -Math.sin(angle) * 0.5, 3.0);
      else { enemy.vx *= 0.9; enemy.vy *= 0.9; }
      enemy.beamTime = 0;
      enemy.state = 'friendly';
      return;
    }
    if (isRival && rivalBrain.intention === 'retreat') {
      const room = currentRoom(state, enemy.roomId);
      if (!enemy.rivalRetreatExit) {
        const inset = Number(floor.wallThickness || 28) + Number(enemy.radius || 16) + 12;
        const doorPoint = direction => ({
          n: { x: Number(floor.width || 900) / 2, y: inset }, s: { x: Number(floor.width || 900) / 2, y: Number(floor.height || 700) - inset },
          e: { x: Number(floor.width || 900) - inset, y: Number(floor.height || 700) / 2 }, w: { x: inset, y: Number(floor.height || 700) / 2 },
        })[direction];
        enemy.rivalRetreatExit = ['n', 's', 'e', 'w'].map(direction => {
          const nextRoom = getConnectedAuthorityRoom(state, room, direction);
          const point = doorPoint(direction);
          return nextRoom && !['boss', 'god'].includes(nextRoom.type) ? {
            direction, roomId: nextRoom.id, point, safety: Math.hypot(point.x - player.x, point.y - player.y),
          } : null;
        }).filter(Boolean).sort((first, second) => second.safety - first.safety || first.direction.localeCompare(second.direction))[0] || null;
      }
      const exit = enemy.rivalRetreatExit;
      if (!exit) {
        rivalBrain.retreatFloor = Number(state.floorNumber || 0);
        rivalBrain.stance = 'hostile'; rivalBrain.intention = 'engage';
      } else {
        const dx = exit.point.x - enemy.x; const dy = exit.point.y - enemy.y;
        const distance = Math.hypot(dx, dy) || 1;
        moveEnemyToward(dx / distance * 1.08, dy / distance * 1.08, 5.2);
        enemy.state = 'retreating';
        if (distance > Number(enemy.radius || 16) + 16) return;
        const nextRoom = currentRoom(state, exit.roomId);
        const opposite = { n: 's', s: 'n', e: 'w', w: 'e' }[exit.direction];
        const entry = { n: { x: Number(floor.width || 900) / 2, y: Number(floor.wallThickness || 28) + enemy.radius + 12 }, s: { x: Number(floor.width || 900) / 2, y: Number(floor.height || 700) - Number(floor.wallThickness || 28) - enemy.radius - 12 }, e: { x: Number(floor.width || 900) - Number(floor.wallThickness || 28) - enemy.radius - 12, y: Number(floor.height || 700) / 2 }, w: { x: Number(floor.wallThickness || 28) + enemy.radius + 12, y: Number(floor.height || 700) / 2 } }[opposite];
        enemy.roomId = nextRoom?.id || enemy.roomId; enemy.x = entry.x; enemy.y = entry.y;
        enemy.vx = 0; enemy.vy = 0; delete enemy.rivalRetreatExit;
        rivalBrain.retreatFloor = Number(state.floorNumber || 0);
        rivalBrain.stance = enemy.rivalVendetta ? 'hostile' : 'neutral';
        rivalBrain.intention = enemy.rivalVendetta ? 'engage' : 'observe';
        rivalMemory.retreats = Number(rivalMemory.retreats || 0) + 1;
        rivalMemory.lastOutcome = 'retreated';
        emitEvent('RIVAL_RETREATED', { enemyId: enemy.id, roomId: enemy.roomId, direction: exit.direction });
        return;
      }
    }
    if (isRival && rivalBrain.stance !== 'hostile') {
      // Campaign guarded rivals avoid crowding the party while they warn or
      // observe. They cannot enter any mirrored attack body until provoked.
      if (target.distance < 155) moveEnemyToward(-Math.cos(angle) * 0.72, -Math.sin(angle) * 0.72, 3.5);
      else if (target.distance < 290) moveEnemyToward(Math.cos(angle + Math.PI / 2) * 0.34, Math.sin(angle + Math.PI / 2) * 0.34, 2.6);
      else { enemy.vx *= 0.9; enemy.vy *= 0.9; }
      enemy.state = rivalBrain.stance === 'warning' ? 'warning' : 'observing';
      return;
    }
    const finishWindup = () => {
      const kind = enemy.mirrorPendingAction;
      delete enemy.mirrorPendingAction;
      if (kind === 'laser') {
        if (enemy.type !== 'rival' && enemy.mirrorPendingLaser === 'power_disks') {
          const damage = Math.max(1, Math.round(Number(
            enemy.mirrorMoveStats?.power_disks?.damage
            ?? MOVE_BASE_STATS.power_disks?.damage
            ?? enemy.beamDamage
            ?? enemy.contactDamage
            ?? 20,
          )));
          for (let index = 0; index < 8; index += 1) {
            createAuthorityMirrorProjectile(state, enemy, index * (Math.PI * 2 / 8), {
              type: 'disk', attackKind: 'mirror_disk', speed: 300, radius: 7,
              life: 1.1, damage, knockback: 110,
            });
          }
          enemy.attackCd = 0.42;
          enemy.state = 'mirrorPowerDisks';
          return true;
        }
        if (enemy.type !== 'rival' && enemy.mirrorPendingLaser === 'blade_justice') {
          const damage = Math.max(1, Math.round(Number(
            enemy.mirrorMoveStats?.blade_justice?.damage
            ?? MOVE_BASE_STATS.blade_justice?.damage
            ?? enemy.beamDamage
            ?? enemy.contactDamage
            ?? 34,
          )));
          livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
            const candidateAngle = Math.atan2(candidate.y - enemy.y, candidate.x - enemy.x);
            if (Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) > 124 + Number(candidate.radius || 18)
              || angleDifference(candidateAngle, angle) > 1.35) return;
            damagePlayer(state, candidate, damage, enemy.id, emitEvent, 'mirror_blade', {
              angle: candidateAngle, knockback: 280,
            });
          });
          enemy.attackCd = 0.42;
          enemy.state = 'mirrorBladeJustice';
          return true;
        }
        if (enemy.type !== 'rival' && enemy.mirrorPendingLaser === 'lightning_columns') {
          const damage = Math.max(1, Math.round(Number(
            enemy.mirrorMoveStats?.lightning_columns?.damage
            ?? MOVE_BASE_STATS.lightning_columns?.damage
            ?? enemy.beamDamage
            ?? enemy.contactDamage
            ?? 18,
          )));
          const room = currentRoom(state, enemy.roomId);
          if (room) {
            room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
            [-38, 38].forEach((offset, index) => room.hazards.push({
              id: `${enemy.id}:mirror-lightning:${state.tick}:${index}`,
              kind: 'lightning_column', enemy: true, ownerId: enemy.id, source: 'mirror_lightning',
              x: Number(player.x) + Math.cos(angle + Math.PI / 2) * offset,
              y: Number(player.y) + Math.sin(angle + Math.PI / 2) * offset,
              r: 48, ttl: 3.6, tick: 0.18, interval: 0.42, damage,
            }));
          }
          enemy.attackCd = 0.42;
          enemy.state = 'mirrorLightningColumns';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingLaser === 'love_bomb_laser') {
          const bombWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'laser' && entry.key === 'love_bomb_laser');
          const bomb = planCampaignLoveBomb({
            rival: true,
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(bombWeapon?.damageMult || 1))),
            beamDamageMultiplier: Number(enemy.mirrorItemStats?.beamDamageMultiplier || 1),
            aoeRadiusMultiplier: Number(enemy.mirrorItemStats?.aoeRadiusMultiplier || 1),
            originX: enemy.x, originY: enemy.y, targetX: player.x, targetY: player.y, range: 420,
          });
          createAuthorityMirrorProjectile(state, enemy, angle, {
            type: bomb.kind, attackKind: 'love_bomb_laser', speed: bomb.speed, radius: bomb.radius,
            life: bomb.lifeSeconds, damage: bomb.damage, knockback: bomb.knockback,
            aoeRadius: bomb.aoeRadius, sparkleChance: bomb.sparkleChance,
            originX: Number(enemy.x) + Math.cos(angle) * (Number(enemy.radius || 16) + bomb.radius),
            originY: Number(enemy.y) + Math.sin(angle) * (Number(enemy.radius || 16) + bomb.radius),
          });
          enemy.attackCd = 0.42;
          enemy.state = 'rivalLoveBomb';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingLaser === 'power_disks') {
          const diskWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'laser' && entry.key === 'power_disks');
          createPowerDiskBurstDescriptors({
            characterKey: enemy.rivalCharacterKey,
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(diskWeapon?.damageMult || 1))),
            damageMultiplier: Number(enemy.mirrorItemStats?.beamDamageMultiplier || 1),
          }).forEach(disk => {
            createAuthorityMirrorProjectile(state, enemy, disk.angle, {
              type: disk.kind, attackKind: 'power_disks', speed: disk.speed,
              radius: disk.radius, life: disk.lifeSeconds, damage: disk.damage,
              knockback: 110, hitOptions: disk.hitOptions, subSpawn: disk.subSpawn,
            });
          });
          enemy.attackCd = 0.42;
          enemy.state = 'rivalPowerDisks';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingLaser === 'nail_shot') {
          const nailWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'laser' && entry.key === 'nail_shot');
          const service = combatRandomByState.get(state);
          planCampaignNailShot({
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(nailWeapon?.damageMult || 1))),
            beamDamageMultiplier: Number(enemy.mirrorItemStats?.beamDamageMultiplier || 1),
            random: () => service ? service.next('encounter') : 0.5,
          }).forEach(nail => {
            createAuthorityMirrorProjectile(state, enemy, nail.angle, {
              type: 'nail', attackKind: 'nail_shot', speed: nail.speed, radius: nail.radius,
              life: nail.lifeSeconds, damage: nail.damage, knockback: nail.knockback,
              bouncesRemaining: nail.bouncesRemaining, hitOptions: nail.hitOptions,
            });
          });
          enemy.attackCd = 0.42;
          enemy.state = 'rivalNailShot';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingLaser === 'blade_justice') {
          const justice = planCampaignBladeJustice({
            aimDirection: angle,
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * 0.72)),
          });
          enemy.rivalJusticeEffect = justice;
          enemy.rivalJusticeBlades = justice.blades.map(blade => ({
            ...blade, life: justice.durationSeconds, maxLife: justice.durationSeconds,
            radius: justice.radius, reach: justice.reach, x: enemy.x, y: enemy.y,
            angle, hitCooldownUntilTick: 0,
          }));
          enemy.attackCd = 0.35;
          enemy.state = 'rivalBladeJustice';
          return true;
        }
        const beamProfile = BEAM_CHANNEL_PROFILES[enemy.mirrorPendingLaser] || {};
        enemy.mirrorBeamUntilTick = state.tick + Math.round((enemy.mirrorPendingLaser === 'god_sweep' ? 1.05
          : Number(beamProfile.duration || (enemy.mirrorPendingLaser === 'turtle_wave' ? 0.86 : enemy.mirrorPendingLaser === 'love_beam' ? 0.92 : 0.64))) * 20);
        enemy.mirrorBeamNextTick = state.tick;
        enemy.beamAngle = angle;
        enemy.rivalBeamMove = enemy.mirrorPendingLaser;
        enemy.state = 'mirrorLaser';
      } else if (kind === 'smash') {
        // A copied champion carries the activating hero's item-derived proc
        // stats. Campaign rolls Homing Missile before resolving every mirror
        // smash, including the special smash bodies below.
        if (enemy.type !== 'rival' && Number(enemy.mirrorItemStats?.homingMissileChance || 0) > 0) {
          const stream = combatRandomByState.get(state)?.scoped(`${enemy.id}|mirror-homing-missile:${state.tick}`);
          if ((stream ? stream.next() : 1) < Number(enemy.mirrorItemStats.homingMissileChance)) {
            [-0.12, 0.12].forEach(offset => createAuthorityMirrorProjectile(state, enemy, angle + offset, {
              type: 'homing_missile', attackKind: 'mirror_homing_missile', speed: 780, radius: 6,
              life: 2.4, damage: 20, knockback: 120,
              homing: true, homingSpeed: 1290, homingAccel: 3.8, homingTurnRate: 3.5, homingRadius: 960,
              statusEffects: [{ key: 'fire', chance: 0.05, stacks: 1, duration: 2.8 }],
            }));
          }
        }
        if (enemy.type !== 'rival' && enemy.mirrorPendingSmash === 'chaos_burst') {
          const damage = Math.max(16, Math.round(Number(
            enemy.mirrorMoveStats?.chaos_burst?.damage
            ?? MOVE_BASE_STATS.chaos_burst?.damage
            ?? enemy.smashDamage
            ?? enemy.contactDamage
            ?? 16,
          ) * 0.62));
          const stream = combatRandomByState.get(state)?.scoped(`${enemy.id}|mirror-chaos:${state.tick}`);
          for (let index = 0; index < 4; index += 1) {
            const eruptionAngle = angle + (index - 1.5) * 0.38;
            const distance = (stream ? stream.next() : 0.5) * 92 - 46;
            const x = Number(player.x) + Math.cos(eruptionAngle) * distance;
            const y = Number(player.y) + Math.sin(eruptionAngle) * distance;
            livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
              if (Math.hypot(candidate.x - x, candidate.y - y) > 58 + Number(candidate.radius || 18)) return;
              damagePlayer(state, candidate, damage, enemy.id, emitEvent, 'mirror_chaos', {
                angle: Math.atan2(candidate.y - y, candidate.x - x), knockback: 120,
              });
            });
          }
          enemy.attackCd = 0.75;
          enemy.state = 'mirrorChaosBurst';
          return true;
        }
        if (enemy.type !== 'rival' && enemy.mirrorPendingSmash === 'healing_zone') {
          const damage = Math.max(10, Math.round(Number(
            enemy.mirrorMoveStats?.healing_zone?.damage
            ?? MOVE_BASE_STATS.healing_zone?.damage
            ?? enemy.smashDamage
            ?? enemy.contactDamage
            ?? 10,
          )));
          enemy.health = Math.min(Number(enemy.maxHealth || 1), Number(enemy.health || 0) + Number(enemy.maxHealth || 1) * 0.08);
          enemy.hp = enemy.health;
          livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
            if (Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) > 118 + Number(candidate.radius || 18)) return;
            damagePlayer(state, candidate, damage, enemy.id, emitEvent, 'mirror_zone', {
              angle: Math.atan2(candidate.y - enemy.y, candidate.x - enemy.x), knockback: 120,
            });
          });
          enemy.attackCd = 0.75;
          enemy.state = 'mirrorHealingZone';
          return true;
        }
        if (enemy.type !== 'rival' && ['fire_circle', 'floor_lava'].includes(enemy.mirrorPendingSmash)) {
          const moveKey = enemy.mirrorPendingSmash;
          const damage = Math.max(12, Math.round(Number(
            enemy.mirrorMoveStats?.[moveKey]?.damage
            ?? MOVE_BASE_STATS[moveKey]?.damage
            ?? enemy.smashDamage
            ?? enemy.contactDamage
            ?? 12,
          )));
          const radius = moveKey === 'floor_lava' ? 156 : 108;
          const fireStacks = moveKey === 'floor_lava' ? 2 : 1;
          livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
            if (Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) > radius + Number(candidate.radius || 18)) return;
            damagePlayer(state, candidate, damage, enemy.id, emitEvent, 'mirror_fire', {
              angle: Math.atan2(candidate.y - enemy.y, candidate.x - enemy.x), knockback: 150,
            });
            applyAuthorityStatus(state, candidate, 'fire', fireStacks, 3.2, enemy.id);
          });
          enemy.attackCd = 0.75;
          enemy.state = 'mirrorFire';
          return true;
        }
        if (enemy.type !== 'rival' && enemy.mirrorPendingSmash === 'kicky_kick') {
          const damage = Math.max(84, Math.round(Number(
            enemy.mirrorMoveStats?.kicky_kick?.damage
            ?? MOVE_BASE_STATS.kicky_kick?.damage
            ?? enemy.smashDamage
            ?? enemy.contactDamage
            ?? 84,
          )));
          livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
            if (Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) > 142 + Number(candidate.radius || 18)) return;
            damagePlayer(state, candidate, damage, enemy.id, emitEvent, 'mirror_kick', {
              angle: Math.atan2(candidate.y - enemy.y, candidate.x - enemy.x), knockback: 680,
            });
          });
          enemy.vx -= Math.cos(angle) * 210;
          enemy.vy -= Math.sin(angle) * 210;
          enemy.attackCd = 0.75;
          enemy.state = 'mirrorKickyKick';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingSmash === 'random_pounce') {
          const pounceWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'smash' && entry.key === 'random_pounce');
          const pounceDamage = Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(pounceWeapon?.damageMult || 1)));
          const service = combatRandomByState.get(state);
          const pounce = planCampaignRandomPounce({
            originX: enemy.x, originY: enemy.y, entities: livingRoomPlayers(state, enemy.roomId),
            burstBaseDamage: pounceDamage, fangBaseDamage: Math.round(pounceDamage * 0.5),
            random: () => service ? service.next('encounter') : 0.5,
          });
          livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
            const distance = Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y);
            if (distance > pounce.radius + Number(candidate.radius || 18)) return;
            damagePlayer(state, candidate, pounce.burstDamage, enemy.id, emitEvent, 'random_pounce', {
              angle: Math.atan2(candidate.y - enemy.y, candidate.x - enemy.x), knockback: 260,
            });
          });
          pounce.fangs.forEach(fang => createAuthorityMirrorProjectile(state, enemy, fang.angle, {
            type: 'fang', attackKind: 'random_pounce', speed: fang.speed, radius: fang.radius,
            life: fang.lifeSeconds, damage: fang.damage, knockback: fang.knockback,
            homing: fang.homing, homingTargetId: fang.targetId, homingRadius: fang.homingRadius,
            homingSpeed: fang.homingSpeed, homingAccel: fang.homingAccel, homingTurnRate: fang.homingTurnRate,
            hitOptions: fang.hitOptions,
          }));
          enemy.attackCd = 0.52;
          enemy.state = 'rivalRandomPounce';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingSmash === 'death_ball') {
          const ballWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'smash' && entry.key === 'death_ball');
          const ball = planCampaignDeathBall({
            chargeRatio: 0.75,
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(ballWeapon?.damageMult || 1))),
            damageMultiplier: Number(enemy.mirrorItemStats?.damageMultiplier || 1),
            aoeRadiusMultiplier: Number(enemy.mirrorItemStats?.aoeRadiusMultiplier || 1),
          });
          createAuthorityMirrorProjectile(state, enemy, angle, {
            type: ball.kind, attackKind: 'death_ball', speed: ball.speed, radius: ball.radius,
            life: ball.lifeSeconds, damage: ball.damage, knockback: ball.knockback, pierce: ball.pierce,
            originX: Number(enemy.x) + Math.cos(angle) * (Number(enemy.radius || 16) + ball.radius * 0.4),
            originY: Number(enemy.y) + Math.sin(angle) * (Number(enemy.radius || 16) + ball.radius * 0.4),
          });
          enemy.vx -= Math.cos(angle) * ball.recoil;
          enemy.vy -= Math.sin(angle) * ball.recoil;
          enemy.attackCd = 0.75;
          enemy.state = 'rivalDeathBall';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingSmash === 'healing_zone') {
          const hpRatio = Number(enemy.health || 0) / Math.max(1, Number(enemy.maxHealth || 1));
          if (hpRatio < 0.82) {
            const zone = resolveCampaignHealingZone({ rival: true });
            const room = currentRoom(state, enemy.roomId);
            if (room) {
              room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
              room.hazards.push({
                kind: 'healing_zone', enemy: true, ownerId: enemy.id, source: enemy.rivalCharacterKey || 'gelleh',
                x: enemy.x, y: enemy.y, r: zone.radius, ttl: zone.durationSeconds, tick: 0,
                healPerSecond: zone.healPerSecond, damagePerSecond: zone.damagePerSecond, damageInterval: zone.pulseIntervalSeconds,
              });
            }
            enemy.attackCd = 0.75;
            enemy.state = 'rivalHealingZone';
            return true;
          }
          enemy.attackCd = 0.18;
          enemy.state = 'mirrorMove';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingSmash === 'kicky_kick') {
          const kickWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'smash' && entry.key === 'kicky_kick');
          const kick = resolveCampaignKickyKick({
            rival: true,
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(kickWeapon?.damageMult || 1))),
          });
          livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
            if (Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) > kick.radius + Number(candidate.radius || 18)) return;
            damagePlayer(state, candidate, kick.damage, enemy.id, emitEvent, 'kicky_kick', {
              angle: Math.atan2(candidate.y - enemy.y, candidate.x - enemy.x), knockback: kick.blastKnockback,
            });
          });
          enemy.vx -= Math.cos(angle) * kick.playerRecoil;
          enemy.vy -= Math.sin(angle) * kick.playerRecoil;
          enemy.attackCd = 0.75;
          enemy.state = 'rivalKickyKick';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingSmash === 'crimson_smash') {
          const smashWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'smash' && entry.key === 'crimson_smash');
          const smash = planCampaignGroundSmash({
            rival: true, moveKey: 'crimson_smash',
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(smashWeapon?.damageMult || 1))),
            aimDirection: angle,
            random: () => combatRandomByState.get(state)?.next('combat-variance') ?? 0.5,
          });
          livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
            if (Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) > smash.radius + Number(candidate.radius || 18)) return;
            damagePlayer(state, candidate, smash.damage, enemy.id, emitEvent, 'crimson_smash', {
              angle: Math.atan2(candidate.y - enemy.y, candidate.x - enemy.x), knockback: smash.knockback,
            });
          });
          smash.projectileDescriptors.forEach(rock => createAuthorityMirrorProjectile(state, enemy, rock.angle, {
            type: 'rock', attackKind: 'crimson_smash', speed: rock.speed, radius: rock.radius,
            life: rock.lifeSeconds, damage: rock.damage, knockback: rock.knockback, pierce: rock.pierce,
            originX: Number(enemy.x) + Math.cos(rock.angle) * rock.spawnDistance,
            originY: Number(enemy.y) + Math.sin(rock.angle) * rock.spawnDistance,
            statusEffects: rock.hitOptions?.bleedChance ? [{ key: 'bleed', chance: rock.hitOptions.bleedChance, stacks: rock.hitOptions.bleedStacks, duration: rock.hitOptions.bleedDuration }] : [],
          }));
          enemy.attackCd = 0.75;
          enemy.state = 'rivalCrimsonSmash';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingSmash === 'mooggy_hairball') {
          const hairballWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'smash' && entry.key === 'mooggy_hairball');
          const hairball = resolveCampaignMooggyHairball({
            rival: true,
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(hairballWeapon?.damageMult || 1))),
            aoeRadiusMultiplier: Number(enemy.mirrorItemStats?.aoeRadiusMultiplier || 1),
            aoeDamageMultiplier: Number(enemy.mirrorItemStats?.aoeDamageMultiplier || 1),
          });
          livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
            if (Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) > hairball.radius + Number(candidate.radius || 18)) return;
            damagePlayer(state, candidate, hairball.damage, enemy.id, emitEvent, 'mooggy_hairball', {
              angle: Math.atan2(candidate.y - enemy.y, candidate.x - enemy.x), knockback: hairball.knockback,
            });
            applyAuthorityStatus(state, candidate, 'poison', hairball.poisonStacks, hairball.poisonDurationSeconds, enemy.id);
            applyAuthorityStatus(state, candidate, 'slow', hairball.slowStacks, hairball.slowDurationSeconds, enemy.id);
          });
          enemy.attackCd = 0.75;
          enemy.state = 'rivalMooggyHairball';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingSmash === 'turtle_powerup') {
          const powerUp = resolveCampaignTurtlePowerUp({ rival: true, maxHealth: enemy.maxHealth, barrier: enemy.barrier });
          enemy.barrier = powerUp.barrier;
          enemy.rivalDeathBallPowerUp = true;
          enemy.attackCd = 0.75;
          enemy.state = 'rivalTurtlePowerUp';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingSmash === 'potion_bath') {
          const bathWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'smash' && entry.key === 'potion_bath');
          const stream = combatRandomByState.get(state)?.scoped(`${enemy.id}|potion-bath:${state.tick}`);
          const bath = planCampaignPotionBath({
            rival: true, maxHp: enemy.maxHealth,
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(bathWeapon?.damageMult || 1))),
            randomAngle: () => stream ? stream.next() : 0.5,
            randomDistance: () => stream ? stream.next() : 0.5,
          });
          enemy.health = Math.min(Number(enemy.maxHealth || 1), Number(enemy.health || 0) + bath.immediateHeal);
          enemy.hp = enemy.health;
          enemy.invulnerableUntilTick = Math.max(Number(enemy.invulnerableUntilTick || 0), state.tick + Math.ceil(bath.invulnerabilitySeconds * 20));
          bath.bursts.forEach(burst => {
            const x = enemy.x + Math.cos(burst.angle) * burst.distance;
            const y = enemy.y + Math.sin(burst.angle) * burst.distance;
            livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
              if (Math.hypot(candidate.x - x, candidate.y - y) > burst.radius + Number(candidate.radius || 18)) return;
              damagePlayer(state, candidate, burst.damage, enemy.id, emitEvent, 'potion_bath', {
                angle: Math.atan2(candidate.y - y, candidate.x - x), knockback: burst.knockback,
              });
            });
          });
          enemy.attackCd = 0.75;
          enemy.state = 'rivalPotionBath';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingSmash === 'holy_turrets') {
          const turretWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'smash' && entry.key === 'holy_turrets');
          const turrets = planCampaignHolyTurrets({
            originX: enemy.x, originY: enemy.y, angle,
            wall: floor.wallThickness, roomWidth: floor.width, roomHeight: floor.height,
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(turretWeapon?.damageMult || 1))),
            aoeRadiusMultiplier: Number(enemy.mirrorItemStats?.aoeRadiusMultiplier || 1),
            aoeDamageMultiplier: Number(enemy.mirrorItemStats?.aoeDamageMultiplier || 1),
          });
          const room = currentRoom(state, enemy.roomId);
          if (room) {
            room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
            turrets.forEach((turret, index) => room.hazards.push({
              id: `${enemy.id}:holy-turret:${state.tick}:${index}`, kind: 'holy_turret', enemy: true,
              ownerId: enemy.id, source: 'holy_turrets', x: turret.x, y: turret.y, r: turret.radius,
              ttl: turret.durationSeconds, tick: 0, interval: turret.intervalSeconds, range: turret.range,
              burstRadius: turret.burstRadius, damage: turret.damage, aimAngle: turret.aimAngle, recoil: 0,
            }));
          }
          enemy.attackCd = 0.75;
          enemy.state = 'rivalHolyTurrets';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingSmash === 'excalibur_strike') {
          const swordWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'smash' && entry.key === 'excalibur_strike');
          const stream = combatRandomByState.get(state)?.scoped(`${enemy.id}|excalibur:${state.tick}`);
          const swords = planCampaignExcaliburStrike({
            targetX: player.x, targetY: player.y, wall: floor.wallThickness, roomWidth: floor.width, roomHeight: floor.height,
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(swordWeapon?.damageMult || 1))),
            aoeRadiusMultiplier: Number(enemy.mirrorItemStats?.aoeRadiusMultiplier || 1),
            aoeDamageMultiplier: Number(enemy.mirrorItemStats?.aoeDamageMultiplier || 1),
            random: () => stream ? stream.next() : 0.5,
          });
          const room = currentRoom(state, enemy.roomId);
          if (room) {
            room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
            swords.forEach((sword, index) => room.hazards.push({
              id: `${enemy.id}:excalibur:${state.tick}:${index}`, kind: 'excalibur_strike', enemy: true,
              ownerId: enemy.id, source: 'excalibur_strike', x: sword.x, y: sword.y, r: sword.radius,
              damage: sword.damage, impactDelay: sword.delaySeconds + sword.fallSeconds, impacted: false,
              angle: sword.angle, spin: sword.spin, ttl: sword.delaySeconds + sword.fallSeconds + sword.hoverSeconds + sword.fadeSeconds,
            }));
          }
          enemy.attackCd = 0.75;
          enemy.state = 'rivalExcaliburStrike';
          return true;
        }
        if (enemy.type === 'rival' && enemy.mirrorPendingSmash === 'chaos_burst') {
          const chaosWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'smash' && entry.key === 'chaos_burst');
          const chaos = resolveCampaignChaosBurst({
            baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(chaosWeapon?.damageMult || 1) * 0.62)),
            aoeRadiusMultiplier: Number(enemy.mirrorItemStats?.aoeRadiusMultiplier || 1),
            aoeDamageMultiplier: Number(enemy.mirrorItemStats?.aoeDamageMultiplier || 1),
          });
          const room = currentRoom(state, enemy.roomId);
          const stream = combatRandomByState.get(state)?.scoped(`${enemy.id}|chaos:initial:${state.tick}`);
          if (room) {
            room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
            room.hazards.push({
              id: `${enemy.id}:chaos:${state.tick}`, kind: 'chaos_burst', enemy: true, ownerId: enemy.id,
              followEnemy: true, source: enemy.rivalCharacterKey || 'metao', x: enemy.x, y: enemy.y,
              r: chaos.fieldRadius, ttl: chaos.durationSeconds, tick: 0, interval: chaos.intervalSeconds,
              damage: chaos.burstDamage, poisonDurationSeconds: chaos.poisonDurationSeconds,
            });
          }
          for (let index = 0; index < chaos.initialBurstCount; index += 1) {
            const eruption = planCampaignChaosEruption({
              originX: player.x, originY: player.y, baseDamage: chaos.burstDamage,
              random: () => stream ? stream.next() : 0.5,
            });
            livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
              if (Math.hypot(candidate.x - eruption.x, candidate.y - eruption.y) > eruption.radius + Number(candidate.radius || 18)) return;
              damagePlayer(state, candidate, eruption.damage, enemy.id, emitEvent, 'chaos_burst', {
                angle: Math.atan2(candidate.y - eruption.y, candidate.x - eruption.x), knockback: 120,
              });
              applyAuthorityStatus(state, candidate, 'poison', 1, eruption.poisonDurationSeconds, enemy.id);
            });
          }
          enemy.attackCd = 0.75;
          enemy.state = 'rivalChaosBurst';
          return true;
        }
        const radius = enemy.mirrorPendingSmash === 'kicky_kick' ? 142 : 156;
        if (target.distance <= radius + Number(player.radius || 18)) {
          damagePlayer(state, player, Math.max(Number(enemy.smashDamage || 0), Number(enemy.contactDamage || 20)), enemy.id, emitEvent, 'mirror_smash', {
            angle, knockback: enemy.mirrorPendingSmash === 'kicky_kick' ? 680 : 300,
          });
        }
        enemy.attackCd = 0.75;
        enemy.state = 'mirrorSmash';
      } else if (kind === 'dash') {
        if (enemy.mirrorPendingDash === 'warp') {
          const room = currentRoom(state, enemy.roomId);
          const landing = resolveCampaignBlinkDestination({
            originX: enemy.x, originY: enemy.y,
            targetX: Number(player.x) - Math.cos(angle) * 72,
            targetY: Number(player.y) - Math.sin(angle) * 72,
            radius: enemy.radius, width: floor.width, height: floor.height, wall: floor.wallThickness,
            maxSearchRadius: 130, searchStep: 16,
            isBlocked: (x, y, radius) => (room?.structures || []).some(obstacle => (
              circleIntersectsRoomObstacle(x, y, radius, obstacle)
            )) || (room?.destructibles || []).some(obstacle => (
              !obstacle.broken && !obstacle.hidden && circleIntersectsRoomObstacle(x, y, radius, obstacle)
            )),
          });
          if (landing) {
            enemy.x = landing.x;
            enemy.y = landing.y;
          }
          enemy.invulnerableUntilTick = Math.max(Number(enemy.invulnerableUntilTick || 0), state.tick + Math.ceil(0.5 * 20));
        } else if (enemy.mirrorPendingDash === 'nimrod_stomp') {
          const room = currentRoom(state, enemy.roomId);
          const landing = resolveCampaignBlinkDestination({
            originX: enemy.x, originY: enemy.y, targetX: player.x, targetY: player.y,
            radius: enemy.radius, width: floor.width, height: floor.height, wall: floor.wallThickness,
            maxSearchRadius: 90, searchStep: 14,
            isBlocked: (x, y, radius) => (room?.structures || []).some(obstacle => (
              circleIntersectsRoomObstacle(x, y, radius, obstacle)
            )) || (room?.destructibles || []).some(obstacle => (
              !obstacle.broken && !obstacle.hidden && circleIntersectsRoomObstacle(x, y, radius, obstacle)
            )),
          });
          if (landing) {
            enemy.x = landing.x;
            enemy.y = landing.y;
          }
          const damage = Math.max(1, Math.round(Number(
            enemy.mirrorMoveStats?.nimrod_stomp?.damage
            ?? MOVE_BASE_STATS.nimrod_stomp?.damage
            ?? enemy.contactDamage
            ?? 46,
          )));
          livingRoomPlayers(state, enemy.roomId).forEach(candidate => {
            if (Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) > 112 + Number(candidate.radius || 18)) return;
            damagePlayer(state, candidate, damage, enemy.id, emitEvent, 'mirror_stomp', { angle, knockback: 310 });
          });
          enemy.attackCd = 0.34;
          enemy.state = 'mirrorNimrodStomp';
          return true;
        } else if (enemy.type === 'rival' && enemy.mirrorPendingDash === 'flying_unhitable') {
          const durationSeconds = FLYING_UNTOUCHABLE_DURATION_SECONDS;
          enemy.rivalFlightUntilTick = Math.max(Number(enemy.rivalFlightUntilTick || 0), state.tick + Math.ceil(durationSeconds * 20));
          enemy.invulnerableUntilTick = Math.max(Number(enemy.invulnerableUntilTick || 0), enemy.rivalFlightUntilTick);
          enemy.vx = 0;
          enemy.vy = 0;
          enemy.attackCd = 0.34;
          enemy.state = 'rivalFlight';
          return true;
        } else if (enemy.mirrorPendingDash === 'flying_unhitable') {
          enemy.invulnerableUntilTick = Math.max(Number(enemy.invulnerableUntilTick || 0), state.tick + Math.ceil(1.2 * 20));
          enemy.speed = Math.max(Number(enemy.speed || 0), 260);
          enemy.attackCd = 0.34;
          enemy.state = 'mirrorFlight';
          return true;
        } else if (enemy.mirrorPendingDash === 'cowards_way') {
          // The shared mirror body grants Coward's Way a short concealed
          // invulnerability window rather than converting it into a dash.
          enemy.invulnerableUntilTick = Math.max(
            Number(enemy.invulnerableUntilTick || 0),
            state.tick + Math.ceil(0.7 * 20),
          );
          enemy.speed = Math.max(Number(enemy.speed || 0), 260);
          enemy.attackCd = 0.34;
          enemy.state = 'mirrorCowardsWay';
          return true;
        } else if (enemy.type === 'rival' && enemy.mirrorPendingDash === 'princess_shield') {
          const shield = resolveCampaignPrincessShield({ maxHp: enemy.maxHealth, barrier: enemy.barrier });
          enemy.barrier = shield.barrier;
          enemy.attackCd = 0.34;
          enemy.state = 'rivalPrincessShield';
          return true;
        } else if (enemy.type === 'rival' && enemy.mirrorPendingDash === 'mooggy_zoomies') {
          enemy.rivalHasteUntilTick = Math.max(Number(enemy.rivalHasteUntilTick || 0), state.tick + Math.ceil(12 * 20));
          enemy.attackCd = 0.34;
          enemy.state = 'rivalMooggyZoomies';
          return true;
        } else if (enemy.type !== 'rival' && enemy.mirrorPendingDash === 'zip_lightning') {
          enemy.mirrorDashUntilTick = state.tick + Math.round(0.16 * 20);
          enemy.mirrorDashMove = 'zip_lightning';
          enemy.dashAngle = angle;
          enemy.attackCd = 0.34;
          enemy.state = 'mirrorZipLightning';
          return true;
        } else if (enemy.type === 'rival' && enemy.mirrorPendingDash === 'zip_lightning') {
          const room = currentRoom(state, enemy.roomId);
          const safeLanding = point => resolveCampaignBlinkDestination({
            originX: enemy.x, originY: enemy.y, targetX: point.x, targetY: point.y,
            radius: enemy.radius, width: floor.width, height: floor.height, wall: floor.wallThickness,
            maxSearchRadius: 90, searchStep: 14,
            isBlocked: (x, y, radius) => (room?.structures || []).some(obstacle => (
              circleIntersectsRoomObstacle(x, y, radius, obstacle)
            )) || (room?.destructibles || []).some(obstacle => (
              !obstacle.broken && !obstacle.hidden && circleIntersectsRoomObstacle(x, y, radius, obstacle)
            )),
          });
          const dashWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'dash' && entry.key === 'zip_lightning');
          const damage = Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(dashWeapon?.damageMult || 1)));
          const plan = planCampaignZipLightning({
            entities: livingRoomPlayers(state, enemy.roomId), originX: enemy.x, originY: enemy.y,
            targetX: player.x, targetY: player.y, fallbackAngle: angle, playerRadius: enemy.radius,
            level: Number(enemy.level || 1), resolveLanding: safeLanding,
          });
          plan.hops.forEach(hop => {
            enemy.x = hop.x;
            enemy.y = hop.y;
            if (hop.target?.downed) return;
            damagePlayer(state, hop.target, damage, enemy.id, emitEvent, 'zip_lightning', {
              angle: Math.atan2(hop.target.y - enemy.y, hop.target.x - enemy.x), knockback: 185,
            });
          });
          if (plan.fallback) {
            enemy.x = plan.fallback.x;
            enemy.y = plan.fallback.y;
          }
          enemy.invulnerableUntilTick = Math.max(Number(enemy.invulnerableUntilTick || 0), state.tick + Math.ceil(0.26 * 20));
          enemy.attackCd = 0.34;
          enemy.state = 'rivalZipLightning';
          return true;
        } else if (enemy.type === 'rival' && enemy.mirrorPendingDash === 'knight_slash_dash') {
          const room = currentRoom(state, enemy.roomId);
          const safeLanding = (point, context = {}) => {
            const resolve = target => resolveCampaignBlinkDestination({
              originX: enemy.x, originY: enemy.y, targetX: target.x, targetY: target.y,
              radius: enemy.radius, width: floor.width, height: floor.height, wall: floor.wallThickness,
              maxSearchRadius: 90, searchStep: 14,
              isBlocked: (x, y, radius) => (room?.structures || []).some(obstacle => (
                circleIntersectsRoomObstacle(x, y, radius, obstacle)
              )) || (room?.destructibles || []).some(obstacle => (
                !obstacle.broken && !obstacle.hidden && circleIntersectsRoomObstacle(x, y, radius, obstacle)
              )),
            });
            return resolve(point) || (context.alternate ? resolve(context.alternate) : null);
          };
          const dashWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'dash' && entry.key === 'knight_slash_dash');
          const damage = Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(dashWeapon?.damageMult || 1)));
          const plan = planCampaignKnightSlashDash({
            entities: livingRoomPlayers(state, enemy.roomId), originX: enemy.x, originY: enemy.y,
            targetX: player.x, targetY: player.y, fallbackAngle: angle, playerRadius: enemy.radius, resolveLanding: safeLanding,
          });
          plan.hops.forEach(hop => {
            enemy.x = hop.x;
            enemy.y = hop.y;
            if (hop.target?.downed) return;
            damagePlayer(state, hop.target, damage, enemy.id, emitEvent, 'knight_slash_dash', {
              angle: Math.atan2(hop.target.y - enemy.y, hop.target.x - enemy.x), knockback: 170,
            });
            applyAuthorityStatus(state, hop.target, 'bleed', 3, 5, enemy.id);
          });
          if (plan.fallback) {
            enemy.x = plan.fallback.x;
            enemy.y = plan.fallback.y;
          }
          enemy.invulnerableUntilTick = Math.max(Number(enemy.invulnerableUntilTick || 0), state.tick + Math.ceil(0.26 * 20));
          enemy.attackCd = 0.34;
          enemy.state = 'rivalKnightSlashDash';
          return true;
        } else {
          enemy.mirrorDashUntilTick = state.tick + Math.round(0.18 * 20);
          enemy.dashAngle = angle;
        }
        enemy.attackCd = 0.34;
        enemy.state = 'mirrorDash';
      }
      return false;
    };
    if (Number(enemy.mirrorWindupUntilTick || 0) > state.tick) { enemy.state = `mirror${String(enemy.mirrorPendingAction || 'windup')}`; return; }
    if (enemy.mirrorPendingAction && finishWindup()) return;
    if (Number(enemy.mirrorBeamUntilTick || 0) > state.tick) {
      const moveKey = enemy.mirrorPendingLaser || enemy.mirrorMoves?.laser || 'blood_beam';
      if (state.tick >= Number(enemy.mirrorBeamNextTick || state.tick)) {
        const profile = BEAM_CHANNEL_PROFILES[moveKey] || {};
        const interval = moveKey === 'god_sweep' ? 0.06 : moveKey === 'love_beam' ? 0.07 : Number(profile.tickInterval || 0.08);
        enemy.mirrorBeamNextTick = Number(enemy.mirrorBeamNextTick || state.tick) + interval * 20;
        if (moveKey === 'god_sweep') enemy.beamAngle += 4.4 * fixedDelta;
        const room = currentRoom(state, enemy.roomId);
        const offsets = Array.isArray(profile.fan) && profile.fan.length ? profile.fan : [0];
        const paths = offsets.map(offset => buildCampaignRicochetBeamPath({ originX: enemy.x, originY: enemy.y, angle: enemy.beamAngle + offset,
          range: Number(profile.range || (moveKey === 'god_sweep' ? 360 : moveKey === 'turtle_wave' ? 440 : 430)),
          maxBounces: 1, rects: campaignBeamReflectRects(state, room) }));
        enemy.rivalBeamPaths = paths;
        const hit = paths.map(path => campaignBeamPathHitsCircle(path, player.x, player.y, Number(player.radius || 18) + Number(profile.padding || 6))).find(Boolean);
        if (hit) {
          const damage = moveKey === 'turtle_wave' ? Math.max(Number(enemy.beamDamage || 0), 32)
            : moveKey === 'god_sweep' ? Math.max(10, Math.round(Number(enemy.beamDamage || enemy.contactDamage || 20) * 0.55))
              : ['wizard_lazer', 'mooggy_blood_beam', 'thorn_blood_beams'].includes(moveKey)
                ? Math.max(1, Math.round(Number(enemy.contactDamage || 20) * (moveKey === 'wizard_lazer' ? 0.55 : 0.45)))
                : Number(enemy.beamDamage || enemy.contactDamage || 20);
          const knockback = moveKey === 'turtle_wave' ? 145 : moveKey === 'wizard_lazer' ? 150 : Number(profile.knockback || 95);
          damagePlayer(state, player, damage, enemy.id, emitEvent, moveKey, { angle: hit.angle, knockback });
          const stream = combatRandomByState.get(state)?.scoped(`${enemy.id}|${moveKey}:${state.tick}`);
          const roll = () => stream ? stream.next() : 0.5;
          if (moveKey === 'thorn_blood_beams' && roll() < 0.35) applyAuthorityStatus(state, player, 'bleed', 1, 3.6, enemy.id);
          if (moveKey === 'mooggy_blood_beam') {
            if (roll() < 0.5) applyAuthorityStatus(state, player, 'poison', 2, 5, enemy.id);
            if (roll() < 0.18) applyAuthorityStatus(state, player, 'slow', 1, 1.2, enemy.id);
          }
        }
      }
      enemy.state = 'mirrorLaser';
      return;
    }
    if (enemy.mirrorDashMove === 'zip_lightning' && Number(enemy.mirrorDashUntilTick || 0) <= state.tick) {
      delete enemy.mirrorDashMove;
    }
    if (Number(enemy.mirrorDashUntilTick || 0) > state.tick) {
      const dashMove = enemy.mirrorDashMove || 'dash';
      const dashSpeed = dashMove === 'zip_lightning' ? 700 : 600;
      enemy.vx = Math.cos(Number(enemy.dashAngle || angle)) * dashSpeed;
      enemy.vy = Math.sin(Number(enemy.dashAngle || angle)) * dashSpeed;
      // A mirror dash carries its authored velocity for the whole burst. Do
      // not pass it through chase steering here: that would overwrite 600/700
      // with the ordinary mirror move speed before a single dash frame landed.
      const inset = Number(floor.wallThickness || 28) + Number(enemy.radius || 16);
      const desiredX = Math.max(inset, Math.min(Number(floor.width || 900) - inset, Number(enemy.x) + enemy.vx * fixedDelta));
      const desiredY = Math.max(inset, Math.min(Number(floor.height || 700) - inset, Number(enemy.y) + enemy.vy * fixedDelta));
      const collision = resolveRoomObstacleMovement(currentRoom(state, enemy.roomId), enemy, desiredX, desiredY);
      if (collision.blockedX) enemy.vx *= -0.4;
      if (collision.blockedY) enemy.vy *= -0.4;
      enemy.x = collision.x;
      enemy.y = collision.y;
      if (Math.hypot(Number(player.x) - Number(enemy.x), Number(player.y) - Number(enemy.y)) <= Number(enemy.radius || 16) + Number(player.radius || 18) + 6) {
        damagePlayer(state, player, Number(enemy.contactDamage || 20) + (dashMove === 'zip_lightning' ? 18 : 8), enemy.id, emitEvent,
          dashMove === 'zip_lightning' ? 'zip_lightning' : 'mirror_dash', { angle: enemy.dashAngle, knockback: dashMove === 'zip_lightning' ? 300 : 240 });
        delete enemy.mirrorDashUntilTick;
        delete enemy.mirrorDashMove;
      }
      enemy.state = 'mirrorDash';
      return;
    }
    if (isRival && Number(enemy.rivalClawFollowupUntilTick || 0) <= state.tick && Number(enemy.rivalClawFollowupUntilTick || 0) > 0) {
      delete enemy.rivalClawFollowupUntilTick;
      const combo = enemy.rivalClawCombo || planCampaignRivalClawGauntlets({
        baseDamage: Number(enemy.contactDamage || 20), knockback: Number(enemy.mirrorWeaponStats?.knockback || 260),
      });
      if (target.distance <= Number(enemy.radius || 16) + Number(player.radius || 18) + combo.rangePadding) {
        const followupAngle = angle + combo.followupAngleOffset;
        damagePlayer(state, player, combo.followupDamage, enemy.id, emitEvent, 'claw_gauntlets_followup', {
          angle: followupAngle, knockback: combo.knockback,
        });
        applyAuthorityStatus(state, player, 'bleed', combo.bleedStacks, combo.bleedDurationSeconds, enemy.id);
      }
      enemy.swingTime = combo.swingSeconds;
      enemy.swingA = angle + combo.followupAngleOffset;
      enemy.state = 'rivalClawFollowup';
      return;
    }
    const tactics = planCampaignMirrorTactics({
      distance: target.distance, angle, laserMove: enemy.mirrorMoves?.laser, smashMove: enemy.mirrorMoves?.smash,
      dashMove: enemy.mirrorMoves?.dash, weaponKey: enemy.mirrorWeapon, weaponRange: enemy.mirrorWeaponStats?.range,
      targetRadius: player.radius, meleeRange: 72, attackCooldown: enemy.attackCd,
      laserCooldown: enemy.mirrorLaserCd, smashCooldown: enemy.mirrorSmashCd, dashCooldown: enemy.mirrorDashCd,
    });
    moveEnemyToward(tactics.moveX, tactics.moveY);
    if (tactics.action === 'wait' || tactics.action === 'recover') { enemy.state = 'mirrorMove'; return; }
    if (tactics.action === 'laser' || tactics.action === 'smash' || tactics.action === 'dash') {
      enemy.mirrorPendingAction = tactics.action;
      enemy.mirrorPendingLaser = tactics.laserMove;
      enemy.mirrorPendingSmash = tactics.smashMove;
      enemy.mirrorPendingDash = tactics.dashMove;
      enemy.mirrorWindupUntilTick = state.tick + Math.round((tactics.action === 'smash' ? 0.38 : tactics.action === 'dash' ? 0.14 : 0.46) * 20);
      if (tactics.action === 'laser') enemy.mirrorLaserCd = Math.max(0.12, Number(enemy.mirrorCooldowns?.laser || 3.2));
      if (tactics.action === 'smash') enemy.mirrorSmashCd = Math.max(0.12, Number(enemy.mirrorCooldowns?.smash || 4.2));
      if (tactics.action === 'dash') enemy.mirrorDashCd = Math.max(0.12, Number(enemy.mirrorCooldowns?.dash || 1.8));
      enemy.state = `mirror${tactics.action}`;
      return;
    }
    const weapon = enemy.mirrorWeapon || '';
    const weaponStats = enemy.mirrorWeaponStats || {};
    const damage = Math.max(1, Number(weaponStats.damage || enemy.contactDamage || 24));
    const knockback = Math.max(0, Number(weaponStats.knockback || 120));
    const ranged = tactics.rangedWeapon;
    if (!weapon && enemy.mirrorMoves?.melee === 'fire_balls') {
      const fireballDamage = Math.max(14, Math.round(Number(
        enemy.mirrorMoveStats?.fire_balls?.damage
        ?? MOVE_BASE_STATS.fire_balls?.damage
        ?? enemy.contactDamage
        ?? 18,
      )) - 4);
      [-0.16, 0, 0.16].forEach(offset => createAuthorityMirrorProjectile(state, enemy, angle + offset, {
        type: 'fireball', attackKind: 'mirror_fire_balls', speed: 340, radius: 8,
        life: 1.45, damage: fireballDamage, knockback: 110,
        fireStacks: 1, fireDuration: 3.2,
      }));
      enemy.attackCd = Math.max(0.18, Number(enemy.mirrorCooldowns?.melee || 0.4));
      enemy.state = 'mirrorFireBalls';
      return;
    }
    if (ranged) {
      if (enemy.type === 'rival' && weapon === 'gelleh_lightning_spear') {
        const spearWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'melee' && entry.key === 'gelleh_lightning_spear');
        const spear = resolveCampaignSmite({
          beamDamageMultiplier: Number(enemy.mirrorItemStats?.beamDamageMultiplier || 1),
        }).blade;
        createAuthorityMirrorProjectile(state, enemy, angle, {
          type: spear.kind, attackKind: 'gelleh_lightning_spear', speed: spear.speed, radius: spear.radius,
          life: spear.lifeSeconds, damage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(spearWeapon?.damageMult || 1))),
          knockback: spear.knockback, pierce: spear.pierce,
          originX: Number(enemy.x) + Math.cos(angle) * Number(spear.spawnDistance || 24),
          originY: Number(enemy.y) + Math.sin(angle) * Number(spear.spawnDistance || 24),
          statusEffects: [{ key: 'static', chance: 0.35, stacks: 1, duration: 3 }],
        });
        enemy.attackCd = Math.max(0.18, Number(enemy.mirrorCooldowns?.melee || 0.4));
        enemy.state = 'rivalLightningSpear';
        return;
      }
      if (enemy.type === 'rival' && weapon === 'metao_fire_staff') {
        const staffWeapon = (enemy.rivalLoadout || []).find(entry => entry.slot === 'melee' && entry.key === 'metao_fire_staff');
        const volley = planCampaignFireballVolley({
          baseDamage: Math.max(1, Math.round(Number(enemy.contactDamage || 20) * Number(staffWeapon?.damageMult || 1))),
          aoeRadiusMultiplier: Number(enemy.mirrorItemStats?.aoeRadiusMultiplier || 1),
          aoeDamageMultiplier: Number(enemy.mirrorItemStats?.aoeDamageMultiplier || 1),
        });
        volley.projectiles.forEach(fireball => createAuthorityMirrorProjectile(state, enemy, angle + fireball.angleOffset, {
          type: fireball.kind, attackKind: 'metao_fire_staff', speed: fireball.speed, radius: fireball.radius,
          life: fireball.lifeSeconds, damage: fireball.damage, knockback: 110, splash: fireball.splash,
          splashDamage: fireball.splashDamage, fireStacks: fireball.fireStacks, splashFireStacks: fireball.splashFireStacks,
          fireDuration: fireball.fireDurationSeconds,
          hitOptions: { fireChance: 1, fireStacks: fireball.fireStacks, fireDuration: fireball.fireDurationSeconds },
          enemyBlast: {
            radius: fireball.splash, damage: fireball.splashDamage, knockback: 110,
            statusKey: 'fire', statusStacks: fireball.splashFireStacks, statusDuration: fireball.fireDurationSeconds,
          },
        }));
        enemy.vx -= Math.cos(angle) * volley.recoil;
        enemy.vy -= Math.sin(angle) * volley.recoil;
        enemy.attackCd = Math.max(0.18, Number(enemy.mirrorCooldowns?.melee || 0.4));
        enemy.state = 'rivalFireballVolley';
        return;
      }
      // Campaign's mirror does not fire a synthetic Lazer Glases bullet. Its
      // weapon action enters the normal mirror-beam state with the shorter
      // weapon wind-up, then resolves that copied hero's equipped laser move.
      // Preserve that intentionally unusual interaction here.
      if (weapon === 'lazer_glasses') {
        enemy.mirrorPendingAction = 'laser';
        enemy.mirrorPendingLaser = enemy.mirrorMoves?.laser || 'blood_beam';
        enemy.beamDamage = Math.max(Number(enemy.beamDamage || 0), Math.round(damage * 0.55));
        enemy.mirrorWindupUntilTick = state.tick + Math.round(0.22 * 20);
        enemy.attackCd = Math.max(0.18, Number(enemy.mirrorCooldowns?.melee || 0.4));
        enemy.state = 'mirrorLaser';
        return;
      }
      const config = weapon === 'magenta_p90' ? { count: 5, spread: 0.08, speed: 880, radius: 4, life: 0.75 }
        : weapon === 'metao_fire_staff' ? { count: 3, spread: 0.18, speed: 345, radius: 8, life: 1.4, fireStacks: 1, fireDuration: 3.2 }
          : { count: 1, spread: 0, speed: weapon === 'magenta_degale' ? 880 : 760, radius: weapon === 'magenta_degale' ? 7 : 6, life: weapon === 'void_piercer' ? 1.2 : 0.9 };
      for (let index = 0; index < config.count; index += 1) {
        createAuthorityMirrorProjectile(state, enemy, angle + (index - (config.count - 1) / 2) * config.spread, {
          type: weapon || 'mirror_shot', attackKind: `mirror_${weapon || 'shot'}`, speed: config.speed, radius: config.radius,
          life: config.life, damage, knockback, fireStacks: config.fireStacks, fireDuration: config.fireDuration,
        });
      }
    } else if (target.distance <= Math.max(72, Number(weaponStats.range || 72)) + Number(player.radius || 18)) {
      damagePlayer(state, player, damage, enemy.id, emitEvent, `mirror_${weapon || 'slash'}`, { angle, knockback });
      if (weapon === 'thorns_bleed_blade') applyAuthorityStatus(state, player, 'bleed', 1, 5, enemy.id);
      if (isRival && weapon === 'claw_gauntlets') {
        const combo = planCampaignRivalClawGauntlets({ baseDamage: damage, knockback });
        enemy.rivalClawCombo = combo;
        enemy.rivalClawFollowupUntilTick = state.tick + Math.max(1, Math.round(combo.followupDelaySeconds * 20));
        enemy.swingA = angle + combo.initialAngleOffset;
        enemy.swingTime = combo.swingSeconds;
        applyAuthorityStatus(state, player, 'bleed', combo.bleedStacks, combo.bleedDurationSeconds, enemy.id);
      }
    }
    enemy.attackCd = Math.max(0.18, Number(enemy.mirrorCooldowns?.melee || 0.4));
    enemy.state = 'mirrorMelee';
  }

  function updateEnemies(state, fixedDelta, emitEvent) {
    const floor = state.floorState || {};
    behaviorRuntime.state = state;
    behaviorRuntime.emitEvent = emitEvent;
    Object.entries(state.enemies || {}).forEach(([enemyId, enemy]) => {
      if (enemy.dead) {
        if (state.tick - Number(enemy.deathTick || 0) >= ENEMY_DEATH_TICKS) delete state.enemies[enemyId];
        return;
      }
      // Match the campaign's 0.72 second portal/emergence window. During this
      // authoritative phase the enemy cannot move, attack, or deal contact
      // damage; every client is free to render the shared spawn animation.
      if (state.tick - Number(enemy.spawnTick || 0) < SPAWN_LOCK_TICKS) {
        enemy.state = 'spawning';
        enemy.vx = 0;
        enemy.vy = 0;
        return;
      }
      if (enemy.state === 'spawning') enemy.state = 'chasing';
      updateMinorEnemyPackPressure(state, enemy);
      // Mirror champions use the same tactical policy as the campaign, then
      // execute the matching authoritative action body.  Keep this ahead of
      // the generic enemy loop so it never silently falls back to a different
      // multiplayer-only chase/attack model.
      if (enemy.behavior === 'mirror') {
        updateAuthorityMirrorChampion(state, enemy, fixedDelta, emitEvent, floor);
        return;
      }
      if (enemyBehaviors && SHARED_ENEMY_BEHAVIOR_SET.has(enemy.type)) {
        // Standard-roster enemies run the campaign's authored behavior bodies —
        // wind-ups, dashes, beams, bursts, cover, summons, shields, heals —
        // instead of the generic chase/shoot loop below. Their attacks deal all
        // damage themselves; there is no walk-over contact damage, exactly like
        // the campaign.
        updateAuthoredEnemy(state, enemy, fixedDelta, emitEvent, floor);
        return;
      }
      if (state.tick < Number(enemy.stunnedUntilTick || 0)) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.state = 'stunned';
        return;
      }
      if (state.tick < Number(enemy.confusedBlindUntilTick || 0)) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.state = 'confused';
        return;
      }
      const target = nearestLivingPlayer(state, enemy);
      if (!target.player) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.state = 'idle';
        return;
      }
      const angle = Math.atan2(target.player.y - enemy.y, target.player.x - enemy.x);
      const room = currentRoom(state, enemy.roomId);
      const contactDistance = Number(enemy.radius || 20) + Number(target.player.radius || 18) + 4;
      if (enemy.behavior === 'summoner' && state.tick >= Number(enemy.summonCooldownUntilTick || 0)) {
        const liveSummons = livingEncounterEnemies(state, enemy.roomId).filter(candidate => candidate.summonedBy === enemy.id).length;
        if (liveSummons < 2) spawnSummonedEnemy(state, enemy, emitEvent);
        enemy.summonCooldownUntilTick = state.tick + 88;
      }
      updateEnemySupport(state, enemy, emitEvent);
      if (enemy.behavior === 'boss') {
        const hpRatio = Number(enemy.health || 0) / Math.max(1, Number(enemy.maxHealth || 1));
        enemy.phase = hpRatio <= 0.25 ? 4 : hpRatio <= 0.5 ? 3 : hpRatio <= 0.75 ? 2 : 1;
      }
      const rangedBehavior = RANGED_BEHAVIORS.has(enemy.behavior);
      if (rangedBehavior) {
        if (Number(enemy.attackWindupUntilTick || 0) > 0) {
          enemy.vx = 0;
          enemy.vy = 0;
          enemy.state = 'aiming';
          if (state.tick >= enemy.attackWindupUntilTick) {
            const projectileId = createEnemyProjectile(state, enemy, target.player);
            enemy.attackWindupUntilTick = 0;
            enemy.attackCooldownUntilTick = state.tick + 28;
            enemy.state = 'firing';
            emitEvent('ENEMY_ATTACKED', { enemyId, targetPlayerId: target.player.id, attackKind: enemy.type, projectileId, phase: enemy.phase || 1 });
          }
        } else if (state.tick >= Number(enemy.attackCooldownUntilTick || 0)) {
          enemy.attackWindupUntilTick = state.tick + 7;
          enemy.state = 'aiming';
          enemy.vx = 0;
          enemy.vy = 0;
          emitEvent('ENEMY_TELEGRAPH', { enemyId, targetPlayerId: target.player.id, attackKind: enemy.type, windupTicks: 7, phase: enemy.phase || 1 });
        } else if (target.distance < 165) {
          enemy.state = 'retreating';
          moveEnemy(enemy, angle, -1, fixedDelta, floor, room);
        } else if (target.distance > 285) {
          enemy.state = 'approaching';
          moveEnemy(enemy, angle, 1, fixedDelta, floor, room);
        } else {
          enemy.state = 'holding';
          enemy.vx = 0;
          enemy.vy = 0;
        }
      } else if (target.distance > contactDistance) {
        enemy.state = enemy.behavior === 'charger' ? 'charging' : 'chasing';
        moveEnemy(enemy, angle, 1, fixedDelta, floor, room);
      } else {
        enemy.vx = 0;
        enemy.vy = 0;
      }
      if (target.distance <= contactDistance && state.tick >= Number(enemy.contactCooldownUntilTick || 0)) {
        enemy.contactCooldownUntilTick = state.tick + 16;
        damagePlayer(state, target.player, enemy.contactDamage, enemyId, emitEvent, 'contact', {
          angle: Math.atan2(Number(target.player.y) - Number(enemy.y), Number(target.player.x) - Number(enemy.x)),
          knockback: Number(enemy.contactKnockback || 120),
        });
      }
    });
  }

  function spawnCoinDrop(state, enemy, emitEvent, options = {}) {
    const amount = getCampaignEnemyCoinReward({ ...enemy, boss: !!getEnemyDefinition(enemy.type)?.boss });
    if (amount <= 0) return;
    const randomService = combatRandomByState.get(state);
    const stream = randomService?.scoped?.(`enemy-coins:${state.floorNumber}:${enemy.roomId}:${enemy.id}`);
    const random = typeof options.random === 'function' ? options.random : (stream ? () => stream.next() : authorityFallbackRandom);
    const plan = createCampaignCoinDropPlan(enemy.x, enemy.y, amount, {
      gameMode: state.matchRules?.gameMode || state.matchRules?.mode,
      coinRewardMultiplier: state.matchRules?.difficulty?.coinRewardMultiplier,
      random,
    });
    plan.forEach(descriptor => {
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = { id: pickupId, ...descriptor, roomId: enemy.roomId, radius: 13, amount: descriptor.value, spawnTick: state.tick };
      emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: 'coin', enemyId: enemy.id });
    });
  }

  function spawnEnemyDrops(state, enemy, player, emitEvent, options = {}) {
    spawnCoinDrop(state, enemy, emitEvent, options);
    const randomService = combatRandomByState.get(state);
    const loot = randomService?.scoped?.(`enemy-loot:${state.floorNumber}:${enemy.roomId}:${enemy.id}`);
    const nextRandom = typeof options.random === 'function' ? options.random : (loot ? () => loot.next() : authorityFallbackRandom);
    const descriptor = resolveCampaignEnemyDrop(enemy, {
      random: nextRandom,
      tutorialDummy: !!enemy.tutorialDummy,
      itemDropChanceBonus: player?.itemStats?.itemDropChanceBonus,
      difficultyMultiplier: state.matchRules?.difficulty?.itemDropChanceMultiplier,
      potionDropMultiplier: state.matchRules?.potionDropMultiplier,
    });
    if (descriptor) {
      const pickupId = state.allocateEntityId('pickup');
      const pickup = {
        id: pickupId,
        ...descriptor,
        roomId: enemy.roomId,
        x: enemy.x,
        y: enemy.y,
        radius: 13,
        amount: 1,
        spawnTick: state.tick,
      };
      if (pickup.type === 'item') {
        pickup.key = rollCampaignItem(nextRandom, { elite: !!pickup.elite });
      }
      if (pickup.type !== 'item' || pickup.key) {
        state.pickups[pickupId] = pickup;
        emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: pickup.type, enemyId: enemy.id, ...(pickup.key ? { itemKey: pickup.key } : {}) });
      }
    }
    const challengeModifiers = state.matchRules?.challengeModifiers || {};
    const bonusDrops = resolveCampaignBossBonusDrops(enemy, {
      isBoss: !!getEnemyDefinition(enemy.type)?.boss,
      tutorialDummy: !!enemy.tutorialDummy,
      forceDeath: !!options.forceDeath,
      practice: state.matchRules?.mode === 'practice',
      noItems: !!(state.matchRules?.noItems || challengeModifiers.no_items || challengeModifiers.noItems),
      random: nextRandom,
    });
    bonusDrops.forEach(drop => {
      const bonusPickupId = state.allocateEntityId('pickup');
      const key = drop.type === 'god_item' ? rollCampaignGodItem(ITEM_DEFS, nextRandom) : drop.key;
      if (!key) return;
      state.pickups[bonusPickupId] = {
        id: bonusPickupId, type: 'item', key, source: drop.source,
        roomId: enemy.roomId, x: enemy.x + (drop.type === 'god_item' ? 28 : -28), y: enemy.y,
        radius: 13, amount: 1, spawnTick: state.tick,
      };
      emitEvent('PICKUP_SPAWNED', { pickupId: bonusPickupId, pickupType: 'item', itemKey: key, enemyId: enemy.id, source: drop.source });
    });
  }

  function markEncounterCleared(state, roomId, emitEvent) {
    const encounter = state.floorState?.encounters?.[roomId];
    if (!encounter || encounter.status === 'cleared') return;
    if (livingEncounterEnemies(state, roomId).length > 0) return;
    encounter.status = 'cleared';
    encounter.clearedTick = state.tick;
    const room = currentRoom(state, roomId);
    if (authorityGameMode(state) === 'rival_rumble' && encounter.rivalRumble) {
      resolveAuthorityRivalRumbleClear(state, room, emitEvent);
    }
    if (authorityGameMode(state) === 'boss_rush' && encounter.bossRushStage != null) {
      resolveAuthorityBossRushStageClear(state, room, emitEvent);
    }
    if (authorityGameMode(state) === 'treasure_hunt' && room?.type === 'boss') {
      const hasKey = Object.values(state.pickups || {}).some(pickup => pickup?.type === 'treasureKey' && pickup.roomId === roomId);
      if (!hasKey) {
        const pickupId = state.allocateEntityId('pickup');
        state.pickups[pickupId] = {
          id: pickupId, type: 'treasureKey', roomId,
          x: Number(state.floorState?.width || 900) / 2, y: Number(state.floorState?.height || 700) / 2,
          radius: 18, spawnTick: state.tick,
        };
        emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: 'treasureKey', roomId, source: 'treasure_hunt_boss' });
      }
    }
    if (authorityGameMode(state) === 'endless' && room) {
      openAuthorityEndlessIntermission(state, room, emitEvent, combatRandomByState.get(state));
    }
    if (room?.secret && room.secretKind === 'bowman_bane') {
      room.cleared = true;
      if (!room.secretChestLooted && !Object.values(state.pickups || {}).some(pickup => pickup?.type === 'secret_boss_chest' && pickup.roomId === roomId)) {
        const pickupId = state.allocateEntityId('pickup');
        state.pickups[pickupId] = {
          id: pickupId, type: 'secret_boss_chest', roomId,
          x: Number(state.floorState?.width || 900) / 2, y: Number(state.floorState?.height || 700) / 2,
          radius: 22, spawnTick: state.tick,
        };
        emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: 'secret_boss_chest', roomId });
      }
      emitEvent('BOWMAN_BANE_DEFEATED', { roomId });
    }
    if (room?.type === 'challenge') {
      const result = finishCampaignChallenge(room, 'completed', { text: 'TRIAL CLEARED' });
      if (result.ok && !room.challengeRewardSpawned) {
        room.challengeRewardSpawned = true;
        const randomService = combatRandomByState.get(state);
        const rewardRandom = randomService?.scoped?.(`challenge:reward:${state.floorNumber}:${roomId}`);
        const scrollRandom = randomService?.scoped?.(`challenge:scroll-reward:${state.floorNumber}:${roomId}`);
        const weaponRandom = randomService?.scoped?.(`challenge:weapon-reward:${state.floorNumber}:${roomId}`);
        const rewardOwner = state.players?.[room.challengeRewardPlayerId]
          || activePlayers(state).find(player => !player.downed && player.roomId === roomId);
        const weaponPool = [...WHITE_WEAPON_POOL, ...(Number(state.floorNumber || 1) >= 4 ? PURPLE_WEAPON_POOL : []), ...(Number(state.floorNumber || 1) >= 7 ? GOD_WEAPON_POOL : [])];
        const plan = createCampaignChallengeRewardPlan({
          floorNumber: state.floorNumber,
          centerX: Number(state.floorState.width || 900) / 2,
          centerY: Number(state.floorState.height || 700) / 2,
          authoredRewardKey: result.rewardKey,
          random: rewardRandom ? () => rewardRandom.next() : authorityFallbackRandom,
          scrollRandom: scrollRandom ? () => scrollRandom.next() : authorityFallbackRandom,
          weaponRandom: weaponRandom ? () => weaponRandom.next() : authorityFallbackRandom,
          rollEliteItem: nextRandom => rollCampaignItem(nextRandom, { elite: true }),
          rollScroll: nextRandom => rollCampaignScroll(nextRandom),
          weaponPool,
          ownedWeapons: rewardOwner?.ownedWeapons || {},
        });
        plan.pickups.forEach(descriptor => {
          const pickupId = state.allocateEntityId('pickup');
          state.pickups[pickupId] = { id: pickupId, ...descriptor, roomId, radius: 13, spawnTick: state.tick };
        });
        if (rewardOwner && plan.xp > 0) {
          const amount = Math.max(1, Math.round(plan.xp * Math.max(0, Number(rewardOwner.itemStats?.xpGainMultiplier || 1))));
          rewardOwner.xp = Math.max(0, Number(rewardOwner.xp || 0)) + amount;
          rewardOwner.level = Math.max(1, Number(rewardOwner.level || 1));
          rewardOwner.xpToNext = Math.max(1, Number(rewardOwner.xpToNext || 20));
          while (rewardOwner.xp >= rewardOwner.xpToNext) {
            rewardOwner.xp -= rewardOwner.xpToNext;
            applyCampaignLevelUp(rewardOwner);
            emitEvent('PLAYER_LEVELED', { playerId: rewardOwner.id, level: rewardOwner.level, maxHealth: rewardOwner.maxHp });
          }
          emitEvent('XP_AWARDED', { playerId: rewardOwner.id, source: 'challenge_reward', amount, xp: rewardOwner.xp, level: rewardOwner.level });
        }
        if (rewardOwner && plan.weaponKey) {
          rewardOwner.ownedWeapons = rewardOwner.ownedWeapons || {};
          rewardOwner.ownedWeapons[plan.weaponKey] = true;
          emitEvent('CHALLENGE_WEAPON_AWARDED', { playerId: rewardOwner.id, roomId, weaponKey: plan.weaponKey });
        }
        emitEvent('CHALLENGE_COMPLETED', { roomId, ...result, rewardKey: plan.rewardKey, xp: plan.xp, weaponKey: plan.weaponKey, playerId: rewardOwner?.id });
      }
    }
    const gameMode = String(state.matchRules?.gameMode || state.matchRules?.mode || 'normal');
    if (room?.type === 'boss' && !['endless', 'boss_rush', 'treasure_hunt'].includes(gameMode)) {
      const stream = combatRandomByState.get(state)?.scoped?.(`boss:reward-five:${state.floorNumber}:${roomId}`);
      const rewardPlan = createCampaignBossRewardPlan(room, {
        floorNumber: state.floorNumber,
        difficultyKey: state.matchRules?.difficultyKey || state.matchRules?.difficulty?.key,
        centerX: Number(state.floorState?.width || 900) / 2,
        centerY: Number(state.floorState?.height || 700) / 2 + 68,
        createChoices: count => createCampaignItemChoices(count, stream ? () => stream.next() : authorityFallbackRandom, { elite: true }),
      });
      if (rewardPlan.ok) {
        rewardPlan.pickups.forEach(descriptor => {
          const pickupId = state.allocateEntityId('pickup');
          state.pickups[pickupId] = { id: pickupId, ...descriptor, roomId, radius: 20, amount: 1, spawnTick: state.tick };
          emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: 'rewardChoice', itemKey: descriptor.key, roomId, source: 'boss_reward' });
        });
        emitEvent('BOSS_REWARD_CHOICES_SPAWNED', { roomId, groupId: rewardPlan.groupId, picksRemaining: rewardPlan.picksRemaining });
      }
    }
    emitEvent('ROOM_CLEARED', { roomId });
  }

  function emitProjectileSubSpawn(state, projectile, random) {
    const config = projectile.subSpawn;
    if (!config || state.tick < Number(config.nextSpawnTick || 0)) return;
    const intervalTicks = Math.max(1, Number(config.intervalSeconds || 0.2) * 20);
    config.nextSpawnTick += intervalTicks;
    const owner = state.players?.[projectile.ownerId];
    const hostileOwner = projectile.hostile ? state.enemies?.[projectile.ownerId] : null;
    if (!owner && !hostileOwner) return;
    const randomNext = typeof random?.next === 'function' ? () => random.next('encounter') : () => 0.5;
    createCampaignSubSpawnDescriptors(projectile, config, randomNext).forEach(descriptor => {
      if (hostileOwner) {
        createAuthorityMirrorProjectile(state, hostileOwner, descriptor.angle, {
          type: descriptor.kind, attackKind: projectile.attackKind, damage: descriptor.damage,
          speed: descriptor.speed, radius: descriptor.radius, life: descriptor.lifeSeconds,
          originX: projectile.x, originY: projectile.y, hitOptions: descriptor.hitOptions,
        });
        return;
      }
      createPlayerProjectile(state, owner, {
        kind: descriptor.kind,
        attackKind: projectile.attackKind,
        damage: descriptor.damage,
        speed: descriptor.speed,
        radius: descriptor.radius,
        lifeTicks: Math.ceil(descriptor.lifeSeconds * 20),
        spawnDistance: 0,
        originX: projectile.x,
        originY: projectile.y,
        roomId: projectile.roomId,
        hitOptions: descriptor.hitOptions,
      }, descriptor.angle);
    });
  }

  function updateProjectiles(state, fixedDelta, emitEvent, random, inputs = {}) {
    const completeGhostBallCooldown = owner => {
      const cooldownTicks = Number(owner?.ghostBallCooldownTicks || 0);
      if (cooldownTicks <= 0) return;
      rescheduleLatestMoveCharge(owner, 'ghost_ball', state.tick + cooldownTicks);
      delete owner.ghostBallCooldownTicks;
    };
    const beginBoomerangReturn = projectile => {
      const owner = state.players?.[projectile.ownerId];
      if (!owner || owner.downed || owner.roomId !== projectile.roomId) return false;
      const plan = planCampaignBoomerangReturn(projectile, owner);
      if (!plan) return false;
      Object.assign(projectile, plan);
      projectile.expiresTick = state.tick + Math.max(1, Math.round(plan.returnLifeSeconds * 20));
      return true;
    };
    const resolveBoomerangCatch = projectile => {
      const owner = state.players?.[projectile.ownerId];
      if (!owner || owner.downed || owner.roomId !== projectile.roomId) return;
      const result = resolveCampaignBoomerangCatch({
        player: owner,
        healingMultiplier: owner.itemStats?.healingMultiplier,
        pickups: Object.values(state.pickups || {}).filter(pickup => pickup.roomId === owner.roomId),
      });
      owner.hp = result.health;
      // Loot remains an authoritative, fixed collection target in multiplayer.
      // The campaign helper also supplies single-player-only visual pull impulses;
      // applying them here makes replicated pickups slide between snapshots.
      emitEvent('SARGES_HAMMER_RETURNED', {
        projectileId: projectile.id, playerId: owner.id, healedAmount: result.healedAmount,
        pickupIds: [],
      });
    };
    const detonateLoveBomb = (projectile, x = projectile.x, y = projectile.y) => {
      if (projectile.kind !== 'love_bomb') return false;
      const radius = Math.max(1, Number(projectile.aoeRadius || 48));
      if (projectile.hostile) {
        const targetIds = [];
        livingRoomPlayers(state, projectile.roomId).forEach(player => {
          if (Math.hypot(player.x - x, player.y - y) > radius + Number(player.radius || 18)) return;
          damagePlayer(state, player, projectile.damage, projectile.ownerId, emitEvent, projectile.attackKind, {
            angle: Math.atan2(player.y - y, player.x - x), knockback: Number(projectile.knockback || 200),
          });
          targetIds.push(player.id);
        });
        emitEvent('LOVE_BOMB_DETONATED', {
          projectileId: projectile.id, enemyId: projectile.ownerId, roomId: projectile.roomId, x, y, radius, targetIds,
        });
        return true;
      }
      const owner = state.players?.[projectile.ownerId];
      if (!owner) return false;
      const targetIds = [];
      abilityTargetsInRadius(state, owner, x, y, radius).forEach(enemy => {
        damageEnemy(state, enemy, projectile.damage, owner.id, emitEvent, {
          projectileId: projectile.id, attackKind: projectile.attackKind,
          angle: Math.atan2(enemy.y - y, enemy.x - x), knockback: Number(projectile.knockback || 200),
        });
        if (!enemy.dead && random.next('encounter') < Number(projectile.sparkleChance || 0)) {
          enemy.critSparkleUntilTick = Math.max(Number(enemy.critSparkleUntilTick || 0), state.tick + 80);
        }
        targetIds.push(enemy.id);
      });
      damageRivalsInRadius(state, owner, x, y, radius, projectile.damage, emitEvent, projectile.attackKind, targetIds);
      chipDestructiblesInRadius(state, owner, x, y, radius, projectile.damage, emitEvent, random);
      emitEvent('LOVE_BOMB_DETONATED', {
        projectileId: projectile.id, playerId: owner.id, roomId: projectile.roomId,
        x, y, radius, targetIds,
      });
      return true;
    };
    const detonateEnemyProjectileBlast = (projectile, x = projectile.x, y = projectile.y) => {
      const blast = resolveCampaignEnemyProjectileBlast(projectile);
      if (!blast || !projectile.hostile) return false;
      livingRoomPlayers(state, projectile.roomId).forEach(player => {
        if (Math.hypot(player.x - x, player.y - y) > blast.radius + Number(player.radius || 18)) return;
        damagePlayer(state, player, blast.damage, projectile.ownerId, emitEvent, `${projectile.attackKind}_blast`, {
          angle: Math.atan2(player.y - y, player.x - x), knockback: blast.knockback,
        });
        if (blast.statusKey) applyAuthorityStatus(state, player, blast.statusKey, blast.statusStacks, blast.statusDuration, projectile.ownerId);
      });
      const room = currentRoom(state, projectile.roomId);
      (room?.destructibles || []).forEach(prop => {
        if (prop.broken || prop.hidden || Math.hypot(prop.x - x, prop.y - y) > blast.radius + Number(prop.r || 16)) return;
        damageNetworkDestructible(state, projectile.roomId, prop, blast.damage, emitEvent, random, {
          projectileId: projectile.id, attackKind: `${projectile.attackKind}_blast`,
        });
      });
      emitEvent('ENEMY_PROJECTILE_DETONATED', { projectileId: projectile.id, roomId: projectile.roomId, x, y, ...blast });
      return true;
    };
    Object.entries(state.projectiles || {}).forEach(([projectileId, projectile]) => {
      if (state.tick >= Number(projectile.expiresTick || 0)) {
        if (projectile.returning && projectile.returnPhase === 'out') {
          if (!beginBoomerangReturn(projectile)) {
            delete state.projectiles[projectileId];
          }
          // Campaign turns around after the outgoing frame has ended; it does
          // not also advance a return frame in that same simulation step.
          return;
        } else {
          if (projectile.returning && projectile.returnPhase === 'back') resolveBoomerangCatch(projectile);
          detonateLoveBomb(projectile);
          detonateEnemyProjectileBlast(projectile);
          delete state.projectiles[projectileId];
          return;
        }
      }
      if (projectile.ghostBall) {
        const owner = state.players?.[projectile.ownerId];
        if (!owner || owner.downed || owner.roomId !== projectile.roomId) {
          completeGhostBallCooldown(owner);
          delete state.projectiles[projectileId];
          return;
        }
        const effect = projectile.ghostBallEffect || planCampaignGhostBall({ baseDamage: projectile.damage });
        const liveInput = inputs?.[owner.id] || {};
        const targetX = Number.isFinite(Number(liveInput.targetX)) ? Number(liveInput.targetX)
          : Number.isFinite(Number(projectile.targetX)) ? Number(projectile.targetX)
            : Number(owner.x) + Math.cos(Number(liveInput.aimDirection ?? owner.aimDirection ?? 0)) * 420;
        const targetY = Number.isFinite(Number(liveInput.targetY)) ? Number(liveInput.targetY)
          : Number.isFinite(Number(projectile.targetY)) ? Number(projectile.targetY)
            : Number(owner.y) + Math.sin(Number(liveInput.aimDirection ?? owner.aimDirection ?? 0)) * 420;
        const step = advanceCampaignGhostBall(projectile, { effect, delta: fixedDelta, targetX, targetY });
        if (!step.active) {
          completeGhostBallCooldown(owner);
          delete state.projectiles[projectileId];
          emitEvent('GHOST_BALL_FIZZLED', { projectileId, playerId: owner.id, roomId: projectile.roomId });
          return;
        }
        const cooldowns = projectile.contactCooldownUntilTick || (projectile.contactCooldownUntilTick = {});
        abilityTargetsInRadius(state, owner, projectile.x, projectile.y, projectile.radius).forEach(enemy => {
          if (projectile.radius < effect.minimumRadius || state.tick < Number(cooldowns[enemy.id] || 0)) return;
          damageEnemy(state, enemy, step.currentDamage, owner.id, emitEvent, {
            projectileId, attackKind: projectile.attackKind,
            angle: Math.atan2(enemy.y - projectile.y, enemy.x - projectile.x), knockback: effect.knockback,
          });
          cooldowns[enemy.id] = state.tick + Math.max(1, Math.ceil(effect.enemyHitCooldownSeconds * 20));
          projectile.radius -= effect.hitDecay;
        });
        const room = currentRoom(state, projectile.roomId);
        (room?.destructibles || []).forEach(prop => {
          if (projectile.radius < effect.minimumRadius || prop.broken || prop.hidden) return;
          const key = String(prop.id || `${prop.x}:${prop.y}`);
          if (state.tick < Number(cooldowns[`prop:${key}`] || 0)) return;
          if (Math.hypot(prop.x - projectile.x, prop.y - projectile.y) > Number(projectile.radius || 0) + Number(prop.r || 12)) return;
          cooldowns[`prop:${key}`] = state.tick + Math.max(1, Math.ceil(effect.destructibleHitCooldownSeconds * 20));
          damageNetworkDestructible(state, projectile.roomId, prop, effect.destructibleDamage, emitEvent, random, {
            projectileId, playerId: owner.id, attackKind: projectile.attackKind,
          });
        });
        if (projectile.radius < effect.minimumRadius) {
          completeGhostBallCooldown(owner);
          delete state.projectiles[projectileId];
          emitEvent('GHOST_BALL_FIZZLED', { projectileId, playerId: owner.id, roomId: projectile.roomId });
        }
        return;
      }
      if (projectile.homing) {
      const lockedTarget = projectile.homingTargetId
          ? projectile.hostile ? state.players?.[projectile.homingTargetId] : state.enemies?.[projectile.homingTargetId]
          : null;
        const returnOwner = projectile.returning && projectile.returnPhase === 'back'
          ? state.players?.[projectile.ownerId]
          : null;
        const target = returnOwner && !returnOwner.downed && returnOwner.roomId === projectile.roomId
          ? returnOwner
          : lockedTarget && !lockedTarget.dead && lockedTarget.roomId === projectile.roomId
          ? lockedTarget
          : projectile.hostile
          ? nearestLivingPlayer(state, projectile).player
          : livingEncounterEnemies(state, projectile.roomId)
            .filter(candidate => Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y) <= Number(projectile.homingRadius || 960))
            .sort((a, b) => Math.hypot(a.x - projectile.x, a.y - projectile.y) - Math.hypot(b.x - projectile.x, b.y - projectile.y))[0];
        steerCampaignHomingProjectile(projectile, target || null, fixedDelta);
      }
      const previous = advanceCampaignProjectile(projectile, fixedDelta);
      if (projectile.returning && projectile.returnPhase === 'back') {
        const owner = state.players?.[projectile.ownerId];
        if (owner && Math.hypot(owner.x - projectile.x, owner.y - projectile.y) <= Number(owner.radius || 18) + Number(projectile.radius || 8) + 6) {
          delete state.projectiles[projectileId];
          resolveBoomerangCatch(projectile);
          return;
        }
      }
      emitProjectileSubSpawn(state, projectile, random);
      const wall = Number(state.floorState?.wallThickness || 28);
      if (projectile.x < wall || projectile.x > Number(state.floorState?.width || 900) - wall
        || projectile.y < wall || projectile.y > Number(state.floorState?.height || 700) - wall) {
        const hitX = projectile.x < wall || projectile.x > Number(state.floorState?.width || 900) - wall;
        const hitY = projectile.y < wall || projectile.y > Number(state.floorState?.height || 700) - wall;
        if (bounceCampaignProjectile(projectile, { hitX, hitY }, previous)) {
          emitEvent('PROJECTILE_BOUNCED', { projectileId, roomId: projectile.roomId });
          return;
        }
        detonateLoveBomb(projectile);
        detonateEnemyProjectileBlast(projectile);
        delete state.projectiles[projectileId];
        return;
      }
      const room = currentRoom(state, projectile.roomId);
      const solidStructureHit = findCampaignProjectileObstacleSweepHit(projectile, previous, room?.structures || []);
      if (solidStructureHit) {
        const solidStructure = solidStructureHit.obstacle;
        if (bounceCampaignProjectile(projectile, {
          hitX: solidStructureHit.hitX,
          hitY: solidStructureHit.hitY,
        }, { x: solidStructureHit.x, y: solidStructureHit.y })) {
          emitEvent('PROJECTILE_BOUNCED', { projectileId, roomId: projectile.roomId, obstacleKind: solidStructure.kind });
          return;
        }
        detonateLoveBomb(projectile, solidStructureHit.x, solidStructureHit.y);
        detonateEnemyProjectileBlast(projectile, solidStructureHit.x, solidStructureHit.y);
        delete state.projectiles[projectileId];
        emitEvent('PROJECTILE_BLOCKED', { projectileId, roomId: projectile.roomId, obstacleKind: solidStructure.kind });
        return;
      }
      const destructibleHit = findCampaignProjectileObstacleSweepHit(projectile, previous, room?.destructibles || [], {
        include: obstacle => !obstacle.broken && !obstacle.hidden,
      });
      if (destructibleHit) {
        const destructible = destructibleHit.obstacle;
        if (projectile.hostile) {
          if (bounceCampaignProjectile(projectile, {
            hitX: destructibleHit.hitX,
            hitY: destructibleHit.hitY,
          }, { x: destructibleHit.x, y: destructibleHit.y })) {
            emitEvent('PROJECTILE_BOUNCED', { projectileId, roomId: projectile.roomId, obstacleKind: destructible.kind });
            return;
          }
          detonateLoveBomb(projectile, destructibleHit.x, destructibleHit.y);
          detonateEnemyProjectileBlast(projectile, destructibleHit.x, destructibleHit.y);
          delete state.projectiles[projectileId];
          emitEvent('PROJECTILE_BLOCKED', { projectileId, roomId: projectile.roomId, obstacleKind: destructible.kind });
          return;
        }
        const impact = resolveCampaignProjectileDestructibleImpact(projectile, destructible);
        detonateLoveBomb(projectile, destructibleHit.x, destructibleHit.y);
        delete state.projectiles[projectileId];
        damageNetworkDestructible(state, projectile.roomId, destructible, impact.directDamage, emitEvent, random, {
          projectileId,
          playerId: projectile.hostile ? null : projectile.ownerId,
        });
        if (impact.blast && !projectile.hostile) {
          const owner = state.players?.[projectile.ownerId];
          const x = Number(projectile.x);
          const y = Number(projectile.y);
          livingEncounterEnemies(state, projectile.roomId).forEach(enemy => {
            if (Math.hypot(enemy.x - x, enemy.y - y) > impact.blast.radius + Number(enemy.radius || 20)) return;
            damageEnemy(state, enemy, impact.blast.damage, projectile.ownerId, emitEvent, {
              projectileId, attackKind: `${projectile.attackKind}_blocked_splash`,
              angle: Math.atan2(enemy.y - y, enemy.x - x), knockback: impact.blast.knockback,
            });
          });
          if (owner) {
            const targetIds = [];
            damageRivalsInRadius(state, owner, x, y, impact.blast.radius, impact.blast.damage, emitEvent,
              `${projectile.attackKind}_blocked_splash`, targetIds);
          }
          (room?.destructibles || []).forEach(prop => {
            if (prop.broken || prop.hidden) return;
            if (Math.hypot(prop.x - x, prop.y - y) > impact.blast.radius + Number(prop.r || 16)) return;
            damageNetworkDestructible(state, projectile.roomId, prop, impact.blast.damage, emitEvent, random, {
              projectileId, playerId: projectile.ownerId, attackKind: `${projectile.attackKind}_blocked_splash`,
            });
          });
        }
        return;
      }
      if (projectile.hostile) {
        const player = findCampaignProjectileEntitySweepHit(projectile, previous, Object.values(state.players || {}), {
          include: candidate => candidate && !candidate.downed && candidate.roomId === projectile.roomId,
        })?.entity;
        if (projectile.kind === 'love_bomb' && player) {
          detonateLoveBomb(projectile);
          delete state.projectiles[projectileId];
          return;
        }
        if (!player) return;
        delete state.projectiles[projectileId];
        damagePlayer(state, player, projectile.damage, projectile.ownerId, emitEvent, projectile.attackKind, {
          angle: Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1)),
          knockback: Number(projectile.knockback || 120),
        });
        // Shared ordered payload resolution; only authority mutation remains
        // local to this adapter.
        resolveCampaignProjectileStatusApplications(projectile, {
          random: () => random.next('encounter'),
          skipGuaranteedRoll: true,
          resolveProc: effect => ({ chance: effect.chance ?? 1, effectMultiplier: 1 }),
        }).forEach(effect => {
          applyAuthorityStatus(state, player, effect.key, effect.stacks, effect.duration, projectile.ownerId, {
            damageMultiplier: effect.damageMultiplier,
          });
        });
        if (Number(projectile.splash || 0) > 0) {
          livingRoomPlayers(state, projectile.roomId).forEach(candidate => {
            if (Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y) > Number(projectile.splash || 0)) return;
            damagePlayer(state, candidate, projectile.splashDamage, projectile.ownerId, emitEvent, `${projectile.attackKind}_splash`, {
              angle: Math.atan2(candidate.y - projectile.y, candidate.x - projectile.x), knockback: Number(projectile.knockback || 120),
            });
            if (Number(projectile.splashFireStacks || 0) > 0) applyAuthorityStatus(state, candidate, 'fire', projectile.splashFireStacks, projectile.fireDuration, projectile.ownerId);
          });
        } else if (Number(projectile.fireStacks || 0) > 0) {
          applyAuthorityStatus(state, player, 'fire', projectile.fireStacks, projectile.fireDuration, projectile.ownerId);
        }
        // Drain shots (Queen's missiles) siphon HP back to their owner on hit.
        const drainOwner = state.enemies?.[projectile.ownerId];
        const drain = resolveCampaignProjectileDrain(projectile, drainOwner);
        if (drainOwner && drain.healedAmount > 0) {
          drainOwner.health = drain.health;
          drainOwner.hp = drain.health;
        }
        detonateEnemyProjectileBlast(projectile);
        return;
      }
      if (state.matchRules?.friendlyFire) {
        const rival = findCampaignProjectileEntitySweepHit(projectile, previous, Object.values(state.players || {}), {
          include: candidate => candidate && candidate.id !== projectile.ownerId && !candidate.downed
            && candidate.roomId === projectile.roomId,
        })?.entity;
        if (rival) {
          damagePlayer(state, rival, playerDamage(state, projectile.ownerId, projectile.damage), projectile.ownerId, emitEvent, projectile.attackKind, {
            angle: Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1)),
            knockback: Number(projectile.knockback || 120),
          });
          delete state.projectiles[projectileId];
          return;
        }
      }
      const hitIds = new Set(Array.isArray(projectile.hitEnemyIds) ? projectile.hitEnemyIds : []);
      const enemy = findCampaignProjectileEntitySweepHit(
        projectile,
        previous,
        livingEncounterEnemies(state, projectile.roomId),
        { include: candidate => !hitIds.has(candidate.id) },
      )?.entity;
      if (!enemy) return;
      if (projectile.kind === 'love_bomb') {
        detonateLoveBomb(projectile);
        delete state.projectiles[projectileId];
        return;
      }
      damageEnemy(state, enemy, projectile.damage, projectile.ownerId, emitEvent, {
        projectileId,
        attackKind: projectile.attackKind,
        // Player shots shove along their travel direction.
        angle: Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1)),
        knockback: Number(projectile.knockback || 120),
        lightning: !!projectile.lightning,
        ignoreGodMode: !!projectile.ignoreGodMode,
      });
      const projectileOwner = state.players?.[projectile.ownerId];
      if (!enemy.dead && projectileOwner) {
        applyAuthorityOnHitStatusProcs(state, enemy, projectileOwner, projectile.hitOptions || {}, random);
      }
      if (Number(projectile.splash || 0) > 0) {
        livingEncounterEnemies(state, projectile.roomId).forEach(candidate => {
          if (Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y) > Number(projectile.splash)) return;
          damageEnemy(state, candidate, projectile.splashDamage, projectile.ownerId, emitEvent, {
            projectileId,
            attackKind: projectile.attackKind,
          });
          const directStacks = candidate.id === enemy.id ? Number(projectile.fireStacks || 0) : 0;
          const splashStacks = Number(projectile.splashFireStacks || 1);
          applyFireStatus(state, candidate, directStacks + splashStacks, projectile.fireDuration, projectile.ownerId);
        });
      } else if (Number(projectile.fireStacks || 0) > 0) {
        applyFireStatus(state, enemy, projectile.fireStacks, projectile.fireDuration, projectile.ownerId);
      }
      if (Number(projectile.remainingPierces || 0) > 0) {
        projectile.remainingPierces -= 1;
        projectile.hitEnemyIds = [...hitIds, enemy.id];
      } else {
        if (projectile.returning && projectile.returnPhase === 'out') {
          if (!beginBoomerangReturn(projectile)) delete state.projectiles[projectileId];
          emitEvent('SARGES_HAMMER_BOUNCED', { projectileId, playerId: projectile.ownerId, enemyId: enemy.id, lightning: true });
        } else {
          delete state.projectiles[projectileId];
        }
      }
    });
  }

  function collectAuthorityCampaignPickup(state, player, itemKey, options = {}, emitEvent = () => {}) {
    const acquisition = collectCampaignPickup(state, player, itemKey, options);
    if (!acquisition?.ok || acquisition.itemKey !== 'rich_mans_blues') return acquisition;
    const practiceMode = (state.gameMode || state.matchRules?.gameMode || state.matchRules?.mode) === 'practice';
    if (practiceMode) return acquisition;
    const crystals = getCampaignRichMansBluesCrystalReward(
      Number(state.floorsEntered ?? state.floorNumber ?? 1),
      Number(acquisition.amount || 0),
    );
    if (crystals <= 0) return acquisition;
    player.loopCrystals = Math.max(0, Number(player.loopCrystals || 0)) + crystals;
    player.runCrystalsEarned = Math.max(0, Number(player.runCrystalsEarned || 0)) + crystals;
    acquisition.loopCrystalGain = crystals;
    emitEvent('LOOP_CRYSTALS_AWARDED', {
      playerId: player.id, itemKey: 'rich_mans_blues', amount: crystals,
      loopCrystals: player.loopCrystals, source: 'item_pickup',
    });
    return acquisition;
  }

  function updatePickups(state, emitEvent, random) {
    Object.entries(state.pickups || {}).forEach(([pickupId, pickup]) => {
      if (state.pickups[pickupId] !== pickup) return;
      const player = Object.values(state.players || {}).find(candidate => (
          candidate && !candidate.downed && candidate.roomId === pickup.roomId
          && Math.hypot(candidate.x - pickup.x, candidate.y - pickup.y)
            <= Number(candidate.radius || 18) + Number(pickup.radius || 13) + 5 + Number(candidate.pickupRadius || 0)
      ));
      if (!player) return;
      if (pickup.endgameChoice && ['crown', 'returnGate', 'descend'].includes(pickup.type)) {
        const resolution = resolveCampaignGodEndgameChoice(pickup.type, authorityGodEndgameOptions(state));
        if (!resolution.ok) return;
        Object.entries(state.pickups).forEach(([candidateId, candidate]) => {
          if (candidate?.endgameChoice && candidate.roomId === pickup.roomId) delete state.pickups[candidateId];
        });
        emitEvent('GOD_ENDGAME_CHOICE_SELECTED', {
          playerId: player.id, roomId: pickup.roomId, pickupType: pickup.type, action: resolution.action,
        });
        if (resolution.action === 'victory') {
          state.status = 'ended';
          emitEvent('RUN_ENDED', { result: 'victory', reason: 'god-crown', floorNumber: Number(state.floorNumber || 1), playerId: player.id });
          return;
        }
        if (resolution.action === 'loop') {
          const nextLoopIndex = Math.max(0, Number(state.runLoopIndex || 0)) + 1;
          const loopPlan = getLoopFloorPlan(nextLoopIndex);
          activePlayers(state).forEach(member => {
            member.loopCrystals = Math.max(0, Number(member.loopCrystals || 0)) + 1;
            const recovered = Math.max(0, Math.round(Number(member.maxHp || 0) * Number(loopPlan.recoveryFraction || 0)));
            member.hp = Math.min(Number(member.maxHp || 0), Number(member.hp || 0) + recovered);
          });
          advanceToNextFloor(state, emitEvent, 0, { targetFloor: 1, runLoopIndex: nextLoopIndex });
          spawnAuthorityLoopBlueRewardChoices(state, emitEvent);
          emitEvent('LOOP_COMPLETED', { playerId: player.id, loopIndex: nextLoopIndex, partyCrystalGain: 1 });
          return;
        }
        if (resolution.action === 'descend') {
          advanceToNextFloor(state, emitEvent, 1, { allowPastMax: true, runLoopIndex: state.runLoopIndex });
          return;
        }
        return;
      }
      if (pickup.type === 'challengeRune') {
        const room = currentRoom(state, pickup.roomId);
        const result = resolveCampaignChallengePickup(room, pickup, { timerRefund: 2 });
        if (!result.ok) return;
        delete state.pickups[pickupId];
        emitEvent(result.type, { playerId: player.id, roomId: pickup.roomId, pickupId, timerRefund: result.timerRefund, remaining: result.remaining });
        if (result.complete) {
          Object.values(state.enemies || {}).filter(enemy => enemy?.roomId === pickup.roomId).forEach(enemy => { delete state.enemies[enemy.id]; });
          markEncounterCleared(state, pickup.roomId, emitEvent);
        }
        return;
      }
      if (pickup.type === 'challengeBomb') {
        const room = currentRoom(state, pickup.roomId);
        const remainingSafeBombs = Object.values(state.pickups || {}).filter(candidate => candidate.id !== pickupId && candidate.type === 'challengeBomb' && candidate.safe).length;
        const result = resolveCampaignChallengePickup(room, pickup, { damage: 28, remainingSafeBombs });
        if (!result.ok) return;
        if (result.removePickup) delete state.pickups[pickupId];
        emitEvent(result.type, { playerId: player.id, roomId: pickup.roomId, pickupId, remaining: result.remaining, damage: result.damage });
        if (result.complete) {
          Object.values(state.enemies || {}).filter(enemy => enemy?.roomId === pickup.roomId).forEach(enemy => { delete state.enemies[enemy.id]; });
          markEncounterCleared(state, pickup.roomId, emitEvent);
        }
        if (result.spawnFailureHazard) {
          room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
          room.hazards.push({ kind: 'bomb_aoe', x: pickup.x, y: pickup.y, r: 150, blastRadius: 150, fuse: 3, fuseDuration: 3, baseDamage: 250, enemy: true, source: 'bomb_aoe' });
          const failed = finishCampaignChallenge(room, 'failed', { text: 'WRONG BOMB' });
          if (failed.ok) emitEvent('CHALLENGE_FAILED', { roomId: room.id, ...failed });
        }
        return;
      }
      if (pickup.type === 'challengeSwitch') {
        if (pickup.armed === false) return;
        const room = currentRoom(state, pickup.roomId);
        const result = resolveCampaignChallengePickup(room, pickup);
        if (!result.ok) return;
        emitEvent(result.type, {
          playerId: player.id, roomId: pickup.roomId, pickupId,
          progress: result.progress, total: result.total, penalty: result.penalty,
        });
        if (result.complete) markEncounterCleared(state, pickup.roomId, emitEvent);
        return;
      }
      if (pickup.type === 'jesterPortal') {
        if (!pickup.active && Number(state.tick || 0) - Number(pickup.spawnTick || 0) < Number(pickup.activateDelayTicks || 15)) return;
        pickup.active = true;
        const transition = useCampaignJesterGate({ floorNumber: state.floorNumber }, pickup, { maxFloor: MAX_FLOOR });
        if (!transition.ok) return;
        delete state.pickups[pickupId];
        emitEvent('JESTER_GATE_USED', { playerId: player.id, ...transition });
        advanceToNextFloor(state, emitEvent, transition.skipFloors);
        return;
      }
      if (pickup.type === 'treasureKey') {
        if (!beginAuthorityTreasureHuntEscape(state, player, emitEvent, random)) return;
        delete state.pickups[pickupId];
        emitEvent('TREASURE_HUNT_KEY_COLLECTED', { playerId: player.id, pickupId, roomId: pickup.roomId });
        return;
      }
      if (pickup.type === 'endlessNextWave') {
        startAuthorityEndlessWave(state, player, pickupId, emitEvent);
        return;
      }
      if (pickup.type === 'bossRushNextBoss') {
        startAuthorityNextBossRushBoss(state, player, pickupId, emitEvent);
        return;
      }
      if (pickup.type === 'adapterPortal') {
        if (!pickup.active && Number(state.tick || 0) - Number(pickup.spawnTick || 0) < Number(pickup.activateDelayTicks || 15)) return;
        pickup.active = true;
        const targetRoom = currentRoom(state, pickup.targetRoomId)
          || state.floorState?.layout?.rooms?.find(room => room.gx === pickup.targetGx && room.gy === pickup.targetGy);
        if (!targetRoom || targetRoom.id === player.roomId) {
          delete state.pickups[pickupId];
          emitEvent('ADAPTER_PORTAL_INVALIDATED', { playerId: player.id, pickupId, roomId: pickup.roomId });
          return;
        }
        const goldSpent = Math.floor(Math.max(0, Number(player.coins || 0)) / 2);
        player.coins = Math.max(0, Number(player.coins || 0) - goldSpent);
        delete state.pickups[pickupId];
        player.roomId = targetRoom.id;
        player.x = Number(state.floorState?.width || 900) / 2;
        player.y = Number(state.floorState?.height || 700) / 2;
        player.vx = 0;
        player.vy = 0;
        emitEvent('ADAPTER_PORTAL_USED', {
          playerId: player.id, pickupId, roomId: pickup.roomId, targetRoomId: targetRoom.id, goldSpent, coins: player.coins,
        });
        return;
      }
      if (pickup.type === 'challengeStarter') {
        const room = currentRoom(state, pickup.roomId);
        if (!room || room.type !== 'challenge' || room.challengeStarted) return;
        room.challengeStarted = true;
        room.challengeLifecycleState = 'active';
        room.challengeFailed = false;
        // Campaign has one hero. Persist the starter as the explicit
        // multiplayer owner for its immediate XP/weapon completion rewards.
        room.challengeRewardPlayerId = player.id;
        // A mirror challenge reflects the activating player's own kit.
        if ((room.challengeType || pickup.trial) === 'mirror') room.mirrorSourcePlayerId = player.id;
        if (['circuit', 'stillness'].includes(room.challengeType || pickup.trial)) {
          const stream = random.scoped(`challenge:circuit:${state.floorNumber}:${room.id}`);
          const started = startCampaignCircuitChallenge(room, {
            difficultyStatMultiplier: state.matchRules?.difficulty?.statMultiplier,
            random: () => stream.next(),
          });
          if (!started.ok) return;
          started.switches.forEach(switchDef => {
            const switchId = state.allocateEntityId('pickup');
            state.pickups[switchId] = { id: switchId, ...switchDef, roomId: room.id, radius: 16, spawnTick: state.tick };
            emitEvent('PICKUP_SPAWNED', { pickupId: switchId, pickupType: 'challengeSwitch', roomId: room.id });
          });
        }
        if ((room.challengeType || pickup.trial) === 'storm') {
          const started = startCampaignStormChallenge(room, { floorNumber: state.floorNumber });
          if (!started.ok) return;
        }
        if ((room.challengeType || pickup.trial) === 'survival') {
          const started = startCampaignSurvivalChallenge(room, {
            floorNumber: state.floorNumber, width: state.floorState?.width, height: state.floorState?.height,
          });
          if (!started.ok) return;
        }
        if ((room.challengeType || pickup.trial) === 'runes') {
          const runeStream = random.scoped(`challenge:runes:${state.floorNumber}:${room.id}`);
          const started = startCampaignRuneChallenge(room, {
            floorNumber: state.floorNumber, width: state.floorState?.width, height: state.floorState?.height,
            random: () => runeStream.next(),
          });
          if (!started.ok) return;
          started.runes.forEach(rune => {
            const pickupId = state.allocateEntityId('pickup');
            state.pickups[pickupId] = { id: pickupId, ...rune, roomId: room.id, radius: 16, spawnTick: state.tick };
          });
        }
        if ((room.challengeType || pickup.trial) === 'bomb') {
          const bombStream = random.scoped(`challenge:bombs:${state.floorNumber}:${room.id}`);
          const started = startCampaignBombChallenge(room, {
            floorNumber: state.floorNumber, width: state.floorState?.width, height: state.floorState?.height,
            random: () => bombStream.next(),
          });
          if (!started.ok) return;
          started.bombs.forEach(bomb => {
            const pickupId = state.allocateEntityId('pickup');
            state.pickups[pickupId] = { id: pickupId, ...bomb, roomId: room.id, radius: 22, spawnTick: state.tick };
          });
          // Campaign rings the normal Bomb trial with five snipers; tutorial
          // variants deliberately omit them, so no generic encounter is used.
          if (!room.tutorialLesson) spawnAuthorityTrialWave(state, room, 5, random, emitEvent, { type: 'sniper' });
        }
        delete state.pickups[pickupId];
        emitEvent('CHALLENGE_STARTED', { playerId: player.id, roomId: room.id, challengeType: room.challengeType || pickup.trial });
        return;
      }
      if (pickup.type === 'secretWarp') {
        const targetFloor = Math.max(1, Math.min(MAX_FLOOR, Number(pickup.targetFloor || state.floorNumber)));
        const steps = targetFloor - Number(state.floorNumber || 1);
        if (steps === 0) return;
        delete state.pickups[pickupId];
        emitEvent('SECRET_WARP_USED', { playerId: player.id, roomId: pickup.roomId, targetFloor });
        advanceToNextFloor(state, emitEvent, steps);
        return;
      }
      if (pickup.type === 'secretVendor') {
        const vendorState = { floorNumber: state.floorNumber, loopCrystals: Number(player.loopCrystals || 0) };
        const room = currentRoom(state, pickup.roomId);
        const purchase = purchaseCampaignSecretVendor(vendorState, room, player, pickup);
        if (!purchase.ok) return;
        player.loopCrystals = Number(vendorState.loopCrystals || 0);
        if (purchase.rewardKey) {
          const loot = random.stream('loot');
          collectAuthorityCampaignPickup(state, player, purchase.rewardKey, {
            duplicateChance: player.itemStats?.itemDuplicateChance,
            random: () => loot.next(),
            rollItem: (nextRandom, excludeKeys) => rollCampaignItem(nextRandom, { excludeKeys }),
          }, emitEvent);
        } else if (purchase.offerKind === 'vitality') {
          player.hp = Math.min(player.maxHp, Number(player.hp || 0) + purchase.heal * Math.max(1, Number(player.itemStats?.healingMultiplier || 1)));
        } else if (purchase.offerKind === 'xp') player.xp = Number(player.xp || 0) + purchase.xp;
        else player.coins = Number(player.coins || 0) + purchase.coins;
        delete state.pickups[pickupId];
        emitEvent('SECRET_VENDOR_PURCHASED', { playerId: player.id, roomId: pickup.roomId, ...purchase });
        return;
      }
      if (pickup.type === 'secretLady') {
        const rewardKey = String(pickup.rewardKey || '');
        if (!rewardKey) return;
        const loot = random.stream('loot');
        const acquisition = collectAuthorityCampaignPickup(state, player, rewardKey, {
          duplicateChance: player.itemStats?.itemDuplicateChance,
          random: () => loot.next(),
          rollItem: (nextRandom, excludeKeys) => rollCampaignItem(nextRandom, { excludeKeys }),
        }, emitEvent);
        if (!acquisition.ok) return;
        delete state.pickups[pickupId];
        emitEvent('SECRET_LADY_GIFTED', { playerId: player.id, roomId: pickup.roomId, itemKey: rewardKey });
        return;
      }
      if (pickup.type === 'secret_boss_chest') {
        const room = currentRoom(state, pickup.roomId);
        const loot = random.scoped(`secret-boss:loot:${state.floorNumber}:${pickup.roomId}:${pickupId}`);
        const rewardKey = String(pickup.rewardKey || rollCampaignItem(() => loot.next(), { elite: true }));
        const result = lootCampaignSecretBossChest({ floorNumber: state.floorNumber }, room, player, pickup, { rewardKey });
        if (!result.ok) return;
        const acquisition = collectAuthorityCampaignPickup(state, player, result.rewardKey, {
          duplicateChance: player.itemStats?.itemDuplicateChance,
          random: () => loot.next(), rollItem: nextRandom => rollCampaignItem(nextRandom),
        }, emitEvent);
        if (!acquisition.ok) return;
        player.coins = Number(player.coins || 0) + Number(result.coins || 0);
        delete state.pickups[pickupId];
        emitEvent('SECRET_BOSS_CHEST_LOOTED', { playerId: player.id, roomId: pickup.roomId, pickupId, itemKey: result.rewardKey, coins: result.coins });
        return;
      }
      if (pickup.type === 'rewardChoice') {
        const groupId = String(pickup.groupId || '');
        if (!groupId || !pickup.key) return;
        const loot = random.scoped(`boss-reward:claim:${state.floorNumber}:${pickup.roomId}:${groupId}:${pickupId}`);
        const acquisition = collectAuthorityCampaignPickup(state, player, pickup.key, {
          duplicateChance: player.itemStats?.itemDuplicateChance,
          canDuplicate: pickup.key !== 'artificer_charger',
          random: () => loot.next(),
          rollItem: (nextRandom, excludeKeys) => rollCampaignItem(nextRandom, { excludeKeys }),
        }, emitEvent);
        if (!acquisition.ok) return;
        const remainingBeforePick = Math.max(1, Math.floor(Number(pickup.picksRemaining || 1)));
        const remainingAfterPick = remainingBeforePick - 1;
        Object.entries(state.pickups).forEach(([candidateId, candidate]) => {
          if (candidate.type !== 'rewardChoice' || String(candidate.groupId || '') !== groupId) return;
          if (candidateId === pickupId || remainingAfterPick <= 0) {
            delete state.pickups[candidateId];
            return;
          }
          candidate.picksRemaining = remainingAfterPick;
          candidate.label = `${remainingAfterPick}/${Math.max(1, Number(candidate.choiceTotal || String(candidate.label || '').split('/')[1]) || 5)}`;
        });
        if (acquisition.jester?.ok) {
          Object.entries(acquisition.jester.bonusItemCounts).forEach(([itemKey, bonusAmount]) => {
            emitEvent('ITEM_BONUS_ACQUIRED', { playerId: player.id, itemKey, amount: bonusAmount, source: 'jesters_dice' });
          });
          emitEvent('JESTER_GATE_PENDING', { playerId: player.id, skipFloors: acquisition.jester.skipFloors });
        }
        maybeGrantGodMode(state, player, emitEvent);
        emitEvent('PICKUP_COLLECTED', {
          pickupId, playerId: player.id, pickupType: 'item', amount: acquisition.amount,
          healedAmount: 0, gold: player.coins, itemKey: pickup.key, roomId: pickup.roomId,
        });
        emitEvent('BOSS_REWARD_SELECTED', {
          playerId: player.id, roomId: pickup.roomId, pickupId, itemKey: pickup.key,
          groupId, picksRemaining: remainingAfterPick,
        });
        return;
      }
      let amount = Math.max(0, Number(pickup.amount || 0));
      if (pickup.type === 'coin') {
        amount = Math.round(Math.max(1, amount || 1) * Math.max(1, Number(player.itemStats?.coinPickupMultiplier || 1)))
          + Math.max(0, Number(player.items?.naked_kings_last_penny || 0))
          + Math.max(0, Number(player.goldBonus || 0));
        player.coins = Math.max(0, Number(player.coins || 0)) + amount;
      } else if (pickup.type === 'item') {
        const loot = random.stream('loot');
        const acquisition = collectAuthorityCampaignPickup(state, player, pickup.key, {
          duplicateChance: player.itemStats?.itemDuplicateChance,
          canDuplicate: pickup.key !== 'artificer_charger',
          random: () => loot.next(),
          rollItem: (nextRandom, excludeKeys) => rollCampaignItem(nextRandom, { excludeKeys }),
        }, emitEvent);
        if (!acquisition.ok) return;
        amount = acquisition.amount;
        if (acquisition.jester?.ok) {
          Object.entries(acquisition.jester.bonusItemCounts).forEach(([itemKey, bonusAmount]) => {
            emitEvent('ITEM_BONUS_ACQUIRED', { playerId: player.id, itemKey, amount: bonusAmount, source: 'jesters_dice' });
          });
          emitEvent('JESTER_GATE_PENDING', { playerId: player.id, skipFloors: acquisition.jester.skipFloors });
        }
        // Owning every relic ignites the 12s god-mode window.
        maybeGrantGodMode(state, player, emitEvent);
      } else if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const room = currentRoom(state, pickup.roomId);
        const gardenRandom = random?.scoped?.(`garden:respawn:${state.floorNumber}:${pickup.roomId}:${pickup.gardenNodeId}:${state.tick}`);
        const collected = collectCampaignGardenFruit(room, pickup, state.elapsedSeconds, {
          random: gardenRandom ? () => gardenRandom.next() : authorityFallbackRandom,
          minimumRespawnSeconds: 12,
          respawnSpreadSeconds: 10,
        });
        if (!collected.ok) return;
        amount = collected.heal * Math.max(1, Number(player.itemStats?.healingMultiplier || 1));
        const before = Number(player.hp || 0);
        player.hp = Math.min(Number(player.maxHp || 100), before + amount);
        amount = Math.max(0, player.hp - before);
      }
      let healedAmount = 0;
      if (pickup.type === 'potion') {
        const potion = resolveCampaignPotionPickup(player, {
          itemStats: player.itemStats,
          baseHeal: resolveCampaignPotionBaseHeal({
            difficulty: state.matchRules?.difficulty,
            difficultyPotionHealMultiplier: state.matchRules?.potionHealMultiplier,
            healingMultiplier: player.itemStats?.healingMultiplier,
          }),
          random: () => random?.next?.('encounter') ?? 1,
          getPotionCarryCap: getCampaignPotionCarryCap,
        });
        if (!potion.ok) return;
        amount = potion.kind === 'stored' ? potion.storedGain : potion.requestedHeal;
        healedAmount = potion.healedAmount;
      }
      delete state.pickups[pickupId];
      emitEvent('PICKUP_COLLECTED', {
        pickupId,
        playerId: player.id,
        pickupType: pickup.type,
        amount,
        healedAmount,
        gold: player.coins,
        itemKey: pickup.key || '',
        roomId: pickup.roomId,
      });
    });
  }

  function updateMovingWorldPickups(state, fixedDelta) {
    Object.values(state.pickups || {}).forEach(pickup => {
      if (pickup.type === 'challengeSwitch') {
        const occupied = Object.values(state.players || {}).some(player => player && !player.downed
          && player.roomId === pickup.roomId
          && Math.hypot(Number(player.x) - Number(pickup.x), Number(player.y) - Number(pickup.y)) <= 44);
        if (!occupied) pickup.armed = true;
        return;
      }
      if (pickup.type === 'challengeRune') {
        const target = Object.values(state.players || {}).filter(player => player && !player.downed && player.roomId === pickup.roomId)
          .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
        if (!target) return;
        advanceCampaignChallengeRune(pickup, target, fixedDelta, {
          width: state.floorState?.width, height: state.floorState?.height,
          wallThickness: state.floorState?.wallThickness, radius: 16, playerMoveSpeed: target.moveSpeed || 228,
        });
        return;
      }
      // Standard loot must never inherit a velocity from an older snapshot or
      // an accidental gameplay mutation. Challenge bombs are authored moving
      // challenge objects and intentionally retain their velocity.
      if (pickup.type !== 'challengeBomb') {
        pickup.vx = 0;
        pickup.vy = 0;
        delete pickup.magnetized;
        return;
      }
      if (!(Number(pickup.vx || 0) || Number(pickup.vy || 0))) return;
      advanceCampaignMovingWorldEntity(pickup, fixedDelta, {
        width: state.floorState?.width,
        height: state.floorState?.height,
        margin: pickup.type === 'challengeBomb' ? 90 : Number(pickup.radius || 0),
      });
    });
  }

  function updateAuthorityGardenGrowth(state, emitEvent) {
    if (Number(state.floorNumber || 1) <= 5) return;
    const occupied = new Set(activePlayers(state).map(player => player.roomId));
    (state.floorState?.layout?.rooms || []).filter(room => occupied.has(room.id)).forEach(room => {
      if (!Array.isArray(room.gardenFruitNodes)) return;
      room.pickups = Object.values(state.pickups || {}).filter(pickup => pickup.roomId === room.id);
      room.gardenFruitNodes.forEach(node => {
        const result = updateCampaignGardenNode(room, node, state.elapsedSeconds);
        if (!result.spawned) return;
        const pickupId = state.allocateEntityId('pickup');
        state.pickups[pickupId] = { id: pickupId, ...result.pickup, roomId: room.id, radius: 13, spawnTick: state.tick };
        emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: result.pickup.type, roomId: room.id, gardenNodeId: node.id });
      });
      delete room.pickups;
    });
  }

  function ensureJesterGate(state, emitEvent) {
    if (Number(state.floorSkipPending || 0) <= 0) return;
    const existing = Object.values(state.pickups || {}).some(pickup => pickup?.type === 'jesterPortal');
    const owner = activePlayers(state).find(player => !player.downed);
    if (!owner) return;
    const created = createCampaignJesterGate(state, {
      floorNumber: state.floorNumber,
      maxFloor: MAX_FLOOR,
      hasExistingGate: existing,
      x: Number(owner.x),
      y: Number(owner.y) - 72,
      activateAt: 0.75,
    });
    if (!created.ok) return;
    const pickupId = state.allocateEntityId('pickup');
    state.pickups[pickupId] = {
      id: pickupId,
      ...created.gate,
      roomId: owner.roomId,
      radius: 28,
      active: false,
      spawnTick: state.tick,
      activateDelayTicks: 15,
    };
    emitEvent('JESTER_GATE_SPAWNED', { pickupId, roomId: owner.roomId, skipFloors: created.gate.skipFloors });
  }

  // ── Floor progression, run end, and downed/revive ───────────────────────
  // Runs as a deterministic simulation system so it behaves identically on the
  // authority and any client that re-simulates.

  function activePlayers(state) {
    return Object.values(state.players || {}).filter(player => player && !player.disconnected);
  }

  function isExitRoomCleared(state, room) {
    if (!room) return false;
    const encounter = state.floorState?.encounters?.[room.id];
    // An exit room is "cleared" once its encounter has been spawned and beaten.
    return encounter?.status === 'cleared';
  }

  // Spawn the stairs interactable once the floor's exit room is cleared. Boss
  // and god exit rooms count too — beating the boss reveals the stairs.
  function ensureFloorExit(state, emitEvent) {
    const layout = state.floorState?.layout;
    const exitRoomId = layout?.exitRoomId;
    if (!exitRoomId) return;
    const existing = Object.values(state.interactables || {}).find(item => item.kind === 'stairs' && item.roomId === exitRoomId);
    if (existing) return;
    const exitRoom = (layout.rooms || []).find(room => room.id === exitRoomId);
    if (!isExitRoomCleared(state, exitRoom)) return;
    // Treasure Hunt's vault boss yields a key and never an immediate stairs
    // exit. The returned start-room ladder is materialized separately after the
    // escape lifecycle has actually completed.
    if (['treasure_hunt', 'endless', 'boss_rush', 'rival_rumble'].includes(authorityGameMode(state))) return;
    // The God room has its authored crown/loop/descent pickups. It must never
    // also fabricate a generic final stairs dwell gate on the authority. This
    // also covers restored checkpoints that were saved after the God encounter
    // cleared but before its choice snapshot was published.
    if (exitRoom.type === 'god') {
      spawnAuthorityGodEndgameChoices(state, exitRoom.id, emitEvent);
      return;
    }
    const isFinalFloor = Number(state.floorNumber || 1) >= MAX_FLOOR || exitRoom.type === 'god';
    const interactableId = state.allocateEntityId('interactable');
    state.interactables[interactableId] = {
      id: interactableId,
      kind: 'stairs',
      roomId: exitRoomId,
      x: Number(state.floorState.width || 900) / 2,
      y: Number(state.floorState.height || 700) / 2,
      radius: 30,
      final: isFinalFloor,
      dwellByPlayer: {},
      spawnTick: state.tick,
    };
    emitEvent('INTERACTABLE_SPAWNED', { interactableId, kind: 'stairs', roomId: exitRoomId, final: isFinalFloor });
  }

  // Regenerate the floor at floorNumber+1 and reset the party into its start
  // room. Enemies, projectiles, pickups and interactables are cleared; the
  // floor seed is derived deterministically from the match seed.
  function advanceToNextFloor(state, emitEvent, floorSteps = 1, options = {}) {
    const steps = Math.trunc(Number(floorSteps || 1)) || 1;
    const requestedFloor = options.targetFloor == null ? Number(state.floorNumber || 1) + steps : Number(options.targetFloor);
    const nextFloorNumber = Math.max(1, options.allowPastMax ? Math.trunc(requestedFloor) : Math.min(MAX_FLOOR, Math.trunc(requestedFloor)));
    const runLoopIndex = Math.max(0, Math.trunc(Number(options.runLoopIndex ?? state.runLoopIndex ?? state.floorState?.runLoopIndex) || 0));
    const floorSeed = `${state.matchSeed}|floor:${nextFloorNumber}`;
    const layout = typeof generateFloorLayout === 'function'
      ? generateFloorLayout({
        matchSeed: state.matchSeed,
        floorSeed,
        floorNumber: nextFloorNumber,
        generationVersion: state.generationVersion,
        contentVersion: state.contentVersion,
        maxFloor: MAX_FLOOR,
        gameMode: authorityGameMode(state),
        runLoopIndex,
      })
      : state.floorState.layout;
    state.floorNumber = nextFloorNumber;
    state.runLoopIndex = runLoopIndex;
    state.floorSeed = floorSeed;
    state.enemies = {};
    state.projectiles = {};
    state.abilityEntities = {};
    state.pickups = {};
    state.interactables = {};
    const width = Number(state.floorState.width) || 900;
    const height = Number(state.floorState.height) || 700;
    state.floorState = {
      ...state.floorState,
      currentRoomId: layout.startRoomId,
      visitedRoomIds: [layout.startRoomId],
      roomTransition: null,
      transitionSequence: 0,
      transitionsByPlayer: {},
      runLoopIndex,
      encounters: {},
      rewards: {},
      layout,
    };
    const wall = Number(state.floorState.wallThickness) || 28;
    activePlayers(state).forEach((player, index) => {
      const radius = Math.max(1, Number(player.radius) || 18);
      const inset = wall + radius + 18;
      const offset = (index - (activePlayers(state).length - 1) / 2) * 52;
      player.roomId = layout.startRoomId;
      player.x = Math.max(inset, Math.min(width - inset, width / 2 + offset));
      player.y = height / 2;
      player.vx = 0;
      player.vy = 0;
    });
    applyPartyRivalCurses(state, emitEvent);
    schedulePartyRivalCompanions(state, emitEvent);
    scheduleRivalReturns(state, emitEvent);
    emitEvent('FLOOR_ADVANCED', { floorNumber: nextFloorNumber, floorSeed, startRoomId: layout.startRoomId });
  }

  function authorityGodEndgameOptions(state) {
    return {
      gameMode: state.gameMode || state.matchRules?.gameMode || 'normal',
      endlessDescent: !!(state.matchRules?.endlessDescent || state.matchRules?.legacy?.endless_descent),
      width: Number(state.floorState?.width || 900),
      height: Number(state.floorState?.height || 700),
    };
  }

  function spawnAuthorityGodEndgameChoices(state, roomId, emitEvent) {
    if (Object.values(state.pickups || {}).some(pickup => pickup?.roomId === roomId && pickup?.endgameChoice)) return;
    const plan = createCampaignGodEndgamePlan(authorityGodEndgameOptions(state));
    plan.forEach(descriptor => {
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = {
        id: pickupId, ...descriptor, roomId, radius: 26, amount: 1,
        endgameChoice: true, spawnTick: state.tick,
      };
      emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: descriptor.type, roomId, source: 'god_endgame' });
    });
    if (plan.length) emitEvent('GOD_ENDGAME_CHOICES_SPAWNED', { roomId, choices: plan.map(choice => choice.type) });
  }

  function spawnAuthorityLoopBlueRewardChoices(state, emitEvent) {
    const randomService = combatRandomByState.get(state);
    const stream = randomService?.scoped?.(`loop:${state.runLoopIndex}:blue-choice`);
    const blueItemKeys = Object.entries(ITEM_DEFS)
      .filter(([, item]) => String(item?.rarity || '').toLowerCase() === 'blue')
      .map(([key]) => key);
    const plan = createCampaignLoopBlueRewardPlan({
      blueItemKeys, random: stream ? () => stream.next() : authorityFallbackRandom,
      width: Number(state.floorState?.width || 900), height: Number(state.floorState?.height || 700),
      loopIndex: state.runLoopIndex,
    });
    plan.forEach(descriptor => {
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = { id: pickupId, ...descriptor, roomId: state.floorState.currentRoomId, radius: 20, amount: 1, spawnTick: state.tick };
      emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: 'rewardChoice', itemKey: descriptor.key, roomId: state.floorState.currentRoomId, source: descriptor.source });
    });
    if (plan.length) emitEvent('LOOP_BLUE_REWARDS_SPAWNED', {
      roomId: state.floorState.currentRoomId,
      groupId: plan[0].groupId,
      picksRemaining: plan[0].picksRemaining,
      optionCount: plan.length,
    });
  }

  // Party-wide rival curses (shared-roster model): each defeated/alive-descended
  // rival arms a curse on the party's NEXT floor, keyed by character. On floor
  // advance the queued curses land on matchRules so the whole party feels them,
  // then clear. Mirrors queueRivalCurse -> seedRivalCurses in the campaign.
  function getRosterEntry(state, characterKey) {
    if (!characterKey) return null;
    const roster = Array.isArray(state.rivalRoster) ? state.rivalRoster : (state.rivalRoster = []);
    let entry = roster.find(candidate => candidate.characterKey === characterKey);
    if (!entry) {
      entry = { characterKey, lives: 2, relationship: 0, friend: false, vendetta: false, dead: false, returnFloor: 0, pendingSpawn: false };
      roster.push(entry);
    }
    return entry;
  }

  // Add a character to the shared rival roster so it will return to hunt the
  // party. Called by the run-service layer when a rival character is introduced.
  function addPartyRival(state, characterKey, options = {}) {
    const entry = getRosterEntry(state, characterKey);
    if (!entry) return null;
    entry.lives = Math.max(1, Math.trunc(Number(options.lives ?? entry.lives ?? 2)));
    entry.returnFloor = Math.min(MAX_FLOOR, Math.max(1, Number(options.returnFloor ?? (Number(state.floorNumber || 1) + 1))));
    entry.dead = false;
    entry.friend = !!options.friend;
    entry.vendetta = !!options.vendetta;
    entry.pendingSpawn = false;
    return entry;
  }

  function queuePartyRivalCurse(state, characterKey, options = {}) {
    if (!characterKey) return;
    const curses = state.pendingRivalCurses || (state.pendingRivalCurses = {});
    const descended = !!options.descended;
    switch (characterKey) {
      case 'princess':
        if (!curses.obscureMap) curses.obscureMap = true;
        break;
      case 'thorn_knight':
        curses.lowerCombat = true;
        break;
      case 'metao':
        curses.reducePotions = true;
        break;
      case 'gelleh':
        curses.gellehTurrets = Math.max(Number(curses.gellehTurrets || 0), descended ? 4 : 3);
        break;
      case 'mooggy':
        curses.mooggyTraps = Math.max(Number(curses.mooggyTraps || 0), descended ? 20 : 15);
        break;
      default:
        break;
    }
  }

  function applyPartyRivalCurses(state, emitEvent) {
    const curses = state.pendingRivalCurses;
    if (!curses || Object.keys(curses).length === 0) return;
    const rules = state.matchRules || (state.matchRules = {});
    rules.rivalCurses = { ...curses };
    // Wire the mechanically-simple curses straight into matchRules so the shared
    // systems already reading those flags apply them party-wide.
    if (curses.reducePotions) rules.potionDropMultiplier = 0.4;
    if (curses.lowerCombat) rules.rivalCombatCurse = true;
    if (curses.obscureMap) rules.obscureMap = true;
    if (Number(curses.mooggyTraps || 0) > 0) rules.pendingMooggyTraps = Number(curses.mooggyTraps);
    if (Number(curses.gellehTurrets || 0) > 0) rules.pendingGellehTurrets = Number(curses.gellehTurrets);
    emitEvent('RIVAL_CURSES_APPLIED', { floorNumber: state.floorNumber, curses: { ...curses } });
    state.pendingRivalCurses = {};
  }

  // Rivals that lost a life earlier return on their scheduled floor and are
  // injected into that floor's first combat room mirroring the slain character.
  function scheduleRivalReturns(state, emitEvent) {
    const roster = Array.isArray(state.rivalRoster) ? state.rivalRoster : [];
    roster.forEach(entry => {
      if (entry.dead || entry.friend) return;
      if (Number(entry.returnFloor || 0) !== Number(state.floorNumber || 1)) return;
      entry.pendingSpawn = true;
      // A grudge (negative relationship) arms a permanent vendetta hunt.
      if (Number(entry.relationship || 0) < 0) entry.vendetta = true;
      emitEvent('RIVAL_RETURNING', { characterKey: entry.characterKey, floorNumber: state.floorNumber, vendetta: !!entry.vendetta });
    });
  }

  // Campaign friends remain part of the living rival roster when a floor is
  // regenerated. Multiplayer has no off-screen room-roaming simulation for
  // companions yet, so they join the first eligible encounter on each floor;
  // that explicit boundary preserves their non-hostile shadow/support role
  // instead of silently deleting them after the room where they were healed.
  function schedulePartyRivalCompanions(state, emitEvent) {
    const roster = Array.isArray(state.rivalRoster) ? state.rivalRoster : [];
    roster.forEach(entry => {
      if (entry.dead || !entry.friend) return;
      entry.pendingSpawn = true;
      emitEvent('RIVAL_COMPANION_RETURNING', { characterKey: entry.characterKey, floorNumber: state.floorNumber });
    });
  }

  // A player standing on the stairs charges a dwell timer; once it fills the
  // floor advances (or the run ends victorious on the final floor). The dwell
  // gate makes descending a deliberate group decision, not an accidental brush.
  function updateFloorExit(state, emitEvent) {
    Object.values(state.interactables || {}).forEach(stairs => {
      if (stairs.kind !== 'stairs') return;
      stairs.dwellByPlayer = stairs.dwellByPlayer || {};
      const players = activePlayers(state);
      let charging = false;
      players.forEach(player => {
        if (player.downed || player.roomId !== stairs.roomId) {
          delete stairs.dwellByPlayer[player.id];
          return;
        }
        const onStairs = Math.hypot(Number(player.x) - stairs.x, Number(player.y) - stairs.y)
          <= Number(stairs.radius || 30) + Number(player.radius || 18);
        if (!onStairs) {
          delete stairs.dwellByPlayer[player.id];
          return;
        }
        charging = true;
        stairs.dwellByPlayer[player.id] = Number(stairs.dwellByPlayer[player.id] || 0) + 1;
      });
      const firstPlayerWins = state.matchRules?.floorAdvance === 'first';
      const requiredPlayers = firstPlayerWins ? players.filter(player => !player.downed) : players;
      const dwellValues = requiredPlayers.map(player => Number(stairs.dwellByPlayer[player.id] || 0));
      const dwell = firstPlayerWins
        ? Math.max(0, ...dwellValues, 0)
        : (dwellValues.length ? Math.min(...dwellValues) : 0);
      stairs.requiredPlayers = requiredPlayers.length;
      stairs.readyPlayers = dwellValues.filter(value => value > 0).length;
      stairs.dwellProgress = Math.min(1, dwell / STAIRS_DWELL_TICKS);
      if (charging && stairs.dwellTelegraphTick !== state.tick && Math.max(0, ...dwellValues, 0) === 1) {
        stairs.dwellTelegraphTick = state.tick;
        emitEvent('STAIRS_ENGAGED', {
          interactableId: stairs.id,
          roomId: stairs.roomId,
          requiredPlayers: requiredPlayers.length,
          rule: firstPlayerWins ? 'first' : 'all',
        });
      }
      if (dwell < STAIRS_DWELL_TICKS) return;
      if (stairs.final) {
        const finisherId = Object.entries(stairs.dwellByPlayer)
          .sort((first, second) => Number(second[1]) - Number(first[1]))[0]?.[0] || null;
        if (state.matchRules?.mode === 'rival') {
          state.runStats = state.runStats || {};
          state.runStats.winnerPlayerId = finisherId;
        }
        state.status = 'ended';
        emitEvent('RUN_ENDED', {
          result: 'victory',
          reason: state.matchRules?.mode === 'rival' ? 'rival-first-finish' : 'god-floor-cleared',
          floorNumber: Number(state.floorNumber || 1),
          winnerPlayerId: state.matchRules?.mode === 'rival' ? finisherId : null,
        });
      } else {
        advanceToNextFloor(state, emitEvent);
      }
    });
  }

  // Downed players charge a revive when a living ally stands over them; a full
  // party wipe (everyone downed, none reviving) ends the run in defeat.
  function updateDownedAndRevive(state, emitEvent) {
    const players = activePlayers(state);
    if (!players.length) return;
    const living = players.filter(player => !player.downed);
    if (state.matchRules?.mode === 'rival') {
      players.filter(player => player.downed).forEach(player => {
        const downedAtTick = Number(player.downedAtTick ?? state.tick);
        if (state.tick - downedAtTick < RIVAL_RESPAWN_TICKS) {
          player.reviveProgress = Math.min(1, (state.tick - downedAtTick) / RIVAL_RESPAWN_TICKS);
          return;
        }
        const startRoomId = state.floorState?.layout?.startRoomId || state.floorState?.currentRoomId;
        applyCampaignRevive(player, { healthFraction: 0.75, currentTick: state.tick, tickRate: 20, invulnerabilitySeconds: 1.5 });
        player.roomId = startRoomId;
        player.x = Number(state.floorState?.width || 900) / 2;
        player.y = Number(state.floorState?.height || 700) / 2;
        emitEvent('PLAYER_RESPAWNED', { playerId: player.id, roomId: startRoomId, health: player.hp });
      });
      return;
    }
    players.forEach(downedPlayer => {
      if (!downedPlayer.downed) {
        downedPlayer.reviveProgress = 0;
        return;
      }
      const reviver = living.find(ally => ally.roomId === downedPlayer.roomId
        && Math.hypot(Number(ally.x) - Number(downedPlayer.x), Number(ally.y) - Number(downedPlayer.y)) <= REVIVE_RADIUS);
      if (!reviver) {
        downedPlayer.reviveTicks = 0;
        downedPlayer.reviveProgress = 0;
        return;
      }
      downedPlayer.reviveTicks = Number(downedPlayer.reviveTicks || 0) + 1;
      downedPlayer.reviveProgress = Math.min(1, downedPlayer.reviveTicks / REVIVE_DWELL_TICKS);
      if (downedPlayer.reviveTicks < REVIVE_DWELL_TICKS) return;
      applyCampaignRevive(downedPlayer, { healthFraction: REVIVE_HEALTH_FRACTION, currentTick: state.tick, tickRate: 20, invulnerabilitySeconds: 1.5 });
      emitEvent('PLAYER_REVIVED', { playerId: downedPlayer.id, reviverId: reviver.id, health: downedPlayer.hp });
    });
    if (state.status === 'running' && living.length === 0) {
      state.status = 'ended';
      emitEvent('RUN_ENDED', {
        result: 'defeat',
        reason: 'party-wiped',
        floorNumber: Number(state.floorNumber || 1),
      });
    }
  }

  function createFloorProgressionSystem(options = {}) {
    const emitEvent = typeof options.emitEvent === 'function' ? options.emitEvent : () => {};
    return ({ state }) => {
      if (state.status !== 'running') return;
      updateDownedAndRevive(state, emitEvent);
      if (state.status !== 'running') return; // a wipe ended the run this tick
      ensureFloorExit(state, emitEvent);
      updateFloorExit(state, emitEvent);
    };
  }

  function createNetworkCombatSystem(options = {}) {
    const emitEvent = typeof options.emitEvent === 'function' ? options.emitEvent : () => {};
    return ({ state, inputs, fixedDelta, random }) => {
      combatRandomByState.set(state, random);
      // Item effects are authoritative combat inputs, not render metadata.
      // Refresh before movement/actions so starter and newly acquired stats
      // apply immediately; refresh again after equipment activation below so
      // a defensive tool cannot leave a one-tick damage window.
      syncCampaignItemStats(state);
      ensureAuthorityTreasureHunt(state, random);
      ensureAuthorityBossRush(state, random, emitEvent);
      ensureAuthorityRivalRumble(state, random, emitEvent);
      updateAuthorityBossRush(state, emitEvent);
      updateAuthorityRivalRumble(state, emitEvent);
      applyAuthorityRoomEntryItemEffects(state, emitEvent);
      Object.values(state.players || {}).forEach(player => {
        if (currentRoom(state, player?.roomId)?.type !== 'secret') delete player.authorityLastSecretRoomId;
      });
      const occupiedRoomIds = new Set(Object.values(state.players || {})
        .filter(player => player && !player.disconnected)
        .map(player => player.roomId));
      occupiedRoomIds.forEach(roomId => {
        prepareAuthorityTreasureHuntStartExit(state, currentRoom(state, roomId), emitEvent);
        ensureAuthoritySpecialRoomContent(state, random, emitEvent, roomId);
        ensureNetworkEncounter(state, random, emitEvent, roomId);
        ensureNetworkRoomReward(state, random, emitEvent, roomId);
        ensureCampaignShop(state, random, emitEvent, roomId);
      });
      ensureJesterGate(state, emitEvent);
      updateAuthorityGardenGrowth(state, emitEvent);
      updateChestProximity(state, emitEvent, random);
      // Refill before actions resolve so a charge whose timer expires on this tick
      // is spendable on this tick, rather than a tick late.
      tickMoveCharges(state);
      updatePlayerActions(state, inputs, emitEvent, random);
      updatePlayerHeldCharges(state, inputs, emitEvent, random);
      updateAutomaticPrincessShields(state, emitEvent, random);
      updatePlayerBeamChannels(state, inputs, fixedDelta, emitEvent);
      updatePlayerEquipmentEffects(state, emitEvent);
      syncCampaignItemStats(state);
      updateFloorLavaEffects(state);
      updateAbilityEntities(state, emitEvent, random, inputs, fixedDelta);
      updateTemporaryDestructibles(state, fixedDelta, emitEvent);
      updateAuthorityCircuitChallenges(state, fixedDelta, emitEvent);
      updateAuthorityStormChallenges(state, fixedDelta, emitEvent, random);
      updateAuthoritySurvivalChallenges(state, fixedDelta, emitEvent, random);
      updateAuthorityRuneChallenges(state, fixedDelta, emitEvent, random);
      updateAuthorityBombChallenges(state, fixedDelta, emitEvent, random);
      updateAuthorityTreasureHuntCollapse(state, fixedDelta, emitEvent, random);
      updateRoomHazards(state, fixedDelta, emitEvent);
      updatePotionBathEffects(state, fixedDelta, emitEvent);
      updateAuthorityStatuses(state, fixedDelta, emitEvent);
      updateEnemies(state, fixedDelta, emitEvent);
      updateProjectiles(state, fixedDelta, emitEvent, random, inputs);
      updateMovingWorldPickups(state, fixedDelta);
      // Interactions may spawn a chest reward during this tick. A second
      // collection pass lets a hero already standing on that reward receive it
      // immediately, matching the campaign's walk-over pickup feel instead of
      // forcing an arbitrary extra authority tick.
      updatePickups(state, emitEvent, random);
      updatePickups(state, emitEvent, random);
    };
  }

  return {
    STAIRS_DWELL_TICKS,
    REVIVE_DWELL_TICKS,
    RIVAL_RESPAWN_TICKS,
    ATTACK_COOLDOWN_TICKS,
    PROJECTILE_DAMAGE,
    PROJECTILE_SPEED,
    HERO_PRIMARY_ATTACKS,
    HERO_BASE_STATS,
    ENEMY_ARCHETYPES,
    HOLD_TO_CHARGE_MOVES,
    getHeroPrimaryAttack,
    getCampaignWeaponAttack,
    // Canonical names. The legacy aliases below remain for saved integrations,
    // but this is the shared campaign authority used by offline and online play.
    applyCampaignHeroProfile: applyNetworkHeroProfile,
    createCampaignCombatSystem: createNetworkCombatSystem,
    createCampaignProgressionSystem: createFloorProgressionSystem,
    applyNetworkHeroProfile,
    announceAuthorityBossIntro,
    applyAuthorityRoomEntryItemEffects,
    sanitizeKitChoices,
    ensureNetworkEncounter,
    ensureNetworkRoomReward,
    ensureCampaignShop,
    spawnEnemyDrops,
    isNetworkRoomLocked,
    livingEncounterEnemies,
    resolvePlayerAbility,
    readMoveChargeState,
    moveChargeCapacity,
    createNetworkCombatSystem,
    createFloorProgressionSystem,
    advanceToNextFloor,
    addPartyRival,
    queuePartyRivalCurse,
    spawnMirrorChampionEncounter,
    MAX_FLOOR,
  };
});
