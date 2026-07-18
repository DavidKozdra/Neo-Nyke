(function initializeOfflineGameSession(root, factory) {
  const api = factory(root.NeoNyke?.multiplayer || {}, root.NeoNyke?.simulation || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.multiplayer = namespace.multiplayer || {};
  Object.assign(namespace.multiplayer, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOfflineGameSessionApi(browserMultiplayerApi, browserSimulationApi) {
  'use strict';

  const transportApi = typeof require === 'function' ? require('./OfflineTransport.js') : browserMultiplayerApi;
  const simulationApi = typeof require === 'function' ? require('../simulation/GameSimulation.js') : browserSimulationApi;
  const gameStateApi = typeof require === 'function' ? require('../simulation/GameState.js') : browserSimulationApi;
  const { OfflineTransport } = transportApi;
  const { GameSimulation, FIXED_DELTA_SECONDS } = simulationApi;
  const { GameState } = gameStateApi;

  class OfflineGameSession {
    constructor(options = {}) {
      this.mode = 'single-player';
      this.authority = 'local';
      this.transport = options.transport || new OfflineTransport(options.transportOptions);
      if (!(this.transport instanceof OfflineTransport)) {
        throw new TypeError('OfflineGameSession requires an OfflineTransport');
      }
      this.sessionId = String(options.sessionId || 'offline-session');
      this.simulation = null;
      this.ready = false;
      this.disposed = false;
    }

    async initialize() {
      if (this.disposed) throw new Error('OfflineGameSession has been disposed');
      if (this.ready) return this;
      await this.transport.initialize();
      await this.transport.createSession({ sessionId: this.sessionId });
      this.ready = true;
      return this;
    }

    beginRun(options = {}) {
      if (!this.ready) throw new Error('OfflineGameSession must be initialized before beginning a run');
      const state = new GameState({
        protocolVersion: 1,
        matchId: this.sessionId,
        matchSeed: options.matchSeed ?? options.seed ?? 0,
        floorSeed: options.floorSeed ?? options.matchSeed ?? options.seed ?? 0,
        generationVersion: options.generationVersion ?? 1,
        contentVersion: options.contentVersion ?? 'development',
        floorNumber: options.floorNumber ?? 1,
        status: 'running',
      });
      this.simulation = new GameSimulation({ state, systems: options.systems || [] });
      return this.simulation;
    }

    advance(inputs = {}, fixedDelta = FIXED_DELTA_SECONDS) {
      if (!this.simulation) throw new Error('OfflineGameSession has no active run');
      return this.simulation.updateGame(inputs, fixedDelta);
    }

    snapshot() {
      return this.simulation?.state.snapshot() || null;
    }

    async dispose() {
      if (this.disposed) return;
      if (this.ready) await this.transport.leaveSession('disposed');
      this.transport.dispose();
      this.simulation = null;
      this.ready = false;
      this.disposed = true;
    }
  }

  return { OfflineGameSession };
});
