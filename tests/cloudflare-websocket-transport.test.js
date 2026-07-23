const {
  AUTHORITY_PEER_ID,
  SOCKET_HEARTBEAT_REQUEST,
  SOCKET_HEARTBEAT_RESPONSE,
  normalizeRoomCode,
  websocketUrl,
  CloudflareWebSocketTransport,
} = require('../js/multiplayer/CloudflareWebSocketTransport');

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, handler, options = {}) {
    const entries = this.listeners.get(type) || [];
    entries.push({ handler, once: options.once === true });
    this.listeners.set(type, entries);
  }

  emit(type, event = {}) {
    const entries = [...(this.listeners.get(type) || [])];
    entries.forEach(entry => entry.handler(event));
    this.listeners.set(type, entries.filter(entry => !entry.once));
  }

  open() {
    this.readyState = 1;
    this.emit('open');
  }

  send(value) {
    this.sent.push(value);
  }

  close(code = 1000, reason = '') {
    this.readyState = 3;
    this.emit('close', { code, reason });
  }
}

describe('CloudflareWebSocketTransport', () => {
  beforeEach(() => { FakeWebSocket.instances = []; });

  test('normalizes room codes and WebSocket URLs', () => {
    expect(normalizeRoomCode(' abcd ')).toBe('ABCD');
    expect(() => normalizeRoomCode('O0I1')).toThrow(/Room code/);
    expect(websocketUrl('https://game.example/api/multiplayer/rooms/ABCD/socket'))
      .toBe('wss://game.example/api/multiplayer/rooms/ABCD/socket');
  });

  test('creates a room through the Worker HTTP route', async () => {
    const fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ roomCode: 'ABC234', status: 'waiting', maxPlayers: 4 }),
    }));
    const transport = new CloudflareWebSocketTransport({
      apiBase: 'https://game.example/api/multiplayer',
      fetch,
      WebSocket: FakeWebSocket,
    });
    const created = await transport.createSession({ mode: 'rival', maxPlayers: 3 });
    expect(created).toEqual(expect.objectContaining({ roomCode: 'ABC234', sessionId: 'ABC234' }));
    expect(fetch).toHaveBeenCalledWith('https://game.example/api/multiplayer/rooms', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ mode: 'rival', maxPlayers: 3 });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  test('only reports availability after the multiplayer health route responds successfully', async () => {
    const fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, multiplayer: true }),
    }));
    const transport = new CloudflareWebSocketTransport({
      apiBase: 'https://game.example/api/multiplayer',
      fetch,
      WebSocket: FakeWebSocket,
    });

    await expect(transport.checkAvailability()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://game.example/api/multiplayer/health',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });

  test('reports unavailable when the health request cannot be fetched', async () => {
    const transport = new CloudflareWebSocketTransport({
      fetch: jest.fn(async () => { throw new TypeError('Failed to fetch'); }),
      WebSocket: FakeWebSocket,
    });
    await expect(transport.checkAvailability()).resolves.toBe(false);
  });

  test('joins, sends protocol envelopes, and emits authority messages', async () => {
    const transport = new CloudflareWebSocketTransport({
      apiBase: 'https://game.example/api/multiplayer',
      fetch: jest.fn(),
      WebSocket: FakeWebSocket,
    });
    const received = [];
    transport.onMessage((peerId, message, delivery) => received.push({ peerId, message, delivery }));
    const joining = transport.joinSession('ABC234');
    await Promise.resolve();
    await Promise.resolve();
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('wss://game.example/api/multiplayer/rooms/ABC234/socket');
    socket.open();
    await joining;

    const input = {
      protocolVersion: 1,
      type: 'PLAYER_INPUT',
      sequence: 1,
      tick: 0,
      payload: { inputSequence: 1, moveX: 1, moveY: 0, aimDirection: 0, buttons: 0 },
    };
    transport.send(AUTHORITY_PEER_ID, input, { reliability: 'unreliable', channel: 'simulation', replaceable: true });
    expect(JSON.parse(socket.sent[0])).toEqual(input);

    transport.sendHeartbeat();
    expect(socket.sent[1]).toBe(SOCKET_HEARTBEAT_REQUEST);
    socket.emit('message', { data: SOCKET_HEARTBEAT_RESPONSE });
    expect(received).toEqual([]);

    const pong = {
      protocolVersion: 1,
      type: 'PONG',
      sequence: 2,
      tick: 1,
      payload: { nonce: 'ping-1', clientTime: 10, serverTick: 1 },
    };
    socket.emit('message', { data: JSON.stringify(pong) });
    expect(received).toEqual([expect.objectContaining({
      peerId: AUTHORITY_PEER_ID,
      message: pong,
      delivery: { reliability: 'unreliable', channel: 'control', replaceable: true },
    })]);
  });
});
