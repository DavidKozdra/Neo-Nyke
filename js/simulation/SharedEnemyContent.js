(function initializeSharedEnemyContent(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.content = namespace.content || {};
  Object.assign(namespace.content, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEnemyContentApi() {
  'use strict';

  const enemy = (type, behavior, stats = {}, extra = {}) => Object.freeze({
    type,
    spriteKey: extra.spriteKey || type,
    behavior,
    radius: 15,
    maxHealth: 52,
    moveSpeed: 96,
    contactDamage: 12,
    attackCooldown: 1,
    ...stats,
    ...extra,
  });

  // Values come from the browser game's ENEMY_STATS/spawnEnemy catalog. The
  // authority consumes the same names, base bodies, roles and boss phases.
  const ENEMY_CATALOG = Object.freeze({
    hunter: enemy('hunter', 'chaser'),
    charger: enemy('charger', 'charger'),
    laser: enemy('laser', 'beam'),
    knave: enemy('knave', 'skirmisher', { radius: 16, maxHealth: 68, moveSpeed: 118, contactDamage: 14, attackCooldown: 1.3 }),
    sniper: enemy('sniper', 'sniper', { radius: 15, maxHealth: 58, moveSpeed: 104, contactDamage: 12, attackCooldown: 1.55 }),
    machine_gunner: enemy('machine_gunner', 'burst', { radius: 17, maxHealth: 96, moveSpeed: 112, contactDamage: 8, attackCooldown: 1.15 }),
    golem: enemy('golem', 'heavy', { radius: 20, maxHealth: 132, moveSpeed: 70, contactDamage: 18, attackCooldown: 1.9 }, { bleedImmune: true }),
    cult_mage: enemy('cult_mage', 'beam', { radius: 17, maxHealth: 84, moveSpeed: 58, contactDamage: 18, attackCooldown: 1.8 }),
    cult_follower: enemy('cult_follower', 'chaser', { radius: 12, maxHealth: 34, moveSpeed: 138, contactDamage: 8, attackCooldown: 0.85 }),
    summoner: enemy('summoner', 'summoner', { radius: 18, maxHealth: 120, moveSpeed: 66, contactDamage: 12, attackCooldown: 1.5 }),
    shield_unit: enemy('shield_unit', 'shield', { radius: 22, maxHealth: 210, moveSpeed: 52, contactDamage: 10, attackCooldown: 1.4 }, { spriteKey: 'shield_unit', bleedImmune: true }),
    healer: enemy('healer', 'healer', { radius: 19, maxHealth: 150, moveSpeed: 64, contactDamage: 10, attackCooldown: 1.2 }, { spriteKey: 'healer' }),
    boss_spawner: enemy('boss_spawner', 'boss_spawner', { radius: 24, maxHealth: 300, moveSpeed: 96, contactDamage: 8, attackCooldown: 1.8 }, { spriteKey: 'cult_mage', bleedImmune: true }),
    queen_cult: enemy('queen_cult', 'boss', { radius: 38, maxHealth: 912, moveSpeed: 96, contactDamage: 20, attackCooldown: 1.2 }, { boss: true, patterns: Object.freeze(['summon', 'beam', 'nova']) }),
    bulk_golem: enemy('bulk_golem', 'boss', { radius: 58, maxHealth: 1280, moveSpeed: 88, contactDamage: 31, attackCooldown: 1.6 }, { boss: true, bleedImmune: true, patterns: Object.freeze(['jump', 'aoe', 'split']) }),
    artificer_knave: enemy('artificer_knave', 'boss', { radius: 30, maxHealth: 1880, moveSpeed: 124, contactDamage: 20, attackCooldown: 1.2 }, { spriteKey: 'knave', boss: true, patterns: Object.freeze(['blade', 'dash', 'turrets']) }),
    bowman_bane: enemy('bowman_bane', 'boss', { radius: 36, maxHealth: 2400, moveSpeed: 80, contactDamage: 50, attackCooldown: 1.4 }, { boss: true, bleedImmune: true, patterns: Object.freeze(['columns', 'burst', 'warp', 'thunder_smash']) }),
    antony_blemmye: enemy('antony_blemmye', 'boss', { radius: 42, maxHealth: 1250, moveSpeed: 78, contactDamage: 24, attackCooldown: 1.35 }, { boss: true, bleedImmune: true, patterns: Object.freeze(['hammer', 'bite', 'slash', 'death_ball']) }),
    handsome_devil: enemy('handsome_devil', 'boss', { radius: 34, maxHealth: 1700, moveSpeed: 104, contactDamage: 50, attackCooldown: 1.1 }, { boss: true, fireImmune: true, patterns: Object.freeze(['spikes', 'lava_grid', 'laser', 'claw']) }),
    ent_of_pestilence: enemy('ent_of_pestilence', 'boss', { radius: 48, maxHealth: 2050, moveSpeed: 82, contactDamage: 28, attackCooldown: 1.15 }, { spriteKey: 'charger', boss: true, poisonImmune: true, patterns: Object.freeze(['brood', 'spit', 'rush']) }),
    t_rex: enemy('t_rex', 'boss', { radius: 58, maxHealth: 2600, moveSpeed: 112, contactDamage: 42, attackCooldown: 1.05 }, { spriteKey: 'bulk_golem', boss: true, bleedImmune: true, patterns: Object.freeze(['bite', 'charge', 'roar']) }),
    sea_snake: enemy('sea_snake', 'boss', { radius: 38, maxHealth: 2350, moveSpeed: 156, contactDamage: 34, attackCooldown: 0.9 }, { spriteKey: 'sea_snake', boss: true, patterns: Object.freeze(['enter', 'coil', 'constrict']) }),
    god: enemy('god', 'boss', { radius: 34, maxHealth: 920, moveSpeed: 108, contactDamage: 18, attackCooldown: 1.4 }, { boss: true, patterns: Object.freeze(['laser', 'sweep', 'partition', 'charge', 'sword_ring']) }),
    mirror_knight: enemy('mirror_knight', 'mirror', { radius: 18, maxHealth: 180, moveSpeed: 180, contactDamage: 20, attackCooldown: 0.8 }, { spriteKey: 'thorn_knight' }),
    rival: enemy('rival', 'mirror', { radius: 18, maxHealth: 220, moveSpeed: 228, contactDamage: 22, attackCooldown: 0.7 }, { spriteKey: 'thorn_knight' }),
    mooggy: enemy('mooggy', 'assassin', { radius: 15, maxHealth: 120, moveSpeed: 228, contactDamage: 14, attackCooldown: 0.2 }),
  });

  const playableEnemyBuild = (name, rarity, roleLabel, hint, lore, stats, moveLoadout, defaultWeapon, startingItems = {}) => Object.freeze({
    name,
    rarity,
    roleLabel,
    hint,
    lore,
    ...stats,
    moveLoadout: Object.freeze({ ...moveLoadout }),
    defaultWeapon,
    startingItems: Object.freeze({ ...startingItems }),
  });

  // Playable forms translate each enemy's authored combat behavior into the
  // campaign's four player move slots. Boss health is deliberately normalized
  // to hero-scale multipliers; the identity comes from the kit, not thousands
  // of free HP. Keys are prefixed so enemies such as Knave and Mooggy can exist
  // beside their normal hero versions without save-data collisions.
  const PLAYABLE_ENEMY_BUILD_DEFS = Object.freeze({
    hunter: playableEnemyBuild(
      'Hunter', 'knight', 'Relentless tracker', 'Close and punish',
      'The Hunter’s playable form preserves its authored bow pressure: a five-arrow pursuit fan, a planted trap, and a quick reposition.',
      { damageMultiplier: 0.95, hpMultiplier: 0.9, moveSpeedMultiplier: 1.05 },
      { melee: 'slash', laser: 'hunter_volley', smash: 'hunter_trap', dash: 'dash' },
      'hunters_bow', { neo_knife: 1 },
    ),
    charger: playableEnemyBuild(
      'Charger', 'knight', 'Momentum bruiser', 'Dash and collide',
      'Built around the enemy Charger wind-up: break a line with a shockwave, raise cover, then commit to the same damaging collision.',
      { damageMultiplier: 1.05, hpMultiplier: 0.95, moveSpeedMultiplier: 1.15, aoeRadiusMultiplier: 0.95 },
      { melee: 'slash', laser: 'laser_shockwave', smash: 'wall_of_toph', dash: 'charger_rush' },
      'claw_gauntlets', { copper_penny: 1 },
    ),
    laser: playableEnemyBuild(
      'Laser Unit', 'wizard', 'Beam controller', 'Beam and reposition',
      'A fragile ranged controller that fires the dungeon unit’s instant beam, discharges a radial laser nova, and warps before opponents collapse.',
      { damageMultiplier: 0.92, hpMultiplier: 0.85, moveSpeedMultiplier: 0.95, aoeRadiusMultiplier: 1.05 },
      { melee: 'slash', laser: 'dungeon_beam', smash: 'laser_nova', dash: 'warp' },
      'lazer_glasses', { princes_glasses: 1 },
    ),
    knave: playableEnemyBuild(
      'Enemy Knave', 'knave', 'Dungeon skirmisher', 'Bleed and evade',
      'The common dungeon Knave keeps its quick blade, homing knives, bleed pressure, and evasive speed in player hands.',
      { damageMultiplier: 0.98, hpMultiplier: 0.82, moveSpeedMultiplier: 1.18 },
      { melee: 'knave_blade', laser: 'knave_knives', smash: 'crimson_smash', dash: 'dash' },
      'knave_blade', { tough_bandaid: 1, churu_stick: 1 },
    ),
    sniper: playableEnemyBuild(
      'Sniper', 'knave', 'Patient marksman', 'One decisive shot',
      'A patient glass cannon: create distance, line up the enemy’s piercing sniper round, trap the approach, then disappear.',
      { damageMultiplier: 1.12, hpMultiplier: 0.78, moveSpeedMultiplier: 1.02, aoeRadiusMultiplier: 0.95 },
      { melee: 'slash', laser: 'sniper_round', smash: 'hunter_trap', dash: 'cowards_way' },
      'hunters_bow', { princes_glasses: 1 },
    ),
    machine_gunner: playableEnemyBuild(
      'Machine Gunner', 'knave', 'Burst gunner', 'Sustain the barrage',
      'Turns the enemy burst pattern into player-controlled projectile pressure: a focused barrage, a full bullet nova, and a quick dash.',
      { damageMultiplier: 0.78, hpMultiplier: 0.95, moveSpeedMultiplier: 1.08, aoeRadiusMultiplier: 0.9 },
      { melee: 'slash', laser: 'gunner_barrage', smash: 'bullet_nova', dash: 'dash' },
      'magenta_p90', { copper_penny: 1 },
    ),
    golem: playableEnemyBuild(
      'Golem', 'knight', 'Stone juggernaut', 'Slow heavy impact',
      'A slow stone tank whose shockwave, earthen wall, and leap-stomp reproduce the Golem plan: endure the approach, then own close range.',
      { damageMultiplier: 1.12, hpMultiplier: 1.3, moveSpeedMultiplier: 0.75, aoeRadiusMultiplier: 1.1 },
      { melee: 'slash', laser: 'laser_shockwave', smash: 'wall_of_toph', dash: 'nimrod_stomp' },
      'stone_fists', { turtle_shell: 1 },
    ),
    cult_mage: playableEnemyBuild(
      'Cult Mage', 'wizard', 'Ritual artillery', 'Fire from safety',
      'A deliberate ranged caster using the Cult Mage’s fire staff, violet bolt fan, persistent fire ritual, and evasive warp.',
      { damageMultiplier: 1.02, hpMultiplier: 0.88, moveSpeedMultiplier: 0.8, aoeRadiusMultiplier: 1.25 },
      { melee: 'fire_balls', laser: 'cult_bolt_volley', smash: 'fire_circle', dash: 'warp' },
      'metao_fire_staff', { mateos_bag: 1 },
    ),
    cult_follower: playableEnemyBuild(
      'Cult Follower', 'knave', 'Frenzied swarmer', 'Rush and overwhelm',
      'Frail and extremely fast, the Follower claws in close, throws cult bolts, then enters the same reckless frenzy as its hostile form.',
      { damageMultiplier: 0.82, hpMultiplier: 0.72, moveSpeedMultiplier: 1.25, aoeRadiusMultiplier: 0.85 },
      { melee: 'mooggy_swipe', laser: 'cult_bolt_volley', smash: 'cult_frenzy', dash: 'dash' },
      'claw_gauntlets', { churu_stick: 1 },
    ),
    summoner: playableEnemyBuild(
      'Summoner', 'wizard', 'Back-line conjurer', 'Create allied pressure',
      'The playable Summoner now performs its real role: fire cult bolts, call allied Cult Followers, and warp while the minions fight.',
      { damageMultiplier: 0.88, hpMultiplier: 1, moveSpeedMultiplier: 0.82, aoeRadiusMultiplier: 1.2 },
      { melee: 'fire_balls', laser: 'cult_bolt_volley', smash: 'summon_cult_followers', dash: 'warp' },
      'metao_fire_staff', { drink_master: 1 },
    ),
    shield_unit: playableEnemyBuild(
      'Shield Unit', 'knight', 'Barrier anchor', 'Hold the front line',
      'A defensive anchor carrying an actual tower shield: bash at close range, throw it through a line, raise cover, and lock into guard.',
      { damageMultiplier: 0.82, hpMultiplier: 1.35, moveSpeedMultiplier: 0.72, aoeRadiusMultiplier: 1.1 },
      { melee: 'slash', laser: 'shield_throw', smash: 'wall_of_toph', dash: 'shield_guard' },
      'shield_bash', { turtle_shell: 1, tough_bandaid: 1 },
    ),
    healer: playableEnemyBuild(
      'Healer', 'god', 'Sustain support', 'Heal through pressure',
      'The enemy support role becomes a durable battle healer: chain lightning for space, a healing zone for sustain, and a lightning escape.',
      { damageMultiplier: 0.78, hpMultiplier: 1.1, moveSpeedMultiplier: 0.78, aoeRadiusMultiplier: 1.2 },
      { melee: 'smite', laser: 'holy_eye_beams', smash: 'healing_zone', dash: 'zip_lightning' },
      'golden_fleece', { zap_to_extreme: 1 },
    ),
    boss_spawner: playableEnemyBuild(
      'Boss Spawner', 'wizard', 'Portal architect', 'Fill the arena',
      'A mobile portal architect that casts cult bolts, repeatedly calls allied Followers, and conceals itself while the swarm attacks.',
      { damageMultiplier: 0.82, hpMultiplier: 1.2, moveSpeedMultiplier: 0.78, aoeRadiusMultiplier: 1.28 },
      { melee: 'fire_balls', laser: 'cult_bolt_volley', smash: 'summon_cult_followers', dash: 'cowards_way' },
      'metao_fire_staff', { drink_master: 1, tough_bandaid: 1 },
    ),
    queen_cult: playableEnemyBuild(
      'Cult Queen', 'god', 'Ritual commander', 'Summon and dominate',
      'The Cult Queen commands space with fire volleys, a room-piercing ritual beam, summoned Followers, and a royal warp.',
      { damageMultiplier: 0.98, hpMultiplier: 1.12, moveSpeedMultiplier: 0.95, aoeRadiusMultiplier: 1.25 },
      { melee: 'fire_balls', laser: 'dungeon_beam', smash: 'summon_cult_followers', dash: 'warp' },
      'metao_fire_staff', { mateos_bag: 1, drink_master: 1 },
    ),
    bulk_golem: playableEnemyBuild(
      'Bulk Golem', 'knight', 'Siege juggernaut', 'Crush the whole room',
      'A hero-scaled siege boss retaining massive impact: hammer through the front, throw a shockwave, then leap into a room-filling smash.',
      { damageMultiplier: 1.18, hpMultiplier: 1.35, moveSpeedMultiplier: 0.78, aoeRadiusMultiplier: 1.3 },
      { melee: 'slash', laser: 'laser_shockwave', smash: 'hammer_smash', dash: 'nimrod_stomp' },
      'sarges_hammer', { turtle_shell: 1, copper_penny: 1 },
    ),
    artificer_knave: playableEnemyBuild(
      'Artificer Knave', 'knave', 'Blade engineer', 'Dash behind turrets',
      'Keeps the boss triad intact: an aggressive bleed blade, homing knives, deployable turrets, and a cutting dash through the opening they create.',
      { damageMultiplier: 1.05, hpMultiplier: 0.9, moveSpeedMultiplier: 1.18 },
      { melee: 'knave_blade', laser: 'knave_knives', smash: 'holy_turrets', dash: 'knight_slash_dash' },
      'knave_blade', { neo_knife: 1, churu_stick: 1 },
    ),
    bowman_bane: playableEnemyBuild(
      "Bowman's Bane", 'god', 'Lightning executioner', 'Control every lane',
      'A measured boss build using a hunter bow, room-splitting lightning columns, a crushing wall, and warp to recreate its lane-control phases.',
      { damageMultiplier: 1.08, hpMultiplier: 1.05, moveSpeedMultiplier: 0.85, aoeRadiusMultiplier: 1.2 },
      { melee: 'slash', laser: 'lightning_columns', smash: 'wall_of_toph', dash: 'warp' },
      'hunters_bow', { princes_glasses: 1, copper_penny: 1 },
    ),
    antony_blemmye: playableEnemyBuild(
      'Anthony the Blessed Blemmyie', 'knight', 'Chest-faced bruiser',
      'Bite, throw, freeze',
      "Anthony's exact boss kit: a life-draining bite, an aimed knife throw, and a homing freeze ball.",
      { damageMultiplier: 1.15, hpMultiplier: 1.25, moveSpeedMultiplier: 0.82, aoeRadiusMultiplier: 1.18, signatureMelee: true },
      { melee: 'antony_bite', laser: 'antony_knife_throw', smash: 'antony_freeze_ball', dash: 'dash' },
      'knave_blade', { tough_bandaid: 1, copper_penny: 1 },
    ),
    handsome_devil: playableEnemyBuild(
      'Handsome Devil', 'knave', 'Hazard duelist', 'Burn every escape',
      'The Devil fights through claws, sweeping eye fire, a lava-covered floor, and a warp that keeps opponents trapped inside his hazards.',
      { damageMultiplier: 1.08, hpMultiplier: 0.98, moveSpeedMultiplier: 1.1, aoeRadiusMultiplier: 1.25 },
      { melee: 'mooggy_swipe', laser: 'god_sweep', smash: 'floor_lava', dash: 'warp' },
      'claw_gauntlets', { hemes_scarf: 1, churu_stick: 1 },
    ),
    ent_of_pestilence: playableEnemyBuild(
      'Ent of Pestilence', 'wizard', 'Plague broodmother', 'Summon and infect',
      'A hero-scaled pestilent boss that surrounds itself with cult followers, spits ritual bolts, and rushes through the opening.',
      { damageMultiplier: 1.06, hpMultiplier: 1.12, moveSpeedMultiplier: 0.9, aoeRadiusMultiplier: 1.2 },
      { melee: 'fire_balls', laser: 'cult_bolt_volley', smash: 'summon_cult_followers', dash: 'charger_rush' },
      'metao_fire_staff', { drink_master: 1, tough_bandaid: 1 },
    ),
    t_rex: playableEnemyBuild(
      'T-Rex', 'knight', 'Prehistoric juggernaut', 'Roar and charge',
      'The dungeon tyrant becomes a heavy hero: stone fists, a crushing shockwave, a seismic smash, and its signature headlong rush.',
      { damageMultiplier: 1.2, hpMultiplier: 1.35, moveSpeedMultiplier: 0.92, aoeRadiusMultiplier: 1.22 },
      { melee: 'slash', laser: 'laser_shockwave', smash: 'hammer_smash', dash: 'charger_rush' },
      'stone_fists', { turtle_shell: 1, tough_bandaid: 1 },
    ),
    sea_snake: playableEnemyBuild(
      'Snake of the Sea', 'wizard', 'Constricting leviathan', 'Circle and collapse',
      'A swift controller inspired by the segmented boss: ricochet water-like beams, a storm of columns, and warp-speed repositioning.',
      { damageMultiplier: 1.05, hpMultiplier: 1.05, moveSpeedMultiplier: 1.2, aoeRadiusMultiplier: 1.25 },
      { melee: 'slash', laser: 'turtle_wave', smash: 'laser_nova', dash: 'warp' },
      'lazer_glasses', { princes_glasses: 1, enemy_magnet: 1 },
    ),
    god: playableEnemyBuild(
      'GOD', 'god', 'Divine controller', 'Judge the whole arena',
      'A normalized final-boss form combining chained judgement, the divine sweep, Excalibur strikes, and lightning movement without final-boss health inflation.',
      { damageMultiplier: 1.15, hpMultiplier: 1.2, moveSpeedMultiplier: 1.05, aoeRadiusMultiplier: 1.3 },
      { melee: 'smite', laser: 'god_sweep', smash: 'excalibur_strike', dash: 'zip_lightning' },
      'gelleh_lightning_spear', { zap_to_extreme: 1, princes_glasses: 1 },
    ),
    mirror_knight: playableEnemyBuild(
      'Mirror Champion', 'knight', 'Adaptive mirror', 'Reliable reflected kit',
      'The mirror’s player form starts from the classic Thorn kit: balanced stats, a bleed blade, a tracking beam, a heavy smash, and a direct dash.',
      { damageMultiplier: 1, hpMultiplier: 1, moveSpeedMultiplier: 1 },
      { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' },
      'thorns_bleed_blade', { tooth_of_thorn: 1, tough_bandaid: 1 },
    ),
    rival: playableEnemyBuild(
      'Rival', 'knight', 'Returning challenger', 'Outlast and adapt',
      'A sturdy returning challenger with the mirrored knight fundamentals and a starter build tuned for the repeated duels its enemy form survives.',
      { damageMultiplier: 1.05, hpMultiplier: 1.1, moveSpeedMultiplier: 1.05 },
      { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' },
      'thorns_bleed_blade', { neo_knife: 1, tooth_of_thorn: 1 },
    ),
    mooggy: playableEnemyBuild(
      'Mooggy Assassin', 'knave', 'Mirror assassin', 'Pounce without pause',
      'The hostile Mooggy keeps the assassin’s claw swipes, nail pressure, random pounce, and long Zoomies chase as a separate selectable form.',
      { damageMultiplier: 0.85, hpMultiplier: 1.08, moveSpeedMultiplier: 1.2, aoeRadiusMultiplier: 0.95 },
      { melee: 'mooggy_swipe', laser: 'nail_shot', smash: 'random_pounce', dash: 'mooggy_zoomies' },
      'claw_gauntlets', { hemes_scarf: 1, mooggy_zoomies: 1, churu_stick: 1 },
    ),
  });

  // NPC enemies earn the same signature techniques as their playable forms.
  // Level 7 introduces the defining attack, level 14 adds the advanced pattern,
  // and level 20 gives late-run summoning bosses the full Cult Follower call.
  const NPC_ENEMY_MOVE_PROGRESSION = Object.freeze({
    hunter: Object.freeze([
      Object.freeze({ level: 7, moveKey: 'hunter_volley' }),
      Object.freeze({ level: 14, moveKey: 'hunter_trap' }),
    ]),
    charger: Object.freeze([
      Object.freeze({ level: 7, moveKey: 'charger_rush' }),
    ]),
    laser: Object.freeze([
      Object.freeze({ level: 7, moveKey: 'dungeon_beam' }),
      Object.freeze({ level: 14, moveKey: 'laser_nova' }),
    ]),
    sniper: Object.freeze([
      Object.freeze({ level: 7, moveKey: 'sniper_round' }),
    ]),
    machine_gunner: Object.freeze([
      Object.freeze({ level: 7, moveKey: 'gunner_barrage' }),
      Object.freeze({ level: 14, moveKey: 'bullet_nova' }),
    ]),
    cult_mage: Object.freeze([
      Object.freeze({ level: 7, moveKey: 'cult_bolt_volley' }),
      Object.freeze({ level: 14, moveKey: 'cult_frenzy' }),
    ]),
    summoner: Object.freeze([
      Object.freeze({ level: 7, moveKey: 'summon_cult_followers' }),
    ]),
    shield_unit: Object.freeze([
      Object.freeze({ level: 7, moveKey: 'shield_throw' }),
      Object.freeze({ level: 14, moveKey: 'shield_guard' }),
    ]),
    boss_spawner: Object.freeze([
      Object.freeze({ level: 14, moveKey: 'summon_cult_followers' }),
    ]),
    queen_cult: Object.freeze([
      Object.freeze({ level: 20, moveKey: 'summon_cult_followers' }),
    ]),
    antony_blemmye: Object.freeze([
      Object.freeze({ level: 7, moveKey: 'antony_bite' }),
      Object.freeze({ level: 14, moveKey: 'antony_knife_throw' }),
      Object.freeze({ level: 20, moveKey: 'antony_freeze_ball' }),
    ]),
  });

  function isNpcEnemyMoveUnlocked(type, moveKey, level) {
    const progression = NPC_ENEMY_MOVE_PROGRESSION[String(type || '')];
    if (!progression) return false;
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    for (let index = 0; index < progression.length; index += 1) {
      const unlock = progression[index];
      if (unlock.moveKey === moveKey) return normalizedLevel >= unlock.level;
    }
    return false;
  }

  function getNpcEnemyUnlockedMoves(type, level) {
    const progression = NPC_ENEMY_MOVE_PROGRESSION[String(type || '')] || [];
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    return progression.filter(unlock => normalizedLevel >= unlock.level).map(unlock => unlock.moveKey);
  }

  for (const type of Object.keys(ENEMY_CATALOG)) {
    if (!PLAYABLE_ENEMY_BUILD_DEFS[type]) {
      throw new Error(`Missing playable build for enemy type "${type}".`);
    }
  }

  const PLAYABLE_ENEMY_ROSTER = Object.freeze(Object.keys(ENEMY_CATALOG).map(type => {
    const enemyDef = ENEMY_CATALOG[type];
    const build = PLAYABLE_ENEMY_BUILD_DEFS[type];
    return Object.freeze({
      type,
      characterKey: `enemy_${type}`,
      spriteKey: enemyDef.spriteKey,
      ...build,
    });
  }));
  const PLAYABLE_ENEMY_BY_CHARACTER = Object.freeze(Object.fromEntries(
    PLAYABLE_ENEMY_ROSTER.map(def => [def.characterKey, def]),
  ));
  const PLAYABLE_ENEMY_BY_TYPE = Object.freeze(Object.fromEntries(
    PLAYABLE_ENEMY_ROSTER.map(def => [def.type, def]),
  ));

  function getPlayableEnemyDefinition(value) {
    const key = String(value || '');
    return PLAYABLE_ENEMY_BY_CHARACTER[key] || PLAYABLE_ENEMY_BY_TYPE[key] || null;
  }

  function isPlayableEnemyCharacterKey(value) {
    return !!PLAYABLE_ENEMY_BY_CHARACTER[String(value || '')];
  }

  function getPlayableEnemyCharacterKeys() {
    return PLAYABLE_ENEMY_ROSTER.map(def => def.characterKey);
  }

  const STANDARD_ENEMY_TYPES = Object.freeze([
    'hunter', 'charger', 'laser', 'knave', 'sniper', 'machine_gunner', 'golem', 'cult_mage',
    'cult_follower', 'summoner', 'shield_unit', 'healer', 'boss_spawner',
  ]);
  const BOSS_ENEMY_TYPES = Object.freeze([
    'queen_cult', 'bulk_golem', 'artificer_knave', 'bowman_bane', 'antony_blemmye', 'handsome_devil',
    'ent_of_pestilence', 't_rex', 'sea_snake', 'god',
  ]);
  const ELITE_POWER_TYPES = Object.freeze(['lazered', 'enflamed', 'breezy', 'gross', 'nothing', 'giant', 'blessed']);
  const BOSS_RUSH_START_LEVEL = 2;

  function getBossRushBossLevel(stage) {
    return BOSS_RUSH_START_LEVEL + Math.max(0, Math.floor(Number(stage) || 0));
  }

  function getEnemyDefinition(type) {
    return ENEMY_CATALOG[type] || ENEMY_CATALOG.hunter;
  }

  return {
    ENEMY_CATALOG,
    STANDARD_ENEMY_TYPES,
    BOSS_ENEMY_TYPES,
    ELITE_POWER_TYPES,
    PLAYABLE_ENEMY_BUILD_DEFS,
    PLAYABLE_ENEMY_ROSTER,
    PLAYABLE_ENEMY_BY_CHARACTER,
    PLAYABLE_ENEMY_BY_TYPE,
    NPC_ENEMY_MOVE_PROGRESSION,
    BOSS_RUSH_START_LEVEL,
    getEnemyDefinition,
    getPlayableEnemyDefinition,
    isPlayableEnemyCharacterKey,
    getPlayableEnemyCharacterKeys,
    isNpcEnemyMoveUnlocked,
    getNpcEnemyUnlockedMoves,
    getBossRushBossLevel,
  };
});
