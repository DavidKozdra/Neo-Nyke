(function initializeFeatureFlags(root, factory) {
  const api = factory(root);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.features = api;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFeatureFlagsApi(root) {
  'use strict';

  const DEFAULT_FEATURE_FLAGS = Object.freeze({ multiplayer: false });
  const developmentOverrides = new Map();

  function isLocalDevelopment() {
    const hostname = String(root.location?.hostname || '').toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  function isEnabled(name) {
    const key = String(name || '');
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_FEATURE_FLAGS, key)) return false;
    if (developmentOverrides.has(key)) return developmentOverrides.get(key) === true;
    if (key === 'multiplayer' && isLocalDevelopment()) return true;
    return root.NEO_NYKE_FEATURES?.[key] === true || DEFAULT_FEATURE_FLAGS[key] === true;
  }

  function getSnapshot() {
    return Object.fromEntries(Object.keys(DEFAULT_FEATURE_FLAGS).map(name => [name, isEnabled(name)]));
  }

  function setDevelopmentFlag(name, enabled) {
    const key = String(name || '');
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_FEATURE_FLAGS, key)) {
      throw new RangeError(`Unknown Neo Nyke feature flag: ${key}`);
    }
    if (root.developer_mode !== true) {
      throw new Error('Development feature flags require developer_mode');
    }
    developmentOverrides.set(key, enabled === true);
    try {
      root.dispatchEvent(new CustomEvent('neo-feature-flags-changed', { detail: getSnapshot() }));
    } catch {
      // Headless tests and server authorities have no DOM event target.
    }
    return isEnabled(key);
  }

  function clearDevelopmentFlags() {
    developmentOverrides.clear();
    try {
      root.dispatchEvent(new CustomEvent('neo-feature-flags-changed', { detail: getSnapshot() }));
    } catch {
      // Headless tests and server authorities have no DOM event target.
    }
  }

  return { DEFAULT_FEATURE_FLAGS, isLocalDevelopment, isEnabled, getSnapshot, setDevelopmentFlag, clearDevelopmentFlags };
});
