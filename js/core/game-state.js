// game-state.js — Game state management, meta progress, run logic.

export function pauseGame() {
    document.body.classList.add('game-paused');
    setGameState('pause');
  }

export function resumeGame() {
    document.body.classList.remove('game-paused');
    setGameState('play');
  }

  function createDefaultMeta() {
    return {
      username: '',
      birthday: '',
      coins: 0,
      bestFloor: 1,
      bestKills: 0,
      bestLevel: 1,
      bestTime: 0,
      bestCoins: 0,
      unlockedItems: [],
      unlockedCharacters: ['princess', 'thorn_knight', 'metao'],
      unlockedChallenges: [],
      selectedDifficulty: 'easy',
      selectedChallenges: [],
      selectedCharacter: 'thorn_knight',
      godsKilled: 0,
      mooggyDefeats: 0,
      loopCrystals: 0,
      unlockedLegacy: [],
      tutorialCompleted: false,
      lastSeenAt: 0,
      tutorialButtonLastOfferedAt: 0,
      seenTips: {},
      sandboxSettings: { ...Neo.SANDBOX_DEFAULT_SETTINGS },
    };
  }

  function normalizeSandboxSettings(input) {
    const source = input && typeof input === 'object' ? input : {};
    const allowedEnemies = Array.isArray(source.allowedEnemies)
      ? Neo.SANDBOX_ENEMY_TYPES.filter(type => source.allowedEnemies.includes(type))
      : Neo.SANDBOX_ENEMY_TYPES.slice();
    const allowedItems = Array.isArray(source.allowedItems)
      ? Neo.ITEM_KEYS.filter(key => source.allowedItems.includes(key))
      : Neo.ITEM_KEYS.slice();
    const legacyPerItem = Math.max(1, Math.min(99, Math.round(Number(source.startingItemCount) || 1)));
    const startingItems = {};
    if (Array.isArray(source.startingItems)) {
      for (const key of source.startingItems) {
        if (Neo.ITEM_KEYS.includes(key)) startingItems[key] = legacyPerItem;
      }
    } else if (source.startingItems && typeof source.startingItems === 'object') {
      for (const key of Neo.ITEM_KEYS) {
        const n = Math.round(Number(source.startingItems[key]) || 0);
        if (n > 0) startingItems[key] = Math.min(99, n);
      }
    }
    const slots = ['melee', 'laser', 'smash', 'dash'];
    const moveSource = source.moveLoadout && typeof source.moveLoadout === 'object' ? source.moveLoadout : {};
    const moveLoadout = {};
    for (const slot of slots) {
      const key = String(moveSource[slot] || '');
      // '' = use the character default; otherwise the move must exist and match the slot.
      moveLoadout[slot] = (key && Neo.MOVE_DEFS[key]?.slot === slot) ? key : '';
    }
    return {
      enemyStatMultiplier: Math.max(0.2, Math.min(4, Number(source.enemyStatMultiplier ?? Neo.SANDBOX_DEFAULT_SETTINGS.enemyStatMultiplier) || 1)),
      enemySpeedMultiplier: Math.max(0.2, Math.min(3, Number(source.enemySpeedMultiplier ?? Neo.SANDBOX_DEFAULT_SETTINGS.enemySpeedMultiplier) || 1)),
      enemyDamageMultiplier: Math.max(0.1, Math.min(3, Number(source.enemyDamageMultiplier ?? Neo.SANDBOX_DEFAULT_SETTINGS.enemyDamageMultiplier) || 1)),
      playerDamageMultiplier: Math.max(0.1, Math.min(6, Number(source.playerDamageMultiplier ?? Neo.SANDBOX_DEFAULT_SETTINGS.playerDamageMultiplier) || 1)),
      startingCoins: Math.max(0, Math.min(999, Math.round(Number(source.startingCoins ?? Neo.SANDBOX_DEFAULT_SETTINGS.startingCoins) || 0))),
      startingLevel: Math.max(1, Math.min(99, Math.round(Number(source.startingLevel ?? Neo.SANDBOX_DEFAULT_SETTINGS.startingLevel) || 1))),
      godMode: !!source.godMode,
      unlockEverything: !!source.unlockEverything,
      moveLoadout,
      allowedEnemies: allowedEnemies.length ? allowedEnemies : Neo.SANDBOX_ENEMY_TYPES.slice(0, 1),
      allowedItems: allowedItems.length ? allowedItems : Neo.ITEM_KEYS.slice(),
      startingItems,
    };
  }

  function isSandboxRunActive() {
    return Neo.gameMode === 'sandbox';
  }

  function getActiveSandboxSettings() {
    return isSandboxRunActive() ? Neo.sandboxSettings : null;
  }

  // Applies sandbox loadout/level/unlock settings to a freshly created player.
  function applySandboxPlayerSetup(playerData) {
    if (!playerData) return;
    const settings = Neo.sandboxSettings || {};

    // Override equipped moves per slot (empty string keeps the character default).
    const loadout = settings.moveLoadout && typeof settings.moveLoadout === 'object' ? settings.moveLoadout : {};
    playerData.ownedMoves = playerData.ownedMoves || {};
    for (const slot of ['melee', 'laser', 'smash', 'dash']) {
      const key = String(loadout[slot] || '');
      if (key && Neo.MOVE_DEFS[key]?.slot === slot) {
        playerData.equippedMoves[slot] = key;
        playerData.ownedMoves[key] = true;
      }
    }

    // Unlock everything: own all weapons and all moves so they can be swapped in-run.
    if (settings.unlockEverything) {
      playerData.ownedWeapons = playerData.ownedWeapons || {};
      for (const key of Neo.WEAPON_KEYS) playerData.ownedWeapons[key] = true;
      for (const key of Object.keys(Neo.MOVE_DEFS)) playerData.ownedMoves[key] = true;
    }

    // Starting level: replicate per-level gains so stats line up with a leveled run.
    const startingLevel = Math.max(1, Math.min(99, Math.round(Number(settings.startingLevel) || 1)));
    const extraLevels = startingLevel - (Number(playerData.level) || 1);
    if (extraLevels > 0) {
      for (let i = 0; i < extraLevels; i++) {
        playerData.level += 1;
        playerData.xpToNext = Math.round((Number(playerData.xpToNext) || 20) * 1.22);
        playerData.maxHp += 15;
        playerData.attackPower += 3;
        playerData.attackSpeed += 0.01;
      }
      playerData.hp = playerData.maxHp;
    }
  }

  function createDefaultTutorialState() {
    return {
      active: false,
      step: 'move',
      manualStepLockUntil: 0,
      dummySpawned: false,
      moved: false,
      gotKill: false,
      gotRelic: false,
      openedInventory: false,
      openedShop: false,
      usedLadder: false,
    };
  }

  function getCharacterStartingItems(characterKey) {
    const items = {};
    if (characterKey === 'thorn_knight') {
      items.neo_knife = 1;
      items.tooth_of_thorn = 2;
      items.tough_skin = 1;
    }
    if (characterKey === 'mooggy') {
      items.hemes_scarf = 1;
      items.mooggy_zoomies = 1;
    }
    if (characterKey === 'princess') items.princes_glasses = 1;
    if (characterKey === 'metao') items.mateos_bag = 1;
    return items;
  }

  function resetTutorialState(active = false) {
    Neo.tutorialState = createDefaultTutorialState();
    Neo.tutorialState.active = !!active;
  }

  function isFirstRunTutorialActive() {
    return !!Neo.tutorialState?.active && Neo.gameMode === 'normal' && Neo.gameState === 'play';
  }

  function consumeReplayTutorialRequest() {
    let requested = false;
    try {
      requested = localStorage.getItem(Neo.REPLAY_TUTORIAL_KEY) === '1';
      if (requested) localStorage.removeItem(Neo.REPLAY_TUTORIAL_KEY);
    } catch {}
    return requested;
  }

  // Offer the green main-menu tutorial button on the first menu visit, then at
  // most once every 30 days after that.
  const TUTORIAL_REOFFER_MS = 30 * 24 * 60 * 60 * 1000;
  function shouldOfferTutorialButton() {
    const meta = Neo.metaProgress;
    if (!meta) return true;
    const lastOfferedAt = Number(meta.tutorialButtonLastOfferedAt || 0);
    if (!lastOfferedAt) return true;
    return (Date.now() - lastOfferedAt) >= TUTORIAL_REOFFER_MS;
  }

  function markTutorialButtonOfferedNow() {
    if (!Neo.metaProgress) return;
    Neo.metaProgress.tutorialButtonLastOfferedAt = Date.now();
    Neo.persistMetaSoon();
  }

  // Keep a lightweight "last played" stamp in meta for profile/menu context.
  function markPlayerSeenNow() {
    if (!Neo.metaProgress) return;
    Neo.metaProgress.lastSeenAt = Date.now();
    Neo.persistMetaSoon();
  }

  // Contextual explainer copy, shown once the first time each system is reached.
  const FIRST_TIPS = {
    forge: {
      icon: '⚒',
      title: 'THE FORGE',
      body: 'Spend XP and gold here to permanently upgrade your weapons and moves for this run. Pick an item, boost its stats, then Confirm. Tip: a weapon that matches your class’s style hits harder.',
    },
    weapons: {
      icon: '⚔',
      title: 'WEAPONS',
      body: 'Each weapon has its own attack and type (melee or magic). Any weapon works on any character, but one matching your class’s style deals about 25% more damage. Swapping changes your damage — it does not lower your other stats.',
    },
    skills: {
      icon: '⚡',
      title: 'SKILLS & MOVES',
      body: 'Your equipped moves fire from the action bar (F/G/H/J/K/L). Drag owned moves into matching slots to swap your kit anytime. Changing a move swaps what you can do — it never reduces your stats.',
    },
  };

  // One-time contextual explainer. Shows a dismissible card the first time a
  // given system is reached, then never again (tracked in metaProgress.seenTips).
  function showFirstTip(key, tipOverride) {
    if (!key) return;
    const meta = Neo.metaProgress;
    if (!meta) return;
    if (!meta.seenTips || typeof meta.seenTips !== 'object') meta.seenTips = {};
    if (meta.seenTips[key]) return;
    const tip = tipOverride || FIRST_TIPS[key];
    if (!tip || !Neo.uiController?.showFirstTip) return;
    meta.seenTips[key] = true;
    Neo.persistMetaSoon();
    Neo.uiController.showFirstTip(tip);
  }

  function formatControlLabel(value, fallback = '') {
    const key = String(value || fallback || '').toLowerCase();
    if (!key) return '';
    if (key === ' ') return 'Space';
    if (key === 'lmb') return 'LMB';
    if (key === 'rmb') return 'RMB';
    if (key === 'shift') return 'Shift';
    if (key === 'arrowup') return 'ArrowUp';
    if (key === 'arrowdown') return 'ArrowDown';
    if (key === 'arrowleft') return 'ArrowLeft';
    if (key === 'arrowright') return 'ArrowRight';
    if (key === 'control') return 'Ctrl';
    return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
  }

  function getControlHint(action, fallback) {
    const bindings = window.NeoSettings?.getBindings?.() || {};
    return formatControlLabel(bindings[action], fallback);
  }

  function hasTouchControls() {
    const coarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const maxTouchPoints = typeof navigator !== 'undefined' ? Number(navigator.maxTouchPoints || 0) : 0;
    return !!(coarsePointer || maxTouchPoints > 0);
  }

  function getAscendControlHint() {
    if (!hasTouchControls()) return formatControlLabel('space', 'space');
    const defaults = { touchA: 'slash', touchB: 'laser', touchY: 'smash', touchX: 'ascend', touchDash: 'dash' };
    const labels = { touchA: 'A BUTTON', touchB: 'B BUTTON', touchY: 'Y BUTTON', touchX: 'X BUTTON', touchDash: 'DASH BUTTON' };
    const bindings = { ...defaults, ...(window.NeoSettings?.getTouchBindings?.() || {}) };
    const entry = Object.entries(bindings).find(([, action]) => String(action).toLowerCase() === 'ascend');
    return labels[entry?.[0]] || 'X BUTTON';
  }

  function getMovementControlHint() {
    const up = getControlHint('up', 'w');
    const left = getControlHint('left', 'a');
    const down = getControlHint('down', 's');
    const right = getControlHint('right', 'd');
    return `${up}/${left}/${down}/${right}`;
  }

  function ensureTutorialDummyEnemy() {
    if (!isFirstRunTutorialActive() || Neo.tutorialState.gotKill) return;
    if (Neo.tutorialState.step !== 'fight') return;
    if (!Neo.currentRoom || ['boss', 'god', 'shop', 'anvil', 'challenge'].includes(Neo.currentRoom.type)) return;
    if (Neo.tutorialState.dummySpawned || Neo.enemies.some(enemy => enemy?.tutorialDummy)) return;
    // Force a fair tutorial duel by clearing the normal room wave for this step.
    if (Neo.enemies.length > 0) {
      Neo.enemies = Neo.enemies.filter(enemy => enemy?.type === 'rival');
      Neo.syncCurrentRoomState();
    }
    const safeSpawn = Neo.findSafeEnemySpawnPoint(Neo.player.x + 110, Neo.player.y, 15)
      || Neo.findSafeEnemySpawnPoint(Neo.player.x - 110, Neo.player.y, 15)
      || Neo.findSafeEnemySpawnPoint(Neo.player.x, Neo.player.y - 90, 15)
      || Neo.findSafeEnemySpawnPoint(Neo.ROOM_W / 2 + 130, Neo.ROOM_H / 2, 15)
      || { x: Neo.clamp(Neo.player.x + 80, Neo.WALL + 22, Neo.ROOM_W - Neo.WALL - 22), y: Neo.clamp(Neo.player.y - 40, Neo.WALL + 22, Neo.ROOM_H - Neo.WALL - 22) };
    const dummy = Neo.spawnEnemy('hunter', safeSpawn.x, safeSpawn.y, false);
    dummy.tutorialDummy = true;
    dummy.hp = 16;
    dummy.max = 16;
    dummy.speed = 42;
    dummy.dmg = 1;
    dummy.attackCd = 2.8;
    dummy.spawnT = 0.18;
    dummy.barrier = 0;
    Neo.tutorialState.dummySpawned = true;
    Neo.spawnParticle({ x: dummy.x, y: dummy.y - 24, life: 1.4, text: 'TRAINING DUMMY', c: '#8dd4ff' });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 1.1, text: 'DUMMY SPAWNED', c: '#9ce9ff' });
  }

  function getTutorialStepOrder() {
    return ['move', 'fight', 'relic', 'panel', 'ladder'];
  }

  function navigateTutorialStep(direction = 1) {
    if (!isFirstRunTutorialActive()) return;
    const order = getTutorialStepOrder();
    const current = order.indexOf(Neo.tutorialState.step);
    const nextIndex = Neo.clamp((current >= 0 ? current : 0) + direction, 0, order.length - 1);
    Neo.tutorialState.step = order[nextIndex];
    Neo.tutorialState.manualStepLockUntil = Number(Neo.gameElapsedTime || 0) + 0.65;
    if (Neo.tutorialState.step === 'fight') ensureTutorialDummyEnemy();
    Neo.updateObjective();
  }

  function getTutorialStepMessage() {
    if (!isFirstRunTutorialActive()) return '';
    const moveHint = getMovementControlHint();
    const slashHint = getControlHint('slash', 'lmb');
    const laserHint = getControlHint('laser', 'rmb');
    const smashHint = getControlHint('smash', 'r');
    const inventoryHint = getControlHint('inventory', 'i');
    const shopHint = formatControlLabel('e', 'e');
    const ladderHint = getAscendControlHint();
    if (Neo.tutorialState.step === 'move') return `Tutorial: Move with ${moveHint}.`;
    if (Neo.tutorialState.step === 'fight') return `Tutorial: Defeat the training dummy using ${slashHint}, ${laserHint}, or ${smashHint}.`;
    if (Neo.tutorialState.step === 'relic') return 'Tutorial: Pick up your first relic drop.';
    if (Neo.tutorialState.step === 'panel') return `Tutorial: Press ${inventoryHint} to open Inventory. In shop rooms, press ${shopHint} to open the shop.`;
    if (Neo.currentRoom?.type === 'ladder' && Neo.currentRoom?.cleared) return `Tutorial: Stand on the ladder and press ${ladderHint} to go to the next floor.`;
    if (Neo.currentRoom?.type === 'ladder') return 'Tutorial: Clear this ladder room, then use the ladder.';
    return 'Tutorial: Find the ladder room and continue to the next floor.';
  }

  function getTutorialObjectiveEntries() {
    if (!isFirstRunTutorialActive()) return [];
    const moveHint = getMovementControlHint();
    const slashHint = getControlHint('slash', 'lmb');
    const laserHint = getControlHint('laser', 'rmb');
    const inventoryHint = getControlHint('inventory', 'i');
    const shopHint = formatControlLabel('e', 'e');
    const ladderHint = getAscendControlHint();
    return [
      { text: `Move (${moveHint})`, state: Neo.tutorialState.moved ? 'done' : 'todo' },
      { text: `Defeat training dummy (${slashHint}/${laserHint})`, state: Neo.tutorialState.gotKill ? 'done' : 'todo' },
      { text: 'Pick up one relic', state: Neo.tutorialState.gotRelic ? 'done' : 'todo' },
      { text: `Open Inventory (${inventoryHint}) or Shop (${shopHint} in shop room)`, state: (Neo.tutorialState.openedInventory || Neo.tutorialState.openedShop) ? 'done' : 'todo' },
      { text: `Use ladder: stand on it and press ${ladderHint}`, state: Neo.tutorialState.usedLadder ? 'done' : 'todo' },
    ];
  }

  function skipFirstRunTutorial() {
    if (!isFirstRunTutorialActive()) return;
    Neo.tutorialState.active = false;
    Neo.tutorialState.usedLadder = true;
    Neo.metaProgress.tutorialCompleted = true;
    Neo.persistMetaSoon();
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 26, life: 0.9, text: 'TUTORIAL SKIPPED', c: '#9cdcff' });
    Neo.uiController.setTutorialBanner('', false);
    Neo.updateObjective();
  }

  function updateFirstRunTutorialProgress() {
    if (!isFirstRunTutorialActive()) return;
    ensureTutorialDummyEnemy();
    if (Number(Neo.tutorialState.manualStepLockUntil || 0) > Number(Neo.gameElapsedTime || 0)) return;
    if (!Neo.tutorialState.moved && Math.hypot(Neo.player?.vx || 0, Neo.player?.vy || 0) > 24) Neo.tutorialState.moved = true;
    if (!Neo.tutorialState.gotKill && Number(Neo.player?.kills || 0) > 0) Neo.tutorialState.gotKill = true;
    if (Neo.tutorialState.step === 'move' && Neo.tutorialState.moved) Neo.tutorialState.step = 'fight';
    if (Neo.tutorialState.step === 'fight' && Neo.tutorialState.gotKill) Neo.tutorialState.step = 'relic';
    if (Neo.tutorialState.step === 'relic' && Neo.tutorialState.gotRelic) Neo.tutorialState.step = 'panel';
    if (Neo.tutorialState.step === 'panel' && (Neo.tutorialState.openedInventory || Neo.tutorialState.openedShop)) Neo.tutorialState.step = 'ladder';
    if (!Neo.tutorialState.usedLadder && Neo.floor > 1) Neo.tutorialState.usedLadder = true;
    if (Neo.tutorialState.usedLadder) {
      Neo.tutorialState.active = false;
      if (!Neo.metaProgress.tutorialCompleted) {
        Neo.metaProgress.tutorialCompleted = true;
        Neo.persistMetaSoon();
      }
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 26, life: 1, text: 'TUTORIAL COMPLETE', c: '#8dffcf' });
    }
  }

  function createDefaultPlayer() {
    const items = {
      neo_knife: 0,
      tooth_of_thorn: 0,
      tough_skin: 0,
      orb_of_blood: 0,
      hemes_scarf: 0,
      insurance: 0,
      gold_vac: 0,
      double_dose: 0,
      copycat_charm: 0,
      crit_charm: 0,
      attack_servo: 0,
      enemy_magnet: 0,
      keen_eye: 0,
      chrono_spring: 0,
      scholar_seal: 0,
      scholar_cap: 0,
      bandaid: 0,
      push_man: 0,
      titan_heart: 0,
      charged_adapter: 0,
      pew_pew_box: 0,
      turbo_boots: 0,
      skizzard_tail: 0,
      zap_to_extreme: 0,
      panic_button: 0,
      mid_sweepy_box: 0,
      explosive_jelly: 0,
      dragon_orb: 0,
      ricocete: 0,
      drink_master: 0,
      turtle_shell: 0,
      anchor_charm: 0,
      iron_lung: 0,
      oracles_lens: 0,
      wizards_paw: 0,
      jesters_dice: 0,
      shield_of_aegis: 0,
      pendant_of_kronos: 0,
      rich_mans_luck: 0,
      mateos_bag: 0,
      extra_battery: 0,
      mooggy_zoomies: 0,
      el_bartos_cape: 0,
    };
    const character = Neo.CHARACTER_DEFS[Neo.chosenCharacter] || Neo.CHARACTER_DEFS.thorn_knight;
    const starterItems = getCharacterStartingItems(character.key);
    Object.entries(starterItems).forEach(([key, count]) => {
      if (Object.prototype.hasOwnProperty.call(items, key)) {
        items[key] = Math.max(0, Math.round(Number(count) || 0));
      }
    });
    const equippedMoves = Neo.getDefaultMovesForCharacter(character.key);
    const defaultWeapon = Neo.getDefaultWeaponForCharacter(character.key);
    const ownedMoves = {};
    Object.values(equippedMoves).forEach(key => { ownedMoves[key] = true; });
    const maxHp = Math.round(120 * (character.hpMultiplier || 1));
    return {
      character: character.key,
      x: Neo.START_X,
      y: Neo.START_Y,
      r: 14,
      vx: 0,
      vy: 0,
      hp: maxHp,
      maxHp,
      stun: 0,
      swing: 0,
      swingA: 0,
      inv: 0,
      dashTime: 0,
      dashX: 0,
      dashY: 0,
      cowardsWayTime: 0,
      mooggyZoomiesTime: 0,
      coins: 0,
      level: 1,
      kills: 0,
      xp: 0,
      xpToNext: 20,
      attackPower: 0,
      attackSpeed: 1,
      roomDamageTaken: 0,
      rivalReputation: 0,
      insuranceActive: false,
      insuranceChargeKills: 0,
      insuranceReady: true,
      keenEyeChargeKills: 0,
      keenEyeReady: false,
      keenEyeBuffTime: 0,
      chronoSpringChargeKills: 0,
      chronoSpringReady: false,
      chronoSpringBuffTime: 0,
      critCharmBuffTime: 0,
      escapeChargeKills: 0,
      escapeReady: true,
      robotArmChargeKills: 0,
      robotArmReady: false,
      statuses: Neo.createStatusMap(),
      items,
      ownedWeapons: defaultWeapon ? { [defaultWeapon]: true } : {},
      equippedWeapon: defaultWeapon,
      weaponCooldown: 0,
      blockActive: false,
      blockTimer: 0,
      overhealBarrier: 0,
      graniallaHealPulseFrame: 0,
      fleeceTick: 0,
      weaponBeamTime: 0,
      weaponBeamTick: 0,
      equippedMoves,
      ownedMoves,
      moveStackOverrides: {},
      lavaWalkTime: 0,
      lavaTrailTick: 0,
      princessFlightTime: 0,
      anvilUpgrades: { weapon: {}, move: {} },
      storedPotions: 0,
      extraBatteryPendingCount: 0,
      equipmentSlots: (character.key === 'metao') ? ['mateos_bag'] : [],
      equipmentCooldowns: {},
      equipmentEffects: {},
    };
  }

  function applyRunChallengeStartModifiers() {
    if (!Neo.player) return;
    if (isChallengeActive('fragile_body')) {
      Neo.player.maxHp = Math.max(1, Math.round(Neo.player.maxHp * 0.7));
      Neo.player.hp = Math.min(Neo.player.hp, Neo.player.maxHp);
    }
  }

  function createItemRegistry() {
    const factory = window.KozEngine?.Items?.itemFactory;
    if (factory?.createLibrary && factory?.createRegistryFromLibrary) {
      class RuntimeItem {
        constructor(spec = {}) {
          Object.assign(this, spec);
        }
      }
      const library = factory.createLibrary(Neo.ITEM_DEFS, RuntimeItem);
      return factory.createRegistryFromLibrary(library);
    }
    return {
      get(key) {
        return Neo.ITEM_DEFS[key] || null;
      },
      keys() {
        return Neo.ITEM_KEYS.slice();
      },
    };
  }

  async function loadPersistedState() {
    Neo.uiController.setSaveState('LOADING');
    try {
      const [savedMeta, savedRun, savedRunHistory] = await Promise.all([
        Neo.saveStore.get('meta'),
        Neo.saveStore.get('run'),
        Neo.saveStore.get('runHistory'),
      ]);
      if (savedMeta && typeof savedMeta === 'object') {
        Neo.metaProgress = {
          ...createDefaultMeta(),
          ...savedMeta,
          loopCrystals: Number(savedMeta.loopCrystals ?? savedMeta.loopsCompleted ?? 0),
          unlockedItems: normalizeUnlockedItems(savedMeta.unlockedItems || savedMeta.unlockedRelics),
          unlockedCharacters: normalizeUnlockedCharacters(savedMeta.unlockedCharacters),
          unlockedChallenges: normalizeChallengeSelection(savedMeta.unlockedChallenges),
          selectedDifficulty: normalizeDifficulty(savedMeta.selectedDifficulty),
          selectedChallenges: normalizeChallengeSelection(savedMeta.selectedChallenges),
          selectedCharacter: String(savedMeta.selectedCharacter || createDefaultMeta().selectedCharacter),
          unlockedLegacy: normalizeLegacySelection(savedMeta.unlockedLegacy),
          seenTips: (savedMeta.seenTips && typeof savedMeta.seenTips === 'object') ? { ...savedMeta.seenTips } : {},
        };
      }
      Neo.runHistory = normalizeRunHistory(savedRunHistory || savedMeta?.runHistory);
      syncMetaRecordsFromRunHistory();
      Neo.activeRun = savedRun && typeof savedRun === 'object' ? savedRun : null;
      if (Neo.activeRun) {
        Neo.activeRun.mode = normalizeGameMode(Neo.activeRun.mode);
        Neo.activeRun.difficulty = normalizeDifficulty(Neo.activeRun.difficulty);
        Neo.activeRun.challenges = normalizeChallengeSelection(Neo.activeRun.challenges);
      }
      Neo.selectedDifficulty = normalizeDifficulty(Neo.metaProgress.selectedDifficulty);
      Neo.selectedChallenges = normalizeChallengeSelection(Neo.metaProgress.selectedChallenges);
      {
        const unlocked = new Set(Neo.metaProgress.unlockedCharacters || ['princess', 'thorn_knight', 'metao']);
        if (Neo.metaProgress.godsKilled > 0) unlocked.add('granialla');
        if (Number(Neo.metaProgress.mooggyDefeats || 0) >= 3) unlocked.add('mooggy');
        const preferredCharacter = String(Neo.metaProgress.selectedCharacter || Neo.chosenCharacter);
        Neo.chosenCharacter = unlocked.has(preferredCharacter) ? preferredCharacter : [...unlocked][0] || 'thorn_knight';
        Neo.metaProgress.selectedCharacter = Neo.chosenCharacter;
      }
      if (savedMeta && typeof savedMeta.customDifficultySettings === 'object' && savedMeta.customDifficultySettings) {
        Neo.customDifficultySettings = { ...Neo.customDifficultySettings, ...savedMeta.customDifficultySettings };
      }
      Neo.sandboxSettings = normalizeSandboxSettings(savedMeta?.sandboxSettings);
      Neo.uiController.setSaveState(Neo.saveStore.kind);
      window.dispatchEvent(new Event('neo:meta-loaded'));
    } catch (error) {
      console.error('Failed to load save data', error);
      Neo.uiController.setSaveState('SAVE ERROR');
      Neo.activeRun = null;
    }
  }

  function normalizeUnlockedItems(input) {
    const fallback = [];
    if (!Array.isArray(input)) return fallback;
    const migrated = input.map(value => {
      if (value === 'thorn') return 'neo_knife';
      if (value === 'hemo') return 'orb_of_blood';
      if (value === 'leech') return 'hemes_scarf';
      return value;
    });
    const items = Neo.ITEM_KEYS.filter(name => migrated.includes(name));
    return items.length ? items : fallback;
  }

  function normalizeUnlockedCharacters(input) {
    const fallback = ['princess', 'thorn_knight', 'metao'];
    if (!Array.isArray(input)) return fallback;
    const chars = Object.keys(Neo.CHARACTER_DEFS).filter(name => input.includes(name));
    return [...new Set([...fallback, ...chars])];
  }

  function normalizeDifficulty(input) {
    if (input === 'custom') return 'custom';
    return Neo.DIFFICULTY_DEFS[input] ? input : 'easy';
  }

  function normalizeChallengeSelection(input) {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter(key => Neo.CHALLENGE_DEFS[key]))];
  }

  function isSplitScreen() {
    return (Neo.gameMode === 'coop' || Neo.gameMode === 'pvp') && !!Neo.player2 && Neo.mpPlayerCount >= 2;
  }

  function isMultiplayerMode() {
    return Neo.gameMode === 'coop' || Neo.gameMode === 'pvp';
  }

  function getPlayerSlot(id) {
    return Neo.PLAYER_SLOT_CONFIG[id - 1] || null;
  }

  function getPlayerSlots({ includeInactive = false, includeDead = true } = {}) {
    return Neo.PLAYER_SLOT_CONFIG
      .filter(slot => includeInactive || !!slot.getEntity())
      .filter(slot => includeDead || !slot.getDead());
  }

  function getActivePlayerSlots() {
    if (!isMultiplayerMode()) return Neo.player ? [Neo.PLAYER_SLOT_CONFIG[0]] : [];
    return getPlayerSlots({ includeInactive: false, includeDead: true })
      .filter(slot => slot.id <= Math.max(1, Neo.mpPlayerCount));
  }

  function getLivePlayerSlots() {
    return getActivePlayerSlots().filter(slot => !slot.getDead());
  }

  function getSlotByEntity(entity) {
    return getActivePlayerSlots().find(slot => slot.getEntity() === entity) || null;
  }

  function setSlotDead(slotOrId, dead) {
    const slot = typeof slotOrId === 'number' ? getPlayerSlot(slotOrId) : slotOrId;
    if (!slot) return;
    slot.setDead(dead);
  }

  function resetMultiplayerState() {
    Neo.PLAYER_SLOT_CONFIG.forEach(slot => {
      if (slot.id > 1) slot.setEntity(null);
      slot.setDead(false);
    });
    Neo.pvpState = null;
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = 'none';
    closeMpLobby();
  }

  function invalidateRunStatCaches() {
    Neo.itemStatsCacheFrame = -1;
    Neo.itemStatsCacheValue = null;
    Neo.godItemKeysCache = null;
  }

  function splitPlayerCount() {
    if (Neo.gameState !== 'play') return 0;
    return getActivePlayerSlots().length;
  }

  function openMpLobby(mode) {
    Neo.gameMode = mode;
    if (mode === 'pvp') Neo.mpPlayerCount = 2;
    const titleEl = document.getElementById('mpLobbyTitle');
    const hintEl = document.getElementById('mpLobbyHint');
    const subEl = document.querySelector('#mpLobby .mploby-sub');
    const controlsEl = document.querySelector('#mpLobby .mploby-controls');
    if (titleEl) titleEl.textContent = mode === 'pvp' ? 'PVP' : 'CO-OP';
    if (hintEl) {
      if (mode === 'pvp') hintEl.textContent = 'First to 3 kills wins. P2 keyboard: IJKL move, U melee, O beam, P smash, ; dash.';
      else hintEl.textContent = 'P1: WASD + Mouse / Gamepad 1  ·  P2: IJKL + U/; / Gamepad 2';
    }
    if (subEl) subEl.textContent = mode === 'pvp' ? '2-player arena' : 'How many players?';
    if (controlsEl) {
      controlsEl.textContent = mode === 'pvp'
        ? 'P1: WASD+Mouse/Gamepad1 · P2: IJKL+U/O/P/;/Gamepad2'
        : 'P1: WASD+Mouse/Gamepad1 · P2: IJKL+U/;/Gamepad2 · P3/P4: Gamepad 3/4';
    }
    ['mpLobby1Btn', 'mpLobby3Btn', 'mpLobby4Btn'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.style.display = mode === 'pvp' ? 'none' : '';
    });
    const lobby = document.getElementById('mpLobby');
    if (lobby) lobby.classList.remove('hidden');
  }

  function closeMpLobby() {
    const lobby = document.getElementById('mpLobby');
    if (lobby) lobby.classList.add('hidden');
  }

  function normalizeGameMode(input) {
    const mode = String(input || 'normal').toLowerCase();
    if (mode === 'endless' || mode === 'practice' || mode === 'boss_rush' || mode === 'sandbox' || mode === 'coop' || mode === 'pvp' || mode === 'competitive') return mode;
    return 'normal';
  }

  function getRunModeLabel(mode) {
    if (mode === 'coop') return 'Co-op';
    if (mode === 'pvp') return 'PVP';
    if (mode === 'endless') return 'Endless';
    if (mode === 'practice') return 'Practice';
    if (mode === 'boss_rush') return 'Boss Rush';
    if (mode === 'sandbox') return 'Sandbox';
    if (mode === 'competitive') return 'Competitive';
    return 'Normal';
  }

  function normalizeLegacySelection(input) {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter(key => Neo.LEGACY_UPGRADES[key]))];
  }

  function hasLegacy(key) {
    return (Neo.metaProgress.unlockedLegacy || []).includes(key);
  }

  function normalizeRunHistory(input) {
    if (!Array.isArray(input)) return [];
    return input
      .filter(entry => entry && typeof entry === 'object')
      .slice(0, Neo.RUN_HISTORY_LIMIT)
      .map(entry => {
        const challengeKeys = normalizeRunHistoryChallengeKeys(entry);
        return {
          id: String(entry.id || `${entry.endedAt || 'run'}:${entry.seed || ''}:${entry.floor || 0}`),
          endedAt: String(entry.endedAt || ''),
          result: String(entry.result || '').replace(/^Neo\./, '') === 'win' ? 'win' : 'dead',
          mode: normalizeGameMode(entry.mode),
          character: String(entry.character || 'thorn_knight'),
          characterName: String(entry.characterName || Neo.CHARACTER_DEFS[entry.character]?.name || 'Unknown'),
          difficulty: normalizeDifficulty(entry.difficulty),
          difficultyName: String(entry.difficultyName || getDifficultyDef(entry.difficulty).name),
          floor: Math.max(1, Number(entry.floor || 1)),
          loop: Math.max(0, Number(entry.loop || 0)),
          coins: Math.max(0, Number(entry.coins || 0)),
          level: Math.max(1, Number(entry.level || 1)),
          kills: Math.max(0, Number(entry.kills || 0)),
          maxHp: Math.max(1, Number(entry.maxHp || 120)),
          attackPower: Math.max(0, Number(entry.attackPower || 0)),
          attackSpeed: Math.max(0, Number(entry.attackSpeed || 1)),
          elapsedSeconds: Math.max(0, Number(entry.elapsedSeconds || 0)),
          seed: String(entry.seed || ''),
          roomType: String(entry.roomType || ''),
          killedBy: String(entry.killedBy || ''),
          killerKey: String(entry.killerKey || ''),
          challengeBonusCrystals: Math.max(0, Number(entry.challengeBonusCrystals || 0)),
          totalItemStacks: Math.max(0, Number(entry.totalItemStacks || 0)),
          challengeKeys,
          challenges: challengeKeys.map(key => Neo.CHALLENGE_DEFS[key]?.name || titleCase(key)),
          items: Array.isArray(entry.items) ? entry.items.map(item => ({
            key: String(item.key || ''),
            name: String(item.name || item.key || 'Unknown'),
            count: Math.max(0, Number(item.count || 0)),
            rarity: String(item.rarity || Neo.ITEM_DEFS[item.key]?.rarity || ''),
          })) : [],
          equippedMoves: Array.isArray(entry.equippedMoves) ? entry.equippedMoves.map(move => ({
            slot: String(move.slot || ''),
            key: String(move.key || ''),
            name: String(move.name || move.key || 'Unknown'),
          })) : [],
        };
      });
  }

  function normalizeRunHistoryChallengeKeys(entry) {
    if (!entry || typeof entry !== 'object') return [];
    if (Array.isArray(entry.challengeKeys)) return normalizeChallengeSelection(entry.challengeKeys);
    const byLabel = new Map(Object.entries(Neo.CHALLENGE_DEFS).map(([key, def]) => [
      String(def?.name || titleCase(key)).toLowerCase(),
      key,
    ]));
    const legacy = Array.isArray(entry.challenges) ? entry.challenges : [];
    return normalizeChallengeSelection(legacy.map(value => {
      const text = String(value || '');
      return Neo.CHALLENGE_DEFS[text] ? text : byLabel.get(text.toLowerCase()) || text;
    }));
  }

  function deriveRunRecords(entries, fallback = {}) {
    const records = {
      floor: Math.max(1, Number(fallback.bestFloor || 1)),
      kills: Math.max(0, Number(fallback.bestKills || 0)),
      level: Math.max(1, Number(fallback.bestLevel || 1)),
      time: Math.max(0, Number(fallback.bestTime || 0)),
      coins: Math.max(0, Number(fallback.bestCoins || 0)),
    };
    normalizeRunHistory(entries).forEach(entry => {
      records.floor = Math.max(records.floor, Number(entry.floor || 1));
      records.kills = Math.max(records.kills, Number(entry.kills || 0));
      records.level = Math.max(records.level, Number(entry.level || 1));
      records.time = Math.max(records.time, Number(entry.elapsedSeconds || 0));
      records.coins = Math.max(records.coins, Number(entry.coins || 0));
    });
    return records;
  }

  function syncMetaRecordsFromRunHistory() {
    const records = deriveRunRecords(Neo.runHistory, Neo.metaProgress);
    Neo.metaProgress.bestFloor = records.floor;
    Neo.metaProgress.bestKills = records.kills;
    Neo.metaProgress.bestLevel = records.level;
    Neo.metaProgress.bestTime = records.time;
    Neo.metaProgress.bestCoins = records.coins;
    return records;
  }

  function getOwnedChallengeSet() {
    return new Set(normalizeChallengeSelection(Neo.metaProgress.unlockedChallenges || []));
  }

  function getUnlockedChallengeSet() {
    return new Set(Neo.CHALLENGE_ORDER);
  }

  function isChallengeActive(key) {
    return Neo.selectedChallenges.includes(key);
  }

  function getActiveChallengeCrystalBonusMultiplier() {
    const bonusByKey = {
      no_hit: 0.65,
      no_items: 0.4,
      fragile_body: 0.25,
      swarm_rooms: 0.35,
      elite_hunt: 0.45,
      cursed_shops: 0.3,
      glass_cannon: 0.35,
    };
    const active = normalizeChallengeSelection(Neo.selectedChallenges);
    const sum = active.reduce((total, key) => total + (bonusByKey[key] || 0), 0);
    if (hasLegacy('challenge_mastery') && active.length >= 3) {
      return Math.max(sum, 3);
    }
    return sum;
  }

  function createRandomSeed() {
    return `${Math.floor(Math.random() * 1e9)}`;
  }

  function syncSeedState() {
    Neo.seedStr = Neo.runLoopIndex > 0 ? `${Neo.baseSeedStr}:loop:${Neo.runLoopIndex}` : Neo.baseSeedStr;
  }

  function getFloorSeed() {
    return `${Neo.baseSeedStr}|difficulty:${Neo.selectedDifficulty}|loop:${Neo.runLoopIndex}|floor:${Neo.floor}`;
  }

  function createRngStream(seed, consumed = 0) {
    const hashSeed = typeof Neo.KozSeededRngApi.fnv1a === 'function'
      ? Neo.KozSeededRngApi.fnv1a(String(seed || ''))
      : Neo.xmur3(String(seed || ''))();
    const stream = Neo.KozSeededRngApi.SeededStream
      ? new Neo.KozSeededRngApi.SeededStream(hashSeed)
      : null;
    const random = stream
      ? () => stream.random()
      : Neo.makeRNG(String(seed || ''));
    let count = Math.max(0, Number(consumed) || 0);
    for (let index = 0; index < count; index += 1) random();
    return {
      next() {
        count += 1;
        return random();
      },
      getState() {
        return count;
      },
    };
  }

  function resetRngStreams(savedState = null) {
    const snapshot = savedState && typeof savedState === 'object' ? savedState : {};
    const floorSeed = getFloorSeed();
    Neo.rngStreams = {
      world: createRngStream(`${floorSeed}|world`, snapshot.world),
      loot: createRngStream(`${floorSeed}|loot`, snapshot.loot),
      encounter: createRngStream(`${floorSeed}|encounter`, snapshot.encounter),
      fx: createRngStream(`${floorSeed}|fx`, snapshot.fx),
    };
    Neo.rng = () => Neo.nextRandom('encounter');
  }

  function nextRandom(stream = 'encounter') {
    const selected = Neo.rngStreams[stream] || Neo.rngStreams.encounter || Neo.rngStreams.world;
    return selected ? selected.next() : Math.random();
  }

  function createScopedRandom(scope) {
    const stream = createRngStream(`${getFloorSeed()}|${scope}`);
    return () => stream.next();
  }

  function createRandomFromSeed(seed) {
    const stream = createRngStream(seed);
    return () => stream.next();
  }

  function createRoomRandom(room, scope) {
    const gx = Number.isFinite(room?.gx) ? room.gx : 'x';
    const gy = Number.isFinite(room?.gy) ? room.gy : 'y';
    const type = room?.type || 'room';
    return createScopedRandom(`room:${gx},${gy}|type:${type}|${scope}`);
  }

  function createEntityRandom(entity, scope) {
    const roomPart = Neo.currentRoom
      ? `room:${Neo.currentRoom.gx},${Neo.currentRoom.gy}|type:${Neo.currentRoom.type || 'room'}`
      : 'room:none';
    const entityPart = `${entity?.kind || entity?.type || 'entity'}:${Math.round(Number(entity?.x || 0))},${Math.round(Number(entity?.y || 0))}`;
    return createScopedRandom(`${roomPart}|${entityPart}|${scope}`);
  }

  function getRngState() {
    return {
      world: Neo.rngStreams.world?.getState?.() || 0,
      loot: Neo.rngStreams.loot?.getState?.() || 0,
      encounter: Neo.rngStreams.encounter?.getState?.() || 0,
      fx: Neo.rngStreams.fx?.getState?.() || 0,
    };
  }

  function getDifficultyDef(key = Neo.selectedDifficulty) {
    const norm = normalizeDifficulty(key);
    if (norm === 'custom') {
      return { ...Neo.DIFFICULTY_DEFS.custom, ...Neo.customDifficultySettings, key: 'custom', name: 'Custom' };
    }
    return Neo.DIFFICULTY_DEFS[norm];
  }

  function getDifficultyRuntimeConfig(key = Neo.selectedDifficulty) {
    const difficulty = getDifficultyDef(key);
    const statPressure = Neo.clamp((Number(difficulty?.statMultiplier || 1) - 1) / 0.52, 0, 1);
    const roomPressure = Neo.clamp(Number(difficulty?.roomWeightBonus || 0) / 0.22, 0, 1);
    const economyPressure = Neo.clamp((Number(difficulty?.shopPriceMultiplier || 1) - 1) / 0.42, 0, 1);
    return {
      key: String(difficulty?.key || normalizeDifficulty(key)),
      eventCheckIntervalMultiplier: 1 - roomPressure * 0.18,
      eventChanceMultiplier: 1 + roomPressure * 0.26,
      eventTimerMultiplier: 1 - statPressure * 0.22,
      eventPenaltyMultiplier: 1 + statPressure * 0.38,
      challengeTimerMultiplier: 1 - roomPressure * 0.2,
      potionHealMultiplier: 1 - statPressure * 0.16,
      coinRewardMultiplier: 1 + economyPressure * 0.24,
      xpRewardMultiplier: 1 + statPressure * 0.16,
      bribeCostMultiplier: 1 + economyPressure * 0.22,
      memoryMatchMaxFlips: Math.max(2, 6 - Math.round(statPressure * 2)),
    };
  }

  function getRunDifficultyScalars() {
    const config = getDifficultyRuntimeConfig();
    return {
      challengeTimerMultiplier: Number(config.challengeTimerMultiplier || 1),
      potionHealMultiplier: Number(config.potionHealMultiplier || 1),
      coinRewardMultiplier: Number(config.coinRewardMultiplier || 1),
      xpRewardMultiplier: Number(config.xpRewardMultiplier || 1),
    };
  }

  function scaleChallengeTimer(baseSeconds) {
    const scaledSeconds = Math.round(Number(baseSeconds || 0) * getRunDifficultyScalars().challengeTimerMultiplier);
    return Math.max(6, scaledSeconds);
  }

  function scalePotionHealing(baseAmount, minimumAmount = 1) {
    const scaledAmount = Math.round(Number(baseAmount || 0) * getRunDifficultyScalars().potionHealMultiplier * getPlayerHealingMultiplier());
    return Math.max(Number(minimumAmount || 0), scaledAmount);
  }

  function getPotionHealAmount() {
    return scalePotionHealing(40, 24);
  }

  function getPlayerHealingMultiplier() {
    return Math.max(0.05, Number(Neo.getItemStats?.()?.healingMultiplier || 1));
  }

  function scalePlayerHealing(baseAmount, minimumAmount = 0) {
    const scaledAmount = Number(baseAmount || 0) * getPlayerHealingMultiplier();
    return Math.max(Number(minimumAmount || 0), scaledAmount);
  }

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'DIFFICULTY_CONFIG', {
      configurable: true,
      get() {
        return getDifficultyRuntimeConfig();
      },
    });
  }

  function getShopPriceMultiplier(difficultyKey = Neo.selectedDifficulty) {
    const challengeMultiplier = isChallengeActive('cursed_shops') ? 1.5 : 1;
    return Number(getDifficultyDef(difficultyKey)?.shopPriceMultiplier || 1) * challengeMultiplier;
  }

  function scaleShopPrice(baseCost, difficultyKey = Neo.selectedDifficulty) {
    return Math.max(1, Math.round(baseCost * getShopPriceMultiplier(difficultyKey)));
  }

  function getShopRarityPriceMultiplier(rarity = 'knight') {
    return Neo.SHOP_RARITY_PRICE_MULTIPLIERS[String(rarity || 'knight').toLowerCase()] || 1;
  }

  function getShopPotionCost(floorValue = Neo.floor, difficultyKey = Neo.selectedDifficulty) {
    return scaleShopPrice(18 + floorValue * 2, difficultyKey);
  }

  function getShopItemCost(itemIndex = 0, floorValue = Neo.floor, difficultyKey = Neo.selectedDifficulty, rarity = 'knight') {
    const baseCost = 32 + floorValue * 4 + itemIndex * 6;
    return scaleShopPrice(baseCost * getShopRarityPriceMultiplier(rarity), difficultyKey);
  }

  function getShopMoveCost(moveIndex = 0, floorValue = Neo.floor, difficultyKey = Neo.selectedDifficulty) {
    return scaleShopPrice(34 + floorValue * 6 + moveIndex * 4, difficultyKey);
  }

  function getShopWeaponCost(rarity = 'knight', weaponIndex = 0, floorValue = Neo.floor, difficultyKey = Neo.selectedDifficulty, weaponKey = '') {
    if (rarity === 'god' || rarity === 'red') {
      let baseCost = (180 + floorValue * 14 + weaponIndex * 10) * 3;
      if (String(weaponKey || '').toLowerCase() === 'excalibur') baseCost = Math.round(baseCost * 1.25);
      return scaleShopPrice(baseCost, difficultyKey);
    }
    if (rarity === 'wizard' || rarity === 'purple') return scaleShopPrice(88 + floorValue * 9 + weaponIndex * 8, difficultyKey);
    return scaleShopPrice(52 + floorValue * 5 + weaponIndex * 6, difficultyKey);
  }

  function getShopGodSweepCost(floorValue = Neo.floor, difficultyKey = Neo.selectedDifficulty) {
    return scaleShopPrice(140 + floorValue * 12, difficultyKey);
  }

  function getShopHealCost(kind, floorValue = Neo.floor, difficultyKey = Neo.selectedDifficulty) {
    if (kind === 'major') return scaleShopPrice(34 + floorValue * 4, difficultyKey);
    return scaleShopPrice(16 + floorValue * 2, difficultyKey);
  }

  function getSecretXpOfferCost(floorValue = Neo.floor, difficultyKey = Neo.selectedDifficulty) {
    return scaleShopPrice(30 + floorValue * 8, difficultyKey);
  }

  function getSecretXpOfferAmount(floorValue = Neo.floor) {
    return Math.max(12, Math.round(14 + floorValue * 7));
  }

  function getLaserCastDuration(moveKey = Neo.getEquippedMove('laser')) {
    if (moveKey === 'god_sweep') return 1.45;
    if (moveKey === 'love_beam') return Math.max(0.1, Neo.MOVE_BASE_STATS.love_beam.duration + Neo.getAnvilMoveBonus('love_beam', 'duration'));
    if (moveKey === 'turtle_wave') return Math.max(0.1, Neo.MOVE_BASE_STATS.turtle_wave.duration + Neo.getAnvilMoveBonus('turtle_wave', 'duration'));
    return Neo.godTimer > 0 ? 0.72 : Neo.ATTACKS.laser.duration;
  }

  function getMoveCooldownBase(moveKey) {
    const base = Neo.MOVE_BASE_STATS[moveKey]?.cooldown ?? null;
    if (base === null) return null;
    return Math.max(base * 0.5, base + Neo.getAnvilMoveBonus(moveKey, 'cooldown'));
  }

  function getMeleeCooldownDuration(moveKey = Neo.getEquippedMove('melee'), attackSpeed = Neo.getAttackSpeedValue()) {
    const anvilBase = getMoveCooldownBase(moveKey);
    if (anvilBase !== null) return anvilBase / attackSpeed;
    if (moveKey === 'slash') return 0.4 / attackSpeed;
    return (Neo.godTimer > 0 ? 0.2 : Neo.ATTACKS.melee.baseCooldown) / attackSpeed;
  }

  function getLaserCooldownDuration(moveKey = Neo.getEquippedMove('laser'), attackSpeed = Neo.getAttackSpeedValue()) {
    const anvilBase = getMoveCooldownBase(moveKey);
    const characterMult = Number(Neo.getCharacterDef?.().laserCooldownMultiplier || 1);
    if (anvilBase !== null) return (anvilBase / attackSpeed) * characterMult;
    if (moveKey === 'turtle_wave') return (3 / attackSpeed) * characterMult;
    if (moveKey === 'blade_justice') return (3.8 / attackSpeed) * characterMult;
    if (moveKey === 'lightning_columns') return (4.8 / attackSpeed) * characterMult;
    if (moveKey === 'god_sweep') return (7.2 / attackSpeed) * characterMult;
    if (moveKey === 'nail_shot') return 2.8 / attackSpeed;
    return ((Neo.godTimer > 0 ? 2.8 : Neo.ATTACKS.laser.baseCooldown) / attackSpeed) * characterMult;
  }

  function getDashCooldownDuration(moveKey = Neo.getEquippedMove('dash'), attackSpeed = Neo.getAttackSpeedValue()) {
    const anvilBase = getMoveCooldownBase(moveKey);
    if (anvilBase !== null) return anvilBase / attackSpeed;
    if (moveKey === 'warp') return 2.8 / attackSpeed;
    if (moveKey === 'nimrod_stomp') return 4.2 / attackSpeed;
    if (moveKey === 'zip_lightning') return 2.0 / attackSpeed;
    if (moveKey === 'cowards_way') return 6 / attackSpeed;
    if (moveKey === 'mooggy_zoomies') return 20 / attackSpeed;
    return 3.2 / attackSpeed;
  }

  function getSmashCooldownDuration(attackSpeed = Neo.getAttackSpeedValue()) {
    const smashKey = Neo.getEquippedMove('smash');
    const anvilBase = getMoveCooldownBase(smashKey);
    if (anvilBase !== null) return anvilBase / attackSpeed;
    return (Neo.godTimer > 0 ? 2 : Neo.ATTACKS.smash.baseCooldown) / attackSpeed;
  }

  function getMoveMaxStacks(moveKey, characterKey = Neo.player?.character || Neo.chosenCharacter, playerState = Neo.player) {
    const moveDef = Neo.MOVE_DEFS[moveKey] || {};
    const baseStacks = Math.max(1, Number(moveDef.maxStacks || 1));
    const characterStacks = Math.max(1, Number(moveDef.stackOverrides?.[characterKey] || baseStacks));
    const playerOverrideStacks = Math.max(0, Number(playerState?.moveStackOverrides?.[moveKey] || 0));
    return Math.max(characterStacks, playerOverrideStacks || 0);
  }

  function getSlotCooldownDuration(slot, moveKey, attackSpeed = Neo.getAttackSpeedValue()) {
    if (slot === 'melee') return getMeleeCooldownDuration(moveKey, attackSpeed);
    if (slot === 'laser') return getLaserCooldownDuration(moveKey, attackSpeed);
    if (slot === 'smash') return getSmashCooldownDuration(attackSpeed);
    return getDashCooldownDuration(moveKey, attackSpeed);
  }

  function createCooldownEntry(slot, playerState = Neo.player, source = null) {
    const moveKey = playerState?.equippedMoves?.[slot] || (slot === 'dash' ? 'dash' : slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : 'crimson_smash');
    const maxCharges = getMoveMaxStacks(moveKey, playerState?.character || Neo.chosenCharacter, playerState);
    const sourceIsObject = !!source && typeof source === 'object' && !Array.isArray(source);
    const sourceTimers = sourceIsObject && Array.isArray(source.timers)
      ? source.timers.map(value => Number(value)).filter(value => value > 0)
      : [];
    const sourceHolding = sourceIsObject ? Math.max(0, Math.floor(Number(source.holding || 0))) : 0;
    const wasFull = !sourceIsObject || (
      Number(source.charges ?? source.maxCharges ?? 1) >= Number(source.maxCharges ?? 1)
      && sourceTimers.length === 0
      && sourceHolding === 0
      && Number(source.recharge || 0) <= 0
    );

    let charges = maxCharges;
    let timers = [];
    let holding = 0;

    if (typeof source === 'number') {
      const legacyRecharge = Math.max(0, Number(source || 0));
      if (legacyRecharge > 0) {
        charges = Math.max(0, maxCharges - 1);
        timers = [legacyRecharge];
      }
    } else if (sourceIsObject) {
      charges = Math.max(0, Math.min(maxCharges, Math.floor(Number(source.charges ?? maxCharges))));
      holding = Math.min(sourceHolding, Math.max(0, maxCharges - charges));
      timers = sourceTimers.slice(0, Math.max(0, maxCharges - charges - holding));
      if (timers.length === 0 && Number(source.recharge || 0) > 0 && charges < maxCharges) {
        timers.push(Number(source.recharge));
      }
      if (wasFull) {
        charges = maxCharges;
        timers = [];
        holding = 0;
      }
    }

    return { charges, maxCharges, timers, holding };
  }

  function createCooldownState(playerState = Neo.player, source = null) {
    const state = {};
    Neo.MOVE_SLOTS.forEach(slot => {
      state[slot] = createCooldownEntry(slot, playerState, source?.[slot]);
    });
    return state;
  }

  function spendSkillCharge(slot, rechargeTime, options = {}) {
    const state = Neo.cooldowns[slot] || createCooldownEntry(slot);
    if (state.charges <= 0) return false;
    state.charges -= 1;
    if (options.deferTimer) state.holding += 1;
    else state.timers.push(rechargeTime);
    Neo.cooldowns[slot] = state;
    Neo.updateHud();
    return true;
  }

  function queueHeldSkillRecharge(slot, rechargeTime) {
    const state = Neo.cooldowns[slot] || createCooldownEntry(slot);
    if (state.holding > 0) state.holding -= 1;
    state.timers.push(rechargeTime);
    Neo.cooldowns[slot] = state;
    Neo.updateHud();
  }

  function tickCooldowns(dt) {
    Neo.MOVE_SLOTS.forEach(slot => {
      const state = Neo.cooldowns[slot] || createCooldownEntry(slot);
      if (!state.timers.length) return;
      const nextTimers = [];
      let restoredCharges = 0;
      state.timers.forEach(timer => {
        const nextTimer = timer - dt;
        if (nextTimer <= 0) restoredCharges += 1;
        else nextTimers.push(nextTimer);
      });
      state.timers = nextTimers;
      state.charges = Math.min(state.maxCharges, state.charges + restoredCharges);
      Neo.cooldowns[slot] = state;
    });
  }

  function getSkillCooldownInfo(slot, attackSpeed = Neo.getAttackSpeedValue()) {
    const moveKey = Neo.getEquippedMove(slot);
    const state = Neo.cooldowns[slot] || createCooldownEntry(slot);
    return {
      charges: state.charges,
      maxCharges: state.maxCharges,
      current: state.timers.length ? Math.min(...state.timers) : 0,
      max: getSlotCooldownDuration(slot, moveKey, attackSpeed),
    };
  }

  function refreshRoomShopCosts(room, difficultyKey = Neo.selectedDifficulty, floorValue = Neo.floor) {
    if (!room || room.type !== 'shop') return;
    room.shopOffers = Array.isArray(room.shopOffers) ? room.shopOffers : [];
    let itemIndex = 0;
    room.shopOffers.forEach(offer => {
      if (!offer) return;
      if (offer.type === 'item') {
        const rarity = Neo.itemRegistry.get(offer.key)?.rarity || Neo.ITEM_DEFS[offer.key]?.rarity || 'knight';
        offer.cost = getShopItemCost(itemIndex, floorValue, difficultyKey, rarity);
        itemIndex += 1;
      } else if (offer.type === 'potion') {
        offer.cost = getShopPotionCost(floorValue, difficultyKey);
      }
    });

    if (Array.isArray(room.shopMoveOffers)) {
      room.shopMoveOffers.forEach((offer, index) => {
        if (!offer) return;
        offer.cost = offer.key === 'god_sweep'
          ? getShopGodSweepCost(floorValue, difficultyKey)
          : getShopMoveCost(index, floorValue, difficultyKey);
      });
    }
    if (Array.isArray(room.shopWeaponOffers)) {
      room.shopWeaponOffers.forEach((offer, index) => {
        if (!offer) return;
        const rarity = Neo.WEAPON_DEFS[offer.key]?.rarity || 'knight';
        offer.cost = getShopWeaponCost(rarity, index, floorValue, difficultyKey, offer.key);
      });
    }
  }

  function getEnemyDifficultyTuning() {
    const difficulty = getDifficultyDef();
    return {
      reaction: difficulty.enemyReactionMultiplier || 1,
      rangedCadence: difficulty.rangedCadenceMultiplier || 1,
      supportPower: difficulty.supportPowerMultiplier || 1,
    };
  }

  function getUnlockedDifficultySet() {
    const loopCrystals = Number(Neo.metaProgress.loopCrystals || 0);
    return new Set(Neo.DIFFICULTY_ORDER.filter(key => key === 'custom' || loopCrystals >= Neo.DIFFICULTY_DEFS[key].unlockLoops));
  }

  function titleCase(value) {
    return String(value || '')
      .split(/[_\s]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatElapsedTime(totalSeconds) {
    const seconds = Math.max(0, Math.round(Number(totalSeconds || 0)));
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;
    return `${minutes}:${String(remain).padStart(2, '0')}`;
  }

  function formatRunEndedAt(isoString) {
    const value = new Date(isoString);
    if (Number.isNaN(value.getTime())) return 'Unknown date';
    return value.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function getBossDisplayName(type) {
    if (type === 'queen_cult') return 'Queen of the Cult';
    if (type === 'bulk_golem') return 'Bulk Golem';
    if (type === 'artificer_knave') return 'Artificer Charged Knave';
    if (type === 'bowman_bane') return "Bowman's Bane";
    if (type === 'antony_blemmye') return 'Antony Blemmye';
    if (type === 'handsome_devil') return 'Handsome Devil';
    if (type === 'god') return 'GOD';
    return titleCase(type);
  }

  function getEnemyLabel(type) {
    if (Neo.BOSS_TYPES.has(type)) return getBossDisplayName(type);
    if (type === 'mirror_knight') return 'Mirror Champion';
    return titleCase(type);
  }

  function getEliteEnemyLabel(enemy) {
    const baseLabel = getEnemyLabel(enemy?.type || '');
    if (!enemy?.elite || !Array.isArray(enemy.eliteTypes) || enemy.eliteTypes.length === 0) return baseLabel;
    const prefix = enemy.eliteTypes
      .map(type => Neo.ELITE_TYPE_DEFS[type]?.label || titleCase(type))
      .join('_');
    return `${prefix}_${baseLabel}`;
  }

  function getRoomLabel(type) {
    if (!type) return 'Unknown';
    if (type === 'god') return 'God Chamber';
    return titleCase(type);
  }

  function getDamageSourceLabel(source) {
    const value = String(source || '').trim();
    if (!value) return 'Unknown';
    if (value === 'no_hit') return 'Never Get Hit';
    if (value === 'lava') return 'Lava';
    if (value === 'challenge_bomb') return 'Trial Bomb';
    if (value === 'storm') return 'Storm Trial';
    if (value === 'enemy_projectile') return 'Enemy Projectile';
    if (value.endsWith('_projectile')) {
      const owner = value.slice(0, -'_projectile'.length);
      const ownerLabel = getDamageSourceLabel(owner);
      return `${ownerLabel === 'Unknown' ? 'Enemy' : ownerLabel} Projectile`;
    }
    if (value === 'enemy_beam') return 'Enemy Beam';
    if (value === 'god_beam') return 'GOD Beam';
    if (value === 'mirror_beam') return 'Mirror Beam';
    if (Neo.BOSS_TYPES.has(value) || value === 'mirror_knight') return getEnemyLabel(value);
    if (value.startsWith('mirror_')) return getEnemyLabel('mirror_knight');
    if (Neo.SPRITE_DEFS[value] || ['cult_mage', 'knave', 'sniper', 'machine_gunner', 'golem', 'summoner', 'shield_unit', 'healer', 'boss_spawner', 'laser', 'charger', 'hunter', 'mooggy'].includes(value)) {
      return getEnemyLabel(value);
    }
    return titleCase(value);
  }

  function normalizeDeathQuoteKey(source) {
    const value = String(source || '').trim().toLowerCase();
    if (!value) return 'unknown';
    return value
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function getKillerDeathQuote(sourceKey) {
    const exact = normalizeDeathQuoteKey(sourceKey);
    const ownerKey = exact.endsWith('_projectile') ? exact.slice(0, -'_projectile'.length) : exact;
    const pool = Neo.KILLER_DEATH_QUOTES[exact] || Neo.KILLER_DEATH_QUOTES[ownerKey] || Neo.DEFAULT_KILLER_DEATH_QUOTES;
    if (!Array.isArray(pool) || pool.length === 0) return '';
    const index = Math.floor(Neo.nextRandom('fx') * pool.length);
    return pool[index] || pool[0] || '';
  }

  function findKillerEnemyEntity(sourceKey, sourceLabel) {
    const rawKey = String(sourceKey || '').trim().toLowerCase();
    const key = rawKey.endsWith('_projectile') ? rawKey.slice(0, -'_projectile'.length) : rawKey;
    const label = String(sourceLabel || '').trim().toLowerCase();
    if (!Array.isArray(Neo.enemies) || Neo.enemies.length === 0) return null;

    const byType = Neo.enemies.find(enemy => String(enemy?.type || '').toLowerCase() === key);
    if (byType) return byType;

    const byRivalName = Neo.enemies.find(enemy => enemy?.type === 'rival' && String(enemy?.rivalData?.name || '').trim().toLowerCase() === key);
    if (byRivalName) return byRivalName;

    const byLabel = Neo.enemies.find(enemy => String(getDamageSourceLabel(enemy?.type || '') || '').trim().toLowerCase() === label);
    if (byLabel) return byLabel;
    return null;
  }

  function speakKillerDeathQuote(sourceKeyInput = '', sourceLabelInput = '') {
    const sourceKey = sourceKeyInput || Neo.lastDamageSourceKey || '';
    const sourceLabel = sourceLabelInput || Neo.lastDamageSource || getDamageSourceLabel(sourceKey) || 'DUNGEON';
    const quote = getKillerDeathQuote(sourceKey || sourceLabel);
    if (!quote || !Neo.player) return;

    const killer = findKillerEnemyEntity(sourceKey, sourceLabel);
    if (killer) {
      Neo.sayOverEntity(killer, quote, {
        speaker: sourceLabel,
        tone: 'boss',
        holdTime: 2.1,
        offsetY: (killer.r || 16) + 32,
      });
      return;
    }

    Neo.sayAtPosition(Neo.player.x, Neo.player.y, quote, {
      speaker: sourceLabel,
      tone: 'warning',
      holdTime: 2.1,
      offsetY: 56,
    });
  }

  function captureRunItemSnapshot(playerState = Neo.player) {
    return Neo.ITEM_KEYS
      .map(key => ({
        key,
        count: Math.max(0, Number(playerState?.items?.[key] || 0)),
      }))
      .filter(item => item.count > 0)
      .map(item => ({
        ...item,
        name: Neo.itemRegistry.get(item.key)?.name || titleCase(item.key),
        rarity: Neo.itemRegistry.get(item.key)?.rarity || Neo.ITEM_DEFS[item.key]?.rarity || '',
      }));
  }

  function getItemRarityCounts(playerState = Neo.player) {
    const counts = { white: 0, purple: 0, red: 0 };
    Neo.ITEM_KEYS.forEach(key => {
      const count = Math.max(0, Number(playerState?.items?.[key] || 0));
      if (count <= 0) return;
      const rarity = String(Neo.itemRegistry.get(key)?.rarity || Neo.ITEM_DEFS[key]?.rarity || 'knight').toLowerCase();
      if (rarity === 'god' || rarity === 'red') counts.red += count;
      else if (rarity === 'wizard' || rarity === 'purple') counts.purple += count;
      else counts.white += count;
    });
    return counts;
  }

  function captureRunMoveSnapshot(playerState = Neo.player) {
    return Neo.MOVE_SLOTS.map(slot => {
      const key = playerState?.equippedMoves?.[slot] || '';
      return {
        slot,
        key,
        name: Neo.MOVE_DEFS[key]?.name || titleCase(key),
      };
    }).filter(move => move.key);
  }

  function buildRunHistoryEntry(result, extra = {}) {
    const character = Neo.getCharacterDef();
    const difficulty = normalizeDifficulty(Neo.selectedDifficulty);
    const historyItems = captureRunItemSnapshot(Neo.player);
    const totalItemStacks = historyItems.reduce((sum, item) => sum + item.count, 0);
    return {
      id: `${Date.now()}:${Neo.baseSeedStr}:${Neo.runLoopIndex}:${Neo.floor}:${result}`,
      endedAt: new Date().toISOString(),
      result,
      mode: normalizeGameMode(Neo.gameMode),
      character: character.key,
      characterName: character.name,
      difficulty,
      difficultyName: getDifficultyDef(difficulty).name,
      floor: Neo.floor,
      loop: Neo.runLoopIndex,
      coins: Math.max(0, Number(Neo.player?.coins || 0)),
      level: Math.max(1, Number(Neo.player?.level || 1)),
      kills: Math.max(0, Number(Neo.player?.kills || 0)),
      maxHp: Math.max(1, Number(Neo.player?.maxHp || 120)),
      attackPower: Math.max(0, Number(Neo.player?.attackPower || 0)),
      attackSpeed: Math.max(0, Number(Neo.player?.attackSpeed || 1)),
      elapsedSeconds: Math.max(0, Number(Neo.gameElapsedTime || 0)),
      seed: Neo.baseSeedStr,
      roomType: Neo.currentRoom?.type || '',
      killedBy: getDamageSourceLabel(extra.killedBy || ''),
      killerKey: String(extra.killerKey || ''),
      challengeBonusCrystals: Math.max(0, Number(extra.challengeBonusCrystals || 0)),
      challengeKeys: normalizeChallengeSelection(Neo.selectedChallenges),
      challenges: normalizeChallengeSelection(Neo.selectedChallenges).map(key => Neo.CHALLENGE_DEFS[key]?.name || titleCase(key)),
      items: historyItems,
      equippedMoves: captureRunMoveSnapshot(Neo.player),
      totalItemStacks,
    };
  }

  function pushRunHistoryEntry(entry) {
    Neo.runHistory = [entry, ...normalizeRunHistory(Neo.runHistory)]
      .slice(0, Neo.RUN_HISTORY_LIMIT);
  }

  function renderRunHistoryListEntry(entry, selected = false) {
    const cause = entry.result === 'win' ? 'Cleared' : (entry.killedBy || 'Unknown');
    const modeLabel = getRunModeLabel(entry.mode);
    const killerLookup = entry.killerKey || entry.killedBy || '';
    const killerCanvas = entry.result !== 'win' && killerLookup
      ? `<canvas class="rh-row-killer" data-run-killer="${escapeHtml(killerLookup)}" width="28" height="28" aria-hidden="true" title="${escapeHtml(entry.killedBy || '')}"></canvas>`
      : '';
    return `<button class="rh-row${selected ? ' active' : ''}" data-run-id="${escapeHtml(entry.id)}" data-result="${entry.result}" type="button">
      <canvas class="rh-row-portrait" data-run-character="${escapeHtml(entry.character)}" width="40" height="40" aria-hidden="true"></canvas>
      <span class="rh-row-body">
        <span class="rh-row-top">
          <span class="rh-row-name">${escapeHtml(entry.characterName)}</span>
          <span class="rh-row-badge">${entry.result === 'win' ? 'WIN' : 'DEAD'}</span>
        </span>
        <span class="rh-row-sub">${escapeHtml(modeLabel)} · Fl.${entry.floor} · ${escapeHtml(cause)} · ${escapeHtml(formatRunEndedAt(entry.endedAt))}</span>
      </span>
      ${killerCanvas}
    </button>`;
  }

  function renderRunHistoryHero(entry) {
    const win = entry.result === 'win';
    const killerLookup = entry.killerKey || entry.killedBy || '';
    const killerSection = !win && killerLookup
      ? `<div class="rh-hero-killer">
           <canvas class="rh-hero-killer-portrait" data-run-killer="${escapeHtml(killerLookup)}" width="48" height="48" aria-hidden="true"></canvas>
           <div class="rh-hero-killer-info">
             <span class="rh-hero-killer-label">KILLED BY</span>
             <span class="rh-hero-killer-name">${escapeHtml(entry.killedBy || 'Unknown')}</span>
           </div>
         </div>`
      : '';
    return `<div class="rh-hero" data-result="${entry.result}">
      <canvas class="rh-hero-portrait" data-run-character="${escapeHtml(entry.character)}" width="64" height="64" aria-hidden="true"></canvas>
      <div class="rh-hero-info">
        <span class="rh-outcome">${win ? 'VICTORY' : 'DEFEAT'}</span>
        <strong class="rh-hero-name">${escapeHtml(entry.characterName)}</strong>
        <span class="rh-hero-meta">${escapeHtml(entry.difficultyName)} · ${escapeHtml(getRunModeLabel(entry.mode))} · Floor ${entry.floor} · Loop ${entry.loop}</span>
        <span class="rh-hero-date">${escapeHtml(formatRunEndedAt(entry.endedAt))}</span>
      </div>
      <div class="rh-hero-right">
        ${killerSection}
        <button class="rh-rerun-btn" data-rerun-id="${escapeHtml(entry.id)}" type="button" title="Start a new run with the same seed, character, and difficulty">&#9654; RERUN</button>
      </div>
    </div>`;
  }

  function renderRunHistoryTabContent(entry, tab = 'stats') {
    if (tab === 'items') {
      if (!entry.items.length) return '<p class="rh-empty-inner">No relics collected.</p>';
      return `<div class="rh-items-grid">${entry.items.map(i => `<div class="rh-item-tile"><canvas class="rh-item-icon" data-item-icon="${escapeHtml(i.key)}" width="32" height="32" aria-hidden="true"></canvas><span class="rh-item-name" style="color:${Neo.getRarityNameColor(i.rarity)}">${escapeHtml(i.name)}</span>${i.count > 1 ? `<span class="rh-item-count">×${i.count}</span>` : ''}</div>`).join('')}</div>`;
    }
    if (tab === 'moves') {
      if (!entry.equippedMoves.length) return '<p class="rh-empty-inner">No move data recorded.</p>';
      return `<div class="rh-moves-grid">${entry.equippedMoves.map(m => `<div class="rh-move-slot" data-slot="${escapeHtml(m.slot)}"><canvas class="rh-move-icon" data-move-icon="${escapeHtml(m.key)}" width="36" height="36" aria-hidden="true"></canvas><div class="rh-move-text"><span class="rh-move-label">${escapeHtml(m.slot.toUpperCase())}</span><span class="rh-move-name">${escapeHtml(m.name)}</span></div></div>`).join('')}</div>`;
    }
    const killerBannerKey = entry.killerKey || entry.killedBy || '';
    const killerBanner = entry.result !== 'win' && entry.killedBy
      ? `<div class="rh-killer-banner">
           ${killerBannerKey ? `<canvas class="rh-killer-banner-portrait" data-run-killer="${escapeHtml(killerBannerKey)}" width="48" height="48" aria-hidden="true"></canvas>` : ''}
           <div class="rh-killer-banner-text">
             <span class="rh-killer-banner-label">KILLED BY</span>
             <span class="rh-killer-banner-name">${escapeHtml(entry.killedBy)}</span>
           </div>
         </div>`
      : '';
    return `${killerBanner}<div class="rh-stats-grid">
      <div class="rh-stat"><span class="rh-stat-label">Floor</span><b class="rh-stat-val">${entry.floor}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Loop</span><b class="rh-stat-val">${entry.loop}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Time</span><b class="rh-stat-val">${escapeHtml(formatElapsedTime(entry.elapsedSeconds))}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Kills</span><b class="rh-stat-val">${entry.kills}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Coins</span><b class="rh-stat-val">${entry.coins}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Level</span><b class="rh-stat-val">${entry.level}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Max HP</span><b class="rh-stat-val">${entry.maxHp}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Atk Power</span><b class="rh-stat-val">${entry.attackPower}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Atk Speed</span><b class="rh-stat-val">${entry.attackSpeed.toFixed(2)}x</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Item Stacks</span><b class="rh-stat-val">${entry.totalItemStacks || 0}</b></div>
      <div class="rh-stat rh-stat--seed"><span class="rh-stat-label">Seed</span><b class="rh-stat-val rh-stat-val--seed">${escapeHtml(entry.seed || '—')}</b></div>
    </div>`;
  }

  const killerSpriteMap = {
    lava: 'golem',
    storm: 'cult_mage',
    challenge_bomb: 'knave',
    enemy_projectile: 'sniper',
    enemy_beam: 'laser',
    god_beam: 'god',
    mirror_beam: 'thorn_knight',
    elite_blade_justice: 'knave',
    no_hit: 'hunter',
    // label string fallbacks for old history entries without killerKey
    'Lava': 'golem',
    'Storm Trial': 'cult_mage',
    'Trial Bomb': 'knave',
    'Enemy Projectile': 'sniper',
    'Enemy Beam': 'laser',
    'GOD Beam': 'god',
    'Mirror Beam': 'thorn_knight',
    'Never Get Hit': 'hunter',
    'Queen of the Cult': 'queen_cult',
    'Bulk Golem': 'bulk_golem',
    'Artificer Charged Knave': 'artificer_knave',
    'Antony Blemmye': 'antony_blemmye',
    'Handsome Devil': 'handsome_devil',
    'GOD': 'god',
    'Mirror Champion': 'thorn_knight',
    'Hunter': 'hunter',
    'Charger': 'charger',
    'Laser': 'laser',
    'Sniper': 'sniper',
    'Machine Gunner': 'sniper',
    'Golem': 'golem',
    'Knave': 'knave',
    'Cult Mage': 'cult_mage',
  };

  function resolveKillerSprite(key) {
    if (!key) return 'hunter';
    if (String(key).endsWith('_projectile')) return resolveKillerSprite(String(key).slice(0, -'_projectile'.length));
    if (Neo.SPRITE_DEFS[key]) return key;
    if (killerSpriteMap[key]) return killerSpriteMap[key];
    const normalized = String(key).trim().toLowerCase();
    if (normalized.startsWith('mirror_') || normalized.startsWith('mirror ')) return 'thorn_knight';
    return 'hunter';
  }

  function hydrateRunHistorySprites(root = Neo.ui.runHistoryList) {
    if (!(root instanceof Element)) return;
    root.querySelectorAll('[data-run-character]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      Neo.drawSpriteToCanvas(el, el.dataset.runCharacter || 'thorn_knight', 56);
    });
    root.querySelectorAll('[data-run-killer]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      Neo.drawSpriteToCanvas(el, resolveKillerSprite(el.dataset.runKiller), el.width);
    });
    root.querySelectorAll('[data-item-icon]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      const item = Neo.itemRegistry.get(el.dataset.itemIcon) || Neo.ITEM_DEFS[el.dataset.itemIcon];
      if (item) Neo.drawItemToastIcon(el, item);
    });
    root.querySelectorAll('[data-move-icon]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      const move = Neo.MOVE_DEFS[el.dataset.moveIcon];
      if (move) Neo.drawMoveToastIcon(el, move);
    });
  }

  function refreshMenuState() {
    Neo.uiController.setMenuMeta(Neo.metaProgress.coins, Neo.metaProgress.bestFloor, Neo.metaProgress.loopCrystals || 0, Neo.saveStore.kind);
    updateCharacterSelectionUI();
    const summary = Neo.activeRun && Neo.activeRun.player && Neo.activeRun.floor
      ? `Floor ${Neo.activeRun.floor} | ${getDifficultyDef(Neo.activeRun.difficulty).name}${Neo.activeRun.challenges?.length ? ` | ${Neo.activeRun.challenges.length} challenge${Neo.activeRun.challenges.length === 1 ? '' : 's'}` : ''} | ${Neo.activeRun.player.coins || 0} run coins`
      : '';
    Neo.uiController.setRunSummary(summary);
    Neo.uiController.setRunHistory(Neo.runHistory || []);
  }

  const PHASE_LABELS = { p1: 'PLAYER 1', p2: 'PLAYER 2', p3: 'PLAYER 3', p4: 'PLAYER 4' };
  const PHASE_COLORS = { p1: 'p1', p2: 'p2', p3: 'p3', p4: 'p4' };
  const PHASE_CHAR = { p1: () => Neo.chosenCharacter, p2: () => Neo.chosenCharacter2, p3: () => Neo.chosenCharacter3, p4: () => Neo.chosenCharacter4 };
  const COMPETITIVE_SERVER_URL = Neo.COMPETITIVE_SERVER_URL || window.NEO_SERVER_URL || 'https://neonyke.davidkozdra.workers.dev/api';
  const COMPETITIVE_FETCH_TIMEOUT_MS = 5000;

  function competitiveAbortSignal(timeoutMs = COMPETITIVE_FETCH_TIMEOUT_MS) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(timeoutMs);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
  }

  async function fetchCompetitiveJson(path, options = {}) {
    const { timeoutMs, ...fetchOptions } = options;
    const res = await fetch(`${COMPETITIVE_SERVER_URL}${path}`, {
      ...fetchOptions,
      signal: options.signal || competitiveAbortSignal(timeoutMs),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const message = data?.error || `Competitive server returned ${res.status}`;
      throw new Error(message);
    }
    return data || {};
  }

  function setCompetitiveServerStatus(state, detail = {}) {
    Neo._competitiveServerState = {
      state,
      seed: detail.seed || Neo._competitiveSeed || '',
      message: detail.message || '',
      checkedAt: Date.now(),
    };
    Neo.uiController?.setCompetitiveServerStatus?.(Neo._competitiveServerState);
  }

  async function refreshCompetitiveSeed({ force = false } = {}) {
    if (Neo._competitiveSeed && !force) {
      setCompetitiveServerStatus('online', { seed: Neo._competitiveSeed });
      return Neo._competitiveSeed;
    }
    if (Neo._competitiveSeedPromise && !force) return Neo._competitiveSeedPromise;

    Neo._competitiveSeedFetching = true;
    setCompetitiveServerStatus('checking', { message: 'Checking competitive server...' });
    const promise = fetchCompetitiveJson('/seed')
      .then(data => {
        if (!data.seed) throw new Error('Competitive server did not return a seed');
        Neo._competitiveSeed = String(data.seed);
        setCompetitiveServerStatus('online', { seed: Neo._competitiveSeed });
        return Neo._competitiveSeed;
      })
      .catch(error => {
        Neo._competitiveSeed = null;
        setCompetitiveServerStatus('offline', { message: error?.message || 'Competitive server is unreachable' });
        throw error;
      })
      .finally(() => {
        Neo._competitiveSeedFetching = false;
        if (Neo._competitiveSeedPromise === promise) Neo._competitiveSeedPromise = null;
      });
    Neo._competitiveSeedPromise = promise;
    return promise;
  }

  function updateCharacterSelectionUI() {
    const phaseTag = document.getElementById('charSelectPhaseTag');
    const titleEl = document.getElementById('charSelectTitle');
    const subtitleEl = document.getElementById('charSelectSubtitle');
    const goBtn = document.getElementById('go');
    const phases = ['p1','p2','p3','p4'].slice(0, Neo.mpPlayerCount);
    const phaseIdx = phases.indexOf(Neo.charSelectPhase);
    const isLastPhase = phaseIdx === phases.length - 1;
    if (Neo.charSelectPhase && PHASE_LABELS[Neo.charSelectPhase]) {
      const label = PHASE_LABELS[Neo.charSelectPhase];
      if (phaseTag) { phaseTag.textContent = label; phaseTag.className = `charselect-phase-tag ${PHASE_COLORS[Neo.charSelectPhase]}`; phaseTag.classList.remove('hidden'); }
      if (titleEl) titleEl.textContent = `${label}: PICK HERO`;
      if (subtitleEl) subtitleEl.textContent = isLastPhase ? 'Confirm, then enter the dungeon.' : 'Confirm to pass to the next player.';
      if (goBtn) goBtn.textContent = isLastPhase ? 'ENTER DUNGEON' : `CONFIRM ${label}`;
    } else {
      if (phaseTag) phaseTag.classList.add('hidden');
      if (titleEl) titleEl.textContent = 'PICK HERO';
      if (Neo.gameMode === 'competitive') {
        if (subtitleEl) subtitleEl.textContent = 'Weekly run. Hard difficulty is locked.';
        if (goBtn) goBtn.textContent = 'COMPETE';
      } else {
        if (subtitleEl) subtitleEl.textContent = 'Choose a hero. Pick difficulty. Enter the dungeon.';
        if (goBtn) goBtn.textContent = 'ENTER DUNGEON';
      }
    }

    const isCompetitive = Neo.gameMode === 'competitive';
    const difficultySelect = document.getElementById('difficultySelect');
    const difficultyHint = document.getElementById('difficultyHint');
    const seedLabel = document.getElementById('seedLabel');
    const seedInput = document.getElementById('seed');
    const challengeToggleEl = document.getElementById('challengeToggle');
    const legacyToggleEl = document.getElementById('legacyToggle');
    if (difficultySelect) difficultySelect.style.pointerEvents = isCompetitive ? 'none' : '';
    if (difficultySelect) difficultySelect.style.opacity = isCompetitive ? '0.35' : '';
    if (difficultyHint) difficultyHint.textContent = isCompetitive ? 'Locked to Hard in Competitive.' : '';
    if (seedLabel) seedLabel.style.display = isCompetitive ? 'none' : '';
    if (seedInput) seedInput.style.display = isCompetitive ? 'none' : '';
    if (challengeToggleEl) challengeToggleEl.style.display = isCompetitive ? 'none' : '';
    if (legacyToggleEl) legacyToggleEl.style.display = isCompetitive ? 'none' : '';

    if (isCompetitive) {
      Neo.selectedDifficulty = 'hard';
      if (Neo.ui.seed) Neo.ui.seed.value = '';
      const competBtn = document.getElementById('altModeCompetitiveBtn');
      if (Neo._competitiveSeed) {
        if (subtitleEl) subtitleEl.textContent = `Hard · Seed ${Neo._competitiveSeed} · no modifiers`;
        setCompetitiveServerStatus('online', { seed: Neo._competitiveSeed });
        if (competBtn) competBtn.disabled = false;
      } else if (!Neo._competitiveSeedFetching) {
        if (subtitleEl) subtitleEl.textContent = 'Checking competitive server...';
        if (competBtn) competBtn.disabled = true;
        refreshCompetitiveSeed()
          .then(seed => {
            const el = document.getElementById('charSelectSubtitle');
            if (el) el.textContent = `Hard · Seed ${seed} · no modifiers`;
            if (competBtn) competBtn.disabled = false;
          })
          .catch(() => {
            const el = document.getElementById('charSelectSubtitle');
            if (el) el.textContent = 'Server connection required for Competitive.';
            if (competBtn) competBtn.disabled = true;
          });
      } else {
        if (subtitleEl) subtitleEl.textContent = 'Checking competitive server...';
        if (competBtn) competBtn.disabled = true;
      }
    } else {
      Neo._competitiveSeed = null;
      Neo._competitiveSeedFetching = false;
      const competBtn = document.getElementById('altModeCompetitiveBtn');
      if (competBtn) competBtn.disabled = false;
    }

    const activeChar = Neo.charSelectPhase && PHASE_CHAR[Neo.charSelectPhase] ? PHASE_CHAR[Neo.charSelectPhase]() : Neo.chosenCharacter;
    const unlocked = new Set(Neo.metaProgress.unlockedCharacters || ['princess', 'thorn_knight', 'metao']);
    const unlockedDifficulties = getUnlockedDifficultySet();
    const unlockedChallenges = getUnlockedChallengeSet();
    const ownedChallenges = getOwnedChallengeSet();
    if (Neo.metaProgress.godsKilled > 0) unlocked.add('granialla');
    if (Number(Neo.metaProgress.mooggyDefeats || 0) >= 3) unlocked.add('mooggy');
    const preferredCharacter = String(Neo.metaProgress.selectedCharacter || Neo.chosenCharacter);
    if (!Neo.charSelectPhase || Neo.charSelectPhase === 'p1') {
      if (unlocked.has(preferredCharacter)) {
        Neo.chosenCharacter = preferredCharacter;
      }
      if (unlocked.has(Neo.chosenCharacter)) {
        Neo.metaProgress.selectedCharacter = Neo.chosenCharacter;
      }
    }
    if (!isCompetitive) {
      if (!unlockedDifficulties.has(Neo.selectedDifficulty)) Neo.selectedDifficulty = 'easy';
      if (Neo.selectedDifficulty === 'custom') Neo.selectedDifficulty = 'easy';
      Neo.metaProgress.selectedDifficulty = Neo.selectedDifficulty;
      Neo.selectedChallenges = normalizeChallengeSelection(Neo.selectedChallenges).filter(key => unlockedChallenges.has(key) && ownedChallenges.has(key));
      Neo.metaProgress.selectedChallenges = normalizeChallengeSelection(Neo.selectedChallenges);
    }
    const ownedLegacy = new Set(Neo.metaProgress.unlockedLegacy || []);
    const competitiveUnlocked = isCompetitive ? new Set([...unlocked].filter(k => k !== 'princess')) : unlocked;
    if (isCompetitive && competitiveUnlocked.size > 0 && !competitiveUnlocked.has(Neo.chosenCharacter)) {
      Neo.chosenCharacter = [...competitiveUnlocked][0];
      Neo.metaProgress.selectedCharacter = Neo.chosenCharacter;
    }
    Neo.uiController.updateCharacterSelection(isCompetitive ? competitiveUnlocked : unlocked, activeChar);
    Neo.uiController.updateDifficultySelection(unlockedDifficulties, isCompetitive ? 'hard' : Neo.selectedDifficulty, Neo.metaProgress.loopCrystals || 0);
    Neo.uiController.updateChallengeSelection(unlockedChallenges, ownedChallenges, isCompetitive ? [] : Neo.selectedChallenges, Neo.metaProgress.loopCrystals || 0, Neo.metaProgress.coins || 0);
    Neo.uiController.updateLegacySelection(ownedLegacy, Neo.metaProgress.loopCrystals || 0);
    Neo.syncCharacterUiTheme();
  }

  function setGameState(nextState) {
    if (Neo.gameStateManager) Neo.gameStateManager.setState(nextState);
    else {
      Neo.gameState = nextState;
      Neo.uiController.setState(nextState);
    }
    const isBossRush = Neo.gameMode === 'boss_rush';
    if (Neo.ui.timerFloorSlot) Neo.ui.timerFloorSlot.style.display = isBossRush ? 'none' : '';
    if (Neo.ui.timerBossSlot) Neo.ui.timerBossSlot.style.display = isBossRush ? '' : 'none';
    if (nextState !== 'pause') {
      Neo.inventoryPauseActive = false;
      document.body.classList.remove('game-paused');
    }
    if (nextState !== 'play' && Neo.ui.interactPrompt) Neo.ui.interactPrompt.classList.add('hidden');
    if (nextState !== 'play') {
      Neo.setShopPanelOpen(false);
      if (!Neo.inventoryPauseActive) Neo.setInventoryPanelOpen(false);
    }
  }

  async function startGame(resume) {
    if (Neo.gameMode === 'endless') { startEndless(); return; }
    if (Neo.gameMode === 'practice') { startPractice(); return; }
    if (Neo.gameMode === 'boss_rush') { startBossRush(); return; }
    if (Neo.gameMode === 'coop') { startCoop(); return; }
    if (Neo.gameMode === 'pvp') { startPvp(); return; }
    if (Neo.gameMode === 'competitive') { void startCompetitive(); return; }
    const forceTutorialReplay = !resume && consumeReplayTutorialRequest();
    const shouldRunTutorial = Neo.gameMode === 'normal' && (!Neo.metaProgress.tutorialCompleted || forceTutorialReplay);
    // Stamp "last played" so the green tutorial button only re-offers after a long absence.
    if (Neo.metaProgress) { Neo.metaProgress.lastSeenAt = Date.now(); Neo.persistMetaSoon(); }
    setGameState('play');

    if (resume && Neo.activeRun) {
      restoreRun(Neo.activeRun);
      resetTutorialState(shouldRunTutorial);
    } else {
      Neo.baseSeedStr = Neo.ui.seed.value.trim() || createRandomSeed();
      Neo.selectedDifficulty = normalizeDifficulty(Neo.selectedDifficulty);
      Neo.selectedChallenges = normalizeChallengeSelection(Neo.metaProgress.selectedChallenges);
      Neo.runLoopIndex = 0;
      Neo.runRevivesUsed = 0;
      Neo.lastDeathEntryId = '';
      syncSeedState();
      Neo.floor = 1;
      Neo.gameElapsedTime = 0;
      window.achievementManager?.resetRunCounters();
      invalidateRunStatCaches();
      Neo.player = createDefaultPlayer();
      if (!isMultiplayerMode()) resetMultiplayerState();
      if (Neo.gameMode === 'sandbox') {
        Neo.player.coins = Number(Neo.sandboxSettings.startingCoins || 0);
        Neo.selectedChallenges = [];
        const startItems = Neo.sandboxSettings.startingItems && typeof Neo.sandboxSettings.startingItems === 'object'
          ? Neo.sandboxSettings.startingItems
          : {};
        if (Neo.player.items) {
          for (const key of Neo.ITEM_KEYS) {
            const count = Math.round(Number(startItems[key]) || 0);
            if (count > 0) Neo.player.items[key] = (Number(Neo.player.items[key]) || 0) + count;
          }
        }
        applySandboxPlayerSetup(Neo.player);
      }
      applyRunChallengeStartModifiers();
      Neo.lastDamageSource = '';
      Neo.lastDamageSourceKey = '';
      resetScene();
      Neo.generateFloor();
      resetTutorialState(shouldRunTutorial);
      Neo.persistMetaSoon();
      Neo.scheduleRunSave();
    }

    if (!Neo.loopStarted) {
      Neo.loopStarted = true;
      requestAnimationFrame(Neo.loop);
    }
  }

  function spawnMpPlayer(charKey, offsetX, offsetY) {
    const savedChosen = Neo.chosenCharacter;
    Neo.chosenCharacter = charKey;
    const p = createDefaultPlayer();
    Neo.chosenCharacter = savedChosen;
    p.x = Neo.START_X + offsetX;
    p.y = Neo.START_Y + offsetY;
    p.items = JSON.parse(JSON.stringify(Neo.player.items));
    return p;
  }

  function startCoop() {
    setGameState('play');
    Neo.baseSeedStr = Neo.ui.seed.value.trim() || createRandomSeed();
    Neo.selectedDifficulty = normalizeDifficulty(Neo.selectedDifficulty);
    Neo.selectedChallenges = [];
    Neo.runLoopIndex = 0;
    Neo.runRevivesUsed = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 1;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    invalidateRunStatCaches();
    Neo.player = createDefaultPlayer();
    Neo.player2 = Neo.mpPlayerCount >= 2 ? spawnMpPlayer(Neo.chosenCharacter2, 36, 0) : null;
    Neo.player3 = Neo.mpPlayerCount >= 3 ? spawnMpPlayer(Neo.chosenCharacter3, 0, 36) : null;
    Neo.player4 = Neo.mpPlayerCount >= 4 ? spawnMpPlayer(Neo.chosenCharacter4, 36, 36) : null;
    Neo.p1DeadInCoop = false; Neo.p2DeadInCoop = false; Neo.p3DeadInCoop = false; Neo.p4DeadInCoop = false;
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    resetScene();
    Neo.generateFloor();
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = Neo.player2 ? '' : 'none';
    if (!Neo.loopStarted) { Neo.loopStarted = true; requestAnimationFrame(Neo.loop); }
  }

  // Neo.pvpState is declared in neo.js; this file manages it via Neo.pvpState

  function startPvp() {
    setGameState('play');
    Neo.mpPlayerCount = 2;
    Neo.baseSeedStr = Neo.ui.seed.value.trim() || createRandomSeed();
    Neo.selectedDifficulty = normalizeDifficulty(Neo.selectedDifficulty);
    Neo.selectedChallenges = [];
    Neo.runLoopIndex = 0;
    Neo.runRevivesUsed = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 1;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    invalidateRunStatCaches();
    Neo.player = createDefaultPlayer();
    Neo.player.maxHp = 300; Neo.player.hp = 300;
    Neo.player2 = spawnMpPlayer(Neo.chosenCharacter2 || Object.keys(Neo.CHARACTER_DEFS).find(k => k !== Neo.chosenCharacter) || Neo.chosenCharacter, 80, 0);
    Neo.player2.maxHp = 300; Neo.player2.hp = 300;
    Neo.player3 = null;
    Neo.player4 = null;
    Neo.p1DeadInCoop = false; Neo.p2DeadInCoop = false; Neo.p3DeadInCoop = false; Neo.p4DeadInCoop = false;
    Neo.player2.x = Neo.START_X + 80;
    Neo.player2.y = Neo.START_Y;
    Neo.player2.items = JSON.parse(JSON.stringify(Neo.player.items));
    Neo.pvpState = { p1Kills: 0, p2Kills: 0, killsToWin: 3, respawnTimer: null };
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    resetScene();
    Neo.generateFloor();
    if (!Neo.loopStarted) { Neo.loopStarted = true; requestAnimationFrame(Neo.loop); }
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = '';
  }

  async function startCompetitive() {
    if (Neo.chosenCharacter === 'princess') {
      Neo.chosenCharacter = 'thorn_knight';
    }
    let serverSeed = Neo._competitiveSeed || null;
    if (!serverSeed) {
      try {
        serverSeed = await refreshCompetitiveSeed({ force: true });
      } catch (error) {
        setCompetitiveServerStatus('offline', { message: error?.message || 'Competitive server is unreachable' });
        setGameState('start');
        const altmodesPanel = document.getElementById('altModesPanel');
        if (altmodesPanel) altmodesPanel.classList.remove('hidden');
        document.querySelectorAll('.altmodes-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'competitive'));
        document.querySelectorAll('.altmodes-tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== 'competitive'));
        return;
      }
    }
    Neo._competitiveSeed = null;
    setGameState('play');
    Neo.baseSeedStr = serverSeed;
    Neo.selectedDifficulty = 'hard';
    Neo.selectedChallenges = [];
    Neo.runLoopIndex = 0;
    Neo.runRevivesUsed = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 1;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    invalidateRunStatCaches();
    Neo.player = createDefaultPlayer();
    resetMultiplayerState();
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    resetScene();
    Neo.generateFloor();
    resetTutorialState(false);
    Neo.persistMetaSoon();
    Neo.scheduleRunSave();
    if (!Neo.loopStarted) { Neo.loopStarted = true; requestAnimationFrame(Neo.loop); }
  }

  function startEndlessRoom() {
    Neo.rooms = [];
    const room = Neo.createRoomRecord({ x: 4, y: 4 }, { type: 'combat', doors: { n: false, s: false, e: false, w: false }, cleared: false });
    Neo.decorateRoomData(room);
    Neo.rooms.push(room);
    Neo.currentRoom = room;
    Neo.enterRoom(room);
  }

  function startEndless() {
    setGameState('play');
    Neo.baseSeedStr = Neo.ui.seed.value.trim() || createRandomSeed();
    Neo.selectedDifficulty = normalizeDifficulty(Neo.selectedDifficulty);
    Neo.selectedChallenges = [];
    Neo.runLoopIndex = 0;
    Neo.runRevivesUsed = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 1;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    Neo.endlessWave = 0;
    Neo.endlessWaveActive = false;
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
    Neo.player = createDefaultPlayer();
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    resetScene();
    resetRngStreams();
    startEndlessRoom();
    if (Neo.ui.endlessWaveNum) Neo.ui.endlessWaveNum.textContent = Neo.endlessWave;
    if (!Neo.loopStarted) { Neo.loopStarted = true; requestAnimationFrame(Neo.loop); }
  }

  function startPractice() {
    setGameState('play');
    Neo.baseSeedStr = createRandomSeed();
    Neo.selectedDifficulty = 'easy';
    Neo.selectedChallenges = [];
    Neo.runLoopIndex = 0;
    Neo.runRevivesUsed = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 5;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
    Neo.player = createDefaultPlayer();
    Neo.player.maxHp = 1000;
    Neo.player.hp = Neo.player.maxHp;
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    resetScene();
    resetRngStreams();
    Neo.rooms = [];
    const room = Neo.createRoomRecord({ x: 4, y: 4 }, { type: 'combat', doors: { n: false, s: false, e: false, w: false }, cleared: true });
    Neo.decorateRoomData(room);
    Neo.rooms.push(room);
    Neo.currentRoom = room;
    Neo.player.x = Neo.START_X;
    Neo.player.y = Neo.START_Y;
    syncPracticeMaxHpControls();
    if (!Neo.loopStarted) { Neo.loopStarted = true; requestAnimationFrame(Neo.loop); }
  }

  const BOSS_RUSH_ORDER = ['queen_cult', 'bulk_golem', 'antony_blemmye', 'handsome_devil', 'artificer_knave', 'god'];
  Neo.BOSS_RUSH_ORDER = BOSS_RUSH_ORDER;

  function startBossRush() {
    setGameState('play');
    Neo.baseSeedStr = createRandomSeed();
    Neo.selectedDifficulty = normalizeDifficulty(Neo.selectedDifficulty);
    Neo.selectedChallenges = [];
    Neo.runLoopIndex = 0;
    Neo.runRevivesUsed = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 5;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    Neo.bossRushStage = 0;
    Neo.bossRushActive = false;
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
    Neo.player = createDefaultPlayer();
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    resetScene();
    resetRngStreams();
    Neo.rooms = [];
    const room = Neo.createRoomRecord({ x: 4, y: 4 }, { type: 'combat', doors: { n: false, s: false, e: false, w: false }, cleared: false });
    Neo.decorateRoomData(room);
    Neo.rooms.push(room);
    Neo.currentRoom = room;
    Neo.player.x = Neo.START_X;
    Neo.player.y = Neo.START_Y;
    // Grant 3 random starting items
    const bossRushStartRandom = createScopedRandom('boss-rush:starting-items');
    for (let i = 0; i < 3; i++) {
      const key = Neo.rollItemDrop({ elite: i === 2, random: bossRushStartRandom });
      if (key) Neo.collectItem(key);
    }
    Neo.addCoins(120);
    if (Neo.ui.bossRushStageNum) Neo.ui.bossRushStageNum.textContent = 1;
    if (Neo.ui.bossRushStageNum2) Neo.ui.bossRushStageNum2.textContent = 1;
    // Spawn first boss immediately
    spawnBossRushBoss();
    if (!Neo.loopStarted) { Neo.loopStarted = true; requestAnimationFrame(Neo.loop); }
  }

  function spawnBossRushBoss() {
    const bossType = BOSS_RUSH_ORDER[Neo.bossRushStage];
    if (!bossType) return;
    Neo.bossRushActive = true;
    Neo.currentRoom.cleared = false;
    const safeSpawn = Neo.findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2 - 40, 15);
    if (!safeSpawn) return;
    let boss;
    if (bossType === 'artificer_knave') {
      // Step 1: Spawn as a regular knave
      boss = Neo.spawnEnemy('knave', safeSpawn.x, safeSpawn.y, false);
      boss.isTransforming = true;
      // Visual cue: show particles or text
      Neo.spawnParticle({ x: boss.x, y: boss.y - 40, life: 1.2, text: '???', c: '#ffd27d' });
      // After a short delay, transform into artificer_knave
      setTimeout(() => {
        if (!boss || !Neo.enemies.includes(boss)) return;
        // --- Transformation Animation ---
        // 1. Flash effect
        for (let i = 0; i < 8; i++) {
          setTimeout(() => {
            Neo.spawnParticle({ x: boss.x, y: boss.y, life: 0.18, ring: 32 + i * 4, c: i % 2 === 0 ? '#ffd27d' : '#fffbe0' });
          }, i * 40);
        }
        // 2. Scale up and down (squash/stretch)
        boss.transformAnimT = 0.36; // duration in seconds
        const animInterval = setInterval(() => {
          if (!boss || boss.transformAnimT <= 0) { clearInterval(animInterval); return; }
          boss.transformAnimT -= 0.04;
        }, 40);
        // 3. Transformation text
        Neo.spawnParticle({ x: boss.x, y: boss.y - 40, life: 1.6, text: 'TRANSFORM!', c: '#ffd27d' });
        // 4. Play sound if available
        if (window.playSound) window.playSound('transform');
        // 5. After a short moment, actually transform
        setTimeout(() => {
          if (!boss || !Neo.enemies.includes(boss)) return;
          boss.type = 'artificer_knave';
          boss.r = 30;
          boss.hp = 1880;
          boss.max = 1880;
          boss.speed = 124;
          boss.dmg = 20;
          boss.attackCd = 1.2;
          boss.phase = 1;
          boss.isTransforming = false;
          boss.transformAnimT = 0;
          // --- Wait a moment before cutscene/dialogue so animation is clear ---
          setTimeout(() => {
            const playedCutscene = Neo.tryPlayKnaveKnightCutscene(boss, 'artificer_knave');
            const line = Neo.BOSS_OPENING_DIALOGUE['artificer_knave'];
            if (!playedCutscene && boss && line) Neo.sayOverEntity(boss, line);
          }, 400); // Wait 0.4s after animation for clarity
        }, 420); // transformation after animation
      }, 1200); // 1.2 seconds delay
    } else {
      boss = Neo.spawnEnemy(bossType, safeSpawn.x, safeSpawn.y, false);
      const playedCutscene = Neo.tryPlayBossIntroCutscene(boss, bossType);
      const line = Neo.BOSS_OPENING_DIALOGUE[bossType];
      if (!playedCutscene && boss && line) Neo.sayOverEntity(boss, line);
      if (bossType === 'god') Neo.playGodDialogue(1);
    }
    Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 50, life: 1.4, text: `BOSS ${Neo.bossRushStage + 1}: ${getBossDisplayName(bossType).toUpperCase()}`, c: '#ff8b8b' });
  }

  function onBossRushBossDefeated() {
    Neo.bossRushActive = false;
    Neo.bossRushStage += 1;
    if (Neo.ui.bossRushStageNum) Neo.ui.bossRushStageNum.textContent = Math.min(Neo.bossRushStage + 1, BOSS_RUSH_ORDER.length);
    if (Neo.ui.bossRushStageNum2) Neo.ui.bossRushStageNum2.textContent = Math.min(Neo.bossRushStage + 1, BOSS_RUSH_ORDER.length);
    if (Neo.bossRushStage >= BOSS_RUSH_ORDER.length) {
      Neo.win();
      return;
    }
    const cx = Neo.ROOM_W / 2;
    const cy = Neo.ROOM_H / 2;
    const rewardRandom = createScopedRandom(`boss-rush:stage:${Neo.bossRushStage}:reward`);
    Neo.dropCoins(cx, cy - 20, 80 + Neo.bossRushStage * 30);
    Neo.pickups.push({ x: cx - 60, y: cy, type: 'item', key: Neo.rollItemDrop({ elite: true, random: rewardRandom }) });
    Neo.pickups.push({ x: cx + 60, y: cy, type: 'potion' });
    Neo.grantXp(40 + Neo.bossRushStage * 20);
    const nextName = getBossDisplayName(BOSS_RUSH_ORDER[Neo.bossRushStage]).toUpperCase();
    Neo.spawnParticle({ x: cx, y: cy - 40, life: 1.6, text: 'BOSS DEFEATED!', c: '#78d7ff' });
    setTimeout(() => {
      if (Neo.gameMode !== 'boss_rush' || Neo.gameState !== 'play') return;
      Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 50, life: 1.2, text: `NEXT: ${nextName}`, c: '#ffb347' });
    }, 1500);
    setTimeout(() => {
      if (Neo.gameMode !== 'boss_rush' || Neo.gameState !== 'play') return;
      spawnBossRushBoss();
    }, 4000);
  }

  function clampPracticeMaxHp(value) {
    return Neo.clamp(Math.round(Number(value) || 1000), 1, 10000);
  }

  function syncPracticeMaxHpControls() {
    if (!Neo.ui.practiceMaxHpSlider && !Neo.ui.practiceMaxHpNum) return;
    const value = clampPracticeMaxHp(Neo.player?.maxHp || 1000);
    if (Neo.ui.practiceMaxHpSlider) Neo.ui.practiceMaxHpSlider.value = String(value);
    if (Neo.ui.practiceMaxHpNum) Neo.ui.practiceMaxHpNum.value = String(value);
  }

  function setPracticeMaxHp(value) {
    if (!Neo.player) return;
    const nextMaxHp = clampPracticeMaxHp(value);
    const hpRatio = Neo.player.maxHp > 0 ? Neo.player.hp / Neo.player.maxHp : 1;
    Neo.player.maxHp = nextMaxHp;
    Neo.player.hp = Neo.clamp(Math.round(nextMaxHp * hpRatio), 1, nextMaxHp);
    syncPracticeMaxHpControls();
    Neo.updateHud();
  }

  function buildPracticeEnemyGrid() {
    if (!Neo.ui.practiceEnemyGrid) return;
    const BOSS_TYPES_SET = new Set(['queen_cult', 'bulk_golem', 'artificer_knave', 'bowman_bane', 'antony_blemmye', 'handsome_devil', 'god']);
    const allTypes = [
      'hunter', 'charger', 'laser', 'knave', 'sniper', 'machine_gunner',
      'golem', 'cult_mage', 'cult_follower', 'summoner', 'shield_unit', 'healer', 'boss_spawner',
      'queen_cult', 'bulk_golem', 'artificer_knave', 'bowman_bane', 'antony_blemmye', 'handsome_devil', 'god', 'mirror_knight', 'mooggy',
    ];
    Neo.ui.practiceEnemyGrid.innerHTML = allTypes.map(type => {
      const isBoss = BOSS_TYPES_SET.has(type);
      const label = type.replace(/_/g, ' ');
      return `<button class="practice-spawn-btn${isBoss ? ' is-boss' : ''}" data-enemy="${type}">${label}</button>`;
    }).join('');
    Neo.ui.practiceEnemyGrid.addEventListener('click', event => {
      const btn = event.target instanceof Element ? event.target.closest('[data-enemy]') : null;
      if (!btn || !Neo.player) return;
      const type = btn.dataset.enemy;
      const elite = Neo.ui.practiceEliteToggle?.checked ?? false;
      const angle = Neo.nextRandom('encounter') * Math.PI * 2;
      const dist = 160 + Neo.nextRandom('encounter') * 120;
      const x = Neo.clamp(Neo.player.x + Math.cos(angle) * Neo.dist, 80, Neo.ROOM_W - 80);
      const y = Neo.clamp(Neo.player.y + Math.sin(angle) * Neo.dist, 80, Neo.ROOM_H - 80);
      Neo.spawnEnemy(type, x, y, elite);
    });
  }

  function resetScene() {
    Neo.enemies = [];
    Neo.deadBodies = [];
    Neo.particles = [];
    Neo.playerDeathAnim = null;
    Neo.endlessWave = 0;
    Neo.endlessWaveActive = false;
    Neo.bossRushStage = 0;
    Neo.bossRushActive = false;
    Neo.projectiles = [];
    Neo.chests = [];
    Neo.pickups = [];
    Neo.destructibles = [];
    Neo.hazards = [];
    Neo.shopOffers = [];
    Neo.structures = [];
    Neo.decorations = [];
    Neo.cooldowns = createCooldownState(Neo.player);
    Neo.laserActive = false;
    Neo.laserTime = 0;
    Neo.laserTick = 0;
    Neo.laserMode = 'beam';
    Neo.laserAngle = 0;
    Neo.laserSweepSpeed = 0;
    Neo.turtleWaveHpTimer = 0;
    Neo.dashKeyLatch = false;
    Neo.godTimer = 0;
    Neo.camera = { x: 0, y: 0 };
    Neo.camera2 = { x: 0, y: 0 };
    Neo.camera3 = { x: 0, y: 0 };
    Neo.camera4 = { x: 0, y: 0 };
    Neo.shake = 0;
    Neo.shakeT = 0;
    Neo.fade = 0;
    Neo.fading = 0;
    Neo.nextDoor = null;
    Neo.floorSkipPending = 0;
    Neo.teleportKeyLatch = false;
    Neo.shopKeyLatch = false;
    Neo.invKeyLatch = false;
    Neo.anvilKeyLatch = false;
    Neo.ladderUseKeyLatch = false;
    Neo.activeShopTab = 'items';
    Neo.draggingMoveKey = '';
    Neo.weaponBurstQueue = [];
    Neo.rivals = [];
    Neo.monsterRoamTimer = 0;
    Neo.mooggyAssassinSpawnedThisRun = false;
    Neo.mooggyAssassinSpawnedThisFloor = false;
    Neo.knaveKnightCutscenePlayed = false;
    Neo.queenMetaoCutscenePlayed = false;
    Neo.handsomeDevilCutscenePlayed = false;
    Neo.secretRoomVisitedFloors = [];
    Neo.wizardPawSelection = null;
    Neo.wizardPawPendingCount = 0;
    Neo.setWizardPawModalOpen(false);
    Neo.setShopPanelOpen(false);
    Neo.setInventoryPanelOpen(false);
    Neo.mouse.down = false;
    Neo.mouse.right = false;
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
  }

  function sanitizePickupList(source) {
    if (!Array.isArray(source)) return [];
    return source.filter(pickup => (
      pickup
      && typeof pickup === 'object'
      && typeof pickup.type === 'string'
      && Number.isFinite(Number(pickup.x))
      && Number.isFinite(Number(pickup.y))
    ));
  }

  function restoreRun(snapshot) {
    Neo.gameMode = normalizeGameMode(snapshot.mode || Neo.gameMode);
    Neo.baseSeedStr = snapshot.baseSeedStr || snapshot.seedStr || createRandomSeed();
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    Neo.runLoopIndex = Number(snapshot.runLoopIndex || 0);
    Neo.runRevivesUsed = Math.max(0, Number(snapshot.runRevivesUsed || 0));
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = snapshot.floor;
    Neo.selectedDifficulty = normalizeDifficulty(snapshot.difficulty);
    Neo.selectedChallenges = normalizeChallengeSelection(snapshot.challenges);
    Neo.metaProgress.bestFloor = Math.max(Neo.metaProgress.bestFloor, Neo.floor);
    resetRngStreams(snapshot.rngState);
    Neo.rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms : [];
    Neo.currentRoom = Neo.rooms.find(room => room.gx === snapshot.currentRoom?.gx && room.gy === snapshot.currentRoom?.gy) || Neo.rooms[0] || null;
    invalidateRunStatCaches();
    Neo.player = Neo.migratePlayerData(snapshot.player);
    if (isMultiplayerMode()) {
      Neo.player2 = snapshot.player2 ? Neo.migratePlayerData(snapshot.player2) : null;
      Neo.player3 = snapshot.player3 ? Neo.migratePlayerData(snapshot.player3) : null;
      Neo.player4 = snapshot.player4 ? Neo.migratePlayerData(snapshot.player4) : null;
      Neo.p1DeadInCoop = !!snapshot.p1DeadInCoop;
      Neo.p2DeadInCoop = !!snapshot.p2DeadInCoop;
      Neo.p3DeadInCoop = !!snapshot.p3DeadInCoop;
      Neo.p4DeadInCoop = !!snapshot.p4DeadInCoop;
      Neo.pvpState = snapshot.pvpState && typeof snapshot.pvpState === 'object' ? { ...snapshot.pvpState, respawnTimer: null } : null;
      const p2Row = document.getElementById('p2HpRow');
      if (p2Row) p2Row.style.display = Neo.player2 ? '' : 'none';
      if (!Neo.player2) resetMultiplayerState();
    } else {
      resetMultiplayerState();
    }
    Neo.enemies = Array.isArray(snapshot.enemies) ? snapshot.enemies.map(Neo.migrateEnemyState) : [];
    Neo.deadBodies = Array.isArray(snapshot.deadBodies) ? snapshot.deadBodies : [];
    Neo.particles = [];
    Neo.projectiles = snapshot.projectiles || [];
    Neo.chests = snapshot.chests || [];
    Neo.pickups = sanitizePickupList(snapshot.pickups);
    Neo.destructibles = snapshot.destructibles || Neo.currentRoom?.destructibles || [];
    Neo.hazards = snapshot.hazards || Neo.currentRoom?.hazards || [];
    Neo.shopOffers = snapshot.shopOffers || Neo.currentRoom?.shopOffers || [];
    Neo.structures = snapshot.structures || Neo.currentRoom?.structures || [];
    Neo.decorations = snapshot.decorations || Neo.currentRoom?.decorations || [];
    if (Neo.currentRoom) {
      Neo.currentRoom.enemies = Array.isArray(Neo.currentRoom.enemies) ? Neo.currentRoom.enemies.map(Neo.migrateEnemyState) : Neo.enemies;
      Neo.currentRoom.deadBodies = Array.isArray(Neo.currentRoom.deadBodies) ? Neo.currentRoom.deadBodies : Neo.deadBodies;
      Neo.currentRoom.projectiles = Array.isArray(Neo.currentRoom.projectiles) ? Neo.currentRoom.projectiles : Neo.projectiles;
      Neo.currentRoom.chests = Array.isArray(Neo.currentRoom.chests) ? Neo.currentRoom.chests : Neo.chests;
      Neo.currentRoom.pickups = sanitizePickupList(Neo.currentRoom.pickups);
      Neo.currentRoom.destructibles = Array.isArray(Neo.currentRoom.destructibles) ? Neo.currentRoom.destructibles : Neo.destructibles;
      Neo.currentRoom.hazards = Array.isArray(Neo.currentRoom.hazards) ? Neo.currentRoom.hazards : Neo.hazards;
      Neo.currentRoom.shopOffers = Array.isArray(Neo.currentRoom.shopOffers) ? Neo.currentRoom.shopOffers : Neo.shopOffers;
      Neo.currentRoom.shopWeaponOffers = Array.isArray(Neo.currentRoom.shopWeaponOffers) ? Neo.currentRoom.shopWeaponOffers : [];
      Neo.currentRoom.structures = Array.isArray(Neo.currentRoom.structures) ? Neo.currentRoom.structures : Neo.structures;
      Neo.currentRoom.decorations = Array.isArray(Neo.currentRoom.decorations) ? Neo.currentRoom.decorations : Neo.decorations;
      refreshRoomShopCosts(Neo.currentRoom, Neo.selectedDifficulty, Neo.floor);
      Neo.enemies = Neo.currentRoom.enemies;
      Neo.deadBodies = Neo.currentRoom.deadBodies;
      Neo.projectiles = Neo.currentRoom.projectiles;
      Neo.chests = Neo.currentRoom.chests;
      Neo.pickups = Neo.currentRoom.pickups;
      Neo.destructibles = Neo.currentRoom.destructibles;
      Neo.hazards = Neo.currentRoom.hazards;
      Neo.shopOffers = Neo.currentRoom.shopOffers;
      Neo.structures = Neo.currentRoom.structures;
      Neo.decorations = Neo.currentRoom.decorations;
    }
    Neo.cooldowns = createCooldownState(Neo.player, snapshot.cooldowns || {});
    Neo.laserActive = !!snapshot.laserActive;
    Neo.laserTime = snapshot.laserTime || 0;
    Neo.laserTick = snapshot.laserTick || 0;
    Neo.laserMode = snapshot.laserMode || 'beam';
    Neo.laserAngle = Number(snapshot.laserAngle || 0);
    Neo.laserSweepSpeed = Number(snapshot.laserSweepSpeed || 0);
    Neo.turtleWaveHpTimer = Number(snapshot.turtleWaveHpTimer || 0);
    Neo.godTimer = snapshot.godTimer || 0;
    Neo.gameElapsedTime = snapshot.gameElapsedTime || 0;
    Neo.camera = snapshot.camera || { x: 0, y: 0 };
    Neo.shake = 0;
    Neo.shakeT = 0;
    Neo.fade = 0;
    Neo.fading = 0;
    Neo.nextDoor = null;
    Neo.floorSkipPending = 0;
    Neo.teleportKeyLatch = false;
    Neo.dashKeyLatch = false;
    Neo.shopKeyLatch = false;
    Neo.invKeyLatch = false;
    Neo.anvilKeyLatch = false;
    Neo.ladderUseKeyLatch = false;
    Neo.activeShopTab = 'items';
    Neo.draggingMoveKey = '';
    Neo.weaponBurstQueue = [];
    Neo.monsterRoamTimer = Number(snapshot.monsterRoamTimer || 0);
    Neo.knaveKnightCutscenePlayed = !!snapshot.knaveKnightCutscenePlayed;
    Neo.queenMetaoCutscenePlayed = !!snapshot.queenMetaoCutscenePlayed;
    Neo.handsomeDevilCutscenePlayed = !!snapshot.handsomeDevilCutscenePlayed;
    Neo.secretRoomVisitedFloors = Array.isArray(snapshot.secretRoomVisitedFloors) ? [...snapshot.secretRoomVisitedFloors] : [];
    Neo.restoreRivals(snapshot.rivals);
    Neo.wizardPawSelection = null;
    Neo.wizardPawPendingCount = 0;
    Neo.setWizardPawModalOpen(false);
    Neo.setShopPanelOpen(false);
    Neo.setInventoryPanelOpen(false);
    Neo.updateItemUI();
    Neo.injectRivalsToCurrentRoom();
    Neo.updateObjective();
    Neo.updateHud();
    Neo.persistMetaSoon();
  }

  // Expose on Neo
  Neo.pauseGame = pauseGame;
  Neo.resumeGame = resumeGame;
  Neo.createDefaultMeta = createDefaultMeta;
  Neo.shouldOfferTutorialButton = shouldOfferTutorialButton;
  Neo.markTutorialButtonOfferedNow = markTutorialButtonOfferedNow;
  Neo.markPlayerSeenNow = markPlayerSeenNow;
  Neo.showFirstTip = showFirstTip;
  Neo.normalizeSandboxSettings = normalizeSandboxSettings;
  Neo.isSandboxRunActive = isSandboxRunActive;
  Neo.getActiveSandboxSettings = getActiveSandboxSettings;
  Neo.applySandboxPlayerSetup = applySandboxPlayerSetup;
  Neo.createDefaultTutorialState = createDefaultTutorialState;
  Neo.resetTutorialState = resetTutorialState;
  Neo.isFirstRunTutorialActive = isFirstRunTutorialActive;
  Neo.consumeReplayTutorialRequest = consumeReplayTutorialRequest;
  Neo.formatControlLabel = formatControlLabel;
  Neo.getControlHint = getControlHint;
  Neo.getAscendControlHint = getAscendControlHint;
  Neo.getMovementControlHint = getMovementControlHint;
  Neo.ensureTutorialDummyEnemy = ensureTutorialDummyEnemy;
  Neo.getTutorialStepOrder = getTutorialStepOrder;
  Neo.navigateTutorialStep = navigateTutorialStep;
  Neo.getTutorialStepMessage = getTutorialStepMessage;
  Neo.getTutorialObjectiveEntries = getTutorialObjectiveEntries;
  Neo.skipFirstRunTutorial = skipFirstRunTutorial;
  Neo.updateFirstRunTutorialProgress = updateFirstRunTutorialProgress;
  Neo.getCharacterStartingItems = getCharacterStartingItems;
  Neo.createDefaultPlayer = createDefaultPlayer;
  Neo.applyRunChallengeStartModifiers = applyRunChallengeStartModifiers;
  Neo.createItemRegistry = createItemRegistry;
  Neo.loadPersistedState = loadPersistedState;
  Neo.normalizeUnlockedItems = normalizeUnlockedItems;
  Neo.normalizeUnlockedCharacters = normalizeUnlockedCharacters;
  Neo.normalizeDifficulty = normalizeDifficulty;
  Neo.normalizeChallengeSelection = normalizeChallengeSelection;
  Neo.isSplitScreen = isSplitScreen;
  Neo.isMultiplayerMode = isMultiplayerMode;
  Neo.getPlayerSlot = getPlayerSlot;
  Neo.getPlayerSlots = getPlayerSlots;
  Neo.getActivePlayerSlots = getActivePlayerSlots;
  Neo.getLivePlayerSlots = getLivePlayerSlots;
  Neo.getSlotByEntity = getSlotByEntity;
  Neo.setSlotDead = setSlotDead;
  Neo.resetMultiplayerState = resetMultiplayerState;
  Neo.invalidateRunStatCaches = invalidateRunStatCaches;
  Neo.splitPlayerCount = splitPlayerCount;
  Neo.openMpLobby = openMpLobby;
  Neo.closeMpLobby = closeMpLobby;
  Neo.normalizeGameMode = normalizeGameMode;
  Neo.getRunModeLabel = getRunModeLabel;
  Neo.normalizeLegacySelection = normalizeLegacySelection;
  Neo.hasLegacy = hasLegacy;
  Neo.normalizeRunHistory = normalizeRunHistory;
  Neo.normalizeRunHistoryChallengeKeys = normalizeRunHistoryChallengeKeys;
  Neo.deriveRunRecords = deriveRunRecords;
  Neo.syncMetaRecordsFromRunHistory = syncMetaRecordsFromRunHistory;
  Neo.getOwnedChallengeSet = getOwnedChallengeSet;
  Neo.getUnlockedChallengeSet = getUnlockedChallengeSet;
  Neo.isChallengeActive = isChallengeActive;
  Neo.getActiveChallengeCrystalBonusMultiplier = getActiveChallengeCrystalBonusMultiplier;
  Neo.createRandomSeed = createRandomSeed;
  Neo.syncSeedState = syncSeedState;
  Neo.getFloorSeed = getFloorSeed;
  Neo.createRngStream = createRngStream;
  Neo.resetRngStreams = resetRngStreams;
  Neo.nextRandom = nextRandom;
  Neo.createScopedRandom = createScopedRandom;
  Neo.createRandomFromSeed = createRandomFromSeed;
  Neo.createRoomRandom = createRoomRandom;
  Neo.createEntityRandom = createEntityRandom;
  Neo.getRngState = getRngState;
  Neo.getDifficultyDef = getDifficultyDef;
  Neo.getDifficultyRuntimeConfig = getDifficultyRuntimeConfig;
  Neo.getRunDifficultyScalars = getRunDifficultyScalars;
  Neo.scaleChallengeTimer = scaleChallengeTimer;
  Neo.scalePotionHealing = scalePotionHealing;
  Neo.getPotionHealAmount = getPotionHealAmount;
  Neo.getPlayerHealingMultiplier = getPlayerHealingMultiplier;
  Neo.scalePlayerHealing = scalePlayerHealing;
  Neo.getShopPriceMultiplier = getShopPriceMultiplier;
  Neo.scaleShopPrice = scaleShopPrice;
  Neo.getShopRarityPriceMultiplier = getShopRarityPriceMultiplier;
  Neo.getShopPotionCost = getShopPotionCost;
  Neo.getShopItemCost = getShopItemCost;
  Neo.getShopMoveCost = getShopMoveCost;
  Neo.getShopWeaponCost = getShopWeaponCost;
  Neo.getShopGodSweepCost = getShopGodSweepCost;
  Neo.getShopHealCost = getShopHealCost;
  Neo.getSecretXpOfferCost = getSecretXpOfferCost;
  Neo.getSecretXpOfferAmount = getSecretXpOfferAmount;
  Neo.getLaserCastDuration = getLaserCastDuration;
  Neo.getMoveCooldownBase = getMoveCooldownBase;
  Neo.getMeleeCooldownDuration = getMeleeCooldownDuration;
  Neo.getLaserCooldownDuration = getLaserCooldownDuration;
  Neo.getDashCooldownDuration = getDashCooldownDuration;
  Neo.getSmashCooldownDuration = getSmashCooldownDuration;
  Neo.getMoveMaxStacks = getMoveMaxStacks;
  Neo.getSlotCooldownDuration = getSlotCooldownDuration;
  Neo.createCooldownEntry = createCooldownEntry;
  Neo.createCooldownState = createCooldownState;
  Neo.spendSkillCharge = spendSkillCharge;
  Neo.queueHeldSkillRecharge = queueHeldSkillRecharge;
  Neo.tickCooldowns = tickCooldowns;
  Neo.getSkillCooldownInfo = getSkillCooldownInfo;
  Neo.refreshRoomShopCosts = refreshRoomShopCosts;
  Neo.getEnemyDifficultyTuning = getEnemyDifficultyTuning;
  Neo.getUnlockedDifficultySet = getUnlockedDifficultySet;
  Neo.titleCase = titleCase;
  Neo.escapeHtml = escapeHtml;
  Neo.formatElapsedTime = formatElapsedTime;
  Neo.formatRunEndedAt = formatRunEndedAt;
  Neo.getBossDisplayName = getBossDisplayName;
  Neo.getEnemyLabel = getEnemyLabel;
  Neo.getEliteEnemyLabel = getEliteEnemyLabel;
  Neo.getRoomLabel = getRoomLabel;
  Neo.getDamageSourceLabel = getDamageSourceLabel;
  Neo.normalizeDeathQuoteKey = normalizeDeathQuoteKey;
  Neo.getKillerDeathQuote = getKillerDeathQuote;
  Neo.findKillerEnemyEntity = findKillerEnemyEntity;
  Neo.speakKillerDeathQuote = speakKillerDeathQuote;
  Neo.captureRunItemSnapshot = captureRunItemSnapshot;
  Neo.getItemRarityCounts = getItemRarityCounts;
  Neo.captureRunMoveSnapshot = captureRunMoveSnapshot;
  Neo.buildRunHistoryEntry = buildRunHistoryEntry;
  Neo.pushRunHistoryEntry = pushRunHistoryEntry;
  Neo.renderRunHistoryListEntry = renderRunHistoryListEntry;
  Neo.renderRunHistoryHero = renderRunHistoryHero;
  Neo.renderRunHistoryTabContent = renderRunHistoryTabContent;
  Neo.resolveKillerSprite = resolveKillerSprite;
  Neo.hydrateRunHistorySprites = hydrateRunHistorySprites;
  Neo.refreshMenuState = refreshMenuState;
  Neo.updateCharacterSelectionUI = updateCharacterSelectionUI;
  Neo.setGameState = setGameState;
  Neo.startGame = startGame;
  Neo.spawnMpPlayer = spawnMpPlayer;
  Neo.startCoop = startCoop;
  Neo.startPvp = startPvp;
  Neo.startCompetitive = startCompetitive;
  Neo.COMPETITIVE_SERVER_URL = COMPETITIVE_SERVER_URL;
  Neo.fetchCompetitiveJson = fetchCompetitiveJson;
  Neo.refreshCompetitiveSeed = refreshCompetitiveSeed;
  Neo.setCompetitiveServerStatus = setCompetitiveServerStatus;
  Neo.startEndlessRoom = startEndlessRoom;
  Neo.startEndless = startEndless;
  Neo.startPractice = startPractice;
  Neo.startBossRush = startBossRush;
  Neo.spawnBossRushBoss = spawnBossRushBoss;
  Neo.onBossRushBossDefeated = onBossRushBossDefeated;
  Neo.clampPracticeMaxHp = clampPracticeMaxHp;
  Neo.syncPracticeMaxHpControls = syncPracticeMaxHpControls;
  Neo.setPracticeMaxHp = setPracticeMaxHp;
  Neo.buildPracticeEnemyGrid = buildPracticeEnemyGrid;
  Neo.resetScene = resetScene;
  Neo.sanitizePickupList = sanitizePickupList;
  Neo.restoreRun = restoreRun;
