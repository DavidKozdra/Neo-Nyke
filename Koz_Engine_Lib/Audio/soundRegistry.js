(function initSoundRegistryLib(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createSoundRegistryApi() {
  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function quantizeVolume(value, steps = 20) {
    const clamped = clamp(value, 0, 1);
    const count = Math.max(1, Number(steps) || 20);
    return Math.round(clamped * count) / count;
  }

  function computePositionalVolume(distance, maxDistance) {
    const dist = Math.max(0, Number(distance) || 0);
    const maxDist = Math.max(0.0001, Number(maxDistance) || 1);
    return clamp(1 - (dist / maxDist), 0, 1);
  }

  function buildRepeatedSources(path, variants = 21) {
    const count = Math.max(1, Number(variants) || 21);
    return Array.from({ length: count }, () => path);
  }

  function createSoundRegistry() {
    const sounds = new Map();
    return {
      register(id, config = {}) {
        const key = String(id || "");
        if (!key) throw new Error("Sound id is required");
        sounds.set(key, {
          id: key,
          path: String(config.path || ""),
          volume: clamp(config.volume ?? 1, 0, 1),
          variants: buildRepeatedSources(config.path || "", config.variants || 21),
        });
        return sounds.get(key);
      },
      get(id) {
        return sounds.get(String(id || "")) || null;
      },
      list() {
        return Array.from(sounds.values());
      },
      clear() {
        sounds.clear();
      },
    };
  }

  return {
    clamp,
    quantizeVolume,
    computePositionalVolume,
    buildRepeatedSources,
    createSoundRegistry,
  };
});
