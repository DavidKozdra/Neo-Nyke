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
  const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'impossible', 'god'];
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
  };
  const CHALLENGE_DEFS = {
    no_hit: {
      key: 'no_hit',
      name: 'Never Get Hit',
      cost: 140,
      unlockLoops: 5,
      description: 'Any real damage kills the run immediately.',
    },
    no_items: {
      key: 'no_items',
      name: 'No Items',
      cost: 90,
      unlockLoops: 5,
      description: 'Start with no relic. Item pickups and relic buys are disabled.',
    },
  };
  const CHALLENGE_ORDER = Object.keys(CHALLENGE_DEFS);

  const CHARACTER_DEFS = {
    thorn_knight: {
      key: 'thorn_knight',
      name: 'Thorn Knight',
      rarity: 'knight',
      startItem: 'neo_knife',
      damageMultiplier: 1,
      skills: { melee: 'Slash', laser: 'Blood Beam', smash: 'Crimson Smash', dash: 'Dash' },
    },
    metao: {
      key: 'metao',
      name: 'Metao',
      rarity: 'wizard',
      startItem: 'orb_of_blood',
      damageMultiplier: 0.5,
      skills: { melee: 'Fire Balls', laser: 'Power Disks', smash: 'Chaos Burst', dash: 'Dash' },
    },
    granialla: {
      key: 'granialla',
      name: 'Granialla',
      rarity: 'god',
      startItem: 'neo_knife',
      damageMultiplier: 1,
      skills: { melee: 'Smite', laser: 'Blade Justice', smash: 'Healing Zone', dash: 'Dash' },
      unlock: 'godslain',
    },
  };

  const HERO_DISPLAY = {
    thorn_knight: {
      lore: 'A bleed-forged warrior who turns wounds into weapons. The longer the fight, the deadlier he becomes.',
      stats: [
        { label: 'HP',    pct: 66, color: '#c06060' },
        { label: 'DMG',   pct: 66, color: '#c08040' },
        { label: 'SPD',   pct: 66, color: '#8080c0' },
        { label: 'RANGE', pct: 40, color: '#60a080' },
      ],
      skills: ['⚔ Slash', '🩸 Blood Beam', '💥 Crimson Smash'],
    },
    metao: {
      lore: 'Wizard king of chaos and fire. Low raw damage but disks and blasts reward aggressive play.',
      stats: [
        { label: 'HP',    pct: 66, color: '#c06060' },
        { label: 'DMG',   pct: 33, color: '#c08040' },
        { label: 'SPD',   pct: 66, color: '#8080c0' },
        { label: 'RANGE', pct: 90, color: '#60a080' },
      ],
      skills: ['🔥 Fire Balls', '💿 Power Disks', '🌀 Chaos Burst'],
    },
    granialla: {
      lore: 'Ascended beyond death. Divine judgment and self-restoration — earned only by slaying GOD.',
      stats: [
        { label: 'HP',    pct: 66, color: '#c06060' },
        { label: 'DMG',   pct: 66, color: '#c08040' },
        { label: 'SPD',   pct: 66, color: '#8080c0' },
        { label: 'RANGE', pct: 66, color: '#60a080' },
      ],
      skills: ['⚡ Smite', '⚖ Blade Justice', '✨ Healing Zone'],
    },
  };

  const SPRITE_SOURCE_SIZE = 10;
  const SPRITE_DEFS = window.NeoNykeSpriteDefs || {};
  const SPRITE_ATLAS = buildSpriteAtlas();

  const MOVE_SLOTS = ['melee', 'laser', 'smash', 'dash'];
  const MOVE_DEFS = {
    slash: { key: 'slash', slot: 'melee', name: 'Slash', desc: 'Close-range arc attack.' },
    fire_balls: { key: 'fire_balls', slot: 'melee', name: 'Fire Balls', desc: 'Shoot a spread of fireballs.' },
    smite: { key: 'smite', slot: 'melee', name: 'Smite', desc: 'Physical swing plus chaining lightning.' },

    blood_beam: { key: 'blood_beam', slot: 'laser', name: 'Blood Beam', desc: 'Sustained piercing beam that causes bleed.' },
    turtle_wave: { key: 'turtle_wave', slot: 'laser', name: 'Turtle Wave', desc: 'Giant beam. Costs 2 HP to cast.' },
    power_disks: { key: 'power_disks', slot: 'laser', name: 'Power Disks', desc: 'Burst of spinning disks.' },
    blade_justice: { key: 'blade_justice', slot: 'laser', name: 'Blade Justice', desc: 'Divine short-range blade strike.' },
    lightning_columns: { key: 'lightning_columns', slot: 'laser', name: 'Lightning Columns', desc: 'Summon two lightning turrets.' },
    god_sweep: { key: 'god_sweep', slot: 'laser', name: 'God Sweep', desc: 'Spin a massive divine beam around yourself.' },

    crimson_smash: { key: 'crimson_smash', slot: 'smash', name: 'Crimson Smash', desc: 'Heavy area smash.' },
    chaos_burst: { key: 'chaos_burst', slot: 'smash', name: 'Chaos Burst', desc: 'Multiple chaos detonations.' },
    healing_zone: { key: 'healing_zone', slot: 'smash', name: 'Healing Zone', desc: 'Healing and damage zone.' },
    fire_circle: { key: 'fire_circle', slot: 'smash', name: 'Fire Circle', desc: 'Burning aura around you.' },
    floor_lava: { key: 'floor_lava', slot: 'smash', name: 'Floor Is Lava', desc: 'Lava immunity and lava trail.' },

    dash: { key: 'dash', slot: 'dash', name: 'Dash', desc: 'Fast invulnerable burst movement.', maxStacks: 1, stackOverrides: { thorn_knight: 2 } },
    warp: { key: 'warp', slot: 'dash', name: 'Warp', desc: 'Teleport to a safe room position.' },
  };

  const SHOP_MOVE_POOL = [
    'slash', 'fire_balls', 'smite',
    'blood_beam', 'turtle_wave', 'power_disks', 'blade_justice', 'lightning_columns',
    'god_sweep',
    'crimson_smash', 'chaos_burst', 'healing_zone', 'fire_circle', 'floor_lava',
    'dash', 'warp',
  ];

  const WEAPON_DEFS = {
    extending_staff: {
      key: 'extending_staff',
      name: 'Extending Staff',
      rarity: 'white',
      description: 'Long sweeping strike with massive knockback.',
      color: '#f2f6ff',
    },
    hunters_bow: {
      key: 'hunters_bow',
      name: "Hunter's Bow",
      rarity: 'white',
      description: 'Fast, accurate ranged shot with +10% crit chance.',
      color: '#e8f7ff',
    },
    thorns_bleed_blade: {
      key: 'thorns_bleed_blade',
      name: "Thorn's Bleed Blade",
      rarity: 'white',
      description: 'Close slash with heavy bleed application.',
      color: '#ffe9ef',
    },
    lazer_glasses: {
      key: 'lazer_glasses',
      name: 'Lazer Glasses',
      rarity: 'purple',
      description: 'Twin beams track your mouse and can ignite enemies.',
      color: '#cd9bff',
    },
    metao_fire_staff: {
      key: 'metao_fire_staff',
      name: "Metao's Fire Staff",
      rarity: 'purple',
      description: 'Fan cast of burning fire bolts.',
      color: '#ffb874',
    },
    magenta_degale: {
      key: 'magenta_degale',
      name: "Magenta's Degale",
      rarity: 'purple',
      description: 'Super heavy shot with massive knockback and recoil.',
      color: '#ff8ccc',
    },
    magenta_p90: {
      key: 'magenta_p90',
      name: "Magenta's P90",
      rarity: 'purple',
      description: 'Rapid burst fire with controlled recoil.',
      color: '#ff9dd7',
    },
    granillia_lightning_spear: {
      key: 'granillia_lightning_spear',
      name: "Granillia's Spear of Lightning",
      rarity: 'red',
      description: 'Piercing lightning spear that chains on impact.',
      color: '#9bd9ff',
    },
    excalibur: {
      key: 'excalibur',
      name: 'Excalibur',
      rarity: 'red',
      description: 'A divine 1000-damage strike.',
      color: '#ffd980',
    },
    golden_fleece: {
      key: 'golden_fleece',
      name: 'Golden Fleece',
      rarity: 'red',
      description: 'Heals 20% max HP every 2 seconds while equipped.',
      color: '#ffe59c',
    },
    void_piercer: {
      key: 'void_piercer',
      name: 'Void Piercer',
      rarity: 'red',
      description: 'Pierces barriers with high damage and 20% crit.',
      color: '#ffd2c0',
    },
    aegis_shield_weapon: {
      key: 'aegis_shield_weapon',
      name: 'Aegis Shield',
      rarity: 'red',
      description: 'Blocks all incoming damage for 2 seconds.',
      color: '#c8f6ff',
    },
  };
  const WEAPON_KEYS = Object.keys(WEAPON_DEFS);
  const WHITE_WEAPON_POOL = ['extending_staff', 'hunters_bow', 'thorns_bleed_blade'];
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
      tags: ['bleed', 'starter'],
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
      rarity: 'white',
      color: '#f4f6fb',
      category: 'white',
      tags: ['charge', 'defense'],
    },
    crit_charm: {
      key: 'crit_charm',
      name: 'Crit Charm',
      shortName: 'Crit +5%',
      description: 'Critical hit chance +5%.',
      rarity: 'white',
      color: '#ffffff',
      category: 'white',
      tags: ['crit'],
    },
    attack_servo: {
      key: 'attack_servo',
      name: 'Attack Servo',
      shortName: 'AS +0.2',
      description: 'Attack speed +0.2.',
      rarity: 'white',
      color: '#eef5ff',
      category: 'white',
      tags: ['speed'],
    },
    keen_eye: {
      key: 'keen_eye',
      name: 'Keen Eye',
      shortName: 'Crit +5%',
      description: 'Crit chance +5%.',
      rarity: 'white',
      color: '#f7fbff',
      category: 'white',
      tags: ['crit'],
    },
    chrono_spring: {
      key: 'chrono_spring',
      name: 'Chrono Spring',
      shortName: 'AS +0.2',
      description: 'Attack speed +0.2.',
      rarity: 'white',
      color: '#e6f6ff',
      category: 'white',
      tags: ['speed'],
    },
    scholar_seal: {
      key: 'scholar_seal',
      name: 'Scholar Seal',
      shortName: 'XP +15%',
      description: 'Gain 15% more XP on enemy kill.',
      rarity: 'white',
      color: '#d0ecff',
      category: 'white',
      tags: ['xp'],
    },
    bandaid: {
      key: 'bandaid',
      name: 'Bandaid',
      shortName: 'DEF +0.5%',
      description: 'Defense +0.5%.',
      rarity: 'white',
      color: '#fff5f7',
      category: 'white',
      tags: ['defense'],
    },
    push_man: {
      key: 'push_man',
      name: 'Push Man',
      shortName: 'KB +18%',
      description: 'Knockback +18%.',
      rarity: 'white',
      color: '#fff2cf',
      category: 'white',
      tags: ['knockback'],
    },
    titan_heart: {
      key: 'titan_heart',
      name: 'Titan Heart',
      shortName: 'Max HP +8%',
      description: 'Max HP +8%.',
      rarity: 'white',
      color: '#ffd9de',
      category: 'white',
      tags: ['hp'],
    },
    charged_adapter: {
      key: 'charged_adapter',
      name: 'Charged Adapter',
      shortName: 'Adapter',
      description: 'Charge requirement -1. In non-boss fights, spend half your gold to teleport to the ladder room.',
      rarity: 'purple',
      color: '#b66cff',
      category: 'purple',
      tags: ['charge', 'mobility'],
    },
    explosive_jelly: {
      key: 'explosive_jelly',
      name: 'Explosive Jelly',
      shortName: 'AOE x2',
      description: 'All player AOE ranges are doubled.',
      rarity: 'purple',
      color: '#ffb27d',
      category: 'purple',
      tags: ['aoe', 'purple'],
    },
    dragon_orb: {
      key: 'dragon_orb',
      name: 'Dragon Orb',
      shortName: 'Beam Chain',
      description: 'Beam attacks deal more damage and chain to a nearby enemy after locking on.',
      rarity: 'purple',
      color: '#b77dff',
      category: 'purple',
      tags: ['beam', 'spell', 'purple'],
    },
    turtle_shell: {
      key: 'turtle_shell',
      name: 'Turtle Shell',
      shortName: 'Shell +5%',
      description: 'Move speed +5%.',
      rarity: 'white',
      color: '#d2ffd8',
      category: 'white',
      tags: ['speed', 'move'],
    },
    iron_lung: {
      key: 'iron_lung',
      name: 'Iron Lung',
      shortName: 'Iron',
      description: 'Cannot lose more than 20% max HP in one room.',
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
    deadInfo: document.getElementById('deadInfo'),
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
    settingsBtn: document.getElementById('settingsBtn'),
    charBackBtn: document.getElementById('charBackBtn'),
    deleteRunRow: document.getElementById('deleteRunRow'),
    deleteRunBtn: document.getElementById('deleteRunBtn'),
    runSummary: document.getElementById('runSummary'),
    charButtons: [...document.querySelectorAll('#choose .char-card')],
    difficultyButtons: [...document.querySelectorAll('#difficultySelect .difficulty-btn')],
    challengeButtons: [...document.querySelectorAll('#challengeSelect .challenge-btn')],
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
    ['menu', 'charselect', 'play', 'dialogue', 'pause', 'dead', 'win'].forEach(state => gameStateManager.addState(state));
  }
  const uiController = createUIController(ui);

  let player = null;
  let enemies = [];
  let particles = [];
  let projectiles = [];
  let chests = [];
  let pickups = [];
  let rooms = [];
  let currentRoom = null;
  let keys = {};
  let mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false, right: false };
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
  let dashKeyLatch = false;
  let chosenCharacter = 'thorn_knight';
  let selectedDifficulty = 'easy';
  let selectedChallenges = [];
  let destructibles = [];
  let hazards = [];
  let shopOffers = [];
  let structures = [];
  let decorations = [];
  let activeRun = null;
  let metaProgress = createDefaultMeta();
  let runHistory = [];
  let lastDamageSource = '';
  let savePendingTimer = 0;
  let lavaAnimTime = 0;
  let floorSkipPending = 0;
  let teleportKeyLatch = false;
  let shopKeyLatch = false;
  let invKeyLatch = false;
  let activeShopTab = 'items';
  let activeInvTab = 'stats';
  let draggingMoveKey = '';
  let weaponBurstQueue = [];
  let activeInventorySlot = '';
  let shopPanelDirty = false;
  let inventoryPanelDirty = false;
  let wizardPawSelection = null;

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

  boot();

  async function boot() {
    if (gameStateManager) gameStateManager.setState(gameState);
    else uiController.setState(gameState);
    uiController.setHudUpdateHook(() => {
      if (gameState !== 'play' || !player) return;
      updateObjective();
      updateHud();
    });
    bindInput();
    bindPanelInput();
    drawActionIcons();
    await loadPersistedState();
    updateCharacterSelectionUI();
    refreshMenuState();
    draw();
  }

  function ensureItemNotifyStack() {
    let stack = document.getElementById('itemNotifyStack');
    if (stack) return stack;
    stack = document.createElement('div');
    stack.id = 'itemNotifyStack';
    (document.getElementById('wrap') || document.body).appendChild(stack);
    return stack;
  }

  function drawItemToastIcon(canvas, item) {
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const color = item?.color || '#ffffff';
    const symbolByRarity = {
      god: '✦',
      purple: '◆',
      wizard: '✹',
      knight: '⚔',
      white: '●',
    };
    const symbol = symbolByRarity[item?.rarity] || '●';
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
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
    name.style.color = item.color || '#d8e9ff';

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

  function drawMoveToastIcon(canvas, moveDef) {
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const slotColor = {
      melee: '#ff9a6b',
      laser: '#78d7ff',
      smash: '#c08cff',
      dash: '#79f7bf',
    };
    const slotGlyph = {
      melee: '⚔',
      laser: '✦',
      smash: '⬣',
      dash: '➤',
    };
    const color = slotColor[moveDef?.slot] || '#9ec6ff';
    const glyph = slotGlyph[moveDef?.slot] || '✦';

    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
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

  function bindInput() {
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('mousemove', event => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
      mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
    });
    canvas.addEventListener('mousedown', event => {
      if (event.button === 0) mouse.down = true;
      if (event.button === 2) mouse.right = true;
    });
    window.addEventListener('mouseup', event => {
      if (event.button === 0) mouse.down = false;
      if (event.button === 2) mouse.right = false;
    });
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
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
      if (key === 'e') shopKeyLatch = false;
      if (key === inventoryKey) invKeyLatch = false;
    });
    uiController.bindMenuActions({
      _getChosenCharacter() { return chosenCharacter; },
      onCharacterSelect(characterKey, button) {
        if (button.classList.contains('locked')) return;
        chosenCharacter = characterKey;
        updateCharacterSelectionUI();
      },
      onDifficultySelect(difficultyKey, button) {
        if (button.classList.contains('locked')) return;
        selectedDifficulty = normalizeDifficulty(difficultyKey);
        updateCharacterSelectionUI();
      },
      onChallengeSelect(challengeKey, button) {
        const def = CHALLENGE_DEFS[challengeKey];
        if (!def || button.classList.contains('locked')) return;
        const owned = getOwnedChallengeSet();
        if (!owned.has(challengeKey)) {
          if ((metaProgress.coins || 0) < def.cost) {
            particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 30, life: 0.9, text: 'Not enough bank coins', c: '#ff6f7f' });
            return;
          }
          metaProgress.coins -= def.cost;
          metaProgress.unlockedChallenges = normalizeChallengeSelection([...(metaProgress.unlockedChallenges || []), challengeKey]);
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
      onToggleRunHistory() {
        uiController.setRunHistoryOpen(ui.runHistoryPanel?.classList.contains('hidden'));
      },
      onOpenCharacterSelect() { setGameState('charselect'); },
      onCloseCharacterSelect() { setGameState('menu'); },
      onStartNew() { void startGame(false); },
      onContinue() { void startGame(true); },
      onDeleteRun() { void deleteSavedRun(); },
    });
    uiController.bindRestartActions(() => location.reload());

    ui.pauseResume.addEventListener('click', resumeGame);
    ui.pauseSettings.addEventListener('click', () => {
      document.getElementById('settingsBtn').click();
    });
    ui.pauseMain.addEventListener('click', () => {
      clearTimeout(savePendingTimer);
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
  }

  function bindPanelInput() {
    ui.shopClose?.addEventListener('click', () => setShopPanelOpen(false));
    ui.invClose?.addEventListener('click', () => setInventoryPanelOpen(false));
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

  function isWizardPawOpen() {
    return !!wizardPawSelection && isPanelOpen(ui.wizardPawModal);
  }

  function setWizardPawModalOpen(open) {
    if (!ui.wizardPawModal) return;
    ui.wizardPawModal.classList.toggle('hidden', !open);
    ui.wizardPawModal.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function isOverlayBlockingInput() {
    return isPanelOpen(ui.shopPanel) || isPanelOpen(ui.invPanel) || isWizardPawOpen();
  }

  function isGodSweepUnlocked() {
    return Number(metaProgress.godsKilled || 0) > 0 && Number(metaProgress.loopCrystals || 0) >= 5;
  }

  function getShopMoveOffers() {
    if (!currentRoom || currentRoom.type !== 'shop') return [];
    if (!Array.isArray(currentRoom.shopMoveOffers) || currentRoom.shopMoveOffers.length === 0) {
      const seen = new Set(Object.keys(player?.ownedMoves || {}));
      const pool = SHOP_MOVE_POOL.filter(key => key !== 'god_sweep' && !seen.has(key));
      shuffle(pool, 'loot');
      const offers = pool.slice(0, 4).map((moveKey, index) => ({
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
      shuffle(filtered, 'loot');
      const offers = filtered.slice(0, 3).map((weaponKey, index) => ({
        type: 'weapon',
        key: weaponKey,
        bought: false,
        cost: getShopWeaponCost(WEAPON_DEFS[weaponKey]?.rarity || 'white', index),
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
            <h4>${item?.name || 'Item'}</h4>
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
            <h4>${weapon?.name || offer.key}</h4>
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
    }

    const moveOffers = getShopMoveOffers();
    const moveCards = moveOffers
      .map((offer, index) => {
        const def = MOVE_DEFS[offer.key];
        const owned = !!player.ownedMoves?.[offer.key];
        const canAfford = player.coins >= offer.cost;
        const disabled = offer.bought || owned || !canAfford;
        return `<div class="shop-card${!canAfford && !owned && !offer.bought ? ' shop-card--unaffordable' : ''}">
          <span class="shop-card__eyebrow">${def?.slot || 'move'}</span>
          <div class="shop-card__title-row">
            <h4>${def?.name || offer.key}</h4>
            <span class="shop-card__price">${offer.cost}</span>
          </div>
          <div class="shop-card__copy">
            <p>${def?.desc || 'No move description available.'}</p>
          </div>
          <div class="shop-card__footer">
            <button class="shop-buy${!canAfford && !owned && !offer.bought ? ' shop-buy--unaffordable' : ''}" data-kind="move" data-index="${index}" ${disabled ? 'disabled' : ''}>${offer.bought || owned ? 'Owned' : !canAfford ? 'Too Expensive' : 'Buy Move'}</button>
          </div>
        </div>`;
      })
      .join('');
    ui.shopMoves.innerHTML = moveCards || '<div class="shop-card shop-empty"><p>No new techniques are on the rack right now.</p></div>';

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
    shopPanelDirty = false;
  }

  function renderInventoryPanel() {
    if (!ui.invPanel || !player) return;

    ui.invTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.invTab === activeInvTab);
    });
    const tabPanels = { stats: 'invTabStats', items: 'invTabItems', moves: 'invTabMoves', equipped: 'invTabEquipped' };
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
            <h4>${item?.name || key}</h4>
            <span class="inv-card__count">x${player.items[key]}</span>
          </div>
          <p>${item?.description || 'No item description available.'}</p>
        </div>`;
      })
      .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No relics yet</h4><p>Your pockets are clear. Loot rooms or buy from the shop to start a build.</p></div>';

    const ownedWeapons = WEAPON_KEYS
      .filter(key => player.ownedWeapons?.[key])
      .sort((a, b) => {
        const order = { white: 1, purple: 2, red: 3 };
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
          return `<button class="inv-move-chip${equipped ? ' is-match' : ''}" data-weapon="${key}" type="button">
            <div class="inv-move-chip__meta">
              <b>${def?.name || key}</b>
              <span class="inv-move-chip__slot">${def?.rarity || 'weapon'}</span>
            </div>
            <p>${def?.description || 'No weapon description available.'}</p>
            <span class="inv-move-chip__hint">${equipped ? 'Equipped' : 'Click to equip'}</span>
          </button>`;
        })
        .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No weapons owned</h4><p>Buy weapons in the shop to override left click.</p></div>';
    }

    const equippedMoveKeys = new Set(Object.values(player.equippedMoves || {}).filter(Boolean));
    const ownedMoves = Object.keys(player.ownedMoves || {})
      .filter(key => player.ownedMoves[key] && MOVE_DEFS[key])
      .filter(key => !equippedMoveKeys.has(key))
      .sort((a, b) => MOVE_DEFS[a].slot.localeCompare(MOVE_DEFS[b].slot));
    ui.invMovesList.innerHTML = ownedMoves
      .map(key => {
        const def = MOVE_DEFS[key];
        const isMatch = activeInventorySlot && activeInventorySlot === def.slot;
        return `<div class="inv-move-chip${isMatch ? ' is-match' : ''}" draggable="true" data-move="${key}" data-slot-type="${def.slot}">
          <div class="inv-move-chip__meta">
            <b>${def.name}</b>
            <span class="inv-move-chip__slot">${def.slot}</span>
          </div>
          <p>${def.desc}</p>
          <span class="inv-move-chip__hint">${isMatch ? 'Selected slot match. Click or drag to equip.' : 'Click or drag to equip.'}</span>
        </div>`;
      })
      .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No spare moves</h4><p>Every move you own is currently equipped. Buy a new technique to open up swap options.</p></div>';

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
      node.innerHTML = `<div class="inv-slot__top"><span class="inv-slot__kicker">${slot}</span><span class="inv-slot__status">${isSelected ? 'Selected' : 'Equipped'}</span></div><div class="inv-slot__move">${def?.name || 'No move equipped'}</div><p class="inv-slot__hint">${isSelected ? 'Matching spare moves are highlighted. Click one or drag it here to swap.' : def?.desc || 'Click this slot to focus matching spare moves, or drag a matching move here to assign it.'}</p>`;
    });
    if (ui.invWeaponSlot) {
      const weapon = WEAPON_DEFS[player.equippedWeapon];
      ui.invWeaponSlot.dataset.rarity = weapon?.rarity || '';
      ui.invWeaponSlot.innerHTML = `<div class="inv-slot__top"><span class="inv-slot__kicker">weapon</span><span class="inv-slot__status">${weapon ? 'Equipped' : 'Empty'}</span></div><div class="inv-slot__move">${weapon?.name || 'No weapon equipped'}</div><p class="inv-slot__hint">${weapon?.description || 'Equip a weapon to make left click use weapon abilities instead of melee moves.'}</p>`;
    }
    inventoryPanelDirty = false;
  }

  function equipMove(slot, moveKey) {
    if (!player || !MOVE_DEFS[moveKey]) return;
    if (MOVE_DEFS[moveKey].slot !== slot) return;
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
      if (!offer || offer.bought || player.ownedMoves?.[offer.key]) return;
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
      unlockedItems: ['neo_knife'],
      unlockedCharacters: ['thorn_knight', 'metao'],
      unlockedChallenges: [],
      selectedChallenges: [],
      godsKilled: 0,
      loopCrystals: 0,
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
      bandaid: 0,
      push_man: 0,
      titan_heart: 0,
      charged_adapter: 0,
      explosive_jelly: 0,
      turtle_shell: 0,
      iron_lung: 0,
      oracles_lens: 0,
      wizards_paw: 0,
      jesters_dice: 0,
      shield_of_aegis: 0,
      pendant_of_kronos: 0,
    };
    const character = CHARACTER_DEFS[chosenCharacter] || CHARACTER_DEFS.thorn_knight;
    if (!isChallengeActive('no_items')) items[character.startItem] = 1;
    const equippedMoves = character.key === 'metao'
      ? { melee: 'fire_balls', laser: 'power_disks', smash: 'chaos_burst', dash: 'dash' }
      : character.key === 'granialla'
        ? { melee: 'smite', laser: 'blade_justice', smash: 'healing_zone', dash: 'dash' }
        : { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' };
    const ownedMoves = {};
    Object.values(equippedMoves).forEach(key => { ownedMoves[key] = true; });
    return {
      character: character.key,
      x: START_X,
      y: START_Y,
      r: 14,
      vx: 0,
      vy: 0,
      hp: 120,
      maxHp: 120,
      swing: 0,
      swingA: 0,
      inv: 0,
      dashTime: 0,
      dashX: 0,
      dashY: 0,
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
      escapeChargeKills: 0,
      escapeReady: true,
      statuses: createStatusMap(),
      items,
      ownedWeapons: {},
      equippedWeapon: '',
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
    };
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
          selectedChallenges: normalizeChallengeSelection(savedMeta.selectedChallenges),
        };
      }
      runHistory = normalizeRunHistory(savedRunHistory || savedMeta?.runHistory);
      activeRun = savedRun && typeof savedRun === 'object' ? savedRun : null;
      if (activeRun) {
        activeRun.difficulty = normalizeDifficulty(activeRun.difficulty);
        activeRun.challenges = normalizeChallengeSelection(activeRun.challenges);
      }
      selectedChallenges = normalizeChallengeSelection(metaProgress.selectedChallenges);
      uiController.setSaveState(saveStore.kind);
    } catch (error) {
      console.error('Failed to load save data', error);
      uiController.setSaveState('SAVE ERROR');
      activeRun = null;
    }
  }

  function normalizeUnlockedItems(input) {
    const fallback = ['neo_knife'];
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
    const fallback = ['thorn_knight', 'metao'];
    if (!Array.isArray(input)) return fallback;
    const chars = Object.keys(CHARACTER_DEFS).filter(name => input.includes(name));
    return chars.length ? chars : fallback;
  }

  function normalizeDifficulty(input) {
    return DIFFICULTY_DEFS[input] ? input : 'easy';
  }

  function normalizeChallengeSelection(input) {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter(key => CHALLENGE_DEFS[key]))];
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
        totalItemStacks: Math.max(0, Number(entry.totalItemStacks || 0)),
        challenges: Array.isArray(entry.challenges) ? entry.challenges.map(String) : [],
        items: Array.isArray(entry.items) ? entry.items.map(item => ({
          key: String(item.key || ''),
          name: String(item.name || item.key || 'Unknown'),
          count: Math.max(0, Number(item.count || 0)),
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
    const loopCrystals = Number(metaProgress.loopCrystals || 0);
    return new Set(CHALLENGE_ORDER.filter(key => loopCrystals >= CHALLENGE_DEFS[key].unlockLoops));
  }

  function isChallengeActive(key) {
    return selectedChallenges.includes(key);
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
    return DIFFICULTY_DEFS[normalizeDifficulty(key)];
  }

  function getShopPriceMultiplier(difficultyKey = selectedDifficulty) {
    return Number(getDifficultyDef(difficultyKey)?.shopPriceMultiplier || 1);
  }

  function scaleShopPrice(baseCost, difficultyKey = selectedDifficulty) {
    return Math.max(1, Math.round(baseCost * getShopPriceMultiplier(difficultyKey)));
  }

  function getShopPotionCost(floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(18 + floorValue * 2, difficultyKey);
  }

  function getShopItemCost(itemIndex = 0, floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(32 + floorValue * 4 + itemIndex * 6, difficultyKey);
  }

  function getShopMoveCost(moveIndex = 0, floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(34 + floorValue * 6 + moveIndex * 4, difficultyKey);
  }

  function getShopWeaponCost(rarity = 'white', weaponIndex = 0, floorValue = floor, difficultyKey = selectedDifficulty) {
    if (rarity === 'red') return scaleShopPrice(180 + floorValue * 14 + weaponIndex * 10, difficultyKey);
    if (rarity === 'purple') return scaleShopPrice(88 + floorValue * 9 + weaponIndex * 8, difficultyKey);
    return scaleShopPrice(52 + floorValue * 5 + weaponIndex * 6, difficultyKey);
  }

  function getShopGodSweepCost(floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(140 + floorValue * 12, difficultyKey);
  }

  function getShopHealCost(kind, floorValue = floor, difficultyKey = selectedDifficulty) {
    if (kind === 'major') return scaleShopPrice(34 + floorValue * 4, difficultyKey);
    return scaleShopPrice(16 + floorValue * 2, difficultyKey);
  }

  function getLaserCastDuration(moveKey = getEquippedMove('laser'), attackSpeed = getAttackSpeedValue()) {
    if (moveKey === 'god_sweep') return 1.45 / attackSpeed;
    if (moveKey === 'turtle_wave') return 1.35 / attackSpeed;
    return (godTimer > 0 ? 0.72 : ATTACKS.laser.duration) / attackSpeed;
  }

  function getMeleeCooldownDuration(moveKey = getEquippedMove('melee'), attackSpeed = getAttackSpeedValue()) {
    if (moveKey === 'slash') return 0.4 / attackSpeed;
    return (godTimer > 0 ? 0.2 : ATTACKS.melee.baseCooldown) / attackSpeed;
  }

  function getLaserCooldownDuration(moveKey = getEquippedMove('laser'), attackSpeed = getAttackSpeedValue()) {
    if (moveKey === 'turtle_wave') return 3 / attackSpeed;
    if (moveKey === 'blade_justice') return 3.8 / attackSpeed;
    if (moveKey === 'lightning_columns') return 4.8 / attackSpeed;
    if (moveKey === 'god_sweep') return 7.2 / attackSpeed;
    return (godTimer > 0 ? 2.8 : ATTACKS.laser.baseCooldown) / attackSpeed;
  }

  function getDashCooldownDuration(moveKey = getEquippedMove('dash'), attackSpeed = getAttackSpeedValue()) {
    if (moveKey === 'warp') return 2.8 / attackSpeed;
    return 1.8 / attackSpeed;
  }

  function getSmashCooldownDuration(attackSpeed = getAttackSpeedValue()) {
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
    return true;
  }

  function queueHeldSkillRecharge(slot, rechargeTime) {
    const state = cooldowns[slot] || createCooldownEntry(slot);
    if (state.holding > 0) state.holding -= 1;
    state.timers.push(rechargeTime);
    cooldowns[slot] = state;
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
        offer.cost = getShopItemCost(itemIndex, floorValue, difficultyKey);
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
        const rarity = WEAPON_DEFS[offer.key]?.rarity || 'white';
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
    return new Set(DIFFICULTY_ORDER.filter(key => loopCrystals >= DIFFICULTY_DEFS[key].unlockLoops));
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
    return `<button class="rh-row${selected ? ' active' : ''}" data-run-id="${escapeHtml(entry.id)}" data-result="${entry.result}" type="button">
      <canvas class="rh-row-portrait" data-run-character="${escapeHtml(entry.character)}" width="40" height="40" aria-hidden="true"></canvas>
      <span class="rh-row-body">
        <span class="rh-row-top">
          <span class="rh-row-name">${escapeHtml(entry.characterName)}</span>
          <span class="rh-row-badge">${entry.result === 'win' ? 'WIN' : 'DEAD'}</span>
        </span>
        <span class="rh-row-sub">Fl.${entry.floor} · ${escapeHtml(cause)} · ${escapeHtml(formatRunEndedAt(entry.endedAt))}</span>
      </span>
    </button>`;
  }

  function renderRunHistoryHero(entry) {
    const win = entry.result === 'win';
    const detail = win ? 'Run cleared' : `Killed by ${escapeHtml(entry.killedBy || 'Unknown')}`;
    return `<div class="rh-hero" data-result="${entry.result}">
      <canvas class="rh-hero-portrait" data-run-character="${escapeHtml(entry.character)}" width="64" height="64" aria-hidden="true"></canvas>
      <div class="rh-hero-info">
        <span class="rh-outcome">${win ? 'VICTORY' : 'DEFEAT'}</span>
        <strong class="rh-hero-name">${escapeHtml(entry.characterName)}</strong>
        <span class="rh-hero-meta">${escapeHtml(entry.difficultyName)} · Floor ${entry.floor} · Loop ${entry.loop}</span>
        <span class="rh-hero-meta">${detail}</span>
        <span class="rh-hero-date">${escapeHtml(formatRunEndedAt(entry.endedAt))}</span>
      </div>
    </div>`;
  }

  function renderRunHistoryTabContent(entry, tab = 'stats') {
    if (tab === 'items') {
      if (!entry.items.length) return '<p class="rh-empty-inner">No relics collected.</p>';
      return `<div class="rh-items-grid">${entry.items.map(i => `<div class="rh-item-tile"><span class="rh-item-icon">${escapeHtml(i.name.charAt(0))}</span><span class="rh-item-name">${escapeHtml(i.name)}</span><span class="rh-item-count">x${i.count}</span></div>`).join('')}</div>`;
    }
    if (tab === 'moves') {
      if (!entry.equippedMoves.length) return '<p class="rh-empty-inner">No move data recorded.</p>';
      return `<div class="rh-moves-grid">${entry.equippedMoves.map(m => `<div class="rh-move-slot" data-slot="${escapeHtml(m.slot)}"><span class="rh-move-label">${escapeHtml(m.slot.toUpperCase())}</span><span class="rh-move-name">${escapeHtml(m.name)}</span></div>`).join('')}</div>`;
    }
    return `<div class="rh-stats-grid">
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
    </div>`;
  }

  function hydrateRunHistorySprites(root = ui.runHistoryList) {
    if (!(root instanceof Element)) return;
    root.querySelectorAll('[data-run-character]').forEach(element => {
      if (!(element instanceof HTMLCanvasElement)) return;
      drawSpriteToCanvas(element, element.dataset.runCharacter || 'thorn_knight', 56);
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
    const unlocked = new Set(metaProgress.unlockedCharacters || ['thorn_knight', 'metao']);
    const unlockedDifficulties = getUnlockedDifficultySet();
    const unlockedChallenges = getUnlockedChallengeSet();
    const ownedChallenges = getOwnedChallengeSet();
    if (metaProgress.godsKilled > 0) unlocked.add('granialla');
    if (!unlocked.has(chosenCharacter)) chosenCharacter = [...unlocked][0] || 'thorn_knight';
    if (!unlockedDifficulties.has(selectedDifficulty)) selectedDifficulty = 'easy';
    selectedChallenges = normalizeChallengeSelection(selectedChallenges).filter(key => unlockedChallenges.has(key) && ownedChallenges.has(key));
    metaProgress.selectedChallenges = normalizeChallengeSelection(selectedChallenges);
    uiController.updateCharacterSelection(unlocked, chosenCharacter);
    uiController.updateDifficultySelection(unlockedDifficulties, selectedDifficulty, metaProgress.loopCrystals || 0);
    uiController.updateChallengeSelection(unlockedChallenges, ownedChallenges, selectedChallenges, metaProgress.loopCrystals || 0, metaProgress.coins || 0);
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
      lastDamageSource = '';
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

  function resetScene() {
    enemies = [];
    particles = [];
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
    wizardPawSelection = null;
    setWizardPawModalOpen(false);
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    mouse.down = false;
    mouse.right = false;
    lastDamageSource = '';
  }

  function restoreRun(snapshot) {
    baseSeedStr = snapshot.baseSeedStr || snapshot.seedStr || createRandomSeed();
    lastDamageSource = '';
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
    particles = [];
    projectiles = snapshot.projectiles || [];
    chests = snapshot.chests || [];
    pickups = snapshot.pickups || [];
    destructibles = snapshot.destructibles || currentRoom?.destructibles || [];
    hazards = snapshot.hazards || currentRoom?.hazards || [];
    shopOffers = snapshot.shopOffers || currentRoom?.shopOffers || [];
    structures = snapshot.structures || currentRoom?.structures || [];
    decorations = snapshot.decorations || currentRoom?.decorations || [];
    if (currentRoom) {
      currentRoom.enemies = Array.isArray(currentRoom.enemies) ? currentRoom.enemies.map(migrateEnemyState) : enemies;
      currentRoom.projectiles = Array.isArray(currentRoom.projectiles) ? currentRoom.projectiles : projectiles;
      currentRoom.chests = Array.isArray(currentRoom.chests) ? currentRoom.chests : chests;
      currentRoom.pickups = Array.isArray(currentRoom.pickups) ? currentRoom.pickups : pickups;
      currentRoom.destructibles = Array.isArray(currentRoom.destructibles) ? currentRoom.destructibles : destructibles;
      currentRoom.hazards = Array.isArray(currentRoom.hazards) ? currentRoom.hazards : hazards;
      currentRoom.shopOffers = Array.isArray(currentRoom.shopOffers) ? currentRoom.shopOffers : shopOffers;
      currentRoom.shopWeaponOffers = Array.isArray(currentRoom.shopWeaponOffers) ? currentRoom.shopWeaponOffers : [];
      currentRoom.structures = Array.isArray(currentRoom.structures) ? currentRoom.structures : structures;
      currentRoom.decorations = Array.isArray(currentRoom.decorations) ? currentRoom.decorations : decorations;
      refreshRoomShopCosts(currentRoom, selectedDifficulty, floor);
      enemies = currentRoom.enemies;
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
    assignSecretRoom(roomMap);
    rooms.forEach(decorateRoomData);

    player.x = START_X;
    player.y = START_Y;
    enterRoom(startRoom);
    updateObjective();
    updateHud();
  }

  function decorateRoomData(room) {
    room.enemies = [];
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
        const offerPool = shuffle(['relic', 'vitality', 'wealth'], 'world');
        room.pickups.push(createSecretVendorOffer(offerPool[0], ROOM_W / 2 - 110, ROOM_H / 2 + 26));
        room.pickups.push(createSecretVendorOffer(offerPool[1], ROOM_W / 2, ROOM_H / 2 - 18));
        room.pickups.push(createSecretVendorOffer(offerPool[2], ROOM_W / 2 + 110, ROOM_H / 2 + 26));
      }
      return;
    }

    decorateRoomStructures(room);

    const potCount = room.type === 'shop' ? 1 : room.type === 'challenge' ? 0 : irand(1, 3, 'world');
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

    if (nextRandom('world') < 0.45 && room.type !== 'shop' && room.type !== 'challenge') {
      room.destructibles.push({
        kind: 'barrel',
        x: 180 + rand(ROOM_W - 360, 0, 'world'),
        y: 140 + rand(ROOM_H - 280, 0, 'world'),
        r: 14,
        hp: 1,
        broken: false,
      });
    }

    if (nextRandom('world') < 0.4 && room.type !== 'god' && room.type !== 'challenge') {
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
    }
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
    return { x, y, type: 'secretVendor', offerKind: 'wealth', cost: 2, label: 'Wealth' };
  }

  function assignSecretRoom(roomMap) {
    const anchors = shuffle(rooms.filter(room => !room.secret && ['combat', 'treasure', 'shop'].includes(room.type)), 'world');
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

  function enterRoom(room) {
    syncCurrentRoomState();
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    currentRoom = room;
    room.explored = true;
    room.visited = true;
    enemies = room.enemies || [];
    projectiles = room.projectiles || [];
    chests = room.chests || [];
    pickups = room.pickups || [];
    particles = [];
    destructibles = room.destructibles || [];
    hazards = room.hazards || [];
    shopOffers = room.shopOffers || [];
    structures = room.structures || [];
    decorations = room.decorations || [];
    laserActive = false;
    laserTime = 0;
    laserTick = 0;
    laserMode = 'beam';
    laserAngle = 0;
    laserSweepSpeed = 0;
    player.roomDamageTaken = 0;
    const safeSpawn = findSafeSpawnPoint();
    player.x = safeSpawn.x;
    player.y = safeSpawn.y;

    if (room.type === 'combat' && !room.cleared && enemies.length === 0) {
      spawnWave(getWaveCount(3), 'combat');
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

    if (room.type === 'god') {
      if (room.cleared) {
        if (!pickups.some(pickup => pickup.type === 'crown')) {
          pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'crown' });
        }
      } else if (room.bossStarted) {
        if (!enemies.some(enemy => enemy.type === 'god')) {
          spawnGodBoss();
        }
      } else {
        if (!pickups.some(pickup => pickup.type === 'fightGod')) {
          pickups.push({ x: ROOM_W / 2 - 120, y: ROOM_H / 2, type: 'fightGod' });
        }
        if (!pickups.some(pickup => pickup.type === 'returnGate')) {
          pickups.push({ x: ROOM_W / 2 + 120, y: ROOM_H / 2, type: 'returnGate' });
        }
      }
    }

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
      room.shopOffers.push({
        type: 'item',
        key,
        cost: getShopItemCost(itemIndex),
        x: itemSlotsX[itemIndex] ?? ROOM_W / 2,
        y: ROOM_H / 2 - 16,
        bought: false,
      });
      created += 1;
    }
  }

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
    return baseOffset + floor + difficulty.waveBonus + irand(0, 1, 'encounter');
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
    miniBoss.max = miniBoss.hp;
    miniBoss.dmg = Math.round(miniBoss.dmg * 1.45);
    miniBoss.speed *= 0.94;
    miniBoss.r = Math.round(miniBoss.r * 1.08);
    miniBoss.miniBoss = true;
    particles.push({ x: miniBoss.x, y: miniBoss.y - 26, life: 0.7, text: 'MINI BOSS', c: '#ffb347' });
  }

  function spawnWave(count, roomType = 'combat') {
    const plan = buildWavePlan(count, roomType);
    for (let index = 0; index < plan.length; index += 1) {
      const angle = nextRandom('encounter') * Math.PI * 2;
      const radius = 120 + nextRandom('encounter') * 180;
      const x = clamp(ROOM_W / 2 + Math.cos(angle) * radius, 80, ROOM_W - 80);
      const y = clamp(ROOM_H / 2 + Math.sin(angle) * radius, 80, ROOM_H - 80);
      const safeSpawn = findSafeEnemySpawnPoint(x, y, 15);
      if (!safeSpawn) continue;
      const type = plan[index] || rollEnemyType();
      const eliteRoll = canSpawnEliteEnemies() && nextRandom('encounter') < getDifficultyDef().eliteChance;
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

  function applyEliteInventory(enemy) {
    const inventory = rollEliteInventory();
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
    } else if (type === 'artificer_knave') {
      base.r = 30;
      base.hp = 940;
      base.max = 940;
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

    if (base.elite) applyEliteInventory(base);

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
    const existing = pickups.find(pickup => pickup.type === 'challengeStarter');
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
      pickups.push({
        x: ROOM_W / 2 + Math.cos(angle) * 160,
        y: ROOM_H / 2 + Math.sin(angle) * 160,
        type: 'challengeRune',
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
    pickups = pickups.filter(pickup => pickup.type !== 'challengeStarter');
    const type = room.challengeType || 'mirror';
    if (type === 'mirror') {
      spawnMirrorChampion();
    } else if (type === 'stillness') {
      room.challengeTimer = 30;
      room.challengeData.maxTimer = 30;
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

  function spawnChallengeReward(text = 'TRIAL CLEARED') {
    if (!currentRoom || currentRoom.type !== 'challenge' || currentRoom.challengeRewardSpawned) return;
    currentRoom.challengeRewardSpawned = true;
    pickups = pickups.filter(pickup => !['challengeBomb', 'challengeRune', 'challengeStarter'].includes(pickup.type));
    pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 16, type: 'item', key: rollItemDrop({ elite: true, stream: 'loot' }) });
    pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2 + 36, type: 'potion' });
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
    pickups = pickups.filter(pickup => !['challengeBomb', 'challengeRune', 'challengeStarter'].includes(pickup.type));
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
    playerData.lavaWalkTime = Number(playerData.lavaWalkTime || 0);
    playerData.lavaTrailTick = Number(playerData.lavaTrailTick || 0);
    ensureStatuses(playerData);
    if (!playerData.equippedMoves || typeof playerData.equippedMoves !== 'object') {
      playerData.equippedMoves = playerData.character === 'metao'
        ? { melee: 'fire_balls', laser: 'power_disks', smash: 'chaos_burst', dash: 'dash' }
        : playerData.character === 'granialla'
          ? { melee: 'smite', laser: 'blade_justice', smash: 'healing_zone', dash: 'dash' }
          : { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' };
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
    playerData.weaponCooldown = Number(playerData.weaponCooldown || 0);
    playerData.blockActive = !!playerData.blockActive;
    playerData.blockTimer = Number(playerData.blockTimer || 0);
    playerData.fleeceTick = Number(playerData.fleeceTick || 0);
    playerData.weaponBeamTime = Number(playerData.weaponBeamTime || 0);
    playerData.weaponBeamTick = Number(playerData.weaponBeamTick || 0);
    MOVE_SLOTS.forEach(slot => {
      const moveKey = playerData.equippedMoves[slot];
      if (!MOVE_DEFS[moveKey] || MOVE_DEFS[moveKey].slot !== slot) {
        playerData.equippedMoves[slot] = slot === 'dash' ? 'dash' : slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : 'crimson_smash';
      }
      playerData.ownedMoves[playerData.equippedMoves[slot]] = true;
    });
    playerData.insuranceActive = !!playerData.insuranceActive;
    playerData.insuranceChargeKills = Number(playerData.insuranceChargeKills || 0);
    playerData.insuranceReady = playerData.insuranceReady !== false;
    playerData.escapeChargeKills = Number(playerData.escapeChargeKills || 0);
    playerData.escapeReady = playerData.escapeReady !== false;
    return playerData;
  }

  function getCharacterDef() {
    return CHARACTER_DEFS[player?.character || chosenCharacter] || CHARACTER_DEFS.thorn_knight;
  }

  function getItemCount(key) {
    return Number(player?.items?.[key] || 0);
  }

  function getChargeRequirement(baseRequirement) {
    return Math.max(1, baseRequirement - getItemCount('charged_adapter'));
  }

  function getItemStats() {
    const neoKnife = getItemCount('neo_knife');
    const orbOfBlood = getItemCount('orb_of_blood');
    const hemesScarf = getItemCount('hemes_scarf');
    const critCharm = getItemCount('crit_charm');
    const attackServo = getItemCount('attack_servo');
    const keenEye = getItemCount('keen_eye');
    const chronoSpring = getItemCount('chrono_spring');
    const scholarSeal = getItemCount('scholar_seal');
    const bandaid = getItemCount('bandaid');
    const pushMan = getItemCount('push_man');
    const explosiveJelly = getItemCount('explosive_jelly');
    const dragonOrb = getItemCount('dragon_orb');
    const turtleShell = getItemCount('turtle_shell');
    const shieldOfAegis = getItemCount('shield_of_aegis');
    const pendantOfKronos = getItemCount('pendant_of_kronos');
    const oracleLens = getItemCount('oracles_lens') > 0;
    const godItemStacks = ITEM_KEYS.reduce((total, key) => {
      if (ITEM_DEFS[key]?.rarity !== 'god') return total;
      return total + getItemCount(key);
    }, 0);
    let critChance = (critCharm + keenEye) * 0.05 + pendantOfKronos * godItemStacks * 0.01;
    if (oracleLens) critChance *= 2;
    critChance = clamp(critChance, 0, 0.95);
    const damageReduction = clamp(bandaid * 0.005 + shieldOfAegis * 0.2, 0, 0.85);
    return {
      bleedChance: neoKnife * 0.05,
      bleedDamageMultiplier: orbOfBlood > 0 ? 1 + orbOfBlood : 1,
      bleedHealScale: hemesScarf,
      passiveBleedStacks: hemesScarf,
      critChance,
      critMultiplier: 1.6 + (oracleLens ? critChance * 2.2 : critChance * 0.6),
      attackSpeedBonus: (attackServo + chronoSpring) * 0.2,
      moveSpeedMultiplier: 1 + turtleShell * 0.05,
      xpGainMultiplier: 1 + scholarSeal * 0.15,
      knockbackMultiplier: 1 + pushMan * 0.18,
      aoeRadiusMultiplier: 1 + explosiveJelly,
      beamDamageMultiplier: 1 + dragonOrb * 0.35,
      beamChainTargets: dragonOrb > 0 ? Math.min(2, dragonOrb) : 0,
      beamChainDamageMultiplier: dragonOrb > 0 ? 0.6 + (dragonOrb - 1) * 0.15 : 0,
      damageReduction,
      hasIronLung: getItemCount('iron_lung') > 0,
    };
  }

  function getAttackSpeedValue() {
    const stats = getItemStats();
    return Math.max(0.2, (player?.attackSpeed || 1) + stats.attackSpeedBonus);
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
  }

  function scaleDamageAgainstEnemy(enemy, damage) {
    const stats = getItemStats();
    const characterMultiplier = getCharacterDef().damageMultiplier || 1;
    const powered = (damage + (player?.attackPower || 0)) * characterMultiplier;
    if (getStatusStacks(enemy, 'bleed') > 0 && stats.bleedDamageMultiplier > 1) {
      return Math.round(powered * stats.bleedDamageMultiplier);
    }
    return Math.round(powered);
  }

  function getEquippedMove(slot) {
    const moveKey = player?.equippedMoves?.[slot];
    if (MOVE_DEFS[moveKey]?.slot === slot) return moveKey;
    return slot === 'dash' ? 'dash' : slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : 'crimson_smash';
  }

  function getEquippedWeapon() {
    const key = player?.equippedWeapon || '';
    return WEAPON_DEFS[key] ? key : '';
  }

  function getWeaponBaseCooldown(weaponKey) {
    if (weaponKey === 'extending_staff') return 0.5;
    if (weaponKey === 'hunters_bow') return 0.4;
    if (weaponKey === 'thorns_bleed_blade') return 0.35;
    if (weaponKey === 'lazer_glasses') return 3.6;
    if (weaponKey === 'metao_fire_staff') return 1.2;
    if (weaponKey === 'magenta_degale') return 1.5;
    if (weaponKey === 'magenta_p90') return 1.8;
    if (weaponKey === 'granillia_lightning_spear') return 0.9;
    if (weaponKey === 'excalibur') return 2;
    if (weaponKey === 'golden_fleece') return 0.5;
    if (weaponKey === 'void_piercer') return 0.8;
    if (weaponKey === 'aegis_shield_weapon') return 8;
    return 0.5;
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
    }
  }

  function tryWeaponAttack() {
    const weaponKey = getEquippedWeapon();
    if (!weaponKey) return false;
    if (player.weaponCooldown > 0) return false;
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    if (weaponKey === 'extending_staff') {
      fireWeaponSweep(38, 130, 1.45, 500, '#eaf4ff');
      player.weaponCooldown = 0.5;
      return true;
    }
    if (weaponKey === 'hunters_bow') {
      spawnWeaponProjectile({ angle, speed: 820, damage: 28, knockback: 180, r: 4, life: 0.9, kind: 'hunters_bow', color: '#f0fbff', pierceCount: 1, hitOptions: { critBonus: 0.1 } });
      player.weaponCooldown = 0.4;
      return true;
    }
    if (weaponKey === 'thorns_bleed_blade') {
      fireWeaponSweep(26, 76, 1.12, 240, '#ff6e8b', { bleedChance: 0.3, bleedStacks: 2, bleedDuration: 5 });
      player.weaponCooldown = 0.35;
      return true;
    }
    if (weaponKey === 'lazer_glasses') {
      player.weaponBeamTime = 0.65;
      player.weaponBeamTick = 0;
      player.weaponCooldown = 3.6;
      return true;
    }
    if (weaponKey === 'metao_fire_staff') {
      for (let index = -2; index <= 2; index += 1) {
        spawnWeaponProjectile({
          angle: angle + index * 0.12,
          speed: 440,
          damage: 18,
          knockback: 150,
          r: 6,
          life: 1.25,
          kind: 'metao_fire_staff',
          color: '#ff9f4a',
          hitOptions: { fireChance: 1, fireStacks: 1, fireDuration: 3 },
        });
      }
      player.weaponCooldown = 1.2;
      return true;
    }
    if (weaponKey === 'magenta_degale') {
      spawnWeaponProjectile({ angle, speed: 920, damage: 80, knockback: 480, r: 7, life: 0.9, kind: 'magenta_degale', color: '#ff8bd2' });
      player.vx -= Math.cos(angle) * 280;
      player.vy -= Math.sin(angle) * 280;
      player.weaponCooldown = 1.5;
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
      player.weaponCooldown = 1.8;
      return true;
    }
    if (weaponKey === 'granillia_lightning_spear') {
      spawnWeaponProjectile({ angle, speed: 720, damage: 55, knockback: 300, r: 7, life: 1.1, kind: 'lightning_spear', color: '#9bd9ff', pierceCount: 2, hitOptions: { chainLightningRadius: 140, chainMultiplier: 0.65 } });
      player.weaponCooldown = 0.9;
      return true;
    }
    if (weaponKey === 'excalibur') {
      fireWeaponSweep(1000, 100, Math.PI, 800, '#ffe291', { rawDamage: true });
      particles.push({ x: player.x, y: player.y, life: 0.6, ring: 56, c: '#ffd26a' });
      player.weaponCooldown = 2;
      return true;
    }
    if (weaponKey === 'golden_fleece') {
      fireWeaponSweep(22, ATTACKS.melee.range, ATTACKS.melee.arc, ATTACKS.melee.push, '#ffe8a0');
      player.weaponCooldown = 0.5;
      return true;
    }
    if (weaponKey === 'void_piercer') {
      spawnWeaponProjectile({ angle, speed: 760, damage: 65, knockback: 280, r: 6, life: 1.2, kind: 'void_piercer', color: '#ffd2c0', pierceCount: 4, hitOptions: { ignoreBarrier: true, critBonus: 0.2 } });
      player.weaponCooldown = 0.8;
      return true;
    }
    if (weaponKey === 'aegis_shield_weapon') {
      player.blockActive = true;
      player.blockTimer = 2;
      player.weaponCooldown = 8;
      particles.push({ x: player.x, y: player.y, life: 0.5, ring: 26, c: '#9ae9ff' });
      return true;
    }
    return false;
  }

  function tryMelee() {
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
    if (move === 'smite') {
      castSmiteChain();
      return;
    }
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    player.swing = ATTACKS.melee.active;
    player.swingA = angle;

    const damage = godTimer > 0 ? 56 : ATTACKS.melee.damage;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > ATTACKS.melee.range + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > ATTACKS.melee.arc) continue;
      hitEnemy(enemy, damage, angle, ATTACKS.melee.push, '#0ff');
      const slashBleedChance = move === 'slash' ? 0.10 : 0;
      if (slashBleedChance > 0 && rng() < slashBleedChance) applyBleed(enemy, 1, 5);
      if (itemStats.bleedChance > 0 && rng() < itemStats.bleedChance) applyBleed(enemy, 1, 5);
    }
    destructibles.forEach(prop => {
      if (!prop.broken && !prop.hidden && dist(player.x, player.y, prop.x, prop.y) <= ATTACKS.melee.range) {
        damageDestructible(prop, 1);
      }
    });
  }

  function fireLazerGlassesTick() {
    const baseAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    [-0.2, 0.2].forEach(offset => {
      const angle = baseAngle + offset;
      const beamEnd = getBeamEnd(player.x, player.y, angle, 430);
      const target = enemies.find(enemy => enemy && beamHitsCircle(player.x, player.y, beamEnd.x, beamEnd.y, enemy.x, enemy.y, enemy.r + 4));
      if (target) {
        hitEnemy(target, 9, angle, 80, '#cda8ff', { fireChance: 0.05, fireStacks: 1, fireDuration: 3 });
      }
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
        spawnWeaponProjectile({ angle: queued.angle, speed: 900, damage: 22, knockback: 200, r: 4, life: 0.8, kind: 'magenta_p90', color: '#ff9dd7' });
        player.vx -= Math.cos(queued.angle) * 55;
        player.vy -= Math.sin(queued.angle) * 55;
      }
      weaponBurstQueue.splice(index, 1);
    }
  }

  function tryLaser() {
    if (laserActive) return;
    const attackSpeed = getAttackSpeedValue();
    const move = getEquippedMove('laser');
    const rechargeTime = getLaserCooldownDuration(move, attackSpeed);
    if (move === 'turtle_wave') {
      if (player.hp <= 2) {
        particles.push({ x: player.x, y: player.y - 20, life: 0.52, text: 'NEED 2 HP', c: '#ff8b98' });
        return;
      }
      if (!spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      player.hp = Math.max(1, player.hp - 2);
      player.roomDamageTaken = (player.roomDamageTaken || 0) + 2;
      spawnDamagePopup(player.x, player.y - 18, 2, { color: '#ff8b98', size: 14 });
      laserActive = true;
      laserMode = 'turtle_wave';
      laserTime = getLaserCastDuration(move, attackSpeed);
      laserTick = 0;
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
    if (move === 'lightning_columns') {
      if (!spendSkillCharge('laser', rechargeTime)) return;
      castLightningColumns();
      return;
    }
    if (move === 'god_sweep') {
      if (!spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      laserActive = true;
      laserMode = 'god_sweep';
      laserTime = getLaserCastDuration(move, attackSpeed);
      laserTick = 0;
      laserAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
      laserSweepSpeed = (nextRandom('encounter') < 0.5 ? -1 : 1) * 4.6;
      return;
    }
    if (!spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
    laserActive = true;
    laserMode = 'beam';
    laserTime = getLaserCastDuration(move, attackSpeed);
    laserTick = 0;
  }

  function updatePlayerLaser(dt) {
    if (!laserActive) return;
    laserTime -= dt;
    laserTick -= dt;
    const move = getEquippedMove('laser');
    const itemStats = getItemStats();
    const angle = laserMode === 'god_sweep'
      ? laserAngle
      : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    if (laserTick <= 0) {
      if (laserMode === 'god_sweep') laserAngle += laserSweepSpeed * 0.05;
      laserTick = laserMode === 'god_sweep' ? 0.05 : laserMode === 'turtle_wave' ? 0.08 : ATTACKS.laser.tick;
      const range = laserMode === 'god_sweep' ? 560 : laserMode === 'turtle_wave' ? 620 : ATTACKS.laser.range;
      const end = getBeamEnd(player.x, player.y, angle, range);
      for (let index = enemies.length - 1; index >= 0; index -= 1) {
        const enemy = enemies[index];
        if (!enemy) continue;
        if (!beamHitsCircle(player.x, player.y, end.x, end.y, enemy.x, enemy.y, enemy.r + (laserMode === 'turtle_wave' ? 14 : 6))) continue;
        const beamDamage = (laserMode === 'god_sweep' ? 24 : laserMode === 'turtle_wave' ? 34 : godTimer > 0 ? 16 : ATTACKS.laser.damage) * (itemStats.beamDamageMultiplier || 1);
        hitEnemy(enemy, beamDamage, angle, laserMode === 'god_sweep' ? 120 : laserMode === 'turtle_wave' ? 155 : 60, '#f0f');
        chainBeamHit(enemy, beamDamage, angle, '#d890ff');
        if (move === 'blood_beam' && rng() < 0.05) applyBleed(enemy, 1, 3.2);
        if (move === 'blood_beam' && rng() < 0.08) applyDarkDrain(enemy, 1, 3.4);
      }
      destructibles.forEach(prop => {
        if (!prop.broken && !prop.hidden && beamHitsCircle(player.x, player.y, end.x, end.y, prop.x, prop.y, prop.r + 4)) {
          damageDestructible(prop, 1);
        }
      });
    }
    if (laserTime <= 0) {
      laserActive = false;
      laserMode = 'beam';
      queueHeldSkillRecharge('laser', getLaserCooldownDuration(getEquippedMove('laser'), getAttackSpeedValue()));
    }
  }

  function trySmash() {
    const itemStats = getItemStats();
    const attackSpeed = getAttackSpeedValue();
    if (!spendSkillCharge('smash', getSmashCooldownDuration(attackSpeed))) return;
    const move = getEquippedMove('smash');
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
    const smashRadius = ATTACKS.smash.radius * (itemStats.aoeRadiusMultiplier || 1);
    shake = 16;
    shakeT = 0.24;
    particles.push({ x: player.x, y: player.y, life: 0.4, ring: smashRadius - 30, c: '#ff00aa' });
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > smashRadius + enemy.r) continue;
      const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      let damage = godTimer > 0 ? 82 : ATTACKS.smash.damage;
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
    if (move === 'warp') {
      if (!spendSkillCharge('dash', rechargeTime)) return;
      castWarp();
      return;
    }
    if (!spendSkillCharge('dash', rechargeTime)) return;
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
      projectiles.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 280, vy: Math.sin(angle) * 280, r: 7, life: 1.2, enemy: false, kind: 'disk', damage: 20 });
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
    for (let index = 0; index < 6; index += 1) {
      const angle = rng() * Math.PI * 2;
      const px = player.x + Math.cos(angle) * rand(160, 40);
      const py = player.y + Math.sin(angle) * rand(160, 40);
      particles.push({ x: px, y: py, life: 0.45, ring: 18 * aoeRadiusMultiplier, c: '#c971ff' });
      blastRadius(px, py, 52 * aoeRadiusMultiplier, 24, '#c971ff');
      applyStatusInRadius(px, py, 52 * aoeRadiusMultiplier, 'poison', 1, 4.8);
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
    if (!isBlocked(tx, ty, player.r)) {
      particles.push({ x: player.x, y: player.y, life: 0.35, ring: 18, c: '#b99cff' });
      player.x = tx;
      player.y = ty;
      player.vx = 0;
      player.vy = 0;
      player.inv = Math.max(player.inv, 0.2);
      particles.push({ x: player.x, y: player.y, life: 0.35, ring: 18, c: '#b99cff' });
      return;
    }
    for (let tries = 0; tries < 18; tries += 1) {
      const angle = rng() * Math.PI * 2;
      const radius = rand(170, 24);
      const px = clamp(player.x + Math.cos(angle) * radius, WALL + player.r + 2, ROOM_W - WALL - player.r - 2);
      const py = clamp(player.y + Math.sin(angle) * radius, WALL + player.r + 2, ROOM_H - WALL - player.r - 2);
      if (isBlocked(px, py, player.r)) continue;
      particles.push({ x: player.x, y: player.y, life: 0.35, ring: 18, c: '#b99cff' });
      player.x = px;
      player.y = py;
      player.vx = 0;
      player.vy = 0;
      player.inv = Math.max(player.inv, 0.2);
      particles.push({ x: player.x, y: player.y, life: 0.35, ring: 18, c: '#b99cff' });
      break;
    }
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
    applyStatus(enemy, 'bleed', stacks, duration);
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
      damage: stacks => scaleDamageAgainstEnemy(enemy, 1 + stacks * 2),
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
      const beamEnd = getBeamEnd(enemy.x, enemy.y, enemy.beamAngle, range);
      if (beamHitsCircle(enemy.x, enemy.y, beamEnd.x, beamEnd.y, player.x, player.y, player.r + 5)) {
        damagePlayer(damage, enemy.beamAngle, knockback, enemy.type === 'god' ? 'god_beam' : enemy.type === 'mirror_knight' ? 'mirror_beam' : 'enemy_beam');
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
    if (player) player.kills = Math.max(0, Number(player.kills || 0)) + 1;

    for (let burst = 0; burst < 12; burst += 1) {
      particles.push({
        x: enemy.x,
        y: enemy.y,
        life: 0.45 + nextRandom('fx') * 0.3,
        vx: rand(-130, 130, 'fx'),
        vy: rand(-130, 130, 'fx'),
        c: enemy.elite ? '#ffaa00' : enemy.type === 'god' ? '#fff' : '#0ff',
      });
    }

    dropCoins(enemy.x, enemy.y, isBossType(enemy.type) ? 40 : enemy.elite ? 10 : 5);
    grantXp(isBossType(enemy.type) ? 40 : enemy.elite ? 12 : 6);
    incrementChargeProgress('insurance', 9);
    incrementChargeProgress('escape', 10);

    if (enemy.elite && nextRandom('loot') < 0.18) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ elite: true, stream: 'loot' }) });
    } else if (nextRandom('loot') < 0.1) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'potion' });
    }

    if (enemy.type === 'god') {
      metaProgress.godsKilled = Number(metaProgress.godsKilled || 0) + 1;
      if (!metaProgress.unlockedCharacters.includes('granialla')) metaProgress.unlockedCharacters.push('granialla');
      currentRoom.cleared = true;
      pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'crown' });
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

    if (enemies.length === 0 && !currentRoom.cleared) {
      if (currentRoom.type === 'challenge') {
        updateObjective();
        return;
      }
      currentRoom.cleared = true;
      if (currentRoom.type === 'ladder' || currentRoom.type === 'boss') {
        pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'ladder' });
      }
      updateObjective();
      scheduleRunSave();
    }
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

    if (itemKey === 'wizards_paw') {
      openWizardPawSelection();
    }

    if (itemKey === 'titan_heart') {
      player.maxHp = Math.max(120, Math.round(player.maxHp * 1.08));
      player.hp = Math.min(player.maxHp, Math.round(player.hp * 1.08));
    }

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
    const dt = Math.min(0.033, (timestamp - lastTime) / 1000 || 0.016);
    lastTime = timestamp;
    if (gameState === 'play' && !isWizardPawOpen()) update(dt);
    uiController.tick(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
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
    const overlayOpen = isOverlayBlockingInput();
    if (overlayOpen) {
      moveX = 0;
      moveY = 0;
      mouse.down = false;
      mouse.right = false;
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
      const targetSpeed = 228 * (godTimer > 0 ? 1.25 : 1) * itemStats.moveSpeedMultiplier;
      player.vx = applyResponsiveVelocity(player.vx, moveX * targetSpeed, dt);
      player.vy = applyResponsiveVelocity(player.vy, moveY * targetSpeed, dt);
    }

    moveCircle(player, dt);

    player.inv = Math.max(0, player.inv - dt);
    if (player.swing > 0) player.swing = Math.max(0, player.swing - dt);

    mouse.worldX = mouse.x + camera.x;
    mouse.worldY = mouse.y + camera.y;
    updateWeaponSystems(dt);

    if (!overlayOpen && mouse.down) tryMelee();
    if (!overlayOpen && mouse.right) tryLaser();
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

    let totalBleed = 0;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      enemy.attackCd = Math.max(0, enemy.attackCd - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.inv = Math.max(0, enemy.inv - dt);

      if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type !== 'god') {
        applyBleed(enemy, Math.max(0, itemStats.passiveBleedStacks - getStatusStacks(enemy, 'bleed')), 0.25);
      } else if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type === 'god') {
        applyBleed(enemy, Math.max(0, Math.max(1, itemStats.passiveBleedStacks - 1) - getStatusStacks(enemy, 'bleed')), 0.25);
      }

      totalBleed += updateEnemyStatuses(enemy, dt);
      if (!enemies.includes(enemy)) continue;

      if (enemy.type === 'god') updateGod(enemy, dt);
      else if (enemy.type === 'queen_cult') updateCultQueenBoss(enemy, dt);
      else if (enemy.type === 'bulk_golem') updateBulkGolemBoss(enemy, dt);
      else if (enemy.type === 'artificer_knave') updateArtificerBoss(enemy, dt);
      else if (enemy.type === 'mirror_knight') updateMirrorChampion(enemy, dt);
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

    updateProjectiles(dt);
    updateWorldProps(dt);
    updatePlayerStatuses(dt);
    updateChests();
    updatePickups();
    updateParticles(dt);
    updateTransitions(dt);

    if (godTimer > 0 && Math.random() < 0.4) {
      particles.push({ x: player.x + rand(-6, 6), y: player.y + rand(-6, 6), life: 0.32, c: `hsl(${(Date.now() / 8) % 360},100%,65%)` });
    }

    if (isPanelOpen(ui.shopPanel) && shopPanelDirty) renderShopPanel();
    if (isPanelOpen(ui.invPanel) && inventoryPanelDirty) renderInventoryPanel();
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
        if (other === enemy) return;
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
        if (other === enemy) return;
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
      enemies.splice(enemies.indexOf(enemy), 1);
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
    updateGolemEnemy(enemy, dt);
    enemy.speed = 78;
    if (enemy.attackCd < 1.4) enemy.attackCd = 1.4;
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
    if (!ignoreInv && player.inv > 0) return;
    if (player.blockActive && amount > 0 && !options.ignoreBlock) {
      particles.push({ x: player.x, y: player.y - 20, life: 0.3, text: 'BLOCK', c: '#9cefff' });
      return;
    }
    if (isChallengeActive('no_hit') && amount > 0) {
      lastDamageSource = getDamageSourceLabel(source || 'no_hit');
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
    let finalAmount = amount * (1 - (itemStats.damageReduction || 0));
    if (itemStats.hasIronLung) {
      const roomCap = player.maxHp * 0.2;
      const remaining = roomCap - (player.roomDamageTaken || 0);
      if (remaining <= 0) return;
      finalAmount = Math.min(finalAmount, remaining);
    }
    finalAmount = Math.max(0, finalAmount);
    if (finalAmount <= 0) return;
    lastDamageSource = getDamageSourceLabel(source);

    player.hp -= finalAmount;

    if (getItemCount('insurance') > 0 && player.insuranceReady && hpBeforeHit > halfHpThreshold && player.hp <= halfHpThreshold) {
      player.hp = Math.max(player.hp, halfHpThreshold);
      consumeCharge('insurance');
      particles.push({ x: player.x, y: player.y - 30, life: 0.8, text: 'INSURANCE USED', c: '#e6eeff' });
    }

    finalAmount = Math.max(0, hpBeforeHit - player.hp);
    player.roomDamageTaken = (player.roomDamageTaken || 0) + finalAmount;

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
    if (player.hp <= 0) die();
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
      damage: stacks => 1 + stacks * 1.7,
      color: STATUS_STYLES.dark_drain.color,
    });
  }

  function blastRadius(x, y, radius, damage, color, sourceEnemy = null) {
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
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      const hitProp = destructibles.find(prop => !prop.broken && !prop.hidden && dist(projectile.x, projectile.y, prop.x, prop.y) <= projectile.r + prop.r);
      if (!projectile.enemy && hitProp) {
        damageDestructible(hitProp, projectile.damage || 1);
        if (projectile.kind === 'fireball') blastRadius(projectile.x, projectile.y, projectile.splash || 44, 16, '#ff8844');
        projectiles.splice(index, 1);
        continue;
      }
      if (projectile.life <= 0 || isBlocked(projectile.x, projectile.y, projectile.r)) {
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
        enemies.forEach(enemy => {
          if (dist(enemy.x, enemy.y, hazard.x, hazard.y) < hazard.r + enemy.r) {
            enemy.hp -= 10 * dt;
            if (enemy.hp <= 0) onEnemyDie(enemy);
          }
        });
      } else if (hazard.kind === 'fire_circle') {
        enemies.forEach(enemy => {
          if (dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) return;
          enemy.hp -= (hazard.dps || 16) * dt;
          if (hazard.statusTick <= 0) applyFire(enemy, 1, 2.8);
          enemy.stun = Math.max(enemy.stun, 0.05);
          if (Math.random() < 0.06) particles.push({ x: enemy.x + rand(-6, 6), y: enemy.y + rand(-6, 6), life: 0.3, c: '#ff8c3b' });
          if (enemy.hp <= 0) onEnemyDie(enemy);
        });
        if (hazard.statusTick <= 0) hazard.statusTick = 0.45;
      } else if (hazard.kind === 'lightning_column') {
        hazard.tick -= dt;
        if (hazard.tick <= 0) {
          hazard.tick = hazard.interval || 0.45;
          enemies.forEach(enemy => {
            if (dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) return;
            const angle = Math.atan2(enemy.y - hazard.y, enemy.x - hazard.x);
            hitEnemy(enemy, hazard.damage || 16, angle, 90, '#8dd4ff');
          });
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

  function updatePickups() {
    for (let index = pickups.length - 1; index >= 0; index -= 1) {
      const pickup = pickups[index];
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
      } else if (pickup.type === 'item') {
        const magnetRadius = 145;
        const d = dist(pickup.x, pickup.y, player.x, player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 150 + (1 - d / magnetRadius) * 220;
          pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
        }
      } else if (pickup.type === 'challengeRune') {
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
        const crystals = Number(metaProgress.loopCrystals || 0);
        if (pickup.bought) {
          pickups.splice(index, 1);
          continue;
        }
        if (crystals < cost) {
          const now = Date.now();
          if (!pickup.lastDeniedAt || now - pickup.lastDeniedAt > 450) {
            particles.push({ x: pickup.x, y: pickup.y - 20, life: 0.85, text: `${cost} LC`, c: '#ffb1b1' });
            pickup.lastDeniedAt = now;
          }
          continue;
        }
        metaProgress.loopCrystals = crystals - cost;
        pickup.bought = true;
        if (pickup.offerKind === 'relic') {
          collectItem(rollItemDrop({ elite: true, stream: 'loot' }));
        } else if (pickup.offerKind === 'vitality') {
          player.maxHp += 20;
          player.hp = Math.min(player.maxHp, player.hp + 60);
          particles.push({ x: player.x, y: player.y - 20, life: 0.7, text: '+VIT', c: '#8dffbd' });
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
        currentRoom.challengeData.runesLeft = Math.max(0, Number(currentRoom.challengeData?.runesLeft || 1) - 1);
        particles.push({ x: pickup.x, y: pickup.y - 18, life: 0.55, text: 'RUNE', c: '#8dd4ff' });
        if (currentRoom.challengeData.runesLeft <= 0) {
          completeChallengeTrial('RUNES CLAIMED');
        }
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

  function updateParticles(dt) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= dt;
      if (particle.vx) particle.x += particle.vx * dt;
      if (particle.vy) particle.y += particle.vy * dt;
      if (particle.ring) particle.ring += 200 * dt;
      if (particle.life <= 0) particles.splice(index, 1);
    }
  }

  function updateTransitions(dt) {
    const canLeaveFight = enemies.length > 0
      && currentRoom
      && currentRoom.type !== 'boss'
      && currentRoom.type !== 'god'
      && currentRoom.type !== 'ladder'
      && !CHALLENGE_ROOM_TYPES.has(currentRoom.type);
    const roomLocked = !!currentRoom
      && !currentRoom.cleared
      && (currentRoom.type === 'boss' || currentRoom.type === 'god' || currentRoom.type === 'ladder' || CHALLENGE_ROOM_TYPES.has(currentRoom.type));
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
    metaProgress.loopCrystals = Number(metaProgress.loopCrystals || 0) + 1;
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

  function updateObjective() {
    if (!currentRoom) return;
    let objective = 'Find the ladder.';
    if (floor < MAX_FLOOR) {
      if (currentRoom.type === 'shop') {
        uiController.setObjective('Shop or move on.');
        return;
      }
      if (currentRoom.type === 'challenge') {
        const type = currentRoom.challengeType || 'mirror';
        if (currentRoom.challengeFailed) {
          uiController.setObjective('Trial failed. Move on.');
        } else if (currentRoom.cleared) {
          uiController.setObjective('Trial cleared. Claim the reward or move on.');
        } else if (!currentRoom.challengeStarted) {
          if (type === 'mirror') uiController.setObjective('Touch the sword to face your mirror.');
          else if (type === 'stillness') uiController.setObjective('Begin the stillness trial.');
          else if (type === 'bomb') uiController.setObjective('Begin the bomb trial.');
          else if (type === 'survival') uiController.setObjective('Begin the survival trial.');
          else if (type === 'runes') uiController.setObjective('Begin the rune hunt.');
          else if (type === 'storm') uiController.setObjective('Begin the storm trial.');
        } else {
          if (type === 'mirror') uiController.setObjective('Defeat your mirror champion.');
          else if (type === 'stillness') uiController.setObjective(`Hold still for ${Math.ceil(currentRoom.challengeTimer || 0)}s.`);
          else if (type === 'bomb') uiController.setObjective('Find the one bomb you can safely disarm.');
          else if (type === 'survival') uiController.setObjective(`Survive for ${Math.ceil(currentRoom.challengeTimer || 0)}s.`);
          else if (type === 'runes') uiController.setObjective(`Collect the remaining runes: ${Math.max(0, Number(currentRoom.challengeData?.runesLeft || 0))}.`);
          else if (type === 'storm') uiController.setObjective(`Live through the storm for ${Math.ceil(currentRoom.challengeTimer || 0)}s.`);
        }
        return;
      }
      if (currentRoom.type === 'boss' && !currentRoom.cleared) {
        uiController.setObjective('Defeat the floor boss.');
        return;
      }
      objective = currentRoom.type === 'ladder' && !currentRoom.cleared ? 'Clear the ladder room.' : 'Find the ladder.';
      uiController.setObjective(objective);
      return;
    }
    if (currentRoom.type !== 'god') {
      uiController.setObjective('Reach GOD.');
      return;
    }
    if (currentRoom.cleared) {
      uiController.setObjective('Take the crown.');
      return;
    }
    if (currentRoom.bossStarted) {
      uiController.setObjective('Survive GOD.');
      return;
    }
    uiController.setObjective('Fight GOD or loop with your gear.');
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
      laserSkill.max = getLaserCastDuration(laserMoveKey, attackSpeed);
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
        dash: { current: dashSkill.current, max: dashSkill.max, active: player.dashTime > 0, charges: dashSkill.charges, maxCharges: dashSkill.maxCharges },
      },
    });
    ui.skillNames.dash.textContent = dashMove?.name || character.skills.dash;
    ui.skillNames.melee.textContent = weaponDef?.name || meleeMove?.name || character.skills.melee;
    ui.skillNames.laser.textContent = laserMove?.name || character.skills.laser;
    ui.skillNames.smash.textContent = smashMove?.name || character.skills.smash;
    
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
    const entry = finalizeRun('dead', { killedBy: lastDamageSource });
    setGameState('dead');
    uiController.setDeadInfo(`Floor ${entry.floor} | Killed by ${entry.killedBy} | ${entry.coins} run coins | ${entry.totalItemStacks} item stacks`);
    clearRunSave();
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
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const _shakeOn = window.NeoSettings?.getAccess()?.screenShake !== false;
    const offsetX = _shakeOn ? (Math.random() - 0.5) * shake * 2 : 0;
    const offsetY = _shakeOn ? (Math.random() - 0.5) * shake * 2 : 0;
    ctx.translate(-camera.x + offsetX, -camera.y + offsetY);

    drawFloor();
    drawRoomDecor();
    drawWorldProps();
    drawChests();
    drawPickups();
    drawProjectiles();
    drawEnemyTelegraphs();
    drawEnemies();
    drawPlayer();
    drawPlayerLaser();
    drawParticles();
    drawShopPrompt();

    ctx.restore();
    drawMinimap();

    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (godTimer > 0) drawGodModeBar();
    drawBossHealthBars();
    drawFloorTransition();
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

  function drawFloor() {
    ctx.fillStyle = '#030610';
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    ctx.strokeStyle = 'rgba(0,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= ROOM_W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ROOM_H);
      ctx.stroke();
    }
    for (let y = 0; y <= ROOM_H; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ROOM_W, y);
      ctx.stroke();
    }

    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = enemies.length > 0 ? '#ff66aa' : '#00ffff';
    ctx.lineWidth = WALL;
    ctx.strokeRect(WALL / 2, WALL / 2, ROOM_W - WALL, ROOM_H - WALL);
    ctx.shadowBlur = 0;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    if (hasRoomExit(currentRoom, 'n')) ctx.fillRect((ROOM_W - DOOR) / 2, 0, DOOR, WALL + 2);
    if (hasRoomExit(currentRoom, 's')) ctx.fillRect((ROOM_W - DOOR) / 2, ROOM_H - WALL - 2, DOOR, WALL + 2);
    if (hasRoomExit(currentRoom, 'w')) ctx.fillRect(0, (ROOM_H - DOOR) / 2, WALL + 2, DOOR);
    if (hasRoomExit(currentRoom, 'e')) ctx.fillRect(ROOM_W - WALL - 2, (ROOM_H - DOOR) / 2, WALL + 2, DOOR);
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = enemies.length > 0 ? 'rgba(255,102,170,0.4)' : 'rgba(0,255,255,0.4)';
    ctx.lineWidth = 3;
    ctx.shadowColor = enemies.length > 0 ? '#ff66aa' : '#0ff';
    ctx.shadowBlur = 10;
    [
      ['n', (ROOM_W - DOOR) / 2, 0, DOOR, 0],
      ['s', (ROOM_W - DOOR) / 2, ROOM_H, DOOR, 0],
      ['w', 0, (ROOM_H - DOOR) / 2, 0, DOOR],
      ['e', ROOM_W, (ROOM_H - DOOR) / 2, 0, DOOR],
    ].forEach(([dir, x, y, width, height]) => {
      if (!hasRoomExit(currentRoom, dir)) return;
      ctx.beginPath();
      if (width) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + width, y);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
      }
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }

  function drawChests() {
    chests.forEach(chest => {
      ctx.save();
      ctx.translate(chest.x, chest.y);
      ctx.fillStyle = chest.open ? '#445' : '#ffaa00';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = chest.open ? 0 : 12;
      ctx.fillRect(-18, -12, 36, 24);
      ctx.fillStyle = '#000';
      ctx.fillRect(-6, -4, 12, 6);
      ctx.restore();
    });
  }

  function drawRoomDecor() {
    decorations.forEach(decor => {
      ctx.save();
      ctx.translate(decor.x, decor.y);
      if (decor.kind === 'rubble') {
        ctx.fillStyle = 'rgba(90,120,136,0.32)';
        ctx.beginPath();
        ctx.arc(0, 0, decor.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (decor.kind === 'banner') {
        ctx.fillStyle = 'rgba(255,210,90,0.22)';
        ctx.fillRect(-10, -22, 20, 44);
      } else if (decor.kind === 'crack') {
        ctx.strokeStyle = 'rgba(120,180,200,0.22)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-decor.r, -6);
        ctx.lineTo(-8, 0);
        ctx.lineTo(0, -8);
        ctx.lineTo(10, 4);
        ctx.lineTo(decor.r, -2);
        ctx.stroke();
      } else if (decor.kind === 'brazier') {
        ctx.fillStyle = 'rgba(255,120,60,0.7)';
        ctx.shadowColor = '#ff7b39';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(0, 0, decor.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    structures.forEach(structure => {
      ctx.save();
      ctx.translate(structure.x, structure.y);
      if (structure.kind === 'pillar') {
        ctx.fillStyle = '#193849';
        ctx.strokeStyle = '#5ad8ff';
        ctx.lineWidth = 2;
        ctx.fillRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
        ctx.strokeRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
      } else {
        ctx.fillStyle = '#102f3e';
        ctx.strokeStyle = 'rgba(88,217,255,0.7)';
        ctx.lineWidth = 2;
        ctx.fillRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
        ctx.strokeRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
      }
      ctx.restore();
    });
  }

  function drawWorldProps() {
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
      }
      ctx.restore();
    });

    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      ctx.save();
      ctx.translate(prop.x, prop.y);
      if (prop.kind === 'pot') {
        ctx.fillStyle = '#b77d4a';
        ctx.fillRect(-10, -12, 20, 24);
      } else if (prop.kind === 'barrel') {
        ctx.fillStyle = '#8c5324';
        ctx.fillRect(-12, -14, 24, 28);
        ctx.strokeStyle = '#ff5a3d';
        ctx.strokeRect(-12, -14, 24, 28);
      } else if (prop.kind === 'wall') {
        ctx.fillStyle = '#113648';
        ctx.fillRect(-24, -24, 48, 48);
        ctx.strokeStyle = '#58d9ff';
        ctx.strokeRect(-24, -24, 48, 48);
      } else if (prop.kind === 'secret_wall') {
        ctx.fillStyle = '#113648';
        ctx.fillRect(-24, -24, 48, 48);
        ctx.strokeStyle = '#4f7f92';
        ctx.strokeRect(-24, -24, 48, 48);
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = '#0a1f28';
        ctx.beginPath();
        ctx.moveTo(-14, -8);
        ctx.lineTo(12, -4);
        ctx.lineTo(6, 10);
        ctx.stroke();
        ctx.globalAlpha = 1;
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
      ctx.fillStyle = blockedByChallenge
        ? '#ff8b98'
        : offer.type === 'item' ? '#a857ff' : offer.type === 'potion' ? '#35ff6f' : '#8fd2ff';
      ctx.beginPath();
      ctx.arc(0, -6, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = blockedByChallenge || !canAfford ? '#ffccd2' : '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(offer.cost), 0, 18);
      ctx.restore();
    });
  }

  function drawPickups() {
    pickups.forEach(pickup => {
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      const t = Date.now() / 260;
      ctx.globalAlpha = 0.88 + Math.sin(t) * 0.12;
      if (pickup.type === 'coin') {
        ctx.fillStyle = '#ffd966';
        ctx.shadowColor = '#ffd966';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
      } else if (pickup.type === 'potion') {
        ctx.fillStyle = '#0f8';
        ctx.shadowColor = '#0f8';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#002';
        ctx.font = 'bold 12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('+', 0, 4);
      } else if (pickup.type === 'item') {
        const item = itemRegistry.get(pickup.key);
        const color = item?.color || '#fff';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = item?.rarity === 'god' ? 18 : 14;
        if (item?.rarity === 'god' && item?.accent) {
          ctx.strokeStyle = item.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
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
        const canAfford = Number(metaProgress.loopCrystals || 0) >= Number(pickup.cost || 0);
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
        ctx.fillText(`${pickup.cost} LC`, 0, 12);
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

  function drawProjectiles() {
    projectiles.forEach(projectile => {
      const color = projectile.color || '#ff66aa';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
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
        const end = getBeamEnd(enemy.x, enemy.y, enemy.beamAngle, enemy.type === 'god' ? (enemy.beamRange || 620) : 430);
        ctx.strokeStyle = enemy.type === 'god' ? '#ffffff' : '#aa66ff';
        ctx.lineWidth = enemy.type === 'god' && enemy.state === 'godSweep' ? 18 : enemy.type === 'god' ? 10 : 7;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = enemy.type === 'god' && enemy.state === 'godSweep' ? 24 : 14;
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });
  }

  function drawEnemies() {
    enemies.forEach(enemy => {
      const activeStatuses = STATUS_KEYS.filter(key => getStatusStacks(enemy, key) > 0);
      activeStatuses.forEach((key, index) => {
        const style = STATUS_STYLES[key];
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
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
      drawSpriteFrame(spriteKey, enemy.x, enemy.y, drawSize, {
        alpha: enemy.stun > 0 ? 0.68 : 1,
        flipX: facing < 0,
        shadowColor: enemy.elite || enemy.type === 'god' ? 'rgba(255,244,180,0.45)' : 'rgba(0,0,0,0.18)',
        shadowBlur: enemy.type === 'god' ? 14 : enemy.elite ? 10 : 4,
        tint: enemy.elite ? 'rgba(255,210,96,0.7)' : null,
      });
      if (enemy.elite) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y - enemy.r - 10);
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
      ctx.translate(enemy.x, enemy.y);
      const hpPct = clamp(enemy.hp / enemy.max, 0, 1);
      ctx.fillStyle = '#000a';
      ctx.fillRect(-18, -enemy.r - 14, 36, 5);
      ctx.fillStyle = isBossType(enemy.type) ? '#f2e8d7' : '#b24f68';
      ctx.fillRect(-18, -enemy.r - 14, 36 * hpPct, 5);
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
        ctx.fillText(`${Math.max(0, Math.ceil(enemy.bossSpawnTimer))}`, 0, -enemy.r - 26);
      }
      ctx.restore();
    });
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
    if (player.swing > 0) {
      ctx.strokeStyle = godTimer > 0 ? '#f6e8c8' : '#d86d87';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, 55, player.swingA - ATTACKS.melee.arc, player.swingA + ATTACKS.melee.arc);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerLaser() {
    if (!laserActive || !player) return;
    const angle = laserMode === 'god_sweep'
      ? laserAngle
      : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const turtleWaveActive = laserMode === 'turtle_wave';
    const end = getBeamEnd(player.x, player.y, angle, laserMode === 'god_sweep' ? 560 : turtleWaveActive ? 620 : ATTACKS.laser.range);
    ctx.strokeStyle = turtleWaveActive ? '#74f5ff' : '#ff00aa';
    ctx.lineWidth = laserMode === 'god_sweep' ? 16 : turtleWaveActive ? 18 : 8;
    ctx.shadowColor = turtleWaveActive ? '#9bf7ff' : '#f0f';
    ctx.shadowBlur = laserMode === 'god_sweep' ? 26 : turtleWaveActive ? 30 : 18;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
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
      } else if (particle.ring) {
        ctx.strokeStyle = particle.c;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, particle.ring, 0, Math.PI * 2);
        ctx.stroke();
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
    const originX = canvas.width - mapWidth - 2;
    const originY = 2;
    ctx.save();
    rooms.forEach(room => {
      if (room.secret && !room.explored && room !== currentRoom) return;
      const x = originX + room.gx * (size + gap);
      const y = originY + room.gy * (size + gap);
      if (room.type === 'ladder' && !room.explored) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#fff04a';
      } else if (room.secret && room.explored) {
        ctx.globalAlpha = room === currentRoom ? 1 : 0.95;
        ctx.fillStyle = room === currentRoom ? '#8dd4ff' : '#3f6b7a';
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
    drawPixelIcon(ui.icons.dash, '#fff06a', [
      [1, 5], [2, 4], [3, 3], [4, 2], [5, 1], [5, 2], [6, 2], [7, 2],
      [4, 4], [5, 4], [6, 4], [7, 4], [4, 6], [5, 6], [6, 6], [7, 6],
    ]);
    drawPixelIcon(ui.icons.melee, '#00ffff', [
      [2, 6], [3, 5], [4, 4], [5, 3], [6, 2], [5, 4], [6, 3], [7, 2], [6, 5], [7, 4],
    ]);
    drawPixelIcon(ui.icons.laser, '#ff00aa', [
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
      const inPlay = show === 'play' || show === 'pause' || show === 'dialogue';
      setVisible(view.hud, false, 'none');
      setVisible(view.actionBar, show === 'play' || show === 'pause', '');
      setVisible(view.playerStats, inPlay, '');
      setVisible(view.coinDisplay, inPlay, 'flex');
      setVisible(view.centerDisplay, inPlay, '');
      setVisible(view.dialogueOverlay, show === 'dialogue', 'flex');
      setVisible(view.entityDialogueLayer, inPlay, 'block');
      if (!inPlay && view.challengeStatus) {
        view.challengeStatus.classList.add('hidden');
        view.challengeStatus.setAttribute('aria-hidden', 'true');
      }
      if (show !== 'charselect') setChallengePanelOpen(false);
      if (show !== 'menu') setRunHistoryOpen(false);
    }

    function setChallengePanelOpen(open) {
      challengePanelOpen = !!open;
      view.challengePanel?.classList.toggle('hidden', !challengePanelOpen);
      if (view.challengeToggle) {
        view.challengeToggle.textContent = challengePanelOpen ? 'HIDE CHALLENGE SHOP' : 'OPEN CHALLENGE SHOP';
        view.challengeToggle.setAttribute('aria-expanded', challengePanelOpen ? 'true' : 'false');
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
        const charOrder = ['thorn_knight', 'metao', 'granialla'];
        function carouselStep(delta) {
          const currentIndex = charOrder.indexOf(handlers._getChosenCharacter ? handlers._getChosenCharacter() : 'thorn_knight');
          const nextIndex = Math.max(0, Math.min(charOrder.length - 1, currentIndex + delta));
          const nextKey = charOrder[nextIndex];
          const btn = view.charButtons.find(b => b.dataset.char === nextKey);
          if (btn && !btn.classList.contains('locked')) {
            handlers.onCharacterSelect(nextKey, btn);
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
        view.challengeButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onChallengeSelect(button.dataset.challenge || '', button);
          });
        });
        view.challengeToggle?.addEventListener('click', handlers.onToggleChallenges);
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
        const CHAR_ORDER = ['thorn_knight', 'metao', 'granialla'];
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
          const skillsHtml = disp.skills.map(s =>
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
          const key = normalizeDifficulty(button.dataset.difficulty || '');
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
              : `${def.description} Cost: ${def.cost} bank coins`;
          button.textContent = !isUnlocked
            ? `${def.name} Locked`
            : isOwned
              ? `${def.name}${isSelected ? ' On' : ' Off'}`
              : `${def.name} Buy ${def.cost}`;
        });
        if (view.challengeHint) {
          const hasChallenges = loopCrystals >= 5;
          const activeCount = selected.length;
          view.challengeHint.textContent = !hasChallenges
            ? `Unlocks at 5 loop crystals. Current crystals: ${loopCrystals}.`
            : `Bank: ${bankCoins} coins. Buy once, then toggle per run. Active challenges: ${activeCount}.`;
        }
        if (!unlocked.size) setChallengePanelOpen(false);
      },
      setItemStatus(items) {
        ITEM_KEYS.forEach(key => {
          const count = Number(items[key] || 0);
          view.itemSlots[key]?.classList.toggle('on', count > 0);
          if (view.itemCounts[key]) view.itemCounts[key].textContent = String(count);
        });
      },
      setObjective(text) { view.objective.textContent = text; },
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
      setDeadInfo(text) { view.deadInfo.textContent = text; },
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

  function getBeamEnd(x, y, angle, range) {
    return {
      x: x + Math.cos(angle) * range,
      y: y + Math.sin(angle) * range,
    };
  }
})();
