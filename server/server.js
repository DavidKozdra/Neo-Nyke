// Cloudflare Worker — NeoNyke backend
// Bindings required (wrangler.toml):
//   KV namespace: STORE
//   Cron trigger: "0 0 * * 1" (weekly seed reset)

const MAX_FLOOR = 10_000;
const MAX_TIME  = 86_400;
const COMPETITIVE_WIN_FLOOR = 10;
const VALID_CHARACTERS = new Set(['thorn_knight', 'metao', 'gelleh', 'granialla', 'mooggy']);

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
    "connect-src 'self' https://neonyke.davidkozdra.workers.dev",
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
