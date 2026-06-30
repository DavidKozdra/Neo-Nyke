// update.js — main game loop and update tick.

// Seconds of holding the melee button to reach a full-power Mooggy Swipe.
const MOOGGY_SWIPE_CHARGE_MAX = 0.8;

export function updateEnemyLostSightState(enemy, playerHidden, dt = 0) {
  if (!enemy) return false;

  const lostSight = !!playerHidden;
  if (!lostSight) {
    enemy.playerLostSight = false;
    enemy.playerLostSightAge = 0;
    return false;
  }

  if (!enemy.playerLostSight) enemy.playerLostSightAge = 0;
  enemy.playerLostSight = true;
  enemy.playerLostSightAge =
    Math.max(0, Number(enemy.playerLostSightAge) || 0) +
    Math.max(0, Number(dt) || 0);
  return true;
}

export function isEnemyBlindedByHiddenPlayer(enemy, playerHidden) {
  if (enemy?.type === 'god') return false;
  if (playerHidden) return true;
  // Confuse Ray can make a single enemy *think* the player vanished: while its
  // confusion timer is live it reuses the whole lost-sight path (? mark, wander,
  // no attacks) even though the player is in plain sight.
  return Number(enemy?.confusedBlindUntil || 0) > Number(Neo.gameElapsedTime || 0);
}

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

    // --- Hitstop / freeze-frame ---------------------------------------------
    // Drain the hitstop accumulator BEFORE gameplay sim. While frozen, the world
    // simulation is paused (gives hits a satisfying "connect"), but visual feel
    // systems — shake/trauma and particles — keep advancing so the freeze reads
    // as impact, not a stutter.
    let simDt = dt;
    let frozen = false;
    if (Neo.hitstop > 0) {
      Neo.hitstop = Math.max(0, Neo.hitstop - dt);
      frozen = Neo.gameState === 'play';
      if (frozen) simDt = 0;
    }
    if (frozen) Neo.tickGameFeel(dt);

    const updatePerfStart = Neo.perfStart();
    if (frozen) { /* sim paused this frame; feel systems already ticked above */ }
    else if (Neo.gameState === 'play' && !Neo.isWizardPawOpen() && !Neo.isExtraBatteryOpen?.()) update(simDt);
    else if (Neo.player && (Neo.gameState === 'dialogue' || Neo.gameState === 'pause')) {
      Neo.tickPlayerTransientDefenseTimers(dt);
      Neo.stepActiveTransitionFade(dt);
    } else if (Neo.gameState === 'dying' && Neo.playerDeathAnim && !Neo.windowBlurred) {
      const anim = Neo.playerDeathAnim;
      anim.timer += dt;
      // Apply knockback drift, decaying as the corpse settles.
      if (anim.vx || anim.vy) {
        anim.x += anim.vx * dt;
        anim.y += anim.vy * dt;
        const decay = Math.exp(-7 * dt);
        anim.vx *= decay;
        anim.vy *= decay;
        if (Math.hypot(anim.vx, anim.vy) < 2) { anim.vx = 0; anim.vy = 0; }
      }
      if (anim.timer >= anim.duration + (anim.holdDelay || 0)) Neo.finalizeDeath();
    }
    Neo.perfEnd('update', updatePerfStart);
    const uiPerfStart = Neo.perfStart();
    Neo.uiController.tick(dt);
    Neo.tutorialController?.tick?.(dt);
    Neo.perfEnd('Neo.ui', uiPerfStart);
    const drawPerfStart = Neo.perfStart();
    if (Neo.gameState !== 'pause') Neo.draw();
    Neo.perfEnd('Neo.draw', drawPerfStart);
    Neo.updateRewardChoiceTooltip?.();
    Neo.perfEndFrame(framePerfStart);
    requestAnimationFrame(loop);
  }

  const ENEMY_UPDATE_METHOD_BY_TYPE = {
    god: 'updateGod',
    queen_cult: 'updateCultQueenBoss',
    bulk_golem: 'updateBulkGolemBoss',
    artificer_knave: 'updateArtificerBoss',
    bowman_bane: 'updateBowmanBane',
    antony_blemmye: 'updateAntonyBlemmyeBoss',
    handsome_devil: 'updateHandsomeDevilBoss',
    mirror_knight: 'updateMirrorChampion',
    mooggy: 'updateMooggyEnemy',
    rival: 'updateRivalEnemy',
    cult_mage: 'updateCultMageEnemy',
    knave: 'updateKnaveEnemy',
    sniper: 'updateSniperEnemy',
    machine_gunner: 'updateMachineGunnerEnemy',
    golem: 'updateGolemEnemy',
    summoner: 'updateSummonerEnemy',
    shield_unit: 'updateShieldUnitEnemy',
    healer: 'updateHealerEnemy',
    boss_spawner: 'updateBossSpawnerEnemy',
    laser: 'updateLaserEnemy',
    charger: 'updateChargerEnemy',
  };

  function updateEnemyByType(enemy, dt) {
    if (Neo.updateEnemyProjectileEvade?.(enemy, dt)) return;
    const methodName = ENEMY_UPDATE_METHOD_BY_TYPE[String(enemy?.type || '').toLowerCase()] || 'updateHunterEnemy';
    const handler = Neo[methodName];
    if (typeof handler === 'function') handler(enemy, dt);
  }

  // Enemy shield decay: mirrors the player overheal shield. Once a barrier has
  // been up for 5s it bleeds away at 1 point per 50ms (20/s). The age resets
  // whenever the barrier grows (a fresh shield or a top-up from a shield_unit).
  function decayEnemyBarrier(enemy, dt) {
    if (!enemy) return;
    const barrier = Number(enemy.barrier || 0);
    if (barrier <= 0) {
      enemy.barrierAge = 0;
      enemy.barrierSeen = 0;
      return;
    }
    if (barrier > Number(enemy.barrierSeen || 0)) enemy.barrierAge = 0;
    enemy.barrierAge = Number(enemy.barrierAge || 0) + dt;
    if (enemy.barrierAge > 5) {
      enemy.barrier = Math.max(0, barrier - dt / 0.05); // 1 point per 50ms
    }
    enemy.barrierSeen = enemy.barrier;
  }

  function update(dt) {
    let sectionPerfStart = Neo.perfStart();
    const itemStats = Neo.getItemStats();
    Neo.compactEnemyList();
    Neo.gameElapsedTime += dt;
    Neo.lavaAnimTime += dt;
    Neo.floorTransitionTime += dt;
    if (Neo.floorTransitionTime > 1.25) Neo.showFloorTransition = false;
    Neo.tickCooldowns(dt);
    Neo.updateEquipmentEffects?.(dt);
    if (Neo.godTimer > 0) Neo.godTimer = Math.max(0, Neo.godTimer - dt);
    // Endless mode: tick down the between-waves intermission and spawn the next
    // wave when it elapses. Frame-driven (not setTimeout) so it pauses with the
    // game and survives a save/restore.
    if (Neo.gameMode === 'endless' && Neo.endlessRespawnTimer > 0) {
      Neo.endlessRespawnTimer = Math.max(0, Neo.endlessRespawnTimer - dt);
      if (Neo.endlessRespawnTimer === 0) Neo.spawnNextEndlessWave?.();
    }
    Neo.updateTreasureHuntCollapse?.(dt);

    const _b = window.NeoSettings?.getBindings();
    const _right = _b ? _b.right : 'd';
    const _left  = _b ? _b.left  : 'a';
    const _down  = _b ? _b.down  : 's';
    const _up    = _b ? _b.up    : 'w';
    const _getNearestEnemyForAim = (() => {
      let cached = false;
      let nearest = null;
      return () => {
        if (cached && nearest && !nearest.dead && Neo.enemies.includes(nearest)) return nearest;
        cached = true;
        nearest = null;
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
      // Touch smash: NT.smash stays true while the button is held (cleared on
      // touchend), so use it directly for hold-to-charge. Edge-latch the cast.
      Neo.smashHeld = !!_nt.smash;
      if (_nt.smash) { if (!_nt.smashLatch) { _nt.smashLatch = true; Neo.trySmash(); } }
      else { _nt.smashLatch = false; }
      const _ascendKey = _b ? _b.ascend : ' ';
      if (_nt.ascend) Neo.keys[_ascendKey] = true; else Neo.keys[_ascendKey] = false;
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
      // Gamepad smash button is re-polled each frame from its held state, so use
      // it for hold-to-charge. Edge-latch so the cast only fires once per press.
      Neo.smashHeld = !!_gp0.smash;
      if (_gp0.smash) { if (!_gp0.smashLatch) { _gp0.smashLatch = true; Neo.trySmash(); } }
      else { _gp0.smashLatch = false; }
      if (_gp0.dash) Neo.keys[_b ? _b.dash : 'shift'] = true;
      else if (!Neo.keys[_b ? _b.dash : 'shift']) Neo.keys[_b ? _b.dash : 'shift'] = false;
      const _gpConsume = action => window.NeoGamepad?.consumeAction?.(0, action);
      const _gpAscendKey = _b ? _b.ascend : ' ';
      Neo.keys[_gpAscendKey] = !!_gp0.ascend;
      if (_gpConsume('interact')) window._neoGame?.triggerInteract?.();
      // The ascend button still uses the ladder (its other "climb/exit" uses are
      // contextual); route it through the same interact path when at a ladder.
      if (_gpConsume('ascend') && Neo.isAtLadder?.()) window._neoGame?.triggerInteract?.();
      if (_gpConsume('inventory')) Neo.toggleInventoryPanel?.();
      if (_gpConsume('activateAll')) Neo.activateAllEquipmentSlots?.();
      for (let _slotIndex = 1; _slotIndex <= 8; _slotIndex += 1) {
        if (!_gpConsume(`tool${_slotIndex}`)) continue;
        const _slotKey = window.NeoSettings?.getEquipmentSlotKeys?.()[_slotIndex - 1];
        if (_slotKey) Neo.activateEquipmentSlotKey?.(_slotKey);
      }
      if (_gpConsume('pause')) {
        if (Neo.gameState === 'play') Neo.pauseGame();
        else if (Neo.gameState === 'pause') Neo.resumeGame();
      }
    }
    let moveX = (Neo.keys[_right] || Neo.keys.arrowright ? 1 : 0) - (Neo.keys[_left] || Neo.keys.arrowleft ? 1 : 0);
    let moveY = (Neo.keys[_down]  || Neo.keys.arrowdown  ? 1 : 0) - (Neo.keys[_up]   || Neo.keys.arrowup   ? 1 : 0);
    if (Neo.currentRoom?.type !== 'shop' && Neo.isPanelOpen(Neo.ui.shopPanel)) Neo.setShopPanelOpen(false);
    if (Neo.currentRoom?.type !== 'anvil' && Neo.isPanelOpen(Neo.ui.anvilPanel)) Neo.setAnvilPanelOpen(false);
    if (!Neo.isSpecialRoom?.() && Neo.isPanelOpen(document.getElementById('specialRoomPanel'))) Neo.setSpecialRoomPanelOpen?.(false);
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
      const zoomiesBoost = Neo.player.mooggyZoomiesTime > 0 ? 5 : 1;
      const powerUpBoost = Neo.player.deathBallBuffTime > 0 ? 1 + Number(Neo.player.deathBallBuffPower || 0) : 1;
      const laserWeight = Math.max(0, Number(itemStats.laserWeightMultiplier ?? 1));
      const laserSlow = Neo.laserActive ? 1 - 0.6 * laserWeight : 1;
      const targetSpeed = 228 * flightBoost * zoomiesBoost * powerUpBoost * (Neo.godTimer > 0 ? 1.25 : 1) * itemStats.moveSpeedMultiplier * laserSlow;
      Neo.player.vx = Neo.applyResponsiveVelocity(Neo.player.vx, moveX * targetSpeed, dt);
      Neo.player.vy = Neo.applyResponsiveVelocity(Neo.player.vy, moveY * targetSpeed, dt);
      if (Neo.player.princessFlightTime > 0 && (moveX || moveY) && Neo.nextRandom('fx') < 0.35) {
        Neo.spawnParticle({ x: Neo.player.x + Neo.rand(12, -12, 'fx'), y: Neo.player.y + Neo.rand(10, -10, 'fx'), life: 0.2, c: '#ffd1ea' });
      }
    }

    Neo.moveCircle(Neo.player, dt);
    Neo.updateFirstRunTutorialProgress(dt);

    if (Neo.player.cowardsWayTime > 0) {
      Neo.player.cowardsWayTime = Math.max(0, Neo.player.cowardsWayTime - dt);
      Neo.player.inv = Math.max(Neo.player.inv, 0.2);
      if (Neo.nextRandom('fx') < 0.4) {
        Neo.spawnParticle({ x: Neo.player.x + Neo.rand(16, -16, 'fx'), y: Neo.player.y + Neo.rand(16, -16, 'fx'), life: 0.18, c: '#92ffcf' });
      }
    }
    if (Neo.player.mooggyZoomiesTime > 0) {
      Neo.player.mooggyZoomiesTime = Math.max(0, Neo.player.mooggyZoomiesTime - dt);
      if (Neo.nextRandom('fx') < 0.45) {
        Neo.spawnParticle({ x: Neo.player.x + Neo.rand(18, -18, 'fx'), y: Neo.player.y + Neo.rand(18, -18, 'fx'), life: 0.16, c: '#a0ffcc' });
      }
    }
    if (Neo.player.deathBallBuffTime > 0) {
      Neo.player.deathBallBuffTime = Math.max(0, Neo.player.deathBallBuffTime - dt);
      if (Neo.nextRandom('fx') < 0.4) {
        Neo.spawnParticle({ x: Neo.player.x + Neo.rand(18, -18, 'fx'), y: Neo.player.y + Neo.rand(18, -18, 'fx'), life: 0.16, c: '#7dffb0' });
      }
    }

    Neo.player.inv = Math.max(0, Neo.player.inv - dt);
    Neo.player.warpHideTime = Math.max(0, Number(Neo.player.warpHideTime || 0) - dt);
    Neo.player.stun = Math.max(0, Number(Neo.player.stun || 0) - dt);
    if (Neo.player.swing > 0) {
      Neo.player.swing = Math.max(0, Neo.player.swing - dt);
      if (Neo.player.swing === 0) Neo.player.stabSwing = false;
    }

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
        const _pvpAimAngle = Neo.angleToMouse();
        const _pvpHitAngle = Math.atan2(_pvpDy, _pvpDx);
        const _pvpDiff = Math.abs(((_pvpHitAngle - _pvpAimAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (_pvpDiff <= Neo.ATTACKS.melee.arc) {
          Neo.damagePlayer2(Math.max(1, Neo.ATTACKS.melee.damage), _pvpHitAngle, Neo.ATTACKS.melee.push, 'pvp_p1');
        }
      }
    }
    if (!Neo.p1DeadInCoop) {
      const meleeHeld = Neo.isMouseActionHeld('slash');
      const laserHeld = Neo.isMouseActionHeld('laser');
      // Robot Arm auto-runs M1: whenever it's equipped and an enemy is present,
      // it auto-aims and swings without holding the button. The charged-ready
      // state additionally applies the 8x attack-speed burst (via robotArmCharge).
      const robotArmTarget = itemStats.hasRobotArm
        ? _getNearestEnemyForAim()
        : null;
      // Mooggy Swipe: charge-on-hold. Holding the melee button builds a charge
      // meter (suppressing the per-frame swing); releasing unleashes one swipe
      // scaled by how long it was held. A quick tap still fires a normal swipe.
      const mooggyCharging = !overlayOpen && !playerStunned && Neo.isMooggySwipeActive?.();
      if (mooggyCharging) {
        if (meleeHeld) {
          Neo.player.mooggySwipeCharge = Math.min(MOOGGY_SWIPE_CHARGE_MAX, Number(Neo.player.mooggySwipeCharge || 0) + dt);
          const ratio = Neo.player.mooggySwipeCharge / MOOGGY_SWIPE_CHARGE_MAX;
          // Telegraph: pulsing motes around Mooggy that intensify as she winds up.
          if (ratio > 0.15 && Math.random() < 0.35 + ratio * 0.5) {
            const a = Math.random() * Math.PI * 2;
            const rad = 18 + ratio * 16;
            Neo.spawnParticle({
              x: Neo.player.x + Math.cos(a) * rad, y: Neo.player.y + Math.sin(a) * rad,
              life: 0.2 + ratio * 0.2, vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 40,
              c: ratio >= 0.99 ? '#ffd0e6' : '#ff6090',
            });
          }
        } else if (Number(Neo.player.mooggySwipeCharge || 0) > 0) {
          const ratio = Math.min(1, Number(Neo.player.mooggySwipeCharge || 0) / MOOGGY_SWIPE_CHARGE_MAX);
          Neo.player.mooggySwipeCharge = 0;
          Neo.releaseMooggySwipe?.(ratio);
        }
      } else if (Neo.player && Number(Neo.player.mooggySwipeCharge || 0) > 0) {
        // Charging interrupted (overlay/stun/move swap): drop the wind-up.
        Neo.player.mooggySwipeCharge = 0;
      } else {
        const chargedWeaponHeld = !!Neo.isChargedWeaponKey?.(Neo.getEquippedWeapon?.());
        const meleePressEdge = meleeHeld && !Neo._meleeWasHeld;
        const fireMelee = (meleeHeld && (!chargedWeaponHeld || meleePressEdge)) || robotArmTarget;
        if (!overlayOpen && !playerStunned && fireMelee) {
          if (Neo.player) Neo.player.mooggySwipeCharge = 0;
          const restoreAim = robotArmTarget
            ? { worldX: Neo.mouse.worldX, worldY: Neo.mouse.worldY }
            : null;
          if (restoreAim) {
            Neo.mouse.worldX = robotArmTarget.x;
            Neo.mouse.worldY = robotArmTarget.y;
          }
          Neo.tryMelee({ useRobotArmCharge: !!robotArmTarget });
          if (restoreAim) {
            Neo.mouse.worldX = restoreAim.worldX;
            Neo.mouse.worldY = restoreAim.worldY;
          }
        }
      }
      Neo._meleeWasHeld = meleeHeld;
      // Instant laser moves (e.g. Nail Shot) fire once per press instead of
      // auto-repeating every frame — otherwise holding the button drains the
      // whole charge pool in a few frames. Beam moves keep their held behavior.
      const laserPressEdge = laserHeld && !Neo._laserWasHeld;
      const fireLaser = laserHeld && (laserPressEdge || !Neo.isInstantLaserMove?.());
      if (!laserHeld && Neo.laserActive && !Neo.isInstantLaserMove?.()) Neo.endActiveLaser?.();
      if (!overlayOpen && fireLaser) Neo.tryLaser();
      Neo._laserWasHeld = laserHeld;
    }

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
          // Floor Is Lava trail puddles deal direct DPS to enemies (authored
          // lava-room hazards leave this unset and stay fire-only).
          dps: 14 * (itemStats.aoeDamageMultiplier || 1),
          source: 'floor_lava',
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
    Neo.tickGameFeel(dt);
    Neo.perfEnd('update.player', sectionPerfStart);

    sectionPerfStart = Neo.perfStart();
    let totalBleed = 0;
    const playerHidden = Neo.isPlayerHidden?.(Neo.player) || false;
    // Build the enemy spatial index up front so per-enemy neighbour queries this
    // frame (e.g. minor-pack pressure) hit the cache instead of each rebuilding a
    // fresh index. Enemy movement within the loop makes it marginally stale, which
    // is fine for soft proximity checks. updateProjectiles refreshes it later.
    Neo.ensureEnemySpatialIndex?.();
    for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = Neo.enemies[index];
      if (!enemy) continue;
      Neo.updateMinorEnemyPackPressure?.(enemy);
      const minorPackCooldownRate = Math.max(1, Number(enemy.minorPackCooldownRate || 1));
      const enemyLevelAttackSpeed = Math.max(1, Number(enemy.enemyLevelAttackSpeedMultiplier || 1));
      enemy.attackCd = Math.max(0, enemy.attackCd - dt * minorPackCooldownRate * enemyLevelAttackSpeed);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.inv = Math.max(0, enemy.inv - dt);
      if (enemy.critSparkle > 0) enemy.critSparkle = Math.max(0, enemy.critSparkle - dt);
      if (enemy.spawnT > 0) { enemy.spawnT = Math.max(0, enemy.spawnT - dt); continue; }

      if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type !== 'god') {
        Neo.applyBleed(enemy, Math.max(0, itemStats.passiveBleedStacks - Neo.getStatusStacks(enemy, 'bleed')), 0.25);
      } else if (!enemy.bleedImmune && itemStats.passiveBleedStacks > 0 && enemy.type === 'god') {
        Neo.applyBleed(enemy, Math.max(0, Math.max(1, itemStats.passiveBleedStacks - 1) - Neo.getStatusStacks(enemy, 'bleed')), 0.25);
      }

      totalBleed += Neo.updateEnemyStatuses(enemy, dt);
      if (enemy.dead) continue;
      enemy.attackAnimT = Math.max(0, Number(enemy.attackAnimT || 0) - dt);

      const bountyTargetControlled = Neo.updateBountyTarget?.(enemy, dt) || false;
      if (enemy.dead) continue;
      if (bountyTargetControlled) {
        Neo.moveCircle(enemy, dt);
        continue;
      }

      const enemyLostSight = updateEnemyLostSightState(
        enemy,
        isEnemyBlindedByHiddenPlayer(enemy, playerHidden),
        dt,
      );
      if (enemyLostSight) {
        // Player is invisible/untouchable (cape, flying, coward's way, warp): enemies
        // lose their target. Skip all AI/attack logic and let them wander to random
        // points so they roam the room instead of standing frozen in place.
        Neo.wanderEnemy(enemy, dt);
      } else {
        const eliteTraitControlled = Neo.updateEliteEnemyTraits(enemy, dt);
        if (enemy.dead) continue;
        if (!eliteTraitControlled) {
          updateEnemyByType(enemy, dt);
        }
      }

      if (enemy.dead) continue;
      decayEnemyBarrier(enemy, dt);
      Neo.applyObeliskSeekerSteering?.(enemy, dt);
      Neo.enemyTryBreakBlockingObstacle(enemy, dt);
      Neo.moveCircle(enemy, dt);
    }

    if (itemStats.bleedHealScale > 0 && totalBleed > 0 && Neo.player.hp < Neo.player.maxHp) {
      if (Neo.player.hp < 50) Neo.player.scarfHealReady = true;
      if (Neo.player.scarfHealReady) {
        const heal = Neo.scalePlayerHealing(Neo.player.maxHp * 0.0006 * totalBleed * itemStats.bleedHealScale * dt);
        const gained = Neo.applyPlayerHealing?.(heal, { showBarrier: false }) ?? 0;
        if (Neo.player.hp >= 50 && Neo.player.scarfHealReady) {
          Neo.consumeCharge('hemes_scarf');
        }
        if (gained > 0 && Neo.nextRandom('fx') < 0.14) {
          Neo.spawnHealPopup(Neo.player.x + Neo.rand(-10, 10), Neo.player.y - 18, gained, { color: '#0f8' });
        }
      }
    }
    Neo.perfEnd('update.enemies', sectionPerfStart);
    if (Neo.gameState !== 'play') return;

    sectionPerfStart = Neo.perfStart();
    Neo.updateProjectiles(dt);
    Neo.perfEnd('update.projectiles', sectionPerfStart);
    if (Neo.gameState !== 'play') return;
    Neo.updateJusticeBlades?.(dt);
    if (Neo.gameState !== 'play') return;
    Neo.updateSkySwords?.(dt);
    if (Neo.gameState !== 'play') return;
    Neo.updateHealingZoneCharge?.(dt);
    if (Neo.gameState !== 'play') return;
    Neo.updateDeathBallCharge?.(dt);
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
    Neo.updateSpecialRoomProgress?.();
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
      const needed = Neo.getChargeRequirement(20);
      const progress = Math.max(0, Number(Neo.player.escapeChargeKills || 0));
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.75, text: `ADAPTER CHARGING ${progress}/${needed}`, c: '#b88cff' });
      return;
    }
    if (!Neo.currentRoom || Neo.currentRoom.type === 'boss' || Neo.currentRoom.type === 'god') {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.75, text: 'NO WARP IN BOSS ROOM', c: '#ff9e9e' });
      return;
    }

    const ladderRoom = Neo.rooms.find(room => room.type === 'ladder') || Neo.rooms.find(room => room.type === 'boss');
    if (!ladderRoom || ladderRoom === Neo.currentRoom) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.75, text: 'ALREADY AT LADDER', c: '#b7ffca' });
      return;
    }

    // Don't stack a second gate if one is already open in this room.
    if (Neo.pickups.some(pickup => pickup?.type === 'adapterPortal')) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.6, text: 'PORTAL ALREADY OPEN', c: '#b88cff' });
      return;
    }

    // Spend the adapter charge now (the press is what opens the gate), but defer
    // the coin cost and the actual warp until the player walks into the portal.
    Neo.consumeCharge('escape');

    const preferred = Neo.findSafePointNearTarget(Neo.player.x, Neo.player.y - 96, 24, 180, 20);
    const fallback = Neo.findSafePointNearTarget(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 24, 240, 20) || Neo.findSafeSpawnPoint();
    const spawnPoint = preferred || fallback;
    Neo.pickups.push({
      x: spawnPoint.x,
      y: spawnPoint.y,
      type: 'adapterPortal',
      // Store grid coords, not the room object — keeps the pickup serializable and
      // avoids a stale reference after save/restore (resolved at walk-in time).
      targetGx: ladderRoom.gx,
      targetGy: ladderRoom.gy,
      spawnT: 0,
      activateAt: Neo.JESTER_PORTAL_ACTIVATE_DELAY,
      active: false,
    });
    Neo.ringBurst(spawnPoint.x, spawnPoint.y, 28, '#b88cff', 0.5);
    Neo.spawnParticle({ x: spawnPoint.x, y: spawnPoint.y - 20, life: 0.8, text: 'LADDER PORTAL', c: '#d6c4ff' });
    Neo.scheduleRunSave();
  }

// --- Game feel: trauma shake + directional kick + hitstop --------------------

const FEEL = {
  maxShake: 28,        // px, the offset magnitude at trauma === 1
  traumaDecay: 2.2,    // trauma units/sec (≈0.45s to fully settle from 1.0)
  kickDecay: 7,        // directional kick spring-back rate (lower = camera lurch lingers)
  maxHitstop: 0.12,    // clamp so chained hits can't lock the sim
};

// Tracks the previous frame's legacy shake (as a 0..1 trauma) so tickGameFeel can
// rumble once on the rising edge of a Neo.shake-based impact. See tickGameFeel.
let _prevLegacyTrauma = 0;

// Add screen trauma (0..1, accumulates). Offset rendered ∝ trauma² so light hits
// barely shake and heavy hits slam. Optional `angle` points AWAY from the impact
// source so the camera kicks back from the blow.
function addTrauma(amount, angle = null, kick = 0) {
  Neo.trauma = Neo.clamp((Neo.trauma || 0) + amount, 0, 1);
  if (angle !== null && kick > 0) {
    Neo.shakeKickX += Math.cos(angle) * kick;
    Neo.shakeKickY += Math.sin(angle) * kick;
  }
  // Mirror the impact onto controller haptics. Trauma is already the game's
  // canonical "how hard did that hit" value, so every existing call site —
  // melee, explosions, boss slams — gets rumble for free. A directional kick
  // marks a punchy discrete hit, so bias those stronger/longer than ambient
  // shake (e.g. the bomb charge-up, which calls addTrauma every frame and is
  // coalesced inside NeoGamepad.rumble so it doesn't restart the motor 60×/s).
  const t = Neo.clamp(Number(amount) || 0, 0, 1);
  if (t > 0.02) {
    const punchy = kick > 0;
    const strong = Math.min(1, t * (punchy ? 1.1 : 0.8));
    const weak = Math.min(1, t * (punchy ? 0.85 : 0.55));
    const ms = punchy ? 90 + t * 160 : 60 + t * 90;
    window.NeoGamepad?.rumble?.(strong, weak, ms);
  }
}

// Freeze the gameplay sim for `seconds` (visual feel keeps running). Stacks up to
// a clamp so combos still feel punchy without locking up.
function addHitstop(seconds) {
  if (!(seconds > 0)) return;
  Neo.hitstop = Math.min(FEEL.maxHitstop, (Neo.hitstop || 0) + seconds);
}

// Advance feel timers. Called from update() during normal play AND directly from
// loop() during a hitstop freeze, so shake/kick never stall mid-impact.
function tickGameFeel(dt) {
  if (Neo.trauma > 0) {
    Neo.trauma = Math.max(0, Neo.trauma - FEEL.traumaDecay * dt);
  }
  // Legacy compatibility: older call sites still set Neo.shake/shakeT directly.
  // Fold any such linear shake into trauma-equivalent so both models coexist.
  if (Neo.shakeT > 0) {
    // Rising edge of a legacy shake = a fresh discrete impact (death, smash,
    // boss slam) that bypassed addTrauma. Rumble once on that edge so these get
    // haptics too, without firing every frame as the shake decays.
    const legacyTrauma = Neo.clamp((Neo.shake || 0) / FEEL.maxShake, 0, 1);
    if (legacyTrauma > (_prevLegacyTrauma + 0.05)) {
      window.NeoGamepad?.rumble?.(Math.min(1, legacyTrauma * 1.1), Math.min(1, legacyTrauma * 0.85), 90 + legacyTrauma * 160);
    }
    _prevLegacyTrauma = legacyTrauma;
    Neo.shakeT = Math.max(0, Neo.shakeT - dt);
    if (legacyTrauma > Neo.trauma) Neo.trauma = legacyTrauma;
    Neo.shake = (Neo.shake || 0) * 0.88;
  } else {
    _prevLegacyTrauma = 0;
  }
  // Derive the render-facing shake magnitude from the trauma curve (offset ∝ t²).
  const t = Neo.trauma;
  Neo.shake = Math.max(Neo.shake || 0, FEEL.maxShake * t * t);
  if (Neo.shakeT <= 0 && t <= 0) Neo.shake = 0;
  // Spring the directional kick back toward zero.
  const decay = Math.max(0, 1 - FEEL.kickDecay * dt);
  Neo.shakeKickX *= decay;
  Neo.shakeKickY *= decay;
  if (Math.abs(Neo.shakeKickX) < 0.05) Neo.shakeKickX = 0;
  if (Math.abs(Neo.shakeKickY) < 0.05) Neo.shakeKickY = 0;
}

export { update, tryChargedLadderWarp };

Neo.loop = loop;
Neo.update = update;
Neo.tryChargedLadderWarp = tryChargedLadderWarp;
Neo.addTrauma = addTrauma;
Neo.addHitstop = addHitstop;
Neo.tickGameFeel = tickGameFeel;
// Convenience aliases; the implementation lives in gamepadControls.js, which
// loads before neo.js (so it can't attach to Neo itself). Guarded so a missing
// gamepad layer is a no-op rather than a crash.
Neo.rumble = (...args) => window.NeoGamepad?.rumble?.(...args);
Neo.stopRumble = (...args) => window.NeoGamepad?.stopRumble?.(...args);
