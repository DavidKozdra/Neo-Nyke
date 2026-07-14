// input.js — Defines all shared constants (MOVE_DEFS, ITEM_DEFS, etc.),
// the ui object, gameStateManager, uiController, gameEvents, and all input handlers.
// Shared mutable state lives on Neo (set here to its initial values, then managed via Neo.X).
export function normalizeMouseBinding(value, fallback) {
    return String(value || fallback).toLowerCase();
  }

export function getMouseBindings() {
    const bindings = window.NeoSettings?.getBindings?.();
    return {
      slash: normalizeMouseBinding(bindings?.slash, 'lmb'),
      laser: normalizeMouseBinding(bindings?.laser, 'rmb'),
    };
  }

export function isMouseActionHeld(action) {
    const bindings = window.NeoSettings?.getBindings?.();
    const binding = String(action === 'slash' ? (bindings?.slash || 'lmb') : (bindings?.laser || 'rmb')).toLowerCase();
    if (binding === 'rmb') {
      const held = !!Neo.mouse.right || !!Neo.mouse.rightQueued;
      Neo.mouse.rightQueued = false;
      return held;
    }
    if (binding === 'lmb') {
      const held = !!Neo.mouse.down || !!Neo.mouse.downQueued;
      Neo.mouse.downQueued = false;
      return held;
    }
    return !!Neo.keys?.[binding];
  }

export function formatMouseBindingLabel(value, fallback) {
    const v = String(value || fallback).toLowerCase();
    if (v === 'rmb') return 'RMB';
    if (v === 'lmb') return 'LMB';
    return v.toUpperCase();
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
    smite: { key: 'smite', slot: 'melee', name: 'Spear of Lightning', desc: 'Lightning spear jab that chains between enemies — the same strike as the equipped spear.' },
    narwal_fight: { key: 'narwal_fight', slot: 'melee', name: 'Narwal Fight', desc: 'A wide pink spear-sweep with a piercing follow-up.', exclusiveCharacter: 'princess' },
    mooggy_swipe: { key: 'mooggy_swipe', slot: 'melee', name: 'Mooggy Swipe', desc: 'Wide claw swipe with a small bleed chance. Hold to charge: a full wind-up unleashes a wider, far heavier slash.', exclusiveCharacter: 'mooggy' },

    blood_beam: { key: 'blood_beam', slot: 'laser', name: 'Blood Beam', desc: 'Sustained piercing beam that causes bleed.' },
    love_beam: { key: 'love_beam', slot: 'laser', name: 'Love Beam', desc: 'A radiant beam that damages enemies and heals you on hit.', exclusiveCharacter: 'princess' },
    love_bomb_laser: { key: 'love_bomb_laser', slot: 'laser', name: 'Love Bomb', desc: 'Hold to charge, then release a heart-shaped bomb toward the cursor that bursts in a pink AOE. Enemies caught in the blast have a chance to be Sparkled (guaranteed crits for a few seconds).', exclusiveCharacter: 'princess' },
    turtle_wave: { key: 'turtle_wave', slot: 'laser', name: 'Turtle Wave', desc: 'Giant beam. Drains 2 HP each active second.' },
    power_disks: { key: 'power_disks', slot: 'laser', name: 'Power Disks', desc: 'Burst of spinning disks.' },
    hammer_throw: { key: 'hammer_throw', slot: 'laser', name: 'Hammer Throw', desc: 'Hurl a heavy spinning hammer that flies out, then arcs back to you — striking foes both ways.', exclusiveCharacter: 'sarge' },
    lightning_cross: { key: 'lightning_cross', slot: 'laser', name: 'Lightning Cross', desc: 'Call down two room-spanning lightning bolts through yourself, one horizontal and one vertical, damaging everything they cross and healing you 1% max HP per enemy struck. 2 charges.', exclusiveCharacter: 'sarge', maxStacks: 2 },
    blade_justice: { key: 'blade_justice', slot: 'laser', name: 'Blade Justice', desc: 'Divine short-range blade strike.' },
    lightning_columns: { key: 'lightning_columns', slot: 'laser', name: 'Lightning Columns', desc: 'Summon two lightning turrets.' },
    god_sweep: { key: 'god_sweep', slot: 'laser', name: 'God Sweep', desc: 'Spin a massive divine beam around yourself.' },
    laser_shockwave: { key: 'laser_shockwave', slot: 'laser', name: 'Laser Shockwave', desc: 'Fires a shockwave that erupts rock spikes in a vertical line across the room.' },
    nail_shot: { key: 'nail_shot', slot: 'laser', name: 'Nail Shot', desc: 'Fires a spread of bouncing nails in all directions. 3 charges.', exclusiveCharacter: 'mooggy', maxStacks: 3 },
    mooggy_blood_beam: { key: 'mooggy_blood_beam', slot: 'laser', name: 'Blood Beam', desc: 'A crimson assassin beam that drenches enemies in heavy poison and chills them solid (freeze).', exclusiveCharacter: 'mooggy' },
    thorn_blood_beams: { key: 'thorn_blood_beams', slot: 'laser', name: 'Infinite Blood Beam', desc: 'Four bleeding beams that orbit you, all aimed by the mouse. Channels while held.', exclusiveCharacter: 'thorn_knight' },
    wizard_lazer: { key: 'wizard_lazer', slot: 'laser', name: 'Wizard Lazer', desc: 'A thick, heavy purple beam with massive recoil and heavy damage.', exclusiveCharacter: 'metao' },

    crimson_smash: { key: 'crimson_smash', slot: 'smash', name: 'Crimson Smash', desc: 'Heavy area smash.' },
    hammer_smash: { key: 'hammer_smash', slot: 'smash', name: 'Hammer Smash', desc: 'Slam the war hammer down: a heavy shockwave that stuns and flings a cross of debris outward, up, down, left, and right.', exclusiveCharacter: 'sarge' },
    death_ball: { key: 'death_ball', slot: 'smash', name: 'Death Ball', desc: 'Hold to charge, then release a big blue energy ball toward the cursor. The longer you hold, the larger it grows and the more damage it deals.', exclusiveCharacter: 'turtle_boy' },
    turtle_powerup: { key: 'turtle_powerup', slot: 'smash', name: 'Turtle Power-Up', desc: 'Hold to charge a shell surge: on release, burst a small AOE at your feet, gain a barrier worth 25% of your current HP, and a temporary attack-speed & move-speed boost that grows the longer you charge.', exclusiveCharacter: 'turtle_boy' },
    mooggy_hairball: { key: 'mooggy_hairball', slot: 'smash', name: 'Hairball Blast', desc: 'Hack up a venomous hairball that bursts for high poison and freezes everything caught in it.', exclusiveCharacter: 'mooggy' },
    potion_bath: { key: 'potion_bath', slot: 'smash', name: 'Potion Bath', desc: 'Cleanse all statuses and resist them for 20s, heal 10% and regen 10% over 5s, vanish for 5s, and erupt in explosions around you.', exclusiveCharacter: 'metao' },
    excalibur_strike: { key: 'excalibur_strike', slot: 'smash', name: 'Summon Excalibur', desc: 'Giant divine swords rain from the sky for huge AOE damage. 10s cooldown.', exclusiveCharacter: 'gelleh' },
    holy_turrets: { key: 'holy_turrets', slot: 'smash', name: 'Holy Turrets', desc: 'Summon divine turrets that fire holy AOE bursts at nearby foes.', exclusiveCharacter: 'gelleh' },
    kicky_kick: { key: 'kicky_kick', slot: 'smash', name: 'Kicky Kick', desc: 'A devastating kick with a 10% chance to launch enemies into the next room.', exclusiveCharacter: 'princess' },
    chaos_burst: { key: 'chaos_burst', slot: 'smash', name: 'Chaos Burst', desc: 'Multiple chaos detonations.' },
    wall_of_toph: { key: 'wall_of_toph', slot: 'smash', name: 'Wall of Toph', desc: 'Slam the ground: rock shards erupt all around you and a ring of temporary rock barriers rises to soak hits and break enemy lines of fire.' },
    healing_zone: { key: 'healing_zone', slot: 'smash', name: 'Healing Zone', desc: 'Hold to charge a healing and damage zone. Charge speed scales with attack speed.' },
    fire_circle: { key: 'fire_circle', slot: 'smash', name: 'Fire Circle', desc: 'Burning aura around you.' },
    floor_lava: { key: 'floor_lava', slot: 'smash', name: 'Floor Is Lava', desc: 'Lava immunity and lava trail.' },
    random_pounce: { key: 'random_pounce', slot: 'smash', name: 'Random Pounce', desc: 'Massive AOE explosion and homing fangs that seek enemies, dealing heavy damage with high crit chance and bleed.', exclusiveCharacter: 'mooggy' },

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
      desc: 'Hold to charge, then release to leap toward wherever you\'re aiming and slam on landing for heavy AOE damage. A tap is a short, precise hop; a full charge leaps all the way across the room and hits harder.',
    },
    warp: { key: 'warp', slot: 'dash', name: 'Warp', desc: 'Phase out and reappear where the mouse is. Leaves a silhouette and grants i-frames. 4 charges.', maxStacks: 4 },
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
    princess_shield: {
      key: 'princess_shield',
      slot: 'dash',
      name: "Princess's Shield",
      desc: 'Raise a pink barrier worth 40% of your max HP. Auto-casts itself the moment your HP drops below 15%, as long as it is off cooldown.',
      exclusiveCharacter: 'princess',
    },
    cowards_way: {
      key: 'cowards_way',
      slot: 'dash',
      name: "Coward's Way",
      desc: 'Become invulnerable for 3 seconds, but it ends if you attack.',
    },
    mooggy_zoomies: {
      key: 'mooggy_zoomies',
      slot: 'dash',
      name: 'Zoomies',
      desc: '5× move speed for 12 seconds. 20 second cooldown. 2 charges.',
      exclusiveCharacter: 'mooggy',
      maxStacks: 2,
    },
    knight_slash_dash: {
      key: 'knight_slash_dash',
      slot: 'dash',
      name: "Blade Filled Dash",
      desc: 'Dash through enemies and strike everything left in your wake with a high bleed rate.',
      exclusiveCharacter: 'thorn_knight',
      maxStacks: 1,
    },
  };

export const SHOP_MOVE_POOL = [
    // No melee moves are sold: the M1 slot is the bare-hands fallback (always
    // `slash`) and every "real" primary attack comes from an equipped weapon.
    // The old melee moves (fire_balls, smite, narwal_fight, mooggy_swipe) are
    // now duplicated by each character's weapon, so they're no longer buyable.
    'blood_beam', 'love_beam', 'turtle_wave', 'power_disks', 'blade_justice', 'lightning_columns',
    'god_sweep', 'nail_shot', 'laser_shockwave',
    'crimson_smash', 'wall_of_toph', 'kicky_kick', 'chaos_burst', 'healing_zone', 'fire_circle', 'floor_lava', 'random_pounce',
    'dash', 'nimrod_stomp', 'warp', 'zip_lightning', 'flying_unhitable', 'cowards_way', 'mooggy_zoomies',
    // NOTE: the alternative kit moves (mooggy_blood_beam, thorn_blood_beams,
    // wizard_lazer, mooggy_hairball, potion_bath, excalibur_strike, holy_turrets,
    // knight_slash_dash) are intentionally NOT sold here — they are chosen on the
    // pick-character screen via the alt-kit picker, not bought in the shop.
  ];

// baseCooldown: seconds between attacks (string 'melee' resolves to the melee base
//   cooldown at read time — see getWeaponBaseCooldown in combat.js). Omitted ⇒ 0.5.
// maxCharges: static charge cap; >1 makes the weapon fire off charges. Omitted ⇒ 1.
export const WEAPON_DEFS = {
    extending_staff: {
      key: 'extending_staff',
      name: 'Extending Staff',
      rarity: 'knight',
      description: 'Long sweeping strike with massive knockback.',
      color: '#ff3333',
      baseCooldown: 0.77,
    },
    hunters_bow: {
      key: 'hunters_bow',
      name: "Hunter's Bow",
      rarity: 'knight',
      description: 'Fast, accurate ranged shot with +10% crit chance.',
      color: '#e8f7ff',
      baseCooldown: 0.4,
    },
    thorns_bleed_blade: {
      key: 'thorns_bleed_blade',
      name: "Thorn's Bleed Blade",
      rarity: 'knight',
      description: 'Close slash with heavy bleed application.',
      color: '#ffe9ef',
      baseCooldown: 'melee',
    },
    claw_gauntlets: {
      key: 'claw_gauntlets',
      name: 'Claw Gauntlets',
      rarity: 'knight',
      description: 'Rapid wide claw swipe. High bleed chance on every hit.',
      color: '#ff7a9a',
      baseCooldown: 0.38,
    },
    lazer_glasses: {
      key: 'lazer_glasses',
      name: 'Lazer Glasses',
      rarity: 'wizard',
      description: 'Twin beams track your mouse and can ignite enemies.',
      color: '#cd9bff',
      baseCooldown: 3.6,
    },
    metao_fire_staff: {
      key: 'metao_fire_staff',
      name: "Metao's Fire Staff",
      rarity: 'wizard',
      description: 'Fan cast of burning fire bolts. 2 charges.',
      color: '#ffb874',
      baseCooldown: 1.75,
      maxCharges: 2,
    },
    magenta_degale: {
      key: 'magenta_degale',
      name: "Magenta's Degale",
      rarity: 'wizard',
      description: 'Super heavy shot with massive knockback and recoil. 3 charges.',
      color: '#ff8ccc',
      baseCooldown: 1.5,
      maxCharges: 3,
    },
    magenta_p90: {
      key: 'magenta_p90',
      name: "Magenta's P90",
      rarity: 'wizard',
      description: 'Rapid burst fire with controlled recoil. 5 charges.',
      color: '#ff9dd7',
      baseCooldown: 1.8,
      maxCharges: 5,
    },
    gelleh_lightning_spear: {
      key: 'gelleh_lightning_spear',
      name: "Gelleh's Spear of Lightning",
      rarity: 'god',
      description: 'Piercing lightning spear that chains on impact.',
      color: '#9bd9ff',
      baseCooldown: 0.75,
    },
    excalibur: {
      key: 'excalibur',
      name: 'Excalibur',
      rarity: 'god',
      description: "A divine strike for 777% of your base damage.",
      color: '#ffd980',
      baseCooldown: 1.554,
    },
    katana_excalibur_777x: {
      key: 'katana_excalibur_777x',
      name: 'Katana Excalibur 777X',
      rarity: 'god',
      description: 'Blinding-fast 777% slashes that erupt in twin triangle waves left and right. 2 charges.',
      color: '#ffb35c',
      baseCooldown: 0.777,
      maxCharges: 2,
    },
    golden_fleece: {
      key: 'golden_fleece',
      name: 'Golden Fleece',
      rarity: 'god',
      description: 'Heals 6% max HP every 2 seconds while equipped.',
      color: '#ffe59c',
      baseCooldown: 0.5,
    },
    void_piercer: {
      key: 'void_piercer',
      name: 'Void Piercer',
      rarity: 'god',
      description: 'Pierces barriers with high damage and 20% crit.',
      color: '#ffd2c0',
      baseCooldown: 0.8,
    },
    princess_wand: {
      key: 'princess_wand',
      name: "Princess's Wand",
      rarity: 'princess',
      description: 'A graceful piercing magic shot made for Princess. 3 charges.',
      color: '#ff9de8',
      baseCooldown: 0.77,
      maxCharges: 3,
    },
    sarges_hammer: {
      key: 'sarges_hammer',
      name: "Sarge's Hammer",
      rarity: 'god',
      description: 'A heavy war hammer with a wide crushing swing. While held, 2 kills within 1 second launch a homing hammer that strikes a foe and returns to you, healing and pulling pickups on the way back.',
      color: '#7da3ff',
      accent: '#cfe0ff',
      baseCooldown: 0.7,
    },
  };
export const WEAPON_KEYS = Object.keys(WEAPON_DEFS);
export const WHITE_WEAPON_POOL = ['extending_staff', 'hunters_bow', 'thorns_bleed_blade', 'claw_gauntlets'];

// Rival adventurers: dungeon-roaming NPCs based on unchosen characters.
export const RIVAL_DEFS = {
    princess: {
      name: 'Rival Princess',
      color: '#e87fff',
      // Toned down from 220/26: the player princess is strong, but as a rival she
      // was the toughest melee bruiser. Now on the lighter end of the roster.
      hp: 160, dmg: 18, speed: 102, r: 16, attackCd: 0.75,
      enterLine: 'This dungeon belongs to me.',
      deathLine: 'Unbelievable...',
      attackStyle: 'ranged',
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
    gelleh: {
      name: 'Rival Gelleh',
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
    // Endgame rival: only spawns once the player has completed 3 loops (see the
    // minLoopIndex gate in spawnRivals). Tanky and slow, mirroring his playable
    // kit — a thick shell, a draining wave beam, and a heavy melee staff.
    turtle_boy: {
      name: 'Rival Turtle Boy',
      color: '#5fd6a0',
      hp: 260, dmg: 22, speed: 78, r: 17, attackCd: 1.05,
      enterLine: 'You\'re a long way from home.',
      deathLine: 'Back... in my shell...',
      attackStyle: 'ranged',
      minLoopIndex: 3,
    },
  };
export const RIVAL_MOVE_INTERVAL_BASE = 8.5;
export const RIVAL_SPAWN_CHANCE = 0.15; // ~15% spawn chance - very rare encounters
export const RIVAL_GROWTH_TICK_SECONDS = 14;
export const RIVAL_XP_PER_GROWTH_TICK = 6; // halved: passive growth was snowballing rivals out of reach
export const RIVAL_LEVEL_CAP = 9; // hard ceiling so rivals stay beatable no matter how long a run drags on
export const RIVAL_REPUTATION_LEVEL_CAP = 4; // most starting-level bonus reputation can grant
export const RIVAL_WEAPON_SWAP_BASE = 3.6;
export const RIVAL_DAMAGE_REDUCTION = 0.2; // rivals are tougher than normal enemies: a flat 20% reduction on incoming hits
export const RIVAL_VENDETTA_THREAT = 5; // a rival whose accumulated threat crosses this escalates to a sustained hunt on its own
export const RIVAL_DEFAULT_KIT_CHANCE = 0.8; // ~80% of rivals spawn with their default kit; the rest swap in an alt move
export const MONSTER_ROAM_INTERVAL_SECONDS = 60;
export const MONSTER_ROAM_MOVE_CHANCE = 0.28;
export const PURPLE_WEAPON_POOL = ['lazer_glasses', 'metao_fire_staff', 'magenta_degale', 'magenta_p90'];
export const RED_WEAPON_POOL = ['gelleh_lightning_spear', 'excalibur', 'katana_excalibur_777x', 'golden_fleece', 'void_piercer'];

// Each rival's default loadout mirrors that character's PLAYER kit: their
// default weapon plus their signature laser/smash/dash moves, mapped onto the
// rival AI's four weapon classes (melee / ranged / burst / dash). The `key` is
// the player move/weapon name so it reads faithfully in projectiles + the
// rivals tab. Alternatives below mirror each character's KIT_ALTERNATIVES and
// are swapped in by buildRivalLoadout (~20% of spawns).
export const RIVAL_WEAPON_LOADOUTS = {
    // wand (ranged), love_beam (ranged heal beam), kicky_kick (smash → heavy
    // melee that can launch you into the next room), flying_unhitable (dash).
    princess: [
      { key: 'princess_wand', class: 'ranged', range: 380, preferredRange: 230, damageMult: 0.9, cooldownMult: 1.05, projectileCount: 1, spread: 0.05, projectileSpeed: 380 },
      { key: 'love_beam', class: 'melee_heal', range: 50, preferredRange: 120, damageMult: 1.0, cooldownMult: 1.0, knockback: 280 },
      { key: 'kicky_kick', class: 'melee', range: 60, preferredRange: 110, damageMult: 1.4, cooldownMult: 1.5, knockback: 620, roomLaunchChance: 0.1 },
    ],
    // thorns blade (melee), blood_beam (ranged), crimson_smash (melee AoE),
    // dash (dash).
    thorn_knight: [
      { key: 'thorns_bleed_blade', class: 'melee', range: 56, preferredRange: 120, damageMult: 1.0, cooldownMult: 0.84, knockback: 320 },
      { key: 'blood_beam', class: 'ranged', range: 430, preferredRange: 270, damageMult: 0.86, cooldownMult: 1.05, projectileCount: 1, spread: 0.04, projectileSpeed: 420 },
      { key: 'crimson_smash', class: 'dash', range: 240, preferredRange: 165, damageMult: 1.15, cooldownMult: 1.2, knockback: 360 },
    ],
    // fire staff (ranged), power_disks (burst), chaos_burst (smash → burst),
    // warp (dash).
    metao: [
      { key: 'metao_fire_staff', class: 'ranged', range: 470, preferredRange: 300, damageMult: 0.92, cooldownMult: 1.14, projectileCount: 1, spread: 0.02, projectileSpeed: 460 },
      { key: 'power_disks', class: 'burst', range: 390, preferredRange: 250, damageMult: 0.72, cooldownMult: 1.0, projectileCount: 4, spread: 0.16, projectileSpeed: 360 },
      { key: 'chaos_burst', class: 'burst', range: 340, preferredRange: 220, damageMult: 0.85, cooldownMult: 1.12, projectileCount: 3, spread: 0.18, projectileSpeed: 380 },
    ],
    // lightning spear (ranged), blade_justice (melee), healing_zone
    // (melee_heal), zip_lightning (dash).
    gelleh: [
      { key: 'gelleh_lightning_spear', class: 'ranged', range: 420, preferredRange: 260, damageMult: 0.94, cooldownMult: 1.0, projectileCount: 2, spread: 0.08, projectileSpeed: 390 },
      { key: 'blade_justice', class: 'melee_heal', range: 50, preferredRange: 130, damageMult: 1.12, cooldownMult: 0.95, knockback: 320 },
      { key: 'zip_lightning', class: 'dash', range: 245, preferredRange: 160, damageMult: 1.08, cooldownMult: 1.1, knockback: 300 },
    ],
    // claw gauntlets (melee), nail_shot (ranged spread), random_pounce (dash),
    // mooggy_zoomies flavor via fast cooldown.
    mooggy: [
      { key: 'claw_gauntlets', class: 'melee', range: 48, preferredRange: 110, damageMult: 1.05, cooldownMult: 0.7, knockback: 260 },
      { key: 'nail_shot', class: 'ranged', range: 460, preferredRange: 230, damageMult: 0.85, cooldownMult: 0.9, projectileCount: 3, spread: 0.22, projectileSpeed: 420 },
      { key: 'random_pounce', class: 'dash', range: 245, preferredRange: 150, damageMult: 1.1, cooldownMult: 1.0, knockback: 320 },
    ],
    // extending_staff (heavy melee), turtle_wave (long beam → ranged), death_ball
    // (charged burst → ranged), riptide_roll (dash). Slow but high-impact.
    turtle_boy: [
      { key: 'extending_staff', class: 'melee', range: 130, preferredRange: 120, damageMult: 1.15, cooldownMult: 1.1, knockback: 500 },
      { key: 'turtle_wave', class: 'ranged', range: 480, preferredRange: 280, damageMult: 0.9, cooldownMult: 1.25, projectileCount: 1, spread: 0.0, projectileSpeed: 420 },
      { key: 'riptide_roll', class: 'dash', range: 240, preferredRange: 160, damageMult: 1.1, cooldownMult: 1.15, knockback: 360 },
    ],
  };

// Per-character swap-in weapons, mirroring each player's KIT_ALTERNATIVES alt
// moves. buildRivalLoadout swaps one of these in for ~20% of rival spawns so
// rivals aren't always the cookie-cutter default kit.
export const RIVAL_LOADOUT_ALTERNATIVES = {
    thorn_knight: [
      // thorn_blood_beams (alt laser) + knight_slash_dash (alt dash)
      { key: 'thorn_blood_beams', class: 'ranged', range: 450, preferredRange: 250, damageMult: 0.8, cooldownMult: 0.92, projectileCount: 2, spread: 0.1, projectileSpeed: 430 },
      { key: 'knight_slash_dash', class: 'dash', range: 260, preferredRange: 170, damageMult: 1.2, cooldownMult: 1.05, knockback: 340 },
    ],
    metao: [
      // wizard_lazer (alt laser) + potion_bath (alt smash → heal flavor)
      { key: 'wizard_lazer', class: 'ranged', range: 500, preferredRange: 320, damageMult: 1.1, cooldownMult: 1.3, projectileCount: 1, spread: 0.0, projectileSpeed: 520 },
      { key: 'potion_bath', class: 'melee_heal', range: 54, preferredRange: 120, damageMult: 0.95, cooldownMult: 1.1, knockback: 300 },
    ],
    gelleh: [
      // holy_turrets + excalibur_strike (alt smashes)
      { key: 'excalibur_strike', class: 'burst', range: 360, preferredRange: 230, damageMult: 1.0, cooldownMult: 1.2, projectileCount: 3, spread: 0.12, projectileSpeed: 380 },
    ],
    mooggy: [
      // mooggy_blood_beam (alt laser) + mooggy_hairball (alt smash → burst)
      { key: 'mooggy_blood_beam', class: 'ranged', range: 480, preferredRange: 250, damageMult: 0.95, cooldownMult: 1.1, projectileCount: 1, spread: 0.02, projectileSpeed: 480 },
      { key: 'mooggy_hairball', class: 'burst', range: 330, preferredRange: 200, damageMult: 0.9, cooldownMult: 1.1, projectileCount: 4, spread: 0.2, projectileSpeed: 360 },
    ],
  };

export const ITEM_DEFS = {
    neo_knife: {
      key: 'neo_knife',
      name: 'Neo-Knife',
      shortName: 'Knife',
      description: 'Basic melee and bleed-focused melee attacks gain +10% Bleed chance per stack.',
      rarity: 'knight',
      color: '#f4f6fb',
      category: 'knight',
      tags: ['bleed'],
    },
    tooth_of_thorn: {
      key: 'tooth_of_thorn',
      name: 'Tooth of Thorn',
      shortName: 'Drain Ramp',
      description: 'Hits have a chance to drain life: steal a chunk of HP, then keep healing for a few seconds. Each stack drains harder. Tough, high-level foes resist it.',
      rarity: 'knight',
      color: '#ffd7e2',
      accent: '#ff6e8b',
      category: 'knight',
      tags: ['drain', 'heal', 'hit'],
    },
    tough_bandaid: {
      key: 'tough_bandaid',
      name: 'Tough Bandaid',
      shortName: 'Patch + Resist',
      description: 'Per stack: defense +0.5% and +2% Bleed chance on basic and bleed-focused melee attacks. Bleed tick damage taken -10% per stack (max -80%); your Bleed timers decay 20% faster per stack (max 3× speed).',
      rarity: 'knight',
      color: '#f0e2cf',
      accent: '#a87555',
      category: 'knight',
      tags: ['defense', 'bleed'],
    },
    orb_of_blood: {
      key: 'orb_of_blood',
      name: 'Orb of Blood',
      shortName: 'Orb',
      description: 'Bleeding enemies take +100% damage per stack.',
      rarity: 'wizard',
      color: '#a857ff',
      category: 'wizard',
      tags: ['bleed', 'damage'],
    },
    hemes_scarf: {
      key: 'hemes_scarf',
      name: "Heme's Scarf",
      shortName: 'Scarf',
      description: 'Per stack: nearby enemies always bleed, and taking a hit bleeds you too. Kills charge the scarf; below 50 HP it discharges, draining all active bleed — yours and theirs — into rapid healing until you recover.',
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
    gold_vac: {
      key: 'gold_vac',
      tool: true,
      name: 'Gold Vac',
      shortName: 'Vac x1',
      description: 'Tool: runs for 2 minutes. Automatically vacuums pickups from across the room and doubles coin pickup value. Each extra stack adds +30s and +50% coin value.',
      rarity: 'knight',
      color: '#ffe07a',
      accent: '#fff6c7',
      category: 'knight',
      tags: ['tools', 'loot', 'coin', 'utility'],
    },
    copycat_charm: {
      key: 'copycat_charm',
      name: 'Copycat Charm',
      shortName: 'Item x2',
      description: '30% chance per stack to duplicate an item pickup, capped at 75%.',
      rarity: 'god',
      color: '#f5efff',
      accent: '#c8a8ff',
      category: 'god',
      tags: ['loot', 'item', 'utility'],
    },
    crit_charm: {
      key: 'crit_charm',
      name: 'Crit Charm',
      shortName: 'Hit Crit',
      description: '+2.5% flat crit chance per stack. Every few kills, also surge +4% crit chance per stack for 4s. (3/5/7 kills on easy/normal/hard).',
      rarity: 'knight',
      color: '#ffffff',
      category: 'knight',
      tags: ['crit', 'charge'],
    },
    copper_penny: {
      key: 'copper_penny',
      name: 'Copper Penny',
      shortName: 'Volt %',
      description: 'Electric attacks deal +20% damage per stack and build Static on enemies — a charge that stacks, deals damage over time, and arcs to nearby foes.',
      rarity: 'knight',
      color: '#e08a4a',
      accent: '#ffd27d',
      category: 'knight',
      tags: ['damage', 'status', 'lightning'],
    },
    attack_servo: {
      key: 'attack_servo',
      name: 'Attack Servo',
      shortName: 'AS %',
      description: 'Attack speed +8% per stack.',
      rarity: 'knight',
      color: '#eef5ff',
      category: 'knight',
      tags: ['speed'],
    },
    enemy_magnet: {
      key: 'enemy_magnet',
      name: 'Enemy Magnet',
      shortName: 'Homing +5%',
      description: 'Projectile homing +15% per stack, plus an extra 2% × stacks per stack (ramps up fast as you invest). Gives player bullets homing.',
      rarity: 'knight',
      color: '#dff6ff',
      accent: '#7ad8ff',
      category: 'knight',
      tags: ['projectile', 'homing', 'utility'],
    },
    keen_eye: {
      key: 'keen_eye',
      name: 'Keen Eye',
      shortName: 'Kill Focus',
      description: 'Charge on 10 kills. When full, the next kill grants Glitter for 7s: +20% crit chance and +2.5% critical damage per stack.',
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
      description: 'Gain 15% more XP on enemy kill per stack. Shops also get cheaper the closer you are to leveling up (up to -10% at the brink of a level).',
      rarity: 'knight',
      color: '#d0ecff',
      category: 'knight',
      tags: ['xp'],
    },
    scholar_cap: {
      key: 'scholar_cap',
      name: "Scholar's Cap",
      shortName: 'Level Edge',
      description: 'Deal up to +45% damage per stack as you get closer to leveling up.',
      rarity: 'wizard',
      color: '#b49cff',
      category: 'wizard',
      tags: ['xp', 'damage', 'wizard'],
    },
    push_man: {
      key: 'push_man',
      name: 'Push Man',
      shortName: 'KB +18%',
      description: 'Knockback +18% per stack.',
      rarity: 'knight',
      color: '#fff2cf',
      category: 'knight',
      tags: ['knockback'],
    },
    titan_heart: {
      key: 'titan_heart',
      name: 'Titan Heart',
      shortName: 'Max HP +8%',
      description: 'Max HP +8% per stack on pickup.',
      rarity: 'knight',
      color: '#ffd9de',
      category: 'knight',
      tags: ['hp'],
    },
    weapon_fatigue: {
      key: 'weapon_fatigue',
      name: 'Weapon Fatigue',
      shortName: 'Slow',
      description: 'Hits have a 5% chance per stack to slow enemies, plus a 2% chance per stack to briefly freeze them solid (melee or ranged).',
      rarity: 'knight',
      color: '#e7fbff',
      category: 'knight',
      tags: ['slow', 'freeze'],
    },
    generic_health_item: {
      key: 'generic_health_item',
      name: 'Generic Health',
      shortName: 'Heal 5%',
      description: 'On kill, restore 5% of your current HP per stack, capped by max HP. With another healing item, overhealing has a chance to grant a shield.',
      rarity: 'knight',
      color: '#d9ffe5',
      category: 'knight',
      tags: ['heal', 'charge'],
    },
    snake_knife: {
      key: 'snake_knife',
      name: 'Snake Knife',
      shortName: 'Poison +10%',
      description: 'Hits have a 10% chance per stack to poison enemies (melee or ranged). Poison has a natural 1% chance to spread to a nearby foe each tick.',
      rarity: 'knight',
      color: '#d7ffbf',
      category: 'knight',
      tags: ['poison'],
    },
    confuse_ray: {
      key: 'confuse_ray',
      name: 'Confuse Ray',
      shortName: 'Stun 15%',
      description: 'Hits have a 15% chance per stack to stun enemies no matter what, capped at 75%. Every hit also has a flat 5% chance to make the enemy think you turned invisible (it loses track of you and wanders).',
      rarity: 'knight',
      color: '#d8f0ff',
      category: 'knight',
      tags: ['stun', 'hit'],
    },
    overclocked_watch: {
      key: 'overclocked_watch',
      name: 'Overclocked Watch',
      shortName: 'Charge x2',
      description: '20% chance per stack for kill charge progress to count twice instead of once. Also shaves 2% per stack off the buff enemies gain over time (capped at 30%).',
      rarity: 'knight',
      color: '#f0fbff',
      category: 'knight',
      tags: ['charge', 'kill'],
    },
    charged_adapter: {
      key: 'charged_adapter',
      tool: true,
      name: 'Charged Adapter',
      shortName: 'Warp F',
      description: 'Charge requirement -1 per stack. When charged, press its tool slot key (outside boss rooms) to spend 50% coins and warp to the ladder room (next floor path).',
      rarity: 'wizard',
      color: '#b66cff',
      category: 'wizard',
      tags: ['charge', 'mobility'],
    },
    pew_pew_box: {
      key: 'pew_pew_box',
      tool: true,
      name: 'Pew Pew Box',
      shortName: 'Missile Box',
      description: 'Tool. Fire homing missiles for 8 seconds. Extra stacks add duration, missiles per volley, and missile damage.',
      rarity: 'wizard',
      color: '#ffe06f',
      accent: '#ff8f3d',
      category: 'wizard',
      tags: ['tools', 'projectile', 'missile', 'wizard'],
    },
    skizzard_tail: {
      key: 'skizzard_tail',
      tool: true,
      name: 'Skizzard Tail',
      shortName: 'Regen',
      description: 'Tool. Regenerate health for 5 seconds. Extra stacks add duration and stronger healing ticks.',
      rarity: 'wizard',
      color: '#8fffd2',
      accent: '#6fd7ff',
      category: 'wizard',
      tags: ['tools', 'regen', 'heal', 'wizard'],
    },
    zap_to_extreme: {
      key: 'zap_to_extreme',
      tool: true,
      name: 'Zap to the Extreme',
      shortName: 'Zap Extreme',
      description: 'Tool. Chain lightning around you for 10 seconds. Extra stacks add duration, range, targets, and damage.',
      rarity: 'wizard',
      color: '#8dd4ff',
      accent: '#f4fbff',
      category: 'wizard',
      tags: ['tools', 'lightning', 'aoe', 'wizard'],
    },
    panic_button: {
      key: 'panic_button',
      tool: true,
      name: 'Panic Button',
      shortName: 'Panic',
      description: 'Tool. Clear statuses, shove enemies away, and gain brief invulnerability. Extra stacks increase radius, shove, damage, stun, and invulnerability time.',
      rarity: 'wizard',
      color: '#f4f6fb',
      accent: '#ff6b7f',
      category: 'wizard',
      tags: ['tools', 'defense', 'knockback', 'wizard'],
    },
    mid_sweepy_box: {
      key: 'mid_sweepy_box',
      tool: true,
      name: 'Mid Sweepy Box',
      shortName: 'Sweep Mines',
      description: 'Tool. Sweep thorn mines around you for 6 seconds. Extra stacks add duration, mines per tick, blast size, damage, and bleed.',
      rarity: 'wizard',
      color: '#ffd7e2',
      accent: '#ff6e8b',
      category: 'wizard',
      tags: ['tools', 'bleed', 'mine', 'wizard'],
    },
    sparkle_charm: {
      key: 'sparkle_charm',
      tool: true,
      name: 'Sparkle Charm',
      shortName: 'Sparkle',
      description: 'Tool. Sparkle the nearest 5 enemies for 6 seconds. Every hit against a sparkled enemy is a guaranteed crit. Extra stacks mark more enemies for longer.',
      rarity: 'wizard',
      color: '#ffe8a3',
      accent: '#ffd05a',
      category: 'wizard',
      tags: ['tools', 'crit', 'wizard'],
    },
    churu_stick: {
      key: 'churu_stick',
      tool: true,
      name: 'Churu Stick',
      shortName: 'Heal 30%',
      description: 'Tool. Instantly heal 30% of max HP. Long 40s cooldown. Auto-fires when health drops below 15%. Extra stacks shorten the cooldown.',
      rarity: 'wizard',
      color: '#ffb6d5',
      accent: '#ff7eb0',
      category: 'wizard',
      tags: ['tools', 'heal', 'regen', 'wizard'],
    },
    explosive_jelly: {
      key: 'explosive_jelly',
      name: 'Explosive Jelly',
      shortName: 'AOE +20%',
      description: 'All player AOE ranges are increased by 20% per stack.',
      rarity: 'wizard',
      color: '#ffb27d',
      category: 'wizard',
      tags: ['aoe', 'wizard'],
    },
    dragon_orb: {
      key: 'dragon_orb',
      name: 'Dragon Orb',
      shortName: 'Beam Chain',
      description: 'Beam damage +35% per stack, beam width increases per stack, and beam hits chain to up to 2 nearby enemies.',
      rarity: 'wizard',
      color: '#b77dff',
      category: 'wizard',
      tags: ['beam', 'spell', 'wizard'],
    },
    overstimulate: {
      key: 'overstimulate',
      name: 'Overstimulate',
      shortName: 'Status Stun',
      description: 'Hits have a 20% chance per stack to stun enemies with 2 or more statuses, and the stun lasts twice as long.',
      rarity: 'wizard',
      color: '#ffcf80',
      category: 'wizard',
      tags: ['stun', 'status', 'wizard'],
    },
    grave_zone: {
      key: 'grave_zone',
      name: 'Grave Zone',
      shortName: 'Push Zone',
      description: 'On kill, 25% chance per stack to create a 2.5-second knockback field that makes enemies inside take +8% player damage per stack, deals small AOE damage (2% chance to freeze), hurls rock debris, and drains 20% of its damage back as healing. Above 4 stacks, chance loops to 80% and cold enemies take +50% damage.',
      rarity: 'wizard',
      color: '#c9b3ff',
      category: 'wizard',
      tags: ['aoe', 'knockback', 'wizard'],
    },
    ricocete: {
      key: 'ricocete',
      name: 'Ricocete',
      shortName: 'Bounce +1',
      description: 'Player projectiles get 1 guaranteed wall bounce, plus a 50% chance per stack for an extra bounce.',
      rarity: 'wizard',
      color: '#9be7ff',
      accent: '#b77dff',
      category: 'wizard',
      tags: ['projectile', 'bounce', 'wizard'],
    },
    drink_master: {
      key: 'drink_master',
      name: 'Potion Master',
      shortName: 'Heal +20% / x2',
      description: 'Potions and other healing sources are 20% more effective per stack. Potions also have a 50% chance per stack to apply twice, capped at 100%.',
      rarity: 'wizard',
      color: '#6dff9b',
      accent: '#f4f6fb',
      category: 'wizard',
      tags: ['healing', 'potion', 'wizard'],
    },
    turtle_shell: {
      key: 'turtle_shell',
      name: 'Turtle Shell',
      shortName: 'Shell +5%',
      description: 'Move speed +5% per stack.',
      rarity: 'knight',
      color: '#d2ffd8',
      category: 'knight',
      tags: ['speed', 'move'],
    },
    anchor_charm: {
      key: 'anchor_charm',
      name: 'Anchor Charm',
      shortName: 'Stun Resist',
      description: 'Stun + knockback resistance per stack. Impact stuns on you last less and need harder hits or stronger knockback, and incoming knockback shoves you 12% less per stack (capped at 65% reduction).',
      rarity: 'knight',
      color: '#d7e4f2',
      category: 'knight',
      tags: ['defense', 'stun'],
    },
    iron_lung: {
      key: 'iron_lung',
      name: 'Iron Lung',
      shortName: 'Iron',
      description: 'In non-boss fights, each hit can take at most 20% max HP.',
      rarity: 'god',
      color: '#c6d4e8',
      category: 'god',
      tags: ['defense', 'god'],
    },
    pendant_of_rock: {
      key: 'pendant_of_rock',
      name: 'Pendant of Rock',
      shortName: 'Rock Pact',
      description: 'Per stack: take 1% less damage and deal 2% more rock damage (Crimson Smash debris, Wall of Toph, Laser Shockwave and other rock attacks).',
      rarity: 'god',
      color: '#b89272',
      accent: '#e6c9a3',
      category: 'god',
      tags: ['defense', 'damage', 'rock', 'god'],
    },
    iron_helm: {
      key: 'iron_helm',
      tool: true,
      name: 'Iron Helm',
      shortName: 'Diamond Shield',
      description: 'Tool. Add a diamond shield worth 50% of max HP. Reusing refreshes the shield to that amount. 120s cooldown.',
      rarity: 'god',
      color: '#c8fbff',
      accent: '#f5feff',
      category: 'god',
      tags: ['tools', 'defense', 'shield', 'god'],
    },
    oracles_lens: {
      key: 'oracles_lens',
      name: "Oracle's Lens",
      shortName: 'Oracle',
      description: 'Having at least one doubles critical hit chance, and crits scale harder with your crit chance.',
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
      description: '15% chance per stack to launch 2 fast homing missiles when using R. Missiles fly 3x faster, deal +10% damage, and have a 5% chance to ignite.',
      rarity: 'god',
      color: '#ffe06f',
      category: 'god',
      tags: ['missile', 'god', 'smash'],
    },
    wizards_paw: {
      key: 'wizards_paw',
      name: "Wizard's Paw",
      shortName: 'Paw',
      description: 'Choose 2 stats to increase by 50%. Duplicated pickups grant another choice.',
      opensUi: 'wizardPaw',
      rarity: 'god',
      color: '#ffcf80',
      category: 'god',
      tags: ['god', 'stat'],
    },
    jesters_dice: {
      key: 'jesters_dice',
      name: "Jester's Dice",
      shortName: 'Dice',
      description: 'Skip 3 floors and gain 10 random items per stack collected.',
      rarity: 'god',
      color: '#ff8bd8',
      category: 'god',
      tags: ['god', 'chaos'],
    },
    shield_of_aegis: {
      key: 'shield_of_aegis',
      name: 'Shield of Aegis',
      shortName: 'DEF +20%',
      description: 'Defense +20% per stack (capped with other defense at 85%). On every floor, heal 2% max HP and gain a 50-point shield per stack.',
      rarity: 'god',
      color: '#ffe7a8',
      category: 'god',
      tags: ['god', 'defense'],
    },
    pendant_of_kronos: {
      key: 'pendant_of_kronos',
      name: 'Pendant of Kronos',
      shortName: 'Crit+Dmg/God',
      description: 'For each god (yellow) item you have: +5% crit chance and +2.5% damage. Also +5% damage to bosses.',
      rarity: 'god',
      color: '#d8c6ff',
      category: 'god',
      tags: ['god', 'crit'],
    },
    robot_arm: {
      key: 'robot_arm',
      name: 'Robot Arm',
      shortName: 'Auto x8 Spd',
      description: 'Have Alvin the AI do it While in combat and charged attack speed x8 and your primary attack automatically fires once. Starts ready, then recharges on 8 kills.',
      rarity: 'god',
      color: '#c0e8ff',
      category: 'god',
      tags: ['god', 'speed', 'charge'],
    },
    rich_mans_luck: {
      key: 'rich_mans_luck',
      name: "Rich Man's Luck",
      shortName: 'Shop + Drops',
      description: 'Adds +1 relic offer to shops per stack, and item drops from vases and enemies are 5% more likely per stack.',
      rarity: 'god',
      color: '#ffd76d',
      accent: '#79ffbf',
      category: 'god',
      tags: ['god', 'loot', 'shop'],
    },
    rich_mans_blues: {
      key: 'rich_mans_blues',
      name: "Rich Man's Blues",
      shortName: 'Loop Crystals',
      description: "King's lament: I could lose every penny. Gain 25 Loop Crystals plus 2 per floor counted this run when collected. Each stack grants +1 Loop Crystal after every boss kill.",
      rarity: 'blue',
      color: '#4da8ff',
      accent: '#b9e3ff',
      category: 'artificer',
      tags: ['artificer', 'loot', 'loop'],
    },
    artificer_charger: {
      key: 'artificer_charger',
      name: 'Artificer Charger',
      shortName: 'Holy Light',
      description: 'A great tool of the cult; in holy hands it can send light. Doubles your current level, improves every future level gain, and makes your sprite and AOEs 26.7% larger. Lasers are 5% wider. Picking up a second one costs 1 Loop Crystal to contain — with no crystals, it does nothing.',
      rarity: 'blue',
      color: '#69c8ff',
      accent: '#fff3ae',
      category: 'artificer',
      tags: ['artificer', 'level', 'aoe', 'beam'],
    },
    cloak_of_naked_king: {
      key: 'cloak_of_naked_king',
      name: 'Cloak of the Naked King',
      shortName: 'Cursed Guard',
      description: '(He has lost it.) Negative status effects are 20% worse per stack, including damage, duration, effectiveness, and proc chance. Reduce incoming damage by 10 points per stack, plus 1 point per owned tool stack, equipped or not.',
      rarity: 'blue',
      color: '#3289d6',
      accent: '#d9f2ff',
      category: 'artificer',
      tags: ['artificer', 'defense', 'status', 'tools'],
    },
    moggys_coat: {
      key: 'moggys_coat',
      name: "Moggy's Coat",
      shortName: 'Ambush Drain',
      description: "Shed by the assassin himself. Killing an enemy while hidden primes the coat: the next combat opens with Dark Drain on every enemy for its first 2 seconds. Each stack adds +1 drain stack.",
      rarity: 'blue',
      color: '#5a78d6',
      accent: '#ff5a5a',
      category: 'artificer',
      tags: ['artificer', 'drain', 'stealth', 'status'],
    },
    veggys_pendant: {
      key: 'veggys_pendant',
      name: "Veggy's Pendant",
      shortName: 'Pendant',
      description: 'On pickup, gain +4% max HP per stack. Every 3 rooms entered, gain +10% max HP per stack and heal for 50% of the max HP gained.',
      rarity: 'wizard',
      color: '#a0e87a',
      accent: '#5fcc2a',
      category: 'wizard',
      tags: ['hp', 'scaling', 'wizard'],
    },
    procy_pickle: {
      key: 'procy_pickle',
      name: 'Procy Pickle',
      shortName: 'Pickle',
      description: 'A briny green veggy that loves a chain reaction. +5% per stack chance, whenever you crit or a status-applying item procs, to spread the hit enemy’s statuses to nearby foes. Activating a tool also has a 2% per stack × per tool you own chance to slap nearby enemies with self-spreading poison.',
      rarity: 'god',
      color: '#7bd44f',
      accent: '#cdf58f',
      category: 'god',
      tags: ['poison', 'status', 'spread', 'tools', 'crit', 'god'],
    },
    princes_glasses: {
      key: 'princes_glasses',
      name: "Prince's Glasses",
      shortName: 'Map Vision',
      description: 'Pink, not that anything is wrong with that. Upgrades the minimap: skull markers for traps, enemy dots, green for healing, yellow for coins. First stack grants +5% crit chance and +10% defense; each extra stack adds +2% to both.',
      rarity: 'wizard',
      color: '#ff9de8',
      accent: '#ff55cc',
      category: 'wizard',
      tags: ['minimap', 'utility'],
    },
    mateos_bag: {
      key: 'mateos_bag',
      tool: true,
      name: "Mateo's Bag",
      shortName: 'Bag',
      description: 'Carry potions instead of consuming them immediately. First stack: +3 slots. Each additional stack: +1 slot. Stored potions heal +10% per stack and auto-trigger below 10% health. If empty, entering a shop stores 1 minor potion once per floor.',
      rarity: 'wizard',
      color: '#b49cff',
      category: 'wizard',
      tags: ['potion', 'utility', 'wizard'],
    },
    extra_battery: {
      key: 'extra_battery',
      name: 'Extra Battery',
      shortName: 'Move +1 Stack',
      description: 'Opens a selection of your moves — pick one to grant it +1 max stack. Duplicated pickups grant another choice.',
      opensUi: 'extraBattery',
      rarity: 'wizard',
      color: '#cfd7ff',
      accent: '#7a9dff',
      category: 'wizard',
      tags: ['move', 'stack', 'utility', 'wizard'],
    },
    mooggy_zoomies: {
      key: 'mooggy_zoomies',
      name: 'Mooggy Zoomies',
      shortName: 'Proj Tech',
      description: 'Projectile speed +12% per stack, projectile lifetime/range +10% per stack, and projectile magnetism +2% per stack.',
      rarity: 'wizard',
      color: '#ff3348',
      accent: '#f4f6fb',
      category: 'wizard',
      tags: ['projectile', 'speed', 'wizard'],
    },
    el_bartos_cape: {
      key: 'el_bartos_cape',
      tool: true,
      name: "El Barto's Cape",
      shortName: 'CAPE',
      description: 'Tool. Activate for 10 seconds; you are invisible for the first half and move 20% faster while active. Your first hit while active is a guaranteed crit that applies bleed and poison. Each stack adds +5 seconds and a +10% chance on use to leave damaging El Barto graffiti; graffiti is guaranteed at 3+ stacks.',
      rarity: 'god',
      color: '#ff5b78',
      accent: '#ffe0b8',
      category: 'god',
      tags: ['tools', 'stealth', 'god'],
    },
    voucher_white: {
      key: 'voucher_white',
      name: 'White Voucher',
      shortName: 'White Voucher',
      description: 'Redeem at a shop to choose any Knight-class relic.',
      rarity: 'knight',
      color: '#f4f6fb',
      accent: '#9bd9ff',
      category: 'knight',
      voucher: true,
      tags: ['voucher', 'choice', 'knight'],
    },
    voucher_purple: {
      key: 'voucher_purple',
      name: 'Purple Voucher',
      shortName: 'Purple Voucher',
      description: 'Redeem at a shop to choose any Wizard-class relic.',
      rarity: 'wizard',
      color: '#b77dff',
      accent: '#f4d4ff',
      category: 'wizard',
      voucher: true,
      tags: ['voucher', 'choice', 'wizard'],
    },
    voucher_yellow: {
      key: 'voucher_yellow',
      name: 'Yellow Voucher',
      shortName: 'Yellow Voucher',
      description: 'Redeem at a shop to choose any God-class relic.',
      rarity: 'god',
      color: '#ffd23f',
      accent: '#fff6cf',
      category: 'god',
      voucher: true,
      tags: ['voucher', 'choice', 'god'],
    },
    forge_voucher: {
      key: 'forge_voucher',
      name: 'Forge Voucher',
      shortName: 'Forge x5',
      description: 'Redeem at the Forge for 5 free weapon or move upgrade steps before XP or gold is spent.',
      rarity: 'knight',
      color: '#ffb840',
      accent: '#fff1a8',
      category: 'knight',
      voucher: true,
      tags: ['voucher', 'forge', 'upgrade', 'utility'],
    },
    // --- GREEN tier: post-loop drop-only items whose descriptions LIE. ---
    // The shown `description` is the fib; the true effect is applied in code (see
    // realNote + getItemStats / pickup hooks). Do not "fix" the descriptions to
    // match the effects — the mismatch is the point.
    naked_kings_last_penny: {
      key: 'naked_kings_last_penny',
      name: "Naked King's Last Penny",
      shortName: 'Last Penny',
      description: 'Gives you one extra coin per stack whenever you pick up gold. Every penny counts when the crown is all you have left.',
      // realNote: +7 gold the first time you reveal a room (+20% per extra stack),
      // and every coin pickup re-plays the gold-gain sound and grants +1 coin per stack.
      rarity: 'green',
      color: '#3ef07a',
      accent: '#ffe07a',
      category: 'green',
      tags: ['coin', 'loot', 'lie'],
    },
    foleys_irish_newyork_charm: {
      key: 'foleys_irish_newyork_charm',
      name: "Foley's Irish NewYork Charm",
      shortName: 'Foley Charm',
      description: 'A bit on the nose and runny. Makes you hit something when you attack by 0.2%. Makes you rich — we are all gonna be rich. If he has two yachts, we will have ten.',
      // realNote: just gives +15 max HP and +1 on-hit damage per stack. Doesn't do much.
      rarity: 'green',
      color: '#3ef07a',
      accent: '#7fffb0',
      category: 'green',
      tags: ['health', 'damage', 'hit', 'lie'],
    },
    paul_cunts_house_keys: {
      key: 'paul_cunts_house_keys',
      name: "Paul Cunt's House Keys",
      shortName: 'House Keys',
      description: 'Go get him! Address in the URL metadata!! Makes you better and stronger than everyone, and so good with money. ;)',
      // realNote: once per floor you may "strike a rival" from the inventory Rivals
      // tab — remotely damaging that rival (or killing a random enemy near them).
      rarity: 'green',
      color: '#3ef07a',
      accent: '#9bd84f',
      category: 'green',
      tags: ['rival', 'utility', 'lie'],
    },
  };
// Scrolls are their own system, kept out of ITEM_DEFS / the relic pools. They are
// registered into the item registry (see createItemRegistry) so runtime lookups —
// icons, rarity, tags, names, shop offers, save/load — resolve scroll keys the same
// way as relics, but they never appear in the relic codex tab or random relic pools.
// Each scroll resolves its selection popup on pickup/purchase (see enqueueScrollSelection).
export const SCROLL_DEFS = {
    scroll_reroll: {
      key: 'scroll_reroll',
      name: 'Scroll of Reroll',
      shortName: 'Reroll',
      description: 'Choose one owned relic and replace one stack with a new relic of the same rarity.',
      rarity: 'knight',
      color: '#d9f2ff',
      category: 'knight',
      tool: true,
      scroll: true,
      opensUi: 'scrollControl',
      tags: ['scroll', 'control', 'choice'],
    },
    scroll_branching: {
      key: 'scroll_branching',
      name: 'Scroll of Branching',
      shortName: 'Branch',
      description: 'Choose a relic. The next reward of that relic rarity becomes your chosen relic.',
      rarity: 'knight',
      color: '#d8ffc5',
      category: 'knight',
      tool: true,
      scroll: true,
      opensUi: 'scrollControl',
      tags: ['scroll', 'control', 'choice'],
    },
    scroll_replace: {
      key: 'scroll_replace',
      name: 'Scroll of Replace',
      shortName: 'Replace',
      description: 'Choose an unwanted relic, then choose a same-rarity replacement. Future rewards swap it.',
      rarity: 'knight',
      color: '#ffd9d9',
      category: 'knight',
      tool: true,
      scroll: true,
      opensUi: 'scrollControl',
      tags: ['scroll', 'control', 'choice'],
    },
    scroll_abundance: {
      key: 'scroll_abundance',
      name: 'Scroll of Abundance',
      shortName: 'Abundance',
      description: 'Choose two relics. Every two floors has a chance to grant one selected relic or one random relic.',
      rarity: 'knight',
      color: '#fff2a8',
      category: 'knight',
      tool: true,
      scroll: true,
      opensUi: 'scrollControl',
      tags: ['scroll', 'control', 'choice'],
    },
    scroll_pool_weight: {
      key: 'scroll_pool_weight',
      name: 'Scroll of Pool Weight',
      shortName: 'Weight',
      description: 'Choose one of 4 relics. Future rewards favor that relic for 3 floors, with rarity-scaled strength.',
      rarity: 'knight',
      color: '#c8e2ff',
      category: 'knight',
      tool: true,
      scroll: true,
      opensUi: 'scrollControl',
      tags: ['scroll', 'control', 'choice'],
    },
    scroll_ego: {
      key: 'scroll_ego',
      name: 'Scroll of Ego',
      shortName: 'Ego',
      description: 'For this floor, relics already in your build are 10% more common.',
      rarity: 'knight',
      color: '#f4d4ff',
      category: 'knight',
      tool: true,
      scroll: true,
      opensUi: 'scrollControl',
      tags: ['scroll', 'control', 'build'],
    },
  };
export const SCROLL_KEYS = Object.keys(SCROLL_DEFS);
// Rarity -> name/description text color. GOD is the top tier and renders gold (#ffd23f).
// ('white' and 'purple'/'red' are legacy aliases of knight/wizard/god kept for old save data.)
export const RARITY_NAME_COLORS = {
    knight: '#f4f6fb',
    white: '#f4f6fb',
    wizard: '#b77dff',
    purple: '#b77dff',
    god: '#ffd23f',   // GOD tier (gold/yellow)
    red: '#ffd23f',   // legacy alias of god
    blue: '#58b7ff',
    princess: '#ff9de8',
    green: '#3ef07a', // GREEN tier — post-loop "lying" items
  };
export const RARITY_DISPLAY_NAMES = {
    knight: 'Knight',
    white: 'Knight',
    wizard: 'Wizard',
    purple: 'Wizard',
    god: 'God',
    red: 'God',
    blue: 'Artificer',
    artificer: 'Artificer',
    princess: 'Princess',
    green: 'Knave',
  };
export function getRarityDisplayName(rarity) {
  const key = String(rarity || '').toLowerCase();
  return RARITY_DISPLAY_NAMES[key] || key;
}
// Single-glyph icon per rarity tier — used on the HUD rarity-count badges and
// the item toast fallback icon so a tier always reads the same symbol.
export const RARITY_GLYPHS = {
    knight: '⚔',  // ⚔ crossed swords
    white: '⚔',
    wizard: '✳',  // ✳ sparkle
    purple: '✳',
    blue: '⚒',    // ⚒ hammer & pick (Artificer)
    artificer: '⚒',
    green: '☘',   // ☘ shamrock (Knave)
    god: '✦',     // ✦ star (God)
    red: '✦',
    princess: '♥',// ♥ heart
  };
export function getRarityGlyph(rarity) {
  const key = String(rarity || '').toLowerCase();
  return RARITY_GLYPHS[key] || '';
}
export const SHOP_RARITY_PRICE_MULTIPLIERS = {
    knight: 1,
    white: 1,
    wizard: 2.15,
    purple: 2.15,
    god: 4.75,
    red: 4.75,
    blue: 4.75,
    green: 3.0, // greens never reach the shop (drop-only), but priced as a sink in case forge/voucher math reads this
  };
// A shop has a 50% chance to feature a guaranteed god-tier item. It is a
// deliberate splurge: priced at the normal god multiplier (4.75x) plus this
// premium on top, so it is a meaningful gold sink rather than a cheap god roll.
export const SHOP_FEATURED_GOD_PRICE_PREMIUM = 1.6;
export const SHOP_FEATURED_GOD_CHANCE = 0.5;
export const ITEM_KEYS = Object.keys(ITEM_DEFS);
// Legacy alias retained for call sites that reference SCROLL_OF_CONTROL_KEYS; the
// canonical list is SCROLL_KEYS (derived from SCROLL_DEFS).
export const SCROLL_OF_CONTROL_KEYS = SCROLL_KEYS;
export const LEGACY_VOUCHER_KEY = 'voucher';
export const FORGE_VOUCHER_KEY = 'forge_voucher';
export const FORGE_VOUCHER_UPGRADE_STEPS = 5;
export const VOUCHER_TYPES = [
  { id: 'white', key: 'voucher_white', label: 'White', classLabel: 'Knight', rarity: 'knight', color: '#f4f6fb' },
  { id: 'purple', key: 'voucher_purple', label: 'Purple', classLabel: 'Wizard', rarity: 'wizard', color: '#b77dff' },
  { id: 'yellow', key: 'voucher_yellow', label: 'Yellow', classLabel: 'God', rarity: 'god', color: '#ffd23f' },
];
export const VOUCHER_KEYS = VOUCHER_TYPES.map(voucher => voucher.key);
// Compatibility aliases for older call sites and save migrations.
export const VOUCHER_KEY = VOUCHER_KEYS[0];
export const VOUCHER_COLORS = VOUCHER_TYPES;
export const SANDBOX_ENEMY_TYPES = [
    'hunter', 'charger', 'laser', 'knave', 'sniper', 'machine_gunner',
    'golem', 'cult_mage', 'cult_follower', 'summoner', 'shield_unit', 'healer', 'boss_spawner',
    'queen_cult', 'bulk_golem', 'artificer_knave', 'antony_blemmye', 'handsome_devil', 'god', 'mirror_knight', 'mooggy',
  ];
export const ITEM_DROP_WEIGHTS = [
    ['neo_knife', 60],
  ['tooth_of_thorn', 24],
    ['tough_bandaid', 22],
    ['orb_of_blood', 28],
    ['hemes_scarf', 12],
    ['insurance', 18],
    ['gold_vac', 12],
    ['copycat_charm', 12],
    ['crit_charm', 24],
    ['attack_servo', 22],
  ['enemy_magnet', 28],
    ['keen_eye', 20],
    ['chrono_spring', 20],
    ['scholar_seal', 18],
    ['scholar_cap', 12],
    ['push_man', 18],
    ['titan_heart', 18],
    ['charged_adapter', 18],
    ['pew_pew_box', 18],
    ['skizzard_tail', 12],
    ['zap_to_extreme', 10],
    ['panic_button', 10],
    ['mid_sweepy_box', 12],
    ['churu_stick', 10],
    ['explosive_jelly', 12],
    ['dragon_orb', 14],
    ['ricocete', 20],
    ['drink_master', 14],
    ['turtle_shell', 24],
    ['anchor_charm', 18],
    ['iron_lung', 10],
    ['iron_helm', 6],
    ['oracles_lens', 8],
    ['homing_missile', 10],
    ['wizards_paw', 6],
    ['jesters_dice', 4],
    ['shield_of_aegis', 4],
    ['pendant_of_kronos', 5],
    ['robot_arm', 3],
    ['rich_mans_luck', 5],
    ['princes_glasses', 14],
    ['procy_pickle', 5],
    ['veggys_pendant', 0],
    ['mateos_bag', 10],
    ['extra_battery', 10],
    ['mooggy_zoomies', 14],
    ['el_bartos_cape', 6],
    ['voucher_white', 5],
    ['voucher_purple', 2],
    ['voucher_yellow', 1],
  ];
export const ITEM_RARITY_DROP_WEIGHTS = {
  knight: 80,
  wizard: 15,
  god: 5,
};
export const ELITE_ITEM_RARITY_DROP_WEIGHTS = {
  knight: 65,
  wizard: 25,
  god: 10,
};

function buildTierNormalizedDropWeights(entries, rarityWeights) {
  const tierTotals = {};
  entries.forEach(([key, weight]) => {
    const rarity = ITEM_DEFS[key]?.rarity || 'knight';
    tierTotals[rarity] = (tierTotals[rarity] || 0) + Math.max(0, Number(weight) || 0);
  });
  return entries.map(([key, weight]) => {
    const rarity = ITEM_DEFS[key]?.rarity || 'knight';
    const tierTotal = tierTotals[rarity] || 0;
    const tierWeight = Math.max(0, Number(rarityWeights[rarity]) || 0);
    return [key, tierTotal > 0 ? tierWeight * Math.max(0, Number(weight) || 0) / tierTotal : 0];
  });
}

export const ITEM_DROP_TABLE = Neo.buildWeightTable(
  buildTierNormalizedDropWeights(ITEM_DROP_WEIGHTS, ITEM_RARITY_DROP_WEIGHTS)
);
export const ELITE_ITEM_DROP_TABLE = Neo.buildWeightTable(
  buildTierNormalizedDropWeights(ITEM_DROP_WEIGHTS, ELITE_ITEM_RARITY_DROP_WEIGHTS)
);
export const ELITE_INVENTORY_POOL = [
    'neo_knife',
  'tooth_of_thorn',
    'tough_bandaid',
    'gold_vac',
    'copycat_charm',
    'orb_of_blood',
    'insurance',
    'crit_charm',
    'attack_servo',
  'enemy_magnet',
    'scholar_cap',
    'charged_adapter',
    'explosive_jelly',
    'dragon_orb',
    'ricocete',
    'drink_master',
    'turtle_shell',
    'anchor_charm',
    'iron_lung',
    'iron_helm',
    'oracles_lens',
    'shield_of_aegis',
    'pendant_of_kronos',
    'rich_mans_luck',
    'extra_battery',
    'el_bartos_cape',
  ];
export const WHITE_ITEM_POOL = ITEM_KEYS.filter(key => ITEM_DEFS[key]?.rarity === 'knight' && !ITEM_DEFS[key]?.voucher);
export const BLUE_ITEM_POOL = ITEM_KEYS.filter(key => ITEM_DEFS[key]?.rarity === 'blue');
// Green tier — drop-only items that only appear from barrels/broken wood once the
// player has looped at least once. Never in shops, reward picks, or normal drops.
export const GREEN_ITEM_POOL = ITEM_KEYS.filter(key => ITEM_DEFS[key]?.rarity === 'green');
export const ELITE_TYPE_DEFS = {
    // Body rolls
    knight: { label: 'Knight', color: '#dfe7ff' },
    knave: { label: 'Knave', color: '#9aa6c4' },
    // Power rolls
    lazered: { label: 'Lazered', color: '#78d7ff' },
    enflamed: { label: 'Enflamed', color: '#ff7a3c' },
    breezy: { label: 'Breezy', color: '#7fd9ff' },
    gross: { label: 'Gross', color: '#9bd84f' },
    nothing: { label: 'Nothing', color: '#c9cdd6' },
    giant: { label: 'Giant', color: '#ffd27d' },
    blessed: { label: 'Blessed', color: '#f2f6ff' },
    // Legacy affixes kept for back-compat with in-flight elites
    burning: { label: 'Burning', color: '#ff9a3c' },
    bleeding: { label: 'Bleeding', color: '#ff4256' },
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
    charName: document.getElementById('charName'),
    objective: document.getElementById('objective'),
    objectiveTracker: document.getElementById('objectiveTracker'),
    objectiveRoomLabel: document.getElementById('objectiveRoomLabel'),
    objectiveToggle: document.getElementById('objectiveToggle'),
    objectiveClose: document.getElementById('objectiveClose'),
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
    deadFloorLabel: document.getElementById('deadFloorLabel'),
    deadLevel: document.getElementById('deadLevel'),
    deadKills: document.getElementById('deadKills'),
    deadTime: document.getElementById('deadTime'),
    deadCoins: document.getElementById('deadCoins'),
    deadCoinIcon: document.getElementById('deadCoinIcon'),
    deadLoopCrystals: document.getElementById('deadLoopCrystals'),
    deadLoopIcon: document.getElementById('deadLoopIcon'),
    deadDifficulty: document.getElementById('deadDifficulty'),
    deadDifficultyIcon: document.getElementById('deadDifficultyIcon'),
    deadItems: document.getElementById('deadItems'),
    deadItemsPrev: document.getElementById('deadItemsPrev'),
    deadItemsNext: document.getElementById('deadItemsNext'),
    deadItemsPage: document.getElementById('deadItemsPage'),
    deadRecords: document.getElementById('deadRecords'),
    deadUnlocksWrap: document.getElementById('deadUnlocksWrap'),
    deadUnlocks: document.getElementById('deadUnlocks'),
    deadHeroProgress: document.getElementById('deadHeroProgress'),
    deadAchProgress: document.getElementById('deadAchProgress'),
    deadActions: [...document.querySelectorAll('#dead [data-dead-action]')],
    win: document.getElementById('win'),
    winInfo: document.getElementById('winInfo'),
    winFloor: document.getElementById('winFloor'),
    winLevel: document.getElementById('winLevel'),
    winKills: document.getElementById('winKills'),
    winTime: document.getElementById('winTime'),
    winCoins: document.getElementById('winCoins'),
    winCoinIcon: document.getElementById('winCoinIcon'),
    winDifficulty: document.getElementById('winDifficulty'),
    winCrystalsEarned: document.getElementById('winCrystalsEarned'),
    winCrystalsTotal: document.getElementById('winCrystalsTotal'),
    winUnlocksWrap: document.getElementById('winUnlocksWrap'),
    winUnlocks: document.getElementById('winUnlocks'),
    winHeroProgress: document.getElementById('winHeroProgress'),
    winAchProgress: document.getElementById('winAchProgress'),
    winItems: document.getElementById('winItems'),
    winItemsPrev: document.getElementById('winItemsPrev'),
    winItemsNext: document.getElementById('winItemsNext'),
    winItemsPage: document.getElementById('winItemsPage'),
    winActions: [...document.querySelectorAll('#win [data-win-action]')],
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
    equipmentSlots: document.getElementById('equipmentSlots'),
    equipmentSlotNodes: [...document.querySelectorAll('#equipmentSlots .equip-slot')],
    shopPanel: document.getElementById('shopPanel'),
    shopClose: document.getElementById('shopClose'),
    shopTabs: [...document.querySelectorAll('#shopPanel .shop-tab')],
    shopItems: document.getElementById('shopItems'),
    shopWeapons: document.getElementById('shopWeapons'),
    shopMoves: document.getElementById('shopMoves'),
    shopTrades: document.getElementById('shopTrades'),
    shopHeals: document.getElementById('shopHeals'),
    shopVoucherBanner: document.getElementById('shopVoucherBanner'),
    shopVoucherBannerSub: document.getElementById('shopVoucherBannerSub'),
    shopVoucherRedeem: document.getElementById('shopVoucherRedeem'),
    shopCoins: document.getElementById('shopCoins'),
    invPanel: document.getElementById('invPanel'),
    invClose: document.getElementById('invClose'),
    invTabs: [...document.querySelectorAll('#invPanel .inv-tab')],
    invPlayerTabs: document.getElementById('invPlayerTabs'),
    invPlayerTabBtns: [...document.querySelectorAll('#invPlayerTabs .inv-player-tab')],
    invBuildSummary: document.getElementById('invBuildSummary'),
    wizardPawModal: document.getElementById('wizardPawModal'),
    wizardPawStats: document.getElementById('wizardPawStats'),
    wizardPawChoices: document.getElementById('wizardPawChoices'),
    wizardPawConfirm: document.getElementById('wizardPawConfirm'),
    extraBatteryModal: document.getElementById('extraBatteryModal'),
    extraBatteryCopy: document.getElementById('extraBatteryCopy'),
    extraBatteryPending: document.getElementById('extraBatteryPending'),
    extraBatteryChoices: document.getElementById('extraBatteryChoices'),
    extraBatteryLater: document.getElementById('extraBatteryLater'),
    scrollControlModal: document.getElementById('scrollControlModal'),
    scrollControlTitle: document.getElementById('scrollControlTitle'),
    scrollControlCopy: document.getElementById('scrollControlCopy'),
    scrollControlSearch: document.getElementById('scrollControlSearch'),
    scrollControlMeta: document.getElementById('scrollControlMeta'),
    scrollControlChoices: document.getElementById('scrollControlChoices'),
    scrollControlCancel: document.getElementById('scrollControlCancel'),
    scrollControlConfirm: document.getElementById('scrollControlConfirm'),
    voucherModal: document.getElementById('voucherModal'),
    voucherTitle: document.getElementById('voucherTitle'),
    voucherCopy: document.getElementById('voucherCopy'),
    voucherTypes: document.getElementById('voucherTypes'),
    voucherSearch: document.getElementById('voucherSearch'),
    voucherMeta: document.getElementById('voucherMeta'),
    voucherChoices: document.getElementById('voucherChoices'),
    voucherCancel: document.getElementById('voucherCancel'),
    voucherConfirm: document.getElementById('voucherConfirm'),
    invItemsList: document.getElementById('invItemsList'),
    invToolsList: document.getElementById('invToolsList'),
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
    bossRushNextTimer: document.getElementById('bossRushNextTimer'),
    challengeStatus: document.getElementById('challengeStatus'),
    challengeStatusLabel: document.getElementById('challengeStatusLabel'),
    challengeStatusFill: document.getElementById('challengeStatusFill'),
    treasureCollapseHud: document.getElementById('treasureCollapseHud'),
    treasureCollapseTime: document.getElementById('treasureCollapseTime'),
    treasureCollapseFill: document.getElementById('treasureCollapseFill'),
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
    firstTipOverlay: document.getElementById('firstTipOverlay'),
    firstTipIcon: document.getElementById('firstTipIcon'),
    firstTipTitle: document.getElementById('firstTipTitle'),
    firstTipBody: document.getElementById('firstTipBody'),
    firstTipBtn: document.getElementById('firstTipBtn'),
    entityDialogueLayer: document.getElementById('entityDialogueLayer'),
    playerHpFill: document.getElementById('playerHpFill'),
    playerHpTxt: document.getElementById('playerHpTxt'),
    playerXpFill: document.getElementById('playerXpFill'),
    playerXpTxt: document.getElementById('playerXpTxt'),
    coinCount: document.getElementById('coinCount'),
    hudLoopCount: document.getElementById('hudLoopCount'),
    timerDisplay: document.getElementById('timerDisplay'),
    floorDisplay: document.getElementById('floorDisplay'),
    timerLoopSlot: document.getElementById('timerLoopSlot'),
    loopNumberDisplay: document.getElementById('loopNumberDisplay'),
    difficultyDisplay: document.getElementById('difficultyDisplay'),
    difficultyLabel: document.getElementById('difficultyLabel'),
    competitiveSeedDisplay: document.getElementById('competitiveSeedDisplay'),
    competitiveSeedValue: document.getElementById('competitiveSeedValue'),
    itemRarityCounts: document.getElementById('itemRarityCounts'),
    panelItemAlert: document.getElementById('panelItemAlert'),
    seed: document.getElementById('seed'),
    go: document.getElementById('go'),
    difficultyHint: document.getElementById('difficultyHint'),
    challengePanel: document.getElementById('challengePanel'),
    challengeToggle: document.getElementById('challengeToggle'),
    challengeClose: document.getElementById('challengeClose'),
    challengeHint: document.getElementById('challengeHint'),
    continueRow: document.getElementById('continueRow'),
    continueBtn: document.getElementById('continueBtn'),
    tutorialMenuBtn: document.getElementById('tutorialMenuBtn'),
    sprEditorBtn: document.getElementById('sprEditorBtn'),
    mainCompetitiveBtn: document.getElementById('mainCompetitiveBtn'),
    competitivePanel: document.getElementById('competitivePanel'),
    competitiveClose: document.getElementById('competitiveClose'),
    competitiveServerStatus: document.getElementById('competitiveServerStatus'),
    competitiveServerRetryBtn: document.getElementById('competitiveServerRetryBtn'),
    deadCompetitiveStatus: document.getElementById('deadCompetitiveStatus'),
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
    rhInfoSearch: document.getElementById('rhInfoSearch'),
    rhInfoSort: document.getElementById('rhInfoSort'),
    rhInfoResultStatus: document.getElementById('rhInfoResultStatus'),
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
    anvilCoinIcon: document.getElementById('anvilCoinIcon'),
    anvilVoucherChip: document.getElementById('anvilVoucherChip'),
    anvilVoucherFree: document.getElementById('anvilVoucherFree'),
    anvilVoucherPlural: document.getElementById('anvilVoucherPlural'),
    anvilWeaponsTab: document.getElementById('anvilWeaponsTab'),
    anvilMovesTab: document.getElementById('anvilMovesTab'),
    anvilWeaponList: document.getElementById('anvilWeaponList'),
    anvilMoveList: document.getElementById('anvilMoveList'),
    anvilWeaponStats: document.getElementById('anvilWeaponStats'),
    anvilMoveStats: document.getElementById('anvilMoveStats'),
    anvilCostSummary: document.getElementById('anvilCostSummary'),
    anvilPayXp: document.getElementById('anvilPayXp'),
    anvilPayGold: document.getElementById('anvilPayGold'),
    anvilCancel: document.getElementById('anvilCancel'),
    anvilConfirm: document.getElementById('anvilConfirm'),
    settingsBtn: document.getElementById('settingsBtn'),
    creditsBtn: document.getElementById('creditsBtn'),
    creditsPanel: document.getElementById('creditsPanel'),
    creditsClose: document.getElementById('creditsClose'),
    altModesBtn: document.getElementById('altModesBtn'),
    altModesPanel: document.getElementById('altModesPanel'),
    altModesClose: document.getElementById('altModesClose'),
    altModeEndlessBtn: document.getElementById('altModeEndlessBtn'),
    altModePracticeBtn: document.getElementById('altModePracticeBtn'),
    altModeChallengePracticeBtn: document.getElementById('altModeChallengePracticeBtn'),
    altModeBossRushBtn: document.getElementById('altModeBossRushBtn'),
    altModeTreasureHuntBtn: document.getElementById('altModeTreasureHuntBtn'),
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
    sandboxStartItemList: document.getElementById('sandboxStartItemList'),
    sandboxEnemySearch: document.getElementById('sandboxEnemySearch'),
    sandboxItemSearch: document.getElementById('sandboxItemSearch'),
    sandboxStartItemSearch: document.getElementById('sandboxStartItemSearch'),
    sandboxStartItemsAll: document.getElementById('sandboxStartItemsAll'),
    sandboxStartItemsNone: document.getElementById('sandboxStartItemsNone'),
    sandboxEnemiesAll: document.getElementById('sandboxEnemiesAll'),
    sandboxEnemiesNone: document.getElementById('sandboxEnemiesNone'),
    sandboxItemsAll: document.getElementById('sandboxItemsAll'),
    sandboxItemsNone: document.getElementById('sandboxItemsNone'),
    sandboxGodMode: document.getElementById('sandboxGodMode'),
    sandboxUnlockEverything: document.getElementById('sandboxUnlockEverything'),
    sandboxMoveLoadout: document.getElementById('sandboxMoveLoadout'),
    sandboxWeaponLoadout: document.getElementById('sandboxWeaponLoadout'),
    customCharacterPanel: document.getElementById('customCharacterPanel'),
    customCharacterBackdrop: document.getElementById('customCharacterBackdrop'),
    customCharacterClose: document.getElementById('customCharacterClose'),
    customCharacterName: document.getElementById('customCharacterName'),
    customCharacterMoveLoadout: document.getElementById('customCharacterMoveLoadout'),
    customCharacterWeaponLoadout: document.getElementById('customCharacterWeaponLoadout'),
    customCharacterRelicList: document.getElementById('customCharacterRelicList'),
    customCharacterReset: document.getElementById('customCharacterReset'),
    customCharacterRemove: document.getElementById('customCharacterRemove'),
    customCharacterSaveClose: document.getElementById('customCharacterSaveClose'),
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
    skillKeys: {
      dash: document.querySelector('[data-skill="dash"] .skill-key'),
      melee: document.querySelector('[data-skill="melee"] .skill-key'),
      laser: document.querySelector('[data-skill="laser"] .skill-key'),
      smash: document.querySelector('[data-skill="smash"] .skill-key'),
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
    startingItems: {},
    startingLevel: 1,
    unlockEverything: false,
    // '' for a slot means "use the character default" for that move slot.
    moveLoadout: { melee: '', laser: '', smash: '', dash: '' },
    // '' means "use the character default" for the starting weapon.
    weaponLoadout: { weapon: '' },
  };
  // sandboxSettings initial value (metaProgress/tutorialState set later in game-state.js)
  Neo.sandboxSettings = { ...SANDBOX_DEFAULT_SETTINGS };
  Neo.PLAYER_SLOT_CONFIG = PLAYER_SLOT_CONFIG;
  Neo.SANDBOX_DEFAULT_SETTINGS = SANDBOX_DEFAULT_SETTINGS;
  Neo.SANDBOX_ENEMY_TYPES = SANDBOX_ENEMY_TYPES;

  // Achievement unlocks are one-time rewards, so each newly unlocked
  // achievement grants one Loop Crystal.
  window.addEventListener('achievement:unlocked', () => {
    if (Neo.metaProgress) Neo.metaProgress.loopCrystals = Number(Neo.metaProgress.loopCrystals || 0) + 1;
    if (Neo.player && Neo.gameState === 'play') {
      Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 54, life: 1.1, text: '+1 ACHIEVEMENT LC', c: '#83f3ff' });
    }
    Neo.persistMetaSoon();
    Neo.refreshMenuState();
  });

  // Auto-pause when the window loses focus (gameplay setting, defaults on).
  window.addEventListener('blur', () => {
    if (window.NeoSettings?.shouldPauseOnBlur?.() === false) return;
    if (Neo.gameState === 'play') Neo.pauseGame();
    // If we died but haven't reached the death screen yet, the death animation is
    // still playing ('dying'). Freeze it here so we don't blow past the death moment
    // while the window is unfocused — it resumes on focus.
    else if (Neo.gameState === 'dying') Neo.windowBlurred = true;
  });
  window.addEventListener('focus', () => { Neo.windowBlurred = false; });

export const JESTER_PORTAL_ACTIVATE_DELAY = 0.44;
export const JESTER_PORTAL_TRIGGER_RADIUS = 42;
export const LADDER_TRIGGER_RADIUS = 64;
// A/B chest: stand inside one of the two choice "areas" for this long (seconds)
// to confirm the pick. The dwell radius is the size of each stand-in area.
export const AB_CHEST_DWELL_SECONDS = 2.2;
export const AB_CHEST_DWELL_RADIUS = 44;
export const REPLAY_TUTORIAL_KEY = 'neonyke:replayTutorialNextRun';

// Upgradeable stat schemas for the anvil panel
export const WEAPON_UPGRADEABLE_STATS = {
    damage:    { label: 'Damage',       step: 5,     min: 5,    max: 9999, xpPerStep: 15, goldPerStep: 45, format: v => Math.round(v) },
    cooldown:  { label: 'Cooldown (s)', step: -0.05, min: 0.05, max: 9999, xpPerStep: 20, goldPerStep: 60, format: v => v.toFixed(2) + 's' },
    range:     { label: 'Range',        step: 10,    min: 10,   max: 9999, xpPerStep: 13, goldPerStep: 39, format: v => Math.round(v) },
    knockback: { label: 'Knockback',    step: 30,    min: 0,    max: 9999, xpPerStep: 10, goldPerStep: 30, format: v => Math.round(v) },
  };
export const MOVE_UPGRADEABLE_STATS = {
    damage:    { label: 'Damage',       step: 5,    min: 5,   max: 9999, xpPerStep: 15, goldPerStep: 45, format: v => Math.round(v) },
    cooldown:  { label: 'Cooldown (s)', step: -0.05,min: 0.05,max: 9999, xpPerStep: 20, goldPerStep: 60, format: v => v.toFixed(2) + 's' },
    duration:  { label: 'Duration (s)', step: 0.1,  min: 0.1, max: 30,   xpPerStep: 13, goldPerStep: 39, format: v => v.toFixed(1) + 's' },
    range:     { label: 'Range / AOE',  step: 10,   min: 10,  max: 9999, xpPerStep: 13, goldPerStep: 39, format: v => Math.round(v) },
    critChance:{ label: 'Crit Chance',  step: 0.05, min: 0,   max: 1.0,  xpPerStep: 25, goldPerStep: 75, format: v => Math.round(v * 100) + '%' },
  };

// Base stat values per weapon (used to compute current upgraded value)
export const WEAPON_BASE_STATS = {
    extending_staff:          { damage: 38,   cooldown: 0.55, range: 130, knockback: 500 },
    hunters_bow:              { damage: 28,   cooldown: 0.40,             knockback: 180 },
    thorns_bleed_blade:       { damage: 32,   cooldown: 0.55, range: 90,  knockback: 120 },
    claw_gauntlets:           { damage: 26,   cooldown: 0.38, range: 85,  knockback: 90  },
    lazer_glasses:            { damage: 18,   cooldown: 3.60,             knockback: 80  },
    metao_fire_staff:         { damage: 22,   cooldown: 0.75, range: 200, knockback: 100 },
    magenta_degale:           { damage: 108,  cooldown: 1.50,             knockback: 480 },
    magenta_p90:              { damage: 22,   cooldown: 1.80,             knockback: 140 },
    gelleh_lightning_spear:{ damage: 45,   cooldown: 2.00,             knockback: 200 },
    excalibur:                { damage: 202,  cooldown: 2.00, range: 120, knockback: 600 },
    katana_excalibur_777x:    { damage: 202,  cooldown: 0.777, range: 130, knockback: 380 },
    golden_fleece:            { damage: 20,   cooldown: 0.50, range: 80,  knockback: 80  },
    void_piercer:             { damage: 55,   cooldown: 0.80,             knockback: 160 },
    princess_wand:            { damage: 30,   cooldown: 0.77, range: 120, knockback: 160 },
    sarges_hammer:            { damage: 64,   cooldown: 0.70, range: 120, knockback: 520 },
  };

// Base stat values per move
export const MOVE_BASE_STATS = {
    slash:            { damage: 32,  cooldown: 0.40, range: 90  },
    fire_balls:       { damage: 20,  cooldown: 0.75, range: 180 },
    smite:            { damage: 28,  cooldown: 0.55, range: 110 },
    narwal_fight:     { damage: 36,  cooldown: 0.55, range: 126 },
    blood_beam:       { damage: 14,  cooldown: 3.00, duration: 1.2, critChance: 0 },
    love_beam:        { damage: 14,  cooldown: 3.40, duration: 1.275, critChance: 0 },
    love_bomb_laser:  { damage: 34,  cooldown: 3.80, range: 420 },
    turtle_wave:      { damage: 55,  cooldown: 6.00, duration: 1.35 },
    power_disks:      { damage: 22,  cooldown: 1.90, range: 240 },
    blade_justice:    { damage: 60,  cooldown: 3.80, range: 80  },
    lightning_columns:{ damage: 30,  cooldown: 4.80, range: 180 },
    god_sweep:        { damage: 40,  cooldown: 7.20, range: 320 },
    crimson_smash:    { damage: 55,  cooldown: 3.80, range: 140 },
    kicky_kick:       { damage: 184, cooldown: 4.20, range: 138 },
    chaos_burst:      { damage: 30,  cooldown: 5.40, range: 100 },
    healing_zone:     { damage: 12,  cooldown: 5.00, duration: 3.0, range: 130 },
    fire_circle:      { damage: 18,  cooldown: 4.50, duration: 3.5, range: 100 },
    floor_lava:       { damage: 12,  cooldown: 5.00, duration: 4.0, range: 160 },
    dash:             { cooldown: 1.20 },
    nimrod_stomp:     { damage: 60,  cooldown: 2.50, range: 110 },
    warp:             { cooldown: 3.40 },
    zip_lightning:    { damage: 30,  cooldown: 2.00 },
    flying_unhitable: { cooldown: 18.00, duration: 15.0 },
    princess_shield:  { cooldown: 16.00 },
    cowards_way:      { cooldown: 6.00, duration: 3.0 },
    mooggy_swipe:     { damage: 44,  cooldown: 0.50, range: 130 },
    nail_shot:        { damage: 18,  cooldown: 2.80, range: 400 },
    random_pounce:   { damage: 52,  cooldown: 5.00, range: 160 },
    mooggy_zoomies:   { cooldown: 20.00, duration: 12.0 },
    mooggy_blood_beam:{ damage: 12,  cooldown: 3.20, duration: 1.3 },
    thorn_blood_beams:{ damage: 8,   cooldown: 3.60, duration: 1.4 },
    wizard_lazer:     { damage: 30,  cooldown: 4.20, duration: 1.2 },
    mooggy_hairball:  { damage: 34,  cooldown: 4.80, range: 132 },
    potion_bath:      { cooldown: 14.00, duration: 5.0, range: 150 },
    excalibur_strike: { damage: 78,  cooldown: 10.00, range: 150 },
    holy_turrets:     { damage: 26,  cooldown: 6.50, duration: 6.0, range: 360 },
    knight_slash_dash:{ damage: 42,  cooldown: 2.40, range: 240 },
    hammer_throw:     { damage: 46,  cooldown: 2.20, range: 320 },
    lightning_cross:  { damage: 30,  cooldown: 5.50 },
    hammer_smash:     { damage: 58,  cooldown: 4.00, range: 150 },
    death_ball:       { damage: 40,  cooldown: 5.00, range: 360 },
    turtle_powerup:   { damage: 36,  cooldown: 6.00, range: 110 },
    laser_shockwave:  { damage: 22,  cooldown: 2.60, range: 400 },
    wall_of_toph:     { damage: 46,  cooldown: 4.20, range: 150 },
  };

  // saveStore is created in save-store.js after createSaveStore is defined
  // Neo.saveStore is set there.

  // Expose constants on Neo (needed by other files)
  Neo.RARITY_NAME_COLORS = RARITY_NAME_COLORS;
  Neo.RARITY_DISPLAY_NAMES = RARITY_DISPLAY_NAMES;
  Neo.getRarityDisplayName = getRarityDisplayName;
  Neo.RARITY_GLYPHS = RARITY_GLYPHS;
  Neo.getRarityGlyph = getRarityGlyph;
  Neo.SHOP_RARITY_PRICE_MULTIPLIERS = SHOP_RARITY_PRICE_MULTIPLIERS;
  Neo.SHOP_FEATURED_GOD_PRICE_PREMIUM = SHOP_FEATURED_GOD_PRICE_PREMIUM;
  Neo.SHOP_FEATURED_GOD_CHANCE = SHOP_FEATURED_GOD_CHANCE;
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
  Neo.RIVAL_LEVEL_CAP = RIVAL_LEVEL_CAP;
  Neo.RIVAL_REPUTATION_LEVEL_CAP = RIVAL_REPUTATION_LEVEL_CAP;
  Neo.RIVAL_WEAPON_SWAP_BASE = RIVAL_WEAPON_SWAP_BASE;
  Neo.RIVAL_DAMAGE_REDUCTION = RIVAL_DAMAGE_REDUCTION;
  Neo.RIVAL_VENDETTA_THREAT = RIVAL_VENDETTA_THREAT;
  Neo.MONSTER_ROAM_INTERVAL_SECONDS = MONSTER_ROAM_INTERVAL_SECONDS;
  Neo.MONSTER_ROAM_MOVE_CHANCE = MONSTER_ROAM_MOVE_CHANCE;
  Neo.PURPLE_WEAPON_POOL = PURPLE_WEAPON_POOL;
  Neo.RED_WEAPON_POOL = RED_WEAPON_POOL;
  Neo.RIVAL_WEAPON_LOADOUTS = RIVAL_WEAPON_LOADOUTS;
  Neo.RIVAL_LOADOUT_ALTERNATIVES = RIVAL_LOADOUT_ALTERNATIVES;
  Neo.RIVAL_DEFAULT_KIT_CHANCE = RIVAL_DEFAULT_KIT_CHANCE;
  Neo.ITEM_DEFS = ITEM_DEFS;
  Neo.ITEM_KEYS = ITEM_KEYS;
  Neo.SCROLL_DEFS = SCROLL_DEFS;
  Neo.SCROLL_KEYS = SCROLL_KEYS;
  Neo.SCROLL_OF_CONTROL_KEYS = SCROLL_OF_CONTROL_KEYS;
  window.NeoI18n?.localizeNeo?.(Neo);
  Neo.LEGACY_VOUCHER_KEY = LEGACY_VOUCHER_KEY;
  Neo.FORGE_VOUCHER_KEY = FORGE_VOUCHER_KEY;
  Neo.FORGE_VOUCHER_UPGRADE_STEPS = FORGE_VOUCHER_UPGRADE_STEPS;
  Neo.VOUCHER_KEY = VOUCHER_KEY;
  Neo.VOUCHER_KEYS = VOUCHER_KEYS;
  Neo.VOUCHER_TYPES = VOUCHER_TYPES;
  Neo.VOUCHER_COLORS = VOUCHER_COLORS;
  Neo.ITEM_DROP_WEIGHTS = ITEM_DROP_WEIGHTS;
  Neo.ITEM_RARITY_DROP_WEIGHTS = ITEM_RARITY_DROP_WEIGHTS;
  Neo.ELITE_ITEM_RARITY_DROP_WEIGHTS = ELITE_ITEM_RARITY_DROP_WEIGHTS;
  Neo.ITEM_DROP_TABLE = ITEM_DROP_TABLE;
  Neo.ELITE_ITEM_DROP_TABLE = ELITE_ITEM_DROP_TABLE;
  Neo.ELITE_INVENTORY_POOL = ELITE_INVENTORY_POOL;
  Neo.WHITE_ITEM_POOL = WHITE_ITEM_POOL;
  Neo.BLUE_ITEM_POOL = BLUE_ITEM_POOL;
  Neo.GREEN_ITEM_POOL = GREEN_ITEM_POOL;
  Neo.ELITE_TYPE_DEFS = ELITE_TYPE_DEFS;
  // Neo.itemRegistry is set in game-state.js
  Neo.JESTER_PORTAL_ACTIVATE_DELAY = JESTER_PORTAL_ACTIVATE_DELAY;
  Neo.JESTER_PORTAL_TRIGGER_RADIUS = JESTER_PORTAL_TRIGGER_RADIUS;
  Neo.LADDER_TRIGGER_RADIUS = LADDER_TRIGGER_RADIUS;
  Neo.AB_CHEST_DWELL_SECONDS = AB_CHEST_DWELL_SECONDS;
  Neo.AB_CHEST_DWELL_RADIUS = AB_CHEST_DWELL_RADIUS;
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
 