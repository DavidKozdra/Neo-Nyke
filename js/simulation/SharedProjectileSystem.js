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

  function planCampaignHammerThrow(options = {}) {
    const baseDamage = Number(options.baseDamage ?? 46);
    const anvilDamage = Number(options.anvilDamage || 0);
    const damageMultiplier = Math.max(0, Number(options.damageMultiplier ?? 1));
    const beamDamageMultiplier = Math.max(0, Number(options.beamDamageMultiplier ?? 1));
    return {
      kind: 'sarges_hammer',
      damage: Math.max(1, Math.round((baseDamage + anvilDamage) * damageMultiplier * beamDamageMultiplier)),
      speed: 680,
      radius: 11,
      lifeSeconds: 0.55,
      knockback: 300,
      pierce: 0,
      returning: true,
      lightning: true,
      homing: true,
      homingTarget: 'enemy',
      homingRadius: 700,
      homingSpeed: 760,
      homingAccel: 2.4,
      homingTurnRate: 2.6,
      recoil: 90,
    };
  }

  function planCampaignSargesHammerDoubleKill(options = {}) {
    const baseDamage = Math.max(1, Number(options.baseDamage || 1));
    return {
      kind: 'sarges_hammer',
      damage: Math.max(1, Math.round(baseDamage * 1.4)),
      speed: 620, radius: 11, lifeSeconds: 6, knockback: 320, pierce: 1,
      homing: true, homingTarget: 'enemy', homingRadius: 1100,
      homingSpeed: 900, homingAccel: 3.2, homingTurnRate: 4.2,
      returning: true,
    };
  }

  function planCampaignLoveBomb(options = {}) {
    if (options.rival) {
      const baseDamage = Number(options.baseDamage ?? 34);
      const damageMultiplier = Math.max(0, Number(options.damageMultiplier ?? 1));
      const beamDamageMultiplier = Math.max(0, Number(options.beamDamageMultiplier ?? 1));
      const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
      const projectileSpeedMultiplier = Math.max(0.1, Number(options.projectileSpeedMultiplier ?? 1));
      const originX = Number(options.originX || 0);
      const originY = Number(options.originY || 0);
      const targetX = Number.isFinite(Number(options.targetX)) ? Number(options.targetX) : originX + Number(options.range ?? 420);
      const targetY = Number.isFinite(Number(options.targetY)) ? Number(options.targetY) : originY;
      const range = Math.max(1, Number(options.range ?? 420));
      const distance = Math.min(range, Math.hypot(targetX - originX, targetY - originY) || range);
      const speed = 420 * projectileSpeedMultiplier;
      return {
        // Campaign rival choreography uses a full-size bomb with a deliberately
        // lower damage scalar than Princess's player-held charge.
        kind: 'love_bomb', chargeRatio: 1, damage: Math.max(1, Math.round(baseDamage * 1.6 * damageMultiplier * beamDamageMultiplier)),
        speed, radius: 16, lifeSeconds: Math.max(0.25, Math.min(1, distance / speed)),
        aoeRadius: 90 * radiusMultiplier, sparkleChance: 0.8, knockback: 180, recoil: 0,
      };
    }
    const chargeRatio = Math.max(0, Math.min(1, Number(options.chargeRatio) || 0));
    const baseDamage = Number(options.baseDamage ?? 34) + Number(options.anvilDamage || 0);
    const damageMultiplier = Math.max(0, Number(options.damageMultiplier ?? 1));
    const beamDamageMultiplier = Math.max(0, Number(options.beamDamageMultiplier ?? 1));
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const projectileSpeedMultiplier = Math.max(0.1, Number(options.projectileSpeedMultiplier ?? 1));
    const originX = Number(options.originX || 0);
    const originY = Number(options.originY || 0);
    const targetX = Number.isFinite(Number(options.targetX)) ? Number(options.targetX) : originX + Number(options.range ?? 420);
    const targetY = Number.isFinite(Number(options.targetY)) ? Number(options.targetY) : originY;
    const range = Math.max(1, Number(options.range ?? 420));
    const dx = targetX - originX;
    const dy = targetY - originY;
    const distance = Math.min(range, Math.hypot(dx, dy) || range);
    const speed = (340 + chargeRatio * 120) * projectileSpeedMultiplier;
    return {
      kind: 'love_bomb',
      chargeRatio,
      damage: Math.max(1, Math.round(baseDamage * (0.6 + chargeRatio * 1.6) * damageMultiplier * beamDamageMultiplier)),
      speed,
      radius: 10 + chargeRatio * 6,
      lifeSeconds: Math.max(0.12, distance / speed),
      aoeRadius: (48 + chargeRatio * 42) * radiusMultiplier,
      sparkleChance: 0.25 + chargeRatio * 0.55,
      knockback: 200,
      recoil: 30 + chargeRatio * 60,
    };
  }

  function planCampaignGhostBall(options = {}) {
    const chargeRatio = Math.max(0, Math.min(1, Number(options.chargeRatio) || 0));
    const baseDamage = Number(options.baseDamage ?? 34) + Number(options.anvilDamage || 0);
    const beamDamageMultiplier = Math.max(0, Number(options.beamDamageMultiplier ?? 1));
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const radius = (18 + chargeRatio * 22) * radiusMultiplier;
    return {
      kind: 'ghost_ball', chargeRatio,
      damage: Math.max(1, Math.round(baseDamage * (0.6 + chargeRatio * 1.6) * beamDamageMultiplier)),
      radius, startRadius: radius,
      speed: 300, acceleration: 6,
      minimumRadius: 8, decayPerSecond: 3, hitDecay: 6,
      enemyHitCooldownSeconds: 0.35, destructibleHitCooldownSeconds: 0.4,
      knockback: 140, destructibleDamage: 2,
    };
  }

  function planCampaignDeathBall(options = {}) {
    const chargeRatio = Math.max(0, Math.min(1, Number(options.chargeRatio) || 0));
    const baseDamage = Number(options.baseDamage ?? 40) + Number(options.anvilDamage || 0);
    const damageMultiplier = Math.max(0, Number(options.damageMultiplier ?? 1));
    const radiusMultiplier = Math.max(0, Number(options.aoeRadiusMultiplier ?? 1));
    const radius = (16 + chargeRatio * 34) * radiusMultiplier;
    return {
      kind: 'death_ball', chargeRatio,
      radius,
      damage: Math.max(1, Math.round(baseDamage * (0.6 + chargeRatio * 2) * damageMultiplier)),
      speed: 520 - chargeRatio * 200,
      lifeSeconds: 1.6 + chargeRatio * 0.8,
      knockback: 220 + chargeRatio * 260,
      pierce: 4 + Math.round(chargeRatio * 8),
      recoil: 60 + chargeRatio * 120,
    };
  }

  function advanceCampaignGhostBall(ball, options = {}) {
    if (!ball) return { active: false, currentDamage: 0 };
    const effect = options.effect || planCampaignGhostBall(options);
    const delta = Math.max(0, Number(options.delta) || 0);
    ball.radius = Number(ball.radius || 0) - effect.decayPerSecond * delta;
    if (ball.radius < effect.minimumRadius) return { active: false, currentDamage: 0 };
    const dx = Number(options.targetX || 0) - Number(ball.x || 0);
    const dy = Number(options.targetY || 0) - Number(ball.y || 0);
    const distance = Math.hypot(dx, dy) || 1;
    const desiredVx = dx / distance * effect.speed;
    const desiredVy = dy / distance * effect.speed;
    const easing = Math.min(1, effect.acceleration * delta);
    ball.vx = Number(ball.vx || 0) + (desiredVx - Number(ball.vx || 0)) * easing;
    ball.vy = Number(ball.vy || 0) + (desiredVy - Number(ball.vy || 0)) * easing;
    ball.x = Number(ball.x || 0) + ball.vx * delta;
    ball.y = Number(ball.y || 0) + ball.vy * delta;
    const sizeRatio = Math.max(0, Math.min(1, Number(ball.radius || 0) / Math.max(1, Number(ball.startRadius || effect.startRadius))));
    return { active: true, currentDamage: Math.max(1, Math.round(Number(ball.damage || effect.damage) * sizeRatio)) };
  }

  // Select the first entity crossed by a projectile's swept circle. This is
  // deliberately independent of a spatial index so browser and authority can
  // supply their own candidate source while sharing actual hit ordering.
  // Static blockers are resolved before this by both callers.
  function findCampaignProjectileEntitySweepHit(projectile, previous, candidates, options = {}) {
    if (!projectile || !previous || !Array.isArray(candidates) || candidates.length === 0) return null;
    const fromX = Number(previous.x);
    const fromY = Number(previous.y);
    const toX = Number(projectile.x);
    const toY = Number(projectile.y);
    if (![fromX, fromY, toX, toY].every(Number.isFinite)) return null;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const lengthSquared = dx * dx + dy * dy;
    const projectileRadius = Math.max(0, Number(projectile.radius ?? projectile.r ?? 0));
    const getEntity = typeof options.getEntity === 'function' ? options.getEntity : candidate => candidate;
    const getId = typeof options.getId === 'function' ? options.getId : (candidate, entity) => entity?.id ?? candidate?.id ?? '';
    const include = typeof options.include === 'function' ? options.include : () => true;
    let closest = null;

    candidates.forEach(candidate => {
      const entity = getEntity(candidate);
      if (!entity || !include(candidate, entity)) return;
      const centerX = Number(entity.x);
      const centerY = Number(entity.y);
      if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return;
      const radius = projectileRadius + Math.max(0, Number(entity.radius ?? entity.r ?? 0));
      const offsetX = fromX - centerX;
      const offsetY = fromY - centerY;
      let t = null;
      if (offsetX * offsetX + offsetY * offsetY <= radius * radius) {
        t = 0;
      } else if (lengthSquared > 0) {
        const b = 2 * (offsetX * dx + offsetY * dy);
        const c = offsetX * offsetX + offsetY * offsetY - radius * radius;
        const discriminant = b * b - 4 * lengthSquared * c;
        if (discriminant >= 0) {
          const root = (-b - Math.sqrt(discriminant)) / (2 * lengthSquared);
          if (root >= 0 && root <= 1) t = root;
        }
      }
      if (t == null) return;
      const id = String(getId(candidate, entity));
      if (!closest || t < closest.t || (t === closest.t && id < closest.id)) {
        closest = { candidate, entity, id, t, x: fromX + dx * t, y: fromY + dy * t };
      }
    });
    return closest;
  }

  function findCampaignProjectileObstacleSweepHit(projectile, previous, obstacles, options = {}) {
    if (!projectile || !previous || !Array.isArray(obstacles) || obstacles.length === 0) return null;
    const fromX = Number(previous.x);
    const fromY = Number(previous.y);
    const toX = Number(projectile.x);
    const toY = Number(projectile.y);
    if (![fromX, fromY, toX, toY].every(Number.isFinite)) return null;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const projectileRadius = Math.max(0, Number(projectile.radius ?? projectile.r ?? 0));
    const getId = typeof options.getId === 'function' ? options.getId : obstacle => obstacle?.id ?? obstacle?.kind ?? '';
    const include = typeof options.include === 'function' ? options.include : () => true;
    let closest = null;

    obstacles.forEach(obstacle => {
      if (!obstacle || !include(obstacle)) return;
      let t = null;
      let hitX = false;
      let hitY = false;
      if (Number(obstacle.w) > 0 && Number(obstacle.h) > 0) {
        const minX = Number(obstacle.x) - Number(obstacle.w) / 2 - projectileRadius;
        const maxX = Number(obstacle.x) + Number(obstacle.w) / 2 + projectileRadius;
        const minY = Number(obstacle.y) - Number(obstacle.h) / 2 - projectileRadius;
        const maxY = Number(obstacle.y) + Number(obstacle.h) / 2 + projectileRadius;
        const axisInterval = (origin, delta, minimum, maximum) => {
          if (Math.abs(delta) <= Number.EPSILON) return origin >= minimum && origin <= maximum ? [-Infinity, Infinity] : null;
          const first = (minimum - origin) / delta;
          const second = (maximum - origin) / delta;
          return [Math.min(first, second), Math.max(first, second)];
        };
        const xInterval = axisInterval(fromX, dx, minX, maxX);
        const yInterval = axisInterval(fromY, dy, minY, maxY);
        if (xInterval && yInterval) {
          const enter = Math.max(xInterval[0], yInterval[0]);
          const exit = Math.min(xInterval[1], yInterval[1]);
          if (enter <= exit && exit >= 0 && enter <= 1) {
            t = Math.max(0, enter);
            hitX = xInterval[0] >= yInterval[0];
            hitY = yInterval[0] >= xInterval[0];
          }
        }
      } else {
        const centerX = Number(obstacle.x);
        const centerY = Number(obstacle.y);
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return;
        const radius = projectileRadius + Math.max(0, Number(obstacle.radius ?? obstacle.r ?? 0));
        const offsetX = fromX - centerX;
        const offsetY = fromY - centerY;
        const lengthSquared = dx * dx + dy * dy;
        if (offsetX * offsetX + offsetY * offsetY <= radius * radius) t = 0;
        else if (lengthSquared > 0) {
          const b = 2 * (offsetX * dx + offsetY * dy);
          const c = offsetX * offsetX + offsetY * offsetY - radius * radius;
          const discriminant = b * b - 4 * lengthSquared * c;
          if (discriminant >= 0) {
            const root = (-b - Math.sqrt(discriminant)) / (2 * lengthSquared);
            if (root >= 0 && root <= 1) t = root;
          }
        }
        if (t != null) {
          const hitXPosition = fromX + dx * t;
          const hitYPosition = fromY + dy * t;
          hitX = Math.abs(hitXPosition - centerX) >= Math.abs(hitYPosition - centerY);
          hitY = Math.abs(hitYPosition - centerY) >= Math.abs(hitXPosition - centerX);
        }
      }
      if (t == null) return;
      const id = String(getId(obstacle));
      if (!closest || t < closest.t || (t === closest.t && id < closest.id)) {
        closest = { obstacle, id, t, x: fromX + dx * t, y: fromY + dy * t, hitX, hitY };
      }
    });
    return closest;
  }

  // Projectile impact payloads are gameplay data, not presentation. Both
  // runtimes resolve the same ordered list here; callers only provide their
  // status-resistance/rollback policy and the mutation callback.
  function resolveCampaignProjectileStatusApplications(projectile, options = {}) {
    if (!Array.isArray(projectile?.statusEffects)) return [];
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const resolveProc = typeof options.resolveProc === 'function'
      ? options.resolveProc
      : effect => ({ chance: Number(effect?.chance ?? 1), effectMultiplier: 1 });
    return projectile.statusEffects.flatMap(effect => {
      if (!effect?.key) return [];
      const resolved = resolveProc(effect) || {};
      const chance = Math.max(0, Math.min(1, Number(resolved.chance ?? resolved.procChance ?? 0)));
      // Existing authorities treat guaranteed payloads as data, not RNG rolls;
      // retain that deterministic stream contract while the browser can still
      // opt into its authored rollback roll for every payload.
      if (!(options.skipGuaranteedRoll && chance >= 1) && random() >= chance) return [];
      return [{
        key: effect.key,
        stacks: Math.max(0, Number(effect.stacks || 1)),
        duration: Math.max(0, Number(effect.duration || 3)) * Math.max(1, Number(resolved.effectMultiplier || 1)),
        damageMultiplier: Math.max(1, Number(resolved.effectMultiplier || 1)),
      }];
    });
  }

  function resolveCampaignProjectileDrain(projectile, owner) {
    const requestedHeal = Math.max(0, Number(projectile?.drainHeal || 0));
    const current = Math.max(0, Number(owner?.health ?? owner?.hp ?? 0));
    const maximum = Math.max(0, Number(owner?.maxHealth ?? owner?.max ?? owner?.maxHp ?? current));
    if (requestedHeal <= 0 || !owner || owner.dead || maximum <= 0 || current >= maximum) {
      return { healedAmount: 0, health: current, maxHealth: maximum };
    }
    const health = Math.min(maximum, current + requestedHeal);
    return { healedAmount: health - current, health, maxHealth: maximum };
  }

  // A projectile striking a destructible is not a generic one-damage chip.
  // Campaign applies the shot's actual payload first, then fireballs detonate
  // their smaller blocked-impact splash. Keep the order/data shared so an
  // authority adapter cannot quietly lose prop damage or the explosion.
  function resolveCampaignProjectileDestructibleImpact(projectile = {}, destructible = {}) {
    // Wall of Toph shards may touch their newly raised friendly cover in the
    // same frame. Campaign deliberately treats that as one cosmetic chip, not
    // an immediate self-destruction of the entire ring.
    const friendlyCover = projectile.ownerId && projectile.ownerId === destructible.ownerId;
    const directDamage = friendlyCover ? 1 : Math.max(0, Number(projectile.damage || 1));
    if (projectile.kind !== 'fireball') return { directDamage, blast: null };
    return {
      directDamage,
      blast: {
        radius: Math.max(1, Number(projectile.splash || 44)),
        damage: Math.max(1, Number(projectile.blockedSplashDamage || 16)),
        knockback: 180,
        destructibleForce: 1.6,
      },
    };
  }

  function resolveCampaignEnemyProjectileBlast(projectile = {}) {
    const blast = projectile.enemyBlast;
    if (!blast || typeof blast !== 'object') return null;
    const requestedRadius = Number(blast.radius || 0);
    const damage = Math.max(0, Number(blast.damage || 0));
    if (requestedRadius <= 0 || damage <= 0) return null;
    const radius = Math.max(1, requestedRadius);
    return {
      radius,
      damage,
      knockback: Math.max(0, Number(blast.knockback || 220)),
      statusKey: blast.statusKey ? String(blast.statusKey) : '',
      statusStacks: Math.max(0, Number(blast.statusStacks || 1)),
      statusDuration: Math.max(0, Number(blast.statusDuration || 3)),
      destructibleForce: 1.4,
    };
  }

  // Sarge's hammer has a genuine return/catch lifecycle.  Keep its steering
  // handoff and catch reward in shared simulation data so multiplayer does not
  // turn the campaign boomerang into a one-way projectile.
  function planCampaignBoomerangReturn(projectile, owner) {
    if (!projectile || !owner) return null;
    const dx = Number(owner.x || 0) - Number(projectile.x || 0);
    const dy = Number(owner.y || 0) - Number(projectile.y || 0);
    const distance = Math.hypot(dx, dy) || 1;
    const speed = Math.max(700, Math.hypot(Number(projectile.vx || 0), Number(projectile.vy || 0)) || 700);
    return {
      returnPhase: 'back',
      homing: true,
      homingTarget: 'player',
      returnLifeSeconds: 4,
      vx: dx / distance * speed,
      vy: dy / distance * speed,
    };
  }

  function resolveCampaignBoomerangCatch(options = {}) {
    const player = options.player || {};
    const maxHp = Math.max(1, Number(player.maxHp ?? player.maxHealth ?? 1));
    const hp = Math.max(0, Number(player.hp ?? player.health ?? 0));
    const healingMultiplier = Math.max(0.05, Number(options.healingMultiplier ?? player.healingMultiplier ?? 1));
    const requestedHeal = Math.max(2, Math.round(maxHp * 0.04)) * healingMultiplier;
    const health = Math.min(maxHp, hp + requestedHeal);
    const pullRadius = Math.max(0, Number(options.pullRadius ?? 280));
    const pullStrength = Math.max(0, Number(options.pullStrength ?? 4));
    const pullRadiusSquared = pullRadius * pullRadius;
    const pickupImpulses = (Array.isArray(options.pickups) ? options.pickups : []).flatMap((pickup, index) => {
      if (!pickup || !Number.isFinite(Number(pickup.x)) || !Number.isFinite(Number(pickup.y))) return [];
      const dx = Number(player.x || 0) - Number(pickup.x);
      const dy = Number(player.y || 0) - Number(pickup.y);
      if (dx * dx + dy * dy > pullRadiusSquared) return [];
      return [{ id: pickup.id ?? null, index, vx: dx * pullStrength, vy: dy * pullStrength, magnetized: true }];
    });
    return {
      requestedHeal,
      healedAmount: Math.max(0, health - hp),
      health,
      maxHp,
      pickupImpulses,
    };
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
    planCampaignHammerThrow,
    planCampaignSargesHammerDoubleKill,
    planCampaignLoveBomb,
    planCampaignGhostBall,
    advanceCampaignGhostBall,
    planCampaignDeathBall,
    findCampaignProjectileEntitySweepHit,
    findCampaignProjectileObstacleSweepHit,
    resolveCampaignProjectileStatusApplications,
    resolveCampaignProjectileDrain,
    resolveCampaignProjectileDestructibleImpact,
    resolveCampaignEnemyProjectileBlast,
    planCampaignBoomerangReturn,
    resolveCampaignBoomerangCatch,
  };
});
