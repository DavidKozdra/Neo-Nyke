// sfx.js — game-side sound-effect playback. Registers sounds with the reusable
// KozEngine soundRegistry and plays one-shots through Web Audio, respecting the
// player's master/sfx volume settings (NeoSettings master * sfx).
(function initSfx() {
  const registryApi = window.KozEngine?.Audio?.soundRegistry || null;
  const mixerApi = window.KozEngine?.Audio?.mixerSystem || null;
  const registry = registryApi?.createSoundRegistry ? registryApi.createSoundRegistry() : null;
  const priority = mixerApi?.PRIORITY || {
    AMBIENT: 0.2,
    LOW: 0.35,
    NORMAL: 0.5,
    HIGH: 0.75,
    CRITICAL: 1,
  };
  const voicePool = mixerApi?.createVoicePool?.({ maxVoices: 24, maxPerSound: 4 }) || null;
  const activeSources = new Map();
  let duckSequence = 0;

  // id -> { promise } resolving to a decoded AudioBuffer (decoded once, then cached).
  const bufferCache = new Map();
  let outputContext = null;
  let outputNode = null;

  // Game sound list. Paths are relative to the page (index.html / game.html).
  // A sound may provide multiple `paths`; a random variant is chosen per play so
  // repeated triggers (melee swings, shop transactions) don't sound identical.
  const SOUNDS = [
    { id: 'item_collect', path: 'assets/sounds/Item Collect.wav', volume: 0.7, priority: priority.HIGH, mixDb: 3 },
    { id: 'coin', path: 'assets/sounds/Coin.wav', volume: 0.6, priority: priority.LOW, mixDb: -6 },
    { id: 'heal_player', path: 'assets/sounds/Heal_player.wav', volume: 0.7, priority: priority.HIGH, mixDb: 3 },
    { id: 'player_death', path: 'assets/sounds/Player Death.wav', volume: 0.8, priority: priority.CRITICAL, mixDb: 3, lowCutHz: 45 },
    {
      id: 'buy_sell',
      volume: 0.7,
      priority: priority.NORMAL,
      paths: [
        'assets/sounds/sfx_Buy:Sell 1.wav',
        'assets/sounds/sfx_Buy:Sell 2.wav',
        'assets/sounds/sfx_Buy:Sell 3.wav',
      ],
    },
    { id: 'enemy_hit', path: 'assets/sounds/sfx_Enemy Hit.wav', volume: 0.6, priority: priority.LOW, mixDb: -6 },
    { id: 'fire', path: 'assets/sounds/sfx_Fire.wav', volume: 0.5, priority: priority.HIGH, mixDb: 3 },
    {
      id: 'sword_swing',
      volume: 0.6,
      priority: priority.CRITICAL,
      mixDb: 3,
      duckMusicGain: 0.8,
      lowCutHz: 90,
      paths: [
        'assets/sounds/sfx_Sword Swing 1.wav',
        'assets/sounds/sfx_Sword Swing 2.wav',
      ],
    },
    {
      id: 'dialogue',
      volume: 0.6,
      priority: priority.HIGH,
      mixDb: 3,
      paths: [
        'assets/sounds/sfx_Dialogue 1.wav',
        'assets/sounds/sfx_Dialogue 2.wav',
        'assets/sounds/sfx_Dialogue 3.wav',
      ],
    },
    { id: 'room_transition', path: 'assets/sounds/sfx_room transition.wav', volume: 0.6, priority: priority.NORMAL },
    { id: 'ladder', path: 'assets/sounds/sfx_ladder.wav', volume: 0.7, priority: priority.HIGH, mixDb: 3 },
    {
      id: 'secret_reveal',
      volume: 0.7,
      priority: priority.HIGH,
      mixDb: 3,
      paths: [
        'assets/sounds/sfx_secret reveal.mp3',
        'assets/sounds/sfx_secret reveal 3.mp3',
        'assets/sounds/sfx_secret reveal 4.mp3',
      ],
    },
    { id: 'dash', path: 'assets/sounds/sfx_dash 1.mp3', volume: 0.3, priority: priority.HIGH, mixDb: 3, lowCutHz: 90 },
    {
      id: 'victory',
      volume: 0.7,
      priority: priority.CRITICAL,
      mixDb: 3,
      paths: [
        'assets/sounds/sfx_victory 1.mp3',
        'assets/sounds/sfx_victory 2.mp3',
        'assets/sounds/sfx_victory 3.mp3',
      ],
    },
    {
      id: 'achievement',
      volume: 0.7,
      priority: priority.HIGH,
      mixDb: 3,
      paths: [
        'assets/sounds/sfx_achievement 1.mp3',
        'assets/sounds/sfx_achievement 2.mp3',
        'assets/sounds/sfx_achievement 3.mp3',
      ],
    },
  ];

  const soundDefs = new Map();
  SOUNDS.forEach((sound) => {
    const registered = registry?.register(sound.id, sound);
    if (registered) {
      soundDefs.set(sound.id, registered);
      return;
    }
    const paths = Array.isArray(sound.paths) && sound.paths.length ? sound.paths.slice() : [sound.path];
    soundDefs.set(sound.id, { ...sound, paths });
  });

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

  function getOutputNode(ctx) {
    if (outputContext === ctx && outputNode) return outputNode;
    outputContext = ctx;
    if (typeof ctx.createDynamicsCompressor !== 'function') {
      outputNode = ctx.destination;
      return outputNode;
    }
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    outputNode = limiter;
    return outputNode;
  }

  function loadBuffer(ctx, path) {
    if (bufferCache.has(path)) return bufferCache.get(path);
    const promise = fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`sfx fetch failed: ${path}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch((err) => {
        // Allow a later retry if loading fails (e.g. context not yet unlocked).
        bufferCache.delete(path);
        throw err;
      });
    bufferCache.set(path, promise);
    return promise;
  }

  function playSfx(id) {
    try {
      const def = soundDefs.get(id);
      if (!def || !def.paths.length) return;
      const gainLevel = getSfxGain();
      if (gainLevel <= 0) return;
      const ctx = getContext();
      if (!ctx) return;
      const path = def.paths[Math.floor(Math.random() * def.paths.length)];
      if (!path) return;
      loadBuffer(ctx, path)
        .then((buffer) => {
          const allocation = voicePool?.acquire({
            soundId: id,
            priority: def.priority,
            now: ctx.currentTime * 1000,
          }) || { granted: true, voice: null, evicted: [] };
          for (const evicted of allocation.evicted || []) {
            try { activeSources.get(evicted.handle)?.stop(); } catch {}
            activeSources.delete(evicted.handle);
          }
          if (!allocation.granted) return;

          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const gain = ctx.createGain();
          const mixGain = mixerApi?.dbToGain?.(def.mixDb ?? 0) ?? Math.pow(10, Number(def.mixDb || 0) / 20);
          gain.gain.value = Math.max(0, Number(def.volume ?? 1) * mixGain * getSfxGain());
          const lowCut = mixerApi?.createLowCutNode?.(
            ctx,
            def.lowCutHz ?? mixerApi.DEFAULT_LOW_CUT_HZ
          ) || null;
          if (lowCut) {
            source.connect(lowCut);
            lowCut.connect(gain);
          } else {
            source.connect(gain);
          }
          gain.connect(getOutputNode(ctx));

          const voiceHandle = allocation.voice?.handle ?? null;
          if (voiceHandle != null) activeSources.set(voiceHandle, source);
          const shouldDuck = def.duckMusicGain != null
            || mixerApi?.shouldDuckMusic?.(def.priority);
          const duckGain = def.duckMusicGain
            ?? mixerApi?.duckGainForPriority?.(def.priority)
            ?? 1;
          const duckToken = shouldDuck && duckGain < 1
            ? `sfx:${id}:${++duckSequence}`
            : null;
          if (duckToken) Neo.musicMix?.hold?.(duckToken, duckGain);

          source.onended = () => {
            if (voiceHandle != null) {
              voicePool?.release?.(voiceHandle);
              activeSources.delete(voiceHandle);
            }
            if (duckToken) Neo.musicMix?.release?.(duckToken);
          };
          source.start(0);
        })
        .catch(() => {});
    } catch {}
  }

  Neo.playSfx = playSfx;
})();
