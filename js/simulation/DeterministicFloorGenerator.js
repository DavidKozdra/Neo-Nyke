(function initializeDeterministicFloorGenerator(root, factory) {
  const api = factory(root.NeoNyke?.simulation || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFloorGeneratorApi(browserApi) {
  'use strict';

  const randomApi = typeof require === 'function' ? require('./RandomService.js') : browserApi;
  const { RandomService } = randomApi;
  const DIRECTIONS = Object.freeze([
    { key: 'n', opposite: 's', dx: 0, dy: -1 },
    { key: 's', opposite: 'n', dx: 0, dy: 1 },
    { key: 'e', opposite: 'w', dx: 1, dy: 0 },
    { key: 'w', opposite: 'e', dx: -1, dy: 0 },
  ]);
  // Preserve the campaign's authored random-walk ordering. Traversal remains
  // N/S/E/W above because that ordering selects the same farthest-room tie as
  // the original browser campaign.
  const GENERATION_DIRECTIONS = Object.freeze([
    DIRECTIONS[2], DIRECTIONS[3], DIRECTIONS[1], DIRECTIONS[0],
  ]);
  const SPECIAL_ROOM_ORDER = Object.freeze(['shrine', 'bounty', 'reliquary', 'oracle', 'portal', 'prison', 'wishing_well']);

  function roomKey(x, y) {
    return `${x},${y}`;
  }

  function findFarthestRoom(start, roomsByKey) {
    const queue = [start];
    const distances = new Map([[roomKey(start.gx, start.gy), 0]]);
    let farthest = start;
    while (queue.length > 0) {
      const room = queue.shift();
      const distance = distances.get(roomKey(room.gx, room.gy));
      if (distance > distances.get(roomKey(farthest.gx, farthest.gy))) farthest = room;
      DIRECTIONS.forEach(direction => {
        const next = roomsByKey.get(roomKey(room.gx + direction.dx, room.gy + direction.dy));
        const key = next && roomKey(next.gx, next.gy);
        if (!next || distances.has(key)) return;
        distances.set(key, distance + 1);
        queue.push(next);
      });
    }
    return farthest;
  }

  function generateFloorLayout(options = {}) {
    const floorNumber = Math.max(1, Math.trunc(Number(options.floorNumber) || 1));
    const generationVersion = Math.max(1, Math.trunc(Number(options.generationVersion) || 1));
    const contentVersion = String(options.contentVersion || 'development');
    const matchSeed = options.matchSeed ?? 0;
    const floorSeed = options.floorSeed ?? `${matchSeed}|floor:${floorNumber}|generation:${generationVersion}`;
    const randomService = options.random ? null : new RandomService({ matchSeed: floorSeed, generationVersion, contentVersion });
    const random = options.random || randomService.stream('floor-generation');
    const gridSize = 9;
    const startPosition = { x: 4, y: 4 };
    const occupied = new Set([roomKey(startPosition.x, startPosition.y)]);
    const positions = [startPosition];
    const targetRoomCount = 8 + Math.floor(random.next() * 3) + Math.min(2, floorNumber >> 2);

    while (positions.length < targetRoomCount) {
      const seedRoom = random.pick(positions);
      const directions = random.shuffle(GENERATION_DIRECTIONS);
      let added = false;
      for (const direction of directions) {
        const x = seedRoom.x + direction.dx;
        const y = seedRoom.y + direction.dy;
        const key = roomKey(x, y);
        if (x < 0 || x >= gridSize || y < 0 || y >= gridSize || occupied.has(key)) continue;
        occupied.add(key);
        positions.push({ x, y });
        added = true;
        break;
      }
      if (!added) break;
    }

    const rooms = positions.map(position => ({
      id: `room-${position.x}-${position.y}`,
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
      challengeLifecycleState: 'ready',
      challengeRewardSpawned: false,
      challengeFailed: false,
    }));
    const roomsByKey = new Map(rooms.map(room => [roomKey(room.gx, room.gy), room]));
    rooms.forEach(room => {
      DIRECTIONS.forEach(direction => {
        if (roomsByKey.has(roomKey(room.gx + direction.dx, room.gy + direction.dy))) {
          room.doors[direction.key] = true;
        }
      });
    });

    const startRoom = roomsByKey.get(roomKey(startPosition.x, startPosition.y));
    startRoom.type = 'start';
    startRoom.cleared = true;
    startRoom.explored = true;
    startRoom.visited = true;
    const exitRoom = findFarthestRoom(startRoom, roomsByKey);
    const maxFloor = Math.max(1, Math.trunc(Number(options.maxFloor) || 10));
    const gameMode = String(options.gameMode || 'normal');
    if (gameMode === 'treasure_hunt') exitRoom.type = 'boss';
    else if (floorNumber === maxFloor) exitRoom.type = 'god';
    else if (floorNumber > maxFloor) exitRoom.type = floorNumber % 3 === 0 ? 'boss' : 'ladder';
    else if (floorNumber % 3 === 0) exitRoom.type = 'boss';
    else exitRoom.type = 'ladder';

    const hideExitOnMinimap = gameMode !== 'treasure_hunt' && gameMode !== 'story'
      && exitRoom.type === 'ladder'
      && random.next() < 0.1;

    const candidates = random.shuffle(rooms.filter(room => room !== startRoom && room !== exitRoom));
    const treasureCount = Math.min(3, 1 + Math.floor(random.next() * 3));
    candidates.slice(0, treasureCount).forEach(room => { room.type = 'treasure'; });
    if (gameMode !== 'treasure_hunt' && !options.tutorial) {
      const service = candidates.find(room => room.type === 'combat');
      if (service) {
        const loopIndex = Math.max(0, Math.trunc(Number(options.runLoopIndex) || 0));
        const depth = Math.max(0, floorNumber - 1 + loopIndex * 3);
        service.type = SPECIAL_ROOM_ORDER[depth % SPECIAL_ROOM_ORDER.length];
        if (gameMode === 'story' && service.type === 'portal') service.type = 'reliquary';
      }
    }
    const shop = candidates.find(room => room.type === 'combat');
    if (shop && random.chance(0.7)) shop.type = 'shop';
    const challenge = candidates.find(room => room.type === 'combat');
    if (challenge && floorNumber >= 2 && floorNumber < maxFloor && random.chance(0.42)) challenge.type = 'challenge';
    const anvil = candidates.find(room => room.type === 'combat');
    if (anvil && random.chance(0.55)) anvil.type = 'anvil';

    if (!options.tutorial) {
      const secretAnchors = random.shuffle(rooms.filter(room => ['combat', 'treasure', 'shop', 'anvil'].includes(room.type)));
      let secretRoom = null;
      for (const anchor of secretAnchors) {
        const secretDirections = random.shuffle(DIRECTIONS);
        for (const direction of secretDirections) {
          const gx = anchor.gx + direction.dx;
          const gy = anchor.gy + direction.dy;
          if (gx < 0 || gx >= gridSize || gy < 0 || gy >= gridSize || roomsByKey.has(roomKey(gx, gy))) continue;
          secretRoom = {
            id: `room-${gx}-${gy}`,
            gx, gy, type: 'secret', layoutArchetype: 'open', layoutChambers: [],
            doors: { n: false, s: false, e: false, w: false },
            secretPassages: { [direction.opposite]: { targetGx: anchor.gx, targetGy: anchor.gy, open: false } },
            secret: true, explored: false, visited: false, cleared: true,
            bossStarted: false, challengeStarted: false, challengeLifecycleState: 'ready',
            challengeRewardSpawned: false, challengeFailed: false,
            secretKind: random.next() < 0.5 ? 'warp' : 'vendor',
          };
          anchor.secretPassages[direction.key] = { targetGx: gx, targetGy: gy, open: false };
          rooms.push(secretRoom);
          roomsByKey.set(roomKey(gx, gy), secretRoom);
          break;
        }
        if (secretRoom) break;
      }
    }

    return {
      generationVersion,
      contentVersion,
      matchSeed,
      floorSeed,
      floorNumber,
      gridSize,
      startRoomId: startRoom.id,
      exitRoomId: exitRoom.id,
      rooms,
      hideExitOnMinimap,
    };
  }

  return { DIRECTIONS, SPECIAL_ROOM_ORDER, generateFloorLayout };
});
