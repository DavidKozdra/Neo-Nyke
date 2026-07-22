const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('HUD layout preview parity', () => {
  const settings = read('js/ui/settings-ui.js');
  const hud = read('js/draw/hud.js');
  const styles = read('css/style.css');

  test('projects live DOM widget bounds into the preview frame', () => {
    expect(settings).toContain('function captureLiveHudLayoutSnapshot()');
    expect(settings).toContain('const rect = live.getBoundingClientRect();');
    expect(settings).toContain('box.style.left = `${liveBounds.left * ratio.x}px`;');
    expect(settings).toContain('box.style.width = `${liveBounds.width * ratio.x}px`;');
    expect(settings).toContain("sizedFromLiveBounds\n        ? 'none'");
    expect(settings).toContain('const width = frame?.clientWidth || rect?.width || 0;');
    expect(styles).toMatch(/\.hud-preview-box\s*\{[\s\S]*?box-sizing:\s*border-box;/);
  });

  test('uses renderer-published viewport bounds for canvas HUD widgets', () => {
    expect(settings).toContain('window.Neo?.minimapLayoutState');
    expect(settings).toContain('window.Neo?.bossBarLayoutState');
    expect(hud).toContain('Neo.bossBarLayoutState = {');
    expect(hud).toContain('viewportBounds,');
    expect(settings).toContain("box.dataset.previewSizedFromBounds = 'canvas';");
  });

  test('does not permanently reveal hidden widgets while measuring them', () => {
    expect(settings).toContain("const hadHiddenClass = live.classList.contains('hidden');");
    expect(settings).toContain("if (hadHiddenClass) live.classList.add('hidden');");
    expect(settings).toContain('if (hadRootHideClass) root.classList.add(def.hideClass);');
  });
});
