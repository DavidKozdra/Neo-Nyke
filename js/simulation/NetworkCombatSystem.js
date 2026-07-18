(function initializeNetworkCombatSystem(root, factory) {
  const contentApi = typeof require === 'function'
    ? require('./SharedCombatContent.js')
    : (root.NeoNyke?.content || {});
  const api = factory(root.NeoNyke?.simulation || {}, contentApi);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNetworkCombatSystemApi(browserApi, contentApi) {
  'use strict';

  const ATTACK_COOLDOWN_TICKS = 7;
  const PROJECTILE_SPEED = 520;
  const PROJECTILE_DAMAGE = 30;
  const PROJECTILE_LIFETIME_TICKS = 24;
  const ENEMY_DEATH_TICKS = 8;
  const ENCOUNTER_ROOM_TYPES = new Set(['start', 'combat', 'challenge']);
  const {
    CHARACTER_DEFAULT_WEAPONS = {},
    DEFAULT_WEAPON_ATTACKS = {},
    PROJECTILE_TYPE_DEFS = {},
    WEAPON_BASE_STATS = {},
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
  const ENEMY_ARCHETYPES = Object.freeze({
    cult_follower: Object.freeze({ spriteKey: 'cult_follower', behavior: 'chaser', maxHealth: 60, moveSpeed: 74, contactDamage: 8, radius: 20 }),
    hunter: Object.freeze({ spriteKey: 'hunter', behavior: 'ranged', maxHealth: 52, moveSpeed: 68, contactDamage: 5, projectileDamage: 9, radius: 19 }),
    charger: Object.freeze({ spriteKey: 'charger', behavior: 'charger', maxHealth: 80, moveSpeed: 118, contactDamage: 12, radius: 22 }),
  });
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
    player.maxHealth = profile.maxHealth;
    player.health = Math.round(profile.maxHealth * healthRatio);
    player.moveSpeed = profile.moveSpeed;
    return player;
  }

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
      const pool = room.type === 'start'
        ? ['cult_follower']
        : room.type === 'challenge'
          ? ['cult_follower', 'hunter', 'charger']
          : ['cult_follower', 'hunter', 'charger', 'hunter'];
      const type = pool[stream.int(0, pool.length - 1)];
      const archetype = ENEMY_ARCHETYPES[type];
      const healthScale = room.type === 'challenge' ? 1.25 : 1;
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
        maxHealth: Math.round(archetype.maxHealth * healthScale),
        health: Math.round(archetype.maxHealth * healthScale),
        contactDamage: archetype.contactDamage,
        projectileDamage: Number(archetype.projectileDamage || 0),
        contactCooldownUntilTick: 0,
        attackCooldownUntilTick: state.tick + 14 + stream.int(0, 10),
        attackWindupUntilTick: 0,
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
    const dealt = Math.max(0, Number(damage || 0));
    enemy.health = Math.max(0, Number(enemy.health || 0) - dealt);
    enemy.hitTick = state.tick;
    emitEvent('ENEMY_HIT', {
      enemyId: enemy.id,
      playerId,
      damage: dealt,
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
      if (player.action === 'attack' && state.tick - Number(player.actionTick || 0) > 4) player.action = 'idle';
    });
  }

  function damagePlayer(state, player, damage, enemyId, emitEvent, attackKind = 'contact') {
    if (!player || player.downed) return;
    const dealt = Math.max(0, Number(damage || 0));
    player.health = Math.max(0, Number(player.health || 0) - dealt);
    player.hitTick = state.tick;
    if (player.health <= 0) player.downed = true;
    emitEvent('PLAYER_HIT', {
      playerId: player.id,
      enemyId,
      damage: dealt,
      health: player.health,
      attackKind,
    });
  }

  function createEnemyProjectile(state, enemy, target) {
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    const projectileId = state.allocateEntityId('projectile');
    state.projectiles[projectileId] = {
      id: projectileId,
      type: 'hunter_arrow',
      ownerId: enemy.id,
      hostile: true,
      roomId: enemy.roomId,
      x: enemy.x + Math.cos(angle) * (Number(enemy.radius || 19) + 10),
      y: enemy.y + Math.sin(angle) * (Number(enemy.radius || 19) + 10),
      vx: Math.cos(angle) * 390,
      vy: Math.sin(angle) * 390,
      radius: 6,
      damage: Number(enemy.projectileDamage || 9),
      color: '#ffc477',
      attackKind: 'hunter_arrow',
      spawnTick: state.tick,
      expiresTick: state.tick + 30,
    };
    return projectileId;
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
      if (enemy.roomId !== floor.currentRoomId) return;
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
      if (enemy.behavior === 'ranged') {
        if (Number(enemy.attackWindupUntilTick || 0) > 0) {
          enemy.vx = 0;
          enemy.vy = 0;
          enemy.state = 'aiming';
          if (state.tick >= enemy.attackWindupUntilTick) {
            const projectileId = createEnemyProjectile(state, enemy, target.player);
            enemy.attackWindupUntilTick = 0;
            enemy.attackCooldownUntilTick = state.tick + 28;
            enemy.state = 'firing';
            emitEvent('ENEMY_ATTACKED', { enemyId, targetPlayerId: target.player.id, attackKind: 'hunter_arrow', projectileId });
          }
        } else if (state.tick >= Number(enemy.attackCooldownUntilTick || 0)) {
          enemy.attackWindupUntilTick = state.tick + 7;
          enemy.state = 'aiming';
          enemy.vx = 0;
          enemy.vy = 0;
          emitEvent('ENEMY_TELEGRAPH', { enemyId, targetPlayerId: target.player.id, attackKind: 'hunter_arrow', windupTicks: 7 });
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
    createNetworkCombatSystem,
  };
});
