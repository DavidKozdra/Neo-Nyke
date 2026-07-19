// credits.js — life for the Credits page.
// 1) Draws the role-card avatar sprites from the game's sprite atlas.
// 2) Animates a "curtain call" parade of heroes drifting across the page.
// Plain deferred script (like menu-background.js) so it shares the Neo global.
(function creditsPage() {
  const panel  = document.getElementById('creditsPanel');
  const parade = document.getElementById('creditsParade');
  const titleLetters = document.getElementById('creditsMenuLetters');
  const titleSubtitle = document.getElementById('creditsMenuSubtitle');
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
    handleCreditsStudioClick(); // Added clicker here to allow us to enable developer mode
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  // ── Developer mode enabler ───────────────────────────────────────────────
  function handleCreditsStudioClick() {
    const creditsStudio = document.getElementById('creditsStudio');
    
    if (!creditsStudio) return; // Ensure the element exists before proceeding
  
    let clickCount = 0;

    function onCreditsStudioClick() {
      clickCount++;
      
      if (clickCount >= 5) {
        globalThis.developer_mode = true;
        console.log("Enabling developer mode.");
        creditsStudio.removeEventListener('click', onCreditsStudioClick); // Remove event listener after reaching count
      }
    }

    creditsStudio.addEventListener('click', onCreditsStudioClick);
  }

  // ── Cutscene gallery ────────────────────────────────────────────────────
  const sceneList = document.getElementById('creditsSceneList');
  const allTab = document.getElementById('galleryAllTab');
  const scenesTab = document.getElementById('galleryScenesTab');
  const tauntsTab = document.getElementById('galleryTauntsTab');
  const rivalsTab = document.getElementById('galleryRivalsTab');
  let gallerySection = 'all';

  function drawGalleryPortraits(tries = 0) {
    if (!sceneList || typeof Neo.drawSpriteToCanvas !== 'function') return;
    let drewAll = true;
    sceneList.querySelectorAll('[data-gallery-speaker]').forEach((canvas) => {
      const speaker = canvas.dataset.gallerySpeaker || '';
      const key = canvas.dataset.gallerySprite
        || Neo.uiController?.resolveDialoguePortraitKey?.(speaker)
        || 'hunter';
      Neo.drawSpriteToCanvas(canvas, key, canvas.width);
      const ctx = canvas.getContext('2d');
      try {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        if (!pixels.some((value, index) => index % 4 === 3 && value !== 0)) drewAll = false;
      } catch (_) { drewAll = false; }
    });
    if (!drewAll && tries < 20) {
      setTimeout(() => drawGalleryPortraits(tries + 1), 150);
    }
  }

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

  function renderGallery() {
    if (!sceneList) return;
    const scenes = Array.isArray(Neo.CUTSCENE_GALLERY) ? Neo.CUTSCENE_GALLERY : [];
    if (!scenes.length) return false; // game-core not ready yet; retry on next open
    const selectedCharacter = Neo.player?.character || Neo.chosenCharacter || Neo.metaProgress?.selectedCharacter || 'thorn_knight';
    const matchesSelectedCharacter = scene => !scene.character || scene.character === selectedCharacter;
    const bossTaunts = scenes.find(scene => scene.id === 'boss_openings');
    const storyEntries = scenes.filter(scene => scene.id !== 'boss_openings' && matchesSelectedCharacter(scene));
    const tauntEntries = (bossTaunts?.lines || []).map((line, index) => ({
      id: `boss_taunt_${index}`,
      title: line.speaker,
      subtitle: line.text,
      lines: [line],
    }));
    const rivalEntries = Object.entries(Neo.RIVAL_DEFS || {}).map(([character, rival]) => ({
      id: `rival_${character}`,
      title: rival.name || `Rival ${Neo.CHARACTER_DEFS?.[character]?.name || character}`,
      subtitle: 'Entrance and defeat dialogue',
      portraitCharacter: character,
      lines: [
        { speaker: rival.name || `Rival ${character}`, text: rival.enterLine },
        { speaker: rival.name || `Rival ${character}`, text: rival.deathLine },
      ].filter(line => line.text),
    }));
    let entries;
    if (gallerySection === 'taunts') {
      entries = tauntEntries;
    } else if (gallerySection === 'rivals') {
      entries = rivalEntries;
    } else if (gallerySection === 'scenes') {
      entries = storyEntries;
    } else {
      entries = [...storyEntries, ...tauntEntries, ...rivalEntries];
    }

    sceneList.textContent = '';
    entries.forEach((scene) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'credits-gallery__item';
      btn.setAttribute('role', 'listitem');

      const portraits = document.createElement('span');
      portraits.className = 'credits-gallery__portraits';
      const speakers = [...new Set(scene.lines.map(line => String(line.speaker || '').trim()).filter(Boolean))];
      const requiredCharacter = scene.portraitCharacter || (scene.required && scene.character ? scene.character : '');
      const requiredLabel = Neo.CHARACTER_DEFS?.[requiredCharacter]?.name || requiredCharacter;
      const requiredSpriteKey = requiredCharacter || '';
      const visibleSpeakers = speakers.filter((speaker) => {
        if (!requiredSpriteKey) return true;
        return Neo.uiController?.resolveDialoguePortraitKey?.(speaker) !== requiredSpriteKey;
      });
      const portraitEntries = [
        ...(requiredSpriteKey ? [{ speaker: requiredLabel, spriteKey: requiredSpriteKey }] : []),
        ...visibleSpeakers.map(speaker => ({ speaker, spriteKey: '' })),
      ];
      if (portraitEntries.length) {
        const visiblePortraits = portraitEntries.length > 3 ? portraitEntries.slice(0, 1) : portraitEntries;
        visiblePortraits.forEach(({ speaker, spriteKey }) => {
          const portrait = document.createElement('canvas');
          portrait.width = 48;
          portrait.height = 48;
          portrait.className = 'credits-gallery__portrait';
          portrait.dataset.gallerySpeaker = speaker;
          if (spriteKey) portrait.dataset.gallerySprite = spriteKey;
          portrait.setAttribute('role', 'img');
          portrait.setAttribute('aria-label', speaker);
          portrait.title = speaker;
          portraits.appendChild(portrait);
        });
        if (portraitEntries.length > 3) {
          const more = document.createElement('span');
          more.className = 'credits-gallery__portrait-more';
          more.textContent = '...';
          more.setAttribute('aria-label', `${portraitEntries.length - 1} more characters`);
          more.title = `${portraitEntries.length - 1} more characters`;
          portraits.appendChild(more);
        }
        btn.appendChild(portraits);
      }

      const copy = document.createElement('span');
      copy.className = 'credits-gallery__copy';
      const title = document.createElement('span');
      title.className = 'credits-gallery__item-title';
      title.textContent = scene.title || scene.id || 'Scene';
      copy.appendChild(title);
      if (scene.subtitle) {
        const sub = document.createElement('span');
        sub.className = 'credits-gallery__item-sub';
        sub.textContent = scene.subtitle;
        copy.appendChild(sub);
      }
      btn.appendChild(copy);
      btn.addEventListener('click', () => playScene(scene));
      sceneList.appendChild(btn);
    });
    drawGalleryPortraits();
    return true;
  }

  function setGallerySection(section) {
    gallerySection = ['scenes', 'taunts', 'rivals'].includes(section) ? section : 'all';
    const showAll = gallerySection === 'all';
    const showTaunts = gallerySection === 'taunts';
    const showRivals = gallerySection === 'rivals';
    const showScenes = gallerySection === 'scenes';
    allTab?.classList.toggle('is-active', showAll);
    scenesTab?.classList.toggle('is-active', showScenes);
    tauntsTab?.classList.toggle('is-active', showTaunts);
    rivalsTab?.classList.toggle('is-active', showRivals);
    allTab?.setAttribute('aria-selected', showAll ? 'true' : 'false');
    scenesTab?.setAttribute('aria-selected', showScenes ? 'true' : 'false');
    tauntsTab?.setAttribute('aria-selected', showTaunts ? 'true' : 'false');
    rivalsTab?.setAttribute('aria-selected', showRivals ? 'true' : 'false');
    renderGallery();
  }

  function buildGallery(tries = 0) {
    if (!sceneList) return;
    if (renderGallery() === false && tries < 20) {
      setTimeout(() => buildGallery(tries + 1), 100);
    }
  }

  allTab?.addEventListener('click', () => setGallerySection('all'));
  scenesTab?.addEventListener('click', () => setGallerySection('scenes'));
  tauntsTab?.addEventListener('click', () => setGallerySection('taunts'));
  rivalsTab?.addEventListener('click', () => setGallerySection('rivals'));

  // ── Jukebox ─────────────────────────────────────────────────────────────
  const jukeboxList = document.getElementById('jukeboxList');
  const jukeboxNow = document.getElementById('jukeboxNowPlaying');
  const jukeboxToggleBtn = document.getElementById('jukeboxToggle');
  const jukeboxPrevBtn = document.getElementById('jukeboxPrev');
  const jukeboxNextBtn = document.getElementById('jukeboxNext');
  const jukeboxVisualizer = document.getElementById('jukeboxVisualizer');
  const jukeboxVisualizerBars = jukeboxVisualizer ? [...jukeboxVisualizer.querySelectorAll('span')] : [];
  let jukeboxBuilt = false;
  let jukeboxUnsub = null;
  let jukeboxVisualizerFrame = null;

  function setJukeboxVisualizerLevels(levels) {
    jukeboxVisualizerBars.forEach((bar, index) => {
      const level = Array.isArray(levels) ? Number(levels[index] || 0) : 0;
      const clamped = Math.max(0, Math.min(1, level));
      bar.style.setProperty('--bar-height', `${Math.round(7 + (clamped * 50))}px`);
      bar.style.setProperty('--bar-glow', `${Math.round(4 + (clamped * 16))}px`);
    });
  }

  function startJukeboxVisualizer() {
    if (jukeboxVisualizerFrame || !jukeboxVisualizer || !jukeboxVisualizerBars.length) return;
    const tick = () => {
      const state = Neo.jukebox?.getState?.();
      const playing = !!state?.playing;
      const levels = playing ? Neo.jukebox?.getLevels?.(jukeboxVisualizerBars.length) : null;
      jukeboxVisualizer.classList.toggle('is-active', playing);
      setJukeboxVisualizerLevels(levels);
      jukeboxVisualizerFrame = window.requestAnimationFrame(tick);
    };
    tick();
  }

  function stopJukeboxVisualizer() {
    if (jukeboxVisualizerFrame) {
      window.cancelAnimationFrame(jukeboxVisualizerFrame);
      jukeboxVisualizerFrame = null;
    }
    jukeboxVisualizer?.classList.remove('is-active');
    setJukeboxVisualizerLevels(null);
  }

  function renderJukebox(state) {
    if (!state) return;
    const playing = state.playing;
    if (jukeboxToggleBtn) {
      jukeboxToggleBtn.classList.toggle('is-playing', playing);
      jukeboxToggleBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
    jukeboxVisualizer?.classList.toggle('is-active', playing);
    const current = (state.tracks || []).find((t) => t.id === state.trackId);
    if (jukeboxNow) {
      jukeboxNow.textContent = current
        ? current.title
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
      const label = document.createElement('span');
      label.className = 'jukebox__track-title';
      label.textContent = track.title;
      btn.appendChild(label);
      if (track.bonus) {
        btn.classList.add('jukebox__track--bonus');
        const tag = document.createElement('span');
        tag.className = 'jukebox__track-tag';
        tag.textContent = 'Bonus';
        btn.appendChild(tag);
      }
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
    if (overlay === jukeboxOverlay) {
      if (open) startJukeboxVisualizer();
      else stopJukeboxVisualizer();
    }
  }

  function openGallery() {
    buildGallery();
    drawGalleryPortraits();
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
      window.NeoAnimateMenuTitle?.(titleLetters, titleSubtitle);
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
