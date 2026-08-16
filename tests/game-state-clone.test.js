const { cloneSerializable, GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { createNetworkCombatSystem } = require('../js/simulation/NetworkCombatSystem');
const { createNetworkFloorState } = require('../js/multiplayer/LocalMultiplayerSession');

describe('cloneSerializable', () => {
  test('clones legitimate shared references (diamonds) without throwing', () => {
    // The room-transition system stores the SAME transition object in both
    // floorState.roomTransition and floorState.transitionsByPlayer[id]. That is
    // a shared reference, not a cycle, and must clone fine.
    const shared = { sequence: 3, direction: 'e' };
    const floorState = { roomTransition: shared, transitionsByPlayer: { p1: shared } };
    const clone = cloneSerializable(floorState);
    expect(clone.roomTransition).toEqual(shared);
    expect(clone.transitionsByPlayer.p1).toEqual(shared);
    // The clone must be a deep copy (independent objects), even though the
    // source shared one reference.
    expect(clone.roomTransition).not.toBe(shared);
  });

  test('still rejects a true circular reference', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    expect(() => cloneSerializable(cyclic)).toThrow('Game state contains a circular reference');
  });

  test('still rejects non-serializable leaf values', () => {
    expect(() => cloneSerializable({ handler: () => 1 })).toThrow('Game state contains a non-serializable value');
  });

  test('snapshot() succeeds when floorState carries a shared transition object', () => {
    const shared = { sequence: 1, tick: 5, fromRoomId: 'a', toRoomId: 'b', direction: 'e' };
    const state = new GameState({
      status: 'running',
      floorState: { currentRoomId: 'b', roomTransition: shared, transitionsByPlayer: { p1: shared } },
    });
    expect(() => state.snapshot()).not.toThrow();
  });
});

describe('GameState rival beam struggles', () => {
  test('restores one shared record so both mash directions move the same progress value', () => {
    const floorState = createNetworkFloorState({
      matchSeed: 'beam-round-trip',
      floorSeed: 'beam-round-trip-floor',
    });
    const roomId = floorState.currentRoomId;
    const struggle = {
      playerId: 'p1',
      opponentPlayerId: 'p2',
      startTick: 0,
      endTick: 100,
      progress: 0.5,
      mashCount: 0,
      x: 380,
      y: 350,
    };
    const state = new GameState({
      matchId: 'beam-round-trip',
      matchSeed: 'beam-round-trip',
      floorSeed: 'beam-round-trip-floor',
      status: 'running',
      matchRules: { mode: 'rival' },
      floorState,
      players: {
        p1: {
          id: 'p1',
          characterKey: 'thorn_knight',
          roomId,
          x: 300,
          y: 350,
          radius: 18,
          moveSpeed: 180,
          maxHp: 100,
          hp: 100,
          beamChannel: {
            moveKey: 'blood_beam',
            angle: 0,
            untilTick: 100,
            heldSeen: true,
          },
        },
        p2: {
          id: 'p2',
          characterKey: 'thorn_knight',
          roomId,
          x: 460,
          y: 350,
          radius: 18,
          moveSpeed: 180,
          maxHp: 100,
          hp: 100,
          beamChannel: {
            moveKey: 'blood_beam',
            angle: Math.PI,
            untilTick: 100,
            heldSeen: true,
          },
        },
      },
      beamStruggles: { p1: struggle, p2: struggle },
    });

    expect(state.beamStruggles.p1).toBe(state.beamStruggles.p2);
    const snapshot = state.snapshot();
    expect(snapshot.beamStruggles.p1).toBe(snapshot.beamStruggles.p2);
    expect(snapshot.beamStruggles.p1).not.toBe(struggle);

    const restored = GameSimulation.deserialize(state.serialize(), {
      systems: [createNetworkCombatSystem()],
    });
    expect(restored.state.beamStruggles.p1).toBe(restored.state.beamStruggles.p2);

    restored.updateGame({
      p1: {
        buttons: 1,
        aimDirection: 0,
        actions: [{ action: 'BEAM_MASH', aimDirection: 0 }],
      },
      p2: { buttons: 1, aimDirection: Math.PI, actions: [] },
    }, 0.05);
    const progressAfterPlayerOne = restored.state.beamStruggles.p1.progress;
    expect(progressAfterPlayerOne).toBeGreaterThan(0.5);
    expect(restored.state.beamStruggles.p2.progress).toBe(progressAfterPlayerOne);

    restored.updateGame({
      p1: { buttons: 1, aimDirection: 0, actions: [] },
      p2: {
        buttons: 1,
        aimDirection: Math.PI,
        actions: [{ action: 'BEAM_MASH', aimDirection: Math.PI }],
      },
    }, 0.05);
    expect(restored.state.beamStruggles.p1).toBe(restored.state.beamStruggles.p2);
    expect(restored.state.beamStruggles.p1.progress).toBeLessThan(progressAfterPlayerOne);
    expect(restored.state.beamStruggles.p1.mashCount).toBe(2);
  });
});
