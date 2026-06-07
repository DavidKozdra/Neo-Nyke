// rooms.js — standalone IIFE. Floor generation, rooms, rival system.

  const LADDER_BOSS_HEALTH_SCALING_START_FLOOR = 5;
  const LADDER_BOSS_HEALTH_PER_FLOOR = 0.12;

  function applyLadderBossFloorHealthModifier(boss) {
    if (!boss || Neo.floor <= LADDER_BOSS_HEALTH_SCALING_START_FLOOR) return;
    const floorNumberModifier = 1 + (Neo.floor - LADDER_BOSS_HEALTH_SCALING_START_FLOOR) * LADDER_BOSS_HEALTH_PER_FLOOR;
    const previousMax = Math.max(1, Number(boss.max || boss.hp || 1));
    boss.max = Math.max(1, Math.round(previousMax * floorNumberModifier));
    boss.hp = Math.min(boss.max, Math.round(Number(boss.hp || previousMax) + (boss.max - previousMax)));
    boss.ladderBossHealthModifier = floorNumberModifier;
  }

  function generateFloor() {
    Neo.syncSeedState();
    Neo.resetRngStreams();
    Neo.rooms = [];

    const grid = Array.from({ length: 9 }, () => Array(9).fill(null));
    const positions = [];
    const start = { x: 4, y: 4 };
    grid[start.y][start.x] = true;
    positions.push(start);

    const target = 8 + Math.floor(Neo.nextRandom('world') * 3) + Math.min(2, Neo.floor >> 2);
    while (positions.length < target) {
      const seed = positions[Neo.irand(0, positions.length - 1, 'world')];
      const dirs = Neo.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], 'world');
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
      const room = createRoomRecord(position);
      Neo.rooms.push(room);
      roomMap.set(`${position.x},${position.y}`, room);
    });

    Neo.rooms.forEach(room => {
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
    if (Neo.floor === Neo.MAX_FLOOR) {
      farRoom.type = 'god';
    } else if (Neo.floor > Neo.MAX_FLOOR) {
      farRoom.type = Neo.floor % 3 === 0 ? 'boss' : 'ladder';
    } else if (Neo.floor % 3 === 0) {
      farRoom.type = 'boss';
    } else {
      farRoom.type = 'ladder';
    }

    const pool = Neo.rooms.filter(room => room !== startRoom && room !== farRoom);
    Neo.shuffle(pool, 'world');
    // Floor grammar (opt-in via Neo.useFloorGrammar): bias rewards toward dead-end
    // rooms so treasure/shop/etc. live off the critical start->exit path, the way
    // Spelunky/Isaac do. This is a STABLE reorder of the already-shuffled pool, so
    // it consumes no extra RNG — the draws below are unchanged; only which rooms
    // receive the reward types shifts. With the flag off, behaviour is identical.
    if (Neo.useFloorGrammar) biasRewardPoolToDeadEnds(pool, startRoom);
    const treasureCount = Math.min(3, 1 + Math.floor(Neo.nextRandom('world') * 3));
    for (let index = 0; index < treasureCount; index += 1) {
      if (pool[index]) pool[index].type = 'treasure';
    }
    const shopCandidate = pool.find(room => room.type === 'combat');
    if (shopCandidate && Neo.nextRandom('world') < 0.7) shopCandidate.type = 'shop';
    const challengeCandidate = pool.find(room => room.type === 'combat');
    if (challengeCandidate && Neo.floor >= 2 && Neo.floor < Neo.MAX_FLOOR && Neo.nextRandom('world') < 0.42) challengeCandidate.type = 'challenge';
    const anvilCandidate = pool.find(room => room.type === 'combat');
    if (anvilCandidate && Neo.nextRandom('world') < 0.55) anvilCandidate.type = 'anvil';
    assignSecretRoom(roomMap);
    Neo.rooms.forEach(decorateRoomData);

    Neo.player.x = Neo.START_X;
    Neo.player.y = Neo.START_Y;
    spawnRivals();
    Neo.gameEvents.emit('floor:enter', { floor: Neo.floor });
    enterRoom(startRoom);
    if (Array.isArray(Neo.pendingRivalDescends) && Neo.pendingRivalDescends.length > 0) {
      Neo.pendingRivalDescends.forEach((rival, i) => {
        Neo.spawnParticle({
          x: Neo.ROOM_W / 2,
          y: Neo.ROOM_H / 2 - 50 - i * 28,
          life: 2.2,
          text: `${rival.name.toUpperCase()} DESCENDS`,
          c: rival.color,
        });
      });
      Neo.pendingRivalDescends = [];
    }
    Neo.updateObjective();
    Neo.updateHud();
    Neo.applyScrollAbundanceForFloor?.();
  }

  // Stable-partitions an already-shuffled reward pool so dead-end rooms (graph
  // degree 1) come first, without changing relative order within each group and
  // without consuming RNG. Uses the engine's room-graph topology utilities; if
  // they are unavailable it leaves the pool untouched (falls back to current
  // behaviour). startRoom is excluded from the pool already, but is passed so the
  // graph is built over the full room set for accurate degree/connectivity.
  function biasRewardPoolToDeadEnds(pool, startRoom) {
    const maze = (typeof window !== 'undefined' ? window.KozEngine : globalThis.KozEngine)?.World?.dungeonMaze;
    if (!maze || typeof maze.buildRoomGraph !== 'function') return pool;

    const adjacency = maze.buildRoomGraph(Neo.rooms);
    if (!maze.isFullyConnected(startRoom, adjacency)) return pool; // safety: never strand rewards
    const deadEnds = new Set(maze.deadEndKeys(adjacency));
    const keyOf = maze.roomGraphKey || (room => `${room.gx},${room.gy}`);

    const ends = [];
    const rest = [];
    for (const room of pool) {
      (deadEnds.has(keyOf(room)) ? ends : rest).push(room);
    }
    pool.length = 0;
    pool.push(...ends, ...rest);
    return pool;
  }

  function decorateRoomData(room) {
    room.enemies = [];
    room.deadBodies = [];
    room.projectiles = [];
    room.chests = [];
    room.pickups = [];
    room.destructibles = [];
    room.hazards = [];
    room.shopOffers = [];
    room.shopMoveOffers = [];
    room.shopWeaponOffers = [];
    room.structures = [];
    room.decorations = [];
    room.gardenFruitNodes = [];
    if (room.type === 'start') return;

    if (room.type === 'secret') {
      const visitedFloors = Array.isArray(Neo.secretRoomVisitedFloors) ? Neo.secretRoomVisitedFloors : [];
      const isSecondVisit = visitedFloors.includes(Neo.floor);

      if (isSecondVisit) {
        room.cleared = false;
        room.bossStarted = false;
        room.secretKind = 'bowman_bane';
        room.decorations.push(
          { kind: 'crack', x: Neo.ROOM_W / 2 - 90, y: Neo.ROOM_H / 2 - 80, r: 28 },
          { kind: 'crack', x: Neo.ROOM_W / 2 + 90, y: Neo.ROOM_H / 2 - 80, r: 28 },
          { kind: 'crack', x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 + 100, r: 40 },
        );
        return;
      }

      room.cleared = true;
      room.decorations.push(
        { kind: 'banner', x: Neo.ROOM_W / 2 - 110, y: Neo.ROOM_H / 2 - 92, r: 14 },
        { kind: 'banner', x: Neo.ROOM_W / 2 + 110, y: Neo.ROOM_H / 2 - 92, r: 14 },
        { kind: 'crack', x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 + 118, r: 32 },
      );
      if (room.secretKind === 'warp') {
        const deltaPool = Neo.floor <= 2 ? [1, 2] : Neo.floor >= Neo.MAX_FLOOR - 1 ? [-2, -1] : [-2, -1, 1, 2];
        const delta = deltaPool[Neo.irand(0, deltaPool.length - 1, 'world')];
        room.pickups.push({
          x: Neo.ROOM_W / 2,
          y: Neo.ROOM_H / 2,
          type: 'secretWarp',
          delta,
          targetFloor: Neo.clamp(Neo.floor + delta, 1, Neo.MAX_FLOOR),
        });
      } else {
        const regularOffers = Neo.shuffle(['relic', 'vitality', 'wealth'], 'world');
        const offerPool = Neo.shuffle(['xp', regularOffers[0], regularOffers[1]], 'world');
        room.pickups.push(createSecretVendorOffer(offerPool[0], Neo.ROOM_W / 2 - 110, Neo.ROOM_H / 2 + 26, room, 0));
        room.pickups.push(createSecretVendorOffer(offerPool[1], Neo.ROOM_W / 2, Neo.ROOM_H / 2 - 18, room, 1));
        room.pickups.push(createSecretVendorOffer(offerPool[2], Neo.ROOM_W / 2 + 110, Neo.ROOM_H / 2 + 26, room, 2));
      }
      return;
    }

    // Boss and god rooms need an open arena — structures block projectiles and beams
    if (room.type !== 'god' && room.type !== 'boss') {
      decorateRoomStructures(room);
    }

    // Procedural prop/hazard population (rules live in roomTemplates.js). The
    // hazard factories below are injected so the rules can stay data-only. RNG
    // consumption order is preserved, so seeded output is unchanged.
    Neo.populateRoomProps(room, {
      createCornerMoatLavaHazards,
      createExplosiveTrapHazard,
    });

    Object.entries(room.secretPassages || {}).forEach(([dir, passage]) => {
      const targetRoom = findRoomAt(passage.targetGx, passage.targetGy);
      const wall = createSecretWall(dir, targetRoom);
      if (wall) room.destructibles.push(wall);
    });

    if (room.type === 'shop') {
      room.shopOffers = [
        { type: 'potion', cost: Neo.getShopPotionCost(), x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 + 88, bought: false },
      ];
      ensureShopHasMinimumItemOffers(room, 3);
      room.shopMoveOffers = [];
      room.shopWeaponOffers = [];
      room.cleared = true;
    } else if (room.type === 'challenge') {
      room.cleared = false;
      room.challengeStarted = false;
      room.challengeRewardSpawned = false;
      room.challengeFailed = false;
      room.challengeType = Neo.rollChallengeTrialType();
      room.challengeTimer = 0;
      room.challengeTick = 0;
      room.challengeData = {};
    } else if (room.type === 'anvil') {
      room.cleared = true;
    }

    decorateGardenRoomData(room);
  }

  function decorateRoomStructures(room) {
    const addWall = (x, y, w, h) => {
      const reinforced = Neo.nextRandom('world') < 0.24;
      room.destructibles.push({
        kind: 'cover_wall',
        x,
        y,
        w,
        h,
        r: Math.hypot(w, h) / 2,
        hp: reinforced ? 12 : 4,
        maxHp: reinforced ? 12 : 4,
        reinforced,
        broken: false,
      });
    };
    const addPillar = (x, y, size = 34) => {
      room.structures.push({ kind: 'pillar', x, y, w: size, h: size });
    };
    const setChambers = (...chambers) => {
      room.layoutChambers = chambers.map(chamber => ({
        x: chamber.x,
        y: chamber.y,
        w: chamber.w,
        h: chamber.h,
      }));
    };
    const addDoorFrames = () => {
      const edgeInset = Neo.WALL + 52;
      const pocketInset = Neo.DOOR / 2 + 48;
      const addTorch = (x, y) => {
        room.decorations.push({ kind: 'torch', x, y, r: 12 });
      };
      if (room.doors.n) {
        addWall(Neo.ROOM_W / 2 - pocketInset, edgeInset, 28, 56);
        addWall(Neo.ROOM_W / 2 + pocketInset, edgeInset, 28, 56);
        room.decorations.push(
          { kind: 'banner', x: Neo.ROOM_W / 2 - pocketInset, y: edgeInset - 42, r: 12 },
          { kind: 'banner', x: Neo.ROOM_W / 2 + pocketInset, y: edgeInset - 42, r: 12 },
        );
        addTorch(Neo.ROOM_W / 2 - pocketInset - 26, edgeInset - 4);
        addTorch(Neo.ROOM_W / 2 + pocketInset + 26, edgeInset - 4);
      }
      if (room.doors.s) {
        addWall(Neo.ROOM_W / 2 - pocketInset, Neo.ROOM_H - edgeInset, 28, 56);
        addWall(Neo.ROOM_W / 2 + pocketInset, Neo.ROOM_H - edgeInset, 28, 56);
        room.decorations.push({ kind: 'crack', x: Neo.ROOM_W / 2, y: Neo.ROOM_H - edgeInset + 34, r: 22 });
        addTorch(Neo.ROOM_W / 2 - pocketInset - 26, Neo.ROOM_H - edgeInset + 4);
        addTorch(Neo.ROOM_W / 2 + pocketInset + 26, Neo.ROOM_H - edgeInset + 4);
      }
      if (room.doors.w) {
        addWall(edgeInset, Neo.ROOM_H / 2 - pocketInset, 56, 28);
        addWall(edgeInset, Neo.ROOM_H / 2 + pocketInset, 56, 28);
        room.decorations.push({ kind: 'brazier', x: edgeInset + 28, y: Neo.ROOM_H / 2, r: 14 });
        addTorch(edgeInset - 6, Neo.ROOM_H / 2 - pocketInset - 28);
        addTorch(edgeInset - 6, Neo.ROOM_H / 2 + pocketInset + 28);
      }
      if (room.doors.e) {
        addWall(Neo.ROOM_W - edgeInset, Neo.ROOM_H / 2 - pocketInset, 56, 28);
        addWall(Neo.ROOM_W - edgeInset, Neo.ROOM_H / 2 + pocketInset, 56, 28);
        room.decorations.push({ kind: 'brazier', x: Neo.ROOM_W - edgeInset - 28, y: Neo.ROOM_H / 2, r: 14 });
        addTorch(Neo.ROOM_W - edgeInset + 6, Neo.ROOM_H / 2 - pocketInset - 28);
        addTorch(Neo.ROOM_W - edgeInset + 6, Neo.ROOM_H / 2 + pocketInset + 28);
      }
    };
    // Pick a data-driven template (registry lives in roomTemplates.js) and stamp
    // it into the room. With equal template weights this consumes RNG identically
    // to the old pick*Archetype() helpers, so seeded output is unchanged.
    // Order matches the original: template selection draws RNG first (one
    // Neo.irand on the 'world' stream, as the old pick*Archetype did), then door
    // frames are stamped, then the template geometry. Preserving this order keeps
    // seeded output byte-identical.
    const template = Neo.pickRoomTemplate(room);
    room.layoutArchetype = template ? template.id : 'open';
    room.layoutChambers = [];
    addDoorFrames();
    Neo.applyRoomTemplate(room, template, { addWall, addPillar, setChambers });
  }

  function decorateGardenRoomData(room) {
    if (!room || room.type === 'boss' || room.type === 'god' || Neo.floor <= 5) return;
    room.gardenDecorated = true;
    const gardenRoomScore = room.type === 'secret'
      ? 1
      : room.type === 'treasure'
        ? 0.9
        : room.type === 'shop'
          ? 0.75
          : room.type === 'anvil'
            ? 0.72
            : room.type === 'ladder'
              ? 0.66
              : 0.58;
    const treeCount = Math.max(1, Math.round((room.type === 'secret' ? 4 : room.type === 'treasure' ? 3 : 2) * gardenRoomScore));
    for (let index = 0; index < treeCount; index += 1) {
      const side = index % 2 === 0 ? 1 : -1;
      const depth = 84 + Neo.nextRandom('world') * 72;
      const x = Neo.clamp(Neo.ROOM_W / 2 + side * (120 + Neo.nextRandom('world') * 180), Neo.WALL + 50, Neo.ROOM_W - Neo.WALL - 50);
      const y = Neo.clamp(Neo.ROOM_H / 2 + (Neo.nextRandom('world') < 0.5 ? -1 : 1) * depth, Neo.WALL + 62, Neo.ROOM_H - Neo.WALL - 62);
      room.decorations.push({
        kind: Neo.nextRandom('world') < 0.45 ? 'fruit_tree' : 'tree',
        x,
        y,
        r: 22 + Neo.nextRandom('world') * 10,
      });
    }

    const mossCount = Math.max(2, Math.round(5 * gardenRoomScore));
    for (let index = 0; index < mossCount; index += 1) {
      room.decorations.push({
        kind: 'moss_patch',
        x: 120 + Neo.nextRandom('world') * (Neo.ROOM_W - 240),
        y: 110 + Neo.nextRandom('world') * (Neo.ROOM_H - 220),
        r: 14 + Neo.nextRandom('world') * 22,
      });
    }

    const fruitNodeCount = Math.max(1, Math.round((room.type === 'secret' ? 3 : room.type === 'treasure' ? 2 : 1) * gardenRoomScore));
    for (let index = 0; index < fruitNodeCount; index += 1) {
      const x = 150 + Neo.nextRandom('world') * (Neo.ROOM_W - 300);
      const y = 150 + Neo.nextRandom('world') * (Neo.ROOM_H - 300);
      const node = {
        id: `${room.gx},${room.gy}:${index}`,
        x,
        y,
        heal: 18 + Math.round(Neo.nextRandom('world') * 10),
        respawnAt: Neo.gameElapsedTime + Neo.rand(6, 2, 'world') + index * 2,
        fruitSpawned: false,
      };
      room.gardenFruitNodes.push(node);
      room.decorations.push({
        kind: 'fruit_tree',
        x: Neo.clamp(x + Neo.rand(42, -42, 'world'), Neo.WALL + 46, Neo.ROOM_W - Neo.WALL - 46),
        y: Neo.clamp(y + Neo.rand(36, -36, 'world'), Neo.WALL + 52, Neo.ROOM_H - Neo.WALL - 52),
        r: 20 + Neo.nextRandom('world') * 8,
      });
    }
  }

  function ensureGardenRoomData(room) {
    if (!room || room.type === 'boss' || room.type === 'god' || Neo.floor <= 5) return;
    if (!room.gardenDecorated) decorateGardenRoomData(room);
    room.pickups = Array.isArray(room.pickups) ? room.pickups : [];
    room.decorations = Array.isArray(room.decorations) ? room.decorations : [];
    room.gardenFruitNodes = Array.isArray(room.gardenFruitNodes) ? room.gardenFruitNodes : [];
  }

  function spawnGardenFruit(room, node) {
    if (!room || !node) return;
    room.pickups = Array.isArray(room.pickups) ? room.pickups : [];
    if (room.pickups.some(pickup => (pickup?.type === 'apple' || pickup?.type === 'fruit') && pickup.gardenNodeId === node.id)) return;
    room.pickups.push({
      x: node.x,
      y: node.y - 8,
      type: 'apple',
      heal: Number(node.heal || 20),
      gardenNodeId: node.id,
      roomGx: room.gx,
      roomGy: room.gy,
      respawnAt: Number(node.respawnAt || 0),
      grownAt: Neo.gameElapsedTime,
      ripe: true,
    });
    node.fruitSpawned = true;
  }

  function updateGardenGrowth() {
    if (Neo.floor <= 5) return;
    if (!Array.isArray(Neo.rooms) || Neo.rooms.length === 0) return;
    Neo.rooms.forEach(room => {
      if (!room || room.type === 'boss' || room.type === 'god') return;
      ensureGardenRoomData(room);
      room.gardenFruitNodes.forEach(node => {
        if (!node) return;
        const activeFruit = Array.isArray(room.pickups) && room.pickups.some(pickup => (pickup?.type === 'apple' || pickup?.type === 'fruit') && pickup.gardenNodeId === node.id);
        if (activeFruit) {
          node.fruitSpawned = true;
          return;
        }
        node.fruitSpawned = false;
        if (Neo.gameElapsedTime >= Number(node.respawnAt || 0)) {
          spawnGardenFruit(room, node);
        }
      });
    });
  }

  function randomMoatLanePosition(axis, radius) {
    const margin = 54 + radius;
    const center = axis === 'x' ? Neo.ROOM_W / 2 : Neo.ROOM_H / 2;
    const max = axis === 'x' ? Neo.ROOM_W - margin : Neo.ROOM_H - margin;
    const min = margin;
    const doorHalf = Neo.DOOR / 2 + radius + 26;
    const lowMax = center - doorHalf;
    const highMin = center + doorHalf;

    const ranges = [];
    if (lowMax > min) ranges.push([min, lowMax]);
    if (max > highMin) ranges.push([highMin, max]);
    if (!ranges.length) return Neo.rand(max, min, 'world');

    const [rangeMin, rangeMax] = ranges[Neo.irand(0, ranges.length - 1, 'world')];
    return Neo.rand(rangeMax, rangeMin, 'world');
  }

  function randomMoatLaneTiles(axis, tileCount) {
    const tile = Neo.ENV_TILE_SIZE;
    const span = axis === 'x' ? Neo.ROOM_W : Neo.ROOM_H;
    const center = span / 2;
    const innerMin = Neo.WALL;
    const innerMax = span - Neo.WALL;
    const patchSize = tileCount * tile;
    const doorHalf = Neo.DOOR / 2 + 32;
    const ranges = [];
    if (center - doorHalf - patchSize > innerMin) ranges.push([innerMin, center - doorHalf - patchSize]);
    if (innerMax - patchSize > center + doorHalf) ranges.push([center + doorHalf, innerMax - patchSize]);
    if (!ranges.length) return innerMin;
    const [rMin, rMax] = ranges[Neo.irand(0, ranges.length - 1, 'world')];
    const start = Neo.rand(rMax, rMin, 'world');
    return Neo.clamp(Neo.WALL + Math.round((start - Neo.WALL) / tile) * tile, innerMin, innerMax - patchSize);
  }

  function rectsOverlap(a, b) {
    return a.left < b.left + b.w
      && a.left + a.w > b.left
      && a.top < b.top + b.h
      && a.top + a.h > b.top;
  }

  function hasRoomDoorLikeExit(room, direction) {
    return !!room?.doors?.[direction] || !!room?.secretPassages?.[direction];
  }

  function getRoomEntranceExclusionRects(room) {
    const pad = 48;
    const depth = Neo.WALL + 112;
    const doorLeft = (Neo.ROOM_W - Neo.DOOR) / 2 - pad;
    const doorTop = (Neo.ROOM_H - Neo.DOOR) / 2 - pad;
    const doorW = Neo.DOOR + pad * 2;
    const doorH = Neo.DOOR + pad * 2;
    const rects = [];
    if (hasRoomDoorLikeExit(room, 'n')) rects.push({ left: doorLeft, top: 0, w: doorW, h: depth });
    if (hasRoomDoorLikeExit(room, 's')) rects.push({ left: doorLeft, top: Neo.ROOM_H - depth, w: doorW, h: depth });
    if (hasRoomDoorLikeExit(room, 'w')) rects.push({ left: 0, top: doorTop, w: depth, h: doorH });
    if (hasRoomDoorLikeExit(room, 'e')) rects.push({ left: Neo.ROOM_W - depth, top: doorTop, w: depth, h: doorH });
    return rects;
  }

  function isValidMoatLavaRect(room, left, top, w, h) {
    const rect = { left, top, w, h };
    return !getRoomEntranceExclusionRects(room).some(entrance => rectsOverlap(rect, entrance));
  }

  function applyMoatLavaRect(hazard, left, top, w, h) {
    hazard.left = left;
    hazard.top = top;
    hazard.x = left + w / 2;
    hazard.y = top + h / 2;
    hazard.r = Math.min(w, h) / 2;
    return hazard;
  }

  function createMoatLavaHazard(room = Neo.currentRoom) {
    const tile = Neo.ENV_TILE_SIZE;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const inCorner = Neo.nextRandom('world') < 0.45;
      const side = Neo.irand(0, 3, 'world');
      const wTiles = 2 + Neo.irand(0, 2, 'world');
      const hTiles = 2 + Neo.irand(0, 2, 'world');
      const w = wTiles * tile;
      const h = hTiles * tile;
      const wallAlignX = Neo.WALL;
      const wallAlignY = Neo.WALL;
      const farX = Neo.ROOM_W - Neo.WALL - w;
      const farY = Neo.ROOM_H - Neo.WALL - h;
      let left;
      let top;

      if (inCorner) {
        const cornerIdx = Neo.irand(0, 3, 'world');
        left = (cornerIdx % 2 === 0) ? wallAlignX : farX;
        top = (cornerIdx < 2) ? wallAlignY : farY;
      } else if (side === 0) {
        left = randomMoatLaneTiles('x', wTiles);
        top = wallAlignY;
      } else if (side === 1) {
        left = randomMoatLaneTiles('x', wTiles);
        top = farY;
      } else if (side === 2) {
        left = wallAlignX;
        top = randomMoatLaneTiles('y', hTiles);
      } else {
        left = farX;
        top = randomMoatLaneTiles('y', hTiles);
      }

      if (!isValidMoatLavaRect(room, left, top, w, h)) continue;
      return applyMoatLavaRect({
        kind: 'lava',
        shape: 'rect',
        w,
        h,
        phase: Neo.rand(Math.PI * 2, 0, 'world'),
        pulse: Neo.rand(1.8, 1.15, 'world'),
        side,
        corner: inCorner,
      }, left, top, w, h);
    }
    return null;
  }

  function createCornerMoatLavaHazards(room = Neo.currentRoom) {
    const tile = Neo.ENV_TILE_SIZE;
    const wTiles = 2 + Neo.irand(0, 1, 'world');
    const hTiles = 2 + Neo.irand(0, 1, 'world');
    const w = wTiles * tile;
    const h = hTiles * tile;
    const leftX = Neo.WALL;
    const rightX = Neo.ROOM_W - Neo.WALL - w;
    const topY = Neo.WALL;
    const bottomY = Neo.ROOM_H - Neo.WALL - h;
    const corners = [
      { left: leftX, top: topY, side: 0, cornerIdx: 0 },
      { left: rightX, top: topY, side: 0, cornerIdx: 1 },
      { left: leftX, top: bottomY, side: 1, cornerIdx: 2 },
      { left: rightX, top: bottomY, side: 1, cornerIdx: 3 },
    ];

    return corners
      .filter(corner => isValidMoatLavaRect(room, corner.left, corner.top, w, h))
      .map(corner => applyMoatLavaRect({
        kind: 'lava',
        shape: 'rect',
        w,
        h,
        phase: Neo.rand(Math.PI * 2, 0, 'world') + corner.cornerIdx * 0.53,
        pulse: Neo.rand(1.8, 1.15, 'world'),
        side: corner.side,
        corner: true,
        cornerIdx: corner.cornerIdx,
      }, corner.left, corner.top, w, h));
  }

  function createCompanionMoatLava(roomOrPrimary, maybePrimary = null) {
    const room = maybePrimary ? roomOrPrimary : Neo.currentRoom;
    const primary = maybePrimary || roomOrPrimary;
    if (!primary) return null;
    const tile = Neo.ENV_TILE_SIZE;
    const wTiles = Math.max(2, (primary.w / tile) - Neo.irand(0, 1, 'world'));
    const hTiles = Math.max(2, (primary.h / tile) - Neo.irand(0, 1, 'world'));
    const w = wTiles * tile;
    const h = hTiles * tile;
    const wallAlignX = Neo.WALL;
    const wallAlignY = Neo.WALL;
    const farX = Neo.ROOM_W - Neo.WALL - w;
    const farY = Neo.ROOM_H - Neo.WALL - h;
    const horizontal = primary.side <= 1;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const dir = attempt < 2
        ? (attempt === 0 ? -1 : 1)
        : (Neo.nextRandom('world') < 0.5 ? -1 : 1);
      const gapTiles = 1 + Neo.irand(0, 2, 'world');
      let left = primary.left;
      let top = primary.top;
      if (horizontal) {
        left = Neo.clamp(primary.left + dir * (primary.w + gapTiles * tile), wallAlignX, farX);
        top = primary.side === 0 ? wallAlignY : farY;
      } else {
        top = Neo.clamp(primary.top + dir * (primary.h + gapTiles * tile), wallAlignY, farY);
        left = primary.side === 2 ? wallAlignX : farX;
      }
      left = Neo.clamp(Neo.WALL + Math.round((left - Neo.WALL) / tile) * tile, wallAlignX, farX);
      top = Neo.clamp(Neo.WALL + Math.round((top - Neo.WALL) / tile) * tile, wallAlignY, farY);
      if (!isValidMoatLavaRect(room, left, top, w, h)) continue;
      return applyMoatLavaRect({
        kind: 'lava',
        shape: 'rect',
        w,
        h,
        phase: primary.phase + Neo.rand(1.9, 0.6, 'world'),
        pulse: primary.pulse + Neo.rand(0.35, -0.2, 'world'),
        side: primary.side,
      }, left, top, w, h);
    }
    return null;
  }

  function createExplosiveTrapHazard(room, index = 0) {
    const structuresList = Array.isArray(room?.structures) ? room.structures : [];
    const destructibleList = Array.isArray(room?.destructibles) ? room.destructibles : [];
    const chambers = Array.isArray(room?.layoutChambers) && room.layoutChambers.length
      ? room.layoutChambers
      : [{ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2, w: Neo.ROOM_W - 260, h: Neo.ROOM_H - 240 }];
    const radius = 16;
    const collides = (x, y) => {
      if (x < Neo.WALL + radius + 12 || x > Neo.ROOM_W - Neo.WALL - radius - 12) return true;
      if (y < Neo.WALL + radius + 12 || y > Neo.ROOM_H - Neo.WALL - radius - 12) return true;
      if (Math.hypot(x - Neo.START_X, y - Neo.START_Y) < 78) return true;
      if (structuresList.some(structure => Neo.circleRect(x, y, radius + 6, structure.x - structure.w / 2, structure.y - structure.h / 2, structure.w, structure.h))) return true;
      if (destructibleList.some(prop => !prop.broken && !prop.hidden && Neo.destructibleIntersectsCircle(prop, x, y, radius + 4))) return true;
      if (Array.isArray(room.hazards) && room.hazards.some(hazard => hazard?.kind === 'explosive_trap' && Neo.dist(x, y, hazard.x, hazard.y) < radius + (hazard.r || 16) + 58)) return true;
      return false;
    };

    for (let attempt = 0; attempt < 18; attempt += 1) {
      const chamber = chambers[(index + attempt) % chambers.length] || chambers[0];
      const halfW = Math.max(40, chamber.w / 2 - 28);
      const halfH = Math.max(40, chamber.h / 2 - 28);
      const x = Neo.clamp(chamber.x + Neo.rand(halfW, -halfW, 'world'), Neo.WALL + radius + 12, Neo.ROOM_W - Neo.WALL - radius - 12);
      const y = Neo.clamp(chamber.y + Neo.rand(halfH, -halfH, 'world'), Neo.WALL + radius + 12, Neo.ROOM_H - Neo.WALL - radius - 12);
      if (collides(x, y)) continue;
      return {
        kind: 'explosive_trap',
        x,
        y,
        r: radius,
        triggerRadius: 34,
        blastRadius: room.type === 'boss' ? 104 : 88,
        damage: room.type === 'boss' ? 26 + Neo.floor * 1.5 : 18 + Neo.floor * 1.2,
        fuse: 0,
        fuseDuration: room.type === 'boss' ? 0.62 : 0.78,
        triggered: false,
        sparkTick: 0,
      };
    }

    return null;
  }

  function createRoomRecord(position, overrides = {}) {
    return {
      gx: position.x,
      gy: position.y,
      type: 'combat',
      layoutArchetype: 'open',
      layoutChambers: [],
      doors: { n: false, s: false, e: false, w: false },
      secretPassages: {},
      secret: false,
      explored: false,
      visited: false,
      cleared: false,
      bossStarted: false,
      challengeStarted: false,
      challengeRewardSpawned: false,
      challengeFailed: false,
      ...overrides,
    };
  }

  function findRoomAt(gx, gy) {
    return Neo.rooms.find(room => room.gx === gx && room.gy === gy) || null;
  }

  function getConnectedRoom(room, direction) {
    if (!room || !direction) return null;
    const secretPassage = room.secretPassages?.[direction];
    if (secretPassage?.open) {
      return findRoomAt(secretPassage.targetGx, secretPassage.targetGy);
    }
    if (!room.doors?.[direction]) return null;
    const vector = Neo.DIRECTION_VECTORS[direction];
    return vector ? findRoomAt(room.gx + vector.dx, room.gy + vector.dy) : null;
  }

  function hasRoomExit(room, direction) {
    return !!getConnectedRoom(room, direction);
  }

  function hasVisibleRoomExit(room, direction) {
    return !!room?.doors?.[direction] || !!room?.secretPassages?.[direction]?.open;
  }

  function setSecretPassageOpen(room, direction, open = true) {
    const passage = room?.secretPassages?.[direction];
    if (!passage) return;
    passage.open = !!open;
    const targetRoom = findRoomAt(passage.targetGx, passage.targetGy);
    const reverse = Neo.OPPOSITE_DIRECTION[direction];
    if (targetRoom?.secretPassages?.[reverse]) {
      targetRoom.secretPassages[reverse].open = !!open;
    }
  }

  function createSecretWall(direction, targetRoom) {
    if (!targetRoom) return null;
    const position = {
      n: { x: Neo.ROOM_W / 2, y: 48 },
      s: { x: Neo.ROOM_W / 2, y: Neo.ROOM_H - 48 },
      e: { x: Neo.ROOM_W - 48, y: Neo.ROOM_H / 2 },
      w: { x: 48, y: Neo.ROOM_H / 2 },
    }[direction];
    if (!position) return null;
    return {
      kind: 'secret_wall',
      x: position.x,
      y: position.y,
      w: 52,
      h: 52,
      r: 22,
      hp: 2,
      maxHp: 2,
      broken: false,
      secretDir: direction,
      targetGx: targetRoom.gx,
      targetGy: targetRoom.gy,
    };
  }

  function createSecretVendorOffer(kind, x, y, room = Neo.currentRoom, index = 0) {
    if (kind === 'relic') {
      const vendorRandom = Neo.createRoomRandom(room, `secret-vendor:relic:${index}`);
      return { x, y, type: 'secretVendor', offerKind: 'relic', cost: 1, label: 'Relic', rewardKey: Neo.rollItemDrop({ elite: true, random: vendorRandom }) };
    }
    if (kind === 'vitality') {
      return { x, y, type: 'secretVendor', offerKind: 'vitality', cost: 1, label: 'Vital' };
    }
    if (kind === 'xp') {
      return {
        x,
        y,
        type: 'secretVendor',
        offerKind: 'xp',
        cost: Neo.getSecretXpOfferCost(),
        xpValue: Neo.getSecretXpOfferAmount(),
        label: 'XP',
      };
    }
    return { x, y, type: 'secretVendor', offerKind: 'wealth', cost: 2, label: 'Wealth' };
  }

  function assignSecretRoom(roomMap) {
    const anchors = Neo.shuffle(Neo.rooms.filter(room => !room.secret && ['combat', 'treasure', 'shop', 'anvil'].includes(room.type)), 'world');
    for (const anchor of anchors) {
      const dirs = Neo.shuffle([...Neo.DIRECTIONS], 'world');
      for (const dir of dirs) {
        const vector = Neo.DIRECTION_VECTORS[dir];
        const nx = anchor.gx + vector.dx;
        const ny = anchor.gy + vector.dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        if (roomMap.get(`${nx},${ny}`)) continue;
        const secretRoom = createRoomRecord({ x: nx, y: ny }, {
          type: 'secret',
          secret: true,
          cleared: true,
          secretKind: Neo.nextRandom('world') < 0.5 ? 'warp' : 'vendor',
        });
        anchor.secretPassages[dir] = { targetGx: nx, targetGy: ny, open: false };
        secretRoom.secretPassages[Neo.OPPOSITE_DIRECTION[dir]] = { targetGx: anchor.gx, targetGy: anchor.gy, open: false };
        Neo.rooms.push(secretRoom);
        roomMap.set(`${nx},${ny}`, secretRoom);
        return;
      }
    }
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
    if (!Neo.currentRoom) return;
    Neo.currentRoom.enemies = Neo.enemies;
    Neo.currentRoom.deadBodies = Neo.deadBodies;
    Neo.currentRoom.projectiles = Neo.projectiles;
    Neo.currentRoom.chests = Neo.chests;
    Neo.currentRoom.pickups = Neo.pickups;
    Neo.currentRoom.destructibles = Neo.destructibles;
    Neo.currentRoom.hazards = Neo.hazards;
    Neo.currentRoom.shopOffers = Neo.shopOffers;
    Neo.currentRoom.shopWeaponOffers = Array.isArray(Neo.currentRoom.shopWeaponOffers) ? Neo.currentRoom.shopWeaponOffers : [];
    Neo.currentRoom.structures = Neo.structures;
    Neo.currentRoom.decorations = Neo.decorations;
  }

  function findSafeSpawnPoint() {
    const searchRadius = 120;
    const testRadius = 18;
    const angleStep = Math.PI / 8;
    const clearOfEnemies = (x, y) => Neo.enemies.every(e => Math.hypot(e.x - x, e.y - y) > e.r + testRadius + 32);

    if (!Neo.isBlocked(Neo.START_X, Neo.START_Y, testRadius) && clearOfEnemies(Neo.START_X, Neo.START_Y)) {
      return { x: Neo.START_X, y: Neo.START_Y };
    }

    for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
      for (let r = searchRadius * 0.25; r <= searchRadius; r += 20) {
        const x = Neo.START_X + Math.cos(angle) * r;
        const y = Neo.START_Y + Math.sin(angle) * r;
        if (!Neo.isBlocked(x, y, testRadius) && clearOfEnemies(x, y)) {
          return { x: Neo.clamp(x, Neo.WALL + testRadius, Neo.ROOM_W - Neo.WALL - testRadius), y: Neo.clamp(y, Neo.WALL + testRadius, Neo.ROOM_H - Neo.WALL - testRadius) };
        }
      }
    }
    
    return { x: Neo.START_X, y: Neo.START_Y };
  }

  function isLockedFightRoom(room) {
    return !!room && (room.type === 'boss' || room.type === 'god' || room.type === 'ladder' || Neo.CHALLENGE_ROOM_TYPES.has(room.type));
  }

  function clearPlayerTransientDefense() {
    if (!Neo.player) return;
    Neo.player.inv = 0;
    Neo.player.stun = 0;
    Neo.player.vx = 0;
    Neo.player.vy = 0;
    Neo.player.dashTime = 0;
    Neo.player.dashX = 0;
    Neo.player.dashY = 0;
    Neo.player.cowardsWayTime = 0;
    Neo.player.mooggyZoomiesTime = 0;
    Neo.player.princessFlightTime = 0;
    Neo.loveBeamCasting = false;
    Neo.player.blockActive = false;
    Neo.player.blockTimer = 0;
  }

  function tickPlayerTransientDefenseTimers(dt) {
    if (!Neo.player) return;
    const step = Math.max(0, Number(dt) || 0);
    Neo.player.inv = Math.max(0, Number(Neo.player.inv || 0) - step);
    Neo.player.dashTime = Math.max(0, Number(Neo.player.dashTime || 0) - step);
    if (Neo.player.dashTime <= 0) {
      Neo.player.dashX = 0;
      Neo.player.dashY = 0;
    }
    Neo.player.cowardsWayTime = Math.max(0, Number(Neo.player.cowardsWayTime || 0) - step);
    Neo.player.princessFlightTime = Math.max(0, Number(Neo.player.princessFlightTime || 0) - step);
    Neo.player.blockTimer = Math.max(0, Number(Neo.player.blockTimer || 0) - step);
    Neo.player.blockActive = Neo.player.blockTimer > 0;
    if (Neo.player.princessFlightTime <= 0 && Neo.loveBeamCasting) {
      Neo.loveBeamCasting = false;
    }
  }

  // --- Game event handlers ---
  // room:enter  fires every time the player enters any room (including floor start)
  // floor:enter fires when a new floor is generated, before room:enter
  Neo.gameEvents.on('room:enter', ({ room }) => {
    clearPlayerTransientDefense();
    Neo.player.roomDamageTaken = 0;
    Neo.endActiveLaser();
    Neo.laserTime = 0;
    Neo.laserTick = 0;
    Neo.laserAngle = 0;
    Neo.laserSweepSpeed = 0;
    Neo.turtleWaveHpTimer = 0;

    const pendantCount = Neo.getItemCount?.('veggys_pendant') || 0;
    if (pendantCount > 0 && Neo.player) {
      Neo.player.veggysRoomCounter = (Neo.player.veggysRoomCounter || 0) + 1;
      if (Neo.player.veggysRoomCounter >= 3) {
        Neo.player.veggysRoomCounter = 0;
        const gain = pendantCount * 0.10;
        const oldMax = Neo.player.maxHp;
        Neo.player.maxHp = Math.round(Neo.player.maxHp * (1 + gain));
        Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + (Neo.player.maxHp - oldMax));
        Neo.markInventoryPanelDirty?.();
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 28, life: 1.2, text: `MAX HP +${Math.round(gain * 100)}%`, c: '#a0e87a' });
      }
    }
  });

  Neo.gameEvents.on('floor:enter', ({ floor: newFloor }) => {
    // floor-level resets go here; room:enter will fire immediately after for the start room
  });

  function isBossFightActive() {
    return Neo.currentRoom?.type === 'boss' || Neo.currentRoom?.type === 'god' || Neo.enemies.some(enemy => Neo.isBossType(enemy?.type));
  }

  function trySpawnMooggyAssassin(room) {
    if (!room || room.cleared || room.mooggyAssassinSpawned) return;
    if (!Neo.player || Neo.player.character === 'mooggy') return;
    if (!['normal', 'competitive'].includes(Neo.gameMode)) return;
    if (Neo.floor < 3 || Neo.mooggyAssassinSpawnedThisRun) return;
    const defeats = Math.max(0, Number(Neo.metaProgress?.mooggyDefeats || 0));
    const unlocked = (Neo.metaProgress?.unlockedCharacters || []).includes('mooggy') || defeats >= 3;
    if (unlocked && Neo.nextRandom('encounter') > 0.08) return;
    room.mooggyAssassinSpawned = true;
    Neo.mooggyAssassinSpawnedThisRun = true;
    const angle = Neo.nextRandom('encounter') * Math.PI * 2;
    const radius = 170 + Neo.nextRandom('encounter') * 90;
    const preferredX = Neo.clamp(Neo.ROOM_W / 2 + Math.cos(angle) * radius, 90, Neo.ROOM_W - 90);
    const preferredY = Neo.clamp(Neo.ROOM_H / 2 + Math.sin(angle) * radius, 90, Neo.ROOM_H - 90);
    Neo.spawnMooggyAssassin?.(preferredX, preferredY);
  }

  function enterRoom(room) {
    syncCurrentRoomState();
    Neo.setShopPanelOpen(false);
    Neo.setInventoryPanelOpen(false);
    Neo.currentRoom = room;
    Neo.minimapLegendDirty = true;
    room.explored = true;
    room.visited = true;
    Neo.enemies = room.enemies || [];
    Neo.deadBodies = room.deadBodies || [];
    room.deadBodies = Neo.deadBodies;
    Neo.projectiles = room.projectiles || [];
    Neo.chests = room.chests || [];
    Neo.pickups = Neo.sanitizePickupList(room.pickups);
    room.pickups = Neo.pickups;
    Neo.particles = [];
    Neo.destructibles = room.destructibles || [];
    Neo.hazards = room.hazards || [];
    Neo.shopOffers = room.shopOffers || [];
    Neo.structures = room.structures || [];
    // Banners/flags are retired — strip them from any room (incl. authored
    // templates and older save snapshots) as rooms are activated.
    if (Array.isArray(room.decorations)) {
      room.decorations = room.decorations.filter(decor => decor && decor.kind !== 'banner');
    }
    Neo.decorations = room.decorations || [];
    Neo.mouse.right = false;
    Neo.mouse.rightQueued = false;
    Neo.gameEvents.emit('room:enter', { room });
    const safeSpawn = findSafeSpawnPoint();
    Neo.player.x = safeSpawn.x;
    Neo.player.y = safeSpawn.y;

    if (room.type === 'combat' && !room.cleared && Neo.enemies.length === 0) {
      if (Neo.gameMode === 'endless') {
        Neo.endlessWaveActive = true;
        Neo.updateEndlessWaveHud?.();
        const firstWaveSize = 4 + Neo.floor;
        Neo.spawnEndlessWave(Neo.endlessWave + 1, firstWaveSize);
        Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 40, life: 1.2, text: `WAVE ${Neo.endlessWave + 1}`, c: '#ff8b8b' });
      } else {
        Neo.spawnWave(Neo.getWaveCount(3), 'combat');
      }
      trySpawnMooggyAssassin(room);
    }
    if (room.type === 'shop') {
      ensureShopHasMinimumItemOffers(room, 3);
      room.shopWeaponOffers = Array.isArray(room.shopWeaponOffers) ? room.shopWeaponOffers : [];
      Neo.refreshRoomShopCosts(room);
      Neo.shopOffers = room.shopOffers || [];
    }
    if (room.type === 'challenge') {
      if (!room.cleared && !room.challengeStarted) {
        Neo.spawnChallengeStarter(room);
      } else if (!room.cleared && room.challengeStarted && (room.challengeType || 'mirror') === 'stillness' && (room.challengeData?.phase || '') === 'choose') {
        if (!Neo.pickups.some(pickup => pickup?.type === 'challengeItemChoice')) Neo.spawnStillnessItemChoices(room);
      } else if (!room.cleared && room.challengeStarted && (room.challengeType || 'mirror') === 'bomb') {
        if (!Neo.pickups.some(pickup => pickup?.type === 'challengeBomb')) Neo.spawnChallengeBombs(room);
      } else if (!room.cleared && room.challengeStarted && !Neo.enemies.some(enemy => enemy.type === 'mirror_knight')) {
        if ((room.challengeType || 'mirror') === 'mirror') Neo.spawnMirrorChampion();
      }
    }

    if (room.type === 'anvil') {
      Neo.setAnvilPanelOpen(false);
    }

    if (room.type === 'treasure' && !room.cleared && Neo.chests.length === 0) {
      const treasureRandom = Neo.createRoomRandom(room, 'treasure:chests');
      const chestCount = 1 + Math.floor(treasureRandom() * 2);
      const placedChestPositions = [];
      const chestInsetX = Neo.WALL + 88;
      const chestInsetY = Neo.WALL + 76;
      const minChestSpacing = 132;
      for (let index = 0; index < chestCount; index += 1) {
        const itemChance = Neo.clamp(0.9 + Number(Neo.getItemStats?.()?.itemDropChanceBonus || 0), 0, 0.98);
        const isAbChest = Neo.floor > 4 && treasureRandom() < 0.2;
        const rewardsItem = isAbChest || treasureRandom() < itemChance;
        let chestPos = null;
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const preferredX = chestInsetX + treasureRandom() * Math.max(1, Neo.ROOM_W - chestInsetX * 2);
          const preferredY = chestInsetY + treasureRandom() * Math.max(1, Neo.ROOM_H - chestInsetY * 2);
          const safeSpawn = Neo.findSafeEnemySpawnPoint?.(preferredX, preferredY, 24)
            || { x: Neo.clamp(preferredX, chestInsetX, Neo.ROOM_W - chestInsetX), y: Neo.clamp(preferredY, chestInsetY, Neo.ROOM_H - chestInsetY) };
          const overlapsPlacedChest = placedChestPositions.some(pos => Neo.dist(pos.x, pos.y, safeSpawn.x, safeSpawn.y) < minChestSpacing);
          if (!overlapsPlacedChest) {
            chestPos = safeSpawn;
            break;
          }
        }
        if (!chestPos) {
          const fallbackSpread = chestCount === 1 ? 0 : (index - (chestCount - 1) / 2) * 150;
          chestPos = {
            x: Neo.clamp(Neo.ROOM_W / 2 + fallbackSpread, chestInsetX, Neo.ROOM_W - chestInsetX),
            y: Neo.ROOM_H / 2 + (index % 2 === 0 ? -36 : 36),
          };
        }
        placedChestPositions.push(chestPos);
        Neo.chests.push({
          x: chestPos.x,
          y: chestPos.y,
          open: false,
          choiceType: isAbChest ? 'ab' : '',
          rewardType: rewardsItem ? 'item' : 'potion',
          rewardKey: rewardsItem ? Neo.rollItemDrop({ random: treasureRandom }) : '',
        });
      }
    }

    if (room.secret) {
      if (room.secretKind !== 'bowman_bane') {
        if (!Array.isArray(Neo.secretRoomVisitedFloors)) Neo.secretRoomVisitedFloors = [];
        if (!Neo.secretRoomVisitedFloors.includes(Neo.floor)) {
          Neo.secretRoomVisitedFloors.push(Neo.floor);
          Neo.scheduleRunSave();
        }
        Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 24, life: 1.1, text: 'SECRET ROOM', c: '#8dd4ff' });
      }
    }

    if (room.type === 'ladder') {
      if (!room.cleared && Neo.enemies.length === 0) {
        Neo.spawnWave(Neo.getWaveCount(4), 'ladder');
        // Almost always add a random non-god boss to ladder rooms
        if (!room.ladderBossPlan) {
          const ladderRandom = Neo.createRoomRandom(room, 'ladder:boss');
          const _ladderBossPool = ['queen_cult', 'bulk_golem', 'artificer_knave', 'antony_blemmye'];
          room.ladderBossPlan = {
            spawn: ladderRandom() < 0.88,
            type: _ladderBossPool[Math.floor(ladderRandom() * _ladderBossPool.length)],
          };
        }
        if (room.ladderBossPlan.spawn) {
          const _ladderBossType = room.ladderBossPlan.type;
          const _ladderBossSpawn = Neo.findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2 - 60, 20);
          if (_ladderBossSpawn) {
            const _ladderBoss = Neo.spawnEnemy(_ladderBossType, _ladderBossSpawn.x, _ladderBossSpawn.y, false);
            applyLadderBossFloorHealthModifier(_ladderBoss);
            const _playedLadderCutscene = Neo.tryPlayBossIntroCutscene(_ladderBoss, _ladderBossType);
            const _ladderBossLine = Neo.BOSS_OPENING_DIALOGUE[_ladderBossType];
            if (!_playedLadderCutscene && _ladderBoss && _ladderBossLine) Neo.sayOverEntity(_ladderBoss, _ladderBossLine);
          }
        }
      }
      if (room.cleared && !Neo.pickups.some(pickup => pickup.type === 'ladder')) {
        let ladderX = Neo.ROOM_W / 2;
        let ladderY = Neo.ROOM_H / 2;
        let attempts = 0;
        while (Neo.isBlocked(ladderX, ladderY, 16) && attempts < 20) {
          const angle = Neo.nextRandom('world') * Math.PI * 2;
          const radius = 60 + Neo.nextRandom('world') * 120;
          ladderX = Neo.clamp(Neo.ROOM_W / 2 + Math.cos(angle) * radius, 60, Neo.ROOM_W - 60);
          ladderY = Neo.clamp(Neo.ROOM_H / 2 + Math.sin(angle) * radius, 60, Neo.ROOM_H - 60);
          attempts++;
        }
        Neo.pickups.push({ x: ladderX, y: ladderY, type: 'ladder' });
      }
    }

    if (room.type === 'boss') {
      if (!room.cleared && Neo.enemies.length === 0) {
        Neo.spawnFloorBoss();
      }
      if (room.cleared && !Neo.pickups.some(pickup => pickup.type === 'ladder')) {
        let ladderX = Neo.ROOM_W / 2;
        let ladderY = Neo.ROOM_H / 2;
        let attempts = 0;
        while (Neo.isBlocked(ladderX, ladderY, 16) && attempts < 20) {
          const angle = Neo.nextRandom('world') * Math.PI * 2;
          const radius = 60 + Neo.nextRandom('world') * 120;
          ladderX = Neo.clamp(Neo.ROOM_W / 2 + Math.cos(angle) * radius, 60, Neo.ROOM_W - 60);
          ladderY = Neo.clamp(Neo.ROOM_H / 2 + Math.sin(angle) * radius, 60, Neo.ROOM_H - 60);
          attempts++;
        }
        Neo.pickups.push({ x: ladderX, y: ladderY, type: 'ladder' });
      }
    }

    // Inject rivals that are already present in this room
    injectRivalsToCurrentRoom();

    if (room.type === 'god') {
      const ensureGodIntroDialogue = () => {
        if (room.godIntroPlayed) return;
        if (Neo.playGodDialogue(1)) room.godIntroPlayed = true;
      };
      if (room.cleared) {
        if (!Neo.pickups.some(pickup => pickup.type === 'crown')) {
          Neo.pickups.push({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2, type: 'crown' });
        }
      } else if (room.bossStarted) {
        if (!Neo.enemies.some(enemy => enemy.type === 'god')) {
          Neo.spawnGodBoss();
        }
        ensureGodIntroDialogue();
      } else if (!room.bossStarted) {
        // Auto-start the god fight immediately — no upfront choice
        Neo.currentRoom.bossStarted = true;
        if (!Neo.enemies.some(enemy => enemy.type === 'god')) {
          Neo.spawnGodBoss();
        }
        ensureGodIntroDialogue();
        syncCurrentRoomState();
        Neo.updateObjective();
      }
    }

    if (room.secret && room.secretKind === 'bowman_bane') {
      if (room.cleared) {
        // Only (re)spawn the reward chest if it was never looted. Without this
        // guard, leaving and re-entering a cleared room farms the chest forever.
        if (!room.secretChestLooted && !Neo.pickups.some(pickup => pickup.type === 'secret_boss_chest')) {
          Neo.pickups.push({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2, type: 'secret_boss_chest' });
        }
      } else if (!room.bossStarted) {
        room.bossStarted = true;
        if (!Neo.enemies.some(enemy => enemy.type === 'bowman_bane')) {
          Neo.spawnBowmanBane();
        }
        syncCurrentRoomState();
        Neo.updateObjective();
      }
    }

    updateGardenGrowth();
    syncCurrentRoomState();
    Neo.updateObjective();
    Neo.scheduleRunSave();
    // A panel-item choice owed from a prior room (picked up mid-cinematic, during
    // a shop, etc.) opens now that the player is back in control in a fresh room.
    Neo.requestPanelItemSelection?.();
  }

  function ensureShopHasMinimumItemOffers(room, minItemOffers = 3) {
    if (!room || room.type !== 'shop') return;
    room.shopOffers = Array.isArray(room.shopOffers) ? room.shopOffers : [];
    const itemOffers = room.shopOffers.filter(offer => offer?.type === 'item');
    const extraOffers = Math.max(0, Math.floor(Number(Neo.getItemStats?.()?.shopExtraItemOffers || 0)));
    const targetItemOffers = minItemOffers + extraOffers;
    if (itemOffers.length >= targetItemOffers) {
      ensureShopScrollOffer(room);
      ensureShopTradeOffer(room);
      return;
    }

    const shopRandom = Neo.createRoomRandom(room, 'shop:item-offers');
    const occupiedKeys = new Set(itemOffers.map(offer => offer.key));
    const itemSlots = [
      { x: Neo.ROOM_W / 2 - 240, y: Neo.ROOM_H / 2 - 16 },
      { x: Neo.ROOM_W / 2 - 80, y: Neo.ROOM_H / 2 - 16 },
      { x: Neo.ROOM_W / 2 + 80, y: Neo.ROOM_H / 2 - 16 },
      { x: Neo.ROOM_W / 2 + 240, y: Neo.ROOM_H / 2 - 16 },
      { x: Neo.ROOM_W / 2 - 160, y: Neo.ROOM_H / 2 + 48 },
      { x: Neo.ROOM_W / 2 + 160, y: Neo.ROOM_H / 2 + 48 },
    ];
    let created = 0;

    while (itemOffers.length + created < targetItemOffers) {
      let key = '';
      for (let attempts = 0; attempts < 12; attempts += 1) {
        const candidate = Neo.rollItemDrop({ random: shopRandom });
        if (!occupiedKeys.has(candidate)) {
          key = candidate;
          break;
        }
      }
      if (!key) key = Neo.rollItemDrop({ random: shopRandom });
      occupiedKeys.add(key);
      const itemIndex = itemOffers.length + created;
      const slot = itemSlots[itemIndex] || { x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 16 };
      const rarity = Neo.itemRegistry.get(key)?.rarity || Neo.ITEM_DEFS[key]?.rarity || 'knight';
      room.shopOffers.push({
        type: 'item',
        key,
        cost: Neo.getShopItemCost(itemIndex, Neo.floor, Neo.selectedDifficulty, rarity),
        x: slot.x,
        y: slot.y,
        bought: false,
      });
      created += 1;
    }
    ensureShopScrollOffer(room);
    ensureShopTradeOffer(room);
  }

  function rollScrollOfControl(random = Neo.rng) {
    const pool = Neo.SCROLL_OF_CONTROL_KEYS || [];
    if (!pool.length) return '';
    return pool[Math.floor(random() * pool.length)] || pool[0];
  }

  function ensureShopScrollOffer(room) {
    if (!room || room.type !== 'shop' || Neo.floor <= 3) return null;
    room.shopOffers = Array.isArray(room.shopOffers) ? room.shopOffers : [];
    if (room.shopOffers.some(offer => offer?.type === 'item' && (Neo.SCROLL_OF_CONTROL_KEYS || []).includes(offer.key))) return null;
    const shopRandom = Neo.createRoomRandom(room, 'shop:scroll-offer');
    if (shopRandom() >= 0.2) return null;
    const key = rollScrollOfControl(shopRandom);
    if (!key) return null;
    const itemIndex = room.shopOffers.filter(offer => offer?.type === 'item').length;
    room.shopOffers.push({
      type: 'item',
      key,
      cost: Neo.getShopItemCost(itemIndex, Neo.floor, Neo.selectedDifficulty, 'knight'),
      x: Neo.ROOM_W / 2 + 260,
      y: Neo.ROOM_H / 2 + 56,
      bought: false,
      scrollOffer: true,
    });
    return key;
  }

  function createSeededItemChoices(count, random, options = {}) {
    const targetCount = Math.max(1, Math.floor(Number(count || 1)));
    const choices = [];
    const seen = new Set();
    let guard = 0;
    while (choices.length < targetCount && guard < targetCount * 18) {
      guard += 1;
      const key = Neo.rollItemDrop({ elite: !!options.elite, random });
      if (key && !seen.has(key)) {
        seen.add(key);
        choices.push(key);
      }
    }
    for (const key of Neo.ITEM_KEYS || []) {
      if (choices.length >= targetCount) break;
      if (key && !seen.has(key)) {
        seen.add(key);
        choices.push(key);
      }
    }
    return choices;
  }

  function getBossRewardPickCount(floorValue = Neo.floor, room = Neo.currentRoom) {
    const floorPickBonus = Math.floor(Math.max(0, Number(floorValue || 1) - 1) / 4);
    const bossBonus = room?.type === 'god' ? 1 : 0;
    const difficultyBonus = { easy: 0, normal: 0, hard: 1, nightmare: 1 }[String(Neo.selectedDifficulty || '').toLowerCase()] || 0;
    return Neo.clamp(1 + floorPickBonus + bossBonus + difficultyBonus, 1, 3);
  }

  function getItemRarityRank(key) {
    const rarity = String(Neo.itemRegistry?.get?.(key)?.rarity || Neo.ITEM_DEFS?.[key]?.rarity || 'knight').toLowerCase();
    if (rarity === 'god' || rarity === 'red') return 3;
    if (rarity === 'wizard' || rarity === 'purple') return 2;
    return 1;
  }

  function getTradeTargetRarityRank(costKeys) {
    const highestCostRank = Math.max(1, ...costKeys.map(getItemRarityRank));
    return Math.min(3, highestCostRank + 1);
  }

  function ensureShopTradeOffer(room) {
    if (!room || room.type !== 'shop') return null;
    const playerItems = Neo.player?.items || {};
    const costPool = Object.keys(playerItems)
      .filter(key => Number(playerItems[key] || 0) > 0 && getItemRarityRank(key) < 3);
    if (room.shopTradeOffer && typeof room.shopTradeOffer === 'object' && !(room.shopTradeOffer.unavailable && costPool.length >= 2)) return room.shopTradeOffer;
    if (costPool.length < 2) {
      room.shopTradeOffer = { type: 'trade', unavailable: true, bought: false };
      return room.shopTradeOffer;
    }
    const tradeRandom = Neo.createRoomRandom(room, 'shop:trade-offer');
    const shuffledCostPool = Neo.shuffleWithRandom(costPool, tradeRandom);
    const costKeys = shuffledCostPool.slice(0, 2);
    const targetRank = getTradeTargetRarityRank(costKeys);
    const targetPool = (Neo.ITEM_KEYS || []).filter(key => getItemRarityRank(key) === targetRank && !costKeys.includes(key));
    const shuffledTargetPool = Neo.shuffleWithRandom(targetPool.length ? targetPool : Neo.ITEM_KEYS, tradeRandom);
    room.shopTradeOffer = {
      type: 'trade',
      key: shuffledTargetPool[0] || '',
      costKeys,
      targetRank,
      unavailable: false,
      bought: false,
    };
    return room.shopTradeOffer;
  }

  // ── Rival Adventurer System ──────────────────────────────────────────────

  function createDefaultRivalMemory() {
    return {
      playerSightings: 0,
      playerHitsTaken: 0,
      playerHitsDealt: 0,
      stolenCount: 0,
      roomsVisited: 0,
      threat: 0,
      lastSeenTime: 0,
      princessKnightIntroPlayed: false,
    };
  }

  function normalizeRivalMemory(source) {
    const fallback = createDefaultRivalMemory();
    const memory = source && typeof source === 'object' ? source : {};
    return {
      playerSightings: Number(memory.playerSightings || fallback.playerSightings),
      playerHitsTaken: Number(memory.playerHitsTaken || fallback.playerHitsTaken),
      playerHitsDealt: Number(memory.playerHitsDealt || fallback.playerHitsDealt),
      stolenCount: Number(memory.stolenCount || fallback.stolenCount),
      roomsVisited: Number(memory.roomsVisited || fallback.roomsVisited),
      threat: Number(memory.threat || fallback.threat),
      lastSeenTime: Number(memory.lastSeenTime || fallback.lastSeenTime),
      princessKnightIntroPlayed: !!memory.princessKnightIntroPlayed,
    };
  }

  function tryPlayPrincessKnightCutscene(rival, enemy) {
    if (!rival || !enemy || !Neo.player) return false;
    if (Neo.player.character !== 'thorn_knight') return false;
    if (rival.characterKey !== 'princess') return false;
    if (rival.memory?.princessKnightIntroPlayed) return false;

    rival.memory.princessKnightIntroPlayed = true;
    Neo.clearGameplayInput();
    Neo.setShopPanelOpen(false);
    Neo.setInventoryPanelOpen(false);
    enemy.attackCd = Math.max(Number(enemy.attackCd || 0), 1.2);
    enemy.stun = Math.max(Number(enemy.stun || 0), 0.2);

    return Neo.uiController.playDialogue([
      {
        speaker: 'RIVAL PRINCESS',
        text: "Oh, you're here. You were supposed to be fighting for me, but you took too long, so now we fight!",
      },
      {
        speaker: 'THORN KNIGHT',
        text: 'Then draw your blade.',
      },
    ], { returnState: 'play' });
  }

  function getRivalById(rivalId, rivalKey = '') {
    if (!rivalId && !rivalKey) return null;
    return Neo.rivals.find(r => (r.rivalId && r.rivalId === rivalId) || (r.characterKey && r.characterKey === rivalKey)) || null;
  }

  function applyRivalLevelStats(rival, options = {}) {
    if (!rival) return;
    const syncLiveEnemy = options.syncLiveEnemy !== false;
    const keepHpRatio = options.keepHpRatio !== false;
    const oldMax = Math.max(1, Number(rival.max || rival.baseHp || 1));
    const oldHp = Neo.clamp(Number(rival.hp || oldMax), 1, oldMax);
    const level = Math.max(1, Number(rival.level || 1));
    const hpScale = 1 + (level - 1) * 0.14;
    const dmgScale = 1 + (level - 1) * 0.11;
    const speedScale = 1 + Math.min(0.24, (level - 1) * 0.02);
    const attackCdScale = 1 - Math.min(0.28, (level - 1) * 0.018);
    const moveScale = 1 - Math.min(0.38, (level - 1) * 0.022);

    rival.max = Math.max(20, Math.round(Number(rival.baseHp || rival.max || oldMax) * hpScale));
    rival.dmg = Math.max(4, Math.round(Number(rival.baseDmg || rival.dmg || 4) * dmgScale));
    rival.speed = Math.max(40, Number(rival.baseSpeed || rival.speed || 40) * speedScale);
    rival.attackCd = Math.max(0.42, Number(rival.baseAttackCd || rival.attackCd || 1) * attackCdScale);
    rival.moveInterval = Math.max(3.2, Number(rival.baseMoveInterval || Neo.RIVAL_MOVE_INTERVAL_BASE) * moveScale);
    rival.hp = keepHpRatio
      ? Neo.clamp(Math.round((oldHp / oldMax) * rival.max), 1, rival.max)
      : Neo.clamp(oldHp, 1, rival.max);
    rival.hpSnapshot = rival.hp;

    if (!syncLiveEnemy) return;
    const liveEnemy = Neo.enemies.find(e => e.type === 'rival' && ((e.rivalData && e.rivalData.rivalId === rival.rivalId) || e.rivalKey === rival.characterKey));
    if (!liveEnemy) return;
    const liveOldMax = Math.max(1, Number(liveEnemy.max || oldMax));
    const liveOldHp = Neo.clamp(Number(liveEnemy.hp || liveOldMax), 1, liveOldMax);
    liveEnemy.max = rival.max;
    liveEnemy.dmg = rival.dmg;
    liveEnemy.speed = rival.speed;
    liveEnemy.hp = keepHpRatio
      ? Neo.clamp(Math.round((liveOldHp / liveOldMax) * rival.max), 1, rival.max)
      : Neo.clamp(liveOldHp, 1, rival.max);
    rival.hp = liveEnemy.hp;
    rival.hpSnapshot = liveEnemy.hp;
  }

  function migrateRivalState(source) {
    if (!source || typeof source !== 'object') return null;
    const def = Neo.RIVAL_DEFS[source.characterKey] || null;
    const baseHp = Math.max(40, Number(source.baseHp || source.max || source.hp || def?.hp || 140));
    const baseDmg = Math.max(5, Number(source.baseDmg || source.dmg || def?.dmg || 18));
    const migrated = {
      ...source,
      rivalId: String(source.rivalId || `${source.characterKey || 'rival'}-${Math.floor(Neo.nextRandom('world') * 1000000)}`),
      characterKey: String(source.characterKey || ''),
      name: String(source.name || def?.name || 'Rival'),
      color: String(source.color || def?.color || '#ff9d7a'),
      attackStyle: String(source.attackStyle || def?.attackStyle || 'melee'),
      enterLine: String(source.enterLine || def?.enterLine || 'I remember you.'),
      deathLine: String(source.deathLine || def?.deathLine || 'Not this time...'),
      roomGx: Number(source.roomGx || 0),
      roomGy: Number(source.roomGy || 0),
      moveTimer: Number(source.moveTimer || 0),
      moveInterval: Number(source.moveInterval || source.baseMoveInterval || Neo.RIVAL_MOVE_INTERVAL_BASE),
      baseMoveInterval: Number(source.baseMoveInterval || source.moveInterval || Neo.RIVAL_MOVE_INTERVAL_BASE),
      baseHp,
      baseDmg,
      baseSpeed: Math.max(40, Number(source.baseSpeed || source.speed || def?.speed || 90)),
      baseAttackCd: Math.max(0.42, Number(source.baseAttackCd || source.attackCd || def?.attackCd || 1)),
      hp: Math.max(1, Number(source.hp || source.max || baseHp)),
      max: Math.max(1, Number(source.max || source.hp || baseHp)),
      dmg: Math.max(1, Number(source.dmg || baseDmg)),
      speed: Math.max(40, Number(source.speed || def?.speed || 90)),
      r: Math.max(10, Number(source.r || def?.r || 16)),
      attackCd: Math.max(0.42, Number(source.attackCd || def?.attackCd || 1)),
      level: Math.max(1, Number(source.level || 1)),
      xp: Math.max(0, Number(source.xp || 0)),
      xpToNext: Math.max(8, Number(source.xpToNext || (22 + Neo.floor * 4))),
      growthTick: Math.max(0, Number(source.growthTick || 0)),
      weapons: Array.isArray(source.weapons) ? source.weapons : [],
      loot: Array.isArray(source.loot)
        ? source.loot
          .filter(item => item && ['item', 'coin', 'potion'].includes(item.type))
          .map(item => ({ type: item.type, key: item.key, value: item.value }))
        : [],
      memory: normalizeRivalMemory(source.memory),
      dead: !!source.dead,
    };
    if (!migrated.weapons.length) {
      migrated.weapons = (Neo.RIVAL_WEAPON_LOADOUTS[migrated.characterKey] || []).map(weapon => ({ ...weapon }));
    }
    applyRivalLevelStats(migrated, { syncLiveEnemy: false, keepHpRatio: false });
    migrated.hp = Neo.clamp(Number(source.hp || migrated.hp), 1, migrated.max);
    migrated.hpSnapshot = migrated.hp;
    return migrated;
  }

  function awardRivalXp(rival, amount, reason = '') {
    if (!rival || rival.dead) return;
    let xpGain = Math.max(0, Number(amount) || 0);
    if (xpGain <= 0) return;
    const threatBonus = 1 + Math.min(0.6, Math.max(0, Number(rival.memory?.threat || 0)) * 0.08);
    xpGain *= threatBonus;
    rival.xp += xpGain;
    let leveled = false;
    while (rival.xp >= rival.xpToNext) {
      rival.xp -= rival.xpToNext;
      rival.level += 1;
      rival.xpToNext = Math.round(rival.xpToNext * 1.18 + 3);
      applyRivalLevelStats(rival, { keepHpRatio: true });
      leveled = true;
      const liveEnemy = Neo.enemies.find(e => e.type === 'rival' && e.rivalData === rival);
      if (!liveEnemy) {
        Neo.spawnParticle({ x: 48, y: 60 + rival.level * 2, life: 1.6, text: `${rival.name}: LV ${rival.level}`, c: rival.color, size: 10 });
      }
    }
    if (leveled && reason !== 'silent') {
      Neo.scheduleRunSave();
    }
  }

  function restoreRivals(snapshotRivals) {
    const loaded = Array.isArray(snapshotRivals) ? snapshotRivals.map(migrateRivalState).filter(Boolean) : [];
    Neo.rivals = loaded;
    const rivalById = new Map(Neo.rivals.map(rival => [rival.rivalId, rival]));
    Neo.enemies.forEach(enemy => {
      if (enemy?.type !== 'rival') return;
      const rivalFromEnemy = enemy.rivalData && typeof enemy.rivalData === 'object' ? migrateRivalState(enemy.rivalData) : null;
      const matching = (rivalFromEnemy && rivalById.get(rivalFromEnemy.rivalId))
        || getRivalById(enemy.rivalData?.rivalId, enemy.rivalKey)
        || rivalFromEnemy;
      if (!matching) return;
      if (!rivalById.has(matching.rivalId)) {
        Neo.rivals.push(matching);
        rivalById.set(matching.rivalId, matching);
      }
      matching.hp = Neo.clamp(Number(enemy.hp || matching.hp), 1, matching.max);
      matching.hpSnapshot = matching.hp;
      enemy.rivalData = matching;
      enemy.rivalKey = matching.characterKey;
      enemy.max = matching.max;
      enemy.dmg = matching.dmg;
      enemy.speed = matching.speed;
      enemy.attackCd = Math.max(Number(enemy.attackCd || 0), matching.attackCd * 0.5);
    });
  }

  function spawnRivals() {
    const carried = Array.isArray(Neo._carriedRivals) ? Neo._carriedRivals : [];
    Neo._carriedRivals = null;

    if (!Neo.rooms || Neo.rooms.length === 0) { Neo.rivals = []; Neo.pendingRivalDescends = []; return; }

    const nonStartRooms = Neo.rooms.filter(r => r.type !== 'start' && r.type !== 'boss' && r.type !== 'god');
    const floorScale = 1 + (Neo.floor - 1) * 0.12;

    Neo.rivals = [];
    Neo.pendingRivalDescends = [];

    // Reintegrate rivals that were alive when descending
    for (const old of carried) {
      const room = nonStartRooms.length > 0
        ? nonStartRooms[Math.floor(Neo.nextRandom('world') * nonStartRooms.length)]
        : Neo.rooms[0];
      if (!room) continue;

      const def = Neo.RIVAL_DEFS[old.characterKey];
      if (def) {
        old.baseHp  = Math.round(def.hp  * floorScale);
        old.baseDmg = Math.round(def.dmg * floorScale);
      }

      old.roomGx = room.gx;
      old.roomGy = room.gy;
      old.homeGx = room.gx;
      old.homeGy = room.gy;
      old.objectiveGx = room.gx;
      old.objectiveGy = room.gy;
      old.objectiveKind = 'patrol';
      old.route = [];
      old.aggroTimer = 0;
      old.lastKnownPlayerGx = room.gx;
      old.lastKnownPlayerGy = room.gy;

      applyRivalLevelStats(old, { syncLiveEnemy: false, keepHpRatio: true });
      Neo.rivals.push(old);
      Neo.pendingRivalDescends.push(old);
    }

    // Always consume the spawn-chance roll to keep RNG deterministic
    const carriedKeys = new Set(carried.map(r => r.characterKey));
    const rollPassed = Neo.nextRandom('world') <= Neo.RIVAL_SPAWN_CHANCE;

    if (rollPassed && nonStartRooms.length > 0) {
      let unchosen = Object.keys(Neo.CHARACTER_DEFS).filter(k => k !== Neo.chosenCharacter && Neo.RIVAL_DEFS[k] && !carriedKeys.has(k));
      if (Neo.chosenCharacter === 'thorn_knight' && unchosen.includes('princess') && unchosen.length > 1) {
        // Thorn runs: rival princess is intentionally very rare.
        if (Neo.nextRandom('world') > 0.05) {
          unchosen = unchosen.filter(key => key !== 'princess');
        }
      }
      const count = Neo.floor >= 3 ? Math.min(2, unchosen.length) : 1;
      const shuffled = [...unchosen].sort(() => Neo.nextRandom('world') - 0.5);
      for (let i = 0; i < count && i < shuffled.length; i++) {
        const charKey = shuffled[i];
        const def = Neo.RIVAL_DEFS[charKey];
        const spawnRoom = nonStartRooms[i % nonStartRooms.length];
        const reputationBonus = Math.max(0, Math.floor(Number(Neo.player?.rivalReputation || 0) / 2));
        const startingLevel = Math.max(1, 1 + reputationBonus);
        const baseMoveInterval = Neo.RIVAL_MOVE_INTERVAL_BASE + Neo.nextRandom('world') * 4;
        Neo.rivals.push({
          rivalId: `${charKey}-${Neo.floor}-${Math.floor(Neo.nextRandom('world') * 1000000)}`,
          characterKey: charKey,
          name: def.name,
          color: def.color,
          attackStyle: def.attackStyle,
          enterLine: def.enterLine,
          deathLine: def.deathLine,
          roomGx: spawnRoom.gx,
          roomGy: spawnRoom.gy,
          moveTimer: 6 + Neo.nextRandom('world') * 5,
          moveInterval: baseMoveInterval,
          baseMoveInterval,
          baseHp: Math.round(def.hp * floorScale),
          baseDmg: Math.round(def.dmg * floorScale),
          baseSpeed: def.speed,
          baseAttackCd: def.attackCd,
          hp: Math.round(def.hp * floorScale),
          max: Math.round(def.hp * floorScale),
          dmg: Math.round(def.dmg * floorScale),
          speed: def.speed,
          r: def.r,
          attackCd: def.attackCd,
          level: startingLevel,
          xp: 0,
          xpToNext: 22 + Neo.floor * 4,
          growthTick: 0,
          weapons: (Neo.RIVAL_WEAPON_LOADOUTS[charKey] || []).map(weapon => ({ ...weapon })),
          loot: [],
          homeGx: spawnRoom.gx,
          homeGy: spawnRoom.gy,
          objectiveGx: spawnRoom.gx,
          objectiveGy: spawnRoom.gy,
          objectiveKind: 'patrol',
          route: [],
          aggroTimer: 0,
          lastKnownPlayerGx: spawnRoom.gx,
          lastKnownPlayerGy: spawnRoom.gy,
          hpSnapshot: Math.round(def.hp * floorScale),
          memory: createDefaultRivalMemory(),
          dead: false,
        });
        applyRivalLevelStats(Neo.rivals[Neo.rivals.length - 1], { syncLiveEnemy: false, keepHpRatio: false });
      }
    }
  }

  function getRoomByCoords(gx, gy) {
    return Neo.rooms.find(room => room.gx === gx && room.gy === gy) || null;
  }

  function hasStealableLoot(room) {
    if (!room || !Array.isArray(room.pickups) || room.pickups.length === 0) return false;
    return room.pickups.some(pickup => pickup.type === 'item' || pickup.type === 'coin' || pickup.type === 'potion');
  }

  function buildRivalRoute(fromRoom, toRoom) {
    if (!fromRoom || !toRoom || fromRoom === toRoom) return [];
    const visited = new Set([fromRoom]);
    const queue = [{ room: fromRoom, path: [] }];
    const DIRS = ['n', 's', 'e', 'w'];
    while (queue.length > 0) {
      const { room, path } = queue.shift();
      for (const dir of DIRS) {
        const next = getConnectedRoom(room, dir);
        if (!next || visited.has(next)) continue;
        visited.add(next);
        const nextPath = [...path, dir];
        if (next === toRoom) return nextPath;
        queue.push({ room: next, path: nextPath });
      }
    }
    return [];
  }

  function chooseRivalObjectiveRoom(rival, fromRoom) {
    if (!fromRoom) return null;
    const threat = Number(rival?.memory?.threat || 0);
    if (Neo.currentRoom && Neo.currentRoom !== fromRoom && threat > 1.2) {
      const huntChance = Neo.clamp(0.2 + threat * 0.07, 0.2, 0.72);
      if (Neo.nextRandom('encounter') < huntChance) {
        return Neo.currentRoom;
      }
    }
    const pool = Neo.rooms.filter(room => room !== fromRoom && room.type !== 'start' && room.type !== 'god' && room.type !== 'boss');
    if (pool.length === 0) return fromRoom;

    const weighted = [];
    pool.forEach(room => {
      let weight = 1;
      if (hasStealableLoot(room)) weight += 3.4;
      if (room.type === 'treasure') weight += 2.1;
      if (room.type === 'shop') weight += 1.7;
      if (room.type === 'challenge') weight += 1.1;
      if (room.type === 'anvil') weight += 1.3;
      if (room.type === 'combat' && !room.cleared) weight += 0.8;
      const distance = Math.abs(room.gx - fromRoom.gx) + Math.abs(room.gy - fromRoom.gy);
      weight += Math.min(2, distance * 0.35);
      if (rival.homeGx === room.gx && rival.homeGy === room.gy) weight += 0.2;
      weighted.push({ room, weight: Math.max(0.1, weight) });
    });

    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return pool[Math.floor(Neo.nextRandom('encounter') * pool.length)] || fromRoom;
    let roll = Neo.nextRandom('encounter') * totalWeight;
    for (let i = 0; i < weighted.length; i += 1) {
      roll -= weighted[i].weight;
      if (roll <= 0) return weighted[i].room;
    }
    return weighted[weighted.length - 1].room || fromRoom;
  }

  function chooseFallbackNeighbor(fromRoom) {
    const dirs = ['n', 's', 'e', 'w'];
    for (const dir of dirs.sort(() => Neo.nextRandom('encounter') - 0.5)) {
      const next = getConnectedRoom(fromRoom, dir);
      if (next) return { next, dir };
    }
    return null;
  }

  function isMonsterDoorRoamEligible(enemy) {
    if (!enemy || typeof enemy !== 'object') return false;
    if (enemy.type === 'rival' || enemy.type === 'mirror_knight') return false;
    if (Neo.isBossType(enemy.type) || enemy.type === 'god') return false;
    if (enemy.type === 'boss_spawner') return false;
    if (enemy.spawnT > 0) return false;
    return true;
  }

  function getDoorEntryPoint(direction, radius = 15) {
    const r = Math.max(8, Number(radius || 15));
    const laneX = Neo.ROOM_W / 2 + Neo.rand(34, -34, 'encounter');
    const laneY = Neo.ROOM_H / 2 + Neo.rand(34, -34, 'encounter');
    if (direction === 'n') {
      return { x: laneX, y: Neo.WALL + r + 10 };
    }
    if (direction === 's') {
      return { x: laneX, y: Neo.ROOM_H - Neo.WALL - r - 10 };
    }
    if (direction === 'e') {
      return { x: Neo.ROOM_W - Neo.WALL - r - 10, y: laneY };
    }
    return { x: Neo.WALL + r + 10, y: laneY };
  }

  function updateMonsterDoorRoaming(dt) {
    if (!Neo.currentRoom || !Neo.player || !Array.isArray(Neo.rooms) || Neo.rooms.length === 0) return;
    if (Neo.player.character === 'princess') {
      Neo.monsterRoamTimer = 0;
      return;
    }

    Neo.monsterRoamTimer += dt;
    if (Neo.monsterRoamTimer < Neo.MONSTER_ROAM_INTERVAL_SECONDS) return;
    Neo.monsterRoamTimer -= Neo.MONSTER_ROAM_INTERVAL_SECONDS;

    const moves = [];
    for (const room of Neo.rooms) {
      if (!room || room === Neo.currentRoom) continue;
      if (!Array.isArray(room.enemies) || room.enemies.length === 0) continue;
      const exits = Neo.DIRECTIONS
        .map(dir => ({ dir, next: getConnectedRoom(room, dir) }))
        .filter(entry => !!entry.next);
      if (exits.length === 0) continue;

      const remaining = [];
      for (const enemy of room.enemies) {
        if (!isMonsterDoorRoamEligible(enemy) || Neo.nextRandom('encounter') > Neo.MONSTER_ROAM_MOVE_CHANCE) {
          remaining.push(enemy);
          continue;
        }
        const chosenExit = exits[Math.floor(Neo.nextRandom('encounter') * exits.length)];
        if (!chosenExit?.next) {
          remaining.push(enemy);
          continue;
        }
        moves.push({ enemy, from: room, to: chosenExit.next, dir: chosenExit.dir });
      }

      room.enemies = remaining;
    }

    if (moves.length === 0) return;

    let enteredCurrentRoom = 0;
    for (const move of moves) {
      const targetRoom = move.to;
      if (!Array.isArray(targetRoom.enemies)) targetRoom.enemies = [];
      const entryDir = Neo.OPPOSITE_DIRECTION[move.dir] || 'n';
      const point = getDoorEntryPoint(entryDir, move.enemy.r);
      move.enemy.x = point.x;
      move.enemy.y = point.y;
      move.enemy.vx = 0;
      move.enemy.vy = 0;
      targetRoom.enemies.push(move.enemy);
      if (targetRoom === Neo.currentRoom) enteredCurrentRoom += 1;
    }

    if (enteredCurrentRoom > 0) {
      Neo.enemies = Neo.currentRoom.enemies;
      Neo.spawnParticle({
        x: Neo.ROOM_W / 2,
        y: Neo.ROOM_H / 2 - 34,
        life: 1.4,
        text: enteredCurrentRoom > 1 ? `${enteredCurrentRoom} MONSTERS ROAMED IN` : 'A MONSTER ROAMED IN',
        c: '#ffbf7a',
      });
    }
    Neo.scheduleRunSave();
  }

  function stealFromRoom(rival, room) {
    if (!room || !Array.isArray(room.pickups) || room.pickups.length === 0) return;
    const stealable = room.pickups.filter(p => p.type === 'item' || p.type === 'coin' || p.type === 'potion');
    if (stealable.length === 0) return;
    const idx = Math.floor(Neo.nextRandom('encounter') * stealable.length);
    const stolen = stealable[idx];
    const roomIdx = room.pickups.indexOf(stolen);
    if (roomIdx < 0) return;
    room.pickups.splice(roomIdx, 1);
    rival.loot.push({ type: stolen.type, key: stolen.key, value: stolen.value });
    if (rival.memory) {
      rival.memory.stolenCount += 1;
      rival.memory.threat += 0.12;
    }
    awardRivalXp(rival, stolen.type === 'item' ? 10 : 6, 'loot');
    if (room === Neo.currentRoom) {
      const liveIdx = Neo.pickups.indexOf(stolen);
      if (liveIdx >= 0) Neo.pickups.splice(liveIdx, 1);
      Neo.spawnParticle({ x: stolen.x || Neo.ROOM_W / 2, y: (stolen.y || Neo.ROOM_H / 2) - 16, life: 1.6, text: `${rival.name} STOLE THIS!`, c: rival.color });
    }
  }

  function injectRivalToCurrentRoom(rival) {
    if (!Neo.currentRoom) return;
    if (Neo.enemies.some(e => e.type === 'rival' && e.rivalData === rival)) return;
    const sp = Neo.findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2, rival.r) || { x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 };
    const entry = {
      type: 'rival',
      rivalData: rival,
      rivalKey: rival.characterKey,
      x: sp.x, y: sp.y,
      vx: 0, vy: 0,
      r: rival.r,
      hp: rival.hp,
      max: rival.max,
      dmg: rival.dmg,
      speed: rival.speed,
      attackCd: 0.5 + Neo.nextRandom('encounter') * 0.6,
      stun: 0, inv: 0,
      elite: false,
      bleedImmune: false, fireImmune: false, poisonImmune: false, dark_drainImmune: false,
      statuses: Neo.createStatusMap(),
      barrier: 0,
      beamTime: 0, beamTick: 0, beamAngle: 0,
      dashTime: 0, dashAngle: 0, dashHit: false,
      swingTime: 0, windup: 0,
      summonCd: 0, supportCd: 0,
      bossSpawnTimer: 0, bossSpawnWarnAt: 0,
      aoeTime: 0, phase: 1,
      splitReady: false, spawnedFromBulk: false,
      state: 'idle',
    };
    Neo.enemies.push(entry);
    Neo.spawnParticle({ x: entry.x, y: entry.y - 26, life: 1.8, text: `${rival.name.toUpperCase()} ENTERS!`, c: rival.color });
    const playedCutscene = tryPlayPrincessKnightCutscene(rival, entry);
    if (!playedCutscene) {
      Neo.sayAtPosition(entry.x, entry.y, rival.enterLine, { speaker: rival.name, tone: 'boss', holdTime: 1.8, offsetY: rival.r + 36 });
    }
  }

  function injectRivalsToCurrentRoom() {
    if (!Neo.currentRoom) return;
    Neo.rivals.forEach(rival => {
      if (!rival.dead && rival.roomGx === Neo.currentRoom.gx && rival.roomGy === Neo.currentRoom.gy) {
        injectRivalToCurrentRoom(rival);
      }
    });
  }

  function updateRivals(dt) {
    if (!Neo.currentRoom) return;
    for (let i = Neo.rivals.length - 1; i >= 0; i--) {
      const rival = Neo.rivals[i];
      if (rival.dead) { Neo.rivals.splice(i, 1); continue; }

      rival.growthTick = Number(rival.growthTick || 0) + dt;
      while (rival.growthTick >= Neo.RIVAL_GROWTH_TICK_SECONDS) {
        rival.growthTick -= Neo.RIVAL_GROWTH_TICK_SECONDS;
        awardRivalXp(rival, Neo.RIVAL_XP_PER_GROWTH_TICK + Neo.floor * 0.5, 'time');
      }

      // Sync hp from live enemy if they're in the current room
      const liveEnemy = Neo.enemies.find(e => e.type === 'rival' && e.rivalData === rival);
      if (liveEnemy) {
        rival.hp = liveEnemy.hp;
        const prevSnapshot = rival.hpSnapshot;
        rival.hpSnapshot = liveEnemy.hp;
        if (liveEnemy.hp < prevSnapshot) {
          if (rival.memory) {
            rival.memory.playerHitsTaken += 1;
            rival.memory.threat += 0.34;
          }
          rival.aggroTimer = Math.max(rival.aggroTimer, 12 + Math.min(8, Number(rival.memory?.threat || 0)));
          rival.lastKnownPlayerGx = Neo.currentRoom.gx;
          rival.lastKnownPlayerGy = Neo.currentRoom.gy;
          awardRivalXp(rival, 9, 'combat');
        }
      }
      if (rival.memory) {
        rival.memory.threat = Math.max(0, rival.memory.threat - dt * 0.03);
      }
      rival.aggroTimer = Math.max(0, rival.aggroTimer - dt);
      rival.moveTimer -= dt;
      if (rival.moveTimer <= 0) {
        rival.moveTimer = rival.moveInterval;
        const fromRoom = getRoomByCoords(rival.roomGx, rival.roomGy);
        if (!fromRoom) continue;
        const wasInCurrentRoom = fromRoom === Neo.currentRoom;
        let goalRoom = null;

        if (rival.aggroTimer > 0) {
          rival.objectiveKind = 'hunt';
          goalRoom = getRoomByCoords(rival.lastKnownPlayerGx, rival.lastKnownPlayerGy) || Neo.currentRoom;
        } else {
          const objectiveRoom = getRoomByCoords(rival.objectiveGx, rival.objectiveGy);
          if (!objectiveRoom || objectiveRoom === fromRoom || rival.route.length === 0) {
            goalRoom = chooseRivalObjectiveRoom(rival, fromRoom);
            rival.objectiveKind = hasStealableLoot(goalRoom) ? 'loot' : 'patrol';
            rival.objectiveGx = goalRoom.gx;
            rival.objectiveGy = goalRoom.gy;
            rival.route = buildRivalRoute(fromRoom, goalRoom);
          }
        }

        let nextRoom = null;
        if (goalRoom && goalRoom !== fromRoom && rival.route.length === 0) {
          rival.route = buildRivalRoute(fromRoom, goalRoom);
        }
        const stepDir = rival.route.shift();
        if (stepDir) {
          nextRoom = getConnectedRoom(fromRoom, stepDir);
        }
        if (!nextRoom) {
          const fallback = chooseFallbackNeighbor(fromRoom);
          nextRoom = fallback?.next || null;
          rival.route = [];
        }
        if (!nextRoom) continue;

        stealFromRoom(rival, nextRoom);
        rival.roomGx = nextRoom.gx;
        rival.roomGy = nextRoom.gy;
        if (rival.memory) {
          rival.memory.roomsVisited += 1;
        }

        if (nextRoom === Neo.currentRoom) {
          if (rival.memory) {
            rival.memory.playerSightings += 1;
            rival.memory.lastSeenTime = Number(Neo.gameElapsedTime || 0);
            rival.memory.threat += 0.6;
          }
          rival.aggroTimer = Math.max(rival.aggroTimer, 8 + Math.min(7, Number(rival.memory?.threat || 0)));
          rival.lastKnownPlayerGx = Neo.currentRoom.gx;
          rival.lastKnownPlayerGy = Neo.currentRoom.gy;
          awardRivalXp(rival, 7, 'sighting');
          injectRivalToCurrentRoom(rival);
        }

        if (nextRoom.gx === rival.objectiveGx && nextRoom.gy === rival.objectiveGy) {
          rival.route = [];
        }

        if (wasInCurrentRoom && nextRoom !== Neo.currentRoom && liveEnemy) {
          const idx = Neo.enemies.indexOf(liveEnemy);
          if (idx >= 0) Neo.enemies.splice(idx, 1);
          const fleeText = rival.objectiveKind === 'hunt' ? `${rival.name} REPOSITIONED` : `${rival.name} MOVED`;
          Neo.spawnParticle({ x: liveEnemy.x, y: liveEnemy.y - 16, life: 1.4, text: fleeText, c: rival.color });
          rival.hp = liveEnemy.hp; // preserve hp
        }
      }
    }
  }

  function updateRivalEnemy(enemy, dt) {
    const rival = enemy.rivalData;
    if (!rival) return;
    const weapons = Array.isArray(rival.weapons) && rival.weapons.length
      ? rival.weapons
      : (Neo.RIVAL_WEAPON_LOADOUTS[rival.characterKey] || []);
    if (weapons.length === 0) return;

    enemy.rivalWeaponIndex = Math.max(0, Math.min(weapons.length - 1, Number(enemy.rivalWeaponIndex || 0)));
    enemy.rivalWeaponSwapCd = Math.max(0, Number(enemy.rivalWeaponSwapCd || 0) - dt);
    enemy.rivalStrafeDir = enemy.rivalStrafeDir || (Neo.nextRandom('encounter') < 0.5 ? -1 : 1);
    enemy.rivalStrafeFlipCd = Math.max(0, Number(enemy.rivalStrafeFlipCd || 0) - dt);
    if (enemy.rivalStrafeFlipCd <= 0) {
      enemy.rivalStrafeFlipCd = 1.1 + Neo.nextRandom('encounter') * 1.8;
      if (Neo.nextRandom('encounter') < 0.35) enemy.rivalStrafeDir *= -1;
    }
    if (enemy.rivalWeaponSwapCd <= 0 && weapons.length > 1) {
      enemy.rivalWeaponIndex = (enemy.rivalWeaponIndex + 1) % weapons.length;
      enemy.rivalWeaponSwapCd = Neo.RIVAL_WEAPON_SWAP_BASE + Neo.nextRandom('encounter') * 1.6;
    }
    const weapon = weapons[enemy.rivalWeaponIndex] || weapons[0];

    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 620;
      enemy.vy = Math.sin(enemy.dashAngle) * 620;
      if (!enemy.dashHit && distance < enemy.r + Neo.player.r + 8) {
        enemy.dashHit = true;
        const dashDamage = Math.round(enemy.dmg * Number(weapon.damageMult || 1));
        Neo.damagePlayer(dashDamage, enemy.dashAngle, Number(weapon.knockback || 340), rival.name);
      }
      if (enemy.dashTime <= 0) {
        enemy.attackCd = Math.max(0.32, rival.attackCd * Number(weapon.cooldownMult || 1));
      }
      return;
    }

    if (enemy.stun > 0) { enemy.vx *= 0.88; enemy.vy *= 0.88; return; }

    const attackStyle = weapon.class || rival.attackStyle;
    const preferDist = Number(weapon.preferredRange || (attackStyle === 'ranged' || attackStyle === 'burst' ? 220 : 120));

    // Movement
    if (attackStyle === 'ranged' || attackStyle === 'burst') {
      const shouldSeekCover = enemy.hp < enemy.max * 0.65
        || enemy.attackCd > 0.25
        || distance < preferDist * 0.82;
      if (shouldSeekCover && Neo.trySteerEnemyToCover(enemy, dt, preferDist, 4.2)) {
        // Hold cover and only peek out when an attack window opens.
      } else 
      // Keep preferred distance
      if (distance < preferDist - 30) {
        Neo.steerEnemy(enemy, -(dx / distance), -(dy / distance), enemy.speed, 4.2, dt);
      } else if (distance > preferDist + 60) {
        Neo.steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.2, dt);
      } else {
        // Strafe sideways
        const perp = Math.atan2(dy, dx) + Math.PI / 2 * enemy.rivalStrafeDir;
        Neo.steerEnemy(enemy, Math.cos(perp) * 0.8, Math.sin(perp) * 0.8, enemy.speed * 0.6, 3.0, dt);
      }
    } else if (attackStyle === 'dash') {
      const preferred = distance > preferDist ? 1 : distance < 110 ? -1 : 0.2;
      Neo.steerEnemy(enemy, dx / distance * preferred, dy / distance * preferred, enemy.speed, 4.6, dt);
    } else {
      Neo.steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
    }

    if (enemy.attackCd > 0) return;

    if (attackStyle === 'melee' || attackStyle === 'melee_heal') {
      if (distance < enemy.r + Neo.player.r + Number(weapon.range || 12)) {
        const angle = Math.atan2(dy, dx);
        const meleeDamage = Math.round(enemy.dmg * Number(weapon.damageMult || 1));
        Neo.damagePlayer(meleeDamage, angle, Number(weapon.knockback || 280), rival.name);
        if (rival.memory) {
          rival.memory.playerHitsDealt += 1;
          rival.memory.threat += 0.2;
        }
        enemy.attackCd = rival.attackCd * Number(weapon.cooldownMult || 1) + Neo.nextRandom('encounter') * 0.4;
        enemy.swingTime = 0.22;
        // Heal on hit for gelleh-style
        if (attackStyle === 'melee_heal' && Neo.nextRandom('encounter') < 0.25) {
          const heal = Math.round(enemy.max * 0.06);
          enemy.hp = Math.min(enemy.max, enemy.hp + heal);
          rival.hp = enemy.hp;
          Neo.spawnParticle({ x: enemy.x, y: enemy.y - 18, life: 0.7, text: `+${heal}`, c: '#a8aaff' });
        }
      }
    } else if (attackStyle === 'dash') {
      if (distance < Number(weapon.range || 230) && distance > 85) {
        enemy.dashAngle = Math.atan2(dy, dx);
        enemy.dashTime = 0.24;
        enemy.dashHit = false;
        enemy.attackCd = rival.attackCd * Number(weapon.cooldownMult || 1) + 0.35;
      }
    } else if (attackStyle === 'ranged' || attackStyle === 'burst') {
      if (distance < Number(weapon.range || 320)) {
        if (attackStyle === 'ranged' && !Neo.hasLineOfSight(enemy.x, enemy.y, Neo.player.x, Neo.player.y)) {
          enemy.attackCd = 0.2;
          return;
        }
        const angle = Math.atan2(dy, dx);
        const shotCount = Math.max(1, Number(weapon.projectileCount || 1));
        const spread = Number(weapon.spread || 0.2);
        for (let shot = 0; shot < shotCount; shot += 1) {
          const offset = shotCount === 1 ? 0 : (shot / (shotCount - 1)) * 2 - 1;
          const a = angle + offset * spread;
          Neo.spawnProjectile({
            x: enemy.x, y: enemy.y,
            vx: Math.cos(a) * Number(weapon.projectileSpeed || 310), vy: Math.sin(a) * Number(weapon.projectileSpeed || 310),
            r: attackStyle === 'burst' ? 4 : 5,
            life: attackStyle === 'burst' ? 1.0 : 1.1,
            damage: Math.round(enemy.dmg * Number(weapon.damageMult || 1)),
            kind: weapon.key || 'rival_shot', color: rival.color,
            knockback: 160, pierceCount: 0, hitOptions: null,
            enemy: true,
            fromRival: true,
            source: rival.name || 'rival_projectile',
          });
        }
        enemy.attackCd = rival.attackCd * Number(weapon.cooldownMult || 1) + Neo.nextRandom('encounter') * 0.5;
      }
    }
  }

  // ── End Rival System ────────────────────────────────────────────────────────

  // Expose on Neo
  Neo.generateFloor = generateFloor;
  Neo.decorateRoomData = decorateRoomData;
  Neo.decorateRoomStructures = decorateRoomStructures;
  Neo.decorateGardenRoomData = decorateGardenRoomData;
  Neo.ensureGardenRoomData = ensureGardenRoomData;
  Neo.spawnGardenFruit = spawnGardenFruit;
  Neo.updateGardenGrowth = updateGardenGrowth;
  Neo.randomMoatLanePosition = randomMoatLanePosition;
  Neo.createMoatLavaHazard = createMoatLavaHazard;
  Neo.createCornerMoatLavaHazards = createCornerMoatLavaHazards;
  Neo.createCompanionMoatLava = createCompanionMoatLava;
  Neo.createExplosiveTrapHazard = createExplosiveTrapHazard;
  Neo.createRoomRecord = createRoomRecord;
  Neo.findRoomAt = findRoomAt;
  Neo.getConnectedRoom = getConnectedRoom;
  Neo.hasRoomExit = hasRoomExit;
  Neo.hasVisibleRoomExit = hasVisibleRoomExit;
  Neo.setSecretPassageOpen = setSecretPassageOpen;
  Neo.createSecretWall = createSecretWall;
  Neo.createSecretVendorOffer = createSecretVendorOffer;
  Neo.assignSecretRoom = assignSecretRoom;
  Neo.findFarthestRoom = findFarthestRoom;
  Neo.syncCurrentRoomState = syncCurrentRoomState;
  Neo.findSafeSpawnPoint = findSafeSpawnPoint;
  Neo.isLockedFightRoom = isLockedFightRoom;
  Neo.clearPlayerTransientDefense = clearPlayerTransientDefense;
  Neo.tickPlayerTransientDefenseTimers = tickPlayerTransientDefenseTimers;
  Neo.isBossFightActive = isBossFightActive;
  Neo.enterRoom = enterRoom;
  Neo.ensureShopHasMinimumItemOffers = ensureShopHasMinimumItemOffers;
  Neo.createSeededItemChoices = createSeededItemChoices;
  Neo.getBossRewardPickCount = getBossRewardPickCount;
  Neo.ensureShopTradeOffer = ensureShopTradeOffer;
  Neo.rollScrollOfControl = rollScrollOfControl;
  Neo.ensureShopScrollOffer = ensureShopScrollOffer;
  Neo.createDefaultRivalMemory = createDefaultRivalMemory;
  Neo.normalizeRivalMemory = normalizeRivalMemory;
  Neo.tryPlayPrincessKnightCutscene = tryPlayPrincessKnightCutscene;
  Neo.getRivalById = getRivalById;
  Neo.applyRivalLevelStats = applyRivalLevelStats;
  Neo.migrateRivalState = migrateRivalState;
  Neo.awardRivalXp = awardRivalXp;
  Neo.restoreRivals = restoreRivals;
  Neo.spawnRivals = spawnRivals;
  Neo.getRoomByCoords = getRoomByCoords;
  Neo.hasStealableLoot = hasStealableLoot;
  Neo.buildRivalRoute = buildRivalRoute;
  Neo.chooseRivalObjectiveRoom = chooseRivalObjectiveRoom;
  Neo.chooseFallbackNeighbor = chooseFallbackNeighbor;
  Neo.isMonsterDoorRoamEligible = isMonsterDoorRoamEligible;
  Neo.getDoorEntryPoint = getDoorEntryPoint;
  Neo.updateMonsterDoorRoaming = updateMonsterDoorRoaming;
  Neo.stealFromRoom = stealFromRoom;
  Neo.injectRivalToCurrentRoom = injectRivalToCurrentRoom;
  Neo.injectRivalsToCurrentRoom = injectRivalsToCurrentRoom;
  Neo.updateRivals = updateRivals;
  Neo.updateRivalEnemy = updateRivalEnemy;
