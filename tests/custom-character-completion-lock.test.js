const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function extractFunction(source, functionName) {
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
  return source.slice(start, end + 1);
}

describe('custom characters unlock after completing the game', () => {
  const state = read('js/core/game-state.js');
  const controller = read('js/ui/controller.js');
  const panels = read('js/ui/panels.js');
  const hud = read('js/game/hud.js');
  const index = read('index.html');

  test('uses an explicit completed-game flag, not the final-boss kill alone', () => {
    const Neo = { metaProgress: { gameBeaten: false, godsKilled: 1 } };
    const hasBeatenGame = new Function(
      'Neo',
      `${extractFunction(state, 'hasBeatenGame')}; return hasBeatenGame;`,
    )(Neo);

    expect(hasBeatenGame()).toBe(false);
    Neo.metaProgress.gameBeaten = true;
    expect(hasBeatenGame()).toBe(true);
    expect(state).toContain('gameBeaten: savedMeta.gameBeaten === true || Number(savedMeta.godsKilled || 0) > 0');
  });

  test('records completion only from the real victory flow', () => {
    expect(hud).toContain('Neo.metaProgress.gameBeaten = true;');
    expect(hud).toContain('Neo.persistMetaSoon?.();');
    expect(state).toContain('gameBeaten: false,');
    expect(state).toContain("if (!Neo.metaProgress || !hasBeatenGame()) return '';");
  });

  test('does not display custom-character UI before completion', () => {
    const renderCustomRosterCards = extractFunction(controller, 'renderCustomRosterCards');
    expect(renderCustomRosterCards).toContain('addButton.hidden = !customCharactersUnlocked;');
    expect(renderCustomRosterCards).toMatch(/if \(!customCharactersUnlocked\) \{[\s\S]*?return;/);
    expect(controller).toContain('if (open && !Neo.hasBeatenGame?.()) return;');
    expect(controller).not.toContain('hasAllCharactersUnlocked');
    expect(panels).toContain("if (Neo.isCustomCharacterKey?.(characterKey) && !Neo.hasBeatenGame?.()) return;");
    expect(index).toMatch(/data-add-custom-character="true"[^>]*hidden>/);
  });

  test('rejects a stale custom selection when starting a new locked run', () => {
    const startGame = extractFunction(state, 'startGame');
    expect(startGame).toContain("if (!resume && !Neo.hasBeatenGame?.())");
    expect(startGame).toContain("Neo[field] = 'thorn_knight';");
    expect(startGame).toContain("Neo.metaProgress.selectedCharacter = 'thorn_knight';");
  });
});
