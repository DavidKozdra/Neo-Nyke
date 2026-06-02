// roomTemplates.js — data-driven room interior templates.
//
// A template is pure data describing one room's interior: walls (destructible
// cover), pillars (solid structures), decorations, and chambers (enemy/trap
// spawn zones). Templates are selected per room by Neo.pickRoomTemplate() and
// stamped into the room by applyRoomTemplate() in rooms.js.
//
// Coordinates are authored relative to room centre via cx()/cy() so layouts are
// resolution-independent; raw numbers remain valid where convenient.
//
// This registry is a 1:1 port of the imperative archetypes that previously lived
// in decorateRoomStructures(); selecting any of them with equal weights consumes
// RNG identically to the old pickCombatArchetype()/pickBossArchetype(), so the
// default floor output is byte-identical for a given seed.

  const cx = (offset = 0) => Neo.ROOM_W / 2 + offset;
  const cy = (offset = 0) => Neo.ROOM_H / 2 + offset;

  // Each template: { id, for:[roomType...], weight, minFloor, tags,
  //   walls:[{x,y,w,h}], pillars:[{x,y,size}], decor:[{kind,x,y,r}],
  //   chambers:[{x,y,w,h}], spawnHint?:{...} }
  // walls/pillars/decor/chambers are evaluated lazily (functions) so they can
  // reference room dimensions resolved at apply time.
  const ROOM_TEMPLATES = [
    {
      id: 'pillar_ring',
      for: ['combat'],
      weight: 1,
      tags: ['arena'],
      build: () => ({
        pillars: [
          { x: cx(-150), y: cy(-104), size: 36 },
          { x: cx(150), y: cy(-104), size: 36 },
          { x: cx(-150), y: cy(104), size: 36 },
          { x: cx(150), y: cy(104), size: 36 },
          { x: cx(0), y: cy(-138), size: 28 },
          { x: cx(0), y: cy(138), size: 28 },
        ],
        decor: [
          { kind: 'rubble', x: cx(-54), y: cy(0), r: 24 },
          { kind: 'rubble', x: cx(54), y: cy(0), r: 24 },
        ],
        chambers: [
          { x: cx(0), y: cy(0), w: Neo.ROOM_W - 240, h: Neo.ROOM_H - 220 },
        ],
      }),
    },
    {
      id: 'split_cross',
      for: ['combat'],
      weight: 1,
      tags: ['arena'],
      build: () => ({
        walls: [
          { x: cx(0), y: cy(-136), w: 74, h: 92 },
          { x: cx(0), y: cy(136), w: 74, h: 92 },
          { x: cx(-182), y: cy(0), w: 94, h: 58 },
          { x: cx(182), y: cy(0), w: 94, h: 58 },
        ],
        decor: [
          { kind: 'brazier', x: cx(-102), y: cy(-84), r: 16 },
          { kind: 'brazier', x: cx(102), y: cy(84), r: 16 },
          { kind: 'crack', x: cx(0), y: cy(0), r: 28 },
        ],
        chambers: [
          { x: cx(0), y: cy(-150), w: 240, h: 150 },
          { x: cx(0), y: cy(150), w: 240, h: 150 },
          { x: cx(-210), y: cy(0), w: 180, h: 180 },
          { x: cx(210), y: cy(0), w: 180, h: 180 },
        ],
      }),
    },
    {
      id: 'side_lanes',
      for: ['combat'],
      weight: 1,
      tags: ['arena'],
      build: () => ({
        walls: [
          { x: cx(0), y: cy(-124), w: 228, h: 46 },
          { x: cx(0), y: cy(124), w: 228, h: 46 },
        ],
        pillars: [
          { x: cx(-242), y: cy(0), size: 30 },
          { x: cx(242), y: cy(0), size: 30 },
        ],
        decor: [
          { kind: 'banner', x: cx(-188), y: cy(-166), r: 14 },
          { kind: 'banner', x: cx(188), y: cy(166), r: 14 },
        ],
        chambers: [
          { x: cx(-238), y: cy(0), w: 170, h: Neo.ROOM_H - 220 },
          { x: cx(238), y: cy(0), w: 170, h: Neo.ROOM_H - 220 },
          { x: cx(0), y: cy(0), w: 220, h: 180 },
        ],
      }),
    },
    {
      id: 'gate_room',
      for: ['combat'],
      weight: 1,
      tags: ['arena'],
      build: () => ({
        walls: [
          { x: cx(-172), y: cy(-38), w: 108, h: 52 },
          { x: cx(172), y: cy(-38), w: 108, h: 52 },
          { x: cx(0), y: cy(148), w: 86, h: 82 },
        ],
        pillars: [
          { x: cx(-62), y: cy(34), size: 28 },
          { x: cx(62), y: cy(34), size: 28 },
        ],
        decor: [
          { kind: 'brazier', x: cx(-130), y: cy(112), r: 15 },
          { kind: 'brazier', x: cx(130), y: cy(112), r: 15 },
          { kind: 'crack', x: cx(0), y: cy(-104), r: 32 },
        ],
        chambers: [
          { x: cx(0), y: cy(-146), w: Neo.ROOM_W - 300, h: 150 },
          { x: cx(-200), y: cy(40), w: 180, h: 220 },
          { x: cx(200), y: cy(40), w: 180, h: 220 },
        ],
      }),
    },
    {
      id: 'broken_halls',
      for: ['combat'],
      weight: 1,
      tags: ['arena'],
      build: () => ({
        walls: [
          { x: cx(-96), y: cy(-150), w: 84, h: 74 },
          { x: cx(118), y: cy(-36), w: 104, h: 54 },
          { x: cx(-148), y: cy(112), w: 122, h: 46 },
        ],
        pillars: [
          { x: cx(186), y: cy(138), size: 32 },
        ],
        decor: [
          { kind: 'rubble', x: cx(-20), y: cy(10), r: 26 },
          { kind: 'crack', x: cx(132), y: cy(-132), r: 28 },
          { kind: 'banner', x: cx(-170), y: cy(-180), r: 12 },
        ],
        chambers: [
          { x: cx(-150), y: cy(-118), w: 240, h: 170 },
          { x: cx(172), y: cy(-8), w: 200, h: 180 },
          { x: cx(-36), y: cy(170), w: 320, h: 130 },
        ],
      }),
    },
    {
      id: 'boss_buttresses',
      for: ['boss'],
      weight: 1,
      tags: ['boss'],
      build: () => ({
        walls: [
          { x: cx(-220), y: cy(0), w: 64, h: 184 },
          { x: cx(220), y: cy(0), w: 64, h: 184 },
        ],
        pillars: [
          { x: cx(-84), y: cy(-126), size: 30 },
          { x: cx(84), y: cy(-126), size: 30 },
        ],
        decor: [
          { kind: 'brazier', x: cx(-220), y: cy(-136), r: 17 },
          { kind: 'brazier', x: cx(220), y: cy(-136), r: 17 },
        ],
        chambers: [
          { x: cx(0), y: cy(0), w: Neo.ROOM_W - 220, h: Neo.ROOM_H - 170 },
        ],
      }),
    },
    {
      id: 'boss_crossfire',
      for: ['boss'],
      weight: 1,
      tags: ['boss'],
      build: () => ({
        walls: [
          { x: cx(0), y: cy(-162), w: 68, h: 70 },
          { x: cx(0), y: cy(162), w: 68, h: 70 },
        ],
        pillars: [
          { x: cx(-188), y: cy(0), size: 34 },
          { x: cx(188), y: cy(0), size: 34 },
        ],
        decor: [
          { kind: 'crack', x: cx(-128), y: cy(0), r: 26 },
          { kind: 'crack', x: cx(128), y: cy(0), r: 26 },
        ],
        chambers: [
          { x: cx(0), y: cy(0), w: Neo.ROOM_W - 240, h: Neo.ROOM_H - 210 },
        ],
      }),
    },
    {
      id: 'boss_processional',
      for: ['boss'],
      weight: 1,
      tags: ['boss'],
      build: () => ({
        walls: [
          { x: cx(-160), y: cy(118), w: 116, h: 46 },
          { x: cx(160), y: cy(118), w: 116, h: 46 },
        ],
        pillars: [
          { x: cx(-74), y: cy(-64), size: 32 },
          { x: cx(74), y: cy(-64), size: 32 },
        ],
        decor: [
          { kind: 'banner', x: cx(0), y: cy(-186), r: 14 },
          { kind: 'brazier', x: cx(-148), y: cy(-10), r: 16 },
          { kind: 'brazier', x: cx(148), y: cy(-10), r: 16 },
        ],
        chambers: [
          { x: cx(0), y: cy(-96), w: Neo.ROOM_W - 260, h: 180 },
          { x: cx(0), y: cy(176), w: Neo.ROOM_W - 220, h: 140 },
        ],
      }),
    },
    // Fallback used when no eligible template matches (mirrors the old default
    // tail of decorateRoomStructures). Not selected for combat/boss in practice.
    {
      id: 'open',
      for: ['*'],
      weight: 0,
      tags: ['fallback'],
      build: () => ({
        walls: [
          { x: cx(-160), y: cy(118), w: 116, h: 46 },
          { x: cx(160), y: cy(118), w: 116, h: 46 },
        ],
        pillars: [
          { x: cx(-74), y: cy(-64), size: 32 },
          { x: cx(74), y: cy(-64), size: 32 },
        ],
        decor: [
          { kind: 'banner', x: cx(0), y: cy(-186), r: 14 },
          { kind: 'brazier', x: cx(-148), y: cy(-10), r: 16 },
          { kind: 'brazier', x: cx(148), y: cy(-10), r: 16 },
        ],
        chambers: [
          { x: cx(0), y: cy(-96), w: Neo.ROOM_W - 260, h: 180 },
          { x: cx(0), y: cy(176), w: Neo.ROOM_W - 220, h: 140 },
        ],
      }),
    },
  ];

  // Returns templates eligible for a room's type and current floor, in registry
  // order. Excludes the zero-weight 'open' fallback unless nothing else matches.
  function eligibleRoomTemplates(roomType) {
    const matches = ROOM_TEMPLATES.filter(t =>
      t.weight > 0 &&
      (t.for.includes('*') || t.for.includes(roomType)) &&
      Neo.floor >= (t.minFloor || 0)
    );
    return matches;
  }

  function roomTemplateById(id) {
    return ROOM_TEMPLATES.find(t => t.id === id) || null;
  }

  // Picks a template for the given room using the seeded 'world' RNG stream.
  //
  // Parity: when every eligible template shares the same weight (the default for
  // the ported archetypes), selection reduces to pool[Neo.irand(0, n-1, 'world')]
  // — identical RNG consumption to the old pickCombatArchetype/pickBossArchetype.
  // A weighted draw is only used when weights actually differ.
  function pickRoomTemplate(room) {
    const pool = eligibleRoomTemplates(room.type);
    if (pool.length === 0) return roomTemplateById('open');
    if (pool.length === 1) return pool[0];

    const weights = pool.map(t => (t.weight == null ? 1 : t.weight));
    const allEqual = weights.every(w => w === weights[0]);
    if (allEqual) {
      return pool[Neo.irand(0, pool.length - 1, 'world')];
    }

    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Neo.nextRandom('world') * total;
    for (let i = 0; i < pool.length; i += 1) {
      roll -= weights[i];
      if (roll < 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // Stamps a template's geometry into a room using the helper callbacks supplied
  // by decorateRoomStructures (addWall/addPillar/setChambers) so wall/structure
  // bookkeeping (reinforced rolls, decoration arrays) stays centralized there.
  function applyRoomTemplate(room, template, helpers) {
    const tpl = template || roomTemplateById('open');
    const spec = typeof tpl.build === 'function' ? tpl.build() : tpl;
    const { addWall, addPillar, setChambers } = helpers;

    (spec.walls || []).forEach(w => addWall(w.x, w.y, w.w, w.h));
    (spec.pillars || []).forEach(p => addPillar(p.x, p.y, p.size));
    (spec.decor || []).forEach(d => room.decorations.push({ ...d }));
    if (spec.chambers && spec.chambers.length) {
      setChambers(...spec.chambers);
    }
    return tpl;
  }

  Neo.roomTemplates = ROOM_TEMPLATES;
  Neo.eligibleRoomTemplates = eligibleRoomTemplates;
  Neo.roomTemplateById = roomTemplateById;
  Neo.pickRoomTemplate = pickRoomTemplate;
  Neo.applyRoomTemplate = applyRoomTemplate;
