const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('multiplayer room-code sharing', () => {
  test('lobby exposes an accessible copy button beside the room code', () => {
    const html = read('index.html');

    expect(html).toMatch(/id="multiplayerRoomCodeShare"/);
    expect(html).toMatch(/id="multiplayerCopyRoomCode"[^>]*aria-label="Copy multiplayer room code"/);
  });

  test('copy action prefers Clipboard API and retains a browser fallback', () => {
    const controller = read('js/ui/controller.js');

    expect(controller).toContain('navigator.clipboard?.writeText');
    expect(controller).toContain("document.execCommand?.('copy')");
    expect(controller).toContain("setMultiplayerCopyFeedback('copied')");
    expect(controller).toContain("setMultiplayerCopyFeedback('error')");
  });
});
