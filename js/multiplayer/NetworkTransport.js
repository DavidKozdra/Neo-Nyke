(function initializeNetworkTransport(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.multiplayer = namespace.multiplayer || {};
  Object.assign(namespace.multiplayer, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNetworkTransportApi() {
  'use strict';

  const RELIABILITY = Object.freeze({ RELIABLE: 'reliable', UNRELIABLE: 'unreliable' });
  const DEFAULT_CHANNEL = 'control';

  function normalizeDeliveryOptions(options = {}) {
    const reliability = options.reliability || RELIABILITY.RELIABLE;
    if (!Object.values(RELIABILITY).includes(reliability)) {
      throw new RangeError(`Unsupported reliability: ${String(reliability)}`);
    }
    const channel = String(options.channel || DEFAULT_CHANNEL);
    if (!/^[a-z0-9_-]{1,32}$/i.test(channel)) throw new RangeError('Invalid transport channel');
    return { reliability, channel, replaceable: options.replaceable === true };
  }

  function normalizeIdentity(identity = {}) {
    const provider = String(identity.provider || 'guest');
    if (!['guest', 'account', 'steam'].includes(provider)) throw new RangeError('Invalid identity provider');
    const id = String(identity.id || '').trim();
    if (!id) throw new TypeError('Identity id is required');
    return { provider, id, displayName: String(identity.displayName || id).slice(0, 64) };
  }

  class NetworkTransport {
    constructor(options = {}) {
      this.identity = normalizeIdentity(options.identity || { provider: 'guest', id: 'offline', displayName: 'Player' });
      this.initialized = false;
      this.sessionId = null;
      this.handlers = {
        message: new Set(),
        peerConnected: new Set(),
        peerDisconnected: new Set(),
      };
    }

    async initialize() {
      this.initialized = true;
    }

    async createSession() {
      throw new Error('createSession() must be implemented by a transport');
    }

    async joinSession() {
      throw new Error('joinSession() must be implemented by a transport');
    }

    async leaveSession() {
      this.sessionId = null;
    }

    send() {
      throw new Error('send() must be implemented by a transport');
    }

    broadcast() {
      throw new Error('broadcast() must be implemented by a transport');
    }

    onMessage(handler) {
      return this._subscribe('message', handler);
    }

    onPeerConnected(handler) {
      return this._subscribe('peerConnected', handler);
    }

    onPeerDisconnected(handler) {
      return this._subscribe('peerDisconnected', handler);
    }

    getLocalIdentity() {
      return { ...this.identity };
    }

    getPeerIdentity() {
      return null;
    }

    disconnectPeer() {
      return false;
    }

    dispose() {
      this.sessionId = null;
      this.initialized = false;
      Object.values(this.handlers).forEach(handlers => handlers.clear());
    }

    _subscribe(event, handler) {
      if (typeof handler !== 'function') throw new TypeError(`${event} handler must be a function`);
      this.handlers[event].add(handler);
      return () => this.handlers[event].delete(handler);
    }

    _emit(event, ...args) {
      this.handlers[event].forEach(handler => handler(...args));
    }
  }

  return { RELIABILITY, DEFAULT_CHANNEL, normalizeDeliveryOptions, normalizeIdentity, NetworkTransport };
});
