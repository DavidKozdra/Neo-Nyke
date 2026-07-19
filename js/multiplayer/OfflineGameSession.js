(function initializeOfflineGameSession(root, factory) {
  const api = factory(root.NeoNyke?.multiplayer || {}, root.NeoNyke?.simulation || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.multiplayer = namespace.multiplayer || {};
  Object.assign(namespace.multiplayer, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOfflineGameSessionApi(browserMultiplayerApi, browserSimulationApi) {
  'use strict';

  const transportApi = typeof require === 'function' ? require('./OfflineTransport.js') : browserMultiplayerApi;
  const campaignApi = typeof require === 'function' ? require('../simulation/CampaignSimulation.js') : browserSimulationApi;
  const simulationApi = typeof require === 'function' ? require('../simulation/GameSimulation.js') : browserSimulationApi;
  const { OfflineTransport } = transportApi;
  const { FIXED_DELTA_SECONDS } = simulationApi;
  const { CAMPAIGN_CONTENT_VERSION, createCampaignSimulation, createCampaignPlayer } = campaignApi;

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
      this.playerId = null;
      this.gameplayEvents = [];
      this.listeners = new Set();
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
      if (typeof createCampaignSimulation !== 'function' || typeof createCampaignPlayer !== 'function') {
        throw new Error('CampaignSimulation is unavailable');
      }
      const playerId = String(options.playerId || this.transport.getLocalIdentity().id || 'offline-player');
      const matchSeed = options.matchSeed ?? options.seed ?? 0;
      const floorSeed = options.floorSeed ?? matchSeed;
      const stateOptions = {
        matchId: this.sessionId,
        matchSeed,
        floorSeed,
        generationVersion: options.generationVersion ?? 1,
        contentVersion: options.contentVersion ?? CAMPAIGN_CONTENT_VERSION ?? 'development',
        floorNumber: options.floorNumber ?? 1,
        status: 'running',
        matchRules: { mode: 'coop', friendlyFire: false, reviveEnabled: true, floorAdvance: 'all-living', sharedDiscovery: true },
      };
      this.simulation = createCampaignSimulation({
        ...stateOptions,
        emitEvent: (eventType, data) => {
          const event = { eventType, data: { ...data }, tick: this.simulation?.state.tick ?? 0 };
          this.gameplayEvents.push(event);
          this.listeners.forEach(listener => listener(event));
        },
        systems: options.systems,
      });
      this.playerId = playerId;
      const floorState = this.simulation.state.floorState;
      this.simulation.state.players[playerId] = createCampaignPlayer({
        id: playerId,
        peerId: playerId,
        displayName: options.displayName || this.transport.getLocalIdentity().displayName,
        characterKey: options.characterKey || 'thorn_knight',
        kitChoices: options.kitChoices,
        roomId: floorState.currentRoomId,
      });
      return this.simulation;
    }

    advance(inputs = {}, fixedDelta = FIXED_DELTA_SECONDS) {
      if (!this.simulation) throw new Error('OfflineGameSession has no active run');
      const hasPlayerMap = Object.prototype.hasOwnProperty.call(inputs || {}, this.playerId);
      const normalizedInputs = hasPlayerMap || !this.playerId
        ? inputs
        : { [this.playerId]: inputs };
      return this.simulation.updateGame(normalizedInputs, fixedDelta);
    }

    snapshot() {
      return this.simulation?.state.snapshot() || null;
    }

    subscribeGameplayEvents(handler) {
      if (typeof handler !== 'function') throw new TypeError('Offline gameplay listener must be a function');
      this.listeners.add(handler);
      return () => this.listeners.delete(handler);
    }

    async dispose() {
      if (this.disposed) return;
      if (this.ready) await this.transport.leaveSession('disposed');
      this.transport.dispose();
      this.simulation = null;
      this.playerId = null;
      this.gameplayEvents = [];
      this.listeners.clear();
      this.ready = false;
      this.disposed = true;
    }
  }

  return { OfflineGameSession };
});
