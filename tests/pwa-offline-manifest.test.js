const fs = require('node:fs');
const path = require('node:path');
const { buildPrecacheList } = require('../scripts/generate-precache');

describe('offline PWA entry points', () => {
  const root = path.join(__dirname, '..');
  const generator = fs.readFileSync(path.join(root, 'scripts/generate-precache.js'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'js/vendor/koz-pwa-service-worker-runtime.js'), 'utf8');
  const preCommit = fs.readFileSync(path.join(root, '.githooks/pre-commit'), 'utf8');

  test('pre-commit regenerates and stages both offline build artifacts', () => {
    expect(preCommit).toContain('npm run precache || exit $?');
    expect(preCommit).toContain('git add -- js/vendor/koz-engine.browser-bundle.js js/vendor/koz-pwa-service-worker-runtime.js sw.js || exit $?');
    expect(preCommit).toContain('npm run precache:check || exit $?');
    expect(preCommit).not.toContain('node scripts/generate-precache.js || exit $?');
  });

  test('precache generation permanently includes both browser entry points', () => {
    const generated = buildPrecacheList();
    expect(generated).toContain('/');
    expect(generated).toContain('/index.html');
    expect(generated).toContain('/game.html');
    expect(worker).toContain('"/game.html"');
  });

  test('offline document navigation falls back to the cached application shell', () => {
    expect(worker).toContain('"navigationFallback": "/index.html"');
    expect(runtime).toContain('matchPrecache(navigationFallback)');
  });

  test('uses the reusable engine runtime and a content-derived version', () => {
    expect(worker).toContain('importScripts("/js/vendor/koz-pwa-service-worker-runtime.js")');
    expect(worker).toMatch(/"version": "[a-f0-9]{16}"/);
    expect(generator).toContain('createCacheManifest');
  });

  test('keeps critical installation atomic and runtime writes alive', () => {
    expect(runtime).toContain('await scope.caches.delete(cacheNames.precache)');
    expect(runtime).toContain('event.waitUntil?.(write.catch');
    expect(worker).not.toContain('skipWaiting');
    expect(runtime).toContain('KOZ_PWA_SKIP_WAITING');
  });

  test('offers a player-controlled update prompt before activating a waiting worker', () => {
    const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const prompt = fs.readFileSync(path.join(root, 'js/ui/pwa-update-prompt.js'), 'utf8');
    expect(page).toContain('js/ui/pwa-update-prompt.js');
    expect(prompt).toContain('neonyke:pwa-update-ready');
    expect(prompt).toContain("applyUpdate({ reload: true })");
    expect(prompt).toContain('Update now');
  });
});
