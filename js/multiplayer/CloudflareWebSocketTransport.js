(function initializeCloudflareWebSocketTransport(root, factory) {
  const api = factory(root, root.NeoNyke?.multiplayer || {}, root.NeoNyke?.protocol || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.multiplayer = namespace.multiplayer || {};
  Object.assign(namespace.multiplayer, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCloudflareTransportApi(root, browserMultiplayerApi, browserProtocolApi) {
  'use strict';

  const transportApi = typeof require === 'function' ? require('./NetworkTransport.js') : browserMultiplayerApi;
  const protocolApi = typeof require === 'function' ? require('../protocol/ProtocolV1.js') : browserProtocolApi;
  const { NetworkTransport, normalizeDeliveryOptions } = transportApi;
  const { getDeliveryIntent } = protocolApi;
  const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4,8}$/;
  const AUTHORITY_PEER_ID = 'cloudflare-authority';

  function createGuestIdentity() {
    const suffix = root.crypto?.randomUUID?.() || `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    return { provider: 'guest', id: `guest-${suffix}`, displayName: 'Player' };
  }

  function normalizeRoomCode(value) {
    const code = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!ROOM_CODE_PATTERN.test(code)) throw new RangeError('Room code must contain 4–8 valid characters');
    return code;
  }

  function defaultApiBase() {
    const configured = String(root.NEO_MULTIPLAYER_API_BASE || '').trim();
    if (configured) return configured.replace(/\/$/, '');
    const location = root.location;
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(String(location?.hostname || '').toLowerCase());
    const origin = localHost && location?.port && location.port !== '8787'
      ? `${location.protocol}//${location.hostname}:8787`
      : (location?.origin || 'http://127.0.0.1:8787');
    return `${origin}/api/multiplayer`;
  }

  function websocketUrl(httpUrl) {
    const url = new URL(httpUrl, root.location?.href || 'http://127.0.0.1:8787/');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  }

  class CloudflareWebSocketTransport extends NetworkTransport {
    constructor(options = {}) {
      super({ ...options, identity: options.identity || createGuestIdentity() });
      this.apiBase = String(options.apiBase || defaultApiBase()).replace(/\/$/, '');
      this.fetchImpl = options.fetch || root.fetch?.bind(root);
      this.WebSocketCtor = options.WebSocket || root.WebSocket;
      this.socket = null;
      this.authorityPeerId = AUTHORITY_PEER_ID;
      this.roomInfo = null;
    }

    async initialize() {
      if (this.initialized) return;
      if (typeof this.fetchImpl !== 'function') throw new Error('CloudflareWebSocketTransport requires fetch');
      if (typeof this.WebSocketCtor !== 'function') throw new Error('CloudflareWebSocketTransport requires WebSocket');
      await super.initialize();
    }

    async createSession(options = {}) {
      if (!this.initialized) await this.initialize();
      const response = await this.fetchImpl(`${this.apiBase}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxPlayers: options.maxPlayers || 4 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Room creation failed (${response.status})`);
      const sessionId = normalizeRoomCode(payload.roomCode || payload.code);
      this.roomInfo = { ...payload, roomCode: sessionId };
      return { sessionId, roomCode: sessionId, authorityPeerId: this.authorityPeerId, ...payload };
    }

    async getSession(sessionId) {
      if (!this.initialized) await this.initialize();
      const code = normalizeRoomCode(sessionId);
      const response = await this.fetchImpl(`${this.apiBase}/rooms/${encodeURIComponent(code)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Room lookup failed (${response.status})`);
      return payload;
    }

    async joinSession(sessionId) {
      if (!this.initialized) await this.initialize();
      if (this.socket) await this.leaveSession('changed-session');
      const code = normalizeRoomCode(sessionId);
      const socket = new this.WebSocketCtor(websocketUrl(`${this.apiBase}/rooms/${encodeURIComponent(code)}/socket`));
      this.socket = socket;
      this.sessionId = code;

      await new Promise((resolve, reject) => {
        let settled = false;
        const fail = event => {
          if (settled) return;
          settled = true;
          this.socket = null;
          this.sessionId = null;
          reject(new Error(event?.message || 'Could not connect to the multiplayer room'));
        };
        socket.addEventListener('open', () => {
          if (settled) return;
          settled = true;
          this._emit('peerConnected', { provider: 'account', id: this.authorityPeerId, displayName: 'Neo Nyke Authority' });
          resolve();
        }, { once: true });
        socket.addEventListener('error', fail, { once: true });
      });

      socket.addEventListener('message', event => {
        try {
          const message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
          this._emit('message', this.authorityPeerId, message, getDeliveryIntent(message.type));
        } catch {
          this._emit('peerDisconnected', { id: this.authorityPeerId, provider: 'account', displayName: 'Neo Nyke Authority' }, 'invalid-authority-message');
          socket.close(1002, 'Invalid authority message');
        }
      });
      socket.addEventListener('close', event => {
        if (this.socket === socket) {
          this.socket = null;
          this.sessionId = null;
        }
        this._emit('peerDisconnected', { id: this.authorityPeerId, provider: 'account', displayName: 'Neo Nyke Authority' }, event.reason || `socket-${event.code}`);
      });
      return { sessionId: code, roomCode: code, authorityPeerId: this.authorityPeerId };
    }

    send(peerId, message, options = {}) {
      normalizeDeliveryOptions(options);
      if (String(peerId) !== this.authorityPeerId) throw new Error('Cloudflare transport can only send to its room authority');
      if (!this.socket || this.socket.readyState !== 1) throw new Error('Cloudflare WebSocket is not connected');
      this.socket.send(JSON.stringify(message));
      return { queued: true, dropped: false };
    }

    broadcast(message, options = {}) {
      return this.send(this.authorityPeerId, message, options);
    }

    async leaveSession(reason = 'left') {
      const socket = this.socket;
      this.socket = null;
      this.sessionId = null;
      if (socket && socket.readyState < 2) socket.close(1000, String(reason).slice(0, 96));
    }

    dispose() {
      void this.leaveSession('disposed');
      super.dispose();
    }
  }

  return {
    ROOM_CODE_PATTERN,
    AUTHORITY_PEER_ID,
    normalizeRoomCode,
    websocketUrl,
    CloudflareWebSocketTransport,
  };
});
