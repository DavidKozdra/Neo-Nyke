const fs = require('node:fs');
const path = require('node:path');

describe('Durable Object daily usage controls', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server/server.js'), 'utf8');
  const wrangler = fs.readFileSync(path.join(__dirname, '..', 'wrangler.toml'), 'utf8');

  test('uses hibernatable sockets and restores socket identity attachments', () => {
    expect(server).toContain('this.ctx.acceptWebSocket(server)');
    expect(server).toContain('helloAccepted: false');
    expect(server).toContain('joined: false');
    expect(server).toContain('deserializeAttachment?.()');
    expect(server).toContain('async webSocketMessage(socket, message)');
    expect(server).toContain('setWebSocketAutoResponse');
    expect(server).not.toContain('server.accept()');
  });

  test('runs the 20 Hz timer only for an active match with authenticated players', () => {
    expect(server).toContain("this.authority.simulation.state.status !== 'running'");
    expect(server).toContain('this.authority.playerIdByPeer.size === 0');
    expect(server).toContain('const ACTIVE_PLAYER_IDLE_TIMEOUT_MS = 5 * 60 * 1000');
    expect(server).toContain("this.transport.disconnectPeer(peerId, 'idle-timeout')");
    expect(server).toContain('const MAX_ACTIVE_MATCH_SECONDS = 4 * 60 * 60');
    expect(server).toContain("this.authority.endMatch?.('match-time-limit')");
    expect(server).toContain('syncTicking()');
    expect(server).toContain('stopTicking()');
  });

  test('debounces checkpoints and expires empty rooms with bounded alarms', () => {
    expect(server).toContain('const CHECKPOINT_INTERVAL_TICKS = 20 * 15');
    expect(server).toContain('const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000');
    expect(server).toContain('const ABANDONED_LOBBY_TTL_MS = 5 * 60 * 1000');
    expect(server).toContain('tick - this.lastCheckpointTick < CHECKPOINT_INTERVAL_TICKS');
    expect(server).toContain('this.authority.persistenceRevision !== previousPersistenceRevision');
    expect(server).not.toContain("currentStatus !== 'running' || currentStatus !== previousStatus");
    expect(server).toContain('await this.ctx.storage.deleteAll()');
    expect(server).not.toContain('state.tick % 20 === 0');
  });

  test('caps pending sockets and rejects oversized traffic before JSON parsing', () => {
    expect(server).toContain('sockets.length >= room.maxPlayers');
    expect(server).toContain('const SOCKET_HANDSHAKE_TIMEOUT_MS = 15_000');
    expect(server).toContain("typeof data === 'string' && data.length > MAX_CLIENT_MESSAGE_BYTES");
    expect(server.indexOf("data.length > MAX_CLIENT_MESSAGE_BYTES"))
      .toBeLessThan(server.indexOf("const message = JSON.parse"));
    expect(server).toContain('MAX_SOCKET_MESSAGES_PER_SECOND');
    expect(server).toContain('MAX_SOCKET_BYTES_PER_SECOND');
  });

  test('serializes each authority broadcast only once', () => {
    expect(server).toContain('const serialized = JSON.stringify(message)');
    expect(server).toContain('this.sendSerialized(peerId, serialized)');
  });

  test('keeps handshake state in socket attachments instead of writing a checkpoint', () => {
    expect(server).toContain('attachment.helloAccepted === true');
    expect(server).toContain('socket.serializeAttachment({ ...attachment, helloAccepted: true })');
    expect(server).toContain('&& this.authority.persistenceRevision !== previousPersistenceRevision');
    expect(server).toContain("initialAttachment?.joined !== true && !this.authority");
    expect(server).toContain('if (wasJoined) await this.persistCheckpoint({ force: true })');
  });

  test('serves room information from compact checkpoint metadata while hibernated', () => {
    expect(server).toContain('connectedPlayers: this.authority.playerIdByPeer.size');
    expect(server).toContain("const checkpoint = await this.ctx.storage.get('checkpoint')");
    expect(server).toContain("joinable: status === 'waiting' && players < room.maxPlayers");
  });

  test('does not construct an authority for room creation or bare socket admission', () => {
    const initializeRoom = server.slice(
      server.indexOf('async initializeRoom(request)'),
      server.indexOf('async roomInfo()'),
    );
    const openSocket = server.slice(
      server.indexOf('async openSocket(request)'),
      server.indexOf('ensureTicking()'),
    );
    expect(initializeRoom).not.toContain('ensureStarted');
    expect(initializeRoom).not.toContain('persistCheckpoint');
    expect(openSocket).not.toContain('ensureStarted');
    expect(server).toContain('deferFloorGeneration: true');
  });

  test('rejects invalid socket upgrades before invoking the Durable Object', () => {
    const workerRoomRoute = server.slice(
      server.indexOf("const roomRoute = path.match"),
      server.indexOf('// ── GET /health'),
    );
    expect(workerRoomRoute.indexOf("request.headers.get('Upgrade')"))
      .toBeLessThan(workerRoomRoute.indexOf('const stub = getRoomStub'));
  });

  test('uses Cloudflare-backed rate limiting in addition to isolate-local caps', () => {
    expect(wrangler).toContain('name = "MULTIPLAYER_CREATE_LIMITER"');
    expect(wrangler).toContain('name = "MULTIPLAYER_SOCKET_LIMITER"');
    expect(server).toContain('distributedRateLimit(env.MULTIPLAYER_CREATE_LIMITER, ip)');
    expect(server).toContain('distributedRateLimit(env.MULTIPLAYER_SOCKET_LIMITER, ip)');
  });

  test('bounds room-creation bodies before parsing JSON', () => {
    expect(server).toContain('const MAX_ROOM_CREATE_BYTES = 2 * 1024');
    expect(server).toContain('async function readBoundedJson');
    expect(server.indexOf('new TextEncoder().encode(text).byteLength > maxBytes'))
      .toBeLessThan(server.indexOf('const parsed = JSON.parse(text)'));
  });
});
