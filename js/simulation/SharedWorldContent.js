(function initializeSharedWorldContent(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.content = namespace.content || {};
  Object.assign(namespace.content, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedWorldContentApi() {
  'use strict';

  // The canonical physical room used by every campaign authority and client.
  // No renderer, session, or game mode may declare its own dimensions.
  const CAMPAIGN_ROOM_GEOMETRY = Object.freeze({
    width: 900,
    height: 700,
    wallThickness: 28,
    doorWidth: 140,
  });

  return { CAMPAIGN_ROOM_GEOMETRY };
});
