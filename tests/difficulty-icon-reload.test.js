const fs = require('node:fs');
const path = require('node:path');

function extractAsyncFunction(source, functionName) {
  const marker = `export async function ${functionName}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }

  return source.slice(start, end + 1).replace('export ', '');
}

describe('difficulty icon reload', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/core/perf.js'), 'utf8');

  test('draws the HUD icon after restoring the saved difficulty', async () => {
    const drawnDifficulties = [];
    const uiController = {
      setState: jest.fn(),
      setHudUpdateHook: jest.fn(),
    };
    const Neo = {
      gameState: 'menu',
      createUIController: () => uiController,
      createSaveStore: () => ({}),
      createItemRegistry: () => ({}),
      gameStateManager: null,
      createDefaultMeta: () => ({ selectedDifficulty: 'easy' }),
      preloadCharacterSheets: jest.fn(),
      buildSpriteAtlas: () => ({}),
      buildEnvironmentTileAtlas: () => ({}),
      bindCanvasRecovery: jest.fn(),
      bindInput: jest.fn(),
      bindPanelInput: jest.fn(),
      drawActionIcons: jest.fn(),
      selectedDifficulty: 'easy',
      loadPersistedState: jest.fn(async () => {
        Neo.selectedDifficulty = 'hard';
      }),
      drawDifficultyIcons: jest.fn(() => {
        drawnDifficulties.push(Neo.selectedDifficulty);
      }),
      updateCharacterSelectionUI: jest.fn(),
      refreshMenuState: jest.fn(),
      draw: jest.fn(),
    };
    const window = {};
    const boot = new Function(
      'Neo',
      'window',
      'installPerfDebugApi',
      'perfStart',
      'perfEnd',
      'hideBootLoading',
      `${extractAsyncFunction(source, 'boot')}; return boot;`,
    )(Neo, window, jest.fn(), jest.fn(), jest.fn(), jest.fn());

    await boot();

    expect(drawnDifficulties).toEqual(['hard']);
    expect(Neo.loadPersistedState.mock.invocationCallOrder[0])
      .toBeLessThan(Neo.drawDifficultyIcons.mock.invocationCallOrder[0]);
  });
});
