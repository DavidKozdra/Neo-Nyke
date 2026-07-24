const mapping = require('../Koz_Engine_Lib/Rendering3D/worldMapping');

describe('Koz Engine 3D world mapping', () => {
  test('maps top-down coordinates, canvas coordinates, and floor rays', () => {
    expect(mapping.worldToThree({ x: 4, y: 9 }, { height: 3 })).toEqual({ x: 4, y: 3, z: 9 });
    expect(mapping.threeToWorld({ x: 4, y: 3, z: 9 })).toEqual({ x: 4, y: 9, height: 3 });
    expect(mapping.canvasToNdc(50, 25, 100, 100)).toEqual({ x: 0, y: 0.5 });
    expect(mapping.intersectRayWithGround({ x: 1, y: 10, z: 2 }, { x: 0.2, y: -1, z: 0.3 })).toEqual(expect.objectContaining({ x: 3, y: 0, z: 5, distance: 10 }));
  });
  test('creates consistent split-screen viewports', () => {
    expect(mapping.splitViewport(800, 600, 3, 4)).toEqual({ x: 400, y: 300, width: 400, height: 300 });
  });
});
