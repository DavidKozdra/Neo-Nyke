(function menuBackground() {
  const bg  = document.getElementById('menuBg');
  const bg2 = document.getElementById('charBg');
  const bg3 = document.getElementById('creditsBg');
  if (!bg) return;
  let ctx  = bg.getContext('2d');
  let ctx2 = bg2 ? bg2.getContext('2d') : null;
  let ctx3 = bg3 ? bg3.getContext('2d') : null;
  function resetContexts() {
    ctx = bg.getContext('2d');
    ctx2 = bg2 ? bg2.getContext('2d') : null;
    ctx3 = bg3 ? bg3.getContext('2d') : null;
    [ctx, ctx2, ctx3].forEach(g => { if (g) g.imageSmoothingEnabled = false; });
    tileCache = null;
    atlas = null;
    atlasIndex = {};
  }

  let tileCache = null;

  function resize() {
    bg.width  = window.innerWidth;
    bg.height = window.innerHeight;
    if (bg2) { bg2.width = window.innerWidth; bg2.height = window.innerHeight; }
    if (bg3) { bg3.width = window.innerWidth; bg3.height = window.innerHeight; }
    tileCache = null;
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Tile rendering (mirrors game.js asset pipeline) ─────────────────────
  const TILE_SRC  = window.NeoNykeEnvironmentTileDefs || {};
  const SRC_SIZE  = TILE_SRC.sourceSize || 16;
  const TILE_DEFS = TILE_SRC.tiles || {};
  const TILE_PX   = 48;

  function drawFloorAsset(g, ox, oy, s, def) {
    g.fillStyle = def.shade || '#252823';
    g.fillRect(ox, oy + s - 3, s, 3);
    g.fillRect(ox + s - 3, oy, 3, s);
    g.fillStyle = def.edge || '#4c5047';
    g.fillRect(ox + 1, oy + 1, s - 3, 1);
    g.fillRect(ox + 1, oy + 1, 1, s - 3);
    g.strokeStyle = def.mortar || '#1c1f1d';
    g.lineWidth = 1;
    g.strokeRect(ox + 0.5, oy + 0.5, s - 1, s - 1);
  }

  function drawWallAsset(g, ox, oy, s, def) {
    g.fillStyle = def.shade || '#202722';
    g.fillRect(ox, oy + 8, s, 8);
    g.fillStyle = def.edge || '#586257';
    g.fillRect(ox + 1, oy + 1, s - 2, 2);
    g.fillRect(ox + 1, oy + 8, s - 2, 1);
    g.strokeStyle = def.mortar || '#151917';
    g.lineWidth = 1;
    g.strokeRect(ox + 0.5, oy + 0.5, s - 1, s - 1);
    g.beginPath();
    g.moveTo(ox + 7.5, oy); g.lineTo(ox + 7.5, oy + 8);
    g.moveTo(ox + 11.5, oy + 8); g.lineTo(ox + 11.5, oy + s);
    g.stroke();
  }

  function drawCracks(g, ox, oy, def) {
    if (!Array.isArray(def.cracks)) return;
    g.strokeStyle = def.mortar || '#151917';
    g.lineWidth = 1;
    def.cracks.forEach(pts => {
      if (!pts || pts.length < 4) return;
      g.beginPath();
      g.moveTo(ox + pts[0], oy + pts[1]);
      for (let i = 2; i < pts.length - 1; i += 2) g.lineTo(ox + pts[i], oy + pts[i + 1]);
      g.stroke();
    });
  }

  function drawChips(g, ox, oy, def) {
    if (!Array.isArray(def.chips)) return;
    g.fillStyle = def.shade || '#252823';
    def.chips.forEach(c => { if (c && c.length >= 4) g.fillRect(ox + c[0], oy + c[1], c[2], c[3]); });
  }

  function drawPixelTile(g, ox, oy, s, def) {
    if (!def || !Array.isArray(def.pixels)) return false;
    const sourceSize = Number(def.pixelSize || def.pixels.length || SRC_SIZE) || SRC_SIZE;
    const cellW = s / sourceSize;
    const cellH = s / sourceSize;
    def.pixels.forEach((row, py) => {
      if (typeof row !== 'string') return;
      for (let px = 0; px < row.length; px += 1) {
        const color = row[px];
        if (color === '.' || color === ' ') continue;
        g.fillStyle = def.palette?.[color] || '#ff00ff';
        g.fillRect(ox + px * cellW, oy + py * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    });
    return true;
  }

  function drawTileOnto(g, key, ox, oy, s) {
    const def = TILE_DEFS[key];
    if (!def) { g.fillStyle = '#30342f'; g.fillRect(ox, oy, s, s); return; }
    if (typeof window.Neo?.drawEnvironmentTileAsset === 'function') {
      window.Neo.drawEnvironmentTileAsset(g, ox, oy, s, def);
      return;
    }
    if (drawPixelTile(g, ox, oy, s, def)) return;
    g.fillStyle = def.base || '#343832';
    g.fillRect(ox, oy, s, s);
    if (def.kind === 'floor' || def.kind === 'plank') drawFloorAsset(g, ox, oy, s, def);
    else if (def.kind === 'wall') drawWallAsset(g, ox, oy, s, def);
    drawCracks(g, ox, oy, def);
    drawChips(g, ox, oy, def);
  }

  // ── Tile atlas (one canvas, one draw per tile key) ───────────────────────
  let atlas = null;
  let atlasIndex = {};

  function buildAtlas() {
    const keys = Object.keys(TILE_DEFS);
    if (!keys.length) return;
    const c = document.createElement('canvas');
    c.width = SRC_SIZE * keys.length;
    c.height = SRC_SIZE;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    keys.forEach((key, i) => {
      const ox = i * SRC_SIZE;
      atlasIndex[key] = { x: ox, y: 0, w: SRC_SIZE, h: SRC_SIZE };
      drawTileOnto(g, key, ox, 0, SRC_SIZE);
    });
    atlas = c;
  }

  function blitTile(g, key, dx, dy, size) {
    if (!atlas) return;
    const fr = atlasIndex[key];
    if (!fr) return;
    g.imageSmoothingEnabled = false;
    g.drawImage(atlas, fr.x, fr.y, fr.w, fr.h, dx, dy, size, size);
  }

  // ── Dungeon layout ───────────────────────────────────────────────────────
  // Grid of rooms, each with a floor and wall tile key.
  const THEMES = [
    { floor: 'floor_stone_a',    wall: 'wall_stone' },
    { floor: 'floor_stone_b',    wall: 'wall_stone' },
    { floor: 'floor_stone_cracked', wall: 'wall_stone' },
    { floor: 'floor_boss',       wall: 'wall_boss'  },
    { floor: 'floor_stone_moss', wall: 'wall_stone' },
  ];

  // Room grid: GRID_W × GRID_H rooms, each ROOM_COLS × ROOM_ROWS tiles
  const ROOM_COLS = 14;
  const ROOM_ROWS = 10;
  const WALL_TILES = 2; // wall thickness in tiles
  const ROOM_W_PX  = ROOM_COLS * TILE_PX;
  const ROOM_H_PX  = ROOM_ROWS * TILE_PX;
  const GRID_W = 4;
  const GRID_H = 3;

  function seededRand(x, y, salt) {
    const v = Math.sin(x * 127.1 + y * 311.7 + salt * 101.9) * 43758.5453;
    return v - Math.floor(v);
  }

  function buildTileCache() {
    const W = GRID_W * ROOM_W_PX;
    const H = GRID_H * ROOM_H_PX;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const theme = THEMES[Math.floor(seededRand(gx, gy, 0) * THEMES.length)];
        const rx = gx * ROOM_W_PX;
        const ry = gy * ROOM_H_PX;

        for (let ty = 0; ty < ROOM_ROWS; ty++) {
          for (let tx = 0; tx < ROOM_COLS; tx++) {
            const isWall = tx < WALL_TILES || ty < WALL_TILES ||
                           tx >= ROOM_COLS - WALL_TILES || ty >= ROOM_ROWS - WALL_TILES;
            const key = isWall ? theme.wall : theme.floor;
            // Vary floor tiles slightly
            const floorKeys = [theme.floor];
            if (theme.floor === 'floor_stone_a') floorKeys.push('floor_stone_b', 'floor_stone_cracked');
            const pick = isWall ? theme.wall
              : floorKeys[Math.floor(seededRand(gx * ROOM_COLS + tx, gy * ROOM_ROWS + ty, 3) * floorKeys.length)];
            blitTile(g, pick, rx + tx * TILE_PX, ry + ty * TILE_PX, TILE_PX);
          }
        }

        // Corridor openings — cut door-width gaps in walls (N/S/E/W)
        const doorW  = 3 * TILE_PX;
        const doorOX = Math.floor((ROOM_COLS - 3) / 2) * TILE_PX;
        const doorOY = Math.floor((ROOM_ROWS - 3) / 2) * TILE_PX;
        const floorKey = theme.floor;
        // North door
        for (let dx = 0; dx < 3; dx++)
          for (let dy = 0; dy < WALL_TILES; dy++)
            blitTile(g, floorKey, rx + doorOX + dx * TILE_PX, ry + dy * TILE_PX, TILE_PX);
        // South door
        for (let dx = 0; dx < 3; dx++)
          for (let dy = 0; dy < WALL_TILES; dy++)
            blitTile(g, floorKey, rx + doorOX + dx * TILE_PX, ry + (ROOM_ROWS - WALL_TILES + dy) * TILE_PX, TILE_PX);
        // West door
        for (let dy = 0; dy < 3; dy++)
          for (let dx = 0; dx < WALL_TILES; dx++)
            blitTile(g, floorKey, rx + dx * TILE_PX, ry + doorOY + dy * TILE_PX, TILE_PX);
        // East door
        for (let dy = 0; dy < 3; dy++)
          for (let dx = 0; dx < WALL_TILES; dx++)
            blitTile(g, floorKey, rx + (ROOM_COLS - WALL_TILES + dx) * TILE_PX, ry + doorOY + dy * TILE_PX, TILE_PX);
      }
    }

    tileCache = c;
  }

  // ── Camera pan ───────────────────────────────────────────────────────────
  // Slow continuous drift across the dungeon grid, looping seamlessly.
  const TOTAL_W = GRID_W * ROOM_W_PX;
  const TOTAL_H = GRID_H * ROOM_H_PX;
  const PAN_SPEED_X = 0.18; // px/frame at 60fps
  const PAN_SPEED_Y = 0.10;
  let camX = 0, camY = 0;

  // ── Atmosphere particles (motes) ─────────────────────────────────────────
  const MOTE_COUNT = 50;
  const motes = [];
  function newMote(W, H) {
    return {
      x: Math.random() * W, y: Math.random() * H,
      vy: -(0.15 + Math.random() * 0.32), vx: (Math.random() - 0.5) * 0.12,
      life: 1, decay: 1 / (180 + Math.random() * 240),
      r: 0.6 + Math.random() * 1.4,
      col: Math.random() < 0.55 ? '#8fa6c5' : '#6f84a0',
    };
  }

  // ── Render ───────────────────────────────────────────────────────────────
  let brazierT = 0;

  function renderScene(c, W, H, dt) {
    c.clearRect(0, 0, W, H);
    brazierT += dt * 0.045;

    // Build atlas + cache lazily (after sprites loaded)
    if (!atlas && Object.keys(TILE_DEFS).length) buildAtlas();
    if (!tileCache && atlas) buildTileCache();

    // ── Tiled dungeon background ──
    if (tileCache) {
      // Advance camera
      camX = (camX + PAN_SPEED_X * dt) % TOTAL_W;
      camY = (camY + PAN_SPEED_Y * dt) % TOTAL_H;

      const startX = Math.floor(camX);
      const startY = Math.floor(camY);

      // Tile the cache across the viewport with wrapping
      for (let oy = -startY; oy < H; oy += TOTAL_H) {
        for (let ox = -startX; ox < W; ox += TOTAL_W) {
          c.imageSmoothingEnabled = false;
          c.drawImage(tileCache, ox, oy);
        }
      }
    } else {
      c.fillStyle = '#0f0d0c';
      c.fillRect(0, 0, W, H);
    }

    // ── Braziers at each room corner ──
    if (tileCache) {
      const cornersPerRoom = [
        [WALL_TILES * TILE_PX + 20,  WALL_TILES * TILE_PX + 14],
        [ROOM_W_PX - WALL_TILES * TILE_PX - 20, WALL_TILES * TILE_PX + 14],
      ];
      let bi = 0;
      for (let gy = 0; gy < GRID_H + 1; gy++) {
        for (let gx = 0; gx < GRID_W + 1; gx++) {
          for (const [lx, ly] of cornersPerRoom) {
            const wx = (gx * ROOM_W_PX + lx - camX % TOTAL_W + TOTAL_W * 2) % TOTAL_W;
            const wy = (gy * ROOM_H_PX + ly - camY % TOTAL_H + TOTAL_H * 2) % TOTAL_H;
            if (wx < 0 || wx > W || wy < 0 || wy > H) { bi++; continue; }
            const flick = 1 + Math.sin(brazierT * 3.1 + bi * 1.7) * 0.14;
            c.save();
            c.fillStyle = `rgba(255,120,60,${0.65 + Math.sin(brazierT * 4 + bi) * 0.08})`;
            c.shadowColor = '#ff7b39';
            c.shadowBlur = 16 + Math.sin(brazierT * 2.5 + bi) * 5;
            c.beginPath(); c.arc(wx, wy, 8 * flick, 0, Math.PI * 2); c.fill();
            c.shadowBlur = 0;
            const fg = c.createRadialGradient(wx, wy, 0, wx, wy, 52);
            fg.addColorStop(0, 'rgba(255,110,30,0.10)');
            fg.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = fg;
            c.beginPath(); c.ellipse(wx, wy + 6, 52, 22, 0, 0, Math.PI * 2); c.fill();
            c.restore();
            bi++;
          }
        }
      }
    }

    // ── Atmospheric vignette ──
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.85);
    vg.addColorStop(0,   'rgba(0,0,0,0)');
    vg.addColorStop(0.5, 'rgba(0,0,0,0.32)');
    vg.addColorStop(1,   'rgba(0,0,0,0.92)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);

    // Top fade so title sits cleanly
    const tg = c.createLinearGradient(0, 0, 0, H * 0.42);
    tg.addColorStop(0, 'rgba(0,0,0,0.78)');
    tg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = tg; c.fillRect(0, 0, W, H * 0.42);

    // Bottom fade for meta bar
    const bg_ = c.createLinearGradient(0, H * 0.72, 0, H);
    bg_.addColorStop(0, 'rgba(0,0,0,0)');
    bg_.addColorStop(1, 'rgba(0,0,0,0.82)');
    c.fillStyle = bg_; c.fillRect(0, H * 0.72, W, H * 0.28);

    // ── Floating motes ──
    while (motes.length < MOTE_COUNT) motes.push(newMote(W, H));
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.x += m.vx; m.y += m.vy;
      m.life -= m.decay;
      if (m.life <= 0 || m.y < 0) { motes[i] = newMote(W, H); motes[i].y = H; continue; }
      c.save();
      c.globalAlpha = m.life * 0.38;
      c.fillStyle = m.col;
      c.shadowColor = m.col; c.shadowBlur = 4;
      c.beginPath(); c.arc(m.x, m.y, m.r, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }

  let raf, lastTs = 0;
  function draw(ts) {
    const dt = Math.min((ts - lastTs) / 16.67, 2);
    lastTs = ts;

    const startEl   = document.getElementById('start');
    const charEl    = document.getElementById('charSelect');
    const creditsEl = document.getElementById('creditsPanel');
    const startVis   = startEl   && !startEl.classList.contains('hidden');
    const charVis    = charEl    && !charEl.classList.contains('hidden');
    const creditsVis = creditsEl && !creditsEl.classList.contains('hidden');
    if (!startVis && !charVis && !creditsVis) { cancelAnimationFrame(raf); return; }

    const W = bg.width, H = bg.height;
    if (startVis) renderScene(ctx,  W, H, dt);
    if (charVis && ctx2) renderScene(ctx2, W, H, dt);
    if (creditsVis && ctx3) renderScene(ctx3, W, H, dt);

    raf = requestAnimationFrame(draw);
  }

  const startEl = document.getElementById('start');
  const charEl  = document.getElementById('charSelect');
  const creditsEl = document.getElementById('creditsPanel');
  function onVisChange() {
    const startVis = startEl && !startEl.classList.contains('hidden');
    const charVis  = charEl  && !charEl.classList.contains('hidden');
    const creditsVis = creditsEl && !creditsEl.classList.contains('hidden');
    if (startVis || charVis || creditsVis) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
  }
  [bg, bg2, bg3].forEach(canvas => {
    if (!canvas) return;
    canvas.addEventListener('contextlost', event => event.preventDefault());
    canvas.addEventListener('contextrestored', () => {
      resetContexts();
      lastTs = 0;
      onVisChange();
    });
  });
  if (startEl) new MutationObserver(onVisChange).observe(startEl, { attributes: true, attributeFilter: ['class'] });
  if (charEl)  new MutationObserver(onVisChange).observe(charEl,  { attributes: true, attributeFilter: ['class'] });
  if (creditsEl) new MutationObserver(onVisChange).observe(creditsEl, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastTs = 0; onVisChange(); } });
  raf = requestAnimationFrame(draw);

  animateMenuTitle(
    document.getElementById('menuLetters'),
    document.getElementById('menuSubtitle')
  );
})();

/**
 * Build + animate the cinematic "NEO - NYKE" title (the same component used on
 * the main menu and the pause overlay). Clears any prior letters so it can be
 * replayed each time the host overlay opens.
 */
function animateMenuTitle(container, subtitleEl) {
  if (!container) return;

  const TITLE = 'NEO - NYKE';
  const TILTS = ['-8deg','5deg','-4deg','6deg','0deg','-5deg','7deg','-3deg'];

  container.replaceChildren();
  subtitleEl && subtitleEl.classList.remove('visible');

  TITLE.split('').forEach((ch, i) => {
    const span = document.createElement('span');
    span.textContent = ch === ' ' ? ' ' : ch;
    span.className   = ch === ' ' ? 'menu-letter space' : 'menu-letter';
    span.style.setProperty('--tilt', TILTS[i] || '0deg');
    container.appendChild(span);
    if (ch !== ' ') setTimeout(() => span.classList.add('landed'), 320 + i * 95);
  });

  const lastDelay = 320 + (TITLE.replace(/ /g, '').length - 1) * 95;
  setTimeout(() => subtitleEl && subtitleEl.classList.add('visible'), lastDelay + 260);
}
window.NeoAnimateMenuTitle = animateMenuTitle;
