  function draw() {
    const isDying = gameState === 'dying';
    const isPlayLike = gameState === 'play' || gameState === 'pause' || gameState === 'dialogue' || isDying;
    let sectionPerfStart = perfStart();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isPlayLike) {
      const split = isSplitScreen();
      if (split) {
        const slots = getActivePlayerSlots();
        const sc = slots.length;
        const vpW = Math.floor(canvas.width / 2);
        const vpH = sc >= 3 ? Math.floor(canvas.height / 2) : canvas.height;
        slots.forEach((slot, index) => {
          const col = index % 2;
          const row = sc >= 3 ? Math.floor(index / 2) : 0;
          drawWorldViewport(slot.getCamera(), col * vpW, vpW, vpH, row * vpH, slot.label, slot);
        });
        // Dividers
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(vpW - 1, 0, 2, canvas.height);
        if (sc >= 3) ctx.fillRect(0, vpH - 1, canvas.width, 2);
        ctx.restore();
      } else {
        drawWorldViewport(camera, 0, canvas.width, canvas.height, 0, null);
      }
      perfEnd('draw.room', sectionPerfStart);
    }

    sectionPerfStart = perfStart();
    if (isPlayLike && !isDying) {
      const minimapLayout = drawMinimap();
      uiController.setObjectiveLayout(minimapLayout?.viewportBounds || null);
    } else {
      minimapLayoutState = null;
      uiController.setObjectiveLayout(null);
    }
    perfEnd('draw.minimap', sectionPerfStart);

    sectionPerfStart = perfStart();
    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (!isDying) drawLowHealthEdgeGlow();
    if (isDying && playerDeathAnim) drawDeathOverlay(playerDeathAnim);
    if (!isDying && godTimer > 0) drawGodModeBar();
    if (!isDying) drawBossHealthBars();
    drawFloorTransition();
    perfEnd('draw.overlays', sectionPerfStart);
  }

  function drawLowHealthEdgeGlow() {
    if (!player || gameState !== 'play' || !Number.isFinite(player.hp) || !Number.isFinite(player.maxHp) || player.maxHp <= 0) return;
    const access = window.NeoSettings?.getAccess() || {};
    const now = Date.now();
    const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
    const hitFlashActive = lowHealthHitFlashUntil > now;
    // With reduceFlash: skip the hit-flash-at-healthy-HP effect entirely; static glow only.
    const isForcedHitFlash = !access.reduceFlash && hitFlashActive && hpRatio >= 0.2;
    const effectiveHpRatio = isForcedHitFlash ? 0.17 : hpRatio;
    if (effectiveHpRatio >= 0.2) return;

    const danger = (0.2 - effectiveHpRatio) / 0.2;
    // With reduceFlash: no sine pulse — use a stable alpha
    const pulse = access.reduceFlash ? 0.82 : (0.74 + Math.sin(now / 120) * 0.18);
    const baseAlpha = clamp((0.16 + danger * 0.34) * pulse, 0, 0.52);
    const alpha = isForcedHitFlash ? baseAlpha * 0.45 : baseAlpha;
    const baseEdge = Math.max(92, Math.min(canvas.width, canvas.height) * (0.18 + danger * 0.08));
    const edge = isForcedHitFlash ? baseEdge * 0.78 : baseEdge;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    const center = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      Math.min(canvas.width, canvas.height) * 0.34,
      canvas.width / 2,
      canvas.height / 2,
      Math.max(canvas.width, canvas.height) * 0.72,
    );
    center.addColorStop(0, 'rgba(255,0,0,0)');
    center.addColorStop(0.62, `rgba(190,0,18,${alpha * 0.42})`);
    center.addColorStop(1, `rgba(255,0,22,${alpha})`);
    ctx.fillStyle = center;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = `rgba(255,24,32,${alpha * 0.55})`;
    ctx.shadowColor = '#ff1e28';
    ctx.shadowBlur = 28;
    ctx.fillRect(0, 0, canvas.width, edge * 0.24);
    ctx.fillRect(0, canvas.height - edge * 0.24, canvas.width, edge * 0.24);
    ctx.fillRect(0, 0, edge * 0.18, canvas.height);
    ctx.fillRect(canvas.width - edge * 0.18, 0, edge * 0.18, canvas.height);

    ctx.restore();
  }

  function drawLadderPrompt() {
    if (gameState !== 'play' || !currentRoom?.cleared) return;
    const ladder = pickups.find(pickup => pickup?.type === 'ladder');
    if (!ladder) return;
    if (dist(player.x, player.y, ladder.x, ladder.y) > LADDER_TRIGGER_RADIUS) return;
    const cx = ladder.x;
    const cy = ladder.y - 36;
    ctx.save();
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ladderHint = formatControlLabel('space', 'space');
    const text = `Press [${ladderHint}] to go to next floor`;
    const pad = 14;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(10,24,14,0.86)';
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2 - pad, cy - 13, tw + pad * 2, 26, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,255,158,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#8fffaf';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  function drawJesterPortalPrompt() {
    if (gameState !== 'play') return;
    const portal = pickups.find(pickup => pickup?.type === 'jesterPortal' && pickup.active);
    if (!portal) return;
    if (dist(player.x, player.y, portal.x, portal.y) > 74) return;
    const cx = portal.x;
    const cy = portal.y - 38;
    const floors = Math.max(1, Number(portal.skipFloors || 1));
    ctx.save();
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = `Touch to skip ${floors} floors`;
    const pad = 14;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(28,11,32,0.86)';
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2 - pad, cy - 13, tw + pad * 2, 26, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,155,228,0.62)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffc9ef';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  function getRoomArtTheme(room = currentRoom) {
    if (!room) return ROOM_ART_THEMES.dungeon;
    if (room.type === 'shop') return ROOM_ART_THEMES.shop;
    if (room.type === 'anvil') return ROOM_ART_THEMES.anvil;
    if (room.type === 'god') return ROOM_ART_THEMES.god;
    if (room.type === 'boss' || BOSS_TYPES.has(room.type)) return ROOM_ART_THEMES.boss;
    if (room.type === 'secret') return ROOM_ART_THEMES.secret;
    if (room.type === 'treasure' || room.type === 'ladder') return ROOM_ART_THEMES.treasure;
    if (room.type === 'challenge') return ROOM_ART_THEMES.boss;
    return ROOM_ART_THEMES.dungeon;
  }

  function artNoise(tileX, tileY, salt = 0, room = currentRoom) {
    const gx = Number(room?.gx || 0);
    const gy = Number(room?.gy || 0);
    const value = Math.sin(tileX * 127.1 + tileY * 311.7 + gx * 74.7 + gy * 19.3 + floor * 13.1 + salt * 101.9) * 43758.5453;
    return value - Math.floor(value);
  }

  function pickFloorTile(tileX, tileY, theme) {
    const tiles = theme.floorTiles && theme.floorTiles.length ? theme.floorTiles : ['floor_stone_a'];
    const gardenTiles = theme.gardenFloorTiles && theme.gardenFloorTiles.length ? theme.gardenFloorTiles : tiles;
    const noise = artNoise(tileX, tileY, 1);
    const gardenBias = getGardenTileBias(currentRoom, theme);
    if (gardenTiles.length && noise < gardenBias) {
      const gardenNoise = artNoise(tileX, tileY, 9);
      return gardenTiles[Math.min(gardenTiles.length - 1, Math.floor(gardenNoise * gardenTiles.length))];
    }
    return tiles[Math.min(tiles.length - 1, Math.floor(noise * tiles.length))];
  }

  function getGardenTileBias(room = currentRoom, theme = getRoomArtTheme(room)) {
    if (floor <= 5) return 0;
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
    if (theme === ROOM_ART_THEMES.secret) bias += 0.04;
    return clamp(bias + Math.min(0.08, Math.max(0, (10 - floor) * 0.006)), 0.08, 0.72);
  }

  function drawEnvironmentTile(tileKey, x, y, w = ENV_TILE_SIZE, h = ENV_TILE_SIZE, options = {}) {
    const target = options.ctx || ctx;
    const frame = ENV_TILE_ATLAS.frames[tileKey];
    if (!frame) {
      target.fillStyle = options.fallback || '#30342f';
      target.fillRect(x, y, w, h);
      return;
    }
    target.save();
    target.globalAlpha = options.alpha ?? 1;
    target.imageSmoothingEnabled = false;
    target.drawImage(
      ENV_TILE_ATLAS.canvas,
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
    const target = options.ctx || ctx;
    const tileSize = options.tileSize || ENV_TILE_SIZE;
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

  function drawFloorTiles(theme, target = ctx) {
    target.save();
    target.beginPath();
    target.rect(WALL, WALL, ROOM_W - WALL * 2, ROOM_H - WALL * 2);
    target.clip();
    for (let y = WALL; y < ROOM_H - WALL; y += ENV_TILE_SIZE) {
      for (let x = WALL; x < ROOM_W - WALL; x += ENV_TILE_SIZE) {
        const tileX = Math.floor((x - WALL) / ENV_TILE_SIZE);
        const tileY = Math.floor((y - WALL) / ENV_TILE_SIZE);
        const tile = pickFloorTile(tileX, tileY, theme);
        drawEnvironmentTile(tile, x, y, ENV_TILE_SIZE, ENV_TILE_SIZE, { tint: theme.floorTint, ctx: target });
      }
    }
    target.restore();
  }

  function drawFloorDecals(theme, target = ctx) {
    target.save();
    target.beginPath();
    target.rect(WALL + 8, WALL + 8, ROOM_W - WALL * 2 - 16, ROOM_H - WALL * 2 - 16);
    target.clip();
    const gardenBias = getGardenTileBias();
    const cols = Math.ceil((ROOM_W - WALL * 2) / ENV_TILE_SIZE);
    const rows = Math.ceil((ROOM_H - WALL * 2) / ENV_TILE_SIZE);
    for (let ty = 0; ty < rows; ty += 1) {
      for (let tx = 0; tx < cols; tx += 1) {
        const x = WALL + tx * ENV_TILE_SIZE;
        const y = WALL + ty * ENV_TILE_SIZE;
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

  function drawLockedDoor(dir, target = ctx) {
    const isNorth = dir === 'n';
    const isSouth = dir === 's';
    const isWest = dir === 'w';

    // Door panel bounds (the opening in the wall)
    let dx, dy, dw, dh;
    if (isNorth) {
      dx = (ROOM_W - DOOR) / 2; dy = 0; dw = DOOR; dh = WALL + 10;
    } else if (isSouth) {
      dx = (ROOM_W - DOOR) / 2; dy = ROOM_H - WALL - 10; dw = DOOR; dh = WALL + 10;
    } else if (isWest) {
      dx = 0; dy = (ROOM_H - DOOR) / 2; dw = WALL + 10; dh = DOOR;
    } else {
      dx = ROOM_W - WALL - 10; dy = (ROOM_H - DOOR) / 2; dw = WALL + 10; dh = DOOR;
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
    const hingeOffsets = isNorth || isSouth ? [-DOOR * 0.28, DOOR * 0.28] : [-DOOR * 0.28, DOOR * 0.28];
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

  function drawDoorThreshold(dir, theme, locked, target = ctx) {
    const isNorth = dir === 'n';
    const isSouth = dir === 's';
    const isWest = dir === 'w';
    const x = isWest ? 0 : isNorth || isSouth ? (ROOM_W - DOOR) / 2 : ROOM_W - WALL - 10;
    const y = isNorth ? 0 : isSouth ? ROOM_H - WALL - 10 : (ROOM_H - DOOR) / 2;
    const w = isWest || dir === 'e' ? WALL + 10 : DOOR;
    const h = isNorth || isSouth ? WALL + 10 : DOOR;
    if (locked) {
      drawTiledRect(theme.thresholdTile, x, y, w, h, { tileSize: ENV_TILE_SIZE, tint: theme.floorTint, ctx: target });
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
      const edgeY = isNorth ? WALL + 3 : ROOM_H - WALL - 3;
      target.moveTo((ROOM_W - DOOR) / 2 + 12, edgeY);
      target.lineTo((ROOM_W + DOOR) / 2 - 12, edgeY);
    } else {
      const edgeX = isWest ? WALL + 3 : ROOM_W - WALL - 3;
      target.moveTo(edgeX, (ROOM_H - DOOR) / 2 + 12);
      target.lineTo(edgeX, (ROOM_H + DOOR) / 2 - 12);
    }
    target.stroke();

    if (locked) {
      drawLockedDoor(dir, target);
    }

    target.restore();
  }

  function drawStoneWalls(theme, target = ctx) {
    drawTiledRect(theme.wallTile, 0, 0, ROOM_W, WALL + 8, { tileSize: ENV_TILE_SIZE, ctx: target });
    drawTiledRect(theme.wallTile, 0, ROOM_H - WALL - 8, ROOM_W, WALL + 8, { tileSize: ENV_TILE_SIZE, ctx: target });
    drawTiledRect(theme.wallTile, 0, 0, WALL + 8, ROOM_H, { tileSize: ENV_TILE_SIZE, ctx: target });
    drawTiledRect(theme.wallTile, ROOM_W - WALL - 8, 0, WALL + 8, ROOM_H, { tileSize: ENV_TILE_SIZE, ctx: target });

    const roomLocked = isRoomLocked();
    DIRECTIONS.forEach(dir => {
      if (hasVisibleRoomExit(currentRoom, dir)) drawDoorThreshold(dir, theme, roomLocked, target);
    });

    target.save();
    target.fillStyle = theme.wallShadow;
    target.fillRect(WALL, WALL, ROOM_W - WALL * 2, 8);
    target.fillRect(WALL, ROOM_H - WALL - 8, ROOM_W - WALL * 2, 8);
    target.fillRect(WALL, WALL, 8, ROOM_H - WALL * 2);
    target.fillRect(ROOM_W - WALL - 8, WALL, 8, ROOM_H - WALL * 2);
    target.strokeStyle = enemies.length > 0 ? theme.combatAccent : theme.wallEdge;
    target.lineWidth = enemies.length > 0 ? 3 : 2;
    const inset = WALL + 3;
    const left = inset;
    const right = ROOM_W - inset;
    const top = inset;
    const bottom = ROOM_H - inset;
    const doorMinX = (ROOM_W - DOOR) / 2 + 10;
    const doorMaxX = (ROOM_W + DOOR) / 2 - 10;
    const doorMinY = (ROOM_H - DOOR) / 2 + 10;
    const doorMaxY = (ROOM_H + DOOR) / 2 - 10;
    target.beginPath();
    if (hasVisibleRoomExit(currentRoom, 'n')) {
      target.moveTo(left, top); target.lineTo(doorMinX, top);
      target.moveTo(doorMaxX, top); target.lineTo(right, top);
    } else {
      target.moveTo(left, top); target.lineTo(right, top);
    }
    if (hasVisibleRoomExit(currentRoom, 's')) {
      target.moveTo(left, bottom); target.lineTo(doorMinX, bottom);
      target.moveTo(doorMaxX, bottom); target.lineTo(right, bottom);
    } else {
      target.moveTo(left, bottom); target.lineTo(right, bottom);
    }
    if (hasVisibleRoomExit(currentRoom, 'w')) {
      target.moveTo(left, top); target.lineTo(left, doorMinY);
      target.moveTo(left, doorMaxY); target.lineTo(left, bottom);
    } else {
      target.moveTo(left, top); target.lineTo(left, bottom);
    }
    if (hasVisibleRoomExit(currentRoom, 'e')) {
      target.moveTo(right, top); target.lineTo(right, doorMinY);
      target.moveTo(right, doorMaxY); target.lineTo(right, bottom);
    } else {
      target.moveTo(right, top); target.lineTo(right, bottom);
    }
    target.stroke();

    // Draw bright arch accent on each open door gap so exits are obvious
    if (!roomLocked) {
      target.strokeStyle = theme.doorAccent;
      target.lineWidth = 3;
      target.shadowColor = theme.doorAccent;
      target.shadowBlur = 14;
      target.beginPath();
      if (hasVisibleRoomExit(currentRoom, 'n')) {
        target.moveTo(doorMinX, top); target.lineTo(doorMaxX, top);
      }
      if (hasVisibleRoomExit(currentRoom, 's')) {
        target.moveTo(doorMinX, bottom); target.lineTo(doorMaxX, bottom);
      }
      if (hasVisibleRoomExit(currentRoom, 'w')) {
        target.moveTo(left, doorMinY); target.lineTo(left, doorMaxY);
      }
      if (hasVisibleRoomExit(currentRoom, 'e')) {
        target.moveTo(right, doorMinY); target.lineTo(right, doorMaxY);
      }
      target.stroke();
    }

    target.restore();
  }

  function drawEnvironmentVignette(theme, target = ctx) {
    const gradient = target.createRadialGradient(
      ROOM_W / 2,
      ROOM_H / 2,
      120,
      ROOM_W / 2,
      ROOM_H / 2,
      Math.max(ROOM_W, ROOM_H) * 0.74,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, theme.vignette || 'rgba(0,0,0,0.4)');
    target.fillStyle = gradient;
    target.fillRect(0, 0, ROOM_W, ROOM_H);
  }

  function getEnvironmentBackgroundCacheKey() {
    const roomKey = currentRoom
      ? `${currentRoom.gx},${currentRoom.gy},${currentRoom.type || 'room'},${currentRoom.secretKind || ''}`
      : 'none';
    const doorsKey = DIRECTIONS.map(dir => hasVisibleRoomExit(currentRoom, dir) ? '1' : '0').join('');
    const combatKey = enemies.length > 0 ? 'combat' : 'calm';
    return `${floor}|${roomKey}|${doorsKey}|${combatKey}`;
  }

  function buildEnvironmentBackground(theme) {
    const canvasEl = document.createElement('canvas');
    canvasEl.width = ROOM_W;
    canvasEl.height = ROOM_H;
    const bg = canvasEl.getContext('2d');
    bg.imageSmoothingEnabled = false;
    bg.fillStyle = theme.backdrop;
    bg.fillRect(0, 0, ROOM_W, ROOM_H);
    drawFloorTiles(theme, bg);
    drawFloorDecals(theme, bg);
    drawStoneWalls(theme, bg);
    drawEnvironmentVignette(theme, bg);
    return canvasEl;
  }

  function drawFloor() {
    const theme = getRoomArtTheme();
    const cacheKey = getEnvironmentBackgroundCacheKey();
    if (!environmentBackgroundCache.canvas || environmentBackgroundCache.key !== cacheKey) {
      environmentBackgroundCache = {
        key: cacheKey,
        canvas: buildEnvironmentBackground(theme),
      };
    }
    ctx.drawImage(environmentBackgroundCache.canvas, 0, 0);
  }

  function drawChests() {
    chests.forEach(chest => {
      const t = Date.now() / 260 + chest.x * 0.01;
      ctx.save();
      ctx.translate(chest.x, chest.y);
      ctx.imageSmoothingEnabled = false;

      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(-28, 14, 56, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-20, 22, 40, 4);

      if (!chest.open) {
        ctx.shadowColor = '#ffd36a';
        ctx.shadowBlur = 8 + Math.sin(t) * 3;
        ctx.fillStyle = 'rgba(255,190,74,0.16)';
        ctx.fillRect(-32, -24, 64, 48);
      }

      ctx.shadowBlur = 0;

      if (chest.open) {
        ctx.fillStyle = '#1a0d06';
        ctx.fillRect(-26, -20, 52, 8);
        ctx.fillRect(-30, -12, 60, 8);
        ctx.fillStyle = '#6b3718';
        ctx.fillRect(-22, -24, 44, 8);
        ctx.fillStyle = '#b86825';
        ctx.fillRect(-18, -24, 36, 4);
        ctx.fillStyle = '#282b31';
        ctx.fillRect(-18, -24, 6, 12);
        ctx.fillRect(12, -24, 6, 12);

        ctx.fillStyle = '#1a0d06';
        ctx.fillRect(-30, -4, 60, 28);
        ctx.fillStyle = '#3d2012';
        ctx.fillRect(-26, 0, 52, 20);
        ctx.fillStyle = '#120907';
        ctx.fillRect(-20, 2, 40, 12);
        ctx.fillStyle = '#7f4a24';
        ctx.fillRect(-26, 16, 52, 4);
        ctx.fillStyle = '#282f38';
        ctx.fillRect(-20, -4, 6, 28);
        ctx.fillRect(14, -4, 6, 28);
      } else {
        ctx.fillStyle = '#1a0d06';
        ctx.fillRect(-32, -20, 64, 44);
        ctx.fillStyle = '#7e3f1a';
        ctx.fillRect(-28, -2, 56, 24);
        ctx.fillStyle = '#a95f22';
        ctx.fillRect(-28, -18, 56, 18);
        ctx.fillStyle = '#d3822d';
        ctx.fillRect(-24, -18, 48, 6);
        ctx.fillStyle = '#efad42';
        ctx.fillRect(-20, -16, 40, 4);
        ctx.fillStyle = '#5a2a12';
        ctx.fillRect(-24, 6, 48, 6);

        ctx.fillStyle = '#303946';
        ctx.fillRect(-22, -22, 6, 46);
        ctx.fillRect(16, -22, 6, 46);
        ctx.fillRect(-30, -4, 60, 6);
        ctx.fillStyle = '#69727e';
        ctx.fillRect(-20, -20, 2, 40);
        ctx.fillRect(18, -20, 2, 40);

        ctx.fillStyle = '#ffd86c';
        ctx.fillRect(-8, -2, 16, 16);
        ctx.fillStyle = '#271302';
        ctx.fillRect(-6, -2, 12, 2);
        ctx.fillRect(-6, 12, 12, 2);
        ctx.fillRect(-8, 0, 2, 12);
        ctx.fillRect(6, 0, 2, 12);
        ctx.fillStyle = '#4a260d';
        ctx.fillRect(-2, 5, 4, 6);
      }
      ctx.restore();
    });
  }

  function drawRoomDecor() {
    const theme = getRoomArtTheme();
    decorations.forEach(decor => {
      ctx.save();
      ctx.translate(decor.x, decor.y);
      if (decor.kind === 'rubble') {
        ctx.fillStyle = 'rgba(42,44,38,0.55)';
        ctx.beginPath();
        ctx.ellipse(0, 1, decor.r * 1.15, decor.r * 0.62, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(92,91,76,0.38)';
        for (let index = 0; index < 5; index += 1) {
          const angle = index * 1.7 + decor.x * 0.01;
          const rx = Math.cos(angle) * decor.r * 0.55;
          const ry = Math.sin(angle) * decor.r * 0.28;
          ctx.fillRect(rx - 3, ry - 2, 6, 4);
        }
      } else if (decor.kind === 'banner') {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(-12, -18, 24, 42);
        ctx.fillStyle = theme.banner;
        ctx.beginPath();
        ctx.moveTo(-11, -24);
        ctx.lineTo(11, -24);
        ctx.lineTo(9, 17);
        ctx.lineTo(2, 11);
        ctx.lineTo(-6, 20);
        ctx.lineTo(-9, 17);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(229,185,98,0.32)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-13, -25);
        ctx.lineTo(13, -25);
        ctx.stroke();
      } else if (decor.kind === 'crack') {
        ctx.strokeStyle = theme.crack;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-decor.r, -6);
        ctx.lineTo(-8, 0);
        ctx.lineTo(0, -8);
        ctx.lineTo(10, 4);
        ctx.lineTo(decor.r, -2);
        ctx.stroke();
      } else if (decor.kind === 'brazier') {
        ctx.fillStyle = 'rgba(26,20,14,0.9)';
        ctx.beginPath();
        ctx.arc(0, 3, decor.r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,120,60,0.78)';
        ctx.shadowColor = '#ff7b39';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, -2, decor.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (decor.kind === 'torch') {
        ctx.fillStyle = 'rgba(28, 20, 12, 0.95)';
        ctx.fillRect(-2, -6, 4, 18);
        ctx.fillStyle = '#5b6670';
        ctx.fillRect(-6, -4, 12, 4);
        ctx.shadowColor = '#ff9648';
        ctx.shadowBlur = 14;
        ctx.fillStyle = 'rgba(255, 126, 58, 0.92)';
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.quadraticCurveTo(7, -8, 0, -2);
        ctx.quadraticCurveTo(-7, -9, 0, -18);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 226, 150, 0.82)';
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.quadraticCurveTo(4, -9, 0, -5);
        ctx.quadraticCurveTo(-4, -9, 0, -15);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (decor.kind === 'tree') {
        // Shadow
        ctx.fillStyle = 'rgba(20,30,14,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, decor.r * 0.7, decor.r * 0.9, decor.r * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        // Trunk
        ctx.fillStyle = '#5c3a1e';
        ctx.fillRect(-4, -decor.r * 0.3, 8, decor.r * 0.85);
        // Canopy layers
        ctx.shadowColor = '#3a7d2c';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#3a7d2c';
        ctx.beginPath();
        ctx.arc(0, -decor.r * 0.5, decor.r * 0.78, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#52a83a';
        ctx.beginPath();
        ctx.arc(-decor.r * 0.22, -decor.r * 0.7, decor.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(decor.r * 0.22, -decor.r * 0.78, decor.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(160,230,100,0.25)';
        ctx.beginPath();
        ctx.arc(-decor.r * 0.15, -decor.r * 0.85, decor.r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (decor.kind === 'fruit_tree') {
        ctx.fillStyle = 'rgba(18,30,12,0.34)';
        ctx.beginPath();
        ctx.ellipse(0, decor.r * 0.74, decor.r, decor.r * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5f3d1f';
        ctx.fillRect(-4, -decor.r * 0.28, 8, decor.r * 0.9);
        ctx.fillStyle = '#3f7a2d';
        ctx.beginPath();
        ctx.arc(0, -decor.r * 0.46, decor.r * 0.84, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#58a73d';
        ctx.beginPath();
        ctx.arc(-decor.r * 0.28, -decor.r * 0.68, decor.r * 0.58, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(decor.r * 0.26, -decor.r * 0.74, decor.r * 0.52, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff7385';
        ctx.shadowColor = '#ff7f8f';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(-decor.r * 0.18, -decor.r * 0.62, 3, 0, Math.PI * 2);
        ctx.arc(decor.r * 0.15, -decor.r * 0.5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (decor.kind === 'moss_patch') {
        ctx.fillStyle = 'rgba(17,34,18,0.5)';
        ctx.beginPath();
        ctx.ellipse(0, 2, decor.r * 1.2, decor.r * 0.56, decor.x * 0.01, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(92,145,72,0.5)';
        ctx.beginPath();
        ctx.ellipse(-decor.r * 0.2, -1, decor.r * 0.74, decor.r * 0.34, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(149,208,109,0.22)';
        ctx.fillRect(-decor.r * 0.4, -1, decor.r * 0.45, 2);
      }
      ctx.restore();
    });

    structures.forEach(structure => {
      ctx.save();
      ctx.translate(structure.x, structure.y);
      if (structure.kind === 'pillar') {
        drawEnvironmentTile('pillar_stone', -structure.w / 2, -structure.h / 2, structure.w, structure.h);
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
      } else {
        drawEnvironmentTile('wall_block', -structure.w / 2, -structure.h / 2, structure.w, structure.h);
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-structure.w / 2, -structure.h / 2, structure.w, structure.h);
      }
      ctx.restore();
    });
  }

  function drawCoverWall(prop) {
    const w = Math.max(16, Number(prop.w || prop.r * 2 || 48));
    const h = Math.max(16, Number(prop.h || prop.r * 2 || 48));
    const left = -w / 2;
    const top = -h / 2;
    const hpRatio = clamp(Number(prop.hp || 0) / Math.max(1, Number(prop.maxHp || prop.hp || 1)), 0, 1);
    const damageAlpha = (1 - hpRatio) * 0.45;

    const wood = ctx.createLinearGradient(left, top, left + w, top + h);
    wood.addColorStop(0, '#5b341d');
    wood.addColorStop(0.5, '#8a5229');
    wood.addColorStop(1, '#4b2a18');
    ctx.fillStyle = wood;
    ctx.fillRect(left, top, w, h);

    const horizontal = w >= h;
    const plankCount = Math.max(2, Math.floor((horizontal ? h : w) / 18));
    ctx.strokeStyle = 'rgba(38,20,10,0.72)';
    ctx.lineWidth = 2;
    for (let index = 1; index < plankCount; index += 1) {
      ctx.beginPath();
      if (horizontal) {
        const y = top + (h / plankCount) * index;
        ctx.moveTo(left + 3, y);
        ctx.lineTo(left + w - 3, y);
      } else {
        const x = left + (w / plankCount) * index;
        ctx.moveTo(x, top + 3);
        ctx.lineTo(x, top + h - 3);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(245,188,104,0.18)';
    ctx.lineWidth = 1;
    for (let index = 0; index < 4; index += 1) {
      const offset = (index + 0.35) / 4;
      ctx.beginPath();
      if (horizontal) {
        const y = top + h * offset;
        ctx.moveTo(left + 8, y);
        ctx.lineTo(left + w - 8, y + Math.sin(index + prop.x * 0.01) * 3);
      } else {
        const x = left + w * offset;
        ctx.moveTo(x, top + 8);
        ctx.lineTo(x + Math.sin(index + prop.y * 0.01) * 3, top + h - 8);
      }
      ctx.stroke();
    }

    if (prop.reinforced) {
      ctx.fillStyle = 'rgba(96, 105, 116, 0.92)';
      ctx.strokeStyle = 'rgba(190, 198, 208, 0.42)';
      ctx.lineWidth = 1;
      if (horizontal) {
        [-0.28, 0.28].forEach(offset => {
          const y = offset * h;
          ctx.fillRect(left, y - 5, w, 10);
          ctx.strokeRect(left + 0.5, y - 4.5, w - 1, 9);
        });
      } else {
        [-0.28, 0.28].forEach(offset => {
          const x = offset * w;
          ctx.fillRect(x - 5, top, 10, h);
          ctx.strokeRect(x - 4.5, top + 0.5, 9, h - 1);
        });
      }
    }

    if (damageAlpha > 0) {
      ctx.fillStyle = `rgba(20, 10, 4, ${damageAlpha})`;
      ctx.fillRect(left, top, w, h);
      ctx.strokeStyle = `rgba(255, 210, 140, ${0.22 + damageAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left + w * 0.25, top + h * 0.25);
      ctx.lineTo(left + w * 0.46, top + h * 0.52);
      ctx.lineTo(left + w * 0.4, top + h * 0.78);
      ctx.moveTo(left + w * 0.64, top + h * 0.18);
      ctx.lineTo(left + w * 0.55, top + h * 0.48);
      ctx.lineTo(left + w * 0.74, top + h * 0.72);
      ctx.stroke();
    }

    ctx.strokeStyle = prop.reinforced ? 'rgba(198, 205, 214, 0.58)' : 'rgba(38, 20, 10, 0.92)';
    ctx.lineWidth = prop.reinforced ? 2.5 : 2;
    ctx.strokeRect(left + 1, top + 1, w - 2, h - 2);
  }

