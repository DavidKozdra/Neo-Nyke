// credits.js — life for the Credits page.
// 1) Draws the role-card avatar sprites from the game's sprite atlas.
// 2) Animates a "curtain call" parade of heroes drifting across the page.
// Plain deferred script (like menu-background.js) so it shares the Neo global.
(function creditsPage() {
  const panel  = document.getElementById('creditsPanel');
  const parade = document.getElementById('creditsParade');
  if (!panel) return;

  const Neo = window.Neo || {};

  // Heroes paraded across the bottom, in roster order. Sprite keys match the
  // char-select cards (data-char-sprite). Each gets a tint hint for its glow.
  const PARADE = [
    { key: 'princess',     glow: 'rgba(255,120,210,0.5)' },
    { key: 'thorn_knight', glow: 'rgba(120,196,255,0.5)' },
    { key: 'metao',        glow: 'rgba(150,120,255,0.5)' },
    { key: 'granialla',    glow: 'rgba(255,210,120,0.5)' },
    { key: 'mooggy',       glow: 'rgba(255,90,90,0.5)'   },
  ];

  // ── Avatar sprites in the two role cards ──────────────────────────────────
  function drawAvatars() {
    if (typeof Neo.drawSpriteToCanvas !== 'function') return false;
    let drewAll = true;
    panel.querySelectorAll('[data-credits-sprite]').forEach((cv) => {
      const key = cv.dataset.creditsSprite;
      Neo.drawSpriteToCanvas(cv, key, Math.min(cv.width, cv.height));
      // If atlas wasn't ready the canvas stays blank; track that to retry.
      const ctx = cv.getContext('2d');
      try {
        const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let any = false;
        for (let i = 3; i < data.length; i += 4) { if (data[i] !== 0) { any = true; break; } }
        if (!any) drewAll = false;
      } catch (_) { /* tainted/again later */ }
    });
    return drewAll;
  }

  // Retry avatars until the sprite atlas is loaded.
  function ensureAvatars(tries = 0) {
    if (drawAvatars() || tries > 40) return;
    setTimeout(() => ensureAvatars(tries + 1), 150);
  }

  // ── Parade animation ──────────────────────────────────────────────────────
  const pctx = parade ? parade.getContext('2d') : null;
  let actors = [];
  let raf = 0;
  let lastTs = 0;
  let built = false;

  function resize() {
    if (!parade) return;
    parade.width  = window.innerWidth;
    parade.height = window.innerHeight;
  }

  function buildActors() {
    if (!parade) return;
    const W = parade.width;
    const baseY = parade.height; // walk along the bottom band
    const spacing = Math.max(220, W / 4);
    actors = PARADE.map((p, i) => ({
      key: p.key,
      glow: p.glow,
      x: -spacing * (i + 1) - Math.random() * 120,
      baseY: baseY - 150,
      size: 92,
      speed: 26 + Math.random() * 10,   // px/sec
      bobPhase: Math.random() * Math.PI * 2,
      bobAmp: 8 + Math.random() * 6,
    }));
    built = true;
  }

  function step(ts) {
    if (!pctx) return;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;

    const W = parade.width, H = parade.height;
    pctx.clearRect(0, 0, W, H);

    const atlasReady = !!(Neo.SPRITE_ATLAS && Neo.SPRITE_ATLAS.canvas);
    const t = ts / 1000;

    for (const a of actors) {
      a.x += a.speed * dt;
      // Loop back to the left once fully off the right edge.
      if (a.x > W + a.size) a.x = -a.size - Math.random() * 200;
      const y = a.baseY + Math.sin(t * 1.6 + a.bobPhase) * a.bobAmp;

      // soft ground glow
      pctx.save();
      pctx.globalAlpha = 0.5;
      const g = pctx.createRadialGradient(a.x + a.size / 2, y + a.size, 4,
                                          a.x + a.size / 2, y + a.size, a.size * 0.8);
      g.addColorStop(0, a.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = g;
      pctx.beginPath();
      pctx.ellipse(a.x + a.size / 2, y + a.size, a.size * 0.7, a.size * 0.22, 0, 0, Math.PI * 2);
      pctx.fill();
      pctx.restore();

      if (atlasReady) {
        // Draw straight from the atlas so we don't need per-actor canvases.
        const frame = Neo.SPRITE_ATLAS.frames[a.key];
        if (frame) {
          pctx.save();
          pctx.globalAlpha = 0.92;
          pctx.imageSmoothingEnabled = false;
          pctx.shadowColor = a.glow;
          pctx.shadowBlur = 14;
          pctx.drawImage(Neo.SPRITE_ATLAS.canvas, frame.x, frame.y, frame.w, frame.h,
                         a.x, y, a.size, a.size);
          pctx.restore();
        }
      }
    }
    raf = requestAnimationFrame(step);
  }

  function start() {
    if (!parade) return;
    resize();
    if (!built) buildActors();
    cancelAnimationFrame(raf);
    lastTs = performance.now();
    raf = requestAnimationFrame(step);
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  function onVisChange() {
    const open = !panel.classList.contains('hidden');
    if (open) { ensureAvatars(); start(); }
    else stop();
  }

  window.addEventListener('resize', () => { resize(); built = false; });
  new MutationObserver(onVisChange).observe(panel, { attributes: true, attributeFilter: ['class'] });
  // In case it's already open at load.
  if (!panel.classList.contains('hidden')) onVisChange();
})();
