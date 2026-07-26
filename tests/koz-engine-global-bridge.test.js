const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const bridgePath = path.join(root, 'Koz_Engine_Lib/Core/koz-engine.global.js');

function loadBridgeWithMissingModule(missingPath) {
  const warnings = [];

  class FakeXmlHttpRequest {
    open(_method, requestPath) {
      this.requestPath = requestPath;
    }

    send() {
      if (this.requestPath === missingPath) {
        throw new Error(`Offline cache miss: ${this.requestPath}`);
      }
      this.responseText = fs.readFileSync(path.join(root, this.requestPath), 'utf8');
      this.status = 200;
    }
  }

  const sandbox = {
    XMLHttpRequest: FakeXmlHttpRequest,
    console: { warn: (...args) => warnings.push(args) },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(bridgePath, 'utf8'), sandbox, { filename: bridgePath });
  return { sandbox, warnings };
}

describe('Koz Engine global bridge', () => {
  test('keeps loading independent modules when one offline cache entry is absent', () => {
    const { sandbox, warnings } = loadBridgeWithMissingModule('Koz_Engine_Lib/AI/astar.js');

    expect(sandbox.KozEngine.Combat.statusBook.createStatusMap).toEqual(expect.any(Function));
    expect(sandbox.KozEngine.loadFailures).toEqual([
      expect.objectContaining({ path: 'Koz_Engine_Lib/AI/astar.js' }),
    ]);
    expect(warnings[0][0]).toContain('Koz_Engine_Lib/AI/astar.js');
  });
});
