(function initializeOfflineTransport(root, factory) {
  const api = factory(root.NeoNyke?.multiplayer || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.multiplayer = namespace.multiplayer || {};
  Object.assign(namespace.multiplayer, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOfflineTransportApi(browserApi) {
  'use strict';

  const transportApi = typeof require === 'function' ? require('./NetworkTransport.js') : browserApi;
  const { NetworkTransport, normalizeDeliveryOptions } = transportApi;

  class OfflineTransport extends NetworkTransport {
    constructor(options = {}) {
      super({
        ...options,
        identity: options.identity || { provider: 'guest', id: 'offline-player', displayName: 'Player' },
      });
      this.schedule = typeof options.schedule === 'function' ? options.schedule : queueMicrotask;
    }

    async createSession(options = {}) {
      if (!this.initialized) await this.initialize();
      this.sessionId = String(options.sessionId || 'offline-session');
      this._emit('peerConnected', this.getLocalIdentity());
      return { sessionId: this.sessionId, authorityPeerId: this.identity.id };
    }

    async joinSession(sessionId) {
      if (!this.initialized) await this.initialize();
      if (String(sessionId) !== 'offline-session') throw new Error('OfflineTransport only supports its local session');
      this.sessionId = 'offline-session';
      return { sessionId: this.sessionId, authorityPeerId: this.identity.id };
    }

    async leaveSession(reason = 'left') {
      if (this.sessionId) this._emit('peerDisconnected', this.getLocalIdentity(), reason);
      await super.leaveSession();
    }

    send(peerId, message, options = {}) {
      if (!this.sessionId) throw new Error('OfflineTransport is not in a session');
      if (String(peerId) !== this.identity.id) throw new Error('OfflineTransport can only send to its local authority');
      const delivery = normalizeDeliveryOptions(options);
      const envelope = JSON.parse(JSON.stringify(message));
      this.schedule(() => this._emit('message', this.identity.id, envelope, delivery));
    }

    broadcast(message, options = {}) {
      this.send(this.identity.id, message, options);
    }
  }

  return { OfflineTransport };
});
