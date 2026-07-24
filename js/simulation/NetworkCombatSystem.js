(function initializeNetworkCombatSystem(root, factory) {
  const contentApi = typeof require === 'function'
    ? { ...require('./SharedCombatContent.js'), ...require('./SharedMoveContent.js'), ...require('./SharedEnemyContent.js'), ...require('./SharedEnemyAISystem.js'), ...require('./SharedEncounterSystem.js'), ...require('./SharedItemContent.js'), ...require('./SharedItemDefinitions.js'), ...require('./SharedItemEffectSystem.js'), ...require('./SharedEventItemSystem.js'), ...require('./SharedDamageSystem.js'), ...require('./SharedHitResolutionSystem.js'), ...require('./SharedStatusSystem.js'), ...require('./SharedProjectileSystem.js'), ...require('./SharedProgressionSystem.js'), ...require('./SharedRoomInteriorSystem.js'), ...require('./SharedWorldMutationSystem.js'), ...require('./SharedForgeSystem.js'), ...require('./SharedInventorySystem.js'), ...require('./SharedAcquisitionSystem.js'), ...require('./SharedChestSystem.js'), ...require('./SharedShopSystem.js'), ...require('./SharedSpecialRoomSystem.js'), ...require('./SharedRoomLifecycleSystem.js'), ...require('./SharedEnemyBehaviorSystem.js'), ...require('./CampaignMovementRules.js') }
    : { ...(root.NeoNyke?.content || {}), ...(root.NeoNyke?.simulation || {}) };
  const floorApi = typeof require === 'function' ? require('./DeterministicFloorGenerator.js') : (root.NeoNyke?.simulation || {});
  const api = factory(root.NeoNyke?.simulation || {}, contentApi, floorApi);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNetworkCombatSystemApi(browserApi, contentApi, floorApi) {
  'use strict';

  const generateFloorLayout = floorApi?.generateFloorLayout || browserApi?.generateFloorLayout;
  const MAX_FLOOR = 10;
  const STAIRS_DWELL_TICKS = 30; // ~1.5s at 20 Hz — a deliberate hold, not a walk-over.
  const REVIVE_DWELL_TICKS = 40; // ~2s standing over a downed ally to bring them back.
  const REVIVE_RADIUS = 44;
  const REVIVE_HEALTH_FRACTION = 0.4;
  const RIVAL_RESPAWN_TICKS = 60;
  const ATTACK_COOLDOWN_TICKS = 7;
  const PROJECTILE_SPEED = 520;
  const PROJECTILE_DAMAGE = 30;
  const PROJECTILE_LIFETIME_TICKS = 24;
  // Keep defeated enemies authoritative for the campaign's full 11-second
  // corpse presentation. Clients adapt these records into the same deadBodies
  // renderer; removing them after the old 0.4-second network flash made combat
  // visibly unlike single-player and made late snapshots lose the corpse.
  const ENEMY_DEATH_TICKS = 220;
  const ENCOUNTER_ROOM_TYPES = new Set(['start', 'combat', 'challenge', 'ladder', 'boss', 'god']);
  // Match the campaign: ordinary combat rooms remain escapable. Only authored
  // commitment encounters seal their doors until resolved.
  const LOCKING_ENCOUNTER_ROOM_TYPES = new Set(['challenge', 'ladder', 'boss', 'god']);
  const {
    CHARACTER_DEFAULT_WEAPONS = {},
    CHARACTER_STARTING_ITEMS = {},
    DEFAULT_WEAPON_ATTACKS = {},
    PROJECTILE_TYPE_DEFS = {},
    WEAPON_BASE_STATS = {},
    MOVE_BASE_STATS = {},
    MOVE_PRESENTATION_DEFS = {},
    MOVE_SLOT_BY_KEY = {},
    KIT_ALTERNATIVES = {},
    CONTINUOUS_BEAM_MOVES = [],
    SHARED_BEHAVIOR_TYPES = [],
    createCampaignEnemyBehaviors = null,
    BEAM_CHANNEL_PROFILES = {},
    BEAM_RECOIL_ACCEL = 45,
    WIZARD_LAZER_EXTRA_RECOIL = 220,
    steerBeamChannelAngle = (_moveKey, angle) => Number(angle) || 0,
    getDefaultMoveLoadout = () => ({ melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' }),
    getMoveBaseCharges = () => 1,
    createPowerDiskBurstDescriptors = () => [],
    ENEMY_CATALOG = {},
    STANDARD_ENEMY_TYPES = [],
    BOSS_ENEMY_TYPES = [],
    ELITE_POWER_TYPES = [],
    getEnemyDefinition = type => ENEMY_CATALOG[type],
    getCampaignEncounterPlan = () => [],
    getCampaignFloorBossType = () => 'queen_cult',
    invokeCampaignEnemyAI = () => false,
    segmentHitsCircle = () => null,
    getCharacterDefaultWeapon = characterKey => CHARACTER_DEFAULT_WEAPONS[characterKey] || 'thorns_bleed_blade',
    createCampaignItemChoices = () => [],
    createTreasureChestPlan = () => [],
    ITEM_DROP_ENTRIES = [],
    ITEM_DEFS = {},
    rollCampaignItem = () => '',
    applyForgeCommand = () => ({ ok: false, reason: 'FORGE_UNAVAILABLE' }),
    collectCampaignItem: collectSharedCampaignItem = () => ({ ok: false }),
    applyInventoryCommand = () => ({ ok: false, reason: 'INVENTORY_UNAVAILABLE' }),
    applyAcquisitionCommand = () => ({ ok: false, reason: 'ACQUISITION_UNAVAILABLE' }),
    collectCampaignPickup = () => ({ ok: false, reason: 'ACQUISITION_UNAVAILABLE' }),
    createCampaignJesterGate = () => ({ ok: false, reason: 'ACQUISITION_UNAVAILABLE' }),
    useCampaignJesterGate = () => ({ ok: false, reason: 'ACQUISITION_UNAVAILABLE' }),
    openCampaignChest = () => ({ ok: false, reason: 'CHEST_UNAVAILABLE' }),
    claimCampaignChestSelection = () => ({ ok: false, reason: 'CHEST_UNAVAILABLE' }),
    activateEquipment = () => ({ ok: false, reason: 'EQUIPMENT_UNAVAILABLE' }),
    updateEquipmentEffects = () => [],
    stockCampaignShop = () => null,
    purchaseCampaignShop = () => ({ ok: false, reason: 'SHOP_UNAVAILABLE' }),
    applySpecialRoomChoice = () => ({ ok: false, reason: 'SPECIAL_ROOM_UNAVAILABLE' }),
    RANGED_BEHAVIORS = new Set(),
    SPAWN_LOCK_TICKS = 15,
    resolveRoomObstacleMovement = (_room, _entity, x, y) => ({ x, y, blockedX: false, blockedY: false }),
    circleIntersectsRoomObstacle = () => false,
    scaleCampaignDamage = options => Math.max(0, Number(options.damage || 0)),
    resolveCampaignCrit = () => ({ isCrit: false, critMultiplier: 1 }),
    createCampaignStatusMap = () => ({}),
    ensureCampaignStatuses = entity => entity?.statuses || {},
    applyCampaignStatus = () => null,
    getCampaignStatusStacks = () => 0,
    getCampaignSlowMultiplier = () => 1,
    getCampaignBleedResistance = () => 1,
    getCampaignGenericStatusResistance = () => 0,
    tickCampaignStatuses = () => [],
    resolveCampaignOnHitStatusProcs = () => [],
    syncCampaignItemStats = state => state,
    applyCampaignKillCharge = () => ({ ok: true, intents: [] }),
    applyCampaignRevive = player => ({ ok: true, health: player?.hp || 0 }),
    configureCampaignProjectile = projectile => projectile,
    steerCampaignHomingProjectile = projectile => projectile,
    advanceCampaignProjectile = (projectile, delta) => {
      const previous = { x: projectile.x, y: projectile.y };
      projectile.x += Number(projectile.vx || 0) * delta;
      projectile.y += Number(projectile.vy || 0) * delta;
      return previous;
    },
    bounceCampaignProjectile = () => false,
    createCampaignSubSpawnDescriptors = () => [],
    applyCampaignDestructibleDamage = () => ({ ok: false, drops: [] }),
    applyCampaignLevelUp = () => null,
    finishCampaignChallenge = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    resolveCampaignChallengePickup = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    updateCampaignGardenNode = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    collectCampaignGardenFruit = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    advanceCampaignMovingWorldEntity = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    purchaseCampaignSecretVendor = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    lootCampaignSecretBossChest = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    useCampaignLadder = () => ({ ok: false, reason: 'ROOM_LIFECYCLE_UNAVAILABLE' }),
    rollCampaignChallengeType = () => 'mirror',
    createCampaignSecretRoomPlan = () => ({ ok: false, pickups: [] }),
    applyCampaignImpulse = () => ({ ok: false, reason: 'MOVEMENT_UNAVAILABLE' }),
  } = contentApi || {};
  const combatRandomByState = new WeakMap();
  const CONTINUOUS_BEAM_MOVE_SET = new Set(CONTINUOUS_BEAM_MOVES);
  // Input button bit the client holds while its laser button is down. A channel
  // that has seen the bit ends as soon as it clears (release-to-stop, like the
  // campaign); a channel that never sees it simply runs its full duration.
  const BUTTON_LASER_HELD = 1;
  const TURTLE_WAVE_HP_PER_SECOND = 2;
  const HEAVY_HIT_HEALTH_RATIO = 0.5;
  const HEAVY_KNOCKBACK_THRESHOLD = 6600;
  const HEAVY_HIT_STUN_SECONDS = 0.62;
  const HEAVY_KNOCKBACK_STUN_SECONDS = 0.46;
  const BEAM_STRUGGLE_DURATION_TICKS = 60;
  const BEAM_STRUGGLE_MASH_FORCE = 0.085;
  const HERO_PRIMARY_ATTACKS = Object.freeze(Object.fromEntries(
    Object.entries(CHARACTER_DEFAULT_WEAPONS).map(([characterKey, weaponKey]) => [characterKey, Object.freeze({
      characterKey,
      weaponKey,
      ...(WEAPON_BASE_STATS[weaponKey] || {}),
      ...(DEFAULT_WEAPON_ATTACKS[weaponKey] || {}),
      projectileKind: DEFAULT_WEAPON_ATTACKS[weaponKey]?.kind,
      kind: weaponKey,
      cooldownTicks: Math.max(1, Math.ceil(Number(WEAPON_BASE_STATS[weaponKey]?.cooldown || 0.5) * 20)),
    })]),
  ));
  const ENEMY_ARCHETYPES = ENEMY_CATALOG;
  // These are the campaign character multipliers applied to its 120 HP base.
  // Keep the authority's selected hero identical to createDefaultPlayer(),
  // rather than maintaining a separate multiplayer balance table.
  const HERO_BASE_STATS = Object.freeze({
    princess: Object.freeze({ maxHp: 138, moveSpeed: 228, damageMultiplier: 1.2 }),
    thorn_knight: Object.freeze({ maxHp: 120, moveSpeed: 228, damageMultiplier: 1 }),
    metao: Object.freeze({ maxHp: 120, moveSpeed: 228, damageMultiplier: 0.5 }),
    gelleh: Object.freeze({ maxHp: 120, moveSpeed: 228, damageMultiplier: 1 }),
    mooggy: Object.freeze({ maxHp: 130, moveSpeed: 228, damageMultiplier: 0.6 }),
    turtle_boy: Object.freeze({ maxHp: 144, moveSpeed: 228, damageMultiplier: 1 }),
    sarge: Object.freeze({ maxHp: 108, moveSpeed: 228, damageMultiplier: 1.05 }),
  });
  function getHeroPrimaryAttack(characterKey) {
    return HERO_PRIMARY_ATTACKS[characterKey] || HERO_PRIMARY_ATTACKS.thorn_knight;
  }

  function applyForgeStats(player, itemType, itemKey, baseStats) {
    const result = { ...(baseStats || {}) };
    const upgrades = player?.anvilUpgrades?.[itemType]?.[itemKey] || {};
    const schema = itemType === 'weapon'
      ? contentApi.WEAPON_UPGRADEABLE_STATS || {}
      : contentApi.MOVE_UPGRADEABLE_STATS || {};
    Object.entries(upgrades).forEach(([statKey, count]) => {
      if (!(statKey in result) || !schema[statKey]) return;
      result[statKey] = Number(result[statKey]) + Math.max(0, Math.floor(Number(count) || 0)) * Number(schema[statKey].step);
      if (statKey === 'cooldown') result[statKey] = Math.max(Number(baseStats[statKey]) * 0.5, result[statKey]);
    });
    return result;
  }

  function collectNetworkCampaignItem(player, itemKey) {
    return !!collectSharedCampaignItem(player, itemKey)?.ok;
  }

  // Kit picks come from untrusted clients: keep only slots this character has
  // alternatives for, and only moves from that slot's KIT_ALTERNATIVES list.
  // Returns null when any provided entry is invalid so callers can reject the
  // message instead of silently applying a different kit than the client chose.
  function sanitizeKitChoices(characterKey, kitChoices) {
    if (kitChoices === undefined || kitChoices === null) return {};
    if (typeof kitChoices !== 'object' || Array.isArray(kitChoices)) return null;
    const alternatives = KIT_ALTERNATIVES[characterKey] || {};
    const sanitized = {};
    for (const [slot, moveKey] of Object.entries(kitChoices)) {
      const options = alternatives[slot];
      if (!Array.isArray(options) || !options.includes(moveKey)) return null;
      if (moveKey !== options[0]) sanitized[slot] = moveKey;
    }
    return sanitized;
  }

  function applyNetworkHeroProfile(player, characterKey, kitChoices) {
    const key = HERO_BASE_STATS[characterKey] ? characterKey : 'thorn_knight';
    const profile = HERO_BASE_STATS[key];
    const previousMaximum = Math.max(1, Number(player.maxHp || profile.maxHp));
    const healthRatio = Math.max(0, Math.min(1, Number(player.hp ?? previousMaximum) / previousMaximum));
    player.characterKey = key;
    player.character = key;
    player.equippedWeapon = getCharacterDefaultWeapon(key);
    player.equippedMoves = getDefaultMoveLoadout(key);
    player.kitChoices = sanitizeKitChoices(key, kitChoices) || {};
    Object.assign(player.equippedMoves, player.kitChoices);
    player.ownedWeapons = { [player.equippedWeapon]: true };
    player.ownedMoves = Object.fromEntries(Object.values(player.equippedMoves).map(moveKey => [moveKey, true]));
    player.items = { ...(CHARACTER_STARTING_ITEMS[key] || {}) };
    player.equipmentSlots = key === 'metao' ? ['mateos_bag'] : [];
    player.moveCooldownUntilTick = {};
    // Charge pools are built lazily per move by ensureMoveChargeState (which reads
    // the character's base charges), so a character swap can't strand a stale pool.
    player.moveChargeState = {};
    player.statusUntilTick = {};
    player.statuses = createCampaignStatusMap();
    player.barrier = 0;
    player.maxHp = profile.maxHp;
    player.hp = Math.round(profile.maxHp * healthRatio);
    player.moveSpeed = profile.moveSpeed;
    player.damageMultiplier = profile.damageMultiplier;
    return player;
  }

  function currentRoom(state, roomId = state.floorState?.currentRoomId) {
    return state.floorState?.layout?.rooms?.find(room => room.id === roomId) || null;
  }

  // God mode: collecting every relic grants a 12s "godTimer" window that boosts
  // damage/speed and slashes cooldowns, exactly like the campaign. On the
  // authority the window end tick lives on the player as `godUntilTick`.
  const RELIC_KEYS = Object.freeze(Object.keys(ITEM_DEFS));
  function godModeActive(state, player) {
    return Number(state?.tick || 0) < Number(player?.godUntilTick || 0);
  }
  function maybeGrantGodMode(state, player, emitEvent) {
    if (godModeActive(state, player)) return;
    if (!RELIC_KEYS.length) return;
    const items = player.items || {};
    if (!RELIC_KEYS.every(key => Number(items[key] || 0) > 0)) return;
    player.godUntilTick = state.tick + Math.round(12 * 20);
    emitEvent('GOD_MODE_GRANTED', { playerId: player.id, untilTick: player.godUntilTick });
  }

  function livingEncounterEnemies(state, roomId = state.floorState?.currentRoomId) {
    return Object.values(state.enemies || {}).filter(enemy => (
      enemy && enemy.roomId === roomId && !enemy.dead && Number(enemy.health) > 0
    ));
  }

  function isNetworkRoomLocked(state, roomId = state.floorState?.currentRoomId) {
    const room = currentRoom(state, roomId);
    if (!LOCKING_ENCOUNTER_ROOM_TYPES.has(room?.type)) return false;
    const encounter = state.floorState?.encounters?.[roomId];
    return encounter?.status === 'active' && livingEncounterEnemies(state, roomId).length > 0;
  }

  function encounterCount(room) {
    if (room?.type === 'boss' || room?.type === 'god') return 1;
    if (room?.type === 'challenge') return 3;
    if (room?.type === 'ladder') return 3;
    if (room?.type === 'combat') return 2;
    return 1;
  }

  function getEncounterPool(room, floorNumber) {
    if (room?.type === 'god') return ['god'];
    if (room?.type === 'boss') {
      const bosses = BOSS_ENEMY_TYPES.filter(type => !['god', 'bowman_bane'].includes(type));
      return bosses.length ? bosses : ['queen_cult'];
    }
    if (room?.type === 'start') return ['cult_follower'];
    const floor = Math.max(1, Number(floorNumber || 1));
    const pool = ['hunter', 'charger', 'laser', 'knave', 'cult_mage'];
    if (floor >= 3) pool.push('sniper', 'golem');
    if (floor >= 4) pool.push('summoner', 'shield_unit', 'healer');
    if (floor >= 6) pool.push('machine_gunner');
    if (room?.type === 'challenge') pool.push('golem', 'shield_unit', 'summoner');
    if (room?.type === 'ladder') pool.push('boss_spawner', 'healer');
    return pool.filter(type => STANDARD_ENEMY_TYPES.includes(type));
  }

  // Build a mirror-kit snapshot from the source player's authoritative loadout
  // and spawn a mirror champion that fights with it (the challenge-room boss).
  function spawnMirrorChampionEncounter(state, room, emitEvent) {
    const source = state.players?.[room.mirrorSourcePlayerId]
      || Object.values(state.players || {}).find(player => !player?.disconnected && player.roomId === room.id);
    if (!source) return null;
    const definition = getEnemyDefinition('mirror_knight');
    const itemStats = source.itemStats || {};
    const attackSpeed = Math.max(0.3, Number(itemStats.attackSpeedMultiplier || 1) * Number(source.attackSpeed || 1) || 1);
    const damageMult = Math.max(0.1, Number(source.damageMultiplier || 1));
    const baseDamage = Math.max(1, Math.round(24 * damageMult + Number(source.attackPower || 0)));
    const equippedMoves = { ...(source.equippedMoves || {}) };
    const moveStats = {};
    Object.entries(equippedMoves).forEach(([, moveKey]) => {
      const base = MOVE_BASE_STATS[moveKey];
      if (!base) return;
      moveStats[moveKey] = {
        damage: Math.max(1, Math.round((Number(base.damage || baseDamage)) * damageMult + Number(source.attackPower || 0))),
      };
    });
    const weaponKey = source.equippedWeapon || '';
    const weaponBase = WEAPON_BASE_STATS[weaponKey] || {};
    const weaponStats = weaponKey ? {
      damage: Math.max(1, Math.round((Number(weaponBase.damage || 24)) * damageMult + Number(source.attackPower || 0))),
      range: Math.max(40, Number(weaponBase.range || 90)),
      knockback: Math.max(0, Number(weaponBase.knockback || 140)),
    } : null;
    // Match the campaign's mirror HP/speed: the champion carries the source
    // hero's max HP (min 180) and the campaign 228 base speed.
    const maxHealth = Math.max(180, Math.round(Number(source.maxHp || 120)));
    const enemyId = state.allocateEntityId('enemy');
    state.enemies[enemyId] = {
      id: enemyId,
      type: 'mirror_knight',
      spriteKey: source.characterKey || definition.spriteKey,
      behavior: 'mirror',
      roomId: room.id,
      x: Number(state.floorState.width || 900) / 2,
      y: Number(state.floorState.height || 700) / 2 - 150,
      vx: 0, vy: 0,
      radius: definition.radius,
      moveSpeed: 228,
      maxHealth, health: maxHealth,
      contactDamage: baseDamage,
      projectileDamage: baseDamage,
      elite: false, eliteTypes: [], elitePowers: [], patterns: [],
      boss: true, mirrorExactCopy: true,
      bleedImmune: false,
      statuses: createCampaignStatusMap(),
      contactCooldownUntilTick: 0,
      attackCooldownUntilTick: state.tick + 16,
      attackWindupUntilTick: 0,
      state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
      stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
      attackCd: 0.5,
      // Mirror kit read by updateMirrorChampion.
      attackSpeed,
      mirrorMoves: equippedMoves,
      mirrorMoveStats: moveStats,
      mirrorItemStats: {
        beamDamageMultiplier: Number(itemStats.beamDamageMultiplier || 1),
        aoeDamageMultiplier: Number(itemStats.aoeDamageMultiplier || 1),
        bleedChance: Number(itemStats.bleedChance || 0),
      },
      mirrorWeapon: weaponKey,
      mirrorWeaponStats: weaponStats,
      mirrorCooldowns: {
        melee: Math.max(0.18, 0.4 / attackSpeed),
        laser: Math.max(0.75, 3.2 / attackSpeed),
        smash: Math.max(1.1, 4.2 / attackSpeed),
        dash: Math.max(0.55, 1.8 / attackSpeed),
      },
      beamDamage: Math.max(1, Math.round((moveStats[equippedMoves.laser]?.damage || baseDamage) * Number(itemStats.beamDamageMultiplier || 1))),
      smashDamage: Math.max(1, Math.round((moveStats[equippedMoves.smash]?.damage || baseDamage) * Number(itemStats.aoeDamageMultiplier || 1))),
    };
    const encounter = {
      roomId: room.id,
      roomType: room.type,
      status: 'active',
      enemyIds: [enemyId],
      startedTick: state.tick,
    };
    state.floorState.encounters[room.id] = encounter;
    emitEvent('ENEMY_SPAWNED', { enemyId, roomId: room.id, enemyType: 'mirror_knight', mirrorSourcePlayerId: source.id });
    return encounter;
  }

  // Spawn any rivals marked to return this floor into the given combat room,
  // mirroring the slain character's default kit. Rivals hunt the nearest player.
  function spawnPendingRivals(state, room, emitEvent) {
    if (!room || !ENCOUNTER_ROOM_TYPES.has(room.type) || room.type === 'start') return;
    const roster = Array.isArray(state.rivalRoster) ? state.rivalRoster : [];
    roster.forEach(entry => {
      if (!entry.pendingSpawn || entry.dead || entry.friend) return;
      entry.pendingSpawn = false;
      entry.spawnedInRoomId = room.id;
      const definition = getEnemyDefinition('rival');
      const characterKey = entry.characterKey;
      const equippedMoves = getDefaultMoveLoadout(characterKey);
      const weaponKey = getCharacterDefaultWeapon(characterKey);
      const profile = HERO_BASE_STATS[characterKey] || HERO_BASE_STATS.thorn_knight;
      const floorScale = 1 + (Number(state.floorNumber || 1) - 1) * 0.12;
      const baseDamage = Math.max(1, Math.round(24 * Number(profile.damageMultiplier || 1) * floorScale));
      const maxHealth = Math.max(220, Math.round(Number(profile.maxHp || 120) * 1.4 * floorScale));
      const enemyId = state.allocateEntityId('enemy');
      const moveStats = {};
      Object.values(equippedMoves).forEach(moveKey => {
        const base = MOVE_BASE_STATS[moveKey];
        if (base) moveStats[moveKey] = { damage: Math.max(1, Math.round(Number(base.damage || baseDamage) * Number(profile.damageMultiplier || 1) * floorScale)) };
      });
      const weaponBase = WEAPON_BASE_STATS[weaponKey] || {};
      state.enemies[enemyId] = {
        id: enemyId,
        type: 'rival',
        spriteKey: characterKey,
        behavior: 'mirror',
        roomId: room.id,
        rivalCharacterKey: characterKey,
        rivalFriend: !!entry.friend,
        rivalVendetta: !!entry.vendetta,
        x: Number(state.floorState.width || 900) / 2 + (Math.random() - 0.5) * 120,
        y: Number(state.floorState.height || 700) / 2 - 120,
        vx: 0, vy: 0,
        radius: definition.radius,
        moveSpeed: 228,
        maxHealth, health: maxHealth,
        contactDamage: baseDamage,
        projectileDamage: baseDamage,
        elite: false, eliteTypes: [], elitePowers: [], patterns: [],
        boss: true, bleedImmune: false,
        statuses: createCampaignStatusMap(),
        contactCooldownUntilTick: 0,
        attackCooldownUntilTick: state.tick + 16,
        attackWindupUntilTick: 0,
        state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
        stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
        attackCd: 0.5, attackSpeed: 1,
        mirrorMoves: equippedMoves,
        mirrorMoveStats: moveStats,
        mirrorItemStats: { beamDamageMultiplier: 1, aoeDamageMultiplier: 1, bleedChance: 0 },
        mirrorWeapon: weaponKey,
        mirrorWeaponStats: weaponKey ? {
          damage: Math.max(1, Math.round(Number(weaponBase.damage || 24) * Number(profile.damageMultiplier || 1) * floorScale)),
          range: Math.max(40, Number(weaponBase.range || 90)),
          knockback: Math.max(0, Number(weaponBase.knockback || 140)),
        } : null,
        mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
        beamDamage: Math.max(1, Math.round((moveStats[equippedMoves.laser]?.damage || baseDamage))),
        smashDamage: Math.max(1, Math.round((moveStats[equippedMoves.smash]?.damage || baseDamage))),
      };
      const encounter = state.floorState.encounters[room.id];
      if (encounter && Array.isArray(encounter.enemyIds)) encounter.enemyIds.push(enemyId);
      emitEvent('ENEMY_SPAWNED', { enemyId, roomId: room.id, enemyType: 'rival', rivalCharacterKey: characterKey, vendetta: !!entry.vendetta });
    });
  }

  function ensureNetworkEncounter(state, random, emitEvent = () => {}, roomId = null) {
    const occupiedRoomId = roomId || Object.values(state.players || {}).find(player => !player?.disconnected)?.roomId || state.floorState?.currentRoomId;
    const room = currentRoom(state, occupiedRoomId);
    if (!room || !ENCOUNTER_ROOM_TYPES.has(room.type)) return null;
    if (room.type === 'challenge') {
      room.challengeType = room.challengeType || rollCampaignChallengeType(
        state.floorNumber,
        () => random.scoped(`challenge:type:${state.floorNumber}:${room.id}`).next(),
      );
      if (!room.challengeStarted) {
        const existingStarter = Object.values(state.pickups || {}).find(pickup => pickup.type === 'challengeStarter' && pickup.roomId === room.id);
        if (!existingStarter) {
          const pickupId = state.allocateEntityId('pickup');
          state.pickups[pickupId] = {
            id: pickupId, type: 'challengeStarter', trial: room.challengeType, roomId: room.id,
            x: Number(state.floorState.width || 900) / 2,
            y: Number(state.floorState.height || 700) / 2,
            radius: 24, spawnTick: state.tick,
          };
          emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: 'challengeStarter', roomId: room.id, trial: room.challengeType });
        }
        return null;
      }
    }
    state.floorState.encounters = state.floorState.encounters || {};
    if (state.floorState.encounters[room.id]) {
      // A returning rival joins the party's current fight in progress.
      spawnPendingRivals(state, room, emitEvent);
      return state.floorState.encounters[room.id];
    }

    // A started mirror challenge fields a single mirror champion mirroring the
    // activating player's kit, instead of the generic wave plan.
    if (room.type === 'challenge' && room.challengeType === 'mirror' && room.challengeStarted) {
      const encounter = spawnMirrorChampionEncounter(state, room, emitEvent);
      if (encounter) return encounter;
    }

    const stream = random.scoped(`enemy-spawning:${state.floorNumber}:${room.id}`);
    const plan = getCampaignEncounterPlan(room, {
      floorNumber: state.floorNumber,
      random: stream,
      difficulty: state.matchRules?.difficulty || {},
      challengeBonus: state.matchRules?.swarmRooms ? 2 : 0,
      roomWeightBonus: Number(state.matchRules?.difficulty?.roomWeightBonus || 0),
    });
    const enemyIds = [];
    for (let index = 0; index < plan.length; index += 1) {
      const enemyId = state.allocateEntityId('enemy');
      const angle = stream.next() * Math.PI * 2;
      const distance = 175 + stream.next() * 95;
      const type = plan[index];
      const archetype = getEnemyDefinition(type) || getEnemyDefinition('hunter');
      const healthScale = room.type === 'challenge' ? 1.25 : 1;
      const elite = !archetype.boss && room.type !== 'start' && stream.chance(room.type === 'challenge' ? 0.3 : 0.08);
      const elitePower = elite ? ELITE_POWER_TYPES[stream.int(0, ELITE_POWER_TYPES.length - 1)] : null;
      const eliteHealthScale = elitePower === 'giant' ? 1.82 : elite ? 1.35 : 1;
      const eliteDamageScale = elite ? 1.18 : 1;
      const enemy = {
        id: enemyId,
        type,
        spriteKey: archetype.spriteKey,
        behavior: archetype.behavior,
        roomId: room.id,
        x: 450 + Math.cos(angle) * distance,
        y: 350 + Math.sin(angle) * Math.min(distance, 210),
        vx: 0,
        vy: 0,
        radius: archetype.radius,
        moveSpeed: archetype.moveSpeed * (room.type === 'challenge' ? 1.08 : 1),
        maxHealth: Math.round(archetype.maxHealth * healthScale * eliteHealthScale),
        health: Math.round(archetype.maxHealth * healthScale * eliteHealthScale),
        contactDamage: Math.round(archetype.contactDamage * eliteDamageScale),
        projectileDamage: Math.max(5, Math.round(Number(archetype.projectileDamage || archetype.contactDamage * 0.75) * eliteDamageScale)),
        elite,
        eliteTypes: elite ? ['knight', elitePower] : [],
        elitePowers: elite ? [elitePower] : [],
        patterns: archetype.patterns || [],
        boss: !!archetype.boss,
        bleedImmune: !!archetype.bleedImmune,
        fireImmune: !!archetype.fireImmune,
        poisonImmune: !!archetype.poisonImmune,
        statuses: createCampaignStatusMap(),
        contactCooldownUntilTick: 0,
        attackCooldownUntilTick: state.tick + Math.max(4, Math.round(Number(archetype.attackCooldown || 1) * 20)) + stream.int(0, 6),
        attackWindupUntilTick: 0,
        state: 'chasing',
        facing: 1,
        spawnTick: state.tick,
        hitTick: -1,
        dead: false,
        // Campaign behavior state: seconds-based timers driven by the shared
        // authored bodies, seeded exactly like spawnEnemy() in game/enemies.js.
        stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0,
        swingTime: 0, dashTime: 0,
        attackCd: Math.max(0, Number(archetype.attackCooldown || 1)) + stream.next() * 0.3,
        ...(type === 'sniper'
          ? { sniperBehavior: (roll => (roll < 1 / 3 ? 'aggressive' : roll < 2 / 3 ? 'stayback' : 'melee'))(stream.next()) }
          : {}),
        ...(type === 'summoner' ? { summonCd: 4.4 } : {}),
        ...(type === 'shield_unit' ? { supportCd: 2.8 } : {}),
        ...(type === 'healer' ? { supportCd: 3 } : {}),
        ...(type === 'boss_spawner' ? { bossSpawnTimer: 30, bossSpawnWarnAt: 30, shoveCd: 3, shoveTimer: 0 } : {}),
        ...(type === 'cult_mage' ? { novaCd: 3, novaTimer: 0 } : {}),
        // Boss kits: seeded exactly like ENEMY_STATS in game/enemies.js.
        ...(type === 'queen_cult' ? { summonCd: 2.4, novaCd: 3, novaTimer: 0 } : {}),
        ...(type === 'bulk_golem' ? { splitReady: true, aoeTime: 3, jumpCd: 1.2 } : {}),
        ...(type === 'artificer_knave' ? { phase: 1 } : {}),
        ...(type === 'bowman_bane' ? { phase: 1, columnCd: 0, burstCd: 0, bowmanWarpCd: 2.8, thunderSmashCd: 0.6 } : {}),
        ...(type === 'antony_blemmye' ? { phase: 1, hammerCd: 1.55, biteCd: 1.15, slashCd: 2.05, deathBallCd: 5.4 } : {}),
        ...(type === 'handsome_devil' ? { phase: 1, spikeCd: 0.9, lavaGridCd: 2.4, devilLaserCd: 1.6, clawCd: 0.4, giantLaserCd: 3.6, beamRange: 560 } : {}),
        ...(type === 'god' ? { phase: 1, partitionAngles: [], partitionAngle: 0, partitionRotationDir: 1, partitionRotationSpeed: 0 } : {}),
      };
      state.enemies[enemyId] = enemy;
      enemyIds.push(enemyId);
      emitEvent('ENEMY_SPAWNED', { enemyId, roomId: room.id, enemyType: enemy.type, elite, elitePower });
    }
    const encounter = {
      roomId: room.id,
      roomType: room.type,
      status: 'active',
      enemyIds,
      startedTick: state.tick,
      clearedTick: null,
    };
    state.floorState.encounters[room.id] = encounter;
    // A rival scheduled to return this floor joins the first fight it reaches.
    spawnPendingRivals(state, room, emitEvent);
    return encounter;
  }

  function ensureNetworkRoomReward(state, random, emitEvent = () => {}, roomId = null) {
    const room = currentRoom(state, roomId);
    if (!room || room.type !== 'treasure') return null;
    state.floorState.rewards = state.floorState.rewards || {};
    const existingReward = state.floorState.rewards[room.id];
    if (existingReward) return state.interactables?.[existingReward.interactableIds?.[0]] || null;
    const stream = random.scoped(`loot:${state.floorNumber}:${room.id}`);
    const interactableIds = [];
    const chestPlan = createTreasureChestPlan({
      random: stream,
      floorNumber: state.floorNumber,
      geometry: state.floorState,
      itemChance: 0.9,
    });
    chestPlan.forEach(plannedChest => {
      const interactableId = state.allocateEntityId('interactable');
      const chest = {
        ...plannedChest,
        id: interactableId,
        kind: 'relic_chest',
        roomId: room.id,
        radius: 34,
        opened: false,
        claimedBy: null,
        spawnTick: state.tick,
      };
      state.interactables[interactableId] = chest;
      interactableIds.push(interactableId);
      emitEvent('INTERACTABLE_SPAWNED', { interactableId, kind: chest.kind, roomId: room.id });
    });
    state.floorState.rewards[room.id] = { interactableIds, status: 'available' };
    return state.interactables[interactableIds[0]];
  }

  function ensureAuthoritySpecialRoomContent(state, random, emitEvent, roomId) {
    const room = currentRoom(state, roomId);
    if (!room?.secret || room.type !== 'secret' || room.secretLifecycleInitialized) return;
    const stream = random.scoped(`secret:lifecycle:${state.floorNumber}:${room.id}`);
    const plan = createCampaignSecretRoomPlan(room, {
      floorNumber: state.floorNumber,
      maxFloor: MAX_FLOOR,
      width: state.floorState?.width,
      height: state.floorState?.height,
      random: () => stream.next(),
      xpCost: 30,
      xpValue: 40 + Number(state.floorNumber || 1) * 5,
      rollItem: nextRandom => rollCampaignItem(nextRandom),
      rollEliteItem: nextRandom => rollCampaignItem(nextRandom, { elite: true }),
    });
    if (!plan.ok) return;
    room.secretLifecycleInitialized = true;
    room.secretKind = plan.secretKind || room.secretKind;
    plan.pickups.forEach(descriptor => {
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = { id: pickupId, ...descriptor, roomId: room.id, radius: 22, spawnTick: state.tick };
      emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: descriptor.type, roomId: room.id });
    });
  }

  function scaleCampaignShopPrice(state, player, baseCost) {
    const depth = Math.max(1, Number(state.floorNumber || 1));
    const progression = 1 + Math.max(0, depth - 1) * 0.03 + Math.max(0, Number(state.elapsedSeconds || 0)) / 60 * 0.02;
    const xpProgress = Number(player?.items?.scholar_seal || 0) > 0
      ? Math.max(0, Math.min(1, Number(player.xp || 0) / Math.max(1, Number(player.xpToNext || 1))))
      : 0;
    return Math.max(1, Math.round(Number(baseCost || 0) * progression * (1 - xpProgress * 0.1)));
  }

  function campaignShopItemCost(state, player, itemIndex, itemKey) {
    const rarity = String(ITEM_DROP_ENTRIES.find(([key]) => key === itemKey)?.[2] || 'knight');
    const rarityMultiplier = rarity === 'god' ? 4.75 : rarity === 'wizard' ? 2.15 : 1;
    return scaleCampaignShopPrice(state, player, (32 + Number(state.floorNumber || 1) * 4 + itemIndex * 6) * rarityMultiplier);
  }

  function ensureCampaignShop(state, random, emitEvent = () => {}, roomId = null) {
    const room = currentRoom(state, roomId);
    if (!room || room.type !== 'shop') return null;
    if (room.shopStocked) return room.shopOffers;
    const stream = random.scoped(`shop-inventory:${state.floorNumber}:${room.id}`);
    const occupant = activePlayers(state).find(player => player.roomId === room.id) || null;
    stockCampaignShop(state, room, occupant, stream);
    emitEvent('SHOP_STOCKED', {
      roomId: room.id,
      offerCount: room.shopOffers?.length || 0,
      moveOfferCount: room.shopMoveOffers?.length || 0,
      weaponOfferCount: room.shopWeaponOffers?.length || 0,
      hasTrade: !room.shopTradeOffer?.unavailable,
    });
    return room.shopOffers;
  }

  function resolveShopPurchase(state, player, action, emitEvent) {
    const room = currentRoom(state, player.roomId);
    const result = purchaseCampaignShop(state, room, player, action);
    if (!result.ok) return false;
    emitEvent('SHOP_PURCHASED', { playerId: player.id, roomId: room.id, ...result, itemKey: result.kind === 'item' ? result.key : undefined });
    return true;
  }

  function resolveForgeCommand(state, player, action, emitEvent) {
    const room = currentRoom(state, player?.roomId);
    if (!room || room.type !== 'anvil' || player?.downed) return false;
    const result = applyForgeCommand(player, action, { WEAPON_BASE_STATS, MOVE_BASE_STATS });
    if (!result.ok) {
      emitEvent('GAME_COMMAND_REJECTED', { playerId: player.id, command: 'FORGE_COMMIT', reason: result.reason });
      return false;
    }
    emitEvent('FORGE_COMMITTED', {
      playerId: player.id,
      roomId: room.id,
      currency: result.currency,
      xp: result.xp,
      gold: result.gold,
      stagedSteps: result.stagedSteps,
      voucherSteps: result.voucherSteps,
    });
    return true;
  }

  function resolveInventoryCommand(state, player, action, emitEvent) {
    const result = action.action === 'ACTIVATE_EQUIPMENT'
      ? activateEquipment(player, action.itemKey, state.tick)
      : applyInventoryCommand(player, { ...action, type: action.action }, { MOVE_SLOT_BY_KEY, WEAPON_BASE_STATS });
    if (!result.ok) {
      emitEvent('GAME_COMMAND_REJECTED', { playerId: player.id, command: action.action, reason: result.reason });
      return false;
    }
    if (action.action === 'ACTIVATE_EQUIPMENT' && result.kind === 'panic') {
      player.statusUntilTick = {};
      livingEncounterEnemies(state, player.roomId).forEach(enemy => {
        const distance = Math.hypot(Number(enemy.x) - Number(player.x), Number(enemy.y) - Number(player.y));
        if (distance > 190 + (result.stacks - 1) * 28) return;
        const angle = Math.atan2(Number(enemy.y) - Number(player.y), Number(enemy.x) - Number(player.x));
        enemy.vx = Number(enemy.vx || 0) + Math.cos(angle) * (440 + (result.stacks - 1) * 55);
        enemy.vy = Number(enemy.vy || 0) + Math.sin(angle) * (440 + (result.stacks - 1) * 55);
        enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + Math.round((0.28 + (result.stacks - 1) * 0.05) * 20));
        damageEnemy(state, enemy, 8 + (result.stacks - 1) * 4, player.id, emitEvent, { attackKind: 'panic_button' });
      });
    } else if (action.action === 'ACTIVATE_EQUIPMENT' && result.kind === 'sparkle') {
      livingEncounterEnemies(state, player.roomId)
        .map(enemy => ({ enemy, distance: Math.hypot(Number(enemy.x) - Number(player.x), Number(enemy.y) - Number(player.y)) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, Math.min(12, 5 + (result.stacks - 1) * 2))
        .forEach(({ enemy }) => { enemy.critSparkleUntilTick = state.tick + (6 + result.stacks - 1) * 20; });
    }
    emitEvent(action.action === 'ACTIVATE_EQUIPMENT' ? 'EQUIPMENT_ACTIVATED' : 'INVENTORY_CHANGED', {
      playerId: player.id, roomId: player.roomId, ...result,
    });
    return true;
  }

  function updatePlayerEquipmentEffects(state, emitEvent) {
    Object.values(state.players || {}).forEach(player => {
      if (!player || player.downed) return;
      updateEquipmentEffects(player, state.tick).forEach(intent => {
        const enemies = livingEncounterEnemies(state, player.roomId);
        if (intent.kind === 'missiles') {
          const count = Math.min(4, intent.stacks);
          for (let index = 0; index < count; index += 1) {
            const target = enemies.slice().sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[index % Math.max(1, enemies.length)];
            const angle = target ? Math.atan2(target.y - player.y, target.x - player.x) : Number(player.aimDirection || 0) + (index - (count - 1) / 2) * 0.22;
            createPlayerProjectile(state, player, { kind: 'homing_missile', attackKind: intent.itemKey, damage: 16 * (1 + (count - 1) * 0.12), speed: 430, radius: 6, lifeTicks: 50 }, angle);
          }
        } else if (intent.kind === 'lightning') {
          enemies.map(enemy => ({ enemy, distance: Math.hypot(enemy.x - player.x, enemy.y - player.y) }))
            .filter(entry => entry.distance <= 300 + (intent.stacks - 1) * 22)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, Math.min(12, 7 + intent.stacks - 1))
            .forEach(({ enemy }) => damageEnemy(state, enemy, 15 + (intent.stacks - 1) * 3, player.id, emitEvent, { attackKind: intent.itemKey }));
          createAbilityEntity(state, player, { kind: 'lightning_column', presentationKey: intent.itemKey, radius: 42, damage: 13 + (intent.stacks - 1) * 2, durationTicks: 11, pulseIntervalTicks: 5 });
        } else if (intent.kind === 'mines') {
          for (let index = 0; index < Math.min(3, intent.stacks); index += 1) {
            const angle = state.tick * 1.7 + index * Math.PI * 2 / Math.min(3, intent.stacks);
            createAbilityEntity(state, player, { kind: 'thorn_mine', presentationKey: intent.itemKey, x: player.x + Math.cos(angle) * (42 + index * 12), y: player.y + Math.sin(angle) * (42 + index * 12), radius: 62 + (intent.stacks - 1) * 6, damage: 18 + (intent.stacks - 1) * 4, durationTicks: 100, firstPulseDelayTicks: 4, pulseIntervalTicks: 100 });
          }
        }
        emitEvent('EQUIPMENT_EFFECT_PULSED', { playerId: player.id, roomId: player.roomId, ...intent });
      });
    });
  }

  function resolveSpecialRoomCommand(state, player, action, emitEvent, random) {
    const room = currentRoom(state, player?.roomId);
    const stream = random.scoped(`special:${state.floorNumber}:${room?.id}:${action.choiceId}`);
    const result = applySpecialRoomChoice(state, room, player, action.choiceId, stream);
    if (!result.ok) {
      emitEvent('GAME_COMMAND_REJECTED', { playerId: player.id, command: action.action, reason: result.reason });
      return false;
    }
    if (result.transitionToRoomId) {
      player.roomId = result.transitionToRoomId;
      player.x = Number(state.floorState?.width || 900) / 2;
      player.y = Number(state.floorState?.height || 700) / 2;
    }
    if (result.advanceFloor) advanceToNextFloor(state, emitEvent);
    emitEvent('SPECIAL_ROOM_CHOICE_APPLIED', {
      playerId: player.id,
      roomId: room.id,
      roomType: room.type,
      choiceId: action.choiceId,
      ...result,
    });
    return true;
  }

  function resolveAcquisitionCommand(state, player, action, emitEvent, random) {
    const nextScrollSerial = Math.max(0, Math.floor(Number(player?.scrollUseSerial || 0))) + 1;
    const selectedScope = [...(action.fromKeys || []), ...(action.picks || [])].join(',');
    const scrollRandom = action.action === 'SCROLL_APPLY'
      ? random.scoped(`scroll:${action.scrollKey}:use:${nextScrollSerial}:floor:${state.floorNumber}:choices:${selectedScope}`)
      : null;
    const result = applyAcquisitionCommand(player, action.action, action, {
      inShop: currentRoom(state, player.roomId)?.type === 'shop',
      floorNumber: state.floorNumber,
      random: scrollRandom ? () => scrollRandom.next() : undefined,
    });
    if (!result.ok) {
      emitEvent('GAME_COMMAND_REJECTED', { playerId: player.id, command: action.action, reason: result.reason });
      return false;
    }
    syncCampaignItemStats(player, { currentTick: state.tick, lowerCombatCurse: !!state.matchRules?.lowerCombatCurse });
    emitEvent('ACQUISITION_APPLIED', { playerId: player.id, ...result });
    return true;
  }

  function nearestLivingPlayer(state, enemy) {
    let nearest = null;
    let nearestDistance = Infinity;
    Object.values(state.players || {}).forEach(player => {
      if (!player || player.disconnected || player.downed || player.roomId !== enemy.roomId) return;
      const distance = Math.hypot(Number(player.x) - enemy.x, Number(player.y) - enemy.y);
      if (distance < nearestDistance) {
        nearest = player;
        nearestDistance = distance;
      }
    });
    return { player: nearest, distance: nearestDistance };
  }

  function angleDifference(first, second) {
    return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
  }

  function defeatEnemy(state, enemy, playerId, emitEvent) {
    if (enemy.dead) return;
    // The god cheats death once: instead of dying it revives at 90% HP with 3x
    // damage and enters phase 2 (Divine Rebirth), exactly like onEnemyDie. The
    // shared updateGod body drives phases 3-5 from there.
    if (enemy.type === 'god' && !enemy.rebirthUsed) {
      enemy.rebirthUsed = true;
      enemy.health = Math.max(1, Math.round(Number(enemy.maxHealth || 1) * 0.9));
      enemy.hp = enemy.health;
      enemy.contactDamage = Math.round(Number(enemy.contactDamage || 40) * 3);
      enemy.dmg = enemy.contactDamage;
      enemy.moveSpeed = Number(enemy.moveSpeed || 108) * 1.18;
      enemy.speed = enemy.moveSpeed;
      enemy.phase = 2;
      enemy.windup = 0;
      enemy.beamTime = 0;
      enemy.dashTime = 0;
      enemy.state = 'godPhase2';
      enemy.invulnerableUntilTick = state.tick + Math.round(1.5 * 20);
      enemy.stunnedUntilTick = 0;
      emitEvent('ENEMY_SPOKE', { enemyId: enemy.id, roomId: enemy.roomId, text: 'DIVINE REBIRTH' });
      emitEvent('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'god_rebirth' });
      return;
    }
    // The Cult Queen cheats death once too, into her finisher windup (the
    // updateCultQueenBoss body root-holds her and detonates). If she hasn't yet
    // entered it via the HP threshold, start it here.
    if (enemy.type === 'queen_cult' && !enemy.queenFinisherDone && !enemy.queenFinisherActive) {
      enemy.queenFinisherActive = true;
      enemy.queenFinisherTimer = 1.6;
      enemy.health = 1;
      enemy.hp = 1;
      emitEvent('ENEMY_SPOKE', { enemyId: enemy.id, roomId: enemy.roomId, text: 'Then burn with me!' });
      return;
    }
    // Rivals have an extra life: the first kill sends them back to hunt the
    // party on a later floor and arms their curse; the second kill is final.
    if (enemy.type === 'rival') {
      const entry = getRosterEntry(state, enemy.rivalCharacterKey);
      queuePartyRivalCurse(state, enemy.rivalCharacterKey, { descended: false });
      if (entry && Number(entry.lives || 2) > 1) {
        entry.lives = Number(entry.lives || 2) - 1;
        entry.dead = false;
        entry.returnFloor = Math.min(MAX_FLOOR, Number(state.floorNumber || 1) + 1);
        entry.pendingSpawn = false;
        emitEvent('RIVAL_DOWNED', { characterKey: enemy.rivalCharacterKey, returnFloor: entry.returnFloor, final: false });
      } else if (entry) {
        entry.dead = true;
        entry.lives = 0;
        emitEvent('RIVAL_DOWNED', { characterKey: enemy.rivalCharacterKey, final: true });
      }
    }
    enemy.dead = true;
    enemy.state = 'dead';
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.deathTick = state.tick;
    emitEvent('ENEMY_DEFEATED', { enemyId: enemy.id, playerId, roomId: enemy.roomId });
    const player = state.players?.[playerId];
    if (player) {
      player.kills = Math.max(0, Number(player.kills || 0)) + 1;
      const randomService = combatRandomByState.get(state);
      const killEffects = applyCampaignKillCharge(player, {
        itemStats: player.itemStats,
        difficulty: state.matchRules?.difficultyKey || 'medium',
        overcharged: !!state.matchRules?.overcharged,
        currentTick: state.tick,
        tickRate: 20,
        random: randomService ? () => randomService.next('encounter') : () => 0.5,
      });
      killEffects.intents.forEach(intent => emitEvent('ITEM_KILL_EFFECT', { playerId, enemyId: enemy.id, ...intent }));
    }
    awardEncounterExperience(state, enemy, playerId, emitEvent);
    spawnCoinDrop(state, enemy, emitEvent);
    markEncounterCleared(state, enemy.roomId, emitEvent);
  }

  function awardEncounterExperience(state, enemy, playerId, emitEvent) {
    const definition = getEnemyDefinition(enemy.type) || {};
    const baseAmount = definition.boss ? 30 : enemy.elite ? 12 : 6;
    const recipients = activePlayers(state).filter(player => !player.downed && player.roomId === enemy.roomId);
    recipients.forEach(player => {
      const amount = Math.max(1, Math.round(baseAmount * Math.max(0, Number(player.itemStats?.xpGainMultiplier || 1))));
      player.xp = Math.max(0, Number(player.xp || 0)) + amount;
      player.level = Math.max(1, Number(player.level || 1));
      player.xpToNext = Math.max(1, Number(player.xpToNext || 20));
      while (player.xp >= player.xpToNext) {
        player.xp -= player.xpToNext;
        applyCampaignLevelUp(player);
        emitEvent('PLAYER_LEVELED', { playerId: player.id, level: player.level, maxHealth: player.maxHp });
      }
      emitEvent('XP_AWARDED', { playerId: player.id, sourcePlayerId: playerId, amount, xp: player.xp, level: player.level });
    });
    const stats = state.runStats || (state.runStats = { killsByPlayer: {}, playerKills: {}, deathsByPlayer: {} });
    stats.killsByPlayer = stats.killsByPlayer || {};
    stats.killsByPlayer[playerId] = Number(stats.killsByPlayer[playerId] || 0) + 1;
    const killer = state.players?.[playerId];
    if (killer) killer.kills = Number(killer.kills || 0) + 1;
  }

  function playerDamage(state, playerId, amount) {
    const attacker = state.players?.[playerId];
    const itemStats = attacker?.itemStats || {};
    return Math.max(0, Number(amount || 0))
      * Math.max(0.1, Number(attacker?.damageMultiplier || 1))
      * Math.max(0, Number(itemStats.kronosDamageMultiplier || 1))
      * Math.max(0, Number(itemStats.levelEdgeDamageMultiplier || 1));
  }

  function damageEnemy(state, enemy, damage, playerId, emitEvent, details = {}) {
    if (!enemy || enemy.dead) return false;
    // Befriended rivals are fully invulnerable (they fight for the party).
    if (enemy.rivalFriend) return false;
    // Boss invulnerability windows (god phase-shift/rebirth reposition) shrug off
    // damage entirely unless the caller forces it (the finisher self-kill does).
    if (!details.ignoreInv && state.tick < Number(enemy.invulnerableUntilTick || 0)) {
      emitEvent('ENEMY_HIT', { enemyId: enemy.id, playerId, damage: 0, absorbed: 0, health: enemy.health, blocked: true });
      return false;
    }
    const sparkleMultiplier = state.tick < Number(enemy.critSparkleUntilTick || 0) ? 2 : 1;
    const attacker = state.players?.[playerId];
    const loopNumber = Math.max(1, Math.floor((Math.max(1, Number(state.floorNumber || 1)) - 1) / MAX_FLOOR) + 1);
    let incoming = details.preScaled ? Math.max(0, Math.round(Number(damage || 0))) : scaleCampaignDamage({
      damage,
      raw: !!details.rawDamage,
      enemy,
      itemStats: attacker?.itemStats,
      attackPower: attacker?.attackPower,
      attackerDamageMultiplier: Math.max(0.1, Number(attacker?.damageMultiplier || 1)),
      isBoss: !!getEnemyDefinition(enemy.type)?.boss || !!enemy.miniBoss,
      hasBleed: getCampaignStatusStacks(enemy, 'bleed') > 0,
      applyBleedBonus: details.applyBleedBonus,
      glassCannon: !!state.matchRules?.glassCannon,
      loopNumber,
      enemyLoopDamageReduction: state.matchRules?.enemyLoopDamageReduction,
    });
    const randomService = combatRandomByState.get(state);
    const capeActive = Number(attacker?.equipmentEffectsUntilTick?.el_bartos_cape || 0) > Number(state.tick || 0);
    const canCrit = details.canCrit !== false;
    const crit = resolveCampaignCrit({
      itemStats: canCrit ? attacker?.itemStats : {},
      critBonus: details.critBonus,
      forced: canCrit && (sparkleMultiplier > 1 || (!!attacker?.elBartoAmbushReady && capeActive)),
      random: canCrit && randomService ? () => randomService.next('encounter') : () => 1,
    });
    if (crit.isCrit) incoming = Math.round(incoming * crit.critMultiplier);
    if (canCrit && attacker?.elBartoAmbushReady && capeActive) attacker.elBartoAmbushReady = false;
    // God-mode attackers hit harder for the duration of their window.
    if (attacker && godModeActive(state, attacker)) incoming = Math.round(incoming * 1.4);
    // Rivals shrug off a flat 20% of every hit (they're tougher than a normal
    // enemy of the same stats); the god takes 5% off the top like the campaign.
    if (enemy.type === 'rival') incoming = Math.max(1, Math.round(incoming * 0.8));
    else if (enemy.type === 'god') incoming = Math.max(1, Math.round(incoming * 0.95));
    const absorbed = Math.min(incoming, Math.max(0, Number(enemy.barrier || 0)));
    enemy.barrier = Math.max(0, Number(enemy.barrier || 0) - absorbed);
    const dealt = incoming - absorbed;
    enemy.health = Math.max(0, Number(enemy.health || 0) - dealt);
    enemy.hitTick = state.tick;
    // Campaign parity: a hit shield unit cannot re-shield for a moment.
    if (enemy.type === 'shield_unit') enemy._shieldHitLockout = 1.1;
    // Knockback + heavy-hit stun, mirroring hitEnemy in combat.js. Bosses and
    // elites resist crowd control (they're shoved less and stun-gate higher);
    // the impulse pushes the enemy away along the hit angle so the world's
    // physics carries the shove, then the client shakes on the ENEMY_HIT event.
    const knockback = Number(details.knockback || 0);
    if (knockback > 0 && Number.isFinite(Number(details.angle))) {
      const ccLevel = enemy.boss || enemy.type === 'god' ? 0.6 : enemy.elite ? 0.3 : 0;
      const resistFactor = 1 / (1 + ccLevel + Math.max(0, Number(enemy.stunResistance || 0)));
      const applied = knockback * resistFactor;
      applyCampaignImpulse(enemy, Number(details.angle), applied);
      enemy._lastHitAngle = Number(details.angle);
      // Heavy hits briefly stun: lost ≥40% max HP in one blow, or a big shove.
      const heavyHit = dealt >= Math.max(1, Number(enemy.maxHealth || 1)) * 0.4;
      const heavyKnockback = applied >= 260;
      if (heavyHit || heavyKnockback) {
        const stunTicks = Math.max(2, Math.round((heavyHit ? 0.32 : 0.18) * 20 * Math.max(0.28, 1 - ccLevel * 0.4)));
        enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + stunTicks);
      }
    }
    emitEvent('ENEMY_HIT', {
      enemyId: enemy.id,
      playerId,
      damage: dealt,
      absorbed,
      health: enemy.health,
      attackKind: details.attackKind,
      projectileId: details.projectileId,
      strike: details.strike,
      crit: crit.isCrit,
      // Impact weight drives the client's screenshake/hitstop on this hit.
      knockback: knockback > 0 ? knockback : undefined,
    });
    if (enemy.health <= 0) defeatEnemy(state, enemy, playerId, emitEvent);
    return true;
  }

  function getAuthorityStatusResistance(state, target, key) {
    const general = Number(target?.statusResistance || 0);
    const keyed = Number(target?.statusResistances?.[key] || 0);
    const ramped = getCampaignGenericStatusResistance(key, {
      statusResistScale: Number(state.matchRules?.statusResistScale || 0),
      elapsedSeconds: Number(state.tick || 0) / 20,
    });
    return Math.max(0, Math.min(0.95, Math.max(general, keyed, ramped)));
  }

  function applyAuthorityStatus(state, target, key, stacks, duration, ownerId, options = {}) {
    if (!target || target.dead || target.downed) return null;
    return applyCampaignStatus(target, key, stacks, duration, {
      resistance: options.resistance ?? getAuthorityStatusResistance(state, target, key),
      severity: options.severity ?? 1,
      playerColdBudget: !!options.playerColdBudget,
      ownerId,
      damageMultiplier: options.damageMultiplier,
    });
  }

  function applyFireStatus(state, enemy, stacks, duration, playerId) {
    const owner = state.players?.[playerId];
    const durationMultiplier = Math.max(1, Number(owner?.itemStats?.statusDurationMultiplier || 1))
      * (owner?.characterKey === 'metao' ? 1.15 : 1);
    return applyAuthorityStatus(state, enemy, 'fire', stacks, Number(duration || 0) * durationMultiplier, playerId);
  }

  function applyPoisonStatus(state, enemy, stacks, duration, playerId) {
    const owner = state.players?.[playerId];
    const durationMultiplier = Math.max(1, Number(owner?.itemStats?.statusDurationMultiplier || 1))
      * (owner?.characterKey === 'metao' ? 1.15 : 1);
    return applyAuthorityStatus(state, enemy, 'poison', stacks, Number(duration || 0) * durationMultiplier, playerId);
  }

  function applyAuthorityOnHitStatusProcs(state, enemy, player, hitOptions, random) {
    if (!enemy || enemy.dead || !player) return [];
    const statuses = ensureCampaignStatuses(enemy);
    const activeStatusCount = Object.values(statuses).filter(status => Number(status?.stacks || 0) > 0).length;
    const procs = resolveCampaignOnHitStatusProcs({
      itemStats: player.itemStats,
      hitOptions,
      activeStatusCount,
      copperPennyStacks: Number(player.items?.copper_penny || 0),
      targetSlowStacks: getCampaignStatusStacks(enemy, 'slow'),
      canBlind: enemy.type !== 'god' && !getEnemyDefinition(enemy.type)?.boss,
      random: typeof random === 'function' ? random : () => random?.next?.('encounter') ?? 1,
    });
    procs.forEach(proc => {
      if (proc.kind === 'status') {
        const durationMultiplier = proc.key === 'slow'
          ? 1
          : Math.max(1, Number(player.itemStats?.statusDurationMultiplier || 1))
            * (['fire', 'poison'].includes(proc.key) && player.characterKey === 'metao' ? 1.15 : 1);
        applyAuthorityStatus(state, enemy, proc.key, proc.stacks, Number(proc.duration || 0) * durationMultiplier, player.id, {
          damageMultiplier: proc.damageMultiplier,
        });
        return;
      }
      if (proc.kind === 'blind') {
        enemy.confusedBlindUntilTick = Math.max(
          Number(enemy.confusedBlindUntilTick || 0),
          Number(state.tick || 0) + Math.ceil(Math.max(0, Number(proc.seconds || 0)) * 20),
        );
        return;
      }
      const seconds = Math.max(0, Number(proc.seconds || 0));
      enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), Number(state.tick || 0) + Math.ceil(seconds * 20));
      if (proc.kind === 'freeze') {
        applyAuthorityStatus(state, enemy, 'slow', proc.slowStacks, proc.slowDuration, player.id);
      }
    });
    return procs;
  }

  function targetsInArc(state, player, angle, range, arc) {
    return livingEncounterEnemies(state, player.roomId)
      .map(enemy => ({
        enemy,
        distance: Math.hypot(enemy.x - player.x, enemy.y - player.y),
        angle: Math.atan2(enemy.y - player.y, enemy.x - player.x),
      }))
      .filter(candidate => candidate.distance <= range + Number(candidate.enemy.radius || 20)
        && angleDifference(candidate.angle, angle) <= arc)
      .sort((first, second) => first.distance - second.distance);
  }

  function rivalPlayers(state, player) {
    if (!state.matchRules?.friendlyFire) return [];
    return activePlayers(state).filter(candidate => candidate.id !== player.id
      && !candidate.downed && candidate.roomId === player.roomId);
  }

  function rivalTargetsInArc(state, player, angle, range, arc) {
    return rivalPlayers(state, player).filter(candidate => {
      const distance = Math.hypot(candidate.x - player.x, candidate.y - player.y);
      const targetAngle = Math.atan2(candidate.y - player.y, candidate.x - player.x);
      return distance <= range + Number(candidate.radius || 18) && angleDifference(targetAngle, angle) <= arc;
    });
  }

  function createPlayerProjectile(state, player, definition, angle) {
    const projectileId = state.allocateEntityId('projectile');
    const muzzleDistance = Number.isFinite(Number(definition.spawnDistance))
      ? Number(definition.spawnDistance)
      : Number(player.radius || 18) + 13;
    const randomService = combatRandomByState.get(state);
    const lifeTicks = Number(definition.lifeTicks || PROJECTILE_LIFETIME_TICKS);
    const projectile = {
      id: projectileId,
      type: definition.projectileKind || definition.kind,
      kind: definition.projectileKind || definition.kind,
      ownerId: player.id,
      hostile: false,
      roomId: definition.roomId || player.roomId,
      x: Number.isFinite(Number(definition.originX)) ? Number(definition.originX) : Number(player.x) + Math.cos(angle) * muzzleDistance,
      y: Number.isFinite(Number(definition.originY)) ? Number(definition.originY) : Number(player.y) + Math.sin(angle) * muzzleDistance,
      vx: Math.cos(angle) * Number(definition.speed || PROJECTILE_SPEED),
      vy: Math.sin(angle) * Number(definition.speed || PROJECTILE_SPEED),
      radius: Number(definition.radius || 8),
      damage: Number(definition.damage || PROJECTILE_DAMAGE),
      // colour is derived client-side from `kind` (see NetworkGameView cosmetics)
      attackKind: definition.attackKind || definition.weaponKey || definition.kind,
      remainingPierces: Math.max(0, Number(definition.pierce || 0)),
      hitEnemyIds: [],
      spawnTick: state.tick,
      lifeTicks,
      splash: Number(definition.splash || 0),
      splashDamage: Number(definition.splashDamage || 0),
      fireStacks: Number(definition.fireStacks || 0),
      fireDuration: Number(definition.fireDuration || 0),
      hitOptions: definition.hitOptions ? { ...definition.hitOptions } : null,
      homing: !!definition.homing,
      homingTarget: definition.homingTarget || null,
      homingSpeed: Number(definition.homingSpeed || definition.speed || PROJECTILE_SPEED),
      homingAccel: Number(definition.homingAccel || 0),
      homingTurnRate: Number(definition.homingTurnRate || 0),
      homingRadius: Number(definition.homingRadius || 0),
      returning: !!definition.returning,
      returnPhase: definition.returning ? 'out' : '',
      bouncesRemaining: Math.max(0, Math.floor(Number(definition.bouncesRemaining || 0))),
      subSpawn: definition.subSpawn ? {
        ...definition.subSpawn,
        nextSpawnTick: state.tick + Math.max(1, Number(definition.subSpawn.intervalSeconds || 0.2) * 20),
      } : null,
    };
    configureCampaignProjectile(projectile, {
      enemy: false,
      itemStats: player.itemStats,
      random: randomService ? () => randomService.next('encounter') : () => 0.5,
      hasExplicitHoming: Object.prototype.hasOwnProperty.call(definition, 'homing'),
      hasExplicitBounces: Object.prototype.hasOwnProperty.call(definition, 'bouncesRemaining'),
    });
    projectile.expiresTick = state.tick + Math.ceil(Number(projectile.lifeTicks || lifeTicks));
    state.projectiles[projectileId] = projectile;
    return projectile;
  }

  function projectileTrajectory(projectile) {
    return {
      id: projectile.id,
      kind: projectile.kind,
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      radius: projectile.radius,
      spawnTick: projectile.spawnTick,
      expiresTick: projectile.expiresTick,
    };
  }

  function spawnCrimsonSmashRocks(state, player, stats, aimDirection, random) {
    const projectiles = [];
    const rockCount = 8;
    const stream = random?.stream?.('combat-variance');
    for (let index = 0; index < rockCount; index += 1) {
      const angle = aimDirection + (index / rockCount) * Math.PI * 2;
      const speed = 460 + (stream?.next?.() ?? 0.5) * 120;
      projectiles.push(createPlayerProjectile(state, player, {
        kind: 'rock',
        attackKind: 'crimson_smash',
        damage: Math.round(Number(stats.damage || 55) * 0.45),
        speed,
        radius: 7,
        lifeTicks: 13,
        pierce: 1,
        spawnDistance: Number(stats.range || 140) * 0.4,
      }, angle));
    }
    return projectiles;
  }

  function createAbilityEntity(state, player, definition = {}) {
    state.abilityEntities = state.abilityEntities || {};
    const entityId = state.allocateEntityId('ability');
    const entity = {
      id: entityId,
      ownerId: player.id,
      roomId: player.roomId,
      x: Number(definition.x ?? player.x),
      y: Number(definition.y ?? player.y),
      radius: Math.max(1, Number(definition.radius || 32)),
      r: Math.max(1, Number(definition.radius || 32)),
      kind: String(definition.kind || definition.presentationKey || 'ability'),
      presentationKey: String(definition.presentationKey || definition.kind || 'ability'),
      damage: Math.max(0, Number(definition.damage || 0)),
      heal: Math.max(0, Number(definition.heal || 0)),
      range: Math.max(0, Number(definition.range || 0)),
      burstRadius: Math.max(0, Number(definition.burstRadius || definition.radius || 0)),
      followOwner: !!definition.followOwner,
      spawnTick: state.tick,
      nextPulseTick: state.tick + Math.max(0, Number(definition.firstPulseDelayTicks || 0)),
      pulseIntervalTicks: Math.max(1, Number(definition.pulseIntervalTicks || 10)),
      pulseIndex: 0,
      expiresTick: state.tick + Math.max(1, Number(definition.durationTicks || 20)),
    };
    state.abilityEntities[entityId] = entity;
    return entity;
  }

  function spawnPersistentMoveEntities(state, player, moveKey, stats, angle) {
    const spawned = [];
    if (moveKey === 'healing_zone') {
      spawned.push(createAbilityEntity(state, player, {
        kind: 'healing_zone', presentationKey: moveKey, radius: stats.range || 130,
        damage: stats.damage || 12, heal: 4, durationTicks: Math.round(Number(stats.duration || 3) * 20),
        pulseIntervalTicks: 10,
      }));
    } else if (moveKey === 'fire_circle') {
      spawned.push(createAbilityEntity(state, player, {
        kind: 'fire_circle', presentationKey: moveKey, radius: stats.range || 100,
        damage: stats.damage || 18, durationTicks: Math.round(Number(stats.duration || 3.5) * 20),
        pulseIntervalTicks: 10, followOwner: true,
      }));
    } else if (moveKey === 'floor_lava') {
      spawned.push(createAbilityEntity(state, player, {
        kind: 'lava', presentationKey: moveKey, radius: 52,
        damage: stats.damage || 12, durationTicks: Math.round(Number(stats.duration || 4) * 20),
        pulseIntervalTicks: 10, followOwner: true,
      }));
    } else if (moveKey === 'chaos_burst') {
      spawned.push(createAbilityEntity(state, player, {
        kind: 'chaos_burst', presentationKey: moveKey, radius: stats.range || 100,
        damage: stats.damage || 30, durationTicks: 36, pulseIntervalTicks: 4,
        followOwner: true,
      }));
    } else if (moveKey === 'holy_turrets') {
      for (let index = 0; index < 3; index += 1) {
        const turretAngle = angle + (index - 1) * 0.7;
        spawned.push(createAbilityEntity(state, player, {
          kind: 'holy_turret', presentationKey: moveKey,
          x: player.x + Math.cos(turretAngle) * 74,
          y: player.y + Math.sin(turretAngle) * 74,
          radius: 26, range: stats.range || 360, burstRadius: 56,
          damage: stats.damage || 26, durationTicks: Math.round(Number(stats.duration || 6) * 20),
          pulseIntervalTicks: 12,
        }));
      }
    } else if (moveKey === 'lightning_columns') {
      for (const offset of [-42, 42]) {
        spawned.push(createAbilityEntity(state, player, {
          kind: 'lightning_column', presentationKey: moveKey,
          x: player.x + Math.cos(angle) * Number(stats.range || 180) + Math.cos(angle + Math.PI / 2) * offset,
          y: player.y + Math.sin(angle) * Number(stats.range || 180) + Math.sin(angle + Math.PI / 2) * offset,
          radius: 54, damage: stats.damage || 30, durationTicks: 90, pulseIntervalTicks: 9,
        }));
      }
    }
    return spawned;
  }

  function updateAbilityEntities(state, emitEvent, random) {
    Object.entries(state.abilityEntities || {}).forEach(([entityId, entity]) => {
      if (state.tick >= Number(entity.expiresTick || 0)) {
        delete state.abilityEntities[entityId];
        emitEvent('ABILITY_ENTITY_REMOVED', { entityId, roomId: entity.roomId, reason: 'expired' });
        return;
      }
      const owner = state.players?.[entity.ownerId];
      if (!owner || owner.disconnected || owner.roomId !== entity.roomId) {
        delete state.abilityEntities[entityId];
        return;
      }
      if (entity.followOwner) {
        entity.x = Number(owner.x);
        entity.y = Number(owner.y);
      }
      if (state.tick < Number(entity.nextPulseTick || 0)) return;
      entity.nextPulseTick = state.tick + Math.max(1, Number(entity.pulseIntervalTicks || 10));
      entity.pulseIndex = Number(entity.pulseIndex || 0) + 1;
      let pulseX = Number(entity.x);
      let pulseY = Number(entity.y);
      let pulseRadius = Number(entity.burstRadius || entity.radius || 32);
      if (entity.kind === 'chaos_burst') {
        const stream = random.scoped(`${entity.id}|pulse:${entity.pulseIndex}`);
        const pulseAngle = stream.next() * Math.PI * 2;
        const distance = 30 + stream.next() * Math.max(0, Number(entity.radius || 100) - 30);
        pulseX += Math.cos(pulseAngle) * distance;
        pulseY += Math.sin(pulseAngle) * distance;
        pulseRadius = 52;
      } else if (entity.kind === 'holy_turret') {
        const target = livingEncounterEnemies(state, entity.roomId)
          .map(enemy => ({ enemy, distance: Math.hypot(enemy.x - entity.x, enemy.y - entity.y) }))
          .filter(candidate => candidate.distance <= Number(entity.range || 360))
          .sort((first, second) => first.distance - second.distance)[0]?.enemy;
        if (!target) return;
        pulseX = Number(target.x);
        pulseY = Number(target.y);
      }
      const targetIds = [];
      abilityTargetsInRadius(state, owner, pulseX, pulseY, pulseRadius).forEach(enemy => {
        damageEnemy(state, enemy, entity.damage, owner.id, emitEvent, { attackKind: entity.presentationKey });
        if (!enemy.dead && entity.presentationKey === 'fire_circle') applyFireStatus(state, enemy, 1, 3, owner.id);
        if (!enemy.dead && entity.presentationKey === 'chaos_burst') applyPoisonStatus(state, enemy, 1, 4.8, owner.id);
        targetIds.push(enemy.id);
      });
      damageRivalsInRadius(state, owner, pulseX, pulseY, pulseRadius, entity.damage, emitEvent, entity.presentationKey, targetIds);
      if (entity.kind === 'healing_zone' && Math.hypot(owner.x - pulseX, owner.y - pulseY) <= pulseRadius) {
        owner.hp = Math.min(Number(owner.maxHp || 100), Number(owner.hp || 0) + Number(entity.heal || 0));
      }
      emitEvent('ABILITY_ENTITY_PULSED', {
        entityId, playerId: owner.id, roomId: entity.roomId,
        presentationKey: entity.presentationKey, x: pulseX, y: pulseY,
        radius: pulseRadius, targetIds,
      });
    });
  }

  // Mirrors the campaign's damageDestructible outcome chain (world.js): chip
  // toward broken, then pot loot, barrel blast, and hidden-prop reveal. The
  // visual FX are event-driven on the client from the emitted events.
  function damageNetworkDestructible(state, roomId, destructible, damage, emitEvent, random, context = {}) {
    const room = currentRoom(state, roomId);
    const loot = random?.stream?.('loot');
    const green = random?.scoped?.(`green:${state.floorNumber}:${roomId}:${destructible?.x},${destructible?.y}`);
    const result = applyCampaignDestructibleDamage(destructible, damage, {
      floorNumber: state.floorNumber,
      runLoopIndex: state.floorState?.runLoopIndex || 0,
      destructibles: room?.destructibles,
      itemChance: Math.min(0.5, 0.12 + Number(context.itemDropChanceBonus || 0)),
      greenRandom: green ? () => green.next() : () => 1,
      potRandom: loot ? () => loot.next() : () => 1,
      rollItem: stream => rollCampaignItem(stream),
    });
    if (!result.ok) return false;
    emitEvent(result.broken ? 'DESTRUCTIBLE_BROKEN' : 'DESTRUCTIBLE_HIT', {
      roomId,
      obstacleKind: destructible.kind,
      x: destructible.x,
      y: destructible.y,
      health: destructible.hp,
      reinforced: !!destructible.reinforced,
      ...context,
    });
    if (!result.broken) return true;
    result.drops.forEach(drop => {
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = { id: pickupId, ...drop, roomId, x: destructible.x, y: destructible.y, radius: 13, amount: drop.amount || 1, spawnTick: state.tick };
      emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: state.pickups[pickupId].type });
    });
    if (result.blast) {
      livingEncounterEnemies(state, roomId).forEach(enemy => {
        if (Math.hypot(enemy.x - destructible.x, enemy.y - destructible.y) > 130 + Number(enemy.radius || 20)) return;
        damageEnemy(state, enemy, 55, context.playerId || null, emitEvent, { attackKind: 'barrel_blast' });
      });
      (room?.destructibles || []).forEach(other => {
        if (other === destructible || other.broken || other.hidden) return;
        if (Math.hypot(other.x - destructible.x, other.y - destructible.y) > 130 + Number(other.r || 24)) return;
        damageNetworkDestructible(state, roomId, other, 55, emitEvent, random, context);
      });
    }
    if (result.secretDirection && room?.secretPassages?.[result.secretDirection]) room.secretPassages[result.secretDirection].open = true;
    return true;
  }

  function chipDestructiblesInArc(state, player, angle, range, arc, emitEvent, random) {
    const room = currentRoom(state, player.roomId);
    (room?.destructibles || []).forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const propRadius = Number(prop.r || 24);
      const distance = Math.hypot(prop.x - player.x, prop.y - player.y);
      // The campaign gives pots extra reach/arc forgiveness so swings connect.
      const pot = prop.kind === 'pot';
      if (distance > range + propRadius + (pot ? 24 : 8)) return;
      const touching = distance <= Number(player.radius || 18) + propRadius + (pot ? 32 : 18);
      const difference = angleDifference(Math.atan2(prop.y - player.y, prop.x - player.x), angle);
      if (!touching && difference > arc + (pot ? 0.45 : 0.25)) return;
      damageNetworkDestructible(state, player.roomId, prop, 1, emitEvent, random, { playerId: player.id });
    });
  }

  function chipDestructiblesInRadius(state, player, x, y, radius, damage, emitEvent, random) {
    const room = currentRoom(state, player.roomId);
    (room?.destructibles || []).forEach(prop => {
      if (prop.broken || prop.hidden) return;
      if (Math.hypot(prop.x - x, prop.y - y) > radius + Number(prop.r || 24)) return;
      damageNetworkDestructible(state, player.roomId, prop, damage, emitEvent, random, { playerId: player.id });
    });
  }

  function chipDestructiblesAlongBeam(state, player, angle, range, width, emitEvent, random) {
    const room = currentRoom(state, player.roomId);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    (room?.destructibles || []).forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const ox = prop.x - player.x;
      const oy = prop.y - player.y;
      const forward = ox * dx + oy * dy;
      const perpendicular = Math.abs(ox * -dy + oy * dx);
      if (forward < 0 || forward > range || perpendicular > width + Number(prop.r || 24)) return;
      damageNetworkDestructible(state, player.roomId, prop, 1, emitEvent, random, { playerId: player.id });
    });
  }

  function resolveSweep(state, player, definition, angle, emitEvent, random, strike = 0) {
    const targets = targetsInArc(state, player, angle, Number(definition.range || 120), Number(definition.arc || 1.04));
    const sweepKnockback = Number(definition.knockback || 140);
    targets.forEach(candidate => {
      damageEnemy(state, candidate.enemy, definition.damage, player.id, emitEvent, {
        attackKind: definition.weaponKey,
        strike,
        angle: Math.atan2(candidate.enemy.y - player.y, candidate.enemy.x - player.x),
        knockback: sweepKnockback,
      });
      if (!candidate.enemy.dead) applyAuthorityOnHitStatusProcs(state, candidate.enemy, player, {
        ...definition,
        itemBleedChance: Number(player.itemStats?.bleedChance || 0),
      }, random);
    });
    const rivals = rivalTargetsInArc(state, player, angle, Number(definition.range || 120), Number(definition.arc || 1.04));
    rivals.forEach(target => damagePlayer(state, target, playerDamage(state, player.id, definition.damage), player.id, emitEvent, definition.weaponKey));
    chipDestructiblesInArc(state, player, angle, Number(definition.range || 120), Number(definition.arc || 1.04), emitEvent, random);
    return [...targets.map(candidate => candidate.enemy.id), ...rivals.map(candidate => candidate.id)];
  }

  function resolveSmite(state, player, definition, angle, emitEvent) {
    const targetIds = resolveSweep(state, player, {
      ...definition,
      damage: definition.stabDamage,
      range: definition.stabRange,
      arc: definition.stabArc,
    }, angle, emitEvent, null);
    const blade = createPlayerProjectile(state, player, {
      weaponKey: definition.weaponKey,
      projectileKind: 'blade_justice',
      attackKind: definition.weaponKey,
      speed: definition.bladeSpeed,
      radius: definition.bladeRadius,
      damage: definition.bladeDamage,
      color: definition.color || PROJECTILE_TYPE_DEFS[definition.projectileType]?.color,
      pierce: definition.bladePierce,
      lifeTicks: Math.ceil(Number(definition.bladeLife) * 20),
    }, angle);
    const available = livingEncounterEnemies(state, player.roomId).slice();
    let origin = { x: player.x, y: player.y };
    const segments = [];
    for (let jump = 0; jump < Number(definition.chainCount || 5) && available.length; jump += 1) {
      available.sort((first, second) => Math.hypot(first.x - origin.x, first.y - origin.y) - Math.hypot(second.x - origin.x, second.y - origin.y));
      const enemy = available.shift();
      const maximum = jump === 0 ? Number(definition.chainRange || 280) : Number(definition.chainJumpRange || 170);
      if (Math.hypot(enemy.x - origin.x, enemy.y - origin.y) > maximum) break;
      targetIds.push(enemy.id);
      segments.push({ fromX: origin.x, fromY: origin.y, toX: enemy.x, toY: enemy.y });
      damageEnemy(state, enemy, Number(definition.chainBaseDamage || 18) + jump * Number(definition.chainStepDamage || 4), player.id, emitEvent, { attackKind: definition.weaponKey, strike: jump });
      origin = enemy;
    }
    return { targetIds: [...new Set(targetIds)], projectileIds: [blade.id], segments };
  }

  function resolvePlayerAttack(state, player, action, emitEvent, random) {
    if (state.tick < Number(player.attackCooldownUntilTick || 0) || player.downed) return null;
    const angle = Number(action.aimDirection);
    if (!Number.isFinite(angle)) return null;
    const authoredDefinition = getHeroPrimaryAttack(player.characterKey);
    const upgradedStats = applyForgeStats(player, 'weapon', authoredDefinition.weaponKey, WEAPON_BASE_STATS[authoredDefinition.weaponKey]);
    const definition = {
      ...authoredDefinition,
      ...upgradedStats,
      cooldownTicks: Math.max(1, Math.ceil(Number(upgradedStats.cooldown || 0.5) * 20)),
    };
    const projectileIds = [];
    let targetIds = [];
    let segments = [];

    if (definition.mode === 'projectile') {
      const preset = PROJECTILE_TYPE_DEFS[definition.projectileType] || {};
      projectileIds.push(createPlayerProjectile(state, player, {
        ...definition,
        projectileKind: preset.kind || definition.weaponKey,
        speed: preset.speed,
        radius: preset.r,
        color: preset.color,
        pierce: preset.pierceCount,
        lifeTicks: Math.ceil(Number(preset.life || 1) * 20),
        returning: !!definition.returning,
      }, angle).id);
    } else if (definition.mode === 'volley') {
      const count = Math.max(1, Number(definition.count || 3));
      for (let index = 0; index < count; index += 1) {
        const offset = (index - (count - 1) / 2) * Number(definition.spread || 0.18);
        projectileIds.push(createPlayerProjectile(state, player, {
          ...definition,
          projectileKind: definition.projectileKind || 'fireball',
          attackKind: definition.weaponKey,
          lifeTicks: Math.ceil(Number(definition.life || 1.6) * 20),
        }, angle + offset).id);
      }
    } else if (definition.mode === 'sweep') {
      targetIds = resolveSweep(state, player, definition, angle, emitEvent, random);
    } else if (definition.mode === 'double_sweep') {
      const offsets = definition.angleOffsets || [-0.18, 0.18];
      targetIds = resolveSweep(state, player, definition, angle + Number(offsets[0] || 0), emitEvent, random, 0);
      player.pendingWeaponStrikes = [{
        dueTick: state.tick + Math.max(1, Math.round(Number(definition.secondDelay || 0.12) * 20)),
        angle: angle + Number(offsets[1] || 0),
        definition,
      }];
    } else if (definition.mode === 'smite') {
      const result = resolveSmite(state, player, definition, angle, emitEvent);
      targetIds = result.targetIds;
      projectileIds.push(...result.projectileIds);
      segments = result.segments;
    }

    // God mode drops the melee cadence to a 0.2s cooldown (4 ticks).
    const godMeleeTicks = godModeActive(state, player) ? 4 : Number(definition.cooldownTicks || ATTACK_COOLDOWN_TICKS);
    player.attackCooldownUntilTick = state.tick + Math.max(1, Math.ceil(godMeleeTicks
      * Math.max(0.45, Number(player.cooldownMultiplier || 1))
      / Math.max(0.2, Number(player.itemStats?.attackSpeedMultiplier || 1))));
    player.action = 'attack';
    player.actionTick = state.tick;
    player.actionKind = definition.weaponKey;
    player.actionMode = definition.mode;
    player.aimDirection = angle;
    emitEvent('PLAYER_ATTACKED', {
      playerId: player.id,
      roomId: player.roomId,
      characterKey: player.characterKey,
      attackMode: definition.mode,
      attackKind: definition.weaponKey,
      weaponKey: definition.weaponKey,
      aimDirection: angle,
      originX: Number(player.x),
      originY: Number(player.y),
      color: definition.color,
      range: Number(definition.range || 0),
      arc: Number(definition.arc || 0),
      projectileIds,
      targetIds,
      segments,
    });
    return { definition, projectileIds, targetIds };
  }

  function setPlayerAction(state, player, slot, moveKey, angle) {
    player.action = slot === 'dash' ? 'dash' : 'ability';
    player.actionTick = state.tick;
    player.actionKind = moveKey;
    player.actionMode = slot;
    player.aimDirection = angle;
  }

  function abilityTargetsInRadius(state, player, x, y, range) {
    return livingEncounterEnemies(state, player.roomId).filter(enemy => {
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const reach = range + Number(enemy.radius || 20);
      return dx * dx + dy * dy <= reach * reach;
    });
  }

  function abilityTargetsInBeam(state, player, angle, range, width) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    return livingEncounterEnemies(state, player.roomId).filter(enemy => {
      const ox = enemy.x - player.x;
      const oy = enemy.y - player.y;
      const forward = ox * dx + oy * dy;
      const perpendicular = Math.abs(ox * -dy + oy * dx);
      return forward >= 0 && forward <= range && perpendicular <= width + Number(enemy.radius || 20);
    });
  }

  function damageRivalsInRadius(state, player, x, y, range, damage, emitEvent, attackKind, targetIds) {
    rivalPlayers(state, player).forEach(target => {
      const dx = target.x - x;
      const dy = target.y - y;
      const reach = range + Number(target.radius || 18);
      if (dx * dx + dy * dy > reach * reach) return;
      damagePlayer(state, target, playerDamage(state, player.id, damage), player.id, emitEvent, attackKind);
      targetIds.push(target.id);
    });
  }

  function damageRivalsInBeam(state, player, angle, range, width, damage, emitEvent, attackKind, targetIds) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    rivalPlayers(state, player).forEach(target => {
      const ox = target.x - player.x;
      const oy = target.y - player.y;
      const forward = ox * dx + oy * dy;
      const perpendicular = Math.abs(ox * -dy + oy * dx);
      if (forward < 0 || forward > range || perpendicular > width + Number(target.radius || 18)) return;
      damagePlayer(state, target, playerDamage(state, player.id, damage), player.id, emitEvent, attackKind);
      targetIds.push(target.id);
    });
  }

  // ---------------------------------------------------------------------------
  // Move charges.
  //
  // The authority used to model every move as a single binary cooldown, so
  // multi-charge moves (Thorn's 2-charge dash, Warp's 4, Zoomies/Lightning
  // Cross/Nail Shot's 2) collapsed to one charge in multiplayer. This mirrors the
  // campaign's { charges, maxCharges, timers[] } model from game-state.js: each
  // spend pushes an independent recharge timer, and timers refill one charge each
  // as they expire, so charges come back one at a time rather than all at once.
  //
  // Timers are absolute ticks (not countdowns) to stay consistent with the rest of
  // the authority's *UntilTick fields and survive snapshot round-trips unchanged.
  // moveCooldownUntilTick is kept in sync as the soonest-ready tick so existing
  // readers (the HUD, SharedInventorySystem) keep working without knowing about
  // charges at all.
  // Full capacity for a move, base charges widened by any Extra Battery upgrade.
  function moveChargeCapacity(player, moveKey) {
    const base = getMoveBaseCharges(moveKey, player?.characterKey || player?.character);
    const overrideMax = Math.max(0, Math.floor(Number(player?.moveStackOverrides?.[moveKey] || 0)));
    return Math.max(1, base, overrideMax);
  }

  // Read-only view of a move's charges, safe to call before the move has ever been
  // cast and safe to call on a client-side snapshot. Pools are created lazily by
  // ensureMoveChargeState (so a character swap can't strand a stale pool), which
  // means a never-cast move has no stored pool — readers must not treat that as "no
  // charges" or they render an empty/one-pip HUD until the first cast. Always go
  // through this instead of indexing player.moveChargeState directly.
  function readMoveChargeState(player, moveKey) {
    const stored = player?.moveChargeState?.[moveKey];
    const maxCharges = moveChargeCapacity(player, moveKey);
    if (!stored) return { charges: maxCharges, maxCharges, timers: [] };
    // Reconcile capacity for display without mutating: a battery bought this tick
    // should read at its new size even before the authority's next reconcile.
    const charges = Math.max(0, Math.min(maxCharges, Math.floor(Number(stored.charges || 0))
      + Math.max(0, maxCharges - Math.max(1, Math.floor(Number(stored.maxCharges || 1))))));
    return {
      charges,
      maxCharges,
      timers: Array.isArray(stored.timers) ? stored.timers.slice() : [],
    };
  }

  // MUTATING: creates the stored pool if absent and reconciles its capacity in
  // place, then returns the live object. This writes authority state, so only the
  // simulation may call it — never a render/read path (use readMoveChargeState for
  // display). The `ensure` prefix marks the side effect at every call site.
  function ensureMoveChargeState(player, moveKey) {
    const pools = player.moveChargeState || (player.moveChargeState = {});
    const maxCharges = moveChargeCapacity(player, moveKey);
    let pool = pools[moveKey];
    if (!pool) {
      pool = { charges: maxCharges, maxCharges, timers: [] };
      pools[moveKey] = pool;
    }
    // Capacity can grow mid-run (Extra Battery). Credit new headroom as a ready
    // charge, matching tickCooldowns' reconciliation in the campaign.
    if (maxCharges > pool.maxCharges) {
      pool.charges = Math.min(maxCharges, pool.charges + (maxCharges - pool.maxCharges));
      pool.maxCharges = maxCharges;
    }
    return pool;
  }

  // Mirror the pool's soonest-ready tick onto moveCooldownUntilTick. A move with a
  // charge in hand reads as "ready now" (0) so anything gating on it lets the cast
  // through; otherwise it reads as the next timer to expire.
  function syncMoveCooldownMirror(player, moveKey, pool) {
    const cooldowns = player.moveCooldownUntilTick || (player.moveCooldownUntilTick = {});
    if (pool.charges > 0) cooldowns[moveKey] = 0;
    else if (pool.timers.length) cooldowns[moveKey] = Math.min(...pool.timers);
    else cooldowns[moveKey] = 0;
  }

  function hasMoveCharge(player, moveKey) {
    return ensureMoveChargeState(player, moveKey).charges > 0;
  }

  function spendMoveCharge(player, moveKey, readyAtTick) {
    const pool = ensureMoveChargeState(player, moveKey);
    if (pool.charges <= 0) return false;
    pool.charges -= 1;
    pool.timers.push(readyAtTick);
    syncMoveCooldownMirror(player, moveKey, pool);
    return true;
  }

  // Rewrite the most recently pushed timer — used when a held beam is released
  // early and its recharge must be pulled forward from the full-duration estimate.
  function rescheduleLatestMoveCharge(player, moveKey, readyAtTick) {
    const pool = ensureMoveChargeState(player, moveKey);
    if (!pool.timers.length) return;
    pool.timers[pool.timers.length - 1] = readyAtTick;
    syncMoveCooldownMirror(player, moveKey, pool);
  }

  function tickMoveCharges(state) {
    for (const player of Object.values(state.players || {})) {
      const pools = player?.moveChargeState;
      if (!pools) continue;
      for (const moveKey of Object.keys(pools)) {
        // Re-read through ensureMoveChargeState so an Extra Battery bought while the
        // move is idle still grows the pool — reconciling only pools with live
        // timers would silently drop the upgrade until the next cast.
        const pool = ensureMoveChargeState(player, moveKey);
        if (!pool.timers.length) continue;
        const pending = [];
        let restored = 0;
        for (const readyAt of pool.timers) {
          if (state.tick >= Number(readyAt)) restored += 1;
          else pending.push(readyAt);
        }
        if (restored > 0) {
          pool.timers = pending;
          pool.charges = Math.min(pool.maxCharges, pool.charges + restored);
        }
        syncMoveCooldownMirror(player, moveKey, pool);
      }
    }
  }

  function endBeamChannel(state, player) {
    const channel = player?.beamChannel;
    if (!channel) return;
    if (state.beamStruggles?.[player.id]) clearNetworkBeamStruggle(state, state.beamStruggles[player.id]);
    // The campaign starts the laser cooldown when the beam ENDS (held skills
    // recharge on release), so an early release must pull the cooldown forward
    // from the full-duration estimate written at cast time.
    rescheduleLatestMoveCharge(
      player,
      channel.moveKey,
      state.tick + Math.max(1, Number(channel.cooldownTicks || 1)),
    );
    player.beamChannel = null;
  }

  function clearNetworkBeamStruggle(state, struggle) {
    if (!struggle) return;
    const enemy = state.enemies?.[struggle.enemyId];
    if (enemy?.networkBeamStrugglePlayerId === struggle.playerId) delete enemy.networkBeamStrugglePlayerId;
    if (state.beamStruggles) {
      delete state.beamStruggles[struggle.playerId];
      if (struggle.opponentPlayerId) delete state.beamStruggles[struggle.opponentPlayerId];
    }
  }

  function resolveNetworkBeamStruggle(state, struggle, playerWon, emitEvent) {
    const player = state.players?.[struggle.playerId];
    const opponent = state.players?.[struggle.opponentPlayerId];
    const enemy = state.enemies?.[struggle.enemyId];
    clearNetworkBeamStruggle(state, struggle);
    if (player) endBeamChannel(state, player);
    if (opponent) endBeamChannel(state, opponent);
    if (enemy) enemy.beamTime = 0;
    if (opponent) {
      const winner = playerWon ? player : opponent;
      const loser = playerWon ? opponent : player;
      if (loser && !loser.downed) {
        const damage = Math.max(1, Math.round(Number(winner?.beamDamage || 0) + Number(loser.beamDamage || 0)));
        loser.stunnedUntilTick = Math.max(Number(loser.stunnedUntilTick || 0), state.tick + 24);
        damagePlayer(state, loser, damage, winner?.id, emitEvent, 'beam_struggle', {
          angle: Math.atan2(Number(loser.y) - Number(winner?.y || 0), Number(loser.x) - Number(winner?.x || 0)),
          knockback: 520,
          ignoreInv: true,
          ignoreDamageCaps: true,
        });
      }
    } else if (playerWon && enemy && !enemy.dead) {
      enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + 25);
      damageEnemy(state, enemy, 30, player?.id, emitEvent, { attackKind: 'beam_struggle', knockback: 360 });
    } else if (player && !player.downed) {
      player.stunnedUntilTick = Math.max(Number(player.stunnedUntilTick || 0), state.tick + 30);
      const damage = Math.max(1, Math.round(Number(enemy?.dmg || enemy?.contactDamage || 0) + Number(player.beamDamage || 0)));
      damagePlayer(state, player, damage, enemy?.id, emitEvent, 'beam_struggle', {
        angle: Number(enemy?.beamAngle || 0), knockback: 560, ignoreInv: true, ignoreDamageCaps: true,
      });
    }
    emitEvent('BEAM_STRUGGLE_RESOLVED', {
      playerId: struggle.playerId, enemyId: struggle.enemyId,
      opponentPlayerId: struggle.opponentPlayerId, playerWon,
      x: struggle.x, y: struggle.y,
    });
  }

  function registerNetworkBeamMash(state, player, emitEvent) {
    const struggle = state.beamStruggles?.[player.id];
    if (!struggle) return false;
    const direction = player.id === struggle.playerId ? 1 : -1;
    struggle.progress = Math.max(0, Math.min(1, Number(struggle.progress || 0.5) + BEAM_STRUGGLE_MASH_FORCE * direction));
    struggle.mashCount = Number(struggle.mashCount || 0) + 1;
    if (struggle.progress >= 1) resolveNetworkBeamStruggle(state, struggle, true, emitEvent);
    else if (struggle.progress <= 0) resolveNetworkBeamStruggle(state, struggle, false, emitEvent);
    return true;
  }

  function tryStartNetworkBeamStruggle(state, player, channel, emitEvent) {
    state.beamStruggles = state.beamStruggles || {};
    if (state.beamStruggles[player.id]) return state.beamStruggles[player.id];
    const playerRange = Number(BEAM_CHANNEL_PROFILES[channel.moveKey]?.range || 430);
    let opposingPlayer = null;
    if (state.matchRules?.mode === 'rival') {
      Object.values(state.players || {}).forEach(candidate => {
        if (!candidate || candidate.id === player.id || candidate.downed || candidate.roomId !== player.roomId || !candidate.beamChannel) return;
        if (state.beamStruggles[candidate.id]) return;
        const opponentAngle = Number(candidate.beamChannel.angle || candidate.aimDirection || 0);
        const dx = Number(candidate.x) - Number(player.x);
        const dy = Number(candidate.y) - Number(player.y);
        const distance = Math.hypot(dx, dy);
        const opponentRange = Number(BEAM_CHANNEL_PROFILES[candidate.beamChannel.moveKey]?.range || 430);
        const facingDot = Math.cos(channel.angle) * Math.cos(opponentAngle) + Math.sin(channel.angle) * Math.sin(opponentAngle);
        const lateralA = Math.abs(dx * Math.sin(channel.angle) - dy * Math.cos(channel.angle));
        const lateralB = Math.abs((-dx) * Math.sin(opponentAngle) - (-dy) * Math.cos(opponentAngle));
        if (facingDot <= -0.15 && distance <= Math.min(playerRange, opponentRange) && lateralA <= 24 && lateralB <= 24
          && (!opposingPlayer || distance < opposingPlayer.distance)) opposingPlayer = { player: candidate, distance };
      });
    }
    if (opposingPlayer) {
      const opponent = opposingPlayer.player;
      const struggle = {
        playerId: player.id, opponentPlayerId: opponent.id,
        startTick: state.tick, endTick: state.tick + BEAM_STRUGGLE_DURATION_TICKS,
        progress: 0.5, mashCount: 0,
        x: (Number(player.x) + Number(opponent.x)) / 2,
        y: (Number(player.y) + Number(opponent.y)) / 2,
      };
      state.beamStruggles[player.id] = struggle;
      state.beamStruggles[opponent.id] = struggle;
      emitEvent('BEAM_STRUGGLE_STARTED', { ...struggle });
      return struggle;
    }
    let nearest = null;
    Object.values(state.enemies || {}).forEach(enemy => {
      if (!enemy || enemy.dead || enemy.roomId !== player.roomId || Number(enemy.beamTime || 0) <= 0) return;
      const enemyAngle = Number(enemy.beamAngle || 0);
      const facingDot = Math.cos(channel.angle) * Math.cos(enemyAngle) + Math.sin(channel.angle) * Math.sin(enemyAngle);
      if (facingDot > -0.15) return;
      const dx = Number(enemy.x) - Number(player.x);
      const dy = Number(enemy.y) - Number(player.y);
      const distance = Math.hypot(dx, dy);
      const enemyRange = Number(enemy.beamRange || (enemy.type === 'god' ? 620 : 520));
      if (distance > Math.min(playerRange, enemyRange)) return;
      const playerLateral = Math.abs(dx * Math.sin(channel.angle) - dy * Math.cos(channel.angle));
      const enemyLateral = Math.abs((-dx) * Math.sin(enemyAngle) - (-dy) * Math.cos(enemyAngle));
      if (playerLateral > 24 || enemyLateral > 24) return;
      if (!nearest || distance < nearest.distance) nearest = { enemy, distance };
    });
    if (!nearest) return null;
    const struggle = {
      playerId: player.id,
      enemyId: nearest.enemy.id,
      startTick: state.tick,
      endTick: state.tick + BEAM_STRUGGLE_DURATION_TICKS,
      progress: 0.5,
      mashCount: 0,
      x: (Number(player.x) + Number(nearest.enemy.x)) / 2,
      y: (Number(player.y) + Number(nearest.enemy.y)) / 2,
    };
    state.beamStruggles[player.id] = struggle;
    nearest.enemy.networkBeamStrugglePlayerId = player.id;
    emitEvent('BEAM_STRUGGLE_STARTED', { ...struggle });
    return struggle;
  }

  function updateNetworkBeamStruggle(state, player, channel, emitEvent) {
    const struggle = state.beamStruggles?.[player.id];
    if (!struggle) return false;
    const enemy = state.enemies?.[struggle.enemyId];
    const opponent = state.players?.[struggle.opponentPlayerId];
    if ((!enemy && !opponent) || enemy?.dead || opponent?.downed || !channel || player.downed) {
      clearNetworkBeamStruggle(state, struggle);
      return false;
    }
    if (player.id !== struggle.playerId) return true;
    struggle.progress = Math.max(0, Math.min(1, Number(struggle.progress || 0.5) - (opponent ? 0 : 0.006)));
    const target = opponent || enemy;
    struggle.x = (Number(player.x) + Number(target.x)) / 2;
    struggle.y = (Number(player.y) + Number(target.y)) / 2;
    if (enemy) enemy.beamTime = Math.max(Number(enemy.beamTime || 0), 0.18);
    if (struggle.progress <= 0 || state.tick >= Number(struggle.endTick || 0)) {
      resolveNetworkBeamStruggle(state, struggle, false, emitEvent);
    }
    return true;
  }

  function updatePlayerBeamChannels(state, inputs, fixedDelta, emitEvent) {
    const randomService = combatRandomByState.get(state);
    const roll = () => (randomService ? randomService.next('encounter') : 1);
    for (const player of Object.values(state.players || {})) {
      const channel = player?.beamChannel;
      if (!channel) continue;
      if (player.downed || player.disconnected || state.tick >= Number(channel.untilTick || 0)) {
        endBeamChannel(state, player);
        continue;
      }
      const input = inputs?.[player.id] || {};
      const buttons = Math.trunc(Number(input.buttons) || 0);
      if (buttons & BUTTON_LASER_HELD) channel.heldSeen = true;
      else if (channel.heldSeen) {
        endBeamChannel(state, player);
        continue;
      }
      const profile = BEAM_CHANNEL_PROFILES[channel.moveKey] || {};
      const itemStats = player.itemStats || {};
      // Steer toward the freshest aim available: this tick's input stream when
      // present, otherwise the last aim the movement system recorded.
      const aimTarget = Number.isFinite(Number(input.aimDirection))
        ? Number(input.aimDirection)
        : Number(player.aimDirection) || 0;
      channel.angle = steerBeamChannelAngle(channel.moveKey, channel.angle, aimTarget, fixedDelta, {
        sweepDirection: channel.sweepDirection,
        laserWeightMultiplier: itemStats.laserWeightMultiplier,
      });
      const struggle = state.beamStruggles?.[player.id]
        || tryStartNetworkBeamStruggle(state, player, channel, emitEvent);
      if (struggle && updateNetworkBeamStruggle(state, player, channel, emitEvent)) continue;
      const weight = Math.max(0, Number(itemStats.laserWeightMultiplier ?? 1));
      const recoil = BEAM_RECOIL_ACCEL * weight + (channel.moveKey === 'wizard_lazer' ? WIZARD_LAZER_EXTRA_RECOIL : 0);
      if (recoil > 0) {
        player.vx = Number(player.vx || 0) - Math.cos(channel.angle) * recoil * fixedDelta;
        player.vy = Number(player.vy || 0) - Math.sin(channel.angle) * recoil * fixedDelta;
      }
      if (channel.moveKey === 'turtle_wave') {
        channel.turtleHpTimer = Number(channel.turtleHpTimer || 0) + fixedDelta;
        let exhausted = false;
        while (channel.turtleHpTimer >= 1) {
          channel.turtleHpTimer -= 1;
          const drain = Math.min(TURTLE_WAVE_HP_PER_SECOND, Math.max(0, Number(player.hp || 0) - 1));
          if (drain <= 0) { exhausted = true; break; }
          player.hp = Math.max(1, Number(player.hp || 0) - drain);
          if (player.hp <= 1) { exhausted = true; break; }
        }
        if (exhausted) {
          endBeamChannel(state, player);
          continue;
        }
      }
      channel.tickTimer = Number(channel.tickTimer || 0) - fixedDelta;
      if (channel.tickTimer > 0) continue;
      channel.tickTimer += Math.max(0.02, Number(profile.tickInterval || 0.08));
      const baseStats = MOVE_BASE_STATS[channel.moveKey] || {};
      const forged = applyForgeStats(player, 'move', channel.moveKey, baseStats);
      const forgeScale = Number(baseStats.damage || 0) > 0
        ? Math.max(0, Number(forged.damage || 0)) / Number(baseStats.damage)
        : 1;
      const turtleMult = (player.characterKey || player.character) === 'turtle_boy'
        ? 1 + Math.max(0, Number(player.turtleLaserSteps || 0)) * 0.15
        : 1;
      const tickDamage = Math.max(1, Number(profile.tickDamage || 10))
        * forgeScale * turtleMult * Math.max(0, Number(itemStats.beamDamageMultiplier || 1));
      const padding = Math.max(1, Number(profile.padding || 6)) * Math.max(0.1, Number(itemStats.beamWidthMultiplier || 1));
      const range = Number(profile.range || 430);
      const beamKnockback = Number(profile.knockback || 60);
      const fan = Array.isArray(profile.fan) ? profile.fan : [0];
      const targetIds = [];
      const hitThisTick = new Set();
      fan.forEach(offset => {
        const beamAngle = channel.angle + offset;
        abilityTargetsInBeam(state, player, beamAngle, range, padding).forEach(enemy => {
          // An enemy straddling two fanned beams still takes one hit per tick.
          if (hitThisTick.has(enemy.id)) return;
          hitThisTick.add(enemy.id);
          damageEnemy(state, enemy, tickDamage, player.id, emitEvent, { attackKind: channel.moveKey, angle: beamAngle, knockback: beamKnockback });
          targetIds.push(enemy.id);
          if (enemy.dead) return;
          if (channel.moveKey === 'blood_beam' && roll() < 0.05) {
            applyAuthorityStatus(state, enemy, 'bleed', 1, 3.2, player.id);
          }
          if (channel.moveKey === 'thorn_blood_beams' && roll() < 0.35) {
            applyAuthorityStatus(state, enemy, 'bleed', 1, 3.6, player.id);
          }
          if (channel.moveKey === 'mooggy_blood_beam') {
            if (roll() < 0.5) applyPoisonStatus(state, enemy, 2, 5, player.id);
            if (roll() < 0.18) enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + 28);
          }
        });
        damageRivalsInBeam(state, player, beamAngle, range, padding, tickDamage, emitEvent, channel.moveKey, targetIds);
        chipDestructiblesAlongBeam(state, player, beamAngle, range, padding, emitEvent, roll);
      });
      if (channel.moveKey === 'love_beam' && targetIds.length > 0) {
        player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + Math.min(5, targetIds.length * 0.8));
      }
      if (channel.moveKey === 'holy_eye_beams' && targetIds.length > 0 && !channel.healRolled) {
        channel.healRolled = true;
        if (roll() < 0.25) {
          player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + Number(player.maxHp || 100) * 0.05);
        }
      }
    }
  }

  function resolvePlayerAbility(state, player, action, emitEvent, random) {
    if (player.downed) return null;
    const moveKey = String(action.abilityId || '');
    const slot = MOVE_SLOT_BY_KEY[moveKey];
    if (!slot || slot === 'melee' || player.equippedMoves?.[slot] !== moveKey) return null;
    const expectedAction = slot === 'dash' ? 'DASH' : 'ABILITY';
    if (action.action !== expectedAction) return null;
    const stats = applyForgeStats(player, 'move', moveKey, MOVE_BASE_STATS[moveKey] || {});
    const presentation = MOVE_PRESENTATION_DEFS[moveKey] || { kind: slot, style: 'normal' };
    if (!hasMoveCharge(player, moveKey)) return null;
    const angle = Number(action.aimDirection);
    if (!Number.isFinite(angle)) return null;
    // God mode slashes ability cooldowns (laser 2.8s, smash 2s, dash 0.7x).
    const godCooldownMult = godModeActive(state, player)
      ? (slot === 'laser' ? 2.8 / Math.max(0.5, Number(stats.cooldown || 3.2)) : slot === 'smash' ? 2 / Math.max(0.5, Number(stats.cooldown || 4.2)) : 0.7)
      : 1;
    const cooldownTicks = Math.max(1, Math.ceil(Number(stats.cooldown || 0.5) * 20 * godCooldownMult));
    const projectileIds = [];
    const spawnedProjectiles = [];
    const abilityEntityIds = [];
    const targetIds = [];
    let mode = slot;
    let originX = Number(player.x);
    let originY = Number(player.y);
    let effectRadius = Number(stats.range || 0);
    let sweepDirection = 0;

    if (slot === 'dash') {
      const floor = state.floorState || {};
      const statusUntil = player.statusUntilTick || (player.statusUntilTick = {});
      if (moveKey === 'flying_unhitable' || moveKey === 'cowards_way' || moveKey === 'mooggy_zoomies') {
        const durationTicks = Math.max(1, Math.round(Number(stats.duration || 3) * 20));
        statusUntil[moveKey] = state.tick + durationTicks;
        mode = 'status';
      } else if (moveKey === 'princess_shield') {
        player.barrier = Math.max(Number(player.barrier || 0), Number(player.maxHp || 100) * 0.4);
        mode = 'shield';
      } else if (moveKey === 'dash') {
        // Plain dash is a 0.16s velocity glide with i-frames, exactly like the
        // campaign's castDashBurst — NOT a teleport. The movement system honors
        // dashUntilTick/dashVx/dashVy and holds the hero invulnerable.
        const dashSpeed = (520 + Number(player.attackSpeed || 0) * 28) * (godModeActive(state, player) ? 1.1 : 1);
        const dashTicks = Math.max(1, Math.round(0.16 * 20));
        player.dashUntilTick = state.tick + dashTicks;
        player.dashVx = Math.cos(angle) * dashSpeed;
        player.dashVy = Math.sin(angle) * dashSpeed;
        player.vx = player.dashVx;
        player.vy = player.dashVy;
        player.invulnerableUntilTick = Math.max(Number(player.invulnerableUntilTick || 0), state.tick + Math.round(0.18 * 20));
        mode = 'dash';
      } else {
        // Blink-strike dashes (warp, zip_lightning, knight_slash_dash) teleport
        // and slash the line they cross — they are teleports in the campaign too.
        const distance = moveKey === 'warp' ? 300 : moveKey === 'zip_lightning' ? 230 : 170;
        const minimum = Number(floor.wallThickness || 28) + Number(player.radius || 18);
        const before = { x: player.x, y: player.y };
        player.x = Math.max(minimum, Math.min(Number(floor.width || 900) - minimum, player.x + Math.cos(angle) * distance));
        player.y = Math.max(minimum, Math.min(Number(floor.height || 700) - minimum, player.y + Math.sin(angle) * distance));
        player.vx = Math.cos(angle) * distance * 5;
        player.vy = Math.sin(angle) * distance * 5;
        player.invulnerableUntilTick = Math.max(Number(player.invulnerableUntilTick || 0), state.tick + (moveKey === 'warp' ? 12 : 5));
        if (Number(stats.damage || 0) > 0) {
          livingEncounterEnemies(state, player.roomId).forEach(enemy => {
            const lineLength = Math.max(1, Math.hypot(player.x - before.x, player.y - before.y));
            const t = Math.max(0, Math.min(1, ((enemy.x - before.x) * (player.x - before.x) + (enemy.y - before.y) * (player.y - before.y)) / (lineLength * lineLength)));
            const px = before.x + (player.x - before.x) * t;
            const py = before.y + (player.y - before.y) * t;
            if (Math.hypot(enemy.x - px, enemy.y - py) > Number(enemy.radius || 20) + 28) return;
            damageEnemy(state, enemy, stats.damage, player.id, emitEvent, { attackKind: moveKey });
            targetIds.push(enemy.id);
          });
        }
        mode = moveKey === 'warp' ? 'warp' : 'dash';
      }
    } else if (slot === 'laser') {
      const projectileMoves = new Set(['love_bomb_laser', 'ghost_ball', 'power_disks', 'hammer_throw', 'nail_shot', 'laser_shockwave']);
      if (moveKey === 'lightning_columns') {
        abilityEntityIds.push(...spawnPersistentMoveEntities(state, player, moveKey, stats, angle).map(entity => entity.id));
        mode = 'summon';
      } else if (projectileMoves.has(moveKey)) {
        if (moveKey === 'power_disks') {
          createPowerDiskBurstDescriptors({ characterKey: player.characterKey || player.character }).forEach(disk => {
            projectileIds.push(createPlayerProjectile(state, player, {
              kind: disk.kind,
              attackKind: moveKey,
              damage: disk.damage,
              speed: disk.speed,
              radius: disk.radius,
              lifeTicks: Math.ceil(disk.lifeSeconds * 20),
              spawnDistance: 0,
              hitOptions: disk.hitOptions,
              subSpawn: disk.subSpawn,
            }, disk.angle).id);
          });
        } else {
          const count = moveKey === 'nail_shot' ? 8 : 1;
          for (let index = 0; index < count; index += 1) {
            const spread = count > 1 ? (index - (count - 1) / 2) * (moveKey === 'nail_shot' ? Math.PI * 2 / count : 0.14) : 0;
            projectileIds.push(createPlayerProjectile(state, player, {
              kind: moveKey,
              attackKind: moveKey,
              damage: Number(stats.damage || 20),
              speed: moveKey === 'ghost_ball' ? 300 : 520,
              radius: moveKey === 'love_bomb_laser' ? 14 : 7,
              lifeTicks: Math.max(12, Math.round(Number(stats.range || 320) / 18)),
              pierce: moveKey === 'ghost_ball' ? 8 : 0,
              splash: moveKey === 'love_bomb_laser' ? 105 : 0,
              splashDamage: Number(stats.damage || 20),
            }, angle + spread).id);
          }
        }
        mode = 'projectile';
      } else if (moveKey === 'lightning_cross') {
        livingEncounterEnemies(state, player.roomId).forEach(enemy => {
          if (Math.abs(enemy.x - player.x) > 40 && Math.abs(enemy.y - player.y) > 40) return;
          damageEnemy(state, enemy, stats.damage, player.id, emitEvent, { attackKind: moveKey });
          targetIds.push(enemy.id);
        });
        rivalPlayers(state, player).forEach(target => {
          if (Math.abs(target.x - player.x) > 40 && Math.abs(target.y - player.y) > 40) return;
          damagePlayer(state, target, playerDamage(state, player.id, stats.damage), player.id, emitEvent, moveKey);
          targetIds.push(target.id);
        });
        mode = 'cross';
      } else if (CONTINUOUS_BEAM_MOVE_SET.has(moveKey)) {
        // Channelled beam: nothing is damaged at cast time. The channel below
        // is advanced by updatePlayerBeamChannels every tick — it steers toward
        // the player's live aim, deals its damage on the campaign's tick
        // cadence, and ends on release or when the duration runs out.
        if (moveKey === 'turtle_wave' && Number(player.hp || 0) <= 1) return null;
        if (moveKey === 'god_sweep') sweepDirection = (typeof random === 'function' ? random() : 0.5) < 0.5 ? -1 : 1;
        const profile = BEAM_CHANNEL_PROFILES[moveKey] || {};
        effectRadius = Number(profile.range || stats.range || 430);
        player.beamChannel = {
          moveKey,
          angle,
          sweepDirection,
          startTick: state.tick,
          untilTick: state.tick + Math.max(1, Math.round(Math.max(0.1, Number(profile.duration || stats.duration || 0.58)) * 20)),
          tickTimer: 0,
          turtleHpTimer: 0,
          healRolled: false,
          heldSeen: false,
          cooldownTicks: 0,
        };
        mode = 'beam';
      } else {
        const range = Number(stats.range || (moveKey === 'blade_justice' ? 90 : 470));
        const width = 24;
        effectRadius = range;
        abilityTargetsInBeam(state, player, angle, range, width).forEach(enemy => {
          damageEnemy(state, enemy, stats.damage, player.id, emitEvent, {
            attackKind: moveKey,
            angle: Math.atan2(enemy.y - player.y, enemy.x - player.x),
            knockback: 90,
          });
          targetIds.push(enemy.id);
        });
        damageRivalsInBeam(state, player, angle, range, width, stats.damage, emitEvent, moveKey, targetIds);
        chipDestructiblesAlongBeam(state, player, angle, range, width, emitEvent, random);
        mode = 'beam';
      }
    } else if (slot === 'smash') {
      if (moveKey === 'healing_zone' || moveKey === 'potion_bath' || moveKey === 'turtle_powerup') {
        const heal = moveKey === 'potion_bath'
          ? Number(player.maxHp || 100) * 0.2
          : moveKey === 'turtle_powerup'
            ? Number(player.maxHp || 100) * 0.12
            : 0;
        player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + heal);
        if (moveKey === 'turtle_powerup') player.barrier = Math.max(Number(player.barrier || 0), Number(player.hp || 0) * 0.25);
        const statusUntil = player.statusUntilTick || (player.statusUntilTick = {});
        statusUntil[moveKey] = state.tick + Math.max(1, Math.round(Number(stats.duration || 3) * 20));
        if (moveKey === 'healing_zone') {
          abilityEntityIds.push(...spawnPersistentMoveEntities(state, player, moveKey, stats, angle).map(entity => entity.id));
        }
        mode = 'support';
      } else if (moveKey === 'death_ball') {
        projectileIds.push(createPlayerProjectile(state, player, {
          kind: moveKey,
          attackKind: moveKey,
          damage: Number(stats.damage || 40),
          speed: 350,
          radius: 16,
          lifeTicks: 30,
          splash: Number(stats.range || 140),
          splashDamage: Number(stats.damage || 40),
        }, angle).id);
        mode = 'projectile';
      } else if (moveKey === 'holy_turrets') {
        abilityEntityIds.push(...spawnPersistentMoveEntities(state, player, moveKey, stats, angle).map(entity => entity.id));
        mode = 'summon';
      } else {
        const centerDistance = 0;
        const centerX = player.x + Math.cos(angle) * centerDistance;
        const centerY = player.y + Math.sin(angle) * centerDistance;
        originX = centerX;
        originY = centerY;
        effectRadius = Number(stats.range || 140);
        chipDestructiblesInRadius(state, player, centerX, centerY, effectRadius, Number(stats.damage || 1), emitEvent, random);
        abilityTargetsInRadius(state, player, centerX, centerY, Number(stats.range || 140)).forEach(enemy => {
          // Smash AoE shoves enemies outward from the impact center.
          damageEnemy(state, enemy, stats.damage, player.id, emitEvent, {
            attackKind: moveKey,
            angle: Math.atan2(enemy.y - centerY, enemy.x - centerX),
            knockback: 260,
          });
          if (moveKey === 'hammer_smash' && !enemy.dead) {
            enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + 14);
          }
          if (moveKey === 'random_pounce' && !enemy.dead) {
            applyAuthorityStatus(
              state,
              enemy,
              'bleed',
              2,
              5 * Math.max(1, Number(player.itemStats?.statusDurationMultiplier || 1)),
              player.id,
            );
          }
          if (moveKey === 'mooggy_hairball' && !enemy.dead) {
            applyPoisonStatus(state, enemy, 3, 6, player.id);
            enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + 16);
            applyAuthorityStatus(state, enemy, 'slow', 1, 4, player.id);
          }
          targetIds.push(enemy.id);
        });
        damageRivalsInRadius(state, player, centerX, centerY, Number(stats.range || 140), stats.damage, emitEvent, moveKey, targetIds);
        if (moveKey === 'crimson_smash') {
          const rocks = spawnCrimsonSmashRocks(state, player, stats, angle, random);
          projectileIds.push(...rocks.map(projectile => projectile.id));
          spawnedProjectiles.push(...rocks.map(projectileTrajectory));
        }
        if (['chaos_burst', 'fire_circle', 'floor_lava'].includes(moveKey)) {
          abilityEntityIds.push(...spawnPersistentMoveEntities(state, player, moveKey, stats, angle).map(entity => entity.id));
        }
        mode = 'aoe';
      }
    }

    const scaledCooldownTicks = Math.max(1, Math.ceil(cooldownTicks * Math.max(0.45, Number(player.cooldownMultiplier || 1))));
    if (player.beamChannel?.moveKey === moveKey && player.beamChannel.startTick === state.tick) {
      // Held beams recharge from the moment the channel ends, like the
      // campaign's queueHeldSkillRecharge. Assume the full duration here;
      // endBeamChannel rewrites this if the beam is released early.
      player.beamChannel.cooldownTicks = scaledCooldownTicks;
      spendMoveCharge(player, moveKey, player.beamChannel.untilTick + scaledCooldownTicks);
    } else {
      spendMoveCharge(player, moveKey, state.tick + scaledCooldownTicks);
    }
    const destinationX = Number(player.x);
    const destinationY = Number(player.y);
    setPlayerAction(state, player, slot, moveKey, angle);
    emitEvent('PLAYER_ABILITY_USED', {
      playerId: player.id,
      roomId: player.roomId,
      characterKey: player.characterKey,
      slot,
      abilityId: moveKey,
      mode,
      aimDirection: angle,
      cooldownTicks,
      presentationKey: moveKey,
      presentation: { key: moveKey, kind: presentation.kind, style: presentation.style },
      originX,
      originY,
      destinationX,
      destinationY,
      effectRadius,
      sweepDirection,
      // Dash-glide velocity so the local caster can start the glide immediately.
      ...(moveKey === 'dash' ? { dashVx: Number(player.dashVx || 0), dashVy: Number(player.dashVy || 0) } : {}),
      projectileIds,
      spawnedProjectiles,
      abilityEntityIds,
      targetIds,
    });
    return {
      moveKey, slot, mode, originX, originY, destinationX, destinationY,
      effectRadius, projectileIds, spawnedProjectiles, targetIds,
      abilityEntityIds,
    };
  }

  // Drink a stored potion. At full HP, a potion is instead shared with a nearby
  // wounded rival — healing it and befriending it for the rest of the run,
  // exactly like tryUsePotion in the campaign.
  function resolveUsePotion(state, player, emitEvent) {
    if (!player || player.downed) return;
    const stored = Number(player.storedPotions || 0);
    if (stored <= 0) {
      emitEvent('POTION_EMPTY', { playerId: player.id });
      return;
    }
    if (Number(player.hp || 0) >= Number(player.maxHp || 100)) {
      const woundedRival = livingEncounterEnemies(state, player.roomId).find(enemy => (
        enemy.type === 'rival' && !enemy.rivalFriend
          && Number(enemy.health || 0) < Number(enemy.maxHealth || 1)
          && Math.hypot(enemy.x - player.x, enemy.y - player.y) < 140
      ));
      if (woundedRival) {
        player.storedPotions = stored - 1;
        woundedRival.health = Number(woundedRival.maxHealth || 1);
        woundedRival.hp = woundedRival.health;
        woundedRival.rivalFriend = true;
        const entry = getRosterEntry(state, woundedRival.rivalCharacterKey);
        if (entry) { entry.friend = true; entry.vendetta = false; entry.relationship = Math.max(10, Number(entry.relationship || 0) + 10); }
        emitEvent('RIVAL_BEFRIENDED', { playerId: player.id, enemyId: woundedRival.id, characterKey: woundedRival.rivalCharacterKey });
        return;
      }
      emitEvent('POTION_FULL_HP', { playerId: player.id });
      return;
    }
    player.storedPotions = stored - 1;
    const itemStats = player.itemStats || {};
    const heal = 40 * Math.max(1, Number(itemStats.storedPotionHealingMultiplier || 1)) * Math.max(1, Number(itemStats.healingMultiplier || 1));
    const before = Number(player.hp || 0);
    player.hp = Math.min(Number(player.maxHp || 100), before + heal);
    emitEvent('POTION_USED', { playerId: player.id, healedAmount: Math.max(0, player.hp - before), storedPotions: player.storedPotions });
  }

  function resolvePlayerInteraction(state, player, action, emitEvent, random) {
    if (!player || player.downed || player.pendingUpgrade) return false;
    const target = state.interactables?.[action.targetEntityId];
    if (!target || target.opened || target.activated || target.roomId !== player.roomId) return false;
    if (Math.hypot(Number(target.x) - Number(player.x), Number(target.y) - Number(player.y))
      > Number(target.radius || 30) + Number(player.radius || 18) + 38) return false;
    if (target.kind !== 'relic_chest') return false;
    const chestRandom = random?.scoped?.(`chest:open:${state.floorNumber}:${target.roomId}:${target.id}`);
    const opened = openCampaignChest(target, {
      floorNumber: state.floorNumber,
      random: chestRandom,
      groupId: target.id,
    });
    if (!opened.ok) return false;
    target.offeredTo = player.id;
    target.activatedTick = state.tick;
    emitEvent('CHEST_OPENED', { playerId: player.id, interactableId: target.id, roomId: target.roomId });
    const spawnPickup = descriptor => {
      const pickupId = state.allocateEntityId('pickup');
      state.pickups[pickupId] = {
        id: pickupId, ...descriptor, roomId: target.roomId,
        x: Number(descriptor.x ?? target.x), y: Number(descriptor.y ?? target.y),
        radius: 13, amount: Number(descriptor.amount || 1), spawnTick: state.tick,
      };
      emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: descriptor.type, roomId: target.roomId });
    };
    spawnPickup({ type: 'coin', amount: opened.coinAmount, x: target.x, y: target.y });
    opened.pickups.forEach(spawnPickup);
    if (!opened.selection) {
      target.claimedBy = player.id;
      const rewardState = state.floorState.rewards?.[target.roomId];
      if (rewardState) {
        rewardState.claimedIds = [...new Set([...(rewardState.claimedIds || []), target.id])];
        rewardState.status = (rewardState.interactableIds || []).every(id => state.interactables[id]?.opened) ? 'claimed' : 'available';
      }
      return true;
    }
    const optionIds = opened.selection.optionIds;
    if (!optionIds.length) return false;
    player.pendingUpgrade = {
      selectionEventId: opened.selection.selectionEventId,
      sourceEntityId: target.id,
      optionIds: optionIds.slice(),
      options: optionIds.map(optionId => ({ id: optionId })),
    };
    emitEvent('UPGRADE_OFFERED', { playerId: player.id, selectionEventId: opened.selection.selectionEventId, optionIds });
    return true;
  }

  function updateChestProximity(state, emitEvent, random) {
    Object.values(state.interactables || {}).forEach(chest => {
      if (chest.kind !== 'relic_chest' || chest.opened || chest.activated) return;
      if (Number(chest.spawnTick || 0) >= Number(state.tick || 0)) return;
      const player = activePlayers(state).find(candidate => !candidate.downed && !candidate.pendingUpgrade
        && candidate.roomId === chest.roomId
        && Math.hypot(Number(candidate.x) - Number(chest.x), Number(candidate.y) - Number(chest.y)) < 36);
      if (player) resolvePlayerInteraction(state, player, { targetEntityId: chest.id }, emitEvent, random);
    });
  }

  function resolveUpgradeSelection(state, player, action, emitEvent, random) {
    const pending = player?.pendingUpgrade;
    if (!pending || pending.selectionEventId !== action.selectionEventId || !pending.optionIds.includes(action.optionId)) return false;
    const source = state.interactables?.[pending.sourceEntityId];
    if (!source || source.opened) {
      player.pendingUpgrade = null;
      return false;
    }
    const claim = claimCampaignChestSelection(source, action.optionId);
    if (!claim.ok) return false;
    const loot = random?.stream?.('loot');
    const acquisition = collectCampaignPickup(state, player, claim.itemKey, {
      duplicateChance: player.itemStats?.itemDuplicateChance,
      canDuplicate: claim.itemKey !== 'artificer_charger',
      random: loot ? () => loot.next() : Math.random,
      rollItem: (nextRandom, excludeKeys) => rollCampaignItem(nextRandom, { excludeKeys }),
    });
    if (!acquisition.ok) return false;
    if (acquisition.jester?.ok) {
      Object.entries(acquisition.jester.bonusItemCounts).forEach(([itemKey, bonusAmount]) => {
        emitEvent('ITEM_BONUS_ACQUIRED', { playerId: player.id, itemKey, amount: bonusAmount, source: 'jesters_dice' });
      });
      emitEvent('JESTER_GATE_PENDING', { playerId: player.id, skipFloors: acquisition.jester.skipFloors });
    }
    source.claimedBy = player.id;
    source.openedTick = state.tick;
    const rewardState = state.floorState.rewards[source.roomId];
    if (rewardState) {
      rewardState.claimedIds = [...new Set([...(rewardState.claimedIds || []), source.id])];
      rewardState.status = (rewardState.interactableIds || []).every(id => state.interactables[id]?.opened)
        ? 'claimed'
        : 'available';
    }
    player.pendingUpgrade = null;
    emitEvent('UPGRADE_APPLIED', {
      playerId: player.id,
      roomId: source.roomId,
      selectionEventId: action.selectionEventId,
      optionId: action.optionId,
      itemKey: action.optionId,
      amount: acquisition.amount,
      duplicated: acquisition.duplicated,
      itemCount: Object.values(player.items || {}).reduce((total, count) => total + Number(count || 0), 0),
    });
    return true;
  }

  function updatePlayerActions(state, inputs, emitEvent, random) {
    Object.values(state.players || {}).forEach(player => {
      const pending = Array.isArray(player.pendingWeaponStrikes) ? player.pendingWeaponStrikes : [];
      player.pendingWeaponStrikes = pending.filter(strike => {
        if (state.tick < Number(strike.dueTick || 0)) return true;
        resolveSweep(state, player, strike.definition, strike.angle, emitEvent, random, 1);
        player.action = 'attack';
        player.actionTick = state.tick;
        player.actionMode = strike.definition.mode;
        player.actionKind = strike.definition.weaponKey;
        player.aimDirection = strike.angle;
        emitEvent('PLAYER_ATTACK_FOLLOWUP', { playerId: player.id, weaponKey: strike.definition.weaponKey, aimDirection: strike.angle });
        return false;
      });
      const actions = Array.isArray(inputs[player.id]?.actions) ? inputs[player.id].actions : [];
      if (state.tick < Number(player.stunnedUntilTick || 0)) {
        player.action = 'stunned';
        return;
      }
      actions.filter(action => action?.action === 'BEAM_MASH')
        .forEach(() => registerNetworkBeamMash(state, player, emitEvent));
      if (actions.some(action => action?.action === 'ATTACK' || action?.action === 'ABILITY')) {
        if (player.statusUntilTick) delete player.statusUntilTick.cowards_way;
      }
      const attack = actions.find(action => action?.action === 'ATTACK');
      if (attack) resolvePlayerAttack(state, player, attack, emitEvent, random);
      actions.filter(action => action?.action === 'ABILITY' || action?.action === 'DASH')
        .forEach(action => resolvePlayerAbility(state, player, action, emitEvent, random));
      actions.filter(action => action?.action === 'INTERACT')
        .forEach(action => resolvePlayerInteraction(state, player, action, emitEvent, random));
      actions.filter(action => action?.action === 'USE_POTION')
        .forEach(() => resolveUsePotion(state, player, emitEvent));
      actions.filter(action => action?.action === 'UPGRADE')
        .forEach(action => resolveUpgradeSelection(state, player, action, emitEvent, random));
      actions.filter(action => action?.action === 'SHOP_PURCHASE')
        .forEach(action => resolveShopPurchase(state, player, action, emitEvent));
      actions.filter(action => action?.action === 'FORGE_COMMIT')
        .forEach(action => resolveForgeCommand(state, player, action, emitEvent));
      actions.filter(action => ['EQUIP_MOVE', 'EQUIP_WEAPON', 'REORDER_EQUIPMENT', 'ACTIVATE_EQUIPMENT'].includes(action?.action))
        .forEach(action => resolveInventoryCommand(state, player, action, emitEvent));
      actions.filter(action => action?.action === 'SPECIAL_ROOM_CHOICE')
        .forEach(action => resolveSpecialRoomCommand(state, player, action, emitEvent, random));
      actions.filter(action => ['WIZARD_PAW_SELECT', 'EXTRA_BATTERY_SELECT', 'VOUCHER_REDEEM', 'SCROLL_APPLY'].includes(action?.action))
        .forEach(action => resolveAcquisitionCommand(state, player, action, emitEvent, random));
      if (player.action !== 'idle' && state.tick - Number(player.actionTick || 0) > 4) player.action = 'idle';
    });
  }

  function damagePlayer(state, player, damage, sourceId, emitEvent, attackKind = 'contact', options = {}) {
    if (!player || player.downed) return;
    const statusUntil = player.statusUntilTick || {};
    const protectedByStatus = state.tick < Number(player.invulnerableUntilTick || 0)
      || state.tick < Number(statusUntil.flying_unhitable || 0)
      || state.tick < Number(statusUntil.cowards_way || 0)
      || state.tick < Number(statusUntil.potion_bath || 0);
    if (protectedByStatus && !options.ignoreInv) {
      emitEvent('PLAYER_DAMAGE_BLOCKED', { playerId: player.id, sourceId, roomId: player.roomId, attackKind });
      return;
    }
    const itemStats = player.itemStats || {};
    let incoming = Math.max(0, Number(damage || 0))
      * (1 - Math.max(0, Math.min(0.85, Number(itemStats.damageReduction || 0))));
    incoming = Math.max(0, incoming - Math.max(0, Number(itemStats.flatDamageReduction || 0)));
    const room = currentRoom(state, player.roomId);
    if (!options.ignoreDamageCaps && itemStats.hasIronLung && room?.type !== 'boss' && room?.type !== 'god') {
      incoming = Math.min(incoming, Math.max(1, Number(player.maxHp || 100)) * 0.2);
    }
    const absorbed = Math.min(incoming, Math.max(0, Number(player.barrier || 0)));
    player.barrier = Math.max(0, Number(player.barrier || 0) - absorbed);
    const uncappedDealt = incoming - absorbed;
    const maxHitRatio = Number.isFinite(Number(options.maxHitRatio))
      ? Math.max(0, Math.min(1, Number(options.maxHitRatio)))
      : null;
    const dealt = maxHitRatio == null
      ? uncappedDealt
      : Math.min(uncappedDealt, Math.max(1, Number(player.maxHp || 120)) * maxHitRatio);
    player.hp = Math.max(0, Number(player.hp || 0) - dealt);
    player.hitTick = state.tick;
    const impulse = dealt > 0 && Number(options.knockback || 0) > 0
      ? applyCampaignImpulse(player, Number(options.angle || 0), Number(options.knockback || 0), Number(itemStats.anchorKnockbackResist || 0))
      : null;
    if (dealt > 0) {
      const stunResistance = Math.max(0, Number(itemStats.stunResistance || 0));
      const thresholdMultiplier = 1 + stunResistance * 0.35;
      const durationMultiplier = Math.max(0.28, 1 - stunResistance * 0.28)
        * Math.max(0, Number(itemStats.negativeStatusMultiplier ?? 1));
      const lostHalfHealth = dealt >= Math.max(1, Number(player.maxHp || 100))
        * HEAVY_HIT_HEALTH_RATIO * thresholdMultiplier;
      const knockback = Number(impulse?.magnitude || 0);
      const knockbackThreshold = HEAVY_KNOCKBACK_THRESHOLD * thresholdMultiplier;
      const heavyKnockback = knockback >= knockbackThreshold;
      if (lostHalfHealth || heavyKnockback) {
        let seconds = lostHalfHealth ? HEAVY_HIT_STUN_SECONDS : 0;
        if (heavyKnockback) {
          const excess = Math.max(0, Math.min(1, (knockback - knockbackThreshold) / knockbackThreshold));
          seconds = Math.max(seconds, HEAVY_KNOCKBACK_STUN_SECONDS + excess * 0.18);
        }
        player.stunnedUntilTick = Math.max(
          Number(player.stunnedUntilTick || 0),
          state.tick + Math.ceil(seconds * durationMultiplier * 20),
        );
      }
    }
    const newlyDowned = player.hp <= 0;
    if (newlyDowned) {
      player.downed = true;
      player.downedAtTick = state.tick;
      player.vx = 0;
      player.vy = 0;
      player.deaths = Number(player.deaths || 0) + 1;
      const stats = state.runStats || (state.runStats = { killsByPlayer: {}, playerKills: {}, deathsByPlayer: {} });
      stats.deathsByPlayer = stats.deathsByPlayer || {};
      stats.deathsByPlayer[player.id] = Number(stats.deathsByPlayer[player.id] || 0) + 1;
      if (state.players?.[sourceId] && sourceId !== player.id) {
        const attacker = state.players[sourceId];
        attacker.playerKills = Number(attacker.playerKills || 0) + 1;
        stats.playerKills = stats.playerKills || {};
        stats.playerKills[sourceId] = Number(stats.playerKills[sourceId] || 0) + 1;
      }
      emitEvent('PLAYER_DOWNED', { playerId: player.id, sourceId, roomId: player.roomId, attackKind });
    }
    emitEvent('PLAYER_HIT', {
      playerId: player.id,
      enemyId: state.players?.[sourceId] ? undefined : sourceId,
      sourcePlayerId: state.players?.[sourceId] ? sourceId : undefined,
      damage: dealt,
      absorbed,
      health: player.hp,
      attackKind,
      knockbackAngle: impulse?.angle,
      knockbackMagnitude: impulse?.magnitude,
    });
  }

  function playerInsideRoomHazard(player, hazard) {
    const radius = Math.max(1, Number(player.radius || 18));
    if (hazard.shape === 'rect' || (Number(hazard.w) > 0 && Number(hazard.h) > 0)) {
      const left = Number.isFinite(Number(hazard.left)) ? Number(hazard.left) : Number(hazard.x) - Number(hazard.w) / 2;
      const top = Number.isFinite(Number(hazard.top)) ? Number(hazard.top) : Number(hazard.y) - Number(hazard.h) / 2;
      const nearX = Math.max(left, Math.min(left + Number(hazard.w), Number(player.x)));
      const nearY = Math.max(top, Math.min(top + Number(hazard.h), Number(player.y)));
      return Math.hypot(Number(player.x) - nearX, Number(player.y) - nearY) < radius;
    }
    return Math.hypot(Number(player.x) - Number(hazard.x), Number(player.y) - Number(hazard.y))
      <= radius + Number(hazard.triggerRadius || hazard.r || 16);
  }

  // Boss-authored transient hazards (Bowman lightning columns/strike lines,
  // Devil red spikes and lava grid). Same shapes and cadence the campaign
  // pushes into Neo.hazards; ttl-limited and removed on expiry.
  function updateTransientEnemyHazards(state, room, players, fixedDelta, emitEvent) {
    let expired = false;
    room.hazards.forEach(hazard => {
      if (!hazard.enemy) return;
      hazard.ttl = Number(hazard.ttl || 0) - fixedDelta;
      if (hazard.ttl <= 0) {
        expired = true;
        return;
      }
      if (hazard.kind === 'lightning_column') {
        hazard.tick = Number(hazard.tick || 0) - fixedDelta;
        if (hazard.tick <= 0) {
          hazard.tick = Number(hazard.interval || 0.38);
          players.forEach(player => {
            if (Math.hypot(player.x - hazard.x, player.y - hazard.y) > Number(hazard.r || 44) + Number(player.radius || 18)) return;
            damagePlayer(state, player, Number(hazard.damage || 10), hazard.ownerId, emitEvent, hazard.source || 'lightning_column', {
              angle: Math.atan2(player.y - hazard.y, player.x - hazard.x),
              knockback: 120,
            });
          });
        }
        return;
      }
      if (hazard.kind === 'lightning_strike_line') {
        if (Number(hazard.warn || 0) > 0) {
          hazard.warn = Number(hazard.warn || 0) - fixedDelta;
          return;
        }
        hazard.tick = Number(hazard.tick || 0) - fixedDelta;
        if (hazard.tick <= 0) {
          hazard.tick = Number(hazard.interval || 0.12);
          players.forEach(player => {
            const hit = segmentHitsCircle(hazard.x1, hazard.y1, hazard.x2, hazard.y2, player.x, player.y, Number(hazard.r || 30) + Number(player.radius || 18));
            if (!hit) return;
            damagePlayer(state, player, Number(hazard.damage || 10), hazard.ownerId, emitEvent, hazard.source || 'lightning_strike', {
              angle: hit.angle,
              knockback: 150,
            });
          });
        }
        return;
      }
      if (hazard.kind === 'red_spikes') {
        hazard.armTime = Number(hazard.armTime || 0) - fixedDelta;
        if (hazard.armTime > 0 || hazard.hit) return;
        players.forEach(player => {
          if (hazard.hit) return;
          if (Math.hypot(player.x - hazard.x, player.y - hazard.y) > Number(hazard.r || 34) + Number(player.radius || 18)) return;
          hazard.hit = true;
          damagePlayer(state, player, Number(hazard.damage || 10), hazard.ownerId, emitEvent, hazard.source || 'red_spikes', {
            angle: Math.atan2(player.y - hazard.y, player.x - hazard.x),
            knockback: 170,
          });
          if (hazard.statusKey) {
            applyAuthorityStatus(state, player, hazard.statusKey, Number(hazard.statusStacks || 1), Number(hazard.statusDuration || 3), hazard.ownerId);
          }
        });
        return;
      }
      if (hazard.kind === 'lava') {
        hazard.damageCooldownByPlayer = hazard.damageCooldownByPlayer || {};
        players.forEach(player => {
          if (!playerInsideRoomHazard(player, hazard)) return;
          if (state.tick < Number(hazard.damageCooldownByPlayer[player.id] || 0)) return;
          hazard.damageCooldownByPlayer[player.id] = state.tick + 10;
          damagePlayer(state, player, Number(hazard.damage || 8), hazard.ownerId, emitEvent, hazard.source || 'lava', {});
          applyAuthorityStatus(state, player, 'fire', Number(hazard.statusStacks || 1), 2.6, hazard.ownerId);
        });
      }
    });
    if (expired) room.hazards = room.hazards.filter(hazard => !hazard.enemy || Number(hazard.ttl || 0) > 0);
  }

  function updateRoomHazards(state, fixedDelta, emitEvent) {
    const rooms = state.floorState?.layout?.rooms || [];
    rooms.forEach(room => {
      if (!Array.isArray(room.hazards) || room.hazards.length === 0) return;
      const players = Object.values(state.players || {}).filter(player => !player.downed && player.roomId === room.id);
      updateTransientEnemyHazards(state, room, players, fixedDelta, emitEvent);
      room.hazards.forEach(hazard => {
        if (hazard.enemy) return;
        if (Number(hazard.vx || 0) || Number(hazard.vy || 0)) {
          advanceCampaignMovingWorldEntity(hazard, fixedDelta, {
            width: state.floorState?.width,
            height: state.floorState?.height,
            margin: Number(hazard.boundaryMargin || hazard.r || 0),
          });
        }
        hazard.damageCooldownByPlayer = hazard.damageCooldownByPlayer || {};
        if (hazard.kind === 'lava') {
          players.forEach(player => {
            if (!playerInsideRoomHazard(player, hazard)) return;
            if (state.tick < Number(hazard.damageCooldownByPlayer[player.id] || 0)) return;
            hazard.damageCooldownByPlayer[player.id] = state.tick + 10;
            damagePlayer(state, player, Number(hazard.baseDamage || hazard.damage || 8), `room-hazard:${room.id}`, emitEvent, 'lava');
          });
          return;
        }
        if (hazard.kind !== 'explosive_trap') return;
        if (!hazard.triggered) {
          const trigger = players.find(player => playerInsideRoomHazard(player, { ...hazard, r: hazard.triggerRadius || 34 }));
          if (!trigger) return;
          hazard.triggered = true;
          hazard.triggeredTick = state.tick;
          hazard.fuse = Number(hazard.fuseDuration || 0.78);
          emitEvent('ROOM_HAZARD_TRIGGERED', { roomId: room.id, hazardKind: hazard.kind, playerId: trigger.id, x: hazard.x, y: hazard.y });
          return;
        }
        if (hazard.exploded) return;
        hazard.fuse = Math.max(0, Number(hazard.fuse || 0) - fixedDelta);
        if (hazard.fuse > 0) return;
        hazard.exploded = true;
        players.forEach(player => {
          if (Math.hypot(Number(player.x) - Number(hazard.x), Number(player.y) - Number(hazard.y)) > Number(hazard.blastRadius || 88) + Number(player.radius || 18)) return;
          damagePlayer(state, player, Number(hazard.baseDamage || 18), `room-hazard:${room.id}`, emitEvent, 'explosive_trap', {
            angle: Math.atan2(Number(player.y) - Number(hazard.y), Number(player.x) - Number(hazard.x)),
            knockback: Number(hazard.knockback || 220),
          });
        });
        emitEvent('ROOM_HAZARD_EXPLODED', { roomId: room.id, hazardKind: hazard.kind, x: hazard.x, y: hazard.y, blastRadius: hazard.blastRadius });
      });
      room.hazards = room.hazards.filter(hazard => !hazard.exploded);
    });
  }

  function createEnemyProjectile(state, enemy, target) {
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    const projectileId = state.allocateEntityId('projectile');
    state.projectiles[projectileId] = {
      id: projectileId,
      type: enemy.type === 'hunter' ? 'hunter_arrow' : enemy.behavior === 'beam' ? 'enemy_beam_bolt' : enemy.behavior === 'burst' ? 'enemy_burst_round' : `${enemy.type}_shot`,
      ownerId: enemy.id,
      hostile: true,
      roomId: enemy.roomId,
      x: enemy.x + Math.cos(angle) * (Number(enemy.radius || 19) + 10),
      y: enemy.y + Math.sin(angle) * (Number(enemy.radius || 19) + 10),
      vx: Math.cos(angle) * 390,
      vy: Math.sin(angle) * 390,
      radius: enemy.behavior === 'beam' ? 9 : enemy.behavior === 'burst' ? 4 : 6,
      damage: Number(enemy.projectileDamage || 9),
      // colour is derived client-side from `behavior` (see NetworkGameView cosmetics)
      behavior: enemy.behavior,
      attackKind: enemy.type === 'hunter' ? 'hunter_arrow' : enemy.type,
      spawnTick: state.tick,
      expiresTick: state.tick + 30,
    };
    return projectileId;
  }

  function spawnSummonedEnemy(state, summoner, emitEvent, options = {}) {
    const definition = getEnemyDefinition(options.type || 'cult_follower');
    const enemyId = state.allocateEntityId('enemy');
    const angle = (Number(state.tick || 0) + Number(String(enemyId).replace(/\D/g, '') || 0)) * 1.7;
    const wall = Number(state.floorState?.wallThickness || 28) + Number(definition.radius || 12);
    const x = Number.isFinite(Number(options.x)) ? Number(options.x) : summoner.x + Math.cos(angle) * 48;
    const y = Number.isFinite(Number(options.y)) ? Number(options.y) : summoner.y + Math.sin(angle) * 48;
    state.enemies[enemyId] = {
      id: enemyId,
      type: definition.type,
      spriteKey: definition.spriteKey,
      behavior: definition.behavior,
      roomId: summoner.roomId,
      x: Math.max(wall, Math.min(Number(state.floorState?.width || 900) - wall, x)),
      y: Math.max(wall, Math.min(Number(state.floorState?.height || 700) - wall, y)),
      vx: 0, vy: 0,
      radius: definition.radius,
      moveSpeed: definition.moveSpeed,
      maxHealth: definition.maxHealth,
      health: definition.maxHealth,
      contactDamage: definition.contactDamage,
      projectileDamage: 6,
      contactCooldownUntilTick: 0,
      attackCooldownUntilTick: state.tick + 12,
      attackWindupUntilTick: 0,
      state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
      statuses: createCampaignStatusMap(),
      summonedBy: summoner.id,
      stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
      attackCd: Number(definition.attackCooldown || 0.85),
    };
    state.floorState?.encounters?.[summoner.roomId]?.enemyIds?.push(enemyId);
    emitEvent('ENEMY_SPAWNED', { enemyId, roomId: summoner.roomId, enemyType: definition.type, summonedBy: summoner.id });
  }

  function updateEnemySupport(state, enemy, emitEvent) {
    if (!['healer', 'shield'].includes(enemy.behavior) || state.tick < Number(enemy.supportCooldownUntilTick || 0)) return;
    const allies = livingEncounterEnemies(state, enemy.roomId).filter(candidate => candidate.id !== enemy.id);
    if (!allies.length) return;
    allies.sort((first, second) => (first.health / first.maxHealth) - (second.health / second.maxHealth));
    const target = allies[0];
    if (enemy.behavior === 'healer') target.health = Math.min(target.maxHealth, target.health + Math.max(8, Math.round(target.maxHealth * 0.12)));
    else target.barrier = Math.max(Number(target.barrier || 0), Math.round(target.maxHealth * 0.24));
    enemy.supportCooldownUntilTick = state.tick + (enemy.behavior === 'healer' ? 60 : 56);
    emitEvent('ENEMY_SUPPORT_USED', { enemyId: enemy.id, targetEnemyId: target.id, supportKind: enemy.behavior });
  }

  function moveEnemy(enemy, angle, multiplier, fixedDelta, floor, room) {
    const slowMultiplier = getCampaignSlowMultiplier(getCampaignStatusStacks(enemy, 'slow'));
    const speed = Number(enemy.moveSpeed || 72) * multiplier * slowMultiplier;
    enemy.vx = Math.cos(angle) * speed;
    enemy.vy = Math.sin(angle) * speed;
    enemy.facing = enemy.vx < 0 ? -1 : 1;
    const minimum = Number(floor.wallThickness || 28) + Number(enemy.radius || 20);
    const maximumX = Number(floor.width || 900) - minimum;
    const maximumY = Number(floor.height || 700) - minimum;
    const desiredX = Math.max(minimum, Math.min(maximumX, enemy.x + enemy.vx * fixedDelta));
    const desiredY = Math.max(minimum, Math.min(maximumY, enemy.y + enemy.vy * fixedDelta));
    const collision = resolveRoomObstacleMovement(room, enemy, desiredX, desiredY);
    if (collision.blockedX) enemy.vx = 0;
    if (collision.blockedY) enemy.vy = 0;
    enemy.x = collision.x;
    enemy.y = collision.y;
  }

  function scaleAuthorityStatusDamage(state, enemy, key, rawDamage, status) {
    const owner = state.players?.[status?.ownerId];
    const loopNumber = Math.max(1, Math.floor((Math.max(1, Number(state.floorNumber || 1)) - 1) / MAX_FLOOR) + 1);
    let staged = Math.max(0, Number(rawDamage || 0));
    if (key === 'bleed' || key === 'fire') {
      staged = scaleCampaignDamage({
        damage: staged,
        enemy,
        itemStats: owner?.itemStats,
        attackPower: owner?.attackPower,
        attackerDamageMultiplier: Math.max(0.1, Number(owner?.damageMultiplier || 1)),
        isBoss: !!getEnemyDefinition(enemy.type)?.boss || !!enemy.miniBoss,
        hasBleed: getCampaignStatusStacks(enemy, 'bleed') > 0,
        applyBleedBonus: key !== 'bleed',
        glassCannon: !!state.matchRules?.glassCannon,
        loopNumber,
        enemyLoopDamageReduction: state.matchRules?.enemyLoopDamageReduction,
      });
    }
    if (key === 'bleed') {
      const divisor = getCampaignBleedResistance(enemy, {
        progressionDepth: Number(state.floorNumber || 1),
        maxFloor: MAX_FLOOR,
      });
      const innateResistance = Math.max(0, Math.min(0.8, Number(enemy.bleedResistance || 0)));
      staged = staged / divisor
        * Math.max(0.2, 1 - innateResistance)
        * Math.max(0, Number(state.matchRules?.enemyBleedDamageMultiplier ?? 1));
    }
    return scaleCampaignDamage({
      damage: Math.max(1, Math.round(staged)),
      enemy,
      raw: true,
      loopNumber,
      enemyLoopDamageReduction: state.matchRules?.enemyLoopDamageReduction,
    });
  }

  function updateAuthorityStatuses(state, fixedDelta, emitEvent) {
    Object.values(state.enemies || {}).forEach(enemy => {
      if (!enemy || enemy.dead) return;
      ensureCampaignStatuses(enemy);
      tickCampaignStatuses(enemy, fixedDelta, {
        maxHp: enemy.maxHealth,
        isDead: () => !!enemy.dead,
        dealDamage: (key, rawDamage, status) => {
          const damage = scaleAuthorityStatusDamage(state, enemy, key, rawDamage, status);
          damageEnemy(state, enemy, damage, status.ownerId, emitEvent, {
            attackKind: key,
            preScaled: true,
            canCrit: false,
          });
          return damage;
        },
      });
    });
    Object.values(state.players || {}).forEach(player => {
      if (!player || player.downed || player.disconnected) return;
      ensureCampaignStatuses(player);
      const stats = player.itemStats || {};
      tickCampaignStatuses(player, fixedDelta, {
        maxHp: player.maxHp,
        targetKind: 'player',
        fireResistance: Number(stats.fireResistance || 0),
        playerColdBudget: true,
        getDurationDecay: key => key === 'bleed' ? Number(stats.bleedDurationDecayMultiplier || 1) : 1,
        isDead: () => !!player.downed,
        dealDamage: (key, rawDamage, status) => {
          const resistance = key === 'bleed' ? Number(stats.bleedResistance || 0) : 0;
          const severity = Number(stats.negativeStatusMultiplier || 1);
          const damage = Math.max(0.25, rawDamage * Math.max(0.2, 1 - resistance) * severity);
          damagePlayer(state, player, damage, status.ownerId || key, emitEvent, key, { ignoreInv: true });
          return damage;
        },
      });
    });
  }

  // --- authored campaign enemy behaviors on the authority -------------------
  // The shared behavior bodies (SharedEnemyBehaviorSystem) are the campaign's
  // per-enemy state machines. This context adapts them to authoritative state:
  // players instead of Neo.player, state.projectiles instead of Neo.projectiles,
  // gameplay events instead of particles.
  const SHARED_ENEMY_BEHAVIOR_SET = new Set(SHARED_BEHAVIOR_TYPES);
  const behaviorRuntime = { state: null, emitEvent: () => {} };

  function livingRoomPlayers(state, roomId) {
    return Object.values(state.players || {})
      .filter(player => player && !player.downed && !player.disconnected && player.roomId === roomId);
  }

  function isPlayerConcealed(state, player) {
    const statusUntil = player.statusUntilTick || {};
    return state.tick < Number(statusUntil.cowards_way || 0)
      || state.tick < Number(statusUntil.flying_unhitable || 0)
      || state.tick < Number(player.equipmentEffectsUntilTick?.el_bartos_cape || 0);
  }

  function behaviorPlayerAlias(player) {
    return { id: player.id, x: Number(player.x), y: Number(player.y), r: Number(player.radius || 18) };
  }

  function obstacleRect(obstacle) {
    const width = Number(obstacle.w || obstacle.size || (Number(obstacle.r || 16) * 2));
    const height = Number(obstacle.h || obstacle.size || (Number(obstacle.r || 16) * 2));
    return { x: Number(obstacle.x) - width / 2, y: Number(obstacle.y) - height / 2, w: width, h: height };
  }

  function coverRectsForRoom(room) {
    const rects = (room?.structures || []).map(obstacleRect);
    (room?.destructibles || []).forEach(prop => {
      if (prop.broken || prop.hidden) return;
      if (prop.kind !== 'wall' && prop.kind !== 'secret_wall' && prop.kind !== 'cover_wall') return;
      rects.push(obstacleRect(prop));
    });
    return rects;
  }

  function playerBeamSegment(player) {
    const channel = player.beamChannel;
    if (!channel) return null;
    const range = Number(BEAM_CHANNEL_PROFILES[channel.moveKey]?.range || 430);
    return {
      x1: Number(player.x),
      y1: Number(player.y),
      x2: Number(player.x) + Math.cos(Number(channel.angle || 0)) * range,
      y2: Number(player.y) + Math.sin(Number(channel.angle || 0)) * range,
    };
  }

  // Boss-summoned minions (Queen's faithful, god council): full enemy records
  // with campaign behavior seeds, optional elite tag and health scaling.
  function spawnAuthorityMinion(state, summoner, type, x, y, options = {}, emitEvent = () => {}) {
    const definition = getEnemyDefinition(type) || getEnemyDefinition('cult_follower');
    const enemyId = state.allocateEntityId('enemy');
    const wall = Number(state.floorState?.wallThickness || 28) + Number(definition.radius || 12);
    const elite = !!options.elite;
    const healthScale = Math.max(0.1, Number(options.healthScale || 1)) * (elite ? 1.35 : 1);
    const health = Math.round(Number(definition.maxHealth || 40) * healthScale);
    state.enemies[enemyId] = {
      id: enemyId,
      type: definition.type,
      spriteKey: definition.spriteKey,
      behavior: definition.behavior,
      roomId: summoner.roomId,
      x: Math.max(wall, Math.min(Number(state.floorState?.width || 900) - wall, Number(x))),
      y: Math.max(wall, Math.min(Number(state.floorState?.height || 700) - wall, Number(y))),
      vx: 0, vy: 0,
      radius: definition.radius,
      moveSpeed: definition.moveSpeed,
      maxHealth: health,
      health,
      contactDamage: Math.round(Number(definition.contactDamage || 8) * (elite ? 1.18 : 1)),
      projectileDamage: Math.max(5, Math.round(Number(definition.contactDamage || 8) * 0.75)),
      elite,
      eliteTypes: elite ? ['knight'] : [],
      elitePowers: [],
      patterns: definition.patterns || [],
      boss: !!definition.boss,
      bleedImmune: !!definition.bleedImmune,
      fireImmune: !!definition.fireImmune,
      statuses: createCampaignStatusMap(),
      contactCooldownUntilTick: 0,
      attackCooldownUntilTick: state.tick + 12,
      attackWindupUntilTick: 0,
      state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
      summonedBy: summoner.id,
      stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
      attackCd: options.hastened ? Math.min(0.8, Number(definition.attackCooldown || 1)) : Number(definition.attackCooldown || 1),
      // Council bosses need their own kit seeds so their authored bodies run.
      ...(definition.type === 'queen_cult' ? { summonCd: 2.4, novaCd: 3, novaTimer: 0 } : {}),
      ...(definition.type === 'bulk_golem' ? { splitReady: true, aoeTime: 3, jumpCd: 1.2 } : {}),
      ...(definition.type === 'artificer_knave' ? { phase: 1 } : {}),
      ...(definition.type === 'antony_blemmye' ? { phase: 1, hammerCd: 1.55, biteCd: 1.15, slashCd: 2.05, deathBallCd: 5.4 } : {}),
    };
    state.floorState?.encounters?.[summoner.roomId]?.enemyIds?.push(enemyId);
    emitEvent('ENEMY_SPAWNED', { enemyId, roomId: summoner.roomId, enemyType: definition.type, summonedBy: summoner.id, elite });
    return state.enemies[enemyId];
  }

  function spawnAuthorityFloorBoss(state, spawner, emitEvent) {
    const random = combatRandomByState.get(state);
    const stream = random?.scoped?.(`floor-boss:type:${state.floorNumber}`);
    const bossType = getCampaignFloorBossType(state.floorNumber, stream ? () => stream.next() : Math.random);
    const definition = getEnemyDefinition(bossType) || getEnemyDefinition('queen_cult');
    const encounter = state.floorState?.encounters?.[spawner.roomId];
    delete state.enemies[spawner.id];
    const bossId = state.allocateEntityId('enemy');
    // The campaign spawns the summoned boss at 72% of its normal health.
    const health = Math.round(Number(definition.maxHealth || 900) * 0.72);
    state.enemies[bossId] = {
      id: bossId,
      type: definition.type,
      spriteKey: definition.spriteKey,
      behavior: definition.behavior,
      roomId: spawner.roomId,
      x: spawner.x,
      y: spawner.y,
      vx: 0, vy: 0,
      radius: definition.radius,
      moveSpeed: definition.moveSpeed,
      maxHealth: health,
      health,
      contactDamage: definition.contactDamage,
      projectileDamage: Math.max(5, Math.round(Number(definition.contactDamage || 12) * 0.75)),
      elite: false, eliteTypes: [], elitePowers: [],
      patterns: definition.patterns || [],
      boss: true,
      bleedImmune: !!definition.bleedImmune,
      fireImmune: !!definition.fireImmune,
      statuses: createCampaignStatusMap(),
      contactCooldownUntilTick: 0,
      attackCooldownUntilTick: state.tick + 20,
      attackWindupUntilTick: 0,
      state: 'spawning', facing: 1, spawnTick: state.tick, hitTick: -1, dead: false,
      stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
      attackCd: Number(definition.attackCooldown || 1.2),
    };
    encounter?.enemyIds?.push(bossId);
    emitEvent('ENEMY_SPAWNED', { enemyId: bossId, roomId: spawner.roomId, enemyType: definition.type, summonedBy: spawner.id, boss: true });
  }

  const enemyBehaviors = typeof createCampaignEnemyBehaviors === 'function' ? createCampaignEnemyBehaviors({
    getPlayer(enemy) {
      const players = livingRoomPlayers(behaviorRuntime.state, enemy.roomId)
        .filter(player => !isPlayerConcealed(behaviorRuntime.state, player));
      if (!players.length) return null;
      players.sort((first, second) => (
        Math.hypot(first.x - enemy.x, first.y - enemy.y) - Math.hypot(second.x - enemy.x, second.y - enemy.y)
      ));
      return behaviorPlayerAlias(players[0]);
    },
    getPlayers(enemy) {
      return livingRoomPlayers(behaviorRuntime.state, enemy.roomId).map(behaviorPlayerAlias);
    },
    getAllies(enemy) {
      return livingEncounterEnemies(behaviorRuntime.state, enemy.roomId)
        .filter(candidate => candidate.id !== enemy.id)
        .map(ally => {
          // The authored bodies read the campaign's hp/max aliases; allies that
          // have not run their own authored tick yet may not carry them.
          ally.hp = Number(ally.health || 0);
          ally.max = Math.max(1, Number(ally.maxHealth || 1));
          return ally;
        });
    },
    getTuning() {
      const difficulty = behaviorRuntime.state.matchRules?.difficulty || {};
      return {
        reaction: Number(difficulty.enemyReactionMultiplier || 1),
        rangedCadence: Number(difficulty.rangedCadenceMultiplier || 1),
        supportPower: Number(difficulty.supportPowerMultiplier || 1),
      };
    },
    getEvadeDifficultyRank() {
      // Campaign easy=0 … god=4; co-op defaults to medium's rank so plain
      // enemies keep a small juke chance like the campaign's standard runs.
      return Math.max(0, Math.trunc(Number(behaviorRuntime.state.matchRules?.difficulty?.evadeRank ?? 1)));
    },
    getFloor() {
      return Math.max(1, Number(behaviorRuntime.state.floorNumber || 1));
    },
    random(scope) {
      const service = combatRandomByState.get(behaviorRuntime.state);
      return service ? service.next(scope || 'encounter') : 0.5;
    },
    getSlowMultiplier(enemy) {
      return getCampaignSlowMultiplier(getCampaignStatusStacks(enemy, 'slow'));
    },
    bounds() {
      const floor = behaviorRuntime.state.floorState || {};
      return {
        wall: Number(floor.wallThickness || 28),
        width: Number(floor.width || 900),
        height: Number(floor.height || 700),
      };
    },
    isBlocked(enemy, x, y, r) {
      const room = currentRoom(behaviorRuntime.state, enemy.roomId);
      return (room?.structures || []).some(obstacle => circleIntersectsRoomObstacle(x, y, r, obstacle))
        || (room?.destructibles || []).some(obstacle => (
          !obstacle.broken && !obstacle.hidden && circleIntersectsRoomObstacle(x, y, r, obstacle)
        ));
    },
    getCoverRects(enemy) {
      return coverRectsForRoom(currentRoom(behaviorRuntime.state, enemy.roomId));
    },
    getHostileThreat(enemy, padding = 30) {
      const state = behaviorRuntime.state;
      for (const player of livingRoomPlayers(state, enemy.roomId)) {
        const segment = playerBeamSegment(player);
        if (!segment) continue;
        if (segmentHitsCircle(segment.x1, segment.y1, segment.x2, segment.y2, enemy.x, enemy.y, Number(enemy.radius || 18) + padding)) {
          return { segment, sourceId: `beam:${player.id}:${player.beamChannel.startTick}` };
        }
      }
      let best = null;
      Object.values(state.projectiles || {}).forEach(projectile => {
        if (projectile.hostile || projectile.roomId !== enemy.roomId) return;
        const vx = Number(projectile.vx || 0);
        const vy = Number(projectile.vy || 0);
        const speedSq = vx * vx + vy * vy;
        if (speedSq < 1600) return;
        const life = Math.max(0, (Number(projectile.expiresTick || 0) - state.tick) / 20);
        if (life <= 0) return;
        const dx = enemy.x - projectile.x;
        const dy = enemy.y - projectile.y;
        const toward = dx * vx + dy * vy;
        if (toward <= 0) return;
        const horizon = Math.min(0.7, Math.max(0.12, life));
        const timeToImpact = Math.max(0, Math.min(horizon, toward / speedSq));
        if (timeToImpact <= 0 || timeToImpact >= horizon) return;
        const projectedX = projectile.x + vx * timeToImpact;
        const projectedY = projectile.y + vy * timeToImpact;
        const dangerRadius = Number(enemy.radius || 18) + Number(projectile.radius || 0) + padding;
        if (Math.hypot(projectedX - enemy.x, projectedY - enemy.y) > dangerRadius) return;
        if (!best || timeToImpact < best.timeToImpact) {
          best = {
            segment: { x1: projectile.x, y1: projectile.y, x2: projectile.x + vx * horizon, y2: projectile.y + vy * horizon },
            sourceId: projectile.id,
            timeToImpact,
          };
        }
      });
      return best;
    },
    isPointThreatenedByPlayerBeam(enemy, x, y, radius = 24) {
      return livingRoomPlayers(behaviorRuntime.state, enemy.roomId).some(player => {
        const segment = playerBeamSegment(player);
        return segment && !!segmentHitsCircle(segment.x1, segment.y1, segment.x2, segment.y2, x, y, radius);
      });
    },
    damagePlayer(enemy, playerRef, damage, angle, knockback, source) {
      const state = behaviorRuntime.state;
      const player = state.players?.[playerRef.id];
      if (!player) return;
      if (enemy.networkBeamStrugglePlayerId === player.id && state.beamStruggles?.[player.id]) return;
      damagePlayer(state, player, damage, enemy.id, behaviorRuntime.emitEvent, source || enemy.type, { angle, knockback });
    },
    applyPlayerStatus(enemy, playerRef, key, stacks, duration) {
      const state = behaviorRuntime.state;
      const player = state.players?.[playerRef.id];
      if (player) applyAuthorityStatus(state, player, key, stacks, duration, enemy.id);
    },
    healEnemy(enemy, target, amount) {
      const gained = Math.min(
        Math.max(0, Number(target.maxHealth || target.max || 0) - Number(target.health || 0)),
        Math.max(0, Number(amount || 0)),
      );
      if (gained <= 0) return 0;
      target.health = Number(target.health || 0) + gained;
      target.hp = target.health;
      behaviorRuntime.emitEvent('ENEMY_HEALED', { enemyId: target.id, healerEnemyId: enemy.id, amount: gained, health: target.health });
      return gained;
    },
    grantBarrier(_enemy, target, amount) {
      const next = Math.max(0, Math.round(Number(amount || 0)));
      if (next > Number(target.barrier || 0)) {
        target.barrier = next;
        target.barrierAge = 0;
      }
    },
    spawnProjectile(enemy, descriptor) {
      const state = behaviorRuntime.state;
      const projectileId = state.allocateEntityId('projectile');
      state.projectiles[projectileId] = {
        id: projectileId,
        type: descriptor.kind || 'enemy_shot',
        ownerId: enemy.id,
        hostile: true,
        roomId: enemy.roomId,
        x: Number(descriptor.x), y: Number(descriptor.y),
        vx: Number(descriptor.vx), vy: Number(descriptor.vy),
        radius: Number(descriptor.r || 6),
        damage: Number(descriptor.damage || enemy.projectileDamage || 9),
        knockback: Number(descriptor.knockback || 120),
        statusEffects: Array.isArray(descriptor.statusEffects) ? descriptor.statusEffects : undefined,
        // Homing boss shots (Queen missiles, god swords) steer via the shared
        // projectile system; drain shots heal their owner on hit.
        ...(descriptor.homing ? {
          homing: true,
          homingTurnRate: Number(descriptor.homingTurnRate || 1.6),
          homingSpeed: Number(descriptor.homingSpeed || 280),
          homingAccel: Number(descriptor.homingAccel || 2.2),
        } : {}),
        ...(Number(descriptor.drainHeal || 0) > 0 ? { drainHeal: Number(descriptor.drainHeal) } : {}),
        behavior: enemy.behavior,
        attackKind: descriptor.source || enemy.type,
        spawnTick: state.tick,
        expiresTick: state.tick + Math.max(4, Math.round(Number(descriptor.life || 1.4) * 20)),
      };
      behaviorRuntime.emitEvent('ENEMY_ATTACKED', { enemyId: enemy.id, attackKind: descriptor.source || enemy.type, projectileId });
      return projectileId;
    },
    blastRadius(enemy, x, y, radius, damage, knockback, options = {}) {
      const state = behaviorRuntime.state;
      livingRoomPlayers(state, enemy.roomId).forEach(player => {
        const playerDistance = Math.hypot(player.x - x, player.y - y);
        if (playerDistance > radius + Number(player.radius || 18)) return;
        const angle = Math.atan2(player.y - y, player.x - x);
        // Optional distance falloff (Queen finisher: 5x at center → 1x at edge).
        const falloff = options.playerDamageFalloff;
        const scaled = falloff
          ? damage * (Number(falloff.centerMultiplier || 1)
            + (Number(falloff.edgeMultiplier || 1) - Number(falloff.centerMultiplier || 1))
            * Math.max(0, Math.min(1, playerDistance / Math.max(1, radius))))
          : damage;
        damagePlayer(state, player, Math.round(scaled), enemy.id, behaviorRuntime.emitEvent, `${enemy.type}_blast`, { angle, knockback });
      });
      behaviorRuntime.emitEvent('ENEMY_ATTACKED', {
        enemyId: enemy.id, attackKind: `${enemy.type}_blast`, originX: x, originY: y, effectRadius: radius,
      });
    },
    speak(enemy, text) {
      behaviorRuntime.emitEvent('ENEMY_SPOKE', { enemyId: enemy.id, roomId: enemy.roomId, text: String(text || '').slice(0, 120) });
    },
    holdAtOneHp(enemy) {
      enemy.health = Math.max(1, Number(enemy.health || 0));
      enemy.hp = enemy.health;
    },
    killEnemy(enemy) {
      damageEnemy(behaviorRuntime.state, enemy, Number(enemy.health || 0) + Number(enemy.barrier || 0) + 1, undefined, behaviorRuntime.emitEvent, {
        preScaled: true,
        canCrit: false,
        attackKind: `${enemy.type}_finisher`,
      });
    },
    spawnMinion(enemy, type, x, y, options = {}) {
      spawnAuthorityMinion(behaviorRuntime.state, enemy, type, x, y, options, behaviorRuntime.emitEvent);
    },
    spawnHazard(enemy, hazard) {
      const room = currentRoom(behaviorRuntime.state, enemy.roomId);
      if (!room) return;
      room.hazards = Array.isArray(room.hazards) ? room.hazards : [];
      room.hazards.push({ ...hazard, ownerId: enemy.id });
    },
    spawnLightningColumns(enemy, playerRef, damage) {
      // Elite Lightning Columns mode: two pillars land near the target and
      // pulse a few times, matching the SP elite trait's authored hazard.
      const state = behaviorRuntime.state;
      const bounds = {
        wall: Number(state.floorState?.wallThickness || 28),
        width: Number(state.floorState?.width || 900),
        height: Number(state.floorState?.height || 700),
      };
      const service = combatRandomByState.get(state);
      const rand = (min, max) => min + (service ? service.next('encounter') : Math.random()) * (max - min);
      for (let index = 0; index < 2; index += 1) {
        this.spawnHazard(enemy, {
          kind: 'lightning_column',
          enemy: true,
          source: enemy.type || 'lightning_column',
          x: Math.max(bounds.wall + 60, Math.min(bounds.width - bounds.wall - 60, Number(playerRef.x) + rand(-70, 70))),
          y: Math.max(bounds.wall + 60, Math.min(bounds.height - bounds.wall - 60, Number(playerRef.y) + rand(-70, 70))),
          r: 46, ttl: 1.25, tick: 0, interval: 0.36, damage: Math.round(damage),
        });
      }
    },
    getElapsedSeconds() {
      return Number(behaviorRuntime.state.elapsedSeconds || Number(behaviorRuntime.state.tick || 0) / 20);
    },
    spawnSummon(enemy, type, x, y) {
      spawnSummonedEnemy(behaviorRuntime.state, enemy, behaviorRuntime.emitEvent, { type, x, y });
    },
    spawnFloorBoss(enemy) {
      spawnAuthorityFloorBoss(behaviorRuntime.state, enemy, behaviorRuntime.emitEvent);
    },
    emit(eventType, data) {
      const roomId = behaviorRuntime.state?.enemies?.[data?.enemyId]?.roomId;
      behaviorRuntime.emitEvent(eventType, roomId ? { roomId, ...data } : data);
    },
  }) : null;

  // Enemy shield decay, mirroring the campaign: after 5s a barrier bleeds away
  // at 20 points per second. Age resets whenever the barrier grows.
  function decayAuthorityEnemyBarrier(enemy, fixedDelta) {
    if (Number(enemy.barrier || 0) <= 0) {
      enemy.barrierAge = 0;
      return;
    }
    enemy.barrierAge = Number(enemy.barrierAge || 0) + fixedDelta;
    if (enemy.barrierAge > 5) {
      enemy.barrier = Math.max(0, Number(enemy.barrier || 0) - 20 * fixedDelta);
    }
  }

  function updateAuthoredEnemy(state, enemy, fixedDelta, emitEvent, floor) {
    // Campaign alias fields + per-tick timers (mirrors update.js's enemy wrapper).
    enemy.r = Number(enemy.radius || 18);
    enemy.speed = Number(enemy.moveSpeed || 96);
    enemy.dmg = Number(enemy.contactDamage || 10);
    enemy.hp = Number(enemy.health || 0);
    enemy.max = Math.max(1, Number(enemy.maxHealth || 1));
    enemy.stun = Math.max(0, (Number(enemy.stunnedUntilTick || 0) - state.tick) / 20);
    enemy.attackCd = Math.max(0, Number(enemy.attackCd || 0) - fixedDelta);
    const foldGodInvulnerability = () => {
      if (Number(enemy.inv || 0) > 0) {
        enemy.invulnerableUntilTick = Math.max(Number(enemy.invulnerableUntilTick || 0), state.tick + Math.round(Number(enemy.inv) * 20));
        enemy.inv = 0;
      }
    };
    if (state.tick < Number(enemy.confusedBlindUntilTick || 0)) {
      enemy.vx *= 0.8;
      enemy.vy *= 0.8;
      enemy.state = 'confused';
    } else {
      const playersInRoom = livingRoomPlayers(state, enemy.roomId);
      if (!playersInRoom.length) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.state = 'idle';
        return;
      }
      if (playersInRoom.every(player => isPlayerConcealed(state, player))) {
        // Every hero is hidden (cape/flight/coward's way): roam and blind-fire
        // exactly like the campaign instead of freezing in place.
        enemyBehaviors.wanderEnemy(enemy, fixedDelta);
      } else {
        const eliteControlled = enemyBehaviors.updateEliteEnemyTraits(enemy, fixedDelta);
        if (!enemy.dead && !eliteControlled) {
          invokeCampaignEnemyAI(enemy, fixedDelta, enemyBehaviors);
        }
      }
    }
    // The god body sets `inv` in seconds during phase shifts; fold that into the
    // authoritative invulnerability tick so damageEnemy honors it this same tick.
    foldGodInvulnerability();
    if (enemy.dead || !state.enemies[enemy.id]) return;
    decayAuthorityEnemyBarrier(enemy, fixedDelta);
    const slowMultiplier = getCampaignSlowMultiplier(getCampaignStatusStacks(enemy, 'slow'));
    const minimum = Number(floor.wallThickness || 28) + enemy.r;
    const maximumX = Number(floor.width || 900) - minimum;
    const maximumY = Number(floor.height || 700) - minimum;
    if (enemy.airborne) {
      // Airborne bosses (Bulk Golem's jump) move on their scripted arc: clamp
      // to bounds only, no obstacle collisions mid-flight — like moveCircle.
      enemy.x = Math.max(minimum, Math.min(maximumX, enemy.x));
      enemy.y = Math.max(minimum, Math.min(maximumY, enemy.y));
      return;
    }
    const desiredX = Math.max(minimum, Math.min(maximumX, enemy.x + enemy.vx * fixedDelta * slowMultiplier));
    const desiredY = Math.max(minimum, Math.min(maximumY, enemy.y + enemy.vy * fixedDelta * slowMultiplier));
    const collision = resolveRoomObstacleMovement(currentRoom(state, enemy.roomId), enemy, desiredX, desiredY);
    if (collision.blockedX) enemy.vx *= -0.4;
    if (collision.blockedY) enemy.vy *= -0.4;
    enemy.x = collision.x;
    enemy.y = collision.y;
    if (Math.abs(enemy.vx) > 1) enemy.facing = enemy.vx < 0 ? -1 : 1;
    // Bodies that self-modify hp (Queen finisher hold-at-1, Antony bite-heal)
    // write the alias; fold it back to authoritative health.
    if (Number(enemy.hp) !== Number(enemy.health)) enemy.health = Math.max(0, Number(enemy.hp || 0));
  }

  function updateEnemies(state, fixedDelta, emitEvent) {
    const floor = state.floorState || {};
    behaviorRuntime.state = state;
    behaviorRuntime.emitEvent = emitEvent;
    Object.entries(state.enemies || {}).forEach(([enemyId, enemy]) => {
      if (enemy.dead) {
        if (state.tick - Number(enemy.deathTick || 0) >= ENEMY_DEATH_TICKS) delete state.enemies[enemyId];
        return;
      }
      // Match the campaign's 0.72 second portal/emergence window. During this
      // authoritative phase the enemy cannot move, attack, or deal contact
      // damage; every client is free to render the shared spawn animation.
      if (state.tick - Number(enemy.spawnTick || 0) < SPAWN_LOCK_TICKS) {
        enemy.state = 'spawning';
        enemy.vx = 0;
        enemy.vy = 0;
        return;
      }
      if (enemy.state === 'spawning') enemy.state = 'chasing';
      if (enemyBehaviors && SHARED_ENEMY_BEHAVIOR_SET.has(enemy.type)) {
        // Standard-roster enemies run the campaign's authored behavior bodies —
        // wind-ups, dashes, beams, bursts, cover, summons, shields, heals —
        // instead of the generic chase/shoot loop below. Their attacks deal all
        // damage themselves; there is no walk-over contact damage, exactly like
        // the campaign.
        updateAuthoredEnemy(state, enemy, fixedDelta, emitEvent, floor);
        return;
      }
      if (state.tick < Number(enemy.stunnedUntilTick || 0)) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.state = 'stunned';
        return;
      }
      if (state.tick < Number(enemy.confusedBlindUntilTick || 0)) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.state = 'confused';
        return;
      }
      const target = nearestLivingPlayer(state, enemy);
      if (!target.player) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.state = 'idle';
        return;
      }
      const angle = Math.atan2(target.player.y - enemy.y, target.player.x - enemy.x);
      const room = currentRoom(state, enemy.roomId);
      const contactDistance = Number(enemy.radius || 20) + Number(target.player.radius || 18) + 4;
      if (enemy.behavior === 'summoner' && state.tick >= Number(enemy.summonCooldownUntilTick || 0)) {
        const liveSummons = livingEncounterEnemies(state, enemy.roomId).filter(candidate => candidate.summonedBy === enemy.id).length;
        if (liveSummons < 2) spawnSummonedEnemy(state, enemy, emitEvent);
        enemy.summonCooldownUntilTick = state.tick + 88;
      }
      updateEnemySupport(state, enemy, emitEvent);
      if (enemy.behavior === 'boss') {
        const hpRatio = Number(enemy.health || 0) / Math.max(1, Number(enemy.maxHealth || 1));
        enemy.phase = hpRatio <= 0.25 ? 4 : hpRatio <= 0.5 ? 3 : hpRatio <= 0.75 ? 2 : 1;
      }
      const rangedBehavior = RANGED_BEHAVIORS.has(enemy.behavior);
      if (rangedBehavior) {
        if (Number(enemy.attackWindupUntilTick || 0) > 0) {
          enemy.vx = 0;
          enemy.vy = 0;
          enemy.state = 'aiming';
          if (state.tick >= enemy.attackWindupUntilTick) {
            const projectileId = createEnemyProjectile(state, enemy, target.player);
            enemy.attackWindupUntilTick = 0;
            enemy.attackCooldownUntilTick = state.tick + 28;
            enemy.state = 'firing';
            emitEvent('ENEMY_ATTACKED', { enemyId, targetPlayerId: target.player.id, attackKind: enemy.type, projectileId, phase: enemy.phase || 1 });
          }
        } else if (state.tick >= Number(enemy.attackCooldownUntilTick || 0)) {
          enemy.attackWindupUntilTick = state.tick + 7;
          enemy.state = 'aiming';
          enemy.vx = 0;
          enemy.vy = 0;
          emitEvent('ENEMY_TELEGRAPH', { enemyId, targetPlayerId: target.player.id, attackKind: enemy.type, windupTicks: 7, phase: enemy.phase || 1 });
        } else if (target.distance < 165) {
          enemy.state = 'retreating';
          moveEnemy(enemy, angle, -1, fixedDelta, floor, room);
        } else if (target.distance > 285) {
          enemy.state = 'approaching';
          moveEnemy(enemy, angle, 1, fixedDelta, floor, room);
        } else {
          enemy.state = 'holding';
          enemy.vx = 0;
          enemy.vy = 0;
        }
      } else if (target.distance > contactDistance) {
        enemy.state = enemy.behavior === 'charger' ? 'charging' : 'chasing';
        moveEnemy(enemy, angle, 1, fixedDelta, floor, room);
      } else {
        enemy.vx = 0;
        enemy.vy = 0;
      }
      if (target.distance <= contactDistance && state.tick >= Number(enemy.contactCooldownUntilTick || 0)) {
        enemy.contactCooldownUntilTick = state.tick + 16;
        damagePlayer(state, target.player, enemy.contactDamage, enemyId, emitEvent, 'contact', {
          angle: Math.atan2(Number(target.player.y) - Number(enemy.y), Number(target.player.x) - Number(enemy.x)),
          knockback: Number(enemy.contactKnockback || 120),
        });
      }
    });
  }

  function spawnCoinDrop(state, enemy, emitEvent) {
    const pickupId = state.allocateEntityId('pickup');
    state.pickups[pickupId] = {
      id: pickupId,
      type: 'coin',
      roomId: enemy.roomId,
      x: enemy.x,
      y: enemy.y,
      radius: 13,
      amount: 1,
      spawnTick: state.tick,
    };
    emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: 'coin', enemyId: enemy.id });
  }

  function markEncounterCleared(state, roomId, emitEvent) {
    const encounter = state.floorState?.encounters?.[roomId];
    if (!encounter || encounter.status === 'cleared') return;
    if (livingEncounterEnemies(state, roomId).length > 0) return;
    encounter.status = 'cleared';
    encounter.clearedTick = state.tick;
    const room = currentRoom(state, roomId);
    if (room?.type === 'challenge') {
      const result = finishCampaignChallenge(room, 'completed', { text: 'TRIAL CLEARED' });
      if (result.ok && !room.challengeRewardSpawned) {
        room.challengeRewardSpawned = true;
        const random = combatRandomByState.get(state)?.scoped?.(`challenge:reward:${state.floorNumber}:${roomId}`);
        const rewardKey = result.rewardKey || rollCampaignItem(random ? () => random.next() : Math.random, { elite: true });
        const descriptors = [
          { type: 'item', key: rewardKey, x: Number(state.floorState.width || 900) / 2, y: Number(state.floorState.height || 700) / 2 - 16 },
          { type: 'potion', x: Number(state.floorState.width || 900) / 2, y: Number(state.floorState.height || 700) / 2 + 36 },
          { type: 'coin', amount: 75 + Number(state.floorNumber || 1) * 15, x: Number(state.floorState.width || 900) / 2, y: Number(state.floorState.height || 700) / 2 + 4 },
        ];
        descriptors.forEach(descriptor => {
          const pickupId = state.allocateEntityId('pickup');
          state.pickups[pickupId] = { id: pickupId, ...descriptor, roomId, radius: 13, spawnTick: state.tick };
        });
        emitEvent('CHALLENGE_COMPLETED', { roomId, ...result });
      }
    }
    emitEvent('ROOM_CLEARED', { roomId });
  }

  function emitProjectileSubSpawn(state, projectile, random) {
    const config = projectile.subSpawn;
    if (!config || state.tick < Number(config.nextSpawnTick || 0)) return;
    const intervalTicks = Math.max(1, Number(config.intervalSeconds || 0.2) * 20);
    config.nextSpawnTick += intervalTicks;
    const owner = state.players?.[projectile.ownerId];
    if (!owner) return;
    const randomNext = typeof random?.next === 'function' ? () => random.next('encounter') : () => 0.5;
    createCampaignSubSpawnDescriptors(projectile, config, randomNext).forEach(descriptor => {
      createPlayerProjectile(state, owner, {
        kind: descriptor.kind,
        attackKind: projectile.attackKind,
        damage: descriptor.damage,
        speed: descriptor.speed,
        radius: descriptor.radius,
        lifeTicks: Math.ceil(descriptor.lifeSeconds * 20),
        spawnDistance: 0,
        originX: projectile.x,
        originY: projectile.y,
        roomId: projectile.roomId,
        hitOptions: descriptor.hitOptions,
      }, descriptor.angle);
    });
  }

  function updateProjectiles(state, fixedDelta, emitEvent, random) {
    Object.entries(state.projectiles || {}).forEach(([projectileId, projectile]) => {
      if (state.tick >= Number(projectile.expiresTick || 0)) {
        if (projectile.returning && projectile.returnPhase === 'out') {
          projectile.returnPhase = 'back';
          projectile.expiresTick = state.tick + 80;
        } else {
          delete state.projectiles[projectileId];
          return;
        }
      }
      if (projectile.homing) {
        const target = projectile.hostile
          ? nearestLivingPlayer(state, projectile).player
          : livingEncounterEnemies(state, projectile.roomId)
            .filter(candidate => Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y) <= Number(projectile.homingRadius || 960))
            .sort((a, b) => Math.hypot(a.x - projectile.x, a.y - projectile.y) - Math.hypot(b.x - projectile.x, b.y - projectile.y))[0];
        steerCampaignHomingProjectile(projectile, target || null, fixedDelta);
      }
      if (projectile.returning && projectile.returnPhase === 'back') {
        const owner = state.players?.[projectile.ownerId];
        if (!owner || owner.downed || owner.roomId !== projectile.roomId) {
          delete state.projectiles[projectileId];
          return;
        }
        const dx = owner.x - projectile.x;
        const dy = owner.y - projectile.y;
        const distance = Math.hypot(dx, dy) || 1;
        const speed = Math.max(720, Math.hypot(projectile.vx, projectile.vy));
        projectile.vx = dx / distance * speed;
        projectile.vy = dy / distance * speed;
      }
      const previous = advanceCampaignProjectile(projectile, fixedDelta);
      if (projectile.returning && projectile.returnPhase === 'back') {
        const owner = state.players?.[projectile.ownerId];
        if (owner && Math.hypot(owner.x - projectile.x, owner.y - projectile.y) <= Number(owner.radius || 18) + Number(projectile.radius || 8) + 6) {
          delete state.projectiles[projectileId];
          emitEvent('SARGES_HAMMER_RETURNED', { projectileId, playerId: owner.id });
          return;
        }
      }
      emitProjectileSubSpawn(state, projectile, random);
      const wall = Number(state.floorState?.wallThickness || 28);
      if (projectile.x < wall || projectile.x > Number(state.floorState?.width || 900) - wall
        || projectile.y < wall || projectile.y > Number(state.floorState?.height || 700) - wall) {
        const hitX = projectile.x < wall || projectile.x > Number(state.floorState?.width || 900) - wall;
        const hitY = projectile.y < wall || projectile.y > Number(state.floorState?.height || 700) - wall;
        if (bounceCampaignProjectile(projectile, { hitX, hitY }, previous)) {
          emitEvent('PROJECTILE_BOUNCED', { projectileId, roomId: projectile.roomId });
          return;
        }
        delete state.projectiles[projectileId];
        return;
      }
      const room = currentRoom(state, projectile.roomId);
      const solidStructure = (room?.structures || []).find(obstacle => (
        circleIntersectsRoomObstacle(projectile.x, projectile.y, Number(projectile.radius || 6), obstacle)
      ));
      if (solidStructure) {
        if (bounceCampaignProjectile(projectile, {
          hitX: previous.x < Number(solidStructure.x || 0) || previous.x > Number(solidStructure.x || 0) + Number(solidStructure.w || 0),
          hitY: previous.y < Number(solidStructure.y || 0) || previous.y > Number(solidStructure.y || 0) + Number(solidStructure.h || 0),
        }, previous)) {
          emitEvent('PROJECTILE_BOUNCED', { projectileId, roomId: projectile.roomId, obstacleKind: solidStructure.kind });
          return;
        }
        delete state.projectiles[projectileId];
        emitEvent('PROJECTILE_BLOCKED', { projectileId, roomId: projectile.roomId, obstacleKind: solidStructure.kind });
        return;
      }
      const destructible = (room?.destructibles || []).find(obstacle => (
        !obstacle.broken && !obstacle.hidden
          && circleIntersectsRoomObstacle(projectile.x, projectile.y, Number(projectile.radius || 6), obstacle)
      ));
      if (destructible) {
        delete state.projectiles[projectileId];
        damageNetworkDestructible(state, projectile.roomId, destructible, 1, emitEvent, random, {
          projectileId,
          playerId: projectile.hostile ? null : projectile.ownerId,
        });
        return;
      }
      if (projectile.hostile) {
        const player = Object.values(state.players || {}).find(candidate => (
          candidate && !candidate.downed && candidate.roomId === projectile.roomId
            && Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y)
              <= Number(candidate.radius || 18) + Number(projectile.radius || 6)
        ));
        if (!player) return;
        delete state.projectiles[projectileId];
        damagePlayer(state, player, projectile.damage, projectile.ownerId, emitEvent, projectile.attackKind, {
          angle: Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1)),
          knockback: Number(projectile.knockback || 120),
        });
        // Authored enemy shots can carry status payloads (e.g. golem spit poison).
        (Array.isArray(projectile.statusEffects) ? projectile.statusEffects : []).forEach(effect => {
          const chance = Math.max(0, Math.min(1, Number(effect.chance ?? 1)));
          if (chance < 1 && random.next('encounter') >= chance) return;
          applyAuthorityStatus(state, player, effect.key, Number(effect.stacks || 1), Number(effect.duration || 3), projectile.ownerId);
        });
        // Drain shots (Queen's missiles) siphon HP back to their owner on hit.
        const drainOwner = Number(projectile.drainHeal || 0) > 0 ? state.enemies?.[projectile.ownerId] : null;
        if (drainOwner && !drainOwner.dead) {
          drainOwner.health = Math.min(Number(drainOwner.maxHealth || 1), Number(drainOwner.health || 0) + Number(projectile.drainHeal));
        }
        return;
      }
      if (state.matchRules?.friendlyFire) {
        const rival = Object.values(state.players || {}).find(candidate => (
          candidate && candidate.id !== projectile.ownerId && !candidate.downed
            && candidate.roomId === projectile.roomId
            && Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y)
              <= Number(candidate.radius || 18) + Number(projectile.radius || 8)
        ));
        if (rival) {
          damagePlayer(state, rival, playerDamage(state, projectile.ownerId, projectile.damage), projectile.ownerId, emitEvent, projectile.attackKind, {
            angle: Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1)),
            knockback: Number(projectile.knockback || 120),
          });
          delete state.projectiles[projectileId];
          return;
        }
      }
      const hitIds = new Set(Array.isArray(projectile.hitEnemyIds) ? projectile.hitEnemyIds : []);
      const enemy = livingEncounterEnemies(state, projectile.roomId).find(candidate => (
        !hitIds.has(candidate.id)
          && Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y)
            <= Number(candidate.radius || 20) + Number(projectile.radius || 8)
      ));
      if (!enemy) return;
      damageEnemy(state, enemy, projectile.damage, projectile.ownerId, emitEvent, {
        projectileId,
        attackKind: projectile.attackKind,
        // Player shots shove along their travel direction.
        angle: Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1)),
        knockback: Number(projectile.knockback || 120),
      });
      const projectileOwner = state.players?.[projectile.ownerId];
      if (!enemy.dead && projectileOwner) {
        applyAuthorityOnHitStatusProcs(state, enemy, projectileOwner, projectile.hitOptions || {}, random);
      }
      if (Number(projectile.splash || 0) > 0) {
        livingEncounterEnemies(state, projectile.roomId).forEach(candidate => {
          if (Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y) > Number(projectile.splash)) return;
          damageEnemy(state, candidate, projectile.splashDamage, projectile.ownerId, emitEvent, {
            projectileId,
            attackKind: projectile.attackKind,
          });
          applyFireStatus(state, candidate, candidate.id === enemy.id ? projectile.fireStacks : 1, projectile.fireDuration, projectile.ownerId);
        });
      } else if (Number(projectile.fireStacks || 0) > 0) {
        applyFireStatus(state, enemy, projectile.fireStacks, projectile.fireDuration, projectile.ownerId);
      }
      if (Number(projectile.remainingPierces || 0) > 0) {
        projectile.remainingPierces -= 1;
        projectile.hitEnemyIds = [...hitIds, enemy.id];
      } else {
        if (projectile.returning && projectile.returnPhase === 'out') {
          projectile.returnPhase = 'back';
          projectile.expiresTick = state.tick + 80;
          emitEvent('SARGES_HAMMER_BOUNCED', { projectileId, playerId: projectile.ownerId, enemyId: enemy.id, lightning: true });
        } else {
          delete state.projectiles[projectileId];
        }
      }
    });
  }

  function updatePickups(state, emitEvent, random) {
    Object.entries(state.pickups || {}).forEach(([pickupId, pickup]) => {
      const player = Object.values(state.players || {}).find(candidate => (
          candidate && !candidate.downed && candidate.roomId === pickup.roomId
          && Math.hypot(candidate.x - pickup.x, candidate.y - pickup.y)
            <= Number(candidate.radius || 18) + Number(pickup.radius || 13) + 5 + Number(candidate.pickupRadius || 0)
      ));
      if (!player) return;
      if (pickup.type === 'jesterPortal') {
        if (!pickup.active && Number(state.tick || 0) - Number(pickup.spawnTick || 0) < Number(pickup.activateDelayTicks || 15)) return;
        pickup.active = true;
        const transition = useCampaignJesterGate({ floorNumber: state.floorNumber }, pickup, { maxFloor: MAX_FLOOR });
        if (!transition.ok) return;
        delete state.pickups[pickupId];
        emitEvent('JESTER_GATE_USED', { playerId: player.id, ...transition });
        advanceToNextFloor(state, emitEvent, transition.skipFloors);
        return;
      }
      if (pickup.type === 'challengeStarter') {
        const room = currentRoom(state, pickup.roomId);
        if (!room || room.type !== 'challenge' || room.challengeStarted) return;
        room.challengeStarted = true;
        room.challengeLifecycleState = 'active';
        room.challengeFailed = false;
        // A mirror challenge reflects the activating player's own kit.
        if ((room.challengeType || pickup.trial) === 'mirror') room.mirrorSourcePlayerId = player.id;
        delete state.pickups[pickupId];
        emitEvent('CHALLENGE_STARTED', { playerId: player.id, roomId: room.id, challengeType: room.challengeType || pickup.trial });
        return;
      }
      if (pickup.type === 'secretWarp') {
        const targetFloor = Math.max(1, Math.min(MAX_FLOOR, Number(pickup.targetFloor || state.floorNumber)));
        const steps = targetFloor - Number(state.floorNumber || 1);
        if (steps === 0) return;
        delete state.pickups[pickupId];
        emitEvent('SECRET_WARP_USED', { playerId: player.id, roomId: pickup.roomId, targetFloor });
        advanceToNextFloor(state, emitEvent, steps);
        return;
      }
      if (pickup.type === 'secretVendor') {
        const vendorState = { floorNumber: state.floorNumber, loopCrystals: Number(player.loopCrystals || 0) };
        const room = currentRoom(state, pickup.roomId);
        const purchase = purchaseCampaignSecretVendor(vendorState, room, player, pickup);
        if (!purchase.ok) return;
        player.loopCrystals = Number(vendorState.loopCrystals || 0);
        if (purchase.rewardKey) {
          const loot = random.stream('loot');
          collectCampaignPickup(state, player, purchase.rewardKey, {
            duplicateChance: player.itemStats?.itemDuplicateChance,
            random: () => loot.next(),
            rollItem: (nextRandom, excludeKeys) => rollCampaignItem(nextRandom, { excludeKeys }),
          });
        } else if (purchase.offerKind === 'vitality') {
          player.hp = Math.min(player.maxHp, Number(player.hp || 0) + purchase.heal * Math.max(1, Number(player.itemStats?.healingMultiplier || 1)));
        } else if (purchase.offerKind === 'xp') player.xp = Number(player.xp || 0) + purchase.xp;
        else player.coins = Number(player.coins || 0) + purchase.coins;
        delete state.pickups[pickupId];
        emitEvent('SECRET_VENDOR_PURCHASED', { playerId: player.id, roomId: pickup.roomId, ...purchase });
        return;
      }
      if (pickup.type === 'secretLady') {
        const rewardKey = String(pickup.rewardKey || '');
        if (!rewardKey) return;
        const loot = random.stream('loot');
        const acquisition = collectCampaignPickup(state, player, rewardKey, {
          duplicateChance: player.itemStats?.itemDuplicateChance,
          random: () => loot.next(),
          rollItem: (nextRandom, excludeKeys) => rollCampaignItem(nextRandom, { excludeKeys }),
        });
        if (!acquisition.ok) return;
        delete state.pickups[pickupId];
        emitEvent('SECRET_LADY_GIFTED', { playerId: player.id, roomId: pickup.roomId, itemKey: rewardKey });
        return;
      }
      let amount = Math.max(0, Number(pickup.amount || 0));
      if (pickup.type === 'coin') {
        amount = Math.round(Math.max(1, amount || 1) * Math.max(1, Number(player.itemStats?.coinPickupMultiplier || 1)))
          + Math.max(0, Number(player.items?.naked_kings_last_penny || 0))
          + Math.max(0, Number(player.goldBonus || 0));
        player.coins = Math.max(0, Number(player.coins || 0)) + amount;
      } else if (pickup.type === 'item') {
        const loot = random.stream('loot');
        const acquisition = collectCampaignPickup(state, player, pickup.key, {
          duplicateChance: player.itemStats?.itemDuplicateChance,
          canDuplicate: pickup.key !== 'artificer_charger',
          random: () => loot.next(),
          rollItem: (nextRandom, excludeKeys) => rollCampaignItem(nextRandom, { excludeKeys }),
        });
        if (!acquisition.ok) return;
        amount = acquisition.amount;
        if (acquisition.jester?.ok) {
          Object.entries(acquisition.jester.bonusItemCounts).forEach(([itemKey, bonusAmount]) => {
            emitEvent('ITEM_BONUS_ACQUIRED', { playerId: player.id, itemKey, amount: bonusAmount, source: 'jesters_dice' });
          });
          emitEvent('JESTER_GATE_PENDING', { playerId: player.id, skipFloors: acquisition.jester.skipFloors });
        }
        // Owning every relic ignites the 12s god-mode window.
        maybeGrantGodMode(state, player, emitEvent);
      } else if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const room = currentRoom(state, pickup.roomId);
        const gardenRandom = random?.scoped?.(`garden:respawn:${state.floorNumber}:${pickup.roomId}:${pickup.gardenNodeId}:${state.tick}`);
        const collected = collectCampaignGardenFruit(room, pickup, state.elapsedSeconds, {
          random: gardenRandom ? () => gardenRandom.next() : Math.random,
          minimumRespawnSeconds: 12,
          respawnSpreadSeconds: 10,
        });
        if (!collected.ok) return;
        amount = collected.heal * Math.max(1, Number(player.itemStats?.healingMultiplier || 1));
        const before = Number(player.hp || 0);
        player.hp = Math.min(Number(player.maxHp || 100), before + amount);
        amount = Math.max(0, player.hp - before);
      }
      let healedAmount = 0;
      if (pickup.type === 'potion') {
        // Potions are STORED, not drunk on pickup — the campaign keeps them for
        // a deliberate Q-press (heal, or share-to-befriend a wounded rival).
        amount = 1;
        player.storedPotions = Math.min(9, Number(player.storedPotions || 0) + 1);
      }
      delete state.pickups[pickupId];
      emitEvent('PICKUP_COLLECTED', {
        pickupId,
        playerId: player.id,
        pickupType: pickup.type,
        amount,
        healedAmount,
        gold: player.coins,
        itemKey: pickup.key || '',
        roomId: pickup.roomId,
      });
    });
  }

  function updateMovingWorldPickups(state, fixedDelta) {
    Object.values(state.pickups || {}).forEach(pickup => {
      if (!(Number(pickup.vx || 0) || Number(pickup.vy || 0))) return;
      advanceCampaignMovingWorldEntity(pickup, fixedDelta, {
        width: state.floorState?.width,
        height: state.floorState?.height,
        margin: pickup.type === 'challengeBomb' ? 90 : Number(pickup.radius || 0),
      });
    });
  }

  function updateAuthorityGardenGrowth(state, emitEvent) {
    if (Number(state.floorNumber || 1) <= 5) return;
    const occupied = new Set(activePlayers(state).map(player => player.roomId));
    (state.floorState?.layout?.rooms || []).filter(room => occupied.has(room.id)).forEach(room => {
      if (!Array.isArray(room.gardenFruitNodes)) return;
      room.pickups = Object.values(state.pickups || {}).filter(pickup => pickup.roomId === room.id);
      room.gardenFruitNodes.forEach(node => {
        const result = updateCampaignGardenNode(room, node, state.elapsedSeconds);
        if (!result.spawned) return;
        const pickupId = state.allocateEntityId('pickup');
        state.pickups[pickupId] = { id: pickupId, ...result.pickup, roomId: room.id, radius: 13, spawnTick: state.tick };
        emitEvent('PICKUP_SPAWNED', { pickupId, pickupType: result.pickup.type, roomId: room.id, gardenNodeId: node.id });
      });
      delete room.pickups;
    });
  }

  function ensureJesterGate(state, emitEvent) {
    if (Number(state.floorSkipPending || 0) <= 0) return;
    const existing = Object.values(state.pickups || {}).some(pickup => pickup?.type === 'jesterPortal');
    const owner = activePlayers(state).find(player => !player.downed);
    if (!owner) return;
    const created = createCampaignJesterGate(state, {
      floorNumber: state.floorNumber,
      maxFloor: MAX_FLOOR,
      hasExistingGate: existing,
      x: Number(owner.x),
      y: Number(owner.y) - 72,
      activateAt: 0.75,
    });
    if (!created.ok) return;
    const pickupId = state.allocateEntityId('pickup');
    state.pickups[pickupId] = {
      id: pickupId,
      ...created.gate,
      roomId: owner.roomId,
      radius: 28,
      active: false,
      spawnTick: state.tick,
      activateDelayTicks: 15,
    };
    emitEvent('JESTER_GATE_SPAWNED', { pickupId, roomId: owner.roomId, skipFloors: created.gate.skipFloors });
  }

  // ── Floor progression, run end, and downed/revive ───────────────────────
  // Runs as a deterministic simulation system so it behaves identically on the
  // authority and any client that re-simulates.

  function activePlayers(state) {
    return Object.values(state.players || {}).filter(player => player && !player.disconnected);
  }

  function isExitRoomCleared(state, room) {
    if (!room) return false;
    const encounter = state.floorState?.encounters?.[room.id];
    // An exit room is "cleared" once its encounter has been spawned and beaten.
    return encounter?.status === 'cleared';
  }

  // Spawn the stairs interactable once the floor's exit room is cleared. Boss
  // and god exit rooms count too — beating the boss reveals the stairs.
  function ensureFloorExit(state, emitEvent) {
    const layout = state.floorState?.layout;
    const exitRoomId = layout?.exitRoomId;
    if (!exitRoomId) return;
    const existing = Object.values(state.interactables || {}).find(item => item.kind === 'stairs' && item.roomId === exitRoomId);
    if (existing) return;
    const exitRoom = (layout.rooms || []).find(room => room.id === exitRoomId);
    if (!isExitRoomCleared(state, exitRoom)) return;
    const isFinalFloor = Number(state.floorNumber || 1) >= MAX_FLOOR || exitRoom.type === 'god';
    const interactableId = state.allocateEntityId('interactable');
    state.interactables[interactableId] = {
      id: interactableId,
      kind: 'stairs',
      roomId: exitRoomId,
      x: Number(state.floorState.width || 900) / 2,
      y: Number(state.floorState.height || 700) / 2,
      radius: 30,
      final: isFinalFloor,
      dwellByPlayer: {},
      spawnTick: state.tick,
    };
    emitEvent('INTERACTABLE_SPAWNED', { interactableId, kind: 'stairs', roomId: exitRoomId, final: isFinalFloor });
  }

  // Regenerate the floor at floorNumber+1 and reset the party into its start
  // room. Enemies, projectiles, pickups and interactables are cleared; the
  // floor seed is derived deterministically from the match seed.
  function advanceToNextFloor(state, emitEvent, floorSteps = 1) {
    const steps = Math.trunc(Number(floorSteps || 1)) || 1;
    const nextFloorNumber = Math.max(1, Math.min(MAX_FLOOR, Number(state.floorNumber || 1) + steps));
    const floorSeed = `${state.matchSeed}|floor:${nextFloorNumber}`;
    const layout = typeof generateFloorLayout === 'function'
      ? generateFloorLayout({
        matchSeed: state.matchSeed,
        floorSeed,
        floorNumber: nextFloorNumber,
        generationVersion: state.generationVersion,
        contentVersion: state.contentVersion,
        maxFloor: MAX_FLOOR,
      })
      : state.floorState.layout;
    state.floorNumber = nextFloorNumber;
    state.floorSeed = floorSeed;
    state.enemies = {};
    state.projectiles = {};
    state.abilityEntities = {};
    state.pickups = {};
    state.interactables = {};
    const width = Number(state.floorState.width) || 900;
    const height = Number(state.floorState.height) || 700;
    state.floorState = {
      ...state.floorState,
      currentRoomId: layout.startRoomId,
      visitedRoomIds: [layout.startRoomId],
      roomTransition: null,
      transitionSequence: 0,
      transitionsByPlayer: {},
      encounters: {},
      rewards: {},
      layout,
    };
    const wall = Number(state.floorState.wallThickness) || 28;
    activePlayers(state).forEach((player, index) => {
      const radius = Math.max(1, Number(player.radius) || 18);
      const inset = wall + radius + 18;
      const offset = (index - (activePlayers(state).length - 1) / 2) * 52;
      player.roomId = layout.startRoomId;
      player.x = Math.max(inset, Math.min(width - inset, width / 2 + offset));
      player.y = height / 2;
      player.vx = 0;
      player.vy = 0;
    });
    applyPartyRivalCurses(state, emitEvent);
    scheduleRivalReturns(state, emitEvent);
    emitEvent('FLOOR_ADVANCED', { floorNumber: nextFloorNumber, floorSeed, startRoomId: layout.startRoomId });
  }

  // Party-wide rival curses (shared-roster model): each defeated/alive-descended
  // rival arms a curse on the party's NEXT floor, keyed by character. On floor
  // advance the queued curses land on matchRules so the whole party feels them,
  // then clear. Mirrors queueRivalCurse -> seedRivalCurses in the campaign.
  function getRosterEntry(state, characterKey) {
    if (!characterKey) return null;
    const roster = Array.isArray(state.rivalRoster) ? state.rivalRoster : (state.rivalRoster = []);
    let entry = roster.find(candidate => candidate.characterKey === characterKey);
    if (!entry) {
      entry = { characterKey, lives: 2, relationship: 0, friend: false, vendetta: false, dead: false, returnFloor: 0, pendingSpawn: false };
      roster.push(entry);
    }
    return entry;
  }

  // Add a character to the shared rival roster so it will return to hunt the
  // party. Called by the run-service layer when a rival character is introduced.
  function addPartyRival(state, characterKey, options = {}) {
    const entry = getRosterEntry(state, characterKey);
    if (!entry) return null;
    entry.lives = Math.max(1, Math.trunc(Number(options.lives ?? entry.lives ?? 2)));
    entry.returnFloor = Math.min(MAX_FLOOR, Math.max(1, Number(options.returnFloor ?? (Number(state.floorNumber || 1) + 1))));
    entry.dead = false;
    entry.friend = !!options.friend;
    entry.vendetta = !!options.vendetta;
    entry.pendingSpawn = false;
    return entry;
  }

  function queuePartyRivalCurse(state, characterKey, options = {}) {
    if (!characterKey) return;
    const curses = state.pendingRivalCurses || (state.pendingRivalCurses = {});
    const descended = !!options.descended;
    switch (characterKey) {
      case 'princess':
        if (!curses.obscureMap) curses.obscureMap = true;
        break;
      case 'thorn_knight':
        curses.lowerCombat = true;
        break;
      case 'metao':
        curses.reducePotions = true;
        break;
      case 'gelleh':
        curses.gellehTurrets = Math.max(Number(curses.gellehTurrets || 0), descended ? 4 : 3);
        break;
      case 'mooggy':
        curses.mooggyTraps = Math.max(Number(curses.mooggyTraps || 0), descended ? 20 : 15);
        break;
      default:
        break;
    }
  }

  function applyPartyRivalCurses(state, emitEvent) {
    const curses = state.pendingRivalCurses;
    if (!curses || Object.keys(curses).length === 0) return;
    const rules = state.matchRules || (state.matchRules = {});
    rules.rivalCurses = { ...curses };
    // Wire the mechanically-simple curses straight into matchRules so the shared
    // systems already reading those flags apply them party-wide.
    if (curses.reducePotions) rules.potionDropMultiplier = 0.4;
    if (curses.lowerCombat) rules.rivalCombatCurse = true;
    if (curses.obscureMap) rules.obscureMap = true;
    if (Number(curses.mooggyTraps || 0) > 0) rules.pendingMooggyTraps = Number(curses.mooggyTraps);
    if (Number(curses.gellehTurrets || 0) > 0) rules.pendingGellehTurrets = Number(curses.gellehTurrets);
    emitEvent('RIVAL_CURSES_APPLIED', { floorNumber: state.floorNumber, curses: { ...curses } });
    state.pendingRivalCurses = {};
  }

  // Rivals that lost a life earlier return on their scheduled floor and are
  // injected into that floor's first combat room mirroring the slain character.
  function scheduleRivalReturns(state, emitEvent) {
    const roster = Array.isArray(state.rivalRoster) ? state.rivalRoster : [];
    roster.forEach(entry => {
      if (entry.dead || entry.friend) return;
      if (Number(entry.returnFloor || 0) !== Number(state.floorNumber || 1)) return;
      entry.pendingSpawn = true;
      // A grudge (negative relationship) arms a permanent vendetta hunt.
      if (Number(entry.relationship || 0) < 0) entry.vendetta = true;
      emitEvent('RIVAL_RETURNING', { characterKey: entry.characterKey, floorNumber: state.floorNumber, vendetta: !!entry.vendetta });
    });
  }

  // A player standing on the stairs charges a dwell timer; once it fills the
  // floor advances (or the run ends victorious on the final floor). The dwell
  // gate makes descending a deliberate group decision, not an accidental brush.
  function updateFloorExit(state, emitEvent) {
    Object.values(state.interactables || {}).forEach(stairs => {
      if (stairs.kind !== 'stairs') return;
      stairs.dwellByPlayer = stairs.dwellByPlayer || {};
      const players = activePlayers(state);
      let charging = false;
      players.forEach(player => {
        if (player.downed || player.roomId !== stairs.roomId) {
          delete stairs.dwellByPlayer[player.id];
          return;
        }
        const onStairs = Math.hypot(Number(player.x) - stairs.x, Number(player.y) - stairs.y)
          <= Number(stairs.radius || 30) + Number(player.radius || 18);
        if (!onStairs) {
          delete stairs.dwellByPlayer[player.id];
          return;
        }
        charging = true;
        stairs.dwellByPlayer[player.id] = Number(stairs.dwellByPlayer[player.id] || 0) + 1;
      });
      const firstPlayerWins = state.matchRules?.floorAdvance === 'first';
      const requiredPlayers = firstPlayerWins ? players.filter(player => !player.downed) : players;
      const dwellValues = requiredPlayers.map(player => Number(stairs.dwellByPlayer[player.id] || 0));
      const dwell = firstPlayerWins
        ? Math.max(0, ...dwellValues, 0)
        : (dwellValues.length ? Math.min(...dwellValues) : 0);
      stairs.requiredPlayers = requiredPlayers.length;
      stairs.readyPlayers = dwellValues.filter(value => value > 0).length;
      stairs.dwellProgress = Math.min(1, dwell / STAIRS_DWELL_TICKS);
      if (charging && stairs.dwellTelegraphTick !== state.tick && Math.max(0, ...dwellValues, 0) === 1) {
        stairs.dwellTelegraphTick = state.tick;
        emitEvent('STAIRS_ENGAGED', {
          interactableId: stairs.id,
          roomId: stairs.roomId,
          requiredPlayers: requiredPlayers.length,
          rule: firstPlayerWins ? 'first' : 'all',
        });
      }
      if (dwell < STAIRS_DWELL_TICKS) return;
      if (stairs.final) {
        const finisherId = Object.entries(stairs.dwellByPlayer)
          .sort((first, second) => Number(second[1]) - Number(first[1]))[0]?.[0] || null;
        if (state.matchRules?.mode === 'rival') {
          state.runStats = state.runStats || {};
          state.runStats.winnerPlayerId = finisherId;
        }
        state.status = 'ended';
        emitEvent('RUN_ENDED', {
          result: 'victory',
          reason: state.matchRules?.mode === 'rival' ? 'rival-first-finish' : 'god-floor-cleared',
          floorNumber: Number(state.floorNumber || 1),
          winnerPlayerId: state.matchRules?.mode === 'rival' ? finisherId : null,
        });
      } else {
        advanceToNextFloor(state, emitEvent);
      }
    });
  }

  // Downed players charge a revive when a living ally stands over them; a full
  // party wipe (everyone downed, none reviving) ends the run in defeat.
  function updateDownedAndRevive(state, emitEvent) {
    const players = activePlayers(state);
    if (!players.length) return;
    const living = players.filter(player => !player.downed);
    if (state.matchRules?.mode === 'rival') {
      players.filter(player => player.downed).forEach(player => {
        const downedAtTick = Number(player.downedAtTick ?? state.tick);
        if (state.tick - downedAtTick < RIVAL_RESPAWN_TICKS) {
          player.reviveProgress = Math.min(1, (state.tick - downedAtTick) / RIVAL_RESPAWN_TICKS);
          return;
        }
        const startRoomId = state.floorState?.layout?.startRoomId || state.floorState?.currentRoomId;
        applyCampaignRevive(player, { healthFraction: 0.75, currentTick: state.tick, tickRate: 20, invulnerabilitySeconds: 1.5 });
        player.roomId = startRoomId;
        player.x = Number(state.floorState?.width || 900) / 2;
        player.y = Number(state.floorState?.height || 700) / 2;
        emitEvent('PLAYER_RESPAWNED', { playerId: player.id, roomId: startRoomId, health: player.hp });
      });
      return;
    }
    players.forEach(downedPlayer => {
      if (!downedPlayer.downed) {
        downedPlayer.reviveProgress = 0;
        return;
      }
      const reviver = living.find(ally => ally.roomId === downedPlayer.roomId
        && Math.hypot(Number(ally.x) - Number(downedPlayer.x), Number(ally.y) - Number(downedPlayer.y)) <= REVIVE_RADIUS);
      if (!reviver) {
        downedPlayer.reviveTicks = 0;
        downedPlayer.reviveProgress = 0;
        return;
      }
      downedPlayer.reviveTicks = Number(downedPlayer.reviveTicks || 0) + 1;
      downedPlayer.reviveProgress = Math.min(1, downedPlayer.reviveTicks / REVIVE_DWELL_TICKS);
      if (downedPlayer.reviveTicks < REVIVE_DWELL_TICKS) return;
      applyCampaignRevive(downedPlayer, { healthFraction: REVIVE_HEALTH_FRACTION, currentTick: state.tick, tickRate: 20, invulnerabilitySeconds: 1.5 });
      emitEvent('PLAYER_REVIVED', { playerId: downedPlayer.id, reviverId: reviver.id, health: downedPlayer.hp });
    });
    if (state.status === 'running' && living.length === 0) {
      state.status = 'ended';
      emitEvent('RUN_ENDED', {
        result: 'defeat',
        reason: 'party-wiped',
        floorNumber: Number(state.floorNumber || 1),
      });
    }
  }

  function createFloorProgressionSystem(options = {}) {
    const emitEvent = typeof options.emitEvent === 'function' ? options.emitEvent : () => {};
    return ({ state }) => {
      if (state.status !== 'running') return;
      updateDownedAndRevive(state, emitEvent);
      if (state.status !== 'running') return; // a wipe ended the run this tick
      ensureFloorExit(state, emitEvent);
      updateFloorExit(state, emitEvent);
    };
  }

  function createNetworkCombatSystem(options = {}) {
    const emitEvent = typeof options.emitEvent === 'function' ? options.emitEvent : () => {};
    return ({ state, inputs, fixedDelta, random }) => {
      combatRandomByState.set(state, random);
      const occupiedRoomIds = new Set(Object.values(state.players || {})
        .filter(player => player && !player.disconnected)
        .map(player => player.roomId));
      occupiedRoomIds.forEach(roomId => {
        ensureAuthoritySpecialRoomContent(state, random, emitEvent, roomId);
        ensureNetworkEncounter(state, random, emitEvent, roomId);
        ensureNetworkRoomReward(state, random, emitEvent, roomId);
        ensureCampaignShop(state, random, emitEvent, roomId);
      });
      ensureJesterGate(state, emitEvent);
      updateAuthorityGardenGrowth(state, emitEvent);
      updateChestProximity(state, emitEvent, random);
      // Refill before actions resolve so a charge whose timer expires on this tick
      // is spendable on this tick, rather than a tick late.
      tickMoveCharges(state);
      updatePlayerActions(state, inputs, emitEvent, random);
      updatePlayerBeamChannels(state, inputs, fixedDelta, emitEvent);
      updatePlayerEquipmentEffects(state, emitEvent);
      updateAbilityEntities(state, emitEvent, random);
      updateRoomHazards(state, fixedDelta, emitEvent);
      updateAuthorityStatuses(state, fixedDelta, emitEvent);
      updateEnemies(state, fixedDelta, emitEvent);
      updateProjectiles(state, fixedDelta, emitEvent, random);
      updateMovingWorldPickups(state, fixedDelta);
      updatePickups(state, emitEvent, random);
    };
  }

  return {
    STAIRS_DWELL_TICKS,
    REVIVE_DWELL_TICKS,
    RIVAL_RESPAWN_TICKS,
    ATTACK_COOLDOWN_TICKS,
    PROJECTILE_DAMAGE,
    PROJECTILE_SPEED,
    HERO_PRIMARY_ATTACKS,
    HERO_BASE_STATS,
    ENEMY_ARCHETYPES,
    getHeroPrimaryAttack,
    applyNetworkHeroProfile,
    sanitizeKitChoices,
    ensureNetworkEncounter,
    ensureNetworkRoomReward,
    ensureCampaignShop,
    isNetworkRoomLocked,
    livingEncounterEnemies,
    resolvePlayerAbility,
    readMoveChargeState,
    moveChargeCapacity,
    createNetworkCombatSystem,
    createFloorProgressionSystem,
    advanceToNextFloor,
    addPartyRival,
    queuePartyRivalCurse,
    spawnMirrorChampionEncounter,
    MAX_FLOOR,
  };
});
