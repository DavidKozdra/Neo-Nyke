const {
  resolveCampaignProjectileStatusApplications,
  resolveCampaignProjectileDrain,
  resolveCampaignProjectileDestructibleImpact,
  planCampaignHammerThrow,
  planCampaignLoveBomb,
  planCampaignGhostBall,
  planCampaignDeathBall,
  advanceCampaignGhostBall,
  planCampaignBoomerangReturn,
  resolveCampaignBoomerangCatch,
  findCampaignProjectileEntitySweepHit,
  findCampaignProjectileObstacleSweepHit,
} = require('../js/simulation/SharedProjectileSystem');
const fs = require('node:fs');
const path = require('node:path');

describe('shared campaign projectile impact policy', () => {
  test('selects the first entity crossed by a fast projectile, with stable tie ordering', () => {
    const projectile = { x: 100, y: 0, radius: 4 };
    const hit = findCampaignProjectileEntitySweepHit(projectile, { x: 0, y: 0 }, [
      { id: 'later', x: 78, y: 0, radius: 10 },
      { id: 'first', x: 40, y: 0, radius: 10 },
    ]);
    expect(hit).toEqual(expect.objectContaining({ id: 'first', t: expect.any(Number) }));
    expect(hit.t).toBeCloseTo(0.26);

    const tied = findCampaignProjectileEntitySweepHit(projectile, { x: 0, y: 0 }, [
      { id: 'z', x: 40, y: 0, radius: 10 },
      { id: 'a', x: 40, y: 0, radius: 10 },
    ]);
    expect(tied.id).toBe('a');
  });

  test('sweeps circles and centered obstacle rectangles before target resolution', () => {
    const projectile = { x: 100, y: 0, radius: 4 };
    const hit = findCampaignProjectileObstacleSweepHit(projectile, { x: 0, y: 0 }, [
      { id: 'round', x: 80, y: 0, r: 8 },
      { id: 'wall', x: 40, y: 0, w: 20, h: 20 },
    ]);
    expect(hit).toEqual(expect.objectContaining({ id: 'wall', t: expect.any(Number) }));
    expect(hit.t).toBeCloseTo(0.26);
  });

  test('single-player resolves Metao fireball pot damage before the generic solid blocker', () => {
    const impact = resolveCampaignProjectileDestructibleImpact({
      kind: 'fireball', damage: 22, splash: 48, blockedSplashDamage: 14,
    }, {
      kind: 'pot', hp: 1, maxHp: 1, broken: false,
    });
    expect(impact).toEqual({
      directDamage: 22,
      blast: { radius: 48, damage: 14, knockback: 180, destructibleForce: 1.6 },
    });

    const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
    const updateStart = worldSource.indexOf('function updateProjectiles(dt)');
    const updateEnd = worldSource.indexOf('\n  function updateWorldProps', updateStart);
    const updateProjectiles = worldSource.slice(updateStart, updateEnd);
    const destructibleImpact = updateProjectiles.indexOf('if (!projectile.enemy && hitProp)');
    const genericBlocker = updateProjectiles.indexOf('if (Neo.isBlocked(projectile.x, projectile.y, projectile.r))');
    expect(destructibleImpact).toBeGreaterThan(0);
    expect(genericBlocker).toBeGreaterThan(destructibleImpact);
  });

  test('resolves ordered status payloads with one deterministic roll per effect', () => {
    const rolls = [0.1, 0.8];
    const applications = resolveCampaignProjectileStatusApplications({
      statusEffects: [
        { key: 'poison', stacks: 2, duration: 4, chance: 0.2 },
        { key: 'slow', stacks: 1, duration: 3, chance: 0.5 },
      ],
    }, {
      random: () => rolls.shift(),
      resolveProc: effect => ({ chance: effect.chance, effectMultiplier: effect.key === 'poison' ? 1.5 : 1 }),
    });

    expect(applications).toEqual([{ key: 'poison', stacks: 2, duration: 6, damageMultiplier: 1.5 }]);
  });

  test('uses one owner-agnostic drain calculation for browser and authority enemy records', () => {
    expect(resolveCampaignProjectileDrain({ drainHeal: 18 }, { hp: 60, max: 70 })).toEqual({
      healedAmount: 10, health: 70, maxHealth: 70,
    });
    expect(resolveCampaignProjectileDrain({ drainHeal: 18 }, { health: 60, maxHealth: 100 })).toEqual({
      healedAmount: 18, health: 78, maxHealth: 100,
    });
  });

  test('shares Sarge hammer throw, return steering, and catch reward data', () => {
    expect(planCampaignHammerThrow({ baseDamage: 46, anvilDamage: 4, damageMultiplier: 1.2, beamDamageMultiplier: 1.5 }))
      .toEqual(expect.objectContaining({
        kind: 'sarges_hammer', damage: 90, speed: 680, radius: 11, lifeSeconds: 0.55,
        knockback: 300, returning: true, homingTarget: 'enemy', recoil: 90,
      }));
    expect(planCampaignBoomerangReturn({ x: 0, y: 0, vx: 680, vy: 0 }, { x: 0, y: 100 }))
      .toEqual(expect.objectContaining({ returnPhase: 'back', homingTarget: 'player', returnLifeSeconds: 4, vx: 0, vy: 700 }));
    expect(resolveCampaignBoomerangCatch({
      player: { x: 100, y: 100, hp: 50, maxHp: 120 }, healingMultiplier: 1.2,
      pickups: [{ id: 'near', x: 40, y: 80, vx: 3, vy: 2 }, { id: 'far', x: 500, y: 100 }],
    })).toEqual(expect.objectContaining({
      requestedHeal: 6, healedAmount: 6, health: 56,
      pickupImpulses: [{ id: 'near', index: 0, vx: 240, vy: 80, magnetized: true }],
    }));
  });

  test('plans Love Bomb charge into the campaign flight, burst, sparkle, and recoil', () => {
    const bomb = planCampaignLoveBomb({
      chargeRatio: 1, baseDamage: 34, anvilDamage: 2, damageMultiplier: 1.2, beamDamageMultiplier: 1.5,
      aoeRadiusMultiplier: 1.25, projectileSpeedMultiplier: 1.1,
      originX: 0, originY: 0, targetX: 1000, targetY: 0, range: 420,
    });
    expect(bomb).toEqual(expect.objectContaining({
      kind: 'love_bomb', chargeRatio: 1, damage: 143, radius: 16,
      aoeRadius: 112.5, sparkleChance: 0.8, knockback: 200, recoil: 90,
    }));
    expect(bomb.speed).toBeCloseTo(506);
    expect(bomb.lifeSeconds).toBeCloseTo(420 / 506);

    const rivalBomb = planCampaignLoveBomb({ rival: true, baseDamage: 40, originX: 0, originY: 0, targetX: 250, targetY: 0 });
    expect(rivalBomb).toEqual(expect.objectContaining({
      kind: 'love_bomb', chargeRatio: 1, damage: 64, speed: 420, radius: 16,
      aoeRadius: 90, sparkleChance: 0.8, knockback: 180, recoil: 0,
    }));
    expect(rivalBomb.lifeSeconds).toBeCloseTo(250 / 420);
  });

  test('plans and advances Ghost Ball as a decaying cursor-chasing contact orb', () => {
    const effect = planCampaignGhostBall({ chargeRatio: 1, baseDamage: 34, anvilDamage: 2, beamDamageMultiplier: 1.5, aoeRadiusMultiplier: 1.25 });
    expect(effect).toEqual(expect.objectContaining({
      kind: 'ghost_ball', damage: 119, radius: 50, startRadius: 50, speed: 300,
      acceleration: 6, minimumRadius: 8, decayPerSecond: 3, hitDecay: 6,
    }));
    const ball = { x: 0, y: 0, vx: 0, vy: 0, radius: effect.radius, startRadius: effect.startRadius, damage: effect.damage };
    const step = advanceCampaignGhostBall(ball, { effect, delta: 0.05, targetX: 100, targetY: 0 });
    expect(step).toEqual({ active: true, currentDamage: 119 });
    expect(ball.radius).toBeCloseTo(49.85);
    expect(ball.vx).toBeCloseTo(90);
    expect(ball.vy).toBe(0);
    expect(ball.x).toBeCloseTo(4.5);
    expect(ball.y).toBe(0);
  });

  test('plans Death Ball charge into its campaign launch, pierce, knockback, and recoil', () => {
    const ball = planCampaignDeathBall({
      chargeRatio: 1, baseDamage: 40, anvilDamage: 2, damageMultiplier: 1.5, aoeRadiusMultiplier: 1.25,
    });
    expect(ball).toEqual(expect.objectContaining({
      kind: 'death_ball', chargeRatio: 1, radius: 62.5, damage: 164,
      speed: 320, knockback: 480, pierce: 12, recoil: 180,
    }));
    expect(ball.lifeSeconds).toBeCloseTo(2.4);
  });
});
