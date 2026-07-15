const fs = require('node:fs');
const path = require('node:path');

describe('HUD rendering performance safeguards', () => {
  const entities = fs.readFileSync(path.join(__dirname, '../js/draw/entities.js'), 'utf8');
  const viewport = fs.readFileSync(path.join(__dirname, '../js/draw/viewport.js'), 'utf8');
  const hud = fs.readFileSync(path.join(__dirname, '../js/game/hud.js'), 'utf8');

  test('caches unchanged enemy nameplates as a single bitmap draw', () => {
    expect(entities).toContain('const enemyNameplateCache = new WeakMap()');
    expect(entities).toContain('if (cached?.signature === signature) return cached');
    expect(entities).toContain('enemyNameplateCache.set(enemy, render)');
    expect(entities).toContain('Neo.ctx.drawImage(');
  });

  test('culls off-camera enemies per viewport and reports entity timing', () => {
    expect(entities).toContain('function drawEnemies(viewportBounds = null)');
    expect(viewport).toContain('Neo.drawEnemies({');
    expect(viewport).toContain("Neo.perfEnd('draw.entities', sectionPerfStart)");
  });

  test('updates equipment DOM and icons only when their signatures change', () => {
    expect(hud).toContain('if (node._equipmentSignature === signature) return');
    expect(hud).toContain('node._equipmentSignature = signature');
    expect(hud).toContain('node._equipmentIconKey !== itemKey');
  });
});
