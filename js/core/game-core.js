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
  const HEAVY_HIT_HEALTH_RATIO = 0.5;
  const HEAVY_KNOCKBACK_THRESHOLD = 300;
  const HEAVY_HIT_STUN = 0.62;
  const HEAVY_KNOCKBACK_STUN = 0.46;
  const HEAVY_IMPACT_BOSS_STUN_MULTIPLIER = 0.65;
  const PLAYER_BEAM_BOUNCES = 2;
  const HEAVY_BEAM_BOUNCES = 1;
  const ENEMY_BEAM_BOUNCES = 1;
  const LAZER_GLASSES_BOUNCES = 1;
  const BEAM_RICOCHET_NUDGE = 0.65;
  const BEAM_RICOCHET_EPSILON = 0.0001;
  const TURTLE_WAVE_HP_PER_SECOND = 2;
  const LOW_HEALTH_HIT_FLASH_MS = 700;
  const CORPSE_FADE_START = 4.5;
  const CORPSE_LIFETIME = 11;
  const CORPSE_FALL_TIME = 0.32;
  const PROJECTILE_TRAIL_LENGTH = 6;
  const AOE_SHOCKWAVE_LIFE = 0.36;
  const ENV_TILE_SIZE = 48;
  const LIGHTING_CONFIG = {
    clearRoomTypes: new Set(['start', 'shop', 'anvil', 'secret']),
    darkness: {
      combat: 0.1,
      challenge: 0.16,
      boss: 0.1,
      minVisible: 0.05,
      lightRelief: 0.12,
    },
    ambient: {
      inner: 210,
      outerScale: 1.08,
      strength: 0.5,
      bossStrength: 0.5,
      tint: 'rgba(126, 165, 226, 0.08)',
    },
    player: {
      inner: 128,
      outer: 660,
      strength: 2.16,
      tint: 'rgba(155, 212, 255, 0.12)',
    },
    maxLights: 34,
    maxOuterRadius: 700,
  };
  const ENEMY_SCALING = {
    floor: 0.14,
    loop: 0.32,
    minute: 0.12,
  };
  const BLEED_RESIST_SCALING = {
    floorInLoop: 0.16,
    loop: 0.65,
    elite: 0.45,
    miniBoss: 0.4,
    boss: 1.1,
    rival: 0.75,
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
  const DEFAULT_KILLER_DEATH_QUOTES = [
    'Another hero falls.',
    'Your story ends here.',
    'You were not ready for this dungeon.',
    'Remember this defeat.',
    'Dust and silence, that is all that remains.',
  ];
  const KILLER_DEATH_QUOTES = {
    god: ['Kneel, mortal.', 'Divinity does not miss twice.', 'You challenged a god and paid for it.'],
    queen_cult: ['The chorus grows louder.', 'Your voice joins the cult now.', 'Sing your last note.'],
    bulk_golem: ['Stone outlasts flesh.', 'I break what stands before me.', 'Crushed.'],
    artificer_knave: ['Precision beats courage.', 'You moved exactly where I wanted.', 'Your logic failed.'],
    rival_princess: ['You were always late.', 'You should have fought for me.', 'Too slow, too weak.'],
    rival_thorn: ['You should have run.', 'Your loot is mine.', 'You fought hard, still lost.'],
    rival_metao: ['I saw this ending already.', 'Prediction complete.', 'You never caught up.'],
    rival_granialla: ['A god does not yield.', 'You were judged and found wanting.', 'Kneel.'],
    mirror_knight: ['I know every move you make.', 'I was always one step ahead.', 'You cannot outfight yourself.'],
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
      lore: 'A dark-skinned princess built for accessible runs. High damage, generous HP, and forgiving cooldowns make her ideal for new adventurers.',
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
      lore: 'A priestess with a crown of golden hair. Divine judgment and self-restoration — earned only by slaying GOD.',
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
  let SPRITE_ATLAS = null;
  const ENV_TILE_ROOT = window.NeoNykeEnvironmentTileDefs || {};
  const ENV_TILE_SOURCE_SIZE = ENV_TILE_ROOT.sourceSize || 16;
  const ENV_TILE_DEFS = ENV_TILE_ROOT.tiles || {};
  let ENV_TILE_ATLAS = null;

  const MOVE_SLOTS = ['melee', 'laser', 'smash', 'dash'];
  const SLOT_LABELS = { melee: 'Melee', laser: 'Laser', smash: 'Smash', dash: 'Mobility' };
  const SLOT_KEYS  = { melee: 'LMB', laser: 'RMB', smash: 'R', dash: 'SHIFT' };
