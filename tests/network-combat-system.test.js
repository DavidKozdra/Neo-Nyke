const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { RandomService } = require('../js/simulation/RandomService');
const { createNetworkFloorState, TEST_ROOM } = require('../js/multiplayer/LocalMultiplayerSession');
const { MOVE_SLOT_KEYS, MOVE_BASE_STATS } = require('../js/simulation/SharedMoveContent');
const { createCampaignBulkGolemSplitPlan } = require('../js/simulation/SharedEnemyBehaviorSystem');
const {
  ATTACK_COOLDOWN_TICKS,
  applyNetworkHeroProfile,
  sanitizeKitChoices,
  createNetworkCombatSystem,
  ensureNetworkEncounter,
  spawnEnemyDrops,
  getHeroPrimaryAttack,
  isNetworkRoomLocked,
} = require('../js/simulation/NetworkCombatSystem');

function combatHarness(characterKey = 'princess') {
  const state = new GameState({
    matchId: 'combat-test',
    matchSeed: 'combat-test-seed',
    floorSeed: 'combat-test-floor',
    status: 'running',
    floorState: createNetworkFloorState({ matchSeed: 'combat-test-seed', floorSeed: 'combat-test-floor' }),
    players: {
      p1: {
        id: 'p1', characterKey, roomId: 'room-4-4', x: 300, y: 350, radius: 18, moveSpeed: 180,
        maxHp: 100, hp: 100, coins: 0, action: 'idle', attackCooldownUntilTick: 0,
      },
    },
  });
  state.players.p1.roomId = state.floorState.currentRoomId;
  const random = new RandomService({ matchSeed: state.matchSeed });
  const events = [];
  const system = createNetworkCombatSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) });
  const simulation = new GameSimulation({ state, randomService: random, systems: [system] });
  return { state, random, events, simulation };
}

describe('authoritative network combat system', () => {
  test('gives players campaign damage i-frames so stacked hits cannot instantly delete them', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    const spawnHostile = id => {
      state.projectiles[id] = {
        id, hostile: true, ownerId: `enemy-${id}`, roomId: player.roomId,
        x: player.x, y: player.y, vx: 0, vy: 0, radius: 8, damage: 30,
        attackKind: 'test_volley', expiresTick: state.tick + 10,
      };
    };
    spawnHostile('test-hit-a');
    spawnHostile('test-hit-b');

    simulation.updateGame({}, 0.05);

    expect(player.hp).toBe(70);
    expect(events.filter(event => event.eventType === 'PLAYER_HIT')).toHaveLength(1);
    expect(player.invulnerableUntilTick).toBeGreaterThan(state.tick);
  });

  test('detonates expired hostile projectile blast payloads through the campaign policy', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    simulation.updateGame({}, 0.05);
    state.projectiles.frostBlast = {
      id: 'frostBlast', hostile: true, ownerId: 'antony', roomId: player.roomId,
      x: player.x, y: player.y, vx: 0, vy: 0, radius: 12, damage: 1,
      attackKind: 'cold_death', expiresTick: state.tick,
      enemyBlast: { radius: 80, damage: 14, knockback: 220, statusKey: 'slow', statusStacks: 1, statusDuration: 3 },
    };

    simulation.updateGame({}, 0.05);

    expect(player.hp).toBe(86);
    expect(player.statuses.slow).toEqual(expect.objectContaining({ stacks: 1 }));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ENEMY_PROJECTILE_DETONATED', data: expect.objectContaining({ projectileId: 'frostBlast', damage: 14, radius: 80 }),
    }));
  });

  test('keeps Sweepy Box mines armed until proximity then resolves their campaign blast and bleed', () => {
    const { state, simulation } = combatHarness();
    const player = state.players.p1;
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 180, y: player.y, health: 1000, maxHealth: 1000, moveSpeed: 0 });
    state.abilityEntities.mine = {
      id: 'mine', ownerId: player.id, roomId: player.roomId, kind: 'thorn_mine', abilityId: 'mid_sweepy_box',
      x: player.x, y: player.y, radius: 62, triggerRadius: 34, damage: 18, knockback: 170,
      bleedStacks: 1, bleedDuration: 4.5, nextPulseTick: state.tick, expiresTick: state.tick + 100,
    };
    simulation.updateGame({}, 0.05);
    expect(state.abilityEntities.mine).toBeDefined();
    expect(enemy.health).toBe(1000);

    enemy.x = player.x + 20;
    simulation.updateGame({}, 0.05);
    expect(state.abilityEntities.mine).toBeUndefined();
    expect(enemy.health).toBeLessThan(1000);
    expect(enemy.statuses.bleed).toEqual(expect.objectContaining({ stacks: 1 }));
  });

  test('activates El Barto Cape through the authority and materializes a shared Graffiti zone', () => {
    const { state, simulation, random } = combatHarness();
    const player = state.players.p1;
    player.items = { el_bartos_cape: 2 };
    player.equipmentSlots = ['el_bartos_cape'];
    random.next = () => 0;
    simulation.updateGame({ p1: { actions: [{ action: 'ACTIVATE_EQUIPMENT', itemKey: 'el_bartos_cape' }] } }, 0.05);
    const graffiti = Object.values(state.abilityEntities).find(entity => entity.kind === 'el_barto_graffiti');
    expect(graffiti).toEqual(expect.objectContaining({
      ownerId: player.id, abilityId: 'el_bartos_cape', radius: 48, damage: 24, rawDamage: true, knockback: 55,
    }));
  });

  test('applies campaign Quartz Cannon incoming damage and Never Get Hit terminal damage on authority', () => {
    const quartz = combatHarness();
    quartz.state.matchRules.glassCannon = true;
    const quartzPlayer = quartz.state.players.p1;
    quartz.state.projectiles.quartzHit = {
      id: 'quartzHit', hostile: true, ownerId: 'enemy-test', roomId: quartzPlayer.roomId,
      x: quartzPlayer.x, y: quartzPlayer.y, vx: 0, vy: 0, radius: 8, damage: 10,
      attackKind: 'test_volley', expiresTick: quartz.state.tick + 10,
    };
    quartz.simulation.updateGame({}, 0.05);
    expect(quartzPlayer.hp).toBeCloseTo(86.5);

    const noHit = combatHarness();
    noHit.state.matchRules.challengeModifiers = { no_hit: true };
    const noHitPlayer = noHit.state.players.p1;
    noHit.state.projectiles.noHit = {
      id: 'noHit', hostile: true, ownerId: 'enemy-test', roomId: noHitPlayer.roomId,
      x: noHitPlayer.x, y: noHitPlayer.y, vx: 0, vy: 0, radius: 8, damage: 1,
      attackKind: 'test_volley', expiresTick: noHit.state.tick + 10,
    };
    noHit.simulation.updateGame({}, 0.05);
    expect(noHit.state.status).toBe('ended');
    expect(noHitPlayer).toEqual(expect.objectContaining({ hp: 0, downed: true }));
    expect(noHit.events).toContainEqual(expect.objectContaining({
      eventType: 'RUN_ENDED', data: expect.objectContaining({ result: 'defeat', reason: 'no_hit' }),
    }));
  });

  test('uses Insurance and Heme\'s Scarf from the authoritative player-hit transaction', () => {
    const { state, simulation, events, random } = combatHarness('mooggy');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'mooggy');
    player.items.insurance = 1;
    player.insuranceReady = true;
    player.insuranceActive = true;
    player.insuranceChargeKills = 9;
    player.hp = 80;
    simulation.updateGame({}, 0.05);
    const attacker = Object.values(state.enemies)[0];
    attacker.x = player.x + 400;
    attacker.y = player.y;
    random.next = () => 0;
    state.projectiles.insuredHit = {
      id: 'insuredHit', hostile: true, ownerId: attacker.id, roomId: player.roomId,
      x: player.x, y: player.y, vx: 0, vy: 0, radius: 8, damage: 60,
      attackKind: 'test_volley', expiresTick: state.tick + 10,
    };

    simulation.updateGame({}, 0.05);

    expect(player.hp).toBe(player.maxHp * 0.5);
    expect(player).toEqual(expect.objectContaining({ insuranceReady: false, insuranceActive: false, insuranceChargeKills: 0 }));
    // Mooggy starts with Heme's Scarf: its passive upkeep supplies one stack,
    // then the on-hit retaliation supplies the second.
    expect(attacker.statuses.bleed).toEqual(expect.objectContaining({ stacks: 2, duration: 4 }));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'ITEM_DAMAGE_EFFECT', data: expect.objectContaining({ itemKey: 'insurance' }) }),
      expect.objectContaining({ eventType: 'ITEM_DAMAGE_EFFECT', data: expect.objectContaining({ itemKey: 'hemes_scarf', enemyId: attacker.id }) }),
    ]));
  });

  test("counts an enemy's final campaign bleed tick for Heme's Scarf drain", () => {
    const { state, simulation, events } = combatHarness('mooggy');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'mooggy');
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 300, y: player.y, health: 1, hp: 1, maxHealth: 100, moveSpeed: 0 });
    Object.assign(enemy.statuses.bleed, { stacks: 1, duration: 1, tick: 0.01 });
    player.hp = 40;
    player.scarfHealReady = true;
    player.scarfHealTime = 0;

    simulation.updateGame({}, 0.05);

    expect(enemy.dead).toBe(true);
    expect(player.hp).toBeGreaterThan(40);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HEALED', data: expect.objectContaining({ playerId: player.id, source: 'hemes_scarf' }),
    }));
  });

  test('applies campaign room-entry relic transactions once under multiplayer authority', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    player.items = { naked_kings_last_penny: 2, veggys_pendant: 2, mateos_bag: 1 };
    player.veggysRoomCounter = 2;
    player.hp = 80;

    simulation.updateGame({}, 0.05);

    expect(player).toEqual(expect.objectContaining({ coins: 8, maxHp: 120, hp: 90, veggysRoomCounter: 0 }));
    const startEffects = events.filter(event => event.eventType === 'ITEM_ROOM_ENTRY_EFFECT');
    expect(startEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ data: expect.objectContaining({ itemKey: 'naked_kings_last_penny', amount: 8, firstReveal: true }) }),
      expect.objectContaining({ data: expect.objectContaining({ itemKey: 'veggys_pendant', maxHp: 120 }) }),
    ]));

    const shop = state.floorState.layout.rooms.find(room => room.type === 'shop');
    player.invulnerableUntilTick = state.tick + 20;
    player.stunnedUntilTick = state.tick + 20;
    player.dashUntilTick = state.tick + 20;
    player.dashVx = 100;
    player.dashVy = -100;
    player.statusUntilTick = { cowards_way: state.tick + 20, mooggy_zoomies: state.tick + 20, flying_unhitable: state.tick + 20 };
    player.roomId = shop.id;
    player.x = 450;
    player.y = 350;
    simulation.updateGame({}, 0.05);

    expect(player).toEqual(expect.objectContaining({
      storedPotions: 1, mateosBagRefillFloor: 1,
      invulnerableUntilTick: state.tick - 1, stunnedUntilTick: state.tick - 1, dashUntilTick: state.tick - 1, dashVx: 0, dashVy: 0,
    }));
    expect(player.statusUntilTick).toEqual(expect.objectContaining({ cowards_way: state.tick - 1, mooggy_zoomies: state.tick - 1, flying_unhitable: state.tick - 1 }));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ITEM_ROOM_ENTRY_EFFECT',
      data: expect.objectContaining({ itemKey: 'mateos_bag', roomId: shop.id, storedPotions: 1, potionCap: 3 }),
    }));
    simulation.updateGame({}, 0.05);
    expect(events.filter(event => event.eventType === 'ITEM_ROOM_ENTRY_EFFECT'
      && event.data.itemKey === 'mateos_bag')).toHaveLength(1);
  });

  test('materializes and resolves the shared circuit challenge switches on authority', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === state.floorState.currentRoomId);
    expect(room).toBeDefined();
    room.type = 'challenge';
    room.challengeType = 'circuit';
    room.challengeStarted = false;
    room.cleared = false;
    room.challengeData = {};
    player.roomId = room.id;
    player.x = 450;
    player.y = 350;
    state.floorState.currentRoomId = room.id;
    state.pickups.circuitStarter = {
      id: 'circuitStarter', type: 'challengeStarter', trial: 'circuit', roomId: room.id,
      x: player.x, y: player.y, radius: 16, spawnTick: state.tick,
    };

    simulation.updateGame({}, 0.05);

    const switches = Object.values(state.pickups).filter(pickup => pickup.type === 'challengeSwitch');
    expect(room.challengeStarted).toBe(true);
    expect(switches).toHaveLength(4);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'CHALLENGE_STARTED', data: expect.objectContaining({ roomId: room.id, challengeType: 'circuit' }),
    }));

    const targetIndex = room.challengeData.sequence[0];
    const target = switches.find(pickup => pickup.switchIndex === targetIndex);
    room.challengeData.sequence = [targetIndex];
    room.challengeData.progress = 0;
    Object.values(state.enemies).forEach(enemy => { delete state.enemies[enemy.id]; });
    player.x = target.x;
    player.y = target.y;

    simulation.updateGame({}, 0.05);

    expect(room.cleared).toBe(true);
    expect(player.level).toBeGreaterThan(1);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'CHALLENGE_SWITCH_CORRECT', data: expect.objectContaining({ roomId: room.id, progress: 1, total: 1 }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'XP_AWARDED', data: expect.objectContaining({ playerId: player.id, source: 'challenge_reward' }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'CHALLENGE_WEAPON_AWARDED', data: expect.objectContaining({ playerId: player.id, roomId: room.id }),
    }));
  });

  test('preserves secret-vendor relic history under multiplayer authority', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.type = 'secret';
    room.secret = true;
    room.secretLifecycleInitialized = true;
    player.loopCrystals = 1;
    state.pickups.vendorRelic = {
      id: 'vendorRelic', type: 'secretVendor', offerKind: 'relic', rewardKey: 'neo_knife', cost: 1,
      roomId: room.id, x: player.x, y: player.y, radius: 16, spawnTick: state.tick,
    };

    simulation.updateGame({}, 0.05);

    expect(player.lastSecretVendorRewardKey).toBe('neo_knife');
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'SECRET_VENDOR_PURCHASED', data: expect.objectContaining({ playerId: player.id, rewardKey: 'neo_knife' }),
    }));
  });

  test('uses campaign walk-over potion healing and Mateo-only storage on authority', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    player.hp = 40;
    state.pickups.hurtPotion = { id: 'hurtPotion', type: 'potion', roomId: player.roomId, x: player.x, y: player.y, radius: 12, spawnTick: state.tick };

    simulation.updateGame({}, 0.05);

    expect(player.hp).toBe(79);
    expect(player.storedPotions || 0).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PICKUP_COLLECTED', data: expect.objectContaining({ pickupId: 'hurtPotion', healedAmount: 39 }),
    }));

    player.hp = player.maxHp;
    player.items = { mateos_bag: 1 };
    state.pickups.fullPotion = { id: 'fullPotion', type: 'potion', roomId: player.roomId, x: player.x, y: player.y, radius: 12, spawnTick: state.tick };
    simulation.updateGame({}, 0.05);

    expect(player.storedPotions).toBe(1);
    expect(state.pickups.fullPotion).toBeUndefined();
    player.items = {};
    state.pickups.unusablePotion = { id: 'unusablePotion', type: 'potion', roomId: player.roomId, x: player.x, y: player.y, radius: 12, spawnTick: state.tick };
    simulation.updateGame({}, 0.05);
    expect(state.pickups.unusablePotion).toBeDefined();
  });

  test('materializes shared campaign enemy item and potion drops on authority', () => {
    const { state, events } = combatHarness();
    const player = state.players.p1;
    player.itemStats = { itemDropChanceBonus: 0.1 };
    const enemy = { id: 'drop-elite', type: 'hunter', elite: true, roomId: player.roomId, x: 220, y: 180 };
    spawnEnemyDrops(state, enemy, player, (eventType, data) => events.push({ eventType, data }), { random: () => 0 });
    expect(Object.values(state.pickups)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'coin', roomId: player.roomId }),
      expect.objectContaining({ type: 'item', roomId: player.roomId, elite: true, key: expect.any(String) }),
    ]));
    const turret = { id: 'drop-turret', type: 'turret', rivalTurret: true, roomId: player.roomId, x: 240, y: 180 };
    spawnEnemyDrops(state, turret, player, (eventType, data) => events.push({ eventType, data }), { random: () => 0 });
    expect(Object.values(state.pickups)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'potion', source: 'rival_turret', roomId: player.roomId }),
    ]));
  });

  test('materializes campaign boss voucher and god-relic bonus drops even without a generic drop', () => {
    const { state, events } = combatHarness();
    const player = state.players.p1;
    const boss = { id: 'boss-drop', type: 'queen_cult', boss: true, roomId: player.roomId, x: 220, y: 180 };
    spawnEnemyDrops(state, boss, player, (eventType, data) => events.push({ eventType, data }), { random: () => 0 });

    const bonusDrops = Object.values(state.pickups).filter(pickup => pickup.source === 'boss_voucher');
    expect(bonusDrops).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'item', key: 'forge_voucher', x: 192, y: 180 }),
      expect.objectContaining({ type: 'item', x: 248, y: 180, key: expect.any(String) }),
    ]));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PICKUP_SPAWNED', data: expect.objectContaining({ source: 'boss_voucher', itemKey: 'forge_voucher' }),
    }));

    const blockedState = combatHarness().state;
    blockedState.matchRules.challengeModifiers = { no_items: true };
    spawnEnemyDrops(blockedState, boss, blockedState.players.p1, () => {}, { random: () => 0 });
    expect(Object.values(blockedState.pickups).some(pickup => pickup.source === 'boss_voucher')).toBe(false);
  });

  test('awards campaign boss XP and excludes tutorial dummy XP on authority', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    simulation.updateGame({}, 0.05);
    // Bulk Golem is a real boss but has no death-interception phase, so this
    // exercises the normal authority lethal/reward path.
    const enemy = {
      id: 'boss-xp', type: 'bulk_golem', boss: true, roomId: player.roomId, x: 220, y: 180,
      radius: 20, health: 1, maxHealth: 1, hp: 1,
    };
    state.enemies[enemy.id] = enemy;
    state.projectiles.xpLethal = {
      id: 'xpLethal', ownerId: player.id, roomId: player.roomId, x: enemy.x, y: enemy.y,
      vx: 0, vy: 0, radius: 8, damage: 10, hostile: false, expiresTick: state.tick + 10,
    };
    simulation.updateGame({}, 0.05);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'XP_AWARDED', data: expect.objectContaining({ playerId: player.id, amount: 40 }),
    }));

    events.length = 0;
    state.enemies.tutorialXp = {
      id: 'tutorialXp', type: 'hunter', tutorialDummy: true, roomId: player.roomId, x: 240, y: 180,
      radius: 20, health: 1, maxHealth: 1, hp: 1,
    };
    state.projectiles.tutorialLethal = {
      id: 'tutorialLethal', ownerId: player.id, roomId: player.roomId, x: 240, y: 180,
      vx: 0, vy: 0, radius: 8, damage: 10, hostile: false, expiresTick: state.tick + 10,
    };
    simulation.updateGame({}, 0.05);
    expect(events.some(event => event.eventType === 'XP_AWARDED')).toBe(false);
  });

  test('uses the campaign Bulk Golem split plan and keeps its children authoritative', () => {
    expect(createCampaignBulkGolemSplitPlan({ type: 'bulk_golem', splitReady: true, x: 220, y: 180 }, { elite: false }))
      .toEqual([
        expect.objectContaining({ type: 'golem', x: 150, y: 180, elite: false, healthMultiplier: 1.6, damageMultiplier: 1.35 }),
        expect.objectContaining({ type: 'golem', x: 290, y: 180, elite: false, healthMultiplier: 1.6, damageMultiplier: 1.35 }),
      ]);

    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    simulation.updateGame({}, 0.05);
    state.enemies.bulkSplit = {
      id: 'bulkSplit', type: 'bulk_golem', boss: true, splitReady: true, roomId: player.roomId,
      x: 220, y: 180, radius: 58, health: 1, maxHealth: 1, hp: 1,
    };
    state.projectiles.bulkLethal = {
      id: 'bulkLethal', ownerId: player.id, roomId: player.roomId, x: 220, y: 180,
      vx: 0, vy: 0, radius: 8, damage: 10, hostile: false, expiresTick: state.tick + 10,
    };
    simulation.updateGame({}, 0.05);

    const children = Object.values(state.enemies).filter(enemy => enemy.spawnedFromBulk && !enemy.dead);
    expect(children).toHaveLength(2);
    expect(children).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'golem', roomId: player.roomId, health: expect.any(Number), maxHealth: expect.any(Number) }),
    ]));
    expect(children.every(child => child.health === child.maxHealth)).toBe(true);
    expect(events.filter(event => event.eventType === 'BULK_GOLEM_SPLIT')).toHaveLength(2);
  });

  test('force-resolves the surviving God Council without their extra death phases', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    simulation.updateGame({}, 0.05);
    Object.keys(state.enemies).forEach(enemyId => { delete state.enemies[enemyId]; });
    player.x = 120;
    player.y = 120;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.type = 'god';
    state.floorState.encounters[room.id] = {
      roomId: room.id, roomType: 'god', status: 'active', enemyIds: ['finalGod', 'councilBulk', 'councilQueen'],
    };
    state.enemies.finalGod = {
      id: 'finalGod', type: 'god', roomId: room.id, x: 430, y: 350, radius: 52,
      health: 1, maxHealth: 100, hp: 1, rebirthUsed: true,
    };
    state.enemies.councilBulk = {
      id: 'councilBulk', type: 'bulk_golem', boss: true, roomId: room.id, x: 520, y: 350, radius: 52,
      health: 100, maxHealth: 100, hp: 100, splitReady: true,
    };
    state.enemies.councilQueen = {
      id: 'councilQueen', type: 'queen_cult', boss: true, roomId: room.id, x: 610, y: 350, radius: 52,
      health: 100, maxHealth: 100, hp: 100, queenFinisherDone: false,
    };
    state.projectiles.godLethal = {
      id: 'godLethal', ownerId: player.id, roomId: room.id, x: 430, y: 350,
      vx: 0, vy: 0, radius: 8, damage: 20, hostile: false, expiresTick: state.tick + 10,
    };

    simulation.updateGame({}, 0.05);

    expect(state.enemies.finalGod.dead).toBe(true);
    expect(state.enemies.councilBulk).toEqual(expect.objectContaining({ dead: true, splitReady: false }));
    expect(state.enemies.councilQueen).toEqual(expect.objectContaining({ dead: true, queenFinisherDone: true, queenFinisherActive: false }));
    expect(Object.values(state.enemies).some(enemy => enemy.spawnedFromBulk && !enemy.dead)).toBe(false);
    expect(events.filter(event => event.eventType === 'ENEMY_DEFEATED').map(event => event.data.enemyId))
      .toEqual(expect.arrayContaining(['finalGod', 'councilBulk', 'councilQueen']));
    expect(state.floorState.encounters[room.id].status).toBe('cleared');
    const crown = Object.values(state.pickups).find(pickup => pickup.endgameChoice && pickup.type === 'crown');
    const returnGate = Object.values(state.pickups).find(pickup => pickup.endgameChoice && pickup.type === 'returnGate');
    expect(crown).toBeDefined();
    expect(returnGate).toBeDefined();

    player.x = crown.x;
    player.y = crown.y;
    simulation.updateGame({}, 0.05);
    expect(state.status).toBe('ended');
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'RUN_ENDED', data: expect.objectContaining({ result: 'victory', reason: 'god-crown' }),
    }));
  });

  test('resolves God loop and endless-descent choices as authoritative floor transitions', () => {
    const loop = combatHarness();
    const loopPlayer = loop.state.players.p1;
    loop.state.pickups.loopGate = {
      id: 'loopGate', type: 'returnGate', endgameChoice: true, roomId: loopPlayer.roomId,
      x: loopPlayer.x, y: loopPlayer.y, radius: 26, spawnTick: loop.state.tick,
    };
    loop.simulation.updateGame({}, 0.05);
    expect(loop.state).toEqual(expect.objectContaining({ floorNumber: 1, runLoopIndex: 1, status: 'running' }));
    expect(loopPlayer.loopCrystals).toBe(1);
    expect(Object.values(loop.state.pickups)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'rewardChoice', source: 'loop_blue_reward', groupId: 'loop-blue:1' }),
    ]));
    expect(loop.events).toContainEqual(expect.objectContaining({ eventType: 'LOOP_COMPLETED', data: expect.objectContaining({ loopIndex: 1 }) }));

    const descent = combatHarness();
    const descentPlayer = descent.state.players.p1;
    descent.state.floorNumber = 10;
    descent.state.matchRules.endlessDescent = true;
    descent.state.pickups.descendGate = {
      id: 'descendGate', type: 'descend', endgameChoice: true, roomId: descentPlayer.roomId,
      x: descentPlayer.x, y: descentPlayer.y, radius: 26, spawnTick: descent.state.tick,
    };
    descent.simulation.updateGame({}, 0.05);
    expect(descent.state.floorNumber).toBe(11);
    expect(descent.state.floorState.layout.rooms.find(room => room.id === descent.state.floorState.layout.exitRoomId).type)
      .not.toBe('god');
    expect(descent.events).toContainEqual(expect.objectContaining({
      eventType: 'GOD_ENDGAME_CHOICE_SELECTED', data: expect.objectContaining({ pickupType: 'descend', action: 'descend' }),
    }));
  });

  test('keeps rival base rewards on the campaign non-boss path', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    const rivalDrop = { id: 'rival-drop', type: 'rival', boss: true, roomId: player.roomId, x: 220, y: 180 };
    spawnEnemyDrops(state, rivalDrop, player, () => {}, { random: () => 0 });
    expect(Object.values(state.pickups).filter(pickup => pickup.type === 'coin').reduce((sum, pickup) => sum + pickup.value, 0)).toBe(5);
    expect(Object.values(state.pickups).some(pickup => pickup.source === 'boss_voucher')).toBe(false);

    simulation.updateGame({}, 0.05);
    Object.keys(state.enemies).forEach(enemyId => { delete state.enemies[enemyId]; });
    state.enemies.rivalXp = {
      id: 'rivalXp', type: 'rival', boss: true, rivalCharacterKey: 'thorn_knight', roomId: player.roomId,
      x: 250, y: 180, radius: 20, health: 1, maxHealth: 1, hp: 1,
    };
    state.projectiles.rivalLethal = {
      id: 'rivalLethal', ownerId: player.id, roomId: player.roomId, x: 250, y: 180,
      vx: 0, vy: 0, radius: 8, damage: 10, hostile: false, expiresTick: state.tick + 10,
    };
    simulation.updateGame({}, 0.05);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'XP_AWARDED', data: expect.objectContaining({ playerId: player.id, amount: 6 }),
    }));
  });

  test('materializes campaign final-rival coins, XP, and blue relic on authority', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    simulation.updateGame({}, 0.05);
    Object.keys(state.enemies).forEach(enemyId => { delete state.enemies[enemyId]; });
    state.rivalRoster = [{ characterKey: 'thorn_knight', lives: 1, relationship: 0, dead: false }];
    state.enemies.finalRival = {
      id: 'finalRival', type: 'rival', boss: true, rivalCharacterKey: 'thorn_knight', roomId: player.roomId,
      x: 250, y: 180, radius: 20, health: 1, maxHealth: 1, hp: 1,
    };
    state.projectiles.finalRivalLethal = {
      id: 'finalRivalLethal', ownerId: player.id, roomId: player.roomId, x: 250, y: 180,
      vx: 0, vy: 0, radius: 8, damage: 10, hostile: false, expiresTick: state.tick + 10,
    };
    simulation.updateGame({}, 0.05);

    expect(state.rivalRoster[0]).toEqual(expect.objectContaining({ lives: 0, dead: true, relationship: -5 }));
    expect(player.rivalReputation).toBe(1);
    expect(Object.values(state.pickups).filter(pickup => pickup.source === 'rival_reward')
      .reduce((sum, pickup) => sum + pickup.value, 0)).toBe(22);
    expect(Object.values(state.pickups)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'item', source: 'rival_final', key: expect.any(String) }),
    ]));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'XP_AWARDED', data: expect.objectContaining({ playerId: player.id, source: 'rival_reward', amount: 23 }),
    }));
  });

  test('spawns and claims the campaign boss reward group on authority', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    simulation.updateGame({}, 0.05);
    Object.keys(state.enemies).forEach(enemyId => { delete state.enemies[enemyId]; });
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.type = 'boss';
    state.floorState.layout.exitRoomId = room.id;
    state.floorState.encounters[room.id] = { roomId: room.id, roomType: 'boss', status: 'active', enemyIds: ['bossReward'] };
    state.enemies.bossReward = {
      id: 'bossReward', type: 'artificer_knave', boss: true, roomId: room.id, x: 480, y: 350,
      radius: 30, health: 1, maxHealth: 1, hp: 1,
    };
    state.projectiles.rewardLethal = {
      id: 'rewardLethal', ownerId: player.id, roomId: room.id, x: 480, y: 350,
      vx: 0, vy: 0, radius: 8, damage: 10, hostile: false, expiresTick: state.tick + 10,
    };
    simulation.updateGame({}, 0.05);

    const rewards = Object.values(state.pickups).filter(pickup => pickup.type === 'rewardChoice');
    expect(rewards).toHaveLength(5);
    expect(rewards.every(pickup => pickup.picksRemaining === 1 && pickup.source === 'boss_reward')).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'BOSS_REWARD_CHOICES_SPAWNED' }));

    const selected = rewards[0];
    player.x = selected.x;
    player.y = selected.y;
    simulation.updateGame({}, 0.05);
    expect(player.items[selected.key]).toBeGreaterThan(0);
    expect(Object.values(state.pickups).some(pickup => pickup.type === 'rewardChoice')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'BOSS_REWARD_SELECTED', data: expect.objectContaining({ itemKey: selected.key, picksRemaining: 0 }),
    }));
  });

  test('applies campaign elite crit and Enflamed/Gross/Breezy hit statuses on authority', () => {
    const { state, simulation, random, events } = combatHarness();
    simulation.updateGame({}, 0.05);
    const player = state.players.p1;
    const elite = Object.values(state.enemies)[0];
    Object.assign(elite, {
      elite: true, eliteCrit: 1, eliteProcs: { fire: 1, poison: 1, cold: 1 },
      x: player.x + 400, y: player.y,
    });
    random.next = () => 0;
    state.projectiles.eliteHit = {
      id: 'eliteHit', hostile: true, ownerId: elite.id, roomId: player.roomId,
      x: player.x, y: player.y, vx: 0, vy: 0, radius: 8, damage: 10,
      attackKind: 'elite_test', expiresTick: state.tick + 10,
    };

    simulation.updateGame({}, 0.05);

    expect(player.hp).toBe(86);
    ['fire', 'poison', 'slow'].forEach(key => expect(player.statuses[key]).toEqual(expect.objectContaining({ stacks: 1 })));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: elite.id, crit: true }),
    }));
    expect(events.filter(event => event.eventType === 'ELITE_STATUS_PROC')).toHaveLength(3);
  });

  test('applies campaign time-based enemy aggression to authority hits', () => {
    const { state, simulation, random, events } = combatHarness();
    simulation.updateGame({}, 0.05);
    const player = state.players.p1;
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 400, y: player.y, elite: false });
    state.elapsedSeconds = 300;
    random.next = () => 0;
    state.projectiles.aggressionHit = {
      id: 'aggressionHit', hostile: true, ownerId: enemy.id, roomId: player.roomId,
      x: player.x, y: player.y, vx: 0, vy: 0, radius: 8, damage: 10,
      attackKind: 'enemy_projectile', expiresTick: state.tick + 10,
    };

    simulation.updateGame({}, 0.05);

    expect(player.hp).toBeCloseTo(83.725);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT', data: expect.objectContaining({ enemyId: enemy.id, crit: true }),
    }));
  });

  test('runs the campaign Storm trial on authority with its telegraph before damage', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.type = 'challenge';
    room.challengeType = 'storm';
    room.challengeStarted = true;
    room.cleared = false;
    room.challengeLifecycleState = 'active';
    room.challengeData = { burstCount: 2 };
    room.challengeTimer = 10;
    room.challengeTick = 0.01;

    simulation.updateGame({}, 0.05);
    const stormHazards = room.hazards.filter(hazard => hazard.source === 'storm');
    expect(stormHazards).toHaveLength(2);
    expect(events.some(event => event.eventType === 'STORM_STRIKE_TELEGRAPHED')).toBe(true);
    expect(player.hp).toBe(100); // 0.48s campaign telegraph is still active

    for (let step = 0; step < 10; step += 1) simulation.updateGame({}, 0.05);
    expect(player.hp).toBeLessThan(100);
    expect(events.some(event => event.eventType === 'PLAYER_HIT' && event.data.attackKind === 'storm')).toBe(true);
  });

  test('runs Protect ward pressure and capped seeker waves on the authority', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.type = 'challenge';
    room.challengeType = 'survival';
    room.challengeStarted = true;
    room.cleared = false;
    require('../js/simulation/SharedRoomLifecycleSystem').startCampaignSurvivalChallenge(room, {
      floorNumber: state.floorNumber, width: state.floorState.width, height: state.floorState.height,
    });
    room.challengeTick = 0.01;

    simulation.updateGame({}, 0.05);
    const seekers = Object.values(state.enemies).filter(enemy => enemy.obeliskSeeker && enemy.roomId === room.id);
    expect(seekers).toHaveLength(3);
    const ward = room.challengeData.obelisk;
    seekers.forEach(enemy => { enemy.x = ward.x; enemy.y = ward.y; });
    const healthBefore = ward.hp;
    simulation.updateGame({}, 0.05);
    expect(ward.hp).toBeLessThan(healthBefore);
    expect(events.some(event => event.eventType === 'CHALLENGE_WARD_DAMAGED')).toBe(true);
  });

  test('runs Rune trial spawn, fleeing pickups, and authoritative claim completion', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.type = 'challenge';
    room.challengeType = 'runes';
    room.cleared = false;
    const starterId = state.allocateEntityId('pickup');
    state.pickups[starterId] = { id: starterId, type: 'challengeStarter', trial: 'runes', roomId: room.id, x: player.x, y: player.y, radius: 24 };

    simulation.updateGame({}, 0.05);
    const runes = Object.values(state.pickups).filter(pickup => pickup.type === 'challengeRune');
    expect(runes).toHaveLength(5);
    const before = runes[0].x;
    simulation.updateGame({}, 0.05);
    expect(runes[0].x).not.toBe(before);

    runes.forEach(rune => { rune.x = player.x; rune.y = player.y; });
    simulation.updateGame({}, 0.05);
    expect(room.cleared).toBe(true);
    expect(events.some(event => event.eventType === 'CHALLENGE_RUNE_CLAIMED')).toBe(true);
    expect(events.some(event => event.eventType === 'CHALLENGE_COMPLETED')).toBe(true);
  });

  test('runs Bomb trial safe defuses, sniper pressure, and wrong-bomb fuse on authority', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.type = 'challenge'; room.challengeType = 'bomb'; room.cleared = false;
    const starterId = state.allocateEntityId('pickup');
    state.pickups[starterId] = { id: starterId, type: 'challengeStarter', trial: 'bomb', roomId: room.id, x: player.x, y: player.y, radius: 24 };
    simulation.updateGame({}, 0.05);
    const bombs = Object.values(state.pickups).filter(pickup => pickup.type === 'challengeBomb');
    expect(bombs).toHaveLength(5);
    expect(bombs.filter(bomb => bomb.safe)).toHaveLength(3);
    expect(Object.values(state.enemies).filter(enemy => enemy.type === 'sniper' && enemy.roomId === room.id)).toHaveLength(5);

    const wrong = bombs.find(bomb => !bomb.safe);
    wrong.x = player.x; wrong.y = player.y;
    simulation.updateGame({}, 0.05);
    expect(room.cleared).toBe(true);
    expect(room.challengeFailed).toBe(true);
    expect(room.hazards.some(hazard => hazard.kind === 'bomb_aoe')).toBe(true);
    expect(events.some(event => event.eventType === 'CHALLENGE_BOMB_FAILED')).toBe(true);
  });

  test('claims the shared secret-boss chest transaction on the authority', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.type = 'secret'; room.secret = true; room.secretKind = 'bowman_bane'; room.secretLifecycleInitialized = true;
    const chestId = state.allocateEntityId('pickup');
    state.pickups[chestId] = { id: chestId, type: 'secret_boss_chest', roomId: room.id, x: player.x, y: player.y, radius: 22, rewardKey: 'neo_knife' };
    simulation.updateGame({}, 0.05);
    expect(room.secretChestLooted).toBe(true);
    expect(player.coins).toBeGreaterThan(0);
    expect(player.items.neo_knife).toBeGreaterThan(0);
    expect(events.some(event => event.eventType === 'SECRET_BOSS_CHEST_LOOTED')).toBe(true);
  });

  test('turns a revisited secret room into the authoritative Bowman Bane encounter and escape', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.type = 'secret'; room.secret = true; room.secretKind = 'vendor'; room.secretLifecycleInitialized = true; room.cleared = true;
    room.doors = { n: false, s: false, e: false, w: false };
    room.secretPassages = { n: { targetGx: room.gx, targetGy: room.gy - 1, open: true } };
    simulation.updateGame({}, 0.05); // first secret-room visit
    const otherRoom = state.floorState.layout.rooms.find(candidate => candidate.id !== room.id);
    player.roomId = otherRoom.id;
    simulation.updateGame({}, 0.05);
    player.roomId = room.id;
    simulation.updateGame({}, 0.05);

    expect(room.secretKind).toBe('bowman_bane');
    expect(room.baneEscapeRevealed).toBe(true);
    expect(Object.values(state.enemies).some(enemy => enemy.type === 'bowman_bane' && enemy.roomId === room.id)).toBe(true);
    expect(events.some(event => event.eventType === 'BOWMAN_BANE_ESCAPE_REVEALED')).toBe(true);
  });

  test('uses a stored potion automatically at campaign emergency-health threshold', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    const player = state.players.p1;
    player.hp = 20;
    player.maxHp = 120;
    player.storedPotions = 1;
    state.projectiles.enemyShot = {
      id: 'enemyShot', hostile: true, ownerId: 'enemy-test', roomId: player.roomId,
      x: player.x, y: player.y, vx: 0, vy: 0, radius: 8, damage: 10,
      attackKind: 'test_volley', expiresTick: state.tick + 10,
    };

    simulation.updateGame({}, 0.05);

    // The hit leaves the hero below 10% (10 HP), then the campaign's stored
    // potion is consumed in that same authoritative damage frame.
    expect(player.storedPotions).toBe(0);
    expect(player.hp).toBe(49);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'POTION_USED', data: expect.objectContaining({ playerId: 'p1', healedAmount: 39 }),
    }));
  });

  test('resolves campaign room hazards through the same trap cadence and lava burn rules', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.hazards = [
      {
        kind: 'explosive_trap', x: player.x, y: player.y, triggerRadius: 34,
        blastRadius: 88, baseDamage: 18,
      },
      {
        kind: 'lava', x: player.x, y: player.y, r: 48, baseDamage: 8,
        statusStacks: 2,
      },
    ];

    simulation.updateGame({}, 0.05);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ROOM_HAZARD_TRIGGERED', data: expect.objectContaining({ hazardKind: 'explosive_trap' }),
    }));
    expect(player.statuses.fire).toEqual(expect.objectContaining({ stacks: 2 }));
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 42, y: player.y, health: 1000, maxHealth: 1000, moveSpeed: 0 });

    for (let tick = 0; tick < 15; tick += 1) simulation.updateGame({}, 0.05);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ROOM_HAZARD_EXPLODED', data: expect.objectContaining({ hazardKind: 'explosive_trap' }),
    }));
    expect(enemy.health).toBeLessThan(1000);
  });

  test('arms and detonates authored dungeon thorn mines like campaign room hazards', () => {
    const { state, simulation, events } = combatHarness();
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.hazards = [{ kind: 'thorn_mine', owner: 'dungeon', x: player.x, y: player.y, armTime: 0, triggerRadius: 34, blastRadius: 62, damage: 18, bleedStacks: 1, bleedDuration: 4.5 }];
    simulation.updateGame({}, 0.05);
    expect(room.hazards).toHaveLength(0);
    expect(player.hp).toBeLessThan(100);
    expect(player.statuses.bleed).toEqual(expect.objectContaining({ stacks: 1 }));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ROOM_HAZARD_EXPLODED', data: expect.objectContaining({ hazardKind: 'thorn_mine', blastRadius: 62 }),
    }));
  });

  test('keeps lava as continuous campaign damage instead of granting normal hit i-frames', () => {
    const { state, simulation } = combatHarness();
    const player = state.players.p1;
    player.fireImmune = true;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.hazards = [{ kind: 'lava', x: player.x, y: player.y, r: 48 }];

    simulation.updateGame({}, 0.05);
    simulation.updateGame({}, 0.05);

    expect(player.hp).toBeCloseTo(99.4);
    expect(Number(player.invulnerableUntilTick || 0)).toBe(0);
  });

  test('uses authoritative room obstacles for enemy and projectile collision', () => {
    const { state, simulation, events } = combatHarness();
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === state.players.p1.roomId);
    room.structures = [{ kind: 'pillar', x: 340, y: 350, w: 34, h: 34 }];
    room.destructibles = [{ kind: 'pot', x: 380, y: 350, r: 12, hp: 1, broken: false }];
    const firstId = state.allocateEntityId('projectile');
    state.projectiles[firstId] = { id: firstId, ownerId: 'p1', roomId: room.id, x: 340, y: 350, vx: 0, vy: 0, radius: 6, damage: 10, expiresTick: 20 };
    simulation.updateGame({}, 0.05);
    expect(state.projectiles[firstId]).toBeUndefined();
    expect(events.some(event => event.eventType === 'PROJECTILE_BLOCKED')).toBe(true);
    const secondId = state.allocateEntityId('projectile');
    state.projectiles[secondId] = { id: secondId, ownerId: 'p1', roomId: room.id, x: 380, y: 350, vx: 0, vy: 0, radius: 6, damage: 10, expiresTick: 20 };
    simulation.updateGame({}, 0.05);
    expect(room.destructibles[0].broken).toBe(true);
    expect(events.some(event => event.eventType === 'DESTRUCTIBLE_BROKEN')).toBe(true);
  });

  test('resolves fast projectile hits through the shared swept-target rule', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    simulation.updateGame({}, 0.05);
    const player = state.players.p1;
    const enemy = Object.values(state.enemies)[0];
    enemy.x = player.x + 70;
    enemy.y = player.y;
    enemy.moveSpeed = 0;
    enemy.health = 100;
    enemy.maxHealth = 100;
    const projectileId = state.allocateEntityId('projectile');
    state.projectiles[projectileId] = {
      id: projectileId, ownerId: player.id, roomId: player.roomId,
      x: player.x - 120, y: player.y, vx: 5000, vy: 0,
      radius: 6, damage: 20, attackKind: 'sweep-test', expiresTick: state.tick + 5,
    };

    simulation.updateGame({}, 0.05);

    expect(enemy.health).toBeLessThan(100);
    expect(state.projectiles[projectileId]).toBeUndefined();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ENEMY_HIT', data: expect.objectContaining({ enemyId: enemy.id, projectileId }),
    }));
  });

  test('gives a swept destructible impact priority over a target behind it', () => {
    const { state, simulation } = combatHarness('thorn_knight');
    simulation.updateGame({}, 0.05);
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.structures = [];
    room.destructibles = [{ id: 'sweep-pot', kind: 'pot', x: player.x + 50, y: player.y, r: 12, hp: 1, maxHp: 1, broken: false }];
    const enemy = Object.values(state.enemies)[0];
    enemy.x = player.x + 120;
    enemy.y = player.y;
    enemy.moveSpeed = 0;
    enemy.health = 100;
    enemy.maxHealth = 100;
    const projectileId = state.allocateEntityId('projectile');
    state.projectiles[projectileId] = {
      id: projectileId, ownerId: player.id, roomId: player.roomId,
      x: player.x - 120, y: player.y, vx: 5000, vy: 0,
      radius: 6, damage: 20, attackKind: 'sweep-prop-test', expiresTick: state.tick + 5,
    };

    simulation.updateGame({}, 0.05);

    expect(room.destructibles[0].broken).toBe(true);
    expect(enemy.health).toBe(100);
    expect(state.projectiles[projectileId]).toBeUndefined();
  });

  test('melee sweeps break pots and spawn campaign loot like single player', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.destructibles = [{ kind: 'pot', x: player.x + 60, y: player.y, r: 12, hp: 1, broken: false }];
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(room.destructibles[0].broken).toBe(true);
    expect(events.some(event => event.eventType === 'DESTRUCTIBLE_BROKEN' && event.data.obstacleKind === 'pot')).toBe(true);
    // Broken pots pay out the campaign reward: coins or a rolled item.
    expect(Object.values(state.pickups).some(pickup => ['coin', 'item'].includes(pickup.type))).toBe(true);
  });

  test('barrel breaks detonate an authoritative blast that chains to nearby props', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    const player = state.players.p1;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.destructibles = [
      { kind: 'barrel', x: player.x + 60, y: player.y, r: 14, hp: 1, broken: false },
      // Beyond the swing's reach but inside the barrel's 130 blast radius.
      { kind: 'pot', x: player.x + 170, y: player.y + 60, r: 12, hp: 1, broken: false },
    ];
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(room.destructibles[0].broken).toBe(true);
    // The 130-radius blast chips the pot even though the swing never reached it.
    expect(room.destructibles[1].broken).toBe(true);
    expect(events.filter(event => event.eventType === 'DESTRUCTIBLE_BROKEN').length).toBeGreaterThanOrEqual(2);
  });

  test('holds newly spawned enemies harmless during the shared portal animation', () => {
    const { state, simulation, events } = combatHarness();
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = state.players.p1.x;
    enemy.y = state.players.p1.y;
    enemy.attackCooldownUntilTick = 0;
    const startingHealth = state.players.p1.hp;
    for (let tick = 0; tick < 13; tick += 1) simulation.updateGame({}, 0.05);
    expect(enemy.state).toBe('spawning');
    expect(state.players.p1.hp).toBe(startingHealth);
    expect(events.some(event => event.eventType === 'PLAYER_HIT')).toBe(false);
  });

  test('creates the selected hero with their campaign starter inventory and loadout', () => {
    const player = { maxHp: 100, hp: 100 };
    applyNetworkHeroProfile(player, 'thorn_knight');

    expect(player).toEqual(expect.objectContaining({
      character: 'thorn_knight',
      equippedWeapon: 'thorns_bleed_blade',
      equippedMoves: expect.objectContaining({ laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' }),
      items: { neo_knife: 1, tooth_of_thorn: 2, tough_bandaid: 1 },
    }));
    expect(player.itemStats).toEqual(expect.objectContaining({
      bleedResistance: 0.1,
      damageReduction: 0.005,
    }));
  });

  test('applies starter defensive item stats to authoritative multiplayer damage', () => {
    const { state, simulation } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess');
    state.projectiles.enemyShot = {
      id: 'enemyShot', hostile: true, ownerId: 'enemy-test', roomId: player.roomId,
      x: player.x, y: player.y, vx: 0, vy: 0, radius: 8, damage: 30,
      attackKind: 'test_volley', expiresTick: state.tick + 10,
    };

    simulation.updateGame({}, 0.05);

    // Prince's Glasses starts Princess with 10% defense. This assertion guards
    // the old failure where multiplayer carried the item but never derived its
    // authoritative itemStats, so the same hit dealt the full 30 damage.
    expect(player.itemStats.damageReduction).toBeCloseTo(0.1);
    expect(player.hp).toBe(111);
  });

  test('makes Cold stacks remove the same fraction of defense as campaign brittle status', () => {
    const clear = combatHarness('princess');
    const brittle = combatHarness('princess');
    [clear, brittle].forEach(({ state }) => {
      const player = state.players.p1;
      applyNetworkHeroProfile(player, 'princess');
      player.items.shield_of_aegis = 1;
      state.projectiles[`shot-${player.id}`] = {
        id: `shot-${player.id}`, hostile: true, ownerId: 'enemy-test', roomId: player.roomId,
        x: player.x, y: player.y, vx: 0, vy: 0, radius: 8, damage: 30,
        attackKind: 'test_volley', expiresTick: state.tick + 10,
      };
    });
    brittle.state.players.p1.statuses = { slow: { stacks: 2, duration: 30, tick: 0, ownerId: 'enemy-test' } };

    const clearHealth = clear.state.players.p1.hp;
    const brittleHealth = brittle.state.players.p1.hp;
    clear.simulation.updateGame({}, 0.05);
    brittle.simulation.updateGame({}, 0.05);

    const clearLoss = clearHealth - clear.state.players.p1.hp;
    const brittleLoss = brittleHealth - brittle.state.players.p1.hp;
    const defense = clear.state.players.p1.itemStats.damageReduction;
    const expectedBrittleRatio = (1 - defense * 0.5) / (1 - defense);
    expect(brittleLoss).toBeCloseTo(clearLoss * expectedBrittleRatio);
    expect(brittleLoss).toBeGreaterThan(clearLoss);
  });

  test('applies validated alt-kit choices and rejects moves outside KIT_ALTERNATIVES', () => {
    const player = { maxHp: 100, hp: 100 };
    applyNetworkHeroProfile(player, 'thorn_knight', { laser: 'thorn_blood_beams', dash: 'knight_slash_dash' });
    expect(player.equippedMoves).toEqual(expect.objectContaining({ laser: 'thorn_blood_beams', dash: 'knight_slash_dash' }));
    expect(player.kitChoices).toEqual({ laser: 'thorn_blood_beams', dash: 'knight_slash_dash' });
    expect(player.ownedMoves.thorn_blood_beams).toBe(true);

    // Picking a slot's default is legal but not recorded as a custom choice.
    expect(sanitizeKitChoices('thorn_knight', { laser: 'blood_beam' })).toEqual({});
    // Anything outside the character's alternatives is rejected outright.
    expect(sanitizeKitChoices('thorn_knight', { laser: 'holy_eye_beams' })).toBeNull();
    expect(sanitizeKitChoices('thorn_knight', { melee: 'slash' })).toBeNull();
    expect(sanitizeKitChoices('thorn_knight', ['blood_beam'])).toBeNull();

    // An invalid payload never silently swaps the kit: the profile falls back
    // to the character defaults.
    applyNetworkHeroProfile(player, 'thorn_knight', { laser: 'holy_eye_beams' });
    expect(player.equippedMoves.laser).toBe('blood_beam');
    expect(player.kitChoices).toEqual({});
  });

  test('gives every Neo Nyke hero a distinct server-owned primary attack', () => {
    const expected = {
      princess: ['projectile', 'princess_wand'],
      thorn_knight: ['sweep', 'thorns_bleed_blade'],
      metao: ['volley', 'metao_fire_staff'],
      gelleh: ['smite', 'gelleh_lightning_spear'],
      mooggy: ['double_sweep', 'claw_gauntlets'],
      turtle_boy: ['sweep', 'extending_staff'],
      sarge: ['projectile', 'sarges_hammer'],
    };
    Object.entries(expected).forEach(([characterKey, [mode, kind]]) => {
      expect(getHeroPrimaryAttack(characterKey)).toEqual(expect.objectContaining({ mode, kind }));
    });
    expect(new Set(Object.keys(expected).map(key => getHeroPrimaryAttack(key).kind)).size).toBe(7);
  });

  test('uses the authority player’s equipped weapon rather than their hero default', () => {
    const { state, simulation } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess');
    player.ownedWeapons.thorns_bleed_blade = true;
    player.equippedWeapon = 'thorns_bleed_blade';
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 60, y: player.y, health: 1000, maxHealth: 1000, moveSpeed: 0 });

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    expect(Object.values(state.projectiles).filter(projectile => projectile.ownerId === player.id)).toHaveLength(0);
    expect(enemy.health).toBeLessThan(1000);
    expect(player.actionKind).toBe('thorns_bleed_blade');
  });

  test('runs an equipped Magenta P90 as its authored timed five-shot burst', () => {
    const { state, simulation, random, events } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess');
    player.ownedWeapons.magenta_p90 = true;
    player.equippedWeapon = 'magenta_p90';
    random.next = () => 0.5;
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(Object.values(state.projectiles).filter(projectile => projectile.attackKind === 'magenta_p90')).toHaveLength(1);

    for (let tick = 0; tick < 8; tick += 1) simulation.updateGame({}, 0.05);

    const shots = Object.values(state.projectiles).filter(projectile => projectile.attackKind === 'magenta_p90');
    expect(shots).toHaveLength(5);
    expect(shots.every(shot => shot.kind === 'magenta_p90' && Math.hypot(shot.vx, shot.vy) === 1200)).toBe(true);
    expect(events.filter(event => event.eventType === 'PLAYER_WEAPON_PROJECTILE_SPAWNED')).toHaveLength(4);
  });

  test('runs equipped Katana Excalibur as the campaign three-sweep divine combo', () => {
    const { state, simulation, events } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess');
    player.ownedWeapons.katana_excalibur_777x = true;
    player.equippedWeapon = 'katana_excalibur_777x';
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 70, y: player.y, health: 1000, maxHealth: 1000, moveSpeed: 0 });

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(player.actionKind).toBe('katana_excalibur_777x');
    expect(player.actionMode).toBe('divine_combo');
    expect(player.pendingWeaponStrikes).toHaveLength(2);
    expect(enemy.health).toBeLessThan(1000);

    simulation.updateGame({}, 0.05);
    simulation.updateGame({}, 0.05);
    expect(player.pendingWeaponStrikes).toHaveLength(0);
    expect(events.filter(event => event.eventType === 'PLAYER_ATTACK_FOLLOWUP')).toHaveLength(2);
  });

  test('runs equipped Sarge Hammer through its returning lightning weapon policy', () => {
    const { state, simulation } = combatHarness('sarge');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'sarge');
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    const hammer = Object.values(state.projectiles).find(projectile => projectile.attackKind === 'sarges_hammer');
    expect(hammer).toEqual(expect.objectContaining({
      kind: 'sarges_hammer', damage: 64, radius: 11, knockback: 520,
      remainingPierces: 0, returning: true, returnPhase: 'out', lightning: true,
    }));
    expect(Math.hypot(hammer.vx, hammer.vy)).toBe(720);
  });

  test('spawns the campaign Sarge double-kill hammer from two authority kills', () => {
    const { state, simulation, events } = combatHarness('sarge');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'sarge');
    simulation.updateGame({}, 0.05);
    const kill = (id, x) => {
      state.enemies[id] = { id, type: 'hunter', roomId: player.roomId, x, y: player.y, radius: 20, health: 1, maxHealth: 1, hp: 1 };
      state.projectiles[`${id}-shot`] = {
        id: `${id}-shot`, ownerId: player.id, roomId: player.roomId, x, y: player.y,
        vx: 0, vy: 0, radius: 8, damage: 10, hostile: false, expiresTick: state.tick + 10,
      };
      simulation.updateGame({}, 0.05);
    };
    kill('sarge-first', player.x + 40);
    kill('sarge-second', player.x + 80);

    const hammer = Object.values(state.projectiles).find(projectile => projectile.attackKind === 'sarges_hammer_double_kill');
    expect(hammer).toEqual(expect.objectContaining({
      kind: 'sarges_hammer', damage: expect.any(Number), radius: 11, knockback: 320,
      remainingPierces: 1, returning: true, returnPhase: 'out', homingTarget: 'enemy', homingRadius: 1100,
    }));
    expect(Math.hypot(hammer.vx, hammer.vy)).toBe(620);
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'SARGES_HAMMER_DOUBLE_KILL' }));
  });

  test('runs equipped Lazer Glasses through campaign twin-beam ricochets and nine ticks', () => {
    const { state, simulation, events } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess');
    player.ownedWeapons.lazer_glasses = true;
    player.equippedWeapon = 'lazer_glasses';
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.doors = { n: false, s: false, e: false, w: false };
    room.structures = [];
    room.destructibles = [{ kind: 'pot', x: player.x + 120, y: player.y - 23, r: 12, hp: 3, maxHp: 3 }];
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 85, y: player.y - 17, health: 10000, maxHealth: 10000, moveSpeed: 0 });

    simulation.updateGame({ p1: { aimDirection: 0, actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(player.actionMode).toBe('lazer_glasses');
    expect(events.filter(event => event.eventType === 'PLAYER_WEAPON_BEAM_TICK')).toHaveLength(1);
    expect(enemy.health).toBeLessThan(10000);
    expect(room.destructibles[0].hp).toBe(2);

    for (let tick = 0; tick < 13; tick += 1) simulation.updateGame({ p1: { aimDirection: 0 } }, 0.05);
    expect(events.filter(event => event.eventType === 'PLAYER_WEAPON_BEAM_TICK')).toHaveLength(9);
    expect(player.weaponBeamChannel).toBeUndefined();
  });

  test('runs Golden Fleece’s equipped max-health healing pulse on the campaign cadence', () => {
    const { state, simulation, events } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess');
    player.ownedWeapons.golden_fleece = true;
    player.equippedWeapon = 'golden_fleece';
    player.maxHp = 150;
    player.hp = 100;
    player.items.drink_master = 1;
    for (let tick = 0; tick < 41; tick += 1) simulation.updateGame({}, 0.05);
    expect(player.hp).toBeCloseTo(110.8);
    const pulse = events.find(event => event.eventType === 'PLAYER_HEALED' && event.data?.source === 'golden_fleece');
    expect(pulse.data.healedAmount).toBeCloseTo(10.8);
  });

  test('applies the campaign moving-gun shot transform and recoil to equipped DeGale', () => {
    const { state, simulation, random } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess');
    player.ownedWeapons.magenta_degale = true;
    player.equippedWeapon = 'magenta_degale';
    player.vx = 228;
    random.next = () => 1;
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    const shot = Object.values(state.projectiles).find(projectile => projectile.attackKind === 'magenta_degale');
    expect(Math.atan2(shot.vy, shot.vx)).toBeCloseTo(0.18);
    expect(player.vx).toBeCloseTo(228 - Math.cos(0.18) * 672);
    expect(player.vy).toBeCloseTo(-Math.sin(0.18) * 672);
  });

  test('applies hero health and movement profiles without client-authored stats', () => {
    const player = { characterKey: 'thorn_knight', maxHp: 100, hp: 50, moveSpeed: 228 };
    applyNetworkHeroProfile(player, 'turtle_boy');
    expect(player).toEqual(expect.objectContaining({
      characterKey: 'turtle_boy', maxHp: 144, hp: 72, moveSpeed: 228,
      damageMultiplier: 1, items: { turtle_shell: 1, dragon_orb: 1 },
      equippedMoves: { melee: 'slash', laser: 'turtle_wave', smash: 'death_ball', dash: 'dash' },
    }));
    applyNetworkHeroProfile(player, 'mooggy');
    expect(player).toEqual(expect.objectContaining({
      characterKey: 'mooggy', maxHp: 130, hp: 65, moveSpeed: 228,
      damageMultiplier: 0.6,
      items: { hemes_scarf: 1, mooggy_zoomies: 1, churu_stick: 1 },
    }));
  });

  test('authoritatively resolves equipped laser, smash, and dash slots with cooldowns', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    applyNetworkHeroProfile(state.players.p1, 'thorn_knight');
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = state.players.p1.x + 80;
    enemy.y = state.players.p1.y;
    enemy.moveSpeed = 0;

    simulation.updateGame({ p1: { actions: [
      { action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 },
      { action: 'ABILITY', abilityId: 'crimson_smash', aimDirection: 0 },
      // Held movement must win over aim, just like the campaign dash.
      { action: 'DASH', abilityId: 'dash', aimDirection: Math.PI / 2, dashMoveX: 1, dashMoveY: 0 },
    ] } }, 0.05);

    expect(enemy.health).toBeLessThan(enemy.maxHealth);
    // Plain dash is a velocity glide, not a teleport: it arms dashUntilTick +
    // a rightward (+x) dash velocity and i-frames, so the hero glides over the
    // next ~0.16s of movement ticks rather than jumping instantly.
    expect(state.players.p1.dashUntilTick).toBeGreaterThan(state.tick);
    expect(state.players.p1.dashVx).toBeGreaterThan(0);
    expect(state.players.p1.invulnerableUntilTick).toBeGreaterThan(state.tick);
    expect(state.players.p1.moveCooldownUntilTick).toEqual(expect.objectContaining({
      blood_beam: expect.any(Number), crimson_smash: expect.any(Number), dash: expect.any(Number),
    }));
    expect(events.filter(event => event.eventType === 'PLAYER_ABILITY_USED')).toHaveLength(3);
    // Channelled beams report the campaign's authored blood_beam range.
    expect(events.find(event => event.data.abilityId === 'blood_beam').data.effectRadius).toBe(430);
  });

  test('resolves Warp at the supplied campaign cursor target with shared safe landing', () => {
    const { state, simulation } = combatHarness('metao');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'metao');
    simulation.updateGame({}, 0.05);
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.structures = [{ kind: 'pillar', x: 620, y: 350, w: 48, h: 48 }];

    simulation.updateGame({ p1: { actions: [{
      action: 'DASH', abilityId: 'warp', aimDirection: 0, targetX: 620, targetY: 350,
    }] } }, 0.05);

    expect(Math.hypot(player.x - 620, player.y - 350)).toBeGreaterThan(42);
    expect(player.x).toBeGreaterThan(400);
    expect(player.invulnerableUntilTick).toBeGreaterThan(state.tick);
  });

  test('Nimrod Stomp uses campaign damage and moves its charged landing off intact destructibles', () => {
    const { state, simulation, events } = combatHarness('sarge');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'sarge');
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    // The eastern authored pillar forces the authoritative adapter to use a
    // later inward spoke candidate, just as campaign's wall-rectangle probe.
    room.structures = [{ kind: 'pillar', x: player.x + 123, y: player.y, w: 20, h: 20 }];
    room.destructibles = [];
    simulation.updateGame({}, 0.05);

    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 180, y: player.y, health: 100, maxHealth: 100, moveSpeed: 0 });
    // One authority tick of charge lands approximately 140px away.  Put an
    // intact pot at that target: the shared safe-ring search must move around
    // it, just as campaign's Neo.isBlocked does.
    const blockedTargetX = player.x + 140;
    room.destructibles.push({ id: 'stomp-pot', kind: 'pot', x: blockedTargetX, y: player.y, r: 14, hp: 1, maxHp: 1, broken: false });

    simulation.updateGame({ p1: { buttons: 4, actions: [{ action: 'DASH', abilityId: 'nimrod_stomp', aimDirection: 0 }] } }, 0.05);
    simulation.updateGame({ p1: { buttons: 0, aimDirection: 0 } }, 0.05);

    expect(MOVE_BASE_STATS.nimrod_stomp.damage).toBe(46);
    expect(MOVE_BASE_STATS.zip_lightning.damage).toBe(26);
    expect(Math.hypot(player.x - blockedTargetX, player.y - 350)).toBeGreaterThan(player.radius + 14);
    // The one-tick hold uses the same minimal charge plus Sarge's authored
    // 1.05 damage multiplier, making the resulting campaign-scaled hit 49.
    expect(enemy.health).toBe(51);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_ABILITY_USED', data: expect.objectContaining({ abilityId: 'nimrod_stomp', mode: 'dash_aoe' }),
    }));
  });

  test('Lightning Cross uses campaign telegraph, strike cadence, Static, and per-hit healing', () => {
    const { state, simulation, events } = combatHarness('sarge');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'sarge', { laser: 'lightning_cross' });
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, {
      x: player.x + 180, y: player.y, health: 10000, maxHealth: 10000, moveSpeed: 0,
    });
    player.hp = 50;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'lightning_cross', aimDirection: 0 }] } }, 0.05);
    const lines = room.hazards.filter(hazard => hazard.source === 'lightning_cross');
    expect(lines).toHaveLength(2);
    expect(lines.every(line => line.warn > 0 && line.ttl > 0)).toBe(true);
    expect(enemy.health).toBe(10000);

    for (let tick = 0; tick < 9; tick += 1) simulation.updateGame({}, 0.05);
    expect(enemy.health).toBe(10000);
    simulation.updateGame({}, 0.05);

    expect(enemy.health).toBeLessThan(10000);
    expect(enemy.statuses.static.stacks).toBeGreaterThan(0);
    // The enemy lies on the horizontal line only, so the first strike restores
    // exactly the campaign's 1% max-health per hit.
    expect(player.hp).toBeCloseTo(51.08, 2);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HEALED', data: expect.objectContaining({ source: 'lightning_cross' }),
    }));
  });

  test('Princess Shield shares campaign stacking and its low-health auto-cast', () => {
    const { state, simulation, events, random } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess', { dash: 'princess_shield' });
    player.hp = 20;
    player.barrier = 17;

    simulation.updateGame({}, 0.05);

    expect(player.barrier).toBe(72);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_ABILITY_USED', data: expect.objectContaining({ abilityId: 'princess_shield', mode: 'shield' }),
    }));
  });

  test('Turtle Power-Up uses the campaign charged burst, additive shell, and timed surge', () => {
    const { state, simulation, events } = combatHarness('turtle_boy');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'turtle_boy', { smash: 'turtle_powerup' });
    player.hp = 80;
    player.barrier = 7;
    simulation.updateGame({}, 0.05);
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.destructibles = [{ id: 'power-up-pot', kind: 'pot', x: player.x + 60, y: player.y, r: 12, hp: 1, maxHp: 1, broken: false }];
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 60, y: player.y, health: 100, maxHealth: 100, moveSpeed: 0 });

    simulation.updateGame({ p1: { buttons: 2, actions: [{ action: 'ABILITY', abilityId: 'turtle_powerup', aimDirection: 0 }] } }, 0.05);
    for (let tick = 0; tick < 25; tick += 1) simulation.updateGame({ p1: { buttons: 2, aimDirection: 0 } }, 0.05);
    simulation.updateGame({ p1: { buttons: 0, aimDirection: 0 } }, 0.05);

    expect(player.hp).toBe(80);
    expect(player.barrier).toBe(27);
    expect(player.turtlePowerUpPower).toBeCloseTo(0.6);
    expect(player.turtlePowerUpUntilTick).toBeGreaterThan(state.tick + 100);
    expect(enemy.health).toBe(56);
    expect(room.destructibles[0].broken).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_ABILITY_USED', data: expect.objectContaining({ abilityId: 'turtle_powerup', mode: 'support', effectRadius: 100 }),
    }));
  });

  test('Turtle Power-Up accelerates authoritative attack cadence for its active duration', () => {
    const regular = combatHarness('turtle_boy');
    const boosted = combatHarness('turtle_boy');
    [regular, boosted].forEach(({ state, simulation }) => {
      applyNetworkHeroProfile(state.players.p1, 'turtle_boy');
      simulation.updateGame({}, 0.05);
      const enemy = Object.values(state.enemies)[0];
      Object.assign(enemy, { x: state.players.p1.x + 60, y: state.players.p1.y, moveSpeed: 0 });
    });
    boosted.state.players.p1.turtlePowerUpUntilTick = boosted.state.tick + 20;
    boosted.state.players.p1.turtlePowerUpPower = 0.6;

    regular.simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    boosted.simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    const regularCadence = regular.state.players.p1.attackCooldownUntilTick - regular.state.tick;
    const boostedCadence = boosted.state.players.p1.attackCooldownUntilTick - boosted.state.tick;
    expect(boostedCadence).toBeLessThan(regularCadence);
  });

  test('Potion Bath uses campaign cleanse, phased healing, protection, and burst plan', () => {
    const { state, simulation, events } = combatHarness('metao');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'metao', { smash: 'potion_bath' });
    player.hp = 50;
    simulation.updateGame({}, 0.05);
    player.statuses.fire = { stacks: 2, duration: 4, tick: 0, ownerId: 'enemy' };
    player.statuses.slow = { stacks: 1, duration: 15, tick: 0, ownerId: 'enemy' };
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x, y: player.y, health: 500, maxHealth: 500, moveSpeed: 0 });

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'potion_bath', aimDirection: 0 }] } }, 0.05);

    expect(player.hp).toBe(62);
    expect(player.statuses.fire.stacks).toBe(0);
    expect(player.statuses.slow.stacks).toBe(0);
    expect(player.potionBathStatusResistUntilTick).toBeGreaterThan(state.tick + 300);
    expect(player.potionBathInvulnerableUntilTick).toBeGreaterThan(state.tick + 80);
    expect(enemy.health).toBeLessThan(500);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_ABILITY_USED', data: expect.objectContaining({ abilityId: 'potion_bath', mode: 'support', effectRadius: expect.any(Number) }),
    }));

    for (let tick = 0; tick < 100; tick += 1) simulation.updateGame({}, 0.05);
    expect(player.hp).toBe(72);
    expect(events.filter(event => event.eventType === 'POTION_BATH_REGEN')).toHaveLength(10);
  });

  test('resolves Zip Lightning through the shared cursor-biased chain plan', () => {
    const { state, simulation, events } = combatHarness('gelleh');
    const player = state.players.p1;
    const startX = player.x;
    applyNetworkHeroProfile(player, 'gelleh');
    simulation.updateGame({}, 0.05);
    const first = Object.values(state.enemies)[0];
    Object.assign(first, { x: player.x + 120, y: player.y, health: 100, maxHealth: 100, moveSpeed: 0 });
    const second = { ...first, id: 'zip-chain-target', x: player.x + 250, health: 100, maxHealth: 100, dead: false };
    state.enemies[second.id] = second;

    simulation.updateGame({ p1: { actions: [{
      action: 'DASH', abilityId: 'zip_lightning', aimDirection: 0,
      targetX: first.x, targetY: first.y,
    }] } }, 0.05);

    expect(player.x).not.toBe(startX);
    expect(first.health).toBeLessThan(100);
    expect(second.health).toBeLessThan(100);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_ABILITY_USED', data: expect.objectContaining({ abilityId: 'zip_lightning', mode: 'dash' }),
    }));
  });

  test('resolves Knight Slash Dash through shared beyond-target hops and bleed lines', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'thorn_knight', { dash: 'knight_slash_dash' });
    simulation.updateGame({}, 0.05);
    const target = Object.values(state.enemies)[0];
    Object.assign(target, { x: player.x + 120, y: player.y, health: 100, maxHealth: 100, moveSpeed: 0 });

    simulation.updateGame({ p1: { actions: [{
      action: 'DASH', abilityId: 'knight_slash_dash', aimDirection: 0,
      targetX: target.x, targetY: target.y,
    }] } }, 0.05);

    expect(player.x).toBeGreaterThan(target.x);
    expect(target.health).toBeLessThan(100);
    expect(target.statuses.bleed.stacks).toBeGreaterThan(0);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_ABILITY_USED', data: expect.objectContaining({ abilityId: 'knight_slash_dash', mode: 'dash' }),
    }));
  });

  test('starts and resolves an authoritative beam struggle when opposing lasers meet', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'thorn_knight');
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = player.x + 150;
    enemy.y = player.y;
    enemy.moveSpeed = 0;
    enemy.beamTime = 1;
    enemy.beamAngle = Math.PI;

    simulation.updateGame({ p1: {
      buttons: 1,
      aimDirection: 0,
      actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 }],
    } }, 0.05);

    expect(state.beamStruggles.p1).toEqual(expect.objectContaining({
      playerId: 'p1', enemyId: enemy.id,
    }));
    expect(events.some(event => event.eventType === 'BEAM_STRUGGLE_STARTED')).toBe(true);

    for (let index = 0; index < 7; index += 1) {
      simulation.updateGame({ p1: {
        buttons: 1,
        aimDirection: 0,
        actions: [{ action: 'BEAM_MASH', aimDirection: 0 }],
      } }, 0.05);
    }

    expect(state.beamStruggles.p1).toBeUndefined();
    expect(enemy.stunnedUntilTick).toBeGreaterThan(state.tick);
    expect(events.some(event => event.eventType === 'BEAM_STRUGGLE_RESOLVED' && event.data.playerWon)).toBe(true);
  });

  test('lets rival players contest opposing beam channels from both clients', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    state.matchRules = { mode: 'rival' };
    state.players.p2 = {
      ...state.players.p1, id: 'p2', x: state.players.p1.x + 160,
      hp: 100, maxHp: 100, beamChannel: null,
    };
    applyNetworkHeroProfile(state.players.p1, 'thorn_knight');
    applyNetworkHeroProfile(state.players.p2, 'thorn_knight');

    simulation.updateGame({
      p1: { buttons: 1, aimDirection: 0, actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 }] },
      p2: { buttons: 1, aimDirection: Math.PI, actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: Math.PI }] },
    }, 0.05);

    expect(state.beamStruggles.p1).toBe(state.beamStruggles.p2);
    state.players.p1.beamDamage = 80;
    state.players.p2.beamDamage = 80;
    state.players.p2.maxHp = 100;
    state.players.p2.hp = 100;
    for (let index = 0; index < 7; index += 1) {
      simulation.updateGame({
        p1: { buttons: 1, aimDirection: 0, actions: [{ action: 'BEAM_MASH', aimDirection: 0 }] },
        p2: { buttons: 1, aimDirection: Math.PI, actions: [] },
      }, 0.05);
    }
    expect(state.beamStruggles.p1).toBeUndefined();
    expect(state.players.p2.hp).toBe(0);
    expect(state.players.p2.downed).toBe(true);
    expect(state.players.p2.stunnedUntilTick).toBeGreaterThan(state.tick);
    expect(events.some(event => event.eventType === 'BEAM_STRUGGLE_RESOLVED' && event.data.opponentPlayerId === 'p2')).toBe(true);
  });

  test('uses the campaign Power Disk recipe: eight radial disks that shed perpendicular shards', () => {
    const { state, simulation } = combatHarness('metao');
    applyNetworkHeroProfile(state.players.p1, 'metao');
    simulation.updateGame({}, 0.05);
    Object.values(state.enemies).forEach(enemy => {
      enemy.x = 850;
      enemy.y = 650;
      enemy.moveSpeed = 0;
    });
    const player = state.players.p1;

    simulation.updateGame({ p1: { actions: [
      { action: 'ABILITY', abilityId: 'power_disks', aimDirection: 1.234 },
    ] } }, 0.05);

    const disks = Object.values(state.projectiles).filter(projectile => projectile.kind === 'disk');
    expect(disks).toHaveLength(8);
    expect(disks.every(projectile => (
      Math.round(Math.hypot(projectile.vx, projectile.vy)) === 440
      && projectile.damage === 20
      && projectile.hitOptions.fireChance === 0.4
    ))).toBe(true);
    expect(new Set(disks.map(projectile => Math.atan2(projectile.vy, projectile.vx).toFixed(4))).size).toBe(8);

    for (let tick = 0; tick < 4; tick += 1) simulation.updateGame({}, 0.05);
    const shards = Object.values(state.projectiles).filter(projectile => projectile.kind === 'disk_shard');
    expect(shards).toHaveLength(16);
    expect(shards.every(projectile => (
      Math.round(Math.hypot(projectile.vx, projectile.vy)) === 620
      && projectile.damage === 8
      && projectile.hitOptions.fireChance === 0.25
    ))).toBe(true);
  });

  test('server spawns and publishes Crimson Smash rock trajectories', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    applyNetworkHeroProfile(state.players.p1, 'thorn_knight');
    simulation.updateGame({}, 0.05);
    const player = state.players.p1;
    const origin = { x: player.x, y: player.y };

    simulation.updateGame({ p1: { actions: [
      { action: 'ABILITY', abilityId: 'crimson_smash', aimDirection: Math.PI / 4 },
    ] } }, 0.05);

    const rocks = Object.values(state.projectiles).filter(projectile => projectile.attackKind === 'crimson_smash');
    expect(rocks).toHaveLength(8);
    expect(rocks.every(projectile => projectile.kind === 'rock' && projectile.ownerId === 'p1')).toBe(true);
    expect(new Set(rocks.map(projectile => `${projectile.vx.toFixed(2)}:${projectile.vy.toFixed(2)}`)).size).toBe(8);
    const abilityEvent = events.find(event => event.eventType === 'PLAYER_ABILITY_USED');
    expect(abilityEvent.data).toEqual(expect.objectContaining({
      playerId: 'p1',
      abilityId: 'crimson_smash',
      originX: origin.x,
      originY: origin.y,
      effectRadius: 148,
      projectileIds: rocks.map(projectile => projectile.id),
      spawnedProjectiles: expect.arrayContaining([
        expect.objectContaining({ id: rocks[0].id, kind: 'rock', vx: expect.any(Number), vy: expect.any(Number) }),
      ]),
    }));
  });

  test('uses the equipped unarmed Narwal Fight move instead of a hero-default weapon attack', () => {
    const { state, simulation, events } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess');
    player.equippedWeapon = '';
    player.equippedMoves.melee = 'narwal_fight';
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 80, y: player.y, health: 1000, maxHealth: 1000, moveSpeed: 0 });

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    const tusk = Object.values(state.projectiles).find(projectile => projectile.attackKind === 'narwal_fight');
    expect(enemy.health).toBeLessThan(1000);
    expect(tusk).toEqual(expect.objectContaining({
      kind: 'narwal_fight', damage: 26, radius: 6, knockback: 200, remainingPierces: 2,
    }));
    expect(Math.hypot(tusk.vx, tusk.vy)).toBeCloseTo(760);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_ATTACKED', data: expect.objectContaining({ attackKind: 'narwal_fight', attackMode: 'sweep_projectile', range: 136, arc: 1.45 }),
    }));
  });

  test('uses the equipped unarmed Fire Balls move with campaign volley recoil and splash', () => {
    const { state, simulation } = combatHarness('metao');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'metao');
    player.equippedWeapon = '';
    player.equippedMoves.melee = 'fire_balls';
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    const fireballs = Object.values(state.projectiles).filter(projectile => projectile.attackKind === 'fire_balls');
    expect(fireballs).toHaveLength(3);
    expect(fireballs.map(projectile => ({ kind: projectile.kind, damage: projectile.damage, splash: projectile.splash, splashDamage: projectile.splashDamage }))).toEqual([
      { kind: 'fireball', damage: 22, splash: 48, splashDamage: 14 },
      { kind: 'fireball', damage: 22, splash: 48, splashDamage: 14 },
      { kind: 'fireball', damage: 22, splash: 48, splashDamage: 14 },
    ]);
    expect(player.vx).toBeLessThanOrEqual(-150);
  });

  test('uses the equipped unarmed Slash move rather than a character-default weapon', () => {
    const { state, simulation } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess');
    player.equippedWeapon = '';
    player.equippedMoves.melee = 'slash';
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 60, y: player.y, health: 1000, maxHealth: 1000, moveSpeed: 0 });

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    expect(Object.values(state.projectiles).filter(projectile => projectile.ownerId === player.id)).toHaveLength(0);
    expect(player.actionKind).toBe('slash');
    expect(player.actionMode).toBe('campaign_slash');
    expect(enemy.health).toBeLessThan(1000);
  });

  test('runs Smite’s authoritative lightning stab, beam-scaled blade, and prop chain', () => {
    const { state, simulation } = combatHarness('gelleh');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'gelleh');
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 60, y: player.y, health: 1000, maxHealth: 1000, moveSpeed: 0 });
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.destructibles = [{ id: 'smite-pot', kind: 'pot', x: player.x + 142, y: player.y, r: 12, hp: 3, maxHp: 3, broken: false }];

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    const blade = Object.values(state.projectiles).find(projectile => projectile.attackKind === 'gelleh_lightning_spear');
    expect(blade).toEqual(expect.objectContaining({
      kind: 'blade_justice', damage: 18, radius: 7, knockback: 80, remainingPierces: 98, lightning: true,
      hitOptions: { lightning: true },
    }));
    expect(enemy.statuses.static).toEqual(expect.objectContaining({ stacks: expect.any(Number) }));
    expect(room.destructibles[0].hp).toBe(1);
  });

  test('server owns persistent zones, pulses, and expiry', () => {
    const { state, simulation, events } = combatHarness('gelleh');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'gelleh');
    player.hp = 40;
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = player.x + 40;
    enemy.y = player.y;
    enemy.moveSpeed = 0;

    simulation.updateGame({ p1: { actions: [
      { action: 'ABILITY', abilityId: 'healing_zone', aimDirection: 0 },
    ], buttons: 2 } }, 0.05);
    simulation.updateGame({ p1: { buttons: 0, aimDirection: 0 } }, 0.05);

    expect(Object.values(state.abilityEntities)).toEqual([
      expect.objectContaining({ kind: 'healing_zone', ownerId: 'p1', roomId: player.roomId }),
    ]);
    expect(player.hp).toBeGreaterThan(40);
    expect(enemy.health).toBeLessThan(enemy.maxHealth);
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'ABILITY_ENTITY_PULSED' }));

    for (let tick = 0; tick < 210; tick += 1) simulation.updateGame({}, 0.05);
    expect(state.abilityEntities).toEqual({});
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'ABILITY_ENTITY_REMOVED' }));
  });

  test('runs Blade Justice as three cursor-steered authoritative contact entities', () => {
    const { state, simulation } = combatHarness('gelleh');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'gelleh');
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = player.x + 110;
    enemy.y = player.y;
    enemy.moveSpeed = 0;

    simulation.updateGame({ p1: { actions: [
      { action: 'ABILITY', abilityId: 'blade_justice', aimDirection: 0 },
    ] } }, 0.05);
    const blades = Object.values(state.abilityEntities).filter(entity => entity.kind === 'blade_justice');
    expect(blades).toHaveLength(3);
    expect(blades).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: 'p1', abilityId: 'blade_justice', radius: 16, damage: 22 }),
    ]));

    simulation.updateGame({ p1: { aimDirection: 0 } }, 0.05);
    expect(enemy.health).toBeLessThan(enemy.maxHealth);
    simulation.updateGame({ p1: { aimDirection: Math.PI / 2 } }, 0.05);
    expect(blades.some(blade => blade.y > player.y)).toBe(true);
  });

  test('Floor Is Lava grants campaign lava immunity and leaves stationary, continuous-damage puddles', () => {
    const { state, simulation } = combatHarness('thorn_knight');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'thorn_knight');
    player.equippedMoves.smash = 'floor_lava';
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.hazards = [{ kind: 'lava', x: player.x, y: player.y, r: 60 }];
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = player.x;
    enemy.y = player.y;
    enemy.moveSpeed = 0;
    const hpBeforeFloorLava = player.hp;

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'floor_lava', aimDirection: 0 }] } }, 0.05);

    const firstPuddle = Object.values(state.abilityEntities).find(entity => entity.abilityId === 'floor_lava');
    expect(player.floorLavaUntilTick - state.tick).toBeGreaterThanOrEqual(149);
    expect(player.hp).toBe(hpBeforeFloorLava);
    expect(firstPuddle).toEqual(expect.objectContaining({
      kind: 'lava', x: player.x, y: player.y, radius: 24, followOwner: false,
      pulseIntervalTicks: 1, emitPulseEvent: false,
    }));
    expect(firstPuddle.damage).toBeCloseTo(0.7);
    expect(enemy.health).toBeLessThan(enemy.maxHealth);

    player.x += 80;
    for (let tick = 0; tick < 5; tick += 1) simulation.updateGame({}, 0.05);
    const puddles = Object.values(state.abilityEntities).filter(entity => entity.abilityId === 'floor_lava');
    expect(puddles.some(entity => entity.x === player.x && entity.y === player.y)).toBe(true);
    expect(firstPuddle.x).not.toBe(player.x);
  });

  test('Random Pounce uses the campaign burst and locked-target homing fang volley', () => {
    const { state, simulation, events } = combatHarness('mooggy');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'mooggy');
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = player.x + 140;
    enemy.y = player.y;
    enemy.health = 1000;
    enemy.maxHealth = 1000;
    enemy.moveSpeed = 0;

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'random_pounce', aimDirection: 0 }] } }, 0.05);

    const fangs = Object.values(state.projectiles).filter(projectile => projectile.attackKind === 'random_pounce');
    expect(enemy.health).toBeLessThan(1000);
    expect(enemy.statuses.bleed.stacks).toBeGreaterThanOrEqual(2);
    expect(fangs).toHaveLength(8);
    expect(fangs.every(fang => fang.kind === 'fang' && fang.homingTargetId === enemy.id)).toBe(true);
    expect(fangs.every(fang => fang.homingRadius === 380 && fang.ignoreGodMode)).toBe(true);
    expect(fangs[0].hitOptions).toEqual(expect.objectContaining({ critBonus: 0.35, bleedChance: 0.55 }));
  });

  test('Mooggy Hairball uses its campaign AOE, poison, and freeze descriptor', () => {
    const { state, simulation, events } = combatHarness('mooggy');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'mooggy', { smash: 'mooggy_hairball' });
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 120, y: player.y, health: 10000, maxHealth: 10000, moveSpeed: 0 });

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'mooggy_hairball', aimDirection: 0 }] } }, 0.05);

    expect(enemy.health).toBeLessThan(10000);
    expect(enemy.statuses.poison).toEqual(expect.objectContaining({ stacks: 3 }));
    expect(enemy.statuses.slow).toEqual(expect.objectContaining({ stacks: 1 }));
    // The enemy update consumes the first 50ms in this same cast frame.
    expect(enemy.stunnedUntilTick - state.tick).toBeGreaterThanOrEqual(15);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_ABILITY_USED', data: expect.objectContaining({ abilityId: 'mooggy_hairball', effectRadius: 132 }),
    }));
  });

  test('holds and releases Mooggy Swipe through the authoritative melee charge lifecycle', () => {
    const { state, simulation, events } = combatHarness('mooggy');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'mooggy');
    player.equippedWeapon = null;
    player.equippedMoves.melee = 'mooggy_swipe';
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = player.x + 100;
    enemy.y = player.y;
    enemy.moveSpeed = 0;
    const hp = enemy.health;

    simulation.updateGame({ p1: { buttons: 8, aimDirection: 0, actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(player.heldCharge).toEqual(expect.objectContaining({ moveKey: 'mooggy_swipe', slot: 'melee' }));
    expect(enemy.health).toBe(hp);
    for (let tick = 0; tick < 50; tick += 1) simulation.updateGame({ p1: { buttons: 8, aimDirection: 0 } }, 0.05);
    simulation.updateGame({ p1: { buttons: 0, aimDirection: 0 } }, 0.05);

    expect(player.heldCharge).toBeNull();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_ATTACKED', data: expect.objectContaining({ attackKind: 'mooggy_swipe', chargeRatio: 0.51 }),
    }));
    expect(player.actionKind).toBe('mooggy_swipe');
    expect(player.actionMode).toBe('charged_sweep');
  });

  test('rolls Mooggy Swipe bleed through the deterministic campaign on-hit proc', () => {
    const resolve = (encounterRoll) => {
      const { state, random, simulation } = combatHarness('mooggy');
      const player = state.players.p1;
      applyNetworkHeroProfile(player, 'mooggy');
      // This test isolates Mooggy Swipe's own 12% roll from the passive Scarf
      // status upkeep covered by the event-item tests.
      player.items.hemes_scarf = 0;
      player.itemStats.passiveBleedStacks = 0;
      player.equippedWeapon = null;
      player.equippedMoves.melee = 'mooggy_swipe';
      simulation.updateGame({}, 0.05);
      const enemy = Object.values(state.enemies)[0];
      enemy.x = player.x + 100;
      enemy.y = player.y;
      enemy.health = enemy.maxHealth = 10000;
      enemy.moveSpeed = 0;
      random.next = stream => stream === 'encounter' ? encounterRoll : 1;
      simulation.updateGame({ p1: { buttons: 8, aimDirection: 0, actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
      simulation.updateGame({ p1: { buttons: 0, aimDirection: 0 } }, 0.05);
      return enemy.statuses.bleed.stacks;
    };

    // A zero-charge swipe has a 12% bleed chance; the same shared descriptor
    // must miss above that threshold and hit below it.
    expect(resolve(0.2)).toBe(0);
    expect(resolve(0.1)).toBe(1);
  });

  test('Nail Shot uses the campaign twelve-nail ricochet profile', () => {
    const { state, simulation } = combatHarness('mooggy');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'mooggy');
    simulation.updateGame({}, 0.05);

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'nail_shot', aimDirection: 0 }] } }, 0.05);

    const nails = Object.values(state.projectiles).filter(projectile => projectile.attackKind === 'nail_shot');
    expect(nails).toHaveLength(12);
    expect(nails.every(nail => nail.kind === 'nail' && nail.radius === 3 && nail.knockback === 80)).toBe(true);
    expect(nails.every(nail => nail.lifeTicks)).toBe(true);
    expect(nails.every(nail => nail.hitOptions?.drainChanceBonus === 0.05)).toBe(true);
    expect(nails.every(nail => nail.bouncesRemaining >= 3)).toBe(true);
  });

  test('Laser Shockwave uses the campaign stationary full-room rock column', () => {
    const { state, simulation } = combatHarness('mooggy');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'mooggy');
    player.equippedMoves.laser = 'laser_shockwave';
    simulation.updateGame({}, 0.05);
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'laser_shockwave', aimDirection: 0 }] } }, 0.05);
    const spikes = Object.values(state.projectiles).filter(projectile => projectile.attackKind === 'laser_shockwave');

    expect(spikes).toHaveLength(14);
    expect(spikes.every(spike => spike.kind === 'rock' && spike.radius === 18 && spike.remainingPierces === 99)).toBe(true);
    expect(spikes.every(spike => spike.knockback === 220 && spike.lifeTicks >= 9)).toBe(true);
    expect(spikes.map(spike => spike.y)).toEqual(expect.arrayContaining([40, 638]));
  });

  test('Chaos Burst creates the campaign opening volley and follow field', () => {
    const { state, simulation } = combatHarness('metao');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'metao');
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = player.x + 80;
    enemy.y = player.y;
    enemy.health = 1000;
    enemy.maxHealth = 1000;
    enemy.moveSpeed = 0;
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'chaos_burst', aimDirection: 0 }] } }, 0.05);
    const field = Object.values(state.abilityEntities).find(entity => entity.abilityId === 'chaos_burst');

    expect(field).toEqual(expect.objectContaining({ radius: 180, burstRadius: 52, damage: 18, followOwner: true, isMetao: true }));
    expect(field.pulseIntervalTicks).toBeCloseTo(4.4);
    expect(enemy.health).toBeLessThan(1000);
    expect(enemy.statuses.poison).toBeDefined();
    expect(enemy.statuses.fire).toBeDefined();
  });

  test('Holy Turrets use campaign-clamped placement and scaled pulse entities', () => {
    const { state, simulation } = combatHarness('gelleh');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'gelleh');
    player.equippedMoves.smash = 'holy_turrets';
    player.x = 30;
    player.y = 30;
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'holy_turrets', aimDirection: Math.PI }] } }, 0.05);
    const turrets = Object.values(state.abilityEntities).filter(entity => entity.abilityId === 'holy_turrets');

    expect(turrets).toHaveLength(3);
    expect(turrets.every(turret => turret.x >= 44 && turret.y >= 44)).toBe(true);
    expect(turrets.every(turret => turret.radius === 26 && turret.burstRadius === 56 && turret.damage === 26)).toBe(true);
    expect(turrets.every(turret => turret.pulseIntervalTicks === 12 && turret.expiresTick - state.tick >= 119)).toBe(true);
  });

  test('Lightning Columns use the submitted aim target in the authoritative room', () => {
    const { state, simulation } = combatHarness('gelleh');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'gelleh');
    player.equippedMoves.laser = 'lightning_columns';
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'lightning_columns', aimDirection: 0, targetX: 400, targetY: 250 }] } }, 0.05);
    const columns = Object.values(state.abilityEntities).filter(entity => entity.abilityId === 'lightning_columns');
    expect(columns).toHaveLength(2);
    expect(columns.map(column => [column.x, column.y])).toEqual(expect.arrayContaining([[400, 208], [400, 292]]));
    expect(columns.every(column => column.radius === 54 && column.damage === 18 && column.pulseIntervalTicks === 9)).toBe(true);
  });

  test('Excalibur Strike schedules five delayed campaign sword impacts at the aim target', () => {
    const { state, simulation } = combatHarness('gelleh');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'gelleh');
    player.equippedMoves.smash = 'excalibur_strike';
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'excalibur_strike', aimDirection: 0, targetX: 400, targetY: 250 }] } }, 0.05);
    const swords = Object.values(state.abilityEntities).filter(entity => entity.abilityId === 'excalibur_strike');
    expect(swords).toHaveLength(5);
    expect(swords[0]).toEqual(expect.objectContaining({
      x: 400, y: 250, radius: 76, damage: 46, pulseIntervalTicks: 999,
      phase: 'falling', spin: expect.any(Number), impactTick: expect.any(Number),
      hoverUntilTick: expect.any(Number), fadeUntilTick: expect.any(Number),
    }));
    expect(swords.some(sword => sword.nextPulseTick > state.tick)).toBe(true);
    expect(swords.every(sword => sword.expiresTick === sword.fadeUntilTick)).toBe(true);
  });

  test('Wall of Toph uses the campaign slam, shard ring, authoritative cover, and timed crumble', () => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'thorn_knight');
    player.equippedMoves.smash = 'wall_of_toph';
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    // The eastern authored pillar forces the authoritative adapter to use a
    // later inward spoke candidate, just as campaign's wall-rectangle probe.
    room.structures = [{ kind: 'pillar', x: player.x + 123, y: player.y, w: 20, h: 20 }];
    room.destructibles = [];
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 80, y: player.y, health: 1000, maxHealth: 1000, moveSpeed: 0 });

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'wall_of_toph', aimDirection: 0 }] } }, 0.05);

    const barriers = room.destructibles.filter(prop => prop.ownerId === player.id && prop.kind === 'cover_wall');
    const rocks = Object.values(state.projectiles).filter(projectile => projectile.attackKind === 'wall_of_toph');
    const cast = events.find(event => event.eventType === 'PLAYER_ABILITY_USED' && event.data.abilityId === 'wall_of_toph');
    expect(enemy.health).toBeLessThan(1000);
    expect(barriers).toHaveLength(8);
    // Shards may immediately strike their own ring, exactly as campaign does;
    // verify the authored wall durability rather than a collision-order state.
    expect(barriers.every(barrier => barrier.hp > 0 && barrier.hp <= 8 && barrier.maxHp === 8 && barrier.ttl > 7.9)).toBe(true);
    expect(barriers.find(barrier => barrier.x > player.x && Math.abs(barrier.y - player.y) < 1).x).toBeLessThan(player.x + 100);
    // The action record captures every spawned projectile even when the first
    // simulation tick correctly lets a shard collide with nearby cover.
    expect(cast.data.projectileIds).toHaveLength(12);
    expect(cast.data.spawnedProjectiles).toHaveLength(12);
    expect(cast.data.spawnedProjectiles.every(rock => rock.kind === 'rock')).toBe(true);
    expect(rocks.length).toBeGreaterThan(0);
    expect(rocks.every(rock => rock.kind === 'rock' && rock.knockback === 200 && rock.remainingPierces >= 0 && rock.remainingPierces <= 1 && rock.ignoreGodMode)).toBe(true);

    // A hostile round intersects the new cover before it reaches the hero.
    const eastBarrier = barriers.find(barrier => barrier.x > player.x && Math.abs(barrier.y - player.y) < 1);
    const hostileId = state.allocateEntityId('projectile');
    state.projectiles[hostileId] = {
      id: hostileId, hostile: true, ownerId: 'enemy-test', roomId: room.id,
      x: eastBarrier.x, y: eastBarrier.y, vx: 0, vy: 0, radius: 6, damage: 30,
      attackKind: 'test_volley', expiresTick: state.tick + 10,
    };
    simulation.updateGame({}, 0.05);
    expect(state.projectiles[hostileId]).toBeUndefined();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PROJECTILE_BLOCKED', data: expect.objectContaining({ projectileId: hostileId, obstacleKind: 'cover_wall' }),
    }));

    for (let tick = 0; tick < 160; tick += 1) simulation.updateGame({}, 0.05);
    expect(barriers.every(barrier => barrier.broken && barrier.hp === 0)).toBe(true);
    expect(events.filter(event => event.eventType === 'DESTRUCTIBLE_BROKEN' && event.data.expired)).toHaveLength(8);
  });

  test('Kicky Kick performs the campaign blast, recoil, and eligible enemy doorway ejection', () => {
    const { state, random, simulation, events } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess');
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.type = 'combat';
    room.gx = 0;
    room.gy = 0;
    room.doors = { n: false, s: false, e: true, w: false };
    const targetRoom = {
      ...room,
      id: 'kicky-target-room', gx: 1, gy: 0,
      doors: { n: false, s: false, e: false, w: true },
      structures: [], destructibles: [], hazards: [],
    };
    state.floorState.layout.rooms.push(targetRoom);
    // Let the shared portal/emergence window end before asserting the kick's
    // physical impulse; spawning enemies intentionally have zero velocity.
    for (let tick = 0; tick < 15; tick += 1) simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.values(state.enemies).filter(candidate => candidate.id !== enemy.id).forEach(candidate => delete state.enemies[candidate.id]);
    state.floorState.encounters[room.id].enemyIds = [enemy.id];
    Object.assign(enemy, { x: player.x + 60, y: player.y, health: 1000, maxHealth: 1000, moveSpeed: 0, radius: 15 });
    // The campaign ejection chance is stochastic. Freeze the encounter stream
    // here so this test verifies the real success path deterministically.
    random.next = () => 0;

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'kicky_kick', aimDirection: 0 }] } }, 0.05);

    expect(enemy.health).toBeLessThan(1000);
    expect(enemy.roomId).toBe(targetRoom.id);
    expect(enemy.x).toBe(53);
    expect(enemy.y).toBe(316);
    expect(enemy.vx).toBeGreaterThanOrEqual(1800);
    expect(player.vx).toBeLessThanOrEqual(-260);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ENEMY_ROOM_TRANSFERRED',
      data: expect.objectContaining({ enemyId: enemy.id, fromRoomId: room.id, toRoomId: targetRoom.id, direction: 'e', entryDirection: 'w' }),
    }));
    expect(events).toContainEqual(expect.objectContaining({ eventType: 'ROOM_CLEARED', data: { roomId: room.id } }));
  });

  test('Healing Zone gives its nearest ally the campaign charged pulse instead of owner-only fixed healing', () => {
    const { state, simulation } = combatHarness('gelleh');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'gelleh');
    state.players.p2 = {
      ...player, id: 'p2', x: player.x + 5, y: player.y, hp: 20, maxHp: 120,
      moveChargeState: {}, moveCooldownUntilTick: {}, equippedMoves: { ...player.equippedMoves }, itemStats: { ...player.itemStats },
    };
    player.hp = 20;
    simulation.updateGame({}, 0.05);
    simulation.updateGame({ p1: { buttons: 2, actions: [{ action: 'ABILITY', abilityId: 'healing_zone', aimDirection: 0 }] } }, 0.05);
    for (let tick = 0; tick < 25; tick += 1) simulation.updateGame({ p1: { buttons: 2 } }, 0.05);
    simulation.updateGame({ p1: { buttons: 0 } }, 0.05);
    const zone = Object.values(state.abilityEntities)[0];

    expect(zone.radius).toBeCloseTo(124);
    expect(zone.expiresTick - state.tick).toBeGreaterThan(180);
    // The campaign field heals the nearest living party member, not a fixed
    // owner reference. Move the caster out before the next half-second pulse.
    player.x += 300;
    for (let tick = 0; tick < 10; tick += 1) simulation.updateGame({}, 0.05);
    expect(state.players.p2.hp).toBeGreaterThan(20);
    expect(player.hp).toBeCloseTo(28.096);
  });

  test('server enforces authored invulnerability and Hammer Smash stun', () => {
    const flight = combatHarness('princess');
    applyNetworkHeroProfile(flight.state.players.p1, 'princess');
    flight.simulation.updateGame({}, 0.05);
    flight.simulation.updateGame({ p1: { actions: [
      { action: 'DASH', abilityId: 'flying_unhitable', aimDirection: 0 },
    ] } }, 0.05);
    const flyer = flight.state.players.p1;
    const projectileId = flight.state.allocateEntityId('projectile');
    flight.state.projectiles[projectileId] = {
      id: projectileId, hostile: true, ownerId: 'enemy', roomId: flyer.roomId,
      x: flyer.x, y: flyer.y, vx: 0, vy: 0, radius: 8, damage: 25,
      attackKind: 'test', expiresTick: flight.state.tick + 5,
    };
    flight.simulation.updateGame({}, 0.05);
    expect(flyer.health).toBe(flyer.maxHealth);
    expect(flight.events).toContainEqual(expect.objectContaining({ eventType: 'PLAYER_DAMAGE_BLOCKED' }));

    const hammer = combatHarness('sarge');
    applyNetworkHeroProfile(hammer.state.players.p1, 'sarge');
    hammer.simulation.updateGame({}, 0.05);
    const enemy = Object.values(hammer.state.enemies)[0];
    enemy.maxHealth = 200;
    enemy.health = 200;
    enemy.x = hammer.state.players.p1.x + 70;
    enemy.y = hammer.state.players.p1.y;
    hammer.simulation.updateGame({ p1: { actions: [
      { action: 'ABILITY', abilityId: 'hammer_smash', aimDirection: 0 },
    ] } }, 0.05);
    expect(enemy.stunnedUntilTick).toBeGreaterThan(hammer.state.tick);
    // Hammer debris is part of the campaign slam, rather than an optional
    // local visual. A level-one hero creates two shards on each cardinal arm.
    const hammerRocks = Object.values(hammer.state.projectiles)
      .filter(projectile => projectile.attackKind === 'hammer_smash');
    expect(hammerRocks).toHaveLength(8);
    expect(hammerRocks.every(projectile => (
      projectile.kind === 'rock'
      && projectile.damage === 19
      && projectile.knockback === 260
      && Math.round(Math.hypot(projectile.vx, projectile.vy)) >= 505
      && Math.round(Math.hypot(projectile.vx, projectile.vy)) <= 625
    ))).toBe(true);
  });

  test('rejects client ability IDs that are not equipped by that hero', () => {
    const { state, simulation, events } = combatHarness('princess');
    applyNetworkHeroProfile(state.players.p1, 'princess');
    simulation.updateGame({}, 0.05);
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'wizard_lazer', aimDirection: 0 }] } }, 0.05);
    expect(events.some(event => event.eventType === 'PLAYER_ABILITY_USED')).toBe(false);
    expect(state.players.p1.moveCooldownUntilTick).toEqual({});
  });

  test.each(Object.entries(MOVE_SLOT_KEYS)
    .filter(([slot]) => slot !== 'melee')
    .flatMap(([slot, moveKeys]) => moveKeys.map(moveKey => [slot, moveKey])))('%s move %s resolves through the shared authority catalog', (slot, moveKey) => {
    const { state, simulation, events } = combatHarness('thorn_knight');
    const player = state.players.p1;
    player.equippedMoves = { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash', [slot]: moveKey };
    player.moveCooldownUntilTick = {};
    player.statusUntilTick = {};
    const heldButtonByMove = {
      love_bomb_laser: 1, ghost_ball: 1,
      healing_zone: 2, death_ball: 2, turtle_powerup: 2,
      nimrod_stomp: 4,
    };
    const heldButton = heldButtonByMove[moveKey] || 0;
    simulation.updateGame({}, 0.05);
    simulation.updateGame({ p1: { actions: [{
      action: slot === 'dash' ? 'DASH' : 'ABILITY', abilityId: moveKey, aimDirection: 0.35,
    }], ...(heldButton ? { buttons: heldButton } : {}) } }, 0.05);
    if (heldButton) simulation.updateGame({ p1: { buttons: 0, aimDirection: 0.35 } }, 0.05);

    const event = events.find(candidate => candidate.eventType === 'PLAYER_ABILITY_USED');
    expect(event?.data).toEqual(expect.objectContaining({
      playerId: 'p1', roomId: player.roomId, slot, abilityId: moveKey,
      originX: expect.any(Number), originY: expect.any(Number),
      destinationX: expect.any(Number), destinationY: expect.any(Number),
    }));
    expect(event?.data).not.toHaveProperty('presentation');
    expect(event?.data).not.toHaveProperty('presentationKey');
  });

  test.each([
    ['princess', 34, 1, 'princess_wand'],
    ['thorn_knight', 2, 0, 'thorns_bleed_blade'],
    ['metao', 34, 3, 'metao_fire_staff'],
    ['gelleh', 0, 1, 'gelleh_lightning_spear'],
    ['mooggy', 8, 0, 'claw_gauntlets'],
    ['turtle_boy', 0, 0, 'extending_staff'],
    ['sarge', 0, 1, 'sarges_hammer'],
  ])('%s resolves its own attack shape on the authority', (characterKey, healthAfterImmediate, projectileCount, attackKind) => {
    const { state, simulation, events } = combatHarness(characterKey);
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = 390;
    enemy.y = 350;
    enemy.moveSpeed = 0;
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);

    expect(enemy.health).toBe(healthAfterImmediate);
    expect(Object.values(state.projectiles)).toHaveLength(projectileCount);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_ATTACKED',
      data: expect.objectContaining({ characterKey, attackKind }),
    }));
    if (characterKey === 'mooggy') {
      simulation.updateGame({}, 0.05);
      simulation.updateGame({}, 0.05);
      expect(enemy.health).toBe(0);
      expect(events).toContainEqual(expect.objectContaining({ eventType: 'PLAYER_ATTACK_FOLLOWUP' }));
    }
  });

  // Hunters are melee chasers in the campaign — the old multiplayer-only
  // "ranged hunter arrow" no longer exists. The authored sniper is the ranged
  // telegraph-then-fire archetype.
  test('snipers telegraph and fire server projectiles that damage players', () => {
    const { state, simulation, events } = combatHarness();
    simulation.updateGame({}, 0.05);
    const [enemy, ...others] = Object.values(state.enemies);
    others.forEach(other => {
      other.dead = true;
      other.health = 0;
      other.deathTick = state.tick;
    });
    enemy.type = 'sniper';
    enemy.behavior = 'sniper';
    enemy.sniperBehavior = 'stayback';
    enemy.contactDamage = 12;
    enemy.attackCd = 0;
    enemy.spawnTick = -100; // past the 0.72s spawn-emergence lock
    enemy.x = 560;
    enemy.y = 350;
    for (let tick = 0; tick < 25; tick += 1) simulation.updateGame({}, 0.05);

    expect(events.some(event => event.eventType === 'ENEMY_TELEGRAPH')).toBe(true);
    expect(events.some(event => event.eventType === 'ENEMY_ATTACKED')).toBe(true);
    const projectile = Object.values(state.projectiles).find(candidate => candidate.hostile);
    // Campaign sniper round: dmg + 5.
    expect(projectile).toEqual(expect.objectContaining({ type: 'sniper_round', damage: 17 }));
    projectile.x = state.players.p1.x;
    projectile.y = state.players.p1.y;
    projectile.vx = 0;
    projectile.vy = 0;
    simulation.updateGame({}, 0.05);
    expect(state.players.p1.hp).toBeLessThan(100);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'PLAYER_HIT',
      data: expect.objectContaining({ attackKind: 'sniper_projectile', damage: 17 }),
    }));
  });

  test('creates the same seeded encounter independently of client presentation', () => {
    const first = combatHarness();
    const second = combatHarness();
    ensureNetworkEncounter(first.state, first.random);
    ensureNetworkEncounter(second.state, second.random);

    const firstEnemy = Object.values(first.state.enemies)[0];
    const secondEnemy = Object.values(second.state.enemies)[0];
    expect(firstEnemy).toEqual(secondEnemy);
    expect(first.state.floorState.encounters[first.state.floorState.currentRoomId]).toEqual(
      expect.objectContaining({ status: 'active', enemyIds: [firstEnemy.id] }),
    );
    expect(isNetworkRoomLocked(first.state)).toBe(false);

    const startRoom = first.state.floorState.layout.rooms.find(room => room.id === first.state.floorState.currentRoomId);
    startRoom.type = 'challenge';
    expect(isNetworkRoomLocked(first.state)).toBe(true);
  });

  test('constructs authority elites through the shared campaign trait profile', () => {
    const { state, events } = combatHarness();
    state.players.p1.level = 4;
    const room = state.floorState.layout.rooms.find(candidate => candidate.type === 'combat');
    state.players.p1.roomId = room.id;
    const stream = { next: () => 0, chance: () => true, int: () => 0 };
    ensureNetworkEncounter(state, { scoped: () => stream }, (eventType, data) => events.push({ eventType, data }), room.id);

    const elite = Object.values(state.enemies).find(enemy => enemy.elite);
    expect(elite).toEqual(expect.objectContaining({
      level: 4, eliteTypes: ['knight', 'lazered'],
      elitePowers: ['lazered'], eliteDurabilityV2: true,
      eliteKnightMult: 1.15, eliteLaserModeIndex: 0,
    }));
    expect(elite.maxHealth).toBeGreaterThan(52);
    expect(elite.contactDamage).toBeGreaterThan(12);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ENEMY_SPAWNED', data: expect.objectContaining({ enemyId: elite.id, elite: true, elitePower: 'lazered' }),
    }));
  });

  test("consumes Moggy's Coat once when the next authoritative encounter begins", () => {
    const { state, random, events } = combatHarness();
    const player = state.players.p1;
    player.items = { moggys_coat: 2 };
    player.moggysCoatPrimed = true;

    const encounter = ensureNetworkEncounter(state, random, (eventType, data) => events.push({ eventType, data }));
    const targets = encounter.enemyIds.map(enemyId => state.enemies[enemyId]);
    expect(player.moggysCoatPrimed).toBe(false);
    targets.forEach(enemy => {
      expect(enemy.statuses.dark_drain).toEqual(expect.objectContaining({ stacks: 2, duration: 2 }));
    });
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'MOGGYS_COAT_TRIGGERED',
      data: expect.objectContaining({ playerId: player.id, roomId: player.roomId, stacks: 2, targetCount: targets.length }),
    }));
  });

  test('runs persistent shared encounter state in every occupied player room', () => {
    const { state, simulation } = combatHarness('princess');
    applyNetworkHeroProfile(state.players.p1, 'princess');
    const secondRoom = state.floorState.layout.rooms.find(room => room.type === 'combat');
    state.players.p2 = {
      ...state.players.p1,
      id: 'p2',
      characterKey: 'sarge',
      roomId: secondRoom.id,
      x: 450,
      y: 350,
    };
    applyNetworkHeroProfile(state.players.p2, 'sarge');

    simulation.updateGame({}, 0.05);

    const firstRoomId = state.players.p1.roomId;
    expect(state.floorState.encounters[firstRoomId]).toEqual(expect.objectContaining({ status: 'active' }));
    expect(state.floorState.encounters[secondRoom.id]).toEqual(expect.objectContaining({ status: 'active' }));
    expect(new Set(Object.values(state.enemies).map(enemy => enemy.roomId))).toEqual(new Set([firstRoomId, secondRoom.id]));

    state.floorState.encounters[secondRoom.id].status = 'cleared';
    Object.keys(state.enemies).forEach(id => {
      if (state.enemies[id].roomId === secondRoom.id) delete state.enemies[id];
    });
    state.players.p2.roomId = firstRoomId;
    simulation.updateGame({}, 0.05);
    state.players.p2.roomId = secondRoom.id;
    simulation.updateGame({}, 0.05);
    expect(state.floorState.encounters[secondRoom.id].status).toBe('cleared');
    expect(Object.values(state.enemies).some(enemy => enemy.roomId === secondRoom.id)).toBe(false);
  });

  test('owns projectile hits, campaign coin drops, room clear, and pickup currency', () => {
    const { state, simulation, events } = combatHarness();
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    enemy.x = 500;
    enemy.y = 350;
    enemy.moveSpeed = 0.001;

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    for (let tick = 0; tick < getHeroPrimaryAttack('princess').cooldownTicks + 1; tick += 1) simulation.updateGame({}, 0.05);
    expect(enemy.health).toBe(4);

    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    for (let tick = 0; tick < 12; tick += 1) simulation.updateGame({}, 0.05);

    expect(enemy.dead).toBe(true);
    expect(isNetworkRoomLocked(state)).toBe(false);
    expect(Object.values(state.pickups).reduce((total, pickup) => total + pickup.value, 0)).toBe(5);
    expect(events.filter(event => event.eventType === 'ENEMY_DEFEATED')).toHaveLength(1);
    expect(events.filter(event => event.eventType === 'PICKUP_SPAWNED')).toHaveLength(5);
    expect(events.filter(event => event.eventType === 'ROOM_CLEARED')).toHaveLength(1);

    Object.values(state.pickups).forEach(pickup => { pickup.x = state.players.p1.x; pickup.y = state.players.p1.y; });
    simulation.updateGame({}, 0.05);
    expect(state.players.p1.coins).toBe(5);
    expect(Object.values(state.pickups)).toHaveLength(0);
    expect(events.filter(event => event.eventType === 'PICKUP_COLLECTED')).toHaveLength(5);
  });

  test('keeps authoritative combat state serializable', () => {
    const { state, simulation } = combatHarness();
    simulation.updateGame({ p1: { actions: [{ action: 'ATTACK', aimDirection: Math.PI / 4 }] } }, 0.05);
    const parsed = JSON.parse(simulation.serialize());
    expect(parsed.enemies).toEqual(state.enemies);
    expect(parsed.projectiles).toEqual(state.projectiles);
    expect(parsed.floorState.width).toBe(TEST_ROOM.width);
  });

  test('keeps Sarge Hammer Throw as a returning campaign boomerang with its catch reward', () => {
    const { state, simulation, events } = combatHarness('sarge');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'sarge');
    player.hp = 20;
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'hammer_throw', aimDirection: 0 }] } }, 0.05);
    const hammer = Object.values(state.projectiles).find(projectile => projectile.attackKind === 'hammer_throw');
    expect(hammer).toEqual(expect.objectContaining({
      kind: 'sarges_hammer', returning: true, returnPhase: 'out', homingTarget: 'enemy',
      radius: 11, knockback: 300,
    }));
    Object.values(state.enemies).forEach(enemy => delete state.enemies[enemy.id]);
    hammer.x = player.x + 100;
    hammer.y = player.y;
    hammer.vx = 680;
    hammer.vy = 0;
    hammer.expiresTick = state.tick;
    state.pickups.hammerCatchCoin = {
      id: 'hammerCatchCoin', type: 'coin', roomId: player.roomId,
      x: player.x + 200, y: player.y, radius: 13, amount: 1, spawnTick: state.tick,
    };

    simulation.updateGame({}, 0.05);
    expect(hammer.returnPhase).toBe('back');
    expect(hammer.homingTarget).toBe('player');
    for (let tick = 0; tick < 8 && state.projectiles[hammer.id]; tick += 1) simulation.updateGame({}, 0.05);

    expect(state.projectiles[hammer.id]).toBeUndefined();
    expect(player.hp).toBe(24);
    expect(state.pickups.hammerCatchCoin.vx).toBeLessThan(0);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'SARGES_HAMMER_RETURNED',
      data: expect.objectContaining({ projectileId: hammer.id, playerId: player.id, healedAmount: 4, pickupIds: ['hammerCatchCoin'] }),
    }));
  });

  test('resolves charged Love Bomb as an authoritative AOE detonation with sparkle state', () => {
    const { state, simulation, events, random } = combatHarness('princess');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'princess', { laser: 'love_bomb_laser' });
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 80, y: player.y, health: 1000, maxHealth: 1000, moveSpeed: 0 });
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.destructibles = [{ id: 'love-pot', kind: 'pot', x: player.x + 80, y: player.y + 20, r: 12, hp: 1, maxHp: 1, broken: false }];
    random.next = () => 0;

    simulation.updateGame({ p1: { buttons: 1, actions: [{ action: 'ABILITY', abilityId: 'love_bomb_laser', aimDirection: 0, targetX: player.x + 180, targetY: player.y }] } }, 0.05);
    simulation.updateGame({ p1: { buttons: 0, aimDirection: 0, targetX: player.x + 180, targetY: player.y } }, 0.05);
    simulation.updateGame({ p1: { buttons: 0, aimDirection: 0 } }, 0.05);

    expect(enemy.health).toBeLessThan(1000);
    expect(enemy.critSparkleUntilTick).toBeGreaterThan(state.tick);
    expect(room.destructibles[0].broken).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'LOVE_BOMB_DETONATED', data: expect.objectContaining({ playerId: player.id, projectileId: expect.any(String), targetIds: expect.arrayContaining([enemy.id]) }),
    }));
  });

  test('runs Ghost Ball as the campaign-decaying cursor-driven orb rather than a one-hit projectile', () => {
    const { state, simulation, events } = combatHarness('turtle_boy');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'turtle_boy', { laser: 'ghost_ball' });
    simulation.updateGame({}, 0.05);
    const enemy = Object.values(state.enemies)[0];
    Object.assign(enemy, { x: player.x + 55, y: player.y, health: 1000, maxHealth: 1000, moveSpeed: 0 });
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.destructibles = [{ id: 'ghost-pot', kind: 'pot', x: player.x + 55, y: player.y + 10, r: 12, hp: 2, maxHp: 2, broken: false }];

    simulation.updateGame({ p1: { buttons: 1, targetX: player.x + 300, targetY: player.y, actions: [{ action: 'ABILITY', abilityId: 'ghost_ball', aimDirection: 0, targetX: player.x + 300, targetY: player.y }] } }, 0.05);
    simulation.updateGame({ p1: { buttons: 0, targetX: player.x + 300, targetY: player.y } }, 0.05);
    const ball = Object.values(state.projectiles).find(projectile => projectile.ghostBall);
    expect(ball).toEqual(expect.objectContaining({ kind: 'ghost_ball', ghostBall: true, radius: expect.any(Number), vx: expect.any(Number) }));
    const radiusBeforeContact = ball.radius;
    for (let tick = 0; tick < 3; tick += 1) simulation.updateGame({ p1: { targetX: player.x + 300, targetY: player.y, aimDirection: 0 } }, 0.05);

    expect(enemy.health).toBeLessThan(1000);
    expect(ball.radius).toBeLessThan(radiusBeforeContact);
    expect(room.destructibles[0].broken).toBe(true);
    expect(events.some(event => event.eventType === 'ENEMY_HIT' && event.data.attackKind === 'ghost_ball')).toBe(true);

    // The campaign delays laser recharge until the orb is actually gone.
    ball.radius = 8.01;
    simulation.updateGame({ p1: { targetX: player.x + 300, targetY: player.y, aimDirection: 0 } }, 0.05);
    const ghostTimer = player.moveChargeState.ghost_ball.timers[0];
    expect(state.projectiles[ball.id]).toBeUndefined();
    expect(ghostTimer - state.tick).toBeGreaterThan(40);
    expect(ghostTimer - state.tick).toBeLessThan(120);
  });

  test('runs Titan Hammer as a live authoritative summon with edge-triggered slams', () => {
    const { state, simulation, events } = combatHarness('sarge');
    const player = state.players.p1;
    applyNetworkHeroProfile(player, 'sarge', { smash: 'titan_hammer' });
    simulation.updateGame({ p1: { aimDirection: 0, actions: [{ action: 'ABILITY', abilityId: 'titan_hammer', aimDirection: 0 }] } }, 0.05);

    const hammer = Object.values(state.abilityEntities).find(entity => entity.kind === 'titan_hammer');
    expect(hammer).toEqual(expect.objectContaining({
      ownerId: player.id, damage: 70, radius: 97.5, swingsLeft: 2,
      expiresTick: state.tick + 90,
    }));
    const enemy = Object.values(state.enemies)[0];
    enemy.x = hammer.x + 20;
    enemy.y = hammer.y;
    enemy.moveSpeed = 0;
    enemy.health = 1000;
    enemy.maxHealth = 1000;
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.destructibles = [{ id: 'hammer-pot', kind: 'pot', x: hammer.x + 12, y: hammer.y, r: 12, hp: 2, maxHp: 2, broken: false }];

    simulation.updateGame({ p1: { aimDirection: 0, actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(hammer.swingsLeft).toBe(1);
    expect(hammer.swinging).toBeGreaterThan(0);
    expect(enemy.health).toBeLessThan(1000);
    expect(enemy.stunnedUntilTick).toBeGreaterThan(state.tick);
    expect(room.destructibles[0].broken).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: 'ABILITY_ENTITY_PULSED', data: expect.objectContaining({ entityId: hammer.id, abilityId: 'titan_hammer', kind: 'slam' }),
    }));

    // A second primary action inside the one-second slam cadence is discarded,
    // then the next fresh edge after the cooldown consumes the final swing.
    simulation.updateGame({ p1: { aimDirection: 0, actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(hammer.swingsLeft).toBe(1);
    for (let tick = 0; tick < 19; tick += 1) simulation.updateGame({ p1: { aimDirection: 0 } }, 0.05);
    simulation.updateGame({ p1: { aimDirection: 0, actions: [{ action: 'ATTACK', aimDirection: 0 }] } }, 0.05);
    expect(hammer.swingsLeft).toBe(0);
  });
});
