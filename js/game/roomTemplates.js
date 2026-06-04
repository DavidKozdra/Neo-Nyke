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
      // Demonstration of fully-authored obstacle placement: every barrel, cover
      // wall, and lava tile sits at an exact designed coordinate, and the random
      // pot/barrel/lava/trap scatter is suppressed for those categories (props ->
      // pots/barrel/hidden_wall, hazards -> lava_moat/explosive_traps). Shipped at
      // weight 0 so it does not alter existing floor generation; raise the weight
      // (or add it to a floor's eligible set) to put it into rotation.
      id: 'authored_killbox',
      for: ['combat'],
      weight: 0,
      tags: ['arena', 'authored'],
      build: () => ({
        pillars: [
          { x: cx(0), y: cy(0), size: 40 },
        ],
        walls: [
          { x: cx(-200), y: cy(-120), w: 90, h: 40 },
          { x: cx(200), y: cy(120), w: 90, h: 40 },
        ],
        decor: [
          { kind: 'brazier', x: cx(-200), y: cy(-160), r: 16 },
          { kind: 'brazier', x: cx(200), y: cy(160), r: 16 },
        ],
        chambers: [
          { x: cx(-180), y: cy(120), w: 220, h: 180 },
          { x: cx(180), y: cy(-120), w: 220, h: 180 },
        ],
        // Hand-placed destructible obstacles (suppresses random pot/barrel scatter).
        props: [
          { kind: 'barrel', x: cx(-120), y: cy(0) },
          { kind: 'barrel', x: cx(120), y: cy(0) },
          { kind: 'pot', x: cx(0), y: cy(-150) },
          { kind: 'pot', x: cx(0), y: cy(150) },
          { kind: 'cover_wall', x: cx(-260), y: cy(60), w: 40, h: 90 },
          { kind: 'cover_wall', x: cx(260), y: cy(-60), w: 40, h: 90 },
        ],
        // Hand-placed hazards (suppresses random lava/trap scatter).
        hazards: [
          { kind: 'explosive_trap', x: cx(-60), y: cy(-60), r: 16, triggerRadius: 34, blastRadius: 88, damage: 20, fuse: 0, fuseDuration: 0.78, triggered: false, sparkTick: 0 },
          { kind: 'explosive_trap', x: cx(60), y: cy(60), r: 16, triggerRadius: 34, blastRadius: 88, damage: 20, fuse: 0, fuseDuration: 0.78, triggered: false, sparkTick: 0 },
        ],
      }),
    },
    {
      // "The Gauntlet" — two long cover walls fence off a central lane lined with
      // explosive traps. Spawn chambers sit on the flanks, so enemies pour in from
      // the sides and the player must brave the trapped lane to cross. Risk/reward.
      id: 'gauntlet',
      for: ['combat'],
      weight: 1,
      tags: ['arena', 'authored', 'corridor'],
      build: () => ({
        decor: [
          { kind: 'brazier', x: cx(0), y: cy(-180), r: 16 },
          { kind: 'brazier', x: cx(0), y: cy(180), r: 16 },
          { kind: 'crack', x: cx(0), y: cy(0), r: 30 },
        ],
        chambers: [
          { x: cx(-250), y: cy(0), w: 150, h: Neo.ROOM_H - 220 },
          { x: cx(250), y: cy(0), w: 150, h: Neo.ROOM_H - 220 },
        ],
        props: [
          // The two fences defining the lane.
          { kind: 'cover_wall', x: cx(-90), y: cy(0), w: 36, h: 300, hp: 12, maxHp: 12, reinforced: true },
          { kind: 'cover_wall', x: cx(90), y: cy(0), w: 36, h: 300, hp: 12, maxHp: 12, reinforced: true },
          // Barrels at the lane mouths — collateral if the traps go off.
          { kind: 'barrel', x: cx(0), y: cy(-120) },
          { kind: 'barrel', x: cx(0), y: cy(120) },
        ],
        hazards: [
          { kind: 'explosive_trap', x: cx(0), y: cy(-70), r: 16, triggerRadius: 34, blastRadius: 88, damage: 20, fuse: 0, fuseDuration: 0.78, triggered: false, sparkTick: 0 },
          { kind: 'explosive_trap', x: cx(0), y: cy(0), r: 16, triggerRadius: 34, blastRadius: 88, damage: 20, fuse: 0, fuseDuration: 0.78, triggered: false, sparkTick: 0 },
          { kind: 'explosive_trap', x: cx(0), y: cy(70), r: 16, triggerRadius: 34, blastRadius: 88, damage: 20, fuse: 0, fuseDuration: 0.78, triggered: false, sparkTick: 0 },
        ],
      }),
    },
    {
      // "Powder Keg" — a dense cluster of barrels around a single trap. Shooting or
      // detonating one chains the rest. Open chambers so the blast radius matters.
      id: 'powder_keg',
      for: ['combat'],
      weight: 1,
      tags: ['arena', 'authored'],
      build: () => ({
        decor: [
          { kind: 'rubble', x: cx(0), y: cy(0), r: 28 },
          { kind: 'banner', x: cx(-200), y: cy(-160), r: 14 },
          { kind: 'banner', x: cx(200), y: cy(-160), r: 14 },
        ],
        chambers: [
          { x: cx(-220), y: cy(40), w: 200, h: 200 },
          { x: cx(220), y: cy(40), w: 200, h: 200 },
          { x: cx(0), y: cy(-160), w: Neo.ROOM_W - 320, h: 130 },
        ],
        props: [
          { kind: 'barrel', x: cx(-70), y: cy(-40) },
          { kind: 'barrel', x: cx(70), y: cy(-40) },
          { kind: 'barrel', x: cx(-70), y: cy(40) },
          { kind: 'barrel', x: cx(70), y: cy(40) },
          { kind: 'barrel', x: cx(0), y: cy(-80) },
          { kind: 'barrel', x: cx(0), y: cy(80) },
          { kind: 'barrel', x: cx(-120), y: cy(0) },
          { kind: 'barrel', x: cx(120), y: cy(0) },
        ],
        hazards: [
          { kind: 'explosive_trap', x: cx(0), y: cy(0), r: 16, triggerRadius: 40, blastRadius: 104, damage: 24, fuse: 0, fuseDuration: 0.7, triggered: false, sparkTick: 0 },
        ],
      }),
    },
    {
      // "Lava Island" — a lava ring (four rect tiles) walls off a central platform
      // with a pillar. Chambers sit ON the island, so melee enemies are stranded
      // with you while ranged threats hold the outer edges. Forces footwork.
      id: 'lava_island',
      for: ['combat'],
      weight: 1,
      minFloor: 3,
      tags: ['arena', 'authored', 'hazard'],
      build: () => ({
        pillars: [
          { x: cx(0), y: cy(0), size: 38 },
        ],
        decor: [
          { kind: 'brazier', x: cx(-110), y: cy(-110), r: 15 },
          { kind: 'brazier', x: cx(110), y: cy(110), r: 15 },
        ],
        chambers: [
          { x: cx(0), y: cy(0), w: 280, h: 220 },
        ],
        // Four lava rects forming a broken ring around the centre platform. Authored
        // in centre-relative { x, y, w, h }; left/top/r are derived on apply.
        hazards: [
          { kind: 'lava', x: cx(0), y: cy(-190), w: 240, h: 96 },
          { kind: 'lava', x: cx(0), y: cy(190), w: 240, h: 96 },
          { kind: 'lava', x: cx(-280), y: cy(0), w: 96, h: 200 },
          { kind: 'lava', x: cx(280), y: cy(0), w: 96, h: 200 },
        ],
      }),
    },
    {
      // "Pinwheel" — four pillars and four cover walls in rotational symmetry create
      // swirling sightlines; chambers tuck into the gaps. No hazards: a pure
      // positioning/cover map. Reads as deliberately designed, never random.
      id: 'pinwheel',
      for: ['combat'],
      weight: 1,
      tags: ['arena', 'authored', 'cover'],
      build: () => ({
        pillars: [
          { x: cx(-120), y: cy(-120), size: 34 },
          { x: cx(120), y: cy(-120), size: 34 },
          { x: cx(-120), y: cy(120), size: 34 },
          { x: cx(120), y: cy(120), size: 34 },
        ],
        decor: [
          { kind: 'crack', x: cx(0), y: cy(0), r: 24 },
        ],
        chambers: [
          { x: cx(0), y: cy(-150), w: 220, h: 120 },
          { x: cx(0), y: cy(150), w: 220, h: 120 },
          { x: cx(-220), y: cy(0), w: 150, h: 200 },
          { x: cx(220), y: cy(0), w: 150, h: 200 },
        ],
        props: [
          // Cover walls offset clockwise from each pillar for the "spin" read.
          { kind: 'cover_wall', x: cx(-10), y: cy(-150), w: 120, h: 30 },
          { kind: 'cover_wall', x: cx(150), y: cy(-10), w: 30, h: 120 },
          { kind: 'cover_wall', x: cx(10), y: cy(150), w: 120, h: 30 },
          { kind: 'cover_wall', x: cx(-150), y: cy(10), w: 30, h: 120 },
        ],
      }),
    },
    {
      // "Minefield" — a central cover wall the player fights behind, ringed by
      // persistent thorn_mines that detonate when enemies approach. Lure-and-pop:
      // kite enemies over the mines. Mines omit ttl so they stay armed (anti-enemy)
      // until triggered. Chambers sit beyond the mine ring so enemies must cross it.
      id: 'minefield',
      for: ['combat'],
      weight: 1,
      minFloor: 2,
      tags: ['arena', 'authored', 'hazard'],
      build: () => ({
        pillars: [
          { x: cx(0), y: cy(0), size: 36 },
        ],
        decor: [
          { kind: 'rubble', x: cx(-40), y: cy(40), r: 22 },
          { kind: 'rubble', x: cx(40), y: cy(-40), r: 22 },
        ],
        chambers: [
          { x: cx(0), y: cy(-200), w: Neo.ROOM_W - 300, h: 120 },
          { x: cx(0), y: cy(200), w: Neo.ROOM_W - 300, h: 120 },
          { x: cx(-280), y: cy(0), w: 140, h: 200 },
          { x: cx(280), y: cy(0), w: 140, h: 200 },
        ],
        props: [
          { kind: 'cover_wall', x: cx(0), y: cy(0), w: 150, h: 40, hp: 12, maxHp: 12, reinforced: true },
        ],
        // Persistent anti-enemy mines ringing the centre (ttl omitted on purpose).
        hazards: [
          { kind: 'thorn_mine', x: cx(-130), y: cy(-110) },
          { kind: 'thorn_mine', x: cx(130), y: cy(-110) },
          { kind: 'thorn_mine', x: cx(-130), y: cy(110) },
          { kind: 'thorn_mine', x: cx(130), y: cy(110) },
          { kind: 'thorn_mine', x: cx(0), y: cy(-160) },
          { kind: 'thorn_mine', x: cx(0), y: cy(160) },
        ],
      }),
    },
    {
      // "Dogleg" — an intentionally ASYMMETRIC bunker: a long wall + barrel stack
      // in one corner, open killing floor diagonally opposite. Declares all four
      // orientation variants, so a single authored layout yields 4 distinct rooms
      // (none / mirrorX / mirrorY / rotate180) — the Spelunky variety multiplier.
      id: 'dogleg',
      for: ['combat'],
      weight: 1,
      tags: ['arena', 'authored', 'asymmetric'],
      variants: ['none', 'mirrorX', 'mirrorY', 'rotate180'],
      build: () => ({
        pillars: [
          { x: cx(-150), y: cy(-90), size: 32 },
        ],
        decor: [
          { kind: 'brazier', x: cx(-210), y: cy(-150), r: 15 },
          { kind: 'rubble', x: cx(170), y: cy(120), r: 24 },
        ],
        chambers: [
          { x: cx(150), y: cy(110), w: 280, h: 200 },
          { x: cx(-120), y: cy(120), w: 200, h: 160 },
        ],
        props: [
          { kind: 'cover_wall', x: cx(-90), y: cy(-150), w: 200, h: 34 },
          { kind: 'cover_wall', x: cx(-200), y: cy(-30), w: 34, h: 160 },
          { kind: 'barrel', x: cx(-150), y: cy(20) },
          { kind: 'barrel', x: cx(-110), y: cy(20) },
          { kind: 'pot', x: cx(-190), y: cy(60) },
        ],
        hazards: [
          { kind: 'explosive_trap', x: cx(120), y: cy(-120) },
          { kind: 'thorn_mine', x: cx(180), y: cy(40) },
        ],
      }),
    },
    {
      // "Sniper Nest" — a DESIGNED encounter, not just terrain. Two raised flank
      // chambers behind cover host snipers + shield units; the spawnHint pins the
      // composition and places enemies INSIDE those chambers so the fight reads as
      // intentional: ranged threats entrenched behind walls, forcing the player to
      // flush them out. spawnHint.types cycles across the wave; inChambers routes
      // spawns to layoutChambers; count fixes the wave size. Floor-gated so the
      // tougher units are level-appropriate.
      id: 'sniper_nest',
      for: ['combat'],
      weight: 1,
      minFloor: 4,
      tags: ['arena', 'authored', 'encounter'],
      build: () => ({
        decor: [
          { kind: 'banner', x: cx(-230), y: cy(-150), r: 14 },
          { kind: 'banner', x: cx(230), y: cy(-150), r: 14 },
          { kind: 'brazier', x: cx(0), y: cy(170), r: 16 },
        ],
        chambers: [
          { x: cx(-230), y: cy(-110), w: 200, h: 160 },
          { x: cx(230), y: cy(-110), w: 200, h: 160 },
          { x: cx(0), y: cy(120), w: 280, h: 160 },
        ],
        props: [
          // Cover the snipers sit behind (player must close distance or flank).
          { kind: 'cover_wall', x: cx(-150), y: cy(-40), w: 160, h: 34, hp: 12, maxHp: 12, reinforced: true },
          { kind: 'cover_wall', x: cx(150), y: cy(-40), w: 160, h: 34, hp: 12, maxHp: 12, reinforced: true },
          { kind: 'barrel', x: cx(-40), y: cy(60) },
          { kind: 'barrel', x: cx(40), y: cy(60) },
        ],
        // The authored encounter: snipers + shield units up top, chargers to rush.
        spawnHint: {
          count: 6,
          types: ['sniper', 'shield_unit', 'sniper', 'charger', 'shield_unit', 'charger'],
          inChambers: true,
        },
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

  // Default shapes for authored destructible props, so a template only has to
  // specify { kind, x, y } and gets sane hp/radius. Override any field inline.
  const AUTHORED_PROP_DEFAULTS = {
    pot: { r: 12, hp: 1, broken: false },
    barrel: { r: 20, hp: 1, broken: false },
    crate: { r: 18, hp: 1, broken: false },
    cover_wall: { r: 24, hp: 4, maxHp: 4, reinforced: false, broken: false },
  };

  // Which PROP_RULES scatter categories an authored field suppresses. A template
  // that hand-places its pots, for example, opts out of the random pot scatter so
  // the two don't stack. Keyed by template field -> PROP_RULES id(s).
  const AUTHORED_SUPPRESSES = {
    props: ['pots', 'barrel', 'hidden_wall'], // authored destructibles replace scattered ones
    hazards: ['lava_moat', 'explosive_traps'], // authored hazards replace scattered ones
  };

  // Normalizes an authored hazard so it satisfies the runtime contract regardless
  // of how concisely the template wrote it. Templates author in the centre-relative
  // { x, y, w, h } idiom; rect hazards (lava) also need left/top for collision
  // (see world.js circleRect checks) and a center radius for rendering — derived
  // here. Animation fields (phase/pulse) get static defaults so authored lava
  // renders without relying on RNG. Other fields pass through untouched.
  function normalizeAuthoredHazard(h) {
    const out = { ...h };
    if (out.kind === 'lava') {
      out.shape = out.shape || 'rect';
      if (out.shape === 'rect' && out.w != null && out.h != null) {
        if (out.left == null) out.left = out.x - out.w / 2;
        if (out.top == null) out.top = out.y - out.h / 2;
        if (out.r == null) out.r = Math.min(out.w, out.h) / 2;
      }
      if (out.phase == null) out.phase = 0;
      if (out.pulse == null) out.pulse = 1.4;
    } else if (out.kind === 'thorn_mine') {
      // An authored thorn_mine is a PERSISTENT armed anti-enemy mine. Critically we
      // do NOT set ttl: the update loop only decrements ttl when it's defined, and
      // the final filter keeps hazards whose ttl is undefined, so the mine waits
      // indefinitely until an enemy walks into triggerRadius, then detonates once.
      // (red_spikes/lightning_column etc. are one-shot/timed and are intentionally
      // NOT supported as static terrain — see neonyke-hazard-persistence memory.)
      // Mark as dungeon-owned so the hazard loop arms it against the player too
      // (the player's tool-spawned mines default to owner 'player' = anti-enemy).
      if (out.owner == null) out.owner = 'dungeon';
      if (out.r == null) out.r = 18;
      if (out.armTime == null) out.armTime = 0.18;
      if (out.triggerRadius == null) out.triggerRadius = 34;
      if (out.blastRadius == null) out.blastRadius = 62;
      if (out.damage == null) out.damage = 18;
      if (out.bleedStacks == null) out.bleedStacks = 1;
      if (out.bleedDuration == null) out.bleedDuration = 4.5;
      if (out.statusTick == null) out.statusTick = 0;
      if (out.triggered == null) out.triggered = false;
    } else if (out.kind === 'explosive_trap') {
      // Fill the runtime-required fields so a template can write just { kind, x, y }.
      if (out.r == null) out.r = 16;
      if (out.triggerRadius == null) out.triggerRadius = 34;
      if (out.blastRadius == null) out.blastRadius = 88;
      if (out.damage == null) out.damage = 20;
      if (out.fuse == null) out.fuse = 0;
      if (out.fuseDuration == null) out.fuseDuration = 0.78;
      if (out.triggered == null) out.triggered = false;
      if (out.sparkTick == null) out.sparkTick = 0;
    }
    return out;
  }

  // Stamps a template's geometry into a room using the helper callbacks supplied
  // by decorateRoomStructures (addWall/addPillar/setChambers) so wall/structure
  // bookkeeping (reinforced rolls, decoration arrays) stays centralized there.
  //
  // Beyond geometry, a template may hand-author obstacles at exact coordinates:
  //   props:   [{ kind:'pot'|'barrel'|'cover_wall'|..., x, y, ...overrides }]
  //   hazards: [{ kind:'lava'|'explosive_trap'|..., x, y, ... }]
  // When present, these are stamped here and the matching random scatter in
  // populateRoomProps is suppressed (see room.templateAuthored), giving true
  // designed-obstacle placement while leaving un-authored categories procedural.
  // Reflects every coordinate in a freshly-built spec across the room's centre
  // axes, multiplying one authored layout into up to 4 orientations with zero
  // extra authoring. Width/height/size are reflection-invariant so only x/y move;
  // lava left/top are derived later (in normalizeAuthoredHazard) FROM the
  // transformed x/y, so we deliberately strip any pre-set left/top here to avoid
  // a stale, untransformed rect.
  //   'none'  identity
  //   'mirrorX'  x -> ROOM_W - x   (left/right flip)
  //   'mirrorY'  y -> ROOM_H - y   (up/down flip)
  //   'rotate180' both
  function transformSpec(spec, mode) {
    if (!mode || mode === 'none') return spec;
    const fx = mode === 'mirrorX' || mode === 'rotate180';
    const fy = mode === 'mirrorY' || mode === 'rotate180';
    const tx = x => (fx ? Neo.ROOM_W - x : x);
    const ty = y => (fy ? Neo.ROOM_H - y : y);
    const mapPoint = o => {
      const out = { ...o };
      if (typeof out.x === 'number') out.x = tx(out.x);
      if (typeof out.y === 'number') out.y = ty(out.y);
      if (out.kind === 'lava') { delete out.left; delete out.top; } // re-derived from new x/y
      return out;
    };
    const mapList = list => (Array.isArray(list) ? list.map(mapPoint) : list);
    return {
      ...spec,
      walls: mapList(spec.walls),
      pillars: mapList(spec.pillars),
      decor: mapList(spec.decor),
      chambers: mapList(spec.chambers),
      props: mapList(spec.props),
      hazards: mapList(spec.hazards),
    };
  }

  function applyRoomTemplate(room, template, helpers) {
    const tpl = template || roomTemplateById('open');
    let spec = typeof tpl.build === 'function' ? tpl.build() : tpl;
    const { addWall, addPillar, setChambers } = helpers;

    // Opt-in orientation variants. A template lists allowed modes in `variants`
    // (e.g. ['none','mirrorX']); one is chosen with the seeded 'world' RNG and the
    // spec is reflected. Only templates that declare `variants` draw this RNG, so
    // templates without it are byte-identical to before. Recorded on the room for
    // debug/minimap.
    if (Array.isArray(tpl.variants) && tpl.variants.length > 1) {
      const mode = tpl.variants[Neo.irand(0, tpl.variants.length - 1, 'world')];
      room.layoutVariant = mode;
      spec = transformSpec(spec, mode);
    } else {
      room.layoutVariant = 'none';
    }

    (spec.walls || []).forEach(w => addWall(w.x, w.y, w.w, w.h));
    (spec.pillars || []).forEach(p => addPillar(p.x, p.y, p.size));
    (spec.decor || []).forEach(d => room.decorations.push({ ...d }));
    if (spec.chambers && spec.chambers.length) {
      setChambers(...spec.chambers);
    }

    // Authored obstacles at exact coordinates (optional).
    const authored = { props: false, hazards: false };
    if (Array.isArray(spec.props) && spec.props.length) {
      spec.props.forEach(p => {
        const defaults = AUTHORED_PROP_DEFAULTS[p.kind] || {};
        room.destructibles.push({ ...defaults, ...p });
      });
      authored.props = true;
    }
    if (Array.isArray(spec.hazards) && spec.hazards.length) {
      spec.hazards.forEach(h => room.hazards.push(normalizeAuthoredHazard(h)));
      authored.hazards = true;
    }

    // Record which scatter categories this template overrides, so the procedural
    // population pass can skip them. Build the suppressed-id set from the fields
    // the template actually authored.
    const suppressed = new Set();
    Object.keys(authored).forEach(field => {
      if (authored[field]) (AUTHORED_SUPPRESSES[field] || []).forEach(id => suppressed.add(id));
    });
    room.templateAuthored = suppressed;

    // Record the (optionally orientation-transformed) spawn hint for the enemy
    // spawner to read at room-enter time. null when the template authors no
    // encounter, so the spawner keeps its default behaviour. spawnHint shape:
    //   { count?: number, types?: string[], inChambers?: boolean, elite?: boolean }
    room.spawnHint = spec.spawnHint || null;

    return tpl;
  }

  // --- Procedural population (props, hazards, traps) ----------------------------
  //
  // Declarative table of the prop/hazard rolls that decorateRoomData used to do
  // inline. populateRoomProps() walks these IN ORDER, and each rule's `roll` (the
  // chance gate) is drawn BEFORE its `when` type gate — exactly as the original
  // short-circuit `Neo.nextRandom('world') < p && room.type !== ...` evaluated the
  // random first. This keeps seeded RNG consumption byte-identical while moving
  // the balance numbers into one tunable place.
  //
  // Rule shape:
  //   roll:  number | null  — if set, draw Neo.nextRandom('world') and require < roll
  //   when:  (room) => bool — type/eligibility gate, evaluated after roll
  //   place: (room, ctx) => void — performs the placement (may draw further RNG)
  const PROP_RULES = [
    {
      id: 'pots',
      roll: null,
      when: () => true,
      place: (room) => {
        const potCount = room.type === 'shop'
          ? 1
          : (room.type === 'challenge' || room.type === 'anvil') ? 0
          : Neo.irand(1, 3, 'world');
        for (let i = 0; i < potCount; i += 1) {
          room.destructibles.push({
            kind: 'pot',
            x: 150 + Neo.rand(Neo.ROOM_W - 300, 0, 'world'),
            y: 120 + Neo.rand(Neo.ROOM_H - 240, 0, 'world'),
            r: 12, hp: 1, broken: false,
          });
        }
      },
    },
    {
      id: 'barrel',
      roll: 0.45,
      when: (room) => room.type !== 'shop' && room.type !== 'challenge' && room.type !== 'anvil',
      place: (room) => {
        room.destructibles.push({
          kind: 'barrel',
          x: 180 + Neo.rand(Neo.ROOM_W - 360, 0, 'world'),
          y: 140 + Neo.rand(Neo.ROOM_H - 280, 0, 'world'),
          r: 20, hp: 1, broken: false,
        });
      },
    },
    {
      id: 'lava_moat',
      roll: 0.4,
      when: (room) => room.type !== 'god' && room.type !== 'challenge' && room.type !== 'anvil',
      place: (room, ctx) => {
        room.hazards.push(...ctx.createCornerMoatLavaHazards(room));
      },
    },
    {
      id: 'explosive_traps',
      // Eligibility (combat/boss) is checked first, then the chance roll — matching
      // the original `(type===combat||boss) && nextRandom < p` order.
      preGate: (room) => room.type === 'combat' || room.type === 'boss',
      roll: (room) => (room.type === 'boss' ? 0.45 : 0.32),
      when: () => true,
      place: (room, ctx) => {
        const trapCount = room.type === 'boss'
          ? 2
          : (Neo.nextRandom('world') < 0.45 ? 2 : 1);
        for (let i = 0; i < trapCount; i += 1) {
          const trap = ctx.createExplosiveTrapHazard(room, i);
          if (trap) room.hazards.push(trap);
        }
      },
    },
    {
      id: 'hidden_wall',
      roll: 0.3,
      when: (room) => room.type !== 'shop' && room.type !== 'god' && room.type !== 'challenge',
      place: (room) => {
        const wallX = Neo.nextRandom('world') < 0.5 ? 76 : Neo.ROOM_W - 76;
        const hiddenX = wallX < Neo.ROOM_W / 2 ? 48 : Neo.ROOM_W - 48;
        const revealGroup = `wall_${room.gx}_${room.gy}_${room.destructibles.length}`;
        room.destructibles.push({
          kind: 'wall', x: wallX, y: Neo.ROOM_H / 2 + Neo.rand(120, -120, 'world'),
          r: 26, hp: 2, maxHp: 2, revealGroup, broken: false,
        });
        room.destructibles.push({
          kind: 'pot', x: hiddenX, y: Neo.ROOM_H / 2 + Neo.rand(140, -140, 'world'),
          r: 12, hp: 1, broken: false, hidden: true, revealGroup,
        });
      },
    },
  ];

  // Runs the prop/hazard population rules for a room. `ctx` injects the hazard
  // factories that live in rooms.js (createCornerMoatLavaHazards,
  // createExplosiveTrapHazard) so this module stays free of rooms.js internals.
  function populateRoomProps(room, ctx) {
    const suppressed = room.templateAuthored instanceof Set ? room.templateAuthored : null;
    for (const rule of PROP_RULES) {
      // If the active template hand-authored this category, skip its random
      // scatter entirely (including its RNG roll). This only fires for templates
      // that opt in via props/hazards, so existing seeded output is unaffected.
      if (suppressed && suppressed.has(rule.id)) continue;
      // preGate (eligibility checked before the chance roll, when the original did so)
      if (rule.preGate && !rule.preGate(room)) continue;
      // chance roll — ALWAYS drawn when present, before the `when` type gate, to
      // match the original short-circuit evaluation order.
      if (rule.roll != null) {
        const threshold = typeof rule.roll === 'function' ? rule.roll(room) : rule.roll;
        const passed = Neo.nextRandom('world') < threshold;
        if (!passed) continue;
      }
      if (rule.when && !rule.when(room)) continue;
      rule.place(room, ctx);
    }
  }

  Neo.roomTemplates = ROOM_TEMPLATES;
  Neo.eligibleRoomTemplates = eligibleRoomTemplates;
  Neo.roomTemplateById = roomTemplateById;
  Neo.pickRoomTemplate = pickRoomTemplate;
  Neo.applyRoomTemplate = applyRoomTemplate;
  Neo.propRules = PROP_RULES;
  Neo.populateRoomProps = populateRoomProps;
