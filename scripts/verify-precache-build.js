#!/usr/bin/env node
"use strict";

// Guards the deployed output against the failure mode that silently breaks the
// offline PWA: sw.js lists a URL that is not actually present in the build.
//
// The service worker installs its critical set atomically, so a single missing
// file aborts the whole install and every visitor silently stays on the old
// worker. Optional misses are less severe but still cost offline audio, so both
// are reported. This runs against the built directory rather than the repo
// because the copy step, not the generator, is what drops files.

const fs = require("node:fs");
const path = require("node:path");

const SW_MARKER = "const KOZ_PWA_CONFIG = ";

function readServiceWorkerConfig(swPath) {
  const source = fs.readFileSync(swPath, "utf8");
  const start = source.indexOf(SW_MARKER);
  const end = source.indexOf(";\n\nimportScripts", start);
  if (start === -1 || end === -1) {
    throw new Error(`Could not parse the PWA config out of ${swPath}`);
  }
  return JSON.parse(source.slice(start + SW_MARKER.length, end));
}

// Precache URLs are absolute and percent-decoded on the wire, so map them back
// to on-disk paths the same way a static file server resolves a request.
function toDiskPath(rootDir, url, navigationFallback) {
  const pathname = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  const relative = pathname === "/" ? navigationFallback : pathname;
  return path.join(rootDir, relative.replace(/^\/+/, ""));
}

function findMissing(rootDir, urls, navigationFallback) {
  return urls.filter(function isMissing(url) {
    const target = toDiskPath(rootDir, url, navigationFallback);
    return !fs.existsSync(target) || !fs.statSync(target).isFile();
  });
}

function verifyPrecacheBuild(rootDir) {
  const swPath = path.join(rootDir, "sw.js");
  if (!fs.existsSync(swPath)) {
    throw new Error(`No sw.js in ${rootDir}. Run the build before verifying it.`);
  }

  const config = readServiceWorkerConfig(swPath);
  const fallback = config.navigationFallback || "/index.html";
  const critical = findMissing(rootDir, config.critical || [], fallback);
  const optional = findMissing(rootDir, config.optional || [], fallback);

  return {
    version: config.version,
    critical,
    optional,
    ok: critical.length === 0 && optional.length === 0,
  };
}

function reportAndExit(rootDir) {
  const result = verifyPrecacheBuild(rootDir);

  for (const url of result.critical) {
    console.error(`  missing (critical): ${url}`);
  }
  for (const url of result.optional) {
    console.error(`  missing (optional): ${url}`);
  }

  if (result.critical.length) {
    console.error(
      `\n${rootDir}: ${result.critical.length} critical precache file(s) missing. `
      + "The service worker install is atomic, so this build cannot go offline at all. "
      + "Add the missing paths to the build copy step."
    );
    process.exitCode = 1;
    return result;
  }

  if (result.optional.length) {
    console.error(
      `\n${rootDir}: ${result.optional.length} optional precache file(s) missing. `
      + "The shell still installs, but this media will not be available offline."
    );
    process.exitCode = 1;
    return result;
  }

  console.log(
    `${rootDir}: every precached URL is present (version ${result.version}).`
  );
  return result;
}

if (require.main === module) {
  reportAndExit(process.argv[2] || "dist");
}

module.exports = { verifyPrecacheBuild, readServiceWorkerConfig };
