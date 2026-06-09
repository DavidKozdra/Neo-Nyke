const fs = require('node:fs');
const path = require('node:path');

function loadBeamReflectionFunctions(Neo) {
  const source = fs.readFileSync(path.join(__dirname, '../js/core/math-utils.js'), 'utf8');
  const start = source.indexOf('let beamReflectRectsCache = null;');
  const end = source.indexOf('const BEAM_PATH_CACHE_SIZE = 128;');
  if (start < 0 || end < 0) throw new Error('Could not isolate beam reflection helpers');
  const block = source.slice(start, end).replaceAll('export function', 'function');
  const getClosedDoorBlockerRects = () => [];
  const getDestructibleRect = prop => ({
    x: prop.x - prop.w / 2,
    y: prop.y - prop.h / 2,
    w: prop.w,
    h: prop.h,
  });
  return new Function(
    'Neo',
    'getClosedDoorBlockerRects',
    'getDestructibleRect',
    `${block}; return { getBeamReflectRects, invalidateBeamReflectGeometry, findBeamRicochetHit };`,
  )(Neo, getClosedDoorBlockerRects, getDestructibleRect);
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('beam reflection spatial lookup', () => {
  function createNeo() {
    return {
      BEAM_RICOCHET_EPSILON: 1e-6,
      currentRoom: null,
      walls: [],
      structures: [],
      destructibles: [],
    };
  }

  test('matches brute-force nearest hits across randomized rays', () => {
    const Neo = createNeo();
    const reflection = loadBeamReflectionFunctions(Neo);
    const random = createRandom(123456789);
    for (let index = 0; index < 80; index += 1) {
      Neo.walls.push({
        x: random() * 900,
        y: random() * 700,
        w: 8 + random() * 90,
        h: 8 + random() * 90,
      });
    }

    const indexedRects = reflection.getBeamReflectRects();
    const bruteForceRects = [...indexedRects];
    for (let index = 0; index < 1000; index += 1) {
      const angle = random() * Math.PI * 2;
      const args = [
        random() * 900,
        random() * 700,
        Math.cos(angle),
        Math.sin(angle),
        20 + random() * 700,
      ];
      const indexedHit = reflection.findBeamRicochetHit(...args, indexedRects);
      const bruteForceHit = reflection.findBeamRicochetHit(...args, bruteForceRects);
      if (!indexedHit || !bruteForceHit) {
        expect(indexedHit).toBe(bruteForceHit);
      } else {
        expect(indexedHit.distance).toBeCloseTo(bruteForceHit.distance, 8);
      }
    }
  });

  test('reuses static geometry until explicitly invalidated', () => {
    const Neo = createNeo();
    Neo.walls.push({ x: 100, y: 100, w: 40, h: 40 });
    const reflection = loadBeamReflectionFunctions(Neo);

    const first = reflection.getBeamReflectRects();
    const second = reflection.getBeamReflectRects();
    expect(second).toBe(first);

    reflection.invalidateBeamReflectGeometry();
    const rebuilt = reflection.getBeamReflectRects();
    expect(rebuilt).not.toBe(first);
    expect(rebuilt).toEqual(first);
  });
});
