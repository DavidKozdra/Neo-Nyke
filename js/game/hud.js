// hud.js — standalone IIFE. HUD updates, death/win, save scheduling.
  function getObjectiveEntries(lineObjective = '') {
    if (Neo.isFirstRunTutorialActive()) return Neo.getTutorialObjectiveEntries();
    if (!Neo.currentRoom) return [];
    const entries = [];
    if (Neo.floor < Neo.MAX_FLOOR || Neo.floor > Neo.MAX_FLOOR) {
      const ladderRoom = Neo.rooms.find(room => room.type === 'ladder');
      entries.push({
        text: ladderRoom?.explored ? 'Reach the ladder room' : 'Find the ladder',
        state: Neo.currentRoom.type === 'ladder' ? 'done' : 'todo',
      });
      if (Neo.currentRoom.type === 'ladder') {
        const ladderHint = Neo.formatControlLabel('space', 'space');
        entries.push({
          text: Neo.currentRoom.cleared ? `Ladder room cleared - press ${ladderHint} at ladder to continue` : 'Clear the ladder room',
          state: Neo.currentRoom.cleared ? 'done' : 'warn',
        });
      }
      if (Neo.currentRoom.type === 'boss') {
        entries.push({
          text: Neo.currentRoom.cleared ? 'Floor boss defeated' : 'Kill the floor boss',
          state: Neo.currentRoom.cleared ? 'done' : 'warn',
        });
      }
      if (Neo.currentRoom.type === 'challenge') {
        entries.push({
          text: lineObjective || 'Complete the trial',
          state: Neo.currentRoom.challengeFailed ? 'warn' : Neo.currentRoom.cleared ? 'done' : 'warn',
        });
      }
      if (Neo.currentRoom.type === 'treasure') {
        const unopened = Neo.chests.filter(chest => !chest.open).length;
        entries.push({
          text: unopened > 0 ? `Open treasure chests: ${unopened}` : 'Treasure claimed',
          state: unopened > 0 ? 'warn' : 'done',
        });
      }
      if (Neo.currentRoom.type === 'shop') entries.push({ text: 'Buy upgrades or move on', state: 'warn' });
      if (Neo.currentRoom.type === 'anvil') entries.push({ text: 'Forge upgrades or move on', state: 'warn' });
      if (Neo.getItemCount('charged_adapter') > 0) {
        const warpHint = Neo.formatControlLabel('f', 'f');
        const needed = Neo.getChargeRequirement(10);
        const progress = Math.max(0, Number(Neo.player?.escapeChargeKills || 0));
        if (Neo.player?.escapeReady) {
          entries.push({ text: `Charged Adapter ready: press ${warpHint} to warp to ladder (cost 50% coins)`, state: 'warn' });
        } else {
          entries.push({ text: `Charged Adapter charging: ${progress}/${needed} kills`, state: 'todo' });
        }
      }
      if (Neo.enemies.some(enemy => enemy.miniBoss)) entries.push({ text: 'Defeat the mini boss', state: 'warn' });
      if (Neo.selectedChallenges.length > 0) entries.push({ text: `${Neo.selectedChallenges.length} challenge${Neo.selectedChallenges.length === 1 ? '' : 's'} active`, state: 'todo' });
      return entries.slice(0, 5);
    }

    entries.push({
      text: Neo.currentRoom.type === 'god' ? 'Enter GOD chamber' : 'Reach GOD',
      state: Neo.currentRoom.type === 'god' ? 'done' : 'todo',
    });
    if (Neo.currentRoom.type === 'god') {
      entries.push({
        text: Neo.currentRoom.cleared ? 'GOD defeated' : Neo.currentRoom.bossStarted ? 'Survive GOD' : 'Start the GOD fight',
        state: Neo.currentRoom.cleared ? 'done' : 'warn',
      });
      if (Neo.currentRoom.cleared) entries.push({ text: Neo.hasLegacy('endless_descent') ? 'Crown, Descend, or Loop' : 'Take the crown or loop', state: 'warn' });
    }
    return entries.slice(0, 5);
  }

  function updateObjective() {
    if (!Neo.currentRoom) {
      Neo.uiController.setTutorialBanner('', false);
      return;
    }
    if (Neo.isFirstRunTutorialActive()) {
      const tutorialText = Neo.getTutorialStepMessage();
      Neo.uiController.setTutorialBanner(tutorialText, true);
      Neo.uiController.setObjective(tutorialText);
      Neo.uiController.setObjectiveList('Tutorial', Neo.getTutorialObjectiveEntries());
      return;
    }
    Neo.uiController.setTutorialBanner('', false);
    let objective = 'Find the ladder.';
    const setObjective = text => {
      Neo.uiController.setObjective(text);
      Neo.uiController.setObjectiveList(Neo.getRoomLabel(Neo.currentRoom.type), getObjectiveEntries(text));
    };
    if (Neo.gameMode === 'endless') {
      const displayWave = Neo.endlessWave + (Neo.endlessWaveActive ? 1 : 0);
      if (!Neo.endlessWaveActive) {
        setObjective(Neo.endlessWave === 0 ? 'Survive the first wave.' : `Wave ${Neo.endlessWave} cleared. Survive the next wave.`);
      } else {
        setObjective(`Survive wave ${displayWave}.`);
      }
      return;
    }
    if (Neo.gameMode === 'boss_rush') {
      if (Neo.bossRushActive) {
        const bossName = Neo.getBossDisplayName(Neo.BOSS_RUSH_ORDER[Neo.bossRushStage] || Neo.BOSS_RUSH_ORDER[0]);
        setObjective(`Defeat ${bossName}.`);
      } else {
        const nextBoss = Neo.BOSS_RUSH_ORDER[Neo.bossRushStage];
        if (nextBoss) {
          setObjective(`Next: ${Neo.getBossDisplayName(nextBoss)}. Get ready.`);
        } else {
          setObjective('Boss Rush complete!');
        }
      }
      return;
    }
    if (Neo.floor < Neo.MAX_FLOOR) {
      if (Neo.currentRoom.type === 'shop') {
        setObjective('Shop or move on.');
        return;
      }
      if (Neo.currentRoom.type === 'anvil') {
        setObjective('Forge upgrades or move on.');
        return;
      }
      if (Neo.currentRoom.type === 'challenge') {
        const type = Neo.currentRoom.challengeType || 'mirror';
        if (Neo.currentRoom.challengeFailed) {
          setObjective('Trial failed. Move on.');
        } else if (Neo.currentRoom.cleared) {
          setObjective('Trial cleared. Claim the reward or move on.');
        } else if (!Neo.currentRoom.challengeStarted) {
          if (type === 'mirror') setObjective('Touch the sword to face your mirror.');
          else if (type === 'stillness') setObjective('Begin the prize trial.');
          else if (type === 'bomb') setObjective('Begin the bomb trial.');
          else if (type === 'survival') setObjective('Begin the survival trial.');
          else if (type === 'runes') setObjective('Begin the rune hunt.');
          else if (type === 'storm') setObjective('Begin the storm trial.');
        } else {
          if (type === 'mirror') setObjective('Defeat your mirror champion.');
          else if (type === 'stillness') {
            const phase = Neo.currentRoom.challengeData?.phase || 'choose';
            setObjective(phase === 'fight' ? 'Defeat the trial enemies to claim your chosen item.' : 'Pick one item, then fight for it.');
          }
          else if (type === 'bomb') setObjective('Find the one bomb you can safely disarm.');
          else if (type === 'survival') setObjective(`Survive for ${Math.ceil(Neo.currentRoom.challengeTimer || 0)}s.`);
          else if (type === 'runes') setObjective(`Collect the remaining runes: ${Math.max(0, Number(Neo.currentRoom.challengeData?.runesLeft || 0))}.`);
          else if (type === 'storm') setObjective(`Live through the storm for ${Math.ceil(Neo.currentRoom.challengeTimer || 0)}s.`);
        }
        return;
      }
      if (Neo.currentRoom.type === 'boss' && !Neo.currentRoom.cleared) {
        setObjective('Defeat the floor boss.');
        return;
      }
      objective = Neo.currentRoom.type === 'ladder' && !Neo.currentRoom.cleared ? 'Clear the ladder room.' : 'Find the ladder.';
      setObjective(objective);
      return;
    }
    if (Neo.currentRoom.type !== 'god') {
      setObjective('Reach GOD.');
      return;
    }
    if (Neo.currentRoom.cleared) {
      setObjective('Take the crown.');
      return;
    }
    if (Neo.currentRoom.bossStarted) {
      setObjective('Survive GOD.');
      return;
    }
    setObjective('Fight GOD or loop with your gear.');
  }

  function getPlayerSlotScoreText(slot) {
    if (Neo.gameMode !== 'pvp' || !Neo.pvpState) return '';
    const kills = slot.id === 1 ? Neo.pvpState.p1Kills : slot.id === 2 ? Neo.pvpState.p2Kills : 0;
    return `K:${kills || 0}/${Neo.pvpState.killsToWin}`;
  }

  function getHpFillColor(percent, fallbackColor) {
    if (percent <= 0) return '#485060';
    if (percent > 70) return '#4cbb5a';
    if (percent > 50) return '#d4b840';
    if (percent > 25) return '#d98134';
    return fallbackColor || '#c04040';
  }

  function renderPlayerStatsPanel() {
    if (!Neo.ui.playerStats) return;
    const slots = Neo.getActivePlayerSlots();
    const activeIds = new Set(slots.map(slot => String(slot.id)));
    Neo.ui.playerStats.classList.toggle('player-stats--split', slots.length > 1);
    Neo.ui.playerStats.querySelectorAll('[data-player-slot]').forEach(card => {
      if (!activeIds.has(card.dataset.playerSlot || '')) card.remove();
    });
    slots.forEach(slot => {
      const entity = slot.getEntity();
      if (!entity) return;
      const character = Neo.CHARACTER_DEFS[entity.character || slot.getCharacter()] || Neo.CHARACTER_DEFS.thorn_knight;
      const dead = slot.getDead();
      const hpPercent = dead ? 0 : Math.max(0, Math.min(100, (entity.hp / Math.max(1, entity.maxHp)) * 100));
      const xpPercent = Math.max(0, Math.min(100, (Number(entity.xp || 0) / Math.max(1, Number(entity.xpToNext || 1))) * 100));
      const scoreText = getPlayerSlotScoreText(slot);
      const hpText = dead ? 'DOWN' : `${Math.ceil(entity.hp)}/${entity.maxHp}`;
      const metaText = scoreText || `${entity.coins || 0} coins`;
      const showPlayerLabel = slots.length > 1;
      let card = Neo.ui.playerStats.querySelector(`[data-player-slot="${slot.id}"]`);
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
        Neo.ui.playerStats.appendChild(card);
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

    if (Neo.ui.playerHpFill && Neo.player) {
      const p1Percent = Math.max(0, Math.min(100, (Neo.player.hp / Math.max(1, Neo.player.maxHp)) * 100));
      Neo.ui.playerHpFill.style.width = `${p1Percent}%`;
      Neo.ui.playerHpFill.style.background = getHpFillColor(p1Percent, Neo.PLAYER_SLOT_CONFIG[0].color);
      Neo.ui.playerHpTxt.textContent = Neo.gameMode === 'pvp' && Neo.pvpState
        ? `${Math.ceil(Neo.player.hp)} | ${getPlayerSlotScoreText(Neo.PLAYER_SLOT_CONFIG[0])}`
        : `${Math.ceil(Neo.player.hp)}/${Neo.player.maxHp}`;
    }
    if (Neo.ui.playerXpFill && Neo.player) {
      const xpPercent = Math.max(0, Math.min(100, (Neo.player.xp / Math.max(1, Neo.player.xpToNext)) * 100));
      Neo.ui.playerXpFill.style.width = `${xpPercent}%`;
      Neo.ui.playerXpTxt.textContent = `${Neo.player.xp}/${Neo.player.xpToNext}`;
      const levelEl = document.getElementById('playerLevelTxt');
      if (levelEl) levelEl.textContent = `Lv.${Neo.player.level || 1}`;
    }
  }

  function updateHud() {
    if (!Neo.player) return;
    const character = Neo.getCharacterDef();
    const meleeMove = Neo.MOVE_DEFS[Neo.getEquippedMove('melee')];
    const weaponKey = Neo.getEquippedWeapon();
    const weaponDef = Neo.WEAPON_DEFS[weaponKey];
    const laserMove = Neo.MOVE_DEFS[Neo.getEquippedMove('laser')];
    const smashMove = Neo.MOVE_DEFS[Neo.getEquippedMove('smash')];
    const dashMove = Neo.MOVE_DEFS[Neo.getEquippedMove('dash')];
    const attackSpeed = Neo.getAttackSpeedValue();
    const laserMoveKey = laserMove?.key || Neo.getEquippedMove('laser');
    const meleeSkill = Neo.getSkillCooldownInfo('melee', attackSpeed);
    const laserSkill = Neo.getSkillCooldownInfo('laser', attackSpeed);
    const smashSkill = Neo.getSkillCooldownInfo('smash', attackSpeed);
    const dashSkill = Neo.getSkillCooldownInfo('dash', attackSpeed);
    if (Neo.laserActive) {
      laserSkill.current = Neo.laserTime;
      laserSkill.max = Neo.getLaserCastDuration(laserMoveKey);
    }
    if (weaponDef) {
      meleeSkill.current = Number(Neo.player.weaponCooldown || 0);
      meleeSkill.max = Neo.getWeaponBaseCooldown(weaponKey);
      meleeSkill.charges = meleeSkill.current > 0 ? 0 : 1;
      meleeSkill.maxCharges = 1;
    }
    const minutes = Math.floor(Neo.gameElapsedTime / 60);
    const seconds = Math.floor(Neo.gameElapsedTime % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    Neo.uiController.setHudValues({
      floor: Neo.floor,
      level: Neo.player.level,
      xpText: `${Neo.player.xp}/${Neo.player.xpToNext}`,
      coins: Neo.player.coins,
      character: character.name.toUpperCase(),
      hp: Neo.player.hp,
      maxHp: Neo.player.maxHp,
      meleeCd: meleeSkill.current,
      laserCd: laserSkill.current,
      smashCd: smashSkill.current,
      dashCd: dashSkill.current,
      gameTime: timeStr,
      difficultyName: Neo.getDifficultyDef(Neo.selectedDifficulty).name,
      itemRarityCounts: Neo.getItemRarityCounts(Neo.player),
      skills: {
        melee: { current: meleeSkill.current, max: meleeSkill.max, active: false, charges: meleeSkill.charges, maxCharges: meleeSkill.maxCharges },
        laser: { current: laserSkill.current, max: laserSkill.max, active: Neo.laserActive, charges: laserSkill.charges, maxCharges: laserSkill.maxCharges },
        smash: { current: smashSkill.current, max: smashSkill.max, active: false, charges: smashSkill.charges, maxCharges: smashSkill.maxCharges },
        dash: { current: dashSkill.current, max: dashSkill.max, active: Neo.player.dashTime > 0 || Neo.player.cowardsWayTime > 0 || Neo.player.princessFlightTime > 0, charges: dashSkill.charges, maxCharges: dashSkill.maxCharges },
      },
    });
    Neo.ui.skillNames.dash.textContent = dashMove?.name || character.skills.dash;
    Neo.ui.skillNames.melee.textContent = weaponDef?.name || meleeMove?.name || character.skills.melee;
    Neo.ui.skillNames.laser.textContent = laserMove?.name || character.skills.laser;
    Neo.ui.skillNames.smash.textContent = smashMove?.name || character.skills.smash;
    Neo.syncCharacterUiTheme();
    renderPlayerStatsPanel();
    
    // Update center display
    if (Neo.ui.coinCount) Neo.ui.coinCount.textContent = Neo.player.coins;
    if (Neo.ui.hudLoopCount) Neo.ui.hudLoopCount.textContent = Number(Neo.metaProgress.loopCrystals || 0);
    const _potionCap = Neo.getPotionCarryCap();
    if (Neo.ui.potionDisplay) Neo.ui.potionDisplay.classList.toggle('hidden', _potionCap <= 0);
    if (_potionCap > 0) {
      if (Neo.ui.potionCount) Neo.ui.potionCount.textContent = String(Number(Neo.player.storedPotions || 0));
      if (Neo.ui.potionCap) Neo.ui.potionCap.textContent = `/${_potionCap}`;
    }
    if (Neo.ui.timerDisplay) Neo.ui.timerDisplay.textContent = timeStr;
    if (Neo.ui.floorDisplay) Neo.ui.floorDisplay.textContent = Neo.floor;
    if (Neo.ui.difficultyLabel) Neo.ui.difficultyLabel.textContent = Neo.getDifficultyDef(Neo.selectedDifficulty).name.toUpperCase();
    const isCompetitive = Neo.gameMode === 'competitive';
    if (Neo.ui.competitiveSeedDisplay) Neo.ui.competitiveSeedDisplay.style.display = isCompetitive ? '' : 'none';
    if (isCompetitive && Neo.ui.competitiveSeedValue) Neo.ui.competitiveSeedValue.textContent = Neo.baseSeedStr || '';
    if (Neo.ui.itemRarityCounts) {
      const rarityCounts = Neo.getItemRarityCounts(Neo.player);
      const white = Neo.ui.itemRarityCounts.querySelector('.rarity-count--white');
      const purple = Neo.ui.itemRarityCounts.querySelector('.rarity-count--purple');
      const red = Neo.ui.itemRarityCounts.querySelector('.rarity-count--red');
      if (white) white.textContent = String(rarityCounts.white);
      if (purple) purple.textContent = String(rarityCounts.purple);
      if (red) red.textContent = String(rarityCounts.red);
    }
    if (Neo.ui.challengeStatus && Neo.ui.challengeStatusFill) {
      const timedChallengeType = Neo.currentRoom
        && Neo.currentRoom.type === 'challenge'
        && Neo.currentRoom.challengeStarted
        && !Neo.currentRoom.cleared
        ? (Neo.currentRoom.challengeType || 'mirror')
        : null;
      const timedChallengeActive = timedChallengeType === 'runes';
      Neo.ui.challengeStatus.classList.toggle('hidden', !timedChallengeActive);
      Neo.ui.challengeStatus.setAttribute('aria-hidden', timedChallengeActive ? 'false' : 'true');
      if (timedChallengeActive) {
        const maxTimer = Math.max(0.01, Number(Neo.currentRoom.challengeData?.maxTimer || 30));
        const timer = Math.max(0, Number(Neo.currentRoom.challengeTimer || 0));
        const ratio = Math.max(0, Math.min(1, timer / maxTimer));
        if (Neo.ui.challengeStatusLabel) {
          Neo.ui.challengeStatusLabel.textContent = `RUNES ${Math.ceil(timer)}S`;
        }
        Neo.ui.challengeStatusFill.style.width = `${ratio * 100}%`;
      }
    }

    if (Neo.ui.adapterStatus) {
      const hasAdapter = Neo.getItemCount('charged_adapter') > 0;
      const showAdapter = hasAdapter && (Neo.gameState === 'play' || Neo.gameState === 'pause');
      if (Neo.ui.hudLower) {
        Neo.ui.hudLower.classList.toggle('hidden', !showAdapter);
        Neo.ui.hudLower.setAttribute('aria-hidden', showAdapter ? 'false' : 'true');
      }
      Neo.ui.adapterStatus.classList.toggle('hidden', !showAdapter);
      Neo.ui.adapterStatus.setAttribute('aria-hidden', showAdapter ? 'false' : 'true');
      Neo.ui.adapterStatus.classList.toggle('is-ready', false);
      Neo.ui.adapterStatus.classList.toggle('is-blocked', false);
      const adapterItem = Neo.itemRegistry.get('charged_adapter') || Neo.ITEM_DEFS.charged_adapter;
      if (showAdapter && Neo.ui.adapterStatusIcon && adapterItem) Neo.drawItemToastIcon(Neo.ui.adapterStatusIcon, adapterItem);
      if (showAdapter) {
        const warpKey = Neo.formatControlLabel('f', 'f');
        const needed = Neo.getChargeRequirement(10);
        const progress = Math.max(0, Number(Neo.player?.escapeChargeKills || 0));
        if (!Neo.player.escapeReady) {
          if (Neo.ui.adapterStatusText) Neo.ui.adapterStatusText.textContent = `Adapter [${warpKey}]: charging ${progress}/${needed}`;
          Neo.ui.adapterStatus.classList.add('is-blocked');
        } else if (!Neo.currentRoom || Neo.currentRoom.type === 'boss' || Neo.currentRoom.type === 'god') {
          if (Neo.ui.adapterStatusText) Neo.ui.adapterStatusText.textContent = `Adapter [${warpKey}]: no warp in boss room`;
          Neo.ui.adapterStatus.classList.add('is-blocked');
        } else if (Neo.enemies.length === 0) {
          if (Neo.ui.adapterStatusText) Neo.ui.adapterStatusText.textContent = `Adapter [${warpKey}]: requires active combat`;
          Neo.ui.adapterStatus.classList.add('is-blocked');
        } else {
          if (Neo.ui.adapterStatusText) Neo.ui.adapterStatusText.textContent = `Adapter [${warpKey}]: ready - warp to ladder (50% coin cost)`;
          Neo.ui.adapterStatus.classList.add('is-ready');
        }
      } else if (Neo.ui.adapterStatusText) {
        Neo.ui.adapterStatusText.textContent = '';
      }
    }
    
    if (Neo.ui.interactPrompt) {
      const shopHint = Neo.getControlHint('e', 'e');
      const isShop = Neo.currentRoom?.type === 'shop' && !Neo.isPanelOpen(Neo.ui.shopPanel);
      const isAnvil = Neo.currentRoom?.type === 'anvil' && !Neo.isPanelOpen(Neo.ui.anvilPanel);
      if (isShop) {
        Neo.ui.interactPrompt.textContent = `[${shopHint}]  Open Shop`;
        Neo.ui.interactPrompt.classList.remove('hidden', 'interact-prompt--forge');
      } else if (isAnvil) {
        Neo.ui.interactPrompt.textContent = `[${shopHint}]  Open Forge`;
        Neo.ui.interactPrompt.classList.remove('hidden');
        Neo.ui.interactPrompt.classList.add('interact-prompt--forge');
      } else {
        Neo.ui.interactPrompt.classList.add('hidden');
      }
    }

    Neo.updateItemUI();
  }

  function finalizeRun(result, extra = {}) {
    const previousRecords = Neo.deriveRunRecords(Neo.runHistory);
    const entry = Neo.buildRunHistoryEntry(result, extra);
    Neo.pushRunHistoryEntry(entry);
    const nextRecords = Neo.syncMetaRecordsFromRunHistory();
    const newRecords = {};
    if (nextRecords.floor > previousRecords.floor && entry.floor >= nextRecords.floor) newRecords.floor = true;
    if (nextRecords.kills > previousRecords.kills && entry.kills >= nextRecords.kills) newRecords.kills = true;
    if (nextRecords.level > previousRecords.level && entry.level >= nextRecords.level) newRecords.level = true;
    if (nextRecords.time > previousRecords.time && entry.elapsedSeconds >= nextRecords.time) newRecords.time = true;
    if (nextRecords.coins > previousRecords.coins && entry.coins >= nextRecords.coins) newRecords.coins = true;
    entry._newRecords = newRecords;
    if (Neo.gameMode === 'competitive') {
      const username = Neo.metaProgress?.username?.trim() || 'Anonymous';
      fetch(`${Neo.COMPETITIVE_SERVER_URL}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: username,
          floor: entry.floor,
          seed: entry.seed || Neo.baseSeedStr,
          character: entry.character || Neo.chosenCharacter,
          time: entry.elapsedSeconds,
        }),
      }).catch(() => {});
    }
    return entry;
  }

  function getReviveCost() {
    return Neo.runRevivesUsed > 0 ? 3 : 1;
  }

  function canReviveFromDeath() {
    return Neo.gameState === 'dead' && Neo.player && Neo.currentRoom && Number(Neo.metaProgress.loopCrystals || 0) >= getReviveCost();
  }

  function reviveFromDeath() {
    if (!canReviveFromDeath()) {
      Neo.spawnParticle({ x: Neo.player?.x ?? Neo.START_X, y: (Neo.player?.y ?? Neo.START_Y) - 28, life: 0.8, text: 'NEED LOOP CRYSTALS', c: '#ff9e9e' });
      Neo.uiController.setDeadScreen(Neo.playerDeathAnim?.entry || { floor: Neo.floor, level: Neo.player?.level || 1, kills: Neo.player?.kills || 0, coins: Neo.player?.coins || 0, difficulty: Neo.selectedDifficulty });
      return false;
    }
    const cost = getReviveCost();
    Neo.metaProgress.loopCrystals = Math.max(0, Number(Neo.metaProgress.loopCrystals || 0) - cost);
    Neo.runRevivesUsed += 1;
    if (Neo.lastDeathEntryId) {
      Neo.runHistory = Neo.runHistory.filter(entry => entry.id !== Neo.lastDeathEntryId);
      Neo.lastDeathEntryId = '';
    }
    Neo.playerDeathAnim = null;
    Neo.player.hp = Math.max(1, Math.round(Neo.player.maxHp * 0.45));
    Neo.player.inv = Math.max(Neo.player.inv || 0, 1.5);
    Neo.player.stun = 0;
    Neo.player.vx = 0;
    Neo.player.vy = 0;
    Neo.player.dashTime = 0;
    Neo.projectiles = [];
    Neo.hazards = [];
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    Neo.setGameState('play');
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 28, life: 1, text: `REVIVED -${cost} LC`, c: '#8dd4ff' });
    persistMetaSoon();
    scheduleRunSave();
    updateHud();
    return true;
  }

  function die() {
    if (Neo.gameState === 'dying' || Neo.gameState === 'dead') return;
    if (Neo.gameMode === 'pvp' && Neo.pvpState) return;
    if (Neo.gameMode === 'coop' && ((!Neo.p2DeadInCoop && Neo.player2) || (!Neo.p3DeadInCoop && Neo.player3) || (!Neo.p4DeadInCoop && Neo.player4))) {
      if (Neo.player) Neo.player.hp = 0;
      Neo.p1DeadInCoop = true;
      Neo.spawnParticle({ x: Neo.player?.x ?? 0, y: (Neo.player?.y ?? 0) - 30, life: 1.2, text: 'P1 DOWN', c: '#ff6b6b' });
      return;
    }
    if (Neo.player) Neo.player.hp = 0;
    updateHud();
    const entry = finalizeRun('dead', { killedBy: Neo.lastDamageSource, killerKey: Neo.lastDamageSourceKey });
    Neo.lastDeathEntryId = entry.id;
    const aimAngle = Neo.player ? Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x) : 0;
    Neo.playerDeathAnim = {
      timer: 0,
      duration: 2.2,
      x: Neo.player?.x ?? 0,
      y: Neo.player?.y ?? 0,
      r: Neo.player?.r ?? 14,
      spriteKey: Neo.getPlayerSpriteKey(),
      facing: Neo.getFacingDirection(Neo.player, aimAngle),
      entry,
    };
    Neo.setGameState('dying');
    clearRunSave();
  }

  function finalizeDeath() {
    const { entry } = Neo.playerDeathAnim;
    Neo.playerDeathAnim = null;
    Neo.speakKillerDeathQuote(entry?.killerKey || '', entry?.killedBy || '');
    Neo.setGameState('dead');
    Neo.uiController.setDeadScreen(entry);
  }

  function win() {
    const entry = finalizeRun('win');
    window.achievementEvents?.emit('run:won', { elapsedSeconds: Neo.gameElapsedTime, playerHp: Math.round(Neo.player?.hp || 0) });
    Neo.setGameState('win');
    Neo.uiController.setWinInfo(`Floor ${entry.floor} cleared with ${entry.coins} run coins banked and ${Neo.metaProgress.coins} total coins saved.`);
  }

  async function clearRunSave() {
    if (window.__neoDataResetting) return;
    Neo.activeRun = null;
    Neo.lastDamageSource = '';
    Neo.lastDamageSourceKey = '';
    try {
      await Promise.all([
        Neo.saveStore.delete('run'),
        Neo.saveStore.put('meta', Neo.metaProgress),
        Neo.saveStore.put('runHistory', Neo.runHistory),
      ]);
      Neo.refreshMenuState();
    } catch (error) {
      console.error('Failed to clear run save', error);
    }
  }

  function scheduleRunSave() {
    if (window.__neoDataResetting) return;
    if (Neo.gameState !== 'play' || !Neo.player || !Neo.currentRoom) return;
    clearTimeout(Neo.savePendingTimer);
    Neo.savePendingTimer = setTimeout(() => { void saveRunNow(); }, 250);
  }

  function queueMenuRefresh() {
    if (Neo.menuRefreshQueued) return;
    Neo.menuRefreshQueued = true;
    requestAnimationFrame(() => {
      Neo.menuRefreshQueued = false;
      Neo.refreshMenuState();
    });
  }

  function queueMetaSave() {
    if (window.__neoDataResetting) return;
    Neo.metaSaveDirty = true;
    if (Neo.metaSavePendingTimer) return;
    Neo.metaSavePendingTimer = setTimeout(() => {
      Neo.metaSavePendingTimer = 0;
      if (!Neo.metaSaveDirty) return;
      Neo.metaSaveDirty = false;
      void Neo.saveStore.put('meta', Neo.metaProgress).catch(error => {
        console.error('Failed to save meta', error);
      });
    }, 250);
  }

  function persistMetaSoon() {
    if (window.__neoDataResetting) return;
    Neo.metaProgress.customDifficultySettings = { ...Neo.customDifficultySettings };
    Neo.metaProgress.sandboxSettings = Neo.normalizeSandboxSettings(Neo.sandboxSettings);
    Neo.metaProgress.selectedCharacter = Neo.chosenCharacter;
    queueMenuRefresh();
    queueMetaSave();
  }

  async function saveRunNow() {
    if (window.__neoDataResetting) return;
    if (Neo.gameState !== 'play' || !Neo.player || !Neo.currentRoom) return;
    Neo.activeRun = serializeRun();
    Neo.metaProgress.bestFloor = Math.max(Neo.metaProgress.bestFloor, Neo.floor);
    Neo.refreshMenuState();
    try {
      await Promise.all([
        Neo.saveStore.put('run', Neo.activeRun),
        Neo.saveStore.put('meta', Neo.metaProgress),
        Neo.saveStore.put('runHistory', Neo.runHistory),
      ]);
    } catch (error) {
      console.error('Failed to save run', error);
      Neo.uiController.setSaveState('SAVE ERROR');
    }
  }

  function serializeRun() {
    return {
      mode: Neo.normalizeGameMode(Neo.gameMode),
      baseSeedStr: Neo.baseSeedStr,
      seedStr: Neo.seedStr,
      runLoopIndex: Neo.runLoopIndex,
      runRevivesUsed: Neo.runRevivesUsed,
      rngState: Neo.getRngState(),
      difficulty: Neo.selectedDifficulty,
      challenges: Neo.normalizeChallengeSelection(Neo.selectedChallenges),
      floor: Neo.floor,
      rooms: Neo.rooms,
      currentRoom: { gx: Neo.currentRoom.gx, gy: Neo.currentRoom.gy },
      player: Neo.player,
      player2: Neo.isMultiplayerMode() ? Neo.player2 : null,
      player3: Neo.isMultiplayerMode() ? Neo.player3 : null,
      player4: Neo.isMultiplayerMode() ? Neo.player4 : null,
      p1DeadInCoop: Neo.p1DeadInCoop,
      p2DeadInCoop: Neo.p2DeadInCoop,
      p3DeadInCoop: Neo.p3DeadInCoop,
      p4DeadInCoop: Neo.p4DeadInCoop,
      pvpState: Neo.gameMode === 'pvp' && Neo.pvpState ? { ...Neo.pvpState, respawnTimer: null } : null,
      enemies: Neo.enemies,
      deadBodies: Neo.deadBodies,
      projectiles: Neo.projectiles,
      chests: Neo.chests,
      pickups: Neo.pickups,
      destructibles: Neo.destructibles,
      hazards: Neo.hazards,
      shopOffers: Neo.shopOffers,
      structures: Neo.structures,
      decorations: Neo.decorations,
      rivals: Neo.rivals,
      cooldowns: Neo.cooldowns,
      laserActive: Neo.laserActive,
      laserTime: Neo.laserTime,
      laserTick: Neo.laserTick,
      laserMode: Neo.laserMode,
      laserAngle: Neo.laserAngle,
      laserSweepSpeed: Neo.laserSweepSpeed,
      turtleWaveHpTimer: Neo.turtleWaveHpTimer,
      godTimer: Neo.godTimer,
      gameElapsedTime: Neo.gameElapsedTime,
      monsterRoamTimer: Neo.monsterRoamTimer,
      knaveKnightCutscenePlayed: Neo.knaveKnightCutscenePlayed,
      queenMetaoCutscenePlayed: Neo.queenMetaoCutscenePlayed,
      secretRoomVisitedFloors: Array.isArray(Neo.secretRoomVisitedFloors) ? [...Neo.secretRoomVisitedFloors] : [],
      camera: Neo.camera,
    };
  }

  async function deleteSavedRun() {
    Neo.activeRun = null;
    await Neo.saveStore.delete('run');
    Neo.refreshMenuState();
  }

  // Expose on Neo
  Neo.getObjectiveEntries = getObjectiveEntries;
  Neo.updateObjective = updateObjective;
  Neo.getPlayerSlotScoreText = getPlayerSlotScoreText;
  Neo.getHpFillColor = getHpFillColor;
  Neo.renderPlayerStatsPanel = renderPlayerStatsPanel;
  Neo.updateHud = updateHud;
  Neo.finalizeRun = finalizeRun;
  Neo.getReviveCost = getReviveCost;
  Neo.canReviveFromDeath = canReviveFromDeath;
  Neo.reviveFromDeath = reviveFromDeath;
  Neo.die = die;
  Neo.finalizeDeath = finalizeDeath;
  Neo.win = win;
  Neo.clearRunSave = clearRunSave;
  Neo.scheduleRunSave = scheduleRunSave;
  Neo.queueMenuRefresh = queueMenuRefresh;
  Neo.queueMetaSave = queueMetaSave;
  Neo.persistMetaSoon = persistMetaSoon;
  Neo.saveRunNow = saveRunNow;
  Neo.deleteSavedRun = deleteSavedRun;
  Neo.serializeRun = serializeRun;
