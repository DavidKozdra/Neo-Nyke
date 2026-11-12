const fs = require('node:fs');
const vm = require('node:vm');
const content = require('../js/simulation/SharedEnemyContent');
const moves = require('../js/simulation/SharedMoveContent');
const scaling = require('../js/simulation/SharedEnemyScalingSystem');
const attacks = require('../js/simulation/SharedEnemyAttackSystem');
const behavior = require('../js/simulation/SharedEnemyBehaviorSystem');
const hazards = require('../js/simulation/SharedHazardSystem');
const movement = require('../js/simulation/CampaignMovementRules');
const { NetworkGameView, deriveAbilityPresentation } = require('../js/rendering/NetworkGameView');
const { createCampaignSimulation, createCampaignPlayer } = require('../js/simulation/CampaignSimulation');

const difficulty = scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard;
const cases = [['hunter', 'hunter_trap', 'smash'], ['shield_unit', 'shield_guard', 'dash'], ['charger', 'charger_rush', 'dash']];

function browser(type, level) {
  const hits = [], statuses = [];
  const player = { id: 'p1', character: `enemy_${type}`, level, x: 200, y: 350, hp: 500, maxHp: 500,
    vx: 0, vy: 0, inv: 0, cowardsWayTime: 0, equippedMoves: moves.getDefaultMoveLoadout(`enemy_${type}`) };
  const target = { id: 'target', hp: 10000, x: 500, y: 350, r: 14, vx: 40, vy: -10 };
  const Neo = { player, enemies: [target], hazards: [], destructibles: [], structures: [], cooldowns: {},
    currentRoom: { id: 'room' }, floor: 1, gameMode: 'normal', gameElapsedTime: 0, MAX_FLOOR: 10,
    ROOM_W: 900, ROOM_H: 700, WALL: 28, simulationTick: 1, mouse: { worldX: target.x, worldY: target.y },
    getProgressionDepth: () => 1, getDifficultyDef: () => difficulty,
    getEnemyDifficultyTuning: () => ({ reaction: difficulty.enemyReactionMultiplier, rangedCadence: difficulty.rangedCadenceMultiplier }),
    getItemStats: () => ({ damageMultiplier: 100, aoeRadiusMultiplier: 100 }), getAttackSpeedValue: () => 100,
    spendSkillCharge: jest.fn(() => true), angleToMouse: () => 0, ringBurst: jest.fn(),
    spawnParticle: jest.fn(), isBlocked: () => false, nextRandom: () => 0.5,
    syncCurrentRoomState: jest.fn(),
    dist: (x, y, a, b) => Math.hypot(x - a, y - b), angleBetween: (a, b) => Math.atan2(b.y - a.y, b.x - a.x),
    MOVE_DEFS: Object.fromEntries(Object.entries(moves.MOVE_SLOT_KEYS).flatMap(([slot, keys]) => keys.map(key => [key, { slot }]))),
  };
  const context = vm.createContext({ Neo, window: {}, NeoNyke: { content, simulation: { ...scaling, ...attacks, ...behavior, ...hazards } } });
  vm.runInContext(fs.readFileSync(require.resolve('../js/game/combat.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../js/game/world.js'), 'utf8'), context);
  Neo.hitEnemy = (victim, damage, angle, knockback, _color, options) => hits.push({ id: victim.id, damage, angle, knockback, options });
  Neo.applyStatus = (victim, ...effect) => statuses.push({ id: victim.id, effect });
  Neo.ringBurst = jest.fn();
  const cast = slot => Neo[slot === 'smash' ? 'trySmash' : slot === 'laser' ? 'tryLaser' : 'tryDash'](0, 1);
  const tick = dt => { Neo.updateEnemyProjectileSignature(dt); Neo.updateEnemyNativePrimary(dt); };
  return { Neo, player, target, hits, statuses, cast, tick, context };
}

function authority(type, level = 20) {
  const events = [];
  const simulation = createCampaignSimulation({ matchSeed: 'signature-utilities', floorSeed: 'signature-utilities',
    matchRules: { difficulty }, emitEvent: (type, data) => events.push({ type, data }) });
  const state = simulation.state;
  const player = state.players.p1 = createCampaignPlayer({ id: 'p1', characterKey: `enemy_${type}`, roomId: state.floorState.currentRoomId });
  player.level = level;
  simulation.updateGame({}, 0.05);
  Object.values(state.enemies).forEach(enemy => { enemy.dead = true; enemy.health = 0; });
  const room = state.floorState.layout.rooms.find(room => room.id === player.roomId);
  room.structures = []; room.destructibles = []; room.hazards = [];
  Object.assign(player, { x: 200, y: 350, vx: 0, vy: 0 });
  const target = state.enemies.target = { id: 'target', type: 'hunter', x: 500, y: 350, radius: 14,
    maxHealth: 10000, health: 10000, roomId: player.roomId, moveSpeed: 0, contactDamage: 0,
    spawnTick: state.tick, spawnT: 1000, stunnedUntilTick: state.tick + 1000, level: 1, vx: 0, vy: 0 };
  const cast = (moveKey, slot) => simulation.updateGame({ p1: { aimDirection: 0, actions: [{
    action: slot === 'dash' ? 'DASH' : 'ABILITY', abilityId: moveKey, aimDirection: 0, targetX: 500, targetY: 350,
    dashMoveX: 0, dashMoveY: 1,
  }] } }, 0.05);
  const tick = () => simulation.updateGame({ p1: { aimDirection: 0, moveX: 0, moveY: 1 } }, 0.05);
  return { simulation, state, player, room, target, events, cast, tick };
}

describe('native trap, guard and signature rush', () => {
  test.each(cases)('%s %s matches the NPC signature controller at levels 14 and 20', (type, key, slot) => {
    for (const level of [14, 20]) {
      const game = browser(type, level);
      const actor = attacks.getPlayableEnemyAttackActor(game.player, { difficulty });
      const npcHazards = [];
      const npc = { ...actor, npcSignatureMove: key, npcSignatureWindup: 0.48, vx: 100, vy: -30 };
      const controller = behavior.createCampaignEnemyBehaviors({ getPlayer: () => game.target,
        getTuning: game.Neo.getEnemyDifficultyTuning, spawnHazard: (_actor, hazard) => npcHazards.push(hazard),
        grantBarrier: (actor, _target, amount) => { actor.barrier = amount; } });
      game.player.vx = 100; game.player.vy = -30;
      game.cast(slot);
      expect(game.player.enemySignatureCast).toBeTruthy();
      const timing = attacks.getEnemySignatureTiming(key, level, game.Neo.getEnemyDifficultyTuning());
      expect(game.Neo.spendSkillCharge).toHaveBeenCalledWith(slot, timing.cooldown);
      expect(game.Neo.hazards).toHaveLength(0);
      expect(game.player.overhealBarrier || 0).toBe(0);
      controller.updateNpcEnemySignatureMoves(npc, 0.47); game.tick(0.47);
      expect(game.player.enemySignatureCast).toBeTruthy();
      expect(game.player.vx).toBeCloseTo(npc.vx);
      controller.updateNpcEnemySignatureMoves(npc, 0.02); game.tick(0.02);
      expect(game.player.enemySignatureCast).toBeNull();
      expect(game.player.inv).toBe(0);
      if (key === 'hunter_trap') {
        expect(game.Neo.hazards).toHaveLength(1);
        const { enemy, ...expected } = npcHazards[0];
        expect(game.Neo.hazards[0]).toEqual(expect.objectContaining(expected));
        expect(game.Neo.hazards[0]).toEqual(expect.objectContaining({ kind: 'red_spikes', x: 512.8, y: 346.8,
          r: level >= 20 ? 46 : 38, armTime: 0.62, ttl: 2.2, damage: Math.round(actor.dmg * 1.15),
          statusStacks: level >= 20 ? 3 : 2, statusDuration: 4.5, nativeEnemyAttack: true, enemy: false }));
      } else if (key === 'shield_guard') {
        expect(game.player.overhealBarrier).toBe(npc.barrier);
        expect(npc.barrier).toBe(Math.round(actor.max * (level >= 20 ? 0.34 : 0.24)));
        expect(game.player.signatureGuardTime).toBe(npc.signatureGuardTime);
        expect(game.player.blockTimer || 0).toBe(0);
        expect(game.Neo.getDisplayDamage(key, 'move')).toBeNull();
      } else {
        const native = game.player.enemyNativePrimary.actor;
        expect(native.dashTime).toBe(npc.dashTime);
        expect(native.dashTime).toBe(level >= 20 ? 0.48 : 0.4);
        expect(native.dashAngle).toBe(0);
        expect(game.hits).toHaveLength(0);
        movement.applyCampaignPlayerVelocity(game.player, { moveX: 0, moveY: 1 }, 0.05, { speed: 10000 });
        expect([game.player.vx, game.player.vy]).toEqual([820, 0]);
        game.target.x = game.player.x - 5; // Collision is not restricted to the live cursor arc.
        game.tick(0.01); game.tick(0.01);
        expect(game.hits).toHaveLength(1);
        expect(game.hits[0]).toEqual(expect.objectContaining({ damage: Math.round(actor.dmg * 1.45), knockback: 520,
          options: expect.objectContaining({ nativeEnemyAttack: true, rawDamage: true, canCrit: false }) }));
        game.tick(0.5);
        expect(game.player.enemyNativePrimary).toBeNull();
      }
    }
  });

  test('traps follow the aimed opponent through windup and lead its release position', () => {
    const game = browser('hunter', 20);
    game.cast('smash');
    game.target.x = 600; game.target.vx = -50;
    game.tick(0.49);
    expect(game.Neo.hazards[0].x).toBe(584);
    const empty = browser('hunter', 14);
    empty.Neo.mouse = { worldX: 380, worldY: 220 };
    empty.cast('smash'); empty.tick(0.49);
    expect(empty.Neo.hazards[0]).toEqual(expect.objectContaining({ x: 380, y: 220 }));
  });

  test('signature rush movement and contact damage match the actual browser Charger', () => {
    for (const level of [14, 20]) {
      const game = browser('charger', level), npcGame = browser('charger', level);
      game.cast('dash'); game.tick(0.49);
      const actor = game.player.enemyNativePrimary.actor;
      const npc = { ...actor, nativeSignatureStarted: false, npcSignatureCd: 10 };
      const npcHits = [];
      vm.runInContext(fs.readFileSync(require.resolve('../js/game/enemies.js'), 'utf8'), npcGame.context);
      npcGame.Neo.player = npcGame.target;
      npcGame.Neo.damagePlayer = (damage, angle, knockback) => npcHits.push({ damage, angle, knockback });
      game.target.x = npcGame.target.x = actor.x - 5;
      for (let frame = 0; frame < 55; frame++) {
        if (npc.dashTime > 0) npcGame.Neo.updateChargerEnemy(npc, 0.01);
        game.tick(0.01);
        expect(game.player.vx).toBeCloseTo(npc.vx);
        expect(game.player.vy).toBeCloseTo(npc.vy);
        expect(actor.dashTime).toBeCloseTo(npc.dashTime);
      }
      expect(game.hits.map(({ damage, angle, knockback }) => ({ damage, angle, knockback }))).toEqual(npcHits);
      expect(npcHits).toHaveLength(1);
    }
  });

  test('the real campaign spike hits all bodies once when armed, applies bleed, and expires', () => {
    const game = browser('hunter', 20);
    game.cast('smash'); game.tick(0.49);
    const spike = game.Neo.hazards[0];
    game.target.x = spike.x; game.target.y = spike.y;
    game.Neo.enemies.push({ id: 'second', x: spike.x + 40, y: spike.y, r: 14, hp: 10000 });
    game.Neo.updateWorldProps(0.61);
    expect(game.hits).toHaveLength(0);
    game.Neo.updateWorldProps(0.02);
    expect(game.hits.map(hit => hit.id)).toEqual(['target', 'second']);
    expect(game.hits[0].damage).toBe(spike.damage);
    expect(game.hits[0].options).toEqual(expect.objectContaining({ nativeEnemyAttack: true, rawDamage: true, canCrit: false }));
    expect(game.statuses).toHaveLength(2);
    expect(game.statuses[0].effect.slice(0, 3)).toEqual(['bleed', 3, 4.5]);
    game.Neo.updateWorldProps(0.5);
    expect(game.hits).toHaveLength(2);
    game.Neo.updateWorldProps(1.1);
    expect(game.Neo.hazards).toHaveLength(0);
  });

  test('a missed spike does not become a proximity mine', () => {
    const game = browser('hunter', 14);
    game.cast('smash'); game.tick(0.49);
    game.target.x = 800;
    game.Neo.updateWorldProps(0.63);
    game.target.x = game.Neo.hazards[0].x;
    game.Neo.simulationTick++;
    game.Neo.updateWorldProps(0.1);
    expect(game.hits).toHaveLength(0);
  });

  test('guard refreshes an existing larger barrier without stacking or adding invulnerability', () => {
    const game = browser('shield_unit', 20);
    game.player.overhealBarrier = 10000; game.player.overhealBarrierAge = 5;
    game.cast('dash'); game.tick(0.49);
    expect(game.player.overhealBarrier).toBe(10000);
    expect(game.player.overhealBarrierAge).toBe(0);
    expect(game.player.inv).toBe(0);
    expect(game.player.blockTimer || 0).toBe(0);
    game.cast('laser');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
    expect(game.Neo.cooldowns.laser.timers).toEqual(game.Neo.cooldowns.dash.timers);
  });

  test('signature windups brake movement, pause on stun, and cancel on room changes', () => {
    const game = browser('hunter', 20);
    game.player.vx = 100;
    game.cast('smash');
    movement.applyCampaignPlayerVelocity(game.player, { moveX: 0, moveY: 1 }, 0.1, { speed: 10000 });
    expect([game.player.vx, game.player.vy]).toEqual([100, 0]);
    game.tick(0.1); expect(game.player.vx).toBe(76);
    game.player.stun = 1; game.tick(1);
    expect(game.Neo.hazards).toHaveLength(0);
    game.player.stun = 0; game.Neo.currentRoom.id = 'next'; game.tick(1);
    expect(game.player.enemySignatureCast).toBeNull();
    expect(game.Neo.hazards).toHaveLength(0);
  });

  test.each(cases)('%s %s runs through the real authority without hero side effects', (type, key, slot) => {
    for (const level of [14, 20]) {
      const game = authority(type, level);
      game.cast(key, slot);
      const actor = game.player.enemySignatureCast.actor;
      for (let frame = 0; game.player.enemySignatureCast && frame < 20; frame++) game.tick();
      expect(game.player.enemySignatureCast).toBeNull();
      expect(Number(game.player.invulnerableUntilTick || 0)).toBeLessThanOrEqual(game.state.tick);
      expect(Object.values(game.state.abilityEntities || {})).toHaveLength(0);
      if (key === 'hunter_trap') {
        const spike = game.room.hazards[0];
        expect(spike).toEqual(expect.objectContaining({ kind: 'red_spikes', damage: Math.round(actor.dmg * 1.15),
          nativeEnemyAttack: true, enemy: false, ownerId: game.player.id, r: level >= 20 ? 46 : 38 }));
        game.state.enemies.second = { ...game.target, id: 'second', x: 530, vx: 0 };
        for (let frame = 0; frame < 15; frame++) game.tick();
        const direct = game.events.filter(event => event.type === 'ENEMY_HIT' && event.data.attackKind === key);
        expect(direct).toHaveLength(2);
        expect(direct.every(event => event.data.damage === spike.damage)).toBe(true);
        expect(game.target.statuses.bleed.stacks).toBeGreaterThan(0);
        for (let frame = 0; frame < 40; frame++) game.tick();
        expect(game.room.hazards).toHaveLength(0);
      } else if (key === 'shield_guard') {
        expect(game.player.barrier).toBe(Math.round(actor.max * (level >= 20 ? 0.34 : 0.24)));
        expect(game.player.blockUntilTick || 0).toBe(0);
        expect(game.player.moveChargeState.shield_throw.charges).toBe(0);
        for (let frame = 0; frame < 105; frame++) game.tick();
        expect(game.player.barrier).toBeLessThan(Math.round(actor.max * (level >= 20 ? 0.34 : 0.24)));
      } else {
        expect(game.player.enemyNativePrimary.actor.dashTime).toBe(level >= 20 ? 0.48 : 0.4);
        game.target.x = game.player.x + 15;
        game.target.y = game.player.y;
        game.tick();
        expect(game.player.vx).toBe(820); expect(game.player.vy).toBe(0);
        for (let frame = 0; frame < 15; frame++) game.tick();
        const direct = game.events.filter(event => event.type === 'ENEMY_HIT' && event.data.attackKind === key);
        expect(direct).toHaveLength(1);
        expect(direct[0].data.damage).toBe(Math.round(actor.dmg * 1.45));
        expect(game.player.enemyNativePrimary).toBeNull();
      }
    }
  });

  test('authority spikes also miss permanently when nobody is present at the strike', () => {
    const game = authority('hunter');
    game.cast('hunter_trap', 'smash');
    while (game.player.enemySignatureCast) game.tick();
    game.target.x = 800;
    for (let frame = 0; frame < 15; frame++) game.tick();
    game.target.x = game.room.hazards[0].x;
    game.tick();
    expect(game.target.health).toBe(10000);
  });

  test.each([false, true])('multiplayer sends trap coordinates with prediction correlation=%s', combatPredictionCorrelation => {
    const sendAbility = jest.fn();
    const view = new NetworkGameView({ session: { combatPredictionCorrelation,
      snapshot: () => ({ status: 'running', playerId: 'p1' }), sendAbility }, neo: { mouse: { worldX: 510, worldY: 390 } } });
    view.active = true;
    view.localPredictedPlayer = { id: 'p1', characterKey: 'enemy_hunter', x: 200, y: 350,
      equippedMoves: moves.getDefaultMoveLoadout('enemy_hunter') };
    view.currentSample = { tick: 10, state: { players: { p1: view.localPredictedPlayer } } };
    view._useSlot('smash');
    expect(sendAbility).toHaveBeenCalledWith('hunter_trap', expect.any(Number), expect.objectContaining({ targetX: 510, targetY: 390 }));
    expect(deriveAbilityPresentation({ abilityId: 'charger_rush', nativeEnemySignature: true, mode: 'charge' }).kind).toBe('charge');
  });
});
