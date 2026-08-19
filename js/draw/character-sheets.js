// character-sheets.js - preload character sprite sheets before atlas creation.

const CHARACTER_SHEET_DEFS = {
  thorn_knight: {
    src: 'assets/sprites/chars/Thorn Knight.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 32,
    renderScale: 1.5,
    stepRate: 10,
    actionRate: 10,
    idleFrames: [2],
    walkFrames: [2, 3, 4, 5, 6, 7],
    dashFrames: [10, 11, 12, 13, 14, 15],
    smashFrames: [18, 19, 20, 21, 22, 23],
    beamFrames: [26, 27, 28, 29, 30, 31],
    armFrame: 1,
    portraitFrame: 0,
    armBaseAngle: -Math.PI / 2,
    armPivot: { x: 10, y: 17 },
    armOffset: { x: 1, y: 3 },
  },
  sarge: {
    src: 'assets/sprites/chars/Sarge.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 32,
    renderScale: 1.5,
    stepRate: 10,
    actionRate: 10,
    idleFrames: [2],
    walkFrames: [2, 3, 4, 5, 6, 7],
    dashFrames: [10, 11, 12, 13, 14, 15],
    smashFrames: [18, 19, 20, 21, 22, 23],
    beamFrames: [26, 27, 28, 29, 30, 31],
    armFrame: 1,
    portraitFrame: 0,
  },
  gelleh: {
    src: 'assets/sprites/chars/Gelleh.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 8,
    renderScale: 1.5,
    idleFrames: [3, 4],
    walkFrames: [5, 6, 7],
    armFrame: 2,
    portraitFrame: 0,
    idleRate: 1.5,
    armBaseAngle: -Math.PI / 4,
    armPivot: { x: 6, y: 19 },
    armOffset: { x: 3, y: 3 },
  },
  princess: {
    src: 'assets/sprites/chars/princess.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 8,
    renderScale: 1.5,
    idleFrames: [2, 3],
    walkFrames: [4, 5, 6, 7],
    armFrame: 1,
    portraitFrame: 0,
    armBaseAngle: 0,
    armPivot: { x: 7, y: 15 },
    armOffset: { x: 2, y: 2 },
  },
  metao: {
    src: 'assets/sprites/chars/Metao.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 32,
    renderScale: 1.5,
    stepRate: 10,
    actionRate: 10,
    idleFrames: [2],
    walkFrames: [2, 3, 4, 5, 6, 7],
    dashFrames: [10, 11, 12, 13, 14, 15],
    smashFrames: [18, 19, 20, 21, 22, 23],
    beamFrames: [26, 27, 28, 29, 30, 31],
    armFrame: 1,
    portraitFrame: 0,
    idleRate: 1.5,
    armBaseAngle: 0,
    armPivot: { x: 10, y: 15 },
    armOffset: { x: 4, y: 2 },
  },
  mooggy: {
    src: 'assets/sprites/chars/Mooggy.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 35,
    renderScale: 1.5,
    stepRate: 10,
    actionRate: 10,
    idleFrames: [31, 32, 33, 34],
    walkFrames: [3, 4, 5, 6],
    dashFrames: [10, 11, 12, 13],
    smashFrames: [17, 18, 19, 20],
    beamFrames: [24, 25, 26, 27],
    armFrame: 2,
    portraitFrame: 0,
  },
  turtle_boy: {
    src: 'assets/sprites/chars/TurtleBoy.png',
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 8,
    renderScale: 1.5,
    idleFrames: [2, 3],
    walkFrames: [4, 5, 6, 7],
    armFrame: 1,
    portraitFrame: 0,
  },
  hunter: {
    src: 'assets/sprites/chars/hunter.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 8,
    renderScale: 1.5,
    stepRate: 9,
    actionRate: 12,
    idleFrames: [0],
    walkFrames: [1, 2, 3, 4],
    attackFrames: [5, 6, 7],
    portraitFrame: 0,
  },
  charger: {
    src: 'assets/sprites/chars/charger.png',
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 12,
    renderScale: 1.5,
    stepRate: 9,
    actionRate: 12,
    idleFrames: [0],
    walkFrames: [7, 8, 9, 10, 11],
    attackFrames: [1, 2, 3, 4, 5, 6],
    dashFrames: [7, 8, 9, 10, 11],
    portraitFrame: 0,
  },
  cult_follower: {
    src: 'assets/sprites/chars/follower.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 9,
    renderScale: 1.5,
    stepRate: 9,
    actionRate: 12,
    idleFrames: [0],
    walkFrames: [1, 2, 3, 4],
    attackFrames: [5, 6, 7, 8],
    portraitFrame: 0,
  },
  healer: {
    src: 'assets/sprites/chars/healer.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 9,
    renderScale: 1.5,
    stepRate: 7,
    actionRate: 12,
    idleFrames: [0],
    walkFrames: [1, 2, 3, 4],
    attackFrames: [5, 6, 7, 8],
    portraitFrame: 0,
  },
  sniper: {
    src: 'assets/sprites/chars/sniper.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 8,
    renderScale: 1.5,
    stepRate: 9,
    actionRate: 12,
    idleFrames: [0],
    walkFrames: [1, 2, 3, 4],
    attackFrames: [5, 6, 7],
    portraitFrame: 0,
  },
  knave: {
    src: 'assets/sprites/chars/knave.png',
    frameWidth: 24,
    // The authored strip is vertically centered in a 48 px export canvas, but
    // its content spans 25 rows (y=14..38), not 24: the sword tip on the arm
    // frame sits alone on row 14 and the portrait frame's base sits alone on
    // row 38. A 24 px window had to clip one of them — at sourceOffsetY 15 it
    // cut the blade tip off. Crop from row 14 with a 25 px frame so the whole
    // strip fits and the sword stays intact.
    frameHeight: 25,
    frameCount: 8,
    sourceOffsetY: 14,
    renderScale: 1.5,
    stepRate: 10,
    idleRate: 1.5,
    idleFrames: [2, 3],
    walkFrames: [4, 5, 6, 7],
    armFrame: 1,
    portraitFrame: 0,
    armBaseAngle: -Math.PI / 2,
    // Pivot follows the crop: one row earlier means one row further down the frame.
    armPivot: { x: 12, y: 20 },
    armOffset: { x: 1, y: 3 },
  },
  // The charged Artificer is the same Knave transformed into a boss. Keep the
  // exact authored sheet and animation roles; its larger enemy radius supplies
  // the in-world size increase.
  artificer_knave: {
    src: 'assets/sprites/chars/knave.png',
    frameWidth: 24,
    // Same sheet as `knave`, so it needs the same 25 px crop — otherwise the
    // boss loses its sword tip exactly like the hero did.
    frameHeight: 25,
    frameCount: 8,
    sourceOffsetY: 14,
    renderScale: 1.5,
    stepRate: 10,
    idleRate: 1.5,
    idleFrames: [2, 3],
    walkFrames: [4, 5, 6, 7],
    armFrame: 1,
    portraitFrame: 0,
    armBaseAngle: -Math.PI / 2,
    armPivot: { x: 12, y: 20 },
    armOffset: { x: 1, y: 3 },
  },
  cult_mage: {
    src: 'assets/sprites/chars/cultMage.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 9,
    renderScale: 1.5,
    stepRate: 7,
    actionRate: 12,
    idleFrames: [0],
    walkFrames: [0, 1, 2, 3, 4],
    attackFrames: [5, 6, 7, 8],
    portraitFrame: 0,
  },
  summoner: {
    src: 'assets/sprites/chars/summoner.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 9,
    renderScale: 1.5,
    stepRate: 7,
    actionRate: 12,
    idleFrames: [0],
    walkFrames: [1, 2, 3, 4],
    attackFrames: [5, 6, 7, 8],
    portraitFrame: 0,
  },
  queen_cult: {
    src: 'assets/sprites/chars/queen_1.png',
    frameWidth: 36,
    frameHeight: 45,
    frameCount: 5,
    renderScale: 1.2,
    stepRate: 7,
    idleFrames: [2],
    walkFrames: [2, 3, 4],
    armFrame: 1,
    portraitFrame: 0,
    armBaseAngle: -Math.PI / 4,
    armPivot: { x: 16, y: 27 },
    armOffset: { x: 3, y: -3 },
    mirrorFacing: false,
  },
  golem: {
    src: 'assets/sprites/chars/mini-golem.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 10,
    renderScale: 1,
    stepRate: 7,
    actionRate: 12,
    idleFrames: [0],
    walkFrames: [0, 1, 2, 3, 4],
    attackFrames: [5, 6, 7, 8, 9],
    portraitFrame: 0,
  },
  shield_unit: {
    src: 'assets/sprites/chars/shield_unit.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 10,
    renderScale: 1,
    stepRate: 7,
    actionRate: 12,
    idleFrames: [0],
    walkFrames: [1, 2, 3, 4, 5, 6],
    attackFrames: [7, 8, 9],
    portraitFrame: 0,
  },
  machine_gunner: {
    src: 'assets/sprites/chars/machine_gunner.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 10,
    renderScale: 1.5,
    stepRate: 9,
    actionRate: 12,
    idleFrames: [0],
    walkFrames: [1, 2, 3, 4, 5, 6],
    attackFrames: [7, 8, 9],
    portraitFrame: 0,
  },
  laser: {
    src: 'assets/sprites/chars/cultMage.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 9,
    renderScale: 1.5,
    stepRate: 7,
    actionRate: 12,
    idleFrames: [0],
    walkFrames: [0, 1, 2, 3, 4],
    beamFrames: [5, 6, 7, 8],
    portraitFrame: 0,
  },
  antony_blemmye: {
    src: 'assets/sprites/chars/Anthony.png',
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 3,
    renderScale: 2.3,
    stepRate: 4,
    idleRate: 1.5,
    actionRate: 8,
    idleFrames: [0, 1],
    walkFrames: [0, 1],
    attackFrames: [2],
    beamFrames: [1],
    smashFrames: [2],
    portraitFrame: 0,
  },
  handsome_devil: {
    src: 'assets/sprites/chars/HandsomeDevil.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 18,
    renderScale: 1,
    stepRate: 10,
    idleRate: 10,
    actionRate: 10,
    idleFrames: [1, 2],
    walkFrames: [3, 4, 5, 6],
    beamFrames: [7, 8, 9, 10, 11],
    attackFrames: [12, 13, 14, 15, 16, 17],
    portraitFrame: 0,
  },
  // The God is authored one frame per file rather than as a strip, so both of
  // its forms composite through `srcFrames`. Phases 1-2 use the early form and
  // phases 3-5 the ascended one; getEnemySpriteKey picks between them.
  god: {
    srcFrames: [
      'assets/sprites/chars/God (1)1.png',
      'assets/sprites/chars/God (1)2.png',
    ],
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 2,
    // The early form only fills 20x28 of its 48px box (the ascended form fills
    // 40x46), so it needs the larger scale of the two just to match it in world
    // size — and still stays the smaller silhouette.
    renderScale: 1.9,
    stepRate: 5,
    idleRate: 1.6,
    idleFrames: [0, 1],
    walkFrames: [0, 1],
    portraitFrame: 0,
  },
  god_ascended: {
    srcFrames: [
      'assets/sprites/chars/God (1)3.png',
      'assets/sprites/chars/God (1)4.png',
      'assets/sprites/chars/God (1)5.png',
    ],
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 3,
    renderScale: 1.5,
    stepRate: 6,
    idleRate: 2.2,
    idleFrames: [0, 1, 2],
    walkFrames: [0, 1, 2],
    portraitFrame: 0,
  },
  bulk_golem: {
    src: 'assets/sprites/chars/large-golem.png',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 16,
    renderScale: 2,
    stepRate: 7,
    actionRate: 10,
    idleFrames: [0],
    walkFrames: [0, 1, 2],
    attackFrames: [3, 4, 5, 6, 7, 8, 9],
    smashFrames: [10, 11, 12, 13, 14, 15],
    portraitFrame: 0,
  },
};

// Which raw frame indices play the idle cycle, and which (ordered) indices
// make up the walk cycle. Defaults to "frame 0 is idle, everything else walks
// in sheet order" when a def doesn't specify — but sheets aren't always laid
// out that way (e.g. an arm/weapon reference frame sitting at index 0), so
// both are overridable per-def and editable from the developer sprite editor.
// Explicit lists may overlap, allowing the neutral walk pose to double as idle.
// `idleFrame` (singular) is kept as a legacy input for older defs/downloads.
function resolveFrameRoles(def, frameCount) {
  const inRange = i => Number.isInteger(i) && i >= 0 && i < frameCount;
  let idleFrames = Array.isArray(def.idleFrames) && def.idleFrames.length
    ? def.idleFrames.filter(inRange)
    : (inRange(def.idleFrame) ? [def.idleFrame] : []);
  if (!idleFrames.length) idleFrames = [0];
  // The arm/aim-indicator frame is independent of idle/walk — it's a single
  // reference pose (e.g. an outstretched arm) rotated live to face the
  // player's aim angle, replacing the plain aim-direction line when set.
  const armFrame = inRange(def.armFrame) ? def.armFrame : null;
  if (armFrame != null) idleFrames = idleFrames.filter(i => i !== armFrame);
  if (!idleFrames.length) {
    const fallback = Array.from({ length: frameCount }, (_, i) => i).find(i => i !== armFrame);
    if (fallback != null) idleFrames = [fallback];
  }
  const hasConfiguredWalkFrames = Array.isArray(def.walkFrames) && def.walkFrames.length;
  const walkFrames = (hasConfiguredWalkFrames
    ? def.walkFrames
    : Array.from({ length: frameCount }, (_, i) => i).filter(i => !idleFrames.includes(i)))
    .filter(i => inRange(i) && i !== armFrame);
  // The portrait frame is what chat dialogue and the character-select screen
  // draw as the character's face — independent of idle/walk/arm, so it can be
  // a dedicated close-up pose. Defaults to the first idle frame (the old,
  // implicit behavior) when a def doesn't specify one.
  const portraitFrame = inRange(def.portraitFrame) ? def.portraitFrame : idleFrames[0];
  return { idleFrames, walkFrames, armFrame, portraitFrame };
}

function createCharacterSheetFromImage(key, def, image) {
  const sourceOffsetX = Math.max(0, Math.floor(Number(def.sourceOffsetX) || 0));
  const sourceOffsetY = Math.max(0, Math.floor(Number(def.sourceOffsetY) || 0));
  const columns = Math.floor((image.naturalWidth - sourceOffsetX) / def.frameWidth);
  const rows = Math.floor((image.naturalHeight - sourceOffsetY) / def.frameHeight);
  const availableFrames = columns * rows;
  const frameCount = Math.min(def.frameCount, availableFrames);
  if (frameCount < 1 || columns < 1 || rows < 1) {
    console.warn(`[CharacterSprites] Invalid sprite sheet dimensions for "${key}".`);
    return null;
  }
  const { idleFrames, walkFrames, armFrame, portraitFrame } = resolveFrameRoles(def, frameCount);
  const animationFrames = {};
  ['attack', 'dash', 'smash', 'beam'].forEach(action => {
    const indices = Array.isArray(def[`${action}Frames`])
      ? def[`${action}Frames`].filter(index => Number.isInteger(index) && index >= 0 && index < frameCount)
      : [];
    if (indices.length) animationFrames[action] = indices;
  });
  return {
    ...def,
    image,
    columns,
    rows,
    frameCount,
    idleFrames,
    walkFrames,
    animationFrames,
    armFrame,
    portraitFrame,
    animations: {
      idle: idleFrames.map((_, index) => `idle${index}`),
      walk: walkFrames.map((_, index) => `walk${index}`),
      ...Object.fromEntries(
        Object.entries(animationFrames).map(([action, indices]) => (
          [action, indices.map((_, index) => `${action}${index}`)]
        )),
      ),
    },
  };
}

function loadImage(src) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    // Spaces survive a plain src assignment, but parentheses in a filename
    // (e.g. "God (1)1.png") are not reliably passed through the fetch/service
    // worker path, so encode anything that isn't already escaped.
    image.src = /%[0-9a-fA-F]{2}/.test(src) ? src : encodeURI(src);
  });
}

// Some characters are authored as one frame per file rather than a single
// strip. Composite those into one offscreen canvas laid out left-to-right so
// the rest of the pipeline keeps seeing the row-major grid it expects.
async function loadCompositeSheetImage(key, def) {
  const sources = def.srcFrames;
  const images = await Promise.all(sources.map(loadImage));
  const missing = sources.filter((src, index) => !images[index]);
  if (missing.length) {
    console.warn(`[CharacterSprites] Failed to preload "${missing.join('", "')}" for "${key}".`);
    return null;
  }
  const canvas = document.createElement('canvas');
  // Size from the declared frame box, not from the loaded images: a mis-sized
  // source then trips the dimension check in createCharacterSheetFromImage
  // instead of silently shifting every later frame out of alignment.
  canvas.width = def.frameWidth * sources.length;
  canvas.height = def.frameHeight;
  // createCharacterSheetFromImage and buildSpriteAtlas both measure the sheet
  // through naturalWidth/naturalHeight, which a canvas does not have.
  canvas.naturalWidth = canvas.width;
  canvas.naturalHeight = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  images.forEach((image, index) => {
    ctx.drawImage(image, index * def.frameWidth, 0);
  });
  return canvas;
}

async function loadCharacterSheet(key, def) {
  if (Array.isArray(def.srcFrames) && def.srcFrames.length) {
    const composite = await loadCompositeSheetImage(key, def);
    return composite ? createCharacterSheetFromImage(key, def, composite) : null;
  }
  const image = await loadImage(def.src);
  if (!image) {
    console.warn(`[CharacterSprites] Failed to preload "${def.src}".`);
    return null;
  }
  return createCharacterSheetFromImage(key, def, image);
}

export async function preloadCharacterSheets() {
  const loadedEntries = await Promise.all(
    Object.entries(CHARACTER_SHEET_DEFS).map(async ([key, def]) => [key, await loadCharacterSheet(key, def)]),
  );
  Neo.CHARACTER_SPRITE_SHEETS = Object.fromEntries(
    loadedEntries.filter(([, sheet]) => sheet),
  );
  return Neo.CHARACTER_SPRITE_SHEETS;
}

Neo.CHARACTER_SHEET_DEFS = CHARACTER_SHEET_DEFS;
Neo.preloadCharacterSheets = preloadCharacterSheets;
Neo.resolveCharacterFrameRoles = resolveFrameRoles;
Neo.createCharacterSheetFromImage = createCharacterSheetFromImage;
