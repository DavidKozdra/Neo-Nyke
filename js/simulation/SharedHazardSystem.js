(function initializeSharedHazardSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedHazardApi() {
  'use strict';

  function campaignCircleHazardHitsEntity(hazard, entity, radius = hazard?.triggerRadius ?? hazard?.blastRadius ?? hazard?.r ?? 0) {
    if (!hazard || !entity) return false;
    const hazardRadius = Math.max(0, Number(radius || 0));
    const entityRadius = Math.max(0, Number(entity.radius ?? entity.r ?? 0));
    return Math.hypot(Number(entity.x) - Number(hazard.x), Number(entity.y) - Number(hazard.y)) <= hazardRadius + entityRadius;
  }

  function campaignRectHazardHitsEntity(hazard, entity) {
    if (!hazard || !entity) return false;
    const entityRadius = Math.max(0, Number(entity.radius ?? entity.r ?? 0));
    const left = Number.isFinite(Number(hazard.left)) ? Number(hazard.left) : Number(hazard.x) - Number(hazard.w || 0) / 2;
    const top = Number.isFinite(Number(hazard.top)) ? Number(hazard.top) : Number(hazard.y) - Number(hazard.h || 0) / 2;
    const nearestX = Math.max(left, Math.min(left + Number(hazard.w || 0), Number(entity.x)));
    const nearestY = Math.max(top, Math.min(top + Number(hazard.h || 0), Number(entity.y)));
    return Math.hypot(Number(entity.x) - nearestX, Number(entity.y) - nearestY) < entityRadius;
  }

  function campaignHazardHitsEntity(hazard, entity, options = {}) {
    if (hazard?.shape === 'rect' || (Number(hazard?.w || 0) > 0 && Number(hazard?.h || 0) > 0)) {
      return campaignRectHazardHitsEntity(hazard, entity);
    }
    return campaignCircleHazardHitsEntity(hazard, entity, options.radius);
  }

  return { campaignCircleHazardHitsEntity, campaignRectHazardHitsEntity, campaignHazardHitsEntity };
});
