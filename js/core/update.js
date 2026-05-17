// update.js — main game loop and update tick.

export function loop(timestamp) {
    const framePerfStart = Neo.perfBeginFrame(timestamp);
    const dt = Math.min(0.033, (timestamp - Neo.lastTime) / 1000 || 0.016);
    Neo.lastTime = timestamp;
    Neo.frameId += 1;

    // Safety net: if dialogue runtime has closed but game state is still "dialogue",
    // restore play state so controls and simulation cannot get stuck.
    if (Neo.gameState === 'dialogue' && !Neo.uiController?.isDialogueOpen?.()) {
      Neo.setGameState('play');
      Neo.clearGameplayInput();
    }

    const updatePerfStart = Neo.perfStart();
    if (Neo.gameState === 'play' && !Neo.isWizardPawOpen()) update(dt);
    else if (Neo.player && (Neo.gameState === 'dialogue' || Neo.gameState === 'pause')) {
      Neo.tickPlayerTransientDefenseTimers(dt);
      Neo.stepActiveTransitionFade(dt);
    } else if (Neo.gameState === 'dying' && Neo.playerDeathAnim) {
      Neo.playerDeathAnim.timer += dt;
      if (Neo.playerDeathAnim.timer >= Neo.playerDeathAnim.duration) Neo.finalizeDeath();
    }
    Neo.perfEnd('update', updatePerfStart);
    const uiPerfStart = Neo.perfStart();
    Neo.uiController.tick(dt);
    Neo.perfEnd('Neo.ui', uiPerfStart);
    const drawPerfStart = Neo.perfStart();
    if (Neo.gameState !== 'pause') Neo.draw();
    Neo.perfEnd('Neo.draw', drawPerfStart);
    Neo.perfEndFrame(framePerfStart);
    requestAnimationFrame(loop);
  }

  function update(dt) {
    let sectionPerfStart = Neo.perfStart();
    const itemStats = Neo.getItemStats();
    Neo.compactEnemyList();
    Neo.gameElapsedTime += dt;
    Neo.lavaAnimTime += dt;
    Neo.floorTransitionTime += dt;
    if (Neo.floorTransitionTime > 2.5) Neo.showFloorTransition = false;
    Neo.tickCooldowns(dt);
    if (Neo.godTimer > 0) Neo.godTimer = Math.max(0, Neo.godTimer - dt);

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
        for (const en of Neo.enemies) {
          if (!en || en.dead) continue;
          const dx = en.x - Neo.player.x;
          const dy = en.y - Neo.player.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            nearest = en;
          }
        }
        return nearest;
      };
    })();
    if (Neo.p1DeadInCoop) { Neo.keys[_right] = false; Neo.keys[_left] = false; Neo.keys[_down] = false; Neo.keys[_up] = false; }
    const _nt = window.NeoTouch;
    if (_nt?.active) {
      // Inject touch move vector — auto-aim fires in last joystick direction
      if (Math.abs(_nt.moveX) > 0.08 || Math.abs(_nt.moveY) > 0.08) {
        Neo.keys[_right] = _nt.moveX > 0.08;
        Neo.keys[_left]  = _nt.moveX < -0.08;
        Neo.keys[_down]  = _nt.moveY > 0.08;
        Neo.keys[_up]    = _nt.moveY < -0.08;
      } else {
        Neo.keys[_right] = false; Neo.keys[_left] = false;
        Neo.keys[_down]  = false; Neo.keys[_up]   = false;
      }
      // Auto-aim toward nearest enemy, fallback to last joystick direction
      const _aimTarget = _getNearestEnemyForAim();
      const _aimDX = _aimTarget ? (_aimTarget.x - Neo.player.x) : (_nt.lastAimX * 200);
      const _aimDY = _aimTarget ? (_aimTarget.y - Neo.player.y) : (_nt.lastAimY * 200);
      Neo.mouse.worldX = Neo.player.x + _aimDX;
      Neo.mouse.worldY = Neo.player.y + _aimDY;
      Neo.mouse.x = Neo.mouse.worldX - Neo.camera.x;
      Neo.mouse.y = Neo.mouse.worldY - Neo.camera.y;
      // Attack buttons — hold while button pressed, release otherwise
      if (_nt.slash) { Neo.mouse.down = true; Neo.mouse.downQueued = true; } else { Neo.mouse.down = false; }
      if (_nt.laser) { Neo.mouse.right = true; Neo.mouse.rightQueued = true; } else { Neo.mouse.right = false; }
      if (_nt.smash) { Neo.trySmash(); _nt.smash = false; }
      if (_nt.ascend) Neo.keys[' '] = true; else if (!Neo.keys[' ']) Neo.keys[' '] = false;
      if (_nt.dash) Neo.keys[_b ? _b.dash : 'shift'] = true;
      else Neo.keys[_b ? _b.dash : 'shift'] = false;
    }
    // Gamepad 0 → P1
    const _gp0 = window.NeoGamepad?.[0];
    if (_gp0?.active && !_nt?.active) {
      if (Math.abs(_gp0.moveX) > 0.18 || Math.abs(_gp0.moveY) > 0.18) {
        Neo.keys[_right] = _gp0.moveX > 0.18;
        Neo.keys[_left]  = _gp0.moveX < -0.18;
        Neo.keys[_down]  = _gp0.moveY > 0.18;
        Neo.keys[_up]    = _gp0.moveY < -0.18;
      } else {
        Neo.keys[_right] = false; Neo.keys[_left] = false;
        Neo.keys[_down] = false; Neo.keys[_up] = false;
      }
      const _gpAimTarget = _gp0.hasAim ? null : _getNearestEnemyForAim();
      const _gpAimX = _gp0.hasAim ? _gp0.aimX * 200 : (_gpAimTarget ? _gpAimTarget.x - Neo.player.x : _gp0.lastAimX * 200);
      const _gpAimY = _gp0.hasAim ? _gp0.aimY * 200 : (_gpAimTarget ? _gpAimTarget.y - Neo.player.y : _gp0.lastAimY * 200);
      Neo.mouse.worldX = Neo.player.x + _gpAimX;
      Neo.mouse.worldY = Neo.player.y + _gpAimY;
      Neo.mouse.x = Neo.mouse.worldX - Neo.camera.x;
      Neo.mouse.y = Neo.mouse.worldY - Neo.camera.y;
      if (_gp0.slash) { Neo.mouse.down = true; Neo.mouse.downQueued = true; } else { Neo.mouse.down = false; }
      if (_gp0.laser) { Neo.mouse.right = true; Neo.mouse.rightQueued = true; } else { Neo.mouse.right = false; }
      if (_gp0.smash) { Neo.trySmash(); _gp0.smash = false; }
      if (_gp0.dash) Neo.keys[_b ? _b.dash : 'shift'] = true;
      else if (!Neo.keys[_b ? _b.dash : 'shift']) Neo.keys[_b ? _b.dash : 'shift'] = false;
      if (_gp0.start) {
        if (Neo.gameState === 'play') Neo.pauseGame();
        else if (Neo.gameState === 'pause') Neo.resumeGame();
        _gp0.start = false;
      }
    }
    let moveX = (Neo.keys[_right] || Neo.keys.arrowright ? 1 : 0) - (Neo.keys[_left] || Neo.keys.arrowleft ? 1 : 0);
    let moveY = (Neo.keys[_down]  || Neo.keys.arrowdown  ? 1 : 0) - (Neo.keys[_up]   || Neo.keys.arrowup   ? 1 : 0);
    if (Neo.currentRoom?.type !== 'shop' && Neo.isPanelOpen(Neo.ui.shopPanel)) Neo.setShopPanelOpen(false);
    if (Neo.currentRoom?.type !== 'anvil' && Neo.isPanelOpen(Neo.ui.anvilPanel)) Neo.setAnvilPanelOpen(false);
    const overlayOpen = Neo.isOverlayBlockingInput();
    if (overlayOpen) {
      moveX = 0;
      moveY = 0;
      Neo.mouse.down = false;
      Neo.mouse.right = false;
      Neo.mouse.downQueued = false;
      Neo.mouse.rightQueued = false;
    }
    const playerStunned = Number(Neo.player.stun || 0) > 0;
    if (playerStunned) {
      moveX = 0;
      moveY = 0;
      Neo.mouse.down = false;
      Neo.mouse.right = false;
      Neo.mouse.downQueued = false;
      Neo.mouse.rightQueued = false;
    }
    const moveLength = Math.hypot(moveX, moveY) || 1;
    moveX /= moveLength;
    moveY /= moveLength;
    if (moveLength < 0.1) {
      moveX = 0;
      moveY = 0;
    }

    const dashKey = _b ? _b.dash : 'shift';
    const dashHeld = !!Neo.keys[dashKey];
    if (!overlayOpen && !playerStunned && dashHeld && !Neo.dashKeyLatch) {
      Neo.tryDash(moveX, moveY);
      Neo.dashKeyLatch = true;
    } else if (!dashHeld) {
      Neo.dashKeyLatch = false;
    }

    if (playerStunned) {
      Neo.player.dashTime = 0;
      Neo.player.dashX = 0;
      Neo.player.dashY = 0;
      const friction = Math.pow(0.84, dt * 60);
      Neo.player.vx *= friction;
      Neo.player.vy *= friction;
    } else if (Neo.player.dashTime > 0) {
      Neo.player.dashTime = Math.max(0, Neo.player.dashTime - dt);
      Neo.player.vx = Neo.player.dashX;
      Neo.player.vy = Neo.player.dashY;
      Neo.player.inv = Math.max(Neo.player.inv, 0.12);
      if (Neo.player.dashTime <= 0) {
        Neo.player.dashX = 0;
        Neo.player.dashY = 0;
      }
    } else {
      const flightBoost = Neo.player.princessFlightTime > 0 ? 2 : 1;
      const targetSpeed = 228 * flightBoost * (Neo.godTimer > 0 ? 1.25 : 1) * itemStats.moveSpeedMultiplier;
      Neo.player.vx = Neo.applyResponsiveVelocity(Neo.player.vx, moveX * targetSpeed, dt);
      Neo.player.vy = Neo.applyResponsiveVelocity(Neo.player.vy, moveY * targetSpeed, dt);
      if (Neo.player.princessFlightTime > 0 && (moveX || moveY) && Neo.nextRandom('fx') < 0.35) {
        Neo.spawnParticle({ x: Neo.player.x + Neo.rand(12, -12, 'fx'), y: Neo.player.y + Neo.rand(10, -10, 'fx'), life: 0.2, c: '#ffd1ea' });
      }
    }

    Neo.moveCircle(Neo.player, dt);
    Neo.updateFirstRunTutorialProgress();

    if (Neo.player.cowardsWayTime > 0) {
      Neo.player.cowardsWayTime = Math.max(0, Neo.player.cowardsWayTime - dt);
      Neo.player.inv = Math.max(Neo.player.inv, 0.2);
      if (Neo.nextRandom('fx') < 0.4) {
        Neo.spawnParticle({ x: Neo.player.x + Neo.rand(16, -16, 'fx'), y: Neo.player.y + Neo.rand(16, -16, 'fx'), life: 0.18, c: '#92ffcf' });
      }
    }

    Neo.player.inv = Math.max(0, Neo.player.inv - dt);
    Neo.player.stun = Math.max(0, Number(Neo.player.stun || 0) - dt);
    if (Neo.player.swing > 0) Neo.player.swing = Math.max(0, Neo.player.swing - dt);

    const _vpW = Neo.isSplitScreen() ? Neo.canvas.width / 2 : Neo.canvas.width;
    const _clampedMouseX = Neo.isSplitScreen() ? Math.min(Neo.mouse.x, _vpW) : Neo.mouse.x;
    Neo.mouse.worldX = _clampedMouseX + Neo.camera.x;
    Neo.mouse.worldY = Neo.mouse.y + Neo.camera.y;
    Neo.updateWeaponSystems(dt);
    Neo.updateRivals(dt);
    Neo.updateMonsterDoorRoaming(dt);
    if (Neo.gameState !== 'play') return;

    // PVP: check if P1 melee arc hits P2
    if (Neo.gameMode === 'pvp' && Neo.player2 && Neo.player.swing > 0) {
      const _pvpDx = Neo.player2.x - Neo.player.x;
      const _pvpDy = Neo.player2.y - Neo.player.y;
      const _pvpDist = Math.hypot(_pvpDx, _pvpDy);
      if (_pvpDist < Neo.ATTACKS.melee.range + Neo.player2.r + 4 && Neo.player2.inv <= 0) {
        const _pvpAimAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
        const _pvpHitAngle = Math.atan2(_pvpDy, _pvpDx);
        const _pvpDiff = Math.abs(((_pvpHitAngle - _pvpAimAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (_pvpDiff <= Neo.ATTACKS.melee.arc) {
          Neo.damagePlayer2(Math.max(1, Neo.ATTACKS.melee.damage), _pvpHitAngle, Neo.ATTACKS.melee.push, 'pvp_p1');
        }
      }
    }
    if (!Neo.p1DeadInCoop) {
      if (Neo.getItemStats().hasRobotArm) { Neo.mouse.down = true; Neo.mouse.downQueued = true; }
      const meleeHeld = Neo.isMouseActionHeld('slash');
      const laserHeld = Neo.isMouseActionHeld('laser');
      if (!overlayOpen && meleeHeld) Neo.tryMelee();
      if (!overlayOpen && laserHeld) Neo.tryLaser();
    }
    if (Neo.keys.f && !Neo.teleportKeyLatch) {
      tryChargedLadderWarp();
      Neo.teleportKeyLatch = true;
    }
    if (!Neo.keys.f) Neo.teleportKeyLatch = false;

    if (Neo.player.lavaWalkTime > 0) {
      Neo.player.lavaWalkTime = Math.max(0, Neo.player.lavaWalkTime - dt);
      Neo.player.lavaTrailTick -= dt;
      if (Neo.player.lavaTrailTick <= 0) {
        Neo.hazards.push({
          kind: 'lava',
          x: Neo.player.x,
          y: Neo.player.y,
          r: 24 * (itemStats.aoeRadiusMultiplier || 1),
          ttl: 1.8,
          pulse: 2.5,
          wobble: 0.35,
          phase: Neo.rng() * Math.PI * 2,
        });
        Neo.player.lavaTrailTick = 0.22;
      }
    }

    if (!Neo.p1DeadInCoop) Neo.updatePlayerLaser(dt);
    if (Neo.gameMode === 'coop' || Neo.gameMode === 'pvp') {
      Neo.getLivePlayerSlots().forEach(slot => {
        if (slot.id === 2) Neo.updatePlayer2(dt);
        else if (slot.id > 2) Neo.updatePlayerN(dt, slot.getEntity(), slot.id);
      });
    }
    Neo.updateChallengeRoomState(dt);

    const cameraLead = 0.08;
    const isSplit = Neo.isSplitScreen();
    const n = isSplit ? Neo.splitPlayerCount() : 1;
    // Viewport dimensions per slot: 2 players = left/right halves, 3-4 = quad grid
    const slotW = n >= 2 ? Math.floor(Neo.canvas.width / 2) : Neo.canvas.width;
    const slotH = n >= 3 ? Math.floor(Neo.canvas.height / 2) : Neo.canvas.height;

    function trackCamera(cam, p, vW, vH) {
      const tx = p.x - vW / 2 + p.vx * cameraLead;
      const ty = p.y - vH / 2 + p.vy * cameraLead;
      cam.x += (tx - cam.x) * 8 * dt;
      cam.y += (ty - cam.y) * 8 * dt;
    }

    if (!Neo.p1DeadInCoop) trackCamera(Neo.camera, Neo.player, slotW, slotH);
    if (isSplit) {
      Neo.getLivePlayerSlots().forEach(slot => {
        if (slot.id === 1) return;
        trackCamera(slot.getCamera(), slot.getEntity(), slotW, slotH);
      });
    }
    if (Neo.shakeT > 0) {
      Neo.shakeT -= dt;
      Neo.shake *= 0.88;
    } else {
      Neo.shake = 0;
    }
    Neo.perfEnd('update.player', sectionPerfStart);

    sectionPerfStart = Neo.perfStart();
    let totalBleed = 0;
    for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = Neo.enemies[index];
      if (!enemy) continue;
      enemy.attackCd = Math.max(0, enemy.attackCd - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.inv = Math.max(0, enemy.inv - dt);
      if (enemy.spawnT > 0) { enemy.spawnT = Math.max(0, enemy.spawnT - dt); continue; }

      if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type !== 'god') {
        Neo.applyBleed(enemy, Math.max(0, itemStats.passiveBleedStacks - Neo.getStatusStacks(enemy, 'bleed')), 0.25);
      } else if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type === 'god') {
        Neo.applyBleed(enemy, Math.max(0, Math.max(1, itemStats.passiveBleedStacks - 1) - Neo.getStatusStacks(enemy, 'bleed')), 0.25);
      }

      totalBleed += Neo.updateEnemyStatuses(enemy, dt);
      if (!Neo.enemies.includes(enemy)) continue;
      const eliteTraitControlled = Neo.updateEliteEnemyTraits(enemy, dt);
      if (!Neo.enemies.includes(enemy)) continue;

      if (!eliteTraitControlled) {
        if (enemy.type === 'god') Neo.updateGod(enemy, dt);
        else if (enemy.type === 'queen_cult') Neo.updateCultQueenBoss(enemy, dt);
        else if (enemy.type === 'bulk_golem') Neo.updateBulkGolemBoss(enemy, dt);
        else if (enemy.type === 'artificer_knave') Neo.updateArtificerBoss(enemy, dt);
        else if (enemy.type === 'mirror_knight') Neo.updateMirrorChampion(enemy, dt);
        else if (enemy.type === 'mooggy') Neo.updateMooggyEnemy(enemy, dt);
        else if (enemy.type === 'rival') Neo.updateRivalEnemy(enemy, dt);
        else if (enemy.type === 'cult_mage') Neo.updateCultMageEnemy(enemy, dt);
        else if (enemy.type === 'knave') Neo.updateKnaveEnemy(enemy, dt);
        else if (enemy.type === 'sniper') Neo.updateSniperEnemy(enemy, dt);
        else if (enemy.type === 'machine_gunner') Neo.updateMachineGunnerEnemy(enemy, dt);
        else if (enemy.type === 'golem') Neo.updateGolemEnemy(enemy, dt);
        else if (enemy.type === 'summoner') Neo.updateSummonerEnemy(enemy, dt);
        else if (enemy.type === 'shield_unit') Neo.updateShieldUnitEnemy(enemy, dt);
        else if (enemy.type === 'healer') Neo.updateHealerEnemy(enemy, dt);
        else if (enemy.type === 'boss_spawner') Neo.updateBossSpawnerEnemy(enemy, dt);
        else if (enemy.type === 'laser') Neo.updateLaserEnemy(enemy, dt);
        else if (enemy.type === 'charger') Neo.updateChargerEnemy(enemy, dt);
        else Neo.updateHunterEnemy(enemy, dt);
      }

      if (!Neo.enemies.includes(enemy)) continue;
      Neo.enemyTryBreakBlockingObstacle(enemy, dt);
      Neo.moveCircle(enemy, dt);
    }

    if (itemStats.bleedHealScale > 0 && totalBleed > 0 && Neo.player.hp < Neo.player.maxHp) {
      if (Neo.player.hp < 50) Neo.player.scarfHealReady = true;
      if (Neo.player.scarfHealReady) {
        const heal = Neo.player.maxHp * 0.0006 * totalBleed * itemStats.bleedHealScale * dt;
        Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + heal);
        if (Neo.player.hp >= 50 && Neo.player.scarfHealReady) {
          Neo.consumeCharge('hemes_scarf');
        }
        if (Neo.nextRandom('fx') < 0.14) {
          Neo.spawnParticle({ x: Neo.player.x + Neo.rand(-10, 10), y: Neo.player.y - 18, life: 0.5, text: `+${Math.max(1, Math.ceil(heal * 10))}`, c: '#0f8' });
        }
      }
    }
    Neo.perfEnd('update.enemies', sectionPerfStart);
    if (Neo.gameState !== 'play') return;

    sectionPerfStart = Neo.perfStart();
    Neo.updateProjectiles(dt);
    Neo.perfEnd('update.projectiles', sectionPerfStart);
    if (Neo.gameState !== 'play') return;
    sectionPerfStart = Neo.perfStart();
    Neo.updateWorldProps(dt);
    Neo.perfEnd('update.world', sectionPerfStart);
    if (Neo.gameState !== 'play') return;
    sectionPerfStart = Neo.perfStart();
    Neo.updatePlayerStatuses(dt);
    Neo.perfEnd('update.statuses', sectionPerfStart);
    if (Neo.gameState !== 'play') return;
    sectionPerfStart = Neo.perfStart();
    Neo.updateChests();
    Neo.perfEnd('update.chests', sectionPerfStart);
    if (Neo.gameState !== 'play') return;
    sectionPerfStart = Neo.perfStart();
    Neo.updatePickups(dt);
    Neo.perfEnd('update.pickups', sectionPerfStart);
    if (Neo.gameState !== 'play') return;
    sectionPerfStart = Neo.perfStart();
    Neo.updateGardenGrowth();
    Neo.perfEnd('update.garden', sectionPerfStart);
    sectionPerfStart = Neo.perfStart();
    Neo.updateDeadBodies(dt);
    Neo.perfEnd('update.corpses', sectionPerfStart);
    sectionPerfStart = Neo.perfStart();
    Neo.updateParticles(dt);
    Neo.perfEnd('update.particles', sectionPerfStart);
    sectionPerfStart = Neo.perfStart();
    Neo.updateTransitions(dt);
    Neo.perfEnd('update.transitions', sectionPerfStart);

    sectionPerfStart = Neo.perfStart();
    if (Neo.godTimer > 0 && Neo.nextRandom('fx') < 0.4) {
      Neo.spawnParticle({ x: Neo.player.x + Neo.rand(-6, 6), y: Neo.player.y + Neo.rand(-6, 6), life: 0.32, c: `hsl(${(Date.now() / 8) % 360},100%,65%)` });
    }
    Neo.perfEnd('update.fx', sectionPerfStart);

    sectionPerfStart = Neo.perfStart();
    if (Neo.isPanelOpen(Neo.ui.shopPanel) && Neo.shopPanelDirty) Neo.renderShopPanel();
    if (Neo.isPanelOpen(Neo.ui.invPanel) && Neo.inventoryPanelDirty) Neo.renderInventoryPanel();
    Neo.perfEnd('update.panels', sectionPerfStart);
  }

  function tryChargedLadderWarp() {
    if (Neo.getItemCount('charged_adapter') <= 0) return;
    if (!Neo.player.escapeReady) {
      const needed = Neo.getChargeRequirement(10);
      const progress = Math.max(0, Number(Neo.player.escapeChargeKills || 0));
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.75, text: `ADAPTER CHARGING ${progress}/${needed}`, c: '#b88cff' });
      return;
    }
    if (!Neo.currentRoom || Neo.currentRoom.type === 'boss' || Neo.currentRoom.type === 'god') {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.75, text: 'NO WARP IN BOSS ROOM', c: '#ff9e9e' });
      return;
    }
    if (Neo.enemies.length === 0) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.75, text: 'WARP REQUIRES COMBAT', c: '#ffcf8f' });
      return;
    }

    const ladderRoom = Neo.rooms.find(room => room.type === 'ladder') || Neo.rooms.find(room => room.type === 'boss');
    if (!ladderRoom || ladderRoom === Neo.currentRoom) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.75, text: 'ALREADY AT LADDER', c: '#b7ffca' });
      return;
    }

    const goldSpent = Math.floor(Neo.player.coins / 2);
    if (goldSpent > 0) {
      Neo.player.coins -= goldSpent;
      Neo.metaProgress.coins = Math.max(0, Neo.metaProgress.coins - goldSpent);
    }

    Neo.consumeCharge('escape');
    Neo.enterRoom(ladderRoom);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.9, text: 'WARPED TO LADDER (-50% COINS)', c: '#b66cff' });
    Neo.scheduleRunSave();
  }

export { update, tryChargedLadderWarp };

Neo.loop = loop;
Neo.update = update;
Neo.tryChargedLadderWarp = tryChargedLadderWarp;
