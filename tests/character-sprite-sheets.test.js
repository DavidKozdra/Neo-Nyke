const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('canvas');

function extractCharacterSheetDefs() {
  const source = fs.readFileSync(path.join(__dirname, '../js/draw/character-sheets.js'), 'utf8');
  const marker = 'const CHARACTER_SHEET_DEFS = ';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Missing CHARACTER_SHEET_DEFS');
  const objectStart = source.indexOf('{', start);
  let depth = 0;
  let end = objectStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  const objectLiteral = source.slice(objectStart, end + 1);
  return new Function(`return (${objectLiteral});`)();
}

function countOpaquePixels(image, frameIndex, frameWidth, frameHeight) {
  const canvas = createCanvas(frameWidth, frameHeight);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    image,
    frameIndex * frameWidth, 0, frameWidth, frameHeight,
    0, 0, frameWidth, frameHeight,
  );
  const data = ctx.getImageData(0, 0, frameWidth, frameHeight).data;
  let count = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 0) count += 1;
  }
  return count;
}

describe('character sprite sheet assets', () => {
  test('princess keeps dedicated portrait and arm frames before animation frames', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.princess;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/princess.png',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 8,
      portraitFrame: 0,
      armFrame: 1,
      idleFrames: [2, 3],
      walkFrames: [4, 5, 6, 7],
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    const availableFrames = Math.floor(image.naturalWidth / def.frameWidth);
    expect(availableFrames).toBe(def.frameCount);
    expect(image.naturalHeight).toBe(def.frameHeight);

    expect(countOpaquePixels(image, def.portraitFrame, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    expect(countOpaquePixels(image, def.armFrame, def.frameWidth, def.frameHeight)).toBeGreaterThan(2);
  });
});
