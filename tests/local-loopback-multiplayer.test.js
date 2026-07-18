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
    expect(authority.simulation.state.players[client.playerId]).toEqual(expect.objectContaining({ maxHealth: 90, health: 90, moveSpeed: 165 }));
    expect(client.lobbyState.members).toEqual([
      expect.objectContaining({ playerId: client.playerId, characterKey: 'sarge', ready: false }),
    ]);
  });

  test('crossing a valid seeded doorway transitions the entire party authoritatively', () => {
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

    expect(state.floorState.currentRoomId).toBe(nextRoom.id);
    expect(state.floorState.visitedRoomIds).toEqual(expect.arrayContaining([currentRoom.id, nextRoom.id]));
    expect(state.floorState.roomTransition).toEqual(expect.objectContaining({
      fromRoomId: currentRoom.id,
      toRoomId: nextRoom.id,
      direction,
    }));
    expect(Object.values(state.players).every(member => member.roomId === nextRoom.id)).toBe(true);
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

  test('cleans up a disconnected player and notifies the remaining client', async () => {
    const { clock, network, authority, clientA, clientB } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
    });
    expect(network.disconnectPeer('client-b', 'test-disconnect')).toBe(true);
    clock.runAll();
    expect(authority.simulation.state.players[clientB.playerId]).toBeUndefined();
    expect(clientA.state.players[clientB.playerId]).toBeUndefined();
    expect(clientA.receivedTypes).toContain('PLAYER_DISCONNECTED');
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
