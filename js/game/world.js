// world.js — standalone IIFE. Player movement, projectiles, world object updates.
  // Damage sources that are environmental hazards / non-enemy, so they're exempt
  // from the time-based enemy crit aggression in damagePlayer().
  const ENEMY_AGGRESSION_EXEMPT_SOURCES = new Set([
    'lava', 'thorn_mine', 'bomb_aoe', 'explosive_trap', 'red_spikes',
    'lightning_column', 'justice_of_sonichu', 'pvp_p2', 'pvp_p2_beam',
  ]);

  const LOCAL_COOP_REVIVE_RADIUS = 58;
  const LOCAL_COOP_REVIVE_SECONDS = 1.35;

  function getLocalCoopSlots({ livingOnly = false } = {}) {
    const slots = Neo.getActivePlayerSlots?.() || [];
    if (Neo.gameMode !== 'coop') {
      const p1 = slots.find(slot => slot.id === 1);
      return p1 && (!livingOnly || !p1.getDead?.()) ? [p1] : [];
    }
    return slots.filter(slot => slot?.getEntity?.() && (!livingOnly || !slot.getDead?.()));
  }

  function getNearestLivingPlayerSlot(x, y) {
    let nearest = null;
    let nearestDistance = Infinity;
    getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
      const actor = slot.getEntity();
      const distance = Math.hypot(actor.x - x, actor.y - y);
      if (distance < nearestDistance) {
        nearest = slot;
        nearestDistance = distance;
      }
    });
    return nearest ? { slot: nearest, entity: nearest.getEntity(), distance: nearestDistance } : null;
  }

  function hasLivingCoopTeammate(excludedSlotId = 0) {
    return getLocalCoopSlots({ livingOnly: true }).some(slot => slot.id !== excludedSlotId);
  }

  function downLocalCoopPlayer(slot) {
    const actor = slot?.getEntity?.();
    if (!actor || slot.getDead?.()) return;
    actor.hp = 0;
    actor.vx = 0;
    actor.vy = 0;
    actor.coopReviveProgress = 0;
    slot.setDead?.(true);
    Neo.spawnParticle({ x: actor.x, y: actor.y - 30, life: 1.2, text: `${slot.label} DOWN`, c: slot.color || '#ff8295' });
    if (getLocalCoopSlots({ livingOnly: true }).length === 0) Neo.die();
  }

  function damagePlayerSlot(slot, amount, angle, knockback, source = '', options = {}) {
    if (!slot || slot.getDead?.()) return false;
    if (slot.id === 1) damagePlayer(amount, angle, knockback, source, options);
    else if (slot.id === 2) damagePlayer2(amount, angle, knockback, source, options);
    else damagePlayerN(slot.getEntity(), slot.id, amount, angle, knockback, source, options);
    return true;
  }

  function reviveLocalCoopPlayer(slot) {
    const actor = slot?.getEntity?.();
    if (!actor || !slot.getDead?.()) return;
    const revived = globalThis.NeoNyke?.simulation?.applyCampaignRevive?.(actor, {
      healthFraction: 0.4,
      invulnerabilitySeconds: 1.5,
    });
    if (!revived) {
      actor.hp = Math.max(1, Math.ceil(actor.maxHp * 0.4));
      actor.inv = Math.max(Number(actor.inv || 0), 1.5);
    }
    actor.coopReviveProgress = 0;
    actor.vx = 0;
    actor.vy = 0;
    slot.setDead?.(false);
    Neo.runRevivesUsed = Number(Neo.runRevivesUsed || 0) + 1;
    Neo.ringBurst?.(actor.x, actor.y, actor.r + 18, slot.color || '#9af7d8', 0.65);
    Neo.spawnParticle({ x: actor.x, y: actor.y - 34, life: 1, text: `${slot.label} REVIVED`, c: '#9af7d8' });
    Neo.playSfx?.('heal');
  }

  function updateLocalCoopRevives(dt) {
    if (Neo.gameMode !== 'coop' || Neo.gameState !== 'play') return;
    const livingSlots = getLocalCoopSlots({ livingOnly: true });
    getLocalCoopSlots().forEach(downedSlot => {
      if (!downedSlot.getDead?.()) return;
      const downed = downedSlot.getEntity();
      let reviver = null;
      let bestDistance = Infinity;
      livingSlots.forEach(slot => {
        const actor = slot.getEntity();
        const distance = Math.hypot(actor.x - downed.x, actor.y - downed.y);
        if (slot.id !== downedSlot.id && distance < bestDistance) {
          reviver = actor;
          bestDistance = distance;
        }
      });
      const oldProgress = Number(downed.coopReviveProgress || 0);
      downed.coopReviveProgress = bestDistance <= LOCAL_COOP_REVIVE_RADIUS
        ? Math.min(1, oldProgress + dt / LOCAL_COOP_REVIVE_SECONDS)
        : Math.max(0, oldProgress - dt / (LOCAL_COOP_REVIVE_SECONDS * 0.55));
      downed.coopReviver = bestDistance <= LOCAL_COOP_REVIVE_RADIUS ? reviver : null;
      if (downed.coopReviveProgress >= 1) reviveLocalCoopPlayer(downedSlot);
    });
  }

  function getAuxPlayerMoveSpeed(player) {
    const characterSpeed = Number(Neo.CHARACTER_DEFS?.[player?.character]?.moveSpeedMultiplier || 1);
    return 228 * Math.max(0.5, characterSpeed) * Math.max(0.5, Number(player?.moveSpeedMultiplier || 1));
  }

  function getAuxPlayerAimAngle(player, moveX = 0, moveY = 0, gamepad = null) {
    if (gamepad?.hasAim) return Math.atan2(gamepad.aimY, gamepad.aimX);
    if (Math.hypot(moveX, moveY) > 0.12) return Math.atan2(moveY, moveX);
    if (Math.hypot(player?.vx || 0, player?.vy || 0) > 4) return Math.atan2(player.vy, player.vx);
    return Number(player?.lastAimAngle || 0);
  }

  function positionLocalCoopParty(centerX, centerY, direction = '') {
    const slots = getLocalCoopSlots();
    if (!slots.length) return;
    const perpendicularX = direction === 'n' || direction === 's' ? 1 : 0;
    const perpendicularY = direction === 'e' || direction === 'w' ? 1 : 0;
    const offsets = [0, -28, 28, -56];
    slots.forEach((slot, index) => {
      const actor = slot.getEntity();
      const spread = offsets[index] || 0;
      const preferredX = Neo.clamp(centerX + perpendicularX * spread, Neo.WALL + actor.r, Neo.ROOM_W - Neo.WALL - actor.r);
      const preferredY = Neo.clamp(centerY + perpendicularY * spread, Neo.WALL + actor.r, Neo.ROOM_H - Neo.WALL - actor.r);
      const safe = Neo.findSafePointNearTarget?.(preferredX, preferredY, actor.r, 76, 12)
        || (!Neo.isBlocked(preferredX, preferredY, actor.r) ? { x: preferredX, y: preferredY } : { x: centerX, y: centerY });
      actor.x = safe.x;
      actor.y = safe.y;
      actor.vx = 0;
      actor.vy = 0;
      actor.dashTime = 0;
    });
  }

  function getPvpMoveCooldown(playerState, slot, fallback) {
    const moveKey = playerState?.equippedMoves?.[slot] || fallback;
    const fallbackCooldown = slot === 'laser' ? 1.8 : 2.4;
    return Math.max(0.2, Number(Neo.MOVE_BASE_STATS?.[moveKey]?.cooldown || fallbackCooldown));
  }

  function tickPvpPlayer2Cooldowns(dt) {
    if (!Neo.player2) return;
    Neo.player2.pvpLaserCooldown = Math.max(0, Number(Neo.player2.pvpLaserCooldown || 0) - dt);
    Neo.player2.pvpSmashCooldown = Math.max(0, Number(Neo.player2.pvpSmashCooldown || 0) - dt);
  }

  function getPlayer2AimAngle(moveX = 0, moveY = 0, gamepad = null) {
    return getAuxPlayerAimAngle(Neo.player2, moveX, moveY, gamepad);
  }

  function updateAuxPlayerAbilities(dt, player, gamepad, aimAngle, color = '#a8d8ff') {
    if (!player || !gamepad?.active) return;
    player.auxLaserCooldown = Math.max(0, Number(player.auxLaserCooldown || 0) - dt);
    player.auxSmashCooldown = Math.max(0, Number(player.auxSmashCooldown || 0) - dt);
    const updateCharge = (slot, held, cooldownKey, release) => {
      const latchKey = `aux${slot[0].toUpperCase()}${slot.slice(1)}Latch`;
      const chargeSlots = player.auxChargeState || (player.auxChargeState = {});
      if (held && Number(player[cooldownKey] || 0) <= 0) {
        player[latchKey] = true;
        chargeSlots[slot] = { slot, time: Math.min(3, Number(chargeSlots[slot]?.time || 0) + dt), max: 3 };
        player.localChargeState = chargeSlots[slot];
      } else if (!held && player[latchKey]) {
        const ratio = Math.max(0, Math.min(1, Number(chargeSlots[slot]?.time || 0) / 3));
        player[latchKey] = false;
        delete chargeSlots[slot];
        player.localChargeState = Object.values(chargeSlots)[0] || null;
        release(ratio);
      }
    };
    updateCharge('laser', !!gamepad.laser, 'auxLaserCooldown', ratio => {
      const moveKey = player.equippedMoves?.laser || 'blood_beam';
      const range = Neo.getPlayerBeamRange?.('beam', moveKey) || 430;
      const path = Neo.buildRicochetBeamPath(player.x, player.y, aimAngle, range, Neo.getPlayerBeamBounceCount?.('beam') || 0);
      const damage = Math.max(1, Number(Neo.MOVE_BASE_STATS?.[moveKey]?.damage || Neo.ATTACKS.laser.damage) * (0.7 + ratio * 1.3));
      for (const enemy of Neo.enemies) {
        if (!enemy?.dead && Neo.beamPathHitsCircle?.(path, enemy.x, enemy.y, enemy.r + 7)) {
          Neo.hitEnemy(enemy, damage, aimAngle, 80 + ratio * 100, color);
        }
      }
      player.auxLaserPath = path;
      player.auxLaserFxTime = 0.16;
      player.auxLaserCooldown = getPvpMoveCooldown(player, 'laser', 'blood_beam');
    });
    updateCharge('smash', !!gamepad.smash, 'auxSmashCooldown', ratio => {
      const moveKey = player.equippedMoves?.smash || 'crimson_smash';
      const radius = (Neo.ATTACKS.smash.radius || 105) * (0.75 + ratio * 0.55);
      const damage = Math.max(1, Number(Neo.MOVE_BASE_STATS?.[moveKey]?.damage || Neo.ATTACKS.smash.damage) * (0.7 + ratio * 1.3));
      Neo.spawnAoeShockwave(player.x, player.y, radius, color, 'heavy');
      for (const enemy of Neo.enemies) {
        if (!enemy?.dead && Neo.dist(player.x, player.y, enemy.x, enemy.y) <= radius + enemy.r) {
          Neo.hitEnemy(enemy, damage, Neo.angleBetween(player, enemy), 260 + ratio * 120, color);
        }
      }
      player.auxSmashCooldown = getPvpMoveCooldown(player, 'smash', 'crimson_smash');
    });
    player.auxLaserFxTime = Math.max(0, Number(player.auxLaserFxTime || 0) - dt);
    if (player.auxLaserFxTime <= 0) player.auxLaserPath = null;
  }

  function castPlayer2PvpLaser(angle) {
    if (!Neo.player2 || Neo.player2.pvpLaserCooldown > 0) return;
    const moveKey = Neo.player2.equippedMoves?.laser || 'blood_beam';
    Neo.player2.lastAimAngle = angle;
    const mode = moveKey === 'turtle_wave' ? 'turtle_wave' : moveKey === 'god_sweep' ? 'god_sweep' : 'beam';
    const range = Neo.getPlayerBeamRange(mode, moveKey);
    const path = Neo.buildRicochetBeamPath(Neo.player2.x, Neo.player2.y, angle, range, Neo.getPlayerBeamBounceCount(mode));
    Neo.player2.pvpBeamActive = true;
    Neo.player2.pvpBeamPath = path;
    Neo.player2.pvpBeamMode = mode;
    Neo.player2.pvpBeamMoveKey = moveKey;
  }

  function releasePlayer2PvpLaser() {
    const player = Neo.player2;
    if (!player?.pvpBeamActive || Neo.beamStruggle?.opponentPlayer === player) return;
    const path = player.pvpBeamPath || [];
    const moveKey = player.pvpBeamMoveKey || player.equippedMoves?.laser || 'blood_beam';
    const mode = player.pvpBeamMode || 'beam';
    const baseDamage = Neo.MOVE_BASE_STATS?.[moveKey]?.damage || Neo.ATTACKS.laser.damage;
    hitPvpPlayer1WithBeamPath(path, mode === 'turtle_wave' ? 14 : 6, baseDamage, mode === 'turtle_wave' ? 155 : 60, 'pvp_p2_beam');
    player.pvpLaserCooldown = getPvpMoveCooldown(player, 'laser', 'blood_beam');
    player.pvpBeamActive = false;
    player.pvpBeamPath = null;
  }

  function castPlayer2PvpSmash(chargeRatio = 0) {
    if (!Neo.player2 || Neo.player2.pvpSmashCooldown > 0) return;
    const moveKey = Neo.player2.equippedMoves?.smash || 'crimson_smash';
    Neo.player2.pvpSmashCooldown = getPvpMoveCooldown(Neo.player2, 'smash', 'crimson_smash');
    const chargeScale = 1 + Neo.clamp(Number(chargeRatio || 0), 0, 1) * 1.1;
    const radius = (Neo.ATTACKS.smash.radius || 105) * 0.95 * (1 + (chargeScale - 1) * 0.35);
    const damage = (Neo.MOVE_BASE_STATS?.[moveKey]?.damage || Neo.ATTACKS.smash.damage) * chargeScale;
    const smashColor = moveKey === 'crimson_smash'
      ? '#ff3048'
      : moveKey === 'chaos_burst'
        ? '#a857ff'
        : '#4ca8ff';
    Neo.spawnAoeShockwave(Neo.player2.x, Neo.player2.y, radius, smashColor, 'heavy');
    hitPvpPlayer1InRadius(Neo.player2.x, Neo.player2.y, radius, damage, 300, 'pvp_p2_smash');
  }

  function updatePlayer2(dt) {
    if (!Neo.player2) return;
    const _gp1 = window.NeoGamepad?.[1];
    const _gp1Active = !!_gp1?.active;
    let p2MoveX = (Neo.keys['l'] ? 1 : 0) - (Neo.keys['j'] ? 1 : 0);
    let p2MoveY = (Neo.keys['k'] ? 1 : 0) - (Neo.keys['i'] ? 1 : 0);
    if (_gp1Active) {
      if (Math.abs(_gp1.moveX) > 0.18 || Math.abs(_gp1.moveY) > 0.18) {
        p2MoveX = _gp1.moveX; p2MoveY = _gp1.moveY;
      }
    }
    const p2Len = Math.hypot(p2MoveX, p2MoveY) || 1;
    const p2NX = p2Len > 0.1 ? p2MoveX / p2Len : 0;
    const p2NY = p2Len > 0.1 ? p2MoveY / p2Len : 0;
    if (Neo.player2.dashTime > 0) {
      Neo.player2.dashTime = Math.max(0, Neo.player2.dashTime - dt);
      Neo.player2.vx = Neo.player2.dashX;
      Neo.player2.vy = Neo.player2.dashY;
      Neo.player2.inv = Math.max(Neo.player2.inv, 0.12);
      if (Neo.player2.dashTime <= 0) { Neo.player2.dashX = 0; Neo.player2.dashY = 0; }
    } else {
      const targetSpeed = getAuxPlayerMoveSpeed(Neo.player2);
      Neo.player2.vx = Neo.applyResponsiveVelocity(Neo.player2.vx, p2NX * targetSpeed, dt);
      Neo.player2.vy = Neo.applyResponsiveVelocity(Neo.player2.vy, p2NY * targetSpeed, dt);
    }
    tickPvpPlayer2Cooldowns(dt);
    const p2AimAngle = getPlayer2AimAngle(p2NX, p2NY, _gp1Active ? _gp1 : null);
    Neo.player2.lastAimAngle = p2AimAngle;
    if (Neo.gameMode === 'coop') updateAuxPlayerAbilities(dt, Neo.player2, _gp1, p2AimAngle, '#4ca8ff');
    Neo.moveCircle(Neo.player2, dt);
    Neo.player2.inv = Math.max(0, Neo.player2.inv - dt);
    if (Neo.player2.swing > 0) Neo.player2.swing = Math.max(0, Neo.player2.swing - dt);
    // P2 melee: U key
    if ((Neo.keys['u'] || _gp1Active && _gp1.p2MeleeHeld) && !Neo.player2.meleeLatch && Neo.player2.swing <= 0) {
      Neo.player2.meleeLatch = true;
      const aimAngle = p2AimAngle;
      Neo.player2.swing = Neo.ATTACKS.melee.active;
      Neo.player2.swingA = aimAngle;
      for (const enemy of Neo.enemies) {
        const dx = enemy.x - Neo.player2.x;
        const dy = enemy.y - Neo.player2.y;
        const dist2 = Math.hypot(dx, dy);
        if (dist2 > Neo.ATTACKS.melee.range + enemy.r + 4) continue;
        const a = Math.atan2(dy, dx);
        const diff = Math.abs(((a - aimAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (diff > Neo.ATTACKS.melee.arc) continue;
        const dmg = Math.max(1, Neo.ATTACKS.melee.damage);
        Neo.hitEnemy(enemy, dmg, a, Neo.ATTACKS.melee.push, '#4ca8ff');
      }
    } else if (!Neo.keys['u'] && !(_gp1Active && _gp1.p2MeleeHeld)) {
      Neo.player2.meleeLatch = false;
    }
    // P2 dash: semicolon key
    if ((Neo.keys[';'] || _gp1Active && _gp1.p2DashHeld) && !Neo.player2.dashLatch && Neo.player2.dashTime <= 0) {
      Neo.player2.dashLatch = true;
      const angle = p2Len > 0.1 ? Math.atan2(p2NY, p2NX) : p2AimAngle;
      Neo.player2.dashTime = 0.16;
      Neo.player2.dashX = Math.cos(angle) * 480;
      Neo.player2.dashY = Math.sin(angle) * 480;
      Neo.player2.vx = Neo.player2.dashX;
      Neo.player2.vy = Neo.player2.dashY;
      Neo.player2.inv = Math.max(Neo.player2.inv, 0.18);
    } else if (!Neo.keys[';'] && !(_gp1Active && _gp1.p2DashHeld)) {
      Neo.player2.dashLatch = false;
    }
    const p2LaserHeld = !!(Neo.keys.o || _gp1Active && _gp1.laser);
    if (Neo.gameMode === 'pvp' && Neo.beamStruggle?.opponentPlayer === Neo.player2) {
      if (p2LaserHeld && !Neo.player2.laserLatch) Neo.registerBeamStruggleMash?.(2);
      Neo.player2.laserLatch = p2LaserHeld;
    } else if (Neo.gameMode === 'pvp' && p2LaserHeld) {
      if (!Neo.player2.pvpBeamActive) castPlayer2PvpLaser(p2AimAngle);
      if (Neo.player2.pvpBeamActive) {
        Neo.player2.lastAimAngle = p2AimAngle;
        const range = Neo.getPlayerBeamRange(Neo.player2.pvpBeamMode || 'beam', Neo.player2.pvpBeamMoveKey);
        Neo.player2.pvpBeamPath = Neo.buildRicochetBeamPath(
          Neo.player2.x, Neo.player2.y, p2AimAngle, range,
          Neo.getPlayerBeamBounceCount(Neo.player2.pvpBeamMode || 'beam'),
        );
      }
      Neo.player2.laserLatch = true;
      Neo.player2.localChargeState = {
        slot: 'laser',
        time: Math.min(5, Number(Neo.player2.localChargeState?.slot === 'laser' ? Neo.player2.localChargeState.time : 0) + dt),
        max: 5,
      };
    } else if (Neo.gameMode === 'pvp') {
      releasePlayer2PvpLaser();
      Neo.player2.laserLatch = false;
      if (Neo.player2.localChargeState?.slot === 'laser') Neo.player2.localChargeState = null;
    }
    const p2SmashHeld = !!(Neo.keys.p || _gp1Active && _gp1.smash);
    if (Neo.gameMode === 'pvp' && p2SmashHeld && Neo.player2.pvpSmashCooldown <= 0) {
      Neo.player2.smashLatch = true;
      Neo.player2.localChargeState = {
        slot: 'smash',
        time: Math.min(5, Number(Neo.player2.localChargeState?.slot === 'smash' ? Neo.player2.localChargeState.time : 0) + dt),
        max: 5,
      };
    } else if (Neo.gameMode === 'pvp' && !p2SmashHeld && Neo.player2.smashLatch) {
      const ratio = Number(Neo.player2.localChargeState?.time || 0) / Math.max(1, Number(Neo.player2.localChargeState?.max || 5));
      castPlayer2PvpSmash(ratio);
      Neo.player2.smashLatch = false;
      Neo.player2.localChargeState = null;
    }
    // PVP: P2 melee hits P1
    if (Neo.gameMode === 'pvp' && Neo.player && Neo.player.inv <= 0 && Neo.player2.swing > 0) {
      const pvpDx = Neo.player.x - Neo.player2.x;
      const pvpDy = Neo.player.y - Neo.player2.y;
      const pvpDist = Math.hypot(pvpDx, pvpDy);
      if (pvpDist < Neo.ATTACKS.melee.range + Neo.player.r + 4) {
        const pvpAngle = Math.atan2(Neo.player2.vy || 0, Neo.player2.vx || 1);
        const pvpHitAngle = Math.atan2(pvpDy, pvpDx);
        const pvpDiff = Math.abs(((pvpHitAngle - pvpAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (pvpDiff <= Neo.ATTACKS.melee.arc) {
          const pvpDmg = Math.max(1, Neo.ATTACKS.melee.damage);
          damagePlayer(pvpDmg, Math.atan2(pvpDy, pvpDx), Neo.ATTACKS.melee.push, 'pvp_p2', { ignoreInv: false });
        }
      }
    }
    // Enemy collision damage for P2
    for (const enemy of Neo.enemies) {
      if (enemy.dead) continue;
      const dx = Neo.player2.x - enemy.x;
      const dy = Neo.player2.y - enemy.y;
      if (Math.hypot(dx, dy) < Neo.player2.r + enemy.r + 2 && Neo.player2.inv <= 0) {
        damagePlayer2(enemy.dmg || 10, Math.atan2(dy, dx), 220, 'contact');
      }
    }
  }

  function updatePlayerN(dt, pn, n) {
    if (!pn) return;
    const _gpN = window.NeoGamepad?.[n - 1];
    let mX = 0, mY = 0;
    if (_gpN && Math.hypot(_gpN.moveX || 0, _gpN.moveY || 0) > 0.18) { mX = _gpN.moveX; mY = _gpN.moveY; }
    const len = Math.hypot(mX, mY) || 1;
    const nX = len > 0.1 ? mX / len : 0;
    const nY = len > 0.1 ? mY / len : 0;
    if (pn.dashTime > 0) {
      pn.dashTime = Math.max(0, pn.dashTime - dt);
      pn.vx = pn.dashX; pn.vy = pn.dashY;
      pn.inv = Math.max(pn.inv, 0.12);
      if (pn.dashTime <= 0) { pn.dashX = 0; pn.dashY = 0; }
    } else {
      const targetSpeed = getAuxPlayerMoveSpeed(pn);
      pn.vx = Neo.applyResponsiveVelocity(pn.vx, nX * targetSpeed, dt);
      pn.vy = Neo.applyResponsiveVelocity(pn.vy, nY * targetSpeed, dt);
    }
    Neo.moveCircle(pn, dt);
    pn.inv = Math.max(0, pn.inv - dt);
    if (pn.swing > 0) pn.swing = Math.max(0, pn.swing - dt);
    const aimAngle = getAuxPlayerAimAngle(pn, nX, nY, _gpN);
    pn.lastAimAngle = aimAngle;
    if (_gpN && _gpN.p2MeleeHeld && !pn.meleeLatch && pn.swing <= 0) {
      pn.meleeLatch = true;
      pn.swing = Neo.ATTACKS.melee.active; pn.swingA = aimAngle;
      for (const enemy of Neo.enemies) {
        if (enemy.dead) continue;
        const dx = enemy.x - pn.x, dy = enemy.y - pn.y;
        if (Math.hypot(dx, dy) > Neo.ATTACKS.melee.range + enemy.r + 4) continue;
        const a = Math.atan2(dy, dx);
        if (Math.abs(((a - aimAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI) <= Neo.ATTACKS.melee.arc)
          Neo.hitEnemy(enemy, Math.max(1, Neo.ATTACKS.melee.damage), a, Neo.ATTACKS.melee.push, '#a8d8ff');
      }
    } else if (!(_gpN && _gpN.p2MeleeHeld)) { pn.meleeLatch = false; }
    if (_gpN && _gpN.p2DashHeld && !pn.dashLatch && pn.dashTime <= 0) {
      pn.dashLatch = true;
      const angle = len > 0.1 ? Math.atan2(nY, nX) : aimAngle;
      pn.dashTime = 0.16; pn.dashX = Math.cos(angle) * 480; pn.dashY = Math.sin(angle) * 480;
      pn.vx = pn.dashX; pn.vy = pn.dashY; pn.inv = Math.max(pn.inv, 0.18);
    } else if (!(_gpN && _gpN.p2DashHeld)) { pn.dashLatch = false; }
    updateAuxPlayerAbilities(dt, pn, _gpN, aimAngle, n === 3 ? '#8aff8a' : '#ffd080');
    for (const enemy of Neo.enemies) {
      if (enemy.dead) continue;
      if (Math.hypot(pn.x - enemy.x, pn.y - enemy.y) < pn.r + enemy.r + 2 && pn.inv <= 0)
        damagePlayerN(pn, n, enemy.dmg || 10, Neo.angleBetween(enemy, pn), 220);
    }
  }

  function damagePlayerN(pn, n, amount, angle, knockback, source = '', options = {}) {
    if (!pn || (pn.inv > 0 && !options.ignoreInv)) return;
    pn.hp -= amount;
    if (!options.noInvFrames) {
      Neo.applyImpulse(pn, angle, knockback);
      pn.inv = 0.75;
    }
    if (amount >= 1) spawnDamagePopup(pn.x, pn.y - 18, amount, { color: '#a8d8ff', size: 16 });
    if (pn.hp <= 0) {
      pn.hp = 0;
      const slot = getLocalCoopSlots().find(candidate => candidate.id === n);
      downLocalCoopPlayer(slot);
    }
  }

  function canHitPvpPlayer2() {
    return Neo.gameMode === 'pvp' && !!Neo.pvpState && !!Neo.player2 && !Neo.p2DeadInCoop && Neo.player2.inv <= 0;
  }

  function damagePvpPlayer2(amount, x, y, knockback = 120, source = 'pvp_p1') {
    if (!canHitPvpPlayer2()) return false;
    const angle = Math.atan2(Neo.player2.y - y, Neo.player2.x - x);
    damagePlayer2(Math.max(1, Number(amount || 0)), angle, knockback, source);
    return true;
  }

  function hitPvpPlayer2InRadius(x, y, radius, damage, knockback = 160, source = 'pvp_p1') {
    if (!canHitPvpPlayer2()) return false;
    if (Neo.dist(x, y, Neo.player2.x, Neo.player2.y) > radius + Neo.player2.r) return false;
    return damagePvpPlayer2(damage, x, y, knockback, source);
  }

  function hitPvpPlayer2WithBeamPath(path, radiusPadding, damage, knockback = 60, source = 'pvp_p1_beam') {
    if (!canHitPvpPlayer2()) return null;
    const hitSegment = Neo.beamPathHitsCircle(path, Neo.player2.x, Neo.player2.y, Neo.player2.r + radiusPadding);
    if (!hitSegment) return null;
    damagePlayer2(Math.max(1, Number(damage || 0)), hitSegment.angle, knockback, source);
    return hitSegment;
  }

  function canHitPvpPlayer1() {
    return Neo.gameMode === 'pvp' && !!Neo.pvpState && !!Neo.player && !Neo.p1DeadInCoop && Neo.player.inv <= 0;
  }

  function hitPvpPlayer1InRadius(x, y, radius, damage, knockback = 160, source = 'pvp_p2') {
    if (!canHitPvpPlayer1()) return false;
    if (Neo.dist(x, y, Neo.player.x, Neo.player.y) > radius + Neo.player.r) return false;
    damagePlayer(Math.max(1, Number(damage || 0)), Math.atan2(Neo.player.y - y, Neo.player.x - x), knockback, source);
    return true;
  }

  function hitPvpPlayer1WithBeamPath(path, radiusPadding, damage, knockback = 60, source = 'pvp_p2_beam') {
    if (!canHitPvpPlayer1()) return null;
    const hitSegment = Neo.beamPathHitsCircle(path, Neo.player.x, Neo.player.y, Neo.player.r + radiusPadding);
    if (!hitSegment) return null;
    damagePlayer(Math.max(1, Number(damage || 0)), hitSegment.angle, knockback, source);
    return hitSegment;
  }

  function damagePlayer2(amount, angle, knockback, source = '', options = {}) {
    if (!Neo.player2 || Neo.p2DeadInCoop) return;
    if (Neo.player2.inv > 0 && !options.ignoreInv) return;
    Neo.player2.hp -= amount;
    if (!options.noInvFrames) {
      Neo.applyImpulse(Neo.player2, angle, knockback);
      Neo.player2.inv = 0.75;
    }
    if (amount >= 1) spawnDamagePopup(Neo.player2.x, Neo.player2.y - 18, amount, { color: '#4ca8ff', size: 16 });
    if (Neo.player2.hp <= 0) {
      Neo.player2.hp = 0;
      if (Neo.gameMode === 'pvp' && Neo.pvpState) {
        Neo.pvpState.p1Kills = (Neo.pvpState.p1Kills || 0) + 1;
        Neo.spawnParticle({ x: Neo.player2.x, y: Neo.player2.y - 30, life: 1.5, text: `P1 KILL ${Neo.pvpState.p1Kills}/${Neo.pvpState.killsToWin}`, c: '#ff6b6b' });
        if (Neo.pvpState.p1Kills >= Neo.pvpState.killsToWin) {
          pvpEndGame('P1');
        } else {
          setTimeout(() => { if (Neo.player2) { Neo.player2.hp = Neo.player2.maxHp; Neo.player2.x = Neo.START_X + 80; Neo.player2.y = Neo.START_Y + 40; Neo.player2.inv = 1; } }, 1500);
        }
      } else {
        downLocalCoopPlayer(getLocalCoopSlots().find(slot => slot.id === 2));
      }
    }
  }

  function pvpEndGame(winner) {
    Neo.pvpState = null;
    Neo.player2 = null;
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = 'none';
    Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 40, life: 4, text: `${winner} WINS!`, c: winner === 'P1' ? '#ff6b6b' : '#4ca8ff' });
    setTimeout(() => { Neo.die(); }, 3000);
  }

  function damagePlayer(amount, angle, knockback, source = '', options = {}) {
    const sandbox = Neo.getActiveSandboxSettings();
    if (sandbox?.godMode) return;
    const ignoreInv = !!options.ignoreInv;
    const applyHitstop = !options.noInvFrames;
    const showPopup = options.showPopup !== false;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      if (!Number.isFinite(numericAmount)) console.warn('Ignored invalid player damage', { amount, source });
      return;
    }
    if (!Number.isFinite(Number(Neo.player.maxHp)) || Number(Neo.player.maxHp) <= 0) Neo.player.maxHp = 120;
    if (!Number.isFinite(Number(Neo.player.hp))) Neo.player.hp = Neo.player.maxHp;
    if (!ignoreInv && Neo.player.inv > 0) return;
    if (Neo.player.blockActive && !options.ignoreBlock) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.3, text: 'BLOCK', c: '#9cefff' });
      return;
    }
    if (Neo.isChallengeActive('no_hit')) {
      Neo.lastDamageSource = options.sourceLabel ? String(options.sourceLabel) : Neo.getDamageSourceLabel(source || 'no_hit');
      Neo.lastDamageSourceKey = String(options.sourceKey || source || 'no_hit');
      Neo.player.hp = 0;
      Neo.player.inv = 0;
      Neo.shake = 10;
      Neo.shakeT = 0.18;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.95, text: 'HIT RUN FAILED', c: '#ff7a88' });
      Neo.die();
      return;
    }
    const itemStats = Neo.getItemStats();
    const hpBeforeHit = Neo.player.hp;
    const halfHpThreshold = Neo.player.maxHp * 0.5;
    const ironLungApplies = itemStats.hasIronLung && !Neo.isBossFightActive();
    // Cold (slow) stacks make the player brittle: scale down their effective
    // damage reduction so they take more damage per stack.
    const brittleDefenseMult = Neo.getBrittleDefenseMultiplier?.(Neo.player) ?? 1;
    const effectiveDamageReduction = (itemStats.damageReduction || 0) * brittleDefenseMult;
    // Blessed elites land a high-chance crit on the player. The crit scales the
    // base amount but still passes through damage reduction, barriers and the
    // one-shot guard below, so it can't bypass the per-hit cap.
    const eliteAttacker = options.attacker;
    const minorPackDamageMultiplier = Math.max(1, Number(eliteAttacker?.minorPackDamageMultiplier || 1));
    let critAmount = numericAmount * minorPackDamageMultiplier;
    if (eliteAttacker?.elite && Number(eliteAttacker.eliteCrit || 0) > 0 && Neo.nextRandom('encounter') < eliteAttacker.eliteCrit) {
      critAmount = numericAmount * 1.4;
      if (showPopup) Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.42, text: 'CRIT', c: '#ff9f1c' });
    }
    // Enemy crit aggression (time-based ramp). Applies to enemy attacks that don't
    // author their own crit — hazards and self-crit paths (rival/mirror knight, the
    // elite crit above) opt out. Every 5 min adds +5% damage and +5% crit chance;
    // a rolled crit multiplies by the time-scaled crit multiplier (see
    // getEnemyTimeAggression / applyCritRollback for the 100%→×1.5→75% roll-back).
    const aggressionSource = String(options.sourceKey || source || '').toLowerCase();
    const isHazardSource = ENEMY_AGGRESSION_EXEMPT_SOURCES.has(aggressionSource);
    const skipAggression = options.noEnemyAggression
      || isHazardSource
      || (eliteAttacker?.elite && Number(eliteAttacker.eliteCrit || 0) > 0); // elite already rolled its own crit
    if (!skipAggression && critAmount > 0) {
      const aggression = Neo.getEnemyTimeAggression?.();
      if (aggression && aggression.steps > 0) {
        critAmount *= aggression.damageMultiplier;
        if (aggression.critChance > 0 && Neo.nextRandom('encounter') < aggression.critChance) {
          critAmount *= aggression.critMultiplier;
          if (showPopup) Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.42, text: 'CRIT', c: '#ff5d5d' });
        }
      }
    }
    let finalAmount = critAmount * (Neo.isChallengeActive('glass_cannon') ? 1.35 : 1) * (1 - effectiveDamageReduction);
    if (sandbox) finalAmount *= sandbox.enemyDamageMultiplier;
    finalAmount = Math.max(0, finalAmount - Math.max(0, Number(itemStats.flatDamageReduction || 0)));
    if (ironLungApplies && !options.ignoreDamageCaps) {
      finalAmount = Math.min(finalAmount, Neo.player.maxHp * 0.2);
    }
    finalAmount = Math.max(0, finalAmount);
    const barrierBeforeHit = Math.max(0, Number(Neo.player.overhealBarrier || 0));
    if (barrierBeforeHit > 0 && finalAmount > 0) {
      const barrierColor = Neo.player.overhealBarrierColor || '#9cefff';
      const absorbed = Math.min(barrierBeforeHit, finalAmount);
      Neo.player.overhealBarrier = Math.max(0, barrierBeforeHit - absorbed);
      if (Neo.player.overhealBarrier <= 0) {
        Neo.player.overhealBarrierMax = 0;
        Neo.player.overhealBarrierColor = '';
      }
      finalAmount = Math.max(0, finalAmount - absorbed);
      if (absorbed >= 1 && showPopup) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 34, life: 0.4, text: `BLOCK ${Math.ceil(absorbed)}`, c: barrierColor });
      }
      if (finalAmount <= 0) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 22, life: 0.34, text: 'BARRIER', c: barrierColor });
        if (applyHitstop) {
          Neo.player.inv = Math.max(Neo.player.inv, 0.18);
          Neo.shake = Math.max(Neo.shake, 3);
          Neo.shakeT = Math.max(Neo.shakeT, 0.08);
        }
        return;
      }
    }
    if (applyHitstop && !options.ignoreDamageCaps && !options.ignoreOneShotGuard && Neo.player.maxHp > 0) {
      const sourceKey = String(options.sourceKey || source || '').toLowerCase();
      const bossLike = Neo.isBossFightActive?.()
        || Neo.BOSS_TYPES?.has(sourceKey)
        || sourceKey.includes('boss')
        || sourceKey.includes('god')
        || sourceKey.includes('queen')
        || sourceKey.includes('artificer')
        || sourceKey.includes('golem');
      const maxHitRatio = Number.isFinite(Number(options.maxHitRatio))
        ? Neo.clamp(Number(options.maxHitRatio), 0, 1)
        : bossLike ? 0.62 : 0.48;
      const maxSingleHit = Math.max(18, Neo.player.maxHp * maxHitRatio);
      finalAmount = Math.min(finalAmount, maxSingleHit);
      if (hpBeforeHit > Neo.player.maxHp * 0.35 && hpBeforeHit - finalAmount <= 0) {
        finalAmount = Math.max(0, hpBeforeHit - 1);
      }
    }
    if (finalAmount <= 0) {
      if (Neo.player.hp <= 0) Neo.die();
      return;
    }
    Neo.lastDamageSource = options.sourceLabel ? String(options.sourceLabel) : Neo.getDamageSourceLabel(source);
    Neo.lastDamageSourceKey = String(options.sourceKey || source || '');

    Neo.player.hp -= finalAmount;
    const duringGodFight = Neo.currentRoom?.type === 'god'
      || Neo.enemies.some(enemy => enemy && !enemy.dead && enemy.type === 'god' && Number(enemy.hp || 0) > 0);
    window.achievementEvents?.emit('damage:taken', { amount: finalAmount, duringGodFight });

    // Elite on-hit procs (Enflamed/Gross/Breezy) ride every damage source the
    // elite deals through this choke point.
    if (eliteAttacker?.elite) Neo.applyEliteProcsToPlayer?.(eliteAttacker);

    if (Neo.getItemCount('insurance') > 0 && Neo.player.insuranceReady && hpBeforeHit > halfHpThreshold && Neo.player.hp <= halfHpThreshold) {
      Neo.player.hp = Math.max(Neo.player.hp, halfHpThreshold);
      Neo.consumeCharge('insurance');
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 0.8, text: 'INSURANCE USED', c: '#e6eeff' });
    }

    finalAmount = Math.max(0, hpBeforeHit - Neo.player.hp);
    if (finalAmount > 0) Neo.lowHealthHitFlashUntil = Date.now() + Neo.LOW_HEALTH_HIT_FLASH_MS;
    // Heme's Scarf retaliates: when hit, a chance per scarf stack to bleed the
    // attacker. Bleeds the enemy, never the player.
    if (finalAmount > 0 && itemStats.scarfBleedsOnHit > 0 && !options.noInvFrames) {
      const scarfBleedChance = Math.min(0.75, itemStats.scarfBleedsOnHit * 0.25);
      if (Neo.nextRandom('encounter') < scarfBleedChance) {
        const attacker = Neo.findKillerEnemyEntity?.(options.sourceKey || source, Neo.lastDamageSource);
        if (attacker && !attacker.dead && !attacker.bleedImmune) {
          Neo.applyBleed(attacker, 1, 4);
        }
      }
    }

    if (applyHitstop) {
      Neo.player.inv = 0.75;
      // Anchor Charm roots the player: reduce incoming knockback. The reduced value
      // also feeds the impact-stun check, so less shove = harder to heavy-knockback stun.
      const resistedKnockback = knockback * (1 - Number(itemStats.anchorKnockbackResist || 0));
      Neo.applyImpulse(Neo.player, angle, resistedKnockback);
      Neo.applyPlayerImpactStun(finalAmount, resistedKnockback);
      const hitRatio = Neo.clamp(finalAmount / Math.max(1, Neo.player.maxHp), 0, 1);
      Neo.addHitstop?.(0.025 + hitRatio * 0.055);
      Neo.shake = 8;
      Neo.shakeT = 0.15;
    }
    if (showPopup && finalAmount >= 1) {
      spawnDamagePopup(Neo.player.x, Neo.player.y - 18, finalAmount, { color: '#ff6b6b', size: 16 });
    }
    if (window.NeoSettings?.shouldBloodOnHit?.() !== false && options.bloodOnHit !== false) {
      Neo.spawnBleedSpray?.(Neo.player, 1, 0.72);
    }
    if (
      finalAmount > 0
      && Neo.player.hp > 0
      && Neo.player.hp < Neo.player.maxHp * 0.10
      && Number(Neo.player.storedPotions || 0) > 0
    ) {
      Neo.tryUsePotion?.();
    }
    if (Neo.player.hp <= 0) {
      if (Neo.gameMode === 'practice') {
        Neo.player.hp = Neo.player.maxHp;
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 0.9, text: 'PRACTICE — NO DEATH', c: '#a880ff' });
      } else {
        if (Neo.gameMode === 'pvp' && Neo.pvpState && Neo.player2) {
          Neo.pvpState.p2Kills = (Neo.pvpState.p2Kills || 0) + 1;
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 1.5, text: `P2 KILL ${Neo.pvpState.p2Kills}/${Neo.pvpState.killsToWin}`, c: '#4ca8ff' });
          if (Neo.pvpState.p2Kills >= Neo.pvpState.killsToWin) {
            Neo.player.hp = 0;
            pvpEndGame('P2');
          } else {
            Neo.player.hp = Neo.player.maxHp;
            Neo.player.x = Neo.START_X - 80; Neo.player.y = Neo.START_Y - 40;
            Neo.player.inv = 1;
          }
        } else if (Neo.gameMode === 'coop' && hasLivingCoopTeammate(1)) {
          downLocalCoopPlayer(getLocalCoopSlots().find(slot => slot.id === 1));
        } else {
          Neo.die();
        }
      }
    }
  }

  function tickPlayerStatus(key, dt, config) {
    const stats = Neo.getItemStats?.() || {};
    globalThis.NeoNyke.simulation.tickCampaignStatuses(Neo.player, dt, {
      keys: [key],
      maxHp: Neo.player.maxHp,
      targetKind: 'player',
      fireResistance: Number(stats.fireResistance || 0),
      playerColdBudget: true,
      getDurationDecay: statusKey => statusKey === 'bleed' ? Number(stats.bleedDurationDecayMultiplier || 1) : 1,
      isDead: () => Number(Neo.player.hp || 0) <= 0,
      dealDamage: (statusKey, rawDamage, state) => {
        const resistance = statusKey === 'bleed' ? Number(stats.bleedResistance || 0) : 0;
        const damageMultiplier = Math.max(0.2, 1 - resistance);
        const statusSeverity = Number(stats.negativeStatusMultiplier || 1);
        const damage = Math.max(0.25, rawDamage * damageMultiplier * statusSeverity);
        // Attribute the kill to whoever inflicted the status (e.g. "Mooggy"),
        // falling back to the status name when the source is unknown.
        const inflictorKey = String(state.sourceKey || '').trim();
        if (inflictorKey) {
          const inflictorLabel = state.sourceLabel || Neo.getDamageSourceLabel(inflictorKey);
          damagePlayer(damage, 0, 0, inflictorKey, {
            ignoreInv: true,
            noInvFrames: true,
            // Keep the killer key (for death quotes / killer icon) but label the
            // death screen with the status that finished the player off.
            sourceKey: inflictorKey,
            sourceLabel: `${inflictorLabel} (${statusKey})`,
          });
        } else {
          damagePlayer(damage, 0, 0, statusKey, { ignoreInv: true, noInvFrames: true });
        }
        return damage;
      },
      onTick: (statusKey, state, dealt) => {
        if (typeof config?.onTick === 'function') config.onTick(dealt, state);
        if (Neo.nextRandom('fx') < 0.3) {
          Neo.spawnParticle({ x: Neo.player.x + Neo.rand(-8, 8), y: Neo.player.y + Neo.rand(-8, 8), life: 0.25, c: config?.color || Neo.STATUS_STYLES[statusKey]?.color });
        }
      },
    });
  }

  function updatePlayerStatuses(dt) {
    if (!Neo.player) return;
    // Mateo Potion Bath: status resistance window + heal-over-time regen.
    if (Number(Neo.player.statusResistTime || 0) > 0) {
      Neo.player.statusResistTime = Math.max(0, Number(Neo.player.statusResistTime) - dt);
      if (Neo.nextRandom('fx') < 0.18) {
        Neo.spawnParticle({ x: Neo.player.x + Neo.rand(-10, 10), y: Neo.player.y + Neo.rand(-10, 10), life: 0.3, c: '#9af7d8' });
      }
    }
    if (Number(Neo.player.potionRegenTime || 0) > 0) {
      Neo.player.potionRegenTime = Math.max(0, Number(Neo.player.potionRegenTime) - dt);
      // Regen ~2% max HP per second over the window, applied each 0.5s.
      Neo.player.potionRegenAccum = Number(Neo.player.potionRegenAccum || 0) + dt;
      while (Neo.player.potionRegenAccum >= 0.5) {
        Neo.player.potionRegenAccum -= 0.5;
        const gained = Neo.applyPlayerHealing(Math.max(1, Math.round(Neo.player.maxHp * 0.01)));
        if (gained > 0) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-6, 6), Neo.player.y - 20, gained, { color: '#9af7d8' });
      }
    }
    // Tooth of Thorn drain bleed-out: while active, trickle thornDrainRate HP/s
    // (set by the last proc), applied every 0.5s. Rate decays alongside the timer.
    if (Number(Neo.player.thornDrainTime || 0) > 0 && Number(Neo.player.thornDrainRate || 0) > 0) {
      Neo.player.thornDrainTime = Math.max(0, Number(Neo.player.thornDrainTime) - dt);
      Neo.player.thornDrainAccum = Number(Neo.player.thornDrainAccum || 0) + dt;
      while (Neo.player.thornDrainAccum >= 0.5) {
        Neo.player.thornDrainAccum -= 0.5;
        const heal = Neo.scalePlayerHealing(Neo.player.thornDrainRate * 0.5, 1);
        const gained = Neo.applyPlayerHealing(heal);
        if (gained > 0) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-6, 6), Neo.player.y - 20, gained, { color: '#ff8fb4', size: 12 });
      }
      if (Neo.player.thornDrainTime <= 0) Neo.player.thornDrainRate = 0;
    }
    // Overheal shield decay: once a shield has been up for 5s, it bleeds away
    // at 1 point per 50ms (20/s) until it expires.
    if (Number(Neo.player.overhealBarrier || 0) > 0) {
      Neo.player.overhealBarrierAge = Number(Neo.player.overhealBarrierAge || 0) + dt;
      if (Neo.player.overhealBarrierAge > 5) {
        const drained = (dt / 0.05); // 1 point per 50ms
        Neo.player.overhealBarrier = Math.max(0, Number(Neo.player.overhealBarrier) - drained);
        if (Neo.player.overhealBarrier <= 0) {
          Neo.setOverhealBarrier(0, 0, '');
        }
      }
    } else {
      Neo.player.overhealBarrierAge = 0;
    }
    Neo.player.critCharmBuffTime = Math.max(0, Number(Neo.player.critCharmBuffTime || 0) - dt);
    Neo.player.keenEyeBuffTime = Math.max(0, Number(Neo.player.keenEyeBuffTime || 0) - dt);
    Neo.player.chronoSpringBuffTime = Math.max(0, Number(Neo.player.chronoSpringBuffTime || 0) - dt);
    tickPlayerStatus('bleed', dt, {
      color: Neo.STATUS_STYLES.bleed.color,
    });
    tickPlayerStatus('fire', dt, {
      color: Neo.STATUS_STYLES.fire.color,
    });
    tickPlayerStatus('poison', dt, {
      color: Neo.STATUS_STYLES.poison.color,
    });
    tickPlayerStatus('dark_drain', dt, {
      color: Neo.STATUS_STYLES.dark_drain.color,
      // Siphon the drained HP back to the enemy that applied it — the same way
      // the player's drain heals off an enemy's dark_drain DoT. Heal scales with
      // the damage drained this tick (capped so deep-floor max-HP scaling can't
      // make a single drain stack fully top a boss off).
      onTick: (damage, state) => {
        const owner = state.owner;
        if (!owner || owner.dead) return;
        const maxHp = Number(owner.max || owner.maxHp || owner.hp || 0);
        if (maxHp <= 0 || owner.hp >= maxHp) return;
        const heal = Math.max(1, Math.min(Math.round(damage), Math.round(maxHp * 0.02)));
        const before = Number(owner.hp || 0);
        owner.hp = Math.min(maxHp, before + heal);
        const gained = Math.round(owner.hp - before);
        if (gained > 0) {
          Neo.spawnHealPopup?.(owner.x + Neo.rand(-6, 6), owner.y - owner.r - 10, gained, { color: '#c98dff', size: 11 });
        }
      },
    });
    tickPlayerStatus('static', dt, {
      color: Neo.STATUS_STYLES.static.color,
    });
    // Cold (slow) deals no damage-over-time; it just slows + makes brittle.
    // Player cold stores 15s of duration per stack, so visible stacks drop one
    // at a time as that budget decays.
    tickPlayerStatus('slow', dt, { color: Neo.STATUS_STYLES.slow.color });
  }

  const ENEMY_QUERY_CELL_SIZE = 128;

  function getEnemyCellBounds(left, top, right, bottom) {
    return {
      minX: Math.floor(left / ENEMY_QUERY_CELL_SIZE),
      maxX: Math.floor(right / ENEMY_QUERY_CELL_SIZE),
      minY: Math.floor(top / ENEMY_QUERY_CELL_SIZE),
      maxY: Math.floor(bottom / ENEMY_QUERY_CELL_SIZE),
    };
  }

  // Pack a (cellX, cellY) pair into a single integer key. Cell coords are
  // Math.floor(px / 128) and can be negative, so bias by a large offset before
  // packing. A string key here would allocate + hash on every cell every frame
  // (the index is rebuilt per frame); an integer key avoids both.
  const ENEMY_CELL_OFFSET = 4096;
  const ENEMY_CELL_STRIDE = 8192;
  function getEnemyCellKey(cellX, cellY) {
    return (cellX + ENEMY_CELL_OFFSET) * ENEMY_CELL_STRIDE + (cellY + ENEMY_CELL_OFFSET);
  }

  function buildEnemySpatialIndex() {
    const cells = new Map();
    const enemies = Array.isArray(Neo.enemies) ? Neo.enemies : [];
    for (const enemy of enemies) {
      if (!enemy || enemy.dead || enemy.hp <= 0) continue;
      const radius = Math.max(1, Number(enemy.r || 0));
      const bounds = getEnemyCellBounds(enemy.x - radius, enemy.y - radius, enemy.x + radius, enemy.y + radius);
      for (let cellY = bounds.minY; cellY <= bounds.maxY; cellY += 1) {
        for (let cellX = bounds.minX; cellX <= bounds.maxX; cellX += 1) {
          const key = getEnemyCellKey(cellX, cellY);
          let bucket = cells.get(key);
          if (!bucket) {
            bucket = [];
            cells.set(key, bucket);
          }
          bucket.push(enemy);
        }
      }
    }
    return { cells };
  }

  // Build (or reuse) the spatial indexes at most once per frame. The per-query
  // consumers below already honor the `...IndexFrame === Neo.simulationTick` cache;
  // these ensure-helpers let the per-frame update functions populate that cache
  // instead of rebuilding unconditionally.
  function ensureEnemySpatialIndex() {
    if (Neo.enemySpatialIndexFrame !== Neo.simulationTick || !Neo.enemySpatialIndex) {
      Neo.enemySpatialIndex = buildEnemySpatialIndex();
      Neo.enemySpatialIndexFrame = Neo.simulationTick;
    }
    return Neo.enemySpatialIndex;
  }

  // Force a fresh enemy index for the current frame. Used right after enemy
  // movement so projectile collision sees post-movement positions (any index
  // built earlier this frame, e.g. during enemy AI, predates that movement).
  function rebuildEnemySpatialIndex() {
    Neo.enemySpatialIndex = buildEnemySpatialIndex();
    Neo.enemySpatialIndexFrame = Neo.simulationTick;
    return Neo.enemySpatialIndex;
  }

  function ensureDestructibleSpatialIndex() {
    if (Neo.destructibleSpatialIndexFrame !== Neo.simulationTick || !Neo.destructibleSpatialIndex) {
      Neo.destructibleSpatialIndex = buildDestructibleSpatialIndex();
      Neo.destructibleSpatialIndexFrame = Neo.simulationTick;
    }
    return Neo.destructibleSpatialIndex;
  }

  function queryEnemyIndexCells(index, bounds, visitor) {
    if (!index?.cells) return;
    const seen = new Set();
    for (let cellY = bounds.minY; cellY <= bounds.maxY; cellY += 1) {
      for (let cellX = bounds.minX; cellX <= bounds.maxX; cellX += 1) {
        const bucket = index.cells.get(getEnemyCellKey(cellX, cellY));
        if (!bucket) continue;
        for (const enemy of bucket) {
          if (!enemy || enemy.dead || enemy.hp <= 0 || seen.has(enemy)) continue;
          seen.add(enemy);
          visitor(enemy);
        }
      }
    }
  }

  function forEachEnemyNearCircle(x, y, radius, visitor, options = {}) {
    const searchRadius = Math.max(0, Number(radius || 0));
    const index = options.index
      || (Neo.enemySpatialIndexFrame === Neo.simulationTick ? Neo.enemySpatialIndex : null)
      || buildEnemySpatialIndex();
    const bounds = getEnemyCellBounds(x - searchRadius, y - searchRadius, x + searchRadius, y + searchRadius);
    queryEnemyIndexCells(index, bounds, enemy => {
      if (options.exclude && options.exclude.has?.(enemy)) return;
      if (options.excludeEnemy && enemy === options.excludeEnemy) return;
      visitor(enemy);
    });
  }

  function forEachEnemyNearRect(left, top, width, height, visitor, options = {}) {
    const padding = Math.max(0, Number(options.padding || 0));
    const index = options.index
      || (Neo.enemySpatialIndexFrame === Neo.simulationTick ? Neo.enemySpatialIndex : null)
      || buildEnemySpatialIndex();
    const bounds = getEnemyCellBounds(left - padding, top - padding, left + width + padding, top + height + padding);
    queryEnemyIndexCells(index, bounds, enemy => {
      if (options.exclude && options.exclude.has?.(enemy)) return;
      if (options.excludeEnemy && enemy === options.excludeEnemy) return;
      visitor(enemy);
    });
  }

  function getDestructibleSpatialBounds(prop) {
    if (prop?.w && prop?.h) {
      return {
        left: prop.x - prop.w / 2,
        top: prop.y - prop.h / 2,
        right: prop.x + prop.w / 2,
        bottom: prop.y + prop.h / 2,
      };
    }
    const radius = Math.max(1, Number(prop?.r || 0));
    return {
      left: prop.x - radius,
      top: prop.y - radius,
      right: prop.x + radius,
      bottom: prop.y + radius,
    };
  }

  function buildDestructibleSpatialIndex() {
    const cells = new Map();
    const destructibles = Array.isArray(Neo.destructibles) ? Neo.destructibles : [];
    for (const prop of destructibles) {
      if (!prop || prop.broken || prop.hidden) continue;
      const propBounds = getDestructibleSpatialBounds(prop);
      const bounds = getEnemyCellBounds(propBounds.left, propBounds.top, propBounds.right, propBounds.bottom);
      for (let cellY = bounds.minY; cellY <= bounds.maxY; cellY += 1) {
        for (let cellX = bounds.minX; cellX <= bounds.maxX; cellX += 1) {
          const key = getEnemyCellKey(cellX, cellY);
          let bucket = cells.get(key);
          if (!bucket) {
            bucket = [];
            cells.set(key, bucket);
          }
          bucket.push(prop);
        }
      }
    }
    return { cells };
  }

  function forEachDestructibleNearCircle(x, y, radius, visitor, options = {}) {
    const searchRadius = Math.max(0, Number(radius || 0));
    const index = options.index
      || (Neo.destructibleSpatialIndexFrame === Neo.simulationTick ? Neo.destructibleSpatialIndex : null)
      || buildDestructibleSpatialIndex();
    const bounds = getEnemyCellBounds(x - searchRadius, y - searchRadius, x + searchRadius, y + searchRadius);
    // queryEnemyIndexCells already dedupes across cells via its own `seen` set, so
    // a second Set here is redundant allocation on a per-projectile, per-frame hot
    // path. Drop it and let the shared dedup handle uniqueness.
    queryEnemyIndexCells(index, bounds, prop => {
      if (!prop || prop.broken || prop.hidden) return;
      visitor(prop);
    });
  }

  function forEachDestructibleNearRect(left, top, width, height, visitor, options = {}) {
    const padding = Math.max(0, Number(options.padding || 0));
    const index = options.index
      || (Neo.destructibleSpatialIndexFrame === Neo.simulationTick ? Neo.destructibleSpatialIndex : null)
      || buildDestructibleSpatialIndex();
    const bounds = getEnemyCellBounds(left - padding, top - padding, left + width + padding, top + height + padding);
    queryEnemyIndexCells(index, bounds, prop => {
      if (!prop || prop.broken || prop.hidden) return;
      visitor(prop);
    });
  }

  function getBombHazardDamage(baseDamage) {
    const base = Math.max(0, Number(baseDamage || 0));
    if (base <= 0) return 0;
    const progressionDepth = Math.max(
      1,
      Number(Neo.getProgressionDepth?.() ?? Neo.floorsEntered ?? Neo.floor ?? 1),
    );
    const minutes = Math.max(0, Number(Neo.gameElapsedTime || 0) / 60);
    const floorRate = Math.max(0, Number(Neo.BOMB_HAZARD_SCALING?.floor ?? 0.07));
    const minuteRate = Math.max(0, Number(Neo.BOMB_HAZARD_SCALING?.minute ?? 0.04));
    const multiplier = 1 + (progressionDepth - 1) * floorRate + minutes * minuteRate;
    return Math.max(1, Math.round(base * multiplier));
  }

  function getRadialFalloffDamage(baseDamage, distance, radius, centerMultiplier = 1, edgeMultiplier = 1) {
    const safeRadius = Math.max(1, Number(radius || 0));
    const normalizedDistance = Neo.clamp(Math.max(0, Number(distance || 0)) / safeRadius, 0, 1);
    const proximity = 1 - normalizedDistance;
    const multiplier = Number(edgeMultiplier || 0)
      + (Number(centerMultiplier || 0) - Number(edgeMultiplier || 0)) * proximity;
    return Math.max(0, Math.round(Math.max(0, Number(baseDamage || 0)) * multiplier));
  }

  function blastRadius(x, y, radius, damage, color, sourceEnemy = null, knockback = 200, options = {}) {
    // A blast is visually different from a generic magic AoE. Route it through
    // the full detonation stack (flash, pressure rings, hot square fragments,
    // embers and smoke) even when its gameplay damage is modest.
    spawnAoeShockwave(x, y, radius, color, 'explosion');
    if (sourceEnemy) getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
      const actor = slot.getEntity();
      const playerDistance = Neo.dist(x, y, actor.x, actor.y);
      if (playerDistance > radius + actor.r) return;
      const falloff = options.playerDamageFalloff;
      const playerDamage = falloff
        ? getRadialFalloffDamage(damage, playerDistance, radius, falloff.centerMultiplier, falloff.edgeMultiplier)
        : damage;
      damagePlayerSlot(slot, playerDamage, Math.atan2(actor.y - y, actor.x - x), knockback, sourceEnemy.type || 'enemy_aoe');
    });
    if (!sourceEnemy) hitPvpPlayer2InRadius(x, y, radius, damage, knockback, 'pvp_p1_aoe');
    forEachEnemyNearCircle(x, y, radius, enemy => {
      if (Neo.dist(x, y, enemy.x, enemy.y) > radius + enemy.r) return;
      Neo.hitEnemy(enemy, damage, Math.atan2(enemy.y - y, enemy.x - x), knockback * 0.9, color);
    }, { excludeEnemy: sourceEnemy });
    forEachDestructibleNearCircle(x, y, radius + 80, prop => {
      if (!prop.broken && !prop.hidden && Neo.dist(x, y, prop.x, prop.y) <= radius + prop.r) {
        damageDestructible(prop, damage, { sourceX: x, sourceY: y, impactType: 'blast', force: 1.6 });
      }
    });
  }

  // Detonates an enemy projectile's `enemyBlast` config at (x, y): a frost/AOE
  // burst that damages the player (and props) in a radius and applies a status.
  function detonateEnemyProjectileBlast(projectile, x = projectile?.x, y = projectile?.y) {
    const blast = projectile?.enemyBlast;
    if (!blast || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const radius = Math.max(1, Number(blast.radius || 0));
    const damage = Math.max(0, Number(blast.damage || 0));
    const color = blast.color || projectile.color || '#9fe8ff';
    spawnAoeShockwave(x, y, radius, color, 'explosion');
    Neo.spawnParticle({ x, y, life: 0.5, ring: radius, c: color });
    if (damage > 0) getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
      const actor = slot.getEntity();
      if (Neo.dist(x, y, actor.x, actor.y) > radius + actor.r) return;
      damagePlayerSlot(slot, damage, Math.atan2(actor.y - y, actor.x - x), Number(blast.knockback || 220), projectile.source || 'enemy_aoe');
      if (blast.statusKey) {
        Neo.applyStatus?.(actor, blast.statusKey, Number(blast.statusStacks || 1), Number(blast.statusDuration || 3), projectile.source || 'enemy_aoe');
      }
    });
    forEachDestructibleNearCircle(x, y, radius + 80, prop => {
      if (!prop.broken && !prop.hidden && Neo.dist(x, y, prop.x, prop.y) <= radius + prop.r) {
        damageDestructible(prop, damage, { sourceX: x, sourceY: y, impactType: 'blast', force: 1.4 });
      }
    });
  }

  // Detonates a Love Bomb Laser (player AOE, not the enemy-blast path above):
  // damages/knocks back every enemy in radius via blastRadius, then rolls a
  // per-enemy chance to Sparkle them (mark for guaranteed crits), reusing the
  // same critSparkle mechanic the Sparkle Charm item grants.
  function detonateLoveBomb(projectile, x = projectile?.x, y = projectile?.y) {
    if (!projectile || projectile.kind !== 'love_bomb' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const radius = Math.max(1, Number(projectile.aoeRadius || 60));
    const damage = Math.max(0, Number(projectile.damage || 0));
    const sparkleChance = Neo.clamp(Number(projectile.sparkleChance || 0), 0, 1);
    const color = projectile.color || '#ff6fa8';
    if (projectile.enemy) {
      Neo.ringBurst(x, y, radius, color, 0.5);
      Neo.spawnAoeShockwave?.(x, y, radius, color, 'explosion');
      getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
        const actor = slot.getEntity();
        if (Neo.dist(x, y, actor.x, actor.y) > radius + actor.r) return;
        const angle = Math.atan2(actor.y - y, actor.x - x);
        damagePlayerSlot(slot, damage, angle, 220, projectile.source || 'rival_love_bomb', {
          sourceKey: projectile.source || 'rival_love_bomb',
          sourceLabel: projectile.sourceLabel || 'Rival Love Bomb',
        });
      });
      return;
    }
    blastRadius(x, y, radius, damage, color);
    if (sparkleChance > 0) {
      forEachEnemyNearCircle(x, y, radius, enemy => {
        if (!enemy || enemy.dead) return;
        if (Neo.dist(x, y, enemy.x, enemy.y) > radius + enemy.r) return;
        if (Neo.nextRandom('encounter') >= sparkleChance) return;
        enemy.critSparkle = Math.max(Number(enemy.critSparkle || 0), 4);
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 14, life: 0.6, text: 'SPARKLED', c: '#ffe8a3' });
      });
    }
  }

  function spawnAoeShockwave(x, y, radius, color = '#ff66cc', style = 'normal') {
    const access = window.NeoSettings?.getAccess?.() || {};
    const reducedParticles = !!access.reduceParticles;
    const reducedFlash = !!access.reduceFlash;
    const motionScale = access.reduceMotion ? 0.48 : 1;
    const explosive = style === 'explosion';
    const heavy = explosive || style === 'heavy';
    const safeRadius = Math.max(12, Number(radius || 48));
    const shockLife = explosive ? 0.44 : Neo.AOE_SHOCKWAVE_LIFE;

    // Smoke goes in first so the luminous pressure front and fragments stay
    // readable on top of it. Fast dark puffs make the bright core feel like it
    // displaced volume instead of merely drawing a colored circle.
    if (heavy) {
      const smokeCount = reducedParticles ? (explosive ? 3 : 2) : (explosive ? 10 : 5);
      for (let index = 0; index < smokeCount; index += 1) {
        const angle = (index / smokeCount) * Math.PI * 2 + Neo.rand(0.38, -0.38, 'fx');
        const speed = Neo.rand(explosive ? 105 : 72, 28, 'fx') * motionScale;
        const life = Neo.rand(explosive ? 0.92 : 0.68, 0.42, 'fx');
        Neo.spawnParticle({
          x: x + Math.cos(angle) * Neo.rand(18, 3, 'fx'),
          y: y + Math.sin(angle) * Neo.rand(18, 3, 'fx'),
          life,
          maxLife: life,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          c: index % 3 === 0 ? '#5a3020' : '#241d1b',
          smoke: true,
          size: Neo.rand(explosive ? 13 : 10, 6, 'fx'),
          grow: Neo.rand(20, 10, 'fx'),
          drag: 2.8,
        });
      }
    }

    Neo.spawnParticle({
      x,
      y,
      life: shockLife,
      maxLife: shockLife,
      shockwave: true,
      radius: safeRadius,
      c: color,
      style,
    });

    if (heavy) {
      // The pale inner pressure ring gets out ahead of the colored wave. This
      // two-speed silhouette reads as a detonation even with glow disabled.
      Neo.spawnParticle({
        x,
        y,
        life: explosive ? 0.23 : 0.19,
        maxLife: explosive ? 0.23 : 0.19,
        shockwave: true,
        radius: safeRadius * (explosive ? 0.74 : 0.62),
        c: explosive ? '#fff0c2' : '#ffffff',
        style: 'pressure',
      });

      // A single procedural core is much cheaper than faking the flash with
      // dozens of overlapping particles. Reduced Flash keeps its silhouette
      // but removes the full-white peak.
      Neo.spawnParticle({
        x,
        y,
        life: explosive ? 0.28 : 0.2,
        maxLife: explosive ? 0.28 : 0.2,
        explosionCore: true,
        radius: Math.min(safeRadius * (explosive ? 0.64 : 0.46), explosive ? 104 : 68),
        c: color,
        reducedFlash,
      });
    }

    // Evenly distributed angles create the fast circular blast the effect was
    // missing. Jittered speed/size prevents it from looking like a loading
    // spinner; alternating white-hot and colored squares keeps the center hot.
    const sparks = reducedParticles
      ? (heavy ? 8 : 5)
      : explosive ? 30 : heavy ? 20 : 7;
    for (let index = 0; index < sparks; index += 1) {
      const angle = (index / sparks) * Math.PI * 2 + Neo.rand(0.22, -0.22, 'fx');
      const speed = heavy
        ? Neo.rand(explosive ? 560 : 390, explosive ? 230 : 145, 'fx')
        : Neo.rand(170, 70, 'fx');
      const life = heavy
        ? Neo.rand(explosive ? 0.56 : 0.44, 0.2, 'fx')
        : Neo.rand(0.34, 0.16, 'fx');
      const whiteHot = heavy && index % (explosive ? 3 : 4) === 0;
      Neo.spawnParticle({
        x: x + Math.cos(angle) * Math.min(safeRadius * 0.22, 28),
        y: y + Math.sin(angle) * Math.min(safeRadius * 0.22, 28),
        life,
        maxLife: life,
        vx: Math.cos(angle) * speed * motionScale,
        vy: Math.sin(angle) * speed * motionScale,
        c: whiteHot ? '#fff8dc' : color,
        spark: !heavy,
        square: heavy,
        size: heavy ? Neo.rand(explosive ? 7.5 : 6, 3.2, 'fx') : 2.4,
        rotation: angle + Neo.rand(0.7, -0.7, 'fx'),
        spin: Neo.rand(13, -13, 'fx') * motionScale,
        drag: heavy ? Neo.rand(5.2, 3.4, 'fx') : 0,
      });
    }

    // Heavy impacts also leave a few slower embers after the white fragments
    // have escaped. Their different speed band gives the burst depth and hang.
    if (heavy && !reducedParticles) {
      const emberCount = explosive ? 12 : 7;
      for (let index = 0; index < emberCount; index += 1) {
        const angle = Neo.rand(Math.PI * 2, 0, 'fx');
        const speed = Neo.rand(175, 65, 'fx') * motionScale;
        const life = Neo.rand(0.78, 0.38, 'fx');
        Neo.spawnParticle({
          x,
          y,
          life,
          maxLife: life,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          c: color,
          square: true,
          size: Neo.rand(4.2, 2.2, 'fx'),
          rotation: angle,
          spin: Neo.rand(9, -9, 'fx') * motionScale,
          drag: 4.6,
        });
      }
    }
  }

  function recordProjectileTrail(projectile, x, y) {
    if (!projectile) return;
    if (!Array.isArray(projectile.trail)) projectile.trail = [];
    const cap = projectile.kind === 'fireball' ? Neo.PROJECTILE_TRAIL_LENGTH + 2 : Neo.PROJECTILE_TRAIL_LENGTH;
    // Recycle the oldest point once the short trail is full. Rock volleys can
    // otherwise allocate hundreds of tiny objects every frame and periodically
    // stall on garbage collection even though each trail keeps only six points.
    const point = projectile.trail.length >= cap ? projectile.trail.pop() : { x: 0, y: 0 };
    point.x = x;
    point.y = y;
    projectile.trail.unshift(point);
  }

  function spawnProjectileImpact(projectile, x = projectile?.x, y = projectile?.y, options = {}) {


    if (!projectile || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const color = projectile.color || (projectile.enemy ? '#ff6688' : '#ffd7aa');
    const angle = Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1));
    const heavy = projectile.kind === 'fireball' || projectile.kind === 'magenta_degale' || projectile.kind === 'god_sword';
    Neo.spawnParticle({
      x,
      y,
      life: (heavy ? 0.34 : 0.22) ,
      maxLife: (heavy ? 0.34 : 0.22) ,
      impact: true,
      c: color,
      angle,
      size: Math.max(projectile.r || 4, heavy ? 9 : 5),
      enemy: !!projectile.enemy,
      kind: projectile.kind || 'shot',
      blocked: !!options.blocked,
      speed: (projectile.speed || 0) ,
    });
    const sparks = heavy ? 8 : 4;
    for (let index = 0; index < sparks; index += 1) {
      const spread = Neo.rand(1.2, -1.2, 'fx');
      const sparkAngle = angle + Math.PI + spread;
      const speed = Neo.rand(120, 35, 'fx');
      Neo.spawnParticle({
        x,
        y,
        life: Neo.rand(0.28, 0.1, 'fx'),
        vx: Math.cos(sparkAngle) * speed,
        vy: Math.sin(sparkAngle) * speed,
        c: color,
        spark: true,
        size: heavy ? 3 : 2,
      });
    }
  }

  function findNearestEnemy(x, y, radius, exclude = new Set()) {
    const searchRadius = Math.max(0, Number(radius || 0));
    let best = null;
    let bestDistSq = searchRadius * searchRadius;
    forEachEnemyNearCircle(x, y, searchRadius, enemy => {
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        best = enemy;
        bestDistSq = dSq;
      }
    }, { exclude });
    return best;
  }

  const _PROJECTILE_POOL_SIZE = 256;
  const _projectilePool = [];
  for (let _pji = 0; _pji < _PROJECTILE_POOL_SIZE; _pji += 1) {
    _projectilePool.push({
      x: 0, y: 0, vx: 0, vy: 0,
      r: 0, life: 0, damage: 0,
      kind: null, color: null, enemy: false,
      knockback: 0, pierceCount: 0,
      hitOptions: null, trail: null,
      splash: 0, splashDamage: 0, blockedSplashDamage: 0, fireStacks: 0, fireDuration: 0,
      homing: false, homingTarget: null, homingSpeed: 0, homingAccel: 0, homingTurnRate: 0, homingRadius: 0,
      homingPath: null, homingPathTimer: 0,
      homingTargetRef: null, homingTargetTimer: 0,
      fromRival: false, source: null, sourceLabel: null, statusEffects: null,
    });
  }

  function _acquireProjectile() {
    return _projectilePool.length > 0 ? _projectilePool.pop() : {
      x: 0, y: 0, vx: 0, vy: 0,
      r: 0, life: 0, damage: 0,
      kind: null, color: null, enemy: false,
      knockback: 0, pierceCount: 0,
      hitOptions: null, trail: null,
      splash: 0, splashDamage: 0, blockedSplashDamage: 0, fireStacks: 0, fireDuration: 0,
      homing: false, homingTarget: null, homingSpeed: 0, homingAccel: 0, homingTurnRate: 0, homingRadius: 0,
      homingPath: null, homingPathTimer: 0,
      homingTargetRef: null, homingTargetTimer: 0,
      fromRival: false, source: null, sourceLabel: null, statusEffects: null, bouncesRemaining: 0,
    };
  }

  function getProjectileDamageSource(projectile) {
    if (projectile?.source) return projectile.source;
    const kindSource = {
      sniper_round: 'sniper_projectile',
      machine_round: 'machine_gunner_projectile',
      cult_missile: 'queen_cult_projectile',
      sword: 'god_projectile',
      god_sword: 'god_projectile',
      mirror_shot: 'mirror_knight_projectile',
      power_disk: 'laser_projectile',
    };
    return kindSource[projectile?.kind] || 'enemy_projectile';
  }

  function getProjectileSpeedMultiplier(props, enemyProjectile, itemStats) {
    const difficultyKey = Neo.selectedDifficulty;
    const legacyDifficultyMultiplier = difficultyKey === 'easy' ? 0.8 : difficultyKey === 'hard' ? 1.2 : 1;
    const itemMultiplier = Math.max(0.1, Number(itemStats.projectileSpeedMultiplier || 1));
    if (!enemyProjectile) return itemMultiplier * legacyDifficultyMultiplier;

    const bossProjectile = props.bossProjectile === true || Neo.isBossType?.(props.owner?.type);
    if (!bossProjectile) return legacyDifficultyMultiplier;

    const difficulty = Neo.getDifficultyDef?.() || {};
    const difficultyMultiplier = Math.max(
      0.1,
      Number(difficulty.bossProjectileSpeedMultiplier ?? difficulty.speedMultiplier ?? 1),
    );
    const gameMinutes = Math.max(0, Number(Neo.gameElapsedTime || 0) / 60);
    const timeRate = Math.max(0, Number(Neo.ENEMY_SCALING?.speedMinute ?? 0.018));
    return difficultyMultiplier * (1 + gameMinutes * timeRate);
  }

  function spawnProjectile(props) {
    const p = _acquireProjectile();
    const enemyProjectile = !!(props.enemy ?? false);
    const itemStats = enemyProjectile ? {} : (Neo.getItemStats?.() || {});
    const projectileSpeedMultiplier = getProjectileSpeedMultiplier(props, enemyProjectile, itemStats);
    const legacyDifficultyMultiplier = Neo.selectedDifficulty === 'easy' ? 0.8 : Neo.selectedDifficulty === 'hard' ? 1.2 : 1;
    const projectileHomingStrength = Math.max(0, Number(itemStats.projectileHomingStrength || 0)) * legacyDifficultyMultiplier;
    const homingScalar = 1 + projectileHomingStrength;
    const hasExplicitHoming = Object.prototype.hasOwnProperty.call(props, 'homing');
    const hasExplicitHomingTarget = Object.prototype.hasOwnProperty.call(props, 'homingTarget');
    const hasExplicitHomingSpeed = Object.prototype.hasOwnProperty.call(props, 'homingSpeed');
    const hasExplicitHomingAccel = Object.prototype.hasOwnProperty.call(props, 'homingAccel');
    const hasExplicitHomingTurnRate = Object.prototype.hasOwnProperty.call(props, 'homingTurnRate');
    const hasExplicitHomingRadius = Object.prototype.hasOwnProperty.call(props, 'homingRadius');
    p.x = props.x;
    p.y = props.y;
    p.vx = Number(props.vx || 0) * projectileSpeedMultiplier;
    p.vy = Number(props.vy || 0) * projectileSpeedMultiplier;
    p.r = props.r ?? 5;
    p.life = props.life ?? 1.2;
    if (!enemyProjectile) p.life *= Math.max(0.1, Number(itemStats.projectileLifeMultiplier || 1));
    p.maxLife = p.life;
    p.damage = props.damage ?? 0;
    p.kind = props.kind ?? null;
    // Pendant of Rock: rock-kind player projectiles deal +2% damage per stack.
    if (!enemyProjectile && p.kind === 'rock' && itemStats.rockDamageMultiplier > 1) {
      p.damage *= itemStats.rockDamageMultiplier;
    }
    p.color = props.color ?? null;
    p.enemy = enemyProjectile;
    p.animSeed = Number.isFinite(props.animSeed) ? Number(props.animSeed) : Math.random() * Math.PI * 2;
    p.knockback = props.knockback ?? 0;
    p.pierceCount = Math.max(0, Math.floor(Number(props.pierceCount ?? 0) + (!enemyProjectile ? Number(itemStats.projectilePierceBonus || 0) : 0)));
    p.hitOptions = props.hitOptions ?? null;
    p.trail = props.trail ?? [];
    p.splash = props.splash ?? 0;
    p.splashDamage = props.splashDamage ?? 0;
    p.blockedSplashDamage = props.blockedSplashDamage ?? 0;
    p.fireStacks = props.fireStacks ?? 0;
    p.fireDuration = props.fireDuration ?? 0;
    const baseProjectileSpeed = Math.hypot(p.vx, p.vy) || 180;
    const grantedHoming = !enemyProjectile && projectileHomingStrength > 0 && !hasExplicitHoming;
    p.homing = hasExplicitHoming ? !!props.homing : grantedHoming;
    p.homingTarget = hasExplicitHomingTarget ? props.homingTarget : (p.homing && !enemyProjectile ? 'enemy' : null);
    if (p.homing) {
      p.homingSpeed = hasExplicitHomingSpeed
        ? Number(props.homingSpeed ?? 0) * projectileSpeedMultiplier * homingScalar
        : baseProjectileSpeed;
      p.homingAccel = hasExplicitHomingAccel
        ? Number(props.homingAccel ?? 0) * homingScalar
        : (grantedHoming ? 1.2 + projectileHomingStrength * 6 : 0);
      p.homingTurnRate = hasExplicitHomingTurnRate
        ? Number(props.homingTurnRate ?? 0) * homingScalar
        : (grantedHoming ? 0.75 + projectileHomingStrength * 3.5 : 0);
      p.homingRadius = hasExplicitHomingRadius
        ? Number(props.homingRadius ?? 0) * homingScalar
        : (grantedHoming ? 220 + projectileHomingStrength * 1400 : 0);
    } else {
      p.homingSpeed = 0;
      p.homingAccel = 0;
      p.homingTurnRate = 0;
      p.homingRadius = 0;
    }
    p.homingPath = null;
    p.homingPathTimer = 0;
    p.homingTargetRef = null;
    p.homingTargetTimer = 0;
    p.fromRival = props.fromRival ?? false;
    p.source = props.source ?? null;
    p.sourceLabel = props.sourceLabel ?? null;
    p.subSpawn = props.subSpawn ? { ...props.subSpawn } : null;
    p.statusEffects = props.statusEffects ?? null;
    p.enemyBlast = props.enemyBlast ?? null;
    // Love Bomb Laser (and any future arrival-detonate AOE bomb): flies through
    // enemies untouched instead of hitting on first contact, then bursts for
    // aoeRadius/damage and rolls sparkleChance per enemy caught in the blast
    // (see detonateLoveBomb).
    p.noDirectHit = !!props.noDirectHit;
    p.aoeRadius = props.aoeRadius ?? 0;
    p.sparkleChance = props.sparkleChance ?? 0;
    // Drain: enemy projectiles can heal their owner for `drainHeal` HP on hit.
    p.owner = props.owner ?? null;
    p.drainHeal = Number(props.drainHeal || 0);
    // Ricocete: 1 guaranteed bounce if you own any stack, then each stack rolls a
    // 50% chance to grant one additional bounce (rolled per-projectile via the
    // shared helper so the value genuinely varies shot to shot).
    const defaultBounces = !enemyProjectile ? Neo.rollRicoceteBounces(itemStats.projectileBounces) : 0;
    p.bouncesRemaining = Math.max(0, Math.floor(Number((props.bouncesRemaining ?? defaultBounces) || 0)));
    capProjectiles();
    Neo.projectiles.push(p);
  }

  // Hard ceiling on simultaneous projectiles. Long-life shots plus dense enemy
  // fire can grow the array unbounded, and every projectile runs the per-frame
  // blocker sweep — cost is super-linear in count. When over cap, drop the oldest
  // enemy projectile first (gameplay-safe), falling back to the oldest overall,
  // and return it to the pool.
  const MAX_PROJECTILES = 320;
  function removeProjectileAt(index, recycle = true) {
    return Neo.unorderedRemoveAt(Neo.projectiles, index, recycle ? _projectilePool : null);
  }

  function capProjectiles() {
    if (Neo.projectiles.length < MAX_PROJECTILES) return;
    let dropIndex = Neo.projectiles.findIndex(proj => proj && proj.enemy);
    if (dropIndex < 0) dropIndex = 0;
    removeProjectileAt(dropIndex);
  }

  function tryBounceProjectile(projectile, prevX, prevY) {
    const hitX = Neo.isBlocked(projectile.x, prevY, projectile.r);
    const hitY = Neo.isBlocked(prevX, projectile.y, projectile.r);
    const impactX = projectile.x;
    const impactY = projectile.y;
    const bounced = globalThis.NeoNyke.simulation.bounceCampaignProjectile(
      projectile,
      { hitX: hitX && !hitY, hitY: hitY && !hitX },
      { x: prevX, y: prevY },
    );
    if (!bounced) return false;
    spawnProjectileImpact(projectile, impactX, impactY, { blocked: true });
    return true;
  }

  // Static (per-frame) blocker rects: walls + closed doors + structures. These do
  // not change between projectile updates within a frame, so build the list once
  // per frame instead of re-concatenating + re-pushing for every projectile.
  let _staticBlockerRects = [];
  let _staticBlockerRectsFrame = -1;
  // Reused output scratch array so per-projectile queries don't allocate.
  const _blockerRectScratch = [];

  function getStaticBlockerRects() {
    if (_staticBlockerRectsFrame === Neo.simulationTick) return _staticBlockerRects;
    const rects = Neo.walls.slice();
    if (typeof Neo.getClosedDoorBlockerRects === 'function') {
      const doors = Neo.getClosedDoorBlockerRects();
      for (let i = 0; i < doors.length; i += 1) rects.push(doors[i]);
    }
    Neo.structures.forEach(structure => {
      if (!structure || !Number.isFinite(structure.x) || !Number.isFinite(structure.y)) return;
      if (!Number.isFinite(structure.w) || !Number.isFinite(structure.h) || structure.w <= 0 || structure.h <= 0) return;
      rects.push(Neo.getStructureCollisionRect(structure));
    });
    _staticBlockerRects = rects;
    _staticBlockerRectsFrame = Neo.simulationTick;
    return _staticBlockerRects;
  }

  function getProjectileBlockerRects(projectile) {
    const staticRects = getStaticBlockerRects();
    // Non-enemy projectiles only ever hit the static set — return it directly,
    // no per-call allocation.
    if (!projectile || !projectile.enemy) return staticRects;
    // Enemy projectiles also collide with destructibles; assemble into a reused
    // scratch array (cleared each call) to avoid allocating a fresh array.
    const rects = _blockerRectScratch;
    rects.length = 0;
    for (let i = 0; i < staticRects.length; i += 1) rects.push(staticRects[i]);
    Neo.destructibles.forEach(prop => {
      if (!prop || prop.broken || prop.hidden) return;
      rects.push(Neo.getDestructibleRect(prop));
    });
    return rects;
  }

  function findProjectileSweepBlockHit(projectile, prevX, prevY) {
    const dx = projectile.x - prevX;
    const dy = projectile.y - prevY;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) return null;
    const dirX = dx / distance;
    const dirY = dy / distance;
    const radius = Math.max(0, Number(projectile.r || 0));
    let closest = null;
    getProjectileBlockerRects(projectile).forEach(rect => {
      const expanded = {
        x: rect.x - radius,
        y: rect.y - radius,
        w: rect.w + radius * 2,
        h: rect.h + radius * 2,
      };
      const hit = Neo.rayRectHit(prevX, prevY, dirX, dirY, expanded, distance);
      if (!hit) return;
      if (!closest || hit.distance < closest.distance) closest = hit;
    });
    return closest;
  }

  function tryBounceProjectileAtSweepHit(projectile, sweepHit) {
    const bounced = globalThis.NeoNyke.simulation.bounceCampaignProjectile(projectile, sweepHit);
    if (!bounced) return false;
    spawnProjectileImpact(projectile, sweepHit.x, sweepHit.y, { blocked: true });
    return true;
  }

  function applyProjectileStatusEffectsToPlayer(projectile, target = Neo.player) {
    if (!target) return;
    if (!Array.isArray(projectile?.statusEffects)) return;
    const sourceKey = getProjectileDamageSource(projectile);
    // Carry the firing enemy so dark_drain can siphon HP back to it over the DoT.
    const source = (projectile?.owner && !projectile.owner.dead) || projectile?.sourceLabel
      ? {
          sourceKey,
          sourceLabel: projectile.sourceLabel || Neo.getDamageSourceLabel(sourceKey),
          owner: projectile?.owner && !projectile.owner.dead ? projectile.owner : null,
        }
      : sourceKey;
    projectile.statusEffects.forEach(effect => {
      if (!effect?.key) return;
      const rawChance = Neo.getPlayerNegativeStatusProcChance?.(effect.chance ?? 1)
        ?? Number(effect.chance ?? 1);
      const rolled = Neo.applyProcRollback?.(rawChance, 1) || { procChance: rawChance, effectMultiplier: 1 };
      const procChance = Neo.clamp(Number(rolled.procChance || 0), 0, 0.999);
      const effectMultiplier = Math.max(1, Number(rolled.effectMultiplier || 1));
      if (Neo.nextRandom('encounter') <= procChance) {
        Neo.applyStatus(target, effect.key, Number(effect.stacks || 1), Number(effect.duration || 3) * effectMultiplier, source);
        const state = Neo.getStatusState?.(target, effect.key);
        if (state && effectMultiplier > 1) state.damageMultiplier = Math.max(Number(state.damageMultiplier || 1), effectMultiplier);
      }
    });
  }

  // Drain: heal the projectile's owner when it lands on the player (mirrors the
  // player's Tooth of Thorn lifesteal). The owner must still be alive in the room.
  function applyProjectileDrainToOwner(projectile) {
    const heal = Number(projectile?.drainHeal || 0);
    const owner = projectile?.owner;
    if (heal <= 0 || !owner || owner.dead) return;
    const maxHp = Number(owner.max || owner.maxHp || owner.hp || 0);
    if (maxHp <= 0 || owner.hp >= maxHp) return;
    const before = Number(owner.hp || 0);
    owner.hp = Math.min(maxHp, before + heal);
    const gained = Math.round(owner.hp - before);
    if (gained > 0) {
      Neo.spawnHealPopup?.(owner.x + Neo.rand(-6, 6), owner.y - owner.r - 10, gained, { color: '#c98dff', size: 12 });
      Neo.ringBurst(owner.x, owner.y, owner.r + 8, '#c98dff', 0.4);
    }
  }

  function projectileHasLineOfSight(projectile, targetX, targetY) {
    if (!projectile || !Number.isFinite(targetX) || !Number.isFinite(targetY)) return false;
    const dx = targetX - projectile.x;
    const dy = targetY - projectile.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) return true;
    const dirX = dx / distance;
    const dirY = dy / distance;
    const radius = Math.max(0, Number(projectile.r || 0));
    return !getProjectileBlockerRects(projectile).some(rect => {
      const expanded = {
        x: rect.x - radius,
        y: rect.y - radius,
        w: rect.w + radius * 2,
        h: rect.h + radius * 2,
      };
      return !!Neo.rayRectHit(projectile.x, projectile.y, dirX, dirY, expanded, distance);
    });
  }

  // Reused A* scratch buffers for homing pathfinding. Allocated lazily and grown
  // only when a larger room grid appears, so the common case (many homing shots
  // re-pathing every 0.16s) does no per-call typed-array allocation. The needed
  // prefix is reset each call below. `dirs` is constant.
  let _homingScratch = null;
  const _homingDirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.35], [1, -1, 1.35], [-1, 1, 1.35], [-1, -1, 1.35],
  ];
  function getHomingScratch(nodeCount) {
    if (!_homingScratch || _homingScratch.capacity < nodeCount) {
      _homingScratch = {
        capacity: nodeCount,
        blocked: new Uint8Array(nodeCount),
        gScore: new Float32Array(nodeCount),
        fScore: new Float32Array(nodeCount),
        cameFrom: new Int16Array(nodeCount),
        open: new Uint8Array(nodeCount),
        closed: new Uint8Array(nodeCount),
      };
    }
    return _homingScratch;
  }

  function buildProjectileHomingPath(projectile, targetX, targetY) {
    const cell = 44;
    const cols = Math.ceil(Neo.ROOM_W / cell);
    const rows = Math.ceil(Neo.ROOM_H / cell);
    const radius = Math.max(4, Number(projectile?.r || 4) + 4);
    const toCell = (x, y) => ({
      x: Neo.clamp(Math.floor(x / cell), 0, cols - 1),
      y: Neo.clamp(Math.floor(y / cell), 0, rows - 1),
    });
    const toWorld = (x, y) => ({
      x: Neo.clamp(x * cell + cell / 2, Neo.WALL + radius, Neo.ROOM_W - Neo.WALL - radius),
      y: Neo.clamp(y * cell + cell / 2, Neo.WALL + radius, Neo.ROOM_H - Neo.WALL - radius),
    });
    const start = toCell(projectile.x, projectile.y);
    const goal = toCell(targetX, targetY);
    const nodeCount = cols * rows;
    const scratch = getHomingScratch(nodeCount);
    const blocked = scratch.blocked;
    blocked.fill(0, 0, nodeCount);
    const idx = (x, y) => y * cols + x;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const p = toWorld(x, y);
        if (Neo.isBlocked(p.x, p.y, radius)) blocked[idx(x, y)] = 1;
      }
    }
    blocked[idx(start.x, start.y)] = 0;
    blocked[idx(goal.x, goal.y)] = 0;

    const gScore = scratch.gScore;
    const fScore = scratch.fScore;
    const cameFrom = scratch.cameFrom;
    const open = scratch.open;
    const closed = scratch.closed;
    gScore.fill(Infinity, 0, nodeCount);
    fScore.fill(Infinity, 0, nodeCount);
    cameFrom.fill(-1, 0, nodeCount);
    open.fill(0, 0, nodeCount);
    closed.fill(0, 0, nodeCount);
    const startIdx = idx(start.x, start.y);
    const goalIdx = idx(goal.x, goal.y);
    const heuristic = (x, y) => Math.abs(goal.x - x) + Math.abs(goal.y - y);
    gScore[startIdx] = 0;
    fScore[startIdx] = heuristic(start.x, start.y);
    open[startIdx] = 1;

    const dirs = _homingDirs;
    const maxIterations = Math.min(nodeCount, 420);
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let current = -1;
      let bestF = Infinity;
      for (let i = 0; i < nodeCount; i += 1) {
        if (open[i] && fScore[i] < bestF) {
          bestF = fScore[i];
          current = i;
        }
      }
      if (current < 0) break;
      if (current === goalIdx) {
        const path = [];
        let cursor = current;
        while (cursor >= 0 && cursor !== startIdx) {
          const cx = cursor % cols;
          const cy = Math.floor(cursor / cols);
          path.unshift(toWorld(cx, cy));
          cursor = cameFrom[cursor];
        }
        path.push({ x: targetX, y: targetY });
        return path;
      }
      open[current] = 0;
      closed[current] = 1;
      const cx = current % cols;
      const cy = Math.floor(current / cols);
      dirs.forEach(([dx, dy, cost]) => {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
        const ni = idx(nx, ny);
        if (closed[ni] || blocked[ni]) return;
        if (dx !== 0 && dy !== 0 && (blocked[idx(cx + dx, cy)] || blocked[idx(cx, cy + dy)])) return;
        const tentative = gScore[current] + cost;
        if (tentative >= gScore[ni]) return;
        cameFrom[ni] = current;
        gScore[ni] = tentative;
        fScore[ni] = tentative + heuristic(nx, ny) * 1.15;
        open[ni] = 1;
      });
    }
    return null;
  }

  function getPathTravelCost(path, startX, startY, endX, endY) {
    if (!Array.isArray(path) || path.length === 0) return Infinity;
    let cost = 0;
    let px = startX;
    let py = startY;
    path.forEach(point => {
      cost += Math.hypot(point.x - px, point.y - py);
      px = point.x;
      py = point.y;
    });
    cost += Math.hypot(endX - px, endY - py);
    return cost;
  }

  function isValidHomingEnemyTarget(enemy) {
    return !!enemy && !enemy.dead && !enemy.hidden && Number(enemy.hp ?? 1) > 0;
  }

  function findProjectileHomingEnemyTarget(projectile, radius) {
    const searchRadius = Math.max(0, Number(radius || 0));
    let best = null;
    let bestScore = Infinity;
    let bestPath = null;
    forEachEnemyNearCircle(projectile.x, projectile.y, searchRadius, enemy => {
      if (!isValidHomingEnemyTarget(enemy)) return;
      const dx = enemy.x - projectile.x;
      const dy = enemy.y - projectile.y;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);
      let score;
      let path = null;
      if (projectileHasLineOfSight(projectile, enemy.x, enemy.y)) {
        score = distSq;
      } else {
        path = buildProjectileHomingPath(projectile, enemy.x, enemy.y);
        if (!path || path.length === 0) return;
        const pathCost = getPathTravelCost(path, projectile.x, projectile.y, enemy.x, enemy.y);
        score = pathCost * pathCost + 180000;
      }
      if (score < bestScore) {
        best = enemy;
        bestScore = score;
        bestPath = path;
      }
    });
    if (best && bestPath) {
      projectile.homingPath = bestPath;
      projectile.homingPathTimer = 0.16;
    }
    return best;
  }

  function getProjectileHomingTarget(projectile, dt) {
    if (!projectile?.homing) return null;
    if (projectile.enemy) return getNearestLivingPlayerSlot(projectile.x, projectile.y)?.entity || Neo.player || null;
    // A returning boomerang (Sarge's Hammer phase 2) homes back to the player.
    if (projectile.boomerang && projectile.boomerangPhase === 'back') return Neo.player || null;
    if (projectile.homingTarget !== 'enemy') return null;
    projectile.homingTargetTimer = Math.max(0, Number(projectile.homingTargetTimer || 0) - dt);
    if (isValidHomingEnemyTarget(projectile.homingTargetRef) && projectile.homingTargetTimer > 0) {
      const dx = projectile.homingTargetRef.x - projectile.x;
      const dy = projectile.homingTargetRef.y - projectile.y;
      if (dx * dx + dy * dy <= Number(projectile.homingRadius || 960) ** 2) return projectile.homingTargetRef;
    }
    projectile.homingTargetRef = findProjectileHomingEnemyTarget(projectile, Number(projectile.homingRadius || 960));
    projectile.homingTargetTimer = 0.18;
    return projectile.homingTargetRef;
  }

  function getProjectileHomingAimPoint(projectile, target, dt) {
    if (!projectile || !target) return null;
    if (projectileHasLineOfSight(projectile, target.x, target.y)) {
      projectile.homingPath = null;
      projectile.homingPathTimer = 0;
      return target;
    }
    projectile.homingPathTimer = Math.max(0, Number(projectile.homingPathTimer || 0) - dt);
    if (!Array.isArray(projectile.homingPath) || projectile.homingPath.length === 0 || projectile.homingPathTimer <= 0) {
      projectile.homingPath = buildProjectileHomingPath(projectile, target.x, target.y);
      projectile.homingPathTimer = 0.16;
    }
    if (!Array.isArray(projectile.homingPath) || projectile.homingPath.length === 0) return target;
    while (projectile.homingPath.length > 1 && Neo.dist(projectile.x, projectile.y, projectile.homingPath[0].x, projectile.homingPath[0].y) < 22) {
      projectile.homingPath.shift();
    }
    return projectile.homingPath[0] || target;
  }

  // Sheds faster sub-projectiles from a parent projectile on a fixed interval.
  // Shards fire perpendicular to the parent's travel direction (both sides),
  // giving disks a spreading, chaotic spray as they fly.
  function emitProjectileSubSpawn(projectile, dt) {
    const cfg = projectile.subSpawn;
    cfg.timer -= dt;
    if (cfg.timer > 0) return;
    cfg.timer += cfg.interval || 0.2;
    const descriptors = globalThis.NeoNyke.simulation.createCampaignSubSpawnDescriptors(
      projectile,
      cfg,
      () => Neo.nextRandom('encounter'),
    );
    descriptors.forEach(descriptor => {
      spawnProjectile({
        x: projectile.x,
        y: projectile.y,
        vx: Math.cos(descriptor.angle) * descriptor.speed,
        vy: Math.sin(descriptor.angle) * descriptor.speed,
        r: descriptor.radius,
        life: descriptor.lifeSeconds,
        enemy: projectile.enemy,
        fromRival: projectile.fromRival,
        source: projectile.source,
        sourceLabel: projectile.sourceLabel,
        kind: descriptor.kind,
        color: descriptor.color,
        damage: descriptor.damage,
        hitOptions: descriptor.hitOptions,
        statusEffects: descriptor.statusEffects,
      });
    });
  }

  // Flip a Sarge's Hammer boomerang from its outward seek into the return-to-player
  // homing phase. Re-aims toward the player and refreshes life so it can make it back.
  function startBoomerangReturn(projectile) {
    if (!projectile) return;
    projectile.boomerangPhase = 'back';
    projectile.homing = true;
    projectile.homingTarget = 'player';
    projectile.life = 4;
    if (Neo.player) {
      const angle = Math.atan2(Neo.player.y - projectile.y, Neo.player.x - projectile.x);
      const speed = Math.hypot(Number(projectile.vx || 0), Number(projectile.vy || 0)) || 700;
      projectile.vx = Math.cos(angle) * speed;
      projectile.vy = Math.sin(angle) * speed;
    }
    spawnProjectileImpact(projectile, projectile.x, projectile.y);
  }

  // Sarge's Hammer "bigger payoff": when the returning hammer reaches the player it
  // heals a chunk and yanks nearby pickups (coins/items/potions) into the player.
  function resolveBoomerangCatch(projectile) {
    if (!projectile || projectile.boomerangCaught) return;
    projectile.boomerangCaught = true;
    if (!Neo.player) return;
    const healAmount = Math.max(2, Math.round(Neo.player.maxHp * 0.04));
    const heal = Neo.applyPlayerHealing?.(
      Neo.scalePlayerHealing ? Neo.scalePlayerHealing(healAmount, 1) : healAmount,
      { showBarrier: false }
    ) ?? 0;
    if (heal > 0) Neo.spawnHealPopup?.(Neo.player.x + Neo.rand(-6, 6), Neo.player.y - 24, heal, { color: '#9bb8ff', size: 13 });
    // Pull every pickup in range straight to the player.
    const pullRadius = 280;
    const pullSq = pullRadius * pullRadius;
    if (Array.isArray(Neo.pickups)) {
      Neo.pickups.forEach(pickup => {
        if (!pickup || typeof pickup.x !== 'number') return;
        const dx = Neo.player.x - pickup.x;
        const dy = Neo.player.y - pickup.y;
        if (dx * dx + dy * dy > pullSq) return;
        pickup.vx = (pickup.vx || 0) + dx * 4;
        pickup.vy = (pickup.vy || 0) + dy * 4;
        pickup.magnetized = true;
      });
    }
    Neo.ringBurst?.(Neo.player.x, Neo.player.y, 52, '#9bb8ff', 0.5);
    Neo.playSfx?.('item_collect');
  }

  function updateProjectiles(dt) {
    rebuildEnemySpatialIndex();
    ensureDestructibleSpatialIndex();
    for (let index = Neo.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = Neo.projectiles[index];
      if (!projectile) { removeProjectileAt(index, false); continue; }
      projectile.life -= dt;
      if (projectile.homing) {
        const target = getProjectileHomingTarget(projectile, dt);
        let aimPoint = null;
        if (target) {
          aimPoint = getProjectileHomingAimPoint(projectile, target, dt) || target;
        }
        globalThis.NeoNyke.simulation.steerCampaignHomingProjectile(projectile, aimPoint, dt);
      }
      const previous = globalThis.NeoNyke.simulation.advanceCampaignProjectile(projectile, dt);
      const prevX = previous.x;
      const prevY = previous.y;
      recordProjectileTrail(projectile, prevX, prevY);
      if (projectile.subSpawn && projectile.life > 0) emitProjectileSubSpawn(projectile, dt);
      let hitProp = null;
      forEachDestructibleNearCircle(projectile.x, projectile.y, projectile.r + 80, prop => {
        if (hitProp) return;
        if (Neo.destructibleIntersectsCircle(prop, projectile.x, projectile.y, projectile.r)) hitProp = prop;
      });
      if (!projectile.enemy && hitProp) {
        damageDestructible(hitProp, projectile.damage || 1, {
          impactX: projectile.x,
          impactY: projectile.y,
          angle: Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1)),
          impactType: projectile.kind || 'projectile',
          force: projectile.kind === 'fireball' ? 1.35 : 1,
        });
        if (projectile.kind === 'fireball') blastRadius(projectile.x, projectile.y, projectile.splash || 44, projectile.blockedSplashDamage || 16, '#ff8844');
        if (projectile.kind === 'love_bomb') detonateLoveBomb(projectile, projectile.x, projectile.y);
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        removeProjectileAt(index);
        continue;
      }
      if (projectile.life <= 0) {
        // A boomerang that times out mid-flight turns around to find the player
        // instead of vanishing; if it times out on the way back, it still pays out.
        if (projectile.boomerang && projectile.boomerangPhase === 'out') {
          startBoomerangReturn(projectile);
          continue;
        }
        if (projectile.boomerang && projectile.boomerangPhase === 'back') {
          resolveBoomerangCatch(projectile);
        }
        detonateEnemyProjectileBlast(projectile, projectile.x, projectile.y);
        if (projectile.kind === 'love_bomb') detonateLoveBomb(projectile, projectile.x, projectile.y);
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        removeProjectileAt(index);
        continue;
      }
      const sweepBlockHit = findProjectileSweepBlockHit(projectile, prevX, prevY);
      if (sweepBlockHit) {
        if (tryBounceProjectileAtSweepHit(projectile, sweepBlockHit)) continue;
        detonateEnemyProjectileBlast(projectile, sweepBlockHit.x, sweepBlockHit.y);
        if (projectile.kind === 'love_bomb') detonateLoveBomb(projectile, sweepBlockHit.x, sweepBlockHit.y);
        spawnProjectileImpact(projectile, sweepBlockHit.x, sweepBlockHit.y, { blocked: true });
        removeProjectileAt(index);
        continue;
      }
      if (Neo.isBlocked(projectile.x, projectile.y, projectile.r)) {
        if (tryBounceProjectile(projectile, prevX, prevY)) continue;
        detonateEnemyProjectileBlast(projectile, projectile.x, projectile.y);
        if (projectile.kind === 'love_bomb') detonateLoveBomb(projectile, projectile.x, projectile.y);
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        removeProjectileAt(index);
        continue;
      }
      if (!projectile.enemy) {
        if (hitPvpPlayer2InRadius(projectile.x, projectile.y, projectile.r, projectile.damage || 16, projectile.knockback || 90, 'pvp_p1_projectile')) {
          if (projectile.kind === 'fireball') {
            blastRadius(projectile.x, projectile.y, projectile.splash || 44, projectile.splashDamage || 14, '#ff8844');
          }
          spawnProjectileImpact(projectile, projectile.x, projectile.y);
          removeProjectileAt(index);
          continue;
        }
        let target = null;
        forEachEnemyNearCircle(projectile.x, projectile.y, projectile.r + 80, enemy => {
          if (target) return;
          // A boomerang shouldn't re-hit a foe it already struck on this trip.
          if (projectile.boomerangHitSet && projectile.boomerangHitSet.has(enemy)) return;
          const hitRadius = projectile.r + enemy.r;
          const dx = projectile.x - enemy.x;
          const dy = projectile.y - enemy.y;
          if (dx * dx + dy * dy <= hitRadius * hitRadius) target = enemy;
        });
        if (target && projectile.kind === 'love_bomb') {
          // Love Bomb Laser detonates immediately on first enemy contact rather
          // than piercing through to its arrival point — the AOE + sparkle burst
          // (detonateLoveBomb) already covers the target, so it doesn't also
          // need a direct hitEnemy call here.
          detonateLoveBomb(projectile, projectile.x, projectile.y);
          spawnProjectileImpact(projectile, projectile.x, projectile.y);
          removeProjectileAt(index);
          continue;
        }
        if (target) {
          const hitAngle = Math.atan2(projectile.vy, projectile.vx);
          const hitOptions = { ...(projectile.hitOptions || {}) };
          if (Neo.player?.character === 'mooggy' && Neo.getStatusStacks?.(target, 'bleed') > 0) {
            hitOptions.critBonus = Number(hitOptions.critBonus || 0) + 0.18;
          }
          Neo.hitEnemy(
            target,
            projectile.damage || 16,
            hitAngle,
            projectile.knockback || 90,
            projectile.color || (projectile.kind === 'fireball' ? '#ff8844' : '#a857ff'),
            hitOptions
          );
          if (Neo.player?.character === 'princess' && projectile.pierceCount > 0) {
            Neo.applyPlayerHealing?.(1.2, { showBarrier: false });
          }
          if (projectile.kind === 'fireball') {
            Neo.applyFire(target, projectile.fireStacks || 2, projectile.fireDuration || 3);
            blastRadius(projectile.x, projectile.y, projectile.splash || 44, projectile.splashDamage || 14, '#ff8844');
            Neo.applyStatusInRadius(projectile.x, projectile.y, projectile.splash || 44, 'fire', 1, projectile.fireDuration || 3, null);
          }
          spawnProjectileImpact(projectile, projectile.x, projectile.y);
          if (projectile.boomerang) {
            // Track the foe so it isn't struck twice, then either keep piercing on
            // the way out or flip to the return-to-player phase.
            if (!projectile.boomerangHitSet) projectile.boomerangHitSet = new Set();
            projectile.boomerangHitSet.add(target);
            if (projectile.boomerangPhase === 'out' && projectile.pierceCount > 0) {
              projectile.pierceCount -= 1;
              projectile.x += projectile.vx * 0.03;
              projectile.y += projectile.vy * 0.03;
            } else if (projectile.boomerangPhase === 'out') {
              startBoomerangReturn(projectile);
            } else {
              projectile.x += projectile.vx * 0.03;
              projectile.y += projectile.vy * 0.03;
            }
          } else if (projectile.pierceCount > 0) {
            projectile.pierceCount -= 1;
            projectile.x += projectile.vx * 0.03;
            projectile.y += projectile.vy * 0.03;
          } else {
            removeProjectileAt(index);
          }
          continue;
        }
        // No enemy hit this frame: a returning boomerang despawns (with payoff)
        // once it reaches the player.
        if (projectile.boomerang && projectile.boomerangPhase === 'back' && Neo.player) {
          const catchR = projectile.r + Neo.player.r + 6;
          const ddx = projectile.x - Neo.player.x;
          const ddy = projectile.y - Neo.player.y;
          if (ddx * ddx + ddy * ddy <= catchR * catchR) {
            resolveBoomerangCatch(projectile);
            spawnProjectileImpact(projectile, projectile.x, projectile.y);
            removeProjectileAt(index);
            continue;
          }
        }
      } else {
        const hitSlot = getLocalCoopSlots({ livingOnly: true }).find(slot => {
          const actor = slot.getEntity();
          const hitRadius = projectile.r + actor.r;
          const dx = projectile.x - actor.x;
          const dy = projectile.y - actor.y;
          return dx * dx + dy * dy <= hitRadius * hitRadius;
        });
        if (!hitSlot) continue;
        const hitPlayer = hitSlot.getEntity();
        if (projectile.kind === 'love_bomb') {
          detonateLoveBomb(projectile, projectile.x, projectile.y);
          spawnProjectileImpact(projectile, projectile.x, projectile.y);
          removeProjectileAt(index);
          continue;
        }
        const projectileSource = getProjectileDamageSource(projectile);
        damagePlayerSlot(hitSlot, projectile.damage || 10, Math.atan2(projectile.vy, projectile.vx), projectile.knockback || 120, projectileSource, {
          sourceKey: projectileSource,
          sourceLabel: projectile.sourceLabel || '',
          attacker: projectile.owner,
        });
        applyProjectileStatusEffectsToPlayer(projectile, hitPlayer);
        applyProjectileDrainToOwner(projectile);
        detonateEnemyProjectileBlast(projectile, projectile.x, projectile.y);
        spawnProjectileImpact(projectile, projectile.x, projectile.y);
        removeProjectileAt(index);
        continue;
      }
    }
  }

  // A flying rock (Sarge debris, rival barriers, collapse rocks, thrown rocks)
  // counts as something heavy enough to set off a floor trap. Used by
  // explosive_trap and dungeon thorn_mine arming so traps don't ignore rocks
  // skipping across the trigger radius.
  function rockProjectileInRadius(x, y, radius) {
    const projectiles = Neo.projectiles;
    if (!Array.isArray(projectiles)) return false;
    for (let i = 0; i < projectiles.length; i += 1) {
      const p = projectiles[i];
      if (!p || p.kind !== 'rock') continue;
      if (Neo.dist(p.x, p.y, x, y) <= radius + (p.r || 0)) return true;
    }
    return false;
  }

  function updateWorldProps(dt) {
    ensureEnemySpatialIndex();
    if (Array.isArray(Neo.destructibles)) {
      Neo.destructibles.forEach(prop => {
        if (!prop) return;
        if (prop.hitFlash > 0) prop.hitFlash = Math.max(0, Number(prop.hitFlash || 0) - dt);
        if (prop.hitShake > 0) prop.hitShake = Math.max(0, Number(prop.hitShake || 0) - dt);
        // Temporary barriers (Wall of Toph) crumble on their own when ttl runs out.
        if (prop.ttl !== undefined && !prop.broken) {
          prop.ttl -= dt;
          if (prop.ttl <= 0) {
            prop.broken = true;
            prop.breakAge = 0;
            prop.breakAngle = getDestructibleImpactAngle(prop, {});
            spawnDestructibleBreakFx(prop, {});
          }
        }
        if (prop.broken) prop.breakAge = Number(prop.breakAge || 0) + dt;
        // Disguised secret walls look like ordinary wall and let the player walk
        // into them; stepping onto the spot opens the passage and breaks the wall.
        const coopPlayerTouchesProp = prop.kind === 'secret_wall' && prop.disguised && !prop.secretRevealed && !prop.broken
          && getLocalCoopSlots({ livingOnly: true }).some(slot => {
            const actor = slot.getEntity();
            return Neo.destructibleIntersectsCircle(prop, actor.x, actor.y, actor.r);
          });
        if (coopPlayerTouchesProp) {
          revealSecretWall(prop);
          prop.broken = true;
          prop.breakAge = 0;
          prop.breakAngle = getDestructibleImpactAngle(prop, {});
          spawnDestructibleBreakFx(prop, {});
        }
      });
    }
    Neo.hazards.forEach(hazard => {
      if (hazard.ttl !== undefined) hazard.ttl -= dt;
      if (hazard.followPlayer) {
        hazard.x = Neo.player.x;
        hazard.y = Neo.player.y;
      }
      if (hazard.followEnemy && hazard.ownerEnemy && !hazard.ownerEnemy.dead) {
        hazard.x = hazard.ownerEnemy.x;
        hazard.y = hazard.ownerEnemy.y;
      }
      hazard.statusTick = Number(hazard.statusTick ?? 0) - dt;
      if (hazard.kind === 'thorn_mine') {
        // owner distinguishes the player's "sweepy mine" tool (owner 'player' →
        // anti-enemy only) from dungeon-authored mines (owner 'dungeon' → also
        // arm against and damage the player). Default to 'player' so the legacy
        // tool-spawned mines keep their old behavior.
        const dungeonOwned = hazard.owner === 'dungeon';
        const triggerR = hazard.triggerRadius || 34;
        hazard.armTime = Math.max(0, Number(hazard.armTime || 0) - dt);
        if (hazard.armTime <= 0 && !hazard.triggered) {
          let target = null;
          forEachEnemyNearCircle(hazard.x, hazard.y, triggerR + 80, enemy => {
            if (target) return;
            if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) <= triggerR + enemy.r) target = enemy;
          });
          const playerTrips = dungeonOwned && getLocalCoopSlots({ livingOnly: true }).some(slot => {
            const actor = slot.getEntity();
            return Neo.dist(actor.x, actor.y, hazard.x, hazard.y) <= triggerR + actor.r;
          });
          // A rock skipping over the mine sets it off just like an enemy would.
          const rockTrips = dungeonOwned && rockProjectileInRadius(hazard.x, hazard.y, triggerR);
          if (target || playerTrips || rockTrips) {
            hazard.triggered = true;
            const blast = Number(hazard.blastRadius || 62);
            const damage = dungeonOwned
              ? getBombHazardDamage(hazard.baseDamage ?? hazard.damage ?? 18)
              : Number(hazard.damage || 18);
            forEachEnemyNearCircle(hazard.x, hazard.y, blast + 80, enemy => {
              if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) > blast + enemy.r) return;
              const angle = Neo.angleBetween(hazard, enemy);
              Neo.hitEnemy(enemy, damage, angle, 170, '#ff6e8b', {
                bleedChance: 1,
                bleedStacks: hazard.bleedStacks || 1,
                bleedDuration: hazard.bleedDuration || 4.5,
              });
            });
            if (dungeonOwned) getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
              const actor = slot.getEntity();
              if (Neo.dist(actor.x, actor.y, hazard.x, hazard.y) > blast + actor.r) return;
              damagePlayerSlot(slot, damage, Neo.angleBetween(hazard, actor), 170, hazard.source || 'thorn_mine');
              Neo.applyStatus?.(actor, 'bleed', hazard.bleedStacks || 1, hazard.bleedDuration || 4.5, hazard.source || 'thorn_mine');
            });
            Neo.ringBurst(hazard.x, hazard.y, blast, '#ff6e8b', 0.35);
            hazard.ttl = 0;
          }
        }
      }
      if (hazard.kind === 'bomb_aoe') {
        // Telegraphed fallout from a botched defusal: a growing ring warns the
        // player, then it detonates for full damage if they haven't fled.
        hazard.fuse = Number(hazard.fuse || 0) - dt;
        const charge = Neo.clamp(1 - hazard.fuse / (hazard.fuseDuration || 3), 0, 1);
        hazard.sparkTick = Number(hazard.sparkTick || 0) - dt;
        if (hazard.sparkTick <= 0) {
          Neo.ringBurst(hazard.x, hazard.y, (hazard.blastRadius || 150) * charge, '#ff7a66', 0.2);
          hazard.sparkTick = 0.12;
        }
        if (hazard.fuse <= 0) {
          const damage = getBombHazardDamage(hazard.baseDamage ?? hazard.damage ?? 250);
          getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
            const actor = slot.getEntity();
            if (Neo.dist(actor.x, actor.y, hazard.x, hazard.y) <= (hazard.blastRadius || 150) + actor.r) {
              damagePlayerSlot(slot, damage, Neo.angleBetween(hazard, actor), 240, hazard.source || 'bomb_aoe');
            }
          });
          blastRadius(hazard.x, hazard.y, hazard.blastRadius || 150, damage, '#ff7a66');
          Neo.playSfx?.('bomb_explosion');
          hazard.ttl = 0;
        }
      }
      if (hazard.kind === 'lava') getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
        const actor = slot.getEntity();
        if (Number(actor.lavaWalkTime || 0) > 0) return;
        const inside = hazard.shape === 'rect'
          ? Neo.circleRect(actor.x, actor.y, actor.r - 6, hazard.left, hazard.top, hazard.w, hazard.h)
          : Neo.dist(actor.x, actor.y, hazard.x, hazard.y) < hazard.r + actor.r - 10;
        if (!inside) return;
        damagePlayerSlot(slot, 6 * dt, 0, 0, 'lava', { ignoreInv: true, noInvFrames: true });
        if (hazard.statusTick <= 0) Neo.applyFire(actor, Math.max(1, Number(hazard.statusStacks || 1)), 2.6, hazard.source || 'lava');
      });
      if (hazard.kind === 'explosive_trap') {
        if (!hazard.triggered) {
          const playerNear = getLocalCoopSlots({ livingOnly: true }).some(slot => {
            const actor = slot.getEntity();
            return Neo.dist(actor.x, actor.y, hazard.x, hazard.y) <= hazard.triggerRadius + actor.r;
          });
          let enemyNear = false;
          forEachEnemyNearCircle(hazard.x, hazard.y, hazard.triggerRadius + 80, enemy => {
            if (enemyNear) return;
            enemyNear = Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) <= hazard.triggerRadius + enemy.r;
          });
          // A rock rolling over the plate sets it off too.
          const rockNear = rockProjectileInRadius(hazard.x, hazard.y, hazard.triggerRadius);
          if (playerNear || enemyNear || rockNear) {
            hazard.triggered = true;
            hazard.fuse = hazard.fuseDuration || 0.75;
            hazard.sparkTick = 0;
            Neo.playSfx?.('bomb_explosion');
            Neo.spawnParticle({ x: hazard.x, y: hazard.y - 20, life: 0.5, text: 'CLICK', c: '#ffcc66', size: 12 });
          }
        } else {
          hazard.fuse -= dt;
          hazard.sparkTick = Number(hazard.sparkTick || 0) - dt;
          if (hazard.sparkTick <= 0) {
            Neo.spawnParticle({
              x: hazard.x + Neo.rand(7, -7),
              y: hazard.y - 8 + Neo.rand(4, -4),
              life: 0.22,
              vx: Neo.rand(34, -34),
              vy: Neo.rand(-44, -22),
              c: '#ffb347',
              spark: true,
              size: 2.4,
            });
            hazard.sparkTick = 0.07;
          }
          if (hazard.fuse <= 0) {
            const damage = getBombHazardDamage(hazard.baseDamage ?? hazard.damage ?? 18);
            getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
              const actor = slot.getEntity();
              if (Neo.dist(actor.x, actor.y, hazard.x, hazard.y) <= hazard.blastRadius + actor.r) {
                damagePlayerSlot(slot, damage, Neo.angleBetween(hazard, actor), 220, 'explosive_trap');
              }
            });
            blastRadius(hazard.x, hazard.y, hazard.blastRadius || 88, damage, '#ff9a4d');
            hazard.ttl = 0;
          }
        }
      }
      if (hazard.kind === 'lava') {
        const applyLavaToEnemy = enemy => {
          const inside = hazard.shape === 'rect'
            ? Neo.circleRect(enemy.x, enemy.y, enemy.r - 4, hazard.left, hazard.top, hazard.w, hazard.h)
            : Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) <= hazard.r + enemy.r - 6;
          if (!inside) return;
          // Floor Is Lava trail puddles carry a dps field and burn enemies for
          // direct damage; authored lava rooms leave dps unset (fire only).
          if (hazard.dps) Neo.hitEnemy(enemy, hazard.dps * dt, 0, 0, '#ff7a32');
          if (hazard.statusTick <= 0) Neo.applyFire(enemy, 1, 2.8, hazard.source);
        };
        if (hazard.shape === 'rect') {
          forEachEnemyNearRect(hazard.left, hazard.top, hazard.w, hazard.h, applyLavaToEnemy, { padding: 80 });
        } else {
          forEachEnemyNearCircle(hazard.x, hazard.y, hazard.r + 80, applyLavaToEnemy);
        }
        if (hazard.statusTick <= 0) hazard.statusTick = 0.45;
      }
      if (hazard.kind === 'red_spikes') {
        hazard.armTime = Math.max(0, Number(hazard.armTime || 0) - dt);
        if (hazard.armTime <= 0 && !hazard.hit) {
          hazard.hit = true;
          Neo.ringBurst(hazard.x, hazard.y, hazard.r + 10, '#ff3348', 0.28);
          if (hazard.enemy) {
            getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
              const actor = slot.getEntity();
              if (Neo.dist(actor.x, actor.y, hazard.x, hazard.y) <= hazard.r + actor.r) {
              const angle = Neo.angleBetween(hazard, actor);
              damagePlayerSlot(slot, hazard.damage || 18, angle, 130, hazard.source || 'red_spikes');
              const statusKey = String(hazard.statusKey || 'bleed');
              const stacks = Math.max(1, Number(hazard.statusStacks || 1));
              const duration = Math.max(0.2, Number(hazard.statusDuration || (statusKey === 'fire' ? 2.8 : 3.4)));
              if (statusKey === 'fire') Neo.applyFire?.(actor, stacks, duration, hazard.source || 'red_spikes');
              else Neo.applyStatus?.(actor, statusKey, stacks, duration, hazard.source || 'red_spikes');
              }
            });
          } else {
            forEachEnemyNearCircle(hazard.x, hazard.y, hazard.r + 80, enemy => {
              if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) return;
              const angle = Neo.angleBetween(hazard, enemy);
              Neo.hitEnemy(enemy, hazard.damage || 18, angle, 130, '#ff3348');
            });
          }
        }
      }
      if (hazard.kind === 'healing_zone') {
        hazard.plusTick = (hazard.plusTick ?? 0.08) - dt;
        if (hazard.plusTick <= 0) {
          const angle = Neo.rng() * Math.PI * 2;
          const radius = Neo.rand(hazard.r * 0.82, 8);
          const px = hazard.x + Math.cos(angle) * radius;
          const py = hazard.y + Math.sin(angle) * radius;
          Neo.spawnParticle({
            x: px,
            y: py,
            life: 0.45,
            text: '+',
            c: '#47ff7d',
            size: 14,
            outline: 'rgba(5,35,10,0.7)',
            vx: Neo.rand(-10, 10),
            vy: Neo.rand(-42, -24),
          });
          hazard.plusTick = Neo.rand(0.16, 0.07);
        }
        const rivalOwner = hazard.enemy ? hazard.ownerEnemy : null;
        if (rivalOwner && !rivalOwner.dead && Neo.dist(rivalOwner.x, rivalOwner.y, hazard.x, hazard.y) < hazard.r) {
          const healMult = Number(hazard.healMult || 1);
          rivalOwner.hp = Math.min(rivalOwner.max, rivalOwner.hp + 7.36 * healMult * dt);
          if (rivalOwner.rivalData) {
            rivalOwner.rivalData.hp = rivalOwner.hp;
            rivalOwner.rivalData.hpSnapshot = rivalOwner.hp;
          }
        } else if (!hazard.enemy) {
          const healTarget = getNearestLivingPlayerSlot(hazard.x, hazard.y)?.entity;
          if (healTarget && Neo.dist(healTarget.x, healTarget.y, hazard.x, hazard.y) < hazard.r) {
          const healMult = Number(hazard.healMult || 1);
          const healAmount = Neo.scalePlayerHealing(7.36 * healMult * dt);
          const before = Number(healTarget.hp || 0);
          const healed = healTarget === Neo.player
            ? Neo.applyPlayerHealing?.(healAmount, { showBarrier: false }) ?? 0
            : ((healTarget.hp = Math.min(healTarget.maxHp, before + healAmount)) - before);
          if (healed > 0) {
            hazard.healAccum = (hazard.healAccum || 0) + healed;
            hazard.healTick = (hazard.healTick ?? 0.24) - dt;
            if (hazard.healTick <= 0) {
              spawnHealPopup(healTarget.x + Neo.rand(-10, 10), healTarget.y - 22, hazard.healAccum);
              hazard.healAccum = 0;
              hazard.healTick = 0.24;
            }
          }
          }
        }
        const zoneDamageMult = Number(hazard.damageMult || 1);
        if (hazard.enemy) {
          hazard.playerDamageTick = Math.max(0, Number(hazard.playerDamageTick || 0) - dt);
          if (hazard.playerDamageTick <= 0) {
            const victims = getLocalCoopSlots({ livingOnly: true }).filter(slot => {
              const actor = slot.getEntity();
              return Neo.dist(actor.x, actor.y, hazard.x, hazard.y) < hazard.r + actor.r;
            });
            if (victims.length) hazard.playerDamageTick = 0.2;
            victims.forEach(slot => damagePlayerSlot(slot, Math.max(1, Math.round(2 * zoneDamageMult)), 0, 35, hazard.source || 'rival_healing_zone'));
          }
        } else {
          forEachEnemyNearCircle(hazard.x, hazard.y, hazard.r + 80, enemy => {
            if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) < hazard.r + enemy.r) {
              enemy.hp -= (10 * zoneDamageMult * dt) / Math.max(1, Number(enemy.defenseMultiplier || 1));
              if (enemy.hp <= 0) Neo.onEnemyDie(enemy);
            }
          });
        }
      } else if (hazard.kind === 'fire_circle') {
        if (canHitPvpPlayer2() && Neo.dist(Neo.player2.x, Neo.player2.y, hazard.x, hazard.y) <= hazard.r + Neo.player2.r) {
          damagePvpPlayer2(Math.max(4, (hazard.dps || 16) * 0.35), hazard.x, hazard.y, 80, 'pvp_p1_fire_circle');
        }
        forEachEnemyNearCircle(hazard.x, hazard.y, hazard.r + 80, enemy => {
          if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) return;
          enemy.hp -= ((hazard.dps || 16) * dt) / Math.max(1, Number(enemy.defenseMultiplier || 1));
          if (hazard.statusTick <= 0) Neo.applyFire(enemy, 1, 2.8);
          enemy.stun = Math.max(enemy.stun, 0.05);
          if (Neo.nextRandom('fx') < 0.06) Neo.spawnParticle({ x: enemy.x + Neo.rand(-6, 6), y: enemy.y + Neo.rand(-6, 6), life: 0.3, c: '#ff8c3b' });
          if (enemy.hp <= 0) Neo.onEnemyDie(enemy);
        });
        if (hazard.statusTick <= 0) hazard.statusTick = 0.45;
      } else if (hazard.kind === 'el_barto_graffiti') {
        hazard.tick = Math.max(0, Number(hazard.tick || 0) - dt);
        if (hazard.tick <= 0) {
          hazard.tick = Number(hazard.interval || 0.65);
          forEachEnemyNearCircle(hazard.x, hazard.y, hazard.r + 80, enemy => {
            if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) return;
            const angle = Neo.angleBetween(hazard, enemy);
            Neo.hitEnemy(enemy, hazard.damage || 18, angle, 55, '#ff5b78', { rawDamage: true });
            Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 10, life: 0.3, text: 'TAGGED', c: '#ffe0b8', size: 9 });
          });
        }
      } else if (hazard.kind === 'grave_zone') {
        forEachEnemyNearCircle(hazard.x, hazard.y, hazard.r + 80, enemy => {
          const dx = enemy.x - hazard.x;
          const dy = enemy.y - hazard.y;
          const dist = Math.hypot(dx, dy);
          if (dist > hazard.r + enemy.r || dist <= 0.001) return;
          enemy.graveZoneVulnerableUntil = Math.max(Number(enemy.graveZoneVulnerableUntil || 0), Number(Neo.gameElapsedTime || 0) + 0.2);
          enemy.graveZoneDamageTakenMultiplier = Math.max(
            Number(enemy.graveZoneDamageTakenMultiplier || 1),
            Number(hazard.damageTakenMultiplier || 1),
          );
          const push = Number(hazard.pushPower || 280) * Math.max(0.12, 1 - dist / (hazard.r + enemy.r));
          enemy.vx += (dx / dist) * push * dt;
          enemy.vy += (dy / dist) * push * dt;
          enemy.stun = Math.max(Number(enemy.stun || 0), 0.05);
          if (Neo.nextRandom('fx') < 0.15) {
            Neo.spawnParticle({ x: enemy.x + Neo.rand(-6, 6), y: enemy.y + Neo.rand(-6, 6), life: 0.24, c: '#c9b3ff' });
          }
        });
      } else if (hazard.kind === 'chaos_burst') {
        // Lingering chaos field: keeps erupting random AOE blasts around its
        // centre. Follows the player so the storm travels with them.
        if (hazard.followPlayer) {
          hazard.x = Neo.player.x;
          hazard.y = Neo.player.y;
        }
        hazard.tick -= dt;
        if (hazard.tick <= 0) {
          hazard.tick = hazard.interval || 0.22;
          const blasts = 1 + (Neo.nextRandom('fx') < 0.25 ? 1 : 0);
          for (let b = 0; b < blasts; b += 1) {
            if (hazard.enemy) {
              const blastAngle = Neo.nextRandom('fx') * Math.PI * 2;
              const px = hazard.x + Math.cos(blastAngle) * (30 + Neo.nextRandom('fx') * 150);
              const py = hazard.y + Math.sin(blastAngle) * (30 + Neo.nextRandom('fx') * 150);
              Neo.ringBurst(px, py, 18, '#a857ff', 0.45);
              getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
                const actor = slot.getEntity();
                if (Neo.dist(px, py, actor.x, actor.y) > 52 + actor.r) return;
                const angle = Math.atan2(actor.y - py, actor.x - px);
                damagePlayerSlot(slot, hazard.damage || 18, angle, 120, hazard.source || 'rival_chaos_burst');
                Neo.applyStatus?.(actor, 'poison', 1, 4.8, hazard.source || 'rival_chaos_burst');
              });
            } else {
              Neo.spawnChaosBlast(hazard.x, hazard.y, hazard.aoeRadiusMultiplier || 1, hazard.aoeDamageMultiplier || 1, !!hazard.isMetao);
            }
          }
        }
      } else if (hazard.kind === 'lightning_column') {
        hazard.warn = Math.max(0, Number(hazard.warn || 0) - dt);
        if (hazard.warn <= 0) {
          hazard.tick -= dt;
          if (hazard.tick <= 0) {
            hazard.tick = hazard.interval || 0.45;
            if (hazard.enemy) {
              getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
                const actor = slot.getEntity();
                if (Neo.dist(actor.x, actor.y, hazard.x, hazard.y) <= hazard.r + actor.r) {
                const angle = Neo.angleBetween(hazard, actor);
                if (hazard.source === 'storm' && Number(actor.inv || 0) <= 0 && !actor.blockActive) {
                  Neo.playSfx?.('lightning_charge');
                }
                damagePlayerSlot(slot, hazard.damage || 16, angle, 90, hazard.source || 'lightning_column');
                }
              });
            } else {
              forEachEnemyNearCircle(hazard.x, hazard.y, hazard.r + 80, enemy => {
                if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) return;
                const angle = Neo.angleBetween(hazard, enemy);
                Neo.hitEnemy(enemy, hazard.damage || 16, angle, 90, '#8dd4ff', { lightning: true });
              });
            }
            Neo.spawnParticle({
              life: 0.25,
              bolt: {
                x1: hazard.x,
                y1: hazard.y - hazard.r,
                x2: hazard.x,
                y2: hazard.y + hazard.r,
                c: '#9fd3ff',
                w: 4.4,
                jag: 10,
                seg: 6,
                phase: Neo.rng() * Math.PI * 2,
              },
            });
          }
        }
      } else if (hazard.kind === 'lightning_strike_line') {
        // "Justice of Sonichu" (enemy) / Lightning Cross (Sarge's alt laser):
        // a laser-like lightning bolt spanning the whole room. First telegraphs
        // along its line for `warn` seconds (faint, no damage), then strikes —
        // dealing damage to anyone within `r` of the segment for a brief active
        // window. `hazard.enemy` picks who it can hurt: true damages the player,
        // false/unset (player-cast) damages enemies and heals the player on hit.
        hazard.warn = Math.max(0, Number(hazard.warn || 0) - dt);
        const striking = hazard.warn <= 0;
        if (!striking) {
          // Telegraph: pulsing faint bolt so the player can read the line.
          hazard.warnTick = Number(hazard.warnTick || 0) - dt;
          if (hazard.warnTick <= 0) {
            hazard.warnTick = 0.08;
            Neo.spawnParticle({
              x: hazard.x1, y: hazard.y1, life: 0.12, c: '#5a86c8',
              line: {
                x1: hazard.x1, y1: hazard.y1, x2: hazard.x2, y2: hazard.y2,
                w: 2, jag: 6, seg: 10, phase: Neo.rng() * Math.PI * 2,
              },
            });
          }
        } else {
          if (!hazard.struck) {
            hazard.struck = true;
            Neo.shake = Math.max(Neo.shake, 11);
            Neo.shakeT = Math.max(Neo.shakeT, 0.2);
          }
          hazard.tick = Number(hazard.tick || 0) - dt;
          if (hazard.tick <= 0) {
            hazard.tick = hazard.interval || 0.12;
            const reach = hazard.r || 26;
            if (hazard.enemy) {
              getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
                const actor = slot.getEntity();
                if (Neo.distToSegment(actor.x, actor.y, hazard.x1, hazard.y1, hazard.x2, hazard.y2) > reach + actor.r) return;
                const angle = Math.atan2(hazard.y2 - hazard.y1, hazard.x2 - hazard.x1) + Math.PI / 2;
                damagePlayerSlot(slot, hazard.damage || 18, angle, 120, hazard.source || 'justice_of_sonichu');
              });
            } else {
              forEachEnemyNearCircle(hazard.x1, hazard.y1, reach + Math.hypot(hazard.x2 - hazard.x1, hazard.y2 - hazard.y1) + 80, enemy => {
                if (Neo.distToSegment(enemy.x, enemy.y, hazard.x1, hazard.y1, hazard.x2, hazard.y2) > reach + enemy.r) return;
                const angle = Math.atan2(enemy.y - hazard.y1, enemy.x - hazard.x1);
                Neo.hitEnemy(enemy, hazard.damage || 18, angle, 120, '#bfe4ff', { lightning: true });
                if (hazard.healPct > 0) Neo.applyPlayerHealing?.(Neo.player.maxHp * hazard.healPct);
              });
            }
            Neo.spawnParticle({
              x: hazard.x1, y: hazard.y1, life: 0.16, c: '#bfe4ff',
              line: {
                x1: hazard.x1, y1: hazard.y1, x2: hazard.x2, y2: hazard.y2,
                w: 5, jag: 14, seg: 12, phase: Neo.rng() * Math.PI * 2,
              },
            });
          }
        }
      } else if (hazard.kind === 'holy_turret') {
        // Gelleh's Holy Turrets: periodically lock onto the nearest enemy in
        // range and drop a holy AOE burst on it.
        hazard.recoil = Math.max(0, Number(hazard.recoil || 0) - dt);
        const nearestPlayer = hazard.enemy ? getNearestLivingPlayerSlot(hazard.x, hazard.y) : null;
        let target = nearestPlayer && nearestPlayer.distance <= (hazard.range || 360) ? nearestPlayer.entity : null;
        let bestSq = (hazard.range || 360) ** 2;
        if (!hazard.enemy) {
          forEachEnemyNearCircle(hazard.x, hazard.y, hazard.range || 360, enemy => {
            if (!enemy || enemy.dead) return;
            const dSq = (enemy.x - hazard.x) ** 2 + (enemy.y - hazard.y) ** 2;
            if (dSq < bestSq) { bestSq = dSq; target = enemy; }
          });
        }
        if (target) {
          const desiredAngle = Neo.angleBetween(hazard, target);
          const currentAngle = Number(hazard.aimAngle || 0);
          const angleDelta = Math.atan2(
            Math.sin(desiredAngle - currentAngle),
            Math.cos(desiredAngle - currentAngle),
          );
          hazard.aimAngle = currentAngle + Neo.clamp(angleDelta, -dt * 9, dt * 9);
        }
        hazard.tick -= dt;
        if (hazard.tick <= 0) {
          hazard.tick = hazard.interval || 0.6;
          if (target) {
            const burstR = hazard.burstRadius || 56;
            const aimAngle = Number(hazard.aimAngle || 0);
            const muzzleX = hazard.x + Math.cos(aimAngle) * 31;
            const muzzleY = hazard.y + Math.sin(aimAngle) * 31;
            hazard.recoil = 0.14;
            Neo.spawnParticle({
              life: 0.2, c: '#fff1b0',
              line: { x1: muzzleX, y1: muzzleY, x2: target.x, y2: target.y, w: 3.2, jag: 5, seg: 5, phase: Neo.rng() * Math.PI * 2 },
            });
            Neo.ringBurst(muzzleX, muzzleY, 7, '#fff7c8', 0.16);
            Neo.ringBurst(target.x, target.y, burstR, '#ffe6a3', 0.4);
            if (hazard.enemy) {
              getLocalCoopSlots({ livingOnly: true }).forEach(slot => {
                const actor = slot.getEntity();
                if (Neo.dist(actor.x, actor.y, target.x, target.y) <= burstR + actor.r) {
                  damagePlayerSlot(slot, hazard.damage || 26, aimAngle, 120, hazard.source || 'rival_holy_turret');
                }
              });
            } else {
              Neo.blastRadius(target.x, target.y, burstR, hazard.damage || 26, '#ffe6a3');
            }
          }
        }
      }
    });
    // Drop expired hazards in place (write-index compaction) so the common case
    // of nothing expiring allocates no new array.
    {
      const hazards = Neo.hazards;
      let write = 0;
      for (let read = 0; read < hazards.length; read += 1) {
        const hazard = hazards[read];
        if (hazard.ttl === undefined || hazard.ttl > 0) {
          if (write !== read) hazards[write] = hazard;
          write += 1;
        }
      }
      hazards.length = write;
    }
    Neo.syncCurrentRoomState();
  }

  function isWallLikeDestructible(prop) {
    return prop?.kind === 'wall' || prop?.kind === 'cover_wall' || prop?.kind === 'secret_wall';
  }

  function getDestructibleImpactAngle(prop, hit = {}) {
    if (Number.isFinite(hit.angle)) return hit.angle;
    if (Number.isFinite(hit.sourceX) && Number.isFinite(hit.sourceY)) {
      return Math.atan2(prop.y - hit.sourceY, prop.x - hit.sourceX);
    }
    if (Number.isFinite(hit.impactX) && Number.isFinite(hit.impactY)) {
      return Math.atan2(prop.y - hit.impactY, prop.x - hit.impactX);
    }
    if (Neo.player && Number.isFinite(Neo.player.x) && Number.isFinite(Neo.player.y)) {
      return Neo.angleBetween(Neo.player, prop);
    }
    return Neo.rand(Math.PI * 2, 0, 'fx');
  }

  function getDestructibleMaterial(prop) {
    if (prop?.kind === 'pot') return { colors: ['#d19a68', '#9b6744', '#57331f'], size: 2.4, dust: '#caa17a' };
    if (prop?.kind === 'barrel') return { colors: ['#b0743d', '#7a4825', '#3d2414'], size: 2.8, dust: '#b87838' };
    if (prop?.kind === 'cover_wall' && !prop.reinforced) return { colors: ['#b87838', '#7a4825', '#4b2a18'], size: 2.8, dust: '#b87838' };
    if (prop?.reinforced) return { colors: ['#d5dbe2', '#aeb5bd', '#727b86'], size: 2.3, dust: '#aeb5bd' };
    return { colors: ['#d0c8ba', '#a09080', '#6f685d'], size: 3.1, dust: '#b8aea0' };
  }

  function getDestructibleImpactPoint(prop, angle, hit = {}) {
    if (Number.isFinite(hit.impactX) && Number.isFinite(hit.impactY)) return { x: hit.impactX, y: hit.impactY };
    const radius = Math.max(10, Number(prop.r || Math.hypot(prop.w || 0, prop.h || 0) / 2 || 20));
    return {
      x: prop.x - Math.cos(angle) * radius * 0.55,
      y: prop.y - Math.sin(angle) * radius * 0.55,
    };
  }

  function spawnDestructibleHitFx(prop, dealt, hit = {}) {
    const angle = getDestructibleImpactAngle(prop, hit);
    const impact = getDestructibleImpactPoint(prop, angle, hit);
    const material = getDestructibleMaterial(prop);
    const force = Math.max(0.7, Number(hit.force || 1));
    const chipCount = isWallLikeDestructible(prop) ? Math.min(7, 2 + Math.max(1, Math.round(dealt / 2))) : 2;
    prop.hitFlash = 0.12;
    prop.hitShake = Math.max(Number(prop.hitShake || 0), isWallLikeDestructible(prop) ? 0.13 : 0.08);
    prop.lastHitAngle = angle;
    prop.lastHitX = impact.x;
    prop.lastHitY = impact.y;
    Neo.spawnParticle({ x: impact.x, y: impact.y, life: 0.16, impact: true, angle, c: material.colors[0], size: material.size + 1 });
    for (let index = 0; index < chipCount; index += 1) {
      const spread = angle + Neo.rand(0.72, -0.72, 'fx');
      const speed = Neo.rand(95, 38, 'fx') * force;
      Neo.spawnParticle({
        x: impact.x + Neo.rand(5, -5, 'fx'),
        y: impact.y + Neo.rand(5, -5, 'fx'),
        life: Neo.rand(0.26, 0.12, 'fx'),
        vx: Math.cos(spread) * speed,
        vy: Math.sin(spread) * speed,
        c: material.colors[index % material.colors.length],
        spark: true,
        size: material.size * Neo.rand(1.05, 0.65, 'fx'),
      });
    }
  }

  function spawnDestructibleBreakFx(prop, hit = {}) {
    const angle = getDestructibleImpactAngle(prop, hit);
    const material = getDestructibleMaterial(prop);
    const force = Math.max(0.85, Number(hit.force || 1.1));
    const wallLike = isWallLikeDestructible(prop);
    const radius = Math.max(14, Number(prop.r || Math.hypot(prop.w || 0, prop.h || 0) / 2 || 24));
    const count = prop.kind === 'pot' ? 10 : prop.kind === 'barrel' ? 8 : prop.reinforced ? 22 : wallLike ? 18 : 12;
    if (wallLike) {
      Neo.ringBurst(prop.x, prop.y, Math.min(58, radius + 18), material.dust, 0.32);
    }
    for (let index = 0; index < count; index += 1) {
      const scatter = angle + Neo.rand(1.35, -1.35, 'fx');
      const speed = Neo.rand(wallLike ? 145 : 120, 35, 'fx') * force;
      const side = Neo.rand(radius * 0.5, -radius * 0.5, 'fx');
      Neo.spawnParticle({
        x: prop.x + Math.cos(angle + Math.PI / 2) * side + Neo.rand(7, -7, 'fx'),
        y: prop.y + Math.sin(angle + Math.PI / 2) * side + Neo.rand(7, -7, 'fx'),
        life: Neo.rand(wallLike ? 0.72 : 0.46, 0.22, 'fx'),
        vx: Math.cos(scatter) * speed,
        vy: Math.sin(scatter) * speed,
        c: material.colors[index % material.colors.length],
        spark: true,
        size: material.size * Neo.rand(wallLike ? 1.45 : 1.15, 0.75, 'fx'),
      });
    }
  }

  function spawnBarrelExplosionFx(prop, hit = {}) {
    const angle = getDestructibleImpactAngle(prop, hit);
    const radius = 130;
    prop.breakAngle = angle;
    prop.scorchRadius = radius * Neo.rand(0.28, 0.22, 'fx');
    prop.hitFlash = 0;
    prop.hitShake = 0;
    Neo.shake = Math.max(Number(Neo.shake || 0), 12);
    Neo.shakeT = Math.max(Number(Neo.shakeT || 0), 0.18);

    Neo.ringBurst(prop.x, prop.y, 22, '#fff2a8', 0.24);
    Neo.ringBurst(prop.x, prop.y, 58, '#ff9a3d', 0.34);
    Neo.ringBurst(prop.x, prop.y, radius * 0.72, '#ff4a28', 0.44);

    for (let index = 0; index < 18; index += 1) {
      const a = (index / 18) * Math.PI * 2 + Neo.rand(0.18, -0.18, 'fx');
      const speed = Neo.rand(230, 80, 'fx');
      Neo.spawnParticle({
        x: prop.x + Math.cos(a) * Neo.rand(16, 3, 'fx'),
        y: prop.y + Math.sin(a) * Neo.rand(16, 3, 'fx'),
        life: Neo.rand(0.42, 0.18, 'fx'),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        c: index % 4 === 0 ? '#fff2a8' : index % 3 === 0 ? '#ffcf66' : '#ff6a2a',
        spark: true,
        size: Neo.rand(4.2, 2.1, 'fx'),
      });
    }

    for (let index = 0; index < 14; index += 1) {
      const a = angle + Math.PI + Neo.rand(2.4, -2.4, 'fx');
      const speed = Neo.rand(150, 45, 'fx');
      Neo.spawnParticle({
        x: prop.x + Neo.rand(15, -15, 'fx'),
        y: prop.y + Neo.rand(13, -13, 'fx'),
        life: Neo.rand(0.78, 0.34, 'fx'),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        c: index % 3 === 0 ? '#2b241f' : index % 3 === 1 ? '#5b3a24' : '#8a542e',
        spark: true,
        size: Neo.rand(5.2, 2.4, 'fx'),
      });
    }

    for (let index = 0; index < 10; index += 1) {
      const a = Neo.rand(Math.PI * 2, 0, 'fx');
      const speed = Neo.rand(42, 12, 'fx');
      Neo.spawnParticle({
        x: prop.x + Neo.rand(18, -18, 'fx'),
        y: prop.y + Neo.rand(18, -18, 'fx'),
        life: Neo.rand(0.95, 0.42, 'fx'),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - Neo.rand(30, 8, 'fx'),
        c: index % 2 === 0 ? 'rgba(45, 38, 32, 0.9)' : 'rgba(92, 72, 52, 0.85)',
        smoke: true,
        size: Neo.rand(4.8, 2.6, 'fx'),
      });
    }
  }

  function damageDestructible(prop, damage, hit = {}) {
    if (prop.broken) return;
    const numericDamage = Math.max(0, Number(damage || 0));
    const dealt = Math.max(0, Math.round(numericDamage));
    const greenRandom = Neo.createEntityRandom(prop, 'green:drop');
    const potRandom = Neo.createEntityRandom(prop, 'pot:reward');
    const result = globalThis.NeoNyke.simulation.applyCampaignDestructibleDamage(prop, numericDamage, {
      floorNumber: Neo.floor,
      runLoopIndex: Neo.runLoopIndex,
      destructibles: Neo.destructibles,
      itemChance: Neo.getRandomItemDropChance(0.12, 0.5),
      greenRandom,
      potRandom,
      rollItem: random => Neo.rollItemDrop({ random }),
    });
    if (!result.ok) return;
    // Furniture durability is intentionally communicated by hit/break effects,
    // not combat damage numbers. Repeated "-1" popups over pots and chairs read
    // like the player was losing health.
    if (dealt > 0) spawnDestructibleHitFx(prop, dealt, hit);
    if (!result.broken) return;
    Neo.invalidateBeamReflectGeometry?.();
    prop.breakAge = 0;
    prop.breakAngle = getDestructibleImpactAngle(prop, hit);
    if (prop.kind === 'barrel') {
      spawnBarrelExplosionFx(prop, hit);
    } else {
      spawnDestructibleBreakFx(prop, hit);
      Neo.playSfx?.('break_furniture');
    }
    // Green (post-loop "lying") items: once the player has completed at least one
    // loop, every barrel/pot ("broken wood") break has a flat 10% chance to drop a
    // random green item. These never appear in shops or normal drops.
    result.drops.forEach(drop => {
      if (drop.type === 'coin') Neo.dropCoins(prop.x, prop.y, drop.amount);
      else Neo.pickups.push({ x: prop.x, y: prop.y, type: 'item', key: drop.key });
    });
    if (result.blast) {
      blastRadius(prop.x, prop.y, 130, 55, '#ff5a3d');
    }
    if (prop.kind === 'wall') {
      Neo.spawnParticle({ x: prop.x, y: prop.y - 22, life: 0.75, text: 'CLEAR', c: '#d7f6ff' });
    }
    if (result.secretDirection) {
      Neo.setSecretPassageOpen(Neo.currentRoom, result.secretDirection, true);
      Neo.playSfx?.('secret_reveal');
      Neo.spawnParticle({ x: prop.x, y: prop.y - 18, life: 0.9, text: 'SECRET', c: '#8dd4ff' });
      Neo.tutorialController?.signal?.('secret-revealed', { dir: result.secretDirection });
    }
  }

  // Open the passage a secret wall guards. Shared by the break path (crate-style
  // secret walls) and the walk-over path (disguised wall-look secret walls).
  function revealSecretWall(prop) {
    if (!prop || prop.secretRevealed) return;
    prop.secretRevealed = true;
    const dir = prop.secretDir;
    if (dir) Neo.setSecretPassageOpen(Neo.currentRoom, dir, true);
    Neo.playSfx?.('secret_reveal');
    Neo.spawnParticle({ x: prop.x, y: prop.y - 18, life: 0.9, text: 'SECRET', c: '#8dd4ff' });
    // Tutorial secret-room lesson: advances when the player reveals the wall.
    Neo.tutorialController?.signal?.('secret-revealed', { dir });
  }

  // Damage number whose size/color/punch ramp with how hard the hit landed,
  // measured against the target's max HP so a "big" hit reads big regardless of
  // absolute numbers. Crits get an extra scale-pop + higher arc. Rapid hits on
  // the same enemy COMBO-MERGE (accumulate into one rising number) instead of
  // spamming overlapping popups. Pass opts.enemy to enable ramp + merge.
  function spawnDamagePopup(x, y, amount, opts = {}) {
    const value = Math.max(0, Math.round(amount || 0));
    if (value <= 0) return;
    const crit = !!opts.crit;
    const enemy = opts.enemy || null;

    // Combo-merge: if this enemy has a live popup, fold the new hit into it.
    if (enemy && enemy._dmgPopup && enemy._dmgPopup._active && enemy._dmgPopup._particleList === Neo.particles && enemy._dmgPopup._dmgOwner === enemy && enemy._dmgPopup.life > 0 && enemy._dmgPopup.text) {
      const p = enemy._dmgPopup;
      p._dmgTotal = (p._dmgTotal || value) + value;
      p._dmgCrit = p._dmgCrit || crit;
      p.text = `-${p._dmgTotal}`;
      p.life = Math.max(p.life, p._dmgCrit ? 0.62 : 0.5);
      p.x = x;
      p.y = y;
      p.size = Math.min(34, (p.size || 16) + 1.5); // a flurry visibly grows
      if (p._dmgCrit) p.c = '#ff9f1c';
      return;
    }

    // Impact ratio 0..1 of this hit vs the target's max HP → drives the ramp.
    // Enemies store max HP in `.max`; players use `.maxHp`. Fall back to a
    // multiple of the hit so popups without a known max still get a sane ramp.
    const maxHp = enemy ? (enemy.max || enemy.maxHp || value * 6) : value * 6;
    const ratio = Neo.clamp(value / Math.max(1, maxHp), 0, 1);
    const baseSize = 13 + ratio * 13; // chip 13 → slam 26
    const size = opts.size || Math.round(crit ? baseSize * 1.35 + 4 : baseSize);
    const color = opts.color || (crit ? '#ff9f1c' : damageRampColor(ratio));
    Neo.spawnParticle({
      x,
      y,
      life: crit ? 0.66 : 0.46 + ratio * 0.12,
      text: `-${value}`,
      c: color,
      outline: opts.outline || (crit ? '#3a1500' : '#120a00'),
      size,
      vx: Neo.rand(-14, 14),
      vy: -36 - (crit ? 16 : ratio * 14), // crits/heavy hits arc higher
    });
    if (enemy) {
      const p = Neo.particles[Neo.particles.length - 1];
      if (p) {
        p._dmgTotal = value;
        p._dmgCrit = crit;
        p._dmgOwner = enemy;
        enemy._dmgPopup = p;
      }
    }
  }

  // Chip damage = muted grey-red; heavy = saturated red. Lerps between the two.
  function damageRampColor(ratio) {
    const t = Neo.clamp(ratio * 2.2, 0, 1); // most hits are a small fraction of max HP
    const r = Math.round(214 + (255 - 214) * t);
    const g = Math.round(140 + (74 - 140) * t);
    const b = Math.round(140 + (74 - 140) * t);
    return `rgb(${r},${g},${b})`;
  }

  function spawnHealPopup(x, y, amount, opts = {}) {
    const value = Math.max(0, Math.round((amount || 0) * (opts.scale || 1)));
    if (value <= 0) return;
    window.achievementEvents?.emit('heal:applied', { amount: Math.max(0, amount || 0) });
    Neo.spawnParticle({
      x,
      y,
      life: 0.5,
      text: `+${value}`,
      c: opts.color || '#47ff7d',
      outline: opts.outline || 'rgba(5,35,10,0.8)',
      size: opts.size || 15,
      vx: Neo.rand(-8, 8),
      vy: -44,
    });
  }

  function updateChests() {
    Neo.chests.forEach(chest => {
      if (chest.open) return;
      const nearest = getNearestLivingPlayerSlot(chest.x, chest.y);
      if (!nearest || nearest.distance >= 36) return;
      const chestRandom = Neo.createEntityRandom(chest, 'chest:open');
      const result = globalThis.NeoNyke.simulation.openCampaignChest(chest, {
        floorNumber: Neo.floor,
        random: chestRandom,
        groupId: `chest:${Neo.currentRoom?.gx ?? 0}:${Neo.currentRoom?.gy ?? 0}:${Math.round(chest.x)}:${Math.round(chest.y)}`,
      });
      if (!result.ok) return;
      Neo.tutorialController?.signal?.('chest-open', { chest, room: Neo.currentRoom });
      Neo.minimapLegendDirty = true;
      Neo.dropCoins(chest.x, chest.y, result.coinAmount);
      if (result.selection) {
          // A/B chest: spawn one stand-in "area" to the left and one to the
          // right of the chest. The player confirms a pick by dwelling inside an
          // area until its circular meter fills (see updatePickups / drawPickups).
          result.selection.optionIds.forEach((key, choiceIndex) => {
            Neo.pickups.push({
              x: chest.x + (choiceIndex === 0 ? -72 : 72),
              y: chest.y - 4,
              type: 'rewardChoice',
              key,
              groupId: result.selection.selectionEventId,
              picksRemaining: 1,
              dwellMode: true,
              dwell: 0,
              side: choiceIndex === 0 ? 'left' : 'right',
            });
          });
      }
      result.pickups.forEach(pickup => Neo.pickups.push({
        ...pickup,
        tutorialTreasureItem: pickup.type === 'item' && !!chest.tutorialTreasureChest,
      }));
      Neo.currentRoom.cleared = Neo.chests.every(item => item.open);
      if (result.revealExit && !Neo.pickups.some(pickup => pickup.type === 'ladder')) {
        Neo.pickups.push({ x: chest.x, y: chest.y + 76, type: 'ladder' });
        Neo.spawnParticle({ x: chest.x, y: chest.y + 42, life: 1.2, text: 'LADDER REVEALED', c: '#7dff9e' });
      }
      Neo.updateObjective();
      Neo.scheduleRunSave();
    });
  }

  function canSpawnJesterPortal() {
    if (Neo.floorSkipPending <= 0) return false;
    if (Neo.floor >= Neo.MAX_FLOOR) return false;
    if (!Neo.currentRoom) return false;
    if (Neo.pickups.some(pickup => pickup?.type === 'jesterPortal')) return false;
    return true;
  }

  function spawnJesterPortalPickup() {
    if (!canSpawnJesterPortal()) return false;
    const preferred = Neo.findSafePointNearTarget(Neo.player.x, Neo.player.y - 96, 24, 180, 20);
    const fallback = Neo.findSafePointNearTarget(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 24, 240, 20) || Neo.findSafeSpawnPoint();
    const spawnPoint = preferred || fallback;
    const runState = { floor: Neo.floor, floorSkipPending: Neo.floorSkipPending };
    const result = globalThis.NeoNyke.simulation.createCampaignJesterGate(runState, {
      floorNumber: Neo.floor,
      maxFloor: Neo.MAX_FLOOR,
      x: spawnPoint.x,
      y: spawnPoint.y,
      activateAt: Neo.JESTER_PORTAL_ACTIVATE_DELAY,
      hasExistingGate: Neo.pickups.some(pickup => pickup?.type === 'jesterPortal'),
    });
    if (!result.ok) return false;
    Neo.pickups.push(result.gate);
    Neo.floorSkipPending = runState.floorSkipPending;
    Neo.ringBurst(spawnPoint.x, spawnPoint.y, 28, '#ff8bd8', 0.5);
    Neo.spawnParticle({ x: spawnPoint.x, y: spawnPoint.y - 20, life: 0.8, text: 'CHAOS GATE', c: '#ffc2f0' });
    return true;
  }

  function useAdapterPortal(pickup) {
    const ladderRoom = Neo.rooms.find(room => room.gx === pickup?.targetGx && room.gy === pickup?.targetGy);
    // Target room may have been invalidated (e.g. floor regenerated); bail safely.
    if (!ladderRoom || ladderRoom === Neo.currentRoom) return false;

    // Coin cost is paid here, on walk-in — not when the portal was opened.
    const goldSpent = Math.floor(Neo.player.coins / 2);
    if (goldSpent > 0) {
      Neo.player.coins -= goldSpent;
      Neo.metaProgress.coins = Math.max(0, Neo.metaProgress.coins - goldSpent);
    }

    Neo.enterRoom(ladderRoom);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.9, text: 'WARPED TO LADDER (-50% COINS)', c: '#b66cff' });
    Neo.scheduleRunSave();
    return true;
  }

  function removePickupAt(index) {
    Neo.minimapLegendDirty = true;
    return Neo.unorderedRemoveAt(Neo.pickups, index);
  }

  function useJesterPortal(pickup) {
    const runState = { floor: Neo.floor };
    const result = globalThis.NeoNyke.simulation.useCampaignJesterGate(runState, pickup, { maxFloor: Neo.MAX_FLOOR });
    if (!result.ok) return false;
    Neo.floor = runState.floor;
    window.achievementEvents?.emit('floor:reached', { floor: Neo.floor });
    Neo.refreshFloorChargeStates();
    Neo.metaProgress.bestFloor = Math.max(Neo.metaProgress.bestFloor, Neo.floor);
    Neo.persistMetaSoon();
    Neo.showFloorTransition = true;
    Neo.floorTransitionTime = 0;
    Neo.generateFloor();
    Neo.scheduleRunSave();
    return true;
  }

  // Lowered from 1.8x: at 1.8x a fleeing rune always outran the player's plain
  // move speed, so every single catch (all 5, sequentially) required spending a
  // dash — the same resource needed to survive the concurrent enemy waves. At
  // 1.2x a determined chase (cutting an angle rather than tailing directly)
  // can close the gap on foot, saving dashes for combat.
  function getChallengeRuneMaxSpeed(playerMoveSpeed = 228) {
    return Math.max(0, Number(playerMoveSpeed) || 0) * 1.2;
  }

  // Fleeing runes should reward a close catch without requiring pixel-perfect
  // overlap. Ordinary pickups keep their 26-unit trigger; runes get a small
  // extra cushion to account for their movement between simulation frames.
  function getChallengeRuneTriggerRadius(baseRadius = 26) {
    const bufferRadius = 15;
    return Math.max(0, Number(baseRadius) || 0) + bufferRadius;
  }

  // True when the player is standing on/near a usable ladder. Mirrors the
  // proximity check drawLadderPrompt uses so the interact prompt and the actual
  // descend agree. The ladder is only usable once the room is cleared.
  function isAtLadder(actor = Neo.player) {
    if (Neo.gameState !== 'play' || !Neo.currentRoom?.cleared) return false;
    const ladder = Neo.pickups?.find(pickup => pickup?.type === 'ladder');
    if (!ladder) return false;
    return !!actor && Neo.dist(actor.x, actor.y, ladder.x, ladder.y) <= Neo.LADDER_TRIGGER_RADIUS;
  }

  // Descend to the next floor (or win in treasure-hunt at MAX_FLOOR). Routed
  // through the shared climb/interact path rather than self-triggering from the
  // pickup loop, so all input methods share one transition.
  function useLadder() {
    const runState = { floor: Neo.floor };
    const result = globalThis.NeoNyke.simulation.useCampaignLadder(runState, {
      gameMode: Neo.gameMode,
      maxFloor: Neo.MAX_FLOOR,
    });
    if (!result.ok) return;
    if (result.type === 'RUN_WON') {
      Neo.win();
      return;
    }
    // The new-floor stinger now plays from the floor:enter event (so it also
    // covers the run's first floor); generateFloor() below emits that event.
    Neo.tutorialController?.signal?.('ladder-use');
    Neo.floor = runState.floor;
    Neo.refreshFloorChargeStates();
    Neo.metaProgress.bestFloor = Math.max(Neo.metaProgress.bestFloor, Neo.floor);
    Neo.persistMetaSoon();
    Neo.showFloorTransition = true;
    Neo.floorTransitionTime = 0;
    Neo._carriedRivals = Neo.rivals.filter(r => !r.dead && r.hp > 0);
    Neo.generateFloor();
    Neo.scheduleRunSave();
  }

  function updatePickups(dt = 0.016) {
    const itemStats = Neo.getItemStats?.() || {};
    const autoVacuumRange = Math.max(0, Number(itemStats.pickupVacuumRange || 0));
    const coinPickupMultiplier = Math.max(1, Number(itemStats.coinPickupMultiplier || 1));
    const potionDoubleChance = Neo.clamp(Number(itemStats.potionDoubleChance || 0), 0, 1);
    let pickupPlayer = Neo.player;
    let playerX = Neo.player.x;
    let playerY = Neo.player.y;
    const healPickupPlayer = amount => {
      if (pickupPlayer === Neo.player) return Neo.applyPlayerHealing?.(amount) ?? 0;
      const before = Number(pickupPlayer.hp || 0);
      pickupPlayer.hp = Math.min(Number(pickupPlayer.maxHp || before), before + Math.max(0, Number(amount || 0)));
      return pickupPlayer.hp - before;
    };
    const pullPickupTowardPlayer = (pickup, magnetRadius, basePull, bonusPull) => {
      const dx = playerX - pickup.x;
      const dy = playerY - pickup.y;
      const distSq = dx * dx + dy * dy;
      const magnetSq = magnetRadius * magnetRadius;
      if (distSq >= magnetSq || distSq <= 0.000001) return;
      const distance = Math.sqrt(distSq);
      const pull = basePull + (1 - distance / magnetRadius) * bonusPull;
      pickup.x += (dx / distance) * 0.016 * pull;
      pickup.y += (dy / distance) * 0.016 * pull;
    };
    for (let index = Neo.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = Neo.pickups[index];
      if (!pickup || typeof pickup !== 'object' || typeof pickup.type !== 'string') {
        removePickupAt(index);
        continue;
      }
      const nearestPlayer = Neo.getNearestLivingPlayerSlot?.(pickup.x, pickup.y)?.entity;
      pickupPlayer = nearestPlayer || Neo.player;
      playerX = pickupPlayer.x;
      playerY = pickupPlayer.y;
      if (pickup.type === 'coin') {
        const magnetRadius = autoVacuumRange > 0 ? autoVacuumRange : 110;
        pullPickupTowardPlayer(pickup, magnetRadius, 180, 260);
      } else if (pickup.type === 'potion') {
        const _potionCap = Neo.getPotionCarryCap();
        const _wantPotion = pickupPlayer.hp < pickupPlayer.maxHp
          || (_potionCap > 0 && Number(pickupPlayer.storedPotions || 0) < _potionCap && pickupPlayer.hp >= pickupPlayer.maxHp);
        if (_wantPotion) {
          const magnetRadius = autoVacuumRange > 0 ? autoVacuumRange : 110;
          pullPickupTowardPlayer(pickup, magnetRadius, 180, 260);
        }
      } else if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const magnetRadius = autoVacuumRange > 0 ? autoVacuumRange : 124;
        pullPickupTowardPlayer(pickup, magnetRadius, 190, 240);
      } else if (pickup.type === 'item') {
        const magnetRadius = autoVacuumRange > 0 ? autoVacuumRange : 145;
        pullPickupTowardPlayer(pickup, magnetRadius, 150, 220);
      } else if (pickup.type === 'jesterPortal' || pickup.type === 'adapterPortal') {
        pickup.spawnT = Math.max(0, Number(pickup.spawnT || 0) + dt);
        const activateAt = Math.max(0.01, Number(pickup.activateAt || Neo.JESTER_PORTAL_ACTIVATE_DELAY));
        if (!pickup.active && pickup.spawnT >= activateAt) {
          pickup.active = true;
          const readyColor = pickup.type === 'adapterPortal' ? '#d6c4ff' : '#ffc2f0';
          Neo.spawnParticle({ x: pickup.x, y: pickup.y - 16, life: 0.6, text: 'READY', c: readyColor });
        }
      } else if (pickup.type === 'challengeRune') {
        const runeRadius = 16;
        const minX = Neo.WALL + runeRadius;
        const maxX = Neo.ROOM_W - Neo.WALL - runeRadius;
        const minY = Neo.WALL + runeRadius;
        const maxY = Neo.ROOM_H - Neo.WALL - runeRadius;
        if (!Number.isFinite(pickup.vx) || !Number.isFinite(pickup.vy)) {
          const angle = Neo.rand(Math.PI * 2, 0, 'world');
          const speed = Neo.rand(82, 56, 'world');
          pickup.vx = Math.cos(angle) * speed;
          pickup.vy = Math.sin(angle) * speed;
        }
        let runeMoveX = pickup.vx;
        let runeMoveY = pickup.vy;
        // Runes flee from the player so collecting them feels like a puzzle/chase
        // rather than a passive vacuum. Their total drift plus flee speed is capped
        // at 1.8x base player movement, leaving the standard dash fast enough to catch them.
        const fleeRadius = 150;
        const fdx = pickup.x - playerX;
        const fdy = pickup.y - playerY;
        const fleeDistSq = fdx * fdx + fdy * fdy;
        if (fleeDistSq < fleeRadius * fleeRadius && fleeDistSq > 0.000001) {
          const fleeDist = Math.sqrt(fleeDistSq);
          const fleeSpeed = 250 + (1 - fleeDist / fleeRadius) * 260;
          runeMoveX += (fdx / fleeDist) * fleeSpeed;
          runeMoveY += (fdy / fleeDist) * fleeSpeed;
        }
        const runeMoveSpeed = Math.hypot(runeMoveX, runeMoveY);
        const runeMaxSpeed = getChallengeRuneMaxSpeed();
        if (runeMoveSpeed > runeMaxSpeed) {
          const speedScale = runeMaxSpeed / runeMoveSpeed;
          runeMoveX *= speedScale;
          runeMoveY *= speedScale;
        }
        pickup.x += runeMoveX * dt;
        pickup.y += runeMoveY * dt;
        if (pickup.x <= minX || pickup.x >= maxX) {
          pickup.x = Neo.clamp(pickup.x, minX, maxX);
          pickup.vx *= -1;
        }
        if (pickup.y <= minY || pickup.y >= maxY) {
          pickup.y = Neo.clamp(pickup.y, minY, maxY);
          pickup.vy *= -1;
        }
      } else if (pickup.type === 'challengeSwitch') {
        const switchDistance = Neo.dist(playerX, playerY, pickup.x, pickup.y);
        if (switchDistance > 44) pickup.armed = true;
      }
      // Service-room choice stations are interaction anchors, not walk-over
      // loot. The player approaches a pictured option and confirms with E/X.
      if (pickup.type === 'specialService' || pickup.type === 'specialChoice') continue;
      // A/B chest dwell areas fill a meter while the player stands inside, and
      // only grant once full. Run this before the generic instant-pickup gate so
      // the meter can fill/decay every frame using the larger dwell radius.
      if (pickup.type === 'rewardChoice' && pickup.dwellMode) {
        const dwellRadius = Neo.AB_CHEST_DWELL_RADIUS || 44;
        const dwellTarget = Neo.AB_CHEST_DWELL_SECONDS || 2.2;
        const ddx = pickup.x - playerX;
        const ddy = pickup.y - playerY;
        const inside = ddx * ddx + ddy * ddy < dwellRadius * dwellRadius;
        if (inside) {
          pickup.dwell = Math.min(dwellTarget, Number(pickup.dwell || 0) + dt);
        } else {
          // Drain a bit faster than it fills so stepping out is a real commitment
          // cost, but not so fast that a brief nudge wipes all progress.
          pickup.dwell = Math.max(0, Number(pickup.dwell || 0) - dt * 1.5);
        }
        if (pickup.dwell < dwellTarget) continue;
        // Meter is full → fall through to the grant block below.
      }

      // A duplicate Artificer Charger is dangerous (costs a Loop Crystal, lethal
      // at 0), so it is never collected by walk-over: the player must hold the
      // spot like an A/B chest to agree to the pickup. First copy stays instant.
      const chargerOverchargeRisk = pickup.type === 'item'
        && pickup.key === 'artificer_charger'
        && Neo.getItemCount('artificer_charger') > 0;
      if (chargerOverchargeRisk) {
        const dwellRadius = Neo.AB_CHEST_DWELL_RADIUS || 44;
        const dwellTarget = Neo.AB_CHEST_DWELL_SECONDS || 2.2;
        const ddx = pickup.x - playerX;
        const ddy = pickup.y - playerY;
        const inside = ddx * ddx + ddy * ddy < dwellRadius * dwellRadius;
        pickup.overchargeDwell = inside
          ? Math.min(dwellTarget, Number(pickup.overchargeDwell || 0) + dt)
          : Math.max(0, Number(pickup.overchargeDwell || 0) - dt * 1.5);
        if (pickup.overchargeDwell < dwellTarget) continue;
      }

      const pickupTriggerRadius = (pickup.type === 'jesterPortal' || pickup.type === 'adapterPortal')
        ? Neo.JESTER_PORTAL_TRIGGER_RADIUS
        : pickup.type === 'challengePracticePortal'
          ? 34
        : pickup.type === 'challengeRune'
          ? getChallengeRuneTriggerRadius()
        : pickup.type === 'challengeSwitch'
          ? 32
        : pickup.type === 'ladder'
          ? Neo.LADDER_TRIGGER_RADIUS
          : 26;
      const triggerDx = pickup.x - playerX;
      const triggerDy = pickup.y - playerY;
      if ((pickup.type !== 'rewardChoice' || !pickup.dwellMode)
        && !chargerOverchargeRisk
        && triggerDx * triggerDx + triggerDy * triggerDy >= pickupTriggerRadius * pickupTriggerRadius) continue;
      if (pickup.type === 'challengeSwitch' && pickup.armed === false) continue;

      if (pickup.type === 'coin') {
        // Naked King's Last Penny (GREEN): really adds +1 coin per stack to each
        // coin pickup (and the gold-gain sound rings out again for every coin).
        const pennyStacks = Neo.getItemCount?.('naked_kings_last_penny') || 0;
        addCoins(Math.round((pickup.value || 1) * coinPickupMultiplier) + pennyStacks);
        Neo.playSfx?.('coin');
      }

      if (pickup.type === 'potion') {
        const potionCap = Neo.getPotionCarryCap();
        const stored = Number(pickupPlayer.storedPotions || 0);
        const doubled = potionDoubleChance > 0 && Neo.rng() < potionDoubleChance;
        const potionApplications = doubled ? 2 : 1;
        if (pickupPlayer.hp < pickupPlayer.maxHp) {
          const potionHeal = Neo.getPotionHealAmount() * potionApplications;
          const gained = healPickupPlayer(potionHeal);
          if (gained > 0) spawnHealPopup(pickupPlayer.x + Neo.rand(-10, 10), pickupPlayer.y - 20, gained);
          if (doubled) Neo.spawnParticle({ x: pickupPlayer.x, y: pickupPlayer.y - 34, life: 0.7, text: 'DOUBLE POTION', c: '#9af7d8' });
        } else if (potionCap > 0 && stored < potionCap) {
          const storedGain = Math.min(potionApplications, potionCap - stored);
          pickupPlayer.storedPotions = stored + storedGain;
          Neo.spawnParticle({ x: pickupPlayer.x, y: pickupPlayer.y - 20, life: 0.7, text: `POTION STORED (${pickupPlayer.storedPotions}/${potionCap})`, c: '#a0e8ff' });
          if (doubled && storedGain > 1) Neo.spawnParticle({ x: pickupPlayer.x, y: pickupPlayer.y - 36, life: 0.7, text: 'DOUBLE POTION', c: '#9af7d8' });
          Neo.updateHud();
        } else {
          continue;
        }
      }

      if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const heal = Neo.scalePlayerHealing(Math.max(10, Number(pickup.heal || 20)), 10);
        const actual = healPickupPlayer(heal);
        if (actual > 0) {
          spawnHealPopup(pickupPlayer.x + Neo.rand(-8, 8), pickupPlayer.y - 22, actual, { color: '#79ff8f', size: 14 });
          Neo.spawnParticle({ x: pickupPlayer.x, y: pickupPlayer.y - 18, life: 0.55, text: `+${Math.ceil(actual)}`, c: '#79ff8f' });
        }
        const fruitRoom = Neo.getRoomByCoords(Number(pickup.roomGx ?? Neo.currentRoom?.gx), Number(pickup.roomGy ?? Neo.currentRoom?.gy)) || Neo.currentRoom;
        globalThis.NeoNyke.simulation.collectCampaignGardenFruit(fruitRoom, pickup, Neo.gameElapsedTime, {
          random: () => Neo.nextRandom('world'),
          minimumRespawnSeconds: 12,
          respawnSpreadSeconds: 10,
        });
      }

      if (pickup.type === 'item') {
        if (pickup.tutorialRelic) {
          Neo.tutorialController?.signal?.('relic-collected', { tutorialRelic: true, key: pickup.key });
        }
        if (pickup.tutorialTreasureItem) {
          Neo.tutorialController?.signal?.('treasure-item-collected', { key: pickup.key });
        }
        Neo.collectItem(pickup.key);
        if (Neo.gameMode === 'story' && pickup.storyRewardGroup === 'floor8DragonOrbs' && Neo.storyState) {
          const claimed = Neo.storyState.floor8DragonOrbsClaimed ||= {};
          claimed[pickup.storyRewardIndex] = true;
          const count = Object.keys(claimed).length;
          Neo.storyState.objective = count >= 5 ? 'Reach GOD and become the strongest there is' : `Claim all five Dragon Orbs (${count}/5)`;
          if (count >= 5) Neo.storyState.rewards.floor8DragonOrbs = true;
          Neo.updateObjective?.();
        }
        if (Neo.gameMode === 'story' && pickup.storyRewardGroup === 'floor3DragonOrb' && Neo.storyState) {
          Neo.storyState.rewards.floor3DragonOrb = true;
          Neo.storyState.objective = 'Continue the quest for the Dragon Orbs';
          Neo.updateObjective?.();
        }
        Neo.playSfx?.('item_collect');
        if (Neo.floorSkipPending > 0) {
          if (spawnJesterPortalPickup()) {
            removePickupAt(index);
            Neo.scheduleRunSave();
            continue;
          }
          Neo.floor = Math.min(Neo.MAX_FLOOR, Neo.floor + Neo.floorSkipPending);
          Neo.floorSkipPending = 0;
          Neo.refreshFloorChargeStates();
          Neo.metaProgress.bestFloor = Math.max(Neo.metaProgress.bestFloor, Neo.floor);
          Neo.persistMetaSoon();
          Neo.showFloorTransition = true;
          Neo.floorTransitionTime = 0;
          Neo.generateFloor();
          Neo.scheduleRunSave();
          return;
        }
      }

      if (pickup.type === 'treasureKey') {
        Neo.playSfx?.('item_collect');
        Neo.beginTreasureHuntEscape?.();
      }

      if (pickup.type === 'rewardChoice') {
        const groupId = String(pickup.groupId || '');
        const key = pickup.key;
        if (!groupId || !key) {
          removePickupAt(index);
          continue;
        }
        const sourceChest = Neo.chests.find(chest => String(chest?.choiceGroupId || '') === groupId);
        if (sourceChest) {
          const claim = globalThis.NeoNyke.simulation.claimCampaignChestSelection(sourceChest, key);
          if (!claim.ok) { removePickupAt(index); continue; }
        }
        Neo.collectItem(key);
        Neo.playSfx?.('item_collect');
        // Tutorial dwell lesson: advances once the player hold-claims a reward.
        Neo.tutorialController?.signal?.('dwell-collected', { key });
        const remainingBeforePick = Math.max(1, Math.floor(Number(pickup.picksRemaining || 1)));
        const remainingAfterPick = remainingBeforePick - 1;
        Neo.pickups = Neo.pickups.filter(item => {
          if (item === pickup) return false;
          if (item?.type !== 'rewardChoice' || String(item.groupId || '') !== groupId) return true;
          if (remainingAfterPick <= 0) return false;
          item.picksRemaining = remainingAfterPick;
          if (String(item.label || '').includes('/5')) item.label = `${remainingAfterPick}/5`;
          return true;
        });
        if (remainingAfterPick > 0) {
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.75, text: `${remainingAfterPick} PICK LEFT`, c: '#d7f6ff' });
        }
        Neo.syncCurrentRoomState();
        Neo.scheduleRunSave();
        Neo.updateObjective();
        continue;
      }

      if (pickup.type === 'jesterPortal') {
        if (!pickup.active) continue;
        if (useJesterPortal(pickup)) return;
        continue;
      }

      if (pickup.type === 'adapterPortal') {
        if (!pickup.active) continue;
        // On success enterRoom rebuilds Neo.pickups, so stop iterating this stale
        // list. On failure (target room gone) drop the dead portal and move on.
        if (useAdapterPortal(pickup)) return;
        removePickupAt(index);
        continue;
      }

      if (pickup.type === 'challengePracticePortal') {
        if (Neo.gameMode !== 'practice' || Neo.practiceVariant !== 'challenges') {
          removePickupAt(index);
          continue;
        }
        const targetRoom = Neo.rooms.find(room => room.gx === pickup.targetGx && room.gy === pickup.targetGy);
        if (!targetRoom || targetRoom === Neo.currentRoom) {
          removePickupAt(index);
          continue;
        }
        if (targetRoom.practiceChallengeRoom) Neo.resetChallengePracticeRoom?.(targetRoom);
        Neo.enterRoom(targetRoom);
        Neo.player.x = Neo.START_X;
        Neo.player.y = Neo.START_Y;
        Neo.spawnParticle({
          x: Neo.player.x,
          y: Neo.player.y - 36,
          life: 0.8,
          text: targetRoom.practiceChallengeHub ? 'CHALLENGE HUB' : Neo.getChallengeTrialLabel(targetRoom.challengeType),
          c: '#8dffcf',
        });
        return;
      }

      if (pickup.type === 'ladder') {
        // The ladder is activated by the shared interact action (E / gamepad /
        // mobile button) via Neo.useLadder, not by walking onto it.
        continue;
      }

      if (pickup.type === 'secretWarp') {
        Neo.floor = Neo.clamp(Number(pickup.targetFloor || Neo.floor), 1, Neo.MAX_FLOOR);
        Neo.refreshFloorChargeStates();
        Neo.metaProgress.bestFloor = Math.max(Neo.metaProgress.bestFloor, Neo.floor);
        Neo.persistMetaSoon();
        Neo.showFloorTransition = true;
        Neo.floorTransitionTime = 0;
        Neo._carriedRivals = Neo.rivals.filter(r => !r.dead && r.hp > 0);
        Neo.generateFloor();
        Neo.scheduleRunSave();
        return;
      }

      if (pickup.type === 'secretVendor') {
        if (pickup.bought) {
          removePickupAt(index);
          continue;
        }
        if (pickup.offerKind === 'relic' && !pickup.rewardKey) {
          pickup.rewardKey = Neo.rollItemDrop({ elite: true, random: Neo.createEntityRandom(pickup, 'secret-vendor:fallback') });
        }
        const result = globalThis.NeoNyke.simulation.purchaseCampaignSecretVendor(
          { floor: Neo.floor, metaProgress: Neo.metaProgress }, Neo.currentRoom, Neo.player, pickup,
        );
        if (!result.ok) {
          const now = Date.now();
          if (!pickup.lastDeniedAt || now - pickup.lastDeniedAt > 450) {
            Neo.spawnParticle({ x: pickup.x, y: pickup.y - 20, life: 0.85, text: `${result.cost || pickup.cost || 1} ${pickup.offerKind === 'xp' ? 'C' : 'LC'}`, c: '#ffb1b1' });
            pickup.lastDeniedAt = now;
          }
          continue;
        }
        if (result.rewardKey) {
          Neo.collectItem(result.rewardKey);
          Neo.player.lastSecretVendorRewardKey = result.rewardKey;
        } else if (result.offerKind === 'vitality') {
          Neo.applyPlayerHealing?.(Neo.scalePlayerHealing(result.heal, 20));
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: '+VIT', c: '#8dffbd' });
        } else if (result.offerKind === 'xp') {
          Neo.grantXp(result.xp);
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: `+${result.xp} XP`, c: '#8dd4ff' });
        } else {
          addCoins(result.coins);
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: 'RICH', c: '#ffd966' });
        }
        Neo.persistMetaSoon();
      }

      if (pickup.type === 'secret_boss_chest') {
        const rewardKey = pickup.rewardKey || Neo.rollItemDrop({ elite: true, random: Neo.createEntityRandom(pickup, 'secret-boss:loot') });
        const result = globalThis.NeoNyke.simulation.lootCampaignSecretBossChest(
          { floor: Neo.floor }, Neo.currentRoom, Neo.player, pickup, { rewardKey },
        );
        if (!result.ok) continue;
        removePickupAt(index);
        Neo.collectItem(result.rewardKey);
        addCoins(result.coins);
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 1.0, text: 'BANE SLAIN', c: '#c9aaff' });
        Neo.syncCurrentRoomState();
        Neo.scheduleRunSave();
        return;
      }

      if (pickup.type === 'fightGod') {
        Neo.currentRoom.bossStarted = true;
        Neo.pickups = [];
        Neo.spawnGodBoss();
        Neo.playGodDialogue(1);
        Neo.syncCurrentRoomState();
        Neo.updateObjective();
        Neo.scheduleRunSave();
        return;
      }

      if (pickup.type === 'challengeStarter') {
        Neo.beginChallengeTrial(Neo.currentRoom);
        Neo.syncCurrentRoomState();
        Neo.updateObjective();
        Neo.scheduleRunSave();
        return;
      }

      if (pickup.type === 'challengeSwitch') {
        Neo.pressChallengeCircuitSwitch?.(pickup);
        Neo.syncCurrentRoomState();
        Neo.updateObjective();
        Neo.scheduleRunSave();
        return;
      }

      if (pickup.type === 'challengeBomb') {
        const tutorialBomb = Neo.isTutorialRun?.() && Neo.currentRoom?.tutorialLesson === 'challenge';
        const result = globalThis.NeoNyke.simulation.resolveCampaignChallengePickup(Neo.currentRoom, pickup, {
          tutorial: tutorialBomb,
          damage: getBombHazardDamage(28),
          remainingSafeBombs: Neo.pickups.filter(p => p !== pickup && p?.type === 'challengeBomb' && p.safe).length,
        });
        if (!result.ok) return;
        if (result.type === 'CHALLENGE_BOMB_DEFUSED') {
          if (result.removePickup) removePickupAt(index);
          if (result.complete) {
            Neo.completeChallengeTrial('BOMBS DISARMED');
          } else {
            Neo.spawnParticle({ x: pickup.x, y: pickup.y - 20, life: 0.7, text: `DEFUSED — ${result.remaining} LEFT`, c: '#8dd4ff' });
            Neo.updateObjective();
          }
        } else {
          blastRadius(pickup.x, pickup.y, 76, result.damage, '#ff7a66');
          Neo.spawnParticle({ x: pickup.x, y: pickup.y - 20, life: 0.75, text: tutorialBomb ? 'RED = DANGER' : 'WRONG', c: '#ff7a7a' });
          if (result.removePickup) removePickupAt(index);
          if (result.spawnFailureHazard) {
            Neo.spawnBombFailAoe(pickup.x, pickup.y);
            Neo.failChallengeTrial('WRONG BOMB');
          }
        }
        Neo.scheduleRunSave();
        return;
      }

      if (pickup.type === 'challengeRune') {
        const result = globalThis.NeoNyke.simulation.resolveCampaignChallengePickup(Neo.currentRoom, pickup, { timerRefund: 2 });
        if (!result.ok) return;
        Neo.spawnParticle({ x: pickup.x, y: pickup.y - 18, life: 0.55, text: `RUNE +${result.timerRefund}s`, c: '#8dd4ff' });
        if (result.complete) {
          Neo.completeChallengeTrial('RUNES CLAIMED');
        }
      }

      if (pickup.type === 'descend') {
        Neo.floor += 1;
        // Turtle Boy's signature: a free laser tier every 3 floors descended
        // (floors 3, 6, 9, ...). Each step permanently buffs his Turtle Wave.
        if (Neo.player?.character === 'turtle_boy' && Neo.floor % 3 === 0) {
          Neo.player.turtleLaserSteps = Number(Neo.player.turtleLaserSteps || 0) + 1;
          Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 28, life: 1.1, text: 'LASER +', c: '#7fe0ff' });
          Neo.ringBurst?.(Neo.player.x, Neo.player.y, 40, '#7fe0ff', 0.5);
          Neo.playSfx?.('powerup');
        }
        window.achievementEvents?.emit('floor:reached', { floor: Neo.floor });
        Neo.refreshFloorChargeStates();
        Neo.metaProgress.bestFloor = Math.max(Neo.metaProgress.bestFloor, Neo.floor);
        Neo.persistMetaSoon();
        Neo.showFloorTransition = true;
        Neo.floorTransitionTime = 0;
        Neo.player.x = Neo.START_X;
        Neo.player.y = Neo.START_Y;
        Neo._carriedRivals = Neo.rivals.filter(r => !r.dead && r.hp > 0);
        Neo.generateFloor();
        Neo.scheduleRunSave();
        return;
      }

      if (pickup.type === 'returnGate') {
        if (Neo.gameMode === 'competitive') {
          Neo.win();
        } else {
          returnToFloorOne();
        }
        return;
      }

      if (pickup.type === 'crown') {
        Neo.win();
        return;
      }

      removePickupAt(index);
      Neo.scheduleRunSave();
    }
  }

  function updateDeadBodies(dt) {
    let writeIndex = 0;
    for (let index = 0; index < Neo.deadBodies.length; index += 1) {
      const body = Neo.deadBodies[index];
      body.age = Number(body.age || 0) + dt;
      if (!Number.isFinite(Number(body.z))) body.z = 0;
      if (!Number.isFinite(Number(body.vz))) body.vz = 0;
      if (!Number.isFinite(Number(body.angularOffset))) body.angularOffset = 0;
      if (!Number.isFinite(Number(body.angularV))) body.angularV = 0;

      const fallTime = Math.max(0.01, Number(body.fallTime || Neo.CORPSE_FALL_TIME));
      const horizontalSpeed = Math.hypot(Number(body.vx || 0), Number(body.vy || 0));
      const stillMoving = body.age <= fallTime
        || Number(body.z || 0) > 0.15
        || Number(body.vz || 0) > 8
        || horizontalSpeed > 2.2
        || Math.abs(Number(body.angularV || 0)) > 0.14;

      if (stillMoving) {
        const gravity = Math.max(260, Number(body.gravity || 560));
        const bounce = Neo.clamp(Number(body.bounce || 0.24), 0, 0.8);
        const slideDrag = Math.max(0, Number(body.slideDrag || 5.8));
        const airDrag = Math.max(0, Number(body.airDrag || 1.9));
        const angularDrag = Math.max(0, Number(body.angularDrag || 2.3));

        body.vz -= gravity * dt;
        body.z += Number(body.vz || 0) * dt;
        body.x += Number(body.vx || 0) * dt;
        body.y += Number(body.vy || 0) * dt;
        body.angularOffset += Number(body.angularV || 0) * dt;

        if (body.z <= 0) {
          body.z = 0;
          if (body.vz < -40) {
            body.vz = -body.vz * bounce;
            body.vx *= 0.82;
            body.vy *= 0.82;
            body.angularV *= 0.72;
          } else {
            body.vz = 0;
          }
          const groundDamp = Math.max(0, 1 - slideDrag * dt);
          body.vx *= groundDamp;
          body.vy *= groundDamp;
        } else {
          const airDamp = Math.max(0, 1 - airDrag * dt);
          body.vx *= airDamp;
          body.vy *= airDamp;
        }

        body.angularV *= Math.max(0, 1 - angularDrag * dt);
      }
      if (body.age < Number(body.life || Neo.CORPSE_LIFETIME)) {
        Neo.deadBodies[writeIndex] = body;
        writeIndex += 1;
      }
    }
    Neo.deadBodies.length = writeIndex;
  }

  const _PARTICLE_POOL_SIZE = 600;
  const _particlePool = [];
  for (let _pi = 0; _pi < _PARTICLE_POOL_SIZE; _pi += 1) {
    _particlePool.push({
      x: 0, y: 0, life: 0, c: null,
      vx: 0, vy: 0,
      text: null, size: null, outline: null,
      line: null, shockwave: null, impact: null, spark: null,
      smoke: null, square: null, explosionCore: null,
      blood: null, ring: null, style: null,
      maxLife: null, radius: null, angle: null,
      rotation: 0, spin: 0, drag: 0, grow: 0, reducedFlash: false,
      silhouette: null,
      _active: false, _particleList: null, _dmgOwner: null, _dmgTotal: 0, _dmgCrit: false,
    });
  }

  function _acquireParticle() {
    return _particlePool.length > 0 ? _particlePool.pop() : {
      x: 0, y: 0, life: 0, c: null,
      vx: 0, vy: 0,
      text: null, size: null, outline: null,
      line: null, shockwave: null, impact: null, spark: null,
      smoke: null, square: null, explosionCore: null,
      blood: null, ring: null, style: null,
      maxLife: null, radius: null, angle: null,
      rotation: 0, spin: 0, drag: 0, grow: 0, reducedFlash: false,
      silhouette: null,
      _active: false, _particleList: null, _dmgOwner: null, _dmgTotal: 0, _dmgCrit: false,
    };
  }

  // Expanding ring burst at a point — the most common particle shape (a hit/AoE
  // pop). Wraps spawnParticle so call sites read as intent, not a props literal.
  function ringBurst(x, y, ring, c, life = 0.5) {
    spawnParticle({ x, y, life, ring, c });
  }

  function spawnParticle(props) {
    const p = _acquireParticle();
    p.x = props.x;
    p.y = props.y;
    p.life = props.life;
    p.c = props.c ?? null;
    p.vx = props.vx ?? 0;
    p.vy = props.vy ?? 0;
    p.text = props.text ?? null;
    p.size = props.size ?? null;
    p.outline = props.outline ?? null;
    p.line = props.line ?? null;
    p.shockwave = props.shockwave ?? null;
    p.impact = props.impact ?? null;
    p.spark = props.spark ?? null;
    p.smoke = props.smoke ?? null;
    p.square = props.square ?? null;
    p.explosionCore = props.explosionCore ?? null;
    p.blood = props.blood ?? null;
    p.ring = props.ring ?? null;
    p.style = props.style ?? null;
    p.maxLife = props.maxLife ?? null;
    p.radius = props.radius ?? null;
    p.angle = props.angle ?? null;
    p.rotation = props.rotation ?? 0;
    p.spin = props.spin ?? 0;
    p.drag = props.drag ?? 0;
    p.grow = props.grow ?? 0;
    p.reducedFlash = props.reducedFlash ?? false;
    p.silhouette = props.silhouette ?? null;
    p._active = true;
    p._particleList = Neo.particles;
    p._dmgOwner = null;
    p._dmgTotal = 0;
    p._dmgCrit = false;
    Neo.particles.push(p);
  }

  // Hard ceiling on simultaneous non-text particles. Holding a continuous beam
  // can spawn blood/hit flecks faster than they expire; without a cap the array
  // grows unbounded and drawParticles() (one shadowBlur per particle) tanks FPS.
  const MAX_PARTICLES = 260;

  function cullNonTextParticles(maxCount) {
    if (Neo.particles.length <= maxCount) return;
    let removeCount = Neo.particles.length - maxCount;
    let writeIndex = 0;
    // Drop oldest non-text particles first (text = damage popups, kept for readability).
    for (let index = 0; index < Neo.particles.length; index += 1) {
      const particle = Neo.particles[index];
      if (removeCount > 0 && !particle.text) {
        particle._active = false;
        particle._particleList = null;
        _particlePool.push(particle);
        removeCount -= 1;
      } else {
        Neo.particles[writeIndex] = particle;
        writeIndex += 1;
      }
    }
    Neo.particles.length = writeIndex;
  }

  function updateParticles(dt) {
    // With reduceParticles: cull non-text particles to keep count low
    if (window.NeoSettings?.getAccess()?.reduceParticles) {
      cullNonTextParticles(24);
    } else if (window.NeoSettings?.isPerformanceMode?.() !== false) {
      // Performance mode (default on): generous cap that only bites during floods.
      cullNonTextParticles(MAX_PARTICLES);
    }
    let writeIndex = 0;
    for (let index = 0; index < Neo.particles.length; index += 1) {
      const particle = Neo.particles[index];
      particle.life -= dt;
      if (particle.blood) particle.vy = Math.min(220, particle.vy + 390 * dt);
      if (particle.drag > 0) {
        const drag = Math.exp(-particle.drag * dt);
        particle.vx *= drag;
        particle.vy *= drag;
      }
      if (particle.vx) particle.x += particle.vx * dt;
      if (particle.vy) particle.y += particle.vy * dt;
      if (particle.spin) particle.rotation += particle.spin * dt;
      if (particle.grow) particle.size += particle.grow * dt;
      if (particle.ring) particle.ring += 200 * dt;
      if (particle.life <= 0) {
        particle._active = false;
        particle._particleList = null;
        _particlePool.push(particle);
      } else {
        Neo.particles[writeIndex] = particle;
        writeIndex += 1;
      }
    }
    Neo.particles.length = writeIndex;
  }

  function isRoomLocked() {
    const challengeActive = Neo.isChallengeRoomLocked?.(Neo.currentRoom) || false;
    const baneActive = !!Neo.currentRoom && Neo.currentRoom.secret && Neo.currentRoom.secretKind === 'bowman_bane'
      && !!Neo.currentRoom.bossStarted && !Neo.currentRoom.cleared && !Neo.currentRoom.baneEscapeRevealed;
    if (!Neo.currentRoom) return false;
    if (challengeActive) return true;
    return !Neo.currentRoom.cleared
      && (Neo.currentRoom.type === 'boss'
        || Neo.currentRoom.type === 'god'
        || Neo.currentRoom.type === 'ladder'
        || Neo.currentRoom.treasureHuntEscapeActive
        || baneActive);
  }

  function updateTransitions(dt) {
    const challengeActive = Neo.isChallengeRoomLocked?.(Neo.currentRoom) || false;
    const canLeaveFight = Neo.enemies.length > 0
      && Neo.currentRoom
      && Neo.currentRoom.type !== 'boss'
      && Neo.currentRoom.type !== 'god'
      && Neo.currentRoom.type !== 'ladder'
      && !challengeActive;
    const roomLocked = isRoomLocked();
    if (!Neo.fading && !roomLocked && (Neo.enemies.length === 0 || canLeaveFight)) {
      // Require walking to the back of the doorway (out to the room edge) before
      // the room changes, rather than triggering as soon as the player nicks the
      // inner wall face. moveCircle lets the player slide into the open doorway
      // tunnel; the transition fires once their center reaches its outer slice.
      let door = null;
      let leaderSlotId = 1;
      for (const slot of getLocalCoopSlots({ livingOnly: true })) {
        const actor = slot.getEntity();
        const exitDepth = actor.r + 6;
        door =
          actor.y < exitDepth && Neo.hasRoomExit(Neo.currentRoom, 'n') && Math.abs(actor.x - Neo.ROOM_W / 2) < Neo.DOOR / 2 ? 'n' :
          actor.y > Neo.ROOM_H - exitDepth && Neo.hasRoomExit(Neo.currentRoom, 's') && Math.abs(actor.x - Neo.ROOM_W / 2) < Neo.DOOR / 2 ? 's' :
          actor.x < exitDepth && Neo.hasRoomExit(Neo.currentRoom, 'w') && Math.abs(actor.y - Neo.ROOM_H / 2) < Neo.DOOR / 2 ? 'w' :
          actor.x > Neo.ROOM_W - exitDepth && Neo.hasRoomExit(Neo.currentRoom, 'e') && Math.abs(actor.y - Neo.ROOM_H / 2) < Neo.DOOR / 2 ? 'e' :
          null;
        if (door) {
          leaderSlotId = slot.id;
          break;
        }
      }
      // Tutorial navigation is intentionally never hard-gated. If the player
      // explores out of order, the controller points them back to the unfinished
      // lesson. Only real encounter locks (ladder/boss/active challenge) close
      // every door, and those are explained when they happen.
      if (door) {
        Neo.transitionLeaderSlotId = leaderSlotId;
        startTransition(door);
      }
    }

    stepActiveTransitionFade(dt);
  }

  function stepActiveTransitionFade(dt) {
    if (!Neo.fading) return;
    Neo.fade += (Neo.fading === 1 ? 1 : -1) * dt * 3;
    if (Neo.fade >= 1 && Neo.fading === 1) {
      doTransition();
      Neo.fading = -1;
    }
    if (Neo.fade <= 0 && Neo.fading === -1) {
      Neo.fading = 0;
    }
    Neo.fade = Neo.clamp(Neo.fade, 0, 1);
  }

  function startTransition(direction) {
    Neo.fading = 1;
    Neo.nextDoor = direction;
    Neo.playSfx?.('room_transition');
  }

  function snapCameraToEntity(cam, entity, vpW, vpH) {
    if (!cam || !entity) return;
    cam.x = entity.x - vpW / 2;
    cam.y = entity.y - vpH / 2;
  }

  function syncCamerasAfterTransition() {
    const split = Neo.isSplitScreen();
    const sc = split ? Neo.getActivePlayerSlots().length : 1;
    const vpW = split ? Math.floor(Neo.canvas.width / 2) : Neo.canvas.width;
    const vpH = sc >= 3 ? Math.floor(Neo.canvas.height / 2) : Neo.canvas.height;

    snapCameraToEntity(Neo.camera, Neo.player, vpW, vpH);
    if (!split) return;
    Neo.getActivePlayerSlots().forEach(slot => {
      if (slot.id === 1) return;
      snapCameraToEntity(slot.getCamera(), slot.getEntity(), vpW, vpH);
    });
  }

  function doTransition() {
    const direction = Neo.nextDoor;
    const nextRoom = Neo.getConnectedRoom(Neo.currentRoom, direction);
    if (!nextRoom) return;
    Neo.enterRoom(nextRoom);
    const r = 18;
    let doorX = Neo.ROOM_W / 2;
    let doorY = Neo.ROOM_H / 2;
    if (direction === 'n') { doorY = Neo.ROOM_H - Neo.WALL - 30; doorX = Neo.ROOM_W / 2; }
    if (direction === 's') { doorY = Neo.WALL + 30; doorX = Neo.ROOM_W / 2; }
    if (direction === 'e') { doorX = Neo.WALL + 30; doorY = Neo.ROOM_H / 2; }
    if (direction === 'w') { doorX = Neo.ROOM_W - Neo.WALL - 30; doorY = Neo.ROOM_H / 2; }
    if (!Neo.isBlocked(doorX, doorY, r)) positionLocalCoopParty(doorX, doorY, direction);
    // Prevent one-frame camera lag that can look like room offset after fades/cutscenes.
    syncCamerasAfterTransition();
  }

  function spawnLoopBlueRewardChoices() {
    const pool = Array.isArray(Neo.BLUE_ITEM_POOL) ? Neo.BLUE_ITEM_POOL.filter(Boolean) : [];
    if (!Neo.currentRoom || pool.length === 0) return;

    const random = Neo.createScopedRandom(`loop:${Neo.runLoopIndex}:blue-choice`);
    const choices = Neo.shuffleWithRandom(pool, random).slice(0, 3);
    const groupId = `loop-blue:${Neo.runLoopIndex}`;
    const cx = Neo.ROOM_W / 2;
    const cy = Neo.ROOM_H / 2 + 78;
    const spacing = 104;
    choices.forEach((key, index) => {
      Neo.pickups.push({
        x: cx + (index - (choices.length - 1) / 2) * spacing,
        y: cy,
        type: 'rewardChoice',
        key,
        groupId,
        picksRemaining: 1,
        label: '1/3',
      });
    });
    Neo.currentRoom.loopBlueRewardChoices = choices;
    Neo.currentRoom.loopBlueRewardGroupId = groupId;
    Neo.spawnParticle({ x: cx, y: cy - 46, life: 1.4, text: 'CHOOSE 1 ARTIFICER RELIC', c: '#58b7ff' });
  }

  function returnToFloorOne() {
    Neo.floor = 1;
    Neo.refreshFloorChargeStates();
    Neo.runLoopIndex += 1;
    Neo.mooggyAssassinSpawnedThisRun = false;
    Neo.mooggyAssassinSpawnedThisFloor = false;
    window.achievementEvents?.emit('loop:completed', { loopIndex: Neo.runLoopIndex });
    Neo.syncSeedState();
    const crystalBonus = Math.max(0, Math.round(Neo.getActiveChallengeCrystalBonusMultiplier()));
    const titheBonus = Neo.hasLegacy('crystal_tithe') && Neo.HARD_DIFFICULTIES.has(Neo.selectedDifficulty) ? 1 : 0;
    const difficultiesBefore = Neo.getUnlockedDifficultySet ? new Set(Neo.getUnlockedDifficultySet()) : null;
    if (Neo.gameMode !== 'practice') {
      const crystalsThisLoop = 1 + crystalBonus + titheBonus;
      Neo.metaProgress.loopCrystals = Number(Neo.metaProgress.loopCrystals || 0) + crystalsThisLoop;
      Neo.runCrystalsEarned = Number(Neo.runCrystalsEarned || 0) + crystalsThisLoop;
      if (difficultiesBefore && Neo.getUnlockedDifficultySet) {
        for (const key of Neo.getUnlockedDifficultySet()) {
          if (key !== 'custom' && !difficultiesBefore.has(key)) Neo.recordDifficultyUnlock?.(key);
        }
      }
      if (crystalBonus > 0) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 42, life: 1.1, text: `+${crystalBonus} CHALLENGE LC`, c: '#8dd4ff' });
      }
      if (titheBonus > 0) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 56, life: 1.1, text: `+1 TITHE LC`, c: '#c9a8f0' });
      }
    }
    if (Neo.hasLegacy('bank_interest')) {
      Neo.metaProgress.coins = Number(Neo.metaProgress.coins || 0) + 50;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 70, life: 1.1, text: `+50 INTEREST`, c: '#ffd27d' });
    }
    Neo.metaProgress.bestFloor = Math.max(Neo.metaProgress.bestFloor, Neo.MAX_FLOOR);
    Neo.persistMetaSoon();
    Neo.player.x = Neo.START_X;
    Neo.player.y = Neo.START_Y;
    Neo.generateFloor();
    spawnLoopBlueRewardChoices();
    Neo.scheduleRunSave();
  }

  function addCoins(amount) {
    // Gold-boost items can scale positive gains via goldGainMultiplier; spends
    // (negative amounts) always pass through untouched. No item grants this
    // multiplier today, so it defaults to 1.
    const goldMult = Math.max(1, Number(Neo.getItemStats?.()?.goldGainMultiplier || 1));
    const gained = amount > 0 ? Math.round(amount * goldMult) : amount;
    Neo.player.coins += gained;
    Neo.metaProgress.coins += gained;
    Neo.persistMetaSoon();
    window.achievementEvents?.emit('meta:coins', { total: Neo.metaProgress.coins });
  }

  // Expose on Neo
  Neo.updatePlayer2 = updatePlayer2;
  Neo.updatePlayerN = updatePlayerN;
  Neo.damagePlayerN = damagePlayerN;
  Neo.damagePlayer2 = damagePlayer2;
  Neo.damagePlayerSlot = damagePlayerSlot;
  Neo.getLocalCoopSlots = getLocalCoopSlots;
  Neo.getNearestLivingPlayerSlot = getNearestLivingPlayerSlot;
  Neo.updateLocalCoopRevives = updateLocalCoopRevives;
  Neo.positionLocalCoopParty = positionLocalCoopParty;
  Neo.hitPvpPlayer2InRadius = hitPvpPlayer2InRadius;
  Neo.hitPvpPlayer2WithBeamPath = hitPvpPlayer2WithBeamPath;
  Neo.pvpEndGame = pvpEndGame;
  Neo.damagePlayer = damagePlayer;
  Neo.tickPlayerStatus = tickPlayerStatus;
  Neo.updatePlayerStatuses = updatePlayerStatuses;
  Neo.blastRadius = blastRadius;
  Neo.getRadialFalloffDamage = getRadialFalloffDamage;
  Neo.spawnAoeShockwave = spawnAoeShockwave;
  Neo.recordProjectileTrail = recordProjectileTrail;
  Neo.spawnProjectileImpact = spawnProjectileImpact;
  Neo.buildEnemySpatialIndex = buildEnemySpatialIndex;
  Neo.ensureEnemySpatialIndex = ensureEnemySpatialIndex;
  Neo.forEachEnemyNearCircle = forEachEnemyNearCircle;
  Neo.forEachEnemyNearRect = forEachEnemyNearRect;
  Neo.forEachDestructibleNearCircle = forEachDestructibleNearCircle;
  Neo.forEachDestructibleNearRect = forEachDestructibleNearRect;
  Neo.findNearestEnemy = findNearestEnemy;
  Neo.getBombHazardDamage = getBombHazardDamage;
  Neo.updateProjectiles = updateProjectiles;
  Neo.updateWorldProps = updateWorldProps;
  Neo.damageDestructible = damageDestructible;
  Neo.spawnDestructibleHitFx = spawnDestructibleHitFx;
  Neo.spawnDestructibleBreakFx = spawnDestructibleBreakFx;
  Neo.spawnBarrelExplosionFx = spawnBarrelExplosionFx;
  Neo.spawnDamagePopup = spawnDamagePopup;
  Neo.spawnHealPopup = spawnHealPopup;
  Neo.updateChests = updateChests;
  Neo.canSpawnJesterPortal = canSpawnJesterPortal;
  Neo.spawnJesterPortalPickup = spawnJesterPortalPickup;
  Neo.useJesterPortal = useJesterPortal;
  Neo.getChallengeRuneMaxSpeed = getChallengeRuneMaxSpeed;
  Neo.isAtLadder = isAtLadder;
  Neo.useLadder = useLadder;
  Neo.updatePickups = updatePickups;
  Neo.updateDeadBodies = updateDeadBodies;
  Neo.spawnProjectile = spawnProjectile;
  Neo.spawnParticle = spawnParticle;
  Neo.ringBurst = ringBurst;
  Neo.updateParticles = updateParticles;
  Neo.isRoomLocked = isRoomLocked;
  Neo.updateTransitions = updateTransitions;
  Neo.stepActiveTransitionFade = stepActiveTransitionFade;
  Neo.startTransition = startTransition;
  Neo.snapCameraToEntity = snapCameraToEntity;
  Neo.syncCamerasAfterTransition = syncCamerasAfterTransition;
  Neo.doTransition = doTransition;
  Neo.spawnLoopBlueRewardChoices = spawnLoopBlueRewardChoices;
  Neo.returnToFloorOne = returnToFloorOne;
  Neo.addCoins = addCoins;
