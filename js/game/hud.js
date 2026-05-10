  function getObjectiveEntries(lineObjective = '') {
    if (isFirstRunTutorialActive()) return getTutorialObjectiveEntries();
    if (!currentRoom) return [];
    const entries = [];
    if (floor < MAX_FLOOR || floor > MAX_FLOOR) {
      const ladderRoom = rooms.find(room => room.type === 'ladder');
      entries.push({
        text: ladderRoom?.explored ? 'Reach the ladder room' : 'Find the ladder',
        state: currentRoom.type === 'ladder' ? 'done' : 'todo',
      });
      if (currentRoom.type === 'ladder') {
        const ladderHint = formatControlLabel('space', 'space');
        entries.push({
          text: currentRoom.cleared ? `Ladder room cleared - press ${ladderHint} at ladder to continue` : 'Clear the ladder room',
          state: currentRoom.cleared ? 'done' : 'warn',
        });
      }
      if (currentRoom.type === 'boss') {
        entries.push({
          text: currentRoom.cleared ? 'Floor boss defeated' : 'Kill the floor boss',
          state: currentRoom.cleared ? 'done' : 'warn',
        });
      }
      if (currentRoom.type === 'challenge') {
        entries.push({
          text: lineObjective || 'Complete the trial',
          state: currentRoom.challengeFailed ? 'warn' : currentRoom.cleared ? 'done' : 'warn',
        });
      }
      if (currentRoom.type === 'treasure') {
        const unopened = chests.filter(chest => !chest.open).length;
        entries.push({
          text: unopened > 0 ? `Open treasure chests: ${unopened}` : 'Treasure claimed',
          state: unopened > 0 ? 'warn' : 'done',
        });
      }
      if (currentRoom.type === 'shop') entries.push({ text: 'Buy upgrades or move on', state: 'warn' });
      if (currentRoom.type === 'anvil') entries.push({ text: 'Forge upgrades or move on', state: 'warn' });
      if (getItemCount('charged_adapter') > 0) {
        const warpHint = formatControlLabel('f', 'f');
        const needed = getChargeRequirement(10);
        const progress = Math.max(0, Number(player?.escapeChargeKills || 0));
        if (player?.escapeReady) {
          entries.push({ text: `Charged Adapter ready: press ${warpHint} to warp to ladder (cost 50% coins)`, state: 'warn' });
        } else {
          entries.push({ text: `Charged Adapter charging: ${progress}/${needed} kills`, state: 'todo' });
        }
      }
      if (enemies.some(enemy => enemy.miniBoss)) entries.push({ text: 'Defeat the mini boss', state: 'warn' });
      if (selectedChallenges.length > 0) entries.push({ text: `${selectedChallenges.length} challenge${selectedChallenges.length === 1 ? '' : 's'} active`, state: 'todo' });
      return entries.slice(0, 5);
    }

    entries.push({
      text: currentRoom.type === 'god' ? 'Enter GOD chamber' : 'Reach GOD',
      state: currentRoom.type === 'god' ? 'done' : 'todo',
    });
    if (currentRoom.type === 'god') {
      entries.push({
        text: currentRoom.cleared ? 'GOD defeated' : currentRoom.bossStarted ? 'Survive GOD' : 'Start the GOD fight',
        state: currentRoom.cleared ? 'done' : 'warn',
      });
      if (currentRoom.cleared) entries.push({ text: hasLegacy('endless_descent') ? 'Crown, Descend, or Loop' : 'Take the crown or loop', state: 'warn' });
    }
    return entries.slice(0, 5);
  }

  function updateObjective() {
    if (!currentRoom) {
      uiController.setTutorialBanner('', false);
      return;
    }
    if (isFirstRunTutorialActive()) {
      const tutorialText = getTutorialStepMessage();
      uiController.setTutorialBanner(tutorialText, true);
      uiController.setObjective(tutorialText);
      uiController.setObjectiveList('Tutorial', getTutorialObjectiveEntries());
      return;
    }
    uiController.setTutorialBanner('', false);
    let objective = 'Find the ladder.';
    const setObjective = text => {
      uiController.setObjective(text);
      uiController.setObjectiveList(getRoomLabel(currentRoom.type), getObjectiveEntries(text));
    };
    if (gameMode === 'endless') {
      const displayWave = endlessWave + (endlessWaveActive ? 1 : 0);
      if (!endlessWaveActive) {
        setObjective(endlessWave === 0 ? 'Survive the first wave.' : `Wave ${endlessWave} cleared. Survive the next wave.`);
      } else {
        setObjective(`Survive wave ${displayWave}.`);
      }
      return;
    }
    if (gameMode === 'boss_rush') {
      if (bossRushActive) {
        const bossName = getBossDisplayName(BOSS_RUSH_ORDER[bossRushStage] || BOSS_RUSH_ORDER[0]);
        setObjective(`Defeat ${bossName}.`);
      } else {
        const nextBoss = BOSS_RUSH_ORDER[bossRushStage];
        if (nextBoss) {
          setObjective(`Next: ${getBossDisplayName(nextBoss)}. Get ready.`);
        } else {
          setObjective('Boss Rush complete!');
        }
      }
      return;
    }
    if (floor < MAX_FLOOR) {
      if (currentRoom.type === 'shop') {
        setObjective('Shop or move on.');
        return;
      }
      if (currentRoom.type === 'anvil') {
        setObjective('Forge upgrades or move on.');
        return;
      }
      if (currentRoom.type === 'challenge') {
        const type = currentRoom.challengeType || 'mirror';
        if (currentRoom.challengeFailed) {
          setObjective('Trial failed. Move on.');
        } else if (currentRoom.cleared) {
          setObjective('Trial cleared. Claim the reward or move on.');
        } else if (!currentRoom.challengeStarted) {
          if (type === 'mirror') setObjective('Touch the sword to face your mirror.');
          else if (type === 'stillness') setObjective('Begin the stillness trial.');
          else if (type === 'bomb') setObjective('Begin the bomb trial.');
          else if (type === 'survival') setObjective('Begin the survival trial.');
          else if (type === 'runes') setObjective('Begin the rune hunt.');
          else if (type === 'storm') setObjective('Begin the storm trial.');
        } else {
          if (type === 'mirror') setObjective('Defeat your mirror champion.');
          else if (type === 'stillness') setObjective(`Hold still for ${Math.ceil(currentRoom.challengeTimer || 0)}s.`);
          else if (type === 'bomb') setObjective('Find the one bomb you can safely disarm.');
          else if (type === 'survival') setObjective(`Survive for ${Math.ceil(currentRoom.challengeTimer || 0)}s.`);
          else if (type === 'runes') setObjective(`Collect the remaining runes: ${Math.max(0, Number(currentRoom.challengeData?.runesLeft || 0))}.`);
          else if (type === 'storm') setObjective(`Live through the storm for ${Math.ceil(currentRoom.challengeTimer || 0)}s.`);
        }
        return;
      }
      if (currentRoom.type === 'boss' && !currentRoom.cleared) {
        setObjective('Defeat the floor boss.');
        return;
      }
      objective = currentRoom.type === 'ladder' && !currentRoom.cleared ? 'Clear the ladder room.' : 'Find the ladder.';
      setObjective(objective);
      return;
    }
    if (currentRoom.type !== 'god') {
      setObjective('Reach GOD.');
      return;
    }
    if (currentRoom.cleared) {
      setObjective('Take the crown.');
      return;
    }
    if (currentRoom.bossStarted) {
      setObjective('Survive GOD.');
      return;
    }
    setObjective('Fight GOD or loop with your gear.');
  }

  function getPlayerSlotScoreText(slot) {
    if (gameMode !== 'pvp' || !pvpState) return '';
    const kills = slot.id === 1 ? pvpState.p1Kills : slot.id === 2 ? pvpState.p2Kills : 0;
    return `K:${kills || 0}/${pvpState.killsToWin}`;
  }

  function getHpFillColor(percent, fallbackColor) {
    if (percent <= 0) return '#485060';
    if (percent > 70) return '#4cbb5a';
    if (percent > 50) return '#d4b840';
    if (percent > 25) return '#d98134';
    return fallbackColor || '#c04040';
  }

  function renderPlayerStatsPanel() {
    if (!ui.playerStats) return;
    const slots = getActivePlayerSlots();
    const activeIds = new Set(slots.map(slot => String(slot.id)));
    ui.playerStats.classList.toggle('player-stats--split', slots.length > 1);
    ui.playerStats.querySelectorAll('[data-player-slot]').forEach(card => {
      if (!activeIds.has(card.dataset.playerSlot || '')) card.remove();
    });
    slots.forEach(slot => {
      const entity = slot.getEntity();
      if (!entity) return;
      const character = CHARACTER_DEFS[entity.character || slot.getCharacter()] || CHARACTER_DEFS.thorn_knight;
      const dead = slot.getDead();
      const hpPercent = dead ? 0 : Math.max(0, Math.min(100, (entity.hp / Math.max(1, entity.maxHp)) * 100));
      const xpPercent = Math.max(0, Math.min(100, (Number(entity.xp || 0) / Math.max(1, Number(entity.xpToNext || 1))) * 100));
      const scoreText = getPlayerSlotScoreText(slot);
      const hpText = dead ? 'DOWN' : `${Math.ceil(entity.hp)}/${entity.maxHp}`;
      const metaText = scoreText || `${entity.coins || 0} coins`;
      const showPlayerLabel = slots.length > 1;
      let card = ui.playerStats.querySelector(`[data-player-slot="${slot.id}"]`);
      if (!card) {
        card = document.createElement('section');
        card.className = 'player-stat-card';
        card.dataset.playerSlot = String(slot.id);
        card.innerHTML = `
          <div class="player-stat-head">
            <span class="player-stat-label"><i class="player-stat-dot"></i><span data-player-field="label"></span></span>
            <span class="player-stat-name" data-player-field="name"></span>
          </div>
          <div class="player-stat-row">
            <span>HP</span>
            <div class="bar player-hp-bar"><i class="player-stat-fill" data-player-field="hpFill"></i></div>
            <span data-player-field="hpText"></span>
          </div>
          <div class="player-stat-row">
            <span>XP</span>
            <span class="player-level-badge" data-player-field="level"></span>
            <div class="bar player-xp-bar"><i class="player-stat-fill player-stat-fill--xp" data-player-field="xpFill"></i></div>
            <span data-player-field="xpText"></span>
          </div>
          <div class="player-stat-row">
            <span>INF</span>
            <span></span>
            <span data-player-field="meta"></span>
          </div>`;
        ui.playerStats.appendChild(card);
      }
      card.style.setProperty('--player-color', slot.color);
      card.classList.toggle('player-stat-card--dead', dead);
      card.classList.toggle('player-stat-card--solo', !showPlayerLabel);
      card.querySelector('[data-player-field="label"]').textContent = showPlayerLabel ? slot.label : '';
      card.querySelector('[data-player-field="name"]').textContent = character.name || slot.getCharacter();
      card.querySelector('[data-player-field="hpText"]').textContent = hpText;
      card.querySelector('[data-player-field="level"]').textContent = `Lv.${entity.level || 1}`;
      card.querySelector('[data-player-field="xpText"]').textContent = `${entity.xp || 0}/${entity.xpToNext || 0}`;
      card.querySelector('[data-player-field="meta"]').textContent = metaText;
      const hpFill = card.querySelector('[data-player-field="hpFill"]');
      const xpFill = card.querySelector('[data-player-field="xpFill"]');
      if (hpFill) {
        hpFill.style.width = `${hpPercent.toFixed(1)}%`;
        hpFill.style.background = getHpFillColor(hpPercent, slot.color);
      }
      if (xpFill) xpFill.style.width = `${xpPercent.toFixed(1)}%`;
    });

    if (ui.playerHpFill && player) {
      const p1Percent = Math.max(0, Math.min(100, (player.hp / Math.max(1, player.maxHp)) * 100));
      ui.playerHpFill.style.width = `${p1Percent}%`;
      ui.playerHpFill.style.background = getHpFillColor(p1Percent, PLAYER_SLOT_CONFIG[0].color);
      ui.playerHpTxt.textContent = gameMode === 'pvp' && pvpState
        ? `${Math.ceil(player.hp)} | ${getPlayerSlotScoreText(PLAYER_SLOT_CONFIG[0])}`
        : `${Math.ceil(player.hp)}/${player.maxHp}`;
    }
    if (ui.playerXpFill && player) {
      const xpPercent = Math.max(0, Math.min(100, (player.xp / Math.max(1, player.xpToNext)) * 100));
      ui.playerXpFill.style.width = `${xpPercent}%`;
      ui.playerXpTxt.textContent = `${player.xp}/${player.xpToNext}`;
      const levelEl = document.getElementById('playerLevelTxt');
      if (levelEl) levelEl.textContent = `Lv.${player.level || 1}`;
    }
  }

  function updateHud() {
    if (!player) return;
    const character = getCharacterDef();
    const meleeMove = MOVE_DEFS[getEquippedMove('melee')];
    const weaponKey = getEquippedWeapon();
    const weaponDef = WEAPON_DEFS[weaponKey];
    const laserMove = MOVE_DEFS[getEquippedMove('laser')];
    const smashMove = MOVE_DEFS[getEquippedMove('smash')];
    const dashMove = MOVE_DEFS[getEquippedMove('dash')];
    const attackSpeed = getAttackSpeedValue();
    const laserMoveKey = laserMove?.key || getEquippedMove('laser');
    const meleeSkill = getSkillCooldownInfo('melee', attackSpeed);
    const laserSkill = getSkillCooldownInfo('laser', attackSpeed);
    const smashSkill = getSkillCooldownInfo('smash', attackSpeed);
    const dashSkill = getSkillCooldownInfo('dash', attackSpeed);
    if (laserActive) {
      laserSkill.current = laserTime;
      laserSkill.max = getLaserCastDuration(laserMoveKey);
    }
    if (weaponDef) {
      meleeSkill.current = Number(player.weaponCooldown || 0);
      meleeSkill.max = getWeaponBaseCooldown(weaponKey);
      meleeSkill.charges = meleeSkill.current > 0 ? 0 : 1;
      meleeSkill.maxCharges = 1;
    }
    const minutes = Math.floor(gameElapsedTime / 60);
    const seconds = Math.floor(gameElapsedTime % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    uiController.setHudValues({
      floor,
      level: player.level,
      xpText: `${player.xp}/${player.xpToNext}`,
      coins: player.coins,
      character: character.name.toUpperCase(),
      hp: player.hp,
      maxHp: player.maxHp,
      meleeCd: meleeSkill.current,
      laserCd: laserSkill.current,
      smashCd: smashSkill.current,
      dashCd: dashSkill.current,
      gameTime: timeStr,
      difficultyName: getDifficultyDef(selectedDifficulty).name,
      itemRarityCounts: getItemRarityCounts(player),
      skills: {
        melee: { current: meleeSkill.current, max: meleeSkill.max, active: false, charges: meleeSkill.charges, maxCharges: meleeSkill.maxCharges },
        laser: { current: laserSkill.current, max: laserSkill.max, active: laserActive, charges: laserSkill.charges, maxCharges: laserSkill.maxCharges },
        smash: { current: smashSkill.current, max: smashSkill.max, active: false, charges: smashSkill.charges, maxCharges: smashSkill.maxCharges },
        dash: { current: dashSkill.current, max: dashSkill.max, active: player.dashTime > 0 || player.cowardsWayTime > 0 || player.princessFlightTime > 0, charges: dashSkill.charges, maxCharges: dashSkill.maxCharges },
      },
    });
    ui.skillNames.dash.textContent = dashMove?.name || character.skills.dash;
    ui.skillNames.melee.textContent = weaponDef?.name || meleeMove?.name || character.skills.melee;
    ui.skillNames.laser.textContent = laserMove?.name || character.skills.laser;
    ui.skillNames.smash.textContent = smashMove?.name || character.skills.smash;
    syncCharacterUiTheme();
    renderPlayerStatsPanel();
    
    // Update center display
    if (ui.coinCount) ui.coinCount.textContent = player.coins;
    if (ui.hudLoopCount) ui.hudLoopCount.textContent = Number(metaProgress.loopCrystals || 0);
    if (ui.timerDisplay) ui.timerDisplay.textContent = timeStr;
    if (ui.floorDisplay) ui.floorDisplay.textContent = floor;
    if (ui.difficultyDisplay) ui.difficultyDisplay.textContent = getDifficultyDef(selectedDifficulty).name.toUpperCase();
    if (ui.itemRarityCounts) {
      const rarityCounts = getItemRarityCounts(player);
      const white = ui.itemRarityCounts.querySelector('.rarity-count--white');
      const purple = ui.itemRarityCounts.querySelector('.rarity-count--purple');
      const red = ui.itemRarityCounts.querySelector('.rarity-count--red');
      if (white) white.textContent = String(rarityCounts.white);
      if (purple) purple.textContent = String(rarityCounts.purple);
      if (red) red.textContent = String(rarityCounts.red);
    }
    if (ui.challengeStatus && ui.challengeStatusFill) {
      const timedChallengeType = currentRoom
        && currentRoom.type === 'challenge'
        && currentRoom.challengeStarted
        && !currentRoom.cleared
        ? (currentRoom.challengeType || 'mirror')
        : null;
      const timedChallengeActive = timedChallengeType === 'stillness' || timedChallengeType === 'runes';
      ui.challengeStatus.classList.toggle('hidden', !timedChallengeActive);
      ui.challengeStatus.setAttribute('aria-hidden', timedChallengeActive ? 'false' : 'true');
      if (timedChallengeActive) {
        const maxTimer = Math.max(0.01, Number(currentRoom.challengeData?.maxTimer || 30));
        const timer = Math.max(0, Number(currentRoom.challengeTimer || 0));
        const ratio = Math.max(0, Math.min(1, timer / maxTimer));
        if (ui.challengeStatusLabel) {
          const label = timedChallengeType === 'runes' ? 'RUNES' : 'STILLNESS';
          ui.challengeStatusLabel.textContent = `${label} ${Math.ceil(timer)}S`;
        }
        ui.challengeStatusFill.style.width = `${ratio * 100}%`;
      }
    }

    if (ui.adapterStatus) {
      const hasAdapter = getItemCount('charged_adapter') > 0;
      const showAdapter = hasAdapter && (gameState === 'play' || gameState === 'pause');
      if (ui.hudLower) {
        ui.hudLower.classList.toggle('hidden', !showAdapter);
        ui.hudLower.setAttribute('aria-hidden', showAdapter ? 'false' : 'true');
      }
      ui.adapterStatus.classList.toggle('hidden', !showAdapter);
      ui.adapterStatus.setAttribute('aria-hidden', showAdapter ? 'false' : 'true');
      ui.adapterStatus.classList.toggle('is-ready', false);
      ui.adapterStatus.classList.toggle('is-blocked', false);
      const adapterItem = itemRegistry.get('charged_adapter') || ITEM_DEFS.charged_adapter;
      if (showAdapter && ui.adapterStatusIcon && adapterItem) drawItemToastIcon(ui.adapterStatusIcon, adapterItem);
      if (showAdapter) {
        const warpKey = formatControlLabel('f', 'f');
        const needed = getChargeRequirement(10);
        const progress = Math.max(0, Number(player?.escapeChargeKills || 0));
        if (!player.escapeReady) {
          if (ui.adapterStatusText) ui.adapterStatusText.textContent = `Adapter [${warpKey}]: charging ${progress}/${needed}`;
          ui.adapterStatus.classList.add('is-blocked');
        } else if (!currentRoom || currentRoom.type === 'boss' || currentRoom.type === 'god') {
          if (ui.adapterStatusText) ui.adapterStatusText.textContent = `Adapter [${warpKey}]: no warp in boss room`;
          ui.adapterStatus.classList.add('is-blocked');
        } else if (enemies.length === 0) {
          if (ui.adapterStatusText) ui.adapterStatusText.textContent = `Adapter [${warpKey}]: requires active combat`;
          ui.adapterStatus.classList.add('is-blocked');
        } else {
          if (ui.adapterStatusText) ui.adapterStatusText.textContent = `Adapter [${warpKey}]: ready - warp to ladder (50% coin cost)`;
          ui.adapterStatus.classList.add('is-ready');
        }
      } else if (ui.adapterStatusText) {
        ui.adapterStatusText.textContent = '';
      }
    }
    
    if (ui.interactPrompt) {
      const shopHint = getControlHint('e', 'e');
      const isShop = currentRoom?.type === 'shop' && !isPanelOpen(ui.shopPanel);
      const isAnvil = currentRoom?.type === 'anvil' && !isPanelOpen(ui.anvilPanel);
      if (isShop) {
        ui.interactPrompt.textContent = `[${shopHint}]  Open Shop`;
        ui.interactPrompt.classList.remove('hidden', 'interact-prompt--forge');
      } else if (isAnvil) {
        ui.interactPrompt.textContent = `[${shopHint}]  Open Forge`;
        ui.interactPrompt.classList.remove('hidden');
        ui.interactPrompt.classList.add('interact-prompt--forge');
      } else {
        ui.interactPrompt.classList.add('hidden');
      }
    }

    updateItemUI();
  }

  function finalizeRun(result, extra = {}) {
    const previousRecords = deriveRunRecords(runHistory);
    const entry = buildRunHistoryEntry(result, extra);
    pushRunHistoryEntry(entry);
    const nextRecords = syncMetaRecordsFromRunHistory();
    const newRecords = {};
    if (nextRecords.floor > previousRecords.floor && entry.floor >= nextRecords.floor) newRecords.floor = true;
    if (nextRecords.kills > previousRecords.kills && entry.kills >= nextRecords.kills) newRecords.kills = true;
    if (nextRecords.level > previousRecords.level && entry.level >= nextRecords.level) newRecords.level = true;
    if (nextRecords.time > previousRecords.time && entry.elapsedSeconds >= nextRecords.time) newRecords.time = true;
    if (nextRecords.coins > previousRecords.coins && entry.coins >= nextRecords.coins) newRecords.coins = true;
    entry._newRecords = newRecords;
    return entry;
  }

  function getReviveCost() {
    return runRevivesUsed > 0 ? 3 : 1;
  }

  function canReviveFromDeath() {
    return gameState === 'dead' && player && currentRoom && Number(metaProgress.loopCrystals || 0) >= getReviveCost();
  }

  function reviveFromDeath() {
    if (!canReviveFromDeath()) {
      particles.push({ x: player?.x ?? START_X, y: (player?.y ?? START_Y) - 28, life: 0.8, text: 'NEED LOOP CRYSTALS', c: '#ff9e9e' });
      uiController.setDeadScreen(playerDeathAnim?.entry || { floor, level: player?.level || 1, kills: player?.kills || 0, coins: player?.coins || 0, difficulty: selectedDifficulty });
      return false;
    }
    const cost = getReviveCost();
    metaProgress.loopCrystals = Math.max(0, Number(metaProgress.loopCrystals || 0) - cost);
    runRevivesUsed += 1;
    if (lastDeathEntryId) {
      runHistory = runHistory.filter(entry => entry.id !== lastDeathEntryId);
      lastDeathEntryId = '';
    }
    playerDeathAnim = null;
    player.hp = Math.max(1, Math.round(player.maxHp * 0.45));
    player.inv = Math.max(player.inv || 0, 1.5);
    player.stun = 0;
    player.vx = 0;
    player.vy = 0;
    player.dashTime = 0;
    projectiles = [];
    hazards = [];
    lastDamageSource = '';
    lastDamageSourceKey = '';
    setGameState('play');
    particles.push({ x: player.x, y: player.y - 28, life: 1, text: `REVIVED -${cost} LC`, c: '#8dd4ff' });
    persistMetaSoon();
    scheduleRunSave();
    updateHud();
    return true;
  }

  function die() {
    if (gameState === 'dying' || gameState === 'dead') return;
    if (gameMode === 'pvp' && pvpState) return;
    if (gameMode === 'coop' && ((!p2DeadInCoop && player2) || (!p3DeadInCoop && player3) || (!p4DeadInCoop && player4))) {
      if (player) player.hp = 0;
      p1DeadInCoop = true;
      particles.push({ x: player?.x ?? 0, y: (player?.y ?? 0) - 30, life: 1.2, text: 'P1 DOWN', c: '#ff6b6b' });
      return;
    }
    if (player) player.hp = 0;
    updateHud();
    const entry = finalizeRun('dead', { killedBy: lastDamageSource, killerKey: lastDamageSourceKey });
    lastDeathEntryId = entry.id;
    const aimAngle = player ? Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x) : 0;
    playerDeathAnim = {
      timer: 0,
      duration: 2.2,
      x: player?.x ?? 0,
      y: player?.y ?? 0,
      r: player?.r ?? 14,
      spriteKey: getPlayerSpriteKey(),
      facing: getFacingDirection(player, aimAngle),
      entry,
    };
    setGameState('dying');
    clearRunSave();
  }

  function finalizeDeath() {
    const { entry } = playerDeathAnim;
    playerDeathAnim = null;
    speakKillerDeathQuote(entry?.killerKey || '', entry?.killedBy || '');
    setGameState('dead');
    uiController.setDeadScreen(entry);
  }

  function win() {
    const entry = finalizeRun('win');
    achievementEvents.emit('run:won', { elapsedSeconds: gameElapsedTime, playerHp: Math.round(player?.hp || 0) });
    setGameState('win');
    uiController.setWinInfo(`Floor ${entry.floor} cleared with ${entry.coins} run coins banked and ${metaProgress.coins} total coins saved.`);
    clearRunSave();
  }

  async function clearRunSave() {
    if (window.__neoDataResetting) return;
    activeRun = null;
    lastDamageSource = '';
    lastDamageSourceKey = '';
    try {
      await Promise.all([
        saveStore.delete('run'),
        saveStore.put('meta', metaProgress),
        saveStore.put('runHistory', runHistory),
      ]);
      refreshMenuState();
    } catch (error) {
      console.error('Failed to clear run save', error);
    }
  }

  function scheduleRunSave() {
    if (window.__neoDataResetting) return;
    if (gameState !== 'play' || !player || !currentRoom) return;
    clearTimeout(savePendingTimer);
    savePendingTimer = setTimeout(() => { void saveRunNow(); }, 250);
  }

  function queueMenuRefresh() {
    if (menuRefreshQueued) return;
    menuRefreshQueued = true;
    requestAnimationFrame(() => {
      menuRefreshQueued = false;
      refreshMenuState();
    });
  }

  function queueMetaSave() {
    if (window.__neoDataResetting) return;
    metaSaveDirty = true;
    if (metaSavePendingTimer) return;
    metaSavePendingTimer = setTimeout(() => {
      metaSavePendingTimer = 0;
      if (!metaSaveDirty) return;
      metaSaveDirty = false;
      void saveStore.put('meta', metaProgress).catch(error => {
        console.error('Failed to save meta', error);
      });
    }, 250);
  }

  function persistMetaSoon() {
    if (window.__neoDataResetting) return;
    metaProgress.customDifficultySettings = { ...customDifficultySettings };
    metaProgress.sandboxSettings = normalizeSandboxSettings(sandboxSettings);
    metaProgress.selectedCharacter = chosenCharacter;
    queueMenuRefresh();
    queueMetaSave();
  }

  async function saveRunNow() {
    if (window.__neoDataResetting) return;
    if (gameState !== 'play' || !player || !currentRoom) return;
    activeRun = serializeRun();
    metaProgress.bestFloor = Math.max(metaProgress.bestFloor, floor);
    refreshMenuState();
    try {
      await Promise.all([
        saveStore.put('run', activeRun),
        saveStore.put('meta', metaProgress),
        saveStore.put('runHistory', runHistory),
      ]);
    } catch (error) {
      console.error('Failed to save run', error);
      uiController.setSaveState('SAVE ERROR');
    }
  }

  function serializeRun() {
    return {
      mode: normalizeGameMode(gameMode),
      baseSeedStr,
      seedStr,
      runLoopIndex,
      runRevivesUsed,
      rngState: getRngState(),
      difficulty: selectedDifficulty,
      challenges: normalizeChallengeSelection(selectedChallenges),
      floor,
      rooms,
      currentRoom: { gx: currentRoom.gx, gy: currentRoom.gy },
      player,
      player2: isMultiplayerMode() ? player2 : null,
      player3: isMultiplayerMode() ? player3 : null,
      player4: isMultiplayerMode() ? player4 : null,
      p1DeadInCoop,
      p2DeadInCoop,
      p3DeadInCoop,
      p4DeadInCoop,
      pvpState: gameMode === 'pvp' && pvpState ? { ...pvpState, respawnTimer: null } : null,
      enemies,
      deadBodies,
      projectiles,
      chests,
      pickups,
      destructibles,
      hazards,
      shopOffers,
      structures,
      decorations,
      rivals,
      cooldowns,
      laserActive,
      laserTime,
      laserTick,
      laserMode,
      laserAngle,
      laserSweepSpeed,
      turtleWaveHpTimer,
      godTimer,
      gameElapsedTime,
      monsterRoamTimer,
      knaveKnightCutscenePlayed,
      queenMetaoCutscenePlayed,
      camera,
    };
  }

  async function deleteSavedRun() {
    activeRun = null;
    await saveStore.delete('run');
    refreshMenuState();
  }

