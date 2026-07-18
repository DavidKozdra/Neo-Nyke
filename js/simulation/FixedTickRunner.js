(function initializeFixedTickRunner(root, factory) {
  const api = factory(root.NeoNyke?.simulation || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFixedTickRunnerApi(browserApi) {
  'use strict';

  const defaults = typeof require === 'function' ? require('./GameSimulation.js') : browserApi;
  const DEFAULT_TICK_RATE = defaults.SIMULATION_TICK_RATE || 30;
  const ACCUMULATOR_EPSILON = 1e-9;

  class FixedTickRunner {
    constructor(options = {}) {
      this.tickRate = Math.max(1, Math.trunc(Number(options.tickRate) || DEFAULT_TICK_RATE));
      this.fixedDelta = 1 / this.tickRate;
      this.maxFrameDelta = Math.max(this.fixedDelta, Number(options.maxFrameDelta) || 0.25);
      this.maxTicksPerAdvance = Math.max(1, Math.trunc(Number(options.maxTicksPerAdvance) || 8));
      this.update = typeof options.update === 'function' ? options.update : null;
      this.accumulator = 0;
      this.totalTicks = 0;
      this.droppedSeconds = 0;
    }

    advance(elapsedSeconds, update = this.update) {
      if (typeof update !== 'function') throw new TypeError('FixedTickRunner requires an update callback');
      const elapsed = Number(elapsedSeconds);
      if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('elapsedSeconds must be finite and non-negative');
      const accepted = Math.min(elapsed, this.maxFrameDelta);
      this.droppedSeconds += Math.max(0, elapsed - accepted);
      this.accumulator += accepted;

      let ticks = 0;
      while (this.accumulator + ACCUMULATOR_EPSILON >= this.fixedDelta && ticks < this.maxTicksPerAdvance) {
        update(this.fixedDelta, this.totalTicks);
        this.accumulator -= this.fixedDelta;
        if (this.accumulator < ACCUMULATOR_EPSILON) this.accumulator = 0;
        this.totalTicks += 1;
        ticks += 1;
      }

      if (ticks === this.maxTicksPerAdvance && this.accumulator >= this.fixedDelta) {
        const retained = this.accumulator % this.fixedDelta;
        this.droppedSeconds += this.accumulator - retained;
        this.accumulator = retained;
      }

      return {
        ticks,
        totalTicks: this.totalTicks,
        interpolationAlpha: this.accumulator / this.fixedDelta,
        droppedSeconds: this.droppedSeconds,
      };
    }

    discardAccumulatedTime() {
      this.accumulator = 0;
    }

    reset() {
      this.accumulator = 0;
      this.totalTicks = 0;
      this.droppedSeconds = 0;
    }
  }

  return { FixedTickRunner };
});
