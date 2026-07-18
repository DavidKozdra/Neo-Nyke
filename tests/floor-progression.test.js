const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { RandomService } = require('../js/simulation/RandomService');
const { createNetworkFloorState } = require('../js/multiplayer/LocalMultiplayerSession');
const {
  createFloorProgressionSystem,
  advanceToNextFloor,
  MAX_FLOOR,
} = require('../js/simulation/NetworkCombatSystem');

// Build a running match parked in its exit room with the encounter already
// cleared, so the stairs are eligible to spawn on the next tick.
function progressionHarness({ floorNumber = 1, players } = {}) {
  const floorState = createNetworkFloorState({ matchSeed: 'prog-seed', floorSeed: `prog-seed|floor:${floorNumber}`, floorNumber });
  const exitRoomId = floorState.layout.exitRoomId;
  floorState.currentRoomId = exitRoomId;
  // Mark the exit-room encounter as already cleared.
  floorState.encounters = { [exitRoomId]: { roomId: exitRoomId, status: 'cleared', enemyIds: [], clearedTick: 0 } };
  const state = new GameState({
    matchId: 'prog-test',
    matchSeed: 'prog-seed',
    floorSeed: `prog-seed|floor:${floorNumber}`,
    floorNumber,
    status: 'running',
    floorState,
    players: players || {
      p1: { id: 'p1', characterKey: 'thorn_knight', roomId: exitRoomId, x: floorState.width / 2, y: floorState.height / 2, radius: 18, moveSpeed: 180, maxHealth: 100, health: 100, downed: false },
    },
  });
  const random = new RandomService({ matchSeed: state.matchSeed });
  const events = [];
  const system = createFloorProgressionSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) });
  const simulation = new GameSimulation({ state, randomService: random, systems: [system] });
  return { state, simulation, events, exitRoomId };
}

function stepMany(simulation, ticks) {
  for (let i = 0; i < ticks; i += 1) simulation.updateGame({}, 1 / 20);
}

describe('floor progression, run end, and revive', () => {
  test('spawns stairs once the exit room is cleared', () => {
    const { simulation, events, exitRoomId } = progressionHarness();
    simulation.updateGame({}, 1 / 20);
    const stairs = Object.values(simulation.state.interactables).find(i => i.kind === 'stairs');
    expect(stairs).toBeTruthy();
    expect(stairs.roomId).toBe(exitRoomId);
    expect(stairs.final).toBe(false);
    expect(events.some(e => e.eventType === 'INTERACTABLE_SPAWNED')).toBe(true);
  });

  test('a player dwelling on the stairs advances to the next floor', () => {
    const { state, simulation, events } = progressionHarness({ floorNumber: 1 });
    stepMany(simulation, 60); // spawn stairs + fill the dwell timer
    expect(state.floorNumber).toBe(2);
    expect(Object.keys(state.interactables)).toHaveLength(0); // reset on new floor
    expect(Object.keys(state.enemies)).toHaveLength(0);
    expect(state.players.p1.roomId).toBe(state.floorState.layout.startRoomId);
    expect(events.some(e => e.eventType === 'FLOOR_ADVANCED' && e.data.floorNumber === 2)).toBe(true);
  });

  test('clearing the god floor ends the run in victory', () => {
    const { state, simulation, events } = progressionHarness({ floorNumber: MAX_FLOOR });
    stepMany(simulation, 60);
    expect(state.status).toBe('ended');
    const runEnd = events.find(e => e.eventType === 'RUN_ENDED');
    expect(runEnd?.data.result).toBe('victory');
    expect(state.floorNumber).toBe(MAX_FLOOR); // did not advance past the final floor
  });

  test('advanceToNextFloor is deterministic for a given match seed', () => {
    const a = progressionHarness({ floorNumber: 1 });
    const b = progressionHarness({ floorNumber: 1 });
    advanceToNextFloor(a.state, () => {});
    advanceToNextFloor(b.state, () => {});
    expect(a.state.floorState.layout.exitRoomId).toBe(b.state.floorState.layout.exitRoomId);
    expect(a.state.floorState.layout.rooms.length).toBe(b.state.floorState.layout.rooms.length);
  });

  test('a downed player is revived by an ally standing over them', () => {
    const floorState = createNetworkFloorState({ matchSeed: 'prog-seed', floorSeed: 'prog-seed|floor:1', floorNumber: 1 });
    const room = floorState.startRoomId;
    floorState.currentRoomId = room;
    const state = new GameState({
      matchId: 'revive-test', matchSeed: 'prog-seed', status: 'running', floorState,
      players: {
        alive: { id: 'alive', characterKey: 'thorn_knight', roomId: room, x: 300, y: 300, radius: 18, maxHealth: 100, health: 100, downed: false },
        down: { id: 'down', characterKey: 'metao', roomId: room, x: 315, y: 300, radius: 18, maxHealth: 100, health: 0, downed: true },
      },
    });
    const events = [];
    const system = createFloorProgressionSystem({ emitEvent: (t, d) => events.push({ eventType: t, data: d }) });
    const simulation = new GameSimulation({ state, systems: [system] });
    stepMany(simulation, 45);
    expect(state.players.down.downed).toBe(false);
    expect(state.players.down.health).toBeGreaterThan(0);
    expect(events.some(e => e.eventType === 'PLAYER_REVIVED' && e.data.playerId === 'down')).toBe(true);
  });

  test('a full party wipe ends the run in defeat', () => {
    const floorState = createNetworkFloorState({ matchSeed: 'prog-seed', floorSeed: 'prog-seed|floor:1', floorNumber: 1 });
    const room = floorState.startRoomId;
    floorState.currentRoomId = room;
    const state = new GameState({
      matchId: 'wipe-test', matchSeed: 'prog-seed', status: 'running', floorState,
      players: {
        p1: { id: 'p1', characterKey: 'thorn_knight', roomId: room, x: 300, y: 300, radius: 18, maxHealth: 100, health: 0, downed: true },
        p2: { id: 'p2', characterKey: 'metao', roomId: room, x: 600, y: 300, radius: 18, maxHealth: 100, health: 0, downed: true },
      },
    });
    const events = [];
    const system = createFloorProgressionSystem({ emitEvent: (t, d) => events.push({ eventType: t, data: d }) });
    const simulation = new GameSimulation({ state, systems: [system] });
    simulation.updateGame({}, 1 / 20);
    expect(state.status).toBe('ended');
    const runEnd = events.find(e => e.eventType === 'RUN_ENDED');
    expect(runEnd?.data.result).toBe('defeat');
    expect(runEnd?.data.reason).toBe('party-wiped');
  });
});
