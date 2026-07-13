// character-sheets.js - preload character sprite sheets before atlas creation.

const CHARACTER_SHEET_DEFS = {
  thorn_knight: {
    src: 'assets/sprites/chars/Thorn Knight.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 7,
    renderScale: 1.5,
    idleFrames: [2, 3],
    walkFrames: [4, 5, 6],
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
    frameCount: 7,
    renderScale: 1.5,
    idleFrames: [2, 3],
    walkFrames: [4, 5, 6],
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
    frameCount: 8,
    renderScale: 1.5,
    idleFrames: [2, 3],
    walkFrames: [4, 5, 6, 7],
    armFrame: 1,
    portraitFrame: 0,
    idleRate: 1.5,
    armBaseAngle: 0,
    armPivot: { x: 10, y: 15 },
    armOffset: { x: 4, y: 2 },
  },
};

// Which raw frame indices play the idle cycle, and which (ordered) indices
// make up the walk cycle. Defaults to "frame 0 is idle, everything else walks
// in sheet order" when a def doesn't specify — but sheets aren't always laid
// out that way (e.g. an arm/weapon reference frame sitting at index 0), so
// both are overridable per-def and editable from the developer sprite editor.
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
  const walkFrames = (Array.isArray(def.walkFrames) && def.walkFrames.length
    ? def.walkFrames
    : Array.from({ length: frameCount }, (_, i) => i))
    .filter(i => inRange(i) && !idleFrames.includes(i) && i !== armFrame);
  // The portrait frame is what chat dialogue and the character-select screen
  // draw as the character's face — independent of idle/walk/arm, so it can be
  // a dedicated close-up pose. Defaults to the first idle frame (the old,
  // implicit behavior) when a def doesn't specify one.
  const portraitFrame = inRange(def.portraitFrame) ? def.portraitFrame : idleFrames[0];
  return { idleFrames, walkFrames, armFrame, portraitFrame };
}

function loadCharacterSheet(key, def) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const availableFrames = Math.floor(image.naturalWidth / def.frameWidth);
      const frameCount = Math.min(def.frameCount, availableFrames);
      if (frameCount < 1 || image.naturalHeight < def.frameHeight) {
        console.warn(`[CharacterSprites] Invalid sprite sheet dimensions for "${key}".`);
        resolve(null);
        return;
      }
      const { idleFrames, walkFrames, armFrame, portraitFrame } = resolveFrameRoles(def, frameCount);
      resolve({
        ...def,
        image,
        frameCount,
        idleFrames,
        walkFrames,
        armFrame,
        portraitFrame,
        animations: {
          idle: idleFrames.map((_, index) => `idle${index}`),
          walk: walkFrames.map((_, index) => `walk${index}`),
        },
      });
    };
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
