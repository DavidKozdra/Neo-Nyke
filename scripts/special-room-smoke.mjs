import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
await page.goto('http://127.0.0.1:5173/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.Neo?.createDefaultPlayer && window.Neo?.prepareSpecialRoom && window.Neo?.ITEM_KEYS?.length);

const result = await page.evaluate(() => {
  const roomTypes = ['shrine', 'bounty', 'reliquary', 'sanctuary', 'oracle', 'portal', 'prison', 'wishing_well'];
  Neo.player = Neo.createDefaultPlayer();
  Neo.player.coins = 500;
  Neo.player.xp = 10;
  Neo.player.items.neo_knife = 2;
  Neo.gameState = 'play';
  Neo.floor = 1;
  Neo.floorsEntered = 1;
  Neo.rooms = [];
  const rendered = [];
  for (let index = 0; index < roomTypes.length; index += 1) {
    const type = roomTypes[index];
    const room = Neo.createRoomRecord({ x: index, y: 0 }, { type, cleared: true, explored: true, visited: true });
    room.enemies = [];
    room.deadBodies = [];
    room.projectiles = [];
    room.chests = [];
    room.pickups = [];
    room.destructibles = [];
    room.hazards = [];
    room.shopOffers = [];
    room.structures = [];
    room.decorations = [];
    Neo.rooms.push(room);
    Neo.currentRoom = room;
    Neo.prepareSpecialRoom(room);
    Neo.setSpecialRoomPanelOpen(true);
    rendered.push({
      type,
      title: document.getElementById('specialRoomTitle')?.textContent || '',
      choices: document.querySelectorAll('#specialRoomChoices [data-special-choice]').length,
      icons: document.querySelectorAll('#specialRoomChoices [data-inv-ui-icon], #specialRoomChoices [data-special-enemy-icon]').length,
      marker: room.pickups.some(pickup => pickup.type === 'specialService'),
    });
    Neo.setSpecialRoomPanelOpen(false);
  }

  // Accept a pictured elite contract, verify it joins only the next combat,
  // then resolve it through the same death notification hook used by combat.
  Neo.player = Neo.createDefaultPlayer();
  Neo.player.coins = 100;
  Neo.floorsEntered = 2;
  const bountyRoom = Neo.createRoomRecord({ x: 0, y: 0 }, { type: 'bounty', cleared: true, explored: true, visited: true });
  bountyRoom.pickups = [];
  Neo.rooms = [bountyRoom];
  Neo.currentRoom = bountyRoom;
  Neo.enemies = [];
  Neo.pickups = [];
  Neo.prepareSpecialRoom(bountyRoom);
  Neo.setSpecialRoomPanelOpen(true);
  document.querySelector('[data-special-choice="elite_hunter"]')?.click();
  const acceptedWithoutSpawn = !!Neo.player.activeBounty && !Neo.player.activeBounty.targetSpawned && Neo.enemies.length === 0;

  const combatRoom = Neo.createRoomRecord({ x: 1, y: 0 }, { type: 'combat', cleared: false, explored: true, visited: true });
  Object.assign(combatRoom, { enemies: [], deadBodies: [], projectiles: [], chests: [], pickups: [], destructibles: [], hazards: [], structures: [], decorations: [] });
  Neo.rooms = [bountyRoom, combatRoom];
  Neo.currentRoom = combatRoom;
  Neo.enemies = combatRoom.enemies;
  Neo.deadBodies = combatRoom.deadBodies;
  Neo.projectiles = combatRoom.projectiles;
  Neo.chests = combatRoom.chests;
  Neo.pickups = combatRoom.pickups;
  Neo.destructibles = combatRoom.destructibles;
  Neo.hazards = combatRoom.hazards;
  Neo.structures = combatRoom.structures;
  Neo.decorations = combatRoom.decorations;
  Neo.updateSpecialRoomProgress();
  const target = Neo.enemies.find(enemy => enemy.bountyTarget);
  const spawnedElite = !!target?.elite && target.type === 'hunter';
  if (target) Neo.notifyBountyEnemyKilled(target);
  const completed = !Neo.player.activeBounty && String(Neo.player.lastBountyStatus || '').startsWith('COMPLETE:');

  const startContractFight = (kind, enemyType, contractType, targetId) => {
    Neo.player.activeBounty = {
      kind, enemyType, contractType, targetId, targetName: `Test ${enemyType}`, epithet: 'the Marked', weakness: 'bleed',
      targetSpawned: false, targetRoomKey: '', acceptedDepth: 2, returnDepth: 0, escapes: 0, rewardMultiplier: 1, rivalPressure: 0,
    };
    Neo.floorsEntered = 2;
    const room = Neo.createRoomRecord({ x: 2, y: 0 }, { type: 'combat', cleared: false, explored: true, visited: true });
    Object.assign(room, { enemies: [], deadBodies: [], projectiles: [], chests: [], pickups: [], destructibles: [], hazards: [], structures: [], decorations: [] });
    Neo.rooms = [room];
    Neo.currentRoom = room;
    Neo.enemies = room.enemies;
    Neo.deadBodies = room.deadBodies;
    Neo.projectiles = room.projectiles;
    Neo.chests = room.chests;
    Neo.pickups = room.pickups;
    Neo.destructibles = room.destructibles;
    Neo.hazards = room.hazards;
    Neo.structures = room.structures;
    Neo.decorations = room.decorations;
    Neo.updateSpecialRoomProgress();
    return Neo.enemies.find(enemy => enemy.bountyTargetId === targetId);
  };

  const captureTarget = startContractFight('elite_charger', 'charger', 'capture', 'bounty:capture');
  if (captureTarget) {
    captureTarget.hp = 0;
    Neo.handleBountyTargetLethal(captureTarget);
    Neo.player.x = captureTarget.x;
    Neo.player.y = captureTarget.y;
  }
  const captured = !!captureTarget?.bountyCaptureReady && Neo.tryBountyTargetInteract() && !Neo.player.activeBounty;

  const theftTarget = startContractFight('elite_sniper', 'sniper', 'theft', 'bounty:theft');
  if (theftTarget) {
    theftTarget.hp = theftTarget.max * 0.4;
    Neo.updateBountyTarget(theftTarget, 0.01);
    Neo.player.x = theftTarget.x;
    Neo.player.y = theftTarget.y;
  }
  const stolen = !!theftTarget?.bountyTheftReady && Neo.tryBountyTargetInteract() && !Neo.player.activeBounty;

  const escapeTarget = startContractFight('elite_hunter', 'hunter', 'execution', 'bounty:escape');
  if (escapeTarget) {
    escapeTarget.hp = escapeTarget.max * 0.1;
    Neo.updateBountyTarget(escapeTarget, 6);
  }
  const escapedAndEscalated = !!Neo.player.activeBounty
    && Neo.player.activeBounty.escapes === 1
    && Neo.player.activeBounty.returnDepth === 3
    && Neo.player.activeBounty.rewardMultiplier === 1.5
    && !Neo.enemies.some(enemy => enemy.bountyTargetId === 'bounty:escape');

  Neo.player.activeBounty = {
    kind: 'elite_sniper', enemyType: 'sniper', targetId: 'bounty:failure', targetSpawned: false, targetRoomKey: '', acceptedDepth: 2,
  };
  Neo.floorsEntered = 3;
  Neo.updateSpecialRoomProgress();
  const failedWithToast = !Neo.player.activeBounty
    && String(Neo.player.lastBountyStatus || '').startsWith('FAILED:')
    && Array.from(document.querySelectorAll('.status-toast')).some(node => node.textContent.includes('Bounty Failed'));

  Neo.setSpecialRoomPanelOpen(false);
  Neo.rooms = [];
  Neo.currentRoom = null;
  Neo.rivals = [];
  Neo.pendingRivalReturns = [];
  Neo.runLoopIndex = 0;
  Neo.floorsEntered = 0;
  const generated = [];
  for (let floor = 1; floor <= roomTypes.length; floor += 1) {
    Neo.floor = floor;
    Neo.generateFloor();
    generated.push(Neo.rooms.find(room => Neo.SPECIAL_ROOM_TYPES.has(room.type))?.type || '');
  }
  return { rendered, generated, bountyFlow: { acceptedWithoutSpawn, spawnedElite, completed, captured, stolen, escapedAndEscalated, failedWithToast } };
});

await browser.close();
if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
for (const entry of result.rendered) {
  if (!entry.title || entry.choices !== 3 || entry.icons !== 3 || !entry.marker) throw new Error(`Invalid ${entry.type}: ${JSON.stringify(entry)}`);
}
const expected = ['shrine', 'bounty', 'reliquary', 'sanctuary', 'oracle', 'portal', 'prison', 'wishing_well'];
if (JSON.stringify(result.generated) !== JSON.stringify(expected)) throw new Error(`Invalid generated rotation: ${JSON.stringify(result.generated)}`);
if (!Object.values(result.bountyFlow).every(Boolean)) throw new Error(`Invalid bounty flow: ${JSON.stringify(result.bountyFlow)}`);
console.log(JSON.stringify(result));
