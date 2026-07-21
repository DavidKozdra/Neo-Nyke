const fs = require('node:fs');
const path = require('node:path');

describe('3D player status HUD', () => {
  const hud = fs.readFileSync(path.join(__dirname, '../js/game/hud.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');

  test('mirrors active effects into the fixed player card with stacks and time', () => {
    expect(hud).toContain('function renderPlayerStatusHud(row, list, entity)');
    expect(hud).toContain('data-player-field="statusRow"');
    expect(hud).toContain('data-player-field="statusList"');
    expect(hud).toContain('pill.dataset.playerStatus = entry.key');
    expect(hud).toContain("duration: Math.max(0, Number(entity.stun || 0))");
    expect(hud).toContain('remaining`');
    expect(hud).toContain('list._statusPills = new Map()');
    expect(hud).toContain("document.body.classList.contains('render3d')");
  });

  test('shows the fixed status strip in 3D without duplicating it in 2D', () => {
    expect(styles).toMatch(/\.player-status-row\s*\{[\s\S]*?display:\s*none;/);
    expect(styles).toMatch(/body\.render3d \.player-status-row:not\(\[hidden\]\)\s*\{[\s\S]*?display:\s*flex;/);
    expect(styles).toContain('.player-status-effect__time');
  });
});
