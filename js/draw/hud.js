// draw/hud.js — standalone IIFE. HUD canvas drawing (particles, minimap, boss bars, transitions, action icons).
  function drawParticles() {
    Neo.particles.forEach(particle => {
      if (particle.line) {
        const line = particle.line;
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const segs = Math.max(4, line.seg || 6);
        const jitter = (line.jag || 12) * (0.65 + particle.life * 0.55);
        const phase = (line.phase || 0) + particle.life * 22;

        // Compute segment offsets once; reuse for both stroke passes.
        const pts = new Float32Array(segs * 2);
        for (let index = 1; index < segs; index += 1) {
          const t = index / segs;
          const wave = Math.sin((t * 18) + phase + index * 0.9);
          const off = wave * jitter * (index % 2 === 0 ? 1 : -1);
          pts[(index - 1) * 2]     = line.x1 + dx * t + nx * off;
          pts[(index - 1) * 2 + 1] = line.y1 + dy * t + ny * off;
        }

        Neo.ctx.save();
        Neo.ctx.globalAlpha = Math.min(1, particle.life * 2.1);
        Neo.ctx.shadowColor = particle.c || '#dfe8ff';

        // Outer glow pass
        Neo.ctx.strokeStyle = particle.c || '#dfe8ff';
        Neo.ctx.lineWidth = (line.w || 4.5) + 3;
        Neo.ctx.shadowBlur = 18;
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(line.x1, line.y1);
        for (let index = 1; index < segs; index += 1) {
          Neo.ctx.lineTo(pts[(index - 1) * 2], pts[(index - 1) * 2 + 1]);
        }
        Neo.ctx.lineTo(line.x2, line.y2);
        Neo.ctx.stroke();

        // Inner highlight pass — displace 35% as much as the outer pass.
        // pts stores the fully-displaced coords; lerp back toward the straight baseline.
        Neo.ctx.strokeStyle = '#ffffff';
        Neo.ctx.lineWidth = Math.max(2, (line.w || 4.5) * 0.5);
        Neo.ctx.shadowBlur = 8;
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(line.x1, line.y1);
        for (let index = 1; index < segs; index += 1) {
          const t = index / segs;
          const baseX = line.x1 + dx * t;
          const baseY = line.y1 + dy * t;
          const px = baseX + (pts[(index - 1) * 2]     - baseX) * 0.35;
          const py = baseY + (pts[(index - 1) * 2 + 1] - baseY) * 0.35;
          Neo.ctx.lineTo(px, py);
        }
        Neo.ctx.lineTo(line.x2, line.y2);
        Neo.ctx.stroke();
        Neo.ctx.restore();
        return;
      }
      Neo.ctx.save();
      Neo.ctx.globalAlpha = Math.min(1, particle.life * 1.5);
      Neo.ctx.translate(particle.x, particle.y);
      if (particle.text) {
        Neo.ctx.fillStyle = particle.c || '#fff';
        Neo.ctx.font = `bold ${particle.size || 14}px system-ui`;
        Neo.ctx.textAlign = 'center';
        Neo.ctx.textBaseline = 'middle';
        Neo.ctx.shadowColor = particle.c;
        Neo.ctx.shadowBlur = 8;
        Neo.ctx.lineWidth = 3;
        Neo.ctx.strokeStyle = particle.outline || 'rgba(0,0,0,0.7)';
        Neo.ctx.strokeText(particle.text, 0, -particle.life * 20);
        Neo.ctx.fillText(particle.text, 0, -particle.life * 20);
      } else if (particle.shockwave) {
        const maxLife = Number(particle.maxLife || Neo.AOE_SHOCKWAVE_LIFE);
        const progress = Neo.clamp(1 - particle.life / maxLife, 0, 1);
        const radius = Number(particle.radius || 48);
        const waveRadius = radius * (0.22 + progress * 0.92);
        Neo.ctx.globalAlpha = (1 - progress) * 0.8;
        Neo.ctx.strokeStyle = particle.c || '#ff66cc';
        Neo.ctx.shadowColor = particle.c || '#ff66cc';
        Neo.ctx.shadowBlur = 18;
        Neo.ctx.lineWidth = particle.style === 'heavy' ? 5 : 3;
        Neo.ctx.beginPath();
        if (particle.style === 'heavy') {
          for (let index = 0; index <= 28; index += 1) {
            const angle = (index / 28) * Math.PI * 2;
            const jag = 1 + Math.sin(index * 2.1 + progress * 12) * 0.055;
            const x = Math.cos(angle) * waveRadius * jag;
            const y = Math.sin(angle) * waveRadius * jag;
            if (index === 0) Neo.ctx.moveTo(x, y);
            else Neo.ctx.lineTo(x, y);
          }
          Neo.ctx.closePath();
        } else {
          Neo.ctx.arc(0, 0, waveRadius, 0, Math.PI * 2);
        }
        Neo.ctx.stroke();
        Neo.ctx.globalAlpha = (1 - progress) * 0.16;
        Neo.ctx.fillStyle = particle.c || '#ff66cc';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, radius * (0.3 + progress * 0.45), 0, Math.PI * 2);
        Neo.ctx.fill();
      } else if (particle.impact) {
        const maxLife = Number(particle.maxLife || 0.24);
        const progress = Neo.clamp(1 - particle.life / maxLife, 0, 1);
        const size = Number(particle.size || 6) * (1 + progress * 1.4);
        Neo.ctx.rotate(Number(particle.angle || 0));
        Neo.ctx.globalAlpha = (1 - progress) * 0.85;
        Neo.ctx.strokeStyle = particle.c || '#fff';
        Neo.ctx.shadowColor = particle.c || '#fff';
        Neo.ctx.shadowBlur = 10;
        Neo.ctx.lineWidth = 2;
        for (let index = 0; index < 4; index += 1) {
          const a = (index - 1.5) * 0.5;
          Neo.ctx.beginPath();
          Neo.ctx.moveTo(-size * 0.25, Math.sin(a) * size * 0.3);
          Neo.ctx.lineTo(size * (0.75 + index * 0.12), Math.sin(a) * size);
          Neo.ctx.stroke();
        }
        Neo.ctx.fillStyle = particle.c || '#fff';
        Neo.ctx.beginPath();
        Neo.ctx.ellipse(0, 0, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
        Neo.ctx.fill();
      } else if (particle.spark) {
        const size = Number(particle.size || 2.2);
        const angle = Math.atan2(Number(particle.vy || 0), Number(particle.vx || 1));
        Neo.ctx.rotate(angle);
        Neo.ctx.fillStyle = particle.c || '#fff';
        Neo.ctx.shadowColor = particle.c || '#fff';
        Neo.ctx.shadowBlur = 7;
        Neo.ctx.beginPath();
        Neo.ctx.ellipse(0, 0, size * 1.8, size * 0.45, 0, 0, Math.PI * 2);
        Neo.ctx.fill();
      } else if (particle.smoke) {
        const size = Number(particle.size || 4);
        Neo.ctx.globalAlpha *= Math.min(0.78, Math.max(0.16, particle.life));
        Neo.ctx.fillStyle = particle.c || 'rgba(45, 38, 32, 0.85)';
        Neo.ctx.shadowBlur = 0;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, size, 0, Math.PI * 2);
        Neo.ctx.fill();
      } else if (particle.silhouette) {
        const maxLife = Number(particle.maxLife || particle.life || 0.6);
        const progress = Neo.clamp(1 - particle.life / maxLife, 0, 1);
        const fade = (1 - progress) * 0.65;
        Neo.ctx.globalAlpha = fade;
        const sil = particle.silhouette;
        if (Neo.drawSpriteFrame) {
          Neo.drawSpriteFrame(sil.spriteKey, 0, 0, sil.size || 40, {
            alpha: fade,
            flipX: sil.facing < 0,
            shadowColor: particle.c || '#b99cff',
            shadowBlur: 18,
            tint: particle.c || '#b99cff',
          });
        }
      } else if (particle.ring) {
        Neo.ctx.strokeStyle = particle.c;
        Neo.ctx.lineWidth = 3;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, particle.ring, 0, Math.PI * 2);
        Neo.ctx.stroke();
      } else if (particle.blood) {
        const size = particle.size || 3;
        const tilt = Math.atan2(Number(particle.vy || 0), Number(particle.vx || 1)) + Math.PI / 2;
        Neo.ctx.fillStyle = particle.c || '#a5001e';
        Neo.ctx.shadowColor = particle.c || '#a5001e';
        Neo.ctx.shadowBlur = 5;
        Neo.ctx.rotate(tilt);
        Neo.ctx.beginPath();
        Neo.ctx.ellipse(0, 0, size * 0.72, size * 1.18, 0, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.globalAlpha *= 0.5;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, size * 0.9, size * 0.34, 0, Math.PI * 2);
        Neo.ctx.fill();
      } else {
        Neo.ctx.fillStyle = particle.c || '#0ff';
        Neo.ctx.shadowColor = particle.c || '#0ff';
        Neo.ctx.shadowBlur = 6;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, 3, 0, Math.PI * 2);
        Neo.ctx.fill();
      }
      Neo.ctx.restore();
    });
  }

  function drawMinimap() {
    const hasGlasses = Neo.getItemStats?.()?.hasPrincesGlasses;
    const gridSize = 9;
    const visibleRooms = Neo.rooms.filter(r => !r.secret);
    const maxGy = visibleRooms.reduce((m, r) => Math.max(m, r.gy), 0);
    const canvasRect = Neo.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width > 0 ? canvasRect.width / Neo.canvas.width : 1;
    const scaleY = canvasRect.height > 0 ? canvasRect.height / Neo.canvas.height : 1;
    const compact = window.innerWidth <= 920;

    let size, gap, minimapScale;
    if (hasGlasses) {
      const baseSize = 28;
      const baseGap = 3;
      const baseMapWidth = gridSize * baseSize + (gridSize - 1) * baseGap;
      const baseMapHeight = (maxGy + 1) * baseSize + maxGy * baseGap;
      const targetViewportWidth = compact ? Math.min(224, canvasRect.width * 0.45) : Math.min(280, canvasRect.width * 0.35);
      const targetViewportHeight = compact ? Math.min(224, canvasRect.height * 0.45) : Math.min(280, canvasRect.height * 0.4);
      const baseViewportWidth = baseMapWidth * scaleX;
      const baseViewportHeight = baseMapHeight * scaleY;
      minimapScale = Neo.clamp(Math.min(1, targetViewportWidth / Math.max(1, baseViewportWidth), targetViewportHeight / Math.max(1, baseViewportHeight)), 0.5, 1);
      size = Math.max(14, Math.round(baseSize * minimapScale));
      gap = Math.max(2, Math.round(baseGap * minimapScale));
    } else {
      const baseSize = 14;
      const baseGap = 2;
      const baseMapWidth = gridSize * baseSize + (gridSize - 1) * baseGap;
      const baseMapHeight = (maxGy + 1) * baseSize + maxGy * baseGap;
      const targetViewportWidth = compact ? Math.min(112, canvasRect.width * 0.25) : Math.min(146, canvasRect.width * 0.2);
      const targetViewportHeight = compact ? Math.min(112, canvasRect.height * 0.25) : Math.min(146, canvasRect.height * 0.23);
      const baseViewportWidth = baseMapWidth * scaleX;
      const baseViewportHeight = baseMapHeight * scaleY;
      minimapScale = Neo.clamp(Math.min(1, targetViewportWidth / Math.max(1, baseViewportWidth), targetViewportHeight / Math.max(1, baseViewportHeight)), 0.62, 1);
      size = Math.max(8, Math.round(baseSize * minimapScale));
      gap = Math.max(1, Math.round(baseGap * minimapScale));
    }
    const mapWidth = gridSize * size + (gridSize - 1) * gap;
    const mapHeight = (maxGy + 1) * size + maxGy * gap;
    const originX = Neo.canvas.width - mapWidth - 2;
    const originY = Math.round(-10 * minimapScale);
    const markerFont = `${Math.max(7, Math.round(size * 0.62))}px system-ui`;
    Neo.ctx.save();
    Neo.ctx.globalAlpha = 1;
    Neo.ctx.fillStyle = '#2a2e38';
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(originX, originY, mapWidth, mapHeight, 6);
    Neo.ctx.fill();
    Neo.ctx.globalAlpha = 0.45;
    Neo.ctx.strokeStyle = '#5a6070';
    Neo.ctx.lineWidth = 1;
    Neo.ctx.stroke();
    Neo.ctx.globalAlpha = 1;
    Neo.rooms.forEach(room => {
      if (room.secret) return;
      const x = originX + room.gx * (size + gap);
      const y = originY + room.gy * (size + gap);
      if (room.type === 'ladder' && !room.explored) {
        Neo.ctx.globalAlpha = 0.55;
        Neo.ctx.fillStyle = '#fff04a';
      } else if (!room.explored) {
        Neo.ctx.globalAlpha = 0.25;
        Neo.ctx.fillStyle = '#001018';
      } else if (room.type === 'ladder') {
        Neo.ctx.globalAlpha = 1;
        Neo.ctx.fillStyle = room === Neo.currentRoom ? '#ffff00' : '#fff04a';
      } else if (room === Neo.currentRoom) {
        Neo.ctx.globalAlpha = 1;
        Neo.ctx.fillStyle = '#00ffff';
      } else if (room.type === 'god') {
        Neo.ctx.globalAlpha = 0.95;
        Neo.ctx.fillStyle = '#ffffff';
      } else if (room.type === 'challenge') {
        Neo.ctx.globalAlpha = 0.95;
        Neo.ctx.fillStyle = '#d7f6ff';
      } else if (room.type === 'boss') {
        Neo.ctx.globalAlpha = 0.95;
        Neo.ctx.fillStyle = '#ff7a7a';
      } else if (room.type === 'treasure') {
        Neo.ctx.globalAlpha = 0.95;
        Neo.ctx.fillStyle = '#ffaa00';
      } else if (room.type === 'shop') {
        Neo.ctx.globalAlpha = 0.95;
        Neo.ctx.fillStyle = '#7ec8ff';
      } else if (room.type === 'anvil') {
        Neo.ctx.globalAlpha = 0.95;
        Neo.ctx.fillStyle = '#ffb840';
      } else if (room.type === 'start') {
        Neo.ctx.globalAlpha = 0.95;
        Neo.ctx.fillStyle = '#00ff88';
      } else {
        Neo.ctx.globalAlpha = 0.9;
        Neo.ctx.fillStyle = '#0a3344';
      }
      Neo.ctx.fillRect(x, y, size, size);
      if (room.type === 'ladder') {
        Neo.ctx.globalAlpha = room.explored ? 1 : 0.7;
        Neo.ctx.fillStyle = '#fff700';
        Neo.ctx.font = `bold ${markerFont}`;
        Neo.ctx.textAlign = 'center';
        Neo.ctx.textBaseline = 'middle';
        Neo.ctx.fillText('★', x + size / 2, y + size / 2);
      } else if (room.type === 'challenge') {
        Neo.ctx.globalAlpha = room.explored ? 1 : 0.72;
        Neo.ctx.fillStyle = '#071116';
        Neo.ctx.font = `bold ${markerFont}`;
        Neo.ctx.textAlign = 'center';
        Neo.ctx.textBaseline = 'middle';
        Neo.ctx.fillText('T', x + size / 2, y + size / 2);
      } else if (room.type === 'shop') {
        Neo.ctx.globalAlpha = room.explored ? 1 : 0.72;
        Neo.ctx.fillStyle = '#071116';
        Neo.ctx.font = `bold ${markerFont}`;
        Neo.ctx.textAlign = 'center';
        Neo.ctx.textBaseline = 'middle';
        Neo.ctx.fillText('$', x + size / 2, y + size / 2);
      } else if (room.type === 'anvil') {
        Neo.ctx.globalAlpha = room.explored ? 1 : 0.72;
        Neo.ctx.fillStyle = '#1a0800';
        Neo.ctx.font = `bold ${markerFont}`;
        Neo.ctx.textAlign = 'center';
        Neo.ctx.textBaseline = 'middle';
        Neo.ctx.fillText('⚒', x + size / 2, y + size / 2);
      }
      if (room.visited) {
        Neo.ctx.strokeStyle = 'rgba(0,255,255,0.5)';
        Neo.ctx.lineWidth = 1;
        Neo.ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      }
      if (room.secret) return;
      Neo.ctx.fillStyle = 'rgba(0,255,255,0.75)';
      if (room.doors.n) Neo.ctx.fillRect(x + size / 2 - 1, y - 2, 2, 2);
      if (room.doors.s) Neo.ctx.fillRect(x + size / 2 - 1, y + size, 2, 2);
      if (room.doors.w) Neo.ctx.fillRect(x - 2, y + size / 2 - 1, 2, 2);
      if (room.doors.e) Neo.ctx.fillRect(x + size, y + size / 2 - 1, 2, 2);
    });
    if (Neo.hasLegacy('elite_tracker')) {
      Neo.rooms.forEach(room => {
        if (room.secret || room === Neo.currentRoom) return;
        const hasElite = Array.isArray(room.enemies) && room.enemies.some(e => e?.elite);
        if (!hasElite) return;
        const rx = originX + room.gx * (size + gap);
        const ry = originY + room.gy * (size + gap);
        Neo.ctx.globalAlpha = 0.9;
        Neo.ctx.fillStyle = '#ff4444';
        Neo.ctx.fillRect(rx + size - 4, ry, 4, 4);
      });
    }

    if (hasGlasses) {
      const dotR = Math.max(2, Math.round(size * 0.18));
      const skullFont = `bold ${Math.max(6, Math.round(size * 0.55))}px system-ui`;

      // Trap skull markers on explored rooms
      Neo.rooms.forEach(room => {
        if (room.secret || !room.explored) return;
        const hasExplosiveTrap = Array.isArray(room.hazards) && room.hazards.some(h => h?.kind === 'explosive_trap');
        if (!hasExplosiveTrap) return;
        const rx = originX + room.gx * (size + gap);
        const ry = originY + room.gy * (size + gap);
        Neo.ctx.globalAlpha = 0.88;
        Neo.ctx.fillStyle = '#ff2222';
        Neo.ctx.font = skullFont;
        Neo.ctx.textAlign = 'center';
        Neo.ctx.textBaseline = 'middle';
        Neo.ctx.fillText('💀', rx + size / 2, ry + size / 2);
      });

      // Pickup dots: green=potion, yellow=coin, red=item — on explored non-current rooms
      Neo.rooms.forEach(room => {
        if (room.secret || !room.explored || room === Neo.currentRoom) return;
        const pickups = Array.isArray(room.pickups) ? room.pickups : [];
        const hasPotion = pickups.some(p => p?.type === 'potion');
        const hasCoin = pickups.some(p => p?.type === 'coin');
        const hasItem = pickups.some(p => p?.type === 'item');
        if (!hasPotion && !hasCoin && !hasItem) return;
        const rx = originX + room.gx * (size + gap);
        const ry = originY + room.gy * (size + gap);
        let slotX = rx + 1;
        const dotY = ry + size - dotR - 1;
        const drawDot = (color) => {
          Neo.ctx.globalAlpha = 0.92;
          Neo.ctx.fillStyle = color;
          Neo.ctx.beginPath();
          Neo.ctx.arc(slotX + dotR, dotY, dotR, 0, Math.PI * 2);
          Neo.ctx.fill();
          slotX += dotR * 2 + 1;
        };
        if (hasItem) drawDot('#ff5555');
        if (hasPotion) drawDot('#55ff88');
        if (hasCoin) drawDot('#ffdd44');
      });

      // Enemy dots per room — use room.enemies for non-current rooms
      Neo.rooms.forEach(room => {
        if (room.secret || room === Neo.currentRoom) return;
        const roomEnemies = Array.isArray(room.enemies) ? room.enemies.filter(e => e && e.hp > 0) : [];
        if (roomEnemies.length === 0) return;
        const rx = originX + room.gx * (size + gap);
        const ry = originY + room.gy * (size + gap);
        const count = Math.min(roomEnemies.length, 5);
        const spacing = (size - 2) / count;
        for (let i = 0; i < count; i++) {
          const ex = rx + 1 + spacing * i + spacing / 2;
          const ey = ry + size / 2;
          Neo.ctx.globalAlpha = 0.9;
          Neo.ctx.fillStyle = roomEnemies[i]?.elite ? '#ff8800' : '#ff3333';
          Neo.ctx.beginPath();
          Neo.ctx.arc(ex, ey, dotR, 0, Math.PI * 2);
          Neo.ctx.fill();
        }
      });
    }

    // "You are here" emphasis: pulsing ring + YOU tag on the current room so the
    // player can instantly spot their position among same-colored room dots.
    const youRoom = Neo.currentRoom;
    if (youRoom && !youRoom.secret) {
      const yx = originX + youRoom.gx * (size + gap);
      const yy = originY + youRoom.gy * (size + gap);
      const t = Number(Neo.gameElapsedTime || 0);
      const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
      const grow = Math.round(2 + pulse * Math.max(2, size * 0.22));
      // Animated outer ring.
      Neo.ctx.globalAlpha = 0.55 + 0.45 * pulse;
      Neo.ctx.strokeStyle = '#fff7c2';
      Neo.ctx.lineWidth = Math.max(1.5, Math.round(size * 0.14));
      Neo.ctx.strokeRect(yx - grow + 0.5, yy - grow + 0.5, size + grow * 2 - 1, size + grow * 2 - 1);
      // Solid inner highlight border so the cell reads clearly even mid-pulse.
      Neo.ctx.globalAlpha = 1;
      Neo.ctx.strokeStyle = '#0a0d14';
      Neo.ctx.lineWidth = 1;
      Neo.ctx.strokeRect(yx - 1.5, yy - 1.5, size + 3, size + 3);
      Neo.ctx.strokeStyle = '#fffbe6';
      Neo.ctx.lineWidth = Math.max(1.5, Math.round(size * 0.18));
      Neo.ctx.strokeRect(yx + 0.5, yy + 0.5, size - 1, size - 1);

      // "YOU" tag, pinned above the cell but clamped inside the minimap bounds.
      const tagFont = `bold ${Math.max(7, Math.round(size * 0.62))}px system-ui`;
      Neo.ctx.font = tagFont;
      Neo.ctx.textAlign = 'center';
      Neo.ctx.textBaseline = 'middle';
      const label = 'YOU';
      const padX = Math.max(3, Math.round(size * 0.22));
      const tagW = Math.ceil(Neo.ctx.measureText(label).width) + padX * 2;
      const tagH = Math.max(10, Math.round(size * 0.72));
      let tagCx = yx + size / 2;
      let tagY = yy - grow - tagH / 2 - 2;
      // If there's no room above, place the tag below instead.
      if (tagY - tagH / 2 < originY) tagY = yy + size + grow + tagH / 2 + 2;
      // Clamp horizontally so the tag never clips off the minimap edges.
      const halfW = tagW / 2;
      tagCx = Neo.clamp(tagCx, originX + halfW, originX + mapWidth - halfW);
      Neo.ctx.globalAlpha = 0.92;
      Neo.ctx.fillStyle = 'rgba(10,13,20,0.85)';
      Neo.ctx.beginPath();
      Neo.ctx.roundRect(tagCx - halfW, tagY - tagH / 2, tagW, tagH, 3);
      Neo.ctx.fill();
      Neo.ctx.strokeStyle = '#fff7c2';
      Neo.ctx.lineWidth = 1;
      Neo.ctx.stroke();
      Neo.ctx.globalAlpha = 1;
      Neo.ctx.fillStyle = '#fffbe6';
      Neo.ctx.fillText(label, tagCx, tagY + 0.5);
    }

    Neo.ctx.restore();

    const viewportBounds = {
      left: canvasRect.left + originX * scaleX,
      top: canvasRect.top + originY * scaleY,
      right: canvasRect.left + (originX + mapWidth) * scaleX,
      bottom: canvasRect.top + (originY + mapHeight) * scaleY,
    };
    Neo.minimapLayoutState = {
      x: originX,
      y: originY,
      width: mapWidth,
      height: mapHeight,
      scale: minimapScale,
      viewportBounds,
    };
    return Neo.minimapLayoutState;
  }

  function drawGodModeBar() {
    Neo.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    Neo.ctx.fillRect(300, 12, 360, 6);
    Neo.ctx.fillStyle = `hsl(${(Date.now() / 10) % 360},100%,60%)`;
    Neo.ctx.fillRect(300, 12, 360 * (Neo.godTimer / 12), 6);
    Neo.ctx.fillStyle = '#fff';
    Neo.ctx.font = '10px system-ui';
    Neo.ctx.textAlign = 'center';
    Neo.ctx.fillText('GOD MODE', 480, 10);
  }

  function getBossLabel(type) {
    if (type === 'queen_cult') return 'QUEEN OF THE CULT';
    if (type === 'bulk_golem') return 'BULK GOLEM';
    if (type === 'artificer_knave') return 'ARTIFICER CHARGED KNAVE';
    if (type === 'bowman_bane') return "BOWMAN'S BANE";
    if (type === 'antony_blemmye') return 'ANTONY BLEMMYE';
    if (type === 'handsome_devil') return 'HANDSOME DEVIL';
    if (type === 'god') return 'GOD';
    return type.toUpperCase();
  }

  function drawBossHealthBars() {
    const bosses = Neo.enemies.filter(enemy => Neo.isBossType(enemy.type));
    if (!bosses.length) return;

    const width = 420;
    const height = 10;
    const gap = 18;
    const startX = (Neo.canvas.width - width) / 2;
    const startY = 76;

    bosses.forEach((boss, index) => {
      const y = startY + index * gap;
      const hpPct = Neo.clamp(boss.hp / boss.max, 0, 1);

      Neo.ctx.fillStyle = 'rgba(0,0,0,0.65)';
      Neo.ctx.fillRect(startX - 2, y - 2, width + 4, height + 4);
      Neo.ctx.fillStyle = '#220f28';
      Neo.ctx.fillRect(startX, y, width, height);

      Neo.ctx.fillStyle = boss.type === 'bulk_golem' ? '#ff8e4a' : boss.type === 'artificer_knave' ? '#ffd27d' : boss.type === 'bowman_bane' ? '#c9aaff' : boss.type === 'antony_blemmye' ? '#ffcf8a' : boss.type === 'handsome_devil' ? '#ff3348' : '#e4b9ff';
      if (boss.type === 'god') Neo.ctx.fillStyle = '#ffffff';
      Neo.ctx.fillRect(startX, y, width * hpPct, height);

      Neo.ctx.fillStyle = '#fff';
      Neo.ctx.font = 'bold 11px system-ui';
      Neo.ctx.textAlign = 'center';
      Neo.ctx.fillText(getBossLabel(boss.type), Neo.canvas.width / 2, y - 4);
    });
  }

  function drawFloorTransition() {
    if (!Neo.showFloorTransition || Neo.floorTransitionTime > 2.5) return;
    const _access = window.NeoSettings?.getAccess() || {};
    // With reduceMotion: skip the animated banner entirely
    if (_access.reduceMotion) return;

    const progress = Neo.floorTransitionTime / 2.5;
    const scaleProgress = Math.min(progress * 1.5, 1);
    const fadeInProgress = Math.min(progress * 2, 1);
    const fadeOutProgress = Math.max((progress - 0.7) / 0.3, 0);

    const baseScale = 0.3 + scaleProgress * 0.7;
    const alpha = fadeInProgress * (1 - fadeOutProgress);

    Neo.ctx.save();
    Neo.ctx.globalAlpha = alpha;

    const centerX = Neo.canvas.width / 2;
    const centerY = Neo.canvas.height / 2;
    const offsetY = (1 - scaleProgress) * 80;

    Neo.ctx.translate(centerX, centerY - offsetY);
    Neo.ctx.scale(baseScale, baseScale);
    Neo.ctx.translate(-centerX, -centerY);

    Neo.ctx.fillStyle = '#00ffff';
    Neo.ctx.shadowColor = '#00ffff';
    Neo.ctx.shadowBlur = 40 * alpha;
    Neo.ctx.font = 'bold 72px system-ui';
    Neo.ctx.textAlign = 'center';
    Neo.ctx.textBaseline = 'middle';

    Neo.ctx.fillText(`FLOOR ${Neo.floor}`, centerX, centerY);

    Neo.ctx.font = 'bold 24px system-ui';
    Neo.ctx.fillStyle = '#7dff9e';
    Neo.ctx.shadowColor = '#7dff9e';
    Neo.ctx.shadowBlur = 20 * alpha;
    Neo.ctx.fillText('▼ ▼ ▼', centerX, centerY + 50);

    Neo.ctx.restore();
  }

  function drawActionIcons() {
    const drawHudMoveIcon = (slot, canvas, fallbackColor, fallbackPixels) => {
      const moveKey = Neo.getEquippedMove(slot);
      const moveDef = Neo.MOVE_DEFS[moveKey];
      if (canvas && moveDef && typeof Neo.drawMoveToastIcon === 'function') {
        Neo.drawMoveToastIcon(canvas, moveDef);
        return;
      }
      if (canvas) drawPixelIcon(canvas, fallbackColor, fallbackPixels);
    };

    drawPixelIcon(Neo.ui.coinIcon, '#ffd15a', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
      [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
    ]);
    drawPixelIcon(Neo.ui.hudLoopIcon, '#83f3ff', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [5, 2],
      [1, 3], [5, 3],
      [1, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
      [2, 2], [4, 2], [2, 4], [4, 4],
      [3, 3],
    ]);
    drawPixelIcon(Neo.ui.metaCoinIcon, '#ffd15a', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
      [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
    ]);
    drawPixelIcon(Neo.ui.metaLoopIcon, '#83f3ff', [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [5, 2],
      [1, 3], [5, 3],
      [1, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
      [2, 2], [4, 2], [2, 4], [4, 4],
      [3, 3],
    ]);
    drawHudMoveIcon('dash', Neo.ui.icons.dash, '#8fffca', [
      [3, 1], [4, 1], [2, 2], [5, 2], [1, 3], [6, 3], [1, 4], [6, 4],
      [2, 5], [5, 5], [3, 6], [4, 6], [3, 3], [4, 3], [3, 4], [4, 4],
    ]);
    drawHudMoveIcon('melee', Neo.ui.icons.melee, '#00ffff', [
      [2, 6], [3, 5], [4, 4], [5, 3], [6, 2], [5, 4], [6, 3], [7, 2], [6, 5], [7, 4],
    ]);
    drawHudMoveIcon('laser', Neo.ui.icons.laser, '#7a9fc4', [
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [5, 3], [6, 2], [7, 1],
    ]);
    drawHudMoveIcon('smash', Neo.ui.icons.smash, '#ffaa00', [
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
    const hudIcon = Neo.ui?.difficultyHudIcon;
    if (hudIcon) {
      const key = Neo.selectedDifficulty || 'easy';
      const def = DIFFICULTY_ICON_DEFS[key] || DIFFICULTY_ICON_DEFS.easy;
      drawPixelIcon(hudIcon, def.color, def.pixels);
    }
    const btnIcons = Neo.ui?.difficultyBtnIcons || [];
    btnIcons.forEach(canvas => {
      const key = canvas.dataset.difficultyIcon;
      const def = DIFFICULTY_ICON_DEFS[key];
      if (def) drawPixelIcon(canvas, def.color, def.pixels);
    });
  }

  function drawDifficultyIconOn(canvasEl, difficultyKey) {
    if (!canvasEl) return;
    const def = DIFFICULTY_ICON_DEFS[difficultyKey] || DIFFICULTY_ICON_DEFS.easy;
    drawPixelIcon(canvasEl, def.color, def.pixels);
  }

  function drawPixelIcon(canvasEl, color, pixels) {
    const iconCtx = canvasEl.getContext('2d');
    iconCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    iconCtx.imageSmoothingEnabled = false;
    iconCtx.fillStyle = 'rgba(255,255,255,0.08)';
    iconCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    // Derive cell size from canvas buffer so the icon never gets clipped,
    // regardless of the canvas width/height attributes.
    const maxCoord = pixels.reduce((m, [px, py]) => Math.max(m, px, py), 0) + 1;
    const cell = Math.floor(Math.min(canvasEl.width, canvasEl.height) / (maxCoord + 1));
    iconCtx.fillStyle = color;
    pixels.forEach(([px, py]) => {
      iconCtx.fillRect(px * cell, py * cell, cell, cell);
    });
  }

  // Expose on Neo
  Neo.drawParticles = drawParticles;
  Neo.drawMinimap = drawMinimap;
  Neo.drawGodModeBar = drawGodModeBar;
  Neo.getBossLabel = getBossLabel;
  Neo.drawBossHealthBars = drawBossHealthBars;
  Neo.drawFloorTransition = drawFloorTransition;
  Neo.drawActionIcons = drawActionIcons;
  Neo.drawPixelIcon = drawPixelIcon;
  Neo.drawDifficultyIcons = drawDifficultyIcons;
  Neo.drawDifficultyIconOn = drawDifficultyIconOn;
