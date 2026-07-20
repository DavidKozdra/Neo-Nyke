const fs = require('node:fs');
const path = require('node:path');

describe('3D renderer mobile resilience', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '../js/draw/three-renderer.js'), 'utf8');
  const mobileCss = fs.readFileSync(path.join(__dirname, '../css/mobile.css'), 'utf8');

  test('does not permanently latch a transient WebGL initialization failure', () => {
    expect(renderer).toContain('WEBGL_RETRY_DELAY_MS');
    expect(renderer).toContain('performance.now() - failedAt < WEBGL_RETRY_DELAY_MS');
  });

  test('uses the same flooring rule as WebGLRenderer for fractional DPR buffers', () => {
    expect(renderer).toContain('const bufferW = Math.floor(w * ratio)');
    expect(renderer).toContain('const bufferH = Math.floor(h * ratio)');
    expect(renderer).not.toContain('glCanvas.width !== Math.round(w * ratio)');
  });

  test('caps coarse-pointer devices at native CSS resolution', () => {
    expect(renderer).toContain("window.matchMedia?.('(pointer: coarse)')?.matches");
    expect(renderer).toContain('coarsePointer ? 1 : 2');
  });

  test('keeps both render layers identically sized in the mobile override', () => {
    expect(mobileCss).toMatch(/#c,\s*#c3d\s*\{\s*width: max\(100dvw/);
  });

  test('falls back during context loss and listens for restoration', () => {
    expect(renderer).toContain("addEventListener('webglcontextlost'");
    expect(renderer).toContain("addEventListener('webglcontextrestored'");
    expect(renderer).toContain('if (contextLost || renderer.getContext?.().isContextLost?.()) return false');
  });
});
