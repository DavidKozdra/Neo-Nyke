const fs = require('node:fs');
const vm = require('node:vm');
const content = require('../js/simulation/SharedEnemyContent');
const moves = require('../js/simulation/SharedMoveContent');
const scaling = require('../js/simulation/SharedEnemyScalingSystem');
const attacks = require('../js/simulation/SharedEnemyAttackSystem');
const { createCampaignEnemyBehaviors } = require('../js/simulation/SharedEnemyBehaviorSystem');
const movement = require('../js/simulation/CampaignMovementRules');
const allyApi = require('../js/simulation/SharedAllySystem');
const { createCampaignSimulation, createCampaignPlayer } = require('../js/simulation/CampaignSimulation');
const difficulty = scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard;
const tuning = { reaction: difficulty.enemyReactionMultiplier, rangedCadence: difficulty.rangedCadenceMultiplier,
  supportPower: difficulty.supportPowerMultiplier };
const charges = [
  ['charger', 'enemy_charger_primary', 'updateChargerEnemy', 430, 0.32, 4, 240],
  ['knave', 'enemy_knave_charge', 'updateKnaveEnemy', 450, 0.3, 6, 260],
  ['golem', 'enemy_golem_charge', 'updateGolemEnemy', 390, 0.34, 6, 280],
];
const bursts = [
  ['cult_mage', 'enemy_cult_nova', 'updateCultMageEnemy', 120, 1.1, 300],
  ['boss_spawner', 'enemy_spawner_shove', 'updateBossSpawnerEnemy', 200, 1.4, 760],
];
function browser(type, floor = 1) {
  const character = `enemy_${type}`;
  const target = { id: 'target', x: 300, y: 350, r: 14, hp: 10000 };
  const hits = [];
  const friend = { id: 'friend', x: 150, y: 350, hp: 100, maxHp: 400 };
  const farFriend = { id: 'far', x: 500, y: 350, hp: 100, maxHp: 400 };
  const Neo = {
    player: { character, level: 20, x: 100, y: 350, r: 14, hp: 500, maxHp: 500, vx: 0, vy: 0,
      cowardsWayTime: 0, equippedMoves: moves.getDefaultMoveLoadout(character), inv: 0 },
    floor, currentRoom: { id: 'test' }, gameElapsedTime: 0, gameMode: 'normal', MAX_FLOOR: 10,
    enemies: [target], allies: {},
    getActivePlayerSlots: () => [friend, farFriend].map(entity => ({ getEntity: () => entity })),
    getDifficultyDef: () => difficulty, getEnemyDifficultyTuning: () => tuning,
    getProgressionDepth: () => floor, getItemStats: () => ({}), getAttackSpeedValue: () => 1,
    spendSkillCharge: jest.fn(() => true), angleToMouse: () => 0, rng: () => 0.5,
    ringBurst: jest.fn(), scaleEnemyLaserDamage: amount => scaling.scaleCampaignEnemyLaserDamage(amount, difficulty),
    MOVE_DEFS: Object.fromEntries(Object.entries(moves.MOVE_SLOT_KEYS).flatMap(([slot, keys]) => keys.map(key => [key, { slot }]))),
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/game/combat.js'), 'utf8'), {
    Neo, NeoNyke: { content, simulation: { ...attacks, ...scaling, createCampaignEnemyBehaviors } }, window: {},
  });
  Neo.hitEnemy = (target, damage, angle, knockback) => hits.push({ target: target.id, damage, angle, knockback });
  const cast = key => Neo[{ melee: 'tryMelee', laser: 'tryLaser', smash: 'trySmash', dash: 'tryDash' }[moves.getMoveSlot(key)]]();
  const tick = dt => {
    movement.applyCampaignPlayerVelocity(Neo.player, {}, dt, { speed: 0 });
    Neo.player.x += Neo.player.vx * dt; Neo.player.y += Neo.player.vy * dt;
    Neo.updateEnemyNativePrimary(dt);
  };
  return { Neo, target, friend, farFriend, hits, cast, tick };
}
function actorFor(game) {
  return attacks.getPlayableEnemyAttackActor(game.Neo.player, { difficulty, progressionDepth: game.Neo.floor });
}
function npc(game, update, distance) {
  const actor = { ...actorFor(game), windup: 0, beamTime: 0, attackCd: 0, npcSignatureCd: 3600,
    novaCd: 0, shoveCd: 0, supportCd: 0, bossSpawnTimer: 3600 };
  const target = { ...game.target, x: actor.x + distance };
  const hits = [], barriers = [], heals = [];
  const friends = [game.friend, game.farFriend].map(friend => ({ ...friend, max: friend.maxHp }));
  const controller = createCampaignEnemyBehaviors({
    getPlayer: () => target, getPlayers: () => [target], getAllies: () => friends,
    getTuning: () => tuning, getFloor: () => game.Neo.floor, random: () => 0.5,
    damagePlayer: (_actor, target, damage, angle, knockback) => hits.push({ target: target.id, damage, angle, knockback }),
    blastRadius: (_actor, x, y, radius, damage, knockback) => hits.push({ x, y, radius, damage, knockback }),
    grantBarrier: (actor, target, amount) => barriers.push({ self: actor === target, id: target.id, amount }),
    healEnemy: (_actor, target, amount) => { heals.push({ id: target.id, amount }); return amount; },
  });
  const tick = dt => { controller[update](actor, dt); actor.x += actor.vx * dt; actor.y += actor.vy * dt; };
  return { actor, target, hits, barriers, heals, tick };
}

describe('native enemy mobility and support', () => {
  test.each(charges)('%s charge preserves AI windup, travel, collision, damage and cooldown', (type, key, update, speed, duration, bonus, knockback) => {
    const game = browser(type);
    const enemy = npc(game, update, 220);
    // Knave needs a distant aim point to choose its charge rather than its slash.
    game.target.x = 320;
    enemy.tick(0);
    game.cast(key);
    const timing = attacks.getEnemyNativeActionTiming(key, actorFor(game), tuning, 1);
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledWith(moves.getMoveSlot(key), timing.cooldown);
    expect(game.Neo.player.enemyNativePrimary.actor.windup).toBeCloseTo(enemy.actor.windup);
    let nativeTravel = 0, npcTravel = 0;
    for (let i = 0; i < 120; i++) {
      // Put the target within the charge lane after aiming, matching a player moving into it.
      if (i === 40) { game.target.x = 200; enemy.target.x = 200; }
      const wasDashing = game.Neo.player.enemyNativePrimary?.actor.dashTime > 0;
      game.tick(0.01);
      enemy.tick(0.01);
      if (wasDashing) nativeTravel += speed * 0.01;
      if (enemy.actor.vx === speed) npcTravel += speed * 0.01;
      if (wasDashing) expect(game.Neo.player.inv).toBe(0);
    }
    expect(nativeTravel).toBeCloseTo(speed * duration, 0);
    expect(game.hits).toHaveLength(1);
    expect(game.hits[0]).toEqual(expect.objectContaining({ damage: actorFor(game).dmg + bonus, knockback }));
    expect(enemy.hits[0]).toEqual(game.hits[0]);
    expect(game.Neo.player.enemyNativePrimary).toBeNull();
    expect(npcTravel).toBeGreaterThanOrEqual(nativeTravel);
  });

  test.each(bursts)('%s burst uses the actual AI radius, damage, knockback and delay', (type, key, update, radius, scale, knockback) => {
    const game = browser(type);
    game.target.x = 200;
    game.Neo.enemies.push({ id: 'outside', x: 100 + radius + 30, y: 350, r: 14, hp: 10000 });
    const enemy = npc(game, update, 100);
    enemy.tick(0);
    game.cast(key);
    const timing = attacks.getEnemyNativeActionTiming(key, actorFor(game), tuning, 1);
    game.Neo.updateEnemyNativePrimary(timing.windup - 0.001);
    expect(game.hits).toHaveLength(0);
    game.Neo.updateEnemyNativePrimary(0.002);
    enemy.tick(timing.windup + 0.001);
    expect(enemy.hits[0]).toEqual(expect.objectContaining({ radius, damage: Math.round(actorFor(game).dmg * scale), knockback }));
    expect(game.hits).toEqual([{ target: 'target', damage: enemy.hits[0].damage, knockback, angle: 0 }]);
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledWith(moves.getMoveSlot(key), timing.cooldown);
  });

  test.each([1, 4])('healing and barriers match NPC support values on floor %i', floor => {
    for (const [type, key, update] of [['healer', 'enemy_healer_pulse', 'updateHealerEnemy'], ['shield_unit', 'enemy_shield_pulse', 'updateShieldUnitEnemy']]) {
      const game = browser(type, floor);
      const enemy = npc(game, update, 600);
      enemy.tick(0);
      game.cast(key);
      if (type === 'healer') {
        expect(game.friend.hp - 100).toBe(enemy.heals[0].amount);
        expect(game.farFriend.hp).toBe(100);
        expect(game.Neo.player.hp).toBe(500); // NPC healer pulses heal other allies, not themselves.
      } else {
        expect(game.friend.overhealBarrier).toBe(enemy.barriers.find(barrier => !barrier.self).amount);
        expect(game.Neo.player.overhealBarrier).toBe(enemy.barriers.find(barrier => barrier.self).amount);
        expect(game.farFriend.overhealBarrier).toBeUndefined();
      }
      game.cast(key);
      expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
      expect(game.Neo.spendSkillCharge).toHaveBeenCalledWith('smash', enemy.actor.supportCd);
    }
  });

  test('charges share the primary cooldown and shield support respects the damage lockout', () => {
    const game = browser('knave');
    game.cast('enemy_knave_charge');
    game.Neo.tryMelee();
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
    const shield = browser('shield_unit');
    shield.Neo.player.enemyShieldLockout = 1.1;
    shield.cast('enemy_shield_pulse');
    expect(shield.Neo.spendSkillCharge).not.toHaveBeenCalled();
    shield.Neo.updateEnemyNativePrimary(1.11);
    shield.cast('enemy_shield_pulse');
    expect(shield.Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
  });

  test('shield recharge after damage becomes ready on the same tick as the NPC', () => {
    const game = browser('shield_unit');
    const enemy = npc(game, 'updateShieldUnitEnemy', 600);
    game.Neo.player.enemyShieldLockout = enemy.actor._shieldHitLockout = 1.1;
    let playerReady, enemyReady;
    for (let tick = 0; tick < 40; tick++) {
      game.Neo.updateEnemyNativePrimary(0.05);
      enemy.tick(0.05);
      game.cast('enemy_shield_pulse');
      if (playerReady == null && game.Neo.spendSkillCharge.mock.calls.length) playerReady = tick;
      if (enemyReady == null && enemy.barriers.length) enemyReady = tick;
    }
    expect(playerReady).toBeGreaterThan(22);
    expect(playerReady).toBe(enemyReady);
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
  });

  test.each([...charges, ...bursts, ['healer', 'enemy_healer_pulse'], ['shield_unit', 'enemy_shield_pulse']])('%s %s executes in the real authority', (type, key) => {
    const simulation = createCampaignSimulation({ matchId: 'native-support', matchSeed: 'native-support', floorSeed: 'native-support|1', matchRules: { difficulty } });
    const state = simulation.state;
    const p = state.players.p1 = createCampaignPlayer({ id: 'p1', characterKey: `enemy_${type}`, roomId: state.floorState.currentRoomId });
    const friend = state.players.p2 = createCampaignPlayer({ id: 'p2', characterKey: 'thorn_knight', roomId: p.roomId });
    simulation.updateGame({ p1: {}, p2: {} }, 0.05);
    Object.values(state.enemies).forEach(enemy => { enemy.dead = true; enemy.health = 0; });
    const room = state.floorState.layout.rooms.find(room => room.id === p.roomId);
    room.structures = []; room.destructibles = []; room.hazards = [];
    Object.assign(p, { x: 100, y: 350, vx: 0, vy: 0, level: 20 });
    Object.assign(friend, { x: 150, y: 400, hp: 50 });
    const target = state.enemies.target = { id: 'target', type: 'hunter', x: 200, y: 350, radius: 14,
      health: 100000, maxHealth: 100000, roomId: p.roomId, contactDamage: 0, level: 1,
      spawnTick: state.tick, stunnedUntilTick: state.tick + 1000, spawnT: 1000, vx: 0, vy: 0 };
    const slot = moves.getMoveSlot(key);
    const action = { action: slot === 'melee' ? 'ATTACK' : slot === 'dash' ? 'DASH' : 'ABILITY', abilityId: key, aimDirection: 0 };
    simulation.updateGame({ p1: { aimDirection: 0, actions: [action] }, p2: {} }, 0.05);
    const support = slot === 'smash' && ['healer', 'shield_unit'].includes(type);
    if (support) {
      if (type === 'healer') expect(friend.hp).toBeGreaterThan(50);
      else { expect(p.barrier).toBeGreaterThan(0); expect(friend.barrier).toBeGreaterThan(0); }
    } else {
      expect(p.enemyNativePrimary).toBeTruthy();
      for (let i = 0; i < 40; i++) simulation.updateGame({ p1: { aimDirection: 0 }, p2: {} }, 0.05);
      expect(target.health).toBeLessThan(100000);
      expect(p.enemyNativePrimary).toBeNull();
      if (slot === 'dash' || type === 'charger') expect(p.x).toBeGreaterThan(190);
    }
  });

  test('a shielded ally absorbs damage and its barrier decays at the enemy rate', () => {
    const owner = { id: 'owner', maxHp: 100, recruitedAllyIds: [] };
    const state = { allies: {}, players: { owner } };
    const ally = allyApi.createSourcedAlly(state, owner, { id: 'ally', sourceKind: 'move', sourceKey: 'test', archetypeKey: 'brawler', duration: 30 });
    ally.barrier = 30; ally.barrierAge = 0;
    const hp = ally.health;
    allyApi.damageAlly(state, ally.id, 20);
    expect(ally.health).toBe(hp);
    expect(ally.barrier).toBe(10);
    allyApi.advanceAllies(state, 5, state.players);
    expect(ally.barrier).toBe(10);
    allyApi.advanceAllies(state, 0.25, state.players);
    expect(ally.barrier).toBe(5);
    allyApi.damageAlly(state, ally.id, 10);
    expect(ally.health).toBe(hp - 5);
  });
});
