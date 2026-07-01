// draw/hud.js — standalone IIFE. HUD canvas drawing (particles, minimap, boss bars, transitions, action icons).
  let _lineParticlePointScratch = new Float32Array(64);
  const CANVAS_PIXEL_FONT = '"VT323", "Courier New", ui-monospace, monospace';

  function drawParticles() {
    // Per-particle shadowBlur is the dominant draw cost. In performance mode,
    // once the screen is busy (e.g. holding a laser) drop the glow entirely —
    // the particles stay, they just don't each trigger an expensive blur pass.
    const perfMode = window.NeoSettings?.isPerformanceMode?.() !== false;
    // shadowBlur is the dominant draw cost; drop it earlier under load so a busy
    // screen (held laser, blood floods) doesn't pay per-particle blur on dozens
    // of flecks before the cull kicks in.
    const lowFx = perfMode && Neo.particles.length > 48;
    const pfx = n => (lowFx ? 0 : n);
    // Under lowFx the glow is dropped, so skip both shadow writes entirely —
    // setting shadowColor to a string every particle is wasted state churn when
    // shadowBlur is 0. save()/restore() already resets shadowBlur to the 0 default
    // each iteration, so we don't need to clear it here.
    const setGlow = (color, blur) => {
      if (lowFx) return;
      Neo.ctx.shadowColor = color;
      Neo.ctx.shadowBlur = blur;
    };
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
        const pointCount = Math.max(0, (segs - 1) * 2);
        if (_lineParticlePointScratch.length < pointCount) {
          _lineParticlePointScratch = new Float32Array(pointCount * 2);
        }
        const pts = _lineParticlePointScratch;
        for (let index = 1; index < segs; index += 1) {
          const t = index / segs;
          const wave = Math.sin((t * 18) + phase + index * 0.9);
          const off = wave * jitter * (index % 2 === 0 ? 1 : -1);
          pts[(index - 1) * 2]     = line.x1 + dx * t + nx * off;
          pts[(index - 1) * 2 + 1] = line.y1 + dy * t + ny * off;
        }

        Neo.ctx.save();
        Neo.ctx.globalAlpha = Math.min(1, particle.life * 2.1);

        // Outer glow pass
        Neo.ctx.strokeStyle = particle.c || '#dfe8ff';
        Neo.ctx.lineWidth = (line.w || 4.5) + 3;
        setGlow(particle.c || '#dfe8ff', 18);
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
        if (!lowFx) Neo.ctx.shadowBlur = 8;
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
        Neo.ctx.font = `${particle.size || 14}px ${CANVAS_PIXEL_FONT}`;
        Neo.ctx.textAlign = 'center';
        Neo.ctx.textBaseline = 'middle';
        setGlow(particle.c, 8);
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
        setGlow(particle.c || '#ff66cc', 18);
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
        setGlow(particle.c || '#fff', 10);
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
        const angle = Math.atan2(particle.vy, particle.vx || 1);
        Neo.ctx.rotate(angle);
        Neo.ctx.fillStyle = particle.c || '#fff';
        setGlow(particle.c || '#fff', 7);
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
            shadowBlur: pfx(18),
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
        const tilt = Math.atan2(particle.vy, particle.vx || 1) + Math.PI / 2;
        Neo.ctx.fillStyle = particle.c || '#a5001e';
        setGlow(particle.c || '#a5001e', 5);
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
        setGlow(particle.c || '#0ff', 6);
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
    const accessHudScale = Number(window.NeoSettings?.getAccess?.()?.hudScale);
    const globalHudScale = Number.isFinite(accessHudScale) ? Neo.clamp(accessHudScale, 0.5, 2) : 1;
    // The minimap participates in the per-widget HUD Layout editor: a null/absent
    // scale inherits the global HUD scale, otherwise it uses its own. Visibility
    // is handled by the caller (skips drawMinimap entirely when hidden).
    const minimapEntry = window.NeoSettings?.getHudElements?.()?.minimap;
    const ownScale = Number(minimapEntry?.scale);
    const hudScale = Number.isFinite(ownScale) ? Neo.clamp(ownScale, 0.5, 2) : globalHudScale;
    const minimapOffsetX = Number.isFinite(Number(minimapEntry?.x)) ? Number(minimapEntry.x) : 0;
    const minimapOffsetY = Number.isFinite(Number(minimapEntry?.y)) ? Number(minimapEntry.y) : 0;
    const baseSize = hasGlasses ? 34 : 17;
    const baseGap = hasGlasses ? 3 : 2;
    const baseMapWidth = gridSize * baseSize + (gridSize - 1) * baseGap;
    const baseMapHeight = (maxGy + 1) * baseSize + maxGy * baseGap;
    const targetViewportWidth = hasGlasses
      ? (compact ? Math.min(224, canvasRect.width * 0.45) : Math.min(280, canvasRect.width * 0.35))
      : (compact ? Math.min(112, canvasRect.width * 0.25) : Math.min(146, canvasRect.width * 0.2));
    const targetViewportHeight = hasGlasses
      ? (compact ? Math.min(224, canvasRect.height * 0.45) : Math.min(280, canvasRect.height * 0.4))
      : (compact ? Math.min(112, canvasRect.height * 0.25) : Math.min(146, canvasRect.height * 0.23));
    const baseViewportWidth = baseMapWidth * scaleX;
    const baseViewportHeight = baseMapHeight * scaleY;
    const responsiveScale = Neo.clamp(
      Math.min(1, targetViewportWidth / Math.max(1, baseViewportWidth), targetViewportHeight / Math.max(1, baseViewportHeight)),
      hasGlasses ? 0.5 : 0.62,
      1,
    );

    // The canvas uses a cover-style layout and is often cropped. Anchor the
    // minimap to the visible viewport, not the off-screen canvas buffer edge.
    const visibleCanvasLeft = Neo.clamp(-canvasRect.left / scaleX, 0, Neo.canvas.width);
    const visibleCanvasTop = Neo.clamp(-canvasRect.top / scaleY, 0, Neo.canvas.height);
    const visibleCanvasRight = Neo.clamp((window.innerWidth - canvasRect.left) / scaleX, 0, Neo.canvas.width);
    const visibleCanvasBottom = Neo.clamp((window.innerHeight - canvasRect.top) / scaleY, 0, Neo.canvas.height);
    const topInset = (compact ? 48 : 16) / scaleY;
    const edgeInsetX = (compact ? 8 : 16) / scaleX;
    const edgeInsetY = 8 / scaleY;
    const maxVisibleScale = Math.min(
      (visibleCanvasRight - visibleCanvasLeft - edgeInsetX * 2) / Math.max(1, baseMapWidth),
      (visibleCanvasBottom - visibleCanvasTop - topInset - edgeInsetY) / Math.max(1, baseMapHeight),
    );
    // Keep the map at its intended size: floor the scale at the per-mode minimum
    // (matching responsiveScale's floor) so the viewport cap can't shrink it to a
    // dot, but never demand more than the visible viewport actually allows.
    const minScale = Math.min(hasGlasses ? 0.5 : 0.62, Math.max(0.25, maxVisibleScale));
    const minimapScale = Neo.clamp(
      Math.min(responsiveScale * hudScale, maxVisibleScale),
      minScale,
      2,
    );
    const size = Math.max(hasGlasses ? 7 : 8, Math.round(baseSize * minimapScale));
    const gap = Math.max(1, Math.round(baseGap * minimapScale));
    const mapWidth = gridSize * size + (gridSize - 1) * gap;
    const mapHeight = (maxGy + 1) * size + maxGy * gap;
    const originX = Math.round(visibleCanvasRight - mapWidth - edgeInsetX + minimapOffsetX / scaleX);
    const originY = Math.round(visibleCanvasTop + topInset + minimapOffsetY / scaleY);
    const markerFont = `${Math.max(7, Math.round(size * 0.62))}px system-ui`;
    const currentRoom = Neo.currentRoom;
    // Princess's floor curse (obscureMap): every room other than the one you're
    // standing in reads as un-explored on the minimap, hiding its layout, exits,
    // pickup dots, and trap skulls for the whole floor.
    const mapObscured = !!Neo.floorRivalCurses?.obscureMap;
    const isRevealed = (room) => !!room?.explored && !(mapObscured && room !== currentRoom);
    const currentCellCx = currentRoom && !currentRoom.secret
      ? originX + currentRoom.gx * (size + gap) + size / 2
      : originX + mapWidth / 2;
    const hasSpawnedLadder = (room) => {
      if (!room) return false;
      const pickups = room === currentRoom ? Neo.pickups : room.pickups;
      return Array.isArray(pickups) && pickups.some(pickup => pickup?.type === 'ladder');
    };
    const revealLadderEarly = !Neo.hideLadderOnMinimap;
    const showsExit = (room) => !!room && ((revealLadderEarly && room.type === 'ladder') || hasSpawnedLadder(room));
    const keyFontSize = Math.max(7, Math.round(size * 0.52));
    const keyFont = `bold ${keyFontSize}px system-ui`;
    const keyIconSize = Math.max(5, Math.round(size * 0.34));
    const keyIconGap = Math.max(3, Math.round(size * 0.18));
    const keyPadX = Math.max(4, Math.round(size * 0.2));
    const keyPillH = Math.max(12, Math.round(size * 0.72));
    const keyEntryGap = Math.max(2, Math.round(size * 0.16));
    const keyRowGap = Math.max(2, Math.round(size * 0.14));
    const keyFooterPad = Math.max(3, Math.round(4 * minimapScale));
    const keyFramePad = Math.max(3, Math.round(size * 0.18));

    const roomTypeLegend = {
      god: ['god', 'GOD', '#ffffff', 'square'],
      challenge: ['trial', 'TRIAL', '#d7f6ff', 'square'],
      boss: ['boss-room', 'BOSS', '#ff7a7a', 'square'],
      treasure: ['treasure', 'LOOT', '#ffaa00', 'square'],
      shop: ['shop', 'SHOP', '#7ec8ff', 'square'],
      anvil: ['anvil', 'FORGE', '#ffb840', 'square'],
      start: ['start', 'START', '#00ff88', 'square'],
      secret: ['secret', 'SECRET', '#b58cff', 'square'],
    };
    Object.entries(Neo.SPECIAL_ROOM_DEFS || {}).forEach(([type, def]) => {
      roomTypeLegend[type] = [`special-${type}`, String(def.shortName || def.name || type).toUpperCase(), def.color || '#d7f6ff', 'square'];
    });

    const legendLayoutSignature = [
      currentRoom?.gx ?? '-', currentRoom?.gy ?? '-', currentRoom?.type || '',
      mapWidth, keyFontSize, keyIconSize, keyPadX,
    ].join('|');

    let legendRows;
    let legendRowWidths;
    const cachedLegend = Neo.minimapLegendCache;
    if (cachedLegend?.layoutSignature === legendLayoutSignature && !Neo.minimapLegendDirty) {
      legendRows = cachedLegend.rows;
      legendRowWidths = cachedLegend.rowWidths;
    } else {
      const liveEnemies = Array.isArray(Neo.enemies) ? Neo.enemies.filter(enemy => enemy && enemy.hp > 0) : [];
      const eliteCount = liveEnemies.filter(enemy => enemy.elite).length;
      const normalEnemyCount = Math.max(0, liveEnemies.length - eliteCount);
      const currentHazards = Array.isArray(Neo.hazards) ? Neo.hazards : [];
      const hasTrap = currentHazards.some(hazard => hazard?.kind === 'explosive_trap');
      const hasLava = currentHazards.some(hazard => hazard?.kind === 'lava' || hazard?.kind === 'lava_moat');
      const hasHealZone = currentHazards.some(hazard => hazard?.kind === 'healing_zone');
      const hasFire = currentHazards.some(hazard => hazard?.kind === 'fire_circle');
      const currentPickups = Array.isArray(Neo.pickups) ? Neo.pickups : [];
      const potionCount = currentPickups.filter(pickup => pickup?.type === 'potion').length;
      const coinCount = currentPickups.filter(pickup => pickup?.type === 'coin').length;
      const itemCount = currentPickups.filter(pickup => pickup?.type === 'item').length;
      const exitVisible = Array.isArray(Neo.rooms) && Neo.rooms.some(room => !room.secret && showsExit(room));
      const chestCount = Array.isArray(Neo.chests) ? Neo.chests.filter(chest => chest && !chest.open).length : 0;
      const legendEntries = [{ key: 'you', label: 'YOU', color: '#fff7c2', mode: 'you' }];
      const addLegendEntry = (key, label, color, mode = 'dot') => {
        if (!legendEntries.some(entry => entry.key === key)) legendEntries.push({ key, label, color, mode });
      };
      if (exitVisible) addLegendEntry('exit', 'EXIT', '#fff04a', 'star');
      if (Neo.player?.activeBounty?.targetSpawned) addLegendEntry('bounty-target', 'HUNT', '#ff9d66', 'dot');
      if (currentRoom && roomTypeLegend[currentRoom.type]) addLegendEntry(...roomTypeLegend[currentRoom.type]);
      if (eliteCount > 0) addLegendEntry('elite', `${eliteCount} ELITE`, '#ff8800', 'dot');
      if (normalEnemyCount > 0) addLegendEntry('enemy', `${normalEnemyCount} FOE`, '#ff3333', 'dot');
      if (hasTrap) addLegendEntry('trap', 'TRAP', '#ff3333', 'triangle');
      if (hasLava) addLegendEntry('lava', 'LAVA', '#ff7a2a', 'triangle');
      if (hasHealZone) addLegendEntry('heal-zone', 'HEAL', '#55ff88', 'dot');
      if (hasFire) addLegendEntry('fire', 'FIRE', '#ff7a2a', 'dot');
      if (itemCount > 0) addLegendEntry('item', `${itemCount} ITEM`, '#ff5555', 'dot');
      if (potionCount > 0) addLegendEntry('potion', `${potionCount} HEAL`, '#55ff88', 'dot');
      if (coinCount > 0) addLegendEntry('coin', `${coinCount} COIN`, '#ffdd44', 'dot');
      if (chestCount > 0) addLegendEntry('chest', `${chestCount} CHEST`, '#ffaa00', 'square');

      Neo.ctx.font = keyFont;
      const keyMaxWidth = Math.max(1, mapWidth - keyFramePad * 2);
      legendRows = [[]];
      legendRowWidths = [0];
      legendEntries.forEach(entry => {
        const labelW = Math.ceil(Neo.ctx.measureText(entry.label).width);
        const width = keyPadX * 2 + keyIconSize + keyIconGap + labelW;
        entry.width = Math.min(width, keyMaxWidth);
        let rowIndex = legendRows.length - 1;
        const nextWidth = legendRowWidths[rowIndex] + (legendRows[rowIndex].length ? keyEntryGap : 0) + entry.width;
        if (legendRows[rowIndex].length && nextWidth > keyMaxWidth) {
          legendRows.push([]);
          legendRowWidths.push(0);
          rowIndex += 1;
        }
        legendRows[rowIndex].push(entry);
        legendRowWidths[rowIndex] += (legendRows[rowIndex].length > 1 ? keyEntryGap : 0) + entry.width;
      });
      Neo.minimapLegendCache = { layoutSignature: legendLayoutSignature, rows: legendRows, rowWidths: legendRowWidths };
      Neo.minimapLegendDirty = false;
    }
    const keyContentH = legendRows.length * keyPillH + Math.max(0, legendRows.length - 1) * keyRowGap;
    const minimapFrameHeight = mapHeight + keyFooterPad * 2 + keyContentH;
    let minimapVisualLeft = originX;
    let minimapVisualTop = originY;
    let minimapVisualRight = originX + mapWidth;
    let minimapVisualBottom = originY + minimapFrameHeight;
    Neo.ctx.save();
    Neo.ctx.globalAlpha = 1;
    Neo.ctx.fillStyle = '#2a2e38';
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(originX, originY, mapWidth, minimapFrameHeight, 6);
    Neo.ctx.fill();
    Neo.ctx.globalAlpha = 0.45;
    Neo.ctx.strokeStyle = '#5a6070';
    Neo.ctx.lineWidth = 1;
    Neo.ctx.stroke();
    Neo.ctx.globalAlpha = 0.28;
    Neo.ctx.strokeStyle = '#5a6070';
    Neo.ctx.beginPath();
    Neo.ctx.moveTo(originX + 2, originY + mapHeight + 0.5);
    Neo.ctx.lineTo(originX + mapWidth - 2, originY + mapHeight + 0.5);
    Neo.ctx.stroke();
    Neo.ctx.globalAlpha = 1;
    // Room-type glyphs are drawn as white lettering wrapped in a dark outline so
    // they stay legible on any tile color — the tiles range from pale blue to
    // bright orange, where a same-color glow or plain white would wash out.
    const drawRoomGlyph = (glyph, x, y, roomExplored) => {
      const cx = x + size / 2;
      const cy = y + size / 2;
      Neo.ctx.save();
      Neo.ctx.globalAlpha = roomExplored ? 1 : 0.72;
      Neo.ctx.font = `bold ${markerFont}`;
      Neo.ctx.textAlign = 'center';
      Neo.ctx.textBaseline = 'middle';
      // Dark halo: a stroked outline scaled to the glyph so contrast holds up
      // against light and dark tiles alike.
      Neo.ctx.lineJoin = 'round';
      Neo.ctx.strokeStyle = 'rgba(4,10,14,0.92)';
      Neo.ctx.lineWidth = Math.max(2, size * 0.22);
      Neo.ctx.strokeText(glyph, cx, cy);
      Neo.ctx.fillStyle = '#ffffff';
      Neo.ctx.fillText(glyph, cx, cy);
      Neo.ctx.restore();
    };
    Neo.rooms.forEach(room => {
      if (room.secret) return;
      const x = originX + room.gx * (size + gap);
      const y = originY + room.gy * (size + gap);
      const roomExplored = isRevealed(room);
      // While obscured, only the current room reveals an exit star; the rest read
      // as undiscovered.
      const roomShowsExit = showsExit(room) && (!mapObscured || room === currentRoom);
      if (roomShowsExit && !roomExplored) {
        Neo.ctx.globalAlpha = 0.55;
        Neo.ctx.fillStyle = '#fff04a';
      } else if (!roomExplored) {
        Neo.ctx.globalAlpha = 0.25;
        Neo.ctx.fillStyle = '#001018';
      } else if (roomShowsExit) {
        Neo.ctx.globalAlpha = 1;
        Neo.ctx.fillStyle = room === Neo.currentRoom ? '#ffff00' : '#fff04a';
      } else if (room === Neo.currentRoom) {
        Neo.ctx.globalAlpha = 1;
        Neo.ctx.fillStyle = '#00ffff';
      } else if (room.type === 'god') {
        Neo.ctx.globalAlpha = 0.95;
        Neo.ctx.fillStyle = '#ffffff';
      } else if (Neo.SPECIAL_ROOM_DEFS?.[room.type]) {
        Neo.ctx.globalAlpha = 0.95;
        Neo.ctx.fillStyle = Neo.SPECIAL_ROOM_DEFS[room.type].color;
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
      
      // While obscured, suppress the room-type glyphs for every room but the
      // current one so the floor's layout stays hidden.
      const showRoomGlyph = !mapObscured || room === currentRoom;
      if (roomShowsExit) {
        Neo.ctx.globalAlpha = roomExplored ? 1 : 0.7;
        Neo.ctx.fillStyle = '#fff700';
        Neo.ctx.font = `bold ${markerFont}`;
        Neo.ctx.textAlign = 'center';
        Neo.ctx.textBaseline = 'middle';
        Neo.ctx.fillText('★', x + size / 2, y + size / 2);
      } else if (room.type === 'challenge' && showRoomGlyph) {
        drawRoomGlyph('T', x, y, roomExplored);
      } else if (room.type === 'shop' && showRoomGlyph) {
        drawRoomGlyph('$', x, y, roomExplored);
      } else if (room.type === 'anvil' && showRoomGlyph) {
        drawRoomGlyph('⚒', x, y, roomExplored);
      } else if (Neo.SPECIAL_ROOM_DEFS?.[room.type] && showRoomGlyph) {
        drawRoomGlyph(Neo.SPECIAL_ROOM_DEFS[room.type].glyph, x, y, roomExplored);
      }
      // Forge/shop blink: draw a soft, slowly-blinking highlight ring around
      // revealed forge and shop rooms so they catch the eye on the minimap.
      // Skipped for the current room (it has its own stronger pulse below) and
      // while the map is obscured for non-current rooms.
      if ((room.type === 'anvil' || room.type === 'shop') && room !== currentRoom
          && roomExplored && showRoomGlyph) {
        const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(Number(Neo.gameElapsedTime || 0) * 3.0));
        const ringColor = room.type === 'anvil' ? '#ffd27a' : '#bfe4ff';
        const ringW = Math.max(1, Math.round(size * 0.12));
        Neo.ctx.globalAlpha = blink;
        Neo.ctx.strokeStyle = ringColor;
        Neo.ctx.lineWidth = ringW;
        Neo.ctx.strokeRect(x - 1.5, y - 1.5, size + 3, size + 3);
        Neo.ctx.globalAlpha = 1;
      }
      if (room.visited && roomExplored) {
        Neo.ctx.strokeStyle = 'rgba(0,255,255,0.5)';
        Neo.ctx.lineWidth = 1;
        Neo.ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      }
      if (room.secret) return;
      // While obscured, the connecting-door stubs are hidden for unrevealed rooms
      // so the floor's shape can't be read off the map.
      if (!roomExplored && mapObscured) return;
      Neo.ctx.fillStyle = 'rgba(0,255,255,0.75)';
      if (room.doors.n) Neo.ctx.fillRect(x + size / 2 - 1, y - 2, 2, 2);
      if (room.doors.s) Neo.ctx.fillRect(x + size / 2 - 1, y + size, 2, 2);
      if (room.doors.w) Neo.ctx.fillRect(x - 2, y + size / 2 - 1, 2, 2);
      if (room.doors.e) Neo.ctx.fillRect(x + size, y + size / 2 - 1, 2, 2);
    });
    if (Neo.hasLegacy('elite_tracker') && !mapObscured) {
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

    const activeBounty = Neo.player?.activeBounty;
    if (activeBounty?.targetSpawned && activeBounty.targetRoomKey) {
      const targetRoom = Neo.rooms.find(room => `${room.gx},${room.gy}` === activeBounty.targetRoomKey);
      if (targetRoom && !targetRoom.secret) {
        const rx = originX + targetRoom.gx * (size + gap) + size / 2;
        const ry = originY + targetRoom.gy * (size + gap) + size / 2;
        const pulse = 0.65 + Math.sin(Number(Neo.gameElapsedTime || 0) * 5) * 0.25;
        Neo.ctx.globalAlpha = pulse;
        Neo.ctx.strokeStyle = '#ff9d66';
        Neo.ctx.lineWidth = Math.max(1.5, size * 0.13);
        Neo.ctx.beginPath();
        Neo.ctx.arc(rx, ry, Math.max(4, size * 0.42), 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.fillStyle = '#ff9d66';
        Neo.ctx.beginPath();
        Neo.ctx.arc(rx, ry, Math.max(1.5, size * 0.12), 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.globalAlpha = 1;
      }
    }

    if (hasGlasses) {
      const dotR = Math.max(2, Math.round(size * 0.18));
      const skullFont = `bold ${Math.max(6, Math.round(size * 0.55))}px system-ui`;

      // Trap skull markers on explored rooms
      Neo.rooms.forEach(room => {
        if (room.secret || !isRevealed(room)) return;
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
        if (room.secret || !isRevealed(room) || room === Neo.currentRoom) return;
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

    // Strong current-room emphasis. The dynamic key stays inside the minimap
    // frame footer so it does not cover rooms, pickups, enemies, or doors.
    const youRoom = currentRoom;
    if (youRoom && !youRoom.secret) {
      const yx = originX + youRoom.gx * (size + gap);
      const yy = originY + youRoom.gy * (size + gap);
      const t = Number(Neo.gameElapsedTime || 0);
      const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
      const grow = Math.round(2 + pulse * Math.max(2, size * 0.24));
      const lineW = Math.max(1.5, Math.round(size * 0.16));
      const cellCx = yx + size / 2;
      const cellCy = yy + size / 2;

      // Animated outer ring.
      Neo.ctx.globalAlpha = 0.58 + 0.42 * pulse;
      Neo.ctx.strokeStyle = '#fff7c2';
      Neo.ctx.lineWidth = lineW;
      Neo.ctx.strokeRect(yx - grow + 0.5, yy - grow + 0.5, size + grow * 2 - 1, size + grow * 2 - 1);
      // Solid inner contrast keeps the current cell readable over all room colors.
      Neo.ctx.globalAlpha = 1;
      Neo.ctx.strokeStyle = '#0a0d14';
      Neo.ctx.lineWidth = 1;
      Neo.ctx.strokeRect(yx - 1.5, yy - 1.5, size + 3, size + 3);
      Neo.ctx.strokeStyle = '#fffbe6';
      Neo.ctx.lineWidth = Math.max(1.5, Math.round(size * 0.18));
      Neo.ctx.strokeRect(yx + 0.5, yy + 0.5, size - 1, size - 1);
    }

    const drawLegendIcon = (entry, x, y, pulse = 1) => {
      const s = keyIconSize;
      const cx = x + s / 2;
      const cy = y + keyPillH / 2;
      Neo.ctx.fillStyle = entry.color;
      Neo.ctx.strokeStyle = entry.color;
      Neo.ctx.lineWidth = Math.max(1, Math.round(s * 0.16));
      if (entry.mode === 'square') {
        Neo.ctx.fillRect(x, cy - s / 2, s, s);
      } else if (entry.mode === 'triangle') {
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(cx, cy - s / 2);
        Neo.ctx.lineTo(cx + s / 2, cy + s / 2);
        Neo.ctx.lineTo(cx - s / 2, cy + s / 2);
        Neo.ctx.closePath();
        Neo.ctx.fill();
      } else if (entry.mode === 'star') {
        Neo.ctx.font = `bold ${Math.max(7, Math.round(s * 1.45))}px system-ui`;
        Neo.ctx.textAlign = 'center';
        Neo.ctx.textBaseline = 'middle';
        Neo.ctx.fillText('★', cx, cy + 0.5);
      } else if (entry.mode === 'you') {
        Neo.ctx.globalAlpha = 0.82 + 0.18 * pulse;
        Neo.ctx.strokeRect(x + 0.5, cy - s / 2 + 0.5, s - 1, s - 1);
      } else {
        Neo.ctx.beginPath();
        Neo.ctx.arc(cx, cy, s / 2, 0, Math.PI * 2);
        Neo.ctx.fill();
      }
    };
    const footerTop = originY + mapHeight + keyFooterPad;
    if (currentRoom && !currentRoom.secret) {
      const t = Number(Neo.gameElapsedTime || 0);
      const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
      Neo.ctx.globalAlpha = 0.58 + 0.26 * pulse;
      Neo.ctx.fillStyle = '#fff7c2';
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(Neo.clamp(currentCellCx, originX + 5, originX + mapWidth - 5), footerTop - 1);
      Neo.ctx.lineTo(Neo.clamp(currentCellCx - 4, originX + 3, originX + mapWidth - 8), footerTop + 3);
      Neo.ctx.lineTo(Neo.clamp(currentCellCx + 4, originX + 8, originX + mapWidth - 3), footerTop + 3);
      Neo.ctx.closePath();
      Neo.ctx.fill();
    }
    Neo.ctx.font = keyFont;
    Neo.ctx.textAlign = 'left';
    Neo.ctx.textBaseline = 'middle';
    legendRows.forEach((row, rowIndex) => {
      let x = Neo.clamp(currentCellCx - legendRowWidths[rowIndex] / 2, originX + keyFramePad, originX + mapWidth - keyFramePad - legendRowWidths[rowIndex]);
      const y = footerTop + rowIndex * (keyPillH + keyRowGap);
      row.forEach(entry => {
        Neo.ctx.globalAlpha = entry.key === 'you' ? 0.94 : 0.82;
        Neo.ctx.fillStyle = 'rgba(10,13,20,0.84)';
        Neo.ctx.beginPath();
        Neo.ctx.roundRect(x, y, entry.width, keyPillH, 3);
        Neo.ctx.fill();
        Neo.ctx.strokeStyle = entry.key === 'you' ? '#fff7c2' : 'rgba(255,255,255,0.28)';
        Neo.ctx.lineWidth = 1;
        Neo.ctx.stroke();
        Neo.ctx.globalAlpha = 1;
        drawLegendIcon(entry, x + keyPadX, y, 0.5 + 0.5 * Math.sin(Number(Neo.gameElapsedTime || 0) * 5.0));
        Neo.ctx.globalAlpha = 1;
        Neo.ctx.font = keyFont;
        Neo.ctx.textAlign = 'left';
        Neo.ctx.textBaseline = 'middle';
        Neo.ctx.fillStyle = '#fffbe6';
        Neo.ctx.fillText(entry.label, x + keyPadX + keyIconSize + keyIconGap, y + keyPillH / 2 + 0.5);
        x += entry.width + keyEntryGap;
      });
    });

    
    Neo.ctx.restore();

    const viewportBounds = {
      left: canvasRect.left + minimapVisualLeft * scaleX,
      top: canvasRect.top + minimapVisualTop * scaleY,
      right: canvasRect.left + minimapVisualRight * scaleX,
      bottom: canvasRect.top + minimapVisualBottom * scaleY,
    };
    Neo.minimapLayoutState = {
      x: originX,
      y: originY,
      width: mapWidth,
      height: minimapFrameHeight,
      scale: minimapScale,
      offsetX: minimapOffsetX,
      offsetY: minimapOffsetY,
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
    if (type === 'antony_blemmye') return 'ANTONY BLEMMYAE';
    if (type === 'handsome_devil') return 'HANDSOME DEVIL';
    if (type === 'god') return 'GOD';
    return type.toUpperCase();
  }

  // Accent color per boss; drives both the bar fill and its glow.
  function getBossColor(type) {
    switch (type) {
      case 'god': return '#ffffff';
      case 'bulk_golem': return '#ff8e4a';
      case 'artificer_knave': return '#ffd27d';
      case 'bowman_bane': return '#c9aaff';
      case 'antony_blemmye': return '#ffcf8a';
      case 'handsome_devil': return '#ff3348';
      default: return '#e4b9ff';
    }
  }

  function drawBossHealthBars() {
    const bosses = Neo.enemies.filter(enemy => Neo.isBossType(enemy.type) || enemy?.bountyTarget);
    if (!bosses.length) return;

    const perfMode = window.NeoSettings?.isPerformanceMode?.() !== false;
    const lowFx = perfMode && Neo.particles.length > 48;

    // The boss bar participates in the per-widget HUD Layout editor: a null/absent
    // scale inherits the global HUD scale, otherwise it uses its own. Visibility is
    // handled by the caller (skips drawBossHealthBars entirely when hidden).
    const accessHudScale = Number(window.NeoSettings?.getAccess?.()?.hudScale);
    const globalHudScale = Number.isFinite(accessHudScale) ? Neo.clamp(accessHudScale, 0.5, 2) : 1;
    const barEntry = window.NeoSettings?.getHudElements?.()?.bossbar;
    const ownScale = Number(barEntry?.scale);
    const hudScale = Number.isFinite(ownScale) ? Neo.clamp(ownScale, 0.5, 2) : globalHudScale;
    const barOffsetX = Number.isFinite(Number(barEntry?.x)) ? Number(barEntry.x) : 0;
    const barOffsetY = Number.isFinite(Number(barEntry?.y)) ? Number(barEntry.y) : 0;

    // The canvas uses a cover-style layout and is often cropped, so the buffer is
    // wider/taller than what's on screen. Anchor to the VISIBLE viewport (same math
    // as drawMinimap) — anchoring to the raw buffer center floats the bar up into
    // the cropped-off top and centers it in buffer space (reads too high + small).
    const canvasRect = Neo.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width > 0 ? canvasRect.width / Neo.canvas.width : 1;
    const scaleY = canvasRect.height > 0 ? canvasRect.height / Neo.canvas.height : 1;
    const visibleLeft = Neo.clamp(-canvasRect.left / scaleX, 0, Neo.canvas.width);
    const visibleTop = Neo.clamp(-canvasRect.top / scaleY, 0, Neo.canvas.height);
    const visibleRight = Neo.clamp((window.innerWidth - canvasRect.left) / scaleX, 0, Neo.canvas.width);
    const visibleWidth = Math.max(1, visibleRight - visibleLeft);

    // The boss bar reads as a major "this is a fight" element, so its default size
    // is doubled relative to the base. The HUD Layout scale slider multiplies on top
    // of this (Auto/100% = 2×, 200% = 4×); the width cap still prevents overflow.
    const BOSS_BAR_BASE_SCALE = 2;
    const scale = hudScale * BOSS_BAR_BASE_SCALE;

    const count = bosses.length;
    const crowd = Math.min(count - 1, 5);
    // Cap the scaled width to the visible viewport so a large bar / wide scale can
    // never overflow past the on-screen edges; edgeInset keeps a small margin.
    const edgeInset = visibleWidth <= 700 ? 12 : 24;
    const baseWidth = Math.max(210, Math.round(440 - crowd * 44));
    const maxWidth = Math.max(120, visibleWidth - edgeInset * 2);
    const width = Math.min(maxWidth, Math.round(baseWidth * scale));
    const height = Math.max(9, Math.round((16 - crowd * 1.2) * scale));
    const gap = height + Math.max(12, Math.round((18 - crowd * 1.3) * scale));
    const labelFontSize = Math.max(8, Math.round((12 - crowd * 0.65) * scale));
    const radius = height / 2;
    // Top-center anchor within the visible viewport (genre convention; clears the
    // top-left coins widget), nudged by the player's HUD Layout offset. The Y inset
    // sits below the top-center Timer/Floor pill (a ~44px DOM overlay pinned to the
    // top edge) with extra clearance for the now-larger bar; screen px → buffer px.
    // Stacks downward for multi-boss.
    const topInset = 96 / scaleY;
    const startX = Math.round(Neo.clamp(
      visibleLeft + (visibleWidth - width) / 2 + barOffsetX / scaleX,
      visibleLeft + edgeInset,
      visibleRight - width - edgeInset,
    ));
    const startY = Math.round(visibleTop + topInset + barOffsetY / scaleY);
    const labelX = startX + width / 2;

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const ctx = Neo.ctx;

    bosses
      .slice()
      .sort((a, b) => Number(b.max || b.maxHp || 0) - Number(a.max || a.maxHp || 0))
      .forEach((boss, index) => {
        const y = startY + index * gap;
        const hpPct = Neo.clamp(
          Number(boss.hp || 0) / Math.max(1, Number(boss.max || boss.maxHp || 1)),
          0,
          1
        );
        const escapeText = Number(boss.bountyEscapeTimer || 0) > 0 ? ` • ESCAPE ${Math.ceil(boss.bountyEscapeTimer)}s` : '';
        const weaknessText = boss.bountyWeakness ? ` • WEAK: ${String(boss.bountyWeakness).toUpperCase()}` : '';
        const label = boss.bountyTarget
          ? `${boss.bountyName || getBossLabel(boss.type)} ${boss.bountyEpithet || ''}${weaknessText}${escapeText}`
          : getBossLabel(boss.type);
        const color = boss.bountyTarget ? '#ff9d66' : getBossColor(boss.type);

        // Lagging "damage trail": a lighter ghost that drains toward real HP so
        // each hit reads as a satisfying chunk rather than an instant snap.
        if (boss._barTrail == null || boss._barTrail < hpPct) boss._barTrail = hpPct;
        if (boss._barTrailAt == null) boss._barTrailAt = now;
        const dt = Math.min(0.05, (now - boss._barTrailAt) / 1000);
        boss._barTrailAt = now;
        // Hold briefly after a hit, then ease the trail down to current HP.
        boss._barTrail = Math.max(hpPct, boss._barTrail - dt * 0.55);
        const trailPct = boss._barTrail;

        // Track the boss's peak barrier so the shield overlay fills relative to
        // its own high-water mark (barrier has no stored max; shield units can
        // refresh it to varying sizes, so we learn the cap from the values seen).
        const barrier = Math.max(0, Number(boss.barrier || 0));
        if (barrier > (boss._barrierPeak || 0)) boss._barrierPeak = barrier;
        // Forget the peak once the shield is fully gone so a fresh, smaller shield
        // later doesn't read as a sliver against a stale, larger cap.
        if (barrier <= 0) boss._barrierPeak = 0;
        const barrierPct = Neo.clamp(barrier / Math.max(1, boss._barrierPeak || 1), 0, 1);

        const fillW = Math.max(0, width * hpPct);
        const trailW = Math.max(0, width * trailPct);

        ctx.save();

        // Drop shadow plate behind the whole bar for separation from the scene.
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(startX - 4, y - 3, width + 8, height + 6, radius + 3);
        ctx.fill();

        // Track (empty bar) with a dark vertical gradient for depth.
        const track = ctx.createLinearGradient(0, y, 0, y + height);
        track.addColorStop(0, '#1a0a20');
        track.addColorStop(1, '#2c1335');
        ctx.fillStyle = track;
        ctx.beginPath();
        ctx.roundRect(startX, y, width, height, radius);
        ctx.fill();

        // Clip everything else to the rounded track so fills keep clean caps.
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(startX, y, width, height, radius);
        ctx.clip();

        // Damage trail segment (dim wash of the boss color).
        if (trailW > fillW + 0.5) {
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          ctx.fillRect(startX, y, trailW, height);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.22;
          ctx.fillRect(startX, y, trailW, height);
          ctx.globalAlpha = 1;
        }

        // Main fill: vertical gradient gives the bar a glossy, metallic body.
        if (fillW > 0) {
          const fill = ctx.createLinearGradient(0, y, 0, y + height);
          fill.addColorStop(0, 'rgba(255,255,255,0.55)');
          fill.addColorStop(0.18, color);
          fill.addColorStop(0.85, color);
          fill.addColorStop(1, 'rgba(0,0,0,0.35)');
          if (!lowFx) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
          }
          ctx.fillStyle = fill;
          ctx.fillRect(startX, y, fillW, height);
          ctx.shadowBlur = 0;

          // Top glossy highlight strip.
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(startX, y + 1, fillW, Math.max(1, height * 0.28));

          // Bright leading edge tick — reads as an "energy" cap.
          const edgeX = startX + fillW;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillRect(edgeX - 2, y, 2, height);
        }

        ctx.restore(); // end clip

        // Crisp inner border around the track.
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(startX + 0.5, y + 0.5, width - 1, height - 1, radius);
        ctx.stroke();

        // Numeric HP readout centered on the bar: makes current and max explicit.
        const curHp = Math.max(0, Math.ceil(Number(boss.hp || 0)));
        const maxHp = Math.max(1, Math.ceil(Number(boss.max || boss.maxHp || 1)));
        const hpText = `${curHp} / ${maxHp}`;
        const hpFontSize = Math.max(7, Math.min(height - 2, Math.round(height * 0.78)));
        ctx.font = `${hpFontSize}px ${CANVAS_PIXEL_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur = 3;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(hpText, labelX, y + height / 2 + 0.5);
        ctx.fillStyle = '#fff';
        ctx.fillText(hpText, labelX, y + height / 2 + 0.5);
        ctx.shadowBlur = 0;

        // Shield overlay: a slim cyan bar riding the top edge of the health bar,
        // shown only while the boss actually has a barrier up.
        if (barrier > 0) {
          const shieldColor = '#7ed6ff';
          const shieldH = Math.max(3, Math.round(height * 0.42));
          const shieldY = y - shieldH + 1; // overlaps the top edge for a "layered" read
          const shieldW = Math.max(0, width * barrierPct);
          const shieldR = Math.min(shieldH / 2, radius);

          // Dark plate so the overlay separates from whatever is behind it.
          ctx.fillStyle = 'rgba(4,16,24,0.7)';
          ctx.beginPath();
          ctx.roundRect(startX, shieldY, width, shieldH, shieldR);
          ctx.fill();

          if (shieldW > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(startX, shieldY, width, shieldH, shieldR);
            ctx.clip();
            if (!lowFx) {
              ctx.shadowColor = shieldColor;
              ctx.shadowBlur = 8;
            }
            ctx.fillStyle = shieldColor;
            ctx.fillRect(startX, shieldY, shieldW, shieldH);
            ctx.shadowBlur = 0;
            // Top highlight strip for the same glossy feel as the HP fill.
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillRect(startX, shieldY + 0.5, shieldW, Math.max(1, shieldH * 0.3));
            ctx.restore();
          }

          ctx.strokeStyle = 'rgba(126,214,255,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(startX + 0.5, shieldY + 0.5, width - 1, shieldH - 1, shieldR);
          ctx.stroke();

          // Numeric shield readout (current barrier) tucked at the bar's right end.
          const shieldText = String(Math.ceil(barrier));
          const shieldFont = Math.max(6, Math.min(shieldH - 1, Math.round(shieldH * 0.85)));
          ctx.font = `${shieldFont}px ${CANVAS_PIXEL_FONT}`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.95)';
          ctx.shadowBlur = 2;
          ctx.fillStyle = '#dff6ff';
          ctx.fillText(shieldText, startX + width - 3, shieldY + shieldH / 2 + 0.5);
          ctx.shadowBlur = 0;
        }

        // Label above the bar, letter-spaced and shadowed for legibility.
        ctx.font = `${labelFontSize}px ${CANVAS_PIXEL_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        if (ctx.letterSpacing !== undefined) ctx.letterSpacing = count > 1 ? '1px' : '2px';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#fff';
        // Lift the label clear of the shield overlay when one is showing.
        const labelY = barrier > 0 ? y - Math.max(3, Math.round(height * 0.42)) - 5 : y - 5;
        ctx.fillText(label, labelX, labelY);
        ctx.shadowBlur = 0;
        if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';

        ctx.restore();
      });
  }


  // floor transition animation
  function drawFloorTransition() {
    const duration = 1.25;
    if (!Neo.showFloorTransition || Neo.floorTransitionTime > duration) return;
    const _access = window.NeoSettings?.getAccess() || {};
    if (_access.reduceMotion) return;

    const progress = Neo.clamp(Neo.floorTransitionTime / duration, 0, 1);
    const smooth = t => {
      const clamped = Neo.clamp(t, 0, 1);
      return clamped * clamped * (3 - 2 * clamped);
    };
    const w = Neo.canvas.width;
    const h = Neo.canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const minSide = Math.min(w, h);
    const wipeIn = smooth(progress / 0.34);
    const wipeOut = smooth((progress - 0.66) / 0.34);
    const overlayAlpha = Math.max(0, Math.min(1, wipeIn - wipeOut));
    const labelAlpha = progress < 0.72
      ? smooth((progress - 0.28) / 0.18)
      : 1 - smooth((progress - 0.72) / 0.2);
    const wipeWidth = w * (progress < 0.5 ? smooth(progress / 0.42) : 1);

    Neo.ctx.save();
    Neo.ctx.globalCompositeOperation = 'source-over';

    Neo.ctx.globalAlpha = overlayAlpha;
    Neo.ctx.fillStyle = '#05070d';
    Neo.ctx.fillRect(0, 0, w, h);

    if (progress < 0.5) {
      Neo.ctx.globalAlpha = 1;
      Neo.ctx.fillStyle = '#05070d';
      Neo.ctx.fillRect(0, 0, wipeWidth, h);
      Neo.ctx.fillStyle = 'rgba(128, 160, 190, 0.16)';
      Neo.ctx.fillRect(Math.max(0, wipeWidth - 2), 0, 2, h);
    }

    Neo.ctx.globalAlpha = Math.max(0, Math.min(1, labelAlpha));
    Neo.ctx.translate(centerX, centerY);
    Neo.ctx.textAlign = 'center';
    Neo.ctx.textBaseline = 'middle';
    const floorLabel = `FLOOR ${Neo.floor}`;
    const maxLabelWidth = Math.max(160, w * 0.84);
    let floorFontSize = Math.min(64, Math.max(38, minSide * 0.115));
    Neo.ctx.font = `900 ${floorFontSize}px system-ui`;
    while (floorFontSize > 34 && Neo.ctx.measureText(floorLabel).width > maxLabelWidth) {
      floorFontSize -= 4;
      Neo.ctx.font = `900 ${floorFontSize}px system-ui`;
    }
    Neo.ctx.fillStyle = '#f4f7fb';
    Neo.ctx.fillText(floorLabel, 0, 0);

    Neo.ctx.restore();
  }

  function drawActionIcons() {
    const drawHudMoveIcon = (slot, canvas, fallbackColor, fallbackPixels) => {
      // The melee/LMB slot shows the equipped weapon's icon when one is equipped,
      // matching the inventory/shop. Falls back to the melee move, then pixels.
      if (slot === 'melee' && canvas && typeof Neo.drawWeaponToastIcon === 'function') {
        const weaponDef = Neo.WEAPON_DEFS[Neo.getEquippedWeapon()];
        if (weaponDef) {
          Neo.drawWeaponToastIcon(canvas, weaponDef);
          return;
        }
      }
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
      color: '#5fb2ff',
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
      color: '#ffd23f',
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
