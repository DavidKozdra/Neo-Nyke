// environment.js — standalone IIFE. Room environment drawing.
  function draw() {
    const isDying = Neo.gameState === 'dying';
    const isPlayLike = Neo.gameState === 'play' || Neo.gameState === 'pause' || Neo.gameState === 'dialogue' || isDying;
    Neo._lightsFrame = (Neo._lightsFrame || 0) + 1;
    let sectionPerfStart = Neo.perfStart();
    Neo.ctx.clearRect(0, 0, Neo.canvas.width, Neo.canvas.height);
    if (isPlayLike) {
      const split = Neo.isSplitScreen();
      if (split) {
        const slots = Neo.getActivePlayerSlots();
        const sc = slots.length;
        const vpW = Math.floor(Neo.canvas.width / 2);
        const vpH = sc >= 3 ? Math.floor(Neo.canvas.height / 2) : Neo.canvas.height;
        slots.forEach((slot, index) => {
          const col = index % 2;
          const row = sc >= 3 ? Math.floor(index / 2) : 0;
          Neo.drawWorldViewport(slot.getCamera(), col * vpW, vpW, vpH, row * vpH, slot.label, slot);
        });
        // Dividers
        Neo.ctx.save();
        Neo.ctx.fillStyle = '#000';
        Neo.ctx.fillRect(vpW - 1, 0, 2, Neo.canvas.height);
        if (sc >= 3) Neo.ctx.fillRect(0, vpH - 1, Neo.canvas.width, 2);
        Neo.ctx.restore();
      } else {
        Neo.drawWorldViewport(Neo.camera, 0, Neo.canvas.width, Neo.canvas.height, 0, null);
      }
      Neo.perfEnd('draw.room', sectionPerfStart);
    }

    sectionPerfStart = Neo.perfStart();
    // The minimap can be hidden via the HUD Layout editor (HUD settings tab).
    const minimapHidden = window.NeoSettings?.getHudElements?.()?.minimap?.visible === false;
    if (isPlayLike && !isDying && !minimapHidden) {
      const minimapLayout = Neo.drawMinimap();
      Neo.uiController.setObjectiveLayout(minimapLayout?.viewportBounds || null);
    } else {
      Neo.minimapLayoutState = null;
      Neo.uiController.setObjectiveLayout(null);
    }
    Neo.perfEnd('draw.minimap', sectionPerfStart);

    sectionPerfStart = Neo.perfStart();
    if (Neo.fade > 0) {
      Neo.ctx.fillStyle = `rgba(0,0,0,${Neo.fade})`;
      Neo.ctx.fillRect(0, 0, Neo.canvas.width, Neo.canvas.height);
    }

    if (!isDying) drawLowHealthEdgeGlow();
    if (isDying && Neo.playerDeathAnim) Neo.drawDeathOverlay(Neo.playerDeathAnim);
    if (!isDying && Neo.godTimer > 0) Neo.drawGodModeBar();
    const bossBarHidden = window.NeoSettings?.getHudElements?.()?.bossbar?.visible === false;
    if (!isDying && !bossBarHidden) Neo.drawBossHealthBars();
    Neo.drawFloorTransition();
    Neo.perfEnd('draw.overlays', sectionPerfStart);
  }

  // Cached low-health edge gradient, rebuilt only when the canvas size changes.
  // Color stops carry their relative weights at full opacity; the caller applies
  // the per-frame alpha via ctx.globalAlpha.
  let _lowHpGradient = null;
  let _lowHpGradientW = -1;
  let _lowHpGradientH = -1;
  function getLowHealthEdgeGradient() {
    const w = Neo.canvas.width;
    const h = Neo.canvas.height;
    if (_lowHpGradient && _lowHpGradientW === w && _lowHpGradientH === h) return _lowHpGradient;
    const grad = Neo.ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.34,
      w / 2, h / 2, Math.max(w, h) * 0.72,
    );
    grad.addColorStop(0, 'rgba(255,0,0,0)');
    grad.addColorStop(0.62, 'rgba(190,0,18,0.42)');
    grad.addColorStop(1, 'rgba(255,0,22,1)');
    _lowHpGradient = grad;
    _lowHpGradientW = w;
    _lowHpGradientH = h;
    return grad;
  }

  function drawLowHealthEdgeGlow() {
    if (!Neo.player || Neo.gameState !== 'play' || !Number.isFinite(Neo.player.hp) || !Number.isFinite(Neo.player.maxHp) || Neo.player.maxHp <= 0) return;
    const access = window.NeoSettings?.getAccess() || {};
    const now = Date.now();
    const hpRatio = Neo.clamp(Neo.player.hp / Neo.player.maxHp, 0, 1);
    const hitFlashActive = Neo.lowHealthHitFlashUntil > now;
    // With reduceFlash: skip the hit-flash-at-healthy-HP effect entirely; static glow only.
    const isForcedHitFlash = !access.reduceFlash && hitFlashActive && hpRatio >= 0.2;
    const effectiveHpRatio = isForcedHitFlash ? 0.17 : hpRatio;
    if (effectiveHpRatio >= 0.2) return;

    const danger = (0.2 - effectiveHpRatio) / 0.2;
    // With reduceFlash: no sine pulse — use a stable alpha
    const pulse = access.reduceFlash ? 0.82 : (0.74 + Math.sin(now / 120) * 0.18);
    const baseAlpha = Neo.clamp((0.16 + danger * 0.34) * pulse, 0, 0.52);
    const alpha = isForcedHitFlash ? baseAlpha * 0.45 : baseAlpha;
    const baseEdge = Math.max(92, Math.min(Neo.canvas.width, Neo.canvas.height) * (0.18 + danger * 0.08));
    const edge = isForcedHitFlash ? baseEdge * 0.78 : baseEdge;

    Neo.ctx.save();
    Neo.ctx.globalCompositeOperation = 'source-over';

    // The gradient geometry depends only on canvas size; only the alpha varies
    // (per-frame pulse). Cache it at full alpha and modulate via globalAlpha so
    // we don't rebuild the gradient + interpolate color-stop strings every frame.
    const center = getLowHealthEdgeGradient();
    Neo.ctx.globalAlpha = alpha;
    Neo.ctx.fillStyle = center;
    Neo.ctx.fillRect(0, 0, Neo.canvas.width, Neo.canvas.height);
    Neo.ctx.globalAlpha = 1;

    Neo.ctx.fillStyle = `rgba(255,24,32,${alpha * 0.55})`;
    Neo.ctx.shadowColor = '#ff1e28';
    Neo.ctx.shadowBlur = 28;
    Neo.ctx.fillRect(0, 0, Neo.canvas.width, edge * 0.24);
    Neo.ctx.fillRect(0, Neo.canvas.height - edge * 0.24, Neo.canvas.width, edge * 0.24);
    Neo.ctx.fillRect(0, 0, edge * 0.18, Neo.canvas.height);
    Neo.ctx.fillRect(Neo.canvas.width - edge * 0.18, 0, edge * 0.18, Neo.canvas.height);

    Neo.ctx.restore();
  }

  function drawLadderPrompt() {
    if (Neo.gameState !== 'play' || !Neo.currentRoom?.cleared) return;
    const ladder = Neo.pickups.find(pickup => pickup?.type === 'ladder');
    if (!ladder) return;
    if (Neo.dist(Neo.player.x, Neo.player.y, ladder.x, ladder.y) > Neo.LADDER_TRIGGER_RADIUS) return;
    const cx = ladder.x;
    const cy = ladder.y - 36;
    Neo.ctx.save();
    Neo.ctx.font = 'bold 14px system-ui';
    Neo.ctx.textAlign = 'center';
    Neo.ctx.textBaseline = 'middle';
    const ladderHint = Neo.getLadderControlHint ? Neo.getLadderControlHint() : Neo.formatControlLabel('e', 'e');
    const text = `Press [${ladderHint}] to go to next floor`;
    const pad = 14;
    const tw = Neo.ctx.measureText(text).width;
    Neo.ctx.fillStyle = 'rgba(10,24,14,0.86)';
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(cx - tw / 2 - pad, cy - 13, tw + pad * 2, 26, 8);
    Neo.ctx.fill();
    Neo.ctx.strokeStyle = 'rgba(125,255,158,0.55)';
    Neo.ctx.lineWidth = 1.5;
    Neo.ctx.stroke();
    Neo.ctx.fillStyle = '#8fffaf';
    Neo.ctx.fillText(text, cx, cy);
    Neo.ctx.restore();
  }

  function drawJesterPortalPrompt() {
    if (Neo.gameState !== 'play') return;
    const portal = Neo.pickups
      .filter(pickup => (
        pickup?.type === 'challengePracticePortal'
        || ((pickup?.type === 'jesterPortal' || pickup?.type === 'adapterPortal') && pickup.active)
      ))
      .sort((a, b) => (
        Neo.dist(Neo.player.x, Neo.player.y, a.x, a.y)
        - Neo.dist(Neo.player.x, Neo.player.y, b.x, b.y)
      ))[0];
    if (!portal) return;
    if (Neo.dist(Neo.player.x, Neo.player.y, portal.x, portal.y) > 74) return;
    const cx = portal.x;
    const cy = portal.y - 38;
    const adapter = portal.type === 'adapterPortal';
    const challengePractice = portal.type === 'challengePracticePortal';
    const text = challengePractice
      ? `Touch to warp to ${portal.destinationLabel || 'challenge'}`
      : adapter
        ? 'Touch to warp to ladder (-50% coins)'
        : `Touch to skip ${Math.max(1, Number(portal.skipFloors || 1))} floors`;
    const stroke = challengePractice
      ? 'rgba(141,255,207,0.62)'
      : adapter ? 'rgba(184,140,255,0.62)' : 'rgba(255,155,228,0.62)';
    const fill = challengePractice ? '#baffdf' : adapter ? '#d6c9ff' : '#ffc9ef';
    Neo.ctx.save();
    Neo.ctx.font = 'bold 14px system-ui';
    Neo.ctx.textAlign = 'center';
    Neo.ctx.textBaseline = 'middle';
    const pad = 14;
    const tw = Neo.ctx.measureText(text).width;
    Neo.ctx.fillStyle = 'rgba(28,11,32,0.86)';
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(cx - tw / 2 - pad, cy - 13, tw + pad * 2, 26, 8);
    Neo.ctx.fill();
    Neo.ctx.strokeStyle = stroke;
    Neo.ctx.lineWidth = 1.5;
    Neo.ctx.stroke();
    Neo.ctx.fillStyle = fill;
    Neo.ctx.fillText(text, cx, cy);
    Neo.ctx.restore();
  }

  function getRoomArtTheme(room = Neo.currentRoom) {
    if (!room) return Neo.ROOM_ART_THEMES.dungeon;
    if (room.type === 'shop') return Neo.ROOM_ART_THEMES.shop;
    if (room.type === 'anvil') return Neo.ROOM_ART_THEMES.anvil;
    if (room.type === 'reliquary') return Neo.ROOM_ART_THEMES.anvil;
    if (room.type === 'portal') return Neo.ROOM_ART_THEMES.secret;
    if (room.type === 'wishing_well') return Neo.ROOM_ART_THEMES.treasure;
    if (room.type === 'shrine' || room.type === 'oracle') return Neo.ROOM_ART_THEMES.god;
    if (room.type === 'god') return Neo.ROOM_ART_THEMES.god;
    if (room.type === 'boss' || Neo.BOSS_TYPES.has(room.type)) return Neo.ROOM_ART_THEMES.boss;
    if (room.type === 'secret') return Neo.ROOM_ART_THEMES.secret;
    if (room.type === 'treasure' || room.type === 'ladder') return Neo.ROOM_ART_THEMES.treasure;
    if (room.type === 'challenge') return Neo.ROOM_ART_THEMES.boss;
    return Neo.ROOM_ART_THEMES.dungeon;
  }

  function artNoise(tileX, tileY, salt = 0, room = Neo.currentRoom) {
    const gx = Number(room?.gx || 0);
    const gy = Number(room?.gy || 0);
    const value = Math.sin(tileX * 127.1 + tileY * 311.7 + gx * 74.7 + gy * 19.3 + Neo.floor * 13.1 + salt * 101.9) * 43758.5453;
    return value - Math.floor(value);
  }

  function pickFloorTile(tileX, tileY, theme) {
    const tiles = theme.floorTiles && theme.floorTiles.length ? theme.floorTiles : ['floor_stone_a'];
    const gardenTiles = theme.gardenFloorTiles && theme.gardenFloorTiles.length ? theme.gardenFloorTiles : tiles;
    const noise = artNoise(tileX, tileY, 1);
    const gardenBias = getGardenTileBias(Neo.currentRoom, theme);
    if (gardenTiles.length && noise < gardenBias) {
      const gardenNoise = artNoise(tileX, tileY, 9);
      return gardenTiles[Math.min(gardenTiles.length - 1, Math.floor(gardenNoise * gardenTiles.length))];
    }
    return tiles[Math.min(tiles.length - 1, Math.floor(noise * tiles.length))];
  }

  function getGardenTileBias(room = Neo.currentRoom, theme = getRoomArtTheme(room)) {
    if (Neo.floor <= 5) return 0;
    let bias = 0.18;
    if (!room) return bias;
    if (room.type === 'secret') bias = 0.58;
    else if (room.type === 'treasure') bias = 0.42;
    else if (room.type === 'shop') bias = 0.34;
    else if (room.type === 'anvil') bias = 0.3;
    else if (room.type === 'combat') bias = 0.26;
    else if (room.type === 'ladder') bias = 0.24;
    else if (room.type === 'boss') bias = 0.16;
    else if (room.type === 'god') bias = 0.12;
    if (theme === Neo.ROOM_ART_THEMES.secret) bias += 0.04;
    return Neo.clamp(bias + Math.min(0.08, Math.max(0, (10 - Neo.floor) * 0.006)), 0.08, 0.72);
  }

  function drawEnvironmentTile(tileKey, x, y, w = Neo.ENV_TILE_SIZE, h = Neo.ENV_TILE_SIZE, options = {}) {
    const target = options.ctx || Neo.ctx;
    const frame = Neo.ENV_TILE_ATLAS.frames[tileKey];
    if (!frame) {
      target.fillStyle = options.fallback || '#30342f';
      target.fillRect(x, y, w, h);
      return;
    }
    target.save();
    target.globalAlpha = options.alpha ?? 1;
    target.imageSmoothingEnabled = false;
    target.drawImage(
      Neo.ENV_TILE_ATLAS.canvas,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      x,
      y,
      w,
      h,
    );
    if (options.tint) {
      target.globalCompositeOperation = 'source-atop';
      target.fillStyle = options.tint;
      target.fillRect(x, y, w, h);
    }
    target.restore();
  }

  function drawTiledRect(tileKey, x, y, w, h, options = {}) {
    if (w <= 0 || h <= 0) return;
    const target = options.ctx || Neo.ctx;
    const tileSize = options.tileSize || Neo.ENV_TILE_SIZE;
    target.save();
    target.beginPath();
    target.rect(x, y, w, h);
    target.clip();
    for (let ty = y; ty < y + h; ty += tileSize) {
      for (let tx = x; tx < x + w; tx += tileSize) {
        drawEnvironmentTile(tileKey, tx, ty, tileSize, tileSize, { ...options, ctx: target });
      }
    }
    target.restore();
  }

  function isStaticRoomLava(hazard) {
    return hazard?.kind === 'lava' && hazard.shape === 'rect' && hazard.ttl === undefined;
  }

  function getStaticRoomLavaHazards(room = Neo.currentRoom) {
    const source = room === Neo.currentRoom && Array.isArray(Neo.hazards)
      ? Neo.hazards
      : room?.hazards;
    return (Array.isArray(source) ? source : []).filter(isStaticRoomLava);
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function getStaticLavaForTile(tileRect, lavaHazards) {
    return lavaHazards.find(hazard => rectsOverlap(tileRect, {
      x: hazard.left,
      y: hazard.top,
      w: hazard.w,
      h: hazard.h,
    })) || null;
  }

  function drawStaticLavaBase(lavaHazards, target = Neo.ctx) {
    if (!lavaHazards.length) return;
    const tile = Neo.ENV_TILE_SIZE;
    target.save();
    lavaHazards.forEach(hazard => {
      target.save();
      target.beginPath();
      target.rect(hazard.left, hazard.top, hazard.w, hazard.h);
      target.clip();
      for (let y = hazard.top; y < hazard.top + hazard.h; y += tile) {
        for (let x = hazard.left; x < hazard.left + hazard.w; x += tile) {
          drawEnvironmentTile('floor_lava', x, y, tile, tile, { ctx: target });
        }
      }
      target.restore();
    });
    target.restore();
  }

  function drawStaticLavaSeams(lavaHazards, target = Neo.ctx) {
    if (!lavaHazards.length) return;
    target.save();
    lavaHazards.forEach(hazard => {
      const left = hazard.left;
      const top = hazard.top;
      const right = left + hazard.w;
      const bottom = top + hazard.h;
      const seam = 5;
      target.fillStyle = 'rgba(41, 10, 4, 0.82)';
      if (top > Neo.WALL) target.fillRect(left, top, hazard.w, seam);
      if (bottom < Neo.ROOM_H - Neo.WALL) target.fillRect(left, bottom - seam, hazard.w, seam);
      if (left > Neo.WALL) target.fillRect(left, top, seam, hazard.h);
      if (right < Neo.ROOM_W - Neo.WALL) target.fillRect(right - seam, top, seam, hazard.h);

      target.fillStyle = 'rgba(255, 132, 48, 0.52)';
      if (top > Neo.WALL) target.fillRect(left + 4, top + seam, Math.max(0, hazard.w - 8), 2);
      if (bottom < Neo.ROOM_H - Neo.WALL) target.fillRect(left + 4, bottom - seam - 2, Math.max(0, hazard.w - 8), 2);
      if (left > Neo.WALL) target.fillRect(left + seam, top + 4, 2, Math.max(0, hazard.h - 8));
      if (right < Neo.ROOM_W - Neo.WALL) target.fillRect(right - seam - 2, top + 4, 2, Math.max(0, hazard.h - 8));

      target.fillStyle = 'rgba(22, 6, 3, 0.9)';
      [
        [left, top, left > Neo.WALL && top > Neo.WALL],
        [right - seam, top, right < Neo.ROOM_W - Neo.WALL && top > Neo.WALL],
        [left, bottom - seam, left > Neo.WALL && bottom < Neo.ROOM_H - Neo.WALL],
        [right - seam, bottom - seam, right < Neo.ROOM_W - Neo.WALL && bottom < Neo.ROOM_H - Neo.WALL],
      ].forEach(([x, y, shouldDraw]) => {
        if (shouldDraw) target.fillRect(x, y, seam, seam);
      });
    });
    target.restore();
  }

  function drawFloorTiles(theme, target = Neo.ctx) {
    const staticLava = getStaticRoomLavaHazards();
    target.save();
    target.beginPath();
    target.rect(Neo.WALL, Neo.WALL, Neo.ROOM_W - Neo.WALL * 2, Neo.ROOM_H - Neo.WALL * 2);
    target.clip();
    for (let y = Neo.WALL; y < Neo.ROOM_H - Neo.WALL; y += Neo.ENV_TILE_SIZE) {
      for (let x = Neo.WALL; x < Neo.ROOM_W - Neo.WALL; x += Neo.ENV_TILE_SIZE) {
        const tileX = Math.floor((x - Neo.WALL) / Neo.ENV_TILE_SIZE);
        const tileY = Math.floor((y - Neo.WALL) / Neo.ENV_TILE_SIZE);
        const tile = pickFloorTile(tileX, tileY, theme);
        drawEnvironmentTile(tile, x, y, Neo.ENV_TILE_SIZE, Neo.ENV_TILE_SIZE, { tint: theme.floorTint, ctx: target });
      }
    }
    drawStaticLavaBase(staticLava, target);
    drawStaticLavaSeams(staticLava, target);
    target.restore();
  }

  function drawFloorDecals(theme, target = Neo.ctx) {
    const staticLava = getStaticRoomLavaHazards();
    target.save();
    target.beginPath();
    target.rect(Neo.WALL + 8, Neo.WALL + 8, Neo.ROOM_W - Neo.WALL * 2 - 16, Neo.ROOM_H - Neo.WALL * 2 - 16);
    target.clip();
    const gardenBias = getGardenTileBias();
    const cols = Math.ceil((Neo.ROOM_W - Neo.WALL * 2) / Neo.ENV_TILE_SIZE);
    const rows = Math.ceil((Neo.ROOM_H - Neo.WALL * 2) / Neo.ENV_TILE_SIZE);
    for (let ty = 0; ty < rows; ty += 1) {
      for (let tx = 0; tx < cols; tx += 1) {
        const x = Neo.WALL + tx * Neo.ENV_TILE_SIZE;
        const y = Neo.WALL + ty * Neo.ENV_TILE_SIZE;
        if (getStaticLavaForTile({ x, y, w: Neo.ENV_TILE_SIZE, h: Neo.ENV_TILE_SIZE }, staticLava)) continue;
        const stainNoise = artNoise(tx, ty, 12);
        if (stainNoise > 0.84) {
          target.fillStyle = theme.stain;
          target.beginPath();
          target.ellipse(
            x + 14 + artNoise(tx, ty, 13) * 20,
            y + 16 + artNoise(tx, ty, 14) * 18,
            8 + artNoise(tx, ty, 15) * 14,
            4 + artNoise(tx, ty, 16) * 8,
            artNoise(tx, ty, 17) * Math.PI,
            0,
            Math.PI * 2,
          );
          target.fill();
        }

        if (artNoise(tx, ty, 22) > 0.78) {
          const sx = x + 8 + artNoise(tx, ty, 23) * 26;
          const sy = y + 8 + artNoise(tx, ty, 24) * 24;
          target.strokeStyle = theme.crack;
          target.lineWidth = 1.4;
          target.beginPath();
          target.moveTo(sx, sy);
          target.lineTo(sx + 8 + artNoise(tx, ty, 25) * 12, sy - 4 + artNoise(tx, ty, 26) * 8);
          target.lineTo(sx + 15 + artNoise(tx, ty, 27) * 14, sy + 4 + artNoise(tx, ty, 28) * 12);
          target.stroke();
        }

        if (gardenBias > 0.12 && artNoise(tx, ty, 31) < gardenBias * 0.4) {
          target.fillStyle = 'rgba(92, 149, 74, 0.24)';
          target.beginPath();
          target.ellipse(
            x + 8 + artNoise(tx, ty, 32) * 24,
            y + 8 + artNoise(tx, ty, 33) * 24,
            5 + artNoise(tx, ty, 34) * 5,
            2 + artNoise(tx, ty, 35) * 3,
            artNoise(tx, ty, 36) * Math.PI,
            0,
            Math.PI * 2,
          );
          target.fill();
          target.fillStyle = 'rgba(156, 218, 122, 0.18)';
          target.fillRect(x + 2 + artNoise(tx, ty, 37) * 10, y + 2 + artNoise(tx, ty, 38) * 10, 2, 2);
        }
      }
    }
    target.restore();
  }

  function drawLockedDoor(dir, target = Neo.ctx) {
    const isNorth = dir === 'n';
    const isSouth = dir === 's';
    const isWest = dir === 'w';

    // Door panel bounds (the opening in the wall)
    let dx, dy, dw, dh;
    if (isNorth) {
      dx = (Neo.ROOM_W - Neo.DOOR) / 2; dy = 0; dw = Neo.DOOR; dh = Neo.WALL + 10;
    } else if (isSouth) {
      dx = (Neo.ROOM_W - Neo.DOOR) / 2; dy = Neo.ROOM_H - Neo.WALL - 10; dw = Neo.DOOR; dh = Neo.WALL + 10;
    } else if (isWest) {
      dx = 0; dy = (Neo.ROOM_H - Neo.DOOR) / 2; dw = Neo.WALL + 10; dh = Neo.DOOR;
    } else {
      dx = Neo.ROOM_W - Neo.WALL - 10; dy = (Neo.ROOM_H - Neo.DOOR) / 2; dw = Neo.WALL + 10; dh = Neo.DOOR;
    }

    const cx = dx + dw / 2;
    const cy = dy + dh / 2;

    target.save();

    // Wood door panel fill
    const woodGrad = isNorth || isSouth
      ? target.createLinearGradient(dx, cy, dx + dw, cy)
      : target.createLinearGradient(cx, dy, cx, dy + dh);
    woodGrad.addColorStop(0,    'rgba(90,52,22,0.97)');
    woodGrad.addColorStop(0.35, 'rgba(110,64,28,0.97)');
    woodGrad.addColorStop(0.65, 'rgba(96,56,22,0.97)');
    woodGrad.addColorStop(1,    'rgba(75,42,16,0.97)');
    target.fillStyle = woodGrad;
    target.fillRect(dx, dy, dw, dh);

    // Wood grain lines
    target.strokeStyle = 'rgba(60,35,12,0.35)';
    target.lineWidth = 1;
    const grainCount = 5;
    for (let i = 1; i < grainCount; i++) {
      target.beginPath();
      if (isNorth || isSouth) {
        const gx = dx + (dw / grainCount) * i;
        target.moveTo(gx, dy); target.lineTo(gx, dy + dh);
      } else {
        const gy = dy + (dh / grainCount) * i;
        target.moveTo(dx, gy); target.lineTo(dx + dw, gy);
      }
      target.stroke();
    }

    // Door frame border
    target.strokeStyle = 'rgba(55,32,10,0.95)';
    target.lineWidth = 3;
    target.strokeRect(dx + 1.5, dy + 1.5, dw - 3, dh - 3);

    // Metal hinges (two, offset toward door edges)
    const hingeColor = 'rgba(80,80,90,0.92)';
    const hingeHighlight = 'rgba(140,140,160,0.75)';
    const hingeW = 8, hingeH = 14;
    const hingeOffsets = isNorth || isSouth ? [-Neo.DOOR * 0.28, Neo.DOOR * 0.28] : [-Neo.DOOR * 0.28, Neo.DOOR * 0.28];
    for (const off of hingeOffsets) {
      const hx = cx + (isNorth || isSouth ? off : -hingeW / 2) - (isNorth || isSouth ? hingeW / 2 : 0);
      const hy = cy + (isNorth || isSouth ? -hingeH / 2 : off) - (isNorth || isSouth ? 0 : hingeH / 2);
      const hw = isNorth || isSouth ? hingeW : hingeH;
      const hh = isNorth || isSouth ? hingeH : hingeW;
      target.fillStyle = hingeColor;
      target.fillRect(hx, hy, hw, hh);
      target.strokeStyle = hingeHighlight;
      target.lineWidth = 1;
      target.strokeRect(hx + 0.5, hy + 0.5, hw - 1, hh - 1);
    }

    // Padlock icon centered on the door
    const lw = 18, lh = 22;
    const lx = cx - lw / 2;
    const ly = cy - lh / 2;
    const shackleR = lw * 0.38;

    // Lock body
    target.shadowColor = 'rgba(200,30,30,0.9)';
    target.shadowBlur = 10;
    target.fillStyle = 'rgba(160,40,40,0.97)';
    const bodyTop = ly + lh * 0.38;
    const bodyH = lh * 0.62;
    target.beginPath();
    target.roundRect(lx, bodyTop, lw, bodyH, 3);
    target.fill();
    target.strokeStyle = 'rgba(220,80,80,0.8)';
    target.lineWidth = 1.5;
    target.stroke();

    // Shackle (arch over body)
    target.shadowBlur = 8;
    target.strokeStyle = 'rgba(200,60,60,0.97)';
    target.lineWidth = 3.5;
    target.beginPath();
    target.arc(cx, bodyTop, shackleR, Math.PI, 0);
    target.stroke();

    // Keyhole
    target.shadowBlur = 0;
    target.fillStyle = 'rgba(30,10,10,0.95)';
    const khY = bodyTop + bodyH * 0.35;
    target.beginPath();
    target.arc(cx, khY, 3, 0, Math.PI * 2);
    target.fill();
    target.beginPath();
    target.moveTo(cx - 2, khY + 1);
    target.lineTo(cx + 2, khY + 1);
    target.lineTo(cx + 1.5, khY + 6);
    target.lineTo(cx - 1.5, khY + 6);
    target.closePath();
    target.fill();

    target.restore();
  }

  function drawDoorThreshold(dir, theme, locked, target = Neo.ctx) {
    const isNorth = dir === 'n';
    const isSouth = dir === 's';
    const isWest = dir === 'w';
    const x = isWest ? 0 : isNorth || isSouth ? (Neo.ROOM_W - Neo.DOOR) / 2 : Neo.ROOM_W - Neo.WALL - 10;
    const y = isNorth ? 0 : isSouth ? Neo.ROOM_H - Neo.WALL - 10 : (Neo.ROOM_H - Neo.DOOR) / 2;
    const w = isWest || dir === 'e' ? Neo.WALL + 10 : Neo.DOOR;
    const h = isNorth || isSouth ? Neo.WALL + 10 : Neo.DOOR;
    if (locked) {
      drawTiledRect(theme.thresholdTile, x, y, w, h, { tileSize: Neo.ENV_TILE_SIZE, tint: theme.floorTint, ctx: target });
    } else {
      target.fillStyle = 'rgba(8,8,10,0.96)';
      target.fillRect(x, y, w, h);
    }

    target.save();
    target.strokeStyle = locked ? 'rgba(160,40,40,0.85)' : theme.doorAccent;
    target.lineWidth = locked ? 3 : 2;
    target.shadowColor = locked ? 'rgba(200,30,30,0.9)' : theme.doorAccent;
    target.shadowBlur = locked ? 12 : 5;
    target.beginPath();
    if (isNorth || isSouth) {
      const edgeY = isNorth ? Neo.WALL + 3 : Neo.ROOM_H - Neo.WALL - 3;
      target.moveTo((Neo.ROOM_W - Neo.DOOR) / 2 + 12, edgeY);
      target.lineTo((Neo.ROOM_W + Neo.DOOR) / 2 - 12, edgeY);
    } else {
      const edgeX = isWest ? Neo.WALL + 3 : Neo.ROOM_W - Neo.WALL - 3;
      target.moveTo(edgeX, (Neo.ROOM_H - Neo.DOOR) / 2 + 12);
      target.lineTo(edgeX, (Neo.ROOM_H + Neo.DOOR) / 2 - 12);
    }
    target.stroke();

    if (locked) {
      drawLockedDoor(dir, target);
    }

    target.restore();
  }

  function drawStoneWalls(theme, target = Neo.ctx) {
    drawTiledRect(theme.wallTile, 0, 0, Neo.ROOM_W, Neo.WALL + 8, { tileSize: Neo.ENV_TILE_SIZE, ctx: target });
    drawTiledRect(theme.wallTile, 0, Neo.ROOM_H - Neo.WALL - 8, Neo.ROOM_W, Neo.WALL + 8, { tileSize: Neo.ENV_TILE_SIZE, ctx: target });
    drawTiledRect(theme.wallTile, 0, 0, Neo.WALL + 8, Neo.ROOM_H, { tileSize: Neo.ENV_TILE_SIZE, ctx: target });
    drawTiledRect(theme.wallTile, Neo.ROOM_W - Neo.WALL - 8, 0, Neo.WALL + 8, Neo.ROOM_H, { tileSize: Neo.ENV_TILE_SIZE, ctx: target });

    const roomLocked = Neo.isRoomLocked();
    Neo.DIRECTIONS.forEach(dir => {
      if (Neo.hasVisibleRoomExit(Neo.currentRoom, dir)) drawDoorThreshold(dir, theme, roomLocked, target);
    });

    target.save();
    target.fillStyle = theme.wallShadow;
    target.fillRect(Neo.WALL, Neo.WALL, Neo.ROOM_W - Neo.WALL * 2, 8);
    target.fillRect(Neo.WALL, Neo.ROOM_H - Neo.WALL - 8, Neo.ROOM_W - Neo.WALL * 2, 8);
    target.fillRect(Neo.WALL, Neo.WALL, 8, Neo.ROOM_H - Neo.WALL * 2);
    target.fillRect(Neo.ROOM_W - Neo.WALL - 8, Neo.WALL, 8, Neo.ROOM_H - Neo.WALL * 2);
    target.strokeStyle = Neo.enemies.length > 0 ? theme.combatAccent : theme.wallEdge;
    target.lineWidth = Neo.enemies.length > 0 ? 3 : 2;
    const inset = Neo.WALL + 3;
    const left = inset;
    const right = Neo.ROOM_W - inset;
    const top = inset;
    const bottom = Neo.ROOM_H - inset;
    const doorMinX = (Neo.ROOM_W - Neo.DOOR) / 2 + 10;
    const doorMaxX = (Neo.ROOM_W + Neo.DOOR) / 2 - 10;
    const doorMinY = (Neo.ROOM_H - Neo.DOOR) / 2 + 10;
    const doorMaxY = (Neo.ROOM_H + Neo.DOOR) / 2 - 10;
    target.beginPath();
    if (Neo.hasVisibleRoomExit(Neo.currentRoom, 'n')) {
      target.moveTo(left, top); target.lineTo(doorMinX, top);
      target.moveTo(doorMaxX, top); target.lineTo(right, top);
    } else {
      target.moveTo(left, top); target.lineTo(right, top);
    }
    if (Neo.hasVisibleRoomExit(Neo.currentRoom, 's')) {
      target.moveTo(left, bottom); target.lineTo(doorMinX, bottom);
      target.moveTo(doorMaxX, bottom); target.lineTo(right, bottom);
    } else {
      target.moveTo(left, bottom); target.lineTo(right, bottom);
    }
    if (Neo.hasVisibleRoomExit(Neo.currentRoom, 'w')) {
      target.moveTo(left, top); target.lineTo(left, doorMinY);
      target.moveTo(left, doorMaxY); target.lineTo(left, bottom);
    } else {
      target.moveTo(left, top); target.lineTo(left, bottom);
    }
    if (Neo.hasVisibleRoomExit(Neo.currentRoom, 'e')) {
      target.moveTo(right, top); target.lineTo(right, doorMinY);
      target.moveTo(right, doorMaxY); target.lineTo(right, bottom);
    } else {
      target.moveTo(right, top); target.lineTo(right, bottom);
    }
    target.stroke();

    // Draw bright arch accent on each open door gap so exits are obvious
    if (!roomLocked) {
      target.strokeStyle = theme.doorAccent;
      target.lineWidth = 2;
      target.shadowColor = theme.doorAccent;
      target.shadowBlur = 4;
      target.beginPath();
      if (Neo.hasVisibleRoomExit(Neo.currentRoom, 'n')) {
        target.moveTo(doorMinX, top); target.lineTo(doorMaxX, top);
      }
      if (Neo.hasVisibleRoomExit(Neo.currentRoom, 's')) {
        target.moveTo(doorMinX, bottom); target.lineTo(doorMaxX, bottom);
      }
      if (Neo.hasVisibleRoomExit(Neo.currentRoom, 'w')) {
        target.moveTo(left, doorMinY); target.lineTo(left, doorMaxY);
      }
      if (Neo.hasVisibleRoomExit(Neo.currentRoom, 'e')) {
        target.moveTo(right, doorMinY); target.lineTo(right, doorMaxY);
      }
      target.stroke();
    }

    target.restore();
  }

  function drawEnvironmentVignette(theme, target = Neo.ctx) {
    const gradient = target.createRadialGradient(
      Neo.ROOM_W / 2,
      Neo.ROOM_H / 2,
      120,
      Neo.ROOM_W / 2,
      Neo.ROOM_H / 2,
      Math.max(Neo.ROOM_W, Neo.ROOM_H) * 0.74,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, theme.vignette || 'rgba(0,0,0,0.4)');
    target.fillStyle = gradient;
    target.fillRect(0, 0, Neo.ROOM_W, Neo.ROOM_H);
  }

  function getEnvironmentBackgroundCacheKey() {
    const roomKey = Neo.currentRoom
      ? `${Neo.currentRoom.gx},${Neo.currentRoom.gy},${Neo.currentRoom.type || 'room'},${Neo.currentRoom.secretKind || ''}`
      : 'none';
    const doorsKey = Neo.DIRECTIONS.map(dir => Neo.hasVisibleRoomExit(Neo.currentRoom, dir) ? '1' : '0').join('');
    const lockKey = Neo.isRoomLocked?.() ? 'locked' : 'open';
    const combatKey = Neo.enemies.length > 0 ? 'combat' : 'calm';
    const lavaKey = getStaticRoomLavaHazards()
      .map(hazard => `${hazard.left},${hazard.top},${hazard.w},${hazard.h}`)
      .join(';');
    return `${Neo.floor}|${roomKey}|${doorsKey}|${lockKey}|${combatKey}|${lavaKey}`;
  }

  function buildEnvironmentBackground(theme) {
    const canvasEl = document.createElement('canvas');
    canvasEl.width = Neo.ROOM_W;
    canvasEl.height = Neo.ROOM_H;
    const bg = canvasEl.getContext('2d');
    bg.imageSmoothingEnabled = false;
    bg.fillStyle = theme.backdrop;
    bg.fillRect(0, 0, Neo.ROOM_W, Neo.ROOM_H);
    drawFloorTiles(theme, bg);
    drawFloorDecals(theme, bg);
    drawStoneWalls(theme, bg);
    drawEnvironmentVignette(theme, bg);
    return canvasEl;
  }

  function drawFloor() {
    const theme = getRoomArtTheme();
    const cacheKey = getEnvironmentBackgroundCacheKey();
    if (!Neo.environmentBackgroundCache.canvas || Neo.environmentBackgroundCache.key !== cacheKey) {
      Neo.environmentBackgroundCache = {
        key: cacheKey,
        canvas: buildEnvironmentBackground(theme),
      };
    }
    Neo.ctx.drawImage(Neo.environmentBackgroundCache.canvas, 0, 0);
  }

  function drawChests() {
    Neo.chests.forEach(chest => {
      const t = Date.now() / 260 + chest.x * 0.01;
      const isAbChest = chest.choiceType === 'ab';
      Neo.ctx.save();
      Neo.ctx.translate(chest.x, chest.y);
      Neo.ctx.imageSmoothingEnabled = false;

      Neo.ctx.fillStyle = 'rgba(0,0,0,0.32)';
      Neo.ctx.fillRect(-28, 14, 56, 8);

      if (!chest.open) {
        Neo.ctx.shadowColor = '#ffd36a';
        Neo.ctx.shadowBlur = 5 + Math.sin(t) * 2;
        Neo.ctx.fillStyle = 'rgba(255,190,74,0.10)';
        Neo.ctx.fillRect(-30, -22, 60, 44);
      }

      Neo.ctx.shadowBlur = 0;

      const chestSheet = isAbChest
        ? (Neo.ENVIRONMENT_IMAGES?.chest_a_b?.image || Neo.ENVIRONMENT_IMAGES?.chest_0?.image)
        : Neo.ENVIRONMENT_IMAGES?.chest_0?.image;
      if (chestSheet) {
        const frameCount = Math.max(1, Math.floor(chestSheet.naturalWidth / 24));
        const frame = chest.open
          ? Math.min(frameCount - 1, 4 + (Math.floor(Date.now() / 180) % Math.max(1, frameCount - 4)))
          : Math.min(1, Math.floor(Date.now() / 420) % 2);
        const drawSize = 64;
        Neo.ctx.drawImage(chestSheet, frame * 24, 0, 24, 24, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        if (isAbChest && chest.open) {
          const stillChoosing = Array.isArray(Neo.pickups)
            && Neo.pickups.some(pickup => pickup?.type === 'rewardChoice'
              && pickup.dwellMode
              && String(pickup.groupId || '') === String(chest.choiceGroupId || ''));
          if (stillChoosing) {
            Neo.ctx.textAlign = 'center';
            Neo.ctx.fillStyle = '#ffe9a8';
            Neo.ctx.font = 'bold 11px system-ui';
            Neo.ctx.fillText('CHOOSE ONE', 0, -36);
            Neo.ctx.fillStyle = '#cfe6f5';
            Neo.ctx.font = '9px system-ui';
            Neo.ctx.fillText('stand in a circle to confirm', 0, -25);
          }
        }
        Neo.ctx.restore();
        return;
      }

      if (chest.open) {
        if (isAbChest) {
          Neo.ctx.fillStyle = '#315c2d';
          Neo.ctx.fillRect(-30, -2, 30, 26);
          Neo.ctx.fillStyle = '#6d2525';
          Neo.ctx.fillRect(0, -2, 30, 26);
        } else {
          Neo.ctx.fillStyle = '#5c3118';
          Neo.ctx.fillRect(-30, -2, 60, 26);
        }
        Neo.ctx.fillStyle = '#2b160b';
        Neo.ctx.fillRect(-30, 16, 60, 8);
        Neo.ctx.fillRect(20, -2, 10, 26);
        if (isAbChest) {
          Neo.ctx.fillStyle = '#62c76b';
          Neo.ctx.fillRect(-26, 2, 22, 3);
          Neo.ctx.fillStyle = '#ff6b6b';
          Neo.ctx.fillRect(2, 2, 18, 3);
          Neo.ctx.fillStyle = '#62c76b';
          Neo.ctx.fillRect(-26, 2, 3, 14);
        } else {
          Neo.ctx.fillStyle = '#a7632d';
          Neo.ctx.fillRect(-26, 2, 46, 3);
          Neo.ctx.fillRect(-26, 2, 3, 14);
        }
        Neo.ctx.fillStyle = '#17100b';
        Neo.ctx.fillRect(-22, -13, 44, 11);
        if (isAbChest) {
          Neo.ctx.fillStyle = '#315c2d';
          Neo.ctx.fillRect(-20, -24, 20, 11);
          Neo.ctx.fillStyle = '#6d2525';
          Neo.ctx.fillRect(0, -24, 20, 11);
          Neo.ctx.fillStyle = '#62c76b';
          Neo.ctx.fillRect(-17, -22, 14, 3);
          Neo.ctx.fillStyle = '#ff6b6b';
          Neo.ctx.fillRect(3, -22, 14, 3);
        } else {
          Neo.ctx.fillStyle = '#7e461e';
          Neo.ctx.fillRect(-20, -24, 40, 11);
          Neo.ctx.fillStyle = '#c7792f';
          Neo.ctx.fillRect(-17, -22, 32, 3);
        }
      } else {
        if (isAbChest) {
          Neo.ctx.fillStyle = '#2f7d43';
          Neo.ctx.fillRect(-32, -20, 32, 44);
          Neo.ctx.fillStyle = '#923030';
          Neo.ctx.fillRect(0, -20, 32, 44);
        } else {
          Neo.ctx.fillStyle = '#7e431e';
          Neo.ctx.fillRect(-32, -20, 64, 44);
        }
        Neo.ctx.fillStyle = '#4b2612';
        Neo.ctx.fillRect(-32, 12, 64, 12);
        Neo.ctx.fillRect(22, -20, 10, 44);
        if (isAbChest) {
          Neo.ctx.fillStyle = '#69d174';
          Neo.ctx.fillRect(-28, -16, 24, 4);
          Neo.ctx.fillRect(-28, -16, 4, 28);
          Neo.ctx.fillStyle = '#ff6a6a';
          Neo.ctx.fillRect(4, -16, 22, 4);
        } else {
          Neo.ctx.fillStyle = '#c7772d';
          Neo.ctx.fillRect(-28, -16, 50, 4);
          Neo.ctx.fillRect(-28, -16, 4, 28);
        }
        Neo.ctx.fillStyle = '#2f3742';
        Neo.ctx.fillRect(-22, -22, 6, 46);
        Neo.ctx.fillRect(16, -22, 6, 46);
        Neo.ctx.fillRect(-30, -3, 60, 5);
        Neo.ctx.fillStyle = '#ffd86c';
        Neo.ctx.fillRect(-8, -1, 16, 14);
        Neo.ctx.fillStyle = '#4a260d';
        Neo.ctx.fillRect(-2, 4, 4, 7);
      }
      Neo.ctx.strokeStyle = '#1a0d06';
      Neo.ctx.lineWidth = 2;
      Neo.ctx.strokeRect(-31, -19, 62, 42);

      // Once an A/B chest is open, two choice areas flank it. Explain the rule
      // above the chest so the dwell-to-confirm mechanic is discoverable.
      if (isAbChest && chest.open) {
        const stillChoosing = Array.isArray(Neo.pickups)
          && Neo.pickups.some(pickup => pickup?.type === 'rewardChoice'
            && pickup.dwellMode
            && String(pickup.groupId || '') === String(chest.choiceGroupId || ''));
        if (stillChoosing) {
          Neo.ctx.shadowBlur = 0;
          Neo.ctx.textAlign = 'center';
          Neo.ctx.fillStyle = '#ffe9a8';
          Neo.ctx.font = 'bold 11px system-ui';
          Neo.ctx.fillText('CHOOSE ONE', 0, -36);
          Neo.ctx.fillStyle = '#cfe6f5';
          Neo.ctx.font = '9px system-ui';
          Neo.ctx.fillText('stand in a circle to confirm', 0, -25);
        }
      }
      Neo.ctx.restore();
    });
  }

  function drawRoomDecor() {
    const theme = getRoomArtTheme();
    const propSprites = window.NeoNykeEnvironmentTileDefs?.propSprites || {};
    Neo.decorations.forEach(decor => {
      Neo.ctx.save();
      Neo.ctx.translate(decor.x, decor.y);
      if (decor.kind === 'rubble') {
        if (Neo.drawEnvironmentPixelSprite?.(Neo.ctx, -decor.r, -decor.r, decor.r * 2, decor.r * 2, propSprites.rubble)) { Neo.ctx.restore(); return; }
        Neo.ctx.fillStyle = 'rgba(42,44,38,0.55)';
        Neo.ctx.beginPath();
        Neo.ctx.ellipse(0, 1, decor.r * 1.15, decor.r * 0.62, -0.2, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.fillStyle = 'rgba(92,91,76,0.38)';
        for (let index = 0; index < 5; index += 1) {
          const angle = index * 1.7 + decor.x * 0.01;
          const rx = Math.cos(angle) * decor.r * 0.55;
          const ry = Math.sin(angle) * decor.r * 0.28;
          Neo.ctx.fillRect(rx - 3, ry - 2, 6, 4);
        }
      } else if (decor.kind === 'banner') {
        // Banners/flags retired — draw nothing (also stripped at room load).
      } else if (decor.kind === 'crack') {
        if (Neo.drawEnvironmentPixelSprite?.(Neo.ctx, -decor.r, -decor.r, decor.r * 2, decor.r * 2, propSprites.crack_decal)) { Neo.ctx.restore(); return; }
        Neo.ctx.strokeStyle = theme.crack;
        Neo.ctx.lineWidth = 2.2;
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(-decor.r, -6);
        Neo.ctx.lineTo(-8, 0);
        Neo.ctx.lineTo(0, -8);
        Neo.ctx.lineTo(10, 4);
        Neo.ctx.lineTo(decor.r, -2);
        Neo.ctx.stroke();
      } else if (decor.kind === 'brazier') {
        if (Neo.drawEnvironmentPixelSprite?.(Neo.ctx, -decor.r, -decor.r, decor.r * 2, decor.r * 2, propSprites.brazier)) { Neo.ctx.restore(); return; }
        Neo.ctx.fillStyle = 'rgba(26,20,14,0.9)';
        Neo.ctx.fillRect(-decor.r * 0.7, -2, decor.r * 1.4, decor.r * 0.8);
        Neo.ctx.fillStyle = 'rgba(90,95,92,0.82)';
        Neo.ctx.fillRect(-decor.r * 0.5, -5, decor.r, 4);
        Neo.ctx.fillStyle = 'rgba(210,135,72,0.72)';
        Neo.ctx.fillRect(-3, -10, 6, 8);
        Neo.ctx.fillStyle = 'rgba(245,202,120,0.72)';
        Neo.ctx.fillRect(-1, -8, 2, 5);
      } else if (decor.kind === 'torch') {
        drawCandle(decor);
      } else if (decor.kind === 'tree') {
        if (Neo.drawEnvironmentPixelSprite?.(Neo.ctx, -decor.r, -decor.r, decor.r * 2, decor.r * 2, propSprites.tree)) { Neo.ctx.restore(); return; }
        // Shadow
        Neo.ctx.fillStyle = 'rgba(20,30,14,0.35)';
        Neo.ctx.beginPath();
        Neo.ctx.ellipse(0, decor.r * 0.7, decor.r * 0.9, decor.r * 0.35, 0, 0, Math.PI * 2);
        Neo.ctx.fill();
        // Trunk
        Neo.ctx.fillStyle = '#5c3a1e';
        Neo.ctx.fillRect(-4, -decor.r * 0.3, 8, decor.r * 0.85);
        // Canopy layers
        Neo.ctx.shadowColor = '#3a7d2c';
        Neo.ctx.shadowBlur = 6;
        Neo.ctx.fillStyle = '#3a7d2c';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, -decor.r * 0.5, decor.r * 0.78, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.fillStyle = '#52a83a';
        Neo.ctx.beginPath();
        Neo.ctx.arc(-decor.r * 0.22, -decor.r * 0.7, decor.r * 0.55, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.beginPath();
        Neo.ctx.arc(decor.r * 0.22, -decor.r * 0.78, decor.r * 0.5, 0, Math.PI * 2);
        Neo.ctx.fill();
        // Highlight
        Neo.ctx.fillStyle = 'rgba(160,230,100,0.25)';
        Neo.ctx.beginPath();
        Neo.ctx.arc(-decor.r * 0.15, -decor.r * 0.85, decor.r * 0.28, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.shadowBlur = 0;
      } else if (decor.kind === 'fruit_tree') {
        if (Neo.drawEnvironmentPixelSprite?.(Neo.ctx, -decor.r, -decor.r, decor.r * 2, decor.r * 2, propSprites.fruit_tree)) { Neo.ctx.restore(); return; }
        Neo.ctx.fillStyle = 'rgba(18,30,12,0.34)';
        Neo.ctx.beginPath();
        Neo.ctx.ellipse(0, decor.r * 0.74, decor.r, decor.r * 0.36, 0, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.fillStyle = '#5f3d1f';
        Neo.ctx.fillRect(-4, -decor.r * 0.28, 8, decor.r * 0.9);
        Neo.ctx.fillStyle = '#3f7a2d';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, -decor.r * 0.46, decor.r * 0.84, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.fillStyle = '#58a73d';
        Neo.ctx.beginPath();
        Neo.ctx.arc(-decor.r * 0.28, -decor.r * 0.68, decor.r * 0.58, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.beginPath();
        Neo.ctx.arc(decor.r * 0.26, -decor.r * 0.74, decor.r * 0.52, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.fillStyle = '#ff7385';
        Neo.ctx.shadowColor = '#ff7f8f';
        Neo.ctx.shadowBlur = 8;
        Neo.ctx.beginPath();
        Neo.ctx.arc(-decor.r * 0.18, -decor.r * 0.62, 3, 0, Math.PI * 2);
        Neo.ctx.arc(decor.r * 0.15, -decor.r * 0.5, 3, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.shadowBlur = 0;
      } else if (decor.kind === 'moss_patch') {
        if (Neo.drawEnvironmentPixelSprite?.(Neo.ctx, -decor.r, -decor.r, decor.r * 2, decor.r * 2, propSprites.moss_patch)) { Neo.ctx.restore(); return; }
        Neo.ctx.fillStyle = 'rgba(17,34,18,0.5)';
        Neo.ctx.beginPath();
        Neo.ctx.ellipse(0, 2, decor.r * 1.2, decor.r * 0.56, decor.x * 0.01, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.fillStyle = 'rgba(92,145,72,0.5)';
        Neo.ctx.beginPath();
        Neo.ctx.ellipse(-decor.r * 0.2, -1, decor.r * 0.74, decor.r * 0.34, 0.4, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.fillStyle = 'rgba(149,208,109,0.22)';
        Neo.ctx.fillRect(-decor.r * 0.4, -1, decor.r * 0.45, 2);
      }
      Neo.ctx.restore();
    });

    // Tall structures (columns) need depth sorting against the player: draw the
    // ones the player is in FRONT of here (player feet below the base), and defer
    // the ones the player is BEHIND to drawStructuresOverPlayer() — called after
    // the player so they occlude them. Non-tall structures always draw here.
    const playerFeetY = Number(Neo.player?.y ?? -Infinity);
    Neo.structures.forEach(structure => {
      if (structureIsBehindPlayer(structure, playerFeetY)) return;
      drawStructure(structure, theme);
    });
  }

  // True when the player should render IN FRONT of this structure (i.e. the
  // structure is "behind" the player and was deferred to drawRoomDecor's pass).
  // Tall columns occlude the player only when the player stands above their base.
  function structureIsBehindPlayer(structure, playerFeetY) {
    if (structure.kind !== 'pillar') return false;
    // Column base (ground line) sits at structure.y + h/2. If the player's feet
    // are above (smaller Y) that line, the player is behind the column.
    const baseY = structure.y + structure.h / 2;
    return playerFeetY < baseY;
  }

  function drawStructure(structure, theme = getRoomArtTheme()) {
    Neo.ctx.save();
    Neo.ctx.translate(structure.x, structure.y);
    if (structure.kind === 'pillar') {
      const baseImage = Neo.ENVIRONMENT_IMAGES?.pillar_1?.image;
      const shaftImage = Neo.ENVIRONMENT_IMAGES?.pillar_2?.image;
      const capImage = Neo.ENVIRONMENT_IMAGES?.pillar_3?.image;
      const pillarImage = Neo.ENVIRONMENT_IMAGES?.pillar?.image;
      if (baseImage && shaftImage && capImage) {
        // Stack capital -> 0-3 shaft repeats -> base, each a 24px segment, so
        // column height varies by the seeded `mids` count set in addPillar.
        const mids = Neo.clamp(Number(structure.mids || 0), 0, 3);
        const segments = [capImage, ...Array(mids).fill(shaftImage), baseImage];
        const w = Math.max(24, Number(structure.w || 34));
        const segH = w;
        const totalH = segH * segments.length;
        Neo.ctx.imageSmoothingEnabled = false;
        segments.forEach((segment, index) => {
          Neo.ctx.drawImage(segment, -w / 2, -totalH / 2 + index * segH, w, segH);
        });
      } else if (pillarImage) {
        const w = Math.max(24, Number(structure.w || 48));
        const h = Math.max(24, Number(structure.h || 48)) * 1.35;
        Neo.ctx.imageSmoothingEnabled = false;
        Neo.ctx.drawImage(pillarImage, -w / 2, -h / 2, w, h);
      } else {
        drawGreekColumn(structure.w, structure.h, theme);
      }
    } else if (structure.kind === 'anvil') {
      const anvilImage = Neo.ENVIRONMENT_IMAGES?.anvil_0?.image;
      const w = Math.max(24, Number(structure.w || 40));
      const h = Math.max(24, Number(structure.h || 40));
      if (anvilImage) {
        Neo.ctx.imageSmoothingEnabled = false;
        Neo.ctx.drawImage(anvilImage, -w / 2, -h / 2, w, h);
      }
    } else if (structure.kind === 'forge') {
      const forgeSheet = Neo.ENVIRONMENT_IMAGES?.forge_0?.image;
      const w = Math.max(24, Number(structure.w || 48));
      const h = Math.max(24, Number(structure.h || 48));
      if (forgeSheet) {
        const frameCount = Math.max(1, Math.floor(forgeSheet.naturalWidth / 24));
        const frame = Math.floor(Date.now() / 220) % frameCount;
        Neo.ctx.imageSmoothingEnabled = false;
        Neo.ctx.drawImage(forgeSheet, frame * 24, 0, 24, 24, -w / 2, -h / 2, w, h);
      }
    } else {
      drawEnvironmentTile('wall_block', -structure.w / 2, -structure.h / 2, structure.w, structure.h);
      Neo.ctx.strokeStyle = theme.wallEdge;
      Neo.ctx.lineWidth = 1.5;
      Neo.ctx.strokeRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
    }
    Neo.ctx.restore();
  }

  // Second structures pass: redraw the tall columns the player is standing
  // behind, so they render over the player. Called from the viewport after the
  // player is drawn.
  function drawStructuresOverPlayer() {
    if (!Neo.structures?.length) return;
    const theme = getRoomArtTheme();
    // Use the frontmost (largest Y) active player as the depth threshold so a
    // column only draws over the player(s) it is genuinely behind. In single
    // player this is just the player; in co-op it picks the nearest player.
    let playerFeetY = Number(Neo.player?.y ?? -Infinity);
    if (Neo.isMultiplayerMode?.() && Neo.getActivePlayerSlots) {
      Neo.getActivePlayerSlots().forEach(slot => {
        if (slot?.getDead?.()) return;
        const p = slot?.getEntity?.();
        if (p && Number.isFinite(p.y)) playerFeetY = Math.max(playerFeetY, p.y);
      });
    }
    Neo.structures.forEach(structure => {
      if (structureIsBehindPlayer(structure, playerFeetY)) drawStructure(structure, theme);
    });
  }

  // A lit candle on a small dish, drawn centered at (0,0) — the caller has
  // translated to position. Tapered wax body with a side highlight, a wick, and
  // an animated layered teardrop flame with a soft warm glow. Flicker is phased
  // by position so neighbouring candles don't pulse in sync.
  function drawCandle(decor) {
    const ctx = Neo.ctx;
    const sprite = window.NeoNykeEnvironmentTileDefs?.propSprites?.candle;
    const r = Math.max(12, Number(decor?.r || 12));
    if (Neo.drawEnvironmentPixelSprite?.(ctx, -r, -r, r * 2, r * 2, sprite)) return;
    const t = Date.now() * 0.006 + (decor.x || 0) * 0.05 + (decor.y || 0) * 0.03;
    const flick = 1 + Math.sin(t) * 0.12 + Math.sin(t * 2.7) * 0.06; // 0.82..1.18
    const sway = Math.sin(t * 1.6) * 0.8;

    // Holder dish + drop shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 13, 9, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b7077';
    ctx.beginPath();
    ctx.ellipse(0, 11, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#878d95';
    ctx.beginPath();
    ctx.ellipse(0, 10, 5.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wax body (slightly tapered), warm cream with a lit side highlight.
    const bodyTop = -8;
    const bodyBot = 10;
    ctx.beginPath();
    ctx.moveTo(-3.5, bodyBot);
    ctx.lineTo(-3, bodyTop);
    ctx.quadraticCurveTo(0, bodyTop - 2, 3, bodyTop);
    ctx.lineTo(3.5, bodyBot);
    ctx.closePath();
    const wax = ctx.createLinearGradient(-3.5, 0, 3.5, 0);
    wax.addColorStop(0, '#cdbf9a');
    wax.addColorStop(0.45, '#f3ead0');
    wax.addColorStop(1, '#b3a079');
    ctx.fillStyle = wax;
    ctx.fill();
    // Soft wax pool / lip at the top.
    ctx.fillStyle = 'rgba(255,248,224,0.8)';
    ctx.beginPath();
    ctx.ellipse(0, bodyTop, 3, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Drip down the lit side.
    ctx.strokeStyle = 'rgba(255,250,232,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1.6, bodyTop + 1);
    ctx.lineTo(-1.9, bodyTop + 7);
    ctx.stroke();

    // Wick.
    ctx.strokeStyle = '#2a2018';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, bodyTop);
    ctx.lineTo(0, bodyTop - 3);
    ctx.stroke();

    // Warm glow halo behind the flame.
    const glowY = bodyTop - 8;
    const glow = ctx.createRadialGradient(0, glowY, 1, 0, glowY, 16 * flick);
    glow.addColorStop(0, 'rgba(255,210,130,0.45)');
    glow.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, glowY, 16 * flick, 0, Math.PI * 2);
    ctx.fill();

    // Flame: outer (orange) teardrop, then inner (yellow), then bright core.
    const fh = 11 * flick;   // flame height
    const fw = 3.4;          // flame half-width
    const tipX = sway;       // flame tip sways slightly
    const drawTeardrop = (height, width, topColor, botColor) => {
      const top = bodyTop - 3 - height;
      const g = ctx.createLinearGradient(0, top, 0, bodyTop - 3);
      g.addColorStop(0, topColor);
      g.addColorStop(1, botColor);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(tipX, top);
      ctx.bezierCurveTo(tipX + width, top + height * 0.5, width, bodyTop - 4, 0, bodyTop - 3);
      ctx.bezierCurveTo(-width, bodyTop - 4, tipX - width, top + height * 0.5, tipX, top);
      ctx.closePath();
      ctx.fill();
    };
    drawTeardrop(fh, fw, 'rgba(255,150,40,0.95)', 'rgba(255,90,20,0.6)');           // outer orange
    drawTeardrop(fh * 0.66, fw * 0.62, 'rgba(255,224,120,0.98)', 'rgba(255,170,60,0.7)'); // inner yellow
    drawTeardrop(fh * 0.34, fw * 0.34, 'rgba(255,255,240,1)', 'rgba(255,230,170,0.9)');   // white core
  }

  // Tall Greek column in oblique 3/4 view: the square collision footprint sits
  // at the base, and a long fluted shaft rises up the screen with a capital and
  // entablature on top. Lit from the upper-left; casts an angled ground shadow.
  // Drawn centered at (0,0) — the caller has already translated to position.
  function drawGreekColumn(w, h, theme) {
    const ctx = Neo.ctx;
    const baseW = w;                       // footprint width (== collision)
    const baseHalf = baseW / 2;
    const shaftW = baseW * 0.62;           // shaft is narrower than the base
    const shaftHalf = shaftW / 2;
    const baseY = h / 2;                   // bottom of the footprint (ground line)
    const height = h * 2.6;                // how far up the screen the column rises
    const topY = baseY - height;           // top of the shaft
    const lean = baseW * 0.12;             // slight rightward angle for perspective

    // Angled ground shadow cast to the lower-right.
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath();
    ctx.moveTo(-baseHalf, baseY);
    ctx.lineTo(baseHalf, baseY);
    ctx.lineTo(baseHalf + baseW * 0.9, baseY + h * 0.5);
    ctx.lineTo(-baseHalf + baseW * 0.5, baseY + h * 0.5);
    ctx.closePath();
    ctx.fill();

    // Stepped base (plinth + torus) at the footprint.
    ctx.fillStyle = '#8d877b';
    ctx.fillRect(-baseHalf, baseY - h * 0.42, baseW, h * 0.42);
    ctx.fillStyle = '#a59f93';
    ctx.fillRect(-baseHalf * 0.92, baseY - h * 0.6, baseW * 0.92, h * 0.22);

    // Column shaft: a tall quad leaning slightly right, with a left→right
    // gradient that gives it round, carved volume.
    const topX = lean;
    const shaftGrad = ctx.createLinearGradient(-shaftHalf, 0, shaftHalf, 0);
    shaftGrad.addColorStop(0, '#7f7a6e');
    shaftGrad.addColorStop(0.32, '#ddd6c8');
    shaftGrad.addColorStop(0.5, '#efe9dc');
    shaftGrad.addColorStop(0.72, '#c7c0b1');
    shaftGrad.addColorStop(1, '#6f6a5f');
    ctx.fillStyle = shaftGrad;
    ctx.beginPath();
    ctx.moveTo(-shaftHalf, baseY - h * 0.55);
    ctx.lineTo(shaftHalf, baseY - h * 0.55);
    ctx.lineTo(topX + shaftHalf, topY + h * 0.3);
    ctx.lineTo(topX - shaftHalf, topY + h * 0.3);
    ctx.closePath();
    ctx.fill();

    // Vertical fluting: grooves run up the shaft, interpolated base→top so they
    // follow the lean.
    const flutes = 5;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(70,64,52,0.4)';
    for (let i = 1; i < flutes; i += 1) {
      const f = i / flutes;
      const bx = -shaftHalf + f * shaftW;
      const tx = topX - shaftHalf + f * shaftW;
      ctx.beginPath();
      ctx.moveTo(bx, baseY - h * 0.55);
      ctx.lineTo(tx, topY + h * 0.3);
      ctx.stroke();
    }
    // Bright left-edge highlight on the shaft.
    ctx.strokeStyle = 'rgba(255,250,240,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-shaftHalf + 2, baseY - h * 0.55);
    ctx.lineTo(topX - shaftHalf + 2, topY + h * 0.3);
    ctx.stroke();

    // Capital (flared top) + entablature slab, also leaning with the shaft.
    const capW = shaftW * 1.45;
    const capHalf = capW / 2;
    ctx.fillStyle = '#cfc8ba';
    ctx.beginPath();
    ctx.moveTo(topX - shaftHalf, topY + h * 0.34);
    ctx.lineTo(topX + shaftHalf, topY + h * 0.34);
    ctx.lineTo(topX + capHalf, topY + h * 0.08);
    ctx.lineTo(topX - capHalf, topY + h * 0.08);
    ctx.closePath();
    ctx.fill();
    // Abacus block on top.
    ctx.fillStyle = '#e6dfd0';
    ctx.fillRect(topX - capHalf, topY - h * 0.05, capW, h * 0.16);
    ctx.strokeStyle = (theme && theme.wallEdge) || 'rgba(40,35,28,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(topX - capHalf, topY - h * 0.05, capW, h * 0.16);
  }

  // Classify a cover_wall into a furniture variant ('table' | 'chair') or null
  // (plain wood wall). Reinforced/secret walls stay as walls. The choice is
  // stable per-prop (seeded from position) and size-aware: wide/large pieces
  // become tables, small near-square pieces become chairs.
  function coverWallFurnitureVariant(prop) {
    if (prop.reinforced || prop.kind === 'secret_wall') return null;
    if (prop._furniture !== undefined) return prop._furniture; // memoized
    const w = Math.max(16, Number(prop.w || prop.r * 2 || 48));
    const h = Math.max(16, Number(prop.h || prop.r * 2 || 48));
    const seed = Math.abs(Math.sin((prop.x || 0) * 0.11 + (prop.y || 0) * 0.083)) % 1;
    const long = Math.max(w, h);
    const short = Math.min(w, h);
    let variant = null;
    // Long, reasonably-thick barricades read well as tables/benches.
    if (long >= 90 && short >= 28 && seed < 0.55) variant = 'table';
    // Shorter stubby pieces become chairs.
    else if (long <= 100 && short >= 28 && seed >= 0.55 && seed < 0.85) variant = 'chair';
    prop._furniture = variant;
    return variant;
  }

  function drawCoverWall(prop) {
    const variant = coverWallFurnitureVariant(prop);
    if (variant === 'table') { drawWoodTable(prop); return; }
    if (variant === 'chair') { drawWoodChair(prop); return; }

    const w = Math.max(16, Number(prop.w || prop.r * 2 || 48));
    const h = Math.max(16, Number(prop.h || prop.r * 2 || 48));
    const coverSprite = window.NeoNykeEnvironmentTileDefs?.propSprites?.cover_wall;
    if (Neo.drawEnvironmentPixelSprite?.(Neo.ctx, -w / 2, -h / 2, w, h, coverSprite)) {
      if (prop.hitFlash > 0) furnitureHitFlash(prop, w, h);
      return;
    }
    const left = -w / 2;
    const top = -h / 2;
    const hpRatio = Neo.clamp(Number(prop.hp || 0) / Math.max(1, Number(prop.maxHp || prop.hp || 1)), 0, 1);
    const damageAlpha = (1 - hpRatio) * 0.45;

    Neo.ctx.fillStyle = '#7a4825';
    Neo.ctx.fillRect(left, top, w, h);
    Neo.ctx.fillStyle = '#4b2a18';
    Neo.ctx.fillRect(left, top + h - Math.min(10, h * 0.24), w, Math.min(10, h * 0.24));
    Neo.ctx.fillRect(left + w - Math.min(10, w * 0.24), top, Math.min(10, w * 0.24), h);
    Neo.ctx.fillStyle = '#b0743d';
    Neo.ctx.fillRect(left + 3, top + 3, Math.max(0, w - 12), 3);
    Neo.ctx.fillRect(left + 3, top + 3, 3, Math.max(0, h - 12));

    const horizontal = w >= h;
    const plankCount = Math.max(2, Math.floor((horizontal ? h : w) / 18));
    Neo.ctx.strokeStyle = 'rgba(38,20,10,0.55)';
    Neo.ctx.lineWidth = 1;
    for (let index = 1; index < plankCount; index += 1) {
      Neo.ctx.beginPath();
      if (horizontal) {
        const y = top + (h / plankCount) * index;
        Neo.ctx.moveTo(left + 4, Math.round(y) + 0.5);
        Neo.ctx.lineTo(left + w - 4, Math.round(y) + 0.5);
      } else {
        const x = left + (w / plankCount) * index;
        Neo.ctx.moveTo(Math.round(x) + 0.5, top + 4);
        Neo.ctx.lineTo(Math.round(x) + 0.5, top + h - 4);
      }
      Neo.ctx.stroke();
    }

    if (prop.reinforced) {
      Neo.ctx.fillStyle = 'rgba(96, 105, 116, 0.92)';
      Neo.ctx.strokeStyle = 'rgba(190, 198, 208, 0.42)';
      Neo.ctx.lineWidth = 1;
      if (horizontal) {
        [-0.28, 0.28].forEach(offset => {
          const y = offset * h;
          Neo.ctx.fillRect(left, y - 5, w, 10);
          Neo.ctx.strokeRect(left + 0.5, y - 4.5, w - 1, 9);
        });
      } else {
        [-0.28, 0.28].forEach(offset => {
          const x = offset * w;
          Neo.ctx.fillRect(x - 5, top, 10, h);
          Neo.ctx.strokeRect(x - 4.5, top + 0.5, 9, h - 1);
        });
      }
    }

    if (damageAlpha > 0) {
      Neo.ctx.fillStyle = `rgba(20, 10, 4, ${damageAlpha})`;
      Neo.ctx.fillRect(left, top, w, h);
      Neo.ctx.strokeStyle = `rgba(255, 210, 140, ${0.22 + damageAlpha})`;
      Neo.ctx.lineWidth = 1.5;
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(left + w * 0.25, top + h * 0.25);
      Neo.ctx.lineTo(left + w * 0.46, top + h * 0.52);
      Neo.ctx.lineTo(left + w * 0.4, top + h * 0.78);
      Neo.ctx.moveTo(left + w * 0.64, top + h * 0.18);
      Neo.ctx.lineTo(left + w * 0.55, top + h * 0.48);
      Neo.ctx.lineTo(left + w * 0.74, top + h * 0.72);
      Neo.ctx.stroke();
    }

    Neo.ctx.strokeStyle = prop.reinforced ? 'rgba(198, 205, 214, 0.58)' : 'rgba(38, 20, 10, 0.92)';
    Neo.ctx.lineWidth = prop.reinforced ? 2.5 : 2;
    Neo.ctx.strokeRect(left + 1, top + 1, w - 2, h - 2);

    if (prop.hitFlash > 0) {
      const flash = Neo.clamp(Number(prop.hitFlash || 0) / 0.12, 0, 1);
      Neo.ctx.fillStyle = `rgba(255, 244, 190, ${flash * 0.22})`;
      Neo.ctx.fillRect(left, top, w, h);
      Neo.ctx.strokeStyle = `rgba(255, 244, 190, ${flash * 0.7})`;
      Neo.ctx.lineWidth = 2;
      Neo.ctx.strokeRect(left + 1, top + 1, w - 2, h - 2);
    }
  }

  // Brief warm flash overlay for furniture pieces when hit (mirrors the cover
  // wall hit feedback). `w`/`h` are the footprint extents.
  function furnitureHitFlash(prop, w, h) {
    if (!(prop.hitFlash > 0)) return;
    const flash = Neo.clamp(Number(prop.hitFlash || 0) / 0.12, 0, 1);
    Neo.ctx.fillStyle = `rgba(255, 244, 190, ${flash * 0.3})`;
    Neo.ctx.fillRect(-w / 2, -h / 2, w, h);
  }

  // Top-down wooden table: a plank top with a darker rim and four corner legs
  // peeking out. Fills the prop footprint so it still reads as the obstacle.
  function drawWoodTable(prop) {
    const ctx = Neo.ctx;
    const w = Math.max(20, Number(prop.w || prop.r * 2 || 64));
    const h = Math.max(20, Number(prop.h || prop.r * 2 || 64));
    const variant = Math.abs(Math.sin((prop.x || 0) * 0.17 + (prop.y || 0) * 0.13)) < 0.5 ? 'table_0' : 'table_1';
    const authored = Neo.ENVIRONMENT_IMAGES?.[variant]?.image;
    if (authored) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(authored, -w / 2, -h / 2, w, h);
      furnitureHitFlash(prop, w, h);
      return;
    }
    const hw = w / 2;
    const hh = h / 2;
    const legR = Math.max(3, Math.min(w, h) * 0.1);

    // Ground shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-hw + 3, -hh + 4, w, h);

    // Legs at the corners (drawn first so the top overlaps them).
    ctx.fillStyle = '#4a2c17';
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.arc(sx * (hw - legR - 1), sy * (hh - legR - 1), legR, 0, Math.PI * 2);
      ctx.fill();
    });

    // Table top: inset from the footprint, wood gradient.
    const tw = w * 0.86;
    const th = h * 0.86;
    const grad = ctx.createLinearGradient(-tw / 2, 0, tw / 2, 0);
    grad.addColorStop(0, '#7a4a26');
    grad.addColorStop(0.5, '#a06736');
    grad.addColorStop(1, '#6f4222');
    ctx.fillStyle = grad;
    ctx.fillRect(-tw / 2, -th / 2, tw, th);
    // Darker rim.
    ctx.strokeStyle = '#3f2412';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-tw / 2, -th / 2, tw, th);

    // Plank seams along the long axis.
    const horizontal = tw >= th;
    const planks = Math.max(2, Math.floor((horizontal ? th : tw) / 14));
    ctx.strokeStyle = 'rgba(40,22,10,0.5)';
    ctx.lineWidth = 1;
    for (let i = 1; i < planks; i += 1) {
      ctx.beginPath();
      if (horizontal) {
        const y = -th / 2 + (th / planks) * i;
        ctx.moveTo(-tw / 2 + 3, Math.round(y) + 0.5);
        ctx.lineTo(tw / 2 - 3, Math.round(y) + 0.5);
      } else {
        const x = -tw / 2 + (tw / planks) * i;
        ctx.moveTo(Math.round(x) + 0.5, -th / 2 + 3);
        ctx.lineTo(Math.round(x) + 0.5, th / 2 - 3);
      }
      ctx.stroke();
    }
    // Top-edge highlight.
    ctx.strokeStyle = 'rgba(214,150,90,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-tw / 2 + 2, -th / 2 + 2);
    ctx.lineTo(tw / 2 - 2, -th / 2 + 2);
    ctx.stroke();

    furnitureHitFlash(prop, w, h);
  }

  // Top-down wooden chair: a square seat with a back rail on the upper edge and
  // four small legs. Sized to the prop footprint.
  function drawWoodChair(prop) {
    const ctx = Neo.ctx;
    const w = Math.max(16, Number(prop.w || prop.r * 2 || 40));
    const h = Math.max(16, Number(prop.h || prop.r * 2 || 40));
    const variant = Math.abs(Math.sin((prop.x || 0) * 0.19 + (prop.y || 0) * 0.07)) < 0.5 ? 'chair_0' : 'chair_1';
    const authored = Neo.ENVIRONMENT_IMAGES?.[variant]?.image;
    if (authored) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(authored, -w / 2, -h / 2, w, h);
      furnitureHitFlash(prop, w, h);
      return;
    }
    const hw = w / 2;
    const hh = h / 2;
    const legR = Math.max(2.5, Math.min(w, h) * 0.1);

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-hw + 2, -hh + 3, w, h);

    // Legs.
    ctx.fillStyle = '#43280f';
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.arc(sx * (hw - legR - 1), sy * (hh - legR - 1), legR, 0, Math.PI * 2);
      ctx.fill();
    });

    // Back rail along the top edge (so it reads as a chair facing down).
    ctx.fillStyle = '#5e3315';
    ctx.fillRect(-hw + 2, -hh, w - 4, Math.max(4, h * 0.18));

    // Seat: inset square with a wood gradient.
    const sw = w * 0.72;
    const sh = h * 0.62;
    const seatY = h * 0.08;
    const grad = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
    grad.addColorStop(0, '#7a4a26');
    grad.addColorStop(0.5, '#9c6334');
    grad.addColorStop(1, '#6a3f20');
    ctx.fillStyle = grad;
    ctx.fillRect(-sw / 2, seatY - sh / 2, sw, sh);
    ctx.strokeStyle = '#3a2110';
    ctx.lineWidth = 2;
    ctx.strokeRect(-sw / 2, seatY - sh / 2, sw, sh);
    // Seat highlight.
    ctx.strokeStyle = 'rgba(210,148,88,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-sw / 2 + 2, seatY - sh / 2 + 2);
    ctx.lineTo(sw / 2 - 2, seatY - sh / 2 + 2);
    ctx.stroke();

    furnitureHitFlash(prop, w, h);
  }

  function drawDestructibleBlockDamage(prop, w = 52, h = 52) {
    const maxHp = Math.max(1, Number(prop.maxHp || prop.hp || 1));
    const hpRatio = Neo.clamp(Number(prop.hp || 0) / maxHp, 0, 1);
    const damage = 1 - hpRatio;
    const left = -w / 2;
    const top = -h / 2;

    if (damage > 0.02) {
      Neo.ctx.fillStyle = `rgba(18, 16, 13, ${damage * 0.42})`;
      Neo.ctx.fillRect(left + 2, top + 2, w - 4, h - 4);
      Neo.ctx.strokeStyle = `rgba(235, 218, 184, ${0.22 + damage * 0.45})`;
      Neo.ctx.lineWidth = 1.5;
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(left + w * 0.28, top + h * 0.18);
      Neo.ctx.lineTo(left + w * 0.42, top + h * 0.43);
      Neo.ctx.lineTo(left + w * 0.34, top + h * 0.68);
      if (damage > 0.35) {
        Neo.ctx.moveTo(left + w * 0.64, top + h * 0.16);
        Neo.ctx.lineTo(left + w * 0.54, top + h * 0.47);
        Neo.ctx.lineTo(left + w * 0.76, top + h * 0.72);
      }
      if (damage > 0.65) {
        Neo.ctx.moveTo(left + w * 0.18, top + h * 0.78);
        Neo.ctx.lineTo(left + w * 0.5, top + h * 0.62);
        Neo.ctx.lineTo(left + w * 0.86, top + h * 0.82);
      }
      Neo.ctx.stroke();
    }

    if (prop.hitFlash > 0) {
      const flash = Neo.clamp(Number(prop.hitFlash || 0) / 0.12, 0, 1);
      Neo.ctx.fillStyle = `rgba(255, 244, 190, ${flash * 0.24})`;
      Neo.ctx.fillRect(left + 1, top + 1, w - 2, h - 2);
      Neo.ctx.strokeStyle = `rgba(255, 244, 190, ${flash * 0.68})`;
      Neo.ctx.lineWidth = 2;
      Neo.ctx.strokeRect(left + 1, top + 1, w - 2, h - 2);
    }
  }

  function drawBrokenDestructible(prop) {
    if (prop?.kind === 'barrel') {
      const age = Math.max(0, Number(prop.breakAge || 0));
      const fade = Neo.clamp(1 - Math.max(0, age - 4) / 8, 0.35, 1);
      const radius = Math.max(20, Number(prop.scorchRadius || 34));
      const seedBase = (prop.x || 0) * 0.173 + (prop.y || 0) * 0.291 + 91;
      Neo.ctx.save();
      Neo.ctx.translate(prop.x, prop.y);
      Neo.ctx.globalAlpha = fade;
      const scorch = Neo.ctx.createRadialGradient(0, 0, 2, 0, 0, radius);
      scorch.addColorStop(0, 'rgba(16, 12, 9, 0.62)');
      scorch.addColorStop(0.48, 'rgba(44, 26, 16, 0.4)');
      scorch.addColorStop(1, 'rgba(0, 0, 0, 0)');
      Neo.ctx.fillStyle = scorch;
      Neo.ctx.beginPath();
      Neo.ctx.ellipse(0, 3, radius * 1.12, radius * 0.72, Number(prop.breakAngle || 0) * 0.08, 0, Math.PI * 2);
      Neo.ctx.fill();
      for (let index = 0; index < 7; index += 1) {
        const seed = seedBase + index * 11.19;
        const angle = Number(prop.breakAngle || 0) + Math.sin(seed) * 1.8;
        const dist = 6 + ((Math.cos(seed * 1.7) + 1) * 0.5) * radius * 0.64;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist * 0.58 + 4;
        const w = 5 + ((Math.sin(seed * 3.1) + 1) * 0.5) * 10;
        const h = 3 + ((Math.cos(seed * 2.4) + 1) * 0.5) * 5;
        Neo.ctx.save();
        Neo.ctx.translate(x, y);
        Neo.ctx.rotate(angle + Math.sin(seed * 0.7) * 0.7);
        Neo.ctx.fillStyle = index % 2 === 0 ? '#5b3a24' : '#2f241d';
        Neo.ctx.fillRect(-w / 2, -h / 2, w, h);
        Neo.ctx.fillStyle = 'rgba(255, 150, 60, 0.18)';
        Neo.ctx.fillRect(-w / 2, -h / 2, w, 1.5);
        Neo.ctx.restore();
      }
      Neo.ctx.restore();
      return true;
    }
    if (prop?.kind !== 'wall' && prop?.kind !== 'cover_wall' && prop?.kind !== 'secret_wall') return false;
    const w = Math.max(24, Number(prop.w || prop.r * 2 || 52));
    const h = Math.max(24, Number(prop.h || prop.r * 2 || 52));
    const angle = Number(prop.breakAngle || 0);
    const seedBase = (prop.x || 0) * 0.173 + (prop.y || 0) * 0.291 + String(prop.kind || '').length * 17;
    const colors = prop.kind === 'cover_wall' && !prop.reinforced
      ? ['#7a4825', '#5a321c', '#b0743d']
      : prop.reinforced
        ? ['#727b86', '#aeb5bd', '#3f464d']
        : ['#6f685d', '#a09080', '#d0c8ba'];
    const chunkCount = prop.reinforced ? 11 : 9;

    Neo.ctx.save();
    Neo.ctx.translate(prop.x, prop.y);
    Neo.ctx.rotate(angle * 0.04);
    Neo.ctx.globalAlpha = 0.92;
    for (let index = 0; index < chunkCount; index += 1) {
      const seed = seedBase + index * 13.37;
      const side = Math.sin(seed * 1.7) * w * 0.34;
      const spread = Math.cos(seed * 2.1) * h * 0.26;
      const push = 5 + ((Math.sin(seed * 3.4) + 1) * 0.5) * 15;
      const x = Math.cos(angle + Math.PI / 2) * side + Math.cos(angle) * push;
      const y = Math.sin(angle + Math.PI / 2) * side + Math.sin(angle) * push + spread * 0.24;
      const cw = 5 + ((Math.cos(seed * 4.2) + 1) * 0.5) * 10;
      const ch = 4 + ((Math.sin(seed * 5.3) + 1) * 0.5) * 8;
      Neo.ctx.save();
      Neo.ctx.translate(x, y);
      Neo.ctx.rotate(angle + Math.sin(seed) * 0.9);
      Neo.ctx.fillStyle = colors[index % colors.length];
      Neo.ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      Neo.ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      Neo.ctx.fillRect(-cw / 2, ch / 2 - 2, cw, 2);
      Neo.ctx.restore();
    }
    Neo.ctx.restore();
    return true;
  }

  // Expose on Neo
  Neo.draw = draw;
  Neo.drawLowHealthEdgeGlow = drawLowHealthEdgeGlow;
  Neo.drawLadderPrompt = drawLadderPrompt;
  Neo.drawJesterPortalPrompt = drawJesterPortalPrompt;
  Neo.getRoomArtTheme = getRoomArtTheme;
  Neo.artNoise = artNoise;
  Neo.pickFloorTile = pickFloorTile;
  Neo.getGardenTileBias = getGardenTileBias;
  Neo.drawEnvironmentTile = drawEnvironmentTile;
  Neo.drawTiledRect = drawTiledRect;
  Neo.isStaticRoomLava = isStaticRoomLava;
  Neo.getStaticRoomLavaHazards = getStaticRoomLavaHazards;
  Neo.drawStaticLavaBase = drawStaticLavaBase;
  Neo.drawStaticLavaSeams = drawStaticLavaSeams;
  Neo.drawFloorTiles = drawFloorTiles;
  Neo.drawFloorDecals = drawFloorDecals;
  Neo.drawLockedDoor = drawLockedDoor;
  Neo.drawDoorThreshold = drawDoorThreshold;
  Neo.drawStoneWalls = drawStoneWalls;
  Neo.drawEnvironmentVignette = drawEnvironmentVignette;
  Neo.getEnvironmentBackgroundCacheKey = getEnvironmentBackgroundCacheKey;
  Neo.buildEnvironmentBackground = buildEnvironmentBackground;
  Neo.drawFloor = drawFloor;
  Neo.drawChests = drawChests;
  Neo.drawRoomDecor = drawRoomDecor;
  Neo.drawStructuresOverPlayer = drawStructuresOverPlayer;
  Neo.drawCoverWall = drawCoverWall;
  Neo.drawDestructibleBlockDamage = drawDestructibleBlockDamage;
  Neo.drawBrokenDestructible = drawBrokenDestructible;
