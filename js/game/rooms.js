
  function generateFloor() {
    syncSeedState();
    resetRngStreams();
    rooms = [];

    const grid = Array.from({ length: 9 }, () => Array(9).fill(null));
    const positions = [];
    const start = { x: 4, y: 4 };
    grid[start.y][start.x] = true;
    positions.push(start);

    const target = 8 + Math.floor(nextRandom('world') * 3) + Math.min(2, floor >> 2);
    while (positions.length < target) {
      const seed = positions[irand(0, positions.length - 1, 'world')];
      const dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], 'world');
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
    } else if (floor > MAX_FLOOR) {
      farRoom.type = floor % 3 === 0 ? 'boss' : 'ladder';
    } else if (floor % 3 === 0) {
      farRoom.type = 'boss';
    } else {
      farRoom.type = 'ladder';
    }

    const pool = rooms.filter(room => room !== startRoom && room !== farRoom);
    shuffle(pool, 'world');
    const treasureCount = Math.min(3, 1 + Math.floor(nextRandom('world') * 3));
    for (let index = 0; index < treasureCount; index += 1) {
      if (pool[index]) pool[index].type = 'treasure';
    }
    const shopCandidate = pool.find(room => room.type === 'combat');
    if (shopCandidate && nextRandom('world') < 0.7) shopCandidate.type = 'shop';
    const challengeCandidate = pool.find(room => room.type === 'combat');
    if (challengeCandidate && floor >= 2 && floor < MAX_FLOOR && nextRandom('world') < 0.42) challengeCandidate.type = 'challenge';
    const anvilCandidate = pool.find(room => room.type === 'combat');
    if (anvilCandidate && nextRandom('world') < 0.55) anvilCandidate.type = 'anvil';
    assignSecretRoom(roomMap);
    rooms.forEach(decorateRoomData);

    player.x = START_X;
    player.y = START_Y;
    spawnRivals();
    gameEvents.emit('floor:enter', { floor });
    enterRoom(startRoom);
    updateObjective();
    updateHud();
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
      room.cleared = true;
      room.decorations.push(
        { kind: 'banner', x: ROOM_W / 2 - 110, y: ROOM_H / 2 - 92, r: 14 },
        { kind: 'banner', x: ROOM_W / 2 + 110, y: ROOM_H / 2 - 92, r: 14 },
        { kind: 'crack', x: ROOM_W / 2, y: ROOM_H / 2 + 118, r: 32 },
      );
      if (room.secretKind === 'warp') {
        const deltaPool = floor <= 2 ? [1, 2] : floor >= MAX_FLOOR - 1 ? [-2, -1] : [-2, -1, 1, 2];
        const delta = deltaPool[irand(0, deltaPool.length - 1, 'world')];
        room.pickups.push({
          x: ROOM_W / 2,
          y: ROOM_H / 2,
          type: 'secretWarp',
          delta,
          targetFloor: clamp(floor + delta, 1, MAX_FLOOR),
        });
      } else {
        const regularOffers = shuffle(['relic', 'vitality', 'wealth'], 'world');
        const offerPool = shuffle(['xp', regularOffers[0], regularOffers[1]], 'world');
        room.pickups.push(createSecretVendorOffer(offerPool[0], ROOM_W / 2 - 110, ROOM_H / 2 + 26, room, 0));
        room.pickups.push(createSecretVendorOffer(offerPool[1], ROOM_W / 2, ROOM_H / 2 - 18, room, 1));
        room.pickups.push(createSecretVendorOffer(offerPool[2], ROOM_W / 2 + 110, ROOM_H / 2 + 26, room, 2));
      }
      return;
    }

    // Boss and god rooms need an open arena — structures block projectiles and beams
    if (room.type !== 'god' && room.type !== 'boss') {
      decorateRoomStructures(room);
    }

    const potCount = room.type === 'shop' ? 1 : (room.type === 'challenge' || room.type === 'anvil') ? 0 : irand(1, 3, 'world');
    for (let index = 0; index < potCount; index += 1) {
      room.destructibles.push({
        kind: 'pot',
        x: 150 + rand(ROOM_W - 300, 0, 'world'),
        y: 120 + rand(ROOM_H - 240, 0, 'world'),
        r: 12,
        hp: 1,
        broken: false,
      });
    }

    if (nextRandom('world') < 0.45 && room.type !== 'shop' && room.type !== 'challenge' && room.type !== 'anvil') {
      room.destructibles.push({
        kind: 'barrel',
        x: 180 + rand(ROOM_W - 360, 0, 'world'),
        y: 140 + rand(ROOM_H - 280, 0, 'world'),
        r: 20,
        hp: 1,
        broken: false,
      });
    }

    if (nextRandom('world') < 0.4 && room.type !== 'god' && room.type !== 'challenge' && room.type !== 'anvil') {
      const primaryLava = createMoatLavaHazard();
      room.hazards.push(primaryLava);
      if (nextRandom('world') < 0.35) {
        room.hazards.push(createCompanionMoatLava(primaryLava));
      }
    }

    if ((room.type === 'combat' || room.type === 'boss') && nextRandom('world') < (room.type === 'boss' ? 0.45 : 0.32)) {
      const trapCount = room.type === 'boss' ? 2 : (nextRandom('world') < 0.45 ? 2 : 1);
      for (let index = 0; index < trapCount; index += 1) {
        const trap = createExplosiveTrapHazard(room, index);
        if (trap) room.hazards.push(trap);
      }
    }

    if (nextRandom('world') < 0.3 && room.type !== 'shop' && room.type !== 'god' && room.type !== 'challenge') {
      const wallX = nextRandom('world') < 0.5 ? 76 : ROOM_W - 76;
      const hiddenX = wallX < ROOM_W / 2 ? 48 : ROOM_W - 48;
      room.destructibles.push({
        kind: 'wall',
        x: wallX,
        y: ROOM_H / 2 + rand(120, -120, 'world'),
        r: 26,
        hp: 2,
        broken: false,
      });
      room.destructibles.push({
        kind: 'pot',
        x: hiddenX,
        y: ROOM_H / 2 + rand(140, -140, 'world'),
        r: 12,
        hp: 1,
        broken: false,
        hidden: true,
      });
    }

    Object.entries(room.secretPassages || {}).forEach(([dir, passage]) => {
      const targetRoom = findRoomAt(passage.targetGx, passage.targetGy);
      const wall = createSecretWall(dir, targetRoom);
      if (wall) room.destructibles.push(wall);
    });

    if (room.type === 'shop') {
      room.shopOffers = [
        { type: 'potion', cost: getShopPotionCost(), x: ROOM_W / 2, y: ROOM_H / 2 + 88, bought: false },
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
      room.challengeType = rollChallengeTrialType();
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
      const reinforced = nextRandom('world') < 0.24;
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
      const edgeInset = WALL + 52;
      const pocketInset = DOOR / 2 + 48;
      const addTorch = (x, y) => {
        room.decorations.push({ kind: 'torch', x, y, r: 12 });
      };
      if (room.doors.n) {
        addWall(ROOM_W / 2 - pocketInset, edgeInset, 28, 56);
        addWall(ROOM_W / 2 + pocketInset, edgeInset, 28, 56);
        room.decorations.push(
          { kind: 'banner', x: ROOM_W / 2 - pocketInset, y: edgeInset - 42, r: 12 },
          { kind: 'banner', x: ROOM_W / 2 + pocketInset, y: edgeInset - 42, r: 12 },
        );
        addTorch(ROOM_W / 2 - pocketInset - 26, edgeInset - 4);
        addTorch(ROOM_W / 2 + pocketInset + 26, edgeInset - 4);
      }
      if (room.doors.s) {
        addWall(ROOM_W / 2 - pocketInset, ROOM_H - edgeInset, 28, 56);
        addWall(ROOM_W / 2 + pocketInset, ROOM_H - edgeInset, 28, 56);
        room.decorations.push({ kind: 'crack', x: ROOM_W / 2, y: ROOM_H - edgeInset + 34, r: 22 });
        addTorch(ROOM_W / 2 - pocketInset - 26, ROOM_H - edgeInset + 4);
        addTorch(ROOM_W / 2 + pocketInset + 26, ROOM_H - edgeInset + 4);
      }
      if (room.doors.w) {
        addWall(edgeInset, ROOM_H / 2 - pocketInset, 56, 28);
        addWall(edgeInset, ROOM_H / 2 + pocketInset, 56, 28);
        room.decorations.push({ kind: 'brazier', x: edgeInset + 28, y: ROOM_H / 2, r: 14 });
        addTorch(edgeInset - 6, ROOM_H / 2 - pocketInset - 28);
        addTorch(edgeInset - 6, ROOM_H / 2 + pocketInset + 28);
      }
      if (room.doors.e) {
        addWall(ROOM_W - edgeInset, ROOM_H / 2 - pocketInset, 56, 28);
        addWall(ROOM_W - edgeInset, ROOM_H / 2 + pocketInset, 56, 28);
        room.decorations.push({ kind: 'brazier', x: ROOM_W - edgeInset - 28, y: ROOM_H / 2, r: 14 });
        addTorch(ROOM_W - edgeInset + 6, ROOM_H / 2 - pocketInset - 28);
        addTorch(ROOM_W - edgeInset + 6, ROOM_H / 2 + pocketInset + 28);
      }
    };
    const pickCombatArchetype = () => {
      const pool = ['pillar_ring', 'split_cross', 'side_lanes', 'gate_room', 'broken_halls'];
      return pool[irand(0, pool.length - 1, 'world')];
    };
    const pickBossArchetype = () => {
      const pool = ['boss_buttresses', 'boss_crossfire', 'boss_processional'];
      return pool[irand(0, pool.length - 1, 'world')];
    };

    room.layoutArchetype = room.type === 'boss' ? pickBossArchetype() : pickCombatArchetype();
    room.layoutChambers = [];
    addDoorFrames();

    if (room.layoutArchetype === 'pillar_ring') {
      addPillar(ROOM_W / 2 - 150, ROOM_H / 2 - 104, 36);
      addPillar(ROOM_W / 2 + 150, ROOM_H / 2 - 104, 36);
      addPillar(ROOM_W / 2 - 150, ROOM_H / 2 + 104, 36);
      addPillar(ROOM_W / 2 + 150, ROOM_H / 2 + 104, 36);
      addPillar(ROOM_W / 2, ROOM_H / 2 - 138, 28);
      addPillar(ROOM_W / 2, ROOM_H / 2 + 138, 28);
      room.decorations.push(
        { kind: 'rubble', x: ROOM_W / 2 - 54, y: ROOM_H / 2, r: 24 },
        { kind: 'rubble', x: ROOM_W / 2 + 54, y: ROOM_H / 2, r: 24 },
      );
      setChambers({ x: ROOM_W / 2, y: ROOM_H / 2, w: ROOM_W - 240, h: ROOM_H - 220 });
      return;
    }

    if (room.layoutArchetype === 'split_cross') {
      addWall(ROOM_W / 2, ROOM_H / 2 - 136, 74, 92);
      addWall(ROOM_W / 2, ROOM_H / 2 + 136, 74, 92);
      addWall(ROOM_W / 2 - 182, ROOM_H / 2, 94, 58);
      addWall(ROOM_W / 2 + 182, ROOM_H / 2, 94, 58);
      room.decorations.push(
        { kind: 'brazier', x: ROOM_W / 2 - 102, y: ROOM_H / 2 - 84, r: 16 },
        { kind: 'brazier', x: ROOM_W / 2 + 102, y: ROOM_H / 2 + 84, r: 16 },
        { kind: 'crack', x: ROOM_W / 2, y: ROOM_H / 2, r: 28 },
      );
      setChambers(
        { x: ROOM_W / 2, y: ROOM_H / 2 - 150, w: 240, h: 150 },
        { x: ROOM_W / 2, y: ROOM_H / 2 + 150, w: 240, h: 150 },
        { x: ROOM_W / 2 - 210, y: ROOM_H / 2, w: 180, h: 180 },
        { x: ROOM_W / 2 + 210, y: ROOM_H / 2, w: 180, h: 180 },
      );
      return;
    }

    if (room.layoutArchetype === 'side_lanes') {
      addWall(ROOM_W / 2, ROOM_H / 2 - 124, 228, 46);
      addWall(ROOM_W / 2, ROOM_H / 2 + 124, 228, 46);
      addPillar(ROOM_W / 2 - 242, ROOM_H / 2, 30);
      addPillar(ROOM_W / 2 + 242, ROOM_H / 2, 30);
      room.decorations.push(
        { kind: 'banner', x: ROOM_W / 2 - 188, y: ROOM_H / 2 - 166, r: 14 },
        { kind: 'banner', x: ROOM_W / 2 + 188, y: ROOM_H / 2 + 166, r: 14 },
      );
      setChambers(
        { x: ROOM_W / 2 - 238, y: ROOM_H / 2, w: 170, h: ROOM_H - 220 },
        { x: ROOM_W / 2 + 238, y: ROOM_H / 2, w: 170, h: ROOM_H - 220 },
        { x: ROOM_W / 2, y: ROOM_H / 2, w: 220, h: 180 },
      );
      return;
    }

    if (room.layoutArchetype === 'gate_room') {
      addWall(ROOM_W / 2 - 172, ROOM_H / 2 - 38, 108, 52);
      addWall(ROOM_W / 2 + 172, ROOM_H / 2 - 38, 108, 52);
      addWall(ROOM_W / 2, ROOM_H / 2 + 148, 86, 82);
      addPillar(ROOM_W / 2 - 62, ROOM_H / 2 + 34, 28);
      addPillar(ROOM_W / 2 + 62, ROOM_H / 2 + 34, 28);
      room.decorations.push(
        { kind: 'brazier', x: ROOM_W / 2 - 130, y: ROOM_H / 2 + 112, r: 15 },
        { kind: 'brazier', x: ROOM_W / 2 + 130, y: ROOM_H / 2 + 112, r: 15 },
        { kind: 'crack', x: ROOM_W / 2, y: ROOM_H / 2 - 104, r: 32 },
      );
      setChambers(
        { x: ROOM_W / 2, y: ROOM_H / 2 - 146, w: ROOM_W - 300, h: 150 },
        { x: ROOM_W / 2 - 200, y: ROOM_H / 2 + 40, w: 180, h: 220 },
        { x: ROOM_W / 2 + 200, y: ROOM_H / 2 + 40, w: 180, h: 220 },
      );
      return;
    }

    if (room.layoutArchetype === 'broken_halls') {
      addWall(ROOM_W / 2 - 96, ROOM_H / 2 - 150, 84, 74);
      addWall(ROOM_W / 2 + 118, ROOM_H / 2 - 36, 104, 54);
      addWall(ROOM_W / 2 - 148, ROOM_H / 2 + 112, 122, 46);
      addPillar(ROOM_W / 2 + 186, ROOM_H / 2 + 138, 32);
      room.decorations.push(
        { kind: 'rubble', x: ROOM_W / 2 - 20, y: ROOM_H / 2 + 10, r: 26 },
        { kind: 'crack', x: ROOM_W / 2 + 132, y: ROOM_H / 2 - 132, r: 28 },
        { kind: 'banner', x: ROOM_W / 2 - 170, y: ROOM_H / 2 - 180, r: 12 },
      );
      setChambers(
        { x: ROOM_W / 2 - 150, y: ROOM_H / 2 - 118, w: 240, h: 170 },
        { x: ROOM_W / 2 + 172, y: ROOM_H / 2 - 8, w: 200, h: 180 },
        { x: ROOM_W / 2 - 36, y: ROOM_H / 2 + 170, w: 320, h: 130 },
      );
      return;
    }

    if (room.layoutArchetype === 'boss_buttresses') {
      addWall(ROOM_W / 2 - 220, ROOM_H / 2, 64, 184);
      addWall(ROOM_W / 2 + 220, ROOM_H / 2, 64, 184);
      addPillar(ROOM_W / 2 - 84, ROOM_H / 2 - 126, 30);
      addPillar(ROOM_W / 2 + 84, ROOM_H / 2 - 126, 30);
      room.decorations.push(
        { kind: 'brazier', x: ROOM_W / 2 - 220, y: ROOM_H / 2 - 136, r: 17 },
        { kind: 'brazier', x: ROOM_W / 2 + 220, y: ROOM_H / 2 - 136, r: 17 },
      );
      setChambers({ x: ROOM_W / 2, y: ROOM_H / 2, w: ROOM_W - 220, h: ROOM_H - 170 });
      return;
    }

    if (room.layoutArchetype === 'boss_crossfire') {
      addWall(ROOM_W / 2, ROOM_H / 2 - 162, 68, 70);
      addWall(ROOM_W / 2, ROOM_H / 2 + 162, 68, 70);
      addPillar(ROOM_W / 2 - 188, ROOM_H / 2, 34);
      addPillar(ROOM_W / 2 + 188, ROOM_H / 2, 34);
      room.decorations.push(
        { kind: 'crack', x: ROOM_W / 2 - 128, y: ROOM_H / 2, r: 26 },
        { kind: 'crack', x: ROOM_W / 2 + 128, y: ROOM_H / 2, r: 26 },
      );
      setChambers({ x: ROOM_W / 2, y: ROOM_H / 2, w: ROOM_W - 240, h: ROOM_H - 210 });
      return;
    }

    addWall(ROOM_W / 2 - 160, ROOM_H / 2 + 118, 116, 46);
    addWall(ROOM_W / 2 + 160, ROOM_H / 2 + 118, 116, 46);
    addPillar(ROOM_W / 2 - 74, ROOM_H / 2 - 64, 32);
    addPillar(ROOM_W / 2 + 74, ROOM_H / 2 - 64, 32);
    room.decorations.push(
      { kind: 'banner', x: ROOM_W / 2, y: ROOM_H / 2 - 186, r: 14 },
      { kind: 'brazier', x: ROOM_W / 2 - 148, y: ROOM_H / 2 - 10, r: 16 },
      { kind: 'brazier', x: ROOM_W / 2 + 148, y: ROOM_H / 2 - 10, r: 16 },
    );
    setChambers(
      { x: ROOM_W / 2, y: ROOM_H / 2 - 96, w: ROOM_W - 260, h: 180 },
      { x: ROOM_W / 2, y: ROOM_H / 2 + 176, w: ROOM_W - 220, h: 140 },
    );
  }

  function decorateGardenRoomData(room) {
    if (!room || room.type === 'boss' || room.type === 'god' || floor <= 5) return;
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
      const depth = 84 + nextRandom('world') * 72;
      const x = clamp(ROOM_W / 2 + side * (120 + nextRandom('world') * 180), WALL + 50, ROOM_W - WALL - 50);
      const y = clamp(ROOM_H / 2 + (nextRandom('world') < 0.5 ? -1 : 1) * depth, WALL + 62, ROOM_H - WALL - 62);
      room.decorations.push({
        kind: nextRandom('world') < 0.45 ? 'fruit_tree' : 'tree',
        x,
        y,
        r: 22 + nextRandom('world') * 10,
      });
    }

    const mossCount = Math.max(2, Math.round(5 * gardenRoomScore));
    for (let index = 0; index < mossCount; index += 1) {
      room.decorations.push({
        kind: 'moss_patch',
        x: 120 + nextRandom('world') * (ROOM_W - 240),
        y: 110 + nextRandom('world') * (ROOM_H - 220),
        r: 14 + nextRandom('world') * 22,
      });
    }

    const fruitNodeCount = Math.max(1, Math.round((room.type === 'secret' ? 3 : room.type === 'treasure' ? 2 : 1) * gardenRoomScore));
    for (let index = 0; index < fruitNodeCount; index += 1) {
      const x = 150 + nextRandom('world') * (ROOM_W - 300);
      const y = 150 + nextRandom('world') * (ROOM_H - 300);
      const node = {
        id: `${room.gx},${room.gy}:${index}`,
        x,
        y,
        heal: 18 + Math.round(nextRandom('world') * 10),
        respawnAt: gameElapsedTime + rand(6, 2, 'world') + index * 2,
        fruitSpawned: false,
      };
      room.gardenFruitNodes.push(node);
      room.decorations.push({
        kind: 'fruit_tree',
        x: clamp(x + rand(42, -42, 'world'), WALL + 46, ROOM_W - WALL - 46),
        y: clamp(y + rand(36, -36, 'world'), WALL + 52, ROOM_H - WALL - 52),
        r: 20 + nextRandom('world') * 8,
      });
    }
  }

  function ensureGardenRoomData(room) {
    if (!room || room.type === 'boss' || room.type === 'god' || floor <= 5) return;
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
      grownAt: gameElapsedTime,
      ripe: true,
    });
    node.fruitSpawned = true;
  }

  function updateGardenGrowth() {
    if (floor <= 5) return;
    if (!Array.isArray(rooms) || rooms.length === 0) return;
    rooms.forEach(room => {
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
        if (gameElapsedTime >= Number(node.respawnAt || 0)) {
          spawnGardenFruit(room, node);
        }
      });
    });
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
    if (!ranges.length) return rand(max, min, 'world');

    const [rangeMin, rangeMax] = ranges[irand(0, ranges.length - 1, 'world')];
    return rand(rangeMax, rangeMin, 'world');
  }

  function createMoatLavaHazard() {
    const r = 44 + rand(24, 0, 'world');
    const side = irand(0, 3, 'world');
    const wallOffset = WALL + r + 18 + rand(16, 0, 'world');
    const hazard = {
      kind: 'lava',
      x: ROOM_W / 2,
      y: ROOM_H / 2,
      r,
      phase: rand(Math.PI * 2, 0, 'world'),
      pulse: rand(1.8, 1.15, 'world'),
      wobble: rand(0.75, 0.45, 'world'),
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
      r: primary.r * rand(0.86, 0.68, 'world'),
      phase: primary.phase + rand(1.9, 0.6, 'world'),
      pulse: primary.pulse + rand(0.35, -0.2, 'world'),
      wobble: primary.wobble + rand(0.2, -0.15, 'world'),
      side: primary.side,
    };

    const along = (primary.r + companion.r) * rand(1.2, 0.75, 'world');
    if (primary.side <= 1) {
      companion.x = clamp(primary.x + (nextRandom('world') < 0.5 ? -along : along), companion.r + 42, ROOM_W - companion.r - 42);
      companion.y = primary.side === 0 ? WALL + companion.r + 18 : ROOM_H - WALL - companion.r - 18;
    } else {
      companion.y = clamp(primary.y + (nextRandom('world') < 0.5 ? -along : along), companion.r + 42, ROOM_H - companion.r - 42);
      companion.x = primary.side === 2 ? WALL + companion.r + 18 : ROOM_W - WALL - companion.r - 18;
    }

    return companion;
  }

  function createExplosiveTrapHazard(room, index = 0) {
    const structuresList = Array.isArray(room?.structures) ? room.structures : [];
    const destructibleList = Array.isArray(room?.destructibles) ? room.destructibles : [];
    const chambers = Array.isArray(room?.layoutChambers) && room.layoutChambers.length
      ? room.layoutChambers
      : [{ x: ROOM_W / 2, y: ROOM_H / 2, w: ROOM_W - 260, h: ROOM_H - 240 }];
    const radius = 16;
    const collides = (x, y) => {
      if (x < WALL + radius + 12 || x > ROOM_W - WALL - radius - 12) return true;
      if (y < WALL + radius + 12 || y > ROOM_H - WALL - radius - 12) return true;
      if (Math.hypot(x - START_X, y - START_Y) < 78) return true;
      if (structuresList.some(structure => circleRect(x, y, radius + 6, structure.x - structure.w / 2, structure.y - structure.h / 2, structure.w, structure.h))) return true;
      if (destructibleList.some(prop => !prop.broken && !prop.hidden && destructibleIntersectsCircle(prop, x, y, radius + 4))) return true;
      if (Array.isArray(room.hazards) && room.hazards.some(hazard => hazard?.kind === 'explosive_trap' && dist(x, y, hazard.x, hazard.y) < radius + (hazard.r || 16) + 58)) return true;
      return false;
    };

    for (let attempt = 0; attempt < 18; attempt += 1) {
      const chamber = chambers[(index + attempt) % chambers.length] || chambers[0];
      const halfW = Math.max(40, chamber.w / 2 - 28);
      const halfH = Math.max(40, chamber.h / 2 - 28);
      const x = clamp(chamber.x + rand(halfW, -halfW, 'world'), WALL + radius + 12, ROOM_W - WALL - radius - 12);
      const y = clamp(chamber.y + rand(halfH, -halfH, 'world'), WALL + radius + 12, ROOM_H - WALL - radius - 12);
      if (collides(x, y)) continue;
      return {
        kind: 'explosive_trap',
        x,
        y,
        r: radius,
        triggerRadius: 34,
        blastRadius: room.type === 'boss' ? 104 : 88,
        damage: room.type === 'boss' ? 26 + floor * 1.5 : 18 + floor * 1.2,
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
    return rooms.find(room => room.gx === gx && room.gy === gy) || null;
  }

  function getConnectedRoom(room, direction) {
    if (!room || !direction) return null;
    const secretPassage = room.secretPassages?.[direction];
    if (secretPassage?.open) {
      return findRoomAt(secretPassage.targetGx, secretPassage.targetGy);
    }
    if (!room.doors?.[direction]) return null;
    const vector = DIRECTION_VECTORS[direction];
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
    const reverse = OPPOSITE_DIRECTION[direction];
    if (targetRoom?.secretPassages?.[reverse]) {
      targetRoom.secretPassages[reverse].open = !!open;
    }
  }

  function createSecretWall(direction, targetRoom) {
    if (!targetRoom) return null;
    const position = {
      n: { x: ROOM_W / 2, y: 48 },
      s: { x: ROOM_W / 2, y: ROOM_H - 48 },
      e: { x: ROOM_W - 48, y: ROOM_H / 2 },
      w: { x: 48, y: ROOM_H / 2 },
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

  function createSecretVendorOffer(kind, x, y, room = currentRoom, index = 0) {
    if (kind === 'relic') {
      const vendorRandom = createRoomRandom(room, `secret-vendor:relic:${index}`);
      return { x, y, type: 'secretVendor', offerKind: 'relic', cost: 1, label: 'Relic', rewardKey: rollItemDrop({ elite: true, random: vendorRandom }) };
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
        cost: getSecretXpOfferCost(),
        xpValue: getSecretXpOfferAmount(),
        label: 'XP',
      };
    }
    return { x, y, type: 'secretVendor', offerKind: 'wealth', cost: 2, label: 'Wealth' };
  }

  function assignSecretRoom(roomMap) {
    const anchors = shuffle(rooms.filter(room => !room.secret && ['combat', 'treasure', 'shop', 'anvil'].includes(room.type)), 'world');
    for (const anchor of anchors) {
      const dirs = shuffle([...DIRECTIONS], 'world');
      for (const dir of dirs) {
        const vector = DIRECTION_VECTORS[dir];
        const nx = anchor.gx + vector.dx;
        const ny = anchor.gy + vector.dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        if (roomMap.get(`${nx},${ny}`)) continue;
        const secretRoom = createRoomRecord({ x: nx, y: ny }, {
          type: 'secret',
          secret: true,
          cleared: true,
          secretKind: nextRandom('world') < 0.5 ? 'warp' : 'vendor',
        });
        anchor.secretPassages[dir] = { targetGx: nx, targetGy: ny, open: false };
        secretRoom.secretPassages[OPPOSITE_DIRECTION[dir]] = { targetGx: anchor.gx, targetGy: anchor.gy, open: false };
        rooms.push(secretRoom);
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
    if (!currentRoom) return;
    currentRoom.enemies = enemies;
    currentRoom.deadBodies = deadBodies;
    currentRoom.projectiles = projectiles;
    currentRoom.chests = chests;
    currentRoom.pickups = pickups;
    currentRoom.destructibles = destructibles;
    currentRoom.hazards = hazards;
    currentRoom.shopOffers = shopOffers;
    currentRoom.shopWeaponOffers = Array.isArray(currentRoom.shopWeaponOffers) ? currentRoom.shopWeaponOffers : [];
    currentRoom.structures = structures;
    currentRoom.decorations = decorations;
  }

  function findSafeSpawnPoint() {
    const searchRadius = 120;
    const testRadius = 18;
    const angleStep = Math.PI / 8;
    const clearOfEnemies = (x, y) => enemies.every(e => Math.hypot(e.x - x, e.y - y) > e.r + testRadius + 32);

    if (!isBlocked(START_X, START_Y, testRadius) && clearOfEnemies(START_X, START_Y)) {
      return { x: START_X, y: START_Y };
    }

    for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
      for (let r = searchRadius * 0.25; r <= searchRadius; r += 20) {
        const x = START_X + Math.cos(angle) * r;
        const y = START_Y + Math.sin(angle) * r;
        if (!isBlocked(x, y, testRadius) && clearOfEnemies(x, y)) {
          return { x: clamp(x, WALL + testRadius, ROOM_W - WALL - testRadius), y: clamp(y, WALL + testRadius, ROOM_H - WALL - testRadius) };
        }
      }
    }
    
    return { x: START_X, y: START_Y };
  }

  function isLockedFightRoom(room) {
    return !!room && (room.type === 'boss' || room.type === 'god' || room.type === 'ladder' || CHALLENGE_ROOM_TYPES.has(room.type));
  }

  function clearPlayerTransientDefense() {
    if (!player) return;
    player.inv = 0;
    player.stun = 0;
    player.vx = 0;
    player.vy = 0;
    player.dashTime = 0;
    player.dashX = 0;
    player.dashY = 0;
    player.cowardsWayTime = 0;
    player.princessFlightTime = 0;
    loveBeamCasting = false;
    player.blockActive = false;
    player.blockTimer = 0;
  }

  function tickPlayerTransientDefenseTimers(dt) {
    if (!player) return;
    const step = Math.max(0, Number(dt) || 0);
    player.inv = Math.max(0, Number(player.inv || 0) - step);
    player.dashTime = Math.max(0, Number(player.dashTime || 0) - step);
    if (player.dashTime <= 0) {
      player.dashX = 0;
      player.dashY = 0;
    }
    player.cowardsWayTime = Math.max(0, Number(player.cowardsWayTime || 0) - step);
    player.princessFlightTime = Math.max(0, Number(player.princessFlightTime || 0) - step);
    player.blockTimer = Math.max(0, Number(player.blockTimer || 0) - step);
    player.blockActive = player.blockTimer > 0;
    if (player.princessFlightTime <= 0 && loveBeamCasting) {
      loveBeamCasting = false;
    }
  }

  // --- Game event handlers ---
  // room:enter  fires every time the player enters any room (including floor start)
  // floor:enter fires when a new floor is generated, before room:enter
  gameEvents.on('room:enter', ({ room }) => {
    clearPlayerTransientDefense();
    player.roomDamageTaken = 0;
    endActiveLaser();
    laserTime = 0;
    laserTick = 0;
    laserAngle = 0;
    laserSweepSpeed = 0;
    turtleWaveHpTimer = 0;
  });

  gameEvents.on('floor:enter', ({ floor: newFloor }) => {
    // floor-level resets go here; room:enter will fire immediately after for the start room
  });

  function isBossFightActive() {
    return currentRoom?.type === 'boss' || currentRoom?.type === 'god' || enemies.some(enemy => isBossType(enemy?.type));
  }

  function enterRoom(room) {
    syncCurrentRoomState();
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    currentRoom = room;
    room.explored = true;
    room.visited = true;
    enemies = room.enemies || [];
    deadBodies = room.deadBodies || [];
    room.deadBodies = deadBodies;
    projectiles = room.projectiles || [];
    chests = room.chests || [];
    pickups = sanitizePickupList(room.pickups);
    room.pickups = pickups;
    particles = [];
    destructibles = room.destructibles || [];
    hazards = room.hazards || [];
    shopOffers = room.shopOffers || [];
    structures = room.structures || [];
    decorations = room.decorations || [];
    mouse.right = false;
    mouse.rightQueued = false;
    gameEvents.emit('room:enter', { room });
    const safeSpawn = findSafeSpawnPoint();
    player.x = safeSpawn.x;
    player.y = safeSpawn.y;

    if (room.type === 'combat' && !room.cleared && enemies.length === 0) {
      if (gameMode === 'endless') {
        endlessWaveActive = true;
        const firstWaveSize = 4 + floor;
        spawnWave(firstWaveSize, 'combat');
        particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 40, life: 1.2, text: 'WAVE 1', c: '#ff8b8b' });
      } else {
        spawnWave(getWaveCount(3), 'combat');
      }
    }
    if (room.type === 'shop') {
      ensureShopHasMinimumItemOffers(room, 3);
      room.shopWeaponOffers = Array.isArray(room.shopWeaponOffers) ? room.shopWeaponOffers : [];
      refreshRoomShopCosts(room);
      shopOffers = room.shopOffers || [];
    }
    if (room.type === 'challenge') {
      if (!room.cleared && !room.challengeStarted) {
        spawnChallengeStarter(room);
      } else if (!room.cleared && room.challengeStarted && !enemies.some(enemy => enemy.type === 'mirror_knight')) {
        if ((room.challengeType || 'mirror') === 'mirror') spawnMirrorChampion();
      }
    }

    if (room.type === 'anvil') {
      setAnvilPanelOpen(false);
    }

    if (room.type === 'treasure' && !room.cleared && chests.length === 0) {
      const treasureRandom = createRoomRandom(room, 'treasure:chests');
      const chestCount = 1 + Math.floor(treasureRandom() * 2);
      for (let index = 0; index < chestCount; index += 1) {
        const rewardsItem = treasureRandom() < 0.9;
        chests.push({
          x: 260 + index * 180,
          y: ROOM_H / 2,
          open: false,
          rewardType: rewardsItem ? 'item' : 'potion',
          rewardKey: rewardsItem ? rollItemDrop({ random: treasureRandom }) : '',
        });
      }
    }

    if (room.secret) {
      particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 24, life: 1.1, text: 'SECRET ROOM', c: '#8dd4ff' });
    }

    if (room.type === 'ladder') {
      if (!room.cleared && enemies.length === 0) {
        spawnWave(getWaveCount(4), 'ladder');
        // Almost always add a random non-god boss to ladder rooms
        if (!room.ladderBossPlan) {
          const ladderRandom = createRoomRandom(room, 'ladder:boss');
          const _ladderBossPool = ['queen_cult', 'bulk_golem', 'artificer_knave'];
          room.ladderBossPlan = {
            spawn: ladderRandom() < 0.88,
            type: _ladderBossPool[Math.floor(ladderRandom() * _ladderBossPool.length)],
          };
        }
        if (room.ladderBossPlan.spawn) {
          const _ladderBossType = room.ladderBossPlan.type;
          const _ladderBossSpawn = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2 - 60, 20);
          if (_ladderBossSpawn) {
            const _ladderBoss = spawnEnemy(_ladderBossType, _ladderBossSpawn.x, _ladderBossSpawn.y, false);
            const _playedLadderCutscene = tryPlayBossIntroCutscene(_ladderBoss, _ladderBossType);
            const _ladderBossLine = BOSS_OPENING_DIALOGUE[_ladderBossType];
            if (!_playedLadderCutscene && _ladderBoss && _ladderBossLine) sayOverEntity(_ladderBoss, _ladderBossLine);
          }
        }
      }
      if (room.cleared && !pickups.some(pickup => pickup.type === 'ladder')) {
        let ladderX = ROOM_W / 2;
        let ladderY = ROOM_H / 2;
        let attempts = 0;
        while (isBlocked(ladderX, ladderY, 16) && attempts < 20) {
          const angle = nextRandom('world') * Math.PI * 2;
          const radius = 60 + nextRandom('world') * 120;
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
          const angle = nextRandom('world') * Math.PI * 2;
          const radius = 60 + nextRandom('world') * 120;
          ladderX = clamp(ROOM_W / 2 + Math.cos(angle) * radius, 60, ROOM_W - 60);
          ladderY = clamp(ROOM_H / 2 + Math.sin(angle) * radius, 60, ROOM_H - 60);
          attempts++;
        }
        pickups.push({ x: ladderX, y: ladderY, type: 'ladder' });
      }
    }

    // Inject rivals that are already present in this room
    injectRivalsToCurrentRoom();

    if (room.type === 'god') {
      const ensureGodIntroDialogue = () => {
        if (room.godIntroPlayed) return;
        if (playGodDialogue(1)) room.godIntroPlayed = true;
      };
      if (room.cleared) {
        if (!pickups.some(pickup => pickup.type === 'crown')) {
          pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'crown' });
        }
      } else if (room.bossStarted) {
        if (!enemies.some(enemy => enemy.type === 'god')) {
          spawnGodBoss();
        }
        ensureGodIntroDialogue();
      } else if (!room.bossStarted) {
        // Auto-start the god fight immediately — no upfront choice
        currentRoom.bossStarted = true;
        if (!enemies.some(enemy => enemy.type === 'god')) {
          spawnGodBoss();
        }
        ensureGodIntroDialogue();
        syncCurrentRoomState();
        updateObjective();
      }
    }

    updateGardenGrowth();
    syncCurrentRoomState();
    updateObjective();
    scheduleRunSave();
  }

  function ensureShopHasMinimumItemOffers(room, minItemOffers = 3) {
    if (!room || room.type !== 'shop') return;
    room.shopOffers = Array.isArray(room.shopOffers) ? room.shopOffers : [];
    const itemOffers = room.shopOffers.filter(offer => offer?.type === 'item');
    if (itemOffers.length >= minItemOffers) return;

    const shopRandom = createRoomRandom(room, 'shop:item-offers');
    const occupiedKeys = new Set(itemOffers.map(offer => offer.key));
    const itemSlotsX = [ROOM_W / 2 - 180, ROOM_W / 2, ROOM_W / 2 + 180, ROOM_W / 2 - 90, ROOM_W / 2 + 90];
    let created = 0;

    while (itemOffers.length + created < minItemOffers) {
      let key = '';
      for (let attempts = 0; attempts < 12; attempts += 1) {
        const candidate = rollItemDrop({ random: shopRandom });
        if (!occupiedKeys.has(candidate)) {
          key = candidate;
          break;
        }
      }
      if (!key) key = rollItemDrop({ random: shopRandom });
      occupiedKeys.add(key);
      const itemIndex = itemOffers.length + created;
      const rarity = itemRegistry.get(key)?.rarity || ITEM_DEFS[key]?.rarity || 'knight';
      room.shopOffers.push({
        type: 'item',
        key,
        cost: getShopItemCost(itemIndex, floor, selectedDifficulty, rarity),
        x: itemSlotsX[itemIndex] ?? ROOM_W / 2,
        y: ROOM_H / 2 - 16,
        bought: false,
      });
      created += 1;
    }
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
    if (!rival || !enemy || !player) return false;
    if (player.character !== 'thorn_knight') return false;
    if (rival.characterKey !== 'princess') return false;
    if (rival.memory?.princessKnightIntroPlayed) return false;

    rival.memory.princessKnightIntroPlayed = true;
    clearGameplayInput();
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    enemy.attackCd = Math.max(Number(enemy.attackCd || 0), 1.2);
    enemy.stun = Math.max(Number(enemy.stun || 0), 0.2);

    return uiController.playDialogue([
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
    return rivals.find(r => (r.rivalId && r.rivalId === rivalId) || (r.characterKey && r.characterKey === rivalKey)) || null;
  }

  function applyRivalLevelStats(rival, options = {}) {
    if (!rival) return;
    const syncLiveEnemy = options.syncLiveEnemy !== false;
    const keepHpRatio = options.keepHpRatio !== false;
    const oldMax = Math.max(1, Number(rival.max || rival.baseHp || 1));
    const oldHp = clamp(Number(rival.hp || oldMax), 1, oldMax);
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
    rival.moveInterval = Math.max(3.2, Number(rival.baseMoveInterval || RIVAL_MOVE_INTERVAL_BASE) * moveScale);
    rival.hp = keepHpRatio
      ? clamp(Math.round((oldHp / oldMax) * rival.max), 1, rival.max)
      : clamp(oldHp, 1, rival.max);
    rival.hpSnapshot = rival.hp;

    if (!syncLiveEnemy) return;
    const liveEnemy = enemies.find(e => e.type === 'rival' && ((e.rivalData && e.rivalData.rivalId === rival.rivalId) || e.rivalKey === rival.characterKey));
    if (!liveEnemy) return;
    const liveOldMax = Math.max(1, Number(liveEnemy.max || oldMax));
    const liveOldHp = clamp(Number(liveEnemy.hp || liveOldMax), 1, liveOldMax);
    liveEnemy.max = rival.max;
    liveEnemy.dmg = rival.dmg;
    liveEnemy.speed = rival.speed;
    liveEnemy.hp = keepHpRatio
      ? clamp(Math.round((liveOldHp / liveOldMax) * rival.max), 1, rival.max)
      : clamp(liveOldHp, 1, rival.max);
    rival.hp = liveEnemy.hp;
    rival.hpSnapshot = liveEnemy.hp;
  }

  function migrateRivalState(source) {
    if (!source || typeof source !== 'object') return null;
    const def = RIVAL_DEFS[source.characterKey] || null;
    const baseHp = Math.max(40, Number(source.baseHp || source.max || source.hp || def?.hp || 140));
    const baseDmg = Math.max(5, Number(source.baseDmg || source.dmg || def?.dmg || 18));
    const migrated = {
      ...source,
      rivalId: String(source.rivalId || `${source.characterKey || 'rival'}-${Math.floor(nextRandom('world') * 1000000)}`),
      characterKey: String(source.characterKey || ''),
      name: String(source.name || def?.name || 'Rival'),
      color: String(source.color || def?.color || '#ff9d7a'),
      attackStyle: String(source.attackStyle || def?.attackStyle || 'melee'),
      enterLine: String(source.enterLine || def?.enterLine || 'I remember you.'),
      deathLine: String(source.deathLine || def?.deathLine || 'Not this time...'),
      roomGx: Number(source.roomGx || 0),
      roomGy: Number(source.roomGy || 0),
      moveTimer: Number(source.moveTimer || 0),
      moveInterval: Number(source.moveInterval || source.baseMoveInterval || RIVAL_MOVE_INTERVAL_BASE),
      baseMoveInterval: Number(source.baseMoveInterval || source.moveInterval || RIVAL_MOVE_INTERVAL_BASE),
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
      xpToNext: Math.max(8, Number(source.xpToNext || (22 + floor * 4))),
      growthTick: Math.max(0, Number(source.growthTick || 0)),
      weapons: Array.isArray(source.weapons) ? source.weapons : [],
      memory: normalizeRivalMemory(source.memory),
      dead: !!source.dead,
    };
    if (!migrated.weapons.length) {
      migrated.weapons = (RIVAL_WEAPON_LOADOUTS[migrated.characterKey] || []).map(weapon => ({ ...weapon }));
    }
    applyRivalLevelStats(migrated, { syncLiveEnemy: false, keepHpRatio: false });
    migrated.hp = clamp(Number(source.hp || migrated.hp), 1, migrated.max);
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
      const liveEnemy = enemies.find(e => e.type === 'rival' && e.rivalData === rival);
      if (liveEnemy) {
        particles.push({ x: liveEnemy.x, y: liveEnemy.y - 20, life: 1.0, text: `${rival.name.toUpperCase()} LV ${rival.level}`, c: rival.color });
      }
    }
    if (leveled && reason !== 'silent') {
      scheduleRunSave();
    }
  }

  function restoreRivals(snapshotRivals) {
    const loaded = Array.isArray(snapshotRivals) ? snapshotRivals.map(migrateRivalState).filter(Boolean) : [];
    rivals = loaded;
    const rivalById = new Map(rivals.map(rival => [rival.rivalId, rival]));
    enemies.forEach(enemy => {
      if (enemy?.type !== 'rival') return;
      const rivalFromEnemy = enemy.rivalData && typeof enemy.rivalData === 'object' ? migrateRivalState(enemy.rivalData) : null;
      const matching = (rivalFromEnemy && rivalById.get(rivalFromEnemy.rivalId))
        || getRivalById(enemy.rivalData?.rivalId, enemy.rivalKey)
        || rivalFromEnemy;
      if (!matching) return;
      if (!rivalById.has(matching.rivalId)) {
        rivals.push(matching);
        rivalById.set(matching.rivalId, matching);
      }
      matching.hp = clamp(Number(enemy.hp || matching.hp), 1, matching.max);
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
    rivals = [];
    if (!rooms || rooms.length === 0) return;
    if (nextRandom('world') > RIVAL_SPAWN_CHANCE) return;
    let unchosen = Object.keys(CHARACTER_DEFS).filter(k => k !== chosenCharacter && RIVAL_DEFS[k]);
    if (chosenCharacter === 'thorn_knight' && unchosen.includes('princess') && unchosen.length > 1) {
      // Thorn runs: rival princess is intentionally very rare.
      if (nextRandom('world') > 0.05) {
        unchosen = unchosen.filter(key => key !== 'princess');
      }
    }
    const count = floor >= 3 ? Math.min(2, unchosen.length) : 1;
    const nonStartRooms = rooms.filter(r => r.type !== 'start' && r.type !== 'boss' && r.type !== 'god');
    if (nonStartRooms.length === 0) return;
    const shuffled = [...unchosen].sort(() => nextRandom('world') - 0.5);
    for (let i = 0; i < count && i < shuffled.length; i++) {
      const charKey = shuffled[i];
      const def = RIVAL_DEFS[charKey];
      const spawnRoom = nonStartRooms[i % nonStartRooms.length];
      const floorScale = 1 + (floor - 1) * 0.12;
      const reputationBonus = Math.max(0, Math.floor(Number(player?.rivalReputation || 0) / 2));
      const startingLevel = Math.max(1, 1 + reputationBonus);
      const baseMoveInterval = RIVAL_MOVE_INTERVAL_BASE + nextRandom('world') * 4;
      rivals.push({
        rivalId: `${charKey}-${floor}-${Math.floor(nextRandom('world') * 1000000)}`,
        characterKey: charKey,
        name: def.name,
        color: def.color,
        attackStyle: def.attackStyle,
        enterLine: def.enterLine,
        deathLine: def.deathLine,
        roomGx: spawnRoom.gx,
        roomGy: spawnRoom.gy,
        moveTimer: 6 + nextRandom('world') * 5,
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
        xpToNext: 22 + floor * 4,
        growthTick: 0,
        weapons: (RIVAL_WEAPON_LOADOUTS[charKey] || []).map(weapon => ({ ...weapon })),
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
      applyRivalLevelStats(rivals[rivals.length - 1], { syncLiveEnemy: false, keepHpRatio: false });
    }
  }

  function getRoomByCoords(gx, gy) {
    return rooms.find(room => room.gx === gx && room.gy === gy) || null;
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
    if (currentRoom && currentRoom !== fromRoom && threat > 1.2) {
      const huntChance = clamp(0.2 + threat * 0.07, 0.2, 0.72);
      if (nextRandom('encounter') < huntChance) {
        return currentRoom;
      }
    }
    const pool = rooms.filter(room => room !== fromRoom && room.type !== 'start' && room.type !== 'god' && room.type !== 'boss');
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
    if (totalWeight <= 0) return pool[Math.floor(nextRandom('encounter') * pool.length)] || fromRoom;
    let roll = nextRandom('encounter') * totalWeight;
    for (let i = 0; i < weighted.length; i += 1) {
      roll -= weighted[i].weight;
      if (roll <= 0) return weighted[i].room;
    }
    return weighted[weighted.length - 1].room || fromRoom;
  }

  function chooseFallbackNeighbor(fromRoom) {
    const dirs = ['n', 's', 'e', 'w'];
    for (const dir of dirs.sort(() => nextRandom('encounter') - 0.5)) {
      const next = getConnectedRoom(fromRoom, dir);
      if (next) return { next, dir };
    }
    return null;
  }

  function isMonsterDoorRoamEligible(enemy) {
    if (!enemy || typeof enemy !== 'object') return false;
    if (enemy.type === 'rival' || enemy.type === 'mirror_knight') return false;
    if (isBossType(enemy.type) || enemy.type === 'god') return false;
    if (enemy.type === 'boss_spawner') return false;
    if (enemy.spawnT > 0) return false;
    return true;
  }

  function getDoorEntryPoint(direction, radius = 15) {
    const r = Math.max(8, Number(radius || 15));
    const laneX = ROOM_W / 2 + rand(34, -34, 'encounter');
    const laneY = ROOM_H / 2 + rand(34, -34, 'encounter');
    if (direction === 'n') {
      return { x: laneX, y: WALL + r + 10 };
    }
    if (direction === 's') {
      return { x: laneX, y: ROOM_H - WALL - r - 10 };
    }
    if (direction === 'e') {
      return { x: ROOM_W - WALL - r - 10, y: laneY };
    }
    return { x: WALL + r + 10, y: laneY };
  }

  function updateMonsterDoorRoaming(dt) {
    if (!currentRoom || !player || !Array.isArray(rooms) || rooms.length === 0) return;
    if (player.character === 'princess') {
      monsterRoamTimer = 0;
      return;
    }

    monsterRoamTimer += dt;
    if (monsterRoamTimer < MONSTER_ROAM_INTERVAL_SECONDS) return;
    monsterRoamTimer -= MONSTER_ROAM_INTERVAL_SECONDS;

    const moves = [];
    for (const room of rooms) {
      if (!room || room === currentRoom) continue;
      if (!Array.isArray(room.enemies) || room.enemies.length === 0) continue;
      const exits = DIRECTIONS
        .map(dir => ({ dir, next: getConnectedRoom(room, dir) }))
        .filter(entry => !!entry.next);
      if (exits.length === 0) continue;

      const remaining = [];
      for (const enemy of room.enemies) {
        if (!isMonsterDoorRoamEligible(enemy) || nextRandom('encounter') > MONSTER_ROAM_MOVE_CHANCE) {
          remaining.push(enemy);
          continue;
        }
        const chosenExit = exits[Math.floor(nextRandom('encounter') * exits.length)];
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
      const entryDir = OPPOSITE_DIRECTION[move.dir] || 'n';
      const point = getDoorEntryPoint(entryDir, move.enemy.r);
      move.enemy.x = point.x;
      move.enemy.y = point.y;
      move.enemy.vx = 0;
      move.enemy.vy = 0;
      targetRoom.enemies.push(move.enemy);
      if (targetRoom === currentRoom) enteredCurrentRoom += 1;
    }

    if (enteredCurrentRoom > 0) {
      enemies = currentRoom.enemies;
      particles.push({
        x: ROOM_W / 2,
        y: ROOM_H / 2 - 34,
        life: 1.4,
        text: enteredCurrentRoom > 1 ? `${enteredCurrentRoom} MONSTERS ROAMED IN` : 'A MONSTER ROAMED IN',
        c: '#ffbf7a',
      });
    }
    scheduleRunSave();
  }

  function stealFromRoom(rival, room) {
    if (!room || !Array.isArray(room.pickups) || room.pickups.length === 0) return;
    const stealable = room.pickups.filter(p => p.type === 'item' || p.type === 'coin' || p.type === 'potion');
    if (stealable.length === 0) return;
    const idx = Math.floor(nextRandom('encounter') * stealable.length);
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
    if (room === currentRoom) {
      const liveIdx = pickups.indexOf(stolen);
      if (liveIdx >= 0) pickups.splice(liveIdx, 1);
      particles.push({ x: stolen.x || ROOM_W / 2, y: (stolen.y || ROOM_H / 2) - 16, life: 1.6, text: `${rival.name} STOLE THIS!`, c: rival.color });
    }
  }

  function injectRivalToCurrentRoom(rival) {
    if (!currentRoom) return;
    if (enemies.some(e => e.type === 'rival' && e.rivalData === rival)) return;
    const sp = findSafeEnemySpawnPoint(ROOM_W / 2, ROOM_H / 2, rival.r) || { x: ROOM_W / 2, y: ROOM_H / 2 };
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
      attackCd: 0.5 + nextRandom('encounter') * 0.6,
      stun: 0, inv: 0,
      elite: false,
      bleedImmune: false, fireImmune: false, poisonImmune: false, dark_drainImmune: false,
      statuses: createStatusMap(),
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
    enemies.push(entry);
    particles.push({ x: entry.x, y: entry.y - 26, life: 1.8, text: `${rival.name.toUpperCase()} ENTERS!`, c: rival.color });
    const playedCutscene = tryPlayPrincessKnightCutscene(rival, entry);
    if (!playedCutscene) {
      sayAtPosition(entry.x, entry.y, rival.enterLine, { speaker: rival.name, tone: 'boss', holdTime: 1.8, offsetY: rival.r + 36 });
    }
  }

  function injectRivalsToCurrentRoom() {
    if (!currentRoom) return;
    rivals.forEach(rival => {
      if (!rival.dead && rival.roomGx === currentRoom.gx && rival.roomGy === currentRoom.gy) {
        injectRivalToCurrentRoom(rival);
      }
    });
  }

  function updateRivals(dt) {
    if (!currentRoom) return;
    for (let i = rivals.length - 1; i >= 0; i--) {
      const rival = rivals[i];
      if (rival.dead) { rivals.splice(i, 1); continue; }

      rival.growthTick = Number(rival.growthTick || 0) + dt;
      while (rival.growthTick >= RIVAL_GROWTH_TICK_SECONDS) {
        rival.growthTick -= RIVAL_GROWTH_TICK_SECONDS;
        awardRivalXp(rival, RIVAL_XP_PER_GROWTH_TICK + floor * 0.5, 'time');
      }

      // Sync hp from live enemy if they're in the current room
      const liveEnemy = enemies.find(e => e.type === 'rival' && e.rivalData === rival);
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
          rival.lastKnownPlayerGx = currentRoom.gx;
          rival.lastKnownPlayerGy = currentRoom.gy;
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
        const wasInCurrentRoom = fromRoom === currentRoom;
        let goalRoom = null;

        if (rival.aggroTimer > 0) {
          rival.objectiveKind = 'hunt';
          goalRoom = getRoomByCoords(rival.lastKnownPlayerGx, rival.lastKnownPlayerGy) || currentRoom;
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

        if (nextRoom === currentRoom) {
          if (rival.memory) {
            rival.memory.playerSightings += 1;
            rival.memory.lastSeenTime = Number(gameElapsedTime || 0);
            rival.memory.threat += 0.6;
          }
          rival.aggroTimer = Math.max(rival.aggroTimer, 8 + Math.min(7, Number(rival.memory?.threat || 0)));
          rival.lastKnownPlayerGx = currentRoom.gx;
          rival.lastKnownPlayerGy = currentRoom.gy;
          awardRivalXp(rival, 7, 'sighting');
          injectRivalToCurrentRoom(rival);
        }

        if (nextRoom.gx === rival.objectiveGx && nextRoom.gy === rival.objectiveGy) {
          rival.route = [];
        }

        if (wasInCurrentRoom && nextRoom !== currentRoom && liveEnemy) {
          const idx = enemies.indexOf(liveEnemy);
          if (idx >= 0) enemies.splice(idx, 1);
          const fleeText = rival.objectiveKind === 'hunt' ? `${rival.name} REPOSITIONED` : `${rival.name} MOVED`;
          particles.push({ x: liveEnemy.x, y: liveEnemy.y - 16, life: 1.4, text: fleeText, c: rival.color });
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
      : (RIVAL_WEAPON_LOADOUTS[rival.characterKey] || []);
    if (weapons.length === 0) return;

    enemy.rivalWeaponIndex = Math.max(0, Math.min(weapons.length - 1, Number(enemy.rivalWeaponIndex || 0)));
    enemy.rivalWeaponSwapCd = Math.max(0, Number(enemy.rivalWeaponSwapCd || 0) - dt);
    enemy.rivalStrafeDir = enemy.rivalStrafeDir || (nextRandom('encounter') < 0.5 ? -1 : 1);
    enemy.rivalStrafeFlipCd = Math.max(0, Number(enemy.rivalStrafeFlipCd || 0) - dt);
    if (enemy.rivalStrafeFlipCd <= 0) {
      enemy.rivalStrafeFlipCd = 1.1 + nextRandom('encounter') * 1.8;
      if (nextRandom('encounter') < 0.35) enemy.rivalStrafeDir *= -1;
    }
    if (enemy.rivalWeaponSwapCd <= 0 && weapons.length > 1) {
      enemy.rivalWeaponIndex = (enemy.rivalWeaponIndex + 1) % weapons.length;
      enemy.rivalWeaponSwapCd = RIVAL_WEAPON_SWAP_BASE + nextRandom('encounter') * 1.6;
    }
    const weapon = weapons[enemy.rivalWeaponIndex] || weapons[0];

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 620;
      enemy.vy = Math.sin(enemy.dashAngle) * 620;
      if (!enemy.dashHit && distance < enemy.r + player.r + 8) {
        enemy.dashHit = true;
        const dashDamage = Math.round(enemy.dmg * Number(weapon.damageMult || 1));
        damagePlayer(dashDamage, enemy.dashAngle, Number(weapon.knockback || 340), rival.name);
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
      if (shouldSeekCover && trySteerEnemyToCover(enemy, dt, preferDist, 4.2)) {
        // Hold cover and only peek out when an attack window opens.
      } else 
      // Keep preferred distance
      if (distance < preferDist - 30) {
        steerEnemy(enemy, -(dx / distance), -(dy / distance), enemy.speed, 4.2, dt);
      } else if (distance > preferDist + 60) {
        steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.2, dt);
      } else {
        // Strafe sideways
        const perp = Math.atan2(dy, dx) + Math.PI / 2 * enemy.rivalStrafeDir;
        steerEnemy(enemy, Math.cos(perp) * 0.8, Math.sin(perp) * 0.8, enemy.speed * 0.6, 3.0, dt);
      }
    } else if (attackStyle === 'dash') {
      const preferred = distance > preferDist ? 1 : distance < 110 ? -1 : 0.2;
      steerEnemy(enemy, dx / distance * preferred, dy / distance * preferred, enemy.speed, 4.6, dt);
    } else {
      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
    }

    if (enemy.attackCd > 0) return;

    if (attackStyle === 'melee' || attackStyle === 'melee_heal') {
      if (distance < enemy.r + player.r + Number(weapon.range || 12)) {
        const angle = Math.atan2(dy, dx);
        const meleeDamage = Math.round(enemy.dmg * Number(weapon.damageMult || 1));
        damagePlayer(meleeDamage, angle, Number(weapon.knockback || 280), rival.name);
        if (rival.memory) {
          rival.memory.playerHitsDealt += 1;
          rival.memory.threat += 0.2;
        }
        enemy.attackCd = rival.attackCd * Number(weapon.cooldownMult || 1) + nextRandom('encounter') * 0.4;
        enemy.swingTime = 0.22;
        // Heal on hit for granialla-style
        if (attackStyle === 'melee_heal' && nextRandom('encounter') < 0.25) {
          const heal = Math.round(enemy.max * 0.06);
          enemy.hp = Math.min(enemy.max, enemy.hp + heal);
          rival.hp = enemy.hp;
          particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.7, text: `+${heal}`, c: '#a8aaff' });
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
        if (attackStyle === 'ranged' && !hasLineOfSight(enemy.x, enemy.y, player.x, player.y)) {
          enemy.attackCd = 0.2;
          return;
        }
        const angle = Math.atan2(dy, dx);
        const shotCount = Math.max(1, Number(weapon.projectileCount || 1));
        const spread = Number(weapon.spread || 0.2);
        for (let shot = 0; shot < shotCount; shot += 1) {
          const offset = shotCount === 1 ? 0 : (shot / (shotCount - 1)) * 2 - 1;
          const a = angle + offset * spread;
          projectiles.push({
            x: enemy.x, y: enemy.y,
            vx: Math.cos(a) * Number(weapon.projectileSpeed || 310), vy: Math.sin(a) * Number(weapon.projectileSpeed || 310),
            r: attackStyle === 'burst' ? 4 : 5,
            life: attackStyle === 'burst' ? 1.0 : 1.1,
            damage: Math.round(enemy.dmg * Number(weapon.damageMult || 1)),
            kind: weapon.key || 'rival_shot', color: rival.color,
            knockback: 160, pierceCount: 0, hitOptions: null,
            enemy: true,
            fromRival: true,
          });
        }
        enemy.attackCd = rival.attackCd * Number(weapon.cooldownMult || 1) + nextRandom('encounter') * 0.5;
      }
    }
  }

  // ── End Rival System ────────────────────────────────────────────────────────
