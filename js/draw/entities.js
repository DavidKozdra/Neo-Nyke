// entities.js — standalone IIFE. Sprite atlas, player/enemy drawing.
  function buildSpriteAtlas() {
    const keys = Object.keys(Neo.SPRITE_DEFS);
    const GUTTER = 1;
    const STRIDE = Neo.SPRITE_SOURCE_SIZE + GUTTER;
    const canvasEl = document.createElement('canvas');
    canvasEl.width = STRIDE * keys.length;
    canvasEl.height = Neo.SPRITE_SOURCE_SIZE;
    const atlasCtx = canvasEl.getContext('2d');
    atlasCtx.imageSmoothingEnabled = false;
    const frames = {};
    keys.forEach((key, index) => {
      const def = Neo.SPRITE_DEFS[key];
      const ox = index * STRIDE;
      frames[key] = { x: ox, y: 0, w: Neo.SPRITE_SOURCE_SIZE, h: Neo.SPRITE_SOURCE_SIZE };
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

    Neo.ctx.globalAlpha = 0.74;
    Neo.ctx.fillStyle = '#ffffff';
    Neo.ctx.beginPath();
    Neo.ctx.arc(landing.x, landing.y, 3.5, 0, Math.PI * 2);
    Neo.ctx.fill();
    Neo.ctx.restore();
  }

  function drawSpriteFrame(spriteKey, x, y, size, options = {}) {
    const atlas = Neo.SPRITE_ATLAS;
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
    Neo.ctx.save();
    Neo.ctx.translate(x, y);
    if (flipX) Neo.ctx.scale(-1, 1);
    Neo.ctx.globalAlpha = alpha;
    Neo.ctx.fillStyle = 'rgba(0,0,0,0.24)';
    Neo.ctx.beginPath();
    Neo.ctx.ellipse(0, size * 0.3, size * 0.28, size * 0.11, 0, 0, Math.PI * 2);
    Neo.ctx.fill();
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
    Neo.enemies.forEach(enemy => {
      if (enemy.windup > 0) {
        Neo.ctx.save();
        Neo.ctx.translate(enemy.x, enemy.y);
        Neo.ctx.strokeStyle = (enemy.type === 'charger' || enemy.type === 'golem' || enemy.type === 'bulk_golem') ? '#ff8844' : '#aa66ff';
        Neo.ctx.lineWidth = 2;
        Neo.ctx.globalAlpha = 0.8;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, enemy.r + 10 + Math.sin(Date.now() / 120) * 2, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.restore();
      }
      if (enemy.beamTime > 0) {
        const range = enemy.type === 'god' ? (enemy.beamRange || 620) : enemy.type === 'mooggy' ? 520 : 430;
        const beamPath = Neo.buildRicochetBeamPath(enemy.x, enemy.y, enemy.beamAngle, range, Neo.getEnemyBeamBounceCount(enemy));
        Neo.strokeBeamPath(beamPath, {
          color: enemy.type === 'god' ? '#ffffff' : enemy.type === 'mooggy' ? '#ff3348' : '#aa66ff',
          width: enemy.type === 'god' && enemy.state === 'godSweep' ? 18 : enemy.type === 'god' ? 10 : enemy.type === 'mooggy' ? 5 : 7,
          shadowBlur: enemy.type === 'god' && enemy.state === 'godSweep' ? 24 : enemy.type === 'mooggy' ? 20 : 14,
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

    Neo.ctx.save();
    Neo.ctx.translate(enemy.x, enemy.y);
    const label = `BLEED x${stackCount}`;
    const y = enemy.type === 'rival' ? -enemy.r - 40 : -enemy.r - 32;
    Neo.ctx.font = 'bold 10px system-ui';
    Neo.ctx.textAlign = 'center';
    Neo.ctx.textBaseline = 'middle';
    const width = Math.max(50, Neo.ctx.measureText(label).width + 14);
    const height = 15;
    Neo.ctx.fillStyle = 'rgba(62, 0, 12, 0.86)';
    Neo.ctx.strokeStyle = '#ff4f6d';
    Neo.ctx.lineWidth = 1;
    Neo.ctx.shadowColor = '#ff2445';
    Neo.ctx.shadowBlur = 8 + flash * 8;
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(-width / 2, y, width, height, 5);
    Neo.ctx.fill();
    Neo.ctx.stroke();
    Neo.ctx.shadowBlur = 0;
    Neo.ctx.fillStyle = '#ffe3e7';
    Neo.ctx.fillText(label, 0, y + height / 2 + 0.5);
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
      const activeStatuses = Neo.STATUS_KEYS.filter(key => Neo.getStatusStacks(enemy, key) > 0);
      if (activeStatuses.length > 0) {
        Neo.ctx.save();
        Neo.ctx.translate(enemy.x, drawY);
        Neo.ctx.lineWidth = 2;
        activeStatuses.forEach((key, index) => {
          const style = Neo.STATUS_STYLES[key];
          Neo.ctx.strokeStyle = style.color;
          Neo.ctx.shadowColor = style.color;
          Neo.ctx.shadowBlur = 10;
          Neo.ctx.beginPath();
          Neo.ctx.arc(0, 0, enemy.r + 6 + index * 4 + (_reduceFlash ? 0 : Math.sin(_now / (180 + index * 40)) * 2), 0, Math.PI * 2);
          Neo.ctx.stroke();
        });
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
      Neo.ctx.save();
      Neo.ctx.translate(enemy.x, drawY);
      Neo.ctx.scale(scale, scale);
      drawSpriteFrame(spriteKey, 0, 0, drawSize, {
        alpha: enemy.stun > 0 ? 0.68 : 1,
        flipX: facing < 0,
        shadowColor: enemy.type === 'mooggy' ? 'rgba(255,30,52,0.55)' : enemy.elite || enemy.type === 'god' ? 'rgba(255,244,180,0.45)' : 'rgba(0,0,0,0.18)',
        shadowBlur: enemy.type === 'mooggy' ? 16 : enemy.type === 'god' ? 14 : enemy.elite ? 10 : 4,
        tint: flash ? 'rgba(255,255,180,0.55)' : (enemy.elite ? 'rgba(255,210,96,0.7)' : null),
      });
      Neo.ctx.restore();
      if (bleedStacks > 0) drawBleedOverlay(enemy, bleedStacks);
      const badgeBaseY = enemy.type === 'rival' ? -enemy.r - 40 : -enemy.r - 32;
      let badgeOffset = bleedStacks > 0 ? 18 : 0;
      const fireStacks = Neo.getStatusStacks(enemy, 'fire');
      const poisonStacks = Neo.getStatusStacks(enemy, 'poison');
      const darkStacks = Neo.getStatusStacks(enemy, 'dark_drain');
      if (fireStacks > 0 || poisonStacks > 0 || darkStacks > 0) {
        Neo.ctx.save();
        Neo.ctx.font = 'bold 10px system-ui';
        Neo.ctx.textAlign = 'center';
        Neo.ctx.textBaseline = 'middle';
        Neo.ctx.lineWidth = 1;
        if (fireStacks > 0) {
          drawStatusBadge(enemy, `FIRE x${fireStacks}`, 'rgba(62,22,0,0.86)', Neo.STATUS_STYLES.fire.color, '#ffe5c0', badgeBaseY + badgeOffset);
          badgeOffset += 18;
        }
        if (poisonStacks > 0) {
          drawStatusBadge(enemy, `POISON x${poisonStacks}`, 'rgba(10,38,0,0.86)', Neo.STATUS_STYLES.poison.color, '#d8ffc0', badgeBaseY + badgeOffset);
          badgeOffset += 18;
        }
        if (darkStacks > 0) {
          drawStatusBadge(enemy, `DRAIN x${darkStacks}`, 'rgba(20,8,48,0.86)', Neo.STATUS_STYLES.dark_drain.color, '#e8d8ff', badgeBaseY + badgeOffset);
        }
        Neo.ctx.restore();
      }
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
      const _levelStr = `Lv.${Neo.floor}`;
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
    Neo.ctx.fillRect(0, 0, w, edgeSize * 0.35);
    Neo.ctx.fillRect(0, h - edgeSize * 0.35, w, edgeSize * 0.35);
    Neo.ctx.fillRect(0, 0, edgeSize * 0.28, h);
    Neo.ctx.fillRect(w - edgeSize * 0.28, 0, edgeSize * 0.28, h);

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
    Neo.STATUS_KEYS.filter(key => Neo.getStatusStacks(Neo.player, key) > 0).forEach((key, index) => {
      const style = Neo.STATUS_STYLES[key];
      Neo.ctx.save();
      Neo.ctx.translate(Neo.player.x, Neo.player.y);
      Neo.ctx.strokeStyle = style.color;
      Neo.ctx.lineWidth = 2;
      Neo.ctx.shadowColor = style.color;
      Neo.ctx.shadowBlur = 10;
      Neo.ctx.beginPath();
      Neo.ctx.arc(0, 0, Neo.player.r + 6 + index * 4 + (_reduceFlash ? 0 : Math.sin(Date.now() / (160 + index * 40)) * 2), 0, Math.PI * 2);
      Neo.ctx.stroke();
      Neo.ctx.restore();
    });
    drawWarpPreview();
    drawSpriteFrame(getPlayerSpriteKey(), Neo.player.x, Neo.player.y, Math.max(34, Neo.player.r * 2.5), {
      alpha: (!_reduceFlash && (Neo.player.inv > 0 || Number(Neo.player.stun || 0) > 0)) ? 0.68 : 1,
      flipX: facing < 0,
      shadowColor,
      shadowBlur: Neo.godTimer > 0 ? 18 : 6,
      tint: Neo.godTimer > 0 ? 'rgba(255,245,220,0.6)' : null,
    });
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
    if (Neo.player.swing > 0) {
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
    drawSpriteFrame(spriteKey, pn.x, pn.y, Math.max(34, pn.r * 2.5), {
      alpha: pn.inv > 0 ? 0.55 : 1,
      flipX: facing < 0,
      shadowColor: hexToRgba(tintColor, 0.45),
      shadowBlur: 10,
      tint: hexToRgba(tintColor, 0.25),
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

    // Draw Laser Glasses weapon beams (two beams, ±0.2 spread)
    if (!Neo.laserActive && Neo.getEquippedWeapon() === 'lazer_glasses' && Neo.player.weaponBeamTime > 0) {
      const baseAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      const alpha = Math.min(1, Neo.player.weaponBeamTime / 0.3);
      Neo.ctx.save();
      Neo.ctx.globalAlpha = alpha;
      [-0.2, 0.2].forEach(offset => {
        const beamAngle = baseAngle + offset;
        const beamPath = Neo.buildRicochetBeamPath(Neo.player.x, Neo.player.y, beamAngle, 430, Neo.LAZER_GLASSES_BOUNCES);
        Neo.drawTaperedBeamPath(beamPath, {
          color: '#cda8ff',
          glow: '#e0c8ff',
          maxWidth: 5,
          shadowBlur: 16,
        });
        // Tip burst
        if (Neo.rng() < 0.35) {
          const end = Neo.getBeamPathEnd(beamPath);
          Neo.spawnParticle({ x: end.x + (Neo.rng() - 0.5) * 5, y: end.y + (Neo.rng() - 0.5) * 5, life: 0.1 + Neo.rng() * 0.08, vx: (Neo.rng() - 0.5) * 35, vy: (Neo.rng() - 0.5) * 35, c: '#cda8ff' });
        }
      });
      Neo.ctx.restore();
      Neo.ctx.shadowBlur = 0;
      Neo.ctx.globalAlpha = 1;
      return;
    }

    if (!Neo.laserActive) return;
    const angle = Neo.laserMode === 'god_sweep'
      ? Neo.laserAngle
      : Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    const turtleWaveActive = Neo.laserMode === 'turtle_wave';
    const loveBeamActive = Neo.loveBeamCasting;
    const beamRange = Neo.getPlayerBeamRange(Neo.laserMode, Neo.getEquippedMove('laser'));
    const beamPath = Neo.buildRicochetBeamPath(Neo.player.x, Neo.player.y, angle, beamRange, Neo.getPlayerBeamBounceCount(Neo.laserMode));
    if (!beamPath.length) return;
    const beamColor = turtleWaveActive ? '#74f5ff' : loveBeamActive ? '#ff9ed6' : Neo.laserMode === 'god_sweep' ? '#ffffff' : '#ff00aa';
    const beamGlow = turtleWaveActive ? '#9bf7ff' : loveBeamActive ? '#ffd1ea' : Neo.laserMode === 'god_sweep' ? '#e8f0ff' : '#f0f';
    const maxW = Neo.laserMode === 'god_sweep' ? 16 : turtleWaveActive ? 18 : loveBeamActive ? 10 : 8;

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
  Neo.drawWarpPreview = drawWarpPreview;
  Neo.drawSpriteFrame = drawSpriteFrame;
  Neo.drawSpriteToCanvas = drawSpriteToCanvas;
  Neo.drawEnemyTelegraphs = drawEnemyTelegraphs;
  Neo.drawBleedOverlay = drawBleedOverlay;
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
