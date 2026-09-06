const fs = require('node:fs');
const path = require('node:path');
const { NetworkGameView } = require('../js/rendering/NetworkGameView');

// Use the actual campaign pointer conversion, including its FPS/3D branches.
const mathSource = fs.readFileSync(path.join(__dirname, '../js/core/math-utils.js'), 'utf8');
const pointerSource = mathSource.match(/^export function updatePointerAimWorld[\s\S]+?^}/m)[0].replace(/^export /, '');

describe('multiplayer input matches campaign presentation', () => {
  let now;
  let performance;
  beforeEach(() => {
    now = 1000;
    performance = globalThis.performance;
    globalThis.performance = { now: () => now };
  });
  afterEach(() => {
    globalThis.performance = performance;
    delete globalThis.NeoSettings;
    delete globalThis.NeoGamepad;
    delete globalThis.NeoTouch;
  });

  function setup() {
    let sequence = 0;
    const canvas = {
      width: 960, height: 640,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 }),
    };
    const neo = { canvas, mouse: { x: 680, y: 350 }, camera: { x: -30, y: 30 } };
    neo.updatePointerAimWorld = new Function('Neo', `${pointerSource}; return updatePointerAimWorld;`)(neo);
    const session = {
      playerId: 'p1', status: 'running', sendInput: jest.fn(() => sequence++),
      sendAction: jest.fn(), sendAbility: jest.fn(),
    };
    const view = new NetworkGameView({ session, neo, canvas, context: {} });
    view.active = true;
    view._onSnapshot({ playerId: 'p1', snapshotSequence: 0, gameState: {
      tick: 20, floorNumber: 1,
      floorState: { width: 900, height: 700, wallThickness: 28, layout: { rooms: [{ id: 'r1', doors: {} }] } },
      players: { p1: { id: 'p1', roomId: 'r1', x: 450, y: 350, vx: 0, vy: 0,
        moveSpeed: 228, radius: 14, equippedMoves: { laser: 'blood_beam' } } },
    } });
    return { view, neo, session };
  }

  test('a stationary mouse stays over its world target while moving and stopping', () => {
    const { view, neo } = setup();
    const key = { key: 'd', code: 'KeyD', preventDefault() {} };
    view._onKey(key, true);
    for (let frame = 1; frame <= 60; frame += 1) {
      now = 1000 + frame * 1000 / 60;
      if (frame === 36) view._onKey(key, false);
      view.syncPresentation();
      expect(neo.mouse.worldX - neo.camera.x).toBeCloseTo(680, 8);
      expect(neo.mouse.worldY - neo.camera.y).toBeCloseTo(350, 8);
      expect(view.aimDirection).toBeCloseTo(Math.atan2(
        neo.mouse.worldY - neo.player.y, neo.mouse.worldX - neo.player.x,
      ), 8);
    }
    expect(neo.player.x).toBeGreaterThan(550);
  });

  test.each(['_attack', '_useSlot'])('%s refreshes camera-relative aim before sending the action', method => {
    const { view, neo, session } = setup();
    view._onPointerMove({ clientX: 680, clientY: 350 });
    view.camera = { x: 250, y: 100, roomId: 'r1' };
    view.localPredictedPlayer.x = 560;
    const expected = Math.atan2(450 - 350, 930 - 560);
    view[method]('laser');
    const send = method === '_attack' ? session.sendAction : session.sendAbility;
    expect(send.mock.calls[0][1]).toBeCloseTo(expected, 8);
    expect(neo.mouse.worldX).toBe(930);
    expect(neo.mouse.worldY).toBe(450);
  });

  test('third-person projection refreshes even when there is no pointer event', () => {
    const { view, neo, session } = setup();
    let target = { x: 600, y: 350 };
    neo.projectCanvasMouseToWorld = () => target;
    view._sendInput();
    target = { x: 450, y: 500 };
    now += 100;
    view._sendInput();
    expect(session.sendInput).toHaveBeenLastCalledWith(expect.objectContaining({
      aimDirection: Math.PI / 2, targetX: 450, targetY: 500,
    }));
  });

  test.each(['gamepad', 'touch'])('pointer refresh does not overwrite %s aim', mode => {
    const { view } = setup();
    globalThis.NeoSettings = { getEffectiveInputMode: () => mode };
    view.aimDirection = -Math.PI / 2;
    view._syncLocalAim();
    expect(view.aimDirection).toBe(-Math.PI / 2);
  });

  test.each(['touch', 'gamepad'])('%s uses campaign aim assist and keeps the transmitted target aligned', mode => {
    const { view, neo, session } = setup();
    globalThis.NeoSettings = { getEffectiveInputMode: () => mode };
    const controls = { active: true, connected: true, hasAim: false, lastAimX: -1, lastAimY: 0 };
    if (mode === 'touch') globalThis.NeoTouch = controls;
    else globalThis.NeoGamepad = { 0: controls };
    view.currentSample.state.enemies = {
      dead: { id: 'dead', x: 450, y: 349, dead: true, roomId: 'r1' },
      otherRoom: { id: 'otherRoom', x: 450, y: 345, roomId: 'r2' },
      near: { id: 'near', x: 450, y: 250, roomId: 'r1' },
      far: { id: 'far', x: 700, y: 350, roomId: 'r1' },
    };
    view._sendInput();
    expect(session.sendInput).toHaveBeenLastCalledWith(expect.objectContaining({
      aimDirection: -Math.PI / 2, targetX: 450, targetY: 250,
    }));
    view._attack();
    expect(session.sendAction.mock.calls[0][1]).toBe(-Math.PI / 2);
    now += 100;
    view.syncPresentation();
    expect(neo.mouse.worldX - neo.camera.x).toBeCloseTo(neo.mouse.x, 8);
    expect(neo.mouse.worldY - neo.camera.y).toBeCloseTo(neo.mouse.y, 8);

    view.currentSample.state.enemies = {};
    now += 100;
    view._sendInput();
    expect(session.sendInput).toHaveBeenLastCalledWith(expect.objectContaining({
      aimDirection: Math.PI, targetX: 250, targetY: 350,
    }));
  });

  test('explicit gamepad aim overrides the nearest enemy and supplies a matching target', () => {
    const { view, session } = setup();
    globalThis.NeoSettings = { getEffectiveInputMode: () => 'gamepad' };
    globalThis.NeoGamepad = { 0: {
      active: true, connected: true, hasAim: true, aimX: 1, aimY: 0, lastAimX: 1, lastAimY: 0,
    } };
    view.currentSample.state.enemies = { near: { x: 450, y: 250, roomId: 'r1' } };
    view._sendInput();
    expect(session.sendInput).toHaveBeenLastCalledWith(expect.objectContaining({
      aimDirection: 0, targetX: 650, targetY: 350,
    }));
  });

  test('an enabled touch overlay does not override keyboard mouse aiming', () => {
    const { view, neo, session } = setup();
    globalThis.NeoSettings = { getEffectiveInputMode: () => 'keyboard' };
    globalThis.NeoTouch = { active: true, lastAimX: -1, lastAimY: 0 };
    view._sendInput();
    expect(session.sendInput.mock.calls[0][0].aimDirection).toBeCloseTo(Math.atan2(0, 230), 8);
    expect(neo.mouse.worldX).toBe(680);
  });

  test('releasing D does not release ArrowRight when both keys are held', () => {
    const { view } = setup();
    const key = (code, value) => ({ code, key: value, preventDefault() {} });
    const right = key('KeyD', 'd');
    const arrow = key('ArrowRight', 'ArrowRight');
    view._onKey(right, true);
    view._onKey(arrow, true);
    expect(view._readMovement()).toEqual({ moveX: 1, moveY: 0 });
    view._onKey(key('KeyA', 'a'), true);
    expect(view._readMovement()).toEqual({ moveX: 0, moveY: 0 });
    view._onKey(key('KeyA', 'a'), false);
    view._onKey(right, false);
    expect(view._readMovement()).toEqual({ moveX: 1, moveY: 0 });
    view._onKey(arrow, false);
    expect(view._readMovement()).toEqual({ moveX: 0, moveY: 0 });
  });
});
