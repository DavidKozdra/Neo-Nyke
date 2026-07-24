(function initWorldMapping3dLib(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWorldMapping3dApi() {
  'use strict';
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  // Default convention for top-down simulations: game (x,y) becomes 3D (x,z),
  // while 3D y is elevation. Hosts may supply a scale or origin offset.
  function worldToThree(point, options = {}) {
    const scale = number(options.scale, 1); const origin = options.origin || {};
    return { x: number(origin.x) + number(point?.x) * scale, y: number(options.height ?? point?.height), z: number(origin.z) + number(point?.y) * scale };
  }
  function threeToWorld(point, options = {}) {
    const scale = number(options.scale, 1) || 1; const origin = options.origin || {};
    return { x: (number(point?.x) - number(origin.x)) / scale, y: (number(point?.z) - number(origin.z)) / scale, height: number(point?.y) };
  }
  function canvasToNdc(x, y, width, height) { return { x: number(x) / Math.max(1, number(width, 1)) * 2 - 1, y: 1 - number(y) / Math.max(1, number(height, 1)) * 2 }; }
  function ndcToCanvas(x, y, viewport = {}) { return { x: number(viewport.x) + (number(x) * 0.5 + 0.5) * Math.max(1, number(viewport.width, 1)), y: number(viewport.y) + (-number(y) * 0.5 + 0.5) * Math.max(1, number(viewport.height, 1)) }; }
  function intersectRayWithGround(origin, direction, groundHeight = 0) {
    const dy = number(direction?.y); if (Math.abs(dy) < 1e-5) return null;
    const distance = (number(groundHeight) - number(origin?.y)) / dy;
    if (!(distance > 0) || !Number.isFinite(distance)) return null;
    return { x: number(origin?.x) + number(direction?.x) * distance, y: number(origin?.y) + dy * distance, z: number(origin?.z) + number(direction?.z) * distance, distance };
  }
  function splitViewport(canvasWidth, canvasHeight, slotIndex = 0, slotCount = 1) {
    const count = Math.max(1, Math.floor(number(slotCount, 1))); const index = Math.max(0, Math.floor(number(slotIndex)));
    const columns = count === 1 ? 1 : 2; const rows = count >= 3 ? 2 : 1;
    const width = number(canvasWidth) / columns, height = number(canvasHeight) / rows;
    return { x: (index % columns) * width, y: Math.floor(index / columns) * height, width, height };
  }
  return { worldToThree, threeToWorld, canvasToNdc, ndcToCanvas, intersectRayWithGround, splitViewport };
});
