/**
 * NEO NYKE — Mobile Touch Controls
 * Joystick (movement) + action buttons (A/B/Y/X + Dash)
 * Feeds into window.NeoTouch which game.js reads.
 */
(function () {
  'use strict';

  // Exposed API — game.js reads these each frame
  window.NeoTouch = {
    moveX: 0,
    moveY: 0,
    lastAimX: 1,  // last non-zero move direction for auto-aim
    lastAimY: 0,
    slash: false,
    laser: false,
    smash: false,
    ascend: false,
    dash: false,
    beamMash: false,
    queuedActions: {},
    active: false, // true once any touch fires
  };

  const NT = window.NeoTouch;
  const DEFAULT_TOUCH_BINDINGS = { touchA:'slash', touchB:'laser', touchY:'smash', touchX:'ascend', touchDash:'dash' };
  const TOUCH_ACTION_LABELS = { slash: 'SLASH', laser: 'LASER', smash: 'SMASH', ascend: 'CLIMB', dash: 'DASH', beamMash: 'MASH' };
  const TOUCH_ACTIONS = Object.keys(TOUCH_ACTION_LABELS);

  // ── DOM ────────────────────────────────────────────────────────────────────

  const overlay = document.createElement('div');
  overlay.id = 'touch-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);

  // Left joystick
  const joyZone   = mkEl('div', 'joy-zone');
  const joyBase   = mkEl('div', 'joy-base');
  const joyKnob   = mkEl('div', 'joy-knob');
  joyBase.appendChild(joyKnob);
  joyZone.appendChild(joyBase);
  overlay.appendChild(joyZone);

  // Right button cluster
  const btnCluster = mkEl('div', 'btn-cluster');

  // Main 4 buttons (diamond layout)
  const btnA    = mkBtn('A',    'btn-a',    'SLASH');
  const btnB    = mkBtn('B',    'btn-b',    'LASER');
  const btnY    = mkBtn('Y',    'btn-y',    'SMASH');
  const btnX    = mkBtn('X',    'btn-x',    'CLIMB');
  const btnDash = mkBtn('DASH', 'btn-dash', '');
  const btnMash = mkBtn('MASH', 'btn-mash', 'BEAM');

  btnCluster.appendChild(btnY);
  btnCluster.appendChild(btnX);
  btnCluster.appendChild(btnB);
  btnCluster.appendChild(btnA);
  btnCluster.appendChild(btnDash);
  btnCluster.appendChild(btnMash);
  overlay.appendChild(btnCluster);

  // ── Joystick logic ─────────────────────────────────────────────────────────

  const JOY_RADIUS = 48; // px — max knob travel
  let joyTouch = null;
  let joyOriginX = 0;
  let joyOriginY = 0;
  let joyZoneRect = null;

  function refreshJoyZoneRect() {
    joyZoneRect = joyZone.getBoundingClientRect();
    return joyZoneRect;
  }

  function invalidateJoyZoneRect() {
    joyZoneRect = null;
  }

  function startJoystick(clientX, clientY, pointerId) {
    if (!isGameplayTouchAllowed()) return;
    joyTouch = pointerId;
    const rect = refreshJoyZoneRect();
    joyOriginX = clientX - rect.left;
    joyOriginY = clientY - rect.top;
    joyBase.style.left = joyOriginX + 'px';
    joyBase.style.top  = joyOriginY + 'px';
    joyBase.classList.add('joy-active');
    setNTActive();
  }

  function updateJoystick(clientX, clientY) {
    const rect = joyZoneRect || refreshJoyZoneRect();
    let dx = (clientX - rect.left) - joyOriginX;
    let dy = (clientY - rect.top)  - joyOriginY;
    const dist = Math.hypot(dx, dy);
    if (dist > JOY_RADIUS) {
      dx = dx / dist * JOY_RADIUS;
      dy = dy / dist * JOY_RADIUS;
    }
    const nx = dx / JOY_RADIUS;
    const ny = dy / JOY_RADIUS;
    NT.moveX = nx;
    NT.moveY = ny;
    if (dist > 8) {
      NT.lastAimX = nx;
      NT.lastAimY = ny;
    }
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function resetJoystick() {
    joyTouch = null;
    NT.moveX = 0;
    NT.moveY = 0;
    joyKnob.style.transform = '';
    joyBase.classList.remove('joy-active');
    invalidateJoyZoneRect();
  }

  joyZone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    startJoystick(t.clientX, t.clientY, t.identifier);
  }, { passive: false });

  joyZone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== joyTouch) continue;
      updateJoystick(t.clientX, t.clientY);
    }
  }, { passive: false });

  function joyRelease(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyTouch) continue;
      resetJoystick();
    }
  }
  joyZone.addEventListener('touchend',    joyRelease, { passive: false });
  joyZone.addEventListener('touchcancel', joyRelease, { passive: false });
  joyZone.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    startJoystick(e.clientX, e.clientY, 'mouse');
  });
  window.addEventListener('mousemove', e => {
    if (joyTouch === 'mouse') updateJoystick(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 0 && joyTouch === 'mouse') resetJoystick();
  });
  window.addEventListener('resize', invalidateJoyZoneRect, { passive: true });
  window.addEventListener('orientationchange', invalidateJoyZoneRect, { passive: true });
  window.addEventListener('scroll', invalidateJoyZoneRect, { passive: true });

  // ── Button logic ───────────────────────────────────────────────────────────

  bindBtn(btnA,    'touchA',    'slash');
  bindBtn(btnB,    'touchB',    'laser');
  bindBtn(btnY,    'touchY',    'smash');
  bindBtn(btnX,    'touchX',    'ascend');
  bindBtn(btnDash, 'touchDash', 'dash');
  bindBtn(btnMash, 'beamMash', 'beamMash');

  function normalizeTouchAction(value, fallback) {
    const action = String(value || fallback || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(TOUCH_ACTION_LABELS, action)
      ? action
      : fallback;
  }

  function getTouchAction(bindingKey, fallback) {
    const configured = window.NeoSettings?.getTouchBindings?.();
    return normalizeTouchAction(configured?.[bindingKey], fallback);
  }

  function getActionSubLabel(action) {
    return TOUCH_ACTION_LABELS[action] || TOUCH_ACTION_LABELS.slash;
  }

  function setButtonSubLabel(el, action) {
    const sub = el.querySelector('.btn-sub');
    if (!sub) return;
    sub.textContent = getActionSubLabel(action);
  }

  function refreshButtonLabels() {
    setButtonSubLabel(btnA, getTouchAction('touchA', DEFAULT_TOUCH_BINDINGS.touchA));
    setButtonSubLabel(btnB, getTouchAction('touchB', DEFAULT_TOUCH_BINDINGS.touchB));
    setButtonSubLabel(btnY, getTouchAction('touchY', DEFAULT_TOUCH_BINDINGS.touchY));
    setButtonSubLabel(btnX, getTouchAction('touchX', DEFAULT_TOUCH_BINDINGS.touchX));
  }

  refreshButtonLabels();
  window.addEventListener('neo:settings-changed', () => {
    refreshButtonLabels();
    syncOverlayMode();
  });

  function bindBtn(el, bindingKey, fallbackAction) {
    function press() {
      if (!isGameplayTouchAllowed()) return;
      const action = getTouchAction(bindingKey, fallbackAction);
      el.dataset.touchAction = action;
      window.NeoSettings?.noteInputMode?.('touch');
      if (action === 'ascend' && triggerWorldInteract()) {
        el.classList.add('pressed');
        setNTActive();
        return;
      }
      NT[action] = true;
      NT.queuedActions[action] = true;
      el.classList.add('pressed');
      setNTActive();
    }
    function release() {
      const action = normalizeTouchAction(el.dataset.touchAction, fallbackAction);
      NT[action] = false;
      if (action === 'ascend') releaseAscendKey();
      el.classList.remove('pressed');
    }
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      press();
    }, { passive: false });
    const releaseTouch = e => {
      e.preventDefault();
      release();
    };
    el.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      press();
    });
    el.addEventListener('mouseup', release);
    el.addEventListener('mouseleave', release);
    el.addEventListener('touchend',    releaseTouch, { passive: false });
    el.addEventListener('touchcancel', releaseTouch, { passive: false });
  }

  // ── Hamburger menu ─────────────────────────────────────────────────────────

  const hamburger = mkEl('button', 'touch-hamburger');
  hamburger.setAttribute('type', 'button');
  hamburger.setAttribute('aria-label', 'Menu');
  hamburger.innerHTML = '<span></span><span></span><span></span>';
  overlay.appendChild(hamburger);

  const hamMenu = mkEl('div', 'touch-ham-menu');

  function mkHamBtn(label, icon, fn) {
    const b = mkEl('button', 'touch-ham-btn');
    b.setAttribute('type', 'button');
    if (icon) {
      const iconEl = mkEl('span', `touch-ham-icon touch-ham-icon--${icon}`);
      iconEl.setAttribute('aria-hidden', 'true');
      b.appendChild(iconEl);
    }
    const labelEl = mkEl('span', 'touch-ham-label');
    labelEl.textContent = label;
    b.appendChild(labelEl);
    b.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!isGameplayTouchAllowed()) return;
      closeHamMenu();
      fn();
      window.setTimeout(syncOverlayMode, 0);
    }, { passive: false });
    b.addEventListener('click', e => {
      if (!isGameplayTouchAllowed()) return;
      e.preventDefault();
      closeHamMenu();
      fn();
      window.setTimeout(syncOverlayMode, 0);
    });
    return b;
  }

  hamMenu.appendChild(mkHamBtn('PAUSE', 'pause', () => { if (window._neoGame?.pauseGame)             window._neoGame.pauseGame();             }));
  hamMenu.appendChild(mkHamBtn('INVENTORY', 'inventory', () => { if (window._neoGame?.toggleInventoryPanel)   window._neoGame.toggleInventoryPanel();   }));

  const warpHamBtn = mkHamBtn('WARP', 'warp', () => { if (window.Neo?.tryChargedLadderWarp) window.Neo.tryChargedLadderWarp(); });
  warpHamBtn.id = 'hamWarpBtn';
  warpHamBtn.classList.add('hidden');
  hamMenu.appendChild(warpHamBtn);

  overlay.appendChild(hamMenu);

  let hamOpen = false;
  function closeHamMenu() { hamOpen = false; hamMenu.classList.remove('open'); }
  function syncWarpHamButton() {
    const hasAdapter = window.Neo?.getItemCount?.('charged_adapter') > 0;
    warpHamBtn.classList.toggle('hidden', !hasAdapter);
    const label = warpHamBtn.querySelector('.touch-ham-label');
    if (label) {
      const ready = window.Neo?.player?.escapeReady;
      label.textContent = ready ? 'WARP (READY)' : 'WARP (CHARGING)';
    }
    return hasAdapter;
  }

  hamburger.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!isGameplayTouchAllowed()) return;
    // Update warp button visibility just before opening
    syncWarpHamButton();
    hamOpen = !hamOpen;
    hamMenu.classList.toggle('open', hamOpen);
    setNTActive();
  }, { passive: false });
  hamburger.addEventListener('click', e => {
    if (!isGameplayTouchAllowed()) return;
    e.preventDefault();
    syncWarpHamButton();
    hamOpen = !hamOpen;
    hamMenu.classList.toggle('open', hamOpen);
    setNTActive();
  });

  // close on tap outside
  overlay.addEventListener('touchstart', e => {
    if (hamOpen && !hamMenu.contains(e.target) && e.target !== hamburger) closeHamMenu();
  }, { passive: true });

  // ── Interact prompt (shop / forge) ─────────────────────────────────────────
  const interactPrompt = document.getElementById('interactPrompt');
  if (interactPrompt) {
    interactPrompt.addEventListener('touchstart', e => {
      e.preventDefault();
      if (window.Neo?.multiplayerGameView?.active && window.Neo.multiplayerGameView.interact?.()) return;
      window._neoGame?.triggerInteract?.();
    }, { passive: false });
  }

  // ── Visibility ─────────────────────────────────────────────────────────────

  function setNTActive() {
    if (!isGameplayTouchAllowed()) return;
    if (!NT.active) {
      NT.active = true;
      overlay.classList.add('visible');
    }
  }

  // Re-sync on touch in case settings or gameplay state changed between frames.
  window.addEventListener('touchstart', () => {
    syncOverlayMode();
    setNTActive();
  }, { passive: true });

  syncOverlayMode();
  window.setInterval(syncOverlayMode, 250);
  window.addEventListener('resize', syncOverlayMode, { passive: true });
  document.addEventListener('visibilitychange', syncOverlayMode);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function hasOpenBlockingPanel() {
    return !!document.querySelector(
      '.game-panel:not(.hidden), .modal-backdrop:not(.hidden), ' +
      '#pause.overlay:not(.hidden), #dead.overlay:not(.hidden), #win.overlay:not(.hidden), #mpLobby.overlay:not(.hidden)'
    );
  }

  function isGameplayTouchAllowed() {
    return window.Neo?.gameState === 'play' && touchControlsEnabled() && !hasOpenBlockingPanel();
  }

  function touchControlsEnabled() {
    if (window.NeoSettings?.isTouchControlsEnabled) return window.NeoSettings.isTouchControlsEnabled();
    try {
      const saved = JSON.parse(localStorage.getItem('neonyke:settings') || 'null');
      if (saved?.touchControlsEnabled === false) return false;
    } catch {}
    return true;
  }

  function isPanelOpen(panel) {
    if (!panel) return false;
    if (window.Neo?.isPanelOpen) return window.Neo.isPanelOpen(panel);
    return !panel.classList.contains('hidden');
  }

  function triggerWorldInteract() {
    if (window.Neo?.gameState !== 'play') return false;
    const roomType = window.Neo?.currentRoom?.type;
    const canShop = roomType === 'shop' && !isPanelOpen(window.Neo?.ui?.shopPanel);
    const canAnvil = roomType === 'anvil' && !isPanelOpen(window.Neo?.ui?.anvilPanel);
    const canLadder = !!window.Neo?.isAtLadder?.();
    if (!canShop && !canAnvil && !canLadder) return false;
    // Online chests/stairs belong to authority. Let the network view issue the
    // interaction instead of running the local floor transition.
    if (window.Neo?.multiplayerGameView?.active && window.Neo.multiplayerGameView.interact?.()) return true;
    window._neoGame?.triggerInteract?.();
    window.setTimeout(syncOverlayMode, 0);
    return true;
  }

  function clearTouchState() {
    joyTouch = null;
    NT.moveX = 0;
    NT.moveY = 0;
    TOUCH_ACTIONS.forEach(action => { NT[action] = false; });
    NT.queuedActions = {};
    releaseAscendKey();
    joyKnob.style.transform = '';
    joyBase.classList.remove('joy-active');
    [btnA, btnB, btnY, btnX, btnDash, btnMash].forEach(btn => btn.classList.remove('pressed'));
    closeHamMenu();
  }

  function releaseAscendKey() {
    const key = window.NeoSettings?.getBindings?.()?.ascend || ' ';
    if (window.Neo?.keys) window.Neo.keys[key] = false;
    if (window.Neo) window.Neo.ladderUseKeyLatch = false;
  }

  function syncOverlayMode() {
    const allowed = isGameplayTouchAllowed();
    overlay.classList.toggle('touch-overlay--gameplay', allowed);
    overlay.classList.toggle('beam-struggle-active', allowed && !!window.Neo?.beamStruggle?.active);
    if (!allowed) {
      clearTouchState();
      NT.active = false;
      overlay.classList.remove('visible');
      return;
    }
    setNTActive();
  }

  function mkEl(tag, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  function mkBtn(label, cls, sub) {
    const btn = mkEl('button', 'touch-btn ' + cls);
    btn.setAttribute('type', 'button');
    const span = mkEl('span', 'btn-label');
    span.textContent = label;
    btn.appendChild(span);
    if (sub) {
      const s = mkEl('span', 'btn-sub');
      s.textContent = sub;
      btn.appendChild(s);
    }
    return btn;
  }
})();
