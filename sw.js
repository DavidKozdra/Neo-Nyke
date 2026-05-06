const CACHE = 'neonyke-v3';

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
  '/js/touchControls.js',
  '/js/gamepadControls.js',
  '/js/game.js',
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
