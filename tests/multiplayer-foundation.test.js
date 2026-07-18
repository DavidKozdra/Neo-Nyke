const { GameState } = require('../js/simulation/GameState');
const { GameSimulation, FIXED_DELTA_SECONDS, SIMULATION_TICK_RATE } = require('../js/simulation/GameSimulation');
const { FixedTickRunner } = require('../js/simulation/FixedTickRunner');
const { OfflineTransport } = require('../js/multiplayer/OfflineTransport');
const { OfflineGameSession } = require('../js/multiplayer/OfflineGameSession');
const featureFlags = require('../js/config/FeatureFlags');

describe('multiplayer architecture foundation', () => {
  test('multiplayer is disabled by default and the simulation begins at 20 Hz', () => {
    expect(featureFlags.DEFAULT_FEATURE_FLAGS.multiplayer).toBe(false);
    expect(featureFlags.isEnabled('multiplayer')).toBe(false);
    expect(SIMULATION_TICK_RATE).toBe(20);
    expect(FIXED_DELTA_SECONDS).toBe(0.05);
  });

  test('GameState round-trips as JSON and retains stable entity IDs', () => {
    const state = new GameState({ matchId: 'match-1', matchSeed: 42, status: 'running' });
    const playerId = state.allocateEntityId('player');
    state.players[playerId] = { id: playerId, x: 10, y: 20 };

    const restored = GameState.deserialize(state.serialize());
    expect(restored).toEqual(state);
    expect(restored.allocateEntityId('enemy')).toBe('enemy-2');
    expect(JSON.parse(restored.serialize()).players[playerId]).toEqual({ id: playerId, x: 10, y: 20 });
  });

  test('GameState rejects rendering objects and circular references', () => {
    const circular = {};
    circular.self = circular;
    expect(() => new GameState({ floorState: circular })).toThrow(/circular reference/);
    expect(() => new GameState({ players: { p1: { draw: () => {} } } })).toThrow(/non-serializable/);
  });

  test('fixed ticks converge independently of render frame rate', () => {
    const runAtFrameRate = framesPerSecond => {
      const state = { x: 0 };
      const runner = new FixedTickRunner({ tickRate: 30, maxTicksPerAdvance: 30 });
      for (let frame = 0; frame < framesPerSecond * 10; frame += 1) {
        runner.advance(1 / framesPerSecond, delta => { state.x += 90 * delta; });
      }
      return { state, ticks: runner.totalTicks };
    };

    expect(runAtFrameRate(60)).toEqual(runAtFrameRate(144));
    expect(runAtFrameRate(60)).toEqual({ state: { x: 900 }, ticks: 300 });
  });

  test('headless simulations serialize RNG and resume deterministically', () => {
    const movementSystem = ({ state, inputs, fixedDelta, random }) => {
      const player = state.players.p1;
      player.x += Number(inputs.p1?.moveX || 0) * 120 * fixedDelta;
      if (random.stream('combat-variance').chance(0.2)) player.procs += 1;
    };
    const createSimulation = () => new GameSimulation({
      state: {
        matchId: 'headless',
        matchSeed: 12345,
        status: 'running',
        players: { p1: { id: 'p1', x: 0, procs: 0 } },
      },
      systems: [movementSystem],
    });
    const authority = createSimulation();
    const independent = createSimulation();

    for (let tick = 0; tick < 90; tick += 1) {
      const inputs = { p1: { moveX: tick < 45 ? 1 : -1 } };
      authority.updateGame(inputs, FIXED_DELTA_SECONDS);
      independent.updateGame(inputs, FIXED_DELTA_SECONDS);
    }
    expect(independent.serialize()).toBe(authority.serialize());

    const resumed = GameSimulation.deserialize(authority.serialize(), { systems: [movementSystem] });
    authority.updateGame({ p1: { moveX: 1 } });
    resumed.updateGame({ p1: { moveX: 1 } });
    expect(resumed.serialize()).toBe(authority.serialize());
  });

  test('OfflineTransport exercises the common asynchronous message contract', async () => {
    const queued = [];
    const transport = new OfflineTransport({ schedule: callback => queued.push(callback) });
    const received = [];
    transport.onMessage((peerId, message, delivery) => received.push({ peerId, message, delivery }));
    await transport.createSession();

    transport.broadcast(
      { protocolVersion: 1, type: 'PLAYER_INPUT', sequence: 1, tick: 0, payload: {} },
      { reliability: 'unreliable', channel: 'simulation', replaceable: true },
    );
    expect(received).toEqual([]);
    queued.shift()();
    expect(received).toEqual([{
      peerId: 'offline-player',
      message: { protocolVersion: 1, type: 'PLAYER_INPUT', sequence: 1, tick: 0, payload: {} },
      delivery: { reliability: 'unreliable', channel: 'simulation', replaceable: true },
    }]);
  });

  test('OfflineGameSession owns a local serializable authority without network services', async () => {
    const session = new OfflineGameSession();
    await session.initialize();
    session.beginRun({ matchSeed: 'offline-seed', floorSeed: 'offline-floor', floorNumber: 2 });
    session.advance({});

    expect(session.mode).toBe('single-player');
    expect(session.authority).toBe('local');
    expect(session.transport).toBeInstanceOf(OfflineTransport);
    expect(session.snapshot()).toEqual(expect.objectContaining({
      matchId: 'offline-session',
      matchSeed: 'offline-seed',
      floorSeed: 'offline-floor',
      floorNumber: 2,
      status: 'running',
      tick: 1,
    }));
    await session.dispose();
  });
});
