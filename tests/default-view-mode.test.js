const fs = require('node:fs');
const path = require('node:path');

// three-renderer.js cannot be imported here: it pulls in Three.js and touches
// WebGL/document at module scope. The startup defaults are self contained
// though, so we lift just those two expressions out of the source and execute
// them against a fake localStorage. That keeps the assertions behavioural
// rather than a string match on the source, so a logic change that flips the
// default fails this test even if the code is reworded.
const RENDERER_SOURCE = fs.readFileSync(path.join(__dirname, '../js/draw/three-renderer.js'), 'utf8');

function extract(pattern, label) {
  const match = RENDERER_SOURCE.match(pattern);
  if (!match) throw new Error(`Could not find the ${label} default in three-renderer.js`);
  return match[0];
}

// Resolve Neo.render3D the way the renderer does at startup.
function resolveRender3D(storedValue) {
  const source = extract(
    /let storedPreference[\s\S]*?Neo\.render3D = [^\n]*\n/,
    'render3D',
  );
  const Neo = {};
  const localStorage = { getItem: () => storedValue };
  // eslint-disable-next-line no-new-func
  new Function('Neo', 'localStorage', 'RENDER3D_STORE_KEY', source)(Neo, localStorage, 'neonyke:render3d');
  return Neo.render3D;
}

// Resolve the initial cameraMode the way the renderer does at startup.
function resolveCameraMode(storedValue) {
  const source = extract(
    /let cameraMode = [\s\S]*?catch \{ \/\* private mode \*\/ \}/,
    'cameraMode',
  );
  const localStorage = { getItem: () => storedValue };
  // eslint-disable-next-line no-new-func
  return new Function('localStorage', 'CAMERA_MODE_STORE_KEY', `${source}\nreturn cameraMode;`)(
    localStorage,
    'neonyke:camera3d',
  );
}

describe('default view mode', () => {
  test('a first time visitor with no stored preference gets 2D', () => {
    expect(resolveRender3D(null)).toBe(false);
  });

  test('3D stays off unless the stored preference is explicitly "1"', () => {
    expect(resolveRender3D('0')).toBe(false);
    expect(resolveRender3D('')).toBe(false);
    expect(resolveRender3D('true')).toBe(false);
    expect(resolveRender3D('yes')).toBe(false);
  });

  test('a player who chose 3D keeps it', () => {
    expect(resolveRender3D('1')).toBe(true);
  });

  test('turning 3D on lands in the follow cam, not first person', () => {
    expect(resolveCameraMode(null)).toBe('third');
    expect(resolveCameraMode('third')).toBe('third');
    expect(resolveCameraMode('nonsense')).toBe('third');
  });

  test('a player who chose first person keeps it', () => {
    expect(resolveCameraMode('fp')).toBe('fp');
  });

  test('private mode with no localStorage still defaults to 2D follow cam', () => {
    const throwingStorage = { getItem: () => { throw new Error('private mode'); } };
    const render3DSource = extract(
      /let storedPreference[\s\S]*?Neo\.render3D = [^\n]*\n/,
      'render3D',
    );
    const Neo = {};
    // eslint-disable-next-line no-new-func
    new Function('Neo', 'localStorage', 'RENDER3D_STORE_KEY', render3DSource)(
      Neo,
      throwingStorage,
      'neonyke:render3d',
    );
    expect(Neo.render3D).toBe(false);

    const cameraSource = extract(
      /let cameraMode = [\s\S]*?catch \{ \/\* private mode \*\/ \}/,
      'cameraMode',
    );
    // eslint-disable-next-line no-new-func
    const cameraMode = new Function('localStorage', 'CAMERA_MODE_STORE_KEY', `${cameraSource}\nreturn cameraMode;`)(
      throwingStorage,
      'neonyke:camera3d',
    );
    expect(cameraMode).toBe('third');
  });
});
