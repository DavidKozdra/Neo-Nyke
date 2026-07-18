(function initializeNetworkGameView(root, factory) {
  const api = factory(root);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.rendering = namespace.rendering || {};
  Object.assign(namespace.rendering, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNetworkGameViewApi(root) {
  'use strict';

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
      this.unsubscribe = null;
      this.inputTimer = null;
      this.animationFrame = null;
      this.lastRoomCode = '';
      this.lastTransitionSequence = 0;
      this.transitionFlashUntil = 0;
      this.seenGameplayEvents = new Set();
      this.combatEffects = [];
      this.projectileTrails = new Map();
      this.presentationRooms = new Map();
      this.localAttackUntil = 0;
      this.gamepadAttackPressed = false;
      this.camera = { x: 0, y: 0, roomId: null };
      this.lastPresentationFrameAt = 0;
      this.lastWorldTransform = null;
      this.paused = false;
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
        this.render();
        this.animationFrame = root.requestAnimationFrame?.(this.boundRenderFrame) ?? null;
      };
    }

    start() {
      if (this.active) return;
      if (!this.canvas || !this.ctx) throw new Error('NetworkGameView requires the Neo Nyke canvas');
      this.active = true;
      this.document?.getElementById('start')?.classList.add('hidden');
      this.document?.getElementById('multiplayerGameHud')?.classList.add('hidden');
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
      this.document?.getElementById('multiplayerGameHud')?.classList.add('hidden');
      this._togglePause(false);
      this._setCampaignHudVisible(false);
      this.document?.getElementById('start')?.classList.remove('hidden');
      root.document?.body?.classList.remove('network-multiplayer-active');
    }

    _setCampaignHudVisible(visible) {
      ['hud', 'coinDisplay', 'centerDisplay', 'actionBar'].forEach(id => {
        const element = this.document?.getElementById(id);
        element?.classList.toggle('hidden', !visible);
        element?.setAttribute('aria-hidden', visible ? 'false' : 'true');
      });
    }

    _onSnapshot(snapshot = {}) {
      this.lastRoomCode = snapshot.roomCode || this.lastRoomCode;
      const state = snapshot.gameState;
      this._consumeGameplayEvents(snapshot.gameplayEvents || []);
      if (!state || !state.players) return;
      const receivedAt = root.performance?.now?.() || Date.now();
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
      this.localAttackUntil = (root.performance?.now?.() || Date.now()) + 150;
      if (this.localPredictedPlayer) {
        this.localPredictedPlayer.action = 'attack';
        this.localPredictedPlayer.actionTick = this.currentSample?.state?.tick || 0;
        this.localPredictedPlayer.aimDirection = this.aimDirection;
      }
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
      if (player) {
        player.action = slot === 'dash' ? 'dash' : 'ability';
        player.actionMode = slot;
        player.actionKind = abilityId;
        player.actionTick = this.currentSample?.state?.tick || 0;
        player.aimDirection = this.aimDirection;
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
          const slot = event.data?.slot;
          this.neo.playSfx?.(slot === 'dash' ? 'dash' : slot === 'smash' ? 'aoe' : 'lazer_blast');
        }
        this._spawnGameplayEventEffect(event);
        if (['PLAYER_ATTACKED', 'PLAYER_ATTACK_FOLLOWUP', 'PLAYER_ABILITY_USED', 'ENEMY_ATTACKED', 'ENEMY_TELEGRAPH', 'ENEMY_HIT', 'ENEMY_DEFEATED', 'PLAYER_HIT', 'PICKUP_COLLECTED', 'ROOM_CLEARED'].includes(event.eventType)) {
          this.combatEffects.push({ ...event, startedAt: now });
        }
      });
      this.combatEffects = this.combatEffects.filter(effect => now - effect.startedAt < 700);
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
        const color = event.data?.slot === 'dash' ? '#8fdcff' : event.data?.slot === 'smash' ? '#ffb36b' : '#d89bff';
        this.neo.ringBurst?.(entity.x, entity.y, event.data?.slot === 'smash' ? 34 : 18, color, 0.42);
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
      return normalizeMovement(moveX, moveY);
    }

    _sendInput() {
      if (!this.active || this.session.snapshot().status !== 'running') return;
      const movement = this.paused ? { moveX: 0, moveY: 0 } : this._readMovement();
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

    render() {
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

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#02030a';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.translate(transform.offsetX, transform.offsetY);
      ctx.scale(transform.scale, transform.scale);
      this._syncNeoPresentationFloor(floorState, enemies, pickups, state);
      if (typeof this.neo.drawFloor === 'function') {
        this.neo.drawFloor();
        this.neo.drawRoomDecor?.();
      } else {
        this._drawRoom(floorState);
      }
      if (typeof this.neo.drawPickups === 'function') this.neo.drawPickups();
      else Object.values(pickups).filter(entity => entity.roomId === floorState.currentRoomId)
        .forEach(entity => this._drawPickup(entity, now));
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
      this.neo.updateParticles?.(frameDelta);
      if (typeof this.neo.drawParticles === 'function') this.neo.drawParticles();
      else this._drawCombatEffects(visiblePlayers, enemies, now);
      this._drawAbilityEffects(visiblePlayers, now);
      ctx.restore();
      if (typeof this.neo.drawMinimap === 'function') this.neo.drawMinimap();
      else this._drawMinimap(floorState, visibleBounds);
      this._drawInstructions(visibleBounds);
      this._drawRoomTransition(now, floorState, visibleBounds);
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
          cleared: floorState.encounters?.[source.id]?.status === 'cleared',
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
            stun: 0,
            swingTime: enemy.state === 'attacking' ? 0.2 : 0,
            windup: enemy.state === 'aiming' ? 0.35 : 0,
            beamAngle: Number(enemy.aimDirection || enemy.beamAngle || 0),
          };
          this.neo.ensureStatuses?.(adapted);
          return adapted;
        });
      this.neo.pickups = Object.values(pickups || {})
        .filter(pickup => pickup.roomId === floorState.currentRoomId)
        .map(pickup => ({ ...pickup, value: Number(pickup.amount || pickup.value || 1), r: Number(pickup.radius || 13) }));
      this.neo.hazards = [];
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
      const color = projectile.color || '#9de9ff';
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
            ctx.arc(player.x + Math.cos(Number(data.aimDirection || 0)) * 32,
              player.y + Math.sin(Number(data.aimDirection || 0)) * 32, 13 + age * 0.03, 0, Math.PI * 2);
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

    _drawAbilityEffects(players, now) {
      const ctx = this.ctx;
      this.combatEffects.forEach(effect => {
        if (effect.eventType !== 'PLAYER_ABILITY_USED') return;
        const age = now - effect.startedAt;
        if (age > 520) return;
        const data = effect.data || {};
        const player = players[data.playerId];
        if (!player) return;
        const alpha = clamp(1 - age / 520, 0, 1);
        const angle = Number(data.aimDirection || 0);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 18;
        if (data.mode === 'beam' || data.mode === 'cross') {
          ctx.strokeStyle = data.abilityId === 'love_beam' ? '#ff9de8' : '#b99cff';
          ctx.shadowColor = ctx.strokeStyle;
          ctx.lineWidth = data.abilityId === 'turtle_wave' || data.abilityId === 'wizard_lazer' ? 22 : 9;
          ctx.beginPath();
          if (data.mode === 'cross') {
            ctx.moveTo(28, player.y); ctx.lineTo(872, player.y);
            ctx.moveTo(player.x, 28); ctx.lineTo(player.x, 672);
          } else {
            ctx.moveTo(player.x, player.y);
            ctx.lineTo(player.x + Math.cos(angle) * 470, player.y + Math.sin(angle) * 470);
          }
          ctx.stroke();
        } else if (data.mode === 'aoe' || data.mode === 'support') {
          ctx.strokeStyle = data.mode === 'support' ? '#78f0bc' : '#ffb36b';
          ctx.shadowColor = ctx.strokeStyle;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(player.x, player.y, 55 + age * 0.24, 0, Math.PI * 2);
          ctx.stroke();
        } else if (data.slot === 'dash') {
          ctx.strokeStyle = '#8fdcff';
          ctx.shadowColor = '#8fdcff';
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.moveTo(player.x - Math.cos(angle) * 120, player.y - Math.sin(angle) * 120);
          ctx.lineTo(player.x, player.y);
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    _drawPlayer(player, isLocal) {
      const ctx = this.ctx;
      const color = player.color || '#9de9ff';
      ctx.save();
      ctx.strokeStyle = isLocal ? '#ffffff' : color;
      ctx.lineWidth = isLocal ? 4 : 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = isLocal ? 18 : 9;
      ctx.beginPath();
      ctx.arc(player.x, player.y, Number(player.radius || 18) + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const serverTick = this.currentSample?.state?.tick || 0;
      const attacking = (isLocal && (root.performance?.now?.() || Date.now()) < this.localAttackUntil)
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

    _drawMinimap(floorState, visibleBounds = { right: this.canvas.width, top: 0 }) {
      const rooms = floorState.layout?.rooms || [];
      if (!rooms.length) return;
      const ctx = this.ctx;
      const size = 13;
      const left = visibleBounds.right - 142;
      const top = visibleBounds.top + 52;
      ctx.save();
      ctx.fillStyle = 'rgba(2, 4, 10, .78)';
      ctx.fillRect(left - 12, top - 26, 126, 142);
      ctx.fillStyle = '#dceaff';
      ctx.font = '700 13px VT323, monospace';
      ctx.fillText(`FLOOR ${floorState.layout.floorNumber || 1}`, left, top - 9);
      const visited = new Set(floorState.visitedRoomIds || []);
      rooms.forEach(room => {
        const colors = { start: '#68dcff', ladder: '#ffe378', boss: '#ff6b75', god: '#ff6b75', treasure: '#d8a3ff', shop: '#75e6a0' };
        ctx.fillStyle = room.id === floorState.currentRoomId
          ? '#ffffff'
          : visited.has(room.id) ? (colors[room.type] || '#71819c') : '#242a38';
        ctx.fillRect(left + room.gx * size, top + room.gy * size, size - 2, size - 2);
      });
      ctx.restore();
    }

    _drawInstructions(visibleBounds = { left: 0, right: this.canvas.width, bottom: this.canvas.height }) {
      const ctx = this.ctx;
      const centerX = (visibleBounds.left + visibleBounds.right) / 2;
      const baselineY = visibleBounds.bottom - 20;
      ctx.save();
      ctx.fillStyle = 'rgba(2, 4, 10, .76)';
      ctx.fillRect(centerX - 265, baselineY - 19, 530, 27);
      ctx.fillStyle = '#dceaff';
      ctx.font = '700 15px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MOVE  WASD / ARROWS   •   AIM  MOUSE   •   ATTACK  CLICK / SPACE / GAMEPAD A', centerX, baselineY);
      ctx.restore();
    }

    _drawRoomTransition(now, floorState, visibleBounds = { left: 0, top: 0, right: this.canvas.width, bottom: this.canvas.height }) {
      if (now >= this.transitionFlashUntil) return;
      const remaining = clamp((this.transitionFlashUntil - now) / 260, 0, 1);
      const currentRoom = floorState.layout?.rooms?.find(room => room.id === floorState.currentRoomId);
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = `rgba(3, 5, 12, ${remaining * 0.72})`;
      ctx.fillRect(visibleBounds.left, visibleBounds.top, visibleBounds.right - visibleBounds.left, visibleBounds.bottom - visibleBounds.top);
      ctx.globalAlpha = clamp(1 - Math.abs(remaining - 0.5) * 1.4, 0, 1);
      ctx.fillStyle = '#e9f5ff';
      ctx.font = '700 28px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        String(currentRoom?.type || 'ROOM').replace(/_/g, ' ').toUpperCase(),
        (visibleBounds.left + visibleBounds.right) / 2,
        (visibleBounds.top + visibleBounds.bottom) / 2,
      );
      ctx.restore();
    }

    _updateHud(state, players) {
      const setText = (id, value) => {
        const element = this.document?.getElementById(id);
        if (element) element.textContent = String(value);
      };
      setText('multiplayerGameRoom', this.lastRoomCode || '—');
      setText('multiplayerGameTick', state?.tick ?? 0);
      setText('multiplayerGamePlayers', Object.keys(players).length);
      setText('multiplayerGameEnemies', Object.values(state?.enemies || {}).filter(enemy => !enemy.dead).length);
      const localPlayer = players[this.session.snapshot().playerId];
      setText('multiplayerGameGold', localPlayer?.gold ?? 0);
      if (!localPlayer || !state) return;
      this._setCampaignHudVisible(true);
      setText('coinCount', localPlayer.gold ?? 0);
      setText('timerDisplay', this._formatTime(state.elapsedSeconds));
      setText('floorDisplay', state.floorNumber || state.floorState?.layout?.floorNumber || 1);
      const ticksRemaining = Math.max(0, Number(localPlayer.attackCooldownUntilTick || 0) - Number(state.tick || 0));
      const meleeCurrent = ticksRemaining / 20;
      const weaponStats = root.NeoNyke?.content?.WEAPON_BASE_STATS?.[localPlayer.equippedWeapon] || {};
      const meleeMaximum = Math.max(0.05, Number(weaponStats.cooldown || 0.5));
      const characterDef = this.neo.CHARACTER_DEFS?.[localPlayer.characterKey] || {};
      const equippedMoves = localPlayer.equippedMoves || {};
      const cooldownFor = slot => Math.max(0, Number(localPlayer.moveCooldownUntilTick?.[equippedMoves[slot]] || 0) - Number(state.tick || 0)) / 20;
      const maximumFor = slot => Math.max(0.05, Number(root.NeoNyke?.content?.MOVE_BASE_STATS?.[equippedMoves[slot]]?.cooldown || 1));
      const laserCurrent = cooldownFor('laser');
      const smashCurrent = cooldownFor('smash');
      const dashCurrent = cooldownFor('dash');
      this.neo.uiController?.setHudValues?.({
        floor: state.floorNumber || 1,
        level: Number(localPlayer.level || 1),
        xpText: `${Number(localPlayer.xp || 0)}/${Number(localPlayer.xpToNext || 20)}`,
        coins: Number(localPlayer.gold || 0),
        character: String(characterDef.name || localPlayer.characterKey || 'HERO').toUpperCase(),
        hp: Number(localPlayer.health || 0),
        maxHp: Math.max(1, Number(localPlayer.maxHealth || 1)),
        meleeCd: meleeCurrent,
        laserCd: laserCurrent,
        smashCd: smashCurrent,
        dashCd: dashCurrent,
        gameTime: this._formatTime(state.elapsedSeconds),
        difficultyName: 'CO-OP',
        itemRarityCounts: { white: 0, purple: 0, red: 0, blue: 0, green: 0 },
        skills: {
          melee: { current: meleeCurrent, max: meleeMaximum, active: localPlayer.action === 'attack', charges: meleeCurrent > 0 ? 0 : 1, maxCharges: 1, timers: meleeCurrent > 0 ? [meleeCurrent] : [] },
          laser: { current: laserCurrent, max: maximumFor('laser'), active: localPlayer.actionMode === 'laser', charges: laserCurrent > 0 ? 0 : 1, maxCharges: 1, timers: laserCurrent > 0 ? [laserCurrent] : [] },
          smash: { current: smashCurrent, max: maximumFor('smash'), active: localPlayer.actionMode === 'smash', charges: smashCurrent > 0 ? 0 : 1, maxCharges: 1, timers: smashCurrent > 0 ? [smashCurrent] : [] },
          dash: { current: dashCurrent, max: maximumFor('dash'), active: localPlayer.actionMode === 'dash', charges: dashCurrent > 0 ? 0 : 1, maxCharges: 1, timers: dashCurrent > 0 ? [dashCurrent] : [] },
        },
      });
      if (this.neo.ui?.skillNames?.melee) {
        const weaponName = this.neo.WEAPON_DEFS?.[localPlayer.equippedWeapon]?.name || localPlayer.equippedWeapon || 'Attack';
        this.neo.ui.skillNames.melee.textContent = weaponName;
      }
      ['laser', 'smash', 'dash'].forEach(slot => {
        if (!this.neo.ui?.skillNames?.[slot]) return;
        this.neo.ui.skillNames[slot].textContent = this.neo.MOVE_DEFS?.[equippedMoves[slot]]?.name || equippedMoves[slot] || slot;
      });
    }

    _formatTime(secondsValue) {
      const total = Math.max(0, Math.floor(Number(secondsValue || 0)));
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }
  }

  return {
    INPUT_INTERVAL_MS,
    INTERPOLATION_DELAY_MS,
    normalizeMovement,
    computeWorldTransform,
    computeCameraTransform,
    interpolatePlayers,
    predictPosition,
    NetworkGameView,
  };
});
