(function initializeBrowserMultiplayerSession(root, factory) {
  const api = factory(root, root.NeoNyke?.multiplayer || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.multiplayer = namespace.multiplayer || {};
  Object.assign(namespace.multiplayer, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBrowserMultiplayerSessionApi(root, browserMultiplayerApi) {
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
      this.disposed = false;
      this.reconnectAttempts = 0;
      this.reconnectTimer = null;
      this.unsubscribeMessage = this.transport.onMessage(() => queueMicrotask(() => this._notify()));
      this.unsubscribeDisconnect = this.transport.onPeerDisconnected(() => {
        queueMicrotask(() => this._notify());
        this._scheduleReconnect();
      });
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

    setCharacter(characterKey, kitChoices) {
      this.client.sendCharacter(characterKey, kitChoices);
      this._notify();
    }

    sendInput(input) {
      return this.client.sendInput(input);
    }

    sendAction(action, aimDirection) {
      return this.client.sendAction(action, aimDirection);
    }

    sendAbility(abilityId, aimDirection) {
      return this.client.sendAbility(abilityId, aimDirection);
    }

    sendDash(abilityId, aimDirection) {
      return this.client.sendDash(abilityId, aimDirection);
    }

    sendInteract(targetEntityId) {
      return this.client.sendInteract(targetEntityId);
    }

    sendUpgrade(selectionEventId, optionId) {
      return this.client.sendUpgrade(selectionEventId, optionId);
    }

    sendShopPurchase(kind, options) {
      return this.client.sendShopPurchase(kind, options);
    }

    sendGameCommand(command, args) {
      return this.client.sendGameCommand(command, args);
    }

    sendChat(text) {
      return this.client.sendChat(text);
    }

    requestRematch(ready = true) {
      return this.client.requestRematch(ready);
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
        chatMessages: this.client.chatMessages.slice(),
        connectionNotices: this.client.connectionNotices.slice(),
        runEnd: this.client.runEnd,
        errors: this.client.errors.slice(),
      };
    }

    _notify() {
      const snapshot = this.snapshot();
      this.listeners.forEach(listener => listener(snapshot));
    }

    _scheduleReconnect() {
      if (this.disposed || !this.roomCode || !this.client.reconnectToken || this.reconnectTimer !== null) return;
      const delay = Math.min(8_000, 750 * (2 ** Math.min(this.reconnectAttempts, 4)));
      this.reconnectTimer = root.setTimeout?.(async () => {
        this.reconnectTimer = null;
        if (this.disposed) return;
        this.reconnectAttempts += 1;
        try {
          await this.client.connect(this.roomCode);
          this.reconnectAttempts = 0;
          this._notify();
        } catch (error) {
          this.client.errors.push({ code: 'RECONNECT_FAILED', message: String(error?.message || error) });
          this._notify();
          this._scheduleReconnect();
        }
      }, delay) ?? null;
    }

    dispose(reason = 'left') {
      this.disposed = true;
      if (this.reconnectTimer !== null) root.clearTimeout?.(this.reconnectTimer);
      this.reconnectTimer = null;
      this.unsubscribeMessage?.();
      this.unsubscribeDisconnect?.();
      const leaveResult = this.client.leave?.(reason);
      if (leaveResult && typeof leaveResult.finally === 'function') leaveResult.finally(() => this.client.dispose());
      else this.client.dispose();
      this.listeners.clear();
    }
  }

  return { BrowserMultiplayerSession };
});
