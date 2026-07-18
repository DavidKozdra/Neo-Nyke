(function initializeGameState(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGameStateApi() {
  'use strict';

  const GAME_STATE_VERSION = 1;
  const PROTOCOL_VERSION = 1;
  const VALID_MATCH_STATUSES = new Set(['waiting', 'starting', 'running', 'transitioning', 'ended']);

  function plainObject(value, fallback = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
  }

  function cloneSerializable(value) {
    // Reject non-serializable leaf types with a clear message. True circular
    // references are caught natively by JSON.stringify below — we must NOT
    // hand-roll cycle detection with a "seen" set, because a set that never
    // clears also rejects legitimate shared references (diamonds), e.g. the
    // same room-transition object referenced from two floorState fields.
    let json;
    try {
      json = JSON.stringify(value, (_key, current) => {
        if (typeof current === 'function' || typeof current === 'symbol' || typeof current === 'bigint') {
          throw new TypeError('Game state contains a non-serializable value');
        }
        return current;
      });
    } catch (error) {
      if (error instanceof TypeError && /circular|cyclic/i.test(error.message)) {
        throw new TypeError('Game state contains a circular reference');
      }
      throw error;
    }
    if (json === undefined) throw new TypeError('Game state must be serializable');
    return JSON.parse(json);
  }

  function normalizeRecord(source = {}) {
    const status = VALID_MATCH_STATUSES.has(source.status) ? source.status : 'waiting';
    const requestedMode = String(source.matchRules?.mode || 'coop');
    const mode = requestedMode === 'rival' ? 'rival' : 'coop';
    return {
      protocolVersion: PROTOCOL_VERSION,
      stateVersion: GAME_STATE_VERSION,
      matchId: String(source.matchId || 'offline'),
      tick: Math.max(0, Math.trunc(Number(source.tick) || 0)),
      elapsedSeconds: Math.max(0, Number(source.elapsedSeconds) || 0),
      matchSeed: source.matchSeed ?? source.seed ?? 0,
      floorSeed: source.floorSeed ?? source.matchSeed ?? source.seed ?? 0,
      generationVersion: Math.max(1, Math.trunc(Number(source.generationVersion) || 1)),
      contentVersion: String(source.contentVersion || 'development'),
      floorNumber: Math.max(1, Math.trunc(Number(source.floorNumber) || 1)),
      status,
      matchRules: {
        sharedDiscovery: mode === 'coop',
        ...cloneSerializable(plainObject(source.matchRules)),
        // Security-sensitive rule values are derived from the validated mode.
        mode,
        friendlyFire: mode === 'rival',
        reviveEnabled: mode === 'coop',
        floorAdvance: mode === 'coop' ? 'all-living' : 'first',
      },
      runStats: cloneSerializable(plainObject(source.runStats, { killsByPlayer: {}, playerKills: {}, deathsByPlayer: {} })),
      players: cloneSerializable(plainObject(source.players)),
      enemies: cloneSerializable(plainObject(source.enemies)),
      projectiles: cloneSerializable(plainObject(source.projectiles)),
      abilityEntities: cloneSerializable(plainObject(source.abilityEntities)),
      pickups: cloneSerializable(plainObject(source.pickups)),
      interactables: cloneSerializable(plainObject(source.interactables)),
      floorState: cloneSerializable(plainObject(source.floorState)),
      bossState: source.bossState == null ? null : cloneSerializable(source.bossState),
      randomState: source.randomState == null ? null : cloneSerializable(source.randomState),
      nextEntityId: Math.max(1, Math.trunc(Number(source.nextEntityId) || 1)),
    };
  }

  class GameState {
    constructor(source = {}) {
      Object.assign(this, normalizeRecord(source));
    }

    allocateEntityId(kind = 'entity') {
      const prefix = String(kind || 'entity').toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'entity';
      const id = `${prefix}-${this.nextEntityId}`;
      this.nextEntityId += 1;
      return id;
    }

    snapshot() {
      return cloneSerializable(this.toJSON());
    }

    serialize() {
      return JSON.stringify(this.toJSON());
    }

    toJSON() {
      return normalizeRecord(this);
    }

    static deserialize(serialized) {
      if (typeof serialized !== 'string') throw new TypeError('Serialized game state must be a JSON string');
      const parsed = JSON.parse(serialized);
      if (Number(parsed?.stateVersion) !== GAME_STATE_VERSION) {
        throw new RangeError(`Unsupported game state version: ${String(parsed?.stateVersion)}`);
      }
      if (Number(parsed?.protocolVersion) !== PROTOCOL_VERSION) {
        throw new RangeError(`Unsupported protocol version: ${String(parsed?.protocolVersion)}`);
      }
      return new GameState(parsed);
    }
  }

  return {
    GAME_STATE_VERSION,
    PROTOCOL_VERSION,
    VALID_MATCH_STATUSES,
    cloneSerializable,
    GameState,
  };
});
