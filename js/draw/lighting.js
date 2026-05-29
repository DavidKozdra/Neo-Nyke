// lighting.js — Light source collection and beam carving.
export function carveBeamLight(path, maxWidth, strength = 0.5) {
    if (!Array.isArray(path) || path.length < 2) return;
    const ctx = Neo.ctx;
    const clamped = Neo.clamp(strength, 0, 1);
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let index = 1; index < path.length; index += 1) {
      ctx.lineTo(path[index].x, path[index].y);
    }
    // Soft halo: wide, faint stroke approximates shadowBlur falloff at a fraction of the cost.
    ctx.globalAlpha = clamped * 0.35;
    ctx.lineWidth = maxWidth * 2.2;
    ctx.stroke();
    // Bright core: narrow, opaque stroke for the carved-out beam itself.
    ctx.globalAlpha = clamped;
    ctx.lineWidth = maxWidth;
    ctx.stroke();
    ctx.restore();
  }

export function pushLightSource(target, x, y, inner, outer, strength, tint = '', essential = false) {
    const cfg = Neo.LIGHTING_CONFIG;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(outer) || outer <= 0) return;
    if (x + outer < 0 || x - outer > Neo.ROOM_W || y + outer < 0 || y - outer > Neo.ROOM_H) return;

    const cleanOuter = Neo.clamp(outer, cfg.minOuter, cfg.maxOuterRadius);
    const cleanInner = Neo.clamp(Number.isFinite(inner) ? inner : 0, 0, cleanOuter * cfg.innerToOuterCap);
    const cleanStrength = Neo.clamp(Number.isFinite(strength) ? strength : 0.5, 0, 1.1);
    target.push({ x, y, inner: cleanInner, outer: cleanOuter, strength: cleanStrength, tint, essential });
  }

// Keep only the cap-budgeted lights: all `essential` ones plus the highest-scoring optional ones,
// where score = strength * outer (rough "visible influence" proxy).
export function pruneLightsToCap(lights) {
    const cap = Neo.LIGHTING_CONFIG.maxLights;
    if (lights.length <= cap) return lights;
    const essential = [];
    const optional = [];
    for (let i = 0; i < lights.length; i += 1) {
      (lights[i].essential ? essential : optional).push(lights[i]);
    }
    const slots = Math.max(0, cap - essential.length);
    if (optional.length > slots) {
      optional.sort((a, b) => (b.strength * b.outer) - (a.strength * a.outer));
      optional.length = slots;
    }
    return essential.concat(optional);
  }

export function collectRoomLightSources(room) {
    const cfg = Neo.LIGHTING_CONFIG;
    const lights = [];
    const activeChamber = Neo.getActiveRoomChamber(room, Neo.player);
    pushLightSource(
      lights,
      Neo.ROOM_W / 2,
      Neo.ROOM_H / 2,
      cfg.ambient.inner,
      Math.max(Neo.ROOM_W, Neo.ROOM_H) * cfg.ambient.outerScale,
      cfg.ambient.strength,
      cfg.ambient.tint,
      true
    );
    if (activeChamber && Array.isArray(room?.layoutChambers) && room.layoutChambers.length > 1) {
      pushLightSource(
        lights,
        activeChamber.x,
        activeChamber.y,
        cfg.chamber.inner,
        Math.max(activeChamber.w, activeChamber.h) * cfg.chamber.outerScale,
        cfg.chamber.strength,
        cfg.chamber.tint,
        true
      );
    }

    pushLightSource(
      lights,
      Neo.player.x,
      Neo.player.y - 8,
      cfg.player.inner,
      cfg.player.outer,
      cfg.player.strength,
      cfg.player.tint,
      true
    );

    const flickerCfg = cfg.flicker;
    const now = Date.now();
    Neo.decorations.forEach(decor => {
      if (!decor) return;
      const flameT = now * flickerCfg.timeScale + decor.x * flickerCfg.xPhase + decor.y * flickerCfg.yPhase;
      const flicker = 1 + Math.sin(flameT) * flickerCfg.primaryAmp + Math.cos(flameT * flickerCfg.secondaryFreq) * flickerCfg.secondaryAmp;
      if (decor.kind === 'brazier') {
        const b = cfg.brazier;
        pushLightSource(lights, decor.x, decor.y + b.yOffset, b.inner, decor.r * b.outerScale * flicker, b.strength, b.tint);
      } else if (decor.kind === 'torch') {
        const t = cfg.torch;
        pushLightSource(lights, decor.x, decor.y + t.yOffset, t.inner, t.outer * flicker, t.strength, t.tint);
        pushLightSource(lights, decor.x, decor.y + t.spillYOffset, t.spillInner, t.spillOuter * flicker, t.spillStrength, t.spillTint);
      }
    });

    const haz = cfg.hazard;
    Neo.hazards.forEach(hazard => {
      if (!hazard) return;
      if (hazard.kind === 'lava') {
        const h = haz.lava;
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * h.innerScale, hazard.r * h.outerScale, h.strength, h.tint);
      } else if (hazard.kind === 'fire_circle') {
        const h = haz.fireCircle;
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * h.innerScale, hazard.r * h.outerScale, h.strength, h.tint);
      } else if (hazard.kind === 'lightning_column') {
        const h = haz.lightningColumn;
        pushLightSource(lights, hazard.x, hazard.y, hazard.r * h.innerScale, hazard.r * h.outerScale, h.strength, h.tint);
      } else if (hazard.kind === 'explosive_trap') {
        if (hazard.triggered) {
          const h = haz.explosiveTrapTriggered;
          const fuseRatio = Neo.clamp(1 - (hazard.fuse || 0) / (hazard.fuseDuration || haz.explosiveTrapFuseDefault), 0, 1);
          const intensity = h.minStrength + fuseRatio * h.strengthBoost;
          const radius = hazard.blastRadius * (h.minRadiusScale + fuseRatio * h.radiusBoost);
          pushLightSource(lights, hazard.x, hazard.y, (hazard.r || haz.explosiveTrapIdle.defaultR) * h.innerScale, radius, intensity, h.tint);
        } else {
          const h = haz.explosiveTrapIdle;
          const r = hazard.r || h.defaultR;
          pushLightSource(lights, hazard.x, hazard.y, r * h.innerScale, r * h.outerScale, h.strength, h.tint);
        }
      }
    });

    const proj = cfg.projectiles;
    Neo.projectiles.forEach(projectile => {
      if (!projectile || !Number.isFinite(projectile.x) || !Number.isFinite(projectile.y)) return;
      const kind = projectile.kind || '';
      let p = null;
      if (kind === 'fireball') p = proj.fireball;
      else if (kind === 'disk' || kind === 'cult_missile') p = proj.disk;
      else if (kind === 'sniper_round' || kind === 'machine_round' || kind === 'magenta_degale') p = proj.bullet;
      if (p) pushLightSource(lights, projectile.x, projectile.y, projectile.r * p.innerScale, p.outer, p.strength, p.tint);
    });

    return pruneLightsToCap(lights);
  }

  // Expose on Neo
  Neo.carveBeamLight = carveBeamLight;
  Neo.pushLightSource = pushLightSource;
  Neo.pruneLightsToCap = pruneLightsToCap;
  Neo.collectRoomLightSources = collectRoomLightSources;
