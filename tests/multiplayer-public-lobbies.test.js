const fs = require('node:fs');
const path = require('node:path');
const {
  CloudflareWebSocketTransport,
  defaultApiBases,
} = require('../js/multiplayer/CloudflareWebSocketTransport');
const { createEnvelope } = require('../js/protocol/ProtocolV1');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('public and private multiplayer lobbies', () => {
  test('uses the current Wrangler origin before the separate-server fallback', () => {
    const previousLocation = global.location;
    Object.defineProperty(global, 'location', {
      configurable: true,
      value: {
        hostname: 'localhost',
        port: '8789',
        protocol: 'http:',
        origin: 'http://localhost:8789',
      },
    });
    try {
      expect(defaultApiBases()).toEqual([
        'http://localhost:8789/api/multiplayer',
        'http://localhost:8787/api/multiplayer',
      ]);
    } finally {
      if (previousLocation === undefined) delete global.location;
      else Object.defineProperty(global, 'location', { configurable: true, value: previousLocation });
    }
  });

  test('reuses a successfully probed fallback for later room requests', async () => {
    const previousLocation = global.location;
    Object.defineProperty(global, 'location', {
      configurable: true,
      value: {
        hostname: 'localhost',
        port: '5173',
        protocol: 'http:',
        origin: 'http://localhost:5173',
      },
    });
    CloudflareWebSocketTransport.resolvedApiBase = '';
    const fetch = jest.fn(async url => new Response(JSON.stringify(
      String(url).startsWith('http://localhost:8787')
        ? { ok: true, multiplayer: true }
        : { error: 'Not found' },
    ), {
      status: String(url).startsWith('http://localhost:8787') ? 200 : 404,
      headers: { 'Content-Type': 'application/json' },
    }));
    try {
      const probe = new CloudflareWebSocketTransport({ fetch, WebSocket: function FakeWebSocket() {} });
      await expect(probe.checkAvailability()).resolves.toBe(true);
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        'http://localhost:5173/api/multiplayer/health',
        'http://localhost:8787/api/multiplayer/health',
      ]);
      const next = new CloudflareWebSocketTransport({ fetch, WebSocket: function FakeWebSocket() {} });
      expect(next.apiBase).toBe('http://localhost:8787/api/multiplayer');
    } finally {
      CloudflareWebSocketTransport.resolvedApiBase = '';
      if (previousLocation === undefined) delete global.location;
      else Object.defineProperty(global, 'location', { configurable: true, value: previousLocation });
    }
  });

  test('offers an earth/lock visibility toggle and a public lobby browser', () => {
    const html = read('index.html');
    const controller = read('js/ui/controller.js');
    const styles = read('css/style.css');

    expect(html).toMatch(/id="multiplayerVisibilityToggle"[^>]*data-visibility="public"/);
    expect(html).toMatch(/id="multiplayerVisibilityIcon"[^>]*>🌐</);
    expect(html).toMatch(/id="multiplayerPublicLobbyList"[^>]*role="list"/);
    expect(html).toMatch(/id="coopLobbyVisibility"[^>]*data-visibility="private"/);
    expect(controller).toContain('function setMultiplayerVisibilityChoice(visibility)');
    expect(controller).toContain('async function refreshPublicLobbies()');
    expect(controller).toContain("session.joinRoom(room.roomCode)");
    expect(styles).toContain('.multiplayer-public-lobby');
  });

  test('sends explicit visibility on create and loads only public room descriptors', async () => {
    const requests = [];
    const fetch = jest.fn(async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (options.method === 'POST') {
        return new Response(JSON.stringify({
          roomCode: 'NYKE42',
          visibility: 'public',
          status: 'waiting',
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        rooms: [
          { roomCode: 'NYKE42', visibility: 'public', players: 1, maxPlayers: 4 },
          { roomCode: 'HIDE42', visibility: 'private', players: 1, maxPlayers: 4 },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const transport = new CloudflareWebSocketTransport({
      apiBase: 'https://game.example/api/multiplayer',
      fetch,
      WebSocket: function FakeWebSocket() {},
    });

    await transport.createSession({ mode: 'coop', visibility: 'public' });
    const createBody = JSON.parse(requests[0].options.body);
    expect(createBody.visibility).toBe('public');

    const rooms = await transport.listPublicSessions({ limit: 7 });
    expect(requests[1].url).toBe('https://game.example/api/multiplayer/rooms?limit=7');
    expect(rooms).toEqual([
      { roomCode: 'NYKE42', visibility: 'public', players: 1, maxPlayers: 4 },
    ]);
  });

  test('defaults legacy create calls to private and carries visibility in lobby state', async () => {
    let createBody;
    const transport = new CloudflareWebSocketTransport({
      apiBase: 'https://game.example/api/multiplayer',
      fetch: async (_url, options) => {
        createBody = JSON.parse(options.body);
        return new Response(JSON.stringify({ roomCode: 'SAFE42' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      },
      WebSocket: function FakeWebSocket() {},
    });
    await transport.createSession();
    expect(createBody.visibility).toBe('private');

    expect(() => createEnvelope('LOBBY_STATE', 1, 0, {
      status: 'waiting',
      members: [],
      minPlayers: 1,
      maxPlayers: 4,
      mode: 'coop',
      visibility: 'public',
    })).not.toThrow();
    expect(() => createEnvelope('LOBBY_STATE', 1, 0, {
      status: 'waiting',
      members: [],
      minPlayers: 1,
      maxPlayers: 4,
      mode: 'coop',
      visibility: 'friends',
    })).toThrow(/visibility/);
  });

  test('indexes only public rooms and rechecks joinability through room authorities', () => {
    const server = read('server/server.js');

    expect(server).toContain("const PUBLIC_ROOM_INDEX_PREFIX = 'multiplayer:public-room:'");
    expect(server).toContain("room?.visibility !== 'public'");
    expect(server).toContain("path === '/multiplayer/rooms' && request.method === 'GET'");
    expect(server).toContain("room.visibility !== 'public' || room.joinable !== true");
    expect(server).toContain('PUBLIC_ROOM_CANDIDATE_LIMIT');
    expect(server).toContain('{ expirationTtl: PUBLIC_ROOM_INDEX_TTL_SECONDS }');
  });
});
