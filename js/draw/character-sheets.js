// character-sheets.js - preload character sprite sheets before atlas creation.

const CHARACTER_SHEET_DEFS = {
  metao: {
    src: 'assets/sprites/chars/Mateo.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 7,
    renderScale: 1.5,
    idleFrames: [1, 2],
    walkFrames: [3, 4, 5, 6],
    armFrame: 0,
  },
  princess: {
    src: 'assets/sprites/chars/princess.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 7,
    renderScale: 1.5,
    idleFrames: [1, 2],
    walkFrames: [3, 4, 5, 6],
    armFrame: 0,
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
  const walkFrames = Array.isArray(def.walkFrames) && def.walkFrames.length
    ? def.walkFrames.filter(i => inRange(i) && !idleFrames.includes(i))
    : Array.from({ length: frameCount }, (_, i) => i).filter(i => !idleFrames.includes(i));
  // The arm/aim-indicator frame is independent of idle/walk — it's a single
  // reference pose (e.g. an outstretched arm) rotated live to face the
  // player's aim angle, replacing the plain aim-direction line when set.
  const armFrame = inRange(def.armFrame) ? def.armFrame : null;
  return { idleFrames, walkFrames, armFrame };
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
      const { idleFrames, walkFrames, armFrame } = resolveFrameRoles(def, frameCount);
      resolve({
        ...def,
        image,
        frameCount,
        idleFrames,
        walkFrames,
        armFrame,
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
