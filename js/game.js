(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const ROOM_W = 900;
  const ROOM_H = 700;
  const WALL = 28;
  const DOOR = 140;
  const MAX_FLOOR = 10;
  const START_X = ROOM_W / 2;
  const START_Y = ROOM_H / 2;

  const ATTACKS = {
    melee: { baseCooldown: 0.35, range: 72, arc: 1.04, damage: 24, active: 0.17, push: 220 },
    laser: { baseCooldown: 4.2, duration: 0.58, tick: 0.08, range: 430, damage: 10 },
    smash: { baseCooldown: 5.4, radius: 148, damage: 46, bonus: 26 },
  };
  const SLASH_KNOCKBACK = 340;
  const PLAYER_BEAM_BOUNCES = 2;
  const HEAVY_BEAM_BOUNCES = 1;
  const ENEMY_BEAM_BOUNCES = 1;
  const LAZER_GLASSES_BOUNCES = 1;
  const BEAM_RICOCHET_NUDGE = 0.65;
  const BEAM_RICOCHET_EPSILON = 0.0001;
  const TURTLE_WAVE_HP_PER_SECOND = 2;
  const CORPSE_FADE_START = 4.5;
  const CORPSE_LIFETIME = 11;
  const CORPSE_FALL_TIME = 0.32;
  const PROJECTILE_TRAIL_LENGTH = 6;
  const AOE_SHOCKWAVE_LIFE = 0.36;
  const ENV_TILE_SIZE = 48;
  const ENEMY_SCALING = {
    floor: 0.14,
    loop: 0.32,
    minute: 0.12,
  };
  const DIRECTIONS = ['n', 's', 'e', 'w'];
  const DIRECTION_VECTORS = {
    n: { dx: 0, dy: -1 },
    s: { dx: 0, dy: 1 },
    e: { dx: 1, dy: 0 },
    w: { dx: -1, dy: 0 },
  };
  const OPPOSITE_DIRECTION = {
    n: 's',
    s: 'n',
    e: 'w',
    w: 'e',
  };
  const STATUS_KEYS = ['bleed', 'fire', 'poison', 'dark_drain'];
  const STATUS_STYLES = {
    bleed: { color: '#ff4f6d', textColor: '#ff5f5f' },
    fire: { color: '#ff9a3c', textColor: '#ff9a3c' },
    poison: { color: '#85df63', textColor: '#85df63' },
    dark_drain: { color: '#b48cff', textColor: '#b48cff' },
  };
  const ROOM_ART_THEMES = {
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
  const BLEED_BLOOD_COLORS = ['#6f0014', '#a5001e', '#e51e37', '#ff5264'];
  const PERF_BUDGET_60FPS = 1000 / 60;
  const PERF_AVG_WEIGHT = 0.12;
  const PERF_OVERLAY_INTERVAL = 250;
  const perfState = createPerfState();

  const BOSS_TYPES = new Set(['god', 'queen_cult', 'bulk_golem', 'artificer_knave']);
  const CHALLENGE_ROOM_TYPES = new Set(['challenge']);
  const CHALLENGE_TRIAL_TYPES = ['mirror', 'stillness', 'bomb', 'survival', 'runes', 'storm'];
  const KozSeededRngApi = window.KozEngine?.World?.seededRng || {};
  const KozSaveApi = window.KozEngine?.SaveLoad?.saveApi || {};
  const KozStorageDrivers = window.KozEngine?.SaveLoad?.storageDrivers || {};
  const KozDialogueApi = window.KozEngine?.UI?.typewriterDialogue || {};
  const KozWorldSpeechApi = window.KozEngine?.UI?.worldSpeechBubbles || {};
  const GOD_PHASE_DIALOGUE = {
    1: 'So you really want to do this ?',
    2: 'All the trinkets in the world can not make a mortal a god prepare for all my wrath',
    3: 'HOW ?',
    4: 'IT ENDS !',
    5: 'HAVE NO FEAR',
  };
  const BOSS_OPENING_DIALOGUE = {
    queen_cult: 'Kneel and join the chorus.',
    bulk_golem: 'Stone remembers every blow.',
    artificer_knave: 'Run. I only need one clean hit.',
  };
  const RUN_HISTORY_LIMIT = 200;
  const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'impossible', 'god', 'custom'];
  const DIFFICULTY_DEFS = {
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
      enemyReactionMultiplier: 1,
      rangedCadenceMultiplier: 1,
      supportPowerMultiplier: 1,
      shopPriceMultiplier: 1,
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
      speedMultiplier: 1.03,
      enemyReactionMultiplier: 1.06,
      rangedCadenceMultiplier: 0.95,
      supportPowerMultiplier: 1.08,
      shopPriceMultiplier: 1.08,
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
      speedMultiplier: 1.06,
      enemyReactionMultiplier: 1.12,
      rangedCadenceMultiplier: 0.9,
      supportPowerMultiplier: 1.14,
      shopPriceMultiplier: 1.16,
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
      speedMultiplier: 1.1,
      enemyReactionMultiplier: 1.2,
      rangedCadenceMultiplier: 0.82,
      supportPowerMultiplier: 1.22,
      shopPriceMultiplier: 1.28,
    },
    god: {
      key: 'god',
      name: 'God',
      description: 'Unlocks after 10 loops. Brutal challenge mode.',
      unlockLoops: 10,
      waveBonus: 4,
      eliteFloor: 5,
      eliteChance: 0.32,
      miniBossChanceMultiplier: 1.9,
      roomWeightBonus: 0.22,
      statMultiplier: 1.52,
      bossStatMultiplier: 1.62,
      speedMultiplier: 1.14,
      enemyReactionMultiplier: 1.28,
      rangedCadenceMultiplier: 0.74,
      supportPowerMultiplier: 1.3,
      shopPriceMultiplier: 1.42,
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
    },
  };
  const CHALLENGE_DEFS = {
    no_hit: {
      key: 'no_hit',
      name: 'Never Get Hit',
      cost: 4,
      unlockLoops: 0,
      reward: '+65% loop crystal payout',
      description: 'Any real damage kills the run immediately.',
    },
    no_items: {
      key: 'no_items',
      name: 'No Items',
      cost: 3,
      unlockLoops: 0,
      reward: '+40% loop crystal payout',
      description: 'Start with no relic. Item pickups and relic buys are disabled.',
    },
    fragile_body: {
      key: 'fragile_body',
      name: 'Fragile Body',
      cost: 2,
      unlockLoops: 0,
      reward: '+25% loop crystal payout',
      description: 'Start each run with 70% max HP.',
    },
    swarm_rooms: {
      key: 'swarm_rooms',
      name: 'Swarm Rooms',
      cost: 3,
      unlockLoops: 0,
      reward: '+35% loop crystal payout',
      description: 'Combat rooms spawn extra enemies.',
    },
    elite_hunt: {
      key: 'elite_hunt',
      name: 'Elite Hunt',
      cost: 4,
      unlockLoops: 0,
      reward: '+45% loop crystal payout',
      description: 'Elite enemies appear much more often.',
    },
    cursed_shops: {
      key: 'cursed_shops',
      name: 'Cursed Shops',
      cost: 2,
      unlockLoops: 0,
      reward: '+30% loop crystal payout',
      description: 'Shop prices are 50% higher this run.',
    },
    glass_cannon: {
      key: 'glass_cannon',
      name: 'Glass Cannon',
      cost: 3,
      unlockLoops: 0,
      reward: '+35% loop crystal payout',
      description: 'Deal 25% more damage, but incoming damage is 35% higher.',
    },
  };
  const CHALLENGE_ORDER = Object.keys(CHALLENGE_DEFS);

  const LEGACY_UPGRADES = {
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
  const LEGACY_ORDER = Object.keys(LEGACY_UPGRADES);
  const HARD_DIFFICULTIES = new Set(['hard', 'impossible', 'god']);

  const CHARACTER_DEFS = {
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
      skills: { melee: 'Fire Balls', laser: 'Power Disks', smash: 'Chaos Burst', dash: 'Warp' },
    },
    granialla: {
      key: 'granialla',
      name: 'Granialla',
      rarity: 'god',
      damageMultiplier: 1,
      skills: { melee: 'Smite', laser: 'Blade Justice', smash: 'Healing Zone', dash: 'Zip Lightning' },
      unlock: 'godslain',
    },
  };

  const HERO_DISPLAY = {
    princess: {
      lore: 'A radiant pink princess built for accessible runs. High damage, generous HP, and forgiving cooldowns make her ideal for new adventurers.',
      stats: [
        { label: 'HP',    pct: 90, color: '#f47ebd' },
        { label: 'DMG',   pct: 80, color: '#ff9ccf' },
        { label: 'SPD',   pct: 66, color: '#c991ff' },
        { label: 'RANGE', pct: 60, color: '#ffd1ea' },
      ],
    },
    thorn_knight: {
      lore: 'A bleed-forged warrior who turns wounds into weapons. The longer the fight, the deadlier he becomes.',
      stats: [
        { label: 'HP',    pct: 66, color: '#c06060' },
        { label: 'DMG',   pct: 66, color: '#c08040' },
        { label: 'SPD',   pct: 66, color: '#8080c0' },
        { label: 'RANGE', pct: 40, color: '#60a080' },
      ],
    },
    metao: {
      lore: 'Wizard king of chaos and fire. Low raw damage but disks and blasts reward aggressive play.',
      stats: [
        { label: 'HP',    pct: 66, color: '#c06060' },
        { label: 'DMG',   pct: 33, color: '#c08040' },
        { label: 'SPD',   pct: 66, color: '#8080c0' },
        { label: 'RANGE', pct: 90, color: '#60a080' },
      ],
    },
    granialla: {
      lore: 'A dark-skinned princess with a crown of golden hair. Divine judgment and self-restoration — earned only by slaying GOD.',
      stats: [
        { label: 'HP',    pct: 66, color: '#c06060' },
        { label: 'DMG',   pct: 66, color: '#c08040' },
        { label: 'SPD',   pct: 66, color: '#8080c0' },
        { label: 'RANGE', pct: 66, color: '#60a080' },
      ],
    },
  };

  const SPRITE_SOURCE_SIZE = 10;
  const SPRITE_DEFS = window.NeoNykeSpriteDefs || {};
  const SPRITE_ATLAS = buildSpriteAtlas();
  const ENV_TILE_ROOT = window.NeoNykeEnvironmentTileDefs || {};
  const ENV_TILE_SOURCE_SIZE = ENV_TILE_ROOT.sourceSize || 16;
  const ENV_TILE_DEFS = ENV_TILE_ROOT.tiles || {};
  const ENV_TILE_ATLAS = buildEnvironmentTileAtlas();

  const MOVE_SLOTS = ['melee', 'laser', 'smash', 'dash'];
  const SLOT_LABELS = { melee: 'Melee', laser: 'Laser', smash: 'Smash', dash: 'Mobility' };
  const SLOT_KEYS  = { melee: 'LMB', laser: 'RMB', smash: 'R', dash: 'SHIFT' };
  function normalizeMouseBinding(value, fallback) {
    const normalized = String(value || fallback).toLowerCase();
    return normalized === 'rmb' || normalized === 'lmb' ? normalized : fallback;
  }

  function getMouseBindings() {
    const bindings = window.NeoSettings?.getBindings?.();
    return {
      slash: normalizeMouseBinding(bindings?.slash, 'lmb'),
      laser: normalizeMouseBinding(bindings?.laser, 'rmb'),
    };
  }

  function isMouseActionHeld(action) {
    const mouseBindings = getMouseBindings();
    if (mouseBindings[action] === 'rmb') {
      const held = !!mouse.right || !!mouse.rightQueued;
      mouse.rightQueued = false;
      return held;
    }
    const held = !!mouse.down || !!mouse.downQueued;
    mouse.downQueued = false;
    return held;
  }

  function formatMouseBindingLabel(value, fallback) {
    return normalizeMouseBinding(value, fallback) === 'rmb' ? 'RMB' : 'LMB';
  }

  function getSlotKeyLabel(slot) {
    const bindings = window.NeoSettings?.getBindings?.();
    if (slot === 'melee') return formatMouseBindingLabel(bindings?.slash, 'lmb');
    if (slot === 'laser') return formatMouseBindingLabel(bindings?.laser, 'rmb');
    if (slot === 'smash') return String(bindings?.smash || SLOT_KEYS.smash || 'r').toUpperCase();
    if (slot === 'dash') return String(bindings?.dash || SLOT_KEYS.dash || 'shift').toUpperCase();
    return SLOT_KEYS[slot] || '';
  }

  const MOVE_DEFS = {
    slash: { key: 'slash', slot: 'melee', name: 'Slash', desc: 'Close-range arc attack.' },
    fire_balls: { key: 'fire_balls', slot: 'melee', name: 'Fire Balls', desc: 'Shoot a spread of fireballs.' },
    smite: { key: 'smite', slot: 'melee', name: 'Smite', desc: 'Physical swing plus chaining lightning.' },
    narwal_fight: { key: 'narwal_fight', slot: 'melee', name: 'Narwal Fight', desc: 'A wide pink spear-sweep with a piercing follow-up.', exclusiveCharacter: 'princess' },

    blood_beam: { key: 'blood_beam', slot: 'laser', name: 'Blood Beam', desc: 'Sustained piercing beam that causes bleed.' },
    love_beam: { key: 'love_beam', slot: 'laser', name: 'Love Beam', desc: 'A radiant beam that damages enemies and heals you on hit.', exclusiveCharacter: 'princess' },
    turtle_wave: { key: 'turtle_wave', slot: 'laser', name: 'Turtle Wave', desc: 'Giant beam. Drains 2 HP each active second.' },
    power_disks: { key: 'power_disks', slot: 'laser', name: 'Power Disks', desc: 'Burst of spinning disks.' },
    blade_justice: { key: 'blade_justice', slot: 'laser', name: 'Blade Justice', desc: 'Divine short-range blade strike.' },
    lightning_columns: { key: 'lightning_columns', slot: 'laser', name: 'Lightning Columns', desc: 'Summon two lightning turrets.' },
    god_sweep: { key: 'god_sweep', slot: 'laser', name: 'God Sweep', desc: 'Spin a massive divine beam around yourself.' },

    crimson_smash: { key: 'crimson_smash', slot: 'smash', name: 'Crimson Smash', desc: 'Heavy area smash.' },
    kicky_kick: { key: 'kicky_kick', slot: 'smash', name: 'Kicky Kick', desc: 'A heavy kick that blasts enemies away.', exclusiveCharacter: 'princess' },
    chaos_burst: { key: 'chaos_burst', slot: 'smash', name: 'Chaos Burst', desc: 'Multiple chaos detonations.' },
    healing_zone: { key: 'healing_zone', slot: 'smash', name: 'Healing Zone', desc: 'Healing and damage zone.' },
    fire_circle: { key: 'fire_circle', slot: 'smash', name: 'Fire Circle', desc: 'Burning aura around you.' },
    floor_lava: { key: 'floor_lava', slot: 'smash', name: 'Floor Is Lava', desc: 'Lava immunity and lava trail.' },

    dash: {
      key: 'dash',
      slot: 'dash',
      name: 'Dash',
      desc: 'Fast invulnerable burst movement.',
      maxStacks: 1,
      stackOverrides: { thorn_knight: 2 },
    },
    nimrod_stomp: {
      key: 'nimrod_stomp',
      slot: 'dash',
      name: 'Nimrod Stomp',
      desc: 'Leap across the room and slam on landing for heavy AOE damage.',
    },
    warp: { key: 'warp', slot: 'dash', name: 'Warp', desc: 'Phase out and reappear where you click.' },
    zip_lightning: {
      key: 'zip_lightning',
      slot: 'dash',
      name: 'Zip Lightning',
      desc: 'Zip between targets, chaining lightning hits as you move.',
    },
    flying_unhitable: {
      key: 'flying_unhitable',
      slot: 'dash',
      name: 'Flying Untouchable',
      desc: 'Rise into the air and become untouchable for 15 seconds.',
      exclusiveCharacter: 'princess',
    },
    cowards_way: {
      key: 'cowards_way',
      slot: 'dash',
      name: "Coward's Way",
      desc: 'Become invulnerable for 3 seconds, but it ends if you attack.',
    },
  };

  const SHOP_MOVE_POOL = [
    'slash', 'fire_balls', 'smite', 'narwal_fight',
    'blood_beam', 'love_beam', 'turtle_wave', 'power_disks', 'blade_justice', 'lightning_columns',
    'god_sweep',
    'crimson_smash', 'kicky_kick', 'chaos_burst', 'healing_zone', 'fire_circle', 'floor_lava',
    'dash', 'nimrod_stomp', 'warp', 'zip_lightning', 'flying_unhitable', 'cowards_way',
  ];

  const WEAPON_DEFS = {
    extending_staff: {
      key: 'extending_staff',
      name: 'Extending Staff',
      rarity: 'knight',
      description: 'Long sweeping strike with massive knockback.',
      color: '#f2f6ff',
    },
    hunters_bow: {
      key: 'hunters_bow',
      name: "Hunter's Bow",
      rarity: 'knight',
      description: 'Fast, accurate ranged shot with +10% crit chance.',
      color: '#e8f7ff',
    },
    thorns_bleed_blade: {
      key: 'thorns_bleed_blade',
      name: "Thorn's Bleed Blade",
      rarity: 'knight',
      description: 'Close slash with heavy bleed application.',
      color: '#ffe9ef',
    },
    lazer_glasses: {
      key: 'lazer_glasses',
      name: 'Lazer Glasses',
      rarity: 'wizard',
      description: 'Twin beams track your mouse and can ignite enemies.',
      color: '#cd9bff',
    },
    metao_fire_staff: {
      key: 'metao_fire_staff',
      name: "Metao's Fire Staff",
      rarity: 'wizard',
      description: 'Fan cast of burning fire bolts.',
      color: '#ffb874',
    },
    magenta_degale: {
      key: 'magenta_degale',
      name: "Magenta's Degale",
      rarity: 'wizard',
      description: 'Super heavy shot with massive knockback and recoil.',
      color: '#ff8ccc',
    },
    magenta_p90: {
      key: 'magenta_p90',
      name: "Magenta's P90",
      rarity: 'wizard',
      description: 'Rapid burst fire with controlled recoil.',
      color: '#ff9dd7',
    },
    granillia_lightning_spear: {
      key: 'granillia_lightning_spear',
      name: "Granillia's Spear of Lightning",
      rarity: 'god',
      description: 'Piercing lightning spear that chains on impact.',
      color: '#9bd9ff',
    },
    excalibur: {
      key: 'excalibur',
      name: 'Excalibur',
      rarity: 'god',
      description: "A divine strike for 777% of your base damage.",
      color: '#ffd980',
    },
    golden_fleece: {
      key: 'golden_fleece',
      name: 'Golden Fleece',
      rarity: 'god',
      description: 'Heals 20% max HP every 2 seconds while equipped.',
      color: '#ffe59c',
    },
    void_piercer: {
      key: 'void_piercer',
      name: 'Void Piercer',
      rarity: 'god',
      description: 'Pierces barriers with high damage and 20% crit.',
      color: '#ffd2c0',
    },
    aegis_shield_weapon: {
      key: 'aegis_shield_weapon',
      name: 'Aegis Shield',
      rarity: 'god',
      description: 'Blocks all incoming damage for 2 seconds.',
      color: '#c8f6ff',
    },
  };
  const WEAPON_KEYS = Object.keys(WEAPON_DEFS);
  const WHITE_WEAPON_POOL = ['extending_staff', 'hunters_bow', 'thorns_bleed_blade'];

  // Rival adventurers: dungeon-roaming NPCs based on unchosen characters.
  const RIVAL_DEFS = {
    princess: {
      name: 'Rival Princess',
      color: '#e87fff',
      hp: 220, dmg: 26, speed: 102, r: 16, attackCd: 0.75,
      enterLine: 'This dungeon belongs to me.',
      deathLine: 'Unbelievable...',
      attackStyle: 'melee',
    },
    thorn_knight: {
      name: 'Rival Thorn',
      color: '#ff6e8b',
      hp: 180, dmg: 22, speed: 118, r: 16, attackCd: 0.8,
      enterLine: 'Your loot is mine.',
      deathLine: 'Run next time...',
      attackStyle: 'melee',
    },
    metao: {
      name: 'Rival Metao',
      color: '#ff9940',
      hp: 130, dmg: 16, speed: 82, r: 15, attackCd: 1.3,
      enterLine: 'I\'ve been watching you.',
      deathLine: 'Impossible...',
      attackStyle: 'ranged',
    },
    granialla: {
      name: 'Rival Granialla',
      color: '#a8aaff',
      hp: 240, dmg: 20, speed: 94, r: 17, attackCd: 1.0,
      enterLine: 'You dare compete with a god?',
      deathLine: 'This cannot be...',
      attackStyle: 'melee_heal',
    },
  };
  const RIVAL_MOVE_INTERVAL_BASE = 8.5;
  const PURPLE_WEAPON_POOL = ['lazer_glasses', 'metao_fire_staff', 'magenta_degale', 'magenta_p90'];
  const RED_WEAPON_POOL = ['granillia_lightning_spear', 'excalibur', 'golden_fleece', 'void_piercer', 'aegis_shield_weapon'];

  const ITEM_DEFS = {
    neo_knife: {
      key: 'neo_knife',
      name: 'Neo-Knife',
      shortName: 'Knife',
      description: 'Bleed chance +5%.',
      rarity: 'knight',
      color: '#f4f6fb',
      category: 'knight',
      tags: ['bleed'],
    },
    orb_of_blood: {
      key: 'orb_of_blood',
      name: 'Orb of Blood',
      shortName: 'Orb',
      description: 'Bleeding enemies take double damage.',
      rarity: 'wizard',
      color: '#a857ff',
      category: 'wizard',
      tags: ['bleed', 'damage'],
    },
    hemes_scarf: {
      key: 'hemes_scarf',
      name: "Heme's Scarf",
      shortName: 'Scarf',
      description: 'All enemies bleed and each bleed stack heals you.',
      rarity: 'god',
      color: '#ff4256',
      accent: '#35ff6f',
      category: 'god',
      tags: ['bleed', 'heal', 'breaker'],
    },
    insurance: {
      key: 'insurance',
      name: 'Insurance',
      shortName: 'Insure',
      description: 'If a hit pushes you below half health, this is consumed and must recharge with kills.',
      rarity: 'knight',
      color: '#f4f6fb',
      category: 'knight',
      tags: ['charge', 'defense'],
    },
    crit_charm: {
      key: 'crit_charm',
      name: 'Crit Charm',
      shortName: 'Hit Crit',
      description: 'Hits grant +4% crit chance per stack for 2.2s.',
      rarity: 'knight',
      color: '#ffffff',
      category: 'knight',
      tags: ['crit'],
    },
    attack_servo: {
      key: 'attack_servo',
      name: 'Attack Servo',
      shortName: 'AS %',
      description: 'Attack speed +12% per stack.',
      rarity: 'knight',
      color: '#eef5ff',
      category: 'knight',
      tags: ['speed'],
    },
    keen_eye: {
      key: 'keen_eye',
      name: 'Keen Eye',
      shortName: 'Kill Focus',
      description: 'Charge on 10 kills. When full, the next kill grants +10% crit chance per stack for 7s.',
      rarity: 'knight',
      color: '#f7fbff',
      category: 'knight',
      tags: ['crit', 'charge'],
    },
    chrono_spring: {
      key: 'chrono_spring',
      name: 'Chrono Spring',
      shortName: 'Kill Haste',
      description: 'Charge on 7 kills. When full, the next kill grants +16% attack speed per stack for 6s.',
      rarity: 'knight',
      color: '#e6f6ff',
      category: 'knight',
      tags: ['speed', 'charge'],
    },
    scholar_seal: {
      key: 'scholar_seal',
      name: 'Scholar Seal',
      shortName: 'XP +15%',
      description: 'Gain 15% more XP on enemy kill.',
      rarity: 'knight',
      color: '#d0ecff',
      category: 'knight',
      tags: ['xp'],
    },
    scholar_cap: {
      key: 'scholar_cap',
      name: "Scholar's Cap",
      shortName: 'Level Edge',
      description: 'Deal more damage the closer you are to leveling up.',
      rarity: 'wizard',
      color: '#b49cff',
      category: 'wizard',
      tags: ['xp', 'damage', 'wizard'],
    },
    bandaid: {
      key: 'bandaid',
      name: 'Bandaid',
      shortName: 'DEF +0.5%',
      description: 'Defense +0.5%.',
      rarity: 'knight',
      color: '#fff5f7',
      category: 'knight',
      tags: ['defense'],
    },
    push_man: {
      key: 'push_man',
      name: 'Push Man',
      shortName: 'KB +18%',
      description: 'Knockback +18%.',
      rarity: 'knight',
      color: '#fff2cf',
      category: 'knight',
      tags: ['knockback'],
    },
    titan_heart: {
      key: 'titan_heart',
      name: 'Titan Heart',
      shortName: 'Max HP +8%',
      description: 'Max HP +8%.',
      rarity: 'knight',
      color: '#ffd9de',
      category: 'knight',
      tags: ['hp'],
    },
    charged_adapter: {
      key: 'charged_adapter',
      name: 'Charged Adapter',
      shortName: 'Adapter',
      description: 'Charge requirement -1. In non-boss fights, spend half your gold to teleport to the ladder room.',
      rarity: 'wizard',
      color: '#b66cff',
      category: 'wizard',
      tags: ['charge', 'mobility'],
    },
    explosive_jelly: {
      key: 'explosive_jelly',
      name: 'Explosive Jelly',
      shortName: 'AOE x2',
      description: 'All player AOE ranges are doubled.',
      rarity: 'wizard',
      color: '#ffb27d',
      category: 'wizard',
      tags: ['aoe', 'wizard'],
    },
    dragon_orb: {
      key: 'dragon_orb',
      name: 'Dragon Orb',
      shortName: 'Beam Chain',
      description: 'Beam attacks deal more damage and chain to a nearby enemy after locking on.',
      rarity: 'wizard',
      color: '#b77dff',
      category: 'wizard',
      tags: ['beam', 'spell', 'wizard'],
    },
    turtle_shell: {
      key: 'turtle_shell',
      name: 'Turtle Shell',
      shortName: 'Shell +5%',
      description: 'Move speed +5%.',
      rarity: 'knight',
      color: '#d2ffd8',
      category: 'knight',
      tags: ['speed', 'move'],
    },
    iron_lung: {
      key: 'iron_lung',
      name: 'Iron Lung',
      shortName: 'Iron',
      description: 'In non-boss fights, you cannot lose more than 20% max HP in one room.',
      rarity: 'god',
      color: '#c6d4e8',
      category: 'god',
      tags: ['defense', 'god'],
    },
    oracles_lens: {
      key: 'oracles_lens',
      name: "Oracle's Lens",
      shortName: 'Oracle',
      description: 'Critical hit chance is doubled on pickup, and crits scale harder with your crit chance.',
      rarity: 'god',
      color: '#8ee6ff',
      category: 'god',
      reveal: true,
      tags: ['crit', 'god'],
    },
    wizards_paw: {
      key: 'wizards_paw',
      name: "Wizard's Paw",
      shortName: 'Paw',
      description: 'Randomly chooses 2 stats to triple.',
      rarity: 'god',
      color: '#ffcf80',
      category: 'god',
      tags: ['god', 'stat'],
    },
    jesters_dice: {
      key: 'jesters_dice',
      name: "Jester's Dice",
      shortName: 'Dice',
      description: 'Skip 3 floors and gain 10 random items.',
      rarity: 'god',
      color: '#ff8bd8',
      category: 'god',
      tags: ['god', 'chaos'],
    },
    shield_of_aegis: {
      key: 'shield_of_aegis',
      name: 'Shield of Aegis',
      shortName: 'DEF +20%',
      description: 'Defense +20%.',
      rarity: 'god',
      color: '#ffe7a8',
      category: 'god',
      tags: ['god', 'defense'],
    },
    pendant_of_kronos: {
      key: 'pendant_of_kronos',
      name: 'Pendant of Kronos',
      shortName: 'Crit +1%/God',
      description: 'Raises crit chance by 1% for each god item you have.',
      rarity: 'god',
      color: '#d8c6ff',
      category: 'god',
      tags: ['god', 'crit'],
    },
  };
  const RARITY_NAME_COLORS = {
    knight: '#f4f6fb',
    white: '#f4f6fb',
    wizard: '#b77dff',
    purple: '#b77dff',
    god: '#ff4256',
    red: '#ff4256',
  };
  const SHOP_RARITY_PRICE_MULTIPLIERS = {
    knight: 1,
    white: 1,
    wizard: 2.15,
    purple: 2.15,
    god: 4.75,
    red: 4.75,
  };
  const ITEM_KEYS = Object.keys(ITEM_DEFS);
  const ITEM_DROP_WEIGHTS = [
    ['neo_knife', 60],
    ['orb_of_blood', 28],
    ['hemes_scarf', 12],
    ['insurance', 18],
    ['crit_charm', 24],
    ['attack_servo', 22],
    ['keen_eye', 20],
    ['chrono_spring', 20],
    ['scholar_seal', 18],
    ['scholar_cap', 12],
    ['bandaid', 22],
    ['push_man', 18],
    ['titan_heart', 18],
    ['charged_adapter', 18],
    ['explosive_jelly', 12],
    ['dragon_orb', 14],
    ['turtle_shell', 24],
    ['iron_lung', 10],
    ['oracles_lens', 8],
    ['wizards_paw', 6],
    ['jesters_dice', 4],
    ['shield_of_aegis', 4],
    ['pendant_of_kronos', 5],
  ];
  const ITEM_DROP_TABLE = buildWeightTable(ITEM_DROP_WEIGHTS);
  const ELITE_ITEM_DROP_TABLE = buildWeightTable(
    ITEM_DROP_WEIGHTS.map(([key, weight]) => [key, weight + (key !== 'neo_knife' ? 4 : 0)])
  );
  const ELITE_INVENTORY_POOL = [
    'neo_knife',
    'orb_of_blood',
    'insurance',
    'crit_charm',
    'attack_servo',
    'scholar_cap',
    'charged_adapter',
    'explosive_jelly',
    'dragon_orb',
    'turtle_shell',
    'iron_lung',
    'oracles_lens',
    'bandaid',
    'shield_of_aegis',
    'pendant_of_kronos',
  ];
  const WHITE_ITEM_POOL = ITEM_KEYS.filter(key => ITEM_DEFS[key]?.rarity === 'knight');
  const ELITE_TYPE_DEFS = {
    burning: { label: 'Burning', color: '#ff9a3c' },
    bleeding: { label: 'Bleeding', color: '#ff4256' },
    giant: { label: 'Giant', color: '#ffd27d' },
    blessed: { label: 'Blessed', color: '#f2f6ff' },
    lasered: { label: 'Lazered', color: '#78d7ff' },
  };
  const itemRegistry = createItemRegistry();

  const ui = {
    hud: document.getElementById('hud'),
    hpFill: document.getElementById('hpFill'),
    hpTxt: document.getElementById('hpTxt'),
    lv: document.getElementById('lv'),
    xp: document.getElementById('xp'),
    fl: document.getElementById('fl'),
    gameTime: document.getElementById('gameTime'),
    coins: document.getElementById('coins'),
    charName: document.getElementById('charName'),
    objective: document.getElementById('objective'),
    objectiveTracker: document.getElementById('objectiveTracker'),
    objectiveRoomLabel: document.getElementById('objectiveRoomLabel'),
    objectiveList: document.getElementById('objectiveList'),
    cdM: document.getElementById('cdM'),
    cdL: document.getElementById('cdL'),
    cdS: document.getElementById('cdS'),
    cdD: document.getElementById('cdD'),
    timeMelee: document.getElementById('timeMelee'),
    timeLaser: document.getElementById('timeLaser'),
    timeSmash: document.getElementById('timeSmash'),
    timeDash: document.getElementById('timeDash'),
    fillMelee: document.getElementById('fillMelee'),
    fillLaser: document.getElementById('fillLaser'),
    fillSmash: document.getElementById('fillSmash'),
    fillDash: document.getElementById('fillDash'),
    bankCoins: document.getElementById('bankCoins'),
    loopCount: document.getElementById('loopCount'),
    bestFloor: document.getElementById('bestFloor'),
    saveState: document.getElementById('saveState'),
    start: document.getElementById('start'),
    charSelect: document.getElementById('charSelect'),
    dead: document.getElementById('dead'),
    deadKillerCanvas: document.getElementById('deadKillerCanvas'),
    deadKillerName: document.getElementById('deadKillerName'),
    deadFloor: document.getElementById('deadFloor'),
    deadLevel: document.getElementById('deadLevel'),
    deadKills: document.getElementById('deadKills'),
    deadTime: document.getElementById('deadTime'),
    deadCoins: document.getElementById('deadCoins'),
    deadDifficulty: document.getElementById('deadDifficulty'),
    deadItems: document.getElementById('deadItems'),
    win: document.getElementById('win'),
    winInfo: document.getElementById('winInfo'),
    deadRestart: document.querySelector('#dead .restart'),
    winRestart: document.querySelector('#win .restart'),
    pause: document.getElementById('pause'),
    pauseResume: document.getElementById('pauseResume'),
    pauseSettings: document.getElementById('pauseSettings'),
    pauseMain: document.getElementById('pauseMain'),
    actionBar: document.getElementById('actionBar'),
    shopPanel: document.getElementById('shopPanel'),
    shopClose: document.getElementById('shopClose'),
    shopTabs: [...document.querySelectorAll('#shopPanel .shop-tab')],
    shopItems: document.getElementById('shopItems'),
    shopWeapons: document.getElementById('shopWeapons'),
    shopMoves: document.getElementById('shopMoves'),
    shopHeals: document.getElementById('shopHeals'),
    shopCoins: document.getElementById('shopCoins'),
    invPanel: document.getElementById('invPanel'),
    invClose: document.getElementById('invClose'),
    invTabs: [...document.querySelectorAll('#invPanel .inv-tab')],
    wizardPawModal: document.getElementById('wizardPawModal'),
    wizardPawStats: document.getElementById('wizardPawStats'),
    wizardPawChoices: document.getElementById('wizardPawChoices'),
    wizardPawConfirm: document.getElementById('wizardPawConfirm'),
    invItemsList: document.getElementById('invItemsList'),
    invWeaponsList: document.getElementById('invWeaponsList'),
    invWeaponSlot: document.getElementById('invWeaponSlot'),
    invStats: document.getElementById('invStats'),
    invMovesList: document.getElementById('invMovesList'),
    invSlots: {
      melee: document.querySelector('#invPanel [data-slot="melee"]'),
      laser: document.querySelector('#invPanel [data-slot="laser"]'),
      smash: document.querySelector('#invPanel [data-slot="smash"]'),
      dash: document.querySelector('#invPanel [data-slot="dash"]'),
    },
    playerStats: document.getElementById('playerStats'),
    coinDisplay: document.getElementById('coinDisplay'),
    coinIcon: document.getElementById('coinIcon'),
    metaCoinIcon: document.getElementById('metaCoinIcon'),
    metaLoopIcon: document.getElementById('metaLoopIcon'),
    centerDisplay: document.getElementById('centerDisplay'),
    challengeStatus: document.getElementById('challengeStatus'),
    challengeStatusLabel: document.getElementById('challengeStatusLabel'),
    challengeStatusFill: document.getElementById('challengeStatusFill'),
    dialogueOverlay: document.getElementById('dialogueOverlay'),
    dialogueSpeaker: document.getElementById('dialogueSpeaker'),
    dialogueText: document.getElementById('dialogueText'),
    dialogueHint: document.getElementById('dialogueHint'),
    entityDialogueLayer: document.getElementById('entityDialogueLayer'),
    playerHpFill: document.getElementById('playerHpFill'),
    playerHpTxt: document.getElementById('playerHpTxt'),
    playerXpFill: document.getElementById('playerXpFill'),
    playerXpTxt: document.getElementById('playerXpTxt'),
    coinCount: document.getElementById('coinCount'),
    timerDisplay: document.getElementById('timerDisplay'),
    floorDisplay: document.getElementById('floorDisplay'),
    seed: document.getElementById('seed'),
    go: document.getElementById('go'),
    difficultyHint: document.getElementById('difficultyHint'),
    challengePanel: document.getElementById('challengePanel'),
    challengeToggle: document.getElementById('challengeToggle'),
    challengeHint: document.getElementById('challengeHint'),
    continueRow: document.getElementById('continueRow'),
    continueBtn: document.getElementById('continueBtn'),
    newRunBtn: document.getElementById('newRunBtn'),
    runHistoryBtn: document.getElementById('runHistoryBtn'),
    runHistoryPanel: document.getElementById('runHistoryPanel'),
    runHistoryList: document.getElementById('runHistoryList'),
    runHistoryEmpty: document.getElementById('runHistoryEmpty'),
    runHistoryClose: document.getElementById('runHistoryClose'),
    runHistoryPrev: document.getElementById('runHistoryPrev'),
    runHistoryNext: document.getElementById('runHistoryNext'),
    runHistoryPageLabel: document.getElementById('runHistoryPageLabel'),
    runHistoryHero: document.getElementById('runHistoryHero'),
    runHistoryTabPanel: document.getElementById('runHistoryTabPanel'),
    runHistoryTabs: [...document.querySelectorAll('#runHistoryPanel .rh-tab')],
    anvilPanel: document.getElementById('anvilPanel'),
    anvilClose: document.getElementById('anvilClose'),
    anvilTabs: [...document.querySelectorAll('#anvilPanel .anvil-tab')],
    anvilXp: document.getElementById('anvilXp'),
    anvilWeaponsTab: document.getElementById('anvilWeaponsTab'),
    anvilMovesTab: document.getElementById('anvilMovesTab'),
    anvilWeaponList: document.getElementById('anvilWeaponList'),
    anvilMoveList: document.getElementById('anvilMoveList'),
    anvilWeaponStats: document.getElementById('anvilWeaponStats'),
    anvilMoveStats: document.getElementById('anvilMoveStats'),
    anvilCostSummary: document.getElementById('anvilCostSummary'),
    anvilCancel: document.getElementById('anvilCancel'),
    anvilConfirm: document.getElementById('anvilConfirm'),
    settingsBtn: document.getElementById('settingsBtn'),
    altModesBtn: document.getElementById('altModesBtn'),
    altModesPanel: document.getElementById('altModesPanel'),
    altModesClose: document.getElementById('altModesClose'),
    altModeEndlessBtn: document.getElementById('altModeEndlessBtn'),
    altModePracticeBtn: document.getElementById('altModePracticeBtn'),
    altModeBossRushBtn: document.getElementById('altModeBossRushBtn'),
    endlessHud: document.getElementById('endlessHud'),
    endlessWaveNum: document.getElementById('endlessWaveNum'),
    bossRushHud: document.getElementById('bossRushHud'),
    bossRushStageNum: document.getElementById('bossRushStageNum'),
    practicePanel: document.getElementById('practicePanel'),
    practicePanelToggle: document.getElementById('practicePanelToggle'),
    practicePanelBody: document.getElementById('practicePanelBody'),
    practiceEnemyGrid: document.getElementById('practiceEnemyGrid'),
    practiceEliteToggle: document.getElementById('practiceEliteToggle'),
    practiceClearBtn: document.getElementById('practiceClearBtn'),
    practiceHealBtn: document.getElementById('practiceHealBtn'),
    practiceGiveItemBtn: document.getElementById('practiceGiveItemBtn'),
    charBackBtn: document.getElementById('charBackBtn'),
    deleteRunRow: document.getElementById('deleteRunRow'),
    deleteRunBtn: document.getElementById('deleteRunBtn'),
    runSummary: document.getElementById('runSummary'),
    charButtons: [...document.querySelectorAll('#choose .char-card')],
    difficultyButtons: [...document.querySelectorAll('#difficultySelect .difficulty-btn')],
    challengeButtons: [...document.querySelectorAll('#challengeSelect .challenge-btn')],
    legacyPanel: document.getElementById('legacyPanel'),
    legacyToggle: document.getElementById('legacyToggle'),
    legacyHint: document.getElementById('legacyHint'),
    legacyButtons: [...document.querySelectorAll('#legacySelect .legacy-btn')],
    itemSlots: {
      neo_knife: document.getElementById('rr-neo-knife'),
      orb_of_blood: document.getElementById('rr-orb-blood'),
      hemes_scarf: document.getElementById('rr-hemes-scarf'),
    },
    itemCounts: {
      neo_knife: document.getElementById('countNeoKnife'),
      orb_of_blood: document.getElementById('countOrbBlood'),
      hemes_scarf: document.getElementById('countHemesScarf'),
    },
    actionCards: {
      dash: document.querySelector('[data-skill="dash"]'),
      melee: document.querySelector('[data-skill="melee"]'),
      laser: document.querySelector('[data-skill="laser"]'),
      smash: document.querySelector('[data-skill="smash"]'),
    },
    skillNames: {
      dash: document.querySelector('[data-skill="dash"] .skill-name'),
      melee: document.querySelector('[data-skill="melee"] .skill-name'),
      laser: document.querySelector('[data-skill="laser"] .skill-name'),
      smash: document.querySelector('[data-skill="smash"] .skill-name'),
    },
    icons: {
      dash: document.getElementById('iconDash'),
      melee: document.getElementById('iconMelee'),
      laser: document.getElementById('iconLaser'),
      smash: document.getElementById('iconSmash'),
    },
  };
  const GameStateManagerCtor = window.KozEngine?.Core?.gameStateManager?.GameStateManager || null;
  const gameStateManager = GameStateManagerCtor ? new GameStateManagerCtor() : null;
  if (gameStateManager) {
    ['menu', 'charselect', 'play', 'dialogue', 'pause', 'dying', 'dead', 'win'].forEach(state => gameStateManager.addState(state));
  }
  const uiController = createUIController(ui);

  let player = null;
  let enemies = [];
  let deadBodies = [];
  let particles = [];
  let projectiles = [];
  let chests = [];
  let pickups = [];
  let rooms = [];
  let currentRoom = null;
  let keys = {};
  let mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false, right: false, downQueued: false, rightQueued: false };
  let cooldowns = {};
  let camera = { x: 0, y: 0 };
  let shake = 0;
  let shakeT = 0;
  let gameState = 'menu';
  let floor = 1;
  let baseSeedStr = '';
  let seedStr = '';
  let runLoopIndex = 0;
  let rng = null;
  let rngStreams = {};
  let godTimer = 0;
  let fade = 0;
  let fading = 0;
  let nextDoor = null;
  let floorTransitionTime = 0;
  let showFloorTransition = false;
  let gameElapsedTime = 0;
  let lastTime = 0;
  let loopStarted = false;
  let laserActive = false;
  let laserTime = 0;
  let laserTick = 0;
  let laserMode = 'beam';
  let laserAngle = 0;
  let laserSweepSpeed = 0;
  let loveBeamCasting = false;
  let turtleWaveHpTimer = 0;
  let dashKeyLatch = false;
  let playerDeathAnim = null;
  let gameMode = 'normal';
  let endlessWave = 0;
  let endlessWaveActive = false;
  let bossRushStage = 0;
  let bossRushActive = false;
  let chosenCharacter = 'thorn_knight';
  let selectedDifficulty = 'easy';
  let selectedChallenges = [];
  let customDifficultySettings = {
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
  };
  let destructibles = [];
  let hazards = [];
  let shopOffers = [];
  let structures = [];
  let decorations = [];
  let environmentBackgroundCache = { key: '', canvas: null };
  let activeRun = null;
  let metaProgress = createDefaultMeta();
  let runHistory = [];
  let lastDamageSource = '';
  let lastDamageSourceKey = '';
  let savePendingTimer = 0;
  let lavaAnimTime = 0;
  let floorSkipPending = 0;
  let teleportKeyLatch = false;
  let shopKeyLatch = false;
  let invKeyLatch = false;
  let anvilKeyLatch = false;
  let activeShopTab = 'items';
  let activeInvTab = 'stats';
  let activeAnvilTab = 'weapons';
  let anvilSelectedItem = null;
  let anvilStagedUpgrades = {};
  let draggingMoveKey = '';
  let weaponBurstQueue = [];
  let rivals = [];
  let activeInventorySlot = '';
  let shopPanelDirty = false;
  let inventoryPanelDirty = false;
  let wizardPawSelection = null;

  // Upgradeable stat schemas for the anvil panel
  const WEAPON_UPGRADEABLE_STATS = {
    damage:    { label: 'Damage',       step: 5,     min: 5,    max: 9999, xpPerStep: 15, format: v => Math.round(v) },
    cooldown:  { label: 'Cooldown (s)', step: -0.05, min: 0.05, max: 9999, xpPerStep: 20, format: v => v.toFixed(2) + 's' },
    range:     { label: 'Range',        step: 10,    min: 10,   max: 9999, xpPerStep: 13, format: v => Math.round(v) },
    knockback: { label: 'Knockback',    step: 30,    min: 0,    max: 9999, xpPerStep: 10, format: v => Math.round(v) },
  };
  const MOVE_UPGRADEABLE_STATS = {
    damage:    { label: 'Damage',       step: 5,    min: 5,   max: 9999, xpPerStep: 15, format: v => Math.round(v) },
    cooldown:  { label: 'Cooldown (s)', step: -0.05,min: 0.05,max: 9999, xpPerStep: 20, format: v => v.toFixed(2) + 's' },
    duration:  { label: 'Duration (s)', step: 0.1,  min: 0.1, max: 30,   xpPerStep: 13, format: v => v.toFixed(1) + 's' },
    range:     { label: 'Range / AOE',  step: 10,   min: 10,  max: 9999, xpPerStep: 13, format: v => Math.round(v) },
    critChance:{ label: 'Crit Chance',  step: 0.05, min: 0,   max: 1.0,  xpPerStep: 25, format: v => Math.round(v * 100) + '%' },
  };

  // Base stat values per weapon (used to compute current upgraded value)
  const WEAPON_BASE_STATS = {
    extending_staff:          { damage: 38,   cooldown: 0.50, range: 130, knockback: 500 },
    hunters_bow:              { damage: 28,   cooldown: 0.40,             knockback: 180 },
    thorns_bleed_blade:       { damage: 32,   cooldown: 0.55, range: 90,  knockback: 120 },
    lazer_glasses:            { damage: 18,   cooldown: 3.60,             knockback: 80  },
    metao_fire_staff:         { damage: 22,   cooldown: 0.55, range: 200, knockback: 100 },
    magenta_degale:           { damage: 80,   cooldown: 1.50,             knockback: 480 },
    magenta_p90:              { damage: 18,   cooldown: 1.80,             knockback: 140 },
    granillia_lightning_spear:{ damage: 45,   cooldown: 0.55,             knockback: 200 },
    excalibur:                { damage: 202,  cooldown: 2.00, range: 120, knockback: 600 },
    golden_fleece:            { damage: 20,   cooldown: 0.50, range: 80,  knockback: 80  },
    void_piercer:             { damage: 55,   cooldown: 0.80,             knockback: 160 },
    aegis_shield_weapon:      { cooldown: 8.00 },
  };

  // Base stat values per move
  const MOVE_BASE_STATS = {
    slash:            { damage: 32,  cooldown: 0.40, range: 90  },
    fire_balls:       { damage: 20,  cooldown: 0.55, range: 180 },
    smite:            { damage: 28,  cooldown: 0.55, range: 110 },
    narwal_fight:     { damage: 36,  cooldown: 0.55, range: 126 },
    blood_beam:       { damage: 14,  cooldown: 3.00, duration: 1.2, critChance: 0 },
    love_beam:        { damage: 16,  cooldown: 3.40, duration: 1.7, critChance: 0 },
    turtle_wave:      { damage: 55,  cooldown: 3.00, duration: 1.35 },
    power_disks:      { damage: 22,  cooldown: 3.00, range: 240 },
    blade_justice:    { damage: 60,  cooldown: 3.80, range: 80  },
    lightning_columns:{ damage: 30,  cooldown: 4.80, range: 180 },
    god_sweep:        { damage: 40,  cooldown: 7.20, range: 320 },
    crimson_smash:    { damage: 55,  cooldown: 4.00, range: 120 },
    kicky_kick:       { damage: 92,  cooldown: 4.20, range: 138 },
    chaos_burst:      { damage: 38,  cooldown: 4.00, range: 100 },
    healing_zone:     { damage: 12,  cooldown: 5.00, duration: 3.0, range: 130 },
    fire_circle:      { damage: 18,  cooldown: 4.50, duration: 3.5, range: 100 },
    floor_lava:       { damage: 12,  cooldown: 5.00, duration: 4.0, range: 160 },
    dash:             { cooldown: 1.20 },
    nimrod_stomp:     { damage: 60,  cooldown: 2.50, range: 110 },
    warp:             { cooldown: 2.80 },
    zip_lightning:    { damage: 30,  cooldown: 2.00 },
    flying_unhitable: { cooldown: 18.00, duration: 15.0 },
    cowards_way:      { cooldown: 6.00, duration: 3.0 },
  };

  const saveStore = createSaveStore();
  window._neoSaveStore = saveStore;

  function createStatusMap() {
    return {
      bleed: { stacks: 0, duration: 0, tick: 0 },
      fire: { stacks: 0, duration: 0, tick: 0 },
      poison: { stacks: 0, duration: 0, tick: 0 },
      dark_drain: { stacks: 0, duration: 0, tick: 0 },
    };
  }

  function ensureStatuses(entity) {
    if (!entity || typeof entity !== 'object') return createStatusMap();
    if (!entity.statuses || typeof entity.statuses !== 'object') entity.statuses = createStatusMap();
    STATUS_KEYS.forEach(key => {
      const state = entity.statuses[key];
      if (!state || typeof state !== 'object') entity.statuses[key] = { stacks: 0, duration: 0, tick: 0 };
      entity.statuses[key].stacks = Number(entity.statuses[key].stacks || 0);
      entity.statuses[key].duration = Number(entity.statuses[key].duration || 0);
      entity.statuses[key].tick = Number(entity.statuses[key].tick || 0);
    });
    return entity.statuses;
  }

  function getStatusState(entity, key) {
    return ensureStatuses(entity)[key];
  }

  function getStatusStacks(entity, key) {
    return Number(getStatusState(entity, key).stacks || 0);
  }

  function clearStatus(entity, key) {
    const state = getStatusState(entity, key);
    state.stacks = 0;
    state.duration = 0;
    state.tick = 0;
  }

  function applyStatus(entity, key, stacks, duration) {
    if (!entity || !STATUS_KEYS.includes(key)) return;
    if (entity[`${key}Immune`]) return;
    const state = getStatusState(entity, key);
    state.stacks = Math.min(6, Math.max(state.stacks, 0) + Math.max(0, Number(stacks || 0)));
    state.duration = Math.max(state.duration, Number(duration || 0));
  }

  const walls = (() => {
    const hw = (ROOM_W - DOOR) / 2;
    const hh = (ROOM_H - DOOR) / 2;
    return [
      { x: 0, y: 0, w: hw, h: WALL },
      { x: ROOM_W - hw, y: 0, w: hw, h: WALL },
      { x: 0, y: ROOM_H - WALL, w: hw, h: WALL },
      { x: ROOM_W - hw, y: ROOM_H - WALL, w: hw, h: WALL },
      { x: 0, y: 0, w: WALL, h: hh },
      { x: 0, y: ROOM_H - hh, w: WALL, h: hh },
      { x: ROOM_W - WALL, y: 0, w: WALL, h: hh },
      { x: ROOM_W - WALL, y: ROOM_H - hh, w: WALL, h: hh },
    ];
  })();

  function createPerfState() {
    let enabled = false;
    try {
      enabled = new URLSearchParams(window.location.search).has('perf');
    } catch {
      enabled = false;
    }
    return {
      enabled,
      overlay: null,
      averages: Object.create(null),
      sections: Object.create(null),
      fps: 0,
      rafMs: 0,
      workMs: 0,
      lastRafTimestamp: 0,
      lastOverlayAt: 0,
      totalFrames: 0,
      slowFrames: 0,
      worstFrameMs: 0,
    };
  }

  function resetPerfStats() {
    perfState.averages = Object.create(null);
    perfState.sections = Object.create(null);
    perfState.fps = 0;
    perfState.rafMs = 0;
    perfState.workMs = 0;
    perfState.lastRafTimestamp = 0;
    perfState.lastOverlayAt = 0;
    perfState.totalFrames = 0;
    perfState.slowFrames = 0;
    perfState.worstFrameMs = 0;
  }

  function setPerfEnabled(enabled) {
    const nextEnabled = !!enabled;
    if (nextEnabled === perfState.enabled) return perfState.enabled;
    perfState.enabled = nextEnabled;
    if (nextEnabled) {
      resetPerfStats();
      ensurePerfOverlay();
      updatePerfOverlay(true);
    } else if (perfState.overlay) {
      perfState.overlay.remove();
      perfState.overlay = null;
    }
    return perfState.enabled;
  }

  function perfStart() {
    return perfState.enabled ? performance.now() : 0;
  }

  function perfEnd(name, startTime) {
    if (!perfState.enabled || !startTime) return;
    const elapsed = performance.now() - startTime;
    perfState.sections[name] = (perfState.sections[name] || 0) + elapsed;
  }

  function perfSample(name, value) {
    const previous = perfState.averages[name];
    perfState.averages[name] = previous === undefined
      ? value
      : previous + (value - previous) * PERF_AVG_WEIGHT;
  }

  function perfBeginFrame(timestamp) {
    if (!perfState.enabled) return 0;
    perfState.sections = Object.create(null);
    if (perfState.lastRafTimestamp) {
      const rafMs = Math.max(0, timestamp - perfState.lastRafTimestamp);
      perfState.rafMs = rafMs;
      if (rafMs > 0) {
        const fps = 1000 / rafMs;
        perfState.fps = perfState.fps ? perfState.fps + (fps - perfState.fps) * PERF_AVG_WEIGHT : fps;
      }
    }
    perfState.lastRafTimestamp = timestamp;
    return performance.now();
  }

  function perfEndFrame(frameStartTime) {
    if (!perfState.enabled || !frameStartTime) return;
    const workMs = performance.now() - frameStartTime;
    perfState.workMs = workMs;
    perfState.totalFrames += 1;
    if (workMs > PERF_BUDGET_60FPS) perfState.slowFrames += 1;
    perfState.worstFrameMs = Math.max(perfState.worstFrameMs, workMs);
    perfSample('frame.work', workMs);
    Object.entries(perfState.sections).forEach(([name, value]) => perfSample(name, value));
    updatePerfOverlay(false);
  }

  function formatPerfMs(value) {
    const n = Number(value || 0);
    return `${n >= 10 ? n.toFixed(1) : n.toFixed(2)}ms`;
  }

  function formatPerfFps(value) {
    const n = Number(value || 0);
    return n > 0 ? n.toFixed(1) : '--';
  }

  function ensurePerfOverlay() {
    if (perfState.overlay) return perfState.overlay;
    const existing = document.getElementById('perfOverlay');
    if (existing) {
      perfState.overlay = existing;
      return existing;
    }
    const overlay = document.createElement('pre');
    overlay.id = 'perfOverlay';
    overlay.className = 'perf-overlay';
    overlay.setAttribute('aria-live', 'off');
    overlay.title = 'Press F3 to hide. Use NeoPerf.snapshot() in the console for raw values.';
    (document.getElementById('wrap') || document.body).appendChild(overlay);
    perfState.overlay = overlay;
    return overlay;
  }

  function getPerfCounts() {
    return {
      state: gameState,
      floor,
      enemies: enemies.length,
      bodies: deadBodies.length,
      projectiles: projectiles.length,
      particles: particles.length,
      pickups: pickups.length,
      hazards: hazards.length,
      destructibles: destructibles.length,
      rooms: rooms.length,
    };
  }

  function getTopPerfSections(limit = 4) {
    const ignored = new Set(['frame.work', 'update', 'draw', 'ui']);
    return Object.entries(perfState.averages)
      .filter(([name, value]) => !ignored.has(name) && Number(value) > 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  function updatePerfOverlay(force) {
    if (!perfState.enabled) return;
    const now = performance.now();
    if (!force && now - perfState.lastOverlayAt < PERF_OVERLAY_INTERVAL) return;
    perfState.lastOverlayAt = now;
    const overlay = ensurePerfOverlay();
    const avg = perfState.averages;
    const counts = getPerfCounts();
    const slowPct = perfState.totalFrames
      ? (perfState.slowFrames / perfState.totalFrames) * 100
      : 0;
    const top = getTopPerfSections()
      .map(([name, value]) => `${name} ${formatPerfMs(value)}`)
      .join(' | ') || 'collecting...';

    overlay.textContent = [
      'NEO PERF  F3 toggles  console: NeoPerf.snapshot()',
      `fps ${formatPerfFps(perfState.fps)} | raf ${formatPerfMs(perfState.rafMs)} | work avg ${formatPerfMs(avg['frame.work'])} last ${formatPerfMs(perfState.workMs)}`,
      `slow>${formatPerfMs(PERF_BUDGET_60FPS)} ${slowPct.toFixed(1)}% | worst ${formatPerfMs(perfState.worstFrameMs)}`,
      `totals  update ${formatPerfMs(avg.update)} | draw ${formatPerfMs(avg.draw)} | ui/dom ${formatPerfMs(avg.ui)}`,
      `update  player ${formatPerfMs(avg['update.player'])} | enemies ${formatPerfMs(avg['update.enemies'])} | projectiles ${formatPerfMs(avg['update.projectiles'])} | world ${formatPerfMs(avg['update.world'])}`,
      `update  pickups ${formatPerfMs(avg['update.pickups'])} | corpses ${formatPerfMs(avg['update.corpses'])} | particles ${formatPerfMs(avg['update.particles'])} | transitions ${formatPerfMs(avg['update.transitions'])}`,
      `draw    room ${formatPerfMs(avg['draw.room'])} | items ${formatPerfMs(avg['draw.items'])} | entities ${formatPerfMs(avg['draw.entities'])} | particles ${formatPerfMs(avg['draw.particles'])}`,
      `draw    minimap ${formatPerfMs(avg['draw.minimap'])} | overlays ${formatPerfMs(avg['draw.overlays'])} | prompts ${formatPerfMs(avg['draw.prompts'])}`,
      `counts  state ${counts.state} | floor ${counts.floor} | enemies ${counts.enemies} | bodies ${counts.bodies} | shots ${counts.projectiles} | fx ${counts.particles} | pickups ${counts.pickups}`,
      `top     ${top}`,
    ].join('\n');
  }

  function installPerfDebugApi() {
    window.NeoPerf = {
      enable() { return setPerfEnabled(true); },
      disable() { return setPerfEnabled(false); },
      toggle() { return setPerfEnabled(!perfState.enabled); },
      reset() { resetPerfStats(); updatePerfOverlay(true); },
      snapshot() {
        return {
          enabled: perfState.enabled,
          fps: perfState.fps,
          rafMs: perfState.rafMs,
          workMs: perfState.workMs,
          slowFrames: perfState.slowFrames,
          totalFrames: perfState.totalFrames,
          worstFrameMs: perfState.worstFrameMs,
          averages: { ...perfState.averages },
          counts: getPerfCounts(),
        };
      },
    };
    if (perfState.enabled) ensurePerfOverlay();
  }

  boot();

  async function boot() {
    installPerfDebugApi();
    if (gameStateManager) gameStateManager.setState(gameState);
    else uiController.setState(gameState);
    uiController.setHudUpdateHook(() => {
      if (gameState !== 'play' || !player) return;
      const hudPerfStart = perfStart();
      updateObjective();
      updateHud();
      perfEnd('ui.hud', hudPerfStart);
    });
    bindInput();
    bindPanelInput();
    drawActionIcons();
    await loadPersistedState();
    updateCharacterSelectionUI();
    refreshMenuState();
    draw();
    hideBootLoading();
  }

  function hideBootLoading() {
    const bootLoading = document.getElementById('bootLoading');
    if (!bootLoading) return;
    bootLoading.classList.add('boot-loading--done');
    setTimeout(() => bootLoading.remove(), 320);
  }

  function ensureItemNotifyStack() {
    let stack = document.getElementById('itemNotifyStack');
    if (stack) return stack;
    stack = document.createElement('div');
    stack.id = 'itemNotifyStack';
    (document.getElementById('wrap') || document.body).appendChild(stack);
    return stack;
  }

  function getRarityNameColor(rarity) {
    return RARITY_NAME_COLORS[String(rarity || '').toLowerCase()] || '#d8e9ff';
  }

  function drawItemToastIcon(canvas, item) {
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const color = item?.color || '#ffffff';
    const iconDef = window.NeoNykeIconDefs?.items?.[item?.key];
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    if (iconDef) {
      const scale = canvas.width / 32;
      ctx2d.fillStyle = 'rgba(0,0,0,0.45)';
      ctx2d.beginPath();
      ctx2d.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
      ctx2d.fill();
      ctx2d.shadowColor = iconDef.accent || color;
      ctx2d.shadowBlur = item?.rarity === 'god' ? 8 * scale : 5 * scale;
      ctx2d.fillStyle = color;
      iconDef.pixels.forEach(([px, py]) => {
        ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
      });
      if (iconDef.accent) {
        ctx2d.shadowBlur = 0;
        ctx2d.fillStyle = iconDef.accent;
        (iconDef.accentPixels || []).forEach(([px, py]) => {
          ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
        });
      }
      ctx2d.shadowBlur = 0;
      return;
    }
    const symbolByRarity = {
      god: '✦',
      purple: '◆',
      wizard: '✹',
      knight: '⚔',
      white: '●',
    };
    const symbol = symbolByRarity[item?.rarity] || '●';
    ctx2d.fillStyle = color;
    ctx2d.shadowColor = color;
    ctx2d.shadowBlur = item?.rarity === 'god' ? 8 : 5;
    ctx2d.beginPath();
    ctx2d.arc(15, 15, 12, 0, Math.PI * 2);
    ctx2d.fill();
    if (item?.accent) {
      ctx2d.shadowBlur = 0;
      ctx2d.strokeStyle = item.accent;
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.arc(15, 15, 14, 0, Math.PI * 2);
      ctx2d.stroke();
    }
    ctx2d.shadowBlur = 0;
    ctx2d.fillStyle = '#071018';
    ctx2d.font = 'bold 12px system-ui';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(symbol, 15, 15.5);
  }

  function pushItemNotification(itemKey, amount = 1, note = '') {
    const item = itemRegistry.get(itemKey) || ITEM_DEFS[itemKey];
    if (!item || amount <= 0) return;

    const stack = ensureItemNotifyStack();
    const toast = document.createElement('div');
    toast.className = 'item-toast';
    toast.style.borderColor = item.color || '#9ec6ff';

    const icon = document.createElement('canvas');
    icon.className = 'item-toast-icon';
    icon.width = 30;
    icon.height = 30;
    drawItemToastIcon(icon, item);

    const body = document.createElement('div');
    body.className = 'item-toast-body';

    const title = document.createElement('div');
    title.className = 'item-toast-title';

    const name = document.createElement('span');
    name.textContent = item.name;
    name.style.color = getRarityNameColor(item.rarity || item.category);

    const plus = document.createElement('span');
    plus.className = 'item-toast-amount';
    plus.textContent = `+${amount}`;

    const desc = document.createElement('div');
    desc.className = 'item-toast-desc';
    desc.textContent = note ? `${item.description} ${note}` : item.description;

    title.append(name, plus);
    body.append(title, desc);
    toast.append(icon, body);
    stack.prepend(toast);

    while (stack.children.length > 4) {
      stack.removeChild(stack.lastElementChild);
    }

    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 220);
    }, 2600);
  }

  const ITEM_CINEMATIC_FLAVOR = {
    wizards_paw: 'Choose 2 stats to triple — choose wisely.',
    jesters_dice: 'Skip 3 floors. Chaos blooms in your wake.',
  };

  let cinematicTimer = null;

  function showItemCinematic(itemKey, onDone) {
    const item = itemRegistry.get(itemKey) || ITEM_DEFS[itemKey];
    if (!item) { if (onDone) onDone(); return; }

    const el = document.getElementById('itemCinematic');
    const canvas = document.getElementById('itemCinematicCanvas');
    const nameEl = document.getElementById('itemCinematicName');
    const flavorEl = document.getElementById('itemCinematicFlavor');
    if (!el || !canvas || !nameEl || !flavorEl) { if (onDone) onDone(); return; }

    const color = item.color || '#ffcf80';
    el.style.setProperty('--cinematic-color', color);
    nameEl.textContent = item.name || itemKey;
    flavorEl.textContent = ITEM_CINEMATIC_FLAVOR[itemKey] || item.description || '';

    canvas.width = 64;
    canvas.height = 64;
    drawItemToastIcon(canvas, item);

    el.classList.remove('hidden', 'is-leaving');
    el.setAttribute('aria-hidden', 'false');

    if (cinematicTimer) clearTimeout(cinematicTimer);
    cinematicTimer = setTimeout(() => {
      el.classList.add('is-leaving');
      cinematicTimer = setTimeout(() => {
        el.classList.add('hidden');
        el.classList.remove('is-leaving');
        el.setAttribute('aria-hidden', 'true');
        cinematicTimer = null;
        if (onDone) onDone();
      }, 260);
    }, 1400);
  }

  function drawMoveToastIcon(canvas, moveDef) {
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const slotColor = {
      melee: '#ff9a6b',
      laser: '#78d7ff',
      smash: '#c08cff',
      dash: '#79f7bf',
    };
    const color = slotColor[moveDef?.slot] || '#9ec6ff';
    const iconDef = window.NeoNykeIconDefs?.moves?.[moveDef?.key];
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    if (iconDef) {
      const scale = canvas.width / 32;
      ctx2d.fillStyle = 'rgba(0,0,0,0.45)';
      ctx2d.beginPath();
      ctx2d.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
      ctx2d.fill();
      ctx2d.shadowColor = iconDef.color;
      ctx2d.shadowBlur = 7 * scale;
      ctx2d.fillStyle = iconDef.color;
      iconDef.pixels.forEach(([px, py]) => {
        ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
      });
      ctx2d.shadowBlur = 0;
      return;
    }
    const slotGlyph = {
      melee: '⚔',
      laser: '✦',
      smash: '⬣',
      dash: '➤',
    };
    const glyph = slotGlyph[moveDef?.slot] || '✦';
    ctx2d.fillStyle = color;
    ctx2d.shadowColor = color;
    ctx2d.shadowBlur = 7;
    ctx2d.beginPath();
    ctx2d.arc(15, 15, 12, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.shadowBlur = 0;
    ctx2d.fillStyle = '#071018';
    ctx2d.font = 'bold 12px system-ui';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(glyph, 15, 15.5);
  }

  function drawWeaponToastIcon(canvas, weaponDef) {
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const color = weaponDef?.color || '#ffffff';
    const iconDef = window.NeoNykeIconDefs?.weapons?.[weaponDef?.key];
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    if (iconDef) {
      const scale = canvas.width / 32;
      ctx2d.fillStyle = 'rgba(0,0,0,0.45)';
      ctx2d.beginPath();
      ctx2d.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
      ctx2d.fill();
      ctx2d.shadowColor = color;
      ctx2d.shadowBlur = 7 * scale;
      ctx2d.fillStyle = color;
      iconDef.pixels.forEach(([px, py]) => {
        ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
      });
      ctx2d.shadowBlur = 0;
      return;
    }
    ctx2d.fillStyle = color;
    ctx2d.shadowColor = color;
    ctx2d.shadowBlur = 6;
    ctx2d.beginPath();
    ctx2d.arc(15, 15, 12, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.shadowBlur = 0;
    ctx2d.fillStyle = '#071018';
    ctx2d.font = 'bold 11px system-ui';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText('⚔', 15, 15.5);
  }

  function drawHealToastIcon(canvas, healId) {
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const iconDef = window.NeoNykeIconDefs?.heals?.[healId];
    const color = iconDef?.color || '#50e880';
    const scale = canvas.width / 32;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.fillStyle = 'rgba(0,0,0,0.45)';
    ctx2d.beginPath();
    ctx2d.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
    ctx2d.fill();
    if (iconDef) {
      ctx2d.shadowColor = color;
      ctx2d.shadowBlur = 7 * scale;
      ctx2d.fillStyle = color;
      iconDef.pixels.forEach(([px, py]) => {
        ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
      });
      ctx2d.shadowBlur = 0;
      return;
    }
    ctx2d.fillStyle = color;
    ctx2d.shadowColor = color;
    ctx2d.shadowBlur = 6;
    ctx2d.beginPath();
    ctx2d.arc(15, 15, 12, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.shadowBlur = 0;
    ctx2d.fillStyle = '#071018';
    ctx2d.font = 'bold 12px system-ui';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText('+', 15, 15.5);
  }

  function pushMoveNotification(moveKey, amount = 1) {
    const moveDef = MOVE_DEFS[moveKey];
    if (!moveDef || amount <= 0) return;

    const slotColor = {
      melee: '#ff9a6b',
      laser: '#78d7ff',
      smash: '#c08cff',
      dash: '#79f7bf',
    };
    const color = slotColor[moveDef.slot] || '#9ec6ff';

    const stack = ensureItemNotifyStack();
    const toast = document.createElement('div');
    toast.className = 'item-toast';
    toast.style.borderColor = color;

    const icon = document.createElement('canvas');
    icon.className = 'item-toast-icon';
    icon.width = 30;
    icon.height = 30;
    drawMoveToastIcon(icon, moveDef);

    const body = document.createElement('div');
    body.className = 'item-toast-body';

    const title = document.createElement('div');
    title.className = 'item-toast-title';

    const name = document.createElement('span');
    name.textContent = `Move: ${moveDef.name}`;
    name.style.color = color;

    const plus = document.createElement('span');
    plus.className = 'item-toast-amount';
    plus.textContent = `+${amount}`;

    const desc = document.createElement('div');
    desc.className = 'item-toast-desc';
    desc.textContent = moveDef.desc || 'New move unlocked.';

    title.append(name, plus);
    body.append(title, desc);
    toast.append(icon, body);
    stack.prepend(toast);

    while (stack.children.length > 4) {
      stack.removeChild(stack.lastElementChild);
    }

    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 220);
    }, 2600);
  }

  function pushWeaponNotification(weaponKey) {
    const def = WEAPON_DEFS[weaponKey];
    if (!def) return;
    const rarityColor = {
      knight: '#e8f0ff',
      wizard: '#c08cff',
      god: '#ff7070',
      white: '#e8f0ff',
      purple: '#c08cff',
      red: '#ff7070',
    };
    const color = def.color || rarityColor[def.rarity] || '#d9e8ff';
    const stack = ensureItemNotifyStack();
    const toast = document.createElement('div');
    toast.className = 'item-toast';
    toast.style.borderColor = color;
    const icon = document.createElement('canvas');
    icon.className = 'item-toast-icon';
    icon.width = 30;
    icon.height = 30;
    drawWeaponToastIcon(icon, def);
    const body = document.createElement('div');
    body.className = 'item-toast-body';
    const title = document.createElement('div');
    title.className = 'item-toast-title';
    const name = document.createElement('span');
    name.textContent = `Weapon: ${def.name}`;
    name.style.color = getRarityNameColor(def.rarity);
    const plus = document.createElement('span');
    plus.className = 'item-toast-amount';
    plus.textContent = '+1';
    const desc = document.createElement('div');
    desc.className = 'item-toast-desc';
    desc.textContent = def.description || 'New weapon acquired.';
    title.append(name, plus);
    body.append(title, desc);
    toast.append(icon, body);
    stack.prepend(toast);
    while (stack.children.length > 4) stack.removeChild(stack.lastElementChild);
    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 220);
    }, 2600);
  }

  function bindInput() {
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('mousemove', event => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
      mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
    });
    canvas.addEventListener('mousedown', event => {
      if (event.button === 0) { mouse.down = true; mouse.downQueued = true; }
      if (event.button === 2) { mouse.right = true; mouse.rightQueued = true; }
    });
    window.addEventListener('mouseup', event => {
      if (event.button === 0) mouse.down = false;
      if (event.button === 2) mouse.right = false;
    });
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (event.key === 'F3' || (event.ctrlKey && event.shiftKey && key === 'p')) {
        event.preventDefault();
        setPerfEnabled(!perfState.enabled);
        return;
      }
      if (uiController?.isDialogueOpen?.()) {
        keys[key] = false;
        if (key === 'enter' || key === ' ' || key === 'escape') {
          event.preventDefault();
          uiController.advanceDialogue();
        }
        return;
      }
      keys[key] = true;
      const b = window.NeoSettings?.getBindings();
      const inventoryKey = b ? b.inventory : 'i';
      if (isWizardPawOpen()) {
        if (event.key === 'Escape') event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        if (gameState === 'play') { pauseGame(); return; }
        if (gameState === 'pause') { resumeGame(); return; }
      }
      if (key === 'e' && gameState === 'play') {
        const inShopRoom = currentRoom?.type === 'shop';
        if (inShopRoom && !shopKeyLatch) {
          toggleShopPanel();
          shopKeyLatch = true;
        }
        const inAnvilRoom = currentRoom?.type === 'anvil';
        if (inAnvilRoom && !anvilKeyLatch) {
          toggleAnvilPanel();
          anvilKeyLatch = true;
        }
      }
      if (key === inventoryKey && gameState === 'play' && !invKeyLatch) {
        toggleInventoryPanel();
        invKeyLatch = true;
      }
      if (b && key === b.smash && gameState === 'play') trySmash();
      else if (!b && key === 'r' && gameState === 'play') trySmash();
    });
    window.addEventListener('keyup', event => {
      const key = event.key.toLowerCase();
      if (uiController?.isDialogueOpen?.()) {
        keys[key] = false;
        return;
      }
      keys[key] = false;
      const b = window.NeoSettings?.getBindings();
      const inventoryKey = b ? b.inventory : 'i';
      if (key === 'e') { shopKeyLatch = false; anvilKeyLatch = false; }
      if (key === inventoryKey) invKeyLatch = false;
    });
    uiController.bindMenuActions({
      _getChosenCharacter() { return chosenCharacter; },
      onCharacterSelect(characterKey, button) {
        if (button.classList.contains('locked')) return;
        chosenCharacter = characterKey;
        metaProgress.selectedCharacter = chosenCharacter;
        persistMetaSoon();
        updateCharacterSelectionUI();
      },
      onDifficultySelect(difficultyKey, button) {
        if (button.classList.contains('locked')) return;
        selectedDifficulty = normalizeDifficulty(difficultyKey);
        metaProgress.selectedDifficulty = selectedDifficulty;
        persistMetaSoon();
        updateCharacterSelectionUI();
      },
      onChallengeSelect(challengeKey, button) {
        const def = CHALLENGE_DEFS[challengeKey];
        if (!def || button.classList.contains('locked')) return;
        const owned = getOwnedChallengeSet();
        if (!owned.has(challengeKey)) {
          if ((metaProgress.loopCrystals || 0) < def.cost) {
            particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 30, life: 0.9, text: 'Not enough loop crystals', c: '#ff6f7f' });
            return;
          }
          metaProgress.loopCrystals = Number(metaProgress.loopCrystals || 0) - def.cost;
          metaProgress.unlockedChallenges = normalizeChallengeSelection([...(metaProgress.unlockedChallenges || []), challengeKey]);
          selectedChallenges = normalizeChallengeSelection([...selectedChallenges, challengeKey]);
          persistMetaSoon();
        } else if (selectedChallenges.includes(challengeKey)) {
          selectedChallenges = selectedChallenges.filter(key => key !== challengeKey);
        } else {
          selectedChallenges = normalizeChallengeSelection([...selectedChallenges, challengeKey]);
        }
        metaProgress.selectedChallenges = normalizeChallengeSelection(selectedChallenges);
        persistMetaSoon();
        updateCharacterSelectionUI();
      },
      onAdvanceDialogue() {
        uiController.advanceDialogue();
      },
      onToggleChallenges() {
        uiController.setChallengePanelOpen(ui.challengePanel?.classList.contains('hidden'));
      },
      onToggleLegacy() {
        uiController.setLegacyPanelOpen(ui.legacyPanel?.classList.contains('hidden'));
      },
      onLegacySelect(legacyKey) {
        const def = LEGACY_UPGRADES[legacyKey];
        if (!def) return;
        if (hasLegacy(legacyKey)) return;
        if ((metaProgress.loopCrystals || 0) < def.cost) {
          return;
        }
        metaProgress.loopCrystals = Number(metaProgress.loopCrystals || 0) - def.cost;
        metaProgress.unlockedLegacy = normalizeLegacySelection([...(metaProgress.unlockedLegacy || []), legacyKey]);
        persistMetaSoon();
        updateCharacterSelectionUI();
      },
      onToggleRunHistory() {
        uiController.setRunHistoryOpen(ui.runHistoryPanel?.classList.contains('hidden'));
      },
      onOpenCharacterSelect() { gameMode = 'normal'; setGameState('charselect'); },
      onCloseCharacterSelect() { setGameState('menu'); },
      onOpenAltModeCharSelect(mode) { gameMode = mode; setGameState('charselect'); },
      onStartNew() { void startGame(false); },
      onContinue() { void startGame(true); },
      onDeleteRun() { void deleteSavedRun(); },
      onRerunFromHistory(entryId) {
        const entry = runHistory.find(e => e.id === entryId);
        if (!entry) return;
        chosenCharacter = entry.character || chosenCharacter;
        metaProgress.selectedCharacter = chosenCharacter;
        selectedDifficulty = normalizeDifficulty(entry.difficulty);
        metaProgress.selectedDifficulty = selectedDifficulty;
        persistMetaSoon();
        if (ui.seed) ui.seed.value = entry.seed || '';
        uiController.setRunHistoryOpen(false);
        void startGame(false);
      },
    });
    uiController.bindRestartActions(() => { gameMode = 'normal'; location.reload(); });

    ui.pauseResume.addEventListener('click', resumeGame);
    ui.pauseSettings.addEventListener('click', () => {
      document.getElementById('settingsBtn').click();
    });
    ui.pauseMain.addEventListener('click', () => {
      clearTimeout(savePendingTimer);
      gameMode = 'normal';
      void saveRunNow().then(() => { setGameState('menu'); });
    });
    ui.wizardPawChoices?.addEventListener('click', handleWizardPawChoiceClick);
    ui.wizardPawConfirm?.addEventListener('click', confirmWizardPawSelection);

    window.addEventListener('beforeunload', () => {
      if (gameState === 'play') {
        clearTimeout(savePendingTimer);
        saveRunNow();
      }
    });
  }

  function clearGameplayInput() {
    Object.keys(keys).forEach(key => {
      keys[key] = false;
    });
    mouse.down = false;
    mouse.right = false;
    mouse.downQueued = false;
    mouse.rightQueued = false;
  }

  function bindPanelInput() {
    ui.shopClose?.addEventListener('click', () => setShopPanelOpen(false));
    ui.invClose?.addEventListener('click', () => setInventoryPanelOpen(false));
    ui.anvilClose?.addEventListener('click', () => setAnvilPanelOpen(false));
    ui.anvilCancel?.addEventListener('click', () => { anvilStagedUpgrades = {}; setAnvilPanelOpen(false); });
    ui.anvilConfirm?.addEventListener('click', confirmAnvilUpgrades);
    ui.anvilTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        activeAnvilTab = tab.dataset.anvilTab || 'weapons';
        anvilSelectedItem = null;
        renderAnvilPanel();
      });
    });
    ui.anvilWeaponList?.addEventListener('click', handleAnvilItemSelect);
    ui.anvilMoveList?.addEventListener('click', handleAnvilItemSelect);
    ui.anvilWeaponStats?.addEventListener('click', handleAnvilStatClick);
    ui.anvilMoveStats?.addEventListener('click', handleAnvilStatClick);
    ui.shopTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const nextTab = tab.dataset.tab || 'items';
        activeShopTab = nextTab;
        markShopPanelDirty();
        renderShopPanel();
      });
    });
    ui.invTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        activeInvTab = tab.dataset.invTab || 'stats';
        renderInventoryPanel();
      });
    });
    ui.shopItems?.addEventListener('click', handleShopBuyClick);
    ui.shopWeapons?.addEventListener('click', handleShopBuyClick);
    ui.shopMoves?.addEventListener('click', handleShopBuyClick);
    ui.shopHeals?.addEventListener('click', handleShopBuyClick);
    ui.invMovesList?.addEventListener('click', handleInventoryMoveSelect);
    ui.invWeaponsList?.addEventListener('click', handleInventoryWeaponSelect);
    ui.invMovesList?.addEventListener('dragstart', event => {
      const target = event.target instanceof Element ? event.target : null;
      const moveKey = target?.closest('[data-move]')?.dataset?.move;
      if (!moveKey) return;
      draggingMoveKey = moveKey;
      event.dataTransfer?.setData('text/plain', moveKey);
    });
    ui.invMovesList?.addEventListener('dragover', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
      const moveKey = draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
      const targetMoveKey = target?.dataset?.move || '';
      if (!MOVE_DEFS[moveKey] || !MOVE_DEFS[targetMoveKey]) return;
      if (MOVE_DEFS[moveKey].slot !== MOVE_DEFS[targetMoveKey].slot) return;
      event.preventDefault();
      target?.classList.add('drag-over');
    });
    ui.invMovesList?.addEventListener('dragleave', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
      target?.classList.remove('drag-over');
    });
    ui.invMovesList?.addEventListener('drop', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
      const moveKey = draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
      const targetMoveKey = target?.dataset?.move || '';
      target?.classList.remove('drag-over');
      if (!MOVE_DEFS[moveKey] || !MOVE_DEFS[targetMoveKey]) return;
      if (MOVE_DEFS[moveKey].slot !== MOVE_DEFS[targetMoveKey].slot) return;
      event.preventDefault();
      equipMove(MOVE_DEFS[targetMoveKey].slot, targetMoveKey);
    });
    ui.invMovesList?.addEventListener('dragend', () => {
      draggingMoveKey = '';
      clearInventoryDragState();
    });
    Object.entries(ui.invSlots).forEach(([slot, node]) => {
      if (!node) return;
      node.addEventListener('click', () => {
        activeInventorySlot = activeInventorySlot === slot ? '' : slot;
        markInventoryPanelDirty();
        renderInventoryPanel();
      });
      node.addEventListener('dragstart', event => {
        const moveKey = node.dataset.move || '';
        if (!moveKey) {
          event.preventDefault();
          return;
        }
        draggingMoveKey = moveKey;
        event.dataTransfer?.setData('text/plain', moveKey);
      });
      node.addEventListener('dragend', () => {
        draggingMoveKey = '';
        clearInventoryDragState();
      });
      node.addEventListener('dragover', event => {
        event.preventDefault();
        const moveKey = draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
        if (!MOVE_DEFS[moveKey] || MOVE_DEFS[moveKey].slot !== slot) return;
        node.classList.add('drag-over');
      });
      node.addEventListener('dragleave', () => {
        node.classList.remove('drag-over');
      });
      node.addEventListener('drop', event => {
        event.preventDefault();
        node.classList.remove('drag-over');
        const moveKey = draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
        equipMove(slot, moveKey);
      });
    });
    ui.invWeaponSlot?.addEventListener('click', () => {
      if (player?.equippedWeapon) equipWeapon('');
    });
  }

  function clearInventoryDragState() {
    Object.values(ui.invSlots).forEach(node => node?.classList.remove('drag-over'));
    ui.invMovesList?.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
  }

  function handleInventoryMoveSelect(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
    const moveKey = target?.dataset?.move || '';
    if (!moveKey || !MOVE_DEFS[moveKey]) return;
    activeInventorySlot = MOVE_DEFS[moveKey].slot;
    equipMove(MOVE_DEFS[moveKey].slot, moveKey);
  }

  function isPanelOpen(panel) {
    return !!panel && !panel.classList.contains('hidden');
  }

  function markShopPanelDirty() {
    shopPanelDirty = true;
  }

  function markInventoryPanelDirty() {
    inventoryPanelDirty = true;
  }

  function setShopPanelOpen(open) {
    if (!ui.shopPanel) return;
    ui.shopPanel.classList.toggle('hidden', !open);
    ui.shopPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      markShopPanelDirty();
      renderShopPanel();
    }
  }

  function setInventoryPanelOpen(open) {
    if (!ui.invPanel) return;
    ui.invPanel.classList.toggle('hidden', !open);
    ui.invPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (!open) activeInventorySlot = '';
    if (open) {
      markInventoryPanelDirty();
      renderInventoryPanel();
    }
  }

  function toggleShopPanel() {
    if (currentRoom?.type !== 'shop') return;
    const next = !isPanelOpen(ui.shopPanel);
    setShopPanelOpen(next);
    if (next) setInventoryPanelOpen(false);
  }

  function toggleInventoryPanel() {
    const next = !isPanelOpen(ui.invPanel);
    setInventoryPanelOpen(next);
    if (next) setShopPanelOpen(false);
  }

  // ---- Anvil panel ----

  function setAnvilPanelOpen(open) {
    if (!ui.anvilPanel) return;
    ui.anvilPanel.classList.toggle('hidden', !open);
    ui.anvilPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      anvilStagedUpgrades = {};
      anvilSelectedItem = null;
      renderAnvilPanel();
    }
  }

  function toggleAnvilPanel() {
    if (currentRoom?.type !== 'anvil') return;
    const next = !isPanelOpen(ui.anvilPanel);
    if (!next) anvilStagedUpgrades = {};
    setAnvilPanelOpen(next);
    if (next) { setShopPanelOpen(false); setInventoryPanelOpen(false); }
  }

  function getAnvilStatSchema(itemKey, itemType) {
    const base = itemType === 'weapon' ? WEAPON_BASE_STATS[itemKey] : MOVE_BASE_STATS[itemKey];
    if (!base) return [];
    const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;
    return Object.entries(schema)
      .filter(([statKey]) => statKey in base)
      .map(([statKey, def]) => ({ statKey, ...def, baseValue: base[statKey] }));
  }

  function getAnvilCurrentValue(itemKey, statKey, itemType) {
    const base = itemType === 'weapon' ? WEAPON_BASE_STATS[itemKey] : MOVE_BASE_STATS[itemKey];
    if (!base || !(statKey in base)) return 0;
    const upgrades = player.anvilUpgrades?.[itemType]?.[itemKey]?.[statKey] ?? 0;
    const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;
    return base[statKey] + upgrades * schema[statKey].step;
  }

  function getAnvilStagedValue(itemKey, statKey, itemType) {
    const cur = getAnvilCurrentValue(itemKey, statKey, itemType);
    const staged = anvilStagedUpgrades[`${itemType}:${itemKey}:${statKey}`] ?? 0;
    const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;
    return cur + staged * schema[statKey].step;
  }

  function getAnvilTotalCost() {
    let total = 0;
    for (const [key, count] of Object.entries(anvilStagedUpgrades)) {
      if (count === 0) continue;
      const [itemType, , statKey] = key.split(':');
      const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;
      total += Math.abs(count) * (schema[statKey]?.xpPerStep ?? 0);
    }
    return total;
  }

  function renderAnvilPanel() {
    if (!isPanelOpen(ui.anvilPanel) || !player) return;

    // XP display (current XP, not total)
    if (ui.anvilXp) ui.anvilXp.textContent = player.xp ?? 0;

    // Tab visibility
    const isWeapons = activeAnvilTab === 'weapons';
    ui.anvilWeaponsTab?.classList.toggle('hidden', !isWeapons);
    ui.anvilMovesTab?.classList.toggle('hidden', isWeapons);
    ui.anvilTabs.forEach(t => t.classList.toggle('active', t.dataset.anvilTab === activeAnvilTab));

    if (isWeapons) renderAnvilItemList('weapon');
    else renderAnvilItemList('move');

    renderAnvilStatPanel();
    renderAnvilFooter();
  }

  function renderAnvilItemList(itemType) {
    const listEl = itemType === 'weapon' ? ui.anvilWeaponList : ui.anvilMoveList;
    if (!listEl) return;

    let keys = [];
    if (itemType === 'weapon') {
      keys = Object.keys(player.ownedWeapons || {}).filter(k => WEAPON_BASE_STATS[k] && player.ownedWeapons[k]);
    } else {
      keys = Object.keys(player.ownedMoves || {}).filter(k => MOVE_BASE_STATS[k] && player.ownedMoves[k]);
    }

    if (keys.length === 0) {
      listEl.innerHTML = `<p style="color:#91a8be;font-size:13px;padding:8px">No ${itemType}s owned.</p>`;
      return;
    }

    listEl.innerHTML = keys.map(key => {
      const def = itemType === 'weapon' ? WEAPON_DEFS[key] : MOVE_DEFS[key];
      const name = def?.name || key;
      const color = def?.color || '#9ec6ff';
      const isActive = anvilSelectedItem === `${itemType}:${key}`;
      return `<button class="anvil-item-btn${isActive ? ' is-active' : ''}" data-item="${key}" data-item-type="${itemType}">
        <span class="anvil-item-dot" style="background:${color}"></span>
        <span style="color:${getRarityNameColor(def?.rarity || def?.category)}">${name}</span>
      </button>`;
    }).join('');
  }

  function renderAnvilStatPanel() {
    if (!anvilSelectedItem) {
      if (ui.anvilWeaponStats) ui.anvilWeaponStats.classList.add('hidden');
      if (ui.anvilMoveStats) ui.anvilMoveStats.classList.add('hidden');
      return;
    }
    const [itemType, itemKey] = anvilSelectedItem.split(':');
    const statEl = itemType === 'weapon' ? ui.anvilWeaponStats : ui.anvilMoveStats;
    const otherEl = itemType === 'weapon' ? ui.anvilMoveStats : ui.anvilWeaponStats;
    if (!statEl) return;
    statEl.classList.remove('hidden');
    if (otherEl) otherEl.classList.add('hidden');

    const def = itemType === 'weapon' ? WEAPON_DEFS[itemKey] : MOVE_DEFS[itemKey];
    const stats = getAnvilStatSchema(itemKey, itemType);
    const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;

    const rows = stats.map(({ statKey, label, min, max, xpPerStep, format }) => {
      const cur = getAnvilCurrentValue(itemKey, statKey, itemType);
      const staged = getAnvilStagedValue(itemKey, statKey, itemType);
      const step = schema[statKey].step;
      const stagedCount = anvilStagedUpgrades[`${itemType}:${itemKey}:${statKey}`] ?? 0;

      // next value after pressing +: staged + step
      const nextVal = staged + step;
      const canIncrease = step > 0 ? nextVal <= max : nextVal >= min;
      const canDecrease = stagedCount > 0;

      const stagedDisplay = staged !== cur
        ? `<span class="anvil-stat-staged">&rarr; ${format(staged)}</span>`
        : '';
      const costDisplay = xpPerStep > 0 ? `<span class="anvil-stat-cost">${xpPerStep} XP/step</span>` : '';

      return `<div class="anvil-stat-row">
        <span class="anvil-stat-label">${label}</span>
        <span class="anvil-stat-value">${format(cur)}</span>
        ${stagedDisplay}
        ${costDisplay}
        <div class="anvil-stat-controls">
          <button class="anvil-stat-btn" data-stat="${statKey}" data-item="${itemKey}" data-item-type="${itemType}" data-dir="-1" ${canDecrease ? '' : 'disabled'}>&#8722;</button>
          <button class="anvil-stat-btn" data-stat="${statKey}" data-item="${itemKey}" data-item-type="${itemType}" data-dir="1" ${canIncrease ? '' : 'disabled'}>&#43;</button>
        </div>
      </div>`;
    });

    statEl.innerHTML = `<div class="anvil-stat-title" style="color:${getRarityNameColor(def?.rarity || def?.category)}">${def?.name || itemKey}</div>${rows.join('')}`;
  }

  function renderAnvilFooter() {
    const cost = getAnvilTotalCost();
    const xp = player?.xp ?? 0;
    if (ui.anvilCostSummary) {
      if (cost === 0) {
        ui.anvilCostSummary.textContent = 'Select stats above and press + to stage upgrades.';
      } else {
        ui.anvilCostSummary.textContent = `Total: ${cost} XP  (you have ${xp} XP)`;
        ui.anvilCostSummary.style.color = xp >= cost ? '#7eff9e' : '#ff7c88';
      }
    }
    if (ui.anvilConfirm) {
      ui.anvilConfirm.disabled = cost === 0 || xp < cost;
    }
  }

  function handleAnvilItemSelect(event) {
    const btn = event.target.closest('[data-item]');
    if (!btn) return;
    const itemKey = btn.dataset.item;
    const itemType = btn.dataset.itemType;
    anvilSelectedItem = `${itemType}:${itemKey}`;
    renderAnvilPanel();
  }

  function handleAnvilStatClick(event) {
    const btn = event.target.closest('[data-stat]');
    if (!btn || btn.disabled) return;
    const statKey = btn.dataset.stat;
    const itemKey = btn.dataset.item;
    const itemType = btn.dataset.itemType;
    const dir = Number(btn.dataset.dir);
    const stageKey = `${itemType}:${itemKey}:${statKey}`;
    const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;
    const statDef = schema[statKey];
    if (!statDef) return;

    const currentStaged = anvilStagedUpgrades[stageKey] ?? 0;

    if (dir === 1) {
      // Check cap
      const newVal = getAnvilStagedValue(itemKey, statKey, itemType) + statDef.step;
      const capped = statDef.step > 0 ? newVal > statDef.max : newVal < statDef.min;
      if (capped) return;
      // Check if we could afford one more step
      const nextCost = getAnvilTotalCost() + statDef.xpPerStep;
      if (nextCost > (player?.xp ?? 0)) return;
      anvilStagedUpgrades[stageKey] = currentStaged + 1;
    } else {
      // Remove a staged step (can't undo already-committed upgrades)
      if (currentStaged <= 0) return;
      anvilStagedUpgrades[stageKey] = currentStaged - 1;
    }
    renderAnvilPanel();
  }

  function confirmAnvilUpgrades() {
    const cost = getAnvilTotalCost();
    if (!player || cost === 0 || player.xp < cost) return;

    player.xp -= cost;

    if (!player.anvilUpgrades) player.anvilUpgrades = { weapon: {}, move: {} };

    for (const [key, count] of Object.entries(anvilStagedUpgrades)) {
      if (count === 0) continue;
      const [itemType, itemKey, statKey] = key.split(':');
      if (!player.anvilUpgrades[itemType]) player.anvilUpgrades[itemType] = {};
      if (!player.anvilUpgrades[itemType][itemKey]) player.anvilUpgrades[itemType][itemKey] = {};
      player.anvilUpgrades[itemType][itemKey][statKey] =
        (player.anvilUpgrades[itemType][itemKey][statKey] ?? 0) + count;
    }

    anvilStagedUpgrades = {};
    markInventoryPanelDirty();
    scheduleRunSave();
    particles.push({ x: player.x, y: player.y - 26, life: 1.0, text: 'UPGRADED!', c: '#ffb840' });
    renderAnvilPanel();
    updateHud();
  }

  // Returns the anvil bonus for a given weapon stat (additive delta)
  function getAnvilWeaponBonus(weaponKey, statKey) {
    const upgrades = player?.anvilUpgrades?.weapon?.[weaponKey]?.[statKey] ?? 0;
    if (upgrades === 0) return 0;
    return upgrades * (WEAPON_UPGRADEABLE_STATS[statKey]?.step ?? 0);
  }

  // Returns the anvil bonus for a given move stat
  function getAnvilMoveBonus(moveKey, statKey) {
    const upgrades = player?.anvilUpgrades?.move?.[moveKey]?.[statKey] ?? 0;
    if (upgrades === 0) return 0;
    return upgrades * (MOVE_UPGRADEABLE_STATS[statKey]?.step ?? 0);
  }

  function isWizardPawOpen() {
    return !!wizardPawSelection && isPanelOpen(ui.wizardPawModal);
  }

  function setWizardPawModalOpen(open) {
    if (!ui.wizardPawModal) return;
    ui.wizardPawModal.classList.toggle('hidden', !open);
    ui.wizardPawModal.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function isOverlayBlockingInput() {
    return isPanelOpen(ui.shopPanel) || isPanelOpen(ui.invPanel) || isPanelOpen(ui.anvilPanel) || isWizardPawOpen();
  }

  function isGodSweepUnlocked() {
    return Number(metaProgress.godsKilled || 0) > 0 && Number(metaProgress.loopCrystals || 0) >= 5;
  }

  function getShopMoveOffers() {
    if (!currentRoom || currentRoom.type !== 'shop') return [];
    if (!Array.isArray(currentRoom.shopMoveOffers) || currentRoom.shopMoveOffers.length === 0) {
      const seen = new Set(Object.keys(player?.ownedMoves || {}));
      const allowedCharacter = player?.character || chosenCharacter;
      const pool = SHOP_MOVE_POOL.filter(key => key !== 'god_sweep' && !seen.has(key) && isMoveAllowedForCharacter(key, allowedCharacter));
      const shuffledPool = shuffle(pool, 'loot');
      const offers = shuffledPool.slice(0, 4).map((moveKey, index) => ({
        type: 'move',
        key: moveKey,
        bought: false,
        cost: getShopMoveCost(index),
      }));
      if (isGodSweepUnlocked() && !seen.has('god_sweep') && nextRandom('loot') < 0.12) {
        const insertIndex = Math.min(offers.length, irand(0, Math.min(offers.length, 3), 'loot'));
        offers.splice(insertIndex, 0, {
          type: 'move',
          key: 'god_sweep',
          bought: false,
          cost: getShopGodSweepCost(),
        });
      }
      currentRoom.shopMoveOffers = offers.slice(0, 4);
    } else {
      const allowedCharacter = player?.character || chosenCharacter;
      currentRoom.shopMoveOffers = currentRoom.shopMoveOffers.filter(offer => offer.type !== 'move' || isMoveAllowedForCharacter(offer.key, allowedCharacter));
    }
    refreshRoomShopCosts(currentRoom);
    return currentRoom.shopMoveOffers;
  }

  function getShopWeaponOffers() {
    if (!currentRoom || currentRoom.type !== 'shop') return [];
    if (!Array.isArray(currentRoom.shopWeaponOffers) || currentRoom.shopWeaponOffers.length === 0) {
      const owned = new Set(Object.keys(player?.ownedWeapons || {}).filter(key => player?.ownedWeapons?.[key]));
      const pool = [];
      if (floor >= 1) pool.push(...WHITE_WEAPON_POOL);
      if (floor >= 4) pool.push(...PURPLE_WEAPON_POOL);
      if (floor >= 7) pool.push(...RED_WEAPON_POOL);
      const filtered = pool.filter(key => !owned.has(key));
      const shuffledFiltered = shuffle(filtered, 'loot');
      const offers = shuffledFiltered.slice(0, 3).map((weaponKey, index) => ({
        type: 'weapon',
        key: weaponKey,
        bought: false,
        cost: getShopWeaponCost(WEAPON_DEFS[weaponKey]?.rarity || 'knight', index),
      }));
      currentRoom.shopWeaponOffers = offers;
    }
    refreshRoomShopCosts(currentRoom);
    return currentRoom.shopWeaponOffers;
  }

  function renderShopPanel() {
    if (!ui.shopPanel || !player) return;
    refreshRoomShopCosts(currentRoom);
    shopOffers = currentRoom?.shopOffers || shopOffers;
    ui.shopCoins.textContent = String(player.coins);
    const noItemsChallenge = isChallengeActive('no_items');
    ui.shopTabs.forEach(tab => {
      const isActive = tab.dataset.tab === activeShopTab;
      tab.classList.toggle('active', isActive);
    });
    ui.shopItems.classList.toggle('hidden', activeShopTab !== 'items');
    ui.shopWeapons?.classList.toggle('hidden', activeShopTab !== 'weapons');
    ui.shopMoves.classList.toggle('hidden', activeShopTab !== 'moves');
    ui.shopHeals.classList.toggle('hidden', activeShopTab !== 'heals');

    const itemCards = shopOffers
      .filter(offer => !offer.bought && offer.type === 'item')
      .map((offer, index) => {
        const item = itemRegistry.get(offer.key);
        const canAfford = player.coins >= offer.cost;
        const blocked = noItemsChallenge || !canAfford;
        return `<div class="shop-card${blocked ? ' shop-card--unaffordable' : ''}">
          <span class="shop-card__eyebrow">Relic</span>
          <div class="shop-card__title-row">
            <canvas class="shop-card__icon" data-item-icon="${offer.key}" width="30" height="30"></canvas>
            <h4 style="color:${getRarityNameColor(item?.rarity || item?.category)}">${item?.name || 'Item'}</h4>
            <span class="shop-card__price">${offer.cost}</span>
          </div>
          <div class="shop-card__copy">
            <p>${noItemsChallenge ? 'No Items challenge is active. Relic buys are disabled for this run.' : item?.description || 'No details available.'}</p>
          </div>
          <div class="shop-card__footer">
            <button class="shop-buy${!canAfford ? ' shop-buy--unaffordable' : ''}" data-kind="item" data-index="${index}" ${blocked ? 'disabled' : ''}>${noItemsChallenge ? 'Relics Locked' : !canAfford ? 'Too Expensive' : 'Buy Relic'}</button>
          </div>
        </div>`;
      })
      .join('');
    ui.shopItems.innerHTML = itemCards || '<div class="shop-card shop-empty"><p>Every relic here is already yours. Clear the floor or check the move shelf.</p></div>';
    ui.shopItems.querySelectorAll('[data-item-icon]').forEach(canvas => {
      drawItemToastIcon(canvas, itemRegistry.get(canvas.dataset.itemIcon) || ITEM_DEFS[canvas.dataset.itemIcon]);
    });

    const weaponOffers = getShopWeaponOffers();
    const weaponCards = weaponOffers
      .map((offer, index) => {
        const weapon = WEAPON_DEFS[offer.key];
        const owned = !!player.ownedWeapons?.[offer.key];
        const canAfford = player.coins >= offer.cost;
        const disabled = offer.bought || owned || !canAfford;
        return `<div class="shop-card${!canAfford && !owned && !offer.bought ? ' shop-card--unaffordable' : ''}">
          <span class="shop-card__eyebrow">${weapon?.rarity || 'weapon'}</span>
          <div class="shop-card__title-row">
            <canvas class="shop-card__icon" data-weapon-icon="${offer.key}" width="30" height="30"></canvas>
            <h4 style="color:${getRarityNameColor(weapon?.rarity)}">${weapon?.name || offer.key}</h4>
            <span class="shop-card__price">${offer.cost}</span>
          </div>
          <div class="shop-card__copy">
            <p>${weapon?.description || 'No weapon description available.'}</p>
          </div>
          <div class="shop-card__footer">
            <button class="shop-buy${!canAfford && !owned && !offer.bought ? ' shop-buy--unaffordable' : ''}" data-kind="weapon" data-index="${index}" ${disabled ? 'disabled' : ''}>${offer.bought || owned ? 'Owned' : !canAfford ? 'Too Expensive' : 'Buy Weapon'}</button>
          </div>
        </div>`;
      })
      .join('');
    if (ui.shopWeapons) {
      ui.shopWeapons.innerHTML = weaponCards || '<div class="shop-card shop-empty"><p>No weapons in stock right now.</p></div>';
      ui.shopWeapons.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
        drawWeaponToastIcon(canvas, WEAPON_DEFS[canvas.dataset.weaponIcon]);
      });
    }

    const moveOffers = getShopMoveOffers();
    const moveCards = moveOffers
      .map((offer, index) => {
        const def = MOVE_DEFS[offer.key];
        const owned = !!player.ownedMoves?.[offer.key];
        const canAfford = player.coins >= offer.cost;
        const disabled = offer.bought || owned || !canAfford;
        const slotLabel = SLOT_LABELS[def?.slot] || def?.slot || 'move';
        const currentMoveKey = player.equippedMoves?.[def?.slot];
        const currentMoveName = currentMoveKey ? (MOVE_DEFS[currentMoveKey]?.name || currentMoveKey) : null;
        const replacesLine = currentMoveName
          ? `<p class="shop-card__replaces">Replaces: <b>${currentMoveName}</b></p>`
          : `<p class="shop-card__replaces">Goes into: <b>${slotLabel} slot</b> (nothing equipped)</p>`;
        return `<div class="shop-card${!canAfford && !owned && !offer.bought ? ' shop-card--unaffordable' : ''}">
          <span class="shop-card__eyebrow">${slotLabel}</span>
          <div class="shop-card__title-row">
            <canvas class="shop-card__icon" data-move-icon="${offer.key}" width="30" height="30"></canvas>
            <h4>${def?.name || offer.key}</h4>
            <span class="shop-card__price">${offer.cost}</span>
          </div>
          <div class="shop-card__copy">
            <p>${def?.desc || 'No move description available.'}</p>
          </div>
          ${replacesLine}
          <div class="shop-card__footer">
            <button class="shop-buy${!canAfford && !owned && !offer.bought ? ' shop-buy--unaffordable' : ''}" data-kind="move" data-index="${index}" ${disabled ? 'disabled' : ''}>${offer.bought || owned ? 'Owned' : !canAfford ? 'Too Expensive' : 'Buy Move'}</button>
          </div>
        </div>`;
      })
      .join('');
    ui.shopMoves.innerHTML = moveCards || '<div class="shop-card shop-empty"><p>No new techniques are on the rack right now.</p></div>';
    ui.shopMoves.querySelectorAll('[data-move-icon]').forEach(canvas => {
      drawMoveToastIcon(canvas, MOVE_DEFS[canvas.dataset.moveIcon]);
    });

    const heals = [
      { id: 'small', name: 'Minor Heal', heal: 45, cost: getShopHealCost('small') },
      { id: 'major', name: 'Major Heal', heal: 100, cost: getShopHealCost('major') },
    ];
    const healCards = heals
      .map(heal => {
        const canAfford = player.coins >= heal.cost;
        return `<div class="shop-card${!canAfford ? ' shop-card--unaffordable' : ''}">
        <span class="shop-card__eyebrow">Recovery</span>
        <div class="shop-card__title-row">
          <canvas class="shop-card__icon" data-heal-icon="${heal.id}" width="30" height="30"></canvas>
          <h4>${heal.name}</h4>
          <span class="shop-card__price">${heal.cost}</span>
        </div>
        <div class="shop-card__copy">
          <p>Restore ${heal.heal} HP and stabilize before the next encounter.</p>
        </div>
        <div class="shop-card__footer">
          <button class="shop-buy${!canAfford ? ' shop-buy--unaffordable' : ''}" data-kind="heal" data-heal="${heal.heal}" data-cost="${heal.cost}" ${!canAfford ? 'disabled' : ''}>${!canAfford ? 'Too Expensive' : 'Buy Heal'}</button>
        </div>
      </div>`;
      })
      .join('');
    ui.shopHeals.innerHTML = healCards;
    ui.shopHeals.querySelectorAll('[data-heal-icon]').forEach(canvas => {
      drawHealToastIcon(canvas, canvas.dataset.healIcon);
    });
    shopPanelDirty = false;
  }

  function renderInventoryPanel() {
    if (!ui.invPanel || !player) return;

    ui.invTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.invTab === activeInvTab);
    });
    const tabPanels = { stats: 'invTabStats', items: 'invTabItems', weapons: 'invTabWeapons', equipped: 'invTabEquipped' };
    Object.entries(tabPanels).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', key !== activeInvTab);
    });

    const stats = getItemStats();
    ui.invStats.innerHTML = [
      `<div class="inv-card inv-stat-card"><span class="inv-card__eyebrow">Vital</span><h4>HP</h4><p>${Math.round(player.hp)} / ${Math.round(player.maxHp)}</p></div>`,
      `<div class="inv-card inv-stat-card"><span class="inv-card__eyebrow">Damage</span><h4>Attack Power</h4><p>${player.attackPower}</p></div>`,
      `<div class="inv-card inv-stat-card"><span class="inv-card__eyebrow">Tempo</span><h4>Attack Speed</h4><p>${getAttackSpeedValue().toFixed(2)}</p></div>`,
      `<div class="inv-card inv-stat-card"><span class="inv-card__eyebrow">Edge</span><h4>Crit Chance</h4><p>${Math.round(stats.critChance * 100)}%</p></div>`,
    ].join('');

    ui.invItemsList.innerHTML = ITEM_KEYS
      .filter(key => Number(player.items?.[key] || 0) > 0)
      .map(key => {
        const item = itemRegistry.get(key);
        return `<div class="inv-card">
          <span class="inv-card__eyebrow">Relic</span>
          <div class="inv-card__title-row">
            <canvas class="inv-card__icon" data-item-icon="${key}" width="30" height="30"></canvas>
            <h4 style="color:${getRarityNameColor(item?.rarity || item?.category)}">${item?.name || key}</h4>
            <span class="inv-card__count">x${player.items[key]}</span>
          </div>
          <p>${item?.description || 'No item description available.'}</p>
        </div>`;
      })
      .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No relics yet</h4><p>Your pockets are clear. Loot rooms or buy from the shop to start a build.</p></div>';

    ui.invItemsList.querySelectorAll('[data-item-icon]').forEach(canvas => {
      drawItemToastIcon(canvas, itemRegistry.get(canvas.dataset.itemIcon) || ITEM_DEFS[canvas.dataset.itemIcon]);
    });

    const ownedWeapons = WEAPON_KEYS
      .filter(key => player.ownedWeapons?.[key])
      .sort((a, b) => {
        const order = { knight: 1, white: 1, wizard: 2, purple: 2, god: 3, red: 3 };
        const rarityA = order[WEAPON_DEFS[a]?.rarity] || 99;
        const rarityB = order[WEAPON_DEFS[b]?.rarity] || 99;
        if (rarityA !== rarityB) return rarityA - rarityB;
        return (WEAPON_DEFS[a]?.name || a).localeCompare(WEAPON_DEFS[b]?.name || b);
      });
    if (ui.invWeaponsList) {
      ui.invWeaponsList.innerHTML = ownedWeapons
        .map(key => {
          const def = WEAPON_DEFS[key];
          const equipped = player.equippedWeapon === key;
          return `<button class="inv-move-chip${equipped ? ' is-equipped-weapon' : ''}" data-weapon="${key}" type="button" aria-pressed="${equipped ? 'true' : 'false'}">
            <canvas class="inv-chip__icon" data-weapon-icon="${key}" width="30" height="30"></canvas>
            <div class="inv-move-chip__meta">
              <b style="color:${getRarityNameColor(def?.rarity)}">${def?.name || key}</b>
              <span class="inv-move-chip__slot">${def?.rarity || 'weapon'}</span>
            </div>
            <p>${def?.description || 'No weapon description available.'}</p>
            <span class="inv-move-chip__hint">${equipped ? 'Equipped On Left Click' : 'Click To Equip On Left Click'}</span>
          </button>`;
        })
        .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No weapons owned</h4><p>Buy weapons in the shop to unlock left-click weapon loadouts.</p></div>';
      ui.invWeaponsList.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
        drawWeaponToastIcon(canvas, WEAPON_DEFS[canvas.dataset.weaponIcon]);
      });
    }

    const equippedMoveKeys = new Set(Object.values(player.equippedMoves || {}).filter(Boolean));
    const allOwnedMoves = Object.keys(player.ownedMoves || {})
      .filter(key => player.ownedMoves[key] && MOVE_DEFS[key] && isMoveAllowedForCharacter(key, player.character))
      .sort((a, b) => MOVE_DEFS[a].slot.localeCompare(MOVE_DEFS[b].slot));
    ui.invMovesList.innerHTML = allOwnedMoves
      .map(key => {
        const def = MOVE_DEFS[key];
        const isEquipped = equippedMoveKeys.has(key);
        const isMatch = !isEquipped && activeInventorySlot && activeInventorySlot === def.slot;
        const slotLabel = SLOT_LABELS[def.slot] || def.slot;
        const hintText = isEquipped ? 'Equipped' : (isMatch ? 'Click or drag to equip' : `Drag to ${slotLabel} slot`);
        return `<div class="inv-move-chip${isEquipped ? ' is-equipped-move' : ''}${isMatch ? ' is-match' : ''}" ${isEquipped ? '' : `draggable="true"`} data-move="${key}" data-slot-type="${def.slot}">
          <canvas class="inv-chip__icon" data-move-icon="${key}" width="30" height="30"></canvas>
          <div class="inv-move-chip__meta">
            <b>${def.name}</b>
            <span class="inv-move-chip__slot">${slotLabel}</span>
          </div>
          <p>${def.desc}</p>
          <span class="inv-move-chip__hint">${hintText}</span>
        </div>`;
      })
      .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No moves owned</h4><p>Buy moves from the shop to build your kit.</p></div>';
    ui.invMovesList.querySelectorAll('[data-move-icon]').forEach(canvas => {
      drawMoveToastIcon(canvas, MOVE_DEFS[canvas.dataset.moveIcon]);
    });

    MOVE_SLOTS.forEach(slot => {
      const node = ui.invSlots[slot];
      if (!node) return;
      const moveKey = player.equippedMoves?.[slot];
      const def = MOVE_DEFS[moveKey];
      const isSelected = activeInventorySlot === slot;
      node.dataset.move = moveKey || '';
      node.dataset.slotType = slot;
      node.draggable = !!moveKey;
      node.classList.toggle('is-equipped', !!moveKey);
      node.classList.toggle('is-selected', isSelected);
      const slotLabel = SLOT_LABELS[slot] || slot;
      const slotKey = getSlotKeyLabel(slot);
      node.innerHTML = `<div class="inv-slot__top"><span class="inv-slot__kicker">${slotLabel}</span><div class="inv-slot__top-right">${slotKey ? `<span class="inv-slot__key">${slotKey}</span>` : ''}<span class="inv-slot__status">${isSelected ? 'Selected' : (def ? 'Equipped' : 'Empty')}</span></div></div><div class="inv-slot__move">${def?.name || 'No move equipped'}</div><p class="inv-slot__hint">${isSelected ? 'Matching spare moves are highlighted below. Click one or drag it here to swap.' : def?.desc || 'Click this slot to see moves that can go here.'}</p>`;
    });
    if (ui.invWeaponSlot) {
      const weapon = WEAPON_DEFS[player.equippedWeapon];
      ui.invWeaponSlot.dataset.rarity = weapon?.rarity || '';
      ui.invWeaponSlot.innerHTML = `<div class="inv-slot__top"><span class="inv-slot__kicker">weapon</span><span class="inv-slot__status">${weapon ? 'Equipped Now' : 'No Weapon'}</span></div><div class="inv-slot__move" style="color:${getRarityNameColor(weapon?.rarity)}">${weapon?.name || 'Default Melee Active'}</div><p class="inv-slot__hint">${weapon ? `${weapon.description} Click this slot to unequip and return left click to melee.` : 'Open the Weapons tab and click any owned weapon to equip it to left click.'}</p>`;
    }
    inventoryPanelDirty = false;
  }

  function equipMove(slot, moveKey) {
    if (!player || !MOVE_DEFS[moveKey]) return;
    if (MOVE_DEFS[moveKey].slot !== slot) return;
    if (!isMoveAllowedForCharacter(moveKey, player.character)) return;
    if (!player.ownedMoves?.[moveKey]) return;
    player.equippedMoves[slot] = moveKey;
    cooldowns[slot] = createCooldownEntry(slot, player, cooldowns[slot]);
    markInventoryPanelDirty();
    renderInventoryPanel();
    updateHud();
    scheduleRunSave();
  }

  function equipWeapon(weaponKey) {
    if (!player) return;
    if (!weaponKey) {
      player.equippedWeapon = '';
      player.weaponCooldown = 0;
      player.weaponBeamTime = 0;
      player.weaponBeamTick = 0;
    } else {
      if (!WEAPON_DEFS[weaponKey]) return;
      if (!player.ownedWeapons?.[weaponKey]) return;
      player.equippedWeapon = weaponKey;
      player.weaponCooldown = 0;
      player.weaponBeamTime = 0;
      player.weaponBeamTick = 0;
    }
    markInventoryPanelDirty();
    renderInventoryPanel();
    updateHud();
    scheduleRunSave();
  }

  function handleInventoryWeaponSelect(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-weapon]') : null;
    const weaponKey = target?.dataset?.weapon || '';
    if (!weaponKey || !WEAPON_DEFS[weaponKey]) return;
    equipWeapon(weaponKey);
  }

  function spendCoins(cost) {
    if (player.coins < cost) {
      particles.push({ x: player.x, y: player.y - 24, life: 0.7, text: 'Not enough coins!', c: '#ff4455' });
      return false;
    }
    player.coins -= cost;
    metaProgress.coins = Math.max(0, metaProgress.coins - cost);
    persistMetaSoon();
    return true;
  }

  function handleShopBuyClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('.shop-buy');
    if (!button || !player) return;
    const kind = button.dataset.kind;
    if (kind === 'item') {
      if (isChallengeActive('no_items')) {
        particles.push({ x: player.x, y: player.y - 24, life: 0.8, text: 'No Items challenge', c: '#ff8894' });
        return;
      }
      const offerIndex = Number(button.dataset.index || -1);
      const itemOffers = shopOffers.filter(offer => !offer.bought && offer.type === 'item');
      const offer = itemOffers[offerIndex];
      if (!offer || offer.bought) return;
      if (!spendCoins(offer.cost)) return;
      offer.bought = true;
      collectItem(offer.key);
    } else if (kind === 'move') {
      const offerIndex = Number(button.dataset.index || -1);
      const moveOffers = getShopMoveOffers();
      const offer = moveOffers[offerIndex];
      if (!offer || offer.bought || player.ownedMoves?.[offer.key] || !isMoveAllowedForCharacter(offer.key, player.character)) return;
      if (!spendCoins(offer.cost)) return;
      offer.bought = true;
      player.ownedMoves[offer.key] = true;
      markInventoryPanelDirty();
      pushMoveNotification(offer.key, 1);
    } else if (kind === 'weapon') {
      const offerIndex = Number(button.dataset.index || -1);
      const weaponOffers = getShopWeaponOffers();
      const offer = weaponOffers[offerIndex];
      if (!offer || offer.bought || player.ownedWeapons?.[offer.key]) return;
      if (!spendCoins(offer.cost)) return;
      offer.bought = true;
      player.ownedWeapons[offer.key] = true;
      if (!player.equippedWeapon) equipWeapon(offer.key);
      particles.push({ x: player.x, y: player.y - 24, life: 0.8, text: `${WEAPON_DEFS[offer.key]?.name || 'Weapon'} acquired`, c: WEAPON_DEFS[offer.key]?.color || '#d9e8ff' });
      pushWeaponNotification(offer.key);
      markInventoryPanelDirty();
    } else if (kind === 'heal') {
      const heal = Number(button.dataset.heal || 0);
      const cost = Number(button.dataset.cost || 0);
      if (!heal || !cost) return;
      if (!spendCoins(cost)) return;
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      const gained = player.hp - before;
      if (gained > 0) spawnHealPopup(player.x + rand(-10, 10), player.y - 20, gained);
    }
    markShopPanelDirty();
    markInventoryPanelDirty();
    renderShopPanel();
    renderInventoryPanel();
    scheduleRunSave();
    syncCurrentRoomState();
    updateHud();
  }

  function pauseGame() {
    setGameState('pause');
  }

  function resumeGame() {
    setGameState('play');
  }

  function createDefaultMeta() {
    return {
      coins: 0,
      bestFloor: 1,
      unlockedItems: [],
      unlockedCharacters: ['princess', 'thorn_knight', 'metao'],
      unlockedChallenges: [],
      selectedDifficulty: 'easy',
      selectedChallenges: [],
      selectedCharacter: 'thorn_knight',
      godsKilled: 0,
      loopCrystals: 0,
      unlockedLegacy: [],
    };
  }

  function createDefaultPlayer() {
    const items = {
      neo_knife: 0,
      orb_of_blood: 0,
      hemes_scarf: 0,
      insurance: 0,
      crit_charm: 0,
      attack_servo: 0,
      keen_eye: 0,
      chrono_spring: 0,
      scholar_seal: 0,
      scholar_cap: 0,
      bandaid: 0,
      push_man: 0,
      titan_heart: 0,
      charged_adapter: 0,
      explosive_jelly: 0,
      dragon_orb: 0,
      turtle_shell: 0,
      iron_lung: 0,
      oracles_lens: 0,
      wizards_paw: 0,
      jesters_dice: 0,
      shield_of_aegis: 0,
      pendant_of_kronos: 0,
    };
    const character = CHARACTER_DEFS[chosenCharacter] || CHARACTER_DEFS.thorn_knight;
    const equippedMoves = getDefaultMovesForCharacter(character.key);
    const defaultWeapon = getDefaultWeaponForCharacter(character.key);
    const ownedMoves = {};
    Object.values(equippedMoves).forEach(key => { ownedMoves[key] = true; });
    const maxHp = Math.round(120 * (character.hpMultiplier || 1));
    return {
      character: character.key,
      x: START_X,
      y: START_Y,
      r: 14,
      vx: 0,
      vy: 0,
      hp: maxHp,
      maxHp,
      swing: 0,
      swingA: 0,
      inv: 0,
      dashTime: 0,
      dashX: 0,
      dashY: 0,
      cowardsWayTime: 0,
      coins: 0,
      level: 1,
      kills: 0,
      xp: 0,
      xpToNext: 20,
      attackPower: 0,
      attackSpeed: 1,
      roomDamageTaken: 0,
      insuranceActive: false,
      insuranceChargeKills: 0,
      insuranceReady: true,
      keenEyeChargeKills: 0,
      keenEyeReady: false,
      keenEyeBuffTime: 0,
      chronoSpringChargeKills: 0,
      chronoSpringReady: false,
      chronoSpringBuffTime: 0,
      critCharmBuffTime: 0,
      escapeChargeKills: 0,
      escapeReady: true,
      statuses: createStatusMap(),
      items,
      ownedWeapons: defaultWeapon ? { [defaultWeapon]: true } : {},
      equippedWeapon: defaultWeapon,
      weaponCooldown: 0,
      blockActive: false,
      blockTimer: 0,
      fleeceTick: 0,
      weaponBeamTime: 0,
      weaponBeamTick: 0,
      equippedMoves,
      ownedMoves,
      lavaWalkTime: 0,
      lavaTrailTick: 0,
      princessFlightTime: 0,
      anvilUpgrades: { weapon: {}, move: {} },
    };
  }

  function applyRunChallengeStartModifiers() {
    if (!player) return;
    if (isChallengeActive('fragile_body')) {
      player.maxHp = Math.max(1, Math.round(player.maxHp * 0.7));
      player.hp = Math.min(player.hp, player.maxHp);
    }
  }

  function createItemRegistry() {
    const factory = window.KozEngine?.Items?.itemFactory;
    if (factory?.createLibrary && factory?.createRegistryFromLibrary) {
      class RuntimeItem {
        constructor(spec = {}) {
          Object.assign(this, spec);
        }
      }
      const library = factory.createLibrary(ITEM_DEFS, RuntimeItem);
      return factory.createRegistryFromLibrary(library);
    }
    return {
      get(key) {
        return ITEM_DEFS[key] || null;
      },
      keys() {
        return ITEM_KEYS.slice();
      },
    };
  }

  async function loadPersistedState() {
    uiController.setSaveState('LOADING');
    try {
      const [savedMeta, savedRun, savedRunHistory] = await Promise.all([
        saveStore.get('meta'),
        saveStore.get('run'),
        saveStore.get('runHistory'),
      ]);
      if (savedMeta && typeof savedMeta === 'object') {
        metaProgress = {
          ...createDefaultMeta(),
          ...savedMeta,
          loopCrystals: Number(savedMeta.loopCrystals ?? savedMeta.loopsCompleted ?? 0),
          unlockedItems: normalizeUnlockedItems(savedMeta.unlockedItems || savedMeta.unlockedRelics),
          unlockedCharacters: normalizeUnlockedCharacters(savedMeta.unlockedCharacters),
          unlockedChallenges: normalizeChallengeSelection(savedMeta.unlockedChallenges),
          selectedDifficulty: normalizeDifficulty(savedMeta.selectedDifficulty),
          selectedChallenges: normalizeChallengeSelection(savedMeta.selectedChallenges),
          selectedCharacter: String(savedMeta.selectedCharacter || createDefaultMeta().selectedCharacter),
          unlockedLegacy: normalizeLegacySelection(savedMeta.unlockedLegacy),
        };
      }
      runHistory = normalizeRunHistory(savedRunHistory || savedMeta?.runHistory);
      activeRun = savedRun && typeof savedRun === 'object' ? savedRun : null;
      if (activeRun) {
        activeRun.difficulty = normalizeDifficulty(activeRun.difficulty);
        activeRun.challenges = normalizeChallengeSelection(activeRun.challenges);
      }
      selectedDifficulty = normalizeDifficulty(metaProgress.selectedDifficulty);
      selectedChallenges = normalizeChallengeSelection(metaProgress.selectedChallenges);
      {
        const unlocked = new Set(metaProgress.unlockedCharacters || ['princess', 'thorn_knight', 'metao']);
        if (metaProgress.godsKilled > 0) unlocked.add('granialla');
        const preferredCharacter = String(metaProgress.selectedCharacter || chosenCharacter);
        chosenCharacter = unlocked.has(preferredCharacter) ? preferredCharacter : [...unlocked][0] || 'thorn_knight';
        metaProgress.selectedCharacter = chosenCharacter;
      }
      if (savedMeta && typeof savedMeta.customDifficultySettings === 'object' && savedMeta.customDifficultySettings) {
        customDifficultySettings = { ...customDifficultySettings, ...savedMeta.customDifficultySettings };
      }
      uiController.setSaveState(saveStore.kind);
    } catch (error) {
      console.error('Failed to load save data', error);
      uiController.setSaveState('SAVE ERROR');
      activeRun = null;
    }
  }

  function normalizeUnlockedItems(input) {
    const fallback = [];
    if (!Array.isArray(input)) return fallback;
    const migrated = input.map(value => {
      if (value === 'thorn') return 'neo_knife';
      if (value === 'hemo') return 'orb_of_blood';
      if (value === 'leech') return 'hemes_scarf';
      return value;
    });
    const items = ITEM_KEYS.filter(name => migrated.includes(name));
    return items.length ? items : fallback;
  }

  function normalizeUnlockedCharacters(input) {
    const fallback = ['princess', 'thorn_knight', 'metao'];
    if (!Array.isArray(input)) return fallback;
    const chars = Object.keys(CHARACTER_DEFS).filter(name => input.includes(name));
    return [...new Set([...fallback, ...chars])];
  }

  function normalizeDifficulty(input) {
    if (input === 'custom') return 'custom';
    return DIFFICULTY_DEFS[input] ? input : 'easy';
  }

  function normalizeChallengeSelection(input) {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter(key => CHALLENGE_DEFS[key]))];
  }

  function normalizeLegacySelection(input) {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter(key => LEGACY_UPGRADES[key]))];
  }

  function hasLegacy(key) {
    return (metaProgress.unlockedLegacy || []).includes(key);
  }

  function normalizeRunHistory(input) {
    if (!Array.isArray(input)) return [];
    return input
      .filter(entry => entry && typeof entry === 'object')
      .slice(0, RUN_HISTORY_LIMIT)
      .map(entry => ({
        id: String(entry.id || `${entry.endedAt || 'run'}:${entry.seed || ''}:${entry.floor || 0}`),
        endedAt: String(entry.endedAt || ''),
        result: entry.result === 'win' ? 'win' : 'dead',
        character: String(entry.character || 'thorn_knight'),
        characterName: String(entry.characterName || CHARACTER_DEFS[entry.character]?.name || 'Unknown'),
        difficulty: normalizeDifficulty(entry.difficulty),
        difficultyName: String(entry.difficultyName || getDifficultyDef(entry.difficulty).name),
        floor: Math.max(1, Number(entry.floor || 1)),
        loop: Math.max(0, Number(entry.loop || 0)),
        coins: Math.max(0, Number(entry.coins || 0)),
        level: Math.max(1, Number(entry.level || 1)),
        kills: Math.max(0, Number(entry.kills || 0)),
        maxHp: Math.max(1, Number(entry.maxHp || 120)),
        attackPower: Math.max(0, Number(entry.attackPower || 0)),
        attackSpeed: Math.max(0, Number(entry.attackSpeed || 1)),
        elapsedSeconds: Math.max(0, Number(entry.elapsedSeconds || 0)),
        seed: String(entry.seed || ''),
        roomType: String(entry.roomType || ''),
        killedBy: String(entry.killedBy || ''),
        challengeBonusCrystals: Math.max(0, Number(entry.challengeBonusCrystals || 0)),
        totalItemStacks: Math.max(0, Number(entry.totalItemStacks || 0)),
        challenges: Array.isArray(entry.challenges) ? entry.challenges.map(String) : [],
        items: Array.isArray(entry.items) ? entry.items.map(item => ({
          key: String(item.key || ''),
          name: String(item.name || item.key || 'Unknown'),
          count: Math.max(0, Number(item.count || 0)),
          rarity: String(item.rarity || ITEM_DEFS[item.key]?.rarity || ''),
        })) : [],
        equippedMoves: Array.isArray(entry.equippedMoves) ? entry.equippedMoves.map(move => ({
          slot: String(move.slot || ''),
          key: String(move.key || ''),
          name: String(move.name || move.key || 'Unknown'),
        })) : [],
      }));
  }

  function getOwnedChallengeSet() {
    return new Set(normalizeChallengeSelection(metaProgress.unlockedChallenges || []));
  }

  function getUnlockedChallengeSet() {
    return new Set(CHALLENGE_ORDER);
  }

  function isChallengeActive(key) {
    return selectedChallenges.includes(key);
  }

  function getActiveChallengeCrystalBonusMultiplier() {
    const bonusByKey = {
      no_hit: 0.65,
      no_items: 0.4,
      fragile_body: 0.25,
      swarm_rooms: 0.35,
      elite_hunt: 0.45,
      cursed_shops: 0.3,
      glass_cannon: 0.35,
    };
    const active = normalizeChallengeSelection(selectedChallenges);
    const sum = active.reduce((total, key) => total + (bonusByKey[key] || 0), 0);
    if (hasLegacy('challenge_mastery') && active.length >= 3) {
      return Math.max(sum, 3);
    }
    return sum;
  }

  function createRandomSeed() {
    return `${Math.floor(Math.random() * 1e9)}`;
  }

  function syncSeedState() {
    seedStr = runLoopIndex > 0 ? `${baseSeedStr}:loop:${runLoopIndex}` : baseSeedStr;
  }

  function getFloorSeed() {
    return `${baseSeedStr}|difficulty:${selectedDifficulty}|loop:${runLoopIndex}|floor:${floor}`;
  }

  function createRngStream(seed, consumed = 0) {
    const hashSeed = typeof KozSeededRngApi.fnv1a === 'function'
      ? KozSeededRngApi.fnv1a(String(seed || ''))
      : xmur3(String(seed || ''))();
    const stream = KozSeededRngApi.SeededStream
      ? new KozSeededRngApi.SeededStream(hashSeed)
      : null;
    const random = stream
      ? () => stream.random()
      : makeRNG(String(seed || ''));
    let count = Math.max(0, Number(consumed) || 0);
    for (let index = 0; index < count; index += 1) random();
    return {
      next() {
        count += 1;
        return random();
      },
      getState() {
        return count;
      },
    };
  }

  function resetRngStreams(savedState = null) {
    const snapshot = savedState && typeof savedState === 'object' ? savedState : {};
    const floorSeed = getFloorSeed();
    rngStreams = {
      world: createRngStream(`${floorSeed}|world`, snapshot.world),
      loot: createRngStream(`${floorSeed}|loot`, snapshot.loot),
      encounter: createRngStream(`${floorSeed}|encounter`, snapshot.encounter),
      fx: createRngStream(`${floorSeed}|fx`, snapshot.fx),
    };
    rng = () => nextRandom('encounter');
  }

  function nextRandom(stream = 'encounter') {
    const selected = rngStreams[stream] || rngStreams.encounter || rngStreams.world;
    return selected ? selected.next() : Math.random();
  }

  function getRngState() {
    return {
      world: rngStreams.world?.getState?.() || 0,
      loot: rngStreams.loot?.getState?.() || 0,
      encounter: rngStreams.encounter?.getState?.() || 0,
      fx: rngStreams.fx?.getState?.() || 0,
    };
  }

  function getDifficultyDef(key = selectedDifficulty) {
    const norm = normalizeDifficulty(key);
    if (norm === 'custom') {
      return { ...DIFFICULTY_DEFS.custom, ...customDifficultySettings, key: 'custom', name: 'Custom' };
    }
    return DIFFICULTY_DEFS[norm];
  }

  function getShopPriceMultiplier(difficultyKey = selectedDifficulty) {
    const challengeMultiplier = isChallengeActive('cursed_shops') ? 1.5 : 1;
    return Number(getDifficultyDef(difficultyKey)?.shopPriceMultiplier || 1) * challengeMultiplier;
  }

  function scaleShopPrice(baseCost, difficultyKey = selectedDifficulty) {
    return Math.max(1, Math.round(baseCost * getShopPriceMultiplier(difficultyKey)));
  }

  function getShopRarityPriceMultiplier(rarity = 'knight') {
    return SHOP_RARITY_PRICE_MULTIPLIERS[String(rarity || 'knight').toLowerCase()] || 1;
  }

  function getShopPotionCost(floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(18 + floorValue * 2, difficultyKey);
  }

  function getShopItemCost(itemIndex = 0, floorValue = floor, difficultyKey = selectedDifficulty, rarity = 'knight') {
    const baseCost = 32 + floorValue * 4 + itemIndex * 6;
    return scaleShopPrice(baseCost * getShopRarityPriceMultiplier(rarity), difficultyKey);
  }

  function getShopMoveCost(moveIndex = 0, floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(34 + floorValue * 6 + moveIndex * 4, difficultyKey);
  }

  function getShopWeaponCost(rarity = 'knight', weaponIndex = 0, floorValue = floor, difficultyKey = selectedDifficulty) {
    if (rarity === 'god' || rarity === 'red') return scaleShopPrice(180 + floorValue * 14 + weaponIndex * 10, difficultyKey);
    if (rarity === 'wizard' || rarity === 'purple') return scaleShopPrice(88 + floorValue * 9 + weaponIndex * 8, difficultyKey);
    return scaleShopPrice(52 + floorValue * 5 + weaponIndex * 6, difficultyKey);
  }

  function getShopGodSweepCost(floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(140 + floorValue * 12, difficultyKey);
  }

  function getShopHealCost(kind, floorValue = floor, difficultyKey = selectedDifficulty) {
    if (kind === 'major') return scaleShopPrice(34 + floorValue * 4, difficultyKey);
    return scaleShopPrice(16 + floorValue * 2, difficultyKey);
  }

  function getSecretXpOfferCost(floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(30 + floorValue * 8, difficultyKey);
  }

  function getSecretXpOfferAmount(floorValue = floor) {
    return Math.max(12, Math.round(14 + floorValue * 7));
  }

  function getLaserCastDuration(moveKey = getEquippedMove('laser')) {
    if (moveKey === 'god_sweep') return 1.45;
    if (moveKey === 'love_beam') return Math.max(0.1, MOVE_BASE_STATS.love_beam.duration + getAnvilMoveBonus('love_beam', 'duration'));
    if (moveKey === 'turtle_wave') return Math.max(0.1, MOVE_BASE_STATS.turtle_wave.duration + getAnvilMoveBonus('turtle_wave', 'duration'));
    return godTimer > 0 ? 0.72 : ATTACKS.laser.duration;
  }

  function getMoveCooldownBase(moveKey) {
    const base = MOVE_BASE_STATS[moveKey]?.cooldown ?? null;
    if (base === null) return null;
    return Math.max(0.05, base + getAnvilMoveBonus(moveKey, 'cooldown'));
  }

  function getMeleeCooldownDuration(moveKey = getEquippedMove('melee'), attackSpeed = getAttackSpeedValue()) {
    const anvilBase = getMoveCooldownBase(moveKey);
    if (anvilBase !== null) return anvilBase / attackSpeed;
    if (moveKey === 'slash') return 0.4 / attackSpeed;
    return (godTimer > 0 ? 0.2 : ATTACKS.melee.baseCooldown) / attackSpeed;
  }

  function getLaserCooldownDuration(moveKey = getEquippedMove('laser'), attackSpeed = getAttackSpeedValue()) {
    const anvilBase = getMoveCooldownBase(moveKey);
    if (anvilBase !== null) return anvilBase / attackSpeed;
    if (moveKey === 'turtle_wave') return 3 / attackSpeed;
    if (moveKey === 'blade_justice') return 3.8 / attackSpeed;
    if (moveKey === 'lightning_columns') return 4.8 / attackSpeed;
    if (moveKey === 'god_sweep') return 7.2 / attackSpeed;
    return (godTimer > 0 ? 2.8 : ATTACKS.laser.baseCooldown) / attackSpeed;
  }

  function getDashCooldownDuration(moveKey = getEquippedMove('dash'), attackSpeed = getAttackSpeedValue()) {
    const anvilBase = getMoveCooldownBase(moveKey);
    if (anvilBase !== null) return anvilBase / attackSpeed;
    if (moveKey === 'warp') return 2.8 / attackSpeed;
    if (moveKey === 'nimrod_stomp') return 4.2 / attackSpeed;
    if (moveKey === 'zip_lightning') return 5.4 / attackSpeed;
    if (moveKey === 'cowards_way') return 6 / attackSpeed;
    return 3.2 / attackSpeed;
  }

  function getSmashCooldownDuration(attackSpeed = getAttackSpeedValue()) {
    const smashKey = getEquippedMove('smash');
    const anvilBase = getMoveCooldownBase(smashKey);
    if (anvilBase !== null) return anvilBase / attackSpeed;
    return (godTimer > 0 ? 2 : ATTACKS.smash.baseCooldown) / attackSpeed;
  }

  function getMoveMaxStacks(moveKey, characterKey = player?.character || chosenCharacter) {
    const moveDef = MOVE_DEFS[moveKey] || {};
    const baseStacks = Math.max(1, Number(moveDef.maxStacks || 1));
    const overrideStacks = moveDef.stackOverrides?.[characterKey];
    return Math.max(1, Number(overrideStacks || baseStacks));
  }

  function getSlotCooldownDuration(slot, moveKey, attackSpeed = getAttackSpeedValue()) {
    if (slot === 'melee') return getMeleeCooldownDuration(moveKey, attackSpeed);
    if (slot === 'laser') return getLaserCooldownDuration(moveKey, attackSpeed);
    if (slot === 'smash') return getSmashCooldownDuration(attackSpeed);
    return getDashCooldownDuration(moveKey, attackSpeed);
  }

  function createCooldownEntry(slot, playerState = player, source = null) {
    const moveKey = playerState?.equippedMoves?.[slot] || (slot === 'dash' ? 'dash' : slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : 'crimson_smash');
    const maxCharges = getMoveMaxStacks(moveKey, playerState?.character || chosenCharacter);
    const sourceIsObject = !!source && typeof source === 'object' && !Array.isArray(source);
    const sourceTimers = sourceIsObject && Array.isArray(source.timers)
      ? source.timers.map(value => Number(value)).filter(value => value > 0)
      : [];
    const sourceHolding = sourceIsObject ? Math.max(0, Math.floor(Number(source.holding || 0))) : 0;
    const wasFull = !sourceIsObject || (
      Number(source.charges ?? source.maxCharges ?? 1) >= Number(source.maxCharges ?? 1)
      && sourceTimers.length === 0
      && sourceHolding === 0
      && Number(source.recharge || 0) <= 0
    );

    let charges = maxCharges;
    let timers = [];
    let holding = 0;

    if (typeof source === 'number') {
      const legacyRecharge = Math.max(0, Number(source || 0));
      if (legacyRecharge > 0) {
        charges = Math.max(0, maxCharges - 1);
        timers = [legacyRecharge];
      }
    } else if (sourceIsObject) {
      charges = Math.max(0, Math.min(maxCharges, Math.floor(Number(source.charges ?? maxCharges))));
      holding = Math.min(sourceHolding, Math.max(0, maxCharges - charges));
      timers = sourceTimers.slice(0, Math.max(0, maxCharges - charges - holding));
      if (timers.length === 0 && Number(source.recharge || 0) > 0 && charges < maxCharges) {
        timers.push(Number(source.recharge));
      }
      if (wasFull) {
        charges = maxCharges;
        timers = [];
        holding = 0;
      }
    }

    return { charges, maxCharges, timers, holding };
  }

  function createCooldownState(playerState = player, source = null) {
    const state = {};
    MOVE_SLOTS.forEach(slot => {
      state[slot] = createCooldownEntry(slot, playerState, source?.[slot]);
    });
    return state;
  }

  function spendSkillCharge(slot, rechargeTime, options = {}) {
    const state = cooldowns[slot] || createCooldownEntry(slot);
    if (state.charges <= 0) return false;
    state.charges -= 1;
    if (options.deferTimer) state.holding += 1;
    else state.timers.push(rechargeTime);
    cooldowns[slot] = state;
    updateHud();
    return true;
  }

  function queueHeldSkillRecharge(slot, rechargeTime) {
    const state = cooldowns[slot] || createCooldownEntry(slot);
    if (state.holding > 0) state.holding -= 1;
    state.timers.push(rechargeTime);
    cooldowns[slot] = state;
    updateHud();
  }

  function tickCooldowns(dt) {
    MOVE_SLOTS.forEach(slot => {
      const state = cooldowns[slot] || createCooldownEntry(slot);
      if (!state.timers.length) return;
      const nextTimers = [];
      let restoredCharges = 0;
      state.timers.forEach(timer => {
        const nextTimer = timer - dt;
        if (nextTimer <= 0) restoredCharges += 1;
        else nextTimers.push(nextTimer);
      });
      state.timers = nextTimers;
      state.charges = Math.min(state.maxCharges, state.charges + restoredCharges);
      cooldowns[slot] = state;
    });
  }

  function getSkillCooldownInfo(slot, attackSpeed = getAttackSpeedValue()) {
    const moveKey = getEquippedMove(slot);
    const state = cooldowns[slot] || createCooldownEntry(slot);
    return {
      charges: state.charges,
      maxCharges: state.maxCharges,
      current: state.timers.length ? Math.min(...state.timers) : 0,
      max: getSlotCooldownDuration(slot, moveKey, attackSpeed),
    };
  }

  function refreshRoomShopCosts(room, difficultyKey = selectedDifficulty, floorValue = floor) {
    if (!room || room.type !== 'shop') return;
    room.shopOffers = Array.isArray(room.shopOffers) ? room.shopOffers : [];
    let itemIndex = 0;
    room.shopOffers.forEach(offer => {
      if (!offer) return;
      if (offer.type === 'item') {
        const rarity = itemRegistry.get(offer.key)?.rarity || ITEM_DEFS[offer.key]?.rarity || 'knight';
        offer.cost = getShopItemCost(itemIndex, floorValue, difficultyKey, rarity);
        itemIndex += 1;
      } else if (offer.type === 'potion') {
        offer.cost = getShopPotionCost(floorValue, difficultyKey);
      }
    });

    if (Array.isArray(room.shopMoveOffers)) {
      room.shopMoveOffers.forEach((offer, index) => {
        if (!offer) return;
        offer.cost = offer.key === 'god_sweep'
          ? getShopGodSweepCost(floorValue, difficultyKey)
          : getShopMoveCost(index, floorValue, difficultyKey);
      });
    }
    if (Array.isArray(room.shopWeaponOffers)) {
      room.shopWeaponOffers.forEach((offer, index) => {
        if (!offer) return;
        const rarity = WEAPON_DEFS[offer.key]?.rarity || 'knight';
        offer.cost = getShopWeaponCost(rarity, index, floorValue, difficultyKey);
      });
    }
  }

  function getEnemyDifficultyTuning() {
    const difficulty = getDifficultyDef();
    return {
      reaction: difficulty.enemyReactionMultiplier || 1,
      rangedCadence: difficulty.rangedCadenceMultiplier || 1,
      supportPower: difficulty.supportPowerMultiplier || 1,
    };
  }

  function getUnlockedDifficultySet() {
    const loopCrystals = Number(metaProgress.loopCrystals || 0);
    return new Set(DIFFICULTY_ORDER.filter(key => key === 'custom' || loopCrystals >= DIFFICULTY_DEFS[key].unlockLoops));
  }

  function titleCase(value) {
    return String(value || '')
      .split(/[_\s]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatElapsedTime(totalSeconds) {
    const seconds = Math.max(0, Math.round(Number(totalSeconds || 0)));
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;
    return `${minutes}:${String(remain).padStart(2, '0')}`;
  }

  function formatRunEndedAt(isoString) {
    const value = new Date(isoString);
    if (Number.isNaN(value.getTime())) return 'Unknown date';
    return value.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function getBossDisplayName(type) {
    if (type === 'queen_cult') return 'Queen of the Cult';
    if (type === 'bulk_golem') return 'Bulk Golem';
    if (type === 'artificer_knave') return 'Artificer Charged Knave';
    if (type === 'god') return 'GOD';
    return titleCase(type);
  }

  function getEnemyLabel(type) {
    if (BOSS_TYPES.has(type)) return getBossDisplayName(type);
    if (type === 'mirror_knight') return 'Mirror Champion';
    return titleCase(type);
  }

  function getEliteEnemyLabel(enemy) {
    const baseLabel = getEnemyLabel(enemy?.type || '');
    if (!enemy?.elite || !Array.isArray(enemy.eliteTypes) || enemy.eliteTypes.length === 0) return baseLabel;
    const prefix = enemy.eliteTypes
      .map(type => ELITE_TYPE_DEFS[type]?.label || titleCase(type))
      .join('_');
    return `${prefix}_${baseLabel}`;
  }

  function getRoomLabel(type) {
    if (!type) return 'Unknown';
    if (type === 'god') return 'God Chamber';
    return titleCase(type);
  }

  function getDamageSourceLabel(source) {
    const value = String(source || '').trim();
    if (!value) return 'Unknown';
    if (value === 'no_hit') return 'Never Get Hit';
    if (value === 'lava') return 'Lava';
    if (value === 'challenge_bomb') return 'Trial Bomb';
    if (value === 'storm') return 'Storm Trial';
    if (value === 'enemy_projectile') return 'Enemy Projectile';
    if (value === 'enemy_beam') return 'Enemy Beam';
    if (value === 'god_beam') return 'GOD Beam';
    if (value === 'mirror_beam') return 'Mirror Beam';
    if (BOSS_TYPES.has(value) || value === 'mirror_knight') return getEnemyLabel(value);
    if (SPRITE_DEFS[value] || ['cult_mage', 'knave', 'sniper', 'machine_gunner', 'golem', 'summoner', 'shield_unit', 'healer', 'boss_spawner', 'laser', 'charger', 'hunter'].includes(value)) {
      return getEnemyLabel(value);
    }
    return titleCase(value);
  }

  function captureRunItemSnapshot(playerState = player) {
    return ITEM_KEYS
      .map(key => ({
        key,
        count: Math.max(0, Number(playerState?.items?.[key] || 0)),
      }))
      .filter(item => item.count > 0)
      .map(item => ({
        ...item,
        name: itemRegistry.get(item.key)?.name || titleCase(item.key),
        rarity: itemRegistry.get(item.key)?.rarity || ITEM_DEFS[item.key]?.rarity || '',
      }));
  }

  function captureRunMoveSnapshot(playerState = player) {
    return MOVE_SLOTS.map(slot => {
      const key = playerState?.equippedMoves?.[slot] || '';
      return {
        slot,
        key,
        name: MOVE_DEFS[key]?.name || titleCase(key),
      };
    }).filter(move => move.key);
  }

  function buildRunHistoryEntry(result, extra = {}) {
    const character = getCharacterDef();
    const difficulty = normalizeDifficulty(selectedDifficulty);
    const historyItems = captureRunItemSnapshot(player);
    const totalItemStacks = historyItems.reduce((sum, item) => sum + item.count, 0);
    return {
      id: `${Date.now()}:${baseSeedStr}:${runLoopIndex}:${floor}:${result}`,
      endedAt: new Date().toISOString(),
      result,
      character: character.key,
      characterName: character.name,
      difficulty,
      difficultyName: getDifficultyDef(difficulty).name,
      floor,
      loop: runLoopIndex,
      coins: Math.max(0, Number(player?.coins || 0)),
      level: Math.max(1, Number(player?.level || 1)),
      kills: Math.max(0, Number(player?.kills || 0)),
      maxHp: Math.max(1, Number(player?.maxHp || 120)),
      attackPower: Math.max(0, Number(player?.attackPower || 0)),
      attackSpeed: Math.max(0, Number(player?.attackSpeed || 1)),
      elapsedSeconds: Math.max(0, Number(gameElapsedTime || 0)),
      seed: baseSeedStr,
      roomType: currentRoom?.type || '',
      killedBy: getDamageSourceLabel(extra.killedBy || ''),
      killerKey: String(extra.killerKey || ''),
      challengeBonusCrystals: Math.max(0, Number(extra.challengeBonusCrystals || 0)),
      challenges: normalizeChallengeSelection(selectedChallenges).map(key => CHALLENGE_DEFS[key]?.name || titleCase(key)),
      items: historyItems,
      equippedMoves: captureRunMoveSnapshot(player),
      totalItemStacks,
    };
  }

  function pushRunHistoryEntry(entry) {
    runHistory = [entry, ...normalizeRunHistory(runHistory)]
      .slice(0, RUN_HISTORY_LIMIT);
  }

  function renderRunHistoryListEntry(entry, selected = false) {
    const cause = entry.result === 'win' ? 'Cleared' : (entry.killedBy || 'Unknown');
    const killerLookup = entry.killerKey || entry.killedBy || '';
    const killerCanvas = entry.result !== 'win' && killerLookup
      ? `<canvas class="rh-row-killer" data-run-killer="${escapeHtml(killerLookup)}" width="28" height="28" aria-hidden="true" title="${escapeHtml(entry.killedBy || '')}"></canvas>`
      : '';
    return `<button class="rh-row${selected ? ' active' : ''}" data-run-id="${escapeHtml(entry.id)}" data-result="${entry.result}" type="button">
      <canvas class="rh-row-portrait" data-run-character="${escapeHtml(entry.character)}" width="40" height="40" aria-hidden="true"></canvas>
      <span class="rh-row-body">
        <span class="rh-row-top">
          <span class="rh-row-name">${escapeHtml(entry.characterName)}</span>
          <span class="rh-row-badge">${entry.result === 'win' ? 'WIN' : 'DEAD'}</span>
        </span>
        <span class="rh-row-sub">Fl.${entry.floor} · ${escapeHtml(cause)} · ${escapeHtml(formatRunEndedAt(entry.endedAt))}</span>
      </span>
      ${killerCanvas}
    </button>`;
  }

  function renderRunHistoryHero(entry) {
    const win = entry.result === 'win';
    const killerLookup = entry.killerKey || entry.killedBy || '';
    const killerSection = !win && killerLookup
      ? `<div class="rh-hero-killer">
           <canvas class="rh-hero-killer-portrait" data-run-killer="${escapeHtml(killerLookup)}" width="48" height="48" aria-hidden="true"></canvas>
           <div class="rh-hero-killer-info">
             <span class="rh-hero-killer-label">KILLED BY</span>
             <span class="rh-hero-killer-name">${escapeHtml(entry.killedBy || 'Unknown')}</span>
           </div>
         </div>`
      : '';
    return `<div class="rh-hero" data-result="${entry.result}">
      <canvas class="rh-hero-portrait" data-run-character="${escapeHtml(entry.character)}" width="64" height="64" aria-hidden="true"></canvas>
      <div class="rh-hero-info">
        <span class="rh-outcome">${win ? 'VICTORY' : 'DEFEAT'}</span>
        <strong class="rh-hero-name">${escapeHtml(entry.characterName)}</strong>
        <span class="rh-hero-meta">${escapeHtml(entry.difficultyName)} · Floor ${entry.floor} · Loop ${entry.loop}</span>
        <span class="rh-hero-date">${escapeHtml(formatRunEndedAt(entry.endedAt))}</span>
      </div>
      <div class="rh-hero-right">
        ${killerSection}
        <button class="rh-rerun-btn" data-rerun-id="${escapeHtml(entry.id)}" type="button" title="Start a new run with the same seed, character, and difficulty">&#9654; RERUN</button>
      </div>
    </div>`;
  }

  function renderRunHistoryTabContent(entry, tab = 'stats') {
    if (tab === 'items') {
      if (!entry.items.length) return '<p class="rh-empty-inner">No relics collected.</p>';
      return `<div class="rh-items-grid">${entry.items.map(i => `<div class="rh-item-tile"><canvas class="rh-item-icon" data-item-icon="${escapeHtml(i.key)}" width="32" height="32" aria-hidden="true"></canvas><span class="rh-item-name" style="color:${getRarityNameColor(i.rarity)}">${escapeHtml(i.name)}</span>${i.count > 1 ? `<span class="rh-item-count">×${i.count}</span>` : ''}</div>`).join('')}</div>`;
    }
    if (tab === 'moves') {
      if (!entry.equippedMoves.length) return '<p class="rh-empty-inner">No move data recorded.</p>';
      return `<div class="rh-moves-grid">${entry.equippedMoves.map(m => `<div class="rh-move-slot" data-slot="${escapeHtml(m.slot)}"><canvas class="rh-move-icon" data-move-icon="${escapeHtml(m.key)}" width="36" height="36" aria-hidden="true"></canvas><div class="rh-move-text"><span class="rh-move-label">${escapeHtml(m.slot.toUpperCase())}</span><span class="rh-move-name">${escapeHtml(m.name)}</span></div></div>`).join('')}</div>`;
    }
    const killerBannerKey = entry.killerKey || entry.killedBy || '';
    const killerBanner = entry.result !== 'win' && entry.killedBy
      ? `<div class="rh-killer-banner">
           ${killerBannerKey ? `<canvas class="rh-killer-banner-portrait" data-run-killer="${escapeHtml(killerBannerKey)}" width="48" height="48" aria-hidden="true"></canvas>` : ''}
           <div class="rh-killer-banner-text">
             <span class="rh-killer-banner-label">KILLED BY</span>
             <span class="rh-killer-banner-name">${escapeHtml(entry.killedBy)}</span>
           </div>
         </div>`
      : '';
    return `${killerBanner}<div class="rh-stats-grid">
      <div class="rh-stat"><span class="rh-stat-label">Floor</span><b class="rh-stat-val">${entry.floor}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Loop</span><b class="rh-stat-val">${entry.loop}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Time</span><b class="rh-stat-val">${escapeHtml(formatElapsedTime(entry.elapsedSeconds))}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Kills</span><b class="rh-stat-val">${entry.kills}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Coins</span><b class="rh-stat-val">${entry.coins}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Level</span><b class="rh-stat-val">${entry.level}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Max HP</span><b class="rh-stat-val">${entry.maxHp}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Atk Power</span><b class="rh-stat-val">${entry.attackPower}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Atk Speed</span><b class="rh-stat-val">${entry.attackSpeed.toFixed(2)}x</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Item Stacks</span><b class="rh-stat-val">${entry.totalItemStacks || 0}</b></div>
      <div class="rh-stat rh-stat--seed"><span class="rh-stat-label">Seed</span><b class="rh-stat-val rh-stat-val--seed">${escapeHtml(entry.seed || '—')}</b></div>
    </div>`;
  }

  const killerSpriteMap = {
    lava: 'golem',
    storm: 'cult_mage',
    challenge_bomb: 'knave',
    enemy_projectile: 'sniper',
    enemy_beam: 'laser',
    god_beam: 'god',
    mirror_beam: 'thorn_knight',
    elite_blade_justice: 'knave',
    no_hit: 'hunter',
    // label string fallbacks for old history entries without killerKey
    'Lava': 'golem',
    'Storm Trial': 'cult_mage',
    'Trial Bomb': 'knave',
    'Enemy Projectile': 'sniper',
    'Enemy Beam': 'laser',
    'GOD Beam': 'god',
    'Mirror Beam': 'thorn_knight',
    'Never Get Hit': 'hunter',
    'Queen of the Cult': 'queen_cult',
    'Bulk Golem': 'bulk_golem',
    'Artificer Charged Knave': 'artificer_knave',
    'GOD': 'god',
    'Mirror Champion': 'thorn_knight',
    'Hunter': 'hunter',
    'Charger': 'charger',
    'Laser': 'laser',
    'Sniper': 'sniper',
    'Machine Gunner': 'sniper',
    'Golem': 'golem',
    'Knave': 'knave',
    'Cult Mage': 'cult_mage',
  };

  function resolveKillerSprite(key) {
    if (!key) return 'hunter';
    if (SPRITE_DEFS[key]) return key;
    if (killerSpriteMap[key]) return killerSpriteMap[key];
    return 'hunter';
  }

  function hydrateRunHistorySprites(root = ui.runHistoryList) {
    if (!(root instanceof Element)) return;
    root.querySelectorAll('[data-run-character]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      drawSpriteToCanvas(el, el.dataset.runCharacter || 'thorn_knight', 56);
    });
    root.querySelectorAll('[data-run-killer]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      drawSpriteToCanvas(el, resolveKillerSprite(el.dataset.runKiller), el.width);
    });
    root.querySelectorAll('[data-item-icon]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      const item = itemRegistry.get(el.dataset.itemIcon) || ITEM_DEFS[el.dataset.itemIcon];
      if (item) drawItemToastIcon(el, item);
    });
    root.querySelectorAll('[data-move-icon]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      const move = MOVE_DEFS[el.dataset.moveIcon];
      if (move) drawMoveToastIcon(el, move);
    });
  }

  function refreshMenuState() {
    uiController.setMenuMeta(metaProgress.coins, metaProgress.bestFloor, metaProgress.loopCrystals || 0, saveStore.kind);
    updateCharacterSelectionUI();
    const summary = activeRun && activeRun.player && activeRun.floor
      ? `Floor ${activeRun.floor} | ${getDifficultyDef(activeRun.difficulty).name}${activeRun.challenges?.length ? ` | ${activeRun.challenges.length} challenge${activeRun.challenges.length === 1 ? '' : 's'}` : ''} | ${activeRun.player.coins || 0} run coins`
      : '';
    uiController.setRunSummary(summary);
    uiController.setRunHistory(runHistory || []);
  }

  function updateCharacterSelectionUI() {
    const unlocked = new Set(metaProgress.unlockedCharacters || ['princess', 'thorn_knight', 'metao']);
    const unlockedDifficulties = getUnlockedDifficultySet();
    const unlockedChallenges = getUnlockedChallengeSet();
    const ownedChallenges = getOwnedChallengeSet();
    if (metaProgress.godsKilled > 0) unlocked.add('granialla');
    const preferredCharacter = String(metaProgress.selectedCharacter || chosenCharacter);
    if (unlocked.has(preferredCharacter)) {
      chosenCharacter = preferredCharacter;
    } else if (!unlocked.has(chosenCharacter)) {
      chosenCharacter = [...unlocked][0] || 'thorn_knight';
    }
    metaProgress.selectedCharacter = chosenCharacter;
    if (!unlockedDifficulties.has(selectedDifficulty)) selectedDifficulty = 'easy';
    metaProgress.selectedDifficulty = selectedDifficulty;
    selectedChallenges = normalizeChallengeSelection(selectedChallenges).filter(key => unlockedChallenges.has(key) && ownedChallenges.has(key));
    metaProgress.selectedChallenges = normalizeChallengeSelection(selectedChallenges);
    const ownedLegacy = new Set(metaProgress.unlockedLegacy || []);
    uiController.updateCharacterSelection(unlocked, chosenCharacter);
    uiController.updateDifficultySelection(unlockedDifficulties, selectedDifficulty, metaProgress.loopCrystals || 0);
    uiController.updateChallengeSelection(unlockedChallenges, ownedChallenges, selectedChallenges, metaProgress.loopCrystals || 0, metaProgress.coins || 0);
    uiController.updateLegacySelection(ownedLegacy, metaProgress.loopCrystals || 0);
    syncCharacterUiTheme();
  }

  function setGameState(nextState) {
    if (gameStateManager) gameStateManager.setState(nextState);
    else {
      gameState = nextState;
      uiController.setState(nextState);
    }
    if (nextState !== 'play') {
      setShopPanelOpen(false);
      setInventoryPanelOpen(false);
    }
  }

  async function startGame(resume) {
    if (gameMode === 'endless') { startEndless(); return; }
    if (gameMode === 'practice') { startPractice(); return; }
    if (gameMode === 'boss_rush') { startBossRush(); return; }
    setGameState('play');

    if (resume && activeRun) {
      restoreRun(activeRun);
    } else {
      baseSeedStr = ui.seed.value.trim() || createRandomSeed();
      selectedDifficulty = normalizeDifficulty(selectedDifficulty);
      selectedChallenges = normalizeChallengeSelection(metaProgress.selectedChallenges);
      runLoopIndex = 0;
      syncSeedState();
      floor = 1;
      gameElapsedTime = 0;
      player = createDefaultPlayer();
      applyRunChallengeStartModifiers();
      lastDamageSource = '';
      lastDamageSourceKey = '';
      resetScene();
      generateFloor();
      persistMetaSoon();
      scheduleRunSave();
    }

    if (!loopStarted) {
      loopStarted = true;
      requestAnimationFrame(loop);
    }
  }

  function startEndlessRoom() {
    rooms = [];
    const room = createRoomRecord({ x: 4, y: 4 }, { type: 'combat', doors: { n: false, s: false, e: false, w: false }, cleared: false });
    decorateRoomData(room);
    rooms.push(room);
    currentRoom = room;
    enterRoom(room);
  }

  function startEndless() {
    setGameState('play');
    baseSeedStr = ui.seed.value.trim() || createRandomSeed();
    selectedDifficulty = normalizeDifficulty(selectedDifficulty);
    selectedChallenges = [];
    runLoopIndex = 0;
    syncSeedState();
    floor = 1;
    gameElapsedTime = 0;
    endlessWave = 0;
    endlessWaveActive = false;
    player = createDefaultPlayer();
    lastDamageSource = '';
    lastDamageSourceKey = '';
    resetScene();
    resetRngStreams();
    startEndlessRoom();
    if (ui.endlessWaveNum) ui.endlessWaveNum.textContent = endlessWave;
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
  }

  function startPractice() {
    setGameState('play');
    baseSeedStr = createRandomSeed();
    selectedDifficulty = 'easy';
    selectedChallenges = [];
    runLoopIndex = 0;
    syncSeedState();
    floor = 5;
    gameElapsedTime = 0;
    player = createDefaultPlayer();
    player.hp = player.maxHp * 999;
    player.maxHp = player.maxHp * 999;
    lastDamageSource = '';
    lastDamageSourceKey = '';
    resetScene();
    resetRngStreams();
    rooms = [];
    const room = createRoomRecord({ x: 4, y: 4 }, { type: 'combat', doors: { n: false, s: false, e: false, w: false }, cleared: true });
    decorateRoomData(room);
    rooms.push(room);
    currentRoom = room;
    player.x = START_X;
    player.y = START_Y;
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
  }

  const BOSS_RUSH_ORDER = ['queen_cult', 'bulk_golem', 'artificer_knave', 'god'];

  function startBossRush() {
    setGameState('play');
    baseSeedStr = createRandomSeed();
    selectedDifficulty = normalizeDifficulty(selectedDifficulty);
    selectedChallenges = [];
    runLoopIndex = 0;
    syncSeedState();
    floor = 5;
    gameElapsedTime = 0;
    bossRushStage = 0;
    bossRushActive = false;
    player = createDefaultPlayer();
    lastDamageSource = '';
    lastDamageSourceKey = '';
    resetScene();
    resetRngStreams();
    rooms = [];
    const room = createRoomRecord({ x: 4, y: 4 }, { type: 'combat', doors: { n: false, s: false, e: false, w: false }, cleared: false });
    decorateRoomData(room);
    rooms.push(room);
    currentRoom = room;
    player.x = START_X;
    player.y = START_Y;
    // Grant 3 random starting items
    for (let i = 0; i < 3; i++) {
      const key = rollItemDrop({ elite: i === 2, stream: 'loot' });
      if (key) collectItem(key);
    }
    addCoins(120);
    if (ui.bossRushStageNum) ui.bossRushStageNum.textContent = 1;
    // Spawn first boss immediately
    spawnBossRushBoss();
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
  }

  function spawnBossRushBoss() {
    const bossType = BOSS_RUSH_ORDER[bossRushStage];
    if (!bossType) return;
    bossRushActive = true;
    currentRoom.cleared = false;
    const safeSpawn = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2 - 40, 15);
    if (!safeSpawn) return;
    const boss = spawnEnemy(bossType, safeSpawn.x, safeSpawn.y, false);
    const line = BOSS_OPENING_DIALOGUE[bossType];
    if (boss && line) sayOverEntity(boss, line);
    if (bossType === 'god') playGodDialogue(1);
    particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 50, life: 1.4, text: `BOSS ${bossRushStage + 1}: ${getBossDisplayName(bossType).toUpperCase()}`, c: '#ff8b8b' });
  }

  function onBossRushBossDefeated() {
    bossRushActive = false;
    bossRushStage += 1;
    if (ui.bossRushStageNum) ui.bossRushStageNum.textContent = Math.min(bossRushStage + 1, 4);
    if (bossRushStage >= BOSS_RUSH_ORDER.length) {
      win();
      return;
    }
    const cx = ROOM_W / 2;
    const cy = ROOM_H / 2;
    dropCoins(cx, cy - 20, 80 + bossRushStage * 30);
    pickups.push({ x: cx - 60, y: cy, type: 'item', key: rollItemDrop({ elite: true, stream: 'loot' }) });
    pickups.push({ x: cx + 60, y: cy, type: 'potion' });
    grantXp(40 + bossRushStage * 20);
    const nextName = getBossDisplayName(BOSS_RUSH_ORDER[bossRushStage]).toUpperCase();
    particles.push({ x: cx, y: cy - 40, life: 1.6, text: 'BOSS DEFEATED!', c: '#78d7ff' });
    setTimeout(() => {
      if (gameMode !== 'boss_rush' || gameState !== 'play') return;
      particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 50, life: 1.2, text: `NEXT: ${nextName}`, c: '#ffb347' });
    }, 1500);
    setTimeout(() => {
      if (gameMode !== 'boss_rush' || gameState !== 'play') return;
      spawnBossRushBoss();
    }, 4000);
  }

  function buildPracticeEnemyGrid() {
    if (!ui.practiceEnemyGrid) return;
    const BOSS_TYPES_SET = new Set(['queen_cult', 'bulk_golem', 'artificer_knave', 'god']);
    const allTypes = [
      'hunter', 'charger', 'laser', 'knave', 'sniper', 'machine_gunner',
      'golem', 'cult_mage', 'cult_follower', 'summoner', 'shield_unit', 'healer', 'boss_spawner',
      'queen_cult', 'bulk_golem', 'artificer_knave', 'god', 'mirror_knight',
    ];
    ui.practiceEnemyGrid.innerHTML = allTypes.map(type => {
      const isBoss = BOSS_TYPES_SET.has(type);
      const label = type.replace(/_/g, ' ');
      return `<button class="practice-spawn-btn${isBoss ? ' is-boss' : ''}" data-enemy="${type}">${label}</button>`;
    }).join('');
    ui.practiceEnemyGrid.addEventListener('click', event => {
      const btn = event.target instanceof Element ? event.target.closest('[data-enemy]') : null;
      if (!btn || !player) return;
      const type = btn.dataset.enemy;
      const elite = ui.practiceEliteToggle?.checked ?? false;
      const angle = Math.random() * Math.PI * 2;
      const dist = 160 + Math.random() * 120;
      const x = clamp(player.x + Math.cos(angle) * dist, 80, ROOM_W - 80);
      const y = clamp(player.y + Math.sin(angle) * dist, 80, ROOM_H - 80);
      spawnEnemy(type, x, y, elite);
    });
  }

  function resetScene() {
    enemies = [];
    deadBodies = [];
    particles = [];
    playerDeathAnim = null;
    endlessWave = 0;
    endlessWaveActive = false;
    bossRushStage = 0;
    bossRushActive = false;
    projectiles = [];
    chests = [];
    pickups = [];
    destructibles = [];
    hazards = [];
    shopOffers = [];
    structures = [];
    decorations = [];
    cooldowns = createCooldownState(player);
    laserActive = false;
    laserTime = 0;
    laserTick = 0;
    laserMode = 'beam';
    laserAngle = 0;
    laserSweepSpeed = 0;
    turtleWaveHpTimer = 0;
    dashKeyLatch = false;
    godTimer = 0;
    camera = { x: 0, y: 0 };
    shake = 0;
    shakeT = 0;
    fade = 0;
    fading = 0;
    nextDoor = null;
    floorSkipPending = 0;
    teleportKeyLatch = false;
    shopKeyLatch = false;
    invKeyLatch = false;
    activeShopTab = 'items';
    draggingMoveKey = '';
    weaponBurstQueue = [];
    rivals = [];
    wizardPawSelection = null;
    setWizardPawModalOpen(false);
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    mouse.down = false;
    mouse.right = false;
    lastDamageSource = '';
    lastDamageSourceKey = '';
  }

  function sanitizePickupList(source) {
    if (!Array.isArray(source)) return [];
    return source.filter(pickup => (
      pickup
      && typeof pickup === 'object'
      && typeof pickup.type === 'string'
      && Number.isFinite(Number(pickup.x))
      && Number.isFinite(Number(pickup.y))
    ));
  }

  function restoreRun(snapshot) {
    baseSeedStr = snapshot.baseSeedStr || snapshot.seedStr || createRandomSeed();
    lastDamageSource = '';
    lastDamageSourceKey = '';
    runLoopIndex = Number(snapshot.runLoopIndex || 0);
    syncSeedState();
    floor = snapshot.floor;
    selectedDifficulty = normalizeDifficulty(snapshot.difficulty);
    selectedChallenges = normalizeChallengeSelection(snapshot.challenges);
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
    resetRngStreams(snapshot.rngState);
    rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms : [];
    currentRoom = rooms.find(room => room.gx === snapshot.currentRoom?.gx && room.gy === snapshot.currentRoom?.gy) || rooms[0] || null;
    player = migratePlayerData(snapshot.player);
    enemies = Array.isArray(snapshot.enemies) ? snapshot.enemies.map(migrateEnemyState) : [];
    deadBodies = Array.isArray(snapshot.deadBodies) ? snapshot.deadBodies : [];
    particles = [];
    projectiles = snapshot.projectiles || [];
    chests = snapshot.chests || [];
    pickups = sanitizePickupList(snapshot.pickups);
    destructibles = snapshot.destructibles || currentRoom?.destructibles || [];
    hazards = snapshot.hazards || currentRoom?.hazards || [];
    shopOffers = snapshot.shopOffers || currentRoom?.shopOffers || [];
    structures = snapshot.structures || currentRoom?.structures || [];
    decorations = snapshot.decorations || currentRoom?.decorations || [];
    if (currentRoom) {
      currentRoom.enemies = Array.isArray(currentRoom.enemies) ? currentRoom.enemies.map(migrateEnemyState) : enemies;
      currentRoom.deadBodies = Array.isArray(currentRoom.deadBodies) ? currentRoom.deadBodies : deadBodies;
      currentRoom.projectiles = Array.isArray(currentRoom.projectiles) ? currentRoom.projectiles : projectiles;
      currentRoom.chests = Array.isArray(currentRoom.chests) ? currentRoom.chests : chests;
      currentRoom.pickups = sanitizePickupList(currentRoom.pickups);
      currentRoom.destructibles = Array.isArray(currentRoom.destructibles) ? currentRoom.destructibles : destructibles;
      currentRoom.hazards = Array.isArray(currentRoom.hazards) ? currentRoom.hazards : hazards;
      currentRoom.shopOffers = Array.isArray(currentRoom.shopOffers) ? currentRoom.shopOffers : shopOffers;
      currentRoom.shopWeaponOffers = Array.isArray(currentRoom.shopWeaponOffers) ? currentRoom.shopWeaponOffers : [];
      currentRoom.structures = Array.isArray(currentRoom.structures) ? currentRoom.structures : structures;
      currentRoom.decorations = Array.isArray(currentRoom.decorations) ? currentRoom.decorations : decorations;
      refreshRoomShopCosts(currentRoom, selectedDifficulty, floor);
      enemies = currentRoom.enemies;
      deadBodies = currentRoom.deadBodies;
      projectiles = currentRoom.projectiles;
      chests = currentRoom.chests;
      pickups = currentRoom.pickups;
      destructibles = currentRoom.destructibles;
      hazards = currentRoom.hazards;
      shopOffers = currentRoom.shopOffers;
      structures = currentRoom.structures;
      decorations = currentRoom.decorations;
    }
    cooldowns = createCooldownState(player, snapshot.cooldowns || {});
    laserActive = !!snapshot.laserActive;
    laserTime = snapshot.laserTime || 0;
    laserTick = snapshot.laserTick || 0;
    laserMode = snapshot.laserMode || 'beam';
    laserAngle = Number(snapshot.laserAngle || 0);
    laserSweepSpeed = Number(snapshot.laserSweepSpeed || 0);
    turtleWaveHpTimer = Number(snapshot.turtleWaveHpTimer || 0);
    godTimer = snapshot.godTimer || 0;
    gameElapsedTime = snapshot.gameElapsedTime || 0;
    camera = snapshot.camera || { x: 0, y: 0 };
    shake = 0;
    shakeT = 0;
    fade = 0;
    fading = 0;
    nextDoor = null;
    floorSkipPending = 0;
    teleportKeyLatch = false;
    dashKeyLatch = false;
    shopKeyLatch = false;
    invKeyLatch = false;
    activeShopTab = 'items';
    draggingMoveKey = '';
    weaponBurstQueue = [];
    rivals = [];
    wizardPawSelection = null;
    setWizardPawModalOpen(false);
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    updateItemUI();
    updateObjective();
    updateHud();
    persistMetaSoon();
  }

  function generateFloor() {
    syncSeedState();
    resetRngStreams();
    rooms = [];

    const grid = Array.from({ length: 9 }, () => Array(9).fill(null));
    const positions = [];
    const start = { x: 4, y: 4 };
    grid[start.y][start.x] = true;
    positions.push(start);

    const target = 8 + Math.floor(nextRandom('world') * 3) + Math.min(2, floor >> 2);
    while (positions.length < target) {
      const seed = positions[irand(0, positions.length - 1, 'world')];
      const dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], 'world');
      let added = false;
      for (const [dx, dy] of dirs) {
        const nx = seed.x + dx;
        const ny = seed.y + dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || grid[ny][nx]) continue;
        grid[ny][nx] = true;
        positions.push({ x: nx, y: ny });
        added = true;
        break;
      }
      if (!added) break;
    }

    const roomMap = new Map();
    positions.forEach(position => {
      const room = createRoomRecord(position);
      rooms.push(room);
      roomMap.set(`${position.x},${position.y}`, room);
    });

    rooms.forEach(room => {
      const north = roomMap.get(`${room.gx},${room.gy - 1}`);
      const south = roomMap.get(`${room.gx},${room.gy + 1}`);
      const east = roomMap.get(`${room.gx + 1},${room.gy}`);
      const west = roomMap.get(`${room.gx - 1},${room.gy}`);
      if (north) { room.doors.n = true; north.doors.s = true; }
      if (south) { room.doors.s = true; south.doors.n = true; }
      if (east) { room.doors.e = true; east.doors.w = true; }
      if (west) { room.doors.w = true; west.doors.e = true; }
    });

    const startRoom = roomMap.get('4,4');
    startRoom.type = 'start';
    startRoom.cleared = true;
    startRoom.explored = true;
    startRoom.visited = true;

    const farRoom = findFarthestRoom(startRoom, roomMap);
    if (floor === MAX_FLOOR) {
      farRoom.type = 'god';
    } else if (floor > MAX_FLOOR) {
      farRoom.type = floor % 3 === 0 ? 'boss' : 'ladder';
    } else if (floor % 3 === 0) {
      farRoom.type = 'boss';
    } else {
      farRoom.type = 'ladder';
    }

    const pool = rooms.filter(room => room !== startRoom && room !== farRoom);
    shuffle(pool, 'world');
    const treasureCount = Math.min(3, 1 + Math.floor(nextRandom('world') * 3));
    for (let index = 0; index < treasureCount; index += 1) {
      if (pool[index]) pool[index].type = 'treasure';
    }
    const shopCandidate = pool.find(room => room.type === 'combat');
    if (shopCandidate && nextRandom('world') < 0.7) shopCandidate.type = 'shop';
    const challengeCandidate = pool.find(room => room.type === 'combat');
    if (challengeCandidate && floor >= 2 && floor < MAX_FLOOR && nextRandom('world') < 0.42) challengeCandidate.type = 'challenge';
    const anvilCandidate = pool.find(room => room.type === 'combat');
    if (anvilCandidate && nextRandom('world') < 0.55) anvilCandidate.type = 'anvil';
    assignSecretRoom(roomMap);
    rooms.forEach(decorateRoomData);

    player.x = START_X;
    player.y = START_Y;
    spawnRivals();
    enterRoom(startRoom);
    updateObjective();
    updateHud();
  }

  function decorateRoomData(room) {
    room.enemies = [];
    room.deadBodies = [];
    room.projectiles = [];
    room.chests = [];
    room.pickups = [];
    room.destructibles = [];
    room.hazards = [];
    room.shopOffers = [];
    room.shopMoveOffers = [];
    room.shopWeaponOffers = [];
    room.structures = [];
    room.decorations = [];
    room.gardenFruitNodes = [];
    if (room.type === 'start') return;

    if (room.type === 'secret') {
      room.cleared = true;
      room.decorations.push(
        { kind: 'banner', x: ROOM_W / 2 - 110, y: ROOM_H / 2 - 92, r: 14 },
        { kind: 'banner', x: ROOM_W / 2 + 110, y: ROOM_H / 2 - 92, r: 14 },
        { kind: 'crack', x: ROOM_W / 2, y: ROOM_H / 2 + 118, r: 32 },
      );
      if (room.secretKind === 'warp') {
        const deltaPool = floor <= 2 ? [1, 2] : floor >= MAX_FLOOR - 1 ? [-2, -1] : [-2, -1, 1, 2];
        const delta = deltaPool[irand(0, deltaPool.length - 1, 'world')];
        room.pickups.push({
          x: ROOM_W / 2,
          y: ROOM_H / 2,
          type: 'secretWarp',
          delta,
          targetFloor: clamp(floor + delta, 1, MAX_FLOOR),
        });
      } else {
        const regularOffers = shuffle(['relic', 'vitality', 'wealth'], 'world');
        const offerPool = shuffle(['xp', regularOffers[0], regularOffers[1]], 'world');
        room.pickups.push(createSecretVendorOffer(offerPool[0], ROOM_W / 2 - 110, ROOM_H / 2 + 26));
        room.pickups.push(createSecretVendorOffer(offerPool[1], ROOM_W / 2, ROOM_H / 2 - 18));
        room.pickups.push(createSecretVendorOffer(offerPool[2], ROOM_W / 2 + 110, ROOM_H / 2 + 26));
      }
      return;
    }

    // Boss and god rooms need an open arena — structures block projectiles and beams
    if (room.type !== 'god' && room.type !== 'boss') {
      decorateRoomStructures(room);
    }

    const potCount = room.type === 'shop' ? 1 : (room.type === 'challenge' || room.type === 'anvil') ? 0 : irand(1, 3, 'world');
    for (let index = 0; index < potCount; index += 1) {
      room.destructibles.push({
        kind: 'pot',
        x: 150 + rand(ROOM_W - 300, 0, 'world'),
        y: 120 + rand(ROOM_H - 240, 0, 'world'),
        r: 12,
        hp: 1,
        broken: false,
      });
    }

    if (nextRandom('world') < 0.45 && room.type !== 'shop' && room.type !== 'challenge' && room.type !== 'anvil') {
      room.destructibles.push({
        kind: 'barrel',
        x: 180 + rand(ROOM_W - 360, 0, 'world'),
        y: 140 + rand(ROOM_H - 280, 0, 'world'),
        r: 14,
        hp: 1,
        broken: false,
      });
    }

    if (nextRandom('world') < 0.4 && room.type !== 'god' && room.type !== 'challenge' && room.type !== 'anvil') {
      const primaryLava = createMoatLavaHazard();
      room.hazards.push(primaryLava);
      if (nextRandom('world') < 0.35) {
        room.hazards.push(createCompanionMoatLava(primaryLava));
      }
    }

    if (nextRandom('world') < 0.3 && room.type !== 'shop' && room.type !== 'god' && room.type !== 'challenge') {
      const wallX = nextRandom('world') < 0.5 ? 76 : ROOM_W - 76;
      const hiddenX = wallX < ROOM_W / 2 ? 48 : ROOM_W - 48;
      room.destructibles.push({
        kind: 'wall',
        x: wallX,
        y: ROOM_H / 2 + rand(120, -120, 'world'),
        r: 26,
        hp: 2,
        broken: false,
      });
      room.destructibles.push({
        kind: 'pot',
        x: hiddenX,
        y: ROOM_H / 2 + rand(140, -140, 'world'),
        r: 12,
        hp: 1,
        broken: false,
        hidden: true,
      });
    }

    Object.entries(room.secretPassages || {}).forEach(([dir, passage]) => {
      const targetRoom = findRoomAt(passage.targetGx, passage.targetGy);
      const wall = createSecretWall(dir, targetRoom);
      if (wall) room.destructibles.push(wall);
    });

    if (room.type === 'shop') {
      room.shopOffers = [
        { type: 'potion', cost: getShopPotionCost(), x: ROOM_W / 2, y: ROOM_H / 2 + 88, bought: false },
      ];
      ensureShopHasMinimumItemOffers(room, 3);
      room.shopMoveOffers = [];
      room.shopWeaponOffers = [];
      room.cleared = true;
    } else if (room.type === 'challenge') {
      room.cleared = false;
      room.challengeStarted = false;
      room.challengeRewardSpawned = false;
      room.challengeFailed = false;
      room.challengeType = rollChallengeTrialType();
      room.challengeTimer = 0;
      room.challengeTick = 0;
      room.challengeData = {};
    } else if (room.type === 'anvil') {
      room.cleared = true;
    }

    decorateGardenRoomData(room);
  }

  function decorateRoomStructures(room) {
    const theme = nextRandom('world');
    if (theme < 0.34) {
      room.structures.push(
        { kind: 'pillar', x: ROOM_W / 2 - 120, y: ROOM_H / 2 - 90, w: 34, h: 34 },
        { kind: 'pillar', x: ROOM_W / 2 + 120, y: ROOM_H / 2 - 90, w: 34, h: 34 },
        { kind: 'pillar', x: ROOM_W / 2 - 120, y: ROOM_H / 2 + 90, w: 34, h: 34 },
        { kind: 'pillar', x: ROOM_W / 2 + 120, y: ROOM_H / 2 + 90, w: 34, h: 34 },
      );
      room.decorations.push(
        { kind: 'rubble', x: ROOM_W / 2, y: ROOM_H / 2 - 130, r: 22 },
        { kind: 'rubble', x: ROOM_W / 2, y: ROOM_H / 2 + 130, r: 22 },
      );
      return;
    }

    if (theme < 0.68) {
      room.structures.push(
        { kind: 'wall', x: ROOM_W / 2 - 140, y: ROOM_H / 2 - 24, w: 92, h: 48 },
        { kind: 'wall', x: ROOM_W / 2 + 140, y: ROOM_H / 2 - 24, w: 92, h: 48 },
      );
      room.decorations.push(
        { kind: 'banner', x: ROOM_W / 2 - 140, y: ROOM_H / 2 - 70, r: 14 },
        { kind: 'banner', x: ROOM_W / 2 + 140, y: ROOM_H / 2 - 70, r: 14 },
        { kind: 'crack', x: ROOM_W / 2, y: ROOM_H / 2 + 80, r: 30 },
      );
      return;
    }

    room.structures.push(
      { kind: 'wall', x: ROOM_W / 2 - 36, y: ROOM_H / 2 - 150, w: 72, h: 88 },
      { kind: 'wall', x: ROOM_W / 2 - 36, y: ROOM_H / 2 + 62, w: 72, h: 88 },
    );
    room.decorations.push(
      { kind: 'brazier', x: ROOM_W / 2 - 90, y: ROOM_H / 2, r: 18 },
      { kind: 'brazier', x: ROOM_W / 2 + 90, y: ROOM_H / 2, r: 18 },
      { kind: 'crack', x: ROOM_W / 2, y: ROOM_H / 2, r: 24 },
    );
  }

  function decorateGardenRoomData(room) {
    if (!room || room.type === 'boss' || room.type === 'god' || floor <= 5) return;
    room.gardenDecorated = true;
    const gardenRoomScore = room.type === 'secret'
      ? 1
      : room.type === 'treasure'
        ? 0.9
        : room.type === 'shop'
          ? 0.75
          : room.type === 'anvil'
            ? 0.72
            : room.type === 'ladder'
              ? 0.66
              : 0.58;
    const treeCount = Math.max(1, Math.round((room.type === 'secret' ? 4 : room.type === 'treasure' ? 3 : 2) * gardenRoomScore));
    for (let index = 0; index < treeCount; index += 1) {
      const side = index % 2 === 0 ? 1 : -1;
      const depth = 84 + nextRandom('world') * 72;
      const x = clamp(ROOM_W / 2 + side * (120 + nextRandom('world') * 180), WALL + 50, ROOM_W - WALL - 50);
      const y = clamp(ROOM_H / 2 + (nextRandom('world') < 0.5 ? -1 : 1) * depth, WALL + 62, ROOM_H - WALL - 62);
      room.decorations.push({
        kind: nextRandom('world') < 0.45 ? 'fruit_tree' : 'tree',
        x,
        y,
        r: 22 + nextRandom('world') * 10,
      });
    }

    const mossCount = Math.max(2, Math.round(5 * gardenRoomScore));
    for (let index = 0; index < mossCount; index += 1) {
      room.decorations.push({
        kind: 'moss_patch',
        x: 120 + nextRandom('world') * (ROOM_W - 240),
        y: 110 + nextRandom('world') * (ROOM_H - 220),
        r: 14 + nextRandom('world') * 22,
      });
    }

    const fruitNodeCount = Math.max(1, Math.round((room.type === 'secret' ? 3 : room.type === 'treasure' ? 2 : 1) * gardenRoomScore));
    for (let index = 0; index < fruitNodeCount; index += 1) {
      const x = 150 + nextRandom('world') * (ROOM_W - 300);
      const y = 150 + nextRandom('world') * (ROOM_H - 300);
      const node = {
        id: `${room.gx},${room.gy}:${index}`,
        x,
        y,
        heal: 18 + Math.round(nextRandom('world') * 10),
        respawnAt: gameElapsedTime + rand(6, 2, 'world') + index * 2,
        fruitSpawned: false,
      };
      room.gardenFruitNodes.push(node);
      room.decorations.push({
        kind: 'fruit_tree',
        x: clamp(x + rand(42, -42, 'world'), WALL + 46, ROOM_W - WALL - 46),
        y: clamp(y + rand(36, -36, 'world'), WALL + 52, ROOM_H - WALL - 52),
        r: 20 + nextRandom('world') * 8,
      });
    }
  }

  function ensureGardenRoomData(room) {
    if (!room || room.type === 'boss' || room.type === 'god' || floor <= 5) return;
    if (!room.gardenDecorated) decorateGardenRoomData(room);
    room.pickups = Array.isArray(room.pickups) ? room.pickups : [];
    room.decorations = Array.isArray(room.decorations) ? room.decorations : [];
    room.gardenFruitNodes = Array.isArray(room.gardenFruitNodes) ? room.gardenFruitNodes : [];
  }

  function spawnGardenFruit(room, node) {
    if (!room || !node) return;
    room.pickups = Array.isArray(room.pickups) ? room.pickups : [];
    if (room.pickups.some(pickup => (pickup?.type === 'apple' || pickup?.type === 'fruit') && pickup.gardenNodeId === node.id)) return;
    room.pickups.push({
      x: node.x,
      y: node.y - 8,
      type: 'apple',
      heal: Number(node.heal || 20),
      gardenNodeId: node.id,
      roomGx: room.gx,
      roomGy: room.gy,
      respawnAt: Number(node.respawnAt || 0),
      grownAt: gameElapsedTime,
      ripe: true,
    });
    node.fruitSpawned = true;
  }

  function updateGardenGrowth() {
    if (floor <= 5) return;
    if (!Array.isArray(rooms) || rooms.length === 0) return;
    rooms.forEach(room => {
      if (!room || room.type === 'boss' || room.type === 'god') return;
      ensureGardenRoomData(room);
      room.gardenFruitNodes.forEach(node => {
        if (!node) return;
        const activeFruit = Array.isArray(room.pickups) && room.pickups.some(pickup => (pickup?.type === 'apple' || pickup?.type === 'fruit') && pickup.gardenNodeId === node.id);
        if (activeFruit) {
          node.fruitSpawned = true;
          return;
        }
        node.fruitSpawned = false;
        if (gameElapsedTime >= Number(node.respawnAt || 0)) {
          spawnGardenFruit(room, node);
        }
      });
    });
  }

  function randomMoatLanePosition(axis, radius) {
    const margin = 54 + radius;
    const center = axis === 'x' ? ROOM_W / 2 : ROOM_H / 2;
    const max = axis === 'x' ? ROOM_W - margin : ROOM_H - margin;
    const min = margin;
    const doorHalf = DOOR / 2 + radius + 26;
    const lowMax = center - doorHalf;
    const highMin = center + doorHalf;

    const ranges = [];
    if (lowMax > min) ranges.push([min, lowMax]);
    if (max > highMin) ranges.push([highMin, max]);
    if (!ranges.length) return rand(max, min, 'world');

    const [rangeMin, rangeMax] = ranges[irand(0, ranges.length - 1, 'world')];
    return rand(rangeMax, rangeMin, 'world');
  }

  function createMoatLavaHazard() {
    const r = 44 + rand(24, 0, 'world');
    const side = irand(0, 3, 'world');
    const wallOffset = WALL + r + 18 + rand(16, 0, 'world');
    const hazard = {
      kind: 'lava',
      x: ROOM_W / 2,
      y: ROOM_H / 2,
      r,
      phase: rand(Math.PI * 2, 0, 'world'),
      pulse: rand(1.8, 1.15, 'world'),
      wobble: rand(0.75, 0.45, 'world'),
      side,
    };

    if (side === 0) {
      hazard.x = randomMoatLanePosition('x', r);
      hazard.y = wallOffset;
    } else if (side === 1) {
      hazard.x = randomMoatLanePosition('x', r);
      hazard.y = ROOM_H - wallOffset;
    } else if (side === 2) {
      hazard.x = wallOffset;
      hazard.y = randomMoatLanePosition('y', r);
    } else {
      hazard.x = ROOM_W - wallOffset;
      hazard.y = randomMoatLanePosition('y', r);
    }

    return hazard;
  }

  function createCompanionMoatLava(primary) {
    const companion = {
      kind: 'lava',
      x: primary.x,
      y: primary.y,
      r: primary.r * rand(0.86, 0.68, 'world'),
      phase: primary.phase + rand(1.9, 0.6, 'world'),
      pulse: primary.pulse + rand(0.35, -0.2, 'world'),
      wobble: primary.wobble + rand(0.2, -0.15, 'world'),
      side: primary.side,
    };

    const along = (primary.r + companion.r) * rand(1.2, 0.75, 'world');
    if (primary.side <= 1) {
      companion.x = clamp(primary.x + (nextRandom('world') < 0.5 ? -along : along), companion.r + 42, ROOM_W - companion.r - 42);
      companion.y = primary.side === 0 ? WALL + companion.r + 18 : ROOM_H - WALL - companion.r - 18;
    } else {
      companion.y = clamp(primary.y + (nextRandom('world') < 0.5 ? -along : along), companion.r + 42, ROOM_H - companion.r - 42);
      companion.x = primary.side === 2 ? WALL + companion.r + 18 : ROOM_W - WALL - companion.r - 18;
    }

    return companion;
  }

  function createRoomRecord(position, overrides = {}) {
    return {
      gx: position.x,
      gy: position.y,
      type: 'combat',
      doors: { n: false, s: false, e: false, w: false },
      secretPassages: {},
      secret: false,
      explored: false,
      visited: false,
      cleared: false,
      bossStarted: false,
      challengeStarted: false,
      challengeRewardSpawned: false,
      challengeFailed: false,
      ...overrides,
    };
  }

  function findRoomAt(gx, gy) {
    return rooms.find(room => room.gx === gx && room.gy === gy) || null;
  }

  function getConnectedRoom(room, direction) {
    if (!room || !direction) return null;
    const secretPassage = room.secretPassages?.[direction];
    if (secretPassage?.open) {
      return findRoomAt(secretPassage.targetGx, secretPassage.targetGy);
    }
    if (!room.doors?.[direction]) return null;
    const vector = DIRECTION_VECTORS[direction];
    return vector ? findRoomAt(room.gx + vector.dx, room.gy + vector.dy) : null;
  }

  function hasRoomExit(room, direction) {
    return !!getConnectedRoom(room, direction);
  }

  function hasVisibleRoomExit(room, direction) {
    return !!room?.doors?.[direction];
  }

  function setSecretPassageOpen(room, direction, open = true) {
    const passage = room?.secretPassages?.[direction];
    if (!passage) return;
    passage.open = !!open;
    const targetRoom = findRoomAt(passage.targetGx, passage.targetGy);
    const reverse = OPPOSITE_DIRECTION[direction];
    if (targetRoom?.secretPassages?.[reverse]) {
      targetRoom.secretPassages[reverse].open = !!open;
    }
  }

  function createSecretWall(direction, targetRoom) {
    if (!targetRoom) return null;
    const position = {
      n: { x: ROOM_W / 2, y: 48 },
      s: { x: ROOM_W / 2, y: ROOM_H - 48 },
      e: { x: ROOM_W - 48, y: ROOM_H / 2 },
      w: { x: 48, y: ROOM_H / 2 },
    }[direction];
    if (!position) return null;
    return {
      kind: 'secret_wall',
      x: position.x,
      y: position.y,
      r: 22,
      hp: 2,
      broken: false,
      secretDir: direction,
      targetGx: targetRoom.gx,
      targetGy: targetRoom.gy,
    };
  }

  function createSecretVendorOffer(kind, x, y) {
    if (kind === 'relic') {
      return { x, y, type: 'secretVendor', offerKind: 'relic', cost: 1, label: 'Relic' };
    }
    if (kind === 'vitality') {
      return { x, y, type: 'secretVendor', offerKind: 'vitality', cost: 1, label: 'Vital' };
    }
    if (kind === 'xp') {
      return {
        x,
        y,
        type: 'secretVendor',
        offerKind: 'xp',
        cost: getSecretXpOfferCost(),
        xpValue: getSecretXpOfferAmount(),
        label: 'XP',
      };
    }
    return { x, y, type: 'secretVendor', offerKind: 'wealth', cost: 2, label: 'Wealth' };
  }

  function assignSecretRoom(roomMap) {
    const anchors = shuffle(rooms.filter(room => !room.secret && ['combat', 'treasure', 'shop', 'anvil'].includes(room.type)), 'world');
    for (const anchor of anchors) {
      const dirs = shuffle([...DIRECTIONS], 'world');
      for (const dir of dirs) {
        const vector = DIRECTION_VECTORS[dir];
        const nx = anchor.gx + vector.dx;
        const ny = anchor.gy + vector.dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        if (roomMap.get(`${nx},${ny}`)) continue;
        const secretRoom = createRoomRecord({ x: nx, y: ny }, {
          type: 'secret',
          secret: true,
          cleared: true,
          secretKind: nextRandom('world') < 0.5 ? 'warp' : 'vendor',
        });
        anchor.secretPassages[dir] = { targetGx: nx, targetGy: ny, open: false };
        secretRoom.secretPassages[OPPOSITE_DIRECTION[dir]] = { targetGx: anchor.gx, targetGy: anchor.gy, open: false };
        rooms.push(secretRoom);
        roomMap.set(`${nx},${ny}`, secretRoom);
        return;
      }
    }
  }

  function findFarthestRoom(startRoom, roomMap) {
    const queue = [startRoom];
    const distances = new Map([[startRoom, 0]]);
    let farthest = startRoom;

    while (queue.length) {
      const room = queue.shift();
      const baseDistance = distances.get(room);
      [
        ['n', 0, -1],
        ['s', 0, 1],
        ['e', 1, 0],
        ['w', -1, 0],
      ].forEach(([dir, dx, dy]) => {
        if (!room.doors[dir]) return;
        const next = roomMap.get(`${room.gx + dx},${room.gy + dy}`);
        if (!next || distances.has(next)) return;
        distances.set(next, baseDistance + 1);
        queue.push(next);
        if (baseDistance + 1 > distances.get(farthest)) farthest = next;
      });
    }

    return farthest;
  }

  function syncCurrentRoomState() {
    if (!currentRoom) return;
    currentRoom.enemies = enemies;
    currentRoom.deadBodies = deadBodies;
    currentRoom.projectiles = projectiles;
    currentRoom.chests = chests;
    currentRoom.pickups = pickups;
    currentRoom.destructibles = destructibles;
    currentRoom.hazards = hazards;
    currentRoom.shopOffers = shopOffers;
    currentRoom.shopWeaponOffers = Array.isArray(currentRoom.shopWeaponOffers) ? currentRoom.shopWeaponOffers : [];
    currentRoom.structures = structures;
    currentRoom.decorations = decorations;
  }

  function findSafeSpawnPoint() {
    const searchRadius = 120;
    const testRadius = 18;
    const angleStep = Math.PI / 8;
    
    if (!isBlocked(START_X, START_Y, testRadius)) {
      return { x: START_X, y: START_Y };
    }
    
    for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
      for (let r = searchRadius * 0.25; r <= searchRadius; r += 20) {
        const x = START_X + Math.cos(angle) * r;
        const y = START_Y + Math.sin(angle) * r;
        if (!isBlocked(x, y, testRadius)) {
          return { x: clamp(x, WALL + testRadius, ROOM_W - WALL - testRadius), y: clamp(y, WALL + testRadius, ROOM_H - WALL - testRadius) };
        }
      }
    }
    
    return { x: START_X, y: START_Y };
  }

  function isLockedFightRoom(room) {
    return !!room && (room.type === 'boss' || room.type === 'god' || room.type === 'ladder' || CHALLENGE_ROOM_TYPES.has(room.type));
  }

  function clearPlayerTransientDefense() {
    if (!player) return;
    player.inv = 0;
    player.vx = 0;
    player.vy = 0;
    player.dashTime = 0;
    player.dashX = 0;
    player.dashY = 0;
    player.cowardsWayTime = 0;
    player.princessFlightTime = 0;
    loveBeamCasting = false;
    player.blockActive = false;
    player.blockTimer = 0;
  }

  function tickPlayerTransientDefenseTimers(dt) {
    if (!player) return;
    const step = Math.max(0, Number(dt) || 0);
    player.inv = Math.max(0, Number(player.inv || 0) - step);
    player.dashTime = Math.max(0, Number(player.dashTime || 0) - step);
    if (player.dashTime <= 0) {
      player.dashX = 0;
      player.dashY = 0;
    }
    player.cowardsWayTime = Math.max(0, Number(player.cowardsWayTime || 0) - step);
    player.princessFlightTime = Math.max(0, Number(player.princessFlightTime || 0) - step);
    player.blockTimer = Math.max(0, Number(player.blockTimer || 0) - step);
    player.blockActive = player.blockTimer > 0;
    if (player.princessFlightTime <= 0 && loveBeamCasting) {
      loveBeamCasting = false;
    }
  }

  function isBossFightActive() {
    return currentRoom?.type === 'boss' || currentRoom?.type === 'god' || enemies.some(enemy => isBossType(enemy?.type));
  }

  function enterRoom(room) {
    syncCurrentRoomState();
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    currentRoom = room;
    room.explored = true;
    room.visited = true;
    enemies = room.enemies || [];
    deadBodies = room.deadBodies || [];
    room.deadBodies = deadBodies;
    projectiles = room.projectiles || [];
    chests = room.chests || [];
    pickups = sanitizePickupList(room.pickups);
    room.pickups = pickups;
    particles = [];
    destructibles = room.destructibles || [];
    hazards = room.hazards || [];
    shopOffers = room.shopOffers || [];
    structures = room.structures || [];
    decorations = room.decorations || [];
    endActiveLaser();
    laserTime = 0;
    laserTick = 0;
    laserAngle = 0;
    laserSweepSpeed = 0;
    turtleWaveHpTimer = 0;
    mouse.right = false;
    mouse.rightQueued = false;
    player.roomDamageTaken = 0;
    if (isLockedFightRoom(room)) clearPlayerTransientDefense();
    const safeSpawn = findSafeSpawnPoint();
    player.x = safeSpawn.x;
    player.y = safeSpawn.y;

    if (room.type === 'combat' && !room.cleared && enemies.length === 0) {
      if (gameMode === 'endless') {
        endlessWaveActive = true;
        const firstWaveSize = 4 + floor;
        spawnWave(firstWaveSize, 'combat');
        particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 40, life: 1.2, text: 'WAVE 1', c: '#ff8b8b' });
      } else {
        spawnWave(getWaveCount(3), 'combat');
      }
    }
    if (room.type === 'shop') {
      ensureShopHasMinimumItemOffers(room, 3);
      room.shopWeaponOffers = Array.isArray(room.shopWeaponOffers) ? room.shopWeaponOffers : [];
      refreshRoomShopCosts(room);
      shopOffers = room.shopOffers || [];
    }
    if (room.type === 'challenge') {
      if (!room.cleared && !room.challengeStarted) {
        spawnChallengeStarter(room);
      } else if (!room.cleared && room.challengeStarted && !enemies.some(enemy => enemy.type === 'mirror_knight')) {
        if ((room.challengeType || 'mirror') === 'mirror') spawnMirrorChampion();
      }
    }

    if (room.type === 'anvil') {
      setAnvilPanelOpen(false);
    }

    if (room.type === 'treasure' && !room.cleared && chests.length === 0) {
      const chestCount = 1 + Math.floor(nextRandom('loot') * 2);
      for (let index = 0; index < chestCount; index += 1) {
        chests.push({ x: 260 + index * 180, y: ROOM_H / 2, open: false });
      }
    }

    if (room.secret) {
      particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 24, life: 1.1, text: 'SECRET ROOM', c: '#8dd4ff' });
    }

    if (room.type === 'ladder') {
      if (!room.cleared && enemies.length === 0) {
        spawnWave(getWaveCount(4), 'ladder');
        // Almost always add a random non-god boss to ladder rooms
        if (nextRandom('encounter') < 0.88) {
          const _ladderBossPool = ['queen_cult', 'bulk_golem', 'artificer_knave'];
          const _ladderBossType = _ladderBossPool[Math.floor(nextRandom('encounter') * _ladderBossPool.length)];
          const _ladderBossSpawn = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2 - 60, 20);
          if (_ladderBossSpawn) {
            const _ladderBoss = spawnEnemy(_ladderBossType, _ladderBossSpawn.x, _ladderBossSpawn.y, false);
            const _ladderBossLine = BOSS_OPENING_DIALOGUE[_ladderBossType];
            if (_ladderBoss && _ladderBossLine) sayOverEntity(_ladderBoss, _ladderBossLine);
          }
        }
      }
      if (room.cleared && !pickups.some(pickup => pickup.type === 'ladder')) {
        let ladderX = ROOM_W / 2;
        let ladderY = ROOM_H / 2;
        let attempts = 0;
        while (isBlocked(ladderX, ladderY, 16) && attempts < 20) {
          const angle = nextRandom('world') * Math.PI * 2;
          const radius = 60 + nextRandom('world') * 120;
          ladderX = clamp(ROOM_W / 2 + Math.cos(angle) * radius, 60, ROOM_W - 60);
          ladderY = clamp(ROOM_H / 2 + Math.sin(angle) * radius, 60, ROOM_H - 60);
          attempts++;
        }
        pickups.push({ x: ladderX, y: ladderY, type: 'ladder' });
      }
    }

    if (room.type === 'boss') {
      if (!room.cleared && enemies.length === 0) {
        spawnFloorBoss();
      }
      if (room.cleared && !pickups.some(pickup => pickup.type === 'ladder')) {
        let ladderX = ROOM_W / 2;
        let ladderY = ROOM_H / 2;
        let attempts = 0;
        while (isBlocked(ladderX, ladderY, 16) && attempts < 20) {
          const angle = nextRandom('world') * Math.PI * 2;
          const radius = 60 + nextRandom('world') * 120;
          ladderX = clamp(ROOM_W / 2 + Math.cos(angle) * radius, 60, ROOM_W - 60);
          ladderY = clamp(ROOM_H / 2 + Math.sin(angle) * radius, 60, ROOM_H - 60);
          attempts++;
        }
        pickups.push({ x: ladderX, y: ladderY, type: 'ladder' });
      }
    }

    // Inject rivals that are already present in this room
    injectRivalsToCurrentRoom();

    if (room.type === 'god') {
      if (room.cleared) {
        if (!pickups.some(pickup => pickup.type === 'crown')) {
          pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'crown' });
        }
      } else if (room.bossStarted) {
        if (!enemies.some(enemy => enemy.type === 'god')) {
          spawnGodBoss();
        }
      } else if (!room.bossStarted) {
        // Auto-start the god fight immediately — no upfront choice
        currentRoom.bossStarted = true;
        if (!enemies.some(enemy => enemy.type === 'god')) {
          spawnGodBoss();
          playGodDialogue(1);
        }
        syncCurrentRoomState();
        updateObjective();
      }
    }

    updateGardenGrowth();
    syncCurrentRoomState();
    updateObjective();
    scheduleRunSave();
  }

  function ensureShopHasMinimumItemOffers(room, minItemOffers = 3) {
    if (!room || room.type !== 'shop') return;
    room.shopOffers = Array.isArray(room.shopOffers) ? room.shopOffers : [];
    const itemOffers = room.shopOffers.filter(offer => offer?.type === 'item');
    if (itemOffers.length >= minItemOffers) return;

    const occupiedKeys = new Set(itemOffers.map(offer => offer.key));
    const itemSlotsX = [ROOM_W / 2 - 180, ROOM_W / 2, ROOM_W / 2 + 180, ROOM_W / 2 - 90, ROOM_W / 2 + 90];
    let created = 0;

    while (itemOffers.length + created < minItemOffers) {
      let key = '';
      for (let attempts = 0; attempts < 12; attempts += 1) {
        const candidate = rollItemDrop({ stream: 'loot' });
        if (!occupiedKeys.has(candidate)) {
          key = candidate;
          break;
        }
      }
      if (!key) key = rollItemDrop({ stream: 'loot' });
      occupiedKeys.add(key);
      const itemIndex = itemOffers.length + created;
      const rarity = itemRegistry.get(key)?.rarity || ITEM_DEFS[key]?.rarity || 'knight';
      room.shopOffers.push({
        type: 'item',
        key,
        cost: getShopItemCost(itemIndex, floor, selectedDifficulty, rarity),
        x: itemSlotsX[itemIndex] ?? ROOM_W / 2,
        y: ROOM_H / 2 - 16,
        bought: false,
      });
      created += 1;
    }
  }

  // ── Rival Adventurer System ──────────────────────────────────────────────

  function spawnRivals() {
    rivals = [];
    if (!rooms || rooms.length === 0) return;
    const unchosen = Object.keys(CHARACTER_DEFS).filter(k => k !== chosenCharacter && RIVAL_DEFS[k]);
    const count = floor >= 3 ? Math.min(2, unchosen.length) : 1;
    const nonStartRooms = rooms.filter(r => r.type !== 'start' && r.type !== 'boss' && r.type !== 'god');
    if (nonStartRooms.length === 0) return;
    const shuffled = [...unchosen].sort(() => nextRandom('world') - 0.5);
    for (let i = 0; i < count && i < shuffled.length; i++) {
      const charKey = shuffled[i];
      const def = RIVAL_DEFS[charKey];
      const spawnRoom = nonStartRooms[i % nonStartRooms.length];
      const floorScale = 1 + (floor - 1) * 0.12;
      rivals.push({
        characterKey: charKey,
        name: def.name,
        color: def.color,
        attackStyle: def.attackStyle,
        enterLine: def.enterLine,
        deathLine: def.deathLine,
        roomGx: spawnRoom.gx,
        roomGy: spawnRoom.gy,
        moveTimer: 6 + nextRandom('world') * 5,
        moveInterval: RIVAL_MOVE_INTERVAL_BASE + nextRandom('world') * 4,
        hp: Math.round(def.hp * floorScale),
        max: Math.round(def.hp * floorScale),
        dmg: Math.round(def.dmg * floorScale),
        speed: def.speed,
        r: def.r,
        attackCd: def.attackCd,
        loot: [],
        homeGx: spawnRoom.gx,
        homeGy: spawnRoom.gy,
        objectiveGx: spawnRoom.gx,
        objectiveGy: spawnRoom.gy,
        objectiveKind: 'patrol',
        route: [],
        aggroTimer: 0,
        lastKnownPlayerGx: spawnRoom.gx,
        lastKnownPlayerGy: spawnRoom.gy,
        hpSnapshot: Math.round(def.hp * floorScale),
        dead: false,
      });
    }
  }

  function getRoomByCoords(gx, gy) {
    return rooms.find(room => room.gx === gx && room.gy === gy) || null;
  }

  function hasStealableLoot(room) {
    if (!room || !Array.isArray(room.pickups) || room.pickups.length === 0) return false;
    return room.pickups.some(pickup => pickup.type === 'item' || pickup.type === 'coin' || pickup.type === 'potion');
  }

  function buildRivalRoute(fromRoom, toRoom) {
    if (!fromRoom || !toRoom || fromRoom === toRoom) return [];
    const visited = new Set([fromRoom]);
    const queue = [{ room: fromRoom, path: [] }];
    const DIRS = ['n', 's', 'e', 'w'];
    while (queue.length > 0) {
      const { room, path } = queue.shift();
      for (const dir of DIRS) {
        const next = getConnectedRoom(room, dir);
        if (!next || visited.has(next)) continue;
        visited.add(next);
        const nextPath = [...path, dir];
        if (next === toRoom) return nextPath;
        queue.push({ room: next, path: nextPath });
      }
    }
    return [];
  }

  function chooseRivalObjectiveRoom(rival, fromRoom) {
    if (!fromRoom) return null;
    const pool = rooms.filter(room => room !== fromRoom && room.type !== 'start' && room.type !== 'god' && room.type !== 'boss');
    if (pool.length === 0) return fromRoom;

    const weighted = [];
    pool.forEach(room => {
      let weight = 1;
      if (hasStealableLoot(room)) weight += 3.4;
      if (room.type === 'treasure') weight += 2.1;
      if (room.type === 'shop') weight += 1.7;
      if (room.type === 'challenge') weight += 1.1;
      if (room.type === 'anvil') weight += 1.3;
      if (room.type === 'combat' && !room.cleared) weight += 0.8;
      const distance = Math.abs(room.gx - fromRoom.gx) + Math.abs(room.gy - fromRoom.gy);
      weight += Math.min(2, distance * 0.35);
      if (rival.homeGx === room.gx && rival.homeGy === room.gy) weight += 0.2;
      weighted.push({ room, weight: Math.max(0.1, weight) });
    });

    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return pool[Math.floor(nextRandom('encounter') * pool.length)] || fromRoom;
    let roll = nextRandom('encounter') * totalWeight;
    for (let i = 0; i < weighted.length; i += 1) {
      roll -= weighted[i].weight;
      if (roll <= 0) return weighted[i].room;
    }
    return weighted[weighted.length - 1].room || fromRoom;
  }

  function chooseFallbackNeighbor(fromRoom) {
    const dirs = ['n', 's', 'e', 'w'];
    for (const dir of dirs.sort(() => nextRandom('encounter') - 0.5)) {
      const next = getConnectedRoom(fromRoom, dir);
      if (next) return { next, dir };
    }
    return null;
  }

  function stealFromRoom(rival, room) {
    if (!room || !Array.isArray(room.pickups) || room.pickups.length === 0) return;
    const stealable = room.pickups.filter(p => p.type === 'item' || p.type === 'coin' || p.type === 'potion');
    if (stealable.length === 0) return;
    const idx = Math.floor(nextRandom('encounter') * stealable.length);
    const stolen = stealable[idx];
    const roomIdx = room.pickups.indexOf(stolen);
    if (roomIdx < 0) return;
    room.pickups.splice(roomIdx, 1);
    rival.loot.push({ type: stolen.type, key: stolen.key, value: stolen.value });
    if (room === currentRoom) {
      const liveIdx = pickups.indexOf(stolen);
      if (liveIdx >= 0) pickups.splice(liveIdx, 1);
      particles.push({ x: stolen.x || ROOM_W / 2, y: (stolen.y || ROOM_H / 2) - 16, life: 1.6, text: `${rival.name} STOLE THIS!`, c: rival.color });
    }
  }

  function injectRivalToCurrentRoom(rival) {
    if (!currentRoom) return;
    if (enemies.some(e => e.type === 'rival' && e.rivalData === rival)) return;
    const sp = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2, rival.r) || { x: ROOM_W / 2, y: ROOM_H / 2 };
    const entry = {
      type: 'rival',
      rivalData: rival,
      rivalKey: rival.characterKey,
      x: sp.x, y: sp.y,
      vx: 0, vy: 0,
      r: rival.r,
      hp: rival.hp,
      max: rival.max,
      dmg: rival.dmg,
      speed: rival.speed,
      attackCd: 0.5 + nextRandom('encounter') * 0.6,
      stun: 0, inv: 0,
      elite: false,
      bleedImmune: false, fireImmune: false, poisonImmune: false, dark_drainImmune: false,
      statuses: createStatusMap(),
      barrier: 0,
      beamTime: 0, beamTick: 0, beamAngle: 0,
      dashTime: 0, dashAngle: 0, dashHit: false,
      swingTime: 0, windup: 0,
      summonCd: 0, supportCd: 0,
      bossSpawnTimer: 0, bossSpawnWarnAt: 0,
      aoeTime: 0, phase: 1,
      splitReady: false, spawnedFromBulk: false,
      state: 'idle',
    };
    enemies.push(entry);
    particles.push({ x: entry.x, y: entry.y - 26, life: 1.8, text: `${rival.name.toUpperCase()} ENTERS!`, c: rival.color });
    sayAtPosition(entry.x, entry.y, rival.enterLine, { speaker: rival.name, tone: 'boss', holdTime: 1.8, offsetY: rival.r + 36 });
  }

  function injectRivalsToCurrentRoom() {
    if (!currentRoom) return;
    rivals.forEach(rival => {
      if (!rival.dead && rival.roomGx === currentRoom.gx && rival.roomGy === currentRoom.gy) {
        injectRivalToCurrentRoom(rival);
      }
    });
  }

  function updateRivals(dt) {
    if (!currentRoom) return;
    for (let i = rivals.length - 1; i >= 0; i--) {
      const rival = rivals[i];
      if (rival.dead) { rivals.splice(i, 1); continue; }
      // Sync hp from live enemy if they're in the current room
      const liveEnemy = enemies.find(e => e.type === 'rival' && e.rivalData === rival);
      if (liveEnemy) {
        rival.hp = liveEnemy.hp;
        if (liveEnemy.hp < rival.hpSnapshot) {
          rival.aggroTimer = Math.max(rival.aggroTimer, 12);
          rival.lastKnownPlayerGx = currentRoom.gx;
          rival.lastKnownPlayerGy = currentRoom.gy;
        }
        rival.hpSnapshot = liveEnemy.hp;
      }
      rival.aggroTimer = Math.max(0, rival.aggroTimer - dt);
      rival.moveTimer -= dt;
      if (rival.moveTimer <= 0) {
        rival.moveTimer = rival.moveInterval;
        const fromRoom = getRoomByCoords(rival.roomGx, rival.roomGy);
        if (!fromRoom) continue;
        const wasInCurrentRoom = fromRoom === currentRoom;
        let goalRoom = null;

        if (rival.aggroTimer > 0) {
          rival.objectiveKind = 'hunt';
          goalRoom = getRoomByCoords(rival.lastKnownPlayerGx, rival.lastKnownPlayerGy) || currentRoom;
        } else {
          const objectiveRoom = getRoomByCoords(rival.objectiveGx, rival.objectiveGy);
          if (!objectiveRoom || objectiveRoom === fromRoom || rival.route.length === 0) {
            goalRoom = chooseRivalObjectiveRoom(rival, fromRoom);
            rival.objectiveKind = hasStealableLoot(goalRoom) ? 'loot' : 'patrol';
            rival.objectiveGx = goalRoom.gx;
            rival.objectiveGy = goalRoom.gy;
            rival.route = buildRivalRoute(fromRoom, goalRoom);
          }
        }

        let nextRoom = null;
        if (goalRoom && goalRoom !== fromRoom && rival.route.length === 0) {
          rival.route = buildRivalRoute(fromRoom, goalRoom);
        }
        const stepDir = rival.route.shift();
        if (stepDir) {
          nextRoom = getConnectedRoom(fromRoom, stepDir);
        }
        if (!nextRoom) {
          const fallback = chooseFallbackNeighbor(fromRoom);
          nextRoom = fallback?.next || null;
          rival.route = [];
        }
        if (!nextRoom) continue;

        stealFromRoom(rival, nextRoom);
        rival.roomGx = nextRoom.gx;
        rival.roomGy = nextRoom.gy;

        if (nextRoom === currentRoom) {
          rival.aggroTimer = Math.max(rival.aggroTimer, 8);
          rival.lastKnownPlayerGx = currentRoom.gx;
          rival.lastKnownPlayerGy = currentRoom.gy;
          injectRivalToCurrentRoom(rival);
        }

        if (nextRoom.gx === rival.objectiveGx && nextRoom.gy === rival.objectiveGy) {
          rival.route = [];
        }

        if (wasInCurrentRoom && nextRoom !== currentRoom && liveEnemy) {
          const idx = enemies.indexOf(liveEnemy);
          if (idx >= 0) enemies.splice(idx, 1);
          const fleeText = rival.objectiveKind === 'hunt' ? `${rival.name} REPOSITIONED` : `${rival.name} MOVED`;
          particles.push({ x: liveEnemy.x, y: liveEnemy.y - 16, life: 1.4, text: fleeText, c: rival.color });
          rival.hp = liveEnemy.hp; // preserve hp
        }
      }
    }
  }

  function updateRivalEnemy(enemy, dt) {
    const rival = enemy.rivalData;
    if (!rival) return;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (enemy.stun > 0) { enemy.vx *= 0.88; enemy.vy *= 0.88; return; }

    const attackStyle = rival.attackStyle;
    const preferDist = attackStyle === 'ranged' ? 220 : 0;

    // Movement
    if (attackStyle === 'ranged') {
      // Keep preferred distance
      if (distance < preferDist - 30) {
        steerEnemy(enemy, -(dx / distance), -(dy / distance), enemy.speed, 4.2, dt);
      } else if (distance > preferDist + 60) {
        steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.2, dt);
      } else {
        // Strafe sideways
        const perp = Math.atan2(dy, dx) + Math.PI / 2;
        steerEnemy(enemy, Math.cos(perp) * 0.8, Math.sin(perp) * 0.8, enemy.speed * 0.6, 3.0, dt);
      }
    } else {
      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
    }

    if (enemy.attackCd > 0) return;

    if (attackStyle === 'melee' || attackStyle === 'melee_heal') {
      if (distance < enemy.r + player.r + 12) {
        const angle = Math.atan2(dy, dx);
        damagePlayer(enemy.dmg, angle, 280, rival.name);
        enemy.attackCd = rival.attackCd * 0.9 + nextRandom('encounter') * 0.4;
        enemy.swingTime = 0.22;
        // Heal on hit for granialla-style
        if (attackStyle === 'melee_heal' && nextRandom('encounter') < 0.25) {
          const heal = Math.round(enemy.max * 0.06);
          enemy.hp = Math.min(enemy.max, enemy.hp + heal);
          rival.hp = enemy.hp;
          particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.7, text: `+${heal}`, c: '#a8aaff' });
        }
      }
    } else if (attackStyle === 'ranged') {
      if (distance < 320) {
        const angle = Math.atan2(dy, dx);
        const spread = 0.22;
        [-1, 0, 1].forEach(offset => {
          const a = angle + offset * spread;
          projectiles.push({
            x: enemy.x, y: enemy.y,
            vx: Math.cos(a) * 310, vy: Math.sin(a) * 310,
            r: 5, life: 1.1, damage: enemy.dmg,
            kind: 'rival_shot', color: rival.color,
            knockback: 160, pierceCount: 0, hitOptions: null,
            enemy: true,
            fromRival: true,
          });
        });
        enemy.attackCd = rival.attackCd + nextRandom('encounter') * 0.5;
      }
    }
  }

  // ── End Rival System ────────────────────────────────────────────────────────

  function findSafeEnemySpawnPoint(preferredX, preferredY, radius = 18) {
    if (!isBlocked(preferredX, preferredY, radius)) {
      return { x: preferredX, y: preferredY };
    }
    
    const searchAngles = 16;
    const maxAttempts = 40;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = (attempt / searchAngles) * Math.PI * 2;
      const searchRadius = 30 + (attempt % 4) * 40;
      const x = clamp(preferredX + Math.cos(angle) * searchRadius, WALL + radius, ROOM_W - WALL - radius);
      const y = clamp(preferredY + Math.sin(angle) * searchRadius, WALL + radius, ROOM_H - WALL - radius);
      if (!isBlocked(x, y, radius)) {
        return { x, y };
      }
    }
    
    return null;
  }

  function compactEnemyList() {
    if (!Array.isArray(enemies) || enemies.length === 0) return;
    const before = enemies.length;
    enemies = enemies.filter(enemy => enemy && typeof enemy === 'object');
    if (enemies.length !== before) syncCurrentRoomState();
  }

  function getCoverObstacles() {
    const obstacleRects = structures.map(structure => ({
      x: structure.x - structure.w / 2,
      y: structure.y - structure.h / 2,
      w: structure.w,
      h: structure.h,
    }));
    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      if (prop.kind !== 'wall' && prop.kind !== 'secret_wall') return;
      obstacleRects.push({
        x: prop.x - prop.r,
        y: prop.y - prop.r,
        w: prop.r * 2,
        h: prop.r * 2,
      });
    });
    return obstacleRects;
  }

  function lineIntersectsRect(x1, y1, x2, y2, rect, padding = 0) {
    const minX = rect.x - padding;
    const minY = rect.y - padding;
    const maxX = rect.x + rect.w + padding;
    const maxY = rect.y + rect.h + padding;
    const dx = x2 - x1;
    const dy = y2 - y1;
    let t0 = 0;
    let t1 = 1;
    const checks = [
      [-dx, x1 - minX],
      [dx, maxX - x1],
      [-dy, y1 - minY],
      [dy, maxY - y1],
    ];
    for (const [p, q] of checks) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const ratio = q / p;
      if (p < 0) {
        if (ratio > t1) return false;
        if (ratio > t0) t0 = ratio;
      } else {
        if (ratio < t0) return false;
        if (ratio < t1) t1 = ratio;
      }
    }
    return true;
  }

  function hasLineOfSight(ax, ay, bx, by) {
    return !getCoverObstacles().some(rect => lineIntersectsRect(ax, ay, bx, by, rect, 3));
  }

  function findEnemyCoverTarget(enemy, preferredRange = 250) {
    if (!enemy || !player) return null;
    const obstacles = getCoverObstacles();
    if (!obstacles.length) return null;
    let best = null;
    obstacles.forEach(rect => {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const awayX = cx - player.x;
      const awayY = cy - player.y;
      const awayLength = Math.hypot(awayX, awayY) || 1;
      const nx = awayX / awayLength;
      const ny = awayY / awayLength;
      const px = -ny;
      const py = nx;
      const baseOffset = Math.max(rect.w, rect.h) * 0.55 + enemy.r + 18;
      const sideOffset = Math.min(Math.max(rect.w, rect.h) * 0.32, 22);
      [
        { side: 0, depth: baseOffset },
        { side: sideOffset, depth: baseOffset + 8 },
        { side: -sideOffset, depth: baseOffset + 8 },
      ].forEach(sample => {
        const targetX = clamp(cx + nx * sample.depth + px * sample.side, WALL + enemy.r, ROOM_W - WALL - enemy.r);
        const targetY = clamp(cy + ny * sample.depth + py * sample.side, WALL + enemy.r, ROOM_H - WALL - enemy.r);
        if (isBlocked(targetX, targetY, enemy.r)) return;
        if (!lineIntersectsRect(player.x, player.y, targetX, targetY, rect, 6)) return;
        const enemyDistance = dist(enemy.x, enemy.y, targetX, targetY);
        const playerDistance = dist(player.x, player.y, targetX, targetY);
        if (enemyDistance > 360) return;
        const score = enemyDistance + Math.abs(playerDistance - preferredRange) * 0.55;
        if (!best || score < best.score) {
          best = { x: targetX, y: targetY, score };
        }
      });
    });
    return best;
  }

  function trySteerEnemyToCover(enemy, dt, preferredRange = 250, accel = 3.2) {
    if (!enemy || !player) return false;
    enemy.coverCheckCd = Math.max(0, Number(enemy.coverCheckCd || 0) - dt);
    const hasSight = hasLineOfSight(enemy.x, enemy.y, player.x, player.y);
    const coverTarget = enemy.coverTarget;
    const needsNewTarget = !coverTarget
      || enemy.coverCheckCd <= 0
      || dist(enemy.x, enemy.y, coverTarget.x, coverTarget.y) < 18
      || !hasSight;
    if (needsNewTarget) {
      enemy.coverCheckCd = 0.35;
      enemy.coverTarget = hasSight ? findEnemyCoverTarget(enemy, preferredRange) : null;
    }
    if (!enemy.coverTarget) return false;
    const dx = enemy.coverTarget.x - enemy.x;
    const dy = enemy.coverTarget.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance < 16) {
      enemy.vx *= 0.8;
      enemy.vy *= 0.8;
      return true;
    }
    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, accel, dt);
    return true;
  }

  function getMiniBossSpawnChance(roomType = 'combat') {
    if (floor < 5) return 0;
    const difficulty = getDifficultyDef();
    const baseChance = clamp(0.08 + (floor - 5) * 0.02, 0.08, 0.34);
    const scaledChance = baseChance * difficulty.miniBossChanceMultiplier;
    if (roomType === 'ladder') return Math.min(0.95, scaledChance * 3);
    return Math.min(0.8, scaledChance);
  }

  function getWaveCount(baseOffset) {
    const difficulty = getDifficultyDef();
    const challengeBonus = isChallengeActive('swarm_rooms') ? 2 : 0;
    return baseOffset + floor + difficulty.waveBonus + challengeBonus + irand(0, 1, 'encounter');
  }

  function rollEnemyType() {
    const bonus = getDifficultyDef().roomWeightBonus;
    const roll = nextRandom('encounter');
    if (floor >= 7 && roll > 0.9 - bonus * 0.92) return 'machine_gunner';
    if (roll > 0.84 - bonus * 0.9) return 'golem';
    if (roll > 0.68 - bonus * 0.82) return 'sniper';
    if (roll > 0.5 - bonus * 0.68) return 'knave';
    if (roll > 0.32 - bonus * 0.54) return 'cult_mage';
    if (roll > 0.16 - bonus * 0.4) return 'charger';
    if (roll > 0.08 - bonus * 0.24) return 'laser';
    return 'hunter';
  }

  function getFloorBossType() {
    return floor <= 3 ? 'queen_cult' : floor <= 6 ? 'bulk_golem' : 'artificer_knave';
  }

  function rollChallengeTrialType() {
    const pool = CHALLENGE_TRIAL_TYPES.slice();
    if (floor <= 2) return pool[irand(0, 2, 'world')];
    if (floor <= 4) return pool[irand(0, 4, 'world')];
    return pool[irand(0, pool.length - 1, 'world')];
  }

  function getChallengeTrialLabel(type) {
    if (type === 'mirror') return 'MIRROR';
    if (type === 'stillness') return 'STILL';
    if (type === 'bomb') return 'BOMB';
    if (type === 'survival') return 'SURVIVE';
    if (type === 'runes') return 'RUNES';
    if (type === 'storm') return 'STORM';
    return 'TRIAL';
  }

  function buildWavePlan(count, roomType = 'combat') {
    if (floor < 4) {
      return Array.from({ length: count }, () => rollEnemyType());
    }

    const squads = [
      ['hunter', 'hunter', 'charger'],
      ['hunter', 'laser', 'shield_unit'],
      ['golem', 'healer', 'hunter'],
      ['knave', 'charger', 'healer'],
      ['sniper', 'shield_unit', 'hunter'],
      ['cult_mage', 'summoner', 'hunter'],
    ];
    if (floor >= 7) {
      squads.push(
        ['machine_gunner', 'shield_unit', 'hunter'],
        ['machine_gunner', 'healer', 'charger'],
        ['sniper', 'machine_gunner', 'hunter'],
      );
    }
    const plan = [];
    let safety = 0;
    while (plan.length < count && safety < 12) {
      safety += 1;
      const squad = squads[irand(0, squads.length - 1, 'encounter')];
      squad.forEach(type => {
        if (plan.length < count) plan.push(type);
      });
    }

    if (roomType === 'ladder' && !plan.includes('shield_unit') && count >= 3) {
      plan[Math.max(1, count - 2)] = 'shield_unit';
    }

    if (count >= 5 && !plan.includes('healer')) {
      plan[count - 2] = 'healer';
    }

    if (count >= 6 && !plan.includes('summoner') && nextRandom('encounter') < 0.55) {
      plan[count - 3] = 'summoner';
    }

    if (count >= 6 && roomType === 'combat' && floor >= 4 && nextRandom('encounter') < 0.22) {
      plan[count - 1] = 'boss_spawner';
    }

    return plan.slice(0, count);
  }

  function spawnMiniBoss(roomType = 'combat') {
    const chance = getMiniBossSpawnChance(roomType);
    if (chance <= 0 || nextRandom('encounter') > chance) return;

    const pool = roomType === 'ladder'
      ? ['golem', 'knave', 'cult_mage', 'sniper']
      : ['knave', 'cult_mage', 'sniper', 'golem'];
    const type = pool[irand(0, pool.length - 1, 'encounter')];
    const angle = nextRandom('encounter') * Math.PI * 2;
    const radius = 120 + nextRandom('encounter') * 180;
    const x = clamp(ROOM_W / 2 + Math.cos(angle) * radius, 80, ROOM_W - 80);
    const y = clamp(ROOM_H / 2 + Math.sin(angle) * radius, 80, ROOM_H - 80);
    const safeSpawn = findSafeEnemySpawnPoint(x, y, 18);
    if (!safeSpawn) return;

    const miniBoss = spawnEnemy(type, safeSpawn.x, safeSpawn.y, canSpawnEliteEnemies());
    miniBoss.hp = Math.round(miniBoss.hp * 1.9);
    miniBoss.speed *= 0.94;
    miniBoss.r = Math.round(miniBoss.r * 1.08);
    miniBoss.miniBoss = true;
    particles.push({ x: miniBoss.x, y: miniBoss.y - 26, life: 0.7, text: 'MINI BOSS', c: '#ffb347' });
  }

  function spawnWave(count, roomType = 'combat') {
    const plan = buildWavePlan(count, roomType);
    for (let index = 0; index < plan.length; index += 1) {
      const type = plan[index] || rollEnemyType();
      const eliteChance = getDifficultyDef().eliteChance + (isChallengeActive('elite_hunt') ? 0.18 : 0);
      const eliteRoll = canSpawnEliteEnemies() && nextRandom('encounter') < Math.min(0.85, eliteChance);
      const angle = nextRandom('encounter') * Math.PI * 2;
      const radius = 140 + nextRandom('encounter') * 170;
      const preferredX = clamp(ROOM_W / 2 + Math.cos(angle) * radius, 90, ROOM_W - 90);
      const preferredY = clamp(ROOM_H / 2 + Math.sin(angle) * radius, 90, ROOM_H - 90);
      const safeSpawn = findSafeEnemySpawnPoint(preferredX, preferredY, 15)
        || findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2, 15);
      if (!safeSpawn) continue;
      spawnEnemy(type, safeSpawn.x, safeSpawn.y, eliteRoll);
    }
    spawnMiniBoss(roomType);
  }

  function spawnFloorBoss() {
    const bossType = getFloorBossType();
    const safeSpawn = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2 - 40, 15);
    if (!safeSpawn) return null;
    const boss = spawnEnemy(bossType, safeSpawn.x, safeSpawn.y, false);
    const line = BOSS_OPENING_DIALOGUE[bossType];
    if (boss && line) sayOverEntity(boss, line);
    return boss;
  }

  function getEnemyDifficultyMultiplier() {
    const gameMinutes = gameElapsedTime / 60;
    return 1 + gameMinutes * floor * 0.15;
  }

  function canSpawnEliteEnemies() {
    return floor >= getDifficultyDef().eliteFloor && floor <= 10;
  }

  function rollEliteInventory() {
    const inventory = {};
    const pool = ELITE_INVENTORY_POOL.slice();
    shuffle(pool, 'encounter');
    const slots = irand(1, 3, 'encounter');
    for (let index = 0; index < slots; index += 1) {
      const key = pool[index];
      if (!key) continue;
      inventory[key] = 1 + (nextRandom('encounter') < 0.28 ? 1 : 0);
    }
    return inventory;
  }

  function rollBlessedEliteInventory() {
    const inventory = {};
    const rolls = irand(10, 15, 'encounter');
    for (let index = 0; index < rolls; index += 1) {
      const key = WHITE_ITEM_POOL[irand(0, WHITE_ITEM_POOL.length - 1, 'encounter')];
      if (key) inventory[key] = Number(inventory[key] || 0) + 1;
    }
    return inventory;
  }

  function rollEliteTypes() {
    const pool = ['burning', 'bleeding', 'giant', 'blessed', 'lasered'];
    const shuffled = shuffle(pool, 'encounter');
    const count = nextRandom('encounter') < 0.18 ? 3 : nextRandom('encounter') < 0.58 ? 2 : 1;
    return shuffled.slice(0, count);
  }

  function applyEliteInventory(enemy, inventoryOverride = null) {
    const inventory = inventoryOverride || rollEliteInventory();
    enemy.eliteInventory = inventory;

    const stacks = key => Number(inventory[key] || 0);
    const hpMult = 1 + stacks('insurance') * 0.16 + stacks('turtle_shell') * 0.1 + stacks('iron_lung') * 0.24;
    const dmgMult = 1 + stacks('neo_knife') * 0.08 + stacks('orb_of_blood') * 0.14 + stacks('crit_charm') * 0.12 + stacks('oracles_lens') * 0.2;
    const speedMult = 1 + stacks('attack_servo') * 0.08 + stacks('turtle_shell') * 0.04;
    const attackCdMult = Math.max(0.52, 1 - stacks('charged_adapter') * 0.1);

    enemy.hp = Math.round(enemy.hp * hpMult);
    enemy.max = enemy.hp;
    enemy.dmg = Math.round(enemy.dmg * dmgMult);
    enemy.speed *= speedMult;
    enemy.attackCd *= attackCdMult;
    enemy.r = Math.round(enemy.r * (1 + stacks('iron_lung') * 0.04));
  }

  function applyEliteTypes(enemy) {
    if (!enemy?.elite) return;
    enemy.eliteTypes = Array.isArray(enemy.eliteTypes) && enemy.eliteTypes.length ? enemy.eliteTypes : rollEliteTypes();

    if (enemy.eliteTypes.includes('blessed')) {
      applyEliteInventory(enemy, rollBlessedEliteInventory());
    } else {
      applyEliteInventory(enemy);
    }

    if (enemy.eliteTypes.includes('giant')) {
      enemy.max = Math.round(enemy.max * 5);
      enemy.hp = enemy.max;
      enemy.r = Math.round(enemy.r * 1.65);
      enemy.speed *= 0.84;
      enemy.dmg = Math.round(enemy.dmg * 1.18);
    }

    if (enemy.eliteTypes.includes('burning')) {
      enemy.fireImmune = true;
      enemy.burningTick = rand(0.9, 0.25, 'encounter');
    }
    if (enemy.eliteTypes.includes('bleeding')) {
      enemy.bleedImmune = true;
      enemy.bleedingTick = rand(1.1, 0.35, 'encounter');
    }
    if (enemy.eliteTypes.includes('lasered')) {
      enemy.eliteLaserCd = rand(1.9, 0.8, 'encounter');
      enemy.eliteLaserModeIndex = 0;
    }
  }

  function scaleEnemyStats(baseStats, type) {
    const result = { ...baseStats };
    const difficulty = getDifficultyDef();
    const gameMinutes = gameElapsedTime / 60;
    const loopNumber = Math.max(1, Math.floor((floor - 1) / 10) + 1);
    const floorInLoop = ((floor - 1) % 10) + 1;
    const floorMultiplier = 1 + (floorInLoop - 1) * ENEMY_SCALING.floor;
    const loopMultiplier = 1 + (loopNumber - 1) * ENEMY_SCALING.loop;
    const timerMultiplier = 1 + gameMinutes * ENEMY_SCALING.minute;
    const difficultyMultiplier = isBossType(type) ? difficulty.bossStatMultiplier : difficulty.statMultiplier;
    const combinedScaleFactor = floorMultiplier * loopMultiplier * timerMultiplier * difficultyMultiplier;
    result.hp = Math.round(result.hp * combinedScaleFactor);
    result.max = result.hp;
    result.dmg = Math.round(result.dmg * combinedScaleFactor);
    result.speed *= combinedScaleFactor * difficulty.speedMultiplier;
    return result;
  }

  function spawnEnemy(type, x, y, elite = false) {
    const eliteAllowed = !!elite && canSpawnEliteEnemies();
    const base = {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 15,
      hp: 52,
      max: 52,
      speed: 96,
      dmg: 12,
      elite: eliteAllowed,
      stun: 0,
      inv: 0,
      attackCd: rand(0.2, 0.9, 'encounter'),
      statuses: createStatusMap(),
      windup: 0,
      beamTime: 0,
      beamTick: 0,
      beamAngle: 0,
      dashTime: 0,
      dashAngle: 0,
      dashHit: false,
      swingTime: 0,
      summonCd: 0,
      supportCd: 0,
      barrier: 0,
      bossSpawnTimer: 0,
      bossSpawnWarnAt: 0,
      aoeTime: 0,
      phase: 1,
      splitReady: false,
      spawnedFromBulk: false,
      bleedImmune: false,
      fireImmune: false,
      poisonImmune: false,
      dark_drainImmune: false,
      state: 'idle',
      spawnT: 0.72,
    };

    if (type === 'god') {
      base.r = 34;
      base.hp = 920;
      base.max = 920;
      base.speed = 108;
      base.dmg = 18;
      base.attackCd = 1.4;
      base.beamRange = 620;
      base.sweepDir = 1;
      base.sweepSpeed = 0;
      base.phase = 1;
      base.rebirthUsed = false;
      base.phase3Triggered = false;
      base.phase4Triggered = false;
      base.phase5Triggered = false;
      base.novaCd = 2.4;
      base.judgementCd = 4.2;
    } else if (type === 'cult_mage') {
      base.r = 17;
      base.hp = 84;
      base.max = 84;
      base.speed = 58;
      base.dmg = 18;
      base.attackCd = 1.8;
    } else if (type === 'knave') {
      base.r = 16;
      base.hp = 68;
      base.max = 68;
      base.speed = 118;
      base.dmg = 14;
      base.attackCd = 1.3;
    } else if (type === 'sniper') {
      base.r = 15;
      base.hp = 58;
      base.max = 58;
      base.speed = 104;
      base.dmg = 12;
      base.attackCd = 1.55;
    } else if (type === 'machine_gunner') {
      base.r = 17;
      base.hp = 96;
      base.max = 96;
      base.speed = 112;
      base.dmg = 8;
      base.attackCd = 1.15;
      base.burstShots = 0;
      base.burstDelay = 0;
      base.burstAngle = 0;
    } else if (type === 'golem') {
      base.r = 20;
      base.hp = 132;
      base.max = 132;
      base.speed = 70;
      base.dmg = 18;
      base.attackCd = 1.9;
      base.bleedImmune = true;
    } else if (type === 'cult_follower') {
      base.r = 12;
      base.hp = 34;
      base.max = 34;
      base.speed = 138;
      base.dmg = 8;
      base.attackCd = 0.85;
    } else if (type === 'summoner') {
      base.r = 18;
      base.hp = 120;
      base.max = 120;
      base.speed = 66;
      base.dmg = 12;
      base.attackCd = 1.5;
      base.summonCd = 4.4;
    } else if (type === 'shield_unit') {
      base.r = 22;
      base.hp = 210;
      base.max = 210;
      base.speed = 52;
      base.dmg = 10;
      base.attackCd = 1.4;
      base.bleedImmune = true;
      base.supportCd = 2.8;
    } else if (type === 'healer') {
      base.r = 19;
      base.hp = floor >= 4 ? 260 : 150;
      base.max = base.hp;
      base.speed = 64;
      base.dmg = 10;
      base.attackCd = 1.2;
      base.supportCd = floor >= 4 ? 2.2 : 3;
    } else if (type === 'boss_spawner') {
      base.r = 24;
      base.hp = 300;
      base.max = 300;
      base.speed = 42;
      base.dmg = 8;
      base.attackCd = 1.8;
      base.bleedImmune = true;
      base.bossSpawnTimer = 30;
      base.bossSpawnWarnAt = 30;
    } else if (type === 'queen_cult') {
      base.r = 38;
      base.hp = 760;
      base.max = 760;
      base.speed = 96;
      base.dmg = 20;
      base.attackCd = 1.2;
      base.summonCd = 2.4;
    } else if (type === 'bulk_golem') {
      base.r = 58;
      base.hp = 1280;
      base.max = 1280;
      base.speed = 74;
      base.dmg = 26;
      base.attackCd = 1.6;
      base.bleedImmune = true;
      base.splitReady = true;
      base.aoeTime = 3;
      base.jumpCd = 1.2;
    } else if (type === 'artificer_knave') {
      base.r = 30;
      base.hp = 1880;
      base.max = 1880;
      base.speed = 124;
      base.dmg = 20;
      base.attackCd = 1.2;
      base.phase = 1;
    } else {
      if (eliteAllowed) {
        base.hp = Math.round(base.hp * 1.35);
        base.max = base.hp;
        base.speed *= 1.08;
        base.r = 17;
      }
    }

    const scaled = scaleEnemyStats(base, type);
    base.hp = scaled.hp;
    base.max = scaled.max;
    base.dmg = scaled.dmg;
    base.speed = scaled.speed;

    const difficultyTuning = getEnemyDifficultyTuning();
    if (!isBossType(type) && floor >= 4) {
      const barrierChance = type === 'shield_unit'
        ? 1
        : (type === 'healer' || type === 'summoner' || type === 'laser' || type === 'sniper' || type === 'machine_gunner')
          ? 0.12 * difficultyTuning.supportPower
          : 0.05 * Math.max(1, difficultyTuning.supportPower - 0.02);
      if (nextRandom('encounter') < barrierChance) {
        base.barrier = Math.round(base.max * (type === 'shield_unit' ? 0.24 : 0.12 * difficultyTuning.supportPower));
      }
    }

    if (isBossType(type)) {
      base.hp = Math.round(base.hp * 2);
      base.max = base.hp;
    }

    if (type === 'god') {
      base.hp = Math.round(base.hp * 5);
      base.max = base.hp;
      base.dmg = Math.round(base.dmg * 5);
      base.speed *= 1.12;
    }

    if (base.elite) applyEliteTypes(base);

    enemies.push(base);
    return base;
  }

  function spawnGodBoss() {
    const existing = enemies.find(enemy => enemy.type === 'god');
    if (existing) return existing;
    const safeSpawn = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2 - 40, 15);
    if (!safeSpawn) return null;
    return spawnEnemy('god', safeSpawn.x, safeSpawn.y, false);
  }

  function playGodDialogue(phase) {
    const line = GOD_PHASE_DIALOGUE[phase];
    if (!line) return false;
    if (hasLegacy('god_memory') && (metaProgress.godsKilled || 0) > 0) return false;
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    clearGameplayInput();
    return uiController.playDialogue([{ speaker: 'GOD', text: line }], { returnState: 'play' });
  }

  function sayOverEntity(entity, text, options = {}) {
    if (!entity || !text) return null;
    return uiController.sayAtWorldAnchor({
      anchor: () => enemies.includes(entity) ? { x: entity.x, y: entity.y } : null,
      speaker: options.speaker || getBossLabel(entity.type),
      text,
      offsetY: options.offsetY ?? (entity.r ? entity.r + 26 : 56),
      tone: options.tone || 'boss',
      typeSpeed: options.typeSpeed,
      holdTime: options.holdTime,
    });
  }

  function sayAtPosition(x, y, text, options = {}) {
    if (!text) return null;
    return uiController.sayAtWorldAnchor({
      anchor: () => ({ x, y }),
      speaker: options.speaker || '',
      text,
      offsetY: options.offsetY ?? 54,
      tone: options.tone || 'warning',
      typeSpeed: options.typeSpeed,
      holdTime: options.holdTime,
    });
  }

  function getMirrorChampionStats() {
    const character = getCharacterDef();
    const attackSpeed = getAttackSpeedValue();
    const meleeDamage = Math.round((ATTACKS.melee.damage + (player?.attackPower || 0)) * (character.damageMultiplier || 1));
    const beamDamage = Math.round(ATTACKS.laser.damage + (player?.attackPower || 0) * 0.45);
    const smashDamage = Math.round(ATTACKS.smash.damage + (player?.attackPower || 0) * 0.9);
    return {
      hp: Math.max(90, Math.round(player.maxHp)),
      dmg: Math.max(18, meleeDamage),
      beamDamage: Math.max(10, beamDamage),
      smashDamage: Math.max(20, smashDamage),
      speed: Math.max(108, Math.round(176 + attackSpeed * 34)),
      attackCd: Math.max(0.22, 0.56 / attackSpeed),
      attackSpeed,
      spriteKey: player.character,
    };
  }

  function spawnMirrorChampion() {
    const safeSpawn = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2 - 150, 18);
    if (!safeSpawn) return null;
    const stats = getMirrorChampionStats();
    const mirror = {
      type: 'mirror_knight',
      x: safeSpawn.x,
      y: safeSpawn.y,
      vx: 0,
      vy: 0,
      r: 16,
      hp: stats.hp,
      max: stats.hp,
      speed: stats.speed,
      dmg: stats.dmg,
      beamDamage: stats.beamDamage,
      smashDamage: stats.smashDamage,
      elite: false,
      stun: 0,
      inv: 0,
      attackCd: stats.attackCd,
      statuses: createStatusMap(),
      windup: 0,
      beamTime: 0,
      beamTick: 0,
      beamAngle: 0,
      dashTime: 0,
      dashAngle: 0,
      dashHit: false,
      swingTime: 0,
      summonCd: 0,
      supportCd: 0,
      barrier: 0,
      bossSpawnTimer: 0,
      bossSpawnWarnAt: 0,
      aoeTime: 0,
      phase: 1,
      splitReady: false,
      spawnedFromBulk: false,
      bleedImmune: false,
      fireImmune: false,
      poisonImmune: false,
      dark_drainImmune: false,
      state: 'idle',
      spriteKey: stats.spriteKey,
      mirrorLaserCd: Math.max(1.4, 4.2 / stats.attackSpeed),
      mirrorSmashCd: Math.max(2.2, 5.4 / stats.attackSpeed),
      mirrorDashCd: Math.max(0.9, 1.8 / stats.attackSpeed),
    };
    enemies.push(mirror);
    particles.push({ x: mirror.x, y: mirror.y - 28, life: 1, text: 'MIRROR CHAMPION', c: '#d7f6ff' });
    sayOverEntity(mirror, 'I know every move you make.', { speaker: 'MIRROR', tone: 'mirror', holdTime: 1.9 });
    return mirror;
  }

  function spawnChallengeStarter(room) {
    if (!room || room.type !== 'challenge') return;
    const existing = pickups.find(pickup => pickup?.type === 'challengeStarter');
    if (existing) return;
    pickups.push({
      x: ROOM_W / 2,
      y: ROOM_H / 2,
      type: 'challengeStarter',
      trial: room.challengeType || 'mirror',
    });
  }

  function spawnChallengeBombs(room) {
    const slots = [
      [-90, -90], [0, -90], [90, -90],
      [-90, 0], [0, 0], [90, 0],
      [-90, 90], [0, 90], [90, 90],
    ];
    const safeIndex = irand(0, slots.length - 1, 'loot');
    room.challengeData = { safeBombIndex: safeIndex };
    slots.forEach(([ox, oy], index) => {
      pickups.push({
        x: ROOM_W / 2 + ox,
        y: ROOM_H / 2 + oy,
        type: 'challengeBomb',
        safe: index === safeIndex,
      });
    });
  }

  function spawnChallengeRunes(room) {
    const count = 5;
    room.challengeData = { runesLeft: count };
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + nextRandom('world') * 0.18;
      const driftAngle = angle + Math.PI / 2 + rand(-0.55, 0.55, 'world');
      const driftSpeed = rand(82, 56, 'world');
      pickups.push({
        x: ROOM_W / 2 + Math.cos(angle) * 160,
        y: ROOM_H / 2 + Math.sin(angle) * 160,
        type: 'challengeRune',
        vx: Math.cos(driftAngle) * driftSpeed,
        vy: Math.sin(driftAngle) * driftSpeed,
      });
    }
  }

  function spawnTrialEnemyWave(count = 1) {
    const pool = floor >= 6
      ? ['hunter', 'laser', 'charger', 'knave']
      : ['hunter', 'laser', 'charger'];
    for (let index = 0; index < count; index += 1) {
      const angle = nextRandom('encounter') * Math.PI * 2;
      const radius = 170 + nextRandom('encounter') * 90;
      const safeSpawn = findSafeEnemySpawnPoint(ROOM_W / 2 + Math.cos(angle) * radius, ROOM_H / 2 + Math.sin(angle) * radius, 15);
      if (!safeSpawn) continue;
      const type = pool[irand(0, pool.length - 1, 'encounter')];
      spawnEnemy(type, safeSpawn.x, safeSpawn.y, false);
    }
  }

  function beginChallengeTrial(room) {
    if (!room || room.type !== 'challenge' || room.challengeStarted) return;
    room.challengeStarted = true;
    room.challengeTick = 0;
    room.challengeData = {};
    room.challengeFailed = false;
    pickups = pickups.filter(pickup => pickup?.type !== 'challengeStarter');
    const type = room.challengeType || 'mirror';
    if (type === 'mirror') {
      spawnMirrorChampion();
    } else if (type === 'stillness') {
      room.challengeTimer = 10;
      room.challengeData.maxTimer = 10;
      room.challengeData.anchorX = player.x;
      room.challengeData.anchorY = player.y;
      room.challengeData.graceTimer = 2;
      room.challengeData.warnTick = 0;
      sayAtPosition(ROOM_W / 2, ROOM_H / 2, 'Stand still or lose everything.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'bomb') {
      spawnChallengeBombs(room);
      sayAtPosition(ROOM_W / 2, ROOM_H / 2, 'Choose wrong and you get nothing.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'survival') {
      room.challengeTimer = 20;
      room.challengeTick = 0.9;
      spawnTrialEnemyWave(2);
      sayAtPosition(ROOM_W / 2, ROOM_H / 2, 'Live through it.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'runes') {
      spawnChallengeRunes(room);
      room.challengeTimer = 30;
      room.challengeData.maxTimer = 30;
      sayAtPosition(ROOM_W / 2, ROOM_H / 2, 'Claim every rune.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'storm') {
      room.challengeTimer = 18;
      room.challengeTick = 0.35;
      sayAtPosition(ROOM_W / 2, ROOM_H / 2, 'Do not stop moving.', { speaker: 'TRIAL', tone: 'warning' });
    }
    particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 46, life: 0.95, text: getChallengeTrialLabel(type), c: '#d7f6ff' });
  }

  function rollChallengeWeapon() {
    const owned = new Set(Object.keys(player?.ownedWeapons || {}).filter(k => player?.ownedWeapons?.[k]));
    const pool = [...WHITE_WEAPON_POOL];
    if (floor >= 4) pool.push(...PURPLE_WEAPON_POOL);
    if (floor >= 7) pool.push(...RED_WEAPON_POOL);
    const available = pool.filter(k => !owned.has(k));
    if (available.length === 0) return null;
    return available[Math.floor(rng() * available.length)];
  }

  function spawnChallengeReward(text = 'TRIAL CLEARED') {
    if (!currentRoom || currentRoom.type !== 'challenge' || currentRoom.challengeRewardSpawned) return;
    currentRoom.challengeRewardSpawned = true;
    pickups = pickups.filter(pickup => !['challengeBomb', 'challengeRune', 'challengeStarter'].includes(pickup?.type));
    pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 16, type: 'item', key: rollItemDrop({ elite: true, stream: 'loot' }) });
    pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2 + 36, type: 'potion' });
    dropCoins(ROOM_W / 2, ROOM_H / 2 + 4, 75 + floor * 15);
    grantXp(28 + floor * 5);
    const weaponKey = rollChallengeWeapon();
    if (weaponKey && player) {
      player.ownedWeapons[weaponKey] = true;
      const wName = WEAPON_DEFS[weaponKey]?.name || weaponKey;
      particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 68, life: 1.4, text: `+ ${wName}`, c: '#ffd700' });
    }
    particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 52, life: 1.05, text, c: '#d7f6ff' });
  }

  function completeChallengeTrial(text = 'TRIAL CLEARED') {
    if (!currentRoom || currentRoom.type !== 'challenge') return;
    currentRoom.cleared = true;
    currentRoom.challengeFailed = false;
    currentRoom.challengeTimer = 0;
    currentRoom.challengeTick = 0;
    currentRoom.challengeData = {};
    spawnChallengeReward(text);
    updateObjective();
    scheduleRunSave();
  }

  function failChallengeTrial(text = 'TRIAL FAILED') {
    if (!currentRoom || currentRoom.type !== 'challenge') return;
    currentRoom.cleared = true;
    currentRoom.challengeFailed = true;
    currentRoom.challengeRewardSpawned = true;
    currentRoom.challengeTimer = 0;
    currentRoom.challengeTick = 0;
    currentRoom.challengeData = {};
    pickups = pickups.filter(pickup => !['challengeBomb', 'challengeRune', 'challengeStarter'].includes(pickup?.type));
    particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 52, life: 1.05, text, c: '#ff8b98' });
    updateObjective();
    scheduleRunSave();
  }

  function isBossType(type) {
    return BOSS_TYPES.has(type);
  }

  function migratePlayerData(source) {
    const playerData = source || createDefaultPlayer();
    playerData.character = playerData.character || 'thorn_knight';
    if (!playerData.items) {
      const legacy = playerData.relics || {};
      playerData.items = {
        neo_knife: legacy.thorn ? 1 : 0,
        orb_of_blood: legacy.hemo ? 1 : 0,
        hemes_scarf: legacy.leech ? 1 : 0,
      };
    }
    delete playerData.relics;
    if (playerData.items && typeof playerData.items === 'object' && Number(playerData.items.scholors_cap || 0) > 0) {
      playerData.items.scholar_cap = Number(playerData.items.scholar_cap || 0) + Number(playerData.items.scholors_cap || 0);
      delete playerData.items.scholors_cap;
    }
    ITEM_KEYS.forEach(key => {
      playerData.items[key] = Number(playerData.items[key] || 0);
    });
    playerData.level = Number(playerData.level || 1);
    playerData.xp = Number(playerData.xp || 0);
    playerData.xpToNext = Number(playerData.xpToNext || 20);
    playerData.attackPower = Number(playerData.attackPower || 0);
    playerData.attackSpeed = Number(playerData.attackSpeed || 1);
    playerData.roomDamageTaken = Number(playerData.roomDamageTaken || 0);
    playerData.dashTime = Number(playerData.dashTime || 0);
    playerData.dashX = Number(playerData.dashX || 0);
    playerData.dashY = Number(playerData.dashY || 0);
    playerData.cowardsWayTime = Number(playerData.cowardsWayTime || 0);
    playerData.lavaWalkTime = Number(playerData.lavaWalkTime || 0);
    playerData.lavaTrailTick = Number(playerData.lavaTrailTick || 0);
    playerData.princessFlightTime = Number(playerData.princessFlightTime || 0);
    ensureStatuses(playerData);
    if (!playerData.equippedMoves || typeof playerData.equippedMoves !== 'object') {
      playerData.equippedMoves = getDefaultMovesForCharacter(playerData.character);
    }
    if (!playerData.ownedMoves || typeof playerData.ownedMoves !== 'object') {
      playerData.ownedMoves = {};
    }
    if (!playerData.ownedWeapons || typeof playerData.ownedWeapons !== 'object') {
      playerData.ownedWeapons = {};
    }
    WEAPON_KEYS.forEach(key => {
      playerData.ownedWeapons[key] = !!playerData.ownedWeapons[key];
    });
    if (!WEAPON_DEFS[playerData.equippedWeapon]) playerData.equippedWeapon = '';
    const hasOwnedWeapons = WEAPON_KEYS.some(key => !!playerData.ownedWeapons[key]);
    if (!hasOwnedWeapons && !playerData.equippedWeapon) {
      const defaultWeapon = getDefaultWeaponForCharacter(playerData.character);
      if (defaultWeapon) {
        playerData.ownedWeapons[defaultWeapon] = true;
        playerData.equippedWeapon = defaultWeapon;
      }
    }
    if (playerData.equippedWeapon) playerData.ownedWeapons[playerData.equippedWeapon] = true;
    playerData.weaponCooldown = Number(playerData.weaponCooldown || 0);
    playerData.blockActive = !!playerData.blockActive;
    playerData.blockTimer = Number(playerData.blockTimer || 0);
    playerData.fleeceTick = Number(playerData.fleeceTick || 0);
    playerData.weaponBeamTime = Number(playerData.weaponBeamTime || 0);
    playerData.weaponBeamTick = Number(playerData.weaponBeamTick || 0);
    if (!playerData.anvilUpgrades || typeof playerData.anvilUpgrades !== 'object') {
      playerData.anvilUpgrades = { weapon: {}, move: {} };
    }
    if (!playerData.anvilUpgrades.weapon || typeof playerData.anvilUpgrades.weapon !== 'object') playerData.anvilUpgrades.weapon = {};
    if (!playerData.anvilUpgrades.move   || typeof playerData.anvilUpgrades.move   !== 'object') playerData.anvilUpgrades.move   = {};
    MOVE_SLOTS.forEach(slot => {
      const moveKey = playerData.equippedMoves[slot];
      if (!MOVE_DEFS[moveKey] || MOVE_DEFS[moveKey].slot !== slot || !isMoveAllowedForCharacter(moveKey, playerData.character)) {
        playerData.equippedMoves[slot] = getDefaultMovesForCharacter(playerData.character)[slot];
      }
      playerData.ownedMoves[playerData.equippedMoves[slot]] = true;
    });
    Object.keys(playerData.ownedMoves).forEach(moveKey => {
      if (!isMoveAllowedForCharacter(moveKey, playerData.character)) delete playerData.ownedMoves[moveKey];
    });
    playerData.insuranceActive = !!playerData.insuranceActive;
    playerData.insuranceChargeKills = Number(playerData.insuranceChargeKills || 0);
    playerData.insuranceReady = playerData.insuranceReady !== false;
    playerData.keenEyeChargeKills = Number(playerData.keenEyeChargeKills || 0);
    playerData.keenEyeReady = !!playerData.keenEyeReady;
    playerData.keenEyeBuffTime = Number(playerData.keenEyeBuffTime || 0);
    playerData.chronoSpringChargeKills = Number(playerData.chronoSpringChargeKills || 0);
    playerData.chronoSpringReady = !!playerData.chronoSpringReady;
    playerData.chronoSpringBuffTime = Number(playerData.chronoSpringBuffTime || 0);
    playerData.critCharmBuffTime = Number(playerData.critCharmBuffTime || 0);
    playerData.escapeChargeKills = Number(playerData.escapeChargeKills || 0);
    playerData.escapeReady = playerData.escapeReady !== false;
    return playerData;
  }

  function getCharacterDef() {
    return CHARACTER_DEFS[player?.character || chosenCharacter] || CHARACTER_DEFS.thorn_knight;
  }

  function getUiCharacterKey() {
    return player?.character || chosenCharacter;
  }

  function syncCharacterUiTheme() {
    document.documentElement.classList.toggle('princess-ui', getUiCharacterKey() === 'princess');
  }

  function getDefaultWeaponForCharacter(characterKey) {
    if (characterKey === 'princess') return '';
    if (characterKey === 'metao') return 'metao_fire_staff';
    if (characterKey === 'granialla') return 'granillia_lightning_spear';
    return 'thorns_bleed_blade';
  }

  function getDefaultMovesForCharacter(characterKey) {
    if (characterKey === 'princess') {
      return { melee: 'narwal_fight', laser: 'love_beam', smash: 'kicky_kick', dash: 'flying_unhitable' };
    }
    if (characterKey === 'metao') {
      return { melee: 'fire_balls', laser: 'power_disks', smash: 'chaos_burst', dash: 'warp' };
    }
    if (characterKey === 'granialla') {
      return { melee: 'smite', laser: 'blade_justice', smash: 'healing_zone', dash: 'zip_lightning' };
    }
    return { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' };
  }

  function isMoveAllowedForCharacter(moveKey, characterKey = player?.character || chosenCharacter) {
    const def = MOVE_DEFS[moveKey];
    if (!def) return false;
    return !def.exclusiveCharacter || def.exclusiveCharacter === characterKey;
  }

  function getItemCount(key) {
    return Number(player?.items?.[key] || 0);
  }

  function getChargeRequirement(baseRequirement) {
    return Math.max(1, baseRequirement - getItemCount('charged_adapter'));
  }

  function getKeenEyeCritBonus() {
    return getItemCount('keen_eye') * 0.1;
  }

  function getChronoSpringAttackSpeedBonus() {
    return getItemCount('chrono_spring') * 0.16;
  }

  function grantCritCharmBuff() {
    if (!player || getItemCount('crit_charm') <= 0) return;
    player.critCharmBuffTime = Math.max(Number(player.critCharmBuffTime || 0), 2.2);
  }

  function triggerKeenEyeBuff() {
    if (!player || getItemCount('keen_eye') <= 0) return;
    player.keenEyeBuffTime = Math.max(Number(player.keenEyeBuffTime || 0), 7);
    particles.push({ x: player.x, y: player.y - 24, life: 0.7, text: 'KEEN EYE', c: '#f8fdff' });
  }

  function triggerChronoSpringBuff() {
    if (!player || getItemCount('chrono_spring') <= 0) return;
    player.chronoSpringBuffTime = Math.max(Number(player.chronoSpringBuffTime || 0), 6);
    particles.push({ x: player.x, y: player.y - 38, life: 0.7, text: 'CHRONO', c: '#cfeeff' });
  }

  function getItemStats() {
    const neoKnife = getItemCount('neo_knife');
    const orbOfBlood = getItemCount('orb_of_blood');
    const hemesScarf = getItemCount('hemes_scarf');
    const attackServo = getItemCount('attack_servo');
    const scholarSeal = getItemCount('scholar_seal');
    const scholarCap = getItemCount('scholar_cap');
    const bandaid = getItemCount('bandaid');
    const pushMan = getItemCount('push_man');
    const explosiveJelly = getItemCount('explosive_jelly');
    const dragonOrb = getItemCount('dragon_orb');
    const turtleShell = getItemCount('turtle_shell');
    const shieldOfAegis = getItemCount('shield_of_aegis');
    const pendantOfKronos = getItemCount('pendant_of_kronos');
    const oracleLens = getItemCount('oracles_lens') > 0;
    const critCharmBonus = Number(player?.critCharmBuffTime || 0) > 0 ? getItemCount('crit_charm') * 0.04 : 0;
    const keenEyeBonus = Number(player?.keenEyeBuffTime || 0) > 0 ? getKeenEyeCritBonus() : 0;
    const chronoSpringBonus = Number(player?.chronoSpringBuffTime || 0) > 0 ? getChronoSpringAttackSpeedBonus() : 0;
    const godItemStacks = ITEM_KEYS.reduce((total, key) => {
      if (ITEM_DEFS[key]?.rarity !== 'god') return total;
      return total + getItemCount(key);
    }, 0);
    let critChance = critCharmBonus + keenEyeBonus + pendantOfKronos * godItemStacks * 0.01;
    if (oracleLens) critChance *= 2;
    critChance = clamp(critChance, 0, 0.95);
    const damageReduction = clamp(bandaid * 0.005 + shieldOfAegis * 0.2, 0, 0.85);
    const xpProgress = clamp((player?.xpToNext || 0) > 0 ? (player?.xp || 0) / player.xpToNext : 0, 0, 1);
    return {
      bleedChance: neoKnife * 0.05,
      bleedDamageMultiplier: orbOfBlood > 0 ? 1 + orbOfBlood : 1,
      bleedHealScale: hemesScarf,
      passiveBleedStacks: hemesScarf,
      critChance,
      critMultiplier: 1.6 + (oracleLens ? critChance * 2.2 : critChance * 0.6),
      attackSpeedMultiplier: 1 + attackServo * 0.12 + chronoSpringBonus,
      moveSpeedMultiplier: 1 + turtleShell * 0.05,
      xpGainMultiplier: 1 + scholarSeal * 0.15,
      levelEdgeDamageMultiplier: 1 + scholarCap * xpProgress * 0.45,
      knockbackMultiplier: 1 + pushMan * 0.18,
      aoeRadiusMultiplier: (1 + explosiveJelly) * (player?.character === 'metao' ? 1.1 : 1),
      beamDamageMultiplier: 1 + dragonOrb * 0.35,
      beamChainTargets: dragonOrb > 0 ? Math.min(2, dragonOrb) : 0,
      beamChainDamageMultiplier: dragonOrb > 0 ? 0.6 + (dragonOrb - 1) * 0.15 : 0,
      damageReduction,
      hasIronLung: getItemCount('iron_lung') > 0,
    };
  }

  function getAttackSpeedValue() {
    const stats = getItemStats();
    return Math.max(0.2, (player?.attackSpeed || 1) * (stats.attackSpeedMultiplier || 1));
  }

  function getWizardPawStatCards() {
    const stats = getItemStats();
    return [
      { label: 'HP', value: `${Math.round(player.hp)} / ${Math.round(player.maxHp)}` },
      { label: 'Attack Power', value: `${Math.round(player.attackPower)}` },
      { label: 'Attack Speed', value: getAttackSpeedValue().toFixed(2) },
      { label: 'Crit Chance', value: `${Math.round(stats.critChance * 100)}%` },
      { label: 'Move Speed', value: `${Math.round(stats.moveSpeedMultiplier * 100)}%` },
    ];
  }

  function openWizardPawSelection() {
    wizardPawSelection = {
      picks: [],
      options: [
        { key: 'maxHp', name: 'Max HP', description: `Current ${Math.round(player.maxHp)}. Triple max HP and scale current HP with it.` },
        { key: 'attackPower', name: 'Attack Power', description: `Current ${Math.round(player.attackPower)}. Triple raw attack power.` },
        { key: 'attackSpeed', name: 'Attack Speed', description: `Current ${getAttackSpeedValue().toFixed(2)}. Triple base attack speed.` },
      ],
    };
    setWizardPawModalOpen(true);
    renderWizardPawPanel();
  }

  function renderWizardPawPanel() {
    if (!wizardPawSelection || !ui.wizardPawStats || !ui.wizardPawChoices) return;
    ui.wizardPawStats.innerHTML = getWizardPawStatCards()
      .map(stat => `<div class="wizard-paw-stat"><span class="wizard-paw-stat__label">${stat.label}</span><div class="wizard-paw-stat__value">${stat.value}</div></div>`)
      .join('');
    ui.wizardPawChoices.innerHTML = wizardPawSelection.options
      .map(option => {
        const selected = wizardPawSelection.picks.includes(option.key);
        return `<button class="wizard-paw-choice${selected ? ' is-selected' : ''}" type="button" data-stat="${option.key}">
          <span class="wizard-paw-choice__eyebrow">${selected ? 'Selected' : 'Choose'}</span>
          <h4>${option.name}</h4>
          <p>${option.description}</p>
        </button>`;
      })
      .join('');
    if (ui.wizardPawConfirm) {
      ui.wizardPawConfirm.disabled = wizardPawSelection.picks.length !== 2;
      ui.wizardPawConfirm.textContent = wizardPawSelection.picks.length === 2
        ? 'CONFIRM PICKS'
        : `CONFIRM ${wizardPawSelection.picks.length}/2`;
    }
  }

  function handleWizardPawChoiceClick(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-stat]') : null;
    const statKey = target?.dataset?.stat || '';
    if (!wizardPawSelection || !statKey) return;
    const picks = wizardPawSelection.picks;
    const index = picks.indexOf(statKey);
    if (index >= 0) picks.splice(index, 1);
    else if (picks.length < 2) picks.push(statKey);
    renderWizardPawPanel();
  }

  function applyWizardPawStat(stat) {
    if (stat === 'maxHp') {
      player.maxHp = Math.max(120, Math.round(player.maxHp * 3));
      player.hp = Math.min(player.maxHp, Math.round(player.hp * 3));
      return;
    }
    if (stat === 'attackPower') {
      player.attackPower = Math.max(3, Math.round(player.attackPower * 3));
      return;
    }
    if (stat === 'attackSpeed') {
      player.attackSpeed = Math.max(0.2, player.attackSpeed * 3);
    }
  }

  function confirmWizardPawSelection() {
    if (!wizardPawSelection || wizardPawSelection.picks.length !== 2) return;
    wizardPawSelection.picks.forEach(applyWizardPawStat);
    particles.push({ x: player.x, y: player.y - 46, life: 1, text: "WIZARD'S PAW!", c: '#ffd27d' });
    wizardPawSelection = null;
    setWizardPawModalOpen(false);
    markInventoryPanelDirty();
    renderInventoryPanel();
    updateHud();
    scheduleRunSave();
  }

  function consumeCharge(chargeType) {
    if (chargeType === 'insurance') {
      player.insuranceReady = false;
      player.insuranceChargeKills = 0;
      player.insuranceActive = false;
      return;
    }
    if (chargeType === 'keen_eye') {
      player.keenEyeReady = false;
      player.keenEyeChargeKills = 0;
      return;
    }
    if (chargeType === 'chrono_spring') {
      player.chronoSpringReady = false;
      player.chronoSpringChargeKills = 0;
      return;
    }
    if (chargeType === 'escape') {
      player.escapeReady = false;
      player.escapeChargeKills = 0;
    }
  }

  function incrementChargeProgress(chargeType, baseRequirement) {
    if (chargeType === 'insurance') {
      if (getItemCount('insurance') <= 0 || player.insuranceReady) return;
      player.insuranceChargeKills += 1;
      if (player.insuranceChargeKills >= getChargeRequirement(baseRequirement)) {
        player.insuranceReady = true;
        player.insuranceChargeKills = 0;
        player.insuranceActive = false;
        particles.push({ x: player.x, y: player.y - 20, life: 0.7, text: 'INSURANCE READY', c: '#e8ecff' });
      }
      return;
    }
    if (chargeType === 'keen_eye') {
      if (getItemCount('keen_eye') <= 0 || player.keenEyeReady) return;
      player.keenEyeChargeKills += 1;
      if (player.keenEyeChargeKills >= getChargeRequirement(baseRequirement)) {
        player.keenEyeReady = true;
        player.keenEyeChargeKills = 0;
        particles.push({ x: player.x, y: player.y - 20, life: 0.7, text: 'KEEN READY', c: '#f2fbff' });
      }
      return;
    }
    if (chargeType === 'chrono_spring') {
      if (getItemCount('chrono_spring') <= 0 || player.chronoSpringReady) return;
      player.chronoSpringChargeKills += 1;
      if (player.chronoSpringChargeKills >= getChargeRequirement(baseRequirement)) {
        player.chronoSpringReady = true;
        player.chronoSpringChargeKills = 0;
        particles.push({ x: player.x, y: player.y - 36, life: 0.7, text: 'SPRING READY', c: '#d9f7ff' });
      }
      return;
    }
    if (chargeType === 'escape') {
      if (getItemCount('charged_adapter') <= 0 || player.escapeReady) return;
      player.escapeChargeKills += 1;
      if (player.escapeChargeKills >= getChargeRequirement(baseRequirement)) {
        player.escapeReady = true;
        player.escapeChargeKills = 0;
        particles.push({ x: player.x, y: player.y - 36, life: 0.7, text: 'WARP READY', c: '#b88cff' });
      }
    }
  }

  function refreshFloorChargeStates() {
    if (!player) return;
    player.insuranceActive = false;
    player.critCharmBuffTime = 0;
    player.keenEyeBuffTime = 0;
    player.chronoSpringBuffTime = 0;
  }

  function scaleDamageAgainstEnemy(enemy, damage) {
    const stats = getItemStats();
    const characterMultiplier = getCharacterDef().damageMultiplier || 1;
    const powered = (damage + (player?.attackPower || 0))
      * characterMultiplier
      * (stats.levelEdgeDamageMultiplier || 1)
      * (isChallengeActive('glass_cannon') ? 1.25 : 1);
    if (getStatusStacks(enemy, 'bleed') > 0 && stats.bleedDamageMultiplier > 1) {
      return Math.round(powered * stats.bleedDamageMultiplier);
    }
    return Math.round(powered);
  }

  function getPlayerBaseDamage() {
    const characterMultiplier = getCharacterDef().damageMultiplier || 1;
    return Math.max(1, (ATTACKS.melee.damage + (player?.attackPower || 0)) * characterMultiplier);
  }

  function getEquippedMove(slot) {
    const moveKey = player?.equippedMoves?.[slot];
    if (MOVE_DEFS[moveKey]?.slot === slot) return moveKey;
    return getDefaultMovesForCharacter(player?.character || chosenCharacter)[slot] || (slot === 'dash' ? 'dash' : slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : 'crimson_smash');
  }

  function getEquippedWeapon() {
    const key = player?.equippedWeapon || '';
    return WEAPON_DEFS[key] ? key : '';
  }

  function getWeaponBaseCooldown(weaponKey) {
    let base;
    if (weaponKey === 'extending_staff') base = 0.5;
    else if (weaponKey === 'hunters_bow') base = 0.4;
    else if (weaponKey === 'thorns_bleed_blade') base = ATTACKS.melee.baseCooldown;
    else if (weaponKey === 'lazer_glasses') base = 3.6;
    else if (weaponKey === 'metao_fire_staff') base = ATTACKS.melee.baseCooldown;
    else if (weaponKey === 'magenta_degale') base = 1.5;
    else if (weaponKey === 'magenta_p90') base = 1.8;
    else if (weaponKey === 'granillia_lightning_spear') base = ATTACKS.melee.baseCooldown;
    else if (weaponKey === 'excalibur') base = 2;
    else if (weaponKey === 'golden_fleece') base = 0.5;
    else if (weaponKey === 'void_piercer') base = 0.8;
    else if (weaponKey === 'aegis_shield_weapon') base = 8;
    else base = 0.5;
    const bonus = getAnvilWeaponBonus(weaponKey, 'cooldown');
    return Math.max(0.05, base + bonus);
  }

  function spawnWeaponProjectile(config = {}) {
    const angle = Number(config.angle || 0);
    const speed = Number(config.speed || 520);
    projectiles.push({
      x: config.x ?? player.x,
      y: config.y ?? player.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: Number(config.r || 5),
      life: Number(config.life || 1.2),
      damage: Number(config.damage || 18),
      kind: config.kind || 'weapon_shot',
      color: config.color || '#ffd7aa',
      knockback: Number(config.knockback || 140),
      pierceCount: Number(config.pierceCount || 0),
      hitOptions: config.hitOptions || null,
      trail: [],
    });
  }

  function fireWeaponSweep(damage, range, arc, push, color, options = {}) {
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    player.swing = ATTACKS.melee.active;
    player.swingA = angle;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > range + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > arc) continue;
      hitEnemy(enemy, damage, angle, push, color, options);
      if (options.bleedChance > 0 && nextRandom('encounter') < options.bleedChance) {
        applyBleed(enemy, Number(options.bleedStacks || 1), Number(options.bleedDuration || 4));
      }
      if (options.itemBleedChance > 0 && nextRandom('encounter') < options.itemBleedChance) {
        applyBleed(enemy, 1, 5);
      }
    }

    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const potAssist = prop.kind === 'pot';
      const reachBonus = potAssist ? 24 : 10;
      const arcBonus = potAssist ? 0.4 : 0.2;
      const touchingBonus = potAssist ? 30 : 18;
      const propDistance = dist(player.x, player.y, prop.x, prop.y);
      if (propDistance > range + prop.r + reachBonus) return;
      if (potAssist && propDistance <= range + prop.r + 26) {
        damageDestructible(prop, 1);
        return;
      }
      const targetAngle = Math.atan2(prop.y - player.y, prop.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      const touching = propDistance <= player.r + prop.r + touchingBonus;
      if (!touching && difference > arc + arcBonus) return;
      damageDestructible(prop, 1);
    });
  }

  function tryWeaponAttack() {
    const weaponKey = getEquippedWeapon();
    if (!weaponKey) return false;
    if (player.weaponCooldown > 0) return false;
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const attackSpeed = getAttackSpeedValue();
    const itemStats = getItemStats();
    const wDmg  = k => Math.max(1, (WEAPON_BASE_STATS[k]?.damage  ?? 0) + getAnvilWeaponBonus(k, 'damage'));
    const wKnk  = k => Math.max(0, (WEAPON_BASE_STATS[k]?.knockback ?? 0) + getAnvilWeaponBonus(k, 'knockback'));
    const wRng  = k => Math.max(10, (WEAPON_BASE_STATS[k]?.range   ?? 120) + getAnvilWeaponBonus(k, 'range'));
    const wCd   = k => getWeaponBaseCooldown(k);
    if (weaponKey === 'extending_staff') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), 1.45, wKnk(weaponKey), '#eaf4ff');
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'hunters_bow') {
      spawnWeaponProjectile({ angle, speed: 820, damage: wDmg(weaponKey), knockback: wKnk(weaponKey), r: 4, life: 0.9, kind: 'hunters_bow', color: '#f0fbff', pierceCount: 1, hitOptions: { critBonus: 0.1 } });
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'thorns_bleed_blade') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), ATTACKS.melee.arc, wKnk(weaponKey), '#ff6e8b', { bleedChance: 0.10, bleedStacks: 1, bleedDuration: 5, itemBleedChance: itemStats.bleedChance || 0 });
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'lazer_glasses') {
      player.weaponBeamTime = 0.65;
      player.weaponBeamTick = 0;
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'metao_fire_staff') {
      spawnFireballs();
      player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'magenta_degale') {
      spawnWeaponProjectile({ angle, speed: 920, damage: wDmg(weaponKey), knockback: wKnk(weaponKey), r: 7, life: 0.9, kind: 'magenta_degale', color: '#ff8bd2' });
      player.vx -= Math.cos(angle) * 280;
      player.vy -= Math.sin(angle) * 280;
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'magenta_p90') {
      for (let shot = 0; shot < 5; shot += 1) {
        weaponBurstQueue.push({
          delay: shot * 0.04,
          angle: angle + rand(0.05, -0.05, 'encounter'),
          weaponKey,
        });
      }
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'granillia_lightning_spear') {
      castSmiteChain();
      player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'excalibur') {
      const excaliburDamage = Math.max(1, Math.round(getPlayerBaseDamage() * 7.77 + getAnvilWeaponBonus(weaponKey, 'damage')));
      fireWeaponSweep(excaliburDamage, wRng(weaponKey), Math.PI, wKnk(weaponKey), '#ffe291', { rawDamage: true });
      particles.push({ x: player.x, y: player.y, life: 0.6, ring: 56, c: '#ffd26a' });
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'golden_fleece') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), ATTACKS.melee.arc, wKnk(weaponKey), '#ffe8a0');
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'void_piercer') {
      spawnWeaponProjectile({ angle, speed: 760, damage: wDmg(weaponKey), knockback: wKnk(weaponKey), r: 6, life: 1.2, kind: 'void_piercer', color: '#ffd2c0', pierceCount: 4, hitOptions: { ignoreBarrier: true, critBonus: 0.2 } });
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'aegis_shield_weapon') {
      player.blockActive = true;
      player.blockTimer = 2;
      player.weaponCooldown = wCd(weaponKey);
      particles.push({ x: player.x, y: player.y, life: 0.5, ring: 26, c: '#9ae9ff' });
      return true;
    }
    return false;
  }

  function tryMelee() {
    cancelCowardsWayOnAttack();
    if (getEquippedWeapon()) {
      tryWeaponAttack();
      return;
    }
    const move = getEquippedMove('melee');
    const itemStats = getItemStats();
    const attackSpeed = getAttackSpeedValue();
    if (!spendSkillCharge('melee', getMeleeCooldownDuration(move, attackSpeed))) return;
    if (move === 'fire_balls') {
      spawnFireballs();
      return;
    }
    if (move === 'narwal_fight') {
      castNarwalFight();
      return;
    }
    if (move === 'smite') {
      castSmiteChain();
      return;
    }
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    player.swing = ATTACKS.melee.active;
    player.swingA = angle;

    const anvilDmgBonus = getAnvilMoveBonus(move, 'damage');
    const anvilRngBonus = getAnvilMoveBonus(move, 'range');
    const damage = (godTimer > 0 ? 56 : ATTACKS.melee.damage) + anvilDmgBonus;
    const meleeRange = ATTACKS.melee.range + anvilRngBonus;
    const meleeKnockback = move === 'slash' ? SLASH_KNOCKBACK : ATTACKS.melee.push;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > meleeRange + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > ATTACKS.melee.arc) continue;
      hitEnemy(enemy, damage, angle, meleeKnockback, '#0ff');
      const slashBleedChance = move === 'slash' ? 0.10 : 0;
      if (slashBleedChance > 0 && rng() < slashBleedChance) applyBleed(enemy, 1, 5);
      if (itemStats.bleedChance > 0 && rng() < itemStats.bleedChance) applyBleed(enemy, 1, 5);
    }
    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const slashPotAssist = move === 'slash' && prop.kind === 'pot';
      const destructibleReachBonus = slashPotAssist ? 24 : 8;
      const destructibleArcBonus = slashPotAssist ? 0.45 : 0.25;
      const touchingBonus = slashPotAssist ? 32 : 18;
      const propDistance = dist(player.x, player.y, prop.x, prop.y);
      if (propDistance > meleeRange + prop.r + destructibleReachBonus) return;
      if (slashPotAssist && propDistance <= meleeRange + prop.r + 24) {
        damageDestructible(prop, 1);
        return;
      }
      const targetAngle = Math.atan2(prop.y - player.y, prop.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      const touching = propDistance <= player.r + prop.r + touchingBonus;
      if (!touching && difference > ATTACKS.melee.arc + destructibleArcBonus) return;
      damageDestructible(prop, 1);
    });
  }

  function fireLazerGlassesTick() {
    const baseAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    [-0.2, 0.2].forEach(offset => {
      const angle = baseAngle + offset;
      const beamPath = buildRicochetBeamPath(player.x, player.y, angle, 430, LAZER_GLASSES_BOUNCES);
      let target = null;
      let hitSegment = null;
      for (let index = 0; index < enemies.length; index += 1) {
        const enemy = enemies[index];
        if (!enemy) continue;
        hitSegment = beamPathHitsCircle(beamPath, enemy.x, enemy.y, enemy.r + 4);
        if (hitSegment) {
          target = enemy;
          break;
        }
      }
      if (target) {
        hitEnemy(target, 9, hitSegment?.angle ?? angle, 80, '#cda8ff', { fireChance: 0.05, fireStacks: 1, fireDuration: 3 });
      }
      destructibles.forEach(prop => {
        if (!prop.broken && !prop.hidden && beamPathHitsCircle(beamPath, prop.x, prop.y, prop.r + 4)) {
          damageDestructible(prop, 1);
        }
      });
      particles.push({ x: player.x + Math.cos(angle) * 24, y: player.y + Math.sin(angle) * 24, life: 0.16, c: '#cda8ff' });
    });
  }

  function updateWeaponSystems(dt) {
    player.weaponCooldown = Math.max(0, Number(player.weaponCooldown || 0) - dt);
    if (player.blockTimer > 0) {
      player.blockTimer = Math.max(0, player.blockTimer - dt);
      player.blockActive = player.blockTimer > 0;
      if (player.blockActive && nextRandom('fx') < 0.25) {
        particles.push({ x: player.x + rand(18, -18, 'fx'), y: player.y + rand(18, -18, 'fx'), life: 0.2, c: '#9cefff' });
      }
    } else {
      player.blockActive = false;
    }

    const equippedWeapon = getEquippedWeapon();
    if (equippedWeapon === 'golden_fleece') {
      player.fleeceTick += dt;
      if (player.fleeceTick >= 2) {
        player.fleeceTick = 0;
        const heal = player.maxHp * 0.2;
        const before = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + heal);
        if (player.hp > before) spawnHealPopup(player.x + rand(-10, 10), player.y - 20, player.hp - before, { color: '#ffe59c' });
      }
    } else {
      player.fleeceTick = 0;
    }

    if (equippedWeapon === 'lazer_glasses' && player.weaponBeamTime > 0) {
      player.weaponBeamTime = Math.max(0, player.weaponBeamTime - dt);
      player.weaponBeamTick = Number(player.weaponBeamTick || 0) - dt;
      if (player.weaponBeamTick <= 0) {
        player.weaponBeamTick = 0.08;
        fireLazerGlassesTick();
      }
    }

    for (let index = weaponBurstQueue.length - 1; index >= 0; index -= 1) {
      const queued = weaponBurstQueue[index];
      queued.delay -= dt;
      if (queued.delay > 0) continue;
      if (queued.weaponKey === 'magenta_p90') {
        const p90Dmg = Math.max(1, (WEAPON_BASE_STATS.magenta_p90?.damage ?? 18) + getAnvilWeaponBonus('magenta_p90', 'damage'));
        const p90Knk = Math.max(0, (WEAPON_BASE_STATS.magenta_p90?.knockback ?? 140) + getAnvilWeaponBonus('magenta_p90', 'knockback'));
        spawnWeaponProjectile({ angle: queued.angle, speed: 900, damage: p90Dmg, knockback: p90Knk, r: 4, life: 0.8, kind: 'magenta_p90', color: '#ff9dd7' });
        player.vx -= Math.cos(queued.angle) * 55;
        player.vy -= Math.sin(queued.angle) * 55;
      }
      weaponBurstQueue.splice(index, 1);
    }
  }

  function tryLaser() {
    cancelCowardsWayOnAttack();
    if (laserActive) return;
    const attackSpeed = getAttackSpeedValue();
    const move = getEquippedMove('laser');
    const rechargeTime = getLaserCooldownDuration(move, attackSpeed);
    if (move === 'turtle_wave') {
      if (player.hp <= 1) {
        particles.push({ x: player.x, y: player.y - 20, life: 0.52, text: 'NEED HP', c: '#ff8b98' });
        return;
      }
      if (!spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      laserActive = true;
      laserMode = 'turtle_wave';
      laserTime = getLaserCastDuration(move);
      laserTick = 0;
      turtleWaveHpTimer = 0;
      return;
    }
    if (move === 'power_disks') {
      if (!spendSkillCharge('laser', rechargeTime)) return;
      spawnPlayerDiskBurst();
      return;
    }
    if (move === 'blade_justice') {
      if (!spendSkillCharge('laser', rechargeTime)) return;
      castBladeOfJustice();
      return;
    }
    if (move === 'love_beam') {
      if (!spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      laserActive = true;
      laserMode = 'beam';
      loveBeamCasting = true;
      laserTime = getLaserCastDuration(move);
      laserTick = 0;
      turtleWaveHpTimer = 0;
      return;
    }
    if (move === 'lightning_columns') {
      if (!spendSkillCharge('laser', rechargeTime)) return;
      castLightningColumns();
      return;
    }
    if (move === 'god_sweep') {
      if (!spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      laserActive = true;
      laserMode = 'god_sweep';
      laserTime = getLaserCastDuration(move);
      laserTick = 0;
      turtleWaveHpTimer = 0;
      laserAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
      laserSweepSpeed = (nextRandom('encounter') < 0.5 ? -1 : 1) * 4.6;
      return;
    }
    if (!spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
    laserActive = true;
    laserMode = 'beam';
    laserTime = getLaserCastDuration(move);
    laserTick = 0;
    turtleWaveHpTimer = 0;
  }

  function endActiveLaser() {
    if (!laserActive) return;
    laserActive = false;
    laserMode = 'beam';
    loveBeamCasting = false;
    turtleWaveHpTimer = 0;
    queueHeldSkillRecharge('laser', getLaserCooldownDuration(getEquippedMove('laser'), getAttackSpeedValue()));
  }

  function tickTurtleWaveHpDrain(dt) {
    if (laserMode !== 'turtle_wave') return false;
    turtleWaveHpTimer += dt;
    while (turtleWaveHpTimer >= 1) {
      turtleWaveHpTimer -= 1;
      const drain = Math.min(TURTLE_WAVE_HP_PER_SECOND, Math.max(0, player.hp - 1));
      if (drain <= 0) {
        particles.push({ x: player.x, y: player.y - 20, life: 0.55, text: 'WAVE ENDED', c: '#ff8b98' });
        return true;
      }
      player.hp = Math.max(1, player.hp - drain);
      if (!isBossFightActive()) player.roomDamageTaken = (player.roomDamageTaken || 0) + drain;
      spawnDamagePopup(player.x, player.y - 18, drain, { color: '#74f5ff', size: 14 });
      particles.push({ x: player.x, y: player.y - 30, life: 0.42, text: `-${drain} HP`, c: '#74f5ff' });
      if (player.hp <= 1) {
        particles.push({ x: player.x, y: player.y - 20, life: 0.55, text: 'WAVE ENDED', c: '#ff8b98' });
        return true;
      }
    }
    return false;
  }

  function updatePlayerLaser(dt) {
    if (!laserActive) return;
    laserTime -= dt;
    laserTick -= dt;
    if (tickTurtleWaveHpDrain(dt)) {
      endActiveLaser();
      return;
    }
    const move = getEquippedMove('laser');
    const itemStats = getItemStats();
    const loveBeamActive = loveBeamCasting && move === 'love_beam';
    const angle = laserMode === 'god_sweep'
      ? laserAngle
      : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    if (laserTick <= 0) {
      if (laserMode === 'god_sweep') laserAngle += laserSweepSpeed * 0.05;
      laserTick = laserMode === 'god_sweep' ? 0.05 : laserMode === 'turtle_wave' ? 0.08 : loveBeamActive ? 0.06 : ATTACKS.laser.tick;
      const range = getPlayerBeamRange(laserMode, move);
      const beamPath = buildRicochetBeamPath(player.x, player.y, angle, range, getPlayerBeamBounceCount(laserMode));
      let loveBeamHits = 0;
      for (let index = enemies.length - 1; index >= 0; index -= 1) {
        const enemy = enemies[index];
        if (!enemy) continue;
        const hitSegment = beamPathHitsCircle(beamPath, enemy.x, enemy.y, enemy.r + (laserMode === 'turtle_wave' ? 14 : 6));
        if (!hitSegment) continue;
        const anvilBeamBonus = getAnvilMoveBonus(move, 'damage');
        const baseBeamDamage = laserMode === 'god_sweep'
          ? 24
          : laserMode === 'turtle_wave'
            ? 34
            : loveBeamActive
              ? 18
              : godTimer > 0
                ? 16
                : ATTACKS.laser.damage;
        const beamDamage = (baseBeamDamage + anvilBeamBonus) * (itemStats.beamDamageMultiplier || 1);
        const anvilCritBonus = getAnvilMoveBonus(move, 'critChance');
        hitEnemy(enemy, beamDamage, hitSegment.angle, laserMode === 'god_sweep' ? 120 : laserMode === 'turtle_wave' ? 155 : loveBeamActive ? 52 : 60, loveBeamActive ? '#ff9ed6' : '#f0f', anvilCritBonus > 0 ? { critBonus: anvilCritBonus } : {});
        chainBeamHit(enemy, beamDamage, hitSegment.angle, loveBeamActive ? '#ffb8e0' : '#d890ff');
        if (loveBeamActive) loveBeamHits += 1;
        if (move === 'blood_beam' && rng() < 0.05) applyBleed(enemy, 1, 3.2);
        if (move === 'blood_beam' && rng() < 0.08) applyDarkDrain(enemy, 1, 3.4);
      }
      destructibles.forEach(prop => {
        if (!prop.broken && !prop.hidden && beamPathHitsCircle(beamPath, prop.x, prop.y, prop.r + 4)) {
          damageDestructible(prop, 1);
        }
      });
      if (loveBeamHits > 0) {
        const heal = Math.min(8, loveBeamHits * 1.25);
        player.hp = Math.min(player.maxHp, player.hp + heal);
        spawnHealPopup(player.x + rand(-6, 6), player.y - 22, heal, { color: '#ff9ed6' });
        particles.push({ x: player.x, y: player.y - 26, life: 0.22, text: 'LOVE', c: '#ff9ed6' });
      }
    }
    if (laserTime <= 0) {
      endActiveLaser();
    }
  }

  function trySmash() {
    cancelCowardsWayOnAttack();
    const itemStats = getItemStats();
    const attackSpeed = getAttackSpeedValue();
    if (!spendSkillCharge('smash', getSmashCooldownDuration(attackSpeed))) return;
    const move = getEquippedMove('smash');
    if (move === 'kicky_kick') {
      castKickyKick();
      return;
    }
    if (move === 'chaos_burst') {
      castChaosBurst();
      return;
    }
    if (move === 'healing_zone') {
      castHealingZone();
      return;
    }
    if (move === 'fire_circle') {
      castFireCircle();
      return;
    }
    if (move === 'floor_lava') {
      castFloorLava();
      return;
    }
    const anvilSmashRange = getAnvilMoveBonus(move, 'range');
    const smashRadius = (ATTACKS.smash.radius + anvilSmashRange) * (itemStats.aoeRadiusMultiplier || 1);
    shake = 16;
    shakeT = 0.24;
    particles.push({ x: player.x, y: player.y, life: 0.4, ring: smashRadius - 30, c: '#ff00aa' });
    spawnAoeShockwave(player.x, player.y, smashRadius, '#ff66cc', 'heavy');
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > smashRadius + enemy.r) continue;
      const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      let damage = (godTimer > 0 ? 82 : ATTACKS.smash.damage) + getAnvilMoveBonus(move, 'damage');
      if (itemStats.bleedDamageMultiplier > 1 && getStatusStacks(enemy, 'bleed') > 0) {
        damage += ATTACKS.smash.bonus;
        particles.push({ x: enemy.x, y: enemy.y - 16, life: 0.6, text: 'POP', c: '#a0f' });
      }
      hitEnemy(enemy, damage, angle, 320, '#ff66cc');
      enemy.stun = 0.5;
    }
    destructibles.forEach(prop => {
      if (!prop.broken && !prop.hidden && dist(player.x, player.y, prop.x, prop.y) <= smashRadius + prop.r) {
      damageDestructible(prop, 2);
      }
    });
  }

  function tryDash(moveX, moveY) {
    if (player.dashTime > 0) return;
    const move = getEquippedMove('dash');
    const attackSpeed = getAttackSpeedValue();
    const rechargeTime = getDashCooldownDuration(move, attackSpeed);
    if (!spendSkillCharge('dash', rechargeTime)) return;
    if (move === 'flying_unhitable') {
      castFlyingUntouchable();
      return;
    }
    if (move === 'warp') {
      castWarp();
      return;
    }
    if (move === 'zip_lightning') {
      castZipLightning(moveX, moveY);
      return;
    }
    if (move === 'cowards_way') {
      castCowardsWay();
      return;
    }
    if (move === 'nimrod_stomp') {
      castNimrodStomp(moveX, moveY);
      return;
    }
    castDashBurst(moveX, moveY);
  }

  function castDashBurst(moveX, moveY) {
    const angle = Math.hypot(moveX, moveY) > 0.15
      ? Math.atan2(moveY, moveX)
      : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const dashSpeed = (520 + player.attackSpeed * 28) * (godTimer > 0 ? 1.1 : 1);
    player.dashTime = 0.16;
    player.dashX = Math.cos(angle) * dashSpeed;
    player.dashY = Math.sin(angle) * dashSpeed;
    player.vx = player.dashX;
    player.vy = player.dashY;
    player.inv = Math.max(player.inv, 0.18);
    shake = Math.max(shake, 3);
    shakeT = Math.max(shakeT, 0.08);
    particles.push({ x: player.x, y: player.y, life: 0.28, ring: 18, c: '#fff06a' });
  }

  function cancelCowardsWayOnAttack() {
    if (player.cowardsWayTime <= 0) return;
    player.cowardsWayTime = 0;
    particles.push({ x: player.x, y: player.y - 20, life: 0.42, text: "COWARD'S WAY BROKEN", c: '#ffd27a' });
  }

  function findSafePointNearTarget(tx, ty, radius = player.r, maxRadius = 220, step = 22) {
    const clampedX = clamp(tx, WALL + radius + 2, ROOM_W - WALL - radius - 2);
    const clampedY = clamp(ty, WALL + radius + 2, ROOM_H - WALL - radius - 2);
    if (!isBlocked(clampedX, clampedY, radius)) return { x: clampedX, y: clampedY };
    for (let distStep = step; distStep <= maxRadius; distStep += step) {
      const checks = Math.max(8, Math.floor((Math.PI * 2 * distStep) / step));
      for (let index = 0; index < checks; index += 1) {
        const angle = (index / checks) * Math.PI * 2;
        const px = clamp(clampedX + Math.cos(angle) * distStep, WALL + radius + 2, ROOM_W - WALL - radius - 2);
        const py = clamp(clampedY + Math.sin(angle) * distStep, WALL + radius + 2, ROOM_H - WALL - radius - 2);
        if (!isBlocked(px, py, radius)) return { x: px, y: py };
      }
    }
    return null;
  }

  function teleportPlayerTo(targetX, targetY, color = '#b99cff') {
    particles.push({ x: player.x, y: player.y, life: 0.35, ring: 18, c: color });
    player.x = targetX;
    player.y = targetY;
    player.vx = 0;
    player.vy = 0;
    particles.push({ x: player.x, y: player.y, life: 0.35, ring: 18, c: color });
  }

  function castNimrodStomp(moveX, moveY) {
    const itemStats = getItemStats();
    const angle = Math.hypot(moveX, moveY) > 0.15
      ? Math.atan2(moveY, moveX)
      : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const horizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
    const edgePad = WALL + player.r + 4;
    const targetX = horizontal
      ? (Math.cos(angle) >= 0 ? ROOM_W - edgePad : edgePad)
      : player.x;
    const targetY = horizontal
      ? clamp(mouse.worldY, edgePad, ROOM_H - edgePad)
      : (Math.sin(angle) >= 0 ? ROOM_H - edgePad : edgePad);
    const landingPoint = findSafePointNearTarget(targetX, targetY, player.r, 260, 24)
      || findSafePointNearTarget(player.x + Math.cos(angle) * 240, player.y + Math.sin(angle) * 240, player.r, 140, 20);
    if (!landingPoint) return;
    teleportPlayerTo(landingPoint.x, landingPoint.y, '#fff06a');
    const aoeRadius = 108 * (itemStats.aoeRadiusMultiplier || 1);
    const stompDamage = godTimer > 0 ? 64 : 46;
    blastRadius(player.x, player.y, aoeRadius, stompDamage, '#ffe67a');
    shake = Math.max(shake, 14);
    shakeT = Math.max(shakeT, 0.22);
    player.inv = Math.max(player.inv, 0.32);
    particles.push({ x: player.x, y: player.y, life: 0.44, ring: aoeRadius, c: '#ffe67a' });
  }

  function castCowardsWay() {
    player.cowardsWayTime = 3;
    player.inv = Math.max(player.inv, 0.25);
    particles.push({ x: player.x, y: player.y - 18, life: 0.72, text: "COWARD'S WAY", c: '#8dffcf' });
  }

  function castZipLightning(moveX, moveY) {
    const itemStats = getItemStats();
    const visited = new Set();
    const hops = 3;
    const baseDamage = godTimer > 0 ? 34 : 26;
    let sourceX = player.x;
    let sourceY = player.y;
    let performedHop = false;
    for (let hop = 0; hop < hops; hop += 1) {
      const searchX = hop === 0 ? mouse.worldX : sourceX;
      const searchY = hop === 0 ? mouse.worldY : sourceY;
      const target = findNearestEnemy(searchX, searchY, hop === 0 ? 280 : 260, visited)
        || findNearestEnemy(sourceX, sourceY, 260, visited);
      if (!target) break;
      visited.add(target);
      const toward = Math.atan2(target.y - sourceY, target.x - sourceX);
      const landDist = target.r + player.r + 8;
      const landing = findSafePointNearTarget(
        target.x - Math.cos(toward) * landDist,
        target.y - Math.sin(toward) * landDist,
        player.r,
        90,
        14
      );
      if (landing) teleportPlayerTo(landing.x, landing.y, '#95deff');
      sourceX = player.x;
      sourceY = player.y;
      performedHop = true;

      const hitAngle = Math.atan2(target.y - player.y, target.x - player.x);
      hitEnemy(target, baseDamage, hitAngle, 185, '#95deff');

      const chained = new Set([target]);
      let chainSource = target;
      for (let chainIndex = 0; chainIndex < 2; chainIndex += 1) {
        const chainedEnemy = findNearestEnemy(chainSource.x, chainSource.y, 156, chained);
        if (!chainedEnemy) break;
        chained.add(chainedEnemy);
        const chainDamage = Math.max(1, Math.round(baseDamage * (0.72 - chainIndex * 0.1)));
        hitEnemy(
          chainedEnemy,
          chainDamage,
          Math.atan2(chainedEnemy.y - chainSource.y, chainedEnemy.x - chainSource.x),
          120,
          '#9adfff',
          { rawDamage: true }
        );
        particles.push({ x: (chainSource.x + chainedEnemy.x) * 0.5, y: (chainSource.y + chainedEnemy.y) * 0.5, life: 0.2, c: '#9adfff' });
        chainSource = chainedEnemy;
      }
      particles.push({ x: player.x, y: player.y, life: 0.22, ring: 16 + hop * 4, c: '#84cfff' });
    }

    if (!performedHop) {
      const angle = Math.hypot(moveX, moveY) > 0.15
        ? Math.atan2(moveY, moveX)
        : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
      const fallback = findSafePointNearTarget(player.x + Math.cos(angle) * 190, player.y + Math.sin(angle) * 190, player.r, 120, 16);
      if (fallback) teleportPlayerTo(fallback.x, fallback.y, '#95deff');
    }

    shake = Math.max(shake, 8);
    shakeT = Math.max(shakeT, 0.14);
    player.inv = Math.max(player.inv, 0.26);
    const zipShock = 72 * (itemStats.aoeRadiusMultiplier || 1);
    particles.push({ x: player.x, y: player.y, life: 0.24, ring: zipShock, c: '#8ad9ff' });
  }

  function castNarwalFight() {
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    fireWeaponSweep(40, 136, 1.45, 280, '#ff8ed0');
    spawnWeaponProjectile({
      x: player.x + Math.cos(angle) * 22,
      y: player.y + Math.sin(angle) * 22,
      angle,
      speed: 760,
      damage: 26,
      knockback: 200,
      r: 6,
      life: 0.92,
      kind: 'narwal_fight',
      color: '#ffd1ea',
      pierceCount: 2,
      hitOptions: { critBonus: 0.08 },
    });
    particles.push({ x: player.x, y: player.y, life: 0.32, ring: 22, c: '#ff8ed0' });
  }

  function castKickyKick() {
    const itemStats = getItemStats();
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const radius = 138 * (itemStats.aoeRadiusMultiplier || 1);
    const kickDamage = 92;
    const kickKnockback = 720;
    blastRadius(player.x, player.y, radius, kickDamage, '#ff7fc2');
    enemies.forEach(enemy => {
      if (!enemy) return;
      if (dist(player.x, player.y, enemy.x, enemy.y) > radius + enemy.r) return;
      const enemyAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      enemy.vx += Math.cos(enemyAngle) * kickKnockback;
      enemy.vy += Math.sin(enemyAngle) * kickKnockback;
      enemy.stun = Math.max(enemy.stun, 0.7);
    });
    player.vx -= Math.cos(angle) * 260;
    player.vy -= Math.sin(angle) * 260;
    shake = Math.max(shake, 10);
    shakeT = Math.max(shakeT, 0.18);
    particles.push({ x: player.x, y: player.y, life: 0.42, ring: radius * 0.85, c: '#ff7fc2' });
  }

  function castFlyingUntouchable() {
    player.princessFlightTime = 15;
    player.inv = Math.max(player.inv, 15);
    player.vx = 0;
    player.vy = 0;
    particles.push({ x: player.x, y: player.y - 18, life: 0.8, text: 'FLY HIGH', c: '#ffd1ea' });
  }

  function applyResponsiveVelocity(current, desired, dt) {
    const isStopping = Math.abs(desired) < 0.001;
    const isTurning = !isStopping && current !== 0 && Math.sign(current) !== Math.sign(desired);
    const response = isStopping ? 20 : isTurning ? 24 : 14;
    const next = current + (desired - current) * Math.min(1, response * dt);
    return Math.abs(next) < 4 ? 0 : next;
  }

  function spawnPlayerDiskBurst() {
    for (let index = 0; index < 8; index += 1) {
      const angle = index * (Math.PI * 2 / 8);
      const isMetao = player?.character === 'metao';
      projectiles.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 280, vy: Math.sin(angle) * 280, r: 7, life: 1.2, enemy: false, kind: 'disk', damage: 20, hitOptions: isMetao ? { fireChance: 0.4, fireStacks: 1, fireDuration: 3 } : {} });
    }
  }

  function spawnFireballs() {
    const aoeRadiusMultiplier = getItemStats().aoeRadiusMultiplier || 1;
    const base = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    for (let index = -1; index <= 1; index += 1) {
      const angle = base + index * 0.18;
      projectiles.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 320, vy: Math.sin(angle) * 320, r: 8, life: 1.6, enemy: false, kind: 'fireball', damage: 22, splash: 48 * aoeRadiusMultiplier, fireStacks: 2, fireDuration: 3.4 });
    }
  }

  function castChaosBurst() {
    const aoeRadiusMultiplier = getItemStats().aoeRadiusMultiplier || 1;
    const isMetao = player?.character === 'metao';
    for (let index = 0; index < 6; index += 1) {
      const angle = rng() * Math.PI * 2;
      const px = player.x + Math.cos(angle) * rand(160, 40);
      const py = player.y + Math.sin(angle) * rand(160, 40);
      particles.push({ x: px, y: py, life: 0.45, ring: 18 * aoeRadiusMultiplier, c: '#c971ff' });
      blastRadius(px, py, 52 * aoeRadiusMultiplier, 24, '#c971ff');
      applyStatusInRadius(px, py, 52 * aoeRadiusMultiplier, 'poison', 1, 4.8);
      if (isMetao) applyStatusInRadius(px, py, 52 * aoeRadiusMultiplier, 'fire', 1, 3.5);
    }
  }

  function castBladeOfJustice() {
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > 110 + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > 1.3) continue;
      hitEnemy(enemy, 34, angle, 280, '#fff6a3');
    }
    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      if (dist(player.x, player.y, prop.x, prop.y) > 110 + prop.r) return;
      const targetAngle = Math.atan2(prop.y - player.y, prop.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > 1.3) return;
      damageDestructible(prop, 2);
    });
    particles.push({ x: player.x, y: player.y, life: 0.5, ring: 36, c: '#fff6a3' });
  }

  function castSmiteChain() {
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    player.swing = ATTACKS.melee.active;
    player.swingA = angle;

    // Physical swing: hits enemies and destructibles in an arc.
    const physicalDamage = 20;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > ATTACKS.melee.range + enemy.r + 4) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > ATTACKS.melee.arc + 0.15) continue;
      hitEnemy(enemy, physicalDamage, angle, ATTACKS.melee.push, '#fff6a3');
    }
    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const distance = dist(player.x, player.y, prop.x, prop.y);
      if (distance > ATTACKS.melee.range + prop.r + 4) return;
      const targetAngle = Math.atan2(prop.y - player.y, prop.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > ATTACKS.melee.arc + 0.15) return;
      damageDestructible(prop, 2);
    });

    const origin = findNearestSmiteTarget(player.x, player.y, 280);
    if (!origin) return;

    let current = origin;
    let fromX = player.x;
    let fromY = player.y;
    const hit = new Set();
    for (let jumps = 0; jumps < 5 && current; jumps += 1) {
      hit.add(current.ref);
      const strikeDamage = 18 + jumps * 4;
      if (current.type === 'enemy') {
        hitEnemy(current.ref, strikeDamage, Math.atan2(current.y - fromY, current.x - fromX), 90, '#dfe8ff');
      } else {
        damageDestructible(current.ref, Math.max(2, Math.round(strikeDamage / 10)));
      }
      particles.push({ x: current.x, y: current.y, life: 0.32, ring: 18 + jumps * 3, c: '#cfdcff' });
      particles.push({
        life: 0.24,
        c: '#eaf2ff',
        line: {
          x1: fromX,
          y1: fromY,
          x2: current.x,
          y2: current.y,
          w: 4.5 + jumps * 0.7,
          jag: 14 + jumps * 1.4,
          seg: 7,
          phase: rng() * Math.PI * 2,
        },
      });
      fromX = current.x;
      fromY = current.y;
      current = findNearestSmiteTarget(fromX, fromY, 170, hit);
    }
  }

  function findNearestSmiteTarget(x, y, radius, exclude = new Set()) {
    let best = null;
    let bestDist = radius;

    enemies.forEach(enemy => {
      if (!enemy) return;
      if (exclude.has(enemy)) return;
      const d = dist(x, y, enemy.x, enemy.y);
      if (d < bestDist) {
        best = { type: 'enemy', ref: enemy, x: enemy.x, y: enemy.y, r: enemy.r };
        bestDist = d;
      }
    });

    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden || exclude.has(prop)) return;
      const d = dist(x, y, prop.x, prop.y);
      if (d < bestDist) {
        best = { type: 'prop', ref: prop, x: prop.x, y: prop.y, r: prop.r };
        bestDist = d;
      }
    });

    return best;
  }

  function castHealingZone() {
    const aoeRadiusMultiplier = getItemStats().aoeRadiusMultiplier || 1;
    hazards.push({ kind: 'healing_zone', x: player.x, y: player.y, r: 62 * aoeRadiusMultiplier, ttl: 6, healTick: 0.24, healAccum: 0, plusTick: 0.08 });
    particles.push({ x: player.x, y: player.y, life: 0.7, ring: 30, c: '#35ff6f' });
  }

  function castFireCircle() {
    const aoeRadiusMultiplier = getItemStats().aoeRadiusMultiplier || 1;
    hazards.push({ kind: 'fire_circle', x: player.x, y: player.y, r: 96 * aoeRadiusMultiplier, ttl: 5.2, dps: 18, followPlayer: true });
    particles.push({ x: player.x, y: player.y, life: 0.55, ring: 34, c: '#ff7b32' });
  }

  function castFloorLava() {
    player.lavaWalkTime = 5.8;
    player.lavaTrailTick = 0;
    particles.push({ x: player.x, y: player.y - 12, life: 0.7, text: 'LAVA WALK', c: '#ff9f40' });
  }

  function castLightningColumns() {
    const aoeRadiusMultiplier = getItemStats().aoeRadiusMultiplier || 1;
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const offsets = [-42, 42];
    offsets.forEach(offset => {
      const ox = Math.cos(angle + Math.PI / 2) * offset;
      const oy = Math.sin(angle + Math.PI / 2) * offset;
      hazards.push({
        kind: 'lightning_column',
        x: mouse.worldX + ox,
        y: mouse.worldY + oy,
        r: 54 * aoeRadiusMultiplier,
        ttl: 4.5,
        tick: 0,
        interval: 0.45,
        damage: 18,
      });
      particles.push({ x: mouse.worldX + ox, y: mouse.worldY + oy, life: 0.45, ring: 24, c: '#8dd4ff' });
    });
  }

  function castWarp() {
    const tx = clamp(mouse.worldX, WALL + player.r + 2, ROOM_W - WALL - player.r - 2);
    const ty = clamp(mouse.worldY, WALL + player.r + 2, ROOM_H - WALL - player.r - 2);
    const safePoint = findSafePointNearTarget(tx, ty, player.r, 210, 18);
    if (!safePoint) return;
    teleportPlayerTo(safePoint.x, safePoint.y, '#b99cff');
    player.inv = Math.max(player.inv, 0.24);
  }

  function hitEnemy(enemy, damage, angle, knockback, color, options = {}) {
    const stats = getItemStats();
    const critChance = clamp((stats.critChance || 0) + Number(options.critBonus || 0), 0, 0.98);
    let dealt = options.rawDamage ? Math.max(1, Math.round(damage)) : scaleDamageAgainstEnemy(enemy, damage);
    const isCrit = critChance > 0 && nextRandom('encounter') < critChance;
    const appliedKnockback = knockback * (stats.knockbackMultiplier || 1);
    if (isCrit) dealt = Math.round(dealt * stats.critMultiplier);
    if (!options.ignoreBarrier && (enemy.barrier || 0) > 0) {
      const absorbed = Math.min(enemy.barrier, dealt);
      enemy.barrier -= absorbed;
      dealt -= absorbed;
      particles.push({ x: enemy.x, y: enemy.y - 20, life: 0.4, text: `BLOCK ${absorbed}`, c: '#7ed6ff' });
      if (dealt <= 0) {
        enemy.vx += Math.cos(angle) * appliedKnockback * 0.35;
        enemy.vy += Math.sin(angle) * appliedKnockback * 0.35;
        enemy.stun = Math.max(enemy.stun, 0.04);
        return;
      }
    }
    enemy.hp -= dealt;
    enemy.vx += Math.cos(angle) * appliedKnockback;
    enemy.vy += Math.sin(angle) * appliedKnockback;
    enemy.stun = Math.max(enemy.stun, 0.08);
    grantCritCharmBuff();
    particles.push({ x: enemy.x, y: enemy.y, life: 0.24, vx: rand(-30, 30, 'fx'), vy: rand(-30, 30, 'fx'), c: color });
    spawnDamagePopup(enemy.x, enemy.y - 14, dealt, {
      crit: isCrit,
      color: isCrit ? '#ff9f1c' : '#ff6b6b',
      size: isCrit ? 20 : 16,
    });
    if (options.fireChance > 0 && nextRandom('encounter') < options.fireChance) {
      applyFire(enemy, Number(options.fireStacks || 1), Number(options.fireDuration || 2.8));
    }
    if (options.chainLightningRadius > 0) {
      const chained = findNearestEnemy(enemy.x, enemy.y, options.chainLightningRadius, new Set([enemy]));
      if (chained) {
        hitEnemy(
          chained,
          Math.max(1, Math.round(dealt * Number(options.chainMultiplier || 0.6))),
          Math.atan2(chained.y - enemy.y, chained.x - enemy.x),
          Math.max(60, knockback * 0.5),
          '#9ad9ff',
          { rawDamage: true }
        );
      }
    }
    if (enemy.hp <= 0) onEnemyDie(enemy);
  }

  function chainBeamHit(primaryEnemy, baseDamage, angle, color) {
    const stats = getItemStats();
    const chains = stats.beamChainTargets || 0;
    if (chains <= 0) return;
    const visited = new Set([primaryEnemy]);
    let source = primaryEnemy;
    for (let index = 0; index < chains; index += 1) {
      const nextEnemy = findNearestEnemy(source.x, source.y, 145, visited);
      if (!nextEnemy) break;
      visited.add(nextEnemy);
      const chainDamage = Math.max(1, Math.round(baseDamage * (stats.beamChainDamageMultiplier || 0.6)));
      hitEnemy(nextEnemy, chainDamage, Math.atan2(nextEnemy.y - source.y, nextEnemy.x - source.x), 55, color);
      particles.push({ x: (source.x + nextEnemy.x) / 2, y: (source.y + nextEnemy.y) / 2, life: 0.22, c: '#d890ff' });
      source = nextEnemy;
    }
  }

  function applyBleed(enemy, stacks, duration) {
    if (!enemy) return;
    const beforeStacks = getStatusStacks(enemy, 'bleed');
    applyStatus(enemy, 'bleed', stacks, duration);
    const afterStacks = getStatusStacks(enemy, 'bleed');
    if (afterStacks > beforeStacks) {
      enemy.bleedFlash = 0.34;
      spawnBleedSpray(enemy, afterStacks - beforeStacks, 1.7);
    }
  }

  function applyFire(entity, stacks, duration) {
    applyStatus(entity, 'fire', stacks, duration);
  }

  function applyPoison(entity, stacks, duration) {
    applyStatus(entity, 'poison', stacks, duration);
  }

  function applyDarkDrain(entity, stacks, duration) {
    applyStatus(entity, 'dark_drain', stacks, duration);
  }

  function applyStatusInRadius(x, y, radius, statusKey, stacks, duration, sourceEnemy = null) {
    enemies.forEach(enemy => {
      if (!enemy) return;
      if (sourceEnemy && enemy === sourceEnemy) return;
      if (dist(x, y, enemy.x, enemy.y) > radius + enemy.r) return;
      applyStatus(enemy, statusKey, stacks, duration);
    });
  }

  function spawnBleedSpray(enemy, stacks = 1, intensity = 1) {
    if (!enemy) return;
    const count = clamp(Math.ceil(Number(stacks || 1) * Number(intensity || 1)) + 1, 2, 9);
    const radius = Math.max(8, Number(enemy.r || 12));
    for (let index = 0; index < count; index += 1) {
      const angle = rand(Math.PI * 2, 0, 'fx');
      const force = rand(125, 35, 'fx') * (0.75 + Math.min(6, stacks) * 0.07);
      particles.push({
        x: enemy.x + Math.cos(angle) * rand(radius * 0.55, 1, 'fx'),
        y: enemy.y + Math.sin(angle) * rand(radius * 0.45, 1, 'fx'),
        life: rand(0.52, 0.22, 'fx'),
        vx: Math.cos(angle) * force + rand(24, -24, 'fx'),
        vy: Math.sin(angle) * force - rand(52, 12, 'fx'),
        c: BLEED_BLOOD_COLORS[irand(0, BLEED_BLOOD_COLORS.length - 1, 'fx')],
        blood: true,
        size: rand(4.2, 2.1, 'fx'),
      });
    }
  }

  function migrateEnemyState(enemy) {
    if (!enemy || typeof enemy !== 'object') return enemy;
    ensureStatuses(enemy);
    enemy.bleedImmune = !!enemy.bleedImmune;
    enemy.fireImmune = !!enemy.fireImmune;
    enemy.poisonImmune = !!enemy.poisonImmune;
    enemy.dark_drainImmune = !!enemy.dark_drainImmune;
    if (Number(enemy.bleed || 0) > 0 || Number(enemy.bleedT || 0) > 0) {
      applyBleed(enemy, Number(enemy.bleed || 0), Number(enemy.bleedT || 0));
      getStatusState(enemy, 'bleed').tick = Number(enemy.bleedTick || 0);
    }
    delete enemy.bleed;
    delete enemy.bleedT;
    delete enemy.bleedTick;
    return enemy;
  }

  function tickEnemyStatus(enemy, key, dt, config) {
    const state = getStatusState(enemy, key);
    if (state.stacks <= 0) return false;
    if (enemy[`${key}Immune`]) {
      clearStatus(enemy, key);
      return false;
    }
    state.duration -= dt;
    state.tick -= dt;
    if (state.tick <= 0) {
      state.tick = config.interval;
      const damage = Math.max(1, Math.round(config.damage(state.stacks)));
      enemy.hp -= damage;
      spawnDamagePopup(enemy.x, enemy.y - 10, damage, { color: config.color, size: 15 });
      if (config.particleColor) {
        particles.push({ x: enemy.x + rand(-8, 8), y: enemy.y + rand(-8, 8), life: 0.25, c: config.particleColor });
      }
      if (key === 'bleed') spawnBleedSpray(enemy, state.stacks, 0.7);
      if (config.healScale > 0 && player && player.hp < player.maxHp) {
        const heal = damage * config.healScale;
        player.hp = Math.min(player.maxHp, player.hp + heal);
        if (heal > 0.2) spawnHealPopup(player.x + rand(-8, 8), player.y - 22, heal, { color: config.color });
      }
      if (enemy.hp <= 0) {
        onEnemyDie(enemy);
        return true;
      }
    }
    if (state.duration <= 0) clearStatus(enemy, key);
    return false;
  }

  function updateEnemyStatuses(enemy, dt) {
    if (enemy.bleedFlash > 0) enemy.bleedFlash = Math.max(0, enemy.bleedFlash - dt);
    const bleedStacks = getStatusStacks(enemy, 'bleed');
    if (tickEnemyStatus(enemy, 'bleed', dt, {
      interval: 0.5,
      damage: stacks => scaleDamageAgainstEnemy(enemy, 3 * stacks),
      color: STATUS_STYLES.bleed.textColor,
      particleColor: STATUS_STYLES.bleed.color,
    })) return bleedStacks;
    if (!enemies.includes(enemy)) return bleedStacks;
    if (tickEnemyStatus(enemy, 'fire', dt, {
      interval: 0.45,
      damage: stacks => scaleDamageAgainstEnemy(enemy, 1.5 + stacks * 1.8),
      color: STATUS_STYLES.fire.textColor,
      particleColor: STATUS_STYLES.fire.color,
    })) return bleedStacks;
    if (!enemies.includes(enemy)) return bleedStacks;
    if (tickEnemyStatus(enemy, 'poison', dt, {
      interval: 0.7,
      damage: stacks => Math.max(1, enemy.max * (0.008 * stacks)),
      color: STATUS_STYLES.poison.textColor,
      particleColor: STATUS_STYLES.poison.color,
    })) return bleedStacks;
    if (!enemies.includes(enemy)) return bleedStacks;
    tickEnemyStatus(enemy, 'dark_drain', dt, {
      interval: 0.6,
      damage: stacks => scaleDamageAgainstEnemy(enemy, (1 + stacks * 2) * 0.1),
      color: STATUS_STYLES.dark_drain.textColor,
      particleColor: STATUS_STYLES.dark_drain.color,
      healScale: 0.35,
    });
    return bleedStacks;
  }

  function normalizeAngle(angle) {
    let result = angle;
    while (result <= -Math.PI) result += Math.PI * 2;
    while (result > Math.PI) result -= Math.PI * 2;
    return result;
  }

  function turnAngleToward(current, target, maxStep) {
    const delta = normalizeAngle(target - current);
    if (Math.abs(delta) <= maxStep) return target;
    return current + Math.sign(delta) * maxStep;
  }

  function rollEnemyBeamBias(enemy, maxError = 0.14) {
    if (!enemy) return 0;
    const bias = (nextRandom('encounter') - 0.5) * 2 * maxError;
    enemy.beamAimBias = bias;
    return bias;
  }

  function aimEnemyBeam(enemy, dt, turnRate) {
    if (!player || turnRate <= 0) return;
    const targetAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x) + Number(enemy.beamAimBias || 0);
    enemy.beamAngle = turnAngleToward(enemy.beamAngle, targetAngle, turnRate * dt * 0.72);
  }

  function tickEnemyBeam(enemy, dt, config = {}) {
    const {
      tick = 0.1,
      range = 430,
      knockback = 130,
      damage = enemy.dmg,
      speedDamp = 0.84,
      turnRate = 0,
      onTick = null,
      onHit = null,
      onEnd = null,
    } = config;
    enemy.beamTime -= dt;
    enemy.beamTick -= dt;
    enemy.vx *= speedDamp;
    enemy.vy *= speedDamp;
    if (turnRate > 0) aimEnemyBeam(enemy, dt, turnRate * 0.55);
    if (typeof onTick === 'function') onTick(enemy, dt);
    if (enemy.beamTick <= 0) {
      enemy.beamTick = tick;
      const beamPath = buildRicochetBeamPath(enemy.x, enemy.y, enemy.beamAngle, range, getEnemyBeamBounceCount(enemy));
      const hitSegment = beamPathHitsCircle(beamPath, player.x, player.y, player.r + 5);
      if (hitSegment) {
        damagePlayer(damage, hitSegment.angle, knockback, enemy.type === 'god' ? 'god_beam' : enemy.type === 'mirror_knight' ? 'mirror_beam' : 'enemy_beam');
        if (typeof onHit === 'function') onHit(enemy);
      }
    }
    if (enemy.beamTime <= 0) {
      enemy.beamAimBias = 0;
      if (typeof onEnd === 'function') onEnd(enemy);
      return true;
    }
    return false;
  }

  function spawnEnemyCorpse(enemy) {
    if (!enemy || enemy.type === 'boss_spawner') return;
    const speed = Math.min(150, Math.hypot(Number(enemy.vx || 0), Number(enemy.vy || 0)));
    const direction = speed > 8
      ? Math.atan2(Number(enemy.vy || 0), Number(enemy.vx || 0))
      : rand(Math.PI * 2, 0, 'fx');
    const boss = isBossType(enemy.type);
    deadBodies.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(direction) * (22 + speed * 0.16),
      vy: Math.sin(direction) * (22 + speed * 0.16),
      r: enemy.r,
      spriteKey: getEnemySpriteKey(enemy),
      type: enemy.type,
      elite: !!enemy.elite,
      age: 0,
      fallTime: boss ? CORPSE_FALL_TIME * 1.35 : CORPSE_FALL_TIME,
      fadeStart: boss ? CORPSE_FADE_START * 1.8 : CORPSE_FADE_START,
      life: boss ? CORPSE_LIFETIME * 1.9 : CORPSE_LIFETIME,
      angle: direction + Math.PI / 2,
      fallAngle: rand(0.95, -0.95, 'fx') + (enemy.elite ? 0.25 : 0),
      face: getFacingDirection(enemy, enemy.beamAngle || enemy.dashAngle || direction),
      size: Math.max(30, enemy.r * 2.4),
      bloodColor: enemy.type === 'god' ? '#f2ecff' : enemy.elite ? '#c04a14' : '#8d0018',
    });
  }

  function onEnemyDie(enemy) {
    if (enemy.type === 'god' && !enemy.rebirthUsed) {
      enemy.rebirthUsed = true;
      enemy.hp = Math.max(1, Math.round(enemy.max * 0.9));
      enemy.dmg = Math.round(enemy.dmg * 3);
      enemy.speed *= 1.18;
      triggerGodPhase(enemy, 2, 'DIVINE REBIRTH');
      playGodDialogue(2);
      spawnHealPopup(enemy.x, enemy.y - 54, enemy.hp, { color: '#79f7bf' });
      return;
    }

    const index = enemies.indexOf(enemy);
    if (index >= 0) enemies.splice(index, 1);
    spawnEnemyCorpse(enemy);
    if (player) player.kills = Math.max(0, Number(player.kills || 0)) + 1;
    if (player?.keenEyeReady) {
      triggerKeenEyeBuff();
      consumeCharge('keen_eye');
    }
    if (player?.chronoSpringReady) {
      triggerChronoSpringBuff();
      consumeCharge('chrono_spring');
    }

    const deathDust = enemy.elite ? 6 : isBossType(enemy.type) ? 9 : 4;
    for (let burst = 0; burst < deathDust; burst += 1) {
      const angle = rand(Math.PI * 2, 0, 'fx');
      particles.push({
        x: enemy.x + Math.cos(angle) * rand(enemy.r, 2, 'fx'),
        y: enemy.y + Math.sin(angle) * rand(enemy.r, 2, 'fx'),
        life: rand(0.34, 0.16, 'fx'),
        vx: Math.cos(angle) * rand(42, 12, 'fx'),
        vy: Math.sin(angle) * rand(42, 12, 'fx'),
        c: enemy.elite ? '#b97333' : enemy.type === 'god' ? '#f2ecff' : '#7b1a22',
      });
    }

    dropCoins(enemy.x, enemy.y, isBossType(enemy.type) ? 40 : enemy.elite ? 10 : 5);
    grantXp(isBossType(enemy.type) ? 40 : enemy.elite ? 12 : 6);
    incrementChargeProgress('insurance', 9);
    incrementChargeProgress('keen_eye', 10);
    incrementChargeProgress('chrono_spring', 7);
    incrementChargeProgress('escape', 10);

    if (enemy.elite && nextRandom('loot') < 0.18) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ elite: true, stream: 'loot' }) });
    } else if (nextRandom('loot') < 0.1) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'potion' });
    }

    if (enemy.type === 'god') {
      metaProgress.godsKilled = Number(metaProgress.godsKilled || 0) + 1;
      if (!metaProgress.unlockedCharacters.includes('granialla')) metaProgress.unlockedCharacters.push('granialla');
      if (gameMode === 'boss_rush') {
        currentRoom.cleared = true;
        bossRushActive = false;
        onBossRushBossDefeated();
        return;
      }
      currentRoom.cleared = true;
      // After defeating god: offer the choice — cash in (win) or loop; Endless Descent adds a third option
      if (hasLegacy('endless_descent')) {
        pickups.push({ x: ROOM_W / 2 - 200, y: ROOM_H / 2, type: 'crown' });
        pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'descend' });
        pickups.push({ x: ROOM_W / 2 + 200, y: ROOM_H / 2, type: 'returnGate' });
      } else {
        pickups.push({ x: ROOM_W / 2 - 120, y: ROOM_H / 2, type: 'crown' });
        pickups.push({ x: ROOM_W / 2 + 120, y: ROOM_H / 2, type: 'returnGate' });
      }
      updateObjective();
      refreshMenuState();
      scheduleRunSave();
      return;
    }

    if (enemy.type === 'bulk_golem' && enemy.splitReady) {
      sayAtPosition(enemy.x, enemy.y, 'I AM NOT DONE.', { speaker: 'BULK GOLEM', tone: 'boss', holdTime: 1.8, offsetY: enemy.r + 36 });
      const leftSpawn = findSafeEnemySpawnPoint(enemy.x - 70, enemy.y, 15);
      const rightSpawn = findSafeEnemySpawnPoint(enemy.x + 70, enemy.y, 15);
      if (leftSpawn) {
        const left = spawnEnemy('golem', leftSpawn.x, leftSpawn.y, false);
        left.spawnedFromBulk = true;
        left.hp = Math.round(left.max * 0.9);
        left.max = left.hp;
      }
      if (rightSpawn) {
        const right = spawnEnemy('golem', rightSpawn.x, rightSpawn.y, false);
        right.spawnedFromBulk = true;
        right.hp = Math.round(right.max * 0.9);
        right.max = right.hp;
      }
    }

    if (enemy.type === 'mirror_knight' && currentRoom?.type === 'challenge') {
      completeChallengeTrial('MIRROR BROKEN');
    }

    if (enemy.type === 'rival') {
      const rival = enemy.rivalData;
      if (rival) {
        rival.dead = true;
        rival.loot.forEach(item => {
          if (item.type === 'item' && item.key) {
            pickups.push({ x: enemy.x + rand(-22, 22, 'loot'), y: enemy.y + rand(-14, 14, 'loot'), type: 'item', key: item.key });
          } else if (item.type === 'potion') {
            pickups.push({ x: enemy.x + rand(-22, 22, 'loot'), y: enemy.y + rand(-14, 14, 'loot'), type: 'potion' });
          }
        });
        const rivalBase = 18 + floor * 4 + rival.loot.length * 8;
        const bonus = hasLegacy('rival_bounty') ? Math.round(rivalBase * 1.5) : rivalBase;
        dropCoins(enemy.x, enemy.y, bonus);
        particles.push({ x: enemy.x, y: enemy.y - 26, life: 2.0, text: `${rival.name.toUpperCase()} DEFEATED!`, c: rival.color });
        sayAtPosition(enemy.x, enemy.y, rival.deathLine, { speaker: rival.name, tone: 'boss', holdTime: 1.8, offsetY: enemy.r + 36 });
        grantXp(20 + floor * 3);
      }
      const rivalIdx = enemies.indexOf(enemy);
      if (rivalIdx >= 0) enemies.splice(rivalIdx, 1);
      if (player) player.kills = Math.max(0, Number(player.kills || 0)) + 1;
    }
    if (enemy.type === 'rival') return;

    if (enemies.filter(e => e.type !== 'rival').length === 0 && !currentRoom.cleared) {
      if (currentRoom.type === 'challenge') {
        updateObjective();
        return;
      }
      currentRoom.cleared = true;
      if (currentRoom.type === 'ladder' || currentRoom.type === 'boss') {
        pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'ladder' });
      }
      if (gameMode === 'endless' && endlessWaveActive) {
        endlessWaveActive = false;
        onEndlessWaveCleared();
      }
      if (gameMode === 'boss_rush' && bossRushActive) {
        bossRushActive = false;
        onBossRushBossDefeated();
      }
      updateObjective();
      scheduleRunSave();
    }
  }

  function onEndlessWaveCleared() {
    endlessWave += 1;
    if (ui.endlessWaveNum) ui.endlessWaveNum.textContent = endlessWave;
    const cx = ROOM_W / 2;
    const cy = ROOM_H / 2;
    particles.push({ x: cx, y: cy - 40, life: 1.4, text: `WAVE ${endlessWave} CLEARED`, c: '#78d7ff' });
    pickups.push({ x: cx - 60, y: cy, type: 'item', key: rollItemDrop({ elite: endlessWave % 3 === 0, stream: 'loot' }) });
    pickups.push({ x: cx + 60, y: cy, type: 'potion' });
    if (endlessWave % 5 === 0) {
      pickups.push({ x: cx, y: cy + 50, type: 'item', key: rollItemDrop({ elite: true, stream: 'loot' }) });
    }
    dropCoins(cx, cy - 20, 30 + endlessWave * 8);
    grantXp(20 + endlessWave * 4);
    const delay = endlessWave <= 2 ? 4 : endlessWave <= 5 ? 3 : 2;
    setTimeout(() => {
      if (gameMode !== 'endless' || gameState !== 'play') return;
      currentRoom.cleared = false;
      endlessWaveActive = true;
      const waveSize = Math.min(4 + endlessWave + Math.floor(endlessWave / 3), 18);
      spawnWave(waveSize, 'combat');
      particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 40, life: 1.1, text: `WAVE ${endlessWave + 1}`, c: '#ff8b8b' });
    }, delay * 1000);
  }

  function dropCoins(x, y, amount) {
    const chunks = Math.max(1, Math.ceil(amount / 4));
    for (let index = 0; index < chunks; index += 1) {
      pickups.push({
        x: x + rand(-18, 18, 'loot'),
        y: y + rand(-18, 18, 'loot'),
        type: 'coin',
        value: Math.ceil(amount / chunks),
      });
    }
  }

  function rollItemDrop(options = {}) {
    const table = options.elite ? ELITE_ITEM_DROP_TABLE : ITEM_DROP_TABLE;
    return rollFromWeightTable(table, options.stream || 'loot');
  }

  function grantXp(amount) {
    const stats = getItemStats();
    const gained = Math.max(1, Math.round(amount * (stats.xpGainMultiplier || 1)));
    player.xp += gained;
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      levelUp();
    }
  }

  function levelUp() {
    player.level += 1;
    player.xpToNext = Math.round(player.xpToNext * 1.22);
    player.maxHp += 15;
    player.hp = Math.min(player.maxHp, player.hp + 15);
    player.attackPower += 3;
    player.attackSpeed += 0.01;
    markInventoryPanelDirty();
    particles.push({ x: player.x, y: player.y - 20, life: 0.9, text: `LV ${player.level}`, c: '#7dff9e' });
  }

  function collectItem(itemKey) {
    if (isChallengeActive('no_items')) {
      particles.push({ x: player.x, y: player.y - 28, life: 0.85, text: 'NO ITEMS', c: '#ff8a98' });
      return;
    }
    const item = itemRegistry.get(itemKey);
    if (!item) return;
    player.items[itemKey] = getItemCount(itemKey) + 1;
    markInventoryPanelDirty();
    pushItemNotification(itemKey, 1);

    if (itemKey === 'jesters_dice') {
      floorSkipPending += 3;
      const bonusItemCounts = {};
      for (let index = 0; index < 10; index += 1) {
        const rewardPool = ITEM_KEYS.filter(key => key !== 'jesters_dice');
        const key = rewardPool[irand(0, rewardPool.length - 1, 'loot')];
        player.items[key] = getItemCount(key) + 1;
        bonusItemCounts[key] = (bonusItemCounts[key] || 0) + 1;
        if (key === 'titan_heart') {
          player.maxHp = Math.max(120, Math.round(player.maxHp * 1.08));
          player.hp = Math.min(player.maxHp, Math.round(player.hp * 1.08));
        }
      }
      Object.entries(bonusItemCounts).forEach(([key, amount]) => {
        pushItemNotification(key, Number(amount), '(Jester bonus)');
      });
    } else if (itemKey === 'wizards_paw') {
      openWizardPawSelection();
    }

    if (itemKey === 'titan_heart') {
      player.maxHp = Math.max(120, Math.round(player.maxHp * 1.08));
      player.hp = Math.min(player.maxHp, Math.round(player.hp * 1.08));
    }

    if (!metaProgress.unlockedItems.includes(itemKey)) {
      metaProgress.unlockedItems.push(itemKey);
      persistMetaSoon();
      refreshMenuState();
    }

    updateItemUI();

    if (ITEM_KEYS.every(key => getItemCount(key) > 0) && godTimer <= 0) {
      godTimer = 12;
      for (let index = 0; index < 40; index += 1) {
        particles.push({
          x: player.x,
          y: player.y,
          life: 1.1,
          vx: rand(-220, 220),
          vy: rand(-220, 220),
          c: `hsl(${index * 9},100%,60%)`,
        });
      }
    }
  }

  function updateItemUI() {
    uiController.setItemStatus(player?.items || {});
  }

  function loop(timestamp) {
    const framePerfStart = perfBeginFrame(timestamp);
    const dt = Math.min(0.033, (timestamp - lastTime) / 1000 || 0.016);
    lastTime = timestamp;
    const updatePerfStart = perfStart();
    if (gameState === 'play' && !isWizardPawOpen()) update(dt);
    else if (player && (gameState === 'dialogue' || gameState === 'pause')) {
      tickPlayerTransientDefenseTimers(dt);
    } else if (gameState === 'dying' && playerDeathAnim) {
      playerDeathAnim.timer += dt;
      if (playerDeathAnim.timer >= playerDeathAnim.duration) finalizeDeath();
    }
    perfEnd('update', updatePerfStart);
    const uiPerfStart = perfStart();
    uiController.tick(dt);
    perfEnd('ui', uiPerfStart);
    const drawPerfStart = perfStart();
    draw();
    perfEnd('draw', drawPerfStart);
    perfEndFrame(framePerfStart);
    requestAnimationFrame(loop);
  }

  function update(dt) {
    let sectionPerfStart = perfStart();
    const itemStats = getItemStats();
    compactEnemyList();
    gameElapsedTime += dt;
    lavaAnimTime += dt;
    floorTransitionTime += dt;
    if (floorTransitionTime > 2.5) showFloorTransition = false;
    tickCooldowns(dt);
    if (godTimer > 0) godTimer = Math.max(0, godTimer - dt);

    const _b = window.NeoSettings?.getBindings();
    const _right = _b ? _b.right : 'd';
    const _left  = _b ? _b.left  : 'a';
    const _down  = _b ? _b.down  : 's';
    const _up    = _b ? _b.up    : 'w';
    let moveX = (keys[_right] || keys.arrowright ? 1 : 0) - (keys[_left] || keys.arrowleft ? 1 : 0);
    let moveY = (keys[_down]  || keys.arrowdown  ? 1 : 0) - (keys[_up]   || keys.arrowup   ? 1 : 0);
    if (currentRoom?.type !== 'shop' && isPanelOpen(ui.shopPanel)) setShopPanelOpen(false);
    if (currentRoom?.type !== 'anvil' && isPanelOpen(ui.anvilPanel)) setAnvilPanelOpen(false);
    const overlayOpen = isOverlayBlockingInput();
    if (overlayOpen) {
      moveX = 0;
      moveY = 0;
      mouse.down = false;
      mouse.right = false;
      mouse.downQueued = false;
      mouse.rightQueued = false;
    }
    const moveLength = Math.hypot(moveX, moveY) || 1;
    moveX /= moveLength;
    moveY /= moveLength;
    if (moveLength < 0.1) {
      moveX = 0;
      moveY = 0;
    }

    const dashKey = _b ? _b.dash : 'shift';
    const dashHeld = !!keys[dashKey];
    if (!overlayOpen && dashHeld && !dashKeyLatch) {
      tryDash(moveX, moveY);
      dashKeyLatch = true;
    } else if (!dashHeld) {
      dashKeyLatch = false;
    }

    if (player.dashTime > 0) {
      player.dashTime = Math.max(0, player.dashTime - dt);
      player.vx = player.dashX;
      player.vy = player.dashY;
      player.inv = Math.max(player.inv, 0.12);
      if (player.dashTime <= 0) {
        player.dashX = 0;
        player.dashY = 0;
      }
    } else {
      const flightBoost = player.princessFlightTime > 0 ? 2 : 1;
      const targetSpeed = 228 * flightBoost * (godTimer > 0 ? 1.25 : 1) * itemStats.moveSpeedMultiplier;
      player.vx = applyResponsiveVelocity(player.vx, moveX * targetSpeed, dt);
      player.vy = applyResponsiveVelocity(player.vy, moveY * targetSpeed, dt);
      if (player.princessFlightTime > 0 && (moveX || moveY) && nextRandom('fx') < 0.35) {
        particles.push({ x: player.x + rand(12, -12, 'fx'), y: player.y + rand(10, -10, 'fx'), life: 0.2, c: '#ffd1ea' });
      }
    }

    moveCircle(player, dt);

    if (player.cowardsWayTime > 0) {
      player.cowardsWayTime = Math.max(0, player.cowardsWayTime - dt);
      player.inv = Math.max(player.inv, 0.2);
      if (nextRandom('fx') < 0.4) {
        particles.push({ x: player.x + rand(16, -16, 'fx'), y: player.y + rand(16, -16, 'fx'), life: 0.18, c: '#92ffcf' });
      }
    }

    player.inv = Math.max(0, player.inv - dt);
    if (player.swing > 0) player.swing = Math.max(0, player.swing - dt);

    mouse.worldX = mouse.x + camera.x;
    mouse.worldY = mouse.y + camera.y;
    updateWeaponSystems(dt);
    updateRivals(dt);

    const meleeHeld = isMouseActionHeld('slash');
    const laserHeld = isMouseActionHeld('laser');
    if (!overlayOpen && meleeHeld) tryMelee();
    if (!overlayOpen && laserHeld) tryLaser();
    if (keys.f && !teleportKeyLatch) {
      tryChargedLadderWarp();
      teleportKeyLatch = true;
    }
    if (!keys.f) teleportKeyLatch = false;

    if (player.lavaWalkTime > 0) {
      player.lavaWalkTime = Math.max(0, player.lavaWalkTime - dt);
      player.lavaTrailTick -= dt;
      if (player.lavaTrailTick <= 0) {
        hazards.push({
          kind: 'lava',
          x: player.x,
          y: player.y,
          r: 24 * (itemStats.aoeRadiusMultiplier || 1),
          ttl: 1.8,
          pulse: 2.5,
          wobble: 0.35,
          phase: rng() * Math.PI * 2,
        });
        player.lavaTrailTick = 0.22;
      }
    }

    updatePlayerLaser(dt);
    updateChallengeRoomState(dt);

    const cameraLead = 0.08;
    const targetCX = player.x - 480 + player.vx * cameraLead;
    const targetCY = player.y - 320 + player.vy * cameraLead;
    camera.x += (targetCX - camera.x) * 8 * dt;
    camera.y += (targetCY - camera.y) * 8 * dt;
    if (shakeT > 0) {
      shakeT -= dt;
      shake *= 0.88;
    } else {
      shake = 0;
    }
    perfEnd('update.player', sectionPerfStart);

    sectionPerfStart = perfStart();
    let totalBleed = 0;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      enemy.attackCd = Math.max(0, enemy.attackCd - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.inv = Math.max(0, enemy.inv - dt);
      if (enemy.spawnT > 0) { enemy.spawnT = Math.max(0, enemy.spawnT - dt); continue; }

      if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type !== 'god') {
        applyBleed(enemy, Math.max(0, itemStats.passiveBleedStacks - getStatusStacks(enemy, 'bleed')), 0.25);
      } else if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type === 'god') {
        applyBleed(enemy, Math.max(0, Math.max(1, itemStats.passiveBleedStacks - 1) - getStatusStacks(enemy, 'bleed')), 0.25);
      }

      totalBleed += updateEnemyStatuses(enemy, dt);
      if (!enemies.includes(enemy)) continue;
      const eliteTraitControlled = updateEliteEnemyTraits(enemy, dt);
      if (!enemies.includes(enemy)) continue;

      if (!eliteTraitControlled) {
        if (enemy.type === 'god') updateGod(enemy, dt);
        else if (enemy.type === 'queen_cult') updateCultQueenBoss(enemy, dt);
        else if (enemy.type === 'bulk_golem') updateBulkGolemBoss(enemy, dt);
        else if (enemy.type === 'artificer_knave') updateArtificerBoss(enemy, dt);
        else if (enemy.type === 'mirror_knight') updateMirrorChampion(enemy, dt);
        else if (enemy.type === 'rival') updateRivalEnemy(enemy, dt);
        else if (enemy.type === 'cult_mage') updateCultMageEnemy(enemy, dt);
        else if (enemy.type === 'knave') updateKnaveEnemy(enemy, dt);
        else if (enemy.type === 'sniper') updateSniperEnemy(enemy, dt);
        else if (enemy.type === 'machine_gunner') updateMachineGunnerEnemy(enemy, dt);
        else if (enemy.type === 'golem') updateGolemEnemy(enemy, dt);
        else if (enemy.type === 'summoner') updateSummonerEnemy(enemy, dt);
        else if (enemy.type === 'shield_unit') updateShieldUnitEnemy(enemy, dt);
        else if (enemy.type === 'healer') updateHealerEnemy(enemy, dt);
        else if (enemy.type === 'boss_spawner') updateBossSpawnerEnemy(enemy, dt);
        else if (enemy.type === 'laser') updateLaserEnemy(enemy, dt);
        else if (enemy.type === 'charger') updateChargerEnemy(enemy, dt);
        else updateHunterEnemy(enemy, dt);
      }

      if (!enemies.includes(enemy)) continue;
      moveCircle(enemy, dt);
    }

    if (itemStats.bleedHealScale > 0 && totalBleed > 0 && player.hp < player.maxHp) {
      const heal = player.maxHp * 0.012 * totalBleed * itemStats.bleedHealScale * dt;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      if (Math.random() < 0.14) {
        particles.push({ x: player.x + rand(-10, 10), y: player.y - 18, life: 0.5, text: `+${Math.max(1, Math.ceil(heal * 10))}`, c: '#0f8' });
      }
    }
    perfEnd('update.enemies', sectionPerfStart);

    sectionPerfStart = perfStart();
    updateProjectiles(dt);
    perfEnd('update.projectiles', sectionPerfStart);
    sectionPerfStart = perfStart();
    updateWorldProps(dt);
    perfEnd('update.world', sectionPerfStart);
    sectionPerfStart = perfStart();
    updatePlayerStatuses(dt);
    perfEnd('update.statuses', sectionPerfStart);
    sectionPerfStart = perfStart();
    updateChests();
    perfEnd('update.chests', sectionPerfStart);
    sectionPerfStart = perfStart();
    updatePickups(dt);
    perfEnd('update.pickups', sectionPerfStart);
    sectionPerfStart = perfStart();
    updateGardenGrowth();
    perfEnd('update.garden', sectionPerfStart);
    sectionPerfStart = perfStart();
    updateDeadBodies(dt);
    perfEnd('update.corpses', sectionPerfStart);
    sectionPerfStart = perfStart();
    updateParticles(dt);
    perfEnd('update.particles', sectionPerfStart);
    sectionPerfStart = perfStart();
    updateTransitions(dt);
    perfEnd('update.transitions', sectionPerfStart);

    sectionPerfStart = perfStart();
    if (godTimer > 0 && Math.random() < 0.4) {
      particles.push({ x: player.x + rand(-6, 6), y: player.y + rand(-6, 6), life: 0.32, c: `hsl(${(Date.now() / 8) % 360},100%,65%)` });
    }
    perfEnd('update.fx', sectionPerfStart);

    sectionPerfStart = perfStart();
    if (isPanelOpen(ui.shopPanel) && shopPanelDirty) renderShopPanel();
    if (isPanelOpen(ui.invPanel) && inventoryPanelDirty) renderInventoryPanel();
    perfEnd('update.panels', sectionPerfStart);
  }

  function tryChargedLadderWarp() {
    if (getItemCount('charged_adapter') <= 0 || !player.escapeReady) return;
    if (!currentRoom || currentRoom.type === 'boss' || currentRoom.type === 'god') return;
    if (enemies.length === 0) return;

    const ladderRoom = rooms.find(room => room.type === 'ladder') || rooms.find(room => room.type === 'boss');
    if (!ladderRoom || ladderRoom === currentRoom) return;

    const goldSpent = Math.floor(player.coins / 2);
    if (goldSpent > 0) {
      player.coins -= goldSpent;
      metaProgress.coins = Math.max(0, metaProgress.coins - goldSpent);
    }

    consumeCharge('escape');
    enterRoom(ladderRoom);
    particles.push({ x: player.x, y: player.y - 20, life: 0.8, text: 'CHARGED WARP', c: '#b66cff' });
    scheduleRunSave();
  }

  function updateHunterEnemy(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }
    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
    if (distance < enemy.r + player.r + 10 && enemy.attackCd <= 0) {
      const angle = Math.atan2(dy, dx);
      damagePlayer(enemy.dmg, angle, 160, enemy.type);
      enemy.attackCd = 1.05;
    }
  }

  function updateCultMageEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    const hpPct = enemy.hp / enemy.max;
    const desired = hpPct < 0.35 ? 360 : 270;
    const retreat = hpPct < 0.35 && distance < desired ? -1 : 1;
    const direction = distance < desired - 24 ? -retreat : distance > desired + 24 ? retreat : 0;
    if (enemy.attackCd > 0.45 && trySteerEnemyToCover(enemy, dt, desired, 2.6)) {
      // Hold cover while the beam is unavailable instead of idling in open sight.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.5, dt);
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      aimEnemyBeam(enemy, dt, 2.9 * tuning.reaction);
      particles.push({ x: enemy.x, y: enemy.y, life: 0.2, c: '#b455ff' });
      if (enemy.windup <= 0) {
        enemy.beamTime = 0.58;
        enemy.beamTick = 0;
      }
      return;
    }

    if (enemy.beamTime > 0) {
      tickEnemyBeam(enemy, dt, {
        tick: 0.1,
        range: 460,
        knockback: 145,
        damage: enemy.dmg,
        speedDamp: 0.84,
        turnRate: 1.8,
      });
      return;
    }

    if (enemy.attackCd <= 0 && distance < 430) {
      enemy.windup = 0.86 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.18);
      enemy.attackCd = 2.9 * tuning.rangedCadence;
    }
  }

  function updateKnaveEnemy(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.76;
      enemy.vy *= 0.76;
      if (enemy.windup <= 0) {
        if (enemy.state === 'charge') {
          enemy.dashTime = 0.3;
          enemy.dashHit = false;
        } else {
          enemy.swingTime = 0.2;
        }
      }
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 450;
      enemy.vy = Math.sin(enemy.dashAngle) * 450;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 7) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + 6, enemy.dashAngle, 260, enemy.type);
      }
      return;
    }

    if (enemy.swingTime > 0) {
      enemy.swingTime -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      if (enemy.swingTime <= 0 && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 24) {
        const angle = Math.atan2(dy, dx);
        damagePlayer(enemy.dmg + 3, angle, 210, enemy.type);
      }
      return;
    }

    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.8, dt);

    if (enemy.attackCd <= 0) {
      if (distance > 150) {
        enemy.state = 'charge';
        enemy.windup = 0.46;
        enemy.dashAngle = Math.atan2(dy, dx);
        enemy.attackCd = 1.9;
      } else {
        enemy.state = 'stab';
        enemy.windup = 0.2;
        enemy.attackCd = 0.9;
      }
    }
  }

  function updateSniperEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      aimEnemyBeam(enemy, dt, 2.6 * tuning.reaction);
      if (enemy.windup <= 0) {
        const angle = enemy.beamAngle;
        const projectileSpeed = 360 * Math.min(1.4, tuning.reaction);
        projectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * projectileSpeed,
          vy: Math.sin(angle) * projectileSpeed,
          r: 5,
          life: 1.6,
          enemy: true,
          kind: 'sniper_round',
          damage: enemy.dmg + 5,
        });
      }
      return;
    }

    if (enemy.swingTime > 0) {
      enemy.swingTime -= dt;
      enemy.vx *= 0.75;
      enemy.vy *= 0.75;
      if (enemy.swingTime <= 0 && distance < enemy.r + player.r + 20) {
        damagePlayer(enemy.dmg + 2, Math.atan2(dy, dx), 170, enemy.type);
      }
      return;
    }

    const desired = 290;
    const direction = distance < desired - 20 ? -1 : distance > desired + 20 ? 1 : 0;
    if (enemy.attackCd > 0.35 && trySteerEnemyToCover(enemy, dt, desired, 3.8)) {
      // Snipers should relocate behind obstacles between shots.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.6, dt);
    }

    if (enemy.attackCd <= 0) {
      if (distance <= 74) {
        enemy.swingTime = 0.16;
        enemy.attackCd = 0.95 * tuning.rangedCadence;
      } else if (distance < 520) {
        enemy.windup = 0.6 / tuning.reaction;
        enemy.beamAngle = Math.atan2(dy, dx);
        enemy.attackCd = 2.2 * tuning.rangedCadence;
      }
    }
  }

  function updateMachineGunnerEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      aimEnemyBeam(enemy, dt, 3.2 * tuning.reaction);
      particles.push({ x: enemy.x, y: enemy.y, life: 0.12, c: '#ffb55c' });
      if (enemy.windup <= 0) {
        enemy.burstShots = tuning.supportPower >= 1.22 ? 6 : 5;
        enemy.burstDelay = 0;
        enemy.burstAngle = enemy.beamAngle;
      }
      return;
    }

    if ((enemy.burstShots || 0) > 0) {
      enemy.burstDelay -= dt;
      enemy.vx *= 0.8;
      enemy.vy *= 0.8;
      if (enemy.burstDelay <= 0) {
        enemy.burstDelay = 0.085 * Math.max(0.72, tuning.rangedCadence);
        enemy.burstShots -= 1;
        const baseAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        enemy.burstAngle = turnAngleToward(enemy.burstAngle || baseAngle, baseAngle, 0.22 * tuning.reaction);
        const spread = ((nextRandom('encounter') - 0.5) * 0.18) / Math.max(0.92, tuning.reaction);
        const fireAngle = enemy.burstAngle + spread;
        const projectileSpeed = 300 * Math.min(1.45, tuning.reaction + 0.06);
        projectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(fireAngle) * projectileSpeed,
          vy: Math.sin(fireAngle) * projectileSpeed,
          r: 4,
          life: 1.45,
          enemy: true,
          kind: 'machine_round',
          damage: enemy.dmg + 2,
        });
        particles.push({ x: enemy.x + Math.cos(fireAngle) * 10, y: enemy.y + Math.sin(fireAngle) * 10, life: 0.12, c: '#ffcf7a' });
      }
      return;
    }

    const desired = 250;
    const direction = distance < desired - 24 ? -1 : distance > desired + 18 ? 1 : 0;
    if (enemy.attackCd > 0.3 && trySteerEnemyToCover(enemy, dt, desired, 4.1)) {
      // Machine gunners should burst, then duck back toward hard cover.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.9, dt);
    }

    if (enemy.attackCd <= 0) {
      if (distance < 90) {
        enemy.swingTime = 0.16;
        enemy.attackCd = 0.88 * tuning.rangedCadence;
      } else if (distance < 460) {
        enemy.windup = 0.38 / tuning.reaction;
        enemy.beamAngle = Math.atan2(dy, dx);
        enemy.attackCd = 2.45 * tuning.rangedCadence;
      }
    }

    if (enemy.swingTime > 0) {
      enemy.swingTime -= dt;
      enemy.vx *= 0.78;
      enemy.vy *= 0.78;
      if (enemy.swingTime <= 0 && distance < enemy.r + player.r + 18) {
        damagePlayer(enemy.dmg + 3, Math.atan2(dy, dx), 180, enemy.type);
      }
    }
  }

  function updateGolemEnemy(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      if (enemy.windup <= 0) {
        enemy.dashTime = 0.34;
        enemy.dashHit = false;
      }
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 390;
      enemy.vy = Math.sin(enemy.dashAngle) * 390;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 10) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + 6, enemy.dashAngle, 280, enemy.type);
      }
      return;
    }

    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.1, dt);
    if (enemy.attackCd <= 0 && distance < 460) {
      enemy.windup = 0.62;
      enemy.dashAngle = Math.atan2(dy, dx);
      enemy.attackCd = 2.6;
    }
  }

  function updateSummonerEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    const desired = 260;
    const direction = distance < desired - 30 ? -1 : distance > desired + 20 ? 1 : 0;
    if (enemy.attackCd > 0.4 && trySteerEnemyToCover(enemy, dt, desired, 3.2)) {
      // Summoners get time to reposition while their beam is cooling down.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.1, dt);
    }

    enemy.summonCd = Math.max(0, enemy.summonCd - dt);
    if (enemy.summonCd <= 0) {
      enemy.summonCd = (floor >= 4 ? 4.2 : 5) * Math.max(0.72, tuning.rangedCadence);
      const summonCount = floor >= 4 && tuning.supportPower >= 1.22 ? 3 : 2;
      for (let index = 0; index < summonCount; index += 1) {
        const angle = nextRandom('encounter') * Math.PI * 2;
        const px = enemy.x + Math.cos(angle) * (40 + index * 18);
        const py = enemy.y + Math.sin(angle) * (40 + index * 18);
        const safeSpawn = findSafeEnemySpawnPoint(clamp(px, 90, ROOM_W - 90), clamp(py, 90, ROOM_H - 90), 15);
        if (safeSpawn) spawnEnemy('cult_follower', safeSpawn.x, safeSpawn.y, false);
      }
      particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.7, text: 'SUMMON', c: '#d59bff' });
    }

    if (enemy.attackCd <= 0 && distance < 360) {
      enemy.windup = 0.6 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.17);
      enemy.attackCd = 2.6 * tuning.rangedCadence;
    }

    if (enemy.windup > 0 || enemy.beamTime > 0) {
      updateCultMageEnemy(enemy, dt);
    }
  }

  function updateShieldUnitEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    const desired = 180;
    const direction = distance < desired - 18 ? -1 : distance > desired + 24 ? 1 : 0;
    steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.6, dt);

    enemy.supportCd = Math.max(0, enemy.supportCd - dt);
    if (enemy.supportCd <= 0) {
      enemy.supportCd = 2.9 * Math.max(0.76, tuning.rangedCadence);
      enemies.forEach(other => {
        if (!other || other === enemy) return;
        if (dist(enemy.x, enemy.y, other.x, other.y) > 170) return;
        other.barrier = Math.max(other.barrier || 0, Math.round(other.max * 0.22 * tuning.supportPower));
      });
      enemy.barrier = Math.max(enemy.barrier || 0, Math.round(enemy.max * 0.14 * tuning.supportPower));
      particles.push({ x: enemy.x, y: enemy.y, life: 0.55, ring: 82, c: '#7ed6ff' });
      particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.65, text: 'SHIELD', c: '#7ed6ff' });
    }

    if (enemy.attackCd <= 0 && distance < enemy.r + player.r + 22) {
      damagePlayer(enemy.dmg, Math.atan2(dy, dx), 170, enemy.type);
      enemy.attackCd = 1.05 * tuning.rangedCadence;
    }
  }

  function updateHealerEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const nearestWounded = enemies.reduce((best, candidate) => {
      if (candidate === enemy || candidate.hp >= candidate.max) return best;
      const d = dist(enemy.x, enemy.y, candidate.x, candidate.y);
      if (!best || d < best.distance) return { enemy: candidate, distance: d };
      return best;
    }, null);
    const target = nearestWounded?.enemy || player;
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    const desired = nearestWounded ? 120 : 260;
    const direction = distance < desired - 18 ? -1 : distance > desired + 24 ? 1 : 0;
    if (!nearestWounded && enemy.attackCd > 0.4 && trySteerEnemyToCover(enemy, dt, 250, 2.9)) {
      // Healers without an active support target can play safer angles.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.8, dt);
    }

    enemy.supportCd = Math.max(0, enemy.supportCd - dt);
    if (enemy.supportCd <= 0) {
      enemy.supportCd = (floor >= 4 ? 2.1 : 2.8) * Math.max(0.74, tuning.rangedCadence);
      let healedAny = false;
      enemies.forEach(other => {
        if (!other || other === enemy) return;
        if (dist(enemy.x, enemy.y, other.x, other.y) > 170) return;
        const heal = Math.max(8, Math.round(other.max * (floor >= 4 ? 0.08 : 0.05) * tuning.supportPower));
        const nextHp = Math.min(other.max, other.hp + heal);
        if (nextHp !== other.hp) {
          other.hp = nextHp;
          healedAny = true;
          particles.push({ x: other.x, y: other.y - 16, life: 0.6, text: `+${heal}`, c: '#79f7bf' });
        }
      });
      if (healedAny) {
        particles.push({ x: enemy.x, y: enemy.y, life: 0.55, ring: 76, c: '#79f7bf' });
        particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.65, text: 'HEAL', c: '#79f7bf' });
      }
    }

    if (enemy.attackCd <= 0 && !nearestWounded && distance < 350) {
      enemy.windup = 0.54 / tuning.reaction;
      enemy.beamAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x) + rollEnemyBeamBias(enemy, 0.16);
      enemy.attackCd = 2.8 * tuning.rangedCadence;
    }

    if (enemy.windup > 0 || enemy.beamTime > 0) {
      updateLaserEnemy(enemy, dt);
    }
  }

  function updateBossSpawnerEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.92;
      enemy.vy *= 0.92;
    } else {
      const desired = 300;
      const direction = distance < desired - 26 ? -1 : distance > desired + 18 ? 1 : 0;
      if (enemy.attackCd > 0.45 && trySteerEnemyToCover(enemy, dt, desired, 2.5)) {
        // Spawners should avoid open lanes while waiting on their beam.
      } else {
        steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.4, dt);
      }
    }

    enemy.bossSpawnTimer = Math.max(0, enemy.bossSpawnTimer - dt);
    const wholeSeconds = Math.ceil(enemy.bossSpawnTimer);
    if (wholeSeconds > 0 && wholeSeconds <= 10 && wholeSeconds !== enemy.bossSpawnWarnAt) {
      enemy.bossSpawnWarnAt = wholeSeconds;
      particles.push({ x: enemy.x, y: enemy.y - 20, life: 0.85, text: `BOSS ${wholeSeconds}`, c: '#ff8e6c' });
    }

    if (enemy.bossSpawnTimer <= 0) {
      const bossType = getFloorBossType();
      const safeSpawn = findSafeEnemySpawnPoint(enemy.x, enemy.y, 18);
      const bossSpawnerIdx = enemies.indexOf(enemy);
      if (bossSpawnerIdx >= 0) enemies.splice(bossSpawnerIdx, 1);
      particles.push({ x: enemy.x, y: enemy.y, life: 0.8, ring: 120, c: '#ff9b5e' });
      if (safeSpawn) {
        const spawnedBoss = spawnEnemy(bossType, safeSpawn.x, safeSpawn.y, false);
        spawnedBoss.hp = Math.round(spawnedBoss.hp * 0.72);
        spawnedBoss.max = spawnedBoss.hp;
        particles.push({ x: spawnedBoss.x, y: spawnedBoss.y - 24, life: 1, text: 'BOSS SPAWNED', c: '#ffb07b' });
      }
      return;
    }

    if (enemy.attackCd <= 0 && distance < 420) {
      enemy.windup = 0.68 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.16);
      enemy.attackCd = 3.1 * tuning.rangedCadence;
    }

    if (enemy.windup > 0 || enemy.beamTime > 0) {
      updateLaserEnemy(enemy, dt);
    }
  }

  function updateCultQueenBoss(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    enemy.summonCd = Math.max(0, enemy.summonCd - dt);
    if (enemy.summonCd <= 0) {
      enemy.summonCd = 4.6 * Math.max(0.74, tuning.rangedCadence);
      if (!enemy.queenSummonLineShown) {
        enemy.queenSummonLineShown = true;
        sayOverEntity(enemy, 'Come forth, faithful.', { holdTime: 1.7 });
      }
      const summonCount = tuning.supportPower >= 1.22 ? 4 : 3;
      for (let index = 0; index < summonCount; index += 1) {
        const angle = (Math.PI * 2 * index) / 3 + rng() * 0.8;
        const px = enemy.x + Math.cos(angle) * 54;
        const py = enemy.y + Math.sin(angle) * 54;
        const safeSpawn = findSafeEnemySpawnPoint(clamp(px, 90, ROOM_W - 90), clamp(py, 90, ROOM_H - 90), 15);
        if (safeSpawn) spawnEnemy('cult_follower', safeSpawn.x, safeSpawn.y, false);
      }
    }

    updateCultMageEnemy(enemy, dt);
    if (enemy.attackCd <= 0 && distance < enemy.r + player.r + 18) {
      damagePlayer(enemy.dmg + 4, Math.atan2(dy, dx), 250, enemy.type);
      enemy.attackCd = 0.95 * tuning.rangedCadence;
    }
  }

  function updateBulkGolemBoss(enemy, dt) {
    enemy.speed = 78;
    enemy.jumpCd = Math.max(0, Number(enemy.jumpCd || 0) - dt);

    if (enemy.bulkJumpTime > 0) {
      enemy.bulkJumpTime = Math.max(0, enemy.bulkJumpTime - dt);
      const duration = Math.max(0.01, Number(enemy.bulkJumpDuration || 0.82));
      const progress = clamp(1 - enemy.bulkJumpTime / duration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      enemy.x = Number(enemy.bulkJumpStartX || enemy.x) + (Number(enemy.bulkJumpTargetX || enemy.x) - Number(enemy.bulkJumpStartX || enemy.x)) * eased;
      enemy.y = Number(enemy.bulkJumpStartY || enemy.y) + (Number(enemy.bulkJumpTargetY || enemy.y) - Number(enemy.bulkJumpStartY || enemy.y)) * eased;
      enemy.jumpZ = Math.sin(progress * Math.PI) * 92;
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.airborne = true;
      if (progress > 0.62 && !enemy.bulkJumpWarned) {
        enemy.bulkJumpWarned = true;
        particles.push({ x: enemy.bulkJumpTargetX, y: enemy.bulkJumpTargetY, life: 0.32, ring: 76, c: '#ff8844' });
      }
      if (enemy.bulkJumpTime <= 0) {
        enemy.x = Number(enemy.bulkJumpTargetX || enemy.x);
        enemy.y = Number(enemy.bulkJumpTargetY || enemy.y);
        enemy.jumpZ = 0;
        enemy.airborne = false;
        enemy.bulkJumpWarned = false;
        enemy.jumpCd = 2.4;
        const impactRadius = 150;
        particles.push({ x: enemy.x, y: enemy.y, life: 0.55, ring: impactRadius - 38, c: '#ff8844' });
        shake = Math.max(shake, 10);
        shakeT = Math.max(shakeT, 0.18);
        if (dist(enemy.x, enemy.y, player.x, player.y) < impactRadius + player.r) {
          damagePlayer(Math.round(enemy.dmg * 0.85), Math.atan2(player.y - enemy.y, player.x - enemy.x), 330, enemy.type);
        }
      }
      return;
    }

    enemy.airborne = false;
    enemy.jumpZ = 0;
    enemy.aoeTime = Math.max(0, enemy.aoeTime - dt);
    if (enemy.aoeTime <= 0) {
      enemy.aoeTime = 3;
      if (!enemy.bulkNovaLineShown) {
        enemy.bulkNovaLineShown = true;
        sayOverEntity(enemy, 'Break under the weight.', { holdTime: 1.7 });
      }
      const aoeRadius = 240;
      const aoeDamage = Math.round(enemy.dmg * 1.2);
      particles.push({ x: enemy.x, y: enemy.y, life: 0.5, ring: aoeRadius - 60, c: '#ff8844' });
      blastRadius(enemy.x, enemy.y, aoeRadius, aoeDamage, '#ff8844', enemy);
      shake = 12;
      shakeT = 0.2;
    }
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nextX = enemy.x + (dx / distance) * enemy.speed * 0.25;
    const nextY = enemy.y + (dy / distance) * enemy.speed * 0.25;
    const pathBlocked = isBlocked(nextX, enemy.y, enemy.r) && isBlocked(enemy.x, nextY, enemy.r);
    if (enemy.jumpCd <= 0 && (pathBlocked || distance > 230)) {
      const angle = Math.atan2(dy, dx);
      const targetDistance = clamp(distance - 84, 80, 260);
      const preferredX = player.x - Math.cos(angle) * targetDistance + rand(-34, 34, 'encounter');
      const preferredY = player.y - Math.sin(angle) * targetDistance + rand(-34, 34, 'encounter');
      const landing = findSafeEnemySpawnPoint(
        clamp(preferredX, WALL + enemy.r, ROOM_W - WALL - enemy.r),
        clamp(preferredY, WALL + enemy.r, ROOM_H - WALL - enemy.r),
        enemy.r,
      );
      if (landing) {
        enemy.bulkJumpDuration = 0.82;
        enemy.bulkJumpTime = enemy.bulkJumpDuration;
        enemy.bulkJumpStartX = enemy.x;
        enemy.bulkJumpStartY = enemy.y;
        enemy.bulkJumpTargetX = landing.x;
        enemy.bulkJumpTargetY = landing.y;
        enemy.windup = 0;
        enemy.dashTime = 0;
        enemy.jumpCd = 99;
        particles.push({ x: enemy.x, y: enemy.y, life: 0.35, ring: 64, c: '#ffb067' });
        return;
      }
      enemy.jumpCd = 0.8;
    }
    updateGolemEnemy(enemy, dt);
  }

  function spawnPhaseSwords(count, damage) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + rng() * 0.25;
      const sx = player.x + Math.cos(angle) * 110;
      const sy = player.y + Math.sin(angle) * 110;
      const travel = Math.atan2(player.y - sy, player.x - sx);
      projectiles.push({
        x: sx,
        y: sy,
        vx: Math.cos(travel) * 260,
        vy: Math.sin(travel) * 260,
        r: 7,
        life: 1.25,
        enemy: true,
        kind: 'sword',
        damage,
      });
    }
  }

  function spawnGodSwordRing(enemy, count = 10, damage = 26) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + nextRandom('encounter') * 0.18;
      const sx = enemy.x + Math.cos(angle) * 52;
      const sy = enemy.y + Math.sin(angle) * 52;
      projectiles.push({
        x: sx,
        y: sy,
        vx: Math.cos(angle) * 280,
        vy: Math.sin(angle) * 280,
        r: 8,
        life: 1.5,
        enemy: true,
        kind: 'god_sword',
        damage,
      });
    }
  }

  function triggerGodPhase(enemy, phase, title, color = '#fff4b8') {
    enemy.phase = phase;
    enemy.windup = 0;
    enemy.beamTime = 0;
    enemy.beamTick = 0;
    enemy.dashTime = 0;
    enemy.swingTime = 0;
    enemy.attackCd = Math.min(enemy.attackCd || 99, 0.7);
    enemy.inv = Math.max(enemy.inv || 0, 0.35);
    enemy.state = `godPhase${phase}`;
    shake = Math.max(shake, 18 + phase * 2);
    shakeT = Math.max(shakeT, 0.34);
    particles.push({ x: enemy.x, y: enemy.y, life: 1, ring: 150 + phase * 14, c: color });
    particles.push({ x: enemy.x, y: enemy.y - 34, life: 1.2, text: `PHASE ${phase}`, c: color });
    particles.push({ x: enemy.x, y: enemy.y - 14, life: 1, text: title, c: '#ffffff' });
  }

  function spawnGodCouncil(enemy) {
    const bossTypes = ['queen_cult', 'bulk_golem', 'artificer_knave'];
    const spawnAngles = [-Math.PI * 0.5, Math.PI * 0.16, Math.PI * 0.84];
    bossTypes.forEach((type, index) => {
      const angle = spawnAngles[index] || ((Math.PI * 2 * index) / bossTypes.length);
      const px = clamp(enemy.x + Math.cos(angle) * 220, 110, ROOM_W - 110);
      const py = clamp(enemy.y + Math.sin(angle) * 220, 110, ROOM_H - 110);
      const safeSpawn = findSafeEnemySpawnPoint(px, py, 18) || findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2, 18);
      if (!safeSpawn) return;
      const boss = spawnEnemy(type, safeSpawn.x, safeSpawn.y, false);
      boss.hp = Math.round(boss.hp * 0.85);
      boss.max = boss.hp;
      boss.attackCd = Math.min(boss.attackCd, 0.8);
      particles.push({ x: boss.x, y: boss.y - 24, life: 1.05, text: getBossLabel(type), c: '#ffcf8a' });
    });
  }

  function updateArtificerBoss(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const hpPct = enemy.hp / enemy.max;
    const previousPhase = enemy.phase || 1;
    if (hpPct < 0.34) enemy.phase = 3;
    else if (hpPct < 0.67) enemy.phase = 2;
    else enemy.phase = 1;
    if (enemy.phase >= 2 && previousPhase < 2 && !enemy.artificerPhaseLineShown) {
      enemy.artificerPhaseLineShown = true;
      sayOverEntity(enemy, 'Then bleed trying.', { holdTime: 1.7 });
    }

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.phase === 1) {
      enemy.speed = 132;
      updateKnaveEnemy(enemy, dt);
      return;
    }

    if (enemy.phase === 2) {
      enemy.speed = 120;
      if (enemy.attackCd <= 0) {
        spawnPhaseSwords(8, 14);
        enemy.attackCd = 2.35 * tuning.rangedCadence;
      }
      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
      if (distance < enemy.r + player.r + 14 && enemy.swingTime <= 0) {
        enemy.swingTime = 0.2;
      }
      if (enemy.swingTime > 0) {
        enemy.swingTime -= dt;
        if (enemy.swingTime <= 0 && distance < enemy.r + player.r + 24) {
          damagePlayer(enemy.dmg + 3, Math.atan2(dy, dx), 210, enemy.type);
        }
      }
      return;
    }

    enemy.speed = 62;
    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.2, dt);
    if (enemy.attackCd <= 0) {
      enemy.windup = 0.72 / tuning.reaction;
      enemy.state = 'phase3_swing';
      enemy.attackCd = 6 * tuning.rangedCadence;
    }
    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.74;
      enemy.vy *= 0.74;
      if (enemy.windup <= 0) {
        const angle = Math.atan2(dy, dx);
        if (distance < enemy.r + player.r + 54) {
          damagePlayer(enemy.dmg + 16, angle, 340, 'storm');
        }
        particles.push({ x: enemy.x, y: enemy.y, life: 0.6, ring: 86, c: '#ffd27d' });
      }
    }
  }

  function updateLaserEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      aimEnemyBeam(enemy, dt, 3.3 * tuning.reaction);
      particles.push({ x: enemy.x, y: enemy.y, life: 0.16, c: '#aa66ff' });
      if (enemy.windup <= 0) {
        enemy.beamTime = 0.46;
        enemy.beamTick = 0;
      }
      return;
    }

    if (enemy.beamTime > 0) {
      tickEnemyBeam(enemy, dt, {
        tick: 0.11 * Math.max(0.74, tuning.rangedCadence),
        range: 430,
        knockback: 130,
        damage: enemy.dmg,
        speedDamp: 0.84,
        turnRate: 2.3 * tuning.reaction,
      });
      return;
    }

    const desired = 230;
    const direction = distance < desired - 25 ? -1 : distance > desired + 25 ? 1 : 0;
    if (enemy.attackCd > 0.35 && trySteerEnemyToCover(enemy, dt, desired, 3.3)) {
      // Laser units should search for cover when their firing lane is not active.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.2, dt);
    }
    if (enemy.attackCd <= 0 && distance < 390) {
      enemy.windup = 0.78 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.2);
      enemy.attackCd = 2.8 * tuning.rangedCadence;
    }
  }

  function updateEliteEnemyTraits(enemy, dt) {
    if (!enemy?.elite || !Array.isArray(enemy.eliteTypes)) return false;
    const distanceToPlayer = player ? dist(enemy.x, enemy.y, player.x, player.y) : Infinity;

    if (enemy.eliteTypes.includes('burning')) {
      enemy.burningTick = Math.max(0, Number(enemy.burningTick || 0) - dt);
      if (enemy.burningTick <= 0) {
        enemy.burningTick = 1.15;
        particles.push({ x: enemy.x + rand(-10, 10, 'fx'), y: enemy.y + rand(-10, 10, 'fx'), life: 0.24, c: '#ff9a3c' });
        if (distanceToPlayer < enemy.r + player.r + 34) applyFire(player, 1, 2.8);
      }
    }

    if (enemy.eliteTypes.includes('bleeding')) {
      enemy.bleedingTick = Math.max(0, Number(enemy.bleedingTick || 0) - dt);
      if (enemy.bleedingTick <= 0) {
        enemy.bleedingTick = 1.25;
        particles.push({ x: enemy.x + rand(-8, 8, 'fx'), y: enemy.y + rand(-8, 8, 'fx'), life: 0.22, c: '#ff4256' });
        if (distanceToPlayer < enemy.r + player.r + 28) applyStatus(player, 'bleed', 1, 2.2);
      }
    }

    if (!enemy.eliteTypes.includes('lasered')) return false;
    if (enemy.beamTime > 0 && enemy.state === 'elite_laser') {
      tickEnemyBeam(enemy, dt, {
        tick: enemy.eliteLaserMode === 'god_sweep' ? 0.055 : enemy.eliteLaserMode === 'turtle_wave' ? 0.08 : 0.1,
        range: enemy.eliteLaserMode === 'turtle_wave' ? 620 : enemy.eliteLaserMode === 'god_sweep' ? 560 : 430,
        knockback: enemy.eliteLaserMode === 'turtle_wave' ? 190 : enemy.eliteLaserMode === 'god_sweep' ? 145 : 125,
        damage: enemy.dmg + (enemy.eliteLaserMode === 'turtle_wave' ? 14 : enemy.eliteLaserMode === 'god_sweep' ? 8 : 0),
        speedDamp: 0.84,
        turnRate: enemy.eliteLaserMode === 'god_sweep' ? 0 : 2.6,
        onTick: activeEnemy => {
          if (activeEnemy.eliteLaserMode === 'god_sweep') activeEnemy.beamAngle += Number(activeEnemy.eliteSweepSpeed || 3.8) * 0.055;
        },
        onEnd: activeEnemy => {
          activeEnemy.state = 'idle';
          activeEnemy.eliteLaserCd = 1.35;
        },
      });
      return true;
    }

    enemy.eliteLaserCd = Math.max(0, Number(enemy.eliteLaserCd || 0) - dt);
    if (enemy.eliteLaserCd > 0 || distanceToPlayer > 520) return false;

    const modes = ['blood_beam', 'turtle_wave', 'power_disks', 'blade_justice', 'lightning_columns', 'god_sweep'];
    const mode = modes[Number(enemy.eliteLaserModeIndex || 0) % modes.length];
    enemy.eliteLaserModeIndex = Number(enemy.eliteLaserModeIndex || 0) + 1;
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);

    if (mode === 'power_disks') {
      for (let index = 0; index < 5; index += 1) {
        const spread = (index - 2) * 0.16;
        projectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle + spread) * 360,
          vy: Math.sin(angle + spread) * 360,
          r: 7,
          life: 1.15,
          enemy: true,
          kind: 'power_disk',
          damage: Math.round(enemy.dmg * 0.72),
          color: '#d890ff',
          knockback: 110,
        });
      }
      enemy.eliteLaserCd = 1.4;
      return false;
    }

    if (mode === 'blade_justice') {
      if (distanceToPlayer < 150) damagePlayer(enemy.dmg + 10, angle, 240, 'elite_blade_justice');
      particles.push({ x: enemy.x, y: enemy.y, life: 0.34, ring: 112, c: '#ffffff' });
      enemy.eliteLaserCd = 1.2;
      return false;
    }

    if (mode === 'lightning_columns') {
      for (let index = 0; index < 2; index += 1) {
        const px = clamp(player.x + rand(-70, 70, 'encounter'), WALL + 60, ROOM_W - WALL - 60);
        const py = clamp(player.y + rand(-70, 70, 'encounter'), WALL + 60, ROOM_H - WALL - 60);
        hazards.push({ kind: 'lightning_column', x: px, y: py, r: 46, ttl: 1.25, tick: 0, interval: 0.36, damage: Math.round(enemy.dmg * 0.78) });
        particles.push({ x: px, y: py, life: 0.28, ring: 18, c: '#8dd4ff' });
      }
      enemy.eliteLaserCd = 1.6;
      return false;
    }

    enemy.state = 'elite_laser';
    enemy.eliteLaserMode = mode === 'god_sweep' ? 'god_sweep' : mode === 'turtle_wave' ? 'turtle_wave' : 'blood_beam';
    enemy.beamAngle = angle;
    enemy.beamTime = enemy.eliteLaserMode === 'god_sweep' ? 1.4 : enemy.eliteLaserMode === 'turtle_wave' ? 0.9 : 0.56;
    enemy.beamTick = 0;
    enemy.eliteSweepSpeed = (nextRandom('encounter') < 0.5 ? -1 : 1) * 4.1;
    enemy.eliteLaserCd = 99;
    particles.push({ x: enemy.x, y: enemy.y - enemy.r - 14, life: 0.45, text: MOVE_DEFS[mode]?.name || 'LASER', c: '#8dd4ff' });
    return true;
  }

  function updateChargerEnemy(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      particles.push({ x: enemy.x, y: enemy.y, life: 0.14, c: '#ff8844' });
      if (enemy.windup <= 0) {
        enemy.dashTime = 0.32;
        enemy.dashHit = false;
      }
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 430;
      enemy.vy = Math.sin(enemy.dashAngle) * 430;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 6) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + 4, enemy.dashAngle, 240, enemy.type);
      }
      return;
    }

    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.1, dt);
    if (enemy.attackCd <= 0 && distance < 420) {
      enemy.windup = 0.52;
      enemy.dashAngle = Math.atan2(dy, dx);
      enemy.attackCd = 2.4;
    }
  }

  function updateMirrorChampion(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const angleToPlayer = Math.atan2(dy, dx);

    enemy.mirrorLaserCd = Math.max(0, (enemy.mirrorLaserCd || 0) - dt);
    enemy.mirrorSmashCd = Math.max(0, (enemy.mirrorSmashCd || 0) - dt);
    enemy.mirrorDashCd = Math.max(0, (enemy.mirrorDashCd || 0) - dt);

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.78;
      enemy.vy *= 0.78;
      if (enemy.state === 'mirrorLaser') aimEnemyBeam(enemy, dt, 3.4);
      particles.push({ x: enemy.x, y: enemy.y, life: 0.16, c: '#d7f6ff' });
      if (enemy.windup <= 0) {
        if (enemy.state === 'mirrorLaser') {
          enemy.beamTime = 0.56;
          enemy.beamTick = 0;
        } else if (enemy.state === 'mirrorDash') {
          enemy.dashTime = 0.18;
          enemy.dashHit = false;
        } else if (enemy.state === 'mirrorSmash') {
          particles.push({ x: enemy.x, y: enemy.y, life: 0.42, ring: 118, c: '#ff6dc7' });
          if (dist(enemy.x, enemy.y, player.x, player.y) <= ATTACKS.smash.radius + player.r) {
            damagePlayer(enemy.smashDamage || enemy.dmg + 18, angleToPlayer, 300, enemy.type);
          }
          enemy.mirrorSmashCd = 5.4 / Math.max(0.5, enemy.attackSpeed || 1);
          enemy.attackCd = 0.75;
        }
      }
      return;
    }

    if (enemy.beamTime > 0) {
      tickEnemyBeam(enemy, dt, {
        tick: 0.08,
        range: ATTACKS.laser.range,
        knockback: 95,
        damage: enemy.beamDamage || enemy.dmg,
        speedDamp: 0.84,
        turnRate: 2.8,
        onEnd: activeEnemy => {
          activeEnemy.attackCd = 0.62;
          activeEnemy.mirrorLaserCd = 4.2 / Math.max(0.5, activeEnemy.attackSpeed || 1);
        },
      });
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 560;
      enemy.vy = Math.sin(enemy.dashAngle) * 560;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 6) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + 8, enemy.dashAngle, 240, enemy.type);
      }
      if (enemy.dashTime <= 0) {
        enemy.attackCd = 0.45;
        enemy.mirrorDashCd = 1.8 / Math.max(0.5, enemy.attackSpeed || 1);
      }
      return;
    }

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    const preferred = distance > 220 ? 1 : distance < 92 ? -1 : 0.3;
    steerEnemy(enemy, dx / distance * preferred, dy / distance * preferred, enemy.speed, 5.2, dt);

    if (distance < ATTACKS.melee.range + player.r + 6 && enemy.attackCd <= 0) {
      damagePlayer(enemy.dmg, angleToPlayer, ATTACKS.melee.push, enemy.type);
      enemy.attackCd = Math.max(0.26, 0.42 / Math.max(0.5, enemy.attackSpeed || 1));
      enemy.swingTime = ATTACKS.melee.active;
      return;
    }

    if (enemy.attackCd <= 0) {
      if (enemy.mirrorSmashCd <= 0 && distance < 170) {
        enemy.state = 'mirrorSmash';
        enemy.windup = 0.48;
      } else if (enemy.mirrorLaserCd <= 0 && distance > 120) {
        enemy.state = 'mirrorLaser';
        enemy.windup = 0.52;
        enemy.beamAngle = angleToPlayer + rollEnemyBeamBias(enemy, 0.14);
      } else if (enemy.mirrorDashCd <= 0 && distance > 180) {
        enemy.state = 'mirrorDash';
        enemy.windup = 0.18;
        enemy.dashAngle = angleToPlayer;
      } else {
        enemy.attackCd = 0.18;
      }
    }
  }

  function updateChallengeRoomState(dt) {
    if (!currentRoom || currentRoom.type !== 'challenge' || currentRoom.cleared || !currentRoom.challengeStarted) return;
    const type = currentRoom.challengeType || 'mirror';

    if (type === 'stillness') {
      const graceTimer = Math.max(0, Number(currentRoom.challengeData?.graceTimer || 0));
      currentRoom.challengeData.graceTimer = Math.max(0, graceTimer - dt);
      const bindings = window.NeoSettings?.getBindings();
      const rightKey = bindings ? bindings.right : 'd';
      const leftKey = bindings ? bindings.left : 'a';
      const downKey = bindings ? bindings.down : 's';
      const upKey = bindings ? bindings.up : 'w';
      const dashKey = bindings ? bindings.dash : 'shift';
      const moved = !!(
        keys[rightKey] || keys.arrowright
        || keys[leftKey] || keys.arrowleft
        || keys[downKey] || keys.arrowdown
        || keys[upKey] || keys.arrowup
        || keys[dashKey]
      );
      if (!moved) {
        currentRoom.challengeTimer = Math.max(0, (currentRoom.challengeTimer || 0) - dt);
        if (currentRoom.challengeTimer <= 0) completeChallengeTrial('STILLNESS HELD');
      } else if (graceTimer <= 0) {
        particles.push({ x: player.x, y: player.y - 20, life: 0.7, text: 'TRIAL FAILED', c: '#ff8b98' });
        failChallengeTrial('STILLNESS BROKEN');
      }
      return;
    }

    if (type === 'survival') {
      currentRoom.challengeTimer = Math.max(0, (currentRoom.challengeTimer || 0) - dt);
      currentRoom.challengeTick = Math.max(0, (currentRoom.challengeTick || 0) - dt);
      if (currentRoom.challengeTick <= 0) {
        currentRoom.challengeTick = 1.7;
        spawnTrialEnemyWave(floor >= 6 ? 2 : 1);
      }
      if (currentRoom.challengeTimer <= 0) {
        enemies.splice(0, enemies.length);
        completeChallengeTrial('SURVIVED');
      }
      return;
    }

    if (type === 'runes') {
      currentRoom.challengeTimer = Math.max(0, (currentRoom.challengeTimer || 0) - dt);
      if (currentRoom.challengeTimer <= 0) {
        failChallengeTrial('RUNES FADING');
      }
      return;
    }

    if (type === 'storm') {
      currentRoom.challengeTimer = Math.max(0, (currentRoom.challengeTimer || 0) - dt);
      currentRoom.challengeTick = Math.max(0, (currentRoom.challengeTick || 0) - dt);
      if (currentRoom.challengeTick <= 0) {
        currentRoom.challengeTick = 0.85;
        for (let index = 0; index < 3; index += 1) {
          const px = 110 + nextRandom('world') * (ROOM_W - 220);
          const py = 110 + nextRandom('world') * (ROOM_H - 220);
          hazards.push({
            kind: 'lightning_column',
            x: px,
            y: py,
            r: 52,
            ttl: 1.6,
            tick: 0,
            interval: 0.42,
            damage: 18 + floor,
          });
          particles.push({ x: px, y: py, life: 0.35, ring: 18, c: '#8dd4ff' });
        }
      }
      if (currentRoom.challengeTimer <= 0) completeChallengeTrial('STORM ENDED');
    }
  }

  function updateGod(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const hpPct = enemy.hp / enemy.max;

    if (enemy.rebirthUsed && !enemy.phase3Triggered && hpPct <= 0.2) {
      enemy.phase3Triggered = true;
      enemy.dmg = Math.round(enemy.dmg * 1.2);
      enemy.speed *= 1.08;
      enemy.novaCd = 1.9;
      triggerGodPhase(enemy, 3, 'COUNCIL OF BOSSES', '#ffd27d');
      spawnGodCouncil(enemy);
      playGodDialogue(3);
      return;
    } else if (enemy.rebirthUsed && enemy.phase3Triggered && !enemy.phase4Triggered && hpPct <= 0.12) {
      enemy.phase4Triggered = true;
      enemy.dmg = Math.round(enemy.dmg * 1.16);
      enemy.speed *= 1.06;
      enemy.novaCd = 1.25;
      enemy.judgementCd = 2.7;
      triggerGodPhase(enemy, 4, 'HOLY ONSLAUGHT', '#ff9f6e');
      spawnGodSwordRing(enemy, 24, Math.round(enemy.dmg * 1.05));
      playGodDialogue(4);
      return;
    } else if (enemy.rebirthUsed && enemy.phase4Triggered && !enemy.phase5Triggered && hpPct <= 0.06) {
      enemy.phase5Triggered = true;
      enemy.dmg = Math.round(enemy.dmg * 1.22);
      enemy.speed *= 1.08;
      enemy.novaCd = 0.78;
      enemy.judgementCd = 1.45;
      triggerGodPhase(enemy, 5, 'LAST JUDGEMENT', '#ff5a5a');
      spawnGodSwordRing(enemy, 32, Math.round(enemy.dmg * 1.15));
      playGodDialogue(5);
      return;
    }

    const phaseLevel = enemy.phase || 1;
    const phaseTwo = phaseLevel >= 2;
    const phaseFour = phaseLevel >= 4;
    const phaseFive = phaseLevel >= 5;
    const cadenceMult = phaseFive ? 0.42 : phaseFour ? 0.52 : phaseLevel >= 3 ? 0.6 : phaseTwo ? 0.68 : 1;
    const reactionMult = phaseFive ? 1.45 : phaseFour ? 1.34 : phaseLevel >= 3 ? 1.28 : phaseTwo ? 1.22 : 1;
    const desired = phaseFive ? 138 : phaseFour ? 146 : phaseTwo ? 156 : 190;

    if (phaseFour) {
      enemy.novaCd = Math.max(0, (enemy.novaCd || 0) - dt);
      if (enemy.novaCd <= 0) {
        const swordCount = phaseFive ? 20 : 14;
        const swordDamage = Math.round(enemy.dmg * (phaseFive ? 1.08 : 0.92));
        spawnGodSwordRing(enemy, swordCount, swordDamage);
        enemy.novaCd = phaseFive ? 0.78 : 1.25;
      }
    }

    if (phaseFive) {
      enemy.judgementCd = Math.max(0, (enemy.judgementCd || 0) - dt);
      if (enemy.judgementCd <= 0) {
        spawnPhaseSwords(16, Math.round(enemy.dmg * 0.82));
        particles.push({ x: player.x, y: player.y, life: 0.42, ring: 118, c: '#ff7a7a' });
        enemy.judgementCd = 1.45;
      }
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.74;
      enemy.vy *= 0.74;
      if (enemy.state === 'godLaser') aimEnemyBeam(enemy, dt, 3.1 * tuning.reaction * reactionMult);
      particles.push({ x: enemy.x, y: enemy.y, life: 0.18, c: '#ffffff' });
      if (enemy.windup <= 0) {
        if (enemy.state === 'godLaser') {
          enemy.beamTime = phaseTwo ? 0.98 : 0.78;
          enemy.beamTick = 0;
        }
        if (enemy.state === 'godSweep') {
          enemy.beamTime = phaseFour ? 2.7 : phaseTwo ? 2.35 : 1.9;
          enemy.beamTick = 0;
          enemy.sweepSpeed = 3.9 * reactionMult * (enemy.sweepDir || 1);
        }
        if (enemy.state === 'godCharge') {
          enemy.dashTime = phaseFour ? 0.76 : phaseTwo ? 0.62 : 0.48;
          enemy.dashHit = false;
        }
        if (enemy.state === 'godSwordRing') {
          const swordCount = phaseFive ? 30 : phaseFour ? 24 : phaseTwo ? 18 : 12;
          const swordDamage = Math.round(enemy.dmg * (phaseFour ? 1.02 : phaseTwo ? 0.95 : 0.82));
          spawnGodSwordRing(enemy, swordCount, swordDamage);
          enemy.attackCd = 1.2 * tuning.rangedCadence * cadenceMult;
        }
      }
      return;
    }

    if (enemy.beamTime > 0) {
      const isSweep = enemy.state === 'godSweep';
      tickEnemyBeam(enemy, dt, {
        tick: (isSweep ? 0.045 : 0.08) * Math.max(0.64, tuning.rangedCadence * cadenceMult),
        range: enemy.beamRange || 620,
        knockback: isSweep ? (phaseFour ? 260 : 210) : (phaseFour ? 180 : 150),
        damage: isSweep ? enemy.dmg + (phaseFive ? 38 : phaseTwo ? 28 : 18) : enemy.dmg + (phaseFour ? 18 : phaseTwo ? 12 : 6),
        speedDamp: 0.86,
        turnRate: isSweep ? 0 : 2.2 * tuning.reaction * reactionMult,
        onTick: isSweep
          ? activeEnemy => {
            activeEnemy.beamAngle += activeEnemy.sweepSpeed * 0.045;
          }
          : null,
        onEnd: activeEnemy => {
          activeEnemy.attackCd = (isSweep ? 1.45 : 1) * tuning.rangedCadence * cadenceMult;
        },
      });
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      const dashSpeed = phaseFive ? 710 : phaseFour ? 660 : phaseTwo ? 620 : 500;
      enemy.vx = Math.cos(enemy.dashAngle) * dashSpeed;
      enemy.vy = Math.sin(enemy.dashAngle) * dashSpeed;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 10) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + (phaseFive ? 34 : phaseTwo ? 24 : 12), enemy.dashAngle, phaseFour ? 410 : phaseTwo ? 360 : 300, enemy.type);
      }
      if (enemy.dashTime <= 0) enemy.attackCd = 1.1 * tuning.rangedCadence * cadenceMult;
      return;
    }

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    const direction = distance < desired - 10 ? -1 : distance > desired + 20 ? 1 : 0.5;
    steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, phaseFour ? 6.2 : phaseTwo ? 5.5 : 4.6, dt);

    if (distance < enemy.r + player.r + 12 && enemy.attackCd <= 0) {
      const angle = Math.atan2(dy, dx);
      damagePlayer(enemy.dmg + (phaseFive ? 26 : phaseTwo ? 18 : 10), angle, phaseFour ? 370 : phaseTwo ? 320 : 260, enemy.type);
      enemy.attackCd = 0.8 * tuning.rangedCadence * cadenceMult;
      return;
    }

    if (enemy.attackCd <= 0) {
      const roll = nextRandom('encounter');
      if ((phaseTwo && distance > 250 && roll > (phaseFour ? 0.46 : 0.52)) || (!phaseTwo && distance > 300 && roll > 0.68)) {
        enemy.state = 'godSweep';
        enemy.windup = 1.15 / (tuning.reaction * reactionMult);
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.1);
        enemy.sweepDir = nextRandom('encounter') < 0.5 ? -1 : 1;
      } else if (roll > (phaseFive ? 0.16 : phaseTwo ? 0.26 : 0.42)) {
        enemy.state = 'godLaser';
        enemy.windup = 0.82 / (tuning.reaction * reactionMult);
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.12);
      } else if (roll > (phaseFour ? 0.04 : phaseTwo ? 0.08 : 0.18)) {
        enemy.state = 'godSwordRing';
        enemy.windup = 0.6 / (tuning.reaction * reactionMult);
      } else {
        enemy.state = 'godCharge';
        enemy.windup = 0.44 / (tuning.reaction * reactionMult);
        enemy.dashAngle = Math.atan2(dy, dx);
      }
      enemy.attackCd = 2.15 * tuning.rangedCadence * cadenceMult;
    }
  }

  function steerEnemy(enemy, dirX, dirY, maxSpeed, accel, dt) {
    enemy.vx += (dirX * maxSpeed - enemy.vx) * accel * dt;
    enemy.vy += (dirY * maxSpeed - enemy.vy) * accel * dt;
  }

  function moveCircle(entity, dt) {
    if (entity.airborne) {
      entity.x = clamp(entity.x, WALL + entity.r, ROOM_W - WALL - entity.r);
      entity.y = clamp(entity.y, WALL + entity.r, ROOM_H - WALL - entity.r);
      return;
    }
    const nextX = entity.x + entity.vx * dt;
    const nextY = entity.y + entity.vy * dt;
    if (!isBlocked(nextX, entity.y, entity.r)) entity.x = nextX;
    else entity.vx *= -0.4;
    if (!isBlocked(entity.x, nextY, entity.r)) entity.y = nextY;
    else entity.vy *= -0.4;
    entity.x = clamp(entity.x, WALL + entity.r, ROOM_W - WALL - entity.r);
    entity.y = clamp(entity.y, WALL + entity.r, ROOM_H - WALL - entity.r);
  }

  function damagePlayer(amount, angle, knockback, source = '', options = {}) {
    const ignoreInv = !!options.ignoreInv;
    const applyHitstop = !options.noInvFrames;
    const showPopup = options.showPopup !== false;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      if (!Number.isFinite(numericAmount)) console.warn('Ignored invalid player damage', { amount, source });
      return;
    }
    if (!Number.isFinite(Number(player.maxHp)) || Number(player.maxHp) <= 0) player.maxHp = 120;
    if (!Number.isFinite(Number(player.hp))) player.hp = player.maxHp;
    if (!ignoreInv && player.inv > 0) return;
    if (player.blockActive && !options.ignoreBlock) {
      particles.push({ x: player.x, y: player.y - 20, life: 0.3, text: 'BLOCK', c: '#9cefff' });
      return;
    }
    if (isChallengeActive('no_hit')) {
      lastDamageSource = getDamageSourceLabel(source || 'no_hit');
      lastDamageSourceKey = String(source || 'no_hit');
      player.hp = 0;
      player.inv = 0;
      shake = 10;
      shakeT = 0.18;
      particles.push({ x: player.x, y: player.y - 24, life: 0.95, text: 'HIT RUN FAILED', c: '#ff7a88' });
      die();
      return;
    }
    const itemStats = getItemStats();
    const hpBeforeHit = player.hp;
    const halfHpThreshold = player.maxHp * 0.5;
    const ironLungApplies = itemStats.hasIronLung && !isBossFightActive();
    let finalAmount = numericAmount * (isChallengeActive('glass_cannon') ? 1.35 : 1) * (1 - (itemStats.damageReduction || 0));
    if (ironLungApplies) {
      const roomCap = player.maxHp * 0.2;
      const remaining = roomCap - (player.roomDamageTaken || 0);
      if (remaining <= 0) {
        if (player.hp <= 0) die();
        return;
      }
      finalAmount = Math.min(finalAmount, remaining);
    }
    finalAmount = Math.max(0, finalAmount);
    if (finalAmount <= 0) return;
    lastDamageSource = getDamageSourceLabel(source);
    lastDamageSourceKey = String(source || '');

    player.hp -= finalAmount;

    if (getItemCount('insurance') > 0 && player.insuranceReady && hpBeforeHit > halfHpThreshold && player.hp <= halfHpThreshold) {
      player.hp = Math.max(player.hp, halfHpThreshold);
      consumeCharge('insurance');
      particles.push({ x: player.x, y: player.y - 30, life: 0.8, text: 'INSURANCE USED', c: '#e6eeff' });
    }

    finalAmount = Math.max(0, hpBeforeHit - player.hp);
    if (ironLungApplies) player.roomDamageTaken = (player.roomDamageTaken || 0) + finalAmount;

    if (applyHitstop) {
      player.inv = 0.75;
      player.vx += Math.cos(angle) * knockback;
      player.vy += Math.sin(angle) * knockback;
      shake = 8;
      shakeT = 0.15;
    }
    if (showPopup && finalAmount >= 1) {
      spawnDamagePopup(player.x, player.y - 18, finalAmount, { color: '#ff6b6b', size: 16 });
    }
    if (player.hp <= 0) {
      if (gameMode === 'practice') {
        player.hp = player.maxHp;
        particles.push({ x: player.x, y: player.y - 30, life: 0.9, text: 'PRACTICE — NO DEATH', c: '#a880ff' });
      } else {
        die();
      }
    }
  }

  function tickPlayerStatus(key, dt, config) {
    const state = getStatusState(player, key);
    if (state.stacks <= 0) return;
    state.duration -= dt;
    state.tick -= dt;
    if (state.tick <= 0) {
      state.tick = config.interval;
      const damage = Math.max(0.25, config.damage(state.stacks));
      damagePlayer(damage, 0, 0, key, { ignoreInv: true, noInvFrames: true });
      if (Math.random() < 0.3) {
        particles.push({ x: player.x + rand(-8, 8), y: player.y + rand(-8, 8), life: 0.25, c: config.color });
      }
    }
    if (state.duration <= 0) clearStatus(player, key);
  }

  function updatePlayerStatuses(dt) {
    if (!player) return;
    player.critCharmBuffTime = Math.max(0, Number(player.critCharmBuffTime || 0) - dt);
    player.keenEyeBuffTime = Math.max(0, Number(player.keenEyeBuffTime || 0) - dt);
    player.chronoSpringBuffTime = Math.max(0, Number(player.chronoSpringBuffTime || 0) - dt);
    tickPlayerStatus('bleed', dt, {
      interval: 0.5,
      damage: stacks => 1.2 + stacks * 1.3,
      color: STATUS_STYLES.bleed.color,
    });
    tickPlayerStatus('fire', dt, {
      interval: 0.45,
      damage: stacks => 1 + stacks * 1.6,
      color: STATUS_STYLES.fire.color,
    });
    tickPlayerStatus('poison', dt, {
      interval: 0.7,
      damage: stacks => player.maxHp * (0.004 + stacks * 0.0025),
      color: STATUS_STYLES.poison.color,
    });
    tickPlayerStatus('dark_drain', dt, {
      interval: 0.6,
      damage: stacks => (1 + stacks * 1.7) * 0.1,
      color: STATUS_STYLES.dark_drain.color,
    });
  }

  function blastRadius(x, y, radius, damage, color, sourceEnemy = null) {
    spawnAoeShockwave(x, y, radius, color, damage >= 28 ? 'heavy' : 'normal');
    if (sourceEnemy && player && dist(x, y, player.x, player.y) <= radius + player.r) {
      damagePlayer(damage, Math.atan2(player.y - y, player.x - x), 200, sourceEnemy.type || 'enemy_aoe');
    }
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      if (sourceEnemy && enemy === sourceEnemy) continue;
      if (dist(x, y, enemy.x, enemy.y) > radius + enemy.r) continue;
      hitEnemy(enemy, damage, Math.atan2(enemy.y - y, enemy.x - x), 180, color);
    }
    destructibles.forEach(prop => {
      if (!prop.broken && !prop.hidden && dist(x, y, prop.x, prop.y) <= radius + prop.r) damageDestructible(prop, damage);
    });
  }

  function spawnAoeShockwave(x, y, radius, color = '#ff66cc', style = 'normal') {
    particles.push({
      x,
      y,
      life: AOE_SHOCKWAVE_LIFE,
      maxLife: AOE_SHOCKWAVE_LIFE,
      shockwave: true,
      radius,
      c: color,
      style,
    });
    const sparks = style === 'heavy' ? 12 : 7;
    for (let index = 0; index < sparks; index += 1) {
      const angle = (index / sparks) * Math.PI * 2 + rand(0.22, -0.22, 'fx');
      const speed = rand(170, 70, 'fx');
      particles.push({
        x: x + Math.cos(angle) * Math.min(radius * 0.3, 34),
        y: y + Math.sin(angle) * Math.min(radius * 0.3, 34),
        life: rand(0.34, 0.16, 'fx'),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        c: color,
        spark: true,
        size: style === 'heavy' ? 3.4 : 2.4,
      });
    }
  }

  function recordProjectileTrail(projectile, x, y) {
    if (!projectile) return;
    if (!Array.isArray(projectile.trail)) projectile.trail = [];
    projectile.trail.unshift({ x, y });
    const cap = projectile.kind === 'fireball' ? PROJECTILE_TRAIL_LENGTH + 2 : PROJECTILE_TRAIL_LENGTH;
    if (projectile.trail.length > cap) projectile.trail.length = cap;
  }

  function spawnProjectileImpact(projectile, x = projectile?.x, y = projectile?.y, options = {}) {
    if (!projectile || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const color = projectile.color || (projectile.enemy ? '#ff6688' : '#ffd7aa');
    const angle = Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1));
    const heavy = projectile.kind === 'fireball' || projectile.kind === 'magenta_degale' || projectile.kind === 'god_sword';
    particles.push({
      x,
      y,
      life: heavy ? 0.34 : 0.22,
      maxLife: heavy ? 0.34 : 0.22,
      impact: true,
      c: color,
      angle,
      size: Math.max(projectile.r || 4, heavy ? 9 : 5),
      enemy: !!projectile.enemy,
      kind: projectile.kind || 'shot',
      blocked: !!options.blocked,
    });
    const sparks = heavy ? 8 : 4;
    for (let index = 0; index < sparks; index += 1) {
      const spread = rand(1.2, -1.2, 'fx');
      const sparkAngle = angle + Math.PI + spread;
      const speed = rand(120, 35, 'fx');
      particles.push({
        x,
        y,
        life: rand(0.28, 0.1, 'fx'),
        vx: Math.cos(sparkAngle) * speed,
        vy: Math.sin(sparkAngle) * speed,
        c: color,
        spark: true,
        size: heavy ? 3 : 2,
      });
    }
  }

  function findNearestEnemy(x, y, radius, exclude = new Set()) {
    let best = null;
    let bestDist = radius;
    enemies.forEach(enemy => {
      if (!enemy) return;
      if (exclude.has(enemy)) return;
      const d = dist(x, y, enemy.x, enemy.y);
      if (d < bestDist) {
        best = enemy;
        bestDist = d;
      }
    });
    return best;
  }

  function updateProjectiles(dt) {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index];
      if (!projectile) { projectiles.splice(index, 1); continue; }
      projectile.life -= dt;
      const prevX = projectile.x;
      const prevY = projectile.y;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      recordProjectileTrail(projectile, prevX, prevY);
      const hitProp = destructibles.find(prop => !prop.broken && !prop.hidden && dist(projectile.x, projectile.y, prop.x, prop.y) <= projectile.r + prop.r);
      if (!projectile.enemy && hitProp) {
        damageDestructible(hitProp, projectile.damage || 1);
        if (projectile.kind === 'fireball') blastRadius(projectile.x, projectile.y, projectile.splash || 44, 16, '#ff8844');
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        projectiles.splice(index, 1);
        continue;
      }
      if (projectile.life <= 0 || isBlocked(projectile.x, projectile.y, projectile.r)) {
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        projectiles.splice(index, 1);
        continue;
      }
      if (!projectile.enemy) {
        const target = enemies.find(enemy => enemy && dist(projectile.x, projectile.y, enemy.x, enemy.y) <= projectile.r + enemy.r);
        if (target) {
          const hitAngle = Math.atan2(projectile.vy, projectile.vx);
          hitEnemy(
            target,
            projectile.damage || 16,
            hitAngle,
            projectile.knockback || 90,
            projectile.color || (projectile.kind === 'fireball' ? '#ff8844' : '#a857ff'),
            projectile.hitOptions || {}
          );
          if (projectile.kind === 'fireball') {
            applyFire(target, projectile.fireStacks || 2, projectile.fireDuration || 3);
            blastRadius(projectile.x, projectile.y, projectile.splash || 44, 14, '#ff8844');
            applyStatusInRadius(projectile.x, projectile.y, projectile.splash || 44, 'fire', 1, projectile.fireDuration || 3, null);
          }
          spawnProjectileImpact(projectile, projectile.x, projectile.y);
          if (projectile.pierceCount > 0) {
            projectile.pierceCount -= 1;
            projectile.x += projectile.vx * 0.03;
            projectile.y += projectile.vy * 0.03;
          } else {
            projectiles.splice(index, 1);
          }
          continue;
        }
      } else if (dist(projectile.x, projectile.y, player.x, player.y) <= projectile.r + player.r) {
        damagePlayer(projectile.damage || 10, Math.atan2(projectile.vy, projectile.vx), 120, 'enemy_projectile');
        spawnProjectileImpact(projectile, projectile.x, projectile.y);
        projectiles.splice(index, 1);
        continue;
      }
    }
  }

  function updateWorldProps(dt) {
    hazards.forEach(hazard => {
      if (hazard.ttl !== undefined) hazard.ttl -= dt;
      if (hazard.followPlayer) {
        hazard.x = player.x;
        hazard.y = player.y;
      }
      hazard.statusTick = Number(hazard.statusTick ?? 0) - dt;
      if (hazard.kind === 'lava' && dist(player.x, player.y, hazard.x, hazard.y) < hazard.r + player.r - 10 && player.lavaWalkTime <= 0) {
        damagePlayer(6 * dt, 0, 0, 'lava');
        if (hazard.statusTick <= 0) applyFire(player, 1, 2.6);
      }
      if (hazard.kind === 'lava') {
        enemies.forEach(enemy => {
          if (!enemy) return;
          if (dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r - 6) return;
          if (hazard.statusTick <= 0) applyFire(enemy, 1, 2.8);
        });
        if (hazard.statusTick <= 0) hazard.statusTick = 0.45;
      }
      if (hazard.kind === 'healing_zone') {
        hazard.plusTick = (hazard.plusTick ?? 0.08) - dt;
        if (hazard.plusTick <= 0) {
          const angle = rng() * Math.PI * 2;
          const radius = rand(hazard.r * 0.82, 8);
          const px = hazard.x + Math.cos(angle) * radius;
          const py = hazard.y + Math.sin(angle) * radius;
          particles.push({
            x: px,
            y: py,
            life: 0.45,
            text: '+',
            c: '#47ff7d',
            size: 14,
            outline: 'rgba(5,35,10,0.7)',
            vx: rand(-10, 10),
            vy: rand(-42, -24),
          });
          hazard.plusTick = rand(0.16, 0.07);
        }
        if (dist(player.x, player.y, hazard.x, hazard.y) < hazard.r) {
          const before = player.hp;
          player.hp = Math.min(player.maxHp, player.hp + 8 * dt);
          const healed = player.hp - before;
          if (healed > 0) {
            hazard.healAccum = (hazard.healAccum || 0) + healed;
            hazard.healTick = (hazard.healTick ?? 0.24) - dt;
            if (hazard.healTick <= 0) {
              spawnHealPopup(player.x + rand(-10, 10), player.y - 22, hazard.healAccum);
              hazard.healAccum = 0;
              hazard.healTick = 0.24;
            }
          }
        }
        for (let ei = enemies.length - 1; ei >= 0; ei -= 1) {
          const enemy = enemies[ei];
          if (!enemy) continue;
          if (dist(enemy.x, enemy.y, hazard.x, hazard.y) < hazard.r + enemy.r) {
            enemy.hp -= 10 * dt;
            if (enemy.hp <= 0) onEnemyDie(enemy);
          }
        }
      } else if (hazard.kind === 'fire_circle') {
        for (let ei = enemies.length - 1; ei >= 0; ei -= 1) {
          const enemy = enemies[ei];
          if (!enemy) continue;
          if (dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) continue;
          enemy.hp -= (hazard.dps || 16) * dt;
          if (hazard.statusTick <= 0) applyFire(enemy, 1, 2.8);
          enemy.stun = Math.max(enemy.stun, 0.05);
          if (Math.random() < 0.06) particles.push({ x: enemy.x + rand(-6, 6), y: enemy.y + rand(-6, 6), life: 0.3, c: '#ff8c3b' });
          if (enemy.hp <= 0) onEnemyDie(enemy);
        }
        if (hazard.statusTick <= 0) hazard.statusTick = 0.45;
      } else if (hazard.kind === 'lightning_column') {
        hazard.tick -= dt;
        if (hazard.tick <= 0) {
          hazard.tick = hazard.interval || 0.45;
          for (let ei = enemies.length - 1; ei >= 0; ei -= 1) {
            const enemy = enemies[ei];
            if (!enemy) continue;
            if (dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) continue;
            const angle = Math.atan2(enemy.y - hazard.y, enemy.x - hazard.x);
            hitEnemy(enemy, hazard.damage || 16, angle, 90, '#8dd4ff');
          }
          particles.push({
            life: 0.25,
            bolt: {
              x1: hazard.x,
              y1: hazard.y - hazard.r,
              x2: hazard.x,
              y2: hazard.y + hazard.r,
              c: '#9fd3ff',
              w: 4.4,
              jag: 10,
              seg: 6,
              phase: rng() * Math.PI * 2,
            },
          });
        }
      }
    });
    hazards = hazards.filter(hazard => hazard.ttl === undefined || hazard.ttl > 0);
    syncCurrentRoomState();
  }

  function damageDestructible(prop, damage) {
    if (prop.broken) return;
    const dealt = Math.max(0, Math.round(damage || 0));
    if (dealt > 0) {
      spawnDamagePopup(prop.x, prop.y - prop.r - 8, dealt, {
        color: prop.kind === 'barrel' ? '#ff9f1c' : '#ffd27d',
        size: 14,
        outline: '#2a1800',
      });
    }
    prop.hp -= damage;
    if (prop.hp > 0) return;
    prop.broken = true;
    if (prop.kind === 'pot') {
      if (rng() < 0.7) dropCoins(prop.x, prop.y, 6 + floor);
      else pickups.push({ x: prop.x, y: prop.y, type: 'item', key: rollItemDrop({ stream: 'loot' }) });
    }
    if (prop.kind === 'barrel') {
      blastRadius(prop.x, prop.y, 72, 28, '#ff5a3d');
    }
    if (prop.kind === 'wall') {
      destructibles.forEach(other => {
        if (other.hidden) other.hidden = false;
      });
    }
    if (prop.kind === 'secret_wall') {
      const dir = prop.secretDir;
      if (dir) setSecretPassageOpen(currentRoom, dir, true);
      particles.push({ x: prop.x, y: prop.y - 18, life: 0.9, text: 'SECRET', c: '#8dd4ff' });
    }
  }

  function spawnDamagePopup(x, y, amount, opts = {}) {
    const value = Math.max(0, Math.round(amount || 0));
    if (value <= 0) return;
    const crit = !!opts.crit;
    const color = opts.color || (crit ? '#ff9f1c' : '#ff6b6b');
    const size = opts.size || (crit ? 20 : 16);
    particles.push({
      x,
      y,
      life: crit ? 0.62 : 0.46,
      text: `-${value}`,
      c: color,
      outline: opts.outline || '#120a00',
      size,
      vx: rand(-14, 14),
      vy: -36 - (crit ? 10 : 0),
    });
  }

  function spawnHealPopup(x, y, amount, opts = {}) {
    const value = Math.max(0, Math.round((amount || 0) * (opts.scale || 8)));
    if (value <= 0) return;
    particles.push({
      x,
      y,
      life: 0.5,
      text: `+${value}`,
      c: opts.color || '#47ff7d',
      outline: opts.outline || 'rgba(5,35,10,0.8)',
      size: opts.size || 15,
      vx: rand(-8, 8),
      vy: -44,
    });
  }

  function updateChests() {
    chests.forEach(chest => {
      if (chest.open) return;
      if (dist(chest.x, chest.y, player.x, player.y) >= 36) return;
      chest.open = true;
      dropCoins(chest.x, chest.y, 12 + floor * 2);
      if (rng() < 0.9) {
        pickups.push({ x: chest.x, y: chest.y - 20, type: 'item', key: rollItemDrop({ stream: 'loot' }) });
      } else {
        pickups.push({ x: chest.x, y: chest.y - 20, type: 'potion' });
      }
      currentRoom.cleared = chests.every(item => item.open);
      updateObjective();
      scheduleRunSave();
    });
  }

  function updatePickups(dt = 0.016) {
    for (let index = pickups.length - 1; index >= 0; index -= 1) {
      const pickup = pickups[index];
      if (!pickup || typeof pickup !== 'object' || typeof pickup.type !== 'string') {
        pickups.splice(index, 1);
        continue;
      }
      if (pickup.type === 'coin') {
        const magnetRadius = 110;
        const d = dist(pickup.x, pickup.y, player.x, player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 180 + (1 - d / magnetRadius) * 260;
          pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
        }
      } else if (pickup.type === 'potion') {
        if (player.hp < player.maxHp) {
          const magnetRadius = 110;
          const d = dist(pickup.x, pickup.y, player.x, player.y);
          if (d < magnetRadius && d > 0.001) {
            const pull = 180 + (1 - d / magnetRadius) * 260;
            pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
            pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
          }
        }
      } else if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const magnetRadius = 124;
        const d = dist(pickup.x, pickup.y, player.x, player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 190 + (1 - d / magnetRadius) * 240;
          pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
        }
      } else if (pickup.type === 'item') {
        const magnetRadius = 145;
        const d = dist(pickup.x, pickup.y, player.x, player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 150 + (1 - d / magnetRadius) * 220;
          pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
        }
      } else if (pickup.type === 'challengeRune') {
        const runeRadius = 16;
        const minX = WALL + runeRadius;
        const maxX = ROOM_W - WALL - runeRadius;
        const minY = WALL + runeRadius;
        const maxY = ROOM_H - WALL - runeRadius;
        if (!Number.isFinite(pickup.vx) || !Number.isFinite(pickup.vy)) {
          const angle = rand(Math.PI * 2, 0, 'world');
          const speed = rand(82, 56, 'world');
          pickup.vx = Math.cos(angle) * speed;
          pickup.vy = Math.sin(angle) * speed;
        }
        pickup.x += pickup.vx * dt;
        pickup.y += pickup.vy * dt;
        if (pickup.x <= minX || pickup.x >= maxX) {
          pickup.x = clamp(pickup.x, minX, maxX);
          pickup.vx *= -1;
        }
        if (pickup.y <= minY || pickup.y >= maxY) {
          pickup.y = clamp(pickup.y, minY, maxY);
          pickup.vy *= -1;
        }
        const d = dist(pickup.x, pickup.y, player.x, player.y);
        if (d < 130 && d > 0.001) {
          const pull = 160 + (1 - d / 130) * 180;
          pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
        }
      }
      if (dist(pickup.x, pickup.y, player.x, player.y) >= 26) continue;

      if (pickup.type === 'coin') {
        addCoins(pickup.value || 1);
      }

      if (pickup.type === 'potion') {
        player.hp = Math.min(player.maxHp, player.hp + 40);
        particles.push({ x: player.x, y: player.y - 20, life: 0.6, text: '+40', c: '#0f8' });
      }

      if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const heal = Math.max(10, Number(pickup.heal || 20));
        const before = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + heal);
        const actual = player.hp - before;
        if (actual > 0) {
          spawnHealPopup(player.x + rand(-8, 8), player.y - 22, actual, { color: '#79ff8f', size: 14 });
          particles.push({ x: player.x, y: player.y - 18, life: 0.55, text: `+${Math.ceil(actual)}`, c: '#79ff8f' });
        }
        const fruitRoom = getRoomByCoords(Number(pickup.roomGx ?? currentRoom?.gx), Number(pickup.roomGy ?? currentRoom?.gy)) || currentRoom;
        const node = fruitRoom?.gardenFruitNodes?.find(gardenNode => gardenNode && gardenNode.id === pickup.gardenNodeId);
        if (node) {
          node.respawnAt = gameElapsedTime + rand(22, 12, 'world');
          node.fruitSpawned = false;
        }
      }

      if (pickup.type === 'item') {
        collectItem(pickup.key);
        if (floorSkipPending > 0) {
          floor = Math.min(MAX_FLOOR, floor + floorSkipPending);
          floorSkipPending = 0;
          refreshFloorChargeStates();
          metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
          persistMetaSoon();
          showFloorTransition = true;
          floorTransitionTime = 0;
          generateFloor();
          scheduleRunSave();
          return;
        }
      }

      if (pickup.type === 'ladder') {
        floor = Math.min(MAX_FLOOR, floor + 1);
        refreshFloorChargeStates();
        metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
        persistMetaSoon();
        showFloorTransition = true;
        floorTransitionTime = 0;
        generateFloor();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'secretWarp') {
        floor = clamp(Number(pickup.targetFloor || floor), 1, MAX_FLOOR);
        refreshFloorChargeStates();
        metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
        persistMetaSoon();
        showFloorTransition = true;
        floorTransitionTime = 0;
        generateFloor();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'secretVendor') {
        const cost = Math.max(1, Number(pickup.cost || 1));
        const usesCoins = pickup.offerKind === 'xp';
        const crystals = Number(metaProgress.loopCrystals || 0);
        const coins = Number(player.coins || 0);
        const canAfford = usesCoins ? coins >= cost : crystals >= cost;
        const costLabel = usesCoins ? `${cost} C` : `${cost} LC`;
        if (pickup.bought) {
          pickups.splice(index, 1);
          continue;
        }
        if (!canAfford) {
          const now = Date.now();
          if (!pickup.lastDeniedAt || now - pickup.lastDeniedAt > 450) {
            particles.push({ x: pickup.x, y: pickup.y - 20, life: 0.85, text: costLabel, c: '#ffb1b1' });
            pickup.lastDeniedAt = now;
          }
          continue;
        }
        if (usesCoins) {
          if (!spendCoins(cost)) continue;
        } else {
          metaProgress.loopCrystals = crystals - cost;
        }
        pickup.bought = true;
        if (pickup.offerKind === 'relic') {
          collectItem(rollItemDrop({ elite: true, stream: 'loot' }));
        } else if (pickup.offerKind === 'vitality') {
          player.maxHp += 20;
          player.hp = Math.min(player.maxHp, player.hp + 60);
          particles.push({ x: player.x, y: player.y - 20, life: 0.7, text: '+VIT', c: '#8dffbd' });
        } else if (pickup.offerKind === 'xp') {
          const xpValue = Math.max(1, Number(pickup.xpValue || getSecretXpOfferAmount()));
          grantXp(xpValue);
          particles.push({ x: player.x, y: player.y - 20, life: 0.7, text: `+${xpValue} XP`, c: '#8dd4ff' });
        } else {
          addCoins(90 + floor * 12);
          particles.push({ x: player.x, y: player.y - 20, life: 0.7, text: 'RICH', c: '#ffd966' });
        }
        persistMetaSoon();
      }

      if (pickup.type === 'fightGod') {
        currentRoom.bossStarted = true;
        pickups = [];
        spawnGodBoss();
        playGodDialogue(1);
        syncCurrentRoomState();
        updateObjective();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'challengeStarter') {
        beginChallengeTrial(currentRoom);
        syncCurrentRoomState();
        updateObjective();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'challengeBomb') {
        if (pickup.safe) {
          completeChallengeTrial('BOMB DISARMED');
        } else {
          blastRadius(pickup.x, pickup.y, 76, 28 + floor * 2, '#ff7a66');
          particles.push({ x: pickup.x, y: pickup.y - 20, life: 0.75, text: 'WRONG', c: '#ff7a7a' });
        }
      }

      if (pickup.type === 'challengeRune') {
        if (!currentRoom.challengeData) currentRoom.challengeData = {};
        currentRoom.challengeData.runesLeft = Math.max(0, Number(currentRoom.challengeData.runesLeft || 1) - 1);
        particles.push({ x: pickup.x, y: pickup.y - 18, life: 0.55, text: 'RUNE', c: '#8dd4ff' });
        if (currentRoom.challengeData.runesLeft <= 0) {
          completeChallengeTrial('RUNES CLAIMED');
        }
      }

      if (pickup.type === 'descend') {
        floor += 1;
        refreshFloorChargeStates();
        metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
        persistMetaSoon();
        showFloorTransition = true;
        floorTransitionTime = 0;
        player.x = START_X;
        player.y = START_Y;
        generateFloor();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'returnGate') {
        returnToFloorOne();
        return;
      }

      if (pickup.type === 'crown') {
        win();
        return;
      }

      pickups.splice(index, 1);
      scheduleRunSave();
    }
  }

  function updateDeadBodies(dt) {
    for (let index = deadBodies.length - 1; index >= 0; index -= 1) {
      const body = deadBodies[index];
      body.age = Number(body.age || 0) + dt;
      if (body.age <= Number(body.fallTime || CORPSE_FALL_TIME)) {
        body.x += Number(body.vx || 0) * dt;
        body.y += Number(body.vy || 0) * dt;
        body.vx *= Math.max(0, 1 - 6.2 * dt);
        body.vy *= Math.max(0, 1 - 6.2 * dt);
      }
      if (body.age >= Number(body.life || CORPSE_LIFETIME)) deadBodies.splice(index, 1);
    }
  }

  function updateParticles(dt) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= dt;
      if (particle.blood) particle.vy = Math.min(220, Number(particle.vy || 0) + 390 * dt);
      if (particle.vx) particle.x += particle.vx * dt;
      if (particle.vy) particle.y += particle.vy * dt;
      if (particle.ring) particle.ring += 200 * dt;
      if (particle.life <= 0) particles.splice(index, 1);
    }
  }

  function isRoomLocked() {
    const challengeActive = !!currentRoom && CHALLENGE_ROOM_TYPES.has(currentRoom.type) && !!currentRoom.challengeStarted && !currentRoom.cleared;
    return !!currentRoom
      && !currentRoom.cleared
      && (currentRoom.type === 'boss' || currentRoom.type === 'god' || currentRoom.type === 'ladder' || challengeActive);
  }

  function updateTransitions(dt) {
    const challengeActive = !!currentRoom && CHALLENGE_ROOM_TYPES.has(currentRoom.type) && !!currentRoom.challengeStarted && !currentRoom.cleared;
    const canLeaveFight = enemies.length > 0
      && currentRoom
      && currentRoom.type !== 'boss'
      && currentRoom.type !== 'god'
      && currentRoom.type !== 'ladder'
      && !challengeActive;
    const roomLocked = isRoomLocked();
    if (!fading && !roomLocked && (enemies.length === 0 || canLeaveFight)) {
      const door =
        player.y < WALL + 24 && hasRoomExit(currentRoom, 'n') && Math.abs(player.x - ROOM_W / 2) < DOOR / 2 ? 'n' :
        player.y > ROOM_H - WALL - 24 && hasRoomExit(currentRoom, 's') && Math.abs(player.x - ROOM_W / 2) < DOOR / 2 ? 's' :
        player.x < WALL + 24 && hasRoomExit(currentRoom, 'w') && Math.abs(player.y - ROOM_H / 2) < DOOR / 2 ? 'w' :
        player.x > ROOM_W - WALL - 24 && hasRoomExit(currentRoom, 'e') && Math.abs(player.y - ROOM_H / 2) < DOOR / 2 ? 'e' :
        null;
      if (door) startTransition(door);
    }

    if (!fading) return;
    fade += (fading === 1 ? 1 : -1) * dt * 3;
    if (fade >= 1 && fading === 1) {
      doTransition();
      fading = -1;
    }
    if (fade <= 0 && fading === -1) {
      fading = 0;
    }
    fade = clamp(fade, 0, 1);
  }

  function startTransition(direction) {
    fading = 1;
    nextDoor = direction;
  }

  function doTransition() {
    const direction = nextDoor;
    const nextRoom = getConnectedRoom(currentRoom, direction);
    if (!nextRoom) return;
    enterRoom(nextRoom);
    const r = 18;
    let doorX = ROOM_W / 2;
    let doorY = ROOM_H / 2;
    if (direction === 'n') { doorY = ROOM_H - WALL - 30; doorX = ROOM_W / 2; }
    if (direction === 's') { doorY = WALL + 30; doorX = ROOM_W / 2; }
    if (direction === 'e') { doorX = WALL + 30; doorY = ROOM_H / 2; }
    if (direction === 'w') { doorX = ROOM_W - WALL - 30; doorY = ROOM_H / 2; }
    if (!isBlocked(doorX, doorY, r)) {
      player.x = doorX;
      player.y = doorY;
    }
  }

  function returnToFloorOne() {
    floor = 1;
    gameElapsedTime = 0;
    refreshFloorChargeStates();
    runLoopIndex += 1;
    syncSeedState();
    const crystalBonus = Math.max(0, Math.round(getActiveChallengeCrystalBonusMultiplier()));
    const titheBonus = hasLegacy('crystal_tithe') && HARD_DIFFICULTIES.has(selectedDifficulty) ? 1 : 0;
    metaProgress.loopCrystals = Number(metaProgress.loopCrystals || 0) + 1 + crystalBonus + titheBonus;
    if (crystalBonus > 0) {
      particles.push({ x: player.x, y: player.y - 42, life: 1.1, text: `+${crystalBonus} CHALLENGE LC`, c: '#8dd4ff' });
    }
    if (titheBonus > 0) {
      particles.push({ x: player.x, y: player.y - 56, life: 1.1, text: `+1 TITHE LC`, c: '#c9a8f0' });
    }
    if (hasLegacy('bank_interest')) {
      metaProgress.coins = Number(metaProgress.coins || 0) + 50;
      particles.push({ x: player.x, y: player.y - 70, life: 1.1, text: `+50 INTEREST`, c: '#ffd27d' });
    }
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, MAX_FLOOR);
    persistMetaSoon();
    player.x = START_X;
    player.y = START_Y;
    generateFloor();
    scheduleRunSave();
  }

  function addCoins(amount) {
    player.coins += amount;
    metaProgress.coins += amount;
    persistMetaSoon();
  }

  function getObjectiveEntries(lineObjective = '') {
    if (!currentRoom) return [];
    const entries = [];
    if (floor < MAX_FLOOR || floor > MAX_FLOOR) {
      const ladderRoom = rooms.find(room => room.type === 'ladder');
      entries.push({
        text: ladderRoom?.explored ? 'Reach the ladder room' : 'Find the ladder',
        state: currentRoom.type === 'ladder' ? 'done' : 'todo',
      });
      if (currentRoom.type === 'ladder') {
        entries.push({
          text: currentRoom.cleared ? 'Ladder room cleared' : 'Clear the ladder room',
          state: currentRoom.cleared ? 'done' : 'warn',
        });
      }
      if (currentRoom.type === 'boss') {
        entries.push({
          text: currentRoom.cleared ? 'Floor boss defeated' : 'Kill the floor boss',
          state: currentRoom.cleared ? 'done' : 'warn',
        });
      }
      if (currentRoom.type === 'challenge') {
        entries.push({
          text: lineObjective || 'Complete the trial',
          state: currentRoom.challengeFailed ? 'warn' : currentRoom.cleared ? 'done' : 'warn',
        });
      }
      if (currentRoom.type === 'treasure') {
        const unopened = chests.filter(chest => !chest.open).length;
        entries.push({
          text: unopened > 0 ? `Open treasure chests: ${unopened}` : 'Treasure claimed',
          state: unopened > 0 ? 'warn' : 'done',
        });
      }
      if (currentRoom.type === 'shop') entries.push({ text: 'Buy upgrades or move on', state: 'warn' });
      if (currentRoom.type === 'anvil') entries.push({ text: 'Forge upgrades or move on', state: 'warn' });
      if (enemies.some(enemy => enemy.miniBoss)) entries.push({ text: 'Defeat the mini boss', state: 'warn' });
      if (selectedChallenges.length > 0) entries.push({ text: `${selectedChallenges.length} challenge${selectedChallenges.length === 1 ? '' : 's'} active`, state: 'todo' });
      return entries.slice(0, 5);
    }

    entries.push({
      text: currentRoom.type === 'god' ? 'Enter GOD chamber' : 'Reach GOD',
      state: currentRoom.type === 'god' ? 'done' : 'todo',
    });
    if (currentRoom.type === 'god') {
      entries.push({
        text: currentRoom.cleared ? 'GOD defeated' : currentRoom.bossStarted ? 'Survive GOD' : 'Start the GOD fight',
        state: currentRoom.cleared ? 'done' : 'warn',
      });
      if (currentRoom.cleared) entries.push({ text: hasLegacy('endless_descent') ? 'Crown, Descend, or Loop' : 'Take the crown or loop', state: 'warn' });
    }
    return entries.slice(0, 5);
  }

  function updateObjective() {
    if (!currentRoom) return;
    let objective = 'Find the ladder.';
    const setObjective = text => {
      uiController.setObjective(text);
      uiController.setObjectiveList(getRoomLabel(currentRoom.type), getObjectiveEntries(text));
    };
    if (floor < MAX_FLOOR) {
      if (currentRoom.type === 'shop') {
        setObjective('Shop or move on.');
        return;
      }
      if (currentRoom.type === 'anvil') {
        setObjective('Forge upgrades or move on.');
        return;
      }
      if (currentRoom.type === 'challenge') {
        const type = currentRoom.challengeType || 'mirror';
        if (currentRoom.challengeFailed) {
          setObjective('Trial failed. Move on.');
        } else if (currentRoom.cleared) {
          setObjective('Trial cleared. Claim the reward or move on.');
        } else if (!currentRoom.challengeStarted) {
          if (type === 'mirror') setObjective('Touch the sword to face your mirror.');
          else if (type === 'stillness') setObjective('Begin the stillness trial.');
          else if (type === 'bomb') setObjective('Begin the bomb trial.');
          else if (type === 'survival') setObjective('Begin the survival trial.');
          else if (type === 'runes') setObjective('Begin the rune hunt.');
          else if (type === 'storm') setObjective('Begin the storm trial.');
        } else {
          if (type === 'mirror') setObjective('Defeat your mirror champion.');
          else if (type === 'stillness') setObjective(`Hold still for ${Math.ceil(currentRoom.challengeTimer || 0)}s.`);
          else if (type === 'bomb') setObjective('Find the one bomb you can safely disarm.');
          else if (type === 'survival') setObjective(`Survive for ${Math.ceil(currentRoom.challengeTimer || 0)}s.`);
          else if (type === 'runes') setObjective(`Collect the remaining runes: ${Math.max(0, Number(currentRoom.challengeData?.runesLeft || 0))}.`);
          else if (type === 'storm') setObjective(`Live through the storm for ${Math.ceil(currentRoom.challengeTimer || 0)}s.`);
        }
        return;
      }
      if (currentRoom.type === 'boss' && !currentRoom.cleared) {
        setObjective('Defeat the floor boss.');
        return;
      }
      objective = currentRoom.type === 'ladder' && !currentRoom.cleared ? 'Clear the ladder room.' : 'Find the ladder.';
      setObjective(objective);
      return;
    }
    if (currentRoom.type !== 'god') {
      setObjective('Reach GOD.');
      return;
    }
    if (currentRoom.cleared) {
      setObjective('Take the crown.');
      return;
    }
    if (currentRoom.bossStarted) {
      setObjective('Survive GOD.');
      return;
    }
    setObjective('Fight GOD or loop with your gear.');
  }

  function updateHud() {
    if (!player) return;
    const character = getCharacterDef();
    const meleeMove = MOVE_DEFS[getEquippedMove('melee')];
    const weaponKey = getEquippedWeapon();
    const weaponDef = WEAPON_DEFS[weaponKey];
    const laserMove = MOVE_DEFS[getEquippedMove('laser')];
    const smashMove = MOVE_DEFS[getEquippedMove('smash')];
    const dashMove = MOVE_DEFS[getEquippedMove('dash')];
    const attackSpeed = getAttackSpeedValue();
    const laserMoveKey = laserMove?.key || getEquippedMove('laser');
    const meleeSkill = getSkillCooldownInfo('melee', attackSpeed);
    const laserSkill = getSkillCooldownInfo('laser', attackSpeed);
    const smashSkill = getSkillCooldownInfo('smash', attackSpeed);
    const dashSkill = getSkillCooldownInfo('dash', attackSpeed);
    if (laserActive) {
      laserSkill.current = laserTime;
      laserSkill.max = getLaserCastDuration(laserMoveKey);
    }
    if (weaponDef) {
      meleeSkill.current = Number(player.weaponCooldown || 0);
      meleeSkill.max = getWeaponBaseCooldown(weaponKey);
      meleeSkill.charges = meleeSkill.current > 0 ? 0 : 1;
      meleeSkill.maxCharges = 1;
    }
    const minutes = Math.floor(gameElapsedTime / 60);
    const seconds = Math.floor(gameElapsedTime % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    uiController.setHudValues({
      floor,
      level: player.level,
      xpText: `${player.xp}/${player.xpToNext}`,
      coins: player.coins,
      character: character.name.toUpperCase(),
      hp: player.hp,
      maxHp: player.maxHp,
      meleeCd: meleeSkill.current,
      laserCd: laserSkill.current,
      smashCd: smashSkill.current,
      dashCd: dashSkill.current,
      gameTime: timeStr,
      skills: {
        melee: { current: meleeSkill.current, max: meleeSkill.max, active: false, charges: meleeSkill.charges, maxCharges: meleeSkill.maxCharges },
        laser: { current: laserSkill.current, max: laserSkill.max, active: laserActive, charges: laserSkill.charges, maxCharges: laserSkill.maxCharges },
        smash: { current: smashSkill.current, max: smashSkill.max, active: false, charges: smashSkill.charges, maxCharges: smashSkill.maxCharges },
        dash: { current: dashSkill.current, max: dashSkill.max, active: player.dashTime > 0 || player.cowardsWayTime > 0 || player.princessFlightTime > 0, charges: dashSkill.charges, maxCharges: dashSkill.maxCharges },
      },
    });
    ui.skillNames.dash.textContent = dashMove?.name || character.skills.dash;
    ui.skillNames.melee.textContent = weaponDef?.name || meleeMove?.name || character.skills.melee;
    ui.skillNames.laser.textContent = laserMove?.name || character.skills.laser;
    ui.skillNames.smash.textContent = smashMove?.name || character.skills.smash;
    syncCharacterUiTheme();
    
    // Update player stats in bottom right
    if (ui.playerHpFill) {
      const hpPercent = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
      ui.playerHpFill.style.width = hpPercent + '%';
      ui.playerHpFill.style.background = hpPercent > 70 ? '#4cbb5a' : hpPercent > 50 ? '#d4b840' : '#c04040';
      ui.playerHpTxt.textContent = Math.ceil(player.hp) + '/' + player.maxHp;
    }
    if (ui.playerXpFill) {
      const xpPercent = Math.max(0, Math.min(100, (player.xp / player.xpToNext) * 100));
      ui.playerXpFill.style.width = xpPercent + '%';
      ui.playerXpTxt.textContent = player.xp + '/' + player.xpToNext;
      const _lvEl = document.getElementById('playerLevelTxt');
      if (_lvEl) _lvEl.textContent = 'Lv.' + (player.level || 1);
    }
    
    // Update center display
    if (ui.coinCount) ui.coinCount.textContent = player.coins;
    if (ui.timerDisplay) ui.timerDisplay.textContent = timeStr;
    if (ui.floorDisplay) ui.floorDisplay.textContent = floor;
    if (ui.challengeStatus && ui.challengeStatusFill) {
      const timedChallengeType = currentRoom
        && currentRoom.type === 'challenge'
        && currentRoom.challengeStarted
        && !currentRoom.cleared
        ? (currentRoom.challengeType || 'mirror')
        : null;
      const timedChallengeActive = timedChallengeType === 'stillness' || timedChallengeType === 'runes';
      ui.challengeStatus.classList.toggle('hidden', !timedChallengeActive);
      ui.challengeStatus.setAttribute('aria-hidden', timedChallengeActive ? 'false' : 'true');
      if (timedChallengeActive) {
        const maxTimer = Math.max(0.01, Number(currentRoom.challengeData?.maxTimer || 30));
        const timer = Math.max(0, Number(currentRoom.challengeTimer || 0));
        const ratio = Math.max(0, Math.min(1, timer / maxTimer));
        if (ui.challengeStatusLabel) {
          const label = timedChallengeType === 'runes' ? 'RUNES' : 'STILLNESS';
          ui.challengeStatusLabel.textContent = `${label} ${Math.ceil(timer)}S`;
        }
        ui.challengeStatusFill.style.width = `${ratio * 100}%`;
      }
    }
    
    updateItemUI();
  }

  function finalizeRun(result, extra = {}) {
    const entry = buildRunHistoryEntry(result, extra);
    pushRunHistoryEntry(entry);
    return entry;
  }

  function die() {
    if (gameState === 'dying' || gameState === 'dead') return;
    const entry = finalizeRun('dead', { killedBy: lastDamageSource, killerKey: lastDamageSourceKey });
    const aimAngle = player ? Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x) : 0;
    playerDeathAnim = {
      timer: 0,
      duration: 2.2,
      x: player?.x ?? 0,
      y: player?.y ?? 0,
      r: player?.r ?? 14,
      spriteKey: getPlayerSpriteKey(),
      facing: getFacingDirection(player, aimAngle),
      entry,
    };
    setGameState('dying');
    clearRunSave();
  }

  function finalizeDeath() {
    const { entry } = playerDeathAnim;
    playerDeathAnim = null;
    setGameState('dead');
    uiController.setDeadScreen(entry);
  }

  function win() {
    const entry = finalizeRun('win');
    setGameState('win');
    uiController.setWinInfo(`Floor ${entry.floor} cleared with ${entry.coins} run coins banked and ${metaProgress.coins} total coins saved.`);
    clearRunSave();
  }

  async function clearRunSave() {
    activeRun = null;
    lastDamageSource = '';
    lastDamageSourceKey = '';
    try {
      await Promise.all([
        saveStore.delete('run'),
        saveStore.put('meta', metaProgress),
        saveStore.put('runHistory', runHistory),
      ]);
      refreshMenuState();
    } catch (error) {
      console.error('Failed to clear run save', error);
    }
  }

  function scheduleRunSave() {
    if (gameState !== 'play' || !player || !currentRoom) return;
    clearTimeout(savePendingTimer);
    savePendingTimer = setTimeout(() => { void saveRunNow(); }, 250);
  }

  function persistMetaSoon() {
    metaProgress.customDifficultySettings = { ...customDifficultySettings };
    metaProgress.selectedCharacter = chosenCharacter;
    refreshMenuState();
    void saveStore.put('meta', metaProgress).catch(error => {
      console.error('Failed to save meta', error);
    });
  }

  async function saveRunNow() {
    if (gameState !== 'play' || !player || !currentRoom) return;
    activeRun = serializeRun();
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
    refreshMenuState();
    try {
      await Promise.all([
        saveStore.put('run', activeRun),
        saveStore.put('meta', metaProgress),
        saveStore.put('runHistory', runHistory),
      ]);
    } catch (error) {
      console.error('Failed to save run', error);
      uiController.setSaveState('SAVE ERROR');
    }
  }

  function serializeRun() {
    return {
      baseSeedStr,
      seedStr,
      runLoopIndex,
      rngState: getRngState(),
      difficulty: selectedDifficulty,
      challenges: normalizeChallengeSelection(selectedChallenges),
      floor,
      rooms,
      currentRoom: { gx: currentRoom.gx, gy: currentRoom.gy },
      player,
      enemies,
      deadBodies,
      projectiles,
      chests,
      pickups,
      destructibles,
      hazards,
      shopOffers,
      structures,
      decorations,
      cooldowns,
      laserActive,
      laserTime,
      laserTick,
      laserMode,
      laserAngle,
      laserSweepSpeed,
      turtleWaveHpTimer,
      godTimer,
      gameElapsedTime,
      camera,
    };
  }

  async function deleteSavedRun() {
    activeRun = null;
    await saveStore.delete('run');
    refreshMenuState();
  }

  function draw() {
    const isDying = gameState === 'dying';
    const isPlayLike = gameState === 'play' || gameState === 'pause' || gameState === 'dialogue' || isDying;
    let sectionPerfStart = perfStart();
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isPlayLike) {
      const _shakeOn = window.NeoSettings?.getAccess()?.screenShake !== false;
      const offsetX = _shakeOn ? (Math.random() - 0.5) * shake * 2 : 0;
      const offsetY = _shakeOn ? (Math.random() - 0.5) * shake * 2 : 0;
      ctx.translate(-camera.x + offsetX, -camera.y + offsetY);

      drawFloor();
      drawRoomDecor();
      drawWorldProps();
      drawDeadBodies();
      perfEnd('draw.room', sectionPerfStart);
      sectionPerfStart = perfStart();
      drawChests();
      drawPickups();
      perfEnd('draw.items', sectionPerfStart);
      sectionPerfStart = perfStart();
      drawProjectiles();
      drawEnemyTelegraphs();
      drawEnemies();
      if (!isDying) drawPlayer();
      if (!isDying) drawPlayerLaser();
      if (isDying && playerDeathAnim) drawPlayerCorpseAnim(playerDeathAnim);
      perfEnd('draw.entities', sectionPerfStart);
      sectionPerfStart = perfStart();
      drawParticles();
      perfEnd('draw.particles', sectionPerfStart);
      sectionPerfStart = perfStart();
      if (!isDying) drawShopPrompt();
      if (!isDying) drawAnvilPrompt();
      perfEnd('draw.prompts', sectionPerfStart);
    }

    ctx.restore();
    sectionPerfStart = perfStart();
    if (isPlayLike && !isDying) drawMinimap();
    perfEnd('draw.minimap', sectionPerfStart);

    sectionPerfStart = perfStart();
    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (!isDying) drawLowHealthEdgeGlow();
    if (isDying && playerDeathAnim) drawDeathOverlay(playerDeathAnim);
    if (!isDying && godTimer > 0) drawGodModeBar();
    if (!isDying) drawBossHealthBars();
    drawFloorTransition();
    perfEnd('draw.overlays', sectionPerfStart);
  }

  function drawLowHealthEdgeGlow() {
    if (!player || gameState !== 'play' || !Number.isFinite(player.hp) || !Number.isFinite(player.maxHp) || player.maxHp <= 0) return;
    const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
    if (hpRatio >= 0.2) return;

    const danger = (0.2 - hpRatio) / 0.2;
    const pulse = 0.74 + Math.sin(Date.now() / 120) * 0.18;
    const alpha = clamp((0.16 + danger * 0.34) * pulse, 0, 0.52);
    const edge = Math.max(92, Math.min(canvas.width, canvas.height) * (0.18 + danger * 0.08));

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    const center = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      Math.min(canvas.width, canvas.height) * 0.34,
      canvas.width / 2,
      canvas.height / 2,
      Math.max(canvas.width, canvas.height) * 0.72,
    );
    center.addColorStop(0, 'rgba(255,0,0,0)');
    center.addColorStop(0.62, `rgba(190,0,18,${alpha * 0.42})`);
    center.addColorStop(1, `rgba(255,0,22,${alpha})`);
    ctx.fillStyle = center;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = `rgba(255,24,32,${alpha * 0.55})`;
    ctx.shadowColor = '#ff1e28';
    ctx.shadowBlur = 28;
    ctx.fillRect(0, 0, canvas.width, edge * 0.24);
    ctx.fillRect(0, canvas.height - edge * 0.24, canvas.width, edge * 0.24);
    ctx.fillRect(0, 0, edge * 0.18, canvas.height);
    ctx.fillRect(canvas.width - edge * 0.18, 0, edge * 0.18, canvas.height);

    ctx.restore();
  }

  function drawShopPrompt() {
    if (currentRoom?.type !== 'shop' || isPanelOpen(ui.shopPanel)) return;
    const cx = ROOM_W / 2;
    const cy = ROOM_H - 60;
    ctx.save();
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = 'Press [E] to open shop';
    const pad = 18;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,20,30,0.82)';
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2 - pad, cy - 14, tw + pad * 2, 28, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#00ffff';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  function drawAnvilPrompt() {
    if (currentRoom?.type !== 'anvil' || isPanelOpen(ui.anvilPanel)) return;
    const cx = ROOM_W / 2;
    const cy = ROOM_H - 60;
    ctx.save();
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = 'Press [E] to open anvil forge';
    const pad = 18;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(20,10,0,0.85)';
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2 - pad, cy - 14, tw + pad * 2, 28, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,180,40,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffb840';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  function getRoomArtTheme(room = currentRoom) {
    if (!room) return ROOM_ART_THEMES.dungeon;
    if (room.type === 'shop') return ROOM_ART_THEMES.shop;
    if (room.type === 'anvil') return ROOM_ART_THEMES.anvil;
    if (room.type === 'god') return ROOM_ART_THEMES.god;
    if (room.type === 'boss' || BOSS_TYPES.has(room.type)) return ROOM_ART_THEMES.boss;
    if (room.type === 'secret') return ROOM_ART_THEMES.secret;
    if (room.type === 'treasure' || room.type === 'ladder') return ROOM_ART_THEMES.treasure;
    if (room.type === 'challenge') return ROOM_ART_THEMES.boss;
    return ROOM_ART_THEMES.dungeon;
  }

  function artNoise(tileX, tileY, salt = 0, room = currentRoom) {
    const gx = Number(room?.gx || 0);
    const gy = Number(room?.gy || 0);
    const value = Math.sin(tileX * 127.1 + tileY * 311.7 + gx * 74.7 + gy * 19.3 + floor * 13.1 + salt * 101.9) * 43758.5453;
    return value - Math.floor(value);
  }

  function pickFloorTile(tileX, tileY, theme) {
    const tiles = theme.floorTiles && theme.floorTiles.length ? theme.floorTiles : ['floor_stone_a'];
    const gardenTiles = theme.gardenFloorTiles && theme.gardenFloorTiles.length ? theme.gardenFloorTiles : tiles;
    const noise = artNoise(tileX, tileY, 1);
    const gardenBias = getGardenTileBias(currentRoom, theme);
    if (gardenTiles.length && noise < gardenBias) {
      const gardenNoise = artNoise(tileX, tileY, 9);
      return gardenTiles[Math.min(gardenTiles.length - 1, Math.floor(gardenNoise * gardenTiles.length))];
    }
    return tiles[Math.min(tiles.length - 1, Math.floor(noise * tiles.length))];
  }

  function getGardenTileBias(room = currentRoom, theme = getRoomArtTheme(room)) {
    if (floor <= 5) return 0;
    let bias = 0.18;
    if (!room) return bias;
    if (room.type === 'secret') bias = 0.58;
    else if (room.type === 'treasure') bias = 0.42;
    else if (room.type === 'shop') bias = 0.34;
    else if (room.type === 'anvil') bias = 0.3;
    else if (room.type === 'combat') bias = 0.26;
    else if (room.type === 'ladder') bias = 0.24;
    else if (room.type === 'boss') bias = 0.16;
    else if (room.type === 'god') bias = 0.12;
    if (theme === ROOM_ART_THEMES.secret) bias += 0.04;
    return clamp(bias + Math.min(0.08, Math.max(0, (10 - floor) * 0.006)), 0.08, 0.72);
  }

  function drawEnvironmentTile(tileKey, x, y, w = ENV_TILE_SIZE, h = ENV_TILE_SIZE, options = {}) {
    const target = options.ctx || ctx;
    const frame = ENV_TILE_ATLAS.frames[tileKey];
    if (!frame) {
      target.fillStyle = options.fallback || '#30342f';
      target.fillRect(x, y, w, h);
      return;
    }
    target.save();
    target.globalAlpha = options.alpha ?? 1;
    target.imageSmoothingEnabled = false;
    target.drawImage(
      ENV_TILE_ATLAS.canvas,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      x,
      y,
      w,
      h,
    );
    if (options.tint) {
      target.globalCompositeOperation = 'source-atop';
      target.fillStyle = options.tint;
      target.fillRect(x, y, w, h);
    }
    target.restore();
  }

  function drawTiledRect(tileKey, x, y, w, h, options = {}) {
    if (w <= 0 || h <= 0) return;
    const target = options.ctx || ctx;
    const tileSize = options.tileSize || ENV_TILE_SIZE;
    target.save();
    target.beginPath();
    target.rect(x, y, w, h);
    target.clip();
    for (let ty = y; ty < y + h; ty += tileSize) {
      for (let tx = x; tx < x + w; tx += tileSize) {
        drawEnvironmentTile(tileKey, tx, ty, tileSize, tileSize, { ...options, ctx: target });
      }
    }
    target.restore();
  }

  function drawFloorTiles(theme, target = ctx) {
    target.save();
    target.beginPath();
    target.rect(WALL, WALL, ROOM_W - WALL * 2, ROOM_H - WALL * 2);
    target.clip();
    for (let y = WALL; y < ROOM_H - WALL; y += ENV_TILE_SIZE) {
      for (let x = WALL; x < ROOM_W - WALL; x += ENV_TILE_SIZE) {
        const tileX = Math.floor((x - WALL) / ENV_TILE_SIZE);
        const tileY = Math.floor((y - WALL) / ENV_TILE_SIZE);
        const tile = pickFloorTile(tileX, tileY, theme);
        drawEnvironmentTile(tile, x, y, ENV_TILE_SIZE, ENV_TILE_SIZE, { tint: theme.floorTint, ctx: target });
      }
    }
    target.restore();
  }

  function drawFloorDecals(theme, target = ctx) {
    target.save();
    target.beginPath();
    target.rect(WALL + 8, WALL + 8, ROOM_W - WALL * 2 - 16, ROOM_H - WALL * 2 - 16);
    target.clip();
    const gardenBias = getGardenTileBias();
    const cols = Math.ceil((ROOM_W - WALL * 2) / ENV_TILE_SIZE);
    const rows = Math.ceil((ROOM_H - WALL * 2) / ENV_TILE_SIZE);
    for (let ty = 0; ty < rows; ty += 1) {
      for (let tx = 0; tx < cols; tx += 1) {
        const x = WALL + tx * ENV_TILE_SIZE;
        const y = WALL + ty * ENV_TILE_SIZE;
        const stainNoise = artNoise(tx, ty, 12);
        if (stainNoise > 0.84) {
          target.fillStyle = theme.stain;
          target.beginPath();
          target.ellipse(
            x + 14 + artNoise(tx, ty, 13) * 20,
            y + 16 + artNoise(tx, ty, 14) * 18,
            8 + artNoise(tx, ty, 15) * 14,
            4 + artNoise(tx, ty, 16) * 8,
            artNoise(tx, ty, 17) * Math.PI,
            0,
            Math.PI * 2,
          );
          target.fill();
        }

        if (artNoise(tx, ty, 22) > 0.78) {
          const sx = x + 8 + artNoise(tx, ty, 23) * 26;
          const sy = y + 8 + artNoise(tx, ty, 24) * 24;
          target.strokeStyle = theme.crack;
          target.lineWidth = 1.4;
          target.beginPath();
          target.moveTo(sx, sy);
          target.lineTo(sx + 8 + artNoise(tx, ty, 25) * 12, sy - 4 + artNoise(tx, ty, 26) * 8);
          target.lineTo(sx + 15 + artNoise(tx, ty, 27) * 14, sy + 4 + artNoise(tx, ty, 28) * 12);
          target.stroke();
        }

        if (gardenBias > 0.12 && artNoise(tx, ty, 31) < gardenBias * 0.4) {
          target.fillStyle = 'rgba(92, 149, 74, 0.24)';
          target.beginPath();
          target.ellipse(
            x + 8 + artNoise(tx, ty, 32) * 24,
            y + 8 + artNoise(tx, ty, 33) * 24,
            5 + artNoise(tx, ty, 34) * 5,
            2 + artNoise(tx, ty, 35) * 3,
            artNoise(tx, ty, 36) * Math.PI,
            0,
            Math.PI * 2,
          );
          target.fill();
          target.fillStyle = 'rgba(156, 218, 122, 0.18)';
          target.fillRect(x + 2 + artNoise(tx, ty, 37) * 10, y + 2 + artNoise(tx, ty, 38) * 10, 2, 2);
        }
      }
    }
    target.restore();
  }

  function drawLockedDoor(dir, target = ctx) {
    const isNorth = dir === 'n';
    const isSouth = dir === 's';
    const isWest = dir === 'w';

    // Door panel bounds (the opening in the wall)
    let dx, dy, dw, dh;
    if (isNorth) {
      dx = (ROOM_W - DOOR) / 2; dy = 0; dw = DOOR; dh = WALL + 10;
    } else if (isSouth) {
      dx = (ROOM_W - DOOR) / 2; dy = ROOM_H - WALL - 10; dw = DOOR; dh = WALL + 10;
    } else if (isWest) {
      dx = 0; dy = (ROOM_H - DOOR) / 2; dw = WALL + 10; dh = DOOR;
    } else {
      dx = ROOM_W - WALL - 10; dy = (ROOM_H - DOOR) / 2; dw = WALL + 10; dh = DOOR;
    }

    const cx = dx + dw / 2;
    const cy = dy + dh / 2;

    target.save();

    // Wood door panel fill
    const woodGrad = isNorth || isSouth
      ? target.createLinearGradient(dx, cy, dx + dw, cy)
      : target.createLinearGradient(cx, dy, cx, dy + dh);
    woodGrad.addColorStop(0,    'rgba(90,52,22,0.97)');
    woodGrad.addColorStop(0.35, 'rgba(110,64,28,0.97)');
    woodGrad.addColorStop(0.65, 'rgba(96,56,22,0.97)');
    woodGrad.addColorStop(1,    'rgba(75,42,16,0.97)');
    target.fillStyle = woodGrad;
    target.fillRect(dx, dy, dw, dh);

    // Wood grain lines
    target.strokeStyle = 'rgba(60,35,12,0.35)';
    target.lineWidth = 1;
    const grainCount = 5;
    for (let i = 1; i < grainCount; i++) {
      target.beginPath();
      if (isNorth || isSouth) {
        const gx = dx + (dw / grainCount) * i;
        target.moveTo(gx, dy); target.lineTo(gx, dy + dh);
      } else {
        const gy = dy + (dh / grainCount) * i;
        target.moveTo(dx, gy); target.lineTo(dx + dw, gy);
      }
      target.stroke();
    }

    // Door frame border
    target.strokeStyle = 'rgba(55,32,10,0.95)';
    target.lineWidth = 3;
    target.strokeRect(dx + 1.5, dy + 1.5, dw - 3, dh - 3);

    // Metal hinges (two, offset toward door edges)
    const hingeColor = 'rgba(80,80,90,0.92)';
    const hingeHighlight = 'rgba(140,140,160,0.75)';
    const hingeW = 8, hingeH = 14;
    const hingeOffsets = isNorth || isSouth ? [-DOOR * 0.28, DOOR * 0.28] : [-DOOR * 0.28, DOOR * 0.28];
    for (const off of hingeOffsets) {
      const hx = cx + (isNorth || isSouth ? off : -hingeW / 2) - (isNorth || isSouth ? hingeW / 2 : 0);
      const hy = cy + (isNorth || isSouth ? -hingeH / 2 : off) - (isNorth || isSouth ? 0 : hingeH / 2);
      const hw = isNorth || isSouth ? hingeW : hingeH;
      const hh = isNorth || isSouth ? hingeH : hingeW;
      target.fillStyle = hingeColor;
      target.fillRect(hx, hy, hw, hh);
      target.strokeStyle = hingeHighlight;
      target.lineWidth = 1;
      target.strokeRect(hx + 0.5, hy + 0.5, hw - 1, hh - 1);
    }

    // Padlock icon centered on the door
    const lw = 18, lh = 22;
    const lx = cx - lw / 2;
    const ly = cy - lh / 2;
    const shackleR = lw * 0.38;

    // Lock body
    target.shadowColor = 'rgba(200,30,30,0.9)';
    target.shadowBlur = 10;
    target.fillStyle = 'rgba(160,40,40,0.97)';
    const bodyTop = ly + lh * 0.38;
    const bodyH = lh * 0.62;
    target.beginPath();
    target.roundRect(lx, bodyTop, lw, bodyH, 3);
    target.fill();
    target.strokeStyle = 'rgba(220,80,80,0.8)';
    target.lineWidth = 1.5;
    target.stroke();

    // Shackle (arch over body)
    target.shadowBlur = 8;
    target.strokeStyle = 'rgba(200,60,60,0.97)';
    target.lineWidth = 3.5;
    target.beginPath();
    target.arc(cx, bodyTop, shackleR, Math.PI, 0);
    target.stroke();

    // Keyhole
    target.shadowBlur = 0;
    target.fillStyle = 'rgba(30,10,10,0.95)';
    const khY = bodyTop + bodyH * 0.35;
    target.beginPath();
    target.arc(cx, khY, 3, 0, Math.PI * 2);
    target.fill();
    target.beginPath();
    target.moveTo(cx - 2, khY + 1);
    target.lineTo(cx + 2, khY + 1);
    target.lineTo(cx + 1.5, khY + 6);
    target.lineTo(cx - 1.5, khY + 6);
    target.closePath();
    target.fill();

    target.restore();
  }

  function drawDoorThreshold(dir, theme, locked, target = ctx) {
    const isNorth = dir === 'n';
    const isSouth = dir === 's';
    const isWest = dir === 'w';
    const x = isWest ? 0 : isNorth || isSouth ? (ROOM_W - DOOR) / 2 : ROOM_W - WALL - 10;
    const y = isNorth ? 0 : isSouth ? ROOM_H - WALL - 10 : (ROOM_H - DOOR) / 2;
    const w = isWest || dir === 'e' ? WALL + 10 : DOOR;
    const h = isNorth || isSouth ? WALL + 10 : DOOR;
    if (locked) {
      drawTiledRect(theme.thresholdTile, x, y, w, h, { tileSize: ENV_TILE_SIZE, tint: theme.floorTint, ctx: target });
    } else {
      target.fillStyle = 'rgba(8,8,10,0.96)';
      target.fillRect(x, y, w, h);
    }

    target.save();
    target.strokeStyle = locked ? 'rgba(160,40,40,0.85)' : theme.doorAccent;
    target.lineWidth = locked ? 3 : 2;
    target.shadowColor = locked ? 'rgba(200,30,30,0.9)' : theme.doorAccent;
    target.shadowBlur = locked ? 12 : 5;
    target.beginPath();
    if (isNorth || isSouth) {
      const edgeY = isNorth ? WALL + 3 : ROOM_H - WALL - 3;
      target.moveTo((ROOM_W - DOOR) / 2 + 12, edgeY);
      target.lineTo((ROOM_W + DOOR) / 2 - 12, edgeY);
    } else {
      const edgeX = isWest ? WALL + 3 : ROOM_W - WALL - 3;
      target.moveTo(edgeX, (ROOM_H - DOOR) / 2 + 12);
      target.lineTo(edgeX, (ROOM_H + DOOR) / 2 - 12);
    }
    target.stroke();

    if (locked) {
      drawLockedDoor(dir, target);
    }

    target.restore();
  }

  function drawStoneWalls(theme, target = ctx) {
    drawTiledRect(theme.wallTile, 0, 0, ROOM_W, WALL + 8, { tileSize: ENV_TILE_SIZE, ctx: target });
    drawTiledRect(theme.wallTile, 0, ROOM_H - WALL - 8, ROOM_W, WALL + 8, { tileSize: ENV_TILE_SIZE, ctx: target });
    drawTiledRect(theme.wallTile, 0, 0, WALL + 8, ROOM_H, { tileSize: ENV_TILE_SIZE, ctx: target });
    drawTiledRect(theme.wallTile, ROOM_W - WALL - 8, 0, WALL + 8, ROOM_H, { tileSize: ENV_TILE_SIZE, ctx: target });

    const roomLocked = isRoomLocked();
    DIRECTIONS.forEach(dir => {
      if (hasVisibleRoomExit(currentRoom, dir)) drawDoorThreshold(dir, theme, roomLocked, target);
    });

    target.save();
    target.fillStyle = theme.wallShadow;
    target.fillRect(WALL, WALL, ROOM_W - WALL * 2, 8);
    target.fillRect(WALL, ROOM_H - WALL - 8, ROOM_W - WALL * 2, 8);
    target.fillRect(WALL, WALL, 8, ROOM_H - WALL * 2);
    target.fillRect(ROOM_W - WALL - 8, WALL, 8, ROOM_H - WALL * 2);
    target.strokeStyle = enemies.length > 0 ? theme.combatAccent : theme.wallEdge;
    target.lineWidth = enemies.length > 0 ? 3 : 2;
    const inset = WALL + 3;
    const left = inset;
    const right = ROOM_W - inset;
    const top = inset;
    const bottom = ROOM_H - inset;
    const doorMinX = (ROOM_W - DOOR) / 2 + 10;
    const doorMaxX = (ROOM_W + DOOR) / 2 - 10;
    const doorMinY = (ROOM_H - DOOR) / 2 + 10;
    const doorMaxY = (ROOM_H + DOOR) / 2 - 10;
    target.beginPath();
    if (hasVisibleRoomExit(currentRoom, 'n')) {
      target.moveTo(left, top); target.lineTo(doorMinX, top);
      target.moveTo(doorMaxX, top); target.lineTo(right, top);
    } else {
      target.moveTo(left, top); target.lineTo(right, top);
    }
    if (hasVisibleRoomExit(currentRoom, 's')) {
      target.moveTo(left, bottom); target.lineTo(doorMinX, bottom);
      target.moveTo(doorMaxX, bottom); target.lineTo(right, bottom);
    } else {
      target.moveTo(left, bottom); target.lineTo(right, bottom);
    }
    if (hasVisibleRoomExit(currentRoom, 'w')) {
      target.moveTo(left, top); target.lineTo(left, doorMinY);
      target.moveTo(left, doorMaxY); target.lineTo(left, bottom);
    } else {
      target.moveTo(left, top); target.lineTo(left, bottom);
    }
    if (hasVisibleRoomExit(currentRoom, 'e')) {
      target.moveTo(right, top); target.lineTo(right, doorMinY);
      target.moveTo(right, doorMaxY); target.lineTo(right, bottom);
    } else {
      target.moveTo(right, top); target.lineTo(right, bottom);
    }
    target.stroke();

    // Draw bright arch accent on each open door gap so exits are obvious
    if (!roomLocked) {
      target.strokeStyle = theme.doorAccent;
      target.lineWidth = 3;
      target.shadowColor = theme.doorAccent;
      target.shadowBlur = 14;
      target.beginPath();
      if (hasVisibleRoomExit(currentRoom, 'n')) {
        target.moveTo(doorMinX, top); target.lineTo(doorMaxX, top);
      }
      if (hasVisibleRoomExit(currentRoom, 's')) {
        target.moveTo(doorMinX, bottom); target.lineTo(doorMaxX, bottom);
      }
      if (hasVisibleRoomExit(currentRoom, 'w')) {
        target.moveTo(left, doorMinY); target.lineTo(left, doorMaxY);
      }
      if (hasVisibleRoomExit(currentRoom, 'e')) {
        target.moveTo(right, doorMinY); target.lineTo(right, doorMaxY);
      }
      target.stroke();
    }

    target.restore();
  }

  function drawEnvironmentVignette(theme, target = ctx) {
    const gradient = target.createRadialGradient(
      ROOM_W / 2,
      ROOM_H / 2,
      120,
      ROOM_W / 2,
      ROOM_H / 2,
      Math.max(ROOM_W, ROOM_H) * 0.74,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, theme.vignette || 'rgba(0,0,0,0.4)');
    target.fillStyle = gradient;
    target.fillRect(0, 0, ROOM_W, ROOM_H);
  }

  function getEnvironmentBackgroundCacheKey() {
    const roomKey = currentRoom
      ? `${currentRoom.gx},${currentRoom.gy},${currentRoom.type || 'room'},${currentRoom.secretKind || ''}`
      : 'none';
    const doorsKey = DIRECTIONS.map(dir => hasVisibleRoomExit(currentRoom, dir) ? '1' : '0').join('');
    const combatKey = enemies.length > 0 ? 'combat' : 'calm';
    return `${floor}|${roomKey}|${doorsKey}|${combatKey}`;
  }

  function buildEnvironmentBackground(theme) {
    const canvasEl = document.createElement('canvas');
    canvasEl.width = ROOM_W;
    canvasEl.height = ROOM_H;
    const bg = canvasEl.getContext('2d');
    bg.imageSmoothingEnabled = false;
    bg.fillStyle = theme.backdrop;
    bg.fillRect(0, 0, ROOM_W, ROOM_H);
    drawFloorTiles(theme, bg);
    drawFloorDecals(theme, bg);
    drawStoneWalls(theme, bg);
    drawEnvironmentVignette(theme, bg);
    return canvasEl;
  }

  function drawFloor() {
    const theme = getRoomArtTheme();
    const cacheKey = getEnvironmentBackgroundCacheKey();
    if (!environmentBackgroundCache.canvas || environmentBackgroundCache.key !== cacheKey) {
      environmentBackgroundCache = {
        key: cacheKey,
        canvas: buildEnvironmentBackground(theme),
      };
    }
    ctx.drawImage(environmentBackgroundCache.canvas, 0, 0);
  }

  function drawChests() {
    chests.forEach(chest => {
      const t = Date.now() / 260 + chest.x * 0.01;
      ctx.save();
      ctx.translate(chest.x, chest.y);
      ctx.imageSmoothingEnabled = false;

      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(-28, 14, 56, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-20, 22, 40, 4);

      if (!chest.open) {
        ctx.shadowColor = '#ffd36a';
        ctx.shadowBlur = 8 + Math.sin(t) * 3;
        ctx.fillStyle = 'rgba(255,190,74,0.16)';
        ctx.fillRect(-32, -24, 64, 48);
      }

      ctx.shadowBlur = 0;

      if (chest.open) {
        ctx.fillStyle = '#1a0d06';
        ctx.fillRect(-26, -20, 52, 8);
        ctx.fillRect(-30, -12, 60, 8);
        ctx.fillStyle = '#6b3718';
        ctx.fillRect(-22, -24, 44, 8);
        ctx.fillStyle = '#b86825';
        ctx.fillRect(-18, -24, 36, 4);
        ctx.fillStyle = '#282b31';
        ctx.fillRect(-18, -24, 6, 12);
        ctx.fillRect(12, -24, 6, 12);

        ctx.fillStyle = '#1a0d06';
        ctx.fillRect(-30, -4, 60, 28);
        ctx.fillStyle = '#3d2012';
        ctx.fillRect(-26, 0, 52, 20);
        ctx.fillStyle = '#120907';
        ctx.fillRect(-20, 2, 40, 12);
        ctx.fillStyle = '#7f4a24';
        ctx.fillRect(-26, 16, 52, 4);
        ctx.fillStyle = '#282f38';
        ctx.fillRect(-20, -4, 6, 28);
        ctx.fillRect(14, -4, 6, 28);
      } else {
        ctx.fillStyle = '#1a0d06';
        ctx.fillRect(-32, -20, 64, 44);
        ctx.fillStyle = '#7e3f1a';
        ctx.fillRect(-28, -2, 56, 24);
        ctx.fillStyle = '#a95f22';
        ctx.fillRect(-28, -18, 56, 18);
        ctx.fillStyle = '#d3822d';
        ctx.fillRect(-24, -18, 48, 6);
        ctx.fillStyle = '#efad42';
        ctx.fillRect(-20, -16, 40, 4);
        ctx.fillStyle = '#5a2a12';
        ctx.fillRect(-24, 6, 48, 6);

        ctx.fillStyle = '#303946';
        ctx.fillRect(-22, -22, 6, 46);
        ctx.fillRect(16, -22, 6, 46);
        ctx.fillRect(-30, -4, 60, 6);
        ctx.fillStyle = '#69727e';
        ctx.fillRect(-20, -20, 2, 40);
        ctx.fillRect(18, -20, 2, 40);

        ctx.fillStyle = '#ffd86c';
        ctx.fillRect(-8, -2, 16, 16);
        ctx.fillStyle = '#271302';
        ctx.fillRect(-6, -2, 12, 2);
        ctx.fillRect(-6, 12, 12, 2);
        ctx.fillRect(-8, 0, 2, 12);
        ctx.fillRect(6, 0, 2, 12);
        ctx.fillStyle = '#4a260d';
        ctx.fillRect(-2, 5, 4, 6);
      }
      ctx.restore();
    });
  }

  function drawRoomDecor() {
    const theme = getRoomArtTheme();
    decorations.forEach(decor => {
      ctx.save();
      ctx.translate(decor.x, decor.y);
      if (decor.kind === 'rubble') {
        ctx.fillStyle = 'rgba(42,44,38,0.55)';
        ctx.beginPath();
        ctx.ellipse(0, 1, decor.r * 1.15, decor.r * 0.62, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(92,91,76,0.38)';
        for (let index = 0; index < 5; index += 1) {
          const angle = index * 1.7 + decor.x * 0.01;
          const rx = Math.cos(angle) * decor.r * 0.55;
          const ry = Math.sin(angle) * decor.r * 0.28;
          ctx.fillRect(rx - 3, ry - 2, 6, 4);
        }
      } else if (decor.kind === 'banner') {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(-12, -18, 24, 42);
        ctx.fillStyle = theme.banner;
        ctx.beginPath();
        ctx.moveTo(-11, -24);
        ctx.lineTo(11, -24);
        ctx.lineTo(9, 17);
        ctx.lineTo(2, 11);
        ctx.lineTo(-6, 20);
        ctx.lineTo(-9, 17);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(229,185,98,0.32)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-13, -25);
        ctx.lineTo(13, -25);
        ctx.stroke();
      } else if (decor.kind === 'crack') {
        ctx.strokeStyle = theme.crack;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-decor.r, -6);
        ctx.lineTo(-8, 0);
        ctx.lineTo(0, -8);
        ctx.lineTo(10, 4);
        ctx.lineTo(decor.r, -2);
        ctx.stroke();
      } else if (decor.kind === 'brazier') {
        ctx.fillStyle = 'rgba(26,20,14,0.9)';
        ctx.beginPath();
        ctx.arc(0, 3, decor.r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,120,60,0.78)';
        ctx.shadowColor = '#ff7b39';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, -2, decor.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (decor.kind === 'tree') {
        // Shadow
        ctx.fillStyle = 'rgba(20,30,14,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, decor.r * 0.7, decor.r * 0.9, decor.r * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        // Trunk
        ctx.fillStyle = '#5c3a1e';
        ctx.fillRect(-4, -decor.r * 0.3, 8, decor.r * 0.85);
        // Canopy layers
        ctx.shadowColor = '#3a7d2c';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#3a7d2c';
        ctx.beginPath();
        ctx.arc(0, -decor.r * 0.5, decor.r * 0.78, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#52a83a';
        ctx.beginPath();
        ctx.arc(-decor.r * 0.22, -decor.r * 0.7, decor.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(decor.r * 0.22, -decor.r * 0.78, decor.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(160,230,100,0.25)';
        ctx.beginPath();
        ctx.arc(-decor.r * 0.15, -decor.r * 0.85, decor.r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (decor.kind === 'fruit_tree') {
        ctx.fillStyle = 'rgba(18,30,12,0.34)';
        ctx.beginPath();
        ctx.ellipse(0, decor.r * 0.74, decor.r, decor.r * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5f3d1f';
        ctx.fillRect(-4, -decor.r * 0.28, 8, decor.r * 0.9);
        ctx.fillStyle = '#3f7a2d';
        ctx.beginPath();
        ctx.arc(0, -decor.r * 0.46, decor.r * 0.84, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#58a73d';
        ctx.beginPath();
        ctx.arc(-decor.r * 0.28, -decor.r * 0.68, decor.r * 0.58, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(decor.r * 0.26, -decor.r * 0.74, decor.r * 0.52, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff7385';
        ctx.shadowColor = '#ff7f8f';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(-decor.r * 0.18, -decor.r * 0.62, 3, 0, Math.PI * 2);
        ctx.arc(decor.r * 0.15, -decor.r * 0.5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (decor.kind === 'moss_patch') {
        ctx.fillStyle = 'rgba(17,34,18,0.5)';
        ctx.beginPath();
        ctx.ellipse(0, 2, decor.r * 1.2, decor.r * 0.56, decor.x * 0.01, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(92,145,72,0.5)';
        ctx.beginPath();
        ctx.ellipse(-decor.r * 0.2, -1, decor.r * 0.74, decor.r * 0.34, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(149,208,109,0.22)';
        ctx.fillRect(-decor.r * 0.4, -1, decor.r * 0.45, 2);
      }
      ctx.restore();
    });

    structures.forEach(structure => {
      ctx.save();
      ctx.translate(structure.x, structure.y);
      if (structure.kind === 'pillar') {
        drawEnvironmentTile('pillar_stone', -structure.w / 2, -structure.h / 2, structure.w, structure.h);
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
      } else {
        drawEnvironmentTile('wall_block', -structure.w / 2, -structure.h / 2, structure.w, structure.h);
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
      }
      ctx.restore();
    });
  }

  function drawWorldProps() {
    const theme = getRoomArtTheme();
    hazards.forEach(hazard => {
      ctx.save();
      ctx.translate(hazard.x, hazard.y);
      if (hazard.kind === 'lava') {
        const t = lavaAnimTime * (hazard.pulse || 1.5) + (hazard.phase || 0);
        const wobble = hazard.wobble || 0.6;
        const pulse = 1 + Math.sin(t * 2.4) * 0.07;
        const outerRadius = hazard.r * pulse;

        ctx.shadowColor = '#ff5a3d';
        ctx.shadowBlur = 12 + Math.sin(t * 3.1) * 6;
        ctx.fillStyle = 'rgba(255,95,42,0.55)';
        ctx.beginPath();
        for (let index = 0; index <= 26; index += 1) {
          const angle = (index / 26) * Math.PI * 2;
          const wave = Math.sin(t * 3.2 + angle * 4) * 0.06 * wobble
            + Math.cos(t * 1.9 + angle * 7) * 0.04 * wobble;
          const rr = outerRadius * (1 + wave);
          const px = Math.cos(angle) * rr;
          const py = Math.sin(angle) * rr;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = `rgba(255,170,70,${0.45 + Math.sin(t * 4.5) * 0.12})`;
        ctx.beginPath();
        ctx.arc(Math.sin(t * 2.1) * 3, Math.cos(t * 2.6) * 3, hazard.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (hazard.kind === 'healing_zone') {
        const t = Date.now() * 0.004 + (hazard.ttl || 0);
        const pulse = 1 + Math.sin(t * 2.2) * 0.08;
        const inner = hazard.r * 0.62 * pulse;
        ctx.fillStyle = `rgba(80,255,140,${0.12 + Math.sin(t * 1.8) * 0.04})`;
        ctx.beginPath();
        ctx.arc(0, 0, inner, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#35ff6f';
        ctx.shadowColor = '#35ff6f';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i += 1) {
          const a = t + i * (Math.PI * 2 / 6);
          const px = Math.cos(a) * (hazard.r * 0.7);
          const py = Math.sin(a) * (hazard.r * 0.7);
          ctx.beginPath();
          ctx.moveTo(px - 4, py);
          ctx.lineTo(px + 4, py);
          ctx.moveTo(px, py - 4);
          ctx.lineTo(px, py + 4);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.moveTo(0, -8);
        ctx.lineTo(0, 8);
        ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = 'rgba(210,255,225,0.75)';
        ctx.lineWidth = 1.5;
        for (let index = 0; index < 10; index += 1) {
          const a = -t * 0.55 + index * (Math.PI * 2 / 10);
          const r0 = hazard.r * 0.84;
          const r1 = hazard.r * 0.93;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (hazard.kind === 'fire_circle') {
        const t = Date.now() * 0.005;
        const pulse = 1 + Math.sin(t * 2.6) * 0.07;
        ctx.strokeStyle = '#ff7b32';
        ctx.shadowColor = '#ff7b32';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,102,40,0.15)';
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * 0.76, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.78;
        ctx.strokeStyle = 'rgba(255,205,90,0.8)';
        ctx.lineWidth = 2;
        for (let index = 0; index < 14; index += 1) {
          const a = t * 0.9 + index * (Math.PI * 2 / 14);
          const wiggle = Math.sin(t * 2 + index) * 4;
          const r0 = hazard.r * 0.46 + wiggle;
          const r1 = hazard.r * 0.68 + wiggle;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a + 0.14) * r1, Math.sin(a + 0.14) * r1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (hazard.kind === 'lightning_column') {
        const t = Date.now() * 0.006 + hazard.x * 0.01;
        ctx.fillStyle = 'rgba(112,180,255,0.12)';
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8dd4ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * (0.8 + Math.sin(t) * 0.04), 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(170,220,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -hazard.r);
        ctx.lineTo(0, hazard.r);
        ctx.stroke();
        ctx.shadowColor = '#bde8ff';
        ctx.shadowBlur = 16;
        for (let index = 0; index < 5; index += 1) {
          const a = t * 1.7 + index * (Math.PI * 2 / 5);
          const branch = hazard.r * (0.28 + 0.12 * Math.sin(t + index));
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * branch * 0.3, Math.sin(a) * branch * 0.3);
          ctx.lineTo(Math.cos(a + 0.22) * branch, Math.sin(a + 0.22) * branch);
          ctx.lineTo(Math.cos(a - 0.1) * hazard.r * 0.72, Math.sin(a - 0.1) * hazard.r * 0.72);
          ctx.stroke();
        }
      }
      ctx.restore();
    });

    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      ctx.save();
      ctx.translate(prop.x, prop.y);
      if (prop.kind === 'pot') {
        drawEnvironmentTile('pot_clay', -16, -18, 32, 32);
      } else if (prop.kind === 'barrel') {
        drawEnvironmentTile('barrel_oak', -17, -18, 34, 34);
      } else if (prop.kind === 'wall') {
        drawEnvironmentTile('wall_block', -26, -26, 52, 52);
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-25, -25, 50, 50);
      } else if (prop.kind === 'secret_wall') {
        drawEnvironmentTile('secret_wall_block', -25, -25, 50, 50);
        ctx.strokeStyle = 'rgba(125,110,70,0.48)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-24, -24, 48, 48);
      }
      ctx.restore();
    });

    shopOffers.forEach(offer => {
      if (offer.bought) return;
      const blockedByChallenge = offer.type === 'item' && isChallengeActive('no_items');
      const canAfford = !!player && player.coins >= offer.cost;
      ctx.save();
      ctx.translate(offer.x, offer.y);
      ctx.fillStyle = blockedByChallenge || !canAfford ? 'rgba(36,18,24,0.95)' : 'rgba(0,30,44,0.95)';
      ctx.strokeStyle = blockedByChallenge || !canAfford ? '#ff8b98' : '#ffd966';
      ctx.lineWidth = 2;
      ctx.fillRect(-26, -26, 52, 52);
      ctx.strokeRect(-26, -26, 52, 52);

      // Draw pixel icon for the offer
      const iconDef = offer.type === 'item'
        ? window.NeoNykeIconDefs?.items?.[offer.key]
        : offer.type === 'move'
          ? window.NeoNykeIconDefs?.moves?.[offer.key]
          : offer.type === 'weapon'
            ? window.NeoNykeIconDefs?.weapons?.[offer.key]
            : offer.type === 'potion'
              ? window.NeoNykeIconDefs?.pickups?.potion
              : null;
      if (iconDef) {
        const iconColor = blockedByChallenge ? '#ff8b98' : iconDef.color || '#ffffff';
        const scale = 32 / 32; // 1px per logical pixel, icon grid is 8x8 drawn at 4px each = 32px total
        const iconSize = 32;
        ctx.save();
        ctx.translate(-iconSize / 2, -iconSize / 2 - 4);
        ctx.shadowColor = iconColor;
        ctx.shadowBlur = blockedByChallenge ? 0 : 8;
        ctx.fillStyle = iconColor;
        iconDef.pixels.forEach(([px, py]) => {
          ctx.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
        });
        ctx.restore();
      } else {
        // fallback circle
        ctx.fillStyle = blockedByChallenge
          ? '#ff8b98'
          : offer.type === 'item' ? '#a857ff' : offer.type === 'potion' ? '#35ff6f' : '#8fd2ff';
        ctx.beginPath();
        ctx.arc(0, -6, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.fillStyle = blockedByChallenge || !canAfford ? '#ffccd2' : '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(offer.cost), 0, 22);
      ctx.restore();
    });
  }

  function drawPickups() {
    pickups.forEach(pickup => {
      if (!pickup || typeof pickup !== 'object' || typeof pickup.type !== 'string') return;
      ctx.save();
      const t = Date.now() / 260;
      const bob = Math.sin(t * 0.9) * 3;
      ctx.translate(pickup.x, pickup.y + bob);
      ctx.globalAlpha = 0.88 + Math.sin(t) * 0.12;
      if (pickup.type === 'coin') {
        ctx.shadowColor = '#ffd966';
        ctx.shadowBlur = 12;
        if (ui.coinIcon instanceof HTMLCanvasElement) {
          const s = 18;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(ui.coinIcon, -s / 2, -s / 2, s, s);
        } else {
          ctx.fillStyle = '#ffd966';
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (pickup.type === 'potion') {
        const potionDef = window.NeoNykeIconDefs?.pickups?.potion;
        ctx.shadowColor = '#35ff6f';
        ctx.shadowBlur = 14;
        if (potionDef) {
          ctx.fillStyle = '#35ff6f';
          ctx.imageSmoothingEnabled = false;
          potionDef.pixels.forEach(([px, py]) => {
            ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          ctx.fillStyle = '#0f8';
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const appleDef = window.NeoNykeIconDefs?.pickups?.apple || window.NeoNykeIconDefs?.pickups?.fruit;
        const fruitPulse = 1 + Math.sin(t * 2.3) * 0.08;
        ctx.shadowColor = '#ff4b4b';
        ctx.shadowBlur = 16;
        ctx.save();
        ctx.scale(fruitPulse, fruitPulse);
        if (appleDef) {
          ctx.fillStyle = '#ff4b4b';
          ctx.imageSmoothingEnabled = false;
          appleDef.pixels.forEach(([px, py]) => {
            ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          ctx.fillStyle = '#ff4b4b';
          ctx.beginPath();
          ctx.arc(0, 0, 9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#7a1d1d';
        ctx.fillRect(-1, -12, 2, 5);
        ctx.fillStyle = '#ffd8d8';
        ctx.fillRect(2, -11, 2, 2);
      } else if (pickup.type === 'item') {
        const item = itemRegistry.get(pickup.key);
        const color = item?.color || '#fff';
        const iconDef = window.NeoNykeIconDefs?.items?.[pickup.key];
        ctx.shadowColor = color;
        ctx.shadowBlur = item?.rarity === 'god' ? 20 : 14;
        if (item?.rarity === 'god' && item?.accent) {
          ctx.strokeStyle = item.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 17, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (iconDef) {
          ctx.fillStyle = color;
          ctx.imageSmoothingEnabled = false;
          iconDef.pixels.forEach(([px, py]) => {
            ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (pickup.type === 'ladder') {
        ctx.strokeStyle = '#7dff9e';
        ctx.shadowColor = '#7dff9e';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 3;
        ctx.strokeRect(-12, -16, 24, 32);
        ctx.beginPath();
        ctx.moveTo(-6, -12); ctx.lineTo(-6, 12);
        ctx.moveTo(6, -12); ctx.lineTo(6, 12);
        ctx.moveTo(-6, -6); ctx.lineTo(6, -6);
        ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
        ctx.moveTo(-6, 6); ctx.lineTo(6, 6);
        ctx.stroke();
      } else if (pickup.type === 'fightGod') {
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('FIGHT', 0, 3);
      } else if (pickup.type === 'returnGate') {
        ctx.strokeStyle = '#0ff';
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#aff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('LOOP', 0, 3);
      } else if (pickup.type === 'descend') {
        ctx.strokeStyle = '#c9a8f0';
        ctx.shadowColor = '#c9a8f0';
        ctx.shadowBlur = 22;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#c9a8f0';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('DESCEND', 0, 3);
      } else if (pickup.type === 'secretWarp') {
        const color = pickup.delta >= 0 ? '#8dffcf' : '#8dd4ff';
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.moveTo(0, -8);
        ctx.lineTo(8, 0);
        ctx.lineTo(0, 8);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`F${pickup.targetFloor}`, 0, 32);
      } else if (pickup.type === 'secretVendor') {
        const cost = Number(pickup.cost || 0);
        const usesCoins = pickup.offerKind === 'xp';
        const canAfford = usesCoins
          ? Number(player?.coins || 0) >= cost
          : Number(metaProgress.loopCrystals || 0) >= cost;
        const color = canAfford ? '#aee7ff' : '#ffb1b1';
        ctx.fillStyle = 'rgba(7,17,22,0.92)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.fillRect(-22, -18, 44, 36);
        ctx.strokeRect(-22, -18, 44, 36);
        ctx.fillStyle = color;
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(String(pickup.label || 'Offer'), 0, -2);
        ctx.font = 'bold 10px system-ui';
        ctx.fillText(`${cost} ${usesCoins ? 'C' : 'LC'}`, 0, 12);
      } else if (pickup.type === 'crown') {
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(-14, 10);
        ctx.lineTo(-10, -8);
        ctx.lineTo(-2, 0);
        ctx.lineTo(0, -12);
        ctx.lineTo(2, 0);
        ctx.lineTo(10, -8);
        ctx.lineTo(14, 10);
        ctx.closePath();
        ctx.fill();
      } else if (pickup.type === 'challengeStarter') {
        const trial = pickup.trial || 'mirror';
        const color = trial === 'bomb' ? '#ff8a6a' : trial === 'storm' ? '#8dd4ff' : trial === 'survival' ? '#ffcf7d' : '#d7f6ff';
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        if (trial === 'mirror') {
          ctx.beginPath();
          ctx.moveTo(0, -28);
          ctx.lineTo(0, 16);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-14, -6);
          ctx.lineTo(14, -6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-8, 16);
          ctx.lineTo(8, 16);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, 18, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-10, 0);
          ctx.lineTo(10, 0);
          ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(getChallengeTrialLabel(trial), 0, 34);
      } else if (pickup.type === 'challengeBomb') {
        ctx.fillStyle = pickup.safe ? '#8dd4ff' : '#ff7a66';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
      } else if (pickup.type === 'challengeRune') {
        ctx.strokeStyle = '#8dd4ff';
        ctx.shadowColor = '#8dd4ff';
        ctx.shadowBlur = 16;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(10, 0);
        ctx.lineTo(0, 12);
        ctx.lineTo(-10, 0);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function getProjectileVisual(projectile) {
    const kind = projectile.kind || 'shot';
    if (projectile.enemy) {
      if (kind === 'sword' || kind === 'god_sword') return { color: '#f6f1ff', core: '#ffffff', trail: '#d8c7ff', shape: 'blade', length: 28 };
      if (kind === 'sniper_round') return { color: '#ff5d72', core: '#ffe1e6', trail: '#ff314d', shape: 'dart', length: 34 };
      if (kind === 'machine_round') return { color: '#ffb35a', core: '#fff1ba', trail: '#ff6738', shape: 'tracer', length: 22 };
      return { color: projectile.color || '#ff6688', core: '#ffe4eb', trail: projectile.color || '#ff6688', shape: 'dart', length: 24 };
    }
    if (kind === 'fireball') return { color: '#ff7b32', core: '#fff1a6', trail: '#ff2f17', shape: 'fireball', length: 30 };
    if (kind === 'disk') return { color: '#b66cff', core: '#f0d8ff', trail: '#7d4dff', shape: 'disk', length: 20 };
    if (kind === 'magenta_p90') return { color: '#ff9dd7', core: '#fff0fb', trail: '#ff4aa8', shape: 'tracer', length: 26 };
    if (kind === 'magenta_degale') return { color: '#ff8bd2', core: '#fff0fb', trail: '#ff3eb7', shape: 'slug', length: 34 };
    if (kind === 'hunters_bow') return { color: '#dff8ff', core: '#ffffff', trail: '#7edcff', shape: 'arrow', length: 32 };
    if (kind === 'void_piercer') return { color: '#ffd2c0', core: '#fff8ee', trail: '#ff826a', shape: 'dart', length: 30 };
    return { color: projectile.color || '#ffd7aa', core: '#ffffff', trail: projectile.color || '#ffd7aa', shape: 'orb', length: 20 };
  }

  function drawProjectileTrail(projectile, visual, angle) {
    const trail = Array.isArray(projectile.trail) ? projectile.trail : [];
    if (!trail.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (let index = trail.length - 1; index >= 0; index -= 1) {
      const point = trail[index];
      const next = index === 0 ? projectile : trail[index - 1];
      const alpha = (1 - index / trail.length) * 0.32;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = visual.trail;
      ctx.shadowColor = visual.trail;
      ctx.shadowBlur = 8;
      ctx.lineWidth = Math.max(1.5, projectile.r * (0.42 - index * 0.035));
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }
    if (visual.shape === 'fireball') {
      const tail = trail[Math.min(trail.length - 1, 2)];
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = '#3d1420';
      ctx.beginPath();
      ctx.ellipse(tail.x - Math.cos(angle) * 3, tail.y - Math.sin(angle) * 3, projectile.r * 1.3, projectile.r * 0.65, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawProjectileShape(projectile, visual) {
    const angle = Math.atan2(projectile.vy, projectile.vx);
    const r = projectile.r || 5;
    drawProjectileTrail(projectile, visual, angle);

    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(angle);
    ctx.shadowColor = visual.color;
    ctx.shadowBlur = projectile.enemy ? 12 : 14;
    ctx.fillStyle = visual.color;
    ctx.strokeStyle = visual.core;
    ctx.lineWidth = 1.5;

    if (visual.shape === 'fireball') {
      const t = Date.now() * 0.012 + projectile.x * 0.02;
      ctx.fillStyle = '#ff5a2c';
      ctx.beginPath();
      for (let index = 0; index < 14; index += 1) {
        const a = (index / 14) * Math.PI * 2;
        const wobble = 1 + Math.sin(t + index * 1.7) * 0.18;
        const rr = r * (1.15 + (index % 2) * 0.18) * wobble;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (visual.shape === 'disk') {
      const spin = Date.now() * 0.018;
      ctx.rotate(spin);
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.45, 0.25, Math.PI * 1.35);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = visual.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.25, r * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.fillRect(-r * 0.75, -1, r * 1.5, 2);
    } else if (visual.shape === 'blade' || visual.shape === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(r * 1.8, 0);
      ctx.lineTo(-r * 1.1, -r * 0.52);
      ctx.lineTo(-r * 0.55, 0);
      ctx.lineTo(-r * 1.1, r * 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (visual.shape === 'tracer' || visual.shape === 'dart' || visual.shape === 'slug') {
      ctx.beginPath();
      ctx.moveTo(r * 1.8, 0);
      ctx.lineTo(-r * 1.25, -r * 0.58);
      ctx.lineTo(-r * 0.72, 0);
      ctx.lineTo(-r * 1.25, r * 0.58);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.beginPath();
      ctx.ellipse(r * 0.42, 0, r * 0.48, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.beginPath();
      ctx.arc(r * 0.1, -r * 0.18, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawProjectiles() {
    projectiles.forEach(projectile => {
      if (!projectile) return;
      drawProjectileShape(projectile, getProjectileVisual(projectile));
    });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawDeadBodies() {
    deadBodies.forEach(body => {
      if (!body) return;
      const life = Math.max(0.01, Number(body.life || CORPSE_LIFETIME));
      const fadeStart = Math.min(life - 0.01, Number(body.fadeStart || CORPSE_FADE_START));
      const age = Math.max(0, Number(body.age || 0));
      const fallTime = Math.max(0.01, Number(body.fallTime || CORPSE_FALL_TIME));
      const fallT = clamp(age / fallTime, 0, 1);
      const fallEase = 1 - (1 - fallT) ** 3;
      const fadeT = age <= fadeStart ? 0 : clamp((age - fadeStart) / (life - fadeStart), 0, 1);
      const alpha = Math.max(0, 1 - fadeT);
      if (alpha <= 0) return;

      const size = Number(body.size || Math.max(30, Number(body.r || 12) * 2.4));
      const frame = SPRITE_ATLAS.frames[body.spriteKey] || SPRITE_ATLAS.frames.hunter;
      if (!frame) return;
      const squash = 1 - 0.46 * fallEase;
      const rotation = Number(body.angle || 0) + Number(body.fallAngle || 0) * fallEase;
      const poolScale = clamp(age / 1.2, 0, 1) * alpha;

      ctx.save();
      ctx.translate(body.x, body.y);
      ctx.globalAlpha = alpha;

      ctx.fillStyle = body.type === 'god'
        ? `rgba(224,220,255,${0.2 * poolScale})`
        : `rgba(94,0,16,${0.32 * poolScale})`;
      ctx.beginPath();
      ctx.ellipse(0, size * 0.26, size * (0.35 + poolScale * 0.14), size * (0.08 + poolScale * 0.05), rotation * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(0,0,0,${0.28 * alpha})`;
      ctx.beginPath();
      ctx.ellipse(0, size * 0.32, size * 0.34, size * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(rotation);
      if (Number(body.face || 1) < 0) ctx.scale(-1, 1);
      ctx.scale(1 + 0.05 * fallEase, squash);
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor = body.elite ? 'rgba(255,170,64,0.35)' : 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = body.elite ? 8 : 3;
      ctx.drawImage(
        SPRITE_ATLAS.canvas,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        -size / 2,
        -size / 2,
        size,
        size,
      );
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = body.type === 'god'
        ? `rgba(255,255,255,${0.15 + fadeT * 0.16})`
        : `rgba(48,12,18,${0.22 + fadeT * 0.34})`;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    });
  }

  function buildEnvironmentTileAtlas() {
    const entries = Object.entries(ENV_TILE_DEFS);
    const canvasEl = document.createElement('canvas');
    canvasEl.width = Math.max(1, ENV_TILE_SOURCE_SIZE * Math.max(1, entries.length));
    canvasEl.height = ENV_TILE_SOURCE_SIZE;
    const atlasCtx = canvasEl.getContext('2d');
    atlasCtx.imageSmoothingEnabled = false;
    const frames = {};
    entries.forEach(([key, def], index) => {
      const ox = index * ENV_TILE_SOURCE_SIZE;
      frames[key] = { x: ox, y: 0, w: ENV_TILE_SOURCE_SIZE, h: ENV_TILE_SOURCE_SIZE };
      drawEnvironmentTileAsset(atlasCtx, ox, 0, ENV_TILE_SOURCE_SIZE, def || {});
    });
    return { canvas: canvasEl, frames };
  }

  function drawEnvironmentTileAsset(g, ox, oy, size, def) {
    g.save();
    if (!def.transparent) {
      g.fillStyle = def.base || '#343832';
      g.fillRect(ox, oy, size, size);
    }

    if (def.kind === 'floor') {
      drawFloorTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'plank') {
      drawPlankTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'wall') {
      drawWallTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'threshold') {
      drawThresholdTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'pillar') {
      drawPillarTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'block') {
      drawBlockTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'pot') {
      drawPotTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'barrel') {
      drawBarrelTileAsset(g, ox, oy, size, def);
    }

    drawTileCracks(g, ox, oy, def);
    drawTileChips(g, ox, oy, def);
    g.restore();
  }

  function drawFloorTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.shade || '#252823';
    g.fillRect(ox, oy + size - 3, size, 3);
    g.fillRect(ox + size - 3, oy, 3, size);
    g.fillStyle = def.edge || '#4c5047';
    g.fillRect(ox + 1, oy + 1, size - 3, 1);
    g.fillRect(ox + 1, oy + 1, 1, size - 3);
    g.strokeStyle = def.mortar || '#1c1f1d';
    g.lineWidth = 1;
    g.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
    if (def.moss) {
      g.fillStyle = def.moss;
      g.fillRect(ox + 1, oy + size - 4, 5, 2);
      g.fillRect(ox + size - 5, oy + 2, 3, 1);
      g.fillRect(ox + 7, oy + 13, 4, 1);
    }
    if (def.overgrowth) {
      g.fillStyle = def.overgrowth;
      g.fillRect(ox + 2, oy + size - 6, 8, 1);
      g.fillRect(ox + 9, oy + size - 7, 1, 3);
      g.fillRect(ox + size - 4, oy + 4, 2, 5);
    }
    if (def.leaf) {
      g.fillStyle = def.leaf;
      g.fillRect(ox + 2, oy + 3, 1, 1);
      g.fillRect(ox + 10, oy + 6, 1, 1);
      g.fillRect(ox + 6, oy + 9, 1, 1);
      g.fillRect(ox + 12, oy + 12, 1, 1);
    }
    if (def.ash) {
      g.fillStyle = def.ash;
      g.fillRect(ox + 3, oy + 4, 1, 1);
      g.fillRect(ox + 8, oy + 12, 2, 1);
      g.fillRect(ox + 12, oy + 7, 1, 1);
    }
    if (def.bone) {
      g.fillStyle = def.bone;
      g.fillRect(ox + 4, oy + 10, 4, 1);
      g.fillRect(ox + 12, oy + 4, 1, 3);
      g.fillRect(ox + 11, oy + 5, 3, 1);
    }
    if (def.blood) {
      g.fillStyle = def.blood;
      g.fillRect(ox + 4, oy + 8, 5, 2);
      g.fillRect(ox + 8, oy + 10, 3, 1);
      g.fillRect(ox + 12, oy + 11, 1, 1);
    }
    if (def.ember) {
      g.fillStyle = def.ember;
      g.fillRect(ox + 4, oy + 11, 1, 1);
      g.fillRect(ox + 12, oy + 5, 1, 1);
    }
  }

  function drawPlankTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.base || '#4b3320';
    g.fillRect(ox, oy, size, size);
    g.fillStyle = def.shade || '#2b1e13';
    g.fillRect(ox, oy + 5, size, 1);
    g.fillRect(ox, oy + 11, size, 1);
    g.fillRect(ox + 7, oy, 1, 5);
    g.fillRect(ox + 12, oy + 6, 1, 5);
    g.fillRect(ox + 4, oy + 12, 1, 4);
    g.fillStyle = def.edge || '#6c4a2c';
    g.fillRect(ox + 1, oy + 1, size - 2, 1);
    g.strokeStyle = def.mortar || '#1d140d';
    g.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
  }

  function drawWallTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.base || '#303832';
    g.fillRect(ox, oy, size, size);
    g.fillStyle = def.shade || '#202722';
    g.fillRect(ox, oy + 8, size, 8);
    g.fillStyle = def.edge || '#586257';
    g.fillRect(ox + 1, oy + 1, size - 2, 2);
    g.fillRect(ox + 1, oy + 8, size - 2, 1);
    g.strokeStyle = def.mortar || '#151917';
    g.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
    g.beginPath();
    g.moveTo(ox + 7.5, oy);
    g.lineTo(ox + 7.5, oy + 8);
    g.moveTo(ox + 11.5, oy + 8);
    g.lineTo(ox + 11.5, oy + size);
    g.stroke();
    if (def.ember) {
      g.fillStyle = def.ember;
      g.fillRect(ox + 3, oy + 12, 1, 1);
      g.fillRect(ox + 13, oy + 4, 1, 1);
    }
    if (def.ivy) {
      g.fillStyle = def.ivy;
      g.fillRect(ox + 1, oy + 2, 2, 1);
      g.fillRect(ox + 2, oy + 6, 1, 3);
      g.fillRect(ox + 11, oy + 3, 2, 1);
      g.fillRect(ox + 12, oy + 7, 1, 3);
    }
  }

  function drawThresholdTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.base || '#3d4038';
    g.fillRect(ox, oy, size, size);
    g.fillStyle = def.shade || '#292d29';
    g.fillRect(ox, oy + size - 4, size, 4);
    g.fillStyle = def.edge || '#655a45';
    g.fillRect(ox + 1, oy + 2, size - 2, 2);
    g.fillRect(ox + 2, oy + 7, size - 4, 1);
    g.strokeStyle = def.mortar || '#1b1f1d';
    g.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
  }

  function drawPillarTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.26)';
    g.fillRect(ox + 3, oy + 12, 10, 2);
    g.fillStyle = def.shade || '#252b27';
    g.fillRect(ox + 2, oy + 2, 12, 12);
    g.fillStyle = def.base || '#4a4d43';
    g.fillRect(ox + 3, oy + 1, 10, 11);
    g.fillStyle = def.edge || '#727060';
    g.fillRect(ox + 4, oy + 2, 8, 2);
    g.fillRect(ox + 4, oy + 10, 8, 2);
    g.strokeStyle = def.mortar || '#191d1b';
    g.strokeRect(ox + 2.5, oy + 1.5, 11, 12);
  }

  function drawBlockTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(ox + 2, oy + 12, 12, 2);
    g.fillStyle = def.shade || '#222823';
    g.fillRect(ox + 1, oy + 2, 14, 12);
    g.fillStyle = def.base || '#394038';
    g.fillRect(ox + 2, oy + 1, 12, 11);
    g.fillStyle = def.edge || '#626858';
    g.fillRect(ox + 2, oy + 2, 12, 1);
    g.fillRect(ox + 2, oy + 7, 12, 1);
    g.strokeStyle = def.mortar || '#171c1a';
    g.strokeRect(ox + 1.5, oy + 1.5, 13, 12);
    if (def.hiddenMark) {
      g.fillStyle = def.hiddenMark;
      g.fillRect(ox + 7, oy + 4, 2, 1);
      g.fillRect(ox + 8, oy + 5, 1, 3);
    }
  }

  function drawPotTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.fillRect(ox + 4, oy + 13, 8, 2);
    g.fillStyle = def.shade || '#57331f';
    g.fillRect(ox + 5, oy + 5, 7, 8);
    g.fillStyle = def.base || '#9b6744';
    g.fillRect(ox + 6, oy + 4, 5, 9);
    g.fillRect(ox + 5, oy + 6, 7, 5);
    g.fillStyle = def.edge || '#d19a68';
    g.fillRect(ox + 6, oy + 4, 5, 1);
    g.fillRect(ox + 7, oy + 2, 3, 2);
    g.fillStyle = def.mortar || '#25150d';
    g.fillRect(ox + 5, oy + 11, 7, 1);
  }

  function drawBarrelTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.fillRect(ox + 3, oy + 13, 10, 2);
    g.fillStyle = def.shade || '#3d2414';
    g.fillRect(ox + 4, oy + 3, 9, 11);
    g.fillStyle = def.base || '#7a4c27';
    g.fillRect(ox + 5, oy + 2, 7, 11);
    g.fillStyle = def.edge || '#b17a42';
    g.fillRect(ox + 5, oy + 3, 7, 1);
    g.fillRect(ox + 5, oy + 11, 7, 1);
    g.fillStyle = def.band || '#2b2d2c';
    g.fillRect(ox + 4, oy + 5, 9, 1);
    g.fillRect(ox + 4, oy + 10, 9, 1);
  }

  function drawTileCracks(g, ox, oy, def) {
    if (!Array.isArray(def.cracks)) return;
    g.strokeStyle = def.mortar || '#151917';
    g.lineWidth = 1;
    def.cracks.forEach(points => {
      if (!Array.isArray(points) || points.length < 4) return;
      g.beginPath();
      g.moveTo(ox + points[0], oy + points[1]);
      for (let index = 2; index < points.length - 1; index += 2) {
        g.lineTo(ox + points[index], oy + points[index + 1]);
      }
      g.stroke();
    });
  }

  function drawTileChips(g, ox, oy, def) {
    if (!Array.isArray(def.chips)) return;
    g.fillStyle = def.shade || '#252823';
    def.chips.forEach(chip => {
      if (!Array.isArray(chip) || chip.length < 4) return;
      g.fillRect(ox + chip[0], oy + chip[1], chip[2], chip[3]);
    });
  }

  function buildSpriteAtlas() {
    const keys = Object.keys(SPRITE_DEFS);
    const canvasEl = document.createElement('canvas');
    canvasEl.width = SPRITE_SOURCE_SIZE * keys.length;
    canvasEl.height = SPRITE_SOURCE_SIZE;
    const atlasCtx = canvasEl.getContext('2d');
    atlasCtx.imageSmoothingEnabled = false;
    const frames = {};
    keys.forEach((key, index) => {
      const def = SPRITE_DEFS[key];
      const ox = index * SPRITE_SOURCE_SIZE;
      frames[key] = { x: ox, y: 0, w: SPRITE_SOURCE_SIZE, h: SPRITE_SOURCE_SIZE };
      for (let y = 0; y < def.pixels.length; y += 1) {
        const row = def.pixels[y];
        for (let x = 0; x < row.length; x += 1) {
          const pixel = row[x];
          if (pixel === '.') continue;
          for (let oy = -1; oy <= 1; oy += 1) {
            for (let oxi = -1; oxi <= 1; oxi += 1) {
              if (oxi === 0 && oy === 0) continue;
              const nx = x + oxi;
              const ny = y + oy;
              if (nx < 0 || ny < 0 || nx >= row.length || ny >= def.pixels.length) continue;
              if (def.pixels[ny][nx] !== '.') continue;
              atlasCtx.fillStyle = 'rgba(15, 10, 14, 0.92)';
              atlasCtx.fillRect(ox + nx, ny, 1, 1);
            }
          }
        }
      }
      def.pixels.forEach((row, y) => {
        for (let x = 0; x < row.length; x += 1) {
          const pixel = row[x];
          if (pixel === '.') continue;
          atlasCtx.fillStyle = def.palette[pixel] || '#ff00ff';
          atlasCtx.fillRect(ox + x, y, 1, 1);
        }
      });
    });
    return { canvas: canvasEl, frames };
  }

  function getEnemySpriteKey(enemy) {
    if (enemy.type === 'rival') return enemy.rivalKey;
    if (enemy.type === 'mirror_knight') return enemy.spriteKey || getPlayerSpriteKey();
    if (enemy.type === 'machine_gunner') return 'sniper';
    if (enemy.type === 'summoner') return 'cult_mage';
    if (enemy.type === 'shield_unit') return 'golem';
    if (enemy.type === 'healer') return 'cult_follower';
    if (enemy.type === 'boss_spawner') return 'laser';
    return SPRITE_DEFS[enemy.type] ? enemy.type : 'hunter';
  }

  function getPlayerSpriteKey() {
    const key = getCharacterDef().key;
    return SPRITE_DEFS[key] ? key : 'thorn_knight';
  }

  function getFacingDirection(actor, fallbackAngle = 0) {
    if (Math.abs(actor.vx) > 6) return actor.vx < 0 ? -1 : 1;
    return Math.cos(fallbackAngle) < 0 ? -1 : 1;
  }

  function drawSpriteFrame(spriteKey, x, y, size, options = {}) {
    const frame = SPRITE_ATLAS.frames[spriteKey] || SPRITE_ATLAS.frames.hunter;
    if (!frame) return;
    const {
      alpha = 1,
      flipX = false,
      shadowColor = null,
      shadowBlur = 0,
      tint = null,
    } = options;
    ctx.save();
    ctx.translate(x, y);
    if (flipX) ctx.scale(-1, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.3, size * 0.28, size * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    if (shadowColor && shadowBlur > 0) {
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      SPRITE_ATLAS.canvas,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      -size / 2,
      -size / 2,
      size,
      size,
    );
    if (tint) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(-size / 2, -size / 2, size, size);
    }
    ctx.restore();
  }

  function drawSpriteToCanvas(canvasEl, spriteKey, size = canvasEl?.width || 96, options = {}) {
    if (!(canvasEl instanceof HTMLCanvasElement)) return;
    const frame = SPRITE_ATLAS.frames[spriteKey] || SPRITE_ATLAS.frames.hunter;
    if (!frame) return;
    const renderSize = Number.isFinite(size) ? size : (canvasEl.width || 96);
    const c = canvasEl.getContext('2d');
    if (!c) return;
    const {
      tint = null,
      alpha = 1,
    } = options;
    c.clearRect(0, 0, canvasEl.width, canvasEl.height);
    c.imageSmoothingEnabled = false;
    const dx = Math.round((canvasEl.width - renderSize) / 2);
    const dy = Math.round((canvasEl.height - renderSize) / 2);
    c.save();
    c.globalAlpha = alpha;
    c.drawImage(
      SPRITE_ATLAS.canvas,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      dx,
      dy,
      renderSize,
      renderSize,
    );
    if (tint) {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = tint;
      c.globalAlpha = 0.2;
      c.fillRect(dx, dy, renderSize, renderSize);
    }
    c.restore();
  }

  function drawEnemyTelegraphs() {
    enemies.forEach(enemy => {
      if (enemy.windup > 0) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.strokeStyle = (enemy.type === 'charger' || enemy.type === 'golem' || enemy.type === 'bulk_golem') ? '#ff8844' : '#aa66ff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.r + 10 + Math.sin(Date.now() / 120) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (enemy.beamTime > 0) {
        const range = enemy.type === 'god' ? (enemy.beamRange || 620) : 430;
        const beamPath = buildRicochetBeamPath(enemy.x, enemy.y, enemy.beamAngle, range, getEnemyBeamBounceCount(enemy));
        strokeBeamPath(beamPath, {
          color: enemy.type === 'god' ? '#ffffff' : '#aa66ff',
          width: enemy.type === 'god' && enemy.state === 'godSweep' ? 18 : enemy.type === 'god' ? 10 : 7,
          shadowBlur: enemy.type === 'god' && enemy.state === 'godSweep' ? 24 : 14,
        });
      }
    });
  }

  function drawBleedOverlay(enemy, stacks) {
    const stackCount = Math.max(0, Math.round(Number(stacks || 0)));
    if (!stackCount) return;
    const t = Date.now() / 170;
    const flash = clamp(Number(enemy.bleedFlash || 0) * 3, 0, 1);
    const drops = Math.min(8, stackCount + 2);

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.globalAlpha = 0.72 + flash * 0.22;
    ctx.shadowColor = '#b50022';
    ctx.shadowBlur = 8 + stackCount * 1.4 + flash * 10;
    for (let index = 0; index < drops; index += 1) {
      const angle = (index / drops) * Math.PI * 2 + t * (index % 2 ? -0.35 : 0.28);
      const radius = enemy.r * (0.42 + (index % 3) * 0.18);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle * 1.2) * radius * 0.68 + enemy.r * 0.06;
      const size = 2.2 + Math.min(5, stackCount) * 0.22 + (index % 2) * 0.8;
      ctx.fillStyle = BLEED_BLOOD_COLORS[index % BLEED_BLOOD_COLORS.length];
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.7, size * 1.15, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.65;
      ctx.strokeStyle = '#ff2b45';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.r + 9 + flash * 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    const label = `BLEED x${stackCount}`;
    const y = enemy.type === 'rival' ? -enemy.r - 40 : -enemy.r - 32;
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = Math.max(50, ctx.measureText(label).width + 14);
    const height = 15;
    ctx.fillStyle = 'rgba(62, 0, 12, 0.86)';
    ctx.strokeStyle = '#ff4f6d';
    ctx.lineWidth = 1;
    ctx.shadowColor = '#ff2445';
    ctx.shadowBlur = 8 + flash * 8;
    ctx.beginPath();
    ctx.roundRect(-width / 2, y, width, height, 5);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe3e7';
    ctx.fillText(label, 0, y + height / 2 + 0.5);
    ctx.restore();
  }

  function drawStatusBadge(enemy, label, bgColor, borderColor, textColor, yOffset) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = Math.max(50, ctx.measureText(label).width + 14);
    const height = 15;
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(-width / 2, yOffset, width, height, 5);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = textColor;
    ctx.fillText(label, 0, yOffset + height / 2 + 0.5);
    ctx.restore();
  }

  function drawSpawnPortal(enemy) {
    const SPAWN_DURATION = 0.72;
    const t = clamp(1 - enemy.spawnT / SPAWN_DURATION, 0, 1);
    const emerge = clamp((t - 0.35) / 0.65, 0, 1);
    const portalEase = 1 - (1 - Math.min(t * 1.8, 1)) ** 3;
    const now = Date.now();
    const r = enemy.r;
    const isBoss = BOSS_TYPES.has(enemy.type);
    const isElite = !!enemy.elite;
    const portalColor = isBoss ? '#ffd060' : isElite ? '#e8b030' : '#8855ff';
    const innerColor = isBoss ? '#fff4c0' : isElite ? '#ffe080' : '#cc88ff';
    const portalR = r * (1.8 + portalEase * 0.6);

    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    // Ground shadow pool
    ctx.globalAlpha = 0.45 * portalEase;
    ctx.fillStyle = isBoss ? 'rgba(120,80,0,0.6)' : 'rgba(40,0,80,0.6)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.3, portalR * 0.85, portalR * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Outer spinning ring
    ctx.globalAlpha = 0.9 * portalEase;
    ctx.shadowColor = portalColor;
    ctx.shadowBlur = 18 + portalEase * 14;
    for (let ring = 0; ring < 2; ring += 1) {
      const ringR = portalR * (0.78 + ring * 0.22);
      const spin = now / (ring === 0 ? 320 : -480);
      const segments = 8 + ring * 4;
      ctx.strokeStyle = ring === 0 ? portalColor : innerColor;
      ctx.lineWidth = 2.5 - ring * 0.8;
      ctx.beginPath();
      for (let seg = 0; seg < segments; seg += 1) {
        const a0 = (seg / segments) * Math.PI * 2 + spin;
        const a1 = ((seg + 0.6) / segments) * Math.PI * 2 + spin;
        ctx.moveTo(Math.cos(a0) * ringR, Math.sin(a0) * ringR * 0.38);
        ctx.lineTo(Math.cos(a1) * ringR, Math.sin(a1) * ringR * 0.38);
      }
      ctx.stroke();
    }

    // Portal interior glow
    ctx.globalAlpha = 0.55 * portalEase;
    ctx.shadowBlur = 0;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, portalR * 0.7);
    grad.addColorStop(0, isBoss ? 'rgba(255,230,120,0.9)' : 'rgba(180,100,255,0.9)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, portalR * 0.7, portalR * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inward particle streaks
    ctx.globalAlpha = 0.7 * portalEase;
    ctx.strokeStyle = innerColor;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = innerColor;
    ctx.shadowBlur = 8;
    const streakCount = isBoss ? 10 : 6;
    for (let s = 0; s < streakCount; s += 1) {
      const angle = (s / streakCount) * Math.PI * 2 + now / 600;
      const outerR = portalR * (0.9 + Math.sin(now / 200 + s) * 0.1);
      const innerR = portalR * 0.25;
      ctx.globalAlpha = (0.3 + 0.4 * Math.abs(Math.sin(now / 300 + s * 1.3))) * portalEase;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR * 0.38);
      ctx.lineTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR * 0.38);
      ctx.stroke();
    }

    ctx.restore();

    // Enemy emerges from center — draw sprite squashed vertically
    if (emerge > 0) {
      const spriteKey = getEnemySpriteKey(enemy);
      const facing = getFacingDirection(enemy, 0);
      const drawSize = Math.max(30, r * 2.4);
      const squash = 0.28 + emerge * 0.72;
      const alpha = clamp(emerge * 1.8, 0, 1);
      const frame = SPRITE_ATLAS.frames[spriteKey] || SPRITE_ATLAS.frames.hunter;
      if (frame) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        if (facing < 0) ctx.scale(-1, 1);
        ctx.scale(1, squash);
        ctx.globalAlpha = alpha;
        ctx.shadowColor = portalColor;
        ctx.shadowBlur = 12 + (1 - emerge) * 18;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          SPRITE_ATLAS.canvas,
          frame.x, frame.y, frame.w, frame.h,
          -drawSize / 2, -drawSize / 2, drawSize, drawSize,
        );
        if (isElite) {
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(255,210,96,0.7)';
          ctx.globalAlpha = 0.22;
          ctx.fillRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize);
        }
        ctx.restore();
      }
    }
  }

  function drawEnemies() {
    enemies.forEach(enemy => {
      if (!enemy) return;
      if (enemy.spawnT > 0) { drawSpawnPortal(enemy); return; }
      const drawY = enemy.y - Math.max(0, Number(enemy.jumpZ || 0));
      const bleedStacks = getStatusStacks(enemy, 'bleed');
      const activeStatuses = STATUS_KEYS.filter(key => getStatusStacks(enemy, key) > 0);
      activeStatuses.forEach((key, index) => {
        const style = STATUS_STYLES[key];
        ctx.save();
        ctx.translate(enemy.x, drawY);
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = style.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.r + 6 + index * 4 + Math.sin(Date.now() / (180 + index * 40)) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
      const spriteKey = getEnemySpriteKey(enemy);
      const facing = getFacingDirection(enemy, enemy.beamAngle || enemy.dashAngle || 0);
      const drawSize = Math.max(30, enemy.r * 2.4);
      drawSpriteFrame(spriteKey, enemy.x, drawY, drawSize, {
        alpha: enemy.stun > 0 ? 0.68 : 1,
        flipX: facing < 0,
        shadowColor: enemy.elite || enemy.type === 'god' ? 'rgba(255,244,180,0.45)' : 'rgba(0,0,0,0.18)',
        shadowBlur: enemy.type === 'god' ? 14 : enemy.elite ? 10 : 4,
        tint: enemy.elite ? 'rgba(255,210,96,0.7)' : null,
      });
      if (bleedStacks > 0) drawBleedOverlay(enemy, bleedStacks);
      const badgeBaseY = enemy.type === 'rival' ? -enemy.r - 40 : -enemy.r - 32;
      let badgeOffset = bleedStacks > 0 ? 18 : 0;
      const fireStacks = getStatusStacks(enemy, 'fire');
      if (fireStacks > 0) {
        drawStatusBadge(enemy, `FIRE x${fireStacks}`, 'rgba(62,22,0,0.86)', STATUS_STYLES.fire.color, '#ffe5c0', badgeBaseY + badgeOffset);
        badgeOffset += 18;
      }
      const poisonStacks = getStatusStacks(enemy, 'poison');
      if (poisonStacks > 0) {
        drawStatusBadge(enemy, `POISON x${poisonStacks}`, 'rgba(10,38,0,0.86)', STATUS_STYLES.poison.color, '#d8ffc0', badgeBaseY + badgeOffset);
        badgeOffset += 18;
      }
      const darkStacks = getStatusStacks(enemy, 'dark_drain');
      if (darkStacks > 0) {
        drawStatusBadge(enemy, `DRAIN x${darkStacks}`, 'rgba(20,8,48,0.86)', STATUS_STYLES.dark_drain.color, '#e8d8ff', badgeBaseY + badgeOffset);
      }
      if (enemy.elite) {
        ctx.save();
        ctx.translate(enemy.x, drawY - enemy.r - 10);
        ctx.fillStyle = '#f6cf6a';
        ctx.beginPath();
        ctx.moveTo(-7, 4);
        ctx.lineTo(-4, -5);
        ctx.lineTo(0, 0);
        ctx.lineTo(4, -6);
        ctx.lineTo(7, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(enemy.x, drawY);
      const hpPct = clamp(enemy.hp / enemy.max, 0, 1);

      // Name tag + level
      const _enemyLabel = (enemy.type === 'rival' && enemy.rivalData)
        ? enemy.rivalData.name
        : getEliteEnemyLabel(enemy);
      const _levelStr = `Lv.${floor}`;
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillStyle = enemy.elite ? '#f6cf6a' : isBossType(enemy.type) ? '#f2e8d7'
        : (enemy.type === 'rival' && enemy.rivalData) ? enemy.rivalData.color : '#b8cfe0';
      ctx.fillText(`${_enemyLabel}  ${_levelStr}`, 0, -enemy.r - 19);

      // HP bar
      ctx.fillStyle = '#000a';
      ctx.fillRect(-18, -enemy.r - 13, 36, 5);
      ctx.fillStyle = enemy.type === 'rival' ? (enemy.rivalData?.color || '#b24f68') : isBossType(enemy.type) ? '#f2e8d7' : '#b24f68';
      ctx.fillRect(-18, -enemy.r - 13, 36 * hpPct, 5);

      // HP current / max text
      ctx.font = '8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#dce7f2';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 3;
      ctx.fillText(`${Math.ceil(enemy.hp)} / ${enemy.max}`, 0, -enemy.r - 5);

      if ((enemy.barrier || 0) > 0) {
        const barrierPct = clamp(enemy.barrier / Math.max(1, enemy.max * 0.22), 0, 1);
        ctx.fillStyle = 'rgba(80, 215, 255, 0.24)';
        ctx.fillRect(-18, -enemy.r - 20, 36, 4);
        ctx.fillStyle = '#7ed6ff';
        ctx.fillRect(-18, -enemy.r - 20, 36 * barrierPct, 4);
      }
      if (enemy.type === 'boss_spawner') {
        ctx.fillStyle = '#ffb07b';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.max(0, Math.ceil(enemy.bossSpawnTimer))}`, 0, -enemy.r - 30);
      }
      ctx.restore();
    });
  }

  function drawPlayerCorpseAnim(anim) {
    const t = clamp(anim.timer / anim.duration, 0, 1);
    const fallEase = 1 - (1 - Math.min(t * 1.6, 1)) ** 3;
    const size = Math.max(34, anim.r * 2.5);
    const frame = SPRITE_ATLAS.frames[anim.spriteKey] || SPRITE_ATLAS.frames.thorn_knight;
    if (!frame) return;

    const fallAngle = (anim.facing < 0 ? -1 : 1) * (Math.PI / 2) * fallEase;
    const squash = 1 - 0.46 * fallEase;

    ctx.save();
    ctx.translate(anim.x, anim.y);

    const poolAlpha = clamp((t - 0.3) / 0.4, 0, 1);
    if (poolAlpha > 0) {
      ctx.fillStyle = `rgba(94,0,16,${0.45 * poolAlpha})`;
      ctx.beginPath();
      ctx.ellipse(0, size * 0.28, size * (0.32 + poolAlpha * 0.12), size * (0.08 + poolAlpha * 0.04), fallAngle * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.rotate(fallAngle);
    if (anim.facing < 0) ctx.scale(-1, 1);
    ctx.scale(1 + 0.05 * fallEase, squash);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.shadowColor = 'rgba(180,0,0,0.55)';
    ctx.shadowBlur = 14 + fallEase * 10;
    ctx.drawImage(
      SPRITE_ATLAS.canvas,
      frame.x, frame.y, frame.w, frame.h,
      -size / 2, -size / 2, size, size,
    );
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(48,12,18,${0.15 + fallEase * 0.45})`;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawDeathOverlay(anim) {
    const t = clamp(anim.timer / anim.duration, 0, 1);
    const fadeIn = clamp(t * 2, 0, 1);
    const vignetteAlpha = clamp(t * 0.85, 0, 0.82);
    const w = canvas.width;
    const h = canvas.height;

    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, h * 0.72);
    grad.addColorStop(0, `rgba(0,0,0,0)`);
    grad.addColorStop(1, `rgba(12,0,0,${vignetteAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const edgeAlpha = clamp(t * 0.7, 0, 0.62);
    const edgeSize = Math.min(w, h) * 0.28;
    ctx.fillStyle = `rgba(140,0,0,${edgeAlpha})`;
    ctx.fillRect(0, 0, w, edgeSize * 0.35);
    ctx.fillRect(0, h - edgeSize * 0.35, w, edgeSize * 0.35);
    ctx.fillRect(0, 0, edgeSize * 0.28, h);
    ctx.fillRect(w - edgeSize * 0.28, 0, edgeSize * 0.28, h);

    if (t > 0.55) {
      const textAlpha = clamp((t - 0.55) / 0.35, 0, 1);
      ctx.save();
      ctx.globalAlpha = textAlpha;
      ctx.font = `bold ${Math.round(h * 0.072)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff0020';
      ctx.shadowBlur = 32;
      ctx.fillStyle = '#fff0f0';
      ctx.fillText('YOU DIED', w / 2, h * 0.42);
      ctx.font = `${Math.round(h * 0.028)}px system-ui`;
      ctx.shadowBlur = 12;
      ctx.fillStyle = `rgba(255,200,200,${textAlpha * 0.85})`;
      ctx.fillText('Loading results...', w / 2, h * 0.42 + h * 0.072 * 0.9);
      ctx.restore();
    }

    void fadeIn;
  }

  function drawPlayer() {
    if (!player) return;
    const aimAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const facing = getFacingDirection(player, aimAngle);
    const shadowColor = godTimer > 0 ? 'rgba(255,248,210,0.65)' : 'rgba(0,0,0,0.25)';
    STATUS_KEYS.filter(key => getStatusStacks(player, key) > 0).forEach((key, index) => {
      const style = STATUS_STYLES[key];
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = style.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, player.r + 6 + index * 4 + Math.sin(Date.now() / (160 + index * 40)) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
    drawSpriteFrame(getPlayerSpriteKey(), player.x, player.y, Math.max(34, player.r * 2.5), {
      alpha: player.inv > 0 ? 0.68 : 1,
      flipX: facing < 0,
      shadowColor,
      shadowBlur: godTimer > 0 ? 18 : 6,
      tint: godTimer > 0 ? 'rgba(255,245,220,0.6)' : null,
    });
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.strokeStyle = '#f5f1e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(aimAngle) * 6, Math.sin(aimAngle) * 6);
    ctx.lineTo(Math.cos(aimAngle) * 20, Math.sin(aimAngle) * 20);
    ctx.stroke();
    const equippedWeapon = getEquippedWeapon();
    const extendingStaffEquipped = equippedWeapon === 'extending_staff';
    if (extendingStaffEquipped) {
      const previewRange = 130;
      const previewArc = 1.45;
      const previewX = Math.cos(aimAngle) * previewRange;
      const previewY = Math.sin(aimAngle) * previewRange;
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = '#d8f1ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(aimAngle) * 18, Math.sin(aimAngle) * 18);
      ctx.lineTo(previewX, previewY);
      ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(0, 0, previewRange, aimAngle - previewArc, aimAngle + previewArc);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#f3fbff';
      ctx.beginPath();
      ctx.arc(previewX, previewY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (player.swing > 0) {
      const swingRange = extendingStaffEquipped ? 130 : 55;
      const swingArc = extendingStaffEquipped ? 1.45 : ATTACKS.melee.arc;
      const swingTotal = ATTACKS.melee.active;
      const swingProgress = 1 - (player.swing / swingTotal);
      // Sweep right-to-left: arc starts at swingA+arc and sweeps to swingA-arc
      const sweepStart = player.swingA + swingArc;
      const sweepEnd = player.swingA - swingArc;
      const currentTip = sweepStart + (sweepEnd - sweepStart) * swingProgress;
      const trailLength = swingArc * 0.55;
      const trailStart = currentTip + trailLength;
      const fadeAlpha = 0.9 * (player.swing / swingTotal);
      const slashColor = extendingStaffEquipped ? '#eaf4ff' : godTimer > 0 ? '#f6e8c8' : '#d86d87';
      // Glow outer trail
      ctx.globalAlpha = fadeAlpha * 0.35;
      ctx.strokeStyle = slashColor;
      ctx.lineWidth = extendingStaffEquipped ? 14 : 10;
      ctx.shadowColor = slashColor;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, swingRange, trailStart, currentTip, true);
      ctx.stroke();
      // Main sharp edge
      ctx.globalAlpha = fadeAlpha;
      ctx.strokeStyle = slashColor;
      ctx.lineWidth = extendingStaffEquipped ? 5 : 3;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, swingRange, trailStart, currentTip, true);
      ctx.stroke();
      // Bright tip streak
      ctx.globalAlpha = fadeAlpha * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = extendingStaffEquipped ? 2 : 1.5;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(0, 0, swingRange, currentTip + 0.12, currentTip, true);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (extendingStaffEquipped) {
        ctx.globalAlpha = 0.12 * fadeAlpha;
        ctx.fillStyle = '#eaf4ff';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, swingRange, trailStart, currentTip, true);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPlayerLaser() {
    if (!laserActive || !player) return;
    const angle = laserMode === 'god_sweep'
      ? laserAngle
      : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const turtleWaveActive = laserMode === 'turtle_wave';
    const loveBeamActive = loveBeamCasting;
    const beamRange = getPlayerBeamRange(laserMode, getEquippedMove('laser'));
    const beamPath = buildRicochetBeamPath(player.x, player.y, angle, beamRange, getPlayerBeamBounceCount(laserMode));
    if (!beamPath.length) return;
    const beamColor = turtleWaveActive ? '#74f5ff' : loveBeamActive ? '#ff9ed6' : laserMode === 'god_sweep' ? '#ffffff' : '#ff00aa';
    const beamGlow = turtleWaveActive ? '#9bf7ff' : loveBeamActive ? '#ffd1ea' : laserMode === 'god_sweep' ? '#e8f0ff' : '#f0f';
    const maxW = laserMode === 'god_sweep' ? 16 : turtleWaveActive ? 18 : loveBeamActive ? 10 : 8;

    drawTaperedBeamPath(beamPath, {
      color: beamColor,
      glow: beamGlow,
      maxWidth: maxW,
      shadowBlur: laserMode === 'god_sweep' ? 26 : turtleWaveActive ? 30 : loveBeamActive ? 22 : 18,
    });

    // Beam particles: small dots that drift perpendicular and fade toward tip
    if (rng() < 0.55) {
      const sample = sampleBeamPath(beamPath, rng());
      if (sample) {
        const taper = 1 - sample.t * sample.t;
        const spread = maxW * taper * 0.7;
        const px = sample.x + sample.nx * (rng() - 0.5) * spread * 2;
        const py = sample.y + sample.ny * (rng() - 0.5) * spread * 2;
        const perpSpeed = (rng() - 0.5) * 28;
        const forwardSpeed = -rng() * 18;
        particles.push({
          x: px, y: py,
          life: 0.18 + rng() * 0.12,
          vx: sample.nx * perpSpeed + sample.dx * forwardSpeed,
          vy: sample.ny * perpSpeed + sample.dy * forwardSpeed,
          c: beamColor,
        });
      }
    }
    // Tip burst particles at beam end
    if (rng() < 0.4) {
      const end = getBeamPathEnd(beamPath);
      const tipPx = end.x + (rng() - 0.5) * 6;
      const tipPy = end.y + (rng() - 0.5) * 6;
      particles.push({
        x: tipPx, y: tipPy,
        life: 0.12 + rng() * 0.1,
        vx: (rng() - 0.5) * 40,
        vy: (rng() - 0.5) * 40,
        c: beamColor,
      });
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    particles.forEach(particle => {
      if (particle.line) {
        const line = particle.line;
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const segs = Math.max(4, line.seg || 6);
        const jitter = (line.jag || 12) * (0.65 + particle.life * 0.55);

        ctx.save();
        ctx.globalAlpha = Math.min(1, particle.life * 2.1);
        ctx.strokeStyle = particle.c || '#dfe8ff';
        ctx.lineWidth = (line.w || 4.5) + 3;
        ctx.shadowColor = particle.c || '#dfe8ff';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        for (let index = 1; index < segs; index += 1) {
          const t = index / segs;
          const wave = Math.sin((t * 18) + (line.phase || 0) + particle.life * 22 + index * 0.9);
          const off = wave * jitter * (index % 2 === 0 ? 1 : -1);
          const px = line.x1 + dx * t + nx * off;
          const py = line.y1 + dy * t + ny * off;
          ctx.lineTo(px, py);
        }
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();

        ctx.lineWidth = Math.max(2, (line.w || 4.5) * 0.5);
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        for (let index = 1; index < segs; index += 1) {
          const t = index / segs;
          const wave = Math.sin((t * 18) + (line.phase || 0) + particle.life * 22 + index * 0.9);
          const off = wave * jitter * 0.35 * (index % 2 === 0 ? 1 : -1);
          const px = line.x1 + dx * t + nx * off;
          const py = line.y1 + dy * t + ny * off;
          ctx.lineTo(px, py);
        }
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.globalAlpha = Math.min(1, particle.life * 1.5);
      ctx.translate(particle.x, particle.y);
      if (particle.text) {
        ctx.fillStyle = particle.c || '#fff';
        ctx.font = `bold ${particle.size || 14}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = particle.c;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 3;
        ctx.strokeStyle = particle.outline || 'rgba(0,0,0,0.7)';
        ctx.strokeText(particle.text, 0, -particle.life * 20);
        ctx.fillText(particle.text, 0, -particle.life * 20);
      } else if (particle.shockwave) {
        const maxLife = Number(particle.maxLife || AOE_SHOCKWAVE_LIFE);
        const progress = clamp(1 - particle.life / maxLife, 0, 1);
        const radius = Number(particle.radius || 48);
        const waveRadius = radius * (0.22 + progress * 0.92);
        ctx.globalAlpha = (1 - progress) * 0.8;
        ctx.strokeStyle = particle.c || '#ff66cc';
        ctx.shadowColor = particle.c || '#ff66cc';
        ctx.shadowBlur = 18;
        ctx.lineWidth = particle.style === 'heavy' ? 5 : 3;
        ctx.beginPath();
        if (particle.style === 'heavy') {
          for (let index = 0; index <= 28; index += 1) {
            const angle = (index / 28) * Math.PI * 2;
            const jag = 1 + Math.sin(index * 2.1 + progress * 12) * 0.055;
            const x = Math.cos(angle) * waveRadius * jag;
            const y = Math.sin(angle) * waveRadius * jag;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
        } else {
          ctx.arc(0, 0, waveRadius, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.globalAlpha = (1 - progress) * 0.16;
        ctx.fillStyle = particle.c || '#ff66cc';
        ctx.beginPath();
        ctx.arc(0, 0, radius * (0.3 + progress * 0.45), 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.impact) {
        const maxLife = Number(particle.maxLife || 0.24);
        const progress = clamp(1 - particle.life / maxLife, 0, 1);
        const size = Number(particle.size || 6) * (1 + progress * 1.4);
        ctx.rotate(Number(particle.angle || 0));
        ctx.globalAlpha = (1 - progress) * 0.85;
        ctx.strokeStyle = particle.c || '#fff';
        ctx.shadowColor = particle.c || '#fff';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;
        for (let index = 0; index < 4; index += 1) {
          const a = (index - 1.5) * 0.5;
          ctx.beginPath();
          ctx.moveTo(-size * 0.25, Math.sin(a) * size * 0.3);
          ctx.lineTo(size * (0.75 + index * 0.12), Math.sin(a) * size);
          ctx.stroke();
        }
        ctx.fillStyle = particle.c || '#fff';
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.spark) {
        const size = Number(particle.size || 2.2);
        const angle = Math.atan2(Number(particle.vy || 0), Number(particle.vx || 1));
        ctx.rotate(angle);
        ctx.fillStyle = particle.c || '#fff';
        ctx.shadowColor = particle.c || '#fff';
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 1.8, size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.ring) {
        ctx.strokeStyle = particle.c;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, particle.ring, 0, Math.PI * 2);
        ctx.stroke();
      } else if (particle.blood) {
        const size = particle.size || 3;
        const tilt = Math.atan2(Number(particle.vy || 0), Number(particle.vx || 1)) + Math.PI / 2;
        ctx.fillStyle = particle.c || '#a5001e';
        ctx.shadowColor = particle.c || '#a5001e';
        ctx.shadowBlur = 5;
        ctx.rotate(tilt);
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.72, size * 1.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha *= 0.5;
        ctx.beginPath();
        ctx.arc(0, size * 0.9, size * 0.34, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = particle.c || '#0ff';
        ctx.shadowColor = particle.c || '#0ff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawMinimap() {
    const size = 14;
    const gap = 2;
    const gridSize = 9;
    const mapWidth = gridSize * size + (gridSize - 1) * gap;
    const visibleRooms = rooms.filter(r => !r.secret);
    const maxGy = visibleRooms.reduce((m, r) => Math.max(m, r.gy), 0);
    const mapHeight = (maxGy + 1) * size + maxGy * gap;
    const originX = canvas.width - mapWidth - 2;
    const originY = -10;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#2a2e38';
    ctx.beginPath();
    ctx.roundRect(originX, originY, mapWidth, mapHeight, 6);
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#5a6070';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    rooms.forEach(room => {
      if (room.secret) return;
      const x = originX + room.gx * (size + gap);
      const y = originY + room.gy * (size + gap);
      if (room.type === 'ladder' && !room.explored) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#fff04a';
      } else if (!room.explored) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#001018';
      } else if (room.type === 'ladder') {
        ctx.globalAlpha = 1;
        ctx.fillStyle = room === currentRoom ? '#ffff00' : '#fff04a';
      } else if (room === currentRoom) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#00ffff';
      } else if (room.type === 'god') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffffff';
      } else if (room.type === 'challenge') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#d7f6ff';
      } else if (room.type === 'boss') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ff7a7a';
      } else if (room.type === 'treasure') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffaa00';
      } else if (room.type === 'shop') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#7ec8ff';
      } else if (room.type === 'anvil') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffb840';
      } else if (room.type === 'start') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#00ff88';
      } else {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#0a3344';
      }
      ctx.fillRect(x, y, size, size);
      if (room.type === 'ladder') {
        ctx.globalAlpha = room.explored ? 1 : 0.7;
        ctx.fillStyle = '#fff700';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', x + size / 2, y + size / 2);
      } else if (room.type === 'challenge') {
        ctx.globalAlpha = room.explored ? 1 : 0.72;
        ctx.fillStyle = '#071116';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('T', x + size / 2, y + size / 2);
      } else if (room.type === 'shop') {
        ctx.globalAlpha = room.explored ? 1 : 0.72;
        ctx.fillStyle = '#071116';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', x + size / 2, y + size / 2);
      } else if (room.type === 'anvil') {
        ctx.globalAlpha = room.explored ? 1 : 0.72;
        ctx.fillStyle = '#1a0800';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚒', x + size / 2, y + size / 2);
      }
      if (room.visited) {
        ctx.strokeStyle = 'rgba(0,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      }
      if (room.secret) return;
      ctx.fillStyle = 'rgba(0,255,255,0.75)';
      if (room.doors.n) ctx.fillRect(x + size / 2 - 1, y - 2, 2, 2);
      if (room.doors.s) ctx.fillRect(x + size / 2 - 1, y + size, 2, 2);
      if (room.doors.w) ctx.fillRect(x - 2, y + size / 2 - 1, 2, 2);
      if (room.doors.e) ctx.fillRect(x + size, y + size / 2 - 1, 2, 2);
    });
    if (hasLegacy('elite_tracker')) {
      enemies.forEach(enemy => {
        if (!enemy.elite) return;
        const eRoom = rooms.find(r => r.gx === enemy.homeGx && r.gy === enemy.homeGy);
        if (!eRoom || eRoom.secret || eRoom === currentRoom) return;
        const rx = originX + eRoom.gx * (size + gap);
        const ry = originY + eRoom.gy * (size + gap);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(rx + size - 4, ry, 4, 4);
      });
    }
    ctx.restore();
  }

  function drawGodModeBar() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(300, 12, 360, 6);
    ctx.fillStyle = `hsl(${(Date.now() / 10) % 360},100%,60%)`;
    ctx.fillRect(300, 12, 360 * (godTimer / 12), 6);
    ctx.fillStyle = '#fff';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('GOD MODE', 480, 10);
  }

  function getBossLabel(type) {
    if (type === 'queen_cult') return 'QUEEN OF THE CULT';
    if (type === 'bulk_golem') return 'BULK GOLEM';
    if (type === 'artificer_knave') return 'ARTIFICER CHARGED KNAVE';
    if (type === 'god') return 'GOD';
    return type.toUpperCase();
  }

  function drawBossHealthBars() {
    const bosses = enemies.filter(enemy => isBossType(enemy.type));
    if (!bosses.length) return;

    const width = 420;
    const height = 10;
    const gap = 18;
    const startX = (canvas.width - width) / 2;
    const startY = 76;

    bosses.forEach((boss, index) => {
      const y = startY + index * gap;
      const hpPct = clamp(boss.hp / boss.max, 0, 1);

      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(startX - 2, y - 2, width + 4, height + 4);
      ctx.fillStyle = '#220f28';
      ctx.fillRect(startX, y, width, height);

      ctx.fillStyle = boss.type === 'bulk_golem' ? '#ff8e4a' : boss.type === 'artificer_knave' ? '#ffd27d' : '#e4b9ff';
      if (boss.type === 'god') ctx.fillStyle = '#ffffff';
      ctx.fillRect(startX, y, width * hpPct, height);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(getBossLabel(boss.type), canvas.width / 2, y - 4);
    });
  }

  function drawFloorTransition() {
    if (!showFloorTransition || floorTransitionTime > 2.5) return;

    const progress = floorTransitionTime / 2.5;
    const scaleProgress = Math.min(progress * 1.5, 1);
    const fadeInProgress = Math.min(progress * 2, 1);
    const fadeOutProgress = Math.max((progress - 0.7) / 0.3, 0);

    const baseScale = 0.3 + scaleProgress * 0.7;
    const alpha = fadeInProgress * (1 - fadeOutProgress);

    ctx.save();
    ctx.globalAlpha = alpha;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const offsetY = (1 - scaleProgress) * 80;

    ctx.translate(centerX, centerY - offsetY);
    ctx.scale(baseScale, baseScale);
    ctx.translate(-centerX, -centerY);

    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 40 * alpha;
    ctx.font = 'bold 72px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(`FLOOR ${floor}`, centerX, centerY);

    ctx.font = 'bold 24px system-ui';
    ctx.fillStyle = '#7dff9e';
    ctx.shadowColor = '#7dff9e';
    ctx.shadowBlur = 20 * alpha;
    ctx.fillText('▼ ▼ ▼', centerX, centerY + 50);

    ctx.restore();
  }

  function drawActionIcons() {
    const mobilityMove = getEquippedMove('dash');
    const mobilityIcon = mobilityMove === 'dash'
      ? {
        color: '#fff06a',
        pixels: [
          [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4],
          [4, 2], [5, 2], [6, 2], [6, 1], [7, 2], [6, 3],
        ],
      }
      : mobilityMove === 'warp'
      ? {
        color: '#c8a6ff',
        pixels: [
          [3, 1], [4, 1], [2, 2], [5, 2], [1, 3], [3, 3], [4, 3], [6, 3],
          [1, 4], [6, 4], [2, 5], [5, 5], [3, 6], [4, 6],
        ],
      }
      : mobilityMove === 'nimrod_stomp'
        ? {
          color: '#ffe67a',
          pixels: [
            [3, 1], [4, 1], [3, 2], [4, 2], [2, 3], [5, 3], [2, 4], [3, 4], [4, 4], [5, 4],
            [1, 5], [2, 5], [5, 5], [6, 5], [2, 6], [5, 6],
          ],
        }
      : mobilityMove === 'zip_lightning'
        ? {
          color: '#8dd6ff',
          pixels: [
            [1, 2], [2, 2], [3, 2], [2, 3], [3, 4], [4, 4], [5, 4], [4, 5], [5, 6], [6, 6],
            [6, 2], [7, 2], [6, 3],
          ],
        }
        : mobilityMove === 'cowards_way'
          ? {
            color: '#8fffca',
            pixels: [
              [3, 1], [4, 1], [2, 2], [5, 2], [1, 3], [6, 3], [1, 4], [6, 4],
              [2, 5], [5, 5], [3, 6], [4, 6], [3, 3], [4, 3], [3, 4], [4, 4],
            ],
          }
          : {
            color: '#8fffca',
            pixels: [
              [3, 1], [4, 1], [2, 2], [5, 2], [1, 3], [6, 3], [1, 4], [6, 4],
              [2, 5], [5, 5], [3, 6], [4, 6], [3, 3], [4, 3], [3, 4], [4, 4],
            ],
          };

    drawPixelIcon(ui.coinIcon, '#ffd15a', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
      [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
    ]);
    drawPixelIcon(ui.metaCoinIcon, '#ffd15a', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
      [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
    ]);
    drawPixelIcon(ui.metaLoopIcon, '#83f3ff', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [5, 2],
      [1, 3], [5, 3],
      [1, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
      [2, 2], [4, 2], [2, 4], [4, 4],
      [3, 3],
    ]);
    drawPixelIcon(ui.icons.dash, mobilityIcon.color, mobilityIcon.pixels);
    drawPixelIcon(ui.icons.melee, '#00ffff', [
      [2, 6], [3, 5], [4, 4], [5, 3], [6, 2], [5, 4], [6, 3], [7, 2], [6, 5], [7, 4],
    ]);
    drawPixelIcon(ui.icons.laser, '#7a9fc4', [
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [5, 3], [6, 2], [7, 1],
    ]);
    drawPixelIcon(ui.icons.smash, '#ffaa00', [
      [4, 1], [3, 2], [4, 2], [5, 2], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3],
      [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [3, 5], [4, 5], [5, 5], [4, 6],
    ]);
  }

  function drawPixelIcon(canvasEl, color, pixels) {
    const iconCtx = canvasEl.getContext('2d');
    iconCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    iconCtx.imageSmoothingEnabled = false;
    iconCtx.fillStyle = 'rgba(255,255,255,0.08)';
    iconCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    iconCtx.fillStyle = color;
    pixels.forEach(([px, py]) => {
      iconCtx.fillRect(px * 4, py * 4, 4, 4);
    });
  }

  function createUIController(view) {
    const UIManagerCtor = window.KozEngine?.UI?.uiManager?.UIManager || window.UIManager || null;
    const manager = typeof UIManagerCtor === 'function' ? new UIManagerCtor({ autoRuntimeInit: false }) : null;
    const DialogueManagerCtor = KozDialogueApi.TypewriterDialogueManager || window.TypewriterDialogueManager || null;
    const WorldSpeechBubbleCtor = KozWorldSpeechApi.WorldSpeechBubbleManager || window.WorldSpeechBubbleManager || null;
    const dialogueRuntime = typeof DialogueManagerCtor === 'function'
      ? new DialogueManagerCtor({
        gameStateManager,
        defaultSpeaker: 'GOD',
        typeSpeed: 0.028,
        autoAdvanceDelay: 1.35,
        onOpen: clearGameplayInput,
        onClose: clearGameplayInput,
      })
      : null;
    const worldSpeechRuntime = typeof WorldSpeechBubbleCtor === 'function'
      ? new WorldSpeechBubbleCtor({ typeSpeed: 0.024, holdTime: 1.55, maxBubbles: 8 })
      : null;
    let menuBound = false;
    let restartBound = false;
    let activeState = 'menu';
    let hudUpdateHook = null;
    let challengePanelOpen = false;
    let runHistoryOpen = false;
    let runHistoryPage = 0;
    let runHistoryEntries = [];
    let selectedRunHistoryId = '';
    let activeRunHistoryTab = 'stats';
    const runHistoryPageSize = 8;

    function makeContainer(element, visibleDisplay = '') {
      return {
        show() {
          if (!element) return;
          element.classList.remove('hidden');
          element.style.display = visibleDisplay;
        },
        hide() {
          if (!element) return;
          element.classList.add('hidden');
          element.style.display = 'none';
        },
      };
    }

    function setSkillCard(name, current, max, active = false, charges = 0, maxCharges = 1) {
      const fill = name === 'melee' ? view.fillMelee
        : name === 'laser' ? view.fillLaser
          : name === 'smash' ? view.fillSmash
            : view.fillDash;
      const time = name === 'melee' ? view.timeMelee
        : name === 'laser' ? view.timeLaser
          : name === 'smash' ? view.timeSmash
            : view.timeDash;
      const card = view.actionCards[name];
      const ready = charges > 0 && !active;
      const partialCharge = charges < maxCharges && max > 0 ? clamp(1 - (current / max), 0, 1) : 0;
      const ratio = maxCharges <= 0 ? 0 : clamp((charges + partialCharge) / maxCharges, 0, 1);
      if (fill) fill.style.height = `${ratio * 100}%`;
      if (time) {
        time.textContent = active
          ? 'CAST'
          : maxCharges > 1 && charges > 0
            ? `${charges}/${maxCharges}`
            : ready
              ? 'READY'
              : current.toFixed(1);
      }
      if (card) card.classList.toggle('ready', ready);
    }

    function renderDialogue() {
      if (!view.dialogueOverlay || !view.dialogueSpeaker || !view.dialogueText) return;
      const snapshot = dialogueRuntime?.getSnapshot?.() || { active: false, speaker: 'GOD', visibleText: '', isFullyTyped: false };
      view.dialogueOverlay.classList.toggle('hidden', !snapshot.active);
      view.dialogueOverlay.style.display = snapshot.active ? 'flex' : 'none';
      view.dialogueOverlay.setAttribute('aria-hidden', snapshot.active ? 'false' : 'true');
      if (!snapshot.active) return;
      view.dialogueSpeaker.textContent = snapshot.speaker || 'GOD';
      view.dialogueText.textContent = snapshot.visibleText || '';
      if (view.dialogueHint) {
        view.dialogueHint.textContent = snapshot.isFullyTyped ? 'ENTER TO CONTINUE' : 'ENTER TO SKIP';
      }
    }

    function renderEntityDialogue() {
      const layer = view.entityDialogueLayer;
      if (!layer) return;
      const bubbles = worldSpeechRuntime?.getActive?.() || [];
      layer.innerHTML = '';
      layer.classList.toggle('hidden', bubbles.length === 0);
      layer.style.display = bubbles.length ? 'block' : 'none';
      layer.setAttribute('aria-hidden', bubbles.length ? 'false' : 'true');
      if (!bubbles.length) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;
      bubbles.forEach((bubble) => {
        const screenX = (bubble.anchor.x - camera.x) * scaleX;
        const screenY = (bubble.anchor.y - camera.y - (bubble.offsetY || 48)) * scaleY;
        if (screenX < -140 || screenX > rect.width + 140 || screenY < -140 || screenY > rect.height + 80) return;
        const el = document.createElement('div');
        el.className = 'entity-dialogue-bubble';
        el.dataset.tone = bubble.tone || 'boss';
        el.style.left = `${screenX}px`;
        el.style.top = `${screenY}px`;
        if (bubble.speaker) {
          const name = document.createElement('div');
          name.className = 'entity-dialogue-name';
          name.textContent = bubble.speaker;
          el.appendChild(name);
        }
        const text = document.createElement('div');
        text.className = 'entity-dialogue-text';
        text.textContent = bubble.visibleText || '';
        el.appendChild(text);
        layer.appendChild(el);
      });
    }

    function fallbackState(state) {
      const show = state || 'menu';
      function setVisible(element, visible, displayValue = '') {
        if (!element) return;
        element.classList.toggle('hidden', !visible);
        element.style.display = visible ? displayValue : 'none';
      }
      view.start.classList.toggle('hidden',     show !== 'menu');
      view.charSelect?.classList.toggle('hidden', show !== 'charselect');
      view.dead.classList.toggle('hidden',      show !== 'dead');
      view.win.classList.toggle('hidden',       show !== 'win');
      view.pause?.classList.toggle('hidden',    show !== 'pause');
      const inPlay = show === 'play' || show === 'pause' || show === 'dialogue' || show === 'dying';
      setVisible(view.hud, false, 'none');
      setVisible(view.actionBar, show === 'play' || show === 'pause' || show === 'dying', '');
      setVisible(view.playerStats, inPlay, '');
      setVisible(view.coinDisplay, inPlay, 'flex');
      setVisible(view.centerDisplay, inPlay, '');
      setVisible(view.objectiveTracker, inPlay, '');
      setVisible(view.dialogueOverlay, show === 'dialogue', 'flex');
      setVisible(view.entityDialogueLayer, inPlay, 'block');
      if (!inPlay && view.challengeStatus) {
        view.challengeStatus.classList.add('hidden');
        view.challengeStatus.setAttribute('aria-hidden', 'true');
      }
      if (show !== 'charselect') { setChallengePanelOpen(false); setLegacyPanelOpen(false); }
      if (show !== 'menu') { setRunHistoryOpen(false); setAltModesPanelOpen(false); }
      setVisible(view.endlessHud, inPlay && gameMode === 'endless', 'flex');
      setVisible(view.bossRushHud, inPlay && gameMode === 'boss_rush', 'flex');
      setVisible(view.practicePanel, inPlay && gameMode === 'practice' && show !== 'dying', 'block');
    }

    function setChallengePanelOpen(open) {
      challengePanelOpen = !!open;
      view.challengePanel?.classList.toggle('hidden', !challengePanelOpen);
      if (view.challengeToggle) {
        view.challengeToggle.textContent = challengePanelOpen ? 'HIDE CHALLENGE SHOP' : 'OPEN CHALLENGE SHOP';
        view.challengeToggle.setAttribute('aria-expanded', challengePanelOpen ? 'true' : 'false');
      }
    }

    let legacyPanelOpen = false;
    function setLegacyPanelOpen(open) {
      legacyPanelOpen = !!open;
      view.legacyPanel?.classList.toggle('hidden', !legacyPanelOpen);
      if (view.legacyToggle) {
        view.legacyToggle.textContent = legacyPanelOpen ? 'HIDE LEGACY UPGRADES' : 'OPEN LEGACY UPGRADES';
        view.legacyToggle.setAttribute('aria-expanded', legacyPanelOpen ? 'true' : 'false');
      }
    }

    function setRunHistoryOpen(open) {
      runHistoryOpen = !!open;
      view.runHistoryPanel?.classList.toggle('hidden', !runHistoryOpen);
      view.runHistoryPanel?.setAttribute('aria-hidden', runHistoryOpen ? 'false' : 'true');
      if (view.runHistoryBtn) {
        view.runHistoryBtn.textContent = runHistoryOpen ? 'HIDE HISTORY' : 'RUN HISTORY';
        view.runHistoryBtn.setAttribute('aria-expanded', runHistoryOpen ? 'true' : 'false');
      }
    }

    function setAltModesPanelOpen(open) {
      view.altModesPanel?.classList.toggle('hidden', !open);
      view.altModesPanel?.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    function renderRunHistoryDetail() {
      const selected = runHistoryEntries.find(entry => entry.id === selectedRunHistoryId) || runHistoryEntries[0] || null;
      view.runHistoryTabs.forEach(tab => {
        const active = (tab.dataset.tab || 'stats') === activeRunHistoryTab;
        tab.classList.toggle('active', active);
      });
      if (!selected) {
        if (view.runHistoryHero) view.runHistoryHero.innerHTML = '';
        if (view.runHistoryTabPanel) view.runHistoryTabPanel.innerHTML = '';
        return;
      }
      if (view.runHistoryHero) {
        view.runHistoryHero.innerHTML = renderRunHistoryHero(selected);
        hydrateRunHistorySprites(view.runHistoryHero);
      }
      if (view.runHistoryTabPanel) {
        view.runHistoryTabPanel.innerHTML = renderRunHistoryTabContent(selected, activeRunHistoryTab);
        hydrateRunHistorySprites(view.runHistoryTabPanel);
      }
    }

    function renderRunHistoryPage() {
      const totalPages = Math.max(1, Math.ceil(runHistoryEntries.length / runHistoryPageSize));
      runHistoryPage = clamp(runHistoryPage, 0, totalPages - 1);
      const start = runHistoryPage * runHistoryPageSize;
      const visibleEntries = runHistoryEntries.slice(start, start + runHistoryPageSize);
      if (!visibleEntries.some(entry => entry.id === selectedRunHistoryId)) {
        selectedRunHistoryId = visibleEntries[0]?.id || '';
      }
      if (view.runHistoryEmpty) view.runHistoryEmpty.classList.toggle('hidden', runHistoryEntries.length > 0);
      if (view.runHistoryList) {
        view.runHistoryList.innerHTML = visibleEntries.map(entry => renderRunHistoryListEntry(entry, entry.id === selectedRunHistoryId)).join('');
        view.runHistoryList.classList.toggle('hidden', runHistoryEntries.length === 0);
        view.runHistoryList.scrollTop = 0;
        hydrateRunHistorySprites(view.runHistoryList);
      }
      renderRunHistoryDetail();
      if (view.runHistoryPageLabel) {
        view.runHistoryPageLabel.textContent = runHistoryEntries.length
          ? `Page ${runHistoryPage + 1} / ${totalPages}`
          : 'Page 0 / 0';
      }
      if (view.runHistoryPrev) view.runHistoryPrev.disabled = runHistoryPage <= 0;
      if (view.runHistoryNext) view.runHistoryNext.disabled = runHistoryPage >= totalPages - 1 || runHistoryEntries.length === 0;
    }

    if (manager && typeof manager.registerScreen === 'function') {
      manager.registerScreen('coinDisplay', {
        create: () => makeContainer(view.coinDisplay, 'flex'),
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('centerDisplay', {
        create: () => makeContainer(view.centerDisplay, ''),
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('playerStats', {
        create: () => makeContainer(view.playerStats, ''),
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('actionBar', {
        create: () => makeContainer(view.actionBar, ''),
        validStates: ['play', 'pause'],
      });
      manager.registerScreen('dialogue', {
        create: () => makeContainer(view.dialogueOverlay, 'flex'),
        show: renderDialogue,
        update: renderDialogue,
        validStates: ['dialogue'],
      });
      manager.registerScreen('entityDialogue', {
        create: () => makeContainer(view.entityDialogueLayer, 'block'),
        show: renderEntityDialogue,
        update: renderEntityDialogue,
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('start', { create: () => makeContainer(view.start, ''), validStates: ['menu'] });
      manager.registerScreen('charSelect', { create: () => makeContainer(view.charSelect, ''), validStates: ['charselect'] });
      manager.registerScreen('dead', { create: () => makeContainer(view.dead, ''), validStates: ['dead'] });
      manager.registerScreen('win', { create: () => makeContainer(view.win, ''), validStates: ['win'] });
      manager.registerScreen('pause', { create: () => makeContainer(view.pause, ''), validStates: ['pause'] });
      if (gameStateManager && typeof manager.bindToStateManager === 'function') {
        manager.bindToStateManager(gameStateManager, { initialSync: true });
      }
    }

    if (gameStateManager && typeof gameStateManager.onChange === 'function') {
      gameStateManager.onChange((_from, to) => {
        activeState = to || 'menu';
        gameState = activeState;
        fallbackState(activeState);
      });
    }

    return {
      setState(state) {
        activeState = state || 'menu';
        if (gameStateManager && typeof gameStateManager.getState === 'function' && gameStateManager.getState() !== state) {
          gameStateManager.setState(state);
          return;
        }
        if (manager && typeof manager.onGameStateChange === 'function') manager.onGameStateChange(state);
        fallbackState(state);
      },
      setHudUpdateHook(hook) {
        hudUpdateHook = typeof hook === 'function' ? hook : null;
      },
      tick(dt = 0) {
        if (dialogueRuntime?.update) dialogueRuntime.update(dt);
        if (worldSpeechRuntime?.update) worldSpeechRuntime.update(dt);
        if (manager && typeof manager.updateAll === 'function') {
          manager.updateAll();
        } else {
          renderDialogue();
          renderEntityDialogue();
        }
        if (activeState === 'play' && hudUpdateHook) hudUpdateHook();
      },
      bindMenuActions(handlers) {
        if (menuBound) return;
        view.charButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onCharacterSelect(button.dataset.char || '', button);
          });
        });

        // Carousel prev/next arrows
        const carouselPrev = document.getElementById('carouselPrev');
        const carouselNext = document.getElementById('carouselNext');
        const charOrder = ['princess', 'thorn_knight', 'metao', 'granialla'];
        function carouselStep(delta) {
          const currentIndex = charOrder.indexOf(handlers._getChosenCharacter ? handlers._getChosenCharacter() : 'princess');
          let nextIndex = currentIndex;
          while (nextIndex + delta >= 0 && nextIndex + delta < charOrder.length) {
            nextIndex += delta;
            const nextKey = charOrder[nextIndex];
            const btn = view.charButtons.find(b => b.dataset.char === nextKey);
            if (btn && !btn.classList.contains('locked')) {
              handlers.onCharacterSelect(nextKey, btn);
              break;
            }
          }
        }
        carouselPrev?.addEventListener('click', () => carouselStep(-1));
        carouselNext?.addEventListener('click', () => carouselStep(1));

        // Touch swipe on carousel viewport
        const viewport = document.querySelector('.char-carousel-viewport');
        if (viewport) {
          let touchStartX = 0;
          viewport.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
          viewport.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 40) carouselStep(dx < 0 ? 1 : -1);
          }, { passive: true });
        }

        view.difficultyButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onDifficultySelect(button.dataset.difficulty || '', button);
          });
        });

        // Custom difficulty panel: wire sliders and number inputs
        document.querySelectorAll('#customDiffPanel .cdiff-row').forEach(row => {
          const param = row.dataset.param;
          if (!param) return;
          const slider = row.querySelector('.cdiff-slider');
          const numInput = row.querySelector('.cdiff-num');
          function applyValue(raw) {
            const v = param === 'waveBonus' || param === 'eliteFloor' ? parseInt(raw, 10) : parseFloat(raw);
            const clamped = Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), isNaN(v) ? parseFloat(slider.value) : v));
            const rounded = param === 'waveBonus' || param === 'eliteFloor' ? clamped : Math.round(clamped * 100) / 100;
            slider.value = rounded;
            numInput.value = rounded;
            customDifficultySettings[param] = rounded;
            persistMetaSoon();
          }
          const savedVal = customDifficultySettings[param];
          if (savedVal !== undefined) { slider.value = savedVal; numInput.value = savedVal; }
          slider.addEventListener('input', () => applyValue(slider.value));
          numInput.addEventListener('change', () => applyValue(numInput.value));
        });
        const resetCustomBtn = document.getElementById('customDiffReset');
        if (resetCustomBtn) {
          resetCustomBtn.addEventListener('click', () => {
            const defaults = {
              waveBonus: 0, eliteFloor: 8, eliteChance: 0.12, miniBossChanceMultiplier: 1,
              roomWeightBonus: 0, statMultiplier: 1, bossStatMultiplier: 1, speedMultiplier: 1,
              enemyReactionMultiplier: 1, rangedCadenceMultiplier: 1, supportPowerMultiplier: 1, shopPriceMultiplier: 1,
            };
            customDifficultySettings = { ...defaults };
            document.querySelectorAll('#customDiffPanel .cdiff-row').forEach(row => {
              const p = row.dataset.param;
              if (!p) return;
              const s = row.querySelector('.cdiff-slider');
              const n = row.querySelector('.cdiff-num');
              if (s) s.value = defaults[p];
              if (n) n.value = defaults[p];
            });
            persistMetaSoon();
          });
        }

        view.challengeButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onChallengeSelect(button.dataset.challenge || '', button);
          });
        });
        view.challengeToggle?.addEventListener('click', handlers.onToggleChallenges);
        view.legacyButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onLegacySelect(button.dataset.legacy || '');
          });
        });
        view.legacyToggle?.addEventListener('click', handlers.onToggleLegacy);
        view.runHistoryBtn?.addEventListener('click', handlers.onToggleRunHistory);
        view.runHistoryClose?.addEventListener('click', () => setRunHistoryOpen(false));
        view.runHistoryPrev?.addEventListener('click', () => {
          runHistoryPage = Math.max(0, runHistoryPage - 1);
          renderRunHistoryPage();
        });
        view.runHistoryNext?.addEventListener('click', () => {
          runHistoryPage += 1;
          renderRunHistoryPage();
        });
        view.runHistoryList?.addEventListener('click', event => {
          const target = event.target instanceof Element ? event.target.closest('[data-run-id]') : null;
          if (!target) return;
          selectedRunHistoryId = target.dataset.runId || '';
          renderRunHistoryPage();
        });
        view.runHistoryHero?.addEventListener('click', event => {
          const btn = event.target instanceof Element ? event.target.closest('[data-rerun-id]') : null;
          if (!btn) return;
          handlers.onRerunFromHistory(btn.dataset.rerunId);
        });
        view.runHistoryTabs.forEach(tab => {
          tab.addEventListener('click', () => {
            activeRunHistoryTab = tab.dataset.tab || 'stats';
            renderRunHistoryDetail();
          });
        });
        view.go.addEventListener('click', handlers.onStartNew);
        view.seed.addEventListener('keydown', event => {
          if (event.key === 'Enter') handlers.onStartNew();
        });
        view.continueBtn?.addEventListener('click', handlers.onContinue);
        view.deleteRunBtn?.addEventListener('click', handlers.onDeleteRun);
        view.dialogueOverlay?.addEventListener('click', handlers.onAdvanceDialogue);
        // New main-menu nav
        view.newRunBtn?.addEventListener('click', handlers.onOpenCharacterSelect);
        view.charBackBtn?.addEventListener('click', handlers.onCloseCharacterSelect);
        // Alt modes panel
        view.altModesBtn?.addEventListener('click', () => setAltModesPanelOpen(true));
        view.altModesClose?.addEventListener('click', () => setAltModesPanelOpen(false));
        view.altModeEndlessBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('endless');
        });
        view.altModePracticeBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('practice');
        });
        view.altModeBossRushBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('boss_rush');
        });
        // Practice panel toggle
        view.practicePanelToggle?.addEventListener('click', () => {
          view.practicePanelBody?.classList.toggle('hidden');
        });
        view.practiceClearBtn?.addEventListener('click', () => { enemies.length = 0; });
        view.practiceHealBtn?.addEventListener('click', () => { if (player) player.hp = player.maxHp; });
        view.practiceGiveItemBtn?.addEventListener('click', () => {
          if (!player) return;
          const key = rollItemDrop({ elite: true, stream: 'loot' });
          if (key) collectItem(key);
        });
        if (view.practiceEnemyGrid) buildPracticeEnemyGrid();
        menuBound = true;
      },
      bindRestartActions(onRestart) {
        if (restartBound) return;
        view.deadRestart?.addEventListener('click', onRestart);
        view.winRestart?.addEventListener('click', onRestart);
        restartBound = true;
      },
      playDialogue(lines, options) {
        const started = dialogueRuntime?.start?.(lines, options);
        renderDialogue();
        return !!started;
      },
      advanceDialogue() {
        const advanced = dialogueRuntime?.advance?.();
        renderDialogue();
        return !!advanced;
      },
      isDialogueOpen() {
        return !!dialogueRuntime?.isOpen?.();
      },
      sayAtWorldAnchor(input) {
        const id = worldSpeechRuntime?.say?.(input);
        renderEntityDialogue();
        return id || null;
      },
      setSaveState(text) { view.saveState.textContent = text; },
      setChallengePanelOpen,
      setLegacyPanelOpen,
      setRunHistoryOpen,
      setMenuMeta(coins, bestFloor, loopCrystals, saveState) {
        view.bankCoins.textContent = coins;
        view.bestFloor.textContent = bestFloor;
        if (view.loopCount) view.loopCount.textContent = loopCrystals;
        view.saveState.textContent = saveState;
      },
      setRunSummary(summary) {
        const hasRun = !!summary;
        // Main menu: show/hide Continue button
        view.continueBtn?.classList.toggle('hidden', !hasRun);
        view.runSummary.textContent = summary || '';
      },
      setRunHistory(entries) {
        runHistoryEntries = normalizeRunHistory(entries);
        runHistoryPage = 0;
        selectedRunHistoryId = runHistoryEntries[0]?.id || '';
        activeRunHistoryTab = 'stats';
        renderRunHistoryPage();
      },
      updateCharacterSelection(unlocked, selected) {
        const CHAR_ORDER = ['princess', 'thorn_knight', 'metao', 'granialla'];
        const CARD_W_ACTIVE = 270;
        const CARD_W_SIDE   = 200;
        const CARD_GAP      = 18;

        view.charButtons.forEach(button => {
          const itemKey = button.dataset.char;
          const hint = button.querySelector('small');
          const spriteCanvas = button.querySelector('[data-char-sprite]');
          const baseHint = hint?.dataset.base || hint?.textContent || '';
          if (hint && !hint.dataset.base) hint.dataset.base = baseHint;
          button.classList.toggle('locked', !unlocked.has(itemKey));
          button.classList.toggle('sel', selected === itemKey);
          button.disabled = !unlocked.has(itemKey);
          if (hint) hint.textContent = unlocked.has(itemKey) ? baseHint : 'locked in bank';
          if (spriteCanvas) {
            drawSpriteToCanvas(spriteCanvas, itemKey, 76, {
              alpha: unlocked.has(itemKey) ? 1 : 0.42,
            });
          }
        });

        // ── Carousel position ────────────────────────────────
        const track = document.getElementById('choose');
        const viewport = track?.parentElement;
        const activeIdx = CHAR_ORDER.indexOf(selected);
        if (track && viewport && activeIdx >= 0) {
          const viewW = viewport.offsetWidth || 440;
          const leftEdge = activeIdx * (CARD_W_SIDE + CARD_GAP);
          const tx = viewW / 2 - leftEdge - CARD_W_ACTIVE / 2;
          track.style.transform = `translateX(${tx}px)`;
        }

        // ── Arrow disabled state ─────────────────────────────
        const carouselPrev = document.getElementById('carouselPrev');
        const carouselNext = document.getElementById('carouselNext');
        const unlockedOrder = CHAR_ORDER.filter(k => unlocked.has(k));
        const currentPos = unlockedOrder.indexOf(selected);
        if (carouselPrev) carouselPrev.disabled = currentPos <= 0;
        if (carouselNext) carouselNext.disabled = currentPos >= unlockedOrder.length - 1;

        // ── Hero detail panel ────────────────────────────────
        const detail = document.getElementById('heroDetail');
        const disp = HERO_DISPLAY[selected];
        if (detail && disp) {
          const statsHtml = disp.stats.map(s =>
            `<div class="char-stat-row"><span class="stat-label">${s.label}</span>` +
            `<div class="stat-bar"><div class="stat-fill" style="width:${s.pct}%;background:${s.color}"></div></div></div>`
          ).join('');
          const defaultMoves = getDefaultMovesForCharacter(selected);
          const kitNames = ['melee', 'laser', 'smash', 'dash']
            .map(slot => MOVE_DEFS[defaultMoves[slot]]?.name || defaultMoves[slot]);
          const skillsHtml = kitNames.map(s =>
            `<span class="hero-detail-skill-pip">${s}</span>`
          ).join('');
          detail.innerHTML =
            `<div class="hero-detail-portrait"><canvas id="heroDetailSprite" width="128" height="128" aria-hidden="true"></canvas></div>` +
            `<p class="hero-detail-lore">${disp.lore}</p>` +
            `<div class="hero-detail-stats"><div class="hero-detail-section-label">Stats</div>${statsHtml}</div>` +
            `<div class="hero-detail-skills"><div class="hero-detail-section-label">Kit</div>${skillsHtml}</div>`;
          drawSpriteToCanvas(document.getElementById('heroDetailSprite'), selected, 104);
        }
      },
      updateDifficultySelection(unlocked, selected, loopCrystals) {
        const selectedDef = getDifficultyDef(selected);
        view.difficultyButtons.forEach(button => {
          const key = button.dataset.difficulty === 'custom' ? 'custom' : normalizeDifficulty(button.dataset.difficulty || '');
          const def = getDifficultyDef(key);
          const isUnlocked = unlocked.has(key);
          button.classList.toggle('sel', selected === key);
          button.classList.toggle('locked', !isUnlocked);
          button.disabled = !isUnlocked;
          button.title = isUnlocked ? def.description : `Unlock at ${def.unlockLoops} loop crystals`;
        });
        const customPanel = document.getElementById('customDiffPanel');
        if (customPanel) customPanel.classList.toggle('hidden', selected !== 'custom');
        if (view.difficultyHint) {
          view.difficultyHint.textContent = selected === 'custom'
            ? 'Custom: set your own multipliers below.'
            : selectedDef.unlockLoops > 0 && !unlocked.has(selected)
              ? `Unlocks at ${selectedDef.unlockLoops} loop crystals. Current crystals: ${loopCrystals}`
              : `${selectedDef.description} Loop Crystals: ${loopCrystals}.`;
        }
      },
      updateChallengeSelection(unlocked, owned, selected, loopCrystals, bankCoins) {
        view.challengeButtons.forEach(button => {
          const key = button.dataset.challenge || '';
          const def = CHALLENGE_DEFS[key];
          if (!def) return;
          const isUnlocked = unlocked.has(key);
          const isOwned = owned.has(key);
          const isSelected = selected.includes(key);
          button.classList.toggle('locked', !isUnlocked);
          button.classList.toggle('purchased', isOwned);
          button.classList.toggle('sel', isSelected);
          button.disabled = !isUnlocked;
          button.title = !isUnlocked
            ? `Unlock at ${def.unlockLoops} loop crystals`
            : isOwned
              ? def.description
              : `${def.description} Cost: ${def.cost} loop crystals`;
          const status = !isUnlocked
            ? `LOCKED UNTIL ${def.unlockLoops} LC`
            : isOwned
              ? (isSelected ? 'ACTIVE THIS RUN' : 'OWNED')
              : `BUY ${def.cost} LC`;
          button.innerHTML = `
            <span class="challenge-btn__top">
              <b>${escapeHtml(def.name)}</b>
              <em>${escapeHtml(status)}</em>
            </span>
            <span class="challenge-btn__desc">${escapeHtml(def.description)}</span>
            <span class="challenge-btn__reward">${escapeHtml(def.reward || 'Challenge reward')}</span>
          `;
        });
        if (view.challengeHint) {
          const activeCount = selected.length;
          const bonusCrystals = Math.max(0, Math.round(getActiveChallengeCrystalBonusMultiplier()));
          view.challengeHint.textContent = `Loop Crystals: ${loopCrystals}. Buy run types once, then toggle them. Active: ${activeCount}. Loop bonus: +${bonusCrystals} LC.`;
        }
      },
      updateLegacySelection(owned, loopCrystals) {
        view.legacyButtons.forEach(button => {
          const key = button.dataset.legacy || '';
          const def = LEGACY_UPGRADES[key];
          if (!def) return;
          const isOwned = owned.has(key);
          const canAfford = loopCrystals >= def.cost;
          button.classList.toggle('owned', isOwned);
          button.disabled = isOwned;
          const status = isOwned ? 'UNLOCKED' : canAfford ? `BUY ${def.cost} LC` : `NEED ${def.cost} LC`;
          button.innerHTML = `
            <span class="legacy-btn__top">
              <b>${escapeHtml(def.name)}</b>
              <em>${escapeHtml(status)}</em>
            </span>
            <span class="legacy-btn__desc">${escapeHtml(def.description)}</span>
            <span class="legacy-btn__effect">${escapeHtml(def.effect)}</span>
          `;
        });
        if (view.legacyHint) {
          const ownedCount = LEGACY_ORDER.filter(k => owned.has(k)).length;
          view.legacyHint.textContent = `Loop Crystals: ${loopCrystals}. Unlocked: ${ownedCount} / ${LEGACY_ORDER.length}. Upgrades are permanent and apply to all future runs.`;
        }
      },
      setItemStatus(items) {
        ITEM_KEYS.forEach(key => {
          const count = Number(items[key] || 0);
          view.itemSlots[key]?.classList.toggle('on', count > 0);
          if (view.itemCounts[key]) view.itemCounts[key].textContent = String(count);
        });
      },
      setObjective(text) { view.objective.textContent = text; },
      setObjectiveList(roomLabel, entries = []) {
        if (!view.objectiveTracker || !view.objectiveList) return;
        const visible = gameState === 'play' && entries.length > 0;
        view.objectiveTracker.classList.toggle('hidden', !visible);
        view.objectiveTracker.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (view.objectiveRoomLabel) view.objectiveRoomLabel.textContent = String(roomLabel || 'ROOM').toUpperCase();
        view.objectiveList.innerHTML = entries.map(entry => (
          `<li data-state="${escapeHtml(entry.state || 'todo')}">${escapeHtml(entry.text || '')}</li>`
        )).join('');
      },
      setHudValues(payload) {
        view.fl.textContent = payload.floor;
        view.lv.textContent = payload.level;
        view.xp.textContent = payload.xpText;
        if (view.gameTime) view.gameTime.textContent = payload.gameTime;
        view.coins.textContent = payload.coins;
        view.charName.textContent = payload.character;
        view.hpFill.style.width = `${Math.max(0, payload.hp / payload.maxHp) * 100}%`;
        view.hpTxt.textContent = Math.ceil(payload.hp);
        if (view.cdM) view.cdM.textContent = payload.meleeCd.toFixed(1);
        if (view.cdL) view.cdL.textContent = payload.laserCd.toFixed(1);
        if (view.cdS) view.cdS.textContent = payload.smashCd.toFixed(1);
        if (view.cdD) view.cdD.textContent = payload.dashCd.toFixed(1);
        if (payload.skills) {
          const melee = payload.skills.melee;
          const laser = payload.skills.laser;
          const smash = payload.skills.smash;
          const dash = payload.skills.dash;
          if (melee) setSkillCard('melee', melee.current, melee.max, !!melee.active, melee.charges, melee.maxCharges);
          if (laser) setSkillCard('laser', laser.current, laser.max, !!laser.active, laser.charges, laser.maxCharges);
          if (smash) setSkillCard('smash', smash.current, smash.max, !!smash.active, smash.charges, smash.maxCharges);
          if (dash) setSkillCard('dash', dash.current, dash.max, !!dash.active, dash.charges, dash.maxCharges);
        }
      },
      setDeadScreen(entry) {
        const fmt = (n) => String(n ?? '—');
        const fmtTime = (s) => {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return `${m}:${sec.toString().padStart(2, '0')}`;
        };
        const rarityClass = { knight: 'knight', white: 'knight', wizard: 'wizard', purple: 'wizard', god: 'god' };
        if (view.deadKillerCanvas) {
          drawSpriteToCanvas(view.deadKillerCanvas, resolveKillerSprite(entry.killerKey || ''), 120);
        }
        if (view.deadKillerName) view.deadKillerName.textContent = entry.killedBy || 'Unknown';
        if (view.deadFloor) view.deadFloor.textContent = `${fmt(entry.floor)}/10`;
        if (view.deadLevel) view.deadLevel.textContent = fmt(entry.level);
        if (view.deadKills) view.deadKills.textContent = fmt(entry.kills);
        if (view.deadTime) view.deadTime.textContent = fmtTime(entry.elapsedSeconds || 0);
        if (view.deadCoins) view.deadCoins.textContent = fmt(entry.coins);
        if (view.deadDifficulty) view.deadDifficulty.textContent = (entry.difficultyName || entry.difficulty || '—').toUpperCase();
        if (view.deadItems) {
          view.deadItems.innerHTML = '';
          const items = Array.isArray(entry.items) ? entry.items : [];
          if (items.length === 0) {
            view.deadItems.innerHTML = '<span style="opacity:.3;font-size:11px">None</span>';
          } else {
            items.forEach(item => {
              const pill = document.createElement('span');
              const rc = rarityClass[item.rarity] || 'knight';
              pill.className = `dead-item-pill dead-item-pill--${rc}`;
              pill.textContent = item.count > 1 ? `${item.name} ×${item.count}` : item.name;
              view.deadItems.appendChild(pill);
            });
          }
        }
      },
      setWinInfo(text) { view.winInfo.textContent = text; },
    };
  }

  function createSaveStore() {
    const localPrefix = 'neonyke:';
    const idb = typeof indexedDB !== 'undefined' ? indexedDB : null;
    let dbPromise = null;
    const SaveApiCtor = KozSaveApi.SaveAPI || null;
    const createLocalStorageDriver = KozStorageDrivers.createLocalStorageDriver || null;

    function createFallbackApi(key) {
      if (!SaveApiCtor || !createLocalStorageDriver) return null;
      try {
        return new SaveApiCtor({
          driver: createLocalStorageDriver(localStorage),
          key: localPrefix + key,
        });
      } catch (error) {
        return null;
      }
    }

    function openDb() {
      if (!idb) return Promise.reject(new Error('IndexedDB unavailable'));
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = idb.open('NeoNykeDB', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('saves')) {
            request.result.createObjectStore('saves');
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return dbPromise;
    }

    async function idbGet(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readonly');
        const store = tx.objectStore('saves');
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    }

    async function idbPut(key, value) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    async function idbDelete(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    const fallback = {
      async get(key) {
        const api = createFallbackApi(key);
        if (api) return api.load();
        const raw = localStorage.getItem(localPrefix + key);
        return raw ? JSON.parse(raw) : null;
      },
      async put(key, value) {
        const api = createFallbackApi(key);
        if (api) {
          api.save(value);
          return;
        }
        localStorage.setItem(localPrefix + key, JSON.stringify(value));
      },
      async delete(key) {
        const api = createFallbackApi(key);
        if (api) {
          api.delete();
          return;
        }
        localStorage.removeItem(localPrefix + key);
      },
    };

    return {
      kind: idb ? 'IDB READY' : 'LOCAL ONLY',
      async get(key) {
        if (!idb) return fallback.get(key);
        try {
          return await idbGet(key);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.get(key);
        }
      },
      async put(key, value) {
        if (!idb) return fallback.put(key, value);
        try {
          return await idbPut(key, value);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.put(key, value);
        }
      },
      async delete(key) {
        if (!idb) return fallback.delete(key);
        try {
          return await idbDelete(key);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.delete(key);
        }
      },
    };
  }

  function makeRNG(seed) {
    return mulberry32(xmur3(seed)());
  }

  function buildWeightTable(entries) {
    let total = 0;
    const cumulative = entries.map(([key, weight]) => {
      total += Math.max(0, Number(weight) || 0);
      return [key, total];
    });
    return { total, cumulative };
  }

  function rollFromWeightTable(table, stream = 'loot') {
    if (!table || table.total <= 0 || !table.cumulative.length) return 'neo_knife';
    const roll = nextRandom(stream) * table.total;
    let lo = 0;
    let hi = table.cumulative.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (roll < table.cumulative[mid][1]) hi = mid;
      else lo = mid + 1;
    }
    return table.cumulative[lo]?.[0] || 'neo_knife';
  }

  function mulberry32(a) {
    return function nextRandom() {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function xmur3(seed) {
    let h = 1779033703 ^ seed.length;
    for (let index = 0; index < seed.length; index += 1) {
      h = Math.imul(h ^ seed.charCodeAt(index), 3432918353);
      h = h << 13 | h >>> 19;
    }
    return function seedFn() {
      h = Math.imul(h ^ h >>> 16, 2246822507);
      h = Math.imul(h ^ h >>> 13, 3266489909);
      return (h ^ h >>> 16) >>> 0;
    };
  }

  function rand(max = 1, min = 0, stream = 'encounter') {
    return min + (max - min) * nextRandom(stream);
  }

  function irand(min, max, stream = 'encounter') {
    return Math.floor(rand(max + 1, min, stream));
  }

  function shuffle(array, stream = 'encounter') {
    const copy = [...array];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(nextRandom(stream) * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const testX = clamp(cx, rx, rx + rw);
    const testY = clamp(cy, ry, ry + rh);
    const dx = cx - testX;
    const dy = cy - testY;
    return dx * dx + dy * dy < r * r;
  }

  function isBlocked(x, y, r) {
    if (walls.some(wall => circleRect(x, y, r, wall.x, wall.y, wall.w, wall.h))) return true;
    if (structures.some(structure => circleRect(x, y, r, structure.x - structure.w / 2, structure.y - structure.h / 2, structure.w, structure.h))) return true;
    return destructibles.some(prop => !prop.broken && !prop.hidden && circleRect(x, y, r, prop.x - prop.r, prop.y - prop.r, prop.r * 2, prop.r * 2));
  }

  function beamHitsCircle(x1, y1, x2, y2, cx, cy, radius) {
    const lineLengthSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (lineLengthSq === 0) return false;
    let t = ((cx - x1) * (x2 - x1) + (cy - y1) * (y2 - y1)) / lineLengthSq;
    t = clamp(t, 0, 1);
    const px = x1 + t * (x2 - x1);
    const py = y1 + t * (y2 - y1);
    return dist(px, py, cx, cy) <= radius;
  }

  function getPlayerBeamRange(mode = laserMode, moveKey = getEquippedMove('laser')) {
    if (mode === 'god_sweep') return 560;
    if (mode === 'turtle_wave') return 620;
    if (moveKey === 'love_beam') return 500;
    return ATTACKS.laser.range;
  }

  function getPlayerBeamBounceCount(mode = laserMode) {
    return mode === 'beam' ? PLAYER_BEAM_BOUNCES : HEAVY_BEAM_BOUNCES;
  }

  function getEnemyBeamBounceCount(enemy) {
    if (!enemy) return ENEMY_BEAM_BOUNCES;
    return enemy.type === 'god' ? HEAVY_BEAM_BOUNCES : ENEMY_BEAM_BOUNCES;
  }

  function getBeamReflectRects() {
    const rects = walls.slice();
    structures.forEach(structure => {
      if (!structure || !Number.isFinite(structure.x) || !Number.isFinite(structure.y)) return;
      if (!Number.isFinite(structure.w) || !Number.isFinite(structure.h) || structure.w <= 0 || structure.h <= 0) return;
      rects.push({
        x: structure.x - structure.w / 2,
        y: structure.y - structure.h / 2,
        w: structure.w,
        h: structure.h,
      });
    });
    return rects;
  }

  function rayRectHit(originX, originY, dirX, dirY, rect, maxDistance) {
    const minX = rect.x;
    const maxX = rect.x + rect.w;
    const minY = rect.y;
    const maxY = rect.y + rect.h;
    let nearTime = -Infinity;
    let farTime = Infinity;
    let nearNormalX = 0;
    let nearNormalY = 0;
    let farNormalX = 0;
    let farNormalY = 0;

    if (Math.abs(dirX) < BEAM_RICOCHET_EPSILON) {
      if (originX < minX || originX > maxX) return null;
    } else {
      let t1 = (minX - originX) / dirX;
      let t2 = (maxX - originX) / dirX;
      let n1x = dirX > 0 ? -1 : 1;
      let n2x = -n1x;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
        [n1x, n2x] = [n2x, n1x];
      }
      if (t1 > nearTime) {
        nearTime = t1;
        nearNormalX = n1x;
        nearNormalY = 0;
      }
      if (t2 < farTime) {
        farTime = t2;
        farNormalX = n2x;
        farNormalY = 0;
      }
    }

    if (Math.abs(dirY) < BEAM_RICOCHET_EPSILON) {
      if (originY < minY || originY > maxY) return null;
    } else {
      let t1 = (minY - originY) / dirY;
      let t2 = (maxY - originY) / dirY;
      let n1y = dirY > 0 ? -1 : 1;
      let n2y = -n1y;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
        [n1y, n2y] = [n2y, n1y];
      }
      if (t1 > nearTime) {
        nearTime = t1;
        nearNormalX = 0;
        nearNormalY = n1y;
      }
      if (t2 < farTime) {
        farTime = t2;
        farNormalX = 0;
        farNormalY = n2y;
      }
    }

    if (nearTime > farTime || farTime < BEAM_RICOCHET_EPSILON) return null;
    let distance = nearTime;
    let normalX = nearNormalX;
    let normalY = nearNormalY;
    if (distance < BEAM_RICOCHET_EPSILON) {
      distance = farTime;
      normalX = farNormalX;
      normalY = farNormalY;
    }
    if (distance < BEAM_RICOCHET_EPSILON || distance > maxDistance) return null;
    return {
      distance,
      x: originX + dirX * distance,
      y: originY + dirY * distance,
      normalX,
      normalY,
    };
  }

  function findBeamRicochetHit(originX, originY, dirX, dirY, maxDistance, rects) {
    let closest = null;
    rects.forEach(rect => {
      const hit = rayRectHit(originX, originY, dirX, dirY, rect, maxDistance);
      if (!hit) return;
      if (!closest || hit.distance < closest.distance) closest = hit;
    });
    return closest;
  }

  function buildRicochetBeamPath(originX, originY, angle, range, maxBounces = 0) {
    const path = [];
    let remaining = Math.max(0, Number(range || 0));
    let startX = originX;
    let startY = originY;
    let currentAngle = Number.isFinite(angle) ? angle : 0;
    const bounceLimit = Math.max(0, Math.floor(Number(maxBounces || 0)));
    const rects = getBeamReflectRects();

    for (let bounce = 0; remaining > BEAM_RICOCHET_NUDGE; bounce += 1) {
      const dirX = Math.cos(currentAngle);
      const dirY = Math.sin(currentAngle);
      const hit = findBeamRicochetHit(startX, startY, dirX, dirY, remaining, rects);
      if (!hit) {
        const endX = startX + dirX * remaining;
        const endY = startY + dirY * remaining;
        path.push({ x1: startX, y1: startY, x2: endX, y2: endY, angle: currentAngle, length: remaining, hitWall: false });
        break;
      }

      const segmentLength = Math.max(0, hit.distance);
      if (segmentLength > BEAM_RICOCHET_EPSILON) {
        path.push({ x1: startX, y1: startY, x2: hit.x, y2: hit.y, angle: currentAngle, length: segmentLength, hitWall: true });
      }
      if (bounce >= bounceLimit) break;

      remaining = Math.max(0, remaining - segmentLength - BEAM_RICOCHET_NUDGE);
      const dot = dirX * hit.normalX + dirY * hit.normalY;
      const reflectX = dirX - 2 * dot * hit.normalX;
      const reflectY = dirY - 2 * dot * hit.normalY;
      currentAngle = Math.atan2(reflectY, reflectX);
      startX = hit.x + reflectX * BEAM_RICOCHET_NUDGE;
      startY = hit.y + reflectY * BEAM_RICOCHET_NUDGE;
    }

    return path;
  }

  function beamPathHitsCircle(path, cx, cy, radius) {
    for (let index = 0; index < path.length; index += 1) {
      const segment = path[index];
      if (beamHitsCircle(segment.x1, segment.y1, segment.x2, segment.y2, cx, cy, radius)) return segment;
    }
    return null;
  }

  function getBeamPathLength(path) {
    return path.reduce((sum, segment) => sum + (segment.length || Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1)), 0);
  }

  function getBeamPathEnd(path) {
    const last = path[path.length - 1];
    return last ? { x: last.x2, y: last.y2 } : { x: 0, y: 0 };
  }

  function sampleBeamPath(path, amount) {
    const totalLength = getBeamPathLength(path);
    if (!totalLength) return null;
    let targetDistance = clamp(Number(amount || 0), 0, 1) * totalLength;
    let traversed = 0;
    for (let index = 0; index < path.length; index += 1) {
      const segment = path[index];
      const dx = segment.x2 - segment.x1;
      const dy = segment.y2 - segment.y1;
      const length = segment.length || Math.hypot(dx, dy);
      if (!length) continue;
      if (targetDistance <= length || index === path.length - 1) {
        const localT = clamp(targetDistance / length, 0, 1);
        const dirX = dx / length;
        const dirY = dy / length;
        return {
          x: segment.x1 + dx * localT,
          y: segment.y1 + dy * localT,
          dx: dirX,
          dy: dirY,
          nx: -dirY,
          ny: dirX,
          t: clamp((traversed + length * localT) / totalLength, 0, 1),
          angle: segment.angle,
        };
      }
      targetDistance -= length;
      traversed += length;
    }
    return null;
  }

  function drawTaperedBeamPath(path, options = {}) {
    const totalLength = getBeamPathLength(path);
    if (!totalLength) return;
    const color = options.color || '#ff00aa';
    const glow = options.glow || color;
    const maxWidth = Number(options.maxWidth || 8);
    let traversed = 0;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = glow;
    ctx.shadowBlur = Number(options.shadowBlur || 18);
    path.forEach(segment => {
      const dx = segment.x2 - segment.x1;
      const dy = segment.y2 - segment.y1;
      const length = segment.length || Math.hypot(dx, dy);
      if (!length) return;
      const dirX = dx / length;
      const dirY = dy / length;
      const normalX = -dirY;
      const normalY = dirX;
      const subSegments = Math.max(2, Math.ceil(length / 32));
      for (let index = 0; index < subSegments; index += 1) {
        const t0 = index / subSegments;
        const t1 = (index + 1) / subSegments;
        const globalT0 = (traversed + length * t0) / totalLength;
        const globalT1 = (traversed + length * t1) / totalLength;
        const taper0 = 1 - globalT0 * globalT0;
        const taper1 = 1 - globalT1 * globalT1;
        const w0 = maxWidth * taper0 * 0.5;
        const w1 = maxWidth * taper1 * 0.5;
        const x0 = segment.x1 + dx * t0;
        const y0 = segment.y1 + dy * t0;
        const x1 = segment.x1 + dx * t1;
        const y1 = segment.y1 + dy * t1;
        ctx.beginPath();
        ctx.moveTo(x0 + normalX * w0, y0 + normalY * w0);
        ctx.lineTo(x1 + normalX * w1, y1 + normalY * w1);
        ctx.lineTo(x1 - normalX * w1, y1 - normalY * w1);
        ctx.lineTo(x0 - normalX * w0, y0 - normalY * w0);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
      traversed += length;
    });

    ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1.5, maxWidth * 0.22);
    ctx.lineCap = 'round';
    path.forEach(segment => {
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function strokeBeamPath(path, options = {}) {
    if (!path.length) return;
    const color = options.color || '#aa66ff';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Number(options.width || 7);
    ctx.shadowColor = color;
    ctx.shadowBlur = Number(options.shadowBlur || 14);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path.forEach(segment => {
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function getBeamEnd(x, y, angle, range) {
    return {
      x: x + Math.cos(angle) * range,
      y: y + Math.sin(angle) * range,
    };
  }
})();
