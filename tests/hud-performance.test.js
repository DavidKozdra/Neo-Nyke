const fs = require('node:fs');
const path = require('node:path');

describe('HUD rendering performance safeguards', () => {
  const entities = fs.readFileSync(path.join(__dirname, '../js/draw/entities.js'), 'utf8');
  const viewport = fs.readFileSync(path.join(__dirname, '../js/draw/viewport.js'), 'utf8');
  const hud = fs.readFileSync(path.join(__dirname, '../js/game/hud.js'), 'utf8');
  const drawHud = fs.readFileSync(path.join(__dirname, '../js/draw/hud.js'), 'utf8');
  const controller = fs.readFileSync(path.join(__dirname, '../js/ui/controller.js'), 'utf8');
  const perf = fs.readFileSync(path.join(__dirname, '../js/core/perf.js'), 'utf8');

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

  test('caches minimap rendering and unchanged objective layout', () => {
    expect(drawHud).toContain('const minimapRenderCache = {');
    expect(drawHud).toContain('signature !== minimapRenderCache.signature || animationDue');
    expect(drawHud).toContain('Neo.ctx.drawImage(cacheCanvas, sx, sy, sw, sh, sx, sy, sw, sh)');
    expect(controller).toContain('if (requestSignature === objectiveLayoutRequestSignature) return');
  });

  test('adapts cosmetic quality after sustained slow frames and recovers gradually', () => {
    expect(perf).toContain('function updateAdaptiveQuality(workMs)');
    expect(perf).toContain('perfState.adaptiveSlowFrames >= degradeThreshold');
    expect(perf).toContain('perfState.adaptiveHealthyFrames >= 240');
    expect(perf).toContain('workP95: percentile(perfState.frameWorkSamples, 0.95)');
  });
});
