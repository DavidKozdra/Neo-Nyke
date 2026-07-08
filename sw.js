const CACHE_VERSION = 'neonyke-v39';
const CACHE_META = 'neonyke-cache-meta';
const CACHE_META_KEY = '/__neonyke_cache_meta__';
const CACHE_REFRESH_INTERVAL_MS = 5 * 60 * 60 * 1000;

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/js/main.js',
  '/css/style.css',
  '/css/theme-princess.css',
  '/css/mobile.css',
  '/css/touch-controls.css',
  '/css/panel-borders.css',
  '/css/tutorial.css',
  '/assets/fonts/VT323-Regular.woff2',
  '/assets/fonts/VT323-LatinExt.woff2',
  '/assets/fonts/PressStart2P-Latin.woff2',
  '/assets/sounds/Item Collect.wav',
  '/assets/sounds/Coin.wav',
  '/assets/sounds/Heal_player.wav',
  '/assets/sounds/Player Death.wav',
  '/Koz_Engine_Lib/Core/koz-engine.global.js',
  '/assets/sprites/combatants.js',
  '/assets/sprites/chars/Mateo.png',
  '/assets/sprites/chars/princess.png',
  '/assets/sprites/environment.js',
  '/assets/sprites/icons.js',
  '/js/achievements.js',
  '/js/achievementManager.js',
  '/js/dataAdapter.js',
  '/js/touchControls.js',
  '/js/gamepadControls.js',
  '/js/core/neo.js',
  '/js/core/game-core.js',
  '/js/core/math-utils.js',
  '/js/core/sfx.js',
  '/js/core/music.js',
  '/js/ui/input.js',
  '/js/core/status.js',
  '/js/ui/notifications.js',
  '/js/ui/unlock-banner.js',
  '/js/ui/panels.js',
  '/js/ui/tutorial-controller.js',
  '/js/tutorial/scenes.js',
  '/js/core/game-state.js',
  '/js/game/roomTemplates.js',
  '/js/game/rooms.js',
  '/js/game/enemies.js',
  '/js/game/player.js',
  '/js/game/projectile-types.js',
  '/js/game/combat.js',
  '/js/core/update.js',
  '/js/game/world.js',
  '/js/game/hud.js',
  '/js/draw/viewport.js',
  '/js/draw/environment.js',
  '/js/draw/lighting.js',
  '/js/draw/props.js',
  '/js/draw/atlas.js',
  '/js/draw/character-sheets.js',
  '/js/draw/entities.js',
  '/js/draw/hud.js',
  '/js/core/canvas-recovery.js',
  '/js/ui/controller.js',
  '/js/core/save-store.js',
  '/js/core/perf.js',
  '/js/ui/settings-ui.js',
  '/js/ui/menu-background.js',
  '/js/ui/credits.js',
];

function makeCacheName(now = Date.now()) {
  return `${CACHE_VERSION}-${now}`;
}

async function readCacheMeta() {
  try {
    const cache = await caches.open(CACHE_META);
    const response = await cache.match(CACHE_META_KEY);
    return response ? response.json() : null;
  } catch {
    return null;
  }
}

async function writeCacheMeta(meta) {
  const cache = await caches.open(CACHE_META);
  await cache.put(
    CACHE_META_KEY,
    new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } })
  );
}

async function getAppCacheName({ rotateIfStale = false } = {}) {
  const now = Date.now();
  const meta = await readCacheMeta();
  const createdAt = Number(meta?.createdAt || 0);
  const hasCurrentVersion = meta?.version === CACHE_VERSION;
  const hasFreshCache = hasCurrentVersion
    && meta?.cacheName
    && (!rotateIfStale || now - createdAt < CACHE_REFRESH_INTERVAL_MS);
  if (hasFreshCache) return meta.cacheName;
  const cacheName = makeCacheName(now);
  await writeCacheMeta({ cacheName, createdAt: now, version: CACHE_VERSION });
  return cacheName;
}

async function cleanupOldAppCaches(activeCacheName) {
  const keys = await caches.keys();
  await Promise.all(keys
    .filter(key => key.startsWith('neonyke-v') && key !== activeCacheName)
    .map(key => caches.delete(key)));
}

async function precacheApp(options = {}) {
  const cacheName = await getAppCacheName(options);
  const cache = await caches.open(cacheName);
  let refreshedCount = 0;
  await Promise.all(PRECACHE.map(async path => {
    try {
      const request = new Request(path, { cache: 'reload' });
      const response = await fetch(request);
      if (response && response.status === 200 && response.type !== 'opaque') {
        await cache.put(path, response);
        refreshedCount += 1;
      }
    } catch {
      // Keep the existing cached copy if a refresh request fails.
    }
  }));
  if (refreshedCount > 0) await cleanupOldAppCaches(cacheName);
}

self.addEventListener('install', e => {
  e.waitUntil(
    precacheApp().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    getAppCacheName()
      .then(cacheName => cleanupOldAppCaches(cacheName))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Don't intercept itch.io or external requests
  if (url.origin !== self.location.origin) return;

  const isDocument = e.request.mode === 'navigate' || e.request.destination === 'document';
  const isCoreAsset = e.request.destination === 'script' || e.request.destination === 'style';

  if (isDocument || isCoreAsset) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200 && res.type !== 'opaque') {
            const clone = res.clone();
            getAppCacheName().then(cacheName => caches.open(cacheName)).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        getAppCacheName().then(cacheName => caches.open(cacheName)).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});

self.addEventListener('message', e => {
  if (e.data?.type !== 'NEONYKE_REFRESH_CACHE') return;
  e.waitUntil(precacheApp({ rotateIfStale: true }));
});
