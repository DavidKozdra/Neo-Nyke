(function initializeCampaignMovementRules(root, factory) {
  const status = typeof require === 'function' ? require('./SharedStatusSystem.js') : (root.NeoNyke?.simulation || {});
  const cameraRig = typeof require === 'function'
    ? require('koz-engine-lib/Rendering3D/cameraRig.js')
    : root.KozEngine?.Rendering3D?.cameraRig;
  const moveEffect = typeof require === 'function' ? require('./SharedMoveEffectSystem.js') : (root.NeoNyke?.simulation || {});
  const roomInterior = typeof require === 'function' ? require('./SharedRoomInteriorSystem.js') : (root.NeoNyke?.simulation || {});
  const api = factory(status, cameraRig, moveEffect, roomInterior);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCampaignMovementRulesApi(status, cameraRig, moveEffect, roomInterior) {
  'use strict';

  // Extracted verbatim from the campaign's former local-only movement path.
  // Keep this module free of Neo/DOM/canvas dependencies so an authority and
  // a browser always calculate the same velocity from the same command.
  function applyResponsiveVelocity(current, desired, dt) {
    const value = Number(current) || 0;
    const target = Number(desired) || 0;
    const delta = Math.max(0, Number(dt) || 0);
    const isStopping = Math.abs(target) < 0.001;
    const isTurning = !isStopping && value !== 0 && Math.sign(value) !== Math.sign(target);
    const response = isStopping ? 20 : isTurning ? 24 : 14;
    const next = value + (target - value) * Math.min(1, response * delta);
    return Math.abs(next) < 4 ? 0 : next;
  }

  function advanceCampaignMovementTimer(seconds, dt) {
    const remaining = Math.max(0, Number(seconds || 0) - Math.max(0, Number(dt) || 0));
    return remaining < 1e-9 ? 0 : remaining;
  }

  // Canonical movement adapter for both the offline campaign and every online
  // player slot. Raw controls use screen-style axes (W/up is negative Y). In
  // first-person 3D, forward follows the camera yaw and A/D strafe across it.
  function resolveCampaignMovementInput(moveX = 0, moveY = 0, cameraYaw = null) {
    let x = Number(moveX) || 0;
    let y = Number(moveY) || 0;
    const magnitude = Math.hypot(x, y);
    if (magnitude < 0.1) return { moveX: 0, moveY: 0 };
    if (magnitude > 1) {
      x /= magnitude;
      y /= magnitude;
    }
    if (cameraYaw == null || (!x && !y)) return { moveX: x, moveY: y };
    if (typeof cameraRig?.mapLocalMovementToWorld === 'function') {
      const mapped = cameraRig.mapLocalMovementToWorld({ x, y }, cameraYaw);
      return { moveX: mapped.x, moveY: mapped.y };
    }
    const yaw = Number(cameraYaw) || 0;
    const cosine = Math.cos(yaw);
    const sine = Math.sin(yaw);
    const forward = -y;
    const strafe = x;
    return {
      moveX: cosine * forward - sine * strafe,
      moveY: sine * forward + cosine * strafe,
    };
  }

  function resolveCampaignControlAim(player, enemies = [], options = {}) {
    if (!player) return null;
    const control = options.inputMode === 'touch' ? options.touch
      : options.inputMode === 'gamepad' ? options.gamepad : null;
    if (!control?.active) return null;
    const explicitAim = options.inputMode === 'gamepad' && control.hasAim;
    let nearest = null;
    let bestDistanceSquared = Infinity;
    if (!explicitAim) {
      for (const enemy of enemies) {
        if (!enemy || enemy.dead
          || (player.roomId && enemy.roomId && player.roomId !== enemy.roomId)) continue;
        const distanceSquared = (enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2;
        if (distanceSquared < bestDistanceSquared) {
          nearest = enemy;
          bestDistanceSquared = distanceSquared;
        }
      }
    }
    const aimX = explicitAim ? Number(control.aimX || 0) * 200
      : nearest ? nearest.x - player.x : Number(control.lastAimX || 0) * 200;
    const aimY = explicitAim ? Number(control.aimY || 0) * 200
      : nearest ? nearest.y - player.y : Number(control.lastAimY || 0) * 200;
    return {
      x: Number(player.x || 0) + aimX,
      y: Number(player.y || 0) + aimY,
      aimDirection: Math.atan2(aimY, aimX),
    };
  }

  function applyCampaignImpulse(entity, angle, magnitude, resistance = 0) {
    const direction = Number(angle);
    const force = Number(magnitude);
    if (!entity || !Number.isFinite(direction) || !Number.isFinite(force)) return { ok: false, reason: 'INVALID_IMPULSE' };
    const resistedForce = force * (1 - Math.max(0, Math.min(1, Number(resistance || 0))));
    entity.vx = Number(entity.vx || 0) + Math.cos(direction) * resistedForce;
    entity.vy = Number(entity.vy || 0) + Math.sin(direction) * resistedForce;
    return { ok: true, angle: direction, magnitude: resistedForce, vx: entity.vx, vy: entity.vy };
  }

  // The campaign controller, authority and predictor all use this operation.
  // In particular, stun damps existing knockback; it does not use the ordinary
  // stop response (which would erase the impulse in a single 20 Hz tick).
  function applyCampaignPlayerVelocity(player, input, dt, options = {}) {
    if (options.stunned) {
      const friction = Math.pow(0.84, Math.max(0, Number(dt) || 0) * 60);
      player.vx = Number(player.vx || 0) * friction;
      player.vy = Number(player.vy || 0) * friction;
    } else if (options.dashing) {
      player.vx = Number(options.dashVx || 0);
      player.vy = Number(options.dashVy || 0);
    } else {
      player.vx = applyResponsiveVelocity(player.vx, Number(input.moveX || 0) * options.speed, dt);
      player.vy = applyResponsiveVelocity(player.vy, Number(input.moveY || 0) * options.speed, dt);
    }
    return player;
  }

  function getCampaignPlayerSlowMultiplier(player) {
    return status.getCampaignSlowMultiplier?.(
      status.getCampaignStatusStacks?.(player, 'slow') || 0,
      Number(player?.itemStats?.negativeStatusMultiplier ?? 1),
    ) ?? 1;
  }

  function advanceCampaignPlayerMovement(player, input, dt, floorState = {}, currentTick = 0, options = {}) {
    if (player.downed || player.disconnected) {
      player.vx = 0;
      player.vy = 0;
      return { desiredX: player.x, desiredY: player.y };
    }
    const stunned = Number(currentTick) < Number(player.stunnedUntilTick || 0);
    const dashing = !stunned && isCampaignPlayerDashing(player, currentTick);
    applyCampaignPlayerVelocity(player, resolveCampaignMovementInput(input.moveX, input.moveY), dt, {
      stunned, dashing, dashVx: player.dashVx, dashVy: player.dashVy,
      speed: getCampaignPlayerMovementSpeed(player, currentTick),
    });
    if (stunned || (!dashing && Number(player.dashUntilTick || 0))) {
      player.dashUntilTick = 0;
      player.dashVx = 0;
      player.dashVy = 0;
    }
    const room = floorState.layout?.rooms?.find(candidate => candidate.id === player.roomId);
    const doors = options.roomLocked ? {} : (room?.doors || {});
    const obstacles = roomInterior.getRoomObstacles(room);
    const walls = roomInterior.getCampaignRoomWallRects(floorState, doors);
    roomInterior.moveCampaignCircle(player, dt, {
      bounds: roomInterior.getCampaignRoomMoveBounds(player, floorState, doors),
      escapeBounds: roomInterior.getCampaignRoomMoveBounds(player, floorState),
      slowMultiplier: getCampaignPlayerSlowMultiplier(player),
      isBlocked: (x, y, radius) => walls.some(wall => roomInterior.circleIntersectsRoomObstacle(x, y, radius, {
        ...wall, x: wall.x + wall.w / 2, y: wall.y + wall.h / 2,
      })) || obstacles.some(obstacle => roomInterior.circleIntersectsRoomObstacle(x, y, radius, obstacle)),
    });
    player.aimDirection = Number(input.aimDirection) || 0;
    return { exitDirection: roomInterior.getCampaignRoomExitDirection(player, floorState, doors) };
  }

  function getCampaignPlayerMovementSpeed(player, currentTick = 0) {
    const statusUntil = player?.statusUntilTick || {};
    const timedMultiplier = (Number(currentTick) < Number(statusUntil.mooggy_zoomies || 0) ? 5 : 1)
      * (moveEffect.getCampaignTurtlePowerUpMultiplier?.(player, currentTick)
        ?? (Number(currentTick) < Number(statusUntil.turtle_powerup || 0) ? 1.3 : 1));
    const flightBoost = Number(currentTick) < Number(statusUntil.flying_unhitable || 0) ? 2 : 1;
    // God mode (all relics collected) boosts move speed 1.25x for its window.
    const godBoost = Number(currentTick) < Number(player?.godUntilTick || 0) ? 1.25 : 1;
    const laserWeight = Math.max(0, Number(player?.itemStats?.laserWeightMultiplier ?? 1));
    const laserSlow = player?.beamChannel ? Math.max(0, 1 - 0.6 * laserWeight) : 1;
    return Math.max(0, Number(player?.moveSpeed) || 228)
      * timedMultiplier
      * flightBoost
      * godBoost
      * laserSlow
      * Math.max(0, Number(player?.itemStats?.moveSpeedMultiplier ?? 1));
  }

  // A dashing player glides at its locked dash velocity (dashVx/dashVy) instead
  // of the input-derived velocity, and stays invulnerable, exactly like the
  // campaign's dashTime branch in update.js. `dashUntilTick` bounds the glide;
  // the invulnerability floor comes from `invulnerableUntilTick`, which the
  // authority sets at cast. Returns whether the player is mid-dash so both the
  // authority and client prediction resolve movement the same way.
  function isCampaignPlayerDashing(player, currentTick = 0) {
    return Number(currentTick) < Number(player?.dashUntilTick || 0);
  }

  function applyCampaignDashVelocity(player) {
    if (!player) return { vx: 0, vy: 0 };
    player.vx = Number(player.dashVx || 0);
    player.vy = Number(player.dashVy || 0);
    return { vx: player.vx, vy: player.vy };
  }

  // The plain dash is a short locked-velocity glide. This policy is shared by
  // the rendered campaign and authority so movement-direction precedence,
  // speed scaling, duration, and i-frames cannot drift apart.
  function resolveCampaignDashBurst(options = {}) {
    const moveX = Number(options.moveX) || 0;
    const moveY = Number(options.moveY) || 0;
    const aimDirection = Number(options.aimDirection) || 0;
    const angle = Math.hypot(moveX, moveY) > 0.15 ? Math.atan2(moveY, moveX) : aimDirection;
    const attackSpeed = Math.max(0, Number(options.attackSpeed) || 0);
    const godMultiplier = options.godMode ? 1.1 : 1;
    const speed = (520 + attackSpeed * 28) * godMultiplier;
    return {
      angle,
      speed,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      durationSeconds: 0.16,
      invulnerabilitySeconds: 0.18,
    };
  }

  function resolveCampaignBlinkDestination(options = {}) {
    const radius = Math.max(1, Number(options.radius) || 18);
    const width = Math.max(1, Number(options.width) || 900);
    const height = Math.max(1, Number(options.height) || 700);
    const wall = Math.max(0, Number(options.wall) || 28);
    const originX = Number(options.originX) || width / 2;
    const originY = Number(options.originY) || height / 2;
    const minX = wall + radius + 2;
    const maxX = width - wall - radius - 2;
    const minY = wall + radius + 2;
    const maxY = height - wall - radius - 2;
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
    const targetX = clamp(Number(options.targetX) || originX, minX, maxX);
    const targetY = clamp(Number(options.targetY) || originY, minY, maxY);
    const isBlocked = typeof options.isBlocked === 'function' ? options.isBlocked : () => false;
    const safe = (x, y) => !isBlocked(x, y, radius);
    if (safe(targetX, targetY)) return { x: targetX, y: targetY, targetX, targetY, adjusted: false };

    const maxSearchRadius = Math.max(0, Number(options.maxSearchRadius ?? 210));
    const step = Math.max(1, Number(options.searchStep ?? 18));
    for (let distance = step; distance <= maxSearchRadius; distance += step) {
      const checks = Math.max(8, Math.floor((Math.PI * 2 * distance) / step));
      for (let index = 0; index < checks; index += 1) {
        const angle = index / checks * Math.PI * 2;
        const x = clamp(targetX + Math.cos(angle) * distance, minX, maxX);
        const y = clamp(targetY + Math.sin(angle) * distance, minY, maxY);
        if (safe(x, y)) return { x, y, targetX, targetY, adjusted: true };
      }
    }
    return null;
  }

  function resolveCampaignNimrodStomp(options = {}) {
    const chargeRatio = Math.max(0, Math.min(1, Number(options.chargeRatio) || 0));
    const rangeMultiplier = Math.max(0, Number(options.rangeMultiplier ?? 1));
    const roomSpan = Math.max(Number(options.width) || 900, Number(options.height) || 700);
    const leapDistance = (108 + (roomSpan - 108) * chargeRatio) * rangeMultiplier;
    return {
      leapDistance,
      radius: (108 + chargeRatio * 54) * rangeMultiplier,
      damageMultiplier: 1 + chargeRatio * 0.7,
      invulnerabilitySeconds: 0.32,
    };
  }

  return {
    applyResponsiveVelocity,
    advanceCampaignMovementTimer,
    resolveCampaignMovementInput,
    resolveCampaignControlAim,
    applyCampaignImpulse,
    applyCampaignPlayerVelocity,
    getCampaignPlayerSlowMultiplier,
    advanceCampaignPlayerMovement,
    getCampaignPlayerMovementSpeed,
    isCampaignPlayerDashing,
    applyCampaignDashVelocity,
    resolveCampaignDashBurst,
    resolveCampaignBlinkDestination,
    resolveCampaignNimrodStomp,
  };
});
