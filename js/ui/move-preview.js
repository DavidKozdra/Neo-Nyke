// move-preview.js — standalone IIFE. Live in-game move demo for the character
// select hero detail panel (Neo.MovePreview.show / .stop).
//
// This is NOT a mock-up: each frame it runs the real game — a player built by
// Neo.createDefaultPlayer() with the hovered move equipped, a real spawnEnemy()
// training dummy, the real cast dispatch (tryMelee/tryLaser/trySmash/tryDash),
// the real combat update systems, and the real world draw functions — rendered
// into the preview canvas by pointing Neo.ctx at it.
//
// Safety model: everything happens synchronously inside one animation frame.
// Before ticking, every top-level Neo global is snapshotted and the mutable
// state the sim touches (player, enemies, particles, projectiles, cooldowns,
// rng streams, mouse, laser state, ...) is replaced with sim-owned objects.
// After drawing, every global is restored and any key the sim added is deleted,
// so the menu/game never observes the demo state.
(function () {
  const LOGICAL_W = 210;
  const LOGICAL_H = 118;
  const CYCLE = 2.4;        // seconds per demo loop (cast -> resolve -> reset)
  const CAST_AT = 0.35;     // cast the move this far into the cycle
  const HOLD_FOR = 0.85;    // hold duration for charge moves (death ball etc.)
  const VIEW_SCALE = 0.7;   // world px -> preview px
  const SIM_STEP = 1 / 60;  // fixed sim step for the reduced-motion pre-roll

  let canvas = null;
  let ctx = null;
  let raf = 0;
  let lastTs = 0;
  let lastArgs = null;
  let observer = null;
  let observedHost = null;

  // Persistent sim world (survives across frames, swapped in per frame).
  let sim = null;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // The hero dossier renders on more than one screen (#charSelect and the
  // networked co-op lobby), so the demo pauses/resumes with whichever screen
  // hosts its canvas rather than #charSelect specifically.
  function hostScreen() {
    return canvas?.closest?.('#charSelect, #coopLobby') || document.getElementById('charSelect');
  }

  function hostHidden() {
    const el = hostScreen();
    return !el || el.classList.contains('hidden');
  }

  function reduceMotion() {
    return !!window.NeoSettings?.getAccess?.()?.reduceMotion;
  }

  // Deterministic local RNG so the demo never advances the game's rng streams.
  function makeRng(seed) {
    let a = seed | 0;
    return () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeSimRngStreams() {
    const mk = (seed) => {
      const next = makeRng(seed);
      return { next, getState: () => 0, setState: () => {} };
    };
    return { world: mk(101), loot: mk(202), encounter: mk(303), fx: mk(404) };
  }

  // ── Sim world construction (runs inside the swap, so the real factories
  //    read the sim globals) ────────────────────────────────────────────────

  function anchor() {
    // Demo arena spot: safely inside the room so drawFloor shows real floor
    // and beams/rings resolve against real bounds.
    return { x: Math.round(Neo.ROOM_W * 0.42), y: Math.round(Neo.ROOM_H * 0.5) };
  }

  function dummyDistance(args) {
    const slot = args.slot;
    if (slot === 'melee') {
      const staff = args.weaponKey === 'extending_staff';
      return (Neo.ATTACKS?.melee?.range || 72) + (staff ? 52 : -6);
    }
    if (slot === 'smash') return Math.round((Neo.ATTACKS?.smash?.radius || 148) * 0.72);
    if (slot === 'dash') return 120;
    return 170; // laser: dummy sits inside the beam path
  }

  function buildActors(args) {
    const a = anchor();
    // Real player entity for the selected character (uses Neo.chosenCharacter,
    // already swapped to the demo hero).
    const player = Neo.createDefaultPlayer();
    player.x = a.x;
    player.y = a.y;
    // Equip exactly what the hovered pip shows.
    if (args.moveKey && player.equippedMoves) player.equippedMoves[args.slot] = args.moveKey;
    if (args.slot === 'melee') player.equippedWeapon = args.weaponKey || player.equippedWeapon;
    sim.player = player;
    Neo.player = player; // rebind: casts/draws read Neo.player, not sim.player

    // Real enemy as the training dummy — spawned by the game's own factory so
    // every field statuses/hitEnemy/drawEnemies expect is present.
    sim.enemies.length = 0;
    const dummy = Neo.spawnEnemy?.('hunter', a.x + dummyDistance(args), a.y, false, {});
    if (dummy) {
      dummy.hp = dummy.max = 999999; // never dies: no loot/kill/unlock paths
      dummy.stun = 9999;             // stays put even if any AI tick runs
      dummy.attackCd = 9999;
      dummy.spawnT = 0;              // skip the spawn-in portal (ticked by the
                                     // enemy update loop, which the demo doesn't run)
    }
    sim.dummy = dummy || null;
    sim.casted = false;
    sim.released = false;
  }

  function resetSimWorld(args) {
    sim.particles.length = 0;
    sim.projectiles.length = 0;
    sim.justiceBlades.length = 0;
    sim.ghostBalls.length = 0;
    sim.skySwords.length = 0;
    sim.laser = {
      laserActive: false, laserMode: 'beam', laserTime: 0, laserTick: 0,
      laserAngle: 0, laserSweepSpeed: 0, turtleWaveHpTimer: 0,
      loveBeamCasting: false, activeBeamPaths: null,
    };
    sim.charge = {
      healingZoneCharging: false, healingZoneChargeTime: 0,
      deathBallCharging: false, deathBallChargeTime: 0, deathBallPowerUp: false,
      nimrodStompCharging: false, nimrodStompChargeTime: 0,
      loveBombCharging: false, loveBombChargeTime: 0,
      ghostBallCharging: false, ghostBallChargeTime: 0,
    };
    sim.smashHeld = false;
    sim.dashHeld = false;
    sim.cooldowns = {};
    ['melee', 'laser', 'smash', 'dash'].forEach(slot => {
      sim.cooldowns[slot] = { charges: 99, timers: [], holding: 0 };
    });
    // Rebind the freshly built objects onto the (already-swapped) globals —
    // this runs both from show() and on every cycle reset mid-tick.
    Neo.cooldowns = sim.cooldowns;
    Neo.smashHeld = false;
    Neo.dashHeld = false;
    Neo.moveInputX = 0;
    Neo.moveInputY = 0;
    Object.assign(Neo, sim.laser, sim.charge);
    buildActors(args);
  }

  function createSim(args) {
    sim = {
      args: { ...args },
      time: 0,
      player: null,
      dummy: null,
      enemies: [],
      particles: [],
      projectiles: [],
      justiceBlades: [],
      ghostBalls: [],
      skySwords: [],
      cooldowns: {},
      mouse: { x: 0, y: 0, worldX: 0, worldY: 0, down: false, right: false, downQueued: false, rightQueued: false },
      rngStreams: makeSimRngStreams(),
      bgCache: { key: null, canvas: null }, // sim-owned floor cache, persists across frames
      enemyIdSeq: 0,
      laser: null,
      charge: null,
      smashHeld: false,
      dashHeld: false,
      casted: false,
      released: false,
    };
  }

  // ── The per-frame global swap ────────────────────────────────────────────

  const NOOP = () => {};

  function installSimGlobals() {
    Neo.gameState = 'play';
    Neo.gameMode = 'standard'; // keep spawnEnemy off the sandbox rewrite path
    Neo.chosenCharacter = sim.args.heroKey;
    Neo.player = sim.player;
    Neo.enemies = sim.enemies;
    Neo.particles = sim.particles;
    Neo.projectiles = sim.projectiles;
    Neo.justiceBlades = sim.justiceBlades;
    Neo.ghostBalls = sim.ghostBalls;
    Neo.skySwords = sim.skySwords;
    Neo.cooldowns = sim.cooldowns;
    Neo.mouse = sim.mouse;
    Neo.rngStreams = sim.rngStreams;
    Neo.rng = () => sim.rngStreams.encounter.next();
    Neo.enemyIdSeq = sim.enemyIdSeq;
    Neo.walls = [];
    Neo.environmentBackgroundCache = sim.bgCache;
    Neo.shake = 0; Neo.shakeT = 0; Neo.shakeKickX = 0; Neo.shakeKickY = 0;
    Neo.godTimer = 0;
    Neo.smashHeld = sim.smashHeld;
    Neo.dashHeld = sim.dashHeld;
    Neo.moveInputX = 0;
    Neo.moveInputY = 0;
    if (sim.laser) Object.assign(Neo, sim.laser);
    if (sim.charge) Object.assign(Neo, sim.charge);
    // Side-effect firewalls: no audio, HUD writes, tutorial signals, or unlock
    // toasts from the demo.
    Neo.playSfx = NOOP;
    Neo.playSound = NOOP;
    Neo.updateHud = NOOP;
    Neo.tutorialController = null;
    Neo.addNotification = NOOP;
    Neo.showMoveToast = NOOP;
    // Real combat/status calls still run against the immortal dummy (that's
    // the point — it's a live preview), so also gate achievement events;
    // withSimWorld() deletes this key on restore.
    Neo.isMovePreview = true;
  }

  function captureSimGlobals() {
    // Pull the scalar state the tick mutated back into the sim before restore.
    sim.enemyIdSeq = Neo.enemyIdSeq;
    sim.smashHeld = Neo.smashHeld;
    sim.dashHeld = Neo.dashHeld;
    if (sim.laser) Object.keys(sim.laser).forEach(k => { sim.laser[k] = Neo[k]; });
    if (sim.charge) Object.keys(sim.charge).forEach(k => { sim.charge[k] = Neo[k]; });
  }

  // Runs fn with the sim world swapped into the Neo globals; guarantees the
  // real state is restored even if a cast/draw throws.
  function withSimWorld(fn) {
    const snap = {};
    for (const key in Neo) snap[key] = Neo[key];
    try {
      installSimGlobals();
      fn();
      captureSimGlobals();
    } finally {
      for (const key in Neo) {
        if (!(key in snap)) delete Neo[key];
      }
      Object.assign(Neo, snap);
    }
  }

  // ── Scripted "input" + real update tick ──────────────────────────────────

  function castHoveredMove() {
    const slot = sim.args.slot;
    if (slot === 'melee') {
      sim.player.weaponCooldown = 0;
      Neo.tryMelee?.({});
    } else if (slot === 'laser') {
      Neo.tryLaser?.();
    } else if (slot === 'smash') {
      Neo.smashHeld = true; // charge moves release when this drops (real path)
      Neo.trySmash?.();
    } else if (slot === 'dash') {
      const dx = (sim.dummy?.x ?? sim.player.x + 100) - sim.player.x;
      const dy = (sim.dummy?.y ?? sim.player.y) - sim.player.y;
      const len = Math.hypot(dx, dy) || 1;
      Neo.moveInputX = dx / len;
      Neo.moveInputY = dy / len;
      Neo.dashHeld = true; // Nimrod Stomp releases when this drops (real path)
      Neo.tryDash?.(dx / len, dy / len);
    }
  }

  function simTick(dt) {
    const cyclePos = sim.time % CYCLE;
    if (cyclePos < dt && sim.time > dt) resetSimWorld(sim.args); // new cycle

    // Aim at the dummy.
    if (sim.dummy) {
      sim.mouse.worldX = sim.dummy.x;
      sim.mouse.worldY = sim.dummy.y;
    }

    if (!sim.casted && cyclePos >= CAST_AT) {
      sim.casted = true;
      castHoveredMove();
    }
    if (!sim.released && cyclePos >= CAST_AT + HOLD_FOR) {
      sim.released = true;
      Neo.smashHeld = false; // releases death ball / healing zone via real code
      Neo.dashHeld = false; // releases Nimrod Stomp via real code
    }

    const p = Neo.player;
    if (p) {
      // The bits of the main update loop the demo needs: swing decay, weapon
      // cooldown, dash motion. (The full update() drives rooms/waves/rivals
      // and is far more than a demo should run.)
      p.swing = Math.max(0, (p.swing || 0) - dt);
      p.weaponCooldown = Math.max(0, (p.weaponCooldown || 0) - dt);
      if (p.dashTime > 0) {
        p.dashTime = Math.max(0, p.dashTime - dt);
        p.x += (p.dashX || 0) * dt;
        p.y += (p.dashY || 0) * dt;
      }
      if (Number.isFinite(p.vx) || Number.isFinite(p.vy)) {
        p.x += (p.vx || 0) * dt;
        p.y += (p.vy || 0) * dt;
        p.vx = (p.vx || 0) * Math.pow(0.001, dt);
        p.vy = (p.vy || 0) * Math.pow(0.001, dt);
      }
    }

    // Real combat/effect systems.
    try { Neo.updateWeaponSystems?.(dt); } catch (e) { /* demo-only guard */ }
    try { Neo.updatePlayerLaser?.(dt); } catch (e) { /* demo-only guard */ }
    try { Neo.updateHealingZoneCharge?.(dt); } catch (e) { /* demo-only guard */ }
    try { Neo.updateDeathBallCharge?.(dt); } catch (e) { /* demo-only guard */ }
    try { Neo.updateNimrodStompCharge?.(dt); } catch (e) { /* demo-only guard */ }
    try { Neo.updateGhostBallCharge?.(dt); } catch (e) { /* demo-only guard */ }
    try { Neo.updateProjectiles?.(dt); } catch (e) { /* demo-only guard */ }
    try { Neo.updateJusticeBlades?.(dt); } catch (e) { /* demo-only guard */ }
    try { Neo.updateGhostBalls?.(dt); } catch (e) { /* demo-only guard */ }
    try { Neo.updateSkySwords?.(dt); } catch (e) { /* demo-only guard */ }
    try { Neo.updateParticles?.(dt); } catch (e) { /* demo-only guard */ }

    // Dummy physics: knockback impulses from real hits, integrated simply.
    sim.enemies.forEach(enemy => {
      enemy.x += (enemy.vx || 0) * dt;
      enemy.y += (enemy.vy || 0) * dt;
      enemy.vx = (enemy.vx || 0) * Math.pow(0.002, dt);
      enemy.vy = (enemy.vy || 0) * Math.pow(0.002, dt);
      enemy.inv = Math.max(0, (enemy.inv || 0) - dt);
      enemy.stun = 9999;
      try { Neo.updateEnemyStatuses?.(enemy, dt); } catch (e) { /* demo-only guard */ }
    });

    sim.time += dt;
  }

  // ── Real-renderer draw into the preview canvas ───────────────────────────

  function simDraw() {
    const realCtx = Neo.ctx;
    Neo.ctx = ctx;
    try {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const a = anchor();
      // View rect centered on the action (player slightly left of center).
      const viewW = LOGICAL_W / VIEW_SCALE;
      const viewH = LOGICAL_H / VIEW_SCALE;
      const viewX = clamp(a.x - viewW * 0.32, 0, Neo.ROOM_W - viewW);
      const viewY = clamp(a.y - viewH * 0.5, 0, Neo.ROOM_H - viewH);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0a0f18';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const s = dpr * VIEW_SCALE;
      ctx.setTransform(s, 0, 0, s, -viewX * s, -viewY * s);
      ctx.imageSmoothingEnabled = false;

      try { Neo.drawFloor?.(); } catch (e) { /* fall back to flat fill */ }
      Neo.drawProjectiles?.();
      Neo.drawEnemies?.();
      Neo.drawPlayer?.();
      Neo.drawPlayerLaser?.();
      Neo.drawJusticeBlades?.();
      Neo.drawGhostBalls?.();
      Neo.drawSkySwords?.();
      Neo.drawHealingZoneChargeBar?.();
      Neo.drawDeathBallChargeBar?.();
      Neo.drawNimrodStompChargeBar?.();
      Neo.drawParticles?.();
    } finally {
      Neo.ctx = realCtx;
    }
  }

  function frame(dt) {
    withSimWorld(() => {
      simTick(dt);
      simDraw();
    });
  }

  function step(ts) {
    if (!ctx || !canvas?.isConnected) { pause(); return; }
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    if (Neo.SPRITE_ATLAS?.canvas) {
      try {
        frame(dt);
      } catch (err) {
        // A demo must never take the menu down with it.
        console.warn('MovePreview frame failed:', err);
        pause();
        return;
      }
    }
    raf = requestAnimationFrame(step);
  }

  function pause() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function ensureObserver() {
    const el = hostScreen();
    if (!el || el === observedHost) return;
    observer?.disconnect();
    observedHost = el;
    observer = new MutationObserver(() => {
      if (el.classList.contains('hidden')) {
        pause();
      } else if (lastArgs && canvas?.isConnected && !raf) {
        show(canvas, lastArgs);
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  function show(canvasEl, args) {
    if (!(canvasEl instanceof HTMLCanvasElement) || !args?.slot || !args?.heroKey) return;
    pause();
    canvas = canvasEl;
    lastArgs = { ...args };
    ensureObserver();
    if (hostHidden()) return; // resume via the observer when revealed

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;
    ctx = canvas.getContext('2d');
    if (!ctx) return;

    createSim(args);
    // Build the demo actors with the sim globals in place so the real
    // factories (createDefaultPlayer / spawnEnemy) read sim state.
    try {
      withSimWorld(() => resetSimWorld(args));
    } catch (err) {
      console.warn('MovePreview setup failed:', err);
      sim = null;
      return;
    }

    if (reduceMotion()) {
      // No loop: pre-roll the sim to just after the hit lands and draw once.
      try {
        withSimWorld(() => {
          const until = CAST_AT + 0.35;
          for (let t = 0; t < until; t += SIM_STEP) simTick(SIM_STEP);
          simDraw();
        });
      } catch (err) {
        console.warn('MovePreview static frame failed:', err);
      }
      return;
    }

    lastTs = performance.now();
    raf = requestAnimationFrame(step);
  }

  function stop() {
    pause();
    lastArgs = null;
    canvas = null;
    ctx = null;
    sim = null;
  }

  Neo.MovePreview = { show, stop };
})();
