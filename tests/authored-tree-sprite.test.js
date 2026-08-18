const fs = require('node:fs');
const path = require('node:path');

function readSource(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function extractFunction(source, functionName, dependencies = {}) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  // Skip the parameter list before brace-counting: a default value such as
  // `options = {}` would otherwise be mistaken for the function body.
  const parenStart = source.indexOf('(', start);
  let parenDepth = 0;
  let parenEnd = parenStart;
  for (; parenEnd < source.length; parenEnd += 1) {
    if (source[parenEnd] === '(') parenDepth += 1;
    if (source[parenEnd] === ')') parenDepth -= 1;
    if (parenDepth === 0) break;
  }
  const bodyStart = source.indexOf('{', parenEnd);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }

  const declaration = source.slice(start, end + 1);
  return new Function(
    ...Object.keys(dependencies),
    `${declaration}; return ${functionName};`,
  )(...Object.values(dependencies));
}

function makeCtx() {
  return {
    drawImage: jest.fn(),
    fillRect: jest.fn(),
    beginPath: jest.fn(),
    ellipse: jest.fn(),
    fill: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    imageSmoothingEnabled: true,
    fillStyle: '',
    globalCompositeOperation: 'source-over',
  };
}

describe('authored tree sprite', () => {
  const environmentSource = readSource('js/draw/environment.js');

  test('tree.png is registered in the shared environment image registry', () => {
    expect(readSource('js/draw/image-assets.js')).toContain("tree: 'assets/sprites/env/tree.png'");
  });

  test('tree.png is precached by the service worker', () => {
    expect(readSource('sw.js')).toContain('/assets/sprites/env/tree.png');
  });

  test('stands the sprite on its contact point instead of centering it', () => {
    const image = { naturalWidth: 24, naturalHeight: 24 };
    const ctx = makeCtx();
    const Neo = { ctx, ENVIRONMENT_IMAGES: { tree: { image } } };
    const drawAuthoredTree = extractFunction(environmentSource, 'drawAuthoredTree', { Neo });

    expect(drawAuthoredTree(20)).toBe(true);

    const size = 20 * 2.9;
    // Base sits just below the footprint center; canopy rises above it.
    expect(ctx.drawImage).toHaveBeenCalledWith(image, -size / 2, 20 * 0.62 - size, size, size);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  test('preserves a non-square sprite aspect ratio', () => {
    const image = { naturalWidth: 24, naturalHeight: 48 };
    const ctx = makeCtx();
    const Neo = { ctx, ENVIRONMENT_IMAGES: { tree: { image } } };
    const drawAuthoredTree = extractFunction(environmentSource, 'drawAuthoredTree', { Neo });

    drawAuthoredTree(20);

    const drawW = 20 * 2.9;
    expect(ctx.drawImage).toHaveBeenCalledWith(image, -drawW / 2, expect.any(Number), drawW, drawW * 2);
  });

  test('fruit trees tint the shared art through its own alpha', () => {
    const image = { naturalWidth: 24, naturalHeight: 24 };
    const ctx = makeCtx();
    const Neo = { ctx, ENVIRONMENT_IMAGES: { tree: { image } } };
    const drawAuthoredTree = extractFunction(environmentSource, 'drawAuthoredTree', { Neo });

    drawAuthoredTree(20, { fruit: true });

    expect(ctx.globalCompositeOperation).toBe('source-atop');
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  test('falls back to procedural art when the PNG has not loaded', () => {
    const ctx = makeCtx();
    const Neo = { ctx, ENVIRONMENT_IMAGES: {} };
    const drawAuthoredTree = extractFunction(environmentSource, 'drawAuthoredTree', { Neo });

    expect(drawAuthoredTree(20)).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  test('both decor trees and harvestable forest trees use the shared helper', () => {
    expect(environmentSource).toContain('if (drawAuthoredTree(decor.r)) { Neo.ctx.restore(); return; }');
    expect(environmentSource).toContain('if (drawAuthoredTree(decor.r, { fruit: true })) { Neo.ctx.restore(); return; }');
    expect(readSource('js/draw/props.js')).toContain('Neo.drawAuthoredTree?.(radius, { fruit: prop.fruit })');
  });

  test('3D forest trees billboard the sprite instead of falling through to a block', () => {
    const renderer = readSource('js/draw/three-renderer.js');
    expect(renderer).toContain("const image = Neo.ENVIRONMENT_IMAGES?.tree?.image;");
    expect(renderer).toContain("prop.kind === 'tree' ? Math.max(24, Number(prop.r || 26) * 2.9) : 52");
  });
});
