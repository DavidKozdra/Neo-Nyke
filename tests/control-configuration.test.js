const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function extractFunction(source, functionName, dependencies = {}) {
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
  const declaration = source.slice(start, end + 1);
  return new Function(...Object.keys(dependencies), `${declaration}; return ${functionName};`)(
    ...Object.values(dependencies),
  );
}

describe('control configuration', () => {
  const settings = read('js/ui/settings-ui.js');
  const touch = read('js/touchControls.js');
  const gamepad = read('js/gamepadControls.js');
  const update = read('js/core/update.js');
  const html = read('index.html');

  test('persists an explicit control profile with a device-derived fallback', () => {
    expect(settings).toContain("if (!controlMode) controlMode = isTouchDevice() ? 'mobile' : 'desktop'");
    expect(settings).toContain("if (touchControlsEnabled === null) touchControlsEnabled = controlMode === 'mobile'");
    expect(settings).toContain('bindings, touchBindings, gamepadBindings, controlMode, touchControlsEnabled');
    expect(settings).toContain('isTouchControlsEnabled: () => touchControlsEnabled');
  });

  test('live prompt mode follows the most recently used device, then the selected profile', () => {
    const resolveMode = (window, touchControlsEnabled, controlMode, lastInputMode = '') => extractFunction(
      settings,
      'getEffectiveInputMode',
      { window, touchControlsEnabled, controlMode, lastInputMode },
    )();

    const mixed = { NeoTouch: { active: true }, NeoGamepad: { 0: { active: true } } };
    expect(resolveMode(mixed, true, 'mobile', 'keyboard')).toBe('keyboard');
    expect(resolveMode(mixed, true, 'mobile', 'touch')).toBe('touch');
    expect(resolveMode(mixed, true, 'mobile', 'gamepad')).toBe('gamepad');
    expect(resolveMode({ NeoGamepad: { 0: { active: true } } }, false, 'mobile')).toBe('gamepad');
    expect(resolveMode({ NeoGamepad: { 0: { active: false }, getConnectedPads: () => [{ index: 0 }] } }, false, 'mobile')).toBe('touch');
    expect(resolveMode({}, false, 'mobile')).toBe('touch');
    expect(resolveMode({}, false, 'desktop')).toBe('keyboard');
  });

  test('live prompt labels honor keyboard, mobile, and controller remaps', () => {
    const getActionBindingLabel = extractFunction(settings, 'getActionBindingLabel', {
      touchBindings: { touchA: 'slash', touchY: 'laser' },
      gamepadBindings: { 2: 'slash', 7: 'laser' },
      TOUCH_BUTTON_NAMES: { touchA: 'A BUTTON', touchY: 'Y BUTTON' },
      GAMEPAD_BUTTON_NAMES: { 2: 'X', 7: 'RT' },
      keyLabel: value => String(value || '').toUpperCase(),
      bindings: { laser: 'q' },
      getEffectiveInputMode: () => 'keyboard',
    });

    expect(getActionBindingLabel('laser', 'RMB', 'keyboard')).toBe('Q');
    expect(getActionBindingLabel('laser', 'RMB', 'touch')).toBe('Y BUTTON');
    expect(getActionBindingLabel('laser', 'RMB', 'gamepad')).toBe('RT');
  });

  test('ladder tutorial and HUD use climb/exit on mobile and controller', () => {
    const tutorial = read('js/ui/tutorial-controller.js');
    const forMode = mode => extractFunction(tutorial, 'getLadderLabel', {
      getInputMode: () => mode,
      getActionLabel: (action, fallback) => {
        if (action === 'ascend' && !fallback) {
          if (mode === 'touch') return 'X BUTTON';
          if (mode === 'gamepad') return 'L3';
        }
        return `${action}:${fallback}`;
      },
    })();

    expect(forMode('keyboard')).toBe('ascend:SPACE');
    expect(forMode('touch')).toBe('X BUTTON / TAP LADDER');
    expect(forMode('gamepad')).toBe('L3');

    const gameState = read('js/core/game-state.js');
    const getHudHint = mode => extractFunction(gameState, 'getLadderControlHint', {
      window: { NeoSettings: {
        getEffectiveInputMode: () => mode,
        getActionBindingLabel: (action, fallback, inputMode) => {
          if (action === 'ascend' && !fallback) return inputMode === 'touch' ? 'X BUTTON' : 'L3';
          return `${inputMode}:${action}:${fallback}`;
        },
      } },
      getAscendControlHint: () => 'touch fallback',
      hasTouchControls: () => false,
      getControlHint: (action, fallback) => `${action}:${fallback}`,
    })();
    expect(getHudHint('keyboard')).toBe('ascend:space');
    expect(getHudHint('touch')).toBe('X BUTTON');
    expect(getHudHint('gamepad')).toBe('L3');
  });

  test('beam struggle prompt uses the active laser binding', () => {
    const environment = read('js/draw/environment.js');
    expect(environment).toContain("getActiveControlHint?.('laser', 'rmb')");
    expect(environment).toContain("getActionBindingLabel?.('laser', 'rmb')");
  });

  test('the touch toggle controls the overlay independently of desktop/mobile profile', () => {
    expect(touch).not.toContain("saved?.controlMode === 'desktop'");
    expect(touch).toContain('saved?.touchControlsEnabled === false');
    expect(touch).toContain('touchControlsEnabled() && !hasOpenBlockingPanel()');
    expect(touch).toContain('setNTActive();');
    expect(html.indexOf('id="touchControlsEnabled"')).toBeLessThan(html.indexOf('class="controls-desktop-section"'));
  });

  test('gamepad mappings cover handheld utility actions and tool slots', () => {
    expect(gamepad).toContain("4:'inventory'");
    expect(gamepad).toContain("7:'interact'");
    expect(gamepad).toContain("9:'pause'");
    expect(gamepad).toContain("action === 'inventory' && (state === 'play' || inventoryOpen)");
    expect(update).toContain("_gpConsume('activateAll')");
    expect(update).toContain('`tool${_slotIndex}`');
  });

  test('gamepad remaps queue tool actions and handle inventory while paused', () => {
    let nextFrame = null;
    const toggleInventoryPanel = jest.fn();
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
    buttons[0].pressed = true;
    buttons[4].pressed = true;
    const inventoryPanel = { classList: { contains: () => false } };
    const window = {
      Neo: { gameState: 'pause', ui: { invPanel: inventoryPanel } },
      NeoSettings: {
        getGamepadBindings: () => ({
          0: 'tool3', 1: 'dash', 2: 'laser', 3: 'smash', 4: 'inventory',
          5: 'dash', 6: 'activateAll', 7: 'interact', 8: 'inventory',
          9: 'pause', 10: 'ascend', 11: 'interact',
        }),
      },
      _neoGame: { toggleInventoryPanel },
      addEventListener: jest.fn(),
    };
    const context = {
      window,
      navigator: {
        getGamepads: () => [{ connected: true, buttons, axes: [0, 0, 0, 0, 0, 0, 0, 0] }],
      },
      requestAnimationFrame: callback => { nextFrame = callback; },
      console,
    };

    vm.runInNewContext(gamepad, context);
    nextFrame();

    expect(window.NeoGamepad.consumeAction(0, 'tool3')).toBe(true);
    expect(toggleInventoryPanel).toHaveBeenCalledTimes(1);
    expect(window.NeoGamepad.consumeAction(0, 'inventory')).toBe(false);
  });

  test('gamepad analog buttons count as presses', () => {
    let nextFrame = null;
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[7].value = 0.85;
    const window = {
      Neo: { gameState: 'play', ui: {} },
      NeoSettings: {
        getGamepadBindings: () => ({
          0: 'slash', 1: 'dash', 2: 'laser', 3: 'smash', 4: 'inventory',
          5: 'dash', 6: 'activateAll', 7: 'interact', 8: 'inventory',
          9: 'pause', 10: 'ascend', 11: 'interact',
        }),
      },
      _neoGame: {},
      addEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
    const context = {
      window,
      navigator: {
        getGamepads: () => [{ connected: true, id: 'Analog pad', buttons, axes: [0, 0, 0, 0, 0, 0, 0, 0] }],
      },
      requestAnimationFrame: callback => { nextFrame = callback; },
      console,
    };

    vm.runInNewContext(gamepad, context);
    nextFrame();

    expect(window.NeoGamepad.consumeAction(0, 'interact')).toBe(true);
    expect(window.NeoGamepad[0].buttonValues[7]).toBe(0.85);
  });

  test('gamepad menu navigation does not leave gameplay actions queued', () => {
    let nextFrame = null;
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[0].pressed = true;
    const focusTarget = {
      disabled: false,
      getAttribute: () => null,
      closest: () => null,
      getClientRects: () => [{ width: 10, height: 10 }],
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
      focus: jest.fn(),
      click: jest.fn(),
      matches: () => false,
    };
    const modal = {
      disabled: false,
      getAttribute: () => null,
      closest: () => null,
      getClientRects: () => [{ width: 100, height: 100 }],
      querySelectorAll: () => [focusTarget],
      querySelector: () => null,
    };
    const body = { querySelectorAll: () => [focusTarget] };
    const document = {
      body,
      activeElement: body,
      querySelector: () => modal,
      querySelectorAll: () => [modal],
    };
    const window = {
      Neo: { gameState: 'menu', ui: {} },
      NeoSettings: {
        getGamepadBindings: () => ({
          0: 'slash', 1: 'dash', 2: 'laser', 3: 'smash', 4: 'inventory',
          5: 'dash', 6: 'activateAll', 7: 'interact', 8: 'inventory',
          9: 'pause', 10: 'ascend', 11: 'interact',
        }),
      },
      _neoGame: {},
      addEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
    const context = {
      window,
      document,
      navigator: {
        getGamepads: () => [{ connected: true, id: 'Menu pad', buttons, axes: [0, 0, 0, 0, 0, 0, 0, 0] }],
      },
      requestAnimationFrame: callback => { nextFrame = callback; },
      console,
    };

    vm.runInNewContext(gamepad, context);
    nextFrame();

    expect(window.NeoGamepad.consumeAction(0, 'slash')).toBe(false);
    expect(focusTarget.focus).toHaveBeenCalled();
  });

  test('a remapped controller pause press is handled exactly once', () => {
    let nextFrame = null;
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[9].pressed = true;
    const pauseGame = jest.fn(() => { window.Neo.gameState = 'pause'; });
    const resumeGame = jest.fn(() => { window.Neo.gameState = 'play'; });
    const window = {
      Neo: { gameState: 'play', ui: {} },
      NeoSettings: {
        getGamepadBindings: () => ({
          0: 'slash', 1: 'dash', 2: 'laser', 3: 'smash', 4: 'inventory',
          5: 'dash', 6: 'activateAll', 7: 'interact', 8: 'inventory',
          9: 'pause', 10: 'ascend', 11: 'interact',
        }),
      },
      _neoGame: { pauseGame, resumeGame },
      addEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
    const context = {
      window,
      document: {
        body: {},
        activeElement: null,
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
      },
      navigator: {
        getGamepads: () => [{ connected: true, id: 'Pause pad', buttons, axes: [0, 0, 0, 0, 0, 0, 0, 0] }],
      },
      requestAnimationFrame: callback => { nextFrame = callback; },
      console,
    };

    vm.runInNewContext(gamepad, context);
    nextFrame();

    expect(pauseGame).toHaveBeenCalledTimes(1);
    expect(resumeGame).not.toHaveBeenCalled();
    expect(window.Neo.gameState).toBe('pause');
  });
});
