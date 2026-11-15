const {
  resolveCampaignDashBurst,
  resolveCampaignBlinkDestination,
  resolveCampaignNimrodStomp,
  getCampaignNearestEnemyForAim,
  resolveCampaignControlAim,
} = require('../js/simulation/CampaignMovementRules');

describe('campaign movement rules', () => {
  test('automatic aim skips dead enemies and enemies in other rooms', () => {
    const player = { x: 100, y: 100, roomId: 'room-1' };
    const target = { x: 100, y: 140, roomId: 'room-1' };
    const enemies = [
      null,
      { x: 101, y: 100, dead: true, roomId: 'room-1' },
      { x: 100, y: 101, roomId: 'room-2' },
      { x: 250, y: 100, roomId: 'room-1' },
      target,
    ];

    expect(getCampaignNearestEnemyForAim(player, enemies)).toBe(target);
    for (const inputMode of ['touch', 'gamepad']) {
      expect(resolveCampaignControlAim(player, enemies, {
        inputMode, [inputMode]: { active: true },
      })).toEqual({ x: 100, y: 140, aimDirection: Math.PI / 2 });
    }
  });

  test('gamepad stick aim overrides an enemy and empty rooms retain the last aim', () => {
    const player = { x: 100, y: 100 };
    expect(resolveCampaignControlAim(player, [{ x: 100, y: 140 }], {
      inputMode: 'gamepad', gamepad: { active: true, hasAim: true, aimX: 1, aimY: 0 },
    })).toEqual({ x: 300, y: 100, aimDirection: 0 });
    expect(resolveCampaignControlAim(player, [], {
      inputMode: 'touch', touch: { active: true, lastAimX: 0, lastAimY: -1 },
    })).toEqual({ x: 100, y: -100, aimDirection: -Math.PI / 2 });
  });

  test('uses held movement before aim and returns the canonical dash glide timing', () => {
    const dash = resolveCampaignDashBurst({
      moveX: 1, moveY: 0, aimDirection: Math.PI / 2, attackSpeed: 2, godMode: true,
    });

    expect(dash).toEqual(expect.objectContaining({
      angle: 0,
      speed: (520 + 56) * 1.1,
      durationSeconds: 0.16,
      invulnerabilitySeconds: 0.18,
    }));
    expect(dash.vx).toBeCloseTo(dash.speed);
    expect(dash.vy).toBeCloseTo(0);
  });

  test('clamps cursor blink targets and searches the same deterministic safe ring', () => {
    const landing = resolveCampaignBlinkDestination({
      originX: 100, originY: 100, targetX: 450, targetY: 350,
      radius: 18, width: 900, height: 700, wall: 28,
      isBlocked: (x, y) => Math.hypot(x - 450, y - 350) < 30,
    });
    expect(landing).toEqual(expect.objectContaining({ targetX: 450, targetY: 350, adjusted: true }));
    expect(Math.hypot(landing.x - 450, landing.y - 350)).toBeGreaterThanOrEqual(30);
  });

  test('scales Nimrod Stomp from its authored tap values through a full-room charge', () => {
    const tap = resolveCampaignNimrodStomp({ chargeRatio: 0, width: 900, height: 700, rangeMultiplier: 1 });
    const full = resolveCampaignNimrodStomp({ chargeRatio: 1, width: 900, height: 700, rangeMultiplier: 1.25 });

    expect(tap).toEqual({
      leapDistance: 108,
      radius: 108,
      damageMultiplier: 1,
      invulnerabilitySeconds: 0.32,
    });
    expect(full).toEqual({
      leapDistance: 1125,
      radius: 202.5,
      damageMultiplier: 1.7,
      invulnerabilitySeconds: 0.32,
    });
  });
});
