const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeMovement,
  computeWorldTransform,
  computeCameraTransform,
  interpolatePlayers,
  predictPosition,
} = require('../js/rendering/NetworkGameView');
const { LOCAL_BUILD_VERSION, LOCAL_CONTENT_HASH } = require('../js/multiplayer/LocalMultiplayerSession');

describe('network multiplayer game view', () => {
  test('uses a floor-renderer compatibility identity so stale movement clients cannot join', () => {
    expect(LOCAL_BUILD_VERSION).toBe('1.0.0-independent-rooms-v8');
    expect(LOCAL_CONTENT_HASH).toBe('shared-neo-independent-rooms-v8');
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
    const croppedViewport = computeWorldTransform(960, 640, 900, 700, {
      left: 0,
      top: 50,
      right: 960,
      bottom: 590,
    });
    expect(croppedViewport.scale).toBeCloseTo(540 / 700);
    expect(croppedViewport.offsetY).toBe(50);
    expect(croppedViewport.offsetX).toBeCloseTo((960 - 900 * (540 / 700)) / 2);
  });

  test('uses the same unscaled camera translation as the campaign renderer', () => {
    expect(computeCameraTransform(960, 640, { x: -30, y: 30 })).toEqual({
      scale: 1,
      offsetX: 30,
      offsetY: -30,
      roomWidth: 960,
      roomHeight: 640,
    });
  });

  test('interpolates remote players and bounds local prediction inside walls', () => {
    const players = interpolatePlayers(
      { p1: { id: 'p1', x: 100, y: 200 } },
      { p1: { id: 'p1', x: 200, y: 300 } },
      0.5,
    );
    expect(players.p1).toEqual({ id: 'p1', x: 150, y: 250 });
    expect(interpolatePlayers(
      { p1: { id: 'p1', roomId: 'room-a', x: 850, y: 350 } },
      { p1: { id: 'p1', roomId: 'room-b', x: 64, y: 350 } },
      0.5,
    ).p1).toEqual({ id: 'p1', roomId: 'room-b', x: 64, y: 350 });

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
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('this.neo.drawFloor()');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('this.neo.drawPlayerSlot');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('this.neo.drawProjectileShape');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('this.neo.drawEnemies');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('this.neo.drawPickups');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('this.neo.decorateRoomData(room)');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('this.neo.uiController?.setHudValues');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).not.toContain("ctx.font = '700 16px VT323, monospace'");
  });
});
