/**
 * NEO NYKE — Gamepad / Controller Support
 * Reads the Web Gamepad API and exposes window.NeoGamepad[0..1].
 * Each slot has the same shape as window.NeoTouch so game.js can
 * apply the same injection logic.
 *
 * Standard mapping (Xbox / PS / generic):
 *   Left stick      → move
 *   Right stick     → aim (overrides auto-aim when pushed)
 *   Buttons         → configurable in Settings → Controls
 *   D-Pad           → move (alternate)
 */
(function () {
  'use strict';

  const DEAD_ZONE = 0.18;

  function makeSlot() {
    return {
      moveX: 0, moveY: 0,
      aimX: 0,  aimY: 0,
      hasAim: false,
      lastAimX: 1, lastAimY: 0,
      slash: false, laser: false, smash: false,
      dash: false, ascend: false,
      start: false,
      active: false,
      queuedActions: {},
      buttonStates: [],
      // P2 keys mirrored for updatePlayer2
      p2MeleeHeld: false,
      p2DashHeld: false,
    };
  }

  window.NeoGamepad = [makeSlot(), makeSlot(), makeSlot(), makeSlot()];
  window.NeoGamepad.consumeAction = function consumeAction(slotIndex, action) {
    const slot = window.NeoGamepad[slotIndex];
    if (!slot?.queuedActions?.[action]) return false;
    delete slot.queuedActions[action];
    if (action === 'pause') slot.start = false;
    return true;
  };

  function apply(dead, v) { return Math.abs(v) < dead ? 0 : v; }

  function handleImmediateAction(slotIndex, action) {
    if (slotIndex !== 0) return false;
    const game = window._neoGame;
    const state = window.Neo?.gameState;
    const inventoryPanel = window.Neo?.ui?.invPanel;
    const inventoryOpen = !!inventoryPanel && !inventoryPanel.classList.contains('hidden');
    if (action === 'inventory' && (state === 'play' || inventoryOpen)) {
      game?.toggleInventoryPanel?.();
      return true;
    }
    if (action === 'pause') {
      if (inventoryOpen) game?.toggleInventoryPanel?.();
      else if (state === 'play') game?.pauseGame?.();
      else if (state === 'pause') game?.resumeGame?.();
      return true;
    }
    return false;
  }

  function readGamepad(gp, slot, slotIndex) {
    if (!gp || !gp.connected) {
      slot.active = false;
      slot.moveX = slot.moveY = 0;
      slot.slash = slot.laser = slot.smash = slot.dash = slot.ascend = false;
      slot.buttonStates = [];
      slot.queuedActions = {};
      return;
    }
    const b = gp.buttons;
    const ax = gp.axes;

    // Left stick
    const lx = apply(DEAD_ZONE, ax[0] ?? 0);
    const ly = apply(DEAD_ZONE, ax[1] ?? 0);
    // D-pad (axes 6/7 on some browsers, buttons 12-15 on others)
    const dpLeft  = (b[14]?.pressed) || (ax[6] < -0.5);
    const dpRight = (b[15]?.pressed) || (ax[6] >  0.5);
    const dpUp    = (b[12]?.pressed) || (ax[7] < -0.5);
    const dpDown  = (b[13]?.pressed) || (ax[7] >  0.5);

    slot.moveX = lx || (dpRight ? 1 : dpLeft  ? -1 : 0);
    slot.moveY = ly || (dpDown  ? 1 : dpUp    ? -1 : 0);

    // Right stick for aim
    const rx = apply(DEAD_ZONE, ax[2] ?? 0);
    const ry = apply(DEAD_ZONE, ax[3] ?? 0);
    slot.hasAim = Math.hypot(rx, ry) > DEAD_ZONE;
    if (slot.hasAim) {
      slot.aimX = rx; slot.aimY = ry;
      slot.lastAimX = rx; slot.lastAimY = ry;
    } else if (Math.hypot(slot.moveX, slot.moveY) > DEAD_ZONE) {
      slot.lastAimX = slot.moveX;
      slot.lastAimY = slot.moveY;
    }

    const defaults = {
      0:'slash', 1:'dash', 2:'laser', 3:'smash',
      4:'inventory', 5:'dash', 6:'activateAll', 7:'interact',
      8:'inventory', 9:'pause', 10:'ascend', 11:'interact',
    };
    const configured = window.NeoSettings?.getGamepadBindings?.() || defaults;
    slot.slash = slot.laser = slot.smash = slot.dash = slot.ascend = false;
    slot.start = false;
    for (let index = 0; index <= 11; index += 1) {
      const pressed = !!b[index]?.pressed;
      const action = String(configured[index] || defaults[index] || 'none');
      if (['slash', 'laser', 'smash', 'dash', 'ascend'].includes(action) && pressed) slot[action] = true;
      if (pressed && !slot.buttonStates[index] && action !== 'none' && !handleImmediateAction(slotIndex, action)) {
        slot.queuedActions[action] = true;
      }
      slot.buttonStates[index] = pressed;
    }
    slot.start = !!slot.queuedActions.pause;

    // P2 aliases (used by updatePlayer2)
    slot.p2MeleeHeld = slot.slash;
    slot.p2DashHeld  = slot.dash;

    slot.active = true; // stay active once a gamepad is connected and reporting
  }

  function pollGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    readGamepad(pads[0], window.NeoGamepad[0], 0);
    readGamepad(pads[1], window.NeoGamepad[1], 1);
    readGamepad(pads[2], window.NeoGamepad[2], 2);
    readGamepad(pads[3], window.NeoGamepad[3], 3);
    requestAnimationFrame(pollGamepads);
  }

  window.addEventListener('gamepadconnected', e => {
    console.log(`[NeoGamepad] Controller ${e.gamepad.index} connected: ${e.gamepad.id}`);
    if (e.gamepad.index < 4) window.NeoGamepad[e.gamepad.index].active = true;
  });
  window.addEventListener('gamepaddisconnected', e => {
    console.log(`[NeoGamepad] Controller ${e.gamepad.index} disconnected`);
  });

  requestAnimationFrame(pollGamepads);
})();
