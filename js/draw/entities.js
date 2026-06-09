// entities.js — standalone IIFE. Sprite atlas, player/enemy drawing.
  function buildSpriteAtlas() {
    const entries = [];
    Object.keys(Neo.SPRITE_DEFS).forEach(key => {
      const def = Neo.SPRITE_DEFS[key];
      entries.push({ key, def, pixels: def.pixels });
      Object.entries(def.frames || {}).forEach(([frameKey, pixels]) => {
        entries.push({ key: `${key}:${frameKey}`, def, pixels });
      });
    });
    const GUTTER = 1;
    const STRIDE = Neo.SPRITE_SOURCE_SIZE + GUTTER;
    const canvasEl = document.createElement('canvas');
    canvasEl.width = STRIDE * entries.length;
    canvasEl.height = Neo.SPRITE_SOURCE_SIZE;
    const atlasCtx = canvasEl.getContext('2d');
    atlasCtx.imageSmoothingEnabled = false;
    const frames = {};
    entries.forEach((entry, index) => {
      const { key, def, pixels } = entry;
      const ox = index * STRIDE;
      frames[key] = { x: ox, y: 0, w: Neo.SPRITE_SOURCE_SIZE, h: Neo.SPRITE_SOURCE_SIZE };
      for (let y = 0; y < pixels.length; y += 1) {
        const row = pixels[y];
        for (let x = 0; x < row.length; x += 1) {
          const pixel = row[x];
          if (pixel === '.') continue;
          for (let oy = -1; oy <= 1; oy += 1) {
            for (let oxi = -1; oxi <= 1; oxi += 1) {
              if (oxi === 0 && oy === 0) continue;
              const nx = x + oxi;
              const ny = y + oy;
              if (nx < 0 || ny < 0 || nx >= row.length || ny >= pixels.length) continue;
              if (pixels[ny][nx] !== '.') continue;
              atlasCtx.fillStyle = 'rgba(15, 10, 14, 0.92)';
              atlasCtx.fillRect(ox + nx, ny, 1, 1);
            }
          }
        }
      }
      pixels.forEach((row, y) => {
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
    if (enemy.type === 'machine_gunner') return Neo.SPRITE_DEFS.machine_gunner ? 'machine_gunner' : 'sniper';
    if (enemy.type === 'summoner') return Neo.SPRITE_DEFS.summoner ? 'summoner' : 'cult_mage';
    if (enemy.type === 'shield_unit') return 'golem';
    if (enemy.type === 'healer') return 'cult_follower';
    if (enemy.type === 'boss_spawner') return 'laser';
    return Neo.SPRITE_DEFS[enemy.type] ? enemy.type : 'hunter';
  }

  function getPlayerSpriteKey() {
    const key = Neo.getCharacterDef().key;
    return Neo.SPRITE_DEFS[key] ? key : 'thorn_knight';
  }

  function getFacingDirection(actor, fallbackAngle = 0) {
    if (Math.abs(actor.vx) > 6) return actor.vx < 0 ? -1 : 1;
    return Math.cos(fallbackAngle) < 0 ? -1 : 1;
  }

  function getActorAnimSeed(actor, fallbackKey = '') {
    if (Number.isFinite(actor?.animSeed)) return actor.animSeed;
    const source = `${actor?.type || actor?.character || fallbackKey}:${Math.round(actor?.x || 0)}:${Math.round(actor?.y || 0)}`;
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
      hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
    }
    return Math.abs(hash % 628) / 100;
  }

  function getActorSpriteFrameKey(spriteKey, actor, options = {}) {
    const access = window.NeoSettings?.getAccess?.() || {};
    const def = Neo.SPRITE_DEFS[spriteKey];
    const animations = def?.animations || {};
    if (!def || access.reduceMotion) return spriteKey;

    const atlasFrames = Neo.SPRITE_ATLAS?.frames || {};
    const resolve = variant => {
      if (!variant || variant === 'idle') return spriteKey;
      const key = `${spriteKey}:${variant}`;
      return atlasFrames[key] ? key : spriteKey;
    };

    const attackFrames = animations.attack || [];
    if (attackFrames.length && Number(options.attackProgress || 0) > 0) {
      const progress = Neo.clamp(Number(options.attackProgress || 0), 0, 0.999);
      return resolve(attackFrames[Math.floor(progress * attackFrames.length)]);
    }

    const walkFrames = animations.walk || [];
    const speed = Math.hypot(Number(actor?.vx || 0), Number(actor?.vy || 0));
    const seed = getActorAnimSeed(actor, spriteKey);
    if (walkFrames.length && speed > 10) {
      const stepRate = Number(options.stepRate || 10);
      const index = Math.floor(Date.now() / 1000 * stepRate + seed) % walkFrames.length;
      return resolve(walkFrames[index]);
    }

    const blinkFrames = animations.blink || [];
    const idleFrames = animations.idle || [];
    const now = Date.now() / 1000 + seed * 0.37;
    const blinkCycle = Number(options.blinkCycle || 4.2);
    const blinkWindow = 0.11 + (seed % 0.05);
    if (blinkFrames.length && (now % blinkCycle) < blinkWindow) {
      return resolve(blinkFrames[0]);
    }
    if (idleFrames.length) {
      const idleRate = Number(options.idleRate || 1.15);
      const index = Math.floor(now * idleRate) % idleFrames.length;
      return resolve(idleFrames[index]);
    }

    return spriteKey;
  }

  function getActorSpriteAnimation(actor, size, options = {}) {
    const access = window.NeoSettings?.getAccess?.() || {};
    const base = {
      spriteOffsetX: 0,
      spriteOffsetY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      shadowScaleX: 1,
      shadowScaleY: 1,
    };
    if (!actor || access.reduceMotion) return base;

    const speed = Math.hypot(Number(actor.vx || 0), Number(actor.vy || 0));
    const maxSpeed = Math.max(1, Number(options.maxSpeed || 220));
    const moving = Neo.clamp((speed - 8) / maxSpeed, 0, 1);
    const seed = getActorAnimSeed(actor, options.seedKey);
    const now = Date.now() / 1000;
    const stepRate = Number(options.stepRate || 10);
    const phase = now * stepRate + seed;
    const step = Math.sin(phase);
    const footfall = Math.abs(step);
    const dashPulse = Number(options.dashPulse || (actor.dashTime > 0 ? 1 : 0));
    const actionPulse = Number(options.actionPulse || 0);
    const castPulse = Number(options.castPulse || 0);
    const stunPulse = Number(actor.stun || 0) > 0 ? Math.sin(now * 42 + seed) * 0.035 : 0;
    const horizontalLean = Neo.clamp(Number(actor.vx || 0) / maxSpeed, -1, 1) * 0.055;
    const idle = 1 - moving;
    const breathe = Math.sin(now * Number(options.idleBreathRate || 2.2) + seed) * idle;

    base.spriteOffsetY = -footfall * size * 0.022 * moving - dashPulse * size * 0.015 + breathe * size * 0.01;
    base.scaleX = 1 + footfall * 0.012 * moving + dashPulse * 0.12 + actionPulse * 0.08 + castPulse * 0.04 - breathe * 0.008;
    base.scaleY = 1 - footfall * 0.018 * moving - dashPulse * 0.075 + actionPulse * 0.025 + breathe * 0.012;
    base.rotation = horizontalLean * 0.7 + step * 0.018 * moving + breathe * 0.015 + stunPulse;
    base.shadowScaleX = 1 + moving * 0.08 + dashPulse * 0.18;
    base.shadowScaleY = 1 - moving * 0.025;
    return base;
  }

  function getAttackPulse(remaining, total = 0.32) {
    if (!(remaining > 0)) return 0;
    const progress = 1 - Neo.clamp(remaining / Math.max(0.01, total), 0, 1);
    return Math.sin(progress * Math.PI);
  }

  function getAttackProgress(remaining, total = 0.32) {
    if (!(remaining > 0)) return 0;
    return 1 - Neo.clamp(remaining / Math.max(0.01, total), 0, 1);
  }

  function drawWarpPreview() {
    if (Neo.getEquippedMove?.('dash') !== 'warp' || !Neo.getWarpLandingPoint) return;
    const landing = Neo.getWarpLandingPoint();
    if (!landing) return;
    const time = Date.now() * 0.006;
    const pulse = Math.sin(time) * 2.5;

    Neo.ctx.save();
    Neo.ctx.lineCap = 'round';
    Neo.ctx.shadowColor = '#c8a6ff';
    Neo.ctx.shadowBlur = 14;
    Neo.ctx.globalAlpha = 0.34;
    Neo.ctx.strokeStyle = '#c8a6ff';
    Neo.ctx.lineWidth = 2;
    Neo.ctx.setLineDash([8, 7]);
    Neo.ctx.lineDashOffset = -time * 7;
    Neo.ctx.beginPath();
    Neo.ctx.moveTo(Neo.player.x, Neo.player.y);
    Neo.ctx.lineTo(landing.x, landing.y);
    Neo.ctx.stroke();
    Neo.ctx.setLineDash([]);

    if (landing.adjustedFromCursor) {
      Neo.ctx.globalAlpha = 0.2;
      Neo.ctx.lineWidth = 1.5;
      Neo.ctx.beginPath();
      Neo.ctx.arc(landing.targetX, landing.targetY, 12, 0, Math.PI * 2);
      Neo.ctx.stroke();
    }

    Neo.ctx.globalAlpha = 0.58;
    Neo.ctx.lineWidth = 3;
    Neo.ctx.beginPath();
    Neo.ctx.arc(landing.x, landing.y, Neo.player.r + 11 + pulse, 0, Math.PI * 2);
    Neo.ctx.stroke();

    Neo.ctx.globalAlpha = 0.18;
    Neo.ctx.fillStyle = '#c8a6ff';
    Neo.ctx.beginPath();
    Neo.ctx.arc(landing.x, landing.y, Neo.player.r + 18 + pulse, 0, Math.PI * 2);
    Neo.ctx.fill();
    Neo.ctx.restore();

    const aimAngle = Math.atan2(Neo.mouse.worldY - landing.y, Neo.mouse.worldX - landing.x);
    const facing = getFacingDirection(Neo.player, aimAngle);
    const ghostSize = Math.max(34, Neo.player.r * 2.5);
    drawSpriteFrame(getPlayerSpriteKey(), landing.x, landing.y, ghostSize, {
      alpha: 0.42 + Math.sin(time) * 0.06,
      flipX: facing < 0,
      shadowColor: '#c8a6ff',
      shadowBlur: 16,
      tint: '#c8a6ff',
    });
  }

  function drawSpriteFrame(spriteKey, x, y, size, options = {}) {
    const atlas = Neo.SPRITE_ATLAS;
    if (!atlas?.frames || !atlas.canvas) return;
    const baseKey = String(spriteKey || '').split(':')[0];
    const frame = atlas.frames[spriteKey] || atlas.frames[baseKey] || atlas.frames.hunter;
    if (!frame) return;
    const {
      alpha = 1,
      flipX = false,
      shadowColor = null,
      shadowBlur = 0,
      tint = null,
      spriteOffsetX = 0,
      spriteOffsetY = 0,
      scaleX = 1,
      scaleY = 1,
      rotation = 0,
      shadowScaleX = 1,
      shadowScaleY = 1,
    } = options;
    Neo.ctx.save();
    Neo.ctx.translate(x, y);
    Neo.ctx.globalAlpha = alpha;
    Neo.ctx.fillStyle = 'rgba(0,0,0,0.24)';
    Neo.ctx.beginPath();
    Neo.ctx.ellipse(0, size * 0.3, size * 0.28 * shadowScaleX, size * 0.11 * shadowScaleY, 0, 0, Math.PI * 2);
    Neo.ctx.fill();
    if (flipX) Neo.ctx.scale(-1, 1);
    Neo.ctx.translate(spriteOffsetX, spriteOffsetY);
    Neo.ctx.rotate(flipX ? -rotation : rotation);
    Neo.ctx.scale(scaleX, scaleY);
    if (shadowColor && shadowBlur > 0) {
      Neo.ctx.shadowColor = shadowColor;
      Neo.ctx.shadowBlur = shadowBlur;
    }
    Neo.ctx.imageSmoothingEnabled = false;
    Neo.ctx.drawImage(
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
      Neo.ctx.globalCompositeOperation = 'source-atop';
      Neo.ctx.fillStyle = tint;
      Neo.ctx.globalAlpha = 0.22;
      Neo.ctx.fillRect(-size / 2, -size / 2, size, size);
    }
    Neo.ctx.restore();
  }

  function drawSpriteToCanvas(canvasEl, spriteKey, size = canvasEl?.width || 96, options = {}) {
    if (!(canvasEl instanceof HTMLCanvasElement)) return;
    const atlas = Neo.SPRITE_ATLAS;
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
    const performanceMode = window.NeoSettings?.isPerformanceMode?.() !== false;
    const activeBeamCount = Neo.enemies.reduce((count, enemy) => count + (enemy?.beamTime > 0 ? 1 : 0), 0);
    const lowBeamFx = performanceMode && (activeBeamCount > 3 || (Neo.particles?.length || 0) > 64);
    Neo.enemies.forEach(enemy => {
      if (enemy.windup > 0) {
        Neo.ctx.save();
        Neo.ctx.translate(enemy.x, enemy.y);
        Neo.ctx.strokeStyle = (enemy.type === 'charger' || enemy.type === 'golem' || enemy.type === 'bulk_golem') ? '#ff8844' : enemy.type === 'bowman_bane' ? '#8dd4ff' : enemy.type === 'handsome_devil' ? '#ff3348' : enemy.type === 'antony_blemmye' ? '#ffcf8a' : '#aa66ff';
        Neo.ctx.lineWidth = 2;
        Neo.ctx.globalAlpha = 0.8;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, enemy.r + 10 + Math.sin(Date.now() / 120) * 2, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.restore();
      }
      if (enemy.beamTime > 0) {
        const range = enemy.type === 'god' ? (enemy.beamRange || 620) : enemy.type === 'mooggy' ? 520 : enemy.type === 'handsome_devil' ? (enemy.beamRange || 560) : enemy.type === 'bowman_bane' ? 480 : 430;
        const beamPath = Neo.buildRicochetBeamPath(enemy.x, enemy.y, enemy.beamAngle, range, Neo.getEnemyBeamBounceCount(enemy));
        const color = enemy.type === 'god' ? '#ffffff' : enemy.type === 'mooggy' ? '#ff3348' : enemy.type === 'handsome_devil' ? '#ff3348' : enemy.type === 'bowman_bane' ? '#8dd4ff' : '#aa66ff';
        const width = enemy.type === 'god' && enemy.state === 'godSweep' ? 18 : enemy.type === 'god' ? 10 : enemy.type === 'mooggy' ? 6 : enemy.type === 'handsome_devil' ? 9 : 8;
        Neo.drawTaperedBeamPath(beamPath, {
          color,
          glow: color,
          maxWidth: width,
          minWidthRatio: enemy.type === 'god' ? 0.12 : 0.2,
          taperPower: enemy.type === 'god' ? 1.8 : 1.35,
          segmentLength: lowBeamFx ? 80 : 48,
          shadowBlur: enemy.type === 'god' && enemy.state === 'godSweep' ? 24 : enemy.type === 'mooggy' || enemy.type === 'handsome_devil' ? 20 : 14,
          coreColor: enemy.type === 'god' ? '#ffffff' : 'rgba(255,255,255,0.66)',
          coreWidth: Math.max(1.4, width * 0.22),
          coreShadowBlur: lowBeamFx ? 0 : 4,
          lowFx: lowBeamFx,
        });
      }
    });
  }

  function drawMooggyAura(enemy) {
    const t = Date.now() / 180;
    Neo.ctx.save();
    Neo.ctx.translate(enemy.x, enemy.y);
    Neo.ctx.globalAlpha = window.NeoSettings?.getAccess()?.reduceFlash ? 0.32 : 0.34 + Math.sin(t) * 0.08;
    Neo.ctx.shadowColor = '#ff1d34';
    Neo.ctx.shadowBlur = 18;
    Neo.ctx.strokeStyle = '#ff3348';
    Neo.ctx.lineWidth = 2;
    Neo.ctx.beginPath();
    Neo.ctx.arc(0, 0, enemy.r + 13 + Math.sin(t * 1.4) * 2, 0, Math.PI * 2);
    Neo.ctx.stroke();
    Neo.ctx.globalAlpha *= 0.36;
    Neo.ctx.fillStyle = '#ff1d34';
    Neo.ctx.beginPath();
    Neo.ctx.arc(0, 0, enemy.r + 19, 0, Math.PI * 2);
    Neo.ctx.fill();
    Neo.ctx.restore();
  }

  function drawBleedOverlay(enemy, stacks) {
    const stackCount = Math.max(0, Math.round(Number(stacks || 0)));
    if (!stackCount) return;
    const t = Date.now() / 170;
    const flash = Neo.clamp(Number(enemy.bleedFlash || 0) * 3, 0, 1);
    const drops = Math.min(8, stackCount + 2);

    Neo.ctx.save();
    Neo.ctx.translate(enemy.x, enemy.y);
    Neo.ctx.globalAlpha = 0.72 + flash * 0.22;
    Neo.ctx.shadowColor = '#b50022';
    Neo.ctx.shadowBlur = 8 + stackCount * 1.4 + flash * 10;
    for (let index = 0; index < drops; index += 1) {
      const angle = (index / drops) * Math.PI * 2 + t * (index % 2 ? -0.35 : 0.28);
      const radius = enemy.r * (0.42 + (index % 3) * 0.18);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle * 1.2) * radius * 0.68 + enemy.r * 0.06;
      const size = 2.2 + Math.min(5, stackCount) * 0.22 + (index % 2) * 0.8;
      Neo.ctx.fillStyle = Neo.BLEED_BLOOD_COLORS[index % Neo.BLEED_BLOOD_COLORS.length];
      Neo.ctx.beginPath();
      Neo.ctx.ellipse(x, y, size * 0.7, size * 1.15, angle, 0, Math.PI * 2);
      Neo.ctx.fill();
    }
    if (flash > 0 && !window.NeoSettings?.getAccess()?.reduceFlash) {
      Neo.ctx.globalAlpha = flash * 0.65;
      Neo.ctx.strokeStyle = '#ff2b45';
      Neo.ctx.lineWidth = 2;
      Neo.ctx.beginPath();
      Neo.ctx.arc(0, 0, enemy.r + 9 + flash * 5, 0, Math.PI * 2);
      Neo.ctx.stroke();
    }
    Neo.ctx.restore();
  }

  function drawStatusIcon(statusKey, x, y, size = 12, options = {}) {
    const def = Neo.STATUS_ICON_DEFS?.[statusKey] || Neo.STATUS_ICON_DEFS?.bleed;
    if (!def) return;
    const cell = size / 8;
    const drawPixels = (pixels, color) => {
      Neo.ctx.fillStyle = color;
      (pixels || []).forEach(([px, py]) => {
        Neo.ctx.fillRect(Math.round(x + px * cell), Math.round(y + py * cell), Math.ceil(cell), Math.ceil(cell));
      });
    };
    Neo.ctx.save();
    Neo.ctx.shadowColor = options.shadow === false ? 'transparent' : def.color;
    Neo.ctx.shadowBlur = options.shadow === false ? 0 : Math.max(4, size * 0.45);
    drawPixels(def.pixels, def.color);
    Neo.ctx.shadowBlur = 0;
    drawPixels(def.accentPixels, def.accent || '#fff');
    Neo.ctx.restore();
  }

  function getStatusIconBadgeWidth(stacks) {
    return Number(stacks || 0) > 1 ? 27 : 18;
  }

  function drawStatusIconBadge(statusKey, stacks, x, y) {
    const def = Neo.STATUS_ICON_DEFS?.[statusKey] || Neo.STATUS_ICON_DEFS?.bleed;
    if (!def) return;
    const count = Math.max(0, Math.round(Number(stacks || 0)));
    const width = getStatusIconBadgeWidth(count);
    const height = 16;
    Neo.ctx.save();
    Neo.ctx.fillStyle = def.bg || 'rgba(0,0,0,0.78)';
    Neo.ctx.strokeStyle = def.color;
    Neo.ctx.lineWidth = 1;
    Neo.ctx.shadowColor = def.color;
    Neo.ctx.shadowBlur = 7;
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(x, y, width, height, 5);
    Neo.ctx.fill();
    Neo.ctx.stroke();
    Neo.ctx.shadowBlur = 0;
    drawStatusIcon(statusKey, x + 3, y + 2, 12, { shadow: false });
    if (count > 1) {
      Neo.ctx.font = 'bold 9px system-ui';
      Neo.ctx.textAlign = 'right';
      Neo.ctx.textBaseline = 'middle';
      Neo.ctx.fillStyle = def.accent || '#fff';
      Neo.ctx.fillText(String(Math.min(99, count)), x + width - 3, y + height / 2 + 0.5);
    }
    Neo.ctx.restore();
  }

  function drawEnemyStatusIconRow(enemy, drawY) {
    const entries = [];
    Neo.STATUS_KEYS.forEach(key => {
      const stacks = Neo.getStatusStacks(enemy, key);
      if (stacks > 0) entries.push({ key, stacks });
    });
    if (Number(enemy.stun || 0) > 0) entries.push({ key: 'stun', stacks: 1 });
    if (!entries.length) return;
    const gap = 3;
    const widths = entries.map(entry => getStatusIconBadgeWidth(entry.stacks));
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, entries.length - 1);
    const y = drawY + (enemy.type === 'rival' ? -enemy.r - 43 : -enemy.r - 35);
    let x = enemy.x - totalWidth / 2;
    entries.forEach((entry, index) => {
      drawStatusIconBadge(entry.key, entry.stacks, x, y);
      x += widths[index] + gap;
    });
  }

  function drawStunStars(entity, drawY) {
    const stunTime = Number(entity?.stun || 0);
    if (stunTime <= 0) return;
    const reduceFlash = window.NeoSettings?.getAccess()?.reduceFlash;
    const t = Date.now() / 260;
    const starCount = stunTime > 0.75 ? 3 : stunTime > 0.35 ? 2 : 1;
    const orbitR = Math.max(10, Number(entity.r || 12) * 0.72);
    const y = drawY - Number(entity.r || 12) - 10;
    Neo.ctx.save();
    Neo.ctx.translate(entity.x, y);
    Neo.ctx.globalAlpha = reduceFlash ? 0.78 : 0.72 + Math.sin(t * 4) * 0.12;
    for (let index = 0; index < starCount; index += 1) {
      const angle = t + (index / starCount) * Math.PI * 2;
      const sx = Math.cos(angle) * orbitR;
      const sy = Math.sin(angle) * orbitR * 0.34;
      drawPixelStar(sx, sy, index === 0 ? 7 : 6);
    }
    Neo.ctx.restore();
  }

  function drawEnemyLostSightMark(enemy, drawY) {
    if (!enemy?.playerLostSight) return;

    const access = window.NeoSettings?.getAccess?.() || {};
    const age = Math.max(0, Number(enemy.playerLostSightAge) || 0);
    const pop = access.reduceMotion ? 1 : Neo.clamp(age / 0.14, 0, 1);
    const bob = access.reduceMotion
      ? 0
      : Math.sin(age * 5 + Number(enemy.x || 0) * 0.025) * 2;
    const markY = drawY - enemy.r - (enemy.type === 'rival' ? 63 : 55) + bob;

    Neo.ctx.save();
    Neo.ctx.translate(enemy.x, markY);
    Neo.ctx.scale(pop, pop);
    Neo.ctx.shadowColor = 'rgba(120, 220, 255, 0.7)';
    Neo.ctx.shadowBlur = 7;

    Neo.ctx.fillStyle = 'rgba(8, 16, 28, 0.94)';
    Neo.ctx.strokeStyle = '#dff7ff';
    Neo.ctx.lineWidth = 2;
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(-12, -14, 24, 25, 7);
    Neo.ctx.fill();
    Neo.ctx.stroke();

    Neo.ctx.beginPath();
    Neo.ctx.moveTo(-3, 11);
    Neo.ctx.lineTo(2, 17);
    Neo.ctx.lineTo(5, 10);
    Neo.ctx.closePath();
    Neo.ctx.fill();
    Neo.ctx.stroke();

    Neo.ctx.shadowBlur = 0;
    Neo.ctx.fillStyle = '#67d8ff';
    Neo.ctx.font = 'bold 18px "Press Start 2P", monospace';
    Neo.ctx.textAlign = 'center';
    Neo.ctx.textBaseline = 'middle';
    Neo.ctx.fillText('?', 0, -1);
    Neo.ctx.restore();
  }

  function drawPixelStar(x, y, size = 6) {
    const scale = Math.max(1, size / 6);
    const pixels = [[2,0],[3,0],[2,1],[3,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[2,3],[3,3],[1,4],[4,4],[0,5],[5,5]];
    Neo.ctx.save();
    Neo.ctx.translate(Math.round(x - size / 2), Math.round(y - size / 2));
    Neo.ctx.shadowColor = '#ffe66d';
    Neo.ctx.shadowBlur = 8;
    Neo.ctx.fillStyle = '#ffe66d';
    pixels.forEach(([px, py]) => {
      Neo.ctx.fillRect(Math.round(px * scale), Math.round(py * scale), Math.ceil(scale), Math.ceil(scale));
    });
    Neo.ctx.shadowBlur = 0;
    Neo.ctx.fillStyle = '#fff8c8';
    [[2,2],[3,2],[2,3],[3,3]].forEach(([px, py]) => {
      Neo.ctx.fillRect(Math.round(px * scale), Math.round(py * scale), Math.ceil(scale), Math.ceil(scale));
    });
    Neo.ctx.restore();
  }

  // Called inside a save() block with font/textAlign/textBaseline already set.
  // Coordinates are in world space (not translated).
  function drawStatusBadge(enemy, label, bgColor, borderColor, textColor, yOffset) {
    const width = Math.max(50, Neo.ctx.measureText(label).width + 14);
    const height = 15;
    Neo.ctx.fillStyle = bgColor;
    Neo.ctx.strokeStyle = borderColor;
    Neo.ctx.shadowColor = borderColor;
    Neo.ctx.shadowBlur = 8;
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(enemy.x - width / 2, enemy.y + yOffset, width, height, 5);
    Neo.ctx.fill();
    Neo.ctx.stroke();
    Neo.ctx.shadowBlur = 0;
    Neo.ctx.fillStyle = textColor;
    Neo.ctx.fillText(label, enemy.x, enemy.y + yOffset + height / 2 + 0.5);
  }

  function drawSpawnPortal(enemy) {
    const SPAWN_DURATION = 0.72;
    const t = Neo.clamp(1 - enemy.spawnT / SPAWN_DURATION, 0, 1);
    const emerge = Neo.clamp((t - 0.35) / 0.65, 0, 1);
    const portalEase = 1 - (1 - Math.min(t * 1.8, 1)) ** 3;
    const now = Date.now();
    const r = enemy.r;
    const isBoss = Neo.BOSS_TYPES.has(enemy.type);
    const isElite = !!enemy.elite;
    const portalColor = isBoss ? '#ffd060' : isElite ? '#e8b030' : '#8855ff';
    const innerColor = isBoss ? '#fff4c0' : isElite ? '#ffe080' : '#cc88ff';
    const portalR = r * (1.8 + portalEase * 0.6);

    Neo.ctx.save();
    Neo.ctx.translate(enemy.x, enemy.y);

    // Ground shadow pool
    Neo.ctx.globalAlpha = 0.45 * portalEase;
    Neo.ctx.fillStyle = isBoss ? 'rgba(120,80,0,0.6)' : 'rgba(40,0,80,0.6)';
    Neo.ctx.beginPath();
    Neo.ctx.ellipse(0, r * 0.3, portalR * 0.85, portalR * 0.28, 0, 0, Math.PI * 2);
    Neo.ctx.fill();

    // Outer spinning ring
    Neo.ctx.globalAlpha = 0.9 * portalEase;
    Neo.ctx.shadowColor = portalColor;
    Neo.ctx.shadowBlur = 18 + portalEase * 14;
    for (let ring = 0; ring < 2; ring += 1) {
      const ringR = portalR * (0.78 + ring * 0.22);
      const spin = now / (ring === 0 ? 320 : -480);
      const segments = 8 + ring * 4;
      Neo.ctx.strokeStyle = ring === 0 ? portalColor : innerColor;
      Neo.ctx.lineWidth = 2.5 - ring * 0.8;
      Neo.ctx.beginPath();
      for (let seg = 0; seg < segments; seg += 1) {
        const a0 = (seg / segments) * Math.PI * 2 + spin;
        const a1 = ((seg + 0.6) / segments) * Math.PI * 2 + spin;
        Neo.ctx.moveTo(Math.cos(a0) * ringR, Math.sin(a0) * ringR * 0.38);
        Neo.ctx.lineTo(Math.cos(a1) * ringR, Math.sin(a1) * ringR * 0.38);
      }
      Neo.ctx.stroke();
    }

    // Portal interior glow
    Neo.ctx.globalAlpha = 0.55 * portalEase;
    Neo.ctx.shadowBlur = 0;
    const grad = Neo.ctx.createRadialGradient(0, 0, 0, 0, 0, portalR * 0.7);
    grad.addColorStop(0, isBoss ? 'rgba(255,230,120,0.9)' : 'rgba(180,100,255,0.9)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    Neo.ctx.fillStyle = grad;
    Neo.ctx.beginPath();
    Neo.ctx.ellipse(0, 0, portalR * 0.7, portalR * 0.26, 0, 0, Math.PI * 2);
    Neo.ctx.fill();

    // Inward particle streaks
    Neo.ctx.globalAlpha = 0.7 * portalEase;
    Neo.ctx.strokeStyle = innerColor;
    Neo.ctx.lineWidth = 1.2;
    Neo.ctx.shadowColor = innerColor;
    Neo.ctx.shadowBlur = 8;
    const streakCount = isBoss ? 10 : 6;
    for (let s = 0; s < streakCount; s += 1) {
      const angle = (s / streakCount) * Math.PI * 2 + now / 600;
      const outerR = portalR * (0.9 + Math.sin(now / 200 + s) * 0.1);
      const innerR = portalR * 0.25;
      const _portalAccess = window.NeoSettings?.getAccess() || {};
      Neo.ctx.globalAlpha = (_portalAccess.reduceMotion ? 0.55 : (0.3 + 0.4 * Math.abs(Math.sin(now / 300 + s * 1.3)))) * portalEase;
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR * 0.38);
      Neo.ctx.lineTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR * 0.38);
      Neo.ctx.stroke();
    }

    Neo.ctx.restore();

    // Enemy emerges from center — draw sprite squashed vertically
    if (emerge > 0) {
      const spriteKey = getEnemySpriteKey(enemy);
      const facing = getFacingDirection(enemy, 0);
      const drawSize = Math.max(30, r * 2.4);
      const squash = 0.28 + emerge * 0.72;
      const alpha = Neo.clamp(emerge * 1.8, 0, 1);
      const atlas = Neo.SPRITE_ATLAS;
      const frame = atlas?.frames ? (atlas.frames[spriteKey] || atlas.frames.hunter) : null;
      if (frame) {
        Neo.ctx.save();
        Neo.ctx.translate(enemy.x, enemy.y);
        if (facing < 0) Neo.ctx.scale(-1, 1);
        Neo.ctx.scale(1, squash);
        Neo.ctx.globalAlpha = alpha;
        Neo.ctx.shadowColor = portalColor;
        Neo.ctx.shadowBlur = 12 + (1 - emerge) * 18;
        Neo.ctx.imageSmoothingEnabled = false;
        Neo.ctx.drawImage(
          atlas.canvas,
          frame.x, frame.y, frame.w, frame.h,
          -drawSize / 2, -drawSize / 2, drawSize, drawSize,
        );
        if (isElite) {
          Neo.ctx.globalCompositeOperation = 'source-atop';
          Neo.ctx.fillStyle = 'rgba(255,210,96,0.7)';
          Neo.ctx.globalAlpha = 0.22;
          Neo.ctx.fillRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize);
        }
        Neo.ctx.restore();
      }
    }
  }

  function drawEnemies() {
    const _now = Date.now();
    const _reduceFlash = window.NeoSettings?.getAccess()?.reduceFlash;
    Neo.enemies.forEach(enemy => {
      if (!enemy) return;
      if (enemy.spawnT > 0) { drawSpawnPortal(enemy); return; }
      const drawY = enemy.y - Math.max(0, Number(enemy.jumpZ || 0));
      const bleedStacks = Neo.getStatusStacks(enemy, 'bleed');
      // Count active statuses first (no array allocation), then draw a ring per
      // active status. This runs per enemy per frame, so avoid filter()/forEach.
      let activeStatusCount = 0;
      for (let s = 0; s < Neo.STATUS_KEYS.length; s += 1) {
        if (Neo.getStatusStacks(enemy, Neo.STATUS_KEYS[s]) > 0) activeStatusCount += 1;
      }
      if (activeStatusCount > 0) {
        Neo.ctx.save();
        Neo.ctx.translate(enemy.x, drawY);
        Neo.ctx.lineWidth = 2;
        let ringIndex = 0;
        for (let s = 0; s < Neo.STATUS_KEYS.length; s += 1) {
          const key = Neo.STATUS_KEYS[s];
          if (Neo.getStatusStacks(enemy, key) <= 0) continue;
          const style = Neo.STATUS_STYLES[key];
          Neo.ctx.strokeStyle = style.color;
          Neo.ctx.shadowColor = style.color;
          Neo.ctx.shadowBlur = 10;
          Neo.ctx.beginPath();
          Neo.ctx.arc(0, 0, enemy.r + 6 + ringIndex * 4 + (_reduceFlash ? 0 : Math.sin(_now / (180 + ringIndex * 40)) * 2), 0, Math.PI * 2);
          Neo.ctx.stroke();
          ringIndex += 1;
        }
        Neo.ctx.restore();
      }
      if (Number(enemy.critSparkle || 0) > 0) {
        Neo.ctx.save();
        Neo.ctx.translate(enemy.x, drawY);
        const sparkleCount = 4;
        const baseR = enemy.r + 8;
        for (let s = 0; s < sparkleCount; s += 1) {
          const spin = _reduceFlash ? 0 : _now / 320;
          const a = (s / sparkleCount) * Math.PI * 2 + spin;
          const px = Math.cos(a) * baseR;
          const py = Math.sin(a) * baseR;
          const tw = _reduceFlash ? 1 : 0.55 + Math.abs(Math.sin(_now / 140 + s)) * 0.9;
          Neo.ctx.fillStyle = '#ffe8a3';
          Neo.ctx.shadowColor = '#ffd05a';
          Neo.ctx.shadowBlur = 8;
          Neo.ctx.beginPath();
          Neo.ctx.arc(px, py, 2.2 * tw, 0, Math.PI * 2);
          Neo.ctx.fill();
        }
        Neo.ctx.restore();
      }
      const spriteKey = getEnemySpriteKey(enemy);
      const facing = getFacingDirection(enemy, enemy.beamAngle || enemy.dashAngle || 0);
      const drawSize = Math.max(30, enemy.r * 2.4);
      let scale = 1;
      let flash = false;
      if (enemy.transformAnimT && enemy.transformAnimT > 0) {
        const t = enemy.transformAnimT;
        scale = 1.1 + Math.sin(_now / 60) * 0.13 * t * 2;
        flash = Math.floor(_now / 80) % 2 === 0;
      }
      if (enemy.type === 'mooggy') drawMooggyAura(enemy);
      const enemyAttackPulse = Math.max(
        getAttackPulse(enemy.swingTime, 0.36),
        getAttackPulse(enemy.windup, 0.5) * 0.75,
        getAttackPulse(enemy.attackAnimT, 0.24),
      );
      const enemyAttackProgress = Math.max(
        getAttackProgress(enemy.swingTime, 0.36),
        getAttackProgress(enemy.windup, 0.5),
        getAttackProgress(enemy.attackAnimT, 0.24),
      );
      const enemyCastPulse = Math.max(
        enemy.beamTime > 0 ? Neo.clamp(enemy.beamTime / 0.58, 0, 1) * 0.45 : 0,
        enemy.aoeTime > 0 ? 0.55 : 0,
      );
      const enemyAnimation = {
        maxSpeed: Math.max(110, Number(enemy.speed || 100) * 1.6),
        stepRate: enemy.type === 'golem' || enemy.type === 'bulk_golem' ? 5.5 : 7.5,
        dashPulse: enemy.dashTime > 0 ? 1 : 0,
        actionPulse: enemyAttackPulse,
        castPulse: enemyCastPulse,
        attackProgress: enemyAttackProgress,
        seedKey: spriteKey,
      };
      const enemyAnim = getActorSpriteAnimation(enemy, drawSize, enemyAnimation);
      const enemyFrameKey = getActorSpriteFrameKey(spriteKey, enemy, enemyAnimation);
      Neo.ctx.save();
      Neo.ctx.translate(enemy.x, drawY);
      Neo.ctx.scale(scale, scale);
      drawSpriteFrame(enemyFrameKey, 0, 0, drawSize, {
        alpha: enemy.stun > 0 ? 0.68 : 1,
        flipX: facing < 0,
        shadowColor: enemy.type === 'mooggy' ? 'rgba(255,30,52,0.55)' : enemy.elite || enemy.type === 'god' ? 'rgba(255,244,180,0.45)' : 'rgba(0,0,0,0.18)',
        shadowBlur: enemy.type === 'mooggy' ? 16 : enemy.type === 'god' ? 14 : enemy.elite ? 10 : 4,
        tint: flash ? 'rgba(255,255,180,0.55)' : (enemy.elite ? 'rgba(255,210,96,0.7)' : null),
        ...enemyAnim,
      });
      Neo.ctx.restore();
      if (bleedStacks > 0) drawBleedOverlay(enemy, bleedStacks);
      drawStunStars(enemy, drawY);
      drawEnemyStatusIconRow(enemy, drawY);
      drawEnemyLostSightMark(enemy, drawY);
      if (enemy.elite) {
        Neo.ctx.save();
        Neo.ctx.translate(enemy.x, drawY - enemy.r - 10);
        Neo.ctx.fillStyle = '#f6cf6a';
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(-7, 4);
        Neo.ctx.lineTo(-4, -5);
        Neo.ctx.lineTo(0, 0);
        Neo.ctx.lineTo(4, -6);
        Neo.ctx.lineTo(7, 4);
        Neo.ctx.closePath();
        Neo.ctx.fill();
        Neo.ctx.restore();
      }
      Neo.ctx.save();
      Neo.ctx.translate(enemy.x, drawY);
      const hpPct = Neo.clamp(enemy.hp / enemy.max, 0, 1);

      // Name tag + level
      const _enemyLabel = (enemy.type === 'rival' && enemy.rivalData)
        ? enemy.rivalData.name
        : Neo.getEliteEnemyLabel(enemy);
      // Enemy level = total floors entered this run (climbs across loops), not the
      // per-loop `floor` which resets each loop. Matches enemy scaling.
      const _levelStr = `Lv.${Neo.floorsEntered ?? Neo.floor}`;
      Neo.ctx.font = '9px system-ui';
      Neo.ctx.textAlign = 'center';
      Neo.ctx.shadowColor = '#000';
      Neo.ctx.shadowBlur = 4;
      Neo.ctx.fillStyle = enemy.elite ? '#f6cf6a' : Neo.isBossType(enemy.type) ? '#f2e8d7'
        : (enemy.type === 'rival' && enemy.rivalData) ? enemy.rivalData.color : '#b8cfe0';
      Neo.ctx.fillText(`${_enemyLabel}  ${_levelStr}`, 0, -enemy.r - 19);

      // HP bar
      Neo.ctx.fillStyle = '#000a';
      Neo.ctx.fillRect(-18, -enemy.r - 13, 36, 5);
      Neo.ctx.fillStyle = enemy.type === 'rival' ? (enemy.rivalData?.color || '#b24f68') : Neo.isBossType(enemy.type) ? '#f2e8d7' : '#b24f68';
      Neo.ctx.fillRect(-18, -enemy.r - 13, 36 * hpPct, 5);

      // HP current / max text
      Neo.ctx.font = '8px system-ui';
      Neo.ctx.textAlign = 'center';
      Neo.ctx.fillStyle = '#dce7f2';
      Neo.ctx.shadowColor = '#000';
      Neo.ctx.shadowBlur = 3;
      Neo.ctx.fillText(`${Math.ceil(enemy.hp)} / ${enemy.max}`, 0, -enemy.r - 5);

      if ((enemy.barrier || 0) > 0) {
        const barrierPct = Neo.clamp(enemy.barrier / Math.max(1, enemy.max * 0.22), 0, 1);
        Neo.ctx.fillStyle = 'rgba(80, 215, 255, 0.24)';
        Neo.ctx.fillRect(-18, -enemy.r - 20, 36, 4);
        Neo.ctx.fillStyle = '#7ed6ff';
        Neo.ctx.fillRect(-18, -enemy.r - 20, 36 * barrierPct, 4);
      }
      if (enemy.type === 'boss_spawner') {
        Neo.ctx.fillStyle = '#ffb07b';
        Neo.ctx.font = 'bold 10px system-ui';
        Neo.ctx.textAlign = 'center';
        Neo.ctx.fillText(`${Math.max(0, Math.ceil(enemy.bossSpawnTimer))}`, 0, -enemy.r - 30);
      }
      Neo.ctx.restore();
    });
  }

  function drawActorSprite(actor, spriteKey, x, y, size, options = {}) {
    const animation = options.animation || {};
    const anim = getActorSpriteAnimation(actor, size, animation);
    const frameKey = getActorSpriteFrameKey(spriteKey, actor, animation);
    drawSpriteFrame(frameKey, x, y, size, {
      ...options,
      ...anim,
      animation: undefined,
    });
  }

  function drawPlayerCorpseAnim(anim) {
    const t = Neo.clamp(anim.timer / anim.duration, 0, 1);
    const fallEase = 1 - (1 - Math.min(t * 1.6, 1)) ** 3;
    const size = Math.max(34, anim.r * 2.5);
    const frame = Neo.SPRITE_ATLAS.frames[anim.spriteKey] || Neo.SPRITE_ATLAS.frames.thorn_knight;
    if (!frame) return;

    const fallAngle = (anim.facing < 0 ? -1 : 1) * (Math.PI / 2) * fallEase;
    const squash = 1 - 0.46 * fallEase;

    Neo.ctx.save();
    Neo.ctx.translate(anim.x, anim.y);

    const poolAlpha = Neo.clamp((t - 0.3) / 0.4, 0, 1);
    if (poolAlpha > 0) {
      Neo.ctx.fillStyle = `rgba(94,0,16,${0.45 * poolAlpha})`;
      Neo.ctx.beginPath();
      Neo.ctx.ellipse(0, size * 0.28, size * (0.32 + poolAlpha * 0.12), size * (0.08 + poolAlpha * 0.04), fallAngle * 0.2, 0, Math.PI * 2);
      Neo.ctx.fill();
    }

    Neo.ctx.rotate(fallAngle);
    if (anim.facing < 0) Neo.ctx.scale(-1, 1);
    Neo.ctx.scale(1 + 0.05 * fallEase, squash);
    Neo.ctx.globalAlpha = 1;
    Neo.ctx.imageSmoothingEnabled = false;
    Neo.ctx.shadowColor = 'rgba(180,0,0,0.55)';
    Neo.ctx.shadowBlur = 14 + fallEase * 10;
    Neo.ctx.drawImage(
      Neo.SPRITE_ATLAS.canvas,
      frame.x, frame.y, frame.w, frame.h,
      -size / 2, -size / 2, size, size,
    );
    Neo.ctx.globalCompositeOperation = 'source-atop';
    Neo.ctx.fillStyle = `rgba(48,12,18,${0.15 + fallEase * 0.45})`;
    Neo.ctx.fillRect(-size / 2, -size / 2, size, size);
    Neo.ctx.restore();
  }

  // Trace a rounded, organic "blood pool" edge that creeps inward from one side
  // of the screen. The inner boundary is a chain of quadratic curves with
  // deterministic bulges (seeded per-edge so it's stable across frames, not
  // jittery), giving the wet-rounded look of pooling blood rather than a flat
  // rectangular bar. `depth` is how far the blood has crept in (px); `axis` is
  // 'top'|'bottom'|'left'|'right'. The path is left open for the caller to fill.
  function traceBloodPoolEdge(ctx, w, h, axis, depth, seed) {
    const horizontal = axis === 'top' || axis === 'bottom';
    const span = horizontal ? w : h;
    // Lobe count scales with screen span so bulges stay a consistent size.
    const lobes = Math.max(4, Math.round(span / 140));
    const step = span / lobes;
    // Map a position `u` along the edge + inward offset `d` into screen coords,
    // so the same curve logic serves all four sides.
    const toXY = (u, d) => {
      switch (axis) {
        case 'top': return [u, d];
        case 'bottom': return [u, h - d];
        case 'left': return [d, u];
        default: return [w - d, u]; // right
      }
    };
    const start = toXY(0, 0);
    ctx.moveTo(start[0], start[1]);
    ctx.lineTo(...toXY(span, 0));
    ctx.lineTo(...toXY(span, depth));
    // Walk back along the inner edge, drawing a rounded lobe per segment.
    for (let i = lobes; i > 0; i -= 1) {
      const u0 = i * step;
      const u1 = (i - 1) * step;
      const mid = (u0 + u1) / 2;
      // Deterministic per-lobe wobble: alternating bulge depth + a seeded ripple.
      const wob = 0.55 + 0.45 * Math.sin(seed + i * 1.7);
      const bulge = depth * (0.55 + 0.65 * wob);
      const cp = toXY(mid, bulge);
      const end = toXY(u1, depth * (0.7 + 0.3 * Math.sin(seed + i * 0.9)));
      ctx.quadraticCurveTo(cp[0], cp[1], end[0], end[1]);
    }
    ctx.lineTo(...toXY(0, 0));
    ctx.closePath();
  }

  function drawDeathOverlay(anim) {
    const t = Neo.clamp(anim.timer / anim.duration, 0, 1);
    const fadeIn = Neo.clamp(t * 2, 0, 1);
    const vignetteAlpha = Neo.clamp(t * 0.85, 0, 0.82);
    const w = Neo.canvas.width;
    const h = Neo.canvas.height;

    const grad = Neo.ctx.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, h * 0.72);
    grad.addColorStop(0, `rgba(0,0,0,0)`);
    grad.addColorStop(1, `rgba(12,0,0,${vignetteAlpha})`);
    Neo.ctx.fillStyle = grad;
    Neo.ctx.fillRect(0, 0, w, h);

    const edgeAlpha = Neo.clamp(t * 0.7, 0, 0.62);
    const edgeSize = Math.min(w, h) * 0.28;
    Neo.ctx.fillStyle = `rgba(140,0,0,${edgeAlpha})`;
    Neo.ctx.shadowColor = 'rgba(80,0,0,0.5)';
    Neo.ctx.shadowBlur = edgeSize * 0.12;
    // Blood creeps inward as the death animation plays.
    const creep = Neo.clamp(t * 1.4, 0, 1);
    Neo.ctx.beginPath();
    traceBloodPoolEdge(Neo.ctx, w, h, 'top', edgeSize * 0.35 * creep, 0.7);
    traceBloodPoolEdge(Neo.ctx, w, h, 'bottom', edgeSize * 0.35 * creep, 2.3);
    traceBloodPoolEdge(Neo.ctx, w, h, 'left', edgeSize * 0.28 * creep, 4.1);
    traceBloodPoolEdge(Neo.ctx, w, h, 'right', edgeSize * 0.28 * creep, 5.6);
    Neo.ctx.fill();
    Neo.ctx.shadowBlur = 0;

    if (t > 0.55) {
      const textAlpha = Neo.clamp((t - 0.55) / 0.35, 0, 1);
      Neo.ctx.save();
      Neo.ctx.globalAlpha = textAlpha;
      Neo.ctx.font = `bold ${Math.round(h * 0.072)}px system-ui`;
      Neo.ctx.textAlign = 'center';
      Neo.ctx.textBaseline = 'middle';
      Neo.ctx.shadowColor = '#ff0020';
      Neo.ctx.shadowBlur = 32;
      Neo.ctx.fillStyle = '#fff0f0';
      Neo.ctx.fillText('YOU DIED', w / 2, h * 0.42);
      Neo.ctx.font = `${Math.round(h * 0.028)}px system-ui`;
      Neo.ctx.shadowBlur = 12;
      Neo.ctx.fillStyle = `rgba(255,200,200,${textAlpha * 0.85})`;
      Neo.ctx.fillText('Loading results...', w / 2, h * 0.42 + h * 0.072 * 0.9);
      Neo.ctx.restore();
    }

    void fadeIn;
  }

  function drawPlayer() {
    if (!Neo.player) return;
    const aimAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    const facing = getFacingDirection(Neo.player, aimAngle);
    const shadowColor = Neo.godTimer > 0 ? 'rgba(255,248,210,0.65)' : 'rgba(0,0,0,0.25)';
    const _reduceFlash = window.NeoSettings?.getAccess()?.reduceFlash;
    const capeActive = Number(Neo.player?.equipmentEffects?.el_bartos_cape?.time || 0) > 0;
    let playerRingIndex = 0;
    for (let s = 0; s < Neo.STATUS_KEYS.length; s += 1) {
      const key = Neo.STATUS_KEYS[s];
      if (Neo.getStatusStacks(Neo.player, key) <= 0) continue;
      const style = Neo.STATUS_STYLES[key];
      Neo.ctx.save();
      Neo.ctx.translate(Neo.player.x, Neo.player.y);
      Neo.ctx.strokeStyle = style.color;
      Neo.ctx.lineWidth = 2;
      Neo.ctx.shadowColor = style.color;
      Neo.ctx.shadowBlur = 10;
      Neo.ctx.beginPath();
      Neo.ctx.arc(0, 0, Neo.player.r + 6 + playerRingIndex * 4 + (_reduceFlash ? 0 : Math.sin(Date.now() / (160 + playerRingIndex * 40)) * 2), 0, Math.PI * 2);
      Neo.ctx.stroke();
      Neo.ctx.restore();
      playerRingIndex += 1;
    }
    drawWarpPreview();
    if (Number(Neo.player.overhealBarrier || 0) > 0) {
      const barrierColor = Neo.player.overhealBarrierColor || '#9cefff';
      const barrierMax = Math.max(Number(Neo.player.overhealBarrier || 0), Number(Neo.player.overhealBarrierMax) || 0, 1);
      const barrierPct = Neo.clamp(Number(Neo.player.overhealBarrier || 0) / barrierMax, 0, 1);
      const pulse = _reduceFlash ? 0 : Math.sin(Date.now() / 180) * 2;
      const radius = Neo.player.r + 12 + pulse;
      Neo.ctx.save();
      Neo.ctx.translate(Neo.player.x, Neo.player.y);
      Neo.ctx.rotate(Math.PI / 4);
      Neo.ctx.strokeStyle = barrierColor;
      Neo.ctx.lineWidth = 2.5;
      Neo.ctx.shadowColor = barrierColor;
      Neo.ctx.shadowBlur = 14;
      Neo.ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
      Neo.ctx.restore();
      Neo.ctx.save();
      Neo.ctx.translate(Neo.player.x, Neo.player.y);
      Neo.ctx.fillStyle = 'rgba(8, 15, 24, 0.74)';
      Neo.ctx.fillRect(-20, -Neo.player.r - 27, 40, 5);
      Neo.ctx.fillStyle = 'rgba(80, 215, 255, 0.24)';
      Neo.ctx.fillRect(-19, -Neo.player.r - 26, 38, 3);
      Neo.ctx.fillStyle = barrierColor;
      Neo.ctx.shadowColor = barrierColor;
      Neo.ctx.shadowBlur = 8;
      Neo.ctx.fillRect(-19, -Neo.player.r - 26, 38 * barrierPct, 3);
      Neo.ctx.restore();
    }
    const playerSpriteScale = Number(Neo.getItemStats?.()?.playerSpriteScale || 1);
    const playerSize = Math.max(34, Neo.player.r * 2.5) * playerSpriteScale;
    drawActorSprite(Neo.player, getPlayerSpriteKey(), Neo.player.x, Neo.player.y, playerSize, {
      alpha: capeActive ? 0.34 : (!_reduceFlash && (Neo.player.inv > 0 || Number(Neo.player.stun || 0) > 0)) ? 0.68 : 1,
      flipX: facing < 0,
      shadowColor,
      shadowBlur: Neo.godTimer > 0 ? 18 : 6,
      tint: Neo.godTimer > 0 ? 'rgba(255,245,220,0.6)' : null,
      animation: {
        maxSpeed: Neo.player.mooggyZoomiesTime > 0 ? 640 : Neo.player.princessFlightTime > 0 ? 420 : 260,
        stepRate: Neo.player.mooggyZoomiesTime > 0 ? 11 : 7.5,
        dashPulse: Neo.player.dashTime > 0 ? 1 : 0,
        actionPulse: getAttackPulse(Neo.player.swing, Neo.ATTACKS.melee.active),
        attackProgress: getAttackProgress(Neo.player.swing, Neo.ATTACKS.melee.active),
        castPulse: Neo.laserActive || Neo.player.weaponBeamTime > 0 ? 0.32 : 0,
        seedKey: 'player',
      },
    });
    drawStunStars(Neo.player, Neo.player.y);
    drawEnemyStatusIconRow(Neo.player, Neo.player.y);
    Neo.ctx.save();
    Neo.ctx.translate(Neo.player.x, Neo.player.y);
    Neo.ctx.strokeStyle = '#f5f1e8';
    Neo.ctx.lineWidth = 2;
    Neo.ctx.beginPath();
    Neo.ctx.moveTo(Math.cos(aimAngle) * 6, Math.sin(aimAngle) * 6);
    Neo.ctx.lineTo(Math.cos(aimAngle) * 20, Math.sin(aimAngle) * 20);
    Neo.ctx.stroke();
    const equippedWeapon = Neo.getEquippedWeapon();
    const extendingStaffEquipped = equippedWeapon === 'extending_staff';
    if (extendingStaffEquipped) {
      const previewRange = 130;
      const previewArc = 1.45;
      const previewX = Math.cos(aimAngle) * previewRange;
      const previewY = Math.sin(aimAngle) * previewRange;
      Neo.ctx.globalAlpha = 0.32;
      Neo.ctx.strokeStyle = '#ff6666';
      Neo.ctx.lineWidth = 2;
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(Math.cos(aimAngle) * 18, Math.sin(aimAngle) * 18);
      Neo.ctx.lineTo(previewX, previewY);
      Neo.ctx.stroke();
      Neo.ctx.globalAlpha = 0.18;
      Neo.ctx.beginPath();
      Neo.ctx.arc(0, 0, previewRange, aimAngle - previewArc, aimAngle + previewArc);
      Neo.ctx.stroke();
      Neo.ctx.globalAlpha = 0.55;
      Neo.ctx.fillStyle = '#ff3333';
      Neo.ctx.beginPath();
      Neo.ctx.arc(previewX, previewY, 4, 0, Math.PI * 2);
      Neo.ctx.fill();
    }
    if (Neo.player.swing > 0 && Neo.player.stabSwing) {
      // Jab: a straight forward thrust that lunges out and snaps back, instead
      // of the sweeping arc used by swipes.
      const swingTotal = Neo.ATTACKS.melee.active;
      const t = 1 - (Neo.player.swing / swingTotal);
      // Ease out then back in so the tip punches forward and recoils.
      const lunge = Math.sin(Math.min(1, t) * Math.PI);
      const reach = 30 + lunge * 60;
      const fade = 0.9 * (Neo.player.swing / swingTotal);
      const stabColor = Neo.godTimer > 0 ? '#f6e8c8' : '#bfe4ff';
      const cos = Math.cos(Neo.player.swingA);
      const sin = Math.sin(Neo.player.swingA);
      // Glow shaft
      Neo.ctx.globalAlpha = fade * 0.4;
      Neo.ctx.strokeStyle = stabColor;
      Neo.ctx.lineWidth = 9;
      Neo.ctx.shadowColor = stabColor;
      Neo.ctx.shadowBlur = 16;
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(cos * 12, sin * 12);
      Neo.ctx.lineTo(cos * reach, sin * reach);
      Neo.ctx.stroke();
      // Sharp core
      Neo.ctx.globalAlpha = fade;
      Neo.ctx.strokeStyle = '#ffffff';
      Neo.ctx.lineWidth = 2.5;
      Neo.ctx.shadowBlur = 6;
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(cos * 12, sin * 12);
      Neo.ctx.lineTo(cos * reach, sin * reach);
      Neo.ctx.stroke();
      // Spear tip
      Neo.ctx.globalAlpha = fade;
      Neo.ctx.fillStyle = stabColor;
      Neo.ctx.shadowBlur = 8;
      const tipX = cos * reach;
      const tipY = sin * reach;
      const perpX = -sin;
      const perpY = cos;
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(tipX + cos * 10, tipY + sin * 10);
      Neo.ctx.lineTo(tipX + perpX * 5, tipY + perpY * 5);
      Neo.ctx.lineTo(tipX - perpX * 5, tipY - perpY * 5);
      Neo.ctx.closePath();
      Neo.ctx.fill();
      Neo.ctx.shadowBlur = 0;
    } else if (Neo.player.swing > 0) {
      const swingRange = extendingStaffEquipped ? 130 : 55;
      const swingArc = extendingStaffEquipped ? 1.45 : Neo.ATTACKS.melee.arc;
      const swingTotal = Neo.ATTACKS.melee.active;
      const swingProgress = 1 - (Neo.player.swing / swingTotal);
      // Sweep right-to-left: arc starts at swingA+arc and sweeps to swingA-arc
      const sweepStart = Neo.player.swingA + swingArc;
      const sweepEnd = Neo.player.swingA - swingArc;
      const currentTip = sweepStart + (sweepEnd - sweepStart) * swingProgress;
      const trailLength = swingArc * 0.55;
      const trailStart = currentTip + trailLength;
      const fadeAlpha = 0.9 * (Neo.player.swing / swingTotal);
      const slashColor = extendingStaffEquipped ? '#ff3333' : Neo.godTimer > 0 ? '#f6e8c8' : '#d86d87';
      // Glow outer trail
      Neo.ctx.globalAlpha = fadeAlpha * 0.35;
      Neo.ctx.strokeStyle = slashColor;
      Neo.ctx.lineWidth = extendingStaffEquipped ? 14 : 10;
      Neo.ctx.shadowColor = slashColor;
      Neo.ctx.shadowBlur = 16;
      Neo.ctx.beginPath();
      Neo.ctx.arc(0, 0, swingRange, trailStart, currentTip, true);
      Neo.ctx.stroke();
      // Main sharp edge
      Neo.ctx.globalAlpha = fadeAlpha;
      Neo.ctx.strokeStyle = slashColor;
      Neo.ctx.lineWidth = extendingStaffEquipped ? 5 : 3;
      Neo.ctx.shadowBlur = 8;
      Neo.ctx.beginPath();
      Neo.ctx.arc(0, 0, swingRange, trailStart, currentTip, true);
      Neo.ctx.stroke();
      // Bright tip streak
      Neo.ctx.globalAlpha = fadeAlpha * 0.9;
      Neo.ctx.strokeStyle = '#ffffff';
      Neo.ctx.lineWidth = extendingStaffEquipped ? 2 : 1.5;
      Neo.ctx.shadowBlur = 4;
      Neo.ctx.beginPath();
      Neo.ctx.arc(0, 0, swingRange, currentTip + 0.12, currentTip, true);
      Neo.ctx.stroke();
      Neo.ctx.shadowBlur = 0;
      if (extendingStaffEquipped) {
        Neo.ctx.globalAlpha = 0.12 * fadeAlpha;
        Neo.ctx.fillStyle = '#eaf4ff';
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(0, 0);
        Neo.ctx.arc(0, 0, swingRange, trailStart, currentTip, true);
        Neo.ctx.closePath();
        Neo.ctx.fill();
      }
    }
    Neo.ctx.restore();
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
    const spriteKey = Neo.SPRITE_DEFS[charKey] ? charKey : 'thorn_knight';
    drawActorSprite(pn, spriteKey, pn.x, pn.y, Math.max(34, pn.r * 2.5), {
      alpha: pn.inv > 0 ? 0.55 : 1,
      flipX: facing < 0,
      shadowColor: hexToRgba(tintColor, 0.45),
      shadowBlur: 10,
      tint: hexToRgba(tintColor, 0.25),
      animation: {
        maxSpeed: 260,
        stepRate: 7.5,
        dashPulse: pn.dashTime > 0 ? 1 : 0,
        actionPulse: getAttackPulse(pn.swing, Neo.ATTACKS.melee.active),
        attackProgress: getAttackProgress(pn.swing, Neo.ATTACKS.melee.active),
        seedKey: label || charKey,
      },
    });
    Neo.ctx.save();
    Neo.ctx.translate(pn.x, pn.y);
    Neo.ctx.strokeStyle = tintColor;
    Neo.ctx.lineWidth = 2;
    Neo.ctx.beginPath();
    Neo.ctx.moveTo(Math.cos(aimAngle) * 6, Math.sin(aimAngle) * 6);
    Neo.ctx.lineTo(Math.cos(aimAngle) * 20, Math.sin(aimAngle) * 20);
    Neo.ctx.stroke();
    Neo.ctx.restore();
    Neo.ctx.save();
    Neo.ctx.fillStyle = tintColor;
    Neo.ctx.font = 'bold 11px monospace';
    Neo.ctx.textAlign = 'center';
    Neo.ctx.fillText(label, pn.x, pn.y - pn.r - 6);
    Neo.ctx.restore();
  }

  function drawPlayer2() {
    drawPlayerSlot(Neo.PLAYER_SLOT_CONFIG[1]);
  }

  function drawPlayerN(pn, charKey, tintColor, label) {
    const slot = Neo.getSlotByEntity(pn) || {
      getEntity: () => pn,
      getCharacter: () => charKey,
      color: tintColor,
      label,
    };
    drawPlayerSlot(slot);
  }

  function drawPlayerLaser() {
    if (!Neo.player) return;
    const beamWidthMultiplier = Number(Neo.getItemStats?.()?.beamWidthMultiplier || 1);

    // Draw Laser Glasses weapon beams (two beams, ±0.2 spread)
    if (!Neo.laserActive && Neo.getEquippedWeapon() === 'lazer_glasses' && Neo.player.weaponBeamTime > 0) {
      const baseAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      const alpha = Math.min(1, Neo.player.weaponBeamTime / 0.3);
      const dragonOrbStacks = Math.max(0, Number(Neo.getItemCount?.('dragon_orb') || 0));
      const outerPulse = dragonOrbStacks > 0 ? 1 + Math.sin(Number(Neo.frameId || 0) * 0.42) * 0.12 : 1;
      const glassesWidth = 5 * beamWidthMultiplier;
      const dragonOuterW = glassesWidth + Math.min(18, dragonOrbStacks * 3.5) * outerPulse;
      Neo.ctx.save();
      Neo.ctx.globalAlpha = alpha;
      for (let beamIndex = 0; beamIndex < 2; beamIndex += 1) {
        const offset = beamIndex === 0 ? -0.2 : 0.2;
        const beamAngle = baseAngle + offset;
        const beamPath = Neo.buildRicochetBeamPath(Neo.player.x, Neo.player.y, beamAngle, 430, Neo.LAZER_GLASSES_BOUNCES);
        if (dragonOrbStacks > 0) {
          Neo.drawTaperedBeamPath(beamPath, {
            color: '#b77dff',
            glow: '#b77dff',
            maxWidth: dragonOuterW,
            shadowBlur: 22,
            alpha: Math.min(0.58, 0.25 + dragonOrbStacks * 0.08),
          });
        }
        Neo.drawTaperedBeamPath(beamPath, {
          color: '#cda8ff',
          glow: '#e0c8ff',
          maxWidth: glassesWidth,
          shadowBlur: 16,
        });
        // Tip burst
        if (Neo.rng() < 0.35) {
          const end = Neo.getBeamPathEnd(beamPath);
          Neo.spawnParticle({ x: end.x + (Neo.rng() - 0.5) * 5, y: end.y + (Neo.rng() - 0.5) * 5, life: 0.1 + Neo.rng() * 0.08, vx: (Neo.rng() - 0.5) * 35, vy: (Neo.rng() - 0.5) * 35, c: '#cda8ff' });
        }
      }
      Neo.ctx.restore();
      Neo.ctx.shadowBlur = 0;
      Neo.ctx.globalAlpha = 1;
      return;
    }

    if (!Neo.laserActive) return;
    const angle = Neo.laserAngle;
    const turtleWaveActive = Neo.laserMode === 'turtle_wave';
    const loveBeamActive = Neo.loveBeamCasting;
    const beamRange = Neo.getPlayerBeamRange(Neo.laserMode, Neo.getEquippedMove('laser'));
    const beamPath = Neo.buildRicochetBeamPath(Neo.player.x, Neo.player.y, angle, beamRange, Neo.getPlayerBeamBounceCount(Neo.laserMode));
    if (!beamPath.length) return;
    const beamColor = turtleWaveActive ? '#74f5ff' : loveBeamActive ? '#ff9ed6' : Neo.laserMode === 'god_sweep' ? '#ffffff' : '#ff00aa';
    const beamGlow = turtleWaveActive ? '#9bf7ff' : loveBeamActive ? '#ffd1ea' : Neo.laserMode === 'god_sweep' ? '#e8f0ff' : '#f0f';
    const maxW = (Neo.laserMode === 'god_sweep' ? 16 : turtleWaveActive ? 18 : loveBeamActive ? 10 : 8)
      * beamWidthMultiplier;
    const dragonOrbStacks = Math.max(0, Number(Neo.getItemCount?.('dragon_orb') || 0));
    const outerPulse = dragonOrbStacks > 0 ? 1 + Math.sin(Number(Neo.frameId || 0) * 0.42) * 0.12 : 1;
    const dragonOuterW = dragonOrbStacks > 0
      ? maxW + Math.min(22, dragonOrbStacks * 4.5) * outerPulse
      : 0;

    if (dragonOrbStacks > 0) {
      Neo.drawTaperedBeamPath(beamPath, {
        color: loveBeamActive ? '#ffb4ea' : turtleWaveActive ? '#a8fbff' : '#b77dff',
        glow: '#b77dff',
        maxWidth: dragonOuterW,
        shadowBlur: Neo.laserMode === 'god_sweep' || turtleWaveActive ? 34 : 24,
        alpha: Math.min(0.58, 0.25 + dragonOrbStacks * 0.08),
      });
    }

    Neo.drawTaperedBeamPath(beamPath, {
      color: beamColor,
      glow: beamGlow,
      maxWidth: maxW,
      shadowBlur: Neo.laserMode === 'god_sweep' ? 26 : turtleWaveActive ? 30 : loveBeamActive ? 22 : 18,
    });

    // Beam particles: small dots that drift perpendicular and fade toward tip
    if (Neo.rng() < 0.55) {
      const sample = Neo.sampleBeamPath(beamPath, Neo.rng());
      if (sample) {
        const taper = 1 - sample.t * sample.t;
        const spread = maxW * taper * 0.7;
        const px = sample.x + sample.nx * (Neo.rng() - 0.5) * spread * 2;
        const py = sample.y + sample.ny * (Neo.rng() - 0.5) * spread * 2;
        const perpSpeed = (Neo.rng() - 0.5) * 28;
        const forwardSpeed = -Neo.rng() * 18;
        Neo.spawnParticle({
          x: px, y: py,
          life: 0.18 + Neo.rng() * 0.12,
          vx: sample.nx * perpSpeed + sample.dx * forwardSpeed,
          vy: sample.ny * perpSpeed + sample.dy * forwardSpeed,
          c: beamColor,
        });
      }
    }
    // Tip burst particles at beam end
    if (Neo.rng() < 0.4) {
      const end = Neo.getBeamPathEnd(beamPath);
      const tipPx = end.x + (Neo.rng() - 0.5) * 6;
      const tipPy = end.y + (Neo.rng() - 0.5) * 6;
      Neo.spawnParticle({
        x: tipPx, y: tipPy,
        life: 0.12 + Neo.rng() * 0.1,
        vx: (Neo.rng() - 0.5) * 40,
        vy: (Neo.rng() - 0.5) * 40,
        c: beamColor,
      });
    }
    Neo.ctx.shadowBlur = 0;
    Neo.ctx.globalAlpha = 1;
  }

  // Expose on Neo
  Neo.buildSpriteAtlas = buildSpriteAtlas;
  Neo.getEnemySpriteKey = getEnemySpriteKey;
  Neo.getPlayerSpriteKey = getPlayerSpriteKey;
  Neo.getFacingDirection = getFacingDirection;
  Neo.getActorSpriteFrameKey = getActorSpriteFrameKey;
  Neo.getActorSpriteAnimation = getActorSpriteAnimation;
  Neo.drawWarpPreview = drawWarpPreview;
  Neo.drawSpriteFrame = drawSpriteFrame;
  Neo.drawSpriteToCanvas = drawSpriteToCanvas;
  Neo.drawEnemyTelegraphs = drawEnemyTelegraphs;
  Neo.drawBleedOverlay = drawBleedOverlay;
  Neo.drawStatusIcon = drawStatusIcon;
  Neo.drawStatusIconBadge = drawStatusIconBadge;
  Neo.drawEnemyStatusIconRow = drawEnemyStatusIconRow;
  Neo.drawStunStars = drawStunStars;
  Neo.drawEnemyLostSightMark = drawEnemyLostSightMark;
  Neo.drawStatusBadge = drawStatusBadge;
  Neo.drawSpawnPortal = drawSpawnPortal;
  Neo.drawEnemies = drawEnemies;
  Neo.drawPlayerCorpseAnim = drawPlayerCorpseAnim;
  Neo.drawDeathOverlay = drawDeathOverlay;
  Neo.drawPlayer = drawPlayer;
  Neo.hexToRgba = hexToRgba;
  Neo.drawPlayerSlot = drawPlayerSlot;
  Neo.drawPlayer2 = drawPlayer2;
  Neo.drawPlayerN = drawPlayerN;
  Neo.drawPlayerLaser = drawPlayerLaser;
