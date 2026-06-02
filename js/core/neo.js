// neo.js — loaded FIRST. Initialises window.Neo with all shared mutable state
// so that every other script file can read/write shared state via Neo.X.
// Constants are copied onto Neo at the bottom of game-core.js after they are defined.

window.Neo = {
  // --- players ---
  player: null,
  player2: null,
  player3: null,
  player4: null,

  // --- characters ---
  chosenCharacter: 'thorn_knight',
  chosenCharacter2: 'thorn_knight',
  chosenCharacter3: 'thorn_knight',
  chosenCharacter4: 'thorn_knight',

  // --- coop ---
  p1DeadInCoop: false,
  p2DeadInCoop: false,
  p3DeadInCoop: false,
  p4DeadInCoop: false,
  mpPlayerCount: 2,
  charSelectPhase: null,

  // --- entities ---
  enemies: [],
  deadBodies: [],
  particles: [],
  projectiles: [],
  chests: [],
  pickups: [],
  rooms: [],
  currentRoom: null,
  structures: [],
  destructibles: [],
  decorations: [],
  hazards: [],
  shopOffers: [],

  // --- input ---
  keys: {},
  mouse: { x: 0, y: 0, worldX: 0, worldY: 0, down: false, right: false, downQueued: false, rightQueued: false },
  camera: { x: 0, y: 0 },
  camera2: { x: 0, y: 0 },
  camera3: { x: 0, y: 0 },
  camera4: { x: 0, y: 0 },
  shake: 0,
  shakeT: 0,
  // --- game feel: trauma-based screen shake (offset ∝ trauma²) + directional kick ---
  trauma: 0,        // 0..1, decays each frame; render offset uses trauma²
  shakeKickX: 0,    // directional camera kick (world px), decays fast
  shakeKickY: 0,
  // --- game feel: hitstop / freeze-frame accumulator (seconds of frozen sim) ---
  hitstop: 0,

  // --- flow ---
  gameState: 'menu',
  gameMode: 'normal',
  floor: 1,
  runLoopIndex: 0,
  baseSeedStr: '',
  seedStr: '',
  rng: null,
  rngStreams: {},

  // --- timing ---
  gameElapsedTime: 0,
  lastTime: 0,
  godTimer: 0,
  fade: 0,
  fading: 0,
  floorTransitionTime: 0,
  showFloorTransition: false,
  lavaAnimTime: 0,
  playerDeathAnim: null,
  lowHealthHitFlashUntil: 0,

  // --- laser ---
  laserActive: false,
  laserTime: 0,
  laserTick: 0,
  laserMode: 'beam',
  laserAngle: 0,
  laserSweepSpeed: 0,
  loveBeamCasting: false,
  turtleWaveHpTimer: 0,

  // --- difficulty ---
  selectedDifficulty: 'easy',
  selectedChallenges: [],
  customDifficultySettings: {
    waveBonus: 0,
    eliteFloor: 8,
    eliteChance: 0.12,
    miniBossChanceMultiplier: 1,
    roomWeightBonus: 0,
    statMultiplier: 1,
    bossStatMultiplier: 1,
    speedMultiplier: 1,
    enemyReactionMultiplier: 1,
    rangedCadenceMultiplier: 1,
    supportPowerMultiplier: 1,
    shopPriceMultiplier: 1,
  },
  endlessWave: 0,
  endlessWaveActive: false,
  bossRushStage: 0,
  bossRushActive: false,
  runRevivesUsed: 0,
  lastDeathEntryId: '',

  // --- ui ---
  cooldowns: {},
  activeShopTab: 'items',
  activeInvTab: 'stats',
  activeAnvilTab: 'weapons',
  activeInvPlayer: 1,
  anvilSelectedItem: null,
  anvilStagedUpgrades: {},
  draggingMoveKey: '',
  weaponBurstQueue: [],
  wizardPawSelection: null,
  activeInventorySlot: '',
  inventoryPauseActive: false,

  // --- tracking ---
  lastDamageSource: '',
  lastDamageSourceKey: '',
  nextDoor: null,
  rivals: [],
  pendingRivalDescends: [],
  monsterRoamTimer: 0,
  mooggyAssassinSpawnedThisRun: false,
  mooggyAssassinSpawnedThisFloor: false,
  mooggyAudioContext: null,

  // --- meta ---
  activeRun: null,
  metaProgress: null,   // set to createDefaultMeta() result in input.js
  runHistory: [],
  tutorialState: null,
  sandboxSettings: null, // set after SANDBOX_DEFAULT_SETTINGS is defined in input.js

  // --- latches ---
  dashKeyLatch: false,
  floorSkipPending: 0,
  teleportKeyLatch: false,
  ladderUseKeyLatch: false,
  shopKeyLatch: false,
  invKeyLatch: false,
  anvilKeyLatch: false,

  // --- cache ---
  environmentBackgroundCache: { key: '', canvas: null },
  minimapLayoutState: null,
  itemStatsCacheFrame: -1,
  itemStatsCacheValue: null,
  godItemKeysCache: null,

  // --- cutscenes / flags ---
  knaveKnightCutscenePlayed: false,
  queenMetaoCutscenePlayed: false,
  secretRoomVisitedFloors: [],
  cinematicTimer: null,
  pvpState: null,
  loopStarted: false,
  menuRefreshQueued: false,
  shopPanelDirty: false,
  inventoryPanelDirty: false,
  savePendingTimer: 0,
  metaSavePendingTimer: 0,
  metaSaveDirty: false,
  frameId: 0,

  // --- sprites ---
  SPRITE_ATLAS: null,
  ENV_TILE_ATLAS: null,

  // --- constants (populated by game-core.js after definition) ---
  // ROOM_W, ROOM_H, WALL, DOOR, MAX_FLOOR, START_X, START_Y,
  // ATTACKS, SLASH_KNOCKBACK, HEAVY_HIT_HEALTH_RATIO, HEAVY_KNOCKBACK_THRESHOLD,
  // HEAVY_HIT_STUN, HEAVY_KNOCKBACK_STUN, BOSS_TYPES, CHALLENGE_ROOM_TYPES,
  // CHALLENGE_TRIAL_TYPES, DIFFICULTY_ORDER, DIFFICULTY_DEFS, CHALLENGE_DEFS,
  // CHALLENGE_ORDER, CHARACTER_DEFS, HERO_DISPLAY, MOVE_SLOTS, SLOT_LABELS,
  // SLOT_KEYS, STATUS_KEYS, STATUS_STYLES, BLEED_BLOOD_COLORS, BLEED_RESIST_SCALING,
  // DIRECTIONS, DIRECTION_VECTORS, OPPOSITE_DIRECTION, LIGHTING_CONFIG, ENEMY_SCALING,
  // ROOM_ART_THEMES, PERF_BUDGET_60FPS, PERF_AVG_WEIGHT, PERF_OVERLAY_INTERVAL,
  // RUN_HISTORY_LIMIT, MOVE_DEFS, WEAPON_DEFS, SHOP_MOVE_POOL,
  // ITEM_DEFS, ITEM_KEYS, WHITE_ITEM_POOL, PURPLE_ITEM_POOL, RED_ITEM_POOL,
  // GOD_PHASE_DIALOGUE, BOSS_OPENING_DIALOGUE, DEFAULT_KILLER_DEATH_QUOTES, KILLER_DEATH_QUOTES
};
