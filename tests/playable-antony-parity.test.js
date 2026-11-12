const fs = require('node:fs');
const vm = require('node:vm');
const content = require('../js/simulation/SharedEnemyContent');
const moves = require('../js/simulation/SharedMoveContent');
const scaling = require('../js/simulation/SharedEnemyScalingSystem');
const attacks = require('../js/simulation/SharedEnemyAttackSystem');
const behavior = require('../js/simulation/SharedEnemyBehaviorSystem');
const geometry = require('koz-engine-lib/Core/geometry2d');
const projectileApi = require('../js/simulation/SharedProjectileSystem');
const hazardApi = require('../js/simulation/SharedHazardSystem');
const beamApi = require('../js/simulation/SharedBeamPathSystem');
const { createCampaignPlayer, createCampaignSimulation } = require('../js/simulation/CampaignSimulation');
const difficulty = scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard;
const tuning = { reaction: difficulty.enemyReactionMultiplier, rangedCadence: difficulty.rangedCadenceMultiplier,
  supportPower: difficulty.supportPowerMultiplier };
const cases = [
  ['enemy_antony_blemmye_primary', 'melee', 60],
  ['enemy_antony_hammer', 'laser', 240],
  ['enemy_antony_freeze_ball', 'smash', 600],
  ['enemy_antony_slash', 'dash', 110],
];
function fixture(level = 1, distance = 60, npc = false) {
  const hits = [], shots = [], statuses = [];
  const player = { character: 'enemy_antony_blemmye', level, hp: 500, maxHp: 1000,
    x: 100, y: 350, r: 42, vx: 0, vy: 0, inv: 0, cowardsWayTime: 0,
    equippedMoves: moves.getDefaultMoveLoadout('enemy_antony_blemmye') };
  const target = { id: 'target', x: 100 + distance, y: 350, r: 14, hp: 100000 };
  const Neo = { player: npc ? target : player, floor: 1, currentRoom: { id: 'room' }, gameMode: 'normal',
    gameElapsedTime: 0, MAX_FLOOR: 10, enemies: npc ? [] : [target], shake: 0, shakeT: 0,
    getProgressionDepth: () => 1, getDifficultyDef: () => difficulty, getEnemyDifficultyTuning: () => tuning,
    nextRandom: () => 0, rand: () => 0, angleToMouse: () => 0,
    angleBetween: (a, b) => Math.atan2(b.y - a.y, b.x - a.x), dist: (x, y, a, b) => Math.hypot(a - x, b - y),
    spendSkillCharge: jest.fn(() => true), getItemStats: () => ({ globalDamageMultiplier: 100, healingMultiplier: 10 }),
    getAttackSpeedValue: () => 1,
    ringBurst: () => {}, spawnParticle: () => {}, getEnemyBeamBounceCount: () => 0,
    spawnProjectile: shot => shots.push(shot),
    buildRicochetBeamPath: (x, y, angle, range) => [{ x1: x, y1: y, x2: x + Math.cos(angle) * range, y2: y + Math.sin(angle) * range }],
    beamPathHitsCircle: (path, x, y, r) => geometry.segmentHitsCircle(path[0].x1, path[0].y1, path[0].x2, path[0].y2, x, y, r),
    MOVE_DEFS: Object.fromEntries(Object.entries(moves.MOVE_SLOT_KEYS).flatMap(([slot, keys]) => keys.map(key => [key, { slot }]))),
  };
  const context = vm.createContext({ Neo, window: {}, NeoNyke: { content, simulation: { ...scaling, ...attacks, ...behavior } } });
  vm.runInContext(fs.readFileSync(require.resolve('../js/game/combat.js'), 'utf8'), context);
  if (npc) vm.runInContext(fs.readFileSync(require.resolve('../js/game/enemies.js'), 'utf8'), context);
  Neo.damagePlayer = (damage, angle, knockback) => hits.push({ damage, angle, knockback });
  Neo.hitEnemy = (_target, damage, angle, knockback, _color, options) => {
    expect(options).toEqual(expect.objectContaining({ nativeEnemyAttack: true, rawDamage: true, canCrit: false }));
    hits.push({ damage, angle, knockback });
  };
  Neo.applyStatus = (_target, key, stacks, duration) => statuses.push({ key, stacks, duration });
  Neo.applyDarkDrain = (_target, stacks, duration) => statuses.push({ key: 'dark_drain', stacks, duration });
  Neo.applyFire = (_target, stacks, duration) => statuses.push({ key: 'fire', stacks, duration });
  const actor = attacks.getPlayableEnemyAttackActor(player, { difficulty });
  Object.assign(actor, { windup: 0, beamTime: 0, beamTick: 0, swingTime: 0, attackCd: 0,
    antonyHammerLineShown: true, antonySlashLineShown: true, antonyDeathBallLineShown: true,
    hammerCd: 3600, slashCd: 3600, biteCd: 3600, deathBallCd: 3600 });
  const cast = slot => Neo[{ melee: 'tryMelee', laser: 'tryLaser', smash: 'trySmash', dash: 'tryDash' }[slot]]();
  const tick = dt => {
    if (npc) {
      actor.attackCd = Math.max(0, actor.attackCd - dt * actor.enemyLevelAttackSpeedMultiplier);
      Neo.updateAntonyBlemmyeBoss(actor, dt);
    } else Neo.updateEnemyNativePrimary(dt);
  };
  return { Neo, player, target, actor, hits, shots, statuses, cast, tick };
}

describe('Anthony native boss kit', () => {
  test.each(cases)('%s matches the actual browser boss at levels 1, 10, 20 and 25', (key, slot, distance) => {
    for (const level of [1, 10, 20, 25]) {
      const npc = fixture(level, distance, true);
      const game = fixture(level, distance);
      const cd = { melee: 'biteCd', laser: 'hammerCd', smash: 'deathBallCd', dash: 'slashCd' }[slot];
      npc.actor[cd] = 0;
      npc.tick(0);
      game.cast(slot);
      expect(game.Neo.spendSkillCharge).toHaveBeenCalledWith(slot, npc.actor[cd]);
      // Keep the NPC from selecting a second attack after this one completes.
      npc.actor[cd] = 3600;
      for (let frame = 0; frame < 330; frame++) { npc.tick(0.01); game.tick(0.01); }
      expect(game.hits).toEqual(npc.hits);
      expect(game.statuses).toEqual(npc.statuses);
      expect(game.shots).toHaveLength(npc.shots.length);
      npc.shots.forEach((shot, index) => {
        const { enemy, owner, bossProjectile, ...descriptor } = shot;
        expect(game.shots[index]).toEqual(expect.objectContaining(descriptor));
        expect(game.shots[index].enemy).toBe(false);
        expect(game.shots[index].nativeEnemyAttack).toBe(true);
      });
      if (slot === 'smash') {
        expect(game.shots).toHaveLength(level >= 25 ? 3 : level >= 10 ? 2 : 1);
        expect(game.shots[0].enemyBlast.radius).toBe(level >= 5 ? 145 : 120);
        expect(game.shots[0].statusEffects[0].stacks).toBe(1 + Math.floor(level / 3));
      } else {
        expect(game.hits.length).toBeGreaterThan(0);
        if (slot === 'melee') {
          expect(game.player.hp - 500).toBe(npc.actor.hp - npc.actor.max * 0.5);
          expect(game.hits.length > 1).toBe(level >= 20);
          expect(game.player.spriteAction).toBe('bite');
        }
      }
      expect(game.player.inv).toBe(0);
      expect(game.player.enemyNativePrimary).toBeNull();
    }
  });

  test('a bite miss does not heal or trigger the level-20 beam; slash does not dash', () => {
    const game = fixture(20, 600);
    game.cast('melee');
    for (let frame = 0; frame < 100; frame++) game.tick(0.05);
    expect(game.hits).toHaveLength(0);
    expect(game.statuses).toHaveLength(0);
    expect(game.player.hp).toBe(500);
    game.target.x = -100;
    game.cast('dash');
    expect(game.hits).toHaveLength(0);
    expect(attacks.getControlledEnemyMovement(game.player)).toBeNull();
    expect(game.player.inv).toBe(0);
  });

  test('windups exclude other attacks and independent cooldowns preserve the NPC recovery', () => {
    const game = fixture(1, 60);
    game.cast('laser');
    game.cast('melee'); game.cast('dash'); game.cast('smash');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
    for (let frame = 0; frame < 100; frame++) game.tick(0.01);
    game.cast('dash');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
    game.cast('melee'); // Bite can interrupt recovery once the windup ends.
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(2);
    game.cast('melee');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(2);
    for (let frame = 0; frame < 200; frame++) game.tick(0.01);
    game.cast('dash');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(3);
    game.cast('laser');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(3);
  });

  test('stun pauses the bite combo and room changes cancel it', () => {
    const game = fixture(20, 60);
    game.cast('melee');
    game.player.stun = 1;
    game.tick(2);
    expect(game.player.enemyNativePrimary.actor.antonyComboTimer).toBe(0.48);
    expect(game.hits).toHaveLength(1);
    game.Neo.currentRoom.id = 'elsewhere';
    game.tick(0.05);
    expect(game.player.enemyNativePrimary).toBeNull();
  });

  test('authority rejects repeated bites before their own cooldown finishes', () => {
    const events = [];
    const simulation = createCampaignSimulation({ matchSeed: 'bite-cadence', floorSeed: 'bite-cadence',
      matchRules: { difficulty }, emitEvent: (type, data) => events.push({ type, data }) });
    const state = simulation.state;
    const p = state.players.p1 = createCampaignPlayer({ id: 'p1', characterKey: 'enemy_antony_blemmye', roomId: state.floorState.currentRoomId });
    simulation.updateGame({}, 0.05);
    Object.values(state.enemies).forEach(enemy => { enemy.dead = true; enemy.health = 0; });
    const action = { action: 'ATTACK', aimDirection: 0 };
    for (let frame = 0; frame < 25; frame++) simulation.updateGame({ p1: { actions: [action] } }, 0.05);
    const casts = () => events.filter(event => event.type === 'PLAYER_ABILITY_USED' && event.data.abilityId === 'enemy_antony_blemmye_primary');
    expect(casts()).toHaveLength(1);
    for (let frame = 0; frame < 25; frame++) simulation.updateGame({ p1: { actions: [action] } }, 0.05);
    expect(casts()).toHaveLength(2);
  });

  test.each(cases)('%s executes its full attack in the real authority', (key, slot, distance) => {
    const simulation = createCampaignSimulation({ matchSeed: key, floorSeed: key, matchRules: { difficulty } });
    const state = simulation.state;
    const p = state.players.p1 = createCampaignPlayer({ id: 'p1', characterKey: 'enemy_antony_blemmye', roomId: state.floorState.currentRoomId });
    p.level = 25;
    simulation.updateGame({}, 0.05);
    Object.values(state.enemies).forEach(enemy => { enemy.dead = true; enemy.health = 0; });
    const room = state.floorState.layout.rooms.find(room => room.id === p.roomId);
    room.structures = []; room.destructibles = []; room.hazards = [];
    Object.assign(p, { x: 100, y: 350, vx: 0, vy: 0 });
    const target = state.enemies.target = { id: 'target', type: 'hunter', x: 100 + distance, y: 350, radius: 14,
      maxHealth: 100000, health: 100000, roomId: p.roomId, moveSpeed: 0, contactDamage: 0,
      spawnTick: state.tick, spawnT: 1000, stunnedUntilTick: state.tick + 1000, level: 1, vx: 0, vy: 0 };
    // Authority outcome assertions use actual enemies and projectiles, without a mocked damage callback.
    simulation.updateGame({ p1: { aimDirection: 0, actions: [{ action: slot === 'melee' ? 'ATTACK' : slot === 'dash' ? 'DASH' : 'ABILITY', abilityId: key, aimDirection: 0 }] } }, 0.05);
    let seenShots = [];
    let sawBeam = false;
    let maxColdStacks = 0;
    for (let frame = 0; frame < 90; frame++) {
      simulation.updateGame({ p1: { aimDirection: 0 } }, 0.05);
      const shots = Object.values(state.projectiles).filter(shot => shot.ownerId === p.id);
      if (shots.length > seenShots.length) seenShots = shots;
      sawBeam ||= !!p.beamChannel?.nativeEnemyAttack;
      maxColdStacks = Math.max(maxColdStacks, Number(target.statuses?.slow?.stacks || 0));
    }
    expect(target.health).toBeLessThan(100000);
    if (slot === 'smash') {
      expect(seenShots).toHaveLength(3);
      seenShots.forEach(shot => expect(shot).toEqual(expect.objectContaining({ kind: 'cold_death', nativeEnemyAttack: true,
        homing: true, homingTurnRate: 0.65, homingAccel: 1.1, enemyBlast: expect.objectContaining({ radius: 145, statusStacks: 9 }) })));
      expect(maxColdStacks).toBeGreaterThan(0);
    }
    if (slot === 'melee') expect(sawBeam).toBe(true);
    expect(p.enemyNativePrimary).toBeNull();
    expect(Number(p.invulnerableUntilTick || 0)).toBeLessThanOrEqual(state.tick);
  });

  test('native frost impacts use the NPC blast against enemies without hitting the owner', () => {
    const hits = [], statuses = [];
    const Neo = { projectiles: [], enemies: [
      { id: 'direct', x: 300, y: 350, r: 14, hp: 10000 },
      { id: 'splash', x: 360, y: 410, r: 14, hp: 10000 },
      { id: 'far', x: 700, y: 350, r: 14, hp: 10000 },
    ], player: { x: 100, y: 350, r: 42, hp: 1000 }, destructibles: [], structures: [], walls: [],
      simulationTick: 1, selectedDifficulty: 'hard', gameElapsedTime: 0,
      getDifficultyDef: () => difficulty,
      getItemStats: () => ({ projectileSpeedMultiplier: 10, projectilePierceBonus: 10 }),
      rollRicoceteBounces: () => 0, nextRandom: () => 0.5, rand: () => 0.5,
      dist: (x, y, a, b) => Math.hypot(a - x, b - y), clamp: geometry.clamp,
      isBlocked: () => false, spawnParticle: () => {}, PROJECTILE_TRAIL_LENGTH: 6,
      hitEnemy: (target, damage, _angle, _knockback, _color, options) => {
        target.hp -= damage; hits.push({ id: target.id, damage, native: options.nativeEnemyAttack });
      },
      applyStatus: (target, key, stacks, duration) => statuses.push({ id: target.id, key, stacks, duration }),
      unorderedRemoveAt: (list, index) => list.splice(index, 1)[0],
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/game/world.js'), 'utf8'), {
      Neo, window: {}, NeoNyke: { simulation: { ...projectileApi, ...hazardApi, ...scaling } },
    });
    Neo.spawnParticle = () => {};
    const [descriptor] = attacks.planAntonyDeathBallProjectiles({ x: 100, y: 350, r: 42, dmg: 40, level: 1 }, 0);
    Neo.spawnProjectile({ ...descriptor, owner: Neo.player, enemy: false, bossProjectile: true, nativeEnemyAttack: true,
      homingTarget: 'enemy', hitOptions: { nativeEnemyAttack: true, rawDamage: true, canCrit: false } });
    expect(Neo.projectiles[0].vx).toBe(525 * scaling.getCampaignEnemyProjectileSpeedMultiplier(difficulty, { boss: true, elapsedSeconds: 0 }));
    for (let frame = 0; frame < 100 && Neo.projectiles.length; frame++) { Neo.simulationTick++; Neo.updateProjectiles(0.01); }
    expect(hits).toEqual([
      { id: 'direct', damage: 44, native: true }, { id: 'direct', damage: 26, native: true }, { id: 'splash', damage: 26, native: true },
    ]);
    expect(statuses).toEqual([
      { id: 'direct', key: 'slow', stacks: 1, duration: 4 }, { id: 'direct', key: 'slow', stacks: 1, duration: 3 },
      { id: 'splash', key: 'slow', stacks: 1, duration: 3 },
    ]);
    expect(Neo.player.hp).toBe(1000);
  });

  test('the mouth beam reflects off cover, hits reflected targets once, and renders its collision path', () => {
    const game = fixture(25, 150);
    const targets = [
      { id: 'front', x: 150, y: 350, r: 14, hp: 1000 },
      { id: 'covered', x: 250, y: 350, r: 14, hp: 1000 },
      { id: 'reflected', x: 50, y: 350, r: 14, hp: 1000 },
    ];
    game.Neo.enemies = targets;
    game.Neo.getEnemyBeamBounceCount = () => 1;
    game.Neo.buildRicochetBeamPath = (x, y, angle, range, maxBounces) => beamApi.buildCampaignRicochetBeamPath({
      originX: x, originY: y, angle, range, maxBounces, rects: [{ x: 200, y: 0, w: 30, h: 700 }],
    });
    const hitIds = [];
    game.Neo.hitEnemy = target => hitIds.push(target.id);
    game.player.enemyNativePrimary = { actor: { ...game.actor, state: 'antonyMouthBeam', beamAngle: 0,
      beamTime: 1.05, beamTick: 0, nativeMoveKey: 'enemy_antony_blemmye_primary' },
      moveKey: 'enemy_antony_blemmye_primary', roomId: 'room', floor: 1 };
    game.tick(0.05);
    expect(hitIds).toEqual(['front', 'reflected']);
    expect(game.player.auxLaserPath).toHaveLength(2);
    expect(game.player.auxLaserPath[0].x2).toBe(200);
    expect(game.player.auxLaserPath[1].x2).toBeLessThan(50);
  });
});
