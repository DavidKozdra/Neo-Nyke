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

const gameStateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');

function createNormalStartHarness({
  seed = '',
  replayTutorial = false,
  randomSeed = 'RANDOM-SEED',
  tutorialCompleted = false,
  tutorialVersion = 0,
} = {}) {
  const tutorialStart = jest.fn();
  const resetTutorialState = jest.fn(active => {
    Neo.tutorialState = { active };
  });
  const consumeReplayTutorialRequest = jest.fn()
    .mockReturnValueOnce(replayTutorial)
    .mockReturnValue(false);
  const startCompetitive = jest.fn();
  const Neo = {
    gameMode: 'normal',
    chosenCharacter: 'thorn_knight',
    ui: { seed: { value: seed } },
    metaProgress: {
      selectedChallenges: ['storm'],
      tutorialCompleted,
      tutorialVersion,
    },
    selectedDifficulty: 'medium',
    selectedChallenges: ['storm'],
    activeRun: null,
    tutorialController: { start: tutorialStart },
    persistMetaSoon: jest.fn(),
    scheduleRunSave: jest.fn(),
    resetRunUnlocks: jest.fn(),
    generateFloor: jest.fn(),
    loop: jest.fn(),
    loopStarted: true,
    // Any local run must first force a live browser-network game off the screen
    // so a solo run can never boot on top of it (regression: Single Player
    // re-opened the multiplayer game).
    detachBrowserMultiplayerGame: jest.fn(),
  };
  const window = { achievementManager: { resetRunCounters: jest.fn() } };
  const dependencies = {
    Neo,
    startEndless: jest.fn(),
    startPractice: jest.fn(),
    startBossRush: jest.fn(),
    startCoop: jest.fn(),
    startPvp: jest.fn(),
    startCompetitive,
    isSargeTutorialBlocked: jest.fn(() => false),
    consumeReplayTutorialRequest,
    setGameState: jest.fn(state => { Neo.gameState = state; }),
    restoreRun: jest.fn(),
    resetTutorialState,
    TUTORIAL_SEED: 'NEONYKE-TUTORIAL-01',
    createRandomSeed: jest.fn(() => randomSeed),
    normalizeDifficulty: jest.fn(value => value),
    normalizeChallengeSelection: jest.fn(value => [...value]),
    syncSeedState: jest.fn(),
    createDefaultPlayer: jest.fn(() => ({ items: {} })),
    grantTutorialResources: jest.fn(),
    isMultiplayerMode: jest.fn(() => false),
    resetMultiplayerState: jest.fn(),
    invalidateRunStatCaches: jest.fn(),
    applyRunChallengeStartModifiers: jest.fn(),
    resetScene: jest.fn(),
    window,
    requestAnimationFrame: jest.fn(),
  };
  const dependencyNames = Object.keys(dependencies);
  const startGame = new Function(
    ...dependencyNames,
    `${extractFunction(gameStateSource, 'startGame')}; return startGame;`,
  )(...dependencyNames.map(name => dependencies[name]));

  return {
    Neo,
    startGame,
    tutorialStart,
    resetTutorialState,
    consumeReplayTutorialRequest,
    startCompetitive,
    createRandomSeed: dependencies.createRandomSeed,
  };
}

function createCompetitiveStartHarness({ cachedSeed = 'SERVER-SEED', fetchedSeed = 'FETCHED-SERVER-SEED' } = {}) {
  const tutorialStart = jest.fn();
  const resetTutorialState = jest.fn(active => {
    Neo.tutorialState = { active };
  });
  const Neo = {
    gameMode: 'competitive',
    chosenCharacter: 'thorn_knight',
    _competitiveSeed: cachedSeed,
    ui: { seed: { value: 'PLAYER-SEED-MUST-NOT-WIN' } },
    tutorialState: { active: true },
    tutorialController: { start: tutorialStart },
    resetRunUnlocks: jest.fn(),
    generateFloor: jest.fn(),
    persistMetaSoon: jest.fn(),
    scheduleRunSave: jest.fn(),
    loop: jest.fn(),
    loopStarted: true,
  };
  const dependencies = {
    Neo,
    refreshCompetitiveSeed: jest.fn(async () => fetchedSeed),
    setCompetitiveServerStatus: jest.fn(),
    setGameState: jest.fn(state => { Neo.gameState = state; }),
    syncSeedState: jest.fn(),
    window: { achievementManager: { resetRunCounters: jest.fn() } },
    invalidateRunStatCaches: jest.fn(),
    createDefaultPlayer: jest.fn(() => ({ items: {} })),
    resetMultiplayerState: jest.fn(),
    resetScene: jest.fn(),
    resetTutorialState,
    requestAnimationFrame: jest.fn(),
  };
  const dependencyNames = Object.keys(dependencies);
  const startCompetitive = new Function(
    ...dependencyNames,
    `${extractFunction(gameStateSource, 'startCompetitive')}; return startCompetitive;`,
  )(...dependencyNames.map(name => dependencies[name]));

  return {
    Neo,
    startCompetitive,
    tutorialStart,
    resetTutorialState,
    refreshCompetitiveSeed: dependencies.refreshCompetitiveSeed,
  };
}

describe('run start mode and seed routing', () => {
  test.each([
    { tutorialCompleted: false, tutorialVersion: 0 },
    { tutorialCompleted: true, tutorialVersion: 2 },
    { tutorialCompleted: true, tutorialVersion: 999 },
  ])('ordinary New Game uses the entered seed and stays out of tutorial mode: %p', async meta => {
    const harness = createNormalStartHarness({ seed: 'MY-NEW-GAME-SEED', ...meta });

    await harness.startGame(false);

    expect(harness.Neo.baseSeedStr).toBe('MY-NEW-GAME-SEED');
    expect(harness.resetTutorialState).toHaveBeenCalledWith(false);
    expect(harness.tutorialStart).not.toHaveBeenCalled();
    expect(harness.Neo.selectedChallenges).toEqual(['storm']);
  });

  test('ordinary New Game generates a seed when the seed field is blank', async () => {
    const harness = createNormalStartHarness({ seed: '   ', randomSeed: 'GENERATED-NORMAL-SEED' });

    await harness.startGame(false);

    expect(harness.createRandomSeed).toHaveBeenCalledTimes(1);
    expect(harness.Neo.baseSeedStr).toBe('GENERATED-NORMAL-SEED');
    expect(harness.tutorialStart).not.toHaveBeenCalled();
  });

  test('explicit tutorial opt-in alone selects the fixed tutorial seed and starts the tutorial', async () => {
    const harness = createNormalStartHarness({
      seed: 'PLAYER-SEED-MUST-NOT-WIN',
      replayTutorial: true,
      tutorialCompleted: true,
      tutorialVersion: 999,
    });

    await harness.startGame(false);

    expect(harness.Neo.baseSeedStr).toBe('NEONYKE-TUTORIAL-01');
    expect(harness.resetTutorialState).toHaveBeenCalledWith(true);
    expect(harness.tutorialStart).toHaveBeenCalledTimes(1);
    expect(harness.Neo.selectedChallenges).toEqual([]);
  });

  test('Competitive dispatch bypasses normal seed and tutorial initialization', async () => {
    const harness = createNormalStartHarness({ seed: 'NORMAL-SEED', replayTutorial: true });
    harness.Neo.gameMode = 'competitive';

    await harness.startGame(false);

    expect(harness.startCompetitive).toHaveBeenCalledTimes(1);
    expect(harness.consumeReplayTutorialRequest).not.toHaveBeenCalled();
    expect(harness.resetTutorialState).not.toHaveBeenCalled();
    expect(harness.tutorialStart).not.toHaveBeenCalled();
    expect(harness.Neo.baseSeedStr).toBeUndefined();
  });

  test('Competitive uses the cached server seed and always disables tutorial state', async () => {
    const harness = createCompetitiveStartHarness({ cachedSeed: 'WEEKLY-SERVER-SEED' });

    await harness.startCompetitive();

    expect(harness.Neo.baseSeedStr).toBe('WEEKLY-SERVER-SEED');
    expect(harness.Neo.baseSeedStr).not.toBe('PLAYER-SEED-MUST-NOT-WIN');
    expect(harness.Neo.selectedDifficulty).toBe('hard');
    expect(harness.Neo.selectedChallenges).toEqual([]);
    expect(harness.resetTutorialState).toHaveBeenCalledWith(false);
    expect(harness.tutorialStart).not.toHaveBeenCalled();
    expect(harness.refreshCompetitiveSeed).not.toHaveBeenCalled();
    expect(harness.resetTutorialState.mock.invocationCallOrder[0])
      .toBeLessThan(harness.Neo.generateFloor.mock.invocationCallOrder[0]);
  });

  test('Competitive fetches and uses the server seed when none is cached', async () => {
    const harness = createCompetitiveStartHarness({ cachedSeed: null, fetchedSeed: 'FRESH-SERVER-SEED' });

    await harness.startCompetitive();

    expect(harness.refreshCompetitiveSeed).toHaveBeenCalledWith({ force: true });
    expect(harness.Neo.baseSeedStr).toBe('FRESH-SERVER-SEED');
    expect(harness.resetTutorialState).toHaveBeenCalledWith(false);
    expect(harness.tutorialStart).not.toHaveBeenCalled();
  });
});
