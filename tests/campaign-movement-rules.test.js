const { applyResponsiveVelocity, resolveCampaignMovementInput } = require('../js/simulation/CampaignMovementRules');
const { createCampaignMovementSystem, createCampaignFloorState } = require('../js/simulation/CampaignSimulation');
const { GameState } = require('../js/simulation/GameState');

describe('campaign movement rules', () => {
  test('shares normalized free movement between world and camera-relative 3D controls', () => {
    const diagonal = resolveCampaignMovementInput(1, -1);
    expect(Math.hypot(diagonal.moveX, diagonal.moveY)).toBeCloseTo(1);
    expect(resolveCampaignMovementInput(0, -1, 0)).toEqual({ moveX: 1, moveY: 0 });
    const turned = resolveCampaignMovementInput(0, -1, Math.PI / 2);
    expect(turned.moveX).toBeCloseTo(0);
    expect(turned.moveY).toBeCloseTo(1);
  });

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
