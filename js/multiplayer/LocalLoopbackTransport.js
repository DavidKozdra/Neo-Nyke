(function initializeLocalLoopbackTransport(root, factory) {
  const api = factory(root.NeoNyke?.multiplayer || {}, root.NeoNyke?.simulation || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.multiplayer = namespace.multiplayer || {};
  Object.assign(namespace.multiplayer, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLocalLoopbackApi(browserTransportApi, browserSimulationApi) {
  'use strict';

  const transportApi = typeof require === 'function' ? require('./NetworkTransport.js') : browserTransportApi;
  const randomApi = typeof require === 'function' ? require('../simulation/RandomService.js') : browserSimulationApi;
  const { NetworkTransport, normalizeDeliveryOptions } = transportApi;
  const { RandomService } = randomApi;

  class RealNetworkClock {
    now() {
      return Date.now();
    }

    schedule(callback, delayMs) {
      return setTimeout(callback, Math.max(0, delayMs));
    }

    cancel(taskId) {
      clearTimeout(taskId);
    }
  }

  class VirtualNetworkClock {
    constructor(startTimeMs = 0) {
      this.timeMs = Math.max(0, Number(startTimeMs) || 0);
      this.nextTaskId = 1;
      this.tasks = [];
    }

    now() {
      return this.timeMs;
    }

    schedule(callback, delayMs) {
      const task = {
        id: this.nextTaskId++,
        at: this.timeMs + Math.max(0, Number(delayMs) || 0),
        callback,
        cancelled: false,
      };
      this.tasks.push(task);
      return task.id;
    }

    cancel(taskId) {
      const task = this.tasks.find(candidate => candidate.id === taskId);
      if (task) task.cancelled = true;
    }

    advanceBy(milliseconds) {
      return this.advanceTo(this.timeMs + Math.max(0, Number(milliseconds) || 0));
    }

    advanceTo(targetTimeMs, maxTasks = 100_000) {
      const target = Math.max(this.timeMs, Number(targetTimeMs) || this.timeMs);
      let executed = 0;
      while (executed < maxTasks) {
        this.tasks.sort((a, b) => a.at - b.at || a.id - b.id);
        const task = this.tasks.find(candidate => !candidate.cancelled && candidate.at <= target);
        if (!task) break;
        this.tasks.splice(this.tasks.indexOf(task), 1);
        this.timeMs = task.at;
        task.callback();
        executed += 1;
      }
      this.tasks = this.tasks.filter(task => !task.cancelled);
      this.timeMs = target;
      if (executed >= maxTasks) throw new Error('VirtualNetworkClock exceeded its task safety limit');
      return executed;
    }

    runAll(maxTasks = 100_000) {
      let executed = 0;
      while (this.tasks.some(task => !task.cancelled)) {
        const nextTime = Math.min(...this.tasks.filter(task => !task.cancelled).map(task => task.at));
        executed += this.advanceTo(nextTime, maxTasks - executed);
        if (executed >= maxTasks) throw new Error('VirtualNetworkClock exceeded its task safety limit');
      }
      return executed;
    }
  }

  class LocalLoopbackNetwork {
    constructor(options = {}) {
      this.latencyMs = Math.max(0, Number(options.latencyMs) || 0);
      this.jitterMs = Math.max(0, Number(options.jitterMs) || 0);
      this.unreliablePacketLoss = Math.max(0, Math.min(1, Number(options.unreliablePacketLoss) || 0));
      this.duplicateMessageRate = Math.max(0, Math.min(1, Number(options.duplicateMessageRate) || 0));
      this.clock = options.clock || new RealNetworkClock();
      const randomService = new RandomService({ matchSeed: options.seed ?? 'local-loopback' });
      this.random = typeof options.random === 'function'
        ? options.random
        : () => randomService.next('network-simulation');
      this.transports = new Map();
      this.sessions = new Map();
      this.lastReliableDeliveryAt = new Map();
      this.metrics = { sent: 0, delivered: 0, dropped: 0, duplicated: 0, bytes: 0 };
    }

    register(transport) {
      const peerId = transport.identity.id;
      const existing = this.transports.get(peerId);
      if (existing && existing !== transport) throw new Error(`Duplicate local peer identity: ${peerId}`);
      this.transports.set(peerId, transport);
    }

    unregister(transport, reason = 'disposed') {
      if (transport.sessionId) this.leaveSession(transport, reason);
      if (this.transports.get(transport.identity.id) === transport) this.transports.delete(transport.identity.id);
    }

    createSession(transport, options = {}) {
      const sessionId = String(options.sessionId || `local-${this.sessions.size + 1}`);
      if (this.sessions.has(sessionId)) throw new Error(`Local session already exists: ${sessionId}`);
      const maxPeers = Math.max(2, Math.min(5, Math.trunc(Number(options.maxPeers) || 5)));
      const session = { id: sessionId, authorityPeerId: transport.identity.id, maxPeers, peers: new Set([transport.identity.id]) };
      this.sessions.set(sessionId, session);
      transport.sessionId = sessionId;
      return { sessionId, authorityPeerId: session.authorityPeerId };
    }

    joinSession(transport, sessionId) {
      const id = String(sessionId || '');
      const session = this.sessions.get(id);
      if (!session) throw new Error(`Unknown local session: ${id}`);
      if (session.peers.size >= session.maxPeers) throw new Error(`Local session is full: ${id}`);
      if (transport.sessionId && transport.sessionId !== id) this.leaveSession(transport, 'changed-session');
      const existingPeers = Array.from(session.peers);
      session.peers.add(transport.identity.id);
      transport.sessionId = id;
      existingPeers.forEach(peerId => {
        const peer = this.transports.get(peerId);
        peer?._emit('peerConnected', transport.getLocalIdentity());
        if (peer) transport._emit('peerConnected', peer.getLocalIdentity());
      });
      return { sessionId: id, authorityPeerId: session.authorityPeerId };
    }

    leaveSession(transport, reason = 'left') {
      const session = this.sessions.get(transport.sessionId);
      if (!session) {
        transport.sessionId = null;
        return;
      }
      const peerId = transport.identity.id;
      session.peers.delete(peerId);
      transport.sessionId = null;
      if (peerId === session.authorityPeerId) {
        Array.from(session.peers).forEach(otherId => {
          const other = this.transports.get(otherId);
          if (!other) return;
          other.sessionId = null;
          other._emit('peerDisconnected', transport.getLocalIdentity(), 'authority-disconnected');
        });
        this.sessions.delete(session.id);
      } else {
        session.peers.forEach(otherId => {
          this.transports.get(otherId)?._emit('peerDisconnected', transport.getLocalIdentity(), reason);
        });
        if (session.peers.size === 0) this.sessions.delete(session.id);
      }
    }

    disconnectPeer(peerId, reason = 'simulated-disconnect') {
      const transport = this.transports.get(String(peerId));
      if (!transport) return false;
      this.leaveSession(transport, reason);
      return true;
    }

    send(sender, peerId, message, options = {}) {
      const delivery = normalizeDeliveryOptions(options);
      const targetId = String(peerId || '');
      const session = this.sessions.get(sender.sessionId);
      if (!session || !session.peers.has(sender.identity.id)) throw new Error('Sender is not in a local session');
      if (!session.peers.has(targetId)) throw new Error(`Peer is not in the local session: ${targetId}`);
      const target = this.transports.get(targetId);
      if (!target) throw new Error(`Unknown local peer: ${targetId}`);
      const serialized = JSON.stringify(message);
      const cloned = JSON.parse(serialized);
      this.metrics.sent += 1;
      this.metrics.bytes += typeof Buffer !== 'undefined'
        ? Buffer.byteLength(serialized, 'utf8')
        : new TextEncoder().encode(serialized).byteLength;
      if (delivery.reliability === 'unreliable' && this.random() < this.unreliablePacketLoss) {
        this.metrics.dropped += 1;
        return { queued: false, dropped: true };
      }
      this._scheduleDelivery(sender.identity.id, target, cloned, delivery, 0);
      if (this.random() < this.duplicateMessageRate) {
        this.metrics.duplicated += 1;
        this._scheduleDelivery(sender.identity.id, target, cloned, delivery, 1);
      }
      return { queued: true, dropped: false };
    }

    broadcast(sender, message, options = {}) {
      const session = this.sessions.get(sender.sessionId);
      if (!session) throw new Error('Sender is not in a local session');
      const results = [];
      session.peers.forEach(peerId => {
        if (peerId !== sender.identity.id) results.push(this.send(sender, peerId, message, options));
      });
      return results;
    }

    _scheduleDelivery(senderPeerId, target, message, delivery, duplicateOffsetMs) {
      const jitter = this.jitterMs > 0 ? (this.random() * 2 - 1) * this.jitterMs : 0;
      let deliveryAt = this.clock.now() + Math.max(0, this.latencyMs + jitter + duplicateOffsetMs);
      if (delivery.reliability === 'reliable') {
        const orderingKey = `${senderPeerId}|${target.identity.id}|${delivery.channel}`;
        deliveryAt = Math.max(deliveryAt, (this.lastReliableDeliveryAt.get(orderingKey) || 0) + 0.001);
        this.lastReliableDeliveryAt.set(orderingKey, deliveryAt);
      }
      const delay = Math.max(0, deliveryAt - this.clock.now());
      this.clock.schedule(() => {
        if (!target.sessionId) return;
        this.metrics.delivered += 1;
        target._emit('message', senderPeerId, JSON.parse(JSON.stringify(message)), { ...delivery });
      }, delay);
    }

    getMetrics() {
      return { ...this.metrics };
    }
  }

  class LocalLoopbackTransport extends NetworkTransport {
    constructor(options = {}) {
      super(options);
      if (!(options.network instanceof LocalLoopbackNetwork)) {
        throw new TypeError('LocalLoopbackTransport requires a LocalLoopbackNetwork');
      }
      this.network = options.network;
    }

    async initialize() {
      if (this.initialized) return;
      this.network.register(this);
      await super.initialize();
    }

    async createSession(options = {}) {
      if (!this.initialized) await this.initialize();
      return this.network.createSession(this, options);
    }

    async joinSession(sessionId) {
      if (!this.initialized) await this.initialize();
      return this.network.joinSession(this, sessionId);
    }

    async leaveSession(reason = 'left') {
      this.network.leaveSession(this, reason);
    }

    send(peerId, message, options = {}) {
      return this.network.send(this, peerId, message, options);
    }

    broadcast(message, options = {}) {
      return this.network.broadcast(this, message, options);
    }

    getPeerIdentity(peerId) {
      return this.network.transports.get(String(peerId))?.getLocalIdentity() || null;
    }

    disconnectPeer(peerId, reason = 'transport-disconnect') {
      return this.network.disconnectPeer(peerId, reason);
    }

    dispose() {
      this.network.unregister(this);
      super.dispose();
    }
  }

  return { RealNetworkClock, VirtualNetworkClock, LocalLoopbackNetwork, LocalLoopbackTransport };
});
