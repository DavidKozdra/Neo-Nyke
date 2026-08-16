const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createRecordingContext() {
  const target = {
    calls: [],
    currentPath: [],
    beginPath() {
      this.currentPath = [];
    },
    arc(x, y, radius) {
      this.currentPath.push({ type: 'arc', x, y, radius });
    },
    fill() {
      this.calls.push({ op: 'fill', style: this.fillStyle, path: [...this.currentPath] });
    },
    stroke() {
      this.calls.push({ op: 'stroke', style: this.strokeStyle, path: [...this.currentPath] });
    },
  };
  return new Proxy(target, {
    get(context, key) {
      if (key in context) return context[key];
      return () => {};
    },
  });
}

describe('minimap room icons', () => {
  const specialRooms = fs.readFileSync(path.join(__dirname, '../js/game/specialRooms.js'), 'utf8');
  const hud = fs.readFileSync(path.join(__dirname, '../js/draw/hud.js'), 'utf8');
  const props = fs.readFileSync(path.join(__dirname, '../js/draw/props.js'), 'utf8');

  test('service rooms use readable unique abbreviations', () => {
    const expected = {
      shrine: 'SH',
      bounty: 'BO',
      reliquary: 'RE',
      oracle: 'OR',
      portal: 'PO',
      prison: 'PR',
      wishing_well: 'WW',
    };

    Object.entries(expected).forEach(([type, glyph]) => {
      const definitionStart = specialRooms.indexOf(`${type}: {`);
      expect(definitionStart).toBeGreaterThanOrEqual(0);
      expect(specialRooms.slice(definitionStart, definitionStart + 180)).toContain(`glyph: '${glyph}'`);
    });
    expect(specialRooms).not.toContain("glyph: 'K'");
  });

  test('all major revealed room types have an explicit pictured icon', () => {
    expect(hud).toContain("god: ['god', 'GOD', '#ffffff', 'square', 'GD', 'crown']");
    expect(hud).toContain("challenge: ['trial', 'TRIAL', '#d7f6ff', 'square', 'TR', 'trial']");
    expect(hud).toContain("boss: ['boss-room', 'BOSS', '#ff7a7a', 'square', 'BS', 'boss']");
    expect(hud).toContain("treasure: ['treasure', 'LOOT', '#ffaa00', 'square', 'LO', 'chest']");
    expect(hud).toContain("anvil: ['anvil', 'FORGE', '#ffb840', 'square', '⚒', 'anvil']");
  });

  test('prefers authored environment sprites with high-contrast fallbacks in larger cells', () => {
    expect(hud).toContain('const baseSize = 24');
    expect(hud).toContain("icon === 'chest' ? 'chest_0'");
    expect(hud).toContain("icon === 'ladder' ? 'ladder_0'");
    expect(hud).toContain("icon === 'anvil' ? 'anvil_0'");
    expect(hud).toContain("if (icon === 'chest')");
    expect(hud).toContain("else if (icon === 'ladder')");
    expect(hud).toContain("drawRoomGlyph('$', x, y, roomExplored)");
    expect(hud).toContain("drawRoomIcon('ladder', '★'");
  });

  test('marks combat with a red alert and gives ladders matching gold backings', () => {
    expect(hud).toContain("combat: ['combat', 'COMBAT', '#ff434f', 'square', '!', 'combat']");
    expect(hud).toContain("Neo.ctx.fillStyle = '#ff2638'");
    expect(hud).toContain("Neo.ctx.fillStyle = '#e5b62f'");
    expect(props).toContain("Neo.ENVIRONMENT_IMAGES?.ladder_0?.image");
    expect(props).toContain("Neo.ctx.strokeStyle = '#ffc638'");
    expect(props).toContain("Neo.ctx.fillText('EXIT', 0, 43)");
  });

  test('ends at the room grid without a per-room legend footer', () => {
    expect(hud).toContain('const minimapFrameHeight = mapHeight');
    expect(hud).not.toContain('addLegendEntry');
    expect(hud).not.toContain('keyFooterPad');
  });

  test('switches loot markers to the authored open-chest frame', () => {
    expect(hud).toContain('const chestFrame = chestOpen ? 4 : 0');
    expect(hud).toContain('roomChests.every(chest => chest?.open)');
    expect(hud).toContain('drawRoomIcon(roomMarker[5], roomMarker[4], x, y, roomExplored, { chestOpen })');
  });

  test('draws color-coded remote players in their authoritative rooms', () => {
    const cacheContext = createRecordingContext();
    const liveContext = createRecordingContext();
    const cacheCanvas = { width: 0, height: 0, getContext: () => cacheContext };
    const canvas = {
      width: 900,
      height: 700,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 700 }),
    };
    const rooms = [
      { id: 'r1', gx: 0, gy: 0, explored: true, visited: true, secret: false, doors: {} },
      { id: 'r2', gx: 1, gy: 0, explored: true, visited: true, secret: false, doors: {} },
    ];
    const playerSlot = (id, roomId, color, isLocal = false) => ({
      id,
      color,
      isLocal,
      getEntity: () => ({ id, roomId }),
      getDead: () => false,
    });
    const Neo = {
      canvas,
      ctx: liveContext,
      rooms,
      currentRoom: rooms[0],
      player: {},
      pickups: [],
      chests: [],
      enemies: [],
      gameElapsedTime: 1,
      gameState: 'play',
      floorRivalCurses: {},
      SPECIAL_ROOM_DEFS: {},
      multiplayerMapPlayerSlots: [
        playerSlot('p1', 'r1', '#00f001', true),
        playerSlot('p2', 'r1', '#2457ff'),
        playerSlot('p3', 'r2', '#ff4bc1'),
      ],
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      getItemStats: () => ({}),
      hasLegacy: () => false,
      getAdaptiveQualityLevel: () => 0,
    };
    const window = {
      innerWidth: 900,
      innerHeight: 700,
      NeoSettings: { getHudElements: () => ({ minimap: {} }) },
      addEventListener: () => {},
    };

    vm.runInNewContext(hud, {
      Neo,
      window,
      document: { createElement: () => cacheCanvas },
      performance: { now: () => 1_000 },
    });
    Neo.drawMinimap();

    const markerArc = color => cacheContext.calls
      .find(call => call.op === 'fill' && call.style === color)
      ?.path.find(entry => entry.type === 'arc');
    const sameRoomMarker = markerArc('#2457ff');
    const nextRoomMarker = markerArc('#ff4bc1');
    expect(sameRoomMarker).toEqual(expect.objectContaining({ radius: expect.any(Number) }));
    expect(nextRoomMarker.x).toBeGreaterThan(sameRoomMarker.x);
    expect(markerArc('#00f001')).toBeUndefined();
  });
});
