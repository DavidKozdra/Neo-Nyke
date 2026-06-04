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
    // [TEMP DIAGNOSTIC — remove after fix]
    const __bossDiag = Neo.isBossFightActive();
    const __diag = (which) => {
      if (!__bossDiag) return;
      const is = Neo.getItemStats?.() || {};
      console.warn('[damagePlayer GUARD]', which, {
        godMode: sandbox?.godMode,
        gameMode: Neo.gameMode,
        gameState: Neo.gameState,
        inv: Neo.player.inv,
        blockActive: Neo.player.blockActive,
        princessFlightTime: Neo.player.princessFlightTime,
        hasIronLung: is.hasIronLung,
        isBossFightActive: __bossDiag,
        roomDamageTaken: Neo.player.roomDamageTaken,
        roomType: Neo.currentRoom?.type,
        amount, source,
      });
    };
    if (sandbox?.godMode) { __diag('godMode'); return; }
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
    if (!ignoreInv && Neo.player.inv > 0) { __diag('inv>0'); return; }
    if (Neo.player.blockActive && !options.ignoreBlock) {
      __diag('blockActive');
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
    // Cold (slow) stacks make the player brittle: scale down their effective
    // damage reduction so they take more damage per stack.
    const brittleDefenseMult = Neo.getBrittleDefenseMultiplier?.(Neo.player) ?? 1;
    const effectiveDamageReduction = (itemStats.damageReduction || 0) * brittleDefenseMult;
    let finalAmount = numericAmount * (Neo.isChallengeActive('glass_cannon') ? 1.35 : 1) * (1 - effectiveDamageReduction);
    if (sandbox) finalAmount *= sandbox.enemyDamageMultiplier;
    if (ironLungApplies) {
      finalAmount = Math.min(finalAmount, Neo.player.maxHp * 0.2);
    }
    finalAmount = Math.max(0, finalAmount);
    const barrierBeforeHit = Math.max(0, Number(Neo.player.overhealBarrier || 0));
    if (barrierBeforeHit > 0 && finalAmount > 0) {
      const absorbed = Math.min(barrierBeforeHit, finalAmount);
      Neo.player.overhealBarrier = Math.max(0, barrierBeforeHit - absorbed);
      finalAmount = Math.max(0, finalAmount - absorbed);
      if (absorbed >= 1 && showPopup) {
        spawnDamagePopup(Neo.player.x, Neo.player.y - 34, absorbed, { color: '#9cefff', size: 14 });
      }
      if (finalAmount <= 0) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 22, life: 0.34, text: 'BARRIER', c: '#9cefff' });
        if (applyHitstop) {
          Neo.player.inv = Math.max(Neo.player.inv, 0.18);
          Neo.shake = Math.max(Neo.shake, 3);
          Neo.shakeT = Math.max(Neo.shakeT, 0.08);
        }
        return;
      }
    }
    if (applyHitstop && !options.ignoreOneShotGuard && Neo.player.maxHp > 0) {
      const sourceKey = String(options.sourceKey || source || '').toLowerCase();
      const bossLike = Neo.isBossFightActive?.()
        || Neo.BOSS_TYPES?.has(sourceKey)
        || sourceKey.includes('boss')
        || sourceKey.includes('god')
        || sourceKey.includes('queen')
        || sourceKey.includes('artificer')
        || sourceKey.includes('golem');
      const maxHitRatio = bossLike ? 0.62 : 0.48;
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
      const resistance = key === 'bleed' ? Number(Neo.getItemStats?.()?.bleedResistance || 0) : 0;
      const damageMultiplier = Math.max(0.2, 1 - resistance);
      const damage = Math.max(0.25, config.damage(state.stacks) * damageMultiplier);
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
    // Cold (slow) deals no damage-over-time; it just slows + makes brittle, so
    // it isn't routed through tickPlayerStatus. Decay its duration here, else it
    // would never expire on the player.
    const coldState = Neo.getStatusState(Neo.player, 'slow');
    if (coldState.stacks > 0) {
      coldState.duration -= dt;
      coldState.tick -= dt;
      if (coldState.tick <= 0) {
        coldState.tick = 0.32;
        if (Neo.nextRandom('fx') < 0.3) {
          Neo.spawnParticle({ x: Neo.player.x + Neo.rand(-8, 8), y: Neo.player.y + Neo.rand(-8, 8), life: 0.25, c: Neo.STATUS_STYLES.slow.color });
        }
      }
      if (coldState.duration <= 0) Neo.clearStatus(Neo.player, 'slow');
    }
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
  // consumers below already honor the `...IndexFrame === Neo.frameId` cache;
  // these ensure-helpers let the per-frame update functions populate that cache
  // instead of rebuilding unconditionally.
  function ensureEnemySpatialIndex() {
    if (Neo.enemySpatialIndexFrame !== Neo.frameId || !Neo.enemySpatialIndex) {
      Neo.enemySpatialIndex = buildEnemySpatialIndex();
      Neo.enemySpatialIndexFrame = Neo.frameId;
    }
    return Neo.enemySpatialIndex;
  }

  // Force a fresh enemy index for the current frame. Used right after enemy
  // movement so projectile collision sees post-movement positions (any index
  // built earlier this frame, e.g. during enemy AI, predates that movement).
  function rebuildEnemySpatialIndex() {
    Neo.enemySpatialIndex = buildEnemySpatialIndex();
    Neo.enemySpatialIndexFrame = Neo.frameId;
    return Neo.enemySpatialIndex;
  }

  function ensureDestructibleSpatialIndex() {
    if (Neo.destructibleSpatialIndexFrame !== Neo.frameId || !Neo.destructibleSpatialIndex) {
      Neo.destructibleSpatialIndex = buildDestructibleSpatialIndex();
      Neo.destructibleSpatialIndexFrame = Neo.frameId;
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
      || (Neo.enemySpatialIndexFrame === Neo.frameId ? Neo.enemySpatialIndex : null)
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
      || (Neo.enemySpatialIndexFrame === Neo.frameId ? Neo.enemySpatialIndex : null)
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
      || (Neo.destructibleSpatialIndexFrame === Neo.frameId ? Neo.destructibleSpatialIndex : null)
      || buildDestructibleSpatialIndex();
    const bounds = getEnemyCellBounds(x - searchRadius, y - searchRadius, x + searchRadius, y + searchRadius);
    const seen = new Set();
    queryEnemyIndexCells(index, bounds, prop => {
      if (!prop || prop.broken || prop.hidden || seen.has(prop)) return;
      seen.add(prop);
      visitor(prop);
    });
  }

  function blastRadius(x, y, radius, damage, color, sourceEnemy = null) {
    spawnAoeShockwave(x, y, radius, color, damage >= 28 ? 'heavy' : 'normal');
    if (sourceEnemy && Neo.player && Neo.dist(x, y, Neo.player.x, Neo.player.y) <= radius + Neo.player.r) {
      damagePlayer(damage, Math.atan2(Neo.player.y - y, Neo.player.x - x), 200, sourceEnemy.type || 'enemy_aoe');
    }
    if (!sourceEnemy) hitPvpPlayer2InRadius(x, y, radius, damage, 200, 'pvp_p1_aoe');
    forEachEnemyNearCircle(x, y, radius, enemy => {
      if (Neo.dist(x, y, enemy.x, enemy.y) > radius + enemy.r) return;
      Neo.hitEnemy(enemy, damage, Math.atan2(enemy.y - y, enemy.x - x), 180, color);
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
    spawnAoeShockwave(x, y, radius, color, damage >= 28 ? 'heavy' : 'normal');
    Neo.spawnParticle({ x, y, life: 0.5, ring: radius, c: color });
    if (damage > 0 && Neo.player && Neo.dist(x, y, Neo.player.x, Neo.player.y) <= radius + Neo.player.r) {
      damagePlayer(damage, Math.atan2(Neo.player.y - y, Neo.player.x - x), Number(blast.knockback || 220), projectile.source || 'enemy_aoe');
      if (blast.statusKey) {
        Neo.applyStatus?.(Neo.player, blast.statusKey, Number(blast.statusStacks || 1), Number(blast.statusDuration || 3));
      }
    }
    forEachDestructibleNearCircle(x, y, radius + 80, prop => {
      if (!prop.broken && !prop.hidden && Neo.dist(x, y, prop.x, prop.y) <= radius + prop.r) {
        damageDestructible(prop, damage, { sourceX: x, sourceY: y, impactType: 'blast', force: 1.4 });
      }
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
      homingPath: null, homingPathTimer: 0,
      homingTargetRef: null, homingTargetTimer: 0,
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
    let difficulty = Neo.selectedDifficulty;
    
    let DifficultyMod = difficulty == "easy" ? 0.8 : difficulty == "hard" ? 1.2 : 1;

    if (props.speed) {
      props.speed = (props.speed || 0) * DifficultyMod;
    }
    const p = _acquireProjectile();
    const enemyProjectile = !!(props.enemy ?? false);
    const itemStats = enemyProjectile ? {} : (Neo.getItemStats?.() || {});
    const projectileSpeedMultiplier = Math.max(0.1, Number(itemStats.projectileSpeedMultiplier || 1)) * DifficultyMod;
    const projectileHomingStrength = Math.max(0, Number(itemStats.projectileHomingStrength || 0)) * DifficultyMod;
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
    p.maxLife = p.life;
    p.damage = props.damage ?? 0;
    p.kind = props.kind ?? null;
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
    p.statusEffects = props.statusEffects ?? null;
    p.enemyBlast = props.enemyBlast ?? null;
    const defaultBounces = !enemyProjectile ? itemStats.projectileBounces : 0;
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

  // Static (per-frame) blocker rects: walls + closed doors + structures. These do
  // not change between projectile updates within a frame, so build the list once
  // per frame instead of re-concatenating + re-pushing for every projectile.
  let _staticBlockerRects = [];
  let _staticBlockerRectsFrame = -1;
  // Reused output scratch array so per-projectile queries don't allocate.
  const _blockerRectScratch = [];

  function getStaticBlockerRects() {
    if (_staticBlockerRectsFrame === Neo.frameId) return _staticBlockerRects;
    const rects = Neo.walls.slice();
    if (typeof Neo.getClosedDoorBlockerRects === 'function') {
      const doors = Neo.getClosedDoorBlockerRects();
      for (let i = 0; i < doors.length; i += 1) rects.push(doors[i]);
    }
    Neo.structures.forEach(structure => {
      if (!structure || !Number.isFinite(structure.x) || !Number.isFinite(structure.y)) return;
      if (!Number.isFinite(structure.w) || !Number.isFinite(structure.h) || structure.w <= 0 || structure.h <= 0) return;
      rects.push({ x: structure.x - structure.w / 2, y: structure.y - structure.h / 2, w: structure.w, h: structure.h });
    });
    _staticBlockerRects = rects;
    _staticBlockerRectsFrame = Neo.frameId;
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
    const remaining = Math.floor(Number(projectile?.bouncesRemaining || 0));
    if (remaining <= 0 || !sweepHit) return false;
    projectile.bouncesRemaining = remaining - 1;
    const incomingVx = Number(projectile.vx || 0);
    const incomingVy = Number(projectile.vy || 0);
    const dot = incomingVx * sweepHit.normalX + incomingVy * sweepHit.normalY;
    projectile.vx = incomingVx - 2 * dot * sweepHit.normalX;
    projectile.vy = incomingVy - 2 * dot * sweepHit.normalY;
    projectile.x = sweepHit.x;
    projectile.y = sweepHit.y;
    spawnProjectileImpact(projectile, sweepHit.x, sweepHit.y, { blocked: true });
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
    if (projectile.enemy && Neo.player) return Neo.player;
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

  function updateProjectiles(dt) {
    rebuildEnemySpatialIndex();
    ensureDestructibleSpatialIndex();
    for (let index = Neo.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = Neo.projectiles[index];
      if (!projectile) { removeProjectileAt(index, false); continue; }
      projectile.life -= dt;
      if (projectile.homing) {
        const speed = Math.hypot(Number(projectile.vx || 0), Number(projectile.vy || 0)) || Number(projectile.homingSpeed || 180);
        const currentAngle = Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1));
        let targetAngle = currentAngle;
        const target = getProjectileHomingTarget(projectile, dt);
        if (target) {
          const aimPoint = getProjectileHomingAimPoint(projectile, target, dt) || target;
          targetAngle = Math.atan2(aimPoint.y - projectile.y, aimPoint.x - projectile.x);
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
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        removeProjectileAt(index);
        continue;
      }
      if (projectile.life <= 0) {
        detonateEnemyProjectileBlast(projectile, projectile.x, projectile.y);
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        removeProjectileAt(index);
        continue;
      }
      const sweepBlockHit = findProjectileSweepBlockHit(projectile, prevX, prevY);
      if (sweepBlockHit) {
        if (tryBounceProjectileAtSweepHit(projectile, sweepBlockHit)) continue;
        detonateEnemyProjectileBlast(projectile, sweepBlockHit.x, sweepBlockHit.y);
        spawnProjectileImpact(projectile, sweepBlockHit.x, sweepBlockHit.y, { blocked: true });
        removeProjectileAt(index);
        continue;
      }
      if (Neo.isBlocked(projectile.x, projectile.y, projectile.r)) {
        if (tryBounceProjectile(projectile, prevX, prevY)) continue;
        detonateEnemyProjectileBlast(projectile, projectile.x, projectile.y);
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
          const hitRadius = projectile.r + enemy.r;
          const dx = projectile.x - enemy.x;
          const dy = projectile.y - enemy.y;
          if (dx * dx + dy * dy <= hitRadius * hitRadius) target = enemy;
        });
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
          if (projectile.pierceCount > 0) {
            projectile.pierceCount -= 1;
            projectile.x += projectile.vx * 0.03;
            projectile.y += projectile.vy * 0.03;
          } else {
            removeProjectileAt(index);
          }
          continue;
        }
      } else {
        const hitRadius = projectile.r + Neo.player.r;
        const dx = projectile.x - Neo.player.x;
        const dy = projectile.y - Neo.player.y;
        if (dx * dx + dy * dy > hitRadius * hitRadius) continue;
        damagePlayer(projectile.damage || 10, Math.atan2(projectile.vy, projectile.vx), projectile.knockback || 120, getProjectileDamageSource(projectile));
        applyProjectileStatusEffectsToPlayer(projectile);
        detonateEnemyProjectileBlast(projectile, projectile.x, projectile.y);
        spawnProjectileImpact(projectile, projectile.x, projectile.y);
        removeProjectileAt(index);
        continue;
      }
    }
  }

  function updateWorldProps(dt) {
    ensureEnemySpatialIndex();
    if (Array.isArray(Neo.destructibles)) {
      Neo.destructibles.forEach(prop => {
        if (!prop) return;
        if (prop.hitFlash > 0) prop.hitFlash = Math.max(0, Number(prop.hitFlash || 0) - dt);
        if (prop.hitShake > 0) prop.hitShake = Math.max(0, Number(prop.hitShake || 0) - dt);
        if (prop.broken) prop.breakAge = Number(prop.breakAge || 0) + dt;
      });
    }
    Neo.hazards.forEach(hazard => {
      if (hazard.ttl !== undefined) hazard.ttl -= dt;
      if (hazard.followPlayer) {
        hazard.x = Neo.player.x;
        hazard.y = Neo.player.y;
      }
      hazard.statusTick = Number(hazard.statusTick ?? 0) - dt;
      if (hazard.kind === 'thorn_mine') {
        hazard.armTime = Math.max(0, Number(hazard.armTime || 0) - dt);
        if (hazard.armTime <= 0 && !hazard.triggered) {
          let target = null;
          forEachEnemyNearCircle(hazard.x, hazard.y, (hazard.triggerRadius || 34) + 80, enemy => {
            if (target) return;
            if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) <= (hazard.triggerRadius || 34) + enemy.r) target = enemy;
          });
          if (target) {
            hazard.triggered = true;
            const blast = Number(hazard.blastRadius || 62);
            forEachEnemyNearCircle(hazard.x, hazard.y, blast + 80, enemy => {
              if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) > blast + enemy.r) return;
              const angle = Math.atan2(enemy.y - hazard.y, enemy.x - hazard.x);
              Neo.hitEnemy(enemy, hazard.damage || 18, angle, 170, '#ff6e8b', {
                bleedChance: 1,
                bleedStacks: hazard.bleedStacks || 1,
                bleedDuration: hazard.bleedDuration || 4.5,
              });
            });
            Neo.spawnParticle({ x: hazard.x, y: hazard.y, life: 0.35, ring: blast, c: '#ff6e8b' });
            hazard.ttl = 0;
          }
        }
      }
      if (hazard.kind === 'lava' && Neo.player.lavaWalkTime <= 0) {
        const inside = hazard.shape === 'rect'
          ? Neo.circleRect(Neo.player.x, Neo.player.y, Neo.player.r - 6, hazard.left, hazard.top, hazard.w, hazard.h)
          : Neo.dist(Neo.player.x, Neo.player.y, hazard.x, hazard.y) < hazard.r + Neo.player.r - 10;
        if (inside) {
          damagePlayer(6 * dt, 0, 0, 'lava');
          if (hazard.statusTick <= 0) Neo.applyFire(Neo.player, 1, 2.6);
        }
      }
      if (hazard.kind === 'explosive_trap') {
        if (!hazard.triggered) {
          const playerNear = Neo.dist(Neo.player.x, Neo.player.y, hazard.x, hazard.y) <= hazard.triggerRadius + Neo.player.r;
          let enemyNear = false;
          forEachEnemyNearCircle(hazard.x, hazard.y, hazard.triggerRadius + 80, enemy => {
            if (enemyNear) return;
            enemyNear = Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) <= hazard.triggerRadius + enemy.r;
          });
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
        const applyLavaToEnemy = enemy => {
          const inside = hazard.shape === 'rect'
            ? Neo.circleRect(enemy.x, enemy.y, enemy.r - 4, hazard.left, hazard.top, hazard.w, hazard.h)
            : Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) <= hazard.r + enemy.r - 6;
          if (!inside) return;
          if (hazard.statusTick <= 0) Neo.applyFire(enemy, 1, 2.8);
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
          Neo.spawnParticle({ x: hazard.x, y: hazard.y, life: 0.28, ring: hazard.r + 10, c: '#ff3348' });
          if (hazard.enemy) {
            if (Neo.dist(Neo.player.x, Neo.player.y, hazard.x, hazard.y) <= hazard.r + Neo.player.r) {
              const angle = Math.atan2(Neo.player.y - hazard.y, Neo.player.x - hazard.x);
              damagePlayer(hazard.damage || 18, angle, 130, hazard.source || 'red_spikes');
              const statusKey = String(hazard.statusKey || 'bleed');
              const stacks = Math.max(1, Number(hazard.statusStacks || 1));
              const duration = Math.max(0.2, Number(hazard.statusDuration || (statusKey === 'fire' ? 2.8 : 3.4)));
              if (statusKey === 'fire') Neo.applyFire?.(Neo.player, stacks, duration);
              else Neo.applyStatus?.(Neo.player, statusKey, stacks, duration);
            }
          } else {
            forEachEnemyNearCircle(hazard.x, hazard.y, hazard.r + 80, enemy => {
              if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) return;
              const angle = Math.atan2(enemy.y - hazard.y, enemy.x - hazard.x);
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
        if (Neo.dist(Neo.player.x, Neo.player.y, hazard.x, hazard.y) < hazard.r) {
          const healed = Neo.applyPlayerHealing?.(Neo.scalePlayerHealing(7.36 * dt), { showBarrier: false }) ?? 0;
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
        forEachEnemyNearCircle(hazard.x, hazard.y, hazard.r + 80, enemy => {
          if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) < hazard.r + enemy.r) {
            enemy.hp -= (10 * dt) / Math.max(1, Number(enemy.defenseMultiplier || 1));
            if (enemy.hp <= 0) Neo.onEnemyDie(enemy);
          }
        });
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
      } else if (hazard.kind === 'grave_zone') {
        forEachEnemyNearCircle(hazard.x, hazard.y, hazard.r + 80, enemy => {
          const dx = enemy.x - hazard.x;
          const dy = enemy.y - hazard.y;
          const dist = Math.hypot(dx, dy);
          if (dist > hazard.r + enemy.r || dist <= 0.001) return;
          const push = Number(hazard.pushPower || 280) * Math.max(0.12, 1 - dist / (hazard.r + enemy.r));
          enemy.vx += (dx / dist) * push * dt;
          enemy.vy += (dy / dist) * push * dt;
          enemy.stun = Math.max(Number(enemy.stun || 0), 0.05);
          if (Neo.nextRandom('fx') < 0.15) {
            Neo.spawnParticle({ x: enemy.x + Neo.rand(-6, 6), y: enemy.y + Neo.rand(-6, 6), life: 0.24, c: '#c9b3ff' });
          }
        });
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
            forEachEnemyNearCircle(hazard.x, hazard.y, hazard.r + 80, enemy => {
              if (Neo.dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) return;
              const angle = Math.atan2(enemy.y - hazard.y, enemy.x - hazard.x);
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
      return Math.atan2(prop.y - Neo.player.y, prop.x - Neo.player.x);
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
      Neo.spawnParticle({ x: prop.x, y: prop.y, life: 0.32, ring: Math.min(58, radius + 18), c: material.dust });
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

    Neo.spawnParticle({ x: prop.x, y: prop.y, life: 0.24, ring: 22, c: '#fff2a8' });
    Neo.spawnParticle({ x: prop.x, y: prop.y, life: 0.34, ring: 58, c: '#ff9a3d' });
    Neo.spawnParticle({ x: prop.x, y: prop.y, life: 0.44, ring: radius * 0.72, c: '#ff4a28' });

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
    if (!Number.isFinite(prop.maxHp) || prop.maxHp <= 0) prop.maxHp = Math.max(1, Number(prop.hp || 0), dealt || 1);
    if (dealt > 0 && !isWallLikeDestructible(prop) && prop.kind !== 'barrel') {
      spawnDamagePopup(prop.x, prop.y - prop.r - 8, dealt, {
        color: prop.kind === 'barrel' ? '#ff9f1c' : prop.reinforced ? '#b8c0ca' : '#ffd27d',
        size: 14,
        outline: prop.reinforced ? '#11151c' : '#2a1800',
      });
    }
    if (dealt > 0) spawnDestructibleHitFx(prop, dealt, hit);
    prop.hp -= numericDamage;
    if (prop.hp > 0) return;
    prop.broken = true;
    prop.breakAge = 0;
    prop.breakAngle = getDestructibleImpactAngle(prop, hit);
    if (prop.kind === 'barrel') spawnBarrelExplosionFx(prop, hit);
    else spawnDestructibleBreakFx(prop, hit);
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
      const revealGroup = prop.revealGroup;
      Neo.destructibles.forEach(other => {
        if (!other.hidden) return;
        if (revealGroup && other.revealGroup === revealGroup) {
          other.hidden = false;
          return;
        }
        if (!revealGroup && Neo.dist(other.x, other.y, prop.x, prop.y) <= 220) other.hidden = false;
      });
      Neo.spawnParticle({ x: prop.x, y: prop.y - 22, life: 0.75, text: 'CLEAR', c: '#d7f6ff' });
    }
    if (prop.kind === 'secret_wall') {
      const dir = prop.secretDir;
      if (dir) Neo.setSecretPassageOpen(Neo.currentRoom, dir, true);
      Neo.spawnParticle({ x: prop.x, y: prop.y - 18, life: 0.9, text: 'SECRET', c: '#8dd4ff' });
    }
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

  function removePickupAt(index) {
    return Neo.unorderedRemoveAt(Neo.pickups, index);
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
    const itemStats = Neo.getItemStats?.() || {};
    const autoVacuumRange = Math.max(0, Number(itemStats.pickupVacuumRange || 0));
    const coinPickupMultiplier = Math.max(1, Number(itemStats.coinPickupMultiplier || 1));
    const potionDoubleChance = Neo.clamp(Number(itemStats.potionDoubleChance || 0), 0, 1);
    const playerX = Neo.player.x;
    const playerY = Neo.player.y;
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
      if (pickup.type === 'coin') {
        const magnetRadius = autoVacuumRange > 0 ? autoVacuumRange : 110;
        pullPickupTowardPlayer(pickup, magnetRadius, 180, 260);
      } else if (pickup.type === 'potion') {
        const _potionCap = Neo.getPotionCarryCap();
        const _wantPotion = Neo.player.hp < Neo.player.maxHp
          || (_potionCap > 0 && Number(Neo.player.storedPotions || 0) < _potionCap && Neo.player.hp >= Neo.player.maxHp);
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
        pullPickupTowardPlayer(pickup, 130, 160, 180);
      }
      const pickupTriggerRadius = pickup.type === 'jesterPortal'
        ? Neo.JESTER_PORTAL_TRIGGER_RADIUS
        : pickup.type === 'ladder'
          ? Neo.LADDER_TRIGGER_RADIUS
          : 26;
      const triggerDx = pickup.x - playerX;
      const triggerDy = pickup.y - playerY;
      if (triggerDx * triggerDx + triggerDy * triggerDy >= pickupTriggerRadius * pickupTriggerRadius) continue;

      if (pickup.type === 'coin') {
        addCoins(Math.round((pickup.value || 1) * coinPickupMultiplier));
      }

      if (pickup.type === 'potion') {
        const potionCap = Neo.getPotionCarryCap();
        const stored = Number(Neo.player.storedPotions || 0);
        const doubled = potionDoubleChance > 0 && Neo.rng() < potionDoubleChance;
        const potionApplications = doubled ? 2 : 1;
        if (Neo.player.hp < Neo.player.maxHp) {
          const potionHeal = Neo.getPotionHealAmount() * potionApplications;
          const gained = Neo.applyPlayerHealing?.(potionHeal) ?? 0;
          if (gained > 0) spawnHealPopup(Neo.player.x + Neo.rand(-10, 10), Neo.player.y - 20, gained);
          if (doubled) Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 34, life: 0.7, text: 'DOUBLE POTION', c: '#9af7d8' });
        } else if (potionCap > 0 && stored < potionCap) {
          const storedGain = Math.min(potionApplications, potionCap - stored);
          Neo.player.storedPotions = stored + storedGain;
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: `POTION STORED (${Neo.player.storedPotions}/${potionCap})`, c: '#a0e8ff' });
          if (doubled && storedGain > 1) Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 36, life: 0.7, text: 'DOUBLE POTION', c: '#9af7d8' });
          Neo.updateHud();
        } else {
          continue;
        }
      }

      if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const heal = Neo.scalePlayerHealing(Math.max(10, Number(pickup.heal || 20)), 10);
        const actual = Neo.applyPlayerHealing?.(heal) ?? 0;
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
          removePickupAt(index);
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
          Neo.applyPlayerHealing?.(Neo.scalePlayerHealing(60, 20));
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
        removePickupAt(index);
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
      blood: null, ring: null, style: null,
      maxLife: null, radius: null, angle: null,
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
      blood: null, ring: null, style: null,
      maxLife: null, radius: null, angle: null,
      silhouette: null,
      _active: false, _particleList: null, _dmgOwner: null, _dmgTotal: 0, _dmgCrit: false,
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
    p.smoke = props.smoke ?? null;
    p.blood = props.blood ?? null;
    p.ring = props.ring ?? null;
    p.style = props.style ?? null;
    p.maxLife = props.maxLife ?? null;
    p.radius = props.radius ?? null;
    p.angle = props.angle ?? null;
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
      if (particle.vx) particle.x += particle.vx * dt;
      if (particle.vy) particle.y += particle.vy * dt;
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
  Neo.buildEnemySpatialIndex = buildEnemySpatialIndex;
  Neo.forEachEnemyNearCircle = forEachEnemyNearCircle;
  Neo.forEachEnemyNearRect = forEachEnemyNearRect;
  Neo.forEachDestructibleNearCircle = forEachDestructibleNearCircle;
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
