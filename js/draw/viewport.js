// viewport.js — Viewport rendering, lighting compositing.
export function drawWorldViewport(cam, vpX, vpW, vpH, vpY, pLabel, slot = null) {
    const isDying = Neo.gameState === 'dying';
    const slotDead = !!slot?.getDead?.();
    const _shakeOn = window.NeoSettings?.getAccess()?.screenShake !== false;
    // Random jitter (magnitude from the trauma² curve) + a directional kick that
    // shoves the camera away from the impact source, then springs back.
    const sX = _shakeOn && pLabel === 'P1' ? (Neo.nextRandom('fx') - 0.5) * Neo.shake * 2 + (Neo.shakeKickX || 0) : 0;
    const sY = _shakeOn && pLabel === 'P1' ? (Neo.nextRandom('fx') - 0.5) * Neo.shake * 2 + (Neo.shakeKickY || 0) : 0;
    Neo.ctx.save();
    Neo.ctx.beginPath();
    Neo.ctx.rect(vpX, vpY, vpW, vpH);
    Neo.ctx.clip();
    Neo.ctx.translate(vpX - cam.x + sX, vpY - cam.y + sY);
    Neo.drawFloor();
    Neo.drawRoomDecor();
    Neo.drawWorldProps();
    Neo.drawChallengeObelisk();
    Neo.drawDeadBodies();
    let sectionPerfStart = Neo.perfStart();
    Neo.drawChests();
    Neo.drawPickups();
    Neo.perfEnd('draw.items', sectionPerfStart);
    sectionPerfStart = Neo.perfStart();
    Neo.drawProjectiles({
      left: cam.x,
      right: cam.x + vpW,
      top: cam.y,
      bottom: cam.y + vpH,
    });
    Neo.perfEnd('draw.projectiles', sectionPerfStart);
    Neo.drawEnemyTelegraphs();
    sectionPerfStart = Neo.perfStart();
    Neo.drawEnemies({
      left: cam.x,
      right: cam.x + vpW,
      top: cam.y,
      bottom: cam.y + vpH,
    });
    Neo.perfEnd('draw.entities', sectionPerfStart);
    drawRoomCeilingMask();
    if (!isDying) {
      if (Neo.isMultiplayerMode()) {
        Neo.getActivePlayerSlots().forEach(drawSlot => {
          if (drawSlot.getDead()) return;
          if (drawSlot.id === 1) Neo.drawPlayer();
          else Neo.drawPlayerSlot(drawSlot);
        });
      } else {
        Neo.drawPlayer();
      }
    }
    // Depth sorting: redraw tall columns the player is standing behind, so they
    // occlude the player. Columns the player is in front of were already drawn
    // in drawRoomDecor (before the player).
    Neo.drawStructuresOverPlayer?.();
    if (!isDying) Neo.drawPlayerLaser();
    Neo.drawJusticeBlades?.();
    Neo.drawSkySwords?.();
    if (!isDying) Neo.drawHealingZoneChargeBar?.();
    if (!isDying) Neo.drawDeathBallChargeBar?.();
    if (!isDying) Neo.drawNimrodStompChargeBar?.();
    if (!isDying) Neo.drawLoveBombChargeBar?.();
    if (isDying && Neo.playerDeathAnim) Neo.drawPlayerCorpseAnim(Neo.playerDeathAnim);
    sectionPerfStart = Neo.perfStart();
    Neo.drawParticles();
    Neo.perfEnd('draw.particles', sectionPerfStart);
    sectionPerfStart = Neo.perfStart();
    if (!isDying) Neo.drawLadderPrompt();
    if (!isDying) Neo.drawJesterPortalPrompt();
    Neo.perfEnd('draw.prompts', sectionPerfStart);
    // P-label in corner of each viewport (split only)
    if (Neo.isSplitScreen() && pLabel) {
      const slot = Neo.getActivePlayerSlots().find(candidate => candidate.label === pLabel);
      Neo.ctx.save();
      Neo.ctx.setTransform(1, 0, 0, 1, 0, 0);
      Neo.ctx.font = 'bold 11px monospace';
      Neo.ctx.textAlign = 'left';
      Neo.ctx.fillStyle = slot?.color || '#fff';
      Neo.ctx.fillText(pLabel, vpX + 8, vpY + 18);
      Neo.ctx.restore();
    }
    if (slotDead && pLabel) {
      Neo.ctx.save();
      Neo.ctx.setTransform(1, 0, 0, 1, 0, 0);
      Neo.ctx.fillStyle = 'rgba(0,0,0,.52)';
      Neo.ctx.fillRect(vpX, vpY, vpW, vpH);
      Neo.ctx.fillStyle = slot?.color || '#dfeeff';
      Neo.ctx.font = 'bold 24px monospace';
      Neo.ctx.textAlign = 'center';
      Neo.ctx.textBaseline = 'middle';
      Neo.ctx.fillText(`${pLabel} DOWN`, vpX + vpW / 2, vpY + vpH / 2);
      Neo.ctx.restore();
    }
    Neo.ctx.restore();
  }

export function getActiveRoomChamber(room, entity = Neo.player) {
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

export function withRoundedClipRect(rect, radius, drawFn) {
    if (!rect || typeof drawFn !== 'function') return;
    Neo.ctx.save();
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    Neo.ctx.clip();
    drawFn();
    Neo.ctx.restore();
  }

export function getRoomDarkness(room, lights) {
    const dark = Neo.LIGHTING_CONFIG.darkness;
    const baseDarkness = room?.type === 'challenge' ? dark.challenge : dark.combat;
    const lightPressure = Math.min(1.2, lights.reduce((sum, light) => sum + light.strength, 0) / dark.pressureDivisor);
    return Math.max(0, baseDarkness - lightPressure * dark.lightRelief);
  }

export function createRoomDarknessGradient(alpha) {
    const darkness = Neo.ctx.createLinearGradient(0, 0, 0, Neo.ROOM_H);
    darkness.addColorStop(0, `rgba(10,14,22,${Math.min(0.28, alpha + 0.035)})`);
    darkness.addColorStop(0.5, `rgba(5,7,12,${alpha})`);
    darkness.addColorStop(1, `rgba(8,11,18,${Math.min(0.32, alpha + 0.05)})`);
    return darkness;
  }

export function carveSoftLight(x, y, innerRadius, outerRadius, strength = 1, clipRect = null) {
    const drawLight = () => {
      const gradient = Neo.ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
      gradient.addColorStop(0, 'rgba(0,0,0,1)');
      gradient.addColorStop(0.26, 'rgba(0,0,0,0.72)');
      gradient.addColorStop(0.66, 'rgba(0,0,0,0.22)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      Neo.ctx.globalAlpha = Neo.clamp(strength, 0, 1.12);
      Neo.ctx.fillStyle = gradient;
      Neo.ctx.fillRect(x - outerRadius, y - outerRadius, outerRadius * 2, outerRadius * 2);
    };

    if (clipRect) {
      withRoundedClipRect(clipRect, 32, drawLight);
      return;
    }
    drawLight();
  }

export function carvePlayerBeamLights() {
    const beam = Neo.LIGHTING_CONFIG.beam;
    if (Neo.laserActive) {
      const angle = Neo.laserAngle;
      const beamPath = Neo.buildRicochetBeamPath(Neo.player.x, Neo.player.y, angle, Neo.getPlayerBeamRange(Neo.laserMode, Neo.getEquippedMove('laser')), Neo.getPlayerBeamBounceCount(Neo.laserMode));
      const width = Neo.laserMode === 'god_sweep' ? beam.laserGodWidth : Neo.laserMode === 'turtle_wave' ? beam.laserTurtleWidth : beam.laserDefaultWidth;
      const strength = Neo.laserMode === 'god_sweep' ? beam.laserGodStrength : beam.laserDefaultStrength;
      Neo.carveBeamLight(beamPath, width, strength);
      return;
    }

    if (Neo.getEquippedWeapon() !== 'lazer_glasses' || Neo.player.weaponBeamTime <= 0) return;
    const baseAngle = Neo.angleToMouse();
    for (let beamIndex = 0; beamIndex < 2; beamIndex += 1) {
      const offset = beamIndex === 0 ? -beam.glassesSpread : beam.glassesSpread;
      const beamPath = Neo.buildRicochetBeamPath(Neo.player.x, Neo.player.y, baseAngle + offset, beam.glassesRange, Neo.LAZER_GLASSES_BOUNCES);
      Neo.carveBeamLight(beamPath, beam.glassesWidth, beam.glassesStrength);
    }
  }

export function carveEnemyBeamLights() {
    const beam = Neo.LIGHTING_CONFIG.beam;
    Neo.enemies.forEach(enemy => {
      if (!enemy || Number(enemy.beamTime || 0) <= 0 || !Number.isFinite(enemy.beamAngle)) return;
      const isGod = enemy.type === 'god';
      const isPartition = isGod && enemy.state === 'godPartition' && Array.isArray(enemy.partitionAngles);
      const angles = isPartition ? enemy.partitionAngles : [enemy.beamAngle];
      angles.forEach(angle => {
        const beamPath = Neo.buildRicochetBeamPath(
          enemy.x,
          enemy.y,
          angle,
          isPartition ? Math.hypot(Neo.ROOM_W, Neo.ROOM_H) * 1.15 : isGod ? beam.enemyGodRange : beam.enemyDefaultRange,
          isPartition ? 0 : Neo.getEnemyBeamBounceCount(enemy),
        );
        Neo.carveBeamLight(beamPath, isGod ? beam.enemyGodWidth : beam.enemyDefaultWidth, isGod ? beam.enemyGodStrength : beam.enemyDefaultStrength);
      });
    });
  }

const tintRgbCache = new Map();
const TINT_RGB_RE = /^rgba\((\s*\d+\s*,\s*\d+\s*,\s*\d+\s*),\s*[\d.]+\)$/;
export function lightTintWithAlpha(tint, alpha) {
    let rgb = tintRgbCache.get(tint);
    if (rgb === undefined) {
      const match = TINT_RGB_RE.exec(tint);
      rgb = match ? match[1] : null;
      tintRgbCache.set(tint, rgb);
    }
    return rgb ? `rgba(${rgb}, ${alpha})` : 'rgba(255,255,255,0)';
  }

export function drawLightBloom(lights) {
    Neo.ctx.globalCompositeOperation = 'lighter';
    lights.forEach(light => {
      if (!light.tint) return;
      const glow = Neo.ctx.createRadialGradient(light.x, light.y, Math.max(4, light.inner * 0.35), light.x, light.y, light.outer);
      glow.addColorStop(0, light.tint);
      glow.addColorStop(0.58, lightTintWithAlpha(light.tint, 0.02));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      Neo.ctx.fillStyle = glow;
      Neo.ctx.globalAlpha = Math.min(0.46, light.strength * 0.46);
      Neo.ctx.fillRect(light.x - light.outer, light.y - light.outer, light.outer * 2, light.outer * 2);
    });
  }

export function drawRoomCeilingMask() {
    // Disabled: room lighting/darkness compositing can leave isolated dark regions.
  }

  // Expose on Neo
  Neo.drawWorldViewport = drawWorldViewport;
  Neo.getActiveRoomChamber = getActiveRoomChamber;
  Neo.withRoundedClipRect = withRoundedClipRect;
  Neo.getRoomDarkness = getRoomDarkness;
  Neo.createRoomDarknessGradient = createRoomDarknessGradient;
  Neo.carveSoftLight = carveSoftLight;
  Neo.carvePlayerBeamLights = carvePlayerBeamLights;
  Neo.carveEnemyBeamLights = carveEnemyBeamLights;
  Neo.lightTintWithAlpha = lightTintWithAlpha;
  Neo.drawLightBloom = drawLightBloom;
  Neo.drawRoomCeilingMask = drawRoomCeilingMask;
