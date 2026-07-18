(function initializeBrowserMultiplayerSession(root, factory) {
  const api = factory(root.NeoNyke?.multiplayer || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.multiplayer = namespace.multiplayer || {};
  Object.assign(namespace.multiplayer, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBrowserMultiplayerSessionApi(browserMultiplayerApi) {
  'use strict';

  const cloudflareApi = typeof require === 'function' ? require('./CloudflareWebSocketTransport.js') : browserMultiplayerApi;
  const clientApi = typeof require === 'function' ? require('./LocalMultiplayerSession.js') : browserMultiplayerApi;
  const { CloudflareWebSocketTransport, normalizeRoomCode } = cloudflareApi;
  const { MultiplayerRoomClient, LocalMultiplayerClient } = clientApi;
  const Client = MultiplayerRoomClient || LocalMultiplayerClient;

  class BrowserMultiplayerSession {
    constructor(options = {}) {
      this.mode = 'multiplayer';
      this.authority = 'remote';
      this.transport = options.transport || new CloudflareWebSocketTransport(options.transportOptions);
      this.client = new Client({ transport: this.transport, ...options.clientOptions });
      this.roomCode = null;
      this.listeners = new Set();
      this.unsubscribeMessage = this.transport.onMessage(() => queueMicrotask(() => this._notify()));
      this.unsubscribeDisconnect = this.transport.onPeerDisconnected(() => queueMicrotask(() => this._notify()));
    }

    async createRoom(options = {}) {
      const created = await this.transport.createSession(options);
      await this.joinRoom(created.roomCode || created.sessionId);
      return this.snapshot();
    }

    async joinRoom(roomCode) {
      this.roomCode = normalizeRoomCode(roomCode);
      await this.client.connect(this.roomCode);
      this._notify();
      return this.snapshot();
    }

    setReady(ready = true) {
      this.client.sendReady(ready);
      this._notify();
    }

    setCharacter(characterKey) {
      this.client.sendCharacter(characterKey);
      this._notify();
    }

    sendInput(input) {
      return this.client.sendInput(input);
    }

    sendAction(action, aimDirection) {
      return this.client.sendAction(action, aimDirection);
    }

    subscribe(handler) {
      if (typeof handler !== 'function') throw new TypeError('Browser multiplayer listener must be a function');
      this.listeners.add(handler);
      handler(this.snapshot());
      return () => this.listeners.delete(handler);
    }

    snapshot() {
      return {
        roomCode: this.roomCode,
        status: this.client.status,
        playerId: this.client.playerId,
        lobbyState: this.client.lobbyState,
        gameState: this.client.getStateSnapshot(),
        gameplayEvents: this.client.gameplayEvents.slice(),
        errors: this.client.errors.slice(),
      };
    }

    _notify() {
      const snapshot = this.snapshot();
      this.listeners.forEach(listener => listener(snapshot));
    }

    dispose() {
      this.unsubscribeMessage?.();
      this.unsubscribeDisconnect?.();
      this.client.dispose();
      this.listeners.clear();
    }
  }

  return { BrowserMultiplayerSession };
});
