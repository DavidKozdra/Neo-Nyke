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
  const movementRules = typeof require === 'function'
    ? require('../simulation/CampaignMovementRules.js')
    : (root.NeoNyke?.simulation || {});
  const runServices = typeof require === 'function'
    ? require('../simulation/SharedRunServiceSystem.js')
    : (root.NeoNyke?.simulation || {});
  const combatSystem = typeof require === 'function'
    ? require('../simulation/NetworkCombatSystem.js')
    : (root.NeoNyke?.simulation || {});
  const CAMPAIGN_ROOM_GEOMETRY = worldContent.CAMPAIGN_ROOM_GEOMETRY;

  const INPUT_INTERVAL_MS = 50;
  const INPUT_AIM_SEND_INTERVAL_MS = 100;
  const INPUT_HEARTBEAT_MS = 250;
  const INPUT_VECTOR_EPSILON = 0.01;
  const INPUT_AIM_EPSILON = 0.02;
  const INTERPOLATION_DELAY_MS = 100;
  const CAMPAIGN_HUD_LAYER_IDS = Object.freeze([
    'hud', 'hudLower', 'actionBar', 'equipmentSlots', 'playerStats',
    'coinDisplay', 'centerDisplay', 'objectiveTracker', 'entityDialogueLayer',
    'interactPrompt', 'endlessHud', 'bossRushHud', 'practicePanel',
  ]);
  const NETWORK_HUD_DISPLAY_VALUES = Object.freeze({
    hud: 'flex',
    coinDisplay: 'flex',
    centerDisplay: '',
    actionBar: '',
  });
  const ATTACK_KEYS = new Set(['Space', 'KeyJ']);
  // Matches the touch deadzone the single-player loop uses in js/core/update.js.
  const TOUCH_DEADZONE = 0.08;
  // Matches the default duration triggerArmRecoil() uses in js/game/combat.js.
  const ARM_RECOIL_DURATION = 0.16;
  // The authority simulates player.vx/vy but the protocol never sends them, so
  // networked actors arrive with no velocity at all. Every movement animation in
  // drawActorSprite (footfall bob, squash, lean, shadow, idle breathe) is gated
  // on hypot(vx, vy), so without this heroes slide along in an idle pose. Derive
  // velocity from the interpolated position delta instead of widening the packet
  // -- positions are already on the wire, so sending velocity too is redundant.
  // Smoothed because a single frame's delta is noisy enough to make the step
  // cycle stutter; the rate is a half-life in Hz, framerate-independent.
  const NETWORK_VELOCITY_SMOOTH_HZ = 18;
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

  function angularDistance(first, second) {
    return Math.abs(Math.atan2(Math.sin(Number(first || 0) - Number(second || 0)), Math.cos(Number(first || 0) - Number(second || 0))));
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
  const CONTINUOUS_BEAM_MOVES = new Set(moveContent.CONTINUOUS_BEAM_MOVES || [
    'blood_beam', 'love_beam', 'turtle_wave', 'holy_eye_beams', 'god_sweep',
    'mooggy_blood_beam', 'thorn_blood_beams', 'wizard_lazer',
  ]);
  const BUTTON_LASER_HELD = 1;

  function beamChannelLaserMode(moveKey) {
    return moveKey === 'turtle_wave' || moveKey === 'holy_eye_beams'
      || moveKey === 'thorn_blood_beams' || moveKey === 'god_sweep'
      ? moveKey
      : 'beam';
  }
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
    if (movementRules.resolveCampaignMovementInput) {
      return movementRules.resolveCampaignMovementInput(moveX, moveY);
    }
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

  function lerpAngle(from, to, amount) {
    let delta = (Number(to) || 0) - (Number(from) || 0);
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return (Number(from) || 0) + delta * amount;
  }

  function interpolatePlayers(previous = {}, current = {}, alpha = 1) {
    const amount = clamp(Number(alpha) || 0, 0, 1);
    return Object.fromEntries(Object.entries(current).map(([playerId, player]) => {
      const before = previous[playerId] || player;
      const changedRoom = before.roomId && player.roomId && before.roomId !== player.roomId;
      // A channelled beam's authoritative angle only steps at snapshot rate;
      // lerp it between samples so remote beams sweep as smoothly as local ones.
      const beamChannel = player.beamChannel && before.beamChannel
        && player.beamChannel.startTick === before.beamChannel.startTick
        ? { ...player.beamChannel, angle: lerpAngle(before.beamChannel.angle, player.beamChannel.angle, amount) }
        : player.beamChannel;
      return [playerId, {
        ...player,
        beamChannel,
        x: changedRoom ? Number(player.x || 0) : Number(before.x || 0) + (Number(player.x || 0) - Number(before.x || 0)) * amount,
        y: changedRoom ? Number(player.y || 0) : Number(before.y || 0) + (Number(player.y || 0) - Number(before.y || 0)) * amount,
      }];
    }));
  }

  function predictPosition(player, input, fixedDelta, floorState = {}, currentTick = floorState.tick) {
    const movement = normalizeMovement(input.moveX, input.moveY);
    const speed = movementRules.getCampaignPlayerMovementSpeed?.(player, currentTick)
      ?? Math.max(0, Number(player.moveSpeed) || 228);
    const radius = Math.max(1, Number(player.radius) || 18);
    const wall = Math.max(0, Number(floorState.wallThickness) || 28);
    const width = Math.max(1, Number(floorState.width) || 900);
    const height = Math.max(1, Number(floorState.height) || 700);
    const minimum = wall + radius;
    // A dashing hero glides at its locked dash velocity and ignores input,
    // matching the authority's movement resolution so prediction doesn't fight
    // the dash and snap the hero back mid-glide.
    const dashing = movementRules.isCampaignPlayerDashing?.(player, currentTick);
    const vx = dashing
      ? Number(player.dashVx || 0)
      : (movementRules.applyResponsiveVelocity?.(player.vx, movement.moveX * speed, fixedDelta) ?? movement.moveX * speed);
    const vy = dashing
      ? Number(player.dashVy || 0)
      : (movementRules.applyResponsiveVelocity?.(player.vy, movement.moveY * speed, fixedDelta) ?? movement.moveY * speed);
    const desiredX = clamp(Number(player.x || 0) + vx * fixedDelta, minimum, width - minimum);
    const desiredY = clamp(Number(player.y || 0) + vy * fixedDelta, minimum, height - minimum);
    const room = floorState.layout?.rooms?.find(candidate => candidate.id === player.roomId);
    const collision = roomInterior.resolveRoomObstacleMovement?.(room, player, desiredX, desiredY)
      || { x: desiredX, y: desiredY, blockedX: false, blockedY: false };
    return {
      ...player,
      x: collision.x,
      y: collision.y,
      vx: collision.blockedX ? 0 : vx,
      vy: collision.blockedY ? 0 : vy,
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
      this.laserHeld = false;
      this.localBeamAngle = null;
      this.localBeamChannelStart = -1;
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
      this.lastTransmittedInput = null;
      this.lastInputSentAt = 0;
      this.spectatorPlayerId = null;
      this.localWasDowned = false;
      this.spectatorRenderSignature = '';
      this.chatRenderSignature = '';
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
      this.boundPointerUp = event => this._onPointerUp(event);
      this.boundChatSubmit = event => {
        event.preventDefault();
        this._submitChat();
      };
      this.boundChatClose = event => {
        event.preventDefault();
        this._closeChat();
      };
      this.boundSpectatorSelect = event => {
        const button = event.target?.closest?.('[data-spectator-player-id]');
        if (!button) return;
        this.spectatorPlayerId = button.dataset.spectatorPlayerId || null;
        this._renderSpectatorControls(this.currentSample?.state, this.session.snapshot().playerId, true);
      };
      this.boundContextMenu = event => {
        if (this.active && event.target === this.canvas) event.preventDefault();
      };
      this.boundBlur = () => {
        this.keys.clear();
        this.laserHeld = false;
      };
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
      this.lastTransmittedInput = null;
      this.lastInputSentAt = 0;
      // Use the campaign's real presentation/UI state. The main update loop
      // explicitly skips local simulation while this adapter is active, so this
      // enables canonical mouse-look, panels, pause and settings without running
      // a second authority in the browser.
      this.neo.setGameState?.('play');
      this.document?.getElementById('start')?.classList.add('hidden');
      this._setCampaignHudVisible(true);
      root.document?.body?.classList.add('network-multiplayer-active');
      root.addEventListener?.('keydown', this.boundKeyDown);
      root.addEventListener?.('keyup', this.boundKeyUp);
      root.addEventListener?.('pointermove', this.boundPointerMove);
      root.addEventListener?.('pointerdown', this.boundPointerDown);
      root.addEventListener?.('pointerup', this.boundPointerUp);
      root.addEventListener?.('contextmenu', this.boundContextMenu);
      root.addEventListener?.('blur', this.boundBlur);
      this.pointerWasLocked = this.document?.pointerLockElement === this.canvas;
      this.document?.addEventListener?.('pointerlockchange', this.boundPointerLockChange);
      this.document?.getElementById('pauseResume')?.addEventListener('click', this.boundPauseResume, true);
      this.document?.getElementById('pauseSettings')?.addEventListener('click', this.boundPauseSettings, true);
      this.document?.getElementById('multiplayerChat')?.classList.remove('hidden');
      this.document?.getElementById('multiplayerChatForm')?.addEventListener('submit', this.boundChatSubmit);
      this.document?.getElementById('multiplayerChatClose')?.addEventListener('click', this.boundChatClose);
      this.document?.getElementById('multiplayerSpectatorPlayers')?.addEventListener('click', this.boundSpectatorSelect);
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
      root.removeEventListener?.('pointerup', this.boundPointerUp);
      root.removeEventListener?.('contextmenu', this.boundContextMenu);
      root.removeEventListener?.('blur', this.boundBlur);
      this.document?.removeEventListener?.('pointerlockchange', this.boundPointerLockChange);
      this.document?.getElementById('pauseResume')?.removeEventListener('click', this.boundPauseResume, true);
      this.document?.getElementById('pauseSettings')?.removeEventListener('click', this.boundPauseSettings, true);
      this.document?.getElementById('multiplayerChatForm')?.removeEventListener('submit', this.boundChatSubmit);
      this.document?.getElementById('multiplayerChatClose')?.removeEventListener('click', this.boundChatClose);
      this.document?.getElementById('multiplayerSpectatorPlayers')?.removeEventListener('click', this.boundSpectatorSelect);
      this._closeChat();
      this.document?.getElementById('multiplayerChat')?.classList.add('hidden');
      this.document?.getElementById('multiplayerSpectator')?.classList.add('hidden');
      this.keys.clear();
      this.lastTransmittedInput = null;
      this.lastInputSentAt = 0;
      this.presentationPlayerSlots = [];
      this.presentationPlayerActors.clear();
      this._clearPresentationEntityCaches();
      this._togglePause(false);
      this._setCampaignHudVisible(false);
      this.document?.getElementById('start')?.classList.remove('hidden');
      root.document?.body?.classList.remove('network-multiplayer-active');
      this._restoreCampaignPresentationState();
      // State managers intentionally ignore same-state transitions. If a late
      // network frame exposed a HUD layer after the menu had already become the
      // current state, restoring "menu" would therefore not repaint the UI.
      // Teardown owns the final visibility invariant: no gameplay HUD survives
      // after a multiplayer view releases the screen.
      this._setCampaignHudVisible(false);
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
      this.campaignHudState = new Map(CAMPAIGN_HUD_LAYER_IDS.map(id => {
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
      this.spectatorPlayerId = null;
      this.localWasDowned = false;
      this.spectatorRenderSignature = '';
      this.chatRenderSignature = '';
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
      const layerIds = visible ? Object.keys(NETWORK_HUD_DISPLAY_VALUES) : CAMPAIGN_HUD_LAYER_IDS;
      layerIds.forEach(id => {
        const element = this.document?.getElementById(id);
        if (!element) return;
        element.classList.toggle('hidden', !visible);
        element.setAttribute('aria-hidden', visible ? 'false' : 'true');
        element.style.display = visible ? NETWORK_HUD_DISPLAY_VALUES[id] : 'none';
      });
    }

    _isChatOpen() {
      const form = this.document?.getElementById('multiplayerChatForm');
      return !!form && !form.classList.contains('hidden');
    }

    _openChat() {
      if (!this.active) return;
      const form = this.document?.getElementById('multiplayerChatForm');
      const input = this.document?.getElementById('multiplayerChatInput');
      if (!form || !input) return;
      this.keys.clear();
      this.laserHeld = false;
      form.classList.remove('hidden');
      // Releasing pointer lock normally opens the multiplayer pause menu. Chat
      // is its own intentional focus transition, so disarm that edge first.
      if (this.document?.pointerLockElement === this.canvas) {
        this.pointerWasLocked = false;
        this.document.exitPointerLock?.();
      }
      input.focus({ preventScroll: true });
    }

    _closeChat() {
      const form = this.document?.getElementById('multiplayerChatForm');
      const input = this.document?.getElementById('multiplayerChatInput');
      form?.classList.add('hidden');
      input?.blur?.();
    }

    closeChat() {
      this._closeChat();
    }

    _submitChat() {
      const input = this.document?.getElementById('multiplayerChatInput');
      const text = String(input?.value || '').replace(/\s+/g, ' ').trim();
      if (!text) {
        this._closeChat();
        return;
      }
      try {
        this.session.sendChat?.(text);
        input.value = '';
        this._closeChat();
      } catch {
        // Disconnect/rejection state is already surfaced by the session UI.
      }
    }

    _renderChat(messages = []) {
      const log = this.document?.getElementById('multiplayerChatLog');
      if (!log) return;
      const visible = messages.slice(-8);
      const signature = visible.map(message => message.messageId).join('|');
      if (signature === this.chatRenderSignature) return;
      this.chatRenderSignature = signature;
      const players = this.currentSample?.state?.players || {};
      log.replaceChildren(...visible.map(message => {
        const row = this.document.createElement('div');
        row.className = 'multiplayer-chat__message';
        row.style.setProperty('--chat-color', derivePlayerColor(players[message.playerId] || { id: message.playerId }));
        const name = this.document.createElement('span');
        name.className = 'multiplayer-chat__name';
        name.textContent = `${message.displayName || 'Player'}: `;
        const text = this.document.createElement('span');
        text.textContent = String(message.text || '');
        row.append(name, text);
        return row;
      }));
      log.scrollTop = log.scrollHeight;
    }

    _spectatorCandidates(state = this.currentSample?.state) {
      return Object.values(state?.players || {})
        .filter(player => player && !player.disconnected)
        .sort((first, second) => Number(first.slotIndex || 0) - Number(second.slotIndex || 0));
    }

    _renderSpectatorControls(state, localPlayerId, force = false) {
      const panel = this.document?.getElementById('multiplayerSpectator');
      if (!panel) return;
      const localPlayer = state?.players?.[localPlayerId];
      if (!localPlayer?.downed) {
        panel.classList.add('hidden');
        this.spectatorRenderSignature = '';
        return;
      }
      const candidates = this._spectatorCandidates(state);
      const target = candidates.find(player => player.id === this.spectatorPlayerId) || localPlayer;
      const signature = JSON.stringify(candidates.map(player => [player.id, player.displayName, !!player.downed, player.roomId, player.id === target.id]));
      panel.classList.remove('hidden');
      if (!force && signature === this.spectatorRenderSignature) return;
      this.spectatorRenderSignature = signature;
      const targetName = target.id === localPlayerId ? 'your downed hero' : (target.displayName || target.id);
      const targetLabel = this.document?.getElementById('multiplayerSpectatorTarget');
      if (targetLabel) targetLabel.textContent = `Viewing ${targetName}${target.downed ? ' (downed)' : ''}`;
      const controls = this.document?.getElementById('multiplayerSpectatorPlayers');
      controls?.replaceChildren(...candidates.map(player => {
        const button = this.document.createElement('button');
        button.type = 'button';
        button.className = `multiplayer-spectator__player${player.id === target.id ? ' is-active' : ''}${player.downed ? ' is-downed' : ''}`;
        button.dataset.spectatorPlayerId = player.id;
        button.style.setProperty('--spectator-color', derivePlayerColor(player));
        button.textContent = `${player.displayName || player.id}${player.id === localPlayerId ? ' (YOU)' : ''}${player.downed ? ' — DOWN' : ''}`;
        return button;
      }));
    }

    _syncSpectatorState(state, localPlayerId) {
      const localPlayer = state?.players?.[localPlayerId];
      const isDowned = !!localPlayer?.downed;
      if (isDowned) {
        const candidates = this._spectatorCandidates(state);
        const targetExists = candidates.some(player => player.id === this.spectatorPlayerId);
        if (!this.localWasDowned || !targetExists) {
          this.spectatorPlayerId = candidates.find(player => player.id !== localPlayerId && !player.downed)?.id
            || localPlayerId;
        }
      } else {
        this.spectatorPlayerId = null;
      }
      this.localWasDowned = isDowned;
      this._renderSpectatorControls(state, localPlayerId);
    }

    _cycleSpectatorTarget() {
      const candidates = this._spectatorCandidates();
      if (!candidates.length) return;
      const currentIndex = candidates.findIndex(player => player.id === this.spectatorPlayerId);
      this.spectatorPlayerId = candidates[(currentIndex + 1 + candidates.length) % candidates.length].id;
      this._renderSpectatorControls(this.currentSample?.state, this.session.snapshot().playerId, true);
    }

    _viewpointPlayerId(state, localPlayerId) {
      if (!state?.players?.[localPlayerId]?.downed) return localPlayerId;
      return state.players?.[this.spectatorPlayerId] ? this.spectatorPlayerId : localPlayerId;
    }

    _onSnapshot(snapshot = {}) {
      this.lastRoomCode = snapshot.roomCode || this.lastRoomCode;
      this._renderChat(snapshot.chatMessages || []);
      const state = snapshot.gameState;
      this._consumeGameplayEvents(snapshot.gameplayEvents || []);
      if (!state || !state.players) return;
      this._syncSpectatorState(state, snapshot.playerId);
      const receivedAt = root.performance?.now?.() || Date.now();
      const receivedFloorNumber = Math.max(1, Number(state.floorNumber || state.floorState?.layout?.floorNumber || 1));
      if (this.lastFloorNumber > 0 && receivedFloorNumber !== this.lastFloorNumber) {
        this.floorTransitionStartedAt = receivedAt;
      }
      this.lastFloorNumber = receivedFloorNumber;
      const localTransition = state.floorState?.transitionsByPlayer?.[snapshot.playerId];
      const transitionSequence = Math.max(0, Number(localTransition?.sequence) || 0);
      const transitionChanged = transitionSequence > this.lastTransitionSequence;
      if (transitionChanged) {
        if (this.lastTransitionSequence > 0 || this.currentSample) this.transitionFlashUntil = receivedAt + 260;
        this.lastTransitionSequence = transitionSequence;
      }
      if (!this.currentSample || state.tick > this.currentSample.tick) {
        this.previousSample = this.currentSample || { tick: state.tick, receivedAt, state };
        this.currentSample = { tick: state.tick, receivedAt, state };
      }
      const authorityPlayer = state.players[snapshot.playerId];
      if (!authorityPlayer) return;
      if (transitionChanged || receivedFloorNumber !== Number(this.localPredictedPlayer?.floorNumber || receivedFloorNumber)) {
        this.localPredictedPlayerId = snapshot.playerId;
        this.localPredictedPlayer = { ...authorityPlayer, floorNumber: receivedFloorNumber };
        return;
      }
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
      if (this.active && pressed && !event.repeat && event.code === 'KeyT'
        && !event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        this._openChat();
        return;
      }
      if (this._isChatOpen()) {
        if (pressed && event.code === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation?.();
          this._closeChat();
        }
        return;
      }
      // Escape is owned by the campaign panel handler. Registering a second
      // network toggle here would process the same window keydown twice; that
      // handler calls togglePause() on this view exactly once.
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
      const localPlayer = this.currentSample?.state?.players?.[this.session.snapshot().playerId];
      if (this.active && localPlayer?.downed && event.button === 0 && event.target === this.canvas) {
        event.preventDefault();
        this._cycleSpectatorTarget();
        return;
      }
      if (!this.active || this._isInputBlocked() || ![0, 2].includes(event.button) || event.target !== this.canvas) return;
      event.preventDefault();
      this._onPointerMove(event);
      if (event.button === 2) {
        // Channelled beams are hold-to-maintain: the held bit rides the input
        // stream so the authority can end the channel the moment RMB lifts.
        this.laserHeld = true;
        this._useSlot('laser');
      } else {
        this._attack();
      }
    }

    _onPointerUp(event) {
      if (event.button === 2) this.laserHeld = false;
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
      // Shop / anvil / special-room panels (and the ladder) are toggled by the
      // campaign's global window keydown handler in panels.js, which already runs
      // in multiplayer because the co-op game state sits in `play`. Toggling them
      // here as well made the same E press fire twice — open then instantly close,
      // the shop panel "flickering off right away". This is the same double-listener
      // trap the Escape handler in _onKey documents; keep this path to the one job
      // the campaign handler can't do without a session: sending the INTERACT
      // command for nearby chests / interactables.
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
        runServices.getClientRunServiceIntents?.(event.eventType, event.data || {}, localPlayerId).forEach(intent => {
          if (intent.kind === 'achievement') root.achievementEvents?.emit?.(intent.name, intent.data);
          else if (intent.kind === 'tutorial') this.neo.tutorialController?.signal?.(intent.name, intent.data);
        });
        if (event.eventType === 'PLAYER_DOWNED') {
          const player = this.currentSample?.state?.players?.[event.data?.playerId];
          const member = this.session.snapshot()?.lobbyState?.members?.find(candidate => candidate.playerId === event.data?.playerId);
          const name = event.data?.playerId === localPlayerId ? 'You are down' : `${player?.displayName || member?.displayName || 'A teammate'} is down`;
          this.neo.pushStatusToast?.({ text: name, label: 'DOWNED', accent: '#ff7082', holdMs: 3200 });
        } else if (event.eventType === 'PLAYER_REVIVED' || event.eventType === 'PLAYER_RESPAWNED') {
          const player = this.currentSample?.state?.players?.[event.data?.playerId];
          const member = this.session.snapshot()?.lobbyState?.members?.find(candidate => candidate.playerId === event.data?.playerId);
          const name = event.data?.playerId === localPlayerId ? 'You are back in the fight' : `${player?.displayName || member?.displayName || 'A teammate'} is back`;
          this.neo.pushStatusToast?.({ text: name, label: 'REVIVED', accent: '#72e69c', holdMs: 2400 });
        }
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
        if (event.eventType === 'PLAYER_HIT' && event.data?.playerId === localPlayerId
          && this.localPredictedPlayer && Number(event.data.knockbackMagnitude || 0) > 0) {
          movementRules.applyCampaignImpulse?.(
            this.localPredictedPlayer,
            Number(event.data.knockbackAngle || 0),
            Number(event.data.knockbackMagnitude || 0),
          );
        }
        if (event.eventType === 'PICKUP_COLLECTED' && event.data?.playerId === localPlayerId && event.data?.itemKey) {
          this.neo.pushItemNotification?.(event.data.itemKey, Math.max(1, Number(event.data.amount || 1)));
          // A duplicate roll gets the campaign's compact "Copied!" toast next
          // to the normal pickup card, exactly as collectItem presents it.
          if (Number(event.data.amount || 1) >= 2) this.neo.pushCopiedNotification?.(event.data.itemKey);
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
        if (event.eventType === 'DESTRUCTIBLE_HIT' || event.eventType === 'DESTRUCTIBLE_BROKEN') {
          const data = event.data || {};
          // Reuse the authoritative prop from the mirrored room so the campaign
          // FX read its real size/kind; fall back to a stub at the event point.
          const prop = (this.neo.destructibles || []).find(candidate => (
            candidate.kind === data.obstacleKind
            && Math.abs(Number(candidate.x) - Number(data.x)) < 1
            && Math.abs(Number(candidate.y) - Number(data.y)) < 1
          )) || { kind: data.obstacleKind, x: Number(data.x), y: Number(data.y), r: 24, reinforced: !!data.reinforced };
          if (event.eventType === 'DESTRUCTIBLE_HIT') {
            this.neo.spawnDestructibleHitFx?.(prop, 1, {});
          } else if (data.obstacleKind === 'barrel') {
            this.neo.spawnBarrelExplosionFx?.(prop, {});
          } else {
            this.neo.spawnDestructibleBreakFx?.(prop, {});
            this.neo.playSfx?.('break_furniture');
          }
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
      const localPlayerId = this.session.snapshot().playerId;
      const viewpointPlayer = state.players?.[this._viewpointPlayerId(state, localPlayerId)];
      if (!viewpointPlayer) return true;
      const data = event.data || {};
      const eventEntity = state.enemies?.[data.enemyId]
        || state.players?.[data.playerId]
        || state.pickups?.[data.pickupId];
      const eventRoomId = data.roomId || eventEntity?.roomId;
      return !eventRoomId || eventRoomId === viewpointPlayer.roomId;
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
        // Campaign hit feel: directional screenshake scaled to impact weight,
        // driven off the authoritative ENEMY_HIT/PLAYER_HIT event (matches
        // applyHitFeel in combat.js). Chip/DoT ticks (no knockback, tiny damage)
        // are skipped so a held beam doesn't jitter the camera every frame.
        const localPlayerId = this.session.snapshot?.()?.playerId;
        const maxHp = Math.max(1, Number(entity.maxHealth || entity.maxHp || Number(data.damage || 0) * 6));
        const ratio = clamp(Number(data.damage || 0) / maxHp, 0, 1);
        const isPlayerHit = event.eventType === 'PLAYER_HIT';
        const relevant = isPlayerHit ? data.playerId === localPlayerId : true;
        if (relevant && (data.crit || ratio >= 0.04 || Number(data.knockback || 0) >= 120)) {
          const heavy = clamp(ratio * 2.4, 0, 1);
          const trauma = (data.crit ? 0.32 : 0.16) + heavy * 0.3;
          const kick = (data.crit ? 5 : 2.5) + heavy * 6;
          const angle = Math.atan2(entity.y - (this.localPredictedPlayer?.y ?? entity.y), entity.x - (this.localPredictedPlayer?.x ?? entity.x));
          this.neo.addTrauma?.(trauma, isPlayerHit ? angle + Math.PI : angle, kick);
          if (data.crit || heavy > 0.6) this.neo.addHitstop?.(0.04);
        }
      } else if (event.eventType === 'ENEMY_DEFEATED') {
        this.neo.ringBurst?.(entity.x, entity.y, Number(entity.radius || 20) + 8, '#ff7592', 0.48);
        this.neo.playSfx?.('enemy_hit');
      } else if (event.eventType === 'ENEMY_SPOKE') {
        // Boss voice lines ride authoritative events into the normal campaign
        // speech bubbles (Queen's finisher bark, Bowman's SONICHU, etc.).
        const speaker = this.presentationEnemyActors.get(String(data.enemyId)) || entity;
        if (speaker && data.text) this.neo.sayOverEntity?.(speaker, String(data.text), { holdTime: 1.6 });
      } else if (event.eventType === 'PICKUP_COLLECTED') {
        // Match the campaign's per-type pickup presentation: coins ring and
        // chime, potions show the heal popup, items only play item_collect
        // (handled with the notification card in _consumeGameplayEvents).
        if (data.pickupType === 'coin') {
          this.neo.ringBurst?.(entity.x, entity.y, 9, '#ffd966', 0.34);
          this.neo.playSfx?.('coin');
        } else if (data.pickupType === 'potion' && Number(data.healedAmount || 0) > 0) {
          this.neo.spawnHealPopup?.(entity.x, entity.y - 20, Number(data.healedAmount));
        }
      } else if (event.eventType === 'PLAYER_ABILITY_USED') {
        const presentation = deriveAbilityPresentation(data);
        const originX = Number.isFinite(Number(data.originX)) ? Number(data.originX) : Number(entity.x);
        const originY = Number.isFinite(Number(data.originY)) ? Number(data.originY) : Number(entity.y);
        const destinationX = Number.isFinite(Number(data.destinationX)) ? Number(data.destinationX) : Number(entity.x);
        const destinationY = Number.isFinite(Number(data.destinationY)) ? Number(data.destinationY) : Number(entity.y);
        const radius = Math.max(1, Number(data.effectRadius || (data.slot === 'smash' ? 140 : 34)));
        const kind = String(data.presentation?.kind || presentation.kind || data.mode || '');
        const isLocalCaster = data.playerId === this.session.snapshot?.()?.playerId && this.localPredictedPlayer;
        // The plain glide dash isn't a teleport: it moves the hero over ~0.16s
        // via dashUntilTick/dashVx/dashVy, which prediction already integrates.
        // Snapping to destination here would freeze it at its start point, so we
        // start the glide locally and let predictPosition carry it instead.
        if (isLocalCaster && data.abilityId === 'dash') {
          const serverTick = Number(this.currentSample?.state?.tick || 0);
          this.localPredictedPlayer.dashUntilTick = serverTick + Math.round(0.16 * 20);
          this.localPredictedPlayer.dashVx = Number(data.dashVx || 0);
          this.localPredictedPlayer.dashVy = Number(data.dashVy || 0);
        } else if (isLocalCaster && ['dash', 'warp', 'dash_aoe'].includes(kind)) {
          this.localPredictedPlayer.x = destinationX;
          this.localPredictedPlayer.y = destinationY;
          this.localPredictedPlayer.vx = 0;
          this.localPredictedPlayer.vy = 0;
        }
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
      // Touch stick, same treatment as the gamepad above: the on-screen joystick
      // is the only movement source on mobile, and without this branch a network
      // run reads keyboard and gamepad only, so phones cannot move at all.
      const touch = root.NeoTouch;
      if (touch?.active) {
        const touchX = Math.abs(Number(touch.moveX) || 0) > TOUCH_DEADZONE ? Number(touch.moveX) : 0;
        const touchY = Math.abs(Number(touch.moveY) || 0) > TOUCH_DEADZONE ? Number(touch.moveY) : 0;
        if (Math.hypot(touchX, touchY) > Math.hypot(moveX, moveY)) {
          moveX = touchX;
          moveY = touchY;
        }
      }
      const movement = normalizeMovement(moveX, moveY);
      // Network input must use the same camera-relative controls as the normal
      // campaign update loop. Without this, W continued to mean world-up while
      // the first-person camera faced world-right, which felt inverted.
      return movementRules.resolveCampaignMovementInput
        ? movementRules.resolveCampaignMovementInput(movement.moveX, movement.moveY, this.neo.getFirstPersonYaw?.())
        : movement;
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
      const input = { ...movement, aimDirection: this.aimDirection, buttons: this.laserHeld ? BUTTON_LASER_HELD : 0 };
      if (this.localPredictedPlayer) {
        this.localPredictedPlayer = predictPosition(
          this.localPredictedPlayer,
          input,
          INPUT_INTERVAL_MS / 1000,
          this.currentSample?.state?.floorState,
          this.currentSample?.tick,
        );
      }
      const now = root.performance?.now?.() || Date.now();
      const previous = this.lastTransmittedInput;
      const movementOrButtonChanged = !previous
        || Math.abs(input.moveX - previous.moveX) > INPUT_VECTOR_EPSILON
        || Math.abs(input.moveY - previous.moveY) > INPUT_VECTOR_EPSILON
        || input.buttons !== previous.buttons;
      const aimChanged = !previous || angularDistance(input.aimDirection, previous.aimDirection) > INPUT_AIM_EPSILON;
      const sinceLastSend = Math.max(0, now - this.lastInputSentAt);
      const shouldTransmit = movementOrButtonChanged
        || (aimChanged && sinceLastSend >= INPUT_AIM_SEND_INTERVAL_MS)
        || sinceLastSend >= INPUT_HEARTBEAT_MS;
      if (!shouldTransmit) return;
      try {
        this.session.sendInput(input);
        this.lastTransmittedInput = { ...input };
        this.lastInputSentAt = now;
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

    togglePause(visible = !this.paused) {
      this._togglePause(visible);
    }

    _isInputBlocked() {
      return this.paused
        || this._isChatOpen()
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

    // Recover vx/vy from how far the interpolated position moved since the last
    // presentation frame. `actor` still holds the previous frame's x/y; `player`
    // carries the new one. Returns the fields to merge onto the actor.
    _deriveActorVelocity(actor, player, frameDelta) {
      const x = Number(player.x || 0);
      const y = Number(player.y || 0);
      const hadPrevious = Number.isFinite(actor.x) && Number.isFinite(actor.y);
      if (!hadPrevious || !(frameDelta > 0)) return { vx: Number(actor.vx || 0), vy: Number(actor.vy || 0) };
      // A room change or respawn teleports the actor; a jump that large is not
      // movement and would spike the animation into a full sprint for a frame.
      const jumpedX = x - actor.x;
      const jumpedY = y - actor.y;
      if (Math.hypot(jumpedX, jumpedY) > 240) return { vx: 0, vy: 0 };
      const k = 1 - Math.exp(-NETWORK_VELOCITY_SMOOTH_HZ * frameDelta);
      return {
        vx: Number(actor.vx || 0) + (jumpedX / frameDelta - Number(actor.vx || 0)) * k,
        vy: Number(actor.vy || 0) + (jumpedY / frameDelta - Number(actor.vy || 0)) * k,
      };
    }

    _syncCampaignPresentationEntities(players, projectiles, localPlayerId, state, frameDelta = 0, visibleRoomId = null) {
      const serverTick = Number(state?.tick || 0);
      const now = root.performance?.now?.() || Date.now();
      const livePlayerIds = new Set(Object.keys(players || {}));
      this.presentationPlayerActors.forEach((actor, playerId) => {
        if (!livePlayerIds.has(playerId)) this.presentationPlayerActors.delete(playerId);
      });
      const projectedPlayerSlots = Object.values(players || {}).map(player => {
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
        // Read the previous position before Object.assign overwrites it.
        const derived = this._deriveActorVelocity(actor, player, frameDelta);
        Object.assign(actor, {
          ...player,
          ...derived,
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
          // Arm recoil is drawn by the shared drawPlayer path, but it reads a
          // countdown (armRecoilUntil vs gameElapsedTime) that combat.js sets
          // locally on fire. Nothing writes it here, so network heroes shot with
          // stiff arms. Derive the same countdown from the authority's action
          // tick so the shared renderer animates it exactly as in single player.
          ...(attacking ? {
            armRecoilUntil: Number(this.neo.gameElapsedTime || 0) + Math.max(0, ARM_RECOIL_DURATION - elapsed),
            armRecoilDuration: ARM_RECOIL_DURATION,
            armRecoilA: Number(player.aimDirection || 0),
            armRecoilFacing: Math.cos(Number(player.aimDirection || 0)) < 0 ? -1 : 1,
          } : {}),
          // Status rings, dash squash and flight are drawn by the shared
          // drawPlayer/drawPlayerSlot path for every hero, but these render
          // fields used to be derived only for the local player further down in
          // _syncCampaignHudState. Teammates therefore never showed that they
          // were burning, poisoned or dashing. Derive them per actor instead, so
          // the same authority tick counters animate everyone identically.
          statuses: player.statuses || root.NeoNyke?.simulation?.createCampaignStatusMap?.() || {},
          // The authority tracks the all-relics god window per player as
          // godUntilTick, but nothing projected it, so the golden tint never
          // appeared in a network run -- for teammates OR for you.
          godTimer: Math.max(0, Number(player.godUntilTick || 0) - serverTick) / 20,
          dashTime: player.action === 'dash' && serverTick - Number(player.actionTick || 0) <= 4 ? 0.2 : 0,
          cowardsWayTime: Math.max(0, Number(player.statusUntilTick?.cowards_way || 0) - serverTick) / 20,
          princessFlightTime: Math.max(0, Number(player.statusUntilTick?.flying_unhitable || 0) - serverTick) / 20,
          overhealBarrier: Number(player.barrier || 0),
          overhealBarrierMax: Math.max(Number(player.barrier || 0), Number(player.maxHp || 100) * 0.4),
          networkDowned: !!player.downed,
        });
        this.presentationPlayerActors.set(player.id, actor);
        return {
          id: player.id,
          // The local hero renders through the full campaign drawPlayer path
          // (no tint, no name label), exactly like a single-player run.
          isLocal: player.id === localPlayerId,
          label: `${player.displayName || player.id}${player.id === localPlayerId ? ' (YOU)' : ''}`,
          color: player.color || derivePlayerColor(player),
          getEntity: () => actor,
          getCharacter: () => player.characterKey || 'thorn_knight',
          getDead: () => !!player.downed,
        };
      });
      this.presentationPlayerSlots = projectedPlayerSlots.filter(slot => (
        !visibleRoomId || slot.getEntity?.()?.roomId === visibleRoomId
      ));
      const localSlot = projectedPlayerSlots.find(slot => slot.id === localPlayerId);
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

    // Steer the local hero's beam against the live cursor every frame with the
    // same shared rule the authority applies to our streamed aim. The server
    // stays authoritative for damage; this only removes the network hop from
    // what the caster sees.
    _updateLocalBeamAngle(localPlayer, frameDelta) {
      const channel = localPlayer?.beamChannel;
      if (!channel) {
        this.localBeamAngle = null;
        this.localBeamChannelStart = -1;
        return;
      }
      if (this.localBeamChannelStart !== Number(channel.startTick)) {
        this.localBeamAngle = Number(channel.angle || 0);
        this.localBeamChannelStart = Number(channel.startTick);
      }
      this.localBeamAngle = moveContent.steerBeamChannelAngle?.(
        channel.moveKey,
        this.localBeamAngle,
        this.aimDirection,
        frameDelta,
        { sweepDirection: channel.sweepDirection, laserWeightMultiplier: localPlayer.itemStats?.laserWeightMultiplier },
      ) ?? Number(channel.angle || 0);
    }

    _projectActivePlayerEffects() {
      const localPlayerId = this.session.snapshot?.()?.playerId;
      const serverTick = Number(this.currentSample?.state?.tick || 0);
      return this.presentationPlayerSlots.flatMap(slot => {
        const actor = slot.getEntity?.();
        const channel = actor?.beamChannel;
        if (!channel || slot.getDead?.()) return [];
        const isLocal = slot.id === localPlayerId;
        return [{
          player: actor,
          abilityId: channel.moveKey,
          equippedLaser: channel.moveKey,
          laserActive: true,
          laserTime: Math.max(0.05, (Number(channel.untilTick || 0) - serverTick) / 20),
          laserTick: 0,
          laserMode: beamChannelLaserMode(channel.moveKey),
          laserAngle: isLocal && this.localBeamAngle != null ? this.localBeamAngle : Number(channel.angle || 0),
          laserSweepSpeed: Number(channel.sweepDirection || 1) * 4.6,
          loveBeamCasting: channel.moveKey === 'love_beam',
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
        // Multi-charge moves (Thorn's 2-charge dash, Warp's 4, …) carry a real
        // charge pool on the authority. Read it through readMoveChargeState rather
        // than indexing moveChargeState directly: pools are created lazily on first
        // cast, so a direct lookup would miss on a never-used move and render it as
        // single-charge until the player fires it once — Thorn's dash visibly
        // growing from 1 pip to 2 mid-fight.
        const pool = slot === 'melee' || !moveKey || !combatSystem.readMoveChargeState
          ? null
          : combatSystem.readMoveChargeState(localPlayer, moveKey);
        if (pool && pool.maxCharges > 0) {
          const timers = pool.timers
            .map(readyAt => Math.max(0, (Number(readyAt) - serverTick) / 20))
            .filter(seconds => seconds > 0)
            .sort((a, b) => a - b);
          this.neo.cooldowns[slot] = {
            charges: pool.charges,
            maxCharges: pool.maxCharges,
            timers,
            holding: 0,
          };
          return;
        }
        this.neo.cooldowns[slot] = {
          charges: current > 0 ? 0 : 1,
          maxCharges: 1,
          timers: current > 0 ? [current] : [],
          holding: 0,
        };
      });
      // dashTime/cowardsWayTime/princessFlightTime are derived per actor in
      // _syncCampaignPresentationEntities so remote heroes animate too.
      const channel = localPlayer.beamChannel;
      this.neo.laserActive = !!channel;
      this.neo.laserTime = channel ? Math.max(0, (Number(channel.untilTick || 0) - serverTick) / 20) : 0;
      this.neo.laserTick = 0;
      this.neo.laserMode = channel ? beamChannelLaserMode(channel.moveKey) : 'beam';
      this.neo.loveBeamCasting = channel?.moveKey === 'love_beam';
      this.neo.laserSweepSpeed = channel ? Number(channel.sweepDirection || 1) * 4.6 : 0;
      this.neo.laserAngle = channel
        ? (this.localBeamAngle ?? Number(channel.angle || 0))
        : Number(localPlayer.aimDirection || 0);
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
      const viewpointPlayerId = this._viewpointPlayerId(state, localPlayerId);
      const viewpointPlayer = players[viewpointPlayerId] || players[localPlayerId];
      const visibleRoomId = viewpointPlayer?.roomId || authorityFloorState.currentRoomId;
      const floorState = { ...authorityFloorState, currentRoomId: visibleRoomId };
      const enemies = this._renderedEntities('enemies', now);
      const projectiles = this._renderedEntities('projectiles', now);
      const pickups = state?.pickups || {};
      const localPlayer = players[localPlayerId];
      const frameDelta = this.lastPresentationFrameAt > 0
        ? clamp((now - this.lastPresentationFrameAt) / 1000, 0, 0.05)
        : 1 / 60;
      this.lastPresentationFrameAt = now;
      this._updateCamera(viewpointPlayer, frameDelta);
      // Neo.draw reads Neo.camera in every local presentation mode. Keep that
      // canonical camera object synchronized with the network state adapter;
      // otherwise the adapter aimed/tracked with one camera while the normal
      // renderer displayed another, making the same 900x700 room look larger.
      this.neo.camera = this.neo.camera || { x: 0, y: 0 };
      this.neo.camera.x = this.camera.x;
      this.neo.camera.y = this.camera.y;
      const transform = computeCameraTransform(this.canvas.width, this.canvas.height, this.camera, visibleBounds);
      this.lastWorldTransform = transform;
      this.lastRenderedPlayerCount = Object.values(players).filter(player => player.roomId === visibleRoomId).length;
      this.lastRenderedEnemyCount = Object.keys(enemies).length;
      this.lastRenderedProjectileCount = Object.keys(projectiles).length;
      this.lastRenderedPickupCount = Object.keys(pickups).length;
      const ctx = this.ctx;

      this._updateUpgradeDwell(localPlayer, state, frameDelta);
      this._updateLocalBeamAngle(localPlayer, frameDelta);
      this._syncAutomaticChestInteraction(localPlayer, state);
      this._syncNeoPresentationFloor(floorState, enemies, pickups, state);
      this._syncCampaignPresentationEntities(players, projectiles, localPlayerId, state, frameDelta, visibleRoomId);
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
            stun: Math.max(0, Number(enemy.stunnedUntilTick || 0) - Number(state?.tick || 0)) / 20,
            confusedBlindUntil: Number(enemy.confusedBlindUntilTick || 0) / 20,
            // Status state is already canonical authority state. Pass it through
            // unchanged so campaign 2D/3D renderers see the same stacks,
            // durations and proc power as local play; never reconstruct a
            // network-only approximation from legacy bleed/fire fields.
            statuses: enemy.statuses || root.NeoNyke?.simulation?.createCampaignStatusMap?.() || {},
            // Authored-behavior enemies carry the campaign's real telegraph
            // timers (windup/swingTime/beamTime/dashTime); pass those through
            // so the normal renderer draws the exact same wind-ups and beams.
            // Only the generic legacy types reconstruct them from `state`.
            swingTime: Number.isFinite(Number(enemy.swingTime)) && Number(enemy.swingTime) > 0
              ? Number(enemy.swingTime)
              : (enemy.state === 'attacking' ? 0.2 : 0),
            windup: Number.isFinite(Number(enemy.windup)) && Number(enemy.windup) > 0
              ? Number(enemy.windup)
              : (enemy.state === 'aiming' ? 0.35 : 0),
            beamAngle: Number(enemy.beamAngle ?? enemy.aimDirection ?? 0),
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
    INPUT_AIM_SEND_INTERVAL_MS,
    INPUT_HEARTBEAT_MS,
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
