(function initializeSharedHazardSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedHazardApi() {
  'use strict';

  function campaignCircleHazardHitsEntity(hazard, entity, radius = hazard?.triggerRadius ?? hazard?.blastRadius ?? hazard?.r ?? 0, options = {}) {
    if (!hazard || !entity) return false;
    const hazardRadius = Math.max(0, Number(radius || 0));
    const entityRadius = Math.max(0, Number(entity.radius ?? entity.r ?? 0) + Number(options.entityRadiusOffset || 0));
    return Math.hypot(Number(entity.x) - Number(hazard.x), Number(entity.y) - Number(hazard.y)) <= hazardRadius + entityRadius;
  }

  function campaignRectHazardHitsEntity(hazard, entity, options = {}) {
    if (!hazard || !entity) return false;
    const entityRadius = Math.max(0, Number(entity.radius ?? entity.r ?? 0) + Number(options.entityRadiusOffset || 0));
    const left = Number.isFinite(Number(hazard.left)) ? Number(hazard.left) : Number(hazard.x) - Number(hazard.w || 0) / 2;
    const top = Number.isFinite(Number(hazard.top)) ? Number(hazard.top) : Number(hazard.y) - Number(hazard.h || 0) / 2;
    const nearestX = Math.max(left, Math.min(left + Number(hazard.w || 0), Number(entity.x)));
    const nearestY = Math.max(top, Math.min(top + Number(hazard.h || 0), Number(entity.y)));
    return Math.hypot(Number(entity.x) - nearestX, Number(entity.y) - nearestY) < entityRadius;
  }

  function campaignHazardHitsEntity(hazard, entity, options = {}) {
    if (hazard?.shape === 'rect' || (Number(hazard?.w || 0) > 0 && Number(hazard?.h || 0) > 0)) {
      return campaignRectHazardHitsEntity(hazard, entity, options);
    }
    return campaignCircleHazardHitsEntity(hazard, entity, options.radius, options);
  }

  // These small insets are part of the campaign's authored lava feel: the
  // visible hazard edge is forgiving, unlike traps and explosions which use
  // a full entity radius. Keep them here so multiplayer cannot make lava
  // rooms wider than the campaign.
  function campaignLavaHitsEntity(hazard, entity, options = {}) {
    const enemyTarget = options.targetKind === 'enemy';
    return campaignHazardHitsEntity(hazard, entity, {
      entityRadiusOffset: hazard?.shape === 'rect'
        ? (enemyTarget ? -4 : -6)
        : (enemyTarget ? -6 : -10),
    });
  }

  // The trap's arm/fuse/detonation transition is gameplay state, not
  // presentation. Both the rendered campaign and the authoritative room use
  // this exact state machine; callers only provide target selection and react
  // to its returned intents.
  function advanceCampaignExplosiveTrap(hazard, options = {}) {
    if (!hazard || hazard.kind !== 'explosive_trap') return { ignored: true };
    if (hazard.exploded) return { exploded: true, alreadyExploded: true };

    const delta = Math.max(0, Number(options.delta) || 0);
    if (!hazard.triggered) {
      if (!options.triggered) return { armed: true };
      hazard.triggered = true;
      hazard.fuse = Math.max(0, Number(hazard.fuseDuration ?? 0.75));
      return { armed: true, triggered: true, justTriggered: true, fuse: hazard.fuse };
    }

    hazard.fuse = Math.max(0, Number(hazard.fuse || 0) - delta);
    if (hazard.fuse > 0) return { triggered: true, fuse: hazard.fuse };
    hazard.exploded = true;
    return { triggered: true, exploded: true, justExploded: true, fuse: 0 };
  }

  // Lava is a continuous campaign contact effect: it deliberately bypasses
  // normal hit i-frames and its burn refresh is shared by every victim in the
  // zone. Returning a small intent keeps the state policy deterministic while
  // each runtime remains responsible for damage/status presentation.
  function advanceCampaignLavaContact(hazard, options = {}) {
    if (!hazard || hazard.kind !== 'lava') return { ignored: true };
    const delta = Math.max(0, Number(options.delta) || 0);
    const statusInterval = Math.max(0.01, Number(hazard.statusInterval ?? 0.45));
    hazard.statusTick = Number(hazard.statusTick ?? 0) - delta;
    const applyFire = hazard.statusTick <= 0;
    if (applyFire) hazard.statusTick = statusInterval;
    return {
      damage: Math.max(0, Number(hazard.playerDamagePerSecond ?? 6)) * delta,
      applyFire,
      statusInterval,
    };
  }

  // Blood spikes are the one hazard that is a loose physical object rather
  // than a fixed floor feature: a laser hit shoves the whole spike cluster and
  // it slides until friction stops it. Both runtimes share this integrator so
  // a spike sits at the same place on every client.
  const HAZARD_PHYSICS_KINDS = new Set(['red_spikes']);
  const HAZARD_PHYSICS_DRAG = 3.4;
  const HAZARD_PHYSICS_REST_SPEED = 6;
  const HAZARD_PHYSICS_WALL_BOUNCE = 0.42;

  function hazardHasPhysics(hazard) {
    return !!hazard && HAZARD_PHYSICS_KINDS.has(hazard.kind);
  }

  // Returns whether the hazard actually moved, so callers can invalidate the
  // beam-reflection geometry only on the frames a spike really shifts.
  function advanceCampaignHazardPhysics(hazard, options = {}) {
    if (!hazardHasPhysics(hazard)) return { ignored: true, moved: false };
    const delta = Math.max(0, Number(options.delta) || 0);
    let vx = Number(hazard.vx || 0);
    let vy = Number(hazard.vy || 0);
    if (!delta || (vx === 0 && vy === 0)) return { moved: false, vx, vy };

    let x = Number(hazard.x || 0) + vx * delta;
    let y = Number(hazard.y || 0) + vy * delta;

    // Bounce off the room edges so a hard shove cannot bury spikes in a wall.
    const radius = Math.max(0, Number(hazard.r || 0));
    const width = Math.max(0, Number(options.width || 0));
    const height = Math.max(0, Number(options.height || 0));
    if (width > 0) {
      if (x < radius) { x = radius; vx = Math.abs(vx) * HAZARD_PHYSICS_WALL_BOUNCE; }
      else if (x > width - radius) { x = width - radius; vx = -Math.abs(vx) * HAZARD_PHYSICS_WALL_BOUNCE; }
    }
    if (height > 0) {
      if (y < radius) { y = radius; vy = Math.abs(vy) * HAZARD_PHYSICS_WALL_BOUNCE; }
      else if (y > height - radius) { y = height - radius; vy = -Math.abs(vy) * HAZARD_PHYSICS_WALL_BOUNCE; }
    }

    // Exponential drag, then snap to rest so spikes never creep forever.
    const damping = Math.exp(-HAZARD_PHYSICS_DRAG * delta);
    vx *= damping;
    vy *= damping;
    if (Math.hypot(vx, vy) < HAZARD_PHYSICS_REST_SPEED) { vx = 0; vy = 0; }

    const moved = x !== hazard.x || y !== hazard.y;
    hazard.x = x;
    hazard.y = y;
    hazard.vx = vx;
    hazard.vy = vy;
    return { moved, vx, vy, x, y };
  }

  // A beam landing on a spike shoves it along the beam segment's direction.
  // Force is per-second and scaled by the caller's tick so a sustained beam
  // pushes smoothly instead of jolting once per frame.
  function applyCampaignHazardBeamPush(hazard, angle, force, options = {}) {
    if (!hazardHasPhysics(hazard)) return { ignored: true, pushed: false };
    const delta = Math.max(0, Number(options.delta) || 0);
    const push = Math.max(0, Number(force || 0)) * delta;
    if (!push) return { pushed: false };
    hazard.vx = Number(hazard.vx || 0) + Math.cos(angle) * push;
    hazard.vy = Number(hazard.vy || 0) + Math.sin(angle) * push;
    return { pushed: true, vx: hazard.vx, vy: hazard.vy };
  }

  return {
    HAZARD_PHYSICS_KINDS,
    hazardHasPhysics,
    advanceCampaignHazardPhysics,
    applyCampaignHazardBeamPush,
    campaignCircleHazardHitsEntity,
    campaignRectHazardHitsEntity,
    campaignHazardHitsEntity,
    campaignLavaHitsEntity,
    advanceCampaignExplosiveTrap,
    advanceCampaignLavaContact,
  };
});
