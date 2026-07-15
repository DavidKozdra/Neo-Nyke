const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(__dirname, '../css/mobile.css'), 'utf8');
const settings = fs.readFileSync(path.join(__dirname, '../js/ui/settings-ui.js'), 'utf8');
const drawHud = fs.readFileSync(path.join(__dirname, '../js/draw/hud.js'), 'utf8');

describe('HUD preview synchronization', () => {
  test('derives DOM preview anchors from the live responsive CSS', () => {
    expect(settings).toContain('syncPreviewAnchorFromLiveCss(box, key, ratio)');
    expect(settings).toContain("selector: '#coinDisplay'");
    expect(settings).toContain("selector: '#objectiveTracker'");
    expect(settings).not.toContain("box.style.right = `${206 * ratio.x}px`");
  });

  test('uses shared render multipliers for DOM and canvas widgets', () => {
    expect(settings).toContain('renderScale: 2, compactRenderScale: 1');
    expect(settings).toContain('renderScale: 1.5, compactRenderScale: 1');
    expect(settings).toContain('effectiveHudRenderScale(el.key)');
    expect(drawHud).toContain("getHudRenderMultiplier?.('bossbar')");
    expect(drawHud).toContain("getHudAnchor?.('bossbar', 'top')");
    expect(css).not.toContain('scale(calc(2 * var(--hud-scale-stats');
    expect(css).not.toContain('scale(calc(1.5 * var(--hud-scale-actions');
  });

  test('keeps compact HUD offsets and panel tabs on the intended axes', () => {
    expect(mobileCss).toContain('translate(var(--hud-x-stats, 0px), var(--hud-y-stats, 0px))');
    expect(mobileCss).toContain('translate(var(--hud-x-objectives, 0px), var(--hud-y-objectives, 0px))');
    expect(css).toContain('overflow-y: hidden');
    expect(html).not.toContain('inv-ux-hint');
  });
});
