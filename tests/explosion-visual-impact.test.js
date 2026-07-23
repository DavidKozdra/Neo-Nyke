const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('layered explosion visual impact', () => {
  const world = read('js/game/world.js');
  const hud = read('js/draw/hud.js');
  const renderer3d = read('js/draw/three-renderer.js');

  test('routes real blast damage through the explosion presentation style', () => {
    const blastStart = world.indexOf('function blastRadius(');
    const blastEnd = world.indexOf('\n  // Detonates an enemy projectile', blastStart);
    expect(world.slice(blastStart, blastEnd)).toContain("spawnAoeShockwave(x, y, radius, color, 'explosion')");
  });

  test('builds explosions from a core, pressure front, square fragments, embers, and smoke', () => {
    const start = world.indexOf('function spawnAoeShockwave(');
    const end = world.indexOf('\n  function recordProjectileTrail', start);
    const shockwave = world.slice(start, end);
    expect(shockwave).toContain('explosionCore: true');
    expect(shockwave).toContain("style: 'pressure'");
    expect(shockwave).toContain('square: heavy');
    expect(shockwave).toContain('smoke: true');
    expect(shockwave).toContain('const emberCount = explosive ? 12 : 7');
    expect(shockwave).toContain("'#fff8dc'");
    expect(shockwave).toContain("c: whiteHot ? '#fff8dc' : color");
  });

  test('keeps accessibility variants for particle count and flash intensity', () => {
    expect(world).toContain('const reducedParticles = !!access.reduceParticles');
    expect(world).toContain('const reducedFlash = !!access.reduceFlash');
    expect(world).toContain('const motionScale = access.reduceMotion ? 0.48 : 1');
    expect(world).toContain('reducedFlash,');
    expect(hud).toContain("reducedFlash ? 'source-over' : 'lighter'");
    expect(renderer3d).toContain('particle.reducedFlash ? 0.62 : 1');
  });

  test('renders the new particle vocabulary in both 2D and 3D', () => {
    expect(hud).toContain('particle.explosionCore');
    expect(hud).toContain('particle.square');
    expect(hud).toContain('Neo.ctx.fillRect(-size / 2, -size / 2, size, size)');
    expect(renderer3d).toContain('function getPixelSquareTexture()');
    expect(renderer3d).toContain('particle.explosionCore');
    expect(renderer3d).toContain('particle.square');
  });

  test('updates square spin, drag, and smoke growth in the pooled lifecycle', () => {
    expect(world).toContain('p.explosionCore = props.explosionCore ?? null');
    expect(world).toContain('const drag = Math.exp(-particle.drag * dt)');
    expect(world).toContain('particle.rotation += particle.spin * dt');
    expect(world).toContain('particle.size += particle.grow * dt');
  });
});
