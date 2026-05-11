const CACHE = 'neonyke-v10';

const PRECACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/theme-princess.css',
  '/css/mobile.css',
  '/css/touch-controls.css',
  '/Koz_Engine_Lib/Core/koz-engine.global.js',
  '/assets/sprites/combatants.js',
  '/assets/sprites/environment.js',
  '/assets/sprites/icons.js',
  '/js/achievements.js',
  '/js/achievementManager.js',
  '/js/dataAdapter.js',
  '/js/touchControls.js',
  '/js/gamepadControls.js',
  '/js/core/neo.js',
  '/js/source-loader.js',
  '/js/core/game-core.js',
  '/js/core/math-utils.js',
  '/js/ui/input.js',
  '/js/core/status.js',
  '/js/ui/notifications.js',
  '/js/ui/panels.js',
  '/js/core/game-state.js',
  '/js/game/rooms.js',
  '/js/game/enemies.js',
  '/js/game/player.js',
  '/js/game/combat.js',
  '/js/core/update.js',
  '/js/game/world.js',
  '/js/game/hud.js',
  '/js/draw/viewport.js',
  '/js/draw/environment.js',
  '/js/draw/lighting.js',
  '/js/draw/props.js',
  '/js/draw/atlas.js',
  '/js/draw/entities.js',
  '/js/draw/hud.js',
  '/js/ui/controller.js',
  '/js/core/save-store.js',
  '/js/core/perf.js',
  '/js/ui/settings-ui.js',
  '/js/ui/menu-background.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
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
            caches.open(CACHE).then(c => c.put(e.request, clone));
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
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});
