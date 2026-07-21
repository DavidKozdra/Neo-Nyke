const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('multiplayer social and death UI', () => {
  test('exposes clipboard join, T chat, spectator controls, and a rematch death screen', () => {
    const html = read('index.html');
    const view = read('js/rendering/NetworkGameView.js');
    const controller = read('js/ui/controller.js');

    expect(html).toMatch(/id="multiplayerJoinClipboard"[^>]*>PASTE INVITE</);
    expect(html).toMatch(/id="multiplayerChatInput"[^>]*maxlength="180"/);
    expect(html).toMatch(/id="multiplayerSpectatorPlayers"/);
    expect(html).toMatch(/id="multiplayerEndScreen"/);
    expect(html).toMatch(/id="multiplayerRematch"[^>]*>PLAY AGAIN</);
    expect(view).toContain("event.code === 'KeyT'");
    expect(view).toContain('_cycleSpectatorTarget()');
    expect(controller).toContain('browserMultiplayerSession.requestRematch(true)');
  });
});
