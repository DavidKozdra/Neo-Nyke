const fs = require('node:fs');
const vm = require('node:vm');
const content = require('../js/simulation/SharedEnemyContent');
const moves = require('../js/simulation/SharedMoveContent');
const scaling = require('../js/simulation/SharedEnemyScalingSystem');
const attacks = require('../js/simulation/SharedEnemyAttackSystem');
const behavior = require('../js/simulation/SharedEnemyBehaviorSystem');
const movement = require('../js/simulation/CampaignMovementRules');
const { NetworkGameView } = require('../js/rendering/NetworkGameView');
const { createCampaignPlayer, createCampaignSimulation } = require('../js/simulation/CampaignSimulation');
const { applyNetworkHeroProfile } = require('../js/simulation/NetworkCombatSystem');

const difficulty = scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard;
const cases = [
  ['enemy_bulk_golem_primary', 'melee', 500],
  ['enemy_bulk_charge', 'laser', 150],
  ['enemy_bulk_nova', 'smash', 100],
  ['enemy_bulk_leap', 'dash', 300],
];

function fixture(level = 1, distance = 500, npc = false) {
  const hits = [], shots = [];
  const player = { character: 'enemy_bulk_golem', level, x: 200, y: 350, r: 58,
    hp: 1280, maxHp: 1280, vx: 0, vy: 0, inv: 0, cowardsWayTime: 0,
    equippedMoves: moves.getDefaultMoveLoadout('enemy_bulk_golem') };
  const target = { id: 'target', x: 200 + distance, y: 350, r: 14, hp: 100000 };
  const Neo = { player: npc ? target : player, floor: 1, currentRoom: { id: 'room' }, gameMode: 'normal',
    gameElapsedTime: 0, MAX_FLOOR: 10, WALL: 28, ROOM_W: 900, ROOM_H: 700, hazards: [],
    enemies: npc ? [] : [target], cooldowns: {}, mouse: { worldX: target.x, worldY: target.y },
    getProgressionDepth: () => 1, getDifficultyDef: () => difficulty,
    getEnemyDifficultyTuning: () => ({ reaction: difficulty.enemyReactionMultiplier, rangedCadence: difficulty.rangedCadenceMultiplier }),
    nextRandom: () => 0.25, rand: (max, min) => min + (max - min) * 0.25, angleToMouse: () => 0,
    dist: (x, y, a, b) => Math.hypot(x - a, y - b), angleBetween: (a, b) => Math.atan2(b.y - a.y, b.x - a.x),
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)), isBlocked: () => false,
    spendSkillCharge: jest.fn(() => true), getItemStats: () => ({ globalDamageMultiplier: 100 }), getAttackSpeedValue: () => 100,
    ringBurst: jest.fn(), spawnParticle: jest.fn(), spawnProjectile: shot => shots.push(shot),
    MOVE_DEFS: Object.fromEntries(Object.entries(moves.MOVE_SLOT_KEYS).flatMap(([slot, keys]) => keys.map(key => [key, { slot }]))),
  };
  const context = vm.createContext({ Neo, window: {}, NeoNyke: { content, simulation: { ...scaling, ...attacks, ...behavior } } });
  vm.runInContext(fs.readFileSync(require.resolve('../js/game/combat.js'), 'utf8'), context);
  if (npc) vm.runInContext(fs.readFileSync(require.resolve('../js/game/enemies.js'), 'utf8'), context);
  Neo.damagePlayer = (damage, angle, knockback) => hits.push({ damage, angle, knockback });
  Neo.hitEnemy = (_victim, damage, angle, knockback, _color, options) => {
    expect(options).toEqual(expect.objectContaining({ nativeEnemyAttack: true, rawDamage: true, canCrit: false }));
    hits.push({ damage, angle, knockback });
  };
  Neo.blastRadius = (x, y, radius, damage, _color, _enemy, knockback) => {
    if (Math.hypot(target.x - x, target.y - y) <= radius + target.r) hits.push({ damage, angle: Math.atan2(target.y - y, target.x - x), knockback });
  };
  const actor = attacks.getPlayableEnemyAttackActor(player, { difficulty });
  Object.assign(actor, { windup: 0, spitWindup: 0, dashTime: 0, attackCd: 0, aoeTime: 3600, jumpCd: 3600, bulkNovaLineShown: true });
  const cast = slot => {
    if (npc) {
      if (slot === 'smash') { actor.aoeTime = 0; actor.attackCd = 9; }
      if (slot === 'dash') { actor.jumpCd = 0; actor.attackCd = 9; }
      Neo.updateBulkGolemBoss(actor, 0);
    } else Neo[{ melee: 'tryMelee', laser: 'tryLaser', smash: 'trySmash', dash: 'tryDash' }[slot]]();
  };
  const tick = dt => {
    if (npc) {
      actor.attackCd = Math.max(0, actor.attackCd - dt * actor.enemyLevelAttackSpeedMultiplier);
      if (actor.bulkJumpTime > 0 || actor.windup > 0 || actor.spitWindup > 0 || actor.dashTime > 0) Neo.updateBulkGolemBoss(actor, dt);
    } else Neo.updateEnemyNativePrimary(dt);
  };
  return { Neo, player, target, actor, hits, shots, cast, tick };
}

describe('Bulk Golem native attacks', () => {
  test.each([false, true])('multiplayer sends the cursor landing aim with correlation=%s', combatPredictionCorrelation => {
    const sendDash = jest.fn();
    const view = new NetworkGameView({ session: { combatPredictionCorrelation,
      snapshot: () => ({ status: 'running', playerId: 'p1' }), sendDash },
      neo: { mouse: { worldX: 510, worldY: 390 } } });
    view.active = true;
    view.localPredictedPlayer = { id: 'p1', characterKey: 'enemy_bulk_golem', x: 200, y: 350, radius: 58,
      equippedMoves: moves.getDefaultMoveLoadout('enemy_bulk_golem') };
    view.currentSample = { tick: 10, state: { floorState: { width: 900, height: 700, wallThickness: 28 },
      players: { p1: view.localPredictedPlayer } } };
    view._useSlot('dash');
    expect(sendDash).toHaveBeenCalledWith('enemy_bulk_leap', expect.any(Number), expect.objectContaining({ targetX: 510, targetY: 390 }));
    expect(view.localPredictedPlayer.x).toBe(200); // No invented blink before the authority's flight.
  });

  test.each(cases)('%s matches the actual browser NPC at levels 1, 10, 25 and 40', (key, slot, distance) => {
    for (const level of [1, 10, 25, 40]) {
      const npc = fixture(level, distance, true), game = fixture(level, distance);
      npc.cast(slot); game.cast(slot);
      const actor = game.player.enemyNativePrimary.actor;
      if (slot === 'dash') {
        expect(actor.bulkJumpTargetX).toBe(npc.actor.bulkJumpTargetX);
        expect(actor.bulkJumpTargetY).toBe(npc.actor.bulkJumpTargetY);
        npc.target.x = game.target.x = actor.bulkJumpTargetX + 25;
        npc.target.y = game.target.y = actor.bulkJumpTargetY;
      } else if (slot !== 'smash') {
        expect(game.Neo.spendSkillCharge).toHaveBeenCalledWith(slot, npc.actor.attackCd / npc.actor.enemyLevelAttackSpeedMultiplier);
      }
      let maxHeight = 0;
      for (let frame = 0; frame < 400; frame++) {
        if (slot === 'laser' && frame === 65) npc.target.x = game.target.x = 270;
        npc.tick(0.01); game.tick(0.01);
        maxHeight = Math.max(maxHeight, Number(game.player.jumpZ || 0));
        if (slot === 'dash') {
          expect(game.player.x).toBeCloseTo(npc.actor.x, 10);
          expect(game.player.y).toBeCloseTo(npc.actor.y, 10);
          expect(game.player.jumpZ).toBeCloseTo(npc.actor.jumpZ, 10);
        }
      }
      expect(game.hits).toEqual(npc.hits);
      expect(game.shots).toHaveLength(npc.shots.length);
      npc.shots.forEach((shot, index) => {
        const { enemy, owner, ...descriptor } = shot;
        expect(game.shots[index]).toEqual(expect.objectContaining(descriptor));
        expect(game.shots[index].nativeEnemyAttack).toBe(true);
      });
      if (slot === 'melee') { expect(game.shots).toHaveLength(1); expect(game.shots[0].knockback).toBe(360); }
      else expect(game.hits).toHaveLength(1);
      if (slot === 'laser') expect(game.hits[0].knockback).toBe(840);
      if (slot === 'smash') expect(game.hits[0].knockback).toBe(600);
      if (slot === 'dash') {
        expect(maxHeight).toBeCloseTo(92, 6);
        expect(game.hits[0].knockback).toBe(990);
        expect(game.Neo.hazards).toHaveLength(level >= 10 ? 1 : 0);
        npc.Neo.hazards.forEach((hazard, index) => {
          const { enemy, ownerEnemy, ...descriptor } = hazard;
          expect(game.Neo.hazards[index]).toEqual(expect.objectContaining(descriptor));
          expect(game.Neo.hazards[index]).toEqual(expect.objectContaining({ enemy: false, nativeEnemyAttack: true, owner: game.player }));
        });
      }
      expect(game.player.enemyNativePrimary).toBeNull();
      expect(game.player.inv).toBe(0);
    }
  });

  test('nova can overlap the charge, and leap pauses nova recharge and a pending spit', () => {
    const game = fixture(20, 500);
    game.cast('melee');
    game.tick(0.2);
    const spitRemaining = game.player.enemyNativePrimary.actor.spitWindup;
    game.cast('smash');
    expect(game.player.enemyNativePrimary.actor.spitWindup).toBe(spitRemaining);
    expect(game.player.enemyNativePrimary.moveKey).toBe('enemy_bulk_golem_primary');
    game.cast('dash');
    const actor = game.player.enemyNativePrimary.actor;
    game.tick(0.4);
    expect(actor.spitWindup).toBe(spitRemaining);
    expect(game.player.enemyNativeCooldowns.enemy_bulk_nova).toBe(3);
    expect(game.Neo.cooldowns.smash.timers).toEqual([3]);
    expect(game.shots).toHaveLength(0);
    game.cast('melee'); game.cast('laser'); game.cast('smash'); game.cast('dash');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(3);
    game.tick(0.42);
    expect(game.player.enemyNativeCooldowns.enemy_bulk_leap).toBeCloseTo(2.4);
    for (let frame = 0; frame < 55; frame++) game.tick(0.01);
    expect(game.shots).toHaveLength(1);
    expect(game.player.enemyNativeCooldowns.enemy_bulk_nova).toBeCloseTo(2.45);
  });

  test('nova damages all opponents in its level-scaled radius while landing damages only the nearest', () => {
    const game = fixture(40, 225 + 14);
    game.Neo.enemies.push({ id: 'other', hp: 10000, x: 200, y: 500, r: 14 });
    game.cast('smash');
    expect(game.hits).toHaveLength(2);
    game.cast('dash');
    const actor = game.player.enemyNativePrimary.actor;
    game.Neo.enemies.forEach((target, index) => { target.x = actor.bulkJumpTargetX + 30 + index * 10; target.y = actor.bulkJumpTargetY; });
    game.tick(0.82);
    expect(game.hits).toHaveLength(3);
    expect(game.Neo.hazards[0].blastRadius).toBe(239);
  });

  test('blocked landing search matches the NPC and total failure uses its short retry cooldown', () => {
    for (const blocked of [(x, y) => x > 280 && x < 340 && y > 330 && y < 400, () => true]) {
      const npc = fixture(10, 300, true), game = fixture(10, 300);
      npc.Neo.isBlocked = game.Neo.isBlocked = blocked;
      npc.cast('dash'); game.cast('dash');
      const actor = game.player.enemyNativePrimary.actor;
      expect(actor.bulkJumpTargetX).toBe(npc.actor.bulkJumpTargetX);
      expect(actor.bulkJumpTargetY).toBe(npc.actor.bulkJumpTargetY);
      if (!actor.bulkJumpTime) {
        expect(game.player.enemyNativeCooldowns.enemy_bulk_leap).toBe(0.8);
        expect(game.Neo.cooldowns.dash.timers).toEqual([0.8]);
      }
    }
  });

  test('leap ignores steering, and room changes remove flight state', () => {
    const game = fixture(20, 300);
    game.cast('dash'); game.tick(0.3);
    movement.applyCampaignPlayerVelocity(game.player, { moveX: 1, moveY: 1 }, 0.05, { speed: 10000 });
    expect([game.player.vx, game.player.vy]).toEqual([0, 0]);
    expect(game.player.airborne).toBe(true);
    game.Neo.currentRoom.id = 'elsewhere'; game.tick(0.01);
    expect(game.player.enemyNativePrimary).toBeNull();
    expect(game.player.airborne).toBe(false);
    expect(game.player.jumpZ).toBe(0);
  });

  test('changing multiplayer characters during a leap clears the flight state', () => {
    const game = fixture(20, 300);
    game.cast('dash'); game.tick(0.3);
    expect(game.player.airborne).toBe(true);
    expect(game.player.jumpZ).toBeGreaterThan(0);
    applyNetworkHeroProfile(game.player, 'thorn_knight');
    expect(game.player.enemyNativePrimary).toBeNull();
    expect(game.player.airborne).toBe(false);
    expect(game.player.jumpZ).toBe(0);
  });

  test.each(cases)('%s runs against real enemies in the authority', (key, slot, distance) => {
    const events = [];
    const simulation = createCampaignSimulation({ matchSeed: key, floorSeed: key, matchRules: { difficulty },
      emitEvent: (type, data) => events.push({ type, data }) });
    const state = simulation.state;
    const p = state.players.p1 = createCampaignPlayer({ id: 'p1', characterKey: 'enemy_bulk_golem', roomId: state.floorState.currentRoomId });
    p.level = 20;
    simulation.updateGame({}, 0.05);
    Object.values(state.enemies).forEach(enemy => { enemy.dead = true; enemy.health = 0; });
    const room = state.floorState.layout.rooms.find(room => room.id === p.roomId);
    room.structures = []; room.destructibles = []; room.hazards = [];
    Object.assign(p, { x: 200, y: 350, vx: 0, vy: 0 });
    const target = state.enemies.target = { id: 'target', type: 'hunter', x: 200 + distance, y: 350, radius: 14,
      maxHealth: 100000, health: 100000, roomId: p.roomId, moveSpeed: 0, contactDamage: 0,
      spawnTick: state.tick, spawnT: 1000, stunnedUntilTick: state.tick + 1000, level: 1, vx: 0, vy: 0 };
    const startHp = p.hp;
    simulation.updateGame({ p1: { aimDirection: 0, actions: [{ action: slot === 'melee' ? 'ATTACK' : slot === 'dash' ? 'DASH' : 'ABILITY',
      abilityId: key, aimDirection: 0, targetX: target.x, targetY: target.y }] } }, 0.05);
    if (slot === 'dash') { target.x = p.enemyNativePrimary.actor.bulkJumpTargetX + 25; target.y = p.enemyNativePrimary.actor.bulkJumpTargetY; }
    let sawHazard = false, sawPoison = false, maxHeight = 0;
    for (let frame = 0; frame < 90; frame++) {
      simulation.updateGame({}, 0.05);
      maxHeight = Math.max(maxHeight, Number(p.jumpZ || 0));
      sawHazard ||= room.hazards.some(h => h.nativeEnemyAttack);
      sawPoison ||= Number(target.statuses?.poison?.stacks || 0) > 0;
      // Hold the victim near the crater to observe the delayed blast separately.
      if (slot === 'dash' && p.enemyNativePrimary?.actor?.bulkJumpTargetX) {
        target.x = p.enemyNativePrimary.actor.bulkJumpTargetX + 25; target.y = p.enemyNativePrimary.actor.bulkJumpTargetY;
        target.vx = target.vy = 0;
      }
    }
    expect(target.health).toBeLessThan(100000);
    expect(p.hp).toBe(startHp);
    const hits = events.filter(e => e.type === 'ENEMY_HIT' && e.data.enemyId === 'target' && e.data.attackKind !== 'poison');
    expect(hits).toHaveLength(slot === 'dash' ? 2 : 1);
    // NPCs and players both gain 2% outgoing knockback per level after level 1.
    expect(hits[0].data.knockback).toBeCloseTo({ melee: 360, laser: 840, smash: 600, dash: 990 }[slot] * 1.38);
    if (slot === 'melee') expect(sawPoison).toBe(true);
    if (slot === 'dash') {
      expect(maxHeight).toBeGreaterThan(90);
      expect(sawHazard).toBe(true);
      expect(hits[1].data.knockback).toBeCloseTo(720 * 1.38);
      expect(room.hazards.some(h => h.nativeEnemyAttack)).toBe(false);
    }
    expect(p.enemyNativePrimary).toBeNull();
    expect(p.airborne).toBe(false);
    expect(Number(p.invulnerableUntilTick || 0)).toBeLessThanOrEqual(state.tick);
    expect(p.ownedWeapons).toEqual({});
  });
});
