const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
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
});
