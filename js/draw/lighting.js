// lighting.js — Light source collection and beam carving.
export function carveBeamLight(path, maxWidth, strength = 0.5) {
    if (!Array.isArray(path) || path.length < 2) return;
    Neo.ctx.save();
    Neo.ctx.globalAlpha = Neo.clamp(strength, 0, 1);
    Neo.ctx.strokeStyle = '#000';
    Neo.ctx.lineCap = 'round';
    Neo.ctx.lineJoin = 'round';
    Neo.ctx.shadowColor = '#000';
    Neo.ctx.shadowBlur = Math.max(8, maxWidth * 1.8);
    for (let index = 0; index < path.length - 1; index += 1) {
      const start = path[index];
      const end = path[index + 1];
      Neo.ctx.lineWidth = maxWidth;
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(start.x, start.y);
      Neo.ctx.lineTo(end.x, end.y);
      Neo.ctx.stroke();
    }
    Neo.ctx.restore();
  }

export function pushLightSource(target, x, y, inner, outer, strength, tint = '') {
    if (target.length >= Neo.LIGHTING_CONFIG.maxLights) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(outer) || outer <= 0) return;
    if (x + outer < 0 || x - outer > Neo.ROOM_W || y + outer < 0 || y - outer > Neo.ROOM_H) return;

    const cleanOuter = Neo.clamp(outer, 8, Neo.LIGHTING_CONFIG.maxOuterRadius);
    const cleanInner = Neo.clamp(Number.isFinite(inner) ? inner : 0, 0, cleanOuter * 0.72);
    const cleanStrength = Neo.clamp(Number.isFinite(strength) ? strength : 0.5, 0, 1.1);
    target.push({ x, y, inner: cleanInner, outer: cleanOuter, strength: cleanStrength, tint });
  }

export function collectRoomLightSources(room) {
    const lights = [];
    const activeChamber = Neo.getActiveRoomChamber(room, Neo.player);
    pushLightSource(
      lights,
      Neo.ROOM_W / 2,
      Neo.ROOM_H / 2,
      Neo.LIGHTING_CONFIG.ambient.inner,
      Math.max(Neo.ROOM_W, Neo.ROOM_H) * Neo.LIGHTING_CONFIG.ambient.outerScale,
      room?.type === 'boss' ? Neo.LIGHTING_CONFIG.ambient.bossStrength : Neo.LIGHTING_CONFIG.ambient.strength,
      Neo.LIGHTING_CONFIG.ambient.tint
    );
    if (activeChamber && Array.isArray(room?.layoutChambers) && room.layoutChambers.length > 1) {
      pushLightSource(lights, activeChamber.x, activeChamber.y, 36, Math.max(activeChamber.w, activeChamber.h) * 0.58, 0.22, 'rgba(120, 160, 255, 0.05)');
    }

    pushLightSource(
      lights,
      Neo.player.x,
      Neo.player.y - 8,
      Neo.LIGHTING_CONFIG.player.inner,
      Neo.LIGHTING_CONFIG.player.outer,
      Neo.LIGHTING_CONFIG.player.strength,
      Neo.LIGHTING_CONFIG.player.tint
    );

    Neo.decorations.forEach(decor => {
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

    Neo.hazards.forEach(hazard => {
      if (!hazard) return;
      if (hazard.kind === 'lava') {
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * 0.25, hazard.r * 2.7, 0.95, 'rgba(255, 92, 44, 0.12)');
      } else if (hazard.kind === 'fire_circle') {
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * 0.35, hazard.r * 1.75, 0.72, 'rgba(255, 120, 54, 0.08)');
      } else if (hazard.kind === 'lightning_column') {
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * 0.22, hazard.r * 1.8, 0.82, 'rgba(124, 200, 255, 0.09)');
      } else if (hazard.kind === 'explosive_trap') {
        if (hazard.triggered) {
          const fuseRatio = Neo.clamp(1 - (hazard.fuse || 0) / (hazard.fuseDuration || 0.78), 0, 1);
          const intensity = 0.12 + fuseRatio * 0.22;
          const radius = hazard.blastRadius * (0.55 + fuseRatio * 0.35);
          pushLightSource(lights, hazard.x, hazard.y, (hazard.r || 14) * 0.6, radius, intensity, 'rgba(255, 90, 30, 0.14)');
        } else {
          pushLightSource(lights, hazard.x, hazard.y, (hazard.r || 14) * 0.3, (hazard.r || 14) * 2.2, 0.18, 'rgba(255, 180, 60, 0.04)');
        }
      }
    });

    Neo.projectiles.forEach(projectile => {
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

  // Expose on Neo
  Neo.carveBeamLight = carveBeamLight;
  Neo.pushLightSource = pushLightSource;
  Neo.collectRoomLightSources = collectRoomLightSources;
