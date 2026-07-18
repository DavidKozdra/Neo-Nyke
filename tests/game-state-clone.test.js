const { cloneSerializable, GameState } = require('../js/simulation/GameState');

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
