(function initKozPwaServiceWorker(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (root) {
    root.KozPwaServiceWorker = api;
  }
})(typeof self !== "undefined" ? self : globalThis, function createKozPwaServiceWorkerApi() {
  function normalizePath(value) {
    const text = String(value || "").trim();
    if (!text) throw new TypeError("PWA cache path must be a non-empty string");
    const path = text.split(/[?#]/, 1)[0];
    return path === "/" ? "/" : `/${path.replace(/^\/+/, "")}`;
  }

  function decodePathname(pathname) {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  }

  function normalizeEntries(entries) {
    return Array.from(new Set((entries || []).map(function normalizeEntry(entry) {
      return normalizePath(typeof entry === "string" ? entry : entry?.url);
    })));
  }

  function createCacheNames(options) {
    const prefix = String(options?.cachePrefix || "koz-game").replace(/[^a-z0-9_-]+/gi, "-");
    const version = String(options?.version || "dev").replace(/[^a-z0-9_-]+/gi, "-");
    return {
      prefix: `${prefix}-`,
      precache: `${prefix}-precache-${version}`,
      runtime: `${prefix}-runtime-${version}`,
    };
  }

  function createPool(items, concurrency, worker) {
    const queue = items.slice();
    const count = Math.max(1, Math.min(queue.length || 1, Number(concurrency) || 4));
    const runners = Array.from({ length: count }, async function runQueue() {
      const results = [];
      while (queue.length) {
        const item = queue.shift();
        try {
          results.push({ item, ok: true, value: await worker(item) });
        } catch (error) {
          results.push({ item, ok: false, error });
        }
      }
      return results;
    });
    return Promise.all(runners).then(function flatten(groups) {
      return groups.flat();
    });
  }

  function isSuccessfulResponse(response) {
    return !!response && response.status >= 200 && response.status < 300 && response.type !== "opaque";
  }

  function install(scope, rawOptions) {
    if (!scope?.addEventListener || !scope?.caches || !scope?.fetch) {
      throw new TypeError("Koz PWA service worker requires a service-worker-like scope");
    }

    const options = rawOptions || {};
    const cacheNames = createCacheNames(options);
    const critical = normalizeEntries(options.critical);
    const optional = normalizeEntries(options.optional);
    const knownPaths = new Set(critical.concat(optional));
    const navigationFallback = normalizePath(options.navigationFallback || "/index.html");
    const networkOnly = (options.networkOnly || ["/api/"]).map(normalizePath);
    const fetchImpl = scope.fetch.bind(scope);
    const warmOptionalOnInstall = options.warmOptionalOnInstall !== false;

    function requestFor(path) {
      return new Request(new URL(path, scope.location.origin).toString(), {
        cache: "reload",
        credentials: "same-origin",
      });
    }

    async function fetchIntoCache(cache, path) {
      const response = await fetchImpl(requestFor(path));
      if (!isSuccessfulResponse(response)) {
        throw new Error(`Unable to precache ${path}: HTTP ${response?.status || "unknown"}`);
      }
      await cache.put(path, response);
      return path;
    }

    async function fillCache(paths, concurrency) {
      const cache = await scope.caches.open(cacheNames.precache);
      return createPool(paths, concurrency, function cachePath(path) {
        return fetchIntoCache(cache, path);
      });
    }

    async function cacheCritical() {
      const results = await fillCache(critical, options.concurrency || 4);
      const failures = results.filter(function failed(result) { return !result.ok; });
      if (failures.length) {
        await scope.caches.delete(cacheNames.precache);
        const failedPaths = failures.map(function failedPath(result) { return result.item; });
        throw new Error(`Critical PWA precache failed: ${failedPaths.join(", ")}`);
      }
      return results;
    }

    async function warmOptional() {
      const results = await fillCache(optional, options.optionalConcurrency || 2);
      return {
        cached: results.filter(function passed(result) { return result.ok; }).length,
        failed: results.filter(function failed(result) { return !result.ok; })
          .map(function failedPath(result) { return result.item; }),
      };
    }

    async function cleanupOldCaches() {
      const keep = new Set([cacheNames.precache, cacheNames.runtime]);
      const keys = await scope.caches.keys();
      await Promise.all(keys.filter(function staleCache(key) {
        return key.startsWith(cacheNames.prefix) && !keep.has(key);
      }).map(function removeCache(key) {
        return scope.caches.delete(key);
      }));
    }

    async function matchPrecache(path) {
      const cache = await scope.caches.open(cacheNames.precache);
      return cache.match(path);
    }

    async function putRuntime(request, response) {
      if (!isSuccessfulResponse(response)) return;
      const cache = await scope.caches.open(cacheNames.runtime);
      await cache.put(request, response);
    }

    // A network error rejection from respondWith() is fatal to the page, so an
    // uncacheable offline miss degrades to a response the caller can handle.
    // Media and images simply fire their own error events on a 503, but a script
    // or stylesheet that 503s aborts the importing module graph, so those get an
    // empty 200 body and fail at the point of use instead of at load.
    const EMPTY_BODY_DESTINATIONS = new Set(["script", "worker", "style"]);

    function offlineResponse(request) {
      if (EMPTY_BODY_DESTINATIONS.has(request?.destination)) {
        const type = request.destination === "style" ? "text/css" : "text/javascript";
        return new Response("", { status: 200, headers: { "Content-Type": type } });
      }
      return new Response("Offline", {
        status: 503,
        statusText: "Offline",
        headers: { "Content-Type": "text/plain" },
      });
    }

    function isNetworkOnly(pathname) {
      return networkOnly.some(function matches(prefix) {
        return pathname === prefix || pathname.startsWith(prefix);
      });
    }

    async function handleNavigation(request, url, event) {
      const pathname = decodePathname(url.pathname);
      const directPath = knownPaths.has(pathname) ? pathname : null;
      const cached = directPath ? await matchPrecache(directPath) : null;
      if (cached) return cached;

      try {
        const response = await fetchImpl(request);
        if (isSuccessfulResponse(response)) {
          const copy = response.clone();
          const write = putRuntime(request, copy);
          event.waitUntil?.(write.catch(function ignoreRuntimeWrite() {}));
        }
        return response;
      } catch {
        const runtime = await (await scope.caches.open(cacheNames.runtime)).match(request);
        return runtime || await matchPrecache(navigationFallback)
          || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    }

    async function handleFetch(event) {
      const request = event.request;
      if (!request || request.method !== "GET") return fetchImpl(request);
      const url = new URL(request.url);
      const pathname = decodePathname(url.pathname);
      if (url.origin !== scope.location.origin || isNetworkOnly(pathname)) {
        return fetchImpl(request);
      }

      const isNavigation = request.mode === "navigate" || request.destination === "document";
      if (isNavigation) return handleNavigation(request, url, event);

      if (knownPaths.has(pathname)) {
        const cached = await matchPrecache(pathname);
        if (cached) return cached;
        // Optional entries (audio, credits media) may be absent when quota or an
        // early offline switch cut the warm pass short. A rejected respondWith()
        // surfaces as a network error and can break the running page, so failed
        // asset lookups must resolve to a response instead of throwing.
        const response = await fetchImpl(request).catch(function offlineMiss() { return null; });
        if (!response) return offlineResponse(request);
        if (isSuccessfulResponse(response)) {
          const copy = response.clone();
          const write = scope.caches.open(cacheNames.precache)
            .then(function openPrecache(cache) { return cache.put(pathname, copy); });
          event.waitUntil?.(write.catch(function ignorePrecacheWrite() {}));
        }
        return response;
      }

      const runtimeCache = await scope.caches.open(cacheNames.runtime);
      const runtime = await runtimeCache.match(request);
      if (runtime) return runtime;
      const response = await fetchImpl(request).catch(function offlineMiss() { return null; });
      if (!response) return offlineResponse(request);
      if (isSuccessfulResponse(response)) {
        const copy = response.clone();
        const write = runtimeCache.put(request, copy);
        event.waitUntil?.(write.catch(function ignoreRuntimeWrite() {}));
      }
      return response;
    }

    async function getStatus() {
      const cache = await scope.caches.open(cacheNames.precache);
      const keys = await cache.keys();
      const cachedPaths = new Set(keys.map(function keyPath(request) {
        return decodePathname(new URL(request.url).pathname);
      }));
      return {
        version: String(options.version || "dev"),
        criticalReady: critical.every(function cached(path) { return cachedPaths.has(path); }),
        criticalCached: critical.filter(function cached(path) { return cachedPaths.has(path); }).length,
        criticalTotal: critical.length,
        optionalCached: optional.filter(function cached(path) { return cachedPaths.has(path); }).length,
        optionalTotal: optional.length,
      };
    }

    scope.addEventListener("install", function onInstall(event) {
      event.waitUntil((async function installApp() {
        await cacheCritical();
        if (warmOptionalOnInstall) {
          try {
            await warmOptional();
          } catch {
            // Optional media must never invalidate an otherwise playable shell.
          }
        }
      })());
    });

    scope.addEventListener("activate", function onActivate(event) {
      event.waitUntil((async function activateApp() {
        await cleanupOldCaches();
        await scope.clients?.claim?.();
      })());
    });

    scope.addEventListener("fetch", function onFetch(event) {
      if (event.request?.method !== "GET") return;
      const url = new URL(event.request.url);
      if (url.origin !== scope.location.origin) return;
      event.respondWith(handleFetch(event));
    });

    scope.addEventListener("message", function onMessage(event) {
      const type = event.data?.type;
      if (type === "KOZ_PWA_SKIP_WAITING") {
        event.waitUntil?.(scope.skipWaiting());
      } else if (type === "KOZ_PWA_WARM_OPTIONAL") {
        event.waitUntil?.(warmOptional());
      } else if (type === "KOZ_PWA_STATUS") {
        event.waitUntil?.(getStatus().then(function reply(status) {
          event.ports?.[0]?.postMessage(status);
        }));
      }
    });

    return {
      cacheNames,
      critical,
      optional,
      cacheCritical,
      warmOptional,
      cleanupOldCaches,
      handleFetch,
      getStatus,
    };
  }

  return {
    normalizePath,
    decodePathname,
    normalizeEntries,
    createCacheNames,
    createPool,
    isSuccessfulResponse,
    install,
  };
});
