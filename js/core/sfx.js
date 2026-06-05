// sfx.js — game-side sound-effect playback. Registers sounds with the reusable
// KozEngine soundRegistry and plays one-shots through Web Audio, respecting the
// player's master/sfx volume settings (NeoSettings master * sfx).
(function initSfx() {
  const registryApi = window.KozEngine?.Audio?.soundRegistry || null;
  const registry = registryApi?.createSoundRegistry ? registryApi.createSoundRegistry() : null;

  // id -> { promise } resolving to a decoded AudioBuffer (decoded once, then cached).
  const bufferCache = new Map();

  // Game sound list. Paths are relative to the page (index.html / game.html).
  const SOUNDS = [
    { id: 'item_collect', path: 'assets/sounds/Item Collect.wav', volume: 0.7 },
    { id: 'coin', path: 'assets/sounds/Coin.wav', volume: 0.6 },
    { id: 'heal_player', path: 'assets/sounds/Heal_player.wav', volume: 0.7 },
    { id: 'player_death', path: 'assets/sounds/Player Death.wav', volume: 0.8 },
  ];

  if (registry) {
    SOUNDS.forEach((sound) => registry.register(sound.id, sound));
  }

  function getContext() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    const ctx = Neo.mooggyAudioContext || new AudioContextCtor();
    Neo.mooggyAudioContext = ctx;
    if (ctx.state === 'suspended') ctx.resume?.();
    return ctx;
  }

  function getSfxGain() {
    const volume = window.NeoSettings?.getVolume?.() || {};
    const master = Math.max(0, Math.min(1, Number(volume.master ?? 20) / 100));
    const sfx = Math.max(0, Math.min(1, Number(volume.sfx ?? 80) / 100));
    return master * sfx;
  }

  function loadBuffer(ctx, sound) {
    if (bufferCache.has(sound.id)) return bufferCache.get(sound.id);
    const promise = fetch(sound.path)
      .then((res) => {
        if (!res.ok) throw new Error(`sfx fetch failed: ${sound.path}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch((err) => {
        // Allow a later retry if loading fails (e.g. context not yet unlocked).
        bufferCache.delete(sound.id);
        throw err;
      });
    bufferCache.set(sound.id, promise);
    return promise;
  }

  function playSfx(id) {
    try {
      const sound = registry ? registry.get(id) : SOUNDS.find((s) => s.id === id);
      if (!sound) return;
      const gainLevel = getSfxGain();
      if (gainLevel <= 0) return;
      const ctx = getContext();
      if (!ctx) return;
      loadBuffer(ctx, sound)
        .then((buffer) => {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const gain = ctx.createGain();
          gain.gain.value = Math.max(0, Math.min(1, Number(sound.volume ?? 1))) * getSfxGain();
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start(0);
        })
        .catch(() => {});
    } catch {}
  }

  Neo.playSfx = playSfx;
})();
