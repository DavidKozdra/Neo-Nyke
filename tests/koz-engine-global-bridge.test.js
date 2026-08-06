const vm = require('node:vm');

const { renderBundle } = require('../scripts/generate-koz-browser-bundle');

function loadGeneratedBundle() {
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.runInNewContext(renderBundle(), sandbox, { filename: 'koz-engine.browser-bundle.js' });
  return sandbox;
}

describe('Koz Engine global bridge', () => {
  test('boots from embedded npm package sources without synchronous browser requests', () => {
    const sandbox = loadGeneratedBundle();
    expect(sandbox.KozEngine.Combat.statusBook.createStatusMap).toEqual(expect.any(Function));
    expect(sandbox.KozEngine.World.seededRng.SeededRNG).toEqual(expect.any(Object));
  });
});
