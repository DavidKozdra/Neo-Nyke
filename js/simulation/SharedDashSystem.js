(function initializeSharedDashSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedDashApi() {
  'use strict';

  function entityRadius(entity) { return Math.max(0, Number(entity?.radius ?? entity?.r ?? 0)); }
  function entityId(entity, index) { return String(entity?.id ?? entity?.entityId ?? `index:${index}`); }

  const PRINCESS_SHIELD_BARRIER_RATIO = 0.4;
  const PRINCESS_SHIELD_AUTO_HP_RATIO = 0.15;

  // Princess Shield is an overheal barrier, not a replacement shield. The
  // campaign deliberately adds another 40% max HP to any remaining barrier;
  // keeping this calculation here prevents the authority from silently losing
  // an unspent shield on a second cast.
  function resolveCampaignPrincessShield(options = {}) {
    const maxHp = Math.max(0, Number(options.maxHp || 0));
    const barrierBefore = Math.max(0, Number(options.barrier || 0));
    const barrierGain = Math.round(maxHp * PRINCESS_SHIELD_BARRIER_RATIO);
    return {
      barrierGain,
      barrier: barrierBefore + barrierGain,
      barrierRatio: PRINCESS_SHIELD_BARRIER_RATIO,
    };
  }

  function shouldAutoCastCampaignPrincessShield(options = {}) {
    if (options.characterKey !== 'princess' || options.dashMove !== 'princess_shield') return false;
    if (options.isDashing || options.isCharging) return false;
    const maxHp = Math.max(1, Number(options.maxHp || 1));
    const hp = Number(options.hp || 0);
    return hp > 0 && hp < maxHp * PRINCESS_SHIELD_AUTO_HP_RATIO;
  }

  function findCampaignNearestDashTarget(entities, x, y, range, excluded = new Set()) {
    const maximum = Math.max(0, Number(range) || 0);
    let closest = null;
    (Array.isArray(entities) ? entities : []).forEach((entity, index) => {
      if (!entity || entity.dead || Number(entity.health ?? entity.hp ?? 1) <= 0) return;
      const id = entityId(entity, index);
      if (excluded.has(id)) return;
      const distance = Math.hypot(Number(entity.x) - x, Number(entity.y) - y);
      if (distance > maximum) return;
      if (!closest || distance < closest.distance || (distance === closest.distance && id < closest.id)) {
        closest = { entity, id, distance };
      }
    });
    return closest;
  }

  // Zip Lightning's authored campaign path: up to three cursor-biased hops;
  // each lands just before a target, falls back to a directional blink when no
  // target exists, and scales range at level seven. Rendering and damage stay
  // adapter-owned, while target selection and movement intent are shared.
  function planCampaignZipLightning(options = {}) {
    const entities = Array.isArray(options.entities) ? options.entities : [];
    const playerRadius = Math.max(1, Number(options.playerRadius) || 18);
    const resolveLanding = typeof options.resolveLanding === 'function'
      ? options.resolveLanding
      : point => ({ x: point.x, y: point.y });
    const level = Math.max(1, Number(options.level) || 1);
    const rangeMultiplier = level >= 7 ? 1.5 : 1;
    const targetX = Number(options.targetX ?? options.originX) || 0;
    const targetY = Number(options.targetY ?? options.originY) || 0;
    const fallbackAngle = Number(options.fallbackAngle) || 0;
    let sourceX = Number(options.originX) || 0;
    let sourceY = Number(options.originY) || 0;
    const visited = new Set();
    const hops = [];

    for (let hopIndex = 0; hopIndex < 3; hopIndex += 1) {
      const primary = findCampaignNearestDashTarget(
        entities,
        hopIndex === 0 ? targetX : sourceX,
        hopIndex === 0 ? targetY : sourceY,
        (hopIndex === 0 ? 280 : 260) * rangeMultiplier,
        visited,
      );
      const candidate = primary || findCampaignNearestDashTarget(entities, sourceX, sourceY, 260 * rangeMultiplier, visited);
      if (!candidate) break;
      visited.add(candidate.id);
      const target = candidate.entity;
      const angle = Math.atan2(Number(target.y) - sourceY, Number(target.x) - sourceX);
      const landDistance = entityRadius(target) + playerRadius + 8;
      const requested = {
        x: Number(target.x) - Math.cos(angle) * landDistance,
        y: Number(target.y) - Math.sin(angle) * landDistance,
      };
      const landing = resolveLanding(requested, { target, hopIndex, sourceX, sourceY, angle });
      const destination = landing ? { x: Number(landing.x), y: Number(landing.y) } : { x: sourceX, y: sourceY };
      hops.push({ hopIndex, target, targetId: candidate.id, fromX: sourceX, fromY: sourceY, x: destination.x, y: destination.y, angle });
      sourceX = destination.x;
      sourceY = destination.y;
    }

    if (hops.length > 0) return { hops, fallback: null, rangeMultiplier };
    const requested = {
      x: sourceX + Math.cos(fallbackAngle) * 190 * rangeMultiplier,
      y: sourceY + Math.sin(fallbackAngle) * 190 * rangeMultiplier,
    };
    const landing = resolveLanding(requested, { target: null, hopIndex: 0, sourceX, sourceY, angle: fallbackAngle });
    return {
      hops: [],
      fallback: landing ? { fromX: sourceX, fromY: sourceY, x: Number(landing.x), y: Number(landing.y), angle: fallbackAngle } : null,
      rangeMultiplier,
    };
  }

  // Knight Slash Dash follows the same cursor-biased three-hop selection as
  // Zip Lightning, but lands just past each target and uses its own fallback
  // distance. Damage/bleed are adapter-owned; this owns deterministic motion.
  function planCampaignKnightSlashDash(options = {}) {
    const entities = Array.isArray(options.entities) ? options.entities : [];
    const playerRadius = Math.max(1, Number(options.playerRadius) || 18);
    const resolveLanding = typeof options.resolveLanding === 'function'
      ? options.resolveLanding
      : point => ({ x: point.x, y: point.y });
    const targetX = Number(options.targetX ?? options.originX) || 0;
    const targetY = Number(options.targetY ?? options.originY) || 0;
    const fallbackAngle = Number(options.fallbackAngle) || 0;
    let sourceX = Number(options.originX) || 0;
    let sourceY = Number(options.originY) || 0;
    const visited = new Set();
    const hops = [];

    for (let hopIndex = 0; hopIndex < 3; hopIndex += 1) {
      const primary = findCampaignNearestDashTarget(
        entities,
        hopIndex === 0 ? targetX : sourceX,
        hopIndex === 0 ? targetY : sourceY,
        hopIndex === 0 ? 300 : 260,
        visited,
      );
      const candidate = primary || findCampaignNearestDashTarget(entities, sourceX, sourceY, 260, visited);
      if (!candidate) break;
      visited.add(candidate.id);
      const target = candidate.entity;
      const angle = Math.atan2(Number(target.y) - sourceY, Number(target.x) - sourceX);
      const landDistance = entityRadius(target) + playerRadius + 6;
      const requested = {
        x: Number(target.x) + Math.cos(angle) * landDistance,
        y: Number(target.y) + Math.sin(angle) * landDistance,
      };
      const alternate = {
        x: Number(target.x) - Math.cos(angle) * landDistance,
        y: Number(target.y) - Math.sin(angle) * landDistance,
      };
      const landing = resolveLanding(requested, { target, hopIndex, sourceX, sourceY, angle, alternate });
      const destination = landing ? { x: Number(landing.x), y: Number(landing.y) } : { x: sourceX, y: sourceY };
      hops.push({ hopIndex, target, targetId: candidate.id, fromX: sourceX, fromY: sourceY, x: destination.x, y: destination.y, angle });
      sourceX = destination.x;
      sourceY = destination.y;
    }

    if (hops.length > 0) return { hops, fallback: null };
    const requested = { x: sourceX + Math.cos(fallbackAngle) * 210, y: sourceY + Math.sin(fallbackAngle) * 210 };
    const landing = resolveLanding(requested, { target: null, hopIndex: 0, sourceX, sourceY, angle: fallbackAngle });
    return { hops: [], fallback: landing ? { fromX: sourceX, fromY: sourceY, x: Number(landing.x), y: Number(landing.y), angle: fallbackAngle } : null };
  }

  return {
    findCampaignNearestDashTarget,
    planCampaignZipLightning,
    planCampaignKnightSlashDash,
    resolveCampaignPrincessShield,
    shouldAutoCastCampaignPrincessShield,
  };
});
