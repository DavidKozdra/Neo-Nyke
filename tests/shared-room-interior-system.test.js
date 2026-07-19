const { decorateSharedRoomInterior } = require('../js/simulation/SharedRoomInteriorSystem');
const { createCampaignFloorState, createCampaignMovementSystem } = require('../js/simulation/CampaignSimulation');

describe('shared room interior system', () => {
  test('generates identical authoritative interiors for the same floor seed', () => {
    const first = createCampaignFloorState({ matchSeed: 'room-parity', floorNumber: 4 });
    const second = createCampaignFloorState({ matchSeed: 'room-parity', floorNumber: 4 });
    expect(second.layout.rooms).toEqual(first.layout.rooms);
    expect(first.layout.rooms.some(room => (room.structures?.length || 0) + (room.destructibles?.length || 0) > 0)).toBe(true);
  });

  test('stamps the canonical authored template and hazards into state', () => {
    const room = { id: 'combat-a', type: 'combat', doors: { n: true, s: true, e: false, w: false }, secretPassages: {} };
    decorateSharedRoomInterior(room, { floorSeed: 'interior-proof', floorNumber: 3 });
    expect(room.layoutArchetype).not.toBe('open');
    expect(room.layoutChambers.length).toBeGreaterThan(0);
    expect(room.decorations.length + room.structures.length + room.destructibles.length).toBeGreaterThan(0);
  });

  test('authority movement collides with room-state structures', () => {
    const player = { id: 'p1', x: 100, y: 100, vx: 0, vy: 0, radius: 18, moveSpeed: 180, roomId: 'room-a' };
    const state = {
      tick: 1,
      players: { p1: player },
      floorState: {
        width: 900, height: 700, wallThickness: 28, doorWidth: 140,
        layout: { rooms: [{ id: 'room-a', doors: {}, structures: [{ kind: 'pillar', x: 130, y: 100, w: 34, h: 34 }], destructibles: [] }] },
      },
    };
    createCampaignMovementSystem()({ state, inputs: { p1: { moveX: 1, moveY: 0 } }, fixedDelta: 0.1 });
    expect(player.x).toBe(100);
    expect(player.vx).toBe(0);
  });
});
