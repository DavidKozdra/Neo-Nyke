(function menuBackground() {
  const bg  = document.getElementById('menuBg');
  const bg2 = document.getElementById('charBg');
  if (!bg) return;
  const ctx  = bg.getContext('2d');
  const ctx2 = bg2 ? bg2.getContext('2d') : null;

  function resize() {
    bg.width  = window.innerWidth;
    bg.height = window.innerHeight;
    if (bg2) { bg2.width = window.innerWidth; bg2.height = window.innerHeight; }
  }
  resize();
  window.addEventListener('resize', resize);

  const SPRITES = window.NeoNykeSpriteDefs || {};

  function drawPixelSprite(c, key, cx, cy, scale, flipX) {
    const def = SPRITES[key];
    if (!def) return;
    const cols = def.pixels[0].length, rows = def.pixels.length;
    const ox = cx - (cols * scale) / 2;
    const oy = cy - (rows * scale) / 2;
    def.pixels.forEach((row, ry) => {
      for (let rx2 = 0; rx2 < row.length; rx2++) {
        const ch = row[rx2];
        if (ch === '.') continue;
        const px = flipX ? (cols - 1 - rx2) : rx2;
        c.fillStyle = def.palette[ch] || '#ff00ff';
        c.fillRect(ox + px * scale, oy + ry * scale, scale, scale);
      }
    });
  }

  function drawSword(c, x, y, angle, len, color, alpha) {
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.rotate(angle);
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.shadowColor = color;
    c.shadowBlur = 16;
    c.beginPath(); c.moveTo(0, -len * 0.5); c.lineTo(0, len * 0.5); c.stroke();
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(-10, len * 0.12); c.lineTo(10, len * 0.12); c.stroke();
    c.fillStyle = color;
    c.beginPath(); c.arc(0, len * 0.5, 3.5, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  const sparks = [];
  const rings  = [];

  function spawnClash(cx, cy) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 4.5;
      const col = ['#f0f5ff', '#b7c7de', '#90a5c2', '#7a8faa'][i % 4];
      sparks.push({ x: cx, y: cy, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
        life: 1, maxLife: 0.4 + Math.random() * 0.5, color: col, r: 1.5 + Math.random() * 2 });
    }
    rings.push({ x: cx, y: cy, r: 0, maxR: 85 + Math.random() * 65, life: 1,
      color: ['#95abc8', '#b8cae0', '#e6effb'][Math.floor(Math.random() * 3)] });
  }

  const MOTE_COUNT = 40;
  const motes = [];
  function newMote(W, H, ry2) {
    return { x: Math.random() * W, y: ry2 + Math.random() * (H - ry2) * 0.9,
      vy: -(0.18 + Math.random() * 0.38), vx: (Math.random() - 0.5) * 0.15,
      life: 1, decay: 1 / (150 + Math.random() * 220),
      r: 0.7 + Math.random() * 1.3,
          col: Math.random() < 0.55 ? '#8fa6c5' : '#6f84a0' };
  }

  const CLASH_INTERVAL = 90;
  let clashPhase = 'approaching', clashFrame = 0;
  const F_SCALE = 8, F_KEYS = ['thorn_knight', 'god'];
  let brazierT = 0;

  function renderScene(c, W, H, dt) {
    c.clearRect(0, 0, W, H);
    brazierT += dt * 0.045;

    const wall = 28;
    const rw = W, rh = H;
    const rox = 0, roy = 0;

    c.fillStyle = '#0f0d0c';
    c.fillRect(0, 0, W, H);

    c.save();
    c.beginPath();
    c.rect(rox, roy, rw, rh);
    c.clip();

    c.strokeStyle = 'rgba(130, 151, 177, 0.08)';
    c.lineWidth = 1;
    for (let x = rox; x <= rox + rw; x += 48) {
      c.beginPath(); c.moveTo(x, roy); c.lineTo(x, roy + rh); c.stroke();
    }
    for (let y = roy; y <= roy + rh; y += 48) {
      c.beginPath(); c.moveTo(rox, y); c.lineTo(rox + rw, y); c.stroke();
    }

    c.shadowColor = '#6f84a2';
    c.shadowBlur = 18;
    c.strokeStyle = '#8fa8ca';
    c.lineWidth = wall;
    c.strokeRect(rox + wall/2, roy + wall/2, rw - wall, rh - wall);
    c.shadowBlur = 0;

    c.restore();

    const pw = 28, ph = 42;
    [
      [rox + wall,          roy + wall],
      [rox + rw - wall - pw, roy + wall],
      [rox + wall,          roy + rh - wall - ph],
      [rox + rw - wall - pw, roy + rh - wall - ph],
    ].forEach(([px, py]) => {
      c.save();
      c.fillStyle = '#2a221b';
      c.strokeStyle = '#8fa8ca';
      c.lineWidth = 2;
      c.shadowColor = '#8fa8ca';
      c.shadowBlur = 8;
      c.fillRect(px, py, pw, ph);
      c.strokeRect(px, py, pw, ph);
      c.restore();
    });

    const cx = rox + rw / 2, cy = roy + rh / 2;
    const brazPos = [
      [rox + wall + pw + 40, roy + wall + 18],
      [rox + rw - wall - pw - 40, roy + wall + 18],
      [rox + wall + pw + 40, roy + rh - wall - 18],
      [rox + rw - wall - pw - 40, roy + rh - wall - 18],
    ];
    brazPos.forEach(([bx, by], i) => {
      const flick = 1 + Math.sin(brazierT * 3.1 + i * 1.3) * 0.13;
      c.save();
      c.fillStyle = `rgba(255,120,60,${0.68 + Math.sin(brazierT * 4 + i) * 0.08})`;
      c.shadowColor = '#ff7b39';
      c.shadowBlur = 18 + Math.sin(brazierT * 2.5 + i) * 6;
      c.beginPath();
      c.arc(bx, by, 10 * flick, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
      const fg = c.createRadialGradient(bx, by, 0, bx, by, 60);
      fg.addColorStop(0, 'rgba(255,110,30,0.09)');
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = fg;
      c.beginPath();
      c.ellipse(bx, by + 8, 60, 28, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    });

    while (motes.length < MOTE_COUNT) motes.push(newMote(W, H, roy));
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.x += m.vx; m.y += m.vy;
      m.life -= m.decay;
      if (m.life <= 0 || m.y < roy) { motes[i] = newMote(W, H, roy); continue; }
      c.save();
      c.globalAlpha = m.life * 0.4;
      c.fillStyle = m.col;
      c.shadowColor = m.col;
      c.shadowBlur = 4;
      c.beginPath(); c.arc(m.x, m.y, m.r, 0, Math.PI * 2); c.fill();
      c.restore();
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.r += (rg.maxR - rg.r) * 0.1;
      rg.life -= 0.022;
      if (rg.life <= 0) { rings.splice(i, 1); continue; }
      c.save();
      c.globalAlpha = rg.life * 0.78;
      c.strokeStyle = rg.color;
      c.lineWidth = 2.5;
      c.shadowColor = rg.color;
      c.shadowBlur = 22;
      c.beginPath(); c.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2); c.stroke();
      c.restore();
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vy += 0.09;
      s.life -= dt / s.maxLife;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      c.save();
      c.globalAlpha = s.life * 0.9;
      c.fillStyle = s.color;
      c.shadowColor = s.color; c.shadowBlur = 8;
      c.beginPath(); c.arc(s.x, s.y, s.r * s.life, 0, Math.PI * 2); c.fill();
      c.restore();
    }

    const fightY = roy + rh * 0.68;
    const APPROACH = 90, FAR = Math.min(W * 0.22, 280);

    if (clashPhase === 'approaching') {
      clashFrame = Math.min(clashFrame + 1, CLASH_INTERVAL);
      if (clashFrame >= CLASH_INTERVAL) {
        clashPhase = 'clashing'; clashFrame = 0;
        spawnClash(cx, fightY - 14);
      }
    } else if (clashPhase === 'clashing') {
      if (++clashFrame > 18) { clashPhase = 'recoiling'; clashFrame = 0; }
    } else {
      clashFrame = Math.min(clashFrame + 1, 55);
      if (clashFrame >= 55) { clashPhase = 'approaching'; clashFrame = 0; }
    }

    const sep = clashPhase === 'approaching'
      ? FAR - (FAR - APPROACH) * (clashFrame / CLASH_INTERVAL)
      : clashPhase === 'clashing'
        ? APPROACH + Math.sin((clashFrame / 18) * Math.PI) * 16
        : APPROACH + (FAR - APPROACH) * (clashFrame / 55);

    const lx = cx - sep / 2, rx2 = cx + sep / 2;

    [lx, rx2].forEach(fx => {
      c.save();
      c.globalAlpha = 0.35;
      const sg = c.createRadialGradient(fx, fightY + 30, 0, fx, fightY + 30, 50);
      sg.addColorStop(0, 'rgba(0,0,0,.8)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sg;
      c.beginPath(); c.ellipse(fx, fightY + 30, 50, 16, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    });

    drawPixelSprite(c, F_KEYS[0], lx,  fightY, F_SCALE, false);
    drawPixelSprite(c, F_KEYS[1], rx2, fightY, F_SCALE, true);

    const swing = clashPhase === 'clashing' ? Math.sin((clashFrame / 18) * Math.PI) * 0.28 : 0;
    drawSword(c, lx  + 20, fightY - 14, -Math.PI * 0.28 - swing, 62, '#c0d1e7', 0.92);
    drawSword(c, rx2 - 20, fightY - 14,  Math.PI * 1.28 + swing, 62, '#8da5c5', 0.92);

    if (clashPhase === 'clashing' && clashFrame < 8) {
      const fa = (1 - clashFrame / 8) * 0.48;
      c.save();
      const fg2 = c.createRadialGradient(cx, fightY - 12, 0, cx, fightY - 12, 140);
      fg2.addColorStop(0,   `rgba(218,230,246,${fa})`);
      fg2.addColorStop(0.5, `rgba(139,165,198,${fa * 0.45})`);
      fg2.addColorStop(1,   'rgba(0,0,0,0)');
      c.fillStyle = fg2;
      c.fillRect(rox, roy, rw, rh);
      c.restore();
    }

    const spotY = fightY;
    const vg = c.createRadialGradient(W/2, spotY, Math.min(W,H)*0.18, W/2, spotY, Math.max(W,H)*0.85);
    vg.addColorStop(0,   'rgba(0,0,0,0)');
    vg.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    vg.addColorStop(1,   'rgba(0,0,0,0.88)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    const tg = c.createLinearGradient(0, 0, 0, H * 0.45);
    tg.addColorStop(0,   'rgba(0,0,0,0.72)');
    tg.addColorStop(1,   'rgba(0,0,0,0)');
    c.fillStyle = tg; c.fillRect(0, 0, W, H * 0.45);
  }

  let raf, lastTs = 0;
  function draw(ts) {
    const dt = Math.min((ts - lastTs) / 16.67, 2);
    lastTs = ts;

    const startEl = document.getElementById('start');
    const charEl  = document.getElementById('charSelect');
    const startVis = startEl && !startEl.classList.contains('hidden');
    const charVis  = charEl  && !charEl.classList.contains('hidden');
    if (!startVis && !charVis) { cancelAnimationFrame(raf); return; }

    const W = bg.width, H = bg.height;
    if (startVis) renderScene(ctx,  W, H, dt);
    if (charVis && ctx2) renderScene(ctx2, W, H, dt);

    raf = requestAnimationFrame(draw);
  }

  const startEl = document.getElementById('start');
  const charEl  = document.getElementById('charSelect');
  function onVisChange() {
    const startVis = startEl && !startEl.classList.contains('hidden');
    const charVis  = charEl  && !charEl.classList.contains('hidden');
    if (startVis || charVis) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
  }
  if (startEl) new MutationObserver(onVisChange).observe(startEl, { attributes: true, attributeFilter: ['class'] });
  if (charEl)  new MutationObserver(onVisChange).observe(charEl,  { attributes: true, attributeFilter: ['class'] });
  raf = requestAnimationFrame(draw);

  (function animateTitle() {
    const container  = document.getElementById('menuLetters');
    const subtitleEl = document.getElementById('menuSubtitle');
    if (!container) return;

    const TITLE = 'NEO NYKE';
    const TILTS = ['-8deg','5deg','-4deg','6deg','0deg','-5deg','7deg','-3deg'];
    let letterEls = [];

    TITLE.split('').forEach((ch, i) => {
      const span = document.createElement('span');
      span.textContent = ch === ' ' ? ' ' : ch;
      span.className   = ch === ' ' ? 'menu-letter space' : 'menu-letter';
      span.style.setProperty('--tilt', TILTS[i] || '0deg');
      container.appendChild(span);
      if (ch !== ' ') letterEls.push({ el: span, delay: 320 + i * 95 });
    });

    letterEls.forEach(({ el, delay }) => {
      setTimeout(() => {
        el.classList.add('landed');
      }, delay);
    });

    const lastDelay = letterEls[letterEls.length - 1]?.delay || 800;
    setTimeout(() => {
      subtitleEl && subtitleEl.classList.add('visible');
    }, lastDelay + 260);
  })();
})();
