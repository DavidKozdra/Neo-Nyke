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
  const columns = Math.floor(image.naturalWidth / frameWidth);
  ctx.drawImage(
    image,
    (frameIndex % columns) * frameWidth,
    Math.floor(frameIndex / columns) * frameHeight,
    frameWidth,
    frameHeight,
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
  test.each([
    ['thorn_knight', 'assets/sprites/chars/Thorn Knight.png'],
    ['metao', 'assets/sprites/chars/Metao.png'],
    ['sarge', 'assets/sprites/chars/Sarge.png'],
  ])('%s exposes the complete row-major action atlas', async (key, src) => {
    const defs = extractCharacterSheetDefs();
    const def = defs[key];
    expect(def).toEqual(expect.objectContaining({
      src,
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 32,
      stepRate: 10,
      actionRate: 10,
      portraitFrame: 0,
      armFrame: 1,
      idleFrames: [2],
      walkFrames: [2, 3, 4, 5, 6, 7],
      dashFrames: [10, 11, 12, 13, 14, 15],
      smashFrames: [18, 19, 20, 21, 22, 23],
      beamFrames: [26, 27, 28, 29, 30, 31],
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    const columns = Math.floor(image.naturalWidth / def.frameWidth);
    const rows = Math.floor(image.naturalHeight / def.frameHeight);
    expect(columns * rows).toBe(def.frameCount);
    expect(columns).toBe(8);
    expect(rows).toBe(4);

    const animationFrames = [
      ...def.walkFrames,
      ...def.dashFrames,
      ...def.smashFrames,
      ...def.beamFrames,
    ];
    animationFrames.forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    });
  });

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
    const availableFrames = Math.floor(image.naturalWidth / def.frameWidth)
      * Math.floor(image.naturalHeight / def.frameHeight);
    expect(availableFrames).toBe(def.frameCount);
    expect(image.naturalHeight).toBe(def.frameHeight);

    expect(countOpaquePixels(image, def.portraitFrame, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    expect(countOpaquePixels(image, def.armFrame, def.frameWidth, def.frameHeight)).toBeGreaterThan(2);
  });
});
