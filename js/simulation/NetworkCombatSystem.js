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
  const ATTACK_COOLDOWN_TICKS = 7;
  const PROJECTILE_SPEED = 520;
  const PROJECTILE_DAMAGE = 30;
  const PROJECTILE_LIFETIME_TICKS = 24;
  const ENEMY_DEATH_TICKS = 8;
  const ENCOUNTER_ROOM_TYPES = new Set(['start', 'combat', 'challenge', 'ladder', 'boss', 'god']);
  const {
    CHARACTER_DEFAULT_WEAPONS = {},
    DEFAULT_WEAPON_ATTACKS = {},
    PROJECTILE_TYPE_DEFS = {},
    WEAPON_BASE_STATS = {},
    MOVE_BASE_STATS = {},
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

  function getHeroPrimaryAttack(characterKey) {
    return HERO_PRIMARY_ATTACKS[characterKey] || HERO_PRIMARY_ATTACKS.thorn_knight;
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
    spawnCoinDrop(state, enemy, emitEvent);
    markEncounterCleared(state, enemy.roomId, emitEvent);
  }

  function damageEnemy(state, enemy, damage, playerId, emitEvent, details = {}) {
    if (!enemy || enemy.dead) return false;
    const incoming = Math.max(0, Number(damage || 0));
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

  function createPlayerProjectile(state, player, definition, angle) {
    const projectileId = state.allocateEntityId('projectile');
    const muzzleDistance = Number(player.radius || 18) + 13;
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
      color: definition.color || player.color || '#9de9ff',
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
    return targets.map(candidate => candidate.enemy.id);
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

    player.attackCooldownUntilTick = state.tick + Number(definition.cooldownTicks || ATTACK_COOLDOWN_TICKS);
    player.action = 'attack';
    player.actionTick = state.tick;
    player.actionKind = definition.weaponKey;
    player.actionMode = definition.mode;
    player.aimDirection = angle;
    emitEvent('PLAYER_ATTACKED', {
      playerId: player.id,
      characterKey: player.characterKey,
      attackMode: definition.mode,
      attackKind: definition.weaponKey,
      weaponKey: definition.weaponKey,
      aimDirection: angle,
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

  function resolvePlayerAbility(state, player, action, emitEvent) {
    if (player.downed) return null;
    const moveKey = String(action.abilityId || '');
    const slot = MOVE_SLOT_BY_KEY[moveKey];
    if (!slot || slot === 'melee' || player.equippedMoves?.[slot] !== moveKey) return null;
    const expectedAction = slot === 'dash' ? 'DASH' : 'ABILITY';
    if (action.action !== expectedAction) return null;
    const stats = MOVE_BASE_STATS[moveKey] || {};
    const cooldowns = player.moveCooldownUntilTick || (player.moveCooldownUntilTick = {});
    if (state.tick < Number(cooldowns[moveKey] || 0)) return null;
    const angle = Number(action.aimDirection);
    if (!Number.isFinite(angle)) return null;
    const cooldownTicks = Math.max(1, Math.ceil(Number(stats.cooldown || 0.5) * 20));
    const projectileIds = [];
    const targetIds = [];
    let mode = slot;

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
      const projectileMoves = new Set(['love_bomb_laser', 'ghost_ball', 'power_disks', 'hammer_throw', 'lightning_columns', 'nail_shot', 'laser_shockwave']);
      if (projectileMoves.has(moveKey)) {
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
        mode = 'cross';
      } else {
        const range = Number(stats.range || (moveKey === 'blade_justice' ? 90 : 470));
        const width = moveKey === 'god_sweep' ? 120 : moveKey === 'turtle_wave' || moveKey === 'wizard_lazer' ? 48 : 24;
        abilityTargetsInBeam(state, player, angle, range, width).forEach(enemy => {
          damageEnemy(state, enemy, stats.damage, player.id, emitEvent, { attackKind: moveKey });
          targetIds.push(enemy.id);
        });
        if (moveKey === 'love_beam' || moveKey === 'holy_eye_beams') {
          player.health = Math.min(Number(player.maxHealth || 100), Number(player.health || 0) + Math.max(1, targetIds.length * 4));
        }
        mode = 'beam';
      }
    } else if (slot === 'smash') {
      if (moveKey === 'healing_zone' || moveKey === 'potion_bath' || moveKey === 'turtle_powerup') {
        const heal = moveKey === 'potion_bath' ? Number(player.maxHealth || 100) * 0.2 : Number(player.maxHealth || 100) * 0.12;
        player.health = Math.min(Number(player.maxHealth || 100), Number(player.health || 0) + heal);
        if (moveKey === 'turtle_powerup') player.barrier = Math.max(Number(player.barrier || 0), Number(player.health || 0) * 0.25);
        const statusUntil = player.statusUntilTick || (player.statusUntilTick = {});
        statusUntil[moveKey] = state.tick + Math.max(1, Math.round(Number(stats.duration || 3) * 20));
        mode = 'support';
      } else if (moveKey === 'death_ball' || moveKey === 'mooggy_hairball') {
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
      } else {
        const centerDistance = moveKey === 'kicky_kick' ? 70 : moveKey === 'random_pounce' ? 100 : 0;
        const centerX = player.x + Math.cos(angle) * centerDistance;
        const centerY = player.y + Math.sin(angle) * centerDistance;
        abilityTargetsInRadius(state, player, centerX, centerY, Number(stats.range || 140)).forEach(enemy => {
          damageEnemy(state, enemy, stats.damage, player.id, emitEvent, { attackKind: moveKey });
          targetIds.push(enemy.id);
        });
        mode = 'aoe';
      }
    }

    cooldowns[moveKey] = state.tick + cooldownTicks;
    setPlayerAction(state, player, slot, moveKey, angle);
    emitEvent('PLAYER_ABILITY_USED', {
      playerId: player.id,
      characterKey: player.characterKey,
      slot,
      abilityId: moveKey,
      mode,
      aimDirection: angle,
      cooldownTicks,
      projectileIds,
      targetIds,
    });
    return { moveKey, slot, mode, projectileIds, targetIds };
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
      const attack = actions.find(action => action?.action === 'ATTACK');
      if (attack) resolvePlayerAttack(state, player, attack, emitEvent, random);
      actions.filter(action => action?.action === 'ABILITY' || action?.action === 'DASH')
        .forEach(action => resolvePlayerAbility(state, player, action, emitEvent));
      if (player.action !== 'idle' && state.tick - Number(player.actionTick || 0) > 4) player.action = 'idle';
    });
  }

  function damagePlayer(state, player, damage, enemyId, emitEvent, attackKind = 'contact') {
    if (!player || player.downed) return;
    const incoming = Math.max(0, Number(damage || 0));
    const absorbed = Math.min(incoming, Math.max(0, Number(player.barrier || 0)));
    player.barrier = Math.max(0, Number(player.barrier || 0) - absorbed);
    const dealt = incoming - absorbed;
    player.health = Math.max(0, Number(player.health || 0) - dealt);
    player.hitTick = state.tick;
    if (player.health <= 0) player.downed = true;
    emitEvent('PLAYER_HIT', {
      playerId: player.id,
      enemyId,
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
      color: enemy.behavior === 'beam' ? '#c77bff' : enemy.behavior === 'burst' ? '#ff9f68' : '#ffc477',
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
            <= Number(candidate.radius || 18) + Number(pickup.radius || 13) + 5
      ));
      if (!player) return;
      player.gold = Math.max(0, Number(player.gold || 0)) + Math.max(0, Number(pickup.amount || 0));
      delete state.pickups[pickupId];
      emitEvent('PICKUP_COLLECTED', {
        pickupId,
        playerId: player.id,
        pickupType: pickup.type,
        amount: pickup.amount,
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
      let charging = false;
      activePlayers(state).forEach(player => {
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
      const dwell = Math.max(0, ...Object.values(stairs.dwellByPlayer), 0);
      stairs.dwellProgress = Math.min(1, dwell / STAIRS_DWELL_TICKS);
      if (charging && stairs.dwellTelegraphTick !== state.tick && dwell === 1) {
        stairs.dwellTelegraphTick = state.tick;
        emitEvent('STAIRS_ENGAGED', { interactableId: stairs.id, roomId: stairs.roomId });
      }
      if (dwell < STAIRS_DWELL_TICKS) return;
      if (stairs.final) {
        state.status = 'ended';
        emitEvent('RUN_ENDED', {
          result: 'victory',
          reason: 'god-floor-cleared',
          floorNumber: Number(state.floorNumber || 1),
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
      occupiedRoomIds.forEach(roomId => ensureNetworkEncounter(state, random, emitEvent, roomId));
      updatePlayerActions(state, inputs, emitEvent, random);
      updateEnemies(state, fixedDelta, emitEvent);
      updateProjectiles(state, fixedDelta, emitEvent);
      updatePickups(state, emitEvent);
    };
  }

  return {
    ATTACK_COOLDOWN_TICKS,
    PROJECTILE_DAMAGE,
    PROJECTILE_SPEED,
    HERO_PRIMARY_ATTACKS,
    HERO_BASE_STATS,
    ENEMY_ARCHETYPES,
    getHeroPrimaryAttack,
    applyNetworkHeroProfile,
    ensureNetworkEncounter,
    isNetworkRoomLocked,
    livingEncounterEnemies,
    resolvePlayerAbility,
    createNetworkCombatSystem,
    createFloorProgressionSystem,
    advanceToNextFloor,
    MAX_FLOOR,
  };
});
