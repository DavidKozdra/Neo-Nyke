  function drawWorldViewport(cam, vpX, vpW, vpH, vpY, pLabel, slot = null) {
    const isDying = gameState === 'dying';
    const slotDead = !!slot?.getDead?.();
    const _shakeOn = window.NeoSettings?.getAccess()?.screenShake !== false;
    const sX = _shakeOn && pLabel === 'P1' ? (nextRandom('fx') - 0.5) * shake * 2 : 0;
    const sY = _shakeOn && pLabel === 'P1' ? (nextRandom('fx') - 0.5) * shake * 2 : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(vpX, vpY, vpW, vpH);
    ctx.clip();
    ctx.translate(vpX - cam.x + sX, vpY - cam.y + sY);
    drawFloor();
    drawRoomDecor();
    drawWorldProps();
    drawDeadBodies();
    drawChests();
    drawPickups();
    drawProjectiles();
    drawEnemyTelegraphs();
    drawEnemies();
    drawRoomCeilingMask();
    if (!isDying) {
      if (isMultiplayerMode()) {
        getActivePlayerSlots().forEach(drawSlot => {
          if (drawSlot.getDead()) return;
          if (drawSlot.id === 1) drawPlayer();
          else drawPlayerSlot(drawSlot);
        });
      } else {
        drawPlayer();
      }
    }
    if (!isDying) drawPlayerLaser();
    if (isDying && playerDeathAnim) drawPlayerCorpseAnim(playerDeathAnim);
    drawParticles();
    if (!isDying) drawLadderPrompt();
    if (!isDying) drawJesterPortalPrompt();
    // P-label in corner of each viewport (split only)
    if (isSplitScreen() && pLabel) {
      const slot = getActivePlayerSlots().find(candidate => candidate.label === pLabel);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = slot?.color || '#fff';
      ctx.fillText(pLabel, vpX + 8, vpY + 18);
      ctx.restore();
    }
    if (slotDead && pLabel) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,.52)';
      ctx.fillRect(vpX, vpY, vpW, vpH);
      ctx.fillStyle = slot?.color || '#dfeeff';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pLabel} DOWN`, vpX + vpW / 2, vpY + vpH / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  function getActiveRoomChamber(room, entity = player) {
    if (!room || !entity || !Array.isArray(room.layoutChambers) || room.layoutChambers.length === 0) return null;
    const containing = room.layoutChambers.find(chamber => (
      entity.x >= chamber.x - chamber.w / 2
      && entity.x <= chamber.x + chamber.w / 2
      && entity.y >= chamber.y - chamber.h / 2
      && entity.y <= chamber.y + chamber.h / 2
    ));
    if (containing) return containing;

    let nearest = room.layoutChambers[0];
    let bestDistance = Infinity;
    room.layoutChambers.forEach(chamber => {
      const distance = Math.hypot(entity.x - chamber.x, entity.y - chamber.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = chamber;
      }
    });
    return nearest;
  }

  function withRoundedClipRect(rect, radius, drawFn) {
    if (!rect || typeof drawFn !== 'function') return;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  function getRoomDarkness(room, lights) {
    const baseDarkness = room?.type === 'boss'
      ? LIGHTING_CONFIG.darkness.boss
      : room?.type === 'challenge'
        ? LIGHTING_CONFIG.darkness.challenge
        : LIGHTING_CONFIG.darkness.combat;
    const lightPressure = Math.min(1.2, lights.reduce((sum, light) => sum + light.strength, 0) / 14);
    return Math.max(0, baseDarkness - lightPressure * LIGHTING_CONFIG.darkness.lightRelief);
  }

  function createRoomDarknessGradient(alpha) {
    const darkness = ctx.createLinearGradient(0, 0, 0, ROOM_H);
    darkness.addColorStop(0, `rgba(10,14,22,${Math.min(0.28, alpha + 0.035)})`);
    darkness.addColorStop(0.5, `rgba(5,7,12,${alpha})`);
    darkness.addColorStop(1, `rgba(8,11,18,${Math.min(0.32, alpha + 0.05)})`);
    return darkness;
  }

  function carveSoftLight(x, y, innerRadius, outerRadius, strength = 1, clipRect = null) {
    const drawLight = () => {
      const gradient = ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
      gradient.addColorStop(0, 'rgba(0,0,0,1)');
      gradient.addColorStop(0.26, 'rgba(0,0,0,0.72)');
      gradient.addColorStop(0.66, 'rgba(0,0,0,0.22)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = clamp(strength, 0, 1.12);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - outerRadius, y - outerRadius, outerRadius * 2, outerRadius * 2);
    };

    if (clipRect) {
      withRoundedClipRect(clipRect, 32, drawLight);
      return;
    }
    drawLight();
  }

  function carvePlayerBeamLights() {
    if (laserActive) {
      const angle = laserMode === 'god_sweep'
        ? laserAngle
        : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
      const beamPath = buildRicochetBeamPath(player.x, player.y, angle, getPlayerBeamRange(laserMode, getEquippedMove('laser')), getPlayerBeamBounceCount(laserMode));
      carveBeamLight(beamPath, laserMode === 'god_sweep' ? 42 : laserMode === 'turtle_wave' ? 34 : 22, laserMode === 'god_sweep' ? 0.9 : 0.7);
      return;
    }

    if (getEquippedWeapon() !== 'lazer_glasses' || player.weaponBeamTime <= 0) return;
    const baseAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    [-0.2, 0.2].forEach(offset => {
      const beamPath = buildRicochetBeamPath(player.x, player.y, baseAngle + offset, 430, LAZER_GLASSES_BOUNCES);
      carveBeamLight(beamPath, 14, 0.46);
    });
  }

  function carveEnemyBeamLights() {
    enemies.forEach(enemy => {
      if (!enemy || Number(enemy.beamTime || 0) <= 0 || !Number.isFinite(enemy.beamAngle)) return;
      const beamPath = buildRicochetBeamPath(enemy.x, enemy.y, enemy.beamAngle, enemy.type === 'god' ? 620 : 460, getEnemyBeamBounceCount(enemy));
      carveBeamLight(beamPath, enemy.type === 'god' ? 36 : 18, enemy.type === 'god' ? 0.72 : 0.42);
    });
  }

  function lightTintWithAlpha(tint, alpha) {
    const match = /^rgba\((\s*\d+\s*,\s*\d+\s*,\s*\d+\s*),\s*[\d.]+\)$/.exec(tint);
    return match ? `rgba(${match[1]}, ${alpha})` : 'rgba(255,255,255,0)';
  }

  function drawLightBloom(lights) {
    ctx.globalCompositeOperation = 'lighter';
    lights.forEach(light => {
      if (!light.tint) return;
      const glow = ctx.createRadialGradient(light.x, light.y, Math.max(4, light.inner * 0.35), light.x, light.y, light.outer);
      glow.addColorStop(0, light.tint);
      glow.addColorStop(0.58, lightTintWithAlpha(light.tint, 0.02));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.globalAlpha = Math.min(0.46, light.strength * 0.46);
      ctx.fillRect(light.x - light.outer, light.y - light.outer, light.outer * 2, light.outer * 2);
    });
  }

  function drawRoomCeilingMask() {
    const room = currentRoom;
    if (!room || LIGHTING_CONFIG.clearRoomTypes.has(room.type)) return;
    const lights = collectRoomLightSources(room);
    const darknessAlpha = getRoomDarkness(room, lights);
    if (darknessAlpha < LIGHTING_CONFIG.darkness.minVisible) return;

    ctx.save();
    ctx.fillStyle = createRoomDarknessGradient(darknessAlpha);
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    ctx.globalCompositeOperation = 'destination-out';

    lights.forEach(light => {
      carveSoftLight(light.x, light.y, light.inner, light.outer, light.strength, null);
    });

    carvePlayerBeamLights();
    carveEnemyBeamLights();
    drawLightBloom(lights);
    ctx.restore();
  }

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

  function carveBeamLight(path, maxWidth, strength = 0.5) {
    if (!Array.isArray(path) || path.length < 2) return;
    ctx.save();
    ctx.globalAlpha = clamp(strength, 0, 1);
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = Math.max(8, maxWidth * 1.8);
    for (let index = 0; index < path.length - 1; index += 1) {
      const start = path[index];
      const end = path[index + 1];
      ctx.lineWidth = maxWidth;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function pushLightSource(target, x, y, inner, outer, strength, tint = '') {
    if (target.length >= LIGHTING_CONFIG.maxLights) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(outer) || outer <= 0) return;
    if (x + outer < 0 || x - outer > ROOM_W || y + outer < 0 || y - outer > ROOM_H) return;

    const cleanOuter = clamp(outer, 8, LIGHTING_CONFIG.maxOuterRadius);
    const cleanInner = clamp(Number.isFinite(inner) ? inner : 0, 0, cleanOuter * 0.72);
    const cleanStrength = clamp(Number.isFinite(strength) ? strength : 0.5, 0, 1.1);
    target.push({ x, y, inner: cleanInner, outer: cleanOuter, strength: cleanStrength, tint });
  }

  function collectRoomLightSources(room) {
    const lights = [];
    const activeChamber = getActiveRoomChamber(room, player);
    pushLightSource(
      lights,
      ROOM_W / 2,
      ROOM_H / 2,
      LIGHTING_CONFIG.ambient.inner,
      Math.max(ROOM_W, ROOM_H) * LIGHTING_CONFIG.ambient.outerScale,
      room?.type === 'boss' ? LIGHTING_CONFIG.ambient.bossStrength : LIGHTING_CONFIG.ambient.strength,
      LIGHTING_CONFIG.ambient.tint
    );
    if (activeChamber && Array.isArray(room?.layoutChambers) && room.layoutChambers.length > 1) {
      pushLightSource(lights, activeChamber.x, activeChamber.y, 36, Math.max(activeChamber.w, activeChamber.h) * 0.58, 0.22, 'rgba(120, 160, 255, 0.05)');
    }

    pushLightSource(
      lights,
      player.x,
      player.y - 8,
      LIGHTING_CONFIG.player.inner,
      LIGHTING_CONFIG.player.outer,
      LIGHTING_CONFIG.player.strength,
      LIGHTING_CONFIG.player.tint
    );

    decorations.forEach(decor => {
      if (!decor) return;
      const flameT = Date.now() * 0.007 + decor.x * 0.017 + decor.y * 0.011;
      const flicker = 1 + Math.sin(flameT) * 0.08 + Math.cos(flameT * 1.9) * 0.05;
      if (decor.kind === 'brazier') {
        pushLightSource(
          lights,
          decor.x,
          decor.y - 8,
          20,
          decor.r * 8.8 * flicker,
          1,
          'rgba(255, 146, 74, 0.16)'
        );
      } else if (decor.kind === 'torch') {
        pushLightSource(
          lights,
          decor.x,
          decor.y - 12,
          34,
          286 * flicker,
          1.1,
          'rgba(255, 176, 94, 0.24)'
        );
        // Add a softer wide spill so torches brighten nearby floor, not just the immediate hotspot.
        pushLightSource(
          lights,
          decor.x,
          decor.y - 10,
          96,
          448 * flicker,
          0.52,
          'rgba(255, 206, 142, 0.12)'
        );
      }
    });

    hazards.forEach(hazard => {
      if (!hazard) return;
      if (hazard.kind === 'lava') {
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * 0.25, hazard.r * 2.7, 0.95, 'rgba(255, 92, 44, 0.12)');
      } else if (hazard.kind === 'fire_circle') {
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * 0.35, hazard.r * 1.75, 0.72, 'rgba(255, 120, 54, 0.08)');
      } else if (hazard.kind === 'lightning_column') {
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * 0.22, hazard.r * 1.8, 0.82, 'rgba(124, 200, 255, 0.09)');
      } else if (hazard.kind === 'explosive_trap' && hazard.triggered) {
        pushLightSource(lights, hazard.x, hazard.y, 10, hazard.blastRadius * 0.72, 0.52, 'rgba(255, 122, 70, 0.06)');
      }
    });

    projectiles.forEach(projectile => {
      if (!projectile || !Number.isFinite(projectile.x) || !Number.isFinite(projectile.y)) return;
      const kind = projectile.kind || '';
      if (kind === 'fireball') {
        pushLightSource(lights, projectile.x, projectile.y, projectile.r * 0.8, 90, 0.86, 'rgba(255, 118, 42, 0.1)');
      } else if (kind === 'disk' || kind === 'cult_missile') {
        pushLightSource(lights, projectile.x, projectile.y, projectile.r * 0.7, 70, 0.58, 'rgba(182, 108, 255, 0.08)');
      } else if (kind === 'sniper_round' || kind === 'machine_round' || kind === 'magenta_degale') {
        pushLightSource(lights, projectile.x, projectile.y, projectile.r * 0.45, 42, 0.34, 'rgba(255, 148, 92, 0.04)');
      }
    });

    return lights;
  }

  function drawWorldProps() {
    const theme = getRoomArtTheme();
    hazards.forEach(hazard => {
      ctx.save();
      ctx.translate(hazard.x, hazard.y);
      if (hazard.kind === 'lava') {
        const t = lavaAnimTime * (hazard.pulse || 1.5) + (hazard.phase || 0);
        const wobble = hazard.wobble || 0.6;
        const pulse = 1 + Math.sin(t * 2.4) * 0.07;
        const outerRadius = hazard.r * pulse;

        ctx.shadowColor = '#ff5a3d';
        ctx.shadowBlur = 12 + Math.sin(t * 3.1) * 6;
        ctx.fillStyle = 'rgba(255,95,42,0.55)';
        ctx.beginPath();
        for (let index = 0; index <= 26; index += 1) {
          const angle = (index / 26) * Math.PI * 2;
          const wave = Math.sin(t * 3.2 + angle * 4) * 0.06 * wobble
            + Math.cos(t * 1.9 + angle * 7) * 0.04 * wobble;
          const rr = outerRadius * (1 + wave);
          const px = Math.cos(angle) * rr;
          const py = Math.sin(angle) * rr;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = `rgba(255,170,70,${0.45 + Math.sin(t * 4.5) * 0.12})`;
        ctx.beginPath();
        ctx.arc(Math.sin(t * 2.1) * 3, Math.cos(t * 2.6) * 3, hazard.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (hazard.kind === 'explosive_trap') {
        const t = Date.now() * 0.008 + hazard.x * 0.01;
        const armed = !!hazard.triggered;
        const pulse = armed ? 1 + Math.sin(t * 2.4) * 0.12 : 1 + Math.sin(t * 0.8) * 0.03;
        ctx.fillStyle = 'rgba(18,19,22,0.95)';
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * 1.05, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = armed ? '#ff9250' : 'rgba(255,200,120,0.55)';
        ctx.lineWidth = armed ? 3 : 2;
        ctx.shadowColor = armed ? '#ff7438' : 'rgba(255,180,90,0.25)';
        ctx.shadowBlur = armed ? 16 : 6;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = armed ? 'rgba(255,80,70,0.95)' : 'rgba(255,214,120,0.82)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(6, 6);
        ctx.moveTo(6, -6);
        ctx.lineTo(-6, 6);
        ctx.stroke();

        ctx.globalAlpha = armed ? 0.24 : 0.12;
        ctx.strokeStyle = armed ? '#ff7a54' : 'rgba(255,210,130,0.55)';
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, hazard.triggerRadius || 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      } else if (hazard.kind === 'healing_zone') {
        const t = Date.now() * 0.004 + (hazard.ttl || 0);
        const pulse = 1 + Math.sin(t * 2.2) * 0.08;
        const inner = hazard.r * 0.62 * pulse;
        ctx.fillStyle = `rgba(80,255,140,${0.12 + Math.sin(t * 1.8) * 0.04})`;
        ctx.beginPath();
        ctx.arc(0, 0, inner, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#35ff6f';
        ctx.shadowColor = '#35ff6f';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i += 1) {
          const a = t + i * (Math.PI * 2 / 6);
          const px = Math.cos(a) * (hazard.r * 0.7);
          const py = Math.sin(a) * (hazard.r * 0.7);
          ctx.beginPath();
          ctx.moveTo(px - 4, py);
          ctx.lineTo(px + 4, py);
          ctx.moveTo(px, py - 4);
          ctx.lineTo(px, py + 4);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.moveTo(0, -8);
        ctx.lineTo(0, 8);
        ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = 'rgba(210,255,225,0.75)';
        ctx.lineWidth = 1.5;
        for (let index = 0; index < 10; index += 1) {
          const a = -t * 0.55 + index * (Math.PI * 2 / 10);
          const r0 = hazard.r * 0.84;
          const r1 = hazard.r * 0.93;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (hazard.kind === 'fire_circle') {
        const t = Date.now() * 0.005;
        const pulse = 1 + Math.sin(t * 2.6) * 0.07;
        ctx.strokeStyle = '#ff7b32';
        ctx.shadowColor = '#ff7b32';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,102,40,0.15)';
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * 0.76, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.78;
        ctx.strokeStyle = 'rgba(255,205,90,0.8)';
        ctx.lineWidth = 2;
        for (let index = 0; index < 14; index += 1) {
          const a = t * 0.9 + index * (Math.PI * 2 / 14);
          const wiggle = Math.sin(t * 2 + index) * 4;
          const r0 = hazard.r * 0.46 + wiggle;
          const r1 = hazard.r * 0.68 + wiggle;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a + 0.14) * r1, Math.sin(a + 0.14) * r1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (hazard.kind === 'lightning_column') {
        const t = Date.now() * 0.006 + hazard.x * 0.01;
        ctx.fillStyle = 'rgba(112,180,255,0.12)';
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8dd4ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * (0.8 + Math.sin(t) * 0.04), 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(170,220,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -hazard.r);
        ctx.lineTo(0, hazard.r);
        ctx.stroke();
        ctx.shadowColor = '#bde8ff';
        ctx.shadowBlur = 16;
        for (let index = 0; index < 5; index += 1) {
          const a = t * 1.7 + index * (Math.PI * 2 / 5);
          const branch = hazard.r * (0.28 + 0.12 * Math.sin(t + index));
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * branch * 0.3, Math.sin(a) * branch * 0.3);
          ctx.lineTo(Math.cos(a + 0.22) * branch, Math.sin(a + 0.22) * branch);
          ctx.lineTo(Math.cos(a - 0.1) * hazard.r * 0.72, Math.sin(a - 0.1) * hazard.r * 0.72);
          ctx.stroke();
        }
      }
      ctx.restore();
    });

    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      ctx.save();
      ctx.translate(prop.x, prop.y);
      if (prop.kind === 'pot') {
        drawEnvironmentTile('pot_clay', -16, -18, 32, 32);
      } else if (prop.kind === 'barrel') {
        drawEnvironmentTile('barrel_oak', -24, -26, 48, 48);
      } else if (prop.kind === 'wall') {
        drawEnvironmentTile('wall_block', -26, -26, 52, 52);
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-25, -25, 50, 50);
      } else if (prop.kind === 'cover_wall') {
        drawCoverWall(prop);
      } else if (prop.kind === 'secret_wall') {
        drawCoverWall(prop);
      }
      ctx.restore();
    });

    shopOffers.forEach(offer => {
      if (offer.bought) return;
      const blockedByChallenge = offer.type === 'item' && isChallengeActive('no_items');
      const canAfford = !!player && player.coins >= offer.cost;
      ctx.save();
      ctx.translate(offer.x, offer.y);
      ctx.fillStyle = blockedByChallenge || !canAfford ? 'rgba(36,18,24,0.95)' : 'rgba(0,30,44,0.95)';
      ctx.strokeStyle = blockedByChallenge || !canAfford ? '#ff8b98' : '#ffd966';
      ctx.lineWidth = 2;
      ctx.fillRect(-26, -26, 52, 52);
      ctx.strokeRect(-26, -26, 52, 52);

      // Draw pixel icon for the offer
      const iconDef = offer.type === 'item'
        ? window.NeoNykeIconDefs?.items?.[offer.key]
        : offer.type === 'move'
          ? window.NeoNykeIconDefs?.moves?.[offer.key]
          : offer.type === 'weapon'
            ? window.NeoNykeIconDefs?.weapons?.[offer.key]
            : offer.type === 'potion'
              ? window.NeoNykeIconDefs?.pickups?.potion
              : null;
      if (iconDef) {
        const iconColor = blockedByChallenge ? '#ff8b98' : iconDef.color || '#ffffff';
        const scale = 32 / 32; // 1px per logical pixel, icon grid is 8x8 drawn at 4px each = 32px total
        const iconSize = 32;
        ctx.save();
        ctx.translate(-iconSize / 2, -iconSize / 2 - 4);
        ctx.shadowColor = iconColor;
        ctx.shadowBlur = blockedByChallenge ? 0 : 8;
        ctx.fillStyle = iconColor;
        iconDef.pixels.forEach(([px, py]) => {
          ctx.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
        });
        ctx.restore();
      } else {
        // fallback circle
        ctx.fillStyle = blockedByChallenge
          ? '#ff8b98'
          : offer.type === 'item' ? '#a857ff' : offer.type === 'potion' ? '#35ff6f' : '#8fd2ff';
        ctx.beginPath();
        ctx.arc(0, -6, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.fillStyle = blockedByChallenge || !canAfford ? '#ffccd2' : '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(offer.cost), 0, 22);
      ctx.restore();
    });
  }

  function drawPickups() {
    pickups.forEach(pickup => {
      if (!pickup || typeof pickup !== 'object' || typeof pickup.type !== 'string') return;
      ctx.save();
      const t = Date.now() / 260;
      const bob = Math.sin(t * 0.9) * 3;
      ctx.translate(pickup.x, pickup.y + bob);
      ctx.globalAlpha = 0.88 + Math.sin(t) * 0.12;
      if (pickup.type === 'coin') {
        ctx.shadowColor = '#ffd966';
        ctx.shadowBlur = 12;
        if (ui.coinIcon instanceof HTMLCanvasElement) {
          const s = 18;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(ui.coinIcon, -s / 2, -s / 2, s, s);
        } else {
          ctx.fillStyle = '#ffd966';
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (pickup.type === 'potion') {
        const potionDef = window.NeoNykeIconDefs?.pickups?.potion;
        ctx.shadowColor = '#35ff6f';
        ctx.shadowBlur = 14;
        if (potionDef) {
          ctx.fillStyle = '#35ff6f';
          ctx.imageSmoothingEnabled = false;
          potionDef.pixels.forEach(([px, py]) => {
            ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          ctx.fillStyle = '#0f8';
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const appleDef = window.NeoNykeIconDefs?.pickups?.apple || window.NeoNykeIconDefs?.pickups?.fruit;
        const fruitPulse = 1 + Math.sin(t * 2.3) * 0.08;
        ctx.shadowColor = '#ff4b4b';
        ctx.shadowBlur = 16;
        ctx.save();
        ctx.scale(fruitPulse, fruitPulse);
        if (appleDef) {
          ctx.fillStyle = '#ff4b4b';
          ctx.imageSmoothingEnabled = false;
          appleDef.pixels.forEach(([px, py]) => {
            ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          ctx.fillStyle = '#ff4b4b';
          ctx.beginPath();
          ctx.arc(0, 0, 9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#7a1d1d';
        ctx.fillRect(-1, -12, 2, 5);
        ctx.fillStyle = '#ffd8d8';
        ctx.fillRect(2, -11, 2, 2);
      } else if (pickup.type === 'item') {
        const item = itemRegistry.get(pickup.key);
        const color = item?.color || '#fff';
        const iconDef = window.NeoNykeIconDefs?.items?.[pickup.key];
        ctx.shadowColor = color;
        ctx.shadowBlur = item?.rarity === 'god' ? 20 : 14;
        if (item?.rarity === 'god' && item?.accent) {
          ctx.strokeStyle = item.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 17, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (iconDef) {
          ctx.fillStyle = color;
          ctx.imageSmoothingEnabled = false;
          iconDef.pixels.forEach(([px, py]) => {
            ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (pickup.type === 'ladder') {
        ctx.strokeStyle = '#7dff9e';
        ctx.shadowColor = '#7dff9e';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 3;
        ctx.strokeRect(-12, -16, 24, 32);
        ctx.beginPath();
        ctx.moveTo(-6, -12); ctx.lineTo(-6, 12);
        ctx.moveTo(6, -12); ctx.lineTo(6, 12);
        ctx.moveTo(-6, -6); ctx.lineTo(6, -6);
        ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
        ctx.moveTo(-6, 6); ctx.lineTo(6, 6);
        ctx.stroke();
      } else if (pickup.type === 'jesterPortal') {
        const spawnT = Math.max(0, Number(pickup.spawnT || 0));
        const activateAt = Math.max(0.01, Number(pickup.activateAt || JESTER_PORTAL_ACTIVATE_DELAY));
        const reveal = clamp(spawnT / activateAt, 0, 1);
        const ease = 1 - (1 - reveal) ** 3;
        const spin = Date.now() / 360;
        const portalR = 16 + ease * 11;

        ctx.globalAlpha = 0.34 + ease * 0.56;
        ctx.fillStyle = 'rgba(48,8,66,0.65)';
        ctx.beginPath();
        ctx.ellipse(0, 8, portalR * 0.95, portalR * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.9;
        ctx.shadowColor = '#ff8bd8';
        ctx.shadowBlur = 20;
        for (let ring = 0; ring < 2; ring += 1) {
          const ringR = portalR * (0.72 + ring * 0.3);
          const segments = 9 + ring * 3;
          ctx.strokeStyle = ring === 0 ? '#ff8bd8' : '#ffd1f5';
          ctx.lineWidth = ring === 0 ? 2.4 : 1.5;
          ctx.beginPath();
          for (let seg = 0; seg < segments; seg += 1) {
            const a0 = (seg / segments) * Math.PI * 2 + spin * (ring === 0 ? 1 : -0.7);
            const a1 = ((seg + 0.56) / segments) * Math.PI * 2 + spin * (ring === 0 ? 1 : -0.7);
            ctx.moveTo(Math.cos(a0) * ringR, Math.sin(a0) * ringR * 0.42);
            ctx.lineTo(Math.cos(a1) * ringR, Math.sin(a1) * ringR * 0.42);
          }
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, portalR * 0.72);
        core.addColorStop(0, 'rgba(255,188,236,0.92)');
        core.addColorStop(1, 'rgba(255,95,194,0)');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.ellipse(0, 0, portalR * 0.72, portalR * 0.27, 0, 0, Math.PI * 2);
        ctx.fill();

        if (pickup.active) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#ffd6f7';
          ctx.font = 'bold 10px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('JUMP', 0, 3);
        }
      } else if (pickup.type === 'fightGod') {
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('FIGHT', 0, 3);
      } else if (pickup.type === 'returnGate') {
        ctx.strokeStyle = '#0ff';
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#aff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('LOOP', 0, 3);
      } else if (pickup.type === 'descend') {
        ctx.strokeStyle = '#c9a8f0';
        ctx.shadowColor = '#c9a8f0';
        ctx.shadowBlur = 22;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#c9a8f0';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('DESCEND', 0, 3);
      } else if (pickup.type === 'secretWarp') {
        const color = pickup.delta >= 0 ? '#8dffcf' : '#8dd4ff';
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.moveTo(0, -8);
        ctx.lineTo(8, 0);
        ctx.lineTo(0, 8);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`F${pickup.targetFloor}`, 0, 32);
      } else if (pickup.type === 'secretVendor') {
        const cost = Number(pickup.cost || 0);
        const usesCoins = pickup.offerKind === 'xp';
        const canAfford = usesCoins
          ? Number(player?.coins || 0) >= cost
          : Number(metaProgress.loopCrystals || 0) >= cost;
        const color = canAfford ? '#aee7ff' : '#ffb1b1';
        ctx.fillStyle = 'rgba(7,17,22,0.92)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.fillRect(-22, -18, 44, 36);
        ctx.strokeRect(-22, -18, 44, 36);
        ctx.fillStyle = color;
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(String(pickup.label || 'Offer'), 0, -2);
        ctx.font = 'bold 10px system-ui';
        ctx.fillText(`${cost} ${usesCoins ? 'C' : 'LC'}`, 0, 12);
      } else if (pickup.type === 'crown') {
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(-14, 10);
        ctx.lineTo(-10, -8);
        ctx.lineTo(-2, 0);
        ctx.lineTo(0, -12);
        ctx.lineTo(2, 0);
        ctx.lineTo(10, -8);
        ctx.lineTo(14, 10);
        ctx.closePath();
        ctx.fill();
      } else if (pickup.type === 'challengeStarter') {
        const trial = pickup.trial || 'mirror';
        const color = trial === 'bomb' ? '#ff8a6a' : trial === 'storm' ? '#8dd4ff' : trial === 'survival' ? '#ffcf7d' : '#d7f6ff';
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        if (trial === 'mirror') {
          ctx.beginPath();
          ctx.moveTo(0, -28);
          ctx.lineTo(0, 16);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-14, -6);
          ctx.lineTo(14, -6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-8, 16);
          ctx.lineTo(8, 16);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, 18, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-10, 0);
          ctx.lineTo(10, 0);
          ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(getChallengeTrialLabel(trial), 0, 34);
      } else if (pickup.type === 'challengeBomb') {
        ctx.fillStyle = pickup.safe ? '#8dd4ff' : '#ff7a66';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
      } else if (pickup.type === 'challengeRune') {
        ctx.strokeStyle = '#8dd4ff';
        ctx.shadowColor = '#8dd4ff';
        ctx.shadowBlur = 16;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(10, 0);
        ctx.lineTo(0, 12);
        ctx.lineTo(-10, 0);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function getProjectileVisual(projectile) {
    const kind = projectile.kind || 'shot';
    if (projectile.enemy) {
      if (kind === 'sword' || kind === 'god_sword') return { color: '#f6f1ff', core: '#ffffff', trail: '#d8c7ff', shape: 'blade', length: 28 };
      if (kind === 'sniper_round') return { color: '#ff5d72', core: '#ffe1e6', trail: '#ff314d', shape: 'dart', length: 34 };
      if (kind === 'machine_round') return { color: '#ffb35a', core: '#fff1ba', trail: '#ff6738', shape: 'tracer', length: 22 };
      if (kind === 'cult_missile') return { color: '#b455ff', core: '#f2ddff', trail: '#7d39ff', shape: 'orb', length: 30 };
      return { color: projectile.color || '#ff6688', core: '#ffe4eb', trail: projectile.color || '#ff6688', shape: 'dart', length: 24 };
    }
    if (kind === 'fireball') return { color: '#ff7b32', core: '#fff1a6', trail: '#ff2f17', shape: 'fireball', length: 30 };
    if (kind === 'disk') return { color: '#b66cff', core: '#f0d8ff', trail: '#7d4dff', shape: 'disk', length: 20 };
    if (kind === 'magenta_p90') return { color: '#ff9dd7', core: '#fff0fb', trail: '#ff4aa8', shape: 'tracer', length: 26 };
    if (kind === 'magenta_degale') return { color: '#ff8bd2', core: '#fff0fb', trail: '#ff3eb7', shape: 'slug', length: 34 };
    if (kind === 'hunters_bow') return { color: '#dff8ff', core: '#ffffff', trail: '#7edcff', shape: 'arrow', length: 32 };
    if (kind === 'void_piercer') return { color: '#ffd2c0', core: '#fff8ee', trail: '#ff826a', shape: 'dart', length: 30 };
    return { color: projectile.color || '#ffd7aa', core: '#ffffff', trail: projectile.color || '#ffd7aa', shape: 'orb', length: 20 };
  }

  function drawProjectileTrail(projectile, visual, angle) {
    const trail = Array.isArray(projectile.trail) ? projectile.trail : [];
    if (!trail.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (let index = trail.length - 1; index >= 0; index -= 1) {
      const point = trail[index];
      const next = index === 0 ? projectile : trail[index - 1];
      const alpha = (1 - index / trail.length) * 0.32;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = visual.trail;
      ctx.shadowColor = visual.trail;
      ctx.shadowBlur = 8;
      ctx.lineWidth = Math.max(1.5, projectile.r * (0.42 - index * 0.035));
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }
    if (visual.shape === 'fireball') {
      const tail = trail[Math.min(trail.length - 1, 2)];
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = '#3d1420';
      ctx.beginPath();
      ctx.ellipse(tail.x - Math.cos(angle) * 3, tail.y - Math.sin(angle) * 3, projectile.r * 1.3, projectile.r * 0.65, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawProjectileShape(projectile, visual) {
    const angle = Math.atan2(projectile.vy, projectile.vx);
    const r = projectile.r || 5;
    drawProjectileTrail(projectile, visual, angle);

    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(angle);
    ctx.shadowColor = visual.color;
    ctx.shadowBlur = projectile.enemy ? 12 : 14;
    ctx.fillStyle = visual.color;
    ctx.strokeStyle = visual.core;
    ctx.lineWidth = 1.5;

    if (visual.shape === 'fireball') {
      const t = Date.now() * 0.012 + projectile.x * 0.02;
      ctx.fillStyle = '#ff5a2c';
      ctx.beginPath();
      for (let index = 0; index < 14; index += 1) {
        const a = (index / 14) * Math.PI * 2;
        const wobble = 1 + Math.sin(t + index * 1.7) * 0.18;
        const rr = r * (1.15 + (index % 2) * 0.18) * wobble;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (visual.shape === 'disk') {
      const spin = Date.now() * 0.018;
      ctx.rotate(spin);
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.45, 0.25, Math.PI * 1.35);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = visual.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.25, r * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.fillRect(-r * 0.75, -1, r * 1.5, 2);
    } else if (visual.shape === 'blade' || visual.shape === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(r * 1.8, 0);
      ctx.lineTo(-r * 1.1, -r * 0.52);
      ctx.lineTo(-r * 0.55, 0);
      ctx.lineTo(-r * 1.1, r * 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (visual.shape === 'tracer' || visual.shape === 'dart' || visual.shape === 'slug') {
      ctx.beginPath();
      ctx.moveTo(r * 1.8, 0);
      ctx.lineTo(-r * 1.25, -r * 0.58);
      ctx.lineTo(-r * 0.72, 0);
      ctx.lineTo(-r * 1.25, r * 0.58);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.beginPath();
      ctx.ellipse(r * 0.42, 0, r * 0.48, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.beginPath();
      ctx.arc(r * 0.1, -r * 0.18, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawProjectiles() {
    projectiles.forEach(projectile => {
      if (!projectile) return;
      drawProjectileShape(projectile, getProjectileVisual(projectile));
    });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawDeadBodies() {
    deadBodies.forEach(body => {
      if (!body) return;
      const life = Math.max(0.01, Number(body.life || CORPSE_LIFETIME));
      const fadeStart = Math.min(life - 0.01, Number(body.fadeStart || CORPSE_FADE_START));
      const age = Math.max(0, Number(body.age || 0));
      const fallTime = Math.max(0.01, Number(body.fallTime || CORPSE_FALL_TIME));
      const fallT = clamp(age / fallTime, 0, 1);
      const fallEase = 1 - (1 - fallT) ** 3;
      const fadeT = age <= fadeStart ? 0 : clamp((age - fadeStart) / (life - fadeStart), 0, 1);
      const alpha = Math.max(0, 1 - fadeT);
      if (alpha <= 0) return;

      const size = Number(body.size || Math.max(30, Number(body.r || 12) * 2.4));
      const frame = SPRITE_ATLAS.frames[body.spriteKey] || SPRITE_ATLAS.frames.hunter;
      if (!frame) return;
      const squash = 1 - 0.46 * fallEase;
      const rotation = Number(body.angle || 0) + Number(body.fallAngle || 0) * fallEase;
      const poolScale = clamp(age / 1.2, 0, 1) * alpha;

      ctx.save();
      ctx.translate(body.x, body.y);
      ctx.globalAlpha = alpha;

      ctx.fillStyle = body.type === 'god'
        ? `rgba(224,220,255,${0.2 * poolScale})`
        : `rgba(94,0,16,${0.32 * poolScale})`;
      ctx.beginPath();
      ctx.ellipse(0, size * 0.26, size * (0.35 + poolScale * 0.14), size * (0.08 + poolScale * 0.05), rotation * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(0,0,0,${0.28 * alpha})`;
      ctx.beginPath();
      ctx.ellipse(0, size * 0.32, size * 0.34, size * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(rotation);
      if (Number(body.face || 1) < 0) ctx.scale(-1, 1);
      ctx.scale(1 + 0.05 * fallEase, squash);
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor = body.elite ? 'rgba(255,170,64,0.35)' : 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = body.elite ? 8 : 3;
      ctx.drawImage(
        SPRITE_ATLAS.canvas,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        -size / 2,
        -size / 2,
        size,
        size,
      );
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = body.type === 'god'
        ? `rgba(255,255,255,${0.15 + fadeT * 0.16})`
        : `rgba(48,12,18,${0.22 + fadeT * 0.34})`;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    });
  }

  function buildEnvironmentTileAtlas() {
    const entries = Object.entries(ENV_TILE_DEFS);
    const canvasEl = document.createElement('canvas');
    canvasEl.width = Math.max(1, ENV_TILE_SOURCE_SIZE * Math.max(1, entries.length));
    canvasEl.height = ENV_TILE_SOURCE_SIZE;
    const atlasCtx = canvasEl.getContext('2d');
    atlasCtx.imageSmoothingEnabled = false;
    const frames = {};
    entries.forEach(([key, def], index) => {
      const ox = index * ENV_TILE_SOURCE_SIZE;
      frames[key] = { x: ox, y: 0, w: ENV_TILE_SOURCE_SIZE, h: ENV_TILE_SOURCE_SIZE };
      drawEnvironmentTileAsset(atlasCtx, ox, 0, ENV_TILE_SOURCE_SIZE, def || {});
    });
    return { canvas: canvasEl, frames };
  }

  function drawEnvironmentTileAsset(g, ox, oy, size, def) {
    g.save();
    if (!def.transparent) {
      g.fillStyle = def.base || '#343832';
      g.fillRect(ox, oy, size, size);
    }

    if (def.kind === 'floor') {
      drawFloorTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'plank') {
      drawPlankTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'wall') {
      drawWallTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'threshold') {
      drawThresholdTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'pillar') {
      drawPillarTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'block') {
      drawBlockTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'pot') {
      drawPotTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'barrel') {
      drawBarrelTileAsset(g, ox, oy, size, def);
    }

    drawTileCracks(g, ox, oy, def);
    drawTileChips(g, ox, oy, def);
    g.restore();
  }

  function drawFloorTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.shade || '#252823';
    g.fillRect(ox, oy + size - 3, size, 3);
    g.fillRect(ox + size - 3, oy, 3, size);
    g.fillStyle = def.edge || '#4c5047';
    g.fillRect(ox + 1, oy + 1, size - 3, 1);
    g.fillRect(ox + 1, oy + 1, 1, size - 3);
    g.strokeStyle = def.mortar || '#1c1f1d';
    g.lineWidth = 1;
    g.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
    if (def.moss) {
      g.fillStyle = def.moss;
      g.fillRect(ox + 1, oy + size - 4, 5, 2);
      g.fillRect(ox + size - 5, oy + 2, 3, 1);
      g.fillRect(ox + 7, oy + 13, 4, 1);
    }
    if (def.overgrowth) {
      g.fillStyle = def.overgrowth;
      g.fillRect(ox + 2, oy + size - 6, 8, 1);
      g.fillRect(ox + 9, oy + size - 7, 1, 3);
      g.fillRect(ox + size - 4, oy + 4, 2, 5);
    }
    if (def.leaf) {
      g.fillStyle = def.leaf;
      g.fillRect(ox + 2, oy + 3, 1, 1);
      g.fillRect(ox + 10, oy + 6, 1, 1);
      g.fillRect(ox + 6, oy + 9, 1, 1);
      g.fillRect(ox + 12, oy + 12, 1, 1);
    }
    if (def.ash) {
      g.fillStyle = def.ash;
      g.fillRect(ox + 3, oy + 4, 1, 1);
      g.fillRect(ox + 8, oy + 12, 2, 1);
      g.fillRect(ox + 12, oy + 7, 1, 1);
    }
    if (def.bone) {
      g.fillStyle = def.bone;
      g.fillRect(ox + 4, oy + 10, 4, 1);
      g.fillRect(ox + 12, oy + 4, 1, 3);
      g.fillRect(ox + 11, oy + 5, 3, 1);
    }
    if (def.blood) {
      g.fillStyle = def.blood;
      g.fillRect(ox + 4, oy + 8, 5, 2);
      g.fillRect(ox + 8, oy + 10, 3, 1);
      g.fillRect(ox + 12, oy + 11, 1, 1);
    }
    if (def.ember) {
      g.fillStyle = def.ember;
      g.fillRect(ox + 4, oy + 11, 1, 1);
      g.fillRect(ox + 12, oy + 5, 1, 1);
    }
  }

  function drawPlankTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.base || '#4b3320';
    g.fillRect(ox, oy, size, size);
    g.fillStyle = def.shade || '#2b1e13';
    g.fillRect(ox, oy + 5, size, 1);
    g.fillRect(ox, oy + 11, size, 1);
    g.fillRect(ox + 7, oy, 1, 5);
    g.fillRect(ox + 12, oy + 6, 1, 5);
    g.fillRect(ox + 4, oy + 12, 1, 4);
    g.fillStyle = def.edge || '#6c4a2c';
    g.fillRect(ox + 1, oy + 1, size - 2, 1);
    g.strokeStyle = def.mortar || '#1d140d';
    g.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
  }

  function drawWallTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.base || '#303832';
    g.fillRect(ox, oy, size, size);
    g.fillStyle = def.shade || '#202722';
    g.fillRect(ox, oy + 8, size, 8);
    g.fillStyle = def.edge || '#586257';
    g.fillRect(ox + 1, oy + 1, size - 2, 2);
    g.fillRect(ox + 1, oy + 8, size - 2, 1);
    g.strokeStyle = def.mortar || '#151917';
    g.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
    g.beginPath();
    g.moveTo(ox + 7.5, oy);
    g.lineTo(ox + 7.5, oy + 8);
    g.moveTo(ox + 11.5, oy + 8);
    g.lineTo(ox + 11.5, oy + size);
    g.stroke();
    if (def.ember) {
      g.fillStyle = def.ember;
      g.fillRect(ox + 3, oy + 12, 1, 1);
      g.fillRect(ox + 13, oy + 4, 1, 1);
    }
    if (def.ivy) {
      g.fillStyle = def.ivy;
      g.fillRect(ox + 1, oy + 2, 2, 1);
      g.fillRect(ox + 2, oy + 6, 1, 3);
      g.fillRect(ox + 11, oy + 3, 2, 1);
      g.fillRect(ox + 12, oy + 7, 1, 3);
    }
  }

  function drawThresholdTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.base || '#3d4038';
    g.fillRect(ox, oy, size, size);
    g.fillStyle = def.shade || '#292d29';
    g.fillRect(ox, oy + size - 4, size, 4);
    g.fillStyle = def.edge || '#655a45';
    g.fillRect(ox + 1, oy + 2, size - 2, 2);
    g.fillRect(ox + 2, oy + 7, size - 4, 1);
    g.strokeStyle = def.mortar || '#1b1f1d';
    g.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
  }

  function drawPillarTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.26)';
    g.fillRect(ox + 3, oy + 12, 10, 2);
    g.fillStyle = def.shade || '#252b27';
    g.fillRect(ox + 2, oy + 2, 12, 12);
    g.fillStyle = def.base || '#4a4d43';
    g.fillRect(ox + 3, oy + 1, 10, 11);
    g.fillStyle = def.edge || '#727060';
    g.fillRect(ox + 4, oy + 2, 8, 2);
    g.fillRect(ox + 4, oy + 10, 8, 2);
    g.strokeStyle = def.mortar || '#191d1b';
    g.strokeRect(ox + 2.5, oy + 1.5, 11, 12);
  }

  function drawBlockTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(ox + 2, oy + 12, 12, 2);
    g.fillStyle = def.shade || '#222823';
    g.fillRect(ox + 1, oy + 2, 14, 12);
    g.fillStyle = def.base || '#394038';
    g.fillRect(ox + 2, oy + 1, 12, 11);
    g.fillStyle = def.edge || '#626858';
    g.fillRect(ox + 2, oy + 2, 12, 1);
    g.fillRect(ox + 2, oy + 7, 12, 1);
    g.strokeStyle = def.mortar || '#171c1a';
    g.strokeRect(ox + 1.5, oy + 1.5, 13, 12);
    if (def.hiddenMark) {
      g.fillStyle = def.hiddenMark;
      g.fillRect(ox + 7, oy + 4, 2, 1);
      g.fillRect(ox + 8, oy + 5, 1, 3);
    }
  }

  function drawPotTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.fillRect(ox + 4, oy + 13, 8, 2);
    g.fillStyle = def.shade || '#57331f';
    g.fillRect(ox + 5, oy + 5, 7, 8);
    g.fillStyle = def.base || '#9b6744';
    g.fillRect(ox + 6, oy + 4, 5, 9);
    g.fillRect(ox + 5, oy + 6, 7, 5);
    g.fillStyle = def.edge || '#d19a68';
    g.fillRect(ox + 6, oy + 4, 5, 1);
    g.fillRect(ox + 7, oy + 2, 3, 2);
    g.fillStyle = def.mortar || '#25150d';
    g.fillRect(ox + 5, oy + 11, 7, 1);
  }

  function drawBarrelTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.fillRect(ox + 3, oy + 13, 10, 2);
    g.fillStyle = def.shade || '#3d2414';
    g.fillRect(ox + 4, oy + 3, 9, 11);
    g.fillStyle = def.base || '#7a4c27';
    g.fillRect(ox + 5, oy + 2, 7, 11);
    g.fillStyle = def.edge || '#b17a42';
    g.fillRect(ox + 5, oy + 3, 7, 1);
    g.fillRect(ox + 5, oy + 11, 7, 1);
    g.fillStyle = def.band || '#2b2d2c';
    g.fillRect(ox + 4, oy + 5, 9, 1);
    g.fillRect(ox + 4, oy + 10, 9, 1);
  }

  function drawTileCracks(g, ox, oy, def) {
    if (!Array.isArray(def.cracks)) return;
    g.strokeStyle = def.mortar || '#151917';
    g.lineWidth = 1;
    def.cracks.forEach(points => {
      if (!Array.isArray(points) || points.length < 4) return;
      g.beginPath();
      g.moveTo(ox + points[0], oy + points[1]);
      for (let index = 2; index < points.length - 1; index += 2) {
        g.lineTo(ox + points[index], oy + points[index + 1]);
      }
      g.stroke();
    });
  }

  function drawTileChips(g, ox, oy, def) {
    if (!Array.isArray(def.chips)) return;
    g.fillStyle = def.shade || '#252823';
    def.chips.forEach(chip => {
      if (!Array.isArray(chip) || chip.length < 4) return;
      g.fillRect(ox + chip[0], oy + chip[1], chip[2], chip[3]);
    });
  }

  function buildSpriteAtlas() {
    const keys = Object.keys(SPRITE_DEFS);
    const canvasEl = document.createElement('canvas');
    canvasEl.width = SPRITE_SOURCE_SIZE * keys.length;
    canvasEl.height = SPRITE_SOURCE_SIZE;
    const atlasCtx = canvasEl.getContext('2d');
    atlasCtx.imageSmoothingEnabled = false;
    const frames = {};
    keys.forEach((key, index) => {
      const def = SPRITE_DEFS[key];
      const ox = index * SPRITE_SOURCE_SIZE;
      frames[key] = { x: ox, y: 0, w: SPRITE_SOURCE_SIZE, h: SPRITE_SOURCE_SIZE };
      for (let y = 0; y < def.pixels.length; y += 1) {
        const row = def.pixels[y];
        for (let x = 0; x < row.length; x += 1) {
          const pixel = row[x];
          if (pixel === '.') continue;
          for (let oy = -1; oy <= 1; oy += 1) {
            for (let oxi = -1; oxi <= 1; oxi += 1) {
              if (oxi === 0 && oy === 0) continue;
              const nx = x + oxi;
              const ny = y + oy;
              if (nx < 0 || ny < 0 || nx >= row.length || ny >= def.pixels.length) continue;
              if (def.pixels[ny][nx] !== '.') continue;
              atlasCtx.fillStyle = 'rgba(15, 10, 14, 0.92)';
              atlasCtx.fillRect(ox + nx, ny, 1, 1);
            }
          }
        }
      }
      def.pixels.forEach((row, y) => {
        for (let x = 0; x < row.length; x += 1) {
          const pixel = row[x];
          if (pixel === '.') continue;
          atlasCtx.fillStyle = def.palette[pixel] || '#ff00ff';
          atlasCtx.fillRect(ox + x, y, 1, 1);
        }
      });
    });
    return { canvas: canvasEl, frames };
  }

  function getEnemySpriteKey(enemy) {
    if (enemy.type === 'rival') return enemy.rivalKey;
    if (enemy.type === 'mirror_knight') return enemy.spriteKey || getPlayerSpriteKey();
    if (enemy.type === 'machine_gunner') return 'sniper';
    if (enemy.type === 'summoner') return 'cult_mage';
    if (enemy.type === 'shield_unit') return 'golem';
    if (enemy.type === 'healer') return 'cult_follower';
    if (enemy.type === 'boss_spawner') return 'laser';
    return SPRITE_DEFS[enemy.type] ? enemy.type : 'hunter';
  }

  function getPlayerSpriteKey() {
    const key = getCharacterDef().key;
    return SPRITE_DEFS[key] ? key : 'thorn_knight';
  }

  function getFacingDirection(actor, fallbackAngle = 0) {
    if (Math.abs(actor.vx) > 6) return actor.vx < 0 ? -1 : 1;
    return Math.cos(fallbackAngle) < 0 ? -1 : 1;
  }

  function drawSpriteFrame(spriteKey, x, y, size, options = {}) {
    const atlas = SPRITE_ATLAS;
    if (!atlas?.frames || !atlas.canvas) return;
    const frame = atlas.frames[spriteKey] || atlas.frames.hunter;
    if (!frame) return;
    const {
      alpha = 1,
      flipX = false,
      shadowColor = null,
      shadowBlur = 0,
      tint = null,
    } = options;
    ctx.save();
    ctx.translate(x, y);
    if (flipX) ctx.scale(-1, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.3, size * 0.28, size * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    if (shadowColor && shadowBlur > 0) {
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      atlas.canvas,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      -size / 2,
      -size / 2,
      size,
      size,
    );
    if (tint) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(-size / 2, -size / 2, size, size);
    }
    ctx.restore();
  }

  function drawSpriteToCanvas(canvasEl, spriteKey, size = canvasEl?.width || 96, options = {}) {
    if (!(canvasEl instanceof HTMLCanvasElement)) return;
    const atlas = SPRITE_ATLAS;
    if (!atlas?.frames || !atlas.canvas) return;
    const frame = atlas.frames[spriteKey] || atlas.frames.hunter;
    if (!frame) return;
    const renderSize = Number.isFinite(size) ? size : (canvasEl.width || 96);
    const c = canvasEl.getContext('2d');
    if (!c) return;
    const {
      tint = null,
      alpha = 1,
    } = options;
    c.clearRect(0, 0, canvasEl.width, canvasEl.height);
    c.imageSmoothingEnabled = false;
    const dx = Math.round((canvasEl.width - renderSize) / 2);
    const dy = Math.round((canvasEl.height - renderSize) / 2);
    c.save();
    c.globalAlpha = alpha;
    c.drawImage(
      atlas.canvas,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      dx,
      dy,
      renderSize,
      renderSize,
    );
    if (tint) {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = tint;
      c.globalAlpha = 0.2;
      c.fillRect(dx, dy, renderSize, renderSize);
    }
    c.restore();
  }

  function drawEnemyTelegraphs() {
    enemies.forEach(enemy => {
      if (enemy.windup > 0) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.strokeStyle = (enemy.type === 'charger' || enemy.type === 'golem' || enemy.type === 'bulk_golem') ? '#ff8844' : '#aa66ff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.r + 10 + Math.sin(Date.now() / 120) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (enemy.beamTime > 0) {
        const range = enemy.type === 'god' ? (enemy.beamRange || 620) : 430;
        const beamPath = buildRicochetBeamPath(enemy.x, enemy.y, enemy.beamAngle, range, getEnemyBeamBounceCount(enemy));
        strokeBeamPath(beamPath, {
          color: enemy.type === 'god' ? '#ffffff' : '#aa66ff',
          width: enemy.type === 'god' && enemy.state === 'godSweep' ? 18 : enemy.type === 'god' ? 10 : 7,
          shadowBlur: enemy.type === 'god' && enemy.state === 'godSweep' ? 24 : 14,
        });
      }
    });
  }

  function drawBleedOverlay(enemy, stacks) {
    const stackCount = Math.max(0, Math.round(Number(stacks || 0)));
    if (!stackCount) return;
    const t = Date.now() / 170;
    const flash = clamp(Number(enemy.bleedFlash || 0) * 3, 0, 1);
    const drops = Math.min(8, stackCount + 2);

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.globalAlpha = 0.72 + flash * 0.22;
    ctx.shadowColor = '#b50022';
    ctx.shadowBlur = 8 + stackCount * 1.4 + flash * 10;
    for (let index = 0; index < drops; index += 1) {
      const angle = (index / drops) * Math.PI * 2 + t * (index % 2 ? -0.35 : 0.28);
      const radius = enemy.r * (0.42 + (index % 3) * 0.18);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle * 1.2) * radius * 0.68 + enemy.r * 0.06;
      const size = 2.2 + Math.min(5, stackCount) * 0.22 + (index % 2) * 0.8;
      ctx.fillStyle = BLEED_BLOOD_COLORS[index % BLEED_BLOOD_COLORS.length];
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.7, size * 1.15, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    if (flash > 0 && !window.NeoSettings?.getAccess()?.reduceFlash) {
      ctx.globalAlpha = flash * 0.65;
      ctx.strokeStyle = '#ff2b45';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.r + 9 + flash * 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    const label = `BLEED x${stackCount}`;
    const y = enemy.type === 'rival' ? -enemy.r - 40 : -enemy.r - 32;
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = Math.max(50, ctx.measureText(label).width + 14);
    const height = 15;
    ctx.fillStyle = 'rgba(62, 0, 12, 0.86)';
    ctx.strokeStyle = '#ff4f6d';
    ctx.lineWidth = 1;
    ctx.shadowColor = '#ff2445';
    ctx.shadowBlur = 8 + flash * 8;
    ctx.beginPath();
    ctx.roundRect(-width / 2, y, width, height, 5);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe3e7';
    ctx.fillText(label, 0, y + height / 2 + 0.5);
    ctx.restore();
  }

  function drawStatusBadge(enemy, label, bgColor, borderColor, textColor, yOffset) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = Math.max(50, ctx.measureText(label).width + 14);
    const height = 15;
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(-width / 2, yOffset, width, height, 5);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = textColor;
    ctx.fillText(label, 0, yOffset + height / 2 + 0.5);
    ctx.restore();
  }

  function drawSpawnPortal(enemy) {
    const SPAWN_DURATION = 0.72;
    const t = clamp(1 - enemy.spawnT / SPAWN_DURATION, 0, 1);
    const emerge = clamp((t - 0.35) / 0.65, 0, 1);
    const portalEase = 1 - (1 - Math.min(t * 1.8, 1)) ** 3;
    const now = Date.now();
    const r = enemy.r;
    const isBoss = BOSS_TYPES.has(enemy.type);
    const isElite = !!enemy.elite;
    const portalColor = isBoss ? '#ffd060' : isElite ? '#e8b030' : '#8855ff';
    const innerColor = isBoss ? '#fff4c0' : isElite ? '#ffe080' : '#cc88ff';
    const portalR = r * (1.8 + portalEase * 0.6);

    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    // Ground shadow pool
    ctx.globalAlpha = 0.45 * portalEase;
    ctx.fillStyle = isBoss ? 'rgba(120,80,0,0.6)' : 'rgba(40,0,80,0.6)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.3, portalR * 0.85, portalR * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Outer spinning ring
    ctx.globalAlpha = 0.9 * portalEase;
    ctx.shadowColor = portalColor;
    ctx.shadowBlur = 18 + portalEase * 14;
    for (let ring = 0; ring < 2; ring += 1) {
      const ringR = portalR * (0.78 + ring * 0.22);
      const spin = now / (ring === 0 ? 320 : -480);
      const segments = 8 + ring * 4;
      ctx.strokeStyle = ring === 0 ? portalColor : innerColor;
      ctx.lineWidth = 2.5 - ring * 0.8;
      ctx.beginPath();
      for (let seg = 0; seg < segments; seg += 1) {
        const a0 = (seg / segments) * Math.PI * 2 + spin;
        const a1 = ((seg + 0.6) / segments) * Math.PI * 2 + spin;
        ctx.moveTo(Math.cos(a0) * ringR, Math.sin(a0) * ringR * 0.38);
        ctx.lineTo(Math.cos(a1) * ringR, Math.sin(a1) * ringR * 0.38);
      }
      ctx.stroke();
    }

    // Portal interior glow
    ctx.globalAlpha = 0.55 * portalEase;
    ctx.shadowBlur = 0;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, portalR * 0.7);
    grad.addColorStop(0, isBoss ? 'rgba(255,230,120,0.9)' : 'rgba(180,100,255,0.9)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, portalR * 0.7, portalR * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inward particle streaks
    ctx.globalAlpha = 0.7 * portalEase;
    ctx.strokeStyle = innerColor;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = innerColor;
    ctx.shadowBlur = 8;
    const streakCount = isBoss ? 10 : 6;
    for (let s = 0; s < streakCount; s += 1) {
      const angle = (s / streakCount) * Math.PI * 2 + now / 600;
      const outerR = portalR * (0.9 + Math.sin(now / 200 + s) * 0.1);
      const innerR = portalR * 0.25;
      const _portalAccess = window.NeoSettings?.getAccess() || {};
      ctx.globalAlpha = (_portalAccess.reduceMotion ? 0.55 : (0.3 + 0.4 * Math.abs(Math.sin(now / 300 + s * 1.3)))) * portalEase;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR * 0.38);
      ctx.lineTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR * 0.38);
      ctx.stroke();
    }

    ctx.restore();

    // Enemy emerges from center — draw sprite squashed vertically
    if (emerge > 0) {
      const spriteKey = getEnemySpriteKey(enemy);
      const facing = getFacingDirection(enemy, 0);
      const drawSize = Math.max(30, r * 2.4);
      const squash = 0.28 + emerge * 0.72;
      const alpha = clamp(emerge * 1.8, 0, 1);
      const atlas = SPRITE_ATLAS;
      const frame = atlas?.frames ? (atlas.frames[spriteKey] || atlas.frames.hunter) : null;
      if (frame) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        if (facing < 0) ctx.scale(-1, 1);
        ctx.scale(1, squash);
        ctx.globalAlpha = alpha;
        ctx.shadowColor = portalColor;
        ctx.shadowBlur = 12 + (1 - emerge) * 18;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          atlas.canvas,
          frame.x, frame.y, frame.w, frame.h,
          -drawSize / 2, -drawSize / 2, drawSize, drawSize,
        );
        if (isElite) {
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(255,210,96,0.7)';
          ctx.globalAlpha = 0.22;
          ctx.fillRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize);
        }
        ctx.restore();
      }
    }
  }

  function drawEnemies() {
    enemies.forEach(enemy => {
      if (!enemy) return;
      if (enemy.spawnT > 0) { drawSpawnPortal(enemy); return; }
      const drawY = enemy.y - Math.max(0, Number(enemy.jumpZ || 0));
      const bleedStacks = getStatusStacks(enemy, 'bleed');
      const activeStatuses = STATUS_KEYS.filter(key => getStatusStacks(enemy, key) > 0);
      activeStatuses.forEach((key, index) => {
        const style = STATUS_STYLES[key];
        ctx.save();
        ctx.translate(enemy.x, drawY);
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = style.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.r + 6 + index * 4 + (window.NeoSettings?.getAccess()?.reduceFlash ? 0 : Math.sin(Date.now() / (180 + index * 40)) * 2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
      const spriteKey = getEnemySpriteKey(enemy);
      const facing = getFacingDirection(enemy, enemy.beamAngle || enemy.dashAngle || 0);
      const drawSize = Math.max(30, enemy.r * 2.4);
      // Transformation animation: scale and flash
      let scale = 1;
      let flash = false;
      if (enemy.transformAnimT && enemy.transformAnimT > 0) {
        // Oscillate scale and flash
        const t = enemy.transformAnimT;
        scale = 1.1 + Math.sin(Date.now() / 60) * 0.13 * t * 2;
        flash = Math.floor(Date.now() / 80) % 2 === 0;
      }
      ctx.save();
      ctx.translate(enemy.x, drawY);
      ctx.scale(scale, scale);
      drawSpriteFrame(spriteKey, 0, 0, drawSize, {
        alpha: enemy.stun > 0 ? 0.68 : 1,
        flipX: facing < 0,
        shadowColor: enemy.elite || enemy.type === 'god' ? 'rgba(255,244,180,0.45)' : 'rgba(0,0,0,0.18)',
        shadowBlur: enemy.type === 'god' ? 14 : enemy.elite ? 10 : 4,
        tint: flash ? 'rgba(255,255,180,0.55)' : (enemy.elite ? 'rgba(255,210,96,0.7)' : null),
      });
      ctx.restore();
      if (bleedStacks > 0) drawBleedOverlay(enemy, bleedStacks);
      const badgeBaseY = enemy.type === 'rival' ? -enemy.r - 40 : -enemy.r - 32;
      let badgeOffset = bleedStacks > 0 ? 18 : 0;
      const fireStacks = getStatusStacks(enemy, 'fire');
      if (fireStacks > 0) {
        drawStatusBadge(enemy, `FIRE x${fireStacks}`, 'rgba(62,22,0,0.86)', STATUS_STYLES.fire.color, '#ffe5c0', badgeBaseY + badgeOffset);
        badgeOffset += 18;
      }
      const poisonStacks = getStatusStacks(enemy, 'poison');
      if (poisonStacks > 0) {
        drawStatusBadge(enemy, `POISON x${poisonStacks}`, 'rgba(10,38,0,0.86)', STATUS_STYLES.poison.color, '#d8ffc0', badgeBaseY + badgeOffset);
        badgeOffset += 18;
      }
      const darkStacks = getStatusStacks(enemy, 'dark_drain');
      if (darkStacks > 0) {
        drawStatusBadge(enemy, `DRAIN x${darkStacks}`, 'rgba(20,8,48,0.86)', STATUS_STYLES.dark_drain.color, '#e8d8ff', badgeBaseY + badgeOffset);
      }
      if (enemy.elite) {
        ctx.save();
        ctx.translate(enemy.x, drawY - enemy.r - 10);
        ctx.fillStyle = '#f6cf6a';
        ctx.beginPath();
        ctx.moveTo(-7, 4);
        ctx.lineTo(-4, -5);
        ctx.lineTo(0, 0);
        ctx.lineTo(4, -6);
        ctx.lineTo(7, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(enemy.x, drawY);
      const hpPct = clamp(enemy.hp / enemy.max, 0, 1);

      // Name tag + level
      const _enemyLabel = (enemy.type === 'rival' && enemy.rivalData)
        ? enemy.rivalData.name
        : getEliteEnemyLabel(enemy);
      const _levelStr = `Lv.${floor}`;
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillStyle = enemy.elite ? '#f6cf6a' : isBossType(enemy.type) ? '#f2e8d7'
        : (enemy.type === 'rival' && enemy.rivalData) ? enemy.rivalData.color : '#b8cfe0';
      ctx.fillText(`${_enemyLabel}  ${_levelStr}`, 0, -enemy.r - 19);

      // HP bar
      ctx.fillStyle = '#000a';
      ctx.fillRect(-18, -enemy.r - 13, 36, 5);
      ctx.fillStyle = enemy.type === 'rival' ? (enemy.rivalData?.color || '#b24f68') : isBossType(enemy.type) ? '#f2e8d7' : '#b24f68';
      ctx.fillRect(-18, -enemy.r - 13, 36 * hpPct, 5);

      // HP current / max text
      ctx.font = '8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#dce7f2';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 3;
      ctx.fillText(`${Math.ceil(enemy.hp)} / ${enemy.max}`, 0, -enemy.r - 5);

      if ((enemy.barrier || 0) > 0) {
        const barrierPct = clamp(enemy.barrier / Math.max(1, enemy.max * 0.22), 0, 1);
        ctx.fillStyle = 'rgba(80, 215, 255, 0.24)';
        ctx.fillRect(-18, -enemy.r - 20, 36, 4);
        ctx.fillStyle = '#7ed6ff';
        ctx.fillRect(-18, -enemy.r - 20, 36 * barrierPct, 4);
      }
      if (enemy.type === 'boss_spawner') {
        ctx.fillStyle = '#ffb07b';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.max(0, Math.ceil(enemy.bossSpawnTimer))}`, 0, -enemy.r - 30);
      }
      ctx.restore();
    });
  }

  function drawPlayerCorpseAnim(anim) {
    const t = clamp(anim.timer / anim.duration, 0, 1);
    const fallEase = 1 - (1 - Math.min(t * 1.6, 1)) ** 3;
    const size = Math.max(34, anim.r * 2.5);
    const frame = SPRITE_ATLAS.frames[anim.spriteKey] || SPRITE_ATLAS.frames.thorn_knight;
    if (!frame) return;

    const fallAngle = (anim.facing < 0 ? -1 : 1) * (Math.PI / 2) * fallEase;
    const squash = 1 - 0.46 * fallEase;

    ctx.save();
    ctx.translate(anim.x, anim.y);

    const poolAlpha = clamp((t - 0.3) / 0.4, 0, 1);
    if (poolAlpha > 0) {
      ctx.fillStyle = `rgba(94,0,16,${0.45 * poolAlpha})`;
      ctx.beginPath();
      ctx.ellipse(0, size * 0.28, size * (0.32 + poolAlpha * 0.12), size * (0.08 + poolAlpha * 0.04), fallAngle * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.rotate(fallAngle);
    if (anim.facing < 0) ctx.scale(-1, 1);
    ctx.scale(1 + 0.05 * fallEase, squash);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.shadowColor = 'rgba(180,0,0,0.55)';
    ctx.shadowBlur = 14 + fallEase * 10;
    ctx.drawImage(
      SPRITE_ATLAS.canvas,
      frame.x, frame.y, frame.w, frame.h,
      -size / 2, -size / 2, size, size,
    );
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(48,12,18,${0.15 + fallEase * 0.45})`;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawDeathOverlay(anim) {
    const t = clamp(anim.timer / anim.duration, 0, 1);
    const fadeIn = clamp(t * 2, 0, 1);
    const vignetteAlpha = clamp(t * 0.85, 0, 0.82);
    const w = canvas.width;
    const h = canvas.height;

    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, h * 0.72);
    grad.addColorStop(0, `rgba(0,0,0,0)`);
    grad.addColorStop(1, `rgba(12,0,0,${vignetteAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const edgeAlpha = clamp(t * 0.7, 0, 0.62);
    const edgeSize = Math.min(w, h) * 0.28;
    ctx.fillStyle = `rgba(140,0,0,${edgeAlpha})`;
    ctx.fillRect(0, 0, w, edgeSize * 0.35);
    ctx.fillRect(0, h - edgeSize * 0.35, w, edgeSize * 0.35);
    ctx.fillRect(0, 0, edgeSize * 0.28, h);
    ctx.fillRect(w - edgeSize * 0.28, 0, edgeSize * 0.28, h);

    if (t > 0.55) {
      const textAlpha = clamp((t - 0.55) / 0.35, 0, 1);
      ctx.save();
      ctx.globalAlpha = textAlpha;
      ctx.font = `bold ${Math.round(h * 0.072)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff0020';
      ctx.shadowBlur = 32;
      ctx.fillStyle = '#fff0f0';
      ctx.fillText('YOU DIED', w / 2, h * 0.42);
      ctx.font = `${Math.round(h * 0.028)}px system-ui`;
      ctx.shadowBlur = 12;
      ctx.fillStyle = `rgba(255,200,200,${textAlpha * 0.85})`;
      ctx.fillText('Loading results...', w / 2, h * 0.42 + h * 0.072 * 0.9);
      ctx.restore();
    }

    void fadeIn;
  }

  function drawPlayer() {
    if (!player) return;
    const aimAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const facing = getFacingDirection(player, aimAngle);
    const shadowColor = godTimer > 0 ? 'rgba(255,248,210,0.65)' : 'rgba(0,0,0,0.25)';
    const _reduceFlash = window.NeoSettings?.getAccess()?.reduceFlash;
    STATUS_KEYS.filter(key => getStatusStacks(player, key) > 0).forEach((key, index) => {
      const style = STATUS_STYLES[key];
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = style.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, player.r + 6 + index * 4 + (_reduceFlash ? 0 : Math.sin(Date.now() / (160 + index * 40)) * 2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
    drawSpriteFrame(getPlayerSpriteKey(), player.x, player.y, Math.max(34, player.r * 2.5), {
      alpha: (!_reduceFlash && (player.inv > 0 || Number(player.stun || 0) > 0)) ? 0.68 : 1,
      flipX: facing < 0,
      shadowColor,
      shadowBlur: godTimer > 0 ? 18 : 6,
      tint: godTimer > 0 ? 'rgba(255,245,220,0.6)' : null,
    });
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.strokeStyle = '#f5f1e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(aimAngle) * 6, Math.sin(aimAngle) * 6);
    ctx.lineTo(Math.cos(aimAngle) * 20, Math.sin(aimAngle) * 20);
    ctx.stroke();
    const equippedWeapon = getEquippedWeapon();
    const extendingStaffEquipped = equippedWeapon === 'extending_staff';
    if (extendingStaffEquipped) {
      const previewRange = 130;
      const previewArc = 1.45;
      const previewX = Math.cos(aimAngle) * previewRange;
      const previewY = Math.sin(aimAngle) * previewRange;
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = '#d8f1ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(aimAngle) * 18, Math.sin(aimAngle) * 18);
      ctx.lineTo(previewX, previewY);
      ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(0, 0, previewRange, aimAngle - previewArc, aimAngle + previewArc);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#f3fbff';
      ctx.beginPath();
      ctx.arc(previewX, previewY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (player.swing > 0) {
      const swingRange = extendingStaffEquipped ? 130 : 55;
      const swingArc = extendingStaffEquipped ? 1.45 : ATTACKS.melee.arc;
      const swingTotal = ATTACKS.melee.active;
      const swingProgress = 1 - (player.swing / swingTotal);
      // Sweep right-to-left: arc starts at swingA+arc and sweeps to swingA-arc
      const sweepStart = player.swingA + swingArc;
      const sweepEnd = player.swingA - swingArc;
      const currentTip = sweepStart + (sweepEnd - sweepStart) * swingProgress;
      const trailLength = swingArc * 0.55;
      const trailStart = currentTip + trailLength;
      const fadeAlpha = 0.9 * (player.swing / swingTotal);
      const slashColor = extendingStaffEquipped ? '#eaf4ff' : godTimer > 0 ? '#f6e8c8' : '#d86d87';
      // Glow outer trail
      ctx.globalAlpha = fadeAlpha * 0.35;
      ctx.strokeStyle = slashColor;
      ctx.lineWidth = extendingStaffEquipped ? 14 : 10;
      ctx.shadowColor = slashColor;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, swingRange, trailStart, currentTip, true);
      ctx.stroke();
      // Main sharp edge
      ctx.globalAlpha = fadeAlpha;
      ctx.strokeStyle = slashColor;
      ctx.lineWidth = extendingStaffEquipped ? 5 : 3;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, swingRange, trailStart, currentTip, true);
      ctx.stroke();
      // Bright tip streak
      ctx.globalAlpha = fadeAlpha * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = extendingStaffEquipped ? 2 : 1.5;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(0, 0, swingRange, currentTip + 0.12, currentTip, true);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (extendingStaffEquipped) {
        ctx.globalAlpha = 0.12 * fadeAlpha;
        ctx.fillStyle = '#eaf4ff';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, swingRange, trailStart, currentTip, true);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function hexToRgba(hex, alpha) {
    const value = String(hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(168,216,255,${alpha})`;
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function drawPlayerSlot(slot) {
    const pn = slot?.getEntity?.();
    if (!pn) return;
    const charKey = slot.getCharacter();
    const tintColor = slot.color;
    const label = slot.label;
    const aimAngle = Math.atan2(pn.vy || 0, pn.vx || 1);
    const facing = getFacingDirection(pn, aimAngle);
    const spriteKey = SPRITE_DEFS[charKey] ? charKey : 'thorn_knight';
    drawSpriteFrame(spriteKey, pn.x, pn.y, Math.max(34, pn.r * 2.5), {
      alpha: pn.inv > 0 ? 0.55 : 1,
      flipX: facing < 0,
      shadowColor: hexToRgba(tintColor, 0.45),
      shadowBlur: 10,
      tint: hexToRgba(tintColor, 0.25),
    });
    ctx.save();
    ctx.translate(pn.x, pn.y);
    ctx.strokeStyle = tintColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(aimAngle) * 6, Math.sin(aimAngle) * 6);
    ctx.lineTo(Math.cos(aimAngle) * 20, Math.sin(aimAngle) * 20);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = tintColor;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, pn.x, pn.y - pn.r - 6);
    ctx.restore();
  }

  function drawPlayer2() {
    drawPlayerSlot(PLAYER_SLOT_CONFIG[1]);
  }

  function drawPlayerN(pn, charKey, tintColor, label) {
    const slot = getSlotByEntity(pn) || {
      getEntity: () => pn,
      getCharacter: () => charKey,
      color: tintColor,
      label,
    };
    drawPlayerSlot(slot);
  }

  function drawPlayerLaser() {
    if (!player) return;

    // Draw Laser Glasses weapon beams (two beams, ±0.2 spread)
    if (!laserActive && getEquippedWeapon() === 'lazer_glasses' && player.weaponBeamTime > 0) {
      const baseAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
      const alpha = Math.min(1, player.weaponBeamTime / 0.3);
      ctx.save();
      ctx.globalAlpha = alpha;
      [-0.2, 0.2].forEach(offset => {
        const beamAngle = baseAngle + offset;
        const beamPath = buildRicochetBeamPath(player.x, player.y, beamAngle, 430, LAZER_GLASSES_BOUNCES);
        drawTaperedBeamPath(beamPath, {
          color: '#cda8ff',
          glow: '#e0c8ff',
          maxWidth: 5,
          shadowBlur: 16,
        });
        // Tip burst
        if (rng() < 0.35) {
          const end = getBeamPathEnd(beamPath);
          particles.push({ x: end.x + (rng() - 0.5) * 5, y: end.y + (rng() - 0.5) * 5, life: 0.1 + rng() * 0.08, vx: (rng() - 0.5) * 35, vy: (rng() - 0.5) * 35, c: '#cda8ff' });
        }
      });
      ctx.restore();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      return;
    }

    if (!laserActive) return;
    const angle = laserMode === 'god_sweep'
      ? laserAngle
      : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const turtleWaveActive = laserMode === 'turtle_wave';
    const loveBeamActive = loveBeamCasting;
    const beamRange = getPlayerBeamRange(laserMode, getEquippedMove('laser'));
    const beamPath = buildRicochetBeamPath(player.x, player.y, angle, beamRange, getPlayerBeamBounceCount(laserMode));
    if (!beamPath.length) return;
    const beamColor = turtleWaveActive ? '#74f5ff' : loveBeamActive ? '#ff9ed6' : laserMode === 'god_sweep' ? '#ffffff' : '#ff00aa';
    const beamGlow = turtleWaveActive ? '#9bf7ff' : loveBeamActive ? '#ffd1ea' : laserMode === 'god_sweep' ? '#e8f0ff' : '#f0f';
    const maxW = laserMode === 'god_sweep' ? 16 : turtleWaveActive ? 18 : loveBeamActive ? 10 : 8;

    drawTaperedBeamPath(beamPath, {
      color: beamColor,
      glow: beamGlow,
      maxWidth: maxW,
      shadowBlur: laserMode === 'god_sweep' ? 26 : turtleWaveActive ? 30 : loveBeamActive ? 22 : 18,
    });

    // Beam particles: small dots that drift perpendicular and fade toward tip
    if (rng() < 0.55) {
      const sample = sampleBeamPath(beamPath, rng());
      if (sample) {
        const taper = 1 - sample.t * sample.t;
        const spread = maxW * taper * 0.7;
        const px = sample.x + sample.nx * (rng() - 0.5) * spread * 2;
        const py = sample.y + sample.ny * (rng() - 0.5) * spread * 2;
        const perpSpeed = (rng() - 0.5) * 28;
        const forwardSpeed = -rng() * 18;
        particles.push({
          x: px, y: py,
          life: 0.18 + rng() * 0.12,
          vx: sample.nx * perpSpeed + sample.dx * forwardSpeed,
          vy: sample.ny * perpSpeed + sample.dy * forwardSpeed,
          c: beamColor,
        });
      }
    }
    // Tip burst particles at beam end
    if (rng() < 0.4) {
      const end = getBeamPathEnd(beamPath);
      const tipPx = end.x + (rng() - 0.5) * 6;
      const tipPy = end.y + (rng() - 0.5) * 6;
      particles.push({
        x: tipPx, y: tipPy,
        life: 0.12 + rng() * 0.1,
        vx: (rng() - 0.5) * 40,
        vy: (rng() - 0.5) * 40,
        c: beamColor,
      });
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    particles.forEach(particle => {
      if (particle.line) {
        const line = particle.line;
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const segs = Math.max(4, line.seg || 6);
        const jitter = (line.jag || 12) * (0.65 + particle.life * 0.55);

        ctx.save();
        ctx.globalAlpha = Math.min(1, particle.life * 2.1);
        ctx.strokeStyle = particle.c || '#dfe8ff';
        ctx.lineWidth = (line.w || 4.5) + 3;
        ctx.shadowColor = particle.c || '#dfe8ff';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        for (let index = 1; index < segs; index += 1) {
          const t = index / segs;
          const wave = Math.sin((t * 18) + (line.phase || 0) + particle.life * 22 + index * 0.9);
          const off = wave * jitter * (index % 2 === 0 ? 1 : -1);
          const px = line.x1 + dx * t + nx * off;
          const py = line.y1 + dy * t + ny * off;
          ctx.lineTo(px, py);
        }
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();

        ctx.lineWidth = Math.max(2, (line.w || 4.5) * 0.5);
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        for (let index = 1; index < segs; index += 1) {
          const t = index / segs;
          const wave = Math.sin((t * 18) + (line.phase || 0) + particle.life * 22 + index * 0.9);
          const off = wave * jitter * 0.35 * (index % 2 === 0 ? 1 : -1);
          const px = line.x1 + dx * t + nx * off;
          const py = line.y1 + dy * t + ny * off;
          ctx.lineTo(px, py);
        }
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.globalAlpha = Math.min(1, particle.life * 1.5);
      ctx.translate(particle.x, particle.y);
      if (particle.text) {
        ctx.fillStyle = particle.c || '#fff';
        ctx.font = `bold ${particle.size || 14}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = particle.c;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 3;
        ctx.strokeStyle = particle.outline || 'rgba(0,0,0,0.7)';
        ctx.strokeText(particle.text, 0, -particle.life * 20);
        ctx.fillText(particle.text, 0, -particle.life * 20);
      } else if (particle.shockwave) {
        const maxLife = Number(particle.maxLife || AOE_SHOCKWAVE_LIFE);
        const progress = clamp(1 - particle.life / maxLife, 0, 1);
        const radius = Number(particle.radius || 48);
        const waveRadius = radius * (0.22 + progress * 0.92);
        ctx.globalAlpha = (1 - progress) * 0.8;
        ctx.strokeStyle = particle.c || '#ff66cc';
        ctx.shadowColor = particle.c || '#ff66cc';
        ctx.shadowBlur = 18;
        ctx.lineWidth = particle.style === 'heavy' ? 5 : 3;
        ctx.beginPath();
        if (particle.style === 'heavy') {
          for (let index = 0; index <= 28; index += 1) {
            const angle = (index / 28) * Math.PI * 2;
            const jag = 1 + Math.sin(index * 2.1 + progress * 12) * 0.055;
            const x = Math.cos(angle) * waveRadius * jag;
            const y = Math.sin(angle) * waveRadius * jag;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
        } else {
          ctx.arc(0, 0, waveRadius, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.globalAlpha = (1 - progress) * 0.16;
        ctx.fillStyle = particle.c || '#ff66cc';
        ctx.beginPath();
        ctx.arc(0, 0, radius * (0.3 + progress * 0.45), 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.impact) {
        const maxLife = Number(particle.maxLife || 0.24);
        const progress = clamp(1 - particle.life / maxLife, 0, 1);
        const size = Number(particle.size || 6) * (1 + progress * 1.4);
        ctx.rotate(Number(particle.angle || 0));
        ctx.globalAlpha = (1 - progress) * 0.85;
        ctx.strokeStyle = particle.c || '#fff';
        ctx.shadowColor = particle.c || '#fff';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;
        for (let index = 0; index < 4; index += 1) {
          const a = (index - 1.5) * 0.5;
          ctx.beginPath();
          ctx.moveTo(-size * 0.25, Math.sin(a) * size * 0.3);
          ctx.lineTo(size * (0.75 + index * 0.12), Math.sin(a) * size);
          ctx.stroke();
        }
        ctx.fillStyle = particle.c || '#fff';
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.spark) {
        const size = Number(particle.size || 2.2);
        const angle = Math.atan2(Number(particle.vy || 0), Number(particle.vx || 1));
        ctx.rotate(angle);
        ctx.fillStyle = particle.c || '#fff';
        ctx.shadowColor = particle.c || '#fff';
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 1.8, size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.ring) {
        ctx.strokeStyle = particle.c;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, particle.ring, 0, Math.PI * 2);
        ctx.stroke();
      } else if (particle.blood) {
        const size = particle.size || 3;
        const tilt = Math.atan2(Number(particle.vy || 0), Number(particle.vx || 1)) + Math.PI / 2;
        ctx.fillStyle = particle.c || '#a5001e';
        ctx.shadowColor = particle.c || '#a5001e';
        ctx.shadowBlur = 5;
        ctx.rotate(tilt);
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.72, size * 1.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha *= 0.5;
        ctx.beginPath();
        ctx.arc(0, size * 0.9, size * 0.34, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = particle.c || '#0ff';
        ctx.shadowColor = particle.c || '#0ff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawMinimap() {
    const baseSize = 14;
    const baseGap = 2;
    const gridSize = 9;
    const visibleRooms = rooms.filter(r => !r.secret);
    const maxGy = visibleRooms.reduce((m, r) => Math.max(m, r.gy), 0);
    const baseMapWidth = gridSize * baseSize + (gridSize - 1) * baseGap;
    const baseMapHeight = (maxGy + 1) * baseSize + maxGy * baseGap;
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width > 0 ? canvasRect.width / canvas.width : 1;
    const scaleY = canvasRect.height > 0 ? canvasRect.height / canvas.height : 1;
    const compact = window.innerWidth <= 920;
    const targetViewportWidth = compact ? Math.min(112, canvasRect.width * 0.25) : Math.min(146, canvasRect.width * 0.2);
    const targetViewportHeight = compact ? Math.min(112, canvasRect.height * 0.25) : Math.min(146, canvasRect.height * 0.23);
    const baseViewportWidth = baseMapWidth * scaleX;
    const baseViewportHeight = baseMapHeight * scaleY;
    const minimapScale = clamp(Math.min(1, targetViewportWidth / Math.max(1, baseViewportWidth), targetViewportHeight / Math.max(1, baseViewportHeight)), 0.62, 1);
    const size = Math.max(8, Math.round(baseSize * minimapScale));
    const gap = Math.max(1, Math.round(baseGap * minimapScale));
    const mapWidth = gridSize * size + (gridSize - 1) * gap;
    const mapHeight = (maxGy + 1) * size + maxGy * gap;
    const originX = canvas.width - mapWidth - 2;
    const originY = Math.round(-10 * minimapScale);
    const markerFont = `${Math.max(7, Math.round(size * 0.62))}px system-ui`;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#2a2e38';
    ctx.beginPath();
    ctx.roundRect(originX, originY, mapWidth, mapHeight, 6);
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#5a6070';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    rooms.forEach(room => {
      if (room.secret) return;
      const x = originX + room.gx * (size + gap);
      const y = originY + room.gy * (size + gap);
      if (room.type === 'ladder' && !room.explored) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#fff04a';
      } else if (!room.explored) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#001018';
      } else if (room.type === 'ladder') {
        ctx.globalAlpha = 1;
        ctx.fillStyle = room === currentRoom ? '#ffff00' : '#fff04a';
      } else if (room === currentRoom) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#00ffff';
      } else if (room.type === 'god') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffffff';
      } else if (room.type === 'challenge') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#d7f6ff';
      } else if (room.type === 'boss') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ff7a7a';
      } else if (room.type === 'treasure') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffaa00';
      } else if (room.type === 'shop') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#7ec8ff';
      } else if (room.type === 'anvil') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffb840';
      } else if (room.type === 'start') {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#00ff88';
      } else {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#0a3344';
      }
      ctx.fillRect(x, y, size, size);
      if (room.type === 'ladder') {
        ctx.globalAlpha = room.explored ? 1 : 0.7;
        ctx.fillStyle = '#fff700';
        ctx.font = `bold ${markerFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', x + size / 2, y + size / 2);
      } else if (room.type === 'challenge') {
        ctx.globalAlpha = room.explored ? 1 : 0.72;
        ctx.fillStyle = '#071116';
        ctx.font = `bold ${markerFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('T', x + size / 2, y + size / 2);
      } else if (room.type === 'shop') {
        ctx.globalAlpha = room.explored ? 1 : 0.72;
        ctx.fillStyle = '#071116';
        ctx.font = `bold ${markerFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', x + size / 2, y + size / 2);
      } else if (room.type === 'anvil') {
        ctx.globalAlpha = room.explored ? 1 : 0.72;
        ctx.fillStyle = '#1a0800';
        ctx.font = `bold ${markerFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚒', x + size / 2, y + size / 2);
      }
      if (room.visited) {
        ctx.strokeStyle = 'rgba(0,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      }
      if (room.secret) return;
      ctx.fillStyle = 'rgba(0,255,255,0.75)';
      if (room.doors.n) ctx.fillRect(x + size / 2 - 1, y - 2, 2, 2);
      if (room.doors.s) ctx.fillRect(x + size / 2 - 1, y + size, 2, 2);
      if (room.doors.w) ctx.fillRect(x - 2, y + size / 2 - 1, 2, 2);
      if (room.doors.e) ctx.fillRect(x + size, y + size / 2 - 1, 2, 2);
    });
    if (hasLegacy('elite_tracker')) {
      enemies.forEach(enemy => {
        if (!enemy.elite) return;
        const eRoom = rooms.find(r => r.gx === enemy.homeGx && r.gy === enemy.homeGy);
        if (!eRoom || eRoom.secret || eRoom === currentRoom) return;
        const rx = originX + eRoom.gx * (size + gap);
        const ry = originY + eRoom.gy * (size + gap);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(rx + size - 4, ry, 4, 4);
      });
    }
    ctx.restore();

    const viewportBounds = {
      left: canvasRect.left + originX * scaleX,
      top: canvasRect.top + originY * scaleY,
      right: canvasRect.left + (originX + mapWidth) * scaleX,
      bottom: canvasRect.top + (originY + mapHeight) * scaleY,
    };
    minimapLayoutState = {
      x: originX,
      y: originY,
      width: mapWidth,
      height: mapHeight,
      scale: minimapScale,
      viewportBounds,
    };
    return minimapLayoutState;
  }

  function drawGodModeBar() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(300, 12, 360, 6);
    ctx.fillStyle = `hsl(${(Date.now() / 10) % 360},100%,60%)`;
    ctx.fillRect(300, 12, 360 * (godTimer / 12), 6);
    ctx.fillStyle = '#fff';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('GOD MODE', 480, 10);
  }

  function getBossLabel(type) {
    if (type === 'queen_cult') return 'QUEEN OF THE CULT';
    if (type === 'bulk_golem') return 'BULK GOLEM';
    if (type === 'artificer_knave') return 'ARTIFICER CHARGED KNAVE';
    if (type === 'god') return 'GOD';
    return type.toUpperCase();
  }

  function drawBossHealthBars() {
    const bosses = enemies.filter(enemy => isBossType(enemy.type));
    if (!bosses.length) return;

    const width = 420;
    const height = 10;
    const gap = 18;
    const startX = (canvas.width - width) / 2;
    const startY = 76;

    bosses.forEach((boss, index) => {
      const y = startY + index * gap;
      const hpPct = clamp(boss.hp / boss.max, 0, 1);

      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(startX - 2, y - 2, width + 4, height + 4);
      ctx.fillStyle = '#220f28';
      ctx.fillRect(startX, y, width, height);

      ctx.fillStyle = boss.type === 'bulk_golem' ? '#ff8e4a' : boss.type === 'artificer_knave' ? '#ffd27d' : '#e4b9ff';
      if (boss.type === 'god') ctx.fillStyle = '#ffffff';
      ctx.fillRect(startX, y, width * hpPct, height);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(getBossLabel(boss.type), canvas.width / 2, y - 4);
    });
  }

  function drawFloorTransition() {
    if (!showFloorTransition || floorTransitionTime > 2.5) return;
    const _access = window.NeoSettings?.getAccess() || {};
    // With reduceMotion: skip the animated banner entirely
    if (_access.reduceMotion) return;

    const progress = floorTransitionTime / 2.5;
    const scaleProgress = Math.min(progress * 1.5, 1);
    const fadeInProgress = Math.min(progress * 2, 1);
    const fadeOutProgress = Math.max((progress - 0.7) / 0.3, 0);

    const baseScale = 0.3 + scaleProgress * 0.7;
    const alpha = fadeInProgress * (1 - fadeOutProgress);

    ctx.save();
    ctx.globalAlpha = alpha;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const offsetY = (1 - scaleProgress) * 80;

    ctx.translate(centerX, centerY - offsetY);
    ctx.scale(baseScale, baseScale);
    ctx.translate(-centerX, -centerY);

    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 40 * alpha;
    ctx.font = 'bold 72px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(`FLOOR ${floor}`, centerX, centerY);

    ctx.font = 'bold 24px system-ui';
    ctx.fillStyle = '#7dff9e';
    ctx.shadowColor = '#7dff9e';
    ctx.shadowBlur = 20 * alpha;
    ctx.fillText('▼ ▼ ▼', centerX, centerY + 50);

    ctx.restore();
  }

  function drawActionIcons() {
    const mobilityMove = getEquippedMove('dash');
    const mobilityIcon = mobilityMove === 'dash'
      ? {
        color: '#fff06a',
        pixels: [
          [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4],
          [4, 2], [5, 2], [6, 2], [6, 1], [7, 2], [6, 3],
        ],
      }
      : mobilityMove === 'warp'
      ? {
        color: '#c8a6ff',
        pixels: [
          [3, 1], [4, 1], [2, 2], [5, 2], [1, 3], [3, 3], [4, 3], [6, 3],
          [1, 4], [6, 4], [2, 5], [5, 5], [3, 6], [4, 6],
        ],
      }
      : mobilityMove === 'nimrod_stomp'
        ? {
          color: '#ffe67a',
          pixels: [
            [3, 1], [4, 1], [3, 2], [4, 2], [2, 3], [5, 3], [2, 4], [3, 4], [4, 4], [5, 4],
            [1, 5], [2, 5], [5, 5], [6, 5], [2, 6], [5, 6],
          ],
        }
      : mobilityMove === 'zip_lightning'
        ? {
          color: '#8dd6ff',
          pixels: [
            [1, 2], [2, 2], [3, 2], [2, 3], [3, 4], [4, 4], [5, 4], [4, 5], [5, 6], [6, 6],
            [6, 2], [7, 2], [6, 3],
          ],
        }
        : mobilityMove === 'cowards_way'
          ? {
            color: '#8fffca',
            pixels: [
              [3, 1], [4, 1], [2, 2], [5, 2], [1, 3], [6, 3], [1, 4], [6, 4],
              [2, 5], [5, 5], [3, 6], [4, 6], [3, 3], [4, 3], [3, 4], [4, 4],
            ],
          }
          : {
            color: '#8fffca',
            pixels: [
              [3, 1], [4, 1], [2, 2], [5, 2], [1, 3], [6, 3], [1, 4], [6, 4],
              [2, 5], [5, 5], [3, 6], [4, 6], [3, 3], [4, 3], [3, 4], [4, 4],
            ],
          };

    drawPixelIcon(ui.coinIcon, '#ffd15a', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
      [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
    ]);
    drawPixelIcon(ui.hudLoopIcon, '#83f3ff', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [5, 2],
      [1, 3], [5, 3],
      [1, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
      [2, 2], [4, 2], [2, 4], [4, 4],
      [3, 3],
    ]);
    drawPixelIcon(ui.metaCoinIcon, '#ffd15a', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
      [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
    ]);
    drawPixelIcon(ui.metaLoopIcon, '#83f3ff', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [5, 2],
      [1, 3], [5, 3],
      [1, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
      [2, 2], [4, 2], [2, 4], [4, 4],
      [3, 3],
    ]);
    drawPixelIcon(ui.icons.dash, mobilityIcon.color, mobilityIcon.pixels);
    drawPixelIcon(ui.icons.melee, '#00ffff', [
      [2, 6], [3, 5], [4, 4], [5, 3], [6, 2], [5, 4], [6, 3], [7, 2], [6, 5], [7, 4],
    ]);
    drawPixelIcon(ui.icons.laser, '#7a9fc4', [
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [5, 3], [6, 2], [7, 1],
    ]);
    drawPixelIcon(ui.icons.smash, '#ffaa00', [
      [4, 1], [3, 2], [4, 2], [5, 2], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3],
      [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [3, 5], [4, 5], [5, 5], [4, 6],
    ]);
  }

  const DIFFICULTY_ICON_DEFS = {
    easy: {
      color: '#7dffb0',
      pixels: [
        [1,0],[2,0],[3,0],
        [0,1],[4,1],
        [0,2],[2,2],[4,2],
        [0,3],[4,3],
        [1,4],[2,4],[3,4],
      ],
    },
    medium: {
      color: '#ffe566',
      pixels: [
        [0,0],[4,0],
        [0,1],[1,1],[3,1],[4,1],
        [1,2],[2,2],[3,2],
        [1,3],[2,3],[3,3],
        [0,4],[1,4],[3,4],[4,4],
      ],
    },
    hard: {
      color: '#ff7a45',
      pixels: [
        [2,0],
        [1,1],[3,1],
        [0,2],[2,2],[4,2],
        [0,3],[2,3],[4,3],
        [1,4],[2,4],[3,4],
      ],
    },
    impossible: {
      color: '#b06fff',
      pixels: [
        [1,0],[2,0],[3,0],
        [0,1],[2,1],[4,1],
        [0,2],[1,2],[2,2],[3,2],[4,2],
        [1,3],[2,3],[3,3],
        [1,4],[3,4],
      ],
    },
    god: {
      color: '#ff5577',
      pixels: [
        [0,0],[2,0],[4,0],
        [0,1],[1,1],[2,1],[3,1],[4,1],
        [0,2],[1,2],[2,2],[3,2],[4,2],
        [1,3],[2,3],[3,3],
        [1,4],[2,4],[3,4],
      ],
    },
  };

  function drawDifficultyIcons() {
    const hudIcon = ui?.difficultyHudIcon;
    if (hudIcon) {
      const key = Neo.selectedDifficulty || 'easy';
      const def = DIFFICULTY_ICON_DEFS[key] || DIFFICULTY_ICON_DEFS.easy;
      drawPixelIcon(hudIcon, def.color, def.pixels);
    }
    const btnIcons = ui?.difficultyBtnIcons || [];
    btnIcons.forEach(canvas => {
      const key = canvas.dataset.difficultyIcon;
      const def = DIFFICULTY_ICON_DEFS[key];
      if (def) drawPixelIcon(canvas, def.color, def.pixels);
    });
  }

  function drawPixelIcon(canvasEl, color, pixels) {
    const iconCtx = canvasEl.getContext('2d');
    iconCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    iconCtx.imageSmoothingEnabled = false;
    iconCtx.fillStyle = 'rgba(255,255,255,0.08)';
    iconCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    iconCtx.fillStyle = color;
    pixels.forEach(([px, py]) => {
      iconCtx.fillRect(px * 4, py * 4, 4, 4);
    });
  }

  function createUIController(view) {
    const UIManagerCtor = window.KozEngine?.UI?.uiManager?.UIManager || window.UIManager || null;
    const manager = typeof UIManagerCtor === 'function' ? new UIManagerCtor({ autoRuntimeInit: false }) : null;
    const DialogueManagerCtor = KozDialogueApi.TypewriterDialogueManager || window.TypewriterDialogueManager || null;
    const WorldSpeechBubbleCtor = KozWorldSpeechApi.WorldSpeechBubbleManager || window.WorldSpeechBubbleManager || null;
    const dialogueRuntime = typeof DialogueManagerCtor === 'function'
      ? new DialogueManagerCtor({
        gameStateManager,
        defaultSpeaker: 'GOD',
        typeSpeed: 0.028,
        autoAdvanceDelay: 1.35,
        onOpen: clearGameplayInput,
        onClose: clearGameplayInput,
      })
      : null;
    const worldSpeechRuntime = typeof WorldSpeechBubbleCtor === 'function'
      ? new WorldSpeechBubbleCtor({ typeSpeed: 0.024, holdTime: 1.55, maxBubbles: 8 })
      : null;
    let menuBound = false;
    let restartBound = false;
    let activeState = 'menu';
    let hudUpdateHook = null;
    let challengePanelOpen = false;
    let runHistoryOpen = false;
    let runHistoryPage = 0;
    let runHistoryEntries = [];
    let runHistoryModeFilter = 'all';
    let selectedRunHistoryId = '';
    let activeRunHistoryTab = 'stats';
    let tutorialBannerCache = { open: null, text: null, hint: null, prevDisabled: null, nextDisabled: null };
    let objectiveEntriesCache = [];
    let objectiveTrackerVisible = false;
    let objectiveCompactMode = false;
    let objectiveExpanded = true;
    const runHistoryPageSize = 8;

    function isCompactObjectiveViewport() {
      return window.innerWidth <= 920;
    }

    function getObjectiveCompactSummary(entries = []) {
      if (!entries.length) return 'No objectives';
      const doneCount = entries.filter(entry => String(entry?.state || '') === 'done').length;
      const primary = entries.find(entry => String(entry?.state || '') !== 'done') || entries[0];
      const primaryText = String(primary?.text || '').trim();
      return `${doneCount}/${entries.length} done${primaryText ? ` • ${primaryText}` : ''}`;
    }

    function syncObjectiveTrackerCompactState() {
      if (!view.objectiveTracker) return;
      const compact = isCompactObjectiveViewport();
      if (compact !== objectiveCompactMode) {
        objectiveCompactMode = compact;
        objectiveExpanded = compact ? false : true;
      }

      if (!objectiveTrackerVisible) {
        view.objectiveTracker.classList.remove('objective-tracker--compact', 'objective-tracker--expanded');
        if (view.objectiveSummary) view.objectiveSummary.classList.add('hidden');
        if (view.objectiveList) view.objectiveList.classList.remove('hidden');
        if (view.objectiveToggle) {
          view.objectiveToggle.classList.add('hidden');
          view.objectiveToggle.setAttribute('aria-expanded', 'false');
        }
        return;
      }

      view.objectiveTracker.classList.toggle('objective-tracker--compact', objectiveCompactMode);
      view.objectiveTracker.classList.toggle('objective-tracker--expanded', !objectiveCompactMode || objectiveExpanded);
      if (view.objectiveToggle) {
        const showToggle = objectiveCompactMode;
        view.objectiveToggle.classList.toggle('hidden', !showToggle);
        view.objectiveToggle.setAttribute('aria-expanded', objectiveExpanded ? 'true' : 'false');
        view.objectiveToggle.textContent = objectiveExpanded ? 'Hide' : 'Show';
      }
      if (view.objectiveSummary) {
        const showSummary = objectiveCompactMode && !objectiveExpanded;
        view.objectiveSummary.classList.toggle('hidden', !showSummary);
        view.objectiveSummary.textContent = showSummary ? getObjectiveCompactSummary(objectiveEntriesCache) : '';
      }
      if (view.objectiveList) {
        view.objectiveList.classList.toggle('hidden', objectiveCompactMode && !objectiveExpanded);
      }
    }

    function setObjectiveLayout(layout) {
      if (!view.objectiveTracker) return;
      if (!layout) {
        view.objectiveTracker.style.removeProperty('top');
        view.objectiveTracker.style.removeProperty('right');
        view.objectiveTracker.style.removeProperty('width');
        view.objectiveTracker.style.removeProperty('max-height');
        view.objectiveTracker.style.removeProperty('overflow-y');
        return;
      }

      const margin = 4;
      const gap = window.innerWidth <= 920 ? 8 : 12;
      const trackerWidth = Math.round(clamp(window.innerWidth <= 920 ? 124 : 142, 108, window.innerWidth - margin * 2));
      let right = Math.round(clamp(window.innerWidth - layout.right, margin, window.innerWidth - trackerWidth - margin));
      let top = Math.max(margin, Math.round(layout.bottom + gap));
      let maxHeight = Math.floor(window.innerHeight - top - margin);

      // If there is not enough room below the minimap, place objectives left of it.
      if (maxHeight < 92) {
        top = Math.max(margin, Math.round(layout.top));
        right = Math.round(clamp(window.innerWidth - layout.left + gap, margin, window.innerWidth - trackerWidth - margin));
        maxHeight = Math.floor(window.innerHeight - top - margin);
      }

      view.objectiveTracker.style.top = `${top}px`;
      view.objectiveTracker.style.right = `${right}px`;
      view.objectiveTracker.style.width = `${trackerWidth}px`;
      view.objectiveTracker.style.maxHeight = `${Math.max(74, maxHeight)}px`;
      view.objectiveTracker.style.overflowY = 'auto';
      syncObjectiveTrackerCompactState();
    }

    if (view.objectiveToggle) {
      view.objectiveToggle.addEventListener('click', () => {
        if (!objectiveCompactMode || !objectiveTrackerVisible) return;
        objectiveExpanded = !objectiveExpanded;
        syncObjectiveTrackerCompactState();
      });
    }

    window.addEventListener('resize', () => {
      syncObjectiveTrackerCompactState();
    });

    function getVisibleRunHistoryEntries() {
      if (runHistoryModeFilter === 'all') return runHistoryEntries;
      return runHistoryEntries.filter(entry => normalizeGameMode(entry.mode) === runHistoryModeFilter);
    }

    function renderRunHistoryModeTabs() {
      view.runHistoryModeTabs.forEach(tab => {
        const tabMode = tab.dataset.mode || 'all';
        const active = tabMode === runHistoryModeFilter;
        tab.classList.toggle('active', active);
      });
    }

    function makeContainer(element, visibleDisplay = '') {
      return {
        show() {
          if (!element) return;
          element.classList.remove('hidden');
          element.style.display = visibleDisplay;
        },
        hide() {
          if (!element) return;
          element.classList.add('hidden');
          element.style.display = 'none';
        },
      };
    }

    function setSkillCard(name, current, max, active = false, charges = 0, maxCharges = 1) {
      const fill = name === 'melee' ? view.fillMelee
        : name === 'laser' ? view.fillLaser
          : name === 'smash' ? view.fillSmash
            : view.fillDash;
      const time = name === 'melee' ? view.timeMelee
        : name === 'laser' ? view.timeLaser
          : name === 'smash' ? view.timeSmash
            : view.timeDash;
      const card = view.actionCards[name];
      const ready = charges > 0 && !active;
      const partialCharge = charges < maxCharges && max > 0 ? clamp(1 - (current / max), 0, 1) : 0;
      const ratio = maxCharges <= 0 ? 0 : clamp((charges + partialCharge) / maxCharges, 0, 1);
      if (fill) fill.style.height = `${ratio * 100}%`;
      if (time) {
        time.textContent = active
          ? 'CAST'
          : maxCharges > 1 && charges > 0
            ? `${charges}/${maxCharges}`
            : ready
              ? 'READY'
              : current.toFixed(1);
      }
      if (card) card.classList.toggle('ready', ready);
    }

    function resolveDialoguePortraitKey(speaker = '') {
      const raw = String(speaker || '').trim();
      if (!raw) return getPlayerSpriteKey();
      const normalized = raw
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalized) return getPlayerSpriteKey();

      const directKey = normalized.replace(/ /g, '_');
      if (SPRITE_DEFS[directKey]) return directKey;

      const noRival = normalized.replace(/^rival\s+/, '');
      const noRivalKey = noRival.replace(/ /g, '_');
      if (SPRITE_DEFS[noRivalKey]) return noRivalKey;

      if (normalized.includes('knight')) return 'thorn_knight';
      if (normalized.includes('knave')) return 'artificer_knave';
      if (normalized.includes('thorn')) return 'thorn_knight';
      if (normalized.includes('princess')) return 'princess';
      if (normalized.includes('metao')) return 'metao';
      if (normalized.includes('granialla')) return 'granialla';
      if (normalized.includes('queen') && normalized.includes('cult')) return 'queen_cult';
      if (normalized.includes('bulk') && normalized.includes('golem')) return 'bulk_golem';
      if (normalized.includes('artificer')) return 'artificer_knave';
      if (normalized.includes('golem')) return 'golem';
      if (normalized.includes('god')) return 'god';
      if (normalized.includes('mirror')) return getPlayerSpriteKey();
      return 'hunter';
    }

    function renderDialogue() {
      if (!view.dialogueOverlay || !view.dialogueSpeaker || !view.dialogueText) return;
      const snapshot = dialogueRuntime?.getSnapshot?.() || { active: false, speaker: 'GOD', visibleText: '', isFullyTyped: false };
      view.dialogueOverlay.classList.toggle('hidden', !snapshot.active);
      view.dialogueOverlay.style.display = snapshot.active ? 'flex' : 'none';
      view.dialogueOverlay.setAttribute('aria-hidden', snapshot.active ? 'false' : 'true');
      if (!snapshot.active) {
        if (view.dialoguePortrait instanceof HTMLCanvasElement) {
          const portraitCtx = view.dialoguePortrait.getContext('2d');
          portraitCtx?.clearRect(0, 0, view.dialoguePortrait.width, view.dialoguePortrait.height);
        }
        return;
      }
      view.dialogueSpeaker.textContent = snapshot.speaker || 'GOD';
      view.dialogueText.textContent = snapshot.visibleText || '';
      if (view.dialoguePortrait instanceof HTMLCanvasElement) {
        const spriteKey = resolveDialoguePortraitKey(snapshot.speaker || '');
        drawSpriteToCanvas(view.dialoguePortrait, spriteKey, view.dialoguePortrait.width);
      }
      if (view.dialogueHint) {
        view.dialogueHint.textContent = snapshot.isFullyTyped ? 'ENTER TO CONTINUE' : 'ENTER TO SKIP';
      }
    }

    function renderEntityDialogue() {
      const layer = view.entityDialogueLayer;
      if (!layer) return;
      const bubbles = worldSpeechRuntime?.getActive?.() || [];
      layer.innerHTML = '';
      layer.classList.toggle('hidden', bubbles.length === 0);
      layer.style.display = bubbles.length ? 'block' : 'none';
      layer.setAttribute('aria-hidden', bubbles.length ? 'false' : 'true');
      if (!bubbles.length) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;
      bubbles.forEach((bubble) => {
        const screenX = (bubble.anchor.x - camera.x) * scaleX;
        const screenY = (bubble.anchor.y - camera.y - (bubble.offsetY || 48)) * scaleY;
        if (screenX < -140 || screenX > rect.width + 140 || screenY < -140 || screenY > rect.height + 80) return;
        const el = document.createElement('div');
        el.className = 'entity-dialogue-bubble';
        el.dataset.tone = bubble.tone || 'boss';
        el.style.left = `${screenX}px`;
        el.style.top = `${screenY}px`;
        if (bubble.speaker) {
          const name = document.createElement('div');
          name.className = 'entity-dialogue-name';
          name.textContent = bubble.speaker;
          el.appendChild(name);
        }
        const text = document.createElement('div');
        text.className = 'entity-dialogue-text';
        text.textContent = bubble.visibleText || '';
        el.appendChild(text);
        layer.appendChild(el);
      });
    }

    function fallbackState(state) {
      const show = state || 'menu';
      function setVisible(element, visible, displayValue = '') {
        if (!element) return;
        element.classList.toggle('hidden', !visible);
        element.style.display = visible ? displayValue : 'none';
      }
      view.start.classList.toggle('hidden',     show !== 'menu');
      view.charSelect?.classList.toggle('hidden', show !== 'charselect');
      view.dead.classList.toggle('hidden',      show !== 'dead');
      view.win.classList.toggle('hidden',       show !== 'win');
      view.pause?.classList.toggle('hidden',    show !== 'pause');
      const inPlay = show === 'play' || show === 'pause' || show === 'dialogue' || show === 'dying';
      setVisible(view.hud, false, 'none');
      setVisible(view.actionBar, show === 'play' || show === 'pause' || show === 'dying', '');
      setVisible(view.hudLower, show === 'play' || show === 'pause', '');
      setVisible(view.adapterStatus, show === 'play' || show === 'pause', '');
      setVisible(view.playerStats, inPlay, '');
      setVisible(view.coinDisplay, inPlay, 'flex');
      setVisible(view.centerDisplay, inPlay, '');
      setVisible(view.objectiveTracker, inPlay, '');
      setVisible(view.dialogueOverlay, show === 'dialogue', 'flex');
      if (show !== 'play') setVisible(view.tutorialOverlay, false, 'flex');
      setVisible(view.entityDialogueLayer, inPlay, 'block');
      if (!inPlay && view.challengeStatus) {
        view.challengeStatus.classList.add('hidden');
        view.challengeStatus.setAttribute('aria-hidden', 'true');
      }
      if (show !== 'charselect') { setChallengePanelOpen(false); setLegacyPanelOpen(false); }
      if (show !== 'menu' && show !== 'pause') setRunHistoryOpen(false);
      if (show !== 'menu') { setAltModesPanelOpen(false); setSandboxPanelOpen(false); }
      setVisible(view.endlessHud, inPlay && gameMode === 'endless', 'flex');
      setVisible(view.practicePanel, inPlay && gameMode === 'practice' && show !== 'dying', 'block');
      const isBossRush = gameMode === 'boss_rush';
      if (view.timerFloorSlot) view.timerFloorSlot.style.display = isBossRush ? 'none' : '';
      if (view.timerBossSlot) view.timerBossSlot.style.display = isBossRush ? '' : 'none';
    }

    function setChallengePanelOpen(open) {
      challengePanelOpen = !!open;
      view.challengePanel?.classList.toggle('hidden', !challengePanelOpen);
      view.challengePanel?.setAttribute('aria-hidden', challengePanelOpen ? 'false' : 'true');
      view.challengeToggle?.setAttribute('aria-expanded', challengePanelOpen ? 'true' : 'false');
    }

    let legacyPanelOpen = false;
    function setLegacyPanelOpen(open) {
      legacyPanelOpen = !!open;
      view.legacyPanel?.classList.toggle('hidden', !legacyPanelOpen);
      view.legacyPanel?.setAttribute('aria-hidden', legacyPanelOpen ? 'false' : 'true');
      view.legacyToggle?.setAttribute('aria-expanded', legacyPanelOpen ? 'true' : 'false');
    }

    let runHistoryView = 'info';
    let activeInfoTab = 'items';

    function setRunHistoryOpen(open) {
      runHistoryOpen = !!open;
      view.runHistoryPanel?.classList.toggle('hidden', !runHistoryOpen);
      view.runHistoryPanel?.setAttribute('aria-hidden', runHistoryOpen ? 'false' : 'true');
      if (view.runHistoryBtn) {
        view.runHistoryBtn.textContent = runHistoryOpen ? 'HIDE INFO' : 'INFO';
        view.runHistoryBtn.setAttribute('aria-expanded', runHistoryOpen ? 'true' : 'false');
      }
      if (open) setRunHistoryView('info');
    }

    function setRunHistoryView(view_) {
      runHistoryView = view_;
      const showAch     = view_ === 'achievements';
      const showProfile = view_ === 'profile';
      const showInfo    = view_ === 'info';
      const showRuns    = !showAch && !showProfile && !showInfo;
      view.runHistoryBody?.classList.toggle('hidden', !showRuns);
      view.runHistoryEmpty?.classList.toggle('hidden', true);
      view.achievementsList?.classList.toggle('hidden', !showAch);
      view.rhProfilePanel?.classList.toggle('hidden', !showProfile);
      view.rhInfoPanel?.classList.toggle('hidden', !showInfo);
      const titles = { achievements: 'ACHIEVEMENTS', profile: 'PROFILE', runs: 'RUN HISTORY', info: 'INFO' };
      if (view.runHistoryPanelTitle) view.runHistoryPanelTitle.textContent = titles[view_] ?? 'INFO';
      view.runHistoryViewTabs?.forEach(t => t.classList.toggle('active', t.dataset.view === view_));
      if (showAch) populateAchievementsPanel();
      else if (showProfile) {
        if (view.rhBankCoins)  view.rhBankCoins.textContent  = metaProgress.coins ?? 0;
        if (view.rhLoopCount)  view.rhLoopCount.textContent  = metaProgress.loopCrystals ?? 0;
        if (view.rhBestFloor)  view.rhBestFloor.textContent  = metaProgress.bestFloor ?? 1;
        if (view.rhSaveState)  view.rhSaveState.textContent  = view.saveState?.textContent ?? '—';
      }
      else if (showInfo) populateInfoPanel(activeInfoTab);
      else { view.runHistoryEmpty?.classList.toggle('hidden', runHistory.length > 0); renderRunHistoryPage(); }
    }

    const ENEMY_INFO = [
      { key: 'hunter',          label: 'Hunter',          boss: false, hp: 52,   dmg: 12, speed: 96,  attackStyle: 'melee',   immunities: [],                                    desc: 'Relentless tracker that closes in fast and slashes. Low HP but high pressure.' },
      { key: 'charger',         label: 'Charger',         boss: false, hp: 68,   dmg: 14, speed: 118, attackStyle: 'dash',    immunities: [],                                    desc: 'Winds up then dashes straight at the player for heavy knockback damage.' },
      { key: 'laser',           label: 'Laser Unit',      boss: false, hp: 52,   dmg: 12, speed: 96,  attackStyle: 'ranged',  immunities: [],                                    desc: 'Fires a precision beam from range. Keeps distance and punishes slow movement.' },
      { key: 'knave',           label: 'Knave',           boss: false, hp: 68,   dmg: 14, speed: 118, attackStyle: 'melee',   immunities: [],                                    desc: 'Fast melee fighter with erratic movement. Hard to read at close range.' },
      { key: 'sniper',          label: 'Sniper',          boss: false, hp: 58,   dmg: 12, speed: 104, attackStyle: 'ranged',  immunities: [],                                    desc: 'Long-range shooter that aims carefully before firing a high-damage shot.' },
      { key: 'machine_gunner',  label: 'Machine Gunner',  boss: false, hp: 96,   dmg: 8,  speed: 112, attackStyle: 'burst',   immunities: [],                                    desc: 'Sprays bullets in rapid bursts. Low per-shot damage but overwhelming volume.' },
      { key: 'golem',           label: 'Golem',           boss: false, hp: 132,  dmg: 18, speed: 70,  attackStyle: 'melee',   immunities: ['bleed'],                             desc: 'Slow stone tank immune to bleed. High HP and damage make it dangerous up close.' },
      { key: 'cult_mage',       label: 'Cult Mage',       boss: false, hp: 84,   dmg: 18, speed: 58,  attackStyle: 'ranged',  immunities: [],                                    desc: 'Slow-moving caster that hurls powerful projectiles. Prioritise from a distance.' },
      { key: 'cult_follower',   label: 'Cult Follower',   boss: false, hp: 34,   dmg: 8,  speed: 138, attackStyle: 'melee',   immunities: [],                                    desc: 'Frail but extremely fast swarmer. Dangerous in groups.' },
      { key: 'summoner',        label: 'Summoner',        boss: false, hp: 120,  dmg: 12, speed: 66,  attackStyle: 'summon',  immunities: [],                                    desc: 'Hangs back and periodically summons reinforcements. Kill it first.' },
      { key: 'shield_unit',     label: 'Shield Unit',     boss: false, hp: 210,  dmg: 10, speed: 52,  attackStyle: 'melee',   immunities: ['bleed'],                             desc: 'Heavy armoured tank with a barrier. Bleed immune. Can boost nearby allies.' },
      { key: 'healer',          label: 'Healer',          boss: false, hp: 150,  dmg: 10, speed: 64,  attackStyle: 'support', immunities: [],                                    desc: 'Restores HP to nearby enemies on a cooldown. Eliminate it before it undoes your damage.' },
      { key: 'boss_spawner',    label: 'Boss Spawner',    boss: false, hp: 300,  dmg: 8,  speed: 42,  attackStyle: 'summon',  immunities: ['bleed'],                             desc: 'Immobile spawner that releases enemies on a timer. Destroy it before the countdown ends.' },
      { key: 'bulk_golem',      label: 'Bulk Golem',      boss: true,  hp: 1280, dmg: 31, speed: 88,  attackStyle: 'melee',   immunities: ['bleed'],                             desc: 'Boss. Massive golem that splits into smaller golems at low HP. Ground-slam AOE attack.' },
      { key: 'artificer_knave', label: 'Artificer Knave', boss: true,  hp: 1880, dmg: 20, speed: 124, attackStyle: 'melee',   immunities: [],                                    desc: 'Boss. High-speed multi-phase fighter. Becomes more aggressive at each phase threshold.' },
      { key: 'queen_cult',      label: 'Queen Cult',      boss: true,  hp: 760,  dmg: 20, speed: 96,  attackStyle: 'summon',  immunities: [],                                    desc: 'Boss. Cult leader that summons followers and mages while striking with projectiles.' },
      { key: 'mirror_knight',   label: 'Mirror Champion', boss: true,  hp: 0,    dmg: 0,  speed: 0,   attackStyle: 'mirror',  immunities: [],                                    desc: 'Elite. Copies the player\'s equipped moves and items. The perfect counter to your build.' },
      { key: 'god',             label: 'GOD',             boss: true,  hp: 920,  dmg: 18, speed: 108, attackStyle: 'beam',    immunities: ['bleed', 'fire', 'poison', 'dark'],   desc: 'Final boss. Multi-phase deity with beam sweeps, nova blasts, and judgement strikes. Immune to all status effects.' },
    ];

    function populateInfoPanel(tab) {
      activeInfoTab = tab;
      if (!view.rhInfoContent) return;
      view.rhInfoTabs?.forEach(t => t.classList.toggle('active', t.dataset.infoTab === tab));

      if (tab === 'items') {
        const rarityOrder = ['knight', 'wizard', 'god'];
        const sorted = Object.values(ITEM_DEFS).sort((a, b) => {
          const ri = rarityOrder.indexOf(a.rarity ?? a.category) - rarityOrder.indexOf(b.rarity ?? b.category);
          return ri !== 0 ? ri : (a.name || '').localeCompare(b.name || '');
        });
        view.rhInfoContent.innerHTML = `<div class="info-grid">${sorted.map(item => {
          const rarity = item.rarity || item.category || 'knight';
          return `<div class="info-card">
            <div class="info-card__header">
              <canvas class="info-card__icon" data-info-item="${item.key}" width="32" height="32"></canvas>
              <span class="info-card__name">${item.name}</span>
              <span class="info-card__tag info-card__tag--${rarity}">${rarity}</span>
            </div>
            <div class="info-card__desc">${item.description || ''}</div>
          </div>`;
        }).join('')}</div>`;
        view.rhInfoContent.querySelectorAll('[data-info-item]').forEach(el => {
          const item = ITEM_DEFS[el.dataset.infoItem];
          if (item) drawItemToastIcon(el, item);
        });

      } else if (tab === 'weapons') {
        const rarityOrder = ['knight', 'wizard', 'god'];
        const sorted = Object.values(WEAPON_DEFS).sort((a, b) => {
          const ri = rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
          return ri !== 0 ? ri : (a.name || '').localeCompare(b.name || '');
        });
        view.rhInfoContent.innerHTML = `<div class="info-grid">${sorted.map(w => {
          return `<div class="info-card">
            <div class="info-card__header">
              <canvas class="info-card__icon" data-info-weapon="${w.key}" width="32" height="32"></canvas>
              <span class="info-card__name">${w.name}</span>
              <span class="info-card__tag info-card__tag--${w.rarity}">${w.rarity}</span>
            </div>
            <div class="info-card__desc">${w.description || ''}</div>
          </div>`;
        }).join('')}</div>`;
        view.rhInfoContent.querySelectorAll('[data-info-weapon]').forEach(el => {
          const w = WEAPON_DEFS[el.dataset.infoWeapon];
          if (w) drawItemToastIcon(el, w);
        });

      } else if (tab === 'moves') {
        const slotOrder = ['melee', 'laser', 'smash', 'dash'];
        const sorted = Object.values(MOVE_DEFS).sort((a, b) => {
          const si = slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot);
          return si !== 0 ? si : (a.name || '').localeCompare(b.name || '');
        });
        view.rhInfoContent.innerHTML = `<div class="info-grid">${sorted.map(m => {
          const slotLabel = SLOT_LABELS[m.slot] || m.slot;
          const exclusive = m.exclusiveCharacter
            ? `<br><em style="color:rgba(200,200,255,0.5)">${titleCase(m.exclusiveCharacter.replace(/_/g, ' '))} only</em>`
            : '';
          return `<div class="info-card">
            <div class="info-card__header">
              <canvas class="info-card__icon" data-info-move="${m.key}" width="32" height="32"></canvas>
              <span class="info-card__name">${m.name}</span>
              <span class="info-card__tag info-card__tag--${m.slot}">${slotLabel}</span>
            </div>
            <div class="info-card__desc">${m.desc || ''}${exclusive}</div>
          </div>`;
        }).join('')}</div>`;
        view.rhInfoContent.querySelectorAll('[data-info-move]').forEach(el => {
          const move = MOVE_DEFS[el.dataset.infoMove];
          if (move) drawMoveToastIcon(el, move);
        });

      } else if (tab === 'enemies') {
        const attackStyleLabel = { melee: 'Melee', dash: 'Dash', ranged: 'Ranged', burst: 'Burst', summon: 'Summoner', support: 'Support', mirror: 'Mirror', beam: 'Beam' };
        view.rhInfoContent.innerHTML = `
          <div class="info-enemy-layout">
            <div class="info-enemy-grid">${ENEMY_INFO.map(e => {
              const tagClass = e.boss ? 'info-enemy-card__tag--boss' : 'info-enemy-card__tag--normal';
              return `<div class="info-enemy-card" data-enemy-select="${e.key}" tabindex="0">
                <canvas class="info-enemy-card__sprite" data-info-enemy="${e.key}" width="52" height="52"></canvas>
                <div class="info-enemy-card__name">${e.label}</div>
                <span class="info-enemy-card__tag ${tagClass}">${e.boss ? 'Boss' : 'Enemy'}</span>
              </div>`;
            }).join('')}</div>
            <div class="info-enemy-detail hidden" id="infoEnemyDetail">
              <canvas class="info-enemy-detail__sprite" id="infoEnemySprite" width="80" height="80"></canvas>
              <div class="info-enemy-detail__name" id="infoEnemyName"></div>
              <div class="info-enemy-detail__tag-row" id="infoEnemyTagRow"></div>
              <div class="info-enemy-detail__stats" id="infoEnemyStats"></div>
              <div class="info-enemy-detail__desc" id="infoEnemyDesc"></div>
            </div>
          </div>`;
        view.rhInfoContent.querySelectorAll('[data-info-enemy]').forEach(el => {
          drawSpriteToCanvas(el, el.dataset.infoEnemy, 48);
        });
        const showEnemyDetail = (key) => {
          const e = ENEMY_INFO.find(x => x.key === key);
          if (!e) return;
          const detail = document.getElementById('infoEnemyDetail');
          const sprite = document.getElementById('infoEnemySprite');
          if (!detail || !sprite) return;
          detail.classList.remove('hidden');
          drawSpriteToCanvas(sprite, key, 76);
          document.getElementById('infoEnemyName').textContent = e.label;
          const isBoss = e.boss;
          const tagCls = isBoss ? 'info-enemy-card__tag--boss' : 'info-enemy-card__tag--normal';
          const styleLbl = attackStyleLabel[e.attackStyle] || e.attackStyle;
          document.getElementById('infoEnemyTagRow').innerHTML =
            `<span class="info-enemy-card__tag ${tagCls}">${isBoss ? 'Boss' : 'Enemy'}</span>` +
            `<span class="info-enemy-detail__style-tag">${styleLbl}</span>`;
          const immHtml = e.immunities.length
            ? e.immunities.map(im => `<span class="info-enemy-detail__imm">${im}</span>`).join('')
            : '<span class="info-enemy-detail__imm info-enemy-detail__imm--none">None</span>';
          const hpRow    = e.hp    ? `<div class="ied-stat"><span class="ied-stat__label">HP</span><span class="ied-stat__value">${e.hp}</span></div>` : '';
          const dmgRow   = e.dmg   ? `<div class="ied-stat"><span class="ied-stat__label">DMG</span><span class="ied-stat__value">${e.dmg}</span></div>` : '';
          const spdRow   = e.speed ? `<div class="ied-stat"><span class="ied-stat__label">SPD</span><span class="ied-stat__value">${e.speed}</span></div>` : '';
          document.getElementById('infoEnemyStats').innerHTML =
            `<div class="ied-stats-row">${hpRow}${dmgRow}${spdRow}</div>` +
            `<div class="ied-imm-row"><span class="ied-imm-label">Immune:</span>${immHtml}</div>`;
          document.getElementById('infoEnemyDesc').textContent = e.desc || '';
          view.rhInfoContent.querySelectorAll('[data-enemy-select]').forEach(card => {
            card.classList.toggle('info-enemy-card--selected', card.dataset.enemySelect === key);
          });
        };
        view.rhInfoContent.querySelectorAll('[data-enemy-select]').forEach(card => {
          card.addEventListener('click', () => showEnemyDetail(card.dataset.enemySelect));
          card.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') showEnemyDetail(card.dataset.enemySelect); });
        });
        showEnemyDetail(ENEMY_INFO[0].key);

      } else if (tab === 'characters') {
        view.rhInfoContent.innerHTML = `<div class="info-char-grid">${Object.values(CHARACTER_DEFS).map(c => {
          const display = HERO_DISPLAY[c.key] || {};
          const statBars = (display.stats || []).map(s =>
            `<div class="info-char-stat">
              <span class="info-char-stat__label">${s.label}</span>
              <div class="info-char-stat__bar"><div class="info-char-stat__fill" style="width:${s.pct}%;background:${s.color}"></div></div>
            </div>`
          ).join('');
          const lockNote = c.unlock === 'godslain'
            ? '<div style="font-size:11px;color:rgba(255,110,80,0.75);margin-top:6px">Unlock: Slay GOD</div>'
            : '';
          return `<div class="info-char-card">
            <canvas class="info-char-card__sprite" data-info-char="${c.key}" width="64" height="64"></canvas>
            <div class="info-char-card__body">
              <div class="info-char-card__name">${c.name.toUpperCase()}</div>
              <div class="info-char-card__lore">${display.lore || ''}</div>
              <div class="info-char-card__stats">${statBars}</div>
              ${lockNote}
            </div>
          </div>`;
        }).join('')}</div>`;
        view.rhInfoContent.querySelectorAll('[data-info-char]').forEach(el => {
          drawSpriteToCanvas(el, el.dataset.infoChar, 60);
        });
      }
    }

    async function populateAchievementsPanel() {
      if (!view.achievementsList) return;
      view.achievementsList.innerHTML = '<div class="ach-loading">Loading…</div>';
      const progressSnapshot = typeof achievementManager.getProgressSnapshot === 'function'
        ? await achievementManager.getProgressSnapshot()
        : {};
      progressSnapshot.metaCoins = Math.max(
        Math.max(0, Number(progressSnapshot.metaCoins) || 0),
        Math.max(0, Number(metaProgress?.coins) || 0)
      );
      const cards = await Promise.all(ACHIEVEMENTS.map(async a => {
        const unlocked = await achievementManager.isUnlocked(a.id);
        const progressDef = ACHIEVEMENT_PROGRESS?.[a.id];
        const progressMarkup = !unlocked && progressDef
          ? renderAchievementProgress(progressDef, progressSnapshot)
          : '';
        return `<div class="ach-card${unlocked ? '' : ' ach-card--locked'}">
          <span class="ach-icon">${a.icon}</span>
          <div>
            <div class="ach-name">${a.name}</div>
            <div class="ach-desc">${a.desc}</div>
            ${progressMarkup}
            <div class="${unlocked ? 'ach-unlocked-badge' : 'ach-locked-badge'}">${unlocked ? '✓ Unlocked  +1 ◆' : '— Locked'}</div>
          </div>
        </div>`;
      }));
      view.achievementsList.innerHTML = cards.join('');
    }

    function renderAchievementProgress(progressDef, progressSnapshot) {
      const target = Math.max(1, Number(progressDef.target) || 1);
      const rawValue = Math.max(0, Number(progressSnapshot?.[progressDef.key]) || 0);
      const value = Math.min(rawValue, target);
      const percent = Math.max(0, Math.min(100, (value / target) * 100));
      return `<div class="ach-progress" aria-label="${escapeHtml(progressDef.label)} ${value} of ${target}">
        <div class="ach-progress__meta">
          <span>${escapeHtml(progressDef.label)}</span>
          <b>${value.toLocaleString()} / ${target.toLocaleString()}</b>
        </div>
        <div class="ach-progress__track"><i style="width:${percent.toFixed(2)}%"></i></div>
      </div>`;
    }

    function setAchievementsPanelOpen(open) {
      setRunHistoryOpen(open);
      if (open) setRunHistoryView('achievements');
    }

    function setAltModesPanelOpen(open) {
      view.altModesPanel?.classList.toggle('hidden', !open);
      view.altModesPanel?.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    function setSandboxPanelOpen(open) {
      view.sandboxPanel?.classList.toggle('hidden', !open);
      view.sandboxPanel?.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    function renderRunHistoryDetail() {
      const visibleEntries = getVisibleRunHistoryEntries();
      const selected = visibleEntries.find(entry => entry.id === selectedRunHistoryId) || visibleEntries[0] || null;
      view.runHistoryTabs.forEach(tab => {
        const active = (tab.dataset.tab || 'stats') === activeRunHistoryTab;
        tab.classList.toggle('active', active);
      });
      if (!selected) {
        if (view.runHistoryHero) view.runHistoryHero.innerHTML = '';
        if (view.runHistoryTabPanel) view.runHistoryTabPanel.innerHTML = '';
        return;
      }
      if (view.runHistoryHero) {
        view.runHistoryHero.innerHTML = renderRunHistoryHero(selected);
        hydrateRunHistorySprites(view.runHistoryHero);
      }
      if (view.runHistoryTabPanel) {
        view.runHistoryTabPanel.innerHTML = renderRunHistoryTabContent(selected, activeRunHistoryTab);
        hydrateRunHistorySprites(view.runHistoryTabPanel);
      }
    }

    function renderRunHistoryPage() {
      renderRunHistoryModeTabs();
      const visibleEntries = getVisibleRunHistoryEntries();
      const totalPages = Math.max(1, Math.ceil(visibleEntries.length / runHistoryPageSize));
      runHistoryPage = clamp(runHistoryPage, 0, totalPages - 1);
      const start = runHistoryPage * runHistoryPageSize;
      const visiblePageEntries = visibleEntries.slice(start, start + runHistoryPageSize);
      if (!visibleEntries.some(entry => entry.id === selectedRunHistoryId)) {
        selectedRunHistoryId = visibleEntries[0]?.id || '';
      }
      if (view.runHistoryEmpty) view.runHistoryEmpty.classList.toggle('hidden', visibleEntries.length > 0);
      if (view.runHistoryList) {
        view.runHistoryList.innerHTML = visiblePageEntries.map(entry => renderRunHistoryListEntry(entry, entry.id === selectedRunHistoryId)).join('');
        view.runHistoryList.classList.toggle('hidden', visibleEntries.length === 0);
        view.runHistoryList.scrollTop = 0;
        hydrateRunHistorySprites(view.runHistoryList);
      }
      renderRunHistoryDetail();
      if (view.runHistoryPageLabel) {
        view.runHistoryPageLabel.textContent = visibleEntries.length
          ? `Page ${runHistoryPage + 1} / ${totalPages}`
          : 'Page 0 / 0';
      }
      if (view.runHistoryPrev) view.runHistoryPrev.disabled = runHistoryPage <= 0;
      if (view.runHistoryNext) view.runHistoryNext.disabled = runHistoryPage >= totalPages - 1 || visibleEntries.length === 0;
    }

    if (manager && typeof manager.registerScreen === 'function') {
      manager.registerScreen('coinDisplay', {
        create: () => makeContainer(view.coinDisplay, 'flex'),
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('centerDisplay', {
        create: () => makeContainer(view.centerDisplay, ''),
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('playerStats', {
        create: () => makeContainer(view.playerStats, ''),
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('actionBar', {
        create: () => makeContainer(view.actionBar, ''),
        validStates: ['play', 'pause'],
      });
      manager.registerScreen('hudLower', {
        create: () => makeContainer(view.hudLower, ''),
        validStates: ['play', 'pause'],
      });
      manager.registerScreen('adapterStatus', {
        create: () => makeContainer(view.adapterStatus, ''),
        validStates: ['play', 'pause'],
      });
      manager.registerScreen('dialogue', {
        create: () => makeContainer(view.dialogueOverlay, 'flex'),
        show: renderDialogue,
        update: renderDialogue,
        validStates: ['dialogue'],
      });
      manager.registerScreen('entityDialogue', {
        create: () => makeContainer(view.entityDialogueLayer, 'block'),
        show: renderEntityDialogue,
        update: renderEntityDialogue,
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('start', { create: () => makeContainer(view.start, ''), validStates: ['menu'] });
      manager.registerScreen('charSelect', { create: () => makeContainer(view.charSelect, ''), validStates: ['charselect'] });
      manager.registerScreen('dead', { create: () => makeContainer(view.dead, ''), validStates: ['dead'] });
      manager.registerScreen('win', { create: () => makeContainer(view.win, ''), validStates: ['win'] });
      manager.registerScreen('pause', { create: () => makeContainer(view.pause, ''), validStates: ['pause'] });
      if (gameStateManager && typeof manager.bindToStateManager === 'function') {
        manager.bindToStateManager(gameStateManager, { initialSync: true });
      }
    }

    if (gameStateManager && typeof gameStateManager.onChange === 'function') {
      gameStateManager.onChange((_from, to) => {
        activeState = to || 'menu';
        gameState = activeState;
        fallbackState(activeState);
      });
    }

    return {
      setState(state) {
        activeState = state || 'menu';
        if (gameStateManager && typeof gameStateManager.getState === 'function' && gameStateManager.getState() !== state) {
          gameStateManager.setState(state);
          return;
        }
        if (manager && typeof manager.onGameStateChange === 'function') manager.onGameStateChange(state);
        fallbackState(state);
      },
      setHudUpdateHook(hook) {
        hudUpdateHook = typeof hook === 'function' ? hook : null;
      },
      tick(dt = 0) {
        if (dialogueRuntime?.update) dialogueRuntime.update(dt);
        if (worldSpeechRuntime?.update) worldSpeechRuntime.update(dt);
        if (manager && typeof manager.updateAll === 'function') {
          manager.updateAll();
        } else {
          renderDialogue();
          renderEntityDialogue();
        }
        if ((activeState === 'play' || activeState === 'dying') && hudUpdateHook) hudUpdateHook();
      },
      bindMenuActions(handlers) {
        if (menuBound) return;
        view.charButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onCharacterSelect(button.dataset.char || '', button);
          });
        });

        // Carousel prev/next arrows
        const carouselPrev = document.getElementById('carouselPrev');
        const carouselNext = document.getElementById('carouselNext');
        const charOrder = ['princess', 'thorn_knight', 'metao', 'granialla'];
        function carouselStep(delta) {
          const currentIndex = charOrder.indexOf(handlers._getChosenCharacter ? handlers._getChosenCharacter() : 'princess');
          let nextIndex = currentIndex;
          while (nextIndex + delta >= 0 && nextIndex + delta < charOrder.length) {
            nextIndex += delta;
            const nextKey = charOrder[nextIndex];
            const btn = view.charButtons.find(b => b.dataset.char === nextKey);
            if (btn && !btn.classList.contains('locked')) {
              handlers.onCharacterSelect(nextKey, btn);
              break;
            }
          }
        }
        carouselPrev?.addEventListener('click', () => carouselStep(-1));
        carouselNext?.addEventListener('click', () => carouselStep(1));

        // Touch swipe on carousel viewport
        const viewport = document.querySelector('.char-carousel-viewport');
        if (viewport) {
          let touchStartX = 0;
          viewport.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
          viewport.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 40) carouselStep(dx < 0 ? 1 : -1);
          }, { passive: true });
        }

        view.difficultyButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onDifficultySelect(button.dataset.difficulty || '', button);
          });
        });

        // Sandbox Lab panel: visual "game hacking" controls moved to Alt Modes.
        function getSandboxEnemySpriteKey(type) {
          if (type === 'boss_spawner') return 'cult_follower';
          return type;
        }

        function hydrateSandboxTokenIcons() {
          view.sandboxEnemyList?.querySelectorAll('[data-sbox-enemy-icon]').forEach(el => {
            const key = String(el.dataset.sboxEnemyIcon || 'hunter');
            drawSpriteToCanvas(el, getSandboxEnemySpriteKey(key), 22);
          });
          view.sandboxItemList?.querySelectorAll('[data-sbox-item-icon]').forEach(el => {
            const itemKey = String(el.dataset.sboxItemIcon || '');
            const item = itemRegistry.get(itemKey) || ITEM_DEFS[itemKey];
            if (item) drawItemToastIcon(el, item);
          });
        }

        function renderSandboxTokenLists() {
          if (view.sandboxEnemyList) {
            view.sandboxEnemyList.innerHTML = SANDBOX_ENEMY_TYPES.map(type => {
              const active = sandboxSettings.allowedEnemies.includes(type);
              const label = getEnemyLabel(type);
              return `<button class="sandbox-token${active ? ' is-active' : ''}" data-sbox-enemy="${type}" type="button">`
                + `<canvas class="sandbox-token__icon" data-sbox-enemy-icon="${escapeHtml(type)}" width="28" height="28" aria-hidden="true"></canvas>`
                + `<span class="sandbox-token__label">${escapeHtml(label)}</span>`
                + `</button>`;
            }).join('');
          }
          if (view.sandboxItemList) {
            view.sandboxItemList.innerHTML = ITEM_KEYS.map(key => {
              const active = sandboxSettings.allowedItems.includes(key);
              const item = itemRegistry.get(key) || ITEM_DEFS[key];
              const label = item?.name || key.replace(/_/g, ' ');
              const rarity = String(item?.rarity || 'knight');
              return `<button class="sandbox-token sandbox-token--item sandbox-token--${escapeHtml(rarity)}${active ? ' is-active' : ''}" data-sbox-item="${key}" type="button">`
                + `<canvas class="sandbox-token__icon sandbox-token__icon--item" data-sbox-item-icon="${escapeHtml(key)}" width="26" height="26" aria-hidden="true"></canvas>`
                + `<span class="sandbox-token__label">${escapeHtml(label)}</span>`
                + `</button>`;
            }).join('');
          }
          hydrateSandboxTokenIcons();
        }

        function syncSandboxPanelFields() {
          document.querySelectorAll('#sandboxGrid .sandbox-row').forEach(row => {
            const param = row.dataset.sboxParam;
            if (!param) return;
            const slider = row.querySelector('.sandbox-slider');
            const numInput = row.querySelector('.sandbox-num');
            const value = sandboxSettings[param];
            if (slider && value !== undefined) slider.value = value;
            if (numInput && value !== undefined) numInput.value = value;
          });
          if (view.sandboxGodMode) view.sandboxGodMode.checked = !!sandboxSettings.godMode;
          renderSandboxTokenLists();
        }

        document.querySelectorAll('#sandboxGrid .sandbox-row').forEach(row => {
          const param = row.dataset.sboxParam;
          if (!param) return;
          const slider = row.querySelector('.sandbox-slider');
          const numInput = row.querySelector('.sandbox-num');
          const integerParam = param === 'startingCoins';
          function applyValue(raw) {
            const parsed = integerParam ? parseInt(raw, 10) : parseFloat(raw);
            const min = Number(slider?.min ?? 0);
            const max = Number(slider?.max ?? 1);
            const fallback = Number(slider?.value ?? 0);
            const clamped = Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback));
            const rounded = integerParam ? Math.round(clamped) : Math.round(clamped * 100) / 100;
            if (slider) slider.value = String(rounded);
            if (numInput) numInput.value = String(rounded);
            sandboxSettings[param] = rounded;
            persistMetaSoon();
          }
          slider?.addEventListener('input', () => applyValue(slider.value));
          numInput?.addEventListener('change', () => applyValue(numInput.value));
        });

        view.sandboxGodMode?.addEventListener('change', () => {
          sandboxSettings.godMode = !!view.sandboxGodMode?.checked;
          persistMetaSoon();
        });

        view.sandboxEnemyList?.addEventListener('click', event => {
          const btn = event.target instanceof Element ? event.target.closest('[data-sbox-enemy]') : null;
          if (!btn) return;
          const type = String(btn.dataset.sboxEnemy || '');
          if (!SANDBOX_ENEMY_TYPES.includes(type)) return;
          if (sandboxSettings.allowedEnemies.includes(type)) {
            sandboxSettings.allowedEnemies = sandboxSettings.allowedEnemies.filter(key => key !== type);
          } else {
            sandboxSettings.allowedEnemies = [...sandboxSettings.allowedEnemies, type];
          }
          sandboxSettings = normalizeSandboxSettings(sandboxSettings);
          syncSandboxPanelFields();
          persistMetaSoon();
        });

        view.sandboxItemList?.addEventListener('click', event => {
          const btn = event.target instanceof Element ? event.target.closest('[data-sbox-item]') : null;
          if (!btn) return;
          const key = String(btn.dataset.sboxItem || '');
          if (!ITEM_KEYS.includes(key)) return;
          if (sandboxSettings.allowedItems.includes(key)) {
            sandboxSettings.allowedItems = sandboxSettings.allowedItems.filter(itemKey => itemKey !== key);
          } else {
            sandboxSettings.allowedItems = [...sandboxSettings.allowedItems, key];
          }
          sandboxSettings = normalizeSandboxSettings(sandboxSettings);
          syncSandboxPanelFields();
          persistMetaSoon();
        });

        view.sandboxEnemiesAll?.addEventListener('click', () => {
          sandboxSettings.allowedEnemies = SANDBOX_ENEMY_TYPES.slice();
          syncSandboxPanelFields();
          persistMetaSoon();
        });
        view.sandboxEnemiesNone?.addEventListener('click', () => {
          sandboxSettings.allowedEnemies = [];
          sandboxSettings = normalizeSandboxSettings(sandboxSettings);
          syncSandboxPanelFields();
          persistMetaSoon();
        });
        view.sandboxItemsAll?.addEventListener('click', () => {
          sandboxSettings.allowedItems = ITEM_KEYS.slice();
          syncSandboxPanelFields();
          persistMetaSoon();
        });
        view.sandboxItemsNone?.addEventListener('click', () => {
          sandboxSettings.allowedItems = [];
          sandboxSettings = normalizeSandboxSettings(sandboxSettings);
          syncSandboxPanelFields();
          persistMetaSoon();
        });
        view.sandboxReset?.addEventListener('click', () => {
          sandboxSettings = normalizeSandboxSettings(SANDBOX_DEFAULT_SETTINGS);
          syncSandboxPanelFields();
          persistMetaSoon();
        });
        view.sandboxSaveClose?.addEventListener('click', handlers.onCloseSandboxConfig);
        view.sandboxClose?.addEventListener('click', handlers.onCloseSandboxConfig);
        view.sandboxPanelBackdrop?.addEventListener('click', handlers.onCloseSandboxConfig);
        syncSandboxPanelFields();

        view.challengeButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onChallengeSelect(button.dataset.challenge || '', button);
          });
        });
        view.challengeToggle?.addEventListener('click', handlers.onToggleChallenges);
        view.challengeClose?.addEventListener('click', () => setChallengePanelOpen(false));
        view.legacyButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onLegacySelect(button.dataset.legacy || '');
          });
        });
        view.legacyToggle?.addEventListener('click', handlers.onToggleLegacy);
        view.legacyClose?.addEventListener('click', () => setLegacyPanelOpen(false));
        view.runHistoryBtn?.addEventListener('click', handlers.onToggleRunHistory);
        view.runHistoryClose?.addEventListener('click', () => setRunHistoryOpen(false));
        view.runHistoryViewTabs?.forEach(tab => {
          tab.addEventListener('click', () => setRunHistoryView(tab.dataset.view || 'info'));
        });
        view.rhInfoTabs?.forEach(tab => {
          tab.addEventListener('click', () => populateInfoPanel(tab.dataset.infoTab || 'items'));
        });
        view.infoTutorialBtn?.addEventListener('click', () => {
          localStorage.setItem(REPLAY_TUTORIAL_KEY, '1');
          view.infoTutorialBtn.textContent = '✓ Set for next run';
          view.infoTutorialBtn.disabled = true;
          setTimeout(() => {
            if (view.infoTutorialBtn) {
              view.infoTutorialBtn.textContent = '▶ Tutorial';
              view.infoTutorialBtn.disabled = false;
            }
          }, 2200);
        });
        view.runHistoryPrev?.addEventListener('click', () => {
          runHistoryPage = Math.max(0, runHistoryPage - 1);
          renderRunHistoryPage();
        });
        view.runHistoryNext?.addEventListener('click', () => {
          runHistoryPage += 1;
          renderRunHistoryPage();
        });
        view.runHistoryList?.addEventListener('click', event => {
          const target = event.target instanceof Element ? event.target.closest('[data-run-id]') : null;
          if (!target) return;
          selectedRunHistoryId = target.dataset.runId || '';
          renderRunHistoryPage();
        });
        view.runHistoryHero?.addEventListener('click', event => {
          const btn = event.target instanceof Element ? event.target.closest('[data-rerun-id]') : null;
          if (!btn) return;
          handlers.onRerunFromHistory(btn.dataset.rerunId);
        });
        view.runHistoryTabs.forEach(tab => {
          tab.addEventListener('click', () => {
            activeRunHistoryTab = tab.dataset.tab || 'stats';
            renderRunHistoryDetail();
          });
        });
        view.runHistoryModeTabs.forEach(tab => {
          tab.addEventListener('click', () => {
            const mode = tab.dataset.mode || 'all';
            runHistoryModeFilter = mode === 'all' ? 'all' : normalizeGameMode(mode);
            runHistoryPage = 0;
            renderRunHistoryPage();
          });
        });
        view.go.addEventListener('click', handlers.onStartNew);
        view.seed.addEventListener('keydown', event => {
          if (event.key === 'Enter') handlers.onStartNew();
        });
        view.continueBtn?.addEventListener('click', handlers.onContinue);
        view.deleteRunBtn?.addEventListener('click', handlers.onDeleteRun);
        view.dialogueOverlay?.addEventListener('click', handlers.onAdvanceDialogue);
        view.tutorialPrevBtn?.addEventListener('click', handlers.onTutorialPrev);
        view.tutorialNextBtn?.addEventListener('click', handlers.onTutorialNext);
        view.tutorialSkipBtn?.addEventListener('click', handlers.onSkipTutorial);
        // New main-menu nav
        view.newRunBtn?.addEventListener('click', handlers.onOpenCharacterSelect);
        view.charBackBtn?.addEventListener('click', handlers.onCloseCharacterSelect);
        // Alt modes panel
        view.altModesBtn?.addEventListener('click', () => setAltModesPanelOpen(true));
        view.altModesClose?.addEventListener('click', () => setAltModesPanelOpen(false));
        view.altModeEndlessBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('endless');
        });
        view.altModePracticeBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('practice');
        });
        view.altModeBossRushBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('boss_rush');
        });
        view.altModeCoopBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('coop');
        });
        view.altModePvpBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('pvp');
        });
        view.mpLobbyBack?.addEventListener('click', () => {
          closeMpLobby();
          setAltModesPanelOpen(true);
        });
        view.mpLobby1Btn?.addEventListener('click', () => {
          mpPlayerCount = 1;
          closeMpLobby();
          charSelectPhase = 'p1';
          setGameState('charselect');
          updateCharacterSelectionUI();
        });
        view.mpLobby2Btn?.addEventListener('click', () => {
          mpPlayerCount = 2;
          closeMpLobby();
          charSelectPhase = 'p1';
          setGameState('charselect');
          updateCharacterSelectionUI();
        });
        document.getElementById('mpLobby3Btn')?.addEventListener('click', () => {
          mpPlayerCount = 3;
          closeMpLobby();
          charSelectPhase = 'p1';
          setGameState('charselect');
          updateCharacterSelectionUI();
        });
        document.getElementById('mpLobby4Btn')?.addEventListener('click', () => {
          mpPlayerCount = 4;
          closeMpLobby();
          charSelectPhase = 'p1';
          setGameState('charselect');
          updateCharacterSelectionUI();
        });
        // Alt modes tabs
        document.querySelectorAll('.altmodes-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            document.querySelectorAll('.altmodes-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.altmodes-tab-panel').forEach(p => p.classList.add('hidden'));
            tab.classList.add('active');
            const panel = document.querySelector(`.altmodes-tab-panel[data-panel="${tab.dataset.tab}"]`);
            if (panel) panel.classList.remove('hidden');
          });
        });
        view.altModeSandboxConfigBtn?.addEventListener('click', handlers.onOpenSandboxConfig);
        view.altModeSandboxBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onStartSandbox();
        });
        // Practice panel toggle
        view.practicePanelToggle?.addEventListener('click', () => {
          view.practicePanelBody?.classList.toggle('hidden');
        });
        view.practiceMaxHpSlider?.addEventListener('input', () => {
          setPracticeMaxHp(view.practiceMaxHpSlider.value);
        });
        view.practiceMaxHpNum?.addEventListener('change', () => {
          setPracticeMaxHp(view.practiceMaxHpNum.value);
        });
        view.practiceClearBtn?.addEventListener('click', () => { enemies.length = 0; });
        view.practiceHealBtn?.addEventListener('click', () => {
          if (!player) return;
          player.hp = player.maxHp;
          updateHud();
        });
        view.practiceGiveItemBtn?.addEventListener('click', () => {
          if (!player) return;
          const key = rollItemDrop({ elite: true, stream: 'loot' });
          if (key) collectItem(key);
        });
        if (view.practiceEnemyGrid) buildPracticeEnemyGrid();
        menuBound = true;
      },
      bindRestartActions(actions) {
        if (restartBound) return;
        const defaultRestart = typeof actions === 'function' ? actions : actions?.onWinRestart;
        view.deadRestart?.addEventListener('click', defaultRestart);
        view.winRestart?.addEventListener('click', defaultRestart);
        view.deadActions?.forEach(button => {
          button.addEventListener('click', () => {
            const action = button.dataset.deadAction || 'retry-current';
            if (typeof actions === 'function') actions();
            else actions?.onDeadAction?.(action);
          });
        });
        restartBound = true;
      },
      playDialogue(lines, options) {
        const started = dialogueRuntime?.start?.(lines, options);
        renderDialogue();
        return !!started;
      },
      advanceDialogue() {
        const advanced = dialogueRuntime?.advance?.();
        renderDialogue();
        return !!advanced;
      },
      isDialogueOpen() {
        return !!dialogueRuntime?.isOpen?.();
      },
      sayAtWorldAnchor(input) {
        const id = worldSpeechRuntime?.say?.(input);
        renderEntityDialogue();
        return id || null;
      },
      setSaveState(text) { view.saveState.textContent = text; },
      setChallengePanelOpen,
      setLegacyPanelOpen,
      setRunHistoryOpen,
      setSandboxPanelOpen,
      setAchievementsPanelOpen,
      setMenuMeta(coins, bestFloor, loopCrystals, saveState) {
        view.bankCoins.textContent = coins;
        view.bestFloor.textContent = bestFloor;
        if (view.loopCount) view.loopCount.textContent = loopCrystals;
        view.saveState.textContent = saveState;
      },
      setRunSummary(summary) {
        const hasRun = !!summary;
        // Main menu: show/hide Continue button
        view.continueBtn?.classList.toggle('hidden', !hasRun);
        view.runSummary.textContent = summary || '';
      },
      setRunHistory(entries) {
        runHistoryEntries = normalizeRunHistory(entries);
        runHistoryPage = 0;
        runHistoryModeFilter = 'all';
        selectedRunHistoryId = runHistoryEntries[0]?.id || '';
        activeRunHistoryTab = 'stats';
        renderRunHistoryPage();
      },
      updateCharacterSelection(unlocked, selected) {
        const CHAR_ORDER = ['princess', 'thorn_knight', 'metao', 'granialla'];
        const CARD_W_ACTIVE = 270;
        const CARD_W_SIDE   = 200;
        const CARD_GAP      = 18;

        view.charButtons.forEach(button => {
          const itemKey = button.dataset.char;
          const hint = button.querySelector('small');
          const spriteCanvas = button.querySelector('[data-char-sprite]');
          const baseHint = hint?.dataset.base || hint?.textContent || '';
          if (hint && !hint.dataset.base) hint.dataset.base = baseHint;
          button.classList.toggle('locked', !unlocked.has(itemKey));
          button.classList.toggle('sel', selected === itemKey);
          button.disabled = !unlocked.has(itemKey);
          if (hint) hint.textContent = unlocked.has(itemKey) ? baseHint : 'locked in bank';
          if (spriteCanvas) {
            drawSpriteToCanvas(spriteCanvas, itemKey, 76, {
              alpha: unlocked.has(itemKey) ? 1 : 0.42,
            });
          }
        });

        // ── Carousel position ────────────────────────────────
        const track = document.getElementById('choose');
        const viewport = track?.parentElement;
        const activeIdx = CHAR_ORDER.indexOf(selected);
        if (track && viewport && activeIdx >= 0) {
          const viewW = viewport.offsetWidth || 440;
          const leftEdge = activeIdx * (CARD_W_SIDE + CARD_GAP);
          const tx = viewW / 2 - leftEdge - CARD_W_ACTIVE / 2;
          track.style.transform = `translateX(${tx}px)`;
        }

        // ── Arrow disabled state ─────────────────────────────
        const carouselPrev = document.getElementById('carouselPrev');
        const carouselNext = document.getElementById('carouselNext');
        const unlockedOrder = CHAR_ORDER.filter(k => unlocked.has(k));
        const currentPos = unlockedOrder.indexOf(selected);
        if (carouselPrev) carouselPrev.disabled = currentPos <= 0;
        if (carouselNext) carouselNext.disabled = currentPos >= unlockedOrder.length - 1;

        // ── Hero detail panel ────────────────────────────────
        const detail = document.getElementById('heroDetail');
        const disp = HERO_DISPLAY[selected];
        if (detail && disp) {
          const statsHtml = disp.stats.map(s =>
            `<div class="char-stat-row"><span class="stat-label">${s.label}</span>` +
            `<div class="stat-bar"><div class="stat-fill" style="width:${s.pct}%;background:${s.color}"></div></div></div>`
          ).join('');
          const defaultMoves = getDefaultMovesForCharacter(selected);
          const kitNames = ['melee', 'laser', 'smash', 'dash']
            .map(slot => MOVE_DEFS[defaultMoves[slot]]?.name || defaultMoves[slot]);
          const skillsHtml = kitNames.map(s =>
            `<span class="hero-detail-skill-pip">${s}</span>`
          ).join('');
          detail.innerHTML =
            `<div class="hero-detail-portrait"><canvas id="heroDetailSprite" width="128" height="128" aria-hidden="true"></canvas></div>` +
            `<p class="hero-detail-lore">${disp.lore}</p>` +
            `<div class="hero-detail-stats"><div class="hero-detail-section-label">Stats</div>${statsHtml}</div>` +
            `<div class="hero-detail-skills"><div class="hero-detail-section-label">Kit</div>${skillsHtml}</div>`;
          drawSpriteToCanvas(document.getElementById('heroDetailSprite'), selected, 104);
        }
      },
      updateDifficultySelection(unlocked, selected, loopCrystals) {
        const selectedDef = getDifficultyDef(selected);
        view.difficultyButtons.forEach(button => {
          const key = button.dataset.difficulty === 'custom' ? 'custom' : normalizeDifficulty(button.dataset.difficulty || '');
          const def = getDifficultyDef(key);
          const isUnlocked = unlocked.has(key);
          button.classList.toggle('sel', selected === key);
          button.classList.toggle('locked', !isUnlocked);
          button.disabled = !isUnlocked;
          button.title = isUnlocked ? def.description : `Unlock at ${def.unlockLoops} loop crystals`;
        });
        if (view.difficultyHint) {
          view.difficultyHint.textContent = selectedDef.unlockLoops > 0 && !unlocked.has(selected)
              ? `Unlocks at ${selectedDef.unlockLoops} loop crystals. Current crystals: ${loopCrystals}`
              : `${selectedDef.description} Loop Crystals: ${loopCrystals}.`;
        }
      },
      updateChallengeSelection(unlocked, owned, selected, loopCrystals, bankCoins) {
        view.challengeButtons.forEach(button => {
          const key = button.dataset.challenge || '';
          const def = CHALLENGE_DEFS[key];
          if (!def) return;
          const isUnlocked = unlocked.has(key);
          const isOwned = owned.has(key);
          const isSelected = selected.includes(key);
          button.classList.toggle('locked', !isUnlocked);
          button.classList.toggle('purchased', isOwned);
          button.classList.toggle('sel', isSelected);
          button.disabled = !isUnlocked;
          button.title = !isUnlocked
            ? `Unlock at ${def.unlockLoops} loop crystals`
            : isOwned
              ? def.description
              : `${def.description} Cost: ${def.cost} loop crystals`;
          const status = !isUnlocked
            ? `LOCKED UNTIL ${def.unlockLoops} LC`
            : isOwned
              ? (isSelected ? 'ACTIVE THIS RUN' : 'OWNED')
              : `BUY ${def.cost} LC`;
          button.innerHTML = `
            <span class="challenge-btn__top">
              <b>${escapeHtml(def.name)}</b>
              <em>${escapeHtml(status)}</em>
            </span>
            <span class="challenge-btn__desc">${escapeHtml(def.description)}</span>
            <span class="challenge-btn__reward">${escapeHtml(def.reward || 'Challenge reward')}</span>
          `;
        });
        if (view.challengeHint) {
          const activeCount = selected.length;
          const bonusCrystals = Math.max(0, Math.round(getActiveChallengeCrystalBonusMultiplier()));
          view.challengeHint.textContent = `Loop Crystals: ${loopCrystals}. Buy run types once, then toggle them. Active: ${activeCount}. Loop bonus: +${bonusCrystals} LC.`;
        }
      },
      updateLegacySelection(owned, loopCrystals) {
        view.legacyButtons.forEach(button => {
          const key = button.dataset.legacy || '';
          const def = LEGACY_UPGRADES[key];
          if (!def) return;
          const isOwned = owned.has(key);
          const canAfford = loopCrystals >= def.cost;
          button.classList.toggle('owned', isOwned);
          button.disabled = isOwned;
          const status = isOwned ? 'UNLOCKED' : canAfford ? `BUY ${def.cost} LC` : `NEED ${def.cost} LC`;
          button.innerHTML = `
            <span class="legacy-btn__top">
              <b>${escapeHtml(def.name)}</b>
              <em>${escapeHtml(status)}</em>
            </span>
            <span class="legacy-btn__desc">${escapeHtml(def.description)}</span>
            <span class="legacy-btn__effect">${escapeHtml(def.effect)}</span>
          `;
        });
        if (view.legacyHint) {
          const ownedCount = LEGACY_ORDER.filter(k => owned.has(k)).length;
          view.legacyHint.textContent = `Loop Crystals: ${loopCrystals}. Unlocked: ${ownedCount} / ${LEGACY_ORDER.length}. Upgrades are permanent and apply to all future runs.`;
        }
      },
      setItemStatus(items) {
        ITEM_KEYS.forEach(key => {
          const count = Number(items[key] || 0);
          view.itemSlots[key]?.classList.toggle('on', count > 0);
          if (view.itemCounts[key]) view.itemCounts[key].textContent = String(count);
        });
      },
      setObjective(text) { view.objective.textContent = text; },
      setTutorialBanner(text, visible) {
        const open = !!visible && !!text && gameState === 'play';
        if (view.tutorialOverlay && tutorialBannerCache.open !== open) {
          view.tutorialOverlay.classList.toggle('hidden', !open);
          view.tutorialOverlay.setAttribute('aria-hidden', open ? 'false' : 'true');
          view.tutorialOverlay.style.display = open ? 'flex' : 'none';
          tutorialBannerCache.open = open;
        }
        if (view.tutorialSpeaker && open && view.tutorialSpeaker.textContent !== 'TUTORIAL') {
          view.tutorialSpeaker.textContent = 'TUTORIAL';
        }
        const nextText = open ? String(text || '') : '';
        if (view.tutorialText && tutorialBannerCache.text !== nextText) {
          view.tutorialText.textContent = nextText;
          tutorialBannerCache.text = nextText;
        }
        const nextHint = open ? 'Use Previous/Next. Press K or click Skip Tutorial' : '';
        if (view.tutorialHint && tutorialBannerCache.hint !== nextHint) {
          view.tutorialHint.textContent = nextHint;
          tutorialBannerCache.hint = nextHint;
        }
        const stepOrder = getTutorialStepOrder();
        const stepIndex = stepOrder.indexOf(tutorialState?.step || 'move');
        const prevDisabled = !open || stepIndex <= 0;
        const nextDisabled = !open || stepIndex < 0 || stepIndex >= (stepOrder.length - 1);
        if (view.tutorialPrevBtn && tutorialBannerCache.prevDisabled !== prevDisabled) {
          view.tutorialPrevBtn.disabled = prevDisabled;
          tutorialBannerCache.prevDisabled = prevDisabled;
        }
        if (view.tutorialNextBtn && tutorialBannerCache.nextDisabled !== nextDisabled) {
          view.tutorialNextBtn.disabled = nextDisabled;
          tutorialBannerCache.nextDisabled = nextDisabled;
        }
      },
      setObjectiveList(roomLabel, entries = []) {
        if (!view.objectiveTracker || !view.objectiveList) return;
        const visible = gameState === 'play' && entries.length > 0;
        objectiveTrackerVisible = visible;
        objectiveEntriesCache = Array.isArray(entries) ? entries.slice() : [];
        view.objectiveTracker.classList.toggle('hidden', !visible);
        view.objectiveTracker.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (view.objectiveRoomLabel) view.objectiveRoomLabel.textContent = String(roomLabel || 'ROOM').toUpperCase();
        view.objectiveList.innerHTML = entries.map(entry => (
          `<li data-state="${escapeHtml(entry.state || 'todo')}">${escapeHtml(entry.text || '')}</li>`
        )).join('');
        syncObjectiveTrackerCompactState();
      },
      setObjectiveLayout,
      setHudValues(payload) {
        view.fl.textContent = payload.floor;
        view.lv.textContent = payload.level;
        view.xp.textContent = payload.xpText;
        if (view.gameTime) view.gameTime.textContent = payload.gameTime;
        if (view.difficultyLabel) view.difficultyLabel.textContent = String(payload.difficultyName || '').toUpperCase();
        else if (view.difficultyDisplay) view.difficultyDisplay.textContent = String(payload.difficultyName || '').toUpperCase();
        if (view.itemRarityCounts && payload.itemRarityCounts) {
          const white = view.itemRarityCounts.querySelector('.rarity-count--white');
          const purple = view.itemRarityCounts.querySelector('.rarity-count--purple');
          const red = view.itemRarityCounts.querySelector('.rarity-count--red');
          if (white) white.textContent = String(payload.itemRarityCounts.white || 0);
          if (purple) purple.textContent = String(payload.itemRarityCounts.purple || 0);
          if (red) red.textContent = String(payload.itemRarityCounts.red || 0);
        }
        view.coins.textContent = payload.coins;
        view.charName.textContent = payload.character;
        view.hpFill.style.width = `${Math.max(0, payload.hp / payload.maxHp) * 100}%`;
        view.hpTxt.textContent = Math.ceil(payload.hp);
        if (view.cdM) view.cdM.textContent = payload.meleeCd.toFixed(1);
        if (view.cdL) view.cdL.textContent = payload.laserCd.toFixed(1);
        if (view.cdS) view.cdS.textContent = payload.smashCd.toFixed(1);
        if (view.cdD) view.cdD.textContent = payload.dashCd.toFixed(1);
        if (payload.skills) {
          const melee = payload.skills.melee;
          const laser = payload.skills.laser;
          const smash = payload.skills.smash;
          const dash = payload.skills.dash;
          if (melee) setSkillCard('melee', melee.current, melee.max, !!melee.active, melee.charges, melee.maxCharges);
          if (laser) setSkillCard('laser', laser.current, laser.max, !!laser.active, laser.charges, laser.maxCharges);
          if (smash) setSkillCard('smash', smash.current, smash.max, !!smash.active, smash.charges, smash.maxCharges);
          if (dash) setSkillCard('dash', dash.current, dash.max, !!dash.active, dash.charges, dash.maxCharges);
        }
      },
      setDeadScreen(entry) {
        const fmt = (n) => String(n ?? '—');
        const fmtTime = (s) => {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return `${m}:${sec.toString().padStart(2, '0')}`;
        };
        if (view.deadKillerCanvas) {
          drawSpriteToCanvas(view.deadKillerCanvas, resolveKillerSprite(entry.killerKey || ''), 120);
        }
        if (view.deadKillerName) view.deadKillerName.textContent = entry.killedBy || 'Unknown';
        if (view.deadFloor) view.deadFloor.textContent = `${fmt(entry.floor)}/10`;
        if (view.deadLevel) view.deadLevel.textContent = fmt(entry.level);
        if (view.deadKills) view.deadKills.textContent = fmt(entry.kills);
        if (view.deadTime) view.deadTime.textContent = fmtTime(entry.elapsedSeconds || 0);
        if (view.deadCoins) view.deadCoins.textContent = fmt(entry.coins);
        if (view.deadDifficulty) view.deadDifficulty.textContent = (entry.difficultyName || entry.difficulty || '—').toUpperCase();
        const reviveButton = view.deadActions?.find(button => button.dataset.deadAction === 'revive');
        if (reviveButton) {
          const cost = getReviveCost();
          const crystals = Number(metaProgress.loopCrystals || 0);
          reviveButton.textContent = `REVIVE ${cost} LC`;
          reviveButton.disabled = crystals < cost;
          reviveButton.title = crystals < cost ? `Need ${cost} Loop Crystal${cost === 1 ? '' : 's'}` : `Spend ${cost} Loop Crystal${cost === 1 ? '' : 's'} to revive`;
        }

        // ── Records row ────────────────────────────────────────────────────
        if (view.deadRecords) {
          const nr = entry._newRecords || {};
          const records = deriveRunRecords(runHistory, metaProgress);
          const bests = [
            { label: 'FLOOR',  val: `${records.floor}/10`,         isNew: nr.floor },
            { label: 'KILLS',  val: fmt(records.kills),            isNew: nr.kills },
            { label: 'LEVEL',  val: fmt(records.level),            isNew: nr.level },
            { label: 'TIME',   val: fmtTime(records.time),         isNew: nr.time  },
            { label: 'COINS',  val: fmt(records.coins),            isNew: nr.coins },
          ];
          view.deadRecords.innerHTML = bests.map(b =>
            `<div class="dead-record${b.isNew ? ' dead-record--new' : ''}">
              <span class="dead-record-label">${b.label}</span>
              <span class="dead-record-val">${b.val}</span>
              ${b.isNew ? '<span class="dead-record-badge">NEW</span>' : ''}
            </div>`
          ).join('');
        }

        // ── Item icon cards with pagination ────────────────────────────────
        if (view.deadItems) {
          const items = Array.isArray(entry.items) ? entry.items : [];
          const PAGE_SIZE = 5;
          let itemPage = 0;
          const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

          const renderItemPage = () => {
            view.deadItems.innerHTML = '';
            if (items.length === 0) {
              view.deadItems.innerHTML = '<span class="dead-items-empty">None</span>';
            } else {
              const slice = items.slice(itemPage * PAGE_SIZE, itemPage * PAGE_SIZE + PAGE_SIZE);
              slice.forEach(item => {
                const itemDef = ITEM_DEFS[item.key] || {};
                const rc = { knight: 'knight', white: 'knight', wizard: 'wizard', purple: 'wizard', god: 'god' }[item.rarity] || 'knight';
                const card = document.createElement('div');
                card.className = `dead-item-card dead-item-card--${rc}`;
                const cnv = document.createElement('canvas');
                cnv.width = 32;
                cnv.height = 32;
                cnv.className = 'dead-item-icon';
                drawItemToastIcon(cnv, { ...itemDef, key: item.key, rarity: item.rarity, color: itemDef.color, accent: itemDef.accent });
                const label = document.createElement('span');
                label.className = 'dead-item-name';
                label.textContent = item.count > 1 ? `${item.name} ×${item.count}` : item.name;
                card.appendChild(cnv);
                card.appendChild(label);
                view.deadItems.appendChild(card);
              });
            }
            if (view.deadItemsPage) view.deadItemsPage.textContent = totalPages > 1 ? `${itemPage + 1}/${totalPages}` : '';
            if (view.deadItemsPrev) view.deadItemsPrev.disabled = itemPage <= 0;
            if (view.deadItemsNext) view.deadItemsNext.disabled = itemPage >= totalPages - 1;
            if (view.deadItemsPrev) view.deadItemsPrev.classList.toggle('hidden', totalPages <= 1);
            if (view.deadItemsNext) view.deadItemsNext.classList.toggle('hidden', totalPages <= 1);
            if (view.deadItemsPage) view.deadItemsPage.classList.toggle('hidden', totalPages <= 1);
          };

          if (view.deadItemsPrev) {
            view.deadItemsPrev.onclick = () => { itemPage = Math.max(0, itemPage - 1); renderItemPage(); };
          }
          if (view.deadItemsNext) {
            view.deadItemsNext.onclick = () => { itemPage = Math.min(totalPages - 1, itemPage + 1); renderItemPage(); };
          }
          renderItemPage();
        }
      },
      setWinInfo(text) { view.winInfo.textContent = text; },
    };
  }

  function createSaveStore() {
    const localPrefix = 'neonyke:';
    const idb = typeof indexedDB !== 'undefined' ? indexedDB : null;
    let dbPromise = null;
    const SaveApiCtor = KozSaveApi.SaveAPI || null;
    const createLocalStorageDriver = KozStorageDrivers.createLocalStorageDriver || null;

    function createFallbackApi(key) {
      if (!SaveApiCtor || !createLocalStorageDriver) return null;
      try {
        return new SaveApiCtor({
          driver: createLocalStorageDriver(localStorage),
          key: localPrefix + key,
        });
      } catch (error) {
        return null;
      }
    }

    function openDb() {
      if (!idb) return Promise.reject(new Error('IndexedDB unavailable'));
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = idb.open('NeoNykeDB', 2);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('saves')) {
            request.result.createObjectStore('saves');
          }
          if (!request.result.objectStoreNames.contains('achievements')) {
            request.result.createObjectStore('achievements', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return dbPromise;
    }

    async function idbGet(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readonly');
        const store = tx.objectStore('saves');
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    }

    async function idbPut(key, value) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    async function idbDelete(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    const fallback = {
      async get(key) {
        const api = createFallbackApi(key);
        if (api) return api.load();
        const raw = localStorage.getItem(localPrefix + key);
        return raw ? JSON.parse(raw) : null;
      },
      async put(key, value) {
        const api = createFallbackApi(key);
        if (api) {
          api.save(value);
          return;
        }
        localStorage.setItem(localPrefix + key, JSON.stringify(value));
      },
      async delete(key) {
        const api = createFallbackApi(key);
        if (api) {
          api.delete();
          return;
        }
        localStorage.removeItem(localPrefix + key);
      },
    };

    return {
      kind: idb ? 'IDB READY' : 'LOCAL ONLY',
      async get(key) {
        if (!idb) return fallback.get(key);
        try {
          return await idbGet(key);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.get(key);
        }
      },
      async put(key, value) {
        if (!idb) return fallback.put(key, value);
        try {
          return await idbPut(key, value);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.put(key, value);
        }
      },
      async delete(key) {
        if (!idb) return fallback.delete(key);
        try {
          return await idbDelete(key);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.delete(key);
        }
      },
    };
  }

  function makeRNG(seed) {
    return mulberry32(xmur3(seed)());
  }

  function buildWeightTable(entries) {
    let total = 0;
    const cumulative = entries.map(([key, weight]) => {
      total += Math.max(0, Number(weight) || 0);
      return [key, total];
    });
    return { total, cumulative };
  }

  function rollFromWeightTable(table, stream = 'loot', random = null) {
    if (!table || table.total <= 0 || !table.cumulative.length) return 'neo_knife';
    const roll = (typeof random === 'function' ? random() : nextRandom(stream)) * table.total;
    let lo = 0;
    let hi = table.cumulative.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (roll < table.cumulative[mid][1]) hi = mid;
      else lo = mid + 1;
    }
    return table.cumulative[lo]?.[0] || 'neo_knife';
  }

  function mulberry32(a) {
    return function nextRandom() {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function xmur3(seed) {
    let h = 1779033703 ^ seed.length;
    for (let index = 0; index < seed.length; index += 1) {
      h = Math.imul(h ^ seed.charCodeAt(index), 3432918353);
      h = h << 13 | h >>> 19;
    }
    return function seedFn() {
      h = Math.imul(h ^ h >>> 16, 2246822507);
      h = Math.imul(h ^ h >>> 13, 3266489909);
      return (h ^ h >>> 16) >>> 0;
    };
  }

  function rand(max = 1, min = 0, stream = 'encounter') {
    return min + (max - min) * nextRandom(stream);
  }

  function irand(min, max, stream = 'encounter') {
    return Math.floor(rand(max + 1, min, stream));
  }

  function shuffle(array, stream = 'encounter') {
    const copy = [...array];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(nextRandom(stream) * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function shuffleWithRandom(array, random) {
    const copy = [...array];
    const next = typeof random === 'function' ? random : () => nextRandom('encounter');
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(next() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const testX = clamp(cx, rx, rx + rw);
    const testY = clamp(cy, ry, ry + rh);
    const dx = cx - testX;
    const dy = cy - testY;
    return dx * dx + dy * dy < r * r;
  }

  function getDestructibleRect(prop) {
    const w = Number.isFinite(prop?.w) && prop.w > 0 ? prop.w : (prop?.r || 0) * 2;
    const h = Number.isFinite(prop?.h) && prop.h > 0 ? prop.h : (prop?.r || 0) * 2;
    return {
      x: prop.x - w / 2,
      y: prop.y - h / 2,
      w,
      h,
    };
  }

  function destructibleIntersectsCircle(prop, x, y, r) {
    const rect = getDestructibleRect(prop);
    return circleRect(x, y, r, rect.x, rect.y, rect.w, rect.h);
  }

  function isBlocked(x, y, r) {
    if (walls.some(wall => circleRect(x, y, r, wall.x, wall.y, wall.w, wall.h))) return true;
    if (structures.some(structure => circleRect(x, y, r, structure.x - structure.w / 2, structure.y - structure.h / 2, structure.w, structure.h))) return true;
    return destructibles.some(prop => !prop.broken && !prop.hidden && destructibleIntersectsCircle(prop, x, y, r));
  }

  function beamHitsCircle(x1, y1, x2, y2, cx, cy, radius) {
    const lineLengthSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (lineLengthSq === 0) return false;
    let t = ((cx - x1) * (x2 - x1) + (cy - y1) * (y2 - y1)) / lineLengthSq;
    t = clamp(t, 0, 1);
    const px = x1 + t * (x2 - x1);
    const py = y1 + t * (y2 - y1);
    return dist(px, py, cx, cy) <= radius;
  }

  function getPlayerBeamRange(mode = laserMode, moveKey = getEquippedMove('laser')) {
    if (mode === 'god_sweep') return 560;
    if (mode === 'turtle_wave') return 620;
    if (moveKey === 'love_beam') return 500;
    return ATTACKS.laser.range;
  }

  function getPlayerBeamBounceCount(mode = laserMode) {
    return mode === 'beam' ? PLAYER_BEAM_BOUNCES : HEAVY_BEAM_BOUNCES;
  }

  function getEnemyBeamBounceCount(enemy) {
    if (!enemy) return ENEMY_BEAM_BOUNCES;
    return enemy.type === 'god' ? HEAVY_BEAM_BOUNCES : ENEMY_BEAM_BOUNCES;
  }

  function getBeamReflectRects() {
    const rects = walls.slice();
    structures.forEach(structure => {
      if (!structure || !Number.isFinite(structure.x) || !Number.isFinite(structure.y)) return;
      if (!Number.isFinite(structure.w) || !Number.isFinite(structure.h) || structure.w <= 0 || structure.h <= 0) return;
      rects.push({
        x: structure.x - structure.w / 2,
        y: structure.y - structure.h / 2,
        w: structure.w,
        h: structure.h,
      });
    });
    destructibles.forEach(prop => {
      if (!prop || prop.broken || prop.hidden || prop.kind !== 'cover_wall') return;
      const rect = getDestructibleRect(prop);
      if (rect.w > 0 && rect.h > 0) rects.push(rect);
    });
    return rects;
  }

  function rayRectHit(originX, originY, dirX, dirY, rect, maxDistance) {
    const minX = rect.x;
    const maxX = rect.x + rect.w;
    const minY = rect.y;
    const maxY = rect.y + rect.h;
    let nearTime = -Infinity;
    let farTime = Infinity;
    let nearNormalX = 0;
    let nearNormalY = 0;
    let farNormalX = 0;
    let farNormalY = 0;

    if (Math.abs(dirX) < BEAM_RICOCHET_EPSILON) {
      if (originX < minX || originX > maxX) return null;
    } else {
      let t1 = (minX - originX) / dirX;
      let t2 = (maxX - originX) / dirX;
      let n1x = dirX > 0 ? -1 : 1;
      let n2x = -n1x;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
        [n1x, n2x] = [n2x, n1x];
      }
      if (t1 > nearTime) {
        nearTime = t1;
        nearNormalX = n1x;
        nearNormalY = 0;
      }
      if (t2 < farTime) {
        farTime = t2;
        farNormalX = n2x;
        farNormalY = 0;
      }
    }

    if (Math.abs(dirY) < BEAM_RICOCHET_EPSILON) {
      if (originY < minY || originY > maxY) return null;
    } else {
      let t1 = (minY - originY) / dirY;
      let t2 = (maxY - originY) / dirY;
      let n1y = dirY > 0 ? -1 : 1;
      let n2y = -n1y;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
        [n1y, n2y] = [n2y, n1y];
      }
      if (t1 > nearTime) {
        nearTime = t1;
        nearNormalX = 0;
        nearNormalY = n1y;
      }
      if (t2 < farTime) {
        farTime = t2;
        farNormalX = 0;
        farNormalY = n2y;
      }
    }

    if (nearTime > farTime || farTime < BEAM_RICOCHET_EPSILON) return null;
    let distance = nearTime;
    let normalX = nearNormalX;
    let normalY = nearNormalY;
    if (distance < BEAM_RICOCHET_EPSILON) {
      distance = farTime;
      normalX = farNormalX;
      normalY = farNormalY;
    }
    if (distance < BEAM_RICOCHET_EPSILON || distance > maxDistance) return null;
    return {
      distance,
      x: originX + dirX * distance,
      y: originY + dirY * distance,
      normalX,
      normalY,
    };
  }

  function findBeamRicochetHit(originX, originY, dirX, dirY, maxDistance, rects) {
    let closest = null;
    rects.forEach(rect => {
      const hit = rayRectHit(originX, originY, dirX, dirY, rect, maxDistance);
      if (!hit) return;
      if (!closest || hit.distance < closest.distance) closest = hit;
    });
    return closest;
  }

  function buildRicochetBeamPath(originX, originY, angle, range, maxBounces = 0) {
    const path = [];
    let remaining = Math.max(0, Number(range || 0));
    let startX = originX;
    let startY = originY;
    let currentAngle = Number.isFinite(angle) ? angle : 0;
    const bounceLimit = Math.max(0, Math.floor(Number(maxBounces || 0)));
    const rects = getBeamReflectRects();

    for (let bounce = 0; remaining > BEAM_RICOCHET_NUDGE; bounce += 1) {
      const dirX = Math.cos(currentAngle);
      const dirY = Math.sin(currentAngle);
      const hit = findBeamRicochetHit(startX, startY, dirX, dirY, remaining, rects);
      if (!hit) {
        const endX = startX + dirX * remaining;
        const endY = startY + dirY * remaining;
        path.push({ x1: startX, y1: startY, x2: endX, y2: endY, angle: currentAngle, length: remaining, hitWall: false });
        break;
      }

      const segmentLength = Math.max(0, hit.distance);
      if (segmentLength > BEAM_RICOCHET_EPSILON) {
        path.push({ x1: startX, y1: startY, x2: hit.x, y2: hit.y, angle: currentAngle, length: segmentLength, hitWall: true });
      }
      if (bounce >= bounceLimit) break;

      remaining = Math.max(0, remaining - segmentLength - BEAM_RICOCHET_NUDGE);
      const dot = dirX * hit.normalX + dirY * hit.normalY;
      const reflectX = dirX - 2 * dot * hit.normalX;
      const reflectY = dirY - 2 * dot * hit.normalY;
      currentAngle = Math.atan2(reflectY, reflectX);
      startX = hit.x + reflectX * BEAM_RICOCHET_NUDGE;
      startY = hit.y + reflectY * BEAM_RICOCHET_NUDGE;
    }

    return path;
  }

  function beamPathHitsCircle(path, cx, cy, radius) {
    for (let index = 0; index < path.length; index += 1) {
      const segment = path[index];
      if (beamHitsCircle(segment.x1, segment.y1, segment.x2, segment.y2, cx, cy, radius)) return segment;
    }
    return null;
  }

  function beamPathHitsDestructible(path, prop, padding = 0) {
    const rect = getDestructibleRect(prop);
    for (let index = 0; index < path.length; index += 1) {
      const segment = path[index];
      if (lineIntersectsRect(segment.x1, segment.y1, segment.x2, segment.y2, rect, padding)) return segment;
    }
    return null;
  }

  function getBeamPathLength(path) {
    return path.reduce((sum, segment) => sum + (segment.length || Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1)), 0);
  }

  function getBeamPathEnd(path) {
    const last = path[path.length - 1];
    return last ? { x: last.x2, y: last.y2 } : { x: 0, y: 0 };
  }

  function sampleBeamPath(path, amount) {
    const totalLength = getBeamPathLength(path);
    if (!totalLength) return null;
    let targetDistance = clamp(Number(amount || 0), 0, 1) * totalLength;
    let traversed = 0;
    for (let index = 0; index < path.length; index += 1) {
      const segment = path[index];
      const dx = segment.x2 - segment.x1;
      const dy = segment.y2 - segment.y1;
      const length = segment.length || Math.hypot(dx, dy);
      if (!length) continue;
      if (targetDistance <= length || index === path.length - 1) {
        const localT = clamp(targetDistance / length, 0, 1);
        const dirX = dx / length;
        const dirY = dy / length;
        return {
          x: segment.x1 + dx * localT,
          y: segment.y1 + dy * localT,
          dx: dirX,
          dy: dirY,
          nx: -dirY,
          ny: dirX,
          t: clamp((traversed + length * localT) / totalLength, 0, 1),
          angle: segment.angle,
        };
      }
      targetDistance -= length;
      traversed += length;
    }
    return null;
  }

  function drawTaperedBeamPath(path, options = {}) {
    const totalLength = getBeamPathLength(path);
    if (!totalLength) return;
    const color = options.color || '#ff00aa';
    const glow = options.glow || color;
    const maxWidth = Number(options.maxWidth || 8);
    let traversed = 0;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = glow;
    ctx.shadowBlur = Number(options.shadowBlur || 18);
    path.forEach(segment => {
      const dx = segment.x2 - segment.x1;
      const dy = segment.y2 - segment.y1;
      const length = segment.length || Math.hypot(dx, dy);
      if (!length) return;
      const dirX = dx / length;
      const dirY = dy / length;
      const normalX = -dirY;
      const normalY = dirX;
      const subSegments = Math.max(2, Math.ceil(length / 32));
      for (let index = 0; index < subSegments; index += 1) {
        const t0 = index / subSegments;
        const t1 = (index + 1) / subSegments;
        const globalT0 = (traversed + length * t0) / totalLength;
        const globalT1 = (traversed + length * t1) / totalLength;
        const taper0 = 1 - globalT0 * globalT0;
        const taper1 = 1 - globalT1 * globalT1;
        const w0 = maxWidth * taper0 * 0.5;
        const w1 = maxWidth * taper1 * 0.5;
        const x0 = segment.x1 + dx * t0;
        const y0 = segment.y1 + dy * t0;
        const x1 = segment.x1 + dx * t1;
        const y1 = segment.y1 + dy * t1;
        ctx.beginPath();
        ctx.moveTo(x0 + normalX * w0, y0 + normalY * w0);
        ctx.lineTo(x1 + normalX * w1, y1 + normalY * w1);
        ctx.lineTo(x1 - normalX * w1, y1 - normalY * w1);
        ctx.lineTo(x0 - normalX * w0, y0 - normalY * w0);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
      traversed += length;
    });

    ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1.5, maxWidth * 0.22);
    ctx.lineCap = 'round';
    path.forEach(segment => {
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function strokeBeamPath(path, options = {}) {
    if (!path.length) return;
    const color = options.color || '#aa66ff';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Number(options.width || 7);
    ctx.shadowColor = color;
    ctx.shadowBlur = Number(options.shadowBlur || 14);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path.forEach(segment => {
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function getBeamEnd(x, y, angle, range) {
    return {
      x: x + Math.cos(angle) * range,
      y: y + Math.sin(angle) * range,
    };
  }

  // Expose touch-accessible APIs for mobile hamburger menu
  window._neoGame = { pauseGame, resumeGame, toggleInventoryPanel };
