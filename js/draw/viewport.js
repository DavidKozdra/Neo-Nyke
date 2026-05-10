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

