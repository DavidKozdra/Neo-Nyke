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
    // If the loop is already going, leave it; otherwise start (or resume) the intro.
    if (!titleLoop.paused && titleLoop.currentTime > 0) return;
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
      if (activeContext === 'menu') pauseMenuMusic();
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
