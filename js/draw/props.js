// props.js — standalone IIFE. Drawing world props, pickups, projectiles, corpses.
(() => {
  function drawWorldProps() {
    const theme = getRoomArtTheme();
    Neo.hazards.forEach(hazard => {
      Neo.ctx.save();
      Neo.ctx.translate(hazard.x, hazard.y);
      if (hazard.kind === 'lava') {
        const t = Neo.lavaAnimTime * (hazard.pulse || 1.5) + (hazard.phase || 0);
        const wobble = hazard.wobble || 0.6;
        const pulse = 1 + Math.sin(t * 2.4) * 0.07;
        const outerRadius = hazard.r * pulse;

        Neo.ctx.shadowColor = '#ff5a3d';
        Neo.ctx.shadowBlur = 12 + Math.sin(t * 3.1) * 6;
        Neo.ctx.fillStyle = 'rgba(255,95,42,0.55)';
        Neo.ctx.beginPath();
        for (let index = 0; index <= 26; index += 1) {
          const angle = (index / 26) * Math.PI * 2;
          const wave = Math.sin(t * 3.2 + angle * 4) * 0.06 * wobble
            + Math.cos(t * 1.9 + angle * 7) * 0.04 * wobble;
          const rr = outerRadius * (1 + wave);
          const px = Math.cos(angle) * rr;
          const py = Math.sin(angle) * rr;
          if (index === 0) Neo.ctx.moveTo(px, py);
          else Neo.ctx.lineTo(px, py);
        }
        Neo.ctx.closePath();
        Neo.ctx.fill();

        Neo.ctx.fillStyle = `rgba(255,170,70,${0.45 + Math.sin(t * 4.5) * 0.12})`;
        Neo.ctx.beginPath();
        Neo.ctx.arc(Math.sin(t * 2.1) * 3, Math.cos(t * 2.6) * 3, hazard.r * 0.55, 0, Math.PI * 2);
        Neo.ctx.fill();
      } else if (hazard.kind === 'explosive_trap') {
        const t = Date.now() * 0.008 + hazard.x * 0.01;
        const armed = !!hazard.triggered;
        const pulse = armed ? 1 + Math.sin(t * 2.4) * 0.12 : 1 + Math.sin(t * 0.8) * 0.03;
        Neo.ctx.fillStyle = 'rgba(18,19,22,0.95)';
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, hazard.r * 1.05, 0, Math.PI * 2);
        Neo.ctx.fill();

        Neo.ctx.strokeStyle = armed ? '#ff9250' : 'rgba(255,200,120,0.55)';
        Neo.ctx.lineWidth = armed ? 3 : 2;
        Neo.ctx.shadowColor = armed ? '#ff7438' : 'rgba(255,180,90,0.25)';
        Neo.ctx.shadowBlur = armed ? 16 : 6;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.shadowBlur = 0;

        Neo.ctx.strokeStyle = armed ? 'rgba(255,80,70,0.95)' : 'rgba(255,214,120,0.82)';
        Neo.ctx.lineWidth = 2;
        Neo.ctx.beginPath();
        Neo.ctx.moveTo(-6, -6);
        Neo.ctx.lineTo(6, 6);
        Neo.ctx.moveTo(6, -6);
        Neo.ctx.lineTo(-6, 6);
        Neo.ctx.stroke();

        Neo.ctx.globalAlpha = armed ? 0.24 : 0.12;
        Neo.ctx.strokeStyle = armed ? '#ff7a54' : 'rgba(255,210,130,0.55)';
        Neo.ctx.setLineDash([6, 5]);
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, hazard.triggerRadius || 34, 0, Math.PI * 2);
        Neo.ctx.stroke();
        Neo.ctx.setLineDash([]);
        Neo.ctx.globalAlpha = 1;
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
      }
      Neo.ctx.restore();
    });

    Neo.destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      Neo.ctx.save();
      Neo.ctx.translate(prop.x, prop.y);
      if (prop.kind === 'pot') {
        drawEnvironmentTile('pot_clay', -16, -18, 32, 32);
      } else if (prop.kind === 'barrel') {
        drawEnvironmentTile('barrel_oak', -24, -26, 48, 48);
      } else if (prop.kind === 'wall') {
        drawEnvironmentTile('wall_block', -26, -26, 52, 52);
        Neo.ctx.strokeStyle = theme.wallEdge;
        Neo.ctx.lineWidth = 1.5;
        Neo.ctx.strokeRect(-25, -25, 50, 50);
      } else if (prop.kind === 'cover_wall') {
        drawCoverWall(prop);
      } else if (prop.kind === 'secret_wall') {
        drawCoverWall(prop);
      }
      Neo.ctx.restore();
    });

    Neo.shopOffers.forEach(offer => {
      if (offer.bought) return;
      const blockedByChallenge = offer.type === 'item' && isChallengeActive('no_items');
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
        if (ui.coinIcon instanceof HTMLCanvasElement) {
          const s = 18;
          Neo.ctx.imageSmoothingEnabled = false;
          Neo.ctx.drawImage(ui.coinIcon, -s / 2, -s / 2, s, s);
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
        const reveal = clamp(spawnT / activateAt, 0, 1);
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
        const color = canAfford ? '#aee7ff' : '#ffb1b1';
        Neo.ctx.fillStyle = 'rgba(7,17,22,0.92)';
        Neo.ctx.strokeStyle = color;
        Neo.ctx.lineWidth = 2;
        Neo.ctx.shadowColor = color;
        Neo.ctx.shadowBlur = 16;
        Neo.ctx.fillRect(-22, -18, 44, 36);
        Neo.ctx.strokeRect(-22, -18, 44, 36);
        Neo.ctx.fillStyle = color;
        Neo.ctx.font = 'bold 11px system-ui';
        Neo.ctx.textAlign = 'center';
        Neo.ctx.fillText(String(pickup.label || 'Offer'), 0, -2);
        Neo.ctx.font = 'bold 10px system-ui';
        Neo.ctx.fillText(`${cost} ${usesCoins ? 'C' : 'LC'}`, 0, 12);
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
        Neo.ctx.fillText(getChallengeTrialLabel(trial), 0, 34);
      } else if (pickup.type === 'challengeBomb') {
        Neo.ctx.fillStyle = pickup.safe ? '#8dd4ff' : '#ff7a66';
        Neo.ctx.shadowColor = Neo.ctx.fillStyle;
        Neo.ctx.shadowBlur = 16;
        Neo.ctx.beginPath();
        Neo.ctx.arc(0, 0, 12, 0, Math.PI * 2);
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
      if (kind === 'cult_missile') return { color: '#b455ff', core: '#f2ddff', trail: '#7d39ff', shape: 'orb', length: 30 };
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
      const fallT = clamp(age / fallTime, 0, 1);
      const fallEase = 1 - (1 - fallT) ** 3;
      const fadeT = age <= fadeStart ? 0 : clamp((age - fadeStart) / (life - fadeStart), 0, 1);
      const alpha = Math.max(0, 1 - fadeT);
      if (alpha <= 0) return;

      const size = Number(body.size || Math.max(30, Number(body.r || 12) * 2.4));
      const frame = Neo.SPRITE_ATLAS.frames[body.spriteKey] || Neo.SPRITE_ATLAS.frames.hunter;
      if (!frame) return;
      const squash = 1 - 0.46 * fallEase;
      const rotation = Number(body.angle || 0) + Number(body.fallAngle || 0) * fallEase;
      const poolScale = clamp(age / 1.2, 0, 1) * alpha;

      Neo.ctx.save();
      Neo.ctx.translate(body.x, body.y);
      Neo.ctx.globalAlpha = alpha;

      Neo.ctx.fillStyle = body.type === 'god'
        ? `rgba(224,220,255,${0.2 * poolScale})`
        : `rgba(94,0,16,${0.32 * poolScale})`;
      Neo.ctx.beginPath();
      Neo.ctx.ellipse(0, size * 0.26, size * (0.35 + poolScale * 0.14), size * (0.08 + poolScale * 0.05), rotation * 0.25, 0, Math.PI * 2);
      Neo.ctx.fill();

      Neo.ctx.fillStyle = `rgba(0,0,0,${0.28 * alpha})`;
      Neo.ctx.beginPath();
      Neo.ctx.ellipse(0, size * 0.32, size * 0.34, size * 0.09, 0, 0, Math.PI * 2);
      Neo.ctx.fill();

      Neo.ctx.rotate(rotation);
      if (Number(body.face || 1) < 0) Neo.ctx.scale(-1, 1);
      Neo.ctx.scale(1 + 0.05 * fallEase, squash);
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
})();
