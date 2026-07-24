const {
  NetworkTransport,
  normalizeDeliveryOptions,
  assertTransport,
} = require('../Koz_Engine_Lib/Multiplayer/networkTransport');
const {
  DIRECTIONS,
  createProtocolMap,
} = require('../Koz_Engine_Lib/Multiplayer/protocolMap');
const {
  normalizeSessionDescriptor,
  redactSessionDescriptor,
} = require('../Koz_Engine_Lib/Multiplayer/sessionDescriptor');
const {
  createMemoryStorage,
  createResumeStore,
} = require('../Koz_Engine_Lib/Multiplayer/resumeStore');
const { createTabCoordinator } = require('../Koz_Engine_Lib/Multiplayer/tabCoordinator');
const { createResilientSession } = require('../Koz_Engine_Lib/Multiplayer/resilientSession');
const { SequenceWindow } = require('../Koz_Engine_Lib/Multiplayer/sequenceWindow');
const {
  createEntityDelta,
  applyEntityDelta,
} = require('../Koz_Engine_Lib/Multiplayer/entityDelta');
const { PeerRateLimiter } = require('../Koz_Engine_Lib/Multiplayer/rateLimiter');
const {
  createAuthorityCheckpoint,
  restoreAuthorityCheckpoint,
} = require('../Koz_Engine_Lib/Multiplayer/authorityCheckpoint');
const {
  createDurableObjectAdapter,
} = require('../Koz_Engine_Lib/Multiplayer/Platforms/Cloudflare/durableObjectAdapter');

describe('Koz multiplayer engine extraction', () => {
  test('provides a provider-neutral transport contract', () => {
    const transport = new NetworkTransport({
      identity: { provider: 'platform', id: 'player-1', displayName: 'Player One' },
    });
    expect(assertTransport(transport)).toBe(transport);
    expect(transport.getLocalIdentity()).toEqual({
      provider: 'platform', id: 'player-1', displayName: 'Player One',
    });
    expect(normalizeDeliveryOptions({
      reliability: 'unreliable', channel: 'movement', replaceable: true,
    })).toEqual({
      reliability: 'unreliable', channel: 'movement', replaceable: true,
    });
  });

  test('maps host commands to versioned wire messages without owning game schemas', () => {
    const protocol = createProtocolMap({ protocolVersion: 3 }).register('move', {
      wireType: 'PLAYER_INPUT',
      direction: DIRECTIONS.CLIENT_TO_AUTHORITY,
      delivery: { reliability: 'unreliable', channel: 'input', replaceable: true },
      encode: value => ({ x: value.x / 10 }),
      decode: value => ({ x: value.x * 10 }),
      validate: value => Number.isFinite(value.x),
    });
    const encoded = protocol.encode('move', { x: 5 });
    expect(encoded).toEqual({
      type: 'PLAYER_INPUT', protocolVersion: 3, messageVersion: 1, payload: { x: 0.5 },
    });
    expect(protocol.decode(encoded)).toEqual(expect.objectContaining({
      name: 'move',
      payload: { x: 5 },
    }));
    expect(protocol.deliveryFor('move')).toEqual({
      reliability: 'unreliable', channel: 'input', replaceable: true,
    });
  });

  test('persists compatible resumable descriptors and removes expired credentials', () => {
    let now = 1_000;
    const storage = createMemoryStorage();
    const store = createResumeStore({ storage, now: () => now });
    const saved = store.save({
      roomId: 'ABC234',
      playerId: 'player-1',
      resumeToken: 'secret-token',
      buildVersion: 'build-a',
      expiresAt: 2_000,
    });
    expect(store.load({ roomId: 'ABC234', buildVersion: 'build-a' })).toEqual(saved);
    expect(redactSessionDescriptor(saved).resumeToken).toBe('[redacted]');
    now = 2_001;
    expect(store.load()).toBeNull();
    expect(storage.getItem('koz.multiplayer.resume.v1')).toBeNull();
  });

  test('rejects malformed descriptors before they reach storage', () => {
    expect(() => normalizeSessionDescriptor({ roomId: 'ABC234' })).toThrow('resumeToken');
  });

  test('deduplicates reliable messages and replaces stale channel updates', () => {
    const window = new SequenceWindow({ limit: 8 });
    expect(window.accept(4)).toBe(true);
    expect(window.accept(4)).toBe(false);
    expect(window.accept(8, { channel: 'movement', replaceable: true })).toBe(true);
    expect(window.accept(7, { channel: 'movement', replaceable: true })).toBe(false);
    const restored = new SequenceWindow().restore(window.snapshot());
    expect(restored.accept(4)).toBe(false);
    expect(restored.accept(9, { channel: 'movement', replaceable: true })).toBe(true);
  });

  test('builds and applies collection-agnostic entity deltas', () => {
    const before = {
      players: { p1: { id: 'p1', hp: 10 }, p2: { id: 'p2', hp: 8 } },
      enemies: { e1: { id: 'e1', hp: 3 } },
    };
    const after = {
      players: { p1: { id: 'p1', hp: 9 } },
      enemies: { e1: { id: 'e1', hp: 3 }, e2: { id: 'e2', hp: 5 } },
    };
    const delta = createEntityDelta({
      previous: before,
      current: after,
      collections: ['players', 'enemies'],
      sequence: 4,
      tick: 20,
    });
    const target = JSON.parse(JSON.stringify(before));
    applyEntityDelta(target, delta);
    expect(target).toEqual(after);
    expect(delta.removedEntityIds).toEqual(['p2']);
  });

  test('bounds abusive peers with independent message and byte budgets', () => {
    let now = 0;
    const limiter = new PeerRateLimiter({
      messagesPerSecond: 2,
      bytesPerSecond: 10,
      burstSeconds: 1,
      now: () => now,
    });
    expect(limiter.accept('peer-1', 5)).toBe(true);
    expect(limiter.accept('peer-1', 5)).toBe(true);
    expect(limiter.accept('peer-1', 1)).toBe(false);
    now = 1_000;
    expect(limiter.accept('peer-1', 10)).toBe(true);
  });

  test('uses a shared storage lease when Web Locks are unavailable', async () => {
    const storage = createMemoryStorage();
    const first = createTabCoordinator({ storage, tabId: 'tab-a' });
    const second = createTabCoordinator({ storage, tabId: 'tab-b' });
    expect(await first.acquire('ABC234')).toBe(true);
    expect(await second.acquire('ABC234')).toBe(false);
    first.release();
    expect(await second.acquire('ABC234')).toBe(true);
    first.dispose();
    second.dispose();
  });

  test('composes resume storage and tab ownership around a host session', async () => {
    const storage = createMemoryStorage();
    const resumeStore = createResumeStore({ storage });
    const coordinator = createTabCoordinator({ storage, tabId: 'session-tab' });
    let applied = null;
    const controller = createResilientSession({
      resumeStore,
      coordinator,
      applyDescriptor: value => { applied = value; },
      connect: async roomId => ({ roomId }),
    });
    resumeStore.save({ roomId: 'ROOM42', resumeToken: 'resume-me' });
    await expect(controller.connect('ROOM42')).resolves.toEqual({ roomId: 'ROOM42' });
    expect(applied.resumeToken).toBe('resume-me');
    await controller.disconnect('left');
    expect(resumeStore.load()).toBeNull();
    controller.dispose();
  });

  test('wraps authority state in a versioned compatibility checkpoint', () => {
    const checkpoint = createAuthorityCheckpoint({
      kind: 'example-game',
      revision: 12,
      compatibility: { contentHash: 'abc' },
      state: { tick: 30 },
      runtime: { peers: [['peer-1', 'player-1']] },
      now: () => 500,
    });
    expect(restoreAuthorityCheckpoint(checkpoint, {
      kind: 'example-game',
      isCompatible: value => value.contentHash === 'abc',
    })).toEqual(expect.objectContaining({
      revision: 12,
      state: { tick: 30 },
      runtime: { peers: [['peer-1', 'player-1']] },
    }));
  });

  test('adapts hibernatable sockets and checkpoint storage without game dependencies', async () => {
    const stored = new Map();
    const socket = {
      serializeAttachment: jest.fn(value => { socket.attachment = value; }),
      deserializeAttachment: jest.fn(() => socket.attachment),
    };
    const context = {
      acceptWebSocket: jest.fn(),
      getWebSockets: jest.fn(() => [socket]),
      storage: {
        get: async key => stored.get(key),
        put: async (key, value) => stored.set(key, value),
        delete: async key => stored.delete(key),
        setAlarm: jest.fn(),
        deleteAlarm: jest.fn(),
      },
    };
    const adapter = createDurableObjectAdapter({ context, webSocketTags: ['room'] });
    adapter.acceptSocket(socket, { peerId: 'peer-1', joined: true });
    expect(context.acceptWebSocket).toHaveBeenCalledWith(socket, ['room']);
    expect(adapter.listSockets()[0].attachment).toEqual(expect.objectContaining({
      peerId: 'peer-1', joined: true,
    }));
    await adapter.writeCheckpoint({ tick: 40 });
    expect(await adapter.readCheckpoint()).toEqual({ tick: 40 });
  });
});
