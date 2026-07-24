#!/usr/bin/env node
"use strict";

// NeoNyke host adapter for Koz Engine's reusable PWA manifest/runtime modules.
// The generated service worker is content-versioned: editing any listed file
// changes the version even when the URL set stays identical.

const fs = require("node:fs");
const path = require("node:path");
const {
  collectFiles,
  createCacheManifest,
  createVersionToken,
} = require("../Koz_Engine_Lib/PWA/cacheManifest");

const ROOT = path.resolve(__dirname, "..");
const SW_PATH = path.join(ROOT, "sw.js");
const INDEX_PATH = path.join(ROOT, "index.html");
const PWA_RUNTIME_URL = "/Koz_Engine_Lib/PWA/serviceWorkerRuntime.js";
// 3D is loaded with import() only after a player selects it, so it is not
// reachable from main.js's static graph. Keep it precached for offline players.
const DYNAMIC_MODULE_ENTRIES = [
  path.join(ROOT, "js", "draw", "three-renderer.js"),
];

const SHIPPABLE_ASSET_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".wav", ".mp3", ".ogg", ".m4a",
  ".woff2", ".woff", ".ttf", ".otf",
  ".json",
]);
const EXCLUDED_ASSET_EXT = new Set([".ase", ".aseprite", ".psd", ".md", ".txt"]);
const IMPORT_RE = /(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"](\.[^'"]+)['"]/g;

function toAbsUrlPath(fileAbs) {
  return `/${path.relative(ROOT, fileAbs).split(path.sep).join("/")}`;
}

function collectModuleGraph(entryAbs) {
  const seen = new Set();
  const queue = [entryAbs];
  while (queue.length) {
    const fileAbs = queue.shift();
    if (seen.has(fileAbs)) continue;
    seen.add(fileAbs);
    let source;
    try {
      source = fs.readFileSync(fileAbs, "utf8");
    } catch {
      throw new Error(`Precache module graph references a missing file: ${toAbsUrlPath(fileAbs)}`);
    }
    let match;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(source))) {
      queue.push(path.resolve(path.dirname(fileAbs), match[1]));
    }
  }
  return seen;
}

function collectIndexReferences() {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const refs = new Set();
  const attrRe = /(?:src|href)\s*=\s*"([^"]+)"/g;
  let match;
  while ((match = attrRe.exec(html))) {
    const ref = match[1].trim();
    if (!ref || /^(?:https?:)?\/\//.test(ref) || ref.startsWith("data:")
      || ref.startsWith("#") || ref.startsWith("mailto:")) continue;
    const clean = ref.replace(/^\.?\//, "");
    const absolute = path.join(ROOT, clean);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) refs.add(`/${clean}`);
  }
  return refs;
}

function collectAssets() {
  return collectFiles(path.join(ROOT, "assets"), {
    include: function includeAsset(fileAbs) {
      const extension = path.extname(fileAbs).toLowerCase();
      return SHIPPABLE_ASSET_EXT.has(extension) && !EXCLUDED_ASSET_EXT.has(extension);
    },
  });
}

function collectEngineRuntime() {
  return collectFiles(path.join(ROOT, "Koz_Engine_Lib"), {
    include: function includeJavaScript(fileAbs) {
      return path.extname(fileAbs).toLowerCase() === ".js";
    },
  });
}

function buildPrecacheList() {
  const urls = new Set(["/", "/index.html", "/game.html", "/manifest.json"]);

  for (const fileAbs of collectModuleGraph(path.join(ROOT, "js", "main.js"))) {
    urls.add(toAbsUrlPath(fileAbs));
  }
  for (const entryAbs of DYNAMIC_MODULE_ENTRIES) {
    for (const fileAbs of collectModuleGraph(entryAbs)) urls.add(toAbsUrlPath(fileAbs));
  }
  for (const ref of collectIndexReferences()) urls.add(ref);
  for (const fileAbs of collectAssets()) urls.add(toAbsUrlPath(fileAbs));

  // The browser bridge loads CommonJS modules dynamically, so static ESM graph
  // traversal cannot discover them. Include every engine runtime file to keep a
  // newly installed game genuinely offline as the bridge evolves.
  for (const fileAbs of collectEngineRuntime()) urls.add(toAbsUrlPath(fileAbs));

  for (const extra of [
    "/assets/sprites/combatants.js",
    "/assets/sprites/environment.js",
    "/assets/sprites/icons.js",
  ]) {
    if (fs.existsSync(path.join(ROOT, extra.slice(1)))) urls.add(extra);
  }

  return [...urls].sort(function byUrl(a, b) {
    return a.localeCompare(b);
  });
}

function isOptionalUrl(url) {
  // Large audio and credits media improve the offline experience but must not
  // make a mobile install fail when browser quota is constrained.
  return url.startsWith("/assets/sounds/") || url.startsWith("/assets/credits-images/");
}

function createGeneratedConfig() {
  const urls = buildPrecacheList();
  const optionalUrls = urls.filter(isOptionalUrl);
  const manifest = createCacheManifest({
    rootDir: ROOT,
    urls,
    optionalUrls,
    aliases: { "/": "index.html" },
  });

  const config = {
    cachePrefix: "neonyke",
    critical: manifest.critical.map(function toUrl(entry) { return entry.url; }),
    optional: manifest.optional.map(function toUrl(entry) { return entry.url; }),
    navigationFallback: "/index.html",
    networkOnly: ["/api/"],
    concurrency: 4,
    optionalConcurrency: 2,
    warmOptionalOnInstall: true,
    manifestSummary: manifest.totals,
  };
  config.version = createVersionToken({
    contentVersion: manifest.version,
    cachePrefix: config.cachePrefix,
    critical: config.critical,
    optional: config.optional,
    navigationFallback: config.navigationFallback,
    networkOnly: config.networkOnly,
    concurrency: config.concurrency,
    optionalConcurrency: config.optionalConcurrency,
    warmOptionalOnInstall: config.warmOptionalOnInstall,
  });
  return config;
}

function renderServiceWorker(config) {
  return [
    "// Generated by scripts/generate-precache.js. Do not hand-edit.",
    `const KOZ_PWA_CONFIG = ${JSON.stringify(config, null, 2)};`,
    "",
    `importScripts(${JSON.stringify(PWA_RUNTIME_URL)});`,
    "self.KozPwaServiceWorker.install(self, KOZ_PWA_CONFIG);",
    "",
  ].join("\n");
}

function readCurrentConfig() {
  if (!fs.existsSync(SW_PATH)) return null;
  const source = fs.readFileSync(SW_PATH, "utf8");
  const marker = "const KOZ_PWA_CONFIG = ";
  const start = source.indexOf(marker);
  const end = source.indexOf(";\n\nimportScripts", start);
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(source.slice(start + marker.length, end));
  } catch {
    return null;
  }
}

function readCurrentPrecache() {
  const config = readCurrentConfig();
  return [...(config?.critical || []), ...(config?.optional || [])]
    .sort(function byUrl(a, b) { return a.localeCompare(b); });
}

function rewriteServiceWorker(options) {
  const opts = options || {};
  const config = createGeneratedConfig();
  const rendered = renderServiceWorker(config);
  const current = fs.existsSync(SW_PATH) ? fs.readFileSync(SW_PATH, "utf8") : "";
  const summary = config.manifestSummary;
  const message = `${summary.entries} entries, ${(summary.bytes / 1048576).toFixed(2)} MiB, version ${config.version}`;

  if (opts.check) {
    if (current !== rendered) {
      console.error("sw.js is stale. Run: node scripts/generate-precache.js");
      process.exitCode = 1;
      return false;
    }
    console.log(`sw.js content manifest is up to date (${message}).`);
    return true;
  }

  if (current === rendered) {
    console.log(`sw.js already up to date (${message}).`);
    return false;
  }
  fs.writeFileSync(SW_PATH, rendered);
  console.log(`sw.js regenerated (${message}).`);
  return true;
}

if (require.main === module) {
  rewriteServiceWorker({ check: process.argv.includes("--check") });
}

module.exports = {
  buildPrecacheList,
  createGeneratedConfig,
  isOptionalUrl,
  readCurrentConfig,
  readCurrentPrecache,
  renderServiceWorker,
  rewriteServiceWorker,
};
