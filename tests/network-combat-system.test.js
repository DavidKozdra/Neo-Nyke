const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { RandomService } = require('../js/simulation/RandomService');
const { createNetworkFloorState, TEST_ROOM } = require('../js/multiplayer/LocalMultiplayerSession');
const { MOVE_SLOT_KEYS, MOVE_PRESENTATION_DEFS } = require('../js/simulation/SharedMoveContent');
const {
  ATTACK_COOLDOWN_TICKS,
  applyNetworkHeroProfile,
  createNetworkCombatSystem,
  ensureNetworkEncounter,
  getHeroPrimaryAttack,
  isNetworkRoomLocked,
} = require('../js/simulation/NetworkCombatSystem');

function combatHarness(characterKey = 'princess') {
  const state = new GameState({
    matchId: 'combat-test',
    matchSeed: 'combat-test-seed',
    floorSeed: 'combat-test-floor',
    status: 'running',
    floorState: createNetworkFloorState({ matchSeed: 'combat-test-seed', floorSeed: 'combat-test-floor' }),
    players: {
      p1: {
        id: 'p1', characterKey, roomId: 'room-4-4', x: 300, y: 350, radius: 18, moveSpeed: 180,
        maxHealth: 100, health: 100, gold: 0, action: 'idle', attackCooldownUntilTick: 0,
      },
    },
  });
  state.players.p1.roomId = state.floorState.currentRoomId;
  const random = new RandomService({ matchSeed: state.matchSeed });
  const events = [];
  const system = createNetworkCombatSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) });
  const simulation = new GameSimulation({ state, randomService: random, systems: [system] });
  return { state, random, events, simulation };
}

describe('authoritative network combat system', () => {
  test('gives every Neo Nyke hero a distinct server-owned primary attack', () => {
    const expected = {
      princess: ['projectile', 'princess_wand'],
      thorn_knight: ['sweep', 'thorns_bleed_blade'],
      metao: ['volley', 'metao_fire_staff'],
      gelleh: ['smite', 'gelleh_lightning_spear'],
      mooggy: ['double_sweep', 'claw_gauntlets'],
      turtle_boy: ['sweep', 'extending_staff'],
      sarge: ['sweep', 'sarges_hammer'],
    };
    Object.entries(expected).forEach(([characterKey, [mode, kind]]) => {
      expect(getHeroPrimaryAttack(characterKey)).toEqual(expect.objectContaining({ mode, kind }));
    });
    expect(new Set(Object.keys(expected).map(key => getHeroPrimaryAttack(key).kind)).size).toBe(7);
  });

  test('applies hero health and movement profiles without client-authored stats', () => {
    const player = { characterKey: 'thorn_knight', maxHealth: 100, health: 50, moveSpeed: 180 };
    applyNetworkHeroProfile(player, 'turtle_boy');
    expect(player).toEqual(expect.objectContaining({
      characterKey: 'turtle_boy', maxHealth: 120, health: 60, moveSpeed: 165,
      equippedMoves: { melee: 'slash', laser: 'turtle_wave', smash: 'death_ball', dash: 'dash' },
    }));
    applyNetworkHeroProfile(player, 'mooggy');
    expect(player).toEqual(expect.objectContaining({
      characterKey: 'mooggy', maxHealth: 108, health: 54, moveSpeed: 205,
    }));
  });

  test('authoritatively resolves equipped laser, smash, and dash slots with cooldowns', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    applyNetworkHeroProfile(state.players.p1, 'thorn_knight');
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = state.players.p1.x + 80;
    enemy.y = state.players.p1.y;
    enemy.moveSpeed = 0;

    simulation.updateGame({ p1: { actions: [
      { action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 },
      { action: 'ABILITY', abilityId: 'crimson_smash', aimDirection: 0 },
      { action: 'DASH', abilityId: 'dash', aimDirection: Math.PI / 2 },
    ] } }, 0.05);

    expect(enemy.health).toBeLessThan(enemy.maxHealth);
    expect(state.players.p1.y).toBeGreaterThan(350);
    expect(state.players.p1.moveCooldownUntilTick).toEqual(expect.objectContaining({
      blood_beam: expect.any(Number), crimson_smash: expect.any(Number), dash: expect.any(Number),
    }));
    expect(events.filter(event => event.eventType === 'PLAYER_ABILITY_USED')).toHaveLength(3);
    expect(events.find(event => event.data.abilityId === 'blood_beam').data.effectRadius).toBe(470);
  });

  test('server spawns and publishes Crimson Smash rock trajectories', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    applyNetworkHeroProfile(state.players.p1, 'thorn_knight');
    simulation.updateGame({}, 0.05);
    const player = state.players.p1;
    const origin = { x: player.x, y: player.y };

    simulation.updateGame({ p1: { actions: [
      { action: 'ABILITY', abilityId: 'crimson_smash', aimDirection: Math.PI / 4 },
    ] } }, 0.05);

    const rocks = Object.values(state.projectiles).filter(projectile => projectile.attackKind === 'crimson_smash');
    expect(rocks).toHaveLength(8);
    expect(rocks.every(projectile => projectile.kind === 'rock' && projectile.ownerId === 'p1')).toBe(true);
    expect(new Set(rocks.map(projectile => `${projectile.vx.toFixed(2)}:${projectile.vy.toFixed(2)}`)).size).toBe(8);
    const abilityEvent = events.find(event => event.eventType === 'PLAYER_ABILITY_USED');
    expect(abilityEvent.data).toEqual(expect.objectContaining({
      playerId: 'p1',
      abilityId: 'crimson_smash',
      presentationKey: 'crimson_smash',
      originX: origin.x,
      originY: origin.y,
      effectRadius: 140,
      projectileIds: rocks.map(projectile => projectile.id),
      spawnedProjectiles: expect.arrayContaining([
        expect.objectContaining({ id: rocks[0].id, kind: 'rock', vx: expect.any(Number), vy: expect.any(Number) }),
      ]),
    }));
  });

  test('server owns persistent zones, pulses, and expiry', () => {
    const { state, simulation, events } = combatHarness('gelleh');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'gelleh');
    player.health = 40;
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = player.x + 40;
    enemy.y = player.y;
    enemy.moveSpeed = 0;

    simulation.updateGame({ p1: { actions: [
      { action: 'ABILITY', abilityId: 'healing_zone', aimDirection: 0 },
    ] } }, 0.05);

    expect(Object.values(state.abilityEntities)).toEqual([
      expect.objectContaining({ kind: 'healing_zone', ownerId: 'p1', roomId: player.roomId }),
    ]);
    expect(player.health).toBeGreaterThan(40);
    expect(enemy.health).toBeLessThan(enemy.maxHealth);
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'ABILITY_ENTITY_PULSED' }));

    for (let tick = 0; tick < 70; tick += 1) simulation.updateGame({}, 0.05);
    expect(state.abilityEntities).toEqual({});
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'ABILITY_ENTITY_REMOVED' }));
  });

  test('server enforces authored invulnerability and Hammer Smash stun', () => {
    const flight = combatHarness('princess');
    applyNetworkHeroProfile(flight.state.players.p1, 'princess');
    flight.simulation.updateGame({}, 0.05);
    flight.simulation.updateGame({ p1: { actions: [
      { action: 'DASH', abilityId: 'flying_unhitable', aimDirection: 0 },
    ] } }, 0.05);
    const flyer = flight.state.players.p1;
    const projectileId = flight.state.allocateEntityId('projectile');
    flight.state.projectiles[projectileId] = {
      id: projectileId, hostile: true, ownerId: 'enemy', roomId: flyer.roomId,
      x: flyer.x, y: flyer.y, vx: 0, vy: 0, radius: 8, damage: 25,
      attackKind: 'test', expiresTick: flight.state.tick + 5,
    };
    flight.simulation.updateGame({}, 0.05);
    expect(flyer.health).toBe(flyer.maxHealth);
    expect(flight.events).toContainEqual(expect.objectContaining({ eventType: 'PLAYER_DAMAGE_BLOCKED' }));

    const hammer = combatHarness('sarge');
    applyNetworkHeroProfile(hammer.state.players.p1, 'sarge');
    hammer.simulation.updateGame({}, 0.05);
    const enemy = Object.values(hammer.state.enemies)[0];
    enemy.maxHealth = 200;
    enemy.health = 200;
    enemy.x = hammer.state.players.p1.x + 70;
    enemy.y = hammer.state.players.p1.y;
    hammer.simulation.updateGame({ p1: { actions: [
      { action: 'ABILITY', abilityId: 'hammer_smash', aimDirection: 0 },
    ] } }, 0.05);
    expect(enemy.stunnedUntilTick).toBeGreaterThan(hammer.state.tick);
  });

  test('rejects client ability IDs that are not equipped by that hero', () => {
    const { state, simulation, events } = combatHarness('princess');
    applyNetworkHeroProfile(state.players.p1, 'princess');
    simulation.updateGame({}, 0.05);
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'wizard_lazer', aimDirection: 0 }] } }, 0.05);
    expect(events.some(event => event.eventType === 'PLAYER_ABILITY_USED')).toBe(false);
    expect(state.players.p1.moveCooldownUntilTick).toEqual({});
  });

  test.each(Object.entries(MOVE_SLOT_KEYS)
    .filter(([slot]) => slot !== 'melee')
    .flatMap(([slot, moveKeys]) => moveKeys.map(moveKey => [slot, moveKey])))('%s move %s resolves through the shared authority catalog', (slot, moveKey) => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    const player = state.players.p1;
    player.equippedMoves = { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash', [slot]: moveKey };
    player.moveCooldownUntilTick = {};
    player.statusUntilTick = {};
    simulation.updateGame({}, 0.05);
    simulation.updateGame({ p1: { actions: [{
      action: slot === 'dash' ? 'DASH' : 'ABILITY', abilityId: moveKey, aimDirection: 0.35,
    }] } }, 0.05);

    const event = events.find(candidate => candidate.eventType === 'PLAYER_ABILITY_USED');
    expect(event?.data).toEqual(expect.objectContaining({
      playerId: 'p1', roomId: player.roomId, slot, abilityId: moveKey,
      presentationKey: moveKey,
      presentation: {
        key: moveKey,
        kind: MOVE_PRESENTATION_DEFS[moveKey].kind,
        style: MOVE_PRESENTATION_DEFS[moveKey].style,
      },
      originX: expect.any(Number), originY: expect.any(Number),
      destinationX: expect.any(Number), destinationY: expect.any(Number),
    }));
  });

  test.each([
    ['princess', 34, 1, 'princess_wand'],
    ['thorn_knight', 2, 0, 'thorns_bleed_blade'],
    ['metao', 34, 3, 'metao_fire_staff'],
    ['gelleh', 0, 1, 'gelleh_lightning_spear'],
    ['mooggy', 8, 0, 'claw_gauntlets'],
    ['turtle_boy', 0, 0, 'extending_staff'],
    ['sarge', 0, 0, 'sarges_hammer'],
  ])('%s resolves its own attack shape on the authority', (characterKey, healthAfterImmediate, projectileCount, attackKind) => {
    const { state, simulation, events } = combatHarness(characterKey);
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = 390;
    enemy.y = 350;
    enemy.moveSpeed = 0;
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    expect(enemy.health).toBe(healthAfterImmediate);
    expect(Object.values(state.projectiles)).toHaveLength(projectileCount);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_ATTACKED',
      data: expect.objectContaining({ characterKey, attackKind }),
    }));
    if (characterKey === 'mooggy') {
      simulation.updateGame({}, 0.05);
      simulation.updateGame({}, 0.05);
      expect(enemy.health).toBe(0);
      expect(events).toContainEqual(expect.objectContaining({ eventType: 'PLAYER_ATTACK_FOLLOWUP' }));
    }
  });

  test('ranged hunters telegraph and fire server projectiles that damage players', () => {
    const { state, simulation, events } = combatHarness();
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.type = 'hunter';
    enemy.behavior = 'ranged';
    enemy.projectileDamage = 9;
    enemy.attackCooldownUntilTick = state.tick;
    enemy.x = 560;
    enemy.y = 350;
    for (let tick = 0; tick < 10; tick += 1) simulation.updateGame({}, 0.05);

    expect(events.some(event => event.eventType === 'ENEMY_TELEGRAPH')).toBe(true);
    expect(events.some(event => event.eventType === 'ENEMY_ATTACKED')).toBe(true);
    const projectile = Object.values(state.projectiles).find(candidate => candidate.hostile);
    expect(projectile).toEqual(expect.objectContaining({ type: 'hunter_arrow', damage: 9 }));
    projectile.x = state.players.p1.x;
    projectile.y = state.players.p1.y;
    projectile.vx = 0;
    projectile.vy = 0;
    simulation.updateGame({}, 0.05);
    expect(state.players.p1.health).toBe(91);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT',
      data: expect.objectContaining({ attackKind: 'hunter_arrow', damage: 9 }),
    }));
  });

  test('creates the same seeded encounter independently of client presentation', () => {
    const first = combatHarness();
    const second = combatHarness();
    ensureNetworkEncounter(first.state, first.random);
    ensureNetworkEncounter(second.state, second.random);

    const firstEnemy = Object.values(first.state.enemies)[0];
    const secondEnemy = Object.values(second.state.enemies)[0];
    expect(firstEnemy).toEqual(secondEnemy);
    expect(first.state.floorState.encounters[first.state.floorState.currentRoomId]).toEqual(
      expect.objectContaining({ status: 'active', enemyIds: [firstEnemy.id] }),
    );
    expect(isNetworkRoomLocked(first.state)).toBe(false);

    const startRoom = first.state.floorState.layout.rooms.find(room => room.id === first.state.floorState.currentRoomId);
    startRoom.type = 'challenge';
    expect(isNetworkRoomLocked(first.state)).toBe(true);
  });

  test('runs persistent shared encounter state in every occupied player room', () => {
    const { state, simulation } = combatHarness('princess');
    applyNetworkHeroProfile(state.players.p1, 'princess');
    const secondRoom = state.floorState.layout.rooms.find(room => room.type === 'combat');
    state.players.p2 = {
      ...state.players.p1,
      id: 'p2',
      characterKey: 'sarge',
      roomId: secondRoom.id,
      x: 450,
      y: 350,
    };
    applyNetworkHeroProfile(state.players.p2, 'sarge');

    simulation.updateGame({}, 0.05);

    const firstRoomId = state.players.p1.roomId;
    expect(state.floorState.encounters[firstRoomId]).toEqual(expect.objectContaining({ status: 'active' }));
    expect(state.floorState.encounters[secondRoom.id]).toEqual(expect.objectContaining({ status: 'active' }));
    expect(new Set(Object.values(state.enemies).map(enemy => enemy.roomId))).toEqual(new Set([firstRoomId, secondRoom.id]));

    state.floorState.encounters[secondRoom.id].status = 'cleared';
    Object.keys(state.enemies).forEach(id => {
      if (state.enemies[id].roomId === secondRoom.id) delete state.enemies[id];
    });
    state.players.p2.roomId = firstRoomId;
    simulation.updateGame({}, 0.05);
    state.players.p2.roomId = secondRoom.id;
    simulation.updateGame({}, 0.05);
    expect(state.floorState.encounters[secondRoom.id].status).toBe('cleared');
    expect(Object.values(state.enemies).some(enemy => enemy.roomId === secondRoom.id)).toBe(false);
  });

  test('owns projectile hits, death, room clear, a single drop, and pickup currency', () => {
    const { state, simulation, events } = combatHarness();
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = 500;
    enemy.y = 350;
    enemy.moveSpeed = 0.001;

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    for (let tick = 0; tick < getHeroPrimaryAttack('princess').cooldownTicks + 1; tick += 1) simulation.updateGame({}, 0.05);
    expect(enemy.health).toBe(4);

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    for (let tick = 0; tick < 12; tick += 1) simulation.updateGame({}, 0.05);

    expect(enemy.dead).toBe(true);
    expect(isNetworkRoomLocked(state)).toBe(false);
    expect(Object.values(state.pickups)).toHaveLength(1);
    expect(events.filter(event => event.eventType === 'ENEMY_DEFEATED')).toHaveLength(1);
    expect(events.filter(event => event.eventType === 'PICKUP_SPAWNED')).toHaveLength(1);
    expect(events.filter(event => event.eventType === 'ROOM_CLEARED')).toHaveLength(1);

    const pickup = Object.values(state.pickups)[0];
    state.players.p1.x = pickup.x;
    state.players.p1.y = pickup.y;
    simulation.updateGame({}, 0.05);
    expect(state.players.p1.gold).toBe(1);
    expect(Object.values(state.pickups)).toHaveLength(0);
    expect(events.filter(event => event.eventType === 'PICKUP_COLLECTED')).toHaveLength(1);
  });

  test('keeps authoritative combat state serializable', () => {
    const { state, simulation } = combatHarness();
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: Math.PI / 4 }] } }, 0.05);
    const parsed = JSON.parse(simulation.serialize());
    expect(parsed.enemies).toEqual(state.enemies);
    expect(parsed.projectiles).toEqual(state.projectiles);
    expect(parsed.floorState.width).toBe(TEST_ROOM.width);
  });
});
