// character-sheets.js - preload character sprite sheets before atlas creation.

const CHARACTER_SHEET_DEFS = {
  metao: {
    src: 'assets/sprites/chars/Mateo.png',
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 7,
    renderScale: 1.5,
  },
  princess: {
    src: 'assets/sprites/chars/princess.png',
    frameWidth: 24,
    frameHeight: 24,
    frameCount: 6,
    renderScale: 1.5,
  },
};

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
      resolve({
        ...def,
        image,
        frameCount,
        animations: {
          walk: Array.from({ length: Math.max(0, frameCount - 1) }, (_, index) => `walk${index}`),
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
