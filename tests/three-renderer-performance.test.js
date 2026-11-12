const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');
const { createCanvas } = require('canvas');

const source = fs.readFileSync(path.join(__dirname, '../js/draw/three-renderer.js'), 'utf8');
function extract(name) {
  return source.match(new RegExp(`^function ${name}\\([\\s\\S]+?^}`, 'm'))[0];
}

function bakeFixture() {
  const neo = { ctx: createCanvas(16, 16).getContext('2d'), hazards: [], destructibles: [], shopOffers: [] };
  neo.drawWorldProps = jest.fn(() => {
    neo.ctx.fillStyle = neo.destructibles[0].broken ? '#555555' : '#885522';
    neo.ctx.fillRect(-20, -20, 40, 40);
  });
  const code = ['makeCanvasTexture', 'ensureBakeSurface', 'syncDestructibleBake', 'rasterizeWorldDraw', 'rasterizeDestructible2D'].map(extract).join('\n');
  const bake = new Function('THREE', 'Neo', 'document', `const EXPLOSIVE_TRAP_CANVAS_SIZE = 256; ${code}; return syncDestructibleBake;`)(
    THREE, neo, { createElement: () => createCanvas(256, 256) },
  );
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  const prop = { kind: 'wall', hp: 20, maxHp: 20, w: 52, h: 52 };
  return { neo, mesh, prop, bake: (theme = '#443322') => bake(mesh, prop, 80, theme) };
}

describe('3D renderer performance', () => {
  test('unchanged scenery reuses its baked texture instead of repainting and re-uploading every frame', () => {
    const f = bakeFixture();
    f.bake();
    const texture = f.mesh.material.map;
    const uploadedVersion = texture.version;
    for (let frame = 0; frame < 120; frame++) f.bake();
    expect(f.neo.drawWorldProps).toHaveBeenCalledTimes(1);
    expect(f.mesh.material.map).toBe(texture);
    expect(texture.version).toBe(uploadedVersion);
  });

  test('damage, flashing, breakage and theme changes still refresh the texture', () => {
    const f = bakeFixture();
    f.bake();
    const firstVersion = f.mesh.material.map.version;
    f.prop.hp = 10; f.bake();
    f.prop.hitFlash = 0.1; f.bake();
    f.prop.hitFlash = 0; f.bake();
    f.prop.broken = true; f.bake();
    f.bake('#ffffff');
    expect(f.neo.drawWorldProps).toHaveBeenCalledTimes(6);
    expect(f.mesh.material.map.version).toBe(firstVersion + 5);
    expect(f.neo.destructibles).toEqual([]);
  });

  test('broken barrel fade animates, then stops uploading once its fade has settled', () => {
    const f = bakeFixture();
    Object.assign(f.prop, { kind: 'barrel', broken: true, breakAge: 5 });
    f.bake();
    f.prop.breakAge = 6; f.bake();
    f.prop.breakAge = 12; f.bake();
    const settledVersion = f.mesh.material.map.version;
    f.prop.breakAge = 60; f.bake();
    expect(f.neo.drawWorldProps).toHaveBeenCalledTimes(3);
    expect(f.mesh.material.map.version).toBe(settledVersion);
  });

  test('changing the art renderer invalidates previously baked scenery', () => {
    const f = bakeFixture();
    f.bake();
    f.neo.drawWorldProps = jest.fn();
    f.bake();
    expect(f.neo.drawWorldProps).toHaveBeenCalledTimes(1);
  });

  test('WebGL capability limits are cached per context while resolution limits remain enforced', () => {
    function context() {
      return { MAX_RENDERBUFFER_SIZE: 1, MAX_VIEWPORT_DIMS: 2,
        getParameter: jest.fn(key => key === 1 ? 2048 : [1024, 1024]) };
    }
    let gl = context();
    const preferred = new Function('renderer', 'window', `let renderBufferLimits = null; ${extract('preferredPixelRatio')}; return preferredPixelRatio;`)(
      { getContext: () => gl }, { devicePixelRatio: 2, matchMedia: () => ({ matches: false }) },
    );
    for (let frame = 0; frame < 120; frame++) expect(preferred(1280, 720)).toBeCloseTo(0.8);
    expect(gl.getParameter).toHaveBeenCalledTimes(2);
    gl = context();
    expect(preferred(1280, 720)).toBeCloseTo(0.8);
    expect(gl.getParameter).toHaveBeenCalledTimes(2);
  });

  test('steady frames avoid buffer and projection updates; a viewport resize still updates both', () => {
    let width = 960, height = 640;
    const camera = { aspect: 1.5, updateProjectionMatrix: jest.fn() };
    const canvas = { width, height };
    const renderer = { setPixelRatio: jest.fn(), setSize: jest.fn((w, h) => Object.assign(canvas, { width: w, height: h })) };
    const getBoundingClientRect = jest.fn(() => ({ width, height }));
    const sizeCode = `const renderSize = { dirty: true, observer: {}, dpr: 0 }; const preferredPixelRatio = () => 1;
      ${extract('invalidateRenderSize')} ${extract('syncSize')}; return { syncSize, invalidateRenderSize };`;
    const browserWindow = { devicePixelRatio: 1 };
    const { syncSize, invalidateRenderSize } = new Function('renderer', 'Neo', 'glCanvas', 'camera', 'window', sizeCode)(
      renderer, { canvas: { getBoundingClientRect } }, canvas, camera, browserWindow,
    );
    for (let frame = 0; frame < 120; frame++) syncSize();
    expect(renderer.setSize).not.toHaveBeenCalled();
    expect(camera.updateProjectionMatrix).not.toHaveBeenCalled();
    expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
    height = 480; invalidateRenderSize(); syncSize();
    expect(renderer.setSize).toHaveBeenCalledTimes(1);
    expect(camera.aspect).toBe(2);
    expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
    browserWindow.devicePixelRatio = 2;
    syncSize();
    expect(getBoundingClientRect).toHaveBeenCalledTimes(3);
  });
});
