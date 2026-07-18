const { FIXED_DELTA_SECONDS } = require('../js/simulation/GameSimulation');
const {
  createCampaignSimulation,
  createCampaignPlayer,
} = require('../js/simulation/CampaignSimulation');
const { OfflineGameSession } = require('../js/multiplayer/OfflineGameSession');

function createRun(seed = 'campaign-parity-seed') {
  const simulation = createCampaignSimulation({
    matchId: 'parity-run',
    matchSeed: seed,
    floorSeed: `${seed}|floor:1`,
    contentVersion: 'campaign-parity',
  });
  simulation.state.players.p1 = createCampaignPlayer({
    id: 'p1', characterKey: 'princess', roomId: simulation.state.floorState.currentRoomId,
  });
  return simulation;
}

describe('shared campaign simulation', () => {
  test('uses the same deterministic campaign rules for independent authorities', () => {
    const offlineAuthority = createRun();
    const networkAuthority = createRun();

    for (let tick = 0; tick < 20; tick += 1) {
      const input = { p1: { moveX: tick < 10 ? 1 : -1, moveY: tick % 3 === 0 ? 0.25 : 0 } };
      offlineAuthority.updateGame(input, FIXED_DELTA_SECONDS);
      networkAuthority.updateGame(input, FIXED_DELTA_SECONDS);
    }

    expect(offlineAuthority.serialize()).toBe(networkAuthority.serialize());
  });

  test('offline sessions create a playable campaign authority with a local hero', async () => {
    const session = new OfflineGameSession();
    await session.initialize();
    session.beginRun({ matchSeed: 'offline-campaign', characterKey: 'gelleh' });
    session.advance({ 'offline-player': { moveX: 1 } });

    expect(session.snapshot()).toEqual(expect.objectContaining({
      status: 'running',
      players: {
        'offline-player': expect.objectContaining({ characterKey: 'gelleh', roomId: expect.any(String) }),
      },
    }));
    expect(session.gameplayEvents.length).toBeGreaterThan(0);
    await session.dispose();
  });
});
