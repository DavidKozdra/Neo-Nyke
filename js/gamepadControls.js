/**
 * NEO NYKE — Gamepad / Controller Support
 * Reads the Web Gamepad API and exposes window.NeoGamepad[0..3].
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
  const BUTTON_THRESHOLD = 0.5;
  const NAV_INITIAL_DELAY = 280;
  const NAV_REPEAT_DELAY = 140;
  const NAV_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const DEFAULT_GAMEPAD_BINDINGS = {
    0:'slash', 1:'dash', 2:'laser', 3:'smash',
    4:'inventory', 5:'dash', 6:'activateAll', 7:'interact',
    8:'inventory', 9:'pause', 10:'ascend', 11:'interact',
  };

  function makeSlot() {
    return {
      index: -1,
      id: '',
      mapping: '',
      connected: false,
      moveX: 0, moveY: 0,
      aimX: 0,  aimY: 0,
      hasAim: false,
      lastAimX: 1, lastAimY: 0,
      slash: false, laser: false, smash: false,
      dash: false, ascend: false,
      start: false,
      active: false,
      lastInputAt: 0,
      queuedActions: {},
      nav: { x: 0, y: 0, nextAt: 0 },
      buttonStates: [],
      buttonValues: [],
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
  window.NeoGamepad.clearQueuedActions = function clearQueuedActions(slotIndex = null) {
    const slots = slotIndex === null ? window.NeoGamepad : [window.NeoGamepad[slotIndex]];
    slots.forEach(slot => { if (slot) slot.queuedActions = {}; });
  };
  window.NeoGamepad.getConnectedPads = function getConnectedPads() {
    return window.NeoGamepad
      .filter(slot => slot?.connected)
      .map(slot => ({ index: slot.index, id: slot.id, mapping: slot.mapping }));
  };

  function applyAxis(v) {
    const n = Number(v || 0);
    return Math.abs(n) < DEAD_ZONE ? 0 : n;
  }

  function applyRadialDeadZone(x, y) {
    const nx = Number(x || 0);
    const ny = Number(y || 0);
    const mag = Math.hypot(nx, ny);
    if (mag < DEAD_ZONE) return [0, 0];
    const scaled = Math.min(1, (mag - DEAD_ZONE) / (1 - DEAD_ZONE));
    return [(nx / mag) * scaled, (ny / mag) * scaled];
  }

  function isButtonPressed(button) {
    return !!button?.pressed || Number(button?.value || 0) > BUTTON_THRESHOLD;
  }

  function buttonValue(button) {
    return Math.max(Number(button?.value || 0), button?.pressed ? 1 : 0);
  }

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function emitGamepadChange() {
    try {
      window.dispatchEvent?.(new CustomEvent('neo:gamepad-changed'));
    } catch {}
  }

  function hasOpenBlockingPanel() {
    return !!document.querySelector('.modal-backdrop:not(.hidden), .overlay:not(.hidden), .panel:not(.hidden), [role="dialog"]:not(.hidden)');
  }

  function isVisible(el) {
    if (!el || el.closest('[aria-hidden="true"], .hidden')) return false;
    const rects = el.getClientRects?.();
    return !rects || rects.length > 0;
  }

  function getScope() {
    if (typeof document === 'undefined') return null;
    const activeModal = Array.from(document.querySelectorAll('.modal-backdrop:not(.hidden), .overlay:not(.hidden), [role="dialog"]:not(.hidden)'))
      .find(isVisible);
    if (activeModal) return activeModal;
    return document.body;
  }

  function getFocusable(scope = getScope()) {
    if (!scope) return [];
    return Array.from(scope.querySelectorAll(NAV_SELECTOR))
      .filter(el => isVisible(el) && !el.disabled && el.getAttribute('aria-hidden') !== 'true');
  }

  function focusFirst(scope = getScope()) {
    const focusable = getFocusable(scope);
    if (!focusable.length) return false;
    if (!focusable.includes(document.activeElement)) {
      focusable[0].focus({ preventScroll: true });
      return true;
    }
    return false;
  }

  function moveFocus(dx, dy) {
    const scope = getScope();
    const focusable = getFocusable(scope);
    if (!focusable.length) return false;
    const current = focusable.includes(document.activeElement) ? document.activeElement : null;
    if (!current) {
      focusable[0].focus({ preventScroll: true });
      return true;
    }
    const currentRect = current.getBoundingClientRect();
    const currentCx = currentRect.left + currentRect.width / 2;
    const currentCy = currentRect.top + currentRect.height / 2;
    let best = null;
    let bestScore = Infinity;
    focusable.forEach(el => {
      if (el === current) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const vx = cx - currentCx;
      const vy = cy - currentCy;
      if (dx && Math.sign(vx) !== Math.sign(dx)) return;
      if (dy && Math.sign(vy) !== Math.sign(dy)) return;
      const primary = dx ? Math.abs(vx) : Math.abs(vy);
      const secondary = dx ? Math.abs(vy) : Math.abs(vx);
      const score = primary * 3 + secondary;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    });
    if (!best) {
      const currentIndex = focusable.indexOf(current);
      const delta = dx > 0 || dy > 0 ? 1 : -1;
      best = focusable[(currentIndex + delta + focusable.length) % focusable.length];
    }
    best?.focus({ preventScroll: true });
    return !!best;
  }

  function clickFocused() {
    if (typeof document === 'undefined') return false;
    const el = document.activeElement;
    if (!el || el === document.body) return focusFirst();
    if (el.matches?.('select')) return false;
    el.click?.();
    return true;
  }

  function backOrCancel() {
    if (typeof document === 'undefined') return false;
    const scope = getScope();
    const candidates = [
      '#settingsClose', '.modal-close', '[data-close]', '[aria-label="Close"]',
      '#pauseResume', '#scrollControlCancel', '#voucherCancel', '#extraBatteryLater',
      '.panel-close', '.credits-close',
    ];
    for (const selector of candidates) {
      const el = scope?.querySelector?.(selector);
      if (isVisible(el) && !el.disabled) {
        el.click?.();
        return true;
      }
    }
    if (window.Neo?.gameState === 'pause') {
      window._neoGame?.resumeGame?.();
      return true;
    }
    return false;
  }

  function handleNavigation(slot, pressedNow) {
    if (typeof document === 'undefined') return;
    if (!hasOpenBlockingPanel() && window.Neo?.gameState === 'play') return;

    const navX = Math.abs(slot.moveX) > 0.55 ? Math.sign(slot.moveX) : 0;
    const navY = Math.abs(slot.moveY) > 0.55 ? Math.sign(slot.moveY) : 0;
    const now = nowMs();
    if (navX || navY) {
      const changed = navX !== slot.nav.x || navY !== slot.nav.y;
      if (changed || now >= slot.nav.nextAt) {
        moveFocus(navX, navY);
        slot.nav.x = navX;
        slot.nav.y = navY;
        slot.nav.nextAt = now + (changed ? NAV_INITIAL_DELAY : NAV_REPEAT_DELAY);
      }
    } else {
      slot.nav.x = 0;
      slot.nav.y = 0;
      slot.nav.nextAt = 0;
    }

    if (pressedNow[0]) clickFocused();
    if (pressedNow[1]) backOrCancel();
    if (pressedNow[9]) {
      if (window.Neo?.gameState === 'pause') window._neoGame?.resumeGame?.();
      else backOrCancel();
    }
  }

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
      const wasConnected = slot.connected;
      slot.connected = false;
      slot.active = false;
      slot.moveX = slot.moveY = 0;
      slot.slash = slot.laser = slot.smash = slot.dash = slot.ascend = false;
      slot.buttonStates = [];
      slot.buttonValues = [];
      slot.queuedActions = {};
      if (wasConnected) emitGamepadChange();
      return;
    }
    const wasConnected = slot.connected;
    slot.index = gp.index ?? slotIndex;
    slot.id = gp.id || `Gamepad ${slot.index + 1}`;
    slot.mapping = gp.mapping || '';
    slot.connected = true;
    if (!wasConnected) emitGamepadChange();
    const b = gp.buttons;
    const ax = gp.axes;

    // Left stick
    let [lx, ly] = applyRadialDeadZone(ax[0] ?? 0, ax[1] ?? 0);
    // D-pad (axes 6/7 on some browsers, buttons 12-15 on others)
    const dpLeft  = isButtonPressed(b[14]) || (ax[6] < -0.5);
    const dpRight = isButtonPressed(b[15]) || (ax[6] >  0.5);
    const dpUp    = isButtonPressed(b[12]) || (ax[7] < -0.5);
    const dpDown  = isButtonPressed(b[13]) || (ax[7] >  0.5);

    const dpadX = dpRight ? 1 : dpLeft ? -1 : 0;
    const dpadY = dpDown ? 1 : dpUp ? -1 : 0;
    if (dpadX || dpadY) {
      [lx, ly] = applyRadialDeadZone(dpadX, dpadY);
    }
    slot.moveX = lx;
    slot.moveY = ly;

    // Right stick for aim
    const [rx, ry] = applyRadialDeadZone(ax[2] ?? 0, ax[3] ?? 0);
    slot.hasAim = Math.hypot(rx, ry) > DEAD_ZONE;
    if (slot.hasAim) {
      slot.aimX = rx; slot.aimY = ry;
      slot.lastAimX = rx; slot.lastAimY = ry;
    } else if (Math.hypot(slot.moveX, slot.moveY) > DEAD_ZONE) {
      slot.lastAimX = slot.moveX;
      slot.lastAimY = slot.moveY;
    }

    const configured = window.NeoSettings?.getGamepadBindings?.() || DEFAULT_GAMEPAD_BINDINGS;
    const uiNavigationMode = typeof document !== 'undefined' && (hasOpenBlockingPanel() || window.Neo?.gameState !== 'play');
    slot.slash = slot.laser = slot.smash = slot.dash = slot.ascend = false;
    slot.start = false;
    const pressedNow = {};
    for (let index = 0; index <= 11; index += 1) {
      const pressed = isButtonPressed(b[index]);
      const value = buttonValue(b[index]);
      pressedNow[index] = pressed && !slot.buttonStates[index];
      const action = String(configured[index] || DEFAULT_GAMEPAD_BINDINGS[index] || 'none');
      if (['slash', 'laser', 'smash', 'dash', 'ascend'].includes(action) && pressed) slot[action] = true;
      if (pressed && !slot.buttonStates[index] && action !== 'none' && !handleImmediateAction(slotIndex, action) && !uiNavigationMode) {
        slot.queuedActions[action] = true;
      }
      slot.buttonStates[index] = pressed;
      slot.buttonValues[index] = value;
    }
    slot.start = !!slot.queuedActions.pause;
    handleNavigation(slot, pressedNow);

    // P2 aliases (used by updatePlayer2)
    slot.p2MeleeHeld = slot.slash;
    slot.p2DashHeld  = slot.dash;

    const hasInput = Math.hypot(slot.moveX, slot.moveY) > 0.05
      || Math.hypot(slot.aimX, slot.aimY) > 0.05
      || slot.buttonStates.some(Boolean)
      || Math.abs(applyAxis(ax[6] || 0)) > 0
      || Math.abs(applyAxis(ax[7] || 0)) > 0;
    if (hasInput) slot.lastInputAt = nowMs();
    slot.active = nowMs() - slot.lastInputAt < 5000;
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
    emitGamepadChange();
  });
  window.addEventListener('gamepaddisconnected', e => {
    console.log(`[NeoGamepad] Controller ${e.gamepad.index} disconnected`);
    emitGamepadChange();
  });

  requestAnimationFrame(pollGamepads);
})();
