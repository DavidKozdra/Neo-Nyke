const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const achievementSource = fs.readFileSync(path.join(root, 'js/achievementManager.js'), 'utf8');
const gameStateSource = fs.readFileSync(path.join(root, 'js/core/game-state.js'), 'utf8');
const combatSource = fs.readFileSync(path.join(root, 'js/game/combat.js'), 'utf8');
const hudSource = fs.readFileSync(path.join(root, 'js/game/hud.js'), 'utf8');

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

// Sandbox lets the player dial in their own level, coins, items, enemy roster
// and stat multipliers, and its "unlock everything" toggle hands over every
// weapon and move mid-run. Nothing earned there may reach permanent progression.
describe('sandbox progression gating', () => {
  test('achievement event bus refuses to publish in sandbox', () => {
    const eventBusSource = achievementSource.slice(0, achievementSource.indexOf('const achievementManager'));
    const window = { Neo: { gameMode: 'sandbox' } };
    const achievementEvents = new Function('window', `${eventBusSource}; return achievementEvents;`)(window);
    const listener = jest.fn();
    achievementEvents.on('enemy:killed', listener);

    ['enemy:killed', 'run:won', 'floor:reached', 'boss:defeated'].forEach(topic => {
      achievementEvents.emit(topic, {});
    });
    expect(listener).not.toHaveBeenCalled();

    window.Neo.gameMode = 'normal';
    achievementEvents.emit('enemy:killed', {});
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('every character-unlock path routes through the shared blocked-mode gate', () => {
    expect(extractFunction(gameStateSource, 'checkTurtleBoyUnlock'))
      .toContain('Neo.isMetaProgressBlockedMode?.()');
    expect(extractFunction(combatSource, 'recordCharacterUnlockProgress'))
      .toContain('Neo.isMetaProgressBlockedMode?.()');
  });

  test('sandbox earns no loop crystals, so it cannot buy difficulty unlocks', () => {
    const isBlocked = new Function(
      'Neo',
      `${extractFunction(gameStateSource, 'isMetaProgressBlockedMode')}; return isMetaProgressBlockedMode;`,
    )({});
    expect(isBlocked('sandbox')).toBe(true);

    // Victory crystals, loop crystals, Rich Man's Blues drops and pickups.
    expect(hudSource).toContain("if (!Neo.isMetaProgressBlockedMode?.()) {");
    expect(combatSource).toContain("collectCount <= 0 || Neo.isMetaProgressBlockedMode?.()");
    expect(combatSource).toContain("!isTutorialDummy && !Neo.isMetaProgressBlockedMode?.() && Neo.isBossType(enemy.type)");
  });

  test('sandbox never records a hero win toward Seven Heroes One Crown', () => {
    expect(achievementSource).toContain("gameMode !== 'sandbox' && validHeroKeys.includes(characterKey)");
  });
});
