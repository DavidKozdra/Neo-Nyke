const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { RandomService } = require('../js/simulation/RandomService');
const { createNetworkFloorState } = require('../js/multiplayer/LocalMultiplayerSession');
const { getEnemyDefinition, ENEMY_CATALOG } = require('../js/simulation/SharedEnemyContent');
const { scaleCampaignEnemyStats } = require('../js/simulation/SharedEnemyScalingSystem');
const {
  BULK_GOLEM_KNOCKBACK_MULTIPLIER,
  createCampaignEnemyBehaviors,
  getHandsomeDevilSpikeDamage,
} = require('../js/simulation/SharedEnemyBehaviorSystem');
const {
  applyNetworkHeroProfile, createNetworkCombatSystem, ensureNetworkEncounter, advanceToNextFloor,
} = require('../js/simulation/NetworkCombatSystem');

function behaviorHarness() {
  const state = new GameState({
    matchId: 'enemy-behavior-test',
    matchSeed: 'enemy-behavior-seed',
    floorSeed: 'enemy-behavior-floor',
    status: 'running',
    floorState: createNetworkFloorState({ matchSeed: 'enemy-behavior-seed', floorSeed: 'enemy-behavior-floor' }),
    players: {
      p1: {
        id: 'p1', characterKey: 'thorn_knight', roomId: 'room-4-4', x: 300, y: 350, radius: 18, moveSpeed: 228,
        maxHp: 1000, hp: 1000, coins: 0, action: 'idle', attackCooldownUntilTick: 0,
      },
    },
  });
  state.players.p1.roomId = state.floorState.currentRoomId;
  applyNetworkHeroProfile(state.players.p1, 'thorn_knight');
  state.players.p1.maxHp = 1000;
  state.players.p1.hp = 1000;
  const random = new RandomService({ matchSeed: state.matchSeed });
  const events = [];
  const system = createNetworkCombatSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) });
  const simulation = new GameSimulation({ state, randomService: random, systems: [system] });
  // Materialize the room's own encounter once, then remove those enemies so
  // only injected test enemies act.
  simulation.updateGame({}, 0.05);
  Object.values(state.enemies).forEach(enemy => {
    enemy.dead = true;
    enemy.health = 0;
    enemy.deathTick = state.tick;
  });
  return { state, events, simulation };
}

function injectEnemy(state, type, x, y, overrides = {}) {
  const definition = getEnemyDefinition(type);
  const enemyId = state.allocateEntityId('enemy');
  state.enemies[enemyId] = {
    id: enemyId,
    type,
    spriteKey: definition.spriteKey,
    behavior: definition.behavior,
    roomId: state.floorState.currentRoomId,
    x, y, vx: 0, vy: 0,
    radius: definition.radius,
    moveSpeed: definition.moveSpeed,
    maxHealth: definition.maxHealth,
    health: definition.maxHealth,
    contactDamage: definition.contactDamage,
    projectileDamage: 9,
    elite: false, eliteTypes: [], elitePowers: [], patterns: [],
    boss: !!definition.boss,
    bleedImmune: !!definition.bleedImmune,
    statuses: {},
    contactCooldownUntilTick: 0,
    attackCooldownUntilTick: 0,
    attackWindupUntilTick: 0,
    state: 'chasing', facing: 1, spawnTick: -100, hitTick: -1, dead: false,
    stun: 0, windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, dashTime: 0,
    attackCd: 0,
    ...overrides,
  };
  return state.enemies[enemyId];
}

function tick(simulation, count = 1) {
  for (let index = 0; index < count; index += 1) simulation.updateGame({}, 0.05);
}

describe('authored campaign enemy behaviors on the authority', () => {
  test('Ent of Pestilence guarantees a three-grub brood in multiplayer', () => {
    const { state, events, simulation } = behaviorHarness();
    const ent = injectEnemy(state, 'ent_of_pestilence', 420, 340, { summonCd: 0, attackCd: 1 });

    tick(simulation);

    const brood = Object.values(state.enemies).filter(enemy => enemy.summonedBy === ent.id);
    expect(brood).toHaveLength(3);
    brood.forEach(grub => expect(grub).toEqual(expect.objectContaining({
      type: 'cult_follower',
      spriteKey: 'ent_boss',
      displayName: 'Pestilent Grub',
      pestilentGrub: true,
    })));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ENEMY_SUPPORT_USED',
      data: expect.objectContaining({ enemyId: ent.id, supportKind: 'pestilent_brood', summonCount: 3 }),
    }));
  });

  test('Endless creates the campaign sealed single-arena floor at multiplayer startup', () => {
    const floorState = createNetworkFloorState({ matchSeed: 'endless-layout', floorSeed: 'endless-layout|floor:1', gameMode: 'endless' });
    expect(floorState.layout.rooms).toHaveLength(1);
    expect(floorState.layout.rooms[0]).toMatchObject({ type: 'combat', doors: { n: false, s: false, e: false, w: false } });
    expect(floorState.layout.exitRoomId).toBe(floorState.layout.startRoomId);
  });

  test('Boss Rush creates the campaign sealed single-arena floor at multiplayer startup', () => {
    const floorState = createNetworkFloorState({ matchSeed: 'boss-rush-layout', floorSeed: 'boss-rush-layout|floor:5', floorNumber: 5, gameMode: 'boss_rush' });
    expect(floorState.layout.rooms).toHaveLength(1);
    expect(floorState.layout.rooms[0]).toMatchObject({ type: 'combat', doors: { n: false, s: false, e: false, w: false } });
    expect(floorState.layout.exitRoomId).toBe(floorState.layout.startRoomId);
  });

  test('Rival Rumble creates the campaign sealed single-arena floor and fields a hostile duel rival', () => {
    const floorState = createNetworkFloorState({ matchSeed: 'rival-rumble-layout', floorSeed: 'rival-rumble-layout|floor:5', floorNumber: 5, gameMode: 'rival_rumble' });
    expect(floorState.layout.rooms).toHaveLength(1);
    expect(floorState.layout.rooms[0]).toMatchObject({ type: 'combat', doors: { n: false, s: false, e: false, w: false } });

    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    state.matchRules.gameMode = 'rival_rumble';
    const arena = state.floorState.layout.rooms.find(room => room.id === player.roomId);
    arena.type = 'combat';
    arena.doors = { n: false, s: false, e: false, w: false };
    state.floorState.layout.rooms = [arena];
    state.floorState.layout.startRoomId = arena.id;
    state.floorState.layout.exitRoomId = arena.id;
    state.enemies = {};
    state.floorState.encounters = {};

    simulation.updateGame({}, 0.05);
    const rival = Object.values(state.enemies).find(enemy => !enemy.dead && enemy.type === 'rival');
    expect(state.rivalRumble).toEqual(expect.objectContaining({ initialized: true, active: true, stage: 0, finale: false }));
    expect(player.coins).toBe(120);
    expect(rival).toEqual(expect.objectContaining({ rivalRumbleStage: 0, rivalRumbleFinale: false }));
    expect(rival.rivalBrain).toEqual(expect.objectContaining({ stance: 'hostile', intention: 'engage' }));

    player.x = rival.x - 12;
    player.y = rival.y;
    rival.health = 1;
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(state.rivalRumble).toEqual(expect.objectContaining({ stage: 1, active: false, finale: false }));
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'RIVAL_RUMBLE_STAGE_CLEARED', data: expect.objectContaining({ stage: 1 }) }));

    state.tick = state.rivalRumble.nextSpawnTick;
    simulation.updateGame({}, 0.05);
    expect(Object.values(state.enemies).some(enemy => !enemy.dead && enemy.type === 'rival' && enemy.rivalRumbleStage === 1)).toBe(true);

    state.enemies = {};
    state.floorState.encounters = {};
    state.rivalRumble.stage = state.rivalRumble.order.length;
    state.rivalRumble.active = false;
    state.rivalRumble.finale = true;
    state.rivalRumble.nextSpawnTick = state.tick;
    simulation.updateGame({}, 0.05);
    const finaleRivals = Object.values(state.enemies).filter(enemy => !enemy.dead && enemy.rivalRumbleFinale);
    expect(finaleRivals).toHaveLength(state.rivalRumble.order.length);
    expect(finaleRivals.every(enemy => enemy.rivalVendetta && enemy.maxHealth >= 440)).toBe(true);
  });

  test('chargers telegraph a wind-up, then dash and hit like the campaign', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    // Inside the campaign's 0.32s × 430px dash reach.
    const charger = injectEnemy(state, 'charger', player.x + 130, player.y);

    tick(simulation, 1);
    expect(charger.windup).toBeGreaterThan(0);
    expect(events.some(event => event.eventType === 'ENEMY_TELEGRAPH' && event.data.enemyId === charger.id)).toBe(true);

    tick(simulation, 12); // 0.52s wind-up elapses, dash begins
    expect(Math.hypot(charger.vx, charger.vy)).toBeGreaterThan(300);
    tick(simulation, 8);
    expect(player.hp).toBeLessThan(1000);
    expect(events.some(event => event.eventType === 'PLAYER_HIT' && event.data.attackKind === 'charger')).toBe(true);
  });

  test('laser units channel a tracking beam instead of firing a bolt', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const laser = injectEnemy(state, 'laser', player.x + 60, player.y);

    tick(simulation, 1);
    expect(laser.windup).toBeGreaterThan(0);
    tick(simulation, 17); // 0.78s wind-up elapses
    expect(laser.beamTime).toBeGreaterThan(0);
    tick(simulation, 4);
    expect(events.some(event => event.eventType === 'PLAYER_HIT' && event.data.attackKind === 'laser')).toBe(true);
  });

  test('crowded cult mages detonate their telegraphed nova with big knockback', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const mage = injectEnemy(state, 'cult_mage', player.x + 100, player.y, { novaCd: 0.01, novaTimer: 0, attackCd: 9 });

    tick(simulation, 1);
    expect(mage.novaTimer).toBeGreaterThan(0);
    tick(simulation, 12); // 0.5s telegraph elapses, blast fires
    expect(events.some(event => event.eventType === 'PLAYER_HIT' && event.data.attackKind === 'cult_mage_blast')).toBe(true);
  });

  test('summoners raise cult followers around themselves', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const summoner = injectEnemy(state, 'summoner', player.x + 260, player.y, { summonCd: 0.01, attackCd: 9 });

    tick(simulation, 2);
    const followers = Object.values(state.enemies).filter(enemy => enemy.summonedBy === summoner.id && !enemy.dead);
    expect(followers.length).toBeGreaterThanOrEqual(2);
    expect(followers.every(enemy => enemy.type === 'cult_follower')).toBe(true);
    expect(summoner.attackAnimT).toBeGreaterThan(0);
  });

  test('healers mend wounded allies on the campaign cadence', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const healer = injectEnemy(state, 'healer', player.x + 400, player.y, { supportCd: 0.01, attackCd: 9 });
    const wounded = injectEnemy(state, 'golem', player.x + 420, player.y + 40, { health: 40, attackCd: 9 });

    tick(simulation, 2);
    expect(wounded.health).toBeGreaterThan(40);
    expect(events.some(event => event.eventType === 'ENEMY_HEALED' && event.data.enemyId === wounded.id)).toBe(true);
    expect(healer.attackAnimT).toBeGreaterThan(0);
  });

  test('shield units barrier nearby allies but stay locked out after being hit', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const shieldUnit = injectEnemy(state, 'shield_unit', player.x + 300, player.y, { supportCd: 0.01, attackCd: 9 });
    const ally = injectEnemy(state, 'hunter', player.x + 330, player.y + 30, { attackCd: 9 });

    tick(simulation, 2);
    expect(ally.barrier).toBeGreaterThan(0);
    expect(shieldUnit.barrier).toBeGreaterThan(0);
    expect(events.some(event => event.eventType === 'ENEMY_SUPPORT_USED' && event.data.supportKind === 'shield')).toBe(true);
    expect(shieldUnit.attackAnimT).toBeGreaterThan(0);

    // A fresh hit lockout holds the next re-shield back.
    ally.barrier = 0;
    shieldUnit.supportCd = 0;
    shieldUnit._shieldHitLockout = 1.1;
    tick(simulation, 2);
    expect(ally.barrier).toBe(0);
  });

  test('the boss spawner counts down and summons the floor boss at reduced health', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const spawner = injectEnemy(state, 'boss_spawner', player.x + 500, player.y, {
      bossSpawnTimer: 0.1, bossSpawnWarnAt: 30, shoveCd: 9, shoveTimer: 0, attackCd: 9,
    });

    tick(simulation, 4);
    expect(state.enemies[spawner.id]).toBeUndefined();
    const boss = Object.values(state.enemies).find(enemy => enemy.boss && !enemy.dead);
    expect(boss).toBeTruthy();
    const definition = ENEMY_CATALOG[boss.type];
    const scaled = scaleCampaignEnemyStats(definition, {
      type: boss.type,
      isBoss: true,
      progressionDepth: state.floorsEntered || state.floorNumber,
      enemyLevel: boss.level,
      elapsedSeconds: state.elapsedSeconds,
      gameMode: state.matchRules?.gameMode || 'normal',
      maxFloor: 10,
      difficulty: state.matchRules?.difficulty,
      partySize: 1,
    });
    expect(boss.health).toBe(Math.round(scaled.maxHealth * 0.72));
    expect(events.some(event => event.eventType === 'ENEMY_SPAWNED' && event.data.enemyId === boss.id && event.data.boss)).toBe(true);
  });

  test("Rich Man's Blues grants its campaign loop-crystal boss payout on the authority", () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    player.items.rich_mans_blues = 2;
    const boss = injectEnemy(state, 'bowman_bane', player.x + 44, player.y, {
      health: 1, maxHealth: 1, contactDamage: 0, attackCd: 9,
    });

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    expect(boss.dead).toBe(true);
    expect(player.loopCrystals).toBe(2);
    expect(player.runCrystalsEarned).toBe(2);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'LOOP_CRYSTALS_AWARDED', data: expect.objectContaining({ playerId: player.id, enemyId: boss.id, amount: 2 }),
    }));
  });

  test("Rich Man's Blues grants its floor-scaled pickup crystals through every authority item transaction", () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    state.pickups.richMansBlues = {
      id: 'richMansBlues', type: 'item', key: 'rich_mans_blues', amount: 1,
      roomId: player.roomId, x: player.x, y: player.y, radius: 13, spawnTick: state.tick,
    };

    simulation.updateGame({}, 0.05);

    expect(player.items.rich_mans_blues).toBe(1);
    expect(player.loopCrystals).toBe(27);
    expect(player.runCrystalsEarned).toBe(27);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'LOOP_CRYSTALS_AWARDED', data: expect.objectContaining({ playerId: player.id, amount: 27, source: 'item_pickup' }),
    }));
  });

  test('Charged Adapter opens a delayed authority portal and pays half coins only on walk-in', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    player.items.charged_adapter = 1;
    player.equipmentSlots = ['charged_adapter'];
    player.escapeReady = true;
    player.escapeChargeKills = 20;
    player.coins = 101;

    simulation.updateGame({ p1: { actions: [{ action: 'ACTIVATE_EQUIPMENT', itemKey: 'charged_adapter' }] } }, 0.05);
    const portal = Object.values(state.pickups).find(pickup => pickup.type === 'adapterPortal');
    expect(portal).toBeTruthy();
    expect(player).toMatchObject({ escapeReady: false, escapeChargeKills: 0, coins: 101, roomId: state.floorState.currentRoomId });

    player.x = portal.x;
    player.y = portal.y;
    tick(simulation, 16);

    const ladder = state.floorState.layout.rooms.find(room => room.type === 'ladder');
    expect(player.roomId).toBe(ladder.id);
    expect(player.coins).toBe(51);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ADAPTER_PORTAL_USED', data: expect.objectContaining({ playerId: player.id, goldSpent: 50, targetRoomId: ladder.id }),
    }));
  });

  test("Mateo's Bag equipment slot routes to the authority stored-potion action", () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    player.items.mateos_bag = 1;
    player.equipmentSlots = ['mateos_bag'];
    player.storedPotions = 1;
    player.hp = 500;

    simulation.updateGame({ p1: { actions: [{ action: 'ACTIVATE_EQUIPMENT', itemKey: 'mateos_bag' }] } }, 0.05);

    expect(player.storedPotions).toBe(0);
    expect(player.hp).toBeGreaterThan(500);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'POTION_USED', data: expect.objectContaining({ playerId: player.id, storedPotions: 0 }),
    }));
  });

  test('Treasure Hunt authority owns vault-key escape, collapse, and the returned exit', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    state.matchRules.gameMode = 'treasure_hunt';
    const escapeRoom = state.floorState.layout.rooms.find(room => room.type === 'combat');
    player.roomId = escapeRoom.id;
    state.pickups.vaultKey = {
      id: 'vaultKey', type: 'treasureKey', roomId: player.roomId,
      x: player.x, y: player.y, radius: 18, spawnTick: state.tick,
    };

    simulation.updateGame({}, 0.05);

    expect(state.treasureHunt).toEqual(expect.objectContaining({ phase: 'escape', hasKey: true }));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'TREASURE_HUNT_KEY_COLLECTED', data: expect.objectContaining({ playerId: player.id }),
    }));
    const nonStartRooms = state.floorState.layout.rooms.filter(room => room.type !== 'start');
    expect(nonStartRooms.some(room => room.hazards?.some(hazard => hazard.source === 'treasure_hunt_trap'))).toBe(true);

    state.treasureHunt.blastTick = 0;
    simulation.updateGame({}, 0.05);
    const currentRoom = state.floorState.layout.rooms.find(room => room.id === player.roomId);
    expect(currentRoom.hazards.some(hazard => hazard.source === 'dungeon_collapse')).toBe(true);

    const start = state.floorState.layout.rooms.find(room => room.type === 'start');
    player.roomId = start.id;
    simulation.updateGame({}, 0.05);

    expect(state.treasureHunt.phase).toBe('returned');
    expect(Object.values(state.interactables).some(item => item.roomId === start.id
      && (item.kind === 'stairs' || item.treasureHuntExitChest))).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'TREASURE_HUNT_RETURNED', data: expect.objectContaining({ roomId: start.id }),
    }));
  });

  test('a Treasure Hunt vault clear yields a key instead of the ordinary stairs', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    state.matchRules.gameMode = 'treasure_hunt';
    const vault = state.floorState.layout.rooms.find(room => room.type === 'combat');
    vault.type = 'boss';
    player.roomId = vault.id;
    const boss = injectEnemy(state, 'bowman_bane', player.x + 44, player.y, {
      roomId: vault.id, health: 1, maxHealth: 1, contactDamage: 0, attackCd: 9,
    });
    state.floorState.encounters[vault.id] = { roomId: vault.id, status: 'active', enemyIds: [boss.id] };

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    expect(Object.values(state.pickups).some(pickup => pickup.type === 'treasureKey' && pickup.roomId === vault.id)).toBe(true);
    expect(Object.values(state.interactables).some(item => item.kind === 'stairs' && item.roomId === vault.id)).toBe(false);
  });

  test('Endless authority opens a shared intermission, sells paid chests, and starts the next wave', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    state.matchRules.gameMode = 'endless';
    const arena = state.floorState.layout.rooms.find(room => room.id === player.roomId);
    arena.type = 'combat';
    const waveEnemy = injectEnemy(state, 'hunter', player.x + 44, player.y, {
      roomId: arena.id, health: 1, maxHealth: 1, contactDamage: 0, attackCd: 9,
    });
    state.floorState.encounters[arena.id] = { roomId: arena.id, status: 'active', enemyIds: [waveEnemy.id] };

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    expect(arena.endlessIntermission).toBe(true);
    const exit = Object.values(state.pickups).find(pickup => pickup.type === 'endlessNextWave');
    const chest = Object.values(state.interactables).find(item => item.kind === 'endless_chest');
    expect(exit).toBeTruthy();
    expect(chest).toBeTruthy();
    player.coins = chest.price + 10;
    player.x = chest.x;
    player.y = chest.y;
    simulation.updateGame({ p1: { actions: [{ action: 'INTERACT', targetEntityId: chest.id }] } }, 0.05);
    expect(chest.opened).toBe(true);
    expect(player.coins).toBe(10);
    expect(player.items[chest.rewardKey]).toBeGreaterThanOrEqual(1);

    player.x = exit.x;
    player.y = exit.y;
    simulation.updateGame({}, 0.05);
    expect(arena.endlessIntermission).toBe(false);
    expect(state.endlessWaveActive).toBe(true);
    simulation.updateGame({}, 0.05);
    expect(Object.values(state.enemies).filter(enemy => !enemy.dead && enemy.roomId === arena.id)).toHaveLength(5);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ENDLESS_WAVE_STARTED', data: expect.objectContaining({ playerId: player.id, roomId: arena.id }),
    }));
  });

  test('Boss Rush authority drafts five of ten starters before stage rewards, serialized next boss, and final victory', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    state.matchRules.gameMode = 'boss_rush';
    const arena = state.floorState.layout.rooms.find(room => room.id === player.roomId);
    arena.type = 'combat';
    arena.doors = { n: false, s: false, e: false, w: false };
    state.floorState.layout.rooms = [arena];
    state.floorState.layout.startRoomId = arena.id;
    state.floorState.layout.exitRoomId = arena.id;
    state.enemies = {};
    state.floorState.encounters = {};

    simulation.updateGame({}, 0.05);
    expect(state.floorNumber).toBe(5);
    expect(player.coins).toBe(120);
    expect(player.pendingUpgrade).toEqual(expect.objectContaining({
      kind: 'boss_rush_starter', picksRemaining: 5, choiceTotal: 10,
    }));
    expect(player.pendingUpgrade.optionIds).toHaveLength(10);
    expect(new Set(player.pendingUpgrade.optionIds).size).toBe(10);
    expect(Object.values(state.enemies).filter(enemy => !enemy.dead)).toHaveLength(0);

    for (let pick = 0; pick < 5; pick += 1) {
      const pending = player.pendingUpgrade;
      simulation.updateGame({ p1: { actions: [{
        action: 'UPGRADE', selectionEventId: pending.selectionEventId, optionId: pending.optionIds[0],
      }] } }, 0.05);
    }
    expect(player.pendingUpgrade).toBeNull();
    expect(events.filter(event => event.eventType === 'BOSS_RUSH_STARTER_ITEM_SELECTED')).toHaveLength(5);
    simulation.updateGame({}, 0.05);
    expect(Object.values(state.enemies).find(enemy => !enemy.dead)).toEqual(expect.objectContaining({
      type: 'queen_cult', level: 2, bossRushBoss: true, bossRushStage: 0,
    }));
    const firstBoss = Object.values(state.enemies).find(enemy => !enemy.dead);
    const expectedFirstBoss = scaleCampaignEnemyStats(getEnemyDefinition('queen_cult'), {
      type: 'queen_cult',
      isBoss: true,
      progressionDepth: state.floorsEntered,
      enemyLevel: firstBoss.level,
      elapsedSeconds: state.elapsedSeconds,
      gameMode: 'boss_rush',
      maxFloor: 10,
      difficulty: state.matchRules?.difficulty,
      partySize: 1,
    });
    expect(firstBoss.maxHealth).toBe(expectedFirstBoss.maxHealth);
    expect(firstBoss.contactDamage).toBe(expectedFirstBoss.contactDamage);
    expect(firstBoss.moveSpeed).toBeCloseTo(expectedFirstBoss.moveSpeed);
    player.x = firstBoss.x - 12;
    player.y = firstBoss.y;
    firstBoss.health = 1;
    firstBoss.queenFinisherDone = true;
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    expect(state.bossRush).toEqual(expect.objectContaining({ stage: 1, active: false }));
    expect(Object.values(state.pickups).some(pickup => pickup.source === 'boss_rush_stage' && pickup.type === 'item')).toBe(true);
    expect(Object.values(state.pickups).some(pickup => pickup.source === 'boss_rush_stage' && pickup.type === 'potion')).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'BOSS_RUSH_STAGE_CLEARED', data: expect.objectContaining({ nextBossType: 'bulk_golem' }) }));
    expect(arena.bossRushIntermission).toBe(true);
    expect(arena.shopStocked).toBe(true);
    expect(arena.shopOffers.length).toBeGreaterThan(0);
    const intermissionChest = Object.values(state.interactables).find(item => item.kind === 'intermission_chest');
    const nextBossExit = Object.values(state.pickups).find(pickup => pickup.type === 'bossRushNextBoss');
    expect(intermissionChest).toBeTruthy();
    expect(nextBossExit).toBeTruthy();

    player.coins = intermissionChest.price + 10;
    player.x = intermissionChest.x;
    player.y = intermissionChest.y;
    simulation.updateGame({ p1: { actions: [{ action: 'INTERACT', targetEntityId: intermissionChest.id }] } }, 0.05);
    expect(intermissionChest.opened).toBe(true);
    expect(player.coins).toBe(10);

    player.x = nextBossExit.x;
    player.y = nextBossExit.y;
    simulation.updateGame({}, 0.05);
    expect(arena.bossRushIntermission).toBe(false);
    expect(state.bossRush).toEqual(expect.objectContaining({ stage: 1, active: true, intermission: false }));
    simulation.updateGame({}, 0.05);
    expect(Object.values(state.enemies).find(enemy => !enemy.dead)).toEqual(expect.objectContaining({
      type: 'bulk_golem', level: 3, bossRushBoss: true, bossRushStage: 1,
    }));

    // Move beyond the first attack's cooldown before exercising the final-clear
    // branch; the old timer-based intermission advanced this clock implicitly.
    state.tick += 80;
    state.bossRush.stage = 5;
    state.bossRush.active = true;
    state.enemies = {};
    state.floorState.encounters[arena.id] = { roomId: arena.id, status: 'active', enemyIds: [], bossRushStage: 5 };
    const finalBoss = injectEnemy(state, 'god', player.x + 44, player.y, {
      roomId: arena.id, health: 1, maxHealth: 1, contactDamage: 0, attackCd: 9,
    });
    state.floorState.encounters[arena.id].enemyIds.push(finalBoss.id);
    player.x = finalBoss.x - 12;
    player.y = finalBoss.y;
    finalBoss.rebirthUsed = true;
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(state.status).toBe('ended');
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'RUN_ENDED', data: expect.objectContaining({ reason: 'boss-rush-completed' }) }));
  });

  test('hunters attack on a cooldown — no walk-over contact damage', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    injectEnemy(state, 'hunter', player.x + 30, player.y);

    tick(simulation, 10); // 0.5s adjacent to the player
    const hits = events.filter(event => event.eventType === 'PLAYER_HIT' && event.data.attackKind === 'hunter');
    expect(hits.length).toBe(1); // one authored swing, then the 1.05s cooldown
  });

  test('lazered elites create the authored, seeded lightning-column pair', () => {
    const first = behaviorHarness();
    const second = behaviorHarness();
    const configure = ({ state }) => injectEnemy(state, 'laser', state.players.p1.x + 240, state.players.p1.y, {
      elite: true,
      eliteTypes: ['lazered'],
      eliteLaserModeIndex: 4, // authored cycle: lightning_columns
      eliteLaserCd: 0,
    });
    configure(first);
    configure(second);

    tick(first.simulation);
    tick(second.simulation);
    const firstHazards = first.state.floorState.layout.rooms
      .find(room => room.id === first.state.floorState.currentRoomId).hazards;
    const secondHazards = second.state.floorState.layout.rooms
      .find(room => room.id === second.state.floorState.currentRoomId).hazards;

    expect(firstHazards).toHaveLength(2);
    expect(firstHazards).toEqual(secondHazards);
    expect(firstHazards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'lightning_column', enemy: true, r: 46, ttl: 1.25,
        tick: 0, interval: 0.36, damage: Math.round(ENEMY_CATALOG.laser.contactDamage * 0.78),
      }),
    ]));
    firstHazards.forEach(hazard => {
      expect(hazard.x).toBeGreaterThanOrEqual(88);
      expect(hazard.x).toBeLessThanOrEqual(812);
      expect(hazard.y).toBeGreaterThanOrEqual(88);
      expect(hazard.y).toBeLessThanOrEqual(612);
    });
  });

  test('guarded rivals warn and hold fire before their campaign warning expires', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 110, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'princess', rivalFriend: false, rivalVendetta: false,
      mirrorMoves: { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorWeapon: 'princess_wand', mirrorWeaponStats: { damage: 20, range: 380, knockback: 100 },
    });

    tick(simulation, 1);
    expect(rival.rivalBrain).toMatchObject({ stance: 'warning', intention: 'observe' });
    expect(player.hp).toBe(1000);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'RIVAL_DISPOSITION_CHANGED', data: expect.objectContaining({ enemyId: rival.id, stance: 'warning', reason: 'proximity' }),
    }));
  });

  test('pending rivals enter the authority with their shared campaign loadout', () => {
    const { state, simulation } = behaviorHarness();
    const room = state.floorState.layout.rooms.find(candidate => candidate.type === 'combat');
    state.players.p1.roomId = room.id;
    state.floorState.currentRoomId = room.id;
    state.rivalRoster = [{ characterKey: 'gelleh', pendingSpawn: true, dead: false, friend: false, vendetta: false }];

    ensureNetworkEncounter(state, simulation.randomService || new RandomService({ matchSeed: state.matchSeed }), () => {}, room.id);
    const rival = Object.values(state.enemies).find(enemy => enemy.type === 'rival');
    expect(rival).toEqual(expect.objectContaining({
      rivalCharacterKey: 'gelleh', mirrorWeapon: 'gelleh_lightning_spear',
      mirrorMoves: expect.objectContaining({ laser: 'blade_justice', smash: 'healing_zone', dash: 'zip_lightning' }),
    }));
    expect(rival.rivalLoadout).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'gelleh_lightning_spear', slot: 'melee' }),
      expect.objectContaining({ key: 'blade_justice', slot: 'laser' }),
      expect.objectContaining({ key: 'healing_zone', slot: 'smash' }),
      expect.objectContaining({ key: 'zip_lightning', slot: 'dash' }),
    ]));
  });

  test('Metao rival Power Disks uses the shared radial disk and shard entities', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 250, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'metao', rivalVendetta: true,
      contactDamage: 40, mirrorMoves: { melee: 'slash', laser: 'power_disks', smash: 'chaos_burst', dash: 'warp' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 0, mirrorSmashCd: 8, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'power_disks', slot: 'laser', damageMult: 0.72 }],
      mirrorItemStats: { beamDamageMultiplier: 1 },
    });

    tick(simulation, 12); // laser wind-up, then the shared eight-disk burst
    const disks = Object.values(state.projectiles).filter(projectile => projectile.ownerId === rival.id && projectile.type === 'disk');
    expect(disks).toHaveLength(8);
    expect(disks.map(disk => Math.round(Math.atan2(disk.vy, disk.vx) * 1e6) / 1e6).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 8 }, (_, index) => Math.round((index * Math.PI * 2 / 8 > Math.PI ? index * Math.PI * 2 / 8 - Math.PI * 2 : index * Math.PI * 2 / 8) * 1e6) / 1e6).sort((a, b) => a - b));
    expect(disks).toEqual(expect.arrayContaining([expect.objectContaining({
      damage: 29, radius: 7, remainingPierces: 0, subSpawn: expect.objectContaining({ kind: 'disk_shard', count: 2 }),
    })]));

    tick(simulation, 4); // 0.2 seconds: each disk emits its first shard pair
    expect(Object.values(state.projectiles).filter(projectile => projectile.ownerId === rival.id && projectile.type === 'disk_shard').length).toBeGreaterThanOrEqual(16);
  });

  test('Mooggy rival Nail Shot uses the shared bounced twelve-nail ring', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 250, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'mooggy', rivalVendetta: true,
      contactDamage: 40, mirrorMoves: { melee: 'slash', laser: 'nail_shot', smash: 'random_pounce', dash: 'mooggy_zoomies' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 0, mirrorSmashCd: 8, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'nail_shot', slot: 'laser', damageMult: 0.85 }],
      mirrorItemStats: { beamDamageMultiplier: 1 },
    });

    tick(simulation, 12);
    const nails = Object.values(state.projectiles).filter(projectile => projectile.ownerId === rival.id && projectile.type === 'nail');
    expect(nails).toHaveLength(12);
    expect(nails).toEqual(expect.arrayContaining([expect.objectContaining({
      damage: 34, radius: 3, bouncesRemaining: 3, hitOptions: expect.objectContaining({ bleedChance: 0.08 }),
    })]));
  });

  test('Mooggy rival Random Pounce uses the shared burst and homing fang plan', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 130, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'mooggy', rivalVendetta: true,
      contactDamage: 40, mirrorMoves: { melee: 'slash', laser: 'nail_shot', smash: 'random_pounce', dash: 'mooggy_zoomies' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'random_pounce', slot: 'smash', damageMult: 1.1 }],
    });

    tick(simulation, 10);
    const fangs = Object.values(state.projectiles).filter(projectile => projectile.ownerId === rival.id && projectile.type === 'fang');
    expect(fangs).toHaveLength(8);
    expect(fangs).toEqual(expect.arrayContaining([expect.objectContaining({
      damage: 22, radius: 5, homing: true, homingTargetId: player.id,
      hitOptions: expect.objectContaining({ bleedChance: 0.55, bleedStacks: 2, bleedDuration: 5 }),
    })]));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ attackKind: 'random_pounce', damage: expect.any(Number) }),
    }));
  });

  test('Gelleh rival Blade Justice owns three shared moving sword entities', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 130, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'gelleh', rivalVendetta: true,
      contactDamage: 40, mirrorMoves: { melee: 'slash', laser: 'blade_justice', smash: 'healing_zone', dash: 'zip_lightning' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 0, mirrorSmashCd: 8, mirrorDashCd: 8,
    });

    tick(simulation, 12);
    expect(rival.rivalJusticeBlades).toHaveLength(3);
    expect(rival.rivalJusticeEffect).toEqual(expect.objectContaining({
      count: 3, durationSeconds: 2.1, radius: 16, reach: 120, damage: 29,
    }));
    const before = rival.rivalJusticeBlades.map(blade => ({ x: blade.x, y: blade.y, life: blade.life }));
    tick(simulation, 2);
    expect(rival.rivalJusticeBlades).toHaveLength(3);
    expect(rival.rivalJusticeBlades.some((blade, index) => blade.x !== before[index].x || blade.y !== before[index].y)).toBe(true);
    expect(rival.rivalJusticeBlades.every((blade, index) => blade.life < before[index].life)).toBe(true);
  });

  test('Metao rival Fire Staff uses the shared full-speed volley, splash, burn, and recoil payload', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 250, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'metao', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'metao_fire_staff',
      mirrorWeaponStats: { damage: 37, range: 470, knockback: 110 },
      mirrorMoves: { melee: 'slash', laser: 'power_disks', smash: 'chaos_burst', dash: 'warp' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'metao_fire_staff', slot: 'melee', damageMult: 0.92 }],
    });

    tick(simulation, 1);
    const fireballs = Object.values(state.projectiles).filter(projectile => projectile.ownerId === rival.id && projectile.type === 'fireball');
    expect(fireballs).toHaveLength(3);
    expect(fireballs).toEqual(expect.arrayContaining([expect.objectContaining({
      damage: 37, radius: 8, splash: 48, splashDamage: 24,
      fireStacks: 2, splashFireStacks: 1, fireDuration: 3.4,
    })]));
    expect(fireballs.map(projectile => Math.round(Math.hypot(projectile.vx, projectile.vy)))).toEqual([560, 560, 560]);
    expect(rival.state).toBe('rivalFireballVolley');
    // Steering and recoil resolve in the same authority step; the resulting
    // velocity still preserves the campaign recoil instead of full chase speed.
    expect(rival.vx).toBeLessThan(100);
  });

  test('Turtle Boy rival Death Ball uses the shared charged projectile instead of a generic smash', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 160, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'turtle_boy', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'extending_staff', mirrorWeaponStats: { damage: 46, range: 130, knockback: 500 },
      mirrorMoves: { melee: 'slash', laser: 'turtle_wave', smash: 'death_ball', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'death_ball', slot: 'smash', damageMult: 1.05 }],
    });

    tick(simulation, 10);
    const ball = Object.values(state.projectiles).find(projectile => projectile.ownerId === rival.id && projectile.type === 'death_ball');
    expect(ball).toEqual(expect.objectContaining({
      damage: 88, radius: 41.5, knockback: 415, remainingPierces: 10,
    }));
    expect(Math.round(Math.hypot(ball.vx, ball.vy))).toBe(370);
  });

  test('Gelleh rival Lightning Spear uses the shared Smite blade payload', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 250, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'gelleh', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'gelleh_lightning_spear',
      mirrorWeaponStats: { damage: 45, range: 420, knockback: 200 },
      mirrorMoves: { melee: 'slash', laser: 'blade_justice', smash: 'healing_zone', dash: 'zip_lightning' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'gelleh_lightning_spear', slot: 'melee', damageMult: 0.94 }],
    });

    tick(simulation, 1);
    const spear = Object.values(state.projectiles).find(projectile => projectile.ownerId === rival.id && projectile.type === 'blade_justice');
    expect(spear).toEqual(expect.objectContaining({
      damage: 38, radius: 7, knockback: 80, remainingPierces: 99,
      statusEffects: [{ key: 'static', chance: 0.35, stacks: 1, duration: 3 }],
    }));
    expect(Math.round(Math.hypot(spear.vx, spear.vy))).toBe(820);
  });

  test('wounded Gelleh rivals create and heal through the shared hostile Healing Zone', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 160, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'gelleh', rivalVendetta: true,
      maxHealth: 100, health: 50, hp: 50, contactDamage: 40,
      mirrorWeapon: 'gelleh_lightning_spear', mirrorWeaponStats: { damage: 45, range: 420, knockback: 200 },
      mirrorMoves: { melee: 'slash', laser: 'blade_justice', smash: 'healing_zone', dash: 'zip_lightning' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'healing_zone', slot: 'smash', healRatio: 0.14 }],
    });

    tick(simulation, 10);
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === rival.roomId);
    const zone = room.hazards.find(hazard => hazard.kind === 'healing_zone' && hazard.ownerId === rival.id);
    expect(zone).toEqual(expect.objectContaining({
      r: 100, ttl: expect.any(Number), healPerSecond: 12.512, damagePerSecond: 20, damageInterval: 0.2,
    }));
    expect(rival.health).toBeGreaterThan(50);
    expect(events.some(event => event.eventType === 'PLAYER_HIT' && event.data.attackKind === 'healing_zone')).toBe(false);
  });

  test('Princess rival Love Bomb uses the shared full-size hostile bomb and detonates in an area', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 250, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'princess', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'princess_wand', mirrorWeaponStats: { damage: 30, range: 380, knockback: 160 },
      mirrorMoves: { melee: 'slash', laser: 'love_bomb_laser', smash: 'kicky_kick', dash: 'flying_unhitable' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 0, mirrorSmashCd: 8, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'love_bomb_laser', slot: 'laser', damageMult: 1 }],
    });

    tick(simulation, 12);
    const bomb = Object.values(state.projectiles).find(projectile => projectile.ownerId === rival.id && projectile.type === 'love_bomb');
    expect(bomb).toEqual(expect.objectContaining({
      damage: 64, radius: 16, aoeRadius: 90, sparkleChance: 0.8, knockback: 180,
    }));
    expect(Math.round(Math.hypot(bomb.vx, bomb.vy))).toBe(420);

    tick(simulation, 12);
    expect(player.hp).toBeLessThan(1000);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'LOVE_BOMB_DETONATED', data: expect.objectContaining({ enemyId: rival.id, targetIds: [player.id] }),
    }));
  });

  test('Metao rival Chaos Burst creates the shared persistent hostile eruption field', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 160, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'metao', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'metao_fire_staff', mirrorWeaponStats: { damage: 22, range: 470, knockback: 110 },
      mirrorMoves: { melee: 'slash', laser: 'power_disks', smash: 'chaos_burst', dash: 'warp' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'chaos_burst', slot: 'smash', damageMult: 0.85 }],
    });

    tick(simulation, 10);
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === rival.roomId);
    const field = room.hazards.find(hazard => hazard.kind === 'chaos_burst' && hazard.ownerId === rival.id);
    expect(field).toEqual(expect.objectContaining({
      r: 180, ttl: expect.any(Number), interval: 0.22, damage: 21, poisonDurationSeconds: 4.8, followEnemy: true,
    }));
    const before = player.hp;
    player.x = field.x;
    player.y = field.y;
    player.radius = 300; // guarantee contact with the seeded eruption geometry without leaving room bounds
    player.invulnerableUntilTick = 0;
    field.tick = 0; // force the next deterministic field pulse
    tick(simulation, 1);
    expect(player.hp).toBeLessThan(before);
    expect(player.statuses?.poison?.stacks || 0).toBeGreaterThan(0);
  });

  test('Princess rival Kicky Kick uses the shared rival-scaled heavy impact', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 130, player.y, {
      level: 11,
      behavior: 'mirror', rivalCharacterKey: 'princess', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'princess_wand', mirrorWeaponStats: { damage: 30, range: 380, knockback: 160 },
      mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'flying_unhitable' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'kicky_kick', slot: 'smash', damageMult: 1.4 }],
    });

    tick(simulation, 10);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: rival.id, attackKind: 'kicky_kick', knockbackMagnitude: 816 }),
    }));
    expect(player.hp).toBeLessThan(1000);
    expect(rival.state).not.toBe('mirrorSmash');
  });

  test('Thorn rival Crimson Smash uses the shared direct hit and eight bleeding rocks', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 130, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'thorn_knight', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'thorns_bleed_blade', mirrorWeaponStats: { damage: 24, range: 72, knockback: 340 },
      mirrorMoves: { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'crimson_smash', slot: 'smash', damageMult: 1.3 }],
    });

    tick(simulation, 10);
    const rocks = Object.values(state.projectiles).filter(projectile => projectile.ownerId === rival.id && projectile.type === 'rock');
    expect(rocks.length).toBeGreaterThanOrEqual(7); // one forward rock can contact in its spawn frame
    expect(rocks).toEqual(expect.arrayContaining([expect.objectContaining({
      damage: 23, radius: 7, remainingPierces: 1,
      statusEffects: [{ key: 'bleed', chance: 0.2, stacks: 1, duration: 4 }],
    })]));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: rival.id, attackKind: 'crimson_smash', knockbackMagnitude: 320 }),
    }));
  });

  test('Mooggy rival Hairball applies its shared poison and short slow payload', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 130, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'mooggy', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'claw_gauntlets', mirrorWeaponStats: { damage: 24, range: 72, knockback: 260 },
      mirrorMoves: { melee: 'slash', laser: 'mooggy_blood_beam', smash: 'mooggy_hairball', dash: 'mooggy_zoomies' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'mooggy_hairball', slot: 'smash', damageMult: 0.9 }],
    });

    tick(simulation, 10);
    expect(player.statuses).toEqual(expect.objectContaining({
      poison: expect.objectContaining({ stacks: 3 }), slow: expect.objectContaining({ stacks: 1 }),
    }));
    expect(rival.state).not.toBe('mirrorSmash');
  });

  test('Mooggy rival Claw Gauntlets executes the shared delayed bleed follow-up', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 30, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'mooggy', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'claw_gauntlets', mirrorWeaponStats: { damage: 40, range: 72, knockback: 0 },
      mirrorMoves: { melee: 'slash', laser: 'mooggy_blood_beam', smash: 'mooggy_hairball', dash: 'mooggy_zoomies' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 99, mirrorSmashCd: 99, mirrorDashCd: 99,
    });

    tick(simulation, 26);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: rival.id, attackKind: 'mirror_claw_gauntlets' }),
    }));
    // The normal campaign hit i-frames can block the damage portion of the
    // 0.12-second follow-up, but the authored swipe and its bleed still occur.
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_DAMAGE_BLOCKED', data: expect.objectContaining({ attackKind: 'claw_gauntlets_followup' }),
    }));
    expect(player.statuses.bleed).toEqual(expect.objectContaining({ stacks: expect.any(Number) }));
  });

  test('Metao rival Potion Bath uses the shared hostile heal, protection, and seven-burst plan', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 130, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'metao', rivalVendetta: true,
      maxHealth: 500, health: 200, hp: 200, contactDamage: 40,
      mirrorWeapon: 'metao_fire_staff', mirrorWeaponStats: { damage: 22, range: 470, knockback: 110 },
      mirrorMoves: { melee: 'slash', laser: 'power_disks', smash: 'potion_bath', dash: 'warp' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'potion_bath', slot: 'smash', damageMult: 1 }],
    });

    tick(simulation, 10);
    expect(rival.health).toBe(300);
    expect(rival.hp).toBe(300);
    expect(rival.invulnerableUntilTick).toBeGreaterThan(state.tick + 80);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: rival.id, attackKind: 'potion_bath', damage: expect.any(Number), knockbackMagnitude: 100 }),
    }));
  });

  test('Gelleh rival Holy Turrets use the shared placement, pulse cadence, and hostile target selection', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 130, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'gelleh', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'gelleh_lightning_spear', mirrorWeaponStats: { damage: 45, range: 420, knockback: 200 },
      mirrorMoves: { melee: 'slash', laser: 'blade_justice', smash: 'holy_turrets', dash: 'zip_lightning' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'holy_turrets', slot: 'smash', damageMult: 0.8 }],
    });

    tick(simulation, 11);
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === rival.roomId);
    const turrets = room.hazards.filter(hazard => hazard.kind === 'holy_turret' && hazard.ownerId === rival.id);
    expect(turrets).toHaveLength(3);
    expect(turrets).toEqual(expect.arrayContaining([expect.objectContaining({
      r: 26, ttl: expect.any(Number), interval: 0.9, range: 300, burstRadius: 48, damage: 19,
    })]));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: rival.id, attackKind: 'holy_turrets', knockbackMagnitude: 120 }),
    }));
  });

  test('Gelleh rival Excalibur Strike uses the shared delayed five-sword impact plan', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 130, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'gelleh', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'gelleh_lightning_spear', mirrorWeaponStats: { damage: 45, range: 420, knockback: 200 },
      mirrorMoves: { melee: 'slash', laser: 'blade_justice', smash: 'excalibur_strike', dash: 'zip_lightning' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
      rivalLoadout: [{ key: 'excalibur_strike', slot: 'smash', damageMult: 1 }],
    });

    tick(simulation, 20);
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === rival.roomId);
    const swords = room.hazards.filter(hazard => hazard.kind === 'excalibur_strike' && hazard.ownerId === rival.id);
    expect(swords).toHaveLength(5);
    expect(swords).toEqual(expect.arrayContaining([expect.objectContaining({
      r: 76, damage: 40, impactDelay: expect.any(Number), ttl: expect.any(Number),
    })]));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: rival.id, attackKind: 'excalibur_strike', knockbackMagnitude: 180 }),
    }));
  });

  test('Gelleh rival Zip Lightning uses the shared safe three-hop movement plan', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 180, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'gelleh', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'gelleh_lightning_spear', mirrorWeaponStats: { damage: 45, range: 420, knockback: 200 },
      mirrorMoves: { melee: 'slash', laser: 'blade_justice', smash: 'healing_zone', dash: 'zip_lightning' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 0,
      rivalLoadout: [{ key: 'zip_lightning', slot: 'dash', damageMult: 1 }],
    });

    tick(simulation, 6);
    expect(Math.hypot(rival.x - player.x, rival.y - player.y)).toBeLessThanOrEqual(rival.radius + player.radius + 24);
    expect(rival.invulnerableUntilTick).toBeGreaterThan(state.tick);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: rival.id, attackKind: 'zip_lightning', knockbackMagnitude: 185 }),
    }));
  });

  test('Thorn rival Knight Slash Dash uses the shared beyond-target hop and bleed payload', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 180, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'thorn_knight', rivalVendetta: true,
      contactDamage: 40, mirrorWeapon: 'thorns_bleed_blade', mirrorWeaponStats: { damage: 24, range: 72, knockback: 340 },
      mirrorMoves: { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'knight_slash_dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 0,
      rivalLoadout: [{ key: 'knight_slash_dash', slot: 'dash', damageMult: 1.2 }],
    });

    tick(simulation, 6);
    expect(rival.x).toBeLessThan(player.x);
    expect(player.statuses?.bleed?.stacks).toBeGreaterThanOrEqual(3);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: rival.id, attackKind: 'knight_slash_dash', knockbackMagnitude: 170 }),
    }));
  });

  test('Princess rival Flight and Shield retain campaign invulnerability and stacking barrier policies', () => {
    const flightHarness = behaviorHarness();
    const flightPlayer = flightHarness.state.players.p1;
    const flyer = injectEnemy(flightHarness.state, 'rival', flightPlayer.x + 180, flightPlayer.y, {
      behavior: 'mirror', rivalCharacterKey: 'princess', rivalVendetta: true,
      contactDamage: 40, mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'flying_unhitable' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 0,
    });
    tick(flightHarness.simulation, 6);
    expect(flyer.rivalFlightUntilTick).toBeGreaterThan(flightHarness.state.tick + 80);
    expect(flyer.rivalFlightUntilTick).toBeLessThanOrEqual(flightHarness.state.tick + 100);
    expect(flyer.invulnerableUntilTick).toBe(flyer.rivalFlightUntilTick);

    const copiedFlightHarness = behaviorHarness();
    const copiedFlightPlayer = copiedFlightHarness.state.players.p1;
    const copiedFlyer = injectEnemy(copiedFlightHarness.state, 'mirror_knight', copiedFlightPlayer.x + 180, copiedFlightPlayer.y, {
      behavior: 'mirror', mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'flying_unhitable' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 0,
    });
    tick(copiedFlightHarness.simulation, 6);
    expect(copiedFlyer.rivalFlightUntilTick).toBeUndefined();
    expect(copiedFlyer.invulnerableUntilTick).toBeGreaterThan(copiedFlightHarness.state.tick + 15);
    expect(copiedFlyer.invulnerableUntilTick).toBeLessThan(copiedFlightHarness.state.tick + 30);

    const shieldHarness = behaviorHarness();
    const shieldPlayer = shieldHarness.state.players.p1;
    const shielder = injectEnemy(shieldHarness.state, 'rival', shieldPlayer.x + 180, shieldPlayer.y, {
      behavior: 'mirror', rivalCharacterKey: 'princess', rivalVendetta: true,
      maxHealth: 500, health: 500, barrier: 30, contactDamage: 40,
      mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'princess_shield' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 0,
    });
    tick(shieldHarness.simulation, 6);
    expect(shielder.barrier).toBe(230);

    const cowardHarness = behaviorHarness();
    const cowardPlayer = cowardHarness.state.players.p1;
    const coward = injectEnemy(cowardHarness.state, 'mirror_knight', cowardPlayer.x + 300, cowardPlayer.y, {
      behavior: 'mirror', mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'cowards_way' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 0,
    });
    tick(cowardHarness.simulation, 6);
    expect(coward.invulnerableUntilTick).toBeGreaterThan(cowardHarness.state.tick);

    const stompHarness = behaviorHarness();
    const stompPlayer = stompHarness.state.players.p1;
    const stomper = injectEnemy(stompHarness.state, 'mirror_knight', stompPlayer.x + 300, stompPlayer.y, {
      behavior: 'mirror', mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'nimrod_stomp' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 0,
    });
    tick(stompHarness.simulation, 6);
    expect(Math.hypot(stomper.x - stompPlayer.x, stomper.y - stompPlayer.y)).toBeLessThanOrEqual(14);
    expect(stompHarness.events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: stomper.id, attackKind: 'mirror_stomp', knockbackMagnitude: 310 }),
    }));

    const kickHarness = behaviorHarness();
    const kickPlayer = kickHarness.state.players.p1;
    const kicker = injectEnemy(kickHarness.state, 'mirror_knight', kickPlayer.x + 150, kickPlayer.y, {
      behavior: 'mirror', mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
    });
    tick(kickHarness.simulation, 12);
    expect(kickHarness.events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: kicker.id, attackKind: 'mirror_kick', knockbackMagnitude: 680 }),
    }));

    const healingHarness = behaviorHarness();
    const healingPlayer = healingHarness.state.players.p1;
    const healer = injectEnemy(healingHarness.state, 'mirror_knight', healingPlayer.x + 100, healingPlayer.y, {
      behavior: 'mirror', maxHealth: 500, health: 300,
      mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'healing_zone', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
    });
    tick(healingHarness.simulation, 12);
    expect(healer.health).toBe(340);

    const fireHarness = behaviorHarness();
    const firePlayer = fireHarness.state.players.p1;
    injectEnemy(fireHarness.state, 'mirror_knight', firePlayer.x + 100, firePlayer.y, {
      behavior: 'mirror', mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'floor_lava', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
    });
    tick(fireHarness.simulation, 12);
    expect(firePlayer.statuses?.fire?.stacks).toBeGreaterThanOrEqual(2);

    const laserHarness = behaviorHarness();
    const laserPlayer = laserHarness.state.players.p1;
    injectEnemy(laserHarness.state, 'mirror_knight', laserPlayer.x + 300, laserPlayer.y, {
      behavior: 'mirror', mirrorMoves: { melee: 'slash', laser: 'power_disks', smash: 'kicky_kick', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 0, mirrorSmashCd: 8, mirrorDashCd: 8,
    });
    tick(laserHarness.simulation, 14);
    expect(Object.values(laserHarness.state.projectiles).filter(projectile => projectile.attackKind === 'mirror_disk')).toHaveLength(8);

    const justiceHarness = behaviorHarness();
    const justicePlayer = justiceHarness.state.players.p1;
    const justice = injectEnemy(justiceHarness.state, 'mirror_knight', justicePlayer.x + 120, justicePlayer.y, {
      behavior: 'mirror', mirrorMoves: { melee: 'slash', laser: 'blade_justice', smash: 'kicky_kick', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 0, mirrorSmashCd: 8, mirrorDashCd: 8,
    });
    tick(justiceHarness.simulation, 14);
    expect(justiceHarness.events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: justice.id, attackKind: 'mirror_blade', knockbackMagnitude: 280 }),
    }));

    const columnHarness = behaviorHarness();
    const columnPlayer = columnHarness.state.players.p1;
    const columnCaster = injectEnemy(columnHarness.state, 'mirror_knight', columnPlayer.x + 300, columnPlayer.y, {
      behavior: 'mirror', mirrorMoves: { melee: 'slash', laser: 'lightning_columns', smash: 'kicky_kick', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 0, mirrorSmashCd: 8, mirrorDashCd: 8,
    });
    tick(columnHarness.simulation, 14);
    expect(columnHarness.state.floorState.layout.rooms.find(room => room.id === columnCaster.roomId).hazards
      .filter(hazard => hazard.ownerId === columnCaster.id && hazard.kind === 'lightning_column')).toHaveLength(2);

    const chaosHarness = behaviorHarness();
    const chaosPlayer = chaosHarness.state.players.p1;
    const chaosCaster = injectEnemy(chaosHarness.state, 'mirror_knight', chaosPlayer.x + 160, chaosPlayer.y, {
      behavior: 'mirror', mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'chaos_burst', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
    });
    tick(chaosHarness.simulation, 12);
    expect(chaosHarness.events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: chaosCaster.id, attackKind: 'mirror_chaos', knockbackMagnitude: 120 }),
    }));

    const zipHarness = behaviorHarness();
    const zipPlayer = zipHarness.state.players.p1;
    const zipper = injectEnemy(zipHarness.state, 'mirror_knight', zipPlayer.x + 180, zipPlayer.y, {
      behavior: 'mirror', contactDamage: 40,
      mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'zip_lightning' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 0,
    });
    tick(zipHarness.simulation, 5);
    expect(zipper.mirrorDashMove).toBe('zip_lightning');
    expect(Math.hypot(zipper.vx, zipper.vy)).toBeCloseTo(700, 8);

    const fireballsHarness = behaviorHarness();
    const fireballsPlayer = fireballsHarness.state.players.p1;
    injectEnemy(fireballsHarness.state, 'mirror_knight', fireballsPlayer.x + 90, fireballsPlayer.y, {
      behavior: 'mirror', mirrorWeapon: '', mirrorWeaponStats: null,
      mirrorMoves: { melee: 'fire_balls', laser: 'love_beam', smash: 'kicky_kick', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 8,
    });
    tick(fireballsHarness.simulation, 2);
    expect(Object.values(fireballsHarness.state.projectiles)
      .filter(projectile => projectile.attackKind === 'mirror_fire_balls')).toHaveLength(3);

    const missileHarness = behaviorHarness();
    const missilePlayer = missileHarness.state.players.p1;
    const missileCaster = injectEnemy(missileHarness.state, 'mirror_knight', missilePlayer.x + 160, missilePlayer.y, {
      behavior: 'mirror', mirrorItemStats: { homingMissileChance: 1 },
      mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'hammer_smash', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
    });
    missileCaster.mirrorPendingAction = 'smash';
    missileCaster.mirrorPendingSmash = 'hammer_smash';
    missileCaster.mirrorWindupUntilTick = missileHarness.state.tick;
    tick(missileHarness.simulation, 1);
    expect(Object.values(missileHarness.state.projectiles)
      .filter(projectile => projectile.attackKind === 'mirror_homing_missile')).toHaveLength(2);

    const projectileHarness = behaviorHarness();
    const projectilePlayer = projectileHarness.state.players.p1;
    injectEnemy(projectileHarness.state, 'mirror_knight', projectilePlayer.x + 300, projectilePlayer.y, {
      behavior: 'mirror', mirrorWeapon: 'hunters_bow', mirrorWeaponStats: { damage: 24, range: 520, knockback: 140 },
      mirrorItemStats: { projectileSpeedMultiplier: 1.5, projectileBounces: 2, projectileHomingStrength: 0.2 },
      mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 8,
    });
    tick(projectileHarness.simulation, 2);
    const copiedShot = Object.values(projectileHarness.state.projectiles).find(projectile => projectile.attackKind === 'mirror_hunters_bow');
    expect(Math.hypot(copiedShot.vx, copiedShot.vy)).toBeCloseTo(1140, 8);
    expect(copiedShot.bouncesRemaining).toBe(2);
    expect(copiedShot.homing).toBe(true);

    const directProcHarness = behaviorHarness();
    const directProcPlayer = directProcHarness.state.players.p1;
    const directProcCaster = injectEnemy(directProcHarness.state, 'mirror_knight', directProcPlayer.x + 90, directProcPlayer.y, {
      behavior: 'mirror', mirrorItemStats: { snakeKnifePoisonChance: 1, knockbackMultiplier: 2 },
      mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 0, mirrorDashCd: 8,
    });
    directProcCaster.mirrorPendingAction = 'smash';
    directProcCaster.mirrorPendingSmash = 'kicky_kick';
    directProcCaster.mirrorWindupUntilTick = directProcHarness.state.tick;
    tick(directProcHarness.simulation, 1);
    expect(directProcPlayer.statuses?.poison?.stacks).toBeGreaterThanOrEqual(1);
    expect(directProcHarness.events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: directProcCaster.id, attackKind: 'mirror_kick', knockbackMagnitude: 1360 }),
    }));
  });

  test('Mooggy rival Zoomies drives the campaign twelve-second 1.55x chase speed', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 180, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'mooggy', rivalVendetta: true,
      contactDamage: 40, moveSpeed: 200,
      mirrorMoves: { melee: 'slash', laser: 'mooggy_blood_beam', smash: 'mooggy_hairball', dash: 'mooggy_zoomies' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 0,
    });

    tick(simulation, 6);
    expect(rival.rivalHasteUntilTick).toBeGreaterThan(state.tick + 220);
    tick(simulation, 1);
    expect(Math.hypot(rival.vx, rival.vy)).toBeGreaterThan(80);
  });

  test('Metao rival Warp uses the campaign safe-landing search around blocked destinations', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.structures = [{ kind: 'pillar', x: player.x + 72, y: player.y, w: 48, h: 48 }];
    const rival = injectEnemy(state, 'rival', player.x + 180, player.y, {
      behavior: 'mirror', rivalCharacterKey: 'metao', rivalVendetta: true,
      contactDamage: 40,
      mirrorMoves: { melee: 'slash', laser: 'power_disks', smash: 'chaos_burst', dash: 'warp' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 },
      mirrorLaserCd: 8, mirrorSmashCd: 8, mirrorDashCd: 0,
    });

    tick(simulation, 6);
    expect(Math.hypot(rival.x - (player.x + 72), rival.y - player.y)).toBeGreaterThan(42);
    expect(rival.invulnerableUntilTick).toBeGreaterThan(state.tick);
  });

  test('rival alternative beam profiles retain their authored fan, damage, and status payloads', () => {
    const thornHarness = behaviorHarness();
    const thornPlayer = thornHarness.state.players.p1;
    thornPlayer.radius = 80; // exercise the four offset rays, not only the omitted centerline
    const thorn = injectEnemy(thornHarness.state, 'rival', thornPlayer.x + 220, thornPlayer.y, {
      behavior: 'mirror', rivalCharacterKey: 'thorn_knight', rivalVendetta: true, contactDamage: 40,
      mirrorMoves: { melee: 'slash', laser: 'thorn_blood_beams', smash: 'crimson_smash', dash: 'dash' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 }, mirrorLaserCd: 0, mirrorSmashCd: 8, mirrorDashCd: 8,
    });
    tick(thornHarness.simulation, 12);
    expect(thorn.rivalBeamPaths).toHaveLength(4);
    expect(thornHarness.events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: thorn.id, attackKind: 'thorn_blood_beams', knockbackMagnitude: 60 }),
    }));

    const wizardHarness = behaviorHarness();
    const wizardPlayer = wizardHarness.state.players.p1;
    const wizard = injectEnemy(wizardHarness.state, 'rival', wizardPlayer.x + 220, wizardPlayer.y, {
      behavior: 'mirror', rivalCharacterKey: 'metao', rivalVendetta: true, contactDamage: 40,
      mirrorMoves: { melee: 'slash', laser: 'wizard_lazer', smash: 'chaos_burst', dash: 'warp' },
      mirrorCooldowns: { melee: 0.4, laser: 3.2, smash: 4.2, dash: 1.8 }, mirrorLaserCd: 0, mirrorSmashCd: 8, mirrorDashCd: 8,
    });
    tick(wizardHarness.simulation, 12);
    expect(wizard.mirrorBeamUntilTick).toBeGreaterThan(wizardHarness.state.tick);
    expect(wizardHarness.events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: wizard.id, attackKind: 'wizard_lazer', knockbackMagnitude: 150 }),
    }));
  });
});

describe('shared behavior module in isolation', () => {
  test('projectile evade jukes perpendicular to the incoming threat', () => {
    const behaviors = createCampaignEnemyBehaviors({
      getPlayer: () => ({ id: 'p', x: 0, y: 0, r: 18 }),
      getPlayers: () => [],
      getTuning: () => ({ reaction: 1, rangedCadence: 1, supportPower: 1 }),
      getEvadeDifficultyRank: () => 4,
      random: () => 0,
      bounds: () => ({ wall: 28, width: 900, height: 700 }),
      isBlocked: () => false,
      getHostileThreat: () => ({ segment: { x1: 100, y1: 300, x2: 500, y2: 300 }, sourceId: 'proj-1' }),
      isPointThreatenedByPlayerBeam: () => false,
      damagePlayer: () => {},
    });
    const enemy = { id: 'e1', type: 'hunter', x: 300, y: 300, vx: 0, vy: 0, r: 15, stun: 0 };
    expect(behaviors.updateEnemyProjectileEvade(enemy, 0.05)).toBe(true);
    expect(enemy.projectileEvadeTime).toBeGreaterThan(0);
    behaviors.updateEnemyProjectileEvade(enemy, 0.05);
    expect(Math.hypot(enemy.vx, enemy.vy)).toBeGreaterThan(400);
  });

  test('machine gunner wind-up leads into a multi-shot burst', () => {
    const shots = [];
    const behaviors = createCampaignEnemyBehaviors({
      getPlayer: () => ({ id: 'p', x: 500, y: 300, r: 18 }),
      getPlayers: () => [{ id: 'p', x: 500, y: 300, r: 18 }],
      getTuning: () => ({ reaction: 1, rangedCadence: 1, supportPower: 1 }),
      getEvadeDifficultyRank: () => 0,
      random: () => 0.5,
      bounds: () => ({ wall: 28, width: 900, height: 700 }),
      isBlocked: () => false,
      getCoverRects: () => [],
      getHostileThreat: () => null,
      isPointThreatenedByPlayerBeam: () => false,
      damagePlayer: () => {},
      spawnProjectile: (_enemy, descriptor) => shots.push(descriptor),
    });
    const enemy = {
      id: 'mg', type: 'machine_gunner', x: 300, y: 300, vx: 0, vy: 0,
      r: 17, speed: 112, dmg: 8, hp: 96, max: 96, stun: 0,
      windup: 0, beamTime: 0, beamTick: 0, beamAngle: 0, swingTime: 0, attackCd: 0,
    };
    behaviors.updateMachineGunnerEnemy(enemy, 0.05);
    expect(enemy.windup).toBeGreaterThan(0);
    for (let index = 0; index < 60 && shots.length < 5; index += 1) {
      behaviors.updateMachineGunnerEnemy(enemy, 0.05);
    }
    expect(shots.length).toBeGreaterThanOrEqual(5);
    expect(shots.every(shot => shot.kind === 'machine_round')).toBe(true);
    expect(enemy.attackAnimT).toBeGreaterThan(0);
  });

  test('triples every Bulk Golem knockback source without changing regular Golems', () => {
    const player = { id: 'p', x: 0, y: 0, r: 18 };
    const blasts = [];
    const hits = [];
    const shots = [];
    const behaviors = createCampaignEnemyBehaviors({
      getPlayer: () => player,
      getPlayers: () => [player],
      getTuning: () => ({ reaction: 1, rangedCadence: 1, supportPower: 1 }),
      random: () => 0.5,
      bounds: () => ({ wall: 28, width: 900, height: 700 }),
      isBlocked: () => false,
      getSlowMultiplier: () => 1,
      blastRadius: (...args) => blasts.push(args),
      damagePlayer: (...args) => hits.push(args),
      spawnProjectile: (_enemy, descriptor) => shots.push(descriptor),
    });
    const base = {
      id: 'bulk', type: 'bulk_golem', x: 0, y: 0, vx: 0, vy: 0,
      r: 58, speed: 78, dmg: 31, hp: 1280, max: 1280, stun: 0,
      windup: 0, spitWindup: 0, dashTime: 0, attackCd: 9, jumpCd: 99, aoeTime: 99,
    };

    behaviors.updateBulkGolemBoss({
      ...base,
      bulkJumpTime: 0.01,
      bulkJumpDuration: 0.82,
      bulkJumpStartX: 0,
      bulkJumpStartY: 0,
      bulkJumpTargetX: 0,
      bulkJumpTargetY: 0,
    }, 0.02);
    behaviors.updateBulkGolemBoss({ ...base, aoeTime: 0.01 }, 0.02);
    behaviors.updateGolemEnemy({
      ...base,
      dashTime: 0.01,
      dashHit: false,
      dashAngle: 0,
    }, 0.02);
    behaviors.updateGolemEnemy({ ...base, spitWindup: 0.01 }, 0.02);
    behaviors.updateGolemEnemy({
      ...base,
      id: 'regular',
      type: 'golem',
      r: 20,
      dashTime: 0.01,
      dashHit: false,
      dashAngle: 0,
    }, 0.02);

    expect(BULK_GOLEM_KNOCKBACK_MULTIPLIER).toBe(3);
    expect(blasts.map(call => call[5])).toEqual([330 * 3, 200 * 3]);
    expect(hits.map(call => call[4])).toEqual([280 * 3, 280]);
    expect(shots.map(shot => shot.knockback)).toEqual([120 * 3]);
  });
});

describe('authored boss behaviors on the authority', () => {
  test('the Cult Queen summons faithful, fires draining missiles, and dies in her finisher blast', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const queen = injectEnemy(state, 'queen_cult', player.x + 300, player.y, {
      summonCd: 0.01, queenMissileCd: 0.01, novaCd: 9, novaTimer: 0, attackCd: 9,
    });

    tick(simulation, 2);
    const missiles = Object.values(state.projectiles).filter(projectile => projectile.type === 'cult_missile');
    expect(missiles.length).toBeGreaterThanOrEqual(1);
    expect(missiles[0]).toEqual(expect.objectContaining({ homing: true, drainHeal: expect.any(Number) }));
    expect(Object.values(state.enemies).some(enemy => enemy.summonedBy === queen.id)).toBe(true);
    expect(events.some(event => event.eventType === 'ENEMY_SPOKE' && event.data.enemyId === queen.id)).toBe(true);
    expect(queen.attackAnimT).toBeGreaterThan(0);

    // Drop her to the finisher threshold: she roots, telegraphs, detonates, dies.
    // Stand inside her 190px telegraph so the blast connects.
    player.x = queen.x - 120;
    player.y = queen.y;
    queen.health = Math.ceil(queen.maxHealth * 0.04);
    tick(simulation, 1);
    expect(queen.queenFinisherActive).toBe(true);
    tick(simulation, 40); // 1.6s windup at 20Hz, then the blast
    expect(queen.dead).toBe(true);
    expect(events.some(event => event.eventType === 'PLAYER_HIT' && event.data.attackKind === 'queen_cult_blast')).toBe(true);
  });

  test("Bowman's Bane phases at half health and carpets the room in lightning", () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const bowman = injectEnemy(state, 'bowman_bane', player.x + 250, player.y, {
      phase: 1, columnCd: 0.01, bowmanWarpCd: 99, thunderSmashCd: 9, attackCd: 9,
    });

    tick(simulation, 2);
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    expect((room.hazards || []).some(hazard => hazard.kind === 'lightning_column' && hazard.enemy)).toBe(true);

    bowman.health = Math.round(bowman.maxHealth * 0.4);
    tick(simulation, 1);
    expect(bowman.phase).toBe(2);
    expect((room.hazards || []).filter(hazard => hazard.kind === 'lightning_strike_line').length).toBe(5);
    expect(events.some(event => event.eventType === 'ENEMY_SPOKE' && /SONICHU/.test(event.data.text))).toBe(true);

    // Once he stops recasting, his hazards expire out of authoritative state.
    bowman.dead = true;
    bowman.health = 0;
    bowman.deathTick = state.tick;
    tick(simulation, 130);
    expect((room.hazards || []).filter(hazard => hazard.enemy).length).toBe(0);
  });

  test('the Handsome Devil lays red spikes and a lava grid in phase one', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const devil = injectEnemy(state, 'handsome_devil', player.x + 300, player.y, {
      phase: 1, spikeCd: 0.01, lavaGridCd: 0.01, devilLaserCd: 9, clawCd: 9, giantLaserCd: 99, attackCd: 9, beamRange: 560,
    });

    tick(simulation, 2);
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    const spikes = (room.hazards || []).filter(hazard => hazard.kind === 'red_spikes');
    expect(spikes).toHaveLength(5);
    expect(spikes.every(hazard => hazard.damage === getHandsomeDevilSpikeDamage(devil.dmg))).toBe(true);
    expect((room.hazards || []).filter(hazard => hazard.kind === 'lava' && hazard.enemy).length).toBe(5);
  });

  test('nerfs Handsome Devil spike damage by 25% without changing his base damage', () => {
    const previousSpikeDamage = Math.round(40 * 1.1);
    expect(previousSpikeDamage).toBe(44);
    expect(getHandsomeDevilSpikeDamage(40)).toBe(33);
  });

  test('the Bulk Golem leaps at distant players and slams down with an impact blast', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const golem = injectEnemy(state, 'bulk_golem', player.x + 400, player.y, {
      aoeTime: 99, jumpCd: 0.01, attackCd: 9,
    });

    tick(simulation, 2);
    expect(golem.bulkJumpTime).toBeGreaterThan(0);
    expect(golem.airborne).toBe(true);
    tick(simulation, 20); // 0.82s flight completes
    expect(golem.airborne).toBe(false);
    expect(events.some(event => event.eventType === 'ENEMY_ATTACKED' && event.data.attackKind === 'bulk_golem_blast')).toBe(true);
    // He lands near his target spacing of the player, not at his origin.
    expect(Math.hypot(golem.x - player.x, golem.y - player.y)).toBeLessThan(320);
  });

  test('the god cycles authored patterns and its sword rings home in', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const god = injectEnemy(state, 'god', player.x + 300, player.y, {
      phase: 1, partitionAngles: [], partitionAngle: 0, partitionRotationDir: 1, partitionRotationSpeed: 0, attackCd: 0,
    });

    let sawPattern = false;
    for (let index = 0; index < 80 && !sawPattern; index += 1) {
      simulation.updateGame({}, 0.05);
      sawPattern = ['godLaser', 'godSweep', 'godPartition', 'godCharge', 'godSwordRing'].includes(god.state)
        || god.beamTime > 0 || god.dashTime > 0
        || Object.values(state.projectiles).some(projectile => projectile.type === 'god_sword');
    }
    expect(sawPattern).toBe(true);
  });
});

describe('player hits shove and stun enemies (game feel)', () => {
  test('a beam tick knocks the enemy back along the beam and heavy hits stun', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    player.level = 11;
    const enemy = injectEnemy(state, 'hunter', player.x + 60, player.y, { attackCd: 9 });
    const startX = enemy.x;

    // Fire blood_beam straight at the enemy (+x) and let it tick.
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 }] } }, 0.05);
    for (let step = 0; step < 3; step += 1) {
      simulation.updateGame({ p1: { moveX: 0, moveY: 0, aimDirection: 0, buttons: 1 } }, 0.05);
    }
    // Enemy shoved forward (+x) by the beam knockback, not standing still.
    expect(enemy.x).toBeGreaterThan(startX + 5);
    // Level 11 adds ten 2% gains to Blood Beam's authored 60 knockback.
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ENEMY_HIT', data: expect.objectContaining({ enemyId: enemy.id, knockback: 72 }),
    }));
  });

  test('a smash detonation shoves enemies outward and stuns them', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    // crimson_smash is thorn_knight's default smash (radius AoE around the hero).
    // A golem is heavy enough to survive the blast and read the shove/stun.
    const enemy = injectEnemy(state, 'golem', player.x + 40, player.y, { attackCd: 9, health: 5000, maxHealth: 5000 });
    const startX = enemy.x;

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'crimson_smash', aimDirection: 0 }] } }, 0.05);
    // The heavy blast stuns the enemy this tick; while stunned it can't re-steer,
    // so the outward impulse carries it over the next few movement ticks.
    expect(enemy.stunnedUntilTick).toBeGreaterThan(state.tick);
    tick(simulation, 3);
    expect(enemy.x).toBeGreaterThan(startX); // shoved away from the blast center
  });
});

describe('the god cheats death and escalates through phases', () => {
  test('lethal damage revives the god at 90% HP in phase 2, then it climbs to phase 5', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    const god = injectEnemy(state, 'god', player.x + 250, player.y, {
      phase: 1, partitionAngles: [], partitionAngle: 0, partitionRotationDir: 1, partitionRotationSpeed: 0, attackCd: 9,
    });
    god.maxHealth = 4600;
    god.health = 4600;

    // A killing blow -> Divine Rebirth instead of death.
    god.health = 1;
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 }] } }, 0.05);
    for (let step = 0; step < 3; step += 1) {
      simulation.updateGame({ p1: { moveX: 0, moveY: 0, aimDirection: 0, buttons: 1 } }, 0.05);
    }
    expect(god.dead).toBe(false);
    expect(god.rebirthUsed).toBe(true);
    expect(god.phase).toBe(2);
    expect(god.health).toBe(Math.round(4600 * 0.9));
    expect(events.some(event => event.eventType === 'ENEMY_SPOKE' && /REBIRTH/.test(event.data.text))).toBe(true);

    // Drop to 20% -> phase 3 spawns the boss council.
    god.invulnerableUntilTick = 0;
    god.health = Math.round(god.maxHealth * 0.19);
    tick(simulation, 2);
    expect(god.phase3Triggered).toBe(true);
    const council = Object.values(state.enemies).filter(enemy => enemy.summonedBy === god.id && enemy.boss && !enemy.dead);
    expect(council.length).toBe(4);

    // 12% -> phase 4, 6% -> phase 5.
    god.invulnerableUntilTick = 0;
    god.health = Math.round(god.maxHealth * 0.11);
    tick(simulation, 1);
    expect(god.phase4Triggered).toBe(true);
    god.invulnerableUntilTick = 0;
    god.health = Math.round(god.maxHealth * 0.05);
    tick(simulation, 1);
    expect(god.phase5Triggered).toBe(true);
  });

  test('the god is untouchable during its phase-shift reposition', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const god = injectEnemy(state, 'god', player.x + 250, player.y, {
      phase: 2, rebirthUsed: true, attackCd: 9,
      partitionAngles: [], partitionAngle: 0, partitionRotationDir: 1, partitionRotationSpeed: 0,
    });
    god.maxHealth = 4600;
    god.health = Math.round(god.maxHealth * 0.19);

    tick(simulation, 1); // triggers phase 3 -> sets invulnerability window
    expect(god.invulnerableUntilTick).toBeGreaterThan(state.tick);
    const hpAfterPhase = god.health;
    // Beam it while invulnerable: no health lost.
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 }] } }, 0.05);
    simulation.updateGame({ p1: { moveX: 0, moveY: 0, aimDirection: 0, buttons: 1 } }, 0.05);
    expect(god.health).toBe(hpAfterPhase);
  });
});

describe('the mirror champion fights with the triggering player\'s kit', () => {
  function injectMirror(state, player, overrides = {}) {
    return injectEnemy(state, 'mirror_knight', player.x + 220, player.y, {
      boss: true, mirrorExactCopy: true,
      maxHealth: 400, health: 400, moveSpeed: 228,
      attackSpeed: 1,
      mirrorMoves: { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' },
      mirrorMoveStats: { blood_beam: { damage: 20 }, crimson_smash: { damage: 40 } },
      mirrorItemStats: { beamDamageMultiplier: 1, aoeDamageMultiplier: 1, bleedChance: 0 },
      mirrorWeapon: '',
      mirrorWeaponStats: null,
      mirrorCooldowns: { melee: 0.4, laser: 0.01, smash: 0.01, dash: 0.01 },
      beamDamage: 20, smashDamage: 40, dmg: 24, contactDamage: 24,
      attackCd: 0,
      ...overrides,
    });
  }

  test('a started mirror challenge spawns one champion mirroring the activator', () => {
    const { state, events } = behaviorHarness();
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.type = 'challenge';
    room.challengeType = 'mirror';
    room.challengeStarted = true;
    room.mirrorSourcePlayerId = 'p1';
    player.equippedMoves = { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'warp' };
    player.equippedWeapon = 'thorns_bleed_blade';
    player.maxHp = 260;
    player.hp = 137;
    player.items.drink_master = 1;
    player.anvilUpgrades = { weapon: { thorns_bleed_blade: { damage: 2 } }, move: {} };
    delete state.floorState.encounters[room.id];

    const { ensureNetworkEncounter } = require('../js/simulation/NetworkCombatSystem');
    const random = new (require('../js/simulation/RandomService').RandomService)({ matchSeed: 'mirror' });
    ensureNetworkEncounter(state, random, (t, d) => events.push({ eventType: t, data: d }), room.id);

    const champion = Object.values(state.enemies).find(enemy => enemy.type === 'mirror_knight' && !enemy.dead);
    expect(champion).toBeTruthy();
    expect(champion.mirrorMoves).toEqual(player.equippedMoves);
    expect(champion.mirrorWeapon).toBe('thorns_bleed_blade');
    expect(champion.maxHealth).toBe(260); // mirrors the source hero's HP
    expect(champion.health).toBe(137); // current HP, not a multiplayer-only full heal
    expect(champion.mirrorInventory).toEqual(expect.objectContaining({
      items: expect.objectContaining({ drink_master: 1 }),
      anvilUpgrades: player.anvilUpgrades,
    }));
    expect(events.some(event => event.eventType === 'ENEMY_SPAWNED' && event.data.mirrorSourcePlayerId === 'p1')).toBe(true);
  });

  test('the champion deploys mirrored skills against the player', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    injectMirror(state, player);

    let usedSkill = false;
    for (let step = 0; step < 40 && !usedSkill; step += 1) {
      simulation.updateGame({ p1: { moveX: 0, moveY: 0 } }, 0.05);
      usedSkill = ['mirrorLaser', 'mirrorSmash', 'mirrorDash'].includes(
        Object.values(state.enemies).find(enemy => enemy.type === 'mirror_knight')?.state,
      ) || player.hp < 1000;
    }
    expect(usedSkill).toBe(true);
  });

  test('the champion mirrors a ranged weapon into projectile volleys', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    injectMirror(state, player, {
      x: player.x + 300, y: player.y,
      mirrorWeapon: 'magenta_p90',
      mirrorWeaponStats: { damage: 12, range: 90, knockback: 60 },
      mirrorLaserCd: 9, mirrorSmashCd: 9, mirrorDashCd: 9,
    });

    let firedP90 = false;
    for (let step = 0; step < 30 && !firedP90; step += 1) {
      simulation.updateGame({ p1: { moveX: 0, moveY: 0 } }, 0.05);
      firedP90 = Object.values(state.projectiles).some(projectile => projectile.type === 'magenta_p90');
    }
    expect(firedP90).toBe(true);
  });

  test('mirrored Lazer Glases enters the copied laser channel, not a synthetic bullet path', () => {
    const { state, simulation } = behaviorHarness();
    const player = state.players.p1;
    const mirror = injectMirror(state, player, {
      x: player.x + 220, y: player.y,
      mirrorWeapon: 'lazer_glasses',
      mirrorWeaponStats: { damage: 40, range: 520, knockback: 80 },
      mirrorLaserCd: 9, mirrorSmashCd: 9, mirrorDashCd: 9,
    });

    for (let step = 0; step < 8; step += 1) simulation.updateGame({ p1: { moveX: 0, moveY: 0 } }, 0.05);
    expect(mirror.mirrorBeamUntilTick).toBeGreaterThan(state.tick);
    expect(mirror.state).toBe('mirrorLaser');
    expect(Object.values(state.projectiles).some(projectile => projectile.type === 'lazer_glasses')).toBe(false);
  });
});

describe('shared-roster rivals hunt the party and curse the next floor', () => {
  const { addPartyRival, queuePartyRivalCurse } = require('../js/simulation/NetworkCombatSystem');

  test('a downed rival returns a floor later with an extra life and hunts the party', () => {
    const { state, simulation } = behaviorHarness();
    const entry = addPartyRival(state, 'thorn_knight', { returnFloor: 2, lives: 2 });
    expect(entry.lives).toBe(2);
    expect(entry.returnFloor).toBe(2);
    // The rival hunts the nearest player using the mirror body; verify it closes.
    const player = state.players.p1;
    const rival = injectEnemy(state, 'rival', player.x + 320, player.y, {
      boss: true, rivalCharacterKey: 'thorn_knight', rivalFriend: false,
      maxHealth: 400, health: 400, moveSpeed: 228, attackSpeed: 1,
      mirrorMoves: { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' },
      mirrorMoveStats: { blood_beam: { damage: 20 } },
      mirrorItemStats: { beamDamageMultiplier: 1, aoeDamageMultiplier: 1, bleedChance: 0 },
      mirrorWeapon: '', mirrorWeaponStats: null,
      mirrorCooldowns: { melee: 0.4, laser: 9, smash: 9, dash: 9 },
      beamDamage: 20, smashDamage: 40, dmg: 24, contactDamage: 24, attackCd: 0,
    });
    const startDistance = rival.x - player.x;
    for (let step = 0; step < 8; step += 1) simulation.updateGame({ p1: { moveX: 0, moveY: 0 } }, 0.05);
    // Rival should have closed the gap toward its target (mirror body strafes/approaches).
    expect(rival.x - player.x).toBeLessThan(startDistance);
  });

  test('uses a scoped match RNG for returning-rival spawn placement', () => {
    const createSpawn = () => {
      const { state } = behaviorHarness();
      const room = state.floorState.layout.rooms.find(candidate => candidate.type === 'combat');
      state.players.p1.roomId = room.id;
      state.floorState.currentRoomId = room.id;
      state.rivalRoster = [{ characterKey: 'thorn_knight', pendingSpawn: true, lives: 1, dead: false, friend: false }];
      const random = new RandomService({ matchSeed: state.matchSeed });
      ensureNetworkEncounter(state, random, () => {}, room.id);
      const rival = Object.values(state.enemies).find(enemy => enemy.type === 'rival');
      return { x: rival.x, y: rival.y };
    };
    expect(createSpawn()).toEqual(createSpawn());
  });

  test('keeps a befriended rival in the authoritative roster across floors', () => {
    const { state } = behaviorHarness();
    const entry = addPartyRival(state, 'princess', { friend: true, returnFloor: 1 });
    const events = [];
    advanceToNextFloor(state, (eventType, data) => events.push({ eventType, data }));
    expect(entry.pendingSpawn).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'RIVAL_COMPANION_RETURNING', data: expect.objectContaining({ characterKey: 'princess', floorNumber: 2 }),
    }));

    const room = state.floorState.layout.rooms.find(candidate => candidate.type === 'combat');
    state.players.p1.roomId = room.id;
    state.floorState.currentRoomId = room.id;
    ensureNetworkEncounter(state, new RandomService({ matchSeed: state.matchSeed }), () => {}, room.id);
    expect(Object.values(state.enemies)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'rival', rivalCharacterKey: 'princess', rivalFriend: true }),
    ]));
  });

  test('befriended rivals are invulnerable and never attack', () => {
    const { state, simulation, events } = behaviorHarness();
    const player = state.players.p1;
    const friend = injectEnemy(state, 'rival', player.x + 80, player.y, {
      boss: true, rivalCharacterKey: 'princess', rivalFriend: true,
      maxHealth: 300, health: 300, moveSpeed: 228,
      mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'warp' },
      mirrorCooldowns: { melee: 0.4, laser: 0.01, smash: 0.01, dash: 0.01 },
      dmg: 24, contactDamage: 24, attackCd: 0,
    });
    const startHp = player.hp;
    for (let step = 0; step < 20; step += 1) simulation.updateGame({ p1: { moveX: 0, moveY: 0 } }, 0.05);
    expect(player.hp).toBe(startHp); // a friend never hurt the player

    // A friend shrugs off all incoming damage.
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 }] } }, 0.05);
    for (let step = 0; step < 4; step += 1) simulation.updateGame({ p1: { moveX: 0, aimDirection: 0, buttons: 1 } }, 0.05);
    expect(friend.health).toBe(300);
  });

  test('befriended rivals shadow a distant party member without entering combat', () => {
    const { state, simulation, events } = behaviorHarness();
    const player = state.players.p1;
    const friend = injectEnemy(state, 'rival', player.x + 320, player.y, {
      boss: true, rivalCharacterKey: 'princess', rivalFriend: true,
      maxHealth: 300, health: 300, moveSpeed: 228,
      mirrorMoves: { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'warp' },
      mirrorCooldowns: { melee: 0.4, laser: 0.01, smash: 0.01, dash: 0.01 },
      dmg: 24, contactDamage: 24, attackCd: 0,
    });
    const initialDistance = Math.hypot(friend.x - player.x, friend.y - player.y);
    for (let step = 0; step < 8; step += 1) simulation.updateGame({ p1: { moveX: 0, moveY: 0 } }, 0.05);
    expect(Math.hypot(friend.x - player.x, friend.y - player.y)).toBeLessThan(initialDistance);
    expect(friend.state).toBe('friendly');
    expect(events.some(event => event.eventType === 'PLAYER_HIT' && event.data.enemyId === friend.id)).toBe(false);
  });

  test('rivals arm a party-wide curse on the next floor', () => {
    const { state } = behaviorHarness();
    queuePartyRivalCurse(state, 'metao', { descended: false });
    queuePartyRivalCurse(state, 'gelleh', { descended: true });
    expect(state.pendingRivalCurses.reducePotions).toBe(true);
    expect(state.pendingRivalCurses.gellehTurrets).toBe(4);
  });

  // Campaign parity for updateMinorEnemyPackPressure (game/enemies.js). The
  // shared steerEnemy body already read minorPackSpeedMultiplier, but nothing on
  // the authority ever set it, so packed rooms were softer in multiplayer.
  describe('minor enemy pack pressure', () => {
    test('a lone minor enemy gets no pack bonus', () => {
      const { state, simulation } = behaviorHarness();
      const lone = injectEnemy(state, 'hunter', 500, 350);
      tick(simulation, 1);
      expect(lone.minorPackStacks).toBe(0);
      expect(lone.minorPackSpeedMultiplier).toBe(1);
      expect(lone.minorPackDamageMultiplier).toBe(1);
      expect(lone.minorPackCooldownRate).toBe(1);
    });

    test('stacks with nearby minor allies and caps at three', () => {
      const { state, simulation } = behaviorHarness();
      const leader = injectEnemy(state, 'hunter', 500, 350);
      // Five allies well inside the 260px radius — the cap must hold at 3.
      for (let index = 0; index < 5; index += 1) injectEnemy(state, 'hunter', 510 + index * 10, 350);
      tick(simulation, 1);
      expect(leader.minorPackStacks).toBe(3);
      expect(leader.minorPackSpeedMultiplier).toBeCloseTo(1.12);
      expect(leader.minorPackCooldownRate).toBeCloseTo(1.18);
      expect(leader.minorPackDamageMultiplier).toBeCloseTo(1.09);
    });

    test('ignores allies beyond the pack radius, elites, and other rooms', () => {
      const { state, simulation } = behaviorHarness();
      const leader = injectEnemy(state, 'hunter', 200, 350);
      injectEnemy(state, 'hunter', 200 + 300, 350); // outside 260px
      injectEnemy(state, 'hunter', 210, 350, { elite: true }); // elites don't count
      injectEnemy(state, 'hunter', 215, 350, { roomId: 'some-other-room' });
      tick(simulation, 1);
      expect(leader.minorPackStacks).toBe(0);
    });

    test('elites and non-minor types never receive pack pressure', () => {
      const { state, simulation } = behaviorHarness();
      const elite = injectEnemy(state, 'hunter', 500, 350, { elite: true });
      const golem = injectEnemy(state, 'bulk_golem', 520, 350);
      for (let index = 0; index < 3; index += 1) injectEnemy(state, 'hunter', 505 + index * 8, 350);
      tick(simulation, 1);
      expect(elite.minorPackSpeedMultiplier).toBe(1);
      expect(golem.minorPackSpeedMultiplier).toBe(1);
    });

    test('packed minor enemies hit the player harder than a lone one', () => {
      const damageFrom = allies => {
        const { state, simulation } = behaviorHarness();
        const player = state.players.p1;
        player.itemStats = {};
        const attacker = injectEnemy(state, 'hunter', 500, 350);
        for (let index = 0; index < allies; index += 1) injectEnemy(state, 'hunter', 505 + index * 8, 350);
        tick(simulation, 1);
        const before = player.hp;
        // Drive one hit from the packed attacker through the authority's
        // damagePlayer via a hostile projectile it owns.
        const projectileId = state.allocateEntityId('projectile');
        state.projectiles[projectileId] = {
          id: projectileId, ownerId: attacker.id, roomId: player.roomId, hostile: true,
          type: 'test_round', attackKind: 'test_projectile',
          x: player.x, y: player.y, vx: 0, vy: 0,
          radius: 6, damage: 20, knockback: 0, expiresTick: state.tick + 40,
        };
        simulation.updateGame({}, 0.05);
        return before - player.hp;
      };
      const solo = damageFrom(0);
      const packed = damageFrom(3);
      expect(solo).toBeGreaterThan(0);
      // +3% per stack, 3 stacks => 1.09x
      expect(packed).toBeGreaterThan(solo);
      expect(packed / solo).toBeCloseTo(1.09, 1);
    });
  });
});
