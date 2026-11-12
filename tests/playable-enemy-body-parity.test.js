const fs = require('node:fs');
const vm = require('node:vm');
const content = require('../js/simulation/SharedEnemyContent');
const moves = require('../js/simulation/SharedMoveContent');
const combat = require('../js/simulation/SharedCombatContent');
const scaling = require('../js/simulation/SharedEnemyScalingSystem');
const bodies = require('../js/simulation/SharedEnemyBodySystem');
const attacks = require('../js/simulation/SharedEnemyAttackSystem');
const progression = require('../js/simulation/SharedProgressionSystem');
const items = require('../js/simulation/SharedItemEffectSystem');
const status = require('../js/simulation/SharedStatusSystem');
const { createCampaignPlayer, createCampaignSimulation } = require('../js/simulation/CampaignSimulation');
const { applyNetworkHeroProfile, syncAuthorityPlayableEnemyBodies } = require('../js/simulation/NetworkCombatSystem');

const fixedForms = content.PLAYABLE_ENEMY_ROSTER.filter(def => bodies.getPlayableEnemyBodyDefinition(def.characterKey));
function browser(type, { floor = 1, depth = floor, level = 1, elapsed = 0, difficulty = scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.medium } = {}) {
  const Neo = { chosenCharacter: `enemy_${type}`, floor, floorsEntered: depth, gameElapsedTime: elapsed,
    gameMode: 'normal', MAX_FLOOR: 10, ENEMY_SCALING: scaling.CAMPAIGN_ENEMY_SCALING,
    CHARACTER_DEFS: Object.fromEntries(content.PLAYABLE_ENEMY_ROSTER.map(def => [def.characterKey, { ...def, key: def.characterKey }])),
    BOSS_TYPES: new Set(content.BOSS_ENEMY_TYPES), START_X: 100, START_Y: 350,
    createStatusMap: status.createCampaignStatusMap, getDefaultMovesForCharacter: moves.getDefaultMoveLoadout,
    getDefaultWeaponForCharacter: combat.getCharacterDefaultWeapon,
    getActiveSandboxSettings: () => null, getFloorSeed: () => 'body-test', rand: () => 0.5, nextRandom: () => 0.5,
    getEnemyDifficultyTuning: () => ({ supportPower: difficulty.supportPowerMultiplier }),
  };
  const context = vm.createContext({ Neo, window: {}, NeoNyke: { content, simulation: { ...scaling, ...bodies, ...status, ...progression } } });
  for (const file of ['../js/core/game-state.js', '../js/game/enemies.js']) {
    vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8').replace(/^export /gm, ''), context);
  }
  Neo.getDifficultyDef = () => difficulty;
  Neo.getEnemyDifficultyTuning = () => ({ supportPower: difficulty.supportPowerMultiplier });
  Neo.nextRandom = () => 0.5;
  Neo.rand = () => 0.5;
  Neo.player = Neo.createDefaultPlayer();
  Neo.player.level = level;
  bodies.syncPlayableEnemyBody(Neo.player, Neo.getPlayableEnemyBodyContext());
  const npc = Neo.spawnEnemy(type, 100, 350, false, { collect: true, level: Math.max(depth, level) });
  if (type === 'bulk_golem') {
    Neo.isBlocked = () => false;
    Neo.updateBulkGolemBoss(npc, 0); // Its live AI overrides the catalog spawn speed.
  }
  return { Neo, player: Neo.player, npc };
}

describe('playable enemy bodies', () => {
  test.each(fixedForms.map(def => [def.type]))('%s matches the actual browser NPC spawn body', type => {
    for (const options of [{}, { floor: 4, depth: 14, level: 20, elapsed: 900, difficulty: scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard }]) {
      const { Neo, player, npc } = browser(type, options);
      expect(player.maxHp).toBe(npc.max);
      expect(player.hp).toBe(npc.hp);
      expect(player.r).toBe(npc.r);
      expect(player.moveSpeed).toBe(npc.speed);
      const actor = attacks.getPlayableEnemyAttackActor(player, Neo.getPlayableEnemyBodyContext());
      expect(actor).toEqual(expect.objectContaining({ r: npc.r, max: npc.max, dmg: npc.dmg, speed: npc.speed,
        enemyLevelAttackSpeedMultiplier: npc.enemyLevelAttackSpeedMultiplier }));
      for (const trait of ['bleedImmune', 'fireImmune', 'poisonImmune']) expect(!!player[trait]).toBe(!!npc[trait]);
      expect(Object.values(player.items).some(Boolean)).toBe(false);
      expect(items.deriveCampaignItemStats(player).moveSpeedMultiplier).toBe(1);
    }
  });

  test('healer floor-four health uses the local floor, including after a loop', () => {
    for (const floor of [1, 4]) {
      const game = browser('healer', { floor, depth: 10 + floor });
      const expected = scaling.scaleCampaignEnemyStats({ ...content.ENEMY_CATALOG.healer, maxHealth: floor >= 4 ? 260 : 150 },
        { ...game.Neo.getPlayableEnemyBodyContext(), enemyLevel: 10 + floor });
      expect(game.player.maxHp).toBe(expected.maxHealth);
    }
  });

  test('time does not resize a live body or alter its attacks; level/floor changes preserve damage taken', () => {
    const { Neo, player } = browser('golem', { level: 10 });
    player.hp = Math.round(player.maxHp * 0.4);
    const health = player.hp, maxHp = player.maxHp, speed = player.moveSpeed;
    const actor = attacks.getPlayableEnemyAttackActor(player, Neo.getPlayableEnemyBodyContext());
    Neo.gameElapsedTime = 1800;
    bodies.syncPlayableEnemyBody(player, Neo.getPlayableEnemyBodyContext());
    expect([player.hp, player.maxHp, player.moveSpeed]).toEqual([health, maxHp, speed]);
    expect(attacks.getPlayableEnemyAttackActor(player, Neo.getPlayableEnemyBodyContext()).dmg).toBe(actor.dmg);
    const result = progression.applyCampaignLevelUp(player);
    expect(player.maxHp).toBeGreaterThan(maxHp);
    expect(player.hp / player.maxHp).toBeCloseTo(health / maxHp, 2);
    expect([player.attackPower, player.attackSpeed, result.milestone]).toEqual([0, 1, null]);
    const nextRatio = player.hp / player.maxHp;
    Neo.floor = 4; Neo.floorsEntered = 14;
    bodies.syncPlayableEnemyBody(player, Neo.getPlayableEnemyBodyContext());
    expect(player.hp / player.maxHp).toBeCloseTo(nextRatio, 2);
    player.hp = 0;
    Neo.floor = 5; Neo.floorsEntered = 15;
    bodies.syncPlayableEnemyBody(player, Neo.getPlayableEnemyBodyContext());
    expect(player.hp).toBe(0);
  });

  test('authority synchronizes native speed before movement and preserves collision radius', () => {
    const simulation = createCampaignSimulation({ matchSeed: 'body', floorSeed: 'body', floorNumber: 4,
      matchRules: { difficulty: scaling.CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard } });
    const state = simulation.state;
    const p = state.players.p1 = createCampaignPlayer({ id: 'p1', characterKey: 'enemy_healer', roomId: state.floorState.currentRoomId, x: 450, y: 350 });
    const expected = scaling.scaleCampaignEnemyStats(content.getEnemyDefinition('healer', { floorNumber: 4 }), {
      enemyLevel: 4, progressionDepth: 4, difficulty: state.matchRules.difficulty,
    });
    simulation.updateGame({ p1: { moveX: 1, moveY: 0 } }, 0.05);
    expect(p.maxHp).toBe(expected.maxHealth);
    expect(p.moveSpeed).toBe(expected.moveSpeed);
    expect(p.radius).toBe(19);
    // The common controller reaches 70% of desired speed on its first tick.
    expect(p.vx).toBeCloseTo(expected.moveSpeed * 0.7);
    expect(p.x).toBeCloseTo(450 + expected.moveSpeed * 0.7 * 0.05);
  });

  test('party scaling and loop depth affect body and attack stats together', () => {
    const simulation = createCampaignSimulation({ matchSeed: 'party-body', floorSeed: 'party-body' });
    const state = simulation.state;
    state.floorNumber = 4; state.floorsEntered = 14;
    const p = state.players.p1 = createCampaignPlayer({ id: 'p1', characterKey: 'enemy_golem' });
    state.players.p2 = createCampaignPlayer({ id: 'p2', characterKey: 'thorn_knight' });
    state.players.p2.level = 20;
    syncAuthorityPlayableEnemyBodies(state);
    const expected = scaling.scaleCampaignEnemyStats(content.ENEMY_CATALOG.golem,
      { progressionDepth: 14, enemyLevel: 20, partySize: 2 });
    expect(p.maxHp).toBe(expected.maxHealth);
    expect(p.enemyBody.contactDamage).toBe(expected.contactDamage);
    expect(p.enemyBody.level).toBe(20);
  });

  test('native immunities block statuses and character swaps clear them', () => {
    const p = createCampaignPlayer({ characterKey: 'enemy_golem' });
    status.applyCampaignStatus(p, 'bleed', 4, 5);
    expect(p.statuses.bleed.stacks).toBe(0);
    applyNetworkHeroProfile(p, 'enemy_handsome_devil');
    expect(p.bleedImmune).toBeUndefined();
    status.applyCampaignStatus(p, 'fire', 4, 5);
    expect(p.statuses.fire.stacks).toBe(0);
    applyNetworkHeroProfile(p, 'enemy_god');
    expect(p.statusResistances).toEqual(content.ENEMY_CATALOG.god.statusResistances);
    applyNetworkHeroProfile(p, 'thorn_knight');
    expect(p.enemyBody).toBeUndefined();
    expect(p.statusResistances).toBeUndefined();
    expect(p.radius).toBe(14);
    expect(p.items.neo_knife).toBe(1);
  });

  test('native bodies take consecutive hits and lethal damage without hero protection', () => {
    const simulation = createCampaignSimulation({ matchSeed: 'native-hurt', floorSeed: 'native-hurt' });
    const state = simulation.state;
    const p = state.players.p1 = createCampaignPlayer({ id: 'p1', characterKey: 'enemy_golem', roomId: state.floorState.currentRoomId });
    simulation.updateGame({}, 0.05);
    Object.values(state.enemies).forEach(enemy => { enemy.dead = true; enemy.health = 0; });
    const shot = (id, damage) => {
      state.projectiles[id] = { id, hostile: true, ownerId: 'enemy-test', roomId: p.roomId,
        x: p.x, y: p.y, vx: 0, vy: 0, radius: 8, damage, attackKind: 'test_volley', expiresTick: state.tick + 10 };
    };
    const before = p.hp;
    shot('first', 5); shot('second', 5);
    simulation.updateGame({}, 0.05);
    expect(p.hp).toBeCloseTo(before - 10);
    expect(Number(p.invulnerableUntilTick || 0)).toBeLessThanOrEqual(state.tick);
    shot('lethal', p.maxHp * 10);
    simulation.updateGame({}, 0.05);
    expect(p.hp).toBe(0);
    expect(p.downed).toBe(true);
  });

  test('normal heroes keep their own starter inventories and level gains', () => {
    for (const key of ['knave', 'mooggy', 'thorn_knight']) {
      const p = createCampaignPlayer({ characterKey: key });
      expect(p.items).toEqual(combat.CHARACTER_STARTING_ITEMS[key]);
      expect(p.enemyBody).toBeUndefined();
      const before = p.maxHp;
      progression.applyCampaignLevelUp(p);
      expect(p.maxHp).toBeGreaterThan(before);
    }
  });
});
