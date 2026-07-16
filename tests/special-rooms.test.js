const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const specialSource = fs.readFileSync(path.join(root, 'js/game/specialRooms.js'), 'utf8');
const roomsSource = fs.readFileSync(path.join(root, 'js/game/rooms.js'), 'utf8');
const worldSource = fs.readFileSync(path.join(root, 'js/game/world.js'), 'utf8');
const combatSource = fs.readFileSync(path.join(root, 'js/game/combat.js'), 'utf8');
const hudSource = fs.readFileSync(path.join(root, 'js/draw/hud.js'), 'utf8');
const entitySource = fs.readFileSync(path.join(root, 'js/draw/entities.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

describe('special service rooms', () => {
  const roomTypes = ['shrine', 'bounty', 'reliquary', 'oracle', 'portal', 'prison', 'wishing_well'];

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

  test('service choices are pictured world stations and never walk-over loot', () => {
    expect(specialSource).toContain("type: 'specialChoice'");
    expect(specialSource).toContain('room.pickups.push(...serviceChoicePickups(room))');
    expect(worldSource).toContain("pickup.type === 'specialService' || pickup.type === 'specialChoice'");
    expect(specialSource).toContain('trySpecialRoomChoiceInteract');
  });

  test('shared choice panel is present and exposes only decision-relevant resources', () => {
    expect(htmlSource).toContain('id="specialRoomPanel"');
    expect(htmlSource).toContain('id="specialRoomChoices"');
    expect(specialSource).toContain('HP <b>');
    expect(specialSource).toContain('COINS <b>');
    expect(specialSource).not.toContain('XP <b>');
  });

  test('choice cards avoid repeating the room label and use concise effects', () => {
    expect(specialSource).toContain('`-${hpCost} max HP. +${attackGain} attack.`');
    expect(specialSource).toContain("choice.enemyType ? `<span class=\"special-room-card__eyebrow\">");
    expect(specialSource).not.toContain('escapeHtml(def.shortName)}</span>');
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

  test('hunts have seeded identities, weaknesses, and distinct resolution contracts', () => {
    expect(specialSource).toContain('BOUNTY_NAMES');
    expect(specialSource).toContain('BOUNTY_EPITHETS');
    expect(specialSource).toContain('BOUNTY_WEAKNESSES');
    expect(specialSource).toContain("contractType: 'execution'");
    expect(specialSource).toContain("contractType: 'capture'");
    expect(specialSource).toContain("contractType: 'theft'");
    expect(combatSource).toContain('bountyWeaknessMultiplier');
  });

  test('low-health targets escape, escalate, and return on the next floor', () => {
    expect(specialSource).toContain('function escapeBountyTarget(enemy)');
    expect(specialSource).toContain('bounty.returnDepth = depth + 1');
    expect(specialSource).toContain('bounty.rewardMultiplier = 1 + bounty.escapes * 0.5');
    expect(specialSource).toContain("label: 'Target Escaped'");
  });

  test('capture and theft resolve through proximity interaction rather than target death', () => {
    expect(specialSource).toContain('export function handleBountyTargetLethal(enemy)');
    expect(specialSource).toContain('export function tryBountyTargetInteract()');
    expect(specialSource).toContain("completeBounty(bounty, 'TARGET CAPTURED')");
    expect(specialSource).toContain("completeBounty(bounty, 'RELIC STOLEN')");
  });

  test('active targets receive a health bar, world name, and minimap hunt marker', () => {
    expect(hudSource).toContain('enemy?.bountyTarget');
    expect(hudSource).toContain('activeBounty?.targetSpawned && activeBounty.targetRoomKey');
    expect(hudSource).toContain("Neo.ctx.strokeStyle = '#ff9d66'");
    expect(entitySource).toContain("enemy.bountyName || 'Marked Target'");
  });

  test('completed hunts award trophies that unlock a Reliquary recipe', () => {
    expect(specialSource).toContain('Neo.player.bountyTrophies');
    expect(specialSource).toContain("'Temper Hunt Trophy'");
    expect(specialSource).toContain("'1 TROPHY'");
  });

  test('every service receives a pictured minimap definition', () => {
    expect(hudSource).toContain('Object.entries(Neo.SPECIAL_ROOM_DEFS || {})');
    expect(hudSource).toContain("'square', def.glyph, type");
    expect(hudSource).toContain('drawRoomIcon(roomMarker[5], roomMarker[4]');
  });
});
