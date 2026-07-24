const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createCacheManifest,
  normalizeUrl,
} = require("../Koz_Engine_Lib/PWA/cacheManifest");
const pwaWorker = require("../Koz_Engine_Lib/PWA/serviceWorkerRuntime");
const { createPwaClient } = require("../Koz_Engine_Lib/PWA/clientRegistration");

class FakeCache {
  constructor(origin) {
    this.origin = origin;
    this.entries = new Map();
  }

  key(input) {
    const value = typeof input === "string" ? input : input.url;
    const url = new URL(value, this.origin);
    return `${url.pathname}${url.search}`;
  }

  async put(input, response) {
    this.entries.set(this.key(input), response.clone());
  }

  async match(input) {
    const response = this.entries.get(this.key(input));
    return response ? response.clone() : undefined;
  }

  async keys() {
    return [...this.entries.keys()].map(key => new Request(new URL(key, this.origin)));
  }
}

function createCacheStorage(origin) {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new FakeCache(origin));
      return stores.get(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
}

function createWorkerScope(responses) {
  const origin = "https://game.test";
  const listeners = new Map();
  const caches = createCacheStorage(origin);
  return {
    location: { origin },
    caches,
    clients: { claim: jest.fn(async () => {}) },
    skipWaiting: jest.fn(async () => {}),
    fetch: jest.fn(async request => {
      const pathname = new URL(request.url).pathname;
      const configured = responses?.[pathname];
      if (configured instanceof Error) throw configured;
      if (configured) return new Response(configured.body || "", { status: configured.status || 200 });
      return new Response(pathname, { status: 200 });
    }),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    listeners,
  };
}

describe("Koz PWA cache manifest", () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "koz-pwa-test-"));
    fs.writeFileSync(path.join(directory, "index.html"), "first");
    fs.writeFileSync(path.join(directory, "game.js"), "const build = 1;");
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test("normalizes same-origin cache paths and rejects remote URLs", () => {
    expect(normalizeUrl("game.js?v=4")).toBe("/game.js");
    expect(normalizeUrl("\\assets\\hero.png")).toBe("/assets/hero.png");
    expect(() => normalizeUrl("https://other.test/game.js")).toThrow(/same-origin/);
  });

  test("changes the build version when file contents change at the same URL", () => {
    const options = {
      rootDir: directory,
      urls: ["/", "/game.js"],
      aliases: { "/": "index.html" },
    };
    const first = createCacheManifest(options);
    fs.writeFileSync(path.join(directory, "game.js"), "const build = 2;");
    const second = createCacheManifest(options);

    expect(second.version).not.toBe(first.version);
    expect(second.entries.map(entry => entry.url)).toEqual(["/", "/game.js"]);
  });

  test("separates optional media from the atomic critical shell", () => {
    fs.writeFileSync(path.join(directory, "music.ogg"), "music");
    const manifest = createCacheManifest({
      rootDir: directory,
      urls: ["/game.js", "/music.ogg"],
      optionalUrls: ["/music.ogg"],
    });

    expect(manifest.critical.map(entry => entry.url)).toEqual(["/game.js"]);
    expect(manifest.optional.map(entry => entry.url)).toEqual(["/music.ogg"]);
    expect(manifest.totals.optionalBytes).toBe(5);
  });
});

describe("Koz PWA service worker runtime", () => {
  test("does not promote a version when any critical file fails", async () => {
    const scope = createWorkerScope({ "/broken.js": { status: 500 } });
    const runtime = pwaWorker.install(scope, {
      cachePrefix: "game",
      version: "next",
      critical: ["/index.html", "/broken.js"],
      warmOptionalOnInstall: false,
    });
    await scope.caches.open("game-precache-old");

    await expect(runtime.cacheCritical()).rejects.toThrow(/broken\.js/);
    expect(scope.caches.stores.has("game-precache-next")).toBe(false);
    expect(scope.caches.stores.has("game-precache-old")).toBe(true);
  });

  test("cleans old app caches only after activation and preserves unrelated caches", async () => {
    const scope = createWorkerScope();
    const runtime = pwaWorker.install(scope, {
      cachePrefix: "game",
      version: "next",
      critical: ["/index.html"],
      warmOptionalOnInstall: false,
    });
    await scope.caches.open("game-precache-old");
    await scope.caches.open("other-app-cache");
    await runtime.cacheCritical();
    await runtime.cleanupOldCaches();

    expect(scope.caches.stores.has("game-precache-old")).toBe(false);
    expect(scope.caches.stores.has("game-precache-next")).toBe(true);
    expect(scope.caches.stores.has("other-app-cache")).toBe(true);
  });

  test("serves content-versioned assets from the active precache despite query strings", async () => {
    const scope = createWorkerScope({
      "/game.js": { body: "offline-code" },
      "/hero%20sprite.png": { body: "offline-art" },
    });
    const runtime = pwaWorker.install(scope, {
      cachePrefix: "game",
      version: "one",
      critical: ["/game.js", "/hero sprite.png"],
      warmOptionalOnInstall: false,
    });
    await runtime.cacheCritical();
    scope.fetch.mockClear();

    const response = await runtime.handleFetch({
      request: new Request("https://game.test/game.js?cache-bust=2"),
      waitUntil: jest.fn(),
    });

    expect(await response.text()).toBe("offline-code");
    expect(scope.fetch).not.toHaveBeenCalled();

    const spacedResponse = await runtime.handleFetch({
      request: new Request("https://game.test/hero%20sprite.png"),
      waitUntil: jest.fn(),
    });
    expect(await spacedResponse.text()).toBe("offline-art");
    expect(scope.fetch).not.toHaveBeenCalled();
  });

  test("tracks required and optional offline readiness separately", async () => {
    const scope = createWorkerScope();
    const runtime = pwaWorker.install(scope, {
      cachePrefix: "game",
      version: "one",
      critical: ["/index.html"],
      optional: ["/music.ogg"],
      warmOptionalOnInstall: false,
    });
    await runtime.cacheCritical();

    expect(await runtime.getStatus()).toEqual({
      version: "one",
      criticalReady: true,
      criticalCached: 1,
      criticalTotal: 1,
      optionalCached: 0,
      optionalTotal: 1,
    });
  });
});

describe("Koz PWA client registration", () => {
  test("registers without browser HTTP caching and activates a waiting update explicitly", async () => {
    const worker = { postMessage: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() };
    const registration = {
      waiting: worker,
      active: {},
      update: jest.fn(async () => {}),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    const serviceWorker = {
      controller: {},
      register: jest.fn(async () => registration),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    const onUpdateAvailable = jest.fn();
    const client = createPwaClient({
      navigator: { serviceWorker },
      onUpdateAvailable,
    });

    await client.register({ scriptUrl: "/custom-sw.js", scope: "/game/" });
    expect(serviceWorker.register).toHaveBeenCalledWith("/custom-sw.js", {
      scope: "/game/",
      updateViaCache: "none",
    });
    expect(onUpdateAvailable).toHaveBeenCalled();
    expect(client.applyUpdate({ reload: false })).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "KOZ_PWA_SKIP_WAITING" });
    client.destroy();
  });
});
