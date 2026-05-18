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
    warp: { key: 'warp', slot: 'dash', name: 'Warp', desc: 'Phase out and reappear where the mouse is .' },
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
    princess_wand: {
      key: 'princess_wand',
      name: "Princess's Wand",
      rarity: 'princess',
      description: 'Fires a pink magic bolt that pierces once. Exclusive to Princess.',
      color: '#ff9de8',
      exclusiveCharacter: 'princess',
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
    weapon_fatigue: {
      key: 'weapon_fatigue',
      name: 'Weapon Fatigue',
      shortName: 'Slow',
      description: 'Melee hits have a 5% chance to apply a slow stack.',
      rarity: 'knight',
      color: '#e7fbff',
      category: 'knight',
      tags: ['slow', 'melee'],
    },
    generic_health_item: {
      key: 'generic_health_item',
      name: 'Generic Health',
      shortName: 'Heal 5%',
      description: 'On kill, restore 5% of your current HP, capped by max HP.',
      rarity: 'knight',
      color: '#d9ffe5',
      category: 'knight',
      tags: ['heal', 'charge'],
    },
    snake_knife: {
      key: 'snake_knife',
      name: 'Snake Knife',
      shortName: 'Poison +2%',
      description: 'Melee hits have a 2% chance to poison enemies.',
      rarity: 'knight',
      color: '#d7ffbf',
      category: 'knight',
      tags: ['poison', 'melee'],
    },
    confuse_ray: {
      key: 'confuse_ray',
      name: 'Confuse Ray',
      shortName: 'Stun 1%',
      description: 'Hits have a 1% chance to stun enemies no matter what.',
      rarity: 'knight',
      color: '#d8f0ff',
      category: 'knight',
      tags: ['stun', 'hit'],
    },
    overclocked_watch: {
      key: 'overclocked_watch',
      name: 'Overclocked Watch',
      shortName: 'Charge x2',
      description: '2% chance for kill charge progress to count twice instead of once.',
      rarity: 'knight',
      color: '#f0fbff',
      category: 'knight',
      tags: ['charge', 'kill'],
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
    overstimulate: {
      key: 'overstimulate',
      name: 'Overstimulate',
      shortName: 'Status Stun',
      description: 'Hits have a 20% chance to stun enemies with 2 or more statuses.',
      rarity: 'wizard',
      color: '#ffcf80',
      category: 'wizard',
      tags: ['stun', 'status', 'wizard'],
    },
    grave_zone: {
      key: 'grave_zone',
      name: 'Grave Zone',
      shortName: 'Push Zone',
      description: 'On kill, 20% chance to create a 2-second knockback field that scales with move speed.',
      rarity: 'wizard',
      color: '#c9b3ff',
      category: 'wizard',
      tags: ['aoe', 'knockback', 'wizard'],
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
    homing_missile: {
      key: 'homing_missile',
      name: 'Homing Missile',
      shortName: 'Missiles',
      description: '15% chance to launch 2 homing missiles when using R.',
      rarity: 'god',
      color: '#ffe06f',
      category: 'god',
      tags: ['missile', 'god', 'smash'],
    },
    wizards_paw: {
      key: 'wizards_paw',
      name: "Wizard's Paw",
      shortName: 'Paw',
      description: 'Choose 2 stats to increase by 50%.',
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
    princess: '#ff9de8',
  };
  const SHOP_RARITY_PRICE_MULTIPLIERS = {
    knight: 1,
    white: 1,
    wizard: 2.15,
    purple: 2.15,
    god: 4.75,
    red: 4.75,
    princess: 1.5,
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
    pauseInfo: document.getElementById('pauseInfo'),
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
    difficultyHudIcon: document.getElementById('difficultyHudIcon'),
    difficultyLabel: document.getElementById('difficultyLabel'),
    difficultyBtnIcons: [...document.querySelectorAll('.difficulty-btn-icon')],
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
    potionDisplay: document.getElementById('potionDisplay'),
    potionCount: document.getElementById('potionCount'),
    potionCap: document.getElementById('potionCap'),
    timerDisplay: document.getElementById('timerDisplay'),
    floorDisplay: document.getElementById('floorDisplay'),
    difficultyDisplay: document.getElementById('difficultyDisplay'),
    difficultyLabel: document.getElementById('difficultyLabel'),
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
    mainCompetitiveBtn: document.getElementById('mainCompetitiveBtn'),
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
    anvilCoins: document.getElementById('anvilCoins'),
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
    altModeCompetitiveBtn: document.getElementById('altModeCompetitiveBtn'),
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
    damage:    { label: 'Damage',       step: 5,     min: 5,    max: 9999, xpPerStep: 15, goldPerStep: 8,  format: v => Math.round(v) },
    cooldown:  { label: 'Cooldown (s)', step: -0.05, min: 0.05, max: 9999, xpPerStep: 20, goldPerStep: 10, format: v => v.toFixed(2) + 's' },
    range:     { label: 'Range',        step: 10,    min: 10,   max: 9999, xpPerStep: 13, goldPerStep: 6,  format: v => Math.round(v) },
    knockback: { label: 'Knockback',    step: 30,    min: 0,    max: 9999, xpPerStep: 10, goldPerStep: 5,  format: v => Math.round(v) },
  };
  const MOVE_UPGRADEABLE_STATS = {
    damage:    { label: 'Damage',       step: 5,    min: 5,   max: 9999, xpPerStep: 15, goldPerStep: 8,  format: v => Math.round(v) },
    cooldown:  { label: 'Cooldown (s)', step: -0.05,min: 0.05,max: 9999, xpPerStep: 20, goldPerStep: 10, format: v => v.toFixed(2) + 's' },
    duration:  { label: 'Duration (s)', step: 0.1,  min: 0.1, max: 30,   xpPerStep: 13, goldPerStep: 6,  format: v => v.toFixed(1) + 's' },
    range:     { label: 'Range / AOE',  step: 10,   min: 10,  max: 9999, xpPerStep: 13, goldPerStep: 6,  format: v => Math.round(v) },
    critChance:{ label: 'Crit Chance',  step: 0.05, min: 0,   max: 1.0,  xpPerStep: 25, goldPerStep: 15, format: v => Math.round(v * 100) + '%' },
  };

  // Base stat values per weapon (used to compute current upgraded value)
  const WEAPON_BASE_STATS = {
    extending_staff:          { damage: 38,   cooldown: 0.77, range: 130, knockback: 500 },
    hunters_bow:              { damage: 28,   cooldown: 0.40,             knockback: 180 },
    thorns_bleed_blade:       { damage: 32,   cooldown: 0.55, range: 90,  knockback: 120 },
    lazer_glasses:            { damage: 18,   cooldown: 3.60,             knockback: 80  },
    metao_fire_staff:         { damage: 22,   cooldown: 0.75, range: 200, knockback: 100 },
    magenta_degale:           { damage: 80,   cooldown: 1.50,             knockback: 480 },
    magenta_p90:              { damage: 18,   cooldown: 1.80,             knockback: 140 },
    granillia_lightning_spear:{ damage: 45,   cooldown: 2.00,             knockback: 200 },
    excalibur:                { damage: 202,  cooldown: 2.00, range: 120, knockback: 600 },
    golden_fleece:            { damage: 20,   cooldown: 0.50, range: 80,  knockback: 80  },
    void_piercer:             { damage: 55,   cooldown: 0.80,             knockback: 160 },
    aegis_shield_weapon:      { cooldown: 8.00 },
    princess_wand:            { damage: 30,   cooldown: 0.55,             knockback: 160 },
  };

  // Base stat values per move
  const MOVE_BASE_STATS = {
    slash:            { damage: 32,  cooldown: 0.40, range: 90  },
    fire_balls:       { damage: 20,  cooldown: 0.75, range: 180 },
    smite:            { damage: 28,  cooldown: 0.55, range: 110 },
    narwal_fight:     { damage: 36,  cooldown: 0.55, range: 126 },
    blood_beam:       { damage: 14,  cooldown: 3.00, duration: 1.2, critChance: 0 },
    love_beam:        { damage: 16,  cooldown: 3.40, duration: 1.7, critChance: 0 },
    turtle_wave:      { damage: 55,  cooldown: 3.00, duration: 1.35 },
    power_disks:      { damage: 22,  cooldown: 3.80, range: 240 },
    blade_justice:    { damage: 60,  cooldown: 3.80, range: 80  },
    lightning_columns:{ damage: 30,  cooldown: 4.80, range: 180 },
    god_sweep:        { damage: 40,  cooldown: 7.20, range: 320 },
    crimson_smash:    { damage: 55,  cooldown: 4.00, range: 120 },
    kicky_kick:       { damage: 92,  cooldown: 4.20, range: 138 },
    chaos_burst:      { damage: 38,  cooldown: 5.40, range: 100 },
    healing_zone:     { damage: 12,  cooldown: 5.00, duration: 3.0, range: 130 },
    fire_circle:      { damage: 18,  cooldown: 4.50, duration: 3.5, range: 100 },
    floor_lava:       { damage: 12,  cooldown: 5.00, duration: 4.0, range: 160 },
    dash:             { cooldown: 1.20 },
    nimrod_stomp:     { damage: 60,  cooldown: 2.50, range: 110 },
    warp:             { cooldown: 3.40 },
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
    if (entity !== player) achievementEvents.emit('status:applied', { key, entityId: entity.id });
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
    drawDifficultyIcons();
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
    wizards_paw: 'Choose 2 stats to increase by 50% — choose wisely.',
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
        drawDifficultyIcons();
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
    ui.pauseInfo?.addEventListener('click', () => {
      uiController.setRunHistoryOpen(true);
    });
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
      // Default to equipped weapon on the weapons tab
      const equipped = player?.equippedWeapon;
      if (equipped && WEAPON_BASE_STATS[equipped]) {
        activeAnvilTab = 'weapons';
        anvilSelectedItem = `weapon:${equipped}`;
      } else {
        anvilSelectedItem = null;
      }
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
    let xp = 0, gold = 0;
    for (const [key, count] of Object.entries(anvilStagedUpgrades)) {
      if (count === 0) continue;
      const [itemType, , statKey] = key.split(':');
      const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;
      const steps = Math.abs(count);
      xp   += steps * (schema[statKey]?.xpPerStep   ?? 0);
      gold += steps * (schema[statKey]?.goldPerStep  ?? 0);
    }
    return { xp, gold };
  }

  function renderAnvilPanel() {
    if (!isPanelOpen(ui.anvilPanel) || !player) return;

    if (ui.anvilXp) ui.anvilXp.textContent = player.xp ?? 0;
    if (ui.anvilCoins) ui.anvilCoins.textContent = player.coins ?? 0;

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
      const goldPerStep = schema[statKey].goldPerStep ?? 0;
      const costDisplay = xpPerStep > 0
        ? `<span class="anvil-stat-cost">${xpPerStep} XP + &#9670;${goldPerStep}/step</span>`
        : '';

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
    const coins = player?.coins ?? 0;
    const canAfford = xp >= cost.xp && coins >= cost.gold;
    if (ui.anvilCostSummary) {
      if (cost.xp === 0 && cost.gold === 0) {
        ui.anvilCostSummary.textContent = 'Select stats above and press + to stage upgrades.';
        ui.anvilCostSummary.style.color = '';
      } else {
        const xpColor  = xp    >= cost.xp   ? '#7eff9e' : '#ff7c88';
        const gldColor = coins >= cost.gold  ? '#ffd15a' : '#ff7c88';
        ui.anvilCostSummary.innerHTML =
          `Cost: <span style="color:${xpColor}">${cost.xp} XP (${xp})</span>` +
          ` + <span style="color:${gldColor}">&#9670; ${cost.gold} gold (${coins})</span>`;
      }
    }
    if (ui.anvilConfirm) {
      ui.anvilConfirm.disabled = (cost.xp === 0 && cost.gold === 0) || !canAfford;
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
      // Check if we could afford one more step (both XP and gold)
      const nextCost = getAnvilTotalCost();
      if (nextCost.xp + statDef.xpPerStep > (player?.xp ?? 0)) return;
      if (nextCost.gold + (statDef.goldPerStep ?? 0) > (player?.coins ?? 0)) return;
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
    if (!player || (cost.xp === 0 && cost.gold === 0)) return;
    if (player.xp < cost.xp || (player.coins ?? 0) < cost.gold) return;

    player.xp -= cost.xp;
    player.coins = (player.coins ?? 0) - cost.gold;

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
