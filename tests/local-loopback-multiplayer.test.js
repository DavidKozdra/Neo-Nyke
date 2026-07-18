const {
  VirtualNetworkClock,
  LocalLoopbackNetwork,
  LocalLoopbackTransport,
} = require('../js/multiplayer/LocalLoopbackTransport');
const {
  LocalMultiplayerAuthority,
  LocalMultiplayerClient,
} = require('../js/multiplayer/LocalMultiplayerSession');
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
    expect(authority.metrics.snapshots).toBe(15);
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
