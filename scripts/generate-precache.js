#!/usr/bin/env node
'use strict';

// Regenerates the PRECACHE list (and bumps CACHE_VERSION) in sw.js so the PWA is
// truly offline-complete. The list is DERIVED, never hand-maintained — the old
// hand-typed array had drifted badly (4 of 50 sounds, 2 of 22 sprite PNGs, and
// the entire three.js vendor bundle were missing), which is exactly why the app
// wasn't offline. Run this whenever assets or the module graph change:
//
//   node scripts/generate-precache.js          # rewrite sw.js
//   node scripts/generate-precache.js --check   # CI: fail if sw.js is stale
//
// Sources of truth:
//   1. the ES module import graph rooted at js/main.js (follows relative imports)
//   2. same-origin <script>/<link>/src/href references in index.html
//   3. every shippable file under assets/ (sprite/editor sources excluded)
//   4. a few fixed roots (/, index.html, manifest.json, the sprite .js bundles)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SW_PATH = path.join(ROOT, 'sw.js');
const INDEX_PATH = path.join(ROOT, 'index.html');

// Asset extensions that ship to the client. Editor sources (.ase/.aseprite/.psd)
// and docs are deliberately excluded — they are never fetched at runtime.
const SHIPPABLE_ASSET_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.wav', '.mp3', '.ogg', '.m4a',
  '.woff2', '.woff', '.ttf', '.otf',
  '.json',
]);
const EXCLUDED_ASSET_EXT = new Set(['.ase', '.aseprite', '.psd', '.md', '.txt']);

function toAbsUrlPath(fileAbs) {
  return '/' + path.relative(ROOT, fileAbs).split(path.sep).join('/');
}

// --- 1. ES module graph from js/main.js ------------------------------------
// Matches static `import ... from '...'`, side-effect `import '...'`, and
// `export ... from '...'` with relative specifiers. Bare/absolute/remote
// specifiers are ignored (there are none in this project, but be safe).
const IMPORT_RE = /(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"](\.[^'"]+)['"]/g;

function collectModuleGraph(entryAbs) {
  const seen = new Set();
  const queue = [entryAbs];
  while (queue.length) {
    const fileAbs = queue.shift();
    if (seen.has(fileAbs)) continue;
    seen.add(fileAbs);
    let source;
    try {
      source = fs.readFileSync(fileAbs, 'utf8');
    } catch {
      throw new Error(`Precache module graph references a missing file: ${toAbsUrlPath(fileAbs)}`);
    }
    let match;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(source))) {
      const resolved = path.resolve(path.dirname(fileAbs), match[1]);
      queue.push(resolved);
    }
  }
  return seen;
}

// --- 2. index.html same-origin references ----------------------------------
function collectIndexReferences() {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const refs = new Set();
  const attrRe = /(?:src|href)\s*=\s*"([^"]+)"/g;
  let match;
  while ((match = attrRe.exec(html))) {
    const ref = match[1].trim();
    if (!ref || /^(?:https?:)?\/\//.test(ref) || ref.startsWith('data:')
      || ref.startsWith('#') || ref.startsWith('mailto:')) continue;
    const clean = ref.replace(/^\.?\//, '');
    const abs = path.join(ROOT, clean);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      refs.add('/' + clean);
    }
  }
  return refs;
}

// --- 3. shippable files under assets/ --------------------------------------
function collectAssets(dirAbs, out) {
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      collectAssets(abs, out);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (EXCLUDED_ASSET_EXT.has(ext)) continue;
    if (!SHIPPABLE_ASSET_EXT.has(ext)) continue;
    out.add(toAbsUrlPath(abs));
  }
  return out;
}

function buildPrecacheList() {
  const urls = new Set();

  // Fixed roots. '/' and index.html are the navigation fallback; the sprite .js
  // bundles and koz-engine are loaded via plain <script> (already caught by the
  // index scan, but listed explicitly so a markup change can't silently drop
  // them). sw.js is intentionally NOT self-cached.
  urls.add('/');
  urls.add('/index.html');
  urls.add('/manifest.json');

  for (const fileAbs of collectModuleGraph(path.join(ROOT, 'js', 'main.js'))) {
    urls.add(toAbsUrlPath(fileAbs));
  }
  for (const ref of collectIndexReferences()) urls.add(ref);
  collectAssets(path.join(ROOT, 'assets'), urls);

  // Koz engine + sprite bundles live outside assets/ and js/main.js's graph
  // (classic scripts), so pin them explicitly if present.
  for (const extra of [
    '/Koz_Engine_Lib/Core/koz-engine.global.js',
    '/assets/sprites/combatants.js',
    '/assets/sprites/environment.js',
    '/assets/sprites/icons.js',
  ]) {
    if (fs.existsSync(path.join(ROOT, extra.slice(1)))) urls.add(extra);
  }

  return [...urls].sort((a, b) => a.localeCompare(b));
}

function renderPrecacheBlock(list) {
  const body = list.map(url => `  ${JSON.stringify(url)},`).join('\n');
  return `const PRECACHE = [\n${body}\n];`;
}

// Bump the vN in `neonyke-vNN` so clients pick up the new list on next load.
function bumpCacheVersion(swSource) {
  return swSource.replace(
    /const CACHE_VERSION = 'neonyke-v(\d+)';/,
    (_, n) => `const CACHE_VERSION = 'neonyke-v${Number(n) + 1}';`,
  );
}

function rewriteServiceWorker({ check }) {
  const original = fs.readFileSync(SW_PATH, 'utf8');
  const list = buildPrecacheList();
  const block = renderPrecacheBlock(list);

  const precacheRe = /const PRECACHE = \[[\s\S]*?\n\];/;
  if (!precacheRe.test(original)) {
    throw new Error('Could not locate the PRECACHE array in sw.js');
  }

  const currentBlock = original.match(precacheRe)[0];
  const listUnchanged = currentBlock === block;

  if (check) {
    if (!listUnchanged) {
      console.error('sw.js PRECACHE is stale. Run: node scripts/generate-precache.js');
      const current = new Set(currentBlock.match(/"[^"]+"/g)?.map(s => JSON.parse(s)) || []);
      const next = new Set(list);
      const added = list.filter(u => !current.has(u));
      const removed = [...current].filter(u => !next.has(u));
      if (added.length) console.error(`  + ${added.length} missing: ${added.slice(0, 8).join(', ')}${added.length > 8 ? ' …' : ''}`);
      if (removed.length) console.error(`  - ${removed.length} stale: ${removed.slice(0, 8).join(', ')}${removed.length > 8 ? ' …' : ''}`);
      process.exit(1);
    }
    console.log(`sw.js PRECACHE is up to date (${list.length} entries).`);
    return;
  }

  let next = original.replace(precacheRe, block);
  // Only bump the version when the cached set actually changed, so a no-op run
  // doesn't churn the version (and force every client to re-download).
  if (!listUnchanged) next = bumpCacheVersion(next);

  if (next === original) {
    console.log(`sw.js already up to date (${list.length} entries).`);
    return;
  }
  fs.writeFileSync(SW_PATH, next);
  const version = next.match(/const CACHE_VERSION = '([^']+)';/)?.[1];
  console.log(`sw.js PRECACHE regenerated: ${list.length} entries, version ${version}.`);
}

// Read the PRECACHE list currently written in sw.js.
function readCurrentPrecache() {
  const source = fs.readFileSync(SW_PATH, 'utf8');
  const block = source.match(/const PRECACHE = \[[\s\S]*?\n\];/)?.[0] || '';
  return (block.match(/"[^"]+"/g) || []).map(s => JSON.parse(s));
}

// Only run the rewrite when invoked as a CLI, so tests can require the builders
// without side effects.
if (require.main === module) {
  rewriteServiceWorker({ check: process.argv.includes('--check') });
}

module.exports = { buildPrecacheList, readCurrentPrecache };
