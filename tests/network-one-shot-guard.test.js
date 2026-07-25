const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { RandomService } = require('../js/simulation/RandomService');
const { createNetworkCombatSystem } = require('../js/simulation/NetworkCombatSystem');
const { createNetworkFloorState } = require('../js/multiplayer/LocalMultiplayerSession');

// The campaign caps every hit at ~48% of max HP (62% for bosses) and refuses to
// take a player above 35% health straight to 0 (js/game/world.js damagePlayer).
// The authority had the cap machinery but defaulted it OFF and no caller ever
// passed it, so a single burst could delete a full-health player in multiplayer.
function harness(playerOverrides = {}) {
  const state = new GameState({
    matchId: 'one-shot-test',
    matchSeed: 'one-shot-seed',
    floorSeed: 'one-shot-floor',
    status: 'running',
    floorState: createNetworkFloorState({ matchSeed: 'one-shot-seed', floorSeed: 'one-shot-floor' }),
    players: {
      p1: {
        id: 'p1', characterKey: 'thorn_knight', roomId: 'room-4-4', x: 300, y: 350, radius: 18,
        moveSpeed: 180, maxHp: 100, hp: 100, coins: 0, action: 'idle', attackCooldownUntilTick: 0,
        ...playerOverrides,
      },
    },
  });
  state.players.p1.roomId = state.floorState.currentRoomId;
  const events = [];
  const system = createNetworkCombatSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) });
  const simulation = new GameSimulation({
    state,
    randomService: new RandomService({ matchSeed: state.matchSeed }),
    systems: [system],
  });
  return { state, events, simulation };
}

// Lands one hostile projectile of `damage` directly on the player.
function hitPlayerWith(state, simulation, damage, extra = {}) {
  const player = state.players.p1;
  const projectileId = state.allocateEntityId('projectile');
  state.projectiles[projectileId] = {
    id: projectileId,
    ownerId: extra.ownerId || 'enemy-hostile',
    roomId: player.roomId,
    hostile: true,
    type: 'test_round',
    attackKind: extra.attackKind || 'test_projectile',
    x: player.x, y: player.y, vx: 0, vy: 0,
    radius: 6, damage, knockback: 0,
    expiresTick: state.tick + 40,
  };
  simulation.updateGame({}, 0.05);
}

describe('multiplayer per-hit damage cap and one-shot guard', () => {
  test('a huge single hit cannot delete a full-health player', () => {
    const { state, simulation } = harness();
    hitPlayerWith(state, simulation, 100000);
    const player = state.players.p1;
    expect(player.hp).toBeGreaterThan(0);
    expect(player.downed).toBeFalsy();
    // Capped at 48% of a 100 HP pool.
    expect(player.hp).toBe(52);
  });

  test('the ordinary per-hit cap is 48% of max health', () => {
    const { state, simulation } = harness();
    hitPlayerWith(state, simulation, 90);
    expect(state.players.p1.hp).toBe(52);
  });

  test('a hit below the cap is applied in full and is not inflated', () => {
    const { state, simulation } = harness();
    hitPlayerWith(state, simulation, 17);
    expect(state.players.p1.hp).toBe(83);
  });

  test('above 35% health a hit wounds but never kills', () => {
    const { state, simulation } = harness({ hp: 40, maxHp: 100 });
    hitPlayerWith(state, simulation, 100000);
    // 40 HP is above the 35% floor, so the hit leaves exactly 1 HP.
    expect(state.players.p1.hp).toBe(1);
    expect(state.players.p1.downed).toBeFalsy();
  });

  test('at or below 35% health the guard lifts and a hit can still down a player', () => {
    const { state, simulation } = harness({ hp: 30, maxHp: 100 });
    hitPlayerWith(state, simulation, 100000);
    expect(state.players.p1.hp).toBe(0);
    expect(state.players.p1.downed).toBe(true);
  });

  test('the cap never falls below an 18-damage floor for low-max-HP players', () => {
    // 48% of 20 HP is 9.6, but the campaign floors the cap at 18 so chip damage
    // stays meaningful against small pools. Here the 18 floor lands before the
    // one-shot guard is needed: 20 - 18 = 2, still alive.
    const { state, simulation } = harness({ hp: 20, maxHp: 20 });
    hitPlayerWith(state, simulation, 100000);
    expect(state.players.p1.hp).toBe(2);
    expect(state.players.p1.downed).toBeFalsy();
  });

  test('damage-over-time ticks are also capped rather than bypassing the guard', () => {
    const { state, simulation } = harness({ hp: 90, maxHp: 100 });
    hitPlayerWith(state, simulation, 100000, { attackKind: 'bleed' });
    expect(state.players.p1.hp).toBeGreaterThan(0);
  });
});
