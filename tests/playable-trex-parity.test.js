const fs = require('node:fs');
const vm = require('node:vm');
const content = require('../js/simulation/SharedEnemyContent');
const moves = require('../js/simulation/SharedMoveContent');
const scaling = require('../js/simulation/SharedEnemyScalingSystem');
const attacks = require('../js/simulation/SharedEnemyAttackSystem');
const behavior = require('../js/simulation/SharedEnemyBehaviorSystem');
const ai = require('../js/simulation/SharedEnemyAISystem');
const movement = require('../js/simulation/CampaignMovementRules');
const { createCampaignPlayer, createCampaignSimulation } = require('../js/simulation/CampaignSimulation');

const difficulty = scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard;
const tuning = { reaction: difficulty.enemyReactionMultiplier, rangedCadence: difficulty.rangedCadenceMultiplier,
  supportPower: difficulty.supportPowerMultiplier };
const cases = [
  ['enemy_t_rex_primary', 'melee', 85],
  ['enemy_t_rex_roar', 'laser', 200],
  ['enemy_t_rex_charge', 'dash', 400],
];

function fixture(level = 1, distance = 85, npc = false) {
  const hits = [], shots = [], statuses = [];
  const player = { character: 'enemy_t_rex', level, x: 200, y: 350, r: 58,
    hp: 2600, maxHp: 2600, vx: 0, vy: 0, inv: 0, cowardsWayTime: 0,
    equippedMoves: moves.getDefaultMoveLoadout('enemy_t_rex') };
  const target = { id: 'target', x: 200 + distance, y: 350, r: 14, hp: 100000 };
  const Neo = { player: npc ? target : player, floor: 1, currentRoom: { id: 'room' }, gameMode: 'normal',
    gameElapsedTime: 0, MAX_FLOOR: 10, WALL: 28, ROOM_W: 900, ROOM_H: 700,
    enemies: npc ? [] : [target], cooldowns: {},
    getProgressionDepth: () => 1, getDifficultyDef: () => difficulty, getEnemyDifficultyTuning: () => tuning,
    nextRandom: () => 0.5, angleToMouse: () => 0,
    spendSkillCharge: jest.fn(() => true), getItemStats: () => ({ globalDamageMultiplier: 100 }), getAttackSpeedValue: () => 100,
    ringBurst: jest.fn(), spawnParticle: jest.fn(), spawnProjectile: shot => shots.push(shot),
    MOVE_DEFS: Object.fromEntries(Object.entries(moves.MOVE_SLOT_KEYS).flatMap(([slot, keys]) => keys.map(key => [key, { slot }]))),
  };
  const context = vm.createContext({ Neo, window: {}, NeoNyke: { content, simulation: { ...scaling, ...attacks, ...behavior } } });
  vm.runInContext(fs.readFileSync(require.resolve('../js/game/combat.js'), 'utf8'), context);
  if (npc) vm.runInContext(fs.readFileSync(require.resolve('../js/game/enemies.js'), 'utf8'), context);
  Neo.damagePlayer = (damage, angle, knockback) => hits.push({ damage, angle, knockback });
  Neo.hitEnemy = (victim, damage, angle, knockback, _color, options) => {
    expect(options).toEqual(expect.objectContaining({ nativeEnemyAttack: true, rawDamage: true, canCrit: false }));
    hits.push({ damage, angle, knockback });
  };
  Neo.applyStatus = (_target, key, stacks, duration) => statuses.push({ key, stacks, duration });
  Neo.applyBleed = (_target, stacks, duration) => statuses.push({ key: 'bleed', stacks, duration });
  const actor = attacks.getPlayableEnemyAttackActor(player, { difficulty });
  Object.assign(actor, { windup: 0, dashTime: 0, swingTime: 0, attackCd: 0, roarCd: 3600 });
  const cast = slot => {
    if (npc) {
      if (slot === 'laser') { actor.roarCd = 0; actor.attackCd = 9; }
      Neo.updateTRexBoss(actor, 0);
    } else Neo[{ melee: 'tryMelee', laser: 'tryLaser', smash: 'trySmash', dash: 'tryDash' }[slot]]();
  };
  const tick = dt => {
    if (npc) {
      actor.attackCd = Math.max(0, actor.attackCd - dt * actor.enemyLevelAttackSpeedMultiplier);
      // Isolate one selected NPC action without letting it start another.
      if (actor.windup > 0 || actor.dashTime > 0) Neo.updateTRexBoss(actor, dt);
    } else Neo.updateEnemyNativePrimary(dt);
  };
  return { Neo, player, target, actor, hits, shots, statuses, cast, tick };
}

function authorityFixture(level = 1) {
  const events = [];
  const simulation = createCampaignSimulation({ matchSeed: 'trex-kit', floorSeed: 'trex-kit',
    matchRules: { difficulty }, emitEvent: (type, data) => events.push({ type, data }) });
  const state = simulation.state;
  const player = state.players.p1 = createCampaignPlayer({ id: 'p1', characterKey: 'enemy_t_rex', roomId: state.floorState.currentRoomId });
  player.level = level;
  simulation.updateGame({}, 0.05);
  Object.values(state.enemies).forEach(enemy => { enemy.dead = true; enemy.health = 0; });
  const room = state.floorState.layout.rooms.find(room => room.id === player.roomId);
  room.structures = []; room.destructibles = []; room.hazards = [];
  Object.assign(player, { x: 200, y: 350, vx: 0, vy: 0 });
  const target = state.enemies.target = { id: 'target', type: 'hunter', x: 285, y: 350, radius: 14,
    maxHealth: 100000, health: 100000, roomId: player.roomId, moveSpeed: 0, contactDamage: 0,
    spawnTick: state.tick, spawnT: 1000, stunnedUntilTick: state.tick + 1000, level: 1, vx: 0, vy: 0 };
  const cast = (key, slot, angle = 0) => simulation.updateGame({ p1: { aimDirection: angle,
    actions: [{ action: slot === 'melee' ? 'ATTACK' : slot === 'dash' ? 'DASH' : 'ABILITY', abilityId: key, aimDirection: angle }] } }, 0.05);
  return { state, simulation, player, target, events, cast };
}

describe('T-Rex native boss kit', () => {
  test('the authority uses the campaign boss body without a generic evade replacing its charge', () => {
    const updateEnemyProjectileEvade = jest.fn(() => true);
    const updateTRexBoss = jest.fn();
    ai.invokeCampaignEnemyAI({ type: 't_rex', dashTime: 0.5 }, 0.05, { updateEnemyProjectileEvade, updateTRexBoss });
    expect(updateEnemyProjectileEvade).not.toHaveBeenCalled();
    expect(updateTRexBoss).toHaveBeenCalledTimes(1);
  });
  test.each(cases)('%s matches the actual browser NPC at levels 1 and 20', (key, slot, distance) => {
    for (const level of [1, 20]) {
      const npc = fixture(level, distance, true);
      const game = fixture(level, distance);
      npc.cast(slot); game.cast(slot);
      const npcCooldown = slot === 'laser' ? npc.actor.roarCd : npc.actor.attackCd / npc.actor.enemyLevelAttackSpeedMultiplier;
      expect(game.Neo.spendSkillCharge).toHaveBeenCalledWith(slot, npcCooldown);
      expect(game.player.enemyNativePrimary.actor.windup || 0).toBe(npc.actor.windup);
      // Collision damage must stay locked to the charge, even if the cursor turns.
      if (slot === 'dash') {
        game.Neo.angleToMouse = () => Math.PI;
        for (let frame = 0; frame < 58; frame++) { npc.tick(0.01); game.tick(0.01); }
        const speed = Math.max(610, npc.actor.speed * 2);
        expect(attacks.getControlledEnemyMovement(game.player)).toEqual({ vx: speed, vy: 0 });
        npc.target.x = game.target.x = game.player.x + 75;
      }
      for (let frame = 0; frame < 250; frame++) { npc.tick(0.01); game.tick(0.01); }
      expect(game.hits).toEqual(npc.hits);
      expect(game.hits).toHaveLength(1);
      expect(game.statuses).toEqual(npc.statuses);
      if (slot === 'dash') expect(game.statuses).toEqual([{ key: 'bleed', stacks: 3, duration: 5 }]);
      expect(game.shots).toHaveLength(0);
      expect(game.player.inv).toBe(0);
      expect(game.player.enemyNativePrimary).toBeNull();
    }
  });

  test('bite and roar retain their distinct reach and single-target rules', () => {
    const game = fixture(1, 90);
    game.cast('melee');
    expect(game.hits).toHaveLength(0); // 58 + 14 + 18 is the excluded edge.
    game.tick(1);
    game.target.x = 200 + 240;
    game.cast('laser');
    expect(game.hits).toHaveLength(0);
    game.tick(5);
    game.target.x -= 0.01;
    game.Neo.enemies.push({ id: 'behind', hp: 10000, x: 100, y: 350, r: 14 });
    game.cast('laser');
    expect(game.hits).toHaveLength(1);
    expect(game.hits[0].angle).toBe(Math.PI);
    expect(game.Neo.ringBurst).toHaveBeenLastCalledWith(200, 350, 230, '#ffcf72', 0.55);
  });

  test.each([
    [0, 713, 300], [Math.PI, 87, 300], [-Math.PI / 2, 300, 87], [Math.PI / 2, 300, 513],
  ])('charge at angle %s scatters the same ten rocks against custom room bounds', (angle, x, y) => {
    const npc = fixture(20, 400, true), game = fixture(20, 400);
    for (const f of [npc, game]) { f.Neo.ROOM_W = 800; f.Neo.ROOM_H = 600; f.Neo.angleToMouse = () => angle; }
    // Start the raw NPC from the matching charge phase rather than its auto-aim.
    game.cast('dash');
    const liveActor = game.player.enemyNativePrimary.actor;
    for (const actor of [npc.actor, liveActor]) Object.assign(actor, {
      x, y, vx: Math.cos(angle) * 700, vy: Math.sin(angle) * 700,
      windup: 0, dashTime: 0.1, dashAngle: angle, dashHasMoved: true, attackCd: 0.2,
    });
    Object.assign(game.player, { x, y, vx: npc.actor.vx, vy: npc.actor.vy, enemyPrimaryCooldown: 0.1 });
    npc.tick(0.01); game.tick(0.01);
    expect(game.shots).toHaveLength(10);
    npc.shots.forEach((shot, index) => {
      const { enemy, owner, ...descriptor } = shot;
      expect(game.shots[index]).toEqual(expect.objectContaining(descriptor));
      expect(game.shots[index]).toEqual(expect.objectContaining({ enemy: false, nativeEnemyAttack: true, owner: game.player }));
    });
    expect(liveActor.dashTime).toBe(0);
    expect(game.player.vx).toBe(npc.actor.vx);
    expect(game.player.vy).toBe(npc.actor.vy);
    expect(game.player.enemyPrimaryCooldown).toBe(1.4 / liveActor.enemyLevelAttackSpeedMultiplier);
    for (const slot of ['melee', 'dash']) expect(game.Neo.cooldowns[slot].timers).toEqual([game.player.enemyPrimaryCooldown]);
    game.tick(0.01);
    expect(game.shots).toHaveLength(10);
  });

  test('roar has its own cooldown but cannot interrupt a charge; bite shares charge recovery', () => {
    const game = fixture(1, 200);
    game.cast('dash');
    game.cast('laser'); game.cast('melee'); game.cast('dash');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
    for (let frame = 0; frame < 135; frame++) game.tick(0.01);
    game.cast('melee');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
    game.cast('laser');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(2);
    game.cast('laser');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(2);
    game.tick(0.5);
    game.cast('melee');
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(3);
  });

  test('windup and charge ignore steering, stun pauses them and a room change cancels them', () => {
    const game = fixture(1, 400);
    game.cast('dash');
    movement.applyCampaignPlayerVelocity(game.player, { moveX: 1, moveY: 1 }, 0.05, { speed: 10000 });
    expect(game.player.vx).toBe(0);
    expect(game.player.vy).toBe(0);
    game.player.stun = 1;
    game.tick(1);
    expect(game.player.enemyNativePrimary.actor.windup).toBe(0.55);
    game.player.stun = 0;
    game.tick(0.56);
    movement.applyCampaignPlayerVelocity(game.player, { moveX: -1, moveY: 1 }, 0.05, { speed: 10000 });
    expect(game.player.vx).toBe(Math.max(610, game.actor.speed * 2));
    expect(game.player.vy).toBe(0);
    game.Neo.currentRoom.id = 'elsewhere';
    game.tick(0.01);
    expect(game.player.enemyNativePrimary).toBeNull();
    expect(attacks.getControlledEnemyMovement(game.player)).toBeNull();
    expect(game.player.inv).toBe(0);
  });

  test('the unused slot never falls back to a hero smash, including old saved loadouts', () => {
    const game = fixture();
    game.player.equippedMoves.smash = 'hammer_smash';
    expect(game.Neo.getEquippedMove('smash')).toBeNull();
    game.cast('smash');
    expect(game.Neo.spendSkillCharge).not.toHaveBeenCalled();
    expect(game.hits).toHaveLength(0);
    expect(game.shots).toHaveLength(0);
    expect(moves.isMoveAllowedForCharacter('hammer_smash', 'enemy_t_rex')).toBe(false);
    expect(moves.getDefaultMoveLoadout('enemy_t_rex').smash).toBeNull();
  });

  test.each(cases)('%s executes against a real enemy in the authority', (key, slot, distance) => {
    const f = authorityFixture(20);
    f.target.x = f.player.x + distance;
    f.cast(key, slot);
    let bleed = false;
    for (let frame = 0; frame < 60; frame++) {
      f.simulation.updateGame({ p1: { aimDirection: Math.PI } }, 0.05);
      bleed ||= Number(f.target.statuses?.bleed?.stacks || 0) === 3;
    }
    expect(f.target.health).toBeLessThan(100000);
    const direct = f.events.filter(e => e.type === 'ENEMY_HIT' && e.data.enemyId === 'target' && e.data.attackKind === key);
    expect(direct).toHaveLength(1);
    const actor = attacks.getPlayableEnemyAttackActor(f.player, f.player.enemyBodyContext);
    expect(direct[0].data.damage).toBe(slot === 'dash' ? actor.dmg + 22 : slot === 'laser' ? Math.round(actor.dmg * 0.45) : actor.dmg);
    if (slot === 'dash') expect(bleed).toBe(true);
    expect(f.player.enemyNativePrimary).toBeNull();
    expect(Number(f.player.invulnerableUntilTick || 0)).toBeLessThanOrEqual(f.state.tick);
    expect(f.player.equippedWeapon).toBeNull();
    expect(f.player.ownedWeapons).toEqual({});
    expect(f.player.ownedMoves.null).toBeUndefined();
  });

  test('real authority collision emits ten rocks, holds recovery and rejects old hero smashes', () => {
    const f = authorityFixture();
    f.player.y = f.target.y = 150; // Hit solid wall, away from the exit doorway.
    f.player.x = f.state.floorState.width - f.state.floorState.wallThickness - f.player.radius - 45;
    f.target.x = 200;
    f.cast('enemy_t_rex_charge', 'dash');
    for (let frame = 0; frame < 40 && !f.events.some(e => e.data.nativeTRexEffect === 'wall_impact'); frame++) {
      f.simulation.updateGame({}, 0.05);
    }
    const rocks = Object.values(f.state.projectiles).filter(shot => shot.ownerId === 'p1' && shot.kind === 'rock');
    expect(rocks).toHaveLength(10);
    expect(rocks.every(shot => !shot.hostile && shot.nativeEnemyAttack && shot.damage > 0)).toBe(true);
    expect(f.player.enemyNativePrimary.actor.dashTime).toBe(0);
    // updateGame advances state.tick after resolving this frame's impact.
    expect(f.player.attackCooldownUntilTick - (f.state.tick - 1)).toBe(28);
    for (const key of ['enemy_t_rex_primary', 'enemy_t_rex_charge']) {
      expect(f.player.moveChargeState[key].timers).toEqual([f.player.attackCooldownUntilTick]);
    }
    const eventCount = f.events.length;
    f.cast('enemy_t_rex_primary', 'melee');
    f.player.equippedMoves.smash = 'hammer_smash';
    f.cast('hammer_smash', 'smash');
    expect(f.events.slice(eventCount).some(e => e.type === 'PLAYER_ABILITY_USED' && ['enemy_t_rex_primary', 'hammer_smash'].includes(e.data.abilityId))).toBe(false);
  });
});
