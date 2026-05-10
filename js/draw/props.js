  function drawWorldProps() {
    const theme = getRoomArtTheme();
    hazards.forEach(hazard => {
      ctx.save();
      ctx.translate(hazard.x, hazard.y);
      if (hazard.kind === 'lava') {
        const t = lavaAnimTime * (hazard.pulse || 1.5) + (hazard.phase || 0);
        const wobble = hazard.wobble || 0.6;
        const pulse = 1 + Math.sin(t * 2.4) * 0.07;
        const outerRadius = hazard.r * pulse;

        ctx.shadowColor = '#ff5a3d';
        ctx.shadowBlur = 12 + Math.sin(t * 3.1) * 6;
        ctx.fillStyle = 'rgba(255,95,42,0.55)';
        ctx.beginPath();
        for (let index = 0; index <= 26; index += 1) {
          const angle = (index / 26) * Math.PI * 2;
          const wave = Math.sin(t * 3.2 + angle * 4) * 0.06 * wobble
            + Math.cos(t * 1.9 + angle * 7) * 0.04 * wobble;
          const rr = outerRadius * (1 + wave);
          const px = Math.cos(angle) * rr;
          const py = Math.sin(angle) * rr;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = `rgba(255,170,70,${0.45 + Math.sin(t * 4.5) * 0.12})`;
        ctx.beginPath();
        ctx.arc(Math.sin(t * 2.1) * 3, Math.cos(t * 2.6) * 3, hazard.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (hazard.kind === 'explosive_trap') {
        const t = Date.now() * 0.008 + hazard.x * 0.01;
        const armed = !!hazard.triggered;
        const pulse = armed ? 1 + Math.sin(t * 2.4) * 0.12 : 1 + Math.sin(t * 0.8) * 0.03;
        ctx.fillStyle = 'rgba(18,19,22,0.95)';
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * 1.05, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = armed ? '#ff9250' : 'rgba(255,200,120,0.55)';
        ctx.lineWidth = armed ? 3 : 2;
        ctx.shadowColor = armed ? '#ff7438' : 'rgba(255,180,90,0.25)';
        ctx.shadowBlur = armed ? 16 : 6;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = armed ? 'rgba(255,80,70,0.95)' : 'rgba(255,214,120,0.82)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(6, 6);
        ctx.moveTo(6, -6);
        ctx.lineTo(-6, 6);
        ctx.stroke();

        ctx.globalAlpha = armed ? 0.24 : 0.12;
        ctx.strokeStyle = armed ? '#ff7a54' : 'rgba(255,210,130,0.55)';
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, hazard.triggerRadius || 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      } else if (hazard.kind === 'healing_zone') {
        const t = Date.now() * 0.004 + (hazard.ttl || 0);
        const pulse = 1 + Math.sin(t * 2.2) * 0.08;
        const inner = hazard.r * 0.62 * pulse;
        ctx.fillStyle = `rgba(80,255,140,${0.12 + Math.sin(t * 1.8) * 0.04})`;
        ctx.beginPath();
        ctx.arc(0, 0, inner, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#35ff6f';
        ctx.shadowColor = '#35ff6f';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i += 1) {
          const a = t + i * (Math.PI * 2 / 6);
          const px = Math.cos(a) * (hazard.r * 0.7);
          const py = Math.sin(a) * (hazard.r * 0.7);
          ctx.beginPath();
          ctx.moveTo(px - 4, py);
          ctx.lineTo(px + 4, py);
          ctx.moveTo(px, py - 4);
          ctx.lineTo(px, py + 4);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.moveTo(0, -8);
        ctx.lineTo(0, 8);
        ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = 'rgba(210,255,225,0.75)';
        ctx.lineWidth = 1.5;
        for (let index = 0; index < 10; index += 1) {
          const a = -t * 0.55 + index * (Math.PI * 2 / 10);
          const r0 = hazard.r * 0.84;
          const r1 = hazard.r * 0.93;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (hazard.kind === 'fire_circle') {
        const t = Date.now() * 0.005;
        const pulse = 1 + Math.sin(t * 2.6) * 0.07;
        ctx.strokeStyle = '#ff7b32';
        ctx.shadowColor = '#ff7b32';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,102,40,0.15)';
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * 0.76, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.78;
        ctx.strokeStyle = 'rgba(255,205,90,0.8)';
        ctx.lineWidth = 2;
        for (let index = 0; index < 14; index += 1) {
          const a = t * 0.9 + index * (Math.PI * 2 / 14);
          const wiggle = Math.sin(t * 2 + index) * 4;
          const r0 = hazard.r * 0.46 + wiggle;
          const r1 = hazard.r * 0.68 + wiggle;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a + 0.14) * r1, Math.sin(a + 0.14) * r1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (hazard.kind === 'lightning_column') {
        const t = Date.now() * 0.006 + hazard.x * 0.01;
        ctx.fillStyle = 'rgba(112,180,255,0.12)';
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8dd4ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, hazard.r * (0.8 + Math.sin(t) * 0.04), 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(170,220,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -hazard.r);
        ctx.lineTo(0, hazard.r);
        ctx.stroke();
        ctx.shadowColor = '#bde8ff';
        ctx.shadowBlur = 16;
        for (let index = 0; index < 5; index += 1) {
          const a = t * 1.7 + index * (Math.PI * 2 / 5);
          const branch = hazard.r * (0.28 + 0.12 * Math.sin(t + index));
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * branch * 0.3, Math.sin(a) * branch * 0.3);
          ctx.lineTo(Math.cos(a + 0.22) * branch, Math.sin(a + 0.22) * branch);
          ctx.lineTo(Math.cos(a - 0.1) * hazard.r * 0.72, Math.sin(a - 0.1) * hazard.r * 0.72);
          ctx.stroke();
        }
      }
      ctx.restore();
    });

    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      ctx.save();
      ctx.translate(prop.x, prop.y);
      if (prop.kind === 'pot') {
        drawEnvironmentTile('pot_clay', -16, -18, 32, 32);
      } else if (prop.kind === 'barrel') {
        drawEnvironmentTile('barrel_oak', -24, -26, 48, 48);
      } else if (prop.kind === 'wall') {
        drawEnvironmentTile('wall_block', -26, -26, 52, 52);
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-25, -25, 50, 50);
      } else if (prop.kind === 'cover_wall') {
        drawCoverWall(prop);
      } else if (prop.kind === 'secret_wall') {
        drawCoverWall(prop);
      }
      ctx.restore();
    });

    shopOffers.forEach(offer => {
      if (offer.bought) return;
      const blockedByChallenge = offer.type === 'item' && isChallengeActive('no_items');
      const canAfford = !!player && player.coins >= offer.cost;
      ctx.save();
      ctx.translate(offer.x, offer.y);
      ctx.fillStyle = blockedByChallenge || !canAfford ? 'rgba(36,18,24,0.95)' : 'rgba(0,30,44,0.95)';
      ctx.strokeStyle = blockedByChallenge || !canAfford ? '#ff8b98' : '#ffd966';
      ctx.lineWidth = 2;
      ctx.fillRect(-26, -26, 52, 52);
      ctx.strokeRect(-26, -26, 52, 52);

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
        ctx.save();
        ctx.translate(-iconSize / 2, -iconSize / 2 - 4);
        ctx.shadowColor = iconColor;
        ctx.shadowBlur = blockedByChallenge ? 0 : 8;
        ctx.fillStyle = iconColor;
        iconDef.pixels.forEach(([px, py]) => {
          ctx.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
        });
        ctx.restore();
      } else {
        // fallback circle
        ctx.fillStyle = blockedByChallenge
          ? '#ff8b98'
          : offer.type === 'item' ? '#a857ff' : offer.type === 'potion' ? '#35ff6f' : '#8fd2ff';
        ctx.beginPath();
        ctx.arc(0, -6, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.fillStyle = blockedByChallenge || !canAfford ? '#ffccd2' : '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(offer.cost), 0, 22);
      ctx.restore();
    });
  }

  function drawPickups() {
    pickups.forEach(pickup => {
      if (!pickup || typeof pickup !== 'object' || typeof pickup.type !== 'string') return;
      ctx.save();
      const t = Date.now() / 260;
      const bob = Math.sin(t * 0.9) * 3;
      ctx.translate(pickup.x, pickup.y + bob);
      ctx.globalAlpha = 0.88 + Math.sin(t) * 0.12;
      if (pickup.type === 'coin') {
        ctx.shadowColor = '#ffd966';
        ctx.shadowBlur = 12;
        if (ui.coinIcon instanceof HTMLCanvasElement) {
          const s = 18;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(ui.coinIcon, -s / 2, -s / 2, s, s);
        } else {
          ctx.fillStyle = '#ffd966';
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (pickup.type === 'potion') {
        const potionDef = window.NeoNykeIconDefs?.pickups?.potion;
        ctx.shadowColor = '#35ff6f';
        ctx.shadowBlur = 14;
        if (potionDef) {
          ctx.fillStyle = '#35ff6f';
          ctx.imageSmoothingEnabled = false;
          potionDef.pixels.forEach(([px, py]) => {
            ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          ctx.fillStyle = '#0f8';
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const appleDef = window.NeoNykeIconDefs?.pickups?.apple || window.NeoNykeIconDefs?.pickups?.fruit;
        const fruitPulse = 1 + Math.sin(t * 2.3) * 0.08;
        ctx.shadowColor = '#ff4b4b';
        ctx.shadowBlur = 16;
        ctx.save();
        ctx.scale(fruitPulse, fruitPulse);
        if (appleDef) {
          ctx.fillStyle = '#ff4b4b';
          ctx.imageSmoothingEnabled = false;
          appleDef.pixels.forEach(([px, py]) => {
            ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          ctx.fillStyle = '#ff4b4b';
          ctx.beginPath();
          ctx.arc(0, 0, 9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#7a1d1d';
        ctx.fillRect(-1, -12, 2, 5);
        ctx.fillStyle = '#ffd8d8';
        ctx.fillRect(2, -11, 2, 2);
      } else if (pickup.type === 'item') {
        const item = itemRegistry.get(pickup.key);
        const color = item?.color || '#fff';
        const iconDef = window.NeoNykeIconDefs?.items?.[pickup.key];
        ctx.shadowColor = color;
        ctx.shadowBlur = item?.rarity === 'god' ? 20 : 14;
        if (item?.rarity === 'god' && item?.accent) {
          ctx.strokeStyle = item.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 17, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (iconDef) {
          ctx.fillStyle = color;
          ctx.imageSmoothingEnabled = false;
          iconDef.pixels.forEach(([px, py]) => {
            ctx.fillRect(px * 3 - 12, py * 3 - 12, 3, 3);
          });
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (pickup.type === 'ladder') {
        ctx.strokeStyle = '#7dff9e';
        ctx.shadowColor = '#7dff9e';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 3;
        ctx.strokeRect(-12, -16, 24, 32);
        ctx.beginPath();
        ctx.moveTo(-6, -12); ctx.lineTo(-6, 12);
        ctx.moveTo(6, -12); ctx.lineTo(6, 12);
        ctx.moveTo(-6, -6); ctx.lineTo(6, -6);
        ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
        ctx.moveTo(-6, 6); ctx.lineTo(6, 6);
        ctx.stroke();
      } else if (pickup.type === 'jesterPortal') {
        const spawnT = Math.max(0, Number(pickup.spawnT || 0));
        const activateAt = Math.max(0.01, Number(pickup.activateAt || JESTER_PORTAL_ACTIVATE_DELAY));
        const reveal = clamp(spawnT / activateAt, 0, 1);
        const ease = 1 - (1 - reveal) ** 3;
        const spin = Date.now() / 360;
        const portalR = 16 + ease * 11;

        ctx.globalAlpha = 0.34 + ease * 0.56;
        ctx.fillStyle = 'rgba(48,8,66,0.65)';
        ctx.beginPath();
        ctx.ellipse(0, 8, portalR * 0.95, portalR * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.9;
        ctx.shadowColor = '#ff8bd8';
        ctx.shadowBlur = 20;
        for (let ring = 0; ring < 2; ring += 1) {
          const ringR = portalR * (0.72 + ring * 0.3);
          const segments = 9 + ring * 3;
          ctx.strokeStyle = ring === 0 ? '#ff8bd8' : '#ffd1f5';
          ctx.lineWidth = ring === 0 ? 2.4 : 1.5;
          ctx.beginPath();
          for (let seg = 0; seg < segments; seg += 1) {
            const a0 = (seg / segments) * Math.PI * 2 + spin * (ring === 0 ? 1 : -0.7);
            const a1 = ((seg + 0.56) / segments) * Math.PI * 2 + spin * (ring === 0 ? 1 : -0.7);
            ctx.moveTo(Math.cos(a0) * ringR, Math.sin(a0) * ringR * 0.42);
            ctx.lineTo(Math.cos(a1) * ringR, Math.sin(a1) * ringR * 0.42);
          }
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, portalR * 0.72);
        core.addColorStop(0, 'rgba(255,188,236,0.92)');
        core.addColorStop(1, 'rgba(255,95,194,0)');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.ellipse(0, 0, portalR * 0.72, portalR * 0.27, 0, 0, Math.PI * 2);
        ctx.fill();

        if (pickup.active) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#ffd6f7';
          ctx.font = 'bold 10px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('JUMP', 0, 3);
        }
      } else if (pickup.type === 'fightGod') {
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('FIGHT', 0, 3);
      } else if (pickup.type === 'returnGate') {
        ctx.strokeStyle = '#0ff';
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#aff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('LOOP', 0, 3);
      } else if (pickup.type === 'descend') {
        ctx.strokeStyle = '#c9a8f0';
        ctx.shadowColor = '#c9a8f0';
        ctx.shadowBlur = 22;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#c9a8f0';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('DESCEND', 0, 3);
      } else if (pickup.type === 'secretWarp') {
        const color = pickup.delta >= 0 ? '#8dffcf' : '#8dd4ff';
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.moveTo(0, -8);
        ctx.lineTo(8, 0);
        ctx.lineTo(0, 8);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`F${pickup.targetFloor}`, 0, 32);
      } else if (pickup.type === 'secretVendor') {
        const cost = Number(pickup.cost || 0);
        const usesCoins = pickup.offerKind === 'xp';
        const canAfford = usesCoins
          ? Number(player?.coins || 0) >= cost
          : Number(metaProgress.loopCrystals || 0) >= cost;
        const color = canAfford ? '#aee7ff' : '#ffb1b1';
        ctx.fillStyle = 'rgba(7,17,22,0.92)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.fillRect(-22, -18, 44, 36);
        ctx.strokeRect(-22, -18, 44, 36);
        ctx.fillStyle = color;
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(String(pickup.label || 'Offer'), 0, -2);
        ctx.font = 'bold 10px system-ui';
        ctx.fillText(`${cost} ${usesCoins ? 'C' : 'LC'}`, 0, 12);
      } else if (pickup.type === 'crown') {
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(-14, 10);
        ctx.lineTo(-10, -8);
        ctx.lineTo(-2, 0);
        ctx.lineTo(0, -12);
        ctx.lineTo(2, 0);
        ctx.lineTo(10, -8);
        ctx.lineTo(14, 10);
        ctx.closePath();
        ctx.fill();
      } else if (pickup.type === 'challengeStarter') {
        const trial = pickup.trial || 'mirror';
        const color = trial === 'bomb' ? '#ff8a6a' : trial === 'storm' ? '#8dd4ff' : trial === 'survival' ? '#ffcf7d' : '#d7f6ff';
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3;
        if (trial === 'mirror') {
          ctx.beginPath();
          ctx.moveTo(0, -28);
          ctx.lineTo(0, 16);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-14, -6);
          ctx.lineTo(14, -6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-8, 16);
          ctx.lineTo(8, 16);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, 18, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-10, 0);
          ctx.lineTo(10, 0);
          ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(getChallengeTrialLabel(trial), 0, 34);
      } else if (pickup.type === 'challengeBomb') {
        ctx.fillStyle = pickup.safe ? '#8dd4ff' : '#ff7a66';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
      } else if (pickup.type === 'challengeRune') {
        ctx.strokeStyle = '#8dd4ff';
        ctx.shadowColor = '#8dd4ff';
        ctx.shadowBlur = 16;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(10, 0);
        ctx.lineTo(0, 12);
        ctx.lineTo(-10, 0);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
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
    ctx.save();
    ctx.lineCap = 'round';
    for (let index = trail.length - 1; index >= 0; index -= 1) {
      const point = trail[index];
      const next = index === 0 ? projectile : trail[index - 1];
      const alpha = (1 - index / trail.length) * 0.32;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = visual.trail;
      ctx.shadowColor = visual.trail;
      ctx.shadowBlur = 8;
      ctx.lineWidth = Math.max(1.5, projectile.r * (0.42 - index * 0.035));
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }
    if (visual.shape === 'fireball') {
      const tail = trail[Math.min(trail.length - 1, 2)];
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = '#3d1420';
      ctx.beginPath();
      ctx.ellipse(tail.x - Math.cos(angle) * 3, tail.y - Math.sin(angle) * 3, projectile.r * 1.3, projectile.r * 0.65, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawProjectileShape(projectile, visual) {
    const angle = Math.atan2(projectile.vy, projectile.vx);
    const r = projectile.r || 5;
    drawProjectileTrail(projectile, visual, angle);

    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(angle);
    ctx.shadowColor = visual.color;
    ctx.shadowBlur = projectile.enemy ? 12 : 14;
    ctx.fillStyle = visual.color;
    ctx.strokeStyle = visual.core;
    ctx.lineWidth = 1.5;

    if (visual.shape === 'fireball') {
      const t = Date.now() * 0.012 + projectile.x * 0.02;
      ctx.fillStyle = '#ff5a2c';
      ctx.beginPath();
      for (let index = 0; index < 14; index += 1) {
        const a = (index / 14) * Math.PI * 2;
        const wobble = 1 + Math.sin(t + index * 1.7) * 0.18;
        const rr = r * (1.15 + (index % 2) * 0.18) * wobble;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (visual.shape === 'disk') {
      const spin = Date.now() * 0.018;
      ctx.rotate(spin);
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.45, 0.25, Math.PI * 1.35);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = visual.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.25, r * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.fillRect(-r * 0.75, -1, r * 1.5, 2);
    } else if (visual.shape === 'blade' || visual.shape === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(r * 1.8, 0);
      ctx.lineTo(-r * 1.1, -r * 0.52);
      ctx.lineTo(-r * 0.55, 0);
      ctx.lineTo(-r * 1.1, r * 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (visual.shape === 'tracer' || visual.shape === 'dart' || visual.shape === 'slug') {
      ctx.beginPath();
      ctx.moveTo(r * 1.8, 0);
      ctx.lineTo(-r * 1.25, -r * 0.58);
      ctx.lineTo(-r * 0.72, 0);
      ctx.lineTo(-r * 1.25, r * 0.58);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.beginPath();
      ctx.ellipse(r * 0.42, 0, r * 0.48, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = visual.core;
      ctx.beginPath();
      ctx.arc(r * 0.1, -r * 0.18, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawProjectiles() {
    projectiles.forEach(projectile => {
      if (!projectile) return;
      drawProjectileShape(projectile, getProjectileVisual(projectile));
    });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawDeadBodies() {
    deadBodies.forEach(body => {
      if (!body) return;
      const life = Math.max(0.01, Number(body.life || CORPSE_LIFETIME));
      const fadeStart = Math.min(life - 0.01, Number(body.fadeStart || CORPSE_FADE_START));
      const age = Math.max(0, Number(body.age || 0));
      const fallTime = Math.max(0.01, Number(body.fallTime || CORPSE_FALL_TIME));
      const fallT = clamp(age / fallTime, 0, 1);
      const fallEase = 1 - (1 - fallT) ** 3;
      const fadeT = age <= fadeStart ? 0 : clamp((age - fadeStart) / (life - fadeStart), 0, 1);
      const alpha = Math.max(0, 1 - fadeT);
      if (alpha <= 0) return;

      const size = Number(body.size || Math.max(30, Number(body.r || 12) * 2.4));
      const frame = SPRITE_ATLAS.frames[body.spriteKey] || SPRITE_ATLAS.frames.hunter;
      if (!frame) return;
      const squash = 1 - 0.46 * fallEase;
      const rotation = Number(body.angle || 0) + Number(body.fallAngle || 0) * fallEase;
      const poolScale = clamp(age / 1.2, 0, 1) * alpha;

      ctx.save();
      ctx.translate(body.x, body.y);
      ctx.globalAlpha = alpha;

      ctx.fillStyle = body.type === 'god'
        ? `rgba(224,220,255,${0.2 * poolScale})`
        : `rgba(94,0,16,${0.32 * poolScale})`;
      ctx.beginPath();
      ctx.ellipse(0, size * 0.26, size * (0.35 + poolScale * 0.14), size * (0.08 + poolScale * 0.05), rotation * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(0,0,0,${0.28 * alpha})`;
      ctx.beginPath();
      ctx.ellipse(0, size * 0.32, size * 0.34, size * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(rotation);
      if (Number(body.face || 1) < 0) ctx.scale(-1, 1);
      ctx.scale(1 + 0.05 * fallEase, squash);
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor = body.elite ? 'rgba(255,170,64,0.35)' : 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = body.elite ? 8 : 3;
      ctx.drawImage(
        SPRITE_ATLAS.canvas,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        -size / 2,
        -size / 2,
        size,
        size,
      );
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = body.type === 'god'
        ? `rgba(255,255,255,${0.15 + fadeT * 0.16})`
        : `rgba(48,12,18,${0.22 + fadeT * 0.34})`;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    });
  }

