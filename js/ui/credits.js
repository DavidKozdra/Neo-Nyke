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
    { key: 'gelleh',       glow: 'rgba(255,210,120,0.5)' },
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

  // ── Cutscene gallery ────────────────────────────────────────────────────
  const sceneList = document.getElementById('creditsSceneList');
  let galleryBuilt = false;

  function playScene(scene) {
    if (!scene || !Array.isArray(scene.lines) || !scene.lines.length) return;
    const ctrl = Neo.uiController;
    if (!ctrl || typeof ctrl.playDialogue !== 'function') return;
    // Close the gallery so the dialogue overlay plays unobstructed over the
    // credits backdrop. Dialogue runs as its own game state and returns to the
    // menu (which the credits page is layered over) when it closes.
    setModalOpen(galleryOverlay, false);
    ctrl.playDialogue(scene.lines, { returnState: 'menu' });
  }

  function buildGallery() {
    if (galleryBuilt || !sceneList) return;
    const scenes = Array.isArray(Neo.CUTSCENE_GALLERY) ? Neo.CUTSCENE_GALLERY : [];
    if (!scenes.length) return; // game-core not ready yet; retry on next open
    sceneList.textContent = '';
    scenes.forEach((scene) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'credits-gallery__item';
      btn.setAttribute('role', 'listitem');
      const title = document.createElement('span');
      title.className = 'credits-gallery__item-title';
      title.textContent = scene.title || scene.id || 'Scene';
      btn.appendChild(title);
      if (scene.subtitle) {
        const sub = document.createElement('span');
        sub.className = 'credits-gallery__item-sub';
        sub.textContent = scene.subtitle;
        btn.appendChild(sub);
      }
      btn.addEventListener('click', () => playScene(scene));
      sceneList.appendChild(btn);
    });
    galleryBuilt = true;
  }

  // ── Jukebox ─────────────────────────────────────────────────────────────
  const jukeboxList = document.getElementById('jukeboxList');
  const jukeboxNow = document.getElementById('jukeboxNowPlaying');
  const jukeboxToggleBtn = document.getElementById('jukeboxToggle');
  const jukeboxPrevBtn = document.getElementById('jukeboxPrev');
  const jukeboxNextBtn = document.getElementById('jukeboxNext');
  let jukeboxBuilt = false;
  let jukeboxUnsub = null;

  function renderJukebox(state) {
    if (!state) return;
    const playing = state.playing;
    if (jukeboxToggleBtn) {
      jukeboxToggleBtn.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
      jukeboxToggleBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
    const current = (state.tracks || []).find((t) => t.id === state.trackId);
    if (jukeboxNow) {
      jukeboxNow.textContent = current
        ? `${playing ? '♫ ' : ''}${current.title}`
        : 'Select a track';
    }
    if (jukeboxList) {
      jukeboxList.querySelectorAll('[data-track-id]').forEach((el) => {
        el.classList.toggle('is-active', el.dataset.trackId === state.trackId);
      });
    }
  }

  function buildJukebox() {
    if (jukeboxBuilt || !jukeboxList || !Neo.jukebox) return;
    const state = Neo.jukebox.getState();
    jukeboxList.textContent = '';
    (state.tracks || []).forEach((track) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jukebox__track';
      btn.dataset.trackId = track.id;
      btn.setAttribute('role', 'listitem');
      btn.textContent = track.title;
      btn.addEventListener('click', () => Neo.jukebox.play(track.id));
      jukeboxList.appendChild(btn);
    });
    jukeboxToggleBtn?.addEventListener('click', () => Neo.jukebox.toggle());
    jukeboxPrevBtn?.addEventListener('click', () => Neo.jukebox.prev());
    jukeboxNextBtn?.addEventListener('click', () => Neo.jukebox.next());
    jukeboxBuilt = true;
  }

  // ── Overlay triggers ────────────────────────────────────────────────────
  // Each feature lives in its own modal opened from a small credits button.
  const galleryBtn = document.getElementById('creditsGalleryBtn');
  const jukeboxBtn = document.getElementById('creditsJukeboxBtn');
  const galleryOverlay = document.getElementById('galleryOverlay');
  const jukeboxOverlay = document.getElementById('jukeboxOverlay');
  const galleryCloseBtn = document.getElementById('galleryClose');
  const jukeboxCloseBtn = document.getElementById('jukeboxClose');

  function setModalOpen(overlay, open) {
    if (!overlay) return;
    overlay.classList.toggle('hidden', !open);
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function openGallery() {
    buildGallery();
    setModalOpen(galleryOverlay, true);
    galleryCloseBtn?.focus({ preventScroll: true });
  }

  function openJukebox() {
    buildJukebox();
    if (Neo.jukebox && !jukeboxUnsub) {
      jukeboxUnsub = Neo.jukebox.onChange(renderJukebox);
    }
    renderJukebox(Neo.jukebox?.getState?.());
    setModalOpen(jukeboxOverlay, true);
    jukeboxCloseBtn?.focus({ preventScroll: true });
  }

  function closeModals() {
    setModalOpen(galleryOverlay, false);
    setModalOpen(jukeboxOverlay, false);
  }

  galleryBtn?.addEventListener('click', openGallery);
  jukeboxBtn?.addEventListener('click', openJukebox);
  galleryCloseBtn?.addEventListener('click', () => setModalOpen(galleryOverlay, false));
  jukeboxCloseBtn?.addEventListener('click', () => setModalOpen(jukeboxOverlay, false));
  // Click the dim backdrop (outside the panel) to dismiss.
  galleryOverlay?.addEventListener('click', (e) => { if (e.target === galleryOverlay) setModalOpen(galleryOverlay, false); });
  jukeboxOverlay?.addEventListener('click', (e) => { if (e.target === jukeboxOverlay) setModalOpen(jukeboxOverlay, false); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (galleryOverlay && !galleryOverlay.classList.contains('hidden')) setModalOpen(galleryOverlay, false);
    else if (jukeboxOverlay && !jukeboxOverlay.classList.contains('hidden')) setModalOpen(jukeboxOverlay, false);
  });

  function onVisChange() {
    const open = !panel.classList.contains('hidden');
    if (open) {
      ensureAvatars();
      start();
    } else {
      stop();
      // Leaving credits closes any open modal and hands music back to the
      // normal title-sync.
      closeModals();
      Neo.jukebox?.release?.();
      if (jukeboxUnsub) { jukeboxUnsub(); jukeboxUnsub = null; }
    }
  }

  window.addEventListener('resize', () => { resize(); built = false; });
  new MutationObserver(onVisChange).observe(panel, { attributes: true, attributeFilter: ['class'] });
  // In case it's already open at load.
  if (!panel.classList.contains('hidden')) onVisChange();
})();
