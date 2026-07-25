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
  const HEARTBEAT_INTERVAL_MS = 20_000;
  const INTENTIONAL_DISPOSE_REASONS = new Set(['left', 'leave', 'disposed', 'quit', 'menu', 'changed-session']);
  const resumeApi = typeof require === 'function'
    ? require('../../Koz_Engine_Lib/Multiplayer/resumeStore.js')
    : root.KozEngine?.Multiplayer?.resumeStore;
  const coordinatorApi = typeof require === 'function'
    ? require('../../Koz_Engine_Lib/Multiplayer/tabCoordinator.js')
    : root.KozEngine?.Multiplayer?.tabCoordinator;

  function safeStorage(explicitStorage) {
    if (explicitStorage) return explicitStorage;
    try {
      return root.localStorage || null;
    } catch {
      return null;
    }
  }

  function createDefaultCoordinator(storage, options = {}) {
    if (!coordinatorApi?.createTabCoordinator) return null;
    return coordinatorApi.createTabCoordinator({
      storage,
      locks: options.locks || root.navigator?.locks,
      setInterval: root.setInterval?.bind(root),
      clearInterval: root.clearInterval?.bind(root),
      createChannel: options.createChannel || (typeof root.BroadcastChannel === 'function'
        ? name => new root.BroadcastChannel(name)
        : null),
    });
  }

  function isIntentionalReason(reason) {
    const normalized = String(reason || '').trim().toLowerCase();
    return Array.from(INTENTIONAL_DISPOSE_REASONS)
      .some(value => normalized === value || normalized.startsWith(`${value}-`));
  }

  class BrowserMultiplayerSession {
    constructor(options = {}) {
      this.mode = 'multiplayer';
      this.authority = 'remote';
      this.combatPredictionCorrelation = true;
      this.transport = options.transport || new CloudflareWebSocketTransport(options.transportOptions);
      this.client = new Client({ transport: this.transport, ...options.clientOptions });
      this.storage = safeStorage(options.storage);
      this.resumeStore = options.resumeStore || (this.storage && resumeApi?.createResumeStore
        ? resumeApi.createResumeStore({ storage: this.storage, key: options.resumeStorageKey })
        : null);
      this.tabCoordinator = options.tabCoordinator === false
        ? null
        : options.tabCoordinator || createDefaultCoordinator(this.storage, options.coordinatorOptions);
      this.roomCode = null;
      this.listeners = new Set();
      this.disposed = false;
      this.reconnectAttempts = 0;
      this.reconnectTimer = null;
      this.reconnectInFlight = false;
      this.reconnectPausedUntilWake = false;
      this.heartbeatTimer = null;
      this.notifyQueued = false;
      this.unsubscribeMessage = this.transport.onMessage((_peerId, message) => {
        if (message?.type === 'JOIN_ACCEPTED') this._persistResumeDescriptor(message.payload);
        if (message?.type === 'JOIN_REJECTED'
          && ['INVALID_SESSION', 'VERSION_MISMATCH'].includes(message.payload?.code)) {
          this.resumeStore?.clear();
        }
        if (message?.type !== 'PONG') this._scheduleNotify();
      });
      this.unsubscribeDisconnect = this.transport.onPeerDisconnected(() => {
        this._scheduleNotify();
        if (root.document?.visibilityState === 'hidden' || root.document?.hidden === true) {
          // Do not let an abandoned background tab reconnect forever and keep a
          // running Durable Object hot. The visibility/focus hook resumes it.
          this.reconnectPausedUntilWake = true;
          return;
        }
        this._scheduleReconnect();
      });
      this.boundConnectionWake = () => this._handleConnectionWake();
      this.unsubscribeTabCoordinator = this.tabCoordinator?.subscribe?.(message => {
        if (message?.type === 'takeover-requested' && message.resource === this.roomCode
          && message.tabId !== this.tabCoordinator.tabId) {
          this.dispose('tab-handoff');
        }
      });
      root.document?.addEventListener?.('visibilitychange', this.boundConnectionWake);
      root.addEventListener?.('focus', this.boundConnectionWake);
    }

    async createRoom(options = {}) {
      const created = await this.transport.createSession(options);
      await this.joinRoom(created.roomCode || created.sessionId);
      return this.snapshot();
    }

    async joinRoom(roomCode, options = {}) {
      this.roomCode = normalizeRoomCode(roomCode);
      const descriptor = this.resumeStore?.load({
        roomId: this.roomCode,
        buildVersion: this.client.buildVersion,
        generationVersion: this.client.generationVersion,
        contentHash: this.client.contentHash,
      });
      if (descriptor?.resumeToken) this.client.reconnectToken = descriptor.resumeToken;
      if (this.tabCoordinator) {
        let acquired = await this.tabCoordinator.acquire(this.roomCode);
        if (!acquired && options.takeover === true) {
          this.tabCoordinator.requestTakeover(this.roomCode);
          await new Promise(resolve => (root.setTimeout || setTimeout)(resolve, 80));
          acquired = await this.tabCoordinator.acquire(this.roomCode);
        }
        if (!acquired) {
          const error = new Error('This multiplayer room is active in another tab.');
          error.code = 'SESSION_ACTIVE_IN_ANOTHER_TAB';
          throw error;
        }
      }
      await this.client.connect(this.roomCode);
      this._startHeartbeat();
      this._notify();
      return this.snapshot();
    }

    async resumeLastSession() {
      const descriptor = this.resumeStore?.load({
        buildVersion: this.client.buildVersion,
        generationVersion: this.client.generationVersion,
        contentHash: this.client.contentHash,
      });
      if (!descriptor) return null;
      this.client.reconnectToken = descriptor.resumeToken;
      return this.joinRoom(descriptor.roomId, { takeover: true });
    }

    _persistResumeDescriptor(payload = {}) {
      if (!this.resumeStore || !this.roomCode || !payload.reconnectToken) return null;
      return this.resumeStore.save({
        provider: 'cloudflare-durable-object',
        roomId: this.roomCode,
        playerId: payload.playerId || this.client.playerId,
        resumeToken: payload.reconnectToken,
        protocolVersion: 1,
        buildVersion: this.client.buildVersion,
        generationVersion: this.client.generationVersion,
        contentHash: this.client.contentHash,
      });
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

    sendAction(action, aimDirection, options) {
      return this.client.sendAction(action, aimDirection, options);
    }

    sendAbility(abilityId, aimDirection, options) {
      return this.client.sendAbility(abilityId, aimDirection, options);
    }

    sendDash(abilityId, aimDirection, options) {
      return this.client.sendDash(abilityId, aimDirection, options);
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

    get status() {
      return this.client.status;
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
        lastAcknowledgedInput: this.client.lastAcknowledgedInput,
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

    _scheduleNotify() {
      if (this.notifyQueued || this.disposed) return;
      this.notifyQueued = true;
      queueMicrotask(() => {
        this.notifyQueued = false;
        if (!this.disposed) this._notify();
      });
    }

    _startHeartbeat() {
      if (this.heartbeatTimer !== null || this.disposed) return;
      this.heartbeatTimer = root.setInterval?.(() => this._sendHeartbeat(), HEARTBEAT_INTERVAL_MS) ?? null;
    }

    _sendHeartbeat() {
      if (this.disposed || !this.roomCode || !this.client.authorityPeerId) return;
      try {
        const hidden = root.document?.visibilityState === 'hidden' || root.document?.hidden === true;
        // Running rooms are already awake for simulation, so a visible client's
        // protocol ping is free liveness evidence for the idle-player cutoff.
        // Waiting/hidden rooms use Cloudflare's hibernation auto-response path.
        if (this.client.status === 'running' && !hidden) this.client.ping();
        else if (typeof this.transport.sendHeartbeat === 'function') this.transport.sendHeartbeat();
        else this.client.ping();
      } catch {
        this._scheduleReconnect(true);
      }
    }

    _handleConnectionWake() {
      if (root.document?.visibilityState === 'hidden' || root.document?.hidden === true) return;
      if (this.disposed || !this.roomCode) return;
      this.reconnectPausedUntilWake = false;
      const socket = this.transport.socket;
      if (this.client.status === 'disconnected' || (socket && socket.readyState !== 1)) {
        this._scheduleReconnect(true);
        return;
      }
      // Browser background throttling can defer interval heartbeats. Send one
      // immediately when the tab becomes active so intermediaries and the
      // authority see traffic without waiting for the next interval.
      this._sendHeartbeat();
    }

    _scheduleReconnect(immediate = false) {
      if (this.disposed || this.reconnectPausedUntilWake
        || !this.roomCode || !this.client.reconnectToken || this.reconnectInFlight) return;
      if (this.reconnectTimer !== null) {
        if (!immediate) return;
        root.clearTimeout?.(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      const delay = immediate ? 0 : Math.min(8_000, 750 * (2 ** Math.min(this.reconnectAttempts, 4)));
      this.reconnectTimer = root.setTimeout?.(async () => {
        this.reconnectTimer = null;
        if (this.disposed) return;
        this.reconnectInFlight = true;
        this.reconnectAttempts += 1;
        try {
          await this.client.connect(this.roomCode);
          this.reconnectAttempts = 0;
          this._notify();
        } catch (error) {
          this.client.errors.push({ code: 'RECONNECT_FAILED', message: String(error?.message || error) });
          this._notify();
        } finally {
          this.reconnectInFlight = false;
        }
        if (this.client.status === 'disconnected') this._scheduleReconnect();
      }, delay) ?? null;
    }

    dispose(reason = 'left') {
      this.disposed = true;
      if (this.reconnectTimer !== null) root.clearTimeout?.(this.reconnectTimer);
      this.reconnectTimer = null;
      if (this.heartbeatTimer !== null) root.clearInterval?.(this.heartbeatTimer);
      this.heartbeatTimer = null;
      root.document?.removeEventListener?.('visibilitychange', this.boundConnectionWake);
      root.removeEventListener?.('focus', this.boundConnectionWake);
      this.unsubscribeMessage?.();
      this.unsubscribeDisconnect?.();
      this.unsubscribeTabCoordinator?.();
      if (isIntentionalReason(reason)) this.resumeStore?.clear();
      this.tabCoordinator?.dispose?.();
      const leaveResult = this.client.leave?.(reason);
      if (leaveResult && typeof leaveResult.finally === 'function') leaveResult.finally(() => this.client.dispose());
      else this.client.dispose();
      this.listeners.clear();
    }
  }

  BrowserMultiplayerSession.peekResumeDescriptor = function peekResumeDescriptor(options = {}) {
    const storage = safeStorage(options.storage);
    if (!storage || !resumeApi?.createResumeStore) return null;
    return resumeApi.createResumeStore({ storage, key: options.resumeStorageKey }).load(options.requirements);
  };

  return { HEARTBEAT_INTERVAL_MS, BrowserMultiplayerSession };
});
