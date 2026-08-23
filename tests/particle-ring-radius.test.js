const fs = require('node:fs');
const path = require('node:path');

// Regression: ctx.arc() throws IndexSizeError on a negative radius, which kills
// the entire particle pass for that frame (drawParticles -> drawWorldViewport ->
// draw -> loop). Several ring call sites derive their radius by subtracting a
// constant from an ability radius (`aoeRadius - 24`, `smashRadius - 30`,
// `hammer.radius - 20`), so a small ability — or a 0 aoeRadiusMultiplier —
// produces a negative. A ring particle also grows +200/s per tick, so an
// unclamped negative keeps throwing every frame until it climbs back above 0.
describe('ring particle radius is never negative', () => {
  const world = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
  const hud = fs.readFileSync(path.join(__dirname, '../js/draw/hud.js'), 'utf8');

  test('spawnParticle clamps the ring radius at the spawn chokepoint', () => {
    expect(world).toContain('p.ring = props.ring == null ? null : Math.max(0, Number(props.ring) || 0);');
  });

  test('the 2D draw path clamps before calling ctx.arc', () => {
    expect(hud).toContain('const ringRadius = Math.max(0, Number(particle.ring) || 0);');
    expect(hud).toContain('Neo.ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);');
    // The raw `particle.ring` must no longer reach arc() unclamped.
    expect(hud).not.toContain('Neo.ctx.arc(0, 0, particle.ring, 0, Math.PI * 2);');
  });

  test('the clamp maps the reported -8 crash radius to a drawable 0', () => {
    const clamp = ring => (ring == null ? null : Math.max(0, Number(ring) || 0));
    // -8 is the exact radius from the reported IndexSizeError; it arises from
    // e.g. a 16-radius ability minus 24, or a 12-radius hammer minus 20.
    expect(clamp(-8)).toBe(0);
    expect(clamp(16 - 24)).toBe(0);
    expect(clamp(12 - 20)).toBe(0);
    expect(clamp(0 - 24)).toBe(0);
    // Valid radii and the null "not a ring" case are untouched.
    expect(clamp(58)).toBe(58);
    expect(clamp(null)).toBeNull();
  });
});
