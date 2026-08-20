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
  const enemyScalingApi = typeof require === 'function' ? require('../simulation/SharedEnemyScalingSystem.js') : browserSimulationApi;
  const worldContentApi = typeof require === 'function' ? require('../simulation/SharedWorldContent.js') : (globalThis.NeoNyke?.content || {});
  const protocolApi = typeof require === 'function' ? require('../protocol/ProtocolV1.js') : browserProtocolApi;
  const { FIXED_DELTA_SECONDS, SIMULATION_TICK_RATE } = simulationApi;
  const { GameState, cloneSerializable } = gameStateApi;
  const {
    createCampaignSimulation,
    createCampaignFloorState,
    createCampaignMovementSystem,
    getCampaignRoom,
    getAdjacentCampaignRoom,
    transitionCampaignRoom,
    ROOM_DIRECTIONS,
    CAMPAIGN_CONTENT_VERSION,
  } = campaignApi;
  const { applyCampaignHeroProfile, sanitizeKitChoices, ensureNetworkEncounter, isNetworkRoomLocked } = combatApi;
  const { applyAuthorityRunEvent = () => ({ ok: false }) } = runServiceApi;
  const { resolveCampaignEnemyDifficulty } = enemyScalingApi;
  const {
    CLIENT_TO_AUTHORITY,
    AUTHORITY_TO_CLIENT,
    MAX_CLIENT_MESSAGE_BYTES,
    validateEnvelope,
    createEnvelope,
    getDeliveryIntent,
  } = protocolApi;

  const LOCAL_BUILD_VERSION = '1.0.0-campaign-parity-v37';
  const LOCAL_GENERATION_VERSION = 1;
  const LOCAL_CONTENT_HASH = CAMPAIGN_CONTENT_VERSION || 'shared-neo-campaign-parity-v30';
  const LOCAL_CONTENT_VERSION = CAMPAIGN_CONTENT_VERSION || 'shared-neo-campaign-parity-v30';
  const SNAPSHOT_RATE = 10;
  const SNAPSHOT_TICK_INTERVAL = SIMULATION_TICK_RATE / SNAPSHOT_RATE;
  // Cadence reacts to the age of the oldest unacknowledged snapshot instead of
  // its sequence count: two in-flight updates are normal on a healthy high-RTT
  // path, while one packet stuck for hundreds of milliseconds is congestion.
  const SNAPSHOT_DEGRADE_AGE_MS = 200;
  const SNAPSHOT_SEVERE_AGE_MS = 350;
  const SNAPSHOT_DEGRADE_HOLD_MS = 800;
  const SNAPSHOT_SEVERE_HOLD_MS = 1200;
  const SNAPSHOT_BASELINE_HISTORY = 16;
  const RESYNC_MIN_TICKS = SIMULATION_TICK_RATE;
  const TEST_ROOM = Object.freeze({ id: 'network-start-room', ...worldContentApi.CAMPAIGN_ROOM_GEOMETRY });
  const CAMPAIGN_PLAYER_RADIUS = Number(worldContentApi.CAMPAIGN_PLAYER_RADIUS || 14);
  const PLAYER_CHARACTERS = Object.freeze(['thorn_knight', 'metao', 'gelleh', 'mooggy']);
  const SELECTABLE_CHARACTERS = Object.freeze(['princess', 'thorn_knight', 'metao', 'gelleh', 'mooggy', 'turtle_boy', 'sarge', 'knave']);
  // Background tabs and sleeping mobile browsers can suspend JavaScript well
  // beyond the old 45-second window. Preserve the authority entity long enough
  // for the visibility/focus reconnect path to reclaim it after waking.
  const RECONNECT_RESERVATION_TICKS = SIMULATION_TICK_RATE * 60 * 30;
  const CHAT_COOLDOWN_MS = 500;
  const SNAPSHOT_ENTITY_COLLECTIONS = Object.freeze([
    'players', 'enemies', 'projectiles', 'abilityEntities', 'pickups', 'interactables',
  ]);
  // Enemy behavior changes still send complete campaign render records. Only
  // their high-frequency transform is split into the compact section, so
  // movement no longer retransmits health/status/telegraph metadata unchanged.
  const PACKED_DYNAMIC_COLLECTIONS = Object.freeze(['players', 'enemies', 'projectiles', 'abilityEntities']);
  const PACKED_DYNAMIC_FIELDS = new Set([
    'roomId', 'x', 'y', 'vx', 'vy', 'radius', 'r',
    'hp', 'health', 'maxHp', 'maxHealth', 'max',
    'expiresTick', 'action', 'hostile', 'angle', 'aimDirection',
    'swinging', 'swingCooldownUntilTick', 'swingsLeft',
    'dead', 'downed', 'deathTick', 'actionTick', '_lastHitAngle', 'lastHitAngle',
  ]);

  function snapshotEntitySignature(collection, entity) {
    if (!PACKED_DYNAMIC_COLLECTIONS.includes(collection)) return JSON.stringify(entity);
    const omitted = collection === 'enemies'
      ? new Set(['x', 'y', 'vx', 'vy', 'angle'])
      : PACKED_DYNAMIC_FIELDS;
    return JSON.stringify(Object.fromEntries(Object.entries(entity)
      .filter(([key]) => !omitted.has(key))));
  }

  function snapshotFloorState(floorState) {
    const snapshot = cloneSerializable(floorState || null);
    snapshot?.layout?.rooms?.forEach(room => {
      room.hazards?.forEach(hazard => { delete hazard.statusTick; });
    });
    return snapshot;
  }

  function scopedSnapshotEntities(source = {}, roomId) {
    return Object.fromEntries(SNAPSHOT_ENTITY_COLLECTIONS.map(collection => {
      const records = source[collection] || {};
      if (collection === 'players') return [collection, { ...records }];
      return [collection, Object.fromEntries(Object.entries(records)
        .filter(([, entity]) => entity?.roomId === roomId))];
    }));
  }

  // Array records eliminate repeated JSON keys and quantize transform values to
  // 1/8th world units. Static entity data remains in the initial/full bootstrap;
  // these records are only the high-frequency state a renderer corrects every
  // snapshot. The same helpers run in the worker and browser client.
  function packDynamicEntities(entities = {}) {
    const dictionaries = { ids: [], rooms: [], kinds: [], actions: [] };
    const indexOf = (list, value) => {
      const normalized = String(value || '');
      let index = list.indexOf(normalized);
      if (index < 0) { index = list.length; list.push(normalized); }
      return index;
    };
    const pack = entity => [
      indexOf(dictionaries.ids, entity.id),
      indexOf(dictionaries.rooms, entity.roomId),
      indexOf(dictionaries.kinds, entity.kind || entity.type),
      Math.round(Number(entity.x || 0) * 8), Math.round(Number(entity.y || 0) * 8),
      Math.round(Number(entity.vx || 0) * 8), Math.round(Number(entity.vy || 0) * 8),
      Math.round(Number(entity.radius || entity.r || 0) * 8),
      // Authority enemies use health/maxHealth; the compact client record uses
      // hp/maxHp. Preserve both spellings here so packed snapshots cannot turn
      // a living enemy into a 0 / 0 render proxy.
      Math.round(Number(entity.hp ?? entity.health ?? 0)), Math.round(Number(entity.maxHp ?? entity.maxHealth ?? entity.max ?? 0)),
      Math.round(Number(entity.expiresTick || 0)), indexOf(dictionaries.actions, entity.action),
      entity.hostile ? 1 : 0,
      Math.round(Number(entity.angle || 0) * 10000),
      Math.round(Math.max(0, Number(entity.swinging || 0)) * 1000),
      Math.max(0, Math.trunc(Number(entity.swingCooldownUntilTick || 0))),
      Math.max(0, Math.trunc(Number(entity.swingsLeft || 0))),
      // Death is dynamic state, not static bootstrap data. Without these fields
      // a packed delta left the client holding the old `dead: false` record,
      // so no multiplayer corpse could ever be created.
      entity.dead ? 1 : 0,
      Math.max(0, Math.trunc(Number(entity.deathTick || 0))),
      Math.round(Number(entity._lastHitAngle ?? entity.lastHitAngle ?? 0) * 10000),
      Math.round(Number(entity.aimDirection || 0) * 10000),
      entity.downed ? 1 : 0,
      Math.trunc(Number(entity.actionTick || 0)),
    ];
    const packed = {};
    PACKED_DYNAMIC_COLLECTIONS.forEach(collection => {
      const records = entities[collection] || {};
      if (collection === 'enemies') {
        packed[collection] = Object.values(records).map(entity => [
          indexOf(dictionaries.ids, entity.id),
          Math.round(Number(entity.x || 0) * 8), Math.round(Number(entity.y || 0) * 8),
          Math.round(Number(entity.vx || 0) * 8), Math.round(Number(entity.vy || 0) * 8),
          Math.round(Number(entity.angle || 0) * 10000),
        ]);
      } else if (collection === 'projectiles') {
        packed[collection] = Object.values(records).map(entity => [
          indexOf(dictionaries.ids, entity.id),
          Math.round(Number(entity.x || 0) * 8), Math.round(Number(entity.y || 0) * 8),
          Math.round(Number(entity.vx || 0) * 8), Math.round(Number(entity.vy || 0) * 8),
          Math.round(Number(entity.radius || entity.r || 0) * 8),
          Math.round(Number(entity.expiresTick || 0)),
          Math.round(Number(entity.angle || 0) * 10000),
          entity.dead ? 1 : 0,
          Math.max(0, Math.trunc(Number(entity.deathTick || 0))),
          Math.round(Number(entity._lastHitAngle ?? entity.lastHitAngle ?? 0) * 10000),
        ]);
      } else {
        packed[collection] = Object.values(records).map(pack);
      }
    });
    return { dictionaries, packed };
  }

  function unpackDynamicEntities(state, wire = {}) {
    const dictionaries = wire.dictionaries || {};
    const ids = dictionaries.ids || [];
    const rooms = dictionaries.rooms || [];
    const kinds = dictionaries.kinds || [];
    const actions = dictionaries.actions || [];
    PACKED_DYNAMIC_COLLECTIONS.forEach(collection => {
      const target = state[collection] || (state[collection] = {});
      (wire.packed?.[collection] || []).forEach(record => {
        if (!Array.isArray(record)) return;
        if (collection === 'enemies') {
          const [idIndex, x, y, vx, vy, angle] = record;
          const id = ids[idIndex];
          if (!id || !target[id]) return;
          Object.assign(target[id], {
            x: Number(x || 0) / 8, y: Number(y || 0) / 8,
            vx: Number(vx || 0) / 8, vy: Number(vy || 0) / 8,
            angle: Number(angle || 0) / 10000,
          });
          return;
        }
        if (collection === 'projectiles') {
          const [idIndex, x, y, vx, vy, radius, expiresTick, angle, dead, deathTick, lastHitAngle] = record;
          const id = ids[idIndex];
          if (!id || !target[id]) return;
          Object.assign(target[id], {
            x: Number(x || 0) / 8, y: Number(y || 0) / 8,
            vx: Number(vx || 0) / 8, vy: Number(vy || 0) / 8,
            radius: Number(radius || 0) / 8,
            expiresTick: Number(expiresTick || 0),
            angle: Number(angle || 0) / 10000,
            dead: dead === 1,
            deathTick: Number(deathTick || 0),
            _lastHitAngle: Number(lastHitAngle || 0) / 10000,
          });
          return;
        }
        const [idIndex, roomIndex, kindIndex, x, y, vx, vy, radius, hp, maxHp, expiresTick, actionIndex, hostile,
          angle, swinging, swingCooldownUntilTick, swingsLeft, dead, deathTick, lastHitAngle,
          aimDirection, downed, actionTick] = record;
        const id = ids[idIndex];
        if (!id) return;
        const kind = kinds[kindIndex] || '';
        target[id] = {
          ...(target[id] || {}),
          id,
          roomId: rooms[roomIndex] || '',
          ...(collection === 'enemies' ? { type: kind } : { kind }),
          x: Number(x || 0) / 8, y: Number(y || 0) / 8,
          vx: Number(vx || 0) / 8, vy: Number(vy || 0) / 8,
          radius: Number(radius || 0) / 8,
          // Keep every public health spelling coherent after a compact update.
          // A full bootstrap can carry health/maxHealth while later deltas carry
          // hp/maxHp; leaving the old aliases behind makes renderers read stale
          // health even though the packed record arrived correctly.
          hp: Number(hp || 0), health: Number(hp || 0),
          maxHp: Number(maxHp || 0), maxHealth: Number(maxHp || 0), max: Number(maxHp || 0),
          expiresTick: Number(expiresTick || 0), action: actions[actionIndex] || 'idle', hostile: hostile === 1,
          angle: Number(angle || 0) / 10000, swinging: Number(swinging || 0) / 1000,
          swingCooldownUntilTick: Number(swingCooldownUntilTick || 0), swingsLeft: Number(swingsLeft || 0),
          dead: dead === 1,
          deathTick: Number(deathTick || 0),
          _lastHitAngle: Number(lastHitAngle || 0) / 10000,
          aimDirection: Number(aimDirection || 0) / 10000,
          downed: downed === 1,
          actionTick: Number(actionTick || 0),
        };
      });
    });
  }

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
    if (typeof createCampaignFloorState !== 'function') throw new Error('Campaign floor authority is unavailable');
    return createCampaignFloorState(options);
  }

  function getCurrentNetworkRoom(floorState = {}, roomId = floorState.currentRoomId) {
    return getCampaignRoom?.(floorState, roomId) || null;
  }

  function getAdjacentNetworkRoom(floorState, room, directionKey) {
    return getAdjacentCampaignRoom?.(floorState, room, directionKey) || null;
  }

  function transitionNetworkRoom(state, player, directionKey) {
    return transitionCampaignRoom?.(state, player, directionKey, isNetworkRoomLocked) || false;
  }

  function createPlayerMovementSystem() {
    if (typeof createCampaignMovementSystem !== 'function') throw new Error('Campaign movement authority is unavailable');
    return createCampaignMovementSystem({ isRoomLocked: isNetworkRoomLocked });
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
      this.enableSnapshotPacking = options.enableSnapshotPacking !== false;
      this.contentVersion = String(options.contentVersion || LOCAL_CONTENT_VERSION);
      this.matchSeed = options.matchSeed ?? 'local-match-seed';
      this.baseMatchId = String(options.matchId || 'local-match');
      this.mode = ['rival', 'boss_rush'].includes(options.mode) ? options.mode : 'coop';
      this.visibility = options.visibility === 'public' ? 'public' : 'private';
      this.deferFloorGeneration = options.deferFloorGeneration === true;
      if (typeof resolveCampaignEnemyDifficulty !== 'function') {
        throw new Error('Shared campaign difficulty resolution is unavailable');
      }
      this.difficulty = resolveCampaignEnemyDifficulty({
        ...(options.difficulty || {}),
        ...(options.difficultyKey ? { key: options.difficultyKey } : {}),
      });
      this.rematchSerial = 0;
      this.chatSequence = 0;
      this.outgoingSequence = 0;
      this.snapshotSequence = 0;
      this.snapshotSequenceByPeer = new Map();
      this.lastSnapshotSentByPeer = new Map();
      this.lastSnapshotAckByPeer = new Map();
      this.snapshotSentAtByPeer = new Map();
      this.snapshotCadenceByPeer = new Map();
      this.snapshotCadenceRecoveryAtByPeer = new Map();
      this.lastResyncTickByPeer = new Map();
      this.snapshotEntitySignaturesByPeer = new Map();
      this.snapshotFloorSignatureByPeer = new Map();
      this.snapshotBossSignatureByPeer = new Map();
      this.pendingSnapshotBaselinesByPeer = new Map();
      this.pendingFullSnapshotByPeer = new Map();
      this.lastDeliveryResultByPeer = new Map();
      this.diagnosticSessionByPeer = new Map();
      this.peerRecords = new Map();
      this.playerIdByPeer = new Map();
      this.pendingInputs = {};
      this.pendingActions = {};
      this.lastProcessedInput = {};
      this.lastProcessedAction = {};
      this.pendingGameplayEvents = [];
      this.recentStateByTick = new Map();
      this.seenReliableSequences = new Map();
      this.lastReplaceableSequence = new Map();
      this.invalidMessageCount = new Map();
      this.reconnectReservations = new Map();
      this.lastChatAtByPlayer = new Map();
      this.pendingFloorTransition = null;
      this.pendingRunEnd = null;
      this.runEndedBroadcast = false;
      this.persistenceRevision = 0;
      this.snapshotFloorSignature = '';
      this.snapshotBossSignature = '';
      this.lastSnapshotRoomByPlayer = {};
      this.metrics = {
        acceptedInputs: 0,
        duplicateInputs: 0,
        acceptedActions: 0,
        duplicateActions: 0,
        gameplayEvents: 0,
        snapshots: 0,
        snapshotAcks: 0,
        snapshotResyncs: 0,
        snapshotBytes: 0,
        maxSnapshotBytes: 0,
        droppedSnapshots: 0,
        degradedSnapshotSkips: 0,
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
        snapshotSequenceByPeer: Array.from(this.snapshotSequenceByPeer.entries()),
        lastSnapshotSentByPeer: Array.from(this.lastSnapshotSentByPeer.entries()),
        lastSnapshotAckByPeer: Array.from(this.lastSnapshotAckByPeer.entries()),
        lastResyncTickByPeer: Array.from(this.lastResyncTickByPeer.entries()),
        diagnosticSessionByPeer: Array.from(this.diagnosticSessionByPeer.entries()),
        rematchSerial: this.rematchSerial,
        chatSequence: this.chatSequence,
        mode: this.mode,
        visibility: this.visibility,
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
        persistenceRevision: this.persistenceRevision,
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
      this.snapshotSequenceByPeer = new Map(Array.isArray(runtime.snapshotSequenceByPeer) ? runtime.snapshotSequenceByPeer : []);
      this.lastSnapshotSentByPeer = new Map(Array.isArray(runtime.lastSnapshotSentByPeer) ? runtime.lastSnapshotSentByPeer : []);
      this.lastSnapshotAckByPeer = new Map(Array.isArray(runtime.lastSnapshotAckByPeer) ? runtime.lastSnapshotAckByPeer : []);
      this.lastResyncTickByPeer = new Map(Array.isArray(runtime.lastResyncTickByPeer) ? runtime.lastResyncTickByPeer : []);
      this.diagnosticSessionByPeer = new Map(Array.isArray(runtime.diagnosticSessionByPeer) ? runtime.diagnosticSessionByPeer : []);
      this.rematchSerial = Math.max(0, Math.trunc(Number(runtime.rematchSerial) || 0));
      this.chatSequence = Math.max(0, Math.trunc(Number(runtime.chatSequence) || 0));
      this.mode = ['rival', 'boss_rush'].includes(runtime.mode) ? runtime.mode : 'coop';
      this.visibility = runtime.visibility === 'public' ? 'public' : 'private';
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
      this.persistenceRevision = Math.max(0, Math.trunc(Number(runtime.persistenceRevision) || 0));
      this.reconnectReservations = new Map(Array.isArray(runtime.reconnectReservations) ? runtime.reconnectReservations : []);
      this.seenReliableSequences = new Map((Array.isArray(runtime.seenReliableSequences) ? runtime.seenReliableSequences : [])
        .map(([peerId, sequences]) => [peerId, new Set(Array.isArray(sequences) ? sequences : [])]));
      this.lastReplaceableSequence = new Map(Array.isArray(runtime.lastReplaceableSequence) ? runtime.lastReplaceableSequence : []);
      this.invalidMessageCount = new Map(Array.isArray(runtime.invalidMessageCount) ? runtime.invalidMessageCount : []);
      this.simulation.state.contentVersion = this.contentVersion;
      if (this.simulation.state.floorState?.layout) {
        this.simulation.state.floorState.layout.contentVersion = this.contentVersion;
      }
      // Checkpoints created before the shared player-geometry contract stored
      // an 18 px multiplayer-only radius. Normalize on wake so hibernated rooms
      // cannot keep the oversized collision body and 45 px character art.
      Object.values(this.simulation.state.players || {}).forEach(player => {
        player.radius = CAMPAIGN_PLAYER_RADIUS;
      });
      // Connected clients keep their authoritative state while the room
      // hibernates. Prime the delta baseline so a wake does not immediately
      // resend the full floor and every entity.
      this._primeSnapshotSignatures();
      return true;
    }

    _markPersistenceDirty() {
      this.persistenceRevision += 1;
      return this.persistenceRevision;
    }

    _primeSnapshotSignatures() {
      this.snapshotFloorSignature = JSON.stringify(snapshotFloorState(this.simulation.state.floorState));
      this.snapshotBossSignature = JSON.stringify(this.simulation.state.bossState || null);
      this.lastSnapshotRoomByPlayer = {};
      this.snapshotEntitySignaturesByPeer.clear();
      this.snapshotFloorSignatureByPeer.clear();
      this.snapshotBossSignatureByPeer.clear();
      this.pendingSnapshotBaselinesByPeer.clear();
      this.pendingFullSnapshotByPeer.clear();
    }

    _createSimulation(matchSeed, matchId) {
      const floorSeed = `${matchSeed}|floor:1`;
      const floorState = this.deferFloorGeneration
        ? {
          ...TEST_ROOM,
          currentRoomId: '',
          visitedRoomIds: [],
          roomTransition: null,
          transitionSequence: 0,
          transitionsByPlayer: {},
          layout: {
            matchSeed,
            floorSeed,
            floorNumber: 1,
            generationVersion: this.generationVersion,
            contentVersion: this.contentVersion,
            rooms: [],
            startRoomId: '',
            exitRoomId: '',
          },
        }
        : createNetworkFloorState({
          matchSeed,
          floorSeed,
          floorNumber: 1,
          generationVersion: this.generationVersion,
          contentVersion: this.contentVersion,
          gameMode: this.mode,
        });
      const state = new GameState({
        matchId,
        matchSeed,
        floorSeed,
        generationVersion: this.generationVersion,
        contentVersion: this.contentVersion,
        status: 'waiting',
        matchRules: {
          mode: this.mode,
          gameMode: this.mode,
          difficultyKey: this.difficulty.key || 'medium',
          difficulty: this.difficulty,
        },
        floorState,
      });
      if (typeof createCampaignSimulation !== 'function') throw new Error('Campaign authority is unavailable');
      return createCampaignSimulation({
        state,
        emitEvent: (eventType, data) => this._queueGameplayEvent(eventType, data),
      });
    }

    _ensureFloorGenerated() {
      if (this.simulation.state.floorState?.layout?.rooms?.length) return false;
      this.simulation.state.floorState = cloneSerializable(createNetworkFloorState({
        matchSeed: this.simulation.state.matchSeed,
        floorSeed: this.simulation.state.floorSeed,
        floorNumber: this.simulation.state.floorNumber,
        generationVersion: this.generationVersion,
        contentVersion: this.contentVersion,
        gameMode: this.mode,
      }));
      Object.values(this.simulation.state.players || {}).forEach(player => {
        player.roomId = this.simulation.state.floorState.currentRoomId;
        player.x = 300 + Math.max(0, Number(player.slotIndex) || 0) * 300;
        player.y = TEST_ROOM.height / 2;
        player.vx = 0;
        player.vy = 0;
      });
      return true;
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
        radius: CAMPAIGN_PLAYER_RADIUS,
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
      applyCampaignHeroProfile(player, player.characterKey, profile.kitChoices);
      return player;
    }

    async start() {
      await this.transport.initialize();
      return this.transport.createSession({ sessionId: this.sessionId, maxPeers: this.maxPlayers + 1 });
    }

    _send(peerId, type, payload, deliveryOverride = null) {
      const message = createEnvelope(type, this.outgoingSequence++, this.simulation.state.tick, payload);
      const result = this.transport.send(peerId, message, deliveryOverride || getDeliveryIntent(type));
      this.lastDeliveryResultByPeer.set(peerId, result || { queued: true, dropped: false });
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
        case 'SNAPSHOT_ACK': this._handleSnapshotAck(peerId, message.payload); break;
        case 'SNAPSHOT_RESYNC_REQUEST': this._handleSnapshotResyncRequest(peerId, message.payload); break;
        case 'DIAGNOSTIC_MARKER':
          if (message.payload.enabled) this.diagnosticSessionByPeer.set(peerId, message.payload.diagnosticSessionId);
          else this.diagnosticSessionByPeer.delete(peerId);
          break;
        case 'PING': this._send(peerId, 'PONG', {
          nonce: message.payload.nonce,
          clientTime: message.payload.clientTime,
          serverTick: this.simulation.state.tick,
          serverTime: Date.now(),
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
        const rejected = this.peerRecords.get(peerId) || {};
        rejected.rejected = true;
        this.peerRecords.set(peerId, rejected);
        this._markPersistenceDirty();
        this._send(peerId, 'JOIN_REJECTED', {
          code: 'VERSION_MISMATCH',
          message: 'This lobby is using a different Neo Nyke build. Update the game and try again.',
        });
        return;
      }
      const record = this.peerRecords.get(peerId) || {};
      record.helloAccepted = true;
      record.rejected = false;
      this.peerRecords.set(peerId, record);
      this._markPersistenceDirty();
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
        record.rejected = true;
        this._markPersistenceDirty();
        this._send(peerId, 'JOIN_REJECTED', { code: 'INVALID_SESSION', message: 'The local multiplayer session does not exist.' });
        return;
      }
      const activeReconnect = payload.reconnectToken && Array.from(this.peerRecords.entries())
        .find(([activePeerId, activeRecord]) => activePeerId !== peerId
          && activeRecord?.reconnectToken === payload.reconnectToken
          && activeRecord.playerId
          && this.simulation.state.players[activeRecord.playerId]);
      if (activeReconnect) {
        const [activePeerId, activeRecord] = activeReconnect;
        const player = this.simulation.state.players[activeRecord.playerId];
        const rotatedToken = createReconnectToken();
        this.peerRecords.delete(activePeerId);
        this.playerIdByPeer.delete(activePeerId);
        this.seenReliableSequences.delete(activePeerId);
        this.invalidMessageCount.delete(activePeerId);
        const replaceablePrefix = `${activePeerId}|`;
        Array.from(this.lastReplaceableSequence.keys()).forEach(key => {
          if (key.startsWith(replaceablePrefix)) this.lastReplaceableSequence.delete(key);
        });
        this.playerIdByPeer.set(peerId, player.id);
        record.playerId = player.id;
        record.ready = activeRecord.ready === true;
        record.reconnectToken = rotatedToken;
        player.peerId = peerId;
        player.disconnected = false;
        player.reconnectDeadlineTick = null;
        player.reconnectDeadlineAt = null;
        this._markPersistenceDirty();
        // Remove the old authority mapping before closing its socket. The
        // disconnect callback then cannot reserve or delete the transferred player.
        this.transport.disconnectPeer?.(activePeerId, 'session-takeover');
        this._send(peerId, 'JOIN_ACCEPTED', {
          matchId: this.simulation.state.matchId,
          sessionId: this.sessionId,
          playerId: player.id,
          reconnectToken: rotatedToken,
        });
        if (this.simulation.state.status === 'running') {
          this._send(peerId, 'INITIAL_STATE', {
            serverTick: this.simulation.state.tick,
            state: this.simulation.state.snapshot(),
            lastProcessedInput: { ...this.lastProcessedInput },
          });
        }
        this._broadcastLobbyState();
        return;
      }
      const reservation = payload.reconnectToken && this.reconnectReservations.get(payload.reconnectToken);
      if (reservation && reservation.deadlineTick >= this.simulation.state.tick
        && reservation.deadlineAt >= Date.now() && this.simulation.state.players[reservation.playerId]) {
        const player = this.simulation.state.players[reservation.playerId];
        this.reconnectReservations.delete(payload.reconnectToken);
        const rotatedToken = createReconnectToken();
        this.playerIdByPeer.set(peerId, player.id);
        record.playerId = player.id;
        record.ready = true;
        record.reconnectToken = rotatedToken;
        player.peerId = peerId;
        player.disconnected = false;
        player.reconnectDeadlineTick = null;
        player.reconnectDeadlineAt = null;
        this.pendingInputs[player.id] = { moveX: 0, moveY: 0, aimDirection: player.aimDirection || 0, buttons: 0 };
        this.pendingActions[player.id] = [];
        this.lastProcessedInput[player.id] = -1;
        this.lastProcessedAction[player.id] = -1;
        this._markPersistenceDirty();
        this._send(peerId, 'JOIN_ACCEPTED', {
          matchId: this.simulation.state.matchId,
          sessionId: this.sessionId,
          playerId: player.id,
          reconnectToken: rotatedToken,
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
        record.rejected = true;
        this._markPersistenceDirty();
        this._send(peerId, 'JOIN_REJECTED', { code: 'MATCH_STARTED', message: 'The local multiplayer match has already started.' });
        return;
      }
      if (this.playerIdByPeer.has(peerId)) return;
      if (this.playerIdByPeer.size >= this.maxPlayers) {
        record.rejected = true;
        this._markPersistenceDirty();
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
        record.rejected = true;
        this._markPersistenceDirty();
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
      this._markPersistenceDirty();
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
      if (record.ready === payload.ready) return;
      record.ready = payload.ready;
      this._markPersistenceDirty();
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
      applyCampaignHeroProfile(player, payload.characterKey, payload.kitChoices);
      record.ready = false;
      this._markPersistenceDirty();
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
        targetX: payload.targetX,
        targetY: payload.targetY,
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
        dashMoveX: payload.dashMoveX,
        dashMoveY: payload.dashMoveY,
        targetX: payload.targetX,
        targetY: payload.targetY,
        inputSequence: payload.inputSequence,
        predictionId: payload.predictionId,
        // This is deliberately only a bounded hint. Simulation state remains
        // authoritative at the current tick; co-op hit validation may consult
        // a short historical transform record, never arbitrary client state.
        originServerTick: Math.max(
          Math.max(0, this.simulation.state.tick - 6),
          Math.min(this.simulation.state.tick, Number(payload.originServerTick ?? this.simulation.state.tick) || this.simulation.state.tick),
        ),
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
      if (record.rematchReady === (payload.ready === true)) return;
      record.rematchReady = payload.ready === true;
      this._markPersistenceDirty();
      this._broadcastLobbyState();
      this._maybeStartRematch();
    }

    _handleSnapshotAck(peerId, payload) {
      if (!this.playerIdByPeer.has(peerId) || this.simulation.state.status !== 'running') return;
      const acknowledged = Math.max(0, Math.trunc(Number(payload.snapshotSequence) || 0));
      const sent = this.lastSnapshotSentByPeer.get(peerId);
      if (!Number.isInteger(sent) || acknowledged > sent) {
        this._rejectInvalidMessage(peerId, ['snapshot acknowledgement exceeds the latest sent snapshot']);
        return;
      }
      const previous = this.lastSnapshotAckByPeer.get(peerId);
      if (previous !== undefined && acknowledged <= previous) return;
      this.lastSnapshotAckByPeer.set(peerId, acknowledged);
      const sentTimes = this.snapshotSentAtByPeer.get(peerId);
      sentTimes?.forEach((_sentAt, sequence) => {
        if (sequence <= acknowledged) sentTimes.delete(sequence);
      });
      const pending = this.pendingSnapshotBaselinesByPeer.get(peerId);
      const baseline = pending?.get(acknowledged);
      if (baseline) {
        this.snapshotEntitySignaturesByPeer.set(peerId, baseline.entitySignatures);
        this.snapshotFloorSignatureByPeer.set(peerId, baseline.floorSignature);
        this.snapshotBossSignatureByPeer.set(peerId, baseline.bossSignature);
      }
      const pendingFullSequence = this.pendingFullSnapshotByPeer.get(peerId);
      if (pendingFullSequence !== undefined && acknowledged >= pendingFullSequence) {
        this.pendingFullSnapshotByPeer.delete(peerId);
      }
      pending?.forEach((_value, sequence) => {
        if (sequence <= acknowledged) pending.delete(sequence);
      });
      this.metrics.snapshotAcks += 1;
    }

    _handleSnapshotResyncRequest(peerId, payload) {
      if (!this.playerIdByPeer.has(peerId) || this.simulation.state.status !== 'running') return;
      const expected = Math.max(0, Math.trunc(Number(payload.expectedSequence) || 0));
      const received = Math.max(0, Math.trunc(Number(payload.receivedSequence) || 0));
      if (received < expected) {
        this._rejectInvalidMessage(peerId, ['snapshot resync sequence is invalid']);
        return;
      }
      const lastResyncTick = this.lastResyncTickByPeer.get(peerId);
      if (lastResyncTick !== undefined && this.simulation.state.tick - lastResyncTick < RESYNC_MIN_TICKS) return;
      this.lastResyncTickByPeer.set(peerId, this.simulation.state.tick);
      this.metrics.snapshotResyncs += 1;
      this._publishSnapshot(true, [peerId]);
    }

    _maybeStartRematch() {
      if (this.simulation.state.status !== 'ended') return false;
      const joined = Array.from(this.peerRecords.entries()).filter(([, record]) => record.playerId);
      if (joined.length < this.minPlayers || !joined.every(([, record]) => record.rematchReady === true)) return false;
      const previousPlayers = this.simulation.state.players || {};
      this.rematchSerial += 1;
      this.simulation = this._createSimulation(this.matchSeed, `${this.baseMatchId}:rematch:${this.rematchSerial}`);
      this.snapshotSequence = 0;
      this.snapshotSequenceByPeer.clear();
      this.lastSnapshotSentByPeer.clear();
      this.lastSnapshotAckByPeer.clear();
      this.snapshotSentAtByPeer.clear();
      this.snapshotCadenceByPeer.clear();
      this.snapshotCadenceRecoveryAtByPeer.clear();
      this.lastResyncTickByPeer.clear();
      this.snapshotEntitySignaturesByPeer.clear();
      this.snapshotFloorSignatureByPeer.clear();
      this.snapshotBossSignatureByPeer.clear();
      this.pendingSnapshotBaselinesByPeer.clear();
      this.pendingFullSnapshotByPeer.clear();
      this.lastDeliveryResultByPeer.clear();
      this.diagnosticSessionByPeer.clear();
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
      this._markPersistenceDirty();
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
        const payload = {
          eventId: this.simulation.state.allocateEntityId('event'),
          eventType: event.eventType,
          data: event.data,
        };
        if (event.eventType === 'ACTION_REJECTED' && event.data?.playerId) {
          const recipient = Array.from(this.playerIdByPeer.entries())
            .find(([, playerId]) => playerId === event.data.playerId)?.[0];
          if (recipient) this._send(recipient, 'GAMEPLAY_EVENT', payload);
          else this._broadcast('GAMEPLAY_EVENT', payload);
        } else {
          this._broadcast('GAMEPLAY_EVENT', payload);
        }
        this.metrics.gameplayEvents += 1;
      });
    }

    _startMatch() {
      if (this.simulation.state.status !== 'waiting') return;
      this._ensureFloorGenerated();
      this.simulation.state.status = 'starting';
      this._broadcast('MATCH_STARTING', {
        startTick: this.simulation.state.tick,
        matchSeed: this.simulation.state.matchSeed,
        floorSeed: this.simulation.state.floorSeed,
        generationVersion: this.generationVersion,
        contentVersion: this.contentVersion,
      });
      this.simulation.state.status = 'running';
      this._markPersistenceDirty();
      ensureNetworkEncounter(this.simulation.state, this.simulation.random,
        (eventType, data) => this._queueGameplayEvent(eventType, data));
      this._broadcast('INITIAL_STATE', {
        serverTick: this.simulation.state.tick,
        state: this.simulation.state.snapshot(),
        lastProcessedInput: { ...this.lastProcessedInput },
      });
      this._primeSnapshotSignatures();
      this._rememberStateForValidation();
      this._flushGameplayEvents();
      this._broadcastLobbyState();
    }

    endMatch(reason = 'authority-ended') {
      if (this.simulation.state.status !== 'running') return false;
      this.simulation.state.status = 'ended';
      this.pendingRunEnd = {
        result: 'defeat',
        reason: String(reason || 'authority-ended').slice(0, 96),
        floorNumber: Math.max(1, Math.trunc(Number(this.simulation.state.floorNumber) || 1)),
      };
      this._markPersistenceDirty();
      this._publishSnapshot(true);
      this._broadcastRunEnded();
      return true;
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
        visibility: this.visibility,
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
      if (!peerId) return;
      const playerId = this.playerIdByPeer.get(peerId);
      const record = this.peerRecords.get(peerId);
      let cleaned = this.peerRecords.delete(peerId);
      cleaned = this.seenReliableSequences.delete(peerId) || cleaned;
      cleaned = this.invalidMessageCount.delete(peerId) || cleaned;
      cleaned = this.snapshotSequenceByPeer.delete(peerId) || cleaned;
      cleaned = this.lastSnapshotSentByPeer.delete(peerId) || cleaned;
      cleaned = this.lastSnapshotAckByPeer.delete(peerId) || cleaned;
      cleaned = this.snapshotSentAtByPeer.delete(peerId) || cleaned;
      cleaned = this.snapshotCadenceByPeer.delete(peerId) || cleaned;
      cleaned = this.snapshotCadenceRecoveryAtByPeer.delete(peerId) || cleaned;
      cleaned = this.lastResyncTickByPeer.delete(peerId) || cleaned;
      cleaned = this.snapshotEntitySignaturesByPeer.delete(peerId) || cleaned;
      cleaned = this.snapshotFloorSignatureByPeer.delete(peerId) || cleaned;
      cleaned = this.snapshotBossSignatureByPeer.delete(peerId) || cleaned;
      cleaned = this.pendingSnapshotBaselinesByPeer.delete(peerId) || cleaned;
      cleaned = this.pendingFullSnapshotByPeer.delete(peerId) || cleaned;
      cleaned = this.lastDeliveryResultByPeer.delete(peerId) || cleaned;
      cleaned = this.diagnosticSessionByPeer.delete(peerId) || cleaned;
      const replaceablePrefix = `${peerId}|`;
      Array.from(this.lastReplaceableSequence.keys()).forEach(key => {
        if (!key.startsWith(replaceablePrefix)) return;
        this.lastReplaceableSequence.delete(key);
        cleaned = true;
      });
      if (!playerId) {
        if (cleaned) this._markPersistenceDirty();
        return;
      }
      this.playerIdByPeer.delete(peerId);
      delete this.pendingInputs[playerId];
      delete this.pendingActions[playerId];
      delete this.lastProcessedInput[playerId];
      delete this.lastProcessedAction[playerId];
      this.lastChatAtByPlayer.delete(playerId);
      const player = this.simulation.state.players[playerId];
      const displayName = String(player?.displayName || record?.displayName || peerId).slice(0, 64);
      const slotIndex = Math.max(0, Math.trunc(Number(player?.slotIndex) || 0));
      const intentional = isIntentionalDisconnectReason(reason);
      const canReconnect = !intentional && this.simulation.state.status === 'running' && player && record?.reconnectToken;
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
      this._markPersistenceDirty();
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
          {
            ...input,
            actions: (this.pendingActions[playerId] || []).splice(0).map(action => ({
              ...action,
              // Co-op uses only an authority-recorded transform sample. Rival
              // mode deliberately stays current-tick to keep contests strict.
              validationState: this.mode === 'coop' ? this.recentStateByTick.get(action.originServerTick) || null : null,
            })),
          },
        ]));
        this.simulation.updateGame(tickInputs, FIXED_DELTA_SECONDS);
        this._rememberStateForValidation();
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
          // Full state is reserved for join/reconnect, room transitions and an
          // explicit recovery request. On an ordered WebSocket a periodic giant
          // correction creates head-of-line stalls precisely when combat is busy.
          this._publishSnapshot(false);
        }
      }
      return this.simulation.state;
    }

    _rememberStateForValidation() {
      const state = this.simulation.state;
      this.recentStateByTick.set(state.tick, {
        players: Object.fromEntries(Object.entries(state.players || {}).map(([id, player]) => [id, {
          x: player.x, y: player.y, radius: player.radius, roomId: player.roomId,
        }])),
        enemies: Object.fromEntries(Object.entries(state.enemies || {}).map(([id, enemy]) => [id, {
          x: enemy.x, y: enemy.y, radius: enemy.radius, roomId: enemy.roomId, dead: !!enemy.dead,
        }])),
      });
      const minimum = state.tick - 6;
      this.recentStateByTick.forEach((_record, tick) => {
        if (tick < minimum) this.recentStateByTick.delete(tick);
      });
    }

    _expireReconnectReservations() {
      this.reconnectReservations.forEach((reservation, token) => {
        if (reservation.deadlineTick > this.simulation.state.tick && reservation.deadlineAt > Date.now()) return;
        this.reconnectReservations.delete(token);
        delete this.simulation.state.players[reservation.playerId];
        this.lastChatAtByPlayer.delete(reservation.playerId);
        this._markPersistenceDirty();
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
      this._markPersistenceDirty();
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

    _publishSnapshot(full, recipientPeerIds = null) {
      const floorSignature = JSON.stringify(snapshotFloorState(this.simulation.state.floorState));
      const bossSignature = JSON.stringify(this.simulation.state.bossState || null);
      const recipients = recipientPeerIds || Array.from(this.playerIdByPeer.keys());
      recipients.forEach(peerId => {
        const playerId = this.playerIdByPeer.get(peerId);
        const player = this.simulation.state.players[playerId];
        if (!player) return;
        const networkNow = Math.max(0, Number(this.transport.network?.clock?.now?.() ?? Date.now()) || 0);
        const oldestUnacknowledgedAt = this.snapshotSentAtByPeer.get(peerId)?.values?.().next?.().value;
        const oldestUnacknowledgedAge = oldestUnacknowledgedAt == null
          ? 0
          : Math.max(0, networkNow - Number(oldestUnacknowledgedAt));
        let degradedCadenceTicks = Number(this.snapshotCadenceByPeer.get(peerId) || 0);
        let cadenceRecoveryAt = Number(this.snapshotCadenceRecoveryAtByPeer.get(peerId) || 0);
        if (oldestUnacknowledgedAge >= SNAPSHOT_SEVERE_AGE_MS) {
          degradedCadenceTicks = 8;
          cadenceRecoveryAt = networkNow + SNAPSHOT_SEVERE_HOLD_MS;
        } else if (oldestUnacknowledgedAge >= SNAPSHOT_DEGRADE_AGE_MS) {
          degradedCadenceTicks = Math.max(4, degradedCadenceTicks);
          cadenceRecoveryAt = Math.max(cadenceRecoveryAt, networkNow + SNAPSHOT_DEGRADE_HOLD_MS);
        } else if (degradedCadenceTicks > 0 && networkNow >= cadenceRecoveryAt) {
          // Recover one step at a time. This prevents a single ACK from jumping
          // straight back to 10 Hz and immediately flooding the same slow link.
          degradedCadenceTicks = degradedCadenceTicks >= 8 ? 4 : 0;
          cadenceRecoveryAt = degradedCadenceTicks
            ? networkNow + SNAPSHOT_DEGRADE_HOLD_MS
            : 0;
        }
        if (degradedCadenceTicks > 0) {
          this.snapshotCadenceByPeer.set(peerId, degradedCadenceTicks);
          this.snapshotCadenceRecoveryAtByPeer.set(peerId, cadenceRecoveryAt);
        } else {
          this.snapshotCadenceByPeer.delete(peerId);
          this.snapshotCadenceRecoveryAtByPeer.delete(peerId);
        }
        if (!full && degradedCadenceTicks > 0
          && this.simulation.state.tick % degradedCadenceTicks !== 0) {
          this.metrics.degradedSnapshotSkips += 1;
          return;
        }
        const roomChanged = this.enableSnapshotPacking && this.lastSnapshotRoomByPlayer[playerId] !== player.roomId;
        const previousSignatures = this.snapshotEntitySignaturesByPeer.get(peerId);
        if (this.pendingFullSnapshotByPeer.has(peerId) && !full && !roomChanged) return;
        const clientFull = full || roomChanged || !previousSignatures;
        this.lastSnapshotRoomByPlayer[playerId] = player.roomId;
        const nextSignatures = {};
        const scoped = {};
        const scopedRemovedEntityIds = new Set();
        SNAPSHOT_ENTITY_COLLECTIONS.forEach(collection => {
          const previous = previousSignatures?.[collection] || {};
          const next = {};
          const changed = {};
          Object.entries(this.simulation.state[collection] || {}).forEach(([entityId, entity]) => {
            if (this.enableSnapshotPacking && collection !== 'players' && entity?.roomId !== player.roomId) return;
            const signature = this.enableSnapshotPacking
              ? snapshotEntitySignature(collection, entity)
              : JSON.stringify(entity);
            next[entityId] = signature;
            if (clientFull || previous[entityId] !== signature) changed[entityId] = cloneSerializable(entity);
          });
          if (!clientFull) Object.keys(previous).forEach(entityId => {
            if (!Object.prototype.hasOwnProperty.call(next, entityId)) scopedRemovedEntityIds.add(entityId);
          });
          nextSignatures[collection] = next;
          scoped[collection] = changed;
        });
        const packedDynamic = this.enableSnapshotPacking && !clientFull
          ? packDynamicEntities(scopedSnapshotEntities(
            Object.fromEntries(PACKED_DYNAMIC_COLLECTIONS.map(collection => [
              collection, this.simulation.state[collection] || {},
            ])),
            player.roomId,
          ))
          : undefined;
        const previousFloorSignature = this.snapshotFloorSignatureByPeer.get(peerId) ?? this.snapshotFloorSignature;
        const previousBossSignature = this.snapshotBossSignatureByPeer.get(peerId) ?? this.snapshotBossSignature;
        const floorChanged = floorSignature !== previousFloorSignature;
        const bossStateChanged = bossSignature !== previousBossSignature;
        const payload = {
          snapshotSequence: this.snapshotSequenceByPeer.get(peerId) || 0,
          baselineSequence: clientFull
            ? -1
            : Number(this.lastSnapshotAckByPeer.get(peerId) ?? -1),
          serverTick: this.simulation.state.tick,
          serverSentAt: Date.now(),
          full: clientFull,
          lastProcessedInput: { [playerId]: this.lastProcessedInput[playerId] ?? -1 },
          entities: scoped,
          ...(packedDynamic ? { packedDynamic } : {}),
          removedEntityIds: Array.from(scopedRemovedEntityIds),
          beamStruggles: cloneSerializable(this.simulation.state.beamStruggles || {}),
          // A full correction must repair every authoritative state domain, not
          // only entity collections. Room-owned mutations (broken pots,
          // hazards, doors, rewards, etc.) live inside floorState; omitting it
          // preserves exactly the client divergence this snapshot is meant to
          // recover from.
          floorState: clientFull || floorChanged ? JSON.parse(floorSignature) : null,
          bossState: clientFull || bossStateChanged ? JSON.parse(bossSignature) : null,
          bossStateChanged: clientFull || bossStateChanged,
        };
        const delivery = clientFull
          ? { reliability: 'reliable', channel: 'snapshot', replaceable: false }
          : getDeliveryIntent('WORLD_SNAPSHOT');
        this._send(peerId, 'WORLD_SNAPSHOT', payload, delivery);
        const serializedPayload = JSON.stringify(payload);
        const encodedBytes = typeof Buffer !== 'undefined'
          ? Buffer.byteLength(serializedPayload, 'utf8')
          : new TextEncoder().encode(serializedPayload).byteLength;
        this.metrics.snapshotBytes += encodedBytes;
        this.metrics.maxSnapshotBytes = Math.max(this.metrics.maxSnapshotBytes, encodedBytes);
        const deliveryResult = this.lastDeliveryResultByPeer.get(peerId);
        if (deliveryResult?.dropped) {
          this.metrics.droppedSnapshots += 1;
        } else {
          if (clientFull) this.pendingFullSnapshotByPeer.set(peerId, payload.snapshotSequence);
          const pending = this.pendingSnapshotBaselinesByPeer.get(peerId) || new Map();
          pending.set(payload.snapshotSequence, {
            entitySignatures: nextSignatures,
            floorSignature,
            bossSignature,
          });
          if (pending.size > SNAPSHOT_BASELINE_HISTORY) pending.delete(pending.keys().next().value);
          this.pendingSnapshotBaselinesByPeer.set(peerId, pending);
          const sentTimes = this.snapshotSentAtByPeer.get(peerId) || new Map();
          sentTimes.set(payload.snapshotSequence, networkNow);
          while (sentTimes.size > SNAPSHOT_BASELINE_HISTORY) {
            sentTimes.delete(sentTimes.keys().next().value);
          }
          this.snapshotSentAtByPeer.set(peerId, sentTimes);
          this.snapshotSequenceByPeer.set(peerId, payload.snapshotSequence + 1);
          this.lastSnapshotSentByPeer.set(peerId, payload.snapshotSequence);
        }
      });
      this.snapshotSequence += 1;
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
      this.reconnectToken = options.reconnectToken ? String(options.reconnectToken) : null;
      this.authorityPeerId = null;
      this.sessionId = null;
      this.playerId = null;
      this.status = 'disconnected';
      this.state = null;
      this.lobbyState = null;
      this.latestSnapshotSequence = -1;
      this.stateEpoch = 0;
      this.pendingSnapshotResync = false;
      this.snapshotStateHistory = new Map();
      this.lastAcknowledgedInput = -1;
      this.seenReliableSequences = new Set();
      this.receivedTypes = [];
      this.gameplayEvents = [];
      this.chatMessages = [];
      this.connectionNotices = [];
      this.runEnd = null;
      this.errors = [];
      this.diagnostics = {
        enabled: false,
        diagnosticSessionId: null,
        startedAt: 0,
        rttMs: 0,
        jitterMs: 0,
        snapshots: 0,
        snapshotBytes: 0,
        maxSnapshotBytes: 0,
        resyncRequests: 0,
        lastSnapshotAt: 0,
        trace: [],
      };
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
      this.latestSnapshotSequence = -1;
      this.pendingSnapshotResync = false;
      this.snapshotStateHistory.clear();
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
      if (this.diagnostics.enabled && this.diagnostics.diagnosticSessionId) {
        this._send('DIAGNOSTIC_MARKER', {
          diagnosticSessionId: this.diagnostics.diagnosticSessionId,
          enabled: true,
        });
      }
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
        ...(Number.isFinite(Number(input.targetX)) ? { targetX: Math.max(-1024, Math.min(2048, Number(input.targetX))) } : {}),
        ...(Number.isFinite(Number(input.targetY)) ? { targetY: Math.max(-1024, Math.min(2048, Number(input.targetY))) } : {}),
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
        ...(options.predictionId ? { predictionId: String(options.predictionId).slice(0, 96) } : {}),
        ...(Number.isFinite(Number(options.dashMoveX)) ? { dashMoveX: Math.max(-1, Math.min(1, Number(options.dashMoveX))) } : {}),
        ...(Number.isFinite(Number(options.dashMoveY)) ? { dashMoveY: Math.max(-1, Math.min(1, Number(options.dashMoveY))) } : {}),
        ...(Number.isFinite(Number(options.targetX)) ? { targetX: Math.max(-1024, Math.min(2048, Number(options.targetX))) } : {}),
        ...(Number.isFinite(Number(options.targetY)) ? { targetY: Math.max(-1024, Math.min(2048, Number(options.targetY))) } : {}),
        originServerTick: Math.max(0, Math.trunc(Number(options.originServerTick ?? this.state?.tick) || 0)),
      });
      return inputSequence;
    }

    sendAbility(abilityId, aimDirection = 0, options = {}) {
      return this.sendAction('ABILITY', aimDirection, { ...options, abilityId });
    }

    sendDash(abilityId, aimDirection = 0, options = {}) {
      return this.sendAction('DASH', aimDirection, { ...options, abilityId });
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

    setDiagnostics(enabled, diagnosticSessionId) {
      const active = enabled === true;
      const id = String(diagnosticSessionId || this.diagnostics.diagnosticSessionId || '').slice(0, 64);
      if (active && id.length < 8) throw new RangeError('Diagnostic session ID is too short');
      this.diagnostics.enabled = active;
      this.diagnostics.diagnosticSessionId = active ? id : null;
      this.diagnostics.startedAt = active ? Date.now() : 0;
      if (this.authorityPeerId) {
        this._send('DIAGNOSTIC_MARKER', { diagnosticSessionId: id || 'disabled', enabled: active });
      }
      return this.getDiagnostics();
    }

    _recordDiagnostic(kind, data = {}) {
      if (!this.diagnostics.enabled) return;
      this.diagnostics.trace.push({ at: Date.now(), tick: Number(this.state?.tick || 0), kind, ...data });
      if (this.diagnostics.trace.length > 600) {
        this.diagnostics.trace.splice(0, this.diagnostics.trace.length - 600);
      }
    }

    getDiagnostics() {
      return cloneSerializable(this.diagnostics);
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
          this.pendingSnapshotResync = false;
          this.snapshotStateHistory.clear();
          if (this.status !== 'running') this.status = 'starting';
          break;
        case 'INITIAL_STATE':
          this.state = new GameState(message.payload.state);
          this.stateEpoch += 1;
          this.lastAcknowledgedInput = message.payload.lastProcessedInput[this.playerId] ?? -1;
          this.pendingSnapshotResync = false;
          this.snapshotStateHistory.clear();
          this.status = 'running';
          break;
        case 'WORLD_SNAPSHOT': this._applySnapshot(message.payload); break;
        case 'PONG': {
          const now = Math.max(0, this.transport.network?.clock?.now?.() || Date.now());
          const rtt = Math.max(0, now - Number(message.payload.clientTime || now));
          const previousRtt = Number(this.diagnostics.rttMs || rtt);
          this.diagnostics.rttMs = rtt;
          this.diagnostics.jitterMs = this.diagnostics.jitterMs * 0.8 + Math.abs(rtt - previousRtt) * 0.2;
          const offsetSample = Number(message.payload.serverTime || 0) > 0
            ? Number(message.payload.serverTime) - (Number(message.payload.clientTime) + rtt / 2)
            : Number(this.diagnostics.clockOffsetMs || 0);
          this.diagnostics.clockOffsetMs = this.diagnostics.clockOffsetSamples
            ? Number(this.diagnostics.clockOffsetMs || 0) * 0.8 + offsetSample * 0.2
            : offsetSample;
          this.diagnostics.clockOffsetSamples = Number(this.diagnostics.clockOffsetSamples || 0) + 1;
          this._recordDiagnostic('pong', {
            rttMs: Number(rtt.toFixed(1)),
            jitterMs: Number(this.diagnostics.jitterMs.toFixed(1)),
            serverTick: message.payload.serverTick,
          });
          break;
        }
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
      const expectedSequence = this.latestSnapshotSequence + 1;
      const rebasedSnapshot = !snapshot.full && snapshot.baselineSequence !== this.latestSnapshotSequence;
      const baselineState = rebasedSnapshot
        ? this.snapshotStateHistory.get(snapshot.baselineSequence)
        : null;
      if (rebasedSnapshot && !baselineState) {
        if (!this.pendingSnapshotResync) {
          this.pendingSnapshotResync = true;
          this.diagnostics.resyncRequests += 1;
          this._recordDiagnostic('snapshot-gap', {
            expectedSequence,
            receivedSequence: snapshot.snapshotSequence,
          });
          this._send('SNAPSHOT_RESYNC_REQUEST', {
            expectedSequence,
            receivedSequence: snapshot.snapshotSequence,
          });
        }
        return;
      }
      if (!this.state) return;
      // Several replaceable deltas may be in flight from the same acknowledged
      // baseline. Reconstruct a newer arrival from that exact cached state.
      // Applying it over the latest state is unsafe when a field changed and
      // then reverted to its baseline value, because that reversion is omitted
      // from the delta by design.
      if (rebasedSnapshot) this.state = new GameState(cloneSerializable(baselineState));
      const receivedAt = Date.now();
      const snapshotBytes = typeof Buffer !== 'undefined'
        ? Buffer.byteLength(JSON.stringify(snapshot), 'utf8')
        : new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
      const intervalMs = this.diagnostics.lastSnapshotAt
        ? Math.max(0, receivedAt - this.diagnostics.lastSnapshotAt)
        : 0;
      this.diagnostics.lastSnapshotAt = receivedAt;
      this.diagnostics.snapshots += 1;
      if (rebasedSnapshot) {
        this.diagnostics.rebasedSnapshots = Number(this.diagnostics.rebasedSnapshots || 0) + 1;
      }
      this.diagnostics.snapshotBytes += snapshotBytes;
      this.diagnostics.maxSnapshotBytes = Math.max(this.diagnostics.maxSnapshotBytes, snapshotBytes);
      this._recordDiagnostic('snapshot', {
        sequence: snapshot.snapshotSequence,
        serverTick: snapshot.serverTick,
        full: snapshot.full,
        rebased: rebasedSnapshot,
        bytes: snapshotBytes,
        intervalMs,
        transitMs: Math.max(0, receivedAt - (
          Number(snapshot.serverSentAt || receivedAt) - Number(this.diagnostics.clockOffsetMs || 0)
        )),
      });
      this.state.tick = snapshot.serverTick;
      SNAPSHOT_ENTITY_COLLECTIONS.forEach(collection => {
        const changed = cloneSerializable(snapshot.entities[collection] || {});
        if (snapshot.full) this.state[collection] = changed;
        else Object.assign(this.state[collection] || (this.state[collection] = {}), changed);
      });
      if (snapshot.packedDynamic) unpackDynamicEntities(this.state, snapshot.packedDynamic);
      (snapshot.removedEntityIds || []).forEach(entityId => {
        SNAPSHOT_ENTITY_COLLECTIONS.forEach(collection => { delete this.state[collection]?.[entityId]; });
      });
      this.state.beamStruggles = cloneSerializable(snapshot.beamStruggles);
      this.state.floorState = cloneSerializable(snapshot.floorState || this.state.floorState);
      if (snapshot.bossStateChanged) this.state.bossState = snapshot.bossState == null ? null : cloneSerializable(snapshot.bossState);
      this.lastAcknowledgedInput = snapshot.lastProcessedInput[this.playerId] ?? this.lastAcknowledgedInput;
      this.latestSnapshotSequence = snapshot.snapshotSequence;
      if (snapshot.full) this.snapshotStateHistory.clear();
      this.snapshotStateHistory.set(snapshot.snapshotSequence, this.state.snapshot());
      while (this.snapshotStateHistory.size > SNAPSHOT_BASELINE_HISTORY) {
        this.snapshotStateHistory.delete(this.snapshotStateHistory.keys().next().value);
      }
      if (snapshot.full || rebasedSnapshot) this.pendingSnapshotResync = false;
      this._send('SNAPSHOT_ACK', {
        snapshotSequence: snapshot.snapshotSequence,
        serverTick: snapshot.serverTick,
      });
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
