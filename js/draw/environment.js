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
    if (isPlayLike && !isDying) {
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
    if (!isDying) Neo.drawBossHealthBars();
    Neo.drawFloorTransition();
    Neo.perfEnd('draw.overlays', sectionPerfStart);
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

    const center = Neo.ctx.createRadialGradient(
      Neo.canvas.width / 2,
      Neo.canvas.height / 2,
      Math.min(Neo.canvas.width, Neo.canvas.height) * 0.34,
      Neo.canvas.width / 2,
      Neo.canvas.height / 2,
      Math.max(Neo.canvas.width, Neo.canvas.height) * 0.72,
    );
    center.addColorStop(0, 'rgba(255,0,0,0)');
    center.addColorStop(0.62, `rgba(190,0,18,${alpha * 0.42})`);
    center.addColorStop(1, `rgba(255,0,22,${alpha})`);
    Neo.ctx.fillStyle = center;
    Neo.ctx.fillRect(0, 0, Neo.canvas.width, Neo.canvas.height);

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
    const ladderHint = Neo.getAscendControlHint ? Neo.getAscendControlHint() : Neo.formatControlLabel('space', 'space');
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
    const portal = Neo.pickups.find(pickup => pickup?.type === 'jesterPortal' && pickup.active);
    if (!portal) return;
    if (Neo.dist(Neo.player.x, Neo.player.y, portal.x, portal.y) > 74) return;
    const cx = portal.x;
    const cy = portal.y - 38;
    const floors = Math.max(1, Number(portal.skipFloors || 1));
    Neo.ctx.save();
    Neo.ctx.font = 'bold 14px system-ui';
    Neo.ctx.textAlign = 'center';
    Neo.ctx.textBaseline = 'middle';
    const text = `Touch to skip ${floors} floors`;
    const pad = 14;
    const tw = Neo.ctx.measureText(text).width;
    Neo.ctx.fillStyle = 'rgba(28,11,32,0.86)';
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(cx - tw / 2 - pad, cy - 13, tw + pad * 2, 26, 8);
    Neo.ctx.fill();
    Neo.ctx.strokeStyle = 'rgba(255,155,228,0.62)';
    Neo.ctx.lineWidth = 1.5;
    Neo.ctx.stroke();
    Neo.ctx.fillStyle = '#ffc9ef';
    Neo.ctx.fillText(text, cx, cy);
    Neo.ctx.restore();
  }

  function getRoomArtTheme(room = Neo.currentRoom) {
    if (!room) return Neo.ROOM_ART_THEMES.dungeon;
    if (room.type === 'shop') return Neo.ROOM_ART_THEMES.shop;
    if (room.type === 'anvil') return Neo.ROOM_ART_THEMES.anvil;
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

  function drawFloorTiles(theme, target = Neo.ctx) {
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
    target.restore();
  }

  function drawFloorDecals(theme, target = Neo.ctx) {
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
    const combatKey = Neo.enemies.length > 0 ? 'combat' : 'calm';
    return `${Neo.floor}|${roomKey}|${doorsKey}|${combatKey}`;
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

      if (chest.open) {
        Neo.ctx.fillStyle = '#5c3118';
        Neo.ctx.fillRect(-30, -2, 60, 26);
        Neo.ctx.fillStyle = '#2b160b';
        Neo.ctx.fillRect(-30, 16, 60, 8);
        Neo.ctx.fillRect(20, -2, 10, 26);
        Neo.ctx.fillStyle = '#a7632d';
        Neo.ctx.fillRect(-26, 2, 46, 3);
        Neo.ctx.fillRect(-26, 2, 3, 14);
        Neo.ctx.fillStyle = '#17100b';
        Neo.ctx.fillRect(-22, -13, 44, 11);
        Neo.ctx.fillStyle = '#7e461e';
        Neo.ctx.fillRect(-20, -24, 40, 11);
        Neo.ctx.fillStyle = '#c7792f';
        Neo.ctx.fillRect(-17, -22, 32, 3);
      } else {
        Neo.ctx.fillStyle = '#7e431e';
        Neo.ctx.fillRect(-32, -20, 64, 44);
        Neo.ctx.fillStyle = '#4b2612';
        Neo.ctx.fillRect(-32, 12, 64, 12);
        Neo.ctx.fillRect(22, -20, 10, 44);
        Neo.ctx.fillStyle = '#c7772d';
        Neo.ctx.fillRect(-28, -16, 50, 4);
        Neo.ctx.fillRect(-28, -16, 4, 28);
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
      Neo.ctx.restore();
    });
  }

  function drawRoomDecor() {
    const theme = getRoomArtTheme();
    Neo.decorations.forEach(decor => {
      Neo.ctx.save();
      Neo.ctx.translate(decor.x, decor.y);
      if (decor.kind === 'rubble') {
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
        Neo.ctx.fillStyle = 'rgba(0,0,0,0.22)';
        Neo.ctx.fillRect(-12, -18, 24, 42);
        Neo.ctx.fillStyle = theme.banner;
        Neo.ctx.fillRect(-10, -24, 20, 38);
        Neo.ctx.fillStyle = 'rgba(0,0,0,0.24)';
        Neo.ctx.fillRect(7, -24, 3, 38);
        Neo.ctx.fillRect(-10, 11, 20, 3);
        Neo.ctx.fillStyle = 'rgba(255,220,140,0.24)';
        Neo.ctx.fillRect(-8, -22, 14, 2);
        Neo.ctx.fillRect(-8, -22, 2, 30);
        Neo.ctx.strokeStyle = 'rgba(229,185,98,0.36)';
        Neo.ctx.lineWidth = 1;
        Neo.ctx.strokeRect(-10.5, -24.5, 20, 38);
        Neo.ctx.fillStyle = 'rgba(229,185,98,0.45)';
        Neo.ctx.fillRect(-13, -26, 26, 3);
      } else if (decor.kind === 'crack') {
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
        Neo.ctx.fillStyle = 'rgba(26,20,14,0.9)';
        Neo.ctx.fillRect(-decor.r * 0.7, -2, decor.r * 1.4, decor.r * 0.8);
        Neo.ctx.fillStyle = 'rgba(90,95,92,0.82)';
        Neo.ctx.fillRect(-decor.r * 0.5, -5, decor.r, 4);
        Neo.ctx.fillStyle = 'rgba(210,135,72,0.72)';
        Neo.ctx.fillRect(-3, -10, 6, 8);
        Neo.ctx.fillStyle = 'rgba(245,202,120,0.72)';
        Neo.ctx.fillRect(-1, -8, 2, 5);
      } else if (decor.kind === 'torch') {
        Neo.ctx.fillStyle = 'rgba(28, 20, 12, 0.95)';
        Neo.ctx.fillRect(-2, -6, 4, 18);
        Neo.ctx.fillStyle = '#5b6670';
        Neo.ctx.fillRect(-6, -4, 12, 4);
        Neo.ctx.fillStyle = 'rgba(210,135,72,0.72)';
        Neo.ctx.fillRect(-3, -16, 6, 10);
        Neo.ctx.fillStyle = 'rgba(245,202,120,0.72)';
        Neo.ctx.fillRect(-1, -14, 2, 6);
      } else if (decor.kind === 'tree') {
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

    Neo.structures.forEach(structure => {
      Neo.ctx.save();
      Neo.ctx.translate(structure.x, structure.y);
      if (structure.kind === 'pillar') {
        drawEnvironmentTile('pillar_stone', -structure.w / 2, -structure.h / 2, structure.w, structure.h);
        Neo.ctx.strokeStyle = theme.wallEdge;
        Neo.ctx.lineWidth = 1.5;
        Neo.ctx.strokeRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
      } else {
        drawEnvironmentTile('wall_block', -structure.w / 2, -structure.h / 2, structure.w, structure.h);
        Neo.ctx.strokeStyle = theme.wallEdge;
        Neo.ctx.lineWidth = 1.5;
        Neo.ctx.strokeRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
      }
      Neo.ctx.restore();
    });
  }

  function drawCoverWall(prop) {
    const w = Math.max(16, Number(prop.w || prop.r * 2 || 48));
    const h = Math.max(16, Number(prop.h || prop.r * 2 || 48));
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
  Neo.drawCoverWall = drawCoverWall;
