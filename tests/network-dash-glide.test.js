const { FIXED_DELTA_SECONDS } = require('../js/simulation/GameSimulation');
const { createCampaignSimulation, createCampaignPlayer } = require('../js/simulation/CampaignSimulation');
const {
  isCampaignPlayerDashing,
  applyCampaignDashVelocity,
  getCampaignPlayerMovementSpeed,
} = require('../js/simulation/CampaignMovementRules');

function dashRun() {
  const simulation = createCampaignSimulation({
    matchId: 'dash-run',
    matchSeed: 'dash-seed',
    floorSeed: 'dash-seed|floor:1',
    contentVersion: 'dash-parity',
  });
  simulation.state.players.p1 = createCampaignPlayer({
    id: 'p1', characterKey: 'thorn_knight', roomId: simulation.state.floorState.currentRoomId,
  });
  return simulation;
}

describe('dash is a velocity glide, not a teleport', () => {
  test('a dashing player glides at its locked velocity and ignores input', () => {
    const simulation = dashRun();
    const player = simulation.state.players.p1;
    // Center of the room so the glide has room to travel.
    player.x = 450;
    player.y = 350;
    player.dashUntilTick = simulation.state.tick + 4; // ~0.2s glide
    player.dashVx = 300;
    player.dashVy = 0;

    const startX = player.x;
    // Feed opposing input; the glide must win while dashing.
    for (let step = 0; step < 3; step += 1) {
      simulation.updateGame({ p1: { moveX: -1, moveY: 0 } }, FIXED_DELTA_SECONDS);
    }
    expect(player.x).toBeGreaterThan(startX + 30); // moved forward, not backward
  });

  test('the glide expires and input control returns', () => {
    const simulation = dashRun();
    const player = simulation.state.players.p1;
    player.x = 450;
    player.y = 350;
    player.dashUntilTick = simulation.state.tick + 2;
    player.dashVx = 300;
    player.dashVy = 0;

    for (let step = 0; step < 8; step += 1) {
      simulation.updateGame({ p1: { moveX: 0, moveY: 0 } }, FIXED_DELTA_SECONDS);
    }
    // Dash window cleared, and the idle input decelerated the hero to a stop.
    expect(player.dashUntilTick).toBe(0);
    expect(Math.abs(player.vx)).toBeLessThan(20);
  });

  test('the shared dash helpers agree for authority and client prediction', () => {
    const player = { dashUntilTick: 10, dashVx: 250, dashVy: -120 };
    expect(isCampaignPlayerDashing(player, 5)).toBe(true);
    expect(isCampaignPlayerDashing(player, 10)).toBe(false);
    applyCampaignDashVelocity(player);
    expect(player.vx).toBe(250);
    expect(player.vy).toBe(-120);
    // Movement speed is unaffected by the dash fields (glide bypasses it).
    expect(getCampaignPlayerMovementSpeed({ moveSpeed: 228 }, 0)).toBeCloseTo(228);
  });
});
