const fs = require('node:fs');
const path = require('node:path');

function loadClosedDoorBlockerFunction(Neo) {
  const source = fs.readFileSync(path.join(__dirname, '../js/core/math-utils.js'), 'utf8');
  const match = source.match(
    /export function getClosedDoorBlockerRects\(room = Neo\.currentRoom\) \{[\s\S]*?\n\}/,
  );
  if (!match) throw new Error('Could not find getClosedDoorBlockerRects');
  const functionSource = match[0].replace('export function', 'function');
  return new Function('Neo', `${functionSource}; return getClosedDoorBlockerRects;`)(Neo);
}

describe('room boundary collision geometry', () => {
  const Neo = {
    ROOM_W: 900,
    ROOM_H: 700,
    WALL: 28,
    DOOR: 140,
    currentRoom: null,
    isRoomLocked: () => false,
    hasRoomExit: (room, direction) => !!room.doors[direction],
  };
  const getClosedDoorBlockerRects = loadClosedDoorBlockerFunction(Neo);

  test('closed door spans share the same depth as the surrounding walls', () => {
    const blockers = getClosedDoorBlockerRects({ doors: {} });

    expect(blockers).toEqual([
      { x: 380, y: 0, w: 140, h: 28, door: 'n' },
      { x: 380, y: 672, w: 140, h: 28, door: 's' },
      { x: 0, y: 280, w: 28, h: 140, door: 'w' },
      { x: 872, y: 280, w: 28, h: 140, door: 'e' },
    ]);
  });

  test('open exits do not receive filler collision', () => {
    const blockers = getClosedDoorBlockerRects({
      doors: { n: true, s: true, w: true, e: true },
    });

    expect(blockers).toEqual([]);
  });
});
