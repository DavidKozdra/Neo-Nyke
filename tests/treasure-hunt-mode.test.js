const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

describe('treasure hunt alt mode', () => {
  const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

  test('registers the mode in the menu and run lifecycle', () => {
    expect(read('index.html')).toContain('id="altModeTreasureHuntBtn"');
    expect(read('js/core/game-state.js')).toContain("mode === 'treasure_hunt'");
    expect(read('js/core/game-state.js')).toContain("return 'Treasure Hunt'");
    expect(read('js/ui/controller.js')).toContain("handlers.onOpenAltModeCharSelect('treasure_hunt')");
  });

  test('turns the floor boss reward into a vault key instead of a ladder', () => {
    const combat = read('js/game/combat.js');
    expect(combat).toContain("type: 'treasureKey'");
    expect(combat).toContain("Neo.gameMode !== 'treasure_hunt'");
  });

  test('arms an escape phase with ambushes, traps, and a start-room exit', () => {
    const rooms = read('js/game/rooms.js');
    expect(rooms).toContain('function beginTreasureHuntEscape()');
    expect(rooms).toContain('Neo.treasureHuntCollapseTimer = Neo.treasureHuntCollapseMax');
    expect(rooms).toContain('function updateTreasureHuntCollapse(dt)');
    expect(rooms).toContain("source: 'collapse_rock'");
    expect(rooms).toContain("source: 'dungeon_collapse'");
    expect(rooms).toContain("trap.source = 'treasure_hunt_trap'");
    expect(rooms).toContain('room.treasureHuntEscapePending = true');
    expect(rooms).toContain("startRoom.treasureHuntExitKind = Neo.nextRandom('world') < 0.5 ? 'ladder' : 'chest'");
    expect(rooms).toContain('treasureHuntExitChest: true');
  });

  test('finishes the final floor from the returned entrance ladder', () => {
    const world = read('js/game/world.js');
    expect(world).toContain('simulation.useCampaignLadder');
    expect(read('js/simulation/SharedRoomLifecycleSystem.js')).toContain("options.gameMode === 'treasure_hunt' && floor >= maxFloor");
    expect(world).toContain('Neo.win();');
  });

  test('shows the collapse timer and grants mode-only bonus loot', () => {
    expect(read('index.html')).toContain('id="treasureCollapseHud"');
    expect(read('js/game/hud.js')).toContain('function updateTreasureHuntCollapseHud()');
    const combat = read('js/game/combat.js');
    expect(combat).toContain("Neo.gameMode === 'treasure_hunt' ? 3 : 1");
    expect(combat).toContain('treasureHuntRewardSpawned');
    expect(combat).toContain("'treasure-hunt:escape-reward'");
  });
});
