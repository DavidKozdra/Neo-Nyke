const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('character kit default persistence', () => {
  const panels = read('js/ui/panels.js');
  const player = read('js/game/player.js');

  test('saves a successfully equipped authored kit move as that character default', () => {
    const equipMove = panels.match(/export function equipMove\(slot, moveKey\) \{[\s\S]*?\n  \}\n\nexport function equipWeapon/)?.[0] || '';

    expect(equipMove).toContain('Neo.setKitChoice?.(Neo.player.character, slot, moveKey);');
    expect(equipMove.indexOf("if (!result?.ok) return;")).toBeLessThan(
      equipMove.indexOf('Neo.setKitChoice?.(Neo.player.character, slot, moveKey);'),
    );
    expect(equipMove.indexOf('Neo.setKitChoice?.(Neo.player.character, slot, moveKey);')).toBeLessThan(
      equipMove.indexOf('Neo.scheduleRunSave();'),
    );
  });

  test('keeps non-kit move equips run-only and persists valid base or alternate choices', () => {
    const setKitChoice = player.match(/export function setKitChoice\(characterKey, slot, moveKey\) \{[\s\S]*?\n  \}/)?.[0] || '';

    expect(setKitChoice).toContain('if (!Array.isArray(options) || !options.includes(moveKey)) return;');
    expect(setKitChoice).toContain('Neo.metaProgress.characterKitChoices[characterKey][slot] = moveKey;');
    expect(setKitChoice).toContain('Neo.persistMetaSoon?.();');
  });
});
