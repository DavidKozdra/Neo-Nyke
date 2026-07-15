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
        'assets/sounds/sfx_Buy-Sell 1.wav',
        'assets/sounds/sfx_Buy-Sell 2.wav',
        'assets/sounds/sfx_Buy-Sell 3.wav',
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
    { id: 'dash', path: 'assets/sounds/sfx_dash 1.mp3', volume: 0.1, priority: priority.LOW, mixDb: 3, lowCutHz: 70 },
    { id: 'bomb_explosion', path: 'assets/sounds/sfx_bomb explosion.wav', volume: 0.7, priority: priority.CRITICAL, mixDb: 3, duckMusicGain: 0.8, lowCutHz: 35 },
    { id: 'lazer_blast', path: 'assets/sounds/sfx_lazer_blast.mp3', volume: 0.5, priority: priority.HIGH, mixDb: 3, lowCutHz: 90 },
    // Ground-slam / area-of-effect shockwave bursts (smash, crimson/hammer/chaos).
    { id: 'aoe', path: 'assets/sounds/sfx_AOE 4.wav', volume: 0.7, priority: priority.CRITICAL, mixDb: 3, duckMusicGain: 0.8, lowCutHz: 40 },
    {
      // Enemy hurt grunts — a random variant plays when an enemy takes damage.
      id: 'enemy_hurt',
      volume: 0.6,
      priority: priority.HIGH,
      mixDb: 3,
      paths: [
        'assets/sounds/sfx_enemy hit_ uuearh_long.wav',
        'assets/sounds/sfx_enemy hit_ uuearh.wav',
        'assets/sounds/sfx_enemy hit_aahh_boss.wav',
        'assets/sounds/sfx_enemy hit_arrgh.wav',
        'assets/sounds/sfx_enemy hit_ooah_deep.wav',
        'assets/sounds/sfx_enemy hit_uiiiiee_short.wav',
        'assets/sounds/sfx_enemy hit_uuaa_deep.wav',
        'assets/sounds/sfx_enemy hit_uuua_deep.wav',
        'assets/sounds/sfx_enemy hit_wueea.wav',
      ],
    },
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
    // Player fire/burn move (fireballs, Metao's fire staff) — distinct from the
    // generic projectile 'fire' one-shot above.
    { id: 'fire_burn', path: 'assets/sounds/sf_new_fire.wav', volume: 0.6, priority: priority.HIGH, mixDb: 3, lowCutHz: 60 },
    // Lightning casts: Lightning Columns, Spear of Lightning (smite), and any
    // other electric strike. One-shot crack at cast time.
    { id: 'lightning_charge', path: 'assets/sounds/sf_Lightning Charge.wav', volume: 0.6, priority: priority.HIGH, mixDb: 3, lowCutHz: 70 },
    // Continuous electrical bed used while the Storm challenge is active.
    { id: 'lightning_storm_loop', path: 'assets/sounds/sf_Lightning Charge_looped.wav', volume: 0.42, priority: priority.NORMAL, mixDb: -1, lowCutHz: 70 },
    // Forge anvil upgrade confirmation.
    { id: 'forge_upgrade', path: 'assets/sounds/sfx_Forge Upgrade.wav', volume: 0.7, priority: priority.HIGH, mixDb: 3 },
    // UI: generic menu/button click and the primary confirm (GO / ENTER DUNGEON).
    {
      id: 'menu_click',
      volume: 0.5,
      priority: priority.NORMAL,
      mixDb: -3,
      paths: [
        'assets/sounds/sf_menu_click 1.wav',
        'assets/sounds/sf_menu_click 2.wav',
      ],
    },
    { id: 'hud_confirm', path: 'assets/sounds/sfx_hud_confirm 6.wav', volume: 0.6, priority: priority.HIGH, mixDb: 0 },
    // Breakable props (pots, crates, and other non-explosive furniture) shattering.
    { id: 'break_furniture', path: 'assets/sounds/sfx_break_funiture.wav', volume: 0.6, priority: priority.NORMAL, mixDb: 0 },
  ];

  // Display metadata for the per-sound volume mixer (Settings → Volume). Each
  // entry maps a sound id to a human label and a category bucket. Anything not
  // listed here falls back to a prettified id under the "Other" category, so the
  // mixer stays complete even if a new sound is added without metadata.
  const SOUND_META = {
    // Combat
    fire:            { label: 'Weapon Fire',         category: 'Combat' },
    fire_burn:       { label: 'Fireballs / Burn',    category: 'Combat' },
    sword_swing:     { label: 'Sword Swing',         category: 'Combat' },
    lazer_blast:     { label: 'Laser Blast',         category: 'Combat' },
    aoe:             { label: 'AOE Slam',            category: 'Combat' },
    lightning_charge:{ label: 'Lightning',           category: 'Combat' },
    lightning_storm_loop: { label: 'Storm Challenge', category: 'Combat' },
    bomb_explosion:  { label: 'Bomb Explosion',      category: 'Combat' },
    dash:            { label: 'Dash',                category: 'Combat' },
    enemy_hit:       { label: 'Enemy Hit',           category: 'Combat' },
    enemy_hurt:      { label: 'Enemy Hurt',          category: 'Combat' },
    player_death:    { label: 'Player Death',        category: 'Combat' },
    // Pickups & economy
    item_collect:    { label: 'Item Collect',        category: 'Pickups' },
    coin:            { label: 'Coin',                category: 'Pickups' },
    heal_player:     { label: 'Heal',                category: 'Pickups' },
    buy_sell:        { label: 'Buy / Sell',          category: 'Pickups' },
    secret_reveal:   { label: 'Secret Reveal',       category: 'Pickups' },
    // World
    room_transition: { label: 'Room Transition',     category: 'World' },
    ladder:          { label: 'Ladder',              category: 'World' },
    break_furniture: { label: 'Break Furniture',     category: 'World' },
    // UI
    menu_click:      { label: 'Menu Click',          category: 'UI' },
    hud_confirm:     { label: 'Confirm',             category: 'UI' },
    forge_upgrade:   { label: 'Forge Upgrade',       category: 'UI' },
    dialogue:        { label: 'Dialogue',            category: 'UI' },
    // Stingers
    victory:         { label: 'Victory',             category: 'Stingers' },
    achievement:     { label: 'Achievement',         category: 'Stingers' },
  };
  const CATEGORY_ORDER = ['Combat', 'Pickups', 'World', 'UI', 'Stingers', 'Other'];

  function prettifyId(id) {
    return String(id || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

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

  // Catalog consumed by the settings UI to build one volume slider per sound,
  // grouped by category and ordered consistently.
  function getSoundCatalog() {
    const entries = SOUNDS.map((sound) => {
      const meta = SOUND_META[sound.id] || {};
      return {
        id: sound.id,
        label: window.NeoI18n?.tOptional?.(`sounds.${sound.id}.label`, meta.label || prettifyId(sound.id)) || meta.label || prettifyId(sound.id),
        category: window.NeoI18n?.tOptional?.(`soundCategories.${meta.category || 'Other'}`, meta.category || 'Other') || meta.category || 'Other',
        // Baseline 0-100 level shown when the player hasn't overridden this sound.
        defaultLevel: Math.round(Math.max(0, Math.min(1, Number(sound.volume ?? 1))) * 100),
      };
    });
    entries.sort((a, b) => {
      const ca = CATEGORY_ORDER.indexOf(a.category);
      const cb = CATEGORY_ORDER.indexOf(b.category);
      if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
      return a.label.localeCompare(b.label);
    });
    return { categoryOrder: CATEGORY_ORDER.slice(), sounds: entries };
  }
  Neo.getSoundCatalog = getSoundCatalog;

  function getContext() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    const ctx = Neo.mooggyAudioContext || new AudioContextCtor();
    Neo.mooggyAudioContext = ctx;
    if (ctx.state === 'suspended') ctx.resume?.();
    return ctx;
  }

  function clamp01(n, fallback) {
    const value = Number(n);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(1, value / 100));
  }

  function getMasterGain() {
    const volume = window.NeoSettings?.getVolume?.() || {};
    return clamp01(volume.master, 0.2);
  }

  // Per-sound absolute level. If the player has set this sound's slider, that
  // value (0-100) is its level directly. Otherwise the sound's authored baseline
  // (def.volume) is used, attenuated by the shared SFX slider so SFX still acts
  // as a default for un-touched sounds. Master scales everything on top.
  function getSoundGain(id, baselineVolume = 1) {
    const volume = window.NeoSettings?.getVolume?.() || {};
    const overrides = volume.soundLevels || {};
    let level;
    if (id != null && overrides[id] != null) {
      level = clamp01(overrides[id], baselineVolume);
    } else {
      const sfxBaseline = clamp01(volume.sfx, 0.8);
      level = Math.max(0, Math.min(1, Number(baselineVolume) || 0)) * sfxBaseline;
    }
    return getMasterGain() * level;
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
      const gainLevel = getSoundGain(id, def.volume ?? 1);
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
          // getSoundGain already folds in the sound's baseline volume (or the
          // player's per-sound override), Master, and the SFX default.
          gain.gain.value = Math.max(0, mixGain * getSoundGain(id, def.volume ?? 1));
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

  const activeLoops = new Map();

  function stopSfxLoop(id) {
    const key = String(id || '');
    const active = activeLoops.get(key);
    if (!active) return false;
    active.cancelled = true;
    try { active.source?.stop?.(); } catch {}
    activeLoops.delete(key);
    return true;
  }

  function playSfxLoop(id) {
    try {
      const key = String(id || '');
      if (!key || activeLoops.has(key)) return;
      const def = soundDefs.get(key);
      if (!def || !def.paths.length) return;
      const gainLevel = getSoundGain(key, def.volume ?? 1);
      if (gainLevel <= 0) return;
      const ctx = getContext();
      if (!ctx) return;
      const path = def.paths[0];
      if (!path) return;
      const active = { cancelled: false, source: null };
      activeLoops.set(key, active);
      loadBuffer(ctx, path)
        .then((buffer) => {
          if (active.cancelled || activeLoops.get(key) !== active) return;
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          const gain = ctx.createGain();
          const mixGain = mixerApi?.dbToGain?.(def.mixDb ?? 0) ?? Math.pow(10, Number(def.mixDb || 0) / 20);
          gain.gain.value = Math.max(0, mixGain * getSoundGain(key, def.volume ?? 1));
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
          active.source = source;
          source.onended = () => {
            if (activeLoops.get(key) === active) activeLoops.delete(key);
          };
          source.start(0);
        })
        .catch(() => {
          if (activeLoops.get(key) === active) activeLoops.delete(key);
        });
    } catch {}
  }

  Neo.playSfx = playSfx;
  Neo.playSfxLoop = playSfxLoop;
  Neo.stopSfxLoop = stopSfxLoop;

  // Global UI click feedback. A single capture-phase listener covers every
  // button rather than wiring each call site. The vast majority of buttons get
  // the light menu_click; only the handful of buttons that *commit* a choice
  // get the weightier hud_confirm. Confirm is opt-IN via an explicit id/class
  // allowlist — heuristics like `type === 'submit'` over-match because a
  // <button> with no type attribute defaults to submit, which is most of them.
  // Buttons that already play their own dedicated sound opt out via
  // data-no-click-sfx.
  const CONFIRM_IDS = new Set([
    'go',                  // ENTER DUNGEON / COMPETE / CONFIRM hero
    'scrollControlConfirm',
    'voucherConfirm',
  ]);
  // Classes that mark a genuine commit-the-action button. The carousel arrows
  // reuse `scroll-control-btn--primary` for styling, so we do NOT match a bare
  // --primary suffix; we list the specific primary buttons that really confirm.
  const CONFIRM_CLASSES = new Set([
    'dead-action--primary',   // RETRY CURRENT SEED
    'dead-action--revive',    // REVIVE
    'win-action--primary',    // LOOP TO FLOOR 1
  ]);
  const CONFIRM_CLASS_SUFFIXES = ['--confirm'];
  function classifyClickSound(el) {
    if (!el) return null;
    if (el.dataset?.noClickSfx != null) return null;
    if (el.disabled || el.getAttribute?.('aria-disabled') === 'true') return null;
    const cls = el.classList;
    // The anvil confirm button plays the forge_upgrade sound itself.
    if (cls?.contains('anvil-btn--confirm')) return null;
    const isConfirm = CONFIRM_IDS.has(el.id)
      || [...(cls || [])].some(
        (name) => CONFIRM_CLASSES.has(name) || CONFIRM_CLASS_SUFFIXES.some((s) => name.endsWith(s))
      );
    return isConfirm ? 'hud_confirm' : 'menu_click';
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element
        ? event.target.closest('button, [role="button"]')
        : null;
      if (!target) return;
      const id = classifyClickSound(target);
      if (id) playSfx(id);
    }, true);
  }
})();
