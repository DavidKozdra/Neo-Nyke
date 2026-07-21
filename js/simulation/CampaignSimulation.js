(function initializeCampaignSimulation(root, factory) {
  const api = factory(root.NeoNyke?.simulation || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCampaignSimulationApi(browserApi) {
  'use strict';

  // This module is deliberately headless. It is the one composition point used
  // by the offline authority and the Cloudflare authority; rendering clients
  // consume its state and events but never participate in outcome resolution.
  const gameSimulationApi = typeof require === 'function' ? require('./GameSimulation.js') : browserApi;
  const gameStateApi = typeof require === 'function' ? require('./GameState.js') : browserApi;
  const floorApi = typeof require === 'function' ? require('./DeterministicFloorGenerator.js') : browserApi;
  const movementRulesApi = typeof require === 'function' ? require('./CampaignMovementRules.js') : browserApi;
  const combatApi = typeof require === 'function' ? require('./NetworkCombatSystem.js') : browserApi;
  const worldContentApi = typeof require === 'function' ? require('./SharedWorldContent.js') : (globalThis.NeoNyke?.content || {});
  const roomInteriorApi = typeof require === 'function' ? require('./SharedRoomInteriorSystem.js') : browserApi;
  const itemEffectApi = typeof require === 'function' ? require('./SharedItemEffectSystem.js') : browserApi;
  const { GameSimulation } = gameSimulationApi;
  const { GameState } = gameStateApi;
  const { generateFloorLayout } = floorApi;
  const {
    applyResponsiveVelocity,
    getCampaignPlayerMovementSpeed,
    isCampaignPlayerDashing,
    applyCampaignDashVelocity,
  } = movementRulesApi;
  const { createNetworkCombatSystem, createFloorProgressionSystem, applyNetworkHeroProfile } = combatApi;
  const { decorateSharedRoomInterior, resolveRoomObstacleMovement } = roomInteriorApi;
  const { syncCampaignItemStats } = itemEffectApi;

  const CAMPAIGN_CONTENT_VERSION = 'shared-neo-campaign-parity-v28';
  const CAMPAIGN_ROOM = Object.freeze({ id: 'campaign-start-room', ...worldContentApi.CAMPAIGN_ROOM_GEOMETRY });
  const ROOM_DIRECTIONS = Object.freeze({
    n: Object.freeze({ dx: 0, dy: -1, opposite: 's' }),
    s: Object.freeze({ dx: 0, dy: 1, opposite: 'n' }),
    e: Object.freeze({ dx: 1, dy: 0, opposite: 'w' }),
    w: Object.freeze({ dx: -1, dy: 0, opposite: 'e' }),
  });

  function createCampaignFloorState(options = {}) {
    const layout = generateFloorLayout({
      matchSeed: options.matchSeed,
      floorSeed: options.floorSeed,
      floorNumber: options.floorNumber || 1,
      generationVersion: options.generationVersion || 1,
      contentVersion: options.contentVersion || CAMPAIGN_CONTENT_VERSION,
    });
    if (typeof decorateSharedRoomInterior === 'function') {
      layout.rooms.forEach(room => decorateSharedRoomInterior(room, {
        matchSeed: options.matchSeed,
        floorSeed: layout.floorSeed,
        floorNumber: layout.floorNumber,
        generationVersion: layout.generationVersion,
        contentVersion: layout.contentVersion,
        geometry: CAMPAIGN_ROOM,
      }));
    }
    return {
      ...CAMPAIGN_ROOM,
      currentRoomId: layout.startRoomId,
      visitedRoomIds: [layout.startRoomId],
      roomTransition: null,
      transitionSequence: 0,
      transitionsByPlayer: {},
      layout,
    };
  }

  function getCampaignRoom(floorState = {}, roomId = floorState.currentRoomId) {
    return floorState.layout?.rooms?.find(room => room.id === roomId) || null;
  }

  function getAdjacentCampaignRoom(floorState, room, directionKey) {
    const direction = ROOM_DIRECTIONS[directionKey];
    if (!direction || !room?.doors?.[directionKey]) return null;
    return floorState.layout?.rooms?.find(candidate => (
      candidate.gx === room.gx + direction.dx && candidate.gy === room.gy + direction.dy
    )) || null;
  }

  function placePlayerAtCampaignRoomEntrance(state, player, directionKey, roomId) {
    const floorState = state.floorState || {};
    const width = Number(floorState.width) || CAMPAIGN_ROOM.width;
    const height = Number(floorState.height) || CAMPAIGN_ROOM.height;
    const wall = Number(floorState.wallThickness) || CAMPAIGN_ROOM.wallThickness;
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

  function transitionCampaignRoom(state, player, directionKey, isRoomLocked = () => false) {
    const floorState = state.floorState || {};
    const currentRoom = getCampaignRoom(floorState, player?.roomId);
    const nextRoom = getAdjacentCampaignRoom(floorState, currentRoom, directionKey);
    const lastTransition = floorState.transitionsByPlayer?.[player?.id];
    if (!player || !nextRoom || lastTransition?.tick === state.tick || isRoomLocked(state, currentRoom?.id)) return false;
    floorState.transitionSequence = Math.max(0, Number(floorState.transitionSequence) || 0) + 1;
    const transition = {
      sequence: floorState.transitionSequence,
      tick: state.tick,
      playerId: player.id,
      fromRoomId: currentRoom.id,
      toRoomId: nextRoom.id,
      direction: directionKey,
    };
    floorState.roomTransition = transition;
    floorState.transitionsByPlayer = floorState.transitionsByPlayer || {};
    floorState.transitionsByPlayer[player.id] = transition;
    const visited = new Set(Array.isArray(floorState.visitedRoomIds) ? floorState.visitedRoomIds : []);
    visited.add(nextRoom.id);
    floorState.visitedRoomIds = Array.from(visited);
    placePlayerAtCampaignRoomEntrance(state, player, directionKey, nextRoom.id);
    return true;
  }

  function createCampaignMovementSystem(options = {}) {
    const isRoomLocked = typeof options.isRoomLocked === 'function' ? options.isRoomLocked : () => false;
    return ({ state, inputs, fixedDelta }) => {
      const floorState = state.floorState || CAMPAIGN_ROOM;
      const width = Number(floorState.width) || CAMPAIGN_ROOM.width;
      const height = Number(floorState.height) || CAMPAIGN_ROOM.height;
      const wall = Number(floorState.wallThickness) || CAMPAIGN_ROOM.wallThickness;
      const doorWidth = Number(floorState.doorWidth) || CAMPAIGN_ROOM.doorWidth;
      for (const player of Object.values(state.players || {})) {
        if (!player || player.disconnected || player.downed) {
          if (player) { player.vx = 0; player.vy = 0; }
          continue;
        }
        const input = inputs[player.id] || {};
        let moveX = Number(input.moveX) || 0;
        let moveY = Number(input.moveY) || 0;
        const stunned = state.tick < Number(player.stunnedUntilTick || 0);
        if (stunned) { moveX = 0; moveY = 0; }
        const magnitude = Math.hypot(moveX, moveY);
        if (magnitude > 1) { moveX /= magnitude; moveY /= magnitude; }
        const speed = getCampaignPlayerMovementSpeed(player, state.tick);
        const radius = Math.max(1, Number(player.radius) || 18);
        const minimum = wall + radius;
        const maximumX = width - minimum;
        const maximumY = height - minimum;
        const dashing = !stunned && isCampaignPlayerDashing?.(player, state.tick);
        if (dashing) {
          // A dashing hero glides at its locked dash velocity and ignores input
          // steering, exactly like the campaign's dashTime branch. Movement
          // moves are the ones that reach here (warp/shield resolve instantly in
          // the combat system); this covers the plain dash-burst glides.
          applyCampaignDashVelocity(player);
        } else {
          if (Number(player.dashUntilTick || 0) && state.tick >= Number(player.dashUntilTick)) {
            player.dashUntilTick = 0;
            player.dashVx = 0;
            player.dashVy = 0;
          }
          // Match the campaign's acceleration/deceleration rather than snapping
          // an online player directly to an input-derived velocity.
          player.vx = applyResponsiveVelocity(player.vx, moveX * speed, fixedDelta);
          player.vy = applyResponsiveVelocity(player.vy, moveY * speed, fixedDelta);
        }
        const desiredX = player.x + player.vx * fixedDelta;
        const desiredY = player.y + player.vy * fixedDelta;
        const halfDoor = Math.max(radius * 1.5, doorWidth / 2 + radius);
        const insideHorizontalDoor = Math.abs(desiredX - width / 2) <= halfDoor;
        const insideVerticalDoor = Math.abs(desiredY - height / 2) <= halfDoor;
        let direction = null;
        if (desiredY < minimum && insideHorizontalDoor) direction = 'n';
        else if (desiredY > maximumY && insideHorizontalDoor) direction = 's';
        else if (desiredX > maximumX && insideVerticalDoor) direction = 'e';
        else if (desiredX < minimum && insideVerticalDoor) direction = 'w';
        if (direction && transitionCampaignRoom(state, player, direction, isRoomLocked)) continue;
        let nextX = Math.max(minimum, Math.min(maximumX, desiredX));
        let nextY = Math.max(minimum, Math.min(maximumY, desiredY));
        const collision = resolveRoomObstacleMovement(getCampaignRoom(floorState, player.roomId), player, nextX, nextY);
        if (collision.blockedX) player.vx = 0;
        if (collision.blockedY) player.vy = 0;
        player.x = collision.x;
        player.y = collision.y;
        player.aimDirection = Number(input.aimDirection) || 0;
      }
    };
  }

  function createCampaignPlayer(options = {}) {
    const slotIndex = Math.max(0, Math.trunc(Number(options.slotIndex) || 0));
    const player = {
      id: String(options.id || 'player-1'),
      peerId: options.peerId == null ? null : String(options.peerId),
      displayName: String(options.displayName || 'Player'),
      x: Number.isFinite(Number(options.x)) ? Number(options.x) : 450,
      y: Number.isFinite(Number(options.y)) ? Number(options.y) : CAMPAIGN_ROOM.height / 2,
      vx: 0, vy: 0, radius: 18, moveSpeed: 228,
      maxHp: 100, hp: 100, coins: 0, level: 1, xp: 0, xpToNext: 20,
      damageMultiplier: 1, kills: 0, playerKills: 0, deaths: 0,
      downed: false, action: 'idle', actionTick: -1, attackCooldownUntilTick: 0, stunnedUntilTick: 0,
      aimDirection: 0, characterKey: options.characterKey || 'thorn_knight', slotIndex,
      roomId: String(options.roomId || ''),
    };
    return typeof applyNetworkHeroProfile === 'function'
      ? applyNetworkHeroProfile(player, player.characterKey, options.kitChoices)
      : player;
  }

  function createCampaignSimulation(options = {}) {
    const floorNumber = Math.max(1, Math.trunc(Number(options.floorNumber) || options.state?.floorNumber || 1));
    const state = options.state instanceof GameState ? options.state : new GameState({
      ...options.state,
      matchId: options.matchId || options.state?.matchId || 'campaign',
      matchSeed: options.matchSeed ?? options.state?.matchSeed ?? 0,
      floorSeed: options.floorSeed ?? options.state?.floorSeed ?? options.matchSeed ?? 0,
      generationVersion: options.generationVersion ?? options.state?.generationVersion ?? 1,
      contentVersion: options.contentVersion ?? options.state?.contentVersion ?? CAMPAIGN_CONTENT_VERSION,
      floorNumber,
      status: options.status || options.state?.status || 'running',
      matchRules: options.matchRules || options.state?.matchRules || { mode: 'coop' },
      floorState: options.state?.floorState || createCampaignFloorState({ ...options, floorNumber }),
    });
    const emitEvent = typeof options.emitEvent === 'function' ? options.emitEvent : () => {};
    const isRoomLocked = typeof combatApi.isNetworkRoomLocked === 'function' ? combatApi.isNetworkRoomLocked : () => false;
    return new GameSimulation({
      state,
      randomService: options.randomService,
      systems: [
        ({ state: simulationState }) => syncCampaignItemStats?.(simulationState),
        createCampaignMovementSystem({ isRoomLocked }),
        createNetworkCombatSystem({ emitEvent }),
        createFloorProgressionSystem({ emitEvent }),
        ...(Array.isArray(options.systems) ? options.systems : []),
      ],
    });
  }

  return {
    CAMPAIGN_CONTENT_VERSION,
    CAMPAIGN_ROOM,
    ROOM_DIRECTIONS,
    createCampaignFloorState,
    getCampaignRoom,
    getAdjacentCampaignRoom,
    transitionCampaignRoom,
    createCampaignMovementSystem,
    createCampaignPlayer,
    createCampaignSimulation,
  };
});
