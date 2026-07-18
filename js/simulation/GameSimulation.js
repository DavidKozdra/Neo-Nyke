(function initializeGameSimulation(root, factory) {
  const api = factory(root.NeoNyke?.simulation || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGameSimulationApi(browserApi) {
  'use strict';

  const gameStateApi = typeof require === 'function' ? require('./GameState.js') : browserApi;
  const randomApi = typeof require === 'function' ? require('./RandomService.js') : browserApi;
  const { GameState } = gameStateApi;
  const { RandomService } = randomApi;

  const SIMULATION_TICK_RATE = 20;
  const FIXED_DELTA_SECONDS = 1 / SIMULATION_TICK_RATE;

  class GameSimulation {
    constructor(options = {}) {
      this.state = options.state instanceof GameState ? options.state : new GameState(options.state);
      this.random = options.randomService || new RandomService({
        matchSeed: this.state.matchSeed,
        generationVersion: this.state.generationVersion,
        contentVersion: this.state.contentVersion,
      });
      if (this.state.randomState) this.random.restore(this.state.randomState);
      this.systems = Array.isArray(options.systems) ? options.systems.slice() : [];
    }

    addSystem(system) {
      if (typeof system !== 'function' && typeof system?.update !== 'function') {
        throw new TypeError('Simulation systems must be functions or expose update()');
      }
      this.systems.push(system);
      return this;
    }

    updateGame(inputs = {}, fixedDelta = FIXED_DELTA_SECONDS) {
      const delta = Number(fixedDelta);
      if (!Number.isFinite(delta) || delta <= 0) throw new RangeError('fixedDelta must be positive and finite');
      const context = { state: this.state, inputs, fixedDelta: delta, random: this.random };
      this.systems.forEach(system => {
        if (typeof system === 'function') system(context);
        else system.update(context);
      });
      this.state.tick += 1;
      this.state.elapsedSeconds += delta;
      this.state.randomState = this.random.snapshot();
      return this.state;
    }

    serialize() {
      this.state.randomState = this.random.snapshot();
      return this.state.serialize();
    }

    static deserialize(serialized, options = {}) {
      const state = GameState.deserialize(serialized);
      return new GameSimulation({ ...options, state });
    }
  }

  function updateGame(simulation, inputs, fixedDelta = FIXED_DELTA_SECONDS) {
    if (!(simulation instanceof GameSimulation)) throw new TypeError('updateGame requires a GameSimulation');
    return simulation.updateGame(inputs, fixedDelta);
  }

  return { SIMULATION_TICK_RATE, FIXED_DELTA_SECONDS, GameSimulation, updateGame };
});
