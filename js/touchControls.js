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
    active: false, // true once any touch fires
  };

  const NT = window.NeoTouch;
  const DEFAULT_TOUCH_BINDINGS = { touchA:'slash', touchB:'laser', touchY:'smash', touchX:'ascend', touchDash:'dash' };
  const TOUCH_ACTION_LABELS = { slash: 'SLASH', laser: 'LASER', smash: 'SMASH', ascend: 'CLIMB', dash: 'DASH' };
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

  btnCluster.appendChild(btnY);
  btnCluster.appendChild(btnX);
  btnCluster.appendChild(btnB);
  btnCluster.appendChild(btnA);
  btnCluster.appendChild(btnDash);
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

  joyZone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!isGameplayTouchAllowed()) return;
    const t = e.changedTouches[0];
    joyTouch = t.identifier;
    const rect = refreshJoyZoneRect();
    joyOriginX = t.clientX - rect.left;
    joyOriginY = t.clientY - rect.top;
    joyBase.style.left = joyOriginX + 'px';
    joyBase.style.top  = joyOriginY + 'px';
    joyBase.classList.add('joy-active');
    setNTActive();
  }, { passive: false });

  joyZone.addEventListener('touchmove', e => {
    e.preventDefault();
    const rect = joyZoneRect || refreshJoyZoneRect();
    for (const t of e.changedTouches) {
      if (t.identifier !== joyTouch) continue;
      let dx = (t.clientX - rect.left) - joyOriginX;
      let dy = (t.clientY - rect.top)  - joyOriginY;
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
  }, { passive: false });

  function joyRelease(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyTouch) continue;
      joyTouch = null;
      NT.moveX = 0;
      NT.moveY = 0;
      joyKnob.style.transform = '';
      joyBase.classList.remove('joy-active');
      invalidateJoyZoneRect();
    }
  }
  joyZone.addEventListener('touchend',    joyRelease, { passive: false });
  joyZone.addEventListener('touchcancel', joyRelease, { passive: false });
  window.addEventListener('resize', invalidateJoyZoneRect, { passive: true });
  window.addEventListener('orientationchange', invalidateJoyZoneRect, { passive: true });
  window.addEventListener('scroll', invalidateJoyZoneRect, { passive: true });

  // ── Button logic ───────────────────────────────────────────────────────────

  bindBtn(btnA,    'touchA',    'slash');
  bindBtn(btnB,    'touchB',    'laser');
  bindBtn(btnY,    'touchY',    'smash');
  bindBtn(btnX,    'touchX',    'ascend');
  bindBtn(btnDash, 'touchDash', 'dash');

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
  window.addEventListener('neo:settings-changed', refreshButtonLabels);

  function bindBtn(el, bindingKey, fallbackAction) {
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!isGameplayTouchAllowed()) return;
      const action = getTouchAction(bindingKey, fallbackAction);
      el.dataset.touchAction = action;
      if (action === 'ascend' && triggerWorldInteract()) {
        el.classList.add('pressed');
        setNTActive();
        return;
      }
      NT[action] = true;
      el.classList.add('pressed');
      setNTActive();
    }, { passive: false });
    const release = e => {
      e.preventDefault();
      const action = normalizeTouchAction(el.dataset.touchAction, fallbackAction);
      NT[action] = false;
      if (action === 'ascend') releaseAscendKey();
      el.classList.remove('pressed');
    };
    el.addEventListener('touchend',    release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
  }

  // ── Hamburger menu ─────────────────────────────────────────────────────────

  const hamburger = mkEl('button', 'touch-hamburger');
  hamburger.setAttribute('type', 'button');
  hamburger.setAttribute('aria-label', 'Menu');
  hamburger.innerHTML = '<span></span><span></span><span></span>';
  overlay.appendChild(hamburger);

  const hamMenu = mkEl('div', 'touch-ham-menu');

  function mkHamBtn(label, fn) {
    const b = mkEl('button', 'touch-ham-btn');
    b.setAttribute('type', 'button');
    b.textContent = label;
    b.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!isGameplayTouchAllowed()) return;
      closeHamMenu();
      fn();
      window.setTimeout(syncOverlayMode, 0);
    }, { passive: false });
    return b;
  }

  hamMenu.appendChild(mkHamBtn('⏸ PAUSE',     () => { if (window._neoGame?.pauseGame)             window._neoGame.pauseGame();             }));
  hamMenu.appendChild(mkHamBtn('🎒 INVENTORY', () => { if (window._neoGame?.toggleInventoryPanel)   window._neoGame.toggleInventoryPanel();   }));

  const warpHamBtn = mkHamBtn('⚡ WARP', () => { if (window.Neo?.tryChargedLadderWarp) window.Neo.tryChargedLadderWarp(); });
  warpHamBtn.id = 'hamWarpBtn';
  warpHamBtn.classList.add('hidden');
  hamMenu.appendChild(warpHamBtn);

  overlay.appendChild(hamMenu);

  let hamOpen = false;
  function closeHamMenu() { hamOpen = false; hamMenu.classList.remove('open'); }

  hamburger.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!isGameplayTouchAllowed()) return;
    // Update warp button visibility just before opening
    const hasAdapter = window.Neo?.getItemCount?.('charged_adapter') > 0;
    warpHamBtn.classList.toggle('hidden', !hasAdapter);
    if (hasAdapter) {
      const ready = window.Neo?.player?.escapeReady;
      warpHamBtn.textContent = ready ? '⚡ WARP (READY)' : '⚡ WARP (CHARGING)';
    }
    hamOpen = !hamOpen;
    hamMenu.classList.toggle('open', hamOpen);
    setNTActive();
  }, { passive: false });

  // close on tap outside
  overlay.addEventListener('touchstart', e => {
    if (hamOpen && !hamMenu.contains(e.target) && e.target !== hamburger) closeHamMenu();
  }, { passive: true });

  // ── Interact prompt (shop / forge) ─────────────────────────────────────────
  const interactPrompt = document.getElementById('interactPrompt');
  if (interactPrompt) {
    interactPrompt.addEventListener('touchstart', e => {
      e.preventDefault();
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

  // Also show on first touch anywhere (keyboard users never see it)
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
    return window.Neo?.gameState === 'play' && hasCoarsePointer() && !hasOpenBlockingPanel();
  }

  function hasCoarsePointer() {
    return !!(window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
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
    if (!canShop && !canAnvil) return false;
    window._neoGame?.triggerInteract?.();
    window.setTimeout(syncOverlayMode, 0);
    return true;
  }

  function clearTouchState() {
    joyTouch = null;
    NT.moveX = 0;
    NT.moveY = 0;
    TOUCH_ACTIONS.forEach(action => { NT[action] = false; });
    releaseAscendKey();
    joyKnob.style.transform = '';
    joyBase.classList.remove('joy-active');
    [btnA, btnB, btnY, btnX, btnDash].forEach(btn => btn.classList.remove('pressed'));
    closeHamMenu();
  }

  function releaseAscendKey() {
    if (window.Neo?.keys) window.Neo.keys[' '] = false;
    if (window.Neo) window.Neo.ladderUseKeyLatch = false;
  }

  function syncOverlayMode() {
    const allowed = isGameplayTouchAllowed();
    overlay.classList.toggle('touch-overlay--gameplay', allowed);
    if (!allowed) {
      clearTouchState();
      NT.active = false;
      overlay.classList.remove('visible');
      return;
    }
    if (hasCoarsePointer()) setNTActive();
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
