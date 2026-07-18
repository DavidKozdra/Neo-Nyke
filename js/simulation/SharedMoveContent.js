(function initializeSharedMoveContent(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.content = namespace.content || {};
  Object.assign(namespace.content, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedMoveContentApi() {
  'use strict';

  const MOVE_SLOTS = Object.freeze(['melee', 'laser', 'smash', 'dash']);
  const MOVE_SLOT_KEYS = Object.freeze({
    melee: Object.freeze(['slash', 'fire_balls', 'smite', 'narwal_fight', 'mooggy_swipe']),
    laser: Object.freeze([
      'blood_beam', 'love_beam', 'love_bomb_laser', 'turtle_wave', 'ghost_ball', 'power_disks',
      'hammer_throw', 'lightning_cross', 'blade_justice', 'holy_eye_beams', 'lightning_columns',
      'god_sweep', 'laser_shockwave', 'nail_shot', 'mooggy_blood_beam', 'thorn_blood_beams', 'wizard_lazer',
    ]),
    smash: Object.freeze([
      'crimson_smash', 'hammer_smash', 'titan_hammer', 'death_ball', 'turtle_powerup', 'mooggy_hairball',
      'potion_bath', 'excalibur_strike', 'holy_turrets', 'kicky_kick', 'chaos_burst', 'wall_of_toph',
      'healing_zone', 'fire_circle', 'floor_lava', 'random_pounce',
    ]),
    dash: Object.freeze([
      'dash', 'nimrod_stomp', 'warp', 'zip_lightning', 'flying_unhitable', 'princess_shield',
      'cowards_way', 'mooggy_zoomies', 'knight_slash_dash',
    ]),
  });

  // Canonical authored values used by both the browser game and authority.
  const MOVE_BASE_STATS = Object.freeze({
    slash: Object.freeze({ damage: 32, cooldown: 0.40, range: 90 }),
    fire_balls: Object.freeze({ damage: 20, cooldown: 0.75, range: 180 }),
    smite: Object.freeze({ damage: 28, cooldown: 0.55, range: 110 }),
    narwal_fight: Object.freeze({ damage: 36, cooldown: 0.55, range: 126 }),
    blood_beam: Object.freeze({ damage: 14, cooldown: 3.00, duration: 1.2, critChance: 0 }),
    love_beam: Object.freeze({ damage: 14, cooldown: 3.40, duration: 1.275, critChance: 0 }),
    love_bomb_laser: Object.freeze({ damage: 34, cooldown: 3.80, range: 420 }),
    turtle_wave: Object.freeze({ damage: 55, cooldown: 6.00, duration: 1.35 }),
    ghost_ball: Object.freeze({ damage: 34, cooldown: 5.50, range: 460 }),
    power_disks: Object.freeze({ damage: 22, cooldown: 1.90, range: 240 }),
    blade_justice: Object.freeze({ damage: 60, cooldown: 3.80, range: 80 }),
    holy_eye_beams: Object.freeze({ damage: 13, cooldown: 3.60, duration: 1.2 }),
    lightning_columns: Object.freeze({ damage: 30, cooldown: 4.80, range: 180 }),
    god_sweep: Object.freeze({ damage: 40, cooldown: 7.20, range: 320 }),
    crimson_smash: Object.freeze({ damage: 55, cooldown: 3.80, range: 140 }),
    kicky_kick: Object.freeze({ damage: 184, cooldown: 4.20, range: 138 }),
    chaos_burst: Object.freeze({ damage: 30, cooldown: 5.40, range: 100 }),
    healing_zone: Object.freeze({ damage: 12, cooldown: 5.00, duration: 3.0, range: 130 }),
    fire_circle: Object.freeze({ damage: 18, cooldown: 4.50, duration: 3.5, range: 100 }),
    floor_lava: Object.freeze({ damage: 12, cooldown: 5.00, duration: 4.0, range: 160 }),
    dash: Object.freeze({ cooldown: 1.20 }),
    nimrod_stomp: Object.freeze({ damage: 60, cooldown: 2.50, range: 110 }),
    warp: Object.freeze({ cooldown: 3.40 }),
    zip_lightning: Object.freeze({ damage: 30, cooldown: 2.00 }),
    flying_unhitable: Object.freeze({ cooldown: 18.00, duration: 15.0 }),
    princess_shield: Object.freeze({ cooldown: 16.00 }),
    cowards_way: Object.freeze({ cooldown: 6.00, duration: 3.0 }),
    mooggy_swipe: Object.freeze({ damage: 44, cooldown: 0.50, range: 130 }),
    nail_shot: Object.freeze({ damage: 18, cooldown: 2.80, range: 400 }),
    random_pounce: Object.freeze({ damage: 52, cooldown: 5.00, range: 160 }),
    mooggy_zoomies: Object.freeze({ cooldown: 20.00, duration: 12.0 }),
    mooggy_blood_beam: Object.freeze({ damage: 12, cooldown: 3.20, duration: 1.3 }),
    thorn_blood_beams: Object.freeze({ damage: 8, cooldown: 3.60, duration: 1.4 }),
    wizard_lazer: Object.freeze({ damage: 30, cooldown: 4.20, duration: 1.2 }),
    mooggy_hairball: Object.freeze({ damage: 34, cooldown: 4.80, range: 132 }),
    potion_bath: Object.freeze({ cooldown: 14.00, duration: 5.0, range: 150 }),
    excalibur_strike: Object.freeze({ damage: 78, cooldown: 10.00, range: 150 }),
    holy_turrets: Object.freeze({ damage: 26, cooldown: 6.50, duration: 6.0, range: 360 }),
    knight_slash_dash: Object.freeze({ damage: 42, cooldown: 2.40, range: 240 }),
    hammer_throw: Object.freeze({ damage: 46, cooldown: 2.20, range: 320 }),
    lightning_cross: Object.freeze({ damage: 30, cooldown: 5.50 }),
    hammer_smash: Object.freeze({ damage: 58, cooldown: 4.00, range: 150 }),
    titan_hammer: Object.freeze({ damage: 70, cooldown: 6.50, duration: 8.0, range: 120 }),
    death_ball: Object.freeze({ damage: 40, cooldown: 5.00, range: 360 }),
    turtle_powerup: Object.freeze({ damage: 36, cooldown: 6.00, range: 110 }),
    laser_shockwave: Object.freeze({ damage: 22, cooldown: 2.60, range: 400 }),
    wall_of_toph: Object.freeze({ damage: 46, cooldown: 4.20, range: 150 }),
  });

  const DEFAULT_MOVE_LOADOUTS = Object.freeze({
    princess: Object.freeze({ melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'flying_unhitable' }),
    thorn_knight: Object.freeze({ melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' }),
    metao: Object.freeze({ melee: 'slash', laser: 'power_disks', smash: 'chaos_burst', dash: 'warp' }),
    gelleh: Object.freeze({ melee: 'slash', laser: 'blade_justice', smash: 'healing_zone', dash: 'zip_lightning' }),
    mooggy: Object.freeze({ melee: 'slash', laser: 'nail_shot', smash: 'random_pounce', dash: 'mooggy_zoomies' }),
    turtle_boy: Object.freeze({ melee: 'slash', laser: 'turtle_wave', smash: 'death_ball', dash: 'dash' }),
    sarge: Object.freeze({ melee: 'slash', laser: 'hammer_throw', smash: 'hammer_smash', dash: 'nimrod_stomp' }),
  });

  const KIT_ALTERNATIVES = Object.freeze({
    thorn_knight: Object.freeze({ laser: Object.freeze(['blood_beam', 'thorn_blood_beams']), dash: Object.freeze(['dash', 'knight_slash_dash']) }),
    metao: Object.freeze({ laser: Object.freeze(['power_disks', 'wizard_lazer']), smash: Object.freeze(['chaos_burst', 'potion_bath']) }),
    gelleh: Object.freeze({ laser: Object.freeze(['blade_justice', 'holy_eye_beams']), smash: Object.freeze(['healing_zone', 'holy_turrets', 'excalibur_strike']) }),
    mooggy: Object.freeze({ laser: Object.freeze(['nail_shot', 'mooggy_blood_beam']), smash: Object.freeze(['random_pounce', 'mooggy_hairball']) }),
    turtle_boy: Object.freeze({ laser: Object.freeze(['turtle_wave', 'ghost_ball']), smash: Object.freeze(['death_ball', 'turtle_powerup']) }),
    sarge: Object.freeze({ laser: Object.freeze(['hammer_throw', 'lightning_cross']), smash: Object.freeze(['hammer_smash', 'titan_hammer']) }),
    princess: Object.freeze({ laser: Object.freeze(['love_beam', 'love_bomb_laser']), dash: Object.freeze(['flying_unhitable', 'princess_shield']) }),
  });

  const MOVE_SLOT_BY_KEY = Object.freeze(Object.fromEntries(
    Object.entries(MOVE_SLOT_KEYS).flatMap(([slot, keys]) => keys.map(key => [key, slot])),
  ));

  function getDefaultMoveLoadout(characterKey) {
    return { ...(DEFAULT_MOVE_LOADOUTS[characterKey] || DEFAULT_MOVE_LOADOUTS.thorn_knight) };
  }

  function getMoveSlot(moveKey) {
    return MOVE_SLOT_BY_KEY[moveKey] || null;
  }

  return {
    MOVE_SLOTS,
    MOVE_SLOT_KEYS,
    MOVE_SLOT_BY_KEY,
    MOVE_BASE_STATS,
    DEFAULT_MOVE_LOADOUTS,
    KIT_ALTERNATIVES,
    getDefaultMoveLoadout,
    getMoveSlot,
  };
});
