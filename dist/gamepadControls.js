/**
 * NEO NYKE — Gamepad / Controller Support
 * Reads the Web Gamepad API and exposes window.NeoGamepad[0..1].
 * Each slot has the same shape as window.NeoTouch so game.js can
 * apply the same injection logic.
 *
 * Standard mapping (Xbox / PS / generic):
 *   Left stick      → move
 *   Right stick     → aim (overrides auto-aim when pushed)
 *   A / Cross       → melee (slash)
 *   X / Square      → laser
 *   Y / Triangle    → smash
 *   B / Circle      → dash
 *   RB / R1         → dash (alternate)
 *   Start           → pause
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
      // P2 keys mirrored for updatePlayer2
      p2MeleeHeld: false,
      p2DashHeld: false,
    };
  }

  window.NeoGamepad = [makeSlot(), makeSlot(), makeSlot(), makeSlot()];

  function apply(dead, v) { return Math.abs(v) < dead ? 0 : v; }

  function readGamepad(gp, slot) {
    if (!gp || !gp.connected) {
      slot.active = false;
      slot.moveX = slot.moveY = 0;
      slot.slash = slot.laser = slot.smash = slot.dash = false;
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

    slot.slash  = b[0]?.pressed ?? false;  // A / Cross
    slot.laser  = b[2]?.pressed ?? false;  // X / Square
    slot.smash  = b[3]?.pressed ?? false;  // Y / Triangle
    slot.dash   = (b[1]?.pressed || b[5]?.pressed) ?? false;  // B / Circle or RB/R1
    slot.start  = b[9]?.pressed ?? false;  // Start / Options

    // P2 aliases (used by updatePlayer2)
    slot.p2MeleeHeld = slot.slash;
    slot.p2DashHeld  = slot.dash;

    slot.active = true; // stay active once a gamepad is connected and reporting
  }

  function pollGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    readGamepad(pads[0], window.NeoGamepad[0]);
    readGamepad(pads[1], window.NeoGamepad[1]);
    readGamepad(pads[2], window.NeoGamepad[2]);
    readGamepad(pads[3], window.NeoGamepad[3]);
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
