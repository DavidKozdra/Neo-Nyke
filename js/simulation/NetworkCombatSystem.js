(function initializeNetworkCombatSystem(root, factory) {
  const contentApi = typeof require === 'function'
    ? { ...require('./SharedCombatContent.js'), ...require('./SharedMoveContent.js'), ...require('./SharedEnemyContent.js') }
    : (root.NeoNyke?.content || {});
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
    DEFAULT_WEAPON_ATTACKS = {},
    PROJECTILE_TYPE_DEFS = {},
    WEAPON_BASE_STATS = {},
    MOVE_BASE_STATS = {},
    MOVE_PRESENTATION_DEFS = {},
    MOVE_SLOT_BY_KEY = {},
    getDefaultMoveLoadout = () => ({ melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' }),
    ENEMY_CATALOG = {},
    STANDARD_ENEMY_TYPES = [],
    BOSS_ENEMY_TYPES = [],
    ELITE_POWER_TYPES = [],
    getEnemyDefinition = type => ENEMY_CATALOG[type],
    getCharacterDefaultWeapon = characterKey => CHARACTER_DEFAULT_WEAPONS[characterKey] || 'thorns_bleed_blade',
  } = contentApi || {};
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
  const HERO_BASE_STATS = Object.freeze({
    princess: Object.freeze({ maxHealth: 115, moveSpeed: 180 }),
    thorn_knight: Object.freeze({ maxHealth: 100, moveSpeed: 180 }),
    metao: Object.freeze({ maxHealth: 100, moveSpeed: 180 }),
    gelleh: Object.freeze({ maxHealth: 100, moveSpeed: 185 }),
    mooggy: Object.freeze({ maxHealth: 108, moveSpeed: 205 }),
    turtle_boy: Object.freeze({ maxHealth: 120, moveSpeed: 165 }),
    sarge: Object.freeze({ maxHealth: 90, moveSpeed: 165 }),
  });
  const NETWORK_RELICS = Object.freeze({
    iron_heart: Object.freeze({ name: 'Iron Heart', description: '+25 max HP and heal 25.', rarity: 'knight', color: '#d7f6ff', maxHealth: 25, heal: 25 }),
    war_sigil: Object.freeze({ name: 'War Sigil', description: '+20% damage.', rarity: 'knight', color: '#ff718c', damageMultiplier: 0.2 }),
    quicksilver_boots: Object.freeze({ name: 'Quicksilver Boots', description: '+12% move speed.', rarity: 'artificer', color: '#7dbdff', moveSpeedMultiplier: 0.12 }),
    chronometer: Object.freeze({ name: 'Chronometer', description: 'Abilities recover 12% faster.', rarity: 'wizard', color: '#c996ff', cooldownMultiplier: -0.12 }),
    coin_charm: Object.freeze({ name: 'Coin Charm', description: '+1 gold from every coin.', rarity: 'knight', color: '#ffd966', goldBonus: 1 }),
    long_reach: Object.freeze({ name: 'Long Reach', description: 'Collect drops from farther away.', rarity: 'knight', color: '#a7ffdc', pickupRadius: 55 }),
    field_rations: Object.freeze({ name: 'Field Rations', description: 'Restore 45% health.', rarity: 'knave', color: '#8cff9d', healFraction: 0.45 }),
    glass_crown: Object.freeze({ name: 'Glass Crown', description: '+35% damage, -15 max HP.', rarity: 'god', color: '#ffdf6d', damageMultiplier: 0.35, maxHealth: -15 }),
  });

  function getHeroPrimaryAttack(characterKey) {
    return HERO_PRIMARY_ATTACKS[characterKey] || HERO_PRIMARY_ATTACKS.thorn_knight;
  }

  function applyNetworkRelic(player, relicId) {
    const relic = NETWORK_RELICS[relicId];
    if (!player || !relic) return false;
    player.relics = Array.isArray(player.relics) ? player.relics : [];
    player.relics.push(relicId);
    if (relic.maxHealth) {
      player.maxHealth = Math.max(1, Number(player.maxHealth || 100) + relic.maxHealth);
      player.health = Math.min(player.maxHealth, Math.max(1, Number(player.health || 0) + Math.max(0, relic.maxHealth)));
    }
    if (relic.heal) player.health = Math.min(player.maxHealth, Number(player.health || 0) + relic.heal);
    if (relic.healFraction) player.health = Math.min(player.maxHealth, Number(player.health || 0) + player.maxHealth * relic.healFraction);
    if (relic.damageMultiplier) player.damageMultiplier = Math.max(0.1, Number(player.damageMultiplier || 1) + relic.damageMultiplier);
    if (relic.moveSpeedMultiplier) player.moveSpeed = Math.max(1, Number(player.moveSpeed || 180) * (1 + relic.moveSpeedMultiplier));
    if (relic.cooldownMultiplier) player.cooldownMultiplier = Math.max(0.45, Number(player.cooldownMultiplier || 1) + relic.cooldownMultiplier);
    if (relic.goldBonus) player.goldBonus = Number(player.goldBonus || 0) + relic.goldBonus;
    if (relic.pickupRadius) player.pickupRadius = Math.max(Number(player.pickupRadius || 0), relic.pickupRadius);
    return true;
  }

  function applyNetworkHeroProfile(player, characterKey) {
    const key = HERO_BASE_STATS[characterKey] ? characterKey : 'thorn_knight';
    const profile = HERO_BASE_STATS[key];
    const previousMaximum = Math.max(1, Number(player.maxHealth || profile.maxHealth));
    const healthRatio = Math.max(0, Math.min(1, Number(player.health ?? previousMaximum) / previousMaximum));
    player.characterKey = key;
    player.equippedWeapon = getCharacterDefaultWeapon(key);
    player.equippedMoves = getDefaultMoveLoadout(key);
    player.moveCooldownUntilTick = {};
    player.statusUntilTick = {};
    player.barrier = 0;
    player.maxHealth = profile.maxHealth;
    player.health = Math.round(profile.maxHealth * healthRatio);
    player.moveSpeed = profile.moveSpeed;
    return player;
  }

  function currentRoom(state, roomId = state.floorState?.currentRoomId) {
    return state.floorState?.layout?.rooms?.find(room => room.id === roomId) || null;
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

  function ensureNetworkEncounter(state, random, emitEvent = () => {}, roomId = null) {
    const occupiedRoomId = roomId || Object.values(state.players || {}).find(player => !player?.disconnected)?.roomId || state.floorState?.currentRoomId;
    const room = currentRoom(state, occupiedRoomId);
    if (!room || !ENCOUNTER_ROOM_TYPES.has(room.type)) return null;
    state.floorState.encounters = state.floorState.encounters || {};
    if (state.floorState.encounters[room.id]) return state.floorState.encounters[room.id];

    const stream = random.scoped(`enemy-spawning:${state.floorNumber}:${room.id}`);
    const count = encounterCount(room);
    const enemyIds = [];
    for (let index = 0; index < count; index += 1) {
      const enemyId = state.allocateEntityId('enemy');
      const angle = stream.next() * Math.PI * 2;
      const distance = 175 + stream.next() * 95;
      const pool = getEncounterPool(room, state.floorNumber);
      const type = pool[stream.int(0, pool.length - 1)];
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
        bleedImmune: !!archetype.bleedImmune,
        fireImmune: !!archetype.fireImmune,
        contactCooldownUntilTick: 0,
        attackCooldownUntilTick: state.tick + Math.max(4, Math.round(Number(archetype.attackCooldown || 1) * 20)) + stream.int(0, 6),
        attackWindupUntilTick: 0,
        state: 'chasing',
        facing: 1,
        spawnTick: state.tick,
        hitTick: -1,
        dead: false,
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
    return encounter;
  }

  function ensureNetworkRoomReward(state, random, emitEvent = () => {}, roomId = null) {
    const room = currentRoom(state, roomId);
    if (!room || room.type !== 'treasure') return null;
    state.floorState.rewards = state.floorState.rewards || {};
    const existingReward = state.floorState.rewards[room.id];
    if (existingReward) return state.interactables?.[existingReward.interactableIds?.[0]] || null;
    const stream = random.scoped(`loot:${state.floorNumber}:${room.id}`);
    const chestCount = 1 + stream.int(0, 1);
    const interactableIds = [];
    for (let index = 0; index < chestCount; index += 1) {
      const interactableId = state.allocateEntityId('interactable');
      const spread = chestCount === 1 ? 0 : (index === 0 ? -105 : 105);
      const optionIds = stream.shuffle(Object.keys(NETWORK_RELICS)).slice(0, 2);
      const chest = {
        id: interactableId,
        kind: 'relic_chest',
        roomId: room.id,
        x: Number(state.floorState.width || 900) / 2 + spread,
        y: Number(state.floorState.height || 700) / 2 + (index % 2 === 0 ? -28 : 28),
        radius: 34,
        optionIds,
        opened: false,
        claimedBy: null,
        spawnTick: state.tick,
      };
      state.interactables[interactableId] = chest;
      interactableIds.push(interactableId);
      emitEvent('INTERACTABLE_SPAWNED', { interactableId, kind: chest.kind, roomId: room.id });
    }
    state.floorState.rewards[room.id] = { interactableIds, status: 'available' };
    return state.interactables[interactableIds[0]];
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
    enemy.dead = true;
    enemy.state = 'dead';
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.deathTick = state.tick;
    emitEvent('ENEMY_DEFEATED', { enemyId: enemy.id, playerId, roomId: enemy.roomId });
    awardEncounterExperience(state, enemy, playerId, emitEvent);
    spawnCoinDrop(state, enemy, emitEvent);
    markEncounterCleared(state, enemy.roomId, emitEvent);
  }

  function xpRequiredForLevel(level) {
    return 20 + Math.max(0, Number(level || 1) - 1) * 15;
  }

  function awardEncounterExperience(state, enemy, playerId, emitEvent) {
    const definition = getEnemyDefinition(enemy.type) || {};
    const amount = definition.boss ? 30 : enemy.elite ? 12 : 6;
    const recipients = activePlayers(state).filter(player => !player.downed && player.roomId === enemy.roomId);
    recipients.forEach(player => {
      player.xp = Math.max(0, Number(player.xp || 0)) + amount;
      player.level = Math.max(1, Number(player.level || 1));
      player.xpToNext = Math.max(1, Number(player.xpToNext || xpRequiredForLevel(player.level)));
      while (player.xp >= player.xpToNext) {
        player.xp -= player.xpToNext;
        player.level += 1;
        const healthGain = 8;
        player.maxHealth = Math.max(1, Number(player.maxHealth || 100)) + healthGain;
        player.health = Math.min(player.maxHealth, Number(player.health || 0) + healthGain);
        player.damageMultiplier = 1 + (player.level - 1) * 0.08;
        player.xpToNext = xpRequiredForLevel(player.level);
        emitEvent('PLAYER_LEVELED', { playerId: player.id, level: player.level, maxHealth: player.maxHealth });
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
    return Math.max(0, Number(amount || 0)) * Math.max(0.1, Number(attacker?.damageMultiplier || 1));
  }

  function damageEnemy(state, enemy, damage, playerId, emitEvent, details = {}) {
    if (!enemy || enemy.dead) return false;
    const incoming = playerDamage(state, playerId, damage);
    const absorbed = Math.min(incoming, Math.max(0, Number(enemy.barrier || 0)));
    enemy.barrier = Math.max(0, Number(enemy.barrier || 0) - absorbed);
    const dealt = incoming - absorbed;
    enemy.health = Math.max(0, Number(enemy.health || 0) - dealt);
    enemy.hitTick = state.tick;
    emitEvent('ENEMY_HIT', {
      enemyId: enemy.id,
      playerId,
      damage: dealt,
      absorbed,
      health: enemy.health,
      attackKind: details.attackKind,
      projectileId: details.projectileId,
      strike: details.strike,
    });
    if (details.bleedDamage && enemy.health > 0) {
      enemy.bleedDamage = Math.max(Number(enemy.bleedDamage || 0), Number(details.bleedDamage));
      enemy.bleedTicksRemaining = Math.max(Number(enemy.bleedTicksRemaining || 0), Number(details.bleedTicks || 0));
      enemy.bleedNextTick = Math.max(Number(enemy.bleedNextTick || 0), state.tick + 5);
      enemy.bleedOwnerId = playerId;
    }
    if (enemy.health <= 0) defeatEnemy(state, enemy, playerId, emitEvent);
    return true;
  }

  function applyFireStatus(state, enemy, stacks, duration, playerId) {
    if (!enemy || enemy.dead || stacks <= 0) return;
    enemy.fireStacks = Math.max(Number(enemy.fireStacks || 0), Number(stacks));
    enemy.fireTicksRemaining = Math.max(Number(enemy.fireTicksRemaining || 0), Math.ceil(Number(duration || 3) / 0.45));
    enemy.fireNextTick = Math.max(Number(enemy.fireNextTick || 0), state.tick + 9);
    enemy.fireOwnerId = playerId;
  }

  function applyPoisonStatus(state, enemy, stacks, duration, playerId) {
    if (!enemy || enemy.dead) return;
    enemy.poisonStacks = Math.max(Number(enemy.poisonStacks || 0), Number(stacks || 1));
    enemy.poisonTicksRemaining = Math.max(Number(enemy.poisonTicksRemaining || 0), Math.ceil(Number(duration || 4) / 0.5));
    enemy.poisonNextTick = Math.max(Number(enemy.poisonNextTick || 0), state.tick + 10);
    enemy.poisonOwnerId = playerId;
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
    const projectile = {
      id: projectileId,
      type: definition.projectileKind || definition.kind,
      kind: definition.projectileKind || definition.kind,
      ownerId: player.id,
      hostile: false,
      roomId: player.roomId,
      x: Number(player.x) + Math.cos(angle) * muzzleDistance,
      y: Number(player.y) + Math.sin(angle) * muzzleDistance,
      vx: Math.cos(angle) * Number(definition.speed || PROJECTILE_SPEED),
      vy: Math.sin(angle) * Number(definition.speed || PROJECTILE_SPEED),
      radius: Number(definition.radius || 8),
      damage: Number(definition.damage || PROJECTILE_DAMAGE),
      // colour is derived client-side from `kind` (see NetworkGameView cosmetics)
      attackKind: definition.attackKind || definition.weaponKey || definition.kind,
      remainingPierces: Math.max(0, Number(definition.pierce || 0)),
      hitEnemyIds: [],
      spawnTick: state.tick,
      expiresTick: state.tick + Number(definition.lifeTicks || PROJECTILE_LIFETIME_TICKS),
      splash: Number(definition.splash || 0),
      splashDamage: Number(definition.splashDamage || 0),
      fireStacks: Number(definition.fireStacks || 0),
      fireDuration: Number(definition.fireDuration || 0),
    };
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
        owner.health = Math.min(Number(owner.maxHealth || 100), Number(owner.health || 0) + Number(entity.heal || 0));
      }
      emitEvent('ABILITY_ENTITY_PULSED', {
        entityId, playerId: owner.id, roomId: entity.roomId,
        presentationKey: entity.presentationKey, x: pulseX, y: pulseY,
        radius: pulseRadius, targetIds,
      });
    });
  }

  function maybeApplyBleed(state, enemy, definition, playerId, random) {
    if (!definition.bleedChance || !random?.stream('combat-variance')?.chance(definition.bleedChance)) return;
    enemy.bleedDamage = Math.max(Number(enemy.bleedDamage || 0), 4 * Number(definition.bleedStacks || 1));
    enemy.bleedTicksRemaining = Math.max(Number(enemy.bleedTicksRemaining || 0), Math.ceil(Number(definition.bleedDuration || 5) / 0.5));
    enemy.bleedNextTick = Math.max(Number(enemy.bleedNextTick || 0), state.tick + 10);
    enemy.bleedOwnerId = playerId;
  }

  function resolveSweep(state, player, definition, angle, emitEvent, random, strike = 0) {
    const targets = targetsInArc(state, player, angle, Number(definition.range || 120), Number(definition.arc || 1.04));
    targets.forEach(candidate => {
      damageEnemy(state, candidate.enemy, definition.damage, player.id, emitEvent, {
        attackKind: definition.weaponKey,
        strike,
      });
      if (!candidate.enemy.dead) maybeApplyBleed(state, candidate.enemy, definition, player.id, random);
    });
    const rivals = rivalTargetsInArc(state, player, angle, Number(definition.range || 120), Number(definition.arc || 1.04));
    rivals.forEach(target => damagePlayer(state, target, playerDamage(state, player.id, definition.damage), player.id, emitEvent, definition.weaponKey));
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
    const definition = getHeroPrimaryAttack(player.characterKey);
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

    player.attackCooldownUntilTick = state.tick + Math.max(1, Math.ceil(Number(definition.cooldownTicks || ATTACK_COOLDOWN_TICKS)
      * Math.max(0.45, Number(player.cooldownMultiplier || 1))));
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
    return livingEncounterEnemies(state, player.roomId)
      .filter(enemy => Math.hypot(enemy.x - x, enemy.y - y) <= range + Number(enemy.radius || 20));
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
      if (Math.hypot(target.x - x, target.y - y) > range + Number(target.radius || 18)) return;
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

  function resolvePlayerAbility(state, player, action, emitEvent, random) {
    if (player.downed) return null;
    const moveKey = String(action.abilityId || '');
    const slot = MOVE_SLOT_BY_KEY[moveKey];
    if (!slot || slot === 'melee' || player.equippedMoves?.[slot] !== moveKey) return null;
    const expectedAction = slot === 'dash' ? 'DASH' : 'ABILITY';
    if (action.action !== expectedAction) return null;
    const stats = MOVE_BASE_STATS[moveKey] || {};
    const presentation = MOVE_PRESENTATION_DEFS[moveKey] || { kind: slot, style: 'normal' };
    const cooldowns = player.moveCooldownUntilTick || (player.moveCooldownUntilTick = {});
    if (state.tick < Number(cooldowns[moveKey] || 0)) return null;
    const angle = Number(action.aimDirection);
    if (!Number.isFinite(angle)) return null;
    const cooldownTicks = Math.max(1, Math.ceil(Number(stats.cooldown || 0.5) * 20));
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
        player.barrier = Math.max(Number(player.barrier || 0), Number(player.maxHealth || 100) * 0.4);
        mode = 'shield';
      } else {
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
        const count = moveKey === 'power_disks' ? 6 : moveKey === 'nail_shot' ? 8 : moveKey === 'lightning_columns' ? 2 : 1;
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
      } else {
        if (moveKey === 'god_sweep') sweepDirection = (typeof random === 'function' ? random() : 0.5) < 0.5 ? -1 : 1;
        const range = Number(stats.range || (moveKey === 'blade_justice' ? 90 : 470));
        const width = moveKey === 'god_sweep' ? 120 : moveKey === 'turtle_wave' || moveKey === 'wizard_lazer' ? 48 : 24;
        effectRadius = range;
        abilityTargetsInBeam(state, player, angle, range, width).forEach(enemy => {
          damageEnemy(state, enemy, stats.damage, player.id, emitEvent, { attackKind: moveKey });
          targetIds.push(enemy.id);
        });
        damageRivalsInBeam(state, player, angle, range, width, stats.damage, emitEvent, moveKey, targetIds);
        if (moveKey === 'love_beam' || moveKey === 'holy_eye_beams') {
          player.health = Math.min(Number(player.maxHealth || 100), Number(player.health || 0) + Math.max(1, targetIds.length * 4));
        }
        mode = 'beam';
      }
    } else if (slot === 'smash') {
      if (moveKey === 'healing_zone' || moveKey === 'potion_bath' || moveKey === 'turtle_powerup') {
        const heal = moveKey === 'potion_bath'
          ? Number(player.maxHealth || 100) * 0.2
          : moveKey === 'turtle_powerup'
            ? Number(player.maxHealth || 100) * 0.12
            : 0;
        player.health = Math.min(Number(player.maxHealth || 100), Number(player.health || 0) + heal);
        if (moveKey === 'turtle_powerup') player.barrier = Math.max(Number(player.barrier || 0), Number(player.health || 0) * 0.25);
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
        abilityTargetsInRadius(state, player, centerX, centerY, Number(stats.range || 140)).forEach(enemy => {
          damageEnemy(state, enemy, stats.damage, player.id, emitEvent, { attackKind: moveKey });
          if (moveKey === 'hammer_smash' && !enemy.dead) {
            enemy.stunnedUntilTick = Math.max(Number(enemy.stunnedUntilTick || 0), state.tick + 14);
          }
          if (moveKey === 'random_pounce' && !enemy.dead) {
            enemy.bleedDamage = Math.max(Number(enemy.bleedDamage || 0), 8);
            enemy.bleedTicksRemaining = Math.max(Number(enemy.bleedTicksRemaining || 0), 10);
            enemy.bleedNextTick = Math.max(Number(enemy.bleedNextTick || 0), state.tick + 10);
            enemy.bleedOwnerId = player.id;
          }
          if (moveKey === 'mooggy_hairball' && !enemy.dead) {
            applyPoisonStatus(state, enemy, 3, 6, player.id);
            enemy.frozenUntilTick = Math.max(Number(enemy.frozenUntilTick || 0), state.tick + 16);
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

    cooldowns[moveKey] = state.tick + Math.max(1, Math.ceil(cooldownTicks * Math.max(0.45, Number(player.cooldownMultiplier || 1))));
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

  function resolvePlayerInteraction(state, player, action, emitEvent) {
    if (!player || player.downed || player.pendingUpgrade) return false;
    const target = state.interactables?.[action.targetEntityId];
    if (!target || target.opened || target.activated || target.roomId !== player.roomId) return false;
    if (Math.hypot(Number(target.x) - Number(player.x), Number(target.y) - Number(player.y))
      > Number(target.radius || 30) + Number(player.radius || 18) + 38) return false;
    if (target.kind !== 'relic_chest' || !Array.isArray(target.optionIds) || !target.optionIds.length) return false;
    player.pendingUpgrade = {
      selectionEventId: target.id,
      sourceEntityId: target.id,
      optionIds: target.optionIds.slice(),
      options: target.optionIds.map(optionId => ({ id: optionId, ...NETWORK_RELICS[optionId] })),
    };
    target.activated = true;
    target.offeredTo = player.id;
    target.activatedTick = state.tick;
    emitEvent('CHEST_OPENED', { playerId: player.id, interactableId: target.id, roomId: target.roomId });
    emitEvent('UPGRADE_OFFERED', { playerId: player.id, selectionEventId: target.id, optionIds: target.optionIds });
    return true;
  }

  function updateChestProximity(state, emitEvent) {
    Object.values(state.interactables || {}).forEach(chest => {
      if (chest.kind !== 'relic_chest' || chest.opened || chest.activated) return;
      const player = activePlayers(state).find(candidate => !candidate.downed && !candidate.pendingUpgrade
        && candidate.roomId === chest.roomId
        && Math.hypot(Number(candidate.x) - Number(chest.x), Number(candidate.y) - Number(chest.y)) < 36);
      if (player) resolvePlayerInteraction(state, player, { targetEntityId: chest.id }, emitEvent);
    });
  }

  function resolveUpgradeSelection(state, player, action, emitEvent) {
    const pending = player?.pendingUpgrade;
    if (!pending || pending.selectionEventId !== action.selectionEventId || !pending.optionIds.includes(action.optionId)) return false;
    const source = state.interactables?.[pending.sourceEntityId];
    if (!source || source.opened) {
      player.pendingUpgrade = null;
      return false;
    }
    if (!applyNetworkRelic(player, action.optionId)) return false;
    source.opened = true;
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
      selectionEventId: action.selectionEventId,
      optionId: action.optionId,
      relicCount: player.relics.length,
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
      if (actions.some(action => action?.action === 'ATTACK' || action?.action === 'ABILITY')) {
        if (player.statusUntilTick) delete player.statusUntilTick.cowards_way;
      }
      const attack = actions.find(action => action?.action === 'ATTACK');
      if (attack) resolvePlayerAttack(state, player, attack, emitEvent, random);
      actions.filter(action => action?.action === 'ABILITY' || action?.action === 'DASH')
        .forEach(action => resolvePlayerAbility(state, player, action, emitEvent, random));
      actions.filter(action => action?.action === 'INTERACT')
        .forEach(action => resolvePlayerInteraction(state, player, action, emitEvent));
      actions.filter(action => action?.action === 'UPGRADE')
        .forEach(action => resolveUpgradeSelection(state, player, action, emitEvent));
      if (player.action !== 'idle' && state.tick - Number(player.actionTick || 0) > 4) player.action = 'idle';
    });
  }

  function damagePlayer(state, player, damage, sourceId, emitEvent, attackKind = 'contact') {
    if (!player || player.downed) return;
    const statusUntil = player.statusUntilTick || {};
    const protectedByStatus = state.tick < Number(player.invulnerableUntilTick || 0)
      || state.tick < Number(statusUntil.flying_unhitable || 0)
      || state.tick < Number(statusUntil.cowards_way || 0)
      || state.tick < Number(statusUntil.potion_bath || 0);
    if (protectedByStatus) {
      emitEvent('PLAYER_DAMAGE_BLOCKED', { playerId: player.id, sourceId, roomId: player.roomId, attackKind });
      return;
    }
    const incoming = Math.max(0, Number(damage || 0));
    const absorbed = Math.min(incoming, Math.max(0, Number(player.barrier || 0)));
    player.barrier = Math.max(0, Number(player.barrier || 0) - absorbed);
    const dealt = incoming - absorbed;
    player.health = Math.max(0, Number(player.health || 0) - dealt);
    player.hitTick = state.tick;
    const newlyDowned = player.health <= 0;
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
      health: player.health,
      attackKind,
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

  function spawnSummonedEnemy(state, summoner, emitEvent) {
    const definition = getEnemyDefinition('cult_follower');
    const enemyId = state.allocateEntityId('enemy');
    const angle = (Number(state.tick || 0) + Number(String(enemyId).replace(/\D/g, '') || 0)) * 1.7;
    state.enemies[enemyId] = {
      id: enemyId,
      type: definition.type,
      spriteKey: definition.spriteKey,
      behavior: definition.behavior,
      roomId: summoner.roomId,
      x: summoner.x + Math.cos(angle) * 48,
      y: summoner.y + Math.sin(angle) * 48,
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
      summonedBy: summoner.id,
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

  function moveEnemy(enemy, angle, multiplier, fixedDelta, floor) {
    const speed = Number(enemy.moveSpeed || 72) * multiplier;
    enemy.vx = Math.cos(angle) * speed;
    enemy.vy = Math.sin(angle) * speed;
    enemy.facing = enemy.vx < 0 ? -1 : 1;
    const minimum = Number(floor.wallThickness || 28) + Number(enemy.radius || 20);
    const maximumX = Number(floor.width || 900) - minimum;
    const maximumY = Number(floor.height || 700) - minimum;
    enemy.x = Math.max(minimum, Math.min(maximumX, enemy.x + enemy.vx * fixedDelta));
    enemy.y = Math.max(minimum, Math.min(maximumY, enemy.y + enemy.vy * fixedDelta));
  }

  function updateEnemies(state, fixedDelta, emitEvent) {
    const floor = state.floorState || {};
    Object.entries(state.enemies || {}).forEach(([enemyId, enemy]) => {
      if (enemy.dead) {
        if (state.tick - Number(enemy.deathTick || 0) >= ENEMY_DEATH_TICKS) delete state.enemies[enemyId];
        return;
      }
      if (Number(enemy.bleedTicksRemaining || 0) > 0 && state.tick >= Number(enemy.bleedNextTick || 0)) {
        enemy.bleedTicksRemaining -= 1;
        enemy.bleedNextTick = state.tick + 10;
        damageEnemy(state, enemy, enemy.bleedDamage, enemy.bleedOwnerId, emitEvent, { attackKind: 'bleed' });
        if (enemy.dead) return;
      }
      if (Number(enemy.fireTicksRemaining || 0) > 0 && state.tick >= Number(enemy.fireNextTick || 0)) {
        enemy.fireTicksRemaining -= 1;
        enemy.fireNextTick = state.tick + 9;
        damageEnemy(state, enemy, Math.max(1, Math.round(1.5 + Number(enemy.fireStacks || 1) * 1.8)), enemy.fireOwnerId, emitEvent, { attackKind: 'fire' });
        if (enemy.dead) return;
      }
      if (Number(enemy.poisonTicksRemaining || 0) > 0 && state.tick >= Number(enemy.poisonNextTick || 0)) {
        enemy.poisonTicksRemaining -= 1;
        enemy.poisonNextTick = state.tick + 10;
        damageEnemy(state, enemy, Math.max(1, Math.round(2 + Number(enemy.poisonStacks || 1) * 1.5)), enemy.poisonOwnerId, emitEvent, { attackKind: 'poison' });
        if (enemy.dead) return;
      }
      if (state.tick < Number(enemy.frozenUntilTick || 0)) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.state = 'frozen';
        return;
      }
      if (state.tick < Number(enemy.stunnedUntilTick || 0)) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.state = 'stunned';
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
      const rangedBehavior = ['ranged', 'sniper', 'beam', 'burst', 'summoner', 'healer', 'shield', 'boss_spawner', 'boss'].includes(enemy.behavior);
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
          moveEnemy(enemy, angle, -1, fixedDelta, floor);
        } else if (target.distance > 285) {
          enemy.state = 'approaching';
          moveEnemy(enemy, angle, 1, fixedDelta, floor);
        } else {
          enemy.state = 'holding';
          enemy.vx = 0;
          enemy.vy = 0;
        }
      } else if (target.distance > contactDistance) {
        enemy.state = enemy.behavior === 'charger' ? 'charging' : 'chasing';
        moveEnemy(enemy, angle, 1, fixedDelta, floor);
      } else {
        enemy.vx = 0;
        enemy.vy = 0;
      }
      if (target.distance <= contactDistance && state.tick >= Number(enemy.contactCooldownUntilTick || 0)) {
        enemy.contactCooldownUntilTick = state.tick + 16;
        damagePlayer(state, target.player, enemy.contactDamage, enemyId, emitEvent, 'contact');
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
    emitEvent('ROOM_CLEARED', { roomId });
  }

  function updateProjectiles(state, fixedDelta, emitEvent) {
    Object.entries(state.projectiles || {}).forEach(([projectileId, projectile]) => {
      if (state.tick >= Number(projectile.expiresTick || 0)) {
        delete state.projectiles[projectileId];
        return;
      }
      projectile.x += Number(projectile.vx || 0) * fixedDelta;
      projectile.y += Number(projectile.vy || 0) * fixedDelta;
      const wall = Number(state.floorState?.wallThickness || 28);
      if (projectile.x < wall || projectile.x > Number(state.floorState?.width || 900) - wall
        || projectile.y < wall || projectile.y > Number(state.floorState?.height || 700) - wall) {
        delete state.projectiles[projectileId];
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
        damagePlayer(state, player, projectile.damage, projectile.ownerId, emitEvent, projectile.attackKind);
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
          damagePlayer(state, rival, playerDamage(state, projectile.ownerId, projectile.damage), projectile.ownerId, emitEvent, projectile.attackKind);
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
      });
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
        delete state.projectiles[projectileId];
      }
    });
  }

  function updatePickups(state, emitEvent) {
    Object.entries(state.pickups || {}).forEach(([pickupId, pickup]) => {
      const player = Object.values(state.players || {}).find(candidate => (
          candidate && !candidate.downed && candidate.roomId === pickup.roomId
          && Math.hypot(candidate.x - pickup.x, candidate.y - pickup.y)
            <= Number(candidate.radius || 18) + Number(pickup.radius || 13) + 5 + Number(candidate.pickupRadius || 0)
      ));
      if (!player) return;
      const amount = Math.max(0, Number(pickup.amount || 0)) + Math.max(0, Number(player.goldBonus || 0));
      player.gold = Math.max(0, Number(player.gold || 0)) + amount;
      delete state.pickups[pickupId];
      emitEvent('PICKUP_COLLECTED', {
        pickupId,
        playerId: player.id,
        pickupType: pickup.type,
        amount,
        gold: player.gold,
      });
    });
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
  function advanceToNextFloor(state, emitEvent) {
    const nextFloorNumber = Number(state.floorNumber || 1) + 1;
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
    emitEvent('FLOOR_ADVANCED', { floorNumber: nextFloorNumber, floorSeed, startRoomId: layout.startRoomId });
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
        player.downed = false;
        player.downedAtTick = null;
        player.reviveProgress = 0;
        player.health = Math.max(1, Math.round(Number(player.maxHealth || 100) * 0.75));
        player.roomId = startRoomId;
        player.x = Number(state.floorState?.width || 900) / 2;
        player.y = Number(state.floorState?.height || 700) / 2;
        emitEvent('PLAYER_RESPAWNED', { playerId: player.id, roomId: startRoomId, health: player.health });
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
      downedPlayer.downed = false;
      downedPlayer.reviveTicks = 0;
      downedPlayer.reviveProgress = 0;
      downedPlayer.health = Math.max(1, Math.round(Number(downedPlayer.maxHealth || 100) * REVIVE_HEALTH_FRACTION));
      emitEvent('PLAYER_REVIVED', { playerId: downedPlayer.id, reviverId: reviver.id, health: downedPlayer.health });
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
      const occupiedRoomIds = new Set(Object.values(state.players || {})
        .filter(player => player && !player.disconnected)
        .map(player => player.roomId));
      occupiedRoomIds.forEach(roomId => {
        ensureNetworkEncounter(state, random, emitEvent, roomId);
        ensureNetworkRoomReward(state, random, emitEvent, roomId);
      });
      updateChestProximity(state, emitEvent);
      updatePlayerActions(state, inputs, emitEvent, random);
      updateAbilityEntities(state, emitEvent, random);
      updateEnemies(state, fixedDelta, emitEvent);
      updateProjectiles(state, fixedDelta, emitEvent);
      updatePickups(state, emitEvent);
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
    NETWORK_RELICS,
    ENEMY_ARCHETYPES,
    getHeroPrimaryAttack,
    applyNetworkHeroProfile,
    applyNetworkRelic,
    ensureNetworkEncounter,
    ensureNetworkRoomReward,
    isNetworkRoomLocked,
    livingEncounterEnemies,
    resolvePlayerAbility,
    createNetworkCombatSystem,
    createFloorProgressionSystem,
    advanceToNextFloor,
    MAX_FLOOR,
  };
});
