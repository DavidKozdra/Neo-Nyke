  function updatePlayer2(dt) {
    if (!player2) return;
    const _gp1 = window.NeoGamepad?.[1];
    const _gp1Active = !!_gp1?.active;
    let p2MoveX = (keys['l'] ? 1 : 0) - (keys['j'] ? 1 : 0);
    let p2MoveY = (keys['k'] ? 1 : 0) - (keys['i'] ? 1 : 0);
    if (_gp1Active) {
      if (Math.abs(_gp1.moveX) > 0.18 || Math.abs(_gp1.moveY) > 0.18) {
        p2MoveX = _gp1.moveX; p2MoveY = _gp1.moveY;
      }
    }
    const p2Len = Math.hypot(p2MoveX, p2MoveY) || 1;
    const p2NX = p2Len > 0.1 ? p2MoveX / p2Len : 0;
    const p2NY = p2Len > 0.1 ? p2MoveY / p2Len : 0;
    if (player2.dashTime > 0) {
      player2.dashTime = Math.max(0, player2.dashTime - dt);
      player2.vx = player2.dashX;
      player2.vy = player2.dashY;
      player2.inv = Math.max(player2.inv, 0.12);
      if (player2.dashTime <= 0) { player2.dashX = 0; player2.dashY = 0; }
    } else {
      const targetSpeed = 228;
      player2.vx = applyResponsiveVelocity(player2.vx, p2NX * targetSpeed, dt);
      player2.vy = applyResponsiveVelocity(player2.vy, p2NY * targetSpeed, dt);
    }
    moveCircle(player2, dt);
    player2.inv = Math.max(0, player2.inv - dt);
    if (player2.swing > 0) player2.swing = Math.max(0, player2.swing - dt);
    // P2 melee: U key
    if ((keys['u'] || _gp1Active && _gp1.p2MeleeHeld) && !player2.meleeLatch && player2.swing <= 0) {
      player2.meleeLatch = true;
      const aimAngle = Math.atan2(player2.vy || 1, player2.vx || 1);
      player2.swing = ATTACKS.melee.active;
      player2.swingA = aimAngle;
      for (const enemy of enemies) {
        const dx = enemy.x - player2.x;
        const dy = enemy.y - player2.y;
        const dist2 = Math.hypot(dx, dy);
        if (dist2 > ATTACKS.melee.range + enemy.r + 4) continue;
        const a = Math.atan2(dy, dx);
        const diff = Math.abs(((a - aimAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (diff > ATTACKS.melee.arc) continue;
        const dmg = Math.max(1, ATTACKS.melee.damage);
        hitEnemy(enemy, dmg, a, ATTACKS.melee.push, '#4ca8ff');
      }
    } else if (!keys['u'] && !(_gp1Active && _gp1.p2MeleeHeld)) {
      player2.meleeLatch = false;
    }
    // P2 dash: semicolon key
    if ((keys[';'] || _gp1Active && _gp1.p2DashHeld) && !player2.dashLatch && player2.dashTime <= 0) {
      player2.dashLatch = true;
      const angle = p2Len > 0.1 ? Math.atan2(p2NY, p2NX) : 0;
      player2.dashTime = 0.16;
      player2.dashX = Math.cos(angle) * 480;
      player2.dashY = Math.sin(angle) * 480;
      player2.vx = player2.dashX;
      player2.vy = player2.dashY;
      player2.inv = Math.max(player2.inv, 0.18);
    } else if (!keys[';'] && !(_gp1Active && _gp1.p2DashHeld)) {
      player2.dashLatch = false;
    }
    // PVP: P2 melee hits P1
    if (gameMode === 'pvp' && player && player.inv <= 0 && player2.swing > 0) {
      const pvpDx = player.x - player2.x;
      const pvpDy = player.y - player2.y;
      const pvpDist = Math.hypot(pvpDx, pvpDy);
      if (pvpDist < ATTACKS.melee.range + player.r + 4) {
        const pvpAngle = Math.atan2(player2.vy || 0, player2.vx || 1);
        const pvpHitAngle = Math.atan2(pvpDy, pvpDx);
        const pvpDiff = Math.abs(((pvpHitAngle - pvpAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (pvpDiff <= ATTACKS.melee.arc) {
          const pvpDmg = Math.max(1, ATTACKS.melee.damage);
          damagePlayer(pvpDmg, Math.atan2(pvpDy, pvpDx), ATTACKS.melee.push, 'pvp_p2', { ignoreInv: false });
        }
      }
    }
    // Enemy collision damage for P2
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dx = player2.x - enemy.x;
      const dy = player2.y - enemy.y;
      if (Math.hypot(dx, dy) < player2.r + enemy.r + 2 && player2.inv <= 0) {
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
      pn.vx = applyResponsiveVelocity(pn.vx, nX * 228, dt);
      pn.vy = applyResponsiveVelocity(pn.vy, nY * 228, dt);
    }
    moveCircle(pn, dt);
    pn.inv = Math.max(0, pn.inv - dt);
    if (pn.swing > 0) pn.swing = Math.max(0, pn.swing - dt);
    if (_gpN && _gpN.p2MeleeHeld && !pn.meleeLatch && pn.swing <= 0) {
      pn.meleeLatch = true;
      const aimAngle = Math.atan2(pn.vy || 0, pn.vx || 1);
      pn.swing = ATTACKS.melee.active; pn.swingA = aimAngle;
      for (const enemy of enemies) {
        if (enemy.dead) continue;
        const dx = enemy.x - pn.x, dy = enemy.y - pn.y;
        if (Math.hypot(dx, dy) > ATTACKS.melee.range + enemy.r + 4) continue;
        const a = Math.atan2(dy, dx);
        if (Math.abs(((a - aimAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI) <= ATTACKS.melee.arc)
          hitEnemy(enemy, Math.max(1, ATTACKS.melee.damage), a, ATTACKS.melee.push, '#a8d8ff');
      }
    } else if (!(_gpN && _gpN.p2MeleeHeld)) { pn.meleeLatch = false; }
    if (_gpN && _gpN.p2DashHeld && !pn.dashLatch && pn.dashTime <= 0) {
      pn.dashLatch = true;
      const angle = len > 0.1 ? Math.atan2(nY, nX) : 0;
      pn.dashTime = 0.16; pn.dashX = Math.cos(angle) * 480; pn.dashY = Math.sin(angle) * 480;
      pn.vx = pn.dashX; pn.vy = pn.dashY; pn.inv = Math.max(pn.inv, 0.18);
    } else if (!(_gpN && _gpN.p2DashHeld)) { pn.dashLatch = false; }
    for (const enemy of enemies) {
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
      if (n === 3) p3DeadInCoop = true;
      if (n === 4) p4DeadInCoop = true;
      particles.push({ x: pn.x, y: pn.y - 30, life: 1.2, text: `P${n} DOWN`, c: '#a8d8ff' });
      if (p1DeadInCoop && p2DeadInCoop && p3DeadInCoop && p4DeadInCoop) die();
    }
  }

  function damagePlayer2(amount, angle, knockback, source = '') {
    if (!player2 || p2DeadInCoop) return;
    if (player2.inv > 0) return;
    player2.hp -= amount;
    player2.vx += Math.cos(angle) * knockback;
    player2.vy += Math.sin(angle) * knockback;
    player2.inv = 0.75;
    spawnDamagePopup(player2.x, player2.y - 18, amount, { color: '#4ca8ff', size: 16 });
    if (player2.hp <= 0) {
      player2.hp = 0;
      if (gameMode === 'pvp' && pvpState) {
        pvpState.p1Kills = (pvpState.p1Kills || 0) + 1;
        particles.push({ x: player2.x, y: player2.y - 30, life: 1.5, text: `P1 KILL ${pvpState.p1Kills}/${pvpState.killsToWin}`, c: '#ff6b6b' });
        if (pvpState.p1Kills >= pvpState.killsToWin) {
          pvpEndGame('P1');
        } else {
          setTimeout(() => { if (player2) { player2.hp = player2.maxHp; player2.x = START_X + 80; player2.y = START_Y + 40; player2.inv = 1; } }, 1500);
        }
      } else {
        p2DeadInCoop = true;
        particles.push({ x: player2.x, y: player2.y - 30, life: 1.2, text: 'P2 DOWN', c: '#4ca8ff' });
        if (p1DeadInCoop && p2DeadInCoop && p3DeadInCoop && p4DeadInCoop) die();
      }
    }
  }

  function pvpEndGame(winner) {
    pvpState = null;
    player2 = null;
    const p2Row = document.getElementById('p2HpRow');
    if (p2Row) p2Row.style.display = 'none';
    particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 40, life: 4, text: `${winner} WINS!`, c: winner === 'P1' ? '#ff6b6b' : '#4ca8ff' });
    setTimeout(() => { die(); }, 3000);
  }

  function damagePlayer(amount, angle, knockback, source = '', options = {}) {
    const sandbox = getActiveSandboxSettings();
    if (sandbox?.godMode) return;
    const ignoreInv = !!options.ignoreInv;
    const applyHitstop = !options.noInvFrames;
    const showPopup = options.showPopup !== false;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      if (!Number.isFinite(numericAmount)) console.warn('Ignored invalid player damage', { amount, source });
      return;
    }
    if (!Number.isFinite(Number(player.maxHp)) || Number(player.maxHp) <= 0) player.maxHp = 120;
    if (!Number.isFinite(Number(player.hp))) player.hp = player.maxHp;
    if (!ignoreInv && player.inv > 0) return;
    if (player.blockActive && !options.ignoreBlock) {
      particles.push({ x: player.x, y: player.y - 20, life: 0.3, text: 'BLOCK', c: '#9cefff' });
      return;
    }
    if (isChallengeActive('no_hit')) {
      lastDamageSource = getDamageSourceLabel(source || 'no_hit');
      lastDamageSourceKey = String(source || 'no_hit');
      player.hp = 0;
      player.inv = 0;
      shake = 10;
      shakeT = 0.18;
      particles.push({ x: player.x, y: player.y - 24, life: 0.95, text: 'HIT RUN FAILED', c: '#ff7a88' });
      die();
      return;
    }
    const itemStats = getItemStats();
    const hpBeforeHit = player.hp;
    const halfHpThreshold = player.maxHp * 0.5;
    const ironLungApplies = itemStats.hasIronLung && !isBossFightActive();
    let finalAmount = numericAmount * (isChallengeActive('glass_cannon') ? 1.35 : 1) * (1 - (itemStats.damageReduction || 0));
    if (sandbox) finalAmount *= sandbox.enemyDamageMultiplier;
    if (ironLungApplies) {
      const roomCap = player.maxHp * 0.2;
      const remaining = roomCap - (player.roomDamageTaken || 0);
      if (remaining <= 0) {
        if (player.hp <= 0) die();
        return;
      }
      finalAmount = Math.min(finalAmount, remaining);
    }
    finalAmount = Math.max(0, finalAmount);
    if (finalAmount <= 0) {
      if (player.hp <= 0) die();
      return;
    }
    lastDamageSource = getDamageSourceLabel(source);
    lastDamageSourceKey = String(source || '');

    player.hp -= finalAmount;
    achievementEvents.emit('damage:taken', { amount: finalAmount });

    if (getItemCount('insurance') > 0 && player.insuranceReady && hpBeforeHit > halfHpThreshold && player.hp <= halfHpThreshold) {
      player.hp = Math.max(player.hp, halfHpThreshold);
      consumeCharge('insurance');
      particles.push({ x: player.x, y: player.y - 30, life: 0.8, text: 'INSURANCE USED', c: '#e6eeff' });
    }

    finalAmount = Math.max(0, hpBeforeHit - player.hp);
    if (finalAmount > 0) lowHealthHitFlashUntil = Date.now() + LOW_HEALTH_HIT_FLASH_MS;
    if (ironLungApplies) player.roomDamageTaken = (player.roomDamageTaken || 0) + finalAmount;

    if (applyHitstop) {
      player.inv = 0.75;
      player.vx += Math.cos(angle) * knockback;
      player.vy += Math.sin(angle) * knockback;
      applyPlayerImpactStun(finalAmount, knockback);
      shake = 8;
      shakeT = 0.15;
    }
    if (showPopup && finalAmount >= 1) {
      spawnDamagePopup(player.x, player.y - 18, finalAmount, { color: '#ff6b6b', size: 16 });
    }
    if (player.hp <= 0) {
      if (gameMode === 'practice') {
        player.hp = player.maxHp;
        particles.push({ x: player.x, y: player.y - 30, life: 0.9, text: 'PRACTICE — NO DEATH', c: '#a880ff' });
      } else {
        if (gameMode === 'pvp' && pvpState && player2) {
          pvpState.p2Kills = (pvpState.p2Kills || 0) + 1;
          particles.push({ x: player.x, y: player.y - 30, life: 1.5, text: `P2 KILL ${pvpState.p2Kills}/${pvpState.killsToWin}`, c: '#4ca8ff' });
          if (pvpState.p2Kills >= pvpState.killsToWin) {
            player.hp = 0;
            pvpEndGame('P2');
          } else {
            player.hp = player.maxHp;
            player.x = START_X - 80; player.y = START_Y - 40;
            player.inv = 1;
          }
        } else if (gameMode === 'coop' && (player2 || player3 || player4) && (!p2DeadInCoop || !p3DeadInCoop || !p4DeadInCoop)) {
          particles.push({ x: player.x, y: player.y - 30, life: 1.2, text: 'P1 DOWN', c: '#ff6b6b' });
          player.hp = 0;
          p1DeadInCoop = true;
        } else {
          die();
        }
      }
    }
  }

  function tickPlayerStatus(key, dt, config) {
    const state = getStatusState(player, key);
    if (state.stacks <= 0) return;
    state.duration -= dt;
    state.tick -= dt;
    if (state.tick <= 0) {
      state.tick = config.interval;
      const damage = Math.max(0.25, config.damage(state.stacks));
      damagePlayer(damage, 0, 0, key, { ignoreInv: true, noInvFrames: true });
      if (nextRandom('fx') < 0.3) {
        particles.push({ x: player.x + rand(-8, 8), y: player.y + rand(-8, 8), life: 0.25, c: config.color });
      }
    }
    if (state.duration <= 0) clearStatus(player, key);
  }

  function updatePlayerStatuses(dt) {
    if (!player) return;
    player.critCharmBuffTime = Math.max(0, Number(player.critCharmBuffTime || 0) - dt);
    player.keenEyeBuffTime = Math.max(0, Number(player.keenEyeBuffTime || 0) - dt);
    player.chronoSpringBuffTime = Math.max(0, Number(player.chronoSpringBuffTime || 0) - dt);
    tickPlayerStatus('bleed', dt, {
      interval: 0.5,
      damage: stacks => 1.2 + stacks * 1.3,
      color: STATUS_STYLES.bleed.color,
    });
    tickPlayerStatus('fire', dt, {
      interval: 0.45,
      damage: stacks => 1 + stacks * 1.6,
      color: STATUS_STYLES.fire.color,
    });
    tickPlayerStatus('poison', dt, {
      interval: 0.7,
      damage: stacks => player.maxHp * (0.004 + stacks * 0.0025),
      color: STATUS_STYLES.poison.color,
    });
    tickPlayerStatus('dark_drain', dt, {
      interval: 0.6,
      damage: stacks => (1 + stacks * 1.7) * 0.1,
      color: STATUS_STYLES.dark_drain.color,
    });
  }

  function blastRadius(x, y, radius, damage, color, sourceEnemy = null) {
    spawnAoeShockwave(x, y, radius, color, damage >= 28 ? 'heavy' : 'normal');
    if (sourceEnemy && player && dist(x, y, player.x, player.y) <= radius + player.r) {
      damagePlayer(damage, Math.atan2(player.y - y, player.x - x), 200, sourceEnemy.type || 'enemy_aoe');
    }
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      if (sourceEnemy && enemy === sourceEnemy) continue;
      if (dist(x, y, enemy.x, enemy.y) > radius + enemy.r) continue;
      hitEnemy(enemy, damage, Math.atan2(enemy.y - y, enemy.x - x), 180, color);
    }
    destructibles.forEach(prop => {
      if (!prop.broken && !prop.hidden && dist(x, y, prop.x, prop.y) <= radius + prop.r) damageDestructible(prop, damage);
    });
  }

  function spawnAoeShockwave(x, y, radius, color = '#ff66cc', style = 'normal') {
    particles.push({
      x,
      y,
      life: AOE_SHOCKWAVE_LIFE,
      maxLife: AOE_SHOCKWAVE_LIFE,
      shockwave: true,
      radius,
      c: color,
      style,
    });
    const sparks = style === 'heavy' ? 12 : 7;
    for (let index = 0; index < sparks; index += 1) {
      const angle = (index / sparks) * Math.PI * 2 + rand(0.22, -0.22, 'fx');
      const speed = rand(170, 70, 'fx');
      particles.push({
        x: x + Math.cos(angle) * Math.min(radius * 0.3, 34),
        y: y + Math.sin(angle) * Math.min(radius * 0.3, 34),
        life: rand(0.34, 0.16, 'fx'),
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
    const cap = projectile.kind === 'fireball' ? PROJECTILE_TRAIL_LENGTH + 2 : PROJECTILE_TRAIL_LENGTH;
    if (projectile.trail.length > cap) projectile.trail.length = cap;
  }

  function spawnProjectileImpact(projectile, x = projectile?.x, y = projectile?.y, options = {}) {
    if (!projectile || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const color = projectile.color || (projectile.enemy ? '#ff6688' : '#ffd7aa');
    const angle = Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1));
    const heavy = projectile.kind === 'fireball' || projectile.kind === 'magenta_degale' || projectile.kind === 'god_sword';
    particles.push({
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
      const spread = rand(1.2, -1.2, 'fx');
      const sparkAngle = angle + Math.PI + spread;
      const speed = rand(120, 35, 'fx');
      particles.push({
        x,
        y,
        life: rand(0.28, 0.1, 'fx'),
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
    enemies.forEach(enemy => {
      if (!enemy) return;
      if (exclude.has(enemy)) return;
      const d = dist(x, y, enemy.x, enemy.y);
      if (d < bestDist) {
        best = enemy;
        bestDist = d;
      }
    });
    return best;
  }

  function updateProjectiles(dt) {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index];
      if (!projectile) { projectiles.splice(index, 1); continue; }
      projectile.life -= dt;
      if (projectile.enemy && projectile.homing && player) {
        const speed = Math.hypot(Number(projectile.vx || 0), Number(projectile.vy || 0)) || Number(projectile.homingSpeed || 180);
        const targetAngle = Math.atan2(player.y - projectile.y, player.x - projectile.x);
        const currentAngle = Math.atan2(Number(projectile.vy || 0), Number(projectile.vx || 1));
        const nextAngle = turnAngleToward(currentAngle, targetAngle, Number(projectile.homingTurnRate || 2) * dt);
        const nextSpeed = speed + (Number(projectile.homingSpeed || speed) - speed) * Number(projectile.homingAccel || 2.5) * dt;
        projectile.vx = Math.cos(nextAngle) * nextSpeed;
        projectile.vy = Math.sin(nextAngle) * nextSpeed;
      }
      const prevX = projectile.x;
      const prevY = projectile.y;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      recordProjectileTrail(projectile, prevX, prevY);
      const hitProp = destructibles.find(prop => !prop.broken && !prop.hidden && destructibleIntersectsCircle(prop, projectile.x, projectile.y, projectile.r));
      if (!projectile.enemy && hitProp) {
        damageDestructible(hitProp, projectile.damage || 1);
        if (projectile.kind === 'fireball') blastRadius(projectile.x, projectile.y, projectile.splash || 44, 16, '#ff8844');
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        projectiles.splice(index, 1);
        continue;
      }
      if (projectile.life <= 0 || isBlocked(projectile.x, projectile.y, projectile.r)) {
        spawnProjectileImpact(projectile, projectile.x, projectile.y, { blocked: true });
        projectiles.splice(index, 1);
        continue;
      }
      if (!projectile.enemy) {
        const target = enemies.find(enemy => enemy && dist(projectile.x, projectile.y, enemy.x, enemy.y) <= projectile.r + enemy.r);
        if (target) {
          const hitAngle = Math.atan2(projectile.vy, projectile.vx);
          hitEnemy(
            target,
            projectile.damage || 16,
            hitAngle,
            projectile.knockback || 90,
            projectile.color || (projectile.kind === 'fireball' ? '#ff8844' : '#a857ff'),
            projectile.hitOptions || {}
          );
          if (projectile.kind === 'fireball') {
            applyFire(target, projectile.fireStacks || 2, projectile.fireDuration || 3);
            blastRadius(projectile.x, projectile.y, projectile.splash || 44, 14, '#ff8844');
            applyStatusInRadius(projectile.x, projectile.y, projectile.splash || 44, 'fire', 1, projectile.fireDuration || 3, null);
          }
          spawnProjectileImpact(projectile, projectile.x, projectile.y);
          if (projectile.pierceCount > 0) {
            projectile.pierceCount -= 1;
            projectile.x += projectile.vx * 0.03;
            projectile.y += projectile.vy * 0.03;
          } else {
            projectiles.splice(index, 1);
          }
          continue;
        }
      } else if (dist(projectile.x, projectile.y, player.x, player.y) <= projectile.r + player.r) {
        damagePlayer(projectile.damage || 10, Math.atan2(projectile.vy, projectile.vx), projectile.knockback || 120, 'enemy_projectile');
        spawnProjectileImpact(projectile, projectile.x, projectile.y);
        projectiles.splice(index, 1);
        continue;
      }
    }
  }

  function updateWorldProps(dt) {
    hazards.forEach(hazard => {
      if (hazard.ttl !== undefined) hazard.ttl -= dt;
      if (hazard.followPlayer) {
        hazard.x = player.x;
        hazard.y = player.y;
      }
      hazard.statusTick = Number(hazard.statusTick ?? 0) - dt;
      if (hazard.kind === 'lava' && dist(player.x, player.y, hazard.x, hazard.y) < hazard.r + player.r - 10 && player.lavaWalkTime <= 0) {
        damagePlayer(6 * dt, 0, 0, 'lava');
        if (hazard.statusTick <= 0) applyFire(player, 1, 2.6);
      }
      if (hazard.kind === 'explosive_trap') {
        if (!hazard.triggered) {
          const playerNear = dist(player.x, player.y, hazard.x, hazard.y) <= hazard.triggerRadius + player.r;
          const enemyNear = enemies.some(enemy => enemy && dist(enemy.x, enemy.y, hazard.x, hazard.y) <= hazard.triggerRadius + enemy.r);
          if (playerNear || enemyNear) {
            hazard.triggered = true;
            hazard.fuse = hazard.fuseDuration || 0.75;
            hazard.sparkTick = 0;
            particles.push({ x: hazard.x, y: hazard.y - 20, life: 0.5, text: 'CLICK', c: '#ffcc66', size: 12 });
          }
        } else {
          hazard.fuse -= dt;
          hazard.sparkTick = Number(hazard.sparkTick || 0) - dt;
          if (hazard.sparkTick <= 0) {
            particles.push({
              x: hazard.x + rand(7, -7),
              y: hazard.y - 8 + rand(4, -4),
              life: 0.22,
              vx: rand(34, -34),
              vy: rand(-44, -22),
              c: '#ffb347',
              spark: true,
              size: 2.4,
            });
            hazard.sparkTick = 0.07;
          }
          if (hazard.fuse <= 0) {
            if (dist(player.x, player.y, hazard.x, hazard.y) <= hazard.blastRadius + player.r) {
              const angle = Math.atan2(player.y - hazard.y, player.x - hazard.x);
              damagePlayer(hazard.damage || 18, angle, 220, 'explosive_trap');
            }
            blastRadius(hazard.x, hazard.y, hazard.blastRadius || 88, hazard.damage || 18, '#ff9a4d');
            hazard.ttl = 0;
          }
        }
      }
      if (hazard.kind === 'lava') {
        enemies.forEach(enemy => {
          if (!enemy) return;
          if (dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r - 6) return;
          if (hazard.statusTick <= 0) applyFire(enemy, 1, 2.8);
        });
        if (hazard.statusTick <= 0) hazard.statusTick = 0.45;
      }
      if (hazard.kind === 'healing_zone') {
        hazard.plusTick = (hazard.plusTick ?? 0.08) - dt;
        if (hazard.plusTick <= 0) {
          const angle = rng() * Math.PI * 2;
          const radius = rand(hazard.r * 0.82, 8);
          const px = hazard.x + Math.cos(angle) * radius;
          const py = hazard.y + Math.sin(angle) * radius;
          particles.push({
            x: px,
            y: py,
            life: 0.45,
            text: '+',
            c: '#47ff7d',
            size: 14,
            outline: 'rgba(5,35,10,0.7)',
            vx: rand(-10, 10),
            vy: rand(-42, -24),
          });
          hazard.plusTick = rand(0.16, 0.07);
        }
        if (dist(player.x, player.y, hazard.x, hazard.y) < hazard.r) {
          const before = player.hp;
          player.hp = Math.min(player.maxHp, player.hp + 8 * dt);
          const healed = player.hp - before;
          if (healed > 0) {
            hazard.healAccum = (hazard.healAccum || 0) + healed;
            hazard.healTick = (hazard.healTick ?? 0.24) - dt;
            if (hazard.healTick <= 0) {
              spawnHealPopup(player.x + rand(-10, 10), player.y - 22, hazard.healAccum);
              hazard.healAccum = 0;
              hazard.healTick = 0.24;
            }
          }
        }
        for (let ei = enemies.length - 1; ei >= 0; ei -= 1) {
          const enemy = enemies[ei];
          if (!enemy) continue;
          if (dist(enemy.x, enemy.y, hazard.x, hazard.y) < hazard.r + enemy.r) {
            enemy.hp -= 10 * dt;
            if (enemy.hp <= 0) onEnemyDie(enemy);
          }
        }
      } else if (hazard.kind === 'fire_circle') {
        for (let ei = enemies.length - 1; ei >= 0; ei -= 1) {
          const enemy = enemies[ei];
          if (!enemy) continue;
          if (dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) continue;
          enemy.hp -= (hazard.dps || 16) * dt;
          if (hazard.statusTick <= 0) applyFire(enemy, 1, 2.8);
          enemy.stun = Math.max(enemy.stun, 0.05);
          if (nextRandom('fx') < 0.06) particles.push({ x: enemy.x + rand(-6, 6), y: enemy.y + rand(-6, 6), life: 0.3, c: '#ff8c3b' });
          if (enemy.hp <= 0) onEnemyDie(enemy);
        }
        if (hazard.statusTick <= 0) hazard.statusTick = 0.45;
      } else if (hazard.kind === 'lightning_column') {
        hazard.tick -= dt;
        if (hazard.tick <= 0) {
          hazard.tick = hazard.interval || 0.45;
          if (hazard.enemy) {
            if (dist(player.x, player.y, hazard.x, hazard.y) <= hazard.r + player.r) {
              const angle = Math.atan2(player.y - hazard.y, player.x - hazard.x);
              damagePlayer(hazard.damage || 16, angle, 90, hazard.source || 'lightning_column');
            }
          } else {
            for (let ei = enemies.length - 1; ei >= 0; ei -= 1) {
              const enemy = enemies[ei];
              if (!enemy) continue;
              if (dist(enemy.x, enemy.y, hazard.x, hazard.y) > hazard.r + enemy.r) continue;
              const angle = Math.atan2(enemy.y - hazard.y, enemy.x - hazard.x);
              hitEnemy(enemy, hazard.damage || 16, angle, 90, '#8dd4ff');
            }
          }
          particles.push({
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
              phase: rng() * Math.PI * 2,
            },
          });
        }
      }
    });
    hazards = hazards.filter(hazard => hazard.ttl === undefined || hazard.ttl > 0);
    syncCurrentRoomState();
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
      const potRandom = createEntityRandom(prop, 'pot:reward');
      if (potRandom() < 0.7) dropCoins(prop.x, prop.y, 6 + floor);
      else pickups.push({ x: prop.x, y: prop.y, type: 'item', key: rollItemDrop({ random: potRandom }) });
    }
    if (prop.kind === 'barrel') {
      blastRadius(prop.x, prop.y, 130, 55, '#ff5a3d');
    }
    if (prop.kind === 'wall') {
      destructibles.forEach(other => {
        if (other.hidden) other.hidden = false;
      });
      for (let index = 0; index < 16; index += 1) {
        particles.push({
          x: prop.x + rand(22, -22, 'fx'),
          y: prop.y + rand(22, -22, 'fx'),
          life: rand(0.55, 0.22, 'fx'),
          vx: rand(110, -110, 'fx'),
          vy: rand(80, -110, 'fx'),
          c: index % 3 === 0 ? '#a09080' : '#c8bfb0',
          spark: true,
          size: rand(3.2, 1.8, 'fx'),
        });
      }
      particles.push({ x: prop.x, y: prop.y - 22, life: 0.75, text: 'CLEAR', c: '#d7f6ff' });
    }
    if (prop.kind === 'cover_wall') {
      const splinters = prop.reinforced ? 18 : 12;
      for (let index = 0; index < splinters; index += 1) {
        particles.push({
          x: prop.x + rand((prop.w || prop.r) * 0.42, -(prop.w || prop.r) * 0.42, 'fx'),
          y: prop.y + rand((prop.h || prop.r) * 0.42, -(prop.h || prop.r) * 0.42, 'fx'),
          life: rand(0.42, 0.18, 'fx'),
          vx: rand(90, -90, 'fx'),
          vy: rand(70, -95, 'fx'),
          c: prop.reinforced ? '#aeb5bd' : '#b87838',
          spark: true,
          size: prop.reinforced ? 2.2 : 2.8,
        });
      }
    }
    if (prop.kind === 'secret_wall') {
      const dir = prop.secretDir;
      if (dir) setSecretPassageOpen(currentRoom, dir, true);
      particles.push({ x: prop.x, y: prop.y - 18, life: 0.9, text: 'SECRET', c: '#8dd4ff' });
    }
  }

  function spawnDamagePopup(x, y, amount, opts = {}) {
    const value = Math.max(0, Math.round(amount || 0));
    if (value <= 0) return;
    const crit = !!opts.crit;
    const color = opts.color || (crit ? '#ff9f1c' : '#ff6b6b');
    const size = opts.size || (crit ? 20 : 16);
    particles.push({
      x,
      y,
      life: crit ? 0.62 : 0.46,
      text: `-${value}`,
      c: color,
      outline: opts.outline || '#120a00',
      size,
      vx: rand(-14, 14),
      vy: -36 - (crit ? 10 : 0),
    });
  }

  function spawnHealPopup(x, y, amount, opts = {}) {
    const value = Math.max(0, Math.round((amount || 0) * (opts.scale || 8)));
    if (value <= 0) return;
    achievementEvents.emit('heal:applied', { amount: Math.max(0, amount || 0) });
    particles.push({
      x,
      y,
      life: 0.5,
      text: `+${value}`,
      c: opts.color || '#47ff7d',
      outline: opts.outline || 'rgba(5,35,10,0.8)',
      size: opts.size || 15,
      vx: rand(-8, 8),
      vy: -44,
    });
  }

  function updateChests() {
    chests.forEach(chest => {
      if (chest.open) return;
      if (dist(chest.x, chest.y, player.x, player.y) >= 36) return;
      chest.open = true;
      dropCoins(chest.x, chest.y, 12 + floor * 2);
      if ((chest.rewardType || 'item') === 'item') {
        pickups.push({ x: chest.x, y: chest.y - 20, type: 'item', key: chest.rewardKey || rollItemDrop({ random: createEntityRandom(chest, 'chest:fallback') }) });
      } else {
        pickups.push({ x: chest.x, y: chest.y - 20, type: 'potion' });
      }
      currentRoom.cleared = chests.every(item => item.open);
      updateObjective();
      scheduleRunSave();
    });
  }

  function canSpawnJesterPortal() {
    if (floorSkipPending <= 0) return false;
    if (floor >= MAX_FLOOR) return false;
    if (!currentRoom) return false;
    if (pickups.some(pickup => pickup?.type === 'jesterPortal')) return false;
    return true;
  }

  function spawnJesterPortalPickup() {
    if (!canSpawnJesterPortal()) return false;
    const skipFloors = Math.max(1, Math.floor(floorSkipPending));
    const preferred = findSafePointNearTarget(player.x, player.y - 96, 24, 180, 20);
    const fallback = findSafePointNearTarget(ROOM_W / 2, ROOM_H / 2, 24, 240, 20) || findSafeSpawnPoint();
    const spawnPoint = preferred || fallback;
    pickups.push({
      x: spawnPoint.x,
      y: spawnPoint.y,
      type: 'jesterPortal',
      skipFloors,
      spawnT: 0,
      activateAt: JESTER_PORTAL_ACTIVATE_DELAY,
      active: false,
    });
    floorSkipPending = 0;
    particles.push({ x: spawnPoint.x, y: spawnPoint.y, life: 0.5, ring: 28, c: '#ff8bd8' });
    particles.push({ x: spawnPoint.x, y: spawnPoint.y - 20, life: 0.8, text: 'CHAOS GATE', c: '#ffc2f0' });
    return true;
  }

  function useJesterPortal(pickup) {
    const skipFloors = clamp(Number(pickup?.skipFloors || 0), 1, MAX_FLOOR - floor);
    if (skipFloors <= 0) return false;
    floor = Math.min(MAX_FLOOR, floor + skipFloors);
    achievementEvents.emit('floor:reached', { floor });
    refreshFloorChargeStates();
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
    persistMetaSoon();
    showFloorTransition = true;
    floorTransitionTime = 0;
    generateFloor();
    scheduleRunSave();
    return true;
  }

  function updatePickups(dt = 0.016) {
    for (let index = pickups.length - 1; index >= 0; index -= 1) {
      const pickup = pickups[index];
      if (!pickup || typeof pickup !== 'object' || typeof pickup.type !== 'string') {
        pickups.splice(index, 1);
        continue;
      }
      if (pickup.type === 'coin') {
        const magnetRadius = 110;
        const d = dist(pickup.x, pickup.y, player.x, player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 180 + (1 - d / magnetRadius) * 260;
          pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
        }
      } else if (pickup.type === 'potion') {
        if (player.hp < player.maxHp) {
          const magnetRadius = 110;
          const d = dist(pickup.x, pickup.y, player.x, player.y);
          if (d < magnetRadius && d > 0.001) {
            const pull = 180 + (1 - d / magnetRadius) * 260;
            pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
            pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
          }
        }
      } else if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const magnetRadius = 124;
        const d = dist(pickup.x, pickup.y, player.x, player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 190 + (1 - d / magnetRadius) * 240;
          pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
        }
      } else if (pickup.type === 'item') {
        const magnetRadius = 145;
        const d = dist(pickup.x, pickup.y, player.x, player.y);
        if (d < magnetRadius && d > 0.001) {
          const pull = 150 + (1 - d / magnetRadius) * 220;
          pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
        }
      } else if (pickup.type === 'jesterPortal') {
        pickup.spawnT = Math.max(0, Number(pickup.spawnT || 0) + dt);
        const activateAt = Math.max(0.01, Number(pickup.activateAt || JESTER_PORTAL_ACTIVATE_DELAY));
        if (!pickup.active && pickup.spawnT >= activateAt) {
          pickup.active = true;
          particles.push({ x: pickup.x, y: pickup.y - 16, life: 0.6, text: 'READY', c: '#ffc2f0' });
        }
      } else if (pickup.type === 'challengeRune') {
        const runeRadius = 16;
        const minX = WALL + runeRadius;
        const maxX = ROOM_W - WALL - runeRadius;
        const minY = WALL + runeRadius;
        const maxY = ROOM_H - WALL - runeRadius;
        if (!Number.isFinite(pickup.vx) || !Number.isFinite(pickup.vy)) {
          const angle = rand(Math.PI * 2, 0, 'world');
          const speed = rand(82, 56, 'world');
          pickup.vx = Math.cos(angle) * speed;
          pickup.vy = Math.sin(angle) * speed;
        }
        pickup.x += pickup.vx * dt;
        pickup.y += pickup.vy * dt;
        if (pickup.x <= minX || pickup.x >= maxX) {
          pickup.x = clamp(pickup.x, minX, maxX);
          pickup.vx *= -1;
        }
        if (pickup.y <= minY || pickup.y >= maxY) {
          pickup.y = clamp(pickup.y, minY, maxY);
          pickup.vy *= -1;
        }
        const d = dist(pickup.x, pickup.y, player.x, player.y);
        if (d < 130 && d > 0.001) {
          const pull = 160 + (1 - d / 130) * 180;
          pickup.x += ((player.x - pickup.x) / d) * 0.016 * pull;
          pickup.y += ((player.y - pickup.y) / d) * 0.016 * pull;
        }
      }
      const pickupTriggerRadius = pickup.type === 'jesterPortal'
        ? JESTER_PORTAL_TRIGGER_RADIUS
        : pickup.type === 'ladder'
          ? LADDER_TRIGGER_RADIUS
          : 26;
      if (dist(pickup.x, pickup.y, player.x, player.y) >= pickupTriggerRadius) continue;

      if (pickup.type === 'coin') {
        addCoins(pickup.value || 1);
      }

      if (pickup.type === 'potion') {
        if (player.hp >= player.maxHp) continue;
        const potionHeal = getPotionHealAmount();
        player.hp = Math.min(player.maxHp, player.hp + potionHeal);
        particles.push({ x: player.x, y: player.y - 20, life: 0.6, text: `+${potionHeal}`, c: '#0f8' });
      }

      if (pickup.type === 'apple' || pickup.type === 'fruit') {
        const heal = Math.max(10, Number(pickup.heal || 20));
        const before = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + heal);
        const actual = player.hp - before;
        if (actual > 0) {
          spawnHealPopup(player.x + rand(-8, 8), player.y - 22, actual, { color: '#79ff8f', size: 14 });
          particles.push({ x: player.x, y: player.y - 18, life: 0.55, text: `+${Math.ceil(actual)}`, c: '#79ff8f' });
        }
        const fruitRoom = getRoomByCoords(Number(pickup.roomGx ?? currentRoom?.gx), Number(pickup.roomGy ?? currentRoom?.gy)) || currentRoom;
        const node = fruitRoom?.gardenFruitNodes?.find(gardenNode => gardenNode && gardenNode.id === pickup.gardenNodeId);
        if (node) {
          node.respawnAt = gameElapsedTime + rand(22, 12, 'world');
          node.fruitSpawned = false;
        }
      }

      if (pickup.type === 'item') {
        collectItem(pickup.key);
        if (floorSkipPending > 0) {
          if (spawnJesterPortalPickup()) {
            pickups.splice(index, 1);
            scheduleRunSave();
            continue;
          }
          floor = Math.min(MAX_FLOOR, floor + floorSkipPending);
          floorSkipPending = 0;
          refreshFloorChargeStates();
          metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
          persistMetaSoon();
          showFloorTransition = true;
          floorTransitionTime = 0;
          generateFloor();
          scheduleRunSave();
          return;
        }
      }

      if (pickup.type === 'jesterPortal') {
        if (!pickup.active) continue;
        if (useJesterPortal(pickup)) return;
        continue;
      }

      if (pickup.type === 'ladder') {
        const wantsToAscend = !!keys[' '];
        if (!wantsToAscend) {
          ladderUseKeyLatch = false;
          continue;
        }
        if (ladderUseKeyLatch) continue;
        ladderUseKeyLatch = true;
        if (isFirstRunTutorialActive()) tutorialState.usedLadder = true;
        floor = Math.min(MAX_FLOOR, floor + 1);
        refreshFloorChargeStates();
        metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
        persistMetaSoon();
        showFloorTransition = true;
        floorTransitionTime = 0;
        generateFloor();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'secretWarp') {
        floor = clamp(Number(pickup.targetFloor || floor), 1, MAX_FLOOR);
        refreshFloorChargeStates();
        metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
        persistMetaSoon();
        showFloorTransition = true;
        floorTransitionTime = 0;
        generateFloor();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'secretVendor') {
        const cost = Math.max(1, Number(pickup.cost || 1));
        const usesCoins = pickup.offerKind === 'xp';
        const crystals = Number(metaProgress.loopCrystals || 0);
        const coins = Number(player.coins || 0);
        const canAfford = usesCoins ? coins >= cost : crystals >= cost;
        const costLabel = usesCoins ? `${cost} C` : `${cost} LC`;
        if (pickup.bought) {
          pickups.splice(index, 1);
          continue;
        }
        if (!canAfford) {
          const now = Date.now();
          if (!pickup.lastDeniedAt || now - pickup.lastDeniedAt > 450) {
            particles.push({ x: pickup.x, y: pickup.y - 20, life: 0.85, text: costLabel, c: '#ffb1b1' });
            pickup.lastDeniedAt = now;
          }
          continue;
        }
        if (usesCoins) {
          if (!spendCoins(cost)) continue;
        } else {
          metaProgress.loopCrystals = crystals - cost;
        }
        pickup.bought = true;
        if (pickup.offerKind === 'relic') {
          collectItem(pickup.rewardKey || rollItemDrop({ elite: true, random: createEntityRandom(pickup, 'secret-vendor:fallback') }));
        } else if (pickup.offerKind === 'vitality') {
          player.maxHp += 20;
          player.hp = Math.min(player.maxHp, player.hp + 60);
          particles.push({ x: player.x, y: player.y - 20, life: 0.7, text: '+VIT', c: '#8dffbd' });
        } else if (pickup.offerKind === 'xp') {
          const xpValue = Math.max(1, Number(pickup.xpValue || getSecretXpOfferAmount()));
          grantXp(xpValue);
          particles.push({ x: player.x, y: player.y - 20, life: 0.7, text: `+${xpValue} XP`, c: '#8dd4ff' });
        } else {
          addCoins(90 + floor * 12);
          particles.push({ x: player.x, y: player.y - 20, life: 0.7, text: 'RICH', c: '#ffd966' });
        }
        persistMetaSoon();
      }

      if (pickup.type === 'fightGod') {
        currentRoom.bossStarted = true;
        pickups = [];
        spawnGodBoss();
        playGodDialogue(1);
        syncCurrentRoomState();
        updateObjective();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'challengeStarter') {
        beginChallengeTrial(currentRoom);
        syncCurrentRoomState();
        updateObjective();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'challengeBomb') {
        if (pickup.safe) {
          completeChallengeTrial('BOMB DISARMED');
        } else {
          blastRadius(pickup.x, pickup.y, 76, 28 + floor * 2, '#ff7a66');
          particles.push({ x: pickup.x, y: pickup.y - 20, life: 0.75, text: 'WRONG', c: '#ff7a7a' });
          failChallengeTrial('WRONG BOMB');
        }
        pickups.splice(index, 1);
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'challengeRune') {
        if (!currentRoom.challengeData) currentRoom.challengeData = {};
        currentRoom.challengeData.runesLeft = Math.max(0, Number(currentRoom.challengeData.runesLeft || 1) - 1);
        particles.push({ x: pickup.x, y: pickup.y - 18, life: 0.55, text: 'RUNE', c: '#8dd4ff' });
        if (currentRoom.challengeData.runesLeft <= 0) {
          completeChallengeTrial('RUNES CLAIMED');
        }
      }

      if (pickup.type === 'descend') {
        floor += 1;
        achievementEvents.emit('floor:reached', { floor });
        refreshFloorChargeStates();
        metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
        persistMetaSoon();
        showFloorTransition = true;
        floorTransitionTime = 0;
        player.x = START_X;
        player.y = START_Y;
        generateFloor();
        scheduleRunSave();
        return;
      }

      if (pickup.type === 'returnGate') {
        returnToFloorOne();
        return;
      }

      if (pickup.type === 'crown') {
        win();
        return;
      }

      pickups.splice(index, 1);
      scheduleRunSave();
    }
  }

  function updateDeadBodies(dt) {
    for (let index = deadBodies.length - 1; index >= 0; index -= 1) {
      const body = deadBodies[index];
      body.age = Number(body.age || 0) + dt;
      if (body.age <= Number(body.fallTime || CORPSE_FALL_TIME)) {
        body.x += Number(body.vx || 0) * dt;
        body.y += Number(body.vy || 0) * dt;
        body.vx *= Math.max(0, 1 - 6.2 * dt);
        body.vy *= Math.max(0, 1 - 6.2 * dt);
      }
      if (body.age >= Number(body.life || CORPSE_LIFETIME)) deadBodies.splice(index, 1);
    }
  }

  function updateParticles(dt) {
    // With reduceParticles: cull non-text particles to keep count low
    if (window.NeoSettings?.getAccess()?.reduceParticles) {
      const MAX_REDUCED = 24;
      if (particles.length > MAX_REDUCED) {
        // Remove oldest non-text particles first
        for (let index = 0; index < particles.length && particles.length > MAX_REDUCED; index++) {
          if (!particles[index].text) { particles.splice(index, 1); index--; }
        }
      }
    }
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= dt;
      if (particle.blood) particle.vy = Math.min(220, Number(particle.vy || 0) + 390 * dt);
      if (particle.vx) particle.x += particle.vx * dt;
      if (particle.vy) particle.y += particle.vy * dt;
      if (particle.ring) particle.ring += 200 * dt;
      if (particle.life <= 0) particles.splice(index, 1);
    }
  }

  function isRoomLocked() {
    const challengeActive = !!currentRoom && CHALLENGE_ROOM_TYPES.has(currentRoom.type) && !!currentRoom.challengeStarted && !currentRoom.cleared;
    return !!currentRoom
      && !currentRoom.cleared
      && (currentRoom.type === 'boss' || currentRoom.type === 'god' || currentRoom.type === 'ladder' || challengeActive);
  }

  function updateTransitions(dt) {
    const challengeActive = !!currentRoom && CHALLENGE_ROOM_TYPES.has(currentRoom.type) && !!currentRoom.challengeStarted && !currentRoom.cleared;
    const canLeaveFight = enemies.length > 0
      && currentRoom
      && currentRoom.type !== 'boss'
      && currentRoom.type !== 'god'
      && currentRoom.type !== 'ladder'
      && !challengeActive;
    const roomLocked = isRoomLocked();
    if (!fading && !roomLocked && (enemies.length === 0 || canLeaveFight)) {
      const door =
        player.y < WALL + 24 && hasRoomExit(currentRoom, 'n') && Math.abs(player.x - ROOM_W / 2) < DOOR / 2 ? 'n' :
        player.y > ROOM_H - WALL - 24 && hasRoomExit(currentRoom, 's') && Math.abs(player.x - ROOM_W / 2) < DOOR / 2 ? 's' :
        player.x < WALL + 24 && hasRoomExit(currentRoom, 'w') && Math.abs(player.y - ROOM_H / 2) < DOOR / 2 ? 'w' :
        player.x > ROOM_W - WALL - 24 && hasRoomExit(currentRoom, 'e') && Math.abs(player.y - ROOM_H / 2) < DOOR / 2 ? 'e' :
        null;
      if (door) startTransition(door);
    }

    stepActiveTransitionFade(dt);
  }

  function stepActiveTransitionFade(dt) {
    if (!fading) return;
    fade += (fading === 1 ? 1 : -1) * dt * 3;
    if (fade >= 1 && fading === 1) {
      doTransition();
      fading = -1;
    }
    if (fade <= 0 && fading === -1) {
      fading = 0;
    }
    fade = clamp(fade, 0, 1);
  }

  function startTransition(direction) {
    fading = 1;
    nextDoor = direction;
  }

  function snapCameraToEntity(cam, entity, vpW, vpH) {
    if (!cam || !entity) return;
    cam.x = entity.x - vpW / 2;
    cam.y = entity.y - vpH / 2;
  }

  function syncCamerasAfterTransition() {
    const split = isSplitScreen();
    const sc = split ? getActivePlayerSlots().length : 1;
    const vpW = split ? Math.floor(canvas.width / 2) : canvas.width;
    const vpH = sc >= 3 ? Math.floor(canvas.height / 2) : canvas.height;

    snapCameraToEntity(camera, player, vpW, vpH);
    if (!split) return;
    getLivePlayerSlots().forEach(slot => {
      if (slot.id === 1) return;
      snapCameraToEntity(slot.getCamera(), slot.getEntity(), vpW, vpH);
    });
  }

  function doTransition() {
    const direction = nextDoor;
    const nextRoom = getConnectedRoom(currentRoom, direction);
    if (!nextRoom) return;
    enterRoom(nextRoom);
    const r = 18;
    let doorX = ROOM_W / 2;
    let doorY = ROOM_H / 2;
    if (direction === 'n') { doorY = ROOM_H - WALL - 30; doorX = ROOM_W / 2; }
    if (direction === 's') { doorY = WALL + 30; doorX = ROOM_W / 2; }
    if (direction === 'e') { doorX = WALL + 30; doorY = ROOM_H / 2; }
    if (direction === 'w') { doorX = ROOM_W - WALL - 30; doorY = ROOM_H / 2; }
    if (!isBlocked(doorX, doorY, r)) {
      player.x = doorX;
      player.y = doorY;
    }
    // Prevent one-frame camera lag that can look like room offset after fades/cutscenes.
    syncCamerasAfterTransition();
  }

  function returnToFloorOne() {
    floor = 1;
    gameElapsedTime = 0;
    refreshFloorChargeStates();
    runLoopIndex += 1;
    achievementEvents.emit('loop:completed', { loopIndex: runLoopIndex });
    syncSeedState();
    const crystalBonus = Math.max(0, Math.round(getActiveChallengeCrystalBonusMultiplier()));
    const titheBonus = hasLegacy('crystal_tithe') && HARD_DIFFICULTIES.has(selectedDifficulty) ? 1 : 0;
    metaProgress.loopCrystals = Number(metaProgress.loopCrystals || 0) + 1 + crystalBonus + titheBonus;
    if (crystalBonus > 0) {
      particles.push({ x: player.x, y: player.y - 42, life: 1.1, text: `+${crystalBonus} CHALLENGE LC`, c: '#8dd4ff' });
    }
    if (titheBonus > 0) {
      particles.push({ x: player.x, y: player.y - 56, life: 1.1, text: `+1 TITHE LC`, c: '#c9a8f0' });
    }
    if (hasLegacy('bank_interest')) {
      metaProgress.coins = Number(metaProgress.coins || 0) + 50;
      particles.push({ x: player.x, y: player.y - 70, life: 1.1, text: `+50 INTEREST`, c: '#ffd27d' });
    }
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, MAX_FLOOR);
    persistMetaSoon();
    player.x = START_X;
    player.y = START_Y;
    generateFloor();
    scheduleRunSave();
  }

  function addCoins(amount) {
    player.coins += amount;
    metaProgress.coins += amount;
    persistMetaSoon();
    achievementEvents.emit('meta:coins', { total: metaProgress.coins });
  }

