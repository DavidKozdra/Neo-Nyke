const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { RandomService } = require('../js/simulation/RandomService');
const { createNetworkFloorState } = require('../js/multiplayer/LocalMultiplayerSession');
const { applyNetworkHeroProfile, createNetworkCombatSystem } = require('../js/simulation/NetworkCombatSystem');
const { applySpecialRoomChoice } = require('../js/simulation/SharedSpecialRoomSystem');

// The authority created a bounty contract (SharedSpecialRoomSystem sets
// targetSpawned: false) but nothing ever fielded the marked elite, so a
// multiplayer bounty could never be completed — and blocked accepting another.
function bountyHarness() {
  const floorState = createNetworkFloorState({ matchSeed: 'bounty-seed', floorSeed: 'bounty-floor' });
  const state = new GameState({
    matchId: 'bounty-test',
    matchSeed: 'bounty-seed',
    floorSeed: 'bounty-floor',
    status: 'running',
    floorState,
    players: {
      p1: {
        id: 'p1', characterKey: 'thorn_knight', roomId: floorState.currentRoomId,
        x: 450, y: 350, radius: 18, moveSpeed: 228,
        maxHp: 1000, hp: 1000, coins: 0, xp: 0, action: 'idle', attackCooldownUntilTick: 0,
      },
    },
  });
  applyNetworkHeroProfile(state.players.p1, 'thorn_knight');
  state.players.p1.maxHp = 1000;
  state.players.p1.hp = 1000;
  const events = [];
  const system = createNetworkCombatSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) });
  const simulation = new GameSimulation({
    state,
    randomService: new RandomService({ matchSeed: state.matchSeed }),
    systems: [system],
  });
  const combatRoom = floorState.layout.rooms.find(room => room.type === 'combat');
  return { state, events, simulation, combatRoom };
}

function acceptBounty(state, kind = 'elite_hunter') {
  const room = { id: 'bounty-room', gx: 9, gy: 9, type: 'bounty', serviceUsed: false };
  const random = new RandomService({ matchSeed: 'bounty-choice' }).stream('choice');
  const player = state.players.p1;
  player.items = player.items || {};
  const result = applySpecialRoomChoice(state, room, player, kind, random);
  expect(result.ok).toBe(true);
  return player.activeBounty;
}

function enterCombatRoom(state, simulation, combatRoom) {
  state.players.p1.roomId = combatRoom.id;
  state.floorState.currentRoomId = combatRoom.id;
  simulation.updateGame({}, 0.05);
}

const bountyTargets = state => Object.values(state.enemies).filter(enemy => enemy.bountyTarget);

describe('multiplayer bounty targets', () => {
  test('accepting a bounty leaves it unspawned until a combat room is reached', () => {
    const { state } = bountyHarness();
    const bounty = acceptBounty(state);
    expect(bounty.targetSpawned).toBe(false);
    expect(bountyTargets(state)).toHaveLength(0);
  });

  test('the marked elite is fielded in the contract holder\'s combat room', () => {
    const { state, simulation, combatRoom, events } = bountyHarness();
    const bounty = acceptBounty(state, 'elite_hunter');
    enterCombatRoom(state, simulation, combatRoom);

    const targets = bountyTargets(state);
    expect(targets).toHaveLength(1);
    const [target] = targets;
    expect(target.type).toBe('hunter');
    expect(target.elite).toBe(true);
    expect(target.roomId).toBe(combatRoom.id);
    expect(target.bountyTargetId).toBe(bounty.targetId);
    expect(target.bountyOwnerId).toBe('p1');
    expect(bounty.targetSpawned).toBe(true);
    expect(events.some(event => event.eventType === 'ENEMY_SPAWNED' && event.data.bountyTarget)).toBe(true);
  });

  test('each contract kind fields its authored enemy type', () => {
    const cases = { elite_hunter: 'hunter', elite_charger: 'charger', elite_sniper: 'sniper' };
    Object.entries(cases).forEach(([kind, enemyType]) => {
      const { state, simulation, combatRoom } = bountyHarness();
      acceptBounty(state, kind);
      enterCombatRoom(state, simulation, combatRoom);
      expect(bountyTargets(state)[0].type).toBe(enemyType);
    });
  });

  test('the target is only spawned once no matter how many ticks run', () => {
    const { state, simulation, combatRoom } = bountyHarness();
    acceptBounty(state);
    enterCombatRoom(state, simulation, combatRoom);
    for (let step = 0; step < 20; step += 1) simulation.updateGame({}, 0.05);
    expect(bountyTargets(state)).toHaveLength(1);
  });

  test('escaped contracts come back tougher', () => {
    const plain = bountyHarness();
    acceptBounty(plain.state);
    enterCombatRoom(plain.state, plain.simulation, plain.combatRoom);
    const baseline = bountyTargets(plain.state)[0].maxHealth;

    const escaped = bountyHarness();
    const bounty = acceptBounty(escaped.state);
    bounty.escapes = 2;
    enterCombatRoom(escaped.state, escaped.simulation, escaped.combatRoom);
    expect(bountyTargets(escaped.state)[0].maxHealth).toBeGreaterThan(baseline);
  });

  test('killing the marked elite completes the contract and pays out', () => {
    const { state, simulation, combatRoom, events } = bountyHarness();
    acceptBounty(state, 'elite_hunter');
    enterCombatRoom(state, simulation, combatRoom);
    const target = bountyTargets(state)[0];
    const coinsBefore = state.players.p1.coins;

    target.health = 1;
    target.hp = 1;
    // Land a lethal player hit on the target.
    state.players.p1.x = target.x;
    state.players.p1.y = target.y;
    for (let step = 0; step < 12 && !target.dead; step += 1) {
      simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    }

    expect(target.dead).toBe(true);
    expect(state.players.p1.activeBounty).toBeNull();
    expect(state.players.p1.coins).toBeGreaterThan(coinsBefore);
    expect(state.players.p1.bountyTrophies).toBe(1);
    expect(events.some(event => event.eventType === 'BOUNTY_COMPLETED')).toBe(true);
  });

  test('a completed contract frees the player to accept another', () => {
    const { state, simulation, combatRoom } = bountyHarness();
    acceptBounty(state, 'elite_hunter');
    enterCombatRoom(state, simulation, combatRoom);
    const target = bountyTargets(state)[0];
    target.health = 1;
    target.hp = 1;
    state.players.p1.x = target.x;
    state.players.p1.y = target.y;
    for (let step = 0; step < 12 && !target.dead; step += 1) {
      simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    }
    expect(state.players.p1.activeBounty).toBeNull();
    // Previously this returned ACTIVE_BOUNTY forever, because the first
    // contract could never be resolved.
    expect(acceptBounty(state, 'elite_sniper')).toMatchObject({ kind: 'elite_sniper' });
  });
});
