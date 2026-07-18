const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('single-player mode boundary', () => {
  test('main menu exposes both paths while multiplayer networking remains feature-gated', () => {
    const html = read('index.html');
    const featureSource = read('js/config/FeatureFlags.js');

    expect(html).toMatch(/id="newRunBtn"[^>]*>SINGLE PLAYER<\/button>/);
    expect(html).toMatch(/id="multiplayerBtn"[^>]*>MULTIPLAYER<\/button>/);
    expect(html).not.toMatch(/id="multiplayerBtn"[^>]*class="[^"]*hidden[^"]*"/);
    expect(featureSource).toContain('multiplayer: false');
  });

  test('selecting Single Player prepares OfflineGameSession before character selection', () => {
    const panelSource = read('js/ui/panels.js');
    const gameStateSource = read('js/core/game-state.js');

    expect(panelSource).toMatch(/onOpenCharacterSelect\(\)[\s\S]*?prepareSinglePlayerSession/);
    expect(gameStateSource).toContain('new OfflineGameSession()');
    expect(gameStateSource).toContain('await Neo.ensureSinglePlayerSession()');
  });

  test('offline runtime has no WebSocket, Cloudflare, Steam, Electron, or DOM dependency', () => {
    const offlineSource = [
      read('js/multiplayer/OfflineTransport.js'),
      read('js/multiplayer/OfflineGameSession.js'),
      read('js/simulation/GameState.js'),
      read('js/simulation/GameSimulation.js'),
      read('js/simulation/RandomService.js'),
    ].join('\n');

    expect(offlineSource).not.toMatch(/WebSocket|Cloudflare|Steam|Electron/);
    expect(offlineSource).not.toMatch(/document\.|window\.|requestAnimationFrame|HTMLCanvasElement|AudioContext/);
  });
});
