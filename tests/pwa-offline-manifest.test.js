const fs = require('node:fs');
const path = require('node:path');
const { buildPrecacheList } = require('../scripts/generate-precache');

describe('offline PWA entry points', () => {
  const root = path.join(__dirname, '..');
  const generator = fs.readFileSync(path.join(root, 'scripts/generate-precache.js'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'Koz_Engine_Lib/PWA/serviceWorkerRuntime.js'), 'utf8');

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
    expect(worker).toContain('importScripts("/Koz_Engine_Lib/PWA/serviceWorkerRuntime.js")');
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
