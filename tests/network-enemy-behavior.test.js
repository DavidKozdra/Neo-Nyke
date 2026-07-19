const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { RandomService } = require('../js/simulation/RandomService');
const { createNetworkFloorState } = require('../js/multiplayer/LocalMultiplayerSession');
const { getEnemyDefinition, ENEMY_CATALOG } = require('../js/simulation/SharedEnemyContent');
const { createCampaignEnemyBehaviors } = require('../js/simulation/SharedEnemyBehaviorSystem');
const { applyNetworkHeroProfile, createNetworkCombatSystem } = require('../js/simulation/NetworkCombatSystem');

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
  });

  test('healers mend wounded allies on the campaign cadence', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    injectEnemy(state, 'healer', player.x + 400, player.y, { supportCd: 0.01, attackCd: 9 });
    const wounded = injectEnemy(state, 'golem', player.x + 420, player.y + 40, { health: 40, attackCd: 9 });

    tick(simulation, 2);
    expect(wounded.health).toBeGreaterThan(40);
    expect(events.some(event => event.eventType === 'ENEMY_HEALED' && event.data.enemyId === wounded.id)).toBe(true);
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
    const catalogHealth = Number(ENEMY_CATALOG[boss.type].maxHealth);
    expect(boss.health).toBe(Math.round(catalogHealth * 0.72));
    expect(events.some(event => event.eventType === 'ENEMY_SPAWNED' && event.data.enemyId === boss.id && event.data.boss)).toBe(true);
  });

  test('hunters attack on a cooldown — no walk-over contact damage', () => {
    const { state, events, simulation } = behaviorHarness();
    const player = state.players.p1;
    injectEnemy(state, 'hunter', player.x + 30, player.y);

    tick(simulation, 10); // 0.5s adjacent to the player
    const hits = events.filter(event => event.eventType === 'PLAYER_HIT' && event.data.attackKind === 'hunter');
    expect(hits.length).toBe(1); // one authored swing, then the 1.05s cooldown
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
    injectEnemy(state, 'handsome_devil', player.x + 300, player.y, {
      phase: 1, spikeCd: 0.01, lavaGridCd: 0.01, devilLaserCd: 9, clawCd: 9, giantLaserCd: 99, attackCd: 9, beamRange: 560,
    });

    tick(simulation, 2);
    const room = state.floorState.layout.rooms.find(candidate => candidate.id === player.roomId);
    expect((room.hazards || []).filter(hazard => hazard.kind === 'red_spikes').length).toBe(5);
    expect((room.hazards || []).filter(hazard => hazard.kind === 'lava' && hazard.enemy).length).toBe(5);
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
    const enemy = injectEnemy(state, 'hunter', player.x + 60, player.y, { attackCd: 9 });
    const startX = enemy.x;

    // Fire blood_beam straight at the enemy (+x) and let it tick.
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 }] } }, 0.05);
    for (let step = 0; step < 3; step += 1) {
      simulation.updateGame({ p1: { moveX: 0, moveY: 0, aimDirection: 0, buttons: 1 } }, 0.05);
    }
    // Enemy shoved forward (+x) by the beam knockback, not standing still.
    expect(enemy.x).toBeGreaterThan(startX + 5);
    // The ENEMY_HIT events carry an impact weight for the client's screenshake.
    expect(events.some(event => event.eventType === 'ENEMY_HIT' && Number(event.data.knockback) > 0)).toBe(true);
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
    delete state.floorState.encounters[room.id];

    const { ensureNetworkEncounter } = require('../js/simulation/NetworkCombatSystem');
    const random = new (require('../js/simulation/RandomService').RandomService)({ matchSeed: 'mirror' });
    ensureNetworkEncounter(state, random, (t, d) => events.push({ eventType: t, data: d }), room.id);

    const champion = Object.values(state.enemies).find(enemy => enemy.type === 'mirror_knight' && !enemy.dead);
    expect(champion).toBeTruthy();
    expect(champion.mirrorMoves).toEqual(player.equippedMoves);
    expect(champion.mirrorWeapon).toBe('thorns_bleed_blade');
    expect(champion.maxHealth).toBe(260); // mirrors the source hero's HP
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

  test('rivals arm a party-wide curse on the next floor', () => {
    const { state } = behaviorHarness();
    queuePartyRivalCurse(state, 'metao', { descended: false });
    queuePartyRivalCurse(state, 'gelleh', { descended: true });
    expect(state.pendingRivalCurses.reducePotions).toBe(true);
    expect(state.pendingRivalCurses.gellehTurrets).toBe(4);
  });
});
