const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const content = require('../js/simulation/SharedEnemyContent');
const moves = require('../js/simulation/SharedMoveContent');
const scaling = require('../js/simulation/SharedEnemyScalingSystem');
const attacks = require('../js/simulation/SharedEnemyAttackSystem');
const projectilePolicies = require('../js/simulation/SharedProjectileSystem');
const { createCampaignEnemyBehaviors } = require('../js/simulation/SharedEnemyBehaviorSystem');
const { createCampaignSimulation, createCampaignPlayer } = require('../js/simulation/CampaignSimulation');

const cases = [
  ['hunter', 'hunter_volley', 5, 7, 620, 0.72],
  ['sniper', 'sniper_round', 1, 2, 900, 1.45],
  ['machine_gunner', 'gunner_barrage', 12, 16, 720, 0.42],
  ['laser', 'dungeon_beam', 1, 3, 820, 1.15],
  ['cult_mage', 'cult_bolt_volley', 5, 7, 500, 0.7],
  ['shield_unit', 'shield_throw', 1, 1, 600, 1.1],
  ['machine_gunner', 'bullet_nova', 24, 30, 680, 0.4],
  ['laser', 'laser_nova', 12, 16, 520, 0.68],
];

function campaign(type, level, difficulty) {
  const shots = [];
  const character = `enemy_${type}`;
  const Neo = {
    player: { character, x: 450, y: 350, hp: 500, level, cowardsWayTime: 0,
      equippedMoves: moves.getDefaultMoveLoadout(character) },
    MOVE_DEFS: Object.fromEntries(Object.entries(moves.MOVE_SLOT_KEYS).flatMap(([slot, keys]) => keys.map(key => [key, { slot }]))),
    getDifficultyDef: () => difficulty,
    getEnemyDifficultyTuning: () => ({ rangedCadence: difficulty.rangedCadenceMultiplier }),
    getProgressionDepth: () => 1,
    gameElapsedTime: 0, gameMode: 'normal', MAX_FLOOR: 10,
    getItemStats: () => ({}), getAttackSpeedValue: () => 1,
    spendSkillCharge: jest.fn(() => true), ringBurst: jest.fn(),
    angleToMouse: () => 0.31,
    spawnProjectile: projectile => shots.push(projectile),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8'), {
    Neo, NeoNyke: { content, simulation: { ...scaling, ...attacks } }, window: {},
  });
  return { Neo, shots };
}

describe('playable enemy projectile signatures', () => {
  test.each(cases)('%s %s has the NPC count, speed and damage at both milestones', (type, move, count, upgradedCount, speed, damageScale) => {
    for (const level of [7, 20]) {
      const actor = { type, level, x: 450, y: 350, r: content.ENEMY_CATALOG[type].radius, dmg: 40 };
      const plan = attacks.planEnemySignatureProjectiles(actor, move, 0.31);
      expect(plan).toHaveLength(level >= 20 ? upgradedCount : count);
      plan.forEach(shot => {
        expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(speed);
        expect(shot.damage).toBe(Math.round(40 * damageScale));
        expect(shot.kind).toBe(move);
      });
    }
  });

  test.each(cases)('%s %s is emitted identically by NPC and browser player controllers', (type, move) => {
    for (const level of [14, 20]) {
      const difficulty = scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard;
      const { Neo, shots } = campaign(type, level, difficulty);
      const actor = attacks.getPlayableEnemyAttackActor(Neo.player, { difficulty, progressionDepth: 1 });
      const npcShots = [];
      const controller = createCampaignEnemyBehaviors({
        getPlayer: () => ({ x: actor.x + Math.cos(0.31) * 300, y: actor.y + Math.sin(0.31) * 300 }),
        getTuning: Neo.getEnemyDifficultyTuning,
        spawnProjectile: (_enemy, shot) => npcShots.push(shot),
      });
      const npc = { ...actor, npcSignatureMove: move, npcSignatureWindup: 0.01 };
      controller.updateNpcEnemySignatureMoves(npc, 0.02);
      const slot = moves.getMoveSlot(move);
      Neo[slot === 'laser' ? 'tryLaser' : 'trySmash']();
      expect(shots).toHaveLength(0);
      const timing = attacks.getEnemySignatureTiming(move, level, Neo.getEnemyDifficultyTuning());
      Neo.updateEnemyProjectileSignature(timing.windup - 0.01);
      expect(shots).toHaveLength(0);
      Neo.updateEnemyProjectileSignature(0.02);
      expect(shots).toHaveLength(npcShots.length);
      shots.forEach((shot, index) => {
        const expected = npcShots[index];
        for (const key of ['x', 'y', 'vx', 'vy']) expect(shot[key]).toBeCloseTo(expected[key]);
        for (const key of ['damage', 'kind', 'r', 'life', 'pierceCount', 'knockback', 'statusEffects']) expect(shot[key]).toEqual(expected[key]);
        expect(shot.enemy).toBe(false);
      });
      expect(Neo.spendSkillCharge).toHaveBeenCalledWith(slot, timing.cooldown);
      expect(Neo.getDisplayDamage(move, 'move')).toEqual(expect.objectContaining({
        min: shots[0].damage, max: shots[0].damage, hits: shots.length,
      }));
      Neo[slot === 'laser' ? 'tryLaser' : 'trySmash']();
      expect(Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
    }
  });

  test.each(cases)('%s %s creates real authority projectiles after its windup', (type, move, count, upgradedCount) => {
    for (const level of [14, 20]) {
      const simulation = createCampaignSimulation({ matchId: 'parity', matchSeed: 'parity', floorSeed: 'parity|1' });
      const state = simulation.state;
      const player = state.players.p1 = createCampaignPlayer({ id: 'p1', characterKey: `enemy_${type}`, roomId: state.floorState.currentRoomId });
      player.x = 450; player.y = 350; player.level = level;
      simulation.updateGame({ p1: {} }, 0.05);
      Object.values(state.enemies).forEach(enemy => { enemy.dead = true; enemy.health = 0; });
      const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
      room.structures = []; room.destructibles = []; room.hazards = [];
      simulation.updateGame({ p1: { aimDirection: 0.31, actions: [{ action: 'ABILITY', abilityId: move, aimDirection: 0.31 }] } }, 0.05);
      expect(player.enemySignatureCast).toBeTruthy();
      expect(Object.values(state.projectiles).filter(shot => shot.ownerId === 'p1')).toHaveLength(0);
      const actor = player.enemySignatureCast.actor;
      for (let tick = 0; tick < 20 && player.enemySignatureCast; tick++) simulation.updateGame({ p1: { aimDirection: 0.31 } }, 0.05);
      const shots = Object.values(state.projectiles).filter(shot => shot.ownerId === 'p1');
      expect(shots).toHaveLength(level >= 20 ? upgradedCount : count);
      const plan = attacks.planEnemySignatureProjectiles(actor, move, 0.31);
      const speedScale = scaling.getCampaignEnemyProjectileSpeedMultiplier(state.matchRules.difficulty, { boss: actor.boss, elapsedSeconds: state.elapsedSeconds });
      shots.forEach((shot, index) => {
        expect(shot.kind).toBe(plan[index].kind);
        expect(shot.damage).toBe(plan[index].damage);
        expect(shot.radius).toBe(plan[index].r);
        expect(shot.remainingPierces).toBe(plan[index].pierceCount);
        expect(shot.lifeTicks / 20).toBeCloseTo(plan[index].life);
        expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(Math.hypot(plan[index].vx, plan[index].vy) * speedScale);
        expect(shot.statusEffects).toEqual(plan[index].statusEffects);
      });
    }
  });

  test('a volley also cools the nova, and a room change cancels the pending cast', () => {
    const { Neo, shots } = campaign('machine_gunner', 20, scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.medium);
    Neo.cooldowns = {};
    Neo.currentRoom = { id: 'first' };
    Neo.tryLaser();
    Neo.trySmash();
    expect(Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
    expect(Neo.cooldowns.laser.charges).toBe(0);
    expect(Neo.cooldowns.smash.charges).toBe(0);
    expect(Neo.cooldowns.smash.timers).toEqual(Neo.cooldowns.laser.timers);
    Neo.currentRoom = { id: 'second' };
    Neo.updateEnemyProjectileSignature(1);
    expect(shots).toHaveLength(0);
    expect(Neo.player.enemySignatureCast).toBeNull();
  });

  test('browser projectiles retain enemy speed scaling, hit each body once and apply their payload', () => {
    const hits = [];
    const statuses = [];
    const Neo = {
      projectiles: [], enemies: [
        { id: 'first', x: 140, y: 100, r: 24, hp: 100 },
        { id: 'second', x: 240, y: 100, r: 24, hp: 100 },
      ], player: {}, destructibles: [], structures: [], walls: [],
      simulationTick: 1, selectedDifficulty: 'impossible', gameElapsedTime: 0,
      getDifficultyDef: () => scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.impossible,
      getItemStats: () => ({ projectileSpeedMultiplier: 3, projectilePierceBonus: 10 }),
      rollRicoceteBounces: () => 0, nextRandom: () => 0.5,
      isBlocked: () => false, rand: () => 0.5, spawnParticle: () => {},
      PROJECTILE_TRAIL_LENGTH: 6,
      hitEnemy: enemy => hits.push(enemy.id),
      applyStatus: (enemy, ...effect) => statuses.push([enemy.id, ...effect]),
      unorderedRemoveAt: (list, index) => list.splice(index, 1)[0],
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8'), {
      Neo, NeoNyke: { simulation: { ...scaling, ...projectilePolicies } }, window: {},
    });
    Neo.spawnParticle = () => {};
    Neo.spawnProjectile({ x: 100, y: 100, vx: 100, vy: 0, r: 12, life: 2,
      kind: 'shield_throw', damage: 20, pierceCount: 3, nativeEnemyAttack: true,
      statusEffects: [{ key: 'fire', chance: 1, stacks: 2, duration: 3.2 }],
    });
    expect(Neo.projectiles[0].vx).toBeCloseTo(130);
    expect(Neo.projectiles[0].pierceCount).toBe(3);
    for (let frame = 0; frame < 150; frame++) {
      Neo.simulationTick++;
      Neo.updateProjectiles(0.01);
    }
    expect(hits).toEqual(['first', 'second']);
    expect(statuses).toEqual([
      ['first', 'fire', 2, 3.2, null], ['second', 'fire', 2, 3.2, null],
    ]);
  });
});
