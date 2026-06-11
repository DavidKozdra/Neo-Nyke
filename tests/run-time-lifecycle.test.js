const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
  let start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;

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

describe('run time lifecycle', () => {
  const hudSource = fs.readFileSync(path.join(__dirname, '../js/game/hud.js'), 'utf8');
  const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');

  test('reviving preserves the elapsed run time', () => {
    const Neo = {
      gameElapsedTime: 93.5,
      metaProgress: { loopCrystals: 2 },
      runRevivesUsed: 0,
      runHistory: [{ id: 'death-entry' }],
      lastDeathEntryId: 'death-entry',
      playerDeathAnim: {},
      player: {
        x: 10,
        y: 20,
        hp: 0,
        maxHp: 100,
        inv: 0,
        stun: 1,
        vx: 4,
        vy: 5,
        dashTime: 1,
      },
      projectiles: [{}],
      hazards: [{}],
      skySwords: [{}],
      justiceBlades: [{}],
      activeBeamPaths: [{}],
      lastDamageSource: 'enemy',
      lastDamageSourceKey: 'enemy',
      START_X: 0,
      START_Y: 0,
      setGameState: jest.fn(),
      spawnParticle: jest.fn(),
      uiController: { setDeadScreen: jest.fn() },
    };
    const getReviveCost = () => 1;
    const canReviveFromDeath = () => true;
    const persistMetaSoon = jest.fn();
    const scheduleRunSave = jest.fn();
    const updateHud = jest.fn();
    const reviveFromDeath = new Function(
      'Neo',
      'getReviveCost',
      'canReviveFromDeath',
      'persistMetaSoon',
      'scheduleRunSave',
      'updateHud',
      `${extractFunction(hudSource, 'reviveFromDeath')}; return reviveFromDeath;`,
    )(Neo, getReviveCost, canReviveFromDeath, persistMetaSoon, scheduleRunSave, updateHud);

    expect(reviveFromDeath()).toBe(true);
    expect(Neo.gameElapsedTime).toBe(93.5);
    expect(Neo.setGameState).toHaveBeenCalledWith('play');
  });

  test('looping to floor one preserves the cumulative run time', () => {
    const Neo = {
      floor: 10,
      gameElapsedTime: 187.25,
      runLoopIndex: 0,
      runCrystalsEarned: 0,
      gameMode: 'normal',
      selectedDifficulty: 'easy',
      MAX_FLOOR: 10,
      HARD_DIFFICULTIES: new Set(),
      metaProgress: { loopCrystals: 0, coins: 0, bestFloor: 0 },
      player: { x: 100, y: 100 },
      START_X: 20,
      START_Y: 30,
      mooggyAssassinSpawnedThisRun: true,
      mooggyAssassinSpawnedThisFloor: true,
      refreshFloorChargeStates: jest.fn(),
      syncSeedState: jest.fn(),
      getActiveChallengeCrystalBonusMultiplier: () => 0,
      hasLegacy: () => false,
      spawnParticle: jest.fn(),
      persistMetaSoon: jest.fn(),
      generateFloor: jest.fn(),
      scheduleRunSave: jest.fn(),
    };
    const window = { achievementEvents: { emit: jest.fn() } };
    const spawnLoopBlueRewardChoices = jest.fn();
    const returnToFloorOne = new Function(
      'Neo',
      'window',
      'spawnLoopBlueRewardChoices',
      `${extractFunction(worldSource, 'returnToFloorOne')}; return returnToFloorOne;`,
    )(Neo, window, spawnLoopBlueRewardChoices);

    returnToFloorOne();

    expect(Neo.floor).toBe(1);
    expect(Neo.runLoopIndex).toBe(1);
    expect(Neo.gameElapsedTime).toBe(187.25);
  });

  test('a new run save waits for death cleanup before writing', async () => {
    const declarations = [
      extractFunction(hudSource, 'saveRunNow'),
    ].join('\n');
    let finishClear;
    const clearPromise = new Promise(resolve => {
      finishClear = resolve;
    });
    const writes = [];
    const Neo = {
      runSaveClearPromise: clearPromise,
      gameState: 'play',
      player: {},
      currentRoom: {},
      metaProgress: { bestFloor: 0 },
      floor: 1,
      runHistory: [],
      refreshMenuState: jest.fn(),
      saveStore: {
        put: jest.fn(async key => {
          writes.push(key);
        }),
      },
      uiController: { setSaveState: jest.fn() },
    };
    const serializeRun = jest.fn(() => ({ gameElapsedTime: 42 }));
    const saveRunNow = new Function(
      'Neo',
      'window',
      'serializeRun',
      `${declarations}; return saveRunNow;`,
    )(Neo, {}, serializeRun);

    const saving = saveRunNow();
    await Promise.resolve();
    expect(serializeRun).not.toHaveBeenCalled();
    expect(writes).toEqual([]);

    finishClear();
    await saving;

    expect(serializeRun).toHaveBeenCalledTimes(1);
    expect(writes).toEqual(['run', 'meta', 'runHistory']);
  });
});
