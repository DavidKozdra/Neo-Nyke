(function initializeSharedProjectileSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedProjectileApi() {
  'use strict';

  // Projectile presentation remains browser-owned. These operations are the
  // campaign rules that decide the trajectory and lifecycle in either runtime.
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value || 0)));
  }

  function normalizeAngle(angle) {
    let value = Number(angle || 0) % (Math.PI * 2);
    if (value > Math.PI) value -= Math.PI * 2;
    if (value < -Math.PI) value += Math.PI * 2;
    return value;
  }

  function turnCampaignAngleToward(current, target, maxStep) {
    const difference = normalizeAngle(Number(target || 0) - Number(current || 0));
    return normalizeAngle(Number(current || 0) + clamp(difference, -Math.abs(maxStep), Math.abs(maxStep)));
  }

  function rollCampaignProjectileBounces(stacks, random = Math.random) {
    const count = Math.max(0, Math.floor(Number(stacks || 0)));
    if (count <= 0) return 0;
    let bounces = 1;
    for (let index = 0; index < count; index += 1) {
      if (Number(random()) < 0.5) bounces += 1;
    }
    return bounces;
  }

  function getCampaignProjectileItemModifiers(itemStats = {}, random = Math.random) {
    const homingStrength = Math.max(0, Number(itemStats.projectileHomingStrength || 0));
    return {
      speedMultiplier: Math.max(0.1, Number(itemStats.projectileSpeedMultiplier || 1)),
      lifeMultiplier: Math.max(0.1, Number(itemStats.projectileLifeMultiplier || 1)),
      pierceBonus: Math.max(0, Math.floor(Number(itemStats.projectilePierceBonus || 0))),
      homingStrength,
      bounces: rollCampaignProjectileBounces(itemStats.projectileBounces, random),
    };
  }

  function configureCampaignProjectile(projectile, options = {}) {
    if (!projectile || typeof projectile !== 'object') return projectile;
    const enemy = options.enemy === true;
    const difficultySpeed = Math.max(0.1, Number(options.difficultySpeedMultiplier || 1));
    const modifiers = enemy ? getCampaignProjectileItemModifiers() : getCampaignProjectileItemModifiers(options.itemStats, options.random);
    const speedMultiplier = difficultySpeed * modifiers.speedMultiplier;
    projectile.vx = Number(projectile.vx || 0) * speedMultiplier;
    projectile.vy = Number(projectile.vy || 0) * speedMultiplier;
    if (Number.isFinite(Number(projectile.life))) projectile.life *= modifiers.lifeMultiplier;
    if (Number.isFinite(Number(projectile.lifeTicks))) projectile.lifeTicks *= modifiers.lifeMultiplier;
    projectile.remainingPierces = Math.max(0, Math.floor(Number(projectile.remainingPierces || 0) + modifiers.pierceBonus));
    projectile.pierceCount = Math.max(0, Math.floor(Number(projectile.pierceCount || 0) + modifiers.pierceBonus));
    if (!enemy && modifiers.homingStrength > 0 && options.hasExplicitHoming !== true) {
      const speed = Math.hypot(projectile.vx, projectile.vy) || 180;
      projectile.homing = true;
      projectile.homingTarget = 'enemy';
      projectile.homingSpeed = speed;
      projectile.homingAccel = 1.2 + modifiers.homingStrength * 6;
      projectile.homingTurnRate = 0.75 + modifiers.homingStrength * 3.5;
      projectile.homingRadius = 220 + modifiers.homingStrength * 1400;
    }
    if (options.hasExplicitBounces !== true) projectile.bouncesRemaining = modifiers.bounces;
    return projectile;
  }

  function steerCampaignHomingProjectile(projectile, target, deltaSeconds) {
    if (!projectile?.homing) return projectile;
    const dt = Math.max(0, Number(deltaSeconds || 0));
    const speed = Math.hypot(Number(projectile.vx || 0), Number(projectile.vy || 0))
      || Number(projectile.homingSpeed || 180);
    const currentAngle = Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1));
    const targetAngle = target
      ? Math.atan2(Number(target.y || 0) - Number(projectile.y || 0), Number(target.x || 0) - Number(projectile.x || 0))
      : currentAngle;
    const nextAngle = turnCampaignAngleToward(currentAngle, targetAngle, Number(projectile.homingTurnRate || 2) * dt);
    const nextSpeed = speed + (Number(projectile.homingSpeed || speed) - speed) * Number(projectile.homingAccel || 2.5) * dt;
    projectile.vx = Math.cos(nextAngle) * nextSpeed;
    projectile.vy = Math.sin(nextAngle) * nextSpeed;
    return projectile;
  }

  function advanceCampaignProjectile(projectile, deltaSeconds) {
    const previous = { x: Number(projectile?.x || 0), y: Number(projectile?.y || 0) };
    if (!projectile) return previous;
    projectile.x = previous.x + Number(projectile.vx || 0) * Number(deltaSeconds || 0);
    projectile.y = previous.y + Number(projectile.vy || 0) * Number(deltaSeconds || 0);
    return previous;
  }

  function bounceCampaignProjectile(projectile, hit, previous) {
    const remaining = Math.floor(Number(projectile?.bouncesRemaining || 0));
    if (!projectile || remaining <= 0) return false;
    projectile.bouncesRemaining = remaining - 1;
    const normalX = Number(hit?.normalX || 0);
    const normalY = Number(hit?.normalY || 0);
    if (normalX || normalY) {
      const dot = Number(projectile.vx || 0) * normalX + Number(projectile.vy || 0) * normalY;
      projectile.vx -= 2 * dot * normalX;
      projectile.vy -= 2 * dot * normalY;
      projectile.x = Number.isFinite(Number(hit.x)) ? Number(hit.x) : Number(previous?.x || projectile.x);
      projectile.y = Number.isFinite(Number(hit.y)) ? Number(hit.y) : Number(previous?.y || projectile.y);
    } else {
      const hitX = hit?.hitX === true;
      const hitY = hit?.hitY === true;
      projectile.x = Number(previous?.x || projectile.x);
      projectile.y = Number(previous?.y || projectile.y);
      if (hitX) projectile.vx *= -1;
      if (hitY) projectile.vy *= -1;
      if (!hitX && !hitY) { projectile.vx *= -1; projectile.vy *= -1; }
    }
    const speed = Math.hypot(Number(projectile.vx || 0), Number(projectile.vy || 0)) || 1;
    const radius = Number(projectile.r ?? projectile.radius ?? 0);
    const nudge = Math.max(2, radius * 0.6);
    projectile.x += (projectile.vx / speed) * nudge;
    projectile.y += (projectile.vy / speed) * nudge;
    return true;
  }

  function createCampaignSubSpawnDescriptors(projectile, config, random = Math.random) {
    const travel = Math.atan2(Number(projectile?.vy || 0), Number(projectile?.vx || 1));
    const count = Math.max(1, Number(config?.count || 2));
    const jitterRadians = Number(config?.jitterRadians ?? 0.5);
    return Array.from({ length: count }, (_, index) => {
      const side = index % 2 === 0 ? 1 : -1;
      const angle = travel + side * (Math.PI / 2) + (Number(random()) - 0.5) * jitterRadians;
      return {
        angle,
        speed: Number(config?.speed || 480),
        radius: Number(config?.radius ?? config?.r ?? 4),
        lifeSeconds: Number(config?.lifeSeconds ?? config?.life ?? 0.7),
        kind: config?.kind || projectile?.kind,
        color: config?.color || projectile?.color,
        damage: Number(config?.damage ?? Math.round(Number(projectile?.damage || 0) / 2)),
        hitOptions: config?.hitOptions ?? projectile?.hitOptions ?? null,
        statusEffects: config?.statusEffects ?? projectile?.statusEffects,
      };
    });
  }

  return {
    normalizeAngle,
    turnCampaignAngleToward,
    rollCampaignProjectileBounces,
    getCampaignProjectileItemModifiers,
    configureCampaignProjectile,
    steerCampaignHomingProjectile,
    advanceCampaignProjectile,
    bounceCampaignProjectile,
    createCampaignSubSpawnDescriptors,
  };
});
