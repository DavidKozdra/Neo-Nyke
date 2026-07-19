(function initializeCampaignMovementRules(root, factory) {
  const status = typeof require === 'function' ? require('./SharedStatusSystem.js') : (root.NeoNyke?.simulation || {});
  const api = factory(status);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCampaignMovementRulesApi(status) {
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

  function getCampaignPlayerMovementSpeed(player, currentTick = 0) {
    const statusUntil = player?.statusUntilTick || {};
    const timedMultiplier = Number(currentTick) < Number(statusUntil.mooggy_zoomies || 0) ? 5
      : Number(currentTick) < Number(statusUntil.turtle_powerup || 0) ? 1.3 : 1;
    return Math.max(0, Number(player?.moveSpeed) || 180)
      * timedMultiplier
      * Math.max(0.1, Number(player?.itemStats?.moveSpeedMultiplier || 1))
      * (status.getCampaignSlowMultiplier?.(
        status.getCampaignStatusStacks?.(player, 'slow') || 0,
        Number(player?.itemStats?.negativeStatusMultiplier || 1),
      ) ?? 1);
  }

  return { applyResponsiveVelocity, getCampaignPlayerMovementSpeed };
});
