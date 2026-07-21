const {
  VirtualNetworkClock,
  LocalLoopbackNetwork,
  LocalLoopbackTransport,
} = require('../js/multiplayer/LocalLoopbackTransport');
const {
  LocalMultiplayerAuthority,
  LocalMultiplayerClient,
  TEST_ROOM,
  createNetworkFloorState,
  createPlayerMovementSystem,
  getAdjacentNetworkRoom,
  getCurrentNetworkRoom,
} = require('../js/multiplayer/LocalMultiplayerSession');
const { GameState } = require('../js/simulation/GameState');
const { createEnvelope, getDeliveryIntent } = require('../js/protocol/ProtocolV1');

function transport(network, id, displayName) {
  return new LocalLoopbackTransport({
    network,
    identity: { provider: 'guest', id, displayName },
  });
}

async function createRunningHarness(networkOptions = {}) {
  const clock = new VirtualNetworkClock();
  const network = new LocalLoopbackNetwork({
    latencyMs: 100,
    jitterMs: 30,
    unreliablePacketLoss: 0.2,
    duplicateMessageRate: 0.1,
    seed: 'integration-network',
    clock,
    ...networkOptions,
  });
  const hostTransport = transport(network, 'authority', 'Authority');
  const clientATransport = transport(network, 'client-a', 'Client A');
  const clientBTransport = transport(network, 'client-b', 'Client B');
  const authority = new LocalMultiplayerAuthority({ transport: hostTransport, sessionId: 'GOFAST', matchSeed: 1234 });
  const clientA = new LocalMultiplayerClient({ transport: clientATransport });
  const clientB = new LocalMultiplayerClient({ transport: clientBTransport });
  await authority.start();
  await clientA.connect('GOFAST');
  await clientB.connect('GOFAST');
  clock.runAll();
  clientA.sendReady();
  clientB.sendReady();
  clock.runAll();
  return { clock, network, authority, clientA, clientB, clientATransport, clientBTransport };
}

describe('LocalLoopbackTransport', () => {
  test('preserves reliable order under jitter and simulates duplication', async () => {
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({
      latencyMs: 50,
      jitterMs: 50,
      duplicateMessageRate: 1,
      random: () => 0,
      clock,
    });
    const host = transport(network, 'host', 'Host');
    const client = transport(network, 'client', 'Client');
    await host.createSession({ sessionId: 'ORDER' });
    await client.joinSession('ORDER');
    const received = [];
    host.onMessage((_peerId, message) => received.push(message.value));
    client.send('host', { value: 1 }, { reliability: 'reliable', channel: 'control' });
    client.send('host', { value: 2 }, { reliability: 'reliable', channel: 'control' });
    clock.runAll();
    expect(received).toEqual([1, 1, 2, 2]);
    expect(network.getMetrics()).toEqual(expect.objectContaining({ sent: 2, delivered: 4, duplicated: 2 }));
  });

  test('drops unreliable traffic without dropping reliable traffic', async () => {
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({ unreliablePacketLoss: 1, random: () => 0, clock });
    const host = transport(network, 'host', 'Host');
    const client = transport(network, 'client', 'Client');
    await host.createSession({ sessionId: 'LOSS' });
    await client.joinSession('LOSS');
    const received = [];
    host.onMessage((_peerId, message) => received.push(message.value));
    client.send('host', { value: 'lost' }, { reliability: 'unreliable', channel: 'simulation' });
    client.send('host', { value: 'kept' }, { reliability: 'reliable', channel: 'control' });
    clock.runAll();
    expect(received).toEqual(['kept']);
    expect(network.getMetrics().dropped).toBe(1);
  });
});

describe('protocol-driven local multiplayer session', () => {
  test('authority validates and broadcasts lobby character selection', async () => {
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({ clock });
    const authority = new LocalMultiplayerAuthority({ transport: transport(network, 'authority', 'Authority') });
    const client = new LocalMultiplayerClient({ transport: transport(network, 'client-a', 'Client A') });
    await authority.start();
    await client.connect('neo-local-room');
    clock.runAll();

    client.sendReady(true);
    client.sendCharacter('sarge');
    clock.runAll();

    expect(authority.simulation.state.players[client.playerId].characterKey).toBe('sarge');
    expect(authority.simulation.state.players[client.playerId]).toEqual(expect.objectContaining({
      maxHp: 108,
      hp: 108,
      moveSpeed: 228,
      damageMultiplier: 1.05,
      items: { copper_penny: 1 },
    }));
    expect(client.lobbyState.members).toEqual([
      expect.objectContaining({ playerId: client.playerId, characterKey: 'sarge', ready: false }),
    ]);
  });

  test('authority applies valid alt-kit choices and rejects kit picks outside the shared table', async () => {
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({ clock });
    const authority = new LocalMultiplayerAuthority({ transport: transport(network, 'authority', 'Authority') });
    const client = new LocalMultiplayerClient({ transport: transport(network, 'client-a', 'Client A') });
    await authority.start();
    await client.connect('neo-local-room');
    clock.runAll();

    client.sendCharacter('sarge', { smash: 'titan_hammer' });
    clock.runAll();

    const player = authority.simulation.state.players[client.playerId];
    expect(player.equippedMoves).toEqual(expect.objectContaining({ laser: 'hammer_throw', smash: 'titan_hammer' }));
    expect(client.lobbyState.members).toEqual([
      expect.objectContaining({ characterKey: 'sarge', kitChoices: { smash: 'titan_hammer' } }),
    ]);

    // A kit pick from another character's exclusive pool must be refused and
    // must not disturb the applied loadout.
    client.sendCharacter('sarge', { smash: 'potion_bath' });
    clock.runAll();
    expect(player.equippedMoves.smash).toBe('titan_hammer');
    expect(client.errors.some(error => /kit choice/i.test(error.message || ''))).toBe(true);
  });

  test('crossing a valid seeded doorway moves only that player and records shared room state', () => {
    const floorState = createNetworkFloorState({ matchSeed: 'door-test', floorSeed: 'door-test-floor' });
    const currentRoom = getCurrentNetworkRoom(floorState);
    const direction = Object.keys(currentRoom.doors).find(key => currentRoom.doors[key]);
    const nextRoom = getAdjacentNetworkRoom(floorState, currentRoom, direction);
    const state = new GameState({
      matchId: 'door-test',
      matchSeed: 'door-test',
      status: 'running',
      floorState,
      players: {
        p1: { id: 'p1', x: TEST_ROOM.width / 2, y: TEST_ROOM.height / 2, radius: 18, moveSpeed: 180, roomId: currentRoom.id },
        p2: { id: 'p2', x: TEST_ROOM.width / 2 + 40, y: TEST_ROOM.height / 2, radius: 18, moveSpeed: 180, roomId: currentRoom.id },
      },
    });
    const player = state.players.p1;
    const minimum = TEST_ROOM.wallThickness + player.radius;
    const inputs = { p1: { moveX: 0, moveY: 0 } };
    if (direction === 'n') { player.y = minimum; inputs.p1.moveY = -1; }
    if (direction === 's') { player.y = TEST_ROOM.height - minimum; inputs.p1.moveY = 1; }
    if (direction === 'e') { player.x = TEST_ROOM.width - minimum; inputs.p1.moveX = 1; }
    if (direction === 'w') { player.x = minimum; inputs.p1.moveX = -1; }

    createPlayerMovementSystem(TEST_ROOM)({ state, inputs, fixedDelta: 0.05 });

    expect(state.floorState.currentRoomId).toBe(currentRoom.id);
    expect(state.floorState.visitedRoomIds).toEqual(expect.arrayContaining([currentRoom.id, nextRoom.id]));
    expect(state.floorState.roomTransition).toEqual(expect.objectContaining({
      fromRoomId: currentRoom.id,
      toRoomId: nextRoom.id,
      direction,
      playerId: 'p1',
    }));
    expect(state.floorState.transitionsByPlayer.p1).toEqual(state.floorState.roomTransition);
    expect(state.players.p1.roomId).toBe(nextRoom.id);
    expect(state.players.p2.roomId).toBe(currentRoom.id);
  });

  test('authority blocks crossing a wall when the seeded room has no door', () => {
    const floorState = createNetworkFloorState({ matchSeed: 'wall-test', floorSeed: 'wall-test-floor' });
    const currentRoom = floorState.layout.rooms.find(room => Object.values(room.doors).some(open => !open));
    floorState.currentRoomId = currentRoom.id;
    const direction = Object.keys(currentRoom.doors).find(key => !currentRoom.doors[key]);
    expect(direction).toBeDefined();
    const player = { id: 'p1', x: TEST_ROOM.width / 2, y: TEST_ROOM.height / 2, radius: 18, moveSpeed: 180, roomId: currentRoom.id };
    const state = new GameState({ matchId: 'wall-test', status: 'running', floorState, players: { p1: player } });
    const minimum = TEST_ROOM.wallThickness + player.radius;
    const inputs = { p1: { moveX: 0, moveY: 0 } };
    if (direction === 'n') { player.y = minimum; inputs.p1.moveY = -1; }
    if (direction === 's') { player.y = TEST_ROOM.height - minimum; inputs.p1.moveY = 1; }
    if (direction === 'e') { player.x = TEST_ROOM.width - minimum; inputs.p1.moveX = 1; }
    if (direction === 'w') { player.x = minimum; inputs.p1.moveX = -1; }

    createPlayerMovementSystem(TEST_ROOM)({ state, inputs, fixedDelta: 0.05 });

    expect(state.floorState.currentRoomId).toBe(currentRoom.id);
    expect(player.x).toBeGreaterThanOrEqual(minimum);
    expect(player.y).toBeGreaterThanOrEqual(minimum);
    expect(player.x).toBeLessThanOrEqual(TEST_ROOM.width - minimum);
    expect(player.y).toBeLessThanOrEqual(TEST_ROOM.height - minimum);
  });

  test('authority applies status movement multipliers instead of trusting client speed', () => {
    const state = new GameState({
      matchId: 'zoom-test', status: 'running', tick: 10,
      floorState: createNetworkFloorState({ matchSeed: 'zoom', floorSeed: 'zoom-floor' }),
      players: {
        p1: {
          id: 'p1', x: 300, y: 350, radius: 18, moveSpeed: 100,
          roomId: 'unused', statusUntilTick: { mooggy_zoomies: 100 },
        },
      },
    });
    state.players.p1.roomId = state.floorState.currentRoomId;
    createPlayerMovementSystem(TEST_ROOM)({ state, inputs: { p1: { moveX: 1 } }, fixedDelta: 0.05 });
    // Campaign movement accelerates responsively rather than snapping straight
    // to the network command's top speed (500 * 0.7 = 350 on this first tick).
    expect(state.players.p1.x).toBeCloseTo(317.5);
    expect(state.players.p1.vx).toBeCloseTo(350);
  });

  test('runs one authority and two clients to compatible shared movement state', async () => {
    const harness = await createRunningHarness();
    const { clock, network, authority, clientA, clientB } = harness;
    expect(clientA.status).toBe('running');
    expect(clientB.status).toBe('running');
    expect(Object.keys(authority.simulation.state.players)).toHaveLength(2);
    expect(authority.simulation.state.floorState.layout.rooms.length).toBeGreaterThanOrEqual(8);
    expect(clientA.state.floorState).toEqual(authority.simulation.state.floorState);
    expect(authority.simulation.state.players[clientA.playerId].characterKey).toBe('thorn_knight');
    expect(authority.simulation.state.players[clientB.playerId].characterKey).toBe('metao');

    for (let repeat = 0; repeat < 12; repeat += 1) {
      clientA.sendInput({ moveX: 1, moveY: 0, aimDirection: 0 });
      clientB.sendInput({ moveX: -1, moveY: 0, aimDirection: Math.PI });
    }
    clock.runAll();
    authority.step(30);
    authority.sendFullCorrection();
    clock.runAll();

    const authoritativePlayers = authority.simulation.state.snapshot().players;
    expect(clientA.state.players).toEqual(authoritativePlayers);
    expect(clientB.state.players).toEqual(authoritativePlayers);
    expect(clientA.state).not.toBe(authority.simulation.state);
    expect(clientB.state).not.toBe(clientA.state);
    expect(authoritativePlayers[clientA.playerId].x).toBeGreaterThan(300);
    expect(authoritativePlayers[clientB.playerId].x).toBeLessThan(600);
    expect(clientA.lastAcknowledgedInput).toBeGreaterThanOrEqual(0);
    expect(clientB.lastAcknowledgedInput).toBeGreaterThanOrEqual(0);
    expect(network.getMetrics().dropped).toBeGreaterThan(0);
    expect(authority.metrics.snapshots).toBe(16);
  });

  test('rejects stale input sequences even when the envelope itself is new', async () => {
    const { clock, authority, clientA, clientATransport } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
    });
    clientA.sendInput({ moveX: 1 });
    clock.runAll();
    expect(authority.lastProcessedInput[clientA.playerId]).toBe(0);

    const stale = createEnvelope('PLAYER_INPUT', 10_000, 0, {
      inputSequence: 0,
      moveX: -1,
      moveY: 0,
      aimDirection: 0,
      buttons: 0,
    });
    clientATransport.send('authority', stale, getDeliveryIntent('PLAYER_INPUT'));
    clock.runAll();
    expect(authority.metrics.duplicateInputs).toBe(1);
    expect(authority.pendingInputs[clientA.playerId].moveX).toBe(1);
  });

  test('synchronizes authority-owned attacks, enemy death, and one drop to both clients', async () => {
    const { clock, authority, clientA, clientB } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });
    const enemy = Object.values(authority.simulation.state.enemies)[0];
    const player = authority.simulation.state.players[clientA.playerId];
    enemy.x = player.x + 100;
    enemy.y = player.y;
    enemy.moveSpeed = 0;

    clientA.sendAction('ATTACK', 0);
    clock.runAll();
    authority.step(12);
    clock.runAll();
    clientA.sendAction('ATTACK', 0);
    clock.runAll();
    authority.step(12);
    authority.sendFullCorrection();
    clock.runAll();

    expect(enemy.dead).toBe(true);
    expect(Object.values(authority.simulation.state.pickups)).toHaveLength(1);
    expect(clientA.state.enemies).toEqual(authority.simulation.state.enemies);
    expect(clientB.state.enemies).toEqual(authority.simulation.state.enemies);
    expect(clientA.state.pickups).toEqual(authority.simulation.state.pickups);
    expect(clientB.state.pickups).toEqual(authority.simulation.state.pickups);
    expect(clientA.gameplayEvents.filter(event => event.eventType === 'ENEMY_DEFEATED')).toHaveLength(1);
    expect(clientB.gameplayEvents.filter(event => event.eventType === 'PICKUP_SPAWNED')).toHaveLength(1);
    expect(authority.metrics.acceptedActions).toBe(2);
  });

  test('broadcasts one validated AOE and converges server-owned rocks on both clients', async () => {
    const { clock, authority, clientA, clientB } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });

    clientA.sendAbility('crimson_smash', Math.PI / 3);
    clock.runAll();
    authority.step(1);
    authority.sendFullCorrection();
    clock.runAll();

    const authorityRocks = Object.fromEntries(Object.entries(authority.simulation.state.projectiles)
      .filter(([, projectile]) => projectile.attackKind === 'crimson_smash'));
    expect(Object.keys(authorityRocks)).toHaveLength(8);
    expect(clientA.state.projectiles).toEqual(authority.simulation.state.projectiles);
    expect(clientB.state.projectiles).toEqual(authority.simulation.state.projectiles);
    const eventA = clientA.gameplayEvents.find(event => event.eventType === 'PLAYER_ABILITY_USED');
    const eventB = clientB.gameplayEvents.find(event => event.eventType === 'PLAYER_ABILITY_USED');
    expect(eventA).toEqual(eventB);
    expect(eventA.payload ?? eventA).toEqual(expect.objectContaining({
      data: expect.objectContaining({
        abilityId: 'crimson_smash',
        projectileIds: Object.keys(authorityRocks),
        spawnedProjectiles: expect.arrayContaining([
          expect.objectContaining({ id: Object.keys(authorityRocks)[0], kind: 'rock' }),
        ]),
      }),
    }));
  });

  test('converges persistent campaign ability entities on both clients', async () => {
    const { clock, authority, clientA, clientB } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });
    const player = authority.simulation.state.players[clientA.playerId];
    player.equippedMoves.smash = 'healing_zone';

    clientA.sendAbility('healing_zone', 0);
    clock.runAll();
    authority.step(2);
    authority.sendFullCorrection();
    clock.runAll();

    expect(Object.values(authority.simulation.state.abilityEntities)).toEqual([
      expect.objectContaining({ kind: 'healing_zone', ownerId: clientA.playerId }),
    ]);
    expect(clientA.state.abilityEntities).toEqual(authority.simulation.state.abilityEntities);
    expect(clientB.state.abilityEntities).toEqual(authority.simulation.state.abilityEntities);
  });

  test('routes the ordinary campaign chest and item pickup through authority state', async () => {
    const { clock, authority, clientA } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });
    const state = authority.simulation.state;
    const treasure = state.floorState.layout.rooms.find(room => room.type === 'treasure');
    const player = state.players[clientA.playerId];
    const startingKnifeCount = Number(player.items?.neo_knife || 0);
    player.roomId = treasure.id;
    player.x = 450;
    player.y = 350;
    authority.step(1);
    const chest = Object.values(state.interactables).find(item => item.kind === 'relic_chest');
    Object.assign(chest, { rewardType: 'item', rewardKey: 'neo_knife' });
    player.x = chest.x;
    player.y = chest.y;

    clientA.sendInteract(chest.id);
    clock.runAll();
    authority.step(1);
    authority.sendFullCorrection();
    clock.runAll();
    expect(chest.choiceType).toBe('');
    expect(chest.opened).toBe(true);
    authority.sendFullCorrection();
    clock.runAll();

    expect(state.players[clientA.playerId].items.neo_knife).toBe(startingKnifeCount + 1);
    expect(clientA.state.players[clientA.playerId].items.neo_knife).toBe(startingKnifeCount + 1);
    expect(clientA.receivedTypes).toEqual(expect.arrayContaining(['GAMEPLAY_EVENT', 'WORLD_SNAPSHOT']));
  });

  test('reserves a disconnected player and restores the same authority entity on reconnect', async () => {
    const { clock, network, authority, clientA, clientB } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
    });
    const originalPlayerId = clientB.playerId;
    const reconnectToken = clientB.reconnectToken;
    expect(network.disconnectPeer('client-b', 'test-disconnect')).toBe(true);
    clock.runAll();
    expect(authority.simulation.state.players[originalPlayerId]).toEqual(expect.objectContaining({ disconnected: true }));
    expect(clientA.state.players[originalPlayerId]).toBeUndefined();
    expect(clientA.receivedTypes).toContain('PLAYER_DISCONNECTED');

    const reconnected = new LocalMultiplayerClient({ transport: transport(network, 'client-b-returned', 'Client B') });
    reconnected.reconnectToken = reconnectToken;
    await reconnected.connect('GOFAST');
    clock.runAll();
    expect(reconnected.status).toBe('running');
    expect(reconnected.playerId).toBe(originalPlayerId);
    expect(authority.simulation.state.players[originalPlayerId]).toEqual(expect.objectContaining({ disconnected: false }));
    expect(reconnected.state.players[originalPlayerId].id).toBe(originalPlayerId);
  });

  test('broadcasts bounded authority chat to every connected player', async () => {
    const { clock, clientA, clientB } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });

    expect(clientA.sendChat('  Need\nhelp!  ')).toBe(true);
    clock.runAll();

    expect(clientA.chatMessages).toEqual([expect.objectContaining({
      playerId: clientA.playerId,
      displayName: 'Client A',
      text: 'Need help!',
    })]);
    expect(clientB.chatMessages).toEqual(clientA.chatMessages);
  });

  test('restarts the same room only after every connected player requests a rematch', async () => {
    const { clock, authority, clientA, clientB } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });
    const playerIds = [clientA.playerId, clientB.playerId];
    authority.simulation.state.status = 'ended';
    authority.pendingRunEnd = { result: 'defeat', reason: 'party-wiped', floorNumber: 3 };
    authority._broadcastRunEnded();
    clock.runAll();

    expect(clientA.status).toBe('ended');
    expect(clientA.runEnd).toEqual(expect.objectContaining({ result: 'defeat', reason: 'party-wiped' }));
    clientA.requestRematch(true);
    clock.runAll();
    expect(authority.simulation.state.status).toBe('ended');
    expect(clientA.lobbyState.members.find(member => member.playerId === clientA.playerId).rematchReady).toBe(true);

    clientB.requestRematch(true);
    clock.runAll();
    expect(authority.simulation.state.status).toBe('running');
    expect(clientA.status).toBe('running');
    expect(clientB.status).toBe('running');
    expect(Object.keys(authority.simulation.state.players)).toEqual(playerIds);
    expect(clientA.runEnd).toBeNull();
  });

  test('rejects an incompatible build before joining', async () => {
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({ clock });
    const authority = new LocalMultiplayerAuthority({ transport: transport(network, 'authority', 'Authority') });
    const client = new LocalMultiplayerClient({
      transport: transport(network, 'old-client', 'Old Client'),
      contentHash: 'old-content',
    });
    await authority.start();
    await client.connect('neo-local-room');
    clock.runAll();
    expect(client.status).toBe('rejected');
    expect(client.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'VERSION_MISMATCH' })]));
  });
});
