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

