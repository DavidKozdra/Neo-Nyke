(function initializeNetworkCombatSystem(root, factory) {
  const api = factory(root.NeoNyke?.simulation || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNetworkCombatSystemApi() {
  'use strict';

  const ATTACK_COOLDOWN_TICKS = 7;
  const PROJECTILE_SPEED = 520;
  const PROJECTILE_DAMAGE = 30;
  const PROJECTILE_LIFETIME_TICKS = 24;
  const ENEMY_DEATH_TICKS = 8;
  const ENCOUNTER_ROOM_TYPES = new Set(['start', 'combat', 'challenge']);

  function currentRoom(state) {
    return state.floorState?.layout?.rooms?.find(room => room.id === state.floorState.currentRoomId) || null;
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
    if (room?.type === 'challenge') return 3;
    if (room?.type === 'combat') return 2;
    return 1;
  }

  function ensureNetworkEncounter(state, random, emitEvent = () => {}) {
    const room = currentRoom(state);
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
      const enemy = {
        id: enemyId,
        type: index === 0 ? 'cult_follower' : 'hunter',
        spriteKey: index === 0 ? 'cult_follower' : 'hunter',
        roomId: room.id,
        x: 450 + Math.cos(angle) * distance,
        y: 350 + Math.sin(angle) * Math.min(distance, 210),
        vx: 0,
        vy: 0,
        radius: 20,
        moveSpeed: room.type === 'challenge' ? 88 : 72,
        maxHealth: room.type === 'challenge' ? 75 : 60,
        health: room.type === 'challenge' ? 75 : 60,
        contactDamage: 8,
        contactCooldownUntilTick: 0,
        state: 'chasing',
        facing: 1,
        spawnTick: state.tick,
        hitTick: -1,
        dead: false,
      };
      state.enemies[enemyId] = enemy;
      enemyIds.push(enemyId);
      emitEvent('ENEMY_SPAWNED', { enemyId, roomId: room.id, enemyType: enemy.type });
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

  function spawnPlayerProjectile(state, player, action, emitEvent) {
    if (state.tick < Number(player.attackCooldownUntilTick || 0) || player.downed) return null;
    const angle = Number(action.aimDirection);
    if (!Number.isFinite(angle)) return null;
    const projectileId = state.allocateEntityId('projectile');
    const muzzleDistance = Number(player.radius || 18) + 13;
    const projectile = {
      id: projectileId,
      type: 'player_bolt',
      ownerId: player.id,
      roomId: player.roomId,
      x: Number(player.x) + Math.cos(angle) * muzzleDistance,
      y: Number(player.y) + Math.sin(angle) * muzzleDistance,
      vx: Math.cos(angle) * PROJECTILE_SPEED,
      vy: Math.sin(angle) * PROJECTILE_SPEED,
      radius: 8,
      damage: PROJECTILE_DAMAGE,
      color: player.color || '#9de9ff',
      spawnTick: state.tick,
      expiresTick: state.tick + PROJECTILE_LIFETIME_TICKS,
    };
    state.projectiles[projectileId] = projectile;
    player.attackCooldownUntilTick = state.tick + ATTACK_COOLDOWN_TICKS;
    player.action = 'attack';
    player.actionTick = state.tick;
    player.aimDirection = angle;
    emitEvent('PLAYER_ATTACKED', { playerId: player.id, projectileId, aimDirection: angle });
    return projectile;
  }

  function updatePlayerActions(state, inputs, emitEvent) {
    Object.values(state.players || {}).forEach(player => {
      const actions = Array.isArray(inputs[player.id]?.actions) ? inputs[player.id].actions : [];
      const attack = actions.find(action => action?.action === 'ATTACK');
      if (attack) spawnPlayerProjectile(state, player, attack, emitEvent);
      if (player.action === 'attack' && state.tick - Number(player.actionTick || 0) > 4) player.action = 'idle';
    });
  }

  function updateEnemies(state, fixedDelta, emitEvent) {
    const floor = state.floorState || {};
    const minimum = Number(floor.wallThickness || 28) + 20;
    const maximumX = Number(floor.width || 900) - minimum;
    const maximumY = Number(floor.height || 700) - minimum;
    Object.entries(state.enemies || {}).forEach(([enemyId, enemy]) => {
      if (enemy.dead) {
        if (state.tick - Number(enemy.deathTick || 0) >= ENEMY_DEATH_TICKS) delete state.enemies[enemyId];
        return;
      }
      if (enemy.roomId !== floor.currentRoomId) return;
      const target = nearestLivingPlayer(state, enemy);
      if (!target.player) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.state = 'idle';
        return;
      }
      const angle = Math.atan2(target.player.y - enemy.y, target.player.x - enemy.x);
      const speed = Number(enemy.moveSpeed || 72);
      enemy.vx = Math.cos(angle) * speed;
      enemy.vy = Math.sin(angle) * speed;
      enemy.facing = enemy.vx < 0 ? -1 : 1;
      enemy.state = 'chasing';
      if (target.distance > Number(enemy.radius || 20) + Number(target.player.radius || 18) + 4) {
        enemy.x = Math.max(minimum, Math.min(maximumX, enemy.x + enemy.vx * fixedDelta));
        enemy.y = Math.max(minimum, Math.min(maximumY, enemy.y + enemy.vy * fixedDelta));
      } else if (state.tick >= Number(enemy.contactCooldownUntilTick || 0)) {
        enemy.contactCooldownUntilTick = state.tick + 16;
        target.player.health = Math.max(0, Number(target.player.health || 0) - Number(enemy.contactDamage || 8));
        target.player.hitTick = state.tick;
        if (target.player.health <= 0) target.player.downed = true;
        emitEvent('PLAYER_HIT', {
          playerId: target.player.id,
          enemyId,
          damage: Number(enemy.contactDamage || 8),
          health: target.player.health,
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
    emitEvent('ROOM_CLEARED', { roomId });
  }

  function updateProjectiles(state, fixedDelta, emitEvent) {
    Object.entries(state.projectiles || {}).forEach(([projectileId, projectile]) => {
      if (state.tick >= Number(projectile.expiresTick || 0) || projectile.roomId !== state.floorState?.currentRoomId) {
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
      const enemy = livingEncounterEnemies(state, projectile.roomId).find(candidate => (
        Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y)
          <= Number(candidate.radius || 20) + Number(projectile.radius || 8)
      ));
      if (!enemy) return;
      delete state.projectiles[projectileId];
      enemy.health = Math.max(0, Number(enemy.health || 0) - Number(projectile.damage || 0));
      enemy.hitTick = state.tick;
      emitEvent('ENEMY_HIT', {
        enemyId: enemy.id,
        playerId: projectile.ownerId,
        projectileId,
        damage: Number(projectile.damage || 0),
        health: enemy.health,
      });
      if (enemy.health > 0 || enemy.dead) return;
      enemy.dead = true;
      enemy.state = 'dead';
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.deathTick = state.tick;
      emitEvent('ENEMY_DEFEATED', { enemyId: enemy.id, playerId: projectile.ownerId, roomId: enemy.roomId });
      spawnCoinDrop(state, enemy, emitEvent);
      markEncounterCleared(state, enemy.roomId, emitEvent);
    });
  }

  function updatePickups(state, emitEvent) {
    Object.entries(state.pickups || {}).forEach(([pickupId, pickup]) => {
      if (pickup.roomId !== state.floorState?.currentRoomId) return;
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

  function createNetworkCombatSystem(options = {}) {
    const emitEvent = typeof options.emitEvent === 'function' ? options.emitEvent : () => {};
    return ({ state, inputs, fixedDelta, random }) => {
      ensureNetworkEncounter(state, random, emitEvent);
      updatePlayerActions(state, inputs, emitEvent);
      updateEnemies(state, fixedDelta, emitEvent);
      updateProjectiles(state, fixedDelta, emitEvent);
      updatePickups(state, emitEvent);
    };
  }

  return {
    ATTACK_COOLDOWN_TICKS,
    PROJECTILE_DAMAGE,
    PROJECTILE_SPEED,
    ensureNetworkEncounter,
    isNetworkRoomLocked,
    livingEncounterEnemies,
    createNetworkCombatSystem,
  };
});
