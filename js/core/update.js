  function loop(timestamp) {
    const framePerfStart = perfBeginFrame(timestamp);
    const dt = Math.min(0.033, (timestamp - lastTime) / 1000 || 0.016);
    lastTime = timestamp;
    frameId += 1;

    // Safety net: if dialogue runtime has closed but game state is still "dialogue",
    // restore play state so controls and simulation cannot get stuck.
    if (gameState === 'dialogue' && !uiController?.isDialogueOpen?.()) {
      setGameState('play');
      clearGameplayInput();
    }

    const updatePerfStart = perfStart();
    if (gameState === 'play' && !isWizardPawOpen()) update(dt);
    else if (player && (gameState === 'dialogue' || gameState === 'pause')) {
      tickPlayerTransientDefenseTimers(dt);
      stepActiveTransitionFade(dt);
    } else if (gameState === 'dying' && playerDeathAnim) {
      playerDeathAnim.timer += dt;
      if (playerDeathAnim.timer >= playerDeathAnim.duration) finalizeDeath();
    }
    perfEnd('update', updatePerfStart);
    const uiPerfStart = perfStart();
    uiController.tick(dt);
    perfEnd('ui', uiPerfStart);
    const drawPerfStart = perfStart();
    if (gameState !== 'pause') draw();
    perfEnd('draw', drawPerfStart);
    perfEndFrame(framePerfStart);
    requestAnimationFrame(loop);
  }

  function update(dt) {
    let sectionPerfStart = perfStart();
    const itemStats = getItemStats();
    compactEnemyList();
    gameElapsedTime += dt;
    lavaAnimTime += dt;
    floorTransitionTime += dt;
    if (floorTransitionTime > 2.5) showFloorTransition = false;
    tickCooldowns(dt);
    if (godTimer > 0) godTimer = Math.max(0, godTimer - dt);

    const _b = window.NeoSettings?.getBindings();
    const _right = _b ? _b.right : 'd';
    const _left  = _b ? _b.left  : 'a';
    const _down  = _b ? _b.down  : 's';
    const _up    = _b ? _b.up    : 'w';
    const _getNearestEnemyForAim = (() => {
      let cached = false;
      let nearest = null;
      return () => {
        if (cached) return nearest;
        cached = true;
        let bestDistSq = Infinity;
        for (const en of enemies) {
          if (!en || en.dead) continue;
          const dx = en.x - player.x;
          const dy = en.y - player.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            nearest = en;
          }
        }
        return nearest;
      };
    })();
    if (p1DeadInCoop) { keys[_right] = false; keys[_left] = false; keys[_down] = false; keys[_up] = false; }
    const _nt = window.NeoTouch;
    if (_nt?.active) {
      // Inject touch move vector — auto-aim fires in last joystick direction
      if (Math.abs(_nt.moveX) > 0.08 || Math.abs(_nt.moveY) > 0.08) {
        keys[_right] = _nt.moveX > 0.08;
        keys[_left]  = _nt.moveX < -0.08;
        keys[_down]  = _nt.moveY > 0.08;
        keys[_up]    = _nt.moveY < -0.08;
      } else {
        keys[_right] = false; keys[_left] = false;
        keys[_down]  = false; keys[_up]   = false;
      }
      // Auto-aim toward nearest enemy, fallback to last joystick direction
      const _aimTarget = _getNearestEnemyForAim();
      const _aimDX = _aimTarget ? (_aimTarget.x - player.x) : (_nt.lastAimX * 200);
      const _aimDY = _aimTarget ? (_aimTarget.y - player.y) : (_nt.lastAimY * 200);
      mouse.worldX = player.x + _aimDX;
      mouse.worldY = player.y + _aimDY;
      mouse.x = mouse.worldX - camera.x;
      mouse.y = mouse.worldY - camera.y;
      // Attack buttons — hold while button pressed, release otherwise
      if (_nt.slash) { mouse.down = true; mouse.downQueued = true; } else { mouse.down = false; }
      if (_nt.laser) { mouse.right = true; mouse.rightQueued = true; } else { mouse.right = false; }
      if (_nt.smash) { trySmash(); _nt.smash = false; }
      if (_nt.ascend) keys[' '] = true; else if (!keys[' ']) keys[' '] = false;
      if (_nt.dash) keys[_b ? _b.dash : 'shift'] = true;
      else keys[_b ? _b.dash : 'shift'] = false;
    }
    // Gamepad 0 → P1
    const _gp0 = window.NeoGamepad?.[0];
    if (_gp0?.active && !_nt?.active) {
      if (Math.abs(_gp0.moveX) > 0.18 || Math.abs(_gp0.moveY) > 0.18) {
        keys[_right] = _gp0.moveX > 0.18;
        keys[_left]  = _gp0.moveX < -0.18;
        keys[_down]  = _gp0.moveY > 0.18;
        keys[_up]    = _gp0.moveY < -0.18;
      } else {
        keys[_right] = false; keys[_left] = false;
        keys[_down] = false; keys[_up] = false;
      }
      const _gpAimTarget = _gp0.hasAim ? null : _getNearestEnemyForAim();
      const _gpAimX = _gp0.hasAim ? _gp0.aimX * 200 : (_gpAimTarget ? _gpAimTarget.x - player.x : _gp0.lastAimX * 200);
      const _gpAimY = _gp0.hasAim ? _gp0.aimY * 200 : (_gpAimTarget ? _gpAimTarget.y - player.y : _gp0.lastAimY * 200);
      mouse.worldX = player.x + _gpAimX;
      mouse.worldY = player.y + _gpAimY;
      mouse.x = mouse.worldX - camera.x;
      mouse.y = mouse.worldY - camera.y;
      if (_gp0.slash) { mouse.down = true; mouse.downQueued = true; } else { mouse.down = false; }
      if (_gp0.laser) { mouse.right = true; mouse.rightQueued = true; } else { mouse.right = false; }
      if (_gp0.smash) { trySmash(); _gp0.smash = false; }
      if (_gp0.dash) keys[_b ? _b.dash : 'shift'] = true;
      else if (!keys[_b ? _b.dash : 'shift']) keys[_b ? _b.dash : 'shift'] = false;
      if (_gp0.start) {
        if (gameState === 'play') pauseGame();
        else if (gameState === 'pause') resumeGame();
        _gp0.start = false;
      }
    }
    let moveX = (keys[_right] || keys.arrowright ? 1 : 0) - (keys[_left] || keys.arrowleft ? 1 : 0);
    let moveY = (keys[_down]  || keys.arrowdown  ? 1 : 0) - (keys[_up]   || keys.arrowup   ? 1 : 0);
    if (currentRoom?.type !== 'shop' && isPanelOpen(ui.shopPanel)) setShopPanelOpen(false);
    if (currentRoom?.type !== 'anvil' && isPanelOpen(ui.anvilPanel)) setAnvilPanelOpen(false);
    const overlayOpen = isOverlayBlockingInput();
    if (overlayOpen) {
      moveX = 0;
      moveY = 0;
      mouse.down = false;
      mouse.right = false;
      mouse.downQueued = false;
      mouse.rightQueued = false;
    }
    const playerStunned = Number(player.stun || 0) > 0;
    if (playerStunned) {
      moveX = 0;
      moveY = 0;
      mouse.down = false;
      mouse.right = false;
      mouse.downQueued = false;
      mouse.rightQueued = false;
    }
    const moveLength = Math.hypot(moveX, moveY) || 1;
    moveX /= moveLength;
    moveY /= moveLength;
    if (moveLength < 0.1) {
      moveX = 0;
      moveY = 0;
    }

    const dashKey = _b ? _b.dash : 'shift';
    const dashHeld = !!keys[dashKey];
    if (!overlayOpen && !playerStunned && dashHeld && !dashKeyLatch) {
      tryDash(moveX, moveY);
      dashKeyLatch = true;
    } else if (!dashHeld) {
      dashKeyLatch = false;
    }

    if (playerStunned) {
      player.dashTime = 0;
      player.dashX = 0;
      player.dashY = 0;
      const friction = Math.pow(0.84, dt * 60);
      player.vx *= friction;
      player.vy *= friction;
    } else if (player.dashTime > 0) {
      player.dashTime = Math.max(0, player.dashTime - dt);
      player.vx = player.dashX;
      player.vy = player.dashY;
      player.inv = Math.max(player.inv, 0.12);
      if (player.dashTime <= 0) {
        player.dashX = 0;
        player.dashY = 0;
      }
    } else {
      const flightBoost = player.princessFlightTime > 0 ? 2 : 1;
      const targetSpeed = 228 * flightBoost * (godTimer > 0 ? 1.25 : 1) * itemStats.moveSpeedMultiplier;
      player.vx = applyResponsiveVelocity(player.vx, moveX * targetSpeed, dt);
      player.vy = applyResponsiveVelocity(player.vy, moveY * targetSpeed, dt);
      if (player.princessFlightTime > 0 && (moveX || moveY) && nextRandom('fx') < 0.35) {
        particles.push({ x: player.x + rand(12, -12, 'fx'), y: player.y + rand(10, -10, 'fx'), life: 0.2, c: '#ffd1ea' });
      }
    }

    moveCircle(player, dt);
    updateFirstRunTutorialProgress();

    if (player.cowardsWayTime > 0) {
      player.cowardsWayTime = Math.max(0, player.cowardsWayTime - dt);
      player.inv = Math.max(player.inv, 0.2);
      if (nextRandom('fx') < 0.4) {
        particles.push({ x: player.x + rand(16, -16, 'fx'), y: player.y + rand(16, -16, 'fx'), life: 0.18, c: '#92ffcf' });
      }
    }

    player.inv = Math.max(0, player.inv - dt);
    player.stun = Math.max(0, Number(player.stun || 0) - dt);
    if (player.swing > 0) player.swing = Math.max(0, player.swing - dt);

    const _vpW = isSplitScreen() ? canvas.width / 2 : canvas.width;
    const _clampedMouseX = isSplitScreen() ? Math.min(mouse.x, _vpW) : mouse.x;
    mouse.worldX = _clampedMouseX + camera.x;
    mouse.worldY = mouse.y + camera.y;
    updateWeaponSystems(dt);
    updateRivals(dt);
    updateMonsterDoorRoaming(dt);
    if (gameState !== 'play') return;

    // PVP: check if P1 melee arc hits P2
    if (gameMode === 'pvp' && player2 && player.swing > 0) {
      const _pvpDx = player2.x - player.x;
      const _pvpDy = player2.y - player.y;
      const _pvpDist = Math.hypot(_pvpDx, _pvpDy);
      if (_pvpDist < ATTACKS.melee.range + player2.r + 4 && player2.inv <= 0) {
        const _pvpAimAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
        const _pvpHitAngle = Math.atan2(_pvpDy, _pvpDx);
        const _pvpDiff = Math.abs(((_pvpHitAngle - _pvpAimAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (_pvpDiff <= ATTACKS.melee.arc) {
          damagePlayer2(Math.max(1, ATTACKS.melee.damage), _pvpHitAngle, ATTACKS.melee.push, 'pvp_p1');
        }
      }
    }
    if (!p1DeadInCoop) {
      if (getItemStats().hasRobotArm) { mouse.down = true; mouse.downQueued = true; }
      const meleeHeld = isMouseActionHeld('slash');
      const laserHeld = isMouseActionHeld('laser');
      if (!overlayOpen && meleeHeld) tryMelee();
      if (!overlayOpen && laserHeld) tryLaser();
    }
    if (keys.f && !teleportKeyLatch) {
      tryChargedLadderWarp();
      teleportKeyLatch = true;
    }
    if (!keys.f) teleportKeyLatch = false;

    if (player.lavaWalkTime > 0) {
      player.lavaWalkTime = Math.max(0, player.lavaWalkTime - dt);
      player.lavaTrailTick -= dt;
      if (player.lavaTrailTick <= 0) {
        hazards.push({
          kind: 'lava',
          x: player.x,
          y: player.y,
          r: 24 * (itemStats.aoeRadiusMultiplier || 1),
          ttl: 1.8,
          pulse: 2.5,
          wobble: 0.35,
          phase: rng() * Math.PI * 2,
        });
        player.lavaTrailTick = 0.22;
      }
    }

    if (!p1DeadInCoop) updatePlayerLaser(dt);
    if (gameMode === 'coop' || gameMode === 'pvp') {
      getLivePlayerSlots().forEach(slot => {
        if (slot.id === 2) updatePlayer2(dt);
        else if (slot.id > 2) updatePlayerN(dt, slot.getEntity(), slot.id);
      });
    }
    updateChallengeRoomState(dt);

    const cameraLead = 0.08;
    const isSplit = isSplitScreen();
    const n = isSplit ? splitPlayerCount() : 1;
    // Viewport dimensions per slot: 2 players = left/right halves, 3-4 = quad grid
    const slotW = n >= 2 ? Math.floor(canvas.width / 2) : canvas.width;
    const slotH = n >= 3 ? Math.floor(canvas.height / 2) : canvas.height;

    function trackCamera(cam, p, vW, vH) {
      const tx = p.x - vW / 2 + p.vx * cameraLead;
      const ty = p.y - vH / 2 + p.vy * cameraLead;
      cam.x += (tx - cam.x) * 8 * dt;
      cam.y += (ty - cam.y) * 8 * dt;
    }

    if (!p1DeadInCoop) trackCamera(camera, player, slotW, slotH);
    if (isSplit) {
      getLivePlayerSlots().forEach(slot => {
        if (slot.id === 1) return;
        trackCamera(slot.getCamera(), slot.getEntity(), slotW, slotH);
      });
    }
    if (shakeT > 0) {
      shakeT -= dt;
      shake *= 0.88;
    } else {
      shake = 0;
    }
    perfEnd('update.player', sectionPerfStart);

    sectionPerfStart = perfStart();
    let totalBleed = 0;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      enemy.attackCd = Math.max(0, enemy.attackCd - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.inv = Math.max(0, enemy.inv - dt);
      if (enemy.spawnT > 0) { enemy.spawnT = Math.max(0, enemy.spawnT - dt); continue; }

      if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type !== 'god') {
        applyBleed(enemy, Math.max(0, itemStats.passiveBleedStacks - getStatusStacks(enemy, 'bleed')), 0.25);
      } else if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type === 'god') {
        applyBleed(enemy, Math.max(0, Math.max(1, itemStats.passiveBleedStacks - 1) - getStatusStacks(enemy, 'bleed')), 0.25);
      }

      totalBleed += updateEnemyStatuses(enemy, dt);
      if (!enemies.includes(enemy)) continue;
      const eliteTraitControlled = updateEliteEnemyTraits(enemy, dt);
      if (!enemies.includes(enemy)) continue;

      if (!eliteTraitControlled) {
        if (enemy.type === 'god') updateGod(enemy, dt);
        else if (enemy.type === 'queen_cult') updateCultQueenBoss(enemy, dt);
        else if (enemy.type === 'bulk_golem') updateBulkGolemBoss(enemy, dt);
        else if (enemy.type === 'artificer_knave') updateArtificerBoss(enemy, dt);
        else if (enemy.type === 'mirror_knight') updateMirrorChampion(enemy, dt);
        else if (enemy.type === 'rival') updateRivalEnemy(enemy, dt);
        else if (enemy.type === 'cult_mage') updateCultMageEnemy(enemy, dt);
        else if (enemy.type === 'knave') updateKnaveEnemy(enemy, dt);
        else if (enemy.type === 'sniper') updateSniperEnemy(enemy, dt);
        else if (enemy.type === 'machine_gunner') updateMachineGunnerEnemy(enemy, dt);
        else if (enemy.type === 'golem') updateGolemEnemy(enemy, dt);
        else if (enemy.type === 'summoner') updateSummonerEnemy(enemy, dt);
        else if (enemy.type === 'shield_unit') updateShieldUnitEnemy(enemy, dt);
        else if (enemy.type === 'healer') updateHealerEnemy(enemy, dt);
        else if (enemy.type === 'boss_spawner') updateBossSpawnerEnemy(enemy, dt);
        else if (enemy.type === 'laser') updateLaserEnemy(enemy, dt);
        else if (enemy.type === 'charger') updateChargerEnemy(enemy, dt);
        else updateHunterEnemy(enemy, dt);
      }

      if (!enemies.includes(enemy)) continue;
      enemyTryBreakBlockingObstacle(enemy, dt);
      moveCircle(enemy, dt);
    }

    if (itemStats.bleedHealScale > 0 && totalBleed > 0 && player.hp < player.maxHp) {
      if (player.hp < 50) player.scarfHealReady = true;
      if (player.scarfHealReady) {
        const heal = player.maxHp * 0.0006 * totalBleed * itemStats.bleedHealScale * dt;
        player.hp = Math.min(player.maxHp, player.hp + heal);
        if (player.hp >= 50 && player.scarfHealReady) {
          consumeCharge('hemes_scarf');
        }
        if (nextRandom('fx') < 0.14) {
          particles.push({ x: player.x + rand(-10, 10), y: player.y - 18, life: 0.5, text: `+${Math.max(1, Math.ceil(heal * 10))}`, c: '#0f8' });
        }
      }
    }
    perfEnd('update.enemies', sectionPerfStart);
    if (gameState !== 'play') return;

    sectionPerfStart = perfStart();
    updateProjectiles(dt);
    perfEnd('update.projectiles', sectionPerfStart);
    if (gameState !== 'play') return;
    sectionPerfStart = perfStart();
    updateWorldProps(dt);
    perfEnd('update.world', sectionPerfStart);
    if (gameState !== 'play') return;
    sectionPerfStart = perfStart();
    updatePlayerStatuses(dt);
    perfEnd('update.statuses', sectionPerfStart);
    if (gameState !== 'play') return;
    sectionPerfStart = perfStart();
    updateChests();
    perfEnd('update.chests', sectionPerfStart);
    if (gameState !== 'play') return;
    sectionPerfStart = perfStart();
    updatePickups(dt);
    perfEnd('update.pickups', sectionPerfStart);
    if (gameState !== 'play') return;
    sectionPerfStart = perfStart();
    updateGardenGrowth();
    perfEnd('update.garden', sectionPerfStart);
    sectionPerfStart = perfStart();
    updateDeadBodies(dt);
    perfEnd('update.corpses', sectionPerfStart);
    sectionPerfStart = perfStart();
    updateParticles(dt);
    perfEnd('update.particles', sectionPerfStart);
    sectionPerfStart = perfStart();
    updateTransitions(dt);
    perfEnd('update.transitions', sectionPerfStart);

    sectionPerfStart = perfStart();
    if (godTimer > 0 && nextRandom('fx') < 0.4) {
      particles.push({ x: player.x + rand(-6, 6), y: player.y + rand(-6, 6), life: 0.32, c: `hsl(${(Date.now() / 8) % 360},100%,65%)` });
    }
    perfEnd('update.fx', sectionPerfStart);

    sectionPerfStart = perfStart();
    if (isPanelOpen(ui.shopPanel) && shopPanelDirty) renderShopPanel();
    if (isPanelOpen(ui.invPanel) && inventoryPanelDirty) renderInventoryPanel();
    perfEnd('update.panels', sectionPerfStart);
  }

  function tryChargedLadderWarp() {
    if (getItemCount('charged_adapter') <= 0) return;
    if (!player.escapeReady) {
      const needed = getChargeRequirement(10);
      const progress = Math.max(0, Number(player.escapeChargeKills || 0));
      particles.push({ x: player.x, y: player.y - 20, life: 0.75, text: `ADAPTER CHARGING ${progress}/${needed}`, c: '#b88cff' });
      return;
    }
    if (!currentRoom || currentRoom.type === 'boss' || currentRoom.type === 'god') {
      particles.push({ x: player.x, y: player.y - 20, life: 0.75, text: 'NO WARP IN BOSS ROOM', c: '#ff9e9e' });
      return;
    }
    if (enemies.length === 0) {
      particles.push({ x: player.x, y: player.y - 20, life: 0.75, text: 'WARP REQUIRES COMBAT', c: '#ffcf8f' });
      return;
    }

    const ladderRoom = rooms.find(room => room.type === 'ladder') || rooms.find(room => room.type === 'boss');
    if (!ladderRoom || ladderRoom === currentRoom) {
      particles.push({ x: player.x, y: player.y - 20, life: 0.75, text: 'ALREADY AT LADDER', c: '#b7ffca' });
      return;
    }

    const goldSpent = Math.floor(player.coins / 2);
    if (goldSpent > 0) {
      player.coins -= goldSpent;
      metaProgress.coins = Math.max(0, metaProgress.coins - goldSpent);
    }

    consumeCharge('escape');
    enterRoom(ladderRoom);
    particles.push({ x: player.x, y: player.y - 20, life: 0.9, text: 'WARPED TO LADDER (-50% COINS)', c: '#b66cff' });
    scheduleRunSave();
  }

