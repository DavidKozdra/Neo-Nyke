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
    power_disks: Object.freeze({ damage: 20, cooldown: 1.90, range: 240 }),
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

  // Presentation is shared content, while rendering remains client-only. The
  // authority includes the resolved key/kind/style in accepted action events;
  // every client then selects the same campaign presentation without accepting
  // client-authored colours, sounds, entity types, or gameplay outcomes.
  const MOVE_PRESENTATION_DEFS = Object.freeze({
    slash: Object.freeze({ kind: 'swing', color: '#ff7a9a', style: 'normal', sound: 'sword_swing' }),
    fire_balls: Object.freeze({ kind: 'projectile', color: '#ffb35c', style: 'normal', sound: 'fire' }),
    smite: Object.freeze({ kind: 'chain', color: '#cfdcff', style: 'normal', sound: 'lightning_charge' }),
    narwal_fight: Object.freeze({ kind: 'swing', color: '#ff8ed0', style: 'normal', sound: 'sword_swing' }),
    mooggy_swipe: Object.freeze({ kind: 'swing', color: '#ff7a9a', style: 'heavy', sound: 'sword_swing' }),

    blood_beam: Object.freeze({ kind: 'beam', color: '#ff3048', style: 'normal', sound: 'lazer_blast' }),
    love_beam: Object.freeze({ kind: 'beam', color: '#ff9de8', style: 'normal', sound: 'lazer_blast' }),
    love_bomb_laser: Object.freeze({ kind: 'projectile', color: '#ff9cc9', style: 'heavy', sound: 'lazer_blast' }),
    turtle_wave: Object.freeze({ kind: 'beam', color: '#74f5ff', style: 'heavy', sound: 'lazer_blast' }),
    ghost_ball: Object.freeze({ kind: 'projectile', color: '#8fffe0', style: 'heavy', sound: 'lazer_blast' }),
    power_disks: Object.freeze({ kind: 'projectile', color: '#ffb35c', style: 'normal', sound: 'lazer_blast' }),
    hammer_throw: Object.freeze({ kind: 'projectile', color: '#9bb8ff', style: 'heavy', sound: 'sword_swing' }),
    lightning_cross: Object.freeze({ kind: 'cross', color: '#bfe4ff', style: 'heavy', sound: 'lightning_charge' }),
    blade_justice: Object.freeze({ kind: 'beam', color: '#fff6a3', style: 'heavy', sound: 'sword_swing' }),
    holy_eye_beams: Object.freeze({ kind: 'beam', color: '#ffcc33', style: 'normal', sound: 'lazer_blast' }),
    lightning_columns: Object.freeze({ kind: 'summon', color: '#8dd4ff', style: 'normal', sound: 'lightning_charge' }),
    god_sweep: Object.freeze({ kind: 'beam', color: '#ffd980', style: 'heavy', sound: 'lazer_blast' }),
    laser_shockwave: Object.freeze({ kind: 'column', color: '#8a5a3c', style: 'light', sound: 'aoe' }),
    nail_shot: Object.freeze({ kind: 'projectile', color: '#c0d8ff', style: 'normal', sound: 'lazer_blast' }),
    mooggy_blood_beam: Object.freeze({ kind: 'beam', color: '#ff4164', style: 'normal', sound: 'lazer_blast' }),
    thorn_blood_beams: Object.freeze({ kind: 'beam', color: '#ff3048', style: 'heavy', sound: 'lazer_blast' }),
    wizard_lazer: Object.freeze({ kind: 'beam', color: '#b99cff', style: 'heavy', sound: 'lazer_blast' }),

    crimson_smash: Object.freeze({ kind: 'aoe', color: '#ff3048', style: 'heavy', sound: 'aoe' }),
    hammer_smash: Object.freeze({ kind: 'aoe', color: '#7da3ff', style: 'heavy', sound: 'aoe' }),
    titan_hammer: Object.freeze({ kind: 'summon', color: '#7da3ff', style: 'heavy', sound: 'aoe' }),
    death_ball: Object.freeze({ kind: 'projectile', color: '#5aa0ff', style: 'heavy', sound: 'lazer_blast' }),
    turtle_powerup: Object.freeze({ kind: 'support', color: '#7dffb0', style: 'light', sound: 'lazer_blast' }),
    mooggy_hairball: Object.freeze({ kind: 'aoe', color: '#85df63', style: 'heavy', sound: 'aoe' }),
    potion_bath: Object.freeze({ kind: 'support', color: '#b6f0ff', style: 'light', sound: 'aoe' }),
    excalibur_strike: Object.freeze({ kind: 'summon', color: '#ffd980', style: 'heavy', sound: 'aoe' }),
    holy_turrets: Object.freeze({ kind: 'summon', color: '#fff1b0', style: 'normal', sound: 'lazer_blast' }),
    kicky_kick: Object.freeze({ kind: 'aoe', color: '#ff7fc2', style: 'heavy', sound: 'aoe' }),
    chaos_burst: Object.freeze({ kind: 'aoe', color: '#a857ff', style: 'heavy', sound: 'fire_burn' }),
    wall_of_toph: Object.freeze({ kind: 'aoe', color: '#8a5a3c', style: 'heavy', sound: 'aoe' }),
    healing_zone: Object.freeze({ kind: 'support', color: '#35ff6f', style: 'light', sound: 'aoe' }),
    fire_circle: Object.freeze({ kind: 'aura', color: '#ff7b32', style: 'heavy', sound: 'fire_burn' }),
    floor_lava: Object.freeze({ kind: 'status', color: '#ff9f40', style: 'heavy', sound: 'fire_burn' }),
    random_pounce: Object.freeze({ kind: 'aoe', color: '#ff3070', style: 'heavy', sound: 'aoe' }),

    dash: Object.freeze({ kind: 'dash', color: '#fff06a', style: 'normal', sound: 'dash' }),
    nimrod_stomp: Object.freeze({ kind: 'dash_aoe', color: '#ffe67a', style: 'heavy', sound: 'aoe' }),
    warp: Object.freeze({ kind: 'warp', color: '#b99cff', style: 'normal', sound: 'dash' }),
    zip_lightning: Object.freeze({ kind: 'dash', color: '#95deff', style: 'heavy', sound: 'lightning_charge' }),
    flying_unhitable: Object.freeze({ kind: 'status', color: '#ffd1ea', style: 'light', sound: 'dash' }),
    princess_shield: Object.freeze({ kind: 'shield', color: '#ff5fb0', style: 'heavy', sound: 'dash' }),
    cowards_way: Object.freeze({ kind: 'status', color: '#8dffcf', style: 'light', sound: 'dash' }),
    mooggy_zoomies: Object.freeze({ kind: 'status', color: '#a0ffcc', style: 'light', sound: 'dash' }),
    knight_slash_dash: Object.freeze({ kind: 'dash', color: '#ff3b5c', style: 'heavy', sound: 'sword_swing' }),
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

  // Channelled laser beams. These moves are NOT one-shot casts: the campaign
  // holds them active for `duration` seconds, steers the beam toward the
  // player's live aim each frame (3.5 rad/s, slowed by laser weight), and deals
  // `tickDamage` to everything in the beam every `tickInterval` seconds. The
  // numbers mirror js/game/combat.js updatePlayerLaser exactly — that file is
  // the source of truth for how a beam must feel.
  const CONTINUOUS_BEAM_MOVES = Object.freeze([
    'blood_beam', 'love_beam', 'turtle_wave', 'holy_eye_beams', 'god_sweep',
    'mooggy_blood_beam', 'thorn_blood_beams', 'wizard_lazer',
  ]);
  function isContinuousBeamMove(moveKey) {
    return CONTINUOUS_BEAM_MOVES.includes(String(moveKey || ''));
  }
  const BEAM_CHANNEL_PROFILES = Object.freeze({
    blood_beam: Object.freeze({ duration: 0.58, tickDamage: 10, tickInterval: 0.08, range: 430, padding: 6, knockback: 60 }),
    love_beam: Object.freeze({ duration: 1.275, tickDamage: 14, tickInterval: 0.06, range: 500, padding: 6, knockback: 52 }),
    turtle_wave: Object.freeze({ duration: 1.35, tickDamage: 34, tickInterval: 0.08, range: 620, padding: 14, knockback: 155 }),
    holy_eye_beams: Object.freeze({ duration: 1.2, tickDamage: 13, tickInterval: 0.08, range: 430, padding: 6, knockback: 70, fan: Object.freeze([-0.07, 0.07]) }),
    god_sweep: Object.freeze({ duration: 1.45, tickDamage: 12, tickInterval: 0.05, range: 560, padding: 6, knockback: 120, sweep: 4.6 }),
    mooggy_blood_beam: Object.freeze({ duration: 0.58, tickDamage: 12, tickInterval: 0.08, range: 430, padding: 12, knockback: 60 }),
    thorn_blood_beams: Object.freeze({ duration: 0.58, tickDamage: 8, tickInterval: 0.08, range: 520, padding: 6, knockback: 60, fan: Object.freeze([-0.32, -0.11, 0.11, 0.32]) }),
    wizard_lazer: Object.freeze({ duration: 0.58, tickDamage: 30, tickInterval: 0.08, range: 560, padding: 22, knockback: 150 }),
  });
  const BEAM_TURN_RATE = 3.5;             // rad/s the beam steers toward the aim
  const BEAM_RECOIL_ACCEL = 45;           // base backwards push while channelling
  const WIZARD_LAZER_EXTRA_RECOIL = 220;  // wizard's heavy beam shoves much harder

  // Advance a channelled beam's angle by one step, exactly like the campaign:
  // god_sweep rotates on its own; everything else turns toward the aim at a
  // weight-scaled rate, taking the short way around the circle.
  function steerBeamChannelAngle(moveKey, currentAngle, targetAngle, dt, options = {}) {
    const profile = BEAM_CHANNEL_PROFILES[moveKey];
    const angle = Number(currentAngle) || 0;
    const delta = Math.max(0, Number(dt) || 0);
    if (profile?.sweep) return angle + Number(options.sweepDirection || 1) * profile.sweep * delta;
    const weight = Math.max(0, Number(options.laserWeightMultiplier ?? 1));
    const turnRate = weight > 0 ? BEAM_TURN_RATE / weight : BEAM_TURN_RATE * 100;
    const maxStep = turnRate * delta;
    let offset = (Number(targetAngle) || 0) - angle;
    while (offset > Math.PI) offset -= Math.PI * 2;
    while (offset < -Math.PI) offset += Math.PI * 2;
    return angle + Math.max(-maxStep, Math.min(maxStep, offset));
  }
  const MOVE_EXCLUSIVE_CHARACTERS = Object.freeze({
    narwal_fight: 'princess', mooggy_swipe: 'mooggy', love_beam: 'princess', love_bomb_laser: 'princess',
    ghost_ball: 'turtle_boy', hammer_throw: 'sarge', lightning_cross: 'sarge', holy_eye_beams: 'gelleh',
    nail_shot: 'mooggy', mooggy_blood_beam: 'mooggy', thorn_blood_beams: 'thorn_knight', wizard_lazer: 'metao',
    hammer_smash: 'sarge', titan_hammer: 'sarge', death_ball: 'turtle_boy', turtle_powerup: 'turtle_boy',
    mooggy_hairball: 'mooggy', potion_bath: 'metao', excalibur_strike: 'gelleh', holy_turrets: 'gelleh',
    kicky_kick: 'princess', random_pounce: 'mooggy', flying_unhitable: 'princess', princess_shield: 'princess',
    mooggy_zoomies: 'mooggy', knight_slash_dash: 'thorn_knight',
  });

  // Base charge counts, and the per-character overrides that bend them (Thorn's
  // double dash). This is the single source of truth for both runtimes: the local
  // campaign reads it through MOVE_DEFS/getMoveMaxStacks, the authority through
  // getBaseMoveCharges. It used to be duplicated as a flat table in
  // SharedAcquisitionSystem that had no per-character concept at all, so Thorn
  // silently lost a dash charge in multiplayer. Add new charge counts HERE only.
  const MOVE_BASE_CHARGES = Object.freeze({
    lightning_cross: 2,
    nail_shot: 2,
    dash: 1,
    warp: 4,
    mooggy_zoomies: 2,
    knight_slash_dash: 1,
  });
  const MOVE_CHARGE_OVERRIDES = Object.freeze({
    dash: Object.freeze({ thorn_knight: 2 }),
  });

  function getMoveBaseCharges(moveKey, characterKey) {
    const base = Math.max(1, Number(MOVE_BASE_CHARGES[moveKey] || 1));
    const override = Number(MOVE_CHARGE_OVERRIDES[moveKey]?.[characterKey] || 0);
    return Math.max(1, override || base);
  }

  function isMoveAllowedForCharacter(moveKey, characterKey) {
    if (!MOVE_SLOT_BY_KEY[moveKey]) return false;
    const exclusive = MOVE_EXCLUSIVE_CHARACTERS[moveKey];
    return !exclusive || exclusive === characterKey;
  }

  function getDefaultMoveLoadout(characterKey) {
    return { ...(DEFAULT_MOVE_LOADOUTS[characterKey] || DEFAULT_MOVE_LOADOUTS.thorn_knight) };
  }

  function getMoveSlot(moveKey) {
    return MOVE_SLOT_BY_KEY[moveKey] || null;
  }

  // Power Disks are a radial projectile system, not an aimed volley. This
  // recipe is gameplay content shared by the local campaign and authority;
  // each runtime only adapts the returned records into its entity storage.
  function createPowerDiskBurstDescriptors(options = {}) {
    const damageMultiplier = Math.max(0, Number(options.damageMultiplier ?? 1));
    const metao = String(options.characterKey || '') === 'metao';
    const diskHitOptions = metao
      ? { drainChanceBonus: 0.05, fireChance: 0.4, fireStacks: 1, fireDuration: 3 }
      : { drainChanceBonus: 0.05 };
    const shardHitOptions = metao
      ? { drainChanceBonus: 0.05, fireChance: 0.25, fireStacks: 1, fireDuration: 2 }
      : { drainChanceBonus: 0.05 };
    return Array.from({ length: 8 }, (_, index) => ({
      kind: 'disk',
      angle: index * (Math.PI * 2 / 8),
      speed: 440,
      radius: 7,
      lifeSeconds: 1.8,
      damage: Math.max(1, Math.round(20 * damageMultiplier)),
      hitOptions: { ...diskHitOptions },
      subSpawn: {
        kind: 'disk_shard',
        intervalSeconds: 0.18,
        speed: 620,
        radius: 4,
        lifeSeconds: 0.7,
        damage: Math.max(1, Math.round(8 * damageMultiplier)),
        count: 2,
        jitterRadians: 0.5,
        hitOptions: { ...shardHitOptions },
      },
    }));
  }

  return {
    MOVE_SLOTS,
    MOVE_SLOT_KEYS,
    MOVE_SLOT_BY_KEY,
    MOVE_EXCLUSIVE_CHARACTERS,
    MOVE_BASE_CHARGES,
    MOVE_CHARGE_OVERRIDES,
    getMoveBaseCharges,
    MOVE_BASE_STATS,
    MOVE_PRESENTATION_DEFS,
    DEFAULT_MOVE_LOADOUTS,
    KIT_ALTERNATIVES,
    CONTINUOUS_BEAM_MOVES,
    isContinuousBeamMove,
    BEAM_CHANNEL_PROFILES,
    BEAM_RECOIL_ACCEL,
    WIZARD_LAZER_EXTRA_RECOIL,
    steerBeamChannelAngle,
    getDefaultMoveLoadout,
    getMoveSlot,
    isMoveAllowedForCharacter,
    createPowerDiskBurstDescriptors,
  };
});
