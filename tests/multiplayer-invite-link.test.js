const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeMultiplayerInviteRoomCode,
  buildMultiplayerInviteUrl,
  readMultiplayerInviteRoomCode,
} = require('../js/multiplayer/MultiplayerInviteLink');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('multiplayer invite links', () => {
  test('builds a shareable same-page URL without discarding unrelated query state', () => {
    const invite = buildMultiplayerInviteUrl('abc234', 'https://game.example/?lang=es#news');
    const url = new URL(invite);

    expect(url.origin).toBe('https://game.example');
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('lang')).toBe('es');
    expect(url.searchParams.get('join')).toBe('ABC234');
    expect(url.hash).toBe('');
  });

  test('reads only valid, unambiguous room codes from invite URLs', () => {
    expect(readMultiplayerInviteRoomCode('https://game.example/?join=abc234')).toBe('ABC234');
    expect(readMultiplayerInviteRoomCode('https://game.example/?join=ROOM')).toBe('');
    expect(readMultiplayerInviteRoomCode('https://game.example/?join=ABC')).toBe('');
    expect(readMultiplayerInviteRoomCode('not a URL')).toBe('');
    expect(normalizeMultiplayerInviteRoomCode('  nyke42 ')).toBe('NYKE42');
  });

  test('lobbies expose invite controls and startup routes valid invites into joinRoom', () => {
    const html = read('index.html');
    const controller = read('js/ui/controller.js');

    expect(html).toMatch(/id="multiplayerCopyInviteLink"[^>]*aria-label="Copy multiplayer invite link"/);
    expect(html).toMatch(/id="coopLobbyCopyInviteLink"[^>]*aria-label="Copy multiplayer invite link"/);
    expect(controller).toContain('readMultiplayerInviteRoomCode');
    expect(controller).toContain('session => session.joinRoom(roomCode)');
    expect(controller).toContain('joinBrowserMultiplayerInviteFromLocation();');
  });
});
