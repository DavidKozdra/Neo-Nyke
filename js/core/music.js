// music.js — title/menu music playback for the main game runtime.
// Plays the title track in menu-like states and respects settings volume.
(function initMusic() {
  const TITLE_TRACK_PATH = 'assets/sounds/music/Neo Nyke - Title.mp3';
  const MENU_STATES = new Set(['menu', 'charselect', 'start']);

  let titleTrack = null;
  let unlockedByGesture = false;

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function getMusicGain() {
    const volume = window.NeoSettings?.getVolume?.() || {};
    const master = clamp01(Number(volume.master ?? 80) / 100);
    const music = clamp01(Number(volume.music ?? 60) / 100);
    return master * music;
  }

  function ensureTrack() {
    if (titleTrack) return titleTrack;
    const src = encodeURI(TITLE_TRACK_PATH);
    titleTrack = new Audio(src);
    titleTrack.loop = true;
    titleTrack.preload = 'auto';
    titleTrack.volume = getMusicGain();
    return titleTrack;
  }

  function isMenuLikeState() {
    return MENU_STATES.has(String(Neo.gameState || '').toLowerCase());
  }

  function applyVolume() {
    if (!titleTrack) return;
    titleTrack.volume = getMusicGain();
  }

  function pauseTrack() {
    if (!titleTrack) return;
    try {
      titleTrack.pause();
    } catch {}
  }

  async function playTrack() {
    const track = ensureTrack();
    applyVolume();
    if (track.volume <= 0) {
      pauseTrack();
      return;
    }
    if (!isMenuLikeState()) {
      pauseTrack();
      return;
    }
    try {
      await track.play();
    } catch {}
  }

  function syncMusicState() {
    ensureTrack();
    applyVolume();
    if (isMenuLikeState() && unlockedByGesture) {
      void playTrack();
      return;
    }
    if (!isMenuLikeState()) pauseTrack();
  }

  function unlockAndPlay() {
    unlockedByGesture = true;
    if (isMenuLikeState()) void playTrack();
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
      pauseTrack();
      return;
    }
    syncMusicState();
  });

  // Keep music in sync with state transitions without requiring explicit hooks.
  window.setInterval(syncMusicState, 400);

  Neo.playTitleMusic = () => {
    unlockedByGesture = true;
    void playTrack();
  };
  Neo.pauseTitleMusic = pauseTrack;
  Neo.syncTitleMusic = syncMusicState;
})();