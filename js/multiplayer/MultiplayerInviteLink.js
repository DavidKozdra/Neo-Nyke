(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.multiplayer = namespace.multiplayer || {};
  Object.assign(namespace.multiplayer, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const MULTIPLAYER_INVITE_PARAM = 'join';
  const MULTIPLAYER_ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4,8}$/;

  function normalizeMultiplayerInviteRoomCode(value) {
    const roomCode = String(value || '').trim().toUpperCase();
    return MULTIPLAYER_ROOM_CODE_PATTERN.test(roomCode) ? roomCode : '';
  }

  function buildMultiplayerInviteUrl(roomCode, href = root.location?.href) {
    const normalizedRoomCode = normalizeMultiplayerInviteRoomCode(roomCode);
    if (!normalizedRoomCode) throw new TypeError('A valid multiplayer room code is required');
    if (!href) throw new TypeError('A page URL is required to build a multiplayer invite');

    const inviteUrl = new URL(href);
    inviteUrl.searchParams.set(MULTIPLAYER_INVITE_PARAM, normalizedRoomCode);
    inviteUrl.hash = '';
    return inviteUrl.toString();
  }

  function readMultiplayerInviteRoomCode(href = root.location?.href) {
    if (!href) return '';
    try {
      const inviteUrl = new URL(href);
      return normalizeMultiplayerInviteRoomCode(inviteUrl.searchParams.get(MULTIPLAYER_INVITE_PARAM));
    } catch {
      return '';
    }
  }

  return {
    MULTIPLAYER_INVITE_PARAM,
    MULTIPLAYER_ROOM_CODE_PATTERN,
    normalizeMultiplayerInviteRoomCode,
    buildMultiplayerInviteUrl,
    readMultiplayerInviteRoomCode,
  };
});
