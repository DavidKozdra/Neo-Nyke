const {
  VirtualNetworkClock,
  LocalLoopbackNetwork,
  LocalLoopbackTransport,
} = require('../js/multiplayer/LocalLoopbackTransport');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
const { NetworkGameView } = require('../js/rendering/NetworkGameView');

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

  test('serializes each directional link when a bandwidth cap is configured', async () => {
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({ bytesPerSecond: 1_000, clock });
    const host = transport(network, 'host', 'Host');
    const client = transport(network, 'client', 'Client');
    await host.createSession({ sessionId: 'BANDWIDTH' });
    await client.joinSession('BANDWIDTH');
    const received = [];
    host.onMessage((_peerId, message) => received.push({ value: message.value, at: clock.now() }));

    client.send('host', { value: 'large', payload: 'x'.repeat(980) }, { reliability: 'reliable', channel: 'control' });
    client.send('host', { value: 'small' }, { reliability: 'reliable', channel: 'control' });

    clock.advanceBy(900);
    expect(received).toEqual([]);
    clock.runAll();

    expect(received.map(entry => entry.value)).toEqual(['large', 'small']);
    expect(received[0].at).toBeGreaterThanOrEqual(1_000);
    expect(received[1].at).toBeGreaterThan(received[0].at);
  });

  test('drops queued replaceable snapshots in favor of the newest state', async () => {
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({ bytesPerSecond: 1_000, clock });
    const host = transport(network, 'host', 'Host');
    const client = transport(network, 'client', 'Client');
    await host.createSession({ sessionId: 'LATEST' });
    await client.joinSession('LATEST');
    const received = [];
    host.onMessage((_peerId, message) => received.push(message.sequence));

    client.send('host', { sequence: 1, payload: 'x'.repeat(900) }, { reliability: 'unreliable', channel: 'snapshot', replaceable: true });
    client.send('host', { sequence: 2, payload: 'x'.repeat(900) }, { reliability: 'unreliable', channel: 'snapshot', replaceable: true });
    clock.runAll();

    expect(received).toEqual([2]);
    expect(network.getMetrics()).toEqual(expect.objectContaining({ superseded: 1, delivered: 1 }));
  });
});

describe('protocol-driven local multiplayer session', () => {
  test('keeps Death Ball charging until the client sends button-up', async () => {
    const { clock, authority, clientA } = await createRunningHarness({
      latencyMs: 0,
      jitterMs: 0,
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
    });
    const player = authority.simulation.state.players[clientA.playerId];
    player.equippedMoves.smash = 'death_ball';

    // This is the exact client ordering: held input is sent before the action.
    clientA.sendInput({ moveX: 0, moveY: 0, aimDirection: 0, buttons: 2 });
    clientA.sendAbility('death_ball', 0);
    clock.runAll();
    authority.step(1);

    expect(player.heldCharge).toEqual(expect.objectContaining({ moveKey: 'death_ball', heldSeen: true }));
    expect(Object.values(authority.simulation.state.projectiles)
      .some(projectile => projectile.kind === 'death_ball')).toBe(false);

    clientA.sendInput({ moveX: 0, moveY: 0, aimDirection: 0, buttons: 0 });
    clock.runAll();
    authority.step(1);

    expect(player.heldCharge).toBeNull();
    expect(Object.values(authority.simulation.state.projectiles)
      .some(projectile => projectile.kind === 'death_ball')).toBe(true);
  });

  test('defers floor generation until an admitted lobby actually starts', async () => {
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({ clock });
    const authority = new LocalMultiplayerAuthority({
      transport: transport(network, 'authority', 'Authority'),
      minPlayers: 1,
      deferFloorGeneration: true,
    });
    const client = new LocalMultiplayerClient({
      transport: transport(network, 'client-a', 'Client A'),
    });
    await authority.start();
    await client.connect('neo-local-room');
    clock.runAll();

    expect(authority.simulation.state.status).toBe('waiting');
    expect(authority.simulation.state.floorState.layout.rooms).toEqual([]);

    client.sendReady(true);
    clock.runAll();

    expect(authority.simulation.state.status).toBe('running');
    expect(authority.simulation.state.floorState.layout.rooms.length).toBeGreaterThan(0);
    expect(client.state.floorState).toEqual(authority.simulation.state.floorState);
  });

  test('starts a one-player Boss Rush lobby with the authoritative game mode', async () => {
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({ clock });
    const authority = new LocalMultiplayerAuthority({
      transport: transport(network, 'authority', 'Authority'),
      mode: 'boss_rush', minPlayers: 1, deferFloorGeneration: true,
    });
    const client = new LocalMultiplayerClient({ transport: transport(network, 'client-a', 'Client A') });
    await authority.start();
    await client.connect('neo-local-room');
    clock.runAll();
    client.sendReady(true);
    clock.runAll();
    authority.step(1);

    expect(authority.mode).toBe('boss_rush');
    expect(authority.simulation.state.matchRules).toEqual(expect.objectContaining({ mode: 'boss_rush', gameMode: 'boss_rush' }));
    expect(authority.simulation.state.floorState.layout.rooms).toHaveLength(1);
    expect(authority.simulation.state.floorNumber).toBe(5);
  });

  test('keeps lobby slots stable and reports intentional leaves versus dropped connections', async () => {
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({ clock });
    const authority = new LocalMultiplayerAuthority({
      transport: transport(network, 'authority', 'Authority'),
      minPlayers: 4,
      maxPlayers: 4,
    });
    const clientA = new LocalMultiplayerClient({ transport: transport(network, 'client-a', 'Client A') });
    const clientB = new LocalMultiplayerClient({ transport: transport(network, 'client-b', 'Client B') });
    const clientC = new LocalMultiplayerClient({ transport: transport(network, 'client-c', 'Client C') });
    await authority.start();
    await clientA.connect('neo-local-room');
    await clientB.connect('neo-local-room');
    await clientC.connect('neo-local-room');
    clock.runAll();

    expect(clientA.lobbyState.members.map(member => member.slotIndex)).toEqual([0, 1, 2]);
    await clientB.leave('left');
    clock.runAll();
    expect(clientA.lobbyState.members.map(member => member.slotIndex)).toEqual([0, 2]);
    expect(clientA.connectionNotices.at(-1)).toEqual(expect.objectContaining({
      displayName: 'Client B', kind: 'left', slotIndex: 1,
    }));

    const clientD = new LocalMultiplayerClient({ transport: transport(network, 'client-d', 'Client D') });
    await clientD.connect('neo-local-room');
    clock.runAll();
    expect(clientA.lobbyState.members.map(member => member.slotIndex)).toEqual([0, 1, 2]);
    expect(clientA.lobbyState.members.find(member => member.displayName === 'Client C').slotIndex).toBe(2);
    expect(clientA.lobbyState.members.find(member => member.displayName === 'Client D').slotIndex).toBe(1);

    expect(network.disconnectPeer('client-c', 'socket-1006')).toBe(true);
    clock.runAll();
    expect(clientA.connectionNotices.at(-1)).toEqual(expect.objectContaining({
      displayName: 'Client C', kind: 'disconnected', slotIndex: 2,
    }));
  });

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
    // Loss may now cause a targeted full-resync in addition to the scheduled
    // snapshots; it must never remove the normal publication cadence.
    expect(authority.metrics.snapshots).toBeGreaterThanOrEqual(16);
  });

  test('sends entity deltas between periodic full correction snapshots', async () => {
    const { clock, authority, clientA, clientATransport } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });
    const snapshots = [];
    clientATransport.onMessage((_peerId, message) => {
      if (message.type === 'WORLD_SNAPSHOT') snapshots.push(message.payload);
    });
    authority.sendFullCorrection();
    clock.runAll();
    expect(snapshots.at(-1)).toEqual(expect.objectContaining({
      full: true,
      floorState: expect.objectContaining({ layout: expect.objectContaining({ rooms: expect.any(Array) }) }),
      bossState: null,
      bossStateChanged: true,
    }));
    authority.simulation.state.players[clientA.playerId].x += 1;
    authority._publishSnapshot(false);
    clock.runAll();

    const delta = snapshots.at(-1);
    expect(delta.full).toBe(false);
    expect(delta.entities.players).toEqual({});
    expect(delta.packedDynamic.packed.players).toHaveLength(2);
    expect(delta.entities.enemies).toEqual({});
    expect(delta.floorState).toBeNull();
    expect(clientA.state.players[clientA.playerId].x).toBe(authority.simulation.state.players[clientA.playerId].x);
  });

  test('full correction repairs divergent floor-owned pot state', async () => {
    const { clock, authority, clientA, clientATransport } = await createRunningHarness({
      latencyMs: 0, jitterMs: 0, unreliablePacketLoss: 0, duplicateMessageRate: 0,
    });
    const snapshots = [];
    clientATransport.onMessage((_peerId, message) => {
      if (message.type === 'WORLD_SNAPSHOT') snapshots.push(message.payload);
    });
    const roomId = authority.simulation.state.players[clientA.playerId].roomId;
    const authorityRoom = authority.simulation.state.floorState.layout.rooms
      .find(room => room.id === roomId);
    const clientRoom = clientA.state.floorState.layout.rooms
      .find(room => room.id === roomId);
    authorityRoom.destructibles = [{
      id: 'desynced-pot', kind: 'pot', x: 380, y: 350,
      r: 12, hp: 0, maxHp: 1, broken: true,
    }];
    clientRoom.destructibles = [{
      id: 'desynced-pot', kind: 'pot', x: 380, y: 350,
      r: 12, hp: 1, maxHp: 1, broken: false,
    }];

    authority.sendFullCorrection();
    clock.runAll();

    expect(snapshots.at(-1)).toEqual(expect.objectContaining({
      full: true,
      floorState: expect.objectContaining({ layout: expect.any(Object) }),
    }));
    expect(clientA.state.floorState.layout.rooms
      .find(room => room.id === roomId).destructibles[0]).toEqual(expect.objectContaining({
      id: 'desynced-pot', hp: 0, broken: true,
    }));
  });

  test('acknowledges snapshots and repairs a coalesced delta with a scoped full resync', async () => {
    const { clock, authority, clientA, clientB, clientATransport, clientBTransport } = await createRunningHarness({
      latencyMs: 0, jitterMs: 0, unreliablePacketLoss: 0, duplicateMessageRate: 0,
    });
    const clientASnapshots = [];
    const clientBSnapshots = [];
    clientATransport.onMessage((_peerId, message) => {
      if (message.type === 'WORLD_SNAPSHOT') clientASnapshots.push(message.payload);
    });
    clientBTransport.onMessage((_peerId, message) => {
      if (message.type === 'WORLD_SNAPSHOT') clientBSnapshots.push(message.payload);
    });
    authority.sendFullCorrection();
    clock.runAll();
    expect(authority.lastSnapshotAckByPeer.get(clientATransport.identity.id)).toBe(0);
    expect(authority.lastSnapshotAckByPeer.get(clientBTransport.identity.id)).toBe(0);

    // Model one missed replaceable delta for client A. The recovery request
    // must not force client B through a full correction or reset its sequence.
    clientA._onMessage('authority', createEnvelope('WORLD_SNAPSHOT', 900, authority.simulation.state.tick, {
      snapshotSequence: 2,
      baselineSequence: 1,
      serverTick: authority.simulation.state.tick,
      full: false,
      lastProcessedInput: {},
      entities: {},
      removedEntityIds: [],
      floorState: null,
      bossState: null,
      bossStateChanged: false,
    }), getDeliveryIntent('WORLD_SNAPSHOT'));
    clock.runAll();

    expect(authority.metrics.snapshotResyncs).toBe(1);
    expect(authority.metrics.snapshotAcks).toBeGreaterThanOrEqual(3);
    expect(clientA.pendingSnapshotResync).toBe(false);
    expect(clientA.state.players).toEqual(authority.simulation.state.snapshot().players);
    expect(clientASnapshots.at(-1)).toEqual(expect.objectContaining({ full: true, snapshotSequence: 1 }));
    expect(clientBSnapshots.map(snapshot => snapshot.snapshotSequence)).toEqual([0]);
  });

  test('rebases concurrent deltas onto their acknowledged snapshot without a full resync', async () => {
    const { clock, authority, clientA } = await createRunningHarness({
      latencyMs: 0, jitterMs: 0, unreliablePacketLoss: 0, duplicateMessageRate: 0,
    });
    authority.sendFullCorrection();
    clock.runAll();
    const playerId = clientA.playerId;
    const baselineX = clientA.state.players[playerId].x;
    const delta = (snapshotSequence, entities) => createEnvelope(
      'WORLD_SNAPSHOT',
      900 + snapshotSequence,
      authority.simulation.state.tick,
      {
        snapshotSequence,
        baselineSequence: 0,
        serverTick: authority.simulation.state.tick + snapshotSequence,
        full: false,
        lastProcessedInput: { [playerId]: clientA.lastAcknowledgedInput },
        entities,
        removedEntityIds: [],
        floorState: null,
        bossState: null,
        bossStateChanged: false,
      },
    );

    clientA._onMessage('authority', delta(1, {
      players: { [playerId]: { ...clientA.state.players[playerId], x: baselineX + 10 } },
    }), getDeliveryIntent('WORLD_SNAPSHOT'));
    expect(clientA.state.players[playerId].x).toBe(baselineX + 10);

    // Sequence 2 was also authored from sequence 0. An empty delta therefore
    // means the position reverted to the baseline; layering it over sequence 1
    // would incorrectly leave the +10 movement behind.
    clientA._onMessage('authority', delta(2, {}), getDeliveryIntent('WORLD_SNAPSHOT'));

    expect(clientA.latestSnapshotSequence).toBe(2);
    expect(clientA.state.players[playerId].x).toBe(baselineX);
    expect(clientA.pendingSnapshotResync).toBe(false);
    expect(clientA.diagnostics.resyncRequests).toBe(0);
  });

  test('packs steady-state local-room projectile transforms and restores them on the client', async () => {
    const { clock, authority, clientA, clientATransport } = await createRunningHarness({
      latencyMs: 0, jitterMs: 0, unreliablePacketLoss: 0, duplicateMessageRate: 0,
    });
    const snapshots = [];
    clientATransport.onMessage((_peerId, message) => {
      if (message.type === 'WORLD_SNAPSHOT') snapshots.push(message.payload);
    });
    const player = authority.simulation.state.players[clientA.playerId];
    const projectile = {
      id: 'packed-projectile', roomId: player.roomId, kind: 'death_ball',
      x: player.x, y: player.y, vx: 240, vy: 0, radius: 24,
      hp: 0, hostile: false, expiresTick: authority.simulation.state.tick + 40,
    };
    authority.simulation.state.projectiles[projectile.id] = projectile;
    // New entities include one complete bootstrap record.
    authority._publishSnapshot(false);
    clock.runAll();
    expect(clientA.state.projectiles[projectile.id]).toEqual(expect.objectContaining({ kind: 'death_ball', x: player.x }));

    projectile.x += 12.5;
    authority._publishSnapshot(false);
    clock.runAll();
    const delta = snapshots.at(-1);
    expect(delta.entities.projectiles).toEqual({});
    expect(delta.packedDynamic.packed.projectiles).toHaveLength(1);
    expect(clientA.state.projectiles[projectile.id]).toEqual(expect.objectContaining({ x: 12.5 + player.x, kind: 'death_ball' }));
  });

  test('carries a complete authority enemy update into one persistent physical multiplayer corpse', async () => {
    const { clock, authority, clientA, clientATransport } = await createRunningHarness({
      latencyMs: 0, jitterMs: 0, unreliablePacketLoss: 0, duplicateMessageRate: 0,
    });
    const snapshots = [];
    clientATransport.onMessage((_peerId, message) => {
      if (message.type === 'WORLD_SNAPSHOT') snapshots.push(message.payload);
    });
    const player = authority.simulation.state.players[clientA.playerId];
    const enemy = {
      id: 'corpse-proof-enemy', roomId: player.roomId, type: 'hunter',
      x: player.x + 90, y: player.y, vx: 0, vy: 0, radius: 20,
      health: 80, maxHealth: 80, dead: false, spawnTick: authority.simulation.state.tick,
    };
    authority.simulation.state.enemies[enemy.id] = enemy;
    // Bootstrap the enemy, then send a normal changed-enemy delta. Enemy state
    // stays complete on the wire so campaign rendering never has to merge a
    // new transform with stale health, death, or animation fields.
    authority._publishSnapshot(false);
    clock.runAll();
    enemy.health = 0;
    enemy.dead = true;
    enemy.deathTick = authority.simulation.state.tick;
    enemy._lastHitAngle = 0;
    authority._publishSnapshot(false);
    clock.runAll();

    const killDelta = snapshots.at(-1);
    expect(killDelta.entities.enemies[enemy.id]).toEqual(expect.objectContaining({
      health: 0, maxHealth: 80, dead: true, deathTick: enemy.deathTick, _lastHitAngle: 0,
    }));
    expect(killDelta.packedDynamic.packed.enemies.length).toBeGreaterThan(0);

    expect(clientA.state.enemies[enemy.id]).toEqual(expect.objectContaining({
      health: 0, maxHealth: 80, dead: true, deathTick: enemy.deathTick, _lastHitAngle: 0,
    }));

    const neo = { ensureStatuses: jest.fn(), getEnemySpriteKey: source => source.type };
    const view = new NetworkGameView({ session: {}, neo });
    view._syncNeoPresentationFloor(clientA.state.floorState, clientA.state.enemies, {}, clientA.state);
    const body = neo.deadBodies[0];
    expect(body).toEqual(expect.objectContaining({
      x: enemy.x, y: enemy.y, vx: expect.any(Number), vz: expect.any(Number),
      angularV: expect.any(Number), z: 0,
    }));
    expect(body.vx).toBeGreaterThan(0);
    expect(body.vz).toBeGreaterThan(0);

    // Run the real campaign corpse updater against the body created from the
    // multiplayer snapshot. A later snapshot must retain its fall/slide state
    // rather than redraw the standing enemy sprite.
    const corpseRuntime = {
      deadBodies: neo.deadBodies,
      CORPSE_FALL_TIME: 0.45,
      CORPSE_LIFETIME: 11,
      clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    };
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '..', 'js', 'game', 'world.js'), 'utf8'),
      { Neo: corpseRuntime, Math, globalThis: {} },
    );
    const { x: fallenX, z: fallenZ, angularOffset: fallenAngle } = body;
    corpseRuntime.updateDeadBodies(1 / 60);
    expect(body.x).toBeGreaterThan(fallenX);
    expect(body.z).toBeGreaterThan(fallenZ);
    expect(body.angularOffset).not.toBe(fallenAngle);
    const simulatedBody = { x: body.x, z: body.z, angularOffset: body.angularOffset };
    authority._publishSnapshot(false);
    clock.runAll();
    view._syncNeoPresentationFloor(clientA.state.floorState, clientA.state.enemies, {}, clientA.state);

    expect(neo.deadBodies[0]).toBe(body);
    expect(neo.deadBodies[0]).toEqual(expect.objectContaining({
      ...simulatedBody,
    }));
  });

  test('does not send another room\'s projectile corrections to this client', async () => {
    const { clock, authority, clientA, clientATransport } = await createRunningHarness({
      latencyMs: 0, jitterMs: 0, unreliablePacketLoss: 0, duplicateMessageRate: 0,
    });
    const snapshots = [];
    clientATransport.onMessage((_peerId, message) => {
      if (message.type === 'WORLD_SNAPSHOT') snapshots.push(message.payload);
    });
    const player = authority.simulation.state.players[clientA.playerId];
    const otherRoom = authority.simulation.state.floorState.layout.rooms
      .find(room => room.id !== player.roomId).id;
    authority.simulation.state.projectiles.remote = {
      id: 'remote', roomId: otherRoom, kind: 'fireball', x: 300, y: 300,
      vx: 100, vy: 0, radius: 7, hostile: true, expiresTick: authority.simulation.state.tick + 40,
    };
    authority._publishSnapshot(false);
    clock.runAll();
    authority.simulation.state.projectiles.remote.x += 5;
    authority._publishSnapshot(false);
    clock.runAll();

    const delta = snapshots.at(-1);
    expect(delta.entities.projectiles).toEqual({});
    expect(delta.packedDynamic.packed.projectiles).toEqual([]);
    expect(clientA.state.projectiles.remote).toBeUndefined();
  });

  test('bootstraps entities entering room interest and removes them when they leave', async () => {
    const { clock, authority, clientA, clientATransport } = await createRunningHarness({
      latencyMs: 0, jitterMs: 0, unreliablePacketLoss: 0, duplicateMessageRate: 0,
    });
    const snapshots = [];
    clientATransport.onMessage((_peerId, message) => {
      if (message.type === 'WORLD_SNAPSHOT') snapshots.push(message.payload);
    });
    const player = authority.simulation.state.players[clientA.playerId];
    const otherRoom = authority.simulation.state.floorState.layout.rooms
      .find(room => room.id !== player.roomId).id;
    const projectile = {
      id: 'interest-crossing', roomId: otherRoom, kind: 'death_ball',
      x: 240, y: 260, vx: 100, vy: 0, radius: 22, damage: 30,
      hostile: true, expiresTick: authority.simulation.state.tick + 100,
    };
    authority.simulation.state.projectiles[projectile.id] = projectile;
    authority._publishSnapshot(false);
    clock.runAll();
    expect(clientA.state.projectiles[projectile.id]).toBeUndefined();

    projectile.roomId = player.roomId;
    authority._publishSnapshot(false);
    clock.runAll();
    expect(snapshots.at(-1).entities.projectiles[projectile.id]).toEqual(expect.objectContaining({
      kind: 'death_ball', damage: 30, roomId: player.roomId,
    }));
    expect(clientA.state.projectiles[projectile.id]).toEqual(expect.objectContaining({
      kind: 'death_ball', damage: 30,
    }));

    projectile.roomId = otherRoom;
    authority._publishSnapshot(false);
    clock.runAll();
    expect(snapshots.at(-1).removedEntityIds).toContain(projectile.id);
    expect(clientA.state.projectiles[projectile.id]).toBeUndefined();
  });

  test('cleans protocol bookkeeping when a handshake-only peer disconnects', async () => {
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({ clock });
    const authority = new LocalMultiplayerAuthority({
      transport: transport(network, 'authority', 'Authority'),
    });
    const peer = transport(network, 'handshake-only', 'Handshake Only');
    await authority.start();
    await peer.initialize();
    await peer.joinSession('neo-local-room');
    peer.send('authority', createEnvelope('CLIENT_HELLO', 0, 0, {
      buildVersion: authority.buildVersion,
      generationVersion: authority.generationVersion,
      contentHash: authority.contentHash,
      requestedIdentityProvider: 'guest',
    }), getDeliveryIntent('CLIENT_HELLO'));
    peer.send('authority', createEnvelope('PING', 1, 0, {
      nonce: 'handshake-ping',
      clientTime: 1,
    }), getDeliveryIntent('PING'));
    clock.runAll();

    expect(authority.peerRecords.has('handshake-only')).toBe(true);
    expect(authority.seenReliableSequences.has('handshake-only')).toBe(true);
    expect(authority.lastReplaceableSequence.has('handshake-only|PING')).toBe(true);

    await peer.leaveSession('left');
    clock.runAll();

    expect(authority.peerRecords.has('handshake-only')).toBe(false);
    expect(authority.seenReliableSequences.has('handshake-only')).toBe(false);
    expect(authority.invalidMessageCount.has('handshake-only')).toBe(false);
    expect(Array.from(authority.lastReplaceableSequence.keys()))
      .not.toEqual(expect.arrayContaining([expect.stringMatching(/^handshake-only\|/)]));
  });

  test('exports and restores authority peer runtime required after hibernation', async () => {
    const { authority, clientA, clientB } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
    });
    const runtime = authority.exportRuntimeCheckpoint();
    const clock = new VirtualNetworkClock();
    const network = new LocalLoopbackNetwork({ clock });
    const restored = new LocalMultiplayerAuthority({ transport: transport(network, 'restored-authority', 'Authority') });
    restored.simulation.state = GameState.deserialize(authority.simulation.serialize());

    expect(restored.restoreRuntimeCheckpoint(runtime)).toBe(true);
    expect(restored.playerIdByPeer.get('client-a')).toBe(clientA.playerId);
    expect(restored.playerIdByPeer.get('client-b')).toBe(clientB.playerId);
    expect(restored.peerRecords.get('client-a')).toEqual(expect.objectContaining({ playerId: clientA.playerId }));
    expect(restored.lastProcessedInput).toEqual(authority.lastProcessedInput);
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
    expect(Object.values(authority.simulation.state.pickups).reduce((total, pickup) => total + pickup.value, 0)).toBe(5);
    expect(clientA.state.enemies).toEqual(authority.simulation.state.enemies);
    expect(clientB.state.enemies).toEqual(authority.simulation.state.enemies);
    expect(clientA.state.pickups).toEqual(authority.simulation.state.pickups);
    expect(clientB.state.pickups).toEqual(authority.simulation.state.pickups);
    expect(clientA.gameplayEvents.filter(event => event.eventType === 'ENEMY_DEFEATED')).toHaveLength(1);
    expect(clientB.gameplayEvents.filter(event => event.eventType === 'PICKUP_SPAWNED')).toHaveLength(5);
    expect(authority.metrics.acceptedActions).toBe(2);
  });

  test('echoes a local prediction id through the authoritative attack result', async () => {
    const { clock, authority, clientA } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });
    clientA.sendAction('ATTACK', 0, { predictionId: 'predicted:attack-7', originServerTick: authority.simulation.state.tick });
    clock.runAll();
    authority.step(1);
    clock.runAll();

    expect(clientA.gameplayEvents.find(event => event.eventType === 'PLAYER_ATTACKED')).toEqual(expect.objectContaining({
      data: expect.objectContaining({ predictionId: 'predicted:attack-7' }),
    }));
  });

  test('uses only the bounded co-op authority transform history for a delayed sweep', async () => {
    const { clock, authority, clientA } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });
    const player = authority.simulation.state.players[clientA.playerId];
    const enemy = Object.values(authority.simulation.state.enemies)[0];
    enemy.x = player.x + 100;
    enemy.y = player.y;
    enemy.moveSpeed = 0;
    authority._rememberStateForValidation();
    const originTick = authority.simulation.state.tick;
    enemy.x = player.x + 500;
    const before = enemy.health;

    clientA.sendAction('ATTACK', 0, { predictionId: 'predicted:rewind', originServerTick: originTick });
    clock.runAll();
    authority.step(1);

    expect(enemy.health).toBeLessThan(before);
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

    clientA.sendInput({ moveX: 0, moveY: 0, aimDirection: 0, buttons: 2 });
    clientA.sendAbility('healing_zone', 0);
    clock.runAll();
    authority.step(1);
    clientA.sendInput({ moveX: 0, moveY: 0, aimDirection: 0, buttons: 0 });
    clock.runAll();
    authority.step(1);
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
    expect(reconnected.reconnectToken).not.toBe(reconnectToken);
  });

  test('atomically transfers an active player to a replacement tab and rotates its credential', async () => {
    const { clock, network, authority, clientB } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });
    const playerId = clientB.playerId;
    const oldToken = clientB.reconnectToken;
    const replacement = new LocalMultiplayerClient({
      transport: transport(network, 'client-b-new-tab', 'Client B'),
      reconnectToken: oldToken,
    });

    await replacement.connect('GOFAST');
    clock.runAll();

    expect(replacement.status).toBe('running');
    expect(replacement.playerId).toBe(playerId);
    expect(replacement.reconnectToken).not.toBe(oldToken);
    expect(authority.playerIdByPeer.get('client-b-new-tab')).toBe(playerId);
    expect(authority.playerIdByPeer.has('client-b')).toBe(false);
    expect(authority.simulation.state.players[playerId]).toEqual(expect.objectContaining({
      peerId: 'client-b-new-tab',
      disconnected: false,
    }));
  });

  test('removes an intentional leaver immediately instead of reserving a player slot', async () => {
    const { clock, authority, clientA, clientB } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });
    const playerId = clientB.playerId;
    const reconnectToken = clientB.reconnectToken;

    await clientB.leave('left');
    clock.runAll();

    expect(authority.simulation.state.players[playerId]).toBeUndefined();
    expect(authority.reconnectReservations.has(reconnectToken)).toBe(false);
    expect(clientA.state.players[playerId]).toBeUndefined();
    expect(clientA.connectionNotices.at(-1)).toEqual(expect.objectContaining({
      playerId,
      kind: 'left',
    }));
  });

  test('ends a running authority match cleanly at a server-enforced time limit', async () => {
    const { clock, authority, clientA, clientB } = await createRunningHarness({
      unreliablePacketLoss: 0,
      duplicateMessageRate: 0,
      jitterMs: 0,
    });

    expect(authority.endMatch('match-time-limit')).toBe(true);
    clock.runAll();

    expect(authority.simulation.state.status).toBe('ended');
    expect(clientA.runEnd).toEqual(expect.objectContaining({ reason: 'match-time-limit' }));
    expect(clientB.runEnd).toEqual(expect.objectContaining({ reason: 'match-time-limit' }));
    expect(authority.endMatch('duplicate')).toBe(false);
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
