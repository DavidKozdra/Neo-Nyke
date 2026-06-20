// music.js — menu and in-game music playback for the main game runtime.
// Menu plays a one-shot title intro that hands off into a looping title theme.
// In-game states play the dedicated gameplay loop.
(function initMusic() {
  const mixerApi = window.KozEngine?.Audio?.mixerSystem || null;
  const TITLE_INTRO_PATH = 'assets/sounds/music/Neo Nyke - Title Intro.wav';
  const TITLE_LOOP_PATH = 'assets/sounds/music/Neo Nyke - Title Loop.wav';
  const GAMEPLAY_TRACK_PATH = 'assets/sounds/music/Neo Nyke - Gameplay (Loop).wav';

  const MENU_STATES = new Set(['menu', 'charselect', 'start']);
  const GAME_STATES = new Set(['play', 'dialogue', 'boss_rush', 'endless']);

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
  let musicMood = mixerApi?.resolveMood?.('normal') || { name: 'normal', rate: 1, gain: 1 };
  const ducking = mixerApi?.createDuckingController?.({ attackMs: 80, releaseMs: 600 }) || null;
  let mixTick = null;

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function getBaseMusicGain() {
    const volume = window.NeoSettings?.getVolume?.() || {};
    const master = clamp01(Number(volume.master ?? 20) / 100);
    const music = clamp01(Number(volume.music ?? 20) / 100);
    return master * music;
  }

  function mixNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function getMusicGain() {
    const moodGain = activeContext === 'game' ? Number(musicMood.gain ?? 1) : 1;
    const duckGain = ducking?.update?.(mixNow()) ?? 1;
    return getBaseMusicGain() * Math.max(0, moodGain) * clamp01(duckGain);
  }

  function stopMixTick() {
    if (mixTick == null) return;
    window.clearInterval?.(mixTick);
    mixTick = null;
  }

  function ensureMixTick() {
    if (!ducking || mixTick != null) return;
    mixTick = window.setInterval(() => {
      applyVolume();
      if (ducking.isIdle(mixNow())) stopMixTick();
    }, 25);
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
    if (titleWebAudioFailed) return false;
    // Already sounding (or about to): report success so the caller does not
    // start the HTML-audio fallback layered on top of the Web Audio sequence.
    if (titleSequenceActive || titleSequencePending) return true;
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

  function ensureGameTrack() {
    if (gameTrack && gameTrackPath) return gameTrack;
    gameTrackPath = GAMEPLAY_TRACK_PATH;
    gameTrack = makeAudio(gameTrackPath, { loop: true });
    applyGameMood();
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
    if (jukeboxAudio) jukeboxAudio.volume = gain;
    if (jukeboxIntroAudio) jukeboxIntroAudio.volume = gain;
  }

  function applyGameMood() {
    if (!gameTrack) return;
    gameTrack.playbackRate = Math.max(0.5, Math.min(2, Number(musicMood.rate ?? 1)));
  }

  function holdMusicMix(token, gain) {
    if (!ducking) return;
    ducking.hold(token, gain, mixNow());
    ensureMixTick();
    applyVolume();
  }

  function duckMusicFor(token, gain, holdMs) {
    if (!ducking) return;
    ducking.duckFor(token, gain, holdMs, mixNow());
    ensureMixTick();
    applyVolume();
  }

  function releaseMusicMix(token) {
    if (!ducking) return;
    ducking.release(token);
    ensureMixTick();
    applyVolume();
  }

  function setMusicMood(name) {
    musicMood = mixerApi?.resolveMood?.(name) || { name: 'normal', rate: 1, gain: 1 };
    applyGameMood();
    applyVolume();
    return musicMood.name;
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
  // A track with an `intro` plays that one-shot first and hands off into the
  // looping `path` body, so the player hears the title song whole rather than
  // split into separate Intro/Loop entries. Tracks without an `intro` simply
  // loop their `path`.
  const JUKEBOX_TRACKS = [
    {
      id: 'neo_nyke_title',
      title: 'Neo Nyke Title',
      intro: 'assets/sounds/music/Neo Nyke - Title Intro.wav',
      path: 'assets/sounds/music/Neo Nyke - Title Loop.wav',
    },
    { id: 'sword_and_synth', title: 'Sword and Synth', path: 'assets/sounds/music/Neo Nyke - Gameplay (Loop).wav' },
    { id: 'neo_nyke_title_alt', title: 'Neo Nyke Title (Alternative Version)', bonus: true, path: 'assets/sounds/music/Neo Nyke - main theme.mp3' },
  ];
  let jukeboxActive = false;
  let jukeboxAudio = null;
  let jukeboxIntroAudio = null;
  let jukeboxTrackId = null;
  let jukeboxAnalyser = null;
  let jukeboxFrequencyData = null;
  const jukeboxMediaSources = new WeakMap();
  const jukeboxListeners = new Set();

  function emitJukeboxState() {
    const snapshot = getJukeboxState();
    for (const listener of [...jukeboxListeners]) {
      // Isolate listeners: one throwing subscriber must not stop the others
      // (or leave the jukebox UI half-updated). Intentionally swallowed.
      try { listener(snapshot); } catch (_) {}
    }
  }

  function getJukeboxState() {
    return {
      active: jukeboxActive,
      trackId: jukeboxTrackId,
      playing: !!((jukeboxAudio && !jukeboxAudio.paused) || (jukeboxIntroAudio && !jukeboxIntroAudio.paused)),
      tracks: JUKEBOX_TRACKS.map((t) => ({ id: t.id, title: t.title, bonus: !!t.bonus })),
    };
  }

  function stopJukeboxAudio() {
    if (jukeboxIntroAudio) { try { jukeboxIntroAudio.pause(); } catch {} }
    if (jukeboxAudio) { try { jukeboxAudio.pause(); } catch {} }
    jukeboxIntroAudio = null;
    jukeboxAudio = null;
    jukeboxTrackId = null;
  }

  function getJukeboxContext() {
    const context = getTitleAudioContext();
    if (context && context.state === 'suspended') {
      void context.resume?.().catch?.(() => {});
    }
    return context;
  }

  function activeJukeboxAudio() {
    if (jukeboxIntroAudio && !jukeboxIntroAudio.paused) return jukeboxIntroAudio;
    if (jukeboxAudio && !jukeboxAudio.paused) return jukeboxAudio;
    return null;
  }

  function connectJukeboxAnalyser(audio) {
    if (!audio) return null;
    const context = getJukeboxContext();
    if (!context) return null;
    try {
      if (!jukeboxAnalyser) {
        jukeboxAnalyser = context.createAnalyser();
        jukeboxAnalyser.fftSize = 64;
        jukeboxAnalyser.smoothingTimeConstant = 0.76;
        jukeboxAnalyser.connect(context.destination);
        jukeboxFrequencyData = new Uint8Array(jukeboxAnalyser.frequencyBinCount);
      }
      let source = jukeboxMediaSources.get(audio);
      if (!source) {
        source = context.createMediaElementSource(audio);
        source.connect(jukeboxAnalyser);
        jukeboxMediaSources.set(audio, source);
      }
      return jukeboxAnalyser;
    } catch {
      return null;
    }
  }

  function getJukeboxLevels(count = 20) {
    const size = Math.max(1, Math.min(32, Math.floor(Number(count) || 20)));
    const levels = new Array(size).fill(0);
    const audio = activeJukeboxAudio();
    if (!audio) return levels;
    const analyser = connectJukeboxAnalyser(audio);
    if (!analyser || !jukeboxFrequencyData) return levels;
    analyser.getByteFrequencyData(jukeboxFrequencyData);
    const usableBins = Math.max(1, Math.floor(jukeboxFrequencyData.length * 0.72));
    for (let i = 0; i < size; i += 1) {
      const start = Math.floor((i / size) * usableBins);
      const end = Math.max(start + 1, Math.floor(((i + 1) / size) * usableBins));
      let peak = 0;
      for (let bin = start; bin < end; bin += 1) {
        peak = Math.max(peak, jukeboxFrequencyData[bin] || 0);
      }
      levels[i] = clamp01(Math.pow(peak / 255, 0.72));
    }
    return levels;
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
      jukeboxTrackId = track.id;
      // The looping body. For an intro+loop track this waits until the one-shot
      // intro has finished, so the title song is auditioned as a whole.
      jukeboxAudio = makeAudio(track.path, { loop: true });
      if (track.intro) {
        jukeboxIntroAudio = makeAudio(track.intro, { loop: false });
        jukeboxIntroAudio.addEventListener('ended', () => {
          // Guard against handing off after the player switched tracks.
          if (!jukeboxActive || jukeboxTrackId !== track.id || !jukeboxAudio) return;
          jukeboxAudio.volume = getMusicGain();
          void jukeboxAudio.play().catch(() => {});
        });
      }
    }
    // Resume whichever part is mid-play: if the loop body has already started
    // (or there is no intro), drive the loop; otherwise (re)start the intro.
    const resume = (!jukeboxIntroAudio || jukeboxAudio.currentTime > 0) ? jukeboxAudio : jukeboxIntroAudio;
    resume.volume = getMusicGain();
    connectJukeboxAnalyser(resume);
    void resume.play().catch(() => {});
    emitJukeboxState();
  }

  function jukeboxPause() {
    if (jukeboxIntroAudio) { try { jukeboxIntroAudio.pause(); } catch {} }
    if (jukeboxAudio) { try { jukeboxAudio.pause(); } catch {} }
    emitJukeboxState();
  }

  function jukeboxIsPlaying() {
    return !!((jukeboxAudio && !jukeboxAudio.paused) || (jukeboxIntroAudio && !jukeboxIntroAudio.paused));
  }

  function jukeboxToggle() {
    if (jukeboxIsPlaying()) { jukeboxPause(); return; }
    if (jukeboxTrackId) { jukeboxPlay(jukeboxTrackId); return; }
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
  Neo.musicMix = {
    hold: holdMusicMix,
    duckFor: duckMusicFor,
    release: releaseMusicMix,
    setMood: setMusicMood,
    getMood: () => musicMood.name,
  };
  Neo.beginDialogueMusic = () => {
    if (currentContext() === 'game') holdMusicMix('dialogue', 0);
  };
  Neo.endDialogueMusic = () => releaseMusicMix('dialogue');
  Neo.jukebox = {
    play: jukeboxPlay,
    pause: jukeboxPause,
    toggle: jukeboxToggle,
    next: () => jukeboxStep(1),
    prev: () => jukeboxStep(-1),
    release: jukeboxRelease,
    getLevels: getJukeboxLevels,
    getState: getJukeboxState,
    onChange: (fn) => { if (typeof fn === 'function') jukeboxListeners.add(fn); return () => jukeboxListeners.delete(fn); },
  };
})();
