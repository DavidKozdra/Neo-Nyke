import '../js/simulation/RandomService.js';
import '../js/simulation/GameState.js';
import '../js/simulation/GameSimulation.js';
import '../js/multiplayer/NetworkTransport.js';
import '../js/protocol/ProtocolV1.js';
import '../js/multiplayer/LocalMultiplayerSession.js';

// Cloudflare Worker — NeoNyke backend
// Bindings required (wrangler.toml):
//   KV namespace: STORE
//   Cron trigger: "0 0 * * 1" (weekly seed reset)

const MAX_FLOOR = 10_000;
const MAX_TIME  = 86_400;
const COMPETITIVE_WIN_FLOOR = 10;
const VALID_CHARACTERS = new Set(['thorn_knight', 'metao', 'gelleh', 'granialla', 'mooggy']);
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4,8}$/;
const MULTIPLAYER_ROOM_LIMIT = 4;
const ROOM_TICK_INTERVAL_MS = 50;

const multiplayerApi = globalThis.NeoNyke?.multiplayer || {};
const protocolApi = globalThis.NeoNyke?.protocol || {};
const { NetworkTransport } = multiplayerApi;
const { MultiplayerRoomAuthority } = multiplayerApi;
const { getDeliveryIntent } = protocolApi;

function normalizeRoomCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

function createRoomCode(randomValues = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))) {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[randomValues[index] % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

function getRoomStub(env, roomCode) {
  if (!env?.MULTIPLAYER_ROOMS) return null;
  return env.MULTIPLAYER_ROOMS.getByName(roomCode);
}

class DurableObjectRoomTransport extends NetworkTransport {
  constructor(roomCode) {
    super({ identity: { provider: 'account', id: 'cloudflare-authority', displayName: 'Neo Nyke Authority' } });
    this.roomCode = roomCode;
    this.peers = new Map();
  }

  async createSession(options = {}) {
    if (!this.initialized) await this.initialize();
    this.sessionId = String(options.sessionId || this.roomCode);
    return { sessionId: this.sessionId, authorityPeerId: this.identity.id };
  }

  async joinSession() {
    throw new Error('The Durable Object transport is authority-only');
  }

  attach(peerId, socket, identity) {
    this.peers.set(peerId, { socket, identity });
    this._emit('peerConnected', identity);
  }

  receive(peerId, data) {
    const message = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
    this._emit('message', peerId, message, getDeliveryIntent(message.type));
  }

  detach(peerId, reason = 'disconnected') {
    const peer = this.peers.get(peerId);
    if (!peer) return false;
    this.peers.delete(peerId);
    this._emit('peerDisconnected', peer.identity, reason);
    return true;
  }

  send(peerId, message) {
    const peer = this.peers.get(String(peerId));
    if (!peer || peer.socket.readyState !== 1) throw new Error(`Room peer is unavailable: ${peerId}`);
    peer.socket.send(JSON.stringify(message));
    return { queued: true, dropped: false };
  }

  broadcast(message) {
    const results = [];
    this.peers.forEach((_peer, peerId) => {
      try { results.push(this.send(peerId, message)); } catch { /* disconnect cleanup handles stale sockets */ }
    });
    return results;
  }

  getPeerIdentity(peerId) {
    const identity = this.peers.get(String(peerId))?.identity;
    return identity ? { ...identity } : null;
  }

  disconnectPeer(peerId, reason = 'authority-disconnect') {
    const peer = this.peers.get(String(peerId));
    if (!peer) return false;
    try { peer.socket.close(1008, String(reason).slice(0, 96)); } catch { /* already closed */ }
    return this.detach(String(peerId), reason);
  }
}

export class MultiplayerRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.roomCode = normalizeRoomCode(ctx.id?.name) || 'UNKNOWN';
    this.transport = new DurableObjectRoomTransport(this.roomCode);
    this.authority = new MultiplayerRoomAuthority({
      transport: this.transport,
      sessionId: this.roomCode,
      matchId: `cloudflare-${this.roomCode}`,
      matchSeed: `cloudflare-${this.roomCode}`,
      minPlayers: 2,
      maxPlayers: MULTIPLAYER_ROOM_LIMIT,
    });
    this.startPromise = null;
    this.tickTimer = null;
  }

  async ensureStarted() {
    if (!this.startPromise) this.startPromise = this.authority.start();
    await this.startPromise;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/initialize' && request.method === 'POST') return this.initializeRoom();
    if (url.pathname === '/info' && request.method === 'GET') return this.roomInfo();
    if (url.pathname === '/socket' && request.method === 'GET') return this.openSocket(request);
    return json({ error: 'Room route not found' }, 404);
  }

  async initializeRoom() {
    const existing = await this.ctx.storage.get('room');
    if (existing) return json({ error: 'Room code collision' }, 409);
    const room = {
      roomCode: this.roomCode,
      createdAt: Date.now(),
      maxPlayers: MULTIPLAYER_ROOM_LIMIT,
      status: 'waiting',
    };
    await this.ctx.storage.put('room', room);
    await this.ensureStarted();
    return json(room, 201);
  }

  async roomInfo() {
    const room = await this.ctx.storage.get('room');
    if (!room) return json({ error: 'Room not found' }, 404);
    return json({
      ...room,
      status: this.authority.simulation.state.status,
      players: this.authority.playerIdByPeer.size,
      joinable: this.authority.simulation.state.status === 'waiting'
        && this.authority.playerIdByPeer.size < MULTIPLAYER_ROOM_LIMIT,
    });
  }

  async openSocket(request) {
    const room = await this.ctx.storage.get('room');
    if (!room) return json({ error: 'Room not found' }, 404);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'Expected WebSocket upgrade' }, 426);
    }
    if (this.authority.playerIdByPeer.size >= MULTIPLAYER_ROOM_LIMIT) {
      return json({ error: 'Room is full' }, 409);
    }
    await this.ensureStarted();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const peerId = `guest-${crypto.randomUUID()}`;
    const identity = { provider: 'guest', id: peerId, displayName: `Player ${this.transport.peers.size + 1}` };
    this.transport.attach(peerId, server, identity);
    server.addEventListener('message', event => {
      try {
        this.transport.receive(peerId, event.data);
      } catch {
        this.transport.disconnectPeer(peerId, 'invalid-message');
      }
    });
    server.addEventListener('close', event => this.transport.detach(peerId, event.reason || `socket-${event.code}`));
    server.addEventListener('error', () => this.transport.detach(peerId, 'socket-error'));
    this.ensureTicking();
    return new Response(null, { status: 101, webSocket: client });
  }

  ensureTicking() {
    if (this.tickTimer !== null) return;
    this.tickTimer = setInterval(() => {
      if (this.transport.peers.size === 0) {
        clearInterval(this.tickTimer);
        this.tickTimer = null;
        return;
      }
      this.authority.step(1);
    }, ROOM_TICK_INTERVAL_MS);
  }
}

const NOTICES = [
  {
    id: 'kiah-birthday',
    type: 'birthday',
    mmdd: '04-06',
    title: "Happy Birthday, Kiah!",
    body: "Wishing you an amazing day from everyone in the dungeon. 🎂",
    icon: '🎂',
    accent: '#f47ebd',
  },
  {
    id: 'christmas',
    type: 'holiday',
    mmdd: '12-25',
    title: "Merry Christmas!",
    body: "The dungeon is decorated. May your runs be merry and your loot be plentiful.",
    icon: '🎄',
    accent: '#4caf50',
  },
  {
    id: 'festival-of-lights',
    type: 'holiday',
    mmdd: '12-01',
    mmddEnd: '12-08',
    title: "Festival of Lights",
    body: "The halls of the dungeon glow bright. Happy Hanukkah to all!",
    icon: '🕎',
    accent: '#4fc3f7',
  },
  {
    id: 'update-gaming-branch',
    type: 'update',
    date: '2026-05-16',
    title: "GAMING Branch — What's New",
    body: "Birthday cards, inventory pause fix, shop affordability colours, and 2× health HUD. More to come.",
    icon: '📋',
    accent: '#a8c8ff',
  },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Build a JSON HTTP response with shared API headers.
 *
 * @param {unknown} data Payload to serialize as JSON.
 * @param {number} [status=200] HTTP status code.
 * @returns {Response} JSON response object.
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}

/**
 * Compute current competitive season boundaries.
 * Seasons reset weekly at Monday 00:00 UTC.
 *
 * @param {number} [now=Date.now()] Epoch milliseconds used for calculation.
 * @returns {{seasonId: string, resetAt: string}} Current season metadata.
 */
function getSeasonInfo(now = Date.now()) {
  const date = new Date(now);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const seasonStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday, 0, 0, 0, 0);
  const resetAt = seasonStart + 7 * 24 * 60 * 60 * 1000;
  return {
    seasonId: new Date(seasonStart).toISOString().slice(0, 10),
    resetAt: new Date(resetAt).toISOString(),
  };
}

/**
 * Read current competitive seed from KV.
 * If no seed exists yet, generate and persist one.
 *
 * @param {{STORE: {get: Function, put: Function}}} env Worker environment bindings.
 * @returns {Promise<string>} Seed string.
 */
async function getSeed(env) {
  const val = await env.STORE.get('seed');
  if (val) return val;
  // First run — generate and persist a seed
  const seed = String(Math.floor(Math.random() * 1_000_000_000));
  await env.STORE.put('seed', seed);
  return seed;
}

/**
 * Load leaderboard entries from KV.
 *
 * @param {{STORE: {get: Function}}} env Worker environment bindings.
 * @returns {Promise<Array<object>>} Parsed leaderboard entries.
 */
async function getLeaderboard(env) {
  const val = await env.STORE.get('leaderboard');
  const entries = val ? JSON.parse(val) : [];
  return Array.isArray(entries) ? entries.filter(isEligibleLeaderboardEntry) : [];
}

function isEligibleLeaderboardEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.result !== 'win') return false;
  const floorNum = Number(entry.floor);
  const timeNum = Number(entry.time);
  return Number.isInteger(floorNum)
    && floorNum >= COMPETITIVE_WIN_FLOOR
    && floorNum <= MAX_FLOOR
    && Number.isFinite(timeNum)
    && timeNum >= 0
    && timeNum <= MAX_TIME;
}

/**
 * Persist leaderboard entries to KV.
 *
 * @param {{STORE: {put: Function}}} env Worker environment bindings.
 * @param {Array<object>} leaderboard Entries sorted by ranking rules.
 * @returns {Promise<void>}
 */
async function putLeaderboard(env, leaderboard) {
  await env.STORE.put('leaderboard', JSON.stringify(leaderboard));
}

// Simple in-memory rate limiter per CF isolate (resets on cold start).
// For production-grade limiting, use Cloudflare Rate Limiting rules in the dashboard.
const hits = new Map();

/**
 * In-isolate request limiter keyed by route and client identifier.
 *
 * @param {string} key Rate limit bucket key.
 * @param {number} max Maximum requests allowed in the current window.
 * @param {number} windowMs Window size in milliseconds.
 * @returns {boolean} True when request is allowed.
 */
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const entry = hits.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count++;
  hits.set(key, entry);
  return entry.count <= max;
}

/**
 * Main router for all API endpoints.
 *
 * @param {Request} request Incoming Worker request.
 * @param {{STORE?: {get: Function, put: Function}}} env Worker bindings.
 * @returns {Promise<Response>} Route response.
 */
async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const ip  = request.headers.get('CF-Connecting-IP') || 'unknown';

  // Strip optional /api prefix so routes work both standalone and under Pages
  const path = url.pathname.replace(/^\/api/, '');

  // ── Multiplayer rooms ────────────────────────────────────────────────────
  if (path === '/multiplayer/rooms' && request.method === 'POST') {
    if (!env?.MULTIPLAYER_ROOMS) return json({ error: 'MULTIPLAYER_ROOMS binding missing' }, 503);
    if (!rateLimit(`room-create:${ip}`, 10, 60_000)) return json({ error: 'Too many room creation requests' }, 429);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const roomCode = createRoomCode();
      const stub = getRoomStub(env, roomCode);
      const initialized = await stub.fetch(new Request('https://room.internal/initialize', { method: 'POST' }));
      if (initialized.status === 409) continue;
      if (!initialized.ok) return json({ error: 'Could not initialize multiplayer room' }, 502);
      return json({
        roomCode,
        status: 'waiting',
        maxPlayers: MULTIPLAYER_ROOM_LIMIT,
        socketPath: `/api/multiplayer/rooms/${roomCode}/socket`,
      }, 201);
    }
    return json({ error: 'Could not allocate a unique room code' }, 503);
  }

  const roomRoute = path.match(/^\/multiplayer\/rooms\/([A-Za-z0-9]+)(\/socket)?$/);
  if (roomRoute && request.method === 'GET') {
    if (!env?.MULTIPLAYER_ROOMS) return json({ error: 'MULTIPLAYER_ROOMS binding missing' }, 503);
    const roomCode = normalizeRoomCode(roomRoute[1]);
    if (!roomCode) return json({ error: 'Invalid room code' }, 400);
    const stub = getRoomStub(env, roomCode);
    if (roomRoute[2]) {
      const forwarded = new Request('https://room.internal/socket', {
        method: 'GET',
        headers: request.headers,
      });
      return stub.fetch(forwarded);
    }
    return stub.fetch(new Request('https://room.internal/info'));
  }

  // ── GET /health ──────────────────────────────────────────────────────────
  if (path === '/health' && request.method === 'GET') {
    if (!env?.STORE) return json({ ok: false, error: 'STORE binding missing' }, 503);
    try {
      await env.STORE.get('seed');
      return json({ ok: true, competitive: true, ...getSeasonInfo() });
    } catch {
      return json({ ok: false, error: 'STORE unavailable' }, 503);
    }
  }

  // ── GET /server-info-testing ────────────────────────────────────────────
  if (path === '/server-info-testing' && request.method === 'GET') {
    if (!rateLimit(`srvinfo:${ip}`, 60, 60_000)) {
      return json({ error: 'Too many requests' }, 429);
    }

    const seed = await getSeed(env);
    const leaderboard = await getLeaderboard(env);
    //const lastWeek = await env.STORE.get('lastWeek-seed');
    


    return json({
      seed,
      winnersCount: leaderboard.length,
      ...getSeasonInfo(),
    });
  }
  

  // ── GET /version ─────────────────────────────────────────────────────────
  if (path === '/version' && request.method === 'GET') {
    return json({ version: '1.0.0' });
  }

  // ── GET /notices ─────────────────────────────────────────────────────────
  if (path === '/notices' && request.method === 'GET') {
    if (!rateLimit(`notices:${ip}`, 60, 60_000)) {
      return json({ error: 'Too many requests' }, 429);
    }
    return json({ notices: NOTICES });
  }

  // ── GET /seed ─────────────────────────────────────────────────────────────
  if (path === '/seed' && request.method === 'GET') {
    if (!rateLimit(`seed:${ip}`, 60, 60_000)) {
      return json({ error: 'Too many requests' }, 429);
    }
    const seed = await getSeed(env);
    return json({ seed, ...getSeasonInfo() });
  }

  // ── GET /leaderboard ──────────────────────────────────────────────────────
  if ((path === '/leaderboard' || path === '/leadbyPage') && request.method === 'GET') {
    if (!rateLimit(`lead:${ip}`, 60, 60_000)) {
      return json({ error: 'Too many requests' }, 429);
    }
    const page      = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
    const pageSize  = 10;
    const startIndex = (page - 1) * pageSize;
    const leaderboard = await getLeaderboard(env);
    const pageData  = leaderboard.slice(startIndex, startIndex + pageSize);
    return json({
      page,
      pageSize,
      totalEntries: leaderboard.length,
      hasMore: startIndex + pageSize < leaderboard.length,
      ...getSeasonInfo(),
      data: pageData,
    });
  }

  // ── POST /leaderboard ─────────────────────────────────────────────────────
  if (path === '/leaderboard' && request.method === 'POST') {
    if (!rateLimit(`submit:${ip}`, 10, 60_000)) {
      return json({ error: 'Too many requests' }, 429);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const { name, floor, seed: runSeed, character, time, result } = body;

    if (!name || floor === undefined || runSeed === undefined || result === undefined) {
      return json({ error: 'Missing required fields: name, floor, seed, result' }, 400);
    }

    if (result !== 'win') {
      return json({ error: 'Only winning competitive runs can enter the leaderboard' }, 400);
    }

    const currentSeed = await getSeed(env);
    if (String(runSeed) !== String(currentSeed)) {
      return json({ error: "Invalid seed for this week's leaderboard" }, 400);
    }

    const floorNum = Number(floor);
    const timeNum  = Number(time) || 0;

    if (!Number.isInteger(floorNum) || floorNum < 1 || floorNum > MAX_FLOOR) {
      return json({ error: 'Invalid floor value' }, 400);
    }
    if (floorNum < COMPETITIVE_WIN_FLOOR) {
      return json({ error: 'Competitive leaderboard entries require a completed winning run' }, 400);
    }
    if (!Number.isFinite(timeNum) || timeNum < 0 || timeNum > MAX_TIME) {
      return json({ error: 'Invalid time value' }, 400);
    }

    const cleanName = String(name).trim().slice(0, 32);
    if (!cleanName) return json({ error: 'Name cannot be blank' }, 400);

    const cleanCharacter = String(character || '').slice(0, 32);
    if (character && !VALID_CHARACTERS.has(cleanCharacter)) {
      return json({ error: 'Invalid character' }, 400);
    }

    const leaderboard = await getLeaderboard(env);
    const entry = {
      name: cleanName,
      floor: floorNum,
      seed: String(runSeed),
      result: 'win',
      seasonId: getSeasonInfo().seasonId,
      character: cleanCharacter,
      time: timeNum,
      submittedAt: Date.now(),
    };

    leaderboard.push(entry);
    leaderboard.sort((a, b) => b.floor - a.floor || a.time - b.time);
    await putLeaderboard(env, leaderboard);

    const rank = leaderboard.indexOf(entry) + 1;
    return json({ ok: true, rank });
  }

  return json({ error: 'Not found' }, 404);
}

// Weekly seed reset — fired by Cron Trigger "0 0 * * 1"
/**
 * Scheduled weekly reset.
 * Generates a new seed and clears leaderboard standings.
 *
 * @param {{STORE: {put: Function}}} env Worker bindings.
 * @returns {Promise<void>}
 */
async function handleScheduled(env) {
  const seed = String(Math.floor(Math.random() * 1_000_000_000));
  await env.STORE.put('seed', seed);
  await env.STORE.put('leaderboard', JSON.stringify([]));

  console.log('Weekly reset: new seed', seed);
}

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self' https://neonyke.davidkozdra.workers.dev wss://neonyke.davidkozdra.workers.dev",
    "worker-src 'self' blob:",
    "font-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

/**
 * Merge security headers into any response returned by route handlers.
 *
 * @param {Response} response Route response.
 * @returns {Response} Cloned response with security headers.
 */
function addSecurityHeaders(response) {
  if (response.webSocket) return response;
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export default {
  async fetch(request, env) {
    const response = await handleRequest(request, env);
    return addSecurityHeaders(response);
  },
  async scheduled(_event, env) {
    await handleScheduled(env);
  },
};
