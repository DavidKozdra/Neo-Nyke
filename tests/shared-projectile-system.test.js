const projectile = require('../js/simulation/SharedProjectileSystem.js');

describe('SharedProjectileSystem campaign rules', () => {
  test('uses the campaign ricochet roll in a deterministic order', () => {
    const rolls = [0.2, 0.7, 0.1];
    expect(projectile.rollCampaignProjectileBounces(3, () => rolls.shift())).toBe(3);
    expect(projectile.rollCampaignProjectileBounces(0, () => 0)).toBe(0);
  });

  test('configures item speed, lifetime, pierce, homing, and bounces together', () => {
    const shot = { vx: 100, vy: 0, lifeTicks: 20, remainingPierces: 1 };
    projectile.configureCampaignProjectile(shot, {
      itemStats: {
        projectileSpeedMultiplier: 1.2,
        projectileLifeMultiplier: 1.5,
        projectilePierceBonus: 2,
        projectileHomingStrength: 0.15,
        projectileBounces: 1,
      },
      random: () => 0.75,
    });
    expect(shot).toEqual(expect.objectContaining({
      vx: 120,
      lifeTicks: 30,
      remainingPierces: 3,
      homing: true,
      homingTarget: 'enemy',
      bouncesRemaining: 1,
    }));
  });

  test('shares homing, advance, and reflection mutations', () => {
    const shot = { x: 0, y: 0, vx: 100, vy: 0, radius: 5, homing: true, homingSpeed: 100, homingAccel: 2.5, homingTurnRate: 2, bouncesRemaining: 1 };
    projectile.steerCampaignHomingProjectile(shot, { x: 0, y: 100 }, 0.1);
    const previous = projectile.advanceCampaignProjectile(shot, 0.1);
    expect(previous).toEqual({ x: 0, y: 0 });
    expect(shot.y).toBeGreaterThan(0);
    expect(projectile.bounceCampaignProjectile(shot, { normalX: -1, normalY: 0, x: shot.x, y: shot.y })).toBe(true);
    expect(shot.bouncesRemaining).toBe(0);
    expect(shot.vx).toBeLessThan(0);
  });

  test('creates the same perpendicular sub-spawn descriptors for either runtime', () => {
    const descriptors = projectile.createCampaignSubSpawnDescriptors(
      { vx: 100, vy: 0, kind: 'power_disk', damage: 20 },
      { count: 2, speed: 480, radius: 4, lifeSeconds: 0.7, jitterRadians: 0 },
      () => 0.5,
    );
    expect(descriptors.map(entry => entry.angle)).toEqual([Math.PI / 2, -Math.PI / 2]);
    expect(descriptors[0]).toEqual(expect.objectContaining({ kind: 'power_disk', speed: 480, damage: 10 }));
  });
});
