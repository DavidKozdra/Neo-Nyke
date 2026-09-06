const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { createNetworkFloorState, createPlayerMovementSystem, TEST_ROOM, getCurrentNetworkRoom, getAdjacentNetworkRoom } = require('../js/multiplayer/LocalMultiplayerSession');

function offsetTransitions(offsetFromCenter) {
  const floorState = createNetworkFloorState({ matchSeed:'s', floorSeed:'s|floor:1', floorNumber:1 });
  const startId = floorState.currentRoomId;
  const room = floorState.layout.rooms.find(candidate => candidate.id === startId);
  const direction = ['w', 'e', 'n', 's'].find(key => room.doors[key]);
  const position = {
    x: direction === 'w' ? 80 : direction === 'e' ? TEST_ROOM.width - 80 : TEST_ROOM.width / 2 + offsetFromCenter,
    y: direction === 'n' ? 80 : direction === 's' ? TEST_ROOM.height - 80 : TEST_ROOM.height / 2 + offsetFromCenter,
  };
  const movement = {
    moveX: direction === 'w' ? -1 : direction === 'e' ? 1 : 0,
    moveY: direction === 'n' ? -1 : direction === 's' ? 1 : 0,
  };
  const state = new GameState({ status:'running', floorState,
    players: { p1: { id:'p1', roomId:startId, ...position, radius:18, moveSpeed:180 } } });
  const sim = new GameSimulation({ state, systems: [createPlayerMovementSystem(TEST_ROOM)] });
  for (let i=0;i<120;i++){ sim.updateGame({ p1:{ ...movement, aimDirection:0 } }, 1/20); if (state.players.p1.roomId!==startId) return true; }
  return false;
}

test('door travel uses the same body clearance as single player', () => {
  expect(offsetTransitions(0)).toBe(true);
  expect(offsetTransitions(50)).toBe(true);
  expect(offsetTransitions(-50)).toBe(true);
  // The whole 18px-radius body must clear the 140px opening.
  expect(offsetTransitions(55)).toBe(false);
  expect(offsetTransitions(-60)).toBe(false);
  expect(offsetTransitions(200)).toBe(false);
});
