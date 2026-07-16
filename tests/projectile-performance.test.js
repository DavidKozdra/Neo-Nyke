const fs = require('node:fs');
const path = require('node:path');

describe('projectile rendering performance safeguards', () => {
  const props = fs.readFileSync(path.join(__dirname, '../js/draw/props.js'), 'utf8');
  const world = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
  const viewport = fs.readFileSync(path.join(__dirname, '../js/draw/viewport.js'), 'utf8');
  const perf = fs.readFileSync(path.join(__dirname, '../js/core/perf.js'), 'utf8');

  test('caches rock bodies and shared floor-tinted visuals', () => {
    expect(props).toContain('const rockSpriteCache = new Map()');
    expect(props).toContain('const rockVisualCache = new Map()');
    expect(props).toContain('const sprite = getRockSprite(projectile, visual, r)');
    expect(props).toContain('Neo.ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2)');
  });

  test('batches each projectile trail into one path and drops dense-scene blur', () => {
    expect(props).toContain('projectileCount >= 64 || (adaptiveQuality >= 1 && projectileCount >= 24)');
    expect(props).toContain('Neo.ctx.shadowBlur = denseProjectileTrails ? 0 : 6');
    expect(props).toContain('const oldest = trail[trail.length - 1]');
    expect(props).toContain('Neo.ctx.lineTo(projectile.x, projectile.y)');
  });

  test('drops per-body glow only at extreme counts in performance mode', () => {
    expect(props).toContain('projectileCount >= 160 || (adaptiveQuality >= 2 && projectileCount >= 48)');
    expect(props).toContain('Neo.ctx.shadowBlur = denseProjectileBodies ? 0 : (projectile.enemy ? 12 : 14)');
  });

  test('recycles trail points instead of allocating one per projectile per frame', () => {
    expect(world).toContain("projectile.trail.length >= cap ? projectile.trail.pop() : { x: 0, y: 0 }");
    expect(world).toContain('projectile.trail.unshift(point)');
  });

  test('culls shots per viewport and reports their timing separately', () => {
    expect(props).toContain('function drawProjectiles(viewportBounds = null)');
    expect(viewport).toContain('Neo.drawProjectiles({');
    expect(viewport).toContain("Neo.perfEnd('draw.projectiles', sectionPerfStart)");
    expect(perf).toContain("shots ${formatPerfMs(avg['draw.projectiles'])}");
  });
});
