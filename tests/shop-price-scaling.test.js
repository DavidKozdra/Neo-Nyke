const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName, dependencies = {}) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }

  const declaration = source.slice(start, end + 1);
  return new Function(...Object.keys(dependencies), `${declaration}; return ${functionName};`)(
    ...Object.values(dependencies),
  );
}

describe('shop price progression scaling', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');

  function getMultiplier(depth, elapsedSeconds) {
    const Neo = {
      gameElapsedTime: elapsedSeconds,
      SHOP_PRICE_SCALING: { floor: 0.03, minute: 0.02 },
    };
    return extractFunction(source, 'getShopProgressionPriceMultiplier', {
      Neo,
      getShopProgressionDepth: () => depth,
    })(depth, elapsedSeconds);
  }

  test('keeps floor one at the authored opening price', () => {
    expect(getMultiplier(1, 0)).toBeCloseTo(1);
  });

  test('raises prices with cumulative floor count across loop boundaries', () => {
    expect(getMultiplier(10, 0)).toBeCloseTo(1.27);
    expect(getMultiplier(11, 0)).toBeCloseTo(1.3);
  });

  test('raises prices with elapsed run time', () => {
    expect(getMultiplier(1, 600)).toBeCloseTo(1.2);
    expect(getMultiplier(10, 600)).toBeCloseTo(1.47);
  });

  test('applies progression scaling in the shared shop price function', () => {
    expect(source).toContain('const progressionMultiplier = getShopProgressionPriceMultiplier(progressionDepth)');
    expect(source).toContain('* progressionMultiplier');
  });
});
