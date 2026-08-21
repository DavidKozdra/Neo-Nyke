const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('multiplayer social and death UI', () => {
  test('exposes clipboard join, T chat, spectator controls, and a rematch death screen', () => {
    const html = read('index.html');
    const view = read('js/rendering/NetworkGameView.js');
    const controller = read('js/ui/controller.js');

    expect(html).toMatch(/id="multiplayerJoinClipboard"[^>]*>PASTE CODE</);
    expect(html).toMatch(/id="multiplayerChatInput"[^>]*maxlength="180"/);
    expect(html).toMatch(/id="multiplayerSpectatorPlayers"/);
    expect(html).toMatch(/id="multiplayerEndScreen"/);
    expect(html).toMatch(/id="multiplayerRematch"[^>]*>PLAY AGAIN</);
    expect(view).toContain("event.code === 'KeyT'");
    expect(view).toContain('_cycleSpectatorTarget()');
    expect(controller).toContain('browserMultiplayerSession.requestRematch(true)');
  });

  test('presents create and join as two explicit choices', () => {
    const html = read('index.html');
    const controller = read('js/ui/controller.js');

    expect(html).toMatch(/<header class="multiplayer-banner">[\s\S]*id="multiplayerPanelTitle"[\s\S]*<div class="multiplayer-panel__surface">/);
    expect(html).toMatch(/class="multiplayer-choice-grid">[\s\S]*id="multiplayerCreateTitle">CREATE A PARTY[\s\S]*id="multiplayerJoinTitle">JOIN A PARTY/);
    expect(html).toContain('data-multiplayer-mode-option="coop"');
    expect(html).toContain('data-multiplayer-mode-option="rival"');
    expect(html).toMatch(/id="multiplayerJoinPanel"[\s\S]*id="multiplayerRoomCode"[\s\S]*id="multiplayerJoinRoom"/);
    expect(controller).toContain('function setMultiplayerModeChoice(mode)');
    expect(controller).not.toContain("view.multiplayerJoinPanel?.addEventListener('toggle'");
  });

  test('mounts multiplayer as a dedicated menu page with its own live background and back navigation', () => {
    const html = read('index.html');
    const controller = read('js/ui/controller.js');
    const background = read('js/ui/menu-background.js');

    expect(html).toMatch(/id="multiplayerPanel" class="overlay multiplayer-page multiplayer-panel hidden"/);
    expect(html).toMatch(/id="multiplayerBg"[\s\S]*id="multiplayerBack" class="back-btn multiplayer-page__back"/);
    expect(controller).toContain("document.body.append(view.multiplayerPanel)");
    expect(background).toContain("document.getElementById('multiplayerBg')");
  });

  test('uses a vertical party rail and exposes live lobby connection activity', () => {
    const html = read('index.html');
    const styles = read('css/style.css');
    const controller = read('js/ui/controller.js');

    expect(html).toMatch(/class="coop-lobby__workspace"[\s\S]*class="coop-lobby__party-panel"[\s\S]*id="coopLobbySlots"[\s\S]*id="coopLobbyActivity"[\s\S]*class="charselect-main coop-lobby__main"/);
    expect(styles).toMatch(/\.coop-lobby__workspace\s*\{[\s\S]*grid-template-columns:\s*310px minmax\(0, 1fr\)/);
    expect(styles).toMatch(/\.coop-lobby__slots\s*\{[\s\S]*flex-direction:\s*column/);
    expect(controller).toContain('renderCoopActivity(connectionNotices)');
    expect(controller).toContain('membersBySlot');
  });

  test('embeds authoritative party chat in the pre-game co-op lobby', () => {
    const html = read('index.html');
    const controller = read('js/ui/controller.js');
    const styles = read('css/style.css');

    expect(html).toMatch(/id="coopLobbyChatLog"[^>]*role="log"/);
    expect(html).toMatch(/id="coopLobbyChatForm"[\s\S]*id="coopLobbyChatInput"[^>]*maxlength="180"[\s\S]*id="coopLobbyChatSend"/);
    expect(controller).toContain('function renderCoopLobbyChat(messages = [], members = [], localPlayerId = \'\')');
    expect(controller).toContain('browserMultiplayerSession.sendChat(text)');
    expect(controller).toContain("event.code !== 'KeyT'");
    expect(styles).toContain('.coop-lobby__chat-message');
  });

  test('offers shared or vote pause rules and renders authority vote feedback', () => {
    const html = read('index.html');
    const controller = read('js/ui/controller.js');
    const view = read('js/rendering/NetworkGameView.js');
    const styles = read('css/style.css');

    expect(html).toMatch(/id="multiplayerPauseModeToggle"[^>]*data-pause-mode="shared"/);
    expect(html).toMatch(/<button id="coopLobbyPauseMode"[^>]*data-pause-mode="shared"/);
    expect(html).toMatch(/id="multiplayerPauseVote"[^>]*role="status"/);
    expect(html).toMatch(/id="multiplayerPauseStatus"[^>]*role="status"/);
    expect(controller).toContain('function setMultiplayerPauseModeChoice(pauseMode)');
    expect(controller).toContain("pauseMode: view.multiplayerPauseModeToggle?.dataset.pauseMode === 'vote' ? 'vote' : 'shared'");
    expect(controller).toContain("browserMultiplayerSession.setPauseMode(current === 'vote' ? 'shared' : 'vote')");
    expect(view).toContain('this.session.requestPause(wantsPaused)');
    expect(view).toContain('_syncPauseState(snapshot.pauseState, snapshot.lobbyState)');
    expect(styles).toContain('.multiplayer-pause-vote');
    expect(styles).toContain('grid-template-rows: auto minmax(112px, 1fr) auto auto');
    expect(styles).toContain('width: 64px');
  });
});
