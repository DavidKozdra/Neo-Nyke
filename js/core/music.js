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

  function ensureTitleTracks() {
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
    if (titleIntro) titleIntro.volume = gain;
    if (titleLoop) titleLoop.volume = gain;
    if (gameTrack) gameTrack.volume = gain;
  }

  function pauseMenuMusic() {
    try { titleIntro?.pause(); } catch {}
    try { titleLoop?.pause(); } catch {}
  }

  function pauseGameMusic() {
    try { gameTrack?.pause(); } catch {}
  }

  function pauseAll() {
    pauseMenuMusic();
    pauseGameMusic();
  }

  function playMenuMusic() {
    ensureTitleTracks();
    applyVolume();
    if (getMusicGain() <= 0) {
      pauseMenuMusic();
      return;
    }
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

  function syncMusicState() {
    const context = currentContext();
    applyVolume();

    if (context !== activeContext) {
      // Context changed: stop whatever the previous context was playing.
      if (activeContext === 'menu') {
        pauseMenuMusic();
        // Rewind the intro so returning to the menu starts it from the top
        // rather than mid-track, and re-arm the intro→loop handoff.
        if (titleIntro) titleIntro.currentTime = 0;
        if (titleLoop) titleLoop.currentTime = 0;
        titleHandedOff = false;
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

  Neo.playTitleMusic = () => {
    unlockedByGesture = true;
    syncMusicState();
  };
  Neo.pauseTitleMusic = pauseMenuMusic;
  Neo.syncTitleMusic = syncMusicState;
  Neo.pauseGameMusic = pauseGameMusic;
})();
