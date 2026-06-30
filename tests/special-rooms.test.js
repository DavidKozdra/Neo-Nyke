const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const specialSource = fs.readFileSync(path.join(root, 'js/game/specialRooms.js'), 'utf8');
const roomsSource = fs.readFileSync(path.join(root, 'js/game/rooms.js'), 'utf8');
const worldSource = fs.readFileSync(path.join(root, 'js/game/world.js'), 'utf8');
const combatSource = fs.readFileSync(path.join(root, 'js/game/combat.js'), 'utf8');
const hudSource = fs.readFileSync(path.join(root, 'js/draw/hud.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

describe('special service rooms', () => {
  const roomTypes = ['shrine', 'bounty', 'reliquary', 'sanctuary', 'oracle', 'portal', 'prison', 'wishing_well'];

  test.each(roomTypes)('%s has a complete room definition', roomType => {
    expect(specialSource).toContain(`${roomType}: {`);
  });

  test('reserves a rotating service during normal floor generation', () => {
    const treasureAssignment = roomsSource.indexOf('pool[index].type = \'treasure\'');
    const serviceAssignment = roomsSource.indexOf('Neo.assignSpecialServiceRoom?.(pool)');
    const shopAssignment = roomsSource.indexOf("const shopCandidate = pool.find(room => room.type === 'combat')");
    expect(serviceAssignment).toBeGreaterThan(treasureAssignment);
    expect(serviceAssignment).toBeLessThan(shopAssignment);
  });

  test('service markers persist until a panel choice consumes them', () => {
    expect(specialSource).toContain("type: 'specialService'");
    expect(worldSource).toContain("if (pickup.type === 'specialService') continue;");
    expect(specialSource).toContain("pickup?.type !== 'specialService'");
  });

  test('shared choice panel is present and exposes all resource readouts', () => {
    expect(htmlSource).toContain('id="specialRoomPanel"');
    expect(htmlSource).toContain('id="specialRoomChoices"');
    expect(specialSource).toContain('HP <b>');
    expect(specialSource).toContain('COINS <b>');
    expect(specialSource).toContain('XP <b>');
  });

  test('every service choice uses the established component icon renderer', () => {
    expect(specialSource).toContain('SPECIAL_CHOICE_ICON_KEYS');
    expect(specialSource).toContain('data-inv-ui-icon=');
    expect(specialSource).toContain('Neo.drawInventoryUiIcon?.(canvas, canvas.dataset.invUiIcon)');
  });

  test('Dark Covenant clouds both the current and following floor maps', () => {
    expect(specialSource).toContain('Neo.floorRivalCurses.obscureMap = true');
    expect(specialSource).toContain('Neo.pendingRivalCurses.obscureMap = true');
  });

  test('bounties create pictured elite contracts that expire by floor depth', () => {
    expect(specialSource).toContain('Neo.player.activeBounty = {');
    expect(specialSource).toContain("enemyType: 'hunter'");
    expect(specialSource).toContain("enemyType: 'charger'");
    expect(specialSource).toContain("enemyType: 'sniper'");
    expect(specialSource).toContain('data-special-enemy-icon=');
    expect(specialSource).toContain('Neo.drawSpriteToCanvas?.(canvas, canvas.dataset.specialEnemyIcon, 52)');
    expect(specialSource).toContain('depth > Number(bounty.acceptedDepth || depth)');
  });

  test('accepted bounties inject one forced elite into the next combat and complete on its death', () => {
    expect(specialSource).toContain("if (!bounty || bounty.targetSpawned || !room || room.type !== 'combat' || room.cleared) return false");
    expect(specialSource).toContain("Neo.spawnEnemy?.(def.enemyType, safeSpawn.x, safeSpawn.y, true, { forceElite: true })");
    expect(specialSource).toContain('enemy.bountyTargetId = bounty.targetId');
    expect(combatSource).toContain('Neo.notifyBountyEnemyKilled?.(enemy)');
  });

  test('failed bounties produce a persistent status toast with the target portrait', () => {
    expect(specialSource).toContain("label: 'Bounty Failed'");
    expect(specialSource).toContain('createBountyToastIcon(def.enemyType, accent)');
    expect(specialSource).toContain('Neo.pushStatusToast?.({');
  });

  test('every service receives a minimap definition and glyph path', () => {
    expect(hudSource).toContain('Object.entries(Neo.SPECIAL_ROOM_DEFS || {})');
    expect(hudSource).toContain('Neo.SPECIAL_ROOM_DEFS[room.type].glyph');
  });
});
