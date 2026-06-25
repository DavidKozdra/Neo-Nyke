const fs = require('node:fs');
const path = require('node:path');

const hud = fs.readFileSync(path.join(__dirname, '../js/draw/hud.js'), 'utf8');

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
});
