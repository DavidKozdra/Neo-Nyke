// props.js — standalone IIFE. Drawing world props, pickups, projectiles, corpses.
  function getVisualBloodMultiplier() {
    const value = window.NeoSettings?.getBloodMultiplier?.()
      ?? window.NeoSettings?.getGameplay?.()?.bloodMultiplier
      ?? window.NeoSettings?.getAccess?.()?.bloodMultiplier
      ?? 1;
    return Neo.clamp(Math.round(Number(value) || 1), 1, 10);
  }

  const SECRET_VENDOR_CURRENCY_PIXELS = {
    coin: [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
      [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
      [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
    ],
    loop: [
      [2, 1], [3, 1], [4, 1],
      [1, 2], [5, 2],
      [1, 3], [5, 3],
      [1, 4], [5, 4],
      [2, 5], [3, 5], [4, 5],
      [2, 2], [4, 2], [2, 4], [4, 4],
      [3, 3],
    ],
  };

  function drawSecretVendorCurrencyIcon(x, y, size, usesCoins, color) {
    const iconCanvas = usesCoins ? Neo.ui.coinIcon : Neo.ui.hudLoopIcon;
    if (iconCanvas instanceof HTMLCanvasElement && iconCanvas.width > 0 && iconCanvas.height > 0) {
      Neo.ctx.imageSmoothingEnabled = false;
      Neo.ctx.drawImage(iconCanvas, x, y, size, size);
      return;
    }
    const pixels = usesCoins ? SECRET_VENDOR_CURRENCY_PIXELS.coin : SECRET_VENDOR_CURRENCY_PIXELS.loop;
    const pixelSize = size / 8;
    Neo.ctx.fillStyle = color;
    pixels.forEach(([px, py]) => {
      Neo.ctx.fillRect(x + px * pixelSize, y + py * pixelSize, Math.ceil(pixelSize), Math.ceil(pixelSize));
    });
  }

  const SHOP_GREETINGS = [
    'Coin for your courage, traveler?',
    'Everything here outlives you. Browse well.',
    'Give Me every penny you have',
    'Steel and salves — pick your poison.',
    'You break it down there, you buy it up here.',
    'The deeper you go, the more you’ll wish you bought.',
    'Best prices this side of the GOD.',
    'Spend it. You can’t take coins to the grave.',
  ];

  function getShopGreeting(room) {
    if (!room) return SHOP_GREETINGS[0];
    // Stable per-room so the line doesn't flicker frame to frame.
    const seed = (Number(room.gx) || 0) * 31 + (Number(room.gy) || 0) * 17 + (Number(room.floor) || Neo.floor || 0) * 7;
    return SHOP_GREETINGS[Math.abs(seed) % SHOP_GREETINGS.length];
  }

  function drawShopSign() {
    const room = Neo.currentRoom;
    if (!room || room.type !== 'shop') return;
    const theme = Neo.ROOM_ART_THEMES.shop;
    const cx = Neo.ROOM_W / 2;
    const y = 84;
    const t = Date.now() / 1000;
    const sway = Math.sin(t * 1.6) * 1.5;

    Neo.ctx.save();
    Neo.ctx.translate(cx, y);

    // Hanging chains to the signboard.
    Neo.ctx.strokeStyle = 'rgba(180, 150, 90, 0.5)';
    Neo.ctx.lineWidth = 2;
    Neo.ctx.beginPath();
    Neo.ctx.moveTo(-92, -34); Neo.ctx.lineTo(-92 + sway, -8);
    Neo.ctx.moveTo(92, -34); Neo.ctx.lineTo(92 + sway, -8);
    Neo.ctx.stroke();

    Neo.ctx.translate(sway, 0);

    // Signboard plaque.
    const w = 232;
    const h = 70;
    Neo.ctx.fillStyle = 'rgba(28, 18, 10, 0.92)';
    Neo.ctx.strokeStyle = theme.banner || '#9a5830';
    Neo.ctx.lineWidth = 3;
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(-w / 2, -h / 2, w, h, 8);
    Neo.ctx.fill();
    Neo.ctx.stroke();

    // Inner gold rule.
    Neo.ctx.strokeStyle = 'rgba(255, 176, 78, 0.32)';
    Neo.ctx.lineWidth = 1;
    Neo.ctx.beginPath();
    Neo.ctx.roundRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 5);
    Neo.ctx.stroke();

    // SHOP title.
    Neo.ctx.textAlign = 'center';
    Neo.ctx.textBaseline = 'middle';
    Neo.ctx.font = 'bold 26px system-ui';
    Neo.ctx.shadowColor = 'rgba(255, 176, 78, 0.7)';
    Neo.ctx.shadowBlur = 10;
    Neo.ctx.fillStyle = '#ffd07a';
    Neo.ctx.fillText('❖ SHOP ❖', 0, -8);

    // Greeting line.
    Neo.ctx.shadowBlur = 0;

    Neo.ctx.font = 'italic 0.5em system-ui';
    Neo.ctx.fillStyle = 'rgba(240, 214, 170, 0.85)';
    Neo.ctx.fillText(getShopGreeting(room), 0, 16);

    Neo.ctx.restore();
  }

  function drawWorldProps() {
    const theme = Neo.getRoomArtTheme();
    drawShopSign();
    Neo.hazards.forEach(hazard => {
      Neo.ctx.save();
      Neo.ctx.translate(hazard.x, hazard.y);
      if (hazard.kind === 'lava') {
        const t = Neo.lavaAnimTime * (hazard.pulse || 1.5) + (hazard.phase || 0);
        const tile = Neo.ENV_TILE_SIZE;
        const isRect = hazard.shape === 'rect';
        const isStaticRoomPool = Neo.isStaticRoomLava?.(hazard);
        const w = isRect ? hazard.w : hazard.r * 2;
        const h = isRect ? hazard.h : hazard.r * 2;
        const left = -w / 2;
        const top = -h / 2;

        Neo.ctx.save();
        Neo.ctx.beginPath();
        if (isRect) Neo.ctx.rect(left, top, w, h);
        else Neo.ctx.arc(0, 0, hazard.r, 0, Math.PI * 2);
        Neo.ctx.clip();

        if (isStaticRoomPool) {
          // Static room pools are baked into the floor cache so they replace floor tiles.
        } else if (isRect) {
          for (let ty = 0; ty < h; ty += tile) {
            for (let tx = 0; tx < w; tx += tile) {
              Neo.drawEnvironmentTile('floor_lava', left + tx, top + ty, tile, tile);
            }
          }
        } else {
          const r = hazard.r;
          const startX = -Math.ceil(r / tile) * tile;
          const startY = -Math.ceil(r / tile) * tile;
          const endX = Math.ceil(r / tile) * tile;
          const endY = Math.ceil(r / tile) * tile;
          for (let ty = startY; ty < endY; ty += tile) {
            for (let tx = startX; tx < endX; tx += tile) {
              Neo.drawEnvironmentTile('floor_lava', tx, ty, tile, tile);
            }
          }
        }

        const heatPulse = 0.18 + Math.sin(t * 2.4) * 0.06;
        Neo.ctx.globalCompositeOperation = 'lighter';
        Neo.ctx.fillStyle = `rgba(255,140,40,${heatPulse})`;
        Neo.ctx.fillRect(left, top, w, h);
        Neo.ctx.globalCompositeOperation = 'source-over';

        const seedBase = (hazard.phase || 0) * 1000 + (hazard.x || 0) * 0.31 + (hazard.y || 0) * 0.17;
        const bubbleCount = Math.max(3, Math.round((w * h) / 2200));
        for (let i = 0; i < bubbleCount; i += 1) {
          const seed = seedBase + i * 137.13;
          const period = 1.8 + ((Math.sin(seed) + 1) * 0.5) * 1.6;
          const offset = ((Math.cos(seed * 1.7) + 1) * 0.5) * period;
          const localT = ((Neo.lavaAnimTime + offset) % period) / period;
          const bx = left + 6 + ((Math.sin(seed * 2.3) + 1) * 0.5) * (w - 12);
          const by = top + 6 + ((Math.cos(seed * 3.1) + 1) * 0.5) * (h - 12);
          const drift = Math.sin(seed * 5 + Neo.lavaAnimTime * 0.6) * 1.4;
          const maxR = 3.2 + ((Math.sin(seed * 4.7) + 1) * 0.5) * 3.6;
          const swell = Math.sin(localT * Math.PI);
          const r = maxR * swell;
          if (r < 0.6) continue;
          const alpha = 0.55 * Math.min(1, swell * 1.6);

          Neo.ctx.fillStyle = `rgba(255,210,110,${alpha})`;
          Neo.ctx.beginPath();
          Neo.ctx.arc(bx + drift, by, r, 0, Math.PI * 2);
          Neo.ctx.fill();
          Neo.ctx.fillStyle = `rgba(255,245,200,${alpha * 0.9})`;
          Neo.ctx.beginPath();
          Neo.ctx.arc(bx + drift - r * 0.35, by - r * 0.35, r * 0.45, 0, Math.PI * 2);
          Neo.ctx.fill();

          if (localT > 0.86) {
            const popT = (localT - 0.86) / 0.14;
            Neo.ctx.strokeStyle = `rgba(255,180,80,${(1 - popT) * 0.7})`;
            Neo.ctx.lineWidth = 1;
            Neo.ctx.beginPath();
            Neo.ctx.arc(bx + drift, by, r + popT * 3, 0, Math.PI * 2);
            Neo.ctx.stroke();
          }
        }
        Neo.ctx.restore();

        Neo.ctx.strokeStyle = `rgba(255,120,60,${0.55 + Math.sin(t * 3.1) * 0.18})`;
        Neo.ctx.shadowColor = '#ff5a3d';
        Neo.ctx.shadowBlur = 10 + Math.sin(t * 3.1) * 4;
        Neo.ctx.lineWidth = 2;
        Neo.ctx.beginPath();
        if (isRect) Neo.ctx.rect(left + 1, top + 1, w - 2, h - 2);
        else Neo.ctx.arc(0, 0, hazard.r - 1, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.shadowBlur = 0;
      } else if (hazard.kind === 'explosive_trap') {
        const now = Date.now();
        const t = now * 0.008 + hazard.x * 0.01;
        const armed = !!hazard.triggered;
        const fuseRatio = armed ? Neo.clamp(1 - (hazard.fuse || 0) / (hazard.fuseDuration || 0.78), 0, 1) : 0;
        const r = hazard.r || 14;
        const blastR = hazard.blastRadius || 88;
        const trigR = hazard.triggerRadius || 34;

        // blast-radius danger zone (always visible, dim when unarmed)
        Neo.ctx.globalAlpha = armed ? (0.13 + fuseRatio * 0.18) : 0.06;
        Neo.ctx.fillStyle = '#ff4400';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, blastR, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.globalAlpha = 1;

        // blast-radius dashed outline
        Neo.ctx.setLineDash([8, 6]);
        Neo.ctx.strokeStyle = armed ? `rgba(255,80,40,${0.55 + fuseRatio * 0.35})` : 'rgba(255,140,60,0.28)';
        Neo.ctx.lineWidth = armed ? 2 : 1.5;
        Neo.ctx.shadowColor = armed ? '#ff4400' : 'transparent';
        Neo.ctx.shadowBlur = armed ? 10 + fuseRatio * 14 : 0;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, blastR, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.setLineDash([]);
        Neo.ctx.shadowBlur = 0;

        // trigger-radius ring (only when unarmed — shows detection zone)
        if (!armed) {
          Neo.ctx.setLineDash([4, 4]);
          Neo.ctx.strokeStyle = 'rgba(255,200,80,0.38)';
          Neo.ctx.lineWidth = 1;
          Neo.ctx.beginPath();
          Neo.ctx.arc(0, 0, trigR, 0, Math.PI * 2);
          Neo.ctx.stroke();
          Neo.ctx.setLineDash([]);
        }

        // mine body
        const bodyPulse = armed ? 1 + Math.sin(t * (3 + fuseRatio * 5)) * (0.06 + fuseRatio * 0.1) : 1;
        Neo.ctx.shadowColor = armed ? `rgba(255,${Math.round(100 - fuseRatio * 80)},40,0.9)` : 'rgba(255,160,60,0.4)';
        Neo.ctx.shadowBlur = armed ? 14 + fuseRatio * 20 : 8;
        Neo.ctx.fillStyle = armed ? `rgb(${Math.round(40 + fuseRatio * 30)},10,6)` : 'rgb(28,28,32)';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, r * bodyPulse, 0, Math.PI * 2);
        Neo.ctx.fill();

        // outer ring
        Neo.ctx.strokeStyle = armed
          ? `rgb(255,${Math.round(100 - fuseRatio * 80)},40)`
          : '#c8a040';
        Neo.ctx.lineWidth = armed ? 3 : 2;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, r * bodyPulse, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.shadowBlur = 0;

        // warning stripes on body (hazard pattern)
        Neo.ctx.save();
        Neo.ctx.clip();
        const stripeColor = armed
          ? `rgba(255,${Math.round(80 - fuseRatio * 60)},30,${0.7 + fuseRatio * 0.3})`
          : 'rgba(220,170,40,0.55)';
        Neo.ctx.strokeStyle = stripeColor;
        Neo.ctx.lineWidth = 3;
        for (let si = -3; si <= 3; si += 1) {
          Neo.ctx.beginPath();
          Neo.ctx.moveTo(si * 7 - r, r);
          Neo.ctx.lineTo(si * 7 + r, -r);
          Neo.ctx.stroke();
        }
        Neo.ctx.restore();

        // fuse countdown arc when armed
        if (armed) {
          Neo.ctx.strokeStyle = `rgba(255,${Math.round(220 - fuseRatio * 180)},60,0.95)`;
          Neo.ctx.lineWidth = 3;
          Neo.ctx.lineCap = 'round';
          Neo.ctx.shadowColor = '#ffcc00';
          Neo.ctx.shadowBlur = 8;
          Neo.ctx.beginPath();
          Neo.ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + fuseRatio * Math.PI * 2);
          Neo.ctx.stroke();
          Neo.ctx.lineCap = 'butt';
          Neo.ctx.shadowBlur = 0;
        }

        // pressure-plate nub on top
        Neo.ctx.fillStyle = armed ? '#ff6030' : '#b89040';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, -r * 0.55, r * 0.22, 0, Math.PI * 2);
        Neo.ctx.fill();
      } else if (hazard.kind === 'healing_zone') {
        const t = Date.now() * 0.004 + (hazard.ttl || 0);
        const pulse = 1 + Math.sin(t * 2.2) * 0.08;
        const inner = hazard.r * 0.62 * pulse;
        Neo.ctx.fillStyle = `rgba(80,255,140,${0.12 + Math.sin(t * 1.8) * 0.04})`;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, inner, 0, Math.PI * 2);
        Neo.ctx.fill();

        Neo.ctx.strokeStyle = '#35ff6f';
        Neo.ctx.shadowColor = '#35ff6f';
        Neo.ctx.shadowBlur = 18;
        Neo.ctx.lineWidth = 4;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        Neo.ctx.stroke();

        Neo.ctx.globalAlpha = 0.8;
        Neo.ctx.lineWidth = 2;
        for (let i = 0; i < 6; i += 1) {
          const a = t + i * (Math.PI * 2 / 6);
          const px = Math.cos(a) * (hazard.r * 0.7);
          const py = Math.sin(a) * (hazard.r * 0.7);
          Neo.ctx.beginPath();
          Neo.ctx.moveTo(px - 4, py);
          Neo.ctx.lineTo(px + 4, py);
          Neo.ctx.moveTo(px, py - 4);
          Neo.ctx.lineTo(px, py + 4);
          Neo.ctx.stroke();
        }
        Neo.ctx.globalAlpha = 1;

        Neo.ctx.lineWidth = 2;
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(-8, 0);
        Neo.ctx.lineTo(8, 0);
        Neo.ctx.moveTo(0, -8);
        Neo.ctx.lineTo(0, 8);
        Neo.ctx.stroke();
        Neo.ctx.globalAlpha = 0.55;
        Neo.ctx.strokeStyle = 'rgba(210,255,225,0.75)';
        Neo.ctx.lineWidth = 1.5;
        for (let index = 0; index < 10; index += 1) {
          const a = -t * 0.55 + index * (Math.PI * 2 / 10);
          const r0 = hazard.r * 0.84;
          const r1 = hazard.r * 0.93;
          Neo.ctx.beginPath();
          Neo.ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          Neo.ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
          Neo.ctx.stroke();
        }
        Neo.ctx.globalAlpha = 1;
      } else if (hazard.kind === 'fire_circle') {
        const t = Date.now() * 0.005;
        const pulse = 1 + Math.sin(t * 2.6) * 0.07;
        Neo.ctx.strokeStyle = '#ff7b32';
        Neo.ctx.shadowColor = '#ff7b32';
        Neo.ctx.shadowBlur = 18;
        Neo.ctx.lineWidth = 4;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.fillStyle = 'rgba(255,102,40,0.15)';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, hazard.r * 0.76, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.globalAlpha = 0.78;
        Neo.ctx.strokeStyle = 'rgba(255,205,90,0.8)';
        Neo.ctx.lineWidth = 2;
        for (let index = 0; index < 14; index += 1) {
          const a = t * 0.9 + index * (Math.PI * 2 / 14);
          const wiggle = Math.sin(t * 2 + index) * 4;
          const r0 = hazard.r * 0.46 + wiggle;
          const r1 = hazard.r * 0.68 + wiggle;
          Neo.ctx.beginPath();
          Neo.ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          Neo.ctx.lineTo(Math.cos(a + 0.14) * r1, Math.sin(a + 0.14) * r1);
          Neo.ctx.stroke();
        }
        Neo.ctx.globalAlpha = 1;
      } else if (hazard.kind === 'lightning_column') {
        const t = Date.now() * 0.006 + hazard.x * 0.01;
        Neo.ctx.fillStyle = 'rgba(112,180,255,0.12)';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, hazard.r, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.strokeStyle = '#8dd4ff';
        Neo.ctx.lineWidth = 3;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, hazard.r * (0.8 + Math.sin(t) * 0.04), 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.strokeStyle = 'rgba(170,220,255,0.9)';
        Neo.ctx.lineWidth = 2;
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(0, -hazard.r);
        Neo.ctx.lineTo(0, hazard.r);
        Neo.ctx.stroke();
        Neo.ctx.shadowColor = '#bde8ff';
        Neo.ctx.shadowBlur = 16;
        for (let index = 0; index < 5; index += 1) {
          const a = t * 1.7 + index * (Math.PI * 2 / 5);
          const branch = hazard.r * (0.28 + 0.12 * Math.sin(t + index));
          Neo.ctx.beginPath();
          Neo.ctx.moveTo(Math.cos(a) * branch * 0.3, Math.sin(a) * branch * 0.3);
          Neo.ctx.lineTo(Math.cos(a + 0.22) * branch, Math.sin(a + 0.22) * branch);
          Neo.ctx.lineTo(Math.cos(a - 0.1) * hazard.r * 0.72, Math.sin(a - 0.1) * hazard.r * 0.72);
          Neo.ctx.stroke();
        }
      } else if (hazard.kind === 'red_spikes') {
        const armed = Number(hazard.armTime || 0) <= 0;
        const t = Date.now() * 0.009 + hazard.x * 0.01;
        const pulse = armed ? 1.06 + Math.sin(t * 2.2) * 0.04 : 0.86 + Math.sin(t * 2.8) * 0.08;
        Neo.ctx.fillStyle = armed ? 'rgba(255,42,64,0.24)' : 'rgba(255,42,64,0.12)';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.strokeStyle = armed ? '#ff3348' : 'rgba(255,80,96,0.72)';
        Neo.ctx.lineWidth = armed ? 3 : 2;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, hazard.r * (0.76 + Math.sin(t) * 0.05), 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.shadowColor = '#ff3348';
        Neo.ctx.shadowBlur = armed ? 18 : 8;
        Neo.ctx.fillStyle = armed ? '#ff5264' : '#9b1c2c';
        for (let index = 0; index < 9; index += 1) {
          const a = t * 0.22 + index * (Math.PI * 2 / 9);
          const inner = hazard.r * 0.18;
          const outer = hazard.r * (armed ? 0.88 : 0.48);
          Neo.ctx.beginPath();
          Neo.ctx.moveTo(Math.cos(a - 0.13) * inner, Math.sin(a - 0.13) * inner);
          Neo.ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
          Neo.ctx.lineTo(Math.cos(a + 0.13) * inner, Math.sin(a + 0.13) * inner);
          Neo.ctx.closePath();
          Neo.ctx.fill();
        }
      } else if (hazard.kind === 'thorn_mine') {
        const armed = Number(hazard.armTime || 0) <= 0;
        const pulse = 0.85 + Math.sin(Date.now() * 0.012 + hazard.x) * 0.08;
        Neo.ctx.fillStyle = armed ? 'rgba(255,110,139,0.22)' : 'rgba(255,215,226,0.14)';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.strokeStyle = armed ? '#ff6e8b' : '#ffd7e2';
        Neo.ctx.lineWidth = 2;
        Neo.ctx.beginPath();
        for (let index = 0; index < 8; index += 1) {
          const a = index * Math.PI / 4;
          Neo.ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
          Neo.ctx.lineTo(Math.cos(a) * hazard.r, Math.sin(a) * hazard.r);
        }
        Neo.ctx.stroke();
        Neo.ctx.fillStyle = '#ffd7e2';
        Neo.ctx.fillRect(-3, -3, 6, 6);
      }
      Neo.ctx.restore();
    });

    Neo.destructibles.forEach(prop => {
      if (prop.hidden) return;
      if (prop.broken) {
        if (Neo.drawBrokenDestructible?.(prop)) return;
        return;
      }
      Neo.ctx.save();
      const shakeRatio = Neo.clamp(Number(prop.hitShake || 0) / 0.13, 0, 1);
      const hitAngle = Number(prop.lastHitAngle || 0);
      const shakeOffset = shakeRatio > 0 ? Math.sin(shakeRatio * Math.PI * 3) * 3 * shakeRatio : 0;
      Neo.ctx.translate(prop.x + Math.cos(hitAngle) * shakeOffset, prop.y + Math.sin(hitAngle) * shakeOffset);
      if (prop.kind === 'pot') {
        Neo.drawEnvironmentTile('pot_clay', -16, -18, 32, 32);
      } else if (prop.kind === 'barrel') {
        Neo.drawEnvironmentTile('barrel_oak', -24, -26, 48, 48);
      } else if (prop.kind === 'wall') {
        Neo.drawEnvironmentTile('wall_block', -26, -26, 52, 52);
        Neo.drawDestructibleBlockDamage?.(prop, 52, 52);
        Neo.ctx.strokeStyle = theme.wallEdge;
        Neo.ctx.lineWidth = 1.5;
        Neo.ctx.strokeRect(-25, -25, 50, 50);
      } else if (prop.kind === 'cover_wall') {
        Neo.drawCoverWall(prop);
      } else if (prop.kind === 'secret_wall') {
        Neo.drawCoverWall(prop);
      }
      Neo.ctx.restore();
    });

    Neo.shopOffers.forEach(offer => {
      if (offer.bought) return;
      const blockedByChallenge = offer.type === 'item' && Neo.isChallengeActive('no_items');
      const canAfford = !!Neo.player && Neo.player.coins >= offer.cost;
      Neo.ctx.save();
      Neo.ctx.translate(offer.x, offer.y);
      Neo.ctx.fillStyle = blockedByChallenge || !canAfford ? 'rgba(36,18,24,0.95)' : 'rgba(0,30,44,0.95)';
      Neo.ctx.strokeStyle = blockedByChallenge || !canAfford ? '#ff8b98' : '#ffd966';
      Neo.ctx.lineWidth = 2;
      Neo.ctx.fillRect(-26, -26, 52, 52);
      Neo.ctx.strokeRect(-26, -26, 52, 52);

      // Draw pixel icon for the offer
      const iconDef = offer.type === 'item'
        ? window.NeoNykeIconDefs?.items?.[offer.key]
        : offer.type === 'move'
          ? window.NeoNykeIconDefs?.moves?.[offer.key]
          : offer.type === 'weapon'
            ? window.NeoNykeIconDefs?.weapons?.[offer.key]
            : offer.type === 'potion'
              ? window.NeoNykeIconDefs?.pickups?.potion
              : null;
      if (iconDef) {
        const iconColor = blockedByChallenge ? '#ff8b98' : iconDef.color || '#ffffff';
        const scale = 32 / 32; // 1px per logical pixel, icon grid is 8x8 drawn at 4px each = 32px total
        const iconSize = 32;
        Neo.ctx.save();
        Neo.ctx.translate(-iconSize / 2, -iconSize / 2 - 4);
        Neo.ctx.shadowColor = iconColor;
        Neo.ctx.shadowBlur = blockedByChallenge ? 0 : 8;
        Neo.ctx.fillStyle = iconColor;
        iconDef.pixels.forEach(([px, py]) => {
          Neo.ctx.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
        });
        Neo.ctx.restore();
      } else {
        // fallback circle
        Neo.ctx.fillStyle = blockedByChallenge
          ? '#ff8b98'
          : offer.type === 'item' ? '#a857ff' : offer.type === 'potion' ? '#35ff6f' : '#8fd2ff';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, -6, 10, 0, Math.PI * 2);
        Neo.ctx.fill();
      }

      Neo.ctx.shadowBlur = 0;
      Neo.ctx.fillStyle = blockedByChallenge || !canAfford ? '#ffccd2' : '#fff';
      Neo.ctx.font = 'bold 11px system-ui';
      Neo.ctx.textAlign = 'center';
      Neo.ctx.fillText(String(offer.cost), 0, 22);
      Neo.ctx.restore();
    });
  }

  function drawPickups() {
    Neo.pickups.forEach(pickup => {
      if (!pickup || typeof pickup !== 'object' || typeof pickup.type !== 'string') return;
      Neo.ctx.save();
      const t = Date.now() / 260;
      const bob = Math.sin(t * 0.9) * 3;
      Neo.ctx.translate(pickup.x, pickup.y + bob);
      Neo.ctx.globalAlpha = 0.88 + Math.sin(t) * 0.12;
      if (pickup.type === 'coin') {
        Neo.ctx.shadowColor = '#ffd966';
        Neo.ctx.shadowBlur = 12;
        if (Neo.ui.coinIcon instanceof HTMLCanvasElement) {
          const s = 18;
          Neo.ctx.imageSmoothingEnabled = false;
          Neo.ctx.drawImage(Neo.ui.coinIcon, -s / 2, -s / 2, s, s);
        } else {
          Neo.ctx.fillStyle = '#ffd966';
          Neo.ctx.beginPath();
          Neo.ctx.arc(0, 0, 7, 0, Math.PI * 2);
          Neo.ctx.fill();
        }
      } else if (pickup.type === 'potion') {
        const potionDef = window.NeoNykeIconDefs?.pickups?.potion;
        Neo.ctx.shadowColor = '#35ff6f';
        Neo.ctx.shadowBlur = 14;
        if (potionDef) {
          Neo.ctx.fillStyle = '#35ff6f';
          Neo.ctx.imageSmoothingEnabled = false;
          potionDef.pixels.forEach(([px, py]) => {
            Neo.ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          Neo.ctx.fillStyle = '#0f8';
          Neo.ctx.beginPath();
          Neo.ctx.arc(0, 0, 10, 0, Math.PI * 2);
          Neo.ctx.fill();
        }
      } else if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const appleDef = window.NeoNykeIconDefs?.pickups?.apple || window.NeoNykeIconDefs?.pickups?.fruit;
        const fruitPulse = 1 + Math.sin(t * 2.3) * 0.08;
        Neo.ctx.shadowColor = '#ff4b4b';
        Neo.ctx.shadowBlur = 16;
        Neo.ctx.save();
        Neo.ctx.scale(fruitPulse, fruitPulse);
        if (appleDef) {
          Neo.ctx.fillStyle = '#ff4b4b';
          Neo.ctx.imageSmoothingEnabled = false;
          appleDef.pixels.forEach(([px, py]) => {
            Neo.ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          Neo.ctx.fillStyle = '#ff4b4b';
          Neo.ctx.beginPath();
          Neo.ctx.arc(0, 0, 9, 0, Math.PI * 2);
          Neo.ctx.fill();
        }
        Neo.ctx.restore();
        Neo.ctx.fillStyle = '#7a1d1d';
        Neo.ctx.fillRect(-1, -12, 2, 5);
        Neo.ctx.fillStyle = '#ffd8d8';
        Neo.ctx.fillRect(2, -11, 2, 2);
      } else if (pickup.type === 'item') {
        const item = Neo.itemRegistry.get(pickup.key);
        const color = item?.color || '#fff';
        const iconDef = window.NeoNykeIconDefs?.items?.[pickup.key];
        Neo.ctx.shadowColor = color;
        Neo.ctx.shadowBlur = item?.rarity === 'god' ? 20 : 14;
        if (item?.rarity === 'god' && item?.accent) {
          Neo.ctx.strokeStyle = item.accent;
          Neo.ctx.lineWidth = 2;
          Neo.ctx.beginPath();
          Neo.ctx.arc(0, 0, 17, 0, Math.PI * 2);
          Neo.ctx.stroke();
        }
        if (iconDef) {
          Neo.ctx.fillStyle = color;
          Neo.ctx.imageSmoothingEnabled = false;
          iconDef.pixels.forEach(([px, py]) => {
            Neo.ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          Neo.ctx.fillStyle = color;
          Neo.ctx.beginPath();
          Neo.ctx.arc(0, 0, 12, 0, Math.PI * 2);
          Neo.ctx.fill();
        }
      } else if (pickup.type === 'challengeItemChoice') {
        const item = Neo.itemRegistry.get(pickup.key);
        const color = item?.color || '#d7f6ff';
        const iconDef = window.NeoNykeIconDefs?.items?.[pickup.key];
        Neo.ctx.strokeStyle = color;
        Neo.ctx.shadowColor = color;
        Neo.ctx.shadowBlur = 18;
        Neo.ctx.lineWidth = 2;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, 20, 0, Math.PI * 2);
        Neo.ctx.stroke();
        if (iconDef) {
          Neo.ctx.fillStyle = color;
          Neo.ctx.imageSmoothingEnabled = false;
          iconDef.pixels.forEach(([px, py]) => {
            Neo.ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          Neo.ctx.fillStyle = color;
          Neo.ctx.beginPath();
          Neo.ctx.arc(0, 0, 11, 0, Math.PI * 2);
          Neo.ctx.fill();
        }
        Neo.ctx.shadowBlur = 0;
        Neo.ctx.fillStyle = '#ffffff';
        Neo.ctx.font = 'bold 9px system-ui';
        Neo.ctx.textAlign = 'center';
        Neo.ctx.fillText('PICK', 0, 33);
      } else if (pickup.type === 'ladder') {
        Neo.ctx.strokeStyle = '#7dff9e';
        Neo.ctx.shadowColor = '#7dff9e';
        Neo.ctx.shadowBlur = 18;
        Neo.ctx.lineWidth = 3;
        Neo.ctx.strokeRect(-12, -16, 24, 32);
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(-6, -12); Neo.ctx.lineTo(-6, 12);
        Neo.ctx.moveTo(6, -12); Neo.ctx.lineTo(6, 12);
        Neo.ctx.moveTo(-6, -6); Neo.ctx.lineTo(6, -6);
        Neo.ctx.moveTo(-6, 0); Neo.ctx.lineTo(6, 0);
        Neo.ctx.moveTo(-6, 6); Neo.ctx.lineTo(6, 6);
        Neo.ctx.stroke();
      } else if (pickup.type === 'jesterPortal') {
        const spawnT = Math.max(0, Number(pickup.spawnT || 0));
        const activateAt = Math.max(0.01, Number(pickup.activateAt || Neo.JESTER_PORTAL_ACTIVATE_DELAY));
        const reveal = Neo.clamp(spawnT / activateAt, 0, 1);
        const ease = 1 - (1 - reveal) ** 3;
        const spin = Date.now() / 360;
        const portalR = 16 + ease * 11;

        Neo.ctx.globalAlpha = 0.34 + ease * 0.56;
        Neo.ctx.fillStyle = 'rgba(48,8,66,0.65)';
        Neo.ctx.beginPath();
        Neo.ctx.ellipse(0, 8, portalR * 0.95, portalR * 0.34, 0, 0, Math.PI * 2);
        Neo.ctx.fill();

        Neo.ctx.globalAlpha = 0.9;
        Neo.ctx.shadowColor = '#ff8bd8';
        Neo.ctx.shadowBlur = 20;
        for (let ring = 0; ring < 2; ring += 1) {
          const ringR = portalR * (0.72 + ring * 0.3);
          const segments = 9 + ring * 3;
          Neo.ctx.strokeStyle = ring === 0 ? '#ff8bd8' : '#ffd1f5';
          Neo.ctx.lineWidth = ring === 0 ? 2.4 : 1.5;
          Neo.ctx.beginPath();
          for (let seg = 0; seg < segments; seg += 1) {
            const a0 = (seg / segments) * Math.PI * 2 + spin * (ring === 0 ? 1 : -0.7);
            const a1 = ((seg + 0.56) / segments) * Math.PI * 2 + spin * (ring === 0 ? 1 : -0.7);
            Neo.ctx.moveTo(Math.cos(a0) * ringR, Math.sin(a0) * ringR * 0.42);
            Neo.ctx.lineTo(Math.cos(a1) * ringR, Math.sin(a1) * ringR * 0.42);
          }
          Neo.ctx.stroke();
        }

        Neo.ctx.shadowBlur = 0;
        const core = Neo.ctx.createRadialGradient(0, 0, 0, 0, 0, portalR * 0.72);
        core.addColorStop(0, 'rgba(255,188,236,0.92)');
        core.addColorStop(1, 'rgba(255,95,194,0)');
        Neo.ctx.fillStyle = core;
        Neo.ctx.beginPath();
        Neo.ctx.ellipse(0, 0, portalR * 0.72, portalR * 0.27, 0, 0, Math.PI * 2);
        Neo.ctx.fill();

        if (pickup.active) {
          Neo.ctx.globalAlpha = 0.9;
          Neo.ctx.fillStyle = '#ffd6f7';
          Neo.ctx.font = 'bold 10px system-ui';
          Neo.ctx.textAlign = 'center';
          Neo.ctx.fillText('JUMP', 0, 3);
        }
      } else if (pickup.type === 'fightGod') {
        Neo.ctx.strokeStyle = '#fff';
        Neo.ctx.shadowColor = '#fff';
        Neo.ctx.shadowBlur = 20;
        Neo.ctx.lineWidth = 3;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, 20, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.fillStyle = '#fff';
        Neo.ctx.font = 'bold 10px system-ui';
        Neo.ctx.textAlign = 'center';
        Neo.ctx.fillText('FIGHT', 0, 3);
      } else if (pickup.type === 'returnGate') {
        Neo.ctx.strokeStyle = '#0ff';
        Neo.ctx.shadowColor = '#0ff';
        Neo.ctx.shadowBlur = 20;
        Neo.ctx.lineWidth = 3;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, 20, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.fillStyle = '#aff';
        Neo.ctx.font = 'bold 10px system-ui';
        Neo.ctx.textAlign = 'center';
        Neo.ctx.fillText('LOOP', 0, 3);
      } else if (pickup.type === 'descend') {
        Neo.ctx.strokeStyle = '#c9a8f0';
        Neo.ctx.shadowColor = '#c9a8f0';
        Neo.ctx.shadowBlur = 22;
        Neo.ctx.lineWidth = 3;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, 20, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.fillStyle = '#c9a8f0';
        Neo.ctx.font = 'bold 9px system-ui';
        Neo.ctx.textAlign = 'center';
        Neo.ctx.fillText('DESCEND', 0, 3);
      } else if (pickup.type === 'secretWarp') {
        const color = pickup.delta >= 0 ? '#8dffcf' : '#8dd4ff';
        Neo.ctx.strokeStyle = color;
        Neo.ctx.shadowColor = color;
        Neo.ctx.shadowBlur = 20;
        Neo.ctx.lineWidth = 3;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, 18, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(-8, 0);
        Neo.ctx.lineTo(8, 0);
        Neo.ctx.moveTo(0, -8);
        Neo.ctx.lineTo(8, 0);
        Neo.ctx.lineTo(0, 8);
        Neo.ctx.stroke();
        Neo.ctx.fillStyle = color;
        Neo.ctx.font = 'bold 10px system-ui';
        Neo.ctx.textAlign = 'center';
        Neo.ctx.fillText(`F${pickup.targetFloor}`, 0, 32);
      } else if (pickup.type === 'secretVendor') {
        const cost = Number(pickup.cost || 0);
        const usesCoins = pickup.offerKind === 'xp';
        const canAfford = usesCoins
          ? Number(Neo.player?.coins || 0) >= cost
          : Number(Neo.metaProgress.loopCrystals || 0) >= cost;
        const frameColor = canAfford ? '#aee7ff' : '#ffb1b1';
        const currencyColor = usesCoins ? '#ffd54a' : '#83f3ff';
        const costColor = canAfford ? currencyColor : '#ffb1b1';
        const currencyIconSize = 12;
        Neo.ctx.fillStyle = 'rgba(7,17,22,0.92)';
        Neo.ctx.strokeStyle = frameColor;
        Neo.ctx.lineWidth = 2;
        Neo.ctx.shadowColor = frameColor;
        Neo.ctx.shadowBlur = 16;
        Neo.ctx.fillRect(-22, -18, 44, 36);
        Neo.ctx.strokeRect(-22, -18, 44, 36);
        Neo.ctx.shadowBlur = 0;
        Neo.ctx.fillStyle = frameColor;
        Neo.ctx.font = 'bold 11px system-ui';
        Neo.ctx.textAlign = 'center';
        Neo.ctx.fillText(String(pickup.label || 'Offer'), 0, -2);
        Neo.ctx.font = 'bold 11px system-ui';
        Neo.ctx.fillStyle = costColor;
        Neo.ctx.shadowColor = currencyColor;
        Neo.ctx.shadowBlur = 6;
        Neo.ctx.textAlign = 'right';
        Neo.ctx.fillText(String(cost), 1, 13);
        drawSecretVendorCurrencyIcon(5, 1, currencyIconSize, usesCoins, costColor);
        Neo.ctx.shadowBlur = 0;
      } else if (pickup.type === 'secret_boss_chest') {
        const t = Date.now() * 0.003;
        const glow = '#c9aaff';
        Neo.ctx.shadowColor = glow;
        Neo.ctx.shadowBlur = 18 + Math.sin(t) * 6;
        Neo.ctx.strokeStyle = glow;
        Neo.ctx.lineWidth = 2.5;
        Neo.ctx.strokeRect(-16, -12, 32, 24);
        Neo.ctx.fillStyle = 'rgba(40,10,60,0.88)';
        Neo.ctx.fillRect(-15, -11, 30, 22);
        Neo.ctx.fillStyle = glow;
        Neo.ctx.font = 'bold 9px system-ui';
        Neo.ctx.textAlign = 'center';
        Neo.ctx.fillText('CLAIM', 0, 4);
      } else if (pickup.type === 'crown') {
        Neo.ctx.fillStyle = '#fff';
        Neo.ctx.shadowColor = '#fff';
        Neo.ctx.shadowBlur = 18;
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(-14, 10);
        Neo.ctx.lineTo(-10, -8);
        Neo.ctx.lineTo(-2, 0);
        Neo.ctx.lineTo(0, -12);
        Neo.ctx.lineTo(2, 0);
        Neo.ctx.lineTo(10, -8);
        Neo.ctx.lineTo(14, 10);
        Neo.ctx.closePath();
        Neo.ctx.fill();
      } else if (pickup.type === 'challengeStarter') {
        const trial = pickup.trial || 'mirror';
        const color = trial === 'bomb' ? '#ff8a6a' : trial === 'storm' ? '#8dd4ff' : trial === 'survival' ? '#ffcf7d' : '#d7f6ff';
        Neo.ctx.strokeStyle = color;
        Neo.ctx.shadowColor = color;
        Neo.ctx.shadowBlur = 20;
        Neo.ctx.lineWidth = 3;
        if (trial === 'mirror') {
          Neo.ctx.beginPath();
          Neo.ctx.moveTo(0, -28);
          Neo.ctx.lineTo(0, 16);
          Neo.ctx.stroke();
          Neo.ctx.beginPath();
          Neo.ctx.moveTo(-14, -6);
          Neo.ctx.lineTo(14, -6);
          Neo.ctx.stroke();
          Neo.ctx.beginPath();
          Neo.ctx.moveTo(-8, 16);
          Neo.ctx.lineTo(8, 16);
          Neo.ctx.stroke();
        } else {
          Neo.ctx.beginPath();
          Neo.ctx.arc(0, 0, 18, 0, Math.PI * 2);
          Neo.ctx.stroke();
          Neo.ctx.beginPath();
          Neo.ctx.moveTo(-10, 0);
          Neo.ctx.lineTo(10, 0);
          Neo.ctx.stroke();
        }
        Neo.ctx.fillStyle = '#ffffff';
        Neo.ctx.font = 'bold 10px system-ui';
        Neo.ctx.textAlign = 'center';
        Neo.ctx.fillText(Neo.getChallengeTrialLabel(trial), 0, 34);
      } else if (pickup.type === 'challengeBomb') {
        const bColor = pickup.safe ? '#8dd4ff' : '#ff7a66';
        const bGlow  = pickup.safe ? '#5ab8ff' : '#ff4422';
        const bPulse = 1 + Math.sin(t * 2.2) * 0.07;

        // outer glow ring
        Neo.ctx.strokeStyle = bColor;
        Neo.ctx.shadowColor = bGlow;
        Neo.ctx.shadowBlur = 18;
        Neo.ctx.lineWidth = 2;
        Neo.ctx.globalAlpha = 0.45 + Math.sin(t * 1.8) * 0.18;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, 18 * bPulse, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.globalAlpha = 1;

        // bomb body
        Neo.ctx.fillStyle = pickup.safe ? 'rgb(20,44,72)' : 'rgb(52,16,12)';
        Neo.ctx.shadowBlur = 12;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 2, 11, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.strokeStyle = bColor;
        Neo.ctx.lineWidth = 2;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 2, 11, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.shadowBlur = 0;

        // fuse
        Neo.ctx.strokeStyle = '#c8a040';
        Neo.ctx.lineWidth = 2;
        Neo.ctx.lineCap = 'round';
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(0, -9);
        Neo.ctx.quadraticCurveTo(6, -16, 4, -20);
        Neo.ctx.stroke();

        // fuse spark
        const sparkT = Date.now() * 0.012;
        Neo.ctx.fillStyle = '#ffe060';
        Neo.ctx.shadowColor = '#fff080';
        Neo.ctx.shadowBlur = 8;
        Neo.ctx.beginPath();
        Neo.ctx.arc(4 + Math.sin(sparkT) * 1.5, -20 + Math.cos(sparkT * 1.3) * 1.5, 2.5, 0, Math.PI * 2);
        Neo.ctx.fill();
        Neo.ctx.shadowBlur = 0;
        Neo.ctx.lineCap = 'butt';

        // highlight on body
        Neo.ctx.fillStyle = `rgba(255,255,255,0.12)`;
        Neo.ctx.beginPath();
        Neo.ctx.arc(-3, -1, 5, 0, Math.PI * 2);
        Neo.ctx.fill();
      } else if (pickup.type === 'challengeRune') {
        Neo.ctx.strokeStyle = '#8dd4ff';
        Neo.ctx.shadowColor = '#8dd4ff';
        Neo.ctx.shadowBlur = 16;
        Neo.ctx.lineWidth = 3;
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(0, -12);
        Neo.ctx.lineTo(10, 0);
        Neo.ctx.lineTo(0, 12);
        Neo.ctx.lineTo(-10, 0);
        Neo.ctx.closePath();
        Neo.ctx.stroke();
      }
      Neo.ctx.restore();
    });
  }

  function getProjectileVisual(projectile) {
    const kind = projectile.kind || 'shot';
    if (projectile.enemy) {
      if (kind === 'sword' || kind === 'god_sword') return { color: '#f6f1ff', core: '#ffffff', trail: '#d8c7ff', shape: 'blade', length: 28 };
      if (kind === 'sniper_round') return { color: '#ff5d72', core: '#ffe1e6', trail: '#ff314d', shape: 'dart', length: 34 };
      if (kind === 'machine_round') return { color: '#ffb35a', core: '#fff1ba', trail: '#ff6738', shape: 'tracer', length: 22 };
      if (kind === 'cult_missile') return { color: '#b455ff', core: '#f2ddff', trail: '#7d39ff', shape: 'orb', length: 120 };
      if (kind === 'golem_spit') return { color: '#9bb05a', core: '#e6f0b8', trail: '#5f7a2e', shape: 'orb', length: 70 };
      return { color: projectile.color || '#ff6688', core: '#ffe4eb', trail: projectile.color || '#ff6688', shape: 'dart', length: 24 };
    }
    if (kind === 'fireball') return { color: '#ff7b32', core: '#fff1a6', trail: '#ff2f17', shape: 'fireball', length: 30 };
    if (kind === 'disk') return { color: '#b66cff', core: '#f0d8ff', trail: '#7d4dff', shape: 'disk', length: 20 };
    if (kind === 'magenta_p90') return { color: '#ff9dd7', core: '#fff0fb', trail: '#ff4aa8', shape: 'tracer', length: 26 };
    if (kind === 'magenta_degale') return { color: '#ff8bd2', core: '#fff0fb', trail: '#ff3eb7', shape: 'slug', length: 34 };
    if (kind === 'hunters_bow') return { color: '#dff8ff', core: '#ffffff', trail: '#7edcff', shape: 'arrow', length: 32 };
    if (kind === 'void_piercer') return { color: '#ffd2c0', core: '#fff8ee', trail: '#ff826a', shape: 'dart', length: 30 };
    return { color: projectile.color || '#ffd7aa', core: '#ffffff', trail: projectile.color || '#ffd7aa', shape: 'orb', length: 20 };
  }

  function drawProjectileTrail(projectile, visual, angle) {
    const trail = Array.isArray(projectile.trail) ? projectile.trail : [];
    if (!trail.length) return;
    Neo.ctx.save();
    Neo.ctx.lineCap = 'round';
    for (let index = trail.length - 1; index >= 0; index -= 1) {
      const point = trail[index];
      const next = index === 0 ? projectile : trail[index - 1];
      const alpha = (1 - index / trail.length) * 0.32;
      Neo.ctx.globalAlpha = alpha;
      Neo.ctx.strokeStyle = visual.trail;
      Neo.ctx.shadowColor = visual.trail;
      Neo.ctx.shadowBlur = 8;
      Neo.ctx.lineWidth = Math.max(1.5, projectile.r * (0.42 - index * 0.035));
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(point.x, point.y);
      Neo.ctx.lineTo(next.x, next.y);
      Neo.ctx.stroke();
    }
    if (visual.shape === 'fireball') {
      const tail = trail[Math.min(trail.length - 1, 2)];
      Neo.ctx.globalAlpha = 0.24;
      Neo.ctx.fillStyle = '#3d1420';
      Neo.ctx.beginPath();
      Neo.ctx.ellipse(tail.x - Math.cos(angle) * 3, tail.y - Math.sin(angle) * 3, projectile.r * 1.3, projectile.r * 0.65, angle, 0, Math.PI * 2);
      Neo.ctx.fill();
    }
    Neo.ctx.restore();
  }

  function drawProjectileShape(projectile, visual) {
    const angle = Math.atan2(projectile.vy, projectile.vx);
    const r = projectile.r || 5;
    drawProjectileTrail(projectile, visual, angle);

    Neo.ctx.save();
    Neo.ctx.translate(projectile.x, projectile.y);
    Neo.ctx.rotate(angle);
    Neo.ctx.shadowColor = visual.color;
    Neo.ctx.shadowBlur = projectile.enemy ? 12 : 14;
    Neo.ctx.fillStyle = visual.color;
    Neo.ctx.strokeStyle = visual.core;
    Neo.ctx.lineWidth = 1.5;

    if (visual.shape === 'fireball') {
      const t = Date.now() * 0.012 + projectile.x * 0.02;
      Neo.ctx.fillStyle = '#ff5a2c';
      Neo.ctx.beginPath();
      for (let index = 0; index < 14; index += 1) {
        const a = (index / 14) * Math.PI * 2;
        const wobble = 1 + Math.sin(t + index * 1.7) * 0.18;
        const rr = r * (1.15 + (index % 2) * 0.18) * wobble;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (index === 0) Neo.ctx.moveTo(x, y);
        else Neo.ctx.lineTo(x, y);
      }
      Neo.ctx.closePath();
      Neo.ctx.fill();
      Neo.ctx.fillStyle = visual.core;
      Neo.ctx.beginPath();
      Neo.ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      Neo.ctx.fill();
    } else if (visual.shape === 'disk') {
      const spin = Date.now() * 0.018;
      Neo.ctx.rotate(spin);
      Neo.ctx.globalAlpha = 0.45;
      Neo.ctx.beginPath();
      Neo.ctx.arc(0, 0, r * 1.45, 0.25, Math.PI * 1.35);
      Neo.ctx.stroke();
      Neo.ctx.globalAlpha = 1;
      Neo.ctx.fillStyle = visual.color;
      Neo.ctx.beginPath();
      Neo.ctx.ellipse(0, 0, r * 1.25, r * 0.48, 0, 0, Math.PI * 2);
      Neo.ctx.fill();
      Neo.ctx.fillStyle = visual.core;
      Neo.ctx.fillRect(-r * 0.75, -1, r * 1.5, 2);
    } else if (visual.shape === 'blade' || visual.shape === 'arrow') {
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(r * 1.8, 0);
      Neo.ctx.lineTo(-r * 1.1, -r * 0.52);
      Neo.ctx.lineTo(-r * 0.55, 0);
      Neo.ctx.lineTo(-r * 1.1, r * 0.52);
      Neo.ctx.closePath();
      Neo.ctx.fill();
      Neo.ctx.stroke();
    } else if (visual.shape === 'tracer' || visual.shape === 'dart' || visual.shape === 'slug') {
      Neo.ctx.beginPath();
      Neo.ctx.moveTo(r * 1.8, 0);
      Neo.ctx.lineTo(-r * 1.25, -r * 0.58);
      Neo.ctx.lineTo(-r * 0.72, 0);
      Neo.ctx.lineTo(-r * 1.25, r * 0.58);
      Neo.ctx.closePath();
      Neo.ctx.fill();
      Neo.ctx.fillStyle = visual.core;
      Neo.ctx.beginPath();
      Neo.ctx.ellipse(r * 0.42, 0, r * 0.48, r * 0.22, 0, 0, Math.PI * 2);
      Neo.ctx.fill();
    } else {
      Neo.ctx.beginPath();
      Neo.ctx.arc(0, 0, r, 0, Math.PI * 2);
      Neo.ctx.fill();
      Neo.ctx.fillStyle = visual.core;
      Neo.ctx.beginPath();
      Neo.ctx.arc(r * 0.1, -r * 0.18, r * 0.42, 0, Math.PI * 2);
      Neo.ctx.fill();
    }
    Neo.ctx.restore();
  }

  function drawProjectiles() {
    Neo.projectiles.forEach(projectile => {
      if (!projectile) return;
      drawProjectileShape(projectile, getProjectileVisual(projectile));
    });
    Neo.ctx.shadowBlur = 0;
    Neo.ctx.globalAlpha = 1;
  }

  function drawDeadBodies() {
    Neo.deadBodies.forEach(body => {
      if (!body) return;
      const life = Math.max(0.01, Number(body.life || Neo.CORPSE_LIFETIME));
      const fadeStart = Math.min(life - 0.01, Number(body.fadeStart || Neo.CORPSE_FADE_START));
      const age = Math.max(0, Number(body.age || 0));
      const fallTime = Math.max(0.01, Number(body.fallTime || Neo.CORPSE_FALL_TIME));
      const fallT = Neo.clamp(age / fallTime, 0, 1);
      const fallEase = 1 - (1 - fallT) ** 3;
      const fadeT = age <= fadeStart ? 0 : Neo.clamp((age - fadeStart) / (life - fadeStart), 0, 1);
      const alpha = Math.max(0, 1 - fadeT);
      if (alpha <= 0) return;

      const size = Number(body.size || Math.max(30, Number(body.r || 12) * 2.4));
      const frame = Neo.SPRITE_ATLAS.frames[body.spriteKey] || Neo.SPRITE_ATLAS.frames.hunter;
      if (!frame) return;
      const z = Math.max(0, Number(body.z || 0));
      const velocityMag = Math.hypot(Number(body.vx || 0), Number(body.vy || 0)) + Math.abs(Number(body.vz || 0)) * 0.35;
      const impactStretch = Neo.clamp(z / 140 + velocityMag / 240, 0, 1);
      const squash = Math.max(0.5, 1 - 0.46 * fallEase - impactStretch * 0.18);
      const stretchX = 1 + impactStretch * 0.1;
      const rotation = Number(body.angle || 0)
        + Number(body.fallAngle || 0) * fallEase
        + Number(body.angularOffset || 0);
      const poolScale = Neo.clamp(age / 1.2, 0, 1) * alpha;
      const poolMultiplier = getVisualBloodMultiplier();
      const poolSizeMultiplier = Math.sqrt(poolMultiplier);
      const poolAlphaMultiplier = Neo.clamp(0.72 + poolMultiplier * 0.14, 1, 2.1);

      Neo.ctx.save();
      Neo.ctx.translate(body.x, body.y);
      Neo.ctx.globalAlpha = alpha;

      const isGod = body.type === 'god';
      const poolColor = isGod
        ? `rgba(224,220,255,${0.2 * poolScale * poolAlphaMultiplier})`
        : `rgba(94,0,16,${0.32 * poolScale * poolAlphaMultiplier})`;
      const poolColor2 = isGod
        ? `rgba(200,195,255,${0.13 * poolScale * poolAlphaMultiplier})`
        : `rgba(68,0,10,${0.22 * poolScale * poolAlphaMultiplier})`;

      // Seeded pseudo-random from body id so blobs are stable across frames
      const seed = (body.id || 0) * 9301 + 49297;
      const rng = (n) => (((seed * (n + 1) * 1664525 + 1013904223) >>> 0) / 0xffffffff);

      const baseRx = size * (0.35 + poolScale * 0.14) * poolSizeMultiplier;
      const baseRy = size * (0.08 + poolScale * 0.05) * poolSizeMultiplier;
      const poolAngle = rotation * 0.25;
      const poolY = size * 0.26;

      // Main pool ellipse
      Neo.ctx.fillStyle = poolColor;
      Neo.ctx.beginPath();
      Neo.ctx.ellipse(0, poolY, baseRx, baseRy, poolAngle, 0, Math.PI * 2);
      Neo.ctx.fill();

      // Irregular splat blobs radiating from the pool center
      const blobCount = 5 + Math.floor(rng(0) * 3);
      for (let i = 0; i < blobCount; i++) {
        const angle = rng(i * 3 + 1) * Math.PI * 2;
        const dist = baseRx * (0.25 + rng(i * 3 + 2) * 0.55);
        const br = baseRy * (0.6 + rng(i * 3 + 3) * 1.1);
        const bx = Math.cos(angle) * dist;
        const by = poolY + Math.sin(angle) * dist * 0.38;
        Neo.ctx.fillStyle = i % 2 === 0 ? poolColor : poolColor2;
        Neo.ctx.beginPath();
        Neo.ctx.ellipse(bx, by, br * (0.7 + rng(i * 3 + 4) * 0.6), br * (0.4 + rng(i * 3 + 5) * 0.4), angle, 0, Math.PI * 2);
        Neo.ctx.fill();
      }

      // Small drip dots
      const dropCount = 3 + Math.floor(rng(20) * 4);
      for (let i = 0; i < dropCount; i++) {
        const angle = rng(i * 7 + 30) * Math.PI * 2;
        const dist = baseRx * (0.55 + rng(i * 7 + 31) * 0.7);
        const dr = baseRy * (0.18 + rng(i * 7 + 32) * 0.28);
        Neo.ctx.fillStyle = poolColor2;
        Neo.ctx.beginPath();
        Neo.ctx.arc(Math.cos(angle) * dist, poolY + Math.sin(angle) * dist * 0.35, dr, 0, Math.PI * 2);
        Neo.ctx.fill();
      }

      // Shadow under corpse
      Neo.ctx.fillStyle = `rgba(0,0,0,${0.28 * alpha})`;
      Neo.ctx.beginPath();
      Neo.ctx.ellipse(0, size * 0.32, size * 0.34, size * 0.09, 0, 0, Math.PI * 2);
      Neo.ctx.fill();

      Neo.ctx.translate(0, -z);
      Neo.ctx.rotate(rotation);
      if (Number(body.face || 1) < 0) Neo.ctx.scale(-1, 1);
      Neo.ctx.scale((1 + 0.05 * fallEase) * stretchX, squash);
      Neo.ctx.imageSmoothingEnabled = false;
      Neo.ctx.shadowColor = body.elite ? 'rgba(255,170,64,0.35)' : 'rgba(0,0,0,0.2)';
      Neo.ctx.shadowBlur = body.elite ? 8 : 3;
      Neo.ctx.drawImage(
        Neo.SPRITE_ATLAS.canvas,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        -size / 2,
        -size / 2,
        size,
        size,
      );
      Neo.ctx.globalCompositeOperation = 'source-atop';
      Neo.ctx.fillStyle = body.type === 'god'
        ? `rgba(255,255,255,${0.15 + fadeT * 0.16})`
        : `rgba(48,12,18,${0.22 + fadeT * 0.34})`;
      Neo.ctx.fillRect(-size / 2, -size / 2, size, size);
      Neo.ctx.restore();
    });
  }

  // Expose on Neo
  Neo.drawWorldProps = drawWorldProps;
  Neo.drawPickups = drawPickups;
  Neo.getProjectileVisual = getProjectileVisual;
  Neo.drawProjectileTrail = drawProjectileTrail;
  Neo.drawProjectileShape = drawProjectileShape;
  Neo.drawProjectiles = drawProjectiles;
  Neo.drawDeadBodies = drawDeadBodies;
