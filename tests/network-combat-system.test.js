const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { RandomService } = require('../js/simulation/RandomService');
const { createNetworkFloorState, TEST_ROOM } = require('../js/multiplayer/LocalMultiplayerSession');
const {
  ATTACK_COOLDOWN_TICKS,
  createNetworkCombatSystem,
  ensureNetworkEncounter,
  isNetworkRoomLocked,
} = require('../js/simulation/NetworkCombatSystem');

function combatHarness() {
  const state = new GameState({
    matchId: 'combat-test',
    matchSeed: 'combat-test-seed',
    floorSeed: 'combat-test-floor',
    status: 'running',
    floorState: createNetworkFloorState({ matchSeed: 'combat-test-seed', floorSeed: 'combat-test-floor' }),
    players: {
      p1: {
        id: 'p1', roomId: 'room-4-4', x: 300, y: 350, radius: 18, moveSpeed: 180,
        maxHealth: 100, health: 100, gold: 0, action: 'idle', attackCooldownUntilTick: 0,
      },
    },
  });
  state.players.p1.roomId = state.floorState.currentRoomId;
  const random = new RandomService({ matchSeed: state.matchSeed });
  const events = [];
  const system = createNetworkCombatSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) });
  const simulation = new GameSimulation({ state, randomService: random, systems: [system] });
  return { state, random, events, simulation };
}

describe('authoritative network combat system', () => {
  test('creates the same seeded encounter independently of client presentation', () => {
    const first = combatHarness();
    const second = combatHarness();
    ensureNetworkEncounter(first.state, first.random);
    ensureNetworkEncounter(second.state, second.random);

    const firstEnemy = Object.values(first.state.enemies)[0];
    const secondEnemy = Object.values(second.state.enemies)[0];
    expect(firstEnemy).toEqual(secondEnemy);
    expect(first.state.floorState.encounters[first.state.floorState.currentRoomId]).toEqual(
      expect.objectContaining({ status: 'active', enemyIds: [firstEnemy.id] }),
    );
    expect(isNetworkRoomLocked(first.state)).toBe(true);
  });

  test('owns projectile hits, death, room clear, a single drop, and pickup currency', () => {
    const { state, simulation, events } = combatHarness();
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = 500;
    enemy.y = 350;
    enemy.moveSpeed = 0;

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    for (let tick = 0; tick < ATTACK_COOLDOWN_TICKS + 1; tick += 1) simulation.updateGame({}, 0.05);
    expect(enemy.health).toBe(30);

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    for (let tick = 0; tick < 12; tick += 1) simulation.updateGame({}, 0.05);

    expect(enemy.dead).toBe(true);
    expect(isNetworkRoomLocked(state)).toBe(false);
    expect(Object.values(state.pickups)).toHaveLength(1);
    expect(events.filter(event => event.eventType === 'ENEMY_DEFEATED')).toHaveLength(1);
    expect(events.filter(event => event.eventType === 'PICKUP_SPAWNED')).toHaveLength(1);
    expect(events.filter(event => event.eventType === 'ROOM_CLEARED')).toHaveLength(1);

    const pickup = Object.values(state.pickups)[0];
    state.players.p1.x = pickup.x;
    state.players.p1.y = pickup.y;
    simulation.updateGame({}, 0.05);
    expect(state.players.p1.gold).toBe(1);
    expect(Object.values(state.pickups)).toHaveLength(0);
    expect(events.filter(event => event.eventType === 'PICKUP_COLLECTED')).toHaveLength(1);
  });

  test('keeps authoritative combat state serializable', () => {
    const { state, simulation } = combatHarness();
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: Math.PI / 4 }] } }, 0.05);
    const parsed = JSON.parse(simulation.serialize());
    expect(parsed.enemies).toEqual(state.enemies);
    expect(parsed.projectiles).toEqual(state.projectiles);
    expect(parsed.floorState.width).toBe(TEST_ROOM.width);
  });
});
