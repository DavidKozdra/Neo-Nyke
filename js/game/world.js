// world.js — standalone IIFE. Player movement, projectiles, world object updates.
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
    if (gamepad?.hasAim) return Math.atan2(gamepad.aimY, gamepad.aimX);
    if (Math.hypot(moveX, moveY) > 0.12) return Math.atan2(moveY, moveX);
    if (Math.hypot(Neo.player2?.vx || 0, Neo.player2?.vy || 0) > 4) return Math.atan2(Neo.player2.vy, Neo.player2.vx);
    return Number(Neo.player2?.lastAimAngle || 0);
  }

  function castPlayer2PvpLaser(angle) {
    if (!Neo.player2 || Neo.player2.pvpLaserCooldown > 0) return;
    const moveKey = Neo.player2.equippedMoves?.laser || 'blood_beam';
    Neo.player2.pvpLaserCooldown = getPvpMoveCooldown(Neo.player2, 'laser', 'blood_beam');
    Neo.player2.lastAimAngle = angle;
    const mode = moveKey === 'turtle_wave' ? 'turtle_wave' : moveKey === 'god_sweep' ? 'god_sweep' : 'beam';
    const range = Neo.getPlayerBeamRange(mode, moveKey);
    const path = Neo.buildRicochetBeamPath(Neo.player2.x, Neo.player2.y, angle, range, Neo.getPlayerBeamBounceCount(mode));
    const baseDamage = Neo.MOVE_BASE_STATS?.[moveKey]?.damage || Neo.ATTACKS.laser.damage;
    hitPvpPlayer1WithBeamPath(path, mode === 'turtle_wave' ? 14 : 6, baseDamage, mode === 'turtle_wave' ? 155 : 60, 'pvp_p2_beam');
    const end = Neo.getBeamPathEnd?.(path) || { x: Neo.player2.x + Math.cos(angle) * 90, y: Neo.player2.y + Math.sin(angle) * 90 };
    Neo.spawnParticle({ x: end.x, y: end.y, life: 0.18, r: 10, c: '#74b8ff' });
  }

  function castPlayer2PvpSmash() {
    if (!Neo.player2 || Neo.player2.pvpSmashCooldown > 0) return;
    const moveKey = Neo.player2.equippedMoves?.smash || 'crimson_smash';
    Neo.player2.pvpSmashCooldown = getPvpMoveCooldown(Neo.player2, 'smash', 'crimson_smash');
    const radius = (Neo.ATTACKS.smash.radius || 105) * 0.95;
    const damage = Neo.MOVE_BASE_STATS?.[moveKey]?.damage || Neo.ATTACKS.smash.damage;
    Neo.spawnAoeShockwave(Neo.player2.x, Neo.player2.y, radius, '#4ca8ff', 'heavy');
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
      const targetSpeed = 228;
      Neo.player2.vx = Neo.applyResponsiveVelocity(Neo.player2.vx, p2NX * targetSpeed, dt);
      Neo.player2.vy = Neo.applyResponsiveVelocity(Neo.player2.vy, p2NY * targetSpeed, dt);
    }
    tickPvpPlayer2Cooldowns(dt);
    const p2AimAngle = getPlayer2AimAngle(p2NX, p2NY, _gp1Active ? _gp1 : null);
    Neo.player2.lastAimAngle = p2AimAngle;
    Neo.moveCircle(Neo.player2, dt);
    Neo.player2.inv = Math.max(0, Neo.player2.inv - dt);
    if (Neo.player2.swing > 0) Neo.player2.swing = Math.max(0, Neo.player2.swing - dt);
    // P2 melee: U key
    if ((Neo.keys['u'] || _gp1Active && _gp1.p2MeleeHeld) && !Neo.player2.meleeLatch && Neo.player2.swing <= 0) {
      Neo.player2.meleeLatch = true;
      const aimAngle = Math.atan2(Neo.player2.vy || 1, Neo.player2.vx || 1);
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
      const angle = p2Len > 0.1 ? Math.atan2(p2NY, p2NX) : 0;
      Neo.player2.dashTime = 0.16;
      Neo.player2.dashX = Math.cos(angle) * 480;
      Neo.player2.dashY = Math.sin(angle) * 480;
      Neo.player2.vx = Neo.player2.dashX;
      Neo.player2.vy = Neo.player2.dashY;
      Neo.player2.inv = Math.max(Neo.player2.inv, 0.18);
    } else if (!Neo.keys[';'] && !(_gp1Active && _gp1.p2DashHeld)) {
      Neo.player2.dashLatch = false;
    }
    if (Neo.gameMode === 'pvp' && (Neo.keys.o || _gp1Active && _gp1.laser) && !Neo.player2.laserLatch) {
      Neo.player2.laserLatch = true;
      castPlayer2PvpLaser(p2AimAngle);
    } else if (!Neo.keys.o && !(_gp1Active && _gp1.laser)) {
      Neo.player2.laserLatch = false;
    }
    if (Neo.gameMode === 'pvp' && (Neo.keys.p || _gp1Active && _gp1.smash) && !Neo.player2.smashLatch) {
      Neo.player2.smashLatch = true;
      castPlayer2PvpSmash();
    } else if (!Neo.keys.p && !(_gp1Active && _gp1.smash)) {
      Neo.player2.smashLatch = false;
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
      pn.vx = Neo.applyResponsiveVelocity(pn.vx, nX * 228, dt);
      pn.vy = Neo.applyResponsiveVelocity(pn.vy, nY * 228, dt);
    }
    Neo.moveCircle(pn, dt);
    pn.inv = Math.max(0, pn.inv - dt);
    if (pn.swing > 0) pn.swing = Math.max(0, pn.swing - dt);
    if (_gpN && _gpN.p2MeleeHeld && !pn.meleeLatch && pn.swing <= 0) {
      pn.meleeLatch = true;
      const aimAngle = Math.atan2(pn.vy || 0, pn.vx || 1);
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
      const angle = len > 0.1 ? Math.atan2(nY, nX) : 0;
      pn.dashTime = 0.16; pn.dashX = Math.cos(angle) * 480; pn.dashY = Math.sin(angle) * 480;
      pn.vx = pn.dashX; pn.vy = pn.dashY; pn.inv = Math.max(pn.inv, 0.18);
    } else if (!(_gpN && _gpN.p2DashHeld)) { pn.dashLatch = false; }
    for (const enemy of Neo.enemies) {
      if (enemy.dead) continue;
      if (Math.hypot(pn.x - enemy.x, pn.y - enemy.y) < pn.r + enemy.r + 2 && pn.inv <= 0)
        damagePlayerN(pn, n, enemy.dmg || 10, Math.atan2(pn.y - enemy.y, pn.x - enemy.x), 220);
    }
  }

  function damagePlayerN(pn, n, amount, angle, knockback) {
    if (!pn || pn.inv > 0) return;
    pn.hp -= amount;
    pn.vx += Math.cos(angle) * knockback;
    pn.vy += Math.sin(angle) * knockback;
    pn.inv = 0.75;
    spawnDamagePopup(pn.x, pn.y - 18, amount, { color: '#a8d8ff', size: 16 });
    if (pn.hp <= 0) {
      pn.hp = 0;
      if (n === 3) Neo.p3DeadInCoop = true;
      if (n === 4) Neo.p4DeadInCoop = true;
      Neo.spawnParticle({ x: pn.x, y: pn.y - 30, life: 1.2, text: `P${n} DOWN`, c: '#a8d8ff' });
      if (Neo.p1DeadInCoop && Neo.p2DeadInCoop && Neo.p3DeadInCoop && Neo.p4DeadInCoop) Neo.die();
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

  function damagePlayer2(amount, angle, knockback, source = '') {
    if (!Neo.player2 || Neo.p2DeadInCoop) return;
    if (Neo.player2.inv > 0) return;
    Neo.player2.hp -= amount;
    Neo.player2.vx += Math.cos(angle) * knockback;
    Neo.player2.vy += Math.sin(angle) * knockback;
    Neo.player2.inv = 0.75;
    spawnDamagePopup(Neo.player2.x, Neo.player2.y - 18, amount, { color: '#4ca8ff', size: 16 });
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
        Neo.p2DeadInCoop = true;
        Neo.spawnParticle({ x: Neo.player2.x, y: Neo.player2.y - 30, life: 1.2, text: 'P2 DOWN', c: '#4ca8ff' });
        if (Neo.p1DeadInCoop && Neo.p2DeadInCoop && Neo.p3DeadInCoop && Neo.p4DeadInCoop) Neo.die();
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
      Neo.lastDamageSource = Neo.getDamageSourceLabel(source || 'no_hit');
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
    let finalAmount = numericAmount * (Neo.isChallengeActive('glass_cannon') ? 1.35 : 1) * (1 - (itemStats.damageReduction || 0));
    if (sandbox) finalAmount *= sandbox.enemyDamageMultiplier;
    if (ironLungApplies) {
      const roomCap = Neo.player.maxHp * 0.2;
      const remaining = roomCap - (Neo.player.roomDamageTaken || 0);
      if (remaining <= 0) {
        if (Neo.player.hp <= 0) Neo.die();
        return;
      }
      finalAmount = Math.min(finalAmount, remaining);
    }
    finalAmount = Math.max(0, finalAmount);
    if (finalAmount <= 0) {
      if (Neo.player.hp <= 0) Neo.die();
      return;
    }
    Neo.lastDamageSource = Neo.getDamageSourceLabel(source);
    Neo.lastDamageSourceKey = String(options.sourceKey || source || '');

    Neo.player.hp -= finalAmount;
    window.achievementEvents?.emit('damage:taken', { amount: finalAmount });

    if (Neo.getItemCount('insurance') > 0 && Neo.player.insuranceReady && hpBeforeHit > halfHpThreshold && Neo.player.hp <= halfHpThreshold) {
      Neo.player.hp = Math.max(Neo.player.hp, halfHpThreshold);
      Neo.consumeCharge('insurance');
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 0.8, text: 'INSURANCE USED', c: '#e6eeff' });
    }

    finalAmount = Math.max(0, hpBeforeHit - Neo.player.hp);
    if (finalAmount > 0) Neo.lowHealthHitFlashUntil = Date.now() + Neo.LOW_HEALTH_HIT_FLASH_MS;
    if (ironLungApplies) Neo.player.roomDamageTaken = (Neo.player.roomDamageTaken || 0) + finalAmount;

    if (finalAmount > 0 && itemStats.scarfBleedsOnHit > 0 && !options.noInvFrames) {
      Neo.applyBleed(Neo.player, itemStats.scarfBleedsOnHit, 4);
    }

    if (applyHitstop) {
      Neo.player.inv = 0.75;
      Neo.player.vx += Math.cos(angle) * knockback;
      Neo.player.vy += Math.sin(angle) * knockback;
      Neo.applyPlayerImpactStun(finalAmount, knockback);
      Neo.shake = 8;
      Neo.shakeT = 0.15;
    }
    if (showPopup && finalAmount >= 1) {
      spawnDamagePopup(Neo.player.x, Neo.player.y - 18, finalAmount, { color: '#ff6b6b', size: 16 });
    }
    if (window.NeoSettings?.shouldBloodOnHit?.() !== false && options.bloodOnHit !== false) {
      Neo.spawnBleedSpray?.(Neo.player, 1, 0.72);
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
        } else if (Neo.gameMode === 'coop' && (Neo.player2 || Neo.player3 || Neo.player4) && (!Neo.p2DeadInCoop || !Neo.p3DeadInCoop || !Neo.p4DeadInCoop)) {
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 1.2, text: 'P1 DOWN', c: '#ff6b6b' });
          Neo.player.hp = 0;
          Neo.p1DeadInCoop = true;
        } else {
          Neo.die();
        }
      }
    }
  }

  function tickPlayerStatus(key, dt, config) {
    const state = Neo.getStatusState(Neo.player, key);
    if (state.stacks <= 0) return;
    state.duration -= dt;
    state.tick -= dt;
    if (state.tick <= 0) {
      state.tick = config.interval;
      const damage = Math.max(0.25, config.damage(state.stacks));
      damagePlayer(damage, 0, 0, key, { ignoreInv: true, noInvFrames: true });
      if (Neo.nextRandom('fx') < 0.3) {
        Neo.spawnParticle({ x: Neo.player.x + Neo.rand(-8, 8), y: Neo.player.y + Neo.rand(-8, 8), life: 0.25, c: config.color });
      }
    }
    if (state.duration <= 0) Neo.clearStatus(Neo.player, key);
  }

  function updatePlayerStatuses(dt) {
    if (!Neo.player) return;
    Neo.player.critCharmBuffTime = Math.max(0, Number(Neo.player.critCharmBuffTime || 0) - dt);
    Neo.player.keenEyeBuffTime = Math.max(0, Number(Neo.player.keenEyeBuffTime || 0) - dt);
    Neo.player.chronoSpringBuffTime = Math.max(0, Number(Neo.player.chronoSpringBuffTime || 0) - dt);
    tickPlayerStatus('bleed', dt, {
      interval: 0.5,
      damage: stacks => 1.2 + stacks * 1.3,
      color: Neo.STATUS_STYLES.bleed.color,
    });
    tickPlayerStatus('fire', dt, {
      interval: 0.45,
      damage: stacks => 1 + stacks * 1.6,
      color: Neo.STATUS_STYLES.fire.color,
    });
    tickPlayerStatus('poison', dt, {
      interval: 0.7,
      damage: stacks => Neo.player.maxHp * (0.004 + stacks * 0.0025),
      color: Neo.STATUS_STYLES.poison.color,
    });
    tickPlayerStatus('dark_drain', dt, {
      interval: 0.6,
      damage: stacks => (1 + stacks * 1.7) * 0.1,
      color: Neo.STATUS_STYLES.dark_drain.color,
    });
  }

  function blastRadius(x, y, radius, damage, color, sourceEnemy = null) {
    spawnAoeShockwave(x, y, radius, color, damage >= 28 ? 'heavy' : 'normal');
    if (sourceEnemy && Neo.player && Neo.dist(x, y, Neo.player.x, Neo.player.y) <= radius + Neo.player.r) {
      damagePlayer(damage, Math.atan2(Neo.player.y - y, Neo.player.x - x), 200, sourceEnemy.type || 'enemy_aoe');
    }
    if (!sourceEnemy) hitPvpPlayer2InRadius(x, y, radius, damage, 200, 'pvp_p1_aoe');
    for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = Neo.enemies[index];
      if (!enemy) continue;
      if (sourceEnemy && enemy === sourceEnemy) continue;
      if (Neo.dist(x, y, enemy.x, enemy.y) > radius + enemy.r) continue;
      Neo.hitEnemy(enemy, damage, Math.atan2(enemy.y - y, enemy.x - x), 180, color);
    }
    Neo.destructibles.forEach(prop => {
      if (!prop.broken && !prop.hidden && Neo.dist(x, y, prop.x, prop.y) <= radius + prop.r) damageDestructible(prop, damage);
    });
  }

  function spawnAoeShockwave(x, y, radius, color = '#ff66cc', style = 'normal') {
    Neo.spawnParticle({
      x,
      y,
      life: Neo.AOE_SHOCKWAVE_LIFE,
      maxLife: Neo.AOE_SHOCKWAVE_LIFE,
      shockwave: true,
      radius,
      c: color,
      style,
    });
    const sparks = style === 'heavy' ? 12 : 7;
    for (let index = 0; index < sparks; index += 1) {
      const angle = (index / sparks) * Math.PI * 2 + Neo.rand(0.22, -0.22, 'fx');
      const speed = Neo.rand(170, 70, 'fx');
      Neo.spawnParticle({
        x: x + Math.cos(angle) * Math.min(radius * 0.3, 34),
        y: y + Math.sin(angle) * Math.min(radius * 0.3, 34),
        life: Neo.rand(0.34, 0.16, 'fx'),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        c: color,
        spark: true,
        size: style === 'heavy' ? 3.4 : 2.4,
      });
    }
  }

  function recordProjectileTrail(projectile, x, y) {
    if (!projectile) return;
    if (!Array.isArray(projectile.trail)) projectile.trail = [];
    projectile.trail.unshift({ x, y });
    const cap = projectile.kind === 'fireball' ? Neo.PROJECTILE_TRAIL_LENGTH + 2 : Neo.PROJECTILE_TRAIL_LENGTH;
    if (projectile.trail.length > cap) projectile.trail.length = cap;
  }

  function spawnProjectileImpact(projectile, x = projectile?.x, y = projectile?.y, options = {}) {
    if (!projectile || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const color = projectile.color || (projectile.enemy ? '#ff6688' : '#ffd7aa');
    const angle = Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1));
    const heavy = projectile.kind === 'fireball' || projectile.kind === 'magenta_degale' || projectile.kind === 'god_sword';
    Neo.spawnParticle({
      x,
      y,
      life: heavy ? 0.34 : 0.22,
      maxLife: heavy ? 0.34 : 0.22,
      impact: true,
      c: color,
      angle,
      size: Math.max(projectile.r || 4, heavy ? 9 : 5),
      enemy: !!projectile.enemy,
      kind: projectile.kind || 'shot',
      blocked: !!options.blocked,
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
    let best = null;
    let bestDist = radius;
    Neo.enemies.forEach(enemy => {
      if (!enemy) return;
      if (exclude.has(enemy)) return;
      const d = Neo.dist(x, y, enemy.x, enemy.y);
      if (d < bestDist) {
        best = enemy;
        bestDist = d;
      }
    });
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
      fromRival: false, source: null, statusEffects: null,
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
      fromRival: false, source: null, statusEffects: null, bouncesRemaining: 0,
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

  function spawnProjectile(props) {
    const p = _acquireProjectile();
    const enemyProjectile = !!(props.enemy ?? false);
    const itemStats = enemyProjectile ? {} : (Neo.getItemStats?.() || {});
    const projectileSpeedMultiplier = Math.max(0.1, Number(itemStats.projectileSpeedMultiplier || 1));
    p.x = props.x;
    p.y = props.y;
    p.vx = Number(props.vx || 0) * projectileSpeedMultiplier;
    p.vy = Number(props.vy || 0) * projectileSpeedMultiplier;
    p.r = props.r ?? 5;
    p.life = props.life ?? 1.2;
    p.damage = props.damage ?? 0;
    p.kind = props.kind ?? null;
    p.color = props.color ?? null;
    p.enemy = enemyProjectile;
    p.knockback = props.knockback ?? 0;
    p.pierceCount = props.pierceCount ?? 0;
    p.hitOptions = props.hitOptions ?? null;
    p.trail = props.trail ?? [];
    p.splash = props.splash ?? 0;
    p.splashDamage = props.splashDamage ?? 0;
    p.blockedSplashDamage = props.blockedSplashDamage ?? 0;
    p.fireStacks = props.fireStacks ?? 0;
    p.fireDuration = props.fireDuration ?? 0;
    p.homing = props.homing ?? false;
    p.homingTarget = props.homingTarget ?? null;
    p.homingSpeed = Number(props.homingSpeed ?? 0) * projectileSpeedMultiplier;
    p.homingAccel = props.homingAccel ?? 0;
    p.homingTurnRate = props.homingTurnRate ?? 0;
    p.homingRadius = props.homingRadius ?? 0;
    p.fromRival = props.fromRival ?? false;
    p.source = props.source ?? null;
    p.statusEffects = props.statusEffects ?? null;
    const defaultBounces = !enemyProjectile ? itemStats.projectileBounces : 0;
    p.bouncesRemaining = Math.max(0, Math.floor(Number((props.bouncesRemaining ?? defaultBounces) || 0)));
    Neo.projectiles.push(p);
  }

  function tryBounceProjectile(projectile, prevX, prevY) {
    const remaining = Math.floor(Number(projectile?.bouncesRemaining || 0));
    if (remaining <= 0) return false;
    const hitX = Neo.isBlocked(projectile.x, prevY, projectile.r);
    const hitY = Neo.isBlocked(prevX, projectile.y, projectile.r);
    const impactX = projectile.x;
    const impactY = projectile.y;
    projectile.x = prevX;
    projectile.y = prevY;
    projectile.bouncesRemaining = remaining - 1;
    if (hitX && !hitY) {
      projectile.vx *= -1;
    } else if (hitY && !hitX) {
      projectile.vy *= -1;
    } else {
      projectile.vx *= -1;
      projectile.vy *= -1;
    }
    spawnProjectileImpact(projectile, impactX, impactY, { blocked: true });
    const speed = Math.hypot(Number(projectile.vx || 0), Number(projectile.vy || 0)) || 1;
    const nudge = Math.max(2, Number(projectile.r || 0) * 0.6);
    projectile.x += (projectile.vx / speed) * nudge;
    projectile.y += (projectile.vy / speed) * nudge;
    return true;
  }

  function applyProjectileStatusEffectsToPlayer(projectile) {
    if (!Array.isArray(projectile?.statusEffects)) return;
    projectile.statusEffects.forEach(effect => {
      if (!effect?.key) return;
      if (Neo.nextRandom('encounter') <= Number(effect.chance ?? 1)) {
        Neo.applyStatus(Neo.player, effect.key, Number(effect.stacks || 1), Number(effect.duration || 3));
      }
    });
  }

  function updateProjectiles(dt) {
    for (let index = Neo.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = Neo.projectiles[index];
      if (!projectile) { Neo.projectiles.splice(index, 1); continue; }
      projectile.life -= dt;
      if (projectile.homing) {
        const speed = Math.hypot(Number(projectile.vx || 0), Number(projectile.vy || 0)) || Number(projectile.homingSpeed || 180);
        const currentAngle = Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1));
        let targetAngle = currentAngle;
        if (projectile.enemy && Neo.player) {
          targetAngle = Math.atan2(Neo.player.y - projectile.y, Neo.player.x - projectile.x);
        } else if (projectile.homingTarget === 'enemy') {
          const nearest = Neo.findNearestEnemy(projectile.x, projectile.y, Number(projectile.homingRadius || 960));
          if (nearest) targetAngle = Math.atan2(nearest.y - projectile.y, nearest.x - projectile.x);
        }
        const nextAngle = Neo.turnAngleToward(currentAngle, targetAngle, Number(projectile.homingTurnRate || 2) * dt);
        const nextSpeed = speed + (Number(projectile.homingSpeed || speed) - speed) * Number(projectile.homingAccel || 2.5) * dt;
        projectile.vx = Math.cos(nextAngle) * nextSpeed;
        projectile.vy = Math.sin(nextAngle) * nextSpeed;
      }
      const prevX = projectile.x;
      const prevY = projectile.y;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      recordProjectileTrail(projectile, prevX, prevY);
      const hitProp = Neo.destructibles.find(prop => !prop.broken && !prop.hidden && Neo.destructibleIntersectsCircle(prop, projectile.x, projectile.y, projectile.r));
      if (!projectile.enemy && hitProp) {
        damageDestructible(hitProp, projectile.damage || 1);
        if (projectile.kind === 'fireball') blastRadius(projectile.x, projectile.y, projectile.splash || 44, projectile.blockedSplashDamage || 16, '#ff8844');
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        _projectilePool.push(Neo.projectiles.splice(index, 1)[0]);
        continue;
      }
      if (projectile.life <= 0) {
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        _projectilePool.push(Neo.projectiles.splice(index, 1)[0]);
        continue;
      }
      if (Neo.isBlocked(projectile.x, projectile.y, projectile.r)) {
        if (tryBounceProjectile(projectile, prevX, prevY)) continue;
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        _projectilePool.push(Neo.projectiles.splice(index, 1)[0]);
        continue;
      }
      if (!projectile.enemy) {
        if (hitPvpPlayer2InRadius(projectile.x, projectile.y, projectile.r, projectile.damage || 16, projectile.knockback || 90, 'pvp_p1_projectile')) {
          if (projectile.kind === 'fireball') {
            blastRadius(projectile.x, projectile.y, projectile.splash || 44, projectile.splashDamage || 14, '#ff8844');
          }
          spawnProjectileImpact(projectile, projectile.x, projectile.y);
          _projectilePool.push(Neo.projectiles.splice(index, 1)[0]);
          continue;
        }
        const target = Neo.enemies.find(enemy => enemy && Neo.dist(projectile.x, projectile.y, enemy.x, enemy.y) <= projectile.r + enemy.r);
        if (target) {
          const hitAngle = Math.atan2(projectile.vy, projectile.vx);
          Neo.hitEnemy(
            target,
            projectile.damage || 16,
            hitAngle,
            projectile.knockback || 90,
            projectile.color || (projectile.kind === 'fireball' ? '#ff8844' : '#a857ff'),
            projectile.hitOptions || {}
          );
          if (projectile.kind === 'fireball') {
            Neo.applyFire(target, projectile.fireStacks || 2, projectile.fireDuration || 3);
            blastRadius(projectile.x, projectile.y, projectile.splash || 44, projectile.splashDamage || 14, '#ff8844');
            Neo.applyStatusInRadius(projectile.x, projectile.y, projectile.splash || 44, 'fire', 1, projectile.fireDuration || 3, null);
          }
          spawnProjectileImpact(projectile, projectile.x, projectile.y);
          if (projectile.pierceCount > 0) {
            projectile.pierceCount -= 1;
            projectile.x += projectile.vx * 0.03;
            projectile.y += projectile.vy * 0.03;
          } else {
            _projectilePool.push(Neo.projectiles.splice(index, 1)[0]);
          }
          continue;
        }
      } else if (Neo.dist(projectile.x, projectile.y, Neo.player.x, Neo.player.y) <= projectile.r + Neo.player.r) {
        damagePlayer(projectile.damage || 10, Math.atan2(projectile.vy, projectile.vx), projectile.knockback || 120, getProjectileDamageSource(projectile));
        applyProjectileStatusEffectsToPlayer(projectile);
        spawnProjectileImpact(projectile, projectile.x, projectile.y);
        _projectilePool.push(Neo.projectiles.splice(index, 1)[0]);
        continue;
      }
    }
  }

  function updateWorldProps(dt) {
    Neo.hazards.forEach(hazard => {
      if (hazard.ttl !== undefined) hazard.ttl -= dt;
      if (hazard.followPlayer) {
        hazard.x = Neo.player.x;
        hazard.y = Neo.player.y;
      }
      hazard.statusTick = Number(hazard.statusTick ?? 0) - dt;
      if (hazard.kind === 'lava' && Neo.dist(Neo.player.x, Neo.player.y, hazard.x, hazard.y) < hazard.r + Neo.player.r - 10 && Neo.player.lavaWalkTime <= 0) {
        damagePlayer(6 * dt, 0, 0, 'lava');
        if (hazard.statusTick <= 0) Neo.applyFire(Neo.player, 1, 2.6);
      }
      if (hazard.kind === 'explosive_trap') {
        if (!hazard.triggered) {
          const playerNear = Neo.dist(Neo.player.x, Neo.player.y, hazard.x, hazard.y) <= hazard.triggerRadius + Neo.player.r;
          const enemyNear = Neo.enemies.some(enemy => enemy && Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) <= hazard.triggerRadius + enemy.r);
          if (playerNear || enemyNear) {
            hazard.triggered = true;
            hazard.fuse = hazard.fuseDuration || 0.75;
            hazard.sparkTick = 0;
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
            if (Neo.dist(Neo.player.x, Neo.player.y, hazard.x, hazard.y) <= hazard.blastRadius + Neo.player.r) {
              const angle = Math.atan2(Neo.player.y - hazard.y, Neo.player.x - hazard.x);
              damagePlayer(hazard.damage || 18, angle, 220, 'explosive_trap');
            }
            blastRadius(hazard.x, hazard.y, hazard.blastRadius || 88, hazard.damage || 18, '#ff9a4d');
            hazard.ttl = 0;
          }
        }
      }
      if (hazard.kind === 'lava') {
        Neo.enemies.forEach(enemy => {
          if (!enemy) return;
          if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r - 6) return;
          if (hazard.statusTick <= 0) Neo.applyFire(enemy, 1, 2.8);
        });
        if (hazard.statusTick <= 0) hazard.statusTick = 0.45;
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
        if (Neo.dist(Neo.player.x, Neo.player.y, hazard.x, hazard.y) < hazard.r) {
          const before = Neo.player.hp;
          Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + Neo.scalePlayerHealing(7.36 * dt));
          const healed = Neo.player.hp - before;
          if (healed > 0) {
            hazard.healAccum = (hazard.healAccum || 0) + healed;
            hazard.healTick = (hazard.healTick ?? 0.24) - dt;
            if (hazard.healTick <= 0) {
              spawnHealPopup(Neo.player.x + Neo.rand(-10, 10), Neo.player.y - 22, hazard.healAccum);
              hazard.healAccum = 0;
              hazard.healTick = 0.24;
            }
          }
        }
        for (let ei = Neo.enemies.length - 1; ei >= 0; ei -= 1) {
          const enemy = Neo.enemies[ei];
          if (!enemy) continue;
          if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) < hazard.r + enemy.r) {
            enemy.hp -= (10 * dt) / Math.max(1, Number(enemy.defenseMultiplier || 1));
            if (enemy.hp <= 0) Neo.onEnemyDie(enemy);
          }
        }
      } else if (hazard.kind === 'fire_circle') {
        if (canHitPvpPlayer2() && Neo.dist(Neo.player2.x, Neo.player2.y, hazard.x, hazard.y) <= hazard.r + Neo.player2.r) {
          damagePvpPlayer2(Math.max(4, (hazard.dps || 16) * 0.35), hazard.x, hazard.y, 80, 'pvp_p1_fire_circle');
        }
        for (let ei = Neo.enemies.length - 1; ei >= 0; ei -= 1) {
          const enemy = Neo.enemies[ei];
          if (!enemy) continue;
          if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) continue;
          enemy.hp -= ((hazard.dps || 16) * dt) / Math.max(1, Number(enemy.defenseMultiplier || 1));
          if (hazard.statusTick <= 0) Neo.applyFire(enemy, 1, 2.8);
          enemy.stun = Math.max(enemy.stun, 0.05);
          if (Neo.nextRandom('fx') < 0.06) Neo.spawnParticle({ x: enemy.x + Neo.rand(-6, 6), y: enemy.y + Neo.rand(-6, 6), life: 0.3, c: '#ff8c3b' });
          if (enemy.hp <= 0) Neo.onEnemyDie(enemy);
        }
        if (hazard.statusTick <= 0) hazard.statusTick = 0.45;
      } else if (hazard.kind === 'grave_zone') {
        for (let ei = Neo.enemies.length - 1; ei >= 0; ei -= 1) {
          const enemy = Neo.enemies[ei];
          if (!enemy) continue;
          const dx = enemy.x - hazard.x;
          const dy = enemy.y - hazard.y;
          const dist = Math.hypot(dx, dy);
          if (dist > hazard.r + enemy.r || dist <= 0.001) continue;
          const push = Number(hazard.pushPower || 280) * Math.max(0.12, 1 - dist / (hazard.r + enemy.r));
          enemy.vx += (dx / dist) * push * dt;
          enemy.vy += (dy / dist) * push * dt;
          enemy.stun = Math.max(Number(enemy.stun || 0), 0.05);
          if (Neo.nextRandom('fx') < 0.15) {
            Neo.spawnParticle({ x: enemy.x + Neo.rand(-6, 6), y: enemy.y + Neo.rand(-6, 6), life: 0.24, c: '#c9b3ff' });
          }
        }
      } else if (hazard.kind === 'lightning_column') {
        hazard.tick -= dt;
        if (hazard.tick <= 0) {
          hazard.tick = hazard.interval || 0.45;
          if (hazard.enemy) {
            if (Neo.dist(Neo.player.x, Neo.player.y, hazard.x, hazard.y) <= hazard.r + Neo.player.r) {
              const angle = Math.atan2(Neo.player.y - hazard.y, Neo.player.x - hazard.x);
              damagePlayer(hazard.damage || 16, angle, 90, hazard.source || 'lightning_column');
            }
          } else {
            for (let ei = Neo.enemies.length - 1; ei >= 0; ei -= 1) {
              const enemy = Neo.enemies[ei];
              if (!enemy) continue;
              if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) continue;
              const angle = Math.atan2(enemy.y - hazard.y, enemy.x - hazard.x);
              Neo.hitEnemy(enemy, hazard.damage || 16, angle, 90, '#8dd4ff');
            }
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
    });
    Neo.hazards = Neo.hazards.filter(hazard => hazard.ttl === undefined || hazard.ttl > 0);
    Neo.syncCurrentRoomState();
  }

  function damageDestructible(prop, damage) {
    if (prop.broken) return;
    const dealt = Math.max(0, Math.round(damage || 0));
    if (dealt > 0) {
      spawnDamagePopup(prop.x, prop.y - prop.r - 8, dealt, {
        color: prop.kind === 'barrel' ? '#ff9f1c' : prop.reinforced ? '#b8c0ca' : '#ffd27d',
        size: 14,
        outline: prop.reinforced ? '#11151c' : '#2a1800',
      });
    }
    prop.hp -= damage;
    if (prop.hp > 0) return;
    prop.broken = true;
    if (prop.kind === 'pot') {
      const potRandom = Neo.createEntityRandom(prop, 'pot:reward');
      const itemChance = Neo.clamp(0.12 + Number(Neo.getItemStats?.()?.itemDropChanceBonus || 0), 0, 0.5);
      if (potRandom() < itemChance) Neo.pickups.push({ x: prop.x, y: prop.y, type: 'item', key: Neo.rollItemDrop({ random: potRandom }) });
      else Neo.dropCoins(prop.x, prop.y, 6 + Neo.floor);
    }
    if (prop.kind === 'barrel') {
      blastRadius(prop.x, prop.y, 130, 55, '#ff5a3d');
    }
    if (prop.kind === 'wall') {
      Neo.destructibles.forEach(other => {
        if (other.hidden) other.hidden = false;
      });
      for (let index = 0; index < 16; index += 1) {
        Neo.spawnParticle({
          x: prop.x + Neo.rand(22, -22, 'fx'),
          y: prop.y + Neo.rand(22, -22, 'fx'),
          life: Neo.rand(0.55, 0.22, 'fx'),
          vx: Neo.rand(110, -110, 'fx'),
          vy: Neo.rand(80, -110, 'fx'),
          c: index % 3 === 0 ? '#a09080' : '#c8bfb0',
          spark: true,
          size: Neo.rand(3.2, 1.8, 'fx'),
        });
      }
      Neo.spawnParticle({ x: prop.x, y: prop.y - 22, life: 0.75, text: 'CLEAR', c: '#d7f6ff' });
    }
    if (prop.kind === 'cover_wall') {
      const splinters = prop.reinforced ? 18 : 12;
      for (let index = 0; index < splinters; index += 1) {
        Neo.spawnParticle({
          x: prop.x + Neo.rand((prop.w || prop.r) * 0.42, -(prop.w || prop.r) * 0.42, 'fx'),
          y: prop.y + Neo.rand((prop.h || prop.r) * 0.42, -(prop.h || prop.r) * 0.42, 'fx'),
          life: Neo.rand(0.42, 0.18, 'fx'),
          vx: Neo.rand(90, -90, 'fx'),
          vy: Neo.rand(70, -95, 'fx'),
          c: prop.reinforced ? '#aeb5bd' : '#b87838',
          spark: true,
          size: prop.reinforced ? 2.2 : 2.8,
        });
      }
    }
    if (prop.kind === 'secret_wall') {
      const dir = prop.secretDir;
      if (dir) Neo.setSecretPassageOpen(Neo.currentRoom, dir, true);
      Neo.spawnParticle({ x: prop.x, y: prop.y - 18, life: 0.9, text: 'SECRET', c: '#8dd4ff' });
    }
  }

  function spawnDamagePopup(x, y, amount, opts = {}) {
    const value = Math.max(0, Math.round(amount || 0));
    if (value <= 0) return;
    const crit = !!opts.crit;
    const color = opts.color || (crit ? '#ff9f1c' : '#ff6b6b');
    const size = opts.size || (crit ? 20 : 16);
    Neo.spawnParticle({
      x,
      y,
      life: crit ? 0.62 : 0.46,
      text: `-${value}`,
      c: color,
      outline: opts.outline || '#120a00',
      size,
      vx: Neo.rand(-14, 14),
      vy: -36 - (crit ? 10 : 0),
    });
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
      if (Neo.dist(chest.x, chest.y, Neo.player.x, Neo.player.y) >= 36) return;
      chest.open = true;
      Neo.dropCoins(chest.x, chest.y, 12 + Neo.floor * 2);
      if ((chest.rewardType || 'item') === 'item') {
        Neo.pickups.push({ x: chest.x, y: chest.y - 20, type: 'item', key: chest.rewardKey || Neo.rollItemDrop({ random: Neo.createEntityRandom(chest, 'chest:fallback') }) });
      } else {
        Neo.pickups.push({ x: chest.x, y: chest.y - 20, type: 'potion' });
      }
      Neo.currentRoom.cleared = Neo.chests.every(item => item.open);
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
    const skipFloors = Math.max(1, Math.floor(Neo.floorSkipPending));
    const preferred = Neo.findSafePointNearTarget(Neo.player.x, Neo.player.y - 96, 24, 180, 20);
    const fallback = Neo.findSafePointNearTarget(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 24, 240, 20) || Neo.findSafeSpawnPoint();
    const spawnPoint = preferred || fallback;
    Neo.pickups.push({
      x: spawnPoint.x,
      y: spawnPoint.y,
      type: 'jesterPortal',
      skipFloors,
      spawnT: 0,
      activateAt: Neo.JESTER_PORTAL_ACTIVATE_DELAY,
      active: false,
    });
    Neo.floorSkipPending = 0;
    Neo.spawnParticle({ x: spawnPoint.x, y: spawnPoint.y, life: 0.5, ring: 28, c: '#ff8bd8' });
    Neo.spawnParticle({ x: spawnPoint.x, y: spawnPoint.y - 20, life: 0.8, text: 'CHAOS GATE', c: '#ffc2f0' });
    return true;
  }

  function useJesterPortal(pickup) {
    const skipFloors = Neo.clamp(Number(pickup?.skipFloors || 0), 1, Neo.MAX_FLOOR - Neo.floor);
    if (skipFloors <= 0) return false;
    Neo.floor = Math.min(Neo.MAX_FLOOR, Neo.floor + skipFloors);
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

  function updatePickups(dt = 0.016) {
    for (let index = Neo.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = Neo.pickups[index];
      if (!pickup || typeof pickup !== 'object' || typeof pickup.type !== 'string') {
        Neo.pickups.splice(index, 1);
        continue;
      }
      if (pickup.type === 'coin') {
        const magnetRadius = 110;
        const d = Neo.dist(pickup.x, pickup.y, Neo.player.x, Neo.player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 180 + (1 - d / magnetRadius) * 260;
          pickup.x += ((Neo.player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((Neo.player.y - pickup.y) / d) * 0.016 * pull;
        }
      } else if (pickup.type === 'potion') {
        const _potionCap = Neo.getPotionCarryCap();
        const _wantPotion = Neo.player.hp < Neo.player.maxHp
          || (_potionCap > 0 && Number(Neo.player.storedPotions || 0) < _potionCap && Neo.player.hp >= Neo.player.maxHp);
        if (_wantPotion) {
          const magnetRadius = 110;
          const d = Neo.dist(pickup.x, pickup.y, Neo.player.x, Neo.player.y);
          if (d < magnetRadius && d > 0.001) {
            const pull = 180 + (1 - d / magnetRadius) * 260;
            pickup.x += ((Neo.player.x - pickup.x) / d) * 0.016 * pull;
            pickup.y += ((Neo.player.y - pickup.y) / d) * 0.016 * pull;
          }
        }
      } else if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const magnetRadius = 124;
        const d = Neo.dist(pickup.x, pickup.y, Neo.player.x, Neo.player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 190 + (1 - d / magnetRadius) * 240;
          pickup.x += ((Neo.player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((Neo.player.y - pickup.y) / d) * 0.016 * pull;
        }
      } else if (pickup.type === 'item') {
        const magnetRadius = 145;
        const d = Neo.dist(pickup.x, pickup.y, Neo.player.x, Neo.player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 150 + (1 - d / magnetRadius) * 220;
          pickup.x += ((Neo.player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((Neo.player.y - pickup.y) / d) * 0.016 * pull;
        }
      } else if (pickup.type === 'jesterPortal') {
        pickup.spawnT = Math.max(0, Number(pickup.spawnT || 0) + dt);
        const activateAt = Math.max(0.01, Number(pickup.activateAt || Neo.JESTER_PORTAL_ACTIVATE_DELAY));
        if (!pickup.active && pickup.spawnT >= activateAt) {
          pickup.active = true;
          Neo.spawnParticle({ x: pickup.x, y: pickup.y - 16, life: 0.6, text: 'READY', c: '#ffc2f0' });
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
        pickup.x += pickup.vx * dt;
        pickup.y += pickup.vy * dt;
        if (pickup.x <= minX || pickup.x >= maxX) {
          pickup.x = Neo.clamp(pickup.x, minX, maxX);
          pickup.vx *= -1;
        }
        if (pickup.y <= minY || pickup.y >= maxY) {
          pickup.y = Neo.clamp(pickup.y, minY, maxY);
          pickup.vy *= -1;
        }
        const d = Neo.dist(pickup.x, pickup.y, Neo.player.x, Neo.player.y);
        if (d < 130 && d > 0.001) {
          const pull = 160 + (1 - d / 130) * 180;
          pickup.x += ((Neo.player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((Neo.player.y - pickup.y) / d) * 0.016 * pull;
        }
      }
      const pickupTriggerRadius = pickup.type === 'jesterPortal'
        ? Neo.JESTER_PORTAL_TRIGGER_RADIUS
        : pickup.type === 'ladder'
          ? Neo.LADDER_TRIGGER_RADIUS
          : 26;
      if (Neo.dist(pickup.x, pickup.y, Neo.player.x, Neo.player.y) >= pickupTriggerRadius) continue;

      if (pickup.type === 'coin') {
        addCoins(pickup.value || 1);
      }

      if (pickup.type === 'potion') {
        const potionCap = Neo.getPotionCarryCap();
        const stored = Number(Neo.player.storedPotions || 0);
        if (Neo.player.hp < Neo.player.maxHp) {
          const potionHeal = Neo.getPotionHealAmount();
          const before = Neo.player.hp;
          Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + potionHeal);
          const gained = Neo.player.hp - before;
          if (gained > 0) spawnHealPopup(Neo.player.x + Neo.rand(-10, 10), Neo.player.y - 20, gained);
        } else if (potionCap > 0 && stored < potionCap) {
          Neo.player.storedPotions = stored + 1;
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: `POTION STORED (${Neo.player.storedPotions}/${potionCap})`, c: '#a0e8ff' });
          Neo.updateHud();
        } else {
          continue;
        }
      }

      if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const heal = Neo.scalePlayerHealing(Math.max(10, Number(pickup.heal || 20)), 10);
        const before = Neo.player.hp;
        Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + heal);
        const actual = Neo.player.hp - before;
        if (actual > 0) {
          spawnHealPopup(Neo.player.x + Neo.rand(-8, 8), Neo.player.y - 22, actual, { color: '#79ff8f', size: 14 });
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 18, life: 0.55, text: `+${Math.ceil(actual)}`, c: '#79ff8f' });
        }
        const fruitRoom = Neo.getRoomByCoords(Number(pickup.roomGx ?? Neo.currentRoom?.gx), Number(pickup.roomGy ?? Neo.currentRoom?.gy)) || Neo.currentRoom;
        const node = fruitRoom?.gardenFruitNodes?.find(gardenNode => gardenNode && gardenNode.id === pickup.gardenNodeId);
        if (node) {
          node.respawnAt = Neo.gameElapsedTime + Neo.rand(22, 12, 'world');
          node.fruitSpawned = false;
        }
      }

      if (pickup.type === 'item') {
        Neo.collectItem(pickup.key);
        if (Neo.floorSkipPending > 0) {
          if (spawnJesterPortalPickup()) {
            Neo.pickups.splice(index, 1);
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

      if (pickup.type === 'jesterPortal') {
        if (!pickup.active) continue;
        if (useJesterPortal(pickup)) return;
        continue;
      }

      if (pickup.type === 'ladder') {
        const wantsToAscend = !!Neo.keys[' '];
        if (!wantsToAscend) {
          Neo.ladderUseKeyLatch = false;
          continue;
        }
        if (Neo.ladderUseKeyLatch) continue;
        Neo.ladderUseKeyLatch = true;
        if (Neo.isFirstRunTutorialActive()) Neo.tutorialState.usedLadder = true;
        Neo.floor = Math.min(Neo.MAX_FLOOR, Neo.floor + 1);
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
        const cost = Math.max(1, Number(pickup.cost || 1));
        const usesCoins = pickup.offerKind === 'xp';
        const crystals = Number(Neo.metaProgress.loopCrystals || 0);
        const coins = Number(Neo.player.coins || 0);
        const canAfford = usesCoins ? coins >= cost : crystals >= cost;
        const costLabel = usesCoins ? `${cost} C` : `${cost} LC`;
        if (pickup.bought) {
          Neo.pickups.splice(index, 1);
          continue;
        }
        if (!canAfford) {
          const now = Date.now();
          if (!pickup.lastDeniedAt || now - pickup.lastDeniedAt > 450) {
            Neo.spawnParticle({ x: pickup.x, y: pickup.y - 20, life: 0.85, text: costLabel, c: '#ffb1b1' });
            pickup.lastDeniedAt = now;
          }
          continue;
        }
        if (usesCoins) {
          if (!Neo.spendCoins(cost)) continue;
        } else {
          Neo.metaProgress.loopCrystals = crystals - cost;
        }
        pickup.bought = true;
        if (pickup.offerKind === 'relic') {
          Neo.collectItem(pickup.rewardKey || Neo.rollItemDrop({ elite: true, random: Neo.createEntityRandom(pickup, 'secret-vendor:fallback') }));
        } else if (pickup.offerKind === 'vitality') {
          Neo.player.maxHp += 20;
          Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + Neo.scalePlayerHealing(60, 20));
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: '+VIT', c: '#8dffbd' });
        } else if (pickup.offerKind === 'xp') {
          const xpValue = Math.max(1, Number(pickup.xpValue || Neo.getSecretXpOfferAmount()));
          Neo.grantXp(xpValue);
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: `+${xpValue} XP`, c: '#8dd4ff' });
        } else {
          addCoins(90 + Neo.floor * 12);
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: 'RICH', c: '#ffd966' });
        }
        Neo.persistMetaSoon();
      }

      if (pickup.type === 'secret_boss_chest') {
        Neo.pickups.splice(index, 1);
        Neo.collectItem(Neo.rollItemDrop({ elite: true, random: Neo.createEntityRandom(pickup, 'secret-boss:loot') }));
        addCoins(60 + Neo.floor * 8);
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

      if (pickup.type === 'challengeItemChoice') {
        if (Neo.chooseStillnessChallengeReward?.(pickup)) {
          Neo.syncCurrentRoomState();
          Neo.updateObjective();
          Neo.scheduleRunSave();
        }
        return;
      }

      if (pickup.type === 'challengeBomb') {
        if (pickup.safe) {
          Neo.completeChallengeTrial('BOMB DISARMED');
        } else {
          blastRadius(pickup.x, pickup.y, 76, 28 + Neo.floor * 2, '#ff7a66');
          Neo.spawnParticle({ x: pickup.x, y: pickup.y - 20, life: 0.75, text: 'WRONG', c: '#ff7a7a' });
          Neo.failChallengeTrial('WRONG BOMB');
        }
        Neo.pickups.splice(index, 1);
        Neo.scheduleRunSave();
        return;
      }

      if (pickup.type === 'challengeRune') {
        if (!Neo.currentRoom.challengeData) Neo.currentRoom.challengeData = {};
        Neo.currentRoom.challengeData.runesLeft = Math.max(0, Number(Neo.currentRoom.challengeData.runesLeft || 1) - 1);
        Neo.spawnParticle({ x: pickup.x, y: pickup.y - 18, life: 0.55, text: 'RUNE', c: '#8dd4ff' });
        if (Neo.currentRoom.challengeData.runesLeft <= 0) {
          Neo.completeChallengeTrial('RUNES CLAIMED');
        }
      }

      if (pickup.type === 'descend') {
        Neo.floor += 1;
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

      Neo.pickups.splice(index, 1);
      Neo.scheduleRunSave();
    }
  }

  function updateDeadBodies(dt) {
    for (let index = Neo.deadBodies.length - 1; index >= 0; index -= 1) {
      const body = Neo.deadBodies[index];
      body.age = Number(body.age || 0) + dt;
      if (body.age <= Number(body.fallTime || Neo.CORPSE_FALL_TIME)) {
        body.x += Number(body.vx || 0) * dt;
        body.y += Number(body.vy || 0) * dt;
        body.vx *= Math.max(0, 1 - 6.2 * dt);
        body.vy *= Math.max(0, 1 - 6.2 * dt);
      }
      if (body.age >= Number(body.life || Neo.CORPSE_LIFETIME)) Neo.deadBodies.splice(index, 1);
    }
  }

  const _PARTICLE_POOL_SIZE = 600;
  const _particlePool = [];
  for (let _pi = 0; _pi < _PARTICLE_POOL_SIZE; _pi += 1) {
    _particlePool.push({
      x: 0, y: 0, life: 0, c: null,
      vx: 0, vy: 0,
      text: null, size: null, outline: null,
      line: null, shockwave: null, impact: null, spark: null,
      blood: null, ring: null, style: null,
      maxLife: null, radius: null, angle: null,
    });
  }

  function _acquireParticle() {
    return _particlePool.length > 0 ? _particlePool.pop() : {
      x: 0, y: 0, life: 0, c: null,
      vx: 0, vy: 0,
      text: null, size: null, outline: null,
      line: null, shockwave: null, impact: null, spark: null,
      blood: null, ring: null, style: null,
      maxLife: null, radius: null, angle: null,
    };
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
    p.blood = props.blood ?? null;
    p.ring = props.ring ?? null;
    p.style = props.style ?? null;
    p.maxLife = props.maxLife ?? null;
    p.radius = props.radius ?? null;
    p.angle = props.angle ?? null;
    Neo.particles.push(p);
  }

  function updateParticles(dt) {
    // With reduceParticles: cull non-text particles to keep count low
    if (window.NeoSettings?.getAccess()?.reduceParticles) {
      const MAX_REDUCED = 24;
      if (Neo.particles.length > MAX_REDUCED) {
        for (let index = 0; index < Neo.particles.length && Neo.particles.length > MAX_REDUCED; index++) {
          if (!Neo.particles[index].text) {
            _particlePool.push(Neo.particles.splice(index, 1)[0]);
            index--;
          }
        }
      }
    }
    for (let index = Neo.particles.length - 1; index >= 0; index -= 1) {
      const particle = Neo.particles[index];
      particle.life -= dt;
      if (particle.blood) particle.vy = Math.min(220, Number(particle.vy || 0) + 390 * dt);
      if (particle.vx) particle.x += particle.vx * dt;
      if (particle.vy) particle.y += particle.vy * dt;
      if (particle.ring) particle.ring += 200 * dt;
      if (particle.life <= 0) {
        _particlePool.push(Neo.particles.splice(index, 1)[0]);
      }
    }
  }

  function isRoomLocked() {
    const challengeActive = !!Neo.currentRoom && Neo.CHALLENGE_ROOM_TYPES.has(Neo.currentRoom.type) && !!Neo.currentRoom.challengeStarted && !Neo.currentRoom.cleared;
    const baneActive = !!Neo.currentRoom && Neo.currentRoom.secret && Neo.currentRoom.secretKind === 'bowman_bane' && !!Neo.currentRoom.bossStarted && !Neo.currentRoom.cleared;
    return !!Neo.currentRoom
      && !Neo.currentRoom.cleared
      && (Neo.currentRoom.type === 'boss' || Neo.currentRoom.type === 'god' || Neo.currentRoom.type === 'ladder' || challengeActive || baneActive);
  }

  function updateTransitions(dt) {
    const challengeActive = !!Neo.currentRoom && Neo.CHALLENGE_ROOM_TYPES.has(Neo.currentRoom.type) && !!Neo.currentRoom.challengeStarted && !Neo.currentRoom.cleared;
    const canLeaveFight = Neo.enemies.length > 0
      && Neo.currentRoom
      && Neo.currentRoom.type !== 'boss'
      && Neo.currentRoom.type !== 'god'
      && Neo.currentRoom.type !== 'ladder'
      && !challengeActive;
    const roomLocked = isRoomLocked();
    if (!Neo.fading && !roomLocked && (Neo.enemies.length === 0 || canLeaveFight)) {
      const door =
        Neo.player.y < Neo.WALL + 24 && Neo.hasRoomExit(Neo.currentRoom, 'n') && Math.abs(Neo.player.x - Neo.ROOM_W / 2) < Neo.DOOR / 2 ? 'n' :
        Neo.player.y > Neo.ROOM_H - Neo.WALL - 24 && Neo.hasRoomExit(Neo.currentRoom, 's') && Math.abs(Neo.player.x - Neo.ROOM_W / 2) < Neo.DOOR / 2 ? 's' :
        Neo.player.x < Neo.WALL + 24 && Neo.hasRoomExit(Neo.currentRoom, 'w') && Math.abs(Neo.player.y - Neo.ROOM_H / 2) < Neo.DOOR / 2 ? 'w' :
        Neo.player.x > Neo.ROOM_W - Neo.WALL - 24 && Neo.hasRoomExit(Neo.currentRoom, 'e') && Math.abs(Neo.player.y - Neo.ROOM_H / 2) < Neo.DOOR / 2 ? 'e' :
        null;
      if (door) startTransition(door);
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
    Neo.getLivePlayerSlots().forEach(slot => {
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
    if (!Neo.isBlocked(doorX, doorY, r)) {
      Neo.player.x = doorX;
      Neo.player.y = doorY;
    }
    // Prevent one-frame camera lag that can look like room offset after fades/cutscenes.
    syncCamerasAfterTransition();
  }

  function returnToFloorOne() {
    Neo.floor = 1;
    Neo.gameElapsedTime = 0;
    Neo.refreshFloorChargeStates();
    Neo.runLoopIndex += 1;
    Neo.mooggyAssassinSpawnedThisRun = false;
    Neo.mooggyAssassinSpawnedThisFloor = false;
    window.achievementEvents?.emit('loop:completed', { loopIndex: Neo.runLoopIndex });
    Neo.syncSeedState();
    const crystalBonus = Math.max(0, Math.round(Neo.getActiveChallengeCrystalBonusMultiplier()));
    const titheBonus = Neo.hasLegacy('crystal_tithe') && Neo.HARD_DIFFICULTIES.has(Neo.selectedDifficulty) ? 1 : 0;
    Neo.metaProgress.loopCrystals = Number(Neo.metaProgress.loopCrystals || 0) + 1 + crystalBonus + titheBonus;
    if (crystalBonus > 0) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 42, life: 1.1, text: `+${crystalBonus} CHALLENGE LC`, c: '#8dd4ff' });
    }
    if (titheBonus > 0) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 56, life: 1.1, text: `+1 TITHE LC`, c: '#c9a8f0' });
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
    Neo.scheduleRunSave();
  }

  function addCoins(amount) {
    Neo.player.coins += amount;
    Neo.metaProgress.coins += amount;
    Neo.persistMetaSoon();
    window.achievementEvents?.emit('meta:coins', { total: Neo.metaProgress.coins });
  }

  // Expose on Neo
  Neo.updatePlayer2 = updatePlayer2;
  Neo.updatePlayerN = updatePlayerN;
  Neo.damagePlayerN = damagePlayerN;
  Neo.damagePlayer2 = damagePlayer2;
  Neo.hitPvpPlayer2InRadius = hitPvpPlayer2InRadius;
  Neo.hitPvpPlayer2WithBeamPath = hitPvpPlayer2WithBeamPath;
  Neo.pvpEndGame = pvpEndGame;
  Neo.damagePlayer = damagePlayer;
  Neo.tickPlayerStatus = tickPlayerStatus;
  Neo.updatePlayerStatuses = updatePlayerStatuses;
  Neo.blastRadius = blastRadius;
  Neo.spawnAoeShockwave = spawnAoeShockwave;
  Neo.recordProjectileTrail = recordProjectileTrail;
  Neo.spawnProjectileImpact = spawnProjectileImpact;
  Neo.findNearestEnemy = findNearestEnemy;
  Neo.updateProjectiles = updateProjectiles;
  Neo.updateWorldProps = updateWorldProps;
  Neo.damageDestructible = damageDestructible;
  Neo.spawnDamagePopup = spawnDamagePopup;
  Neo.spawnHealPopup = spawnHealPopup;
  Neo.updateChests = updateChests;
  Neo.canSpawnJesterPortal = canSpawnJesterPortal;
  Neo.spawnJesterPortalPickup = spawnJesterPortalPickup;
  Neo.useJesterPortal = useJesterPortal;
  Neo.updatePickups = updatePickups;
  Neo.updateDeadBodies = updateDeadBodies;
  Neo.spawnProjectile = spawnProjectile;
  Neo.spawnParticle = spawnParticle;
  Neo.updateParticles = updateParticles;
  Neo.isRoomLocked = isRoomLocked;
  Neo.updateTransitions = updateTransitions;
  Neo.stepActiveTransitionFade = stepActiveTransitionFade;
  Neo.startTransition = startTransition;
  Neo.snapCameraToEntity = snapCameraToEntity;
  Neo.syncCamerasAfterTransition = syncCamerasAfterTransition;
  Neo.doTransition = doTransition;
  Neo.returnToFloorOne = returnToFloorOne;
  Neo.addCoins = addCoins;
