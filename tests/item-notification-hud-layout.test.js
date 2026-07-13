const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(__dirname, '../css/mobile.css'), 'utf8');
const settings = fs.readFileSync(path.join(__dirname, '../js/ui/settings-ui.js'), 'utf8');

describe('new-item notification HUD layout', () => {
  test('is represented by a real toast mock in the HUD preview', () => {
    expect(html).toContain('data-preview="itemnotify"');
    expect(html).toContain('data-preview-item-notify-icon');
    expect(html).toContain('Item description appears here.');
    expect(settings).toContain("key === 'itemnotify'");
    expect(settings).toContain("frame.querySelector('[data-preview-item-notify-icon]')");
  });



  test('gives item descriptions a wider live notification card', () => {
    expect(css).toContain('width: min(520px, calc(100vw - 32px))');
  });
});
