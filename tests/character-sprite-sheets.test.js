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

function countOpaquePixels(image, frameIndex, frameWidth, frameHeight, sourceOffsetX = 0, sourceOffsetY = 0) {
  const canvas = createCanvas(frameWidth, frameHeight);
  const ctx = canvas.getContext('2d');
  const columns = Math.floor((image.naturalWidth - sourceOffsetX) / frameWidth);
  ctx.drawImage(
    image,
    sourceOffsetX + (frameIndex % columns) * frameWidth,
    sourceOffsetY + Math.floor(frameIndex / columns) * frameHeight,
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

  test('mooggy v2 wires the authored walk, dash, jump, beam, and idle rows', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.mooggy;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/Mooggy.png',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 35,
      stepRate: 10,
      actionRate: 10,
      portraitFrame: 0,
      armFrame: 2,
      walkFrames: [3, 4, 5, 6],
      dashFrames: [10, 11, 12, 13],
      smashFrames: [17, 18, 19, 20],
      beamFrames: [24, 25, 26, 27],
      idleFrames: [31, 32, 33, 34],
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    const columns = Math.floor(image.naturalWidth / def.frameWidth);
    const rows = Math.floor(image.naturalHeight / def.frameHeight);
    expect(columns).toBe(7);
    expect(rows).toBe(5);
    expect(columns * rows).toBe(def.frameCount);

    [
      ...def.walkFrames,
      ...def.dashFrames,
      ...def.smashFrames,
      ...def.beamFrames,
      ...def.idleFrames,
    ].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    });
  });

  test('golem uses the authored mini-golem walk and attack strip', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.golem;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/mini-golem.png',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 10,
      idleFrames: [0],
      walkFrames: [0, 1, 2, 3, 4],
      attackFrames: [5, 6, 7, 8, 9],
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    const availableFrames = Math.floor(image.naturalWidth / def.frameWidth)
      * Math.floor(image.naturalHeight / def.frameHeight);
    expect(availableFrames).toBe(def.frameCount);
    [...def.walkFrames, ...def.attackFrames].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    });
  });
  test('shield unit uses the authored walk and shield-action strip', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.shield_unit;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/shield_unit.png',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 10,
      idleFrames: [0],
      walkFrames: [1, 2, 3, 4, 5, 6],
      attackFrames: [7, 8, 9],
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    const availableFrames = Math.floor(image.naturalWidth / def.frameWidth)
      * Math.floor(image.naturalHeight / def.frameHeight);
    expect(availableFrames).toBe(def.frameCount);
    [...def.idleFrames, ...def.walkFrames, ...def.attackFrames].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    });
  });
  test('machine gunner uses the authored walk and firing strip', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.machine_gunner;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/machine_gunner.png',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 10,
      idleFrames: [0],
      walkFrames: [1, 2, 3, 4, 5, 6],
      attackFrames: [7, 8, 9],
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    const availableFrames = Math.floor(image.naturalWidth / def.frameWidth)
      * Math.floor(image.naturalHeight / def.frameHeight);
    expect(availableFrames).toBe(def.frameCount);
    [...def.idleFrames, ...def.walkFrames, ...def.attackFrames].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    });
  });



  test('hunter enemy uses the authored walk and attack strip', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.hunter;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/hunter.png',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 8,
      idleFrames: [0],
      walkFrames: [1, 2, 3, 4],
      attackFrames: [5, 6, 7],
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    const availableFrames = Math.floor(image.naturalWidth / def.frameWidth)
      * Math.floor(image.naturalHeight / def.frameHeight);
    expect(availableFrames).toBe(def.frameCount);
    [...def.idleFrames, ...def.walkFrames, ...def.attackFrames].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    });
  });
  test('charger uses its wind-up and gallop strips', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.charger;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/charger.png',
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 12,
      idleFrames: [0],
      walkFrames: [7, 8, 9, 10, 11],
      attackFrames: [1, 2, 3, 4, 5, 6],
      dashFrames: [7, 8, 9, 10, 11],
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    const availableFrames = Math.floor(image.naturalWidth / def.frameWidth)
      * Math.floor(image.naturalHeight / def.frameHeight);
    expect(availableFrames).toBe(def.frameCount);
    [...def.idleFrames, ...def.walkFrames, ...def.attackFrames, ...def.dashFrames].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(100);
    });
  });

  test('cult follower uses the authored walk and attack rows', async () => {
    const key = 'cult_follower';
    const src = 'assets/sprites/chars/follower.png';
    const defs = extractCharacterSheetDefs();
    const def = defs[key];
    expect(def).toEqual(expect.objectContaining({
      src,
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 9,
      idleFrames: [0],
      walkFrames: [1, 2, 3, 4],
      attackFrames: [5, 6, 7, 8],
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    expect(Math.floor(image.naturalWidth / def.frameWidth)).toBe(5);
    expect(Math.floor(image.naturalHeight / def.frameHeight)).toBe(2);
    [...def.idleFrames, ...def.walkFrames, ...def.attackFrames].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    });
  });
  test('healer uses the authored walk and healing-action rows', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.healer;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/healer.png',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 9,
      idleFrames: [0],
      walkFrames: [1, 2, 3, 4],
      attackFrames: [5, 6, 7, 8],
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    expect(Math.floor(image.naturalWidth / def.frameWidth)).toBe(5);
    expect(Math.floor(image.naturalHeight / def.frameHeight)).toBe(2);
    [...def.idleFrames, ...def.walkFrames, ...def.attackFrames].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    });
  });



  test('sniper enemy uses the authored walk and attack strip', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.sniper;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/sniper.png',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 8,
      idleFrames: [0],
      walkFrames: [1, 2, 3, 4],
      attackFrames: [5, 6, 7],
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    const availableFrames = Math.floor(image.naturalWidth / def.frameWidth)
      * Math.floor(image.naturalHeight / def.frameHeight);
    expect(availableFrames).toBe(def.frameCount);
    [...def.idleFrames, ...def.walkFrames, ...def.attackFrames].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    });
  });

  test('knave crops its padded export into portrait, arm, idle, and walk frames', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.knave;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/knave.png',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 8,
      sourceOffsetY: 15,
      idleFrames: [2, 3],
      walkFrames: [4, 5, 6, 7],
      armFrame: 1,
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    const availableFrames = Math.floor((image.naturalWidth - (def.sourceOffsetX || 0)) / def.frameWidth)
      * Math.floor((image.naturalHeight - def.sourceOffsetY) / def.frameHeight);
    expect(availableFrames).toBe(def.frameCount);
    [def.portraitFrame, def.armFrame, ...def.idleFrames, ...def.walkFrames].forEach(frameIndex => {
      expect(countOpaquePixels(
        image,
        frameIndex,
        def.frameWidth,
        def.frameHeight,
        def.sourceOffsetX || 0,
        def.sourceOffsetY,
      )).toBeGreaterThan(15);
    });

    // The charged boss is the same character and must stay on the exact same
    // authored art/animation definition. Enemy radius controls its larger size.
    expect(defs.artificer_knave).toEqual(def);
  });

  test('cult mage uses the authored walk and attack rows', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.cult_mage;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/cultMage.png',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 9,
      idleFrames: [0],
      walkFrames: [0, 1, 2, 3, 4],
      attackFrames: [5, 6, 7, 8],
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    expect(Math.floor(image.naturalWidth / def.frameWidth)).toBe(5);
    expect(Math.floor(image.naturalHeight / def.frameHeight)).toBe(2);
    [...def.walkFrames, ...def.attackFrames].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    });
  });
  test('summoner uses the authored walk and summoning rows', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.summoner;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/summoner.png',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 9,
      idleFrames: [0],
      walkFrames: [1, 2, 3, 4],
      attackFrames: [5, 6, 7, 8],
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    expect(Math.floor(image.naturalWidth / def.frameWidth)).toBe(5);
    expect(Math.floor(image.naturalHeight / def.frameHeight)).toBe(2);
    [...def.idleFrames, ...def.walkFrames, ...def.attackFrames].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(20);
    });
  });


  test('bulk golem uses the authored large walk, punch, and smash strip', async () => {
    const defs = extractCharacterSheetDefs();
    const def = defs.bulk_golem;
    expect(def).toEqual(expect.objectContaining({
      src: 'assets/sprites/chars/large-golem.png',
      frameWidth: 128,
      frameHeight: 128,
      frameCount: 16,
      renderScale: 2,
      idleFrames: [0],
      walkFrames: [0, 1, 2],
      attackFrames: [3, 4, 5, 6, 7, 8, 9],
      smashFrames: [10, 11, 12, 13, 14, 15],
      portraitFrame: 0,
    }));

    const image = await loadImage(path.join(__dirname, '..', def.src));
    const availableFrames = Math.floor(image.naturalWidth / def.frameWidth)
      * Math.floor(image.naturalHeight / def.frameHeight);
    expect(availableFrames).toBe(def.frameCount);
    expect(image.naturalWidth).toBe(2048);
    expect(image.naturalHeight).toBe(128);
    [...def.walkFrames, ...def.attackFrames, ...def.smashFrames].forEach(frameIndex => {
      expect(countOpaquePixels(image, frameIndex, def.frameWidth, def.frameHeight)).toBeGreaterThan(1000);
    });
  });
});
