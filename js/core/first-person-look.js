(function initializeFirstPersonLook(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.input = namespace.input || {};
  Object.assign(namespace.input, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFirstPersonLookApi() {
  'use strict';

  function applyFirstPersonLookDelta(yaw = 0, pitch = 0, deltaX = 0, deltaY = 0, options = {}) {
    const yawSensitivity = Math.max(0, Number(options.yawSensitivity ?? 0.0055) || 0);
    const pitchSensitivity = Math.max(0, Number(options.pitchSensitivity ?? 0.0045) || 0);
    const minimumPitch = Number.isFinite(Number(options.minimumPitch)) ? Number(options.minimumPitch) : -0.55;
    const maximumPitch = Number.isFinite(Number(options.maximumPitch)) ? Number(options.maximumPitch) : 0.45;
    const x = Number.isFinite(Number(deltaX)) ? Number(deltaX) : 0;
    const y = Number.isFinite(Number(deltaY)) ? Number(deltaY) : 0;
    const nextYaw = (Number(yaw) || 0) + x * yawSensitivity;
    const unclampedPitch = (Number(pitch) || 0) - y * pitchSensitivity;
    return {
      yaw: nextYaw,
      pitch: Math.max(Math.min(minimumPitch, maximumPitch), Math.min(Math.max(minimumPitch, maximumPitch), unclampedPitch)),
    };
  }

  return { applyFirstPersonLookDelta };
});
