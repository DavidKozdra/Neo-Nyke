const geometry = require('../Koz_Engine_Lib/Core/geometry2d');
const { findNearestFromVisit } = require('../Koz_Engine_Lib/Core/targetQuery');
const { advanceCountdown, advanceInterval } = require('../Koz_Engine_Lib/Time/stepTimer');
const { ensureStatusMap, applyStackedStatus, clearStatusState } = require('../Koz_Engine_Lib/Combat/statusBook');
const motion = require('../Koz_Engine_Lib/Combat/projectileMotion');

describe('Koz Engine combat primitives', () => {
  test('shares stable geometry and a spatially-hosted nearest-target query', () => {
    expect(geometry.lineIntersectsRect(0, 0, 10, 0, { x: 5, y: -1, w: 2, h: 2 })).toBe(true);
    expect(geometry.segmentHitsCircle(0, 0, 10, 0, 5, 2, 1)).toBeNull();
    expect(geometry.segmentHitsCircle(0, 0, 10, 0, 5, 1, 1)).toEqual(expect.objectContaining({ x: 5, y: 0 }));
    const targets = [{ id: 'far', x: 8, y: 0 }, { id: 'near', x: 3, y: 0 }];
    expect(findNearestFromVisit({ x: 0, y: 0, radius: 10, visitCandidates: visit => targets.forEach(visit) })).toEqual(targets[1]);
  });

  test('keeps fixed-step countdowns and intervals bounded', () => {
    expect(advanceCountdown(0.1, 1)).toBe(0);
    expect(advanceInterval(0.1, 0.2, 0.5)).toEqual({ triggered: true, remaining: 0.5 });
    expect(advanceInterval(0.8, 0.2, 0.5)).toEqual({ triggered: false, remaining: 0.6000000000000001 });
  });

  test('normalizes and merges host-owned status records', () => {
    const entity = { statuses: { burn: { stacks: '2', duration: '1.5', tick: '0.1' } } };
    const statuses = ensureStatusMap(entity, ['burn', 'freeze']);
    expect(statuses.freeze).toEqual({ stacks: 0, duration: 0, tick: 0 });
    expect(applyStackedStatus(statuses.burn, { stacks: 3, duration: 2, maxStacks: 4 })).toEqual({ stacks: 4, duration: 2 });
    clearStatusState(statuses.burn);
    expect(statuses.burn).toEqual({ stacks: 0, duration: 0, tick: 0 });
  });

  test('moves, homes, and reflects generic projectile records', () => {
    const projectile = { x: 0, y: 0, vx: 10, vy: 0, homing: true, homingSpeed: 10, homingAccel: 2, homingTurnRate: 4, bouncesRemaining: 1, radius: 2 };
    motion.steerHomingProjectile(projectile, { x: 0, y: 10 }, 0.1);
    const previous = motion.advanceProjectile(projectile, 0.1);
    expect(previous).toEqual({ x: 0, y: 0 });
    expect(projectile.y).toBeGreaterThan(0);
    expect(motion.bounceProjectile(projectile, { normalX: -1, normalY: 0, x: projectile.x, y: projectile.y }, previous)).toBe(true);
    expect(projectile.bouncesRemaining).toBe(0);
  });
});
