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
      // Locked-in right-stick axis pair for non-standard pads (null = standard
      // or not yet resolved). See resolveRightStickAxes.
      rstickAxes: null,
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

  // --- Haptics / rumble ------------------------------------------------------
  // Chrome/Edge expose gamepad.vibrationActuator.playEffect('dual-rumble', …);
  // Firefox/Safari don't, so we feature-detect per call and degrade silently.
  // We don't store the Gamepad object on the slot (it goes stale between polls),
  // so rumble() re-reads the live pad from navigator.getGamepads() each call.
  //
  // A continuous trauma source (e.g. the bomb charge-up) calls addTrauma every
  // frame; firing a fresh playEffect 60×/sec stutters the motor and floods the
  // browser. We coalesce by ignoring new effects whose intensity doesn't beat
  // the one already playing on that pad, until it's nearly elapsed.
  const RUMBLE_MIN_MS = 40;
  const RUMBLE_MAX_MS = 1000;
  const rumbleActive = []; // per pad index: { until, strong } of the playing effect

  function rumbleEnabled() {
    // Respect the same accessibility toggle family as screen shake; default on.
    const access = window.NeoSettings?.getAccess?.();
    return !access || access.rumble !== false;
  }

  function livePad(index) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return pads[index] || null;
  }

  // Neo.rumble(strong, weak, ms[, padIndex]) — strong/weak are 0..1 motor
  // intensities (low-freq / high-freq), ms is duration. Returns true if an
  // effect was dispatched. padIndex defaults to player 1's pad (slot 0).
  function rumble(strong = 0.5, weak = strong, ms = 120, padIndex = 0) {
    if (!rumbleEnabled()) return false;
    const s = Math.max(0, Math.min(1, Number(strong) || 0));
    const w = Math.max(0, Math.min(1, Number(weak) || 0));
    if (s <= 0 && w <= 0) return false;
    const duration = Math.max(RUMBLE_MIN_MS, Math.min(RUMBLE_MAX_MS, Number(ms) || 0));
    const pad = livePad(padIndex);
    const actuator = pad?.vibrationActuator;
    if (!actuator?.playEffect) return false;

    const now = nowMs();
    const playing = rumbleActive[padIndex];
    // Let an in-flight, stronger pulse finish rather than restarting the motor,
    // unless it's basically over (last ~30ms) so back-to-back hits still land.
    if (playing && now < playing.until - 30 && playing.strong >= s) return false;

    try {
      actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration,
        strongMagnitude: s,
        weakMagnitude: w,
      });
      rumbleActive[padIndex] = { until: now + duration, strong: s };
      return true;
    } catch {
      return false;
    }
  }

  function stopRumble(padIndex = null) {
    const indices = padIndex === null ? [0, 1, 2, 3] : [padIndex];
    indices.forEach(i => {
      try { livePad(i)?.vibrationActuator?.reset?.(); } catch {}
      rumbleActive[i] = null;
    });
  }

  // gamepadControls.js loads before neo.js, so we only attach to NeoGamepad here;
  // update.js mirrors these onto Neo.rumble / Neo.stopRumble once Neo exists.
  window.NeoGamepad.rumble = rumble;
  window.NeoGamepad.stopRumble = stopRumble;

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

  // --- Non-standard mapping support -----------------------------------------
  // The Web Gamepad "standard" layout puts the right stick on axes 2 & 3 and
  // the face/shoulder/dpad buttons in fixed slots. Firefox (notably on macOS)
  // and many 8bitDo / DirectInput pads report `mapping: ""` with a different
  // axis/button order, so blindly reading standard indices makes the pad
  // "connect" but do nothing. When the mapping isn't standard we resolve the
  // right-stick axes heuristically and route the raw HID button order back
  // onto the standard button indices the rest of the code expects.

  // Common non-standard right-stick axis pairs, ordered by how often they show
  // up across browsers/pads. Firefox + 8bitDo typically lands on [2,3] or [2,5].
  const NONSTD_RSTICK_AXIS_CANDIDATES = [[2, 3], [3, 4], [2, 5], [5, 2], [4, 3]];

  // Maps the raw button order most DirectInput / 8bitDo pads expose under a
  // non-standard mapping onto the standard button indices used everywhere else.
  // Index = standard slot, value = raw button index (null when absent).
  const NONSTD_BUTTON_TO_STANDARD = [
    0, 1, 2, 3,   // A, B, X, Y (face)
    4, 5,         // L1, R1
    6, 7,         // L2, R2
    8, 9,         // select/back, start
    10, 11,       // L3, R3
    12, 13, 14, 15, // dpad up/down/left/right (often present on standard pads)
    16,           // home/guide
  ];

  function isStandardMapping(gp) {
    return (gp?.mapping || '') === 'standard';
  }

  // Resolve the right-stick axes for a non-standard pad. We prefer the first
  // candidate pair whose axes actually exist; once a pad shows movement on a
  // pair we lock it in for the session so a brief flick doesn't reassign it.
  function resolveRightStickAxes(slot, ax) {
    if (slot.rstickAxes) return slot.rstickAxes;
    for (const pair of NONSTD_RSTICK_AXIS_CANDIDATES) {
      const [a, b] = pair;
      if (ax.length > a && ax.length > b) {
        if (Math.hypot(Number(ax[a] || 0), Number(ax[b] || 0)) > DEAD_ZONE) {
          slot.rstickAxes = pair;
          return pair;
        }
      }
    }
    // Nothing pushed yet — fall back to the first existing candidate so aim
    // reads zero rather than colliding with the left stick (axes 0/1).
    for (const pair of NONSTD_RSTICK_AXIS_CANDIDATES) {
      if (ax.length > pair[0] && ax.length > pair[1]) return pair;
    }
    return [2, 3];
  }

  // Returns a button accessor `(standardIndex) => buttonLike` that translates
  // standard slots to raw HID slots for non-standard pads, and is the identity
  // for standard pads.
  function makeButtonReader(gp) {
    const b = gp.buttons || [];
    if (isStandardMapping(gp)) return index => b[index];
    return index => {
      const raw = NONSTD_BUTTON_TO_STANDARD[index];
      return raw == null ? undefined : b[raw];
    };
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

  function handleNavigation(slot, pressedNow, immediateHandled = {}) {
    if (typeof document === 'undefined') return;
    const mapper = document.getElementById?.('gamepadMapperOverlay');
    if (mapper && !mapper.classList.contains('hidden')) return;
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

    if (pressedNow[0] && !immediateHandled[0]) {
      if (window.Neo?.uiController?.isDialogueOpen?.()) window.Neo.uiController.advanceDialogue();
      else clickFocused();
    }
    if (pressedNow[1] && !immediateHandled[1]) backOrCancel();
    if (pressedNow[9] && !immediateHandled[9]) {
      if (window.Neo?.gameState === 'pause') window._neoGame?.resumeGame?.();
      else backOrCancel();
    }
  }

  function handleImmediateAction(slotIndex, action) {
    const game = window._neoGame;
    const state = window.Neo?.gameState;
    const networkView = window.Neo?.multiplayerGameView;
    const inventoryPanel = window.Neo?.ui?.invPanel;
    const inventoryOpen = !!inventoryPanel && !inventoryPanel.classList.contains('hidden');
    if (action === 'inventory' && (state === 'play' || inventoryOpen)) {
      game?.toggleInventoryPanel?.();
      return true;
    }
    if (action === 'pause') {
      if (inventoryOpen) game?.toggleInventoryPanel?.();
      else if (networkView?.active) networkView.togglePause?.();
      else if (state === 'play') game?.pauseGame?.();
      else if (state === 'pause') game?.resumeGame?.();
      return true;
    }
    if (slotIndex > 0 && (action === 'interact' || action === 'ascend') && state === 'play') {
      if (networkView?.active) networkView.interact?.();
      else game?.triggerInteract?.(slotIndex + 1);
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
      slot.rstickAxes = null;
      if (wasConnected) emitGamepadChange();
      return;
    }
    const wasConnected = slot.connected;
    slot.index = gp.index ?? slotIndex;
    slot.id = gp.id || `Gamepad ${slot.index + 1}`;
    slot.mapping = gp.mapping || '';
    slot.connected = true;
    if (!wasConnected) emitGamepadChange();
    const ax = gp.axes || [];
    const standard = isStandardMapping(gp);
    // Standard pads index buttons directly; non-standard pads go through the
    // raw→standard translation so the rest of readGamepad stays layout-agnostic.
    const readButton = makeButtonReader(gp);

    // Left stick (axes 0/1 in every layout we've seen)
    let [lx, ly] = applyRadialDeadZone(ax[0] ?? 0, ax[1] ?? 0);
    // D-pad (axes 6/7 on some browsers, buttons 12-15 on others)
    const dpLeft  = isButtonPressed(readButton(14)) || (ax[6] < -0.5);
    const dpRight = isButtonPressed(readButton(15)) || (ax[6] >  0.5);
    const dpUp    = isButtonPressed(readButton(12)) || (ax[7] < -0.5);
    const dpDown  = isButtonPressed(readButton(13)) || (ax[7] >  0.5);

    const dpadX = dpRight ? 1 : dpLeft ? -1 : 0;
    const dpadY = dpDown ? 1 : dpUp ? -1 : 0;
    if (dpadX || dpadY) {
      [lx, ly] = applyRadialDeadZone(dpadX, dpadY);
    }
    slot.moveX = lx;
    slot.moveY = ly;

    // Right stick for aim — axes 2/3 on standard pads, resolved heuristically
    // for non-standard ones (Firefox/8bitDo often shift it to 2/5 or 3/4).
    const [rax, ray] = standard ? [2, 3] : resolveRightStickAxes(slot, ax);
    const [rx, ry] = applyRadialDeadZone(ax[rax] ?? 0, ax[ray] ?? 0);
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
    const immediateHandled = {};
    for (let index = 0; index <= 11; index += 1) {
      const button = readButton(index);
      const pressed = isButtonPressed(button);
      const value = buttonValue(button);
      pressedNow[index] = pressed && !slot.buttonStates[index];
      const action = String(configured[index] || DEFAULT_GAMEPAD_BINDINGS[index] || 'none');
      if (['slash', 'laser', 'smash', 'dash', 'ascend'].includes(action) && pressed) slot[action] = true;
      if (pressed && !slot.buttonStates[index] && action !== 'none') {
        immediateHandled[index] = handleImmediateAction(slotIndex, action);
        if (!immediateHandled[index] && !uiNavigationMode) slot.queuedActions[action] = true;
      }
      slot.buttonStates[index] = pressed;
      slot.buttonValues[index] = value;
    }
    slot.start = !!slot.queuedActions.pause;
    handleNavigation(slot, pressedNow, immediateHandled);

    // P2 aliases (used by updatePlayer2)
    slot.p2MeleeHeld = slot.slash;
    slot.p2DashHeld  = slot.dash;

    const hasInput = Math.hypot(slot.moveX, slot.moveY) > 0.05
      || (slot.hasAim && Math.hypot(slot.aimX, slot.aimY) > 0.05)
      || slot.buttonStates.some(Boolean)
      || Math.abs(applyAxis(ax[6] || 0)) > 0
      || Math.abs(applyAxis(ax[7] || 0)) > 0;
    if (hasInput) {
      slot.lastInputAt = nowMs();
      if (slotIndex === 0) window.NeoSettings?.noteInputMode?.('gamepad');
    }
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
