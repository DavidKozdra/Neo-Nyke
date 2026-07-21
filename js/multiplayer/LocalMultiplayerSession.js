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
  const campaignApi = typeof require === 'function' ? require('../simulation/CampaignSimulation.js') : browserSimulationApi;
  const floorApi = typeof require === 'function' ? require('../simulation/DeterministicFloorGenerator.js') : browserSimulationApi;
  const combatApi = typeof require === 'function' ? require('../simulation/NetworkCombatSystem.js') : browserSimulationApi;
  const runServiceApi = typeof require === 'function' ? require('../simulation/SharedRunServiceSystem.js') : browserSimulationApi;
  const worldContentApi = typeof require === 'function' ? require('../simulation/SharedWorldContent.js') : (globalThis.NeoNyke?.content || {});
  const protocolApi = typeof require === 'function' ? require('../protocol/ProtocolV1.js') : browserProtocolApi;
  const { GameSimulation, FIXED_DELTA_SECONDS, SIMULATION_TICK_RATE } = simulationApi;
  const { GameState, cloneSerializable } = gameStateApi;
  const {
    createCampaignSimulation,
    createCampaignFloorState,
    createCampaignMovementSystem,
    CAMPAIGN_CONTENT_VERSION,
  } = campaignApi;
  const { generateFloorLayout } = floorApi;
  const { applyNetworkHeroProfile, sanitizeKitChoices, createNetworkCombatSystem, createFloorProgressionSystem, ensureNetworkEncounter, isNetworkRoomLocked } = combatApi;
  const { applyAuthorityRunEvent = () => ({ ok: false }) } = runServiceApi;
  const {
    CLIENT_TO_AUTHORITY,
    AUTHORITY_TO_CLIENT,
    MAX_CLIENT_MESSAGE_BYTES,
    validateEnvelope,
    createEnvelope,
    getDeliveryIntent,
  } = protocolApi;

  const LOCAL_BUILD_VERSION = '1.0.0-campaign-parity-v30';
  const LOCAL_GENERATION_VERSION = 1;
  const LOCAL_CONTENT_HASH = CAMPAIGN_CONTENT_VERSION || 'shared-neo-campaign-parity-v27';
  const LOCAL_CONTENT_VERSION = CAMPAIGN_CONTENT_VERSION || 'shared-neo-campaign-parity-v27';
  const SNAPSHOT_RATE = 10;
  const SNAPSHOT_TICK_INTERVAL = SIMULATION_TICK_RATE / SNAPSHOT_RATE;
  const FULL_CORRECTION_TICK_INTERVAL = SIMULATION_TICK_RATE;
  const TEST_ROOM = Object.freeze({ id: 'network-start-room', ...worldContentApi.CAMPAIGN_ROOM_GEOMETRY });
  const PLAYER_CHARACTERS = Object.freeze(['thorn_knight', 'metao', 'gelleh', 'mooggy']);
  const SELECTABLE_CHARACTERS = Object.freeze(['princess', 'thorn_knight', 'metao', 'gelleh', 'mooggy', 'turtle_boy', 'sarge']);
  const RECONNECT_RESERVATION_TICKS = SIMULATION_TICK_RATE * 45;
  const CHAT_COOLDOWN_MS = 500;
  const SNAPSHOT_ENTITY_COLLECTIONS = Object.freeze([
    'players', 'enemies', 'projectiles', 'abilityEntities', 'pickups', 'interactables',
  ]);

  function isIntentionalDisconnectReason(reason) {
    const normalized = String(reason || '').trim().toLowerCase();
    return ['left', 'leave', 'disposed', 'quit', 'menu', 'changed-session']
      .some(value => normalized === value || normalized.startsWith(`${value}-`));
  }

  function createReconnectToken() {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `reconnect-${uuid}`;
    return `reconnect-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }

  function createNetworkFloorState(options = {}) {
    if (typeof createCampaignFloorState === 'function') return createCampaignFloorState(options);
    const layout = typeof generateFloorLayout === 'function'
      ? generateFloorLayout({
        matchSeed: options.matchSeed,
        floorSeed: options.floorSeed,
        floorNumber: options.floorNumber || 1,
        generationVersion: options.generationVersion || LOCAL_GENERATION_VERSION,
        contentVersion: options.contentVersion || LOCAL_CONTENT_VERSION,
      })
      : { startRoomId: TEST_ROOM.id, rooms: [] };
    return {
      ...TEST_ROOM,
      currentRoomId: layout.startRoomId,
      visitedRoomIds: [layout.startRoomId],
      roomTransition: null,
      transitionSequence: 0,
      transitionsByPlayer: {},
      layout,
    };
  }

  const ROOM_DIRECTIONS = Object.freeze({
    n: Object.freeze({ dx: 0, dy: -1, opposite: 's' }),
    s: Object.freeze({ dx: 0, dy: 1, opposite: 'n' }),
    e: Object.freeze({ dx: 1, dy: 0, opposite: 'w' }),
    w: Object.freeze({ dx: -1, dy: 0, opposite: 'e' }),
  });

  function getCurrentNetworkRoom(floorState = {}, roomId = floorState.currentRoomId) {
    return floorState.layout?.rooms?.find(room => room.id === roomId) || null;
  }

  function getAdjacentNetworkRoom(floorState, room, directionKey) {
    const direction = ROOM_DIRECTIONS[directionKey];
    if (!direction || !room?.doors?.[directionKey]) return null;
    return floorState.layout?.rooms?.find(candidate => (
      candidate.gx === room.gx + direction.dx && candidate.gy === room.gy + direction.dy
    )) || null;
  }

  function placePlayerAtRoomEntrance(state, player, directionKey, roomId) {
    const floorState = state.floorState;
    const width = Number(floorState.width) || TEST_ROOM.width;
    const height = Number(floorState.height) || TEST_ROOM.height;
    const wall = Number(floorState.wallThickness) || TEST_ROOM.wallThickness;
      const radius = Math.max(1, Number(player.radius) || 18);
      const inset = wall + radius + 18;
      if (directionKey === 'e') {
        player.x = inset;
        player.y = height / 2;
      } else if (directionKey === 'w') {
        player.x = width - inset;
        player.y = height / 2;
      } else if (directionKey === 'n') {
        player.x = width / 2;
        player.y = height - inset;
      } else {
        player.x = width / 2;
        player.y = inset;
      }
      player.vx = 0;
      player.vy = 0;
      player.roomId = roomId;
  }

  function transitionNetworkRoom(state, player, directionKey) {
      const floorState = state.floorState;
    const currentRoom = getCurrentNetworkRoom(floorState, player?.roomId);
    const nextRoom = getAdjacentNetworkRoom(floorState, currentRoom, directionKey);
    const lastTransition = floorState.transitionsByPlayer?.[player?.id];
    if (!player || !nextRoom || lastTransition?.tick === state.tick || isNetworkRoomLocked?.(state, currentRoom?.id)) return false;
    const fromRoomId = currentRoom.id;
    floorState.transitionSequence = Math.max(0, Number(floorState.transitionSequence) || 0) + 1;
    const transition = {
      sequence: floorState.transitionSequence,
      tick: state.tick,
      playerId: player.id,
      fromRoomId,
      toRoomId: nextRoom.id,
      direction: directionKey,
    };
    floorState.roomTransition = transition;
    floorState.transitionsByPlayer = floorState.transitionsByPlayer || {};
    floorState.transitionsByPlayer[player.id] = transition;
    const visited = new Set(Array.isArray(floorState.visitedRoomIds) ? floorState.visitedRoomIds : []);
    visited.add(nextRoom.id);
    floorState.visitedRoomIds = Array.from(visited);
    placePlayerAtRoomEntrance(state, player, directionKey, nextRoom.id);
    return true;
  }

  function createPlayerMovementSystem(room = TEST_ROOM) {
    // Compatibility export for local harnesses/tests. Live authorities use the
    // same implementation through createCampaignSimulation above.
    if (typeof createCampaignMovementSystem === 'function') {
      return createCampaignMovementSystem({ isRoomLocked: isNetworkRoomLocked });
    }
    return ({ state, inputs, fixedDelta }) => {
      const players = Object.values(state.players);
      for (const player of players) {
        if (!player || player.disconnected || player.downed) {
          if (player) { player.vx = 0; player.vy = 0; }
          continue;
        }
        const input = inputs[player.id] || {};
        let moveX = Number(input.moveX) || 0;
        let moveY = Number(input.moveY) || 0;
        const magnitude = Math.hypot(moveX, moveY);
        if (magnitude > 1) {
          moveX /= magnitude;
          moveY /= magnitude;
        }
        const statusUntil = player.statusUntilTick || {};
        const statusSpeedMultiplier = state.tick < Number(statusUntil.mooggy_zoomies || 0)
          ? 5
          : state.tick < Number(statusUntil.turtle_powerup || 0)
            ? 1.3
            : 1;
        const speed = Math.max(0, Number(player.moveSpeed) || 180) * statusSpeedMultiplier;
        const radius = Math.max(1, Number(player.radius) || 18);
        const wallInset = Math.max(0, Number(room.wallThickness) || 0);
        const minimum = wallInset + radius;
        const maximumX = room.width - minimum;
        const maximumY = room.height - minimum;
        const desiredX = player.x + moveX * speed * fixedDelta;
        const desiredY = player.y + moveY * speed * fixedDelta;
        // The transition zone must cover the full VISIBLE door gap (rendered at
        // ±doorWidth/2 from room centre). Using doorWidth/2 - radius left an
        // ~18px dead band on each side where the player was inside the drawn
        // opening but no transition fired — i.e. "I reach the door, nothing
        // happens." Match the rendered gap (plus the radius so the edges count).
        const halfDoor = Math.max(radius * 1.5, (Number(room.doorWidth) || 140) / 2 + radius);
        const insideHorizontalDoor = Math.abs(desiredX - room.width / 2) <= halfDoor;
        const insideVerticalDoor = Math.abs(desiredY - room.height / 2) <= halfDoor;
        let transitionDirection = null;
        if (desiredY < minimum && insideHorizontalDoor) transitionDirection = 'n';
        else if (desiredY > maximumY && insideHorizontalDoor) transitionDirection = 's';
        else if (desiredX > maximumX && insideVerticalDoor) transitionDirection = 'e';
        else if (desiredX < minimum && insideVerticalDoor) transitionDirection = 'w';
        if (transitionDirection && transitionNetworkRoom(state, player, transitionDirection)) continue;
        player.x = Math.max(minimum, Math.min(maximumX, desiredX));
        player.y = Math.max(minimum, Math.min(maximumY, desiredY));
        player.vx = moveX * speed;
        player.vy = moveY * speed;
        player.aimDirection = Number(input.aimDirection) || 0;
      }
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
      this.baseMatchId = String(options.matchId || 'local-match');
      this.mode = options.mode === 'rival' ? 'rival' : 'coop';
      this.rematchSerial = 0;
      this.chatSequence = 0;
      this.outgoingSequence = 0;
      this.snapshotSequence = 0;
      this.peerRecords = new Map();
      this.playerIdByPeer = new Map();
      this.pendingInputs = {};
      this.pendingActions = {};
      this.lastProcessedInput = {};
      this.lastProcessedAction = {};
      this.pendingGameplayEvents = [];
      this.seenReliableSequences = new Map();
      this.lastReplaceableSequence = new Map();
      this.invalidMessageCount = new Map();
      this.reconnectReservations = new Map();
      this.lastChatAtByPlayer = new Map();
      this.pendingFloorTransition = null;
      this.pendingRunEnd = null;
      this.runEndedBroadcast = false;
      this.snapshotEntitySignatures = {};
      this.snapshotFloorSignature = '';
      this.snapshotBossSignature = '';
      this.metrics = {
        acceptedInputs: 0,
        duplicateInputs: 0,
        acceptedActions: 0,
        duplicateActions: 0,
        gameplayEvents: 0,
        snapshots: 0,
        invalidMessages: 0,
      };
      this.simulation = this._createSimulation(this.matchSeed, this.baseMatchId);
      this.unsubscribeMessage = this.transport.onMessage((peerId, message, delivery) => this._onMessage(peerId, message, delivery));
      this.unsubscribeDisconnect = this.transport.onPeerDisconnected((identity, reason) => this._onPeerDisconnected(identity, reason));
    }

    exportRuntimeCheckpoint() {
      return cloneSerializable({
        outgoingSequence: this.outgoingSequence,
        snapshotSequence: this.snapshotSequence,
        rematchSerial: this.rematchSerial,
        chatSequence: this.chatSequence,
        mode: this.mode,
        minPlayers: this.minPlayers,
        maxPlayers: this.maxPlayers,
        peerRecords: Array.from(this.peerRecords.entries()),
        playerIdByPeer: Array.from(this.playerIdByPeer.entries()),
        pendingInputs: this.pendingInputs,
        pendingActions: this.pendingActions,
        lastProcessedInput: this.lastProcessedInput,
        lastProcessedAction: this.lastProcessedAction,
        pendingGameplayEvents: this.pendingGameplayEvents,
        pendingFloorTransition: this.pendingFloorTransition,
        pendingRunEnd: this.pendingRunEnd,
        runEndedBroadcast: this.runEndedBroadcast,
        reconnectReservations: Array.from(this.reconnectReservations.entries()),
        seenReliableSequences: Array.from(this.seenReliableSequences.entries())
          .map(([peerId, sequences]) => [peerId, Array.from(sequences)]),
        lastReplaceableSequence: Array.from(this.lastReplaceableSequence.entries()),
        invalidMessageCount: Array.from(this.invalidMessageCount.entries()),
      });
    }

    restoreRuntimeCheckpoint(runtime = {}) {
      if (!runtime || typeof runtime !== 'object') return false;
      this.outgoingSequence = Math.max(0, Math.trunc(Number(runtime.outgoingSequence) || 0));
      this.snapshotSequence = Math.max(0, Math.trunc(Number(runtime.snapshotSequence) || 0));
      this.rematchSerial = Math.max(0, Math.trunc(Number(runtime.rematchSerial) || 0));
      this.chatSequence = Math.max(0, Math.trunc(Number(runtime.chatSequence) || 0));
      this.mode = runtime.mode === 'rival' ? 'rival' : 'coop';
      this.minPlayers = Math.max(1, Math.min(4, Math.trunc(Number(runtime.minPlayers) || this.minPlayers)));
      this.maxPlayers = Math.max(this.minPlayers, Math.min(4, Math.trunc(Number(runtime.maxPlayers) || this.maxPlayers)));
      this.peerRecords = new Map(Array.isArray(runtime.peerRecords) ? runtime.peerRecords : []);
      this.playerIdByPeer = new Map(Array.isArray(runtime.playerIdByPeer) ? runtime.playerIdByPeer : []);
      this.pendingInputs = cloneSerializable(runtime.pendingInputs || {});
      this.pendingActions = cloneSerializable(runtime.pendingActions || {});
      this.lastProcessedInput = cloneSerializable(runtime.lastProcessedInput || {});
      this.lastProcessedAction = cloneSerializable(runtime.lastProcessedAction || {});
      this.pendingGameplayEvents = cloneSerializable(runtime.pendingGameplayEvents || []);
      this.pendingFloorTransition = cloneSerializable(runtime.pendingFloorTransition || null);
      this.pendingRunEnd = cloneSerializable(runtime.pendingRunEnd || null);
      this.runEndedBroadcast = runtime.runEndedBroadcast === true;
      this.reconnectReservations = new Map(Array.isArray(runtime.reconnectReservations) ? runtime.reconnectReservations : []);
      this.seenReliableSequences = new Map((Array.isArray(runtime.seenReliableSequences) ? runtime.seenReliableSequences : [])
        .map(([peerId, sequences]) => [peerId, new Set(Array.isArray(sequences) ? sequences : [])]));
      this.lastReplaceableSequence = new Map(Array.isArray(runtime.lastReplaceableSequence) ? runtime.lastReplaceableSequence : []);
      this.invalidMessageCount = new Map(Array.isArray(runtime.invalidMessageCount) ? runtime.invalidMessageCount : []);
      this.snapshotEntitySignatures = {};
      this.snapshotFloorSignature = '';
      this.snapshotBossSignature = '';
      return true;
    }

    _createSimulation(matchSeed, matchId) {
      const floorSeed = `${matchSeed}|floor:1`;
      const state = new GameState({
        matchId,
        matchSeed,
        floorSeed,
        generationVersion: this.generationVersion,
        contentVersion: this.contentVersion,
        status: 'waiting',
        matchRules: { mode: this.mode },
        floorState: createNetworkFloorState({
          matchSeed,
          floorSeed,
          floorNumber: 1,
          generationVersion: this.generationVersion,
          contentVersion: this.contentVersion,
        }),
      });
      return typeof createCampaignSimulation === 'function'
        ? createCampaignSimulation({
          state,
          emitEvent: (eventType, data) => this._queueGameplayEvent(eventType, data),
        })
        : new GameSimulation({
          state,
          systems: [
            createPlayerMovementSystem(TEST_ROOM),
            createNetworkCombatSystem({ emitEvent: (eventType, data) => this._queueGameplayEvent(eventType, data) }),
            typeof createFloorProgressionSystem === 'function'
              ? createFloorProgressionSystem({ emitEvent: (eventType, data) => this._queueGameplayEvent(eventType, data) })
            : () => {},
          ],
        });
    }

    _createPlayerState(playerId, peerId, slotIndex, profile = {}) {
      const player = {
        id: playerId,
        peerId,
        displayName: profile.displayName || this.transport.getPeerIdentity?.(peerId)?.displayName || peerId,
        x: 300 + slotIndex * 300,
        y: TEST_ROOM.height / 2,
        vx: 0,
        vy: 0,
        radius: 18,
        moveSpeed: 180,
        maxHp: 100,
        hp: 100,
        coins: 0,
        level: 1,
        xp: 0,
        xpToNext: 20,
        damageMultiplier: 1,
        kills: 0,
        playerKills: 0,
        deaths: 0,
        downed: false,
        action: 'idle',
        actionTick: -1,
        attackCooldownUntilTick: 0,
        aimDirection: 0,
        characterKey: profile.characterKey || PLAYER_CHARACTERS[slotIndex % PLAYER_CHARACTERS.length],
        slotIndex,
        roomId: this.simulation.state.floorState.currentRoomId,
      };
      applyNetworkHeroProfile(player, player.characterKey, profile.kitChoices);
      return player;
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
        case 'PLAYER_CHARACTER': this._handleCharacter(peerId, message.payload); break;
        case 'PLAYER_READY': this._handleReady(peerId, message.payload); break;
        case 'PLAYER_INPUT': this._handleInput(peerId, message.payload); break;
        case 'PLAYER_ACTION': this._handleAction(peerId, message.payload); break;
        case 'INTERACT_REQUEST': this._handleInteract(peerId, message.payload); break;
        case 'UPGRADE_SELECTION': this._handleUpgrade(peerId, message.payload); break;
        case 'SHOP_PURCHASE': this._handleShopPurchase(peerId, message.payload); break;
        case 'GAME_COMMAND': this._handleGameCommand(peerId, message.payload); break;
        case 'CHAT_SEND': this._handleChat(peerId, message.payload); break;
        case 'REMATCH_REQUEST': this._handleRematchRequest(peerId, message.payload); break;
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
      const reservation = payload.reconnectToken && this.reconnectReservations.get(payload.reconnectToken);
      if (reservation && reservation.deadlineTick >= this.simulation.state.tick
        && reservation.deadlineAt >= Date.now() && this.simulation.state.players[reservation.playerId]) {
        const player = this.simulation.state.players[reservation.playerId];
        this.reconnectReservations.delete(payload.reconnectToken);
        this.playerIdByPeer.set(peerId, player.id);
        record.playerId = player.id;
        record.ready = true;
        record.reconnectToken = payload.reconnectToken;
        player.peerId = peerId;
        player.disconnected = false;
        player.reconnectDeadlineTick = null;
        player.reconnectDeadlineAt = null;
        this.pendingInputs[player.id] = { moveX: 0, moveY: 0, aimDirection: player.aimDirection || 0, buttons: 0 };
        this.pendingActions[player.id] = [];
        this.lastProcessedInput[player.id] = -1;
        this.lastProcessedAction[player.id] = -1;
        this._send(peerId, 'JOIN_ACCEPTED', {
          matchId: this.simulation.state.matchId,
          sessionId: this.sessionId,
          playerId: player.id,
          reconnectToken: payload.reconnectToken,
        });
        this._send(peerId, 'INITIAL_STATE', {
          serverTick: this.simulation.state.tick,
          state: this.simulation.state.snapshot(),
          lastProcessedInput: { ...this.lastProcessedInput },
        });
        this._broadcastLobbyState();
        this._broadcast('GAMEPLAY_EVENT', {
          eventId: this.simulation.state.allocateEntityId('event'),
          eventType: 'PLAYER_RECONNECTED',
          data: { playerId: player.id, tick: this.simulation.state.tick },
        });
        return;
      }
      if (payload.reconnectToken && reservation) this.reconnectReservations.delete(payload.reconnectToken);
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
      const occupiedSlots = new Set(Array.from(this.playerIdByPeer.values())
        .map(connectedPlayerId => Number(this.simulation.state.players[connectedPlayerId]?.slotIndex))
        .filter(Number.isInteger));
      const slotIndex = Array.from({ length: this.maxPlayers }, (_unused, index) => index)
        .find(index => !occupiedSlots.has(index));
      if (slotIndex == null) {
        this._send(peerId, 'JOIN_REJECTED', { code: 'ROOM_FULL', message: 'The local multiplayer room is full.' });
        return;
      }
      this.playerIdByPeer.set(peerId, playerId);
      record.playerId = playerId;
      record.ready = false;
      record.reconnectToken = createReconnectToken();
      this.simulation.state.players[playerId] = this._createPlayerState(playerId, peerId, slotIndex);
      this.pendingInputs[playerId] = { moveX: 0, moveY: 0, aimDirection: 0, buttons: 0 };
      this.pendingActions[playerId] = [];
      this.lastProcessedInput[playerId] = -1;
      this.lastProcessedAction[playerId] = -1;
      this._send(peerId, 'JOIN_ACCEPTED', {
        matchId: this.simulation.state.matchId,
        sessionId: this.sessionId,
        playerId,
        reconnectToken: record.reconnectToken,
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

    _handleCharacter(peerId, payload) {
      const record = this.peerRecords.get(peerId);
      const player = record?.playerId && this.simulation.state.players[record.playerId];
      if (!player || this.simulation.state.status !== 'waiting') return;
      if (!SELECTABLE_CHARACTERS.includes(payload.characterKey)) return this._rejectInvalidMessage(peerId, ['character is unavailable']);
      if (sanitizeKitChoices(payload.characterKey, payload.kitChoices) === null) {
        return this._rejectInvalidMessage(peerId, ['kit choice is unavailable']);
      }
      applyNetworkHeroProfile(player, payload.characterKey, payload.kitChoices);
      record.ready = false;
      this._broadcastLobbyState();
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

    _handleAction(peerId, payload) {
      const playerId = this.playerIdByPeer.get(peerId);
      if (!playerId || this.simulation.state.status !== 'running') return;
      if (payload.inputSequence <= this.lastProcessedAction[playerId]) {
        this.metrics.duplicateActions += 1;
        return;
      }
      this.lastProcessedAction[playerId] = payload.inputSequence;
      const queue = this.pendingActions[playerId] || (this.pendingActions[playerId] = []);
      if (queue.length < 8) queue.push({
        action: payload.action,
        aimDirection: payload.aimDirection,
        abilityId: payload.abilityId,
        inputSequence: payload.inputSequence,
      });
      this.metrics.acceptedActions += 1;
    }

    _handleInteract(peerId, payload) {
      const playerId = this.playerIdByPeer.get(peerId);
      if (!playerId || this.simulation.state.status !== 'running') return;
      const queue = this.pendingActions[playerId] || (this.pendingActions[playerId] = []);
      if (queue.length < 8) queue.push({
        action: 'INTERACT',
        targetEntityId: payload.targetEntityId,
        inputSequence: payload.inputSequence,
      });
    }

    _handleUpgrade(peerId, payload) {
      const playerId = this.playerIdByPeer.get(peerId);
      if (!playerId || this.simulation.state.status !== 'running') return;
      const queue = this.pendingActions[playerId] || (this.pendingActions[playerId] = []);
      if (queue.length < 8) queue.push({
        action: 'UPGRADE',
        selectionEventId: payload.selectionEventId,
        optionId: payload.optionId,
      });
    }

    _handleShopPurchase(peerId, payload) {
      const playerId = this.playerIdByPeer.get(peerId);
      if (!playerId || this.simulation.state.status !== 'running') return;
      const queue = this.pendingActions[playerId] || (this.pendingActions[playerId] = []);
      if (queue.length < 8) queue.push({
        action: 'SHOP_PURCHASE',
        kind: payload.kind,
        offerIndex: payload.offerIndex,
        healKind: payload.healKind,
      });
    }

    _handleGameCommand(peerId, payload) {
      const playerId = this.playerIdByPeer.get(peerId);
      if (!playerId || this.simulation.state.status !== 'running') return;
      const queue = this.pendingActions[playerId] || (this.pendingActions[playerId] = []);
      if (queue.length < 8) queue.push({ action: payload.command, ...(cloneSerializable(payload.arguments) || {}) });
    }

    _handleChat(peerId, payload) {
      const playerId = this.playerIdByPeer.get(peerId);
      const player = playerId && this.simulation.state.players[playerId];
      if (!player) return;
      const now = Date.now();
      if (now - Number(this.lastChatAtByPlayer.get(playerId) || 0) < CHAT_COOLDOWN_MS) return;
      const text = String(payload.text || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
      if (!text) return;
      this.lastChatAtByPlayer.set(playerId, now);
      this._broadcast('CHAT_MESSAGE', {
        // Chat must not consume deterministic simulation entity IDs; otherwise
        // conversation timing would change later gameplay identifiers.
        messageId: `chat-${this.chatSequence++}`,
        playerId,
        displayName: String(player.displayName || peerId).slice(0, 64),
        text,
        sentAtTick: this.simulation.state.tick,
      });
    }

    _handleRematchRequest(peerId, payload) {
      if (this.simulation.state.status !== 'ended') return;
      const record = this.peerRecords.get(peerId);
      if (!record?.playerId) return;
      record.rematchReady = payload.ready === true;
      this._broadcastLobbyState();
      this._maybeStartRematch();
    }

    _maybeStartRematch() {
      if (this.simulation.state.status !== 'ended') return false;
      const joined = Array.from(this.peerRecords.entries()).filter(([, record]) => record.playerId);
      if (joined.length < this.minPlayers || !joined.every(([, record]) => record.rematchReady === true)) return false;
      const previousPlayers = this.simulation.state.players || {};
      this.rematchSerial += 1;
      this.simulation = this._createSimulation(this.matchSeed, `${this.baseMatchId}:rematch:${this.rematchSerial}`);
      this.snapshotSequence = 0;
      this.snapshotEntitySignatures = {};
      this.snapshotFloorSignature = '';
      this.snapshotBossSignature = '';
      this.pendingInputs = {};
      this.pendingActions = {};
      this.lastProcessedInput = {};
      this.lastProcessedAction = {};
      this.pendingGameplayEvents = [];
      this.pendingFloorTransition = null;
      this.pendingRunEnd = null;
      this.runEndedBroadcast = false;
      this.reconnectReservations.clear();
      joined.forEach(([joinedPeerId, record], slotIndex) => {
        const previous = previousPlayers[record.playerId] || {};
        const player = this._createPlayerState(record.playerId, joinedPeerId, slotIndex, {
          displayName: previous.displayName,
          characterKey: previous.characterKey,
          kitChoices: previous.kitChoices,
        });
        this.simulation.state.players[player.id] = player;
        this.pendingInputs[player.id] = { moveX: 0, moveY: 0, aimDirection: 0, buttons: 0 };
        this.pendingActions[player.id] = [];
        this.lastProcessedInput[player.id] = -1;
        this.lastProcessedAction[player.id] = -1;
        record.ready = true;
        record.rematchReady = false;
      });
      this._startMatch();
      return true;
    }

    _queueGameplayEvent(eventType, data = {}) {
      applyAuthorityRunEvent(this.simulation.state, eventType, data);
      // The floor-progression system signals a finished run via a RUN_ENDED
      // sim event; capture its details so step() can send the dedicated
      // authoritative RUN_ENDED message (schema-validated, terminal for clients).
      if (eventType === 'RUN_ENDED' && !this.pendingRunEnd) {
        this.pendingRunEnd = {
          result: data.result === 'victory' ? 'victory' : 'defeat',
          reason: String(data.reason || 'run-ended').slice(0, 96),
          floorNumber: Math.max(1, Math.trunc(Number(data.floorNumber) || 1)),
        };
      }
      if (eventType === 'FLOOR_ADVANCED') this.pendingFloorTransition = cloneSerializable(data);
      this.pendingGameplayEvents.push({
        eventType: String(eventType || 'UNKNOWN').slice(0, 64),
        data: { ...cloneSerializable(data), tick: this.simulation.state.tick },
      });
    }

    _flushGameplayEvents() {
      const events = this.pendingGameplayEvents.splice(0);
      events.forEach(event => {
        this._broadcast('GAMEPLAY_EVENT', {
          eventId: this.simulation.state.allocateEntityId('event'),
          eventType: event.eventType,
          data: event.data,
        });
        this.metrics.gameplayEvents += 1;
      });
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
      ensureNetworkEncounter(this.simulation.state, this.simulation.random,
        (eventType, data) => this._queueGameplayEvent(eventType, data));
      this._broadcast('INITIAL_STATE', {
        serverTick: this.simulation.state.tick,
        state: this.simulation.state.snapshot(),
        lastProcessedInput: { ...this.lastProcessedInput },
      });
      this._flushGameplayEvents();
      this._broadcastLobbyState();
    }

    _broadcastLobbyState() {
      const members = Array.from(this.playerIdByPeer.entries()).map(([peerId, playerId]) => ({
        peerId,
        playerId,
        slotIndex: Math.max(0, Math.trunc(Number(this.simulation.state.players[playerId]?.slotIndex) || 0)),
        displayName: this.simulation.state.players[playerId]?.displayName || peerId,
        characterKey: this.simulation.state.players[playerId]?.characterKey || 'thorn_knight',
        kitChoices: { ...(this.simulation.state.players[playerId]?.kitChoices || {}) },
        ready: !!this.peerRecords.get(peerId)?.ready,
        rematchReady: !!this.peerRecords.get(peerId)?.rematchReady,
      })).sort((first, second) => first.slotIndex - second.slotIndex);
      this._broadcast('LOBBY_STATE', {
        status: this.simulation.state.status === 'starting' ? 'starting' : this.simulation.state.status,
        members,
        minPlayers: this.minPlayers,
        maxPlayers: this.maxPlayers,
        mode: this.mode,
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
      const record = this.peerRecords.get(peerId);
      this.playerIdByPeer.delete(peerId);
      this.peerRecords.delete(peerId);
      delete this.pendingInputs[playerId];
      delete this.pendingActions[playerId];
      delete this.lastProcessedInput[playerId];
      delete this.lastProcessedAction[playerId];
      const player = this.simulation.state.players[playerId];
      const displayName = String(player?.displayName || record?.displayName || peerId).slice(0, 64);
      const slotIndex = Math.max(0, Math.trunc(Number(player?.slotIndex) || 0));
      const intentional = isIntentionalDisconnectReason(reason);
      const canReconnect = this.simulation.state.status === 'running' && player && record?.reconnectToken;
      if (canReconnect) {
        const deadlineTick = this.simulation.state.tick + RECONNECT_RESERVATION_TICKS;
        const deadlineAt = Date.now() + (RECONNECT_RESERVATION_TICKS / SIMULATION_TICK_RATE) * 1000;
        player.disconnected = true;
        player.reconnectDeadlineTick = deadlineTick;
        player.reconnectDeadlineAt = deadlineAt;
        player.vx = 0;
        player.vy = 0;
        this.reconnectReservations.set(record.reconnectToken, { playerId, deadlineTick, deadlineAt, displayName, slotIndex });
      } else {
        delete this.simulation.state.players[playerId];
      }
      if (this.transport.sessionId) {
        this._broadcast('PLAYER_DISCONNECTED', {
          playerId,
          displayName,
          slotIndex,
          intentional,
          reason: String(reason || 'disconnected').slice(0, 96),
          ...(canReconnect ? { reconnectDeadline: this.simulation.state.elapsedSeconds + RECONNECT_RESERVATION_TICKS / SIMULATION_TICK_RATE } : {}),
        });
        this._broadcastLobbyState();
        this._maybeStartRematch();
      }
    }

    step(tickCount = 1) {
      const count = Math.max(0, Math.trunc(Number(tickCount) || 0));
      for (let index = 0; index < count; index += 1) {
        if (this.simulation.state.status !== 'running') break;
        const tickInputs = Object.fromEntries(Object.entries(this.pendingInputs).map(([playerId, input]) => [
          playerId,
          { ...input, actions: (this.pendingActions[playerId] || []).splice(0) },
        ]));
        this.simulation.updateGame(tickInputs, FIXED_DELTA_SECONDS);
        this._expireReconnectReservations();
        const floorTransition = this.pendingFloorTransition;
        this.pendingFloorTransition = null;
        this._flushGameplayEvents();
        if (floorTransition) {
          this._broadcast('FLOOR_TRANSITION', {
            floorNumber: this.simulation.state.floorNumber,
            floorSeed: this.simulation.state.floorSeed,
            transitionTick: this.simulation.state.tick,
            spawnPoints: Object.fromEntries(Object.values(this.simulation.state.players).map(player => [player.id, {
              roomId: player.roomId, x: player.x, y: player.y,
            }])),
            generationVersion: this.generationVersion,
            contentVersion: this.contentVersion,
          });
          this._publishSnapshot(true);
        }
        if (this.simulation.state.status === 'ended') {
          // A run just finished (victory on the god floor, or party wipe). Send
          // a final full snapshot so clients see the terminal world, then the
          // dedicated RUN_ENDED message that flips their status to 'ended'.
          this._publishSnapshot(true);
          this._broadcastRunEnded();
          break;
        }
        if (this.simulation.state.tick % SNAPSHOT_TICK_INTERVAL === 0) {
          this._publishSnapshot(this.simulation.state.tick % FULL_CORRECTION_TICK_INTERVAL === 0);
        }
      }
      return this.simulation.state;
    }

    _expireReconnectReservations() {
      this.reconnectReservations.forEach((reservation, token) => {
        if (reservation.deadlineTick > this.simulation.state.tick && reservation.deadlineAt > Date.now()) return;
        this.reconnectReservations.delete(token);
        delete this.simulation.state.players[reservation.playerId];
        this._broadcast('PLAYER_DISCONNECTED', {
          playerId: reservation.playerId,
          displayName: String(reservation.displayName || reservation.playerId).slice(0, 64),
          slotIndex: Math.max(0, Math.trunc(Number(reservation.slotIndex) || 0)),
          intentional: false,
          reason: 'reconnect-timeout',
        });
      });
    }

    _broadcastRunEnded() {
      if (this.runEndedBroadcast) return;
      this.runEndedBroadcast = true;
      const end = this.pendingRunEnd || { result: 'defeat', reason: 'run-ended', floorNumber: Number(this.simulation.state.floorNumber || 1) };
      const players = Object.values(this.simulation.state.players || {});
      this._broadcast('RUN_ENDED', {
        result: end.result,
        reason: end.reason,
        summary: {
          floorNumber: end.floorNumber,
          elapsedSeconds: Math.round(Number(this.simulation.state.elapsedSeconds || 0)),
          mode: this.mode,
          runStats: cloneSerializable(this.simulation.state.runStats || {}),
          players: players.map(player => ({
            playerId: player.id,
            characterKey: player.characterKey,
            gold: Number(player.coins || 0),
            downed: !!player.downed,
          })),
        },
        leaderboardEligible: false,
      });
      this._broadcastLobbyState();
    }

    _publishSnapshot(full) {
      const actualFull = full || !SNAPSHOT_ENTITY_COLLECTIONS.every(collection => this.snapshotEntitySignatures[collection]);
      const entities = {};
      const removedEntityIds = [];
      SNAPSHOT_ENTITY_COLLECTIONS.forEach(collection => {
        const current = this.simulation.state[collection] || {};
        const previous = this.snapshotEntitySignatures[collection] || {};
        const next = {};
        const changed = {};
        Object.entries(current).forEach(([entityId, entity]) => {
          const signature = JSON.stringify(entity);
          next[entityId] = signature;
          if (actualFull || previous[entityId] !== signature) changed[entityId] = cloneSerializable(entity);
        });
        if (!actualFull) {
          Object.keys(previous).forEach(entityId => {
            if (!Object.prototype.hasOwnProperty.call(next, entityId)) removedEntityIds.push(entityId);
          });
        }
        this.snapshotEntitySignatures[collection] = next;
        entities[collection] = changed;
      });
      const floorSignature = JSON.stringify(this.simulation.state.floorState || null);
      const floorChanged = actualFull || floorSignature !== this.snapshotFloorSignature;
      this.snapshotFloorSignature = floorSignature;
      const bossSignature = JSON.stringify(this.simulation.state.bossState || null);
      const bossStateChanged = actualFull || bossSignature !== this.snapshotBossSignature;
      this.snapshotBossSignature = bossSignature;
      const payload = {
        snapshotSequence: this.snapshotSequence++,
        serverTick: this.simulation.state.tick,
        full: actualFull,
        lastProcessedInput: { ...this.lastProcessedInput },
        entities,
        removedEntityIds,
        floorState: floorChanged ? cloneSerializable(this.simulation.state.floorState) : null,
        bossState: bossStateChanged ? cloneSerializable(this.simulation.state.bossState || null) : null,
        bossStateChanged,
      };
      const delivery = actualFull
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
      this.actionSequence = 0;
      this.interactionSequence = 0;
      this.reconnectToken = null;
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
      this.gameplayEvents = [];
      this.chatMessages = [];
      this.connectionNotices = [];
      this.runEnd = null;
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
      this._send('JOIN_MATCH', {
        sessionId: this.sessionId,
        ...(this.reconnectToken ? { reconnectToken: this.reconnectToken } : {}),
      });
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

    sendCharacter(characterKey, kitChoices) {
      if (!this.playerId) throw new Error('Client has not joined the match');
      const payload = { characterKey: String(characterKey || '') };
      if (kitChoices && typeof kitChoices === 'object' && !Array.isArray(kitChoices) && Object.keys(kitChoices).length) {
        payload.kitChoices = { ...kitChoices };
      }
      this._send('PLAYER_CHARACTER', payload);
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

    sendAction(action = 'ATTACK', aimDirection = 0, options = {}) {
      if (this.status !== 'running') throw new Error('Client match is not running');
      const inputSequence = this.actionSequence++;
      this._send('PLAYER_ACTION', {
        action: String(action || 'ATTACK'),
        inputSequence,
        aimDirection: Number(aimDirection) || 0,
        ...(options.abilityId ? { abilityId: String(options.abilityId) } : {}),
      });
      return inputSequence;
    }

    sendAbility(abilityId, aimDirection = 0) {
      return this.sendAction('ABILITY', aimDirection, { abilityId });
    }

    sendDash(abilityId, aimDirection = 0) {
      return this.sendAction('DASH', aimDirection, { abilityId });
    }

    sendInteract(targetEntityId) {
      if (this.status !== 'running') throw new Error('Client match is not running');
      const inputSequence = this.interactionSequence++;
      this._send('INTERACT_REQUEST', { targetEntityId: String(targetEntityId || ''), inputSequence });
      return inputSequence;
    }

    sendUpgrade(selectionEventId, optionId) {
      if (this.status !== 'running') throw new Error('Client match is not running');
      this._send('UPGRADE_SELECTION', {
        selectionEventId: String(selectionEventId || ''),
        optionId: String(optionId || ''),
      });
    }

    sendShopPurchase(kind, options = {}) {
      if (this.status !== 'running') throw new Error('Client match is not running');
      this._send('SHOP_PURCHASE', {
        kind: String(kind || ''),
        ...(Number.isInteger(options.offerIndex) ? { offerIndex: options.offerIndex } : {}),
        ...(options.healKind ? { healKind: String(options.healKind) } : {}),
      });
    }

    sendGameCommand(command, args = {}) {
      if (this.status !== 'running') throw new Error('Client match is not running');
      this._send('GAME_COMMAND', { command: String(command || ''), arguments: cloneSerializable(args) });
    }

    sendChat(text) {
      if (!this.playerId || !['waiting', 'starting', 'running', 'ended'].includes(this.status)) {
        throw new Error('Client is not connected to a multiplayer room');
      }
      const normalized = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      if (!normalized) return false;
      this._send('CHAT_SEND', { text: normalized });
      return true;
    }

    requestRematch(ready = true) {
      if (!this.playerId || this.status !== 'ended') throw new Error('The run has not ended');
      this._send('REMATCH_REQUEST', { ready: !!ready });
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
          this.reconnectToken = message.payload.reconnectToken || this.reconnectToken;
          this.status = 'waiting';
          break;
        case 'JOIN_REJECTED':
          this.status = 'rejected';
          this.errors.push(message.payload);
          break;
        case 'LOBBY_STATE': this.lobbyState = cloneSerializable(message.payload); break;
        case 'MATCH_STARTING':
          this.runEnd = null;
          this.latestSnapshotSequence = -1;
          if (this.status !== 'running') this.status = 'starting';
          break;
        case 'INITIAL_STATE':
          this.state = new GameState(message.payload.state);
          this.lastAcknowledgedInput = message.payload.lastProcessedInput[this.playerId] ?? -1;
          this.status = 'running';
          break;
        case 'WORLD_SNAPSHOT': this._applySnapshot(message.payload); break;
        case 'GAMEPLAY_EVENT':
          this.gameplayEvents.push(cloneSerializable(message.payload));
          if (this.gameplayEvents.length > 128) this.gameplayEvents.splice(0, this.gameplayEvents.length - 128);
          if (message.payload.eventType === 'PLAYER_RECONNECTED') {
            const playerId = message.payload.data?.playerId;
            const player = this.state?.players?.[playerId];
            this._recordConnectionNotice({
              noticeId: `reconnected-${message.sequence}`,
              playerId,
              displayName: player?.displayName || playerId || 'Player',
              slotIndex: player?.slotIndex,
              kind: 'reconnected',
              message: `${player?.displayName || 'Player'} reconnected.`,
            });
          }
          break;
        case 'CHAT_MESSAGE':
          this.chatMessages.push(cloneSerializable(message.payload));
          if (this.chatMessages.length > 64) this.chatMessages.splice(0, this.chatMessages.length - 64);
          break;
        case 'PLAYER_DISCONNECTED':
          {
            const previousMember = this.lobbyState?.members?.find(member => member.playerId === message.payload.playerId);
            const displayName = message.payload.displayName || previousMember?.displayName || 'Player';
            const intentional = message.payload.intentional === true;
            this._recordConnectionNotice({
              noticeId: `disconnected-${message.sequence}`,
              playerId: message.payload.playerId,
              displayName,
              slotIndex: message.payload.slotIndex ?? previousMember?.slotIndex,
              kind: intentional ? 'left' : 'disconnected',
              reason: message.payload.reason,
              message: intentional ? `${displayName} left the lobby.` : `${displayName} lost connection.`,
            });
          }
          if (this.state) delete this.state.players[message.payload.playerId];
          break;
        case 'FLOOR_TRANSITION':
          if (this.state) {
            this.state.floorNumber = message.payload.floorNumber;
            this.state.floorSeed = message.payload.floorSeed;
          }
          break;
        case 'RUN_ENDED':
          this.runEnd = cloneSerializable(message.payload);
          this.status = 'ended';
          break;
        case 'ERROR':
          this.errors.push(message.payload);
          if (message.payload.fatal) this.status = 'rejected';
          break;
        default: break;
      }
    }

    _recordConnectionNotice(notice) {
      this.connectionNotices.push(cloneSerializable(notice));
      if (this.connectionNotices.length > 8) this.connectionNotices.splice(0, this.connectionNotices.length - 8);
    }

    leave(reason = 'left') {
      if (this.authorityPeerId && this.playerId) {
        try { this._send('LEAVE_MATCH', { reason: String(reason || 'left').slice(0, 64) }); } catch { /* socket already unavailable */ }
      }
      return this.transport.leaveSession?.(reason);
    }

    _applySnapshot(snapshot) {
      if (snapshot.snapshotSequence <= this.latestSnapshotSequence) return;
      this.latestSnapshotSequence = snapshot.snapshotSequence;
      if (!this.state) return;
      this.state.tick = snapshot.serverTick;
      SNAPSHOT_ENTITY_COLLECTIONS.forEach(collection => {
        const changed = cloneSerializable(snapshot.entities[collection] || {});
        if (snapshot.full) this.state[collection] = changed;
        else Object.assign(this.state[collection] || (this.state[collection] = {}), changed);
      });
      (snapshot.removedEntityIds || []).forEach(entityId => {
        SNAPSHOT_ENTITY_COLLECTIONS.forEach(collection => { delete this.state[collection]?.[entityId]; });
      });
      this.state.floorState = cloneSerializable(snapshot.floorState || this.state.floorState);
      if (snapshot.bossStateChanged) this.state.bossState = snapshot.bossState == null ? null : cloneSerializable(snapshot.bossState);
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
    RECONNECT_RESERVATION_TICKS,
    SNAPSHOT_RATE,
    TEST_ROOM,
    SELECTABLE_CHARACTERS,
    ROOM_DIRECTIONS,
    getCurrentNetworkRoom,
    getAdjacentNetworkRoom,
    transitionNetworkRoom,
    createPlayerMovementSystem,
    createNetworkFloorState,
    LocalMultiplayerAuthority,
    LocalMultiplayerClient,
    MultiplayerRoomAuthority: LocalMultiplayerAuthority,
    MultiplayerRoomClient: LocalMultiplayerClient,
  };
});
