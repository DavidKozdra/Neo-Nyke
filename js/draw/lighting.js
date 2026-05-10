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

