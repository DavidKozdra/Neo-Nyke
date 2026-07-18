(function initializeCampaignMovementRules(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCampaignMovementRulesApi() {
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

  return { applyResponsiveVelocity };
});
