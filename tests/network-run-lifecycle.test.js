const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { RandomService } = require('../js/simulation/RandomService');
const { createNetworkFloorState } = require('../js/multiplayer/LocalMultiplayerSession');
const {
  STAIRS_DWELL_TICKS,
  RIVAL_RESPAWN_TICKS,
  applyNetworkHeroProfile,
  createNetworkCombatSystem,
  createFloorProgressionSystem,
} = require('../js/simulation/NetworkCombatSystem');

function player(id, roomId, x = 450, y = 350) {
  const result = {
    id, roomId, x, y, radius: 18, maxHealth: 100, health: 100,
    moveSpeed: 180, gold: 0, level: 1, xp: 0, xpToNext: 20,
    attackCooldownUntilTick: 0, action: 'idle',
  };
  applyNetworkHeroProfile(result, id === 'p1' ? 'princess' : 'thorn_knight');
  return result;
}

function stateFor(mode = 'coop') {
  const floorState = createNetworkFloorState({ matchSeed: 'run', floorSeed: 'run|floor:1', floorNumber: 1 });
  return new GameState({
    matchId: 'run', matchSeed: 'run', floorSeed: 'run|floor:1', status: 'running',
    matchRules: { mode }, floorState,
    players: {
      p1: player('p1', floorState.currentRoomId),
      p2: player('p2', floorState.currentRoomId, 600, 350),
    },
  });
}

describe('networked run lifecycle', () => {
  test('co-op requires every active hero at the cleared exit before changing floors', () => {
    const state = stateFor('coop');
    const exitRoom = state.floorState.layout.rooms.find(room => room.id === state.floorState.layout.exitRoomId);
    state.floorState.encounters = { [exitRoom.id]: { roomId: exitRoom.id, status: 'cleared', enemyIds: [] } };
    state.players.p1.roomId = exitRoom.id;
    state.players.p2.roomId = exitRoom.id;
    state.players.p1.x = state.players.p1.y = 350;
    state.players.p1.x = 450;
    state.players.p2.x = 700;
    const events = [];
    const simulation = new GameSimulation({
      state,
      systems: [createFloorProgressionSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) })],
    });

    for (let tick = 0; tick < STAIRS_DWELL_TICKS + 5; tick += 1) simulation.updateGame({}, 0.05);
    expect(state.floorNumber).toBe(1);
    const stairs = Object.values(state.interactables).find(item => item.kind === 'stairs');
    expect(stairs).toEqual(expect.objectContaining({ requiredPlayers: 2, readyPlayers: 1 }));

    state.players.p2.x = 450;
    state.players.p2.y = 350;
    for (let tick = 0; tick < STAIRS_DWELL_TICKS; tick += 1) simulation.updateGame({}, 0.05);
    expect(state.floorNumber).toBe(2);
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'FLOOR_ADVANCED' }));
    expect(new Set(Object.values(state.players).map(entry => entry.roomId))).toEqual(new Set([state.floorState.layout.startRoomId]));
  });

  test('rival projectiles are authority-owned and downed rivals respawn', () => {
    const state = stateFor('rival');
    state.players.p1.x = 300;
    state.players.p2.x = 380;
    state.players.p2.health = 20;
    const events = [];
    const simulation = new GameSimulation({
      state,
      randomService: new RandomService({ matchSeed: state.matchSeed }),
      systems: [
        createNetworkCombatSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) }),
        createFloorProgressionSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) }),
      ],
    });

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(state.players.p2.downed).toBe(true);
    expect(state.players.p1.playerKills).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'PLAYER_DOWNED' }));

    for (let tick = 0; tick < RIVAL_RESPAWN_TICKS; tick += 1) simulation.updateGame({}, 0.05);
    expect(state.players.p2.downed).toBe(false);
    expect(state.players.p2.health).toBeGreaterThan(0);
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'PLAYER_RESPAWNED' }));
  });

  test('Rival Expedition records the first final-floor finisher as winner', () => {
    const state = stateFor('rival');
    state.floorNumber = 10;
    const exitRoom = state.floorState.layout.rooms.find(room => room.id === state.floorState.layout.exitRoomId);
    state.floorState.encounters = { [exitRoom.id]: { roomId: exitRoom.id, status: 'cleared', enemyIds: [] } };
    state.players.p1.roomId = exitRoom.id;
    state.players.p1.x = 450;
    state.players.p1.y = 350;
    const events = [];
    const simulation = new GameSimulation({
      state,
      systems: [createFloorProgressionSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) })],
    });
    for (let tick = 0; tick < STAIRS_DWELL_TICKS; tick += 1) simulation.updateGame({}, 0.05);
    expect(state.status).toBe('ended');
    expect(state.runStats.winnerPlayerId).toBe('p1');
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'RUN_ENDED',
      data: expect.objectContaining({ reason: 'rival-first-finish', winnerPlayerId: 'p1' }),
    }));
  });

  test('enemy XP is shared with teammates fighting in the same room', () => {
    const state = stateFor('coop');
    state.players.p1.characterKey = 'thorn_knight';
    applyNetworkHeroProfile(state.players.p1, 'thorn_knight');
    const events = [];
    const simulation = new GameSimulation({
      state,
      randomService: new RandomService({ matchSeed: state.matchSeed }),
      systems: [createNetworkCombatSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) })],
    });
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = state.players.p1.x + 60;
    enemy.y = state.players.p1.y;
    enemy.health = 1;
    enemy.moveSpeed = 0;
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    expect(state.players.p1.xp).toBeGreaterThan(0);
    expect(state.players.p2.xp).toBe(state.players.p1.xp);
    expect(state.runStats.killsByPlayer.p1).toBe(1);
    expect(events.filter(event => event.eventType === 'XP_AWARDED')).toHaveLength(2);
  });

  test('treasure chests open on touch, offer seeded choices, and can only be claimed once', () => {
    const state = stateFor('coop');
    const treasure = state.floorState.layout.rooms.find(room => room.type === 'treasure');
    state.players.p1.roomId = treasure.id;
    state.players.p2.roomId = treasure.id;
    state.players.p1.x = state.players.p2.x = 450;
    state.players.p1.y = state.players.p2.y = 350;
    const events = [];
    const simulation = new GameSimulation({
      state,
      randomService: new RandomService({ matchSeed: state.matchSeed }),
      systems: [createNetworkCombatSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) })],
    });
    simulation.updateGame({}, 0.05);
    const chest = Object.values(state.interactables).find(item => item.kind === 'relic_chest');
    expect(chest.optionIds).toHaveLength(2);

    state.players.p1.x = chest.x;
    state.players.p1.y = chest.y;
    simulation.updateGame({}, 0.05);
    expect(state.players.p1.pendingUpgrade.optionIds).toEqual(chest.optionIds);
    expect(chest.activated).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'CHEST_OPENED' }));
    const optionId = chest.optionIds[0];
    simulation.updateGame({ p1: { actions: [{
      action: 'UPGRADE', selectionEventId: chest.id, optionId,
    }] } }, 0.05);
    expect(state.players.p1.relics).toEqual([optionId]);
    expect(chest).toEqual(expect.objectContaining({ opened: true, claimedBy: 'p1' }));

    simulation.updateGame({ p2: { actions: [{ action: 'INTERACT', targetEntityId: chest.id }] } }, 0.05);
    expect(state.players.p2.pendingUpgrade).toBeUndefined();
    expect(events.filter(event => event.eventType === 'UPGRADE_APPLIED')).toHaveLength(1);

    const remainingChests = Object.values(state.interactables)
      .filter(item => item.kind === 'relic_chest' && !item.opened);
    remainingChests.forEach(nextChest => {
      state.players.p1.x = nextChest.x;
      state.players.p1.y = nextChest.y;
      simulation.updateGame({}, 0.05);
      simulation.updateGame({ p1: { actions: [{
        action: 'UPGRADE', selectionEventId: nextChest.id, optionId: nextChest.optionIds[0],
      }] } }, 0.05);
    });
    expect(state.floorState.rewards[treasure.id].status).toBe('claimed');
  });
});
