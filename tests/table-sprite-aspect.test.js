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
  return new Function(
    ...Object.keys(dependencies),
    `${declaration}; return ${functionName};`,
  )(...Object.values(dependencies));
}

describe('authored table sprite rendering', () => {
  const environmentSource = fs.readFileSync(path.join(__dirname, '../js/draw/environment.js'), 'utf8');

  test('preserves the sprite aspect ratio over a wide collision footprint', () => {
    const drawImage = jest.fn();
    const authored = { naturalWidth: 24, naturalHeight: 24 };
    const Neo = {
      ctx: { drawImage, imageSmoothingEnabled: true },
      ENVIRONMENT_IMAGES: {
        table_0: { image: authored },
        table_1: { image: authored },
      },
    };
    const furnitureHitFlash = jest.fn();
    const drawWoodTable = extractFunction(environmentSource, 'drawWoodTable', { Neo, furnitureHitFlash });

    drawWoodTable({ x: 0, y: 0, w: 120, h: 30, hitFlash: 0 });

    expect(drawImage).toHaveBeenCalledWith(authored, -60, -60, 120, 120);
    expect(furnitureHitFlash).toHaveBeenCalledWith(expect.any(Object), 120, 120);
    expect(Neo.ctx.imageSmoothingEnabled).toBe(false);
  });
});
