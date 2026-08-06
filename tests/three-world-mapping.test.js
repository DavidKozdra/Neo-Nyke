const mapping = require('koz-engine-lib/Rendering3D/worldMapping');
const cameraRig = require('koz-engine-lib/Rendering3D/cameraRig');
const roomGeometry = require('koz-engine-lib/Rendering3D/roomGeometry');
const fs = require('node:fs');
const path = require('node:path');

describe('Koz Engine 3D world mapping', () => {
  test('maps top-down coordinates, canvas coordinates, and floor rays', () => {
    expect(mapping.worldToThree({ x: 4, y: 9 }, { height: 3 })).toEqual({ x: 4, y: 3, z: 9 });
    expect(mapping.threeToWorld({ x: 4, y: 3, z: 9 })).toEqual({ x: 4, y: 9, height: 3 });
    expect(mapping.canvasToNdc(50, 25, 100, 100)).toEqual({ x: 0, y: 0.5 });
    expect(mapping.intersectRayWithGround({ x: 1, y: 10, z: 2 }, { x: 0.2, y: -1, z: 0.3 })).toEqual(expect.objectContaining({ x: 3, y: 0, z: 5, distance: 10 }));
  });
  test('creates consistent split-screen viewports', () => {
    expect(mapping.splitViewport(800, 600, 3, 4)).toEqual({ x: 400, y: 300, width: 400, height: 300 });
    expect(mapping.createViewportLayout(800, 600, 3, { coordinateSpace: 'webgl' })).toEqual([
      expect.objectContaining({ slotIndex: 0, x: 0, y: 300, width: 400, height: 300 }),
      expect.objectContaining({ slotIndex: 1, x: 400, y: 300, width: 400, height: 300 }),
      expect.objectContaining({ slotIndex: 2, x: 0, y: 0, width: 400, height: 300 }),
    ]);
  });
  test('maps flipped/scaled axes, directions, angles, and arbitrary planes', () => {
    const options = {
      origin: { x: 10, y: 2, z: 20 },
      scaleX: 2,
      scaleY: 4,
      elevationScale: 3,
      flipY: true,
    };
    expect(mapping.worldToThree({ x: 5, y: 6, height: 2 }, options)).toEqual({
      x: 20, y: 8, z: -4,
    });
    expect(mapping.threeToWorld({ x: 20, y: 8, z: -4 }, options)).toEqual({
      x: 5, y: 6, height: 2,
    });
    expect(mapping.worldAngleToYaw(Math.PI / 2, options)).toBeCloseTo(-Math.PI / 2);
    expect(mapping.yawToWorldAngle(-Math.PI / 2, options)).toBeCloseTo(Math.PI / 2);
    expect(mapping.intersectRayWithPlane(
      { x: 0, y: 5, z: 0 },
      { x: 1, y: 0, z: 0 },
      { point: { x: 4, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
    )).toEqual({ x: 4, y: 5, z: 0, distance: 4 });
  });
  test('projects and unprojects through backend callbacks', () => {
    expect(mapping.projectWorldPoint(
      { x: 4, y: 9, height: 3 },
      point => ({ x: point.x / 10, y: point.z / 10, z: 0 }),
      { viewport: { x: 10, y: 20, width: 100, height: 200 } },
    )).toEqual(expect.objectContaining({
      x: 80,
      y: 30,
      visible: true,
      threePoint: { x: 4, y: 3, z: 9 },
    }));
    const result = mapping.unprojectCanvasToWorld(
      50,
      25,
      ndc => ({ origin: { x: ndc.x, y: 10, z: ndc.y }, direction: { x: 0, y: -1, z: 0 } }),
      { viewport: { x: 0, y: 0, width: 100, height: 100 } },
    );
    expect(result).toEqual(expect.objectContaining({ x: 0, y: 0.5, height: 0, distance: 10 }));
  });
  test('provides renderer-independent first- and third-person camera rigs', () => {
    expect(cameraRig.computeFirstPersonPose({
      focus: { x: 10, z: 20 },
      eyeHeight: 34,
      yaw: 0,
      pitch: 0,
    })).toEqual({
      position: { x: 10, y: 34, z: 20 },
      target: { x: 110, y: 34, z: 20 },
      forward: { x: 1, y: 0, z: 0 },
    });
    expect(cameraRig.computeThirdPersonPose({
      focus: { x: 0, z: 0 },
      room: { width: 100, height: 200 },
      centerBias: 0.25,
      height: 300,
      back: 100,
      lookHeight: 12,
    })).toEqual({
      position: { x: 12.5, y: 300, z: 125 },
      target: { x: 12.5, y: 12, z: 25 },
    });
    expect(cameraRig.normalizeViewMode('fp', { splitScreen: true })).toBe('third');
    expect(cameraRig.mapLocalMovementToWorld({ forward: 1 }, Math.PI / 2)).toEqual(expect.objectContaining({
      x: expect.closeTo(0),
      y: 1,
    }));
  });
  test('builds walls, corridors, secret exits, elevations, and stable room signatures', () => {
    const room = {
      id: 'secret-a',
      type: 'secret',
      doors: { n: true },
      secretPassages: { e: { open: true }, w: { open: false } },
    };
    expect(roomGeometry.resolveRoomExits(room)).toEqual({ n: true, s: false, w: false, e: true });
    const plan = roomGeometry.createRoomBoundaryPlan({
      room,
      width: 800,
      height: 600,
      wallThickness: 40,
      doorSize: 120,
      corridorDepth: 90,
    });
    expect(plan.walls).toHaveLength(6);
    expect(plan.corridors.map(entry => entry.side)).toEqual(['n', 'e']);
    expect(plan.doorPads.map(entry => entry.side)).toEqual(['n', 'e']);
    expect(roomGeometry.resolveElevation(
      { kind: 'choice', jumpHeight: 4 },
      { baseHeight: 2, kindOffsets: { choice: 10 } },
    )).toBe(16);
    expect(roomGeometry.roomBuildSignature(room, {
      width: 800,
      height: 600,
      wallThickness: 40,
      doorSize: 120,
    })).toContain('"e":true');
  });
  test('NeoNyke consumes the engine camera, viewport, room, elevation, and movement contracts', () => {
    const renderer = fs.readFileSync(path.join(__dirname, '../js/draw/three-renderer.js'), 'utf8');
    const movement = fs.readFileSync(path.join(__dirname, '../js/simulation/CampaignMovementRules.js'), 'utf8');
    expect(renderer).toContain('cameraRig3d.updateSmoothedFocus');
    expect(renderer).toContain('cameraRig3d.computeFirstPersonPose');
    expect(renderer).toContain('cameraRig3d.computeThirdPersonPose');
    expect(renderer).toContain('worldMapping3d.createViewportLayout');
    expect(renderer).toContain('roomGeometry3d.createRoomBoundaryPlan');
    expect(renderer).toContain('roomGeometry3d.roomBuildSignature');
    expect(renderer).toContain('roomGeometry3d.resolveElevation');
    expect(movement).toContain('cameraRig.mapLocalMovementToWorld');
  });
});
