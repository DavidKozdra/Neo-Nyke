(function initializeSharedProjectileSystem(root, factory) {
  const motionApi = typeof require === 'function' ? require('../../Koz_Engine_Lib/Combat/projectileMotion.js') : root.KozEngine?.Combat?.projectileMotion;
  const api = factory(motionApi || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedProjectileApi(motionApi) {
  'use strict';

  // Projectile presentation remains browser-owned. These operations are the
  // campaign rules that decide the trajectory and lifecycle in either runtime.
  const { normalizeAngle, steerHomingProjectile, advanceProjectile, bounceProjectile } = motionApi;
  function turnCampaignAngleToward(current, target, maxStep) { return normalizeAngle(steerTurn(current, target, maxStep)); }
  function steerTurn(current, target, maxStep) { return motionApi.turnAngleToward(current, target, maxStep); }

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

  const steerCampaignHomingProjectile = steerHomingProjectile;
  const advanceCampaignProjectile = advanceProjectile;
  const bounceCampaignProjectile = bounceProjectile;

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
