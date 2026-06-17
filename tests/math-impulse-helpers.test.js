const fs = require('node:fs');
const path = require('node:path');

// Load a single named export from math-utils.js in isolation (no Neo wiring runs).
function loadMathFunction(functionName) {
  const source = fs.readFileSync(path.join(__dirname, '../js/core/math-utils.js'), 'utf8');
  const start = source.indexOf(`export function ${functionName}`);
  if (start < 0) throw new Error(`Could not find ${functionName}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  const declaration = source.slice(start, end + 1).replace('export function', 'function');
  return new Function(`${declaration}; return ${functionName};`)();
}

describe('applyImpulse', () => {
  const applyImpulse = loadMathFunction('applyImpulse');

  test('adds a directional velocity vector of the given magnitude', () => {
    const entity = { vx: 0, vy: 0 };
    applyImpulse(entity, 0, 10);
    expect(entity.vx).toBeCloseTo(10);
    expect(entity.vy).toBeCloseTo(0);

    applyImpulse(entity, Math.PI / 2, 4);
    expect(entity.vx).toBeCloseTo(10);
    expect(entity.vy).toBeCloseTo(4);
  });

  test('accumulates onto existing velocity', () => {
    const entity = { vx: 5, vy: -2 };
    applyImpulse(entity, Math.PI, 5); // points in -x
    expect(entity.vx).toBeCloseTo(0);
    expect(entity.vy).toBeCloseTo(-2);
  });

  test('is a no-op for non-finite angle/magnitude or missing entity', () => {
    const entity = { vx: 3, vy: 3 };
    applyImpulse(entity, NaN, 10);
    applyImpulse(entity, 0, NaN);
    expect(entity.vx).toBe(3);
    expect(entity.vy).toBe(3);
    expect(() => applyImpulse(null, 0, 10)).not.toThrow();
  });
});

describe('shieldRingRadius', () => {
  const shieldRingRadius = loadMathFunction('shieldRingRadius');

  test('scales with sqrt of shield and is capped at 150', () => {
    expect(shieldRingRadius(0)).toBeCloseTo(58);
    expect(shieldRingRadius(100)).toBeCloseTo(58 + 10 * 3); // sqrt(100)=10 -> 88
    expect(shieldRingRadius(1_000_000)).toBe(150); // capped
  });

  test('treats negative or invalid shield as zero (no NaN)', () => {
    expect(shieldRingRadius(-5)).toBeCloseTo(58);
    expect(shieldRingRadius(undefined)).toBeCloseTo(58);
  });
});
