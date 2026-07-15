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
    expect(source).toContain('function drawEnemyNameplate(enemy, hpPct)');
    expect(source).toContain('drawEnemyNameplate(enemy, hpPct);');
    expect(source).toContain('const text = `${label}  ${level}  ${hpText}`;');
    expect(source).toContain('const plateW = Math.max(46, textWidth + 10);');
    expect(source).toContain('const enemyNameplateCache = new WeakMap()');
    expect(source).toContain('function buildEnemyNameplateRender(enemy, hpPct)');
    expect(source).toContain('drawCombatBar(ctx, barX, barY, barW, 5, hpPct, healthColor');
    expect(source).toContain('enemyNameplateCache.set(enemy, render)');
    expect(source).toContain("if (entity?.type === 'rival') return entity.rivalData?.color");
    expect(source).not.toContain('fitCanvasText');
  });

  test('CSS defines framed HP tracks and critical state styling', () => {
    const source = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');

    expect(source).toContain('.player-stat-chip');
    expect(source).toContain('.player-stat-card--critical .player-hp-bar');
    expect(source).toContain('@keyframes hp-critical-pulse');
  });
});
