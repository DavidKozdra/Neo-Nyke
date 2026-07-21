const { createCampaignMovementSystem } = require('../js/simulation/CampaignSimulation');

describe('authoritative network player stun', () => {
  test('stunned players cannot move even while input is held', () => {
    const system = createCampaignMovementSystem();
    const player = {
      id: 'p1', roomId: '', x: 450, y: 350, vx: 0, vy: 0,
      radius: 18, moveSpeed: 228, stunnedUntilTick: 20,
    };
    const state = {
      tick: 10,
      players: { p1: player },
      floorState: { width: 900, height: 700, wallThickness: 28, doorWidth: 140, layout: { rooms: [] } },
    };
    system({ state, inputs: { p1: { moveX: 1, moveY: 0 } }, fixedDelta: 0.05 });
    expect(player.x).toBe(450);
    expect(player.vx).toBe(0);
  });

  test('network combat owns and projects player stun state', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const combat = fs.readFileSync(path.join(__dirname, '../js/simulation/NetworkCombatSystem.js'), 'utf8');
    const view = fs.readFileSync(path.join(__dirname, '../js/rendering/NetworkGameView.js'), 'utf8');
    expect(combat).toContain('player.stunnedUntilTick = Math.max');
    expect(combat).toContain("player.action = 'stunned'");
    expect(view).toContain('stun: Math.max(0, Number(player.stunnedUntilTick || 0) - serverTick) / 20');
  });
});
