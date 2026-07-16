const fs = require('node:fs');
const path = require('node:path');

function loadStructureCollisionRect() {
  const source = fs.readFileSync(path.join(__dirname, '../js/core/math-utils.js'), 'utf8');
  const match = source.match(/export function getStructureCollisionRect\(structure\) \{[\s\S]*?\n\}/);
  if (!match) throw new Error('Could not find getStructureCollisionRect');
  return new Function(`${match[0].replace('export function', 'function')}; return getStructureCollisionRect;`)();
}

describe('pillar collision footprint', () => {
  const getStructureCollisionRect = loadStructureCollisionRect();
  const circleIntersectsRect = (cx, cy, radius, rect) => {
    const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    return (cx - nearestX) ** 2 + (cy - nearestY) ** 2 < radius ** 2;
  };

  test('only the shallow plinth at the ground line is solid', () => {
    const rect = getStructureCollisionRect({ kind: 'pillar', x: 100, y: 200, w: 40, h: 40, mids: 3 });
    expect(rect.x).toBe(80);
    expect(rect.y).toBeCloseTo(208.8);
    expect(rect.w).toBe(40);
    expect(rect.h).toBeCloseTo(11.2);
  });

  test('an actor can stand in front of or behind the base without a phantom collision', () => {
    const rect = getStructureCollisionRect({ kind: 'pillar', x: 100, y: 200, w: 40, h: 40, mids: 3 });
    expect(circleIntersectsRect(100, 238, 14, rect)).toBe(false);
    expect(circleIntersectsRect(100, 194, 14, rect)).toBe(false);
    expect(circleIntersectsRect(100, 214, 14, rect)).toBe(true);
  });

  test('shaft count does not move the collision footprint', () => {
    const short = getStructureCollisionRect({ kind: 'pillar', x: 100, y: 200, w: 40, h: 40, mids: 0 });
    const tall = getStructureCollisionRect({ kind: 'pillar', x: 100, y: 200, w: 40, h: 40, mids: 3 });
    expect(tall).toEqual(short);
  });

  test('non-pillar structures retain their full collision box', () => {
    expect(getStructureCollisionRect({ kind: 'forge', x: 100, y: 200, w: 40, h: 60 }))
      .toEqual({ x: 80, y: 170, w: 40, h: 60 });
  });
});
