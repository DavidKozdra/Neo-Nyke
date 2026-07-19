(function initializeSharedRoomInteriorSystem(root, factory) {
  const api = factory(root.NeoNyke?.content || {}, root.NeoNyke?.simulation || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedRoomInteriorApi(browserContent, browserSimulation) {
  'use strict';

  const templateModule = typeof require === 'function' ? require('../game/roomTemplates.js') : browserContent;
  const randomModule = typeof require === 'function' ? require('./RandomService.js') : browserSimulation;
  const worldModule = typeof require === 'function' ? require('./SharedWorldContent.js') : browserContent;
  const { RandomService } = randomModule;
  const { CAMPAIGN_ROOM_GEOMETRY } = worldModule;
  const SPECIAL_ROOM_TYPES = new Set(['shrine', 'bounty', 'reliquary', 'oracle', 'portal', 'prison', 'wishing_well']);

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function circleRect(cx, cy, radius, x, y, width, height) {
    const nearestX = clamp(cx, x, x + width);
    const nearestY = clamp(cy, y, y + height);
    return Math.hypot(cx - nearestX, cy - nearestY) < radius;
  }
  function structureRect(structure) {
    const width = Number(structure.w || structure.size || 34);
    const height = Number(structure.h || structure.size || 34);
    return { x: Number(structure.x) - width / 2, y: Number(structure.y) - height / 2, w: width, h: height };
  }

  function circleIntersectsRoomObstacle(x, y, radius, obstacle) {
    if (Number(obstacle?.w) > 0 && Number(obstacle?.h) > 0) {
      const rect = structureRect(obstacle);
      return circleRect(x, y, radius, rect.x, rect.y, rect.w, rect.h);
    }
    return Math.hypot(Number(x) - Number(obstacle?.x), Number(y) - Number(obstacle?.y))
      < Number(radius) + Number(obstacle?.r || 16);
  }

  function getRoomObstacles(room) {
    return [
      ...(room?.structures || []),
      ...(room?.destructibles || []).filter(prop => !prop.broken && !prop.hidden),
    ];
  }

  function resolveRoomObstacleMovement(room, entity, desiredX, desiredY) {
    const radius = Math.max(1, Number(entity?.radius || entity?.r || 18));
    const obstacles = getRoomObstacles(room);
    let x = Number(desiredX);
    let y = Number(desiredY);
    let blockedX = false;
    let blockedY = false;
    if (obstacles.some(obstacle => circleIntersectsRoomObstacle(x, Number(entity.y), radius, obstacle))) {
      x = Number(entity.x);
      blockedX = true;
    }
    if (obstacles.some(obstacle => circleIntersectsRoomObstacle(x, y, radius, obstacle))) {
      y = Number(entity.y);
      blockedY = true;
    }
    return { x, y, blockedX, blockedY };
  }

  function createContext(options = {}) {
    if (options.context) return options.context;
    const geometry = options.geometry || CAMPAIGN_ROOM_GEOMETRY;
    const service = new RandomService({
      matchSeed: `${options.floorSeed ?? options.matchSeed ?? 0}|room:${options.roomId || ''}`,
      generationVersion: options.generationVersion || 1,
      contentVersion: options.contentVersion || 'shared-room-interiors-v1',
    });
    const random = service.stream('room-interior');
    const next = () => random.next();
    return {
      ROOM_W: Number(geometry.width) || 900,
      ROOM_H: Number(geometry.height) || 700,
      WALL: Number(geometry.wallThickness) || 28,
      DOOR: Number(geometry.doorWidth) || 140,
      ENV_TILE_SIZE: 32,
      START_X: Number(geometry.width) / 2 || 450,
      START_Y: Number(geometry.height) / 2 || 350,
      floor: Math.max(1, Number(options.floorNumber) || 1),
      nextRandom: next,
      irand: (min, max) => random.int(min, max),
      rand: (max, min = 0) => min + next() * (max - min),
      clamp,
      dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
      circleRect,
      getStructureCollisionRect: structureRect,
      destructibleIntersectsCircle: (prop, x, y, radius) => {
        if (Number(prop.w) > 0 && Number(prop.h) > 0) {
          return circleRect(x, y, radius, prop.x - prop.w / 2, prop.y - prop.h / 2, prop.w, prop.h);
        }
        return Math.hypot(x - prop.x, y - prop.y) < radius + Number(prop.r || 12);
      },
    };
  }

  function getEntranceRects(room, context) {
    const pad = 48;
    const depth = context.WALL + 112;
    const horizontalLeft = (context.ROOM_W - context.DOOR) / 2 - pad;
    const verticalTop = (context.ROOM_H - context.DOOR) / 2 - pad;
    const rects = [];
    const open = direction => !!room?.doors?.[direction] || !!room?.secretPassages?.[direction];
    if (open('n')) rects.push({ left: horizontalLeft, top: 0, w: context.DOOR + pad * 2, h: depth });
    if (open('s')) rects.push({ left: horizontalLeft, top: context.ROOM_H - depth, w: context.DOOR + pad * 2, h: depth });
    if (open('w')) rects.push({ left: 0, top: verticalTop, w: depth, h: context.DOOR + pad * 2 });
    if (open('e')) rects.push({ left: context.ROOM_W - depth, top: verticalTop, w: depth, h: context.DOOR + pad * 2 });
    return rects;
  }

  function createCornerMoatLavaHazards(room, context) {
    const tile = context.ENV_TILE_SIZE;
    const width = (2 + context.irand(0, 1, 'world')) * tile;
    const height = (2 + context.irand(0, 1, 'world')) * tile;
    const positions = [
      [context.WALL, context.WALL, 0, 0],
      [context.ROOM_W - context.WALL - width, context.WALL, 0, 1],
      [context.WALL, context.ROOM_H - context.WALL - height, 1, 2],
      [context.ROOM_W - context.WALL - width, context.ROOM_H - context.WALL - height, 1, 3],
    ];
    const overlaps = (a, b) => a.left < b.left + b.w && a.left + a.w > b.left && a.top < b.top + b.h && a.top + a.h > b.top;
    const entrances = getEntranceRects(room, context);
    return positions.filter(([left, top]) => !entrances.some(rect => overlaps({ left, top, w: width, h: height }, rect)))
      .map(([left, top, side, cornerIdx]) => ({
        kind: 'lava', shape: 'rect', left, top, w: width, h: height,
        x: left + width / 2, y: top + height / 2, r: Math.min(width, height) / 2,
        phase: context.rand(Math.PI * 2, 0, 'world') + cornerIdx * 0.53,
        pulse: context.rand(1.8, 1.15, 'world'), side, corner: true, cornerIdx,
      }));
  }

  function createExplosiveTrapHazard(room, index, context) {
    const chambers = room.layoutChambers?.length ? room.layoutChambers : [{ x: context.ROOM_W / 2, y: context.ROOM_H / 2, w: context.ROOM_W - 260, h: context.ROOM_H - 240 }];
    const radius = 16;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const chamber = chambers[(index + attempt) % chambers.length];
      const halfW = Math.max(40, chamber.w / 2 - 28);
      const halfH = Math.max(40, chamber.h / 2 - 28);
      const x = clamp(chamber.x + context.rand(halfW, -halfW, 'world'), context.WALL + 28, context.ROOM_W - context.WALL - 28);
      const y = clamp(chamber.y + context.rand(halfH, -halfH, 'world'), context.WALL + 28, context.ROOM_H - context.WALL - 28);
      const blocked = room.structures.some(s => { const r = structureRect(s); return circleRect(x, y, radius + 6, r.x, r.y, r.w, r.h); })
        || room.destructibles.some(prop => !prop.broken && !prop.hidden && context.destructibleIntersectsCircle(prop, x, y, radius + 4))
        || room.hazards.some(hazard => hazard.kind === 'explosive_trap' && Math.hypot(x - hazard.x, y - hazard.y) < radius + Number(hazard.r || 16) + 58);
      if (blocked) continue;
      return { kind: 'explosive_trap', x, y, r: radius, triggerRadius: 34, blastRadius: room.type === 'boss' ? 104 : 88, baseDamage: room.type === 'boss' ? 26 : 18, fuse: 0, fuseDuration: room.type === 'boss' ? 0.62 : 0.78, triggered: false, sparkTick: 0 };
    }
    return null;
  }

  function decorateSharedRoomInterior(room, options = {}) {
    if (!room) return room;
    room.structures = [];
    room.decorations = [];
    room.destructibles = [];
    room.hazards = [];
    room.layoutChambers = [];
    if (room.type === 'start' || room.type === 'secret' || SPECIAL_ROOM_TYPES.has(room.type)) return room;
    const context = createContext({ ...options, roomId: room.id });
    const templateApi = typeof templateModule.createRoomTemplateApi === 'function'
      ? templateModule.createRoomTemplateApi(context)
      : templateModule;
    if (room.type !== 'god' && room.type !== 'boss') {
      const addWall = (x, y, w, h) => {
        const reinforced = context.nextRandom('world') < 0.24;
        room.destructibles.push({ kind: 'cover_wall', x, y, w, h, r: Math.hypot(w, h) / 2, hp: reinforced ? 12 : 4, maxHp: reinforced ? 12 : 4, reinforced, broken: false });
      };
      const addPillar = (x, y, size = 34) => room.structures.push({ kind: 'pillar', x, y, w: size, h: size, mids: context.irand(0, 3, 'world') });
      const setChambers = (...chambers) => { room.layoutChambers = chambers.map(chamber => ({ ...chamber })); };
      const edgeInset = context.WALL + 52;
      const pocketInset = context.DOOR / 2 + 48;
      const torch = (x, y) => room.decorations.push({ kind: 'torch', x, y, r: 12 });
      if (room.doors?.n) { addWall(context.ROOM_W / 2 - pocketInset, edgeInset, 28, 56); addWall(context.ROOM_W / 2 + pocketInset, edgeInset, 28, 56); room.decorations.push({ kind: 'banner', x: context.ROOM_W / 2 - pocketInset, y: edgeInset - 42, r: 12 }, { kind: 'banner', x: context.ROOM_W / 2 + pocketInset, y: edgeInset - 42, r: 12 }); torch(context.ROOM_W / 2 - pocketInset - 26, edgeInset - 4); torch(context.ROOM_W / 2 + pocketInset + 26, edgeInset - 4); }
      if (room.doors?.s) { addWall(context.ROOM_W / 2 - pocketInset, context.ROOM_H - edgeInset, 28, 56); addWall(context.ROOM_W / 2 + pocketInset, context.ROOM_H - edgeInset, 28, 56); room.decorations.push({ kind: 'crack', x: context.ROOM_W / 2, y: context.ROOM_H - edgeInset + 34, r: 22 }); torch(context.ROOM_W / 2 - pocketInset - 26, context.ROOM_H - edgeInset + 4); torch(context.ROOM_W / 2 + pocketInset + 26, context.ROOM_H - edgeInset + 4); }
      if (room.doors?.w) { addWall(edgeInset, context.ROOM_H / 2 - pocketInset, 56, 28); addWall(edgeInset, context.ROOM_H / 2 + pocketInset, 56, 28); room.decorations.push({ kind: 'brazier', x: edgeInset + 28, y: context.ROOM_H / 2, r: 14 }); torch(edgeInset - 6, context.ROOM_H / 2 - pocketInset - 28); torch(edgeInset - 6, context.ROOM_H / 2 + pocketInset + 28); }
      if (room.doors?.e) { addWall(context.ROOM_W - edgeInset, context.ROOM_H / 2 - pocketInset, 56, 28); addWall(context.ROOM_W - edgeInset, context.ROOM_H / 2 + pocketInset, 56, 28); room.decorations.push({ kind: 'brazier', x: context.ROOM_W - edgeInset - 28, y: context.ROOM_H / 2, r: 14 }); torch(context.ROOM_W - edgeInset + 6, context.ROOM_H / 2 - pocketInset - 28); torch(context.ROOM_W - edgeInset + 6, context.ROOM_H / 2 + pocketInset + 28); }
      const template = templateApi.pickRoomTemplate(room);
      room.layoutArchetype = template?.id || 'open';
      templateApi.applyRoomTemplate(room, template, { addWall, addPillar, setChambers });
      if (room.type === 'anvil') room.structures.push({ kind: 'forge', x: context.ROOM_W / 2, y: context.ROOM_H / 2 - 20, w: 48, h: 48 }, { kind: 'anvil', x: context.ROOM_W / 2, y: context.ROOM_H / 2 + 40, w: 40, h: 40 });
    }
    templateApi.populateRoomProps(room, {
      createCornerMoatLavaHazards: target => options.createCornerMoatLavaHazards ? options.createCornerMoatLavaHazards(target) : createCornerMoatLavaHazards(target, context),
      createExplosiveTrapHazard: (target, index) => options.createExplosiveTrapHazard ? options.createExplosiveTrapHazard(target, index) : createExplosiveTrapHazard(target, index, context),
    });
    return room;
  }

  return { decorateSharedRoomInterior, createRoomInteriorContext: createContext, circleIntersectsRoomObstacle, getRoomObstacles, resolveRoomObstacleMovement };
});
