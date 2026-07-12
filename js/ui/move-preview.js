// move-preview.js — standalone IIFE. Animated move demo for the character-select
// hero detail panel: the selected hero performs the hovered move on a training
// dummy inside a small looping canvas (Neo.MovePreview.show / .stop).
//
// Draws only into its own canvas — never uses the entities.js helpers that
// target Neo.ctx. Sprites are blitted straight from Neo.SPRITE_ATLAS like the
// credits parade does; the dummy's plain/flash poses are pre-rendered with
// Neo.drawSpriteToCanvas (the one helper that accepts an arbitrary canvas).
(function () {
  const LOGICAL_W = 210;
  const LOGICAL_H = 118;
  const CYCLE = 1.9;          // seconds per demo loop
  const K = 0.55;             // world px -> preview px
  const HERO_X = 52;
  const GROUND_Y = 84;
  const HERO_SIZE = 34;
  const DUMMY_SIZE = 30;
  const DUMMY_SPRITE = 'cult_follower';
  // Timeline phases (fractions of CYCLE): windup -> strike -> recover.
  const STRIKE_START = 0.25;
  const STRIKE_END = 0.6;

  const SLOT_DEFAULTS = {
    melee: { anim: 'arc', color: '#ff9a6b', range: 72, arc: 1.04, push: 20 },
    laser: { anim: 'beam', color: '#78d7ff', range: 430, width: 6, push: 8 },
    smash: { anim: 'ring', color: '#c08cff', radius: 148, push: 24 },
    dash: { anim: 'dash', color: '#79f7bf', dist: 170, push: 14, hits: true },
  };

  // Per-move tweaks over the slot base. Unknown moves fall through to the slot
  // defaults, so every move renders a sensible demo without an entry here.
  const MOVE_VARIANTS = {
    // laser
    blood_beam: { color: '#ff5d6c' },
    mooggy_blood_beam: { color: '#ff3348' },
    thorn_blood_beams: { color: '#ff5d6c', projectiles: 4 },
    love_beam: { color: '#ff9de8' },
    turtle_wave: { color: '#59e0b8', width: 16 },
    wizard_lazer: { color: '#b46bff', width: 12 },
    god_sweep: { color: '#fff1a8', width: 10 },
    power_disks: { color: '#9adfff', projectiles: 3 },
    nail_shot: { color: '#d8c9a8', projectiles: 5 },
    hammer_throw: { color: '#7da3ff', projectiles: 1 },
    blade_justice: { color: '#fff1a8', width: 8 },
    lightning_columns: { color: '#9bd9ff', projectiles: 2 },
    laser_shockwave: { color: '#c9a06a', width: 9 },
    // smash
    crimson_smash: { color: '#ff4d5e' },
    hammer_smash: { color: '#7da3ff' },
    mooggy_hairball: { color: '#8be07a' },
    chaos_burst: { color: '#ff90ff', rings: 3 },
    wall_of_toph: { color: '#c9a06a' },
    healing_zone: { color: '#8affc0' },
    fire_circle: { color: '#ff9040' },
    floor_lava: { color: '#ff6a2a' },
    excalibur_strike: { color: '#ffd980' },
    holy_turrets: { color: '#ffe59c' },
    kicky_kick: { color: '#ff9de8', radius: 90 },
    random_pounce: { color: '#8be07a', rings: 2 },
    potion_bath: { color: '#9fe8ff' },
    death_ball: { color: '#6db9ff' },
    turtle_powerup: { color: '#59e0b8' },
    // dash
    warp: { color: '#c8a6ff', teleport: true, hits: false },
    mooggy_zoomies: { color: '#79f7bf', hits: false, ghosts: 5 },
    flying_unhitable: { color: '#ff9de8', hits: false },
    cowards_way: { color: '#cfd8e6', hits: false },
    nimrod_stomp: { color: '#ffb874' },
    zip_lightning: { color: '#9bd9ff', ghosts: 4 },
    knight_slash_dash: { color: '#ff6e8b', ghosts: 4 },
  };

  // The melee slot is weapon-driven; tweak by weapon key. Fallback color comes
  // from WEAPON_DEFS[weaponKey].color when no entry exists.
  const WEAPON_VARIANTS = {
    extending_staff: { range: 130, arc: 1.45 },
    hunters_bow: { anim: 'beam', width: 2, projectiles: 1 },
    lazer_glasses: { anim: 'beam', width: 5, projectiles: 2 },
    metao_fire_staff: { anim: 'beam', width: 4, projectiles: 3 },
    magenta_degale: { anim: 'beam', width: 7, projectiles: 1 },
    magenta_p90: { anim: 'beam', width: 3, projectiles: 5 },
    princess_wand: { anim: 'beam', width: 4, projectiles: 3 },
    gelleh_lightning_spear: { anim: 'beam', width: 4, projectiles: 1 },
    claw_gauntlets: { arc: 1.3 },
    sarges_hammer: { arc: 1.3, range: 92 },
    katana_excalibur_777x: { arc: 1.4, range: 86 },
  };

  let canvas = null;
  let ctx = null;
  let raf = 0;
  let lastTs = 0;
  let phaseTime = 0;
  let params = null;
  let heroKey = '';
  let dummyX = 0;
  let heroReach = 0;
  let lastArgs = null;
  let dummyPlain = null;
  let dummyFlash = null;
  let observer = null;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const easeOut = t => 1 - (1 - t) * (1 - t);
  // Progress of the strike window: 0 before it, 1 at/after its end.
  const strikeT = ph => clamp((ph - STRIKE_START) / (STRIKE_END - STRIKE_START), 0, 1);

  function charSelectHidden() {
    const el = document.getElementById('charSelect');
    return !el || el.classList.contains('hidden');
  }

  function reduceMotion() {
    return !!window.NeoSettings?.getAccess?.()?.reduceMotion;
  }

  function resolveParams({ slot, moveKey, weaponKey }) {
    const base = SLOT_DEFAULTS[slot] || SLOT_DEFAULTS.melee;
    const variant = (slot === 'melee' ? WEAPON_VARIANTS[weaponKey] : MOVE_VARIANTS[moveKey]) || null;
    const p = { ...base, ...variant };
    if (slot === 'melee' && !variant?.color) {
      p.color = Neo.WEAPON_DEFS?.[weaponKey]?.color || p.color;
    }
    return p;
  }

  function computeLayout() {
    heroReach = 0;
    if (params.anim === 'arc') {
      heroReach = clamp(params.range * K, 34, 120);
      dummyX = HERO_X + heroReach - 4;
    } else if (params.anim === 'beam') {
      dummyX = HERO_X + 118;
    } else if (params.anim === 'ring') {
      heroReach = clamp(params.radius * K, 45, 120);
      dummyX = HERO_X + heroReach * 0.8;
    } else { // dash
      heroReach = clamp(params.dist * K, 55, 118);
      dummyX = HERO_X + heroReach * 0.6;
    }
  }

  function prerenderDummy() {
    if (dummyPlain || !Neo.SPRITE_ATLAS?.canvas || !Neo.drawSpriteToCanvas) return;
    dummyPlain = document.createElement('canvas');
    dummyPlain.width = DUMMY_SIZE;
    dummyPlain.height = DUMMY_SIZE;
    Neo.drawSpriteToCanvas(dummyPlain, DUMMY_SPRITE, DUMMY_SIZE);
    dummyFlash = document.createElement('canvas');
    dummyFlash.width = DUMMY_SIZE;
    dummyFlash.height = DUMMY_SIZE;
    Neo.drawSpriteToCanvas(dummyFlash, DUMMY_SPRITE, DUMMY_SIZE, { tint: '#ffffff' });
    // Punch the tint up: drawSpriteToCanvas only tints at 0.2 alpha.
    const fc = dummyFlash.getContext('2d');
    fc.globalCompositeOperation = 'source-atop';
    fc.globalAlpha = 0.55;
    fc.fillStyle = '#ffffff';
    fc.fillRect(0, 0, DUMMY_SIZE, DUMMY_SIZE);
  }

  // Blit a sprite from the atlas centered at (x, y), same frame lookup as
  // drawSpriteFrame but into the preview's own context.
  function blitSprite(key, x, y, size, opts = {}) {
    const atlas = Neo.SPRITE_ATLAS;
    if (!atlas?.frames || !atlas.canvas) return;
    const frame = atlas.frames[key] || atlas.frames[String(key || '').split(':')[0]] || atlas.frames.hunter;
    if (!frame) return;
    const renderSize = size * Number(frame.renderScale || 1);
    ctx.save();
    ctx.translate(x, y);
    if (opts.flipX) ctx.scale(-1, 1);
    ctx.scale(opts.scaleX || 1, opts.scaleY || 1);
    ctx.globalAlpha = opts.alpha ?? 1;
    if (opts.shadowColor) {
      ctx.shadowColor = opts.shadowColor;
      ctx.shadowBlur = opts.shadowBlur || 10;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas.canvas, frame.x, frame.y, frame.w, frame.h,
      -renderSize / 2, -renderSize / 2, renderSize, renderSize);
    ctx.restore();
  }

  function drawShadow(x, y, w) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBackdrop() {
    ctx.fillStyle = '#0a0f18';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    // Horizon band + faint floor lines: enough to read "arena" without pulling
    // in environment.js (which draws to Neo.ctx).
    const floorY = GROUND_Y + 10;
    ctx.fillStyle = 'rgba(90,140,200,0.06)';
    ctx.fillRect(0, floorY, LOGICAL_W, LOGICAL_H - floorY);
    ctx.strokeStyle = 'rgba(132,195,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, floorY + 0.5);
    ctx.lineTo(LOGICAL_W, floorY + 0.5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(132,195,255,0.05)';
    for (let x = 18; x < LOGICAL_W; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, floorY);
      ctx.lineTo(x + 0.5, LOGICAL_H);
      ctx.stroke();
    }
  }

  // ── Per-anim hero pose (pure functions of phase) ─────────────────────────
  // pose: { dx, dy, scaleY, alpha, impactPh } — impactPh is when the dummy
  // takes the hit, so its reaction can be a pure function of phase too.

  function arcPose(ph) {
    const st = strikeT(ph);
    const windup = ph < STRIKE_START ? ph / STRIKE_START : 0;
    const dx = windup > 0 ? -windup * 3 : st < 1 ? Math.sin(st * Math.PI) * 5 : 0;
    return { dx, impactPh: STRIKE_START + (STRIKE_END - STRIKE_START) * 0.5 };
  }

  function beamPose(ph) {
    const st = strikeT(ph);
    const dx = st > 0 && st < 1 ? -Math.sin(st * Math.PI) * 2 : 0; // recoil
    return { dx, impactPh: STRIKE_START + 0.06 };
  }

  function ringPose(ph) {
    const st = strikeT(ph);
    const windup = ph < STRIKE_START ? ph / STRIKE_START : 1;
    const dy = ph < STRIKE_START ? -Math.sin(windup * Math.PI) * 14 : 0;
    const scaleY = st > 0 && st < 0.25 ? 1 - Math.sin((st / 0.25) * Math.PI) * 0.22 : 1;
    // Impact when the expanding ring's radius passes the dummy's distance.
    const impactGrow = (dummyX - HERO_X) / Math.max(1, heroReach);
    const impactPh = STRIKE_START + (STRIKE_END - STRIKE_START) * clamp(impactGrow / 1.3, 0.05, 0.95);
    return { dy, scaleY, impactPh };
  }

  function dashTravel(ph) {
    const st = strikeT(ph);
    if (st > 0 && st < 1) return easeOut(st);
    if (st >= 1) return Math.max(0, 1 - ((ph - STRIKE_END) / (1 - STRIKE_END)) * 1.4);
    return 0;
  }

  function dashPose(ph) {
    const st = strikeT(ph);
    const dx = heroReach * dashTravel(ph);
    const alpha = params.teleport
      ? (st > 0 && st < 0.5 ? 1 - st * 2 : st >= 0.5 && st < 1 ? (st - 0.5) * 2 : 1)
      : 1;
    // Impact as the hero passes the dummy.
    const passT = clamp((dummyX - HERO_X) / Math.max(1, heroReach), 0.1, 0.95);
    const impactPh = params.hits === false ? Infinity : STRIKE_START + (STRIKE_END - STRIKE_START) * passT;
    return { dx, alpha, impactPh };
  }

  function computePose(ph) {
    const base = { dx: 0, dy: 0, scaleY: 1, alpha: 1, impactPh: 0.45 };
    if (params.anim === 'arc') return { ...base, ...arcPose(ph) };
    if (params.anim === 'beam') return { ...base, ...beamPose(ph) };
    if (params.anim === 'ring') return { ...base, ...ringPose(ph) };
    return { ...base, ...dashPose(ph) };
  }

  // ── Per-anim effect drawing ──────────────────────────────────────────────

  function drawArcFx(ph, heroX, heroY) {
    const st = strikeT(ph);
    if (st <= 0 || st >= 1) return;
    // Sweep top-to-bottom past the dummy, same layered strokes as the in-game
    // swing overlay (entities.js drawPlayer).
    const sweepStart = params.arc;
    const sweepEnd = -params.arc;
    const currentTip = sweepStart + (sweepEnd - sweepStart) * st;
    const trailStart = currentTip + params.arc * 0.55;
    const fade = 0.9 * (1 - st * 0.5);
    ctx.save();
    ctx.translate(heroX, heroY);
    ctx.globalAlpha = fade * 0.35;
    ctx.strokeStyle = params.color;
    ctx.lineWidth = 10;
    ctx.shadowColor = params.color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, heroReach, trailStart, currentTip, true);
    ctx.stroke();
    ctx.globalAlpha = fade;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, heroReach, trailStart, currentTip, true);
    ctx.stroke();
    ctx.globalAlpha = fade * 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(0, 0, heroReach, currentTip + 0.12, currentTip, true);
    ctx.stroke();
    ctx.restore();
  }

  function drawBeamFx(ph, heroX, heroY) {
    const st = strikeT(ph);
    const muzzleX = heroX + HERO_SIZE * 0.4;
    if (ph < STRIKE_START) {
      // Charge glow at the muzzle.
      const c = ph / STRIKE_START;
      ctx.save();
      ctx.globalAlpha = 0.5 * c;
      ctx.fillStyle = params.color;
      ctx.shadowColor = params.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(muzzleX, heroY, 2 + c * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    if (st >= 1) return;
    ctx.save();
    const n = params.projectiles || 0;
    if (n >= 1) {
      // Traveling shots instead of a solid beam.
      for (let i = 0; i < n; i++) {
        const shotT = clamp(st * 1.4 - i * 0.12, 0, 1);
        if (shotT <= 0 || shotT >= 1) continue;
        const sx = muzzleX + (LOGICAL_W - muzzleX + 20) * shotT;
        const sy = heroY + (n > 1 ? (i - (n - 1) / 2) * 5 : 0);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = params.color;
        ctx.lineWidth = Math.max(2, params.width * 0.6);
        ctx.shadowColor = params.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(sx - 10, sy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 5, sy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
    } else {
      // Solid layered beam with a subtle width pulse.
      const fade = st > 0.8 ? (1 - st) / 0.2 : 1;
      const pulse = 1 + Math.sin(st * Math.PI * 6) * 0.15;
      ctx.globalAlpha = 0.25 * fade;
      ctx.strokeStyle = params.color;
      ctx.lineWidth = params.width * 2.4 * pulse;
      ctx.shadowColor = params.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(muzzleX, heroY);
      ctx.lineTo(LOGICAL_W + 4, heroY);
      ctx.stroke();
      ctx.globalAlpha = 0.85 * fade;
      ctx.lineWidth = params.width * pulse;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(muzzleX, heroY);
      ctx.lineTo(LOGICAL_W + 4, heroY);
      ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, params.width * 0.25);
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(muzzleX, heroY);
      ctx.lineTo(LOGICAL_W + 4, heroY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function hashAngles(key, count) {
    let h = 0;
    const s = String(key || 'x');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const angles = [];
    for (let i = 0; i < count; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      angles.push((h / 4294967295) * Math.PI * 2);
    }
    return angles;
  }

  function drawRingFx(ph, moveKey) {
    const st = strikeT(ph);
    if (st <= 0) return;
    const grow = easeOut(Math.min(1, st * 1.3));
    const fade = Math.max(0, 1 - st * 1.1);
    if (fade <= 0) return;
    const r = heroReach * grow;
    ctx.save();
    ctx.translate(HERO_X, GROUND_Y);
    // Filled low-alpha disc + expanding stroke, squashed into a ground ellipse.
    ctx.globalAlpha = 0.12 * fade;
    ctx.fillStyle = params.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = params.color;
    ctx.lineWidth = 3;
    ctx.shadowColor = params.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Extra rings for multi-burst moves.
    for (let i = 1; i < (params.rings || 1); i++) {
      const rr = r * (1 - i * 0.3);
      if (rr <= 4) continue;
      ctx.globalAlpha = 0.5 * fade;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Radial cracks, angles seeded from the move key.
    ctx.globalAlpha = 0.6 * fade;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    hashAngles(moveKey, 6).forEach(a => {
      const len = heroReach * (0.5 + grow * 0.5);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * len * 0.35, Math.sin(a) * len * 0.35 * 0.45);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len * 0.45);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawDashFx(ph, heroDx, heroY) {
    const st = strikeT(ph);
    if (st <= 0 || st >= 1) return;
    if (params.teleport) {
      // Silhouette left behind at the origin.
      blitSprite(heroKey, HERO_X, heroY, HERO_SIZE, {
        alpha: 0.3 * (1 - st),
        shadowColor: params.color,
        shadowBlur: 12,
      });
      return;
    }
    // Afterimages + speed lines behind the hero.
    const ghosts = params.ghosts || 3;
    for (let i = 1; i <= ghosts; i++) {
      const gx = HERO_X + heroDx * (1 - i / (ghosts + 1));
      blitSprite(heroKey, gx, heroY, HERO_SIZE, {
        alpha: 0.28 * (1 - i / (ghosts + 1)),
        shadowColor: params.color,
        shadowBlur: 8,
      });
    }
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = params.color;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const ly = heroY - 6 + i * 12;
      ctx.beginPath();
      ctx.moveTo(HERO_X + heroDx - 26, ly);
      ctx.lineTo(HERO_X + heroDx - 8, ly);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Dummy ────────────────────────────────────────────────────────────────
  // Hit reaction as a pure function of phase — no persistent physics, so the
  // loop reset is free.

  function hitState(ph, impactPh) {
    if (params.hits === false || ph <= impactPh) return { flash: 0, kb: 0 };
    const since = ph - impactPh;
    const flash = Math.max(0, 1 - since / 0.22);
    const kbOut = easeOut(Math.min(1, since / 0.12));
    const settle = Math.max(0.05, 0.95 - impactPh - 0.2);
    const kbBack = since > 0.2 ? Math.max(0, 1 - (since - 0.2) / settle) : 1;
    return { flash, kb: kbOut * kbBack };
  }

  function drawDummy(ph, impactPh, t) {
    const { flash, kb } = hitState(ph, impactPh);
    const x = dummyX + kb * params.push;
    const bob = Math.sin(t * 2.2 + 1.7) * 1.2;
    const y = GROUND_Y - DUMMY_SIZE / 2 + bob;
    drawShadow(x, GROUND_Y + 8, DUMMY_SIZE * 0.34);
    const img = flash > 0.25 && dummyFlash ? dummyFlash : dummyPlain;
    if (img) {
      ctx.save();
      ctx.translate(x, y);
      // Lean away while knocked back.
      ctx.rotate(kb * 0.22);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, -DUMMY_SIZE / 2, -DUMMY_SIZE / 2);
      ctx.restore();
    }
    if (flash > 0) {
      ctx.save();
      ctx.globalAlpha = flash * 0.7;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      const burst = 6 + (1 - flash) * 10;
      for (let i = 0; i < 4; i++) {
        const a = -0.6 + i * 0.45;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * burst, y + Math.sin(a) * burst);
        ctx.lineTo(x + Math.cos(a) * (burst + 5), y + Math.sin(a) * (burst + 5));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Frame ────────────────────────────────────────────────────────────────

  function renderFrame(ph, t) {
    drawBackdrop();
    prerenderDummy();
    if (!Neo.SPRITE_ATLAS?.canvas) return; // sprites pop in once the atlas builds

    const bob = Math.sin(t * 3) * 1.5;
    const heroBaseY = GROUND_Y - HERO_SIZE / 2 + bob;
    const pose = computePose(ph);
    const heroX = HERO_X + pose.dx;
    const heroY = heroBaseY + pose.dy;
    const moveKey = lastArgs?.moveKey || lastArgs?.weaponKey || '';

    // Ground effects + afterimages read behind the actors.
    if (params.anim === 'ring') drawRingFx(ph, moveKey);
    if (params.anim === 'dash') drawDashFx(ph, pose.dx, heroBaseY);

    drawDummy(ph, pose.impactPh, t);

    drawShadow(heroX, GROUND_Y + 8, HERO_SIZE * 0.34);
    blitSprite(heroKey, heroX, heroY, HERO_SIZE, {
      alpha: pose.alpha,
      scaleY: pose.scaleY,
    });

    // Swing / beam effects read in front of the hero.
    if (params.anim === 'arc') drawArcFx(ph, heroX, heroY);
    if (params.anim === 'beam') drawBeamFx(ph, heroX, heroY);
  }

  function step(ts) {
    if (!ctx) return;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    phaseTime += dt;
    renderFrame((phaseTime % CYCLE) / CYCLE, phaseTime);
    raf = requestAnimationFrame(step);
  }

  function pause() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function ensureObserver() {
    if (observer) return;
    const el = document.getElementById('charSelect');
    if (!el) return;
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
    if (!(canvasEl instanceof HTMLCanvasElement) || !args?.slot) return;
    ensureObserver();
    pause();
    canvas = canvasEl;
    lastArgs = { ...args };
    if (charSelectHidden()) return; // resume via the observer when revealed

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;
    ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    heroKey = args.heroKey || 'thorn_knight';
    params = resolveParams(args);
    computeLayout();
    phaseTime = 0;

    if (reduceMotion()) {
      // Single static frame at the impact pose; no loop.
      renderFrame(0.47, 0.47);
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
    params = null;
  }

  Neo.MovePreview = { show, stop };
})();
