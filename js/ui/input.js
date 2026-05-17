// input.js — Defines all shared constants (MOVE_DEFS, ITEM_DEFS, etc.),
// the ui object, gameStateManager, uiController, gameEvents, and all input handlers.
// Shared mutable state lives on Neo (set here to its initial values, then managed via Neo.X).
export function normalizeMouseBinding(value, fallback) {
    const normalized = String(value || fallback).toLowerCase();
    return normalized === 'rmb' || normalized === 'lmb' ? normalized : fallback;
  }

export function getMouseBindings() {
    const bindings = window.NeoSettings?.getBindings?.();
    return {
      slash: normalizeMouseBinding(bindings?.slash, 'lmb'),
      laser: normalizeMouseBinding(bindings?.laser, 'rmb'),
    };
  }

export function isMouseActionHeld(action) {
    const mouseBindings = getMouseBindings();
    if (mouseBindings[action] === 'rmb') {
      const held = !!Neo.mouse.right || !!Neo.mouse.rightQueued;
      Neo.mouse.rightQueued = false;
      return held;
    }
    const held = !!Neo.mouse.down || !!Neo.mouse.downQueued;
    Neo.mouse.downQueued = false;
    return held;
  }

export function formatMouseBindingLabel(value, fallback) {
    return normalizeMouseBinding(value, fallback) === 'rmb' ? 'RMB' : 'LMB';
  }

export function getSlotKeyLabel(slot) {
    const bindings = window.NeoSettings?.getBindings?.();
    if (slot === 'melee') return formatMouseBindingLabel(bindings?.slash, 'lmb');
    if (slot === 'laser') return formatMouseBindingLabel(bindings?.laser, 'rmb');
    if (slot === 'smash') return String(bindings?.smash || Neo.SLOT_KEYS.smash || 'r').toUpperCase();
    if (slot === 'dash') return String(bindings?.dash || Neo.SLOT_KEYS.dash || 'shift').toUpperCase();
    return Neo.SLOT_KEYS[slot] || '';
  }

export const MOVE_DEFS = {
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

export const SHOP_MOVE_POOL = [
    'slash', 'fire_balls', 'smite', 'narwal_fight',
    'blood_beam', 'love_beam', 'turtle_wave', 'power_disks', 'blade_justice', 'lightning_columns',
    'god_sweep',
    'crimson_smash', 'kicky_kick', 'chaos_burst', 'healing_zone', 'fire_circle', 'floor_lava',
    'dash', 'nimrod_stomp', 'warp', 'zip_lightning', 'flying_unhitable', 'cowards_way',
  ];

export const WEAPON_DEFS = {
    extending_staff: {
      key: 'extending_staff',
      name: 'Extending Staff',
      rarity: 'knight',
      description: 'Long sweeping strike with massive knockback.',
      color: '#ff3333',
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
export const WEAPON_KEYS = Object.keys(WEAPON_DEFS);
export const WHITE_WEAPON_POOL = ['extending_staff', 'hunters_bow', 'thorns_bleed_blade'];

// Rival adventurers: dungeon-roaming NPCs based on unchosen characters.
export const RIVAL_DEFS = {
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
    mooggy: {
      name: 'Rival Mooggy',
      color: '#ff3348',
      hp: 190, dmg: 24, speed: 132, r: 14, attackCd: 0.45,
      enterLine: 'Mrow.',
      deathLine: 'Hiss...',
      attackStyle: 'ranged',
    },
  };
export const RIVAL_MOVE_INTERVAL_BASE = 8.5;
export const RIVAL_SPAWN_CHANCE = 0.15; // ~15% spawn chance - very rare encounters
export const RIVAL_GROWTH_TICK_SECONDS = 14;
export const RIVAL_XP_PER_GROWTH_TICK = 12;
export const RIVAL_WEAPON_SWAP_BASE = 3.6;
export const MONSTER_ROAM_INTERVAL_SECONDS = 60;
export const MONSTER_ROAM_MOVE_CHANCE = 0.28;
export const PURPLE_WEAPON_POOL = ['lazer_glasses', 'metao_fire_staff', 'magenta_degale', 'magenta_p90'];
export const RED_WEAPON_POOL = ['granillia_lightning_spear', 'excalibur', 'golden_fleece', 'void_piercer', 'aegis_shield_weapon'];

export const RIVAL_WEAPON_LOADOUTS = {
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
    mooggy: [
      { key: 'lazer_glasses', class: 'ranged', range: 500, preferredRange: 230, damageMult: 0.98, cooldownMult: 0.28, projectileCount: 1, spread: 0.01, projectileSpeed: 520 },
      { key: 'thorns_bleed_blade', class: 'dash', range: 245, preferredRange: 150, damageMult: 1.08, cooldownMult: 0.8, knockback: 320 },
    ],
  };

export const ITEM_DEFS = {
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
    veggys_pendant: {
      key: 'veggys_pendant',
      name: "Veggy's Pendant",
      shortName: 'Pendant',
      description: 'Every 3 rooms entered, gain +10% max HP.',
      rarity: 'wizard',
      color: '#a0e87a',
      accent: '#5fcc2a',
      category: 'wizard',
      tags: ['hp', 'scaling', 'wizard'],
    },
    princes_glasses: {
      key: 'princes_glasses',
      name: "Prince's Glasses",
      shortName: 'Map Vision',
      description: 'Pink, not that anything is wrong with that. Upgrades the minimap: larger zoom, skull markers for traps, enemy dots, green for healing, yellow for coins.',
      rarity: 'wizard',
      color: '#ff9de8',
      accent: '#ff55cc',
      category: 'wizard',
      tags: ['minimap', 'utility'],
    },
  };
export const RARITY_NAME_COLORS = {
    knight: '#f4f6fb',
    white: '#f4f6fb',
    wizard: '#b77dff',
    purple: '#b77dff',
    god: '#ff4256',
    red: '#ff4256',
  };
export const SHOP_RARITY_PRICE_MULTIPLIERS = {
    knight: 1,
    white: 1,
    wizard: 2.15,
    purple: 2.15,
    god: 4.75,
    red: 4.75,
  };
export const ITEM_KEYS = Object.keys(ITEM_DEFS);
export const SANDBOX_ENEMY_TYPES = [
    'hunter', 'charger', 'laser', 'knave', 'sniper', 'machine_gunner',
    'golem', 'cult_mage', 'cult_follower', 'summoner', 'shield_unit', 'healer', 'boss_spawner',
    'queen_cult', 'bulk_golem', 'artificer_knave', 'god', 'mirror_knight', 'mooggy',
  ];
export const ITEM_DROP_WEIGHTS = [
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
    ['princes_glasses', 14],
    ['veggys_pendant', 0],
  ];
export const ITEM_DROP_TABLE = Neo.buildWeightTable(ITEM_DROP_WEIGHTS);
export const ELITE_ITEM_DROP_TABLE = Neo.buildWeightTable(
    ITEM_DROP_WEIGHTS.map(([key, weight]) => [key, weight + (key !== 'neo_knife' ? 4 : 0)])
  );
export const ELITE_INVENTORY_POOL = [
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
export const WHITE_ITEM_POOL = ITEM_KEYS.filter(key => ITEM_DEFS[key]?.rarity === 'knight');
export const ELITE_TYPE_DEFS = {
    burning: { label: 'Burning', color: '#ff9a3c' },
    bleeding: { label: 'Bleeding', color: '#ff4256' },
    giant: { label: 'Giant', color: '#ffd27d' },
    blessed: { label: 'Blessed', color: '#f2f6ff' },
    lasered: { label: 'Lazered', color: '#78d7ff' },
  };
  // itemRegistry is created in game-state.js after createItemRegistry is defined
  // const itemRegistry = createItemRegistry();  -- moved to game-state.js

export const ui = {
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
    timerDisplay: document.getElementById('timerDisplay'),
    floorDisplay: document.getElementById('floorDisplay'),
    difficultyDisplay: document.getElementById('difficultyDisplay'),
    difficultyLabel: document.getElementById('difficultyLabel'),
    competitiveSeedDisplay: document.getElementById('competitiveSeedDisplay'),
    competitiveSeedValue: document.getElementById('competitiveSeedValue'),
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
    rhBlogPanel: document.getElementById('rhBlogPanel'),
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
export const gameStateManager = GameStateManagerCtor ? new GameStateManagerCtor() : null;
  if (gameStateManager) {
    ['menu', 'charselect', 'play', 'dialogue', 'pause', 'dying', 'dead', 'win'].forEach(state => gameStateManager.addState(state));
  }
  // uiController is created in perf.js boot() after controller.js loads
  // Neo.uiController is set there.

export const gameEvents = (() => {
    const listeners = {};
    return {
      on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
      emit(event, payload) { (listeners[event] || []).forEach(fn => fn(payload)); },
    };
  })();

  // Expose infrastructure objects on Neo for other files
  Neo.ui = ui;
  Neo.gameStateManager = gameStateManager;
  // Neo.uiController set in boot() in perf.js
  Neo.gameEvents = gameEvents;

  // PLAYER_SLOT_CONFIG uses closures over Neo for mutable player/camera state
export const PLAYER_SLOT_CONFIG = [
    { id: 1, label: 'P1', color: '#ff8a8a', getEntity: () => Neo.player, setEntity: value => { Neo.player = value; }, getCharacter: () => Neo.chosenCharacter, setCharacter: value => { Neo.chosenCharacter = value; }, getDead: () => Neo.p1DeadInCoop, setDead: value => { Neo.p1DeadInCoop = !!value; }, getCamera: () => Neo.camera, setCamera: value => { Neo.camera = value; } },
    { id: 2, label: 'P2', color: '#4ca8ff', getEntity: () => Neo.player2, setEntity: value => { Neo.player2 = value; }, getCharacter: () => Neo.chosenCharacter2, setCharacter: value => { Neo.chosenCharacter2 = value; }, getDead: () => Neo.p2DeadInCoop, setDead: value => { Neo.p2DeadInCoop = !!value; }, getCamera: () => Neo.camera2, setCamera: value => { Neo.camera2 = value; } },
    { id: 3, label: 'P3', color: '#8aff8a', getEntity: () => Neo.player3, setEntity: value => { Neo.player3 = value; }, getCharacter: () => Neo.chosenCharacter3, setCharacter: value => { Neo.chosenCharacter3 = value; }, getDead: () => Neo.p3DeadInCoop, setDead: value => { Neo.p3DeadInCoop = !!value; }, getCamera: () => Neo.camera3, setCamera: value => { Neo.camera3 = value; } },
    { id: 4, label: 'P4', color: '#ffd080', getEntity: () => Neo.player4, setEntity: value => { Neo.player4 = value; }, getCharacter: () => Neo.chosenCharacter4, setCharacter: value => { Neo.chosenCharacter4 = value; }, getDead: () => Neo.p4DeadInCoop, setDead: value => { Neo.p4DeadInCoop = !!value; }, getCamera: () => Neo.camera4, setCamera: value => { Neo.camera4 = value; } },
  ];

// SANDBOX_DEFAULT_SETTINGS needs ITEM_KEYS and SANDBOX_ENEMY_TYPES (defined above)
export const SANDBOX_DEFAULT_SETTINGS = {
    enemyStatMultiplier: 1,
    enemySpeedMultiplier: 1,
    enemyDamageMultiplier: 1,
    playerDamageMultiplier: 1,
    startingCoins: 0,
    godMode: false,
    allowedEnemies: SANDBOX_ENEMY_TYPES.slice(),
    allowedItems: ITEM_KEYS.slice(),
  };
  // sandboxSettings initial value (metaProgress/tutorialState set later in game-state.js)
  Neo.sandboxSettings = { ...SANDBOX_DEFAULT_SETTINGS };
  Neo.PLAYER_SLOT_CONFIG = PLAYER_SLOT_CONFIG;
  Neo.SANDBOX_DEFAULT_SETTINGS = SANDBOX_DEFAULT_SETTINGS;
  Neo.SANDBOX_ENEMY_TYPES = SANDBOX_ENEMY_TYPES;

  // achievement listener — needs Neo.metaProgress (set later), but persists via closure
  window.addEventListener('achievement:unlocked', () => {
    if (Neo.metaProgress) Neo.metaProgress.loopCrystals = Number(Neo.metaProgress.loopCrystals || 0) + 1;
    Neo.persistMetaSoon();
    Neo.refreshMenuState();
  });

export const JESTER_PORTAL_ACTIVATE_DELAY = 0.44;
export const JESTER_PORTAL_TRIGGER_RADIUS = 42;
export const LADDER_TRIGGER_RADIUS = 64;
export const REPLAY_TUTORIAL_KEY = 'neonyke:replayTutorialNextRun';

// Upgradeable stat schemas for the anvil panel
export const WEAPON_UPGRADEABLE_STATS = {
    damage:    { label: 'Damage',       step: 5,     min: 5,    max: 9999, xpPerStep: 8,  format: v => Math.round(v) },
    cooldown:  { label: 'Cooldown (s)', step: -0.05, min: 0.05, max: 9999, xpPerStep: 10, format: v => v.toFixed(2) + 's' },
    range:     { label: 'Range',        step: 10,    min: 10,   max: 9999, xpPerStep: 7,  format: v => Math.round(v) },
    knockback: { label: 'Knockback',    step: 30,    min: 0,    max: 9999, xpPerStep: 5,  format: v => Math.round(v) },
  };
export const MOVE_UPGRADEABLE_STATS = {
    damage:    { label: 'Damage',       step: 5,    min: 5,   max: 9999, xpPerStep: 8,  format: v => Math.round(v) },
    cooldown:  { label: 'Cooldown (s)', step: -0.05,min: 0.05,max: 9999, xpPerStep: 10, format: v => v.toFixed(2) + 's' },
    duration:  { label: 'Duration (s)', step: 0.1,  min: 0.1, max: 30,   xpPerStep: 7,  format: v => v.toFixed(1) + 's' },
    range:     { label: 'Range / AOE',  step: 10,   min: 10,  max: 9999, xpPerStep: 7,  format: v => Math.round(v) },
    critChance:{ label: 'Crit Chance',  step: 0.05, min: 0,   max: 1.0,  xpPerStep: 12, format: v => Math.round(v * 100) + '%' },
  };

// Base stat values per weapon (used to compute current upgraded value)
export const WEAPON_BASE_STATS = {
    extending_staff:          { damage: 38,   cooldown: 0.55, range: 130, knockback: 500 },
    hunters_bow:              { damage: 28,   cooldown: 0.40,             knockback: 180 },
    thorns_bleed_blade:       { damage: 32,   cooldown: 0.55, range: 90,  knockback: 120 },
    lazer_glasses:            { damage: 18,   cooldown: 3.60,             knockback: 80  },
    metao_fire_staff:         { damage: 22,   cooldown: 0.75, range: 200, knockback: 100 },
    magenta_degale:           { damage: 80,   cooldown: 1.50,             knockback: 480 },
    magenta_p90:              { damage: 18,   cooldown: 1.80,             knockback: 140 },
    granillia_lightning_spear:{ damage: 45,   cooldown: 0.55,             knockback: 200 },
    excalibur:                { damage: 202,  cooldown: 2.00, range: 120, knockback: 600 },
    golden_fleece:            { damage: 20,   cooldown: 0.50, range: 80,  knockback: 80  },
    void_piercer:             { damage: 55,   cooldown: 0.80,             knockback: 160 },
    aegis_shield_weapon:      { cooldown: 8.00 },
  };

// Base stat values per move
export const MOVE_BASE_STATS = {
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

  // saveStore is created in save-store.js after createSaveStore is defined
  // Neo.saveStore is set there.

  // Expose constants on Neo (needed by other files)
  Neo.RARITY_NAME_COLORS = RARITY_NAME_COLORS;
  Neo.SHOP_RARITY_PRICE_MULTIPLIERS = SHOP_RARITY_PRICE_MULTIPLIERS;
  Neo.MOVE_DEFS = MOVE_DEFS;
  Neo.SHOP_MOVE_POOL = SHOP_MOVE_POOL;
  Neo.WEAPON_DEFS = WEAPON_DEFS;
  Neo.WEAPON_KEYS = WEAPON_KEYS;
  Neo.WHITE_WEAPON_POOL = WHITE_WEAPON_POOL;
  Neo.RIVAL_DEFS = RIVAL_DEFS;
  Neo.RIVAL_MOVE_INTERVAL_BASE = RIVAL_MOVE_INTERVAL_BASE;
  Neo.RIVAL_SPAWN_CHANCE = RIVAL_SPAWN_CHANCE;
  Neo.RIVAL_GROWTH_TICK_SECONDS = RIVAL_GROWTH_TICK_SECONDS;
  Neo.RIVAL_XP_PER_GROWTH_TICK = RIVAL_XP_PER_GROWTH_TICK;
  Neo.RIVAL_WEAPON_SWAP_BASE = RIVAL_WEAPON_SWAP_BASE;
  Neo.MONSTER_ROAM_INTERVAL_SECONDS = MONSTER_ROAM_INTERVAL_SECONDS;
  Neo.MONSTER_ROAM_MOVE_CHANCE = MONSTER_ROAM_MOVE_CHANCE;
  Neo.PURPLE_WEAPON_POOL = PURPLE_WEAPON_POOL;
  Neo.RED_WEAPON_POOL = RED_WEAPON_POOL;
  Neo.RIVAL_WEAPON_LOADOUTS = RIVAL_WEAPON_LOADOUTS;
  Neo.ITEM_DEFS = ITEM_DEFS;
  Neo.ITEM_KEYS = ITEM_KEYS;
  Neo.ITEM_DROP_WEIGHTS = ITEM_DROP_WEIGHTS;
  Neo.ITEM_DROP_TABLE = ITEM_DROP_TABLE;
  Neo.ELITE_ITEM_DROP_TABLE = ELITE_ITEM_DROP_TABLE;
  Neo.ELITE_INVENTORY_POOL = ELITE_INVENTORY_POOL;
  Neo.WHITE_ITEM_POOL = WHITE_ITEM_POOL;
  Neo.ELITE_TYPE_DEFS = ELITE_TYPE_DEFS;
  // Neo.itemRegistry is set in game-state.js
  Neo.JESTER_PORTAL_ACTIVATE_DELAY = JESTER_PORTAL_ACTIVATE_DELAY;
  Neo.JESTER_PORTAL_TRIGGER_RADIUS = JESTER_PORTAL_TRIGGER_RADIUS;
  Neo.LADDER_TRIGGER_RADIUS = LADDER_TRIGGER_RADIUS;
  Neo.REPLAY_TUTORIAL_KEY = REPLAY_TUTORIAL_KEY;
  Neo.WEAPON_UPGRADEABLE_STATS = WEAPON_UPGRADEABLE_STATS;
  Neo.MOVE_UPGRADEABLE_STATS = MOVE_UPGRADEABLE_STATS;
  Neo.WEAPON_BASE_STATS = WEAPON_BASE_STATS;
  Neo.MOVE_BASE_STATS = MOVE_BASE_STATS;
  // Neo.saveStore is set in save-store.js
  Neo.normalizeMouseBinding = normalizeMouseBinding;
  Neo.getMouseBindings = getMouseBindings;
  Neo.isMouseActionHeld = isMouseActionHeld;
  Neo.formatMouseBindingLabel = formatMouseBindingLabel;
  Neo.getSlotKeyLabel = getSlotKeyLabel;
