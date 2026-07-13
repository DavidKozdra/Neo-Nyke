const fs = require('node:fs');
const path = require('node:path');

const hud = fs.readFileSync(path.join(__dirname, '../js/draw/hud.js'), 'utf8');
const settings = fs.readFileSync(path.join(__dirname, '../js/ui/settings-ui.js'), 'utf8');

describe('minimap shop and forge highlights', () => {
  test('highlights only revealed non-current shop and forge rooms', () => {
    expect(hud).toContain("(room.type === 'anvil' || room.type === 'shop') && room !== currentRoom");
    expect(hud).toContain('&& roomExplored && showRoomGlyph');
  });

  test('uses distinct service colors and a subtle animated blink', () => {
    expect(hud).toContain("room.type === 'anvil' ? '#ffd27a' : '#bfe4ff'");
    expect(hud).toContain('Math.sin(Number(Neo.gameElapsedTime || 0) * 3.0)');
    expect(hud).toContain('const blink = 0.35 + 0.65 *');
    expect(hud).toContain('Neo.ctx.globalAlpha = blink');
  });

  test('draws a scaled outer ring and restores canvas alpha afterward', () => {
    expect(hud).toContain('const ringW = Math.max(1, Math.round(size * 0.12))');
    expect(hud).toContain('Neo.ctx.strokeRect(x - 1.5, y - 1.5, size + 3, size + 3)');
    expect(hud).toContain('Neo.ctx.globalAlpha = 1');
  });

  test('defaults to the top-right HUD anchor in live draw and preview fallback', () => {
    expect(hud).toContain('const originX = Math.round(visibleCanvasRight - mapWidth - edgeInsetX + minimapOffsetX / scaleX)');
    expect(hud).toContain('const originY = Math.round(visibleCanvasTop + topInset + minimapOffsetY / scaleY)');
    expect(settings).toContain('box.style.top = `${(window.innerWidth <= 920 ? 8 : 12) * ratio.y}px`');
    expect(settings).toContain('box.style.right = `${(window.innerWidth <= 920 ? 8 : 12) * ratio.x}px`');
    expect(settings).toContain("defaultScale: 1.25");
    expect(hud).toContain('const hudScale = Number.isFinite(ownScale) ? Neo.clamp(ownScale, 0.5, 2) : 1.25');
    expect(settings).not.toContain('scheduleHudOverlapCorrection({ saveAfter: true });\n\n  //');
    expect(settings).toContain("if (moving.key === 'minimap' && fixed.key !== 'minimap')");
  });
});
