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
      this.boundKeyDown = event => this._onKey(event, true);
      this.boundKeyUp = event => this._onKey(event, false);
      this.boundPointerMove = event => this._onPointerMove(event);
      this.boundBlur = () => this.keys.clear();
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
      this.document?.getElementById('multiplayerGameHud')?.classList.remove('hidden');
      root.document?.body?.classList.add('network-multiplayer-active');
      root.addEventListener?.('keydown', this.boundKeyDown);
      root.addEventListener?.('keyup', this.boundKeyUp);
      root.addEventListener?.('pointermove', this.boundPointerMove);
      root.addEventListener?.('blur', this.boundBlur);
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
      root.removeEventListener?.('blur', this.boundBlur);
      this.keys.clear();
      this.document?.getElementById('multiplayerGameHud')?.classList.add('hidden');
      this.document?.getElementById('start')?.classList.remove('hidden');
      root.document?.body?.classList.remove('network-multiplayer-active');
    }

    _onSnapshot(snapshot = {}) {
      this.lastRoomCode = snapshot.roomCode || this.lastRoomCode;
      const state = snapshot.gameState;
      if (!state || !state.players) return;
      const receivedAt = root.performance?.now?.() || Date.now();
      const transitionSequence = Math.max(0, Number(state.floorState?.transitionSequence) || 0);
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
      if (!this.active || !MOVEMENT_KEYS.has(event.code)) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      if (pressed) this.keys.add(event.code);
      else this.keys.delete(event.code);
    }

    _onPointerMove(event) {
      if (!this.active || !this.localPredictedPlayer || !this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const floorState = this.currentSample?.state?.floorState || {};
      const transform = computeWorldTransform(
        this.canvas.width,
        this.canvas.height,
        floorState.width,
        floorState.height,
        this._visibleCanvasBounds(),
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
      }
      return normalizeMovement(moveX, moveY);
    }

    _sendInput() {
      if (!this.active || this.session.snapshot().status !== 'running') return;
      const movement = this._readMovement();
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

    _visibleCanvasBounds() {
      const rect = this.canvas?.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return { left: 0, top: 0, right: this.canvas.width, bottom: this.canvas.height };
      }
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        left: clamp(-rect.left * scaleX, 0, this.canvas.width),
        top: clamp(-rect.top * scaleY, 0, this.canvas.height),
        right: clamp((root.innerWidth - rect.left) * scaleX, 0, this.canvas.width),
        bottom: clamp((root.innerHeight - rect.top) * scaleY, 0, this.canvas.height),
      };
    }

    render() {
      if (!this.active || !this.ctx || !this.canvas) return;
      const now = root.performance?.now?.() || Date.now();
      const state = this.currentSample?.state;
      const floorState = state?.floorState || { width: 900, height: 700, wallThickness: 28, doorWidth: 140 };
      const visibleBounds = this._visibleCanvasBounds();
      const transform = computeWorldTransform(
        this.canvas.width,
        this.canvas.height,
        floorState.width,
        floorState.height,
        visibleBounds,
      );
      const players = this._renderedPlayers(now);
      this.lastRenderedPlayerCount = Object.keys(players).length;
      const ctx = this.ctx;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#02030a';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.translate(transform.offsetX, transform.offsetY);
      ctx.scale(transform.scale, transform.scale);
      this._drawRoom(floorState);
      Object.values(players).forEach(player => this._drawPlayer(player, player.id === this.session.snapshot().playerId));
      ctx.restore();
      this._drawMinimap(floorState, visibleBounds);
      this._drawInstructions(visibleBounds);
      this._drawRoomTransition(now, floorState, visibleBounds);
      this._updateHud(state, players);
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

      if (typeof this.neo.drawSpriteFrame === 'function') {
        this.neo.drawSpriteFrame(player.characterKey || 'thorn_knight', player.x, player.y, 58, {
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
      ctx.fillStyle = isLocal ? '#ffffff' : color;
      ctx.font = '700 16px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 5;
      ctx.fillText(`${player.displayName || player.id}${isLocal ? ' (YOU)' : ''}`, player.x, player.y - 38);
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
      ctx.fillRect(centerX - 190, baselineY - 19, 380, 27);
      ctx.fillStyle = '#dceaff';
      ctx.font = '700 15px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MOVE  WASD / ARROWS / GAMEPAD   •   AIM  MOUSE / RIGHT STICK', centerX, baselineY);
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
    }
  }

  return {
    INPUT_INTERVAL_MS,
    INTERPOLATION_DELAY_MS,
    normalizeMovement,
    computeWorldTransform,
    interpolatePlayers,
    predictPosition,
    NetworkGameView,
  };
});
