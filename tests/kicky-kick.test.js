const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  return source.slice(start, end + 1);
}

describe('Kicky Kick', () => {
  const inputSource = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');

  function loadRoomMoveHelpers(Neo) {
    const declarations = [
      "const KICKY_KICK_ROOM_MOVE_CHANCE = 0.1;",
      extractFunction(combatSource, 'getKickyKickRoomDirection'),
      extractFunction(combatSource, 'isKickyKickRoomMoveEligible'),
      extractFunction(combatSource, 'tryMoveKickyKickEnemyToNextRoom'),
    ].join('\n');
    return new Function(
      'Neo',
      `${declarations}; return { getKickyKickRoomDirection, tryMoveKickyKickEnemyToNextRoom };`,
    )(Neo);
  }

  function createNeo(random = 0.05) {
    const currentRoom = { type: 'combat', cleared: false, enemies: [] };
    const nextRoom = { type: 'combat', cleared: false, enemies: [] };
    const Neo = {
      currentRoom,
      enemies: currentRoom.enemies,
      player: { x: 400, y: 300 },
      OPPOSITE_DIRECTION: { n: 's', s: 'n', e: 'w', w: 'e' },
      isBossType: type => type === 'boss',
      getConnectedRoom: (_room, direction) => (direction === 'e' ? nextRoom : null),
      getDoorEntryPoint: () => ({ x: 80, y: 360 }),
      nextRandom: () => random,
      spawnParticle: jest.fn(),
      updateObjective: jest.fn(),
      scheduleRunSave: jest.fn(),
    };
    return { Neo, currentRoom, nextRoom };
  }

  test('doubles base damage and both knockback components', () => {
    expect(inputSource).toContain("kicky_kick:       { damage: 184,");
    expect(combatSource).toContain('const KICKY_KICK_KNOCKBACK = 1440;');
    expect(combatSource).toContain('const KICKY_KICK_BLAST_KNOCKBACK = 400;');
  });

  test('maps the kick angle to the matching room direction', () => {
    const { Neo } = createNeo();
    const helpers = loadRoomMoveHelpers(Neo);
    expect(helpers.getKickyKickRoomDirection(0)).toBe('e');
    expect(helpers.getKickyKickRoomDirection(Math.PI)).toBe('w');
    expect(helpers.getKickyKickRoomDirection(Math.PI / 2)).toBe('s');
    expect(helpers.getKickyKickRoomDirection(-Math.PI / 2)).toBe('n');
  });

  test('moves a surviving enemy on a successful 10% roll', () => {
    const { Neo, currentRoom, nextRoom } = createNeo(0.05);
    const enemy = { type: 'charger', hp: 20, r: 15, x: 400, y: 300 };
    Neo.enemies.push(enemy);
    const helpers = loadRoomMoveHelpers(Neo);

    expect(helpers.tryMoveKickyKickEnemyToNextRoom(enemy, 0)).toBe(true);
    expect(currentRoom.enemies).toEqual([]);
    expect(nextRoom.enemies).toEqual([enemy]);
    expect(enemy).toMatchObject({ x: 80, y: 360 });
    expect(currentRoom.cleared).toBe(true);
  });

  test('does not move enemies when the roll fails or the target is a boss', () => {
    const failed = createNeo(0.1);
    const enemy = { type: 'charger', hp: 20, r: 15 };
    failed.Neo.enemies.push(enemy);
    expect(loadRoomMoveHelpers(failed.Neo).tryMoveKickyKickEnemyToNextRoom(enemy, 0)).toBe(false);
    expect(failed.Neo.enemies).toEqual([enemy]);

    const bossCase = createNeo(0);
    const boss = { type: 'boss', hp: 200, r: 30 };
    bossCase.Neo.enemies.push(boss);
    expect(loadRoomMoveHelpers(bossCase.Neo).tryMoveKickyKickEnemyToNextRoom(boss, 0)).toBe(false);
    expect(bossCase.Neo.enemies).toEqual([boss]);
  });
});
