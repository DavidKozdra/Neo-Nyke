const fs = require('node:fs');
const vm = require('node:vm');
const content = require('../js/simulation/SharedEnemyContent');
const moves = require('../js/simulation/SharedMoveContent');
const scaling = require('../js/simulation/SharedEnemyScalingSystem');
const attacks = require('../js/simulation/SharedEnemyAttackSystem');
const behaviors = require('../js/simulation/SharedEnemyBehaviorSystem');
const { createCampaignSimulation, createCampaignPlayer } = require('../js/simulation/CampaignSimulation');

const cases = [
  ['hunter', 'updateHunterEnemy', 28, 'contact', 1, 0],
  ['shield_unit', 'updateShieldUnitEnemy', 28, 'contact', 1, 0],
  ['cult_follower', 'updateHunterEnemy', 28, 'contact', 1, 0],
  ['knave', 'updateKnaveEnemy', 60, 'blade', 1, 5],
  ['sniper', 'updateSniperEnemy', 300, 'sniper_round', 1, 5],
  ['machine_gunner', 'updateMachineGunnerEnemy', 300, 'machine_round', 5, 2],
  ['golem', 'updateGolemEnemy', 600, 'golem_spit', 1, 4],
  ['laser', 'updateLaserEnemy', 300, 'beam', 0, 0],
  ['cult_mage', 'updateCultMageEnemy', 300, 'beam', 0, 0],
  ['summoner', 'updateSummonerEnemy', 300, 'beam', 0, 0],
  ['healer', 'updateHealerEnemy', 300, 'beam', 0, 0],
  ['boss_spawner', 'updateBossSpawnerEnemy', 300, 'beam', 0, 0],
];
const tuningFor = (difficulty = scaling.DEFAULT_CAMPAIGN_ENEMY_DIFFICULTY) => ({ reaction: difficulty.enemyReactionMultiplier,
  rangedCadence: difficulty.rangedCadenceMultiplier, supportPower: difficulty.supportPowerMultiplier });

function browser(type, level, difficulty, distance) {
  const shots = [], hits = [];
  const player = { character: `enemy_${type}`, x: 100, y: 350, r: 14, hp: 500, level, cowardsWayTime: 0,
    equippedMoves: moves.getDefaultMoveLoadout(`enemy_${type}`), equippedWeapon: 'magenta_p90' };
  const target = { id: 'target', x: 100 + distance, y: 350, r: 14, hp: 10000 };
  const Neo = { player, enemies: [target], floor: 1, currentRoom: { id: 'room' },
    MOVE_DEFS: Object.fromEntries(Object.entries(moves.MOVE_SLOT_KEYS).flatMap(([slot, keys]) => keys.map(key => [key, { slot }]))),
    getDifficultyDef: () => difficulty, getEnemyDifficultyTuning: () => tuningFor(difficulty),
    getProgressionDepth: () => 1, gameElapsedTime: 0, gameMode: 'normal', MAX_FLOOR: 10,
    getItemStats: () => ({ projectileSpeedMultiplier: 9, meleeDamageMultiplier: 9 }),
    spendSkillCharge: jest.fn(() => true), ringBurst: jest.fn(), angleToMouse: () => 0,
    rng: () => 0.5, spawnProjectile: shot => shots.push(shot),
    scaleEnemyLaserDamage: damage => scaling.scaleCampaignEnemyLaserDamage(damage, difficulty),
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/game/combat.js'), 'utf8'), {
    Neo, NeoNyke: { content, simulation: { ...scaling, ...attacks, ...behaviors } }, window: {},
  });
  Neo.hitEnemy = (enemy, damage, angle, knockback, _color, options) => hits.push({ id: enemy.id, damage, angle, knockback, options });
  return { Neo, player, target, shots, hits };
}

function npcFixture(actor, target, update, difficulty, roll = 0.5) {
  const shots = [], hits = [];
  const npc = { ...actor, hp: actor.max, attackCd: 0, windup: 0, beamTime: 0,
    npcSignatureCd: 3600, novaCd: 3600, summonCd: 3600, supportCd: 3600, shoveCd: 3600, bossSpawnTimer: 3600 };
  const controller = behaviors.createCampaignEnemyBehaviors({
    getPlayer: () => target, getPlayers: () => [target], getTuning: () => tuningFor(difficulty),
    random: () => roll, spawnProjectile: (_enemy, shot) => shots.push(shot),
    damagePlayer: (_enemy, player, damage, angle, knockback) => hits.push({ id: player.id, damage, angle, knockback }),
    scaleEnemyLaserDamage: damage => scaling.scaleCampaignEnemyLaserDamage(damage, difficulty),
  });
  return { npc, shots, hits, tick: dt => controller[update](npc, dt) };
}

describe('native playable enemy primaries', () => {
  test.each(cases)('%s browser primary matches the actual NPC state machine', (type, update, distance, kind, count, bonus) => {
    for (const [level, difficultyKey] of [[1, 'easy'], [20, 'hard']]) {
      const difficulty = scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS[difficultyKey];
      const game = browser(type, level, difficulty, distance);
      const actor = attacks.getPlayableEnemyAttackActor(game.player, { difficulty, progressionDepth: 1 });
      const npc = npcFixture(actor, game.target, update, difficulty);
      npc.tick(0);
      game.Neo.tryMelee();
      expect(game.Neo.getEquippedMove('melee')).toBe(`enemy_${type}_primary`);
      // A legacy hero weapon or item cannot substitute its attack or boost it.
      expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
      for (let tick = 0; tick < 300; tick++) {
        npc.tick(0.01);
        game.Neo.updateEnemyNativePrimary(0.01);
        expect(game.shots.length).toBe(npc.shots.length);
        expect(game.hits.length).toBe(npc.hits.length);
      }
      if (kind === 'beam') expect(game.hits.length).toBeGreaterThanOrEqual(4);
      else if (kind === 'contact' || kind === 'blade') expect(game.hits).toHaveLength(count);
      else expect(game.shots).toHaveLength(type === 'machine_gunner' && tuningFor(difficulty).supportPower >= 1.22 ? 6 : count);
      game.shots.forEach((shot, i) => {
        expect(shot).toEqual(expect.objectContaining(npc.shots[i]));
        expect(shot.kind).toBe(kind);
        expect(shot.damage).toBe(actor.dmg + bonus);
        expect(shot.nativeEnemyAttack).toBe(true);
      });
      game.hits.forEach((hit, i) => {
        expect(hit).toEqual(expect.objectContaining(npc.hits[i]));
        expect(hit.options).toEqual(expect.objectContaining({ rawDamage: true, canCrit: false, nativeEnemyAttack: true }));
      });
      expect(game.player.enemyNativePrimary).toBeNull();
      expect(game.Neo.getDisplayDamage(`enemy_${type}_primary`, 'move').min).toBe(
        kind === 'beam' ? game.hits[0].damage : actor.dmg + bonus);
      const nativeTiming = attacks.getEnemyNativePrimaryTiming(type, tuningFor(difficulty), actor.enemyLevelAttackSpeedMultiplier);
      expect(game.Neo.spendSkillCharge).toHaveBeenCalledWith('melee', nativeTiming.cooldown);
    }
  });

  test.each(cases.filter(entry => entry[3] === 'beam'))('%s preserves the NPC beam aiming error', (type, update) => {
    const difficulty = scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard;
    const actor = attacks.getPlayableEnemyAttackActor({ character: `enemy_${type}`, level: 20 });
    const npc = npcFixture(actor, { x: 300, y: 0, r: 14 }, update, difficulty, 0.1);
    npc.tick(0);
    const controlled = behaviors.createCampaignEnemyBehaviors({ getTuning: () => tuningFor(difficulty), random: () => 0.1 });
    controlled.startControlledEnemyPrimary(actor, 0);
    expect(actor.beamAngle).toBe(npc.npc.beamAngle);
    expect(actor.beamAimBias).toBe(npc.npc.beamAimBias);
  });

  test('enemy forms stay distinct from the Knave and Mooggy heroes', () => {
    for (const character of ['knave', 'mooggy', 'thorn_knight']) {
      expect(attacks.getPlayableEnemyPrimary(character)).toBeNull();
      expect(attacks.getPlayableEnemyAttackActor({ character, level: 20 })).toBeNull();
      for (const def of Object.values(content.ENEMY_NATIVE_PRIMARIES)) {
        expect(moves.isMoveAllowedForCharacter(def.key, character)).toBe(false);
      }
    }
    expect(moves.getDefaultMoveLoadout('knave').melee).toBe('knave_blade');
    expect(moves.getDefaultMoveLoadout('enemy_knave').melee).toBe('enemy_knave_primary');
  });

  test('native attacks pause on stun, cannot overlap, cancel across rooms, and cannot hit behind the aim', () => {
    const game = browser('knave', 1, scaling.DEFAULT_CAMPAIGN_ENEMY_DIFFICULTY, 60);
    game.target.x = 40;
    game.Neo.tryMelee();
    game.Neo.tryMelee();
    expect(game.Neo.spendSkillCharge).toHaveBeenCalledTimes(1);
    game.player.stun = 1;
    game.Neo.updateEnemyNativePrimary(1);
    expect(game.player.enemyNativePrimary.actor.windup).toBe(0.28);
    game.player.stun = 0;
    for (let i = 0; i < 60; i++) game.Neo.updateEnemyNativePrimary(0.01);
    expect(game.hits).toHaveLength(0);
    game.Neo.updateEnemyNativePrimary(2);
    game.Neo.tryMelee();
    game.Neo.currentRoom.id = 'elsewhere';
    game.Neo.updateEnemyNativePrimary(1);
    expect(game.player.enemyNativePrimary).toBeNull();
    expect(game.hits).toHaveLength(0);
  });

  test.each(cases)('%s authority uses native attacks rather than equipped hero weapons', (type, _update, distance, kind, count, bonus) => {
    const hits = [];
    const simulation = createCampaignSimulation({ matchId: 'native', matchSeed: 'native', floorSeed: 'native|1',
      emitEvent: (eventType, data) => { if (eventType === 'ENEMY_HIT' && data.enemyId === 'target') hits.push(data); } });
    const state = simulation.state;
    const player = state.players.p1 = createCampaignPlayer({ id: 'p1', characterKey: `enemy_${type}`, roomId: state.floorState.currentRoomId });
    player.x = 100; player.y = 350; player.level = 20;
    player.items.dino_tooth = 3; // Global damage/crit bonuses must not alter native attacks.
    simulation.updateGame({ p1: {} }, 0.05);
    Object.values(state.enemies).forEach(enemy => { enemy.dead = true; enemy.health = 0; });
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    room.structures = []; room.destructibles = []; room.hazards = [];
    // A durable stationary target exercises actual hit resolution and beam ticks.
    const target = state.enemies.target = { id: 'target', type: 'hunter', x: 100 + (kind === 'beam' ? 80 : Math.min(distance, 300)), y: 350,
      radius: 14, health: 100000, maxHealth: 100000, roomId: player.roomId, contactDamage: 0,
      spawnTick: state.tick, stunnedUntilTick: state.tick + 1000, spawnT: 1000, vx: 0, vy: 0, level: 1 };
    const seen = new Map();
    let beamSeen = false;
    const input = { aimDirection: 0, actions: [{ action: 'ATTACK', aimDirection: 0 }] };
    simulation.updateGame({ p1: input }, 0.05);
    const actor = player.enemyNativePrimary?.actor || attacks.getPlayableEnemyAttackActor(player, { difficulty: state.matchRules.difficulty });
    const expectedCooldown = attacks.getEnemyNativePrimaryTiming(type, tuningFor(state.matchRules.difficulty), actor.enemyLevelAttackSpeedMultiplier).cooldown;
    expect(player.attackCooldownUntilTick - state.tick).toBe(Math.ceil(expectedCooldown * 20) - 1);
    for (let tick = 0; tick < 50; tick++) {
      Object.values(state.projectiles).filter(shot => shot.ownerId === player.id).forEach(shot => seen.set(shot.id, { ...shot }));
      beamSeen ||= !!player.beamChannel?.nativeEnemyAttack;
      simulation.updateGame({ p1: { aimDirection: 0 } }, 0.05);
    }
    if (kind === 'beam') {
      expect(beamSeen).toBe(true);
      expect(target.health).toBeLessThan(100000);
      expect(player.beamChannel).toBeNull();
    } else if (['contact', 'blade'].includes(kind)) {
      expect(100000 - target.health).toBe(actor.dmg + bonus);
      expect(seen.size).toBe(0);
    } else {
      expect(seen.size).toBe(type === 'machine_gunner' && tuningFor(state.matchRules.difficulty).supportPower >= 1.22 ? 6 : count);
      const speeds = { sniper: 360 * Math.min(1.4, tuningFor(state.matchRules.difficulty).reaction),
        machine_gunner: 300 * Math.min(1.45, tuningFor(state.matchRules.difficulty).reaction + 0.06), golem: 300 };
      const speedScale = scaling.getCampaignEnemyProjectileSpeedMultiplier(state.matchRules.difficulty);
      for (const shot of seen.values()) {
        expect(shot.kind).toBe(kind);
        expect(shot.damage).toBe(actor.dmg + bonus);
        expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(speeds[type] * speedScale);
        expect(shot.nativeEnemyAttack).toBe(true);
        expect(shot.knockback).toBe(120);
      }
      const directDamage = hits.filter(hit => hit.attackKind !== 'poison').reduce((sum, hit) => sum + hit.damage, 0);
      expect(directDamage).toBeLessThanOrEqual(seen.size * (actor.dmg + bonus));
      if (type === 'golem') {
        expect([...seen.values()][0].statusEffects).toEqual([{ key: 'poison', chance: 1, stacks: 1, duration: 4.2 }]);
        expect(hits.some(hit => hit.attackKind === 'poison')).toBe(true);
      }
    }
    expect(player.enemyNativePrimary).toBeNull();
    expect(player.equippedWeapon).toBeNull();
  });
});
