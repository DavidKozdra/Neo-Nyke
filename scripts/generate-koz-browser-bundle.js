#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PACKAGE_ROOT = path.dirname(require.resolve("koz-engine-lib/package.json"));
const BRIDGE_PATH = path.join(PACKAGE_ROOT, "Core", "koz-engine.global.js");
const PWA_RUNTIME_PATH = path.join(PACKAGE_ROOT, "PWA", "serviceWorkerRuntime.js");
const OUTPUT_PATH = path.join(ROOT, "js", "vendor", "koz-engine.browser-bundle.js");
const PWA_OUTPUT_PATH = path.join(ROOT, "js", "vendor", "koz-pwa-service-worker-runtime.js");
const MODULE_PATH_RE = /\bpath:\s*["'](Koz_Engine_Lib\/[^"']+\.js)["']/g;
const REQUIRE_RE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

function normalizeModulePath(value) {
  const parts = [];
  for (const segment of String(value || "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  const normalized = parts.join("/");
  return normalized.endsWith(".js") ? normalized : `${normalized}.js`;
}

function resolveDependency(fromPath, request) {
  if (request.startsWith("Koz_Engine_Lib/")) return normalizeModulePath(request);
  if (request.startsWith("./") || request.startsWith("../")) {
    return normalizeModulePath(`${path.posix.dirname(fromPath)}/${request}`);
  }
  return null;
}

function collectModuleSources(bridgeSource) {
  const sources = new Map();
  const queue = [];
  let match;
  MODULE_PATH_RE.lastIndex = 0;
  while ((match = MODULE_PATH_RE.exec(bridgeSource))) queue.push(normalizeModulePath(match[1]));

  while (queue.length) {
    const modulePath = queue.shift();
    if (sources.has(modulePath)) continue;
    const packageRelativePath = modulePath.replace(/^Koz_Engine_Lib\//, "");
    const filePath = path.join(PACKAGE_ROOT, packageRelativePath);
    if (!fs.existsSync(filePath)) throw new Error(`Engine bundle references a missing module: ${modulePath}`);
    const source = fs.readFileSync(filePath, "utf8");
    sources.set(modulePath, source);

    REQUIRE_RE.lastIndex = 0;
    while ((match = REQUIRE_RE.exec(source))) {
      const dependency = resolveDependency(modulePath, match[1]);
      if (dependency && !sources.has(dependency)) queue.push(dependency);
    }
  }

  return Object.fromEntries([...sources.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

// The package bridge can load its CommonJS files from a served source tree.
// NeoNyke ships one static asset instead, so route those reads to embedded
// package sources and fail loudly when a future package changes the bridge.
function adaptBridgeForEmbeddedSources(bridgeSource) {
  const sourceGuard = '  if (typeof XMLHttpRequest !== "function") return;';
  const embeddedSourceGuard = [
    '  const bundledSources = root.__KOZ_ENGINE_MODULE_SOURCES__ || null;',
    '  if (!bundledSources && typeof XMLHttpRequest !== "function") return;',
  ].join("\n");
  const xhrLoader = [
    '    const request = new XMLHttpRequest();',
    '    request.open("GET", normalizedPath, false);',
    '    request.send(null);',
    '',
    '    if (!((request.status >= 200 && request.status < 300) || request.status === 0)) {',
    '      throw new Error(`Failed to load engine module: ${normalizedPath} (${request.status})`);',
    '    }',
  ].join("\n");
  const embeddedLoader = [
    '    let source = bundledSources?.[normalizedPath];',
    '    if (typeof source !== "string") {',
    '      const request = new XMLHttpRequest();',
    '      request.open("GET", normalizedPath, false);',
    '      request.send(null);',
    '',
    '      if (!((request.status >= 200 && request.status < 300) || request.status === 0)) {',
    '        throw new Error(`Failed to load engine module: ${normalizedPath} (${request.status})`);',
    '      }',
    '      source = request.responseText;',
    '    }',
  ].join("\n");

  if (!bridgeSource.includes(sourceGuard) || !bridgeSource.includes(xhrLoader)) {
    throw new Error("koz-engine-lib browser bridge changed; update the NeoNyke browser adapter");
  }
  return bridgeSource
    .replace(sourceGuard, embeddedSourceGuard)
    .replace(xhrLoader, embeddedLoader)
    .replace('`${request.responseText}\\n//# sourceURL=${normalizedPath}`', '`${source}\\n//# sourceURL=${normalizedPath}`');
}

// Preserve NeoNyke's offline contract on top of the reusable runtime: optional
// misses resolve instead of rejecting respondWith(), and late scripts/styles
// receive an inert body so one unavailable asset cannot abort the page.
function adaptPwaRuntimeForOfflineFallbacks(runtimeSource) {
  const networkOnlyMarker = '    function isNetworkOnly(pathname) {';
  const offlineResponse = [
    '    const EMPTY_BODY_DESTINATIONS = new Set(["script", "worker", "style"]);',
    '',
    '    function offlineResponse(request) {',
    '      if (EMPTY_BODY_DESTINATIONS.has(request?.destination)) {',
    '        const type = request.destination === "style" ? "text/css" : "text/javascript";',
    '        return new Response("", { status: 200, headers: { "Content-Type": type } });',
    '      }',
    '      return new Response("Offline", {',
    '        status: 503,',
    '        statusText: "Offline",',
    '        headers: { "Content-Type": "text/plain" },',
    '      });',
    '    }',
    '',
  ].join("\n");
  const knownFetch = [
    '      if (knownPath) {',
    '        const cached = await matchPrecache(knownPath);',
    '        if (cached) return cached;',
    '        const response = await fetchImpl(request);',
    '        if (isSuccessfulResponse(response)) {',
  ].join("\n");
  const safeKnownFetch = [
    '      if (knownPath) {',
    '        const cached = await matchPrecache(knownPath);',
    '        if (cached) return cached;',
    '        const response = await fetchImpl(request).catch(function offlineMiss() { return null; });',
    '        if (!response) return offlineResponse(request);',
    '        if (isSuccessfulResponse(response)) {',
  ].join("\n");
  const runtimeFallback = [
    '        return runtime || new Response("Offline", {',
    '          status: 503,',
    '          headers: { "Content-Type": "text/plain" },',
    '        });',
  ].join("\n");

  if (!runtimeSource.includes(networkOnlyMarker)
    || !runtimeSource.includes(knownFetch)
    || !runtimeSource.includes(runtimeFallback)) {
    throw new Error("koz-engine-lib PWA runtime changed; update the NeoNyke offline adapter");
  }
  return runtimeSource
    .replace(networkOnlyMarker, `${offlineResponse}${networkOnlyMarker}`)
    .replace(knownFetch, safeKnownFetch)
    .replace(runtimeFallback, '        return runtime || offlineResponse(request);');
}

function renderBundle() {
  const bridgeSource = fs.readFileSync(BRIDGE_PATH, "utf8");
  const sources = collectModuleSources(bridgeSource);
  const serializedSources = JSON.stringify(sources).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return [
    "// Generated by scripts/generate-koz-browser-bundle.js. Do not hand-edit.",
    `(function(root){root.__KOZ_ENGINE_MODULE_SOURCES__=${serializedSources};})(typeof window!==\"undefined\"?window:globalThis);`,
    adaptBridgeForEmbeddedSources(bridgeSource),
    "",
  ].join("\n");
}

function writeBundle({ check = false } = {}) {
  const rendered = renderBundle();
  const current = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, "utf8") : "";
  const runtime = adaptPwaRuntimeForOfflineFallbacks(fs.readFileSync(PWA_RUNTIME_PATH, "utf8"));
  const currentRuntime = fs.existsSync(PWA_OUTPUT_PATH) ? fs.readFileSync(PWA_OUTPUT_PATH, "utf8") : "";
  const bundleChanged = current !== rendered;
  const runtimeChanged = currentRuntime !== runtime;

  if (!bundleChanged && !runtimeChanged) {
    console.log("Koz browser assets are up to date.");
    return false;
  }
  if (check) {
    console.error("Koz browser assets are stale. Run: npm run koz-bundle");
    process.exitCode = 1;
    return false;
  }
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  if (bundleChanged) fs.writeFileSync(OUTPUT_PATH, rendered);
  if (runtimeChanged) fs.writeFileSync(PWA_OUTPUT_PATH, runtime);
  console.log(
    `Koz browser assets generated from koz-engine-lib (${(Buffer.byteLength(rendered) / 1024).toFixed(1)} KiB bundle).`
  );
  return true;
}

if (require.main === module) writeBundle({ check: process.argv.includes("--check") });

module.exports = {
  BRIDGE_PATH,
  OUTPUT_PATH,
  PACKAGE_ROOT,
  PWA_OUTPUT_PATH,
  adaptBridgeForEmbeddedSources,
  adaptPwaRuntimeForOfflineFallbacks,
  collectModuleSources,
  renderBundle,
  writeBundle,
};
