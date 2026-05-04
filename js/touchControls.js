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

  joyZone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joyTouch = t.identifier;
    const rect = joyZone.getBoundingClientRect();
    joyOriginX = t.clientX - rect.left;
    joyOriginY = t.clientY - rect.top;
    joyBase.style.left = joyOriginX + 'px';
    joyBase.style.top  = joyOriginY + 'px';
    joyBase.classList.add('joy-active');
    setNTActive();
  }, { passive: false });

  joyZone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== joyTouch) continue;
      const rect = joyZone.getBoundingClientRect();
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
    }
  }
  joyZone.addEventListener('touchend',    joyRelease, { passive: false });
  joyZone.addEventListener('touchcancel', joyRelease, { passive: false });

  // ── Button logic ───────────────────────────────────────────────────────────

  bindBtn(btnA,    'slash');
  bindBtn(btnB,    'laser');
  bindBtn(btnY,    'smash');
  bindBtn(btnX,    'ascend');
  bindBtn(btnDash, 'dash');

  function bindBtn(el, prop) {
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      NT[prop] = true;
      el.classList.add('pressed');
      setNTActive();
    }, { passive: false });
    const release = e => {
      e.preventDefault();
      NT[prop] = false;
      el.classList.remove('pressed');
    };
    el.addEventListener('touchend',    release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
  }

  // ── Visibility ─────────────────────────────────────────────────────────────

  function setNTActive() {
    if (!NT.active) {
      NT.active = true;
      overlay.classList.add('visible');
    }
  }

  // Also show on first touch anywhere (keyboard users never see it)
  window.addEventListener('touchstart', () => setNTActive(), { once: true, passive: true });

  // ── Helpers ────────────────────────────────────────────────────────────────

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
