
  function pauseGame() {
    document.body.classList.add('game-paused');
    setGameState('pause');
  }

  function resumeGame() {
    document.body.classList.remove('game-paused');
    setGameState('play');
  }

  function createDefaultMeta() {
    return {
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
      loopCrystals: 0,
      unlockedLegacy: [],
      tutorialCompleted: false,
      sandboxSettings: { ...SANDBOX_DEFAULT_SETTINGS },
    };
  }

  function normalizeSandboxSettings(input) {
    const source = input && typeof input === 'object' ? input : {};
    const allowedEnemies = Array.isArray(source.allowedEnemies)
      ? SANDBOX_ENEMY_TYPES.filter(type => source.allowedEnemies.includes(type))
      : SANDBOX_ENEMY_TYPES.slice();
    const allowedItems = Array.isArray(source.allowedItems)
      ? ITEM_KEYS.filter(key => source.allowedItems.includes(key))
      : ITEM_KEYS.slice();
    return {
      enemyStatMultiplier: Math.max(0.2, Math.min(4, Number(source.enemyStatMultiplier ?? SANDBOX_DEFAULT_SETTINGS.enemyStatMultiplier) || 1)),
      enemySpeedMultiplier: Math.max(0.2, Math.min(3, Number(source.enemySpeedMultiplier ?? SANDBOX_DEFAULT_SETTINGS.enemySpeedMultiplier) || 1)),
      enemyDamageMultiplier: Math.max(0.1, Math.min(3, Number(source.enemyDamageMultiplier ?? SANDBOX_DEFAULT_SETTINGS.enemyDamageMultiplier) || 1)),
      playerDamageMultiplier: Math.max(0.1, Math.min(6, Number(source.playerDamageMultiplier ?? SANDBOX_DEFAULT_SETTINGS.playerDamageMultiplier) || 1)),
      startingCoins: Math.max(0, Math.min(999, Math.round(Number(source.startingCoins ?? SANDBOX_DEFAULT_SETTINGS.startingCoins) || 0))),
      godMode: !!source.godMode,
      allowedEnemies: allowedEnemies.length ? allowedEnemies : SANDBOX_ENEMY_TYPES.slice(0, 1),
      allowedItems: allowedItems.length ? allowedItems : ITEM_KEYS.slice(),
    };
  }

  function isSandboxRunActive() {
    return gameMode === 'sandbox';
  }

  function getActiveSandboxSettings() {
    return isSandboxRunActive() ? sandboxSettings : null;
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

  function resetTutorialState(active = false) {
    tutorialState = createDefaultTutorialState();
    tutorialState.active = !!active;
  }

  function isFirstRunTutorialActive() {
    return !!tutorialState?.active && gameMode === 'normal' && gameState === 'play';
  }

  function consumeReplayTutorialRequest() {
    let requested = false;
    try {
      requested = localStorage.getItem(REPLAY_TUTORIAL_KEY) === '1';
      if (requested) localStorage.removeItem(REPLAY_TUTORIAL_KEY);
    } catch {}
    return requested;
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

  function getMovementControlHint() {
    const up = getControlHint('up', 'w');
    const left = getControlHint('left', 'a');
    const down = getControlHint('down', 's');
    const right = getControlHint('right', 'd');
    return `${up}/${left}/${down}/${right}`;
  }

  function ensureTutorialDummyEnemy() {
    if (!isFirstRunTutorialActive() || tutorialState.gotKill) return;
    if (tutorialState.step !== 'fight') return;
    if (!currentRoom || ['boss', 'god', 'shop', 'anvil', 'challenge'].includes(currentRoom.type)) return;
    if (tutorialState.dummySpawned || enemies.some(enemy => enemy?.tutorialDummy)) return;
    // Force a fair tutorial duel by clearing the normal room wave for this step.
    if (enemies.length > 0) {
      enemies = enemies.filter(enemy => enemy?.type === 'rival');
      syncCurrentRoomState();
    }
    const safeSpawn = findSafeEnemySpawnPoint(player.x + 110, player.y, 15)
      || findSafeEnemySpawnPoint(player.x - 110, player.y, 15)
      || findSafeEnemySpawnPoint(player.x, player.y - 90, 15)
      || findSafeEnemySpawnPoint(ROOM_W / 2 + 130, ROOM_H / 2, 15)
      || { x: clamp(player.x + 80, WALL + 22, ROOM_W - WALL - 22), y: clamp(player.y - 40, WALL + 22, ROOM_H - WALL - 22) };
    const dummy = spawnEnemy('hunter', safeSpawn.x, safeSpawn.y, false);
    dummy.tutorialDummy = true;
    dummy.hp = 16;
    dummy.max = 16;
    dummy.speed = 42;
    dummy.dmg = 1;
    dummy.attackCd = 2.8;
    dummy.spawnT = 0.18;
    dummy.barrier = 0;
    tutorialState.dummySpawned = true;
    particles.push({ x: dummy.x, y: dummy.y - 24, life: 1.4, text: 'TRAINING DUMMY', c: '#8dd4ff' });
    particles.push({ x: player.x, y: player.y - 30, life: 1.1, text: 'DUMMY SPAWNED', c: '#9ce9ff' });
  }

  function getTutorialStepOrder() {
    return ['move', 'fight', 'relic', 'panel', 'ladder'];
  }

  function navigateTutorialStep(direction = 1) {
    if (!isFirstRunTutorialActive()) return;
    const order = getTutorialStepOrder();
    const current = order.indexOf(tutorialState.step);
    const nextIndex = clamp((current >= 0 ? current : 0) + direction, 0, order.length - 1);
    tutorialState.step = order[nextIndex];
    tutorialState.manualStepLockUntil = Number(gameElapsedTime || 0) + 0.65;
    if (tutorialState.step === 'fight') ensureTutorialDummyEnemy();
    updateObjective();
  }

  function getTutorialStepMessage() {
    if (!isFirstRunTutorialActive()) return '';
    const moveHint = getMovementControlHint();
    const slashHint = getControlHint('slash', 'lmb');
    const laserHint = getControlHint('laser', 'rmb');
    const smashHint = getControlHint('smash', 'r');
    const inventoryHint = getControlHint('inventory', 'i');
    const shopHint = formatControlLabel('e', 'e');
    const ladderHint = formatControlLabel('space', 'space');
    if (tutorialState.step === 'move') return `Tutorial: Move with ${moveHint}.`;
    if (tutorialState.step === 'fight') return `Tutorial: Defeat the training dummy using ${slashHint}, ${laserHint}, or ${smashHint}.`;
    if (tutorialState.step === 'relic') return 'Tutorial: Pick up your first relic drop.';
    if (tutorialState.step === 'panel') return `Tutorial: Press ${inventoryHint} to open Inventory. In shop rooms, press ${shopHint} to open the shop.`;
    if (currentRoom?.type === 'ladder' && currentRoom?.cleared) return `Tutorial: Stand on the ladder and press ${ladderHint} to go to the next floor.`;
    if (currentRoom?.type === 'ladder') return 'Tutorial: Clear this ladder room, then use the ladder.';
    return 'Tutorial: Find the ladder room and continue to the next floor.';
  }

  function getTutorialObjectiveEntries() {
    if (!isFirstRunTutorialActive()) return [];
    const moveHint = getMovementControlHint();
    const slashHint = getControlHint('slash', 'lmb');
    const laserHint = getControlHint('laser', 'rmb');
    const inventoryHint = getControlHint('inventory', 'i');
    const shopHint = formatControlLabel('e', 'e');
    const ladderHint = formatControlLabel('space', 'space');
    return [
      { text: `Move (${moveHint})`, state: tutorialState.moved ? 'done' : 'todo' },
      { text: `Defeat training dummy (${slashHint}/${laserHint})`, state: tutorialState.gotKill ? 'done' : 'todo' },
      { text: 'Pick up one relic', state: tutorialState.gotRelic ? 'done' : 'todo' },
      { text: `Open Inventory (${inventoryHint}) or Shop (${shopHint} in shop room)`, state: (tutorialState.openedInventory || tutorialState.openedShop) ? 'done' : 'todo' },
      { text: `Use ladder: stand on it and press ${ladderHint}`, state: tutorialState.usedLadder ? 'done' : 'todo' },
    ];
  }

  function skipFirstRunTutorial() {
    if (!isFirstRunTutorialActive()) return;
    tutorialState.active = false;
    tutorialState.usedLadder = true;
    metaProgress.tutorialCompleted = true;
    persistMetaSoon();
    particles.push({ x: player.x, y: player.y - 26, life: 0.9, text: 'TUTORIAL SKIPPED', c: '#9cdcff' });
    uiController.setTutorialBanner('', false);
    updateObjective();
  }

  function updateFirstRunTutorialProgress() {
    if (!isFirstRunTutorialActive()) return;
    ensureTutorialDummyEnemy();
    if (Number(tutorialState.manualStepLockUntil || 0) > Number(gameElapsedTime || 0)) return;
    if (!tutorialState.moved && Math.hypot(player?.vx || 0, player?.vy || 0) > 24) tutorialState.moved = true;
    if (!tutorialState.gotKill && Number(player?.kills || 0) > 0) tutorialState.gotKill = true;
    if (tutorialState.step === 'move' && tutorialState.moved) tutorialState.step = 'fight';
    if (tutorialState.step === 'fight' && tutorialState.gotKill) tutorialState.step = 'relic';
    if (tutorialState.step === 'relic' && tutorialState.gotRelic) tutorialState.step = 'panel';
    if (tutorialState.step === 'panel' && (tutorialState.openedInventory || tutorialState.openedShop)) tutorialState.step = 'ladder';
    if (!tutorialState.usedLadder && floor > 1) tutorialState.usedLadder = true;
    if (tutorialState.usedLadder) {
      tutorialState.active = false;
      if (!metaProgress.tutorialCompleted) {
        metaProgress.tutorialCompleted = true;
        persistMetaSoon();
      }
      particles.push({ x: player.x, y: player.y - 26, life: 1, text: 'TUTORIAL COMPLETE', c: '#8dffcf' });
    }
  }

  function createDefaultPlayer() {
    const items = {
      neo_knife: 0,
      orb_of_blood: 0,
      hemes_scarf: 0,
      insurance: 0,
      crit_charm: 0,
      attack_servo: 0,
      keen_eye: 0,
      chrono_spring: 0,
      scholar_seal: 0,
      scholar_cap: 0,
      bandaid: 0,
      push_man: 0,
      titan_heart: 0,
      charged_adapter: 0,
      explosive_jelly: 0,
      dragon_orb: 0,
      turtle_shell: 0,
      anchor_charm: 0,
      iron_lung: 0,
      oracles_lens: 0,
      wizards_paw: 0,
      jesters_dice: 0,
      shield_of_aegis: 0,
      pendant_of_kronos: 0,
    };
    const character = CHARACTER_DEFS[chosenCharacter] || CHARACTER_DEFS.thorn_knight;
    const equippedMoves = getDefaultMovesForCharacter(character.key);
    const defaultWeapon = getDefaultWeaponForCharacter(character.key);
    const ownedMoves = {};
    Object.values(equippedMoves).forEach(key => { ownedMoves[key] = true; });
    const maxHp = Math.round(120 * (character.hpMultiplier || 1));
    return {
      character: character.key,
      x: START_X,
      y: START_Y,
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
      statuses: createStatusMap(),
      items,
      ownedWeapons: defaultWeapon ? { [defaultWeapon]: true } : {},
      equippedWeapon: defaultWeapon,
      weaponCooldown: 0,
      blockActive: false,
      blockTimer: 0,
      fleeceTick: 0,
      weaponBeamTime: 0,
      weaponBeamTick: 0,
      equippedMoves,
      ownedMoves,
      lavaWalkTime: 0,
      lavaTrailTick: 0,
      princessFlightTime: 0,
      anvilUpgrades: { weapon: {}, move: {} },
    };
  }

  function applyRunChallengeStartModifiers() {
    if (!player) return;
    if (isChallengeActive('fragile_body')) {
      player.maxHp = Math.max(1, Math.round(player.maxHp * 0.7));
      player.hp = Math.min(player.hp, player.maxHp);
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
      const library = factory.createLibrary(ITEM_DEFS, RuntimeItem);
      return factory.createRegistryFromLibrary(library);
    }
    return {
      get(key) {
        return ITEM_DEFS[key] || null;
      },
      keys() {
        return ITEM_KEYS.slice();
      },
    };
  }

  async function loadPersistedState() {
    uiController.setSaveState('LOADING');
    try {
      const [savedMeta, savedRun, savedRunHistory] = await Promise.all([
        saveStore.get('meta'),
        saveStore.get('run'),
        saveStore.get('runHistory'),
      ]);
      if (savedMeta && typeof savedMeta === 'object') {
        metaProgress = {
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
        };
      }
      runHistory = normalizeRunHistory(savedRunHistory || savedMeta?.runHistory);
      syncMetaRecordsFromRunHistory();
      activeRun = savedRun && typeof savedRun === 'object' ? savedRun : null;
      if (activeRun) {
        activeRun.mode = normalizeGameMode(activeRun.mode);
        activeRun.difficulty = normalizeDifficulty(activeRun.difficulty);
        activeRun.challenges = normalizeChallengeSelection(activeRun.challenges);
      }
      selectedDifficulty = normalizeDifficulty(metaProgress.selectedDifficulty);
      selectedChallenges = normalizeChallengeSelection(metaProgress.selectedChallenges);
      {
        const unlocked = new Set(metaProgress.unlockedCharacters || ['princess', 'thorn_knight', 'metao']);
        if (metaProgress.godsKilled > 0) unlocked.add('granialla');
        const preferredCharacter = String(metaProgress.selectedCharacter || chosenCharacter);
        chosenCharacter = unlocked.has(preferredCharacter) ? preferredCharacter : [...unlocked][0] || 'thorn_knight';
        metaProgress.selectedCharacter = chosenCharacter;
      }
      if (savedMeta && typeof savedMeta.customDifficultySettings === 'object' && savedMeta.customDifficultySettings) {
        customDifficultySettings = { ...customDifficultySettings, ...savedMeta.customDifficultySettings };
      }
      sandboxSettings = normalizeSandboxSettings(savedMeta?.sandboxSettings);
      uiController.setSaveState(saveStore.kind);
    } catch (error) {
      console.error('Failed to load save data', error);
      uiController.setSaveState('SAVE ERROR');
      activeRun = null;
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
    const items = ITEM_KEYS.filter(name => migrated.includes(name));
    return items.length ? items : fallback;
  }

  function normalizeUnlockedCharacters(input) {
    const fallback = ['princess', 'thorn_knight', 'metao'];
    if (!Array.isArray(input)) return fallback;
    const chars = Object.keys(CHARACTER_DEFS).filter(name => input.includes(name));
    return [...new Set([...fallback, ...chars])];
  }

  function normalizeDifficulty(input) {
    if (input === 'custom') return 'custom';
    return DIFFICULTY_DEFS[input] ? input : 'easy';
  }

  function normalizeChallengeSelection(input) {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter(key => CHALLENGE_DEFS[key]))];
  }

  function isSplitScreen() {
    return (gameMode === 'coop' || gameMode === 'pvp') && !!player2 && mpPlayerCount >= 2;
  }

  function isMultiplayerMode() {
    return gameMode === 'coop' || gameMode === 'pvp';
  }

  function getPlayerSlot(id) {
    return PLAYER_SLOT_CONFIG[id - 1] || null;
  }

  function getPlayerSlots({ includeInactive = false, includeDead = true } = {}) {
    return PLAYER_SLOT_CONFIG
      .filter(slot => includeInactive || !!slot.getEntity())
      .filter(slot => includeDead || !slot.getDead());
  }

  function getActivePlayerSlots() {
    if (!isMultiplayerMode()) return player ? [PLAYER_SLOT_CONFIG[0]] : [];
    return getPlayerSlots({ includeInactive: false, includeDead: true })
      .filter(slot => slot.id <= Math.max(1, mpPlayerCount));
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
    PLAYER_SLOT_CONFIG.forEach(slot => {
      if (slot.id > 1) slot.setEntity(null);
      slot.setDead(false);
    });
    pvpState = null;
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = 'none';
    closeMpLobby();
  }

  function invalidateRunStatCaches() {
    itemStatsCacheFrame = -1;
    itemStatsCacheValue = null;
    godItemKeysCache = null;
  }

  function splitPlayerCount() {
    if (gameState !== 'play') return 0;
    return getActivePlayerSlots().length;
  }

  function openMpLobby(mode) {
    gameMode = mode;
    const titleEl = document.getElementById('mpLobbyTitle');
    const hintEl = document.getElementById('mpLobbyHint');
    if (titleEl) titleEl.textContent = mode === 'pvp' ? 'PVP' : 'CO-OP';
    if (hintEl) {
      if (mode === 'pvp') hintEl.textContent = 'First to 3 kills wins. Melee your opponent to score.';
      else hintEl.textContent = 'P1: WASD + Mouse / Gamepad 1  ·  P2: IJKL + U/; / Gamepad 2';
    }
    const lobby = document.getElementById('mpLobby');
    if (lobby) lobby.classList.remove('hidden');
  }

  function closeMpLobby() {
    const lobby = document.getElementById('mpLobby');
    if (lobby) lobby.classList.add('hidden');
  }

  function normalizeGameMode(input) {
    const mode = String(input || 'normal').toLowerCase();
    if (mode === 'endless' || mode === 'practice' || mode === 'boss_rush' || mode === 'sandbox' || mode === 'coop' || mode === 'pvp') return mode;
    return 'normal';
  }

  function getRunModeLabel(mode) {
    if (mode === 'coop') return 'Co-op';
    if (mode === 'pvp') return 'PVP';
    if (mode === 'endless') return 'Endless';
    if (mode === 'practice') return 'Practice';
    if (mode === 'boss_rush') return 'Boss Rush';
    if (mode === 'sandbox') return 'Sandbox';
    return 'Normal';
  }

  function normalizeLegacySelection(input) {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter(key => LEGACY_UPGRADES[key]))];
  }

  function hasLegacy(key) {
    return (metaProgress.unlockedLegacy || []).includes(key);
  }

  function normalizeRunHistory(input) {
    if (!Array.isArray(input)) return [];
    return input
      .filter(entry => entry && typeof entry === 'object')
      .slice(0, RUN_HISTORY_LIMIT)
      .map(entry => {
        const challengeKeys = normalizeRunHistoryChallengeKeys(entry);
        return {
          id: String(entry.id || `${entry.endedAt || 'run'}:${entry.seed || ''}:${entry.floor || 0}`),
          endedAt: String(entry.endedAt || ''),
          result: entry.result === 'win' ? 'win' : 'dead',
          mode: normalizeGameMode(entry.mode),
          character: String(entry.character || 'thorn_knight'),
          characterName: String(entry.characterName || CHARACTER_DEFS[entry.character]?.name || 'Unknown'),
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
          challenges: challengeKeys.map(key => CHALLENGE_DEFS[key]?.name || titleCase(key)),
          items: Array.isArray(entry.items) ? entry.items.map(item => ({
            key: String(item.key || ''),
            name: String(item.name || item.key || 'Unknown'),
            count: Math.max(0, Number(item.count || 0)),
            rarity: String(item.rarity || ITEM_DEFS[item.key]?.rarity || ''),
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
    const byLabel = new Map(Object.entries(CHALLENGE_DEFS).map(([key, def]) => [
      String(def?.name || titleCase(key)).toLowerCase(),
      key,
    ]));
    const legacy = Array.isArray(entry.challenges) ? entry.challenges : [];
    return normalizeChallengeSelection(legacy.map(value => {
      const text = String(value || '');
      return CHALLENGE_DEFS[text] ? text : byLabel.get(text.toLowerCase()) || text;
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
    const records = deriveRunRecords(runHistory, metaProgress);
    metaProgress.bestFloor = records.floor;
    metaProgress.bestKills = records.kills;
    metaProgress.bestLevel = records.level;
    metaProgress.bestTime = records.time;
    metaProgress.bestCoins = records.coins;
    return records;
  }

  function getOwnedChallengeSet() {
    return new Set(normalizeChallengeSelection(metaProgress.unlockedChallenges || []));
  }

  function getUnlockedChallengeSet() {
    return new Set(CHALLENGE_ORDER);
  }

  function isChallengeActive(key) {
    return selectedChallenges.includes(key);
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
    const active = normalizeChallengeSelection(selectedChallenges);
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
    seedStr = runLoopIndex > 0 ? `${baseSeedStr}:loop:${runLoopIndex}` : baseSeedStr;
  }

  function getFloorSeed() {
    return `${baseSeedStr}|difficulty:${selectedDifficulty}|loop:${runLoopIndex}|floor:${floor}`;
  }

  function createRngStream(seed, consumed = 0) {
    const hashSeed = typeof KozSeededRngApi.fnv1a === 'function'
      ? KozSeededRngApi.fnv1a(String(seed || ''))
      : xmur3(String(seed || ''))();
    const stream = KozSeededRngApi.SeededStream
      ? new KozSeededRngApi.SeededStream(hashSeed)
      : null;
    const random = stream
      ? () => stream.random()
      : makeRNG(String(seed || ''));
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
    rngStreams = {
      world: createRngStream(`${floorSeed}|world`, snapshot.world),
      loot: createRngStream(`${floorSeed}|loot`, snapshot.loot),
      encounter: createRngStream(`${floorSeed}|encounter`, snapshot.encounter),
      fx: createRngStream(`${floorSeed}|fx`, snapshot.fx),
    };
    rng = () => nextRandom('encounter');
  }

  function nextRandom(stream = 'encounter') {
    const selected = rngStreams[stream] || rngStreams.encounter || rngStreams.world;
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
    const roomPart = currentRoom
      ? `room:${currentRoom.gx},${currentRoom.gy}|type:${currentRoom.type || 'room'}`
      : 'room:none';
    const entityPart = `${entity?.kind || entity?.type || 'entity'}:${Math.round(Number(entity?.x || 0))},${Math.round(Number(entity?.y || 0))}`;
    return createScopedRandom(`${roomPart}|${entityPart}|${scope}`);
  }

  function getRngState() {
    return {
      world: rngStreams.world?.getState?.() || 0,
      loot: rngStreams.loot?.getState?.() || 0,
      encounter: rngStreams.encounter?.getState?.() || 0,
      fx: rngStreams.fx?.getState?.() || 0,
    };
  }

  function getDifficultyDef(key = selectedDifficulty) {
    const norm = normalizeDifficulty(key);
    if (norm === 'custom') {
      return { ...DIFFICULTY_DEFS.custom, ...customDifficultySettings, key: 'custom', name: 'Custom' };
    }
    return DIFFICULTY_DEFS[norm];
  }

  function getDifficultyRuntimeConfig(key = selectedDifficulty) {
    const difficulty = getDifficultyDef(key);
    const statPressure = clamp((Number(difficulty?.statMultiplier || 1) - 1) / 0.52, 0, 1);
    const roomPressure = clamp(Number(difficulty?.roomWeightBonus || 0) / 0.22, 0, 1);
    const economyPressure = clamp((Number(difficulty?.shopPriceMultiplier || 1) - 1) / 0.42, 0, 1);
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
    const scaledAmount = Math.round(Number(baseAmount || 0) * getRunDifficultyScalars().potionHealMultiplier);
    return Math.max(Number(minimumAmount || 0), scaledAmount);
  }

  function getPotionHealAmount() {
    return scalePotionHealing(40, 24);
  }

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'DIFFICULTY_CONFIG', {
      configurable: true,
      get() {
        return getDifficultyRuntimeConfig();
      },
    });
  }

  function getShopPriceMultiplier(difficultyKey = selectedDifficulty) {
    const challengeMultiplier = isChallengeActive('cursed_shops') ? 1.5 : 1;
    return Number(getDifficultyDef(difficultyKey)?.shopPriceMultiplier || 1) * challengeMultiplier;
  }

  function scaleShopPrice(baseCost, difficultyKey = selectedDifficulty) {
    return Math.max(1, Math.round(baseCost * getShopPriceMultiplier(difficultyKey)));
  }

  function getShopRarityPriceMultiplier(rarity = 'knight') {
    return SHOP_RARITY_PRICE_MULTIPLIERS[String(rarity || 'knight').toLowerCase()] || 1;
  }

  function getShopPotionCost(floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(18 + floorValue * 2, difficultyKey);
  }

  function getShopItemCost(itemIndex = 0, floorValue = floor, difficultyKey = selectedDifficulty, rarity = 'knight') {
    const baseCost = 32 + floorValue * 4 + itemIndex * 6;
    return scaleShopPrice(baseCost * getShopRarityPriceMultiplier(rarity), difficultyKey);
  }

  function getShopMoveCost(moveIndex = 0, floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(34 + floorValue * 6 + moveIndex * 4, difficultyKey);
  }

  function getShopWeaponCost(rarity = 'knight', weaponIndex = 0, floorValue = floor, difficultyKey = selectedDifficulty, weaponKey = '') {
    if (rarity === 'god' || rarity === 'red') {
      let baseCost = (180 + floorValue * 14 + weaponIndex * 10) * 3;
      if (String(weaponKey || '').toLowerCase() === 'excalibur') baseCost = Math.round(baseCost * 1.25);
      return scaleShopPrice(baseCost, difficultyKey);
    }
    if (rarity === 'wizard' || rarity === 'purple') return scaleShopPrice(88 + floorValue * 9 + weaponIndex * 8, difficultyKey);
    return scaleShopPrice(52 + floorValue * 5 + weaponIndex * 6, difficultyKey);
  }

  function getShopGodSweepCost(floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(140 + floorValue * 12, difficultyKey);
  }

  function getShopHealCost(kind, floorValue = floor, difficultyKey = selectedDifficulty) {
    if (kind === 'major') return scaleShopPrice(34 + floorValue * 4, difficultyKey);
    return scaleShopPrice(16 + floorValue * 2, difficultyKey);
  }

  function getSecretXpOfferCost(floorValue = floor, difficultyKey = selectedDifficulty) {
    return scaleShopPrice(30 + floorValue * 8, difficultyKey);
  }

  function getSecretXpOfferAmount(floorValue = floor) {
    return Math.max(12, Math.round(14 + floorValue * 7));
  }

  function getLaserCastDuration(moveKey = getEquippedMove('laser')) {
    if (moveKey === 'god_sweep') return 1.45;
    if (moveKey === 'love_beam') return Math.max(0.1, MOVE_BASE_STATS.love_beam.duration + getAnvilMoveBonus('love_beam', 'duration'));
    if (moveKey === 'turtle_wave') return Math.max(0.1, MOVE_BASE_STATS.turtle_wave.duration + getAnvilMoveBonus('turtle_wave', 'duration'));
    return godTimer > 0 ? 0.72 : ATTACKS.laser.duration;
  }

  function getMoveCooldownBase(moveKey) {
    const base = MOVE_BASE_STATS[moveKey]?.cooldown ?? null;
    if (base === null) return null;
    return Math.max(0.05, base + getAnvilMoveBonus(moveKey, 'cooldown'));
  }

  function getMeleeCooldownDuration(moveKey = getEquippedMove('melee'), attackSpeed = getAttackSpeedValue()) {
    const anvilBase = getMoveCooldownBase(moveKey);
    if (anvilBase !== null) return anvilBase / attackSpeed;
    if (moveKey === 'slash') return 0.4 / attackSpeed;
    return (godTimer > 0 ? 0.2 : ATTACKS.melee.baseCooldown) / attackSpeed;
  }

  function getLaserCooldownDuration(moveKey = getEquippedMove('laser'), attackSpeed = getAttackSpeedValue()) {
    const anvilBase = getMoveCooldownBase(moveKey);
    if (anvilBase !== null) return anvilBase / attackSpeed;
    if (moveKey === 'turtle_wave') return 3 / attackSpeed;
    if (moveKey === 'blade_justice') return 3.8 / attackSpeed;
    if (moveKey === 'lightning_columns') return 4.8 / attackSpeed;
    if (moveKey === 'god_sweep') return 7.2 / attackSpeed;
    return (godTimer > 0 ? 2.8 : ATTACKS.laser.baseCooldown) / attackSpeed;
  }

  function getDashCooldownDuration(moveKey = getEquippedMove('dash'), attackSpeed = getAttackSpeedValue()) {
    const anvilBase = getMoveCooldownBase(moveKey);
    if (anvilBase !== null) return anvilBase / attackSpeed;
    if (moveKey === 'warp') return 2.8 / attackSpeed;
    if (moveKey === 'nimrod_stomp') return 4.2 / attackSpeed;
    if (moveKey === 'zip_lightning') return 5.4 / attackSpeed;
    if (moveKey === 'cowards_way') return 6 / attackSpeed;
    return 3.2 / attackSpeed;
  }

  function getSmashCooldownDuration(attackSpeed = getAttackSpeedValue()) {
    const smashKey = getEquippedMove('smash');
    const anvilBase = getMoveCooldownBase(smashKey);
    if (anvilBase !== null) return anvilBase / attackSpeed;
    return (godTimer > 0 ? 2 : ATTACKS.smash.baseCooldown) / attackSpeed;
  }

  function getMoveMaxStacks(moveKey, characterKey = player?.character || chosenCharacter) {
    const moveDef = MOVE_DEFS[moveKey] || {};
    const baseStacks = Math.max(1, Number(moveDef.maxStacks || 1));
    const overrideStacks = moveDef.stackOverrides?.[characterKey];
    return Math.max(1, Number(overrideStacks || baseStacks));
  }

  function getSlotCooldownDuration(slot, moveKey, attackSpeed = getAttackSpeedValue()) {
    if (slot === 'melee') return getMeleeCooldownDuration(moveKey, attackSpeed);
    if (slot === 'laser') return getLaserCooldownDuration(moveKey, attackSpeed);
    if (slot === 'smash') return getSmashCooldownDuration(attackSpeed);
    return getDashCooldownDuration(moveKey, attackSpeed);
  }

  function createCooldownEntry(slot, playerState = player, source = null) {
    const moveKey = playerState?.equippedMoves?.[slot] || (slot === 'dash' ? 'dash' : slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : 'crimson_smash');
    const maxCharges = getMoveMaxStacks(moveKey, playerState?.character || chosenCharacter);
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

  function createCooldownState(playerState = player, source = null) {
    const state = {};
    MOVE_SLOTS.forEach(slot => {
      state[slot] = createCooldownEntry(slot, playerState, source?.[slot]);
    });
    return state;
  }

  function spendSkillCharge(slot, rechargeTime, options = {}) {
    const state = cooldowns[slot] || createCooldownEntry(slot);
    if (state.charges <= 0) return false;
    state.charges -= 1;
    if (options.deferTimer) state.holding += 1;
    else state.timers.push(rechargeTime);
    cooldowns[slot] = state;
    updateHud();
    return true;
  }

  function queueHeldSkillRecharge(slot, rechargeTime) {
    const state = cooldowns[slot] || createCooldownEntry(slot);
    if (state.holding > 0) state.holding -= 1;
    state.timers.push(rechargeTime);
    cooldowns[slot] = state;
    updateHud();
  }

  function tickCooldowns(dt) {
    MOVE_SLOTS.forEach(slot => {
      const state = cooldowns[slot] || createCooldownEntry(slot);
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
      cooldowns[slot] = state;
    });
  }

  function getSkillCooldownInfo(slot, attackSpeed = getAttackSpeedValue()) {
    const moveKey = getEquippedMove(slot);
    const state = cooldowns[slot] || createCooldownEntry(slot);
    return {
      charges: state.charges,
      maxCharges: state.maxCharges,
      current: state.timers.length ? Math.min(...state.timers) : 0,
      max: getSlotCooldownDuration(slot, moveKey, attackSpeed),
    };
  }

  function refreshRoomShopCosts(room, difficultyKey = selectedDifficulty, floorValue = floor) {
    if (!room || room.type !== 'shop') return;
    room.shopOffers = Array.isArray(room.shopOffers) ? room.shopOffers : [];
    let itemIndex = 0;
    room.shopOffers.forEach(offer => {
      if (!offer) return;
      if (offer.type === 'item') {
        const rarity = itemRegistry.get(offer.key)?.rarity || ITEM_DEFS[offer.key]?.rarity || 'knight';
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
        const rarity = WEAPON_DEFS[offer.key]?.rarity || 'knight';
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
    const loopCrystals = Number(metaProgress.loopCrystals || 0);
    return new Set(DIFFICULTY_ORDER.filter(key => key === 'custom' || loopCrystals >= DIFFICULTY_DEFS[key].unlockLoops));
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
    if (type === 'god') return 'GOD';
    return titleCase(type);
  }

  function getEnemyLabel(type) {
    if (BOSS_TYPES.has(type)) return getBossDisplayName(type);
    if (type === 'mirror_knight') return 'Mirror Champion';
    return titleCase(type);
  }

  function getEliteEnemyLabel(enemy) {
    const baseLabel = getEnemyLabel(enemy?.type || '');
    if (!enemy?.elite || !Array.isArray(enemy.eliteTypes) || enemy.eliteTypes.length === 0) return baseLabel;
    const prefix = enemy.eliteTypes
      .map(type => ELITE_TYPE_DEFS[type]?.label || titleCase(type))
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
    if (value === 'enemy_beam') return 'Enemy Beam';
    if (value === 'god_beam') return 'GOD Beam';
    if (value === 'mirror_beam') return 'Mirror Beam';
    if (BOSS_TYPES.has(value) || value === 'mirror_knight') return getEnemyLabel(value);
    if (SPRITE_DEFS[value] || ['cult_mage', 'knave', 'sniper', 'machine_gunner', 'golem', 'summoner', 'shield_unit', 'healer', 'boss_spawner', 'laser', 'charger', 'hunter'].includes(value)) {
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
    const pool = KILLER_DEATH_QUOTES[exact] || DEFAULT_KILLER_DEATH_QUOTES;
    if (!Array.isArray(pool) || pool.length === 0) return '';
    const index = Math.floor(nextRandom('fx') * pool.length);
    return pool[index] || pool[0] || '';
  }

  function findKillerEnemyEntity(sourceKey, sourceLabel) {
    const key = String(sourceKey || '').trim().toLowerCase();
    const label = String(sourceLabel || '').trim().toLowerCase();
    if (!Array.isArray(enemies) || enemies.length === 0) return null;

    const byType = enemies.find(enemy => String(enemy?.type || '').toLowerCase() === key);
    if (byType) return byType;

    const byRivalName = enemies.find(enemy => enemy?.type === 'rival' && String(enemy?.rivalData?.name || '').trim().toLowerCase() === key);
    if (byRivalName) return byRivalName;

    const byLabel = enemies.find(enemy => String(getDamageSourceLabel(enemy?.type || '') || '').trim().toLowerCase() === label);
    if (byLabel) return byLabel;
    return null;
  }

  function speakKillerDeathQuote(sourceKeyInput = '', sourceLabelInput = '') {
    const sourceKey = sourceKeyInput || lastDamageSourceKey || '';
    const sourceLabel = sourceLabelInput || lastDamageSource || getDamageSourceLabel(sourceKey) || 'DUNGEON';
    const quote = getKillerDeathQuote(sourceKey || sourceLabel);
    if (!quote || !player) return;

    const killer = findKillerEnemyEntity(sourceKey, sourceLabel);
    if (killer) {
      sayOverEntity(killer, quote, {
        speaker: sourceLabel,
        tone: 'boss',
        holdTime: 2.1,
        offsetY: (killer.r || 16) + 32,
      });
      return;
    }

    sayAtPosition(player.x, player.y, quote, {
      speaker: sourceLabel,
      tone: 'warning',
      holdTime: 2.1,
      offsetY: 56,
    });
  }

  function captureRunItemSnapshot(playerState = player) {
    return ITEM_KEYS
      .map(key => ({
        key,
        count: Math.max(0, Number(playerState?.items?.[key] || 0)),
      }))
      .filter(item => item.count > 0)
      .map(item => ({
        ...item,
        name: itemRegistry.get(item.key)?.name || titleCase(item.key),
        rarity: itemRegistry.get(item.key)?.rarity || ITEM_DEFS[item.key]?.rarity || '',
      }));
  }

  function getItemRarityCounts(playerState = player) {
    const counts = { white: 0, purple: 0, red: 0 };
    ITEM_KEYS.forEach(key => {
      const count = Math.max(0, Number(playerState?.items?.[key] || 0));
      if (count <= 0) return;
      const rarity = String(itemRegistry.get(key)?.rarity || ITEM_DEFS[key]?.rarity || 'knight').toLowerCase();
      if (rarity === 'god' || rarity === 'red') counts.red += count;
      else if (rarity === 'wizard' || rarity === 'purple') counts.purple += count;
      else counts.white += count;
    });
    return counts;
  }

  function captureRunMoveSnapshot(playerState = player) {
    return MOVE_SLOTS.map(slot => {
      const key = playerState?.equippedMoves?.[slot] || '';
      return {
        slot,
        key,
        name: MOVE_DEFS[key]?.name || titleCase(key),
      };
    }).filter(move => move.key);
  }

  function buildRunHistoryEntry(result, extra = {}) {
    const character = getCharacterDef();
    const difficulty = normalizeDifficulty(selectedDifficulty);
    const historyItems = captureRunItemSnapshot(player);
    const totalItemStacks = historyItems.reduce((sum, item) => sum + item.count, 0);
    return {
      id: `${Date.now()}:${baseSeedStr}:${runLoopIndex}:${floor}:${result}`,
      endedAt: new Date().toISOString(),
      result,
      mode: normalizeGameMode(gameMode),
      character: character.key,
      characterName: character.name,
      difficulty,
      difficultyName: getDifficultyDef(difficulty).name,
      floor,
      loop: runLoopIndex,
      coins: Math.max(0, Number(player?.coins || 0)),
      level: Math.max(1, Number(player?.level || 1)),
      kills: Math.max(0, Number(player?.kills || 0)),
      maxHp: Math.max(1, Number(player?.maxHp || 120)),
      attackPower: Math.max(0, Number(player?.attackPower || 0)),
      attackSpeed: Math.max(0, Number(player?.attackSpeed || 1)),
      elapsedSeconds: Math.max(0, Number(gameElapsedTime || 0)),
      seed: baseSeedStr,
      roomType: currentRoom?.type || '',
      killedBy: getDamageSourceLabel(extra.killedBy || ''),
      killerKey: String(extra.killerKey || ''),
      challengeBonusCrystals: Math.max(0, Number(extra.challengeBonusCrystals || 0)),
      challengeKeys: normalizeChallengeSelection(selectedChallenges),
      challenges: normalizeChallengeSelection(selectedChallenges).map(key => CHALLENGE_DEFS[key]?.name || titleCase(key)),
      items: historyItems,
      equippedMoves: captureRunMoveSnapshot(player),
      totalItemStacks,
    };
  }

  function pushRunHistoryEntry(entry) {
    runHistory = [entry, ...normalizeRunHistory(runHistory)]
      .slice(0, RUN_HISTORY_LIMIT);
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
      return `<div class="rh-items-grid">${entry.items.map(i => `<div class="rh-item-tile"><canvas class="rh-item-icon" data-item-icon="${escapeHtml(i.key)}" width="32" height="32" aria-hidden="true"></canvas><span class="rh-item-name" style="color:${getRarityNameColor(i.rarity)}">${escapeHtml(i.name)}</span>${i.count > 1 ? `<span class="rh-item-count">×${i.count}</span>` : ''}</div>`).join('')}</div>`;
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
    if (SPRITE_DEFS[key]) return key;
    if (killerSpriteMap[key]) return killerSpriteMap[key];
    return 'hunter';
  }

  function hydrateRunHistorySprites(root = ui.runHistoryList) {
    if (!(root instanceof Element)) return;
    root.querySelectorAll('[data-run-character]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      drawSpriteToCanvas(el, el.dataset.runCharacter || 'thorn_knight', 56);
    });
    root.querySelectorAll('[data-run-killer]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      drawSpriteToCanvas(el, resolveKillerSprite(el.dataset.runKiller), el.width);
    });
    root.querySelectorAll('[data-item-icon]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      const item = itemRegistry.get(el.dataset.itemIcon) || ITEM_DEFS[el.dataset.itemIcon];
      if (item) drawItemToastIcon(el, item);
    });
    root.querySelectorAll('[data-move-icon]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      const move = MOVE_DEFS[el.dataset.moveIcon];
      if (move) drawMoveToastIcon(el, move);
    });
  }

  function refreshMenuState() {
    uiController.setMenuMeta(metaProgress.coins, metaProgress.bestFloor, metaProgress.loopCrystals || 0, saveStore.kind);
    updateCharacterSelectionUI();
    const summary = activeRun && activeRun.player && activeRun.floor
      ? `Floor ${activeRun.floor} | ${getDifficultyDef(activeRun.difficulty).name}${activeRun.challenges?.length ? ` | ${activeRun.challenges.length} challenge${activeRun.challenges.length === 1 ? '' : 's'}` : ''} | ${activeRun.player.coins || 0} run coins`
      : '';
    uiController.setRunSummary(summary);
    uiController.setRunHistory(runHistory || []);
  }

  const PHASE_LABELS = { p1: 'PLAYER 1', p2: 'PLAYER 2', p3: 'PLAYER 3', p4: 'PLAYER 4' };
  const PHASE_COLORS = { p1: 'p1', p2: 'p2', p3: 'p3', p4: 'p4' };
  const PHASE_CHAR = { p1: () => chosenCharacter, p2: () => chosenCharacter2, p3: () => chosenCharacter3, p4: () => chosenCharacter4 };

  function updateCharacterSelectionUI() {
    const phaseTag = document.getElementById('charSelectPhaseTag');
    const titleEl = document.getElementById('charSelectTitle');
    const subtitleEl = document.getElementById('charSelectSubtitle');
    const goBtn = document.getElementById('go');
    const phases = ['p1','p2','p3','p4'].slice(0, mpPlayerCount);
    const phaseIdx = phases.indexOf(charSelectPhase);
    const isLastPhase = phaseIdx === phases.length - 1;
    if (charSelectPhase && PHASE_LABELS[charSelectPhase]) {
      const label = PHASE_LABELS[charSelectPhase];
      if (phaseTag) { phaseTag.textContent = label; phaseTag.className = `charselect-phase-tag ${PHASE_COLORS[charSelectPhase]}`; phaseTag.classList.remove('hidden'); }
      if (titleEl) titleEl.textContent = `${label} — CHOOSE YOUR WARRIOR`;
      if (subtitleEl) subtitleEl.textContent = isLastPhase ? 'Last player — then enter the dungeon.' : `${label} locked. Next player picks after.`;
      if (goBtn) goBtn.textContent = isLastPhase ? 'ENTER DUNGEON' : `CONFIRM ${label} →`;
    } else {
      if (phaseTag) phaseTag.classList.add('hidden');
      if (titleEl) titleEl.textContent = 'CHOOSE YOUR WARRIOR';
      if (subtitleEl) subtitleEl.textContent = 'Pick a fighter, set the run, then enter the dungeon. Challenges live in their own shop panel.';
      if (goBtn) goBtn.textContent = 'ENTER DUNGEON';
    }
    const activeChar = charSelectPhase && PHASE_CHAR[charSelectPhase] ? PHASE_CHAR[charSelectPhase]() : chosenCharacter;
    const unlocked = new Set(metaProgress.unlockedCharacters || ['princess', 'thorn_knight', 'metao']);
    const unlockedDifficulties = getUnlockedDifficultySet();
    const unlockedChallenges = getUnlockedChallengeSet();
    const ownedChallenges = getOwnedChallengeSet();
    if (metaProgress.godsKilled > 0) unlocked.add('granialla');
    const preferredCharacter = String(metaProgress.selectedCharacter || chosenCharacter);
    if (!charSelectPhase || charSelectPhase === 'p1') {
      if (unlocked.has(preferredCharacter)) {
        chosenCharacter = preferredCharacter;
      } else if (!unlocked.has(chosenCharacter)) {
        chosenCharacter = [...unlocked][0] || 'thorn_knight';
      }
      metaProgress.selectedCharacter = chosenCharacter;
    }
    if (!unlockedDifficulties.has(selectedDifficulty)) selectedDifficulty = 'easy';
    if (selectedDifficulty === 'custom') selectedDifficulty = 'easy';
    metaProgress.selectedDifficulty = selectedDifficulty;
    selectedChallenges = normalizeChallengeSelection(selectedChallenges).filter(key => unlockedChallenges.has(key) && ownedChallenges.has(key));
    metaProgress.selectedChallenges = normalizeChallengeSelection(selectedChallenges);
    const ownedLegacy = new Set(metaProgress.unlockedLegacy || []);
    uiController.updateCharacterSelection(unlocked, activeChar);
    uiController.updateDifficultySelection(unlockedDifficulties, selectedDifficulty, metaProgress.loopCrystals || 0);
    uiController.updateChallengeSelection(unlockedChallenges, ownedChallenges, selectedChallenges, metaProgress.loopCrystals || 0, metaProgress.coins || 0);
    uiController.updateLegacySelection(ownedLegacy, metaProgress.loopCrystals || 0);
    syncCharacterUiTheme();
  }

  function setGameState(nextState) {
    if (gameStateManager) gameStateManager.setState(nextState);
    else {
      gameState = nextState;
      uiController.setState(nextState);
    }
    const isBossRush = gameMode === 'boss_rush';
    if (ui.timerFloorSlot) ui.timerFloorSlot.style.display = isBossRush ? 'none' : '';
    if (ui.timerBossSlot) ui.timerBossSlot.style.display = isBossRush ? '' : 'none';
    if (nextState !== 'pause') document.body.classList.remove('game-paused');
    if (nextState !== 'play' && ui.interactPrompt) ui.interactPrompt.classList.add('hidden');
    if (nextState !== 'play') {
      setShopPanelOpen(false);
      setInventoryPanelOpen(false);
    }
  }

  async function startGame(resume) {
    if (gameMode === 'endless') { startEndless(); return; }
    if (gameMode === 'practice') { startPractice(); return; }
    if (gameMode === 'boss_rush') { startBossRush(); return; }
    if (gameMode === 'coop') { startCoop(); return; }
    if (gameMode === 'pvp') { startPvp(); return; }
    const forceTutorialReplay = !resume && consumeReplayTutorialRequest();
    const shouldRunTutorial = gameMode === 'normal' && (!metaProgress.tutorialCompleted || forceTutorialReplay);
    setGameState('play');

    if (resume && activeRun) {
      restoreRun(activeRun);
      resetTutorialState(shouldRunTutorial);
    } else {
      baseSeedStr = ui.seed.value.trim() || createRandomSeed();
      selectedDifficulty = normalizeDifficulty(selectedDifficulty);
      selectedChallenges = normalizeChallengeSelection(metaProgress.selectedChallenges);
      runLoopIndex = 0;
      runRevivesUsed = 0;
      lastDeathEntryId = '';
      syncSeedState();
      floor = 1;
      gameElapsedTime = 0;
      achievementManager.resetRunCounters();
      invalidateRunStatCaches();
      player = createDefaultPlayer();
      if (!isMultiplayerMode()) resetMultiplayerState();
      if (gameMode === 'sandbox') {
        player.coins = Number(sandboxSettings.startingCoins || 0);
        selectedChallenges = [];
      }
      applyRunChallengeStartModifiers();
      lastDamageSource = '';
      lastDamageSourceKey = '';
      resetScene();
      generateFloor();
      resetTutorialState(shouldRunTutorial);
      persistMetaSoon();
      scheduleRunSave();
    }

    if (!loopStarted) {
      loopStarted = true;
      requestAnimationFrame(loop);
    }
  }

  function spawnMpPlayer(charKey, offsetX, offsetY) {
    const savedChosen = chosenCharacter;
    chosenCharacter = charKey;
    const p = createDefaultPlayer();
    chosenCharacter = savedChosen;
    p.x = START_X + offsetX;
    p.y = START_Y + offsetY;
    p.items = JSON.parse(JSON.stringify(player.items));
    return p;
  }

  function startCoop() {
    setGameState('play');
    baseSeedStr = ui.seed.value.trim() || createRandomSeed();
    selectedDifficulty = normalizeDifficulty(selectedDifficulty);
    selectedChallenges = [];
    runLoopIndex = 0;
    runRevivesUsed = 0;
    lastDeathEntryId = '';
    syncSeedState();
    floor = 1;
    gameElapsedTime = 0;
    achievementManager.resetRunCounters();
    invalidateRunStatCaches();
    player = createDefaultPlayer();
    player2 = mpPlayerCount >= 2 ? spawnMpPlayer(chosenCharacter2, 36, 0) : null;
    player3 = mpPlayerCount >= 3 ? spawnMpPlayer(chosenCharacter3, 0, 36) : null;
    player4 = mpPlayerCount >= 4 ? spawnMpPlayer(chosenCharacter4, 36, 36) : null;
    p1DeadInCoop = false; p2DeadInCoop = false; p3DeadInCoop = false; p4DeadInCoop = false;
    lastDamageSource = '';
    lastDamageSourceKey = '';
    resetScene();
    generateFloor();
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = player2 ? '' : 'none';
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
  }

  let pvpState = null;

  function startPvp() {
    setGameState('play');
    baseSeedStr = ui.seed.value.trim() || createRandomSeed();
    selectedDifficulty = normalizeDifficulty(selectedDifficulty);
    selectedChallenges = [];
    runLoopIndex = 0;
    runRevivesUsed = 0;
    lastDeathEntryId = '';
    syncSeedState();
    floor = 1;
    gameElapsedTime = 0;
    achievementManager.resetRunCounters();
    invalidateRunStatCaches();
    player = createDefaultPlayer();
    player.maxHp = 300; player.hp = 300;
    player2 = spawnMpPlayer(chosenCharacter2 || Object.keys(CHARACTER_DEFS).find(k => k !== chosenCharacter) || chosenCharacter, 80, 0);
    player2.maxHp = 300; player2.hp = 300;
    if (mpPlayerCount >= 3) { player3 = spawnMpPlayer(chosenCharacter3 || chosenCharacter, -80, 60); player3.maxHp = 300; player3.hp = 300; }
    if (mpPlayerCount >= 4) { player4 = spawnMpPlayer(chosenCharacter4 || chosenCharacter, 0, 60); player4.maxHp = 300; player4.hp = 300; }
    p1DeadInCoop = false; p2DeadInCoop = false; p3DeadInCoop = false; p4DeadInCoop = false;
    player2.x = START_X + 80;
    player2.y = START_Y;
    player2.items = JSON.parse(JSON.stringify(player.items));
    pvpState = { p1Kills: 0, p2Kills: 0, killsToWin: 3, respawnTimer: null };
    lastDamageSource = '';
    lastDamageSourceKey = '';
    resetScene();
    generateFloor();
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = '';
  }

  function startEndlessRoom() {
    rooms = [];
    const room = createRoomRecord({ x: 4, y: 4 }, { type: 'combat', doors: { n: false, s: false, e: false, w: false }, cleared: false });
    decorateRoomData(room);
    rooms.push(room);
    currentRoom = room;
    enterRoom(room);
  }

  function startEndless() {
    setGameState('play');
    baseSeedStr = ui.seed.value.trim() || createRandomSeed();
    selectedDifficulty = normalizeDifficulty(selectedDifficulty);
    selectedChallenges = [];
    runLoopIndex = 0;
    runRevivesUsed = 0;
    lastDeathEntryId = '';
    syncSeedState();
    floor = 1;
    gameElapsedTime = 0;
    achievementManager.resetRunCounters();
    endlessWave = 0;
    endlessWaveActive = false;
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
    player = createDefaultPlayer();
    lastDamageSource = '';
    lastDamageSourceKey = '';
    resetScene();
    resetRngStreams();
    startEndlessRoom();
    if (ui.endlessWaveNum) ui.endlessWaveNum.textContent = endlessWave;
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
  }

  function startPractice() {
    setGameState('play');
    baseSeedStr = createRandomSeed();
    selectedDifficulty = 'easy';
    selectedChallenges = [];
    runLoopIndex = 0;
    runRevivesUsed = 0;
    lastDeathEntryId = '';
    syncSeedState();
    floor = 5;
    gameElapsedTime = 0;
    achievementManager.resetRunCounters();
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
    player = createDefaultPlayer();
    player.maxHp = 1000;
    player.hp = player.maxHp;
    lastDamageSource = '';
    lastDamageSourceKey = '';
    resetScene();
    resetRngStreams();
    rooms = [];
    const room = createRoomRecord({ x: 4, y: 4 }, { type: 'combat', doors: { n: false, s: false, e: false, w: false }, cleared: true });
    decorateRoomData(room);
    rooms.push(room);
    currentRoom = room;
    player.x = START_X;
    player.y = START_Y;
    syncPracticeMaxHpControls();
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
  }

  const BOSS_RUSH_ORDER = ['queen_cult', 'bulk_golem', 'artificer_knave', 'god'];

  function startBossRush() {
    setGameState('play');
    baseSeedStr = createRandomSeed();
    selectedDifficulty = normalizeDifficulty(selectedDifficulty);
    selectedChallenges = [];
    runLoopIndex = 0;
    runRevivesUsed = 0;
    lastDeathEntryId = '';
    syncSeedState();
    floor = 5;
    gameElapsedTime = 0;
    achievementManager.resetRunCounters();
    bossRushStage = 0;
    bossRushActive = false;
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
    player = createDefaultPlayer();
    lastDamageSource = '';
    lastDamageSourceKey = '';
    resetScene();
    resetRngStreams();
    rooms = [];
    const room = createRoomRecord({ x: 4, y: 4 }, { type: 'combat', doors: { n: false, s: false, e: false, w: false }, cleared: false });
    decorateRoomData(room);
    rooms.push(room);
    currentRoom = room;
    player.x = START_X;
    player.y = START_Y;
    // Grant 3 random starting items
    const bossRushStartRandom = createScopedRandom('boss-rush:starting-items');
    for (let i = 0; i < 3; i++) {
      const key = rollItemDrop({ elite: i === 2, random: bossRushStartRandom });
      if (key) collectItem(key);
    }
    addCoins(120);
    if (ui.bossRushStageNum) ui.bossRushStageNum.textContent = 1;
    if (ui.bossRushStageNum2) ui.bossRushStageNum2.textContent = 1;
    // Spawn first boss immediately
    spawnBossRushBoss();
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
  }

  function spawnBossRushBoss() {
    const bossType = BOSS_RUSH_ORDER[bossRushStage];
    if (!bossType) return;
    bossRushActive = true;
    currentRoom.cleared = false;
    const safeSpawn = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2 - 40, 15);
    if (!safeSpawn) return;
    let boss;
    if (bossType === 'artificer_knave') {
      // Step 1: Spawn as a regular knave
      boss = spawnEnemy('knave', safeSpawn.x, safeSpawn.y, false);
      boss.isTransforming = true;
      // Visual cue: show particles or text
      particles.push({ x: boss.x, y: boss.y - 40, life: 1.2, text: '???', c: '#ffd27d' });
      // After a short delay, transform into artificer_knave
      setTimeout(() => {
        if (!boss || !enemies.includes(boss)) return;
        // --- Transformation Animation ---
        // 1. Flash effect
        for (let i = 0; i < 8; i++) {
          setTimeout(() => {
            particles.push({ x: boss.x, y: boss.y, life: 0.18, ring: 32 + i * 4, c: i % 2 === 0 ? '#ffd27d' : '#fffbe0' });
          }, i * 40);
        }
        // 2. Scale up and down (squash/stretch)
        boss.transformAnimT = 0.36; // duration in seconds
        const animInterval = setInterval(() => {
          if (!boss || boss.transformAnimT <= 0) { clearInterval(animInterval); return; }
          boss.transformAnimT -= 0.04;
        }, 40);
        // 3. Transformation text
        particles.push({ x: boss.x, y: boss.y - 40, life: 1.6, text: 'TRANSFORM!', c: '#ffd27d' });
        // 4. Play sound if available
        if (window.playSound) playSound('transform');
        // 5. After a short moment, actually transform
        setTimeout(() => {
          if (!boss || !enemies.includes(boss)) return;
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
            const playedCutscene = tryPlayKnaveKnightCutscene(boss, 'artificer_knave');
            const line = BOSS_OPENING_DIALOGUE['artificer_knave'];
            if (!playedCutscene && boss && line) sayOverEntity(boss, line);
          }, 400); // Wait 0.4s after animation for clarity
        }, 420); // transformation after animation
      }, 1200); // 1.2 seconds delay
    } else {
      boss = spawnEnemy(bossType, safeSpawn.x, safeSpawn.y, false);
      const playedCutscene = tryPlayKnaveKnightCutscene(boss, bossType);
      const line = BOSS_OPENING_DIALOGUE[bossType];
      if (!playedCutscene && boss && line) sayOverEntity(boss, line);
      if (bossType === 'god') playGodDialogue(1);
    }
    particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 50, life: 1.4, text: `BOSS ${bossRushStage + 1}: ${getBossDisplayName(bossType).toUpperCase()}`, c: '#ff8b8b' });
  }

  function onBossRushBossDefeated() {
    bossRushActive = false;
    bossRushStage += 1;
    if (ui.bossRushStageNum) ui.bossRushStageNum.textContent = Math.min(bossRushStage + 1, 4);
    if (ui.bossRushStageNum2) ui.bossRushStageNum2.textContent = Math.min(bossRushStage + 1, 4);
    if (bossRushStage >= BOSS_RUSH_ORDER.length) {
      win();
      return;
    }
    const cx = ROOM_W / 2;
    const cy = ROOM_H / 2;
    const rewardRandom = createScopedRandom(`boss-rush:stage:${bossRushStage}:reward`);
    dropCoins(cx, cy - 20, 80 + bossRushStage * 30);
    pickups.push({ x: cx - 60, y: cy, type: 'item', key: rollItemDrop({ elite: true, random: rewardRandom }) });
    pickups.push({ x: cx + 60, y: cy, type: 'potion' });
    grantXp(40 + bossRushStage * 20);
    const nextName = getBossDisplayName(BOSS_RUSH_ORDER[bossRushStage]).toUpperCase();
    particles.push({ x: cx, y: cy - 40, life: 1.6, text: 'BOSS DEFEATED!', c: '#78d7ff' });
    setTimeout(() => {
      if (gameMode !== 'boss_rush' || gameState !== 'play') return;
      particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 50, life: 1.2, text: `NEXT: ${nextName}`, c: '#ffb347' });
    }, 1500);
    setTimeout(() => {
      if (gameMode !== 'boss_rush' || gameState !== 'play') return;
      spawnBossRushBoss();
    }, 4000);
  }

  function clampPracticeMaxHp(value) {
    return clamp(Math.round(Number(value) || 1000), 1, 10000);
  }

  function syncPracticeMaxHpControls() {
    if (!ui.practiceMaxHpSlider && !ui.practiceMaxHpNum) return;
    const value = clampPracticeMaxHp(player?.maxHp || 1000);
    if (ui.practiceMaxHpSlider) ui.practiceMaxHpSlider.value = String(value);
    if (ui.practiceMaxHpNum) ui.practiceMaxHpNum.value = String(value);
  }

  function setPracticeMaxHp(value) {
    if (!player) return;
    const nextMaxHp = clampPracticeMaxHp(value);
    const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1;
    player.maxHp = nextMaxHp;
    player.hp = clamp(Math.round(nextMaxHp * hpRatio), 1, nextMaxHp);
    syncPracticeMaxHpControls();
    updateHud();
  }

  function buildPracticeEnemyGrid() {
    if (!ui.practiceEnemyGrid) return;
    const BOSS_TYPES_SET = new Set(['queen_cult', 'bulk_golem', 'artificer_knave', 'god']);
    const allTypes = [
      'hunter', 'charger', 'laser', 'knave', 'sniper', 'machine_gunner',
      'golem', 'cult_mage', 'cult_follower', 'summoner', 'shield_unit', 'healer', 'boss_spawner',
      'queen_cult', 'bulk_golem', 'artificer_knave', 'god', 'mirror_knight',
    ];
    ui.practiceEnemyGrid.innerHTML = allTypes.map(type => {
      const isBoss = BOSS_TYPES_SET.has(type);
      const label = type.replace(/_/g, ' ');
      return `<button class="practice-spawn-btn${isBoss ? ' is-boss' : ''}" data-enemy="${type}">${label}</button>`;
    }).join('');
    ui.practiceEnemyGrid.addEventListener('click', event => {
      const btn = event.target instanceof Element ? event.target.closest('[data-enemy]') : null;
      if (!btn || !player) return;
      const type = btn.dataset.enemy;
      const elite = ui.practiceEliteToggle?.checked ?? false;
      const angle = nextRandom('encounter') * Math.PI * 2;
      const dist = 160 + nextRandom('encounter') * 120;
      const x = clamp(player.x + Math.cos(angle) * dist, 80, ROOM_W - 80);
      const y = clamp(player.y + Math.sin(angle) * dist, 80, ROOM_H - 80);
      spawnEnemy(type, x, y, elite);
    });
  }

  function resetScene() {
    enemies = [];
    deadBodies = [];
    particles = [];
    playerDeathAnim = null;
    endlessWave = 0;
    endlessWaveActive = false;
    bossRushStage = 0;
    bossRushActive = false;
    projectiles = [];
    chests = [];
    pickups = [];
    destructibles = [];
    hazards = [];
    shopOffers = [];
    structures = [];
    decorations = [];
    cooldowns = createCooldownState(player);
    laserActive = false;
    laserTime = 0;
    laserTick = 0;
    laserMode = 'beam';
    laserAngle = 0;
    laserSweepSpeed = 0;
    turtleWaveHpTimer = 0;
    dashKeyLatch = false;
    godTimer = 0;
    camera = { x: 0, y: 0 };
    camera2 = { x: 0, y: 0 };
    camera3 = { x: 0, y: 0 };
    camera4 = { x: 0, y: 0 };
    shake = 0;
    shakeT = 0;
    fade = 0;
    fading = 0;
    nextDoor = null;
    floorSkipPending = 0;
    teleportKeyLatch = false;
    shopKeyLatch = false;
    invKeyLatch = false;
    anvilKeyLatch = false;
    ladderUseKeyLatch = false;
    activeShopTab = 'items';
    draggingMoveKey = '';
    weaponBurstQueue = [];
    rivals = [];
    monsterRoamTimer = 0;
    knaveKnightCutscenePlayed = false;
    queenMetaoCutscenePlayed = false;
    wizardPawSelection = null;
    setWizardPawModalOpen(false);
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    mouse.down = false;
    mouse.right = false;
    lastDamageSource = '';
    lastDamageSourceKey = '';
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
    gameMode = normalizeGameMode(snapshot.mode || gameMode);
    baseSeedStr = snapshot.baseSeedStr || snapshot.seedStr || createRandomSeed();
    lastDamageSource = '';
    lastDamageSourceKey = '';
    runLoopIndex = Number(snapshot.runLoopIndex || 0);
    runRevivesUsed = Math.max(0, Number(snapshot.runRevivesUsed || 0));
    lastDeathEntryId = '';
    syncSeedState();
    floor = snapshot.floor;
    selectedDifficulty = normalizeDifficulty(snapshot.difficulty);
    selectedChallenges = normalizeChallengeSelection(snapshot.challenges);
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
    resetRngStreams(snapshot.rngState);
    rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms : [];
    currentRoom = rooms.find(room => room.gx === snapshot.currentRoom?.gx && room.gy === snapshot.currentRoom?.gy) || rooms[0] || null;
    invalidateRunStatCaches();
    player = migratePlayerData(snapshot.player);
    if (isMultiplayerMode()) {
      player2 = snapshot.player2 ? migratePlayerData(snapshot.player2) : null;
      player3 = snapshot.player3 ? migratePlayerData(snapshot.player3) : null;
      player4 = snapshot.player4 ? migratePlayerData(snapshot.player4) : null;
      p1DeadInCoop = !!snapshot.p1DeadInCoop;
      p2DeadInCoop = !!snapshot.p2DeadInCoop;
      p3DeadInCoop = !!snapshot.p3DeadInCoop;
      p4DeadInCoop = !!snapshot.p4DeadInCoop;
      pvpState = snapshot.pvpState && typeof snapshot.pvpState === 'object' ? { ...snapshot.pvpState, respawnTimer: null } : null;
      const p2Row = document.getElementById('p2HpRow');
      if (p2Row) p2Row.style.display = player2 ? '' : 'none';
      if (!player2) resetMultiplayerState();
    } else {
      resetMultiplayerState();
    }
    enemies = Array.isArray(snapshot.enemies) ? snapshot.enemies.map(migrateEnemyState) : [];
    deadBodies = Array.isArray(snapshot.deadBodies) ? snapshot.deadBodies : [];
    particles = [];
    projectiles = snapshot.projectiles || [];
    chests = snapshot.chests || [];
    pickups = sanitizePickupList(snapshot.pickups);
    destructibles = snapshot.destructibles || currentRoom?.destructibles || [];
    hazards = snapshot.hazards || currentRoom?.hazards || [];
    shopOffers = snapshot.shopOffers || currentRoom?.shopOffers || [];
    structures = snapshot.structures || currentRoom?.structures || [];
    decorations = snapshot.decorations || currentRoom?.decorations || [];
    if (currentRoom) {
      currentRoom.enemies = Array.isArray(currentRoom.enemies) ? currentRoom.enemies.map(migrateEnemyState) : enemies;
      currentRoom.deadBodies = Array.isArray(currentRoom.deadBodies) ? currentRoom.deadBodies : deadBodies;
      currentRoom.projectiles = Array.isArray(currentRoom.projectiles) ? currentRoom.projectiles : projectiles;
      currentRoom.chests = Array.isArray(currentRoom.chests) ? currentRoom.chests : chests;
      currentRoom.pickups = sanitizePickupList(currentRoom.pickups);
      currentRoom.destructibles = Array.isArray(currentRoom.destructibles) ? currentRoom.destructibles : destructibles;
      currentRoom.hazards = Array.isArray(currentRoom.hazards) ? currentRoom.hazards : hazards;
      currentRoom.shopOffers = Array.isArray(currentRoom.shopOffers) ? currentRoom.shopOffers : shopOffers;
      currentRoom.shopWeaponOffers = Array.isArray(currentRoom.shopWeaponOffers) ? currentRoom.shopWeaponOffers : [];
      currentRoom.structures = Array.isArray(currentRoom.structures) ? currentRoom.structures : structures;
      currentRoom.decorations = Array.isArray(currentRoom.decorations) ? currentRoom.decorations : decorations;
      refreshRoomShopCosts(currentRoom, selectedDifficulty, floor);
      enemies = currentRoom.enemies;
      deadBodies = currentRoom.deadBodies;
      projectiles = currentRoom.projectiles;
      chests = currentRoom.chests;
      pickups = currentRoom.pickups;
      destructibles = currentRoom.destructibles;
      hazards = currentRoom.hazards;
      shopOffers = currentRoom.shopOffers;
      structures = currentRoom.structures;
      decorations = currentRoom.decorations;
    }
    cooldowns = createCooldownState(player, snapshot.cooldowns || {});
    laserActive = !!snapshot.laserActive;
    laserTime = snapshot.laserTime || 0;
    laserTick = snapshot.laserTick || 0;
    laserMode = snapshot.laserMode || 'beam';
    laserAngle = Number(snapshot.laserAngle || 0);
    laserSweepSpeed = Number(snapshot.laserSweepSpeed || 0);
    turtleWaveHpTimer = Number(snapshot.turtleWaveHpTimer || 0);
    godTimer = snapshot.godTimer || 0;
    gameElapsedTime = snapshot.gameElapsedTime || 0;
    camera = snapshot.camera || { x: 0, y: 0 };
    shake = 0;
    shakeT = 0;
    fade = 0;
    fading = 0;
    nextDoor = null;
    floorSkipPending = 0;
    teleportKeyLatch = false;
    dashKeyLatch = false;
    shopKeyLatch = false;
    invKeyLatch = false;
    anvilKeyLatch = false;
    ladderUseKeyLatch = false;
    activeShopTab = 'items';
    draggingMoveKey = '';
    weaponBurstQueue = [];
    monsterRoamTimer = Number(snapshot.monsterRoamTimer || 0);
    knaveKnightCutscenePlayed = !!snapshot.knaveKnightCutscenePlayed;
    queenMetaoCutscenePlayed = !!snapshot.queenMetaoCutscenePlayed;
    restoreRivals(snapshot.rivals);
    wizardPawSelection = null;
    setWizardPawModalOpen(false);
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    updateItemUI();
    injectRivalsToCurrentRoom();
    updateObjective();
    updateHud();
    persistMetaSoon();
  }
