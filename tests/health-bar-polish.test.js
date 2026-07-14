const fs = require('node:fs');
const path = require('node:path');

describe('health bar presentation', () => {
  test('player HP bars include a delayed damage chip layer', () => {
    const source = fs.readFileSync(path.join(__dirname, '../js/game/hud.js'), 'utf8');

    expect(source).toContain('player-stat-chip');
    expect(source).toContain('data-player-field="hpChip"');
    expect(source).toContain('window.setTimeout(() => { refs.hpChip.style.width = hpWidth; }, 360)');
  });

  test('enemy and rival HP bars use the shared compact combat bar renderer', () => {
    const source = fs.readFileSync(path.join(__dirname, '../js/draw/entities.js'), 'utf8');

    expect(source).toContain('function drawCombatBar');
    expect(source).toContain('function getCombatHealthColor');
    expect(source).toContain('drawCombatBar(-20, -enemy.r - 14, 40, 6, hpPct, getCombatHealthColor(enemy)');
    expect(source).toContain("if (entity?.type === 'rival') return entity.rivalData?.color");
  });

  test('CSS defines framed HP tracks and critical state styling', () => {
    const source = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');

    expect(source).toContain('.player-stat-chip');
    expect(source).toContain('.player-stat-card--critical .player-hp-bar');
    expect(source).toContain('@keyframes hp-critical-pulse');
  });
});
