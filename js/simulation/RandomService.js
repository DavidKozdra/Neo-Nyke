(function initializeRandomService(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRandomServiceApi() {
  'use strict';

  const DEFAULT_NONZERO_SEED = 0x9e3779b9;
  const DEFAULT_RANDOM_STREAMS = Object.freeze([
    'floor-generation',
    'enemy-spawning',
    'loot',
    'shop-inventory',
    'combat-variance',
    'boss-patterns',
  ]);

  function hashString(value) {
    const text = String(value ?? '');
    let hash = 2166136261 >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function normalizeSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) {
      return (Math.trunc(seed) >>> 0) || DEFAULT_NONZERO_SEED;
    }
    return hashString(seed) || DEFAULT_NONZERO_SEED;
  }

  function deriveSeed(matchSeed, streamName) {
    const base = normalizeSeed(matchSeed);
    const nameHash = hashString(streamName);
    return (base ^ nameHash ^ 0x85ebca6b) >>> 0 || DEFAULT_NONZERO_SEED;
  }

  class RandomStream {
    constructor(seed, state) {
      this.seed = normalizeSeed(seed);
      this.state = state === undefined ? this.seed : normalizeSeed(state);
      this.draws = 0;
    }

    next() {
      let value = this.state >>> 0;
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      this.state = (value >>> 0) || DEFAULT_NONZERO_SEED;
      this.draws += 1;
      return this.state / 4294967296;
    }

    int(min, max) {
      const lower = Math.ceil(Math.min(Number(min), Number(max)));
      const upper = Math.floor(Math.max(Number(min), Number(max)));
      if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
        throw new TypeError('RandomStream.int requires finite bounds');
      }
      return lower + Math.floor(this.next() * (upper - lower + 1));
    }

    chance(probability) {
      const value = Number(probability);
      if (!Number.isFinite(value)) throw new TypeError('Probability must be finite');
      return this.next() < Math.max(0, Math.min(1, value));
    }

    pick(values) {
      if (!Array.isArray(values) || values.length === 0) return undefined;
      return values[Math.floor(this.next() * values.length)];
    }

    shuffle(values) {
      const result = Array.isArray(values) ? values.slice() : [];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const other = Math.floor(this.next() * (index + 1));
        [result[index], result[other]] = [result[other], result[index]];
      }
      return result;
    }

    snapshot() {
      return { seed: this.seed >>> 0, state: this.state >>> 0, draws: this.draws };
    }

    restore(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') throw new TypeError('Invalid random stream snapshot');
      this.seed = normalizeSeed(snapshot.seed);
      this.state = normalizeSeed(snapshot.state);
      this.draws = Math.max(0, Math.trunc(Number(snapshot.draws) || 0));
      return this;
    }
  }

  class RandomService {
    constructor(options = {}) {
      this.matchSeed = options.matchSeed ?? options.seed ?? DEFAULT_NONZERO_SEED;
      this.generationVersion = Math.max(1, Math.trunc(Number(options.generationVersion) || 1));
      this.contentVersion = String(options.contentVersion || 'development');
      this.streams = new Map();
      const names = Array.isArray(options.streamNames) ? options.streamNames : DEFAULT_RANDOM_STREAMS;
      names.forEach(name => this.stream(name));
    }

    stream(name) {
      const key = String(name || 'default');
      if (!this.streams.has(key)) {
        this.streams.set(key, new RandomStream(deriveSeed(this.matchSeed, key)));
      }
      return this.streams.get(key);
    }

    next(name) {
      return this.stream(name).next();
    }

    scoped(scope) {
      return new RandomStream(deriveSeed(this.matchSeed, `scope:${String(scope || '')}`));
    }

    snapshot() {
      const streams = {};
      Array.from(this.streams.keys()).sort().forEach(name => {
        streams[name] = this.streams.get(name).snapshot();
      });
      return {
        matchSeed: this.matchSeed,
        generationVersion: this.generationVersion,
        contentVersion: this.contentVersion,
        streams,
      };
    }

    restore(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') throw new TypeError('Invalid random service snapshot');
      this.matchSeed = snapshot.matchSeed ?? DEFAULT_NONZERO_SEED;
      this.generationVersion = Math.max(1, Math.trunc(Number(snapshot.generationVersion) || 1));
      this.contentVersion = String(snapshot.contentVersion || 'development');
      this.streams.clear();
      Object.keys(snapshot.streams || {}).sort().forEach(name => {
        const stream = new RandomStream(deriveSeed(this.matchSeed, name));
        stream.restore(snapshot.streams[name]);
        this.streams.set(name, stream);
      });
      return this;
    }

    static fromSnapshot(snapshot) {
      return new RandomService({ matchSeed: snapshot?.matchSeed }).restore(snapshot);
    }
  }

  return {
    DEFAULT_NONZERO_SEED,
    DEFAULT_RANDOM_STREAMS,
    hashString,
    normalizeSeed,
    deriveSeed,
    RandomStream,
    RandomService,
  };
});
