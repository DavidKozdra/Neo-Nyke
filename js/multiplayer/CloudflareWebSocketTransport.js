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
  const SOCKET_HEARTBEAT_REQUEST = '__neo_ping__';
  const SOCKET_HEARTBEAT_RESPONSE = '__neo_pong__';

  function createGuestIdentity() {
    const suffix = root.crypto?.randomUUID?.() || `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    return { provider: 'guest', id: `guest-${suffix}`, displayName: 'Player' };
  }

  function normalizeRoomCode(value) {
    const code = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!ROOM_CODE_PATTERN.test(code)) throw new RangeError('Room code must contain 4–8 valid characters');
    return code;
  }

  function defaultApiBases() {
    const configured = String(root.NEO_MULTIPLAYER_API_BASE || '').trim();
    if (configured) return [configured.replace(/\/$/, '')];
    const location = root.location;
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(String(location?.hostname || '').toLowerCase());
    const currentOrigin = location?.origin || 'http://127.0.0.1:8787';
    const resolved = String(CloudflareWebSocketTransport.resolvedApiBase || '').trim();
    const bases = [resolved, `${currentOrigin}/api/multiplayer`].filter(Boolean);
    // `wrangler dev` may select 8788/8789 when its default port is occupied;
    // assets and APIs still share that selected origin. A separately served
    // static client (for example port 5173) retains 8787 as a fallback.
    if (localHost && location?.port && location.port !== '8787') {
      bases.push(`${location.protocol}//${location.hostname}:8787/api/multiplayer`);
    }
    return [...new Set(bases.map(base => base.replace(/\/$/, '')))];
  }

  function defaultApiBase() {
    return defaultApiBases()[0];
  }

  function websocketUrl(httpUrl) {
    const url = new URL(httpUrl, root.location?.href || 'http://127.0.0.1:8787/');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  }

  class CloudflareWebSocketTransport extends NetworkTransport {
    constructor(options = {}) {
      super({ ...options, identity: options.identity || createGuestIdentity() });
      this.apiBaseCandidates = options.apiBase
        ? [String(options.apiBase).replace(/\/$/, '')]
        : defaultApiBases();
      this.apiBase = this.apiBaseCandidates[0];
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

    async checkAvailability(options = {}) {
      if (typeof this.fetchImpl !== 'function') return false;
      const timeoutMs = Math.max(250, Number(options.timeoutMs) || 4000);
      for (const apiBase of this.apiBaseCandidates) {
        const signal = options.signal
          || (typeof root.AbortSignal?.timeout === 'function' ? root.AbortSignal.timeout(timeoutMs) : undefined);
        try {
          const response = await this.fetchImpl(`${apiBase}/health`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            ...(signal ? { signal } : {}),
          });
          const payload = await response.json().catch(() => ({}));
          if (response.ok && payload.ok === true && payload.multiplayer === true) {
            this.apiBase = apiBase;
            CloudflareWebSocketTransport.resolvedApiBase = apiBase;
            return true;
          }
        } catch {
          // Try the next local candidate. The caller owns the offline state.
        }
      }
      return false;
    }

    async createSession(options = {}) {
      if (!this.initialized) await this.initialize();
      const response = await this.fetchImpl(`${this.apiBase}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxPlayers: options.maxPlayers || 4,
          mode: ['rival', 'boss_rush'].includes(options.mode) ? options.mode : 'coop',
          visibility: options.visibility === 'public' ? 'public' : 'private',
          pauseMode: options.pauseMode === 'vote' ? 'vote' : 'shared',
          ...(options.difficultyKey ? { difficultyKey: String(options.difficultyKey) } : {}),
          ...(options.difficulty && typeof options.difficulty === 'object'
            ? { difficulty: options.difficulty }
            : {}),
          // Placement is honored only while the room is first created.
          ...(options.region ? { region: options.region } : {}),
          // Omitted unless the host typed one, so the server keeps generating
          // collision-retried codes for the normal path.
          ...(options.roomCode ? { roomCode: options.roomCode } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Preserve the machine-readable reason so the lobby can show "that code
        // is taken" inline instead of a generic failure.
        const error = new Error(payload.error || `Room creation failed (${response.status})`);
        error.code = payload.code || (response.status === 409 ? 'ROOM_CODE_TAKEN' : 'ROOM_CREATE_FAILED');
        throw error;
      }
      const sessionId = normalizeRoomCode(payload.roomCode || payload.code);
      this.roomInfo = { ...payload, roomCode: sessionId };
      return { sessionId, roomCode: sessionId, authorityPeerId: this.authorityPeerId, ...payload };
    }

    async listPublicSessions(options = {}) {
      if (!this.initialized) await this.initialize();
      const requestedLimit = Math.trunc(Number(options.limit) || 12);
      const limit = Math.max(1, Math.min(20, requestedLimit));
      const response = await this.fetchImpl(`${this.apiBase}/rooms?limit=${limit}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Public lobby lookup failed (${response.status})`);
      const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
      return rooms.filter(room => room?.visibility === 'public' && ROOM_CODE_PATTERN.test(String(room.roomCode || '')));
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
          if (event.data === SOCKET_HEARTBEAT_RESPONSE) return;
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

    sendHeartbeat() {
      if (!this.socket || this.socket.readyState !== 1) throw new Error('Cloudflare WebSocket is not connected');
      this.socket.send(SOCKET_HEARTBEAT_REQUEST);
      return true;
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

  CloudflareWebSocketTransport.resolvedApiBase = '';

  return {
    ROOM_CODE_PATTERN,
    AUTHORITY_PEER_ID,
    SOCKET_HEARTBEAT_REQUEST,
    SOCKET_HEARTBEAT_RESPONSE,
    normalizeRoomCode,
    defaultApiBase,
    defaultApiBases,
    websocketUrl,
    CloudflareWebSocketTransport,
  };
});
