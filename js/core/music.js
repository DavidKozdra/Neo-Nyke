// music.js — menu and in-game music playback for the main game runtime.
// Menu plays a one-shot title intro that hands off into a looping title theme.
// In-game states play one of several gameplay tracks, picked at random.
(function initMusic() {
  const TITLE_INTRO_PATH = 'assets/sounds/music/Neo Nyke - Title Intro.wav';
  const TITLE_LOOP_PATH = 'assets/sounds/music/Neo Nyke - Title Loop.wav';
  const GAME_TRACK_PATHS = [
    'assets/sounds/music/Neo Nyke - main theme.mp3',
  ];

  const MENU_STATES = new Set(['menu', 'charselect', 'start']);
  const GAME_STATES = new Set(['play', 'dying', 'dialogue', 'boss_rush', 'endless']);

  let titleIntro = null;
  let titleLoop = null;
  let titleAudioContext = null;
  let titleGainNode = null;
  let titleBuffersPromise = null;
  let titleIntroSource = null;
  let titleLoopSource = null;
  let titleSequenceActive = false;
  let titleSequencePending = false;
  let titleSequenceStartedAt = 0;
  let titleSequenceOffset = 0;
  let titleSequenceGeneration = 0;
  let titleWebAudioFailed = false;
  let gameTrack = null;
  let gameTrackPath = null;
  let unlockedByGesture = false;
  // True once the one-shot intro has finished and handed off to the looping
  // theme. Guards against the 400ms sync tick restarting the intro on top of
  // the loop (which sounds like the song playing twice, layered).
  let titleHandedOff = false;
  // Which musical context is currently meant to be sounding: 'menu', 'game', or null.
  let activeContext = null;

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function getMusicGain() {
    const volume = window.NeoSettings?.getVolume?.() || {};
    const master = clamp01(Number(volume.master ?? 20) / 100);
    const music = clamp01(Number(volume.music ?? 20) / 100);
    return master * music;
  }

  function makeAudio(path, { loop }) {
    const audio = new Audio(encodeURI(path));
    audio.loop = loop;
    audio.preload = 'auto';
    audio.volume = getMusicGain();
    return audio;
  }

  function ensureFallbackTitleTracks() {
    if (!titleLoop) {
      titleLoop = makeAudio(TITLE_LOOP_PATH, { loop: true });
    }
    if (!titleIntro) {
      titleIntro = makeAudio(TITLE_INTRO_PATH, { loop: false });
      // Hand off from the one-shot intro into the looping theme seamlessly.
      titleIntro.addEventListener('ended', () => {
        titleHandedOff = true;
        if (activeContext !== 'menu') return;
        applyVolume();
        if (titleLoop.volume <= 0) return;
        void titleLoop.play().catch(() => {});
      });
    }
  }

  function getTitleAudioContext() {
    if (titleWebAudioFailed) return null;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      titleAudioContext = Neo.mooggyAudioContext || titleAudioContext || new AudioContextCtor();
      Neo.mooggyAudioContext = titleAudioContext;
      if (!titleGainNode) {
        titleGainNode = titleAudioContext.createGain();
        titleGainNode.gain.value = getMusicGain();
        titleGainNode.connect(titleAudioContext.destination);
      }
      return titleAudioContext;
    } catch {
      titleWebAudioFailed = true;
      return null;
    }
  }

  function loadTitleBuffers() {
    const context = getTitleAudioContext();
    if (!context) return null;
    if (titleBuffersPromise) return titleBuffersPromise;
    const load = (path) => fetch(encodeURI(path))
      .then((response) => {
        if (!response.ok) throw new Error(`music fetch failed: ${path}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data));
    titleBuffersPromise = Promise.all([
      load(TITLE_INTRO_PATH),
      load(TITLE_LOOP_PATH),
    ]).catch((error) => {
      titleBuffersPromise = null;
      titleWebAudioFailed = true;
      throw error;
    });
    return titleBuffersPromise;
  }

  function stopTitleSources({ reset = false } = {}) {
    titleSequenceGeneration += 1;
    titleSequencePending = false;
    if (titleSequenceActive && titleAudioContext) {
      titleSequenceOffset = Math.max(0, titleAudioContext.currentTime - titleSequenceStartedAt);
    }
    try { titleIntroSource?.stop(); } catch {}
    try { titleLoopSource?.stop(); } catch {}
    titleIntroSource = null;
    titleLoopSource = null;
    titleSequenceActive = false;
    if (reset) titleSequenceOffset = 0;
  }

  async function playScheduledTitleSequence() {
    if (titleSequenceActive || titleSequencePending || titleWebAudioFailed) return false;
    const context = getTitleAudioContext();
    const buffersPromise = loadTitleBuffers();
    if (!context || !buffersPromise) return false;

    titleSequencePending = true;
    const generation = ++titleSequenceGeneration;
    try {
      await context.resume();
      const [introBuffer, loopBuffer] = await buffersPromise;
      if (
        generation !== titleSequenceGeneration
        || activeContext !== 'menu'
        || !unlockedByGesture
        || getMusicGain() <= 0
      ) {
        titleSequencePending = false;
        return true;
      }

      const when = context.currentTime + 0.04;
      const sequenceOffset = Math.max(0, titleSequenceOffset);
      const introDuration = introBuffer.duration;
      const loopDuration = loopBuffer.duration;
      titleSequenceStartedAt = when - sequenceOffset;

      if (sequenceOffset < introDuration) {
        titleIntroSource = context.createBufferSource();
        titleIntroSource.buffer = introBuffer;
        titleIntroSource.connect(titleGainNode);
        titleIntroSource.start(when, sequenceOffset);

        titleLoopSource = context.createBufferSource();
        titleLoopSource.buffer = loopBuffer;
        titleLoopSource.loop = true;
        titleLoopSource.connect(titleGainNode);
        // Both sources share one hardware audio clock, so this boundary is
        // sample-accurate and does not depend on an `ended` event callback.
        titleLoopSource.start(when + introDuration - sequenceOffset);
      } else {
        const loopOffset = loopDuration > 0
          ? (sequenceOffset - introDuration) % loopDuration
          : 0;
        titleLoopSource = context.createBufferSource();
        titleLoopSource.buffer = loopBuffer;
        titleLoopSource.loop = true;
        titleLoopSource.connect(titleGainNode);
        titleLoopSource.start(when, loopOffset);
      }

      titleSequenceActive = true;
      titleSequencePending = false;
      titleHandedOff = sequenceOffset >= introDuration;
      return true;
    } catch {
      titleSequencePending = false;
      titleWebAudioFailed = true;
      stopTitleSources();
      return false;
    }
  }

  function pickGameTrackPath() {
    if (GAME_TRACK_PATHS.length === 0) return null;
    const index = Math.floor(Math.random() * GAME_TRACK_PATHS.length);
    return GAME_TRACK_PATHS[index];
  }

  function ensureGameTrack() {
    if (gameTrack && gameTrackPath) return gameTrack;
    gameTrackPath = pickGameTrackPath();
    if (!gameTrackPath) return null;
    gameTrack = makeAudio(gameTrackPath, { loop: true });
    return gameTrack;
  }

  function currentContext() {
    const state = String(Neo.gameState || '').toLowerCase();
    if (MENU_STATES.has(state)) return 'menu';
    if (GAME_STATES.has(state)) return 'game';
    return null;
  }

  function applyVolume() {
    const gain = getMusicGain();
    if (titleGainNode && titleAudioContext) {
      titleGainNode.gain.setValueAtTime(gain, titleAudioContext.currentTime);
    }
    if (titleIntro) titleIntro.volume = gain;
    if (titleLoop) titleLoop.volume = gain;
    if (gameTrack) gameTrack.volume = gain;
  }

  function pauseMenuMusic({ reset = false } = {}) {
    stopTitleSources({ reset });
    try { titleIntro?.pause(); } catch {}
    try { titleLoop?.pause(); } catch {}
    if (reset) {
      if (titleIntro) titleIntro.currentTime = 0;
      if (titleLoop) titleLoop.currentTime = 0;
      titleHandedOff = false;
    }
  }

  function pauseGameMusic() {
    try { gameTrack?.pause(); } catch {}
  }

  function pauseAll() {
    pauseMenuMusic();
    pauseGameMusic();
  }

  function playMenuMusic() {
    applyVolume();
    if (getMusicGain() <= 0) {
      pauseMenuMusic();
      return;
    }
    if (!titleWebAudioFailed) {
      void playScheduledTitleSequence().then((scheduled) => {
        if (!scheduled && activeContext === 'menu') playFallbackTitleMusic();
      });
      return;
    }
    playFallbackTitleMusic();
  }

  function playFallbackTitleMusic() {
    ensureFallbackTitleTracks();
    applyVolume();
    // Once the intro has handed off, only ever drive the looping theme. This
    // prevents a sync tick during the handoff window from restarting the intro
    // on top of the loop (the doubled/layered audio bug).
    if (titleHandedOff) {
      if (titleLoop.paused) void titleLoop.play().catch(() => {});
      return;
    }
    // Loop already running (e.g. resumed) — leave it be.
    if (!titleLoop.paused && titleLoop.currentTime > 0) return;
    // Otherwise start (or resume) the one-shot intro.
    if (!titleIntro.paused) return;
    void titleIntro.play().catch(() => {});
  }

  function playGameMusic() {
    const track = ensureGameTrack();
    if (!track) return;
    applyVolume();
    if (getMusicGain() <= 0) {
      pauseGameMusic();
      return;
    }
    void track.play().catch(() => {});
  }

  // ── Jukebox (Credits gallery) ─────────────────────────────────────────────
  // The Credits jukebox lets the player audition any track. While it owns
  // playback we suspend the automatic title-music sync so the loop above does
  // not fight the player's selection. Releasing the override restores normal
  // menu/game music on the next tick.
  const JUKEBOX_TRACKS = [
    { id: 'main_theme', title: 'Main Theme', path: 'assets/sounds/music/Neo Nyke - main theme.mp3' },
    { id: 'title_intro', title: 'Title Intro', path: 'assets/sounds/music/Neo Nyke - Title Intro.wav' },
    { id: 'title_loop', title: 'Title Loop', path: 'assets/sounds/music/Neo Nyke - Title Loop.wav' },
  ];
  let jukeboxActive = false;
  let jukeboxAudio = null;
  let jukeboxTrackId = null;
  const jukeboxListeners = new Set();

  function emitJukeboxState() {
    const snapshot = getJukeboxState();
    for (const listener of [...jukeboxListeners]) {
      try { listener(snapshot); } catch (_) {}
    }
  }

  function getJukeboxState() {
    return {
      active: jukeboxActive,
      trackId: jukeboxTrackId,
      playing: !!(jukeboxAudio && !jukeboxAudio.paused),
      tracks: JUKEBOX_TRACKS.map((t) => ({ id: t.id, title: t.title })),
    };
  }

  function stopJukeboxAudio() {
    if (!jukeboxAudio) return;
    try { jukeboxAudio.pause(); } catch {}
    jukeboxAudio = null;
    jukeboxTrackId = null;
  }

  function jukeboxPlay(trackId) {
    const track = JUKEBOX_TRACKS.find((t) => t.id === trackId) || JUKEBOX_TRACKS[0];
    if (!track) return;
    jukeboxActive = true;
    unlockedByGesture = true;
    // Silence whatever the auto-sync was playing so only the chosen track sounds.
    pauseAll();
    if (jukeboxTrackId !== track.id) {
      stopJukeboxAudio();
      jukeboxAudio = makeAudio(track.path, { loop: true });
      jukeboxTrackId = track.id;
    }
    jukeboxAudio.volume = getMusicGain();
    void jukeboxAudio.play().catch(() => {});
    emitJukeboxState();
  }

  function jukeboxPause() {
    if (jukeboxAudio) { try { jukeboxAudio.pause(); } catch {} }
    emitJukeboxState();
  }

  function jukeboxToggle() {
    if (jukeboxAudio && !jukeboxAudio.paused) { jukeboxPause(); return; }
    if (jukeboxAudio && jukeboxTrackId) { jukeboxPlay(jukeboxTrackId); return; }
    jukeboxPlay(JUKEBOX_TRACKS[0].id);
  }

  function jukeboxStep(delta) {
    const currentIndex = Math.max(0, JUKEBOX_TRACKS.findIndex((t) => t.id === jukeboxTrackId));
    const nextIndex = (currentIndex + delta + JUKEBOX_TRACKS.length) % JUKEBOX_TRACKS.length;
    jukeboxPlay(JUKEBOX_TRACKS[nextIndex].id);
  }

  function jukeboxRelease() {
    stopJukeboxAudio();
    jukeboxActive = false;
    emitJukeboxState();
    syncMusicState();
  }

  function syncMusicState() {
    // While the jukebox owns playback, leave its selection alone.
    if (jukeboxActive) {
      applyVolume();
      if (jukeboxAudio) jukeboxAudio.volume = getMusicGain();
      return;
    }
    const context = currentContext();
    applyVolume();

    if (context !== activeContext) {
      // Context changed: stop whatever the previous context was playing.
      if (activeContext === 'menu') {
        // Returning to the menu starts the title sequence from the top.
        pauseMenuMusic({ reset: true });
      }
      if (activeContext === 'game') pauseGameMusic();
      activeContext = context;
    }

    if (!unlockedByGesture) return;

    if (context === 'menu') {
      playMenuMusic();
    } else if (context === 'game') {
      pauseMenuMusic();
      playGameMusic();
    } else {
      pauseAll();
    }
  }

  function unlockAndPlay() {
    unlockedByGesture = true;
    syncMusicState();
  }

  const unlockEvents = ['pointerdown', 'keydown', 'touchstart'];
  unlockEvents.forEach((eventName) => {
    window.addEventListener(eventName, unlockAndPlay, { passive: true });
  });

  window.addEventListener('neo:settings-changed', () => {
    syncMusicState();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseAll();
      return;
    }
    syncMusicState();
  });

  // Keep music in sync with state transitions without requiring explicit hooks.
  window.setInterval(syncMusicState, 400);

  // Start fetching and decoding early so the complete intro and loop are ready
  // before the first user gesture unlocks playback.
  const titlePreload = loadTitleBuffers();
  if (titlePreload) void titlePreload.catch(() => {
    ensureFallbackTitleTracks();
  });

  Neo.playTitleMusic = () => {
    unlockedByGesture = true;
    syncMusicState();
  };
  Neo.pauseTitleMusic = pauseMenuMusic;
  Neo.syncTitleMusic = syncMusicState;
  Neo.pauseGameMusic = pauseGameMusic;
  Neo.jukebox = {
    play: jukeboxPlay,
    pause: jukeboxPause,
    toggle: jukeboxToggle,
    next: () => jukeboxStep(1),
    prev: () => jukeboxStep(-1),
    release: jukeboxRelease,
    getState: getJukeboxState,
    onChange: (fn) => { if (typeof fn === 'function') jukeboxListeners.add(fn); return () => jukeboxListeners.delete(fn); },
  };
})();
