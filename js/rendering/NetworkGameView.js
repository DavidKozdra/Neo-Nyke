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
    'showFloorTransition', 'floorTransitionTime',
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

  function computeWorldTransform(canvasWidth, canvasHeight, roomWidth = 900, roomHeight = 700, visibleBounds = null) {
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
    return {
      ...player,
      x: clamp(Number(player.x || 0) + movement.moveX * speed * fixedDelta, minimum, width - minimum),
      y: clamp(Number(player.y || 0) + movement.moveY * speed * fixedDelta, minimum, height - minimum),
      vx: movement.moveX * speed,
      vy: movement.moveY * speed,
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
      this.projectileTrails = new Map();
      this.presentationRooms = new Map();
      this.presentationPlayerSlots = [];
      this.gamepadAttackPressed = false;
      this.camera = { x: 0, y: 0, roomId: null };
      this.lastPresentationFrameAt = 0;
      this.lastWorldTransform = null;
      this.paused = false;
      this.upgradeDwell = { selectionEventId: '', optionId: '', seconds: 0, sent: false };
      this.campaignPresentationState = null;
      this.campaignHudState = null;
      this.campaignBodyPaused = null;
      this.boundKeyDown = event => this._onKey(event, true);
      this.boundKeyUp = event => this._onKey(event, false);
      this.boundPointerMove = event => this._onPointerMove(event);
      this.boundPointerDown = event => this._onPointerDown(event);
      this.boundContextMenu = event => {
        if (this.active && event.target === this.canvas) event.preventDefault();
      };
      this.boundBlur = () => this.keys.clear();
      this.boundPauseResume = () => this._togglePause(false);
      this.boundPauseLeave = () => this.document?.getElementById('multiplayerLeaveGame')?.click();
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
      this.document?.getElementById('pauseResume')?.addEventListener('click', this.boundPauseResume);
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
      this.document?.getElementById('pauseResume')?.removeEventListener('click', this.boundPauseResume);
      this.document?.getElementById('pauseLeaveServer')?.removeEventListener('click', this.boundPauseLeave);
      this.keys.clear();
      this.projectileTrails.clear();
      this.presentationPlayerSlots = [];
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
      this.campaignHudState = null;
      this.campaignBodyPaused = null;
      this.presentationRooms.clear();
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
      if (this.active && event.code === 'Escape' && pressed && !event.repeat) {
        event.preventDefault();
        this._togglePause(!this.paused);
        return;
      }
      if (this.active && pressed && !event.repeat && event.code === 'KeyE') {
        event.preventDefault();
        this._interact();
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
      if (!this.active || this.paused || ![0, 2].includes(event.button) || event.target !== this.canvas) return;
      event.preventDefault();
      this._onPointerMove(event);
      if (event.button === 2) this._useSlot('laser');
      else this._attack();
    }

    _attack() {
      if (!this.active || this.paused || this.session.snapshot().status !== 'running') return;
      try {
        this.session.sendAction('ATTACK', this.aimDirection);
      } catch {
        // Session state changes are surfaced by its normal disconnect handler.
      }
    }

    _useSlot(slot) {
      if (!this.active || this.paused || this.session.snapshot().status !== 'running') return;
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
      const target = Object.values(state.interactables || {})
        .filter(item => !item.opened && item.roomId === player.roomId)
        .map(item => ({ item, distance: Math.hypot(Number(item.x) - Number(player.x), Number(item.y) - Number(player.y)) }))
        .filter(entry => entry.distance <= Number(entry.item.radius || 30) + Number(player.radius || 18) + 38)
        .sort((first, second) => first.distance - second.distance)[0]?.item;
      if (target) this.session.sendInteract(target.id);
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
        x: Number(source.x || 0) + (index - (count - 1) / 2) * 112,
        y: Number(source.y || 0) + 92,
        r: 20,
        dwellMode: true,
        dwell: this.upgradeDwell.selectionEventId === pending.selectionEventId
          && this.upgradeDwell.optionId === option.id ? this.upgradeDwell.seconds : 0,
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
      const floorState = this.currentSample?.state?.floorState || {};
      const transform = this.lastWorldTransform || computeCameraTransform(
        this.canvas.width, this.canvas.height, this.camera, this._visibleCanvasBounds(),
      );
      const canvasX = (event.clientX - rect.left) * (this.canvas.width / Math.max(1, rect.width));
      const canvasY = (event.clientY - rect.top) * (this.canvas.height / Math.max(1, rect.height));
      const worldX = (canvasX - transform.offsetX) / transform.scale;
      const worldY = (canvasY - transform.offsetY) / transform.scale;
      this.aimDirection = Math.atan2(worldY - this.localPredictedPlayer.y, worldX - this.localPredictedPlayer.x);
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
      const movement = this.paused || this.localPredictedPlayer?.downed
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
      const pause = this.document?.getElementById('pause');
      pause?.classList.toggle('hidden', !this.paused);
      const title = this.document?.getElementById('pauseTitle');
      if (title) title.textContent = this.paused ? 'MULTIPLAYER' : 'PAUSED';
      this.document?.getElementById('pauseMain')?.classList.toggle('hidden', this.paused);
      this.document?.getElementById('pauseLeaveServer')?.classList.toggle('hidden', !this.paused);
      root.document?.body?.classList.toggle('game-paused', this.paused);
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

    _syncCampaignPresentationEntities(players, projectiles, localPlayerId, state) {
      const serverTick = Number(state?.tick || 0);
      const now = root.performance?.now?.() || Date.now();
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
        const actor = {
          ...player,
          character: player.characterKey || 'thorn_knight',
          r: Number(player.radius || 18),
          hp: Number(player.health || 0),
          maxHp: Number(player.maxHealth || 100),
          coins: Number(player.gold || 0),
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
          overhealBarrierMax: Math.max(Number(player.barrier || 0), Number(player.maxHealth || 100) * 0.4),
        };
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
      if (localSlot) {
        this.neo.player = localSlot.getEntity();
        this._syncCampaignHudState(this.neo.player, state);
      }
      this.neo.projectiles = Object.values(projectiles || {}).map(projectile => ({
        ...projectile,
        r: Number(projectile.radius || 7),
        enemy: !!projectile.hostile,
        life: Math.max(0, Number(projectile.expiresTick || 0) - serverTick) / 20,
      }));
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

    drawAuthoritativePlayerEffects() {
      if (typeof this.neo.drawPlayerLaser !== 'function') return;
      const now = root.performance?.now?.() || Date.now();
      const slotsById = new Map(this.presentationPlayerSlots.map(slot => [slot.id, slot]));
      const saved = {
        player: this.neo.player,
        laserActive: this.neo.laserActive,
        laserTime: this.neo.laserTime,
        laserTick: this.neo.laserTick,
        laserMode: this.neo.laserMode,
        laserAngle: this.neo.laserAngle,
        laserSweepSpeed: this.neo.laserSweepSpeed,
        loveBeamCasting: this.neo.loveBeamCasting,
        activeBeamPaths: this.neo.activeBeamPaths,
        rng: this.neo.rng,
      };
      try {
        this.combatEffects.forEach(effect => {
          const data = effect.data || {};
          if (effect.eventType !== 'PLAYER_ABILITY_USED' || !CONTINUOUS_BEAM_MOVES.has(data.abilityId)) return;
          const duration = Math.max(0.05, Number(MOVE_BASE_STATS[data.abilityId]?.duration || 0.52));
          const ageSeconds = Math.max(0, now - Number(effect.startedAt || now)) / 1000;
          if (ageSeconds >= duration) return;
          const slot = slotsById.get(data.playerId);
          if (!slot || slot.getDead?.()) return;
          this.neo.player = slot.getEntity();
          this.neo.laserActive = true;
          this.neo.laserTime = duration - ageSeconds;
          this.neo.laserTick = 0;
          this.neo.laserMode = data.abilityId === 'turtle_wave' ? 'turtle_wave'
            : data.abilityId === 'holy_eye_beams' ? 'holy_eye_beams'
              : data.abilityId === 'thorn_blood_beams' ? 'thorn_blood_beams'
                : data.abilityId === 'god_sweep' ? 'god_sweep'
                  : 'beam';
          this.neo.loveBeamCasting = data.abilityId === 'love_beam';
          this.neo.laserSweepSpeed = Number(data.sweepDirection || 1) * 4.6;
          this.neo.laserAngle = Number(data.aimDirection || 0)
            + (data.abilityId === 'god_sweep' ? this.neo.laserSweepSpeed * ageSeconds : 0);
          this.neo.activeBeamPaths = null;
          // drawPlayerLaser is the real campaign renderer and emits cosmetic
          // particles via Neo.rng(). Network sessions do not own a campaign
          // run RNG, so provide a client-only FX source for this draw.
          this.neo.rng = typeof saved.rng === 'function'
            ? saved.rng
            : () => this.neo.nextRandom?.('fx') ?? Math.random();
          this.neo.drawPlayerLaser();
        });
      } finally {
        Object.assign(this.neo, saved);
      }
    }

    // This is intentionally a state projection, not a renderer. It gives the
    // existing browser game (`Neo.draw`) the same live objects it normally
    // reads in single player; networked mode changes only where those objects
    // came from.
    syncPresentation() {
      if (!this.active || !this.ctx || !this.canvas) return;
      const now = root.performance?.now?.() || Date.now();
      const state = this.currentSample?.state;
      const authorityFloorState = state?.floorState || { width: 900, height: 700, wallThickness: 28, doorWidth: 140 };
      const visibleBounds = this._visibleCanvasBounds();
      const players = this._renderedPlayers(now);
      const localPlayerId = this.session.snapshot().playerId;
      const localRoomId = players[localPlayerId]?.roomId || authorityFloorState.currentRoomId;
      const floorState = { ...authorityFloorState, currentRoomId: localRoomId };
      const visiblePlayers = Object.fromEntries(Object.entries(players).filter(([, player]) => player.roomId === localRoomId));
      const enemies = this._renderedEntities('enemies', now);
      const projectiles = this._renderedEntities('projectiles', now);
      const pickups = state?.pickups || {};
      const interactables = state?.interactables || {};
      const localPlayer = players[localPlayerId];
      const frameDelta = this.lastPresentationFrameAt > 0
        ? clamp((now - this.lastPresentationFrameAt) / 1000, 0, 0.05)
        : 1 / 60;
      this.lastPresentationFrameAt = now;
      this._updateCamera(localPlayer, frameDelta);
      const transform = computeCameraTransform(this.canvas.width, this.canvas.height, this.camera, visibleBounds);
      this.lastWorldTransform = transform;
      this.lastRenderedPlayerCount = Object.keys(visiblePlayers).length;
      this.lastRenderedEnemyCount = Object.keys(enemies).length;
      this.lastRenderedProjectileCount = Object.keys(projectiles).length;
      this.lastRenderedPickupCount = Object.keys(pickups).length;
      const ctx = this.ctx;

      this._updateUpgradeDwell(localPlayer, state, frameDelta);
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

    _renderLegacyFallback() {
      const now = root.performance?.now?.() || Date.now();
      const state = this.currentSample?.state;
      const authorityFloorState = state?.floorState || { width: 900, height: 700, wallThickness: 28, doorWidth: 140 };
      const visibleBounds = this._visibleCanvasBounds();
      const players = this._renderedPlayers(now);
      const localPlayerId = this.session.snapshot().playerId;
      const localRoomId = players[localPlayerId]?.roomId || authorityFloorState.currentRoomId;
      const floorState = { ...authorityFloorState, currentRoomId: localRoomId };
      const visiblePlayers = Object.fromEntries(Object.entries(players).filter(([, player]) => player.roomId === localRoomId));
      const enemies = this._renderedEntities('enemies', now);
      const projectiles = this._renderedEntities('projectiles', now);
      const pickups = state?.pickups || {};
      const interactables = state?.interactables || {};
      const ctx = this.ctx;
      const transform = computeCameraTransform(this.canvas.width, this.canvas.height, this.camera, visibleBounds);
      const useCampaignWorldPipeline = typeof this.neo.drawWorldViewport === 'function'
        && typeof this.neo.drawProjectiles === 'function'
        && typeof this.neo.drawEnemies === 'function'
        && typeof this.neo.drawPlayerSlot === 'function';
      if (useCampaignWorldPipeline) {
        this.neo.gameElapsedTime = Number(state?.elapsedSeconds || 0);
        const floorTransitionAge = this.floorTransitionStartedAt > 0
          ? Math.max(0, now - this.floorTransitionStartedAt) / 1000
          : Number.POSITIVE_INFINITY;
        this.neo.showFloorTransition = floorTransitionAge <= 1.25;
        this.neo.floorTransitionTime = floorTransitionAge;
        this.neo.lavaAnimTime = Number(this.neo.lavaAnimTime || 0) + frameDelta;
        this.neo.updateParticles?.(frameDelta);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#02030a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
        this.neo.drawWorldViewport(this.camera, 0, this.canvas.width, this.canvas.height, 0, null);
        this._updateHud(state, players);
        return;
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#02030a';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.translate(transform.offsetX, transform.offsetY);
      ctx.scale(transform.scale, transform.scale);
      if (typeof this.neo.drawFloor === 'function') {
        this.neo.drawFloor();
        this.neo.drawRoomDecor?.();
        this.neo.drawWorldProps?.();
        this.neo.drawChallengeObelisk?.();
      } else {
        this._drawRoom(floorState);
      }
      this.neo.drawChests?.();
      if (typeof this.neo.drawPickups === 'function') this.neo.drawPickups();
      else Object.values(pickups).filter(entity => entity.roomId === floorState.currentRoomId)
        .forEach(entity => this._drawPickup(entity, now));
      Object.values(interactables).filter(entity => entity.roomId === floorState.currentRoomId
        && !(entity.kind === 'relic_chest' && typeof this.neo.drawChests === 'function')
        && !(entity.kind === 'stairs' && typeof this.neo.drawPickups === 'function'))
        .forEach(entity => this._drawInteractable(entity, now));
      Object.values(projectiles).filter(entity => entity.roomId === floorState.currentRoomId)
        .forEach(entity => this._drawProjectile(entity));
      if (typeof this.neo.drawEnemies === 'function') {
        try {
          this.neo.drawEnemies({
            left: this.camera.x,
            right: this.camera.x + this.canvas.width,
            top: this.camera.y,
            bottom: this.camera.y + this.canvas.height,
          });
        } catch (_error) {
          Object.values(enemies).filter(entity => entity.roomId === floorState.currentRoomId)
            .forEach(entity => this._drawEnemy(entity, state?.tick || 0, now));
        }
      } else Object.values(enemies).filter(entity => entity.roomId === floorState.currentRoomId)
        .forEach(entity => this._drawEnemy(entity, state?.tick || 0, now));
      Object.values(visiblePlayers).forEach(player => this._drawPlayer(player, player.id === localPlayerId));
      this.neo.drawStructuresOverPlayer?.();
      this.neo.updateParticles?.(frameDelta);
      if (typeof this.neo.drawParticles === 'function') this.neo.drawParticles();
      else this._drawCombatEffects(visiblePlayers, enemies, now);
      ctx.restore();
      this._updateHud(state, players);
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
      rooms.forEach(room => this._hydrateRoomDecor(room, floorState, state));
      this.neo.currentRoom = rooms.find(room => room.id === floorState.currentRoomId) || rooms[0] || null;
      this.neo.floor = Math.max(1, Number(floorState.layout?.floorNumber || 1));
      this.neo.floorsEntered = this.neo.floor;
      this.neo.enemies = Object.values(enemies || {})
        .filter(enemy => !enemy.dead && enemy.roomId === floorState.currentRoomId)
        .map(enemy => {
          const adapted = {
            ...enemy,
            r: Number(enemy.radius || 20),
            hp: Number(enemy.health || 0),
            max: Math.max(1, Number(enemy.maxHealth || 1)),
            speed: Number(enemy.moveSpeed || 0),
            spawnT: 0,
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
        });
      this.neo.deadBodies = Object.values(enemies || {})
        .filter(enemy => enemy.dead && enemy.roomId === floorState.currentRoomId)
        .map(enemy => ({
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
        }));
      this.neo.justiceBlades = [];
      this.neo.titanHammer = null;
      this.neo.ghostBalls = [];
      this.neo.skySwords = [];
      const roomInteractables = Object.values(state?.interactables || {});
      rooms.forEach(room => {
        room.chests = roomInteractables
          .filter(interactable => interactable.kind === 'relic_chest' && interactable.roomId === room.id)
          .map(interactable => ({
            id: interactable.id,
            x: Number(interactable.x || 0),
            y: Number(interactable.y || 0),
            open: !!interactable.opened || !!interactable.activated,
            choiceType: '',
            networkChest: true,
          }));
      });
      this.neo.chests = this.neo.currentRoom?.chests || [];
      this.neo.pickups = Object.values(pickups || {})
        .filter(pickup => pickup.roomId === floorState.currentRoomId)
        .map(pickup => ({ ...pickup, value: Number(pickup.amount || pickup.value || 1), r: Number(pickup.radius || 13) }));
      this.neo.pickups.push(...roomInteractables
        .filter(interactable => interactable.kind === 'stairs' && interactable.roomId === floorState.currentRoomId)
        .map(interactable => ({
          id: interactable.id,
          type: 'ladder',
          x: Number(interactable.x || 0),
          y: Number(interactable.y || 0),
          networkExit: true,
        })));
      this.neo.pickups.push(...this._upgradePresentationPickups(state)
        .filter(choice => choice.roomId === floorState.currentRoomId));
      this.neo.hazards = Object.values(state?.abilityEntities || {})
        .filter(entity => entity.roomId === floorState.currentRoomId)
        .map(entity => ({ ...entity, r: Number(entity.radius || entity.r || 32), ttl: Math.max(0, Number(entity.expiresTick || 0) - Number(state?.tick || 0)) / 20 }));
      this.neo.decorations = this.neo.currentRoom?.decorations || [];
      this.neo.structures = this.neo.currentRoom?.structures || [];
      this.neo.destructibles = this.neo.currentRoom?.destructibles || [];
      this.neo.environmentBackgroundCache = this.neo.environmentBackgroundCache || { key: '', canvas: null };
    }

    _hydrateRoomDecor(room, floorState, state) {
      if (!room || typeof this.neo.decorateRoomData !== 'function' || typeof this.neo.createRngStream !== 'function') return;
      const seedKey = `${state?.floorSeed ?? floorState.floorSeed ?? 'network'}|presentation|${room.id}`;
      if (room._networkDecorSeed === seedKey) return;
      const savedStreams = this.neo.rngStreams;
      const savedRng = this.neo.rng;
      const authoritativeCleared = room.cleared;
      try {
        this.neo.rngStreams = {
          world: this.neo.createRngStream(`${seedKey}|world`),
          loot: this.neo.createRngStream(`${seedKey}|loot`),
          encounter: this.neo.createRngStream(`${seedKey}|encounter`),
          fx: this.neo.createRngStream(`${seedKey}|fx`),
        };
        this.neo.rng = () => this.neo.nextRandom?.('encounter') ?? Math.random();
        this.neo.decorateRoomData(room);
        // Decorative pixels are client-only. Structures, hazards and
        // destructibles join this adapter only when authority collision owns them.
        room.structures = [];
        room.destructibles = [];
        room.hazards = [];
        room.pickups = [];
        room.chests = [];
        room.enemies = [];
        room.projectiles = [];
        room.cleared = authoritativeCleared;
        room._networkDecorSeed = seedKey;
      } catch (_error) {
        room.decorations = Array.isArray(room.decorations) ? room.decorations : [];
        room._networkDecorSeed = seedKey;
      } finally {
        this.neo.rngStreams = savedStreams;
        this.neo.rng = savedRng;
      }
    }

    _drawRoom(floorState) {
      const ctx = this.ctx;
      const width = Number(floorState.width) || 900;
      const height = Number(floorState.height) || 700;
      const wall = Number(floorState.wallThickness) || 28;
      const tile = 50;
      const currentRoom = floorState.layout?.rooms?.find(room => room.id === floorState.currentRoomId) || { doors: {} };
      const roomColors = {
        start: ['#25273a', '#0a0b13'],
        combat: ['#292431', '#0d0a10'],
        treasure: ['#302944', '#100b18'],
        shop: ['#21352f', '#08110e'],
        anvil: ['#352b24', '#120c08'],
        challenge: ['#38232a', '#12070a'],
        ladder: ['#333123', '#111006'],
        boss: ['#382026', '#120609'],
        god: ['#3c1d24', '#130508'],
      };
      const palette = roomColors[currentRoom.type] || roomColors.combat;
      const gradient = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, width * 0.7);
      gradient.addColorStop(0, palette[0]);
      gradient.addColorStop(1, palette[1]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      for (let y = wall; y < height - wall; y += tile) {
        for (let x = wall; x < width - wall; x += tile) {
          const shade = ((x / tile + y / tile) % 2 === 0) ? 'rgba(58, 62, 84, .34)' : 'rgba(35, 38, 57, .38)';
          ctx.fillStyle = shade;
          ctx.fillRect(x + 1, y + 1, Math.min(tile - 2, width - wall - x), Math.min(tile - 2, height - wall - y));
        }
      }
      ctx.strokeStyle = 'rgba(126, 164, 215, .12)';
      ctx.lineWidth = 2;
      ctx.strokeRect(wall + 8, wall + 8, width - wall * 2 - 16, height - wall * 2 - 16);
      this._drawWalls(width, height, wall, Number(floorState.doorWidth) || 140, currentRoom.doors || {});

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.fillStyle = 'rgba(82, 113, 172, .12)';
      ctx.beginPath();
      ctx.arc(0, 0, 92, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(136, 190, 255, .28)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = 'rgba(196, 224, 255, .25)';
      ctx.font = '700 18px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(currentRoom.type || 'combat').replace(/_/g, ' ').toUpperCase(), 0, 6);
      ctx.restore();
    }

    _drawWalls(width, height, wall, doorWidth, doors) {
      const ctx = this.ctx;
      const halfDoor = doorWidth / 2;
      ctx.fillStyle = '#3c3d4d';
      ctx.shadowColor = 'rgba(0,0,0,.65)';
      ctx.shadowBlur = 12;
      const horizontal = (y, open) => {
        if (open) {
          ctx.fillRect(0, y, width / 2 - halfDoor, wall);
          ctx.fillRect(width / 2 + halfDoor, y, width / 2 - halfDoor, wall);
        } else ctx.fillRect(0, y, width, wall);
      };
      const vertical = (x, open) => {
        if (open) {
          ctx.fillRect(x, 0, wall, height / 2 - halfDoor);
          ctx.fillRect(x, height / 2 + halfDoor, wall, height / 2 - halfDoor);
        } else ctx.fillRect(x, 0, wall, height);
      };
      horizontal(0, doors.n);
      horizontal(height - wall, doors.s);
      vertical(0, doors.w);
      vertical(width - wall, doors.e);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#74758a';
      ctx.fillRect(wall, wall, width - wall * 2, 4);
      ctx.fillRect(wall, height - wall - 4, width - wall * 2, 4);
    }

    _drawEnemy(enemy, serverTick, now) {
      const ctx = this.ctx;
      const hit = serverTick - Number(enemy.hitTick || -100) <= 2;
      const dying = !!enemy.dead;
      const bob = dying ? 0 : Math.sin(now / 140 + Number(String(enemy.id).replace(/\D/g, '') || 0)) * 3;
      ctx.save();
      ctx.globalAlpha = dying ? 0.45 : 1;
      ctx.shadowColor = hit ? '#ffffff' : '#ff4f78';
      ctx.shadowBlur = hit ? 24 : 10;
      const spriteKey = this.neo.getEnemySpriteKey?.(enemy) || enemy.spriteKey || enemy.type || 'cult_follower';
      if (typeof this.neo.drawActorSprite === 'function') {
        this.neo.drawActorSprite(enemy, spriteKey, enemy.x, enemy.y + bob, dying ? 50 : 60, {
          flipX: Number(enemy.facing || 1) < 0,
          shadowColor: hit ? '#ffffff' : '#ff4f78',
          shadowBlur: hit ? 24 : 10,
          animation: {
            maxSpeed: Math.max(1, Number(enemy.moveSpeed || 100)),
            stepRate: enemy.state === 'charging' ? 11 : 7.5,
            actionPulse: enemy.state === 'firing' ? 1 : 0,
            attackProgress: enemy.state === 'aiming' ? 0.5 : 0,
            seedKey: enemy.id,
          },
        });
      } else if (typeof this.neo.drawSpriteFrame === 'function') {
        this.neo.drawSpriteFrame(spriteKey, enemy.x, enemy.y + bob, dying ? 50 : 60, {
          flipX: Number(enemy.facing || 1) < 0,
          shadowColor: hit ? '#ffffff' : '#ff4f78',
          shadowBlur: hit ? 24 : 10,
        });
      } else {
        ctx.fillStyle = hit ? '#ffffff' : '#d54a68';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, Number(enemy.radius || 20), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (dying) return;
      if (enemy.state === 'aiming') {
        ctx.save();
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.65 + Math.sin(now / 55) * 0.25;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, Number(enemy.radius || 20) + 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const width = 58;
      const ratio = clamp(Number(enemy.health || 0) / Math.max(1, Number(enemy.maxHealth || 1)), 0, 1);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.82)';
      ctx.fillRect(enemy.x - width / 2, enemy.y - 43, width, 7);
      ctx.fillStyle = ratio > 0.35 ? '#ff4f78' : '#ffb347';
      ctx.fillRect(enemy.x - width / 2 + 1, enemy.y - 42, (width - 2) * ratio, 5);
      ctx.fillStyle = '#ffd8e2';
      ctx.font = '700 14px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(enemy.type || 'enemy').replace(/_/g, ' ').toUpperCase(), enemy.x, enemy.y - 49);
      ctx.restore();
    }

    _drawProjectile(projectile) {
      if (typeof this.neo.drawProjectileShape === 'function' && typeof this.neo.getProjectileVisual === 'function') {
        const history = this.projectileTrails.get(projectile.id) || [];
        const last = history[0];
        if (!last || Math.hypot(Number(last.x) - Number(projectile.x), Number(last.y) - Number(projectile.y)) > 2) {
          history.unshift({ x: Number(projectile.x), y: Number(projectile.y) });
          if (history.length > 6) history.length = 6;
          this.projectileTrails.set(projectile.id, history);
        }
        const presentation = {
          ...projectile,
          kind: projectile.kind || projectile.type,
          r: Number(projectile.radius || 5),
          enemy: !!projectile.hostile,
          trail: history.slice(1),
        };
        this.neo.drawProjectileShape(presentation, this.neo.getProjectileVisual(presentation));
        return;
      }
      const ctx = this.ctx;
      const angle = Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 0));
      const color = deriveProjectileColor(projectile, this.neo);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(projectile.x - Math.cos(angle) * 24, projectile.y - Math.sin(angle) * 24);
      ctx.lineTo(projectile.x, projectile.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = projectile.hostile ? color : '#ffffff';
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, Number(projectile.radius || 8), 0, Math.PI * 2);
      ctx.fill();
      if (projectile.type === 'metao_fire_staff') {
        ctx.strokeStyle = '#ffe5a3';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, Number(projectile.radius || 8) + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawPickup(pickup, now) {
      const ctx = this.ctx;
      const y = Number(pickup.y || 0) + Math.sin(now / 130) * 5;
      ctx.save();
      ctx.fillStyle = '#ffd23f';
      ctx.strokeStyle = '#fff2a8';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffd23f';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(Number(pickup.x || 0), y, Number(pickup.radius || 13), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#6f4d00';
      ctx.font = '700 17px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('$', Number(pickup.x || 0), y + 5);
      ctx.restore();
    }

    _drawInteractable(interactable, now) {
      const ctx = this.ctx;
      const radius = Number(interactable.radius || 30);
      const pulse = 1 + Math.sin(now / 180) * 0.08;
      const progress = clamp(Number(interactable.dwellProgress || 0), 0, 1);
      ctx.save();
      ctx.translate(Number(interactable.x || 0), Number(interactable.y || 0));
      ctx.scale(pulse, pulse);
      const chest = interactable.kind === 'relic_chest';
      ctx.fillStyle = chest ? 'rgba(186,124,255,.3)' : interactable.final ? 'rgba(255,92,125,.32)' : 'rgba(255,224,105,.28)';
      ctx.strokeStyle = chest ? '#d3a0ff' : interactable.final ? '#ff6b86' : '#ffe469';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(chest ? (interactable.opened ? 'CLAIMED' : 'RELIC • E') : interactable.final ? 'FINISH' : 'DESCEND', 0, 6);
      if (Number(interactable.requiredPlayers || 0) > 1) {
        ctx.font = '700 14px VT323, monospace';
        ctx.fillText(`${Number(interactable.readyPlayers || 0)}/${interactable.requiredPlayers} PARTY`, 0, radius + 29);
      }
      ctx.restore();
    }

    _drawCombatEffects(players, enemies, now) {
      const ctx = this.ctx;
      this.combatEffects = this.combatEffects.filter(effect => now - effect.startedAt < 700);
      this.combatEffects.forEach(effect => {
        const age = now - effect.startedAt;
        const data = effect.data || {};
        const entity = enemies[data.enemyId] || players[data.playerId];
        if (effect.eventType === 'PLAYER_ATTACKED') {
          const player = players[data.playerId];
          if (!player || age > 320) return;
          const alpha = clamp(1 - age / 320, 0, 1);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = data.color || '#ffffff';
          ctx.fillStyle = data.color || '#ffffff';
          ctx.shadowColor = data.color || '#ffffff';
          ctx.shadowBlur = 18;
          if (data.attackMode === 'smite') {
            ctx.lineWidth = 6;
            (data.segments || []).forEach(segment => {
              ctx.beginPath();
              ctx.moveTo(segment.fromX, segment.fromY);
              ctx.lineTo(segment.toX, segment.toY);
              ctx.stroke();
            });
          } else if (data.attackMode === 'projectile') {
            ctx.beginPath();
            const originX = Number.isFinite(Number(data.originX)) ? Number(data.originX) : Number(player.x);
            const originY = Number.isFinite(Number(data.originY)) ? Number(data.originY) : Number(player.y);
            ctx.arc(originX + Math.cos(Number(data.aimDirection || 0)) * 32,
              originY + Math.sin(Number(data.aimDirection || 0)) * 32, 13 + age * 0.03, 0, Math.PI * 2);
            ctx.stroke();
          } else if (data.attackMode === 'sweep' || data.attackMode === 'double_sweep') {
            const originX = Number.isFinite(Number(data.originX)) ? Number(data.originX) : Number(player.x);
            const originY = Number.isFinite(Number(data.originY)) ? Number(data.originY) : Number(player.y);
            const angle = Number(data.aimDirection || 0);
            const arc = Math.max(0.25, Number(data.arc || Math.PI * 0.7));
            ctx.lineWidth = data.attackMode === 'double_sweep' ? 9 : 7;
            ctx.beginPath();
            ctx.arc(originX, originY, Math.max(45, Number(data.range || 100)), angle - arc, angle + arc);
            ctx.stroke();
          }
          ctx.restore();
        } else if (effect.eventType === 'ENEMY_TELEGRAPH') {
          const enemy = enemies[data.enemyId];
          const player = players[data.targetPlayerId];
          if (!enemy || !player || age > 450) return;
          ctx.save();
          ctx.globalAlpha = clamp(0.9 - age / 700, 0, 0.9);
          ctx.strokeStyle = '#ffb347';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          ctx.moveTo(enemy.x, enemy.y);
          ctx.lineTo(player.x, player.y);
          ctx.stroke();
          ctx.restore();
        } else if (effect.eventType === 'ROOM_CLEARED') {
          ctx.save();
          ctx.globalAlpha = clamp(1 - age / 700, 0, 1);
          ctx.fillStyle = '#ffe978';
          ctx.font = '700 30px VT323, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('ROOM CLEARED', 450, 210 - age * 0.025);
          ctx.restore();
        } else if (entity && ['ENEMY_HIT', 'PLAYER_HIT'].includes(effect.eventType)) {
          ctx.save();
          ctx.globalAlpha = clamp(1 - age / 700, 0, 1);
          ctx.fillStyle = effect.eventType === 'PLAYER_HIT' ? '#ff6b75' : data.attackKind === 'bleed' ? '#ff536d' : '#ffffff';
          ctx.font = '700 24px VT323, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`-${Number(data.damage || 0)}`, entity.x, entity.y - 48 - age * 0.035);
          ctx.restore();
        }
      });
    }

    _drawPlayer(player, isLocal) {
      const ctx = this.ctx;
      const color = player.color || derivePlayerColor(player);
      ctx.save();
      ctx.globalAlpha = player.downed ? 0.48 : 1;
      ctx.strokeStyle = isLocal ? '#ffffff' : color;
      ctx.lineWidth = isLocal ? 4 : 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = isLocal ? 18 : 9;
      ctx.beginPath();
      ctx.arc(player.x, player.y, Number(player.radius || 18) + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (player.downed) {
        ctx.save();
        ctx.fillStyle = '#ff7890';
        ctx.font = '700 18px VT323, monospace';
        ctx.textAlign = 'center';
        const label = this.currentSample?.state?.matchRules?.mode === 'rival' ? 'RESPAWNING' : 'DOWN — STAND CLOSE TO REVIVE';
        ctx.fillText(label, player.x, player.y - 52);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(player.x, player.y, Number(player.radius || 18) + 14, -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * clamp(Number(player.reviveProgress || 0), 0, 1));
        ctx.stroke();
        ctx.restore();
      }

      const serverTick = this.currentSample?.state?.tick || 0;
      const presentationNow = root.performance?.now?.() || Date.now();
      const authoritativeActionEvent = this.combatEffects.some(effect => (
        effect.data?.playerId === player.id
        && ['PLAYER_ATTACKED', 'PLAYER_ATTACK_FOLLOWUP', 'PLAYER_ABILITY_USED'].includes(effect.eventType)
        && presentationNow - Number(effect.startedAt || 0) <= 220
      ));
      const attacking = authoritativeActionEvent
        || (player.action !== 'idle' && serverTick - Number(player.actionTick || 0) <= 4);
      if (typeof this.neo.drawPlayerSlot === 'function') {
        const activeSeconds = Number(this.neo.ATTACKS?.melee?.active || 0.17);
        const elapsed = Math.max(0, serverTick - Number(player.actionTick || 0)) / 20;
        const actor = {
          ...player,
          r: Number(player.radius || 18),
          inv: 0,
          swing: attacking ? Math.max(0.001, activeSeconds - elapsed) : 0,
          swingA: Number(player.aimDirection || 0),
          swingFacing: Math.cos(Number(player.aimDirection || 0)) < 0 ? -1 : 1,
          stabSwing: player.actionMode === 'smite' || player.equippedWeapon === 'gelleh_lightning_spear',
        };
        this.neo.drawPlayerSlot({
          getEntity: () => actor,
          getCharacter: () => player.characterKey || 'thorn_knight',
          color,
          label: `${player.displayName || player.id}${isLocal ? ' (YOU)' : ''}`,
        });
      } else if (typeof this.neo.drawSpriteFrame === 'function') {
        this.neo.drawSpriteFrame(player.characterKey || 'thorn_knight', player.x, player.y, attacking ? 66 : 58, {
          flipX: Number(player.vx || 0) < 0,
          shadowColor: color,
          shadowBlur: 10,
        });
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(player.x, player.y, Number(player.radius || 18), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      const healthRatio = clamp(Number(player.health ?? 100) / Math.max(1, Number(player.maxHealth || 100)), 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.8)';
      ctx.fillRect(player.x - 28, player.y + 34, 56, 6);
      ctx.fillStyle = healthRatio > 0.3 ? '#70e68f' : '#ff5d6f';
      ctx.fillRect(player.x - 27, player.y + 35, 54 * healthRatio, 4);
      ctx.restore();
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
