const fs = require('node:fs');
const path = require('node:path');

describe('offline PWA entry points', () => {
  const root = path.join(__dirname, '..');
  const generator = fs.readFileSync(path.join(root, 'scripts/generate-precache.js'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  test('precache generation permanently includes both browser entry points', () => {
    expect(generator).toContain("urls.add('/');");
    expect(generator).toContain("urls.add('/index.html');");
    expect(generator).toContain("urls.add('/game.html');");
    expect(worker).toContain('"/game.html"');
  });

  test('offline document navigation falls back to the cached application shell', () => {
    expect(worker).toContain("isDocument ? await caches.match('/index.html') : undefined");
  });
});
