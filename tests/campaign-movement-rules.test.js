const { applyResponsiveVelocity } = require('../js/simulation/CampaignMovementRules');
const { createCampaignMovementSystem, createCampaignFloorState } = require('../js/simulation/CampaignSimulation');
const { GameState } = require('../js/simulation/GameState');

describe('campaign movement rules', () => {
  test('uses the campaign responsive acceleration rule for starts, stops, and turns', () => {
    expect(applyResponsiveVelocity(0, 228, 0.05)).toBeCloseTo(159.6);
    expect(applyResponsiveVelocity(159.6, 228, 0.05)).toBeCloseTo(207.48);
    expect(applyResponsiveVelocity(100, -228, 0.05)).toBeCloseTo(-228);
    expect(applyResponsiveVelocity(3, 0, 0.05)).toBe(0);
  });

  test('shared authority movement applies that same acceleration before advancing position', () => {
    const floorState = createCampaignFloorState({ matchSeed: 'movement', floorSeed: 'movement-floor' });
    const state = new GameState({
      status: 'running', floorState,
      players: { p1: { id: 'p1', x: 450, y: 350, radius: 18, moveSpeed: 228, roomId: floorState.currentRoomId } },
    });
    createCampaignMovementSystem()({ state, inputs: { p1: { moveX: 1 } }, fixedDelta: 0.05 });

    expect(state.players.p1.vx).toBeCloseTo(159.6);
    expect(state.players.p1.x).toBeCloseTo(457.98);
  });
});
