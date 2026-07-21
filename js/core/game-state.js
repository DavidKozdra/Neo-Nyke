// game-state.js — Game state management, meta progress, run logic.

export function pauseGame() {
    document.body.classList.add('game-paused');
    setGameState('pause');
    // Don't leave a controller motor buzzing while the sim is frozen.
    Neo.stopRumble?.();
  }

export function resumeGame() {
    document.body.classList.remove('game-paused');
    setGameState('play');
    // Returning to play is a safe moment to surface an owed Wizard's Paw modal.
    // Batteries are NOT auto-reopened here: resume often follows closing the
    // inventory, and force-reopening it would trap the player — the HUD alert
    // chip lets them reopen the battery prompt on demand instead.
    Neo.requestPanelItemSelection?.({ suppressBatteryOpen: true });
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
      bestEndlessWave: 0,
      unlockedItems: [],
      unlockedCharacters: ['princess', 'thorn_knight', 'metao'],
      unlockedChallenges: [],
      selectedDifficulty: 'medium',
      selectedChallenges: [],
      selectedCharacter: 'thorn_knight',
      characterKitChoices: {},
      customCharacters: normalizeCustomCharactersSettings(),
      godsKilled: 0,
      mooggyDefeats: 0,
      bowmanBaneDefeats: 0,
      loopCrystals: 0,
      unlockedLegacy: [],
      tutorialCompleted: false,
      tutorialVersion: 0,
      lastSeenAt: 0,
      tutorialButtonLastOfferedAt: 0,
      seenTips: {},
      storyScenesSeen: [],
      storySkipTutorial: false,
      sandboxSettings: { ...Neo.SANDBOX_DEFAULT_SETTINGS },
    };
  }

  const CUSTOM_CHARACTER_PREFIX = 'custom_character_';
  const CUSTOM_CHARACTER_DEFAULT = {
    name: 'Custom',
    active: true,
    moveLoadout: { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' },
    weaponLoadout: { weapon: 'thorns_bleed_blade' },
    starterRelics: [],
    damageMultiplier: 1,
    hpMultiplier: 1,
  };
  // Custom characters can be tuned 50%-150% on damage/HP so a saved build can be
  // played fragile-and-strong or tanky-and-weak instead of always the flat 1/1
  // custom_character default.
  const CUSTOM_CHARACTER_STAT_MIN = 0.5;
  const CUSTOM_CHARACTER_STAT_MAX = 1.5;

  function clampCustomCharacterStatMultiplier(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.round(Math.min(CUSTOM_CHARACTER_STAT_MAX, Math.max(CUSTOM_CHARACTER_STAT_MIN, parsed)) * 100) / 100;
  }

  function isCustomCharacterKey(key) {
    return String(key || '').startsWith(CUSTOM_CHARACTER_PREFIX);
  }

  function getCustomCharacterId(characterKey) {
    return isCustomCharacterKey(characterKey) ? String(characterKey).slice(CUSTOM_CHARACTER_PREFIX.length) : '';
  }

  function makeCustomCharacterKey(id) {
    return `${CUSTOM_CHARACTER_PREFIX}${String(id || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
  }

  function normalizeCustomCharacterSettings(input, id = '') {
    const hasSource = !!(input && typeof input === 'object');
    const source = hasSource ? input : {};
    const safeId = String(source.id || id || Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]/g, '') || Date.now().toString(36);
    const rawName = String(source.name || CUSTOM_CHARACTER_DEFAULT.name).trim();
    const name = rawName.slice(0, 24) || CUSTOM_CHARACTER_DEFAULT.name;
    const sourceMoves = source.moveLoadout && typeof source.moveLoadout === 'object' ? source.moveLoadout : {};
    const moveLoadout = {};
    for (const slot of ['melee', 'laser', 'smash', 'dash']) {
      const fallback = CUSTOM_CHARACTER_DEFAULT.moveLoadout[slot];
      const key = String(sourceMoves[slot] || fallback);
      moveLoadout[slot] = Neo.MOVE_DEFS?.[key]?.slot === slot ? key : fallback;
    }
    const sourceWeapons = source.weaponLoadout && typeof source.weaponLoadout === 'object' ? source.weaponLoadout : {};
    const weaponKey = String(sourceWeapons.weapon || CUSTOM_CHARACTER_DEFAULT.weaponLoadout.weapon);
    const starterRelics = Array.isArray(source.starterRelics)
      ? source.starterRelics.filter(key => Neo.ITEM_KEYS?.includes?.(key)).slice(0, 2)
      : [];
    return {
      id: safeId,
      name,
      active: source.active === undefined ? !!hasSource : !!source.active,
      moveLoadout,
      weaponLoadout: {
        weapon: Neo.WEAPON_DEFS?.[weaponKey] ? weaponKey : CUSTOM_CHARACTER_DEFAULT.weaponLoadout.weapon,
      },
      starterRelics,
      damageMultiplier: clampCustomCharacterStatMultiplier(source.damageMultiplier, CUSTOM_CHARACTER_DEFAULT.damageMultiplier),
      hpMultiplier: clampCustomCharacterStatMultiplier(source.hpMultiplier, CUSTOM_CHARACTER_DEFAULT.hpMultiplier),
    };
  }

  function normalizeCustomCharactersSettings(input) {
    const source = input && typeof input === 'object' ? input : null;
    const entries = [];
    if (Array.isArray(source)) {
      source.forEach((entry, index) => {
        const normalized = normalizeCustomCharacterSettings(entry, entry?.id || `saved_${index + 1}`);
        if (normalized.active) entries.push(normalized);
      });
    } else if (source && typeof source === 'object') {
      Object.entries(source).forEach(([key, entry]) => {
        const id = getCustomCharacterId(key) || key;
        const normalized = normalizeCustomCharacterSettings(entry, id);
        if (normalized.active) entries.push(normalized);
      });
    }
    const seen = new Set();
    return entries.filter(entry => {
      if (!entry.id || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  }

  function getCustomCharacterSettings(characterKey = Neo.chosenCharacter) {
    const id = getCustomCharacterId(characterKey);
    const normalizedList = normalizeCustomCharactersSettings(Neo.metaProgress?.customCharacters);
    if (Neo.metaProgress) Neo.metaProgress.customCharacters = normalizedList;
    return normalizedList.find(entry => entry.id === id) || normalizeCustomCharacterSettings({ id, active: false }, id || 'draft');
  }

  function getCustomCharacterKeys() {
    return normalizeCustomCharactersSettings(Neo.metaProgress?.customCharacters).map(entry => makeCustomCharacterKey(entry.id));
  }

  function createCustomCharacter() {
    if (!Neo.metaProgress) return '';
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const custom = normalizeCustomCharacterSettings({ id, name: 'Custom', active: true }, id);
    const list = normalizeCustomCharactersSettings(Neo.metaProgress.customCharacters);
    list.push(custom);
    Neo.metaProgress.customCharacters = list;
    Neo.persistMetaSoon?.();
    return makeCustomCharacterKey(id);
  }

  function removeCustomCharacter(characterKey) {
    if (!Neo.metaProgress || !isCustomCharacterKey(characterKey)) return;
    const id = getCustomCharacterId(characterKey);
    Neo.metaProgress.customCharacters = normalizeCustomCharactersSettings(Neo.metaProgress.customCharacters)
      .filter(entry => entry.id !== id);
    if (Neo.chosenCharacter === characterKey) {
      Neo.chosenCharacter = 'thorn_knight';
      Neo.metaProgress.selectedCharacter = Neo.chosenCharacter;
    }
    Neo.persistMetaSoon?.();
  }

  function getCharacterSpriteKey(characterKey) {
    return isCustomCharacterKey(characterKey) ? 'thorn_knight' : characterKey;
  }

  function normalizeSandboxSettings(input) {
    const source = input && typeof input === 'object' ? input : {};
    const sourceAllowedItems = Array.isArray(source.allowedItems)
      ? source.allowedItems.map(key => key === 'double_dose' ? 'drink_master' : key)
      : null;
    const allowedEnemies = Array.isArray(source.allowedEnemies)
      ? Neo.SANDBOX_ENEMY_TYPES.filter(type => source.allowedEnemies.includes(type))
      : Neo.SANDBOX_ENEMY_TYPES.slice();
    const allowedItems = sourceAllowedItems
      ? Neo.ITEM_KEYS.filter(key => sourceAllowedItems.includes(key))
      : Neo.ITEM_KEYS.slice();
    const legacyPerItem = Math.max(1, Math.min(99, Math.round(Number(source.startingItemCount) || 1)));
    const startingItems = {};
    if (Array.isArray(source.startingItems)) {
      for (const savedKey of source.startingItems) {
        const key = savedKey === 'double_dose' ? 'drink_master' : savedKey;
        if (Neo.ITEM_KEYS.includes(key)) startingItems[key] = legacyPerItem;
      }
    } else if (source.startingItems && typeof source.startingItems === 'object') {
      for (const key of Neo.ITEM_KEYS) {
        const legacyCount = key === 'drink_master' ? Number(source.startingItems.double_dose || 0) : 0;
        const n = Math.round((Number(source.startingItems[key]) || 0) + legacyCount);
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
    const weaponSource = source.weaponLoadout && typeof source.weaponLoadout === 'object' ? source.weaponLoadout : {};
    const weaponKey = String(weaponSource.weapon || '');
    // '' = use the character default; otherwise the weapon must exist.
    const weaponLoadout = { weapon: Neo.WEAPON_DEFS?.[weaponKey] ? weaponKey : '' };
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
      weaponLoadout,
      allowedEnemies: allowedEnemies.length ? allowedEnemies : Neo.SANDBOX_ENEMY_TYPES.slice(0, 1),
      allowedItems: allowedItems.length ? allowedItems : Neo.ITEM_KEYS.slice(),
      startingItems,
    };
  }

  function isSandboxRunActive() {
    return Neo.gameMode === 'sandbox';
  }

  // Coerces a saved/partial rival-curse blob into the canonical shape, so old
  // saves (without the field) and corrupt values land on safe defaults.
  function normalizeRivalCurses(input) {
    const src = input && typeof input === 'object' ? input : {};
    return {
      obscureMap: !!src.obscureMap,
      lowerCombat: !!src.lowerCombat,
      reducePotions: !!src.reducePotions,
      gellehTurrets: Math.max(0, Math.round(Number(src.gellehTurrets || 0))),
    };
  }

  function getActiveSandboxSettings() {
    return isSandboxRunActive() ? Neo.sandboxSettings : null;
  }

  // Applies sandbox loadout/level/unlock settings to a freshly created player.
  function applySandboxPlayerSetup(playerData) {
    if (!playerData) return;
    const settings = Neo.sandboxSettings || {};
    const startingItems = settings.startingItems && typeof settings.startingItems === 'object'
      ? settings.startingItems
      : {};

    // Practice items are inserted directly into inventory, bypassing collectItem().
    // Mirror the acquisition queues for items whose effect is resolved in a UI.
    playerData.wizardPawPendingCount = 0;
    playerData.extraBatteryPendingCount = 0;
    playerData.scrollPendingQueue = [];
    Object.entries(startingItems).forEach(([key, rawCount]) => {
      const count = Math.max(0, Math.floor(Number(rawCount) || 0));
      if (count <= 0) return;
      const item = Neo.itemRegistry?.get?.(key) || Neo.ITEM_DEFS?.[key] || Neo.SCROLL_DEFS?.[key];
      if (item?.opensUi === 'wizardPaw') playerData.wizardPawPendingCount += count;
      else if (item?.opensUi === 'extraBattery') playerData.extraBatteryPendingCount += count;
      else if (item?.opensUi === 'scrollControl') {
        for (let index = 0; index < count; index += 1) playerData.scrollPendingQueue.push(key);
      }
    });

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

    // Override the starting weapon (empty string keeps the character default).
    const weaponLoadout = settings.weaponLoadout && typeof settings.weaponLoadout === 'object' ? settings.weaponLoadout : {};
    const weaponKey = String(weaponLoadout.weapon || '');
    if (weaponKey && Neo.WEAPON_DEFS[weaponKey]) {
      playerData.ownedWeapons = playerData.ownedWeapons || {};
      playerData.ownedWeapons[weaponKey] = true;
      playerData.equippedWeapon = weaponKey;
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
        // Fold in any milestone stat bump for the level just crossed, so a
        // starting-level run matches one that leveled there naturally. Charge
        // and move-speed milestones are read live from the level, no write needed.
        const stat = Neo.getLevelMilestone?.(playerData.level, playerData.character)?.stat;
        if (stat) {
          playerData.maxHp += Number(stat.maxHp || 0);
          playerData.attackPower += Number(stat.attackPower || 0);
          playerData.attackSpeed += Number(stat.attackSpeed || 0);
        }
      }
      playerData.hp = playerData.maxHp;
    }
  }

  // Fixed seed for the first-run / replay tutorial so the layout, the forced
  // relic, and the ladder room are reproducible for every new player.
  const TUTORIAL_SEED = 'NEONYKE-TUTORIAL-01';
  // Beginner-friendly relic force-spawned for the tutorial relic step. Gold Vac
  // is common-tier, owned by no character at start, and its effect (auto-collect
  // pickups, double coins) is immediately visible — a good first "what relics do".
  const TUTORIAL_RELIC_KEY = 'gold_vac';
  const STORY_TUTORIAL_SKIP_ITEM_KEYS = Object.freeze([
    'gold_vac', 'attack_servo', 'pew_pew_box', 'tough_bandaid', 'crit_charm',
  ]);

  function createDefaultTutorialState() {
    return Neo.tutorialController?.normalizeState?.(null, false) || {
      version: Number(Neo.TUTORIAL_VERSION || 2),
      active: false,
      step: 'welcome',
      completed: {},
      movedFor: 0,
      statusWatchedFor: 0,
      dummySpawned: false,
      relicSpawned: false,
      resourcesGranted: false,
      trainingRoomKey: '',
      treasureRoomKey: '',
      shopRoomKey: '',
      forgeRoomKey: '',
      challengeRoomKey: '',
      ladderRoomKey: '',
      secretRoomKey: '',
      seenScenes: {},
      lastCelebratedStep: '',
    };
  }

  function getCharacterStartingItems(characterKey) {
    const items = {};
    if (characterKey === 'thorn_knight') {
      items.neo_knife = 1;
      items.tooth_of_thorn = 2;
      items.tough_bandaid = 1;
    }
    if (characterKey === 'mooggy') {
      items.hemes_scarf = 1;
      items.mooggy_zoomies = 1;
      items.churu_stick = 1;
    }
    if (characterKey === 'princess') items.princes_glasses = 1;
    if (characterKey === 'metao') items.mateos_bag = 1;
    if (characterKey === 'gelleh') items.zap_to_extreme = 1;
    if (characterKey === 'turtle_boy') {
      // Turtle Boy starts with shell defense and dragon orb; his red stick and
      // turtle-wave laser come from his default weapon/move kit, not the inventory.
      items.turtle_shell = 1;
      items.dragon_orb = 1;
    }
    if (characterKey === 'sarge') {
      // Sarge's Hammer god item is his default weapon; copper penny rounds out his
      // starting kit so his electric hammer hits land a little harder out of the gate.
      items.copper_penny = 1;
    }
    return items;
  }

  function resetTutorialState(active = false) {
    Neo.tutorialState = createDefaultTutorialState();
    Neo.tutorialState.active = !!active;
  }

  function isTutorialRun() {
    return !!Neo.tutorialState?.active
      && (Neo.gameMode === 'normal' || Neo.gameMode === 'story')
      && Number(Neo.floor || 1) === 1;
  }

  function grantTutorialResources() {
    if (!isTutorialRun() || !Neo.player || Neo.tutorialState.resourcesGranted) return;
    Neo.player.coins = Math.max(Number(Neo.player.coins || 0), 60);
    if (!Neo.player.items || typeof Neo.player.items !== 'object') Neo.player.items = {};
    Neo.player.items[Neo.FORGE_VOUCHER_KEY || 'forge_voucher'] = Math.max(
      1,
      Number(Neo.player.items[Neo.FORGE_VOUCHER_KEY || 'forge_voucher'] || 0),
    );
    grantTutorialTeachingMoves();
    grantTutorialTeachingTool();
    Neo.tutorialState.resourcesGranted = true;
  }

  function grantStoryTutorialSkipPackage() {
    if (Neo.gameMode !== 'story' || !Neo.player || !Neo.storyState) return false;
    if (!Neo.player.items || typeof Neo.player.items !== 'object') Neo.player.items = {};
    STORY_TUTORIAL_SKIP_ITEM_KEYS.forEach(key => {
      if (Neo.ITEM_DEFS?.[key]) Neo.player.items[key] = Math.max(1, Number(Neo.player.items[key] || 0));
    });
    const voucherKey = Neo.FORGE_VOUCHER_KEY || 'forge_voucher';
    Neo.player.items[voucherKey] = Math.max(1, Number(Neo.player.items[voucherKey] || 0));
    Neo.player.coins = Math.max(60, Number(Neo.player.coins || 0));
    grantTutorialTeachingMoves();
    Neo.syncEquipmentSlotsFromInventory?.();
    Neo.storyState.choices.skippedTutorial = true;
    Neo.storyState.completedScenes.tutorial = true;
    Neo.storyState.rewards.tutorialSkipPackage = true;
    Neo.tutorialState.resourcesGranted = true;
    Neo.markInventoryPanelDirty?.();
    return true;
  }

  // Prep the player's laser slot so two later lessons can be fully interactive:
  //  - Status lesson: equip a status-applying laser (prefer blood_beam, which
  //    bleeds) so firing the ranged attack on the dummy reliably applies a
  //    status. Falls back to the equipped default if no status laser is legal.
  //  - Moves lesson: also own a *different* spare laser move so there is
  //    something distinct to swap to. Idempotent via the equipped/owned checks.
  function grantTutorialTeachingMoves() {
    const player = Neo.player;
    if (!player || !Neo.MOVE_DEFS) return;
    if (!player.ownedMoves || typeof player.ownedMoves !== 'object') player.ownedMoves = {};
    if (!player.equippedMoves || typeof player.equippedMoves !== 'object') player.equippedMoves = {};
    const allowed = key => Neo.MOVE_DEFS[key]
      && Neo.MOVE_DEFS[key].slot === 'laser'
      && Neo.isMoveAllowedForCharacter?.(key, player.character);

    // Equip a status laser if one is legal for this character.
    const statusLaser = ['blood_beam'].find(allowed);
    if (statusLaser) {
      player.ownedMoves[statusLaser] = true;
      if (Neo.equipMove) Neo.equipMove('laser', statusLaser);
      else player.equippedMoves.laser = statusLaser;
    }

    // Own a different spare laser to swap to in the Moves lesson.
    const equipped = new Set(Object.values(player.equippedMoves).filter(Boolean));
    const ownsSpare = Object.keys(player.ownedMoves).some(key => allowed(key) && !equipped.has(key));
    if (!ownsSpare) {
      const spare = Object.keys(Neo.MOVE_DEFS).find(key => allowed(key) && !equipped.has(key));
      if (spare) player.ownedMoves[spare] = true;
    }
  }

  // Make sure the tools lesson always has something to fire. A few characters
  // already start with a tool (Metao's bag, Gelleh's zap) — any owned tool will
  // do — so only grant the teaching tool when the player owns none. Pew Pew Box
  // is a plain timed tool: pressing Space (or tapping its slot) visibly launches
  // homing missiles, which reads clearly as "tools fire on demand".
  function grantTutorialTeachingTool() {
    const player = Neo.player;
    if (!player || !Neo.isActivatableItem) return;
    if (!player.items || typeof player.items !== 'object') player.items = {};
    const ownsTool = Object.keys(player.items).some(key => player.items[key] > 0 && Neo.isActivatableItem(key));
    if (!ownsTool) player.items.pew_pew_box = 1;
    // Slot whatever tool is owned so the equipment bar shows it for the lesson.
    Neo.syncEquipmentSlotsFromInventory?.();
  }

  // Strict gate for the game-loop side of the tutorial (spawning the dummy/relic,
  // advancing steps, detecting movement). These must only run while the world is
  // simulating, i.e. gameState === 'play'.
  function isFirstRunTutorialActive() {
    return !!Neo.tutorialState?.active && (Neo.gameMode === 'normal' || Neo.gameMode === 'story') && Neo.gameState === 'play';
  }

  // Display/eligibility gate for the tutorial. True whenever the tutorial is
  // conceptually running, INCLUDING while a panel (e.g. the inventory) has paused
  // the game. Use this for the banner, the objective checklist, and the
  // panel-open flag setters that fire after pauseGame() — otherwise opening the
  // inventory would freeze the tutorial and hide its UI mid-step.
  function isFirstRunTutorialEngaged() {
    if (!Neo.tutorialState?.active || !['normal', 'story'].includes(Neo.gameMode)) return false;
    if (Neo.gameState === 'play') return true;
    // Tolerate the pause that the inventory panel applies to the world.
    return Neo.gameState === 'pause' && !!Neo.inventoryPauseActive;
  }

  function consumeReplayTutorialRequest() {
    let requested = false;
    try {
      requested = localStorage.getItem(Neo.REPLAY_TUTORIAL_KEY) === '1';
      if (requested) localStorage.removeItem(Neo.REPLAY_TUTORIAL_KEY);
    } catch {}
    return requested;
  }

  function isReplayTutorialRequested() {
    try {
      return localStorage.getItem(Neo.REPLAY_TUTORIAL_KEY) === '1';
    } catch {}
    return false;
  }

  // Sarge is the "old guard" reward: locked until the player has defeated
  // Bowman's Bane at least once, including for the tutorial replay.
  function hasSargeUnlockPrereq() {
    return Number(Neo.metaProgress?.bowmanBaneDefeats || 0) > 0;
  }

  // The tutorial may not be played as Sarge until he's unlocked.
  function isSargeTutorialBlocked() {
    return isReplayTutorialRequested() && !hasSargeUnlockPrereq();
  }

  // Custom character creation is a reward for completing the roster: locked
  // until every base (non-custom) character has been unlocked.
  function hasAllCharactersUnlocked() {
    const unlocked = new Set(Neo.metaProgress?.unlockedCharacters || ['princess', 'thorn_knight', 'metao']);
    if (Number(Neo.metaProgress?.godsKilled || 0) > 0) unlocked.add('gelleh');
    if (Number(Neo.metaProgress?.mooggyDefeats || 0) >= 3) unlocked.add('mooggy');
    if (Number(Neo.metaProgress?.bowmanBaneDefeats || 0) > 0) unlocked.add('sarge');
    const baseKeys = Object.keys(Neo.CHARACTER_DEFS || {}).filter(key => key !== 'custom_character');
    return baseKeys.every(key => unlocked.has(key));
  }

  // Turtle Boy unlocks the moment the player has his signature weapon and
  // laser equipped at the same time: Extending Staff + Turtle Wave.
  function checkTurtleBoyUnlock() {
    if (!Neo.player) return;
    if (!Neo.metaProgress || Neo.metaProgress.unlockedCharacters?.includes('turtle_boy')) return;
    if (Neo.player.equippedWeapon !== 'extending_staff') return;
    if (Neo.player.equippedMoves?.laser !== 'turtle_wave') return;
    Neo.metaProgress.unlockedCharacters.push('turtle_boy');
    Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 34, life: 2.2, text: 'TURTLE BOY UNLOCKED!', c: '#6ee7a0' });
    Neo.recordCharacterUnlock?.('turtle_boy');
    Neo.persistMetaSoon();
    Neo.refreshMenuState();
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
      body: 'Spend XP or gold here to permanently upgrade your weapons and moves for this run. Pick an item, choose to pay with XP or gold, boost its stats, then Confirm. Tip: a weapon that matches your class’s style hits harder.',
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
    if (window.NeoSettings?.isTouchControlsEnabled) return window.NeoSettings.isTouchControlsEnabled();
    const coarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const maxTouchPoints = typeof navigator !== 'undefined' ? Number(navigator.maxTouchPoints || 0) : 0;
    return !!(coarsePointer || maxTouchPoints > 0);
  }

  function getAscendControlHint() {
    if (!hasTouchControls()) return getControlHint('ascend', 'space');
    const defaults = { touchA: 'slash', touchB: 'laser', touchY: 'smash', touchX: 'ascend', touchDash: 'dash' };
    const labels = { touchA: 'A BUTTON', touchB: 'B BUTTON', touchY: 'Y BUTTON', touchX: 'X BUTTON', touchDash: 'DASH BUTTON' };
    const bindings = { ...defaults, ...(window.NeoSettings?.getTouchBindings?.() || {}) };
    const entry = Object.entries(bindings).find(([, action]) => String(action).toLowerCase() === 'ascend');
    return labels[entry?.[0]] || 'X BUTTON';
  }

  // Hint label for the ladder, which is driven by the interact action. On touch
  // the ladder can still be triggered by the X (ascend) button, so show that
  // button label there; on keyboard/gamepad show the interact key (default E).
  function getLadderControlHint() {
    if (hasTouchControls()) return getAscendControlHint();
    return getControlHint('interact', 'e');
  }

  function getMovementControlHint() {
    const up = getControlHint('up', 'w');
    const left = getControlHint('left', 'a');
    const down = getControlHint('down', 's');
    const right = getControlHint('right', 'd');
    return `${up}/${left}/${down}/${right}`;
  }

  function ensureTutorialDummyEnemy() {
    if (!isFirstRunTutorialActive() || Neo.tutorialState.completed?.fight) return;
    if (!['melee', 'laser', 'beam_struggle', 'smash', 'fight'].includes(Neo.tutorialState.step)) return;
    if (!Neo.currentRoom || ['boss', 'god', 'shop', 'anvil', 'challenge'].includes(Neo.currentRoom.type)) return;
    if (Neo.enemies.some(enemy => enemy?.tutorialDummy)) return;
    if (Neo.tutorialState.dummySpawned) Neo.tutorialState.dummySpawned = false;
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
    dummy.hp = 90;
    dummy.max = 90;
    dummy.speed = 0;
    dummy.dmg = 0;
    dummy.attackCd = 99;
    dummy.spawnT = 0.18;
    dummy.barrier = 0;
    Neo.tutorialState.dummySpawned = true;
    Neo.spawnParticle({ x: dummy.x, y: dummy.y - 24, life: 1.4, text: 'TRAINING DUMMY', c: '#8dd4ff' });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 1.1, text: 'DUMMY SPAWNED', c: '#9ce9ff' });
  }

  // Turn the safe training dummy into a stationary beam partner for one lesson.
  // Its beam tracks the player but deals no ordinary beam damage; it exists to
  // create the same opposing-path collision used by real beam enemies.
  function ensureTutorialBeamStruggleEnemy() {
    const state = Neo.tutorialState;
    const dummy = Neo.enemies.find(enemy => enemy?.tutorialDummy);
    if (!isFirstRunTutorialActive() || state.step !== 'beam_struggle') {
      if (dummy?.tutorialBeamUser) {
        dummy.tutorialBeamUser = false;
        dummy.beamTime = 0;
      }
      return;
    }
    if (!dummy || !Neo.player) return;
    dummy.tutorialBeamUser = true;
    dummy.displayName = 'Beam Trainer';
    dummy.speed = 0;
    dummy.dmg = 0;
    dummy.attackCd = 99;
    dummy.beamRange = Math.max(520, Neo.dist(dummy.x, dummy.y, Neo.player.x, Neo.player.y) + 80);
    dummy.beamAngle = Neo.angleBetween(dummy, Neo.player);
    dummy.beamTime = Math.max(Number(dummy.beamTime || 0), 0.24);
    dummy.beamTick = 99;
    dummy.beamColor = '#ff365f';
  }

  // Guarantee a relic for the tutorial relic step so the lesson never depends on
  // a random drop. Mirrors ensureTutorialDummyEnemy: same safe-spawn fallback,
  // pushed once, tagged so we don't double-spawn.
  function ensureTutorialRelicPickup() {
    if (!isFirstRunTutorialActive() || Neo.tutorialState.completed?.relic) return;
    if (Neo.tutorialState.step !== 'relic') return;
    if (!Neo.currentRoom || ['boss', 'god', 'shop', 'anvil', 'challenge'].includes(Neo.currentRoom.type)) return;
    if (Neo.pickups.some(p => p?.tutorialRelic)) return;
    if (Neo.tutorialState.relicSpawned) Neo.tutorialState.relicSpawned = false;
    const spot = Neo.findSafeEnemySpawnPoint(Neo.player.x + 90, Neo.player.y, 14)
      || Neo.findSafeEnemySpawnPoint(Neo.player.x - 90, Neo.player.y, 14)
      || Neo.findSafeEnemySpawnPoint(Neo.player.x, Neo.player.y - 80, 14)
      || { x: Neo.clamp(Neo.player.x + 70, Neo.WALL + 22, Neo.ROOM_W - Neo.WALL - 22), y: Neo.clamp(Neo.player.y - 36, Neo.WALL + 22, Neo.ROOM_H - Neo.WALL - 22) };
    Neo.pickups.push({ x: spot.x, y: spot.y, type: 'item', key: TUTORIAL_RELIC_KEY, tutorialRelic: true });
    Neo.tutorialState.relicSpawned = true;
    Neo.spawnParticle({ x: spot.x, y: spot.y - 22, life: 1.4, text: 'RELIC', c: '#ffd27d' });
  }

  // How long the freely-given demo bleed must tick (with the player on the
  // status_lesson step) before the lesson auto-clears, so they actually watch a
  // couple of red numbers fall off rather than the card flashing past.
  const TUTORIAL_STATUS_WATCH_TIME = 2.6;

  // Keep a bleed visibly ticking on the training dummy during the status lesson
  // so the "damage that keeps ticking" beat is demonstrated for EVERY character,
  // not just the blood-beam roster, and never gated on an RNG proc. The demo
  // bleed is tagged tutorialDemo so applyStatus skips the status-applied signal
  // (it would otherwise insta-complete the step); we complete it ourselves on a
  // short dwell via the status-lesson-watched signal.
  function ensureTutorialDummyStatus(dt = 0) {
    const state = Neo.tutorialState;
    if (!isFirstRunTutorialActive() || state.completed?.status_lesson || state.completed?.fight) return;
    if (state.step !== 'status_lesson') return;
    const dummy = Neo.enemies?.find(enemy => enemy?.tutorialDummy && !enemy.dead);
    if (!dummy) return;
    dummy.bleedImmune = false;
    // Refresh a light bleed whenever it runs low so it stays visible for the
    // whole dwell. Keep the dummy topped up so a high-damage character's bleed
    // scaling can't bleed it out mid-lesson and trip the kill -> fight path
    // before the player has read the beat.
    if (Neo.getStatusStacks(dummy, 'bleed') < 2) {
      Neo.applyStatus?.(dummy, 'bleed', 2, 6, { tutorialDemo: true });
      dummy.bleedFlash = 0.34;
    }
    if (dummy.hp < dummy.max * 0.5) dummy.hp = dummy.max;
    state.statusWatchedFor = Number(state.statusWatchedFor || 0) + Number(dt || 0);
    if (state.statusWatchedFor >= TUTORIAL_STATUS_WATCH_TIME) {
      Neo.tutorialController?.signal?.('status-lesson-watched');
    }
  }

  function getTutorialStepOrder() {
    return Neo.tutorialController?.steps?.map(step => step.id)
      || ['welcome', 'move', 'hud', 'hud_pause', 'hud_settings', 'hud_settings_tab', 'hud_preview_open', 'hud_layout', 'objectives', 'minimap', 'secret_reveal_do', 'route_training', 'dash', 'melee', 'laser', 'beam_struggle', 'smash', 'tools_fire', 'status_lesson', 'crit_lesson', 'fight', 'relic', 'inventory_open', 'inventory_relics', 'inventory_tools', 'inventory_moves', 'inventory_weapons', 'moves_equip_explain', 'moves_equip_do', 'route_treasure', 'treasure_open', 'treasure_collect', 'route_shop', 'shop_open', 'shop_buy', 'route_forge', 'forge_open', 'forge_pay_currency', 'forge_stage', 'forge_confirm', 'route_challenge', 'challenge_start', 'challenge_bombs', 'route_ladder', 'ladder_fight', 'ladder_use'];
  }

  function navigateTutorialStep(direction = 1) {
    if (!isFirstRunTutorialEngaged()) return;
    if (direction < 0) Neo.tutorialController?.back?.();
  }

  function getTutorialStepMessage() {
    if (!isFirstRunTutorialEngaged()) return '';
    if (Neo.tutorialController?.getCurrentMessage) return Neo.tutorialController.getCurrentMessage();
    const moveHint = getMovementControlHint();
    const slashHint = getControlHint('slash', 'lmb');
    const laserHint = getControlHint('laser', 'rmb');
    const smashHint = getControlHint('smash', 'r');
    const dashHint = getControlHint('dash', 'shift');
    const inventoryHint = getControlHint('inventory', 'i');
    const forgeHint = getControlHint('interact', 'e');
    const ladderHint = getLadderControlHint();
    const step = Neo.tutorialState.step;
    if (step === 'move') return `Tutorial: Move with ${moveHint}. Rooms lock until cleared, so positioning is how you survive.`;
    if (step === 'dash') return `Tutorial: Dash with ${dashHint} — a quick burst that briefly makes you invulnerable. It's your main way to dodge attacks.`;
    if (step === 'fight') return `Tutorial: Defeat the training dummy. ${slashHint} is a fast melee, ${laserHint} fires at range, ${smashHint} is a heavier hit — different tools for different enemies.`;
    if (step === 'relic') return 'Tutorial: Grab the relic. Relics are permanent upgrades for the whole run — your choices stack and define your build.';
    if (step === 'forge') return `Tutorial: Find a Forge room and press ${forgeHint} to open it. Spend XP or gold there to permanently upgrade your weapons and moves for this run. (No Forge nearby? Head for the ladder.)`;
    if (step === 'panel') return `Tutorial: Press ${inventoryHint} to open your Inventory — check your relics, weapons, and equipped moves any time.`;
    if (Neo.currentRoom?.type === 'ladder' && Neo.currentRoom?.cleared) return `Tutorial: Stand on the ladder and press ${ladderHint} to descend to the next floor — enemies get tougher, but so do your rewards.`;
    if (Neo.currentRoom?.type === 'ladder') return 'Tutorial: Clear this ladder room, then use the ladder to descend.';
    return 'Tutorial: Find the ladder room and continue to the next floor.';
  }

  function getTutorialObjectiveEntries() {
    if (!isFirstRunTutorialEngaged()) return [];
    if (Neo.tutorialController?.getCurrentObjectiveEntries) return Neo.tutorialController.getCurrentObjectiveEntries();
    const moveHint = getMovementControlHint();
    const slashHint = getControlHint('slash', 'lmb');
    const laserHint = getControlHint('laser', 'rmb');
    const dashHint = getControlHint('dash', 'shift');
    const inventoryHint = getControlHint('inventory', 'i');
    const forgeHint = getControlHint('interact', 'e');
    const ladderHint = getLadderControlHint();
    const state = Neo.tutorialState;
    return [
      { text: `Move (${moveHint})`, state: state.moved ? 'done' : 'todo' },
      { text: `Dash to dodge (${dashHint})`, state: state.dashed ? 'done' : 'todo' },
      { text: `Defeat training dummy (${slashHint}/${laserHint})`, state: state.gotKill ? 'done' : 'todo' },
      { text: 'Pick up one relic (permanent run upgrade)', state: state.gotRelic ? 'done' : 'todo' },
      { text: `Open the Forge (${forgeHint} in a Forge room)`, state: state.openedForge ? 'done' : 'todo' },
      { text: `Open Inventory (${inventoryHint})`, state: state.openedInventory ? 'done' : 'todo' },
      { text: `Use ladder: stand on it and press ${ladderHint}`, state: state.usedLadder ? 'done' : 'todo' },
    ];
  }

  function skipFirstRunTutorial() {
    if (!isFirstRunTutorialEngaged()) return;
    Neo.tutorialController?.skip?.();
  }

  // Require movement to be sustained for this long before the move step counts,
  // so a single frame of stick-drift / nudge doesn't flip the banner instantly.
  const TUTORIAL_MOVE_DEBOUNCE = 0.35;

  function updateFirstRunTutorialProgress(dt = 0) {
    if (!isFirstRunTutorialActive()) return;
    const state = Neo.tutorialState;
    ensureTutorialDummyEnemy();
    ensureTutorialBeamStruggleEnemy();
    ensureTutorialRelicPickup();
    ensureTutorialDummyStatus(dt);

    // Debounced movement detection: accumulate time spent above the speed
    // threshold; only mark "moved" once it's been sustained briefly.
    if (!state.completed?.move) {
      if (Math.hypot(Neo.player?.vx || 0, Neo.player?.vy || 0) > 24) {
        state.movedFor = Number(state.movedFor || 0) + Number(dt || 0);
        if (state.movedFor >= TUTORIAL_MOVE_DEBOUNCE) Neo.tutorialController?.signal?.('move');
      } else {
        state.movedFor = 0;
      }
    }
  }

  function createDefaultPlayer() {
    const items = {
      neo_knife: 0,
      tooth_of_thorn: 0,
      tough_bandaid: 0,
      orb_of_blood: 0,
      hemes_scarf: 0,
      insurance: 0,
      gold_vac: 0,
      copycat_charm: 0,
      crit_charm: 0,
      copper_penny: 0,
      attack_servo: 0,
      enemy_magnet: 0,
      keen_eye: 0,
      chrono_spring: 0,
      scholar_seal: 0,
      scholar_cap: 0,
      push_man: 0,
      titan_heart: 0,
      weapon_fatigue: 0,
      generic_health_item: 0,
      snake_knife: 0,
      confuse_ray: 0,
      overclocked_watch: 0,
      charged_adapter: 0,
      pew_pew_box: 0,
      skizzard_tail: 0,
      zap_to_extreme: 0,
      panic_button: 0,
      mid_sweepy_box: 0,
      explosive_jelly: 0,
      dragon_orb: 0,
      ricocete: 0,
      drink_master: 0,
      overstimulate: 0,
      grave_zone: 0,
      turtle_shell: 0,
      anchor_charm: 0,
      iron_lung: 0,
      iron_helm: 0,
      oracles_lens: 0,
      homing_missile: 0,
      wizards_paw: 0,
      jesters_dice: 0,
      shield_of_aegis: 0,
      pendant_of_kronos: 0,
      robot_arm: 0,
      rich_mans_luck: 0,
      rich_mans_blues: 0,
      artificer_charger: 0,
      cloak_of_naked_king: 0,
      moggys_coat: 0,
      veggys_pendant: 0,
      procy_pickle: 0,
      princes_glasses: 0,
      mateos_bag: 0,
      extra_battery: 0,
      mooggy_zoomies: 0,
      el_bartos_cape: 0,
      sparkle_charm: 0,
      churu_stick: 0,
      voucher_white: 0,
      voucher_purple: 0,
      voucher_yellow: 0,
      forge_voucher: 0,
    };
    const character = isCustomCharacterKey(Neo.chosenCharacter)
      ? (() => {
          const custom = getCustomCharacterSettings(Neo.chosenCharacter);
          return {
            ...(Neo.CHARACTER_DEFS.custom_character || Neo.CHARACTER_DEFS.thorn_knight),
            key: Neo.chosenCharacter,
            name: custom.name || 'Custom',
            damageMultiplier: custom.damageMultiplier,
            hpMultiplier: custom.hpMultiplier,
          };
        })()
      : (Neo.CHARACTER_DEFS[Neo.chosenCharacter] || Neo.CHARACTER_DEFS.thorn_knight);
    const starterItems = getCharacterStartingItems(character.key);
    if (isCustomCharacterKey(character.key)) {
      const custom = getCustomCharacterSettings(character.key);
      if (custom.active) {
        for (const key of custom.starterRelics || []) {
          if (Object.prototype.hasOwnProperty.call(items, key)) {
            starterItems[key] = (Number(starterItems[key]) || 0) + 1;
          }
        }
      }
    }
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
      swingFacing: 1,
      armRecoilA: 0,
      armRecoilFacing: 1,
      armRecoilUntil: 0,
      armRecoilDuration: 0,
      inv: 0,
      dashTime: 0,
      dashX: 0,
      dashY: 0,
      cowardsWayTime: 0,
      warpHideTime: 0,
      mooggyZoomiesTime: 0,
      deathBallBuffTime: 0,
      deathBallBuffPower: 0,
      mooggySwipeCharge: 0,
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
      critCharmChargeKills: 0,
      escapeChargeKills: 0,
      escapeReady: true,
      robotArmChargeKills: 0,
      robotArmReady: Number(items.robot_arm || 0) > 0,
      scarfChargeKills: 0,
      scarfHealReady: false,
      scarfHealTime: 0,
      statuses: Neo.createStatusMap(),
      items,
      ownedWeapons: defaultWeapon ? { [defaultWeapon]: true } : {},
      equippedWeapon: defaultWeapon,
      weaponCooldown: 0,
      blockActive: false,
      blockTimer: 0,
      overhealBarrier: 0,
      overhealBarrierMax: 0,
      overhealBarrierColor: '',
      gellehHealPulseFrame: 0,
      fleeceTick: 0,
      weaponBeamTime: 0,
      weaponBeamTick: 0,
      equippedMoves,
      ownedMoves,
      moveStackOverrides: {},
      weaponChargeOverrides: {},
      lavaWalkTime: 0,
      lavaTrailTick: 0,
      princessFlightTime: 0,
      anvilUpgrades: { weapon: {}, move: {} },
      storedPotions: 0,
      extraBatteryPendingCount: 0,
      wizardPawPendingCount: 0,
      scrollUseSerial: 0,
      lastSecretVendorRewardKey: '',
      scrollBranchingTargets: {},
      scrollReplaceMap: {},
      scrollPoolWeights: [],
      scrollEgoFloor: 0,
      equipmentSlots: (character.key === 'metao') ? ['mateos_bag'] : [],
      equipmentCooldowns: {},
      equipmentEffects: {},
      forgeVoucherCharges: 0,
      forgeUpgradesApplied: 0,
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
    // Scrolls are their own system (Neo.SCROLL_DEFS) but are registered alongside
    // relics so runtime lookups (icons, rarity, tags, names, shop offers, save/load)
    // resolve scroll keys. Relic-only consumers iterate Neo.ITEM_KEYS, which excludes
    // scrolls, so this does not leak scrolls into relic pools or the relic codex.
    const runtimeItemDefs = Object.fromEntries(
      Object.entries(Neo.ITEM_DEFS || {}).map(([key, definition]) => [key, {
        ...definition,
        fullDescription: definition.description || '',
        description: Neo.getItemShortDescription?.(definition)
          || definition.shortDescription
          || definition.description
          || '',
      }]),
    );
    const allDefs = { ...runtimeItemDefs, ...(Neo.SCROLL_DEFS || {}) };
    const factory = window.KozEngine?.Items?.itemFactory;
    if (factory?.createLibrary && factory?.createRegistryFromLibrary) {
      class RuntimeItem {
        constructor(spec = {}) {
          Object.assign(this, spec);
        }
      }
      const library = factory.createLibrary(allDefs, RuntimeItem);
      return factory.createRegistryFromLibrary(library);
    }
    return {
      get(key) {
        return allDefs[key] || null;
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
          selectedCharacter: migrateCharacterKey(String(savedMeta.selectedCharacter || createDefaultMeta().selectedCharacter)),
          unlockedLegacy: normalizeLegacySelection(savedMeta.unlockedLegacy),
          seenTips: (savedMeta.seenTips && typeof savedMeta.seenTips === 'object') ? { ...savedMeta.seenTips } : {},
          storyScenesSeen: Array.isArray(savedMeta.storyScenesSeen) ? [...new Set(savedMeta.storyScenesSeen.map(String))] : [],
          storySkipTutorial: savedMeta.storySkipTutorial === true,
          characterKitChoices: migrateCharacterKitChoices(savedMeta.characterKitChoices),
          customCharacters: normalizeCustomCharactersSettings(savedMeta.customCharacters || (savedMeta.customCharacter ? [savedMeta.customCharacter] : null)),
        };
        // Guardrail: loading must never lose an earned unlock. If a key was in the save
        // but isn't after normalization, a normalizer/migration dropped it (e.g. a key
        // was renamed without a migration line, or new always-unlocked content shadowed
        // a derived unlock). Warn loudly here so it's caught in dev, not by a player.
        warnIfUnlocksDropped('unlockedItems', savedMeta.unlockedItems || savedMeta.unlockedRelics, Neo.metaProgress.unlockedItems);
        warnIfUnlocksDropped('unlockedCharacters', savedMeta.unlockedCharacters, Neo.metaProgress.unlockedCharacters);
        warnIfUnlocksDropped('unlockedLegacy', savedMeta.unlockedLegacy, Neo.metaProgress.unlockedLegacy);
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
        if (Neo.metaProgress.godsKilled > 0) unlocked.add('gelleh');
        if (Number(Neo.metaProgress.mooggyDefeats || 0) >= 3) unlocked.add('mooggy');
        if (Number(Neo.metaProgress.bowmanBaneDefeats || 0) > 0) unlocked.add('sarge');
        getCustomCharacterKeys().forEach(key => unlocked.add(key));
        // Persist the derived unlocks back into the saved list. Gelleh/Mooggy/Sarge were
        // only ever re-derived from their counters at load and never written back, so
        // adding new always-unlocked starters (turtle_boy) made the earned unlocks look
        // lost whenever those counters didn't survive. Once an earned character is
        // recorded here it stays unlocked regardless of the counters.
        Neo.metaProgress.unlockedCharacters = normalizeUnlockedCharacters([...unlocked]);
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
      if (value === 'voucher') return 'voucher_yellow';
      if (value === 'double_dose') return 'drink_master';
      return value;
    });
    // Keep every earned key, including ones not in the current ITEM_KEYS. Filtering to
    // only known keys would silently erase an unlock from every save the moment an item
    // key is renamed (the migration map above only covers keys we remembered to add).
    // Unknown keys are harmless to carry and are simply ignored where items are looked
    // up, so preserving them protects progress across future content/renames.
    const items = [...new Set(migrated.filter(name => typeof name === 'string' && name))];
    return items.length ? items : fallback;
  }

  // Legacy character keys from older saves -> current keys.
  const LEGACY_CHARACTER_KEYS = { granialla: 'gelleh' };

  function migrateCharacterKey(key) {
    return LEGACY_CHARACTER_KEYS[key] || key;
  }

  // Carries saved alt-kit picks across loads, dropping any stale choice that is no
  // longer a valid alternate. Sarge no longer has Death Ball at all (his smash is
  // Hammer Smash, the shockwave); an existing save may still carry the old
  // sarge.smash = 'death_ball' pick, so strip it here.
  function migrateCharacterKitChoices(input) {
    const choices = (input && typeof input === 'object') ? { ...input } : {};
    if (choices.sarge && 'smash' in choices.sarge) {
      choices.sarge = { ...choices.sarge };
      delete choices.sarge.smash;
    }
    return choices;
  }

  // Dev guardrail: flags earned keys that existed in the save but vanished after
  // normalization. Character keys are remapped through migrateCharacterKey first so a
  // legitimate legacy-key rename (granialla -> gelleh) isn't reported as a loss.
  function warnIfUnlocksDropped(field, savedList, loadedList) {
    if (!Array.isArray(savedList)) return;
    const remap = field === 'unlockedCharacters' ? migrateCharacterKey : (key => key);
    const after = new Set(loadedList || []);
    const lost = [...new Set(savedList.map(remap))].filter(key => key && !after.has(key));
    if (lost.length) console.error(`[save] ${field}: dropped earned key(s) on load:`, lost);
  }

  function normalizeUnlockedCharacters(input) {
    const fallback = ['princess', 'thorn_knight', 'metao'];
    if (!Array.isArray(input)) return fallback;
    const remapped = input.map(migrateCharacterKey);
    const chars = Object.keys(Neo.CHARACTER_DEFS).filter(name => remapped.includes(name));
    return [...new Set([...fallback, ...chars])];
  }

  // Debug/testing helper: force-unlock one character (or all of them) without
  // earning them normally. Callable from the console as Neo.forceUnlockCharacter('gelleh')
  // or Neo.forceUnlockAllCharacters().
  function forceUnlockCharacter(key) {
    if (!Neo.metaProgress) return;
    if (!Neo.CHARACTER_DEFS[key]) {
      console.warn(`[forceUnlockCharacter] unknown character key: ${key}`);
      return;
    }
    const unlocked = new Set(Neo.metaProgress.unlockedCharacters || []);
    unlocked.add(key);
    Neo.metaProgress.unlockedCharacters = normalizeUnlockedCharacters([...unlocked]);
    Neo.persistMetaSoon();
    Neo.updateCharacterSelectionUI?.();
  }

  function forceUnlockAllCharacters() {
    if (!Neo.metaProgress) return;
    Neo.metaProgress.unlockedCharacters = normalizeUnlockedCharacters(Object.keys(Neo.CHARACTER_DEFS));
    Neo.persistMetaSoon();
    Neo.updateCharacterSelectionUI?.();
  }

  function normalizeDifficulty(input) {
    if (input === 'custom') return 'custom';
    return Neo.DIFFICULTY_DEFS[input] ? input : 'medium';
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
    // Online multiplayer drives presentation from the authority's player list
    // (NetworkGameView builds these), not from the local PLAYER_SLOT_CONFIG:
    // it never sets gameMode to coop/pvp and never fills Neo.player2. Without
    // this branch every consumer here fell through to the single-player path
    // and reported one slot, which left the HUD unable to reconcile its cards
    // against the real roster. Note these slots carry server player ids and
    // have no getCamera(), so split-screen callers must stay behind
    // isSplitScreen() (which requires Neo.player2 and is false online).
    const presentationSlots = Neo.presentationPlayerSlots;
    if (Array.isArray(presentationSlots) && presentationSlots.length) return presentationSlots;
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
    if (mode === 'story' || mode === 'endless' || mode === 'practice' || mode === 'boss_rush' || mode === 'rival_rumble' || mode === 'treasure_hunt' || mode === 'sandbox' || mode === 'coop' || mode === 'pvp' || mode === 'competitive') return mode;
    return 'normal';
  }

  function getRunModeLabel(mode) {
    if (mode === 'story') return 'Story';
    if (mode === 'coop') return 'Co-op';
    if (mode === 'pvp') return 'PVP';
    if (mode === 'endless') return 'Endless';
    if (mode === 'practice') return 'Practice';
    if (mode === 'boss_rush') return 'Boss Rush';
    if (mode === 'rival_rumble') return 'Rival Rumble';
    if (mode === 'treasure_hunt') return 'Treasure Hunt';
    if (mode === 'sandbox') return 'Sandbox';
    if (mode === 'competitive') return 'Competitive';
    return 'Normal';
  }

  function normalizeLegacySelection(input) {
    if (!Array.isArray(input)) return [];
    // Keep every purchased key, including ones not in the current LEGACY_UPGRADES, so
    // renaming a legacy upgrade doesn't silently refund/erase it from existing saves.
    // Consumers gate on membership (hasLegacy/ownedLegacy) and the meta panel renders
    // from LEGACY_ORDER, so an unknown carried key is inert rather than shown broken.
    return [...new Set(input.filter(key => typeof key === 'string' && key))];
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
          endlessWave: Math.max(0, Number(entry.endlessWave || 0)),
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
      endlessWave: Math.max(0, Number(fallback.bestEndlessWave || 0)),
    };
    normalizeRunHistory(entries).forEach(entry => {
      records.floor = Math.max(records.floor, Number(entry.floor || 1));
      records.kills = Math.max(records.kills, Number(entry.kills || 0));
      records.level = Math.max(records.level, Number(entry.level || 1));
      records.time = Math.max(records.time, Number(entry.elapsedSeconds || 0));
      records.coins = Math.max(records.coins, Number(entry.coins || 0));
      records.endlessWave = Math.max(records.endlessWave, Number(entry.endlessWave || 0));
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
    Neo.metaProgress.bestEndlessWave = records.endlessWave;
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
    if (Neo.gameMode === 'story') {
      return globalThis.NeoNyke?.story?.storySeed?.(Neo.player?.character || Neo.chosenCharacter, Neo.floor)
        || `NEONYKE-STORY-V1|${Neo.player?.character || Neo.chosenCharacter}|floor:${Neo.floor}`;
    }
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

  function getRandomItemDropChance(baseChance, maxChance = 1) {
    const difficultyMultiplier = Math.max(0, Number(Neo.getDifficultyDef()?.itemDropChanceMultiplier ?? 1));
    const itemBonus = Math.max(0, Number(Neo.getItemStats?.()?.itemDropChanceBonus || 0));
    return Neo.clamp((Math.max(0, Number(baseChance || 0)) + itemBonus) * difficultyMultiplier, 0, maxChance);
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

  function getShopProgressionDepth() {
    return Math.max(
      1,
      Number(Neo.getProgressionDepth?.() ?? Neo.floorsEntered ?? Neo.floor ?? 1),
    );
  }

  function getShopProgressionPriceMultiplier(
    progressionDepth = getShopProgressionDepth(),
    elapsedSeconds = Neo.gameElapsedTime,
  ) {
    const depth = Math.max(1, Number(progressionDepth || 1));
    const minutes = Math.max(0, Number(elapsedSeconds || 0) / 60);
    const floorRate = Math.max(0, Number(Neo.SHOP_PRICE_SCALING?.floor ?? 0.03));
    const minuteRate = Math.max(0, Number(Neo.SHOP_PRICE_SCALING?.minute ?? 0.02));
    return 1 + (depth - 1) * floorRate + minutes * minuteRate;
  }

  // Scholar Seal discount: the closer you are to leveling up, the cheaper shops
  // get. At 90% of the way to a level, prices are 9% cheaper (xpProgress × 10%).
  // Requires owning at least one Scholar Seal; magnitude does not scale per stack.
  function getScholarSealShopDiscount() {
    if (!Neo.player || Number(Neo.getItemCount?.('scholar_seal') || 0) <= 0) return 0;
    const xpToNext = Number(Neo.player.xpToNext || 0);
    const xpProgress = xpToNext > 0 ? Neo.clamp(Number(Neo.player.xp || 0) / xpToNext, 0, 1) : 0;
    return xpProgress * 0.10;
  }

  function scaleShopPrice(
    baseCost,
    difficultyKey = Neo.selectedDifficulty,
    progressionDepth = getShopProgressionDepth(),
  ) {
    const scholarDiscount = 1 - getScholarSealShopDiscount();
    const progressionMultiplier = getShopProgressionPriceMultiplier(progressionDepth);
    return Math.max(1, Math.round(
      baseCost
      * getShopPriceMultiplier(difficultyKey)
      * progressionMultiplier
      * scholarDiscount
    ));
  }

  function getShopRarityPriceMultiplier(rarity = 'knight') {
    return Neo.SHOP_RARITY_PRICE_MULTIPLIERS[String(rarity || 'knight').toLowerCase()] || 1;
  }

  function getShopPotionCost(floorValue = getShopProgressionDepth(), difficultyKey = Neo.selectedDifficulty) {
    return scaleShopPrice(18 + floorValue * 2, difficultyKey, floorValue);
  }

  function getShopItemCost(itemIndex = 0, floorValue = getShopProgressionDepth(), difficultyKey = Neo.selectedDifficulty, rarity = 'knight') {
    const baseCost = 32 + floorValue * 4 + itemIndex * 6;
    return scaleShopPrice(baseCost * getShopRarityPriceMultiplier(rarity), difficultyKey, floorValue);
  }

  function getShopMoveCost(moveIndex = 0, floorValue = getShopProgressionDepth(), difficultyKey = Neo.selectedDifficulty) {
    return scaleShopPrice(34 + floorValue * 6 + moveIndex * 4, difficultyKey, floorValue);
  }

  function getShopWeaponCost(rarity = 'knight', weaponIndex = 0, floorValue = getShopProgressionDepth(), difficultyKey = Neo.selectedDifficulty, weaponKey = '') {
    if (rarity === 'god' || rarity === 'red') {
      let baseCost = (180 + floorValue * 14 + weaponIndex * 10) * 3;
      const costKey = String(weaponKey || '').toLowerCase();
      if (costKey === 'excalibur' || costKey === 'katana_excalibur_777x') baseCost = Math.round(baseCost * 1.25);
      return scaleShopPrice(baseCost, difficultyKey, floorValue);
    }
    if (rarity === 'wizard' || rarity === 'purple') return scaleShopPrice(88 + floorValue * 9 + weaponIndex * 8, difficultyKey, floorValue);
    return scaleShopPrice(52 + floorValue * 5 + weaponIndex * 6, difficultyKey, floorValue);
  }

  function getShopGodSweepCost(floorValue = getShopProgressionDepth(), difficultyKey = Neo.selectedDifficulty) {
    return scaleShopPrice(140 + floorValue * 12, difficultyKey, floorValue);
  }

  function getShopHealCost(kind, floorValue = getShopProgressionDepth(), difficultyKey = Neo.selectedDifficulty) {
    if (kind === 'major') return scaleShopPrice(34 + floorValue * 4, difficultyKey, floorValue);
    return scaleShopPrice(16 + floorValue * 2, difficultyKey, floorValue);
  }

  function getSecretXpOfferCost(floorValue = getShopProgressionDepth(), difficultyKey = Neo.selectedDifficulty) {
    return scaleShopPrice(30 + floorValue * 8, difficultyKey, floorValue);
  }

  function getSecretXpOfferAmount(floorValue = Neo.floor) {
    return Math.max(12, Math.round(14 + floorValue * 7));
  }

  function getLaserCastDuration(moveKey = Neo.getEquippedMove('laser')) {
    if (moveKey === 'god_sweep') return 1.45;
    if (moveKey === 'love_beam') return Math.max(0.1, Neo.MOVE_BASE_STATS.love_beam.duration + Neo.getAnvilMoveBonus('love_beam', 'duration'));
    if (moveKey === 'turtle_wave') return Math.max(0.1, Neo.MOVE_BASE_STATS.turtle_wave.duration + Neo.getAnvilMoveBonus('turtle_wave', 'duration'));
    if (moveKey === 'holy_eye_beams') return Math.max(0.1, Neo.MOVE_BASE_STATS.holy_eye_beams.duration + Neo.getAnvilMoveBonus('holy_eye_beams', 'duration'));
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
    if (moveKey === 'lightning_columns') return (5.1 / attackSpeed) * characterMult;
    if (moveKey === 'god_sweep') return (7.2 / attackSpeed) * characterMult;
    if (moveKey === 'nail_shot') return 2.8 / attackSpeed;
    // Thorn's Infinite Blood Beam fires a four-beam fan — at least double the
    // normal blood beam cooldown to keep it from being a constant channel.
    if (moveKey === 'thorn_blood_beams') return ((Neo.ATTACKS.laser.baseCooldown * 2) / attackSpeed) * characterMult;
    return ((Neo.godTimer > 0 ? 2.8 : Neo.ATTACKS.laser.baseCooldown) / attackSpeed) * characterMult;
  }

  function getDashCooldownDuration(moveKey = Neo.getEquippedMove('dash'), attackSpeed = Neo.getAttackSpeedValue()) {
    const anvilBase = getMoveCooldownBase(moveKey);
    let duration;
    if (anvilBase !== null) duration = anvilBase / attackSpeed;
    else if (moveKey === 'warp') duration = 2.8 / attackSpeed;
    else if (moveKey === 'nimrod_stomp') duration = 4.2 / attackSpeed;
    else if (moveKey === 'zip_lightning') duration = 2.0 / attackSpeed;
    else if (moveKey === 'cowards_way') duration = 6 / attackSpeed;
    else if (moveKey === 'mooggy_zoomies') duration = 20 / attackSpeed;
    else duration = 3.2 / attackSpeed;
    const hasBaneInsignia = !!Neo.player?.storyBaneInsignia || !!Neo.storyState?.rewards?.baneInsignia;
    return duration * (hasBaneInsignia ? 0.85 : 1);
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
    // Level milestones grant extra charges to the equipped move in a slot (e.g.
    // Gelleh's Zip Lightning, the generic mobility/laser charge on the cadence).
    const milestoneBonus = Neo.getMilestoneChargeBonus(
      moveDef.slot,
      moveKey,
      characterKey,
      Number(playerState?.level || 1),
    );
    const hasBaneInsignia = !!playerState?.storyBaneInsignia || !!Neo.storyState?.rewards?.baneInsignia;
    const storyBonus = moveDef.slot === 'dash' && hasBaneInsignia ? 1 : 0;
    return Math.max(characterStacks, playerOverrideStacks || 0) + milestoneBonus + storyBonus;
  }

  function getSlotCooldownDuration(slot, moveKey, attackSpeed = Neo.getAttackSpeedValue()) {
    if (slot === 'melee') return getMeleeCooldownDuration(moveKey, attackSpeed);
    if (slot === 'laser') return getLaserCooldownDuration(moveKey, attackSpeed);
    if (slot === 'smash') return getSmashCooldownDuration(attackSpeed);
    return getDashCooldownDuration(moveKey, attackSpeed);
  }

  function createCooldownEntry(slot, playerState = Neo.player, source = null, options = {}) {
    // A live in-memory hold (set by spendSkillCharge's deferTimer path) is still
    // backed by an active charging flag and will release normally, so rebuilds
    // from the live entry (e.g. Extra Battery) keep it. A hold read back from a
    // saved-run snapshot has no charging flag to resume it, so it must be turned
    // into a real recharge timer instead — see the sourceIsObject branch below.
    const fromSnapshot = !!options.fromSnapshot;
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
      const heldCharges = Math.min(sourceHolding, Math.max(0, maxCharges - charges));
      // Restoring from a saved run: the hold-to-charge flag isn't persisted, so a
      // saved hold can never resume or release. Left as `holding`, it would strand
      // the pip at 0 charges with no timer — a cooldown shows but the move is
      // permanently locked. Convert it into a real recharge timer so the charge
      // comes back. Live rebuilds keep the hold (its charging session is intact).
      holding = fromSnapshot ? 0 : heldCharges;
      timers = sourceTimers.slice(0, Math.max(0, maxCharges - charges - holding));
      if (timers.length === 0 && Number(source.recharge || 0) > 0 && charges < maxCharges) {
        timers.push(Number(source.recharge));
      }
      if (fromSnapshot) {
        for (let i = 0; i < heldCharges && timers.length < Math.max(0, maxCharges - charges); i += 1) {
          timers.push(getSlotCooldownDuration(slot, moveKey, Neo.getAttackSpeedValue()));
        }
      }
      if (wasFull) {
        charges = maxCharges;
        timers = [];
        holding = 0;
      }
    }

    return { charges, maxCharges, timers, holding };
  }

  function createCooldownState(playerState = Neo.player, source = null, options = {}) {
    const state = {};
    Neo.MOVE_SLOTS.forEach(slot => {
      state[slot] = createCooldownEntry(slot, playerState, source?.[slot], options);
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

  // Called on every room transfer. Cooldown bookkeeping can desync across a
  // room change (a charge spent with a deferred/held timer that never resolved,
  // a stuck empty slot with no timer running). Reconcile each slot so the player
  // never lands in a new room with a dead, un-rechargeable skill: any slot
  // sitting at 0 charges with no active timer gets a fresh timer (its current
  // cooldown + 500ms) so it will recover; everything else is topped up to full.
  function reconcileCooldownsOnRoomEnter() {
    const attackSpeed = Neo.getAttackSpeedValue();
    // A `holding` charge only counts as "in flight" while its hold-to-charge
    // session is actually live; otherwise it's an orphaned hold (e.g. a charge
    // spent right before leaving 'play' without release) that would never recover.
    const smashChargingLive = !!(Neo.healingZoneCharging || Neo.deathBallCharging);
    const dashChargingLive = !!Neo.nimrodStompCharging;
    // Ghost Ball's hold stays live for its whole flight, not just the charge-up
    // phase — its recharge only starts once the ball itself fades (see
    // updateGhostBalls), so the room-enter reconciler must not treat an
    // in-flight ball's hold as orphaned.
    const laserChargingLive = !!Neo.loveBombCharging
      || !!Neo.ghostBallCharging
      || (Array.isArray(Neo.ghostBalls) && Neo.ghostBalls.length > 0);
    Neo.MOVE_SLOTS.forEach(slot => {
      const state = Neo.cooldowns[slot] || createCooldownEntry(slot);
      const liveHold = (slot === 'smash' && smashChargingLive && state.holding > 0)
        || (slot === 'dash' && dashChargingLive && state.holding > 0)
        || (slot === 'laser' && laserChargingLive && state.holding > 0);
      if (!liveHold && state.holding > 0) {
        // Drop the phantom hold and let the slot be topped up / recharged below.
        state.holding = 0;
      }
      const hasActiveTimer = state.timers.length > 0 || liveHold;
      if (state.charges <= 0 && !hasActiveTimer) {
        const moveKey = Neo.getEquippedMove(slot);
        const cooldown = getSlotCooldownDuration(slot, moveKey, attackSpeed);
        state.timers.push(cooldown + 0.5);
      } else if (!hasActiveTimer) {
        state.charges = state.maxCharges;
      }
      Neo.cooldowns[slot] = state;
    });
    Neo.updateHud();
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
      // Capacity can grow mid-run (Gelleh's level-5 Zip Lightning charge, or
      // any level-jump path the levelUp hook skips). The stored maxCharges was
      // frozen when the entry was built, so reconcile it here and credit the
      // new headroom as a ready charge — same accounting an Extra Battery uses.
      const trueMax = getMoveMaxStacks(Neo.getEquippedMove(slot), Neo.player?.character || Neo.chosenCharacter, Neo.player);
      if (trueMax > state.maxCharges) {
        const gained = trueMax - state.maxCharges;
        state.maxCharges = trueMax;
        state.charges = Math.min(trueMax, state.charges + gained);
        Neo.cooldowns[slot] = state;
      }
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
      // Every in-flight recharge, so the HUD can fill one pip per timer instead
      // of dumping the most-progressed timer onto the freshly-spent pip (which
      // made an extra charge look like it instantly reloaded).
      timers: state.timers.slice(),
      max: getSlotCooldownDuration(slot, moveKey, attackSpeed),
    };
  }

  function refreshRoomShopCosts(room, difficultyKey = Neo.selectedDifficulty, floorValue = getShopProgressionDepth()) {
    if (!room || room.type !== 'shop') return;
    room.shopOffers = Array.isArray(room.shopOffers) ? room.shopOffers : [];
    let itemIndex = 0;
    room.shopOffers.forEach(offer => {
      if (!offer) return;
      if (offer.type === 'item') {
        if (offer.tutorialOffer) {
          offer.cost = 5;
          itemIndex += 1;
          return;
        }
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
    if (type === 'antony_blemmye') return 'Antony Blemmyae';
    if (type === 'handsome_devil') return 'Handsome Devil';
    if (type === 'god') return 'GOD';
    return titleCase(type);
  }

  function getEnemyLabel(type) {
    if (Neo.BOSS_TYPES.has(type)) return getBossDisplayName(type);
    if (type === 'mirror_knight') return 'Mirror Champion';
    return titleCase(type);
  }

  const ELITE_COUNT_WORDS = { 2: 'twice', 3: 'thrice' };

  function getEliteEnemyLabel(enemy) {
    const baseLabel = getEnemyLabel(enemy?.type || '');
    if (!enemy?.elite || !Array.isArray(enemy.eliteTypes) || enemy.eliteTypes.length === 0) return baseLabel;
    const parts = [];

    // Body rolls (Knight/Knave) are an internal stat roll and are NOT shown in the
    // name tag — only the power words appear.

    // Power words in first-seen order, with a count suffix for duplicates.
    const powers = Array.isArray(enemy.elitePowers) ? enemy.elitePowers : [];
    const counts = new Map();
    powers.forEach(power => counts.set(power, (counts.get(power) || 0) + 1));
    for (const [power, count] of counts) {
      const word = Neo.ELITE_TYPE_DEFS[power]?.label || titleCase(power);
      parts.push(count === 1 ? word : `${word} ${ELITE_COUNT_WORDS[count] || `x${count}`}`);
    }

    return `${parts.join(' ')} Elite ${baseLabel}`.replace(/\s+/g, ' ').trim();
  }

  function getRoomLabel(type) {
    if (!type) return 'Unknown';
    if (type === 'god') return 'God Chamber';
    if (Neo.SPECIAL_ROOM_DEFS?.[type]) return Neo.SPECIAL_ROOM_DEFS[type].name;
    return titleCase(type);
  }

  function getDamageSourceLabel(source) {
    const value = String(source || '').trim();
    if (!value) return 'Unknown';
    if (value === 'no_hit') return 'Never Get Hit';
    if (value === 'lava') return 'Lava';
    if (value === 'thorn_mine') return 'Thorn Trap';
    if (value === 'blood_thorn') return "Mooggy's Blood Thorn";
    if (value === 'challenge_bomb') return 'Trial Bomb';
    if (value === 'collapse_rock') return 'Falling Rock';
    if (value === 'dungeon_collapse') return 'Dungeon Collapse';
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

    const byRivalCharacter = Neo.enemies.find(enemy => enemy?.type === 'rival' && String(enemy?.rivalData?.characterKey || enemy?.rivalKey || '').trim().toLowerCase() === key);
    if (byRivalCharacter) return byRivalCharacter;

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
    const counts = { white: 0, purple: 0, red: 0, blue: 0, green: 0 };
    Neo.ITEM_KEYS.forEach(key => {
      const count = Math.max(0, Number(playerState?.items?.[key] || 0));
      if (count <= 0) return;
      const rarity = String(Neo.itemRegistry.get(key)?.rarity || Neo.ITEM_DEFS[key]?.rarity || 'knight').toLowerCase();
      if (rarity === 'god' || rarity === 'red') counts.red += count;
      else if (rarity === 'wizard' || rarity === 'purple') counts.purple += count;
      else if (rarity === 'blue' || rarity === 'artificer') counts.blue += count;
      else if (rarity === 'green') counts.green += count;
      else counts.white += count;
    });
    return counts;
  }

  // Fill a `.item-rarity-counts` container's badges from a counts object.
  // White / purple / red always show (the core tiers). Blue and green are the
  // rarer Artificer / Knave tiers, so their badges only appear once the player
  // actually owns at least one of that rarity.
  function applyRarityCountBadges(container, counts) {
    if (!container || !counts) return;
    const ALWAYS = ['white', 'purple', 'red'];
    ['white', 'purple', 'red', 'blue', 'green'].forEach(rarity => {
      const badge = container.querySelector(`.rarity-count--${rarity}`);
      if (!badge) return;
      const value = Math.max(0, Number(counts[rarity] || 0));
      // Write into the count span so the leading glyph icon is preserved; fall
      // back to the badge text for any markup without a __num child.
      const numEl = badge.querySelector('.rarity-count__num') || badge;
      numEl.textContent = String(value);
      if (!ALWAYS.includes(rarity)) {
        badge.style.display = value > 0 ? '' : 'none';
      }
    });
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
      // Endless mode score: the wave reached (the wave being fought when the run
      // ended, or the last cleared wave). 0 for non-endless modes.
      endlessWave: Neo.gameMode === 'endless'
        ? Neo.endlessWave + (Neo.endlessWaveActive ? 1 : 0)
        : 0,
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
      loopCrystalsEarned: Math.max(0, Number(Neo.runCrystalsEarned || 0)),
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
    const progressLabel = entry.mode === 'endless' ? `Wave ${entry.endlessWave || 0}` : `Fl.${entry.floor}`;
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
        <span class="rh-row-sub">${escapeHtml(modeLabel)} · ${escapeHtml(progressLabel)} · ${escapeHtml(cause)} · ${escapeHtml(formatRunEndedAt(entry.endedAt))}</span>
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
        <span class="rh-hero-meta">${escapeHtml(entry.difficultyName)} · ${escapeHtml(getRunModeLabel(entry.mode))} · ${entry.mode === 'endless' ? `Wave ${entry.endlessWave || 0}` : `Floor ${entry.floor} · Loop ${entry.loop}`}</span>
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
    const progressStat = entry.mode === 'endless'
      ? `<div class="rh-stat"><span class="rh-stat-label">Wave</span><b class="rh-stat-val">${entry.endlessWave || 0}</b></div>`
      : `<div class="rh-stat"><span class="rh-stat-label">Floor</span><b class="rh-stat-val">${entry.floor}</b></div>
      <div class="rh-stat"><span class="rh-stat-label">Loop</span><b class="rh-stat-val">${entry.loop}</b></div>`;
    return `${killerBanner}<div class="rh-stats-grid">
      ${progressStat}
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
    'Antony Blemmyae': 'antony_blemmye',
    'Antony Blemmye': 'antony_blemmye', // legacy spelling in old death-history records
    'Handsome Devil': 'handsome_devil',
    'GOD': 'god',
    'Mirror Champion': 'thorn_knight',
    'Hunter': 'hunter',
    'Charger': 'charger',
    'Laser': 'laser',
    'Sniper': 'sniper',
    'Machine Gunner': 'machine_gunner',
    'Golem': 'golem',
    'Knave': 'knave',
    'Cult Mage': 'cult_mage',
    'Summoner': 'summoner',
  };

  function resolveKillerSprite(key) {
    if (!key) return 'hunter';
    if (String(key).endsWith('_projectile')) return resolveKillerSprite(String(key).slice(0, -'_projectile'.length));
    if (Neo.SPRITE_DEFS[key]) return key;
    if (killerSpriteMap[key]) return killerSpriteMap[key];
    const normalized = String(key).trim().toLowerCase();
    const rivalCharacterKey = normalized.replace(/^rival[\s_-]+/, '').replace(/\s+/g, '_');
    if (Neo.RIVAL_DEFS?.[rivalCharacterKey] && Neo.SPRITE_DEFS[rivalCharacterKey]) return rivalCharacterKey;
    const legacyRival = Object.entries(Neo.RIVAL_DEFS || {}).find(([, def]) => String(def?.name || '').trim().toLowerCase() === normalized);
    if (legacyRival && Neo.SPRITE_DEFS[legacyRival[0]]) return legacyRival[0];
    if (normalized.startsWith('mirror_') || normalized.startsWith('mirror ')) return 'thorn_knight';
    return 'hunter';
  }

  // Environmental killers have no enemy sprite, so they draw a dedicated hazard icon.
  // Accepts either the source key (explosive_trap) or an old label ("Explosive Trap").
  const killerHazardIconMap = {
    explosive_trap: 'explosive_trap',
    'Explosive Trap': 'explosive_trap',
  };

  function resolveKillerHazardIcon(key) {
    if (!key) return '';
    if (killerHazardIconMap[key]) return killerHazardIconMap[key];
    return '';
  }

  function hydrateRunHistorySprites(root = Neo.ui.runHistoryList) {
    if (!(root instanceof Element)) return;
    root.querySelectorAll('[data-run-character]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      Neo.drawSpriteToCanvas(el, el.dataset.runCharacter || 'thorn_knight', 56);
    });
    root.querySelectorAll('[data-run-killer]').forEach(el => {
      if (!(el instanceof HTMLCanvasElement)) return;
      const hazardIcon = resolveKillerHazardIcon(el.dataset.runKiller);
      if (hazardIcon && typeof Neo.drawHazardKillerIcon === 'function') {
        Neo.drawHazardKillerIcon(el, hazardIcon);
        return;
      }
      Neo.drawSpriteToCanvas(el, resolveKillerSprite(el.dataset.runKiller), el.width);
    });
    Neo.drawItemIconCanvases?.(root, 'data-item-icon');
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
    const backBtn = document.getElementById('charBackBtn');
    const backLabelEl = document.getElementById('charBackLabel');
    const isStory = Neo.gameMode === 'story';
    const skipStoryTutorial = isStory && !!Neo.metaProgress?.storySkipTutorial;
    const phases = ['p1','p2','p3','p4'].slice(0, Neo.mpPlayerCount);
    const phaseIdx = phases.indexOf(Neo.charSelectPhase);
    const isLastPhase = phaseIdx === phases.length - 1;
    const backTarget = phaseIdx > 0 ? PHASE_LABELS[phases[phaseIdx - 1]] : '';
    if (backLabelEl) backLabelEl.textContent = phaseIdx > 0 ? `BACK TO ${backTarget}` : 'BACK TO MENU';
    if (backBtn) backBtn.setAttribute('aria-label', phaseIdx > 0
      ? `Back to ${backTarget.toLowerCase()} character selection`
      : 'Back to menu');
    if (Neo.charSelectPhase && PHASE_LABELS[Neo.charSelectPhase]) {
      const label = PHASE_LABELS[Neo.charSelectPhase];
      if (phaseTag) { phaseTag.textContent = label; phaseTag.className = `charselect-phase-tag ${PHASE_COLORS[Neo.charSelectPhase]}`; phaseTag.classList.remove('hidden'); }
      if (titleEl) titleEl.textContent = `${label}: PICK HERO`;
      if (subtitleEl) subtitleEl.textContent = isLastPhase ? 'Confirm, then enter the dungeon.' : 'Confirm to pass to the next player.';
      if (goBtn) goBtn.textContent = isLastPhase ? 'ENTER DUNGEON' : `CONFIRM ${label}`;
    } else {
      if (phaseTag) phaseTag.classList.add('hidden');
      if (titleEl) titleEl.textContent = 'PICK HERO';
      if (subtitleEl) subtitleEl.textContent = '';
      if (Neo.gameMode === 'competitive') {
        if (subtitleEl) subtitleEl.textContent = 'Weekly run. Hard difficulty is locked.';
        if (goBtn) goBtn.textContent = 'COMPETE';
      } else if (isStory) {
        if (titleEl) titleEl.textContent = 'CHOOSE YOUR STORY';
        if (subtitleEl) subtitleEl.textContent = skipStoryTutorial
          ? 'Begin on Floor 2 with the complete tutorial reward package.'
          : 'A deterministic single-player campaign. Floor 1 is Sarge\'s tutorial.';
        if (goBtn) goBtn.textContent = 'BEGIN STORY';
      } else {
        if (goBtn) goBtn.textContent = 'ENTER DUNGEON';
      }
    }

    const isCompetitive = Neo.gameMode === 'competitive';
    const difficultySelect = document.getElementById('difficultySelect');
    const seedLabel = document.getElementById('seedLabel');
    const seedInput = document.getElementById('seed');
    const seedRow = seedInput?.closest('.seedrow--panel');
    const challengeToggleEl = document.getElementById('challengeToggle');
    const storySkipOption = document.getElementById('storySkipTutorialOption');
    const storySkipInput = document.getElementById('storySkipTutorial');
    storySkipOption?.classList.toggle('hidden', !isStory);
    if (storySkipInput) storySkipInput.checked = skipStoryTutorial;
    if (difficultySelect) difficultySelect.style.pointerEvents = isCompetitive ? 'none' : '';
    if (difficultySelect) difficultySelect.style.opacity = isCompetitive ? '0.35' : '';
    if (seedRow) seedRow.style.display = isCompetitive || isStory ? 'none' : '';
    if (!seedRow && seedLabel) seedLabel.style.display = isCompetitive || isStory ? 'none' : '';
    if (!seedRow && seedInput) seedInput.style.display = isCompetitive || isStory ? 'none' : '';
    if (challengeToggleEl) challengeToggleEl.style.display = isCompetitive || isStory ? 'none' : '';

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

    let activeChar = Neo.charSelectPhase && PHASE_CHAR[Neo.charSelectPhase] ? PHASE_CHAR[Neo.charSelectPhase]() : Neo.chosenCharacter;
    const unlocked = new Set(Neo.metaProgress.unlockedCharacters || ['princess', 'thorn_knight', 'metao']);
    const unlockedDifficulties = getUnlockedDifficultySet();
    const unlockedChallenges = getUnlockedChallengeSet();
    const ownedChallenges = getOwnedChallengeSet();
    if (Neo.metaProgress.godsKilled > 0) unlocked.add('gelleh');
    if (Number(Neo.metaProgress.mooggyDefeats || 0) >= 3) unlocked.add('mooggy');
    if (Number(Neo.metaProgress.bowmanBaneDefeats || 0) > 0) unlocked.add('sarge');
    getCustomCharacterKeys().forEach(key => unlocked.add(key));
    const storyCharacters = new Set(globalThis.NeoNyke?.story?.STORY_CHARACTERS || []);
    const storyUnlocked = isStory
      ? new Set([...unlocked].filter(key => storyCharacters.has(key)))
      : unlocked;
    if (isStory && !storyUnlocked.has(Neo.chosenCharacter)) {
      Neo.chosenCharacter = ['thorn_knight', 'princess', 'metao'].find(key => storyUnlocked.has(key)) || [...storyUnlocked][0];
      activeChar = Neo.chosenCharacter;
    }
    const preferredCharacter = String(Neo.metaProgress.selectedCharacter || Neo.chosenCharacter);
    if (!Neo.charSelectPhase || Neo.charSelectPhase === 'p1') {
      if (storyUnlocked.has(preferredCharacter)) {
        Neo.chosenCharacter = preferredCharacter;
      }
      if (storyUnlocked.has(Neo.chosenCharacter)) {
        Neo.metaProgress.selectedCharacter = Neo.chosenCharacter;
      }
    }
    if (!isCompetitive) {
      if (!unlockedDifficulties.has(Neo.selectedDifficulty)) Neo.selectedDifficulty = 'medium';
      if (Neo.selectedDifficulty === 'custom') Neo.selectedDifficulty = 'medium';
      Neo.metaProgress.selectedDifficulty = Neo.selectedDifficulty;
      Neo.selectedChallenges = normalizeChallengeSelection(Neo.selectedChallenges).filter(key => unlockedChallenges.has(key) && ownedChallenges.has(key));
      Neo.metaProgress.selectedChallenges = normalizeChallengeSelection(Neo.selectedChallenges);
    }
    // A pending tutorial replay can't run as Sarge until the rest of the roster
    // is unlocked. Nudge the selection off Sarge so the player isn't staring at
    // a disabled Go button with no obvious reason.
    if (Neo.chosenCharacter === 'sarge' && isSargeTutorialBlocked()) {
      const fallback = ['thorn_knight', 'princess', 'metao'].find(key => unlocked.has(key))
        || [...unlocked].find(key => key !== 'sarge' && !isCustomCharacterKey(key));
      if (fallback) {
        Neo.chosenCharacter = fallback;
        Neo.metaProgress.selectedCharacter = fallback;
        activeChar = fallback;
      }
    }
    const ownedLegacy = new Set(Neo.metaProgress.unlockedLegacy || []);
    const competitiveUnlocked = isCompetitive ? new Set([...unlocked].filter(k => k !== 'princess' && !isCustomCharacterKey(k))) : storyUnlocked;
    if (isCompetitive && competitiveUnlocked.size > 0 && !competitiveUnlocked.has(Neo.chosenCharacter)) {
      Neo.chosenCharacter = [...competitiveUnlocked][0];
      Neo.metaProgress.selectedCharacter = Neo.chosenCharacter;
    }
    Neo.uiController.updateCharacterSelection(isCompetitive ? competitiveUnlocked : storyUnlocked, activeChar);
    Neo.uiController.updateDifficultySelection(unlockedDifficulties, isCompetitive ? 'hard' : Neo.selectedDifficulty, Neo.metaProgress.loopCrystals || 0);
    Neo.uiController.updateChallengeSelection(unlockedChallenges, ownedChallenges, isCompetitive ? [] : Neo.selectedChallenges, Neo.metaProgress.loopCrystals || 0, Neo.metaProgress.coins || 0);
    Neo.uiController.updateLegacySelection(ownedLegacy, Neo.metaProgress.loopCrystals || 0);
    Neo.syncCharacterUiTheme();
  }

  function setGameState(nextState) {
    // Healing Zone is hold-to-charge and only ticks/releases inside the play-state
    // update loop. If we leave 'play' mid-charge (pause, inventory/shop/anvil,
    // dialogue, room transition, death) the charge would otherwise be stranded:
    // its smash charge was spent with a deferred timer, so the pip sits empty at
    // 0 cooldown forever. Cancel it here and queue the recharge so the pip recovers.
    if (nextState !== 'play' && Neo.healingZoneCharging) {
      Neo.healingZoneCharging = false;
      Neo.healingZoneChargeTime = 0;
      Neo.smashHeld = false;
      queueHeldSkillRecharge('smash', getSmashCooldownDuration(Neo.getAttackSpeedValue()));
    }
    if (nextState !== 'play' && Neo.deathBallCharging) {
      Neo.deathBallCharging = false;
      Neo.deathBallChargeTime = 0;
      Neo.deathBallPowerUp = false;
      Neo.smashHeld = false;
      queueHeldSkillRecharge('smash', getSmashCooldownDuration(Neo.getAttackSpeedValue()));
    }
    // Nimrod Stomp's hold-to-charge (dash slot) needs the same stranded-charge
    // guard as Healing Zone / Death Ball above.
    if (nextState !== 'play' && Neo.nimrodStompCharging) {
      Neo.nimrodStompCharging = false;
      Neo.nimrodStompChargeTime = 0;
      Neo.dashHeld = false;
      queueHeldSkillRecharge('dash', getDashCooldownDuration('nimrod_stomp', Neo.getAttackSpeedValue()));
    }
    // Love Bomb Laser's hold-to-charge (laser slot) needs the same
    // stranded-charge guard as the smash/dash charge moves above.
    if (nextState !== 'play' && Neo.loveBombCharging) {
      Neo.loveBombCharging = false;
      Neo.loveBombChargeTime = 0;
      queueHeldSkillRecharge('laser', getLaserCooldownDuration('love_bomb_laser', Neo.getAttackSpeedValue()));
    }
    if (Neo.gameStateManager) Neo.gameStateManager.setState(nextState);
    else {
      Neo.gameState = nextState;
      Neo.uiController.setState(nextState);
    }
    const isBossRush = Neo.gameMode === 'boss_rush' || Neo.gameMode === 'rival_rumble';
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

  function prepareSinglePlayerSession() {
    const OfflineGameSession = globalThis.NeoNyke?.multiplayer?.OfflineGameSession;
    if (typeof OfflineGameSession !== 'function') {
      return Promise.reject(new Error('OfflineGameSession is unavailable'));
    }

    const previousSession = Neo.gameSession;
    const session = new OfflineGameSession();
    Neo.gameSession = session;
    const ready = (async () => {
      if (previousSession && previousSession !== session) await previousSession.dispose?.();
      await session.initialize();
      if (Neo.gameSession !== session) {
        await session.dispose();
        return Neo.gameSession;
      }
      return session;
    })();
    Neo.gameSessionReady = ready;
    ready.catch(() => {
      if (Neo.gameSession === session) {
        Neo.gameSession = null;
        Neo.gameSessionReady = null;
      }
    });
    return ready;
  }

  function ensureSinglePlayerSession() {
    if (Neo.gameSession?.mode === 'single-player' && Neo.gameSession.ready) {
      return Promise.resolve(Neo.gameSession);
    }
    if (Neo.gameSession?.mode === 'single-player' && Neo.gameSessionReady) {
      return Neo.gameSessionReady;
    }
    return prepareSinglePlayerSession();
  }

  async function startGame(resume) {
    // Any startGame call boots a LOCAL run (the early-return modes below are all
    // local; browser-network multiplayer never routes through here). If a live
    // network game is on screen, tear its view down first so a solo run can never
    // start on top of it — the session stays connected in the background so the
    // Multiplayer panel can still offer a return. This is the fix for Single
    // Player re-opening the multiplayer game and its HUD bleeding into the menu.
    Neo.detachBrowserMultiplayerGame?.();
    if (Neo.gameMode === 'endless') { startEndless(); return; }
    if (Neo.gameMode === 'practice') { startPractice(); return; }
    if (Neo.gameMode === 'boss_rush') { startBossRush(); return; }
    if (Neo.gameMode === 'rival_rumble') { startRivalRumble(); return; }
    if (Neo.gameMode === 'coop') { startCoop(); return; }
    if (Neo.gameMode === 'pvp') { startPvp(); return; }
    if (Neo.gameMode === 'competitive') { void startCompetitive(); return; }
    // Safety net for the Sarge tutorial gate: if a replay was requested while
    // Sarge is selected but the rest of the roster isn't unlocked yet, drop the
    // replay rather than running the tutorial as Sarge. The charselect UI gates
    // this before we get here, so this only catches stale/programmatic requests.
    if (!resume && Neo.chosenCharacter === 'sarge' && isSargeTutorialBlocked()) {
      consumeReplayTutorialRequest();
    }
    const menuTutorialLaunch = !resume && Neo.tutorialLaunchPending === true;
    // Consume the session route immediately. A failed/aborted start must never
    // leak Tutorial into the next mode selection.
    Neo.tutorialLaunchPending = false;
    const savedTutorialReplay = !resume && consumeReplayTutorialRequest();
    const forceTutorialReplay = menuTutorialLaunch || savedTutorialReplay;
    // Tutorial mode is opt-in from the dedicated Tutorial action/settings.
    // A normal New Game must stay a normal run even when the tutorial has never
    // been completed or its content version changed.
    const storyRun = Neo.gameMode === 'story';
    const storySkipTutorial = storyRun && !!Neo.metaProgress?.storySkipTutorial;
    const shouldRunTutorial = Neo.gameMode === 'normal'
      && forceTutorialReplay;
    const shouldRunGuidedFloor = (storyRun && !storySkipTutorial) || shouldRunTutorial;
    // Stamp "last played" so the green tutorial button only re-offers after a long absence.
    if (Neo.metaProgress) { Neo.metaProgress.lastSeenAt = Date.now(); Neo.persistMetaSoon(); }
    setGameState('play');

    if (resume && Neo.activeRun) {
      restoreRun(Neo.activeRun);
      if (!Neo.activeRun.tutorialState) resetTutorialState(storyRun ? Number(Neo.activeRun.floor || 1) === 1 : shouldRunTutorial);
    } else {
      // The tutorial runs on a fixed seed so its layout, forced relic, and
      // ladder room are identical for every new player; any typed seed is
      // ignored only while the tutorial is active.
      Neo.baseSeedStr = storyRun
        ? (globalThis.NeoNyke?.story?.storySeed?.(Neo.chosenCharacter, storySkipTutorial ? 2 : 1) || `NEONYKE-STORY-V1|${Neo.chosenCharacter}`)
        : shouldRunGuidedFloor
          ? TUTORIAL_SEED
          : (Neo.ui.seed.value.trim() || createRandomSeed());
      Neo.selectedDifficulty = normalizeDifficulty(Neo.selectedDifficulty);
      Neo.selectedChallenges = storyRun || shouldRunTutorial
        ? []
        : normalizeChallengeSelection(Neo.metaProgress.selectedChallenges);
      Neo.runLoopIndex = 0;
      Neo.runRevivesUsed = 0;
      Neo.runCrystalsEarned = 0;
      Neo.lastDeathEntryId = '';
      syncSeedState();
      Neo.floor = storySkipTutorial ? 2 : 1;
      Neo.gameElapsedTime = 0;
      window.achievementManager?.resetRunCounters();
      Neo.resetRunUnlocks?.();
      invalidateRunStatCaches();
      Neo.player = createDefaultPlayer();
      Neo.storyState = storyRun
        ? globalThis.NeoNyke?.story?.createStoryState?.(Neo.player.character)
        : null;
      resetTutorialState(shouldRunGuidedFloor);
      if (storySkipTutorial) grantStoryTutorialSkipPackage();
      else grantTutorialResources();
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
        if (Number(Neo.player.items?.robot_arm || 0) > 0) Neo.player.robotArmReady = true;
        applySandboxPlayerSetup(Neo.player);
      }
      applyRunChallengeStartModifiers();
      Neo.lastDamageSource = '';
      Neo.lastDamageSourceKey = '';
      resetScene();
      Neo.generateFloor();
      if (shouldRunGuidedFloor) Neo.tutorialController?.start?.();
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
    Neo.runCrystalsEarned = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 1;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    Neo.resetRunUnlocks?.();
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
    Neo.runCrystalsEarned = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 1;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    Neo.resetRunUnlocks?.();
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
        Neo.uiController?.setCompetitivePanelOpen?.(true);
        return;
      }
    }
    Neo._competitiveSeed = null;
    // Competitive setup must never inherit tutorial state from a previous run.
    // Clear it before entering play or generating the server-seeded floor.
    resetTutorialState(false);
    setGameState('play');
    Neo.baseSeedStr = serverSeed;
    Neo.selectedDifficulty = 'hard';
    Neo.selectedChallenges = [];
    Neo.runLoopIndex = 0;
    Neo.runRevivesUsed = 0;
    Neo.runCrystalsEarned = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 1;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    Neo.resetRunUnlocks?.();
    invalidateRunStatCaches();
    Neo.player = createDefaultPlayer();
    resetMultiplayerState();
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    resetScene();
    Neo.generateFloor();
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
    Neo.runCrystalsEarned = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 1;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    Neo.resetRunUnlocks?.();
    Neo.endlessWave = 0;
    Neo.endlessWaveActive = false;
    Neo.endlessRespawnTimer = 0;
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
    Neo.player = createDefaultPlayer();
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    resetScene();
    // Endless builds rooms via startEndlessRoom (no generateFloor) and scales off
    // the wave counter, so pin the cumulative floor count to the (fixed) floor.
    Neo.floorsEntered = Neo.floor;
    resetRngStreams();
    startEndlessRoom();
    Neo.updateEndlessWaveHud();
    Neo.scheduleRunSave();
    if (!Neo.loopStarted) { Neo.loopStarted = true; requestAnimationFrame(Neo.loop); }
  }

  function startPractice() {
    setGameState('play');
    Neo.baseSeedStr = createRandomSeed();
    Neo.selectedDifficulty = Neo.practiceVariant === 'challenges'
      ? normalizeDifficulty(Neo.selectedDifficulty)
      : Neo.practiceVariant === 'beams' ? 'hard' : 'easy';
    Neo.selectedChallenges = [];
    Neo.runLoopIndex = 0;
    Neo.runRevivesUsed = 0;
    Neo.runCrystalsEarned = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = Neo.practiceVariant === 'beams' ? 8 : 5;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    Neo.resetRunUnlocks?.();
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
    Neo.player = createDefaultPlayer();
    Neo.player.maxHp = Neo.practiceVariant === 'beams' ? 1500 : 1000;
    Neo.player.hp = Neo.player.maxHp;
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    resetScene();
    // Practice builds its room manually (no generateFloor), so set the cumulative
    // floor count to match the practice floor directly.
    Neo.floorsEntered = Neo.floor;
    resetRngStreams();
    if (Neo.practiceVariant === 'challenges') {
      buildChallengePracticeFloor();
      syncPracticeMaxHpControls();
      if (!Neo.loopStarted) { Neo.loopStarted = true; requestAnimationFrame(Neo.loop); }
      return;
    }
    Neo.rooms = [];
    const room = Neo.createRoomRecord({ x: 4, y: 4 }, { type: 'combat', doors: { n: false, s: false, e: false, w: false }, cleared: true });
    Neo.decorateRoomData(room);
    Neo.rooms.push(room);
    Neo.currentRoom = room;
    Neo.player.x = Neo.START_X;
    Neo.player.y = Neo.START_Y;
    if (Neo.practiceVariant === 'beams') {
      Neo.beamPracticeWave = 0;
      Neo.beamPracticeRespawnTimer = 0;
      spawnBeamPracticeWave();
      Neo.spawnParticle({
        x: Neo.player.x,
        y: Neo.player.y - 46,
        life: 1.6,
        text: 'LASER GAUNTLET',
        c: '#74f5ff',
      });
    }
    syncPracticeMaxHpControls();
    if (!Neo.loopStarted) { Neo.loopStarted = true; requestAnimationFrame(Neo.loop); }
  }

  const BEAM_PRACTICE_MODES = Object.freeze([
    'blood_beam',
    'love_beam',
    'turtle_wave',
    'wizard_lazer',
    'mooggy_blood_beam',
    'thorn_blood_beams',
    'holy_eye_beams',
    'god_sweep',
  ]);

  const BEAM_PRACTICE_SPAWNS = Object.freeze([
    { x: 180, y: 155 },
    { x: Neo.ROOM_W - 180, y: 155 },
    { x: 180, y: Neo.ROOM_H - 155 },
    { x: Neo.ROOM_W - 180, y: Neo.ROOM_H - 155 },
    { x: Neo.ROOM_W / 2, y: 135 },
    { x: Neo.ROOM_W / 2, y: Neo.ROOM_H - 135 },
  ]);

  function spawnBeamPracticeWave() {
    if (Neo.gameMode !== 'practice' || Neo.practiceVariant !== 'beams' || !Neo.currentRoom) return false;
    Neo.beamPracticeWave = Math.max(0, Number(Neo.beamPracticeWave || 0)) + 1;
    Neo.beamPracticeRespawnTimer = 0;
    const wave = Neo.beamPracticeWave;
    const count = Math.min(BEAM_PRACTICE_SPAWNS.length, 4 + Math.floor((wave - 1) / 2));
    const strength = 1 + Math.max(0, wave - 1) * 0.12;
    Neo.currentRoom.cleared = false;

    for (let index = 0; index < count; index += 1) {
      const authored = BEAM_PRACTICE_SPAWNS[index];
      const safeSpawn = Neo.findSafeEnemySpawnPoint?.(authored.x, authored.y, 18) || authored;
      const modeIndex = ((wave - 1) * 4 + index) % BEAM_PRACTICE_MODES.length;
      const mode = BEAM_PRACTICE_MODES[modeIndex];
      const enemy = Neo.spawnEnemy('laser', safeSpawn.x, safeSpawn.y, false);
      if (!enemy) continue;
      enemy.elite = true;
      enemy.eliteTypes = ['knight', 'knight', 'lazered'];
      Neo.applyEliteTypes?.(enemy);
      enemy.max = Math.max(1, Math.round(enemy.max * strength));
      enemy.hp = enemy.max;
      enemy.dmg = Math.max(1, Math.round(enemy.dmg * (1.18 + Math.max(0, wave - 1) * 0.05)));
      enemy.speed *= 1.08;
      enemy.beamPracticeUser = true;
      enemy.beamPracticeModes = [mode];
      enemy.eliteLaserModeIndex = 0;
      enemy.eliteLaserCd = 0.4 + index * 0.16;
      enemy.displayName = `${Neo.MOVE_DEFS?.[mode]?.name || Neo.titleCase?.(mode) || 'Laser'} User`;
    }
    Neo.updateObjective?.();
    Neo.spawnParticle({
      x: Neo.ROOM_W / 2,
      y: Neo.WALL + 42,
      life: 1.15,
      text: `BEAM WAVE ${wave}`,
      c: '#dffbff',
    });
    return true;
  }

  function updateBeamPractice(dt) {
    if (Neo.gameMode !== 'practice' || Neo.practiceVariant !== 'beams' || Neo.gameState !== 'play') return false;
    const activeUsers = Neo.enemies.filter(enemy => enemy?.beamPracticeUser && !enemy.dead && enemy.hp > 0);
    if (activeUsers.length > 0) return true;
    if (!(Neo.beamPracticeRespawnTimer > 0)) {
      Neo.beamPracticeRespawnTimer = 2.5;
      if (Neo.player) {
        Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + Neo.player.maxHp * 0.25);
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 0.85, text: 'NEXT BEAM WAVE', c: '#8dffcf' });
      }
      Neo.updateObjective?.();
      return true;
    }
    Neo.beamPracticeRespawnTimer = Math.max(0, Neo.beamPracticeRespawnTimer - dt);
    if (Neo.beamPracticeRespawnTimer <= 0) spawnBeamPracticeWave();
    return true;
  }

  const CHALLENGE_PRACTICE_LAYOUT = [
    { type: 'mirror', gx: 4, gy: 1, x: 235, y: 260 },
    { type: 'circuit', gx: 7, gy: 2, x: 450, y: 260 },
    { type: 'bomb', gx: 7, gy: 6, x: 665, y: 260 },
    { type: 'survival', gx: 4, gy: 7, x: 235, y: 440 },
    { type: 'runes', gx: 1, gy: 6, x: 450, y: 440 },
    { type: 'storm', gx: 1, gy: 2, x: 665, y: 440 },
  ];

  function resetChallengePracticeRoom(room) {
    if (!room?.practiceChallengeRoom) return false;
    room.cleared = false;
    room.challengeStarted = false;
    room.challengeRewardSpawned = false;
    room.challengeFailed = false;
    room.challengeTimer = 0;
    room.challengeTick = 0;
    room.challengeData = {};
    room.enemies = [];
    room.deadBodies = [];
    room.projectiles = [];
    room.chests = [];
    room.pickups = [];
    room.hazards = [];
    Neo.gameEvents.emit('challenge:reset', { room, challengeType: room.challengeType || 'mirror' });
    return true;
  }

  function ensureChallengePracticeReturnPortal(room = Neo.currentRoom) {
    if (Neo.gameMode !== 'practice' || Neo.practiceVariant !== 'challenges' || !room?.practiceChallengeRoom || !room.cleared) return false;
    const pickups = room === Neo.currentRoom ? Neo.pickups : room.pickups;
    if (!Array.isArray(pickups) || pickups.some(pickup => pickup?.type === 'challengePracticePortal' && pickup.returnToHub)) return false;
    pickups.push({
      x: Neo.ROOM_W / 2,
      y: Neo.ROOM_H - Neo.WALL - 34,
      type: 'challengePracticePortal',
      targetGx: 4,
      targetGy: 4,
      destinationLabel: 'START',
      returnToHub: true,
    });
    if (room === Neo.currentRoom) {
      Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H - Neo.WALL - 58, life: 0.9, text: 'RETURN PORTAL', c: '#8dffcf' });
    }
    return true;
  }

  function buildChallengePracticeFloor() {
    Neo.rooms = [];
    const hub = Neo.createRoomRecord(
      { x: 4, y: 4 },
      { type: 'start', doors: { n: false, s: false, e: false, w: false }, cleared: true, explored: true, visited: true, practiceChallengeHub: true },
    );
    Neo.decorateRoomData(hub);
    hub.pickups = CHALLENGE_PRACTICE_LAYOUT.map(entry => ({
      x: entry.x,
      y: entry.y,
      type: 'challengePracticePortal',
      targetGx: entry.gx,
      targetGy: entry.gy,
      destinationLabel: Neo.getChallengeTrialLabel(entry.type),
      challengeType: entry.type,
    }));
    Neo.rooms.push(hub);

    CHALLENGE_PRACTICE_LAYOUT.forEach(entry => {
      const room = Neo.createRoomRecord(
        { x: entry.gx, y: entry.gy },
        { type: 'challenge', doors: { n: false, s: false, e: false, w: false }, practiceChallengeRoom: true },
      );
      Neo.decorateRoomData(room);
      room.challengeType = entry.type;
      room.layoutArchetype = 'open';
      room.layoutChambers = [];
      room.structures = [];
      room.destructibles = [];
      room.hazards = [];
      room.decorations = [];
      Neo.rooms.push(room);
    });

    Neo.currentRoom = null;
    Neo.enterRoom(hub);
    Neo.player.x = Neo.START_X;
    Neo.player.y = Neo.START_Y;
    Neo.spawnParticle({ x: Neo.START_X, y: Neo.START_Y - 46, life: 1.4, text: 'CHALLENGE TESTING', c: '#d7f6ff' });
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
    Neo.runCrystalsEarned = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 5;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    Neo.resetRunUnlocks?.();
    Neo.bossRushStage = 0;
    Neo.bossRushActive = false;
    clearBossRushNextSpawn();
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
    Neo.player = createDefaultPlayer();
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    resetScene();
    // Boss rush builds its room manually (no generateFloor); match the floor count
    // to the starting floor so enemy scaling stays consistent.
    Neo.floorsEntered = Neo.floor;
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
    updateBossRushHud();
    // Spawn first boss immediately
    spawnBossRushBoss();
    if (!Neo.loopStarted) { Neo.loopStarted = true; requestAnimationFrame(Neo.loop); }
  }

  function spawnBossRushBoss() {
    const bossType = BOSS_RUSH_ORDER[Neo.bossRushStage];
    if (!bossType) return;
    const safeSpawn = findBossRushSpawnPoint();
    if (!safeSpawn) {
      Neo.bossRushActive = false;
      Neo.currentRoom.cleared = true;
      Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 50, life: 1.2, text: 'NO SAFE BOSS SPAWN', c: '#ff8b8b' });
      return;
    }
    Neo.bossRushActive = true;
    Neo.currentRoom.cleared = false;
    clearBossRushNextSpawn();
    let boss;
    if (bossType === 'artificer_knave') {
      // Step 1: Spawn as a regular knave
      boss = Neo.spawnEnemy('knave', safeSpawn.x, safeSpawn.y, false);
      boss.bossRushStage = Neo.bossRushStage;
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
            Neo.ringBurst(boss.x, boss.y, 32 + i * 4, i % 2 === 0 ? '#ffd27d' : '#fffbe0', 0.18);
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
      boss.bossRushStage = Neo.bossRushStage;
      const playedCutscene = Neo.tryPlayBossIntroCutscene(boss, bossType);
      const line = Neo.BOSS_OPENING_DIALOGUE[bossType];
      if (!playedCutscene && boss && line) Neo.sayOverEntity(boss, line);
      if (bossType === 'god') Neo.playGodDialogue(1);
    }
    Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 50, life: 1.4, text: `BOSS ${Neo.bossRushStage + 1}: ${getBossDisplayName(bossType).toUpperCase()}`, c: '#ff8b8b' });
  }

  function findBossRushSpawnPoint(radius = 18) {
    const candidates = [
      { x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 40 },
      { x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 + 120 },
      { x: Neo.ROOM_W / 2 - 190, y: Neo.ROOM_H / 2 },
      { x: Neo.ROOM_W / 2 + 190, y: Neo.ROOM_H / 2 },
      { x: Neo.ROOM_W / 2 - 220, y: Neo.ROOM_H / 2 - 140 },
      { x: Neo.ROOM_W / 2 + 220, y: Neo.ROOM_H / 2 - 140 },
      { x: Neo.ROOM_W / 2 - 220, y: Neo.ROOM_H / 2 + 140 },
      { x: Neo.ROOM_W / 2 + 220, y: Neo.ROOM_H / 2 + 140 },
    ];
    for (const candidate of candidates) {
      const x = Neo.clamp(candidate.x, Neo.WALL + radius, Neo.ROOM_W - Neo.WALL - radius);
      const y = Neo.clamp(candidate.y, Neo.WALL + radius, Neo.ROOM_H - Neo.WALL - radius);
      const safeSpawn = Neo.findSafeEnemySpawnPoint(x, y, radius);
      if (safeSpawn) return safeSpawn;
    }
    return null;
  }

  function onBossRushBossDefeated() {
    if (Neo.gameMode !== 'boss_rush') return;
    Neo.bossRushActive = false;
    Neo.bossRushStage += 1;
    updateBossRushHud();
    if (Neo.bossRushStage >= BOSS_RUSH_ORDER.length) {
      clearBossRushNextSpawn();
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
    scheduleBossRushNextSpawn(4);
  }

  function scheduleBossRushNextSpawn(delaySeconds = 4) {
    clearBossRushNextSpawn();
    const stage = Neo.bossRushStage;
    Neo.bossRushNextSpawnAt = Date.now() + delaySeconds * 1000;
    const tick = () => {
      if (Neo.gameMode !== 'boss_rush' || Neo.bossRushStage !== stage) {
        clearBossRushNextSpawn();
        return;
      }
      if (Neo.gameState !== 'play') {
        Neo.bossRushNextSpawnTimeout = setTimeout(tick, 250);
        return;
      }
      if (Date.now() < Neo.bossRushNextSpawnAt) {
        Neo.bossRushNextSpawnTimeout = setTimeout(tick, 100);
        return;
      }
      clearBossRushNextSpawn();
      spawnBossRushBoss();
    };
    Neo.bossRushNextSpawnTimeout = setTimeout(tick, 100);
    updateBossRushHud();
  }

  function clearBossRushNextSpawn() {
    if (Neo.bossRushNextSpawnTimeout) clearTimeout(Neo.bossRushNextSpawnTimeout);
    Neo.bossRushNextSpawnTimeout = null;
    Neo.bossRushNextSpawnAt = 0;
    updateBossRushHud();
  }

  // Shared by Boss Rush and Rival Rumble: both reuse the same #timerBossSlot
  // stage counter, just with a different label/total/active-flag/next-spawn-at.
  function updateBossRushHud() {
    const isRivalRumble = Neo.gameMode === 'rival_rumble';
    const order = isRivalRumble ? (Neo.rivalRumbleOrder || []) : BOSS_RUSH_ORDER;
    const stage = isRivalRumble ? Number(Neo.rivalRumbleStage || 0) : Number(Neo.bossRushStage || 0);
    const active = isRivalRumble ? Neo.rivalRumbleActive : Neo.bossRushActive;
    const nextSpawnAt = isRivalRumble ? Neo.rivalRumbleNextSpawnAt : Neo.bossRushNextSpawnAt;
    const displayStage = Math.min(stage + 1, order.length);
    if (Neo.ui.bossRushSlotLabel) {
      Neo.ui.bossRushSlotLabel.textContent = isRivalRumble
        ? (Neo.rivalRumbleFinale ? 'FINALE' : 'RIVAL')
        : 'BOSS';
    }
    if (Neo.ui.bossRushStageNum) Neo.ui.bossRushStageNum.textContent = displayStage;
    if (Neo.ui.bossRushStageNum2) Neo.ui.bossRushStageNum2.textContent = displayStage;
    if (Neo.ui.bossRushStageTotal2) Neo.ui.bossRushStageTotal2.textContent = order.length;
    if (!Neo.ui.bossRushNextTimer) return;
    const remainingMs = Math.max(0, Number(nextSpawnAt || 0) - Date.now());
    const showTimer = (Neo.gameMode === 'boss_rush' || isRivalRumble) && !active && remainingMs > 0;
    Neo.ui.bossRushNextTimer.classList.toggle('hidden', !showTimer);
    Neo.ui.bossRushNextTimer.textContent = showTimer ? `NEXT ${(remainingMs / 1000).toFixed(1)}s` : '';
  }

  // Rival Rumble: a 1v1 tournament against every rival in the roster (minus the
  // chosen character), each leveled to match the player instead of scaling off
  // floor number. Mirrors Boss Rush's manual single-room setup and stage
  // sequencing, but fights rivals via injectRivalToCurrentRoom instead of
  // spawnEnemy, and skips the normal rival "extra life / return later" flavor
  // (see the rival_rumble branch inside the enemy.type === 'rival' death
  // handler in combat.js) since a duel should end cleanly each time.
  function getRivalRumbleOrder() {
    const roster = Object.keys(Neo.CHARACTER_DEFS || {})
      .filter(key => key !== Neo.chosenCharacter && Neo.RIVAL_DEFS?.[key]);
    const order = createScopedRandom('rival-rumble:order');
    return roster
      .map(key => ({ key, sort: order() }))
      .sort((a, b) => a.sort - b.sort)
      .map(entry => entry.key);
  }

  function startRivalRumble() {
    setGameState('play');
    Neo.baseSeedStr = createRandomSeed();
    Neo.selectedDifficulty = normalizeDifficulty(Neo.selectedDifficulty);
    Neo.selectedChallenges = [];
    Neo.runLoopIndex = 0;
    Neo.runRevivesUsed = 0;
    Neo.runCrystalsEarned = 0;
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = 5;
    Neo.gameElapsedTime = 0;
    window.achievementManager?.resetRunCounters();
    Neo.resetRunUnlocks?.();
    clearRivalRumbleNextSpawn();
    resetTutorialState(false);
    resetMultiplayerState();
    invalidateRunStatCaches();
    Neo.player = createDefaultPlayer();
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    resetScene();
    // resetScene() zeroes rivalRumbleOrder/Stage/Active, so the tournament
    // order must be rolled after it, not before.
    Neo.rivalRumbleOrder = getRivalRumbleOrder();
    Neo.rivalRumbleStage = 0;
    Neo.rivalRumbleActive = false;
    // Rival Rumble builds its room manually (no generateFloor); match the floor
    // count to the starting floor so incidental floor-scaled systems agree.
    Neo.floorsEntered = Neo.floor;
    resetRngStreams();
    Neo.rooms = [];
    const room = Neo.createRoomRecord({ x: 4, y: 4 }, { type: 'combat', doors: { n: false, s: false, e: false, w: false }, cleared: false });
    Neo.decorateRoomData(room);
    Neo.rooms.push(room);
    Neo.currentRoom = room;
    Neo.rivals = [];
    Neo.pendingRivalDescends = [];
    Neo.pendingRivalReturns = [];
    Neo.slainRivalKeys = [];
    Neo.player.x = Neo.START_X;
    Neo.player.y = Neo.START_Y;
    // Grant 3 random starting items
    const rivalRumbleStartRandom = createScopedRandom('rival-rumble:starting-items');
    for (let i = 0; i < 3; i++) {
      const key = Neo.rollItemDrop({ elite: i === 2, random: rivalRumbleStartRandom });
      if (key) Neo.collectItem(key);
    }
    Neo.addCoins(120);
    updateBossRushHud();
    // Spawn first rival immediately
    spawnRivalRumbleRival();
    Neo.updateObjective();
    if (!Neo.loopStarted) { Neo.loopStarted = true; requestAnimationFrame(Neo.loop); }
  }

  // Builds one rival's roster data sized to the player's current level (rather
  // than floor-scaled like a normal run) and puts it into the fight via the
  // same live-entity path normal rival encounters use. In the finale gauntlet
  // (isFinale: true) every previously-beaten rival returns at once with the
  // same "defeated and came back" bonus a normal run grants a returning
  // rival: double max HP (applyRivalLevelStats' hasReturned check, driven by
  // lives < RIVAL_STARTING_LIVES) plus a 5-piece god-tier loadout.
  function spawnRivalRumbleRival(charKey = null, options = {}) {
    const order = Neo.rivalRumbleOrder || [];
    const resolvedKey = charKey || order[Neo.rivalRumbleStage];
    if (!resolvedKey) return;
    const def = Neo.RIVAL_DEFS[resolvedKey];
    if (!def) return;
    const isFinale = !!options.isFinale;
    const startingLoot = Neo.createRivalStartingLoot?.(resolvedKey) || [];
    Neo.rivalRumbleActive = true;
    Neo.currentRoom.cleared = false;
    clearRivalRumbleNextSpawn();
    const level = Neo.clamp(Math.round(Number(Neo.player?.level) || 1), 1, Number(Neo.RIVAL_LEVEL_CAP || 9));
    const baseMoveInterval = Neo.RIVAL_MOVE_INTERVAL_BASE + Neo.nextRandom('world') * 4;
    const rival = {
      rivalId: `rumble-${resolvedKey}-${Neo.rivalRumbleStage}-${Math.floor(Neo.nextRandom('world') * 1000000)}`,
      characterKey: resolvedKey,
      name: def.name,
      color: def.color,
      attackStyle: def.attackStyle,
      enterLine: isFinale ? `You beat me once. Not again — not with all of us.` : def.enterLine,
      deathLine: def.deathLine,
      roomGx: Neo.currentRoom.gx,
      roomGy: Neo.currentRoom.gy,
      moveTimer: 6 + Neo.nextRandom('world') * 5,
      moveInterval: baseMoveInterval,
      baseMoveInterval,
      baseHp: def.hp,
      baseDmg: def.dmg,
      baseSpeed: def.speed,
      baseAttackCd: def.attackCd,
      hp: def.hp,
      max: def.hp,
      dmg: def.dmg,
      speed: def.speed,
      r: def.r,
      attackCd: def.attackCd,
      level,
      xp: 0,
      xpToNext: 22 + Neo.floor * 4,
      growthTick: 0,
      weapons: (Neo.RIVAL_WEAPON_LOADOUTS?.[resolvedKey] || []).map(weapon => ({ ...weapon })),
      // Mirror the playable character's real starting inventory. Later rivals
      // have also had more tournament time to loot, and higher-level rivals have
      // accumulated additional gear through their progression.
      loot: startingLoot,
      homeGx: Neo.currentRoom.gx,
      homeGy: Neo.currentRoom.gy,
      objectiveGx: Neo.currentRoom.gx,
      objectiveGy: Neo.currentRoom.gy,
      objectiveKind: 'patrol',
      route: [],
      aggroTimer: 0,
      lastKnownPlayerGx: Neo.currentRoom.gx,
      lastKnownPlayerGy: Neo.currentRoom.gy,
      hpSnapshot: def.hp,
      memory: Neo.createDefaultRivalMemory(),
      // Tournament rivals enter to duel, not to run their normal-room warning or
      // loot-claiming personality opener.
      brain: { ...Neo.createDefaultRivalBrain(resolvedKey), stance: 'hostile', intention: 'engage' },
      // 1 life either way (dies for good on this loss). Being below
      // RIVAL_STARTING_LIVES (2) is exactly the hasReturned condition
      // applyRivalLevelStats checks for the return-HP scale, so a finale
      // rival gets that boost automatically — same mechanic a normal run's
      // returning rival gets.
      lives: 1,
      relationship: isFinale ? -5 : 0,
      friend: false,
      vendetta: isFinale,
      godGearGranted: false,
      startingGearGranted: true,
      slotCooldowns: { melee: 0, laser: 0, smash: 0, dash: 0 },
      slotLastUsedAt: {},
      dead: false,
      rivalRumbleStage: Neo.rivalRumbleStage,
      rivalRumbleFinale: isFinale,
    };
    Neo.applyRivalLevelStats(rival, { syncLiveEnemy: false, keepHpRatio: false });
    const progressionItems = Math.floor(Math.max(0, level - 1) / 2)
      + Math.floor(Math.max(0, Number(Neo.rivalRumbleStage || 0)) / 2);
    if (progressionItems > 0) {
      Neo.grantRivalItems?.(rival, progressionItems, { syncLiveEnemy: false });
    }
    if (isFinale) {
      rival.godGearGranted = true;
      Neo.grantRivalItems?.(rival, 5, { godTier: true, syncLiveEnemy: false });
    }
    // Stat derivation preserves the previous HP value by design for living
    // roaming rivals. A newly spawned tournament opponent should enter at the
    // full max HP earned from its level and inventory.
    rival.hp = rival.max;
    rival.hpSnapshot = rival.max;
    Neo.rivals.push(rival);
    Neo.injectRivalToCurrentRoom(rival);
    if (!isFinale) {
      Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 50, life: 1.4, text: `RIVAL ${Neo.rivalRumbleStage + 1}: ${def.name.toUpperCase()}`, c: def.color });
    }
    Neo.updateObjective();
  }

  // Finale: every rival beaten in the 1-on-1 gauntlet returns at once, each
  // carrying the "defeated and came back" bonus (see spawnRivalRumbleRival).
  // Fires once all individual duels are done instead of an immediate win.
  function spawnRivalRumbleFinale() {
    const order = Neo.rivalRumbleOrder || [];
    Neo.rivalRumbleActive = true;
    Neo.rivalRumbleFinale = true;
    Neo.currentRoom.cleared = false;
    clearRivalRumbleNextSpawn();
    Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 50, life: 1.8, text: 'FINAL GAUNTLET: ALL RIVALS', c: '#ff6ad5' });
    order.forEach(charKey => spawnRivalRumbleRival(charKey, { isFinale: true }));
    Neo.updateObjective();
  }

  // Called once per rival kill during the finale gauntlet. Distinct from
  // onRivalRumbleRivalDefeated (the 1-on-1 duel path) since multiple rivals
  // can be alive at once here — only advance to the win screen once every
  // rival spawned for the finale is actually dead.
  function onRivalRumbleFinaleRivalDefeated() {
    const stillFighting = Neo.enemies.some(e => e.type === 'rival' && e.rivalData?.rivalRumbleFinale);
    if (stillFighting) return;
    Neo.rivalRumbleActive = false;
    clearRivalRumbleNextSpawn();
    Neo.win();
  }

  function onRivalRumbleRivalDefeated() {
    if (Neo.gameMode !== 'rival_rumble') return;
    if (Neo.rivalRumbleFinale) { onRivalRumbleFinaleRivalDefeated(); return; }
    Neo.rivalRumbleActive = false;
    Neo.rivalRumbleStage += 1;
    updateBossRushHud();
    Neo.updateObjective();
    const order = Neo.rivalRumbleOrder || [];
    if (Neo.rivalRumbleStage >= order.length) {
      Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 40, life: 1.6, text: 'ALL RIVALS DEFEATED!', c: '#78d7ff' });
      setTimeout(() => {
        if (Neo.gameMode !== 'rival_rumble' || Neo.gameState !== 'play') return;
        Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 50, life: 1.6, text: 'THEY ARE COMING BACK... TOGETHER', c: '#ff6ad5' });
      }, 1500);
      scheduleRivalRumbleNextSpawn(4, spawnRivalRumbleFinale);
      return;
    }
    const cx = Neo.ROOM_W / 2;
    const cy = Neo.ROOM_H / 2;
    const rewardRandom = createScopedRandom(`rival-rumble:stage:${Neo.rivalRumbleStage}:reward`);
    Neo.dropCoins(cx, cy - 20, 80 + Neo.rivalRumbleStage * 30);
    Neo.pickups.push({ x: cx - 60, y: cy, type: 'item', key: Neo.rollItemDrop({ elite: true, random: rewardRandom }) });
    Neo.pickups.push({ x: cx + 60, y: cy, type: 'potion' });
    Neo.grantXp(40 + Neo.rivalRumbleStage * 20);
    const nextDef = Neo.RIVAL_DEFS[order[Neo.rivalRumbleStage]];
    const nextName = (nextDef?.name || '???').toUpperCase();
    Neo.spawnParticle({ x: cx, y: cy - 40, life: 1.6, text: 'RIVAL DEFEATED!', c: '#78d7ff' });
    setTimeout(() => {
      if (Neo.gameMode !== 'rival_rumble' || Neo.gameState !== 'play') return;
      Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 50, life: 1.2, text: `NEXT: ${nextName}`, c: '#ffb347' });
    }, 1500);
    scheduleRivalRumbleNextSpawn(4);
  }

  function scheduleRivalRumbleNextSpawn(delaySeconds = 4, spawnFn = spawnRivalRumbleRival) {
    clearRivalRumbleNextSpawn();
    const stage = Neo.rivalRumbleStage;
    Neo.rivalRumbleNextSpawnAt = Date.now() + delaySeconds * 1000;
    const tick = () => {
      if (Neo.gameMode !== 'rival_rumble' || Neo.rivalRumbleStage !== stage) {
        clearRivalRumbleNextSpawn();
        return;
      }
      if (Neo.gameState !== 'play') {
        Neo.rivalRumbleNextSpawnTimeout = setTimeout(tick, 250);
        return;
      }
      if (Date.now() < Neo.rivalRumbleNextSpawnAt) {
        Neo.rivalRumbleNextSpawnTimeout = setTimeout(tick, 100);
        return;
      }
      clearRivalRumbleNextSpawn();
      spawnFn();
    };
    Neo.rivalRumbleNextSpawnTimeout = setTimeout(tick, 100);
    updateBossRushHud();
  }

  function clearRivalRumbleNextSpawn() {
    if (Neo.rivalRumbleNextSpawnTimeout) clearTimeout(Neo.rivalRumbleNextSpawnTimeout);
    Neo.rivalRumbleNextSpawnTimeout = null;
    Neo.rivalRumbleNextSpawnAt = 0;
    updateBossRushHud();
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
      const safeSpawn = findPracticeEnemySpawnPoint();
      if (!safeSpawn) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 28, life: 0.9, text: 'NO SAFE SPAWN', c: '#ff8b8b' });
        return;
      }
      Neo.spawnEnemy(type, safeSpawn.x, safeSpawn.y, elite);
    });
  }

  function findPracticeEnemySpawnPoint(radius = 18) {
    if (!Neo.player) return null;
    const samples = [
      { x: Neo.player.x + 190, y: Neo.player.y },
      { x: Neo.player.x - 190, y: Neo.player.y },
      { x: Neo.player.x, y: Neo.player.y + 150 },
      { x: Neo.player.x, y: Neo.player.y - 150 },
      { x: Neo.ROOM_W / 2 + 180, y: Neo.ROOM_H / 2 },
      { x: Neo.ROOM_W / 2 - 180, y: Neo.ROOM_H / 2 },
      { x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 + 140 },
      { x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 140 },
    ];
    let best = null;
    let bestScore = -Infinity;
    samples.forEach(sample => {
      const x = Neo.clamp(sample.x, Neo.WALL + radius, Neo.ROOM_W - Neo.WALL - radius);
      const y = Neo.clamp(sample.y, Neo.WALL + radius, Neo.ROOM_H - Neo.WALL - radius);
      const safeSpawn = Neo.findSafeEnemySpawnPoint(x, y, radius);
      if (!safeSpawn) return;
      const playerDistance = Neo.dist(safeSpawn.x, safeSpawn.y, Neo.player.x, Neo.player.y);
      const nearestEnemyDistance = Neo.enemies.reduce((nearest, enemy) => {
        if (!enemy || enemy.dead) return nearest;
        return Math.min(nearest, Neo.dist(safeSpawn.x, safeSpawn.y, enemy.x, enemy.y));
      }, Infinity);
      const score = playerDistance + Math.min(nearestEnemyDistance, 260);
      if (score > bestScore) {
        bestScore = score;
        best = safeSpawn;
      }
    });
    if (best) return best;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const angle = Neo.nextRandom('encounter') * Math.PI * 2;
      const distance = 150 + Neo.nextRandom('encounter') * 220;
      const x = Neo.clamp(Neo.player.x + Math.cos(angle) * distance, Neo.WALL + radius, Neo.ROOM_W - Neo.WALL - radius);
      const y = Neo.clamp(Neo.player.y + Math.sin(angle) * distance, Neo.WALL + radius, Neo.ROOM_H - Neo.WALL - radius);
      const safeSpawn = Neo.findSafeEnemySpawnPoint(x, y, radius);
      if (safeSpawn) return safeSpawn;
    }
    return null;
  }

  function updateEndlessWaveHud() {
    if (!Neo.ui.endlessWaveNum) return;
    Neo.ui.endlessWaveNum.textContent = String(Neo.endlessWave + (Neo.endlessWaveActive ? 1 : 0));
  }

  function resetScene() {
    // Baseline for cumulative floor tracking. The run-start path calls
    // generateFloor() right after resetScene(), and generateFloor bumps this to 1.
    // Dev-jump modes (practice/boss rush) that build rooms manually instead set
    // floorsEntered to their starting floor explicitly.
    Neo.floorsEntered = 0;
    Neo.enemies = [];
    Neo.deadBodies = [];
    Neo.particles = [];
    Neo.playerDeathAnim = null;
    Neo.endlessWave = 0;
    Neo.endlessWaveActive = false;
    Neo.endlessRespawnTimer = 0;
    Neo.bossRushStage = 0;
    Neo.bossRushActive = false;
    Neo.rivalRumbleOrder = [];
    Neo.rivalRumbleStage = 0;
    Neo.rivalRumbleActive = false;
    Neo.rivalRumbleFinale = false;
    Neo.treasureHuntPhase = 'seek';
    Neo.treasureHuntHasKey = false;
    Neo.treasureHuntCollapseTimer = 0;
    Neo.treasureHuntCollapseMax = 0;
    Neo.treasureHuntRockTick = 0;
    Neo.treasureHuntBlastTick = 0;
    clearBossRushNextSpawn();
    clearRivalRumbleNextSpawn();
    Neo.projectiles = [];
    Neo.justiceBlades = [];
    Neo.ghostBalls = [];
    Neo.skySwords = [];
    Neo.titanHammer = null;
    Neo.activeBeamPaths = null;
    Neo.beamStruggle = null;
    Neo.healingZoneCharging = false;
    Neo.healingZoneChargeTime = 0;
    Neo.deathBallCharging = false;
    Neo.deathBallChargeTime = 0;
    Neo.deathBallPowerUp = false;
    Neo.smashHeld = false;
    Neo.nimrodStompCharging = false;
    Neo.nimrodStompChargeTime = 0;
    Neo.dashHeld = false;
    Neo.loveBombCharging = false;
    Neo.loveBombChargeTime = 0;
    Neo.ghostBallCharging = false;
    Neo.ghostBallChargeTime = 0;
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
    Neo.specialRoomKeyLatch = false;
    Neo.ladderUseKeyLatch = false;
    Neo.activeShopTab = 'items';
    Neo.draggingMoveKey = '';
    Neo.weaponBurstQueue = [];
    Neo.clawSwipeQueue = [];
    Neo.rivals = [];
    Neo.pendingRivalReturns = [];
    Neo.slainRivalKeys = [];
    Neo.pendingMooggyTraps = 0;
    Neo.pendingRivalCurses = normalizeRivalCurses(null);
    Neo.floorRivalCurses = normalizeRivalCurses(null);
    Neo.monsterRoamTimer = 0;
    Neo.mooggyAssassinSpawnedThisRun = false;
    Neo.mooggyAssassinSpawnedThisFloor = false;
    Neo.knaveKnightCutscenePlayed = false;
    Neo.queenMetaoCutscenePlayed = false;
    Neo.handsomeDevilCutscenePlayed = false;
    Neo.antonyBlemmyeCutscenePlayed = false;
    Neo.secretRoomVisitedFloors = [];
    Neo.wizardPawSelection = null;
    Neo.scrollControlSelection = null;
    Neo.panelItemDeferredToastRoom = null;
    Neo.setWizardPawModalOpen(false);
    Neo.setExtraBatteryModalOpen?.(false, { animateClose: false });
    Neo.setScrollControlModalOpen?.(false, { animateClose: false });
    Neo.setSpecialRoomPanelOpen?.(false);
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
    Neo.treasureHuntPhase = String(snapshot.treasureHuntPhase || 'seek');
    Neo.treasureHuntHasKey = !!snapshot.treasureHuntHasKey;
    Neo.treasureHuntCollapseTimer = Math.max(0, Number(snapshot.treasureHuntCollapseTimer || 0));
    Neo.treasureHuntCollapseMax = Math.max(0, Number(snapshot.treasureHuntCollapseMax || 0));
    Neo.treasureHuntRockTick = Math.max(0, Number(snapshot.treasureHuntRockTick || 0));
    Neo.treasureHuntBlastTick = Math.max(0, Number(snapshot.treasureHuntBlastTick || 0));
    Neo.baseSeedStr = snapshot.baseSeedStr || snapshot.seedStr || createRandomSeed();
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    Neo.runLoopIndex = Number(snapshot.runLoopIndex || 0);
    Neo.runRevivesUsed = Math.max(0, Number(snapshot.runRevivesUsed || 0));
    Neo.runCrystalsEarned = Math.max(0, Number(snapshot.runCrystalsEarned || 0));
    Neo.lastDeathEntryId = '';
    syncSeedState();
    Neo.floor = snapshot.floor;
    if (Neo.gameMode === 'treasure_hunt' && Neo.treasureHuntPhase === 'escape' && Neo.treasureHuntCollapseMax <= 0) {
      Neo.treasureHuntCollapseMax = Math.max(70, 103 - Number(Neo.floor || 1) * 3);
      Neo.treasureHuntCollapseTimer = Neo.treasureHuntCollapseMax;
      Neo.treasureHuntRockTick = 0.45;
      Neo.treasureHuntBlastTick = 1.6;
    }
    // Resume restores rooms from the snapshot (no generateFloor call), so assign
    // the cumulative floor count directly. Old saves predate the field — estimate
    // from loop+floor so scaling doesn't reset on resumed looped runs.
    Neo.floorsEntered = Number.isFinite(Number(snapshot.floorsEntered))
      ? Math.max(1, Number(snapshot.floorsEntered))
      : Math.max(1, Neo.runLoopIndex * Neo.MAX_FLOOR + Number(snapshot.floor || 1));
    Neo.gameElapsedTime = Math.max(0, Number(snapshot.gameElapsedTime || 0));
    Neo.tutorialState = Neo.tutorialController?.normalizeState?.(snapshot.tutorialState, false)
      || (snapshot.tutorialState && typeof snapshot.tutorialState === 'object' ? { ...snapshot.tutorialState } : createDefaultTutorialState());
    Neo.selectedDifficulty = normalizeDifficulty(snapshot.difficulty);
    Neo.selectedChallenges = normalizeChallengeSelection(snapshot.challenges);
    Neo.metaProgress.bestFloor = Math.max(Neo.metaProgress.bestFloor, Neo.floor);
    resetRngStreams(snapshot.rngState);
    Neo.rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms : [];
    Neo.currentRoom = Neo.rooms.find(room => room.gx === snapshot.currentRoom?.gx && room.gy === snapshot.currentRoom?.gy) || Neo.rooms[0] || null;
    invalidateRunStatCaches();
    Neo.player = Neo.migratePlayerData(snapshot.player);
    Neo.storyState = Neo.gameMode === 'story'
      ? globalThis.NeoNyke?.story?.normalizeStoryState?.(snapshot.storyState, Neo.player.character)
      : null;
    grantTutorialResources();
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
      refreshRoomShopCosts(
        Neo.currentRoom,
        Neo.selectedDifficulty,
        Math.max(1, Number(snapshot.floorsEntered) || Number(snapshot.floor) || 1),
      );
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
    Neo.cooldowns = createCooldownState(Neo.player, snapshot.cooldowns || {}, { fromSnapshot: true });
    reconcileCooldownsOnRoomEnter();
    Neo.laserActive = !!snapshot.laserActive;
    Neo.laserTime = snapshot.laserTime || 0;
    Neo.laserTick = snapshot.laserTick || 0;
    Neo.laserMode = snapshot.laserMode || 'beam';
    Neo.laserAngle = Number(snapshot.laserAngle || 0);
    Neo.laserSweepSpeed = Number(snapshot.laserSweepSpeed || 0);
    Neo.turtleWaveHpTimer = Number(snapshot.turtleWaveHpTimer || 0);
    Neo.godTimer = snapshot.godTimer || 0;
    Neo.endlessWave = Math.max(0, Number(snapshot.endlessWave || 0));
    Neo.endlessWaveActive = !!snapshot.endlessWaveActive;
    Neo.endlessRespawnTimer = Math.max(0, Number(snapshot.endlessRespawnTimer || 0));
    Neo.camera = snapshot.camera || { x: 0, y: 0 };
    Neo.shake = 0;
    Neo.shakeT = 0;
    Neo.fade = 0;
    Neo.fading = 0;
    Neo.tutorialController?.syncFromState?.();
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
    Neo.clawSwipeQueue = [];
    Neo.monsterRoamTimer = Number(snapshot.monsterRoamTimer || 0);
    Neo.knaveKnightCutscenePlayed = !!snapshot.knaveKnightCutscenePlayed;
    Neo.queenMetaoCutscenePlayed = !!snapshot.queenMetaoCutscenePlayed;
    Neo.handsomeDevilCutscenePlayed = !!snapshot.handsomeDevilCutscenePlayed;
    Neo.antonyBlemmyeCutscenePlayed = !!snapshot.antonyBlemmyeCutscenePlayed;
    Neo.secretRoomVisitedFloors = Array.isArray(snapshot.secretRoomVisitedFloors) ? [...snapshot.secretRoomVisitedFloors] : [];
    Neo.hideLadderOnMinimap = !!snapshot.hideLadderOnMinimap;
    Neo.restoreRivals(snapshot.rivals);
    Neo.pendingRivalReturns = Array.isArray(snapshot.pendingRivalReturns) ? snapshot.pendingRivalReturns : [];
    Neo.slainRivalKeys = Array.isArray(snapshot.slainRivalKeys) ? [...snapshot.slainRivalKeys] : [];
    Neo.pendingMooggyTraps = Number(snapshot.pendingMooggyTraps || 0);
    Neo.pendingRivalCurses = normalizeRivalCurses(snapshot.pendingRivalCurses);
    Neo.floorRivalCurses = normalizeRivalCurses(snapshot.floorRivalCurses);
    Neo.wizardPawSelection = null;
    Neo.scrollControlSelection = null;
    Neo.panelItemDeferredToastRoom = null;
    Neo.setWizardPawModalOpen(false);
    Neo.setExtraBatteryModalOpen?.(false, { animateClose: false });
    Neo.setScrollControlModalOpen?.(false, { animateClose: false });
    Neo.setShopPanelOpen(false);
    Neo.setInventoryPanelOpen(false);
    Neo.updateItemUI();
    Neo.injectRivalsToCurrentRoom();
    Neo.updateObjective();
    Neo.updateHud();
    Neo.updateEndlessWaveHud();
    if (Neo.gameMode === 'story') {
      setTimeout(() => Neo.storyManager?.triggerRoom?.(Neo.currentRoom), 0);
    }
    Neo.persistMetaSoon();
  }

  // Expose on Neo
  Neo.pauseGame = pauseGame;
  Neo.resumeGame = resumeGame;
  Neo.TUTORIAL_SEED = TUTORIAL_SEED;
  Neo.createDefaultMeta = createDefaultMeta;
  Neo.shouldOfferTutorialButton = shouldOfferTutorialButton;
  Neo.markTutorialButtonOfferedNow = markTutorialButtonOfferedNow;
  Neo.markPlayerSeenNow = markPlayerSeenNow;
  Neo.showFirstTip = showFirstTip;
  Neo.normalizeSandboxSettings = normalizeSandboxSettings;
  Neo.normalizeCustomCharacterSettings = normalizeCustomCharacterSettings;
  Neo.normalizeCustomCharactersSettings = normalizeCustomCharactersSettings;
  Neo.getCustomCharacterSettings = getCustomCharacterSettings;
  Neo.getCustomCharacterKeys = getCustomCharacterKeys;
  Neo.createCustomCharacter = createCustomCharacter;
  Neo.removeCustomCharacter = removeCustomCharacter;
  Neo.getCharacterSpriteKey = getCharacterSpriteKey;
  Neo.isCustomCharacterKey = isCustomCharacterKey;
  Neo.CUSTOM_CHARACTER_STAT_MIN = CUSTOM_CHARACTER_STAT_MIN;
  Neo.CUSTOM_CHARACTER_STAT_MAX = CUSTOM_CHARACTER_STAT_MAX;
  Neo.isSandboxRunActive = isSandboxRunActive;
  Neo.getActiveSandboxSettings = getActiveSandboxSettings;
  Neo.applySandboxPlayerSetup = applySandboxPlayerSetup;
  Neo.createDefaultTutorialState = createDefaultTutorialState;
  Neo.resetTutorialState = resetTutorialState;
  Neo.isTutorialRun = isTutorialRun;
  Neo.grantTutorialResources = grantTutorialResources;
  Neo.grantStoryTutorialSkipPackage = grantStoryTutorialSkipPackage;
  Neo.isFirstRunTutorialActive = isFirstRunTutorialActive;
  Neo.isFirstRunTutorialEngaged = isFirstRunTutorialEngaged;
  Neo.consumeReplayTutorialRequest = consumeReplayTutorialRequest;
  Neo.isReplayTutorialRequested = isReplayTutorialRequested;
  Neo.hasSargeUnlockPrereq = hasSargeUnlockPrereq;
  Neo.isSargeTutorialBlocked = isSargeTutorialBlocked;
  Neo.hasAllCharactersUnlocked = hasAllCharactersUnlocked;
  Neo.checkTurtleBoyUnlock = checkTurtleBoyUnlock;
  Neo.formatControlLabel = formatControlLabel;
  Neo.getControlHint = getControlHint;
  Neo.getAscendControlHint = getAscendControlHint;
  Neo.getLadderControlHint = getLadderControlHint;
  Neo.getMovementControlHint = getMovementControlHint;
  Neo.ensureTutorialDummyEnemy = ensureTutorialDummyEnemy;
  Neo.ensureTutorialBeamStruggleEnemy = ensureTutorialBeamStruggleEnemy;
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
  Neo.getRandomItemDropChance = getRandomItemDropChance;
  Neo.scaleChallengeTimer = scaleChallengeTimer;
  Neo.scalePotionHealing = scalePotionHealing;
  Neo.getPotionHealAmount = getPotionHealAmount;
  Neo.getPlayerHealingMultiplier = getPlayerHealingMultiplier;
  Neo.scalePlayerHealing = scalePlayerHealing;
  Neo.getShopPriceMultiplier = getShopPriceMultiplier;
  Neo.getShopProgressionDepth = getShopProgressionDepth;
  Neo.getShopProgressionPriceMultiplier = getShopProgressionPriceMultiplier;
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
  Neo.reconcileCooldownsOnRoomEnter = reconcileCooldownsOnRoomEnter;
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
  Neo.applyRarityCountBadges = applyRarityCountBadges;
  Neo.captureRunMoveSnapshot = captureRunMoveSnapshot;
  Neo.buildRunHistoryEntry = buildRunHistoryEntry;
  Neo.pushRunHistoryEntry = pushRunHistoryEntry;
  Neo.renderRunHistoryListEntry = renderRunHistoryListEntry;
  Neo.renderRunHistoryHero = renderRunHistoryHero;
  Neo.renderRunHistoryTabContent = renderRunHistoryTabContent;
  Neo.resolveKillerSprite = resolveKillerSprite;
  Neo.resolveKillerHazardIcon = resolveKillerHazardIcon;
  Neo.hydrateRunHistorySprites = hydrateRunHistorySprites;
  Neo.refreshMenuState = refreshMenuState;
  Neo.updateCharacterSelectionUI = updateCharacterSelectionUI;
  Neo.forceUnlockCharacter = forceUnlockCharacter;
  Neo.forceUnlockAllCharacters = forceUnlockAllCharacters;
  Neo.setGameState = setGameState;
  Neo.prepareSinglePlayerSession = prepareSinglePlayerSession;
  Neo.ensureSinglePlayerSession = ensureSinglePlayerSession;
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
  Neo.BEAM_PRACTICE_MODES = BEAM_PRACTICE_MODES;
  Neo.spawnBeamPracticeWave = spawnBeamPracticeWave;
  Neo.updateBeamPractice = updateBeamPractice;
  Neo.resetChallengePracticeRoom = resetChallengePracticeRoom;
  Neo.ensureChallengePracticeReturnPortal = ensureChallengePracticeReturnPortal;
  Neo.buildChallengePracticeFloor = buildChallengePracticeFloor;
  Neo.startBossRush = startBossRush;
  Neo.spawnBossRushBoss = spawnBossRushBoss;
  Neo.findBossRushSpawnPoint = findBossRushSpawnPoint;
  Neo.onBossRushBossDefeated = onBossRushBossDefeated;
  Neo.startRivalRumble = startRivalRumble;
  Neo.spawnRivalRumbleRival = spawnRivalRumbleRival;
  Neo.onRivalRumbleRivalDefeated = onRivalRumbleRivalDefeated;
  Neo.updateBossRushHud = updateBossRushHud;
  Neo.clampPracticeMaxHp = clampPracticeMaxHp;
  Neo.syncPracticeMaxHpControls = syncPracticeMaxHpControls;
  Neo.setPracticeMaxHp = setPracticeMaxHp;
  Neo.buildPracticeEnemyGrid = buildPracticeEnemyGrid;
  Neo.findPracticeEnemySpawnPoint = findPracticeEnemySpawnPoint;
  Neo.updateEndlessWaveHud = updateEndlessWaveHud;
  Neo.resetScene = resetScene;
  Neo.sanitizePickupList = sanitizePickupList;
  Neo.restoreRun = restoreRun;
