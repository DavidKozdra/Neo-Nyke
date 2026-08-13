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
    frameHeight: 24,
    frameCount: 8,
    // The authored strip is vertically centered in a 48 px export canvas.
    // Crop that padding at load time so each atlas entry stays a square 24 px
    // frame like the other combatants.
    sourceOffsetY: 15,
    renderScale: 1.5,
    stepRate: 10,
    idleRate: 1.5,
    idleFrames: [2, 3],
    walkFrames: [4, 5, 6, 7],
    armFrame: 1,
    portraitFrame: 0,
    armBaseAngle: -Math.PI / 2,
    armPivot: { x: 12, y: 19 },
    armOffset: { x: 1, y: 3 },
  },
  // The charged Artificer is the same Knave transformed into a boss. Keep the
  // exact authored sheet and animation roles; its larger enemy radius supplies
  // the in-world size increase.
  artificer_knave: {
    src: 'assets/sprites/chars/knave.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 8,
    sourceOffsetY: 15,
    renderScale: 1.5,
    stepRate: 10,
    idleRate: 1.5,
    idleFrames: [2, 3],
    walkFrames: [4, 5, 6, 7],
    armFrame: 1,
    portraitFrame: 0,
    armBaseAngle: -Math.PI / 2,
    armPivot: { x: 12, y: 19 },
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

function loadCharacterSheet(key, def) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(createCharacterSheetFromImage(key, def, image));
    image.onerror = () => {
      console.warn(`[CharacterSprites] Failed to preload "${def.src}".`);
      resolve(null);
    };
    image.src = def.src;
  });
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
