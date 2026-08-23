const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../js/ui/unlock-banner.js'), 'utf8');

describe('overlay confetti particle system', () => {
  test('runs on the shared spawn/tick/draw particle model', () => {
    expect(source).toContain('function spawnOverlayParticle(props)');
    expect(source).toContain('function updateOverlayParticles(dt)');
    expect(source).toContain('function drawOverlayParticles()');
    // Confetti spawns through the shared model rather than pushing a bespoke
    // object shape of its own.
    expect(source).toContain('spawnOverlayParticle({');
    expect(source).not.toContain('confettiParticles.push(');
  });

  // Regression: resizeConfettiCanvas() ran on every spawn, and assigning
  // canvas.width clears the canvas. The win screen fires two bursts back to
  // back, so the second wiped the first mid-flight.
  test('resize is a no-op when the size is unchanged, so a second burst cannot wipe the first', () => {
    const resize = source.slice(source.indexOf('function resizeOverlayCanvas()'));
    const body = resize.slice(0, resize.indexOf('\n}\n') + 3);
    expect(body).toContain('if (overlayCanvas.width === w && overlayCanvas.height === h) return;');
    // The early return must precede the clearing assignments.
    expect(body.indexOf('=== w &&')).toBeLessThan(body.indexOf('overlayCanvas.width = w;'));
  });

  test('honours the accessibility switches the world particles respect', () => {
    expect(source).toContain('if (access.reduceMotion) return;');
    expect(source).toContain('if (access.reduceParticles) count = Math.max(1, Math.round(count * 0.25));');
  });

  test('keeps the #confettiCanvas id that CSS and the princess theme target', () => {
    expect(source).toContain("overlayCanvas.id = 'confettiCanvas';");
  });

  test('caps particle count and self-stops its loop when empty', () => {
    expect(source).toContain('const OVERLAY_MAX_PARTICLES = 400;');
    expect(source).toContain('if (overlayParticles.length >= OVERLAY_MAX_PARTICLES) return;');
    expect(source).toContain('overlayRaf = 0;');
  });

  test('stays cosmetic-only so seeded runs remain deterministic', () => {
    const spawn = source.slice(source.indexOf('function spawnConfetti(options'));
    const body = spawn.slice(0, spawn.indexOf('\n}\n') + 3);
    // Strip comments first: the body documents that it never uses Neo.rng, and
    // that prose would otherwise trip the assertion below.
    const code = body.replace(/\/\/[^\n]*/g, '');
    expect(code).toContain('Math.random()');
    expect(code).not.toMatch(/Neo\.(rng|nextRandom|irand|rand)\b/);
  });
});
