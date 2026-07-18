(function initializeLocalMultiplayerSession(root, factory) {
  const api = factory(root.NeoNyke?.multiplayer || {}, root.NeoNyke?.simulation || {}, root.NeoNyke?.protocol || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.multiplayer = namespace.multiplayer || {};
  Object.assign(namespace.multiplayer, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLocalSessionApi(browserMultiplayerApi, browserSimulationApi, browserProtocolApi) {
  'use strict';

  const simulationApi = typeof require === 'function' ? require('../simulation/GameSimulation.js') : browserSimulationApi;
  const gameStateApi = typeof require === 'function' ? require('../simulation/GameState.js') : browserSimulationApi;
  const protocolApi = typeof require === 'function' ? require('../protocol/ProtocolV1.js') : browserProtocolApi;
  const { GameSimulation, FIXED_DELTA_SECONDS, SIMULATION_TICK_RATE } = simulationApi;
  const { GameState, cloneSerializable } = gameStateApi;
  const {
    CLIENT_TO_AUTHORITY,
    AUTHORITY_TO_CLIENT,
    MAX_CLIENT_MESSAGE_BYTES,
    validateEnvelope,
    createEnvelope,
    getDeliveryIntent,
  } = protocolApi;

  const LOCAL_BUILD_VERSION = '1.0.0-local';
  const LOCAL_GENERATION_VERSION = 1;
  const LOCAL_CONTENT_HASH = 'local-test-room-v1';
  const LOCAL_CONTENT_VERSION = 'local-test-room-v1';
  const SNAPSHOT_RATE = 10;
  const SNAPSHOT_TICK_INTERVAL = SIMULATION_TICK_RATE / SNAPSHOT_RATE;
  const FULL_CORRECTION_TICK_INTERVAL = SIMULATION_TICK_RATE;
  const TEST_ROOM = Object.freeze({ id: 'local-test-room', width: 900, height: 700 });

  function createPlayerMovementSystem(room = TEST_ROOM) {
    return ({ state, inputs, fixedDelta }) => {
      Object.values(state.players).forEach(player => {
        if (!player || player.disconnected) return;
        const input = inputs[player.id] || {};
        let moveX = Number(input.moveX) || 0;
        let moveY = Number(input.moveY) || 0;
        const magnitude = Math.hypot(moveX, moveY);
        if (magnitude > 1) {
          moveX /= magnitude;
          moveY /= magnitude;
        }
        const speed = Math.max(0, Number(player.moveSpeed) || 180);
        const radius = Math.max(1, Number(player.radius) || 18);
        player.x = Math.max(radius, Math.min(room.width - radius, player.x + moveX * speed * fixedDelta));
        player.y = Math.max(radius, Math.min(room.height - radius, player.y + moveY * speed * fixedDelta));
        player.vx = moveX * speed;
        player.vy = moveY * speed;
        player.aimDirection = Number(input.aimDirection) || 0;
      });
    };
  }

  function messageDeliveryMatches(type, delivery) {
    const expected = getDeliveryIntent(type);
    return expected.channel === delivery?.channel && expected.reliability === delivery?.reliability;
  }

  class LocalMultiplayerAuthority {
    constructor(options = {}) {
      if (!options.transport) throw new TypeError('LocalMultiplayerAuthority requires a transport');
      this.transport = options.transport;
      this.sessionId = String(options.sessionId || 'neo-local-room');
      this.minPlayers = Math.max(1, Math.min(4, Math.trunc(Number(options.minPlayers) || 2)));
      this.maxPlayers = Math.max(this.minPlayers, Math.min(4, Math.trunc(Number(options.maxPlayers) || 4)));
      this.buildVersion = String(options.buildVersion || LOCAL_BUILD_VERSION);
      this.generationVersion = Math.max(1, Math.trunc(Number(options.generationVersion) || LOCAL_GENERATION_VERSION));
      this.contentHash = String(options.contentHash || LOCAL_CONTENT_HASH);
      this.contentVersion = String(options.contentVersion || LOCAL_CONTENT_VERSION);
      this.matchSeed = options.matchSeed ?? 'local-match-seed';
      this.outgoingSequence = 0;
      this.snapshotSequence = 0;
      this.peerRecords = new Map();
      this.playerIdByPeer = new Map();
      this.pendingInputs = {};
      this.lastProcessedInput = {};
      this.seenReliableSequences = new Map();
      this.lastReplaceableSequence = new Map();
      this.invalidMessageCount = new Map();
      this.metrics = { acceptedInputs: 0, duplicateInputs: 0, invalidMessages: 0, snapshots: 0 };
      const state = new GameState({
        matchId: String(options.matchId || 'local-match'),
        matchSeed: this.matchSeed,
        floorSeed: `${this.matchSeed}|floor:1`,
        generationVersion: this.generationVersion,
        contentVersion: this.contentVersion,
        status: 'waiting',
        floorState: TEST_ROOM,
      });
      this.simulation = new GameSimulation({ state, systems: [createPlayerMovementSystem(TEST_ROOM)] });
      this.unsubscribeMessage = this.transport.onMessage((peerId, message, delivery) => this._onMessage(peerId, message, delivery));
      this.unsubscribeDisconnect = this.transport.onPeerDisconnected((identity, reason) => this._onPeerDisconnected(identity, reason));
    }

    async start() {
      await this.transport.initialize();
      return this.transport.createSession({ sessionId: this.sessionId, maxPeers: this.maxPlayers + 1 });
    }

    _send(peerId, type, payload, deliveryOverride = null) {
      const message = createEnvelope(type, this.outgoingSequence++, this.simulation.state.tick, payload);
      this.transport.send(peerId, message, deliveryOverride || getDeliveryIntent(type));
      return message;
    }

    _broadcast(type, payload, deliveryOverride = null) {
      const message = createEnvelope(type, this.outgoingSequence++, this.simulation.state.tick, payload);
      this.transport.broadcast(message, deliveryOverride || getDeliveryIntent(type));
      return message;
    }

    _onMessage(peerId, message, delivery) {
      const validation = validateEnvelope(message, { direction: CLIENT_TO_AUTHORITY, maxBytes: MAX_CLIENT_MESSAGE_BYTES });
      if (!validation.ok || !messageDeliveryMatches(message.type, delivery)) {
        this._rejectInvalidMessage(peerId, validation.ok ? ['delivery intent is invalid'] : validation.errors);
        return;
      }
      if (delivery.reliability === 'reliable') {
        const seen = this.seenReliableSequences.get(peerId) || new Set();
        if (seen.has(message.sequence)) return;
        seen.add(message.sequence);
        if (seen.size > 256) seen.delete(seen.values().next().value);
        this.seenReliableSequences.set(peerId, seen);
      } else {
        const key = `${peerId}|${message.type}`;
        const last = this.lastReplaceableSequence.get(key);
        if (last !== undefined && message.sequence <= last) return;
        this.lastReplaceableSequence.set(key, message.sequence);
      }

      switch (message.type) {
        case 'CLIENT_HELLO': this._handleHello(peerId, message.payload); break;
        case 'JOIN_MATCH': this._handleJoin(peerId, message.payload); break;
        case 'PLAYER_READY': this._handleReady(peerId, message.payload); break;
        case 'PLAYER_INPUT': this._handleInput(peerId, message.payload); break;
        case 'PING': this._send(peerId, 'PONG', {
          nonce: message.payload.nonce,
          clientTime: message.payload.clientTime,
          serverTick: this.simulation.state.tick,
        }); break;
        case 'LEAVE_MATCH': this.transport.disconnectPeer?.(peerId, message.payload.reason || 'left'); break;
        default: this._rejectInvalidMessage(peerId, [`${message.type} is not implemented by the local test authority`]);
      }
    }

    _handleHello(peerId, payload) {
      const compatible = payload.buildVersion === this.buildVersion
        && payload.generationVersion === this.generationVersion
        && payload.contentHash === this.contentHash;
      if (!compatible) {
        this._send(peerId, 'JOIN_REJECTED', {
          code: 'VERSION_MISMATCH',
          message: 'This lobby is using a different Neo Nyke build. Update the game and try again.',
        });
        return;
      }
      const record = this.peerRecords.get(peerId) || {};
      record.helloAccepted = true;
      this.peerRecords.set(peerId, record);
      this._send(peerId, 'SERVER_HELLO', {
        buildVersion: this.buildVersion,
        generationVersion: this.generationVersion,
        contentHash: this.contentHash,
        tickRate: SIMULATION_TICK_RATE,
        snapshotRate: SNAPSHOT_RATE,
        maxMessageBytes: MAX_CLIENT_MESSAGE_BYTES,
      });
    }

    _handleJoin(peerId, payload) {
      const record = this.peerRecords.get(peerId);
      if (!record?.helloAccepted) return this._rejectInvalidMessage(peerId, ['CLIENT_HELLO is required before JOIN_MATCH']);
      if (payload.sessionId !== this.sessionId) {
        this._send(peerId, 'JOIN_REJECTED', { code: 'INVALID_SESSION', message: 'The local multiplayer session does not exist.' });
        return;
      }
      if (this.simulation.state.status !== 'waiting') {
        this._send(peerId, 'JOIN_REJECTED', { code: 'MATCH_STARTED', message: 'The local multiplayer match has already started.' });
        return;
      }
      if (this.playerIdByPeer.has(peerId)) return;
      if (this.playerIdByPeer.size >= this.maxPlayers) {
        this._send(peerId, 'JOIN_REJECTED', { code: 'ROOM_FULL', message: 'The local multiplayer room is full.' });
        return;
      }
      const playerId = this.simulation.state.allocateEntityId('player');
      const slotIndex = this.playerIdByPeer.size;
      this.playerIdByPeer.set(peerId, playerId);
      record.playerId = playerId;
      record.ready = false;
      this.simulation.state.players[playerId] = {
        id: playerId,
        peerId,
        displayName: this.transport.getPeerIdentity?.(peerId)?.displayName || peerId,
        x: 300 + slotIndex * 300,
        y: TEST_ROOM.height / 2,
        vx: 0,
        vy: 0,
        radius: 18,
        moveSpeed: 180,
        aimDirection: 0,
      };
      this.pendingInputs[playerId] = { moveX: 0, moveY: 0, aimDirection: 0, buttons: 0 };
      this.lastProcessedInput[playerId] = -1;
      this._send(peerId, 'JOIN_ACCEPTED', {
        matchId: this.simulation.state.matchId,
        sessionId: this.sessionId,
        playerId,
      });
      this._broadcastLobbyState();
    }

    _handleReady(peerId, payload) {
      const record = this.peerRecords.get(peerId);
      if (!record?.playerId || this.simulation.state.status !== 'waiting') return;
      record.ready = payload.ready;
      this._broadcastLobbyState();
      const joined = Array.from(this.peerRecords.values()).filter(peer => peer.playerId);
      if (joined.length >= this.minPlayers && joined.every(peer => peer.ready)) this._startMatch();
    }

    _handleInput(peerId, payload) {
      const playerId = this.playerIdByPeer.get(peerId);
      if (!playerId || this.simulation.state.status !== 'running') return;
      if (payload.inputSequence <= this.lastProcessedInput[playerId]) {
        this.metrics.duplicateInputs += 1;
        return;
      }
      let moveX = payload.moveX;
      let moveY = payload.moveY;
      const magnitude = Math.hypot(moveX, moveY);
      if (magnitude > 1) {
        moveX /= magnitude;
        moveY /= magnitude;
      }
      this.pendingInputs[playerId] = {
        moveX,
        moveY,
        aimDirection: payload.aimDirection,
        buttons: payload.buttons || 0,
      };
      this.lastProcessedInput[playerId] = payload.inputSequence;
      this.metrics.acceptedInputs += 1;
    }

    _startMatch() {
      if (this.simulation.state.status !== 'waiting') return;
      this.simulation.state.status = 'starting';
      this._broadcast('MATCH_STARTING', {
        startTick: this.simulation.state.tick,
        matchSeed: this.simulation.state.matchSeed,
        floorSeed: this.simulation.state.floorSeed,
        generationVersion: this.generationVersion,
        contentVersion: this.contentVersion,
      });
      this.simulation.state.status = 'running';
      this._broadcast('INITIAL_STATE', {
        serverTick: this.simulation.state.tick,
        state: this.simulation.state.snapshot(),
        lastProcessedInput: { ...this.lastProcessedInput },
      });
      this._broadcastLobbyState();
    }

    _broadcastLobbyState() {
      const members = Array.from(this.playerIdByPeer.entries()).map(([peerId, playerId]) => ({
        peerId,
        playerId,
        displayName: this.simulation.state.players[playerId]?.displayName || peerId,
        ready: !!this.peerRecords.get(peerId)?.ready,
      }));
      this._broadcast('LOBBY_STATE', {
        status: this.simulation.state.status === 'starting' ? 'starting' : this.simulation.state.status,
        members,
        minPlayers: this.minPlayers,
        maxPlayers: this.maxPlayers,
      });
    }

    _rejectInvalidMessage(peerId, errors) {
      this.metrics.invalidMessages += 1;
      const count = (this.invalidMessageCount.get(peerId) || 0) + 1;
      this.invalidMessageCount.set(peerId, count);
      try {
        this._send(peerId, 'ERROR', {
          code: 'INVALID_MESSAGE',
          message: String(errors[0] || 'Invalid multiplayer message').slice(0, 256),
          fatal: count >= 5,
        });
      } catch {
        // A malformed/disconnected peer may no longer be reachable.
      }
      if (count >= 5) this.transport.disconnectPeer?.(peerId, 'invalid-message-limit');
    }

    _onPeerDisconnected(identity, reason) {
      const peerId = identity?.id;
      const playerId = this.playerIdByPeer.get(peerId);
      if (!playerId) return;
      this.playerIdByPeer.delete(peerId);
      this.peerRecords.delete(peerId);
      delete this.pendingInputs[playerId];
      delete this.lastProcessedInput[playerId];
      delete this.simulation.state.players[playerId];
      if (this.transport.sessionId) {
        this._broadcast('PLAYER_DISCONNECTED', { playerId, reason: String(reason || 'disconnected').slice(0, 96) });
        this._broadcastLobbyState();
      }
    }

    step(tickCount = 1) {
      const count = Math.max(0, Math.trunc(Number(tickCount) || 0));
      for (let index = 0; index < count; index += 1) {
        if (this.simulation.state.status !== 'running') break;
        this.simulation.updateGame(this.pendingInputs, FIXED_DELTA_SECONDS);
        if (this.simulation.state.tick % SNAPSHOT_TICK_INTERVAL === 0) {
          this._publishSnapshot(this.simulation.state.tick % FULL_CORRECTION_TICK_INTERVAL === 0);
        }
      }
      return this.simulation.state;
    }

    _publishSnapshot(full) {
      const payload = {
        snapshotSequence: this.snapshotSequence++,
        serverTick: this.simulation.state.tick,
        full,
        lastProcessedInput: { ...this.lastProcessedInput },
        entities: {
          players: cloneSerializable(this.simulation.state.players),
          enemies: {},
          projectiles: {},
          pickups: {},
          interactables: {},
        },
        removedEntityIds: [],
        floorState: cloneSerializable(this.simulation.state.floorState),
        bossState: null,
      };
      const delivery = full
        ? { reliability: 'reliable', channel: 'snapshot', replaceable: false }
        : getDeliveryIntent('WORLD_SNAPSHOT');
      this._broadcast('WORLD_SNAPSHOT', payload, delivery);
      this.metrics.snapshots += 1;
    }

    sendFullCorrection() {
      if (this.simulation.state.status === 'running') this._publishSnapshot(true);
    }

    dispose() {
      this.unsubscribeMessage?.();
      this.unsubscribeDisconnect?.();
      this.transport.dispose();
    }
  }

  class LocalMultiplayerClient {
    constructor(options = {}) {
      if (!options.transport) throw new TypeError('LocalMultiplayerClient requires a transport');
      this.transport = options.transport;
      this.buildVersion = String(options.buildVersion || LOCAL_BUILD_VERSION);
      this.generationVersion = Math.max(1, Math.trunc(Number(options.generationVersion) || LOCAL_GENERATION_VERSION));
      this.contentHash = String(options.contentHash || LOCAL_CONTENT_HASH);
      this.outgoingSequence = 0;
      this.inputSequence = 0;
      this.authorityPeerId = null;
      this.sessionId = null;
      this.playerId = null;
      this.status = 'disconnected';
      this.state = null;
      this.lobbyState = null;
      this.latestSnapshotSequence = -1;
      this.lastAcknowledgedInput = -1;
      this.seenReliableSequences = new Set();
      this.receivedTypes = [];
      this.errors = [];
      this.unsubscribeMessage = this.transport.onMessage((peerId, message, delivery) => this._onMessage(peerId, message, delivery));
      this.unsubscribeDisconnect = this.transport.onPeerDisconnected((identity, reason) => {
        if (identity?.id === this.authorityPeerId) {
          this.status = 'disconnected';
          this.errors.push({ code: 'AUTHORITY_DISCONNECTED', message: String(reason || 'Authority disconnected') });
        }
      });
    }

    async connect(sessionId) {
      await this.transport.initialize();
      const joined = await this.transport.joinSession(sessionId);
      this.sessionId = joined.sessionId;
      this.authorityPeerId = joined.authorityPeerId;
      this.status = 'connecting';
      this._send('CLIENT_HELLO', {
        buildVersion: this.buildVersion,
        generationVersion: this.generationVersion,
        contentHash: this.contentHash,
        requestedIdentityProvider: this.transport.identity.provider,
      });
      this._send('JOIN_MATCH', { sessionId: this.sessionId });
      return joined;
    }

    _send(type, payload) {
      if (!this.authorityPeerId) throw new Error('Client has no authority peer');
      const tick = this.state?.tick || 0;
      const message = createEnvelope(type, this.outgoingSequence++, tick, payload);
      this.transport.send(this.authorityPeerId, message, getDeliveryIntent(type));
      return message;
    }

    sendReady(ready = true) {
      if (!this.playerId) throw new Error('Client has not joined the match');
      this._send('PLAYER_READY', { ready: !!ready });
    }

    sendInput(input = {}) {
      if (this.status !== 'running') throw new Error('Client match is not running');
      const inputSequence = this.inputSequence++;
      this._send('PLAYER_INPUT', {
        inputSequence,
        moveX: Math.max(-1, Math.min(1, Number(input.moveX) || 0)),
        moveY: Math.max(-1, Math.min(1, Number(input.moveY) || 0)),
        aimDirection: Number(input.aimDirection) || 0,
        buttons: Math.max(0, Math.min(0xffff, Math.trunc(Number(input.buttons) || 0))),
      });
      return inputSequence;
    }

    ping(nonce = `ping-${this.outgoingSequence}`) {
      this._send('PING', { nonce, clientTime: Math.max(0, this.transport.network?.clock?.now?.() || Date.now()) });
    }

    _onMessage(peerId, message, delivery) {
      if (peerId !== this.authorityPeerId) return;
      const validation = validateEnvelope(message, { direction: AUTHORITY_TO_CLIENT });
      if (!validation.ok) {
        this.errors.push({ code: 'INVALID_AUTHORITY_MESSAGE', message: validation.errors.join('; ') });
        return;
      }
      if (delivery.reliability === 'reliable') {
        if (this.seenReliableSequences.has(message.sequence)) return;
        this.seenReliableSequences.add(message.sequence);
        if (this.seenReliableSequences.size > 512) this.seenReliableSequences.delete(this.seenReliableSequences.values().next().value);
      }
      this.receivedTypes.push(message.type);
      switch (message.type) {
        case 'SERVER_HELLO': this.status = 'handshaking'; break;
        case 'JOIN_ACCEPTED':
          this.playerId = message.payload.playerId;
          this.status = 'waiting';
          break;
        case 'JOIN_REJECTED':
          this.status = 'rejected';
          this.errors.push(message.payload);
          break;
        case 'LOBBY_STATE': this.lobbyState = cloneSerializable(message.payload); break;
        case 'MATCH_STARTING':
          if (this.status !== 'running') this.status = 'starting';
          break;
        case 'INITIAL_STATE':
          this.state = new GameState(message.payload.state);
          this.lastAcknowledgedInput = message.payload.lastProcessedInput[this.playerId] ?? -1;
          this.status = 'running';
          break;
        case 'WORLD_SNAPSHOT': this._applySnapshot(message.payload); break;
        case 'PLAYER_DISCONNECTED':
          if (this.state) delete this.state.players[message.payload.playerId];
          break;
        case 'RUN_ENDED': this.status = 'ended'; break;
        case 'ERROR':
          this.errors.push(message.payload);
          if (message.payload.fatal) this.status = 'rejected';
          break;
        default: break;
      }
    }

    _applySnapshot(snapshot) {
      if (snapshot.snapshotSequence <= this.latestSnapshotSequence) return;
      this.latestSnapshotSequence = snapshot.snapshotSequence;
      if (!this.state) return;
      this.state.tick = snapshot.serverTick;
      this.state.players = cloneSerializable(snapshot.entities.players || {});
      this.state.enemies = cloneSerializable(snapshot.entities.enemies || {});
      this.state.projectiles = cloneSerializable(snapshot.entities.projectiles || {});
      this.state.pickups = cloneSerializable(snapshot.entities.pickups || {});
      this.state.interactables = cloneSerializable(snapshot.entities.interactables || {});
      this.state.floorState = cloneSerializable(snapshot.floorState || this.state.floorState);
      this.state.bossState = snapshot.bossState == null ? null : cloneSerializable(snapshot.bossState);
      this.lastAcknowledgedInput = snapshot.lastProcessedInput[this.playerId] ?? this.lastAcknowledgedInput;
    }

    getStateSnapshot() {
      return this.state?.snapshot() || null;
    }

    dispose() {
      this.unsubscribeMessage?.();
      this.unsubscribeDisconnect?.();
      this.transport.dispose();
    }
  }

  return {
    LOCAL_BUILD_VERSION,
    LOCAL_GENERATION_VERSION,
    LOCAL_CONTENT_HASH,
    LOCAL_CONTENT_VERSION,
    SNAPSHOT_RATE,
    TEST_ROOM,
    createPlayerMovementSystem,
    LocalMultiplayerAuthority,
    LocalMultiplayerClient,
    MultiplayerRoomAuthority: LocalMultiplayerAuthority,
    MultiplayerRoomClient: LocalMultiplayerClient,
  };
});
