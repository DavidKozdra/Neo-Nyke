const fs = require('node:fs');
const path = require('node:path');

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

describe('practice progression', () => {
  const achievementPath = path.join(__dirname, '../js/achievementManager.js');
  const combatPath = path.join(__dirname, '../js/game/combat.js');
  const hudPath = path.join(__dirname, '../js/game/hud.js');
  const worldPath = path.join(__dirname, '../js/game/world.js');
  const gameStatePath = path.join(__dirname, '../js/core/game-state.js');

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

  test('blocks boss-defeat character counters and unlocks in practice', () => {
    const source = fs.readFileSync(combatPath, 'utf8');
    const emit = jest.fn();
    const Neo = {
      gameMode: 'practice',
      metaProgress: {
        unlockedCharacters: ['princess', 'thorn_knight', 'metao'],
        mooggyDefeats: 2,
        godsKilled: 0,
        bowmanBaneDefeats: 0,
      },
      spawnParticle: jest.fn(),
      recordCharacterUnlock: jest.fn(),
      persistMetaSoon: jest.fn(),
      refreshMenuState: jest.fn(),
    };
    const recordProgress = new Function(
      'Neo',
      'window',
      `${extractFunction(source, 'recordCharacterUnlockProgress')}; return recordCharacterUnlockProgress;`,
    )(Neo, { achievementEvents: { emit } });

    ['mooggy', 'god', 'bowman_bane'].forEach(type => {
      expect(recordProgress({ type, x: 10, y: 20 })).toBeNull();
    });
    expect(Neo.metaProgress).toEqual({
      unlockedCharacters: ['princess', 'thorn_knight', 'metao'],
      mooggyDefeats: 2,
      godsKilled: 0,
      bowmanBaneDefeats: 0,
    });
    expect(Neo.recordCharacterUnlock).not.toHaveBeenCalled();
    expect(Neo.persistMetaSoon).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();

    Neo.gameMode = 'normal';
    expect(recordProgress({ type: 'mooggy', x: 10, y: 20 })).toBe(3);
    expect(recordProgress({ type: 'god', x: 10, y: 20 })).toBe(1);
    expect(recordProgress({ type: 'bowman_bane', x: 10, y: 20 })).toBe(1);
    expect(Neo.metaProgress.unlockedCharacters).toEqual(expect.arrayContaining(['mooggy', 'gelleh', 'sarge']));
    expect(Neo.recordCharacterUnlock.mock.calls.map(([key]) => key)).toEqual(['mooggy', 'gelleh', 'sarge']);
  });

  test('blocks Turtle Boy equipment unlocks in practice', () => {
    const source = fs.readFileSync(gameStatePath, 'utf8');
    const Neo = {
      gameMode: 'practice',
      player: {
        x: 10,
        y: 20,
        equippedWeapon: 'extending_staff',
        equippedMoves: { laser: 'turtle_wave' },
      },
      metaProgress: { unlockedCharacters: ['princess', 'thorn_knight', 'metao'] },
      spawnParticle: jest.fn(),
      recordCharacterUnlock: jest.fn(),
      persistMetaSoon: jest.fn(),
      refreshMenuState: jest.fn(),
    };
    const checkUnlock = new Function(
      'Neo',
      `${extractFunction(source, 'checkTurtleBoyUnlock')}; return checkTurtleBoyUnlock;`,
    )(Neo);

    checkUnlock();
    expect(Neo.metaProgress.unlockedCharacters).not.toContain('turtle_boy');
    expect(Neo.persistMetaSoon).not.toHaveBeenCalled();

    Neo.gameMode = 'normal';
    checkUnlock();
    expect(Neo.metaProgress.unlockedCharacters).toContain('turtle_boy');
    expect(Neo.recordCharacterUnlock).toHaveBeenCalledWith('turtle_boy');
  });
});
