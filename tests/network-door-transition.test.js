const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { createNetworkFloorState, createPlayerMovementSystem, TEST_ROOM, getCurrentNetworkRoom, getAdjacentNetworkRoom } = require('../js/multiplayer/LocalMultiplayerSession');

// west door open on the start room (room-4-4 -> room-3-4 for this seed)
function offsetTransitions(offsetFromCenter) {
  const floorState = createNetworkFloorState({ matchSeed:'s', floorSeed:'s|floor:1', floorNumber:1 });
  const startId = floorState.currentRoomId;
  // Player near the west wall, offset vertically from door center by offsetFromCenter.
  const state = new GameState({ status:'running', floorState,
    players: { p1: { id:'p1', roomId:startId, x: 80, y: TEST_ROOM.height/2 + offsetFromCenter, radius:18, moveSpeed:180 } } });
  const sim = new GameSimulation({ state, systems: [createPlayerMovementSystem(TEST_ROOM)] });
  for (let i=0;i<120;i++){ sim.updateGame({ p1:{ moveX:-1, moveY:0, aimDirection:0 } }, 1/20); if (state.players.p1.roomId!==startId) return true; }
  return false;
}

test('player can transition from anywhere inside the visible door gap (±68px)', () => {
  // Visible gap is ±70 from center; check offsets that were in the old dead zone.
  expect(offsetTransitions(0)).toBe(true);
  expect(offsetTransitions(55)).toBe(true);   // was dead zone (52..70)
  expect(offsetTransitions(-60)).toBe(true);  // was dead zone
  // Well outside the door (near the corner) must NOT transition.
  expect(offsetTransitions(200)).toBe(false);
});
