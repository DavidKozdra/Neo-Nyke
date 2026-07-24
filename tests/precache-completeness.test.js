const fs = require('node:fs');
const path = require('node:path');
const { buildPrecacheList, readCurrentPrecache } = require('../scripts/generate-precache');

const ROOT = path.resolve(__dirname, '..');

// The PWA is only truly offline if sw.js precaches every asset and module the app
// loads at runtime. The list is generated (scripts/generate-precache.js); these
// tests guard that it stays complete and that nobody hand-edits it back into the
// stale state that broke offline (music, most sprites and three.js were missing).
describe('service worker precache completeness', () => {
  const cached = new Set(readCurrentPrecache());

  test('sw.js PRECACHE matches the generated list exactly (run npm run precache if this fails)', () => {
    const expected = buildPrecacheList();
    expect(readCurrentPrecache()).toEqual(expected);
  });

  test('every runtime sound file is cached', () => {
    const sfxSource = fs.readFileSync(path.join(ROOT, 'js/core/sfx.js'), 'utf8')
      + fs.readFileSync(path.join(ROOT, 'js/core/music.js'), 'utf8');
    const sounds = [...new Set(sfxSource.match(/assets\/sounds\/[^'"]+\.(?:wav|mp3|ogg)/g) || [])];
    expect(sounds.length).toBeGreaterThan(40); // sanity: we found the references
    const missing = sounds.filter(s => !cached.has('/' + s));
    expect(missing).toEqual([]);
  });

  test('every character/environment sprite PNG is cached', () => {
    const drawSources = ['js/draw/character-sheets.js', 'js/draw/image-assets.js', 'js/draw/atlas.js']
      .filter(rel => fs.existsSync(path.join(ROOT, rel)))
      .map(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8'))
      .join('\n');
    const pngs = [...new Set(drawSources.match(/assets\/sprites\/[^'"]+\.png/g) || [])];
    const missing = pngs.filter(p => !cached.has('/' + p));
    expect(missing).toEqual([]);
  });

  test('the three.js vendor bundle is cached (3D mode must work offline)', () => {
    expect(cached.has('/js/vendor/three.module.js')).toBe(true);
    expect(cached.has('/js/vendor/three.core.js')).toBe(true);
  });

  test('every locale file is cached', () => {
    const locales = fs.readdirSync(path.join(ROOT, 'assets/i18n'))
      .filter(name => name.endsWith('.json'));
    const missing = locales.filter(name => !cached.has(`/assets/i18n/${name}`));
    expect(missing).toEqual([]);
  });

  test('every Koz Engine runtime module is cached', () => {
    const engineRoot = path.join(ROOT, 'Koz_Engine_Lib');
    const queue = [engineRoot];
    const modules = [];
    while (queue.length) {
      const directory = queue.shift();
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) queue.push(absolute);
        else if (entry.isFile() && entry.name.endsWith('.js')) {
          modules.push('/' + path.relative(ROOT, absolute).split(path.sep).join('/'));
        }
      }
    }
    expect(modules.filter(modulePath => !cached.has(modulePath))).toEqual([]);
  });

  test('editor sources are NOT shipped into the cache', () => {
    const leaked = [...cached].filter(url => /\.(ase|aseprite|psd)$/i.test(url));
    expect(leaked).toEqual([]);
  });
});
