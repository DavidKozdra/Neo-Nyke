const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyPrecacheBuild } = require('../scripts/verify-precache-build.js');

function writeBuild(rootDir, config, files) {
  fs.writeFileSync(
    path.join(rootDir, 'sw.js'),
    `const KOZ_PWA_CONFIG = ${JSON.stringify(config, null, 2)};\n\nimportScripts("/x.js");\n`
  );
  for (const relative of files) {
    const target = path.join(rootDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'content');
  }
}

describe('precache build verification', () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neonyke-build-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('passes when every precached URL is present in the build', () => {
    writeBuild(directory, {
      critical: ['/', '/index.html', '/js/main.js'],
      optional: ['/assets/sounds/hit.wav'],
      navigationFallback: '/index.html',
      version: 'abc123',
    }, ['index.html', 'js/main.js', 'assets/sounds/hit.wav']);

    const result = verifyPrecacheBuild(directory);

    expect(result.ok).toBe(true);
    expect(result.critical).toEqual([]);
    expect(result.version).toBe('abc123');
  });

  test('reports a critical file the copy step dropped', () => {
    writeBuild(directory, {
      critical: ['/index.html', '/js/main.js'],
      optional: [],
      navigationFallback: '/index.html',
      version: 'abc123',
    }, ['index.html']);

    const result = verifyPrecacheBuild(directory);

    expect(result.ok).toBe(false);
    expect(result.critical).toEqual(['/js/main.js']);
  });

  test('separates optional misses so a shell-only build is still diagnosable', () => {
    writeBuild(directory, {
      critical: ['/index.html'],
      optional: ['/assets/sounds/hit.wav'],
      navigationFallback: '/index.html',
      version: 'abc123',
    }, ['index.html']);

    const result = verifyPrecacheBuild(directory);

    expect(result.ok).toBe(false);
    expect(result.critical).toEqual([]);
    expect(result.optional).toEqual(['/assets/sounds/hit.wav']);
  });

  test('resolves "/" through the navigation fallback and decodes escaped paths', () => {
    writeBuild(directory, {
      critical: ['/', '/assets/hero%20sprite.png'],
      optional: [],
      navigationFallback: '/index.html',
      version: 'abc123',
    }, ['index.html', 'assets/hero sprite.png']);

    expect(verifyPrecacheBuild(directory).ok).toBe(true);
  });

  test('fails loudly when the build has no service worker at all', () => {
    expect(() => verifyPrecacheBuild(directory)).toThrow(/No sw\.js/);
  });
});
