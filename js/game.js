(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  const ROOM_W = 900;
  const ROOM_H = 700;
  const WALL = 28;
  const DOOR = 140;
  const MAX_FLOOR = 10;
  const START_X = ROOM_W / 2;
  const START_Y = ROOM_H / 2;

  const ATTACKS = {
    melee: { baseCooldown: 0.35, range: 72, arc: 1.04, damage: 24, active: 0.17, push: 220 },
    laser: { baseCooldown: 4.2, duration: 0.58, tick: 0.08, range: 430, damage: 10 },
    smash: { baseCooldown: 5.4, radius: 148, damage: 46, bonus: 26 },
  };

  const BOSS_TYPES = new Set(['god', 'queen_cult', 'bulk_golem', 'artificer_knave']);

  const CHARACTER_DEFS = {
    thorn_knight: {
      key: 'thorn_knight',
      name: 'Thorn Knight',
      rarity: 'knight',
      startItem: 'neo_knife',
      damageMultiplier: 1,
      skills: { melee: 'Slash', laser: 'Blood Beam', smash: 'Crimson Smash', dash: 'Dash' },
    },
    metao: {
      key: 'metao',
      name: 'Metao',
      rarity: 'wizard',
      startItem: 'orb_of_blood',
      damageMultiplier: 0.5,
      skills: { melee: 'Fire Balls', laser: 'Power Disks', smash: 'Chaos Burst', dash: 'Dash' },
    },
    granialla: {
      key: 'granialla',
      name: 'Granialla',
      rarity: 'god',
      startItem: 'neo_knife',
      damageMultiplier: 1,
      skills: { melee: 'Smite', laser: 'Blade Justice', smash: 'Healing Zone', dash: 'Dash' },
      unlock: 'godslain',
    },
  };

  const ITEM_DEFS = {
    neo_knife: {
      key: 'neo_knife',
      name: 'Neo-Knife',
      shortName: 'Knife',
      description: 'Bleed chance +5%.',
      rarity: 'knight',
      color: '#f4f6fb',
      category: 'knight',
      tags: ['bleed', 'starter'],
    },
    orb_of_blood: {
      key: 'orb_of_blood',
      name: 'Orb of Blood',
      shortName: 'Orb',
      description: 'Bleeding enemies take double damage.',
      rarity: 'wizard',
      color: '#a857ff',
      category: 'wizard',
      tags: ['bleed', 'damage'],
    },
    hemes_scarf: {
      key: 'hemes_scarf',
      name: "Heme's Scarf",
      shortName: 'Scarf',
      description: 'All enemies bleed and each bleed stack heals you.',
      rarity: 'god',
      color: '#ff4256',
      accent: '#35ff6f',
      category: 'god',
      tags: ['bleed', 'heal', 'breaker'],
    },
    insurance: {
      key: 'insurance',
      name: 'Insurance',
      shortName: 'Insure',
      description: 'At half HP, trigger a charged safety state.',
      rarity: 'white',
      color: '#f4f6fb',
      category: 'white',
      tags: ['charge', 'defense'],
    },
    crit_charm: {
      key: 'crit_charm',
      name: 'Crit Charm',
      shortName: 'Crit +5%',
      description: 'Critical hit chance +5%.',
      rarity: 'white',
      color: '#ffffff',
      category: 'white',
      tags: ['crit'],
    },
    attack_servo: {
      key: 'attack_servo',
      name: 'Attack Servo',
      shortName: 'AS +0.2',
      description: 'Attack speed +0.2.',
      rarity: 'white',
      color: '#eef5ff',
      category: 'white',
      tags: ['speed'],
    },
    charged_adapter: {
      key: 'charged_adapter',
      name: 'Charged Adapter',
      shortName: 'Adapter',
      description: 'Charge requirements reduced by 1 and unlocks ladder warp.',
      rarity: 'purple',
      color: '#b66cff',
      category: 'purple',
      tags: ['charge', 'mobility'],
    },
    turtle_shell: {
      key: 'turtle_shell',
      name: 'Turtle Shell',
      shortName: 'Shell +5%',
      description: 'Move speed +5%.',
      rarity: 'white',
      color: '#d2ffd8',
      category: 'white',
      tags: ['speed', 'move'],
    },
    iron_lung: {
      key: 'iron_lung',
      name: 'Iron Lung',
      shortName: 'Iron',
      description: 'Cannot lose more than 20% max HP in one room.',
      rarity: 'god',
      color: '#c6d4e8',
      category: 'god',
      tags: ['defense', 'god'],
    },
    oracles_lens: {
      key: 'oracles_lens',
      name: "Oracle's Lens",
      shortName: 'Oracle',
      description: 'Doubles crit chance and amplifies crit effectiveness.',
      rarity: 'god',
      color: '#8ee6ff',
      category: 'god',
      tags: ['crit', 'god'],
    },
    wizards_paw: {
      key: 'wizards_paw',
      name: "Wizard's Paw",
      shortName: 'Paw',
      description: 'Randomly chooses 2 stats and triples them.',
      rarity: 'god',
      color: '#ffcf80',
      category: 'god',
      tags: ['god', 'stat'],
    },
    jesters_dice: {
      key: 'jesters_dice',
      name: "Jester's Dice",
      shortName: 'Dice',
      description: 'Skip 3 floors and gain 10 random item stacks.',
      rarity: 'god',
      color: '#ff8bd8',
      category: 'god',
      tags: ['god', 'chaos'],
    },
  };
  const ITEM_KEYS = Object.keys(ITEM_DEFS);
  const ITEM_DROP_WEIGHTS = [
    ['neo_knife', 60],
    ['orb_of_blood', 28],
    ['hemes_scarf', 12],
    ['insurance', 18],
    ['crit_charm', 24],
    ['attack_servo', 22],
    ['charged_adapter', 18],
    ['turtle_shell', 24],
    ['iron_lung', 10],
    ['oracles_lens', 8],
    ['wizards_paw', 6],
    ['jesters_dice', 4],
  ];
  const itemRegistry = createItemRegistry();

  const ui = {
    hud: document.getElementById('hud'),
    hpFill: document.getElementById('hpFill'),
    hpTxt: document.getElementById('hpTxt'),
    lv: document.getElementById('lv'),
    xp: document.getElementById('xp'),
    fl: document.getElementById('fl'),
    coins: document.getElementById('coins'),
    charName: document.getElementById('charName'),
    objective: document.getElementById('objective'),
    cdM: document.getElementById('cdM'),
    cdL: document.getElementById('cdL'),
    cdS: document.getElementById('cdS'),
    cdD: document.getElementById('cdD'),
    timeMelee: document.getElementById('timeMelee'),
    timeLaser: document.getElementById('timeLaser'),
    timeSmash: document.getElementById('timeSmash'),
    timeDash: document.getElementById('timeDash'),
    fillMelee: document.getElementById('fillMelee'),
    fillLaser: document.getElementById('fillLaser'),
    fillSmash: document.getElementById('fillSmash'),
    fillDash: document.getElementById('fillDash'),
    bankCoins: document.getElementById('bankCoins'),
    bestFloor: document.getElementById('bestFloor'),
    saveState: document.getElementById('saveState'),
    start: document.getElementById('start'),
    charSelect: document.getElementById('charSelect'),
    dead: document.getElementById('dead'),
    deadInfo: document.getElementById('deadInfo'),
    win: document.getElementById('win'),
    winInfo: document.getElementById('winInfo'),
    deadRestart: document.querySelector('#dead .restart'),
    winRestart: document.querySelector('#win .restart'),
    pause: document.getElementById('pause'),
    pauseResume: document.getElementById('pauseResume'),
    pauseSettings: document.getElementById('pauseSettings'),
    pauseMain: document.getElementById('pauseMain'),
    actionBar: document.getElementById('actionBar'),
    seed: document.getElementById('seed'),
    go: document.getElementById('go'),
    continueRow: document.getElementById('continueRow'),
    continueBtn: document.getElementById('continueBtn'),
    newRunBtn: document.getElementById('newRunBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    charBackBtn: document.getElementById('charBackBtn'),
    deleteRunRow: document.getElementById('deleteRunRow'),
    deleteRunBtn: document.getElementById('deleteRunBtn'),
    runSummary: document.getElementById('runSummary'),
    charButtons: [...document.querySelectorAll('#choose .char-card')],
    itemSlots: {
      neo_knife: document.getElementById('rr-neo-knife'),
      orb_of_blood: document.getElementById('rr-orb-blood'),
      hemes_scarf: document.getElementById('rr-hemes-scarf'),
    },
    itemCounts: {
      neo_knife: document.getElementById('countNeoKnife'),
      orb_of_blood: document.getElementById('countOrbBlood'),
      hemes_scarf: document.getElementById('countHemesScarf'),
    },
    actionCards: {
      dash: document.querySelector('[data-skill="dash"]'),
      melee: document.querySelector('[data-skill="melee"]'),
      laser: document.querySelector('[data-skill="laser"]'),
      smash: document.querySelector('[data-skill="smash"]'),
    },
    skillNames: {
      dash: document.querySelector('[data-skill="dash"] .skill-name'),
      melee: document.querySelector('[data-skill="melee"] .skill-name'),
      laser: document.querySelector('[data-skill="laser"] .skill-name'),
      smash: document.querySelector('[data-skill="smash"] .skill-name'),
    },
    icons: {
      dash: document.getElementById('iconDash'),
      melee: document.getElementById('iconMelee'),
      laser: document.getElementById('iconLaser'),
      smash: document.getElementById('iconSmash'),
    },
  };
  const uiController = createUIController(ui);

  let player = null;
  let enemies = [];
  let particles = [];
  let projectiles = [];
  let chests = [];
  let pickups = [];
  let rooms = [];
  let currentRoom = null;
  let keys = {};
  let mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false, right: false };
  let cooldowns = { melee: 0, laser: 0, smash: 0, dash: 0 };
  let camera = { x: 0, y: 0 };
  let shake = 0;
  let shakeT = 0;
  let gameState = 'menu';
  let floor = 1;
  let seedStr = '';
  let rng = null;
  let godTimer = 0;
  let fade = 0;
  let fading = 0;
  let nextDoor = null;
  let floorTransitionTime = 0;
  let showFloorTransition = false;
  let gameElapsedTime = 0;
  let lastTime = 0;
  let loopStarted = false;
  let laserActive = false;
  let laserTime = 0;
  let laserTick = 0;
  let dashKeyLatch = false;
  let chosenCharacter = 'thorn_knight';
  let destructibles = [];
  let hazards = [];
  let shopOffers = [];
  let structures = [];
  let decorations = [];
  let activeRun = null;
  let metaProgress = createDefaultMeta();
  let savePendingTimer = 0;
  let lavaAnimTime = 0;
  let floorSkipPending = 0;
  let teleportKeyLatch = false;

  const saveStore = createSaveStore();
  window._neoSaveStore = saveStore;

  const walls = (() => {
    const hw = (ROOM_W - DOOR) / 2;
    const hh = (ROOM_H - DOOR) / 2;
    return [
      { x: 0, y: 0, w: hw, h: WALL },
      { x: ROOM_W - hw, y: 0, w: hw, h: WALL },
      { x: 0, y: ROOM_H - WALL, w: hw, h: WALL },
      { x: ROOM_W - hw, y: ROOM_H - WALL, w: hw, h: WALL },
      { x: 0, y: 0, w: WALL, h: hh },
      { x: 0, y: ROOM_H - hh, w: WALL, h: hh },
      { x: ROOM_W - WALL, y: 0, w: WALL, h: hh },
      { x: ROOM_W - WALL, y: ROOM_H - hh, w: WALL, h: hh },
    ];
  })();

  boot();

  async function boot() {
    uiController.setState(gameState);
    uiController.setHudUpdateHook(() => {
      if (gameState !== 'play' || !player) return;
      updateObjective();
      updateHud();
    });
    bindInput();
    drawActionIcons();
    await loadPersistedState();
    updateCharacterSelectionUI();
    refreshMenuState();
    draw();
  }

  function bindInput() {
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('mousemove', event => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
      mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
    });
    canvas.addEventListener('mousedown', event => {
      if (event.button === 0) mouse.down = true;
      if (event.button === 2) mouse.right = true;
    });
    window.addEventListener('mouseup', event => {
      if (event.button === 0) mouse.down = false;
      if (event.button === 2) mouse.right = false;
    });
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      keys[key] = true;
      const b = window.NeoSettings?.getBindings();
      if (event.key === 'Escape') {
        if (gameState === 'play') { pauseGame(); return; }
        if (gameState === 'pause') { resumeGame(); return; }
      }
      if (b && key === b.smash && gameState === 'play') trySmash();
      else if (!b && key === 'r' && gameState === 'play') trySmash();
    });
    window.addEventListener('keyup', event => {
      keys[event.key.toLowerCase()] = false;
    });
    uiController.bindMenuActions({
      onCharacterSelect(characterKey, button) {
        if (button.classList.contains('locked')) return;
        chosenCharacter = characterKey;
        updateCharacterSelectionUI();
      },
      onOpenCharacterSelect() { setGameState('charselect'); },
      onCloseCharacterSelect() { setGameState('menu'); },
      onStartNew() { void startGame(false); },
      onContinue() { void startGame(true); },
      onDeleteRun() { void deleteSavedRun(); },
    });
    uiController.bindRestartActions(() => location.reload());

    ui.pauseResume.addEventListener('click', resumeGame);
    ui.pauseSettings.addEventListener('click', () => {
      document.getElementById('settingsBtn').click();
    });
    ui.pauseMain.addEventListener('click', () => {
      clearTimeout(savePendingTimer);
      void saveRunNow().then(() => { setGameState('menu'); });
    });

    window.addEventListener('beforeunload', () => {
      if (gameState === 'play') {
        clearTimeout(savePendingTimer);
        saveRunNow();
      }
    });
  }

  function pauseGame() {
    setGameState('pause');
  }

  function resumeGame() {
    setGameState('play');
  }

  function createDefaultMeta() {
    return {
      coins: 0,
      bestFloor: 1,
      unlockedItems: ['neo_knife'],
      unlockedCharacters: ['thorn_knight', 'metao'],
      godsKilled: 0,
    };
  }

  function createDefaultPlayer() {
    const items = {
      neo_knife: 0,
      orb_of_blood: 0,
      hemes_scarf: 0,
      insurance: 0,
      crit_charm: 0,
      attack_servo: 0,
      charged_adapter: 0,
      turtle_shell: 0,
      iron_lung: 0,
      oracles_lens: 0,
      wizards_paw: 0,
      jesters_dice: 0,
    };
    const character = CHARACTER_DEFS[chosenCharacter] || CHARACTER_DEFS.thorn_knight;
    items[character.startItem] = 1;
    return {
      character: character.key,
      x: START_X,
      y: START_Y,
      r: 14,
      vx: 0,
      vy: 0,
      hp: 120,
      maxHp: 120,
      swing: 0,
      swingA: 0,
      inv: 0,
      dashTime: 0,
      dashX: 0,
      dashY: 0,
      coins: 0,
      level: 1,
      xp: 0,
      xpToNext: 20,
      attackPower: 0,
      attackSpeed: 1,
      roomDamageTaken: 0,
      insuranceActive: false,
      insuranceChargeKills: 0,
      insuranceReady: true,
      escapeChargeKills: 0,
      escapeReady: true,
      items,
    };
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
      const [savedMeta, savedRun] = await Promise.all([
        saveStore.get('meta'),
        saveStore.get('run'),
      ]);
      if (savedMeta && typeof savedMeta === 'object') {
        metaProgress = {
          ...createDefaultMeta(),
          ...savedMeta,
          unlockedItems: normalizeUnlockedItems(savedMeta.unlockedItems || savedMeta.unlockedRelics),
          unlockedCharacters: normalizeUnlockedCharacters(savedMeta.unlockedCharacters),
        };
      }
      activeRun = savedRun && typeof savedRun === 'object' ? savedRun : null;
      uiController.setSaveState(saveStore.kind);
    } catch (error) {
      console.error('Failed to load save data', error);
      uiController.setSaveState('SAVE ERROR');
      activeRun = null;
    }
  }

  function normalizeUnlockedItems(input) {
    const fallback = ['neo_knife'];
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
    const fallback = ['thorn_knight', 'metao'];
    if (!Array.isArray(input)) return fallback;
    const chars = Object.keys(CHARACTER_DEFS).filter(name => input.includes(name));
    return chars.length ? chars : fallback;
  }

  function refreshMenuState() {
    uiController.setMenuMeta(metaProgress.coins, metaProgress.bestFloor, saveStore.kind);
    updateCharacterSelectionUI();
    const summary = activeRun && activeRun.player && activeRun.floor
      ? `Floor ${activeRun.floor} | ${activeRun.player.coins || 0} run coins`
      : '';
    uiController.setRunSummary(summary);
  }

  function updateCharacterSelectionUI() {
    const unlocked = new Set(metaProgress.unlockedCharacters || ['thorn_knight', 'metao']);
    if (metaProgress.godsKilled > 0) unlocked.add('granialla');
    if (!unlocked.has(chosenCharacter)) chosenCharacter = [...unlocked][0] || 'thorn_knight';
    uiController.updateCharacterSelection(unlocked, chosenCharacter);
  }

  function setGameState(nextState) {
    gameState = nextState;
    uiController.setState(nextState);
  }

  async function startGame(resume) {
    setGameState('play');

    if (resume && activeRun) {
      restoreRun(activeRun);
    } else {
      seedStr = ui.seed.value.trim() || Math.floor(Math.random() * 1e9).toString();
      floor = 1;
      gameElapsedTime = 0;
      player = createDefaultPlayer();
      resetScene();
      generateFloor();
      persistMetaSoon();
      scheduleRunSave();
    }

    if (!loopStarted) {
      loopStarted = true;
      requestAnimationFrame(loop);
    }
  }

  function resetScene() {
    enemies = [];
    particles = [];
    projectiles = [];
    chests = [];
    pickups = [];
    destructibles = [];
    hazards = [];
    shopOffers = [];
    structures = [];
    decorations = [];
    cooldowns = { melee: 0, laser: 0, smash: 0, dash: 0 };
    laserActive = false;
    laserTime = 0;
    laserTick = 0;
    dashKeyLatch = false;
    godTimer = 0;
    camera = { x: 0, y: 0 };
    shake = 0;
    shakeT = 0;
    fade = 0;
    fading = 0;
    nextDoor = null;
    floorSkipPending = 0;
    teleportKeyLatch = false;
    mouse.down = false;
    mouse.right = false;
  }

  function restoreRun(snapshot) {
    seedStr = snapshot.seedStr;
    floor = snapshot.floor;
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
    rng = makeRNG(`${seedStr}:${floor}`);
    rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms : [];
    currentRoom = rooms.find(room => room.gx === snapshot.currentRoom?.gx && room.gy === snapshot.currentRoom?.gy) || rooms[0] || null;
    player = migratePlayerData(snapshot.player);
    enemies = snapshot.enemies || [];
    particles = [];
    projectiles = snapshot.projectiles || [];
    chests = snapshot.chests || [];
    pickups = snapshot.pickups || [];
    destructibles = snapshot.destructibles || currentRoom?.destructibles || [];
    hazards = snapshot.hazards || currentRoom?.hazards || [];
    shopOffers = snapshot.shopOffers || currentRoom?.shopOffers || [];
    structures = snapshot.structures || currentRoom?.structures || [];
    decorations = snapshot.decorations || currentRoom?.decorations || [];
    if (currentRoom) {
      currentRoom.enemies = Array.isArray(currentRoom.enemies) ? currentRoom.enemies : enemies;
      currentRoom.projectiles = Array.isArray(currentRoom.projectiles) ? currentRoom.projectiles : projectiles;
      currentRoom.chests = Array.isArray(currentRoom.chests) ? currentRoom.chests : chests;
      currentRoom.pickups = Array.isArray(currentRoom.pickups) ? currentRoom.pickups : pickups;
      currentRoom.destructibles = Array.isArray(currentRoom.destructibles) ? currentRoom.destructibles : destructibles;
      currentRoom.hazards = Array.isArray(currentRoom.hazards) ? currentRoom.hazards : hazards;
      currentRoom.shopOffers = Array.isArray(currentRoom.shopOffers) ? currentRoom.shopOffers : shopOffers;
      currentRoom.structures = Array.isArray(currentRoom.structures) ? currentRoom.structures : structures;
      currentRoom.decorations = Array.isArray(currentRoom.decorations) ? currentRoom.decorations : decorations;
      enemies = currentRoom.enemies;
      projectiles = currentRoom.projectiles;
      chests = currentRoom.chests;
      pickups = currentRoom.pickups;
      destructibles = currentRoom.destructibles;
      hazards = currentRoom.hazards;
      shopOffers = currentRoom.shopOffers;
      structures = currentRoom.structures;
      decorations = currentRoom.decorations;
    }
    cooldowns = snapshot.cooldowns || { melee: 0, laser: 0, smash: 0, dash: 0 };
    cooldowns.dash = Number(cooldowns.dash || 0);
    laserActive = !!snapshot.laserActive;
    laserTime = snapshot.laserTime || 0;
    laserTick = snapshot.laserTick || 0;
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
    updateItemUI();
    updateObjective();
    updateHud();
    persistMetaSoon();
  }

  function generateFloor() {
    rng = makeRNG(`${seedStr}:${floor}`);
    rooms = [];

    const grid = Array.from({ length: 9 }, () => Array(9).fill(null));
    const positions = [];
    const start = { x: 4, y: 4 };
    grid[start.y][start.x] = true;
    positions.push(start);

    const target = 8 + Math.floor(rng() * 3) + Math.min(2, floor >> 2);
    while (positions.length < target) {
      const seed = positions[irand(0, positions.length - 1)];
      const dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      let added = false;
      for (const [dx, dy] of dirs) {
        const nx = seed.x + dx;
        const ny = seed.y + dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || grid[ny][nx]) continue;
        grid[ny][nx] = true;
        positions.push({ x: nx, y: ny });
        added = true;
        break;
      }
      if (!added) break;
    }

    const roomMap = new Map();
    positions.forEach(position => {
      const room = {
        gx: position.x,
        gy: position.y,
        type: 'combat',
        doors: { n: false, s: false, e: false, w: false },
        explored: false,
        visited: false,
        cleared: false,
        bossStarted: false,
      };
      rooms.push(room);
      roomMap.set(`${position.x},${position.y}`, room);
    });

    rooms.forEach(room => {
      const north = roomMap.get(`${room.gx},${room.gy - 1}`);
      const south = roomMap.get(`${room.gx},${room.gy + 1}`);
      const east = roomMap.get(`${room.gx + 1},${room.gy}`);
      const west = roomMap.get(`${room.gx - 1},${room.gy}`);
      if (north) { room.doors.n = true; north.doors.s = true; }
      if (south) { room.doors.s = true; south.doors.n = true; }
      if (east) { room.doors.e = true; east.doors.w = true; }
      if (west) { room.doors.w = true; west.doors.e = true; }
    });

    const startRoom = roomMap.get('4,4');
    startRoom.type = 'start';
    startRoom.cleared = true;
    startRoom.explored = true;
    startRoom.visited = true;

    const farRoom = findFarthestRoom(startRoom, roomMap);
    if (floor === MAX_FLOOR) {
      farRoom.type = 'god';
    } else if (floor % 3 === 0) {
      farRoom.type = 'boss';
    } else {
      farRoom.type = 'ladder';
    }

    const pool = rooms.filter(room => room !== startRoom && room !== farRoom);
    shuffle(pool);
    const treasureCount = Math.min(3, 1 + Math.floor(rng() * 3));
    for (let index = 0; index < treasureCount; index += 1) {
      if (pool[index]) pool[index].type = 'treasure';
    }
    const shopCandidate = pool.find(room => room.type === 'combat');
    if (shopCandidate && rng() < 0.7) shopCandidate.type = 'shop';
    rooms.forEach(decorateRoomData);

    player.x = START_X;
    player.y = START_Y;
    enterRoom(startRoom);
    updateObjective();
    updateHud();
  }

  function decorateRoomData(room) {
    room.destructibles = [];
    room.hazards = [];
    room.shopOffers = [];
    room.structures = [];
    room.decorations = [];
    if (room.type === 'start') return;

    decorateRoomStructures(room);

    const potCount = room.type === 'shop' ? 1 : irand(1, 3);
    for (let index = 0; index < potCount; index += 1) {
      room.destructibles.push({
        kind: 'pot',
        x: 150 + rand(ROOM_W - 300, 0),
        y: 120 + rand(ROOM_H - 240, 0),
        r: 12,
        hp: 1,
        broken: false,
      });
    }

    if (rng() < 0.45 && room.type !== 'shop') {
      room.destructibles.push({
        kind: 'barrel',
        x: 180 + rand(ROOM_W - 360, 0),
        y: 140 + rand(ROOM_H - 280, 0),
        r: 14,
        hp: 1,
        broken: false,
      });
    }

    if (rng() < 0.4 && room.type !== 'god') {
      const primaryLava = createMoatLavaHazard();
      room.hazards.push(primaryLava);
      if (rng() < 0.35) {
        room.hazards.push(createCompanionMoatLava(primaryLava));
      }
    }

    if (rng() < 0.3 && room.type !== 'shop' && room.type !== 'god') {
      const wallX = rng() < 0.5 ? 76 : ROOM_W - 76;
      const hiddenX = wallX < ROOM_W / 2 ? 48 : ROOM_W - 48;
      room.destructibles.push({
        kind: 'wall',
        x: wallX,
        y: ROOM_H / 2 + rand(120, -120),
        r: 26,
        hp: 2,
        broken: false,
      });
      room.destructibles.push({
        kind: 'pot',
        x: hiddenX,
        y: ROOM_H / 2 + rand(140, -140),
        r: 12,
        hp: 1,
        broken: false,
        hidden: true,
      });
    }

    if (room.type === 'shop') {
      room.shopOffers = [
        { type: 'potion', cost: 18 + floor * 2, x: ROOM_W / 2 - 90, y: ROOM_H / 2, bought: false },
        { type: 'item', key: rollItemDrop(), cost: 32 + floor * 4, x: ROOM_W / 2 + 90, y: ROOM_H / 2, bought: false },
      ];
      room.cleared = true;
    }
  }

  function decorateRoomStructures(room) {
    const theme = rng();
    if (theme < 0.34) {
      room.structures.push(
        { kind: 'pillar', x: ROOM_W / 2 - 120, y: ROOM_H / 2 - 90, w: 34, h: 34 },
        { kind: 'pillar', x: ROOM_W / 2 + 120, y: ROOM_H / 2 - 90, w: 34, h: 34 },
        { kind: 'pillar', x: ROOM_W / 2 - 120, y: ROOM_H / 2 + 90, w: 34, h: 34 },
        { kind: 'pillar', x: ROOM_W / 2 + 120, y: ROOM_H / 2 + 90, w: 34, h: 34 },
      );
      room.decorations.push(
        { kind: 'rubble', x: ROOM_W / 2, y: ROOM_H / 2 - 130, r: 22 },
        { kind: 'rubble', x: ROOM_W / 2, y: ROOM_H / 2 + 130, r: 22 },
      );
      return;
    }

    if (theme < 0.68) {
      room.structures.push(
        { kind: 'wall', x: ROOM_W / 2 - 140, y: ROOM_H / 2 - 24, w: 92, h: 48 },
        { kind: 'wall', x: ROOM_W / 2 + 140, y: ROOM_H / 2 - 24, w: 92, h: 48 },
      );
      room.decorations.push(
        { kind: 'banner', x: ROOM_W / 2 - 140, y: ROOM_H / 2 - 70, r: 14 },
        { kind: 'banner', x: ROOM_W / 2 + 140, y: ROOM_H / 2 - 70, r: 14 },
        { kind: 'crack', x: ROOM_W / 2, y: ROOM_H / 2 + 80, r: 30 },
      );
      return;
    }

    room.structures.push(
      { kind: 'wall', x: ROOM_W / 2 - 36, y: ROOM_H / 2 - 150, w: 72, h: 88 },
      { kind: 'wall', x: ROOM_W / 2 - 36, y: ROOM_H / 2 + 62, w: 72, h: 88 },
    );
    room.decorations.push(
      { kind: 'brazier', x: ROOM_W / 2 - 90, y: ROOM_H / 2, r: 18 },
      { kind: 'brazier', x: ROOM_W / 2 + 90, y: ROOM_H / 2, r: 18 },
      { kind: 'crack', x: ROOM_W / 2, y: ROOM_H / 2, r: 24 },
    );
  }

  function randomMoatLanePosition(axis, radius) {
    const margin = 54 + radius;
    const center = axis === 'x' ? ROOM_W / 2 : ROOM_H / 2;
    const max = axis === 'x' ? ROOM_W - margin : ROOM_H - margin;
    const min = margin;
    const doorHalf = DOOR / 2 + radius + 26;
    const lowMax = center - doorHalf;
    const highMin = center + doorHalf;

    const ranges = [];
    if (lowMax > min) ranges.push([min, lowMax]);
    if (max > highMin) ranges.push([highMin, max]);
    if (!ranges.length) return rand(max, min);

    const [rangeMin, rangeMax] = ranges[irand(0, ranges.length - 1)];
    return rand(rangeMax, rangeMin);
  }

  function createMoatLavaHazard() {
    const r = 44 + rand(24, 0);
    const side = irand(0, 3);
    const wallOffset = WALL + r + 18 + rand(16, 0);
    const hazard = {
      kind: 'lava',
      x: ROOM_W / 2,
      y: ROOM_H / 2,
      r,
      phase: rand(Math.PI * 2, 0),
      pulse: rand(1.8, 1.15),
      wobble: rand(0.75, 0.45),
      side,
    };

    if (side === 0) {
      hazard.x = randomMoatLanePosition('x', r);
      hazard.y = wallOffset;
    } else if (side === 1) {
      hazard.x = randomMoatLanePosition('x', r);
      hazard.y = ROOM_H - wallOffset;
    } else if (side === 2) {
      hazard.x = wallOffset;
      hazard.y = randomMoatLanePosition('y', r);
    } else {
      hazard.x = ROOM_W - wallOffset;
      hazard.y = randomMoatLanePosition('y', r);
    }

    return hazard;
  }

  function createCompanionMoatLava(primary) {
    const companion = {
      kind: 'lava',
      x: primary.x,
      y: primary.y,
      r: primary.r * rand(0.86, 0.68),
      phase: primary.phase + rand(1.9, 0.6),
      pulse: primary.pulse + rand(0.35, -0.2),
      wobble: primary.wobble + rand(0.2, -0.15),
      side: primary.side,
    };

    const along = (primary.r + companion.r) * rand(1.2, 0.75);
    if (primary.side <= 1) {
      companion.x = clamp(primary.x + (rng() < 0.5 ? -along : along), companion.r + 42, ROOM_W - companion.r - 42);
      companion.y = primary.side === 0 ? WALL + companion.r + 18 : ROOM_H - WALL - companion.r - 18;
    } else {
      companion.y = clamp(primary.y + (rng() < 0.5 ? -along : along), companion.r + 42, ROOM_H - companion.r - 42);
      companion.x = primary.side === 2 ? WALL + companion.r + 18 : ROOM_W - WALL - companion.r - 18;
    }

    return companion;
  }

  function findFarthestRoom(startRoom, roomMap) {
    const queue = [startRoom];
    const distances = new Map([[startRoom, 0]]);
    let farthest = startRoom;

    while (queue.length) {
      const room = queue.shift();
      const baseDistance = distances.get(room);
      [
        ['n', 0, -1],
        ['s', 0, 1],
        ['e', 1, 0],
        ['w', -1, 0],
      ].forEach(([dir, dx, dy]) => {
        if (!room.doors[dir]) return;
        const next = roomMap.get(`${room.gx + dx},${room.gy + dy}`);
        if (!next || distances.has(next)) return;
        distances.set(next, baseDistance + 1);
        queue.push(next);
        if (baseDistance + 1 > distances.get(farthest)) farthest = next;
      });
    }

    return farthest;
  }

  function syncCurrentRoomState() {
    if (!currentRoom) return;
    currentRoom.enemies = enemies;
    currentRoom.projectiles = projectiles;
    currentRoom.chests = chests;
    currentRoom.pickups = pickups;
    currentRoom.destructibles = destructibles;
    currentRoom.hazards = hazards;
    currentRoom.shopOffers = shopOffers;
    currentRoom.structures = structures;
    currentRoom.decorations = decorations;
  }

  function findSafeSpawnPoint() {
    const searchRadius = 120;
    const testRadius = 18;
    const angleStep = Math.PI / 8;
    
    if (!isBlocked(START_X, START_Y, testRadius)) {
      return { x: START_X, y: START_Y };
    }
    
    for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
      for (let r = searchRadius * 0.25; r <= searchRadius; r += 20) {
        const x = START_X + Math.cos(angle) * r;
        const y = START_Y + Math.sin(angle) * r;
        if (!isBlocked(x, y, testRadius)) {
          return { x: clamp(x, WALL + testRadius, ROOM_W - WALL - testRadius), y: clamp(y, WALL + testRadius, ROOM_H - WALL - testRadius) };
        }
      }
    }
    
    return { x: START_X, y: START_Y };
  }

  function enterRoom(room) {
    syncCurrentRoomState();
    currentRoom = room;
    room.explored = true;
    room.visited = true;
    enemies = room.enemies || [];
    projectiles = room.projectiles || [];
    chests = room.chests || [];
    pickups = room.pickups || [];
    particles = [];
    destructibles = room.destructibles || [];
    hazards = room.hazards || [];
    shopOffers = room.shopOffers || [];
    structures = room.structures || [];
    decorations = room.decorations || [];
    laserActive = false;
    laserTime = 0;
    laserTick = 0;
    player.roomDamageTaken = 0;
    const safeSpawn = findSafeSpawnPoint();
    player.x = safeSpawn.x;
    player.y = safeSpawn.y;

    if (room.type === 'combat' && !room.cleared && enemies.length === 0) {
      spawnWave(3 + floor + irand(0, 1));
    }

    if (room.type === 'treasure' && !room.cleared && chests.length === 0) {
      const chestCount = 1 + Math.floor(rng() * 2);
      for (let index = 0; index < chestCount; index += 1) {
        chests.push({ x: 260 + index * 180, y: ROOM_H / 2, open: false });
      }
    }

    if (room.type === 'ladder') {
      if (!room.cleared && enemies.length === 0) {
        spawnWave(4 + floor + irand(0, 1));
      }
      if (room.cleared && !pickups.some(pickup => pickup.type === 'ladder')) {
        let ladderX = ROOM_W / 2;
        let ladderY = ROOM_H / 2;
        let attempts = 0;
        while (isBlocked(ladderX, ladderY, 16) && attempts < 20) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 60 + Math.random() * 120;
          ladderX = clamp(ROOM_W / 2 + Math.cos(angle) * radius, 60, ROOM_W - 60);
          ladderY = clamp(ROOM_H / 2 + Math.sin(angle) * radius, 60, ROOM_H - 60);
          attempts++;
        }
        pickups.push({ x: ladderX, y: ladderY, type: 'ladder' });
      }
    }

    if (room.type === 'boss') {
      if (!room.cleared && enemies.length === 0) {
        spawnFloorBoss();
      }
      if (room.cleared && !pickups.some(pickup => pickup.type === 'ladder')) {
        let ladderX = ROOM_W / 2;
        let ladderY = ROOM_H / 2;
        let attempts = 0;
        while (isBlocked(ladderX, ladderY, 16) && attempts < 20) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 60 + Math.random() * 120;
          ladderX = clamp(ROOM_W / 2 + Math.cos(angle) * radius, 60, ROOM_W - 60);
          ladderY = clamp(ROOM_H / 2 + Math.sin(angle) * radius, 60, ROOM_H - 60);
          attempts++;
        }
        pickups.push({ x: ladderX, y: ladderY, type: 'ladder' });
      }
    }

    if (room.type === 'god') {
      if (room.cleared) {
        if (!pickups.some(pickup => pickup.type === 'crown')) {
          pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'crown' });
        }
      } else if (room.bossStarted) {
        if (!enemies.some(enemy => enemy.type === 'god')) {
          spawnGodBoss();
        }
      } else {
        if (!pickups.some(pickup => pickup.type === 'fightGod')) {
          pickups.push({ x: ROOM_W / 2 - 120, y: ROOM_H / 2, type: 'fightGod' });
        }
        if (!pickups.some(pickup => pickup.type === 'returnGate')) {
          pickups.push({ x: ROOM_W / 2 + 120, y: ROOM_H / 2, type: 'returnGate' });
        }
      }
    }

    syncCurrentRoomState();
    updateObjective();
    scheduleRunSave();
  }

  function findSafeEnemySpawnPoint(preferredX, preferredY, radius = 18) {
    if (!isBlocked(preferredX, preferredY, radius)) {
      return { x: preferredX, y: preferredY };
    }
    
    const searchAngles = 16;
    const maxAttempts = 40;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = (attempt / searchAngles) * Math.PI * 2;
      const searchRadius = 30 + (attempt % 4) * 40;
      const x = clamp(preferredX + Math.cos(angle) * searchRadius, WALL + radius, ROOM_W - WALL - radius);
      const y = clamp(preferredY + Math.sin(angle) * searchRadius, WALL + radius, ROOM_H - WALL - radius);
      if (!isBlocked(x, y, radius)) {
        return { x, y };
      }
    }
    
    return null;
  }

  function spawnWave(count) {
    for (let index = 0; index < count; index += 1) {
      const angle = rng() * Math.PI * 2;
      const radius = 120 + rng() * 180;
      const x = clamp(ROOM_W / 2 + Math.cos(angle) * radius, 80, ROOM_W - 80);
      const y = clamp(ROOM_H / 2 + Math.sin(angle) * radius, 80, ROOM_H - 80);
      const safeSpawn = findSafeEnemySpawnPoint(x, y, 15);
      if (!safeSpawn) continue;
      const roll = rng();
      let type = 'hunter';
      if (roll > 0.84) type = 'golem';
      else if (roll > 0.68) type = 'sniper';
      else if (roll > 0.5) type = 'knave';
      else if (roll > 0.32) type = 'cult_mage';
      else if (roll > 0.16) type = 'charger';
      else if (roll > 0.08) type = 'laser';
      spawnEnemy(type, safeSpawn.x, safeSpawn.y, rng() < 0.12);
    }
  }

  function spawnFloorBoss() {
    const bossType = floor <= 3 ? 'queen_cult' : floor <= 6 ? 'bulk_golem' : 'artificer_knave';
    const safeSpawn = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2 - 40, 15);
    if (safeSpawn) spawnEnemy(bossType, safeSpawn.x, safeSpawn.y, false);
  }

  function getEnemyDifficultyMultiplier() {
    const gameMinutes = gameElapsedTime / 60;
    return 1 + gameMinutes * floor * 0.15;
  }

  function spawnEnemy(type, x, y, elite = false) {
    const base = {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 15,
      hp: 52,
      max: 52,
      speed: 96,
      dmg: 12,
      elite,
      stun: 0,
      inv: 0,
      attackCd: rand(0.2, 0.9),
      bleed: 0,
      bleedT: 0,
      bleedTick: 0,
      windup: 0,
      beamTime: 0,
      beamTick: 0,
      beamAngle: 0,
      dashTime: 0,
      dashAngle: 0,
      dashHit: false,
      swingTime: 0,
      summonCd: 0,
      aoeTime: 0,
      phase: 1,
      splitReady: false,
      spawnedFromBulk: false,
      bleedImmune: false,
      state: 'idle',
    };

    if (type === 'god') {
      base.r = 34;
      base.hp = 920;
      base.max = 920;
      base.speed = 108;
      base.dmg = 18;
      base.attackCd = 1.4;
    } else if (type === 'cult_mage') {
      base.r = 17;
      base.hp = 84;
      base.max = 84;
      base.speed = 58;
      base.dmg = 18;
      base.attackCd = 1.8;
    } else if (type === 'knave') {
      base.r = 16;
      base.hp = 68;
      base.max = 68;
      base.speed = 118;
      base.dmg = 14;
      base.attackCd = 1.3;
    } else if (type === 'sniper') {
      base.r = 15;
      base.hp = 58;
      base.max = 58;
      base.speed = 104;
      base.dmg = 12;
      base.attackCd = 1.55;
    } else if (type === 'golem') {
      base.r = 20;
      base.hp = 132;
      base.max = 132;
      base.speed = 70;
      base.dmg = 18;
      base.attackCd = 1.9;
      base.bleedImmune = true;
    } else if (type === 'cult_follower') {
      base.r = 12;
      base.hp = 34;
      base.max = 34;
      base.speed = 138;
      base.dmg = 8;
      base.attackCd = 0.85;
    } else if (type === 'queen_cult') {
      base.r = 38;
      base.hp = 760;
      base.max = 760;
      base.speed = 96;
      base.dmg = 20;
      base.attackCd = 1.2;
      base.summonCd = 2.4;
    } else if (type === 'bulk_golem') {
      base.r = 58;
      base.hp = 1280;
      base.max = 1280;
      base.speed = 74;
      base.dmg = 26;
      base.attackCd = 1.6;
      base.bleedImmune = true;
      base.splitReady = true;
      base.aoeTime = 3;
    } else if (type === 'artificer_knave') {
      base.r = 30;
      base.hp = 940;
      base.max = 940;
      base.speed = 124;
      base.dmg = 20;
      base.attackCd = 1.2;
      base.phase = 1;
    } else {
      const scale = 1 + (floor - 1) * 0.14;
      base.hp = Math.round(base.hp * scale);
      base.max = base.hp;
      if (elite) {
        base.hp = Math.round(base.hp * 1.35);
        base.max = base.hp;
        base.speed *= 1.08;
        base.r = 17;
      }
    }

    const difficultyMult = getEnemyDifficultyMultiplier();
    base.hp = Math.round(base.hp * difficultyMult);
    base.max = base.hp;
    base.dmg = Math.round(base.dmg * difficultyMult);
    base.speed *= difficultyMult;

    enemies.push(base);
    return base;
  }

  function spawnGodBoss() {
    if (enemies.some(enemy => enemy.type === 'god')) return;
    const safeSpawn = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2 - 40, 15);
    if (safeSpawn) spawnEnemy('god', safeSpawn.x, safeSpawn.y, false);
  }

  function isBossType(type) {
    return BOSS_TYPES.has(type);
  }

  function migratePlayerData(source) {
    const playerData = source || createDefaultPlayer();
    playerData.character = playerData.character || 'thorn_knight';
    if (!playerData.items) {
      const legacy = playerData.relics || {};
      playerData.items = {
        neo_knife: legacy.thorn ? 1 : 0,
        orb_of_blood: legacy.hemo ? 1 : 0,
        hemes_scarf: legacy.leech ? 1 : 0,
      };
    }
    delete playerData.relics;
    ITEM_KEYS.forEach(key => {
      playerData.items[key] = Number(playerData.items[key] || 0);
    });
    playerData.level = Number(playerData.level || 1);
    playerData.xp = Number(playerData.xp || 0);
    playerData.xpToNext = Number(playerData.xpToNext || 20);
    playerData.attackPower = Number(playerData.attackPower || 0);
    playerData.attackSpeed = Number(playerData.attackSpeed || 1);
    playerData.roomDamageTaken = Number(playerData.roomDamageTaken || 0);
    playerData.dashTime = Number(playerData.dashTime || 0);
    playerData.dashX = Number(playerData.dashX || 0);
    playerData.dashY = Number(playerData.dashY || 0);
    playerData.insuranceActive = !!playerData.insuranceActive;
    playerData.insuranceChargeKills = Number(playerData.insuranceChargeKills || 0);
    playerData.insuranceReady = playerData.insuranceReady !== false;
    playerData.escapeChargeKills = Number(playerData.escapeChargeKills || 0);
    playerData.escapeReady = playerData.escapeReady !== false;
    return playerData;
  }

  function getCharacterDef() {
    return CHARACTER_DEFS[player?.character || chosenCharacter] || CHARACTER_DEFS.thorn_knight;
  }

  function getItemCount(key) {
    return Number(player?.items?.[key] || 0);
  }

  function getChargeRequirement(baseRequirement) {
    return Math.max(1, baseRequirement - getItemCount('charged_adapter'));
  }

  function getItemStats() {
    const neoKnife = getItemCount('neo_knife');
    const orbOfBlood = getItemCount('orb_of_blood');
    const hemesScarf = getItemCount('hemes_scarf');
    const critCharm = getItemCount('crit_charm');
    const attackServo = getItemCount('attack_servo');
    const turtleShell = getItemCount('turtle_shell');
    const oracleLens = getItemCount('oracles_lens') > 0;
    let critChance = critCharm * 0.05;
    if (oracleLens) critChance *= 2;
    critChance = clamp(critChance, 0, 0.95);
    return {
      bleedChance: neoKnife * 0.05,
      bleedDamageMultiplier: orbOfBlood > 0 ? 1 + orbOfBlood : 1,
      bleedHealScale: hemesScarf,
      passiveBleedStacks: hemesScarf,
      critChance,
      critMultiplier: 1.6 + (oracleLens ? critChance * 2.2 : critChance * 0.6),
      attackSpeedBonus: attackServo * 0.2,
      moveSpeedMultiplier: 1 + turtleShell * 0.05,
      hasIronLung: getItemCount('iron_lung') > 0,
    };
  }

  function getAttackSpeedValue() {
    const stats = getItemStats();
    return Math.max(0.2, (player?.attackSpeed || 1) + stats.attackSpeedBonus);
  }

  function consumeCharge(chargeType) {
    if (chargeType === 'insurance') {
      player.insuranceReady = false;
      player.insuranceChargeKills = 0;
      return;
    }
    if (chargeType === 'escape') {
      player.escapeReady = false;
      player.escapeChargeKills = 0;
    }
  }

  function incrementChargeProgress(chargeType, baseRequirement) {
    if (chargeType === 'insurance') {
      if (getItemCount('insurance') <= 0 || player.insuranceReady) return;
      player.insuranceChargeKills += 1;
      if (player.insuranceChargeKills >= getChargeRequirement(baseRequirement)) {
        player.insuranceReady = true;
        player.insuranceChargeKills = 0;
        player.insuranceActive = false;
        particles.push({ x: player.x, y: player.y - 20, life: 0.7, text: 'INSURANCE READY', c: '#e8ecff' });
      }
      return;
    }
    if (chargeType === 'escape') {
      if (getItemCount('charged_adapter') <= 0 || player.escapeReady) return;
      player.escapeChargeKills += 1;
      if (player.escapeChargeKills >= getChargeRequirement(baseRequirement)) {
        player.escapeReady = true;
        player.escapeChargeKills = 0;
        particles.push({ x: player.x, y: player.y - 36, life: 0.7, text: 'WARP READY', c: '#b88cff' });
      }
    }
  }

  function scaleDamageAgainstEnemy(enemy, damage) {
    const stats = getItemStats();
    const characterMultiplier = getCharacterDef().damageMultiplier || 1;
    const powered = (damage + (player?.attackPower || 0)) * characterMultiplier;
    if (enemy.bleed > 0 && stats.bleedDamageMultiplier > 1) {
      return Math.round(powered * stats.bleedDamageMultiplier);
    }
    return Math.round(powered);
  }

  function tryMelee() {
    if (cooldowns.melee > 0) return;
    const itemStats = getItemStats();
    const attackSpeed = getAttackSpeedValue();
    const character = getCharacterDef();
    cooldowns.melee = (godTimer > 0 ? 0.2 : ATTACKS.melee.baseCooldown) / attackSpeed;
    if (character.key === 'metao') {
      spawnFireballs();
      return;
    }
    if (character.key === 'granialla') {
      castSmiteChain();
      return;
    }
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    player.swing = ATTACKS.melee.active;
    player.swingA = angle;

    const stepX = Math.cos(angle) * 22;
    const stepY = Math.sin(angle) * 22;
    const nextX = player.x + stepX;
    const nextY = player.y + stepY;
    if (!isBlocked(nextX, nextY, player.r)) {
      player.x = nextX;
      player.y = nextY;
    }

    const damage = godTimer > 0 ? 56 : ATTACKS.melee.damage;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > ATTACKS.melee.range + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > ATTACKS.melee.arc) continue;
      hitEnemy(enemy, damage, angle, ATTACKS.melee.push, '#0ff');
      if (itemStats.bleedChance > 0 && rng() < itemStats.bleedChance) applyBleed(enemy, 1, 5);
    }
    destructibles.forEach(prop => {
      if (!prop.broken && !prop.hidden && dist(player.x, player.y, prop.x, prop.y) <= ATTACKS.melee.range) {
        damageDestructible(prop, 1);
      }
    });
  }

  function tryLaser() {
    if (cooldowns.laser > 0 || laserActive) return;
    const attackSpeed = getAttackSpeedValue();
    const character = getCharacterDef();
    if (character.key === 'metao') {
      cooldowns.laser = ATTACKS.laser.baseCooldown / attackSpeed;
      spawnPlayerDiskBurst();
      return;
    }
    if (character.key === 'granialla') {
      cooldowns.laser = 3.8 / attackSpeed;
      castBladeOfJustice();
      return;
    }
    laserActive = true;
    laserTime = (godTimer > 0 ? 0.72 : ATTACKS.laser.duration) / attackSpeed;
    laserTick = 0;
  }

  function updatePlayerLaser(dt) {
    if (!laserActive) return;
    laserTime -= dt;
    laserTick -= dt;
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    if (laserTick <= 0) {
      laserTick = ATTACKS.laser.tick;
      const end = getBeamEnd(player.x, player.y, angle, ATTACKS.laser.range);
      for (let index = enemies.length - 1; index >= 0; index -= 1) {
        const enemy = enemies[index];
        if (!beamHitsCircle(player.x, player.y, end.x, end.y, enemy.x, enemy.y, enemy.r + 6)) continue;
        hitEnemy(enemy, godTimer > 0 ? 16 : ATTACKS.laser.damage, angle, 60, '#f0f');
      }
      destructibles.forEach(prop => {
        if (!prop.broken && !prop.hidden && beamHitsCircle(player.x, player.y, end.x, end.y, prop.x, prop.y, prop.r + 4)) {
          damageDestructible(prop, 1);
        }
      });
    }
    if (laserTime <= 0) {
      laserActive = false;
      cooldowns.laser = godTimer > 0 ? 2.8 : ATTACKS.laser.baseCooldown;
    }
  }

  function trySmash() {
    if (cooldowns.smash > 0) return;
    const itemStats = getItemStats();
    const attackSpeed = getAttackSpeedValue();
    const character = getCharacterDef();
    cooldowns.smash = (godTimer > 0 ? 2 : ATTACKS.smash.baseCooldown) / attackSpeed;
    if (character.key === 'metao') {
      castChaosBurst();
      return;
    }
    if (character.key === 'granialla') {
      castHealingZone();
      return;
    }
    shake = 16;
    shakeT = 0.24;
    particles.push({ x: player.x, y: player.y, life: 0.4, ring: ATTACKS.smash.radius - 30, c: '#ff00aa' });
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > ATTACKS.smash.radius + enemy.r) continue;
      const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      let damage = godTimer > 0 ? 82 : ATTACKS.smash.damage;
      if (itemStats.bleedDamageMultiplier > 1 && enemy.bleed > 0) {
        damage += ATTACKS.smash.bonus;
        particles.push({ x: enemy.x, y: enemy.y - 16, life: 0.6, text: 'POP', c: '#a0f' });
      }
      hitEnemy(enemy, damage, angle, 320, '#ff66cc');
      enemy.stun = 0.5;
    }
    destructibles.forEach(prop => {
      if (!prop.broken && !prop.hidden && dist(player.x, player.y, prop.x, prop.y) <= ATTACKS.smash.radius + prop.r) {
      damageDestructible(prop, 2);
      }
    });
  }

  function tryDash(moveX, moveY) {
    if (cooldowns.dash > 0 || player.dashTime > 0) return;
    const attackSpeed = getAttackSpeedValue();
    const angle = Math.hypot(moveX, moveY) > 0.15
      ? Math.atan2(moveY, moveX)
      : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const dashSpeed = (520 + player.attackSpeed * 28) * (godTimer > 0 ? 1.1 : 1);
    player.dashTime = 0.16;
    player.dashX = Math.cos(angle) * dashSpeed;
    player.dashY = Math.sin(angle) * dashSpeed;
    player.vx = player.dashX;
    player.vy = player.dashY;
    player.inv = Math.max(player.inv, 0.18);
    cooldowns.dash = 1.8 / attackSpeed;
    shake = Math.max(shake, 3);
    shakeT = Math.max(shakeT, 0.08);
    particles.push({ x: player.x, y: player.y, life: 0.28, ring: 18, c: '#fff06a' });
  }

  function spawnPlayerDiskBurst() {
    for (let index = 0; index < 8; index += 1) {
      const angle = index * (Math.PI * 2 / 8);
      projectiles.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 280, vy: Math.sin(angle) * 280, r: 7, life: 1.2, enemy: false, kind: 'disk', damage: 20 });
    }
  }

  function spawnFireballs() {
    const base = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    for (let index = -1; index <= 1; index += 1) {
      const angle = base + index * 0.18;
      projectiles.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 320, vy: Math.sin(angle) * 320, r: 8, life: 1.6, enemy: false, kind: 'fireball', damage: 22, splash: 48 });
    }
  }

  function castChaosBurst() {
    for (let index = 0; index < 6; index += 1) {
      const angle = rng() * Math.PI * 2;
      const px = player.x + Math.cos(angle) * rand(160, 40);
      const py = player.y + Math.sin(angle) * rand(160, 40);
      particles.push({ x: px, y: py, life: 0.45, ring: 18, c: '#c971ff' });
      blastRadius(px, py, 52, 24, '#c971ff');
    }
  }

  function castBladeOfJustice() {
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > 110 + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > 1.3) continue;
      hitEnemy(enemy, 34, angle, 280, '#fff6a3');
    }
    particles.push({ x: player.x, y: player.y, life: 0.5, ring: 36, c: '#fff6a3' });
  }

  function castSmiteChain() {
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    player.swing = ATTACKS.melee.active;
    player.swingA = angle;

    // Physical swing: hits enemies and destructibles in an arc.
    const physicalDamage = 20;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > ATTACKS.melee.range + enemy.r + 4) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > ATTACKS.melee.arc + 0.15) continue;
      hitEnemy(enemy, physicalDamage, angle, ATTACKS.melee.push, '#fff6a3');
    }
    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const distance = dist(player.x, player.y, prop.x, prop.y);
      if (distance > ATTACKS.melee.range + prop.r + 4) return;
      const targetAngle = Math.atan2(prop.y - player.y, prop.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > ATTACKS.melee.arc + 0.15) return;
      damageDestructible(prop, 2);
    });

    const origin = findNearestSmiteTarget(player.x, player.y, 280);
    if (!origin) return;

    let current = origin;
    let fromX = player.x;
    let fromY = player.y;
    const hit = new Set();
    for (let jumps = 0; jumps < 5 && current; jumps += 1) {
      hit.add(current.ref);
      const strikeDamage = 18 + jumps * 4;
      if (current.type === 'enemy') {
        hitEnemy(current.ref, strikeDamage, Math.atan2(current.y - fromY, current.x - fromX), 90, '#dfe8ff');
      } else {
        damageDestructible(current.ref, Math.max(2, Math.round(strikeDamage / 10)));
      }
      particles.push({ x: current.x, y: current.y, life: 0.32, ring: 18 + jumps * 3, c: '#cfdcff' });
      particles.push({
        life: 0.24,
        c: '#eaf2ff',
        line: {
          x1: fromX,
          y1: fromY,
          x2: current.x,
          y2: current.y,
          w: 4.5 + jumps * 0.7,
          jag: 14 + jumps * 1.4,
          seg: 7,
          phase: rng() * Math.PI * 2,
        },
      });
      fromX = current.x;
      fromY = current.y;
      current = findNearestSmiteTarget(fromX, fromY, 170, hit);
    }
  }

  function findNearestSmiteTarget(x, y, radius, exclude = new Set()) {
    let best = null;
    let bestDist = radius;

    enemies.forEach(enemy => {
      if (exclude.has(enemy)) return;
      const d = dist(x, y, enemy.x, enemy.y);
      if (d < bestDist) {
        best = { type: 'enemy', ref: enemy, x: enemy.x, y: enemy.y, r: enemy.r };
        bestDist = d;
      }
    });

    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden || exclude.has(prop)) return;
      const d = dist(x, y, prop.x, prop.y);
      if (d < bestDist) {
        best = { type: 'prop', ref: prop, x: prop.x, y: prop.y, r: prop.r };
        bestDist = d;
      }
    });

    return best;
  }

  function castHealingZone() {
    hazards.push({ kind: 'healing_zone', x: player.x, y: player.y, r: 62, ttl: 6, healTick: 0.24, healAccum: 0, plusTick: 0.08 });
    particles.push({ x: player.x, y: player.y, life: 0.7, ring: 30, c: '#35ff6f' });
  }

  function hitEnemy(enemy, damage, angle, knockback, color) {
    const stats = getItemStats();
    let dealt = scaleDamageAgainstEnemy(enemy, damage);
    const isCrit = stats.critChance > 0 && rng() < stats.critChance;
    if (isCrit) dealt = Math.round(dealt * stats.critMultiplier);
    enemy.hp -= dealt;
    enemy.vx += Math.cos(angle) * knockback;
    enemy.vy += Math.sin(angle) * knockback;
    enemy.stun = Math.max(enemy.stun, 0.08);
    particles.push({ x: enemy.x, y: enemy.y, life: 0.24, vx: rand(-30, 30), vy: rand(-30, 30), c: color });
    spawnDamagePopup(enemy.x, enemy.y - 14, dealt, {
      crit: isCrit,
      color: isCrit ? '#ff9f1c' : '#ff6b6b',
      size: isCrit ? 20 : 16,
    });
    if (enemy.hp <= 0) onEnemyDie(enemy);
  }

  function applyBleed(enemy, stacks, duration) {
    if (enemy.bleedImmune) return;
    enemy.bleed = Math.min(6, enemy.bleed + stacks);
    enemy.bleedT = Math.max(enemy.bleedT, duration);
  }

  function onEnemyDie(enemy) {
    const index = enemies.indexOf(enemy);
    if (index >= 0) enemies.splice(index, 1);

    for (let burst = 0; burst < 12; burst += 1) {
      particles.push({
        x: enemy.x,
        y: enemy.y,
        life: 0.45 + Math.random() * 0.3,
        vx: rand(-130, 130),
        vy: rand(-130, 130),
        c: enemy.elite ? '#ffaa00' : enemy.type === 'god' ? '#fff' : '#0ff',
      });
    }

    dropCoins(enemy.x, enemy.y, isBossType(enemy.type) ? 40 : enemy.elite ? 10 : 5);
    grantXp(isBossType(enemy.type) ? 40 : enemy.elite ? 12 : 6);
    incrementChargeProgress('insurance', 9);
    incrementChargeProgress('escape', 10);

    if (enemy.elite && rng() < 0.18) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ elite: true }) });
    } else if (rng() < 0.1) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'potion' });
    }

    if (enemy.type === 'god') {
      metaProgress.godsKilled = Number(metaProgress.godsKilled || 0) + 1;
      if (!metaProgress.unlockedCharacters.includes('granialla')) metaProgress.unlockedCharacters.push('granialla');
      currentRoom.cleared = true;
      pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'crown' });
      updateObjective();
      refreshMenuState();
      scheduleRunSave();
      return;
    }

    if (enemy.type === 'bulk_golem' && enemy.splitReady) {
      const leftSpawn = findSafeEnemySpawnPoint(enemy.x - 70, enemy.y, 15);
      const rightSpawn = findSafeEnemySpawnPoint(enemy.x + 70, enemy.y, 15);
      if (leftSpawn) {
        const left = spawnEnemy('golem', leftSpawn.x, leftSpawn.y, false);
        left.spawnedFromBulk = true;
        left.hp = Math.round(left.max * 0.9);
        left.max = left.hp;
      }
      if (rightSpawn) {
        const right = spawnEnemy('golem', rightSpawn.x, rightSpawn.y, false);
        right.spawnedFromBulk = true;
        right.hp = Math.round(right.max * 0.9);
        right.max = right.hp;
      }
    }

    if (enemies.length === 0 && !currentRoom.cleared) {
      currentRoom.cleared = true;
      if (currentRoom.type === 'ladder' || currentRoom.type === 'boss') {
        pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'ladder' });
      }
      updateObjective();
      scheduleRunSave();
    }
  }

  function dropCoins(x, y, amount) {
    const chunks = Math.max(1, Math.ceil(amount / 4));
    for (let index = 0; index < chunks; index += 1) {
      pickups.push({
        x: x + rand(-18, 18),
        y: y + rand(-18, 18),
        type: 'coin',
        value: Math.ceil(amount / chunks),
      });
    }
  }

  function rollItemDrop(options = {}) {
    const bonus = options.elite ? 8 : 0;
    const totalWeight = ITEM_DROP_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0) + bonus;
    let roll = rand(totalWeight, 0);
    for (const [key, weight] of ITEM_DROP_WEIGHTS) {
      const extra = options.elite && key !== 'neo_knife' ? bonus / 2 : 0;
      roll -= weight + extra;
      if (roll <= 0) return key;
    }
    return 'neo_knife';
  }

  function grantXp(amount) {
    player.xp += amount;
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      levelUp();
    }
  }

  function levelUp() {
    player.level += 1;
    player.xpToNext = Math.round(player.xpToNext * 1.22);
    player.maxHp += 15;
    player.hp = Math.min(player.maxHp, player.hp + 15);
    player.attackPower += 3;
    player.attackSpeed += 0.01;
    particles.push({ x: player.x, y: player.y - 20, life: 0.9, text: `LV ${player.level}`, c: '#7dff9e' });
  }

  function collectItem(itemKey) {
    const item = itemRegistry.get(itemKey);
    if (!item) return;
    player.items[itemKey] = getItemCount(itemKey) + 1;
    particles.push({ x: player.x, y: player.y - 28, life: 0.9, text: `${item.shortName} +1`, c: item.color || '#fff' });

    if (itemKey === 'wizards_paw') {
      const choices = ['maxHp', 'attackPower', 'attackSpeed'];
      shuffle(choices);
      const selected = choices.slice(0, 2);
      selected.forEach(stat => {
        if (stat === 'maxHp') {
          player.maxHp = Math.max(120, Math.round(player.maxHp * 3));
          player.hp = Math.min(player.maxHp, Math.round(player.hp * 3));
        }
        if (stat === 'attackPower') {
          player.attackPower = Math.max(3, Math.round(player.attackPower * 3));
        }
        if (stat === 'attackSpeed') {
          player.attackSpeed = Math.max(0.2, player.attackSpeed * 3);
        }
      });
      particles.push({ x: player.x, y: player.y - 46, life: 1, text: "WIZARD'S PAW!", c: '#ffd27d' });
    }

    if (itemKey === 'jesters_dice') {
      floorSkipPending += 3;
      for (let index = 0; index < 10; index += 1) {
        const rewardPool = ITEM_KEYS.filter(key => key !== 'jesters_dice');
        const key = rewardPool[irand(0, rewardPool.length - 1)];
        player.items[key] = getItemCount(key) + 1;
      }
      particles.push({ x: player.x, y: player.y - 46, life: 1, text: '+10 ITEMS', c: '#ff8bd8' });
    }

    if (!metaProgress.unlockedItems.includes(itemKey)) {
      metaProgress.unlockedItems.push(itemKey);
      persistMetaSoon();
      refreshMenuState();
    }

    updateItemUI();

    if (ITEM_KEYS.every(key => getItemCount(key) > 0) && godTimer <= 0) {
      godTimer = 12;
      for (let index = 0; index < 40; index += 1) {
        particles.push({
          x: player.x,
          y: player.y,
          life: 1.1,
          vx: rand(-220, 220),
          vy: rand(-220, 220),
          c: `hsl(${index * 9},100%,60%)`,
        });
      }
    }
  }

  function updateItemUI() {
    uiController.setItemStatus(player?.items || {});
  }

  function loop(timestamp) {
    const dt = Math.min(0.033, (timestamp - lastTime) / 1000 || 0.016);
    lastTime = timestamp;
    if (gameState === 'play') update(dt);
    uiController.tick();
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const itemStats = getItemStats();
    gameElapsedTime += dt;
    lavaAnimTime += dt;
    floorTransitionTime += dt;
    if (floorTransitionTime > 2.5) showFloorTransition = false;
    cooldowns.melee = Math.max(0, cooldowns.melee - dt);
    cooldowns.laser = Math.max(0, cooldowns.laser - dt);
    cooldowns.smash = Math.max(0, cooldowns.smash - dt);
    cooldowns.dash = Math.max(0, cooldowns.dash - dt);
    if (godTimer > 0) godTimer = Math.max(0, godTimer - dt);

    const _b = window.NeoSettings?.getBindings();
    const _right = _b ? _b.right : 'd';
    const _left  = _b ? _b.left  : 'a';
    const _down  = _b ? _b.down  : 's';
    const _up    = _b ? _b.up    : 'w';
    let moveX = (keys[_right] || keys.arrowright ? 1 : 0) - (keys[_left] || keys.arrowleft ? 1 : 0);
    let moveY = (keys[_down]  || keys.arrowdown  ? 1 : 0) - (keys[_up]   || keys.arrowup   ? 1 : 0);
    const moveLength = Math.hypot(moveX, moveY) || 1;
    moveX /= moveLength;
    moveY /= moveLength;
    if (moveLength < 0.1) {
      moveX = 0;
      moveY = 0;
    }

    const dashKey = _b ? _b.dash : 'shift';
    const dashHeld = !!keys[dashKey];
    if (dashHeld && !dashKeyLatch) {
      tryDash(moveX, moveY);
      dashKeyLatch = true;
    } else if (!dashHeld) {
      dashKeyLatch = false;
    }

    if (player.dashTime > 0) {
      player.dashTime = Math.max(0, player.dashTime - dt);
      player.vx = player.dashX;
      player.vy = player.dashY;
      player.inv = Math.max(player.inv, 0.12);
      if (player.dashTime <= 0) {
        player.dashX = 0;
        player.dashY = 0;
      }
    } else {
      const targetSpeed = 228 * (godTimer > 0 ? 1.25 : 1) * itemStats.moveSpeedMultiplier;
      player.vx += (moveX * targetSpeed - player.vx) * 14 * dt;
      player.vy += (moveY * targetSpeed - player.vy) * 14 * dt;
    }

    moveCircle(player, dt);

    player.inv = Math.max(0, player.inv - dt);
    if (player.swing > 0) player.swing = Math.max(0, player.swing - dt);

    mouse.worldX = mouse.x + camera.x;
    mouse.worldY = mouse.y + camera.y;

    if (mouse.down) tryMelee();
    if (mouse.right) tryLaser();
    if (keys.f && !teleportKeyLatch) {
      tryChargedLadderWarp();
      teleportKeyLatch = true;
    }
    if (!keys.f) teleportKeyLatch = false;
    updatePlayerLaser(dt);

    const targetCX = player.x - 480;
    const targetCY = player.y - 320;
    camera.x += (targetCX - camera.x) * 6 * dt;
    camera.y += (targetCY - camera.y) * 6 * dt;
    if (shakeT > 0) {
      shakeT -= dt;
      shake *= 0.88;
    } else {
      shake = 0;
    }

    let totalBleed = 0;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      enemy.attackCd = Math.max(0, enemy.attackCd - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.inv = Math.max(0, enemy.inv - dt);

      if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type !== 'god') {
        enemy.bleed = Math.max(enemy.bleed, itemStats.passiveBleedStacks);
        enemy.bleedT = Math.max(enemy.bleedT, 0.25);
      } else if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type === 'god') {
        enemy.bleed = Math.max(enemy.bleed, Math.max(1, itemStats.passiveBleedStacks - 1));
        enemy.bleedT = Math.max(enemy.bleedT, 0.25);
      }

      totalBleed += updateBleed(enemy, dt);
      if (!enemies.includes(enemy)) continue;

      if (enemy.type === 'god') updateGod(enemy, dt);
      else if (enemy.type === 'queen_cult') updateCultQueenBoss(enemy, dt);
      else if (enemy.type === 'bulk_golem') updateBulkGolemBoss(enemy, dt);
      else if (enemy.type === 'artificer_knave') updateArtificerBoss(enemy, dt);
      else if (enemy.type === 'cult_mage') updateCultMageEnemy(enemy, dt);
      else if (enemy.type === 'knave') updateKnaveEnemy(enemy, dt);
      else if (enemy.type === 'sniper') updateSniperEnemy(enemy, dt);
      else if (enemy.type === 'golem') updateGolemEnemy(enemy, dt);
      else if (enemy.type === 'laser') updateLaserEnemy(enemy, dt);
      else if (enemy.type === 'charger') updateChargerEnemy(enemy, dt);
      else updateHunterEnemy(enemy, dt);

      moveCircle(enemy, dt);
    }

    if (itemStats.bleedHealScale > 0 && totalBleed > 0 && player.hp < player.maxHp) {
      const heal = player.maxHp * 0.012 * totalBleed * itemStats.bleedHealScale * dt;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      if (Math.random() < 0.14) {
        particles.push({ x: player.x + rand(-10, 10), y: player.y - 18, life: 0.5, text: `+${Math.max(1, Math.ceil(heal * 10))}`, c: '#0f8' });
      }
    }

    updateProjectiles(dt);
    updateWorldProps(dt);
    updateChests();
    updatePickups();
    updateParticles(dt);
    updateTransitions(dt);

    if (godTimer > 0 && Math.random() < 0.4) {
      particles.push({ x: player.x + rand(-6, 6), y: player.y + rand(-6, 6), life: 0.32, c: `hsl(${(Date.now() / 8) % 360},100%,65%)` });
    }
  }

  function tryChargedLadderWarp() {
    if (getItemCount('charged_adapter') <= 0 || !player.escapeReady) return;
    if (!currentRoom || currentRoom.type === 'boss' || currentRoom.type === 'god') return;
    if (enemies.length === 0) return;

    const ladderRoom = rooms.find(room => room.type === 'ladder') || rooms.find(room => room.type === 'boss');
    if (!ladderRoom || ladderRoom === currentRoom) return;

    const goldSpent = Math.floor(player.coins / 2);
    if (goldSpent > 0) {
      player.coins -= goldSpent;
      metaProgress.coins = Math.max(0, metaProgress.coins - goldSpent);
    }

    consumeCharge('escape');
    enterRoom(ladderRoom);
    particles.push({ x: player.x, y: player.y - 20, life: 0.8, text: 'CHARGED WARP', c: '#b66cff' });
    scheduleRunSave();
  }

  function updateBleed(enemy, dt) {
    if (enemy.bleed <= 0) return 0;
    if (enemy.bleedImmune) {
      enemy.bleed = 0;
      enemy.bleedT = 0;
      enemy.bleedTick = 0;
      return 0;
    }
    enemy.bleedT -= dt;
    enemy.bleedTick -= dt;
    if (enemy.bleedTick <= 0) {
      enemy.bleedTick = 0.5;
      const damage = scaleDamageAgainstEnemy(enemy, 3 * enemy.bleed);
      enemy.hp -= damage;
      spawnDamagePopup(enemy.x, enemy.y - 10, damage, { color: '#ff5f5f', size: 15 });
      if (enemy.hp <= 0) {
        onEnemyDie(enemy);
        return enemy.bleed;
      }
    }
    if (enemy.bleedT <= 0) enemy.bleed = 0;
    return enemy.bleed;
  }

  function updateHunterEnemy(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }
    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
    if (distance < enemy.r + player.r + 10 && enemy.attackCd <= 0) {
      const angle = Math.atan2(dy, dx);
      damagePlayer(enemy.dmg, angle, 160);
      enemy.attackCd = 1.05;
    }
  }

  function updateCultMageEnemy(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    const hpPct = enemy.hp / enemy.max;
    const desired = hpPct < 0.35 ? 360 : 270;
    const retreat = hpPct < 0.35 && distance < desired ? -1 : 1;
    const direction = distance < desired - 24 ? -retreat : distance > desired + 24 ? retreat : 0;
    steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.5, dt);

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      particles.push({ x: enemy.x, y: enemy.y, life: 0.2, c: '#b455ff' });
      if (enemy.windup <= 0) {
        enemy.beamTime = 0.58;
        enemy.beamTick = 0;
      }
      return;
    }

    if (enemy.beamTime > 0) {
      enemy.beamTime -= dt;
      enemy.beamTick -= dt;
      enemy.vx *= 0.84;
      enemy.vy *= 0.84;
      if (enemy.beamTick <= 0) {
        enemy.beamTick = 0.1;
        const beamEnd = getBeamEnd(enemy.x, enemy.y, enemy.beamAngle, 460);
        if (beamHitsCircle(enemy.x, enemy.y, beamEnd.x, beamEnd.y, player.x, player.y, player.r + 5)) {
          damagePlayer(enemy.dmg, enemy.beamAngle, 145);
        }
      }
      return;
    }

    if (enemy.attackCd <= 0 && distance < 430) {
      enemy.windup = 0.86;
      enemy.beamAngle = Math.atan2(dy, dx);
      enemy.attackCd = 2.9;
    }
  }

  function updateKnaveEnemy(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.76;
      enemy.vy *= 0.76;
      if (enemy.windup <= 0) {
        if (enemy.state === 'charge') {
          enemy.dashTime = 0.3;
          enemy.dashHit = false;
        } else {
          enemy.swingTime = 0.2;
        }
      }
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 450;
      enemy.vy = Math.sin(enemy.dashAngle) * 450;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 7) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + 6, enemy.dashAngle, 260);
      }
      return;
    }

    if (enemy.swingTime > 0) {
      enemy.swingTime -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      if (enemy.swingTime <= 0 && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 24) {
        const angle = Math.atan2(dy, dx);
        damagePlayer(enemy.dmg + 3, angle, 210);
      }
      return;
    }

    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.8, dt);

    if (enemy.attackCd <= 0) {
      if (distance > 150) {
        enemy.state = 'charge';
        enemy.windup = 0.46;
        enemy.dashAngle = Math.atan2(dy, dx);
        enemy.attackCd = 1.9;
      } else {
        enemy.state = 'stab';
        enemy.windup = 0.2;
        enemy.attackCd = 0.9;
      }
    }
  }

  function updateSniperEnemy(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      if (enemy.windup <= 0) {
        const angle = enemy.beamAngle;
        projectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * 360,
          vy: Math.sin(angle) * 360,
          r: 5,
          life: 1.6,
          enemy: true,
          kind: 'sniper_round',
          damage: enemy.dmg + 5,
        });
      }
      return;
    }

    if (enemy.swingTime > 0) {
      enemy.swingTime -= dt;
      enemy.vx *= 0.75;
      enemy.vy *= 0.75;
      if (enemy.swingTime <= 0 && distance < enemy.r + player.r + 20) {
        damagePlayer(enemy.dmg + 2, Math.atan2(dy, dx), 170);
      }
      return;
    }

    const desired = 290;
    const direction = distance < desired - 20 ? -1 : distance > desired + 20 ? 1 : 0;
    steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.6, dt);

    if (enemy.attackCd <= 0) {
      if (distance <= 74) {
        enemy.swingTime = 0.16;
        enemy.attackCd = 0.95;
      } else if (distance < 520) {
        enemy.windup = 0.6;
        enemy.beamAngle = Math.atan2(dy, dx);
        enemy.attackCd = 2.2;
      }
    }
  }

  function updateGolemEnemy(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      if (enemy.windup <= 0) {
        enemy.dashTime = 0.34;
        enemy.dashHit = false;
      }
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 390;
      enemy.vy = Math.sin(enemy.dashAngle) * 390;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 10) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + 6, enemy.dashAngle, 280);
      }
      return;
    }

    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.1, dt);
    if (enemy.attackCd <= 0 && distance < 460) {
      enemy.windup = 0.62;
      enemy.dashAngle = Math.atan2(dy, dx);
      enemy.attackCd = 2.6;
    }
  }

  function updateCultQueenBoss(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    enemy.summonCd = Math.max(0, enemy.summonCd - dt);
    if (enemy.summonCd <= 0) {
      enemy.summonCd = 4.6;
      for (let index = 0; index < 3; index += 1) {
        const angle = (Math.PI * 2 * index) / 3 + rng() * 0.8;
        const px = enemy.x + Math.cos(angle) * 54;
        const py = enemy.y + Math.sin(angle) * 54;
        const safeSpawn = findSafeEnemySpawnPoint(clamp(px, 90, ROOM_W - 90), clamp(py, 90, ROOM_H - 90), 15);
        if (safeSpawn) spawnEnemy('cult_follower', safeSpawn.x, safeSpawn.y, false);
      }
    }

    updateCultMageEnemy(enemy, dt);
    if (enemy.attackCd <= 0 && distance < enemy.r + player.r + 18) {
      damagePlayer(enemy.dmg + 4, Math.atan2(dy, dx), 250);
      enemy.attackCd = 0.95;
    }
  }

  function updateBulkGolemBoss(enemy, dt) {
    enemy.aoeTime = Math.max(0, enemy.aoeTime - dt);
    if (enemy.aoeTime <= 0) {
      enemy.aoeTime = 3;
      const aoeRadius = 240;
      const aoeDamage = Math.round(enemy.dmg * 1.2);
      particles.push({ x: enemy.x, y: enemy.y, life: 0.5, ring: aoeRadius - 60, c: '#ff8844' });
      blastRadius(enemy.x, enemy.y, aoeRadius, aoeDamage, '#ff8844');
      shake = 12;
      shakeT = 0.2;
    }
    updateGolemEnemy(enemy, dt);
    enemy.speed = 78;
    if (enemy.attackCd < 1.4) enemy.attackCd = 1.4;
  }

  function spawnPhaseSwords(count, damage) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + rng() * 0.25;
      const sx = player.x + Math.cos(angle) * 110;
      const sy = player.y + Math.sin(angle) * 110;
      const travel = Math.atan2(player.y - sy, player.x - sx);
      projectiles.push({
        x: sx,
        y: sy,
        vx: Math.cos(travel) * 260,
        vy: Math.sin(travel) * 260,
        r: 7,
        life: 1.25,
        enemy: true,
        kind: 'sword',
        damage,
      });
    }
  }

  function updateArtificerBoss(enemy, dt) {
    const hpPct = enemy.hp / enemy.max;
    if (hpPct < 0.34) enemy.phase = 3;
    else if (hpPct < 0.67) enemy.phase = 2;
    else enemy.phase = 1;

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.phase === 1) {
      enemy.speed = 132;
      updateKnaveEnemy(enemy, dt);
      return;
    }

    if (enemy.phase === 2) {
      enemy.speed = 120;
      if (enemy.attackCd <= 0) {
        spawnPhaseSwords(8, 14);
        enemy.attackCd = 2.35;
      }
      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
      if (distance < enemy.r + player.r + 14 && enemy.swingTime <= 0) {
        enemy.swingTime = 0.2;
      }
      if (enemy.swingTime > 0) {
        enemy.swingTime -= dt;
        if (enemy.swingTime <= 0 && distance < enemy.r + player.r + 24) {
          damagePlayer(enemy.dmg + 3, Math.atan2(dy, dx), 210);
        }
      }
      return;
    }

    enemy.speed = 62;
    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.2, dt);
    if (enemy.attackCd <= 0) {
      enemy.windup = 0.72;
      enemy.state = 'phase3_swing';
      enemy.attackCd = 6;
    }
    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.74;
      enemy.vy *= 0.74;
      if (enemy.windup <= 0) {
        const angle = Math.atan2(dy, dx);
        if (distance < enemy.r + player.r + 54) {
          damagePlayer(enemy.dmg + 16, angle, 340);
        }
        particles.push({ x: enemy.x, y: enemy.y, life: 0.6, ring: 86, c: '#ffd27d' });
      }
    }
  }

  function updateLaserEnemy(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      particles.push({ x: enemy.x, y: enemy.y, life: 0.16, c: '#aa66ff' });
      if (enemy.windup <= 0) {
        enemy.beamTime = 0.46;
        enemy.beamTick = 0;
      }
      return;
    }

    if (enemy.beamTime > 0) {
      enemy.beamTime -= dt;
      enemy.beamTick -= dt;
      enemy.vx *= 0.84;
      enemy.vy *= 0.84;
      if (enemy.beamTick <= 0) {
        enemy.beamTick = 0.11;
        const beamEnd = getBeamEnd(enemy.x, enemy.y, enemy.beamAngle, 430);
        if (beamHitsCircle(enemy.x, enemy.y, beamEnd.x, beamEnd.y, player.x, player.y, player.r + 4)) {
          damagePlayer(enemy.dmg, enemy.beamAngle, 130);
        }
      }
      return;
    }

    const desired = 230;
    const direction = distance < desired - 25 ? -1 : distance > desired + 25 ? 1 : 0;
    steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.2, dt);
    if (enemy.attackCd <= 0 && distance < 390) {
      enemy.windup = 0.78;
      enemy.beamAngle = Math.atan2(dy, dx);
      enemy.attackCd = 2.8;
    }
  }

  function updateChargerEnemy(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      particles.push({ x: enemy.x, y: enemy.y, life: 0.14, c: '#ff8844' });
      if (enemy.windup <= 0) {
        enemy.dashTime = 0.32;
        enemy.dashHit = false;
      }
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 430;
      enemy.vy = Math.sin(enemy.dashAngle) * 430;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 6) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + 4, enemy.dashAngle, 240);
      }
      return;
    }

    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.1, dt);
    if (enemy.attackCd <= 0 && distance < 420) {
      enemy.windup = 0.52;
      enemy.dashAngle = Math.atan2(dy, dx);
      enemy.attackCd = 2.4;
    }
  }

  function updateGod(enemy, dt) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.74;
      enemy.vy *= 0.74;
      particles.push({ x: enemy.x, y: enemy.y, life: 0.18, c: '#ffffff' });
      if (enemy.windup <= 0) {
        if (enemy.state === 'godLaser') {
          enemy.beamTime = 0.78;
          enemy.beamTick = 0;
        }
        if (enemy.state === 'godCharge') {
          enemy.dashTime = 0.48;
          enemy.dashHit = false;
        }
      }
      return;
    }

    if (enemy.beamTime > 0) {
      enemy.beamTime -= dt;
      enemy.beamTick -= dt;
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      if (enemy.beamTick <= 0) {
        enemy.beamTick = 0.08;
        enemy.beamAngle += Math.sin(Date.now() / 160) * 0.02;
        const beamEnd = getBeamEnd(enemy.x, enemy.y, enemy.beamAngle, 480);
        if (beamHitsCircle(enemy.x, enemy.y, beamEnd.x, beamEnd.y, player.x, player.y, player.r + 6)) {
          damagePlayer(16, enemy.beamAngle, 150);
        }
      }
      if (enemy.beamTime <= 0) enemy.attackCd = 1;
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 500;
      enemy.vy = Math.sin(enemy.dashAngle) * 500;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 10) {
        enemy.dashHit = true;
        damagePlayer(20, enemy.dashAngle, 260);
      }
      if (enemy.dashTime <= 0) enemy.attackCd = 1.1;
      return;
    }

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    const desired = 190;
    const direction = distance < desired - 10 ? -1 : distance > desired + 20 ? 1 : 0.5;
    steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 4.6, dt);

    if (distance < enemy.r + player.r + 12 && enemy.attackCd <= 0) {
      const angle = Math.atan2(dy, dx);
      damagePlayer(18, angle, 220);
      enemy.attackCd = 0.95;
      return;
    }

    if (enemy.attackCd <= 0) {
      if (distance > 250 || rng() > 0.45) {
        enemy.state = 'godLaser';
        enemy.windup = 0.95;
        enemy.beamAngle = Math.atan2(dy, dx);
      } else {
        enemy.state = 'godCharge';
        enemy.windup = 0.55;
        enemy.dashAngle = Math.atan2(dy, dx);
      }
      enemy.attackCd = 3.1;
    }
  }

  function steerEnemy(enemy, dirX, dirY, maxSpeed, accel, dt) {
    enemy.vx += (dirX * maxSpeed - enemy.vx) * accel * dt;
    enemy.vy += (dirY * maxSpeed - enemy.vy) * accel * dt;
  }

  function moveCircle(entity, dt) {
    const nextX = entity.x + entity.vx * dt;
    const nextY = entity.y + entity.vy * dt;
    if (!isBlocked(nextX, entity.y, entity.r)) entity.x = nextX;
    else entity.vx *= -0.4;
    if (!isBlocked(entity.x, nextY, entity.r)) entity.y = nextY;
    else entity.vy *= -0.4;
    entity.x = clamp(entity.x, WALL + entity.r, ROOM_W - WALL - entity.r);
    entity.y = clamp(entity.y, WALL + entity.r, ROOM_H - WALL - entity.r);
  }

  function damagePlayer(amount, angle, knockback) {
    if (player.inv > 0) return;
    const itemStats = getItemStats();
    let finalAmount = amount;
    if (itemStats.hasIronLung) {
      const roomCap = player.maxHp * 0.2;
      const remaining = roomCap - (player.roomDamageTaken || 0);
      if (remaining <= 0) return;
      finalAmount = Math.min(finalAmount, remaining);
    }
    if (finalAmount <= 0) return;

    player.hp -= finalAmount;
    player.roomDamageTaken = (player.roomDamageTaken || 0) + finalAmount;

    if (getItemCount('insurance') > 0 && player.insuranceReady && !player.insuranceActive && player.hp <= player.maxHp * 0.5) {
      player.insuranceActive = true;
      consumeCharge('insurance');
      particles.push({ x: player.x, y: player.y - 30, life: 0.8, text: 'INSURANCE ON', c: '#e6eeff' });
    }

    if (player.insuranceActive && player.hp < 1) {
      player.hp = 1;
    }

    player.inv = 0.75;
    player.vx += Math.cos(angle) * knockback;
    player.vy += Math.sin(angle) * knockback;
    shake = 8;
    shakeT = 0.15;
    if (finalAmount >= 1) {
      spawnDamagePopup(player.x, player.y - 18, finalAmount, { color: '#ff6b6b', size: 16 });
    }
    if (player.hp <= 0) die();
  }

  function blastRadius(x, y, radius, damage, color) {
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (dist(x, y, enemy.x, enemy.y) > radius + enemy.r) continue;
      hitEnemy(enemy, damage, Math.atan2(enemy.y - y, enemy.x - x), 180, color);
    }
    destructibles.forEach(prop => {
      if (!prop.broken && !prop.hidden && dist(x, y, prop.x, prop.y) <= radius + prop.r) damageDestructible(prop, damage);
    });
  }

  function findNearestEnemy(x, y, radius, exclude = new Set()) {
    let best = null;
    let bestDist = radius;
    enemies.forEach(enemy => {
      if (exclude.has(enemy)) return;
      const d = dist(x, y, enemy.x, enemy.y);
      if (d < bestDist) {
        best = enemy;
        bestDist = d;
      }
    });
    return best;
  }

  function updateProjectiles(dt) {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index];
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      const hitProp = destructibles.find(prop => !prop.broken && !prop.hidden && dist(projectile.x, projectile.y, prop.x, prop.y) <= projectile.r + prop.r);
      if (!projectile.enemy && hitProp) {
        damageDestructible(hitProp, projectile.damage || 1);
        if (projectile.kind === 'fireball') blastRadius(projectile.x, projectile.y, projectile.splash || 44, 16, '#ff8844');
        projectiles.splice(index, 1);
        continue;
      }
      if (projectile.life <= 0 || isBlocked(projectile.x, projectile.y, projectile.r)) {
        projectiles.splice(index, 1);
        continue;
      }
      if (!projectile.enemy) {
        const target = enemies.find(enemy => dist(projectile.x, projectile.y, enemy.x, enemy.y) <= projectile.r + enemy.r);
        if (target) {
          hitEnemy(target, projectile.damage || 16, Math.atan2(projectile.vy, projectile.vx), 90, projectile.kind === 'fireball' ? '#ff8844' : '#a857ff');
          if (projectile.kind === 'fireball') blastRadius(projectile.x, projectile.y, projectile.splash || 44, 14, '#ff8844');
          projectiles.splice(index, 1);
          continue;
        }
      } else if (dist(projectile.x, projectile.y, player.x, player.y) <= projectile.r + player.r) {
        damagePlayer(projectile.damage || 10, Math.atan2(projectile.vy, projectile.vx), 120);
        projectiles.splice(index, 1);
        continue;
      }
    }
  }

  function updateWorldProps(dt) {
    hazards.forEach(hazard => {
      if (hazard.kind === 'lava' && dist(player.x, player.y, hazard.x, hazard.y) < hazard.r + player.r - 10) {
        damagePlayer(6 * dt, 0, 0);
      }
      if (hazard.kind === 'healing_zone') {
        hazard.ttl -= dt;
        hazard.plusTick = (hazard.plusTick ?? 0.08) - dt;
        if (hazard.plusTick <= 0) {
          const angle = rng() * Math.PI * 2;
          const radius = rand(hazard.r * 0.82, 8);
          const px = hazard.x + Math.cos(angle) * radius;
          const py = hazard.y + Math.sin(angle) * radius;
          particles.push({
            x: px,
            y: py,
            life: 0.45,
            text: '+',
            c: '#47ff7d',
            size: 14,
            outline: 'rgba(5,35,10,0.7)',
            vx: rand(-10, 10),
            vy: rand(-42, -24),
          });
          hazard.plusTick = rand(0.16, 0.07);
        }
        if (dist(player.x, player.y, hazard.x, hazard.y) < hazard.r) {
          const before = player.hp;
          player.hp = Math.min(player.maxHp, player.hp + 8 * dt);
          const healed = player.hp - before;
          if (healed > 0) {
            hazard.healAccum = (hazard.healAccum || 0) + healed;
            hazard.healTick = (hazard.healTick ?? 0.24) - dt;
            if (hazard.healTick <= 0) {
              spawnHealPopup(player.x + rand(-10, 10), player.y - 22, hazard.healAccum);
              hazard.healAccum = 0;
              hazard.healTick = 0.24;
            }
          }
        }
        enemies.forEach(enemy => {
          if (dist(enemy.x, enemy.y, hazard.x, hazard.y) < hazard.r + enemy.r) {
            enemy.hp -= 10 * dt;
            if (enemy.hp <= 0) onEnemyDie(enemy);
          }
        });
      }
    });
    hazards = hazards.filter(hazard => hazard.ttl === undefined || hazard.ttl > 0);

    shopOffers.forEach(offer => {
      if (offer.bought || dist(player.x, player.y, offer.x, offer.y) > 30) return;
      if (player.coins < offer.cost) return;
      player.coins -= offer.cost;
      metaProgress.coins = Math.max(0, metaProgress.coins - offer.cost);
      offer.bought = true;
      if (offer.type === 'potion') {
        player.hp = Math.min(player.maxHp, player.hp + 55);
      } else if (offer.type === 'item') {
        collectItem(offer.key);
      }
    });
    syncCurrentRoomState();
  }

  function damageDestructible(prop, damage) {
    if (prop.broken) return;
    const dealt = Math.max(0, Math.round(damage || 0));
    if (dealt > 0) {
      spawnDamagePopup(prop.x, prop.y - prop.r - 8, dealt, {
        color: prop.kind === 'barrel' ? '#ff9f1c' : '#ffd27d',
        size: 14,
        outline: '#2a1800',
      });
    }
    prop.hp -= damage;
    if (prop.hp > 0) return;
    prop.broken = true;
    if (prop.kind === 'pot') {
      if (rng() < 0.7) dropCoins(prop.x, prop.y, 6 + floor);
      else pickups.push({ x: prop.x, y: prop.y, type: 'item', key: rollItemDrop() });
    }
    if (prop.kind === 'barrel') {
      blastRadius(prop.x, prop.y, 72, 28, '#ff5a3d');
    }
    if (prop.kind === 'wall') {
      destructibles.forEach(other => {
        if (other.hidden) other.hidden = false;
      });
    }
  }

  function spawnDamagePopup(x, y, amount, opts = {}) {
    const value = Math.max(0, Math.round(amount || 0));
    if (value <= 0) return;
    const crit = !!opts.crit;
    const color = opts.color || (crit ? '#ff9f1c' : '#ff6b6b');
    const size = opts.size || (crit ? 20 : 16);
    particles.push({
      x,
      y,
      life: crit ? 0.62 : 0.46,
      text: `-${value}`,
      c: color,
      outline: opts.outline || '#120a00',
      size,
      vx: rand(-14, 14),
      vy: -36 - (crit ? 10 : 0),
    });
  }

  function spawnHealPopup(x, y, amount, opts = {}) {
    const value = Math.max(0, Math.round((amount || 0) * (opts.scale || 8)));
    if (value <= 0) return;
    particles.push({
      x,
      y,
      life: 0.5,
      text: `+${value}`,
      c: opts.color || '#47ff7d',
      outline: opts.outline || 'rgba(5,35,10,0.8)',
      size: opts.size || 15,
      vx: rand(-8, 8),
      vy: -44,
    });
  }

  function updateChests() {
    chests.forEach(chest => {
      if (chest.open) return;
      if (dist(chest.x, chest.y, player.x, player.y) >= 36) return;
      chest.open = true;
      dropCoins(chest.x, chest.y, 12 + floor * 2);
      if (rng() < 0.9) {
        pickups.push({ x: chest.x, y: chest.y - 20, type: 'item', key: rollItemDrop() });
      } else {
        pickups.push({ x: chest.x, y: chest.y - 20, type: 'potion' });
      }
      currentRoom.cleared = chests.every(item => item.open);
      updateObjective();
      scheduleRunSave();
    });
  }

  function updatePickups() {
    for (let index = pickups.length - 1; index >= 0; index -= 1) {
      const pickup = pickups[index];
      if (pickup.type === 'coin') {
        const magnetRadius = 110;
        const d = dist(pickup.x, pickup.y, player.x, player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 180 + (1 - d / magnetRadius) * 260;
          pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
        }
      } else if (pickup.type === 'item') {
        const magnetRadius = 145;
        const d = dist(pickup.x, pickup.y, player.x, player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 150 + (1 - d / magnetRadius) * 220;
          pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
        }
      }
      if (dist(pickup.x, pickup.y, player.x, player.y) >= 26) continue;

      if (pickup.type === 'coin') {
        addCoins(pickup.value || 1);
      }

      if (pickup.type === 'potion') {
        player.hp = Math.min(player.maxHp, player.hp + 40);
        particles.push({ x: player.x, y: player.y - 20, life: 0.6, text: '+40', c: '#0f8' });
      }

      if (pickup.type === 'item') {
        collectItem(pickup.key);
        if (floorSkipPending > 0) {
          floor = Math.min(MAX_FLOOR, floor + floorSkipPending);
          floorSkipPending = 0;
          player.insuranceActive = false;
          metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
          persistMetaSoon();
          showFloorTransition = true;
          floorTransitionTime = 0;
          generateFloor();
          scheduleRunSave();
          return;
        }
      }

      if (pickup.type === 'ladder') {
        floor = Math.min(MAX_FLOOR, floor + 1);
        player.insuranceActive = false;
        metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
        persistMetaSoon();
        showFloorTransition = true;
        floorTransitionTime = 0;
        generateFloor();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'fightGod') {
        currentRoom.bossStarted = true;
        pickups = [];
        spawnGodBoss();
        syncCurrentRoomState();
        updateObjective();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'returnGate') {
        returnToFloorOne();
        return;
      }

      if (pickup.type === 'crown') {
        win();
        return;
      }

      pickups.splice(index, 1);
      scheduleRunSave();
    }
  }

  function updateParticles(dt) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= dt;
      if (particle.vx) particle.x += particle.vx * dt;
      if (particle.vy) particle.y += particle.vy * dt;
      if (particle.ring) particle.ring += 200 * dt;
      if (particle.life <= 0) particles.splice(index, 1);
    }
  }

  function updateTransitions(dt) {
    const canLeaveFight = enemies.length > 0 && currentRoom && currentRoom.type !== 'boss' && currentRoom.type !== 'god' && currentRoom.type !== 'ladder';
    if (!fading && (enemies.length === 0 || canLeaveFight)) {
      const door =
        player.y < WALL + 24 && currentRoom.doors.n && Math.abs(player.x - ROOM_W / 2) < DOOR / 2 ? 'n' :
        player.y > ROOM_H - WALL - 24 && currentRoom.doors.s && Math.abs(player.x - ROOM_W / 2) < DOOR / 2 ? 's' :
        player.x < WALL + 24 && currentRoom.doors.w && Math.abs(player.y - ROOM_H / 2) < DOOR / 2 ? 'w' :
        player.x > ROOM_W - WALL - 24 && currentRoom.doors.e && Math.abs(player.y - ROOM_H / 2) < DOOR / 2 ? 'e' :
        null;
      if (door) startTransition(door);
    }

    if (!fading) return;
    fade += (fading === 1 ? 1 : -1) * dt * 3;
    if (fade >= 1 && fading === 1) {
      doTransition();
      fading = -1;
    }
    if (fade <= 0 && fading === -1) {
      fading = 0;
    }
    fade = clamp(fade, 0, 1);
  }

  function startTransition(direction) {
    fading = 1;
    nextDoor = direction;
  }

  function doTransition() {
    const direction = nextDoor;
    const dx = { e: 1, w: -1, n: 0, s: 0 }[direction];
    const dy = { e: 0, w: 0, n: -1, s: 1 }[direction];
    const nextRoom = rooms.find(room => room.gx === currentRoom.gx + dx && room.gy === currentRoom.gy + dy);
    if (!nextRoom) return;
    enterRoom(nextRoom);
    const r = 18;
    let doorX = ROOM_W / 2;
    let doorY = ROOM_H / 2;
    if (direction === 'n') { doorY = ROOM_H - WALL - 30; doorX = ROOM_W / 2; }
    if (direction === 's') { doorY = WALL + 30; doorX = ROOM_W / 2; }
    if (direction === 'e') { doorX = WALL + 30; doorY = ROOM_H / 2; }
    if (direction === 'w') { doorX = ROOM_W - WALL - 30; doorY = ROOM_H / 2; }
    if (!isBlocked(doorX, doorY, r)) {
      player.x = doorX;
      player.y = doorY;
    }
  }

  function returnToFloorOne() {
    floor = 1;
    gameElapsedTime = 0;
    player.insuranceActive = false;
    seedStr = `${seedStr}:loop:${Date.now()}`;
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, MAX_FLOOR);
    persistMetaSoon();
    player.x = START_X;
    player.y = START_Y;
    generateFloor();
    scheduleRunSave();
  }

  function addCoins(amount) {
    player.coins += amount;
    metaProgress.coins += amount;
    persistMetaSoon();
  }

  function updateObjective() {
    if (!currentRoom) return;
    let objective = 'Find the ladder.';
    if (floor < MAX_FLOOR) {
      if (currentRoom.type === 'shop') {
        uiController.setObjective('Shop or move on.');
        return;
      }
      if (currentRoom.type === 'boss' && !currentRoom.cleared) {
        uiController.setObjective('Defeat the floor boss.');
        return;
      }
      objective = currentRoom.type === 'ladder' && !currentRoom.cleared ? 'Clear the ladder room.' : 'Find the ladder.';
      uiController.setObjective(objective);
      return;
    }
    if (currentRoom.type !== 'god') {
      uiController.setObjective('Reach GOD.');
      return;
    }
    if (currentRoom.cleared) {
      uiController.setObjective('Take the crown.');
      return;
    }
    if (currentRoom.bossStarted) {
      uiController.setObjective('Survive GOD.');
      return;
    }
    uiController.setObjective('Fight GOD or loop with your gear.');
  }

  function updateHud() {
    if (!player) return;
    const character = getCharacterDef();
    const attackSpeed = getAttackSpeedValue();
    const meleeMax = (godTimer > 0 ? 0.2 : ATTACKS.melee.baseCooldown) / attackSpeed;
    const laserMax = laserActive
      ? (godTimer > 0 ? 0.72 : ATTACKS.laser.duration) / attackSpeed
      : (godTimer > 0 ? 2.8 : ATTACKS.laser.baseCooldown) / attackSpeed;
    const smashMax = (godTimer > 0 ? 2 : ATTACKS.smash.baseCooldown) / attackSpeed;
    const dashMax = 1.8 / attackSpeed;
    uiController.setHudValues({
      floor,
      level: player.level,
      xpText: `${player.xp}/${player.xpToNext}`,
      coins: player.coins,
      character: character.name.toUpperCase(),
      hp: player.hp,
      maxHp: player.maxHp,
      meleeCd: cooldowns.melee,
      laserCd: cooldowns.laser,
      smashCd: cooldowns.smash,
      dashCd: cooldowns.dash,
      skills: {
        melee: { current: cooldowns.melee, max: meleeMax, active: false },
        laser: { current: laserActive ? laserTime : cooldowns.laser, max: laserMax, active: laserActive },
        smash: { current: cooldowns.smash, max: smashMax, active: false },
        dash: { current: cooldowns.dash, max: dashMax, active: player.dashTime > 0 },
      },
    });
    ui.skillNames.dash.textContent = character.skills.dash;
    ui.skillNames.melee.textContent = character.skills.melee;
    ui.skillNames.laser.textContent = character.skills.laser;
    ui.skillNames.smash.textContent = character.skills.smash;
    updateItemUI();
  }

  function die() {
    setGameState('dead');
    uiController.setDeadInfo(`Floor ${floor} | ${player.coins} run coins | ${Object.values(player.items).reduce((sum, count) => sum + count, 0)} item stacks`);
    clearRunSave();
  }

  function win() {
    setGameState('win');
    uiController.setWinInfo(`Floor ${floor} cleared with ${player.coins} run coins banked and ${metaProgress.coins} total coins saved.`);
    clearRunSave();
  }

  async function clearRunSave() {
    activeRun = null;
    try {
      await Promise.all([
        saveStore.delete('run'),
        saveStore.put('meta', metaProgress),
      ]);
      refreshMenuState();
    } catch (error) {
      console.error('Failed to clear run save', error);
    }
  }

  function scheduleRunSave() {
    if (gameState !== 'play' || !player || !currentRoom) return;
    clearTimeout(savePendingTimer);
    savePendingTimer = setTimeout(() => { void saveRunNow(); }, 250);
  }

  function persistMetaSoon() {
    refreshMenuState();
    void saveStore.put('meta', metaProgress).catch(error => {
      console.error('Failed to save meta', error);
    });
  }

  async function saveRunNow() {
    if (gameState !== 'play' || !player || !currentRoom) return;
    activeRun = serializeRun();
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
    refreshMenuState();
    try {
      await Promise.all([
        saveStore.put('run', activeRun),
        saveStore.put('meta', metaProgress),
      ]);
    } catch (error) {
      console.error('Failed to save run', error);
      uiController.setSaveState('SAVE ERROR');
    }
  }

  function serializeRun() {
    return {
      seedStr,
      floor,
      rooms,
      currentRoom: { gx: currentRoom.gx, gy: currentRoom.gy },
      player,
      enemies,
      projectiles,
      chests,
      pickups,
      destructibles,
      hazards,
      shopOffers,
      structures,
      decorations,
      cooldowns,
      laserActive,
      laserTime,
      laserTick,
      godTimer,
      gameElapsedTime,
      camera,
    };
  }

  async function deleteSavedRun() {
    activeRun = null;
    await saveStore.delete('run');
    refreshMenuState();
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const _shakeOn = window.NeoSettings?.getAccess()?.screenShake !== false;
    const offsetX = _shakeOn ? (Math.random() - 0.5) * shake * 2 : 0;
    const offsetY = _shakeOn ? (Math.random() - 0.5) * shake * 2 : 0;
    ctx.translate(-camera.x + offsetX, -camera.y + offsetY);

    drawFloor();
    drawRoomDecor();
    drawWorldProps();
    drawChests();
    drawPickups();
    drawProjectiles();
    drawEnemyTelegraphs();
    drawEnemies();
    drawPlayer();
    drawPlayerLaser();
    drawParticles();

    ctx.restore();
    drawMinimap();

    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (godTimer > 0) drawGodModeBar();
    drawBossHealthBars();
    drawFloorTransition();
  }

  function drawFloor() {
    ctx.fillStyle = '#030610';
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    ctx.strokeStyle = 'rgba(0,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= ROOM_W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ROOM_H);
      ctx.stroke();
    }
    for (let y = 0; y <= ROOM_H; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ROOM_W, y);
      ctx.stroke();
    }

    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = enemies.length > 0 ? '#ff66aa' : '#00ffff';
    ctx.lineWidth = WALL;
    ctx.strokeRect(WALL / 2, WALL / 2, ROOM_W - WALL, ROOM_H - WALL);
    ctx.shadowBlur = 0;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    if (currentRoom?.doors.n) ctx.fillRect((ROOM_W - DOOR) / 2, 0, DOOR, WALL + 2);
    if (currentRoom?.doors.s) ctx.fillRect((ROOM_W - DOOR) / 2, ROOM_H - WALL - 2, DOOR, WALL + 2);
    if (currentRoom?.doors.w) ctx.fillRect(0, (ROOM_H - DOOR) / 2, WALL + 2, DOOR);
    if (currentRoom?.doors.e) ctx.fillRect(ROOM_W - WALL - 2, (ROOM_H - DOOR) / 2, WALL + 2, DOOR);
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = enemies.length > 0 ? 'rgba(255,102,170,0.4)' : 'rgba(0,255,255,0.4)';
    ctx.lineWidth = 3;
    ctx.shadowColor = enemies.length > 0 ? '#ff66aa' : '#0ff';
    ctx.shadowBlur = 10;
    [
      ['n', (ROOM_W - DOOR) / 2, 0, DOOR, 0],
      ['s', (ROOM_W - DOOR) / 2, ROOM_H, DOOR, 0],
      ['w', 0, (ROOM_H - DOOR) / 2, 0, DOOR],
      ['e', ROOM_W, (ROOM_H - DOOR) / 2, 0, DOOR],
    ].forEach(([dir, x, y, width, height]) => {
      if (!currentRoom?.doors[dir]) return;
      ctx.beginPath();
      if (width) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + width, y);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
      }
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }

  function drawChests() {
    chests.forEach(chest => {
      ctx.save();
      ctx.translate(chest.x, chest.y);
      ctx.fillStyle = chest.open ? '#445' : '#ffaa00';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = chest.open ? 0 : 12;
      ctx.fillRect(-18, -12, 36, 24);
      ctx.fillStyle = '#000';
      ctx.fillRect(-6, -4, 12, 6);
      ctx.restore();
    });
  }

  function drawRoomDecor() {
    decorations.forEach(decor => {
      ctx.save();
      ctx.translate(decor.x, decor.y);
      if (decor.kind === 'rubble') {
        ctx.fillStyle = 'rgba(90,120,136,0.32)';
        ctx.beginPath();
        ctx.arc(0, 0, decor.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (decor.kind === 'banner') {
        ctx.fillStyle = 'rgba(255,210,90,0.22)';
        ctx.fillRect(-10, -22, 20, 44);
      } else if (decor.kind === 'crack') {
        ctx.strokeStyle = 'rgba(120,180,200,0.22)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-decor.r, -6);
        ctx.lineTo(-8, 0);
        ctx.lineTo(0, -8);
        ctx.lineTo(10, 4);
        ctx.lineTo(decor.r, -2);
        ctx.stroke();
      } else if (decor.kind === 'brazier') {
        ctx.fillStyle = 'rgba(255,120,60,0.7)';
        ctx.shadowColor = '#ff7b39';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(0, 0, decor.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    structures.forEach(structure => {
      ctx.save();
      ctx.translate(structure.x, structure.y);
      if (structure.kind === 'pillar') {
        ctx.fillStyle = '#193849';
        ctx.strokeStyle = '#5ad8ff';
        ctx.lineWidth = 2;
        ctx.fillRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
        ctx.strokeRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
      } else {
        ctx.fillStyle = '#102f3e';
        ctx.strokeStyle = 'rgba(88,217,255,0.7)';
        ctx.lineWidth = 2;
        ctx.fillRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
        ctx.strokeRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
      }
      ctx.restore();
    });
  }

  function drawWorldProps() {
    hazards.forEach(hazard => {
      ctx.save();
      ctx.translate(hazard.x, hazard.y);
      if (hazard.kind === 'lava') {
        const t = lavaAnimTime * (hazard.pulse || 1.5) + (hazard.phase || 0);
        const wobble = hazard.wobble || 0.6;
        const pulse = 1 + Math.sin(t * 2.4) * 0.07;
        const outerRadius = hazard.r * pulse;

        ctx.shadowColor = '#ff5a3d';
        ctx.shadowBlur = 12 + Math.sin(t * 3.1) * 6;
        ctx.fillStyle = 'rgba(255,95,42,0.55)';
        ctx.beginPath();
        for (let index = 0; index <= 26; index += 1) {
          const angle = (index / 26) * Math.PI * 2;
          const wave = Math.sin(t * 3.2 + angle * 4) * 0.06 * wobble
            + Math.cos(t * 1.9 + angle * 7) * 0.04 * wobble;
          const rr = outerRadius * (1 + wave);
          const px = Math.cos(angle) * rr;
          const py = Math.sin(angle) * rr;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = `rgba(255,170,70,${0.45 + Math.sin(t * 4.5) * 0.12})`;
        ctx.beginPath();
        ctx.arc(Math.sin(t * 2.1) * 3, Math.cos(t * 2.6) * 3, hazard.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (hazard.kind === 'healing_zone') {
        const t = Date.now() * 0.004 + (hazard.ttl || 0);
        const pulse = 1 + Math.sin(t * 2.2) * 0.08;
        const inner = hazard.r * 0.62 * pulse;
        ctx.fillStyle = `rgba(80,255,140,${0.12 + Math.sin(t * 1.8) * 0.04})`;
        ctx.beginPath();
        ctx.arc(0, 0, inner, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#35ff6f';
        ctx.shadowColor = '#35ff6f';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i += 1) {
          const a = t + i * (Math.PI * 2 / 6);
          const px = Math.cos(a) * (hazard.r * 0.7);
          const py = Math.sin(a) * (hazard.r * 0.7);
          ctx.beginPath();
          ctx.moveTo(px - 4, py);
          ctx.lineTo(px + 4, py);
          ctx.moveTo(px, py - 4);
          ctx.lineTo(px, py + 4);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.moveTo(0, -8);
        ctx.lineTo(0, 8);
        ctx.stroke();
      }
      ctx.restore();
    });

    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      ctx.save();
      ctx.translate(prop.x, prop.y);
      if (prop.kind === 'pot') {
        ctx.fillStyle = '#b77d4a';
        ctx.fillRect(-10, -12, 20, 24);
      } else if (prop.kind === 'barrel') {
        ctx.fillStyle = '#8c5324';
        ctx.fillRect(-12, -14, 24, 28);
        ctx.strokeStyle = '#ff5a3d';
        ctx.strokeRect(-12, -14, 24, 28);
      } else if (prop.kind === 'wall') {
        ctx.fillStyle = '#113648';
        ctx.fillRect(-24, -24, 48, 48);
        ctx.strokeStyle = '#58d9ff';
        ctx.strokeRect(-24, -24, 48, 48);
      }
      ctx.restore();
    });

    shopOffers.forEach(offer => {
      if (offer.bought) return;
      ctx.save();
      ctx.translate(offer.x, offer.y);
      ctx.fillStyle = 'rgba(0,30,44,0.95)';
      ctx.strokeStyle = '#ffd966';
      ctx.lineWidth = 2;
      ctx.fillRect(-26, -26, 52, 52);
      ctx.strokeRect(-26, -26, 52, 52);
      ctx.fillStyle = offer.type === 'item' ? '#a857ff' : '#35ff6f';
      ctx.beginPath();
      ctx.arc(0, -6, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(offer.cost), 0, 18);
      ctx.restore();
    });
  }

  function drawPickups() {
    pickups.forEach(pickup => {
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      const t = Date.now() / 260;
      ctx.globalAlpha = 0.88 + Math.sin(t) * 0.12;
      if (pickup.type === 'coin') {
        ctx.fillStyle = '#ffd966';
        ctx.shadowColor = '#ffd966';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
      } else if (pickup.type === 'potion') {
        ctx.fillStyle = '#0f8';
        ctx.shadowColor = '#0f8';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#002';
        ctx.font = 'bold 12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('+', 0, 4);
      } else if (pickup.type === 'item') {
        const item = itemRegistry.get(pickup.key);
        const color = item?.color || '#fff';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = item?.rarity === 'god' ? 18 : 14;
        if (item?.rarity === 'god' && item?.accent) {
          ctx.strokeStyle = item.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
      } else if (pickup.type === 'ladder') {
        ctx.strokeStyle = '#7dff9e';
        ctx.shadowColor = '#7dff9e';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 3;
        ctx.strokeRect(-12, -16, 24, 32);
        ctx.beginPath();
        ctx.moveTo(-6, -12); ctx.lineTo(-6, 12);
        ctx.moveTo(6, -12); ctx.lineTo(6, 12);
        ctx.moveTo(-6, -6); ctx.lineTo(6, -6);
        ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
        ctx.moveTo(-6, 6); ctx.lineTo(6, 6);
        ctx.stroke();
      } else if (pickup.type === 'fightGod') {
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('FIGHT', 0, 3);
      } else if (pickup.type === 'returnGate') {
        ctx.strokeStyle = '#0ff';
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#aff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('LOOP', 0, 3);
      } else if (pickup.type === 'crown') {
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(-14, 10);
        ctx.lineTo(-10, -8);
        ctx.lineTo(-2, 0);
        ctx.lineTo(0, -12);
        ctx.lineTo(2, 0);
        ctx.lineTo(10, -8);
        ctx.lineTo(14, 10);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawProjectiles() {
    projectiles.forEach(projectile => {
      ctx.fillStyle = '#ff66aa';
      ctx.shadowColor = '#ff66aa';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  function drawEnemyTelegraphs() {
    enemies.forEach(enemy => {
      if (enemy.windup > 0) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.strokeStyle = (enemy.type === 'charger' || enemy.type === 'golem' || enemy.type === 'bulk_golem') ? '#ff8844' : '#aa66ff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.r + 10 + Math.sin(Date.now() / 120) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (enemy.beamTime > 0) {
        const end = getBeamEnd(enemy.x, enemy.y, enemy.beamAngle, enemy.type === 'god' ? 480 : 430);
        ctx.strokeStyle = enemy.type === 'god' ? '#ffffff' : '#aa66ff';
        ctx.lineWidth = enemy.type === 'god' ? 10 : 7;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });
  }

  function drawEnemies() {
    enemies.forEach(enemy => {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      if (enemy.bleed > 0) {
        ctx.strokeStyle = 'rgba(255,0,80,0.7)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#f00';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.r + 6 + Math.sin(Date.now() / 200) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      const color = enemy.type === 'god'
        ? '#ffffff'
        : enemy.type === 'queen_cult'
          ? '#ffe0ff'
          : enemy.type === 'bulk_golem'
            ? '#ffb16a'
            : enemy.type === 'artificer_knave'
              ? '#ffd27d'
              : enemy.type === 'golem'
                ? '#cc7d42'
                : enemy.type === 'cult_mage'
                  ? '#b455ff'
                  : enemy.type === 'sniper'
                    ? '#8cd4ff'
                    : enemy.type === 'knave'
                      ? '#ff5f79'
                      : enemy.type === 'charger'
                        ? '#ff8844'
                        : enemy.type === 'laser'
                          ? '#aa66ff'
                          : '#00ddff';

      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = enemy.elite || enemy.type === 'god' ? 18 : 10;
      ctx.globalAlpha = enemy.stun > 0 ? 0.65 : 1;

      if (enemy.type === 'hunter' || enemy.type === 'god' || enemy.type === 'queen_cult' || enemy.type === 'artificer_knave' || enemy.type === 'knave' || enemy.type === 'cult_follower') {
        ctx.beginPath();
        ctx.moveTo(enemy.r, 0);
        ctx.lineTo(-enemy.r * 0.7, enemy.r * 0.8);
        ctx.lineTo(-enemy.r * 0.55, 0);
        ctx.lineTo(-enemy.r * 0.7, -enemy.r * 0.8);
        ctx.closePath();
        ctx.fill();
      } else if (enemy.type === 'laser' || enemy.type === 'cult_mage' || enemy.type === 'sniper') {
        ctx.fillRect(-enemy.r, -enemy.r, enemy.r * 2, enemy.r * 2);
      } else {
        ctx.beginPath();
        const points = enemy.type === 'golem' || enemy.type === 'bulk_golem' ? 8 : 6;
        for (let index = 0; index < points; index += 1) {
          const angle = index * Math.PI * 2 / points;
          ctx.lineTo(Math.cos(angle) * enemy.r, Math.sin(angle) * enemy.r);
        }
        ctx.closePath();
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      const hpPct = clamp(enemy.hp / enemy.max, 0, 1);
      ctx.fillStyle = '#000a';
      ctx.fillRect(-18, -enemy.r - 14, 36, 5);
      ctx.fillStyle = isBossType(enemy.type) ? '#fff' : '#f0f';
      ctx.fillRect(-18, -enemy.r - 14, 36 * hpPct, 5);
      ctx.restore();
    });
  }

  function drawPlayer() {
    if (!player) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    if (godTimer > 0) {
      ctx.shadowColor = `hsl(${(Date.now() / 5) % 360},100%,60%)`;
      ctx.shadowBlur = 24;
    } else {
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = '#0ff';
    ctx.globalAlpha = player.inv > 0 ? 0.68 : 1;
    ctx.beginPath();
    ctx.arc(0, 0, player.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
    ctx.stroke();
    if (player.swing > 0) {
      ctx.strokeStyle = godTimer > 0 ? '#fff' : '#0ff';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, 55, player.swingA - ATTACKS.melee.arc, player.swingA + ATTACKS.melee.arc);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerLaser() {
    if (!laserActive || !player) return;
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const end = getBeamEnd(player.x, player.y, angle, ATTACKS.laser.range);
    ctx.strokeStyle = '#ff00aa';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#f0f';
    ctx.shadowBlur = 18;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    particles.forEach(particle => {
      if (particle.line) {
        const line = particle.line;
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const segs = Math.max(4, line.seg || 6);
        const jitter = (line.jag || 12) * (0.65 + particle.life * 0.55);

        ctx.save();
        ctx.globalAlpha = Math.min(1, particle.life * 2.1);
        ctx.strokeStyle = particle.c || '#dfe8ff';
        ctx.lineWidth = (line.w || 4.5) + 3;
        ctx.shadowColor = particle.c || '#dfe8ff';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        for (let index = 1; index < segs; index += 1) {
          const t = index / segs;
          const wave = Math.sin((t * 18) + (line.phase || 0) + particle.life * 22 + index * 0.9);
          const off = wave * jitter * (index % 2 === 0 ? 1 : -1);
          const px = line.x1 + dx * t + nx * off;
          const py = line.y1 + dy * t + ny * off;
          ctx.lineTo(px, py);
        }
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();

        ctx.lineWidth = Math.max(2, (line.w || 4.5) * 0.5);
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        for (let index = 1; index < segs; index += 1) {
          const t = index / segs;
          const wave = Math.sin((t * 18) + (line.phase || 0) + particle.life * 22 + index * 0.9);
          const off = wave * jitter * 0.35 * (index % 2 === 0 ? 1 : -1);
          const px = line.x1 + dx * t + nx * off;
          const py = line.y1 + dy * t + ny * off;
          ctx.lineTo(px, py);
        }
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.globalAlpha = Math.min(1, particle.life * 1.5);
      ctx.translate(particle.x, particle.y);
      if (particle.text) {
        ctx.fillStyle = particle.c || '#fff';
        ctx.font = `bold ${particle.size || 14}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = particle.c;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 3;
        ctx.strokeStyle = particle.outline || 'rgba(0,0,0,0.7)';
        ctx.strokeText(particle.text, 0, -particle.life * 20);
        ctx.fillText(particle.text, 0, -particle.life * 20);
      } else if (particle.ring) {
        ctx.strokeStyle = particle.c;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, particle.ring, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = particle.c || '#0ff';
        ctx.shadowColor = particle.c || '#0ff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawMinimap() {
    const originX = 790;
    const originY = 58;
    const size = 14;
    const gap = 2;
    ctx.save();
    rooms.forEach(room => {
      const x = originX + room.gx * (size + gap);
      const y = originY + room.gy * (size + gap);
      if (room.type === 'ladder' && !room.explored) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#fff04a';
      } else if (!room.explored) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#001018';
      } else if (room.type === 'ladder') {
        ctx.globalAlpha = 1;
        ctx.fillStyle = room === currentRoom ? '#ffff00' : '#fff04a';
      } else if (room === currentRoom) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#00ffff';
      } else if (room.type === 'god') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffffff';
      } else if (room.type === 'boss') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ff7a7a';
      } else if (room.type === 'treasure') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffaa00';
      } else if (room.type === 'start') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#00ff88';
      } else {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#0a3344';
      }
      ctx.fillRect(x, y, size, size);
      if (room.type === 'ladder') {
        ctx.globalAlpha = room.explored ? 1 : 0.7;
        ctx.fillStyle = '#fff700';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', x + size / 2, y + size / 2);
      }
      if (room.visited) {
        ctx.strokeStyle = 'rgba(0,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      }
      ctx.fillStyle = 'rgba(0,255,255,0.75)';
      if (room.doors.n) ctx.fillRect(x + size / 2 - 1, y - 2, 2, 2);
      if (room.doors.s) ctx.fillRect(x + size / 2 - 1, y + size, 2, 2);
      if (room.doors.w) ctx.fillRect(x - 2, y + size / 2 - 1, 2, 2);
      if (room.doors.e) ctx.fillRect(x + size, y + size / 2 - 1, 2, 2);
    });
    ctx.restore();
  }

  function drawGodModeBar() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(300, 12, 360, 6);
    ctx.fillStyle = `hsl(${(Date.now() / 10) % 360},100%,60%)`;
    ctx.fillRect(300, 12, 360 * (godTimer / 12), 6);
    ctx.fillStyle = '#fff';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('GOD MODE', 480, 10);
  }

  function getBossLabel(type) {
    if (type === 'queen_cult') return 'QUEEN OF THE CULT';
    if (type === 'bulk_golem') return 'BULK GOLEM';
    if (type === 'artificer_knave') return 'ARTIFICER CHARGED KNAVE';
    if (type === 'god') return 'GOD';
    return type.toUpperCase();
  }

  function drawBossHealthBars() {
    const bosses = enemies.filter(enemy => isBossType(enemy.type));
    if (!bosses.length) return;

    const width = 420;
    const height = 10;
    const gap = 18;
    const startX = (canvas.width - width) / 2;
    const startY = 16;

    bosses.forEach((boss, index) => {
      const y = startY + index * gap;
      const hpPct = clamp(boss.hp / boss.max, 0, 1);

      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(startX - 2, y - 2, width + 4, height + 4);
      ctx.fillStyle = '#220f28';
      ctx.fillRect(startX, y, width, height);

      ctx.fillStyle = boss.type === 'bulk_golem' ? '#ff8e4a' : boss.type === 'artificer_knave' ? '#ffd27d' : '#e4b9ff';
      if (boss.type === 'god') ctx.fillStyle = '#ffffff';
      ctx.fillRect(startX, y, width * hpPct, height);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(getBossLabel(boss.type), canvas.width / 2, y - 4);
    });
  }

  function drawFloorTransition() {
    if (!showFloorTransition || floorTransitionTime > 2.5) return;

    const progress = floorTransitionTime / 2.5;
    const scaleProgress = Math.min(progress * 1.5, 1);
    const fadeInProgress = Math.min(progress * 2, 1);
    const fadeOutProgress = Math.max((progress - 0.7) / 0.3, 0);

    const baseScale = 0.3 + scaleProgress * 0.7;
    const alpha = fadeInProgress * (1 - fadeOutProgress);

    ctx.save();
    ctx.globalAlpha = alpha;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const offsetY = (1 - scaleProgress) * 80;

    ctx.translate(centerX, centerY - offsetY);
    ctx.scale(baseScale, baseScale);
    ctx.translate(-centerX, -centerY);

    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 40 * alpha;
    ctx.font = 'bold 72px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(`FLOOR ${floor}`, centerX, centerY);

    ctx.font = 'bold 24px system-ui';
    ctx.fillStyle = '#7dff9e';
    ctx.shadowColor = '#7dff9e';
    ctx.shadowBlur = 20 * alpha;
    ctx.fillText('▼ ▼ ▼', centerX, centerY + 50);

    ctx.restore();
  }

  function drawActionIcons() {
    drawPixelIcon(ui.icons.dash, '#fff06a', [
      [1, 5], [2, 4], [3, 3], [4, 2], [5, 1], [5, 2], [6, 2], [7, 2],
      [4, 4], [5, 4], [6, 4], [7, 4], [4, 6], [5, 6], [6, 6], [7, 6],
    ]);
    drawPixelIcon(ui.icons.melee, '#00ffff', [
      [2, 6], [3, 5], [4, 4], [5, 3], [6, 2], [5, 4], [6, 3], [7, 2], [6, 5], [7, 4],
    ]);
    drawPixelIcon(ui.icons.laser, '#ff00aa', [
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [5, 3], [6, 2], [7, 1],
    ]);
    drawPixelIcon(ui.icons.smash, '#ffaa00', [
      [4, 1], [3, 2], [4, 2], [5, 2], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3],
      [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [3, 5], [4, 5], [5, 5], [4, 6],
    ]);
  }

  function drawPixelIcon(canvasEl, color, pixels) {
    const iconCtx = canvasEl.getContext('2d');
    iconCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    iconCtx.imageSmoothingEnabled = false;
    iconCtx.fillStyle = 'rgba(255,255,255,0.08)';
    iconCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    iconCtx.fillStyle = color;
    pixels.forEach(([px, py]) => {
      iconCtx.fillRect(px * 4, py * 4, 4, 4);
    });
  }

  function createUIController(view) {
    const manager = typeof window.UIManager === 'function' ? new window.UIManager({ autoRuntimeInit: false }) : null;
    let menuBound = false;
    let restartBound = false;
    let activeState = 'menu';
    let hudUpdateHook = null;

    function makeContainer(element) {
      return {
        show() { element?.classList.remove('hidden'); },
        hide() { element?.classList.add('hidden'); },
      };
    }

    function setSkillCard(name, current, max, active = false) {
      const fill = name === 'melee' ? view.fillMelee
        : name === 'laser' ? view.fillLaser
          : name === 'smash' ? view.fillSmash
            : view.fillDash;
      const time = name === 'melee' ? view.timeMelee
        : name === 'laser' ? view.timeLaser
          : name === 'smash' ? view.timeSmash
            : view.timeDash;
      const card = view.actionCards[name];
      const ready = current <= 0.02 && !active;
      const ratio = max <= 0 ? 0 : clamp(current / max, 0, 1);
      if (fill) fill.style.height = `${ratio * 100}%`;
      if (time) time.textContent = ready ? 'READY' : active ? 'CAST' : current.toFixed(1);
      if (card) card.classList.toggle('ready', ready);
    }

    function fallbackState(state) {
      const show = state || 'menu';
      view.start.classList.toggle('hidden',     show !== 'menu');
      view.charSelect?.classList.toggle('hidden', show !== 'charselect');
      view.dead.classList.toggle('hidden',      show !== 'dead');
      view.win.classList.toggle('hidden',       show !== 'win');
      view.pause?.classList.toggle('hidden',    show !== 'pause');
      const inPlay = show === 'play' || show === 'pause';
      view.hud.classList.toggle('hidden', !inPlay);
      view.actionBar.classList.toggle('hidden', !inPlay);
    }

    if (manager && typeof manager.registerScreen === 'function') {
      manager.registerScreen('hud', {
        create: () => makeContainer(view.hud),
        show: () => { if (hudUpdateHook) hudUpdateHook(); },
        update: () => { if (hudUpdateHook) hudUpdateHook(); },
        validStates: ['play'],
      });
      manager.registerScreen('actionBar', { create: () => makeContainer(view.actionBar), validStates: ['play'] });
      manager.registerScreen('start', { create: () => makeContainer(view.start), validStates: ['menu'] });
      manager.registerScreen('charSelect', { create: () => makeContainer(view.charSelect), validStates: ['charselect'] });
      manager.registerScreen('dead', { create: () => makeContainer(view.dead), validStates: ['dead'] });
      manager.registerScreen('win', { create: () => makeContainer(view.win), validStates: ['win'] });
      manager.registerScreen('pause', { create: () => makeContainer(view.pause), validStates: ['pause'] });
    }

    return {
      setState(state) {
        activeState = state || 'menu';
        if (manager && typeof manager.onGameStateChange === 'function') manager.onGameStateChange(state);
        fallbackState(state);
      },
      setHudUpdateHook(hook) {
        hudUpdateHook = typeof hook === 'function' ? hook : null;
      },
      tick() {
        if (manager && typeof manager.updateAll === 'function') {
          manager.updateAll();
          return;
        }
        if (activeState === 'play' && hudUpdateHook) hudUpdateHook();
      },
      bindMenuActions(handlers) {
        if (menuBound) return;
        view.charButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onCharacterSelect(button.dataset.char || '', button);
          });
        });
        view.go.addEventListener('click', handlers.onStartNew);
        view.seed.addEventListener('keydown', event => {
          if (event.key === 'Enter') handlers.onStartNew();
        });
        view.continueBtn?.addEventListener('click', handlers.onContinue);
        view.deleteRunBtn?.addEventListener('click', handlers.onDeleteRun);
        // New main-menu nav
        view.newRunBtn?.addEventListener('click', handlers.onOpenCharacterSelect);
        view.charBackBtn?.addEventListener('click', handlers.onCloseCharacterSelect);
        menuBound = true;
      },
      bindRestartActions(onRestart) {
        if (restartBound) return;
        view.deadRestart?.addEventListener('click', onRestart);
        view.winRestart?.addEventListener('click', onRestart);
        restartBound = true;
      },
      setSaveState(text) { view.saveState.textContent = text; },
      setMenuMeta(coins, bestFloor, saveState) {
        view.bankCoins.textContent = coins;
        view.bestFloor.textContent = bestFloor;
        view.saveState.textContent = saveState;
      },
      setRunSummary(summary) {
        const hasRun = !!summary;
        // Main menu: show/hide Continue button
        view.continueBtn?.classList.toggle('hidden', !hasRun);
        // Char-select screen: show/hide delete-run row
        view.deleteRunRow?.classList.toggle('hidden', !hasRun);
        view.runSummary.textContent = summary || '';
      },
      updateCharacterSelection(unlocked, selected) {
        view.charButtons.forEach(button => {
          const itemKey = button.dataset.char;
          const hint = button.querySelector('small');
          const baseHint = hint?.dataset.base || hint?.textContent || '';
          if (hint && !hint.dataset.base) hint.dataset.base = baseHint;
          button.classList.toggle('locked', !unlocked.has(itemKey));
          button.classList.toggle('sel', selected === itemKey);
          button.disabled = !unlocked.has(itemKey);
          if (hint) hint.textContent = unlocked.has(itemKey) ? baseHint : 'locked in bank';
        });
      },
      setItemStatus(items) {
        ITEM_KEYS.forEach(key => {
          const count = Number(items[key] || 0);
          view.itemSlots[key]?.classList.toggle('on', count > 0);
          if (view.itemCounts[key]) view.itemCounts[key].textContent = String(count);
        });
      },
      setObjective(text) { view.objective.textContent = text; },
      setHudValues(payload) {
        view.fl.textContent = payload.floor;
        view.lv.textContent = payload.level;
        view.xp.textContent = payload.xpText;
        view.coins.textContent = payload.coins;
        view.charName.textContent = payload.character;
        view.hpFill.style.width = `${Math.max(0, payload.hp / payload.maxHp) * 100}%`;
        view.hpTxt.textContent = Math.ceil(payload.hp);
        view.cdM.textContent = payload.meleeCd.toFixed(1);
        view.cdL.textContent = payload.laserCd.toFixed(1);
        view.cdS.textContent = payload.smashCd.toFixed(1);
        if (view.cdD) view.cdD.textContent = payload.dashCd.toFixed(1);
        if (payload.skills) {
          const melee = payload.skills.melee;
          const laser = payload.skills.laser;
          const smash = payload.skills.smash;
          const dash = payload.skills.dash;
          if (melee) setSkillCard('melee', melee.current, melee.max, !!melee.active);
          if (laser) setSkillCard('laser', laser.current, laser.max, !!laser.active);
          if (smash) setSkillCard('smash', smash.current, smash.max, !!smash.active);
          if (dash) setSkillCard('dash', dash.current, dash.max, !!dash.active);
        }
      },
      setDeadInfo(text) { view.deadInfo.textContent = text; },
      setWinInfo(text) { view.winInfo.textContent = text; },
    };
  }

  function createSaveStore() {
    const localPrefix = 'neonyke:';
    const idb = typeof indexedDB !== 'undefined' ? indexedDB : null;
    let dbPromise = null;

    function openDb() {
      if (!idb) return Promise.reject(new Error('IndexedDB unavailable'));
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = idb.open('NeoNykeDB', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('saves')) {
            request.result.createObjectStore('saves');
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return dbPromise;
    }

    async function idbGet(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readonly');
        const store = tx.objectStore('saves');
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    }

    async function idbPut(key, value) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    async function idbDelete(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    const fallback = {
      async get(key) {
        const raw = localStorage.getItem(localPrefix + key);
        return raw ? JSON.parse(raw) : null;
      },
      async put(key, value) {
        localStorage.setItem(localPrefix + key, JSON.stringify(value));
      },
      async delete(key) {
        localStorage.removeItem(localPrefix + key);
      },
    };

    return {
      kind: idb ? 'IDB READY' : 'LOCAL ONLY',
      async get(key) {
        if (!idb) return fallback.get(key);
        try {
          return await idbGet(key);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.get(key);
        }
      },
      async put(key, value) {
        if (!idb) return fallback.put(key, value);
        try {
          return await idbPut(key, value);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.put(key, value);
        }
      },
      async delete(key) {
        if (!idb) return fallback.delete(key);
        try {
          return await idbDelete(key);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.delete(key);
        }
      },
    };
  }

  function makeRNG(seed) {
    return mulberry32(xmur3(seed)());
  }

  function mulberry32(a) {
    return function nextRandom() {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function xmur3(seed) {
    let h = 1779033703 ^ seed.length;
    for (let index = 0; index < seed.length; index += 1) {
      h = Math.imul(h ^ seed.charCodeAt(index), 3432918353);
      h = h << 13 | h >>> 19;
    }
    return function seedFn() {
      h = Math.imul(h ^ h >>> 16, 2246822507);
      h = Math.imul(h ^ h >>> 13, 3266489909);
      return (h ^ h >>> 16) >>> 0;
    };
  }

  function rand(max = 1, min = 0) {
    return min + (max - min) * (rng ? rng() : Math.random());
  }

  function irand(min, max) {
    return Math.floor(rand(max + 1, min));
  }

  function shuffle(array) {
    const copy = [...array];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor((rng ? rng() : Math.random()) * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const testX = clamp(cx, rx, rx + rw);
    const testY = clamp(cy, ry, ry + rh);
    const dx = cx - testX;
    const dy = cy - testY;
    return dx * dx + dy * dy < r * r;
  }

  function isBlocked(x, y, r) {
    if (walls.some(wall => circleRect(x, y, r, wall.x, wall.y, wall.w, wall.h))) return true;
    if (structures.some(structure => circleRect(x, y, r, structure.x - structure.w / 2, structure.y - structure.h / 2, structure.w, structure.h))) return true;
    return destructibles.some(prop => !prop.broken && !prop.hidden && circleRect(x, y, r, prop.x - prop.r, prop.y - prop.r, prop.r * 2, prop.r * 2));
  }

  function beamHitsCircle(x1, y1, x2, y2, cx, cy, radius) {
    const lineLengthSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (lineLengthSq === 0) return false;
    let t = ((cx - x1) * (x2 - x1) + (cy - y1) * (y2 - y1)) / lineLengthSq;
    t = clamp(t, 0, 1);
    const px = x1 + t * (x2 - x1);
    const py = y1 + t * (y2 - y1);
    return dist(px, py, cx, cy) <= radius;
  }

  function getBeamEnd(x, y, angle, range) {
    return {
      x: x + Math.cos(angle) * range,
      y: y + Math.sin(angle) * range,
    };
  }
})();
