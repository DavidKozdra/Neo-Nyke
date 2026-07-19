(function initializeNetworkGameView(root, factory) {
  const api = factory(root);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.rendering = namespace.rendering || {};
  Object.assign(namespace.rendering, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNetworkGameViewApi(root) {
  'use strict';

  const moveContent = typeof require === 'function'
    ? require('../simulation/SharedMoveContent.js')
    : (root.NeoNyke?.content || {});
  const worldContent = typeof require === 'function'
    ? require('../simulation/SharedWorldContent.js')
    : (root.NeoNyke?.content || {});
  const roomInterior = typeof require === 'function'
    ? require('../simulation/SharedRoomInteriorSystem.js')
    : (root.NeoNyke?.simulation || {});
  const CAMPAIGN_ROOM_GEOMETRY = worldContent.CAMPAIGN_ROOM_GEOMETRY;

  const INPUT_INTERVAL_MS = 50;
  const INTERPOLATION_DELAY_MS = 100;
  const ATTACK_KEYS = new Set(['Space', 'KeyJ']);
  const ABILITY_KEYS = new Map([['KeyR', 'smash'], ['ShiftLeft', 'dash'], ['ShiftRight', 'dash']]);
  const MOVEMENT_KEYS = new Map([
    ['KeyW', [0, -1]], ['ArrowUp', [0, -1]],
    ['KeyS', [0, 1]], ['ArrowDown', [0, 1]],
    ['KeyA', [-1, 0]], ['ArrowLeft', [-1, 0]],
    ['KeyD', [1, 0]], ['ArrowRight', [1, 0]],
  ]);

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function stableNumericId(value) {
    let hash = 2166136261;
    const text = String(value ?? '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // ── Client-side cosmetics ────────────────────────────────────────────────
  // Colours are pure presentation: the same for every entity of a given type,
  // and identical on every client. They belong here, derived locally from the
  // authoritative type/behaviour, NOT sent over the wire each snapshot. Keeping
  // them client-side saves bandwidth and removes cosmetic work from the server.
  const PLAYER_COLORS = ['#9de9ff', '#d9a7ff', '#ffd98f', '#ff9fcf'];
  const ABILITY_PRESENTATIONS = moveContent.MOVE_PRESENTATION_DEFS || Object.freeze({});
  const MOVE_BASE_STATS = moveContent.MOVE_BASE_STATS || Object.freeze({});
  const CONTINUOUS_BEAM_MOVES = new Set([
    'blood_beam', 'love_beam', 'turtle_wave', 'holy_eye_beams', 'god_sweep',
    'mooggy_blood_beam', 'thorn_blood_beams', 'wizard_lazer',
  ]);
  const CAMPAIGN_PRESENTATION_KEYS = Object.freeze([
    'player', 'projectiles', 'rooms', 'currentRoom', 'floor', 'floorsEntered',
    'enemies', 'chests', 'pickups', 'hazards', 'decorations', 'structures',
    'destructibles', 'deadBodies', 'cooldowns', 'environmentBackgroundCache',
    'laserActive', 'laserTime', 'laserTick', 'laserMode', 'laserAngle',
    'laserSweepSpeed', 'loveBeamCasting', 'activeBeamPaths', 'justiceBlades',
    'titanHammer', 'ghostBalls', 'skySwords', 'gameElapsedTime', 'lavaAnimTime',
    'showFloorTransition', 'floorTransitionTime', 'presentationPlayerSlots',
    'activePlayerEffects',
  ]);

  function deriveAbilityPresentation(data = {}) {
    const key = String(data.presentation?.key || data.presentationKey || data.abilityId || '');
    const authored = ABILITY_PRESENTATIONS[key];
    if (authored) return authored;
    if (data.slot === 'dash') return { color: '#8fdcff', style: 'light' };
    if (data.mode === 'support') return { color: '#78f0bc', style: 'light' };
    if (data.slot === 'smash') return { color: '#ffb36b', style: 'heavy' };
    return { color: '#d89bff', style: 'normal' };
  }

  // Stable per-player colour from the player's slot. playerId is allocated as
  // "player-N" by the authority, so N-1 maps to a deterministic palette slot.
  function derivePlayerColor(player = {}) {
    if (typeof player.slotIndex === 'number') return PLAYER_COLORS[player.slotIndex % PLAYER_COLORS.length];
    const match = /(\d+)\s*$/.exec(String(player.id || ''));
    const index = match ? (Number(match[1]) - 1) : 0;
    return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length];
  }

  function deriveEnemyProjectileColor(behavior) {
    if (behavior === 'beam') return '#c77bff';
    if (behavior === 'burst') return '#ff9f68';
    return '#ffc477';
  }

  // Resolve a projectile's colour: prefer the shared content table (same data
  // the authority used to embed), fall back to a neutral player/enemy tint.
  function deriveProjectileColor(projectile = {}, neo = {}) {
    const defs = neo.PROJECTILE_TYPE_DEFS || root.NeoNyke?.content?.PROJECTILE_TYPE_DEFS || {};
    const kind = projectile.kind || projectile.type;
    if (defs[kind]?.color) return defs[kind].color;
    if (projectile.hostile) return deriveEnemyProjectileColor(projectile.behavior);
    return '#9de9ff';
  }

  function normalizeMovement(moveX = 0, moveY = 0) {
    let x = Number(moveX) || 0;
    let y = Number(moveY) || 0;
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) {
      x /= magnitude;
      y /= magnitude;
    }
    return { moveX: x, moveY: y };
  }

  function computeWorldTransform(canvasWidth, canvasHeight, roomWidth = CAMPAIGN_ROOM_GEOMETRY.width, roomHeight = CAMPAIGN_ROOM_GEOMETRY.height, visibleBounds = null) {
    const bounds = visibleBounds || { left: 0, top: 0, right: canvasWidth, bottom: canvasHeight };
    const visibleWidth = Math.max(1, bounds.right - bounds.left);
    const visibleHeight = Math.max(1, bounds.bottom - bounds.top);
    const scale = Math.min(visibleWidth / roomWidth, visibleHeight / roomHeight);
    return {
      scale,
      offsetX: bounds.left + (visibleWidth - roomWidth * scale) / 2,
      offsetY: bounds.top + (visibleHeight - roomHeight * scale) / 2,
      roomWidth,
      roomHeight,
    };
  }

  function computeCameraTransform(canvasWidth, canvasHeight, camera = { x: 0, y: 0 }, visibleBounds = null) {
    const bounds = visibleBounds || { left: 0, top: 0, right: canvasWidth, bottom: canvasHeight };
    return {
      scale: 1,
      offsetX: bounds.left - Number(camera.x || 0),
      offsetY: bounds.top - Number(camera.y || 0),
      roomWidth: Math.max(1, Number(canvasWidth) || 1),
      roomHeight: Math.max(1, Number(canvasHeight) || 1),
    };
  }

  function interpolatePlayers(previous = {}, current = {}, alpha = 1) {
    const amount = clamp(Number(alpha) || 0, 0, 1);
    return Object.fromEntries(Object.entries(current).map(([playerId, player]) => {
      const before = previous[playerId] || player;
      const changedRoom = before.roomId && player.roomId && before.roomId !== player.roomId;
      return [playerId, {
        ...player,
        x: changedRoom ? Number(player.x || 0) : Number(before.x || 0) + (Number(player.x || 0) - Number(before.x || 0)) * amount,
        y: changedRoom ? Number(player.y || 0) : Number(before.y || 0) + (Number(player.y || 0) - Number(before.y || 0)) * amount,
      }];
    }));
  }

  function predictPosition(player, input, fixedDelta, floorState = {}) {
    const movement = normalizeMovement(input.moveX, input.moveY);
    const speed = Math.max(0, Number(player.moveSpeed) || 180);
    const radius = Math.max(1, Number(player.radius) || 18);
    const wall = Math.max(0, Number(floorState.wallThickness) || 28);
    const width = Math.max(1, Number(floorState.width) || 900);
    const height = Math.max(1, Number(floorState.height) || 700);
    const minimum = wall + radius;
    const desiredX = clamp(Number(player.x || 0) + movement.moveX * speed * fixedDelta, minimum, width - minimum);
    const desiredY = clamp(Number(player.y || 0) + movement.moveY * speed * fixedDelta, minimum, height - minimum);
    const room = floorState.layout?.rooms?.find(candidate => candidate.id === player.roomId);
    const collision = roomInterior.resolveRoomObstacleMovement?.(room, player, desiredX, desiredY)
      || { x: desiredX, y: desiredY, blockedX: false, blockedY: false };
    return {
      ...player,
      x: collision.x,
      y: collision.y,
      vx: collision.blockedX ? 0 : movement.moveX * speed,
      vy: collision.blockedY ? 0 : movement.moveY * speed,
      aimDirection: Number(input.aimDirection) || 0,
    };
  }

  class NetworkGameView {
    constructor(options = {}) {
      if (!options.session) throw new TypeError('NetworkGameView requires a multiplayer session');
      this.session = options.session;
      this.neo = options.neo || root.Neo || {};
      this.canvas = options.canvas || this.neo.canvas;
      this.ctx = options.context || this.neo.ctx;
      this.document = options.document || root.document;
      this.active = false;
      this.keys = new Set();
      this.aimDirection = 0;
      this.previousSample = null;
      this.currentSample = null;
      this.localPredictedPlayer = null;
      this.localPredictedPlayerId = null;
      this.lastFloorNumber = 0;
      this.floorTransitionStartedAt = 0;
      this.unsubscribe = null;
      this.inputTimer = null;
      this.animationFrame = null;
      this.lastRoomCode = '';
      this.lastTransitionSequence = 0;
      this.transitionFlashUntil = 0;
      this.lastFloorNumber = 0;
      this.floorTransitionStartedAt = 0;
      this.seenGameplayEvents = new Set();
      this.combatEffects = [];
      this.presentationRooms = new Map();
      this.presentationPlayerSlots = [];
      this.presentationPlayerActors = new Map();
      this.presentationEnemyActors = new Map();
      this.presentationProjectiles = new Map();
      this.presentationPickups = new Map();
      this.presentationHazards = new Map();
      this.presentationBodies = new Map();
      this.presentationInteractables = new Map();
      this.gamepadAttackPressed = false;
      this.camera = { x: 0, y: 0, roomId: null };
      this.lastPresentationFrameAt = 0;
      this.lastWorldTransform = null;
      this.paused = false;
      this.upgradeDwell = { selectionEventId: '', optionId: '', seconds: 0, sent: false };
      this.requestedInteractions = new Set();
      this.campaignPresentationState = null;
      this.campaignHudState = null;
      this.campaignBodyPaused = null;
      this.campaignGameState = null;
      this.boundKeyDown = event => this._onKey(event, true);
      this.boundKeyUp = event => this._onKey(event, false);
      this.boundPointerMove = event => this._onPointerMove(event);
      this.boundPointerDown = event => this._onPointerDown(event);
      this.boundContextMenu = event => {
        if (this.active && event.target === this.canvas) event.preventDefault();
      };
      this.boundBlur = () => this.keys.clear();
      this.boundPauseResume = event => {
        event?.preventDefault?.();
        event?.stopImmediatePropagation?.();
        this._togglePause(false);
      };
      this.boundPauseSettings = event => {
        event?.preventDefault?.();
        event?.stopImmediatePropagation?.();
        this.document?.getElementById('settingsBtn')?.click();
      };
      this.boundPauseLeave = () => this.document?.getElementById('multiplayerLeaveGame')?.click();
      this.pointerWasLocked = false;
      this.boundPointerLockChange = () => {
        const locked = this.document?.pointerLockElement === this.canvas;
        if (this.active && this.pointerWasLocked && !locked && !this.paused) this._togglePause(true);
        this.pointerWasLocked = locked;
      };
      this.boundRenderFrame = () => {
        if (!this.active) return;
        this.syncPresentation();
        this.neo.draw?.();
        this.animationFrame = root.requestAnimationFrame?.(this.boundRenderFrame) ?? null;
      };
    }

    start() {
      if (this.active) return;
      if (!this.canvas || !this.ctx) throw new Error('NetworkGameView requires the Neo Nyke canvas');
      this._captureCampaignPresentationState();
      this.active = true;
      // Use the campaign's real presentation/UI state. The main update loop
      // explicitly skips local simulation while this adapter is active, so this
      // enables canonical mouse-look, panels, pause and settings without running
      // a second authority in the browser.
      this.neo.setGameState?.('play');
      this.document?.getElementById('start')?.classList.add('hidden');
      const multiplayerHud = this.document?.getElementById('multiplayerGameHud');
      multiplayerHud?.classList.add('hidden');
      if (multiplayerHud) {
        multiplayerHud.style.display = 'none';
        multiplayerHud.setAttribute('aria-hidden', 'true');
      }
      this._setCampaignHudVisible(true);
      root.document?.body?.classList.add('network-multiplayer-active');
      root.addEventListener?.('keydown', this.boundKeyDown);
      root.addEventListener?.('keyup', this.boundKeyUp);
      root.addEventListener?.('pointermove', this.boundPointerMove);
      root.addEventListener?.('pointerdown', this.boundPointerDown);
      root.addEventListener?.('contextmenu', this.boundContextMenu);
      root.addEventListener?.('blur', this.boundBlur);
      this.pointerWasLocked = this.document?.pointerLockElement === this.canvas;
      this.document?.addEventListener?.('pointerlockchange', this.boundPointerLockChange);
      this.document?.getElementById('pauseResume')?.addEventListener('click', this.boundPauseResume, true);
      this.document?.getElementById('pauseSettings')?.addEventListener('click', this.boundPauseSettings, true);
      this.document?.getElementById('pauseLeaveServer')?.addEventListener('click', this.boundPauseLeave);
      this.unsubscribe = this.session.subscribe(snapshot => this._onSnapshot(snapshot));
      this.inputTimer = root.setInterval(() => this._sendInput(), INPUT_INTERVAL_MS);
      this._onSnapshot(this.session.snapshot());
      if (!this.neo.loopStarted) this.animationFrame = root.requestAnimationFrame?.(this.boundRenderFrame) ?? null;
    }

    stop() {
      if (!this.active) return;
      this.active = false;
      root.clearInterval?.(this.inputTimer);
      this.inputTimer = null;
      if (this.animationFrame !== null) root.cancelAnimationFrame?.(this.animationFrame);
      this.animationFrame = null;
      this.unsubscribe?.();
      this.unsubscribe = null;
      root.removeEventListener?.('keydown', this.boundKeyDown);
      root.removeEventListener?.('keyup', this.boundKeyUp);
      root.removeEventListener?.('pointermove', this.boundPointerMove);
      root.removeEventListener?.('pointerdown', this.boundPointerDown);
      root.removeEventListener?.('contextmenu', this.boundContextMenu);
      root.removeEventListener?.('blur', this.boundBlur);
      this.document?.removeEventListener?.('pointerlockchange', this.boundPointerLockChange);
      this.document?.getElementById('pauseResume')?.removeEventListener('click', this.boundPauseResume, true);
      this.document?.getElementById('pauseSettings')?.removeEventListener('click', this.boundPauseSettings, true);
      this.document?.getElementById('pauseLeaveServer')?.removeEventListener('click', this.boundPauseLeave);
      this.keys.clear();
      this.presentationPlayerSlots = [];
      this.presentationPlayerActors.clear();
      this._clearPresentationEntityCaches();
      const multiplayerHud = this.document?.getElementById('multiplayerGameHud');
      multiplayerHud?.classList.add('hidden');
      if (multiplayerHud) {
        multiplayerHud.style.display = '';
        multiplayerHud.setAttribute('aria-hidden', 'true');
      }
      this._togglePause(false);
      this._setCampaignHudVisible(false);
      this.document?.getElementById('start')?.classList.remove('hidden');
      root.document?.body?.classList.remove('network-multiplayer-active');
      this._restoreCampaignPresentationState();
      // A 3D multiplayer frame must never remain behind the main menu after the
      // authority/session is gone. The next normal 3D render re-enables this
      // class and canvas without changing the player's saved view preference.
      root.document?.body?.classList.remove('render3d');
      const webglCanvas = this.document?.getElementById('c3d');
      if (webglCanvas) webglCanvas.style.display = 'none';
      this.ctx?.setTransform?.(1, 0, 0, 1, 0, 0);
      this.ctx?.clearRect?.(0, 0, this.canvas?.width || 0, this.canvas?.height || 0);
    }

    _captureCampaignPresentationState() {
      if (this.campaignPresentationState) return;
      this.campaignPresentationState = new Map(CAMPAIGN_PRESENTATION_KEYS.map(key => [key, {
        owned: Object.prototype.hasOwnProperty.call(this.neo, key),
        value: this.neo[key],
      }]));
      const hudIds = ['hud', 'coinDisplay', 'centerDisplay', 'actionBar'];
      this.campaignHudState = new Map(hudIds.map(id => {
        const element = this.document?.getElementById(id);
        return [id, element ? {
          className: element.className,
          ariaHidden: element.getAttribute?.('aria-hidden'),
          display: element.style.display,
        } : null];
      }));
      this.campaignBodyPaused = root.document?.body?.classList.contains('game-paused') || false;
      this.campaignGameState = this.neo.gameState || 'menu';
    }

    _restoreCampaignPresentationState() {
      if (!this.campaignPresentationState) return;
      this.campaignPresentationState.forEach((entry, key) => {
        if (entry.owned) this.neo[key] = entry.value;
        else delete this.neo[key];
      });
      this.campaignPresentationState = null;
      if (this.campaignHudState) {
        this.campaignHudState.forEach((saved, id) => {
          const element = this.document?.getElementById(id);
          if (!element || !saved) return;
          element.className = saved.className;
          if (saved.ariaHidden == null) element.removeAttribute?.('aria-hidden');
          else element.setAttribute?.('aria-hidden', saved.ariaHidden);
          element.style.display = saved.display;
        });
      }
      if (this.campaignBodyPaused != null) root.document?.body?.classList.toggle('game-paused', this.campaignBodyPaused);
      if (this.campaignGameState) this.neo.setGameState?.(this.campaignGameState);
      this.campaignHudState = null;
      this.campaignBodyPaused = null;
      this.campaignGameState = null;
      this.presentationRooms.clear();
      this.presentationPlayerActors.clear();
      this._clearPresentationEntityCaches();
      this.combatEffects = [];
      this.seenGameplayEvents.clear();
      this.previousSample = null;
      this.currentSample = null;
      this.localPredictedPlayer = null;
      this.localPredictedPlayerId = null;
      this.lastFloorNumber = 0;
      this.floorTransitionStartedAt = 0;
      this.lastTransitionSequence = 0;
      this.transitionFlashUntil = 0;
      this.lastRoomCode = '';
      this.lastPresentationFrameAt = 0;
      this.camera = { x: 0, y: 0, roomId: null };
      this.upgradeDwell = { selectionEventId: '', optionId: '', seconds: 0, sent: false };
      this.requestedInteractions.clear();
    }

    _setCampaignHudVisible(visible) {
      // The campaign state machine (controller.js fallbackState) parks the HUD
      // widgets at inline `display:none` while `Neo.gameState` sits at the menu,
      // which it does for the whole network match. Toggling only the `hidden`
      // class leaves that inline style winning, so clear/set `style.display` too
      // (mirroring the per-element display values the campaign uses when it shows
      // the HUD in play).
      const displayValues = { hud: 'flex', coinDisplay: 'flex', centerDisplay: '', actionBar: '' };
      Object.entries(displayValues).forEach(([id, displayValue]) => {
        const element = this.document?.getElementById(id);
        if (!element) return;
        element.classList.toggle('hidden', !visible);
        element.setAttribute('aria-hidden', visible ? 'false' : 'true');
        element.style.display = visible ? displayValue : 'none';
      });
    }

    _onSnapshot(snapshot = {}) {
      this.lastRoomCode = snapshot.roomCode || this.lastRoomCode;
      const state = snapshot.gameState;
      this._consumeGameplayEvents(snapshot.gameplayEvents || []);
      if (!state || !state.players) return;
      const receivedAt = root.performance?.now?.() || Date.now();
      const receivedFloorNumber = Math.max(1, Number(state.floorNumber || state.floorState?.layout?.floorNumber || 1));
      if (this.lastFloorNumber > 0 && receivedFloorNumber !== this.lastFloorNumber) {
        this.floorTransitionStartedAt = receivedAt;
      }
      this.lastFloorNumber = receivedFloorNumber;
      const localTransition = state.floorState?.transitionsByPlayer?.[snapshot.playerId];
      const transitionSequence = Math.max(0, Number(localTransition?.sequence) || 0);
      if (transitionSequence > this.lastTransitionSequence) {
        if (this.lastTransitionSequence > 0 || this.currentSample) this.transitionFlashUntil = receivedAt + 260;
        this.lastTransitionSequence = transitionSequence;
      }
      if (!this.currentSample || state.tick > this.currentSample.tick) {
        this.previousSample = this.currentSample || { tick: state.tick, receivedAt, state };
        this.currentSample = { tick: state.tick, receivedAt, state };
      }
      const authorityPlayer = state.players[snapshot.playerId];
      if (!authorityPlayer) return;
      // A reconnect (or a session handoff) can change playerId while this
      // view remains mounted. Never carry prediction from the previous
      // identity into the new authoritative entity.
      if (this.localPredictedPlayerId !== snapshot.playerId) {
        this.localPredictedPlayerId = snapshot.playerId;
        this.localPredictedPlayer = { ...authorityPlayer };
        return;
      }
      if (!this.localPredictedPlayer) {
        this.localPredictedPlayer = { ...authorityPlayer };
        return;
      }
      const distance = Math.hypot(
        Number(authorityPlayer.x || 0) - Number(this.localPredictedPlayer.x || 0),
        Number(authorityPlayer.y || 0) - Number(this.localPredictedPlayer.y || 0),
      );
      const correction = distance > 90 ? 1 : 0.35;
      this.localPredictedPlayer = {
        ...this.localPredictedPlayer,
        ...authorityPlayer,
        x: this.localPredictedPlayer.x + (authorityPlayer.x - this.localPredictedPlayer.x) * correction,
        y: this.localPredictedPlayer.y + (authorityPlayer.y - this.localPredictedPlayer.y) * correction,
      };
    }

    _onKey(event, pressed) {
      // Escape is owned by the campaign panel handler. Registering a second
      // network toggle here made the same keydown pause and immediately resume
      // because both listeners run on window. Multiplayer uses the campaign
      // game state and pause overlay, so no adapter is required for this key.
      if (event.code === 'Escape') return;
      if (this.active && pressed && !event.repeat && event.code === 'KeyE') {
        event.preventDefault();
        this._interact();
        return;
      }
      if (this.active && pressed && !event.repeat && /^Digit[1-8]$/.test(event.code)) {
        const index = Number(event.code.slice(5)) - 1;
        const player = this.currentSample?.state?.players?.[this.session.snapshot().playerId];
        const itemKey = player?.equipmentSlots?.[index];
        if (itemKey) this.session.sendGameCommand?.('ACTIVATE_EQUIPMENT', { itemKey });
        event.preventDefault();
        return;
      }
      if (!this.active || (!MOVEMENT_KEYS.has(event.code) && !ATTACK_KEYS.has(event.code) && !ABILITY_KEYS.has(event.code))) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      if (ATTACK_KEYS.has(event.code)) {
        if (pressed && !event.repeat) this._attack();
        return;
      }
      if (ABILITY_KEYS.has(event.code)) {
        if (pressed && !event.repeat) this._useSlot(ABILITY_KEYS.get(event.code));
        return;
      }
      if (pressed) this.keys.add(event.code);
      else this.keys.delete(event.code);
    }

    _onPointerDown(event) {
      if (!this.active || this._isInputBlocked() || ![0, 2].includes(event.button) || event.target !== this.canvas) return;
      event.preventDefault();
      this._onPointerMove(event);
      if (event.button === 2) this._useSlot('laser');
      else this._attack();
    }

    _attack() {
      if (!this.active || this._isInputBlocked() || this.session.snapshot().status !== 'running') return;
      try {
        this.session.sendAction('ATTACK', this.aimDirection);
      } catch {
        // Session state changes are surfaced by its normal disconnect handler.
      }
    }

    _useSlot(slot) {
      if (!this.active || this._isInputBlocked() || this.session.snapshot().status !== 'running') return;
      const player = this.localPredictedPlayer;
      const abilityId = player?.equippedMoves?.[slot];
      if (!abilityId) return;
      try {
        if (slot === 'dash') this.session.sendDash(abilityId, this.aimDirection);
        else this.session.sendAbility(abilityId, this.aimDirection);
      } catch {
        return;
      }
    }

    _interact() {
      const state = this.currentSample?.state;
      const player = state?.players?.[this.session.snapshot().playerId];
      if (!player || player.downed || player.pendingUpgrade) return;
      if (this.neo.currentRoom?.type === 'shop') {
        this.neo.toggleShopPanel?.();
        return;
      }
      if (this.neo.currentRoom?.type === 'anvil') {
        this.neo.toggleAnvilPanel?.();
        return;
      }
      if (this.neo.isSpecialRoom?.(this.neo.currentRoom)) {
        this.neo.toggleSpecialRoomPanel?.();
        return;
      }
      const target = Object.values(state.interactables || {})
        .filter(item => !item.opened && item.roomId === player.roomId)
        .map(item => ({ item, distance: Math.hypot(Number(item.x) - Number(player.x), Number(item.y) - Number(player.y)) }))
        .filter(entry => entry.distance <= Number(entry.item.radius || 30) + Number(player.radius || 18) + 38)
        .sort((first, second) => first.distance - second.distance)[0]?.item;
      if (target) this.session.sendInteract(target.id);
    }

    _syncAutomaticChestInteraction(localPlayer, state) {
      const interactables = Object.values(state?.interactables || {});
      const liveIds = new Set(interactables.map(item => item.id));
      this.requestedInteractions.forEach(id => {
        const item = state?.interactables?.[id];
        if (!liveIds.has(id) || item?.activated || item?.opened) this.requestedInteractions.delete(id);
      });
      if (!localPlayer || localPlayer.downed || localPlayer.pendingUpgrade) return;
      const chest = interactables.find(item => item.kind === 'relic_chest'
        && !item.activated && !item.opened
        && item.roomId === localPlayer.roomId
        && Math.hypot(Number(item.x) - Number(localPlayer.x), Number(item.y) - Number(localPlayer.y)) < 36);
      if (!chest || this.requestedInteractions.has(chest.id)) return;
      this.requestedInteractions.add(chest.id);
      try {
        this.session.sendInteract(chest.id);
      } catch {
        this.requestedInteractions.delete(chest.id);
      }
    }

    _selectUpgrade(index) {
      const player = this.currentSample?.state?.players?.[this.session.snapshot().playerId];
      const pending = player?.pendingUpgrade;
      const optionId = pending?.optionIds?.[index];
      if (!optionId) return false;
      this.session.sendUpgrade(pending.selectionEventId, optionId);
      return true;
    }

    _upgradePresentationPickups(state = this.currentSample?.state) {
      const playerId = this.session.snapshot?.().playerId;
      const pending = state?.players?.[playerId]?.pendingUpgrade;
      if (!pending?.options?.length) return [];
      const source = state.interactables?.[pending.sourceEntityId];
      if (!source) return [];
      const count = pending.options.length;
      return pending.options.map((option, index) => ({
        id: `network-choice:${pending.selectionEventId}:${option.id}`,
        type: 'rewardChoice',
        key: option.id,
        label: option.name || option.id,
        itemPresentation: option,
        groupId: pending.selectionEventId,
        optionId: option.id,
        selectionEventId: pending.selectionEventId,
        roomId: source.roomId,
        x: Number(source.x || 0) + (index - (count - 1) / 2) * 144,
        y: Number(source.y || 0) - 4,
        r: 20,
        dwellMode: true,
        dwell: this.upgradeDwell.selectionEventId === pending.selectionEventId
          && this.upgradeDwell.optionId === option.id ? this.upgradeDwell.seconds : 0,
        side: index < count / 2 ? 'left' : 'right',
        picksRemaining: 1,
        networkChoice: true,
      }));
    }

    _updateUpgradeDwell(localPlayer, state, fixedDelta) {
      const choices = this._upgradePresentationPickups(state);
      if (!localPlayer || !choices.length) {
        this.upgradeDwell = { selectionEventId: '', optionId: '', seconds: 0, sent: false };
        return;
      }
      const dwellRadius = Number(this.neo.AB_CHEST_DWELL_RADIUS || 44);
      const dwellTarget = Number(this.neo.AB_CHEST_DWELL_SECONDS || 2.2);
      const inside = choices
        .map(choice => ({ choice, distance: Math.hypot(choice.x - localPlayer.x, choice.y - localPlayer.y) }))
        .filter(entry => entry.distance < dwellRadius)
        .sort((first, second) => first.distance - second.distance)[0]?.choice;
      if (!inside) {
        this.upgradeDwell.seconds = Math.max(0, Number(this.upgradeDwell.seconds || 0) - fixedDelta * 1.5);
        return;
      }
      if (this.upgradeDwell.selectionEventId !== inside.selectionEventId || this.upgradeDwell.optionId !== inside.optionId) {
        this.upgradeDwell = { selectionEventId: inside.selectionEventId, optionId: inside.optionId, seconds: 0, sent: false };
      }
      this.upgradeDwell.seconds = Math.min(dwellTarget, this.upgradeDwell.seconds + fixedDelta);
      if (this.upgradeDwell.seconds < dwellTarget || this.upgradeDwell.sent) return;
      this.upgradeDwell.sent = true;
      try {
        this.session.sendUpgrade(inside.selectionEventId, inside.optionId);
      } catch {
        this.upgradeDwell.sent = false;
      }
    }

    _consumeGameplayEvents(events) {
      const now = root.performance?.now?.() || Date.now();
      const localPlayerId = this.session.snapshot().playerId;
      events.forEach(event => {
        if (!event?.eventId || this.seenGameplayEvents.has(event.eventId)) return;
        this.seenGameplayEvents.add(event.eventId);
        if (this.seenGameplayEvents.size > 512) this.seenGameplayEvents.delete(this.seenGameplayEvents.values().next().value);
        if (!this._isGameplayEventVisible(event)) return;
        if (event.eventType === 'PLAYER_ATTACKED') {
          const weaponKey = event.data?.weaponKey || event.data?.attackKind;
          const sound = weaponKey === 'metao_fire_staff' ? 'fire_burn'
            : weaponKey === 'gelleh_lightning_spear' ? 'lightning_charge'
              : ['princess_wand'].includes(weaponKey) ? 'fire'
                : 'sword_swing';
          this.neo.playSfx?.(sound);
        }
        if (event.eventType === 'PLAYER_ABILITY_USED') {
          this.neo.playSfx?.(deriveAbilityPresentation(event.data).sound || 'lazer_blast');
        }
        if (event.eventType === 'PICKUP_COLLECTED' && event.data?.playerId === localPlayerId && event.data?.itemKey) {
          this.neo.pushItemNotification?.(event.data.itemKey, Math.max(1, Number(event.data.amount || 1)));
          this.neo.playSfx?.('item_collect');
        }
        if (event.eventType === 'UPGRADE_APPLIED' && event.data?.playerId === localPlayerId && event.data?.itemKey) {
          this.neo.pushItemNotification?.(event.data.itemKey, Math.max(1, Number(event.data.amount || 1)));
          this.neo.playSfx?.('item_collect');
        }
        if (event.eventType === 'SHOP_PURCHASED' && event.data?.playerId === localPlayerId) {
          if (event.data?.kind === 'item' && event.data?.key) this.neo.pushItemNotification?.(event.data.key, 1);
          else if (event.data?.kind === 'move' && event.data?.key) this.neo.pushMoveNotification?.(event.data.key, 1);
          else if (event.data?.kind === 'weapon' && event.data?.key) this.neo.pushWeaponNotification?.(event.data.key);
        }
        this._spawnGameplayEventEffect(event);
        if (['PLAYER_ATTACKED', 'PLAYER_ATTACK_FOLLOWUP', 'PLAYER_ABILITY_USED', 'ENEMY_ATTACKED', 'ENEMY_TELEGRAPH', 'ENEMY_HIT', 'ENEMY_DEFEATED', 'PLAYER_HIT', 'PICKUP_COLLECTED', 'ROOM_CLEARED'].includes(event.eventType)) {
          this.combatEffects.push({ ...event, startedAt: now });
        }
      });
      this.combatEffects = this.combatEffects.filter(effect => {
        const moveKey = effect.data?.abilityId;
        const authoredDuration = Number(MOVE_BASE_STATS[moveKey]?.duration || 0);
        return now - effect.startedAt < Math.max(700, authoredDuration * 1000 + 120);
      });
    }

    _isGameplayEventVisible(event) {
      const state = this.currentSample?.state;
      if (!state) return true;
      const localPlayer = state.players?.[this.session.snapshot().playerId];
      if (!localPlayer) return true;
      const data = event.data || {};
      const eventEntity = state.enemies?.[data.enemyId]
        || state.players?.[data.playerId]
        || state.pickups?.[data.pickupId];
      const eventRoomId = data.roomId || eventEntity?.roomId;
      return !eventRoomId || eventRoomId === localPlayer.roomId;
    }

    _spawnGameplayEventEffect(event) {
      const state = this.currentSample?.state;
      const data = event.data || {};
      const entity = state?.enemies?.[data.enemyId] || state?.players?.[data.playerId];
      if (!entity) return;
      if (event.eventType === 'ENEMY_HIT' || event.eventType === 'PLAYER_HIT') {
        const color = event.eventType === 'PLAYER_HIT' ? '#ff6b75'
          : data.attackKind === 'bleed' ? '#ff536d' : '#ffffff';
        this.neo.spawnDamagePopup?.(entity.x, entity.y - Number(entity.radius || 18) - 12, Number(data.damage || 0), { color, size: 18 });
        this.neo.ringBurst?.(entity.x, entity.y, Number(entity.radius || 18) + 5, color, 0.28);
      } else if (event.eventType === 'ENEMY_DEFEATED') {
        this.neo.ringBurst?.(entity.x, entity.y, Number(entity.radius || 20) + 8, '#ff7592', 0.48);
        this.neo.playSfx?.('enemy_hit');
      } else if (event.eventType === 'PICKUP_COLLECTED') {
        this.neo.ringBurst?.(entity.x, entity.y, 9, '#ffd966', 0.34);
        this.neo.playSfx?.('coin');
      } else if (event.eventType === 'PLAYER_ABILITY_USED') {
        const presentation = deriveAbilityPresentation(data);
        const originX = Number.isFinite(Number(data.originX)) ? Number(data.originX) : Number(entity.x);
        const originY = Number.isFinite(Number(data.originY)) ? Number(data.originY) : Number(entity.y);
        const destinationX = Number.isFinite(Number(data.destinationX)) ? Number(data.destinationX) : Number(entity.x);
        const destinationY = Number.isFinite(Number(data.destinationY)) ? Number(data.destinationY) : Number(entity.y);
        const radius = Math.max(1, Number(data.effectRadius || (data.slot === 'smash' ? 140 : 34)));
        const kind = String(data.presentation?.kind || presentation.kind || data.mode || '');
        if (['aoe', 'dash_aoe'].includes(kind) && typeof this.neo.spawnAoeShockwave === 'function') {
          const impactX = kind === 'dash_aoe' ? destinationX : originX;
          const impactY = kind === 'dash_aoe' ? destinationY : originY;
          this.neo.addTrauma?.(0.72, Math.PI / 2, 24);
          this.neo.addHitstop?.(0.05);
          this.neo.spawnAoeShockwave(impactX, impactY, radius, presentation.color, presentation.style);
          this.neo.ringBurst?.(impactX, impactY, Math.max(18, radius - 24), presentation.color, 0.44);
        } else if (['dash', 'warp'].includes(kind)) {
          this.neo.ringBurst?.(originX, originY, 18, presentation.color, 0.35);
          this.neo.ringBurst?.(destinationX, destinationY, 18, presentation.color, 0.35);
        } else {
          this.neo.ringBurst?.(originX, originY, data.slot === 'smash' ? 34 : 18, presentation.color, 0.42);
          if (['status', 'shield', 'support', 'aura', 'summon'].includes(kind)) {
            const moveName = this.neo.MOVE_DEFS?.[data.abilityId]?.name || String(data.abilityId || '').replace(/_/g, ' ');
            this.neo.spawnParticle?.({
              x: originX, y: originY - 24, life: 0.65,
              text: String(moveName).toUpperCase(), c: presentation.color,
            });
          }
        }
      } else if (event.eventType === 'ABILITY_ENTITY_PULSED') {
        const presentation = deriveAbilityPresentation({ presentationKey: data.presentationKey });
        const pulseX = Number(data.x || 0);
        const pulseY = Number(data.y || 0);
        const radius = Math.max(8, Number(data.radius || 32));
        this.neo.ringBurst?.(pulseX, pulseY, Math.max(12, radius * 0.55), presentation.color, 0.32);
        if (['chaos_burst', 'lightning_columns', 'holy_turrets'].includes(data.presentationKey)) {
          this.neo.spawnAoeShockwave?.(pulseX, pulseY, radius, presentation.color, 'light');
        }
      }
    }

    _onPointerMove(event) {
      if (!this.active || !this.localPredictedPlayer || !this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const canvasX = (event.clientX - rect.left) * (this.canvas.width / Math.max(1, rect.width));
      const canvasY = (event.clientY - rect.top) * (this.canvas.height / Math.max(1, rect.height));
      this.aimDirection = this.neo.updatePointerAimWorld?.({
        canvasX,
        canvasY,
        canvas: this.canvas,
        camera: this.camera,
        player: this.localPredictedPlayer,
        splitScreen: false,
      }) ?? this.aimDirection;
    }

    _readMovement() {
      let moveX = 0;
      let moveY = 0;
      this.keys.forEach(code => {
        const direction = MOVEMENT_KEYS.get(code);
        if (direction) {
          moveX += direction[0];
          moveY += direction[1];
        }
      });
      const gamepads = root.navigator?.getGamepads?.();
      const gamepad = gamepads ? Array.from(gamepads).find(Boolean) : null;
      if (gamepad) {
        const axisX = Math.abs(Number(gamepad.axes?.[0]) || 0) > 0.18 ? Number(gamepad.axes[0]) : 0;
        const axisY = Math.abs(Number(gamepad.axes?.[1]) || 0) > 0.18 ? Number(gamepad.axes[1]) : 0;
        if (Math.hypot(axisX, axisY) > Math.hypot(moveX, moveY)) {
          moveX = axisX;
          moveY = axisY;
        }
        const aimX = Math.abs(Number(gamepad.axes?.[2]) || 0) > 0.22 ? Number(gamepad.axes[2]) : 0;
        const aimY = Math.abs(Number(gamepad.axes?.[3]) || 0) > 0.22 ? Number(gamepad.axes[3]) : 0;
        if (aimX || aimY) this.aimDirection = Math.atan2(aimY, aimX);
        const attackPressed = !!gamepad.buttons?.[0]?.pressed;
        if (attackPressed && !this.gamepadAttackPressed) this._attack();
        this.gamepadAttackPressed = attackPressed;
      } else {
        this.gamepadAttackPressed = false;
      }
      const movement = normalizeMovement(moveX, moveY);
      // Network input must use the same camera-relative controls as the normal
      // campaign update loop. Without this, W continued to mean world-up while
      // the first-person camera faced world-right, which felt inverted.
      const firstPersonYaw = this.neo.getFirstPersonYaw?.();
      if (firstPersonYaw == null || (!movement.moveX && !movement.moveY)) return movement;
      const cosine = Math.cos(firstPersonYaw);
      const sine = Math.sin(firstPersonYaw);
      const forward = -movement.moveY;
      const strafe = movement.moveX;
      return {
        moveX: cosine * forward - sine * strafe,
        moveY: sine * forward + cosine * strafe,
      };
    }

    _sendInput() {
      if (!this.active || this.session.snapshot().status !== 'running') return;
      const movement = this._isInputBlocked() || this.localPredictedPlayer?.downed
        ? { moveX: 0, moveY: 0 }
        : this._readMovement();
      // The campaign uses first-person yaw as its canonical aim. Send that same
      // direction to authority instead of the stale top-down pointer angle.
      const firstPersonYaw = this.neo.getFirstPersonYaw?.();
      if (firstPersonYaw != null) this.aimDirection = firstPersonYaw;
      const input = { ...movement, aimDirection: this.aimDirection, buttons: 0 };
      if (this.localPredictedPlayer) {
        this.localPredictedPlayer = predictPosition(
          this.localPredictedPlayer,
          input,
          INPUT_INTERVAL_MS / 1000,
          this.currentSample?.state?.floorState,
        );
      }
      try {
        this.session.sendInput(input);
      } catch {
        // Session state changes are surfaced by its normal disconnect handler.
      }
    }

    _togglePause(visible) {
      this.paused = !!visible && this.active;
      this.keys.clear();
      const title = this.document?.getElementById('pauseTitle');
      if (title) title.textContent = this.paused ? 'MULTIPLAYER' : 'PAUSED';
      this.document?.getElementById('pauseMain')?.classList.toggle('hidden', this.paused);
      this.document?.getElementById('pauseLeaveServer')?.classList.toggle('hidden', !this.paused);
      if (this.paused) this.neo.pauseGame?.();
      else this.neo.resumeGame?.();
    }

    _isInputBlocked() {
      return this.paused
        || (!!this.neo.gameState && this.neo.gameState !== 'play')
        || !!this.neo.isOverlayBlockingInput?.()
        || !!this.neo.uiController?.isDialogueOpen?.();
    }

    _renderedPlayers(now) {
      if (!this.currentSample) return {};
      const currentPlayers = this.currentSample.state.players || {};
      const previousPlayers = this.previousSample?.state?.players || currentPlayers;
      const duration = Math.max(1, this.currentSample.receivedAt - (this.previousSample?.receivedAt || this.currentSample.receivedAt));
      const targetTime = now - INTERPOLATION_DELAY_MS;
      const alpha = clamp((targetTime - (this.previousSample?.receivedAt || targetTime)) / duration, 0, 1);
      const players = interpolatePlayers(previousPlayers, currentPlayers, alpha);
      const localPlayerId = this.session.snapshot().playerId;
      if (localPlayerId && this.localPredictedPlayer) players[localPlayerId] = { ...this.localPredictedPlayer };
      return players;
    }

    _renderedEntities(kind, now) {
      if (!this.currentSample) return {};
      const current = this.currentSample.state[kind] || {};
      const previous = this.previousSample?.state?.[kind] || current;
      const duration = Math.max(1, this.currentSample.receivedAt - (this.previousSample?.receivedAt || this.currentSample.receivedAt));
      const targetTime = now - INTERPOLATION_DELAY_MS;
      const alpha = clamp((targetTime - (this.previousSample?.receivedAt || targetTime)) / duration, 0, 1);
      return interpolatePlayers(previous, current, alpha);
    }

    _visibleCanvasBounds() {
      // Render the same logical 960×640 scene for every peer. CSS may crop the
      // overscan differently at different aspect ratios, but must never change
      // the world transform (or two clients can appear to have different maps).
      return {
        left: 0,
        top: 0,
        right: this.canvas.width,
        bottom: this.canvas.height,
      };
    }

    getPresentationPlayerSlots() {
      return this.presentationPlayerSlots;
    }

    _clearPresentationEntityCaches() {
      this.presentationEnemyActors.clear();
      this.presentationProjectiles.clear();
      this.presentationPickups.clear();
      this.presentationHazards.clear();
      this.presentationBodies.clear();
      this.presentationInteractables.clear();
    }

    _stablePresentationEntities(cache, sources, adapt = source => source) {
      const liveIds = new Set(sources.map(source => String(source.id)));
      cache.forEach((entity, id) => {
        if (!liveIds.has(id)) cache.delete(id);
      });
      return sources.map(source => {
        const id = String(source.id);
        const entity = cache.get(id) || {};
        Object.assign(entity, adapt(source));
        cache.set(id, entity);
        return entity;
      });
    }

    _syncCampaignPresentationEntities(players, projectiles, localPlayerId, state) {
      const serverTick = Number(state?.tick || 0);
      const now = root.performance?.now?.() || Date.now();
      const livePlayerIds = new Set(Object.keys(players || {}));
      this.presentationPlayerActors.forEach((actor, playerId) => {
        if (!livePlayerIds.has(playerId)) this.presentationPlayerActors.delete(playerId);
      });
      this.presentationPlayerSlots = Object.values(players || {}).map(player => {
        const authoritativeActionEvent = this.combatEffects.some(effect => (
          effect.data?.playerId === player.id
          && ['PLAYER_ATTACKED', 'PLAYER_ATTACK_FOLLOWUP', 'PLAYER_ABILITY_USED'].includes(effect.eventType)
          && now - Number(effect.startedAt || 0) <= 220
        ));
        const attacking = authoritativeActionEvent
          || (player.action !== 'idle' && serverTick - Number(player.actionTick || 0) <= 4);
        const activeSeconds = Number(this.neo.ATTACKS?.melee?.active || 0.17);
        const elapsed = Math.max(0, serverTick - Number(player.actionTick || 0)) / 20;
        const actor = this.presentationPlayerActors.get(player.id) || {};
        Object.assign(actor, {
          ...player,
          character: player.characterKey || 'thorn_knight',
          r: Number(player.radius || 18),
          hp: Number(player.hp || 0),
          maxHp: Number(player.maxHp || 100),
          coins: Number(player.coins || 0),
          items: { ...(player.items || {}) },
          equipmentSlots: Array.isArray(player.equipmentSlots) ? [...player.equipmentSlots] : [],
          level: Math.max(1, Number(player.level || 1)),
          xp: Math.max(0, Number(player.xp || 0)),
          xpToNext: Math.max(1, Number(player.xpToNext || 20)),
          weaponCooldown: Math.max(0, Number(player.attackCooldownUntilTick || 0) - serverTick) / 20,
          inv: serverTick < Number(player.invulnerableUntilTick || 0) ? 1 : 0,
          swing: attacking ? Math.max(0.001, activeSeconds - elapsed) : 0,
          swingA: Number(player.aimDirection || 0),
          swingFacing: Math.cos(Number(player.aimDirection || 0)) < 0 ? -1 : 1,
          overhealBarrier: Number(player.barrier || 0),
          overhealBarrierMax: Math.max(Number(player.barrier || 0), Number(player.maxHp || 100) * 0.4),
        });
        this.presentationPlayerActors.set(player.id, actor);
        return {
          id: player.id,
          label: `${player.displayName || player.id}${player.id === localPlayerId ? ' (YOU)' : ''}`,
          color: player.color || derivePlayerColor(player),
          getEntity: () => actor,
          getCharacter: () => player.characterKey || 'thorn_knight',
          getDead: () => !!player.downed,
        };
      });
      const localSlot = this.presentationPlayerSlots.find(slot => slot.id === localPlayerId);
      this.neo.presentationPlayerSlots = this.presentationPlayerSlots;
      if (localSlot) {
        this.neo.player = localSlot.getEntity();
        this._syncCampaignHudState(this.neo.player, state);
      }
      this.neo.activePlayerEffects = this._projectActivePlayerEffects(now);
      this.neo.projectiles = this._stablePresentationEntities(
        this.presentationProjectiles,
        Object.values(projectiles || {}),
        projectile => ({
          ...projectile,
          r: Number(projectile.radius || 7),
          enemy: !!projectile.hostile,
          life: Math.max(0, Number(projectile.expiresTick || 0) - serverTick) / 20,
        }),
      );
      this._syncSpecialMovePresentation(now);
    }

    _projectActivePlayerEffects(now = root.performance?.now?.() || Date.now()) {
      const slotsById = new Map(this.presentationPlayerSlots.map(slot => [slot.id, slot]));
      return this.combatEffects.flatMap(effect => {
        const data = effect.data || {};
        if (effect.eventType !== 'PLAYER_ABILITY_USED' || !CONTINUOUS_BEAM_MOVES.has(data.abilityId)) return [];
        const duration = Math.max(0.05, Number(MOVE_BASE_STATS[data.abilityId]?.duration || 0.52));
        const ageSeconds = Math.max(0, now - Number(effect.startedAt || now)) / 1000;
        const slot = slotsById.get(data.playerId);
        if (!slot || slot.getDead?.() || ageSeconds >= duration) return [];
        const mode = data.abilityId === 'turtle_wave' ? 'turtle_wave'
          : data.abilityId === 'holy_eye_beams' ? 'holy_eye_beams'
            : data.abilityId === 'thorn_blood_beams' ? 'thorn_blood_beams'
              : data.abilityId === 'god_sweep' ? 'god_sweep'
                : 'beam';
        const sweepSpeed = Number(data.sweepDirection || 1) * 4.6;
        return [{
          player: slot.getEntity(),
          abilityId: data.abilityId,
          equippedLaser: data.abilityId,
          laserActive: true,
          laserTime: duration - ageSeconds,
          laserTick: 0,
          laserMode: mode,
          laserAngle: Number(data.aimDirection || 0)
            + (data.abilityId === 'god_sweep' ? sweepSpeed * ageSeconds : 0),
          laserSweepSpeed: sweepSpeed,
          loveBeamCasting: data.abilityId === 'love_beam',
          activeBeamPaths: null,
        }];
      });
    }

    _syncSpecialMovePresentation(now = root.performance?.now?.() || Date.now()) {
      const slotsById = new Map(this.presentationPlayerSlots.map(slot => [slot.id, slot]));
      const abilityEffects = this.combatEffects.filter(effect => effect.eventType === 'PLAYER_ABILITY_USED');
      this.neo.justiceBlades = [];
      this.neo.titanHammer = null;
      this.neo.skySwords = [];

      abilityEffects.forEach(effect => {
        const data = effect.data || {};
        const actor = slotsById.get(data.playerId)?.getEntity?.();
        if (!actor) return;
        const age = Math.max(0, now - Number(effect.startedAt || now)) / 1000;
        const aim = Number(data.aimDirection || actor.aimDirection || 0);
        if (data.abilityId === 'blade_justice' && age < 2.1) {
          for (let index = 0; index < 3; index += 1) {
            const fanOffset = (index - 1) * 0.5;
            const swingPhase = age * 7.5 + index * 0.7;
            const direction = aim + fanOffset + Math.sin(swingPhase) * 0.7;
            const orbit = 120 * (0.82 + 0.18 * Math.cos(swingPhase));
            this.neo.justiceBlades.push({
              id: `${effect.eventId || 'blade'}:${index}`,
              ownerId: actor.id,
              x: actor.x + Math.cos(direction) * orbit,
              y: actor.y + Math.sin(direction) * orbit,
              angle: direction + Math.sign(Math.cos(swingPhase)) * 0.5,
              radius: 16,
              life: 2.1 - age,
              maxLife: 2.1,
            });
          }
        } else if (data.abilityId === 'titan_hammer' && age < 8) {
          this.neo.titanHammer = {
            id: effect.eventId || 'titan-hammer',
            ownerId: actor.id,
            x: actor.x + Math.cos(aim) * 120,
            y: actor.y + Math.sin(aim) * 120,
            angle: aim,
            life: 8 - age,
            radius: Math.max(70, Number(data.effectRadius || 120) * 0.75),
            swinging: age < 0.24 ? Math.max(0, 1 - age / 0.24) : 0,
            swingCooldown: 0,
            swingsLeft: 0,
          };
        } else if (data.abilityId === 'excalibur_strike' && age < 1.34) {
          const centerX = Number.isFinite(Number(data.originX)) ? Number(data.originX) : Number(actor.x);
          const centerY = Number.isFinite(Number(data.originY)) ? Number(data.originY) : Number(actor.y);
          const seed = stableNumericId(effect.eventId || `${data.playerId}:${effect.tick || 0}`);
          for (let index = 0; index < 5; index += 1) {
            const delay = index * 0.07;
            const localAge = age - delay;
            if (localAge >= 1.34) continue;
            const offsetAngle = ((seed + index * 2654435761) % 6283) / 1000;
            const offsetDistance = index === 0 ? 0 : 28 + ((seed >>> (index * 3)) % 92);
            const spin = ((seed >>> index) & 1 ? -1 : 1) * (5 + ((seed + index) % 30) / 10);
            const falling = localAge < 0.34;
            const hovering = localAge >= 0.34 && localAge < 1.04;
            this.neo.skySwords.push({
              id: `${effect.eventId || 'excalibur'}:${index}`,
              x: centerX + Math.cos(offsetAngle) * offsetDistance,
              y: centerY + Math.sin(offsetAngle) * offsetDistance,
              radius: 76,
              delay: Math.max(0, -localAge),
              phase: falling ? 'falling' : hovering ? 'hover' : 'fade',
              fall: falling ? Math.max(0, 0.34 - Math.max(0, localAge)) : 0,
              hoverTime: hovering ? 1.04 - localAge : 0,
              fadeT: hovering || falling ? 0.3 : Math.max(0, 1.34 - localAge),
              angle: offsetAngle + spin * Math.max(0, localAge - 0.34),
              spin,
            });
          }
        }
      });
      this.neo.ghostBalls = this.neo.projectiles.filter(projectile => projectile.kind === 'ghost_ball');
      this.neo.projectiles = this.neo.projectiles.filter(projectile => projectile.kind !== 'ghost_ball');
    }

    _syncCampaignHudState(localPlayer, state) {
      const serverTick = Number(state?.tick || 0);
      const equippedMoves = localPlayer.equippedMoves || {};
      this.neo.cooldowns = this.neo.cooldowns || {};
      ['melee', 'laser', 'smash', 'dash'].forEach(slot => {
        const moveKey = equippedMoves[slot];
        const current = slot === 'melee'
          ? Math.max(0, Number(localPlayer.attackCooldownUntilTick || 0) - serverTick) / 20
          : Math.max(0, Number(localPlayer.moveCooldownUntilTick?.[moveKey] || 0) - serverTick) / 20;
        this.neo.cooldowns[slot] = {
          charges: current > 0 ? 0 : 1,
          maxCharges: 1,
          timers: current > 0 ? [current] : [],
          holding: 0,
        };
      });
      localPlayer.dashTime = localPlayer.action === 'dash' && serverTick - Number(localPlayer.actionTick || 0) <= 4 ? 0.2 : 0;
      localPlayer.cowardsWayTime = Math.max(0, Number(localPlayer.statusUntilTick?.cowards_way || 0) - serverTick) / 20;
      localPlayer.princessFlightTime = Math.max(0, Number(localPlayer.statusUntilTick?.flying_unhitable || 0) - serverTick) / 20;
      const now = root.performance?.now?.() || Date.now();
      const beam = [...this.combatEffects].reverse().find(effect => {
        if (effect.eventType !== 'PLAYER_ABILITY_USED' || effect.data?.playerId !== localPlayer.id) return false;
        if (!CONTINUOUS_BEAM_MOVES.has(effect.data?.abilityId)) return false;
        const duration = Math.max(0.05, Number(MOVE_BASE_STATS[effect.data.abilityId]?.duration || 0.52));
        return now - Number(effect.startedAt || 0) < duration * 1000;
      });
      const beamAge = beam ? Math.max(0, now - Number(beam.startedAt || now)) / 1000 : 0;
      const beamDuration = beam ? Math.max(0.05, Number(MOVE_BASE_STATS[beam.data?.abilityId]?.duration || 0.52)) : 0;
      this.neo.laserActive = !!beam;
      this.neo.laserTime = Math.max(0, beamDuration - beamAge);
      this.neo.laserTick = 0;
      this.neo.laserMode = beam?.data?.abilityId === 'turtle_wave' ? 'turtle_wave'
        : beam?.data?.abilityId === 'holy_eye_beams' ? 'holy_eye_beams'
          : beam?.data?.abilityId === 'thorn_blood_beams' ? 'thorn_blood_beams'
            : beam?.data?.abilityId === 'god_sweep' ? 'god_sweep'
              : 'beam';
      this.neo.loveBeamCasting = beam?.data?.abilityId === 'love_beam';
      this.neo.laserAngle = Number(beam?.data?.aimDirection || localPlayer.aimDirection || 0);
      this.neo.activeBeamPaths = null;
    }

    // This is intentionally a state projection, not a renderer. It gives the
    // existing browser game (`Neo.draw`) the same live objects it normally
    // reads in single player; networked mode changes only where those objects
    // came from.
    syncPresentation() {
      if (!this.active || !this.ctx || !this.canvas) return;
      const now = root.performance?.now?.() || Date.now();
      const state = this.currentSample?.state;
      const authorityFloorState = state?.floorState || CAMPAIGN_ROOM_GEOMETRY;
      const visibleBounds = this._visibleCanvasBounds();
      const players = this._renderedPlayers(now);
      const localPlayerId = this.session.snapshot().playerId;
      const localRoomId = players[localPlayerId]?.roomId || authorityFloorState.currentRoomId;
      const floorState = { ...authorityFloorState, currentRoomId: localRoomId };
      const visiblePlayers = Object.fromEntries(Object.entries(players).filter(([, player]) => player.roomId === localRoomId));
      const enemies = this._renderedEntities('enemies', now);
      const projectiles = this._renderedEntities('projectiles', now);
      const pickups = state?.pickups || {};
      const localPlayer = players[localPlayerId];
      const frameDelta = this.lastPresentationFrameAt > 0
        ? clamp((now - this.lastPresentationFrameAt) / 1000, 0, 0.05)
        : 1 / 60;
      this.lastPresentationFrameAt = now;
      this._updateCamera(localPlayer, frameDelta);
      // Neo.draw reads Neo.camera in every local presentation mode. Keep that
      // canonical camera object synchronized with the network state adapter;
      // otherwise the adapter aimed/tracked with one camera while the normal
      // renderer displayed another, making the same 900x700 room look larger.
      this.neo.camera = this.neo.camera || { x: 0, y: 0 };
      this.neo.camera.x = this.camera.x;
      this.neo.camera.y = this.camera.y;
      const transform = computeCameraTransform(this.canvas.width, this.canvas.height, this.camera, visibleBounds);
      this.lastWorldTransform = transform;
      this.lastRenderedPlayerCount = Object.keys(visiblePlayers).length;
      this.lastRenderedEnemyCount = Object.keys(enemies).length;
      this.lastRenderedProjectileCount = Object.keys(projectiles).length;
      this.lastRenderedPickupCount = Object.keys(pickups).length;
      const ctx = this.ctx;

      this._updateUpgradeDwell(localPlayer, state, frameDelta);
      this._syncAutomaticChestInteraction(localPlayer, state);
      this._syncNeoPresentationFloor(floorState, enemies, pickups, state);
      this._syncCampaignPresentationEntities(visiblePlayers, projectiles, localPlayerId, state);
      this.neo.gameElapsedTime = Number(state?.elapsedSeconds || 0);
      const floorTransitionAge = this.floorTransitionStartedAt > 0
        ? Math.max(0, now - this.floorTransitionStartedAt) / 1000
        : Number.POSITIVE_INFINITY;
      this.neo.showFloorTransition = floorTransitionAge <= 1.25;
      this.neo.floorTransitionTime = floorTransitionAge;
      this.neo.lavaAnimTime = Number(this.neo.lavaAnimTime || 0) + frameDelta;
      this.neo.updateParticles?.(frameDelta);
      this._updateHud(state, players);
      return true;
    }

    // Compatibility alias for callers that previously treated this adapter as
    // a renderer. It now only synchronizes state; Neo.draw owns presentation.
    render() {
      return this.syncPresentation();
    }

    _updateCamera(player, fixedDelta) {
      if (!player) return;
      const changedRoom = this.camera.roomId !== player.roomId;
      const targetX = Number(player.x || 0) - this.canvas.width / 2 + Number(player.vx || 0) * 0.08;
      const targetY = Number(player.y || 0) - this.canvas.height / 2 + Number(player.vy || 0) * 0.08;
      if (changedRoom || !Number.isFinite(this.camera.x) || !Number.isFinite(this.camera.y)) {
        this.camera.x = targetX;
        this.camera.y = targetY;
        this.camera.roomId = player.roomId || null;
        return;
      }
      const smoothing = clamp(8 * fixedDelta, 0, 1);
      this.camera.x += (targetX - this.camera.x) * smoothing;
      this.camera.y += (targetY - this.camera.y) * smoothing;
    }

    _syncNeoPresentationFloor(floorState, enemies, pickups, state) {
      const layoutRooms = floorState.layout?.rooms || [];
      const visited = new Set(floorState.visitedRoomIds || []);
      const rooms = layoutRooms.map(source => {
        let room = this.presentationRooms.get(source.id);
        if (!room) {
          room = { id: source.id, enemies: [], projectiles: [], pickups: [], chests: [], decorations: [], structures: [], destructibles: [], hazards: [] };
          this.presentationRooms.set(source.id, room);
        }
        Object.assign(room, source, {
          explored: visited.has(source.id),
          cleared: floorState.encounters?.[source.id]?.status === 'cleared'
            || floorState.rewards?.[source.id]?.status === 'claimed',
        });
        return room;
      });
      const activeIds = new Set(layoutRooms.map(room => room.id));
      Array.from(this.presentationRooms.keys()).forEach(id => {
        if (!activeIds.has(id)) this.presentationRooms.delete(id);
      });
      this.neo.rooms = rooms;
      this.neo.currentRoom = rooms.find(room => room.id === floorState.currentRoomId) || rooms[0] || null;
      this.neo.floor = Math.max(1, Number(floorState.layout?.floorNumber || 1));
      this.neo.floorsEntered = this.neo.floor;
      this.neo.shopOffers = this.neo.currentRoom?.shopOffers || [];
      if (this.neo.currentRoom?.type !== 'shop' && this.neo.isPanelOpen?.(this.neo.ui?.shopPanel)) {
        this.neo.setShopPanelOpen?.(false, { animateClose: false });
      } else if (this.neo.currentRoom?.type === 'shop' && this.neo.isPanelOpen?.(this.neo.ui?.shopPanel)) {
        this.neo.markShopPanelDirty?.();
        this.neo.renderShopPanel?.();
      }
      const liveEnemies = Object.values(enemies || {})
        .filter(enemy => !enemy.dead && enemy.roomId === floorState.currentRoomId);
      this.neo.enemies = this._stablePresentationEntities(
        this.presentationEnemyActors,
        liveEnemies,
        enemy => {
          const adapted = {
            ...enemy,
            r: Number(enemy.radius || 20),
            hp: Number(enemy.health || 0),
            max: Math.max(1, Number(enemy.maxHealth || 1)),
            speed: Number(enemy.moveSpeed || 0),
            spawnT: Math.max(0, 0.72 - (Number(state?.tick || 0) - Number(enemy.spawnTick || 0)) / 20),
            stun: Math.max(0, Number(enemy.stunnedUntilTick || enemy.frozenUntilTick || 0) - Number(state?.tick || 0)) / 20,
            statuses: {
              bleed: { stacks: Math.max(0, Math.round(Number(enemy.bleedDamage || 0) / 4)), duration: Math.max(0, Number(enemy.bleedTicksRemaining || 0)) * 0.5, tick: 0 },
              fire: { stacks: Math.max(0, Number(enemy.fireStacks || 0)), duration: Math.max(0, Number(enemy.fireTicksRemaining || 0)) * 0.45, tick: 0 },
              poison: { stacks: Math.max(0, Number(enemy.poisonStacks || 0)), duration: Math.max(0, Number(enemy.poisonTicksRemaining || 0)) * 0.5, tick: 0 },
              dark_drain: { stacks: 0, duration: 0, tick: 0 },
              slow: { stacks: Number(enemy.frozenUntilTick || 0) > Number(state?.tick || 0) ? 4 : 0, duration: Math.max(0, Number(enemy.frozenUntilTick || 0) - Number(state?.tick || 0)) / 20, tick: 0 },
              static: { stacks: 0, duration: 0, tick: 0 },
            },
            swingTime: enemy.state === 'attacking' ? 0.2 : 0,
            windup: enemy.state === 'aiming' ? 0.35 : 0,
            beamAngle: Number(enemy.aimDirection || enemy.beamAngle || 0),
          };
          this.neo.ensureStatuses?.(adapted);
          return adapted;
        },
      );
      this.neo.deadBodies = this._stablePresentationEntities(
        this.presentationBodies,
        Object.values(enemies || {}).filter(enemy => enemy.dead && enemy.roomId === floorState.currentRoomId),
        enemy => ({
          id: stableNumericId(enemy.id),
          x: Number(enemy.x || 0),
          y: Number(enemy.y || 0),
          r: Number(enemy.radius || 20),
          size: Math.max(30, Number(enemy.radius || 20) * 2.4),
          type: enemy.type || 'hunter',
          spriteKey: this.neo.getEnemySpriteKey?.(enemy) || enemy.type || 'hunter',
          face: Number(enemy.vx || 0) < 0 ? -1 : 1,
          age: Math.max(0, Number(state?.tick || 0) - Number(enemy.deathTick || state?.tick || 0)) / 20,
          life: Number(this.neo.CORPSE_LIFETIME || 11),
          fadeStart: Number(this.neo.CORPSE_FADE_START || 8),
          fallTime: Number(this.neo.CORPSE_FALL_TIME || 0.45),
          leavesBloodPool: true,
        }),
      );
      const roomInteractables = Object.values(state?.interactables || {});
      const presentationChests = this._stablePresentationEntities(
        this.presentationInteractables,
        roomInteractables.filter(interactable => interactable.kind === 'relic_chest'),
        interactable => ({
          id: interactable.id,
          roomId: interactable.roomId,
          x: Number(interactable.x || 0),
          y: Number(interactable.y || 0),
          open: !!interactable.opened || !!interactable.activated,
          choiceType: interactable.choiceType || '',
          rewardType: interactable.rewardType || 'item',
          rewardKey: interactable.rewardKey || '',
        }),
      );
      rooms.forEach(room => {
        room.chests = presentationChests.filter(chest => chest.roomId === room.id);
      });
      this.neo.chests = this.neo.currentRoom?.chests || [];
      const presentationPickupSources = [
        ...Object.values(pickups || {}).filter(pickup => pickup.roomId === floorState.currentRoomId),
        ...roomInteractables
          .filter(interactable => interactable.kind === 'stairs' && interactable.roomId === floorState.currentRoomId)
          .map(interactable => ({
            ...interactable,
            type: 'ladder',
            networkExit: true,
          })),
        ...this._upgradePresentationPickups(state).filter(choice => choice.roomId === floorState.currentRoomId),
      ];
      this.neo.pickups = this._stablePresentationEntities(
        this.presentationPickups,
        presentationPickupSources,
        pickup => ({
          ...pickup,
          value: Number(pickup.amount || pickup.value || 1),
          r: Number(pickup.radius || pickup.r || 13),
        }),
      );
      const authoritativeAbilityHazards = this._stablePresentationEntities(
        this.presentationHazards,
        Object.values(state?.abilityEntities || {}).filter(entity => entity.roomId === floorState.currentRoomId),
        entity => ({ ...entity, r: Number(entity.radius || entity.r || 32), ttl: Math.max(0, Number(entity.expiresTick || 0) - Number(state?.tick || 0)) / 20 }),
      );
      this.neo.hazards = [...(this.neo.currentRoom?.hazards || []), ...authoritativeAbilityHazards];
      this.neo.decorations = this.neo.currentRoom?.decorations || [];
      this.neo.structures = this.neo.currentRoom?.structures || [];
      this.neo.destructibles = this.neo.currentRoom?.destructibles || [];
      this.neo.environmentBackgroundCache = this.neo.environmentBackgroundCache || { key: '', canvas: null };
    }

    _updateHud(state, players) {
      // The old network status panel was a second, competing HUD. Multiplayer
      // uses the campaign HUD exclusively, just as a local run does.
      const multiplayerHud = this.document?.getElementById('multiplayerGameHud');
      multiplayerHud?.classList.add('hidden');
      if (multiplayerHud) {
        multiplayerHud.style.display = 'none';
        multiplayerHud.setAttribute('aria-hidden', 'true');
      }
      const localPlayer = players[this.session.snapshot().playerId];
      if (!localPlayer || !state) return;
      this._setCampaignHudVisible(true);
      this.neo.updateHud?.();
    }

  }

  // The historical name remains available while callers migrate. This adapter
  // has no independent world renderer: it projects authority state into the
  // campaign renderer and is equally valid for any remote authority.
  const CampaignPresentationAdapter = NetworkGameView;

  return {
    INPUT_INTERVAL_MS,
    INTERPOLATION_DELAY_MS,
    normalizeMovement,
    computeWorldTransform,
    computeCameraTransform,
    interpolatePlayers,
    predictPosition,
    PLAYER_COLORS,
    derivePlayerColor,
    deriveEnemyProjectileColor,
    deriveProjectileColor,
    ABILITY_PRESENTATIONS,
    deriveAbilityPresentation,
    NetworkGameView,
    CampaignPresentationAdapter,
  };
});
