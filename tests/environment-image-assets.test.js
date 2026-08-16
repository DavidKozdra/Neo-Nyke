const fs = require('node:fs');
const path = require('node:path');

function extractAsyncFunction(source, functionName) {
  const marker = `export async function ${functionName}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  return source.slice(start, end + 1).replace('export ', '');
}

describe('environment image assets', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/draw/image-assets.js'), 'utf8');

  test('retries a transient sprite failure before publishing the registry', async () => {
    const attempts = new Map();
    class FakeImage {
      set src(value) {
        const attempt = Number(attempts.get(value) || 0) + 1;
        attempts.set(value, attempt);
        queueMicrotask(() => {
          if (value.endsWith('/anvil_0.png') && attempt === 1) this.onerror();
          else this.onload();
        });
      }
    }
    const paths = {
      anvil_0: 'assets/sprites/env/anvil_0.png',
      forge_0: 'assets/sprites/env/forge_0.png',
    };
    const Neo = {};
    const preload = new Function(
      'ENVIRONMENT_IMAGE_PATHS',
      'Image',
      'Neo',
      `${extractAsyncFunction(source, 'preloadEnvironmentImages')}; return preloadEnvironmentImages;`,
    )(paths, FakeImage, Neo);

    const assets = await preload();

    expect(attempts.get(paths.anvil_0)).toBe(2);
    expect(attempts.get(paths.forge_0)).toBe(1);
    expect(Object.keys(assets)).toEqual(['anvil_0', 'forge_0']);
    expect(assets.anvil_0.image).toBeInstanceOf(FakeImage);
  });
});
