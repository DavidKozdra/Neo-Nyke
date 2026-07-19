const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { RandomService } = require('../js/simulation/RandomService');
const { createNetworkFloorState } = require('../js/multiplayer/LocalMultiplayerSession');
const { BEAM_CHANNEL_PROFILES, steerBeamChannelAngle } = require('../js/simulation/SharedMoveContent');
const { getCampaignPlayerMovementSpeed } = require('../js/simulation/CampaignMovementRules');
const { applyNetworkHeroProfile, createNetworkCombatSystem } = require('../js/simulation/NetworkCombatSystem');

function beamHarness(characterKey = 'thorn_knight') {
  const state = new GameState({
    matchId: 'beam-test',
    matchSeed: 'beam-test-seed',
    floorSeed: 'beam-test-floor',
    status: 'running',
    floorState: createNetworkFloorState({ matchSeed: 'beam-test-seed', floorSeed: 'beam-test-floor' }),
    players: {
      p1: {
        id: 'p1', characterKey, roomId: 'room-4-4', x: 300, y: 350, radius: 18, moveSpeed: 228,
        maxHp: 100, hp: 100, coins: 0, action: 'idle', attackCooldownUntilTick: 0,
      },
    },
  });
  state.players.p1.roomId = state.floorState.currentRoomId;
  applyNetworkHeroProfile(state.players.p1, characterKey);
  const random = new RandomService({ matchSeed: state.matchSeed });
  const events = [];
  const system = createNetworkCombatSystem({ emitEvent: (eventType, data) => events.push({ eventType, data }) });
  const simulation = new GameSimulation({ state, randomService: random, systems: [system] });
  return { state, events, simulation };
}

function stillEnemyNextTo(state, distance = 80) {
  const enemy = Object.values(state.enemies)[0];
  enemy.x = state.players.p1.x + distance;
  enemy.y = state.players.p1.y;
  enemy.moveSpeed = 0;
  return enemy;
}

describe('channelled laser beams (multiplayer parity)', () => {
  test('a beam cast opens a channel instead of resolving instantly', () => {
    const { state, simulation } = beamHarness();
    simulation.updateGame({}, 0.05);
    stillEnemyNextTo(state);

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 }] } }, 0.05);

    const channel = state.players.p1.beamChannel;
    expect(channel).toEqual(expect.objectContaining({ moveKey: 'blood_beam', angle: 0 }));
    // 0.58s campaign channel at 20 Hz.
    expect(channel.untilTick - channel.startTick).toBe(Math.round(0.58 * 20));
  });

  test('the channel deals repeated damage ticks, not a single hit', () => {
    const { state, simulation } = beamHarness();
    simulation.updateGame({}, 0.05);
    const enemy = stillEnemyNextTo(state);
    enemy.health = 10000;
    enemy.maxHealth = 10000;

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 }] } }, 0.05);
    const afterFirstTick = enemy.health;
    expect(afterFirstTick).toBeLessThan(10000);
    for (let tick = 0; tick < 16; tick += 1) simulation.updateGame({}, 0.05);
    expect(enemy.health).toBeLessThan(afterFirstTick);
    // 0.58s at 20 Hz — the channel has expired by now.
    expect(state.players.p1.beamChannel).toBeFalsy();
  });

  test('the beam steers toward the player aim stream while channelling', () => {
    const { state, simulation } = beamHarness();
    simulation.updateGame({}, 0.05);
    stillEnemyNextTo(state);

    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 }] } }, 0.05);
    for (let tick = 0; tick < 6; tick += 1) {
      simulation.updateGame({ p1: { moveX: 0, moveY: 0, aimDirection: Math.PI / 2 } }, 0.05);
    }

    const channel = state.players.p1.beamChannel;
    expect(channel).toBeTruthy();
    // 3.5 rad/s for 0.3s of aim input — partway toward the new aim, exactly
    // like the campaign's turn-rate-limited beam.
    expect(channel.angle).toBeGreaterThan(0.9);
    expect(channel.angle).toBeLessThanOrEqual(Math.PI / 2 + 1e-6);
  });

  test('releasing the held button ends the channel and starts the cooldown from the release tick', () => {
    const { state, simulation } = beamHarness();
    simulation.updateGame({}, 0.05);
    stillEnemyNextTo(state);

    simulation.updateGame({ p1: { buttons: 1, actions: [{ action: 'ABILITY', abilityId: 'blood_beam', aimDirection: 0 }] } }, 0.05);
    simulation.updateGame({ p1: { buttons: 1 } }, 0.05);
    expect(state.players.p1.beamChannel).toBeTruthy();
    simulation.updateGame({ p1: { buttons: 0 } }, 0.05);

    expect(state.players.p1.beamChannel).toBeFalsy();
    const cooldownTicks = Math.ceil(3.0 * 20);
    expect(state.players.p1.moveCooldownUntilTick.blood_beam)
      .toBeLessThanOrEqual(state.tick + cooldownTicks);
  });

  test('turtle wave drains HP per second and refuses to cast at 1 HP', () => {
    const { state, simulation } = beamHarness('turtle_boy');
    simulation.updateGame({}, 0.05);
    stillEnemyNextTo(state);
    const player = state.players.p1;
    player.hp = 1;
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'turtle_wave', aimDirection: 0 }] } }, 0.05);
    expect(player.beamChannel).toBeFalsy();

    player.hp = 50;
    simulation.updateGame({ p1: { actions: [{ action: 'ABILITY', abilityId: 'turtle_wave', aimDirection: 0 }] } }, 0.05);
    expect(player.beamChannel).toEqual(expect.objectContaining({ moveKey: 'turtle_wave' }));
    for (let tick = 0; tick < 21; tick += 1) simulation.updateGame({}, 0.05);
    expect(player.hp).toBeLessThan(50);
  });

  test('channelling slows movement like the campaign laser slow', () => {
    const player = { moveSpeed: 228, itemStats: {} };
    expect(getCampaignPlayerMovementSpeed(player, 0)).toBeCloseTo(228);
    player.beamChannel = { moveKey: 'blood_beam' };
    expect(getCampaignPlayerMovementSpeed(player, 0)).toBeCloseTo(228 * 0.4);
  });

  test('steerBeamChannelAngle turns at 3.5 rad/s and takes the short way around', () => {
    expect(steerBeamChannelAngle('blood_beam', 0, Math.PI / 2, 0.1)).toBeCloseTo(0.35);
    // -3 to +3 wraps across ±π: only 2π−6 ≈ 0.283 rad apart, under the max step.
    expect(steerBeamChannelAngle('blood_beam', -3, 3, 0.1)).toBeCloseTo(-3 - (Math.PI * 2 - 6));
    expect(steerBeamChannelAngle('god_sweep', 1, 0, 0.1, { sweepDirection: -1 })).toBeCloseTo(1 - 0.46);
    expect(BEAM_CHANNEL_PROFILES.god_sweep.sweep).toBe(4.6);
  });
});
