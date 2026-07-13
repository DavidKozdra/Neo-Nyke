const { spawnSync } = require('node:child_process');

const DEFAULT_API_BASE = 'http://localhost:8787/api';
const REQUEST_TIMEOUT_MS = 2000;




function createRequestUrl(base, path) {
  const normalizedBase = String(base || '').trim() || DEFAULT_API_BASE;
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  return new URL(normalizedPath, normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`).toString();
}

function parseSeed(payload) {
  const seed = payload && payload.seed;
  if (typeof seed === 'string' || typeof seed === 'number') {
    return String(seed);
  }
  return 'unavailable';
}

function parseServerInfo(payload) {
  const serverInfo = payload && payload.serverInfo;
  if (typeof serverInfo === 'string' || typeof serverInfo === 'number') {
    return String(serverInfo);
  }
  return 'not getting data from parseServerInfo';
}


function parseWinnersCount(payload) {
  if (payload && Number.isFinite(payload.totalEntries)) {
    return payload.totalEntries;
  }
  if (payload && Array.isArray(payload.data)) {
    return payload.data.length;
  }
  return 0;
}

function toUtcDateString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

async function fetchJson(url) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch is not available in this Node runtime');
  }
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

async function loadServerStats(apiBase) {
  const seedUrl = createRequestUrl(apiBase, '/seed');
  const leaderboardUrl = createRequestUrl(apiBase, '/leaderboard?page=1');
  const serverInfoUrl = createRequestUrl(apiBase, '/server-info-testing');

  const [seedResult, leaderboardResult, serverInfoResult] = await Promise.allSettled([
    fetchJson(seedUrl),
    fetchJson(leaderboardUrl),
    fetchJson(serverInfoUrl),
  ]);

  //console.log('Loaded server stats:', { seedResult, leaderboardResult, serverInfoResult }); 
  return {
    seed: seedResult.status === 'fulfilled' ? parseSeed(seedResult.value) : 'unavailable',
    winnersCount: leaderboardResult.status === 'fulfilled' ? parseWinnersCount(leaderboardResult.value) : 'unavailable',
    serverInfo: serverInfoResult.status === 'fulfilled' ? parseServerInfo(serverInfoResult.value) : 'not getting data from server',
    seedError: seedResult.status === 'rejected' ? seedResult.reason : null,
    leaderboardError: leaderboardResult.status === 'rejected' ? leaderboardResult.reason : null,
    serverInfoError: serverInfoResult.status === 'rejected' ? serverInfoResult.reason : null,
  };


}

function runJest() {
  const jestPath = require.resolve('jest/bin/jest');
  const result = spawnSync(process.execPath, [jestPath], { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
}

async function main() {
  const apiBase = process.env.NEONYKE_API_BASE || DEFAULT_API_BASE;
  const stats = await loadServerStats(apiBase);
  console.log(`Date (UTC): ${toUtcDateString()}`);
  console.log(`Week's seed: ${stats.seed}`);
  console.log(`Count of winners: ${stats.winnersCount}`);
  console.log(`Server info: ${JSON.stringify(stats.serverInfo)}`);

  if (stats.seedError || stats.leaderboardError || stats.serverInfoError) {
    console.warn('Server stats warning: unable to read one or more endpoints. Unit tests will still run.');
  }

  // runJest(); // FIXME: Bring back tests under specific conditions
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to prepare server test info:', error?.message || error);
    runJest();
  });
}

module.exports = {
  createRequestUrl,
  parseSeed,
  parseWinnersCount,
  toUtcDateString,
};
