// hud.js — standalone IIFE. HUD updates, death/win, save scheduling.

  // Format an "hp/maxHp" readout, guarding against non-finite values so the HUD
  // bars never render "Inf"/"NaN" if hp or maxHp goes bad upstream. Also repairs
  // the stored values in place, so the bad number doesn't keep feeding combat math.
  function formatHpText(hp, maxHp, entity = null) {
    let safeMax = Number(maxHp);
    if (!Number.isFinite(safeMax) || safeMax <= 0) safeMax = 120;
    safeMax = Math.round(safeMax);
    let safeHp = Number(hp);
    if (!Number.isFinite(safeHp)) safeHp = safeMax;
    safeHp = Math.max(0, Math.min(safeMax, Math.ceil(safeHp)));
    if (entity) {
      if (!Number.isFinite(Number(entity.maxHp)) || Number(entity.maxHp) <= 0) entity.maxHp = safeMax;
      if (!Number.isFinite(Number(entity.hp))) entity.hp = safeHp;
    }
    return `${safeHp}/${safeMax}`;
  }
  Neo.formatHpText = formatHpText;

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
        const slotIdx = Neo.player?.equipmentSlots?.indexOf?.('charged_adapter') ?? -1;
        const slotLetter = slotIdx >= 0 ? Neo.EQUIPMENT_SLOT_KEYS?.[slotIdx] || 'F' : 'F';
        const warpHint = Neo.formatControlLabel(slotLetter.toLowerCase(), slotLetter.toLowerCase());
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
      pushPanelItemObjectives(entries);
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
    pushPanelItemObjectives(entries);
    return entries.slice(0, 5);
  }

  // Owed panel-item selections (Wizard's Paw / Extra Battery) surface as urgent
  // objective entries so they can't be forgotten while waiting to be resolved.
  function pushPanelItemObjectives(entries) {
    const pawPending = Math.max(0, Math.floor(Number(Neo.player?.wizardPawPendingCount || 0)));
    const batteryPending = Math.max(0, Math.floor(Number(Neo.player?.extraBatteryPendingCount || 0)));
    if (pawPending > 0) {
      entries.push({ text: `Wizard's Paw ready: pick 2 stats to boost${pawPending > 1 ? ` (×${pawPending})` : ''}`, state: 'warn' });
    }
    if (batteryPending > 0) {
      entries.push({ text: `Extra Battery ready: pick a move for +1 charge${batteryPending > 1 ? ` (×${batteryPending})` : ''}`, state: 'warn' });
    }
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
    if (Neo.gameMode === 'pvp' && Neo.pvpState) {
      setObjective(`PVP: first to ${Neo.pvpState.killsToWin || 3} kills.`);
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
          else if (type === 'stillness') setObjective('Begin the prize trial: choose one reward to clear it.');
          else if (type === 'bomb') setObjective('Begin the bomb trial before detonation.');
          else if (type === 'survival') setObjective('Begin the survival trial: protect the central obelisk.');
          else if (type === 'runes') setObjective('Begin the rune hunt.');
          else if (type === 'storm') setObjective('Begin the storm trial.');
        } else {
          if (type === 'mirror') setObjective('Defeat your mirror champion.');
          else if (type === 'stillness') {
            const phase = Neo.currentRoom.challengeData?.phase || 'choose';
            const timer = Math.ceil(Neo.currentRoom.challengeTimer || 0);
            setObjective(phase === 'channel' ? `Hold the center until the prize stabilizes (${timer}s).` : 'Pick one prize, then hold the center to secure it.');
          }
          else if (type === 'bomb') setObjective(`Disarm the blue bomb before detonation (${Math.ceil(Neo.currentRoom.challengeTimer || 0)}s).`);
          else if (type === 'survival') {
            const obelisk = Neo.currentRoom.challengeData?.obelisk;
            const hpPct = obelisk ? Math.ceil(Neo.clamp((obelisk.hp || 0) / Math.max(1, obelisk.maxHp || 1), 0, 1) * 100) : 100;
            setObjective(`Keep enemies off the obelisk (${hpPct}%) — survive ${Math.ceil(Neo.currentRoom.challengeTimer || 0)}s.`);
          }
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
      // formatHpText also repairs non-finite hp/maxHp on the entity in place, so
      // call it before deriving the bar percentage below.
      const hpText = dead ? 'DOWN' : formatHpText(entity.hp, entity.maxHp, entity);
      const hpPercent = dead ? 0 : Math.max(0, Math.min(100, (entity.hp / Math.max(1, entity.maxHp)) * 100));
      const xpPercent = Math.max(0, Math.min(100, (Number(entity.xp || 0) / Math.max(1, Number(entity.xpToNext || 1))) * 100));
      // Meta row shows the PvP kill score only; coins live in the top-left coin
      // display, so this row stays hidden in normal play.
      const scoreText = getPlayerSlotScoreText(slot);
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
          <div class="player-stat-row" data-player-field="metaRow">
            <span data-player-field="metaLabel">SCORE</span>
            <span></span>
            <span data-player-field="meta"></span>
          </div>`;
        // This panel renders every frame, so cache element refs on the card
        // (instead of re-querying ~10× per slot per frame) and diff every write
        // below via card._last to avoid needless DOM mutations / reflows.
        card._refs = {
          label: card.querySelector('[data-player-field="label"]'),
          name: card.querySelector('[data-player-field="name"]'),
          hpText: card.querySelector('[data-player-field="hpText"]'),
          level: card.querySelector('[data-player-field="level"]'),
          xpText: card.querySelector('[data-player-field="xpText"]'),
          metaRow: card.querySelector('[data-player-field="metaRow"]'),
          meta: card.querySelector('[data-player-field="meta"]'),
          hpFill: card.querySelector('[data-player-field="hpFill"]'),
          xpFill: card.querySelector('[data-player-field="xpFill"]'),
        };
        card._last = {};
        Neo.ui.playerStats.appendChild(card);
      }
      const refs = card._refs;
      const last = card._last;
      if (last.color !== slot.color) {
        last.color = slot.color;
        card.style.setProperty('--player-color', slot.color);
      }
      if (last.dead !== dead) {
        last.dead = dead;
        card.classList.toggle('player-stat-card--dead', dead);
      }
      const solo = !showPlayerLabel;
      if (last.solo !== solo) {
        last.solo = solo;
        card.classList.toggle('player-stat-card--solo', solo);
      }
      const labelText = showPlayerLabel ? slot.label : '';
      if (last.label !== labelText) { last.label = labelText; refs.label.textContent = labelText; }
      const nameText = character.name || slot.getCharacter();
      if (last.name !== nameText) { last.name = nameText; refs.name.textContent = nameText; }
      if (last.hpText !== hpText) { last.hpText = hpText; refs.hpText.textContent = hpText; }
      const levelText = `Lv.${entity.level || 1}`;
      if (last.level !== levelText) { last.level = levelText; refs.level.textContent = levelText; }
      const xpText = `${entity.xp || 0}/${entity.xpToNext || 0}`;
      if (last.xpText !== xpText) { last.xpText = xpText; refs.xpText.textContent = xpText; }
      if (refs.metaRow) {
        const metaDisplay = scoreText ? '' : 'none';
        if (last.metaDisplay !== metaDisplay) { last.metaDisplay = metaDisplay; refs.metaRow.style.display = metaDisplay; }
        if (scoreText && last.meta !== scoreText) { last.meta = scoreText; refs.meta.textContent = scoreText; }
      }
      if (refs.hpFill) {
        const hpWidth = `${hpPercent.toFixed(1)}%`;
        if (last.hpWidth !== hpWidth) { last.hpWidth = hpWidth; refs.hpFill.style.width = hpWidth; }
        const hpColor = getHpFillColor(hpPercent, slot.color);
        if (last.hpColor !== hpColor) { last.hpColor = hpColor; refs.hpFill.style.background = hpColor; }
      }
      if (refs.xpFill) {
        const xpWidth = `${xpPercent.toFixed(1)}%`;
        if (last.xpWidth !== xpWidth) { last.xpWidth = xpWidth; refs.xpFill.style.width = xpWidth; }
      }
    });

    if (Neo.ui.playerHpFill && Neo.player) {
      // Repair any non-finite hp/maxHp first, then derive the bar fill from it.
      const hpText = formatHpText(Neo.player.hp, Neo.player.maxHp, Neo.player);
      const p1Percent = Math.max(0, Math.min(100, (Neo.player.hp / Math.max(1, Neo.player.maxHp)) * 100));
      Neo.ui.playerHpFill.style.width = `${p1Percent}%`;
      Neo.ui.playerHpFill.style.background = getHpFillColor(p1Percent, Neo.PLAYER_SLOT_CONFIG[0].color);
      Neo.ui.playerHpTxt.textContent = Neo.gameMode === 'pvp' && Neo.pvpState
        ? `${Math.ceil(Neo.player.hp)} | ${getPlayerSlotScoreText(Neo.PLAYER_SLOT_CONFIG[0])}`
        : hpText;
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
      const weaponSkill = Neo.getWeaponCooldownInfo?.(weaponKey, attackSpeed);
      meleeSkill.current = Number(weaponSkill?.current || Neo.player.weaponCooldown || 0);
      meleeSkill.max = Number(weaponSkill?.max || Neo.getWeaponBaseCooldown(weaponKey));
      meleeSkill.charges = Number(weaponSkill?.charges ?? (meleeSkill.current > 0 ? 0 : 1));
      meleeSkill.maxCharges = Number(weaponSkill?.maxCharges || 1);
      meleeSkill.timers = Array.isArray(weaponSkill?.timers) ? weaponSkill.timers : (meleeSkill.current > 0 ? [meleeSkill.current] : []);
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
        melee: { current: meleeSkill.current, max: meleeSkill.max, active: false, charges: meleeSkill.charges, maxCharges: meleeSkill.maxCharges, timers: meleeSkill.timers },
        laser: { current: laserSkill.current, max: laserSkill.max, active: Neo.laserActive, charges: laserSkill.charges, maxCharges: laserSkill.maxCharges, timers: laserSkill.timers },
        smash: { current: smashSkill.current, max: smashSkill.max, active: false, charges: smashSkill.charges, maxCharges: smashSkill.maxCharges, timers: smashSkill.timers },
        dash: { current: dashSkill.current, max: dashSkill.max, active: Neo.player.dashTime > 0 || Neo.player.cowardsWayTime > 0 || Neo.player.princessFlightTime > 0, charges: dashSkill.charges, maxCharges: dashSkill.maxCharges, timers: dashSkill.timers },
      },
    });
    Neo.ui.skillNames.dash.textContent = dashMove?.name || character.skills.dash;
    Neo.ui.skillNames.melee.textContent = weaponDef?.name || meleeMove?.name || character.skills.melee;
    Neo.ui.skillNames.laser.textContent = laserMove?.name || character.skills.laser;
    Neo.ui.skillNames.smash.textContent = smashMove?.name || character.skills.smash;
    // Mirror the hotkey-settings bindings onto the skill cards' key labels so the
    // HUD shows the player's actual controls (slash/laser/smash/dash) rather than
    // the hardcoded defaults. Guarded by a signature since rebinds are rare.
    updateSkillKeyLabels();
    // Redraw the HUD action icons whenever the equipped loadout changes. They are
    // canvas-rendered once, so without this they keep the icon drawn at boot.
    const loadoutSig = `${weaponKey}|${meleeMove?.key || ''}|${laserMove?.key || ''}|${smashMove?.key || ''}|${dashMove?.key || ''}`;
    if (loadoutSig !== Neo._hudActionIconSig) {
      Neo._hudActionIconSig = loadoutSig;
      Neo.drawActionIcons?.();
    }
    Neo.syncCharacterUiTheme();
    renderPlayerStatsPanel();
    
    // Update center display
    if (Neo.ui.coinCount) Neo.ui.coinCount.textContent = Neo.player.coins;
    if (Neo.ui.hudLoopCount) Neo.ui.hudLoopCount.textContent = Number(Neo.metaProgress.loopCrystals || 0);
    const _potionCap = Neo.getPotionCarryCap();
    const storedPotions = Number(Neo.player.storedPotions || 0);
    Neo.updateEquipmentSlots();
    if (Neo.ui.timerDisplay) Neo.ui.timerDisplay.textContent = timeStr;
    if (Neo.ui.floorDisplay) Neo.ui.floorDisplay.textContent = Neo.floor;
    Neo.updateBossRushHud?.();
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
    if (Neo.ui.panelItemAlert) {
      const pawPending = Math.max(0, Math.floor(Number(Neo.player?.wizardPawPendingCount || 0)));
      const batteryPending = Math.max(0, Math.floor(Number(Neo.player?.extraBatteryPendingCount || 0)));
      const pendingTotal = pawPending + batteryPending;
      Neo.ui.panelItemAlert.classList.toggle('hidden', pendingTotal <= 0);
      if (pendingTotal > 0) {
        const countEl = Neo.ui.panelItemAlert.querySelector('.panel-item-alert__count');
        if (countEl) countEl.textContent = String(pendingTotal);
        const label = pawPending > 0
          ? "Wizard's Paw: pick 2 stats"
          : 'Extra Battery: pick a move';
        Neo.ui.panelItemAlert.title = `${label}${pendingTotal > 1 ? ` (+${pendingTotal - 1} more)` : ''}`;
      }
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

    if (Neo.ui.interactPrompt) {
      const shopHint = Neo.getControlHint('e', 'e');
      const touchHint = (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
        ? ` / X BUTTON`
        : '';
      const isShop = Neo.currentRoom?.type === 'shop' && !Neo.isPanelOpen(Neo.ui.shopPanel);
      const isAnvil = Neo.currentRoom?.type === 'anvil' && !Neo.isPanelOpen(Neo.ui.anvilPanel);
      if (isShop) {
        Neo.ui.interactPrompt.textContent = `[${shopHint}]${touchHint}  Open Shop`;
        Neo.ui.interactPrompt.classList.remove('hidden', 'interact-prompt--forge');
      } else if (isAnvil) {
        Neo.ui.interactPrompt.textContent = `[${shopHint}]${touchHint}  Open Forge`;
        Neo.ui.interactPrompt.classList.remove('hidden');
        Neo.ui.interactPrompt.classList.add('interact-prompt--forge');
      } else {
        Neo.ui.interactPrompt.classList.add('hidden');
      }
    }

    Neo.updateItemUI();
  }

  function setCompetitiveSubmitStatus(status) {
    Neo._competitiveSubmitStatus = status;
    Neo.uiController?.setCompetitiveSubmitStatus?.(status);
  }

  function submitCompetitiveRun(entry) {
    if (entry?.result !== 'win') {
      setCompetitiveSubmitStatus({ state: 'idle' });
      return;
    }
    const username = Neo.metaProgress?.username?.trim() || 'Anonymous';
    setCompetitiveSubmitStatus({ state: 'submitting' });
    Neo.fetchCompetitiveJson('/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: username,
        floor: entry.floor,
        seed: entry.seed || Neo.baseSeedStr,
        result: entry.result,
        character: entry.character || Neo.chosenCharacter,
        time: entry.elapsedSeconds,
      }),
    })
      .then(data => {
        entry.competitiveRank = data.rank || null;
        setCompetitiveSubmitStatus({ state: 'ok', rank: data.rank || null });
      })
      .catch(error => {
        setCompetitiveSubmitStatus({
          state: 'error',
          message: error?.message || 'Could not submit competitive run. Server connection is required for leaderboard credit.',
        });
      });
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
    if (Neo.gameMode === 'competitive' && entry.result === 'win') {
      submitCompetitiveRun(entry);
    } else {
      setCompetitiveSubmitStatus({ state: 'idle' });
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
    // Carry the killing blow's residual velocity into the corpse so it gets a
    // little knockback slide instead of dropping straight down.
    const pvx = Number(Neo.player?.vx || 0);
    const pvy = Number(Neo.player?.vy || 0);
    const speed = Math.hypot(pvx, pvy);
    const dir = speed > 4 ? Math.atan2(pvy, pvx) : aimAngle + Math.PI;
    Neo.playerDeathAnim = {
      timer: 0,
      duration: 1.1,
      // Extra hold (0.8s) after the fall finishes before the death screen shows.
      holdDelay: 0.8,
      x: Neo.player?.x ?? 0,
      y: Neo.player?.y ?? 0,
      r: Neo.player?.r ?? 14,
      vx: Math.cos(dir) * (60 + speed * 0.6),
      vy: Math.sin(dir) * (60 + speed * 0.6),
      spriteKey: Neo.getPlayerSpriteKey(),
      facing: Neo.getFacingDirection(Neo.player, aimAngle),
      entry,
    };
    Neo.setGameState('dying');
    Neo.playSfx?.('player_death');
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
    Neo.uiController.setWinScreen(entry);
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
      handsomeDevilCutscenePlayed: Neo.handsomeDevilCutscenePlayed,
      antonyBlemmyeCutscenePlayed: Neo.antonyBlemmyeCutscenePlayed,
      secretRoomVisitedFloors: Array.isArray(Neo.secretRoomVisitedFloors) ? [...Neo.secretRoomVisitedFloors] : [],
      camera: Neo.camera,
    };
  }

  async function deleteSavedRun() {
    Neo.activeRun = null;
    await Neo.saveStore.delete('run');
    Neo.refreshMenuState();
  }

  // ── Equipment slots (F G H J K L U I) ─────────────────────────────────────
  // Items that can be activated by pressing a hotkey. Each defines:
  //   key       — item key in ITEM_DEFS
  //   shortName — text shown under icon in slot
  //   activate  — function called when the slot's hotkey is pressed
  //   getState  — returns 'ready' | 'blocked' | 'charging' | 'empty' for slot styling
  //   getStatusText — short status text for tooltip / aria-label
  const DEFAULT_EQUIPMENT_SLOT_KEYS = ['F', 'G', 'H', 'J', 'K', 'L', 'U', 'I'];
  // Live tool-slot keys, honoring custom bindings from settings. Falls back to defaults.
  function getEquipmentSlotKeys() {
    const custom = window.NeoSettings?.getEquipmentSlotKeys?.();
    if (Array.isArray(custom) && custom.length === DEFAULT_EQUIPMENT_SLOT_KEYS.length) return custom;
    return DEFAULT_EQUIPMENT_SLOT_KEYS;
  }
  // Skill card -> binding action. Melee uses the 'slash' binding; the rest match.
  const SKILL_KEY_ACTIONS = { dash: 'dash', melee: 'slash', laser: 'laser', smash: 'smash' };
  // Hardcoded fallbacks matching index.html, used if NeoSettings isn't ready yet.
  const SKILL_KEY_FALLBACK = { dash: 'SHIFT', melee: 'LMB', laser: 'RMB', smash: 'R' };
  function updateSkillKeyLabels() {
    const keys = Neo.ui?.skillKeys;
    if (!keys) return;
    const getLabel = window.NeoSettings?.getBindingLabel;
    let sig = '';
    const labels = {};
    for (const skill in SKILL_KEY_ACTIONS) {
      const label = (getLabel ? getLabel(SKILL_KEY_ACTIONS[skill]) : '') || SKILL_KEY_FALLBACK[skill];
      labels[skill] = label;
      sig += skill + ':' + label + '|';
    }
    if (sig === Neo._hudSkillKeySig) return;
    Neo._hudSkillKeySig = sig;
    for (const skill in labels) {
      if (keys[skill]) keys[skill].textContent = labels[skill];
    }
  }

  const EQUIPMENT_ACTIVE_DEFS = {
    pew_pew_box: { cooldown: 34, duration: 8, label: 'PEW PEW', color: '#ffe06f' },
    turbo_boots: { cooldown: 46, duration: 20, label: 'TURBO', color: '#79ffbf' },
    skizzard_tail: { cooldown: 38, duration: 5, label: 'SKIZZARD REGEN', color: '#8fffd2' },
    zap_to_extreme: { cooldown: 42, duration: 10, label: 'EXTREME ZAP', color: '#8dd4ff' },
    panic_button: { cooldown: 52, duration: 0, label: 'PANIC', color: '#f4f6fb' },
    mid_sweepy_box: { cooldown: 36, duration: 6, label: 'SWEEPY', color: '#ff6e8b' },
    el_bartos_cape: { cooldown: 58, duration: 10, label: 'EL BARTO', color: '#ffb37a' },
    sparkle_charm: { cooldown: 40, duration: 0, label: 'SPARKLE', color: '#ffe8a3' },
    gold_vac: { cooldown: 120, duration: 120, label: 'GOLD VAC', color: '#ffe07a' },
  };

  function ensureEquipmentRuntimeState() {
    if (!Neo.player) return null;
    if (!Neo.player.equipmentCooldowns || typeof Neo.player.equipmentCooldowns !== 'object') Neo.player.equipmentCooldowns = {};
    if (!Neo.player.equipmentEffects || typeof Neo.player.equipmentEffects !== 'object') Neo.player.equipmentEffects = {};
    return Neo.player;
  }

  function getEquipmentCooldown(itemKey) {
    return Math.max(0, Number(Neo.player?.equipmentCooldowns?.[itemKey] || 0));
  }

  function getEquipmentEffectTime(itemKey) {
    return Math.max(0, Number(Neo.player?.equipmentEffects?.[itemKey]?.time || 0));
  }

  function isEquipmentReady(itemKey) {
    return getEquipmentCooldown(itemKey) <= 0 && getEquipmentEffectTime(itemKey) <= 0;
  }

  function getEquipmentStackCount(itemKey) {
    return Math.max(1, Math.floor(Number(Neo.getItemCount?.(itemKey) || 0)));
  }

  function getEquipmentState(itemKey) {
    if (getEquipmentEffectTime(itemKey) > 0) return 'ready';
    return getEquipmentCooldown(itemKey) <= 0 ? 'ready' : 'charging';
  }

  function getEquipmentStatusText(itemKey) {
    const active = getEquipmentEffectTime(itemKey);
    if (active > 0) return `${Math.ceil(active)}s`;
    const cooldown = getEquipmentCooldown(itemKey);
    return cooldown > 0 ? `${Math.ceil(cooldown)}s` : 'READY';
  }

  function startTimedEquipment(itemKey) {
    const player = ensureEquipmentRuntimeState();
    const def = EQUIPMENT_ACTIVE_DEFS[itemKey];
    if (!player || !def) return false;
    if (!isEquipmentReady(itemKey)) {
      Neo.spawnParticle({ x: player.x, y: player.y - 32, life: 0.5, text: getEquipmentStatusText(itemKey), c: '#ffc880' });
      return false;
    }
    const stacks = getEquipmentStackCount(itemKey);
    player.equipmentCooldowns[itemKey] = def.cooldown;
    if (def.duration > 0) {
      const extraStacks = stacks - 1;
      const durationBonus = {
        pew_pew_box: 1.5,
        turbo_boots: 3,
        skizzard_tail: 1.5,
        zap_to_extreme: 2,
        mid_sweepy_box: 1.5,
        el_bartos_cape: 5,
        gold_vac: 30,
      }[itemKey] || 0;
      player.equipmentEffects[itemKey] = { time: def.duration + extraStacks * durationBonus, tick: 0, stacks };
    }
    if (itemKey === 'panic_button') activatePanicButton();
    if (itemKey === 'sparkle_charm') activateSparkleCharm();
    Neo.itemStatsCacheFrame = -1;
    Neo.spawnParticle({ x: player.x, y: player.y - 34, life: 0.75, text: def.label, c: def.color });
    Neo.scheduleRunSave?.();
    return true;
  }

  function spawnPewPewMissile(stacks = 1) {
    if (!Neo.player || !Neo.spawnProjectile) return;
    const missileCount = Math.min(4, getEquipmentStackCount('pew_pew_box'), Math.max(1, Math.floor(Number(stacks || 1))));
    for (let index = 0; index < missileCount; index += 1) {
      const targetAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      const angle = Number.isFinite(targetAngle) ? targetAngle + Neo.rand(-0.45, 0.45, 'fx') : Neo.rand(0, Math.PI * 2, 'fx');
      const power = 1 + (missileCount - 1) * 0.12;
      Neo.spawnProjectile({
        x: Neo.player.x + Math.cos(angle) * 12,
        y: Neo.player.y + Math.sin(angle) * 12,
        vx: Math.cos(angle) * 260,
        vy: Math.sin(angle) * 260,
        r: 6,
        life: 2.5,
        enemy: false,
        kind: 'homing_missile',
        damage: 16 * power,
        knockback: 120,
        color: '#ffe06f',
        homing: true,
        homingTarget: 'enemy',
        homingRadius: 920,
        homingSpeed: 430,
        homingAccel: 3.8,
        homingTurnRate: 3.5,
      });
    }
  }

  function pulseExtremeZap(stacks = 1) {
    if (!Neo.player) return;
    stacks = Math.max(1, Math.floor(Number(stacks || 1)));
    const targetCount = Math.min(10, 5 + (stacks - 1));
    const damage = 11 + (stacks - 1) * 3;
    const radius = 250 + (stacks - 1) * 22;
    const enemies = [];
    Neo.forEachEnemyNearCircle?.(Neo.player.x, Neo.player.y, radius, enemy => {
      const dx = enemy.x - Neo.player.x;
      const dy = enemy.y - Neo.player.y;
      enemies.push({ enemy, distSq: dx * dx + dy * dy });
    });
    enemies.sort((a, b) => a.distSq - b.distSq);
    enemies.slice(0, targetCount).forEach(({ enemy }) => {
      const angle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      Neo.hitEnemy?.(enemy, damage, angle, 70, '#8dd4ff');
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.2, ring: 14, c: '#bde8ff' });
    });
    const angle = Neo.rand(0, Math.PI * 2, 'fx');
    Neo.hazards.push({
      kind: 'lightning_column',
      x: Neo.player.x + Math.cos(angle) * Neo.rand(28, 92, 'fx'),
      y: Neo.player.y + Math.sin(angle) * Neo.rand(28, 92, 'fx'),
      r: 42,
      ttl: 0.55,
      tick: 0,
      interval: 0.22,
      damage: 10 + (stacks - 1) * 2,
    });
  }

  function activatePanicButton() {
    if (!Neo.player) return;
    const stacks = getEquipmentStackCount('panic_button');
    const radius = 190 + (stacks - 1) * 28;
    const invTime = 1.5 + (stacks - 1) * 0.35;
    Neo.STATUS_KEYS?.forEach(key => Neo.clearStatus?.(Neo.player, key));
    Neo.player.inv = Math.max(Number(Neo.player.inv || 0), invTime);
    Neo.forEachEnemyNearCircle?.(Neo.player.x, Neo.player.y, radius, enemy => {
      const angle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      const force = 440 + (stacks - 1) * 55;
      enemy.vx += Math.cos(angle) * force;
      enemy.vy += Math.sin(angle) * force;
      enemy.stun = Math.max(Number(enemy.stun || 0), 0.28 + (stacks - 1) * 0.05);
      Neo.hitEnemy?.(enemy, 8 + (stacks - 1) * 4, angle, 340, '#f4f6fb');
    });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.65, ring: Math.min(128, 72 + (stacks - 1) * 12), c: '#f4f6fb' });
  }

  // Mark the nearest 5 enemies with a "crit sparkle": while marked, every hit
  // against them is a guaranteed crit (see hitEnemy). Purely offensive setup tool.
  function activateSparkleCharm() {
    if (!Neo.player) return;
    const SPARKLE_DURATION = 6;
    const stacks = getEquipmentStackCount('sparkle_charm');
    const targetCount = Math.min(12, 5 + (stacks - 1) * 2);
    const candidates = [];
    Neo.forEachEnemyNearCircle?.(Neo.player.x, Neo.player.y, 9999, enemy => {
      if (!enemy || enemy.dead || (enemy.spawnT || 0) > 0) return;
      const dx = enemy.x - Neo.player.x;
      const dy = enemy.y - Neo.player.y;
      candidates.push({ enemy, distSq: dx * dx + dy * dy });
    });
    candidates.sort((a, b) => a.distSq - b.distSq);
    const marked = candidates.slice(0, targetCount);
    marked.forEach(({ enemy }) => {
      enemy.critSparkle = Math.max(Number(enemy.critSparkle || 0), SPARKLE_DURATION + (stacks - 1));
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.5, ring: enemy.r + 10, c: '#ffe8a3' });
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 14, life: 0.6, text: 'SPARKLED', c: '#ffe8a3' });
    });
    if (marked.length > 0) {
      Neo.playSfx?.('item_collect');
    }
  }

  function dropSweepyMine(stacks = 1) {
    if (!Neo.player) return;
    stacks = Math.max(1, Math.floor(Number(stacks || 1)));
    const mineCount = Math.min(3, stacks);
    for (let index = 0; index < mineCount; index += 1) {
      const angle = Neo.rand(0, Math.PI * 2, 'fx');
      const distance = Neo.rand(22, 74, 'fx');
      Neo.hazards.push({
        kind: 'thorn_mine',
        owner: 'player',
        x: Neo.player.x + Math.cos(angle) * distance,
        y: Neo.player.y + Math.sin(angle) * distance,
        r: 18,
        ttl: 5,
        armTime: 0.18,
        triggerRadius: 34,
        blastRadius: 62 + (stacks - 1) * 6,
        damage: 18 + (stacks - 1) * 4,
        bleedStacks: Math.min(4, 1 + Math.floor((stacks - 1) / 2)),
        bleedDuration: 4.5 + (stacks - 1) * 0.4,
        statusTick: 0,
      });
    }
  }

  function tickSkizzardRegen(stacks = 1) {
    if (!Neo.player || Neo.player.hp >= Neo.player.maxHp) return;
    stacks = Math.max(1, Math.floor(Number(stacks || 1)));
    const healRatio = 0.025 * (1 + (stacks - 1) * 0.45);
    const heal = Neo.scalePlayerHealing?.(Neo.player.maxHp * healRatio, 1) ?? Math.max(1, Neo.player.maxHp * healRatio);
    const gained = Neo.applyPlayerHealing?.(heal) ?? 0;
    if (gained > 0) {
      Neo.spawnHealPopup?.(Neo.player.x + Neo.rand(-8, 8), Neo.player.y - 22, gained, { color: '#8fffd2', size: 13 });
      Neo.spawnParticle({ x: Neo.player.x + Neo.rand(-10, 10), y: Neo.player.y + Neo.rand(-10, 10), life: 0.22, c: '#8fffd2' });
    }
  }

  function updateEquipmentEffects(dt) {
    const player = ensureEquipmentRuntimeState();
    if (!player) return;
    Object.keys(player.equipmentCooldowns).forEach(key => {
      player.equipmentCooldowns[key] = Math.max(0, Number(player.equipmentCooldowns[key] || 0) - dt);
    });
    Object.entries(player.equipmentEffects).forEach(([key, effect]) => {
      if (!effect || Number(effect.time || 0) <= 0) return;
      effect.time = Math.max(0, Number(effect.time || 0) - dt);
      effect.tick = Math.max(0, Number(effect.tick || 0) - dt);
      if (key === 'pew_pew_box' && effect.tick <= 0) {
        spawnPewPewMissile(effect.stacks);
        effect.tick = 0.5;
      } else if (key === 'skizzard_tail' && effect.tick <= 0) {
        tickSkizzardRegen(effect.stacks);
        effect.tick = 0.5;
      } else if (key === 'zap_to_extreme' && effect.tick <= 0) {
        pulseExtremeZap(effect.stacks);
        effect.tick = 0.45;
      } else if (key === 'mid_sweepy_box' && effect.tick <= 0) {
        dropSweepyMine(effect.stacks);
        effect.tick = 0.42;
      } else if (key === 'el_bartos_cape') {
        player.inv = Math.max(Number(player.inv || 0), 0.12);
      }
      if (key === 'gold_vac') Neo.itemStatsCacheFrame = -1;
      if (effect.time <= 0) {
        delete player.equipmentEffects[key];
        Neo.itemStatsCacheFrame = -1;
      }
    });
  }
  Neo.updateEquipmentEffects = updateEquipmentEffects;

  const ACTIVATABLE_ITEMS = {
    scroll_reroll: {
      key: 'scroll_reroll',
      shortName: 'REROLL',
      activate: () => Neo.openScrollControlSelection?.('scroll_reroll'),
      getState: () => Neo.getItemCount('scroll_reroll') > 0 ? 'ready' : 'blocked',
      getStatusText: () => String(Neo.getItemCount('scroll_reroll') || 0),
    },
    scroll_branching: {
      key: 'scroll_branching',
      shortName: 'BRANCH',
      activate: () => Neo.openScrollControlSelection?.('scroll_branching'),
      getState: () => Neo.getItemCount('scroll_branching') > 0 ? 'ready' : 'blocked',
      getStatusText: () => String(Neo.getItemCount('scroll_branching') || 0),
    },
    scroll_replace: {
      key: 'scroll_replace',
      shortName: 'REPLACE',
      activate: () => Neo.openScrollControlSelection?.('scroll_replace'),
      getState: () => Neo.getItemCount('scroll_replace') > 0 ? 'ready' : 'blocked',
      getStatusText: () => String(Neo.getItemCount('scroll_replace') || 0),
    },
    scroll_abundance: {
      key: 'scroll_abundance',
      shortName: 'ABUND',
      activate: () => Neo.openScrollControlSelection?.('scroll_abundance'),
      getState: () => Neo.getItemCount('scroll_abundance') > 0 ? 'ready' : 'blocked',
      getStatusText: () => String(Neo.getItemCount('scroll_abundance') || 0),
    },
    scroll_pool_weight: {
      key: 'scroll_pool_weight',
      shortName: 'WEIGHT',
      activate: () => Neo.openScrollControlSelection?.('scroll_pool_weight'),
      getState: () => Neo.getItemCount('scroll_pool_weight') > 0 ? 'ready' : 'blocked',
      getStatusText: () => String(Neo.getItemCount('scroll_pool_weight') || 0),
    },
    scroll_ego: {
      key: 'scroll_ego',
      shortName: 'EGO',
      activate: () => Neo.openScrollControlSelection?.('scroll_ego'),
      getState: () => Neo.getItemCount('scroll_ego') > 0 ? 'ready' : 'blocked',
      getStatusText: () => String(Neo.getItemCount('scroll_ego') || 0),
    },
    charged_adapter: {
      key: 'charged_adapter',
      shortName: 'WARP',
      activate: () => Neo.tryChargedLadderWarp?.(),
      getState: () => {
        if (!Neo.player?.escapeReady) return 'charging';
        if (!Neo.currentRoom || Neo.currentRoom.type === 'boss' || Neo.currentRoom.type === 'god') return 'blocked';
        if (Neo.enemies?.length === 0) return 'blocked';
        return 'ready';
      },
      getStatusText: () => {
        if (!Neo.player?.escapeReady) {
          const needed = Neo.getChargeRequirement(10);
          const progress = Math.max(0, Number(Neo.player?.escapeChargeKills || 0));
          return `${progress}/${needed}`;
        }
        return 'READY';
      },
    },
    mateos_bag: {
      key: 'mateos_bag',
      shortName: 'BAG',
      activate: () => Neo.tryUsePotion?.(),
      getState: () => {
        const stored = Number(Neo.player?.storedPotions || 0);
        return stored > 0 ? 'ready' : 'blocked';
      },
      getStatusText: () => {
        const cap = Neo.getPotionCarryCap?.() || 0;
        const stored = Number(Neo.player?.storedPotions || 0);
        return `${stored}/${cap}`;
      },
    },
    pew_pew_box: {
      key: 'pew_pew_box',
      shortName: 'PEW',
      activate: () => startTimedEquipment('pew_pew_box'),
      getState: () => getEquipmentState('pew_pew_box'),
      getStatusText: () => getEquipmentStatusText('pew_pew_box'),
    },
    turbo_boots: {
      key: 'turbo_boots',
      shortName: 'FAST',
      activate: () => startTimedEquipment('turbo_boots'),
      getState: () => getEquipmentState('turbo_boots'),
      getStatusText: () => getEquipmentStatusText('turbo_boots'),
    },
    skizzard_tail: {
      key: 'skizzard_tail',
      shortName: 'REGEN',
      activate: () => startTimedEquipment('skizzard_tail'),
      getState: () => getEquipmentState('skizzard_tail'),
      getStatusText: () => getEquipmentStatusText('skizzard_tail'),
    },
    zap_to_extreme: {
      key: 'zap_to_extreme',
      shortName: 'ZAP',
      activate: () => startTimedEquipment('zap_to_extreme'),
      getState: () => getEquipmentState('zap_to_extreme'),
      getStatusText: () => getEquipmentStatusText('zap_to_extreme'),
    },
    panic_button: {
      key: 'panic_button',
      shortName: 'PANIC',
      activate: () => startTimedEquipment('panic_button'),
      getState: () => getEquipmentState('panic_button'),
      getStatusText: () => getEquipmentStatusText('panic_button'),
    },
    mid_sweepy_box: {
      key: 'mid_sweepy_box',
      shortName: 'SWEEP',
      activate: () => startTimedEquipment('mid_sweepy_box'),
      getState: () => getEquipmentState('mid_sweepy_box'),
      getStatusText: () => getEquipmentStatusText('mid_sweepy_box'),
    },
    el_bartos_cape: {
      key: 'el_bartos_cape',
      shortName: 'CAPE',
      activate: () => startTimedEquipment('el_bartos_cape'),
      getState: () => getEquipmentState('el_bartos_cape'),
      getStatusText: () => getEquipmentStatusText('el_bartos_cape'),
    },
    sparkle_charm: {
      key: 'sparkle_charm',
      shortName: 'SPARKLE',
      activate: () => startTimedEquipment('sparkle_charm'),
      getState: () => getEquipmentState('sparkle_charm'),
      getStatusText: () => getEquipmentStatusText('sparkle_charm'),
    },
    gold_vac: {
      key: 'gold_vac',
      shortName: 'VAC',
      activate: () => startTimedEquipment('gold_vac'),
      getState: () => getEquipmentState('gold_vac'),
      getStatusText: () => getEquipmentStatusText('gold_vac'),
    },
  };
  // Live getter so remapped tool-slot keys are honored everywhere without rewiring.
  Object.defineProperty(Neo, 'EQUIPMENT_SLOT_KEYS', { get: getEquipmentSlotKeys, configurable: true });
  Neo.getEquipmentSlotKeys = getEquipmentSlotKeys;
  Neo.ACTIVATABLE_ITEMS = ACTIVATABLE_ITEMS;
  Neo.isActivatableItem = (itemKey) => Boolean(ACTIVATABLE_ITEMS[itemKey]);

  function syncEquipmentSlotsFromInventory() {
    if (!Neo.player) return;
    if (!Array.isArray(Neo.player.equipmentSlots)) Neo.player.equipmentSlots = [];
    const slots = Neo.player.equipmentSlots;
    // Drop slot entries for items no longer owned.
    for (let i = slots.length - 1; i >= 0; i -= 1) {
      if (Neo.getItemCount(slots[i]) <= 0) slots.splice(i, 1);
    }
    // Append any owned activatable items that aren't slotted yet, capped at slot count.
    for (const itemKey of Object.keys(ACTIVATABLE_ITEMS)) {
      if (Neo.getItemCount(itemKey) > 0 && !slots.includes(itemKey) && slots.length < DEFAULT_EQUIPMENT_SLOT_KEYS.length) {
        slots.push(itemKey);
      }
    }
  }
  Neo.syncEquipmentSlotsFromInventory = syncEquipmentSlotsFromInventory;

  function addToEquipmentSlots(itemKey) {
    if (!ACTIVATABLE_ITEMS[itemKey] || !Neo.player) return;
    if (!Array.isArray(Neo.player.equipmentSlots)) Neo.player.equipmentSlots = [];
    if (Neo.player.equipmentSlots.includes(itemKey)) return;
    if (Neo.player.equipmentSlots.length >= DEFAULT_EQUIPMENT_SLOT_KEYS.length) return;
    Neo.player.equipmentSlots.push(itemKey);
  }
  Neo.addToEquipmentSlots = addToEquipmentSlots;

  // Reorder a tool within the equipment slot array (the toolbar editor uses this).
  // fromIdx/toIdx are positions in Neo.player.equipmentSlots; the item at fromIdx
  // is removed and re-inserted at toIdx, shifting the others — so its hotkey
  // (F G H J K L U I, by index) changes to match its new position.
  function reorderEquipmentSlot(fromIdx, toIdx) {
    if (!Neo.player) return false;
    syncEquipmentSlotsFromInventory();
    const slots = Neo.player.equipmentSlots;
    const len = slots.length;
    fromIdx = Math.trunc(Number(fromIdx));
    toIdx = Math.trunc(Number(toIdx));
    if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx)) return false;
    if (fromIdx < 0 || fromIdx >= len || toIdx < 0 || toIdx >= len || fromIdx === toIdx) return false;
    const [moved] = slots.splice(fromIdx, 1);
    slots.splice(toIdx, 0, moved);
    Neo.scheduleRunSave?.();
    return true;
  }
  Neo.reorderEquipmentSlot = reorderEquipmentSlot;

  // Owned tool item keys in their current slot order. Drives the toolbar editor.
  function getEquippedToolKeys() {
    if (!Neo.player) return [];
    syncEquipmentSlotsFromInventory();
    return (Neo.player.equipmentSlots || []).filter(key => ACTIVATABLE_ITEMS[key] && Neo.getItemCount(key) > 0);
  }
  Neo.getEquippedToolKeys = getEquippedToolKeys;

  function getItemKeyForSlotKey(letter) {
    if (!Neo.player) return null;
    syncEquipmentSlotsFromInventory();
    const idx = getEquipmentSlotKeys().indexOf(String(letter || '').toUpperCase());
    if (idx < 0) return null;
    return Neo.player.equipmentSlots[idx] || null;
  }
  Neo.getItemKeyForSlotKey = getItemKeyForSlotKey;

  function activateEquipmentSlotKey(letter) {
    const itemKey = getItemKeyForSlotKey(letter);
    if (!itemKey) return false;
    const def = ACTIVATABLE_ITEMS[itemKey];
    if (!def?.activate) return false;
    def.activate();
    return true;
  }
  Neo.activateEquipmentSlotKey = activateEquipmentSlotKey;

  // Fire every equipped tool at once (Space activates all). Returns true if any fired.
  function activateAllEquipmentSlots() {
    if (!Neo.player) return false;
    syncEquipmentSlotsFromInventory();
    let activated = false;
    (Neo.player.equipmentSlots || []).forEach(itemKey => {
      const def = itemKey ? ACTIVATABLE_ITEMS[itemKey] : null;
      if (def?.activate) { def.activate(); activated = true; }
    });
    return activated;
  }
  Neo.activateAllEquipmentSlots = activateAllEquipmentSlots;

  function updateEquipmentSlots() {
    const root = Neo.ui.equipmentSlots;
    const nodes = Neo.ui.equipmentSlotNodes;
    if (!root || !nodes?.length) return;
    syncEquipmentSlotsFromInventory();
    const inPlay = Neo.gameState === 'play' || Neo.gameState === 'pause';
    const slots = Neo.player?.equipmentSlots || [];
    const showRow = inPlay;
    root.classList.toggle('hidden', !showRow);
    root.setAttribute('aria-hidden', showRow ? 'false' : 'true');
    nodes.forEach((node, idx) => {
      const letter = getEquipmentSlotKeys()[idx];
      const itemKey = slots[idx];
      const def = itemKey ? ACTIVATABLE_ITEMS[itemKey] : null;
      const itemDef = itemKey ? Neo.resolveItemIconDef?.(itemKey) : null;
      const iconCanvas = node.querySelector('.equip-slot__icon');
      const labelSpan = node.querySelector('.equip-slot__label');
      node.classList.remove('is-ready', 'is-blocked', 'is-filled', 'is-empty');
      if (def && itemDef) {
        node.classList.add('is-filled');
        const state = def.getState?.() || 'ready';
        if (state === 'ready') node.classList.add('is-ready');
        else if (state === 'blocked' || state === 'charging') node.classList.add('is-blocked');
        if (iconCanvas) Neo.drawItemIconByKey?.(iconCanvas, itemKey);
        const statusText = def.getStatusText?.() || '';
        if (labelSpan) labelSpan.textContent = statusText;
        const itemName = itemDef.name || itemKey;
        const itemDesc = itemDef.description || itemDef.desc || '';
        const header = `${itemName} [${letter}]${statusText ? ' · ' + statusText : ''}`;
        node.dataset.tipName = header;
        node.dataset.tipDesc = itemDesc;
        node.dataset.tipRarity = itemDef.rarity || itemDef.category || '';
        node.removeAttribute('title');
        node.setAttribute('aria-label', itemDesc ? `${header}. ${itemDesc}` : header);
        node.setAttribute('aria-hidden', 'false');
      } else {
        node.classList.add('is-empty');
        if (iconCanvas) {
          const ctx = iconCanvas.getContext('2d');
          ctx?.clearRect(0, 0, iconCanvas.width, iconCanvas.height);
        }
        if (labelSpan) labelSpan.textContent = '';
        delete node.dataset.tipName;
        delete node.dataset.tipDesc;
        delete node.dataset.tipRarity;
        node.removeAttribute('title');
        node.setAttribute('aria-label', `Slot ${letter} empty`);
        node.setAttribute('aria-hidden', 'true');
      }
    });
  }
  Neo.updateEquipmentSlots = updateEquipmentSlots;

  // Shared, body-level tooltip element for equipment slots. Lives on <body> so
  // it escapes the equipment bar's scroll/clip container and never gets cut off.
  let equipTooltipEl = null;
  function getEquipTooltipEl() {
    if (equipTooltipEl && equipTooltipEl.isConnected) return equipTooltipEl;
    equipTooltipEl = document.createElement('div');
    equipTooltipEl.className = 'equip-tooltip';
    equipTooltipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(equipTooltipEl);
    return equipTooltipEl;
  }

  function showEquipTooltip(node) {
    const name = node.dataset.tipName;
    if (!name || !node.classList.contains('is-filled')) return;
    const desc = node.dataset.tipDesc || '';
    // Color name + description by rarity.
    const rarityColor = Neo.getRarityNameColor?.(node.dataset.tipRarity);
    const el = getEquipTooltipEl();
    el.innerHTML = '';
    const nameEl = document.createElement('div');
    nameEl.className = 'equip-tooltip__name';
    nameEl.textContent = name;
    if (rarityColor) nameEl.style.color = rarityColor;
    el.appendChild(nameEl);
    if (desc) {
      const descEl = document.createElement('div');
      descEl.className = 'equip-tooltip__desc';
      descEl.textContent = desc;
      if (rarityColor) descEl.style.color = rarityColor;
      el.appendChild(descEl);
    }
    // Position to the left of the slot, vertically centered, clamped on-screen.
    el.classList.add('is-visible');
    const rect = node.getBoundingClientRect();
    const tipRect = el.getBoundingClientRect();
    let top = rect.top + rect.height / 2 - tipRect.height / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - tipRect.height - 8));
    let left = rect.left - tipRect.width - 11;
    if (left < 8) left = rect.right + 11; // fall back to the right if no room
    el.style.top = `${Math.round(top)}px`;
    el.style.left = `${Math.round(left)}px`;
  }

  function hideEquipTooltip() {
    if (equipTooltipEl) equipTooltipEl.classList.remove('is-visible');
  }

  function bindEquipmentSlotClicks() {
    const nodes = Neo.ui.equipmentSlotNodes;
    if (!nodes?.length) return;
    nodes.forEach((node) => {
      if (node.dataset.equipBound === '1') return;
      node.dataset.equipBound = '1';
      node.addEventListener('click', () => {
        const letter = node.dataset.equipKey || '';
        Neo.activateEquipmentSlotKey(letter);
      });
      node.addEventListener('mouseenter', () => showEquipTooltip(node));
      node.addEventListener('mouseleave', hideEquipTooltip);
      node.addEventListener('focus', () => showEquipTooltip(node));
      node.addEventListener('blur', hideEquipTooltip);
    });
  }
  Neo.bindEquipmentSlotClicks = bindEquipmentSlotClicks;

  // Expose on Neo
  Neo.getObjectiveEntries = getObjectiveEntries;
  Neo.updateObjective = updateObjective;
  // Re-applies objective tracker visibility/content (e.g. after the settings
  // toggle changes). Safe no-op outside of play since updateObjective guards.
  Neo.refreshObjectiveTracker = () => { if (Neo.player) updateObjective(); };
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
