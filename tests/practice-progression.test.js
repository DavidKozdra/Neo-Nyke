const fs = require('node:fs');
const path = require('node:path');

describe('practice progression', () => {
  const achievementPath = path.join(__dirname, '../js/achievementManager.js');
  const combatPath = path.join(__dirname, '../js/game/combat.js');
  const hudPath = path.join(__dirname, '../js/game/hud.js');
  const worldPath = path.join(__dirname, '../js/game/world.js');

  test('does not dispatch achievement events in practice mode', () => {
    const source = fs.readFileSync(achievementPath, 'utf8');
    const eventBusSource = source.slice(0, source.indexOf('const achievementManager'));
    const window = { Neo: { gameMode: 'practice' } };
    const achievementEvents = new Function(
      'window',
      `${eventBusSource}; return achievementEvents;`,
    )(window);
    const listener = jest.fn();

    achievementEvents.on('enemy:killed', listener);
    achievementEvents.emit('enemy:killed');
    expect(listener).not.toHaveBeenCalled();

    window.Neo.gameMode = 'normal';
    achievementEvents.emit('enemy:killed');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("blocks Rich Man's Blues crystal rewards in practice", () => {
    const source = fs.readFileSync(combatPath, 'utf8');

    expect(source).toContain("!isTutorialDummy && Neo.gameMode !== 'practice' && Neo.isBossType(enemy.type)");
    expect(source).toContain("collectCount <= 0 || Neo.gameMode === 'practice'");
  });

  test('blocks loop-completion crystals in practice', () => {
    const source = fs.readFileSync(worldPath, 'utf8');
    const returnToFloorOne = source.slice(
      source.indexOf('function returnToFloorOne()'),
      source.indexOf('function addCoins(', source.indexOf('function returnToFloorOne()')),
    );

    expect(returnToFloorOne).toContain("if (Neo.gameMode !== 'practice')");
    expect(returnToFloorOne.indexOf("if (Neo.gameMode !== 'practice')"))
      .toBeLessThan(returnToFloorOne.indexOf('Neo.metaProgress.loopCrystals ='));
  });

  test('makes practice revives free', () => {
    const source = fs.readFileSync(hudPath, 'utf8');

    expect(source).toContain("if (Neo.gameMode === 'practice') return 0;");
    expect(source).toContain("const reviveText = cost > 0 ? `REVIVED -${cost} LC` : 'REVIVED';");
  });
});
