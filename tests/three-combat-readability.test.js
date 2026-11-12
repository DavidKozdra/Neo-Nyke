const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');
const worldMapping = require('koz-engine-lib/Rendering3D/worldMapping');
const cameraRig = require('koz-engine-lib/Rendering3D/cameraRig');

// Exercise the renderer's actual picking/fading functions with real Three.js
// cameras, sprites and raycasts, without creating a DOM or WebGL context.
const source = fs.readFileSync(path.join(__dirname, '../js/draw/three-renderer.js'), 'utf8');
const readability = source.slice(source.indexOf('const roomSceneryOccluders ='), source.indexOf('// Camera + screen projection'));
const projection = source.match(/^function projectCanvasMouseToWorld\([\s\S]+?^}/m)[0];
const syncCamera = source.match(/^function syncCamera\([\s\S]+?^}/m)[0];

function fixture() {
  let now = 1000;
  let input = 'keyboard';
  const neo = {
    render3D: true, gameMode: 'normal', gameState: 'play', canvas: { width: 960, height: 640 },
    ROOM_W: 600, ROOM_H: 400, player: { x: 0, y: 0 }, enemies: [], projectiles: [],
    mouse: { worldX: 0, worldY: 0 },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1.5, 10, 3000);
  camera.position.set(0, 620, 340);
  camera.lookAt(0, 12, 0);
  camera.updateMatrixWorld(true);
  const pools = { enemies: new Map(), players: new Map(), destructibles: new Map() };
  const win = { NeoSettings: { getEffectiveInputMode: () => input, getAccess: () => ({ screenShake: false }) } };
  const constants = ['CAMERA_HEIGHT', 'CAMERA_BACK', 'FP_EYE_HEIGHT', 'SHAKE_EPSILON', 'CAMERA_FOCUS_SMOOTH_HZ']
    .map(name => source.match(new RegExp(`^const ${name} = [^\\n]+`, 'm'))[0]).join('\n');
  const api = new Function('THREE', 'Neo', 'window', 'scene', 'pools', 'camera', 'worldMapping3d', 'cameraRig3d', 'performance', `
    let ready = true, cameraMode = 'third', lastCameraSyncAt = 0;
    const splitCameras = [], mouseAimNdc = new THREE.Vector2(), mouseAimRay = new THREE.Raycaster();
    const camFocus = { x: 0, z: 0, valid: false }, camTarget = new THREE.Vector3(), BEAM_Y = 26;
    const isFirstPersonActive = () => cameraMode === 'fp';
    const getCameraShakeAxes = () => ({ x: 0, y: 0 });
    ${constants}
    ${readability}
    ${projection}
    ${syncCamera}
    return { projectCanvasMouseToWorld, syncSceneryVisibility, restoreSceneryMaterials,
      getSceneryBounds, syncGroundAimMarker, prepareReadabilityFrame, syncCamera,
      roomSceneryOccluders, sceneryByCamera, camFocus,
      getMarker: () => groundAimMarker,
      setMode: mode => { cameraMode = mode; },
      setSplitCamera: value => { splitCameras[0] = value; }
    };`)(THREE, neo, win, scene, pools, camera, worldMapping, cameraRig, { now: () => now });
  return { neo, scene, camera, pools, api, advance: dt => { now += dt * 1000; }, setInput: mode => { input = mode; } };
}

function addEnemy(f, actor = { x: 140, y: 0, hp: 100, r: 14 }, alpha = [255, 255, 255, 255]) {
  const pixels = new Uint8ClampedArray(16);
  alpha.forEach((value, index) => { pixels[index * 4 + 3] = value; });
  const image = { width: 2, height: 2, getContext: () => ({ getImageData: () => ({ data: pixels }) }) };
  const body = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.Texture(image), alphaTest: 0.05 }));
  body.name = 'body';
  body.center.set(0.5, 0);
  body.scale.set(56, 70, 1);
  const group = new THREE.Group();
  group.add(body);
  group.position.set(actor.x, 0, actor.y);
  f.scene.add(group);
  f.scene.updateMatrixWorld(true);
  f.pools.enemies.set(actor, group);
  f.neo.enemies.push(actor);
  return { actor, group, body };
}

function cursorOnSprite(f, sprite, uv = { x: 0.5, y: 0.5 }, width = 960) {
  const point = sprite.getWorldPosition(new THREE.Vector3());
  point.addScaledVector(new THREE.Vector3().setFromMatrixColumn(f.camera.matrixWorld, 0), (uv.x - sprite.center.x) * sprite.scale.x);
  point.addScaledVector(new THREE.Vector3().setFromMatrixColumn(f.camera.matrixWorld, 1), (uv.y - sprite.center.y) * sprite.scale.y);
  point.project(f.camera);
  return [(point.x + 1) * width / 2, (1 - point.y) * 640 / 2];
}

describe('3D combat readability', () => {
  test('clicking an enemy torso targets its simulation position instead of the floor behind it', () => {
    const f = fixture();
    const { actor, body } = addEnemy(f);
    expect(f.api.projectCanvasMouseToWorld(...cursorOnSprite(f, body))).toEqual({ x: actor.x, y: actor.y });
  });

  test('transparent sprite padding remains free aim', () => {
    const f = fixture();
    const { actor, body } = addEnemy(f, undefined, [0, 255, 0, 255]);
    const transparent = f.api.projectCanvasMouseToWorld(...cursorOnSprite(f, body, { x: 0.25, y: 0.5 }));
    expect(Math.hypot(transparent.x - actor.x, transparent.y - actor.y)).toBeGreaterThan(5);
    expect(f.api.projectCanvasMouseToWorld(...cursorOnSprite(f, body, { x: 0.75, y: 0.5 }))).toEqual({ x: actor.x, y: actor.y });
  });

  test.each(['dead', 'spawning', 'hidden'])('does not select a %s actor', state => {
    const f = fixture();
    const { actor, body, group } = addEnemy(f);
    if (state === 'dead') actor.hp = 0;
    if (state === 'spawning') actor.spawnT = 0.5;
    if (state === 'hidden') group.visible = false;
    const target = f.api.projectCanvasMouseToWorld(...cursorOnSprite(f, body));
    expect(Math.hypot(target.x - actor.x, target.y - actor.y)).toBeGreaterThan(5);
  });

  test('P1 torso picking uses the split-screen viewport camera', () => {
    const f = fixture();
    f.neo.isSplitScreen = () => true;
    f.neo.getActivePlayerSlots = () => [{}, {}];
    f.camera.aspect = 0.75;
    f.camera.updateProjectionMatrix();
    f.api.setSplitCamera(f.camera);
    const { actor, body } = addEnemy(f);
    expect(f.api.projectCanvasMouseToWorld(...cursorOnSprite(f, body, undefined, 480))).toEqual({ x: actor.x, y: actor.y });
  });

  test('walls fade only in the viewport whose actor they obscure and restore their depth writes', () => {
    const f = fixture();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(160, 280, 20), new THREE.MeshBasicMaterial({ opacity: 0.9 }));
    wall.position.set(0, 140, 100);
    f.scene.add(wall);
    f.api.roomSceneryOccluders.push(wall);
    f.api.prepareReadabilityFrame();
    f.api.syncSceneryVisibility(f.camera, f.neo.player);
    expect(wall.material.opacity).toBeLessThan(0.9);
    expect(wall.material.depthWrite).toBe(false);

    const opposite = new THREE.PerspectiveCamera(50, 1.5, 10, 3000);
    opposite.position.set(0, 620, -340);
    opposite.lookAt(0, 12, 0);
    f.api.syncSceneryVisibility(opposite, f.neo.player);
    expect(wall.material.opacity).toBe(0.9);
    expect(wall.material.depthWrite).toBe(true);
    f.api.setMode('fp');
    f.api.syncSceneryVisibility(f.camera, f.neo.player);
    expect(wall.material.opacity).toBe(0.9);
  });

  test('an opaque obstruction prevents selecting an unseen body; a faded obstruction permits it', () => {
    const f = fixture();
    const { actor, body } = addEnemy(f);
    const cursor = cursorOnSprite(f, body);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(600, 600, 10), new THREE.MeshBasicMaterial());
    wall.position.set(0, 300, 100);
    f.scene.add(wall);
    f.scene.updateMatrixWorld(true);
    const entry = { object: wall, bounds: new THREE.Box3().setFromObject(wall), opacity: 1 };
    f.api.sceneryByCamera.set(f.camera, [entry]);
    const blocked = f.api.projectCanvasMouseToWorld(...cursor);
    expect(Math.hypot(blocked.x - actor.x, blocked.y - actor.y)).toBeGreaterThan(5);
    entry.opacity = 0.18;
    expect(f.api.projectCanvasMouseToWorld(...cursor)).toEqual({ x: actor.x, y: actor.y });
  });

  test('billboard occlusion bounds honor their foot anchor and camera tilt', () => {
    const f = fixture();
    const { body } = addEnemy(f);
    const bounds = f.api.getSceneryBounds(body, f.camera);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeGreaterThan(0);
    expect(bounds.max.y).toBeLessThan(body.scale.y);
    expect(bounds.max.z - bounds.min.z).toBeGreaterThan(10);
  });

  test('scenery bounds track changed parent transforms without a full-scene matrix pass', () => {
    const f = fixture();
    const { group, body } = addEnemy(f);
    group.position.x = 280;
    const updateAll = jest.spyOn(f.scene, 'updateMatrixWorld');
    f.api.prepareReadabilityFrame();
    expect(f.api.getSceneryBounds(body, f.camera).getCenter(new THREE.Vector3()).x).toBeCloseTo(280);
    expect(updateAll).not.toHaveBeenCalled();
  });

  test('the aim marker follows the selected actor and hides for other viewports and touch input', () => {
    const f = fixture();
    const { actor, body } = addEnemy(f);
    const target = f.api.projectCanvasMouseToWorld(...cursorOnSprite(f, body));
    f.neo.mouse = { worldX: target.x, worldY: target.y };
    f.api.syncGroundAimMarker(true);
    const marker = f.api.getMarker();
    expect(marker.visible).toBe(true);
    expect(marker.position.x).toBe(actor.x);
    expect(marker.material.color.getHex()).toBe(0xffd76a);
    f.api.syncGroundAimMarker(false);
    expect(marker.visible).toBe(false);
    f.setInput('touch');
    f.api.syncGroundAimMarker(true);
    expect(marker.visible).toBe(false);
  });

  test('camera position tracks its smoothed focus without another delayed follow stage', () => {
    const f = fixture();
    f.api.syncCamera();
    f.neo.player.x = 100;
    f.advance(1 / 60);
    f.api.syncCamera();
    expect(f.camera.position.x).toBeCloseTo(f.api.camFocus.x * 0.72 + f.neo.ROOM_W / 2 * 0.28);
  });

  test('camera follow remains consistent across display refresh rates', () => {
    function follow(hz) {
      const f = fixture();
      f.api.syncCamera();
      f.neo.player.x = 100;
      for (let frame = 0; frame < hz; frame++) { f.advance(1 / hz); f.api.syncCamera(); }
      return f.camera.position.x;
    }
    expect(follow(60)).toBeCloseTo(follow(144), 5);
  });
});
