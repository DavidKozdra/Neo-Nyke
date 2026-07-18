const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeMovement,
  computeWorldTransform,
  interpolatePlayers,
  predictPosition,
} = require('../js/rendering/NetworkGameView');
const { LOCAL_BUILD_VERSION, LOCAL_CONTENT_HASH } = require('../js/multiplayer/LocalMultiplayerSession');

describe('network multiplayer game view', () => {
  test('uses a floor-renderer compatibility identity so stale movement clients cannot join', () => {
    expect(LOCAL_BUILD_VERSION).toBe('1.0.0-mp-floor-v2');
    expect(LOCAL_CONTENT_HASH).toBe('network-floor-renderer-v2');
  });

  test('normalizes diagonal keyboard/gamepad movement', () => {
    const movement = normalizeMovement(1, 1);
    expect(Math.hypot(movement.moveX, movement.moveY)).toBeCloseTo(1);
    expect(normalizeMovement(0.5, 0)).toEqual({ moveX: 0.5, moveY: 0 });
  });

  test('fits the authority room into the Neo Nyke canvas', () => {
    expect(computeWorldTransform(960, 640, 900, 700)).toEqual({
      scale: 640 / 700,
      offsetX: (960 - 900 * (640 / 700)) / 2,
      offsetY: 0,
      roomWidth: 900,
      roomHeight: 700,
    });
  });

  test('interpolates remote players and bounds local prediction inside walls', () => {
    const players = interpolatePlayers(
      { p1: { id: 'p1', x: 100, y: 200 } },
      { p1: { id: 'p1', x: 200, y: 300 } },
      0.5,
    );
    expect(players.p1).toEqual({ id: 'p1', x: 150, y: 250 });

    const predicted = predictPosition(
      { id: 'p1', x: 50, y: 50, radius: 18, moveSpeed: 180 },
      { moveX: -1, moveY: -1, aimDirection: 1 },
      1,
      { width: 900, height: 700, wallThickness: 28 },
    );
    expect(predicted.x).toBe(46);
    expect(predicted.y).toBe(46);
    expect(predicted.aimDirection).toBe(1);
  });

  test('runtime routes multiplayer drawing away from the legacy campaign renderer', () => {
    const root = path.join(__dirname, '..');
    const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
    const environment = fs.readFileSync(path.join(root, 'js/draw/environment.js'), 'utf8');
    expect(main).toContain("import './rendering/NetworkGameView.js'");
    expect(environment).toMatch(/Neo\.multiplayerGameView\?\.active[\s\S]*Neo\.multiplayerGameView\.render\(\)/);
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('requestAnimationFrame?.(this.boundRenderFrame)');
  });
});
