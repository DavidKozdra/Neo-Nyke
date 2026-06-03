const { spawnSync } = require('node:child_process');

const DEFAULT_API_BASE = 'https://neonyke.davidkozdra.workers.dev/api';


let yesterdayseed;


function getLogData(){

}

function getYesterdaySeed(){
   

}

function readCSV(table, row ) {
    
    /* get file info and break */
}


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
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

async function loadServerStats(apiBase) {
  const seedUrl = createRequestUrl(apiBase, '/seed');
  const leaderboardUrl = createRequestUrl(apiBase, '/leaderboard?page=1');

  const [seedResult, leaderboardResult] = await Promise.allSettled([
    fetchJson(seedUrl),
    fetchJson(leaderboardUrl),
  ]);

  return {
    seed: seedResult.status === 'fulfilled' ? parseSeed(seedResult.value) : 'unavailable',
    winnersCount: leaderboardResult.status === 'fulfilled' ? parseWinnersCount(leaderboardResult.value) : 'unavailable',
    seedError: seedResult.status === 'rejected' ? seedResult.reason : null,
    leaderboardError: leaderboardResult.status === 'rejected' ? leaderboardResult.reason : null,
  };
}

function runJest() {
  const result = spawnSync('npm', ['exec', 'jest'], { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
}

async function main() {
  const apiBase = process.env.NEONYKE_API_BASE || DEFAULT_API_BASE;
  const stats = await loadServerStats(apiBase);

  console.log(`Date (UTC): ${toUtcDateString()}`);
  console.log(`Today's seed: ${stats.seed}`);
  console.log(`Count of winners: ${stats.winnersCount}`);

  if (stats.seedError || stats.leaderboardError) {
    console.warn('Server stats warning: unable to read one or more endpoints. Unit tests will still run.');
  }

  runJest();
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