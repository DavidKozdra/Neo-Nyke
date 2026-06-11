// game-core.js — constants, canvas/ctx, and KozEngine API references.

export const canvas = document.getElementById('c');
export const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

export const ROOM_W = 900;
export const ROOM_H = 700;
export const WALL = 28;
export const DOOR = 140;
export const MAX_FLOOR = 10;
export const START_X = ROOM_W / 2;
export const START_Y = ROOM_H / 2;

export const ATTACKS = {
  melee: { baseCooldown: 0.35, range: 72, arc: 1.04, damage: 24, active: 0.17, push: 220 },
  laser: { baseCooldown: 4.2, duration: 0.58, tick: 0.08, range: 430, damage: 10 },
  smash: { baseCooldown: 5.4, radius: 148, damage: 46, bonus: 26 },
};
export const SLASH_KNOCKBACK = 340;
export const HEAVY_HIT_HEALTH_RATIO = 0.5;
export const HEAVY_KNOCKBACK_THRESHOLD = 6600;
export const HEAVY_HIT_STUN = 0.62;
export const HEAVY_KNOCKBACK_STUN = 0.46;
export const HEAVY_IMPACT_BOSS_STUN_MULTIPLIER = 0.65;
export const PLAYER_BEAM_BOUNCES = 2;
export const HEAVY_BEAM_BOUNCES = 1;
export const ENEMY_BEAM_BOUNCES = 1;
export const LAZER_GLASSES_BOUNCES = 1;
export const BEAM_RICOCHET_NUDGE = 0.65;
export const BEAM_RICOCHET_EPSILON = 0.0001;
export const TURTLE_WAVE_HP_PER_SECOND = 2;
export const LOW_HEALTH_HIT_FLASH_MS = 700;
export const CORPSE_FADE_START = 4.5;
export const CORPSE_LIFETIME = 11;
export const CORPSE_FALL_TIME = 0.32;
export const PROJECTILE_TRAIL_LENGTH = 6;
export const AOE_SHOCKWAVE_LIFE = 0.36;
export const ENV_TILE_SIZE = 48;
export const LIGHTING_CONFIG = {
  clearRoomTypes: new Set(['start', 'shop', 'anvil', 'secret']),
  darkness: {
    combat: 0.1,
    challenge: 0.16,
    minVisible: 0.05,
    lightRelief: 0.12,
    pressureDivisor: 14,
  },
  ambient: {
    inner: 210,
    outerScale: 1.08,
    strength: 0.5,
    tint: 'rgba(126, 165, 226, 0.08)',
  },
  player: {
    inner: 128,
    outer: 660,
    strength: 2.16,
    tint: 'rgba(155, 212, 255, 0.12)',
  },
  chamber: {
    inner: 36,
    outerScale: 0.58,
    strength: 0.22,
    tint: 'rgba(120, 160, 255, 0.05)',
  },
  brazier: {
    yOffset: -8,
    inner: 14,
    outerScale: 3.8,
    strength: 0.36,
    tint: 'rgba(230, 170, 92, 0.06)',
  },
  torch: {
    yOffset: -12,
    inner: 18,
    outer: 116,
    strength: 0.42,
    tint: 'rgba(230, 176, 108, 0.08)',
    spillYOffset: -10,
    spillInner: 42,
    spillOuter: 166,
    spillStrength: 0.16,
    spillTint: 'rgba(220, 198, 150, 0.04)',
  },
  hazard: {
    lava: { innerScale: 0.25, outerScale: 2.7, strength: 0.95, tint: 'rgba(255, 92, 44, 0.12)' },
    fireCircle: { innerScale: 0.35, outerScale: 1.75, strength: 0.72, tint: 'rgba(255, 120, 54, 0.08)' },
    lightningColumn: { innerScale: 0.22, outerScale: 1.8, strength: 0.82, tint: 'rgba(124, 200, 255, 0.09)' },
    explosiveTrapFuseDefault: 0.78,
    explosiveTrapTriggered: {
      innerScale: 0.6,
      minStrength: 0.12,
      strengthBoost: 0.22,
      minRadiusScale: 0.55,
      radiusBoost: 0.35,
      tint: 'rgba(255, 90, 30, 0.14)',
    },
    explosiveTrapIdle: {
      defaultR: 14,
      innerScale: 0.3,
      outerScale: 2.2,
      strength: 0.18,
      tint: 'rgba(255, 180, 60, 0.04)',
    },
  },
  flicker: {
    timeScale: 0.007,
    xPhase: 0.017,
    yPhase: 0.011,
    primaryAmp: 0.08,
    secondaryFreq: 1.9,
    secondaryAmp: 0.05,
  },
  projectiles: {
    fireball: { innerScale: 0.8, outer: 90, strength: 0.86, tint: 'rgba(255, 118, 42, 0.1)' },
    disk: { innerScale: 0.7, outer: 70, strength: 0.58, tint: 'rgba(182, 108, 255, 0.08)' },
    bullet: { innerScale: 0.45, outer: 42, strength: 0.34, tint: 'rgba(255, 148, 92, 0.04)' },
  },
  beam: {
    laserGodWidth: 42,
    laserTurtleWidth: 34,
    laserDefaultWidth: 22,
    laserGodStrength: 0.9,
    laserDefaultStrength: 0.7,
    glassesWidth: 14,
    glassesStrength: 0.46,
    glassesRange: 430,
    glassesSpread: 0.2,
    enemyGodWidth: 36,
    enemyDefaultWidth: 18,
    enemyGodStrength: 0.72,
    enemyDefaultStrength: 0.42,
    enemyGodRange: 620,
    enemyDefaultRange: 460,
  },
  maxLights: 34,
  maxOuterRadius: 700,
  innerToOuterCap: 0.72,
  minOuter: 8,
};
export const ENEMY_SCALING = {
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
  // Bosses get an EXTRA per-loop boost on top of the generic loop scaling above,
  // so they stay threatening as the player out-scales regular enemies each loop.
  // HP applies cleanly (no cap); damage is applied after the soft cap so it always
  // contributes full value. Loop 1 adds nothing.
  bossLoopHp: 0.20,
  bossLoopDamage: 0.05,
  // Endless mode pins floor at 1, so floor/loop multipliers never grow. These
  // per-wave multipliers stand in for that progression, scaling enemies up as
  // the wave counter climbs. Damage/speed are softer than HP and reuse the
  // softCap treatment so late waves stay survivable.
  endlessWaveHp: 0.12,
  endlessWaveDamage: 0.06,
  endlessWaveSpeed: 0.012,
  endlessWaveDamageSoftCap: 2.6,
  endlessWaveSpeedSoftCap: 1.5,
};
export const BOMB_HAZARD_SCALING = {
  floor: 0.07,
  minute: 0.04,
};
export const SHOP_PRICE_SCALING = {
  floor: 0.03,
  minute: 0.02,
};
export const BLEED_RESIST_SCALING = {
  floorInLoop: 0.16,
  // Raised so infinitely-stacking DoT builds fall off deeper into a run instead
  // of trivializing late loops — bleed resistance now keeps pace with HP scaling.
  loop: 0.95,
  elite: 0.45,
  miniBoss: 0.4,
  boss: 1.1,
  rival: 0.75,
};
export const DIRECTIONS = ['n', 's', 'e', 'w'];
export const DIRECTION_VECTORS = {
  n: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  e: { dx: 1, dy: 0 },
  w: { dx: -1, dy: 0 },
};
export const OPPOSITE_DIRECTION = {
  n: 's',
  s: 'n',
  e: 'w',
  w: 'e',
};
export const STATUS_KEYS = ['bleed', 'fire', 'poison', 'dark_drain', 'slow', 'static'];
export const STATUS_STYLES = {
  bleed: { color: '#ff4f6d', textColor: '#ff5f5f' },
  fire: { color: '#ff9a3c', textColor: '#ff9a3c' },
  poison: { color: '#85df63', textColor: '#85df63' },
  dark_drain: { color: '#b48cff', textColor: '#b48cff' },
  slow: { color: '#79d9ff', textColor: '#79d9ff' },
  static: { color: '#9adfff', textColor: '#bdefff' },
};
export const STATUS_ICON_DEFS = {
  bleed: {
    label: 'Bleed',
    color: '#ff4f6d',
    accent: '#ffe3e7',
    bg: 'rgba(62,0,12,0.86)',
    pixels: [[4,0],[3,1],[4,1],[3,2],[4,2],[2,3],[5,3],[2,4],[5,4],[3,5],[4,5],[4,6]],
    accentPixels: [[3,3],[3,4]],
  },
  fire: {
    label: 'Fire',
    color: '#ff9a3c',
    accent: '#ffe5c0',
    bg: 'rgba(62,22,0,0.86)',
    pixels: [[4,0],[3,1],[4,1],[5,2],[2,3],[4,3],[5,3],[2,4],[3,4],[5,4],[2,5],[3,5],[4,5],[5,5],[3,6],[4,6]],
    accentPixels: [[3,3],[3,4],[4,4]],
  },
  poison: {
    label: 'Poison',
    color: '#85df63',
    accent: '#d8ffc0',
    bg: 'rgba(10,38,0,0.86)',
    pixels: [[3,0],[4,0],[2,1],[5,1],[2,2],[5,2],[1,3],[6,3],[1,4],[6,4],[2,5],[5,5],[3,6],[4,6]],
    accentPixels: [[3,2],[4,2],[3,4],[4,4]],
  },
  dark_drain: {
    label: 'Dark Drain',
    color: '#b48cff',
    accent: '#e8d8ff',
    bg: 'rgba(20,8,48,0.86)',
    pixels: [[5,0],[4,1],[3,1],[2,2],[2,3],[2,4],[3,5],[4,5],[5,6],[3,6],[4,7],[5,7]],
    accentPixels: [[4,2],[3,3],[3,4],[4,5]],
  },
  slow: {
    label: 'Frostbite',
    color: '#79d9ff',
    accent: '#e5f8ff',
    bg: 'rgba(0,32,48,0.86)',
    pixels: [[3,0],[4,0],[3,1],[4,1],[1,2],[2,2],[5,2],[6,2],[0,3],[3,3],[4,3],[7,3],[0,4],[3,4],[4,4],[7,4],[1,5],[2,5],[5,5],[6,5],[3,6],[4,6],[3,7],[4,7]],
    accentPixels: [[3,3],[4,3],[3,4],[4,4]],
  },
  stun: {
    label: 'Stun',
    color: '#ffe66d',
    accent: '#fff8c8',
    bg: 'rgba(58,42,0,0.86)',
    pixels: [[3,0],[4,0],[3,1],[4,1],[2,2],[5,2],[0,3],[1,3],[3,3],[4,3],[6,3],[7,3],[2,4],[5,4],[3,5],[4,5],[2,6],[5,6]],
    accentPixels: [[3,2],[4,2],[3,4],[4,4]],
  },
  static: {
    label: 'Static',
    color: '#9adfff',
    accent: '#eaf9ff',
    bg: 'rgba(4,30,48,0.86)',
    pixels: [[5,0],[4,1],[3,2],[2,3],[4,3],[5,3],[1,4],[2,4],[3,4],[4,5],[3,6],[2,7]],
    accentPixels: [[3,3],[2,4],[4,4]],
  },
};
export const ROOM_ART_THEMES = {
  dungeon: {
    floorTiles: ['floor_stone_a', 'floor_stone_b', 'floor_stone_cracked', 'floor_stone_moss', 'floor_bone', 'floor_ash'],
    gardenFloorTiles: ['floor_stone_moss', 'floor_overgrowth', 'floor_leafy'],
    wallTile: 'wall_stone',
    thresholdTile: 'threshold_stone',
    backdrop: '#151916',
    floorTint: 'rgba(26, 22, 17, 0.16)',
    wallEdge: 'rgba(95, 91, 73, 0.62)',
    wallShadow: 'rgba(0, 0, 0, 0.38)',
    doorAccent: 'rgba(194, 132, 61, 0.68)',
    combatAccent: 'rgba(128, 37, 42, 0.34)',
    crack: 'rgba(7, 10, 9, 0.55)',
    stain: 'rgba(38, 26, 20, 0.22)',
    banner: '#7a2630',
    vignette: 'rgba(0, 0, 0, 0.42)',
  },
  treasure: {
    floorTiles: ['floor_stone_a', 'floor_stone_b', 'floor_stone_moss', 'floor_god'],
    gardenFloorTiles: ['floor_stone_moss', 'floor_overgrowth', 'floor_leafy'],
    wallTile: 'wall_stone',
    thresholdTile: 'threshold_warm',
    backdrop: '#181811',
    floorTint: 'rgba(88, 70, 30, 0.11)',
    wallEdge: 'rgba(130, 108, 62, 0.58)',
    wallShadow: 'rgba(0, 0, 0, 0.34)',
    doorAccent: 'rgba(220, 166, 72, 0.76)',
    combatAccent: 'rgba(128, 55, 36, 0.26)',
    crack: 'rgba(12, 11, 8, 0.52)',
    stain: 'rgba(62, 48, 20, 0.2)',
    banner: '#89622c',
    vignette: 'rgba(0, 0, 0, 0.38)',
  },
  shop: {
    floorTiles: ['floor_plank', 'floor_plank', 'floor_stone_a'],
    gardenFloorTiles: ['floor_stone_moss', 'floor_overgrowth', 'floor_leafy'],
    wallTile: 'wall_shop',
    thresholdTile: 'threshold_warm',
    backdrop: '#1c140e',
    floorTint: 'rgba(115, 72, 32, 0.1)',
    wallEdge: 'rgba(160, 103, 52, 0.52)',
    wallShadow: 'rgba(0, 0, 0, 0.32)',
    doorAccent: 'rgba(255, 176, 78, 0.74)',
    combatAccent: 'rgba(110, 70, 34, 0.2)',
    crack: 'rgba(21, 12, 7, 0.48)',
    stain: 'rgba(70, 42, 18, 0.2)',
    banner: '#9a5830',
    vignette: 'rgba(0, 0, 0, 0.34)',
  },
  anvil: {
    floorTiles: ['floor_forge', 'floor_ash', 'floor_stone_a', 'floor_forge'],
    gardenFloorTiles: ['floor_stone_moss', 'floor_overgrowth', 'floor_leafy'],
    wallTile: 'wall_forge',
    thresholdTile: 'threshold_warm',
    backdrop: '#181512',
    floorTint: 'rgba(132, 66, 28, 0.13)',
    wallEdge: 'rgba(148, 106, 65, 0.55)',
    wallShadow: 'rgba(0, 0, 0, 0.36)',
    doorAccent: 'rgba(224, 119, 48, 0.72)',
    combatAccent: 'rgba(166, 67, 35, 0.26)',
    crack: 'rgba(10, 8, 7, 0.56)',
    stain: 'rgba(70, 34, 16, 0.22)',
    banner: '#88401e',
    vignette: 'rgba(0, 0, 0, 0.4)',
  },
  boss: {
    floorTiles: ['floor_boss', 'floor_boss', 'floor_blood', 'floor_stone_cracked'],
    gardenFloorTiles: ['floor_stone_moss', 'floor_overgrowth'],
    wallTile: 'wall_boss',
    thresholdTile: 'threshold_boss',
    backdrop: '#171012',
    floorTint: 'rgba(86, 28, 38, 0.12)',
    wallEdge: 'rgba(128, 70, 72, 0.58)',
    wallShadow: 'rgba(0, 0, 0, 0.44)',
    doorAccent: 'rgba(190, 76, 62, 0.72)',
    combatAccent: 'rgba(170, 40, 48, 0.38)',
    crack: 'rgba(8, 5, 6, 0.6)',
    stain: 'rgba(72, 16, 22, 0.24)',
    banner: '#8a2030',
    vignette: 'rgba(0, 0, 0, 0.5)',
  },
  god: {
    floorTiles: ['floor_god', 'floor_god', 'floor_stone_a'],
    gardenFloorTiles: ['floor_stone_moss', 'floor_overgrowth'],
    wallTile: 'wall_god',
    thresholdTile: 'threshold_warm',
    backdrop: '#1d1a13',
    floorTint: 'rgba(145, 115, 54, 0.14)',
    wallEdge: 'rgba(190, 154, 82, 0.58)',
    wallShadow: 'rgba(0, 0, 0, 0.36)',
    doorAccent: 'rgba(238, 196, 102, 0.78)',
    combatAccent: 'rgba(170, 117, 47, 0.3)',
    crack: 'rgba(16, 13, 8, 0.48)',
    stain: 'rgba(80, 62, 28, 0.18)',
    banner: '#9c7a38',
    vignette: 'rgba(0, 0, 0, 0.38)',
  },
  secret: {
    floorTiles: ['floor_overgrowth', 'floor_stone_moss', 'floor_stone_b', 'floor_stone_cracked'],
    gardenFloorTiles: ['floor_overgrowth', 'floor_leafy', 'floor_stone_moss'],
    wallTile: 'wall_stone',
    thresholdTile: 'threshold_stone',
    backdrop: '#111913',
    floorTint: 'rgba(37, 78, 42, 0.12)',
    wallEdge: 'rgba(73, 110, 68, 0.5)',
    wallShadow: 'rgba(0, 0, 0, 0.42)',
    doorAccent: 'rgba(116, 143, 79, 0.66)',
    combatAccent: 'rgba(74, 104, 68, 0.24)',
    crack: 'rgba(6, 10, 7, 0.58)',
    stain: 'rgba(20, 46, 22, 0.22)',
    banner: '#536b31',
    vignette: 'rgba(0, 0, 0, 0.46)',
  },
};
export const BLEED_BLOOD_COLORS = ['#6f0014', '#a5001e', '#e51e37', '#ff5264'];
export const PERF_BUDGET_60FPS = 1000 / 60;
export const PERF_AVG_WEIGHT = 0.12;
export const PERF_OVERLAY_INTERVAL = 250;

export const BOSS_TYPES = new Set(['god', 'queen_cult', 'bulk_golem', 'artificer_knave', 'bowman_bane', 'antony_blemmye', 'handsome_devil']);
export const CHALLENGE_ROOM_TYPES = new Set(['challenge']);
export const CHALLENGE_TRIAL_TYPES = ['mirror', 'circuit', 'bomb', 'survival', 'runes', 'storm'];
export const KozSeededRngApi = window.KozEngine?.World?.seededRng || {};
export const KozSaveApi = window.KozEngine?.SaveLoad?.saveApi || {};
export const KozStorageDrivers = window.KozEngine?.SaveLoad?.storageDrivers || {};
export const KozDialogueApi = window.KozEngine?.UI?.typewriterDialogue || {};
export const KozWorldSpeechApi = window.KozEngine?.UI?.worldSpeechBubbles || {};
export const GOD_PHASE_DIALOGUE = {
  1: 'So you really want to do this ?',
  2: 'All the trinkets in the world can not make a mortal a god prepare for all my wrath',
  3: 'HOW ?',
  4: 'IT ENDS !',
  5: 'HAVE NO FEAR',
};
export const BOSS_OPENING_DIALOGUE = {
  queen_cult: 'Kneel and join the chorus.',
  bulk_golem: '........',
  artificer_knave: 'Run. I only need one clean hit.',
  bowman_bane: 'You came back. I was waiting.',
  antony_blemmye: '. GOrba GORBA !.',
  handsome_devil: 'Try not to stare.',
};
// Archive of story beats playable from the Credits gallery. Each entry is a
// self-contained list of dialogue lines (speaker labels match the portrait
// resolver in controller.js). Kept in one place so the gallery and the live
// encounters stay in sync — the boss-intro lines below mirror the scripts in
// enemies.js tryPlay*Cutscene().
export const CUTSCENE_GALLERY = [
  {
    id: 'knave_knight',
    title: 'The Knave & the Knight',
    subtitle: 'Thorn Knight vs the Artificer Knave',
    character: 'thorn_knight',
    required: true,
    lines: [
      { speaker: 'KNAVE', text: 'You think you can out fight me you couldnt out argue me! your logic is false' },
      { speaker: 'THORN', text: 'The kingdom of God has come for you ...' },
      { speaker: 'KNAVE', text: 'Violence it is' },
    ],
  },
  {
    id: 'queen_metao',
    title: 'The Apostate',
    subtitle: 'Metao vs the Cult Queen',
    character: 'metao',
    required: true,
    lines: [
      { speaker: 'QUEEN', text: 'once my champion planning to kill me again are you apostate' },
      { speaker: 'METAO', text: '...' },
      { speaker: 'QUEEN', text: 'Your life will be mine !' },
    ],
  },
  {
    id: 'bulk_golem_thorn',
    title: 'word of GOD',
    subtitle: 'Bulk Golem confronts Thorn',
    character: 'thorn_knight',
    required: true,
    lines: [
      { speaker: 'BULK GOLEM', text: BOSS_OPENING_DIALOGUE.bulk_golem },
    ],
  },
  {
    id: 'rival_princess_thorn',
    title: 'The Princess Descends',
    subtitle: 'Rival Princess confronts Thorn',
    character: 'thorn_knight',
    required: true,
    lines: [
      {
        speaker: 'RIVAL PRINCESS',
        text: "Oh, you're here. You were supposed to be fighting for me, but you took too long, so now we fight!",
      },
      { speaker: 'THORN', text: 'Then draw your blade.' },
    ],
  },
  {
    id: 'handsome_devil_thorn',
    title: 'An Old Acquaintance',
    subtitle: 'The Handsome Devil greets Thorn',
    character: 'thorn_knight',
    required: true,
    lines: [
      { speaker: 'HANDSOME DEVIL', text: "Hello, Thorn. I see you're well..." },
    ],
  },
  {
    id: 'handsome_devil_princess',
    title: 'A Cute Devil',
    subtitle: 'Princess meets the Handsome Devil',
    character: 'princess',
    required: true,
    lines: [
      { speaker: 'PRINCESS', text: 'He is cute.' },
      { speaker: 'HANDSOME DEVIL', text: 'Naturally.' },
    ],
  },
  {
    id: 'handsome_devil_gelleh',
    title: 'Cast the First Stone',
    subtitle: 'Gelleh meets the Handsome Devil',
    character: 'gelleh',
    required: true,
    lines: [
      { speaker: 'GELLEH', text: 'Sinner.' },
      { speaker: 'HANDSOME DEVIL', text: 'Then cast the first stone.' },
    ],
  },
  {
    id: 'handsome_devil_mooggy',
    title: 'Family is Complicated',
    subtitle: 'Mooggy meets the Handsome Devil',
    character: 'mooggy',
    required: true,
    lines: [
      { speaker: 'MOOGGY', text: 'Uncle.' },
      { speaker: 'HANDSOME DEVIL', text: 'Family is complicated.' },
    ],
  },
  {
    id: 'antony_blemmye',
    title: 'Gorba Gorba',
    subtitle: 'Antony Blemmye stirs',
    lines: [
      { speaker: 'ANTONY BLEMMYE', text: 'gorba Gorba' },
    ],
  },
  {
    id: 'bowman_bane_thorn',
    title: 'The Hidden Escape',
    subtitle: 'Bowman Bane warns Thorn to run',
    character: 'thorn_knight',
    required: true,
    lines: [
      { speaker: 'BOWMAN BANE', text: 'Run, Thorn!!' },
      { speaker: 'BOWMAN BANE', text: 'You cannot win this fight. The entrance is sealed. Find the hidden door and escape!' },
      { speaker: 'THORN', text: 'Thank you, Sarge.' },
    ],
  },
  {
    id: 'god_phases',
    title: 'The Wrath of GOD',
    subtitle: 'Every phase of the final duel',
    lines: [
      { speaker: 'GOD', text: GOD_PHASE_DIALOGUE[1] },
      { speaker: 'GOD', text: GOD_PHASE_DIALOGUE[2] },
      { speaker: 'GOD', text: GOD_PHASE_DIALOGUE[3] },
      { speaker: 'GOD', text: GOD_PHASE_DIALOGUE[4] },
      { speaker: 'GOD', text: GOD_PHASE_DIALOGUE[5] },
    ],
  },
  {
    id: 'boss_openings',
    title: 'Boss Taunts',
    subtitle: 'Opening lines from every boss',
    lines: [
      { speaker: 'QUEEN', text: BOSS_OPENING_DIALOGUE.queen_cult },
      { speaker: 'BULK GOLEM', text: BOSS_OPENING_DIALOGUE.bulk_golem },
      { speaker: 'KNAVE', text: BOSS_OPENING_DIALOGUE.artificer_knave },
      { speaker: 'BOWMAN BANE', text: BOSS_OPENING_DIALOGUE.bowman_bane },
      { speaker: 'ANTONY BLEMMYE', text: BOSS_OPENING_DIALOGUE.antony_blemmye },
      { speaker: 'HANDSOME DEVIL', text: BOSS_OPENING_DIALOGUE.handsome_devil },
    ],
  },
];
export const DEFAULT_KILLER_DEATH_QUOTES = [
  'Another hero falls.',
  'Your story ends here.',
  'You were not ready for this dungeon.',
  'Remember this defeat.',
  'Dust and silence, that is all that remains.',
];
export const KILLER_DEATH_QUOTES = {
  god: ['Kneel, mortal.', 'Divinity does not miss twice.', 'You challenged a god and paid for it.'],
  bowman_bane: ['The columns remember you.', 'You had one chance to stay away.', 'Second visit, same grave.'],
  antony_blemmye: ['The chest swallowed your courage.', 'Hammered flat.', 'The face in the ribs smiles.'],
  handsome_devil: ['Beauty burns.', 'Sin had better aim.', 'You looked too long.'],
  queen_cult: ['The chorus grows louder.', 'Your voice joins the cult now.', 'Sing your last note.'],
  bulk_golem: ['Stone outlasts flesh.', 'I break what stands before me.', 'Crushed.'],
  artificer_knave: ['Precision beats courage.', 'You moved exactly where I wanted.', 'Your logic failed.'],
  rival_princess: ['You were always late.', 'You should have fought for me.', 'Too slow, too weak.'],
  rival_thorn: ['You should have run.', 'Your loot is mine.', 'You fought hard, still lost.'],
  rival_metao: ['I saw this ending already.', 'Prediction complete.', 'You never caught up.'],
  rival_gelleh: ['A god does not yield.', 'You were judged and found wanting.', 'Kneel.'],
  mirror_knight: ['I know every move you make.', 'I was always one step ahead.', 'You cannot outfight yourself.'],
  mooggy: ['Mrow.', 'The red scarf remembers.', 'Nine lives. You had one.'],
  hunter: ['Easy prey.', 'You slowed down for one second.', 'The hunt is over.'],
  charger: ['One hit was enough.', 'I only need momentum.', 'You should have dodged.'],
  sniper: ['Clean shot.', 'Distance wins.', 'Never stop moving.'],
  machine_gunner: ['Keep your head down next time.', 'I never run out of bullets.', 'Pinned and finished.'],
  cult_mage: ['Arcane truth: you lose.', 'Magic always collects its debt.', 'Burn in silence.'],
  laser: ['Stand still and perish.', 'The beam never lies.', 'Light cuts deeper than steel.'],
  golem: ['Stone crushes all.', 'You cannot stagger a mountain.', 'Another crack in the floor.'],
  knave: ['Sharp steel, dull judgment.', 'You fought. You lost.', 'Should have stayed home.'],
  summoner: ['I am never alone.', 'My minions did the rest.', 'Outnumbered and outplayed.'],
  shield_unit: ['Defense is victory.', 'You broke first, not me.', 'You hit the wall and fell.'],
  healer: ['I endured. You did not.', 'Your damage was not enough.', 'I outlasted you.'],
  boss_spawner: ['Spawn and repeat.', 'The dungeon keeps coming.', 'You were consumed by the swarm.'],
  bleed: ['You bled out.', 'Every wound has a price.', 'Too many cuts.'],
  fire: ['Burn away.', 'Ashes to ashes.', 'You fed the flames.'],
  poison: ['It only takes time.', 'The venom was patient.', 'Poison does not hurry.'],
  dark_drain: ['The dark drank deeply.', 'Your light was siphoned away.', 'Empty.'],
  lava: ['The floor remembered your mistake.', 'Molten stone takes all.', 'Heat wins.'],
  storm: ['Thunder decides.', 'The storm claims another.', 'Skyfire answered.'],
  challenge_bomb: ['Trial failed.', 'Wrong step, wrong time.', 'The trial does not forgive.'],
  enemy_projectile: ['Struck down from afar.', 'Projectiles do not hesitate.', 'Too late to dodge.'],
  enemy_beam: ['The beam carved through you.', 'One line, one ending.', 'No cover saves everyone.'],
  god_beam: ['Holy light judged you.', 'You stood in divine fire.', 'The god beam does not miss.'],
  mirror_beam: ['Your reflection erased you.', 'Your own pattern destroyed you.', 'Mirror light, mirror death.'],
  no_hit: ['The challenge marks your failure.', 'One mistake ended the run.', 'No-hit broken.'],
};
export const RUN_HISTORY_LIMIT = 200;
export const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'impossible', 'god', 'custom'];
export const DIFFICULTY_DEFS = {
  easy: {
    key: 'easy',
    name: 'Easy',
    description: 'Easy uses the current balance.',
    unlockLoops: 0,
    waveBonus: 0,
    eliteFloor: 8,
    eliteChance: 0.12,
    miniBossChanceMultiplier: 1,
    roomWeightBonus: 0,
    statMultiplier: 1,
    bossStatMultiplier: 1,
    speedMultiplier: 1,
    bossProjectileSpeedMultiplier: 0.8,
    enemyReactionMultiplier: 1,
    rangedCadenceMultiplier: 1,
    supportPowerMultiplier: 1,
    shopPriceMultiplier: 1,
    // How fast enemies build knockback/stun resistance with run depth + time.
    // 0 = none; higher = steeper. See getEnemyCcLevel() in combat.js.
    ccResistScale: 0.04,
  },
  medium: {
    key: 'medium',
    name: 'Medium',
    description: 'Slightly denser rooms with tougher enemy rolls.',
    unlockLoops: 0,
    waveBonus: 1,
    eliteFloor: 8,
    eliteChance: 0.16,
    miniBossChanceMultiplier: 1.18,
    roomWeightBonus: 0.05,
    statMultiplier: 1.1,
    bossStatMultiplier: 1.12,
    // Extra per-floor HP slope added on top of ENEMY_SCALING.floor, so each floor
    // cleared makes enemies tankier the harder the difficulty (see scaleEnemyStats).
    hpFloorScaleBonus: 0.03,
    speedMultiplier: 1.03,
    bossProjectileSpeedMultiplier: 1,
    enemyReactionMultiplier: 1.06,
    rangedCadenceMultiplier: 0.95,
    supportPowerMultiplier: 1.08,
    shopPriceMultiplier: 1.08,
    ccResistScale: 0.12,
  },
  hard: {
    key: 'hard',
    name: 'Hard',
    description: 'More enemies, more pressure, stronger scaling.',
    unlockLoops: 0,
    waveBonus: 2,
    eliteFloor: 7,
    eliteChance: 0.2,
    miniBossChanceMultiplier: 1.35,
    roomWeightBonus: 0.1,
    statMultiplier: 1.22,
    bossStatMultiplier: 1.26,
    hpFloorScaleBonus: 0.06,
    speedMultiplier: 1.06,
    bossProjectileSpeedMultiplier: 1.2,
    enemyReactionMultiplier: 1.12,
    rangedCadenceMultiplier: 0.9,
    supportPowerMultiplier: 1.14,
    shopPriceMultiplier: 1.16,
    ccResistScale: 0.30,
  },
  impossible: {
    key: 'impossible',
    name: 'Impossible',
    description: 'Unlocks after 5 loops. Heavy elite and miniboss pressure.',
    unlockLoops: 5,
    waveBonus: 3,
    eliteFloor: 6,
    eliteChance: 0.26,
    miniBossChanceMultiplier: 1.6,
    roomWeightBonus: 0.16,
    statMultiplier: 1.36,
    bossStatMultiplier: 1.42,
    hpFloorScaleBonus: 0.09,
    speedMultiplier: 1.1,
    bossProjectileSpeedMultiplier: 1.3,
    enemyReactionMultiplier: 1.2,
    rangedCadenceMultiplier: 0.82,
    supportPowerMultiplier: 1.22,
    shopPriceMultiplier: 1.28,
    ccResistScale: 0.45,
    enemyLoopDamageReduction: 0.05,
  },
  god: {
    key: 'god',
    name: 'God',
    description: 'Unlocks after 10 loops. Scarce relics, elite floor openings, and heavily boosted rivals.',
    unlockLoops: 10,
    waveBonus: 4,
    eliteFloor: 5,
    eliteChance: 0.32,
    miniBossChanceMultiplier: 1.9,
    roomWeightBonus: 0.22,
    // Double Impossible's enemy stat multipliers (1.36 / 1.42).
    statMultiplier: 2.72,
    bossStatMultiplier: 2.84,
    hpFloorScaleBonus: 0.12,
    speedMultiplier: 1.14,
    bossProjectileSpeedMultiplier: 1.4,
    enemyReactionMultiplier: 1.28,
    rangedCadenceMultiplier: 0.74,
    supportPowerMultiplier: 1.3,
    shopPriceMultiplier: 1.42,
    ccResistScale: 0.6,
    enemyLoopDamageReduction: 0.05,
    itemDropChanceMultiplier: 0.5,
    shopItemOffers: 1,
    startRoomEliteCount: 2,
    rivalItemsPerFloor: 5,
    rivalLevelBonusPerFloor: 2,
  },
  custom: {
    key: 'custom',
    name: 'Custom',
    description: 'Tweak every multiplier yourself.',
    unlockLoops: 0,
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
    ccResistScale: 0,
  },
};
export const CHALLENGE_DEFS = {
  no_hit: {
    key: 'no_hit',
    name: 'Never Get Hit',
    icon: '!',
    accent: '#ff5c78',
    theme: 'Lethal',
    cost: 4,
    unlockLoops: 0,
    reward: '+65% Loop Crystal payout',
    description: 'Any real damage kills the run immediately.',
  },
  no_items: {
    key: 'no_items',
    name: 'No Items',
    icon: '0',
    accent: '#7fd0ff',
    theme: 'Loadout',
    cost: 3,
    unlockLoops: 0,
    reward: '+40% Loop Crystal payout',
    description: 'Start with no relic. Item pickups and relic buys are disabled.',
  },
  fragile_body: {
    key: 'fragile_body',
    name: 'Fragile Body',
    icon: 'HP',
    accent: '#f28b54',
    theme: 'Survival',
    cost: 2,
    unlockLoops: 0,
    reward: '+25% Loop Crystal payout',
    description: 'Start each run with 70% max HP.',
  },
  swarm_rooms: {
    key: 'swarm_rooms',
    name: 'Swarm Rooms',
    icon: '++',
    accent: '#9ce070',
    theme: 'Rooms',
    cost: 3,
    unlockLoops: 0,
    reward: '+35% Loop Crystal payout',
    description: 'Combat rooms spawn extra enemies.',
  },
  elite_hunt: {
    key: 'elite_hunt',
    name: 'Elite Hunt',
    icon: 'EL',
    accent: '#d8b0ff',
    theme: 'Elites',
    cost: 4,
    unlockLoops: 0,
    reward: '+45% Loop Crystal payout',
    description: 'Elite enemies appear much more often.',
  },
  cursed_shops: {
    key: 'cursed_shops',
    name: 'Cursed Shops',
    icon: '$',
    accent: '#f0c85a',
    theme: 'Economy',
    cost: 2,
    unlockLoops: 0,
    reward: '+30% Loop Crystal payout',
    description: 'Shop prices are 50% higher this run.',
  },
  glass_cannon: {
    key: 'glass_cannon',
    name: 'Quartz Cannon',
    icon: 'DMG',
    accent: '#ff8dd2',
    theme: 'Damage',
    cost: 3,
    unlockLoops: 0,
    reward: '+35% Loop Crystal payout',
    description: 'Deal 25% more damage, but incoming damage is 35% higher.',
  },
  cursed_blood: {
    key: 'cursed_blood',
    name: 'Cursed Blood',
    icon: 'DOT',
    accent: '#85df63',
    theme: 'Status',
    cost: 3,
    unlockLoops: 1,
    reward: '+35% Loop Crystal payout',
    description: 'Enemy status damage is 35% stronger, making bleed, fire, poison, and drain builds more valuable.',
  },
  overcharged: {
    key: 'overcharged',
    name: 'Overcharged',
    icon: 'CHG',
    accent: '#9adfff',
    theme: 'Charge',
    cost: 3,
    unlockLoops: 1,
    reward: '+35% Loop Crystal payout',
    description: 'Kill-charge relics gain +1 extra charge progress per kill.',
  },
};
export const CHALLENGE_ORDER = Object.keys(CHALLENGE_DEFS);

export const LEGACY_UPGRADES = {
  rival_bounty: {
    key: 'rival_bounty',
    name: 'Rival Bounty',
    cost: 3,
    description: 'Rival adventurers drop 50% more coins when defeated.',
    effect: '+50% rival coin drops',
  },
  elite_tracker: {
    key: 'elite_tracker',
    name: 'Elite Tracker',
    cost: 4,
    description: 'Elite enemies are always visible on the minimap, even in unexplored rooms.',
    effect: 'Elites shown on minimap',
  },
  god_memory: {
    key: 'god_memory',
    name: 'God Memory',
    cost: 5,
    description: 'After the first God kill, phase dialogue is skipped in all future runs.',
    effect: 'Skip God phase dialogue',
  },
  bank_interest: {
    key: 'bank_interest',
    name: 'Bank Interest',
    cost: 6,
    description: 'Each time you loop, +50 coins are automatically added to your bank.',
    effect: '+50 bank coins per loop',
  },
  crystal_tithe: {
    key: 'crystal_tithe',
    name: 'Crystal Tithe',
    cost: 8,
    description: 'Completing a loop on Hard or higher grants +1 bonus Loop Crystal.',
    effect: '+1 LC per loop on Hard+',
  },
  challenge_mastery: {
    key: 'challenge_mastery',
    name: 'Challenge Mastery',
    cost: 10,
    description: 'Completing a loop with 3 or more active challenges grants +3 LC instead of the sum of their individual bonuses (if that sum is lower).',
    effect: 'Triple-challenge loops give at least +3 LC',
  },
  endless_descent: {
    key: 'endless_descent',
    name: 'Endless Descent',
    cost: 15,
    description: 'After defeating God, a third pickup appears — Descend. Taking it continues the dungeon past Floor 10 with ever-scaling enemies.',
    effect: 'Floors continue past Floor 10',
  },
};
export const LEGACY_ORDER = Object.keys(LEGACY_UPGRADES);
export const HARD_DIFFICULTIES = new Set(['hard', 'impossible', 'god']);

export const CHARACTER_DEFS = {
  princess: {
    key: 'princess',
    name: 'Princess',
    rarity: 'princess',
    damageMultiplier: 1.2,
    hpMultiplier: 1.15,
    skills: { melee: 'Royal Strike', laser: 'Petal Beam', smash: 'Blossom Burst', dash: 'Graceful Step' },
  },
  thorn_knight: {
    key: 'thorn_knight',
    name: 'Thorn Knight',
    rarity: 'knight',
    damageMultiplier: 1,
    skills: { melee: 'Slash', laser: 'Blood Beam', smash: 'Crimson Smash', dash: 'Dash' },
  },
  metao: {
    key: 'metao',
    name: 'Metao',
    rarity: 'wizard',
    damageMultiplier: 0.5,
    aoeRadiusMultiplier: 1.2,
    aoeDamageMultiplier: 1.35,
    skills: { melee: 'Fire Balls', laser: 'Power Disks', smash: 'Chaos Burst', dash: 'Warp' },
  },
  gelleh: {
    key: 'gelleh',
    name: 'Gelleh',
    rarity: 'god',
    damageMultiplier: 1,
    skills: { melee: 'Spear of Lightning', laser: 'Blade Justice', smash: 'Healing Zone', dash: 'Zip Lightning' },
    unlock: 'godslain',
  },
  mooggy: {
    key: 'mooggy',
    name: 'Mooggy',
    rarity: 'assassin',
    damageMultiplier: 1.05,
    hpMultiplier: 1.08,
    skills: { melee: 'Mooggy Swipe', laser: 'Nail Shot', smash: 'Random Pounce', dash: 'Zoomies' },
    unlock: 'mooggy3',
  },
};

export const HERO_DISPLAY = {
  princess: {
    lore: 'Best first pick. High damage, high HP.',
    stats: [
      { label: 'HP',    pct: 90, color: '#f47ebd' },
      { label: 'DMG',   pct: 80, color: '#ff9ccf' },
      { label: 'SPD',   pct: 66, color: '#c991ff' },
      { label: 'RANGE', pct: 60, color: '#ffd1ea' },
    ],
  },
  thorn_knight: {
    lore: 'Close-range fighter. Bleed stacks get stronger.',
    stats: [
      { label: 'HP',    pct: 66, color: '#c06060' },
      { label: 'DMG',   pct: 66, color: '#c08040' },
      { label: 'SPD',   pct: 66, color: '#8080c0' },
      { label: 'RANGE', pct: 40, color: '#60a080' },
    ],
  },
  metao: {
    lore: 'Long-range magic. Slower shots, bigger hits.',
    stats: [
      { label: 'HP',    pct: 66, color: '#c06060' },
      { label: 'DMG',   pct: 48, color: '#c08040' },
      { label: 'SPD',   pct: 66, color: '#8080c0' },
      { label: 'RANGE', pct: 90, color: '#60a080' },
    ],
  },
  gelleh: {
    lore: 'Balanced divine hero. Unlock by defeating GOD.',
    stats: [
      { label: 'HP',    pct: 66, color: '#c06060' },
      { label: 'DMG',   pct: 66, color: '#c08040' },
      { label: 'SPD',   pct: 66, color: '#8080c0' },
      { label: 'RANGE', pct: 66, color: '#60a080' },
    ],
  },
  mooggy: {
    lore: 'Fast ranged assassin. Unlock by beating Mooggy.',
    stats: [
      { label: 'HP',    pct: 70, color: '#f4f4ef' },
      { label: 'DMG',   pct: 78, color: '#ff5c6f' },
      { label: 'SPD',   pct: 92, color: '#d31f35' },
      { label: 'RANGE', pct: 88, color: '#ff9baa' },
    ],
  },
};

export const SPRITE_SOURCE_SIZE = 10;
export const SPRITE_DEFS = window.NeoNykeSpriteDefs || {};
export const ENV_TILE_ROOT = window.NeoNykeEnvironmentTileDefs || {};
export const ENV_TILE_SOURCE_SIZE = ENV_TILE_ROOT.sourceSize || 16;
export const ENV_TILE_DEFS = ENV_TILE_ROOT.tiles || {};

export const MOVE_SLOTS = ['melee', 'laser', 'smash', 'dash'];
export const SLOT_LABELS = { melee: 'Melee', laser: 'Laser', smash: 'Smash', dash: 'Mobility' };
export const SLOT_KEYS  = { melee: 'LMB', laser: 'RMB', smash: 'R', dash: 'SHIFT' };

// Wire canvas/ctx and all constants onto Neo so runtime code can still read Neo.X
Neo.canvas = canvas;
Neo.ctx = ctx;
Neo.ROOM_W = ROOM_W;
Neo.ROOM_H = ROOM_H;
Neo.WALL = WALL;
Neo.DOOR = DOOR;
Neo.MAX_FLOOR = MAX_FLOOR;
Neo.START_X = START_X;
Neo.START_Y = START_Y;
Neo.ATTACKS = ATTACKS;
Neo.SLASH_KNOCKBACK = SLASH_KNOCKBACK;
Neo.HEAVY_HIT_HEALTH_RATIO = HEAVY_HIT_HEALTH_RATIO;
Neo.HEAVY_KNOCKBACK_THRESHOLD = HEAVY_KNOCKBACK_THRESHOLD;
Neo.HEAVY_HIT_STUN = HEAVY_HIT_STUN;
Neo.HEAVY_KNOCKBACK_STUN = HEAVY_KNOCKBACK_STUN;
Neo.HEAVY_IMPACT_BOSS_STUN_MULTIPLIER = HEAVY_IMPACT_BOSS_STUN_MULTIPLIER;
Neo.PLAYER_BEAM_BOUNCES = PLAYER_BEAM_BOUNCES;
Neo.HEAVY_BEAM_BOUNCES = HEAVY_BEAM_BOUNCES;
Neo.ENEMY_BEAM_BOUNCES = ENEMY_BEAM_BOUNCES;
Neo.LAZER_GLASSES_BOUNCES = LAZER_GLASSES_BOUNCES;
Neo.BEAM_RICOCHET_NUDGE = BEAM_RICOCHET_NUDGE;
Neo.BEAM_RICOCHET_EPSILON = BEAM_RICOCHET_EPSILON;
Neo.TURTLE_WAVE_HP_PER_SECOND = TURTLE_WAVE_HP_PER_SECOND;
Neo.LOW_HEALTH_HIT_FLASH_MS = LOW_HEALTH_HIT_FLASH_MS;
Neo.CORPSE_FADE_START = CORPSE_FADE_START;
Neo.CORPSE_LIFETIME = CORPSE_LIFETIME;
Neo.CORPSE_FALL_TIME = CORPSE_FALL_TIME;
Neo.PROJECTILE_TRAIL_LENGTH = PROJECTILE_TRAIL_LENGTH;
Neo.AOE_SHOCKWAVE_LIFE = AOE_SHOCKWAVE_LIFE;
Neo.ENV_TILE_SIZE = ENV_TILE_SIZE;
Neo.LIGHTING_CONFIG = LIGHTING_CONFIG;
Neo.ENEMY_SCALING = ENEMY_SCALING;
Neo.BOMB_HAZARD_SCALING = BOMB_HAZARD_SCALING;
Neo.SHOP_PRICE_SCALING = SHOP_PRICE_SCALING;
Neo.BLEED_RESIST_SCALING = BLEED_RESIST_SCALING;
Neo.DIRECTIONS = DIRECTIONS;
Neo.DIRECTION_VECTORS = DIRECTION_VECTORS;
Neo.OPPOSITE_DIRECTION = OPPOSITE_DIRECTION;
Neo.STATUS_KEYS = STATUS_KEYS;
Neo.STATUS_STYLES = STATUS_STYLES;
Neo.STATUS_ICON_DEFS = STATUS_ICON_DEFS;
Neo.ROOM_ART_THEMES = ROOM_ART_THEMES;
Neo.BLEED_BLOOD_COLORS = BLEED_BLOOD_COLORS;
Neo.PERF_BUDGET_60FPS = PERF_BUDGET_60FPS;
Neo.PERF_AVG_WEIGHT = PERF_AVG_WEIGHT;
Neo.PERF_OVERLAY_INTERVAL = PERF_OVERLAY_INTERVAL;
Neo.BOSS_TYPES = BOSS_TYPES;
Neo.CHALLENGE_ROOM_TYPES = CHALLENGE_ROOM_TYPES;
Neo.CHALLENGE_TRIAL_TYPES = CHALLENGE_TRIAL_TYPES;
Neo.RUN_HISTORY_LIMIT = RUN_HISTORY_LIMIT;
Neo.DIFFICULTY_ORDER = DIFFICULTY_ORDER;
Neo.DIFFICULTY_DEFS = DIFFICULTY_DEFS;
Neo.CHALLENGE_DEFS = CHALLENGE_DEFS;
Neo.CHALLENGE_ORDER = CHALLENGE_ORDER;
Neo.LEGACY_UPGRADES = LEGACY_UPGRADES;
Neo.LEGACY_ORDER = LEGACY_ORDER;
Neo.HARD_DIFFICULTIES = HARD_DIFFICULTIES;
Neo.CHARACTER_DEFS = CHARACTER_DEFS;
Neo.HERO_DISPLAY = HERO_DISPLAY;
Neo.SPRITE_SOURCE_SIZE = SPRITE_SOURCE_SIZE;
Neo.SPRITE_DEFS = SPRITE_DEFS;
Neo.ENV_TILE_ROOT = ENV_TILE_ROOT;
Neo.ENV_TILE_SOURCE_SIZE = ENV_TILE_SOURCE_SIZE;
Neo.ENV_TILE_DEFS = ENV_TILE_DEFS;
Neo.MOVE_SLOTS = MOVE_SLOTS;
Neo.SLOT_LABELS = SLOT_LABELS;
Neo.SLOT_KEYS = SLOT_KEYS;
Neo.GOD_PHASE_DIALOGUE = GOD_PHASE_DIALOGUE;
Neo.BOSS_OPENING_DIALOGUE = BOSS_OPENING_DIALOGUE;
Neo.CUTSCENE_GALLERY = CUTSCENE_GALLERY;
Neo.DEFAULT_KILLER_DEATH_QUOTES = DEFAULT_KILLER_DEATH_QUOTES;
Neo.KILLER_DEATH_QUOTES = KILLER_DEATH_QUOTES;
Neo.KozSeededRngApi = KozSeededRngApi;
Neo.KozSaveApi = KozSaveApi;
Neo.KozStorageDrivers = KozStorageDrivers;
Neo.KozDialogueApi = KozDialogueApi;
Neo.KozWorldSpeechApi = KozWorldSpeechApi;
