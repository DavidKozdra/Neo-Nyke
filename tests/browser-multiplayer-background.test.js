const { NetworkTransport } = require('../js/multiplayer/NetworkTransport');
const { createEnvelope, getDeliveryIntent } = require('../js/protocol/ProtocolV1');
const {
  HEARTBEAT_INTERVAL_MS,
  BrowserMultiplayerSession,
} = require('../js/multiplayer/BrowserMultiplayerSession');
const { RECONNECT_RESERVATION_TICKS } = require('../js/multiplayer/LocalMultiplayerSession');
const { createMemoryStorage } = require('../Koz_Engine_Lib/Multiplayer/resumeStore');

class FakeCloudflareTransport extends NetworkTransport {
  constructor() {
    super({ identity: { provider: 'guest', id: 'browser-test', displayName: 'Browser Test' } });
    this.authorityPeerId = 'cloudflare-authority';
    this.joinCount = 0;
    this.sent = [];
    this.rawHeartbeats = 0;
    this.socket = { readyState: 1 };
  }

  async joinSession(sessionId) {
    this.joinCount += 1;
    this.sessionId = sessionId;
    this.socket = { readyState: 1 };
    return { sessionId, authorityPeerId: this.authorityPeerId };
  }

  send(peerId, message, delivery) {
    if (this.socket.readyState !== 1) throw new Error('socket unavailable');
    this.sent.push({ peerId, message, delivery });
    return { queued: true, dropped: false };
  }

  sendHeartbeat() {
    this.rawHeartbeats += 1;
    return true;
  }

  emitAuthority(type, sequence, payload) {
    this._emit('message', this.authorityPeerId, createEnvelope(type, sequence, 0, payload), getDeliveryIntent(type));
  }

  disconnect(reason = 'socket-1006') {
    this.socket.readyState = 3;
    this._emit('peerDisconnected', {
      provider: 'account', id: this.authorityPeerId, displayName: 'Neo Nyke Authority',
    }, reason);
  }

  async leaveSession() {
    this.socket.readyState = 3;
    this.sessionId = null;
  }
}

describe('browser multiplayer background connection recovery', () => {
  const originalDocument = global.document;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
  });

  async function connectedSession() {
    const transport = new FakeCloudflareTransport();
    const session = new BrowserMultiplayerSession({ transport });
    await session.joinRoom('ABC234');
    transport.emitAuthority('JOIN_ACCEPTED', 1, {
      matchId: 'match-1', sessionId: 'ABC234', playerId: 'player-1', reconnectToken: 'resume-token',
    });
    await Promise.resolve();
    return { transport, session };
  }

  test('sends protocol heartbeats even outside the gameplay input loop', async () => {
    const { transport, session } = await connectedSession();
    session.client.status = 'running';
    transport.sent.length = 0;

    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);

    expect(transport.sent.map(entry => entry.message.type)).toContain('PING');
    expect(transport.rawHeartbeats).toBe(0);
    session.dispose();
  });

  test('uses raw hibernation heartbeats and pauses reconnects while hidden', async () => {
    global.document = {
      hidden: true,
      visibilityState: 'hidden',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    const { transport, session } = await connectedSession();
    session.client.status = 'running';
    transport.sent.length = 0;

    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(transport.rawHeartbeats).toBe(1);
    expect(transport.sent.map(entry => entry.message.type)).not.toContain('PING');

    transport.disconnect('idle-timeout');
    expect(session.reconnectPausedUntilWake).toBe(true);
    expect(session.reconnectTimer).toBeNull();

    global.document.hidden = false;
    global.document.visibilityState = 'visible';
    session._handleConnectionWake();
    await jest.advanceTimersByTimeAsync(0);

    expect(transport.joinCount).toBe(2);
    session.dispose();
  });

  test('keeps a suspended player reservation for thirty minutes', () => {
    expect(RECONNECT_RESERVATION_TICKS).toBe(20 * 60 * 30);
  });

  test('an active-tab wake bypasses a throttled reconnect delay', async () => {
    const { transport, session } = await connectedSession();
    transport.disconnect();
    expect(session.reconnectTimer).not.toBeNull();

    session._handleConnectionWake();
    await jest.advanceTimersByTimeAsync(0);

    expect(transport.joinCount).toBe(2);
    expect(session.reconnectAttempts).toBe(0);
    session.dispose();
  });

  test('opts into correlated diagnostics and exports a privacy-safe trace', async () => {
    const { transport, session } = await connectedSession();
    session.client.status = 'running';
    transport.sent.length = 0;

    const enabled = session.enableDiagnostics(true);
    expect(enabled.diagnosticSessionId).toEqual(expect.any(String));
    expect(transport.sent.at(-1).message).toEqual(expect.objectContaining({
      type: 'DIAGNOSTIC_MARKER',
      payload: expect.objectContaining({ enabled: true }),
    }));

    transport.emitAuthority('PONG', 20, {
      nonce: 'diag-ping',
      clientTime: Date.now() - 42,
      serverTick: 8,
      serverTime: Date.now(),
    });
    const report = session.exportDiagnostics();
    expect(report).toEqual(expect.objectContaining({
      schemaVersion: 1,
      diagnosticSessionId: enabled.diagnosticSessionId,
      metrics: expect.objectContaining({ enabled: true, rttMs: expect.any(Number) }),
    }));
    expect(report.roomCode).toBeUndefined();
    session.dispose();
  });

  test('survives a document handoff with a persisted and rotated resume credential', async () => {
    const storage = createMemoryStorage();
    const firstTransport = new FakeCloudflareTransport();
    const first = new BrowserMultiplayerSession({
      transport: firstTransport,
      storage,
      tabCoordinator: false,
    });
    await first.joinRoom('ABC234');
    firstTransport.emitAuthority('JOIN_ACCEPTED', 1, {
      matchId: 'match-1',
      sessionId: 'ABC234',
      playerId: 'player-1',
      reconnectToken: 'first-token',
    });
    await Promise.resolve();
    expect(BrowserMultiplayerSession.peekResumeDescriptor({ storage })).toEqual(expect.objectContaining({
      roomId: 'ABC234',
      resumeToken: 'first-token',
    }));
    first.dispose('tab-handoff');

    const nextTransport = new FakeCloudflareTransport();
    const next = new BrowserMultiplayerSession({
      transport: nextTransport,
      storage,
      tabCoordinator: false,
    });
    await next.resumeLastSession();
    const join = nextTransport.sent.find(entry => entry.message.type === 'JOIN_MATCH');
    expect(join.message.payload.reconnectToken).toBe('first-token');
    nextTransport.emitAuthority('JOIN_ACCEPTED', 2, {
      matchId: 'match-1',
      sessionId: 'ABC234',
      playerId: 'player-1',
      reconnectToken: 'rotated-token',
    });
    await Promise.resolve();
    expect(BrowserMultiplayerSession.peekResumeDescriptor({ storage }).resumeToken).toBe('rotated-token');
    next.dispose('left');
    expect(BrowserMultiplayerSession.peekResumeDescriptor({ storage })).toBeNull();
  });
});
