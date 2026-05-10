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

