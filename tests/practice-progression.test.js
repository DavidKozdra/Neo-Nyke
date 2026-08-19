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

// Practice and Sandbox are both free-play modes: neither may feed permanent
// progression, and both funnel through Neo.isMetaProgressBlockedMode().
const BLOCKED_MODES = ['practice', 'sandbox'];

describe('practice progression', () => {
  const achievementPath = path.join(__dirname, '../js/achievementManager.js');
  const combatPath = path.join(__dirname, '../js/game/combat.js');
  const hudPath = path.join(__dirname, '../js/game/hud.js');
  const worldPath = path.join(__dirname, '../js/game/world.js');
  const gameStatePath = path.join(__dirname, '../js/core/game-state.js');

  test.each(BLOCKED_MODES)('does not dispatch achievement events in %s mode', mode => {
    const source = fs.readFileSync(achievementPath, 'utf8');
    const eventBusSource = source.slice(0, source.indexOf('const achievementManager'));
    const window = { Neo: { gameMode: mode } };
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

  test('isMetaProgressBlockedMode covers practice and sandbox only', () => {
    const source = fs.readFileSync(gameStatePath, 'utf8');
    const isBlocked = new Function(
      'Neo',
      `${extractFunction(source, 'isMetaProgressBlockedMode')}; return isMetaProgressBlockedMode;`,
    )({});

    BLOCKED_MODES.forEach(mode => expect(isBlocked(mode)).toBe(true));
    ['normal', 'story', 'endless', 'survival', 'boss_rush', 'coop', 'pvp'].forEach(mode => {
      expect(isBlocked(mode)).toBe(false);
    });
  });

  test("blocks Rich Man's Blues crystal rewards in practice", () => {
    const source = fs.readFileSync(combatPath, 'utf8');

    expect(source).toContain("!isTutorialDummy && !Neo.isMetaProgressBlockedMode?.() && Neo.isBossType(enemy.type)");
    expect(source).toContain("collectCount <= 0 || Neo.isMetaProgressBlockedMode?.()");
  });

  test('blocks loop-completion crystals in practice', () => {
    const source = fs.readFileSync(worldPath, 'utf8');
    const returnToFloorOne = source.slice(
      source.indexOf('function returnToFloorOne()'),
      source.indexOf('function addCoins(', source.indexOf('function returnToFloorOne()')),
    );

    expect(returnToFloorOne).toContain('if (!Neo.isMetaProgressBlockedMode?.())');
    expect(returnToFloorOne.indexOf('if (!Neo.isMetaProgressBlockedMode?.())'))
      .toBeLessThan(returnToFloorOne.indexOf('Neo.metaProgress.loopCrystals ='));
  });

  test('makes practice revives free', () => {
    const source = fs.readFileSync(hudPath, 'utf8');

    expect(source).toContain("if (Neo.gameMode === 'practice') return 0;");
    expect(source).toContain("const reviveText = cost > 0 ? `REVIVED -${cost} LC` : 'REVIVED';");
  });

  test.each(BLOCKED_MODES)('blocks boss-defeat character counters and unlocks in %s', mode => {
    const source = fs.readFileSync(combatPath, 'utf8');
    const emit = jest.fn();
    const Neo = {
      gameMode: mode,
      isMetaProgressBlockedMode: () => BLOCKED_MODES.includes(Neo.gameMode),
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

  // Sandbox's "unlock everything" hands over every weapon and move mid-run,
  // which trivially satisfies Turtle Boy's Extending Staff + Turtle Wave combo.
  test.each(BLOCKED_MODES)('blocks Turtle Boy equipment unlocks in %s', mode => {
    const source = fs.readFileSync(gameStatePath, 'utf8');
    const Neo = {
      gameMode: mode,
      isMetaProgressBlockedMode: () => BLOCKED_MODES.includes(Neo.gameMode),
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
