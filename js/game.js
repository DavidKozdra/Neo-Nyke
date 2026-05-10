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
  const RIVAL_SPAWN_CHANCE = 0.15; // ~15% spawn chance - very rare encounters
  const RIVAL_GROWTH_TICK_SECONDS = 14;
  const RIVAL_XP_PER_GROWTH_TICK = 12;
  const RIVAL_WEAPON_SWAP_BASE = 3.6;
  const MONSTER_ROAM_INTERVAL_SECONDS = 60;
  const MONSTER_ROAM_MOVE_CHANCE = 0.28;
  const PURPLE_WEAPON_POOL = ['lazer_glasses', 'metao_fire_staff', 'magenta_degale', 'magenta_p90'];
  const RED_WEAPON_POOL = ['granillia_lightning_spear', 'excalibur', 'golden_fleece', 'void_piercer', 'aegis_shield_weapon'];

  const RIVAL_WEAPON_LOADOUTS = {
    princess: [
      { key: 'thorns_bleed_blade', class: 'melee', range: 42, preferredRange: 120, damageMult: 1.08, cooldownMult: 0.92, knockback: 300 },
      { key: 'magenta_degale', class: 'ranged', range: 360, preferredRange: 220, damageMult: 0.88, cooldownMult: 1.1, projectileCount: 2, spread: 0.14, projectileSpeed: 340 },
    ],
    thorn_knight: [
      { key: 'extending_staff', class: 'melee', range: 56, preferredRange: 130, damageMult: 1.0, cooldownMult: 0.84, knockback: 320 },
      { key: 'hunters_bow', class: 'ranged', range: 430, preferredRange: 270, damageMult: 0.86, cooldownMult: 1.05, projectileCount: 1, spread: 0.04, projectileSpeed: 420 },
      { key: 'thorns_bleed_blade', class: 'dash', range: 240, preferredRange: 165, damageMult: 1.15, cooldownMult: 1.2, knockback: 360 },
    ],
    metao: [
      { key: 'magenta_p90', class: 'burst', range: 390, preferredRange: 250, damageMult: 0.72, cooldownMult: 1.0, projectileCount: 4, spread: 0.16, projectileSpeed: 360 },
      { key: 'lazer_glasses', class: 'ranged', range: 470, preferredRange: 300, damageMult: 0.92, cooldownMult: 1.14, projectileCount: 1, spread: 0.02, projectileSpeed: 460 },
    ],
    granialla: [
      { key: 'granillia_lightning_spear', class: 'ranged', range: 420, preferredRange: 260, damageMult: 0.94, cooldownMult: 1.0, projectileCount: 2, spread: 0.08, projectileSpeed: 390 },
      { key: 'excalibur', class: 'melee_heal', range: 50, preferredRange: 130, damageMult: 1.12, cooldownMult: 0.95, knockback: 320 },
      { key: 'void_piercer', class: 'burst', range: 340, preferredRange: 220, damageMult: 0.95, cooldownMult: 1.12, projectileCount: 3, spread: 0.1, projectileSpeed: 380 },
    ],
  };

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
      shortName: 'Warp F',
      description: 'Charge requirement -1. When charged, press F during non-boss combat to spend 50% coins and warp to the ladder room (next floor path).',
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
    anchor_charm: {
      key: 'anchor_charm',
      name: 'Anchor Charm',
      shortName: 'Stun Resist',
      description: 'Stun resistance. Impact stuns last less and require harder hits or stronger knockback.',
      rarity: 'knight',
      color: '#d7e4f2',
      category: 'knight',
      tags: ['defense', 'stun'],
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
    robot_arm: {
      key: 'robot_arm',
      name: 'Robot Arm',
      shortName: 'Auto x15 Spd',
      description: 'Attack speed x15. Automatically attacks with left click.',
      rarity: 'god',
      color: '#c0e8ff',
      category: 'god',
      tags: ['god', 'speed'],
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
  const SANDBOX_ENEMY_TYPES = [
    'hunter', 'charger', 'laser', 'knave', 'sniper', 'machine_gunner',
    'golem', 'cult_mage', 'cult_follower', 'summoner', 'shield_unit', 'healer', 'boss_spawner',
    'queen_cult', 'bulk_golem', 'artificer_knave', 'god', 'mirror_knight',
  ];
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
    ['anchor_charm', 18],
    ['iron_lung', 10],
    ['oracles_lens', 8],
    ['wizards_paw', 6],
    ['jesters_dice', 4],
    ['shield_of_aegis', 4],
    ['pendant_of_kronos', 5],
    ['robot_arm', 3],
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
    'anchor_charm',
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
    objectiveToggle: document.getElementById('objectiveToggle'),
    objectiveSummary: document.getElementById('objectiveSummary'),
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
    deadItemsPrev: document.getElementById('deadItemsPrev'),
    deadItemsNext: document.getElementById('deadItemsNext'),
    deadItemsPage: document.getElementById('deadItemsPage'),
    deadRecords: document.getElementById('deadRecords'),
    deadActions: [...document.querySelectorAll('#dead [data-dead-action]')],
    win: document.getElementById('win'),
    winInfo: document.getElementById('winInfo'),
    deadRestart: document.querySelector('#dead .restart'),
    winRestart: document.querySelector('#win .restart'),
    pause: document.getElementById('pause'),
    pauseResume: document.getElementById('pauseResume'),
    pauseSettings: document.getElementById('pauseSettings'),
    pauseMain: document.getElementById('pauseMain'),
    interactPrompt: document.getElementById('interactPrompt'),
    actionBar: document.getElementById('actionBar'),
    hudLower: document.getElementById('hudLower'),
    adapterStatus: document.getElementById('adapterStatus'),
    adapterStatusIcon: document.getElementById('adapterStatusIcon'),
    adapterStatusText: document.getElementById('adapterStatusText'),
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
    invPlayerTabs: document.getElementById('invPlayerTabs'),
    invPlayerTabBtns: [...document.querySelectorAll('#invPlayerTabs .inv-player-tab')],
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
    hudLoopIcon: document.getElementById('hudLoopIcon'),
    metaCoinIcon: document.getElementById('metaCoinIcon'),
    metaLoopIcon: document.getElementById('metaLoopIcon'),
    centerDisplay: document.getElementById('centerDisplay'),
    timerFloorSlot: document.getElementById('timerFloorSlot'),
    timerBossSlot: document.getElementById('timerBossSlot'),
    bossRushStageNum2: document.getElementById('bossRushStageNum2'),
    challengeStatus: document.getElementById('challengeStatus'),
    challengeStatusLabel: document.getElementById('challengeStatusLabel'),
    challengeStatusFill: document.getElementById('challengeStatusFill'),
    dialogueOverlay: document.getElementById('dialogueOverlay'),
    dialoguePortrait: document.getElementById('dialoguePortrait'),
    dialogueSpeaker: document.getElementById('dialogueSpeaker'),
    dialogueText: document.getElementById('dialogueText'),
    dialogueHint: document.getElementById('dialogueHint'),
    tutorialOverlay: document.getElementById('tutorialOverlay'),
    tutorialSpeaker: document.getElementById('tutorialSpeaker'),
    tutorialText: document.getElementById('tutorialText'),
    tutorialPrevBtn: document.getElementById('tutorialPrevBtn'),
    tutorialNextBtn: document.getElementById('tutorialNextBtn'),
    tutorialHint: document.getElementById('tutorialHint'),
    tutorialSkipBtn: document.getElementById('tutorialSkipBtn'),
    entityDialogueLayer: document.getElementById('entityDialogueLayer'),
    playerHpFill: document.getElementById('playerHpFill'),
    playerHpTxt: document.getElementById('playerHpTxt'),
    playerXpFill: document.getElementById('playerXpFill'),
    playerXpTxt: document.getElementById('playerXpTxt'),
    coinCount: document.getElementById('coinCount'),
    hudLoopCount: document.getElementById('hudLoopCount'),
    timerDisplay: document.getElementById('timerDisplay'),
    floorDisplay: document.getElementById('floorDisplay'),
    difficultyDisplay: document.getElementById('difficultyDisplay'),
    itemRarityCounts: document.getElementById('itemRarityCounts'),
    seed: document.getElementById('seed'),
    go: document.getElementById('go'),
    difficultyHint: document.getElementById('difficultyHint'),
    challengePanel: document.getElementById('challengePanel'),
    challengeToggle: document.getElementById('challengeToggle'),
    challengeClose: document.getElementById('challengeClose'),
    challengeHint: document.getElementById('challengeHint'),
    continueRow: document.getElementById('continueRow'),
    continueBtn: document.getElementById('continueBtn'),
    newRunBtn: document.getElementById('newRunBtn'),
    runHistoryBtn: document.getElementById('runHistoryBtn'),
    runHistoryPanel: document.getElementById('runHistoryPanel'),
    runHistoryPanelTitle: document.getElementById('runHistoryPanelTitle'),
    runHistoryViewTabs: [...document.querySelectorAll('#runHistoryPanel .rh-view-tab')],
    achievementsList: document.getElementById('achievementsList'),
    rhProfilePanel: document.getElementById('rhProfilePanel'),
    rhInfoPanel: document.getElementById('rhInfoPanel'),
    rhInfoContent: document.getElementById('rhInfoContent'),
    rhInfoTabs: [...document.querySelectorAll('#rhInfoPanel .rh-info-tab')],
    infoTutorialBtn: document.getElementById('infoTutorialBtn'),
    rhBankCoins: document.getElementById('rhBankCoins'),
    rhLoopCount: document.getElementById('rhLoopCount'),
    rhBestFloor: document.getElementById('rhBestFloor'),
    rhSaveState: document.getElementById('rhSaveState'),
    runHistoryList: document.getElementById('runHistoryList'),
    runHistoryEmpty: document.getElementById('runHistoryEmpty'),
    runHistoryBody: document.querySelector('#runHistoryPanel .rh-body'),
    runHistoryClose: document.getElementById('runHistoryClose'),
    runHistoryPrev: document.getElementById('runHistoryPrev'),
    runHistoryNext: document.getElementById('runHistoryNext'),
    runHistoryPageLabel: document.getElementById('runHistoryPageLabel'),
    runHistoryHero: document.getElementById('runHistoryHero'),
    runHistoryTabPanel: document.getElementById('runHistoryTabPanel'),
    runHistoryModeTabs: [...document.querySelectorAll('#runHistoryPanel .rh-mode-tab')],
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
    altModeCoopBtn: document.getElementById('altModeCoopBtn'),
    altModePvpBtn: document.getElementById('altModePvpBtn'),
    mpLobby: document.getElementById('mpLobby'),
    mpLobbyBack: document.getElementById('mpLobbyBack'),
    mpLobby1Btn: document.getElementById('mpLobby1Btn'),
    mpLobby2Btn: document.getElementById('mpLobby2Btn'),
    mpLobbyTitle: document.getElementById('mpLobbyTitle'),
    charSelectPhaseTag: document.getElementById('charSelectPhaseTag'),
    charSelectTitle: document.getElementById('charSelectTitle'),
    charSelectSubtitle: document.getElementById('charSelectSubtitle'),
    altModeSandboxBtn: document.getElementById('altModeSandboxBtn'),
    altModeSandboxConfigBtn: document.getElementById('altModeSandboxConfigBtn'),
    sandboxPanel: document.getElementById('sandboxPanel'),
    sandboxPanelBackdrop: document.getElementById('sandboxPanelBackdrop'),
    sandboxClose: document.getElementById('sandboxClose'),
    sandboxReset: document.getElementById('sandboxReset'),
    sandboxSaveClose: document.getElementById('sandboxSaveClose'),
    sandboxEnemyList: document.getElementById('sandboxEnemyList'),
    sandboxItemList: document.getElementById('sandboxItemList'),
    sandboxEnemiesAll: document.getElementById('sandboxEnemiesAll'),
    sandboxEnemiesNone: document.getElementById('sandboxEnemiesNone'),
    sandboxItemsAll: document.getElementById('sandboxItemsAll'),
    sandboxItemsNone: document.getElementById('sandboxItemsNone'),
    sandboxGodMode: document.getElementById('sandboxGodMode'),
    endlessHud: document.getElementById('endlessHud'),
    endlessWaveNum: document.getElementById('endlessWaveNum'),
    bossRushHud: document.getElementById('bossRushHud'),
    bossRushStageNum: document.getElementById('bossRushStageNum'),
    practicePanel: document.getElementById('practicePanel'),
    practicePanelToggle: document.getElementById('practicePanelToggle'),
    practicePanelBody: document.getElementById('practicePanelBody'),
    practiceEnemyGrid: document.getElementById('practiceEnemyGrid'),
    practiceMaxHpSlider: document.getElementById('practiceMaxHpSlider'),
    practiceMaxHpNum: document.getElementById('practiceMaxHpNum'),
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
    legacyClose: document.getElementById('legacyClose'),
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

  const gameEvents = (() => {
    const listeners = {};
    return {
      on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
      emit(event, payload) { (listeners[event] || []).forEach(fn => fn(payload)); },
    };
  })();

  let player = null;
  let player2 = null;
  let player3 = null;
  let player4 = null;
  let chosenCharacter2 = 'thorn_knight';
  let chosenCharacter3 = 'thorn_knight';
  let chosenCharacter4 = 'thorn_knight';
  let p1DeadInCoop = false;
  let p2DeadInCoop = false;
  let p3DeadInCoop = false;
  let p4DeadInCoop = false;
  let charSelectPhase = null; // null | 'p1' | 'p2' | 'p3' | 'p4'
  let mpPlayerCount = 2;
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
  let camera2 = { x: 0, y: 0 };
  let camera3 = { x: 0, y: 0 };
  let camera4 = { x: 0, y: 0 };
  const PLAYER_SLOT_CONFIG = [
    { id: 1, label: 'P1', color: '#ff8a8a', getEntity: () => player, setEntity: value => { player = value; }, getCharacter: () => chosenCharacter, setCharacter: value => { chosenCharacter = value; }, getDead: () => p1DeadInCoop, setDead: value => { p1DeadInCoop = !!value; }, getCamera: () => camera, setCamera: value => { camera = value; } },
    { id: 2, label: 'P2', color: '#4ca8ff', getEntity: () => player2, setEntity: value => { player2 = value; }, getCharacter: () => chosenCharacter2, setCharacter: value => { chosenCharacter2 = value; }, getDead: () => p2DeadInCoop, setDead: value => { p2DeadInCoop = !!value; }, getCamera: () => camera2, setCamera: value => { camera2 = value; } },
    { id: 3, label: 'P3', color: '#8aff8a', getEntity: () => player3, setEntity: value => { player3 = value; }, getCharacter: () => chosenCharacter3, setCharacter: value => { chosenCharacter3 = value; }, getDead: () => p3DeadInCoop, setDead: value => { p3DeadInCoop = !!value; }, getCamera: () => camera3, setCamera: value => { camera3 = value; } },
    { id: 4, label: 'P4', color: '#ffd080', getEntity: () => player4, setEntity: value => { player4 = value; }, getCharacter: () => chosenCharacter4, setCharacter: value => { chosenCharacter4 = value; }, getDead: () => p4DeadInCoop, setDead: value => { p4DeadInCoop = !!value; }, getCamera: () => camera4, setCamera: value => { camera4 = value; } },
  ];
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
  let lowHealthHitFlashUntil = 0;
  let dashKeyLatch = false;
  let playerDeathAnim = null;
  let runRevivesUsed = 0;
  let lastDeathEntryId = '';
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
  const SANDBOX_DEFAULT_SETTINGS = {
    enemyStatMultiplier: 1,
    enemySpeedMultiplier: 1,
    enemyDamageMultiplier: 1,
    playerDamageMultiplier: 1,
    startingCoins: 0,
    godMode: false,
    allowedEnemies: SANDBOX_ENEMY_TYPES.slice(),
    allowedItems: ITEM_KEYS.slice(),
  };
  let activeRun = null;
  let metaProgress = createDefaultMeta();
  window.addEventListener('achievement:unlocked', () => {
    metaProgress.loopCrystals = Number(metaProgress.loopCrystals || 0) + 1;
    persistMetaSoon();
    refreshMenuState();
  });
  let runHistory = [];
  let lastDamageSource = '';
  let lastDamageSourceKey = '';
  let savePendingTimer = 0;
  let metaSavePendingTimer = 0;
  let metaSaveDirty = false;
  let menuRefreshQueued = false;
  let frameId = 0;
  let minimapLayoutState = null;
  let itemStatsCacheFrame = -1;
  let itemStatsCacheValue = null;
  let godItemKeysCache = null;
  let lavaAnimTime = 0;
  let floorSkipPending = 0;
  const JESTER_PORTAL_ACTIVATE_DELAY = 0.44;
  const JESTER_PORTAL_TRIGGER_RADIUS = 42;
  const LADDER_TRIGGER_RADIUS = 64;
  let teleportKeyLatch = false;
  let ladderUseKeyLatch = false;
  let shopKeyLatch = false;
  let invKeyLatch = false;
  let anvilKeyLatch = false;
  let activeShopTab = 'items';
  let activeInvTab = 'stats';
  let activeInvPlayer = 1;
  let activeAnvilTab = 'weapons';
  let anvilSelectedItem = null;
  let anvilStagedUpgrades = {};
  let draggingMoveKey = '';
  let weaponBurstQueue = [];
  let rivals = [];
  let monsterRoamTimer = 0;
  let knaveKnightCutscenePlayed = false;
  let queenMetaoCutscenePlayed = false;
  let activeInventorySlot = '';
  let shopPanelDirty = false;
  let inventoryPanelDirty = false;
  let wizardPawSelection = null;
  let tutorialState = null;
  let sandboxSettings = { ...SANDBOX_DEFAULT_SETTINGS };
  const REPLAY_TUTORIAL_KEY = 'neonyke:replayTutorialNextRun';

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
    if (entity !== player) achievementEvents.emit('status:applied', { key });
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
    SPRITE_ATLAS = buildSpriteAtlas();
    ENV_TILE_ATLAS = buildEnvironmentTileAtlas();
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
      if (gameState === 'play' && key === 'k' && isFirstRunTutorialActive()) {
        event.preventDefault();
        skipFirstRunTutorial();
        return;
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
      if (key === ' ') ladderUseKeyLatch = false;
      if (key === inventoryKey) invKeyLatch = false;
    });
    uiController.bindMenuActions({
      _getChosenCharacter() {
        if (charSelectPhase === 'p2') return chosenCharacter2;
        if (charSelectPhase === 'p3') return chosenCharacter3;
        if (charSelectPhase === 'p4') return chosenCharacter4;
        return chosenCharacter;
      },
      onCharacterSelect(characterKey, button) {
        if (button.classList.contains('locked')) return;
        if (charSelectPhase === 'p2') { chosenCharacter2 = characterKey; }
        else if (charSelectPhase === 'p3') { chosenCharacter3 = characterKey; }
        else if (charSelectPhase === 'p4') { chosenCharacter4 = characterKey; }
        else { chosenCharacter = characterKey; metaProgress.selectedCharacter = chosenCharacter; persistMetaSoon(); }
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
        const opening = ui.challengePanel?.classList.contains('hidden');
        if (opening) uiController.setLegacyPanelOpen(false);
        uiController.setChallengePanelOpen(opening);
      },
      onToggleLegacy() {
        const opening = ui.legacyPanel?.classList.contains('hidden');
        if (opening) uiController.setChallengePanelOpen(false);
        uiController.setLegacyPanelOpen(opening);
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
      onOpenSandboxConfig() {
        uiController.setSandboxPanelOpen(true);
      },
      onCloseSandboxConfig() {
        uiController.setSandboxPanelOpen(false);
      },
      onSkipTutorial() {
        skipFirstRunTutorial();
      },
      onTutorialPrev() {
        navigateTutorialStep(-1);
      },
      onTutorialNext() {
        navigateTutorialStep(1);
      },
      onOpenCharacterSelect() { gameMode = 'normal'; setGameState('charselect'); },
      onCloseCharacterSelect() {
        const phases = ['p1','p2','p3','p4'].slice(0, mpPlayerCount);
        const cur = phases.indexOf(charSelectPhase);
        if (cur > 0) {
          charSelectPhase = phases[cur - 1];
          updateCharacterSelectionUI();
          return;
        }
        charSelectPhase = null;
        setGameState('menu');
      },
      onOpenAltModeCharSelect(mode) {
        gameMode = mode;
        if (mode === 'coop' || mode === 'pvp') {
          openMpLobby(mode);
        } else {
          charSelectPhase = null;
          setGameState('charselect');
          updateCharacterSelectionUI();
        }
      },
      onStartSandbox() {
        gameMode = 'sandbox';
        selectedDifficulty = 'easy';
        metaProgress.selectedDifficulty = selectedDifficulty;
        persistMetaSoon();
        setGameState('charselect');
      },
      onStartNew() {
        const phases = ['p1','p2','p3','p4'].slice(0, mpPlayerCount);
        const cur = phases.indexOf(charSelectPhase);
        if (cur >= 0 && cur < phases.length - 1) {
          charSelectPhase = phases[cur + 1];
          updateCharacterSelectionUI();
          return;
        }
        charSelectPhase = null;
        void startGame(false);
      },
      onContinue() { void startGame(true); },
      onDeleteRun() { void deleteSavedRun(); },
      onRerunFromHistory(entryId) {
        const entry = runHistory.find(e => e.id === entryId);
        if (!entry) return;
        gameMode = normalizeGameMode(entry.mode);
        chosenCharacter = entry.character || chosenCharacter;
        metaProgress.selectedCharacter = chosenCharacter;
        selectedDifficulty = normalizeDifficulty(entry.difficulty);
        metaProgress.selectedDifficulty = selectedDifficulty;
        selectedChallenges = normalizeRunHistoryChallengeKeys(entry);
        metaProgress.selectedChallenges = normalizeChallengeSelection(selectedChallenges);
        persistMetaSoon();
        if (ui.seed) ui.seed.value = entry.seed || '';
        uiController.setRunHistoryOpen(false);
        void startGame(false);
      },
    });
    uiController.bindRestartActions({
      onWinRestart() {
        if (ui.seed) ui.seed.value = baseSeedStr;
        void startGame(false);
      },
      onDeadAction(action) {
        if (action === 'menu') {
          gameMode = 'normal';
          resetMultiplayerState();
          setGameState('menu');
          refreshMenuState();
          return;
        }
        if (action === 'revive') {
          reviveFromDeath();
          return;
        }
        if (action === 'retry-new') {
          if (ui.seed) ui.seed.value = '';
          baseSeedStr = createRandomSeed();
          void startGame(false);
          return;
        }
        if (ui.seed) ui.seed.value = baseSeedStr;
        void startGame(false);
      },
    });

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
      if (metaSavePendingTimer) {
        clearTimeout(metaSavePendingTimer);
        metaSavePendingTimer = 0;
      }
      if (metaSaveDirty) {
        metaSaveDirty = false;
        saveStore.put('meta', metaProgress);
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
    ui.invPlayerTabBtns.forEach(tab => {
      tab.addEventListener('click', () => {
        activeInvPlayer = Number(tab.dataset.invPlayer) || 1;
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
      const isCoop = gameMode === 'coop' && (player2 || player3 || player4);
      if (ui.invPlayerTabs) ui.invPlayerTabs.classList.toggle('hidden', !isCoop);
      if (isCoop) updateInvPlayerTabVisibility();
      markInventoryPanelDirty();
      renderInventoryPanel();
    }
  }

  function updateInvPlayerTabVisibility() {
    const players = [player, player2, player3, player4];
    const dead = [false, p2DeadInCoop, p3DeadInCoop, p4DeadInCoop];
    ui.invPlayerTabBtns.forEach(tab => {
      const n = Number(tab.dataset.invPlayer);
      const exists = !!players[n - 1];
      tab.classList.toggle('hidden', !exists);
      tab.classList.toggle('active', n === activeInvPlayer);
      tab.classList.toggle('inv-player-dead', dead[n - 1]);
    });
    // If selected player no longer exists, fall back to P1
    const players2 = [player, player2, player3, player4];
    if (!players2[activeInvPlayer - 1]) activeInvPlayer = 1;
  }

  function toggleShopPanel() {
    if (currentRoom?.type !== 'shop') return;
    const next = !isPanelOpen(ui.shopPanel);
    setShopPanelOpen(next);
    if (next && isFirstRunTutorialActive()) tutorialState.openedShop = true;
    if (next) setInventoryPanelOpen(false);
  }

  function toggleInventoryPanel() {
    const next = !isPanelOpen(ui.invPanel);
    setInventoryPanelOpen(next);
    if (next && isFirstRunTutorialActive()) tutorialState.openedInventory = true;
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
      const shopRandom = createRoomRandom(currentRoom, 'shop:move-offers');
      const seen = new Set(Object.keys(player?.ownedMoves || {}));
      const allowedCharacter = player?.character || chosenCharacter;
      const pool = SHOP_MOVE_POOL.filter(key => key !== 'god_sweep' && !seen.has(key) && isMoveAllowedForCharacter(key, allowedCharacter));
      const shuffledPool = shuffleWithRandom(pool, shopRandom);
      const offers = shuffledPool.slice(0, 4).map((moveKey, index) => ({
        type: 'move',
        key: moveKey,
        bought: false,
        cost: getShopMoveCost(index),
      }));
      if (isGodSweepUnlocked() && !seen.has('god_sweep') && shopRandom() < 0.12) {
        const insertIndex = Math.min(offers.length, Math.floor(shopRandom() * (Math.min(offers.length, 3) + 1)));
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
      const shopRandom = createRoomRandom(currentRoom, 'shop:weapon-offers');
      const owned = new Set(Object.keys(player?.ownedWeapons || {}).filter(key => player?.ownedWeapons?.[key]));
      const pool = [];
      if (floor >= 1) pool.push(...WHITE_WEAPON_POOL);
      if (floor >= 4) pool.push(...PURPLE_WEAPON_POOL);
      if (floor >= 7) pool.push(...RED_WEAPON_POOL);
      const filtered = pool.filter(key => !owned.has(key));
      const shuffledFiltered = shuffleWithRandom(filtered, shopRandom);
      const offers = shuffledFiltered.slice(0, 3).map((weaponKey, index) => ({
        type: 'weapon',
        key: weaponKey,
        bought: false,
        cost: getShopWeaponCost(WEAPON_DEFS[weaponKey]?.rarity || 'knight', index, floor, selectedDifficulty, weaponKey),
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
      { id: 'small', name: 'Minor Heal', heal: scalePotionHealing(45, 24), cost: getShopHealCost('small') },
      { id: 'major', name: 'Major Heal', heal: scalePotionHealing(100, 52), cost: getShopHealCost('major') },
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

    // Resolve which player to display
    const _invPlayers = [player, player2, player3, player4];
    const _invP = _invPlayers[activeInvPlayer - 1] || player;

    if (gameMode === 'coop' && (player2 || player3 || player4)) updateInvPlayerTabVisibility();

    ui.invTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.invTab === activeInvTab);
    });
    const tabPanels = { stats: 'invTabStats', items: 'invTabItems', weapons: 'invTabWeapons', equipped: 'invTabEquipped' };
    Object.entries(tabPanels).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', key !== activeInvTab);
    });

    const stats = getItemStats();
    const hpPct = Math.round(_invP.hp) / Math.round(_invP.maxHp);
    const hpColor = hpPct > 0.6 ? '#6dde88' : hpPct > 0.3 ? '#f5c842' : '#ff6b6b';
    const critPct = Math.round(stats.critChance * 100);
    const critColor = critPct >= 30 ? '#f5a623' : critPct >= 10 ? '#e8f4ff' : '#8ca8c0';
    const atkSpeed = getAttackSpeedValue();
    const atkSpeedColor = atkSpeed >= 2 ? '#6dde88' : atkSpeed >= 1.2 ? '#e8f4ff' : '#8ca8c0';
    const dmgReduction = Math.round(stats.damageReduction * 100);
    ui.invStats.innerHTML = [
      `<div class="inv-stat-row inv-stat-row--bar"><div class="inv-stat-row__icon inv-stat-row__icon--hp">♥</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">HP</span><span class="inv-stat-row__value" style="color:${hpColor}">${Math.round(_invP.hp)} <span class="inv-stat-row__sub">/ ${Math.round(_invP.maxHp)}</span></span></div><div class="inv-stat-row__bar"><div class="inv-stat-row__bar-fill" style="width:${Math.round(hpPct*100)}%;background:${hpColor}"></div></div></div>`,
      `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--atk">⚔</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Attack Power</span><span class="inv-stat-row__value">${_invP.attackPower}</span></div></div>`,
      `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--spd">⚡</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Attack Speed</span><span class="inv-stat-row__value" style="color:${atkSpeedColor}">${atkSpeed.toFixed(2)}x</span></div></div>`,
      `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--crit">◎</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Crit Chance</span><span class="inv-stat-row__value" style="color:${critColor}">${critPct}%</span></div></div>`,
      dmgReduction > 0 ? `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--def">⛨</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Damage Reduction</span><span class="inv-stat-row__value" style="color:#6dde88">${dmgReduction}%</span></div></div>` : '',
      stats.bleedChance > 0 ? `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--bleed">✦</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Bleed Chance</span><span class="inv-stat-row__value" style="color:#e05c5c">${Math.round(stats.bleedChance * 100)}%</span></div></div>` : '',
    ].join('');

    ui.invItemsList.innerHTML = ITEM_KEYS
      .filter(key => Number(_invP.items?.[key] || 0) > 0)
      .map(key => {
        const item = itemRegistry.get(key);
        return `<div class="inv-card">
          <span class="inv-card__eyebrow">Relic</span>
          <div class="inv-card__title-row">
            <canvas class="inv-card__icon" data-item-icon="${key}" width="30" height="30"></canvas>
            <h4 style="color:${getRarityNameColor(item?.rarity || item?.category)}">${item?.name || key}</h4>
            <span class="inv-card__count">x${_invP.items[key]}</span>
          </div>
          <p>${item?.description || 'No item description available.'}</p>
        </div>`;
      })
      .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No relics yet</h4><p>Your pockets are clear. Loot rooms or buy from the shop to start a build.</p></div>';

    ui.invItemsList.querySelectorAll('[data-item-icon]').forEach(canvas => {
      drawItemToastIcon(canvas, itemRegistry.get(canvas.dataset.itemIcon) || ITEM_DEFS[canvas.dataset.itemIcon]);
    });

    const ownedWeapons = WEAPON_KEYS
      .filter(key => _invP.ownedWeapons?.[key])
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
          const equipped = _invP.equippedWeapon === key;
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

    const equippedMoveKeys = new Set(Object.values(_invP.equippedMoves || {}).filter(Boolean));
    const allOwnedMoves = Object.keys(_invP.ownedMoves || {})
      .filter(key => _invP.ownedMoves[key] && MOVE_DEFS[key] && isMoveAllowedForCharacter(key, _invP.character))
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
      const moveKey = _invP.equippedMoves?.[slot];
      const def = MOVE_DEFS[moveKey];
      const isSelected = activeInventorySlot === slot;
      node.dataset.move = moveKey || '';
      node.dataset.slotType = slot;
      node.draggable = !!moveKey;
      node.classList.toggle('is-equipped', !!moveKey);
      node.classList.toggle('is-selected', isSelected);
      const slotLabel = SLOT_LABELS[slot] || slot;
      const slotKey = getSlotKeyLabel(slot);
      const iconHtml = moveKey ? `<canvas class="inv-slot__icon" data-move-icon="${moveKey}" width="36" height="36"></canvas>` : `<div class="inv-slot__icon inv-slot__icon--empty"></div>`;
      node.innerHTML = `<div class="inv-slot__top"><span class="inv-slot__kicker">${slotLabel}</span><div class="inv-slot__top-right">${slotKey ? `<span class="inv-slot__key">${slotKey}</span>` : ''}<span class="inv-slot__status">${isSelected ? 'Selected' : (def ? 'Equipped' : 'Empty')}</span></div></div><div class="inv-slot__main">${iconHtml}<div class="inv-slot__move-wrap"><div class="inv-slot__move">${def?.name || 'No move equipped'}</div><p class="inv-slot__hint">${isSelected ? 'Matching spare moves highlighted below. Click or drag to swap.' : def?.desc || 'Click to see moves that can go here.'}</p></div></div>`;
    });
    ui.invSlots && Object.values(ui.invSlots).forEach(node => {
      node.querySelectorAll('[data-move-icon]').forEach(canvas => {
        drawMoveToastIcon(canvas, MOVE_DEFS[canvas.dataset.moveIcon]);
      });
    });
    if (ui.invWeaponSlot) {
      const weapon = WEAPON_DEFS[_invP.equippedWeapon];
      ui.invWeaponSlot.dataset.rarity = weapon?.rarity || '';
      const wIconHtml = weapon ? `<canvas class="inv-slot__icon" data-weapon-icon="${_invP.equippedWeapon}" width="36" height="36"></canvas>` : `<div class="inv-slot__icon inv-slot__icon--empty">⚔️</div>`;
      ui.invWeaponSlot.innerHTML = `<div class="inv-slot__top"><span class="inv-slot__kicker">weapon</span><span class="inv-slot__status">${weapon ? 'Equipped Now' : 'No Weapon'}</span></div><div class="inv-slot__main">${wIconHtml}<div class="inv-slot__move-wrap"><div class="inv-slot__move" style="color:${getRarityNameColor(weapon?.rarity)}">${weapon?.name || 'Default Melee Active'}</div><p class="inv-slot__hint">${weapon ? `${weapon.description} Click to unequip.` : 'Open Weapons tab and click a weapon to equip it.'}</p></div></div>`;
      ui.invWeaponSlot.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
        drawWeaponToastIcon(canvas, WEAPON_DEFS[canvas.dataset.weaponIcon]);
      });
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
      achievementEvents.emit('shop:bought');
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
      achievementEvents.emit('shop:bought');
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
      achievementEvents.emit('shop:bought');
    } else if (kind === 'heal') {
      const heal = Number(button.dataset.heal || 0);
      const cost = Number(button.dataset.cost || 0);
      if (!heal || !cost) return;
      if (!spendCoins(cost)) return;
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      const gained = player.hp - before;
      if (gained > 0) spawnHealPopup(player.x + rand(-10, 10), player.y - 20, gained);
      if (gained > 0) achievementEvents.emit('heal:applied', { amount: gained });
      achievementEvents.emit('shop:bought');
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
    document.body.classList.add('game-paused');
    setGameState('pause');
  }

  function resumeGame() {
    document.body.classList.remove('game-paused');
    setGameState('play');
  }

  function createDefaultMeta() {
    return {
      coins: 0,
      bestFloor: 1,
      bestKills: 0,
      bestLevel: 1,
      bestTime: 0,
      bestCoins: 0,
      unlockedItems: [],
      unlockedCharacters: ['princess', 'thorn_knight', 'metao'],
      unlockedChallenges: [],
      selectedDifficulty: 'easy',
      selectedChallenges: [],
      selectedCharacter: 'thorn_knight',
      godsKilled: 0,
      loopCrystals: 0,
      unlockedLegacy: [],
      tutorialCompleted: false,
      sandboxSettings: { ...SANDBOX_DEFAULT_SETTINGS },
    };
  }

  function normalizeSandboxSettings(input) {
    const source = input && typeof input === 'object' ? input : {};
    const allowedEnemies = Array.isArray(source.allowedEnemies)
      ? SANDBOX_ENEMY_TYPES.filter(type => source.allowedEnemies.includes(type))
      : SANDBOX_ENEMY_TYPES.slice();
    const allowedItems = Array.isArray(source.allowedItems)
      ? ITEM_KEYS.filter(key => source.allowedItems.includes(key))
      : ITEM_KEYS.slice();
    return {
      enemyStatMultiplier: Math.max(0.2, Math.min(4, Number(source.enemyStatMultiplier ?? SANDBOX_DEFAULT_SETTINGS.enemyStatMultiplier) || 1)),
      enemySpeedMultiplier: Math.max(0.2, Math.min(3, Number(source.enemySpeedMultiplier ?? SANDBOX_DEFAULT_SETTINGS.enemySpeedMultiplier) || 1)),
      enemyDamageMultiplier: Math.max(0.1, Math.min(3, Number(source.enemyDamageMultiplier ?? SANDBOX_DEFAULT_SETTINGS.enemyDamageMultiplier) || 1)),
      playerDamageMultiplier: Math.max(0.1, Math.min(6, Number(source.playerDamageMultiplier ?? SANDBOX_DEFAULT_SETTINGS.playerDamageMultiplier) || 1)),
      startingCoins: Math.max(0, Math.min(999, Math.round(Number(source.startingCoins ?? SANDBOX_DEFAULT_SETTINGS.startingCoins) || 0))),
      godMode: !!source.godMode,
      allowedEnemies: allowedEnemies.length ? allowedEnemies : SANDBOX_ENEMY_TYPES.slice(0, 1),
      allowedItems: allowedItems.length ? allowedItems : ITEM_KEYS.slice(),
    };
  }

  function isSandboxRunActive() {
    return gameMode === 'sandbox';
  }

  function getActiveSandboxSettings() {
    return isSandboxRunActive() ? sandboxSettings : null;
  }

  function createDefaultTutorialState() {
    return {
      active: false,
      step: 'move',
      manualStepLockUntil: 0,
      dummySpawned: false,
      moved: false,
      gotKill: false,
      gotRelic: false,
      openedInventory: false,
      openedShop: false,
      usedLadder: false,
    };
  }

  function resetTutorialState(active = false) {
    tutorialState = createDefaultTutorialState();
    tutorialState.active = !!active;
  }

  function isFirstRunTutorialActive() {
    return !!tutorialState?.active && gameMode === 'normal' && gameState === 'play';
  }

  function consumeReplayTutorialRequest() {
    let requested = false;
    try {
      requested = localStorage.getItem(REPLAY_TUTORIAL_KEY) === '1';
      if (requested) localStorage.removeItem(REPLAY_TUTORIAL_KEY);
    } catch {}
    return requested;
  }

  function formatControlLabel(value, fallback = '') {
    const key = String(value || fallback || '').toLowerCase();
    if (!key) return '';
    if (key === ' ') return 'Space';
    if (key === 'lmb') return 'LMB';
    if (key === 'rmb') return 'RMB';
    if (key === 'shift') return 'Shift';
    if (key === 'arrowup') return 'ArrowUp';
    if (key === 'arrowdown') return 'ArrowDown';
    if (key === 'arrowleft') return 'ArrowLeft';
    if (key === 'arrowright') return 'ArrowRight';
    if (key === 'control') return 'Ctrl';
    return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
  }

  function getControlHint(action, fallback) {
    const bindings = window.NeoSettings?.getBindings?.() || {};
    return formatControlLabel(bindings[action], fallback);
  }

  function getMovementControlHint() {
    const up = getControlHint('up', 'w');
    const left = getControlHint('left', 'a');
    const down = getControlHint('down', 's');
    const right = getControlHint('right', 'd');
    return `${up}/${left}/${down}/${right}`;
  }

  function ensureTutorialDummyEnemy() {
    if (!isFirstRunTutorialActive() || tutorialState.gotKill) return;
    if (tutorialState.step !== 'fight') return;
    if (!currentRoom || ['boss', 'god', 'shop', 'anvil', 'challenge'].includes(currentRoom.type)) return;
    if (tutorialState.dummySpawned || enemies.some(enemy => enemy?.tutorialDummy)) return;
    // Force a fair tutorial duel by clearing the normal room wave for this step.
    if (enemies.length > 0) {
      enemies = enemies.filter(enemy => enemy?.type === 'rival');
      syncCurrentRoomState();
    }
    const safeSpawn = findSafeEnemySpawnPoint(player.x + 110, player.y, 15)
      || findSafeEnemySpawnPoint(player.x - 110, player.y, 15)
      || findSafeEnemySpawnPoint(player.x, player.y - 90, 15)
      || findSafeEnemySpawnPoint(ROOM_W / 2 + 130, ROOM_H / 2, 15)
      || { x: clamp(player.x + 80, WALL + 22, ROOM_W - WALL - 22), y: clamp(player.y - 40, WALL + 22, ROOM_H - WALL - 22) };
    const dummy = spawnEnemy('hunter', safeSpawn.x, safeSpawn.y, false);
    dummy.tutorialDummy = true;
    dummy.hp = 16;
    dummy.max = 16;
    dummy.speed = 42;
    dummy.dmg = 1;
    dummy.attackCd = 2.8;
    dummy.spawnT = 0.18;
    dummy.barrier = 0;
    tutorialState.dummySpawned = true;
    particles.push({ x: dummy.x, y: dummy.y - 24, life: 1.4, text: 'TRAINING DUMMY', c: '#8dd4ff' });
    particles.push({ x: player.x, y: player.y - 30, life: 1.1, text: 'DUMMY SPAWNED', c: '#9ce9ff' });
  }

  function getTutorialStepOrder() {
    return ['move', 'fight', 'relic', 'panel', 'ladder'];
  }

  function navigateTutorialStep(direction = 1) {
    if (!isFirstRunTutorialActive()) return;
    const order = getTutorialStepOrder();
    const current = order.indexOf(tutorialState.step);
    const nextIndex = clamp((current >= 0 ? current : 0) + direction, 0, order.length - 1);
    tutorialState.step = order[nextIndex];
    tutorialState.manualStepLockUntil = Number(gameElapsedTime || 0) + 0.65;
    if (tutorialState.step === 'fight') ensureTutorialDummyEnemy();
    updateObjective();
  }

  function getTutorialStepMessage() {
    if (!isFirstRunTutorialActive()) return '';
    const moveHint = getMovementControlHint();
    const slashHint = getControlHint('slash', 'lmb');
    const laserHint = getControlHint('laser', 'rmb');
    const smashHint = getControlHint('smash', 'r');
    const inventoryHint = getControlHint('inventory', 'i');
    const shopHint = formatControlLabel('e', 'e');
    const ladderHint = formatControlLabel('space', 'space');
    if (tutorialState.step === 'move') return `Tutorial: Move with ${moveHint}.`;
    if (tutorialState.step === 'fight') return `Tutorial: Defeat the training dummy using ${slashHint}, ${laserHint}, or ${smashHint}.`;
    if (tutorialState.step === 'relic') return 'Tutorial: Pick up your first relic drop.';
    if (tutorialState.step === 'panel') return `Tutorial: Press ${inventoryHint} to open Inventory. In shop rooms, press ${shopHint} to open the shop.`;
    if (currentRoom?.type === 'ladder' && currentRoom?.cleared) return `Tutorial: Stand on the ladder and press ${ladderHint} to go to the next floor.`;
    if (currentRoom?.type === 'ladder') return 'Tutorial: Clear this ladder room, then use the ladder.';
    return 'Tutorial: Find the ladder room and continue to the next floor.';
  }

  function getTutorialObjectiveEntries() {
    if (!isFirstRunTutorialActive()) return [];
    const moveHint = getMovementControlHint();
    const slashHint = getControlHint('slash', 'lmb');
    const laserHint = getControlHint('laser', 'rmb');
    const inventoryHint = getControlHint('inventory', 'i');
    const shopHint = formatControlLabel('e', 'e');
    const ladderHint = formatControlLabel('space', 'space');
    return [
      { text: `Move (${moveHint})`, state: tutorialState.moved ? 'done' : 'todo' },
      { text: `Defeat training dummy (${slashHint}/${laserHint})`, state: tutorialState.gotKill ? 'done' : 'todo' },
      { text: 'Pick up one relic', state: tutorialState.gotRelic ? 'done' : 'todo' },
      { text: `Open Inventory (${inventoryHint}) or Shop (${shopHint} in shop room)`, state: (tutorialState.openedInventory || tutorialState.openedShop) ? 'done' : 'todo' },
      { text: `Use ladder: stand on it and press ${ladderHint}`, state: tutorialState.usedLadder ? 'done' : 'todo' },
    ];
  }

  function skipFirstRunTutorial() {
    if (!isFirstRunTutorialActive()) return;
    tutorialState.active = false;
    tutorialState.usedLadder = true;
    metaProgress.tutorialCompleted = true;
    persistMetaSoon();
    particles.push({ x: player.x, y: player.y - 26, life: 0.9, text: 'TUTORIAL SKIPPED', c: '#9cdcff' });
    uiController.setTutorialBanner('', false);
    updateObjective();
  }

  function updateFirstRunTutorialProgress() {
    if (!isFirstRunTutorialActive()) return;
    ensureTutorialDummyEnemy();
    if (Number(tutorialState.manualStepLockUntil || 0) > Number(gameElapsedTime || 0)) return;
    if (!tutorialState.moved && Math.hypot(player?.vx || 0, player?.vy || 0) > 24) tutorialState.moved = true;
    if (!tutorialState.gotKill && Number(player?.kills || 0) > 0) tutorialState.gotKill = true;
    if (tutorialState.step === 'move' && tutorialState.moved) tutorialState.step = 'fight';
    if (tutorialState.step === 'fight' && tutorialState.gotKill) tutorialState.step = 'relic';
    if (tutorialState.step === 'relic' && tutorialState.gotRelic) tutorialState.step = 'panel';
    if (tutorialState.step === 'panel' && (tutorialState.openedInventory || tutorialState.openedShop)) tutorialState.step = 'ladder';
    if (!tutorialState.usedLadder && floor > 1) tutorialState.usedLadder = true;
    if (tutorialState.usedLadder) {
      tutorialState.active = false;
      if (!metaProgress.tutorialCompleted) {
        metaProgress.tutorialCompleted = true;
        persistMetaSoon();
      }
      particles.push({ x: player.x, y: player.y - 26, life: 1, text: 'TUTORIAL COMPLETE', c: '#8dffcf' });
    }
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
      anchor_charm: 0,
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
      stun: 0,
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
      rivalReputation: 0,
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
      syncMetaRecordsFromRunHistory();
      activeRun = savedRun && typeof savedRun === 'object' ? savedRun : null;
      if (activeRun) {
        activeRun.mode = normalizeGameMode(activeRun.mode);
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
      sandboxSettings = normalizeSandboxSettings(savedMeta?.sandboxSettings);
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

  function isSplitScreen() {
    return (gameMode === 'coop' || gameMode === 'pvp') && !!player2 && mpPlayerCount >= 2;
  }

  function isMultiplayerMode() {
    return gameMode === 'coop' || gameMode === 'pvp';
  }

  function getPlayerSlot(id) {
    return PLAYER_SLOT_CONFIG[id - 1] || null;
  }

  function getPlayerSlots({ includeInactive = false, includeDead = true } = {}) {
    return PLAYER_SLOT_CONFIG
      .filter(slot => includeInactive || !!slot.getEntity())
      .filter(slot => includeDead || !slot.getDead());
  }

  function getActivePlayerSlots() {
    if (!isMultiplayerMode()) return player ? [PLAYER_SLOT_CONFIG[0]] : [];
    return getPlayerSlots({ includeInactive: false, includeDead: true })
      .filter(slot => slot.id <= Math.max(1, mpPlayerCount));
  }

  function getLivePlayerSlots() {
    return getActivePlayerSlots().filter(slot => !slot.getDead());
  }

  function getSlotByEntity(entity) {
    return getActivePlayerSlots().find(slot => slot.getEntity() === entity) || null;
  }

  function setSlotDead(slotOrId, dead) {
    const slot = typeof slotOrId === 'number' ? getPlayerSlot(slotOrId) : slotOrId;
    if (!slot) return;
    slot.setDead(dead);
  }

  function resetMultiplayerState() {
    PLAYER_SLOT_CONFIG.forEach(slot => {
      if (slot.id > 1) slot.setEntity(null);
      slot.setDead(false);
    });
    pvpState = null;
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = 'none';
    closeMpLobby();
  }

  function invalidateRunStatCaches() {
    itemStatsCacheFrame = -1;
    itemStatsCacheValue = null;
    godItemKeysCache = null;
  }

  function splitPlayerCount() {
    if (gameState !== 'play') return 0;
    return getActivePlayerSlots().length;
  }

  function openMpLobby(mode) {
    gameMode = mode;
    const titleEl = document.getElementById('mpLobbyTitle');
    const hintEl = document.getElementById('mpLobbyHint');
    if (titleEl) titleEl.textContent = mode === 'pvp' ? 'PVP' : 'CO-OP';
    if (hintEl) {
      if (mode === 'pvp') hintEl.textContent = 'First to 3 kills wins. Melee your opponent to score.';
      else hintEl.textContent = 'P1: WASD + Mouse / Gamepad 1  ·  P2: IJKL + U/; / Gamepad 2';
    }
    const lobby = document.getElementById('mpLobby');
    if (lobby) lobby.classList.remove('hidden');
  }

  function closeMpLobby() {
    const lobby = document.getElementById('mpLobby');
    if (lobby) lobby.classList.add('hidden');
  }

  function normalizeGameMode(input) {
    const mode = String(input || 'normal').toLowerCase();
    if (mode === 'endless' || mode === 'practice' || mode === 'boss_rush' || mode === 'sandbox' || mode === 'coop' || mode === 'pvp') return mode;
    return 'normal';
  }

  function getRunModeLabel(mode) {
    if (mode === 'coop') return 'Co-op';
    if (mode === 'pvp') return 'PVP';
    if (mode === 'endless') return 'Endless';
    if (mode === 'practice') return 'Practice';
    if (mode === 'boss_rush') return 'Boss Rush';
    if (mode === 'sandbox') return 'Sandbox';
    return 'Normal';
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
      .map(entry => {
        const challengeKeys = normalizeRunHistoryChallengeKeys(entry);
        return {
          id: String(entry.id || `${entry.endedAt || 'run'}:${entry.seed || ''}:${entry.floor || 0}`),
          endedAt: String(entry.endedAt || ''),
          result: entry.result === 'win' ? 'win' : 'dead',
          mode: normalizeGameMode(entry.mode),
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
          killerKey: String(entry.killerKey || ''),
          challengeBonusCrystals: Math.max(0, Number(entry.challengeBonusCrystals || 0)),
          totalItemStacks: Math.max(0, Number(entry.totalItemStacks || 0)),
          challengeKeys,
          challenges: challengeKeys.map(key => CHALLENGE_DEFS[key]?.name || titleCase(key)),
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
        };
      });
  }

  function normalizeRunHistoryChallengeKeys(entry) {
    if (!entry || typeof entry !== 'object') return [];
    if (Array.isArray(entry.challengeKeys)) return normalizeChallengeSelection(entry.challengeKeys);
    const byLabel = new Map(Object.entries(CHALLENGE_DEFS).map(([key, def]) => [
      String(def?.name || titleCase(key)).toLowerCase(),
      key,
    ]));
    const legacy = Array.isArray(entry.challenges) ? entry.challenges : [];
    return normalizeChallengeSelection(legacy.map(value => {
      const text = String(value || '');
      return CHALLENGE_DEFS[text] ? text : byLabel.get(text.toLowerCase()) || text;
    }));
  }

  function deriveRunRecords(entries, fallback = {}) {
    const records = {
      floor: Math.max(1, Number(fallback.bestFloor || 1)),
      kills: Math.max(0, Number(fallback.bestKills || 0)),
      level: Math.max(1, Number(fallback.bestLevel || 1)),
      time: Math.max(0, Number(fallback.bestTime || 0)),
      coins: Math.max(0, Number(fallback.bestCoins || 0)),
    };
    normalizeRunHistory(entries).forEach(entry => {
      records.floor = Math.max(records.floor, Number(entry.floor || 1));
      records.kills = Math.max(records.kills, Number(entry.kills || 0));
      records.level = Math.max(records.level, Number(entry.level || 1));
      records.time = Math.max(records.time, Number(entry.elapsedSeconds || 0));
      records.coins = Math.max(records.coins, Number(entry.coins || 0));
    });
    return records;
  }

  function syncMetaRecordsFromRunHistory() {
    const records = deriveRunRecords(runHistory, metaProgress);
    metaProgress.bestFloor = records.floor;
    metaProgress.bestKills = records.kills;
    metaProgress.bestLevel = records.level;
    metaProgress.bestTime = records.time;
    metaProgress.bestCoins = records.coins;
    return records;
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

  function createScopedRandom(scope) {
    const stream = createRngStream(`${getFloorSeed()}|${scope}`);
    return () => stream.next();
  }

  function createRandomFromSeed(seed) {
    const stream = createRngStream(seed);
    return () => stream.next();
  }

  function createRoomRandom(room, scope) {
    const gx = Number.isFinite(room?.gx) ? room.gx : 'x';
    const gy = Number.isFinite(room?.gy) ? room.gy : 'y';
    const type = room?.type || 'room';
    return createScopedRandom(`room:${gx},${gy}|type:${type}|${scope}`);
  }

  function createEntityRandom(entity, scope) {
    const roomPart = currentRoom
      ? `room:${currentRoom.gx},${currentRoom.gy}|type:${currentRoom.type || 'room'}`
      : 'room:none';
    const entityPart = `${entity?.kind || entity?.type || 'entity'}:${Math.round(Number(entity?.x || 0))},${Math.round(Number(entity?.y || 0))}`;
    return createScopedRandom(`${roomPart}|${entityPart}|${scope}`);
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

  function getDifficultyRuntimeConfig(key = selectedDifficulty) {
    const difficulty = getDifficultyDef(key);
    const statPressure = clamp((Number(difficulty?.statMultiplier || 1) - 1) / 0.52, 0, 1);
    const roomPressure = clamp(Number(difficulty?.roomWeightBonus || 0) / 0.22, 0, 1);
    const economyPressure = clamp((Number(difficulty?.shopPriceMultiplier || 1) - 1) / 0.42, 0, 1);
    return {
      key: String(difficulty?.key || normalizeDifficulty(key)),
      eventCheckIntervalMultiplier: 1 - roomPressure * 0.18,
      eventChanceMultiplier: 1 + roomPressure * 0.26,
      eventTimerMultiplier: 1 - statPressure * 0.22,
      eventPenaltyMultiplier: 1 + statPressure * 0.38,
      challengeTimerMultiplier: 1 - roomPressure * 0.2,
      potionHealMultiplier: 1 - statPressure * 0.16,
      coinRewardMultiplier: 1 + economyPressure * 0.24,
      xpRewardMultiplier: 1 + statPressure * 0.16,
      bribeCostMultiplier: 1 + economyPressure * 0.22,
      memoryMatchMaxFlips: Math.max(2, 6 - Math.round(statPressure * 2)),
    };
  }

  function getRunDifficultyScalars() {
    const config = getDifficultyRuntimeConfig();
    return {
      challengeTimerMultiplier: Number(config.challengeTimerMultiplier || 1),
      potionHealMultiplier: Number(config.potionHealMultiplier || 1),
      coinRewardMultiplier: Number(config.coinRewardMultiplier || 1),
      xpRewardMultiplier: Number(config.xpRewardMultiplier || 1),
    };
  }

  function scaleChallengeTimer(baseSeconds) {
    const scaledSeconds = Math.round(Number(baseSeconds || 0) * getRunDifficultyScalars().challengeTimerMultiplier);
    return Math.max(6, scaledSeconds);
  }

  function scalePotionHealing(baseAmount, minimumAmount = 1) {
    const scaledAmount = Math.round(Number(baseAmount || 0) * getRunDifficultyScalars().potionHealMultiplier);
    return Math.max(Number(minimumAmount || 0), scaledAmount);
  }

  function getPotionHealAmount() {
    return scalePotionHealing(40, 24);
  }

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'DIFFICULTY_CONFIG', {
      configurable: true,
      get() {
        return getDifficultyRuntimeConfig();
      },
    });
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

  function getShopWeaponCost(rarity = 'knight', weaponIndex = 0, floorValue = floor, difficultyKey = selectedDifficulty, weaponKey = '') {
    if (rarity === 'god' || rarity === 'red') {
      let baseCost = (180 + floorValue * 14 + weaponIndex * 10) * 3;
      if (String(weaponKey || '').toLowerCase() === 'excalibur') baseCost = Math.round(baseCost * 1.25);
      return scaleShopPrice(baseCost, difficultyKey);
    }
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
        offer.cost = getShopWeaponCost(rarity, index, floorValue, difficultyKey, offer.key);
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

  function normalizeDeathQuoteKey(source) {
    const value = String(source || '').trim().toLowerCase();
    if (!value) return 'unknown';
    return value
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function getKillerDeathQuote(sourceKey) {
    const exact = normalizeDeathQuoteKey(sourceKey);
    const pool = KILLER_DEATH_QUOTES[exact] || DEFAULT_KILLER_DEATH_QUOTES;
    if (!Array.isArray(pool) || pool.length === 0) return '';
    const index = Math.floor(nextRandom('fx') * pool.length);
    return pool[index] || pool[0] || '';
  }

  function findKillerEnemyEntity(sourceKey, sourceLabel) {
    const key = String(sourceKey || '').trim().toLowerCase();
    const label = String(sourceLabel || '').trim().toLowerCase();
    if (!Array.isArray(enemies) || enemies.length === 0) return null;

    const byType = enemies.find(enemy => String(enemy?.type || '').toLowerCase() === key);
    if (byType) return byType;

    const byRivalName = enemies.find(enemy => enemy?.type === 'rival' && String(enemy?.rivalData?.name || '').trim().toLowerCase() === key);
    if (byRivalName) return byRivalName;

    const byLabel = enemies.find(enemy => String(getDamageSourceLabel(enemy?.type || '') || '').trim().toLowerCase() === label);
    if (byLabel) return byLabel;
    return null;
  }

  function speakKillerDeathQuote(sourceKeyInput = '', sourceLabelInput = '') {
    const sourceKey = sourceKeyInput || lastDamageSourceKey || '';
    const sourceLabel = sourceLabelInput || lastDamageSource || getDamageSourceLabel(sourceKey) || 'DUNGEON';
    const quote = getKillerDeathQuote(sourceKey || sourceLabel);
    if (!quote || !player) return;

    const killer = findKillerEnemyEntity(sourceKey, sourceLabel);
    if (killer) {
      sayOverEntity(killer, quote, {
        speaker: sourceLabel,
        tone: 'boss',
        holdTime: 2.1,
        offsetY: (killer.r || 16) + 32,
      });
      return;
    }

    sayAtPosition(player.x, player.y, quote, {
      speaker: sourceLabel,
      tone: 'warning',
      holdTime: 2.1,
      offsetY: 56,
    });
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

  function getItemRarityCounts(playerState = player) {
    const counts = { white: 0, purple: 0, red: 0 };
    ITEM_KEYS.forEach(key => {
      const count = Math.max(0, Number(playerState?.items?.[key] || 0));
      if (count <= 0) return;
      const rarity = String(itemRegistry.get(key)?.rarity || ITEM_DEFS[key]?.rarity || 'knight').toLowerCase();
      if (rarity === 'god' || rarity === 'red') counts.red += count;
      else if (rarity === 'wizard' || rarity === 'purple') counts.purple += count;
      else counts.white += count;
    });
    return counts;
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
      mode: normalizeGameMode(gameMode),
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
      challengeKeys: normalizeChallengeSelection(selectedChallenges),
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
    const modeLabel = getRunModeLabel(entry.mode);
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
        <span class="rh-row-sub">${escapeHtml(modeLabel)} · Fl.${entry.floor} · ${escapeHtml(cause)} · ${escapeHtml(formatRunEndedAt(entry.endedAt))}</span>
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
        <span class="rh-hero-meta">${escapeHtml(entry.difficultyName)} · ${escapeHtml(getRunModeLabel(entry.mode))} · Floor ${entry.floor} · Loop ${entry.loop}</span>
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

  const PHASE_LABELS = { p1: 'PLAYER 1', p2: 'PLAYER 2', p3: 'PLAYER 3', p4: 'PLAYER 4' };
  const PHASE_COLORS = { p1: 'p1', p2: 'p2', p3: 'p3', p4: 'p4' };
  const PHASE_CHAR = { p1: () => chosenCharacter, p2: () => chosenCharacter2, p3: () => chosenCharacter3, p4: () => chosenCharacter4 };

  function updateCharacterSelectionUI() {
    const phaseTag = document.getElementById('charSelectPhaseTag');
    const titleEl = document.getElementById('charSelectTitle');
    const subtitleEl = document.getElementById('charSelectSubtitle');
    const goBtn = document.getElementById('go');
    const phases = ['p1','p2','p3','p4'].slice(0, mpPlayerCount);
    const phaseIdx = phases.indexOf(charSelectPhase);
    const isLastPhase = phaseIdx === phases.length - 1;
    if (charSelectPhase && PHASE_LABELS[charSelectPhase]) {
      const label = PHASE_LABELS[charSelectPhase];
      if (phaseTag) { phaseTag.textContent = label; phaseTag.className = `charselect-phase-tag ${PHASE_COLORS[charSelectPhase]}`; phaseTag.classList.remove('hidden'); }
      if (titleEl) titleEl.textContent = `${label} — CHOOSE YOUR WARRIOR`;
      if (subtitleEl) subtitleEl.textContent = isLastPhase ? 'Last player — then enter the dungeon.' : `${label} locked. Next player picks after.`;
      if (goBtn) goBtn.textContent = isLastPhase ? 'ENTER DUNGEON' : `CONFIRM ${label} →`;
    } else {
      if (phaseTag) phaseTag.classList.add('hidden');
      if (titleEl) titleEl.textContent = 'CHOOSE YOUR WARRIOR';
      if (subtitleEl) subtitleEl.textContent = 'Pick a fighter, set the run, then enter the dungeon. Challenges live in their own shop panel.';
      if (goBtn) goBtn.textContent = 'ENTER DUNGEON';
    }
    const activeChar = charSelectPhase && PHASE_CHAR[charSelectPhase] ? PHASE_CHAR[charSelectPhase]() : chosenCharacter;
    const unlocked = new Set(metaProgress.unlockedCharacters || ['princess', 'thorn_knight', 'metao']);
    const unlockedDifficulties = getUnlockedDifficultySet();
    const unlockedChallenges = getUnlockedChallengeSet();
    const ownedChallenges = getOwnedChallengeSet();
    if (metaProgress.godsKilled > 0) unlocked.add('granialla');
    const preferredCharacter = String(metaProgress.selectedCharacter || chosenCharacter);
    if (!charSelectPhase || charSelectPhase === 'p1') {
      if (unlocked.has(preferredCharacter)) {
        chosenCharacter = preferredCharacter;
      } else if (!unlocked.has(chosenCharacter)) {
        chosenCharacter = [...unlocked][0] || 'thorn_knight';
      }
      metaProgress.selectedCharacter = chosenCharacter;
    }
    if (!unlockedDifficulties.has(selectedDifficulty)) selectedDifficulty = 'easy';
    if (selectedDifficulty === 'custom') selectedDifficulty = 'easy';
    metaProgress.selectedDifficulty = selectedDifficulty;
    selectedChallenges = normalizeChallengeSelection(selectedChallenges).filter(key => unlockedChallenges.has(key) && ownedChallenges.has(key));
    metaProgress.selectedChallenges = normalizeChallengeSelection(selectedChallenges);
    const ownedLegacy = new Set(metaProgress.unlockedLegacy || []);
    uiController.updateCharacterSelection(unlocked, activeChar);
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
    const isBossRush = gameMode === 'boss_rush';
    if (ui.timerFloorSlot) ui.timerFloorSlot.style.display = isBossRush ? 'none' : '';
    if (ui.timerBossSlot) ui.timerBossSlot.style.display = isBossRush ? '' : 'none';
    if (nextState !== 'pause') document.body.classList.remove('game-paused');
    if (nextState !== 'play' && ui.interactPrompt) ui.interactPrompt.classList.add('hidden');
    if (nextState !== 'play') {
      setShopPanelOpen(false);
      setInventoryPanelOpen(false);
    }
  }

  async function startGame(resume) {
    if (gameMode === 'endless') { startEndless(); return; }
    if (gameMode === 'practice') { startPractice(); return; }
    if (gameMode === 'boss_rush') { startBossRush(); return; }
    if (gameMode === 'coop') { startCoop(); return; }
    if (gameMode === 'pvp') { startPvp(); return; }
    const forceTutorialReplay = !resume && consumeReplayTutorialRequest();
    const shouldRunTutorial = gameMode === 'normal' && (!metaProgress.tutorialCompleted || forceTutorialReplay);
    setGameState('play');

    if (resume && activeRun) {
      restoreRun(activeRun);
      resetTutorialState(shouldRunTutorial);
    } else {
      baseSeedStr = ui.seed.value.trim() || createRandomSeed();
      selectedDifficulty = normalizeDifficulty(selectedDifficulty);
      selectedChallenges = normalizeChallengeSelection(metaProgress.selectedChallenges);
      runLoopIndex = 0;
      runRevivesUsed = 0;
      lastDeathEntryId = '';
      syncSeedState();
      floor = 1;
      gameElapsedTime = 0;
      achievementManager.resetRunCounters();
      invalidateRunStatCaches();
      player = createDefaultPlayer();
      if (!isMultiplayerMode()) resetMultiplayerState();
      if (gameMode === 'sandbox') {
        player.coins = Number(sandboxSettings.startingCoins || 0);
        selectedChallenges = [];
      }
      applyRunChallengeStartModifiers();
      lastDamageSource = '';
      lastDamageSourceKey = '';
      resetScene();
      generateFloor();
      resetTutorialState(shouldRunTutorial);
      persistMetaSoon();
      scheduleRunSave();
    }

    if (!loopStarted) {
      loopStarted = true;
      requestAnimationFrame(loop);
    }
  }

  function spawnMpPlayer(charKey, offsetX, offsetY) {
    const savedChosen = chosenCharacter;
    chosenCharacter = charKey;
    const p = createDefaultPlayer();
    chosenCharacter = savedChosen;
    p.x = START_X + offsetX;
    p.y = START_Y + offsetY;
    p.items = JSON.parse(JSON.stringify(player.items));
    return p;
  }

  function startCoop() {
    setGameState('play');
    baseSeedStr = ui.seed.value.trim() || createRandomSeed();
    selectedDifficulty = normalizeDifficulty(selectedDifficulty);
    selectedChallenges = [];
    runLoopIndex = 0;
    runRevivesUsed = 0;
    lastDeathEntryId = '';
    syncSeedState();
    floor = 1;
    gameElapsedTime = 0;
    achievementManager.resetRunCounters();
    invalidateRunStatCaches();
    player = createDefaultPlayer();
    player2 = mpPlayerCount >= 2 ? spawnMpPlayer(chosenCharacter2, 36, 0) : null;
    player3 = mpPlayerCount >= 3 ? spawnMpPlayer(chosenCharacter3, 0, 36) : null;
    player4 = mpPlayerCount >= 4 ? spawnMpPlayer(chosenCharacter4, 36, 36) : null;
    p1DeadInCoop = false; p2DeadInCoop = false; p3DeadInCoop = false; p4DeadInCoop = false;
    lastDamageSource = '';
    lastDamageSourceKey = '';
    resetScene();
    generateFloor();
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = player2 ? '' : 'none';
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
  }

  let pvpState = null;

  function startPvp() {
    setGameState('play');
    baseSeedStr = ui.seed.value.trim() || createRandomSeed();
    selectedDifficulty = normalizeDifficulty(selectedDifficulty);
    selectedChallenges = [];
    runLoopIndex = 0;
    runRevivesUsed = 0;
    lastDeathEntryId = '';
    syncSeedState();
    floor = 1;
    gameElapsedTime = 0;
    achievementManager.resetRunCounters();
    invalidateRunStatCaches();
    player = createDefaultPlayer();
    player.maxHp = 300; player.hp = 300;
    player2 = spawnMpPlayer(chosenCharacter2 || Object.keys(CHARACTER_DEFS).find(k => k !== chosenCharacter) || chosenCharacter, 80, 0);
    player2.maxHp = 300; player2.hp = 300;
    if (mpPlayerCount >= 3) { player3 = spawnMpPlayer(chosenCharacter3 || chosenCharacter, -80, 60); player3.maxHp = 300; player3.hp = 300; }
    if (mpPlayerCount >= 4) { player4 = spawnMpPlayer(chosenCharacter4 || chosenCharacter, 0, 60); player4.maxHp = 300; player4.hp = 300; }
    p1DeadInCoop = false; p2DeadInCoop = false; p3DeadInCoop = false; p4DeadInCoop = false;
    player2.x = START_X + 80;
    player2.y = START_Y;
    player2.items = JSON.parse(JSON.stringify(player.items));
    pvpState = { p1Kills: 0, p2Kills: 0, killsToWin: 3, respawnTimer: null };
    lastDamageSource = '';
    lastDamageSourceKey = '';
    resetScene();
    generateFloor();
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = '';
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
    runRevivesUsed = 0;
    lastDeathEntryId = '';
    syncSeedState();
    floor = 1;
    gameElapsedTime = 0;
    achievementManager.resetRunCounters();
    endlessWave = 0;
    endlessWaveActive = false;
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
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
    runRevivesUsed = 0;
    lastDeathEntryId = '';
    syncSeedState();
    floor = 5;
    gameElapsedTime = 0;
    achievementManager.resetRunCounters();
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
    player = createDefaultPlayer();
    player.maxHp = 1000;
    player.hp = player.maxHp;
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
    syncPracticeMaxHpControls();
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
  }

  const BOSS_RUSH_ORDER = ['queen_cult', 'bulk_golem', 'artificer_knave', 'god'];

  function startBossRush() {
    setGameState('play');
    baseSeedStr = createRandomSeed();
    selectedDifficulty = normalizeDifficulty(selectedDifficulty);
    selectedChallenges = [];
    runLoopIndex = 0;
    runRevivesUsed = 0;
    lastDeathEntryId = '';
    syncSeedState();
    floor = 5;
    gameElapsedTime = 0;
    achievementManager.resetRunCounters();
    bossRushStage = 0;
    bossRushActive = false;
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
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
    const bossRushStartRandom = createScopedRandom('boss-rush:starting-items');
    for (let i = 0; i < 3; i++) {
      const key = rollItemDrop({ elite: i === 2, random: bossRushStartRandom });
      if (key) collectItem(key);
    }
    addCoins(120);
    if (ui.bossRushStageNum) ui.bossRushStageNum.textContent = 1;
    if (ui.bossRushStageNum2) ui.bossRushStageNum2.textContent = 1;
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
    let boss;
    if (bossType === 'artificer_knave') {
      // Step 1: Spawn as a regular knave
      boss = spawnEnemy('knave', safeSpawn.x, safeSpawn.y, false);
      boss.isTransforming = true;
      // Visual cue: show particles or text
      particles.push({ x: boss.x, y: boss.y - 40, life: 1.2, text: '???', c: '#ffd27d' });
      // After a short delay, transform into artificer_knave
      setTimeout(() => {
        if (!boss || !enemies.includes(boss)) return;
        // --- Transformation Animation ---
        // 1. Flash effect
        for (let i = 0; i < 8; i++) {
          setTimeout(() => {
            particles.push({ x: boss.x, y: boss.y, life: 0.18, ring: 32 + i * 4, c: i % 2 === 0 ? '#ffd27d' : '#fffbe0' });
          }, i * 40);
        }
        // 2. Scale up and down (squash/stretch)
        boss.transformAnimT = 0.36; // duration in seconds
        const animInterval = setInterval(() => {
          if (!boss || boss.transformAnimT <= 0) { clearInterval(animInterval); return; }
          boss.transformAnimT -= 0.04;
        }, 40);
        // 3. Transformation text
        particles.push({ x: boss.x, y: boss.y - 40, life: 1.6, text: 'TRANSFORM!', c: '#ffd27d' });
        // 4. Play sound if available
        if (window.playSound) playSound('transform');
        // 5. After a short moment, actually transform
        setTimeout(() => {
          if (!boss || !enemies.includes(boss)) return;
          boss.type = 'artificer_knave';
          boss.r = 30;
          boss.hp = 1880;
          boss.max = 1880;
          boss.speed = 124;
          boss.dmg = 20;
          boss.attackCd = 1.2;
          boss.phase = 1;
          boss.isTransforming = false;
          boss.transformAnimT = 0;
          // --- Wait a moment before cutscene/dialogue so animation is clear ---
          setTimeout(() => {
            const playedCutscene = tryPlayKnaveKnightCutscene(boss, 'artificer_knave');
            const line = BOSS_OPENING_DIALOGUE['artificer_knave'];
            if (!playedCutscene && boss && line) sayOverEntity(boss, line);
          }, 400); // Wait 0.4s after animation for clarity
        }, 420); // transformation after animation
      }, 1200); // 1.2 seconds delay
    } else {
      boss = spawnEnemy(bossType, safeSpawn.x, safeSpawn.y, false);
      const playedCutscene = tryPlayKnaveKnightCutscene(boss, bossType);
      const line = BOSS_OPENING_DIALOGUE[bossType];
      if (!playedCutscene && boss && line) sayOverEntity(boss, line);
      if (bossType === 'god') playGodDialogue(1);
    }
    particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 50, life: 1.4, text: `BOSS ${bossRushStage + 1}: ${getBossDisplayName(bossType).toUpperCase()}`, c: '#ff8b8b' });
  }

  function onBossRushBossDefeated() {
    bossRushActive = false;
    bossRushStage += 1;
    if (ui.bossRushStageNum) ui.bossRushStageNum.textContent = Math.min(bossRushStage + 1, 4);
    if (ui.bossRushStageNum2) ui.bossRushStageNum2.textContent = Math.min(bossRushStage + 1, 4);
    if (bossRushStage >= BOSS_RUSH_ORDER.length) {
      win();
      return;
    }
    const cx = ROOM_W / 2;
    const cy = ROOM_H / 2;
    const rewardRandom = createScopedRandom(`boss-rush:stage:${bossRushStage}:reward`);
    dropCoins(cx, cy - 20, 80 + bossRushStage * 30);
    pickups.push({ x: cx - 60, y: cy, type: 'item', key: rollItemDrop({ elite: true, random: rewardRandom }) });
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

  function clampPracticeMaxHp(value) {
    return clamp(Math.round(Number(value) || 1000), 1, 10000);
  }

  function syncPracticeMaxHpControls() {
    if (!ui.practiceMaxHpSlider && !ui.practiceMaxHpNum) return;
    const value = clampPracticeMaxHp(player?.maxHp || 1000);
    if (ui.practiceMaxHpSlider) ui.practiceMaxHpSlider.value = String(value);
    if (ui.practiceMaxHpNum) ui.practiceMaxHpNum.value = String(value);
  }

  function setPracticeMaxHp(value) {
    if (!player) return;
    const nextMaxHp = clampPracticeMaxHp(value);
    const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1;
    player.maxHp = nextMaxHp;
    player.hp = clamp(Math.round(nextMaxHp * hpRatio), 1, nextMaxHp);
    syncPracticeMaxHpControls();
    updateHud();
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
      const angle = nextRandom('encounter') * Math.PI * 2;
      const dist = 160 + nextRandom('encounter') * 120;
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
    camera2 = { x: 0, y: 0 };
    camera3 = { x: 0, y: 0 };
    camera4 = { x: 0, y: 0 };
    shake = 0;
    shakeT = 0;
    fade = 0;
    fading = 0;
    nextDoor = null;
    floorSkipPending = 0;
    teleportKeyLatch = false;
    shopKeyLatch = false;
    invKeyLatch = false;
    anvilKeyLatch = false;
    ladderUseKeyLatch = false;
    activeShopTab = 'items';
    draggingMoveKey = '';
    weaponBurstQueue = [];
    rivals = [];
    monsterRoamTimer = 0;
    knaveKnightCutscenePlayed = false;
    queenMetaoCutscenePlayed = false;
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
    gameMode = normalizeGameMode(snapshot.mode || gameMode);
    baseSeedStr = snapshot.baseSeedStr || snapshot.seedStr || createRandomSeed();
    lastDamageSource = '';
    lastDamageSourceKey = '';
    runLoopIndex = Number(snapshot.runLoopIndex || 0);
    runRevivesUsed = Math.max(0, Number(snapshot.runRevivesUsed || 0));
    lastDeathEntryId = '';
    syncSeedState();
    floor = snapshot.floor;
    selectedDifficulty = normalizeDifficulty(snapshot.difficulty);
    selectedChallenges = normalizeChallengeSelection(snapshot.challenges);
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
    resetRngStreams(snapshot.rngState);
    rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms : [];
    currentRoom = rooms.find(room => room.gx === snapshot.currentRoom?.gx && room.gy === snapshot.currentRoom?.gy) || rooms[0] || null;
    invalidateRunStatCaches();
    player = migratePlayerData(snapshot.player);
    if (isMultiplayerMode()) {
      player2 = snapshot.player2 ? migratePlayerData(snapshot.player2) : null;
      player3 = snapshot.player3 ? migratePlayerData(snapshot.player3) : null;
      player4 = snapshot.player4 ? migratePlayerData(snapshot.player4) : null;
      p1DeadInCoop = !!snapshot.p1DeadInCoop;
      p2DeadInCoop = !!snapshot.p2DeadInCoop;
      p3DeadInCoop = !!snapshot.p3DeadInCoop;
      p4DeadInCoop = !!snapshot.p4DeadInCoop;
      pvpState = snapshot.pvpState && typeof snapshot.pvpState === 'object' ? { ...snapshot.pvpState, respawnTimer: null } : null;
      const p2Row = document.getElementById('p2HpRow');
      if (p2Row) p2Row.style.display = player2 ? '' : 'none';
      if (!player2) resetMultiplayerState();
    } else {
      resetMultiplayerState();
    }
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
    anvilKeyLatch = false;
    ladderUseKeyLatch = false;
    activeShopTab = 'items';
    draggingMoveKey = '';
    weaponBurstQueue = [];
    monsterRoamTimer = Number(snapshot.monsterRoamTimer || 0);
    knaveKnightCutscenePlayed = !!snapshot.knaveKnightCutscenePlayed;
    queenMetaoCutscenePlayed = !!snapshot.queenMetaoCutscenePlayed;
    restoreRivals(snapshot.rivals);
    wizardPawSelection = null;
    setWizardPawModalOpen(false);
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    updateItemUI();
    injectRivalsToCurrentRoom();
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
    gameEvents.emit('floor:enter', { floor });
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
        room.pickups.push(createSecretVendorOffer(offerPool[0], ROOM_W / 2 - 110, ROOM_H / 2 + 26, room, 0));
        room.pickups.push(createSecretVendorOffer(offerPool[1], ROOM_W / 2, ROOM_H / 2 - 18, room, 1));
        room.pickups.push(createSecretVendorOffer(offerPool[2], ROOM_W / 2 + 110, ROOM_H / 2 + 26, room, 2));
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
        r: 20,
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

    if ((room.type === 'combat' || room.type === 'boss') && nextRandom('world') < (room.type === 'boss' ? 0.45 : 0.32)) {
      const trapCount = room.type === 'boss' ? 2 : (nextRandom('world') < 0.45 ? 2 : 1);
      for (let index = 0; index < trapCount; index += 1) {
        const trap = createExplosiveTrapHazard(room, index);
        if (trap) room.hazards.push(trap);
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
    const addWall = (x, y, w, h) => {
      const reinforced = nextRandom('world') < 0.24;
      room.destructibles.push({
        kind: 'cover_wall',
        x,
        y,
        w,
        h,
        r: Math.hypot(w, h) / 2,
        hp: reinforced ? 12 : 4,
        maxHp: reinforced ? 12 : 4,
        reinforced,
        broken: false,
      });
    };
    const addPillar = (x, y, size = 34) => {
      room.structures.push({ kind: 'pillar', x, y, w: size, h: size });
    };
    const setChambers = (...chambers) => {
      room.layoutChambers = chambers.map(chamber => ({
        x: chamber.x,
        y: chamber.y,
        w: chamber.w,
        h: chamber.h,
      }));
    };
    const addDoorFrames = () => {
      const edgeInset = WALL + 52;
      const pocketInset = DOOR / 2 + 48;
      const addTorch = (x, y) => {
        room.decorations.push({ kind: 'torch', x, y, r: 12 });
      };
      if (room.doors.n) {
        addWall(ROOM_W / 2 - pocketInset, edgeInset, 28, 56);
        addWall(ROOM_W / 2 + pocketInset, edgeInset, 28, 56);
        room.decorations.push(
          { kind: 'banner', x: ROOM_W / 2 - pocketInset, y: edgeInset - 42, r: 12 },
          { kind: 'banner', x: ROOM_W / 2 + pocketInset, y: edgeInset - 42, r: 12 },
        );
        addTorch(ROOM_W / 2 - pocketInset - 26, edgeInset - 4);
        addTorch(ROOM_W / 2 + pocketInset + 26, edgeInset - 4);
      }
      if (room.doors.s) {
        addWall(ROOM_W / 2 - pocketInset, ROOM_H - edgeInset, 28, 56);
        addWall(ROOM_W / 2 + pocketInset, ROOM_H - edgeInset, 28, 56);
        room.decorations.push({ kind: 'crack', x: ROOM_W / 2, y: ROOM_H - edgeInset + 34, r: 22 });
        addTorch(ROOM_W / 2 - pocketInset - 26, ROOM_H - edgeInset + 4);
        addTorch(ROOM_W / 2 + pocketInset + 26, ROOM_H - edgeInset + 4);
      }
      if (room.doors.w) {
        addWall(edgeInset, ROOM_H / 2 - pocketInset, 56, 28);
        addWall(edgeInset, ROOM_H / 2 + pocketInset, 56, 28);
        room.decorations.push({ kind: 'brazier', x: edgeInset + 28, y: ROOM_H / 2, r: 14 });
        addTorch(edgeInset - 6, ROOM_H / 2 - pocketInset - 28);
        addTorch(edgeInset - 6, ROOM_H / 2 + pocketInset + 28);
      }
      if (room.doors.e) {
        addWall(ROOM_W - edgeInset, ROOM_H / 2 - pocketInset, 56, 28);
        addWall(ROOM_W - edgeInset, ROOM_H / 2 + pocketInset, 56, 28);
        room.decorations.push({ kind: 'brazier', x: ROOM_W - edgeInset - 28, y: ROOM_H / 2, r: 14 });
        addTorch(ROOM_W - edgeInset + 6, ROOM_H / 2 - pocketInset - 28);
        addTorch(ROOM_W - edgeInset + 6, ROOM_H / 2 + pocketInset + 28);
      }
    };
    const pickCombatArchetype = () => {
      const pool = ['pillar_ring', 'split_cross', 'side_lanes', 'gate_room', 'broken_halls'];
      return pool[irand(0, pool.length - 1, 'world')];
    };
    const pickBossArchetype = () => {
      const pool = ['boss_buttresses', 'boss_crossfire', 'boss_processional'];
      return pool[irand(0, pool.length - 1, 'world')];
    };

    room.layoutArchetype = room.type === 'boss' ? pickBossArchetype() : pickCombatArchetype();
    room.layoutChambers = [];
    addDoorFrames();

    if (room.layoutArchetype === 'pillar_ring') {
      addPillar(ROOM_W / 2 - 150, ROOM_H / 2 - 104, 36);
      addPillar(ROOM_W / 2 + 150, ROOM_H / 2 - 104, 36);
      addPillar(ROOM_W / 2 - 150, ROOM_H / 2 + 104, 36);
      addPillar(ROOM_W / 2 + 150, ROOM_H / 2 + 104, 36);
      addPillar(ROOM_W / 2, ROOM_H / 2 - 138, 28);
      addPillar(ROOM_W / 2, ROOM_H / 2 + 138, 28);
      room.decorations.push(
        { kind: 'rubble', x: ROOM_W / 2 - 54, y: ROOM_H / 2, r: 24 },
        { kind: 'rubble', x: ROOM_W / 2 + 54, y: ROOM_H / 2, r: 24 },
      );
      setChambers({ x: ROOM_W / 2, y: ROOM_H / 2, w: ROOM_W - 240, h: ROOM_H - 220 });
      return;
    }

    if (room.layoutArchetype === 'split_cross') {
      addWall(ROOM_W / 2, ROOM_H / 2 - 136, 74, 92);
      addWall(ROOM_W / 2, ROOM_H / 2 + 136, 74, 92);
      addWall(ROOM_W / 2 - 182, ROOM_H / 2, 94, 58);
      addWall(ROOM_W / 2 + 182, ROOM_H / 2, 94, 58);
      room.decorations.push(
        { kind: 'brazier', x: ROOM_W / 2 - 102, y: ROOM_H / 2 - 84, r: 16 },
        { kind: 'brazier', x: ROOM_W / 2 + 102, y: ROOM_H / 2 + 84, r: 16 },
        { kind: 'crack', x: ROOM_W / 2, y: ROOM_H / 2, r: 28 },
      );
      setChambers(
        { x: ROOM_W / 2, y: ROOM_H / 2 - 150, w: 240, h: 150 },
        { x: ROOM_W / 2, y: ROOM_H / 2 + 150, w: 240, h: 150 },
        { x: ROOM_W / 2 - 210, y: ROOM_H / 2, w: 180, h: 180 },
        { x: ROOM_W / 2 + 210, y: ROOM_H / 2, w: 180, h: 180 },
      );
      return;
    }

    if (room.layoutArchetype === 'side_lanes') {
      addWall(ROOM_W / 2, ROOM_H / 2 - 124, 228, 46);
      addWall(ROOM_W / 2, ROOM_H / 2 + 124, 228, 46);
      addPillar(ROOM_W / 2 - 242, ROOM_H / 2, 30);
      addPillar(ROOM_W / 2 + 242, ROOM_H / 2, 30);
      room.decorations.push(
        { kind: 'banner', x: ROOM_W / 2 - 188, y: ROOM_H / 2 - 166, r: 14 },
        { kind: 'banner', x: ROOM_W / 2 + 188, y: ROOM_H / 2 + 166, r: 14 },
      );
      setChambers(
        { x: ROOM_W / 2 - 238, y: ROOM_H / 2, w: 170, h: ROOM_H - 220 },
        { x: ROOM_W / 2 + 238, y: ROOM_H / 2, w: 170, h: ROOM_H - 220 },
        { x: ROOM_W / 2, y: ROOM_H / 2, w: 220, h: 180 },
      );
      return;
    }

    if (room.layoutArchetype === 'gate_room') {
      addWall(ROOM_W / 2 - 172, ROOM_H / 2 - 38, 108, 52);
      addWall(ROOM_W / 2 + 172, ROOM_H / 2 - 38, 108, 52);
      addWall(ROOM_W / 2, ROOM_H / 2 + 148, 86, 82);
      addPillar(ROOM_W / 2 - 62, ROOM_H / 2 + 34, 28);
      addPillar(ROOM_W / 2 + 62, ROOM_H / 2 + 34, 28);
      room.decorations.push(
        { kind: 'brazier', x: ROOM_W / 2 - 130, y: ROOM_H / 2 + 112, r: 15 },
        { kind: 'brazier', x: ROOM_W / 2 + 130, y: ROOM_H / 2 + 112, r: 15 },
        { kind: 'crack', x: ROOM_W / 2, y: ROOM_H / 2 - 104, r: 32 },
      );
      setChambers(
        { x: ROOM_W / 2, y: ROOM_H / 2 - 146, w: ROOM_W - 300, h: 150 },
        { x: ROOM_W / 2 - 200, y: ROOM_H / 2 + 40, w: 180, h: 220 },
        { x: ROOM_W / 2 + 200, y: ROOM_H / 2 + 40, w: 180, h: 220 },
      );
      return;
    }

    if (room.layoutArchetype === 'broken_halls') {
      addWall(ROOM_W / 2 - 96, ROOM_H / 2 - 150, 84, 74);
      addWall(ROOM_W / 2 + 118, ROOM_H / 2 - 36, 104, 54);
      addWall(ROOM_W / 2 - 148, ROOM_H / 2 + 112, 122, 46);
      addPillar(ROOM_W / 2 + 186, ROOM_H / 2 + 138, 32);
      room.decorations.push(
        { kind: 'rubble', x: ROOM_W / 2 - 20, y: ROOM_H / 2 + 10, r: 26 },
        { kind: 'crack', x: ROOM_W / 2 + 132, y: ROOM_H / 2 - 132, r: 28 },
        { kind: 'banner', x: ROOM_W / 2 - 170, y: ROOM_H / 2 - 180, r: 12 },
      );
      setChambers(
        { x: ROOM_W / 2 - 150, y: ROOM_H / 2 - 118, w: 240, h: 170 },
        { x: ROOM_W / 2 + 172, y: ROOM_H / 2 - 8, w: 200, h: 180 },
        { x: ROOM_W / 2 - 36, y: ROOM_H / 2 + 170, w: 320, h: 130 },
      );
      return;
    }

    if (room.layoutArchetype === 'boss_buttresses') {
      addWall(ROOM_W / 2 - 220, ROOM_H / 2, 64, 184);
      addWall(ROOM_W / 2 + 220, ROOM_H / 2, 64, 184);
      addPillar(ROOM_W / 2 - 84, ROOM_H / 2 - 126, 30);
      addPillar(ROOM_W / 2 + 84, ROOM_H / 2 - 126, 30);
      room.decorations.push(
        { kind: 'brazier', x: ROOM_W / 2 - 220, y: ROOM_H / 2 - 136, r: 17 },
        { kind: 'brazier', x: ROOM_W / 2 + 220, y: ROOM_H / 2 - 136, r: 17 },
      );
      setChambers({ x: ROOM_W / 2, y: ROOM_H / 2, w: ROOM_W - 220, h: ROOM_H - 170 });
      return;
    }

    if (room.layoutArchetype === 'boss_crossfire') {
      addWall(ROOM_W / 2, ROOM_H / 2 - 162, 68, 70);
      addWall(ROOM_W / 2, ROOM_H / 2 + 162, 68, 70);
      addPillar(ROOM_W / 2 - 188, ROOM_H / 2, 34);
      addPillar(ROOM_W / 2 + 188, ROOM_H / 2, 34);
      room.decorations.push(
        { kind: 'crack', x: ROOM_W / 2 - 128, y: ROOM_H / 2, r: 26 },
        { kind: 'crack', x: ROOM_W / 2 + 128, y: ROOM_H / 2, r: 26 },
      );
      setChambers({ x: ROOM_W / 2, y: ROOM_H / 2, w: ROOM_W - 240, h: ROOM_H - 210 });
      return;
    }

    addWall(ROOM_W / 2 - 160, ROOM_H / 2 + 118, 116, 46);
    addWall(ROOM_W / 2 + 160, ROOM_H / 2 + 118, 116, 46);
    addPillar(ROOM_W / 2 - 74, ROOM_H / 2 - 64, 32);
    addPillar(ROOM_W / 2 + 74, ROOM_H / 2 - 64, 32);
    room.decorations.push(
      { kind: 'banner', x: ROOM_W / 2, y: ROOM_H / 2 - 186, r: 14 },
      { kind: 'brazier', x: ROOM_W / 2 - 148, y: ROOM_H / 2 - 10, r: 16 },
      { kind: 'brazier', x: ROOM_W / 2 + 148, y: ROOM_H / 2 - 10, r: 16 },
    );
    setChambers(
      { x: ROOM_W / 2, y: ROOM_H / 2 - 96, w: ROOM_W - 260, h: 180 },
      { x: ROOM_W / 2, y: ROOM_H / 2 + 176, w: ROOM_W - 220, h: 140 },
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

  function createExplosiveTrapHazard(room, index = 0) {
    const structuresList = Array.isArray(room?.structures) ? room.structures : [];
    const destructibleList = Array.isArray(room?.destructibles) ? room.destructibles : [];
    const chambers = Array.isArray(room?.layoutChambers) && room.layoutChambers.length
      ? room.layoutChambers
      : [{ x: ROOM_W / 2, y: ROOM_H / 2, w: ROOM_W - 260, h: ROOM_H - 240 }];
    const radius = 16;
    const collides = (x, y) => {
      if (x < WALL + radius + 12 || x > ROOM_W - WALL - radius - 12) return true;
      if (y < WALL + radius + 12 || y > ROOM_H - WALL - radius - 12) return true;
      if (Math.hypot(x - START_X, y - START_Y) < 78) return true;
      if (structuresList.some(structure => circleRect(x, y, radius + 6, structure.x - structure.w / 2, structure.y - structure.h / 2, structure.w, structure.h))) return true;
      if (destructibleList.some(prop => !prop.broken && !prop.hidden && destructibleIntersectsCircle(prop, x, y, radius + 4))) return true;
      if (Array.isArray(room.hazards) && room.hazards.some(hazard => hazard?.kind === 'explosive_trap' && dist(x, y, hazard.x, hazard.y) < radius + (hazard.r || 16) + 58)) return true;
      return false;
    };

    for (let attempt = 0; attempt < 18; attempt += 1) {
      const chamber = chambers[(index + attempt) % chambers.length] || chambers[0];
      const halfW = Math.max(40, chamber.w / 2 - 28);
      const halfH = Math.max(40, chamber.h / 2 - 28);
      const x = clamp(chamber.x + rand(halfW, -halfW, 'world'), WALL + radius + 12, ROOM_W - WALL - radius - 12);
      const y = clamp(chamber.y + rand(halfH, -halfH, 'world'), WALL + radius + 12, ROOM_H - WALL - radius - 12);
      if (collides(x, y)) continue;
      return {
        kind: 'explosive_trap',
        x,
        y,
        r: radius,
        triggerRadius: 34,
        blastRadius: room.type === 'boss' ? 104 : 88,
        damage: room.type === 'boss' ? 26 + floor * 1.5 : 18 + floor * 1.2,
        fuse: 0,
        fuseDuration: room.type === 'boss' ? 0.62 : 0.78,
        triggered: false,
        sparkTick: 0,
      };
    }

    return null;
  }

  function createRoomRecord(position, overrides = {}) {
    return {
      gx: position.x,
      gy: position.y,
      type: 'combat',
      layoutArchetype: 'open',
      layoutChambers: [],
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
    return !!room?.doors?.[direction] || !!room?.secretPassages?.[direction]?.open;
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
      w: 52,
      h: 52,
      r: 22,
      hp: 2,
      maxHp: 2,
      broken: false,
      secretDir: direction,
      targetGx: targetRoom.gx,
      targetGy: targetRoom.gy,
    };
  }

  function createSecretVendorOffer(kind, x, y, room = currentRoom, index = 0) {
    if (kind === 'relic') {
      const vendorRandom = createRoomRandom(room, `secret-vendor:relic:${index}`);
      return { x, y, type: 'secretVendor', offerKind: 'relic', cost: 1, label: 'Relic', rewardKey: rollItemDrop({ elite: true, random: vendorRandom }) };
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
    const clearOfEnemies = (x, y) => enemies.every(e => Math.hypot(e.x - x, e.y - y) > e.r + testRadius + 32);

    if (!isBlocked(START_X, START_Y, testRadius) && clearOfEnemies(START_X, START_Y)) {
      return { x: START_X, y: START_Y };
    }

    for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
      for (let r = searchRadius * 0.25; r <= searchRadius; r += 20) {
        const x = START_X + Math.cos(angle) * r;
        const y = START_Y + Math.sin(angle) * r;
        if (!isBlocked(x, y, testRadius) && clearOfEnemies(x, y)) {
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
    player.stun = 0;
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

  // --- Game event handlers ---
  // room:enter  fires every time the player enters any room (including floor start)
  // floor:enter fires when a new floor is generated, before room:enter
  gameEvents.on('room:enter', ({ room }) => {
    clearPlayerTransientDefense();
    player.roomDamageTaken = 0;
    endActiveLaser();
    laserTime = 0;
    laserTick = 0;
    laserAngle = 0;
    laserSweepSpeed = 0;
    turtleWaveHpTimer = 0;
  });

  gameEvents.on('floor:enter', ({ floor: newFloor }) => {
    // floor-level resets go here; room:enter will fire immediately after for the start room
  });

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
    mouse.right = false;
    mouse.rightQueued = false;
    gameEvents.emit('room:enter', { room });
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
      const treasureRandom = createRoomRandom(room, 'treasure:chests');
      const chestCount = 1 + Math.floor(treasureRandom() * 2);
      for (let index = 0; index < chestCount; index += 1) {
        const rewardsItem = treasureRandom() < 0.9;
        chests.push({
          x: 260 + index * 180,
          y: ROOM_H / 2,
          open: false,
          rewardType: rewardsItem ? 'item' : 'potion',
          rewardKey: rewardsItem ? rollItemDrop({ random: treasureRandom }) : '',
        });
      }
    }

    if (room.secret) {
      particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 24, life: 1.1, text: 'SECRET ROOM', c: '#8dd4ff' });
    }

    if (room.type === 'ladder') {
      if (!room.cleared && enemies.length === 0) {
        spawnWave(getWaveCount(4), 'ladder');
        // Almost always add a random non-god boss to ladder rooms
        if (!room.ladderBossPlan) {
          const ladderRandom = createRoomRandom(room, 'ladder:boss');
          const _ladderBossPool = ['queen_cult', 'bulk_golem', 'artificer_knave'];
          room.ladderBossPlan = {
            spawn: ladderRandom() < 0.88,
            type: _ladderBossPool[Math.floor(ladderRandom() * _ladderBossPool.length)],
          };
        }
        if (room.ladderBossPlan.spawn) {
          const _ladderBossType = room.ladderBossPlan.type;
          const _ladderBossSpawn = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2 - 60, 20);
          if (_ladderBossSpawn) {
            const _ladderBoss = spawnEnemy(_ladderBossType, _ladderBossSpawn.x, _ladderBossSpawn.y, false);
            const _playedLadderCutscene = tryPlayBossIntroCutscene(_ladderBoss, _ladderBossType);
            const _ladderBossLine = BOSS_OPENING_DIALOGUE[_ladderBossType];
            if (!_playedLadderCutscene && _ladderBoss && _ladderBossLine) sayOverEntity(_ladderBoss, _ladderBossLine);
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
      const ensureGodIntroDialogue = () => {
        if (room.godIntroPlayed) return;
        if (playGodDialogue(1)) room.godIntroPlayed = true;
      };
      if (room.cleared) {
        if (!pickups.some(pickup => pickup.type === 'crown')) {
          pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'crown' });
        }
      } else if (room.bossStarted) {
        if (!enemies.some(enemy => enemy.type === 'god')) {
          spawnGodBoss();
        }
        ensureGodIntroDialogue();
      } else if (!room.bossStarted) {
        // Auto-start the god fight immediately — no upfront choice
        currentRoom.bossStarted = true;
        if (!enemies.some(enemy => enemy.type === 'god')) {
          spawnGodBoss();
        }
        ensureGodIntroDialogue();
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

    const shopRandom = createRoomRandom(room, 'shop:item-offers');
    const occupiedKeys = new Set(itemOffers.map(offer => offer.key));
    const itemSlotsX = [ROOM_W / 2 - 180, ROOM_W / 2, ROOM_W / 2 + 180, ROOM_W / 2 - 90, ROOM_W / 2 + 90];
    let created = 0;

    while (itemOffers.length + created < minItemOffers) {
      let key = '';
      for (let attempts = 0; attempts < 12; attempts += 1) {
        const candidate = rollItemDrop({ random: shopRandom });
        if (!occupiedKeys.has(candidate)) {
          key = candidate;
          break;
        }
      }
      if (!key) key = rollItemDrop({ random: shopRandom });
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

  function createDefaultRivalMemory() {
    return {
      playerSightings: 0,
      playerHitsTaken: 0,
      playerHitsDealt: 0,
      stolenCount: 0,
      roomsVisited: 0,
      threat: 0,
      lastSeenTime: 0,
      princessKnightIntroPlayed: false,
    };
  }

  function normalizeRivalMemory(source) {
    const fallback = createDefaultRivalMemory();
    const memory = source && typeof source === 'object' ? source : {};
    return {
      playerSightings: Number(memory.playerSightings || fallback.playerSightings),
      playerHitsTaken: Number(memory.playerHitsTaken || fallback.playerHitsTaken),
      playerHitsDealt: Number(memory.playerHitsDealt || fallback.playerHitsDealt),
      stolenCount: Number(memory.stolenCount || fallback.stolenCount),
      roomsVisited: Number(memory.roomsVisited || fallback.roomsVisited),
      threat: Number(memory.threat || fallback.threat),
      lastSeenTime: Number(memory.lastSeenTime || fallback.lastSeenTime),
      princessKnightIntroPlayed: !!memory.princessKnightIntroPlayed,
    };
  }

  function tryPlayPrincessKnightCutscene(rival, enemy) {
    if (!rival || !enemy || !player) return false;
    if (player.character !== 'thorn_knight') return false;
    if (rival.characterKey !== 'princess') return false;
    if (rival.memory?.princessKnightIntroPlayed) return false;

    rival.memory.princessKnightIntroPlayed = true;
    clearGameplayInput();
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    enemy.attackCd = Math.max(Number(enemy.attackCd || 0), 1.2);
    enemy.stun = Math.max(Number(enemy.stun || 0), 0.2);

    return uiController.playDialogue([
      {
        speaker: 'RIVAL PRINCESS',
        text: "Oh, you're here. You were supposed to be fighting for me, but you took too long, so now we fight!",
      },
      {
        speaker: 'THORN KNIGHT',
        text: 'Then draw your blade.',
      },
    ], { returnState: 'play' });
  }

  function getRivalById(rivalId, rivalKey = '') {
    if (!rivalId && !rivalKey) return null;
    return rivals.find(r => (r.rivalId && r.rivalId === rivalId) || (r.characterKey && r.characterKey === rivalKey)) || null;
  }

  function applyRivalLevelStats(rival, options = {}) {
    if (!rival) return;
    const syncLiveEnemy = options.syncLiveEnemy !== false;
    const keepHpRatio = options.keepHpRatio !== false;
    const oldMax = Math.max(1, Number(rival.max || rival.baseHp || 1));
    const oldHp = clamp(Number(rival.hp || oldMax), 1, oldMax);
    const level = Math.max(1, Number(rival.level || 1));
    const hpScale = 1 + (level - 1) * 0.14;
    const dmgScale = 1 + (level - 1) * 0.11;
    const speedScale = 1 + Math.min(0.24, (level - 1) * 0.02);
    const attackCdScale = 1 - Math.min(0.28, (level - 1) * 0.018);
    const moveScale = 1 - Math.min(0.38, (level - 1) * 0.022);

    rival.max = Math.max(20, Math.round(Number(rival.baseHp || rival.max || oldMax) * hpScale));
    rival.dmg = Math.max(4, Math.round(Number(rival.baseDmg || rival.dmg || 4) * dmgScale));
    rival.speed = Math.max(40, Number(rival.baseSpeed || rival.speed || 40) * speedScale);
    rival.attackCd = Math.max(0.42, Number(rival.baseAttackCd || rival.attackCd || 1) * attackCdScale);
    rival.moveInterval = Math.max(3.2, Number(rival.baseMoveInterval || RIVAL_MOVE_INTERVAL_BASE) * moveScale);
    rival.hp = keepHpRatio
      ? clamp(Math.round((oldHp / oldMax) * rival.max), 1, rival.max)
      : clamp(oldHp, 1, rival.max);
    rival.hpSnapshot = rival.hp;

    if (!syncLiveEnemy) return;
    const liveEnemy = enemies.find(e => e.type === 'rival' && ((e.rivalData && e.rivalData.rivalId === rival.rivalId) || e.rivalKey === rival.characterKey));
    if (!liveEnemy) return;
    const liveOldMax = Math.max(1, Number(liveEnemy.max || oldMax));
    const liveOldHp = clamp(Number(liveEnemy.hp || liveOldMax), 1, liveOldMax);
    liveEnemy.max = rival.max;
    liveEnemy.dmg = rival.dmg;
    liveEnemy.speed = rival.speed;
    liveEnemy.hp = keepHpRatio
      ? clamp(Math.round((liveOldHp / liveOldMax) * rival.max), 1, rival.max)
      : clamp(liveOldHp, 1, rival.max);
    rival.hp = liveEnemy.hp;
    rival.hpSnapshot = liveEnemy.hp;
  }

  function migrateRivalState(source) {
    if (!source || typeof source !== 'object') return null;
    const def = RIVAL_DEFS[source.characterKey] || null;
    const baseHp = Math.max(40, Number(source.baseHp || source.max || source.hp || def?.hp || 140));
    const baseDmg = Math.max(5, Number(source.baseDmg || source.dmg || def?.dmg || 18));
    const migrated = {
      ...source,
      rivalId: String(source.rivalId || `${source.characterKey || 'rival'}-${Math.floor(nextRandom('world') * 1000000)}`),
      characterKey: String(source.characterKey || ''),
      name: String(source.name || def?.name || 'Rival'),
      color: String(source.color || def?.color || '#ff9d7a'),
      attackStyle: String(source.attackStyle || def?.attackStyle || 'melee'),
      enterLine: String(source.enterLine || def?.enterLine || 'I remember you.'),
      deathLine: String(source.deathLine || def?.deathLine || 'Not this time...'),
      roomGx: Number(source.roomGx || 0),
      roomGy: Number(source.roomGy || 0),
      moveTimer: Number(source.moveTimer || 0),
      moveInterval: Number(source.moveInterval || source.baseMoveInterval || RIVAL_MOVE_INTERVAL_BASE),
      baseMoveInterval: Number(source.baseMoveInterval || source.moveInterval || RIVAL_MOVE_INTERVAL_BASE),
      baseHp,
      baseDmg,
      baseSpeed: Math.max(40, Number(source.baseSpeed || source.speed || def?.speed || 90)),
      baseAttackCd: Math.max(0.42, Number(source.baseAttackCd || source.attackCd || def?.attackCd || 1)),
      hp: Math.max(1, Number(source.hp || source.max || baseHp)),
      max: Math.max(1, Number(source.max || source.hp || baseHp)),
      dmg: Math.max(1, Number(source.dmg || baseDmg)),
      speed: Math.max(40, Number(source.speed || def?.speed || 90)),
      r: Math.max(10, Number(source.r || def?.r || 16)),
      attackCd: Math.max(0.42, Number(source.attackCd || def?.attackCd || 1)),
      level: Math.max(1, Number(source.level || 1)),
      xp: Math.max(0, Number(source.xp || 0)),
      xpToNext: Math.max(8, Number(source.xpToNext || (22 + floor * 4))),
      growthTick: Math.max(0, Number(source.growthTick || 0)),
      weapons: Array.isArray(source.weapons) ? source.weapons : [],
      memory: normalizeRivalMemory(source.memory),
      dead: !!source.dead,
    };
    if (!migrated.weapons.length) {
      migrated.weapons = (RIVAL_WEAPON_LOADOUTS[migrated.characterKey] || []).map(weapon => ({ ...weapon }));
    }
    applyRivalLevelStats(migrated, { syncLiveEnemy: false, keepHpRatio: false });
    migrated.hp = clamp(Number(source.hp || migrated.hp), 1, migrated.max);
    migrated.hpSnapshot = migrated.hp;
    return migrated;
  }

  function awardRivalXp(rival, amount, reason = '') {
    if (!rival || rival.dead) return;
    let xpGain = Math.max(0, Number(amount) || 0);
    if (xpGain <= 0) return;
    const threatBonus = 1 + Math.min(0.6, Math.max(0, Number(rival.memory?.threat || 0)) * 0.08);
    xpGain *= threatBonus;
    rival.xp += xpGain;
    let leveled = false;
    while (rival.xp >= rival.xpToNext) {
      rival.xp -= rival.xpToNext;
      rival.level += 1;
      rival.xpToNext = Math.round(rival.xpToNext * 1.18 + 3);
      applyRivalLevelStats(rival, { keepHpRatio: true });
      leveled = true;
      const liveEnemy = enemies.find(e => e.type === 'rival' && e.rivalData === rival);
      if (liveEnemy) {
        particles.push({ x: liveEnemy.x, y: liveEnemy.y - 20, life: 1.0, text: `${rival.name.toUpperCase()} LV ${rival.level}`, c: rival.color });
      }
    }
    if (leveled && reason !== 'silent') {
      scheduleRunSave();
    }
  }

  function restoreRivals(snapshotRivals) {
    const loaded = Array.isArray(snapshotRivals) ? snapshotRivals.map(migrateRivalState).filter(Boolean) : [];
    rivals = loaded;
    const rivalById = new Map(rivals.map(rival => [rival.rivalId, rival]));
    enemies.forEach(enemy => {
      if (enemy?.type !== 'rival') return;
      const rivalFromEnemy = enemy.rivalData && typeof enemy.rivalData === 'object' ? migrateRivalState(enemy.rivalData) : null;
      const matching = (rivalFromEnemy && rivalById.get(rivalFromEnemy.rivalId))
        || getRivalById(enemy.rivalData?.rivalId, enemy.rivalKey)
        || rivalFromEnemy;
      if (!matching) return;
      if (!rivalById.has(matching.rivalId)) {
        rivals.push(matching);
        rivalById.set(matching.rivalId, matching);
      }
      matching.hp = clamp(Number(enemy.hp || matching.hp), 1, matching.max);
      matching.hpSnapshot = matching.hp;
      enemy.rivalData = matching;
      enemy.rivalKey = matching.characterKey;
      enemy.max = matching.max;
      enemy.dmg = matching.dmg;
      enemy.speed = matching.speed;
      enemy.attackCd = Math.max(Number(enemy.attackCd || 0), matching.attackCd * 0.5);
    });
  }

  function spawnRivals() {
    rivals = [];
    if (!rooms || rooms.length === 0) return;
    if (nextRandom('world') > RIVAL_SPAWN_CHANCE) return;
    let unchosen = Object.keys(CHARACTER_DEFS).filter(k => k !== chosenCharacter && RIVAL_DEFS[k]);
    if (chosenCharacter === 'thorn_knight' && unchosen.includes('princess') && unchosen.length > 1) {
      // Thorn runs: rival princess is intentionally very rare.
      if (nextRandom('world') > 0.05) {
        unchosen = unchosen.filter(key => key !== 'princess');
      }
    }
    const count = floor >= 3 ? Math.min(2, unchosen.length) : 1;
    const nonStartRooms = rooms.filter(r => r.type !== 'start' && r.type !== 'boss' && r.type !== 'god');
    if (nonStartRooms.length === 0) return;
    const shuffled = [...unchosen].sort(() => nextRandom('world') - 0.5);
    for (let i = 0; i < count && i < shuffled.length; i++) {
      const charKey = shuffled[i];
      const def = RIVAL_DEFS[charKey];
      const spawnRoom = nonStartRooms[i % nonStartRooms.length];
      const floorScale = 1 + (floor - 1) * 0.12;
      const reputationBonus = Math.max(0, Math.floor(Number(player?.rivalReputation || 0) / 2));
      const startingLevel = Math.max(1, 1 + reputationBonus);
      const baseMoveInterval = RIVAL_MOVE_INTERVAL_BASE + nextRandom('world') * 4;
      rivals.push({
        rivalId: `${charKey}-${floor}-${Math.floor(nextRandom('world') * 1000000)}`,
        characterKey: charKey,
        name: def.name,
        color: def.color,
        attackStyle: def.attackStyle,
        enterLine: def.enterLine,
        deathLine: def.deathLine,
        roomGx: spawnRoom.gx,
        roomGy: spawnRoom.gy,
        moveTimer: 6 + nextRandom('world') * 5,
        moveInterval: baseMoveInterval,
        baseMoveInterval,
        baseHp: Math.round(def.hp * floorScale),
        baseDmg: Math.round(def.dmg * floorScale),
        baseSpeed: def.speed,
        baseAttackCd: def.attackCd,
        hp: Math.round(def.hp * floorScale),
        max: Math.round(def.hp * floorScale),
        dmg: Math.round(def.dmg * floorScale),
        speed: def.speed,
        r: def.r,
        attackCd: def.attackCd,
        level: startingLevel,
        xp: 0,
        xpToNext: 22 + floor * 4,
        growthTick: 0,
        weapons: (RIVAL_WEAPON_LOADOUTS[charKey] || []).map(weapon => ({ ...weapon })),
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
        memory: createDefaultRivalMemory(),
        dead: false,
      });
      applyRivalLevelStats(rivals[rivals.length - 1], { syncLiveEnemy: false, keepHpRatio: false });
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
    const threat = Number(rival?.memory?.threat || 0);
    if (currentRoom && currentRoom !== fromRoom && threat > 1.2) {
      const huntChance = clamp(0.2 + threat * 0.07, 0.2, 0.72);
      if (nextRandom('encounter') < huntChance) {
        return currentRoom;
      }
    }
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

  function isMonsterDoorRoamEligible(enemy) {
    if (!enemy || typeof enemy !== 'object') return false;
    if (enemy.type === 'rival' || enemy.type === 'mirror_knight') return false;
    if (isBossType(enemy.type) || enemy.type === 'god') return false;
    if (enemy.type === 'boss_spawner') return false;
    if (enemy.spawnT > 0) return false;
    return true;
  }

  function getDoorEntryPoint(direction, radius = 15) {
    const r = Math.max(8, Number(radius || 15));
    const laneX = ROOM_W / 2 + rand(34, -34, 'encounter');
    const laneY = ROOM_H / 2 + rand(34, -34, 'encounter');
    if (direction === 'n') {
      return { x: laneX, y: WALL + r + 10 };
    }
    if (direction === 's') {
      return { x: laneX, y: ROOM_H - WALL - r - 10 };
    }
    if (direction === 'e') {
      return { x: ROOM_W - WALL - r - 10, y: laneY };
    }
    return { x: WALL + r + 10, y: laneY };
  }

  function updateMonsterDoorRoaming(dt) {
    if (!currentRoom || !player || !Array.isArray(rooms) || rooms.length === 0) return;
    if (player.character === 'princess') {
      monsterRoamTimer = 0;
      return;
    }

    monsterRoamTimer += dt;
    if (monsterRoamTimer < MONSTER_ROAM_INTERVAL_SECONDS) return;
    monsterRoamTimer -= MONSTER_ROAM_INTERVAL_SECONDS;

    const moves = [];
    for (const room of rooms) {
      if (!room || room === currentRoom) continue;
      if (!Array.isArray(room.enemies) || room.enemies.length === 0) continue;
      const exits = DIRECTIONS
        .map(dir => ({ dir, next: getConnectedRoom(room, dir) }))
        .filter(entry => !!entry.next);
      if (exits.length === 0) continue;

      const remaining = [];
      for (const enemy of room.enemies) {
        if (!isMonsterDoorRoamEligible(enemy) || nextRandom('encounter') > MONSTER_ROAM_MOVE_CHANCE) {
          remaining.push(enemy);
          continue;
        }
        const chosenExit = exits[Math.floor(nextRandom('encounter') * exits.length)];
        if (!chosenExit?.next) {
          remaining.push(enemy);
          continue;
        }
        moves.push({ enemy, from: room, to: chosenExit.next, dir: chosenExit.dir });
      }

      room.enemies = remaining;
    }

    if (moves.length === 0) return;

    let enteredCurrentRoom = 0;
    for (const move of moves) {
      const targetRoom = move.to;
      if (!Array.isArray(targetRoom.enemies)) targetRoom.enemies = [];
      const entryDir = OPPOSITE_DIRECTION[move.dir] || 'n';
      const point = getDoorEntryPoint(entryDir, move.enemy.r);
      move.enemy.x = point.x;
      move.enemy.y = point.y;
      move.enemy.vx = 0;
      move.enemy.vy = 0;
      targetRoom.enemies.push(move.enemy);
      if (targetRoom === currentRoom) enteredCurrentRoom += 1;
    }

    if (enteredCurrentRoom > 0) {
      enemies = currentRoom.enemies;
      particles.push({
        x: ROOM_W / 2,
        y: ROOM_H / 2 - 34,
        life: 1.4,
        text: enteredCurrentRoom > 1 ? `${enteredCurrentRoom} MONSTERS ROAMED IN` : 'A MONSTER ROAMED IN',
        c: '#ffbf7a',
      });
    }
    scheduleRunSave();
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
    if (rival.memory) {
      rival.memory.stolenCount += 1;
      rival.memory.threat += 0.12;
    }
    awardRivalXp(rival, stolen.type === 'item' ? 10 : 6, 'loot');
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
    const playedCutscene = tryPlayPrincessKnightCutscene(rival, entry);
    if (!playedCutscene) {
      sayAtPosition(entry.x, entry.y, rival.enterLine, { speaker: rival.name, tone: 'boss', holdTime: 1.8, offsetY: rival.r + 36 });
    }
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

      rival.growthTick = Number(rival.growthTick || 0) + dt;
      while (rival.growthTick >= RIVAL_GROWTH_TICK_SECONDS) {
        rival.growthTick -= RIVAL_GROWTH_TICK_SECONDS;
        awardRivalXp(rival, RIVAL_XP_PER_GROWTH_TICK + floor * 0.5, 'time');
      }

      // Sync hp from live enemy if they're in the current room
      const liveEnemy = enemies.find(e => e.type === 'rival' && e.rivalData === rival);
      if (liveEnemy) {
        rival.hp = liveEnemy.hp;
        const prevSnapshot = rival.hpSnapshot;
        rival.hpSnapshot = liveEnemy.hp;
        if (liveEnemy.hp < prevSnapshot) {
          if (rival.memory) {
            rival.memory.playerHitsTaken += 1;
            rival.memory.threat += 0.34;
          }
          rival.aggroTimer = Math.max(rival.aggroTimer, 12 + Math.min(8, Number(rival.memory?.threat || 0)));
          rival.lastKnownPlayerGx = currentRoom.gx;
          rival.lastKnownPlayerGy = currentRoom.gy;
          awardRivalXp(rival, 9, 'combat');
        }
      }
      if (rival.memory) {
        rival.memory.threat = Math.max(0, rival.memory.threat - dt * 0.03);
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
        if (rival.memory) {
          rival.memory.roomsVisited += 1;
        }

        if (nextRoom === currentRoom) {
          if (rival.memory) {
            rival.memory.playerSightings += 1;
            rival.memory.lastSeenTime = Number(gameElapsedTime || 0);
            rival.memory.threat += 0.6;
          }
          rival.aggroTimer = Math.max(rival.aggroTimer, 8 + Math.min(7, Number(rival.memory?.threat || 0)));
          rival.lastKnownPlayerGx = currentRoom.gx;
          rival.lastKnownPlayerGy = currentRoom.gy;
          awardRivalXp(rival, 7, 'sighting');
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
    const weapons = Array.isArray(rival.weapons) && rival.weapons.length
      ? rival.weapons
      : (RIVAL_WEAPON_LOADOUTS[rival.characterKey] || []);
    if (weapons.length === 0) return;

    enemy.rivalWeaponIndex = Math.max(0, Math.min(weapons.length - 1, Number(enemy.rivalWeaponIndex || 0)));
    enemy.rivalWeaponSwapCd = Math.max(0, Number(enemy.rivalWeaponSwapCd || 0) - dt);
    enemy.rivalStrafeDir = enemy.rivalStrafeDir || (nextRandom('encounter') < 0.5 ? -1 : 1);
    enemy.rivalStrafeFlipCd = Math.max(0, Number(enemy.rivalStrafeFlipCd || 0) - dt);
    if (enemy.rivalStrafeFlipCd <= 0) {
      enemy.rivalStrafeFlipCd = 1.1 + nextRandom('encounter') * 1.8;
      if (nextRandom('encounter') < 0.35) enemy.rivalStrafeDir *= -1;
    }
    if (enemy.rivalWeaponSwapCd <= 0 && weapons.length > 1) {
      enemy.rivalWeaponIndex = (enemy.rivalWeaponIndex + 1) % weapons.length;
      enemy.rivalWeaponSwapCd = RIVAL_WEAPON_SWAP_BASE + nextRandom('encounter') * 1.6;
    }
    const weapon = weapons[enemy.rivalWeaponIndex] || weapons[0];

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 620;
      enemy.vy = Math.sin(enemy.dashAngle) * 620;
      if (!enemy.dashHit && distance < enemy.r + player.r + 8) {
        enemy.dashHit = true;
        const dashDamage = Math.round(enemy.dmg * Number(weapon.damageMult || 1));
        damagePlayer(dashDamage, enemy.dashAngle, Number(weapon.knockback || 340), rival.name);
      }
      if (enemy.dashTime <= 0) {
        enemy.attackCd = Math.max(0.32, rival.attackCd * Number(weapon.cooldownMult || 1));
      }
      return;
    }

    if (enemy.stun > 0) { enemy.vx *= 0.88; enemy.vy *= 0.88; return; }

    const attackStyle = weapon.class || rival.attackStyle;
    const preferDist = Number(weapon.preferredRange || (attackStyle === 'ranged' || attackStyle === 'burst' ? 220 : 120));

    // Movement
    if (attackStyle === 'ranged' || attackStyle === 'burst') {
      const shouldSeekCover = enemy.hp < enemy.max * 0.65
        || enemy.attackCd > 0.25
        || distance < preferDist * 0.82;
      if (shouldSeekCover && trySteerEnemyToCover(enemy, dt, preferDist, 4.2)) {
        // Hold cover and only peek out when an attack window opens.
      } else 
      // Keep preferred distance
      if (distance < preferDist - 30) {
        steerEnemy(enemy, -(dx / distance), -(dy / distance), enemy.speed, 4.2, dt);
      } else if (distance > preferDist + 60) {
        steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.2, dt);
      } else {
        // Strafe sideways
        const perp = Math.atan2(dy, dx) + Math.PI / 2 * enemy.rivalStrafeDir;
        steerEnemy(enemy, Math.cos(perp) * 0.8, Math.sin(perp) * 0.8, enemy.speed * 0.6, 3.0, dt);
      }
    } else if (attackStyle === 'dash') {
      const preferred = distance > preferDist ? 1 : distance < 110 ? -1 : 0.2;
      steerEnemy(enemy, dx / distance * preferred, dy / distance * preferred, enemy.speed, 4.6, dt);
    } else {
      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
    }

    if (enemy.attackCd > 0) return;

    if (attackStyle === 'melee' || attackStyle === 'melee_heal') {
      if (distance < enemy.r + player.r + Number(weapon.range || 12)) {
        const angle = Math.atan2(dy, dx);
        const meleeDamage = Math.round(enemy.dmg * Number(weapon.damageMult || 1));
        damagePlayer(meleeDamage, angle, Number(weapon.knockback || 280), rival.name);
        if (rival.memory) {
          rival.memory.playerHitsDealt += 1;
          rival.memory.threat += 0.2;
        }
        enemy.attackCd = rival.attackCd * Number(weapon.cooldownMult || 1) + nextRandom('encounter') * 0.4;
        enemy.swingTime = 0.22;
        // Heal on hit for granialla-style
        if (attackStyle === 'melee_heal' && nextRandom('encounter') < 0.25) {
          const heal = Math.round(enemy.max * 0.06);
          enemy.hp = Math.min(enemy.max, enemy.hp + heal);
          rival.hp = enemy.hp;
          particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.7, text: `+${heal}`, c: '#a8aaff' });
        }
      }
    } else if (attackStyle === 'dash') {
      if (distance < Number(weapon.range || 230) && distance > 85) {
        enemy.dashAngle = Math.atan2(dy, dx);
        enemy.dashTime = 0.24;
        enemy.dashHit = false;
        enemy.attackCd = rival.attackCd * Number(weapon.cooldownMult || 1) + 0.35;
      }
    } else if (attackStyle === 'ranged' || attackStyle === 'burst') {
      if (distance < Number(weapon.range || 320)) {
        if (attackStyle === 'ranged' && !hasLineOfSight(enemy.x, enemy.y, player.x, player.y)) {
          enemy.attackCd = 0.2;
          return;
        }
        const angle = Math.atan2(dy, dx);
        const shotCount = Math.max(1, Number(weapon.projectileCount || 1));
        const spread = Number(weapon.spread || 0.2);
        for (let shot = 0; shot < shotCount; shot += 1) {
          const offset = shotCount === 1 ? 0 : (shot / (shotCount - 1)) * 2 - 1;
          const a = angle + offset * spread;
          projectiles.push({
            x: enemy.x, y: enemy.y,
            vx: Math.cos(a) * Number(weapon.projectileSpeed || 310), vy: Math.sin(a) * Number(weapon.projectileSpeed || 310),
            r: attackStyle === 'burst' ? 4 : 5,
            life: attackStyle === 'burst' ? 1.0 : 1.1,
            damage: Math.round(enemy.dmg * Number(weapon.damageMult || 1)),
            kind: weapon.key || 'rival_shot', color: rival.color,
            knockback: 160, pierceCount: 0, hitOptions: null,
            enemy: true,
            fromRival: true,
          });
        }
        enemy.attackCd = rival.attackCd * Number(weapon.cooldownMult || 1) + nextRandom('encounter') * 0.5;
      }
    }
  }

  // ── End Rival System ────────────────────────────────────────────────────────

  function findSafeEnemySpawnPoint(preferredX, preferredY, radius = 18) {
    const isSpawnUsable = (x, y) => !isBlocked(x, y, radius) && hasNavigableSpawnSpace(x, y, radius, player);
    if (isSpawnUsable(preferredX, preferredY)) {
      return { x: preferredX, y: preferredY };
    }
    
    const searchAngles = 16;
    const maxAttempts = 40;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = (attempt / searchAngles) * Math.PI * 2;
      const searchRadius = 30 + (attempt % 4) * 40;
      const x = clamp(preferredX + Math.cos(angle) * searchRadius, WALL + radius, ROOM_W - WALL - radius);
      const y = clamp(preferredY + Math.sin(angle) * searchRadius, WALL + radius, ROOM_H - WALL - radius);
      if (isSpawnUsable(x, y)) {
        return { x, y };
      }
    }
    
    return null;
  }

  function compactEnemyList() {
    if (!Array.isArray(enemies) || enemies.length === 0) return;
    let needsCompaction = false;
    for (let index = 0; index < enemies.length; index += 1) {
      const enemy = enemies[index];
      if (!enemy || typeof enemy !== 'object') {
        needsCompaction = true;
        break;
      }
    }
    if (!needsCompaction) return;
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
      if (prop.kind !== 'wall' && prop.kind !== 'secret_wall' && prop.kind !== 'cover_wall') return;
      obstacleRects.push(getDestructibleRect(prop));
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

  function hasNavigableSpawnSpace(x, y, radius, target = player) {
    const probeStep = Math.max(18, radius + 10);
    const directions = 8;
    let openPaths = 0;
    let hasProgressTowardTarget = !target;
    const targetDistance = target ? dist(x, y, target.x, target.y) : 0;

    for (let index = 0; index < directions; index += 1) {
      const angle = (index / directions) * Math.PI * 2;
      const px = x + Math.cos(angle) * probeStep;
      const py = y + Math.sin(angle) * probeStep;
      if (isBlocked(px, py, radius)) continue;
      openPaths += 1;
      if (target && dist(px, py, target.x, target.y) < targetDistance - 2) {
        hasProgressTowardTarget = true;
      }
    }

    return openPaths >= 2 && hasProgressTowardTarget;
  }

  function findBlockingBreakableDestructible(x, y, r) {
    const breakableKinds = new Set(['cover_wall', 'wall', 'secret_wall']);
    return destructibles.find(prop => {
      if (!prop || prop.broken || prop.hidden) return false;
      if (!breakableKinds.has(prop.kind)) return false;
      return destructibleIntersectsCircle(prop, x, y, r);
    }) || null;
  }

  function enemyTryBreakBlockingObstacle(enemy, dt) {
    if (!enemy || enemy.stun > 0) return;
    enemy.obstacleHitCd = Math.max(0, Number(enemy.obstacleHitCd || 0) - dt);
    if (enemy.obstacleHitCd > 0) return;

    const speed = Math.hypot(Number(enemy.vx || 0), Number(enemy.vy || 0));
    let dirX = speed > 4 ? enemy.vx / speed : 0;
    let dirY = speed > 4 ? enemy.vy / speed : 0;
    if ((Math.abs(dirX) + Math.abs(dirY)) < 0.05 && player) {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      dirX = dx / d;
      dirY = dy / d;
    }

    const probeDistance = Math.max(enemy.r + 10, 22);
    const probeX = enemy.x + dirX * probeDistance;
    const probeY = enemy.y + dirY * probeDistance;
    let blocker = findBlockingBreakableDestructible(probeX, probeY, Math.max(10, enemy.r * 0.92));
    if (!blocker) {
      blocker = findBlockingBreakableDestructible(enemy.x, enemy.y, enemy.r + 3);
    }
    if (!blocker) return;

    const baseDamage = Math.max(1, Math.round((enemy.dmg || 10) / 14));
    const heavyBonus = enemy.type === 'golem' || enemy.type === 'bulk_golem' || enemy.type === 'charger' ? 1 : 0;
    damageDestructible(blocker, baseDamage + heavyBonus);
    enemy.obstacleHitCd = heavyBonus ? 0.22 : 0.38;
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
    const bossPool = ['queen_cult', 'bulk_golem', 'artificer_knave'];
    const bossRandom = createScopedRandom('floor-boss:type');
    return bossPool[Math.floor(bossRandom() * bossPool.length)] || bossPool[0];
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
    const miniBossRandom = createRoomRandom(currentRoom, `mini-boss:${roomType}`);
    if (chance <= 0 || miniBossRandom() > chance) return;

    const pool = roomType === 'ladder'
      ? ['golem', 'knave', 'cult_mage', 'sniper']
      : ['knave', 'cult_mage', 'sniper', 'golem'];
    const type = pool[Math.floor(miniBossRandom() * pool.length)] || pool[0];
    const angle = miniBossRandom() * Math.PI * 2;
    const radius = 120 + miniBossRandom() * 180;
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
    const playedCutscene = tryPlayBossIntroCutscene(boss, bossType);
    const line = BOSS_OPENING_DIALOGUE[bossType];
    if (!playedCutscene && boss && line) sayOverEntity(boss, line);
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
    const stunResistStacks = stacks('anchor_charm');

    enemy.hp = Math.round(enemy.hp * hpMult);
    enemy.max = enemy.hp;
    enemy.dmg = Math.round(enemy.dmg * dmgMult);
    enemy.speed *= speedMult;
    enemy.attackCd *= attackCdMult;
    enemy.r = Math.round(enemy.r * (1 + stacks('iron_lung') * 0.04));
    enemy.stunResistance = Math.max(Number(enemy.stunResistance || 0), stunResistStacks);
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
    const sandbox = getActiveSandboxSettings();
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
    if (sandbox) {
      result.hp = Math.max(1, Math.round(result.hp * sandbox.enemyStatMultiplier));
      result.max = result.hp;
      result.dmg = Math.max(1, Math.round(result.dmg * sandbox.enemyStatMultiplier));
      result.speed *= sandbox.enemySpeedMultiplier;
    }
    return result;
  }

  function spawnEnemy(type, x, y, elite = false) {
    const sandbox = getActiveSandboxSettings();
    if (sandbox && !sandbox.allowedEnemies.includes(type)) {
      type = sandbox.allowedEnemies[0] || 'hunter';
    }
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
    const roomPart = currentRoom
      ? `room:${currentRoom.gx},${currentRoom.gy}|type:${currentRoom.type || 'room'}`
      : 'room:none';
    if (currentRoom) currentRoom.enemySpawnSerial = Math.max(0, Number(currentRoom.enemySpawnSerial || 0)) + 1;
    base.lootSeed = `${getFloorSeed()}|${roomPart}|enemy:${type}:${Math.round(x)},${Math.round(y)}:${currentRoom?.enemySpawnSerial || 0}|loot`;

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
      base.speed = 88;
      base.dmg = 31;
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
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    clearGameplayInput();
    return uiController.playDialogue([{ speaker: 'GOD', text: line }], { returnState: 'play' });
  }

  function tryPlayKnaveKnightCutscene(enemy, enemyType) {
    if (!enemy || enemyType !== 'artificer_knave' || !player) return false;
    if (player.character !== 'thorn_knight') return false;
    if (knaveKnightCutscenePlayed) return false;

    knaveKnightCutscenePlayed = true;
    clearGameplayInput();
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    enemy.attackCd = Math.max(Number(enemy.attackCd || 0), 1.4);
    enemy.stun = Math.max(Number(enemy.stun || 0), 0.25);
    scheduleRunSave();

    return uiController.playDialogue([
      { speaker: 'KNAVE', text: 'You think you can out fight me you couldnt out argue me! your logic is false' },
      { speaker: 'KNIGHT', text: 'The kingdom of God has come for you ...' },
      { speaker: 'KNAVE', text: 'Violence it is' },
    ], { returnState: 'play' });
  }

  function tryPlayQueenMetaoCutscene(enemy, enemyType) {
    if (!enemy || enemyType !== 'queen_cult' || !player) return false;
    if (player.character !== 'metao') return false;
    if (queenMetaoCutscenePlayed) return false;

    queenMetaoCutscenePlayed = true;
    clearGameplayInput();
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    enemy.attackCd = Math.max(Number(enemy.attackCd || 0), 1.4);
    enemy.stun = Math.max(Number(enemy.stun || 0), 0.25);
    scheduleRunSave();

    return uiController.playDialogue([
      { speaker: 'QUEEN', text: 'once my champion planning to kill me again are you apostate' },
      { speaker: 'MATEO', text: '...' },
      { speaker: 'QUEEN', text: 'Your life will be mine !' },
    ], { returnState: 'play' });
  }

  function tryPlayBossIntroCutscene(enemy, enemyType) {
    return tryPlayKnaveKnightCutscene(enemy, enemyType)
      || tryPlayQueenMetaoCutscene(enemy, enemyType);
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
    const attackSpeed = getAttackSpeedValue();
    const itemStats = getItemStats();
    const equippedMoves = { ...(player?.equippedMoves || getDefaultMovesForCharacter(player?.character || chosenCharacter)) };
    const meleeMove = equippedMoves.melee || 'slash';
    const laserMove = equippedMoves.laser || 'blood_beam';
    const smashMove = equippedMoves.smash || 'crimson_smash';
    const dashMove = equippedMoves.dash || 'dash';
    const mirrorCooldownMultiplier = 0.82;
    const weaponKey = player?.equippedWeapon || '';
    const weaponStats = weaponKey ? {
      damage: Math.max(1, Math.round((WEAPON_BASE_STATS[weaponKey]?.damage ?? getPlayerBaseDamage()) + getAnvilWeaponBonus(weaponKey, 'damage'))),
      range: Math.max(40, Math.round((WEAPON_BASE_STATS[weaponKey]?.range ?? ATTACKS.melee.range) + getAnvilWeaponBonus(weaponKey, 'range'))),
      knockback: Math.max(0, Math.round((WEAPON_BASE_STATS[weaponKey]?.knockback ?? ATTACKS.melee.push) + getAnvilWeaponBonus(weaponKey, 'knockback'))),
      cooldown: Math.max(0.12, getWeaponBaseCooldown(weaponKey) * mirrorCooldownMultiplier),
    } : null;
    const meleeDamage = weaponStats
      ? weaponStats.damage
      : Math.round((MOVE_BASE_STATS[meleeMove]?.damage ?? getPlayerBaseDamage()) + getAnvilMoveBonus(meleeMove, 'damage') + (player?.attackPower || 0) * 0.35);
    const beamDamage = Math.round((MOVE_BASE_STATS[laserMove]?.damage ?? ATTACKS.laser.damage) + getAnvilMoveBonus(laserMove, 'damage') + (player?.attackPower || 0) * 0.45);
    const smashDamage = Math.round((MOVE_BASE_STATS[smashMove]?.damage ?? ATTACKS.smash.damage) + getAnvilMoveBonus(smashMove, 'damage') + (player?.attackPower || 0) * 0.9);
    const moveSpeed = Math.round(228 * (itemStats.moveSpeedMultiplier || 1));
    return {
      hp: Math.max(90, Math.round(player.maxHp)),
      dmg: Math.max(18, meleeDamage),
      beamDamage: Math.max(10, beamDamage),
      smashDamage: Math.max(20, smashDamage),
      speed: Math.max(108, moveSpeed),
      attackCd: Math.max(0.22, 0.56 / attackSpeed),
      attackSpeed,
      equippedMoves,
      equippedWeapon: weaponKey,
      weaponStats,
      mirrorCooldowns: {
        melee: weaponStats ? weaponStats.cooldown : Math.max(0.18, getMeleeCooldownDuration(meleeMove, attackSpeed) * mirrorCooldownMultiplier),
        laser: Math.max(0.75, getLaserCooldownDuration(laserMove, attackSpeed) * mirrorCooldownMultiplier),
        smash: Math.max(1.1, getSmashCooldownDuration(attackSpeed) * mirrorCooldownMultiplier),
        dash: Math.max(0.55, getDashCooldownDuration(dashMove, attackSpeed) * mirrorCooldownMultiplier),
      },
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
      mirrorMoves: stats.equippedMoves,
      mirrorWeapon: stats.equippedWeapon,
      mirrorWeaponStats: stats.weaponStats,
      mirrorCooldowns: stats.mirrorCooldowns,
      mirrorLaserCd: Math.max(0.55, stats.mirrorCooldowns.laser * 0.45),
      mirrorSmashCd: Math.max(0.8, stats.mirrorCooldowns.smash * 0.55),
      mirrorDashCd: Math.max(0.45, stats.mirrorCooldowns.dash * 0.4),
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
      room.challengeTimer = scaleChallengeTimer(10);
      room.challengeData.maxTimer = room.challengeTimer;
      room.challengeData.anchorX = player.x;
      room.challengeData.anchorY = player.y;
      room.challengeData.graceTimer = 2;
      room.challengeData.warnTick = 0;
      sayAtPosition(ROOM_W / 2, ROOM_H / 2, 'Stand still or lose everything.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'bomb') {
      spawnChallengeBombs(room);
      sayAtPosition(ROOM_W / 2, ROOM_H / 2, 'Choose wrong and you get nothing.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'survival') {
      room.challengeTimer = scaleChallengeTimer(20);
      room.challengeTick = 0.9;
      spawnTrialEnemyWave(2);
      sayAtPosition(ROOM_W / 2, ROOM_H / 2, 'Live through it.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'runes') {
      spawnChallengeRunes(room);
      room.challengeTimer = scaleChallengeTimer(30);
      room.challengeData.maxTimer = room.challengeTimer;
      sayAtPosition(ROOM_W / 2, ROOM_H / 2, 'Claim every rune.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'storm') {
      room.challengeTimer = scaleChallengeTimer(18);
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
    const challengeRandom = createRoomRandom(currentRoom, 'challenge:weapon-reward');
    return available[Math.floor(challengeRandom() * available.length)];
  }

  function spawnChallengeReward(text = 'TRIAL CLEARED') {
    if (!currentRoom || currentRoom.type !== 'challenge' || currentRoom.challengeRewardSpawned) return;
    currentRoom.challengeRewardSpawned = true;
    const rewardRandom = createRoomRandom(currentRoom, 'challenge:reward');
    pickups = pickups.filter(pickup => !['challengeBomb', 'challengeRune', 'challengeStarter'].includes(pickup?.type));
    pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 16, type: 'item', key: rollItemDrop({ elite: true, random: rewardRandom }) });
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
    playerData.rivalReputation = Number(playerData.rivalReputation || 0);
    playerData.stun = Math.max(0, Number(playerData.stun || 0));
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
    if (itemStatsCacheFrame === frameId && itemStatsCacheValue) return itemStatsCacheValue;
    if (!godItemKeysCache) godItemKeysCache = ITEM_KEYS.filter(key => ITEM_DEFS[key]?.rarity === 'god');

    const neoKnife = getItemCount('neo_knife');
    const orbOfBlood = getItemCount('orb_of_blood');
    const hemesScarf = getItemCount('hemes_scarf');
    const attackServo = getItemCount('attack_servo');
    const robotArm = getItemCount('robot_arm');
    const scholarSeal = getItemCount('scholar_seal');
    const scholarCap = getItemCount('scholar_cap');
    const bandaid = getItemCount('bandaid');
    const pushMan = getItemCount('push_man');
    const explosiveJelly = getItemCount('explosive_jelly');
    const dragonOrb = getItemCount('dragon_orb');
    const turtleShell = getItemCount('turtle_shell');
    const anchorCharm = getItemCount('anchor_charm');
    const shieldOfAegis = getItemCount('shield_of_aegis');
    const pendantOfKronos = getItemCount('pendant_of_kronos');
    const oracleLens = getItemCount('oracles_lens') > 0;
    const critCharmBonus = Number(player?.critCharmBuffTime || 0) > 0 ? getItemCount('crit_charm') * 0.04 : 0;
    const keenEyeBonus = Number(player?.keenEyeBuffTime || 0) > 0 ? getKeenEyeCritBonus() : 0;
    const chronoSpringBonus = Number(player?.chronoSpringBuffTime || 0) > 0 ? getChronoSpringAttackSpeedBonus() : 0;
    const godItemStacks = godItemKeysCache.reduce((total, key) => {
      return total + getItemCount(key);
    }, 0);
    let critChance = critCharmBonus + keenEyeBonus + pendantOfKronos * godItemStacks * 0.01;
    if (oracleLens) critChance *= 2;
    critChance = clamp(critChance, 0, 0.95);
    const damageReduction = clamp(bandaid * 0.005 + shieldOfAegis * 0.2, 0, 0.85);
    const xpProgress = clamp((player?.xpToNext || 0) > 0 ? (player?.xp || 0) / player.xpToNext : 0, 0, 1);
    itemStatsCacheValue = {
      bleedChance: neoKnife * 0.05,
      bleedDamageMultiplier: orbOfBlood > 0 ? 1 + orbOfBlood : 1,
      bleedHealScale: hemesScarf,
      passiveBleedStacks: hemesScarf,
      critChance,
      critMultiplier: 1.6 + (oracleLens ? critChance * 2.2 : critChance * 0.6),
      attackSpeedMultiplier: robotArm > 0 ? 15 * (1 + attackServo * 0.12 + chronoSpringBonus) : 1 + attackServo * 0.12 + chronoSpringBonus,
      hasRobotArm: robotArm > 0,
      moveSpeedMultiplier: 1 + turtleShell * 0.05,
      xpGainMultiplier: 1 + scholarSeal * 0.15,
      levelEdgeDamageMultiplier: 1 + scholarCap * xpProgress * 0.45,
      knockbackMultiplier: 1 + pushMan * 0.18,
      aoeRadiusMultiplier: (1 + explosiveJelly) * (player?.character === 'metao' ? 1.1 : 1),
      beamDamageMultiplier: 1 + dragonOrb * 0.35,
      beamChainTargets: dragonOrb > 0 ? Math.min(2, dragonOrb) : 0,
      beamChainDamageMultiplier: dragonOrb > 0 ? 0.6 + (dragonOrb - 1) * 0.15 : 0,
      damageReduction,
      stunResistance: anchorCharm,
      hasIronLung: getItemCount('iron_lung') > 0,
    };
    itemStatsCacheFrame = frameId;
    return itemStatsCacheValue;
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
        const warpHint = formatControlLabel('f', 'f');
        particles.push({ x: player.x, y: player.y - 36, life: 0.9, text: `ADAPTER READY - PRESS ${warpHint}`, c: '#b88cff' });
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

  function scaleDamageAgainstEnemy(enemy, damage, options = {}) {
    const stats = getItemStats();
    const applyBleedBonus = options.applyBleedBonus !== false;
    const characterMultiplier = getCharacterDef().damageMultiplier || 1;
    const powered = (damage + (player?.attackPower || 0))
      * characterMultiplier
      * (stats.levelEdgeDamageMultiplier || 1)
      * (isChallengeActive('glass_cannon') ? 1.25 : 1);
    if (applyBleedBonus && getStatusStacks(enemy, 'bleed') > 0 && stats.bleedDamageMultiplier > 1) {
      return Math.round(powered * stats.bleedDamageMultiplier);
    }
    return Math.round(powered);
  }

  function getEnemyBleedResistance(enemy) {
    const loopNumber = Math.max(1, Math.floor((floor - 1) / 10) + 1);
    const floorInLoop = ((floor - 1) % 10) + 1;
    let resistance = 1;
    resistance += Math.max(0, floorInLoop - 1) * BLEED_RESIST_SCALING.floorInLoop;
    resistance += Math.max(0, loopNumber - 1) * BLEED_RESIST_SCALING.loop;
    if (enemy?.elite) resistance += BLEED_RESIST_SCALING.elite;
    if (enemy?.miniBoss) resistance += BLEED_RESIST_SCALING.miniBoss;
    if (isBossType(enemy?.type) || enemy?.type === 'god') resistance += BLEED_RESIST_SCALING.boss;
    if (enemy?.type === 'rival' || enemy?.type === 'mirror_knight') resistance += BLEED_RESIST_SCALING.rival;
    return Math.max(1, resistance);
  }

  function scaleBleedDamageAgainstEnemy(enemy, stacks) {
    const baseBleed = 1.8 + Math.max(1, Number(stacks || 1)) * 2.2;
    const preResist = scaleDamageAgainstEnemy(enemy, baseBleed, { applyBleedBonus: false });
    const reduced = preResist / getEnemyBleedResistance(enemy);
    return Math.max(1, Math.round(reduced));
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
        if (!prop.broken && !prop.hidden && beamPathHitsDestructible(beamPath, prop, 4)) {
          damageDestructible(prop, 1);
        }
      });
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
          ? 12
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
        if (!prop.broken && !prop.hidden && beamPathHitsDestructible(beamPath, prop, 4)) {
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

  function applyEnemyImpactStun(enemy, dealt, appliedKnockback) {
    const maxHealth = Number(enemy?.max) || 0;
    const stunResistance = Math.max(0, Number(enemy?.stunResistance || 0));
    const thresholdMultiplier = 1 + stunResistance * 0.35;
    const durationMultiplier = Math.max(0.28, 1 - stunResistance * 0.28);
    const lostHalfHealth = maxHealth > 0 && dealt >= maxHealth * HEAVY_HIT_HEALTH_RATIO * thresholdMultiplier;
    const knockbackThreshold = HEAVY_KNOCKBACK_THRESHOLD * thresholdMultiplier;
    const heavyKnockback = appliedKnockback >= knockbackThreshold;
    if (!lostHalfHealth && !heavyKnockback) return false;
    let stunDuration = 0;
    if (lostHalfHealth) stunDuration = Math.max(stunDuration, HEAVY_HIT_STUN);
    if (heavyKnockback) {
      const knockbackOverThreshold = (appliedKnockback - knockbackThreshold) / knockbackThreshold;
      stunDuration = Math.max(stunDuration, HEAVY_KNOCKBACK_STUN + clamp(knockbackOverThreshold, 0, 1) * 0.18);
    }
    stunDuration *= durationMultiplier;
    if (BOSS_TYPES.has(enemy.type)) stunDuration *= HEAVY_IMPACT_BOSS_STUN_MULTIPLIER;
    enemy.stun = Math.max(enemy.stun || 0, stunDuration);
    particles.push({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.55, text: 'STUN', c: '#ffe66d' });
    particles.push({ x: enemy.x, y: enemy.y, life: 0.36, ring: enemy.r + 18, c: '#ffe66d' });
    return true;
  }

  function applyPlayerImpactStun(dealt, appliedKnockback) {
    if (!player) return false;
    const stats = getItemStats();
    const stunResistance = Math.max(0, Number(stats.stunResistance || 0));
    const thresholdMultiplier = 1 + stunResistance * 0.35;
    const durationMultiplier = Math.max(0.28, 1 - stunResistance * 0.28);
    const maxHealth = Number(player.maxHp) || 0;
    const lostHalfHealth = maxHealth > 0 && dealt >= maxHealth * HEAVY_HIT_HEALTH_RATIO * thresholdMultiplier;
    const knockbackThreshold = HEAVY_KNOCKBACK_THRESHOLD * thresholdMultiplier;
    const heavyKnockback = appliedKnockback >= knockbackThreshold;
    if (!lostHalfHealth && !heavyKnockback) return false;
    let stunDuration = 0;
    if (lostHalfHealth) stunDuration = Math.max(stunDuration, HEAVY_HIT_STUN);
    if (heavyKnockback) {
      const knockbackOverThreshold = (appliedKnockback - knockbackThreshold) / knockbackThreshold;
      stunDuration = Math.max(stunDuration, HEAVY_KNOCKBACK_STUN + clamp(knockbackOverThreshold, 0, 1) * 0.18);
    }
    player.stun = Math.max(Number(player.stun || 0), stunDuration * durationMultiplier);
    particles.push({ x: player.x, y: player.y - player.r - 18, life: 0.55, text: 'STUN', c: '#ffe66d' });
    particles.push({ x: player.x, y: player.y, life: 0.36, ring: player.r + 18, c: '#ffe66d' });
    return true;
  }

  function hitEnemy(enemy, damage, angle, knockback, color, options = {}) {
    if ((enemy?.inv || 0) > 0) return;
    const stats = getItemStats();
    const sandbox = getActiveSandboxSettings();
    const critChance = clamp((stats.critChance || 0) + Number(options.critBonus || 0), 0, 0.98);
    let dealt = options.rawDamage ? Math.max(1, Math.round(damage)) : scaleDamageAgainstEnemy(enemy, damage);
    if (sandbox) dealt = Math.max(1, Math.round(dealt * sandbox.playerDamageMultiplier));
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
        applyEnemyImpactStun(enemy, 0, appliedKnockback * 0.35);
        return;
      }
    }
    enemy.hp -= dealt;
    enemy.vx += Math.cos(angle) * appliedKnockback;
    enemy.vy += Math.sin(angle) * appliedKnockback;
    enemy.stun = Math.max(enemy.stun, 0.08);
    applyEnemyImpactStun(enemy, dealt, appliedKnockback);
    if (!options.noCharmBuff) grantCritCharmBuff();
    particles.push({ x: enemy.x, y: enemy.y, life: 0.24, vx: rand(-30, 30, 'fx'), vy: rand(-30, 30, 'fx'), c: color });
    spawnDamagePopup(enemy.x, enemy.y - 14, dealt, {
      crit: isCrit,
      color: isCrit ? '#ff9f1c' : '#ff6b6b',
      size: isCrit ? 20 : 16,
    });
    achievementEvents.emit('damage:dealt', { amount: dealt });
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
          { noCharmBuff: true }
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
      damage: stacks => scaleBleedDamageAgainstEnemy(enemy, stacks),
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
    const isTutorialDummy = !!enemy.tutorialDummy;
    spawnEnemyCorpse(enemy);
    if (player) player.kills = Math.max(0, Number(player.kills || 0)) + 1;
    achievementEvents.emit('enemy:killed');
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

    const enemyLootRandom = createRandomFromSeed(enemy.lootSeed || `${getFloorSeed()}|enemy:fallback:${enemy.type}:${Math.round(enemy.x)},${Math.round(enemy.y)}|loot`);
    if (isTutorialDummy) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ random: enemyLootRandom }) });
      particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.85, text: 'RELIC DROPPED', c: '#8dd4ff' });
    } else {
      dropCoins(enemy.x, enemy.y, isBossType(enemy.type) ? 40 : enemy.elite ? 10 : 5);
      grantXp(isBossType(enemy.type) ? 40 : enemy.elite ? 12 : 6);
      incrementChargeProgress('insurance', 9);
      incrementChargeProgress('keen_eye', 10);
      incrementChargeProgress('chrono_spring', 7);
      incrementChargeProgress('escape', 10);
    }

    if (!isTutorialDummy && enemy.elite && enemyLootRandom() < 0.18) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ elite: true, random: enemyLootRandom }) });
    } else if (!isTutorialDummy && enemyLootRandom() < 0.1) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'potion' });
    }

    if (enemy.type === 'god') {
      metaProgress.godsKilled = Number(metaProgress.godsKilled || 0) + 1;
      achievementEvents.emit('god:killed');
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
        if (player) player.rivalReputation = Math.max(0, Number(player.rivalReputation || 0)) + 1;
        achievementEvents.emit('rival:killed');
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
      if ((currentRoom.type === 'ladder' || currentRoom.type === 'boss') && gameMode !== 'endless' && gameMode !== 'boss_rush') {
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
    const rewardRandom = createScopedRandom(`endless:wave:${endlessWave}:reward`);
    particles.push({ x: cx, y: cy - 40, life: 1.4, text: `WAVE ${endlessWave} CLEARED`, c: '#78d7ff' });
    pickups.push({ x: cx - 60, y: cy, type: 'item', key: rollItemDrop({ elite: endlessWave % 3 === 0, random: rewardRandom }) });
    pickups.push({ x: cx + 60, y: cy, type: 'potion' });
    if (endlessWave % 5 === 0) {
      pickups.push({ x: cx, y: cy + 50, type: 'item', key: rollItemDrop({ elite: true, random: rewardRandom }) });
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
    const scaledAmount = Math.max(1, Math.round(Number(amount || 0) * getRunDifficultyScalars().coinRewardMultiplier));
    const chunks = Math.max(1, Math.ceil(scaledAmount / 4));
    for (let index = 0; index < chunks; index += 1) {
      pickups.push({
        x: x + rand(-18, 18, 'loot'),
        y: y + rand(-18, 18, 'loot'),
        type: 'coin',
        value: Math.ceil(scaledAmount / chunks),
      });
    }
  }

  function rollItemDrop(options = {}) {
    const sandbox = getActiveSandboxSettings();
    if (sandbox) {
      const baseEntries = options.elite
        ? ITEM_DROP_WEIGHTS.map(([key, weight]) => [key, weight + (key !== 'neo_knife' ? 4 : 0)])
        : ITEM_DROP_WEIGHTS;
      const filteredEntries = baseEntries.filter(([key]) => sandbox.allowedItems.includes(key));
      if (filteredEntries.length > 0) {
        return rollFromWeightTable(buildWeightTable(filteredEntries), options.stream || 'loot', options.random);
      }
    }
    const table = options.elite ? ELITE_ITEM_DROP_TABLE : ITEM_DROP_TABLE;
    return rollFromWeightTable(table, options.stream || 'loot', options.random);
  }

  function grantXp(amount) {
    const stats = getItemStats();
    const gained = Math.max(1, Math.round(amount * getRunDifficultyScalars().xpRewardMultiplier * (stats.xpGainMultiplier || 1)));
    player.xp += gained;
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      levelUp();
    }
  }

  function levelUp() {
    player.level += 1;
    achievementEvents.emit('player:leveled', { level: player.level });
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
    if (isFirstRunTutorialActive()) tutorialState.gotRelic = true;
    markInventoryPanelDirty();
    pushItemNotification(itemKey, 1);
    const totalItems = Object.values(player.items).reduce((s, v) => s + Number(v || 0), 0);
    achievementEvents.emit('item:collected', { totalItems });

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
    frameId += 1;

    // Safety net: if dialogue runtime has closed but game state is still "dialogue",
    // restore play state so controls and simulation cannot get stuck.
    if (gameState === 'dialogue' && !uiController?.isDialogueOpen?.()) {
      setGameState('play');
      clearGameplayInput();
    }

    const updatePerfStart = perfStart();
    if (gameState === 'play' && !isWizardPawOpen()) update(dt);
    else if (player && (gameState === 'dialogue' || gameState === 'pause')) {
      tickPlayerTransientDefenseTimers(dt);
      stepActiveTransitionFade(dt);
    } else if (gameState === 'dying' && playerDeathAnim) {
      playerDeathAnim.timer += dt;
      if (playerDeathAnim.timer >= playerDeathAnim.duration) finalizeDeath();
    }
    perfEnd('update', updatePerfStart);
    const uiPerfStart = perfStart();
    uiController.tick(dt);
    perfEnd('ui', uiPerfStart);
    const drawPerfStart = perfStart();
    if (gameState !== 'pause') draw();
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
    const _getNearestEnemyForAim = (() => {
      let cached = false;
      let nearest = null;
      return () => {
        if (cached) return nearest;
        cached = true;
        let bestDistSq = Infinity;
        for (const en of enemies) {
          if (!en || en.dead) continue;
          const dx = en.x - player.x;
          const dy = en.y - player.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            nearest = en;
          }
        }
        return nearest;
      };
    })();
    if (p1DeadInCoop) { keys[_right] = false; keys[_left] = false; keys[_down] = false; keys[_up] = false; }
    const _nt = window.NeoTouch;
    if (_nt?.active) {
      // Inject touch move vector — auto-aim fires in last joystick direction
      if (Math.abs(_nt.moveX) > 0.08 || Math.abs(_nt.moveY) > 0.08) {
        keys[_right] = _nt.moveX > 0.08;
        keys[_left]  = _nt.moveX < -0.08;
        keys[_down]  = _nt.moveY > 0.08;
        keys[_up]    = _nt.moveY < -0.08;
      } else {
        keys[_right] = false; keys[_left] = false;
        keys[_down]  = false; keys[_up]   = false;
      }
      // Auto-aim toward nearest enemy, fallback to last joystick direction
      const _aimTarget = _getNearestEnemyForAim();
      const _aimDX = _aimTarget ? (_aimTarget.x - player.x) : (_nt.lastAimX * 200);
      const _aimDY = _aimTarget ? (_aimTarget.y - player.y) : (_nt.lastAimY * 200);
      mouse.worldX = player.x + _aimDX;
      mouse.worldY = player.y + _aimDY;
      mouse.x = mouse.worldX - camera.x;
      mouse.y = mouse.worldY - camera.y;
      // Attack buttons — hold while button pressed, release otherwise
      if (_nt.slash) { mouse.down = true; mouse.downQueued = true; } else { mouse.down = false; }
      if (_nt.laser) { mouse.right = true; mouse.rightQueued = true; } else { mouse.right = false; }
      if (_nt.smash) { trySmash(); _nt.smash = false; }
      if (_nt.ascend) keys[' '] = true; else if (!keys[' ']) keys[' '] = false;
      if (_nt.dash) keys[_b ? _b.dash : 'shift'] = true;
      else keys[_b ? _b.dash : 'shift'] = false;
    }
    // Gamepad 0 → P1
    const _gp0 = window.NeoGamepad?.[0];
    if (_gp0?.active && !_nt?.active) {
      if (Math.abs(_gp0.moveX) > 0.18 || Math.abs(_gp0.moveY) > 0.18) {
        keys[_right] = _gp0.moveX > 0.18;
        keys[_left]  = _gp0.moveX < -0.18;
        keys[_down]  = _gp0.moveY > 0.18;
        keys[_up]    = _gp0.moveY < -0.18;
      } else {
        keys[_right] = false; keys[_left] = false;
        keys[_down] = false; keys[_up] = false;
      }
      const _gpAimTarget = _gp0.hasAim ? null : _getNearestEnemyForAim();
      const _gpAimX = _gp0.hasAim ? _gp0.aimX * 200 : (_gpAimTarget ? _gpAimTarget.x - player.x : _gp0.lastAimX * 200);
      const _gpAimY = _gp0.hasAim ? _gp0.aimY * 200 : (_gpAimTarget ? _gpAimTarget.y - player.y : _gp0.lastAimY * 200);
      mouse.worldX = player.x + _gpAimX;
      mouse.worldY = player.y + _gpAimY;
      mouse.x = mouse.worldX - camera.x;
      mouse.y = mouse.worldY - camera.y;
      if (_gp0.slash) { mouse.down = true; mouse.downQueued = true; } else { mouse.down = false; }
      if (_gp0.laser) { mouse.right = true; mouse.rightQueued = true; } else { mouse.right = false; }
      if (_gp0.smash) { trySmash(); _gp0.smash = false; }
      if (_gp0.dash) keys[_b ? _b.dash : 'shift'] = true;
      else if (!keys[_b ? _b.dash : 'shift']) keys[_b ? _b.dash : 'shift'] = false;
      if (_gp0.start) {
        if (gameState === 'play') pauseGame();
        else if (gameState === 'pause') resumeGame();
        _gp0.start = false;
      }
    }
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
    const playerStunned = Number(player.stun || 0) > 0;
    if (playerStunned) {
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
    if (!overlayOpen && !playerStunned && dashHeld && !dashKeyLatch) {
      tryDash(moveX, moveY);
      dashKeyLatch = true;
    } else if (!dashHeld) {
      dashKeyLatch = false;
    }

    if (playerStunned) {
      player.dashTime = 0;
      player.dashX = 0;
      player.dashY = 0;
      const friction = Math.pow(0.84, dt * 60);
      player.vx *= friction;
      player.vy *= friction;
    } else if (player.dashTime > 0) {
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
    updateFirstRunTutorialProgress();

    if (player.cowardsWayTime > 0) {
      player.cowardsWayTime = Math.max(0, player.cowardsWayTime - dt);
      player.inv = Math.max(player.inv, 0.2);
      if (nextRandom('fx') < 0.4) {
        particles.push({ x: player.x + rand(16, -16, 'fx'), y: player.y + rand(16, -16, 'fx'), life: 0.18, c: '#92ffcf' });
      }
    }

    player.inv = Math.max(0, player.inv - dt);
    player.stun = Math.max(0, Number(player.stun || 0) - dt);
    if (player.swing > 0) player.swing = Math.max(0, player.swing - dt);

    const _vpW = isSplitScreen() ? canvas.width / 2 : canvas.width;
    const _clampedMouseX = isSplitScreen() ? Math.min(mouse.x, _vpW) : mouse.x;
    mouse.worldX = _clampedMouseX + camera.x;
    mouse.worldY = mouse.y + camera.y;
    updateWeaponSystems(dt);
    updateRivals(dt);
    updateMonsterDoorRoaming(dt);
    if (gameState !== 'play') return;

    // PVP: check if P1 melee arc hits P2
    if (gameMode === 'pvp' && player2 && player.swing > 0) {
      const _pvpDx = player2.x - player.x;
      const _pvpDy = player2.y - player.y;
      const _pvpDist = Math.hypot(_pvpDx, _pvpDy);
      if (_pvpDist < ATTACKS.melee.range + player2.r + 4 && player2.inv <= 0) {
        const _pvpAimAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
        const _pvpHitAngle = Math.atan2(_pvpDy, _pvpDx);
        const _pvpDiff = Math.abs(((_pvpHitAngle - _pvpAimAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (_pvpDiff <= ATTACKS.melee.arc) {
          damagePlayer2(Math.max(1, ATTACKS.melee.damage), _pvpHitAngle, ATTACKS.melee.push, 'pvp_p1');
        }
      }
    }
    if (!p1DeadInCoop) {
      if (getItemStats().hasRobotArm) { mouse.down = true; mouse.downQueued = true; }
      const meleeHeld = isMouseActionHeld('slash');
      const laserHeld = isMouseActionHeld('laser');
      if (!overlayOpen && meleeHeld) tryMelee();
      if (!overlayOpen && laserHeld) tryLaser();
    }
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

    if (!p1DeadInCoop) updatePlayerLaser(dt);
    if (gameMode === 'coop' || gameMode === 'pvp') {
      getLivePlayerSlots().forEach(slot => {
        if (slot.id === 2) updatePlayer2(dt);
        else if (slot.id > 2) updatePlayerN(dt, slot.getEntity(), slot.id);
      });
    }
    updateChallengeRoomState(dt);

    const cameraLead = 0.08;
    const isSplit = isSplitScreen();
    const n = isSplit ? splitPlayerCount() : 1;
    // Viewport dimensions per slot: 2 players = left/right halves, 3-4 = quad grid
    const slotW = n >= 2 ? Math.floor(canvas.width / 2) : canvas.width;
    const slotH = n >= 3 ? Math.floor(canvas.height / 2) : canvas.height;

    function trackCamera(cam, p, vW, vH) {
      const tx = p.x - vW / 2 + p.vx * cameraLead;
      const ty = p.y - vH / 2 + p.vy * cameraLead;
      cam.x += (tx - cam.x) * 8 * dt;
      cam.y += (ty - cam.y) * 8 * dt;
    }

    if (!p1DeadInCoop) trackCamera(camera, player, slotW, slotH);
    if (isSplit) {
      getLivePlayerSlots().forEach(slot => {
        if (slot.id === 1) return;
        trackCamera(slot.getCamera(), slot.getEntity(), slotW, slotH);
      });
    }
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
      enemyTryBreakBlockingObstacle(enemy, dt);
      moveCircle(enemy, dt);
    }

    if (itemStats.bleedHealScale > 0 && totalBleed > 0 && player.hp < player.maxHp) {
      const heal = player.maxHp * 0.006 * totalBleed * itemStats.bleedHealScale * dt;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      if (nextRandom('fx') < 0.14) {
        particles.push({ x: player.x + rand(-10, 10), y: player.y - 18, life: 0.5, text: `+${Math.max(1, Math.ceil(heal * 10))}`, c: '#0f8' });
      }
    }
    perfEnd('update.enemies', sectionPerfStart);
    if (gameState !== 'play') return;

    sectionPerfStart = perfStart();
    updateProjectiles(dt);
    perfEnd('update.projectiles', sectionPerfStart);
    if (gameState !== 'play') return;
    sectionPerfStart = perfStart();
    updateWorldProps(dt);
    perfEnd('update.world', sectionPerfStart);
    if (gameState !== 'play') return;
    sectionPerfStart = perfStart();
    updatePlayerStatuses(dt);
    perfEnd('update.statuses', sectionPerfStart);
    if (gameState !== 'play') return;
    sectionPerfStart = perfStart();
    updateChests();
    perfEnd('update.chests', sectionPerfStart);
    if (gameState !== 'play') return;
    sectionPerfStart = perfStart();
    updatePickups(dt);
    perfEnd('update.pickups', sectionPerfStart);
    if (gameState !== 'play') return;
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
    if (godTimer > 0 && nextRandom('fx') < 0.4) {
      particles.push({ x: player.x + rand(-6, 6), y: player.y + rand(-6, 6), life: 0.32, c: `hsl(${(Date.now() / 8) % 360},100%,65%)` });
    }
    perfEnd('update.fx', sectionPerfStart);

    sectionPerfStart = perfStart();
    if (isPanelOpen(ui.shopPanel) && shopPanelDirty) renderShopPanel();
    if (isPanelOpen(ui.invPanel) && inventoryPanelDirty) renderInventoryPanel();
    perfEnd('update.panels', sectionPerfStart);
  }

  function tryChargedLadderWarp() {
    if (getItemCount('charged_adapter') <= 0) return;
    if (!player.escapeReady) {
      const needed = getChargeRequirement(10);
      const progress = Math.max(0, Number(player.escapeChargeKills || 0));
      particles.push({ x: player.x, y: player.y - 20, life: 0.75, text: `ADAPTER CHARGING ${progress}/${needed}`, c: '#b88cff' });
      return;
    }
    if (!currentRoom || currentRoom.type === 'boss' || currentRoom.type === 'god') {
      particles.push({ x: player.x, y: player.y - 20, life: 0.75, text: 'NO WARP IN BOSS ROOM', c: '#ff9e9e' });
      return;
    }
    if (enemies.length === 0) {
      particles.push({ x: player.x, y: player.y - 20, life: 0.75, text: 'WARP REQUIRES COMBAT', c: '#ffcf8f' });
      return;
    }

    const ladderRoom = rooms.find(room => room.type === 'ladder') || rooms.find(room => room.type === 'boss');
    if (!ladderRoom || ladderRoom === currentRoom) {
      particles.push({ x: player.x, y: player.y - 20, life: 0.75, text: 'ALREADY AT LADDER', c: '#b7ffca' });
      return;
    }

    const goldSpent = Math.floor(player.coins / 2);
    if (goldSpent > 0) {
      player.coins -= goldSpent;
      metaProgress.coins = Math.max(0, metaProgress.coins - goldSpent);
    }

    consumeCharge('escape');
    enterRoom(ladderRoom);
    particles.push({ x: player.x, y: player.y - 20, life: 0.9, text: 'WARPED TO LADDER (-50% COINS)', c: '#b66cff' });
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

    enemy.queenMissileCd = Math.max(0, Number(enemy.queenMissileCd || 0) - dt);
    if (enemy.queenMissileCd <= 0 && distance > 95 && distance < 580 && enemy.stun <= 0) {
      spawnCultQueenMissile(enemy, tuning);
      enemy.queenMissileCd = 3.4 * Math.max(0.78, tuning.rangedCadence);
    }

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

  function spawnCultQueenMissile(enemy, tuning = getEnemyDifficultyTuning()) {
    if (!enemy || !player) return;
    const count = tuning.supportPower >= 1.22 ? 2 : 1;
    const baseAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    for (let index = 0; index < count; index += 1) {
      const spread = count === 1 ? 0 : (index === 0 ? -0.22 : 0.22);
      const angle = baseAngle + spread + (nextRandom('encounter') - 0.5) * 0.24;
      projectiles.push({
        x: enemy.x + Math.cos(angle) * (enemy.r + 8),
        y: enemy.y + Math.sin(angle) * (enemy.r + 8),
        vx: Math.cos(angle) * 165,
        vy: Math.sin(angle) * 165,
        r: 8,
        life: 2.45,
        enemy: true,
        kind: 'cult_missile',
        damage: Math.round(enemy.dmg * 0.78),
        knockback: 155,
        color: '#b455ff',
        homing: true,
        homingTurnRate: 2.15 * Math.min(1.24, tuning.reaction),
        homingSpeed: 235 * Math.min(1.18, tuning.reaction),
        homingAccel: 3.2,
      });
    }
    particles.push({ x: enemy.x, y: enemy.y - enemy.r - 12, life: 0.55, text: 'MISSILE', c: '#d59bff' });
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

    const phaseInv = 1 + nextRandom('encounter') * 2; // 1-3s invulnerability on phase shift
    enemy.inv = Math.max(enemy.inv || 0, phaseInv);

    // On phase shift, reposition the god away from the player to reset spacing.
    if (player) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const jumpDistance = rand(320, 200, 'encounter');
      const targetX = clamp(enemy.x + nx * jumpDistance, WALL + enemy.r, ROOM_W - WALL - enemy.r);
      const targetY = clamp(enemy.y + ny * jumpDistance, WALL + enemy.r, ROOM_H - WALL - enemy.r);
      const landing = findSafeEnemySpawnPoint(targetX, targetY, Math.max(18, enemy.r || 18));
      if (landing) {
        particles.push({ x: enemy.x, y: enemy.y, life: 0.28, ring: 44, c: '#ffffff' });
        enemy.x = landing.x;
        enemy.y = landing.y;
        enemy.vx = 0;
        enemy.vy = 0;
        particles.push({ x: enemy.x, y: enemy.y, life: 0.34, ring: 58, c: '#ffffff' });
      }
    }

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
        hazards.push({ kind: 'lightning_column', x: px, y: py, r: 46, ttl: 1.25, tick: 0, interval: 0.36, damage: Math.round(enemy.dmg * 0.78), enemy: true, source: enemy.type || 'lightning_column' });
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

  function getMirrorMove(enemy, slot) {
    const fallback = slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : slot === 'smash' ? 'crimson_smash' : 'dash';
    const key = enemy?.mirrorMoves?.[slot] || fallback;
    return MOVE_DEFS[key]?.slot === slot ? key : fallback;
  }

  function getMirrorSkillCooldown(enemy, slot) {
    const cooldowns = enemy?.mirrorCooldowns || {};
    if (Number.isFinite(cooldowns[slot])) return Math.max(0.12, cooldowns[slot]);
    const attackSpeed = Math.max(0.5, enemy?.attackSpeed || 1);
    if (slot === 'laser') return Math.max(0.75, 3.2 / attackSpeed);
    if (slot === 'smash') return Math.max(1.1, 4.2 / attackSpeed);
    if (slot === 'dash') return Math.max(0.55, 1.8 / attackSpeed);
    return Math.max(0.18, 0.42 / attackSpeed);
  }

  function getMirrorMoveDamage(enemy, moveKey, fallback) {
    const base = MOVE_BASE_STATS[moveKey]?.damage ?? fallback;
    const powerBonus = Math.max(0, Number(enemy?.dmg || 0) - 18) * 0.35;
    return Math.max(1, Math.round(base + powerBonus));
  }

  function getPredictedPlayerPoint(lead = 0.22) {
    return {
      x: clamp(player.x + Number(player.vx || 0) * lead, WALL + player.r, ROOM_W - WALL - player.r),
      y: clamp(player.y + Number(player.vy || 0) * lead, WALL + player.r, ROOM_H - WALL - player.r),
    };
  }

  function mirrorHitArc(enemy, angle, range, arc, damage, knockback, source = 'mirror_knight') {
    const d = dist(enemy.x, enemy.y, player.x, player.y);
    if (d > range + player.r) return false;
    const targetAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const diff = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
    if (diff > arc) return false;
    damagePlayer(damage, angle, knockback, source);
    return true;
  }

  function mirrorBlastPlayer(enemy, radius, damage, knockback, color, source = 'mirror_knight') {
    particles.push({ x: enemy.x, y: enemy.y, life: 0.42, ring: radius, c: color });
    if (dist(enemy.x, enemy.y, player.x, player.y) > radius + player.r) return false;
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    damagePlayer(damage, angle, knockback, source);
    return true;
  }

  function fireMirrorProjectiles(enemy, angle, count, spread, speed, damage, options = {}) {
    for (let index = 0; index < count; index += 1) {
      const offset = count === 1 ? 0 : (index - (count - 1) / 2) * spread;
      const a = angle + offset;
      projectiles.push({
        x: enemy.x + Math.cos(a) * (enemy.r + 7),
        y: enemy.y + Math.sin(a) * (enemy.r + 7),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: options.r || 6,
        life: options.life || 1.25,
        enemy: true,
        kind: options.kind || 'mirror_shot',
        color: options.color || '#d7f6ff',
        damage,
        knockback: options.knockback || 120,
        homing: !!options.homing,
        homingSpeed: options.homingSpeed,
        homingTurnRate: options.homingTurnRate,
        homingAccel: options.homingAccel,
      });
    }
  }

  function startMirrorMelee(enemy, angleToPlayer) {
    const weaponKey = enemy.mirrorWeapon || '';
    if (weaponKey && WEAPON_DEFS[weaponKey]) {
      const weaponStats = enemy.mirrorWeaponStats || {};
      const damage = Math.max(1, Math.round(weaponStats.damage || enemy.dmg || ATTACKS.melee.damage));
      const range = Math.max(40, Number(weaponStats.range || ATTACKS.melee.range));
      const knockback = Math.max(0, Number(weaponStats.knockback || ATTACKS.melee.push));
      enemy.swingTime = ATTACKS.melee.active;
      enemy.attackCd = getMirrorSkillCooldown(enemy, 'melee');
      if (weaponKey === 'hunters_bow' || weaponKey === 'magenta_degale' || weaponKey === 'void_piercer' || weaponKey === 'granillia_lightning_spear') {
        fireMirrorProjectiles(enemy, angleToPlayer, 1, 0, weaponKey === 'magenta_degale' ? 880 : 760, damage, {
          kind: weaponKey,
          color: WEAPON_DEFS[weaponKey]?.color || '#d7f6ff',
          r: weaponKey === 'magenta_degale' ? 7 : 6,
          life: weaponKey === 'void_piercer' ? 1.2 : 0.9,
          knockback,
        });
        return true;
      }
      if (weaponKey === 'metao_fire_staff') {
        fireMirrorProjectiles(enemy, angleToPlayer, 3, 0.18, 345, damage, { kind: 'fireball', color: '#ffb874', r: 8, life: 1.4, knockback });
        return true;
      }
      if (weaponKey === 'magenta_p90') {
        fireMirrorProjectiles(enemy, angleToPlayer, 5, 0.08, 880, Math.max(6, damage), { kind: 'magenta_p90', color: '#ff9dd7', r: 4, life: 0.75, knockback });
        return true;
      }
      if (weaponKey === 'lazer_glasses') {
        enemy.state = 'mirrorLaser';
        enemy.windup = 0.22;
        enemy.beamAngle = angleToPlayer;
        enemy.beamDamage = Math.max(enemy.beamDamage || 0, Math.round(damage * 0.55));
        return true;
      }
      if (weaponKey === 'aegis_shield_weapon') {
        enemy.barrier = Math.max(enemy.barrier || 0, Math.round(enemy.max * 0.12));
        enemy.inv = Math.max(enemy.inv || 0, 0.32);
        particles.push({ x: enemy.x, y: enemy.y, life: 0.44, ring: 34, c: '#9ae9ff' });
        return true;
      }
      mirrorHitArc(enemy, angleToPlayer, range + 10, weaponKey === 'excalibur' ? Math.PI : ATTACKS.melee.arc + 0.18, damage, knockback, `mirror_${weaponKey}`);
      return true;
    }
    const move = getMirrorMove(enemy, 'melee');
    const damage = getMirrorMoveDamage(enemy, move, enemy.dmg || ATTACKS.melee.damage);
    enemy.swingTime = ATTACKS.melee.active;
    enemy.attackCd = getMirrorSkillCooldown(enemy, 'melee');
    if (move === 'fire_balls') {
      fireMirrorProjectiles(enemy, angleToPlayer, 3, 0.16, 340, Math.max(14, damage - 4), { kind: 'fireball', color: '#ff8844', r: 8, life: 1.45, knockback: 110 });
      return true;
    }
    if (move === 'narwal_fight') {
      mirrorHitArc(enemy, angleToPlayer, 138, 1.45, Math.max(22, damage + 4), 300);
      fireMirrorProjectiles(enemy, angleToPlayer, 1, 0, 740, Math.max(16, damage - 8), { kind: 'narwal_fight', color: '#ffd1ea', r: 6, life: 0.9, knockback: 190 });
      return true;
    }
    if (move === 'smite') {
      const didHit = mirrorHitArc(enemy, angleToPlayer, ATTACKS.melee.range + 18, ATTACKS.melee.arc + 0.18, damage, ATTACKS.melee.push);
      if (didHit) damagePlayer(Math.max(8, Math.round(damage * 0.45)), angleToPlayer, 70, 'mirror_smite');
      particles.push({ x: player.x, y: player.y, life: 0.24, ring: 18, c: '#eaf2ff' });
      return true;
    }
    mirrorHitArc(enemy, angleToPlayer, ATTACKS.melee.range + 10, ATTACKS.melee.arc + 0.12, damage, ATTACKS.melee.push);
    return true;
  }

  function startMirrorLaser(enemy, angleToPlayer, distance) {
    const move = getMirrorMove(enemy, 'laser');
    const predicted = getPredictedPlayerPoint(0.32);
    const aimedAngle = Math.atan2(predicted.y - enemy.y, predicted.x - enemy.x);
    enemy.attackCd = 0.42;
    enemy.mirrorLaserCd = getMirrorSkillCooldown(enemy, 'laser');
    if (move === 'power_disks') {
      for (let index = 0; index < 8; index += 1) {
        const a = index * (Math.PI * 2 / 8);
        fireMirrorProjectiles(enemy, a, 1, 0, 300, getMirrorMoveDamage(enemy, move, 20), { kind: 'disk', color: '#d7f6ff', r: 7, life: 1.1, knockback: 110 });
      }
      return true;
    }
    if (move === 'blade_justice') {
      mirrorHitArc(enemy, aimedAngle, 124, 1.35, getMirrorMoveDamage(enemy, move, 34), 280, 'mirror_blade');
      particles.push({ x: enemy.x, y: enemy.y, life: 0.44, ring: 36, c: '#fff6a3' });
      return true;
    }
    if (move === 'lightning_columns') {
      [-38, 38].forEach(offset => {
        const ox = Math.cos(aimedAngle + Math.PI / 2) * offset;
        const oy = Math.sin(aimedAngle + Math.PI / 2) * offset;
        hazards.push({
          kind: 'lightning_column',
          enemy: true,
          source: 'mirror_lightning',
          x: predicted.x + ox,
          y: predicted.y + oy,
          r: 48,
          ttl: 3.6,
          tick: 0.18,
          interval: 0.42,
          damage: getMirrorMoveDamage(enemy, move, 18),
        });
        particles.push({ x: predicted.x + ox, y: predicted.y + oy, life: 0.45, ring: 24, c: '#8dd4ff' });
      });
      return true;
    }
    enemy.state = 'mirrorLaser';
    enemy.windup = move === 'god_sweep' ? 0.36 : distance < 150 ? 0.34 : 0.46;
    enemy.beamAngle = aimedAngle + rollEnemyBeamBias(enemy, move === 'god_sweep' ? 0.08 : 0.1);
    return true;
  }

  function startMirrorSmash(enemy, angleToPlayer) {
    const move = getMirrorMove(enemy, 'smash');
    const damage = getMirrorMoveDamage(enemy, move, enemy.smashDamage || ATTACKS.smash.damage);
    enemy.attackCd = 0.6;
    enemy.mirrorSmashCd = getMirrorSkillCooldown(enemy, 'smash');
    if (move === 'kicky_kick') {
      mirrorBlastPlayer(enemy, 142, Math.max(damage, 84), 680, '#ff7fc2', 'mirror_kick');
      enemy.vx -= Math.cos(angleToPlayer) * 210;
      enemy.vy -= Math.sin(angleToPlayer) * 210;
      return true;
    }
    if (move === 'chaos_burst') {
      for (let index = 0; index < 4; index += 1) {
        const a = angleToPlayer + (index - 1.5) * 0.38;
        const px = player.x + Math.cos(a) * rand(46, -46, 'encounter');
        const py = player.y + Math.sin(a) * rand(46, -46, 'encounter');
        particles.push({ x: px, y: py, life: 0.38, ring: 36, c: '#c971ff' });
        if (dist(player.x, player.y, px, py) <= 58 + player.r) damagePlayer(Math.max(16, Math.round(damage * 0.62)), Math.atan2(player.y - py, player.x - px), 120, 'mirror_chaos');
      }
      return true;
    }
    if (move === 'healing_zone') {
      enemy.hp = Math.min(enemy.max, enemy.hp + enemy.max * 0.08);
      mirrorBlastPlayer(enemy, 118, Math.max(10, damage), 120, '#35ff6f', 'mirror_zone');
      return true;
    }
    if (move === 'fire_circle' || move === 'floor_lava') {
      mirrorBlastPlayer(enemy, move === 'floor_lava' ? 156 : 108, Math.max(12, damage), 150, '#ff7b32', 'mirror_fire');
      applyFire(player, move === 'floor_lava' ? 2 : 1, 3.2);
      return true;
    }
    enemy.state = 'mirrorSmash';
    enemy.windup = 0.38;
    return true;
  }

  function startMirrorDash(enemy, angleToPlayer, distance) {
    const move = getMirrorMove(enemy, 'dash');
    const predicted = getPredictedPlayerPoint(0.28);
    enemy.attackCd = 0.34;
    enemy.mirrorDashCd = getMirrorSkillCooldown(enemy, 'dash');
    if (move === 'warp') {
      const backAngle = angleToPlayer + Math.PI;
      const safePoint = findSafePointNearTarget(predicted.x + Math.cos(backAngle) * 72, predicted.y + Math.sin(backAngle) * 72, enemy.r, 130, 16);
      if (safePoint) {
        enemy.x = safePoint.x;
        enemy.y = safePoint.y;
        enemy.inv = Math.max(enemy.inv || 0, 0.22);
        particles.push({ x: enemy.x, y: enemy.y, life: 0.3, ring: 22, c: '#b99cff' });
      }
      return true;
    }
    if (move === 'nimrod_stomp') {
      const safePoint = findSafePointNearTarget(predicted.x, predicted.y, enemy.r, 90, 14);
      if (safePoint) {
        enemy.x = safePoint.x;
        enemy.y = safePoint.y;
      }
      mirrorBlastPlayer(enemy, 112, getMirrorMoveDamage(enemy, move, 46), 310, '#ffe67a', 'mirror_stomp');
      return true;
    }
    if (move === 'zip_lightning') {
      enemy.dashAngle = angleToPlayer;
      enemy.dashTime = 0.16;
      enemy.dashHit = false;
      enemy.mirrorDashMove = 'zip_lightning';
      return true;
    }
    if (move === 'cowards_way' || move === 'flying_unhitable') {
      enemy.inv = Math.max(enemy.inv || 0, move === 'flying_unhitable' ? 1.2 : 0.7);
      enemy.speed = Math.max(enemy.speed || 0, 260);
      particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.55, text: move === 'flying_unhitable' ? 'FLY HIGH' : "COWARD'S WAY", c: '#8dffcf' });
      return true;
    }
    enemy.state = 'mirrorDash';
    enemy.windup = distance > 260 ? 0.08 : 0.14;
    enemy.dashAngle = angleToPlayer;
    return true;
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
          const laserMove = getMirrorMove(enemy, 'laser');
          enemy.beamTime = laserMove === 'god_sweep'
            ? 1.05
            : laserMove === 'turtle_wave'
              ? 0.86
              : laserMove === 'love_beam'
                ? 0.92
                : 0.64;
          enemy.beamTick = 0;
        } else if (enemy.state === 'mirrorDash') {
          enemy.dashTime = 0.18;
          enemy.dashHit = false;
        } else if (enemy.state === 'mirrorSmash') {
          mirrorBlastPlayer(enemy, ATTACKS.smash.radius + 8, enemy.smashDamage || enemy.dmg + 18, 300, '#ff6dc7');
          enemy.attackCd = 0.75;
        }
      }
      return;
    }

    if (enemy.beamTime > 0) {
      const laserMove = getMirrorMove(enemy, 'laser');
      tickEnemyBeam(enemy, dt, {
        tick: laserMove === 'god_sweep' ? 0.06 : laserMove === 'love_beam' ? 0.07 : 0.08,
        range: laserMove === 'god_sweep' ? 360 : laserMove === 'turtle_wave' ? 440 : ATTACKS.laser.range,
        knockback: laserMove === 'turtle_wave' ? 145 : 95,
        damage: laserMove === 'turtle_wave'
          ? Math.max(enemy.beamDamage || enemy.dmg, 32)
          : laserMove === 'god_sweep'
            ? Math.max(10, Math.round((enemy.beamDamage || enemy.dmg) * 0.55))
            : enemy.beamDamage || enemy.dmg,
        speedDamp: 0.84,
        turnRate: laserMove === 'god_sweep' ? 5.8 : 3.5,
        onTick: activeEnemy => {
          if (laserMove === 'god_sweep') activeEnemy.beamAngle += 4.4 * dt;
        },
        onEnd: activeEnemy => {
          activeEnemy.attackCd = 0.62;
          activeEnemy.mirrorLaserCd = getMirrorSkillCooldown(activeEnemy, 'laser');
        },
      });
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      const dashMove = enemy.mirrorDashMove || getMirrorMove(enemy, 'dash');
      const dashSpeed = dashMove === 'zip_lightning' ? 700 : 600;
      enemy.vx = Math.cos(enemy.dashAngle) * dashSpeed;
      enemy.vy = Math.sin(enemy.dashAngle) * dashSpeed;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 6) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + (dashMove === 'zip_lightning' ? 18 : 8), enemy.dashAngle, dashMove === 'zip_lightning' ? 300 : 240, enemy.type);
      }
      if (enemy.dashTime <= 0) {
        enemy.attackCd = 0.45;
        enemy.mirrorDashCd = getMirrorSkillCooldown(enemy, 'dash');
        enemy.mirrorDashMove = '';
      }
      return;
    }

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    const laserMove = getMirrorMove(enemy, 'laser');
    const smashMove = getMirrorMove(enemy, 'smash');
    const desiredRange = enemy.mirrorSmashCd <= 0
      ? (smashMove === 'kicky_kick' ? 126 : 118)
      : enemy.mirrorLaserCd <= 0 && !['blade_justice'].includes(laserMove)
        ? 230
        : 112;
    const preferred = distance > desiredRange + 24 ? 1 : distance < desiredRange - 26 ? -1 : 0.2;
    const strafe = distance < 300 ? 0.34 : 0;
    steerEnemy(
      enemy,
      dx / distance * preferred + -dy / distance * strafe,
      dy / distance * preferred + dx / distance * strafe,
      enemy.speed,
      6.2,
      dt
    );

    const mirrorWeapon = enemy.mirrorWeapon || '';
    const rangedMirrorWeapon = ['hunters_bow', 'metao_fire_staff', 'magenta_degale', 'magenta_p90', 'granillia_lightning_spear', 'void_piercer', 'lazer_glasses'].includes(mirrorWeapon);
    const mirrorWeaponRange = Number(enemy.mirrorWeaponStats?.range || 0);
    if (mirrorWeapon && enemy.attackCd <= 0 && (rangedMirrorWeapon ? distance < 520 : distance < mirrorWeaponRange + player.r + 14)) {
      startMirrorMelee(enemy, angleToPlayer);
      return;
    }

    if (distance < ATTACKS.melee.range + player.r + 6 && enemy.attackCd <= 0) {
      startMirrorMelee(enemy, angleToPlayer);
      return;
    }

    if (enemy.attackCd <= 0) {
      if (enemy.mirrorSmashCd <= 0 && distance < 178) {
        startMirrorSmash(enemy, angleToPlayer);
      } else if (enemy.mirrorLaserCd <= 0 && (distance > 96 || laserMove === 'blade_justice')) {
        startMirrorLaser(enemy, angleToPlayer, distance);
      } else if (enemy.mirrorDashCd <= 0 && (distance > 170 || getMirrorMove(enemy, 'dash') === 'warp')) {
        startMirrorDash(enemy, angleToPlayer, distance);
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
            enemy: true,
            source: 'storm',
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
      if (enemy.state === 'godLaser') aimEnemyBeam(enemy, dt, (0.68 + (tuning.reaction - 1) * 3.6) * reactionMult);
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
        turnRate: isSweep ? 0 : (0.34 + (tuning.reaction - 1) * 2.8) * reactionMult,
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
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, phaseFour ? 0.24 : phaseTwo ? 0.2 : 0.17);
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

  function updatePlayer2(dt) {
    if (!player2) return;
    const _gp1 = window.NeoGamepad?.[1];
    const _gp1Active = !!_gp1?.active;
    let p2MoveX = (keys['l'] ? 1 : 0) - (keys['j'] ? 1 : 0);
    let p2MoveY = (keys['k'] ? 1 : 0) - (keys['i'] ? 1 : 0);
    if (_gp1Active) {
      if (Math.abs(_gp1.moveX) > 0.18 || Math.abs(_gp1.moveY) > 0.18) {
        p2MoveX = _gp1.moveX; p2MoveY = _gp1.moveY;
      }
    }
    const p2Len = Math.hypot(p2MoveX, p2MoveY) || 1;
    const p2NX = p2Len > 0.1 ? p2MoveX / p2Len : 0;
    const p2NY = p2Len > 0.1 ? p2MoveY / p2Len : 0;
    if (player2.dashTime > 0) {
      player2.dashTime = Math.max(0, player2.dashTime - dt);
      player2.vx = player2.dashX;
      player2.vy = player2.dashY;
      player2.inv = Math.max(player2.inv, 0.12);
      if (player2.dashTime <= 0) { player2.dashX = 0; player2.dashY = 0; }
    } else {
      const targetSpeed = 228;
      player2.vx = applyResponsiveVelocity(player2.vx, p2NX * targetSpeed, dt);
      player2.vy = applyResponsiveVelocity(player2.vy, p2NY * targetSpeed, dt);
    }
    moveCircle(player2, dt);
    player2.inv = Math.max(0, player2.inv - dt);
    if (player2.swing > 0) player2.swing = Math.max(0, player2.swing - dt);
    // P2 melee: U key
    if ((keys['u'] || _gp1Active && _gp1.p2MeleeHeld) && !player2.meleeLatch && player2.swing <= 0) {
      player2.meleeLatch = true;
      const aimAngle = Math.atan2(player2.vy || 1, player2.vx || 1);
      player2.swing = ATTACKS.melee.active;
      player2.swingA = aimAngle;
      for (const enemy of enemies) {
        const dx = enemy.x - player2.x;
        const dy = enemy.y - player2.y;
        const dist2 = Math.hypot(dx, dy);
        if (dist2 > ATTACKS.melee.range + enemy.r + 4) continue;
        const a = Math.atan2(dy, dx);
        const diff = Math.abs(((a - aimAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (diff > ATTACKS.melee.arc) continue;
        const dmg = Math.max(1, ATTACKS.melee.damage);
        hitEnemy(enemy, dmg, a, ATTACKS.melee.push, '#4ca8ff');
      }
    } else if (!keys['u'] && !(_gp1Active && _gp1.p2MeleeHeld)) {
      player2.meleeLatch = false;
    }
    // P2 dash: semicolon key
    if ((keys[';'] || _gp1Active && _gp1.p2DashHeld) && !player2.dashLatch && player2.dashTime <= 0) {
      player2.dashLatch = true;
      const angle = p2Len > 0.1 ? Math.atan2(p2NY, p2NX) : 0;
      player2.dashTime = 0.16;
      player2.dashX = Math.cos(angle) * 480;
      player2.dashY = Math.sin(angle) * 480;
      player2.vx = player2.dashX;
      player2.vy = player2.dashY;
      player2.inv = Math.max(player2.inv, 0.18);
    } else if (!keys[';'] && !(_gp1Active && _gp1.p2DashHeld)) {
      player2.dashLatch = false;
    }
    // PVP: P2 melee hits P1
    if (gameMode === 'pvp' && player && player.inv <= 0 && player2.swing > 0) {
      const pvpDx = player.x - player2.x;
      const pvpDy = player.y - player2.y;
      const pvpDist = Math.hypot(pvpDx, pvpDy);
      if (pvpDist < ATTACKS.melee.range + player.r + 4) {
        const pvpAngle = Math.atan2(player2.vy || 0, player2.vx || 1);
        const pvpHitAngle = Math.atan2(pvpDy, pvpDx);
        const pvpDiff = Math.abs(((pvpHitAngle - pvpAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (pvpDiff <= ATTACKS.melee.arc) {
          const pvpDmg = Math.max(1, ATTACKS.melee.damage);
          damagePlayer(pvpDmg, Math.atan2(pvpDy, pvpDx), ATTACKS.melee.push, 'pvp_p2', { ignoreInv: false });
        }
      }
    }
    // Enemy collision damage for P2
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dx = player2.x - enemy.x;
      const dy = player2.y - enemy.y;
      if (Math.hypot(dx, dy) < player2.r + enemy.r + 2 && player2.inv <= 0) {
        damagePlayer2(enemy.dmg || 10, Math.atan2(dy, dx), 220, 'contact');
      }
    }
  }

  function updatePlayerN(dt, pn, n) {
    if (!pn) return;
    const _gpN = window.NeoGamepad?.[n - 1];
    let mX = 0, mY = 0;
    if (_gpN && Math.hypot(_gpN.moveX || 0, _gpN.moveY || 0) > 0.18) { mX = _gpN.moveX; mY = _gpN.moveY; }
    const len = Math.hypot(mX, mY) || 1;
    const nX = len > 0.1 ? mX / len : 0;
    const nY = len > 0.1 ? mY / len : 0;
    if (pn.dashTime > 0) {
      pn.dashTime = Math.max(0, pn.dashTime - dt);
      pn.vx = pn.dashX; pn.vy = pn.dashY;
      pn.inv = Math.max(pn.inv, 0.12);
      if (pn.dashTime <= 0) { pn.dashX = 0; pn.dashY = 0; }
    } else {
      pn.vx = applyResponsiveVelocity(pn.vx, nX * 228, dt);
      pn.vy = applyResponsiveVelocity(pn.vy, nY * 228, dt);
    }
    moveCircle(pn, dt);
    pn.inv = Math.max(0, pn.inv - dt);
    if (pn.swing > 0) pn.swing = Math.max(0, pn.swing - dt);
    if (_gpN && _gpN.p2MeleeHeld && !pn.meleeLatch && pn.swing <= 0) {
      pn.meleeLatch = true;
      const aimAngle = Math.atan2(pn.vy || 0, pn.vx || 1);
      pn.swing = ATTACKS.melee.active; pn.swingA = aimAngle;
      for (const enemy of enemies) {
        if (enemy.dead) continue;
        const dx = enemy.x - pn.x, dy = enemy.y - pn.y;
        if (Math.hypot(dx, dy) > ATTACKS.melee.range + enemy.r + 4) continue;
        const a = Math.atan2(dy, dx);
        if (Math.abs(((a - aimAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI) <= ATTACKS.melee.arc)
          hitEnemy(enemy, Math.max(1, ATTACKS.melee.damage), a, ATTACKS.melee.push, '#a8d8ff');
      }
    } else if (!(_gpN && _gpN.p2MeleeHeld)) { pn.meleeLatch = false; }
    if (_gpN && _gpN.p2DashHeld && !pn.dashLatch && pn.dashTime <= 0) {
      pn.dashLatch = true;
      const angle = len > 0.1 ? Math.atan2(nY, nX) : 0;
      pn.dashTime = 0.16; pn.dashX = Math.cos(angle) * 480; pn.dashY = Math.sin(angle) * 480;
      pn.vx = pn.dashX; pn.vy = pn.dashY; pn.inv = Math.max(pn.inv, 0.18);
    } else if (!(_gpN && _gpN.p2DashHeld)) { pn.dashLatch = false; }
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      if (Math.hypot(pn.x - enemy.x, pn.y - enemy.y) < pn.r + enemy.r + 2 && pn.inv <= 0)
        damagePlayerN(pn, n, enemy.dmg || 10, Math.atan2(pn.y - enemy.y, pn.x - enemy.x), 220);
    }
  }

  function damagePlayerN(pn, n, amount, angle, knockback) {
    if (!pn || pn.inv > 0) return;
    pn.hp -= amount;
    pn.vx += Math.cos(angle) * knockback;
    pn.vy += Math.sin(angle) * knockback;
    pn.inv = 0.75;
    spawnDamagePopup(pn.x, pn.y - 18, amount, { color: '#a8d8ff', size: 16 });
    if (pn.hp <= 0) {
      pn.hp = 0;
      if (n === 3) p3DeadInCoop = true;
      if (n === 4) p4DeadInCoop = true;
      particles.push({ x: pn.x, y: pn.y - 30, life: 1.2, text: `P${n} DOWN`, c: '#a8d8ff' });
      if (p1DeadInCoop && p2DeadInCoop && p3DeadInCoop && p4DeadInCoop) die();
    }
  }

  function damagePlayer2(amount, angle, knockback, source = '') {
    if (!player2 || p2DeadInCoop) return;
    if (player2.inv > 0) return;
    player2.hp -= amount;
    player2.vx += Math.cos(angle) * knockback;
    player2.vy += Math.sin(angle) * knockback;
    player2.inv = 0.75;
    spawnDamagePopup(player2.x, player2.y - 18, amount, { color: '#4ca8ff', size: 16 });
    if (player2.hp <= 0) {
      player2.hp = 0;
      if (gameMode === 'pvp' && pvpState) {
        pvpState.p1Kills = (pvpState.p1Kills || 0) + 1;
        particles.push({ x: player2.x, y: player2.y - 30, life: 1.5, text: `P1 KILL ${pvpState.p1Kills}/${pvpState.killsToWin}`, c: '#ff6b6b' });
        if (pvpState.p1Kills >= pvpState.killsToWin) {
          pvpEndGame('P1');
        } else {
          setTimeout(() => { if (player2) { player2.hp = player2.maxHp; player2.x = START_X + 80; player2.y = START_Y + 40; player2.inv = 1; } }, 1500);
        }
      } else {
        p2DeadInCoop = true;
        particles.push({ x: player2.x, y: player2.y - 30, life: 1.2, text: 'P2 DOWN', c: '#4ca8ff' });
        if (p1DeadInCoop && p2DeadInCoop && p3DeadInCoop && p4DeadInCoop) die();
      }
    }
  }

  function pvpEndGame(winner) {
    pvpState = null;
    player2 = null;
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = 'none';
    particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 40, life: 4, text: `${winner} WINS!`, c: winner === 'P1' ? '#ff6b6b' : '#4ca8ff' });
    setTimeout(() => { die(); }, 3000);
  }

  function damagePlayer(amount, angle, knockback, source = '', options = {}) {
    const sandbox = getActiveSandboxSettings();
    if (sandbox?.godMode) return;
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
    if (sandbox) finalAmount *= sandbox.enemyDamageMultiplier;
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
    if (finalAmount <= 0) {
      if (player.hp <= 0) die();
      return;
    }
    lastDamageSource = getDamageSourceLabel(source);
    lastDamageSourceKey = String(source || '');

    player.hp -= finalAmount;
    achievementEvents.emit('damage:taken', { amount: finalAmount });

    if (getItemCount('insurance') > 0 && player.insuranceReady && hpBeforeHit > halfHpThreshold && player.hp <= halfHpThreshold) {
      player.hp = Math.max(player.hp, halfHpThreshold);
      consumeCharge('insurance');
      particles.push({ x: player.x, y: player.y - 30, life: 0.8, text: 'INSURANCE USED', c: '#e6eeff' });
    }

    finalAmount = Math.max(0, hpBeforeHit - player.hp);
    if (finalAmount > 0) lowHealthHitFlashUntil = Date.now() + LOW_HEALTH_HIT_FLASH_MS;
    if (ironLungApplies) player.roomDamageTaken = (player.roomDamageTaken || 0) + finalAmount;

    if (applyHitstop) {
      player.inv = 0.75;
      player.vx += Math.cos(angle) * knockback;
      player.vy += Math.sin(angle) * knockback;
      applyPlayerImpactStun(finalAmount, knockback);
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
        if (gameMode === 'pvp' && pvpState && player2) {
          pvpState.p2Kills = (pvpState.p2Kills || 0) + 1;
          particles.push({ x: player.x, y: player.y - 30, life: 1.5, text: `P2 KILL ${pvpState.p2Kills}/${pvpState.killsToWin}`, c: '#4ca8ff' });
          if (pvpState.p2Kills >= pvpState.killsToWin) {
            player.hp = 0;
            pvpEndGame('P2');
          } else {
            player.hp = player.maxHp;
            player.x = START_X - 80; player.y = START_Y - 40;
            player.inv = 1;
          }
        } else if (gameMode === 'coop' && (player2 || player3 || player4) && (!p2DeadInCoop || !p3DeadInCoop || !p4DeadInCoop)) {
          particles.push({ x: player.x, y: player.y - 30, life: 1.2, text: 'P1 DOWN', c: '#ff6b6b' });
          player.hp = 0;
          p1DeadInCoop = true;
        } else {
          die();
        }
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
      if (nextRandom('fx') < 0.3) {
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
      if (projectile.enemy && projectile.homing && player) {
        const speed = Math.hypot(Number(projectile.vx || 0), Number(projectile.vy || 0)) || Number(projectile.homingSpeed || 180);
        const targetAngle = Math.atan2(player.y - projectile.y, player.x - projectile.x);
        const currentAngle = Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1));
        const nextAngle = turnAngleToward(currentAngle, targetAngle, Number(projectile.homingTurnRate || 2) * dt);
        const nextSpeed = speed + (Number(projectile.homingSpeed || speed) - speed) * Number(projectile.homingAccel || 2.5) * dt;
        projectile.vx = Math.cos(nextAngle) * nextSpeed;
        projectile.vy = Math.sin(nextAngle) * nextSpeed;
      }
      const prevX = projectile.x;
      const prevY = projectile.y;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      recordProjectileTrail(projectile, prevX, prevY);
      const hitProp = destructibles.find(prop => !prop.broken && !prop.hidden && destructibleIntersectsCircle(prop, projectile.x, projectile.y, projectile.r));
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
        damagePlayer(projectile.damage || 10, Math.atan2(projectile.vy, projectile.vx), projectile.knockback || 120, 'enemy_projectile');
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
      if (hazard.kind === 'explosive_trap') {
        if (!hazard.triggered) {
          const playerNear = dist(player.x, player.y, hazard.x, hazard.y) <= hazard.triggerRadius + player.r;
          const enemyNear = enemies.some(enemy => enemy && dist(enemy.x, enemy.y, hazard.x, hazard.y) <= hazard.triggerRadius + enemy.r);
          if (playerNear || enemyNear) {
            hazard.triggered = true;
            hazard.fuse = hazard.fuseDuration || 0.75;
            hazard.sparkTick = 0;
            particles.push({ x: hazard.x, y: hazard.y - 20, life: 0.5, text: 'CLICK', c: '#ffcc66', size: 12 });
          }
        } else {
          hazard.fuse -= dt;
          hazard.sparkTick = Number(hazard.sparkTick || 0) - dt;
          if (hazard.sparkTick <= 0) {
            particles.push({
              x: hazard.x + rand(7, -7),
              y: hazard.y - 8 + rand(4, -4),
              life: 0.22,
              vx: rand(34, -34),
              vy: rand(-44, -22),
              c: '#ffb347',
              spark: true,
              size: 2.4,
            });
            hazard.sparkTick = 0.07;
          }
          if (hazard.fuse <= 0) {
            if (dist(player.x, player.y, hazard.x, hazard.y) <= hazard.blastRadius + player.r) {
              const angle = Math.atan2(player.y - hazard.y, player.x - hazard.x);
              damagePlayer(hazard.damage || 18, angle, 220, 'explosive_trap');
            }
            blastRadius(hazard.x, hazard.y, hazard.blastRadius || 88, hazard.damage || 18, '#ff9a4d');
            hazard.ttl = 0;
          }
        }
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
          if (nextRandom('fx') < 0.06) particles.push({ x: enemy.x + rand(-6, 6), y: enemy.y + rand(-6, 6), life: 0.3, c: '#ff8c3b' });
          if (enemy.hp <= 0) onEnemyDie(enemy);
        }
        if (hazard.statusTick <= 0) hazard.statusTick = 0.45;
      } else if (hazard.kind === 'lightning_column') {
        hazard.tick -= dt;
        if (hazard.tick <= 0) {
          hazard.tick = hazard.interval || 0.45;
          if (hazard.enemy) {
            if (dist(player.x, player.y, hazard.x, hazard.y) <= hazard.r + player.r) {
              const angle = Math.atan2(player.y - hazard.y, player.x - hazard.x);
              damagePlayer(hazard.damage || 16, angle, 90, hazard.source || 'lightning_column');
            }
          } else {
            for (let ei = enemies.length - 1; ei >= 0; ei -= 1) {
              const enemy = enemies[ei];
              if (!enemy) continue;
              if (dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) continue;
              const angle = Math.atan2(enemy.y - hazard.y, enemy.x - hazard.x);
              hitEnemy(enemy, hazard.damage || 16, angle, 90, '#8dd4ff');
            }
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
        color: prop.kind === 'barrel' ? '#ff9f1c' : prop.reinforced ? '#b8c0ca' : '#ffd27d',
        size: 14,
        outline: prop.reinforced ? '#11151c' : '#2a1800',
      });
    }
    prop.hp -= damage;
    if (prop.hp > 0) return;
    prop.broken = true;
    if (prop.kind === 'pot') {
      const potRandom = createEntityRandom(prop, 'pot:reward');
      if (potRandom() < 0.7) dropCoins(prop.x, prop.y, 6 + floor);
      else pickups.push({ x: prop.x, y: prop.y, type: 'item', key: rollItemDrop({ random: potRandom }) });
    }
    if (prop.kind === 'barrel') {
      blastRadius(prop.x, prop.y, 130, 55, '#ff5a3d');
    }
    if (prop.kind === 'wall') {
      destructibles.forEach(other => {
        if (other.hidden) other.hidden = false;
      });
      for (let index = 0; index < 16; index += 1) {
        particles.push({
          x: prop.x + rand(22, -22, 'fx'),
          y: prop.y + rand(22, -22, 'fx'),
          life: rand(0.55, 0.22, 'fx'),
          vx: rand(110, -110, 'fx'),
          vy: rand(80, -110, 'fx'),
          c: index % 3 === 0 ? '#a09080' : '#c8bfb0',
          spark: true,
          size: rand(3.2, 1.8, 'fx'),
        });
      }
      particles.push({ x: prop.x, y: prop.y - 22, life: 0.75, text: 'CLEAR', c: '#d7f6ff' });
    }
    if (prop.kind === 'cover_wall') {
      const splinters = prop.reinforced ? 18 : 12;
      for (let index = 0; index < splinters; index += 1) {
        particles.push({
          x: prop.x + rand((prop.w || prop.r) * 0.42, -(prop.w || prop.r) * 0.42, 'fx'),
          y: prop.y + rand((prop.h || prop.r) * 0.42, -(prop.h || prop.r) * 0.42, 'fx'),
          life: rand(0.42, 0.18, 'fx'),
          vx: rand(90, -90, 'fx'),
          vy: rand(70, -95, 'fx'),
          c: prop.reinforced ? '#aeb5bd' : '#b87838',
          spark: true,
          size: prop.reinforced ? 2.2 : 2.8,
        });
      }
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
    achievementEvents.emit('heal:applied', { amount: Math.max(0, amount || 0) });
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
      if ((chest.rewardType || 'item') === 'item') {
        pickups.push({ x: chest.x, y: chest.y - 20, type: 'item', key: chest.rewardKey || rollItemDrop({ random: createEntityRandom(chest, 'chest:fallback') }) });
      } else {
        pickups.push({ x: chest.x, y: chest.y - 20, type: 'potion' });
      }
      currentRoom.cleared = chests.every(item => item.open);
      updateObjective();
      scheduleRunSave();
    });
  }

  function canSpawnJesterPortal() {
    if (floorSkipPending <= 0) return false;
    if (floor >= MAX_FLOOR) return false;
    if (!currentRoom) return false;
    if (pickups.some(pickup => pickup?.type === 'jesterPortal')) return false;
    return true;
  }

  function spawnJesterPortalPickup() {
    if (!canSpawnJesterPortal()) return false;
    const skipFloors = Math.max(1, Math.floor(floorSkipPending));
    const preferred = findSafePointNearTarget(player.x, player.y - 96, 24, 180, 20);
    const fallback = findSafePointNearTarget(ROOM_W / 2, ROOM_H / 2, 24, 240, 20) || findSafeSpawnPoint();
    const spawnPoint = preferred || fallback;
    pickups.push({
      x: spawnPoint.x,
      y: spawnPoint.y,
      type: 'jesterPortal',
      skipFloors,
      spawnT: 0,
      activateAt: JESTER_PORTAL_ACTIVATE_DELAY,
      active: false,
    });
    floorSkipPending = 0;
    particles.push({ x: spawnPoint.x, y: spawnPoint.y, life: 0.5, ring: 28, c: '#ff8bd8' });
    particles.push({ x: spawnPoint.x, y: spawnPoint.y - 20, life: 0.8, text: 'CHAOS GATE', c: '#ffc2f0' });
    return true;
  }

  function useJesterPortal(pickup) {
    const skipFloors = clamp(Number(pickup?.skipFloors || 0), 1, MAX_FLOOR - floor);
    if (skipFloors <= 0) return false;
    floor = Math.min(MAX_FLOOR, floor + skipFloors);
    achievementEvents.emit('floor:reached', { floor });
    refreshFloorChargeStates();
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
    persistMetaSoon();
    showFloorTransition = true;
    floorTransitionTime = 0;
    generateFloor();
    scheduleRunSave();
    return true;
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
      } else if (pickup.type === 'jesterPortal') {
        pickup.spawnT = Math.max(0, Number(pickup.spawnT || 0) + dt);
        const activateAt = Math.max(0.01, Number(pickup.activateAt || JESTER_PORTAL_ACTIVATE_DELAY));
        if (!pickup.active && pickup.spawnT >= activateAt) {
          pickup.active = true;
          particles.push({ x: pickup.x, y: pickup.y - 16, life: 0.6, text: 'READY', c: '#ffc2f0' });
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
      const pickupTriggerRadius = pickup.type === 'jesterPortal'
        ? JESTER_PORTAL_TRIGGER_RADIUS
        : pickup.type === 'ladder'
          ? LADDER_TRIGGER_RADIUS
          : 26;
      if (dist(pickup.x, pickup.y, player.x, player.y) >= pickupTriggerRadius) continue;

      if (pickup.type === 'coin') {
        addCoins(pickup.value || 1);
      }

      if (pickup.type === 'potion') {
        if (player.hp >= player.maxHp) continue;
        const potionHeal = getPotionHealAmount();
        player.hp = Math.min(player.maxHp, player.hp + potionHeal);
        particles.push({ x: player.x, y: player.y - 20, life: 0.6, text: `+${potionHeal}`, c: '#0f8' });
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
          if (spawnJesterPortalPickup()) {
            pickups.splice(index, 1);
            scheduleRunSave();
            continue;
          }
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

      if (pickup.type === 'jesterPortal') {
        if (!pickup.active) continue;
        if (useJesterPortal(pickup)) return;
        continue;
      }

      if (pickup.type === 'ladder') {
        const wantsToAscend = !!keys[' '];
        if (!wantsToAscend) {
          ladderUseKeyLatch = false;
          continue;
        }
        if (ladderUseKeyLatch) continue;
        ladderUseKeyLatch = true;
        if (isFirstRunTutorialActive()) tutorialState.usedLadder = true;
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
          collectItem(pickup.rewardKey || rollItemDrop({ elite: true, random: createEntityRandom(pickup, 'secret-vendor:fallback') }));
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
          failChallengeTrial('WRONG BOMB');
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
        achievementEvents.emit('floor:reached', { floor });
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
    // With reduceParticles: cull non-text particles to keep count low
    if (window.NeoSettings?.getAccess()?.reduceParticles) {
      const MAX_REDUCED = 24;
      if (particles.length > MAX_REDUCED) {
        // Remove oldest non-text particles first
        for (let index = 0; index < particles.length && particles.length > MAX_REDUCED; index++) {
          if (!particles[index].text) { particles.splice(index, 1); index--; }
        }
      }
    }
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

    stepActiveTransitionFade(dt);
  }

  function stepActiveTransitionFade(dt) {
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

  function snapCameraToEntity(cam, entity, vpW, vpH) {
    if (!cam || !entity) return;
    cam.x = entity.x - vpW / 2;
    cam.y = entity.y - vpH / 2;
  }

  function syncCamerasAfterTransition() {
    const split = isSplitScreen();
    const sc = split ? getActivePlayerSlots().length : 1;
    const vpW = split ? Math.floor(canvas.width / 2) : canvas.width;
    const vpH = sc >= 3 ? Math.floor(canvas.height / 2) : canvas.height;

    snapCameraToEntity(camera, player, vpW, vpH);
    if (!split) return;
    getLivePlayerSlots().forEach(slot => {
      if (slot.id === 1) return;
      snapCameraToEntity(slot.getCamera(), slot.getEntity(), vpW, vpH);
    });
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
    // Prevent one-frame camera lag that can look like room offset after fades/cutscenes.
    syncCamerasAfterTransition();
  }

  function returnToFloorOne() {
    floor = 1;
    gameElapsedTime = 0;
    refreshFloorChargeStates();
    runLoopIndex += 1;
    achievementEvents.emit('loop:completed', { loopIndex: runLoopIndex });
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
    achievementEvents.emit('meta:coins', { total: metaProgress.coins });
  }

  function getObjectiveEntries(lineObjective = '') {
    if (isFirstRunTutorialActive()) return getTutorialObjectiveEntries();
    if (!currentRoom) return [];
    const entries = [];
    if (floor < MAX_FLOOR || floor > MAX_FLOOR) {
      const ladderRoom = rooms.find(room => room.type === 'ladder');
      entries.push({
        text: ladderRoom?.explored ? 'Reach the ladder room' : 'Find the ladder',
        state: currentRoom.type === 'ladder' ? 'done' : 'todo',
      });
      if (currentRoom.type === 'ladder') {
        const ladderHint = formatControlLabel('space', 'space');
        entries.push({
          text: currentRoom.cleared ? `Ladder room cleared - press ${ladderHint} at ladder to continue` : 'Clear the ladder room',
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
      if (getItemCount('charged_adapter') > 0) {
        const warpHint = formatControlLabel('f', 'f');
        const needed = getChargeRequirement(10);
        const progress = Math.max(0, Number(player?.escapeChargeKills || 0));
        if (player?.escapeReady) {
          entries.push({ text: `Charged Adapter ready: press ${warpHint} to warp to ladder (cost 50% coins)`, state: 'warn' });
        } else {
          entries.push({ text: `Charged Adapter charging: ${progress}/${needed} kills`, state: 'todo' });
        }
      }
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
    if (!currentRoom) {
      uiController.setTutorialBanner('', false);
      return;
    }
    if (isFirstRunTutorialActive()) {
      const tutorialText = getTutorialStepMessage();
      uiController.setTutorialBanner(tutorialText, true);
      uiController.setObjective(tutorialText);
      uiController.setObjectiveList('Tutorial', getTutorialObjectiveEntries());
      return;
    }
    uiController.setTutorialBanner('', false);
    let objective = 'Find the ladder.';
    const setObjective = text => {
      uiController.setObjective(text);
      uiController.setObjectiveList(getRoomLabel(currentRoom.type), getObjectiveEntries(text));
    };
    if (gameMode === 'endless') {
      const displayWave = endlessWave + (endlessWaveActive ? 1 : 0);
      if (!endlessWaveActive) {
        setObjective(endlessWave === 0 ? 'Survive the first wave.' : `Wave ${endlessWave} cleared. Survive the next wave.`);
      } else {
        setObjective(`Survive wave ${displayWave}.`);
      }
      return;
    }
    if (gameMode === 'boss_rush') {
      if (bossRushActive) {
        const bossName = getBossDisplayName(BOSS_RUSH_ORDER[bossRushStage] || BOSS_RUSH_ORDER[0]);
        setObjective(`Defeat ${bossName}.`);
      } else {
        const nextBoss = BOSS_RUSH_ORDER[bossRushStage];
        if (nextBoss) {
          setObjective(`Next: ${getBossDisplayName(nextBoss)}. Get ready.`);
        } else {
          setObjective('Boss Rush complete!');
        }
      }
      return;
    }
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

  function getPlayerSlotScoreText(slot) {
    if (gameMode !== 'pvp' || !pvpState) return '';
    const kills = slot.id === 1 ? pvpState.p1Kills : slot.id === 2 ? pvpState.p2Kills : 0;
    return `K:${kills || 0}/${pvpState.killsToWin}`;
  }

  function getHpFillColor(percent, fallbackColor) {
    if (percent <= 0) return '#485060';
    if (percent > 70) return '#4cbb5a';
    if (percent > 50) return '#d4b840';
    if (percent > 25) return '#d98134';
    return fallbackColor || '#c04040';
  }

  function renderPlayerStatsPanel() {
    if (!ui.playerStats) return;
    const slots = getActivePlayerSlots();
    const activeIds = new Set(slots.map(slot => String(slot.id)));
    ui.playerStats.classList.toggle('player-stats--split', slots.length > 1);
    ui.playerStats.querySelectorAll('[data-player-slot]').forEach(card => {
      if (!activeIds.has(card.dataset.playerSlot || '')) card.remove();
    });
    slots.forEach(slot => {
      const entity = slot.getEntity();
      if (!entity) return;
      const character = CHARACTER_DEFS[entity.character || slot.getCharacter()] || CHARACTER_DEFS.thorn_knight;
      const dead = slot.getDead();
      const hpPercent = dead ? 0 : Math.max(0, Math.min(100, (entity.hp / Math.max(1, entity.maxHp)) * 100));
      const xpPercent = Math.max(0, Math.min(100, (Number(entity.xp || 0) / Math.max(1, Number(entity.xpToNext || 1))) * 100));
      const scoreText = getPlayerSlotScoreText(slot);
      const hpText = dead ? 'DOWN' : `${Math.ceil(entity.hp)}/${entity.maxHp}`;
      const metaText = scoreText || `${entity.coins || 0} coins`;
      const showPlayerLabel = slots.length > 1;
      let card = ui.playerStats.querySelector(`[data-player-slot="${slot.id}"]`);
      if (!card) {
        card = document.createElement('section');
        card.className = 'player-stat-card';
        card.dataset.playerSlot = String(slot.id);
        card.innerHTML = `
          <div class="player-stat-head">
            <span class="player-stat-label"><i class="player-stat-dot"></i><span data-player-field="label"></span></span>
            <span class="player-stat-name" data-player-field="name"></span>
          </div>
          <div class="player-stat-row">
            <span>HP</span>
            <div class="bar player-hp-bar"><i class="player-stat-fill" data-player-field="hpFill"></i></div>
            <span data-player-field="hpText"></span>
          </div>
          <div class="player-stat-row">
            <span>XP</span>
            <span class="player-level-badge" data-player-field="level"></span>
            <div class="bar player-xp-bar"><i class="player-stat-fill player-stat-fill--xp" data-player-field="xpFill"></i></div>
            <span data-player-field="xpText"></span>
          </div>
          <div class="player-stat-row">
            <span>INF</span>
            <span></span>
            <span data-player-field="meta"></span>
          </div>`;
        ui.playerStats.appendChild(card);
      }
      card.style.setProperty('--player-color', slot.color);
      card.classList.toggle('player-stat-card--dead', dead);
      card.classList.toggle('player-stat-card--solo', !showPlayerLabel);
      card.querySelector('[data-player-field="label"]').textContent = showPlayerLabel ? slot.label : '';
      card.querySelector('[data-player-field="name"]').textContent = character.name || slot.getCharacter();
      card.querySelector('[data-player-field="hpText"]').textContent = hpText;
      card.querySelector('[data-player-field="level"]').textContent = `Lv.${entity.level || 1}`;
      card.querySelector('[data-player-field="xpText"]').textContent = `${entity.xp || 0}/${entity.xpToNext || 0}`;
      card.querySelector('[data-player-field="meta"]').textContent = metaText;
      const hpFill = card.querySelector('[data-player-field="hpFill"]');
      const xpFill = card.querySelector('[data-player-field="xpFill"]');
      if (hpFill) {
        hpFill.style.width = `${hpPercent.toFixed(1)}%`;
        hpFill.style.background = getHpFillColor(hpPercent, slot.color);
      }
      if (xpFill) xpFill.style.width = `${xpPercent.toFixed(1)}%`;
    });

    if (ui.playerHpFill && player) {
      const p1Percent = Math.max(0, Math.min(100, (player.hp / Math.max(1, player.maxHp)) * 100));
      ui.playerHpFill.style.width = `${p1Percent}%`;
      ui.playerHpFill.style.background = getHpFillColor(p1Percent, PLAYER_SLOT_CONFIG[0].color);
      ui.playerHpTxt.textContent = gameMode === 'pvp' && pvpState
        ? `${Math.ceil(player.hp)} | ${getPlayerSlotScoreText(PLAYER_SLOT_CONFIG[0])}`
        : `${Math.ceil(player.hp)}/${player.maxHp}`;
    }
    if (ui.playerXpFill && player) {
      const xpPercent = Math.max(0, Math.min(100, (player.xp / Math.max(1, player.xpToNext)) * 100));
      ui.playerXpFill.style.width = `${xpPercent}%`;
      ui.playerXpTxt.textContent = `${player.xp}/${player.xpToNext}`;
      const levelEl = document.getElementById('playerLevelTxt');
      if (levelEl) levelEl.textContent = `Lv.${player.level || 1}`;
    }
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
      difficultyName: getDifficultyDef(selectedDifficulty).name,
      itemRarityCounts: getItemRarityCounts(player),
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
    renderPlayerStatsPanel();
    
    // Update center display
    if (ui.coinCount) ui.coinCount.textContent = player.coins;
    if (ui.hudLoopCount) ui.hudLoopCount.textContent = Number(metaProgress.loopCrystals || 0);
    if (ui.timerDisplay) ui.timerDisplay.textContent = timeStr;
    if (ui.floorDisplay) ui.floorDisplay.textContent = floor;
    if (ui.difficultyDisplay) ui.difficultyDisplay.textContent = getDifficultyDef(selectedDifficulty).name.toUpperCase();
    if (ui.itemRarityCounts) {
      const rarityCounts = getItemRarityCounts(player);
      const white = ui.itemRarityCounts.querySelector('.rarity-count--white');
      const purple = ui.itemRarityCounts.querySelector('.rarity-count--purple');
      const red = ui.itemRarityCounts.querySelector('.rarity-count--red');
      if (white) white.textContent = String(rarityCounts.white);
      if (purple) purple.textContent = String(rarityCounts.purple);
      if (red) red.textContent = String(rarityCounts.red);
    }
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

    if (ui.adapterStatus) {
      const hasAdapter = getItemCount('charged_adapter') > 0;
      const showAdapter = hasAdapter && (gameState === 'play' || gameState === 'pause');
      if (ui.hudLower) {
        ui.hudLower.classList.toggle('hidden', !showAdapter);
        ui.hudLower.setAttribute('aria-hidden', showAdapter ? 'false' : 'true');
      }
      ui.adapterStatus.classList.toggle('hidden', !showAdapter);
      ui.adapterStatus.setAttribute('aria-hidden', showAdapter ? 'false' : 'true');
      ui.adapterStatus.classList.toggle('is-ready', false);
      ui.adapterStatus.classList.toggle('is-blocked', false);
      const adapterItem = itemRegistry.get('charged_adapter') || ITEM_DEFS.charged_adapter;
      if (showAdapter && ui.adapterStatusIcon && adapterItem) drawItemToastIcon(ui.adapterStatusIcon, adapterItem);
      if (showAdapter) {
        const warpKey = formatControlLabel('f', 'f');
        const needed = getChargeRequirement(10);
        const progress = Math.max(0, Number(player?.escapeChargeKills || 0));
        if (!player.escapeReady) {
          if (ui.adapterStatusText) ui.adapterStatusText.textContent = `Adapter [${warpKey}]: charging ${progress}/${needed}`;
          ui.adapterStatus.classList.add('is-blocked');
        } else if (!currentRoom || currentRoom.type === 'boss' || currentRoom.type === 'god') {
          if (ui.adapterStatusText) ui.adapterStatusText.textContent = `Adapter [${warpKey}]: no warp in boss room`;
          ui.adapterStatus.classList.add('is-blocked');
        } else if (enemies.length === 0) {
          if (ui.adapterStatusText) ui.adapterStatusText.textContent = `Adapter [${warpKey}]: requires active combat`;
          ui.adapterStatus.classList.add('is-blocked');
        } else {
          if (ui.adapterStatusText) ui.adapterStatusText.textContent = `Adapter [${warpKey}]: ready - warp to ladder (50% coin cost)`;
          ui.adapterStatus.classList.add('is-ready');
        }
      } else if (ui.adapterStatusText) {
        ui.adapterStatusText.textContent = '';
      }
    }
    
    if (ui.interactPrompt) {
      const shopHint = getControlHint('e', 'e');
      const isShop = currentRoom?.type === 'shop' && !isPanelOpen(ui.shopPanel);
      const isAnvil = currentRoom?.type === 'anvil' && !isPanelOpen(ui.anvilPanel);
      if (isShop) {
        ui.interactPrompt.textContent = `[${shopHint}]  Open Shop`;
        ui.interactPrompt.classList.remove('hidden', 'interact-prompt--forge');
      } else if (isAnvil) {
        ui.interactPrompt.textContent = `[${shopHint}]  Open Forge`;
        ui.interactPrompt.classList.remove('hidden');
        ui.interactPrompt.classList.add('interact-prompt--forge');
      } else {
        ui.interactPrompt.classList.add('hidden');
      }
    }

    updateItemUI();
  }

  function finalizeRun(result, extra = {}) {
    const previousRecords = deriveRunRecords(runHistory);
    const entry = buildRunHistoryEntry(result, extra);
    pushRunHistoryEntry(entry);
    const nextRecords = syncMetaRecordsFromRunHistory();
    const newRecords = {};
    if (nextRecords.floor > previousRecords.floor && entry.floor >= nextRecords.floor) newRecords.floor = true;
    if (nextRecords.kills > previousRecords.kills && entry.kills >= nextRecords.kills) newRecords.kills = true;
    if (nextRecords.level > previousRecords.level && entry.level >= nextRecords.level) newRecords.level = true;
    if (nextRecords.time > previousRecords.time && entry.elapsedSeconds >= nextRecords.time) newRecords.time = true;
    if (nextRecords.coins > previousRecords.coins && entry.coins >= nextRecords.coins) newRecords.coins = true;
    entry._newRecords = newRecords;
    return entry;
  }

  function getReviveCost() {
    return runRevivesUsed > 0 ? 3 : 1;
  }

  function canReviveFromDeath() {
    return gameState === 'dead' && player && currentRoom && Number(metaProgress.loopCrystals || 0) >= getReviveCost();
  }

  function reviveFromDeath() {
    if (!canReviveFromDeath()) {
      particles.push({ x: player?.x ?? START_X, y: (player?.y ?? START_Y) - 28, life: 0.8, text: 'NEED LOOP CRYSTALS', c: '#ff9e9e' });
      uiController.setDeadScreen(playerDeathAnim?.entry || { floor, level: player?.level || 1, kills: player?.kills || 0, coins: player?.coins || 0, difficulty: selectedDifficulty });
      return false;
    }
    const cost = getReviveCost();
    metaProgress.loopCrystals = Math.max(0, Number(metaProgress.loopCrystals || 0) - cost);
    runRevivesUsed += 1;
    if (lastDeathEntryId) {
      runHistory = runHistory.filter(entry => entry.id !== lastDeathEntryId);
      lastDeathEntryId = '';
    }
    playerDeathAnim = null;
    player.hp = Math.max(1, Math.round(player.maxHp * 0.45));
    player.inv = Math.max(player.inv || 0, 1.5);
    player.stun = 0;
    player.vx = 0;
    player.vy = 0;
    player.dashTime = 0;
    projectiles = [];
    hazards = [];
    lastDamageSource = '';
    lastDamageSourceKey = '';
    setGameState('play');
    particles.push({ x: player.x, y: player.y - 28, life: 1, text: `REVIVED -${cost} LC`, c: '#8dd4ff' });
    persistMetaSoon();
    scheduleRunSave();
    updateHud();
    return true;
  }

  function die() {
    if (gameState === 'dying' || gameState === 'dead') return;
    if (gameMode === 'pvp' && pvpState) return;
    if (gameMode === 'coop' && ((!p2DeadInCoop && player2) || (!p3DeadInCoop && player3) || (!p4DeadInCoop && player4))) {
      if (player) player.hp = 0;
      p1DeadInCoop = true;
      particles.push({ x: player?.x ?? 0, y: (player?.y ?? 0) - 30, life: 1.2, text: 'P1 DOWN', c: '#ff6b6b' });
      return;
    }
    if (player) player.hp = 0;
    updateHud();
    const entry = finalizeRun('dead', { killedBy: lastDamageSource, killerKey: lastDamageSourceKey });
    lastDeathEntryId = entry.id;
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
    speakKillerDeathQuote(entry?.killerKey || '', entry?.killedBy || '');
    setGameState('dead');
    uiController.setDeadScreen(entry);
  }

  function win() {
    const entry = finalizeRun('win');
    achievementEvents.emit('run:won', { elapsedSeconds: gameElapsedTime, playerHp: Math.round(player?.hp || 0) });
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

  function queueMenuRefresh() {
    if (menuRefreshQueued) return;
    menuRefreshQueued = true;
    requestAnimationFrame(() => {
      menuRefreshQueued = false;
      refreshMenuState();
    });
  }

  function queueMetaSave() {
    metaSaveDirty = true;
    if (metaSavePendingTimer) return;
    metaSavePendingTimer = setTimeout(() => {
      metaSavePendingTimer = 0;
      if (!metaSaveDirty) return;
      metaSaveDirty = false;
      void saveStore.put('meta', metaProgress).catch(error => {
        console.error('Failed to save meta', error);
      });
    }, 250);
  }

  function persistMetaSoon() {
    metaProgress.customDifficultySettings = { ...customDifficultySettings };
    metaProgress.sandboxSettings = normalizeSandboxSettings(sandboxSettings);
    metaProgress.selectedCharacter = chosenCharacter;
    queueMenuRefresh();
    queueMetaSave();
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
      mode: normalizeGameMode(gameMode),
      baseSeedStr,
      seedStr,
      runLoopIndex,
      runRevivesUsed,
      rngState: getRngState(),
      difficulty: selectedDifficulty,
      challenges: normalizeChallengeSelection(selectedChallenges),
      floor,
      rooms,
      currentRoom: { gx: currentRoom.gx, gy: currentRoom.gy },
      player,
      player2: isMultiplayerMode() ? player2 : null,
      player3: isMultiplayerMode() ? player3 : null,
      player4: isMultiplayerMode() ? player4 : null,
      p1DeadInCoop,
      p2DeadInCoop,
      p3DeadInCoop,
      p4DeadInCoop,
      pvpState: gameMode === 'pvp' && pvpState ? { ...pvpState, respawnTimer: null } : null,
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
      rivals,
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
      monsterRoamTimer,
      knaveKnightCutscenePlayed,
      queenMetaoCutscenePlayed,
      camera,
    };
  }

  async function deleteSavedRun() {
    activeRun = null;
    await saveStore.delete('run');
    refreshMenuState();
  }

  function drawWorldViewport(cam, vpX, vpW, vpH, vpY, pLabel, slot = null) {
    const isDying = gameState === 'dying';
    const slotDead = !!slot?.getDead?.();
    const _shakeOn = window.NeoSettings?.getAccess()?.screenShake !== false;
    const sX = _shakeOn && pLabel === 'P1' ? (nextRandom('fx') - 0.5) * shake * 2 : 0;
    const sY = _shakeOn && pLabel === 'P1' ? (nextRandom('fx') - 0.5) * shake * 2 : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(vpX, vpY, vpW, vpH);
    ctx.clip();
    ctx.translate(vpX - cam.x + sX, vpY - cam.y + sY);
    drawFloor();
    drawRoomDecor();
    drawWorldProps();
    drawDeadBodies();
    drawChests();
    drawPickups();
    drawProjectiles();
    drawEnemyTelegraphs();
    drawEnemies();
    drawRoomCeilingMask();
    if (!isDying) {
      if (isMultiplayerMode()) {
        getActivePlayerSlots().forEach(drawSlot => {
          if (drawSlot.getDead()) return;
          if (drawSlot.id === 1) drawPlayer();
          else drawPlayerSlot(drawSlot);
        });
      } else {
        drawPlayer();
      }
    }
    if (!isDying) drawPlayerLaser();
    if (isDying && playerDeathAnim) drawPlayerCorpseAnim(playerDeathAnim);
    drawParticles();
    if (!isDying) drawLadderPrompt();
    if (!isDying) drawJesterPortalPrompt();
    // P-label in corner of each viewport (split only)
    if (isSplitScreen() && pLabel) {
      const slot = getActivePlayerSlots().find(candidate => candidate.label === pLabel);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = slot?.color || '#fff';
      ctx.fillText(pLabel, vpX + 8, vpY + 18);
      ctx.restore();
    }
    if (slotDead && pLabel) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,.52)';
      ctx.fillRect(vpX, vpY, vpW, vpH);
      ctx.fillStyle = slot?.color || '#dfeeff';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pLabel} DOWN`, vpX + vpW / 2, vpY + vpH / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  function getActiveRoomChamber(room, entity = player) {
    if (!room || !entity || !Array.isArray(room.layoutChambers) || room.layoutChambers.length === 0) return null;
    const containing = room.layoutChambers.find(chamber => (
      entity.x >= chamber.x - chamber.w / 2
      && entity.x <= chamber.x + chamber.w / 2
      && entity.y >= chamber.y - chamber.h / 2
      && entity.y <= chamber.y + chamber.h / 2
    ));
    if (containing) return containing;

    let nearest = room.layoutChambers[0];
    let bestDistance = Infinity;
    room.layoutChambers.forEach(chamber => {
      const distance = Math.hypot(entity.x - chamber.x, entity.y - chamber.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = chamber;
      }
    });
    return nearest;
  }

  function withRoundedClipRect(rect, radius, drawFn) {
    if (!rect || typeof drawFn !== 'function') return;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  function getRoomDarkness(room, lights) {
    const baseDarkness = room?.type === 'boss'
      ? LIGHTING_CONFIG.darkness.boss
      : room?.type === 'challenge'
        ? LIGHTING_CONFIG.darkness.challenge
        : LIGHTING_CONFIG.darkness.combat;
    const lightPressure = Math.min(1.2, lights.reduce((sum, light) => sum + light.strength, 0) / 14);
    return Math.max(0, baseDarkness - lightPressure * LIGHTING_CONFIG.darkness.lightRelief);
  }

  function createRoomDarknessGradient(alpha) {
    const darkness = ctx.createLinearGradient(0, 0, 0, ROOM_H);
    darkness.addColorStop(0, `rgba(10,14,22,${Math.min(0.28, alpha + 0.035)})`);
    darkness.addColorStop(0.5, `rgba(5,7,12,${alpha})`);
    darkness.addColorStop(1, `rgba(8,11,18,${Math.min(0.32, alpha + 0.05)})`);
    return darkness;
  }

  function carveSoftLight(x, y, innerRadius, outerRadius, strength = 1, clipRect = null) {
    const drawLight = () => {
      const gradient = ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
      gradient.addColorStop(0, 'rgba(0,0,0,1)');
      gradient.addColorStop(0.26, 'rgba(0,0,0,0.72)');
      gradient.addColorStop(0.66, 'rgba(0,0,0,0.22)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = clamp(strength, 0, 1.12);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - outerRadius, y - outerRadius, outerRadius * 2, outerRadius * 2);
    };

    if (clipRect) {
      withRoundedClipRect(clipRect, 32, drawLight);
      return;
    }
    drawLight();
  }

  function carvePlayerBeamLights() {
    if (laserActive) {
      const angle = laserMode === 'god_sweep'
        ? laserAngle
        : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
      const beamPath = buildRicochetBeamPath(player.x, player.y, angle, getPlayerBeamRange(laserMode, getEquippedMove('laser')), getPlayerBeamBounceCount(laserMode));
      carveBeamLight(beamPath, laserMode === 'god_sweep' ? 42 : laserMode === 'turtle_wave' ? 34 : 22, laserMode === 'god_sweep' ? 0.9 : 0.7);
      return;
    }

    if (getEquippedWeapon() !== 'lazer_glasses' || player.weaponBeamTime <= 0) return;
    const baseAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    [-0.2, 0.2].forEach(offset => {
      const beamPath = buildRicochetBeamPath(player.x, player.y, baseAngle + offset, 430, LAZER_GLASSES_BOUNCES);
      carveBeamLight(beamPath, 14, 0.46);
    });
  }

  function carveEnemyBeamLights() {
    enemies.forEach(enemy => {
      if (!enemy || Number(enemy.beamTime || 0) <= 0 || !Number.isFinite(enemy.beamAngle)) return;
      const beamPath = buildRicochetBeamPath(enemy.x, enemy.y, enemy.beamAngle, enemy.type === 'god' ? 620 : 460, getEnemyBeamBounceCount(enemy));
      carveBeamLight(beamPath, enemy.type === 'god' ? 36 : 18, enemy.type === 'god' ? 0.72 : 0.42);
    });
  }

  function lightTintWithAlpha(tint, alpha) {
    const match = /^rgba\((\s*\d+\s*,\s*\d+\s*,\s*\d+\s*),\s*[\d.]+\)$/.exec(tint);
    return match ? `rgba(${match[1]}, ${alpha})` : 'rgba(255,255,255,0)';
  }

  function drawLightBloom(lights) {
    ctx.globalCompositeOperation = 'lighter';
    lights.forEach(light => {
      if (!light.tint) return;
      const glow = ctx.createRadialGradient(light.x, light.y, Math.max(4, light.inner * 0.35), light.x, light.y, light.outer);
      glow.addColorStop(0, light.tint);
      glow.addColorStop(0.58, lightTintWithAlpha(light.tint, 0.02));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.globalAlpha = Math.min(0.46, light.strength * 0.46);
      ctx.fillRect(light.x - light.outer, light.y - light.outer, light.outer * 2, light.outer * 2);
    });
  }

  function drawRoomCeilingMask() {
    const room = currentRoom;
    if (!room || LIGHTING_CONFIG.clearRoomTypes.has(room.type)) return;
    const lights = collectRoomLightSources(room);
    const darknessAlpha = getRoomDarkness(room, lights);
    if (darknessAlpha < LIGHTING_CONFIG.darkness.minVisible) return;

    ctx.save();
    ctx.fillStyle = createRoomDarknessGradient(darknessAlpha);
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    ctx.globalCompositeOperation = 'destination-out';

    lights.forEach(light => {
      carveSoftLight(light.x, light.y, light.inner, light.outer, light.strength, null);
    });

    carvePlayerBeamLights();
    carveEnemyBeamLights();
    drawLightBloom(lights);
    ctx.restore();
  }

  function draw() {
    const isDying = gameState === 'dying';
    const isPlayLike = gameState === 'play' || gameState === 'pause' || gameState === 'dialogue' || isDying;
    let sectionPerfStart = perfStart();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isPlayLike) {
      const split = isSplitScreen();
      if (split) {
        const slots = getActivePlayerSlots();
        const sc = slots.length;
        const vpW = Math.floor(canvas.width / 2);
        const vpH = sc >= 3 ? Math.floor(canvas.height / 2) : canvas.height;
        slots.forEach((slot, index) => {
          const col = index % 2;
          const row = sc >= 3 ? Math.floor(index / 2) : 0;
          drawWorldViewport(slot.getCamera(), col * vpW, vpW, vpH, row * vpH, slot.label, slot);
        });
        // Dividers
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(vpW - 1, 0, 2, canvas.height);
        if (sc >= 3) ctx.fillRect(0, vpH - 1, canvas.width, 2);
        ctx.restore();
      } else {
        drawWorldViewport(camera, 0, canvas.width, canvas.height, 0, null);
      }
      perfEnd('draw.room', sectionPerfStart);
    }

    sectionPerfStart = perfStart();
    if (isPlayLike && !isDying) {
      const minimapLayout = drawMinimap();
      uiController.setObjectiveLayout(minimapLayout?.viewportBounds || null);
    } else {
      minimapLayoutState = null;
      uiController.setObjectiveLayout(null);
    }
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
    const access = window.NeoSettings?.getAccess() || {};
    const now = Date.now();
    const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
    const hitFlashActive = lowHealthHitFlashUntil > now;
    // With reduceFlash: skip the hit-flash-at-healthy-HP effect entirely; static glow only.
    const isForcedHitFlash = !access.reduceFlash && hitFlashActive && hpRatio >= 0.2;
    const effectiveHpRatio = isForcedHitFlash ? 0.17 : hpRatio;
    if (effectiveHpRatio >= 0.2) return;

    const danger = (0.2 - effectiveHpRatio) / 0.2;
    // With reduceFlash: no sine pulse — use a stable alpha
    const pulse = access.reduceFlash ? 0.82 : (0.74 + Math.sin(now / 120) * 0.18);
    const baseAlpha = clamp((0.16 + danger * 0.34) * pulse, 0, 0.52);
    const alpha = isForcedHitFlash ? baseAlpha * 0.45 : baseAlpha;
    const baseEdge = Math.max(92, Math.min(canvas.width, canvas.height) * (0.18 + danger * 0.08));
    const edge = isForcedHitFlash ? baseEdge * 0.78 : baseEdge;

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

  function drawLadderPrompt() {
    if (gameState !== 'play' || !currentRoom?.cleared) return;
    const ladder = pickups.find(pickup => pickup?.type === 'ladder');
    if (!ladder) return;
    if (dist(player.x, player.y, ladder.x, ladder.y) > LADDER_TRIGGER_RADIUS) return;
    const cx = ladder.x;
    const cy = ladder.y - 36;
    ctx.save();
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ladderHint = formatControlLabel('space', 'space');
    const text = `Press [${ladderHint}] to go to next floor`;
    const pad = 14;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(10,24,14,0.86)';
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2 - pad, cy - 13, tw + pad * 2, 26, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,255,158,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#8fffaf';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  function drawJesterPortalPrompt() {
    if (gameState !== 'play') return;
    const portal = pickups.find(pickup => pickup?.type === 'jesterPortal' && pickup.active);
    if (!portal) return;
    if (dist(player.x, player.y, portal.x, portal.y) > 74) return;
    const cx = portal.x;
    const cy = portal.y - 38;
    const floors = Math.max(1, Number(portal.skipFloors || 1));
    ctx.save();
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = `Touch to skip ${floors} floors`;
    const pad = 14;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(28,11,32,0.86)';
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2 - pad, cy - 13, tw + pad * 2, 26, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,155,228,0.62)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffc9ef';
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
      } else if (decor.kind === 'torch') {
        ctx.fillStyle = 'rgba(28, 20, 12, 0.95)';
        ctx.fillRect(-2, -6, 4, 18);
        ctx.fillStyle = '#5b6670';
        ctx.fillRect(-6, -4, 12, 4);
        ctx.shadowColor = '#ff9648';
        ctx.shadowBlur = 14;
        ctx.fillStyle = 'rgba(255, 126, 58, 0.92)';
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.quadraticCurveTo(7, -8, 0, -2);
        ctx.quadraticCurveTo(-7, -9, 0, -18);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 226, 150, 0.82)';
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.quadraticCurveTo(4, -9, 0, -5);
        ctx.quadraticCurveTo(-4, -9, 0, -15);
        ctx.fill();
        ctx.shadowBlur = 0;
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

  function drawCoverWall(prop) {
    const w = Math.max(16, Number(prop.w || prop.r * 2 || 48));
    const h = Math.max(16, Number(prop.h || prop.r * 2 || 48));
    const left = -w / 2;
    const top = -h / 2;
    const hpRatio = clamp(Number(prop.hp || 0) / Math.max(1, Number(prop.maxHp || prop.hp || 1)), 0, 1);
    const damageAlpha = (1 - hpRatio) * 0.45;

    const wood = ctx.createLinearGradient(left, top, left + w, top + h);
    wood.addColorStop(0, '#5b341d');
    wood.addColorStop(0.5, '#8a5229');
    wood.addColorStop(1, '#4b2a18');
    ctx.fillStyle = wood;
    ctx.fillRect(left, top, w, h);

    const horizontal = w >= h;
    const plankCount = Math.max(2, Math.floor((horizontal ? h : w) / 18));
    ctx.strokeStyle = 'rgba(38,20,10,0.72)';
    ctx.lineWidth = 2;
    for (let index = 1; index < plankCount; index += 1) {
      ctx.beginPath();
      if (horizontal) {
        const y = top + (h / plankCount) * index;
        ctx.moveTo(left + 3, y);
        ctx.lineTo(left + w - 3, y);
      } else {
        const x = left + (w / plankCount) * index;
        ctx.moveTo(x, top + 3);
        ctx.lineTo(x, top + h - 3);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(245,188,104,0.18)';
    ctx.lineWidth = 1;
    for (let index = 0; index < 4; index += 1) {
      const offset = (index + 0.35) / 4;
      ctx.beginPath();
      if (horizontal) {
        const y = top + h * offset;
        ctx.moveTo(left + 8, y);
        ctx.lineTo(left + w - 8, y + Math.sin(index + prop.x * 0.01) * 3);
      } else {
        const x = left + w * offset;
        ctx.moveTo(x, top + 8);
        ctx.lineTo(x + Math.sin(index + prop.y * 0.01) * 3, top + h - 8);
      }
      ctx.stroke();
    }

    if (prop.reinforced) {
      ctx.fillStyle = 'rgba(96, 105, 116, 0.92)';
      ctx.strokeStyle = 'rgba(190, 198, 208, 0.42)';
      ctx.lineWidth = 1;
      if (horizontal) {
        [-0.28, 0.28].forEach(offset => {
          const y = offset * h;
          ctx.fillRect(left, y - 5, w, 10);
          ctx.strokeRect(left + 0.5, y - 4.5, w - 1, 9);
        });
      } else {
        [-0.28, 0.28].forEach(offset => {
          const x = offset * w;
          ctx.fillRect(x - 5, top, 10, h);
          ctx.strokeRect(x - 4.5, top + 0.5, 9, h - 1);
        });
      }
    }

    if (damageAlpha > 0) {
      ctx.fillStyle = `rgba(20, 10, 4, ${damageAlpha})`;
      ctx.fillRect(left, top, w, h);
      ctx.strokeStyle = `rgba(255, 210, 140, ${0.22 + damageAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left + w * 0.25, top + h * 0.25);
      ctx.lineTo(left + w * 0.46, top + h * 0.52);
      ctx.lineTo(left + w * 0.4, top + h * 0.78);
      ctx.moveTo(left + w * 0.64, top + h * 0.18);
      ctx.lineTo(left + w * 0.55, top + h * 0.48);
      ctx.lineTo(left + w * 0.74, top + h * 0.72);
      ctx.stroke();
    }

    ctx.strokeStyle = prop.reinforced ? 'rgba(198, 205, 214, 0.58)' : 'rgba(38, 20, 10, 0.92)';
    ctx.lineWidth = prop.reinforced ? 2.5 : 2;
    ctx.strokeRect(left + 1, top + 1, w - 2, h - 2);
  }

  function carveBeamLight(path, maxWidth, strength = 0.5) {
    if (!Array.isArray(path) || path.length < 2) return;
    ctx.save();
    ctx.globalAlpha = clamp(strength, 0, 1);
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = Math.max(8, maxWidth * 1.8);
    for (let index = 0; index < path.length - 1; index += 1) {
      const start = path[index];
      const end = path[index + 1];
      ctx.lineWidth = maxWidth;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function pushLightSource(target, x, y, inner, outer, strength, tint = '') {
    if (target.length >= LIGHTING_CONFIG.maxLights) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(outer) || outer <= 0) return;
    if (x + outer < 0 || x - outer > ROOM_W || y + outer < 0 || y - outer > ROOM_H) return;

    const cleanOuter = clamp(outer, 8, LIGHTING_CONFIG.maxOuterRadius);
    const cleanInner = clamp(Number.isFinite(inner) ? inner : 0, 0, cleanOuter * 0.72);
    const cleanStrength = clamp(Number.isFinite(strength) ? strength : 0.5, 0, 1.1);
    target.push({ x, y, inner: cleanInner, outer: cleanOuter, strength: cleanStrength, tint });
  }

  function collectRoomLightSources(room) {
    const lights = [];
    const activeChamber = getActiveRoomChamber(room, player);
    pushLightSource(
      lights,
      ROOM_W / 2,
      ROOM_H / 2,
      LIGHTING_CONFIG.ambient.inner,
      Math.max(ROOM_W, ROOM_H) * LIGHTING_CONFIG.ambient.outerScale,
      room?.type === 'boss' ? LIGHTING_CONFIG.ambient.bossStrength : LIGHTING_CONFIG.ambient.strength,
      LIGHTING_CONFIG.ambient.tint
    );
    if (activeChamber && Array.isArray(room?.layoutChambers) && room.layoutChambers.length > 1) {
      pushLightSource(lights, activeChamber.x, activeChamber.y, 36, Math.max(activeChamber.w, activeChamber.h) * 0.58, 0.22, 'rgba(120, 160, 255, 0.05)');
    }

    pushLightSource(
      lights,
      player.x,
      player.y - 8,
      LIGHTING_CONFIG.player.inner,
      LIGHTING_CONFIG.player.outer,
      LIGHTING_CONFIG.player.strength,
      LIGHTING_CONFIG.player.tint
    );

    decorations.forEach(decor => {
      if (!decor) return;
      const flameT = Date.now() * 0.007 + decor.x * 0.017 + decor.y * 0.011;
      const flicker = 1 + Math.sin(flameT) * 0.08 + Math.cos(flameT * 1.9) * 0.05;
      if (decor.kind === 'brazier') {
        pushLightSource(
          lights,
          decor.x,
          decor.y - 8,
          20,
          decor.r * 8.8 * flicker,
          1,
          'rgba(255, 146, 74, 0.16)'
        );
      } else if (decor.kind === 'torch') {
        pushLightSource(
          lights,
          decor.x,
          decor.y - 12,
          34,
          286 * flicker,
          1.1,
          'rgba(255, 176, 94, 0.24)'
        );
        // Add a softer wide spill so torches brighten nearby floor, not just the immediate hotspot.
        pushLightSource(
          lights,
          decor.x,
          decor.y - 10,
          96,
          448 * flicker,
          0.52,
          'rgba(255, 206, 142, 0.12)'
        );
      }
    });

    hazards.forEach(hazard => {
      if (!hazard) return;
      if (hazard.kind === 'lava') {
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * 0.25, hazard.r * 2.7, 0.95, 'rgba(255, 92, 44, 0.12)');
      } else if (hazard.kind === 'fire_circle') {
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * 0.35, hazard.r * 1.75, 0.72, 'rgba(255, 120, 54, 0.08)');
      } else if (hazard.kind === 'lightning_column') {
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * 0.22, hazard.r * 1.8, 0.82, 'rgba(124, 200, 255, 0.09)');
      } else if (hazard.kind === 'explosive_trap' && hazard.triggered) {
        pushLightSource(lights, hazard.x, hazard.y, 10, hazard.blastRadius * 0.72, 0.52, 'rgba(255, 122, 70, 0.06)');
      }
    });

    projectiles.forEach(projectile => {
      if (!projectile || !Number.isFinite(projectile.x) || !Number.isFinite(projectile.y)) return;
      const kind = projectile.kind || '';
      if (kind === 'fireball') {
        pushLightSource(lights, projectile.x, projectile.y, projectile.r * 0.8, 90, 0.86, 'rgba(255, 118, 42, 0.1)');
      } else if (kind === 'disk' || kind === 'cult_missile') {
        pushLightSource(lights, projectile.x, projectile.y, projectile.r * 0.7, 70, 0.58, 'rgba(182, 108, 255, 0.08)');
      } else if (kind === 'sniper_round' || kind === 'machine_round' || kind === 'magenta_degale') {
        pushLightSource(lights, projectile.x, projectile.y, projectile.r * 0.45, 42, 0.34, 'rgba(255, 148, 92, 0.04)');
      }
    });

    return lights;
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
      } else if (hazard.kind === 'explosive_trap') {
        const t = Date.now() * 0.008 + hazard.x * 0.01;
        const armed = !!hazard.triggered;
        const pulse = armed ? 1 + Math.sin(t * 2.4) * 0.12 : 1 + Math.sin(t * 0.8) * 0.03;
        ctx.fillStyle = 'rgba(18,19,22,0.95)';
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * 1.05, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = armed ? '#ff9250' : 'rgba(255,200,120,0.55)';
        ctx.lineWidth = armed ? 3 : 2;
        ctx.shadowColor = armed ? '#ff7438' : 'rgba(255,180,90,0.25)';
        ctx.shadowBlur = armed ? 16 : 6;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = armed ? 'rgba(255,80,70,0.95)' : 'rgba(255,214,120,0.82)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(6, 6);
        ctx.moveTo(6, -6);
        ctx.lineTo(-6, 6);
        ctx.stroke();

        ctx.globalAlpha = armed ? 0.24 : 0.12;
        ctx.strokeStyle = armed ? '#ff7a54' : 'rgba(255,210,130,0.55)';
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, hazard.triggerRadius || 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
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
        drawEnvironmentTile('barrel_oak', -24, -26, 48, 48);
      } else if (prop.kind === 'wall') {
        drawEnvironmentTile('wall_block', -26, -26, 52, 52);
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-25, -25, 50, 50);
      } else if (prop.kind === 'cover_wall') {
        drawCoverWall(prop);
      } else if (prop.kind === 'secret_wall') {
        drawCoverWall(prop);
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
      } else if (pickup.type === 'jesterPortal') {
        const spawnT = Math.max(0, Number(pickup.spawnT || 0));
        const activateAt = Math.max(0.01, Number(pickup.activateAt || JESTER_PORTAL_ACTIVATE_DELAY));
        const reveal = clamp(spawnT / activateAt, 0, 1);
        const ease = 1 - (1 - reveal) ** 3;
        const spin = Date.now() / 360;
        const portalR = 16 + ease * 11;

        ctx.globalAlpha = 0.34 + ease * 0.56;
        ctx.fillStyle = 'rgba(48,8,66,0.65)';
        ctx.beginPath();
        ctx.ellipse(0, 8, portalR * 0.95, portalR * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.9;
        ctx.shadowColor = '#ff8bd8';
        ctx.shadowBlur = 20;
        for (let ring = 0; ring < 2; ring += 1) {
          const ringR = portalR * (0.72 + ring * 0.3);
          const segments = 9 + ring * 3;
          ctx.strokeStyle = ring === 0 ? '#ff8bd8' : '#ffd1f5';
          ctx.lineWidth = ring === 0 ? 2.4 : 1.5;
          ctx.beginPath();
          for (let seg = 0; seg < segments; seg += 1) {
            const a0 = (seg / segments) * Math.PI * 2 + spin * (ring === 0 ? 1 : -0.7);
            const a1 = ((seg + 0.56) / segments) * Math.PI * 2 + spin * (ring === 0 ? 1 : -0.7);
            ctx.moveTo(Math.cos(a0) * ringR, Math.sin(a0) * ringR * 0.42);
            ctx.lineTo(Math.cos(a1) * ringR, Math.sin(a1) * ringR * 0.42);
          }
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, portalR * 0.72);
        core.addColorStop(0, 'rgba(255,188,236,0.92)');
        core.addColorStop(1, 'rgba(255,95,194,0)');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.ellipse(0, 0, portalR * 0.72, portalR * 0.27, 0, 0, Math.PI * 2);
        ctx.fill();

        if (pickup.active) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#ffd6f7';
          ctx.font = 'bold 10px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('JUMP', 0, 3);
        }
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
      if (kind === 'cult_missile') return { color: '#b455ff', core: '#f2ddff', trail: '#7d39ff', shape: 'orb', length: 30 };
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
    const atlas = SPRITE_ATLAS;
    if (!atlas?.frames || !atlas.canvas) return;
    const frame = atlas.frames[spriteKey] || atlas.frames.hunter;
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
      atlas.canvas,
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
    const atlas = SPRITE_ATLAS;
    if (!atlas?.frames || !atlas.canvas) return;
    const frame = atlas.frames[spriteKey] || atlas.frames.hunter;
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
      atlas.canvas,
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
    if (flash > 0 && !window.NeoSettings?.getAccess()?.reduceFlash) {
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
      const _portalAccess = window.NeoSettings?.getAccess() || {};
      ctx.globalAlpha = (_portalAccess.reduceMotion ? 0.55 : (0.3 + 0.4 * Math.abs(Math.sin(now / 300 + s * 1.3)))) * portalEase;
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
      const atlas = SPRITE_ATLAS;
      const frame = atlas?.frames ? (atlas.frames[spriteKey] || atlas.frames.hunter) : null;
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
          atlas.canvas,
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
        ctx.arc(0, 0, enemy.r + 6 + index * 4 + (window.NeoSettings?.getAccess()?.reduceFlash ? 0 : Math.sin(Date.now() / (180 + index * 40)) * 2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
      const spriteKey = getEnemySpriteKey(enemy);
      const facing = getFacingDirection(enemy, enemy.beamAngle || enemy.dashAngle || 0);
      const drawSize = Math.max(30, enemy.r * 2.4);
      // Transformation animation: scale and flash
      let scale = 1;
      let flash = false;
      if (enemy.transformAnimT && enemy.transformAnimT > 0) {
        // Oscillate scale and flash
        const t = enemy.transformAnimT;
        scale = 1.1 + Math.sin(Date.now() / 60) * 0.13 * t * 2;
        flash = Math.floor(Date.now() / 80) % 2 === 0;
      }
      ctx.save();
      ctx.translate(enemy.x, drawY);
      ctx.scale(scale, scale);
      drawSpriteFrame(spriteKey, 0, 0, drawSize, {
        alpha: enemy.stun > 0 ? 0.68 : 1,
        flipX: facing < 0,
        shadowColor: enemy.elite || enemy.type === 'god' ? 'rgba(255,244,180,0.45)' : 'rgba(0,0,0,0.18)',
        shadowBlur: enemy.type === 'god' ? 14 : enemy.elite ? 10 : 4,
        tint: flash ? 'rgba(255,255,180,0.55)' : (enemy.elite ? 'rgba(255,210,96,0.7)' : null),
      });
      ctx.restore();
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
    const _reduceFlash = window.NeoSettings?.getAccess()?.reduceFlash;
    STATUS_KEYS.filter(key => getStatusStacks(player, key) > 0).forEach((key, index) => {
      const style = STATUS_STYLES[key];
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = style.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, player.r + 6 + index * 4 + (_reduceFlash ? 0 : Math.sin(Date.now() / (160 + index * 40)) * 2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
    drawSpriteFrame(getPlayerSpriteKey(), player.x, player.y, Math.max(34, player.r * 2.5), {
      alpha: (!_reduceFlash && (player.inv > 0 || Number(player.stun || 0) > 0)) ? 0.68 : 1,
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

  function hexToRgba(hex, alpha) {
    const value = String(hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(168,216,255,${alpha})`;
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function drawPlayerSlot(slot) {
    const pn = slot?.getEntity?.();
    if (!pn) return;
    const charKey = slot.getCharacter();
    const tintColor = slot.color;
    const label = slot.label;
    const aimAngle = Math.atan2(pn.vy || 0, pn.vx || 1);
    const facing = getFacingDirection(pn, aimAngle);
    const spriteKey = SPRITE_DEFS[charKey] ? charKey : 'thorn_knight';
    drawSpriteFrame(spriteKey, pn.x, pn.y, Math.max(34, pn.r * 2.5), {
      alpha: pn.inv > 0 ? 0.55 : 1,
      flipX: facing < 0,
      shadowColor: hexToRgba(tintColor, 0.45),
      shadowBlur: 10,
      tint: hexToRgba(tintColor, 0.25),
    });
    ctx.save();
    ctx.translate(pn.x, pn.y);
    ctx.strokeStyle = tintColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(aimAngle) * 6, Math.sin(aimAngle) * 6);
    ctx.lineTo(Math.cos(aimAngle) * 20, Math.sin(aimAngle) * 20);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = tintColor;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, pn.x, pn.y - pn.r - 6);
    ctx.restore();
  }

  function drawPlayer2() {
    drawPlayerSlot(PLAYER_SLOT_CONFIG[1]);
  }

  function drawPlayerN(pn, charKey, tintColor, label) {
    const slot = getSlotByEntity(pn) || {
      getEntity: () => pn,
      getCharacter: () => charKey,
      color: tintColor,
      label,
    };
    drawPlayerSlot(slot);
  }

  function drawPlayerLaser() {
    if (!player) return;

    // Draw Laser Glasses weapon beams (two beams, ±0.2 spread)
    if (!laserActive && getEquippedWeapon() === 'lazer_glasses' && player.weaponBeamTime > 0) {
      const baseAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
      const alpha = Math.min(1, player.weaponBeamTime / 0.3);
      ctx.save();
      ctx.globalAlpha = alpha;
      [-0.2, 0.2].forEach(offset => {
        const beamAngle = baseAngle + offset;
        const beamPath = buildRicochetBeamPath(player.x, player.y, beamAngle, 430, LAZER_GLASSES_BOUNCES);
        drawTaperedBeamPath(beamPath, {
          color: '#cda8ff',
          glow: '#e0c8ff',
          maxWidth: 5,
          shadowBlur: 16,
        });
        // Tip burst
        if (rng() < 0.35) {
          const end = getBeamPathEnd(beamPath);
          particles.push({ x: end.x + (rng() - 0.5) * 5, y: end.y + (rng() - 0.5) * 5, life: 0.1 + rng() * 0.08, vx: (rng() - 0.5) * 35, vy: (rng() - 0.5) * 35, c: '#cda8ff' });
        }
      });
      ctx.restore();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      return;
    }

    if (!laserActive) return;
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
    const baseSize = 14;
    const baseGap = 2;
    const gridSize = 9;
    const visibleRooms = rooms.filter(r => !r.secret);
    const maxGy = visibleRooms.reduce((m, r) => Math.max(m, r.gy), 0);
    const baseMapWidth = gridSize * baseSize + (gridSize - 1) * baseGap;
    const baseMapHeight = (maxGy + 1) * baseSize + maxGy * baseGap;
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width > 0 ? canvasRect.width / canvas.width : 1;
    const scaleY = canvasRect.height > 0 ? canvasRect.height / canvas.height : 1;
    const compact = window.innerWidth <= 920;
    const targetViewportWidth = compact ? Math.min(112, canvasRect.width * 0.25) : Math.min(146, canvasRect.width * 0.2);
    const targetViewportHeight = compact ? Math.min(112, canvasRect.height * 0.25) : Math.min(146, canvasRect.height * 0.23);
    const baseViewportWidth = baseMapWidth * scaleX;
    const baseViewportHeight = baseMapHeight * scaleY;
    const minimapScale = clamp(Math.min(1, targetViewportWidth / Math.max(1, baseViewportWidth), targetViewportHeight / Math.max(1, baseViewportHeight)), 0.62, 1);
    const size = Math.max(8, Math.round(baseSize * minimapScale));
    const gap = Math.max(1, Math.round(baseGap * minimapScale));
    const mapWidth = gridSize * size + (gridSize - 1) * gap;
    const mapHeight = (maxGy + 1) * size + maxGy * gap;
    const originX = canvas.width - mapWidth - 2;
    const originY = Math.round(-10 * minimapScale);
    const markerFont = `${Math.max(7, Math.round(size * 0.62))}px system-ui`;
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
        ctx.font = `bold ${markerFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', x + size / 2, y + size / 2);
      } else if (room.type === 'challenge') {
        ctx.globalAlpha = room.explored ? 1 : 0.72;
        ctx.fillStyle = '#071116';
        ctx.font = `bold ${markerFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('T', x + size / 2, y + size / 2);
      } else if (room.type === 'shop') {
        ctx.globalAlpha = room.explored ? 1 : 0.72;
        ctx.fillStyle = '#071116';
        ctx.font = `bold ${markerFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', x + size / 2, y + size / 2);
      } else if (room.type === 'anvil') {
        ctx.globalAlpha = room.explored ? 1 : 0.72;
        ctx.fillStyle = '#1a0800';
        ctx.font = `bold ${markerFont}`;
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

    const viewportBounds = {
      left: canvasRect.left + originX * scaleX,
      top: canvasRect.top + originY * scaleY,
      right: canvasRect.left + (originX + mapWidth) * scaleX,
      bottom: canvasRect.top + (originY + mapHeight) * scaleY,
    };
    minimapLayoutState = {
      x: originX,
      y: originY,
      width: mapWidth,
      height: mapHeight,
      scale: minimapScale,
      viewportBounds,
    };
    return minimapLayoutState;
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
    const _access = window.NeoSettings?.getAccess() || {};
    // With reduceMotion: skip the animated banner entirely
    if (_access.reduceMotion) return;

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
    drawPixelIcon(ui.hudLoopIcon, '#83f3ff', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [5, 2],
      [1, 3], [5, 3],
      [1, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
      [2, 2], [4, 2], [2, 4], [4, 4],
      [3, 3],
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
    let runHistoryModeFilter = 'all';
    let selectedRunHistoryId = '';
    let activeRunHistoryTab = 'stats';
    let tutorialBannerCache = { open: null, text: null, hint: null, prevDisabled: null, nextDisabled: null };
    let objectiveEntriesCache = [];
    let objectiveTrackerVisible = false;
    let objectiveCompactMode = false;
    let objectiveExpanded = true;
    const runHistoryPageSize = 8;

    function isCompactObjectiveViewport() {
      return window.innerWidth <= 920;
    }

    function getObjectiveCompactSummary(entries = []) {
      if (!entries.length) return 'No objectives';
      const doneCount = entries.filter(entry => String(entry?.state || '') === 'done').length;
      const primary = entries.find(entry => String(entry?.state || '') !== 'done') || entries[0];
      const primaryText = String(primary?.text || '').trim();
      return `${doneCount}/${entries.length} done${primaryText ? ` • ${primaryText}` : ''}`;
    }

    function syncObjectiveTrackerCompactState() {
      if (!view.objectiveTracker) return;
      const compact = isCompactObjectiveViewport();
      if (compact !== objectiveCompactMode) {
        objectiveCompactMode = compact;
        objectiveExpanded = compact ? false : true;
      }

      if (!objectiveTrackerVisible) {
        view.objectiveTracker.classList.remove('objective-tracker--compact', 'objective-tracker--expanded');
        if (view.objectiveSummary) view.objectiveSummary.classList.add('hidden');
        if (view.objectiveList) view.objectiveList.classList.remove('hidden');
        if (view.objectiveToggle) {
          view.objectiveToggle.classList.add('hidden');
          view.objectiveToggle.setAttribute('aria-expanded', 'false');
        }
        return;
      }

      view.objectiveTracker.classList.toggle('objective-tracker--compact', objectiveCompactMode);
      view.objectiveTracker.classList.toggle('objective-tracker--expanded', !objectiveCompactMode || objectiveExpanded);
      if (view.objectiveToggle) {
        const showToggle = objectiveCompactMode;
        view.objectiveToggle.classList.toggle('hidden', !showToggle);
        view.objectiveToggle.setAttribute('aria-expanded', objectiveExpanded ? 'true' : 'false');
        view.objectiveToggle.textContent = objectiveExpanded ? 'Hide' : 'Show';
      }
      if (view.objectiveSummary) {
        const showSummary = objectiveCompactMode && !objectiveExpanded;
        view.objectiveSummary.classList.toggle('hidden', !showSummary);
        view.objectiveSummary.textContent = showSummary ? getObjectiveCompactSummary(objectiveEntriesCache) : '';
      }
      if (view.objectiveList) {
        view.objectiveList.classList.toggle('hidden', objectiveCompactMode && !objectiveExpanded);
      }
    }

    function setObjectiveLayout(layout) {
      if (!view.objectiveTracker) return;
      if (!layout) {
        view.objectiveTracker.style.removeProperty('top');
        view.objectiveTracker.style.removeProperty('right');
        view.objectiveTracker.style.removeProperty('width');
        view.objectiveTracker.style.removeProperty('max-height');
        view.objectiveTracker.style.removeProperty('overflow-y');
        return;
      }

      const margin = 4;
      const gap = window.innerWidth <= 920 ? 8 : 12;
      const trackerWidth = Math.round(clamp(window.innerWidth <= 920 ? 124 : 142, 108, window.innerWidth - margin * 2));
      let right = Math.round(clamp(window.innerWidth - layout.right, margin, window.innerWidth - trackerWidth - margin));
      let top = Math.max(margin, Math.round(layout.bottom + gap));
      let maxHeight = Math.floor(window.innerHeight - top - margin);

      // If there is not enough room below the minimap, place objectives left of it.
      if (maxHeight < 92) {
        top = Math.max(margin, Math.round(layout.top));
        right = Math.round(clamp(window.innerWidth - layout.left + gap, margin, window.innerWidth - trackerWidth - margin));
        maxHeight = Math.floor(window.innerHeight - top - margin);
      }

      view.objectiveTracker.style.top = `${top}px`;
      view.objectiveTracker.style.right = `${right}px`;
      view.objectiveTracker.style.width = `${trackerWidth}px`;
      view.objectiveTracker.style.maxHeight = `${Math.max(74, maxHeight)}px`;
      view.objectiveTracker.style.overflowY = 'auto';
      syncObjectiveTrackerCompactState();
    }

    if (view.objectiveToggle) {
      view.objectiveToggle.addEventListener('click', () => {
        if (!objectiveCompactMode || !objectiveTrackerVisible) return;
        objectiveExpanded = !objectiveExpanded;
        syncObjectiveTrackerCompactState();
      });
    }

    window.addEventListener('resize', () => {
      syncObjectiveTrackerCompactState();
    });

    function getVisibleRunHistoryEntries() {
      if (runHistoryModeFilter === 'all') return runHistoryEntries;
      return runHistoryEntries.filter(entry => normalizeGameMode(entry.mode) === runHistoryModeFilter);
    }

    function renderRunHistoryModeTabs() {
      view.runHistoryModeTabs.forEach(tab => {
        const tabMode = tab.dataset.mode || 'all';
        const active = tabMode === runHistoryModeFilter;
        tab.classList.toggle('active', active);
      });
    }

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

    function resolveDialoguePortraitKey(speaker = '') {
      const raw = String(speaker || '').trim();
      if (!raw) return getPlayerSpriteKey();
      const normalized = raw
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalized) return getPlayerSpriteKey();

      const directKey = normalized.replace(/ /g, '_');
      if (SPRITE_DEFS[directKey]) return directKey;

      const noRival = normalized.replace(/^rival\s+/, '');
      const noRivalKey = noRival.replace(/ /g, '_');
      if (SPRITE_DEFS[noRivalKey]) return noRivalKey;

      if (normalized.includes('knight')) return 'thorn_knight';
      if (normalized.includes('knave')) return 'artificer_knave';
      if (normalized.includes('thorn')) return 'thorn_knight';
      if (normalized.includes('princess')) return 'princess';
      if (normalized.includes('metao')) return 'metao';
      if (normalized.includes('granialla')) return 'granialla';
      if (normalized.includes('queen') && normalized.includes('cult')) return 'queen_cult';
      if (normalized.includes('bulk') && normalized.includes('golem')) return 'bulk_golem';
      if (normalized.includes('artificer')) return 'artificer_knave';
      if (normalized.includes('golem')) return 'golem';
      if (normalized.includes('god')) return 'god';
      if (normalized.includes('mirror')) return getPlayerSpriteKey();
      return 'hunter';
    }

    function renderDialogue() {
      if (!view.dialogueOverlay || !view.dialogueSpeaker || !view.dialogueText) return;
      const snapshot = dialogueRuntime?.getSnapshot?.() || { active: false, speaker: 'GOD', visibleText: '', isFullyTyped: false };
      view.dialogueOverlay.classList.toggle('hidden', !snapshot.active);
      view.dialogueOverlay.style.display = snapshot.active ? 'flex' : 'none';
      view.dialogueOverlay.setAttribute('aria-hidden', snapshot.active ? 'false' : 'true');
      if (!snapshot.active) {
        if (view.dialoguePortrait instanceof HTMLCanvasElement) {
          const portraitCtx = view.dialoguePortrait.getContext('2d');
          portraitCtx?.clearRect(0, 0, view.dialoguePortrait.width, view.dialoguePortrait.height);
        }
        return;
      }
      view.dialogueSpeaker.textContent = snapshot.speaker || 'GOD';
      view.dialogueText.textContent = snapshot.visibleText || '';
      if (view.dialoguePortrait instanceof HTMLCanvasElement) {
        const spriteKey = resolveDialoguePortraitKey(snapshot.speaker || '');
        drawSpriteToCanvas(view.dialoguePortrait, spriteKey, view.dialoguePortrait.width);
      }
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
      setVisible(view.hudLower, show === 'play' || show === 'pause', '');
      setVisible(view.adapterStatus, show === 'play' || show === 'pause', '');
      setVisible(view.playerStats, inPlay, '');
      setVisible(view.coinDisplay, inPlay, 'flex');
      setVisible(view.centerDisplay, inPlay, '');
      setVisible(view.objectiveTracker, inPlay, '');
      setVisible(view.dialogueOverlay, show === 'dialogue', 'flex');
      if (show !== 'play') setVisible(view.tutorialOverlay, false, 'flex');
      setVisible(view.entityDialogueLayer, inPlay, 'block');
      if (!inPlay && view.challengeStatus) {
        view.challengeStatus.classList.add('hidden');
        view.challengeStatus.setAttribute('aria-hidden', 'true');
      }
      if (show !== 'charselect') { setChallengePanelOpen(false); setLegacyPanelOpen(false); }
      if (show !== 'menu') { setRunHistoryOpen(false); setAltModesPanelOpen(false); setSandboxPanelOpen(false); }
      setVisible(view.endlessHud, inPlay && gameMode === 'endless', 'flex');
      setVisible(view.practicePanel, inPlay && gameMode === 'practice' && show !== 'dying', 'block');
      const isBossRush = gameMode === 'boss_rush';
      if (view.timerFloorSlot) view.timerFloorSlot.style.display = isBossRush ? 'none' : '';
      if (view.timerBossSlot) view.timerBossSlot.style.display = isBossRush ? '' : 'none';
    }

    function setChallengePanelOpen(open) {
      challengePanelOpen = !!open;
      view.challengePanel?.classList.toggle('hidden', !challengePanelOpen);
      view.challengePanel?.setAttribute('aria-hidden', challengePanelOpen ? 'false' : 'true');
      view.challengeToggle?.setAttribute('aria-expanded', challengePanelOpen ? 'true' : 'false');
    }

    let legacyPanelOpen = false;
    function setLegacyPanelOpen(open) {
      legacyPanelOpen = !!open;
      view.legacyPanel?.classList.toggle('hidden', !legacyPanelOpen);
      view.legacyPanel?.setAttribute('aria-hidden', legacyPanelOpen ? 'false' : 'true');
      view.legacyToggle?.setAttribute('aria-expanded', legacyPanelOpen ? 'true' : 'false');
    }

    let runHistoryView = 'info';
    let activeInfoTab = 'items';

    function setRunHistoryOpen(open) {
      runHistoryOpen = !!open;
      view.runHistoryPanel?.classList.toggle('hidden', !runHistoryOpen);
      view.runHistoryPanel?.setAttribute('aria-hidden', runHistoryOpen ? 'false' : 'true');
      if (view.runHistoryBtn) {
        view.runHistoryBtn.textContent = runHistoryOpen ? 'HIDE INFO' : 'INFO';
        view.runHistoryBtn.setAttribute('aria-expanded', runHistoryOpen ? 'true' : 'false');
      }
      if (open) setRunHistoryView('info');
    }

    function setRunHistoryView(view_) {
      runHistoryView = view_;
      const showAch     = view_ === 'achievements';
      const showProfile = view_ === 'profile';
      const showInfo    = view_ === 'info';
      const showRuns    = !showAch && !showProfile && !showInfo;
      view.runHistoryBody?.classList.toggle('hidden', !showRuns);
      view.runHistoryEmpty?.classList.toggle('hidden', true);
      view.achievementsList?.classList.toggle('hidden', !showAch);
      view.rhProfilePanel?.classList.toggle('hidden', !showProfile);
      view.rhInfoPanel?.classList.toggle('hidden', !showInfo);
      const titles = { achievements: 'ACHIEVEMENTS', profile: 'PROFILE', runs: 'RUN HISTORY', info: 'INFO' };
      if (view.runHistoryPanelTitle) view.runHistoryPanelTitle.textContent = titles[view_] ?? 'INFO';
      view.runHistoryViewTabs?.forEach(t => t.classList.toggle('active', t.dataset.view === view_));
      if (showAch) populateAchievementsPanel();
      else if (showProfile) {
        if (view.rhBankCoins)  view.rhBankCoins.textContent  = metaProgress.coins ?? 0;
        if (view.rhLoopCount)  view.rhLoopCount.textContent  = metaProgress.loopCrystals ?? 0;
        if (view.rhBestFloor)  view.rhBestFloor.textContent  = metaProgress.bestFloor ?? 1;
        if (view.rhSaveState)  view.rhSaveState.textContent  = view.saveState?.textContent ?? '—';
      }
      else if (showInfo) populateInfoPanel(activeInfoTab);
      else { view.runHistoryEmpty?.classList.toggle('hidden', runHistory.length > 0); renderRunHistoryPage(); }
    }

    const ENEMY_INFO = [
      { key: 'hunter',          label: 'Hunter',          boss: false, hp: 52,   dmg: 12, speed: 96,  attackStyle: 'melee',   immunities: [],                                    desc: 'Relentless tracker that closes in fast and slashes. Low HP but high pressure.' },
      { key: 'charger',         label: 'Charger',         boss: false, hp: 68,   dmg: 14, speed: 118, attackStyle: 'dash',    immunities: [],                                    desc: 'Winds up then dashes straight at the player for heavy knockback damage.' },
      { key: 'laser',           label: 'Laser Unit',      boss: false, hp: 52,   dmg: 12, speed: 96,  attackStyle: 'ranged',  immunities: [],                                    desc: 'Fires a precision beam from range. Keeps distance and punishes slow movement.' },
      { key: 'knave',           label: 'Knave',           boss: false, hp: 68,   dmg: 14, speed: 118, attackStyle: 'melee',   immunities: [],                                    desc: 'Fast melee fighter with erratic movement. Hard to read at close range.' },
      { key: 'sniper',          label: 'Sniper',          boss: false, hp: 58,   dmg: 12, speed: 104, attackStyle: 'ranged',  immunities: [],                                    desc: 'Long-range shooter that aims carefully before firing a high-damage shot.' },
      { key: 'machine_gunner',  label: 'Machine Gunner',  boss: false, hp: 96,   dmg: 8,  speed: 112, attackStyle: 'burst',   immunities: [],                                    desc: 'Sprays bullets in rapid bursts. Low per-shot damage but overwhelming volume.' },
      { key: 'golem',           label: 'Golem',           boss: false, hp: 132,  dmg: 18, speed: 70,  attackStyle: 'melee',   immunities: ['bleed'],                             desc: 'Slow stone tank immune to bleed. High HP and damage make it dangerous up close.' },
      { key: 'cult_mage',       label: 'Cult Mage',       boss: false, hp: 84,   dmg: 18, speed: 58,  attackStyle: 'ranged',  immunities: [],                                    desc: 'Slow-moving caster that hurls powerful projectiles. Prioritise from a distance.' },
      { key: 'cult_follower',   label: 'Cult Follower',   boss: false, hp: 34,   dmg: 8,  speed: 138, attackStyle: 'melee',   immunities: [],                                    desc: 'Frail but extremely fast swarmer. Dangerous in groups.' },
      { key: 'summoner',        label: 'Summoner',        boss: false, hp: 120,  dmg: 12, speed: 66,  attackStyle: 'summon',  immunities: [],                                    desc: 'Hangs back and periodically summons reinforcements. Kill it first.' },
      { key: 'shield_unit',     label: 'Shield Unit',     boss: false, hp: 210,  dmg: 10, speed: 52,  attackStyle: 'melee',   immunities: ['bleed'],                             desc: 'Heavy armoured tank with a barrier. Bleed immune. Can boost nearby allies.' },
      { key: 'healer',          label: 'Healer',          boss: false, hp: 150,  dmg: 10, speed: 64,  attackStyle: 'support', immunities: [],                                    desc: 'Restores HP to nearby enemies on a cooldown. Eliminate it before it undoes your damage.' },
      { key: 'boss_spawner',    label: 'Boss Spawner',    boss: false, hp: 300,  dmg: 8,  speed: 42,  attackStyle: 'summon',  immunities: ['bleed'],                             desc: 'Immobile spawner that releases enemies on a timer. Destroy it before the countdown ends.' },
      { key: 'bulk_golem',      label: 'Bulk Golem',      boss: true,  hp: 1280, dmg: 31, speed: 88,  attackStyle: 'melee',   immunities: ['bleed'],                             desc: 'Boss. Massive golem that splits into smaller golems at low HP. Ground-slam AOE attack.' },
      { key: 'artificer_knave', label: 'Artificer Knave', boss: true,  hp: 1880, dmg: 20, speed: 124, attackStyle: 'melee',   immunities: [],                                    desc: 'Boss. High-speed multi-phase fighter. Becomes more aggressive at each phase threshold.' },
      { key: 'queen_cult',      label: 'Queen Cult',      boss: true,  hp: 760,  dmg: 20, speed: 96,  attackStyle: 'summon',  immunities: [],                                    desc: 'Boss. Cult leader that summons followers and mages while striking with projectiles.' },
      { key: 'mirror_knight',   label: 'Mirror Champion', boss: true,  hp: 0,    dmg: 0,  speed: 0,   attackStyle: 'mirror',  immunities: [],                                    desc: 'Elite. Copies the player\'s equipped moves and items. The perfect counter to your build.' },
      { key: 'god',             label: 'GOD',             boss: true,  hp: 920,  dmg: 18, speed: 108, attackStyle: 'beam',    immunities: ['bleed', 'fire', 'poison', 'dark'],   desc: 'Final boss. Multi-phase deity with beam sweeps, nova blasts, and judgement strikes. Immune to all status effects.' },
    ];

    function populateInfoPanel(tab) {
      activeInfoTab = tab;
      if (!view.rhInfoContent) return;
      view.rhInfoTabs?.forEach(t => t.classList.toggle('active', t.dataset.infoTab === tab));

      if (tab === 'items') {
        const rarityOrder = ['knight', 'wizard', 'god'];
        const sorted = Object.values(ITEM_DEFS).sort((a, b) => {
          const ri = rarityOrder.indexOf(a.rarity ?? a.category) - rarityOrder.indexOf(b.rarity ?? b.category);
          return ri !== 0 ? ri : (a.name || '').localeCompare(b.name || '');
        });
        view.rhInfoContent.innerHTML = `<div class="info-grid">${sorted.map(item => {
          const rarity = item.rarity || item.category || 'knight';
          return `<div class="info-card">
            <div class="info-card__header">
              <canvas class="info-card__icon" data-info-item="${item.key}" width="32" height="32"></canvas>
              <span class="info-card__name">${item.name}</span>
              <span class="info-card__tag info-card__tag--${rarity}">${rarity}</span>
            </div>
            <div class="info-card__desc">${item.description || ''}</div>
          </div>`;
        }).join('')}</div>`;
        view.rhInfoContent.querySelectorAll('[data-info-item]').forEach(el => {
          const item = ITEM_DEFS[el.dataset.infoItem];
          if (item) drawItemToastIcon(el, item);
        });

      } else if (tab === 'weapons') {
        const rarityOrder = ['knight', 'wizard', 'god'];
        const sorted = Object.values(WEAPON_DEFS).sort((a, b) => {
          const ri = rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
          return ri !== 0 ? ri : (a.name || '').localeCompare(b.name || '');
        });
        view.rhInfoContent.innerHTML = `<div class="info-grid">${sorted.map(w => {
          return `<div class="info-card">
            <div class="info-card__header">
              <canvas class="info-card__icon" data-info-weapon="${w.key}" width="32" height="32"></canvas>
              <span class="info-card__name">${w.name}</span>
              <span class="info-card__tag info-card__tag--${w.rarity}">${w.rarity}</span>
            </div>
            <div class="info-card__desc">${w.description || ''}</div>
          </div>`;
        }).join('')}</div>`;
        view.rhInfoContent.querySelectorAll('[data-info-weapon]').forEach(el => {
          const w = WEAPON_DEFS[el.dataset.infoWeapon];
          if (w) drawItemToastIcon(el, w);
        });

      } else if (tab === 'moves') {
        const slotOrder = ['melee', 'laser', 'smash', 'dash'];
        const sorted = Object.values(MOVE_DEFS).sort((a, b) => {
          const si = slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot);
          return si !== 0 ? si : (a.name || '').localeCompare(b.name || '');
        });
        view.rhInfoContent.innerHTML = `<div class="info-grid">${sorted.map(m => {
          const slotLabel = SLOT_LABELS[m.slot] || m.slot;
          const exclusive = m.exclusiveCharacter
            ? `<br><em style="color:rgba(200,200,255,0.5)">${titleCase(m.exclusiveCharacter.replace(/_/g, ' '))} only</em>`
            : '';
          return `<div class="info-card">
            <div class="info-card__header">
              <canvas class="info-card__icon" data-info-move="${m.key}" width="32" height="32"></canvas>
              <span class="info-card__name">${m.name}</span>
              <span class="info-card__tag info-card__tag--${m.slot}">${slotLabel}</span>
            </div>
            <div class="info-card__desc">${m.desc || ''}${exclusive}</div>
          </div>`;
        }).join('')}</div>`;
        view.rhInfoContent.querySelectorAll('[data-info-move]').forEach(el => {
          const move = MOVE_DEFS[el.dataset.infoMove];
          if (move) drawMoveToastIcon(el, move);
        });

      } else if (tab === 'enemies') {
        const attackStyleLabel = { melee: 'Melee', dash: 'Dash', ranged: 'Ranged', burst: 'Burst', summon: 'Summoner', support: 'Support', mirror: 'Mirror', beam: 'Beam' };
        view.rhInfoContent.innerHTML = `
          <div class="info-enemy-layout">
            <div class="info-enemy-grid">${ENEMY_INFO.map(e => {
              const tagClass = e.boss ? 'info-enemy-card__tag--boss' : 'info-enemy-card__tag--normal';
              return `<div class="info-enemy-card" data-enemy-select="${e.key}" tabindex="0">
                <canvas class="info-enemy-card__sprite" data-info-enemy="${e.key}" width="52" height="52"></canvas>
                <div class="info-enemy-card__name">${e.label}</div>
                <span class="info-enemy-card__tag ${tagClass}">${e.boss ? 'Boss' : 'Enemy'}</span>
              </div>`;
            }).join('')}</div>
            <div class="info-enemy-detail hidden" id="infoEnemyDetail">
              <canvas class="info-enemy-detail__sprite" id="infoEnemySprite" width="80" height="80"></canvas>
              <div class="info-enemy-detail__name" id="infoEnemyName"></div>
              <div class="info-enemy-detail__tag-row" id="infoEnemyTagRow"></div>
              <div class="info-enemy-detail__stats" id="infoEnemyStats"></div>
              <div class="info-enemy-detail__desc" id="infoEnemyDesc"></div>
            </div>
          </div>`;
        view.rhInfoContent.querySelectorAll('[data-info-enemy]').forEach(el => {
          drawSpriteToCanvas(el, el.dataset.infoEnemy, 48);
        });
        const showEnemyDetail = (key) => {
          const e = ENEMY_INFO.find(x => x.key === key);
          if (!e) return;
          const detail = document.getElementById('infoEnemyDetail');
          const sprite = document.getElementById('infoEnemySprite');
          if (!detail || !sprite) return;
          detail.classList.remove('hidden');
          drawSpriteToCanvas(sprite, key, 76);
          document.getElementById('infoEnemyName').textContent = e.label;
          const isBoss = e.boss;
          const tagCls = isBoss ? 'info-enemy-card__tag--boss' : 'info-enemy-card__tag--normal';
          const styleLbl = attackStyleLabel[e.attackStyle] || e.attackStyle;
          document.getElementById('infoEnemyTagRow').innerHTML =
            `<span class="info-enemy-card__tag ${tagCls}">${isBoss ? 'Boss' : 'Enemy'}</span>` +
            `<span class="info-enemy-detail__style-tag">${styleLbl}</span>`;
          const immHtml = e.immunities.length
            ? e.immunities.map(im => `<span class="info-enemy-detail__imm">${im}</span>`).join('')
            : '<span class="info-enemy-detail__imm info-enemy-detail__imm--none">None</span>';
          const hpRow    = e.hp    ? `<div class="ied-stat"><span class="ied-stat__label">HP</span><span class="ied-stat__value">${e.hp}</span></div>` : '';
          const dmgRow   = e.dmg   ? `<div class="ied-stat"><span class="ied-stat__label">DMG</span><span class="ied-stat__value">${e.dmg}</span></div>` : '';
          const spdRow   = e.speed ? `<div class="ied-stat"><span class="ied-stat__label">SPD</span><span class="ied-stat__value">${e.speed}</span></div>` : '';
          document.getElementById('infoEnemyStats').innerHTML =
            `<div class="ied-stats-row">${hpRow}${dmgRow}${spdRow}</div>` +
            `<div class="ied-imm-row"><span class="ied-imm-label">Immune:</span>${immHtml}</div>`;
          document.getElementById('infoEnemyDesc').textContent = e.desc || '';
          view.rhInfoContent.querySelectorAll('[data-enemy-select]').forEach(card => {
            card.classList.toggle('info-enemy-card--selected', card.dataset.enemySelect === key);
          });
        };
        view.rhInfoContent.querySelectorAll('[data-enemy-select]').forEach(card => {
          card.addEventListener('click', () => showEnemyDetail(card.dataset.enemySelect));
          card.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') showEnemyDetail(card.dataset.enemySelect); });
        });
        showEnemyDetail(ENEMY_INFO[0].key);

      } else if (tab === 'characters') {
        view.rhInfoContent.innerHTML = `<div class="info-char-grid">${Object.values(CHARACTER_DEFS).map(c => {
          const display = HERO_DISPLAY[c.key] || {};
          const statBars = (display.stats || []).map(s =>
            `<div class="info-char-stat">
              <span class="info-char-stat__label">${s.label}</span>
              <div class="info-char-stat__bar"><div class="info-char-stat__fill" style="width:${s.pct}%;background:${s.color}"></div></div>
            </div>`
          ).join('');
          const lockNote = c.unlock === 'godslain'
            ? '<div style="font-size:11px;color:rgba(255,110,80,0.75);margin-top:6px">Unlock: Slay GOD</div>'
            : '';
          return `<div class="info-char-card">
            <canvas class="info-char-card__sprite" data-info-char="${c.key}" width="64" height="64"></canvas>
            <div class="info-char-card__body">
              <div class="info-char-card__name">${c.name.toUpperCase()}</div>
              <div class="info-char-card__lore">${display.lore || ''}</div>
              <div class="info-char-card__stats">${statBars}</div>
              ${lockNote}
            </div>
          </div>`;
        }).join('')}</div>`;
        view.rhInfoContent.querySelectorAll('[data-info-char]').forEach(el => {
          drawSpriteToCanvas(el, el.dataset.infoChar, 60);
        });
      }
    }

    async function populateAchievementsPanel() {
      if (!view.achievementsList) return;
      view.achievementsList.innerHTML = '<div class="ach-loading">Loading…</div>';
      const cards = await Promise.all(ACHIEVEMENTS.map(async a => {
        const unlocked = await achievementManager.isUnlocked(a.id);
        return `<div class="ach-card${unlocked ? '' : ' ach-card--locked'}">
          <span class="ach-icon">${a.icon}</span>
          <div>
            <div class="ach-name">${a.name}</div>
            <div class="ach-desc">${a.desc}</div>
            <div class="${unlocked ? 'ach-unlocked-badge' : 'ach-locked-badge'}">${unlocked ? '✓ Unlocked  +1 ◆' : '— Locked'}</div>
          </div>
        </div>`;
      }));
      view.achievementsList.innerHTML = cards.join('');
    }

    function setAchievementsPanelOpen(open) {
      setRunHistoryOpen(open);
      if (open) setRunHistoryView('achievements');
    }

    function setAltModesPanelOpen(open) {
      view.altModesPanel?.classList.toggle('hidden', !open);
      view.altModesPanel?.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    function setSandboxPanelOpen(open) {
      view.sandboxPanel?.classList.toggle('hidden', !open);
      view.sandboxPanel?.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    function renderRunHistoryDetail() {
      const visibleEntries = getVisibleRunHistoryEntries();
      const selected = visibleEntries.find(entry => entry.id === selectedRunHistoryId) || visibleEntries[0] || null;
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
      renderRunHistoryModeTabs();
      const visibleEntries = getVisibleRunHistoryEntries();
      const totalPages = Math.max(1, Math.ceil(visibleEntries.length / runHistoryPageSize));
      runHistoryPage = clamp(runHistoryPage, 0, totalPages - 1);
      const start = runHistoryPage * runHistoryPageSize;
      const visiblePageEntries = visibleEntries.slice(start, start + runHistoryPageSize);
      if (!visibleEntries.some(entry => entry.id === selectedRunHistoryId)) {
        selectedRunHistoryId = visibleEntries[0]?.id || '';
      }
      if (view.runHistoryEmpty) view.runHistoryEmpty.classList.toggle('hidden', visibleEntries.length > 0);
      if (view.runHistoryList) {
        view.runHistoryList.innerHTML = visiblePageEntries.map(entry => renderRunHistoryListEntry(entry, entry.id === selectedRunHistoryId)).join('');
        view.runHistoryList.classList.toggle('hidden', visibleEntries.length === 0);
        view.runHistoryList.scrollTop = 0;
        hydrateRunHistorySprites(view.runHistoryList);
      }
      renderRunHistoryDetail();
      if (view.runHistoryPageLabel) {
        view.runHistoryPageLabel.textContent = visibleEntries.length
          ? `Page ${runHistoryPage + 1} / ${totalPages}`
          : 'Page 0 / 0';
      }
      if (view.runHistoryPrev) view.runHistoryPrev.disabled = runHistoryPage <= 0;
      if (view.runHistoryNext) view.runHistoryNext.disabled = runHistoryPage >= totalPages - 1 || visibleEntries.length === 0;
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
      manager.registerScreen('hudLower', {
        create: () => makeContainer(view.hudLower, ''),
        validStates: ['play', 'pause'],
      });
      manager.registerScreen('adapterStatus', {
        create: () => makeContainer(view.adapterStatus, ''),
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
        if ((activeState === 'play' || activeState === 'dying') && hudUpdateHook) hudUpdateHook();
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

        // Sandbox Lab panel: visual "game hacking" controls moved to Alt Modes.
        function getSandboxEnemySpriteKey(type) {
          if (type === 'boss_spawner') return 'cult_follower';
          return type;
        }

        function hydrateSandboxTokenIcons() {
          view.sandboxEnemyList?.querySelectorAll('[data-sbox-enemy-icon]').forEach(el => {
            const key = String(el.dataset.sboxEnemyIcon || 'hunter');
            drawSpriteToCanvas(el, getSandboxEnemySpriteKey(key), 22);
          });
          view.sandboxItemList?.querySelectorAll('[data-sbox-item-icon]').forEach(el => {
            const itemKey = String(el.dataset.sboxItemIcon || '');
            const item = itemRegistry.get(itemKey) || ITEM_DEFS[itemKey];
            if (item) drawItemToastIcon(el, item);
          });
        }

        function renderSandboxTokenLists() {
          if (view.sandboxEnemyList) {
            view.sandboxEnemyList.innerHTML = SANDBOX_ENEMY_TYPES.map(type => {
              const active = sandboxSettings.allowedEnemies.includes(type);
              const label = getEnemyLabel(type);
              return `<button class="sandbox-token${active ? ' is-active' : ''}" data-sbox-enemy="${type}" type="button">`
                + `<canvas class="sandbox-token__icon" data-sbox-enemy-icon="${escapeHtml(type)}" width="28" height="28" aria-hidden="true"></canvas>`
                + `<span class="sandbox-token__label">${escapeHtml(label)}</span>`
                + `</button>`;
            }).join('');
          }
          if (view.sandboxItemList) {
            view.sandboxItemList.innerHTML = ITEM_KEYS.map(key => {
              const active = sandboxSettings.allowedItems.includes(key);
              const item = itemRegistry.get(key) || ITEM_DEFS[key];
              const label = item?.name || key.replace(/_/g, ' ');
              const rarity = String(item?.rarity || 'knight');
              return `<button class="sandbox-token sandbox-token--item sandbox-token--${escapeHtml(rarity)}${active ? ' is-active' : ''}" data-sbox-item="${key}" type="button">`
                + `<canvas class="sandbox-token__icon sandbox-token__icon--item" data-sbox-item-icon="${escapeHtml(key)}" width="26" height="26" aria-hidden="true"></canvas>`
                + `<span class="sandbox-token__label">${escapeHtml(label)}</span>`
                + `</button>`;
            }).join('');
          }
          hydrateSandboxTokenIcons();
        }

        function syncSandboxPanelFields() {
          document.querySelectorAll('#sandboxGrid .sandbox-row').forEach(row => {
            const param = row.dataset.sboxParam;
            if (!param) return;
            const slider = row.querySelector('.sandbox-slider');
            const numInput = row.querySelector('.sandbox-num');
            const value = sandboxSettings[param];
            if (slider && value !== undefined) slider.value = value;
            if (numInput && value !== undefined) numInput.value = value;
          });
          if (view.sandboxGodMode) view.sandboxGodMode.checked = !!sandboxSettings.godMode;
          renderSandboxTokenLists();
        }

        document.querySelectorAll('#sandboxGrid .sandbox-row').forEach(row => {
          const param = row.dataset.sboxParam;
          if (!param) return;
          const slider = row.querySelector('.sandbox-slider');
          const numInput = row.querySelector('.sandbox-num');
          const integerParam = param === 'startingCoins';
          function applyValue(raw) {
            const parsed = integerParam ? parseInt(raw, 10) : parseFloat(raw);
            const min = Number(slider?.min ?? 0);
            const max = Number(slider?.max ?? 1);
            const fallback = Number(slider?.value ?? 0);
            const clamped = Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback));
            const rounded = integerParam ? Math.round(clamped) : Math.round(clamped * 100) / 100;
            if (slider) slider.value = String(rounded);
            if (numInput) numInput.value = String(rounded);
            sandboxSettings[param] = rounded;
            persistMetaSoon();
          }
          slider?.addEventListener('input', () => applyValue(slider.value));
          numInput?.addEventListener('change', () => applyValue(numInput.value));
        });

        view.sandboxGodMode?.addEventListener('change', () => {
          sandboxSettings.godMode = !!view.sandboxGodMode?.checked;
          persistMetaSoon();
        });

        view.sandboxEnemyList?.addEventListener('click', event => {
          const btn = event.target instanceof Element ? event.target.closest('[data-sbox-enemy]') : null;
          if (!btn) return;
          const type = String(btn.dataset.sboxEnemy || '');
          if (!SANDBOX_ENEMY_TYPES.includes(type)) return;
          if (sandboxSettings.allowedEnemies.includes(type)) {
            sandboxSettings.allowedEnemies = sandboxSettings.allowedEnemies.filter(key => key !== type);
          } else {
            sandboxSettings.allowedEnemies = [...sandboxSettings.allowedEnemies, type];
          }
          sandboxSettings = normalizeSandboxSettings(sandboxSettings);
          syncSandboxPanelFields();
          persistMetaSoon();
        });

        view.sandboxItemList?.addEventListener('click', event => {
          const btn = event.target instanceof Element ? event.target.closest('[data-sbox-item]') : null;
          if (!btn) return;
          const key = String(btn.dataset.sboxItem || '');
          if (!ITEM_KEYS.includes(key)) return;
          if (sandboxSettings.allowedItems.includes(key)) {
            sandboxSettings.allowedItems = sandboxSettings.allowedItems.filter(itemKey => itemKey !== key);
          } else {
            sandboxSettings.allowedItems = [...sandboxSettings.allowedItems, key];
          }
          sandboxSettings = normalizeSandboxSettings(sandboxSettings);
          syncSandboxPanelFields();
          persistMetaSoon();
        });

        view.sandboxEnemiesAll?.addEventListener('click', () => {
          sandboxSettings.allowedEnemies = SANDBOX_ENEMY_TYPES.slice();
          syncSandboxPanelFields();
          persistMetaSoon();
        });
        view.sandboxEnemiesNone?.addEventListener('click', () => {
          sandboxSettings.allowedEnemies = [];
          sandboxSettings = normalizeSandboxSettings(sandboxSettings);
          syncSandboxPanelFields();
          persistMetaSoon();
        });
        view.sandboxItemsAll?.addEventListener('click', () => {
          sandboxSettings.allowedItems = ITEM_KEYS.slice();
          syncSandboxPanelFields();
          persistMetaSoon();
        });
        view.sandboxItemsNone?.addEventListener('click', () => {
          sandboxSettings.allowedItems = [];
          sandboxSettings = normalizeSandboxSettings(sandboxSettings);
          syncSandboxPanelFields();
          persistMetaSoon();
        });
        view.sandboxReset?.addEventListener('click', () => {
          sandboxSettings = normalizeSandboxSettings(SANDBOX_DEFAULT_SETTINGS);
          syncSandboxPanelFields();
          persistMetaSoon();
        });
        view.sandboxSaveClose?.addEventListener('click', handlers.onCloseSandboxConfig);
        view.sandboxClose?.addEventListener('click', handlers.onCloseSandboxConfig);
        view.sandboxPanelBackdrop?.addEventListener('click', handlers.onCloseSandboxConfig);
        syncSandboxPanelFields();

        view.challengeButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onChallengeSelect(button.dataset.challenge || '', button);
          });
        });
        view.challengeToggle?.addEventListener('click', handlers.onToggleChallenges);
        view.challengeClose?.addEventListener('click', () => setChallengePanelOpen(false));
        view.legacyButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onLegacySelect(button.dataset.legacy || '');
          });
        });
        view.legacyToggle?.addEventListener('click', handlers.onToggleLegacy);
        view.legacyClose?.addEventListener('click', () => setLegacyPanelOpen(false));
        view.runHistoryBtn?.addEventListener('click', handlers.onToggleRunHistory);
        view.runHistoryClose?.addEventListener('click', () => setRunHistoryOpen(false));
        view.runHistoryViewTabs?.forEach(tab => {
          tab.addEventListener('click', () => setRunHistoryView(tab.dataset.view || 'info'));
        });
        view.rhInfoTabs?.forEach(tab => {
          tab.addEventListener('click', () => populateInfoPanel(tab.dataset.infoTab || 'items'));
        });
        view.infoTutorialBtn?.addEventListener('click', () => {
          localStorage.setItem(REPLAY_TUTORIAL_KEY, '1');
          view.infoTutorialBtn.textContent = '✓ Set for next run';
          view.infoTutorialBtn.disabled = true;
          setTimeout(() => {
            if (view.infoTutorialBtn) {
              view.infoTutorialBtn.textContent = '▶ Tutorial';
              view.infoTutorialBtn.disabled = false;
            }
          }, 2200);
        });
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
        view.runHistoryModeTabs.forEach(tab => {
          tab.addEventListener('click', () => {
            const mode = tab.dataset.mode || 'all';
            runHistoryModeFilter = mode === 'all' ? 'all' : normalizeGameMode(mode);
            runHistoryPage = 0;
            renderRunHistoryPage();
          });
        });
        view.go.addEventListener('click', handlers.onStartNew);
        view.seed.addEventListener('keydown', event => {
          if (event.key === 'Enter') handlers.onStartNew();
        });
        view.continueBtn?.addEventListener('click', handlers.onContinue);
        view.deleteRunBtn?.addEventListener('click', handlers.onDeleteRun);
        view.dialogueOverlay?.addEventListener('click', handlers.onAdvanceDialogue);
        view.tutorialPrevBtn?.addEventListener('click', handlers.onTutorialPrev);
        view.tutorialNextBtn?.addEventListener('click', handlers.onTutorialNext);
        view.tutorialSkipBtn?.addEventListener('click', handlers.onSkipTutorial);
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
        view.altModeCoopBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('coop');
        });
        view.altModePvpBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('pvp');
        });
        view.mpLobbyBack?.addEventListener('click', () => {
          closeMpLobby();
          setAltModesPanelOpen(true);
        });
        view.mpLobby1Btn?.addEventListener('click', () => {
          mpPlayerCount = 1;
          closeMpLobby();
          charSelectPhase = 'p1';
          setGameState('charselect');
          updateCharacterSelectionUI();
        });
        view.mpLobby2Btn?.addEventListener('click', () => {
          mpPlayerCount = 2;
          closeMpLobby();
          charSelectPhase = 'p1';
          setGameState('charselect');
          updateCharacterSelectionUI();
        });
        document.getElementById('mpLobby3Btn')?.addEventListener('click', () => {
          mpPlayerCount = 3;
          closeMpLobby();
          charSelectPhase = 'p1';
          setGameState('charselect');
          updateCharacterSelectionUI();
        });
        document.getElementById('mpLobby4Btn')?.addEventListener('click', () => {
          mpPlayerCount = 4;
          closeMpLobby();
          charSelectPhase = 'p1';
          setGameState('charselect');
          updateCharacterSelectionUI();
        });
        // Alt modes tabs
        document.querySelectorAll('.altmodes-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            document.querySelectorAll('.altmodes-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.altmodes-tab-panel').forEach(p => p.classList.add('hidden'));
            tab.classList.add('active');
            const panel = document.querySelector(`.altmodes-tab-panel[data-panel="${tab.dataset.tab}"]`);
            if (panel) panel.classList.remove('hidden');
          });
        });
        view.altModeSandboxConfigBtn?.addEventListener('click', handlers.onOpenSandboxConfig);
        view.altModeSandboxBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onStartSandbox();
        });
        // Practice panel toggle
        view.practicePanelToggle?.addEventListener('click', () => {
          view.practicePanelBody?.classList.toggle('hidden');
        });
        view.practiceMaxHpSlider?.addEventListener('input', () => {
          setPracticeMaxHp(view.practiceMaxHpSlider.value);
        });
        view.practiceMaxHpNum?.addEventListener('change', () => {
          setPracticeMaxHp(view.practiceMaxHpNum.value);
        });
        view.practiceClearBtn?.addEventListener('click', () => { enemies.length = 0; });
        view.practiceHealBtn?.addEventListener('click', () => {
          if (!player) return;
          player.hp = player.maxHp;
          updateHud();
        });
        view.practiceGiveItemBtn?.addEventListener('click', () => {
          if (!player) return;
          const key = rollItemDrop({ elite: true, stream: 'loot' });
          if (key) collectItem(key);
        });
        if (view.practiceEnemyGrid) buildPracticeEnemyGrid();
        menuBound = true;
      },
      bindRestartActions(actions) {
        if (restartBound) return;
        const defaultRestart = typeof actions === 'function' ? actions : actions?.onWinRestart;
        view.deadRestart?.addEventListener('click', defaultRestart);
        view.winRestart?.addEventListener('click', defaultRestart);
        view.deadActions?.forEach(button => {
          button.addEventListener('click', () => {
            const action = button.dataset.deadAction || 'retry-current';
            if (typeof actions === 'function') actions();
            else actions?.onDeadAction?.(action);
          });
        });
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
      setSandboxPanelOpen,
      setAchievementsPanelOpen,
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
        runHistoryModeFilter = 'all';
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
        if (view.difficultyHint) {
          view.difficultyHint.textContent = selectedDef.unlockLoops > 0 && !unlocked.has(selected)
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
      setTutorialBanner(text, visible) {
        const open = !!visible && !!text && gameState === 'play';
        if (view.tutorialOverlay && tutorialBannerCache.open !== open) {
          view.tutorialOverlay.classList.toggle('hidden', !open);
          view.tutorialOverlay.setAttribute('aria-hidden', open ? 'false' : 'true');
          view.tutorialOverlay.style.display = open ? 'flex' : 'none';
          tutorialBannerCache.open = open;
        }
        if (view.tutorialSpeaker && open && view.tutorialSpeaker.textContent !== 'TUTORIAL') {
          view.tutorialSpeaker.textContent = 'TUTORIAL';
        }
        const nextText = open ? String(text || '') : '';
        if (view.tutorialText && tutorialBannerCache.text !== nextText) {
          view.tutorialText.textContent = nextText;
          tutorialBannerCache.text = nextText;
        }
        const nextHint = open ? 'Use Previous/Next. Press K or click Skip Tutorial' : '';
        if (view.tutorialHint && tutorialBannerCache.hint !== nextHint) {
          view.tutorialHint.textContent = nextHint;
          tutorialBannerCache.hint = nextHint;
        }
        const stepOrder = getTutorialStepOrder();
        const stepIndex = stepOrder.indexOf(tutorialState?.step || 'move');
        const prevDisabled = !open || stepIndex <= 0;
        const nextDisabled = !open || stepIndex < 0 || stepIndex >= (stepOrder.length - 1);
        if (view.tutorialPrevBtn && tutorialBannerCache.prevDisabled !== prevDisabled) {
          view.tutorialPrevBtn.disabled = prevDisabled;
          tutorialBannerCache.prevDisabled = prevDisabled;
        }
        if (view.tutorialNextBtn && tutorialBannerCache.nextDisabled !== nextDisabled) {
          view.tutorialNextBtn.disabled = nextDisabled;
          tutorialBannerCache.nextDisabled = nextDisabled;
        }
      },
      setObjectiveList(roomLabel, entries = []) {
        if (!view.objectiveTracker || !view.objectiveList) return;
        const visible = gameState === 'play' && entries.length > 0;
        objectiveTrackerVisible = visible;
        objectiveEntriesCache = Array.isArray(entries) ? entries.slice() : [];
        view.objectiveTracker.classList.toggle('hidden', !visible);
        view.objectiveTracker.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (view.objectiveRoomLabel) view.objectiveRoomLabel.textContent = String(roomLabel || 'ROOM').toUpperCase();
        view.objectiveList.innerHTML = entries.map(entry => (
          `<li data-state="${escapeHtml(entry.state || 'todo')}">${escapeHtml(entry.text || '')}</li>`
        )).join('');
        syncObjectiveTrackerCompactState();
      },
      setObjectiveLayout,
      setHudValues(payload) {
        view.fl.textContent = payload.floor;
        view.lv.textContent = payload.level;
        view.xp.textContent = payload.xpText;
        if (view.gameTime) view.gameTime.textContent = payload.gameTime;
        if (view.difficultyDisplay) view.difficultyDisplay.textContent = String(payload.difficultyName || '').toUpperCase();
        if (view.itemRarityCounts && payload.itemRarityCounts) {
          const white = view.itemRarityCounts.querySelector('.rarity-count--white');
          const purple = view.itemRarityCounts.querySelector('.rarity-count--purple');
          const red = view.itemRarityCounts.querySelector('.rarity-count--red');
          if (white) white.textContent = String(payload.itemRarityCounts.white || 0);
          if (purple) purple.textContent = String(payload.itemRarityCounts.purple || 0);
          if (red) red.textContent = String(payload.itemRarityCounts.red || 0);
        }
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
        const reviveButton = view.deadActions?.find(button => button.dataset.deadAction === 'revive');
        if (reviveButton) {
          const cost = getReviveCost();
          const crystals = Number(metaProgress.loopCrystals || 0);
          reviveButton.textContent = `REVIVE ${cost} LC`;
          reviveButton.disabled = crystals < cost;
          reviveButton.title = crystals < cost ? `Need ${cost} Loop Crystal${cost === 1 ? '' : 's'}` : `Spend ${cost} Loop Crystal${cost === 1 ? '' : 's'} to revive`;
        }

        // ── Records row ────────────────────────────────────────────────────
        if (view.deadRecords) {
          const nr = entry._newRecords || {};
          const records = deriveRunRecords(runHistory, metaProgress);
          const bests = [
            { label: 'FLOOR',  val: `${records.floor}/10`,         isNew: nr.floor },
            { label: 'KILLS',  val: fmt(records.kills),            isNew: nr.kills },
            { label: 'LEVEL',  val: fmt(records.level),            isNew: nr.level },
            { label: 'TIME',   val: fmtTime(records.time),         isNew: nr.time  },
            { label: 'COINS',  val: fmt(records.coins),            isNew: nr.coins },
          ];
          view.deadRecords.innerHTML = bests.map(b =>
            `<div class="dead-record${b.isNew ? ' dead-record--new' : ''}">
              <span class="dead-record-label">${b.label}</span>
              <span class="dead-record-val">${b.val}</span>
              ${b.isNew ? '<span class="dead-record-badge">NEW</span>' : ''}
            </div>`
          ).join('');
        }

        // ── Item icon cards with pagination ────────────────────────────────
        if (view.deadItems) {
          const items = Array.isArray(entry.items) ? entry.items : [];
          const PAGE_SIZE = 5;
          let itemPage = 0;
          const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

          const renderItemPage = () => {
            view.deadItems.innerHTML = '';
            if (items.length === 0) {
              view.deadItems.innerHTML = '<span class="dead-items-empty">None</span>';
            } else {
              const slice = items.slice(itemPage * PAGE_SIZE, itemPage * PAGE_SIZE + PAGE_SIZE);
              slice.forEach(item => {
                const itemDef = ITEM_DEFS[item.key] || {};
                const rc = { knight: 'knight', white: 'knight', wizard: 'wizard', purple: 'wizard', god: 'god' }[item.rarity] || 'knight';
                const card = document.createElement('div');
                card.className = `dead-item-card dead-item-card--${rc}`;
                const cnv = document.createElement('canvas');
                cnv.width = 32;
                cnv.height = 32;
                cnv.className = 'dead-item-icon';
                drawItemToastIcon(cnv, { ...itemDef, key: item.key, rarity: item.rarity, color: itemDef.color, accent: itemDef.accent });
                const label = document.createElement('span');
                label.className = 'dead-item-name';
                label.textContent = item.count > 1 ? `${item.name} ×${item.count}` : item.name;
                card.appendChild(cnv);
                card.appendChild(label);
                view.deadItems.appendChild(card);
              });
            }
            if (view.deadItemsPage) view.deadItemsPage.textContent = totalPages > 1 ? `${itemPage + 1}/${totalPages}` : '';
            if (view.deadItemsPrev) view.deadItemsPrev.disabled = itemPage <= 0;
            if (view.deadItemsNext) view.deadItemsNext.disabled = itemPage >= totalPages - 1;
            if (view.deadItemsPrev) view.deadItemsPrev.classList.toggle('hidden', totalPages <= 1);
            if (view.deadItemsNext) view.deadItemsNext.classList.toggle('hidden', totalPages <= 1);
            if (view.deadItemsPage) view.deadItemsPage.classList.toggle('hidden', totalPages <= 1);
          };

          if (view.deadItemsPrev) {
            view.deadItemsPrev.onclick = () => { itemPage = Math.max(0, itemPage - 1); renderItemPage(); };
          }
          if (view.deadItemsNext) {
            view.deadItemsNext.onclick = () => { itemPage = Math.min(totalPages - 1, itemPage + 1); renderItemPage(); };
          }
          renderItemPage();
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
        const request = idb.open('NeoNykeDB', 2);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('saves')) {
            request.result.createObjectStore('saves');
          }
          if (!request.result.objectStoreNames.contains('achievements')) {
            request.result.createObjectStore('achievements', { keyPath: 'id' });
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

  function rollFromWeightTable(table, stream = 'loot', random = null) {
    if (!table || table.total <= 0 || !table.cumulative.length) return 'neo_knife';
    const roll = (typeof random === 'function' ? random() : nextRandom(stream)) * table.total;
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

  function shuffleWithRandom(array, random) {
    const copy = [...array];
    const next = typeof random === 'function' ? random : () => nextRandom('encounter');
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(next() * (index + 1));
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

  function getDestructibleRect(prop) {
    const w = Number.isFinite(prop?.w) && prop.w > 0 ? prop.w : (prop?.r || 0) * 2;
    const h = Number.isFinite(prop?.h) && prop.h > 0 ? prop.h : (prop?.r || 0) * 2;
    return {
      x: prop.x - w / 2,
      y: prop.y - h / 2,
      w,
      h,
    };
  }

  function destructibleIntersectsCircle(prop, x, y, r) {
    const rect = getDestructibleRect(prop);
    return circleRect(x, y, r, rect.x, rect.y, rect.w, rect.h);
  }

  function isBlocked(x, y, r) {
    if (walls.some(wall => circleRect(x, y, r, wall.x, wall.y, wall.w, wall.h))) return true;
    if (structures.some(structure => circleRect(x, y, r, structure.x - structure.w / 2, structure.y - structure.h / 2, structure.w, structure.h))) return true;
    return destructibles.some(prop => !prop.broken && !prop.hidden && destructibleIntersectsCircle(prop, x, y, r));
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
    destructibles.forEach(prop => {
      if (!prop || prop.broken || prop.hidden || prop.kind !== 'cover_wall') return;
      const rect = getDestructibleRect(prop);
      if (rect.w > 0 && rect.h > 0) rects.push(rect);
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

  function beamPathHitsDestructible(path, prop, padding = 0) {
    const rect = getDestructibleRect(prop);
    for (let index = 0; index < path.length; index += 1) {
      const segment = path[index];
      if (lineIntersectsRect(segment.x1, segment.y1, segment.x2, segment.y2, rect, padding)) return segment;
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

  // Expose touch-accessible APIs for mobile hamburger menu
  window._neoGame = { pauseGame, resumeGame, toggleInventoryPanel };
})();
