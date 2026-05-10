  function bindInput() {
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('mousemove', event => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
      mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
    });
    canvas.addEventListener('mousedown', event => {
      if (event.button === 0) { mouse.down = true; mouse.downQueued = true; }
      if (event.button === 2) { mouse.right = true; mouse.rightQueued = true; }
    });
    window.addEventListener('mouseup', event => {
      if (event.button === 0) mouse.down = false;
      if (event.button === 2) mouse.right = false;
    });
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (event.key === 'F3' || (event.ctrlKey && event.shiftKey && key === 'p')) {
        event.preventDefault();
        setPerfEnabled(!perfState.enabled);
        return;
      }
      if (uiController?.isDialogueOpen?.()) {
        keys[key] = false;
        if (key === 'enter' || key === ' ' || key === 'escape') {
          event.preventDefault();
          uiController.advanceDialogue();
        }
        return;
      }
      keys[key] = true;
      const b = window.NeoSettings?.getBindings();
      const inventoryKey = b ? b.inventory : 'i';
      if (isWizardPawOpen()) {
        if (event.key === 'Escape') event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        if (gameState === 'play') { pauseGame(); return; }
        if (gameState === 'pause') { resumeGame(); return; }
      }
      if (gameState === 'play' && key === 'k' && isFirstRunTutorialActive()) {
        event.preventDefault();
        skipFirstRunTutorial();
        return;
      }
      if (key === 'e' && gameState === 'play') {
        const inShopRoom = currentRoom?.type === 'shop';
        if (inShopRoom && !shopKeyLatch) {
          toggleShopPanel();
          shopKeyLatch = true;
        }
        const inAnvilRoom = currentRoom?.type === 'anvil';
        if (inAnvilRoom && !anvilKeyLatch) {
          toggleAnvilPanel();
          anvilKeyLatch = true;
        }
      }
      if (key === inventoryKey && gameState === 'play' && !invKeyLatch) {
        toggleInventoryPanel();
        invKeyLatch = true;
      }
      if (b && key === b.smash && gameState === 'play') trySmash();
      else if (!b && key === 'r' && gameState === 'play') trySmash();
    });
    window.addEventListener('keyup', event => {
      const key = event.key.toLowerCase();
      if (uiController?.isDialogueOpen?.()) {
        keys[key] = false;
        return;
      }
      keys[key] = false;
      const b = window.NeoSettings?.getBindings();
      const inventoryKey = b ? b.inventory : 'i';
      if (key === 'e') { shopKeyLatch = false; anvilKeyLatch = false; }
      if (key === ' ') ladderUseKeyLatch = false;
      if (key === inventoryKey) invKeyLatch = false;
    });
    uiController.bindMenuActions({
      _getChosenCharacter() {
        if (charSelectPhase === 'p2') return chosenCharacter2;
        if (charSelectPhase === 'p3') return chosenCharacter3;
        if (charSelectPhase === 'p4') return chosenCharacter4;
        return chosenCharacter;
      },
      onCharacterSelect(characterKey, button) {
        if (button.classList.contains('locked')) return;
        if (charSelectPhase === 'p2') { chosenCharacter2 = characterKey; }
        else if (charSelectPhase === 'p3') { chosenCharacter3 = characterKey; }
        else if (charSelectPhase === 'p4') { chosenCharacter4 = characterKey; }
        else { chosenCharacter = characterKey; metaProgress.selectedCharacter = chosenCharacter; persistMetaSoon(); }
        updateCharacterSelectionUI();
      },
      onDifficultySelect(difficultyKey, button) {
        if (button.classList.contains('locked')) return;
        selectedDifficulty = normalizeDifficulty(difficultyKey);
        metaProgress.selectedDifficulty = selectedDifficulty;
        persistMetaSoon();
        updateCharacterSelectionUI();
      },
      onChallengeSelect(challengeKey, button) {
        const def = CHALLENGE_DEFS[challengeKey];
        if (!def || button.classList.contains('locked')) return;
        const owned = getOwnedChallengeSet();
        if (!owned.has(challengeKey)) {
          if ((metaProgress.loopCrystals || 0) < def.cost) {
            particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 30, life: 0.9, text: 'Not enough loop crystals', c: '#ff6f7f' });
            return;
          }
          metaProgress.loopCrystals = Number(metaProgress.loopCrystals || 0) - def.cost;
          metaProgress.unlockedChallenges = normalizeChallengeSelection([...(metaProgress.unlockedChallenges || []), challengeKey]);
          selectedChallenges = normalizeChallengeSelection([...selectedChallenges, challengeKey]);
          persistMetaSoon();
        } else if (selectedChallenges.includes(challengeKey)) {
          selectedChallenges = selectedChallenges.filter(key => key !== challengeKey);
        } else {
          selectedChallenges = normalizeChallengeSelection([...selectedChallenges, challengeKey]);
        }
        metaProgress.selectedChallenges = normalizeChallengeSelection(selectedChallenges);
        persistMetaSoon();
        updateCharacterSelectionUI();
      },
      onAdvanceDialogue() {
        uiController.advanceDialogue();
      },
      onToggleChallenges() {
        const opening = ui.challengePanel?.classList.contains('hidden');
        if (opening) uiController.setLegacyPanelOpen(false);
        uiController.setChallengePanelOpen(opening);
      },
      onToggleLegacy() {
        const opening = ui.legacyPanel?.classList.contains('hidden');
        if (opening) uiController.setChallengePanelOpen(false);
        uiController.setLegacyPanelOpen(opening);
      },
      onLegacySelect(legacyKey) {
        const def = LEGACY_UPGRADES[legacyKey];
        if (!def) return;
        if (hasLegacy(legacyKey)) return;
        if ((metaProgress.loopCrystals || 0) < def.cost) {
          return;
        }
        metaProgress.loopCrystals = Number(metaProgress.loopCrystals || 0) - def.cost;
        metaProgress.unlockedLegacy = normalizeLegacySelection([...(metaProgress.unlockedLegacy || []), legacyKey]);
        persistMetaSoon();
        updateCharacterSelectionUI();
      },
      onToggleRunHistory() {
        uiController.setRunHistoryOpen(ui.runHistoryPanel?.classList.contains('hidden'));
      },
      onOpenSandboxConfig() {
        uiController.setSandboxPanelOpen(true);
      },
      onCloseSandboxConfig() {
        uiController.setSandboxPanelOpen(false);
      },
      onSkipTutorial() {
        skipFirstRunTutorial();
      },
      onTutorialPrev() {
        navigateTutorialStep(-1);
      },
      onTutorialNext() {
        navigateTutorialStep(1);
      },
      onOpenCharacterSelect() { gameMode = 'normal'; setGameState('charselect'); },
      onCloseCharacterSelect() {
        const phases = ['p1','p2','p3','p4'].slice(0, mpPlayerCount);
        const cur = phases.indexOf(charSelectPhase);
        if (cur > 0) {
          charSelectPhase = phases[cur - 1];
          updateCharacterSelectionUI();
          return;
        }
        charSelectPhase = null;
        setGameState('menu');
      },
      onOpenAltModeCharSelect(mode) {
        gameMode = mode;
        if (mode === 'coop' || mode === 'pvp') {
          openMpLobby(mode);
        } else {
          charSelectPhase = null;
          setGameState('charselect');
          updateCharacterSelectionUI();
        }
      },
      onStartSandbox() {
        gameMode = 'sandbox';
        selectedDifficulty = 'easy';
        metaProgress.selectedDifficulty = selectedDifficulty;
        persistMetaSoon();
        setGameState('charselect');
      },
      onStartNew() {
        const phases = ['p1','p2','p3','p4'].slice(0, mpPlayerCount);
        const cur = phases.indexOf(charSelectPhase);
        if (cur >= 0 && cur < phases.length - 1) {
          charSelectPhase = phases[cur + 1];
          updateCharacterSelectionUI();
          return;
        }
        charSelectPhase = null;
        void startGame(false);
      },
      onContinue() { void startGame(true); },
      onDeleteRun() { void deleteSavedRun(); },
      onRerunFromHistory(entryId) {
        const entry = runHistory.find(e => e.id === entryId);
        if (!entry) return;
        gameMode = normalizeGameMode(entry.mode);
        chosenCharacter = entry.character || chosenCharacter;
        metaProgress.selectedCharacter = chosenCharacter;
        selectedDifficulty = normalizeDifficulty(entry.difficulty);
        metaProgress.selectedDifficulty = selectedDifficulty;
        selectedChallenges = normalizeRunHistoryChallengeKeys(entry);
        metaProgress.selectedChallenges = normalizeChallengeSelection(selectedChallenges);
        persistMetaSoon();
        if (ui.seed) ui.seed.value = entry.seed || '';
        uiController.setRunHistoryOpen(false);
        void startGame(false);
      },
    });
    uiController.bindRestartActions({
      onWinRestart() {
        if (ui.seed) ui.seed.value = baseSeedStr;
        void startGame(false);
      },
      onDeadAction(action) {
        if (action === 'menu') {
          gameMode = 'normal';
          resetMultiplayerState();
          setGameState('menu');
          refreshMenuState();
          return;
        }
        if (action === 'revive') {
          reviveFromDeath();
          return;
        }
        if (action === 'retry-new') {
          if (ui.seed) ui.seed.value = '';
          baseSeedStr = createRandomSeed();
          void startGame(false);
          return;
        }
        if (ui.seed) ui.seed.value = baseSeedStr;
        void startGame(false);
      },
    });

    ui.pauseResume.addEventListener('click', resumeGame);
    ui.pauseSettings.addEventListener('click', () => {
      document.getElementById('settingsBtn').click();
    });
    ui.pauseMain.addEventListener('click', () => {
      clearTimeout(savePendingTimer);
      gameMode = 'normal';
      void saveRunNow().then(() => { setGameState('menu'); });
    });
    ui.wizardPawChoices?.addEventListener('click', handleWizardPawChoiceClick);
    ui.wizardPawConfirm?.addEventListener('click', confirmWizardPawSelection);

    window.addEventListener('beforeunload', () => {
      if (gameState === 'play') {
        clearTimeout(savePendingTimer);
        saveRunNow();
      }
      if (metaSavePendingTimer) {
        clearTimeout(metaSavePendingTimer);
        metaSavePendingTimer = 0;
      }
      if (metaSaveDirty) {
        metaSaveDirty = false;
        saveStore.put('meta', metaProgress);
      }
    });
  }

  function clearGameplayInput() {
    Object.keys(keys).forEach(key => {
      keys[key] = false;
    });
    mouse.down = false;
    mouse.right = false;
    mouse.downQueued = false;
    mouse.rightQueued = false;
  }

  function bindPanelInput() {
    ui.shopClose?.addEventListener('click', () => setShopPanelOpen(false));
    ui.invClose?.addEventListener('click', () => setInventoryPanelOpen(false));
    ui.anvilClose?.addEventListener('click', () => setAnvilPanelOpen(false));
    ui.anvilCancel?.addEventListener('click', () => { anvilStagedUpgrades = {}; setAnvilPanelOpen(false); });
    ui.anvilConfirm?.addEventListener('click', confirmAnvilUpgrades);
    ui.anvilTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        activeAnvilTab = tab.dataset.anvilTab || 'weapons';
        anvilSelectedItem = null;
        renderAnvilPanel();
      });
    });
    ui.anvilWeaponList?.addEventListener('click', handleAnvilItemSelect);
    ui.anvilMoveList?.addEventListener('click', handleAnvilItemSelect);
    ui.anvilWeaponStats?.addEventListener('click', handleAnvilStatClick);
    ui.anvilMoveStats?.addEventListener('click', handleAnvilStatClick);
    ui.shopTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const nextTab = tab.dataset.tab || 'items';
        activeShopTab = nextTab;
        markShopPanelDirty();
        renderShopPanel();
      });
    });
    ui.invTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        activeInvTab = tab.dataset.invTab || 'stats';
        renderInventoryPanel();
      });
    });
    ui.invPlayerTabBtns.forEach(tab => {
      tab.addEventListener('click', () => {
        activeInvPlayer = Number(tab.dataset.invPlayer) || 1;
        renderInventoryPanel();
      });
    });
    ui.shopItems?.addEventListener('click', handleShopBuyClick);
    ui.shopWeapons?.addEventListener('click', handleShopBuyClick);
    ui.shopMoves?.addEventListener('click', handleShopBuyClick);
    ui.shopHeals?.addEventListener('click', handleShopBuyClick);
    ui.invMovesList?.addEventListener('click', handleInventoryMoveSelect);
    ui.invWeaponsList?.addEventListener('click', handleInventoryWeaponSelect);
    ui.invMovesList?.addEventListener('dragstart', event => {
      const target = event.target instanceof Element ? event.target : null;
      const moveKey = target?.closest('[data-move]')?.dataset?.move;
      if (!moveKey) return;
      draggingMoveKey = moveKey;
      event.dataTransfer?.setData('text/plain', moveKey);
    });
    ui.invMovesList?.addEventListener('dragover', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
      const moveKey = draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
      const targetMoveKey = target?.dataset?.move || '';
      if (!MOVE_DEFS[moveKey] || !MOVE_DEFS[targetMoveKey]) return;
      if (MOVE_DEFS[moveKey].slot !== MOVE_DEFS[targetMoveKey].slot) return;
      event.preventDefault();
      target?.classList.add('drag-over');
    });
    ui.invMovesList?.addEventListener('dragleave', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
      target?.classList.remove('drag-over');
    });
    ui.invMovesList?.addEventListener('drop', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
      const moveKey = draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
      const targetMoveKey = target?.dataset?.move || '';
      target?.classList.remove('drag-over');
      if (!MOVE_DEFS[moveKey] || !MOVE_DEFS[targetMoveKey]) return;
      if (MOVE_DEFS[moveKey].slot !== MOVE_DEFS[targetMoveKey].slot) return;
      event.preventDefault();
      equipMove(MOVE_DEFS[targetMoveKey].slot, targetMoveKey);
    });
    ui.invMovesList?.addEventListener('dragend', () => {
      draggingMoveKey = '';
      clearInventoryDragState();
    });
    Object.entries(ui.invSlots).forEach(([slot, node]) => {
      if (!node) return;
      node.addEventListener('click', () => {
        activeInventorySlot = activeInventorySlot === slot ? '' : slot;
        markInventoryPanelDirty();
        renderInventoryPanel();
      });
      node.addEventListener('dragstart', event => {
        const moveKey = node.dataset.move || '';
        if (!moveKey) {
          event.preventDefault();
          return;
        }
        draggingMoveKey = moveKey;
        event.dataTransfer?.setData('text/plain', moveKey);
      });
      node.addEventListener('dragend', () => {
        draggingMoveKey = '';
        clearInventoryDragState();
      });
      node.addEventListener('dragover', event => {
        event.preventDefault();
        const moveKey = draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
        if (!MOVE_DEFS[moveKey] || MOVE_DEFS[moveKey].slot !== slot) return;
        node.classList.add('drag-over');
      });
      node.addEventListener('dragleave', () => {
        node.classList.remove('drag-over');
      });
      node.addEventListener('drop', event => {
        event.preventDefault();
        node.classList.remove('drag-over');
        const moveKey = draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
        equipMove(slot, moveKey);
      });
    });
    ui.invWeaponSlot?.addEventListener('click', () => {
      if (player?.equippedWeapon) equipWeapon('');
    });
  }

  function clearInventoryDragState() {
    Object.values(ui.invSlots).forEach(node => node?.classList.remove('drag-over'));
    ui.invMovesList?.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
  }

  function handleInventoryMoveSelect(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
    const moveKey = target?.dataset?.move || '';
    if (!moveKey || !MOVE_DEFS[moveKey]) return;
    activeInventorySlot = MOVE_DEFS[moveKey].slot;
    equipMove(MOVE_DEFS[moveKey].slot, moveKey);
  }

  function isPanelOpen(panel) {
    return !!panel && !panel.classList.contains('hidden');
  }

  function markShopPanelDirty() {
    shopPanelDirty = true;
  }

  function markInventoryPanelDirty() {
    inventoryPanelDirty = true;
  }

  function setShopPanelOpen(open) {
    if (!ui.shopPanel) return;
    ui.shopPanel.classList.toggle('hidden', !open);
    ui.shopPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      markShopPanelDirty();
      renderShopPanel();
    }
  }

  function setInventoryPanelOpen(open) {
    if (!ui.invPanel) return;
    ui.invPanel.classList.toggle('hidden', !open);
    ui.invPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (!open) activeInventorySlot = '';
    if (open) {
      const isCoop = gameMode === 'coop' && (player2 || player3 || player4);
      if (ui.invPlayerTabs) ui.invPlayerTabs.classList.toggle('hidden', !isCoop);
      if (isCoop) updateInvPlayerTabVisibility();
      markInventoryPanelDirty();
      renderInventoryPanel();
    }
  }

  function updateInvPlayerTabVisibility() {
    const players = [player, player2, player3, player4];
    const dead = [false, p2DeadInCoop, p3DeadInCoop, p4DeadInCoop];
    ui.invPlayerTabBtns.forEach(tab => {
      const n = Number(tab.dataset.invPlayer);
      const exists = !!players[n - 1];
      tab.classList.toggle('hidden', !exists);
      tab.classList.toggle('active', n === activeInvPlayer);
      tab.classList.toggle('inv-player-dead', dead[n - 1]);
    });
    // If selected player no longer exists, fall back to P1
    const players2 = [player, player2, player3, player4];
    if (!players2[activeInvPlayer - 1]) activeInvPlayer = 1;
  }

  function toggleShopPanel() {
    if (currentRoom?.type !== 'shop') return;
    const next = !isPanelOpen(ui.shopPanel);
    setShopPanelOpen(next);
    if (next && isFirstRunTutorialActive()) tutorialState.openedShop = true;
    if (next) setInventoryPanelOpen(false);
  }

  function toggleInventoryPanel() {
    const next = !isPanelOpen(ui.invPanel);
    setInventoryPanelOpen(next);
    if (next && isFirstRunTutorialActive()) tutorialState.openedInventory = true;
    if (next) setShopPanelOpen(false);
  }

  // ---- Anvil panel ----

  function setAnvilPanelOpen(open) {
    if (!ui.anvilPanel) return;
    ui.anvilPanel.classList.toggle('hidden', !open);
    ui.anvilPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      anvilStagedUpgrades = {};
      anvilSelectedItem = null;
      renderAnvilPanel();
    }
  }

  function toggleAnvilPanel() {
    if (currentRoom?.type !== 'anvil') return;
    const next = !isPanelOpen(ui.anvilPanel);
    if (!next) anvilStagedUpgrades = {};
    setAnvilPanelOpen(next);
    if (next) { setShopPanelOpen(false); setInventoryPanelOpen(false); }
  }

  function getAnvilStatSchema(itemKey, itemType) {
    const base = itemType === 'weapon' ? WEAPON_BASE_STATS[itemKey] : MOVE_BASE_STATS[itemKey];
    if (!base) return [];
    const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;
    return Object.entries(schema)
      .filter(([statKey]) => statKey in base)
      .map(([statKey, def]) => ({ statKey, ...def, baseValue: base[statKey] }));
  }

  function getAnvilCurrentValue(itemKey, statKey, itemType) {
    const base = itemType === 'weapon' ? WEAPON_BASE_STATS[itemKey] : MOVE_BASE_STATS[itemKey];
    if (!base || !(statKey in base)) return 0;
    const upgrades = player.anvilUpgrades?.[itemType]?.[itemKey]?.[statKey] ?? 0;
    const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;
    return base[statKey] + upgrades * schema[statKey].step;
  }

  function getAnvilStagedValue(itemKey, statKey, itemType) {
    const cur = getAnvilCurrentValue(itemKey, statKey, itemType);
    const staged = anvilStagedUpgrades[`${itemType}:${itemKey}:${statKey}`] ?? 0;
    const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;
    return cur + staged * schema[statKey].step;
  }

  function getAnvilTotalCost() {
    let total = 0;
    for (const [key, count] of Object.entries(anvilStagedUpgrades)) {
      if (count === 0) continue;
      const [itemType, , statKey] = key.split(':');
      const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;
      total += Math.abs(count) * (schema[statKey]?.xpPerStep ?? 0);
    }
    return total;
  }

  function renderAnvilPanel() {
    if (!isPanelOpen(ui.anvilPanel) || !player) return;

    // XP display (current XP, not total)
    if (ui.anvilXp) ui.anvilXp.textContent = player.xp ?? 0;

    // Tab visibility
    const isWeapons = activeAnvilTab === 'weapons';
    ui.anvilWeaponsTab?.classList.toggle('hidden', !isWeapons);
    ui.anvilMovesTab?.classList.toggle('hidden', isWeapons);
    ui.anvilTabs.forEach(t => t.classList.toggle('active', t.dataset.anvilTab === activeAnvilTab));

    if (isWeapons) renderAnvilItemList('weapon');
    else renderAnvilItemList('move');

    renderAnvilStatPanel();
    renderAnvilFooter();
  }

  function renderAnvilItemList(itemType) {
    const listEl = itemType === 'weapon' ? ui.anvilWeaponList : ui.anvilMoveList;
    if (!listEl) return;

    let keys = [];
    if (itemType === 'weapon') {
      keys = Object.keys(player.ownedWeapons || {}).filter(k => WEAPON_BASE_STATS[k] && player.ownedWeapons[k]);
    } else {
      keys = Object.keys(player.ownedMoves || {}).filter(k => MOVE_BASE_STATS[k] && player.ownedMoves[k]);
    }

    if (keys.length === 0) {
      listEl.innerHTML = `<p style="color:#91a8be;font-size:13px;padding:8px">No ${itemType}s owned.</p>`;
      return;
    }

    listEl.innerHTML = keys.map(key => {
      const def = itemType === 'weapon' ? WEAPON_DEFS[key] : MOVE_DEFS[key];
      const name = def?.name || key;
      const color = def?.color || '#9ec6ff';
      const isActive = anvilSelectedItem === `${itemType}:${key}`;
      return `<button class="anvil-item-btn${isActive ? ' is-active' : ''}" data-item="${key}" data-item-type="${itemType}">
        <span class="anvil-item-dot" style="background:${color}"></span>
        <span style="color:${getRarityNameColor(def?.rarity || def?.category)}">${name}</span>
      </button>`;
    }).join('');
  }

  function renderAnvilStatPanel() {
    if (!anvilSelectedItem) {
      if (ui.anvilWeaponStats) ui.anvilWeaponStats.classList.add('hidden');
      if (ui.anvilMoveStats) ui.anvilMoveStats.classList.add('hidden');
      return;
    }
    const [itemType, itemKey] = anvilSelectedItem.split(':');
    const statEl = itemType === 'weapon' ? ui.anvilWeaponStats : ui.anvilMoveStats;
    const otherEl = itemType === 'weapon' ? ui.anvilMoveStats : ui.anvilWeaponStats;
    if (!statEl) return;
    statEl.classList.remove('hidden');
    if (otherEl) otherEl.classList.add('hidden');

    const def = itemType === 'weapon' ? WEAPON_DEFS[itemKey] : MOVE_DEFS[itemKey];
    const stats = getAnvilStatSchema(itemKey, itemType);
    const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;

    const rows = stats.map(({ statKey, label, min, max, xpPerStep, format }) => {
      const cur = getAnvilCurrentValue(itemKey, statKey, itemType);
      const staged = getAnvilStagedValue(itemKey, statKey, itemType);
      const step = schema[statKey].step;
      const stagedCount = anvilStagedUpgrades[`${itemType}:${itemKey}:${statKey}`] ?? 0;

      // next value after pressing +: staged + step
      const nextVal = staged + step;
      const canIncrease = step > 0 ? nextVal <= max : nextVal >= min;
      const canDecrease = stagedCount > 0;

      const stagedDisplay = staged !== cur
        ? `<span class="anvil-stat-staged">&rarr; ${format(staged)}</span>`
        : '';
      const costDisplay = xpPerStep > 0 ? `<span class="anvil-stat-cost">${xpPerStep} XP/step</span>` : '';

      return `<div class="anvil-stat-row">
        <span class="anvil-stat-label">${label}</span>
        <span class="anvil-stat-value">${format(cur)}</span>
        ${stagedDisplay}
        ${costDisplay}
        <div class="anvil-stat-controls">
          <button class="anvil-stat-btn" data-stat="${statKey}" data-item="${itemKey}" data-item-type="${itemType}" data-dir="-1" ${canDecrease ? '' : 'disabled'}>&#8722;</button>
          <button class="anvil-stat-btn" data-stat="${statKey}" data-item="${itemKey}" data-item-type="${itemType}" data-dir="1" ${canIncrease ? '' : 'disabled'}>&#43;</button>
        </div>
      </div>`;
    });

    statEl.innerHTML = `<div class="anvil-stat-title" style="color:${getRarityNameColor(def?.rarity || def?.category)}">${def?.name || itemKey}</div>${rows.join('')}`;
  }

  function renderAnvilFooter() {
    const cost = getAnvilTotalCost();
    const xp = player?.xp ?? 0;
    if (ui.anvilCostSummary) {
      if (cost === 0) {
        ui.anvilCostSummary.textContent = 'Select stats above and press + to stage upgrades.';
      } else {
        ui.anvilCostSummary.textContent = `Total: ${cost} XP  (you have ${xp} XP)`;
        ui.anvilCostSummary.style.color = xp >= cost ? '#7eff9e' : '#ff7c88';
      }
    }
    if (ui.anvilConfirm) {
      ui.anvilConfirm.disabled = cost === 0 || xp < cost;
    }
  }

  function handleAnvilItemSelect(event) {
    const btn = event.target.closest('[data-item]');
    if (!btn) return;
    const itemKey = btn.dataset.item;
    const itemType = btn.dataset.itemType;
    anvilSelectedItem = `${itemType}:${itemKey}`;
    renderAnvilPanel();
  }

  function handleAnvilStatClick(event) {
    const btn = event.target.closest('[data-stat]');
    if (!btn || btn.disabled) return;
    const statKey = btn.dataset.stat;
    const itemKey = btn.dataset.item;
    const itemType = btn.dataset.itemType;
    const dir = Number(btn.dataset.dir);
    const stageKey = `${itemType}:${itemKey}:${statKey}`;
    const schema = itemType === 'weapon' ? WEAPON_UPGRADEABLE_STATS : MOVE_UPGRADEABLE_STATS;
    const statDef = schema[statKey];
    if (!statDef) return;

    const currentStaged = anvilStagedUpgrades[stageKey] ?? 0;

    if (dir === 1) {
      // Check cap
      const newVal = getAnvilStagedValue(itemKey, statKey, itemType) + statDef.step;
      const capped = statDef.step > 0 ? newVal > statDef.max : newVal < statDef.min;
      if (capped) return;
      // Check if we could afford one more step
      const nextCost = getAnvilTotalCost() + statDef.xpPerStep;
      if (nextCost > (player?.xp ?? 0)) return;
      anvilStagedUpgrades[stageKey] = currentStaged + 1;
    } else {
      // Remove a staged step (can't undo already-committed upgrades)
      if (currentStaged <= 0) return;
      anvilStagedUpgrades[stageKey] = currentStaged - 1;
    }
    renderAnvilPanel();
  }

  function confirmAnvilUpgrades() {
    const cost = getAnvilTotalCost();
    if (!player || cost === 0 || player.xp < cost) return;

    player.xp -= cost;

    if (!player.anvilUpgrades) player.anvilUpgrades = { weapon: {}, move: {} };

    for (const [key, count] of Object.entries(anvilStagedUpgrades)) {
      if (count === 0) continue;
      const [itemType, itemKey, statKey] = key.split(':');
      if (!player.anvilUpgrades[itemType]) player.anvilUpgrades[itemType] = {};
      if (!player.anvilUpgrades[itemType][itemKey]) player.anvilUpgrades[itemType][itemKey] = {};
      player.anvilUpgrades[itemType][itemKey][statKey] =
        (player.anvilUpgrades[itemType][itemKey][statKey] ?? 0) + count;
    }

    anvilStagedUpgrades = {};
    markInventoryPanelDirty();
    scheduleRunSave();
    particles.push({ x: player.x, y: player.y - 26, life: 1.0, text: 'UPGRADED!', c: '#ffb840' });
    renderAnvilPanel();
    updateHud();
  }

  // Returns the anvil bonus for a given weapon stat (additive delta)
  function getAnvilWeaponBonus(weaponKey, statKey) {
    const upgrades = player?.anvilUpgrades?.weapon?.[weaponKey]?.[statKey] ?? 0;
    if (upgrades === 0) return 0;
    return upgrades * (WEAPON_UPGRADEABLE_STATS[statKey]?.step ?? 0);
  }

  // Returns the anvil bonus for a given move stat
  function getAnvilMoveBonus(moveKey, statKey) {
    const upgrades = player?.anvilUpgrades?.move?.[moveKey]?.[statKey] ?? 0;
    if (upgrades === 0) return 0;
    return upgrades * (MOVE_UPGRADEABLE_STATS[statKey]?.step ?? 0);
  }

  function isWizardPawOpen() {
    return !!wizardPawSelection && isPanelOpen(ui.wizardPawModal);
  }

  function setWizardPawModalOpen(open) {
    if (!ui.wizardPawModal) return;
    ui.wizardPawModal.classList.toggle('hidden', !open);
    ui.wizardPawModal.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function isOverlayBlockingInput() {
    return isPanelOpen(ui.shopPanel) || isPanelOpen(ui.invPanel) || isPanelOpen(ui.anvilPanel) || isWizardPawOpen();
  }

  function isGodSweepUnlocked() {
    return Number(metaProgress.godsKilled || 0) > 0 && Number(metaProgress.loopCrystals || 0) >= 5;
  }

  function getShopMoveOffers() {
    if (!currentRoom || currentRoom.type !== 'shop') return [];
    if (!Array.isArray(currentRoom.shopMoveOffers) || currentRoom.shopMoveOffers.length === 0) {
      const shopRandom = createRoomRandom(currentRoom, 'shop:move-offers');
      const seen = new Set(Object.keys(player?.ownedMoves || {}));
      const allowedCharacter = player?.character || chosenCharacter;
      const pool = SHOP_MOVE_POOL.filter(key => key !== 'god_sweep' && !seen.has(key) && isMoveAllowedForCharacter(key, allowedCharacter));
      const shuffledPool = shuffleWithRandom(pool, shopRandom);
      const offers = shuffledPool.slice(0, 4).map((moveKey, index) => ({
        type: 'move',
        key: moveKey,
        bought: false,
        cost: getShopMoveCost(index),
      }));
      if (isGodSweepUnlocked() && !seen.has('god_sweep') && shopRandom() < 0.12) {
        const insertIndex = Math.min(offers.length, Math.floor(shopRandom() * (Math.min(offers.length, 3) + 1)));
        offers.splice(insertIndex, 0, {
          type: 'move',
          key: 'god_sweep',
          bought: false,
          cost: getShopGodSweepCost(),
        });
      }
      currentRoom.shopMoveOffers = offers.slice(0, 4);
    } else {
      const allowedCharacter = player?.character || chosenCharacter;
      currentRoom.shopMoveOffers = currentRoom.shopMoveOffers.filter(offer => offer.type !== 'move' || isMoveAllowedForCharacter(offer.key, allowedCharacter));
    }
    refreshRoomShopCosts(currentRoom);
    return currentRoom.shopMoveOffers;
  }

  function getShopWeaponOffers() {
    if (!currentRoom || currentRoom.type !== 'shop') return [];
    if (!Array.isArray(currentRoom.shopWeaponOffers) || currentRoom.shopWeaponOffers.length === 0) {
      const shopRandom = createRoomRandom(currentRoom, 'shop:weapon-offers');
      const owned = new Set(Object.keys(player?.ownedWeapons || {}).filter(key => player?.ownedWeapons?.[key]));
      const pool = [];
      if (floor >= 1) pool.push(...WHITE_WEAPON_POOL);
      if (floor >= 4) pool.push(...PURPLE_WEAPON_POOL);
      if (floor >= 7) pool.push(...RED_WEAPON_POOL);
      const filtered = pool.filter(key => !owned.has(key));
      const shuffledFiltered = shuffleWithRandom(filtered, shopRandom);
      const offers = shuffledFiltered.slice(0, 3).map((weaponKey, index) => ({
        type: 'weapon',
        key: weaponKey,
        bought: false,
        cost: getShopWeaponCost(WEAPON_DEFS[weaponKey]?.rarity || 'knight', index, floor, selectedDifficulty, weaponKey),
      }));
      currentRoom.shopWeaponOffers = offers;
    }
    refreshRoomShopCosts(currentRoom);
    return currentRoom.shopWeaponOffers;
  }

  function renderShopPanel() {
    if (!ui.shopPanel || !player) return;
    refreshRoomShopCosts(currentRoom);
    shopOffers = currentRoom?.shopOffers || shopOffers;
    ui.shopCoins.textContent = String(player.coins);
    const noItemsChallenge = isChallengeActive('no_items');
    ui.shopTabs.forEach(tab => {
      const isActive = tab.dataset.tab === activeShopTab;
      tab.classList.toggle('active', isActive);
    });
    ui.shopItems.classList.toggle('hidden', activeShopTab !== 'items');
    ui.shopWeapons?.classList.toggle('hidden', activeShopTab !== 'weapons');
    ui.shopMoves.classList.toggle('hidden', activeShopTab !== 'moves');
    ui.shopHeals.classList.toggle('hidden', activeShopTab !== 'heals');

    const itemCards = shopOffers
      .filter(offer => !offer.bought && offer.type === 'item')
      .map((offer, index) => {
        const item = itemRegistry.get(offer.key);
        const canAfford = player.coins >= offer.cost;
        const blocked = noItemsChallenge || !canAfford;
        return `<div class="shop-card${blocked ? ' shop-card--unaffordable' : ''}">
          <span class="shop-card__eyebrow">Relic</span>
          <div class="shop-card__title-row">
            <canvas class="shop-card__icon" data-item-icon="${offer.key}" width="30" height="30"></canvas>
            <h4 style="color:${getRarityNameColor(item?.rarity || item?.category)}">${item?.name || 'Item'}</h4>
            <span class="shop-card__price">${offer.cost}</span>
          </div>
          <div class="shop-card__copy">
            <p>${noItemsChallenge ? 'No Items challenge is active. Relic buys are disabled for this run.' : item?.description || 'No details available.'}</p>
          </div>
          <div class="shop-card__footer">
            <button class="shop-buy${!canAfford ? ' shop-buy--unaffordable' : ''}" data-kind="item" data-index="${index}" ${blocked ? 'disabled' : ''}>${noItemsChallenge ? 'Relics Locked' : !canAfford ? 'Too Expensive' : 'Buy Relic'}</button>
          </div>
        </div>`;
      })
      .join('');
    ui.shopItems.innerHTML = itemCards || '<div class="shop-card shop-empty"><p>Every relic here is already yours. Clear the floor or check the move shelf.</p></div>';
    ui.shopItems.querySelectorAll('[data-item-icon]').forEach(canvas => {
      drawItemToastIcon(canvas, itemRegistry.get(canvas.dataset.itemIcon) || ITEM_DEFS[canvas.dataset.itemIcon]);
    });

    const weaponOffers = getShopWeaponOffers();
    const weaponCards = weaponOffers
      .map((offer, index) => {
        const weapon = WEAPON_DEFS[offer.key];
        const owned = !!player.ownedWeapons?.[offer.key];
        const canAfford = player.coins >= offer.cost;
        const disabled = offer.bought || owned || !canAfford;
        return `<div class="shop-card${!canAfford && !owned && !offer.bought ? ' shop-card--unaffordable' : ''}">
          <span class="shop-card__eyebrow">${weapon?.rarity || 'weapon'}</span>
          <div class="shop-card__title-row">
            <canvas class="shop-card__icon" data-weapon-icon="${offer.key}" width="30" height="30"></canvas>
            <h4 style="color:${getRarityNameColor(weapon?.rarity)}">${weapon?.name || offer.key}</h4>
            <span class="shop-card__price">${offer.cost}</span>
          </div>
          <div class="shop-card__copy">
            <p>${weapon?.description || 'No weapon description available.'}</p>
          </div>
          <div class="shop-card__footer">
            <button class="shop-buy${!canAfford && !owned && !offer.bought ? ' shop-buy--unaffordable' : ''}" data-kind="weapon" data-index="${index}" ${disabled ? 'disabled' : ''}>${offer.bought || owned ? 'Owned' : !canAfford ? 'Too Expensive' : 'Buy Weapon'}</button>
          </div>
        </div>`;
      })
      .join('');
    if (ui.shopWeapons) {
      ui.shopWeapons.innerHTML = weaponCards || '<div class="shop-card shop-empty"><p>No weapons in stock right now.</p></div>';
      ui.shopWeapons.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
        drawWeaponToastIcon(canvas, WEAPON_DEFS[canvas.dataset.weaponIcon]);
      });
    }

    const moveOffers = getShopMoveOffers();
    const moveCards = moveOffers
      .map((offer, index) => {
        const def = MOVE_DEFS[offer.key];
        const owned = !!player.ownedMoves?.[offer.key];
        const canAfford = player.coins >= offer.cost;
        const disabled = offer.bought || owned || !canAfford;
        const slotLabel = SLOT_LABELS[def?.slot] || def?.slot || 'move';
        const currentMoveKey = player.equippedMoves?.[def?.slot];
        const currentMoveName = currentMoveKey ? (MOVE_DEFS[currentMoveKey]?.name || currentMoveKey) : null;
        const replacesLine = currentMoveName
          ? `<p class="shop-card__replaces">Replaces: <b>${currentMoveName}</b></p>`
          : `<p class="shop-card__replaces">Goes into: <b>${slotLabel} slot</b> (nothing equipped)</p>`;
        return `<div class="shop-card${!canAfford && !owned && !offer.bought ? ' shop-card--unaffordable' : ''}">
          <span class="shop-card__eyebrow">${slotLabel}</span>
          <div class="shop-card__title-row">
            <canvas class="shop-card__icon" data-move-icon="${offer.key}" width="30" height="30"></canvas>
            <h4>${def?.name || offer.key}</h4>
            <span class="shop-card__price">${offer.cost}</span>
          </div>
          <div class="shop-card__copy">
            <p>${def?.desc || 'No move description available.'}</p>
          </div>
          ${replacesLine}
          <div class="shop-card__footer">
            <button class="shop-buy${!canAfford && !owned && !offer.bought ? ' shop-buy--unaffordable' : ''}" data-kind="move" data-index="${index}" ${disabled ? 'disabled' : ''}>${offer.bought || owned ? 'Owned' : !canAfford ? 'Too Expensive' : 'Buy Move'}</button>
          </div>
        </div>`;
      })
      .join('');
    ui.shopMoves.innerHTML = moveCards || '<div class="shop-card shop-empty"><p>No new techniques are on the rack right now.</p></div>';
    ui.shopMoves.querySelectorAll('[data-move-icon]').forEach(canvas => {
      drawMoveToastIcon(canvas, MOVE_DEFS[canvas.dataset.moveIcon]);
    });

    const heals = [
      { id: 'small', name: 'Minor Heal', heal: scalePotionHealing(45, 24), cost: getShopHealCost('small') },
      { id: 'major', name: 'Major Heal', heal: scalePotionHealing(100, 52), cost: getShopHealCost('major') },
    ];
    const healCards = heals
      .map(heal => {
        const canAfford = player.coins >= heal.cost;
        return `<div class="shop-card${!canAfford ? ' shop-card--unaffordable' : ''}">
        <span class="shop-card__eyebrow">Recovery</span>
        <div class="shop-card__title-row">
          <canvas class="shop-card__icon" data-heal-icon="${heal.id}" width="30" height="30"></canvas>
          <h4>${heal.name}</h4>
          <span class="shop-card__price">${heal.cost}</span>
        </div>
        <div class="shop-card__copy">
          <p>Restore ${heal.heal} HP and stabilize before the next encounter.</p>
        </div>
        <div class="shop-card__footer">
          <button class="shop-buy${!canAfford ? ' shop-buy--unaffordable' : ''}" data-kind="heal" data-heal="${heal.heal}" data-cost="${heal.cost}" ${!canAfford ? 'disabled' : ''}>${!canAfford ? 'Too Expensive' : 'Buy Heal'}</button>
        </div>
      </div>`;
      })
      .join('');
    ui.shopHeals.innerHTML = healCards;
    ui.shopHeals.querySelectorAll('[data-heal-icon]').forEach(canvas => {
      drawHealToastIcon(canvas, canvas.dataset.healIcon);
    });
    shopPanelDirty = false;
  }

  function renderInventoryPanel() {
    if (!ui.invPanel || !player) return;

    // Resolve which player to display
    const _invPlayers = [player, player2, player3, player4];
    const _invP = _invPlayers[activeInvPlayer - 1] || player;

    if (gameMode === 'coop' && (player2 || player3 || player4)) updateInvPlayerTabVisibility();

    ui.invTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.invTab === activeInvTab);
    });
    const tabPanels = { stats: 'invTabStats', items: 'invTabItems', weapons: 'invTabWeapons', equipped: 'invTabEquipped' };
    Object.entries(tabPanels).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', key !== activeInvTab);
    });

    const stats = getItemStats();
    const hpPct = Math.round(_invP.hp) / Math.round(_invP.maxHp);
    const hpColor = hpPct > 0.6 ? '#6dde88' : hpPct > 0.3 ? '#f5c842' : '#ff6b6b';
    const critPct = Math.round(stats.critChance * 100);
    const critColor = critPct >= 30 ? '#f5a623' : critPct >= 10 ? '#e8f4ff' : '#8ca8c0';
    const atkSpeed = getAttackSpeedValue();
    const atkSpeedColor = atkSpeed >= 2 ? '#6dde88' : atkSpeed >= 1.2 ? '#e8f4ff' : '#8ca8c0';
    const dmgReduction = Math.round(stats.damageReduction * 100);
    ui.invStats.innerHTML = [
      `<div class="inv-stat-row inv-stat-row--bar"><div class="inv-stat-row__icon inv-stat-row__icon--hp">♥</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">HP</span><span class="inv-stat-row__value" style="color:${hpColor}">${Math.round(_invP.hp)} <span class="inv-stat-row__sub">/ ${Math.round(_invP.maxHp)}</span></span></div><div class="inv-stat-row__bar"><div class="inv-stat-row__bar-fill" style="width:${Math.round(hpPct*100)}%;background:${hpColor}"></div></div></div>`,
      `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--atk">⚔</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Attack Power</span><span class="inv-stat-row__value">${_invP.attackPower}</span></div></div>`,
      `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--spd">⚡</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Attack Speed</span><span class="inv-stat-row__value" style="color:${atkSpeedColor}">${atkSpeed.toFixed(2)}x</span></div></div>`,
      `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--crit">◎</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Crit Chance</span><span class="inv-stat-row__value" style="color:${critColor}">${critPct}%</span></div></div>`,
      dmgReduction > 0 ? `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--def">⛨</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Damage Reduction</span><span class="inv-stat-row__value" style="color:#6dde88">${dmgReduction}%</span></div></div>` : '',
      stats.bleedChance > 0 ? `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--bleed">✦</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Bleed Chance</span><span class="inv-stat-row__value" style="color:#e05c5c">${Math.round(stats.bleedChance * 100)}%</span></div></div>` : '',
    ].join('');

    ui.invItemsList.innerHTML = ITEM_KEYS
      .filter(key => Number(_invP.items?.[key] || 0) > 0)
      .map(key => {
        const item = itemRegistry.get(key);
        return `<div class="inv-card">
          <span class="inv-card__eyebrow">Relic</span>
          <div class="inv-card__title-row">
            <canvas class="inv-card__icon" data-item-icon="${key}" width="30" height="30"></canvas>
            <h4 style="color:${getRarityNameColor(item?.rarity || item?.category)}">${item?.name || key}</h4>
            <span class="inv-card__count">x${_invP.items[key]}</span>
          </div>
          <p>${item?.description || 'No item description available.'}</p>
        </div>`;
      })
      .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No relics yet</h4><p>Your pockets are clear. Loot rooms or buy from the shop to start a build.</p></div>';

    ui.invItemsList.querySelectorAll('[data-item-icon]').forEach(canvas => {
      drawItemToastIcon(canvas, itemRegistry.get(canvas.dataset.itemIcon) || ITEM_DEFS[canvas.dataset.itemIcon]);
    });

    const ownedWeapons = WEAPON_KEYS
      .filter(key => _invP.ownedWeapons?.[key])
      .sort((a, b) => {
        const order = { knight: 1, white: 1, wizard: 2, purple: 2, god: 3, red: 3 };
        const rarityA = order[WEAPON_DEFS[a]?.rarity] || 99;
        const rarityB = order[WEAPON_DEFS[b]?.rarity] || 99;
        if (rarityA !== rarityB) return rarityA - rarityB;
        return (WEAPON_DEFS[a]?.name || a).localeCompare(WEAPON_DEFS[b]?.name || b);
      });
    if (ui.invWeaponsList) {
      ui.invWeaponsList.innerHTML = ownedWeapons
        .map(key => {
          const def = WEAPON_DEFS[key];
          const equipped = _invP.equippedWeapon === key;
          return `<button class="inv-move-chip${equipped ? ' is-equipped-weapon' : ''}" data-weapon="${key}" type="button" aria-pressed="${equipped ? 'true' : 'false'}">
            <canvas class="inv-chip__icon" data-weapon-icon="${key}" width="30" height="30"></canvas>
            <div class="inv-move-chip__meta">
              <b style="color:${getRarityNameColor(def?.rarity)}">${def?.name || key}</b>
              <span class="inv-move-chip__slot">${def?.rarity || 'weapon'}</span>
            </div>
            <p>${def?.description || 'No weapon description available.'}</p>
            <span class="inv-move-chip__hint">${equipped ? 'Equipped On Left Click' : 'Click To Equip On Left Click'}</span>
          </button>`;
        })
        .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No weapons owned</h4><p>Buy weapons in the shop to unlock left-click weapon loadouts.</p></div>';
      ui.invWeaponsList.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
        drawWeaponToastIcon(canvas, WEAPON_DEFS[canvas.dataset.weaponIcon]);
      });
    }

    const equippedMoveKeys = new Set(Object.values(_invP.equippedMoves || {}).filter(Boolean));
    const allOwnedMoves = Object.keys(_invP.ownedMoves || {})
      .filter(key => _invP.ownedMoves[key] && MOVE_DEFS[key] && isMoveAllowedForCharacter(key, _invP.character))
      .sort((a, b) => MOVE_DEFS[a].slot.localeCompare(MOVE_DEFS[b].slot));
    ui.invMovesList.innerHTML = allOwnedMoves
      .map(key => {
        const def = MOVE_DEFS[key];
        const isEquipped = equippedMoveKeys.has(key);
        const isMatch = !isEquipped && activeInventorySlot && activeInventorySlot === def.slot;
        const slotLabel = SLOT_LABELS[def.slot] || def.slot;
        const hintText = isEquipped ? 'Equipped' : (isMatch ? 'Click or drag to equip' : `Drag to ${slotLabel} slot`);
        return `<div class="inv-move-chip${isEquipped ? ' is-equipped-move' : ''}${isMatch ? ' is-match' : ''}" ${isEquipped ? '' : `draggable="true"`} data-move="${key}" data-slot-type="${def.slot}">
          <canvas class="inv-chip__icon" data-move-icon="${key}" width="30" height="30"></canvas>
          <div class="inv-move-chip__meta">
            <b>${def.name}</b>
            <span class="inv-move-chip__slot">${slotLabel}</span>
          </div>
          <p>${def.desc}</p>
          <span class="inv-move-chip__hint">${hintText}</span>
        </div>`;
      })
      .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No moves owned</h4><p>Buy moves from the shop to build your kit.</p></div>';
    ui.invMovesList.querySelectorAll('[data-move-icon]').forEach(canvas => {
      drawMoveToastIcon(canvas, MOVE_DEFS[canvas.dataset.moveIcon]);
    });

    MOVE_SLOTS.forEach(slot => {
      const node = ui.invSlots[slot];
      if (!node) return;
      const moveKey = _invP.equippedMoves?.[slot];
      const def = MOVE_DEFS[moveKey];
      const isSelected = activeInventorySlot === slot;
      node.dataset.move = moveKey || '';
      node.dataset.slotType = slot;
      node.draggable = !!moveKey;
      node.classList.toggle('is-equipped', !!moveKey);
      node.classList.toggle('is-selected', isSelected);
      const slotLabel = SLOT_LABELS[slot] || slot;
      const slotKey = getSlotKeyLabel(slot);
      const iconHtml = moveKey ? `<canvas class="inv-slot__icon" data-move-icon="${moveKey}" width="36" height="36"></canvas>` : `<div class="inv-slot__icon inv-slot__icon--empty"></div>`;
      node.innerHTML = `<div class="inv-slot__top"><span class="inv-slot__kicker">${slotLabel}</span><div class="inv-slot__top-right">${slotKey ? `<span class="inv-slot__key">${slotKey}</span>` : ''}<span class="inv-slot__status">${isSelected ? 'Selected' : (def ? 'Equipped' : 'Empty')}</span></div></div><div class="inv-slot__main">${iconHtml}<div class="inv-slot__move-wrap"><div class="inv-slot__move">${def?.name || 'No move equipped'}</div><p class="inv-slot__hint">${isSelected ? 'Matching spare moves highlighted below. Click or drag to swap.' : def?.desc || 'Click to see moves that can go here.'}</p></div></div>`;
    });
    ui.invSlots && Object.values(ui.invSlots).forEach(node => {
      node.querySelectorAll('[data-move-icon]').forEach(canvas => {
        drawMoveToastIcon(canvas, MOVE_DEFS[canvas.dataset.moveIcon]);
      });
    });
    if (ui.invWeaponSlot) {
      const weapon = WEAPON_DEFS[_invP.equippedWeapon];
      ui.invWeaponSlot.dataset.rarity = weapon?.rarity || '';
      const wIconHtml = weapon ? `<canvas class="inv-slot__icon" data-weapon-icon="${_invP.equippedWeapon}" width="36" height="36"></canvas>` : `<div class="inv-slot__icon inv-slot__icon--empty">⚔️</div>`;
      ui.invWeaponSlot.innerHTML = `<div class="inv-slot__top"><span class="inv-slot__kicker">weapon</span><span class="inv-slot__status">${weapon ? 'Equipped Now' : 'No Weapon'}</span></div><div class="inv-slot__main">${wIconHtml}<div class="inv-slot__move-wrap"><div class="inv-slot__move" style="color:${getRarityNameColor(weapon?.rarity)}">${weapon?.name || 'Default Melee Active'}</div><p class="inv-slot__hint">${weapon ? `${weapon.description} Click to unequip.` : 'Open Weapons tab and click a weapon to equip it.'}</p></div></div>`;
      ui.invWeaponSlot.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
        drawWeaponToastIcon(canvas, WEAPON_DEFS[canvas.dataset.weaponIcon]);
      });
    }
    inventoryPanelDirty = false;
  }

  function equipMove(slot, moveKey) {
    if (!player || !MOVE_DEFS[moveKey]) return;
    if (MOVE_DEFS[moveKey].slot !== slot) return;
    if (!isMoveAllowedForCharacter(moveKey, player.character)) return;
    if (!player.ownedMoves?.[moveKey]) return;
    player.equippedMoves[slot] = moveKey;
    cooldowns[slot] = createCooldownEntry(slot, player, cooldowns[slot]);
    markInventoryPanelDirty();
    renderInventoryPanel();
    updateHud();
    scheduleRunSave();
  }

  function equipWeapon(weaponKey) {
    if (!player) return;
    if (!weaponKey) {
      player.equippedWeapon = '';
      player.weaponCooldown = 0;
      player.weaponBeamTime = 0;
      player.weaponBeamTick = 0;
    } else {
      if (!WEAPON_DEFS[weaponKey]) return;
      if (!player.ownedWeapons?.[weaponKey]) return;
      player.equippedWeapon = weaponKey;
      player.weaponCooldown = 0;
      player.weaponBeamTime = 0;
      player.weaponBeamTick = 0;
    }
    markInventoryPanelDirty();
    renderInventoryPanel();
    updateHud();
    scheduleRunSave();
  }

  function handleInventoryWeaponSelect(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-weapon]') : null;
    const weaponKey = target?.dataset?.weapon || '';
    if (!weaponKey || !WEAPON_DEFS[weaponKey]) return;
    equipWeapon(weaponKey);
  }

  function spendCoins(cost) {
    if (player.coins < cost) {
      particles.push({ x: player.x, y: player.y - 24, life: 0.7, text: 'Not enough coins!', c: '#ff4455' });
      return false;
    }
    player.coins -= cost;
    metaProgress.coins = Math.max(0, metaProgress.coins - cost);
    persistMetaSoon();
    return true;
  }

  function handleShopBuyClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('.shop-buy');
    if (!button || !player) return;
    const kind = button.dataset.kind;
    if (kind === 'item') {
      if (isChallengeActive('no_items')) {
        particles.push({ x: player.x, y: player.y - 24, life: 0.8, text: 'No Items challenge', c: '#ff8894' });
        return;
      }
      const offerIndex = Number(button.dataset.index || -1);
      const itemOffers = shopOffers.filter(offer => !offer.bought && offer.type === 'item');
      const offer = itemOffers[offerIndex];
      if (!offer || offer.bought) return;
      if (!spendCoins(offer.cost)) return;
      offer.bought = true;
      collectItem(offer.key);
      achievementEvents.emit('shop:bought');
    } else if (kind === 'move') {
      const offerIndex = Number(button.dataset.index || -1);
      const moveOffers = getShopMoveOffers();
      const offer = moveOffers[offerIndex];
      if (!offer || offer.bought || player.ownedMoves?.[offer.key] || !isMoveAllowedForCharacter(offer.key, player.character)) return;
      if (!spendCoins(offer.cost)) return;
      offer.bought = true;
      player.ownedMoves[offer.key] = true;
      markInventoryPanelDirty();
      pushMoveNotification(offer.key, 1);
      achievementEvents.emit('shop:bought');
    } else if (kind === 'weapon') {
      const offerIndex = Number(button.dataset.index || -1);
      const weaponOffers = getShopWeaponOffers();
      const offer = weaponOffers[offerIndex];
      if (!offer || offer.bought || player.ownedWeapons?.[offer.key]) return;
      if (!spendCoins(offer.cost)) return;
      offer.bought = true;
      player.ownedWeapons[offer.key] = true;
      if (!player.equippedWeapon) equipWeapon(offer.key);
      particles.push({ x: player.x, y: player.y - 24, life: 0.8, text: `${WEAPON_DEFS[offer.key]?.name || 'Weapon'} acquired`, c: WEAPON_DEFS[offer.key]?.color || '#d9e8ff' });
      pushWeaponNotification(offer.key);
      markInventoryPanelDirty();
      achievementEvents.emit('shop:bought');
    } else if (kind === 'heal') {
      const heal = Number(button.dataset.heal || 0);
      const cost = Number(button.dataset.cost || 0);
      if (!heal || !cost) return;
      if (!spendCoins(cost)) return;
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      const gained = player.hp - before;
      if (gained > 0) spawnHealPopup(player.x + rand(-10, 10), player.y - 20, gained);
      if (gained > 0) achievementEvents.emit('heal:applied', { amount: gained });
      achievementEvents.emit('shop:bought');
    }
    markShopPanelDirty();
    markInventoryPanelDirty();
    renderShopPanel();
    renderInventoryPanel();
    scheduleRunSave();
    syncCurrentRoomState();
    updateHud();
  }
