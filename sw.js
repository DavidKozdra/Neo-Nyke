const CACHE_VERSION = 'neonyke-v91';
const CACHE_META = 'neonyke-cache-meta';
const CACHE_META_KEY = '/__neonyke_cache_meta__';
const CACHE_REFRESH_INTERVAL_MS = 5 * 60 * 60 * 1000;

const PRECACHE = [
  "/",
  "/assets/credits-images/digits.png",
  "/assets/credits-images/Explorer2000.png",
  "/assets/fonts/PressStart2P-Latin.woff2",
  "/assets/fonts/PressStart2P.ttf",
  "/assets/fonts/VT323-LatinExt.woff2",
  "/assets/fonts/VT323-Regular.woff2",
  "/assets/i18n/ar.json",
  "/assets/i18n/de.json",
  "/assets/i18n/en.json",
  "/assets/i18n/es.json",
  "/assets/i18n/fr.json",
  "/assets/i18n/hi.json",
  "/assets/i18n/id.json",
  "/assets/i18n/ja.json",
  "/assets/i18n/ko.json",
  "/assets/i18n/pt.json",
  "/assets/i18n/ru.json",
  "/assets/i18n/tr.json",
  "/assets/i18n/zh.json",
  "/assets/icons/icon-128x128.png",
  "/assets/icons/icon-144x144.png",
  "/assets/icons/icon-152x152.png",
  "/assets/icons/icon-192x192.png",
  "/assets/icons/icon-384x384.png",
  "/assets/icons/icon-512x512.png",
  "/assets/icons/icon-72x72.png",
  "/assets/icons/icon-96x96.png",
  "/assets/icons/icon-maskable-512x512.png",
  "/assets/icons/neo-nyke_Icon.png",
  "/assets/icons/NeoNykeTitle.png",
  "/assets/sounds/Coin.wav",
  "/assets/sounds/Heal_player.wav",
  "/assets/sounds/Item Collect.wav",
  "/assets/sounds/music/Neo Nyke - Gameplay (Loop).wav",
  "/assets/sounds/music/Neo Nyke - main theme.mp3",
  "/assets/sounds/music/Neo Nyke - Title Intro.wav",
  "/assets/sounds/music/Neo Nyke - Title Loop.wav",
  "/assets/sounds/Player Death.wav",
  "/assets/sounds/sf_Lightning Charge_looped.wav",
  "/assets/sounds/sf_Lightning Charge.wav",
  "/assets/sounds/sf_menu_click 1.wav",
  "/assets/sounds/sf_menu_click 2.wav",
  "/assets/sounds/sf_new_fire.wav",
  "/assets/sounds/sfx_achievement 1.mp3",
  "/assets/sounds/sfx_achievement 2.mp3",
  "/assets/sounds/sfx_achievement 3.mp3",
  "/assets/sounds/sfx_AOE 4.wav",
  "/assets/sounds/sfx_bomb explosion.wav",
  "/assets/sounds/sfx_break_funiture.wav",
  "/assets/sounds/sfx_Buy-Sell 1.wav",
  "/assets/sounds/sfx_Buy-Sell 2.wav",
  "/assets/sounds/sfx_Buy-Sell 3.wav",
  "/assets/sounds/sfx_dash 1.mp3",
  "/assets/sounds/sfx_Dialogue 1.wav",
  "/assets/sounds/sfx_Dialogue 2.wav",
  "/assets/sounds/sfx_Dialogue 3.wav",
  "/assets/sounds/sfx_enemy hit_ uuearh_long.wav",
  "/assets/sounds/sfx_enemy hit_ uuearh.wav",
  "/assets/sounds/sfx_enemy hit_aahh_boss.wav",
  "/assets/sounds/sfx_enemy hit_arrgh.wav",
  "/assets/sounds/sfx_enemy hit_ooah_deep.wav",
  "/assets/sounds/sfx_enemy hit_uiiiiee_short.wav",
  "/assets/sounds/sfx_enemy hit_uuaa_deep.wav",
  "/assets/sounds/sfx_enemy hit_uuua_deep.wav",
  "/assets/sounds/sfx_enemy hit_wueea.wav",
  "/assets/sounds/sfx_Enemy Hit.wav",
  "/assets/sounds/sfx_Fire.wav",
  "/assets/sounds/sfx_Forge Upgrade.wav",
  "/assets/sounds/sfx_hud_confirm 6.wav",
  "/assets/sounds/sfx_ladder.wav",
  "/assets/sounds/sfx_lazer_blast.mp3",
  "/assets/sounds/sfx_room transition.wav",
  "/assets/sounds/sfx_secret reveal 3.mp3",
  "/assets/sounds/sfx_secret reveal 4.mp3",
  "/assets/sounds/sfx_secret reveal.mp3",
  "/assets/sounds/sfx_Sword Swing 1.wav",
  "/assets/sounds/sfx_Sword Swing 2.wav",
  "/assets/sounds/sfx_victory 1.mp3",
  "/assets/sounds/sfx_victory 2.mp3",
  "/assets/sounds/sfx_victory 3.mp3",
  "/assets/sprites/chars/Gelleh.png",
  "/assets/sprites/chars/Metao.png",
  "/assets/sprites/chars/Mooggy.png",
  "/assets/sprites/chars/princess.png",
  "/assets/sprites/chars/Sarge.png",
  "/assets/sprites/chars/Thorn Knight.png",
  "/assets/sprites/chars/turtle_boy.png",
  "/assets/sprites/chars/TurtleBoy.png",
  "/assets/sprites/combatants.js",
  "/assets/sprites/env/anvil_0.png",
  "/assets/sprites/env/barrel_0.png",
  "/assets/sprites/env/chair_0.png",
  "/assets/sprites/env/chair_1.png",
  "/assets/sprites/env/chest_0.png",
  "/assets/sprites/env/chest_a_b.png",
  "/assets/sprites/env/forge_0.png",
  "/assets/sprites/env/ground_0.png",
  "/assets/sprites/env/ladder_0.png",
  "/assets/sprites/env/pillar_0.png",
  "/assets/sprites/env/pillar_1.png",
  "/assets/sprites/env/pillar_2.png",
  "/assets/sprites/env/pillar_3.png",
  "/assets/sprites/env/pillar.png",
  "/assets/sprites/env/table_0.png",
  "/assets/sprites/env/table_1.png",
  "/assets/sprites/environment.js",
  "/assets/sprites/icons.js",
  "/assets/sprites/ui/mobile-menu.png",
  "/css/character-select.css",
  "/css/mobile.css",
  "/css/panel-borders.css",
  "/css/style.css",
  "/css/theme-princess.css",
  "/css/touch-controls.css",
  "/css/tutorial.css",
  "/index.html",
  "/js/achievementManager.js",
  "/js/achievements.js",
  "/js/config/FeatureFlags.js",
  "/js/core/canvas-recovery.js",
  "/js/core/game-core.js",
  "/js/core/game-state.js",
  "/js/core/math-utils.js",
  "/js/core/music.js",
  "/js/core/neo.js",
  "/js/core/perf.js",
  "/js/core/save-store.js",
  "/js/core/sfx.js",
  "/js/core/status.js",
  "/js/core/update.js",
  "/js/dataAdapter.js",
  "/js/draw/atlas.js",
  "/js/draw/character-sheets.js",
  "/js/draw/entities.js",
  "/js/draw/environment.js",
  "/js/draw/hud.js",
  "/js/draw/image-assets.js",
  "/js/draw/lighting.js",
  "/js/draw/pillar-renderer.js",
  "/js/draw/props.js",
  "/js/draw/three-renderer.js",
  "/js/draw/viewport.js",
  "/js/game/combat.js",
  "/js/game/enemies.js",
  "/js/game/hud.js",
  "/js/game/player.js",
  "/js/game/projectile-types.js",
  "/js/game/rooms.js",
  "/js/game/roomTemplates.js",
  "/js/game/specialRooms.js",
  "/js/game/world.js",
  "/js/gamepadControls.js",
  "/js/i18n.js",
  "/js/main.js",
  "/js/multiplayer/BrowserMultiplayerSession.js",
  "/js/multiplayer/CloudflareWebSocketTransport.js",
  "/js/multiplayer/LocalLoopbackTransport.js",
  "/js/multiplayer/LocalMultiplayerSession.js",
  "/js/multiplayer/NetworkTransport.js",
  "/js/multiplayer/OfflineGameSession.js",
  "/js/multiplayer/OfflineTransport.js",
  "/js/protocol/ProtocolV1.js",
  "/js/rendering/NetworkGameView.js",
  "/js/simulation/CampaignMovementRules.js",
  "/js/simulation/CampaignSimulation.js",
  "/js/simulation/DeterministicFloorGenerator.js",
  "/js/simulation/FixedTickRunner.js",
  "/js/simulation/GameSimulation.js",
  "/js/simulation/GameState.js",
  "/js/simulation/NetworkCombatSystem.js",
  "/js/simulation/RandomService.js",
  "/js/simulation/SharedAcquisitionSystem.js",
  "/js/simulation/SharedChestSystem.js",
  "/js/simulation/SharedCombatContent.js",
  "/js/simulation/SharedDamageSystem.js",
  "/js/simulation/SharedEncounterSystem.js",
  "/js/simulation/SharedEnemyAISystem.js",
  "/js/simulation/SharedEnemyBehaviorSystem.js",
  "/js/simulation/SharedEnemyContent.js",
  "/js/simulation/SharedEventItemSystem.js",
  "/js/simulation/SharedForgeSystem.js",
  "/js/simulation/SharedHitResolutionSystem.js",
  "/js/simulation/SharedInventorySystem.js",
  "/js/simulation/SharedItemContent.js",
  "/js/simulation/SharedItemDefinitions.js",
  "/js/simulation/SharedItemEffectSystem.js",
  "/js/simulation/SharedMoveContent.js",
  "/js/simulation/SharedProgressionSystem.js",
  "/js/simulation/SharedProjectileSystem.js",
  "/js/simulation/SharedRoomInteriorSystem.js",
  "/js/simulation/SharedRoomLifecycleSystem.js",
  "/js/simulation/SharedRunServiceSystem.js",
  "/js/simulation/SharedShopSystem.js",
  "/js/simulation/SharedSpecialRoomSystem.js",
  "/js/simulation/SharedStatusSystem.js",
  "/js/simulation/SharedWorldContent.js",
  "/js/simulation/SharedWorldMutationSystem.js",
  "/js/touchControls.js",
  "/js/tutorial/scenes.js",
  "/js/ui/controller.js",
  "/js/ui/credits.js",
  "/js/ui/input.js",
  "/js/ui/menu-background.js",
  "/js/ui/move-preview.js",
  "/js/ui/notifications.js",
  "/js/ui/panels.js",
  "/js/ui/settings-ui.js",
  "/js/ui/sprite-editor.js",
  "/js/ui/tutorial-controller.js",
  "/js/ui/unlock-banner.js",
  "/js/vendor/three.core.js",
  "/js/vendor/three.module.js",
  "/Koz_Engine_Lib/Core/koz-engine.global.js",
  "/manifest.json",
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
