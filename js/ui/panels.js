// panels.js — Input binding and UI panel rendering.
export function bindInput() {
    Neo.canvas.addEventListener('contextmenu', event => event.preventDefault());
    Neo.canvas.addEventListener('mousemove', event => {
      const rect = Neo.canvas.getBoundingClientRect();
      Neo.mouse.x = (event.clientX - rect.left) * (Neo.canvas.width / rect.width);
      Neo.mouse.y = (event.clientY - rect.top) * (Neo.canvas.height / rect.height);
      // Raw page coords, kept for DOM overlays (e.g. reward-choice hover tooltip)
      // that must be positioned in CSS pixels rather than canvas space.
      Neo.mouse.clientX = event.clientX;
      Neo.mouse.clientY = event.clientY;
    });
    Neo.canvas.addEventListener('mousedown', event => {
      if (event.button === 0) { Neo.mouse.down = true; Neo.mouse.downQueued = true; }
      if (event.button === 2) { Neo.mouse.right = true; Neo.mouse.rightQueued = true; }
    });
    window.addEventListener('mouseup', event => {
      if (event.button === 0) Neo.mouse.down = false;
      if (event.button === 2) Neo.mouse.right = false;
    });
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (event.key === 'F3' || (event.ctrlKey && event.shiftKey && key === 'p')) {
        event.preventDefault();
        Neo.setPerfEnabled(!Neo.perfState.enabled);
        return;
      }
      if (Neo.uiController?.isDialogueOpen?.()) {
        Neo.keys[key] = false;
        if (key === 'enter' || key === ' ' || key === 'escape') {
          event.preventDefault();
          Neo.uiController.advanceDialogue();
        }
        return;
      }
      Neo.keys[key] = true;
      const b = window.NeoSettings?.getBindings();
      const inventoryKey = b ? b.inventory : 'i';
      const interactKey = b ? b.interact : 'e';
      if (isWizardPawOpen()) {
        if (event.key === 'Escape') event.preventDefault();
        return;
      }
      if (isExtraBatteryOpen()) {
        if (event.key === 'Escape') { event.preventDefault(); Neo.dismissExtraBatteryModal?.(); }
        return;
      }
      if (isVoucherModalOpen()) {
        if (event.key === 'Escape') { event.preventDefault(); Neo.cancelVoucherRedeem?.(); }
        return;
      }
      if (event.key === 'Escape' && isPanelOpen(Neo.ui.invPanel)) {
        event.preventDefault();
        setInventoryPanelOpen(false);
        return;
      }
      if (event.key === 'Escape') {
        if (Neo.gameState === 'play') { Neo.pauseGame(); return; }
        if (Neo.gameState === 'pause') { Neo.resumeGame(); return; }
      }
      if (Neo.gameState === 'play' && key === 'k' && Neo.isFirstRunTutorialActive()) {
        event.preventDefault();
        Neo.skipFirstRunTutorial();
        return;
      }
      if (key === interactKey && Neo.gameState === 'play') {
        const inShopRoom = Neo.currentRoom?.type === 'shop';
        if (inShopRoom && !Neo.shopKeyLatch) {
          toggleShopPanel();
          Neo.shopKeyLatch = true;
        }
        const inAnvilRoom = Neo.currentRoom?.type === 'anvil';
        if (inAnvilRoom && !Neo.anvilKeyLatch) {
          toggleAnvilPanel();
          Neo.anvilKeyLatch = true;
        }
        if (Neo.isAtLadder?.() && !Neo.ladderUseKeyLatch) {
          Neo.ladderUseKeyLatch = true;
          Neo.useLadder?.();
        }
      }
      if (key === inventoryKey && (Neo.gameState === 'play' || isPanelOpen(Neo.ui.invPanel)) && !Neo.invKeyLatch) {
        toggleInventoryPanel();
        Neo.invKeyLatch = true;
      }
      if (b && key === b.smash && Neo.gameState === 'play') { Neo.smashHeld = true; Neo.trySmash(); }
      else if (!b && key === 'r' && Neo.gameState === 'play') { Neo.smashHeld = true; Neo.trySmash(); }
      if (Neo.gameState === 'play' && Neo.EQUIPMENT_SLOT_KEYS?.includes(key.toUpperCase())) {
        if (!Neo.equipKeyLatch) Neo.equipKeyLatch = {};
        const letter = key.toUpperCase();
        if (!Neo.equipKeyLatch[letter]) {
          Neo.equipKeyLatch[letter] = true;
          if (Neo.activateEquipmentSlotKey?.(letter)) event.preventDefault();
        }
      }
      const activateAllKey = String(b?.activateAll ?? ' ').toLowerCase();
      if (key === activateAllKey && Neo.gameState === 'play' && !Neo.activateAllKeyLatch) {
        Neo.activateAllKeyLatch = true;
        Neo.activateAllEquipmentSlots?.();
      }
    });
    window.addEventListener('keyup', event => {
      const key = event.key.toLowerCase();
      if (Neo.uiController?.isDialogueOpen?.()) {
        Neo.keys[key] = false;
        return;
      }
      Neo.keys[key] = false;
      const b = window.NeoSettings?.getBindings();
      const inventoryKey = b ? b.inventory : 'i';
      if ((b && key === b.smash) || (!b && key === 'r')) Neo.smashHeld = false;
      if (key === String(b?.interact || 'e').toLowerCase()) { Neo.shopKeyLatch = false; Neo.anvilKeyLatch = false; Neo.ladderUseKeyLatch = false; }
      if (key === String(b?.activateAll ?? ' ').toLowerCase()) Neo.activateAllKeyLatch = false;
      if (key === inventoryKey) Neo.invKeyLatch = false;
      const upper = key.toUpperCase();
      if (Neo.equipKeyLatch && Neo.EQUIPMENT_SLOT_KEYS?.includes(upper)) {
        Neo.equipKeyLatch[upper] = false;
      }
    });
    Neo.uiController.bindMenuActions({
      _getChosenCharacter() {
        if (Neo.charSelectPhase === 'p2') return Neo.chosenCharacter2;
        if (Neo.charSelectPhase === 'p3') return Neo.chosenCharacter3;
        if (Neo.charSelectPhase === 'p4') return Neo.chosenCharacter4;
        return Neo.chosenCharacter;
      },
      onCharacterSelect(characterKey, button, options = {}) {
        if (Neo.charSelectPhase === 'p2') { Neo.chosenCharacter2 = characterKey; }
        else if (Neo.charSelectPhase === 'p3') { Neo.chosenCharacter3 = characterKey; }
        else if (Neo.charSelectPhase === 'p4') { Neo.chosenCharacter4 = characterKey; }
        else { Neo.chosenCharacter = characterKey; Neo.metaProgress.selectedCharacter = Neo.chosenCharacter; Neo.persistMetaSoon(); }
        if (Neo.isCustomCharacterKey?.(characterKey) && !Neo.charSelectPhase && options.openCustomBuilder !== false) {
          Neo.editingCustomCharacterKey = characterKey;
          Neo.uiController.setCustomCharacterPanelOpen?.(true);
        }
        Neo.updateCharacterSelectionUI();
      },
      onDifficultySelect(difficultyKey, button) {
        if (button.classList.contains('locked')) return;
        Neo.selectedDifficulty = Neo.normalizeDifficulty(difficultyKey);
        Neo.metaProgress.selectedDifficulty = Neo.selectedDifficulty;
        Neo.persistMetaSoon();
        Neo.updateCharacterSelectionUI();
        Neo.drawDifficultyIcons?.();
      },
      onChallengeSelect(challengeKey, button) {
        const def = Neo.CHALLENGE_DEFS[challengeKey];
        if (!def || button.classList.contains('locked')) return;
        const owned = Neo.getOwnedChallengeSet();
        if (!owned.has(challengeKey)) {
          if ((Neo.metaProgress.loopCrystals || 0) < def.cost) {
            Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 30, life: 0.9, text: 'Not enough Loop Crystals', c: '#ff6f7f' });
            return;
          }
          Neo.metaProgress.loopCrystals = Number(Neo.metaProgress.loopCrystals || 0) - def.cost;
          Neo.metaProgress.unlockedChallenges = Neo.normalizeChallengeSelection([...(Neo.metaProgress.unlockedChallenges || []), challengeKey]);
          Neo.selectedChallenges = Neo.normalizeChallengeSelection([...Neo.selectedChallenges, challengeKey]);
          Neo.persistMetaSoon();
        } else if (Neo.selectedChallenges.includes(challengeKey)) {
          Neo.selectedChallenges = Neo.selectedChallenges.filter(key => key !== challengeKey);
        } else {
          Neo.selectedChallenges = Neo.normalizeChallengeSelection([...Neo.selectedChallenges, challengeKey]);
        }
        Neo.metaProgress.selectedChallenges = Neo.normalizeChallengeSelection(Neo.selectedChallenges);
        Neo.persistMetaSoon();
        Neo.updateCharacterSelectionUI();
      },
      onAdvanceDialogue() {
        Neo.uiController.advanceDialogue();
      },
      onToggleChallenges() {
        const opening = Neo.ui.challengePanel?.classList.contains('hidden');
        if (opening) Neo.uiController.setLegacyPanelOpen(false);
        Neo.uiController.setChallengePanelOpen(opening);
      },
      onToggleLegacy() {
        const opening = Neo.ui.legacyPanel?.classList.contains('hidden');
        if (opening) Neo.uiController.setChallengePanelOpen(false);
        Neo.uiController.setLegacyPanelOpen(opening);
      },
      onLegacySelect(legacyKey) {
        const def = Neo.LEGACY_UPGRADES[legacyKey];
        if (!def) return;
        if (Neo.hasLegacy(legacyKey)) return;
        if ((Neo.metaProgress.loopCrystals || 0) < def.cost) {
          return;
        }
        Neo.metaProgress.loopCrystals = Number(Neo.metaProgress.loopCrystals || 0) - def.cost;
        Neo.metaProgress.unlockedLegacy = Neo.normalizeLegacySelection([...(Neo.metaProgress.unlockedLegacy || []), legacyKey]);
        Neo.persistMetaSoon();
        Neo.updateCharacterSelectionUI();
      },
      onToggleRunHistory() {
        Neo.uiController.setRunHistoryOpen(Neo.ui.runHistoryPanel?.classList.contains('hidden'));
      },
      onOpenSandboxConfig() {
        Neo.uiController.setSandboxPanelOpen(true);
      },
      onCloseSandboxConfig() {
        Neo.uiController.setSandboxPanelOpen(false);
      },
      onCloseCustomCharacterBuilder() {
        Neo.uiController.setCustomCharacterPanelOpen?.(false);
      },
      onSkipTutorial() {
        Neo.skipFirstRunTutorial();
      },
      onPlayTutorial() {
        try {
          localStorage.setItem(Neo.REPLAY_TUTORIAL_KEY, '1');
        } catch {}
        Neo.gameMode = 'normal';
        Neo.practiceVariant = 'standard';
        Neo.charSelectPhase = null;
        Neo.setGameState('charselect');
        Neo.updateCharacterSelectionUI();
      },
      onDismissFirstTip() {
        Neo.uiController?.hideFirstTip?.();
      },
      onTutorialPrev() {
        Neo.navigateTutorialStep(-1);
      },
      onTutorialNext() {
        Neo.navigateTutorialStep(1);
      },
      onOpenCharacterSelect() {
        Neo.gameMode = 'normal';
        Neo.practiceVariant = 'standard';
        Neo.charSelectPhase = null;
        Neo.setGameState('charselect');
        Neo.updateCharacterSelectionUI();
      },
      onCloseCharacterSelect() {
        const phases = ['p1','p2','p3','p4'].slice(0, Neo.mpPlayerCount);
        const cur = phases.indexOf(Neo.charSelectPhase);
        if (cur > 0) {
          Neo.charSelectPhase = phases[cur - 1];
          Neo.updateCharacterSelectionUI();
          return;
        }
        Neo.charSelectPhase = null;
        Neo.setGameState('menu');
      },
      onOpenAltModeCharSelect(mode) {
        const challengePractice = mode === 'challenge_practice';
        Neo.gameMode = challengePractice ? 'practice' : mode;
        Neo.practiceVariant = challengePractice ? 'challenges' : 'standard';
        if (Neo.gameMode === 'coop' || Neo.gameMode === 'pvp') {
          Neo.openMpLobby(Neo.gameMode);
        } else {
          Neo.charSelectPhase = null;
          Neo.setGameState('charselect');
          Neo.updateCharacterSelectionUI();
        }
      },
      onStartSandbox() {
        Neo.gameMode = 'sandbox';
        Neo.selectedDifficulty = 'easy';
        Neo.metaProgress.selectedDifficulty = Neo.selectedDifficulty;
        Neo.persistMetaSoon();
        Neo.charSelectPhase = null;
        Neo.setGameState('charselect');
        Neo.updateCharacterSelectionUI();
      },
      onStartNew() {
        if (!Neo.charSelectPhase && Neo.isCustomCharacterKey?.(Neo.chosenCharacter) && !Neo.getCustomCharacterSettings?.(Neo.chosenCharacter).active) {
          Neo.editingCustomCharacterKey = Neo.chosenCharacter;
          Neo.uiController.setCustomCharacterPanelOpen?.(true);
          Neo.updateCharacterSelectionUI();
          return;
        }
        const phases = ['p1','p2','p3','p4'].slice(0, Neo.mpPlayerCount);
        const cur = phases.indexOf(Neo.charSelectPhase);
        if (cur >= 0 && cur < phases.length - 1) {
          Neo.charSelectPhase = phases[cur + 1];
          Neo.updateCharacterSelectionUI();
          return;
        }
        Neo.charSelectPhase = null;
        void Neo.startGame(false);
      },
      onContinue() { void Neo.startGame(true); },
      onDeleteRun() { void Neo.deleteSavedRun(); },
      onRerunFromHistory(entryId) {
        const entry = Neo.runHistory.find(e => e.id === entryId);
        if (!entry) return;
        Neo.gameMode = Neo.normalizeGameMode(entry.mode);
        Neo.chosenCharacter = entry.character || Neo.chosenCharacter;
        Neo.metaProgress.selectedCharacter = Neo.chosenCharacter;
        Neo.selectedDifficulty = Neo.normalizeDifficulty(entry.difficulty);
        Neo.metaProgress.selectedDifficulty = Neo.selectedDifficulty;
        Neo.selectedChallenges = Neo.normalizeRunHistoryChallengeKeys(entry);
        Neo.metaProgress.selectedChallenges = Neo.normalizeChallengeSelection(Neo.selectedChallenges);
        Neo.persistMetaSoon();
        if (Neo.ui.seed) Neo.ui.seed.value = entry.seed || '';
        Neo.uiController.setRunHistoryOpen(false);
        void Neo.startGame(false);
      },
    });
    Neo.uiController.bindRestartActions({
      onWinRestart() {
        if (Neo.ui.seed) Neo.ui.seed.value = Neo.baseSeedStr;
        void Neo.startGame(false);
      },
      onWinAction(action) {
        if (action === 'loop') {
          Neo.setGameState('play');
          Neo.returnToFloorOne();
          return;
        }
        if (action === 'menu') {
          void Neo.clearRunSave?.();
          Neo.gameMode = 'normal';
          Neo.resetMultiplayerState();
          Neo.setGameState('menu');
          Neo.refreshMenuState();
          return;
        }
        void Neo.clearRunSave?.();
        if (Neo.ui.seed) Neo.ui.seed.value = '';
        Neo.baseSeedStr = Neo.createRandomSeed();
        void Neo.startGame(false);
      },
      onDeadAction(action) {
        if (action === 'menu') {
          Neo.gameMode = 'normal';
          Neo.resetMultiplayerState();
          Neo.setGameState('menu');
          Neo.refreshMenuState();
          return;
        }
        if (action === 'revive') {
          Neo.reviveFromDeath();
          return;
        }
        if (action === 'retry-new') {
          if (Neo.ui.seed) Neo.ui.seed.value = '';
          Neo.baseSeedStr = Neo.createRandomSeed();
          void Neo.startGame(false);
          return;
        }
        if (Neo.ui.seed) Neo.ui.seed.value = Neo.baseSeedStr;
        void Neo.startGame(false);
      },
    });

    Neo.ui.pauseResume.addEventListener('click', Neo.resumeGame);
    Neo.ui.pauseInfo?.addEventListener('click', () => {
      Neo.uiController.setRunHistoryOpen(true);
    });
    Neo.ui.pauseSettings.addEventListener('click', () => {
      document.getElementById('settingsBtn').click();
    });
    Neo.ui.pauseMain.addEventListener('click', () => {
      clearTimeout(Neo.savePendingTimer);
      Neo.gameMode = 'normal';
      void Neo.saveRunNow().then(() => { Neo.setGameState('menu'); });
    });
    Neo.ui.wizardPawChoices?.addEventListener('click', Neo.handleWizardPawChoiceClick);
    Neo.ui.wizardPawConfirm?.addEventListener('click', Neo.confirmWizardPawSelection);
    Neo.ui.extraBatteryChoices?.addEventListener('click', event => Neo.handleExtraBatteryChoiceClick?.(event));
    Neo.ui.extraBatteryLater?.addEventListener('click', () => Neo.dismissExtraBatteryModal?.());
    Neo.ui.scrollControlChoices?.addEventListener('click', event => Neo.handleScrollControlChoiceClick?.(event));
    Neo.ui.scrollControlConfirm?.addEventListener('click', () => Neo.confirmScrollControlSelection?.());
    Neo.ui.scrollControlCancel?.addEventListener('click', () => Neo.cancelScrollControlSelection?.());
    Neo.ui.scrollControlSearch?.addEventListener('input', event => Neo.updateScrollControlSearch?.(event.target?.value || ''));
    Neo.ui.shopVoucherRedeem?.addEventListener('click', () => Neo.openVoucherRedeem?.());
    Neo.ui.voucherTypes?.addEventListener('click', event => Neo.handleVoucherChoiceClick?.(event));
    Neo.ui.voucherChoices?.addEventListener('click', event => Neo.handleVoucherChoiceClick?.(event));
    Neo.ui.voucherSearch?.addEventListener('input', event => Neo.updateVoucherSearch?.(event.target?.value || ''));
    Neo.ui.voucherConfirm?.addEventListener('click', () => Neo.confirmVoucherRedeem?.());
    Neo.ui.voucherCancel?.addEventListener('click', () => Neo.cancelVoucherRedeem?.());

    window.addEventListener('beforeunload', () => {
      if (Neo.gameState === 'play') {
        clearTimeout(Neo.savePendingTimer);
        Neo.saveRunNow();
      }
      if (Neo.metaSavePendingTimer) {
        clearTimeout(Neo.metaSavePendingTimer);
        Neo.metaSavePendingTimer = 0;
      }
      if (Neo.metaSaveDirty) {
        Neo.metaSaveDirty = false;
        Neo.saveStore.put('meta', Neo.metaProgress);
      }
    });
  }

export function clearGameplayInput() {
    Object.keys(Neo.keys).forEach(key => {
      Neo.keys[key] = false;
    });
    Neo.mouse.down = false;
    Neo.mouse.right = false;
    Neo.mouse.downQueued = false;
    Neo.mouse.rightQueued = false;
  }

export function bindPanelInput() {
    const drawInventoryTabIcons = () => {
      document.querySelectorAll('#invPanel .inv-tabs [data-inv-ui-icon]').forEach(canvas => {
        Neo.drawInventoryUiIcon?.(canvas, canvas.dataset.invUiIcon);
      });
    };

    Neo.ui.shopClose?.addEventListener('click', () => setShopPanelOpen(false));
    Neo.ui.invClose?.addEventListener('click', () => setInventoryPanelOpen(false));
    // Re-open path: click the HUD pending-action chip to resume an owed
    // Wizard's Paw / Extra Battery selection that was dismissed or deferred.
    Neo.ui.panelItemAlert?.addEventListener('click', () => Neo.requestPanelItemSelection?.());
    Neo.ui.anvilClose?.addEventListener('click', () => setAnvilPanelOpen(false));
    Neo.ui.anvilCancel?.addEventListener('click', () => { Neo.anvilStagedUpgrades = {}; setAnvilPanelOpen(false); });
    Neo.ui.anvilConfirm?.addEventListener('click', confirmAnvilUpgrades);
    const setAnvilPayCurrency = (currency) => {
      if (Neo.anvilPayCurrency === currency) return;
      Neo.anvilPayCurrency = currency;
      // Affordability differs between currencies, so drop any staged steps.
      Neo.anvilStagedUpgrades = {};
      renderAnvilPanel();
    };
    Neo.ui.anvilPayXp?.addEventListener('click', () => setAnvilPayCurrency('xp'));
    Neo.ui.anvilPayGold?.addEventListener('click', () => setAnvilPayCurrency('gold'));
    Neo.ui.anvilTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        Neo.activeAnvilTab = tab.dataset.anvilTab || 'weapons';
        Neo.anvilSelectedItem = null;
        renderAnvilPanel();
      });
    });
    Neo.ui.anvilWeaponList?.addEventListener('click', handleAnvilItemSelect);
    Neo.ui.anvilMoveList?.addEventListener('click', handleAnvilItemSelect);
    Neo.ui.anvilWeaponStats?.addEventListener('click', handleAnvilStatClick);
    Neo.ui.anvilMoveStats?.addEventListener('click', handleAnvilStatClick);
    Neo.ui.shopTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const nextTab = tab.dataset.tab || 'items';
        Neo.activeShopTab = nextTab;
        markShopPanelDirty();
        renderShopPanel();
      });
    });
    Neo.ui.invTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        Neo.activeInvTab = tab.dataset.invTab || 'stats';
        renderInventoryPanel();
        drawInventoryTabIcons();
      });
    });
    drawInventoryTabIcons();
    Neo.ui.invPlayerTabBtns.forEach(tab => {
      tab.addEventListener('click', () => {
        Neo.activeInvPlayer = Number(tab.dataset.invPlayer) || 1;
        renderInventoryPanel();
      });
    });
    Neo.ui.invBuildSummary?.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('[data-inv-tab-jump]') : null;
      if (!button) return;
      Neo.activeInvTab = button.dataset.invTabJump || 'equipped';
      Neo.activeInventorySlot = button.dataset.buildSlot || '';
      markInventoryPanelDirty();
      renderInventoryPanel();
    });
    Neo.ui.invItemsList?.addEventListener('click', event => {
      const card = event.target instanceof Element ? event.target.closest('[data-open-ui-item]') : null;
      if (!card) return;
      const itemKey = card.dataset.openUiItem || '';
      if (Neo.getPendingUiItemCount?.(itemKey, Neo.player) <= 0) return;
      setInventoryPanelOpen(false, { suppressPanelItemSelection: true });
      Neo.requestPanelItemSelection?.({ itemKey });
    });
    Neo.ui.shopItems?.addEventListener('click', handleShopBuyClick);
    Neo.ui.shopWeapons?.addEventListener('click', handleShopBuyClick);
    Neo.ui.shopMoves?.addEventListener('click', handleShopBuyClick);
    Neo.ui.shopTrades?.addEventListener('click', handleShopBuyClick);
    Neo.ui.shopHeals?.addEventListener('click', handleShopBuyClick);
    Neo.bindEquipmentSlotClicks?.();
    Neo.ui.invMovesList?.addEventListener('click', handleInventoryMoveSelect);
    Neo.ui.invMovesList?.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
      if (!target) return;
      event.preventDefault();
      handleInventoryMoveSelect(event);
    });
    Neo.ui.invWeaponsList?.addEventListener('click', handleInventoryWeaponSelect);
    // Toolbar editor: arrow buttons swap a tool one slot up/down.
    Neo.ui.invToolsList?.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('[data-tool-move]') : null;
      if (!button) return;
      const fromIdx = Number(button.dataset.toolIdx);
      const toIdx = button.dataset.toolMove === 'up' ? fromIdx - 1 : fromIdx + 1;
      if (Neo.reorderEquipmentSlot?.(fromIdx, toIdx)) {
        markInventoryPanelDirty();
        renderInventoryPanel();
      }
    });
    // Toolbar editor: drag a tool card onto another to reorder.
    Neo.ui.invToolsList?.addEventListener('dragstart', event => {
      const card = event.target instanceof Element ? event.target.closest('[data-tool-key]') : null;
      if (!card) return;
      Neo.draggingToolIdx = Number(card.dataset.toolIdx);
      event.dataTransfer?.setData('text/plain', card.dataset.toolKey || '');
    });
    Neo.ui.invToolsList?.addEventListener('dragover', event => {
      const card = event.target instanceof Element ? event.target.closest('[data-tool-key]') : null;
      if (!card || !Number.isInteger(Neo.draggingToolIdx)) return;
      event.preventDefault();
      card.classList.add('drag-over');
    });
    Neo.ui.invToolsList?.addEventListener('dragleave', event => {
      const card = event.target instanceof Element ? event.target.closest('[data-tool-key]') : null;
      card?.classList.remove('drag-over');
    });
    Neo.ui.invToolsList?.addEventListener('drop', event => {
      const card = event.target instanceof Element ? event.target.closest('[data-tool-key]') : null;
      card?.classList.remove('drag-over');
      if (!card || !Number.isInteger(Neo.draggingToolIdx)) return;
      event.preventDefault();
      const toIdx = Number(card.dataset.toolIdx);
      if (Neo.reorderEquipmentSlot?.(Neo.draggingToolIdx, toIdx)) {
        markInventoryPanelDirty();
        renderInventoryPanel();
      }
    });
    Neo.ui.invToolsList?.addEventListener('dragend', () => {
      Neo.draggingToolIdx = null;
      Neo.ui.invToolsList?.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
    });
    Neo.ui.invMovesList?.addEventListener('dragstart', event => {
      const target = event.target instanceof Element ? event.target : null;
      const moveKey = target?.closest('[data-move]')?.dataset?.move;
      if (!moveKey) return;
      Neo.draggingMoveKey = moveKey;
      event.dataTransfer?.setData('text/plain', moveKey);
    });
    Neo.ui.invMovesList?.addEventListener('dragover', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
      const moveKey = Neo.draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
      const targetMoveKey = target?.dataset?.move || '';
      if (!Neo.MOVE_DEFS[moveKey] || !Neo.MOVE_DEFS[targetMoveKey]) return;
      if (Neo.MOVE_DEFS[moveKey].slot !== Neo.MOVE_DEFS[targetMoveKey].slot) return;
      event.preventDefault();
      target?.classList.add('drag-over');
    });
    Neo.ui.invMovesList?.addEventListener('dragleave', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
      target?.classList.remove('drag-over');
    });
    Neo.ui.invMovesList?.addEventListener('drop', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
      const moveKey = Neo.draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
      const targetMoveKey = target?.dataset?.move || '';
      target?.classList.remove('drag-over');
      if (!Neo.MOVE_DEFS[moveKey] || !Neo.MOVE_DEFS[targetMoveKey]) return;
      if (Neo.MOVE_DEFS[moveKey].slot !== Neo.MOVE_DEFS[targetMoveKey].slot) return;
      event.preventDefault();
      equipMove(Neo.MOVE_DEFS[targetMoveKey].slot, targetMoveKey);
    });
    Neo.ui.invMovesList?.addEventListener('dragend', () => {
      Neo.draggingMoveKey = '';
      clearInventoryDragState();
    });
    Object.entries(Neo.ui.invSlots).forEach(([slot, node]) => {
      if (!node) return;
      node.addEventListener('click', () => {
        if (!hasSpareMoveForSlot(Neo.player, slot)) {
          Neo.activeInventorySlot = '';
          markInventoryPanelDirty();
          renderInventoryPanel();
          return;
        }
        Neo.activeInventorySlot = Neo.activeInventorySlot === slot ? '' : slot;
        markInventoryPanelDirty();
        renderInventoryPanel();
      });
      node.addEventListener('dragstart', event => {
        const moveKey = node.dataset.move || '';
        if (!moveKey) {
          event.preventDefault();
          return;
        }
        Neo.draggingMoveKey = moveKey;
        event.dataTransfer?.setData('text/plain', moveKey);
      });
      node.addEventListener('dragend', () => {
        Neo.draggingMoveKey = '';
        clearInventoryDragState();
      });
      node.addEventListener('dragover', event => {
        event.preventDefault();
        const moveKey = Neo.draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
        if (!Neo.MOVE_DEFS[moveKey] || Neo.MOVE_DEFS[moveKey].slot !== slot) return;
        node.classList.add('drag-over');
      });
      node.addEventListener('dragleave', () => {
        node.classList.remove('drag-over');
      });
      node.addEventListener('drop', event => {
        event.preventDefault();
        node.classList.remove('drag-over');
        const moveKey = Neo.draggingMoveKey || event.dataTransfer?.getData('text/plain') || '';
        equipMove(slot, moveKey);
      });
    });
    Neo.ui.invWeaponSlot?.addEventListener('click', () => {
      if (Neo.player?.equippedWeapon) equipWeapon('');
    });
  }

export function clearInventoryDragState() {
    Object.values(Neo.ui.invSlots).forEach(node => node?.classList.remove('drag-over'));
    Neo.ui.invMovesList?.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
  }

function hasSpareMoveForSlot(playerRef, slot) {
    if (!playerRef || !slot) return false;
    const equipped = new Set(Object.values(playerRef.equippedMoves || {}).filter(Boolean));
    return Object.keys(playerRef.ownedMoves || {}).some(key => (
      playerRef.ownedMoves[key]
      && !equipped.has(key)
      && Neo.MOVE_DEFS[key]?.slot === slot
      && Neo.isMoveAllowedForCharacter(key, playerRef.character)
    ));
  }

function handleInventoryMoveSelect(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
    const moveKey = target?.dataset?.move || '';
    if (!moveKey || !Neo.MOVE_DEFS[moveKey]) return;
    if (Number(Neo.player?.extraBatteryPendingCount || 0) > 0) {
      const nextMaxStacks = Neo.grantExtraBatteryToMove(moveKey);
      if (nextMaxStacks > 0) {
        Neo.activeInventorySlot = '';
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 46, life: 0.8, text: `${Neo.MOVE_DEFS[moveKey].name.toUpperCase()} +1 CHARGE`, c: '#cfd7ff' });
        // No batteries left: close the inventory so a still-owed Wizard's Paw can
        // take over (the close hook surfaces it). More batteries still queued?
        // Stay open in battery-select mode for the next pick.
        if (Number(Neo.player?.extraBatteryPendingCount || 0) <= 0) {
          setInventoryPanelOpen(false);
        } else {
          markInventoryPanelDirty();
          renderInventoryPanel();
        }
      }
      return;
    }
    if (Object.values(Neo.player?.equippedMoves || {}).includes(moveKey)) {
      Neo.activeInventorySlot = '';
      markInventoryPanelDirty();
      renderInventoryPanel();
      return;
    }
    Neo.activeInventorySlot = Neo.MOVE_DEFS[moveKey].slot;
    equipMove(Neo.MOVE_DEFS[moveKey].slot, moveKey);
  }

export function isPanelOpen(panel) {
    return !!panel && !panel.classList.contains('hidden');
  }

  const PANEL_CLOSE_EFFECT_DURATION_MS = 340;
  const PANEL_CLOSE_EFFECT_SETTLE_MS = 40;

  function prefersReducedPanelMotion() {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  function getPanelCloseEffectKey(target) {
    if (!target) return '';
    if (typeof target === 'string') return target;
    return String(target.id || target.dataset?.panelFxKey || target.className || target.tagName || 'panel');
  }

  export function clearPanelCloseEffect(target) {
    const key = getPanelCloseEffectKey(target);
    if (!key) return;
    document.querySelectorAll('.panel-disintegrate-fx').forEach(node => {
      if (node instanceof HTMLElement && node.dataset.fxKey === key) node.remove();
    });
  }

  function copyCanvasBitmaps(sourceRoot, cloneRoot) {
    const sourceCanvases = Array.from(sourceRoot.querySelectorAll('canvas'));
    const cloneCanvases = Array.from(cloneRoot.querySelectorAll('canvas'));
    const count = Math.min(sourceCanvases.length, cloneCanvases.length);
    for (let index = 0; index < count; index += 1) {
      const sourceCanvas = sourceCanvases[index];
      const cloneCanvas = cloneCanvases[index];
      if (!(sourceCanvas instanceof HTMLCanvasElement) || !(cloneCanvas instanceof HTMLCanvasElement)) continue;
      cloneCanvas.width = sourceCanvas.width;
      cloneCanvas.height = sourceCanvas.height;
      const ctx = cloneCanvas.getContext('2d');
      if (!ctx) continue;
      ctx.clearRect(0, 0, cloneCanvas.width, cloneCanvas.height);
      ctx.drawImage(sourceCanvas, 0, 0);
    }
  }

  function applyGhostSurfaceStyle(source, clone, rect, offsetX, offsetY) {
    const computed = window.getComputedStyle(source);
    [
      'display',
      'background',
      'background-image',
      'background-color',
      'border',
      'border-top',
      'border-right',
      'border-bottom',
      'border-left',
      'border-radius',
      'box-shadow',
      'backdrop-filter',
      'color',
      'padding',
      'overflow',
      'overflow-x',
      'overflow-y',
      'flex-direction',
      'align-items',
      'justify-content',
      'text-align',
      'box-sizing',
      'gap',
    ].forEach(prop => {
      clone.style.setProperty(prop, computed.getPropertyValue(prop));
    });
    clone.classList.remove('hidden');
    clone.classList.add('panel-disintegrate-fx__surface');
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    clone.style.position = 'absolute';
    clone.style.left = `${-offsetX}px`;
    clone.style.top = `${-offsetY}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.maxHeight = 'none';
    clone.style.minHeight = '0';
    clone.style.margin = '0';
    clone.style.inset = 'auto';
    clone.style.transform = 'none';
    clone.style.transition = 'none';
    clone.style.animation = 'none';
    clone.style.opacity = '1';
    clone.style.visibility = 'visible';
    clone.style.pointerEvents = 'none';
    clone.style.willChange = 'auto';
    clone.setAttribute('aria-hidden', 'true');
    clone.scrollTop = source.scrollTop;
    clone.scrollLeft = source.scrollLeft;
  }

  function getPanelCloseOrigin(element, rect) {
    const closeButton = element.querySelector('.panel-close, [aria-label*="Close"], [aria-label*="close"]');
    if (closeButton instanceof HTMLElement) {
      const closeRect = closeButton.getBoundingClientRect();
      return {
        x: closeRect.left + closeRect.width / 2 - rect.left,
        y: closeRect.top + closeRect.height / 2 - rect.top,
      };
    }
    return { x: rect.width * 0.86, y: rect.height * 0.14 };
  }

  function addPanelCloseSparks(ghost, rect, origin, maxDelay) {
    const area = rect.width * rect.height;
    const sparkCount = Math.max(8, Math.min(18, Math.round(area / 30000)));
    const maxRadius = Math.max(1, Math.hypot(rect.width, rect.height));

    for (let index = 0; index < sparkCount; index += 1) {
      const spark = document.createElement('span');
      spark.className = 'panel-disintegrate-fx__spark';
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * maxRadius * 0.58;
      const x = Neo.clamp?.(origin.x + Math.cos(angle) * radius, 0, rect.width) ?? Math.min(rect.width, Math.max(0, origin.x + Math.cos(angle) * radius));
      const y = Neo.clamp?.(origin.y + Math.sin(angle) * radius, 0, rect.height) ?? Math.min(rect.height, Math.max(0, origin.y + Math.sin(angle) * radius));
      const vx = x - origin.x;
      const vy = y - origin.y;
      const len = Math.hypot(vx, vy) || 1;
      const drift = 50 + Math.random() * 105;
      const delay = Math.round((len / maxRadius) * Math.min(maxDelay + 40, 120) + Math.random() * 35);

      spark.style.left = `${x.toFixed(1)}px`;
      spark.style.top = `${y.toFixed(1)}px`;
      spark.style.setProperty('--panel-fx-delay', `${delay}ms`);
      spark.style.setProperty('--panel-fx-dx', `${((vx / len) * drift + (Math.random() - 0.5) * 42).toFixed(1)}px`);
      spark.style.setProperty('--panel-fx-dy', `${((vy / len) * drift - 24 + (Math.random() - 0.5) * 58).toFixed(1)}px`);
      spark.style.setProperty('--panel-fx-scale', (0.35 + Math.random() * 0.85).toFixed(2));
      ghost.appendChild(spark);
    }
  }

  function addPanelCloseShards(ghost, rect, origin) {
    const area = rect.width * rect.height;
    const shardCount = Math.max(8, Math.min(14, Math.round(area / 42000)));
    const maxRadius = Math.max(1, Math.hypot(rect.width, rect.height));
    let maxDelay = 0;

    for (let index = 0; index < shardCount; index += 1) {
      const shard = document.createElement('span');
      shard.className = 'panel-disintegrate-fx__tile';
      const x = Math.random() * rect.width;
      const y = Math.random() * rect.height;
      const vx = x - origin.x;
      const vy = y - origin.y;
      const distance = Math.hypot(vx, vy);
      const len = distance || 1;
      const force = 58 + (distance / maxRadius) * 110 + Math.random() * 28;
      const delay = Math.round((distance / maxRadius) * 55 + Math.random() * 22);
      maxDelay = Math.max(maxDelay, delay);

      shard.style.left = `${x.toFixed(1)}px`;
      shard.style.top = `${y.toFixed(1)}px`;
      shard.style.width = `${(12 + Math.random() * 28).toFixed(1)}px`;
      shard.style.height = `${(3 + Math.random() * 8).toFixed(1)}px`;
      shard.style.setProperty('--panel-fx-delay', `${delay}ms`);
      shard.style.setProperty('--panel-fx-dx', `${((vx / len) * force + (Math.random() - 0.5) * 28).toFixed(1)}px`);
      shard.style.setProperty('--panel-fx-dy', `${((vy / len) * force - 18 + (Math.random() - 0.5) * 34).toFixed(1)}px`);
      shard.style.setProperty('--panel-fx-rot', `${((Math.random() - 0.5) * 52).toFixed(1)}deg`);
      shard.style.setProperty('--panel-fx-scale', (0.58 + Math.random() * 0.3).toFixed(2));
      ghost.appendChild(shard);
    }

    return maxDelay;
  }

  export function playPanelCloseEffect(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    if (element.classList.contains('hidden') || prefersReducedPanelMotion() || !document.body) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 24) return false;

    const key = getPanelCloseEffectKey(element);
    clearPanelCloseEffect(key);

    const computed = window.getComputedStyle(element);
    const ghost = document.createElement('div');
    ghost.className = 'panel-disintegrate-fx';
    ghost.dataset.fxKey = key;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    const parsedZ = Number.parseFloat(computed.zIndex);
    ghost.style.zIndex = String(Number.isFinite(parsedZ) ? parsedZ + 2 : 100);

    const origin = getPanelCloseOrigin(element, rect);
    ghost.style.setProperty('--panel-fx-origin-x', `${origin.x}px`);
    ghost.style.setProperty('--panel-fx-origin-y', `${origin.y}px`);

    const surfaceLayer = document.createElement('div');
    surfaceLayer.className = 'panel-disintegrate-fx__ghost-surface';
    const surface = element.cloneNode(true);
    applyGhostSurfaceStyle(element, surface, rect, 0, 0);
    copyCanvasBitmaps(element, surface);
    surfaceLayer.appendChild(surface);
    ghost.appendChild(surfaceLayer);

    const flash = document.createElement('div');
    flash.className = 'panel-disintegrate-fx__flash';
    ghost.appendChild(flash);

    const maxDelay = addPanelCloseShards(ghost, rect, origin);

    addPanelCloseSparks(ghost, rect, origin, maxDelay);
    document.body.appendChild(ghost);
    window.requestAnimationFrame(() => ghost.classList.add('panel-disintegrate-fx--active'));
    window.setTimeout(() => ghost.remove(), PANEL_CLOSE_EFFECT_DURATION_MS + maxDelay + PANEL_CLOSE_EFFECT_SETTLE_MS);
    return true;
  }

export function markShopPanelDirty() {
    Neo.shopPanelDirty = true;
  }

export function markInventoryPanelDirty() {
    Neo.inventoryPanelDirty = true;
  }

export function setShopPanelOpen(open, options = {}) {
    if (!Neo.ui.shopPanel) return;
  const animateClose = options.animateClose !== false;
    if (open) {
      clearPanelCloseEffect(Neo.ui.shopPanel);
      Neo.ui.shopPanel.classList.remove('hidden');
      Neo.ui.shopPanel.setAttribute('aria-hidden', 'false');
      markShopPanelDirty();
      renderShopPanel();
      return;
    }
    if (animateClose && isPanelOpen(Neo.ui.shopPanel)) playPanelCloseEffect(Neo.ui.shopPanel);
    else clearPanelCloseEffect(Neo.ui.shopPanel);
    Neo.ui.shopPanel.classList.add('hidden');
    Neo.ui.shopPanel.setAttribute('aria-hidden', 'true');
    // A scroll bought here defers its popup while the shop is open; surface it now.
    Neo.requestPanelItemSelection?.({ suppressBatteryOpen: true });
  }

export function setInventoryPanelOpen(open, options = {}) {
    if (!Neo.ui.invPanel) return;
    const animateClose = options.animateClose !== false;
    if (Neo._inventoryOpenAnimTimer) {
      window.clearTimeout(Neo._inventoryOpenAnimTimer);
      Neo._inventoryOpenAnimTimer = null;
    }
    if (Neo._inventoryCloseClassTimer) {
      window.clearTimeout(Neo._inventoryCloseClassTimer);
      Neo._inventoryCloseClassTimer = null;
    }
    clearPanelCloseEffect(Neo.ui.invPanel);
    Neo.ui.invPanel.classList.remove('inv-panel--closing', 'inv-panel--opening');
    if (!open && animateClose && isPanelOpen(Neo.ui.invPanel)) {
      playPanelCloseEffect(Neo.ui.invPanel);
    }
    if (!open && options.suppressPanelItemSelection) {
      Neo.suppressPanelItemSelectionUntil = Date.now() + 250;
    }
    Neo.ui.invPanel.classList.toggle('hidden', !open);
    Neo.ui.invPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (!open) {
      Neo.activeInventorySlot = '';
      if (Neo.inventoryPauseActive) {
        Neo.inventoryPauseActive = false;
        if (Neo.gameState === 'pause') Neo.resumeGame();
      }
      // If a Wizard's Paw is still owed, surface it now that the inventory is
      // closed. Suppress battery auto-reopen so closing isn't undone instantly.
      Neo.requestPanelItemSelection?.({ suppressBatteryOpen: true });
    }
    if (open) {
      const shouldPause = window.NeoSettings?.shouldPauseInventory?.() !== false;
      if (shouldPause && Neo.gameState === 'play') {
        Neo.inventoryPauseActive = true;
        Neo.pauseGame();
      }
      const isCoop = Neo.gameMode === 'coop' && (Neo.player2 || Neo.player3 || Neo.player4);
      if (Neo.ui.invPlayerTabs) Neo.ui.invPlayerTabs.classList.toggle('hidden', !isCoop);
      if (isCoop) updateInvPlayerTabVisibility();
      markInventoryPanelDirty();
      renderInventoryPanel();
    }
  }

export function updateInvPlayerTabVisibility() {
    const players = [Neo.player, Neo.player2, Neo.player3, Neo.player4];
    const dead = [false, Neo.p2DeadInCoop, Neo.p3DeadInCoop, Neo.p4DeadInCoop];
    Neo.ui.invPlayerTabBtns.forEach(tab => {
      const n = Number(tab.dataset.invPlayer);
      const exists = !!players[n - 1];
      tab.classList.toggle('hidden', !exists);
      tab.classList.toggle('active', n === Neo.activeInvPlayer);
      tab.classList.toggle('inv-player-dead', dead[n - 1]);
    });
    // If selected player no longer exists, fall back to P1
    const players2 = [Neo.player, Neo.player2, Neo.player3, Neo.player4];
    if (!players2[Neo.activeInvPlayer - 1]) Neo.activeInvPlayer = 1;
  }

export function toggleShopPanel() {
    if (Neo.currentRoom?.type !== 'shop') return;
    const next = !isPanelOpen(Neo.ui.shopPanel);
    if (next) setInventoryPanelOpen(false, { animateClose: false });
    setShopPanelOpen(next);
    if (next && Neo.isFirstRunTutorialActive()) Neo.tutorialState.openedShop = true;
  }

export function toggleInventoryPanel() {
    const next = !isPanelOpen(Neo.ui.invPanel);
    if (next) setShopPanelOpen(false, { animateClose: false });
    setInventoryPanelOpen(next);
    if (next && Neo.isFirstRunTutorialActive()) Neo.tutorialState.openedInventory = true;
  }

  // ---- Anvil panel ----

export function setAnvilPanelOpen(open, options = {}) {
    if (!Neo.ui.anvilPanel) return;
  const animateClose = options.animateClose !== false;
    if (open) {
      Neo.showFirstTip?.('forge');
      clearPanelCloseEffect(Neo.ui.anvilPanel);
      Neo.ui.anvilPanel.classList.remove('hidden');
      Neo.ui.anvilPanel.setAttribute('aria-hidden', 'false');
      Neo.anvilStagedUpgrades = {};
      const equipped = Neo.player?.equippedWeapon;
      Neo.anvilSelectedItem = equipped ? `weapon:${equipped}` : null;
      renderAnvilPanel();
      return;
    }
    if (animateClose && isPanelOpen(Neo.ui.anvilPanel)) playPanelCloseEffect(Neo.ui.anvilPanel);
    else clearPanelCloseEffect(Neo.ui.anvilPanel);
    Neo.ui.anvilPanel.classList.add('hidden');
    Neo.ui.anvilPanel.setAttribute('aria-hidden', 'true');
    // Surface any selection (scroll/paw/battery) deferred while the anvil was open.
    Neo.requestPanelItemSelection?.({ suppressBatteryOpen: true });
  }

export function toggleAnvilPanel() {
    if (Neo.currentRoom?.type !== 'anvil') return;
    const next = !isPanelOpen(Neo.ui.anvilPanel);
    if (!next) Neo.anvilStagedUpgrades = {};
    if (next) {
      setShopPanelOpen(false, { animateClose: false });
      setInventoryPanelOpen(false, { animateClose: false });
    }
    setAnvilPanelOpen(next);
  }

  function getAnvilStatSchema(itemKey, itemType) {
    const base = itemType === 'weapon' ? Neo.WEAPON_BASE_STATS[itemKey] : Neo.MOVE_BASE_STATS[itemKey];
    if (!base) return [];
    const schema = itemType === 'weapon' ? Neo.WEAPON_UPGRADEABLE_STATS : Neo.MOVE_UPGRADEABLE_STATS;
    return Object.entries(schema)
      .filter(([statKey]) => statKey in base)
      .map(([statKey, def]) => ({
        statKey,
        ...def,
        min: statKey === 'cooldown'
          ? Math.max(Number(def.min || 0), Number(base[statKey] || 0) * 0.5)
          : def.min,
        baseValue: base[statKey],
      }));
  }

  function getAnvilCurrentValue(itemKey, statKey, itemType) {
    const base = itemType === 'weapon' ? Neo.WEAPON_BASE_STATS[itemKey] : Neo.MOVE_BASE_STATS[itemKey];
    if (!base || !(statKey in base)) return 0;
    const upgrades = Neo.player.anvilUpgrades?.[itemType]?.[itemKey]?.[statKey] ?? 0;
    const schema = itemType === 'weapon' ? Neo.WEAPON_UPGRADEABLE_STATS : Neo.MOVE_UPGRADEABLE_STATS;
    const value = base[statKey] + upgrades * schema[statKey].step;
    if (statKey === 'cooldown') return Math.max(Number(base[statKey] || 0) * 0.5, value);
    return value;
  }

  function getAnvilStagedValue(itemKey, statKey, itemType) {
    const cur = getAnvilCurrentValue(itemKey, statKey, itemType);
    const staged = Neo.anvilStagedUpgrades[`${itemType}:${itemKey}:${statKey}`] ?? 0;
    const schema = itemType === 'weapon' ? Neo.WEAPON_UPGRADEABLE_STATS : Neo.MOVE_UPGRADEABLE_STATS;
    return cur + staged * schema[statKey].step;
  }

  // Per-step cost for a stat in the currently selected pay currency.
  function getAnvilStepCost(statDef) {
    if (!statDef) return 0;
    // Gold upgrades cost double the listed goldPerStep; XP cost is unchanged. This
    // is the single chokepoint for forge cost (per-step display, total, and spend).
    return Neo.anvilPayCurrency === 'gold'
      ? (statDef.goldPerStep ?? 0) * 2
      : (statDef.xpPerStep ?? 0);
  }

  function getForgeVoucherStepValue() {
    return Math.max(1, Math.floor(Number(Neo.FORGE_VOUCHER_UPGRADE_STEPS || 5)));
  }

  function getForgeVoucherFreeSteps() {
    if (!Neo.player) return 0;
    const voucherKey = Neo.FORGE_VOUCHER_KEY || 'forge_voucher';
    const voucherStacks = Math.max(0, Math.floor(Number(Neo.player.items?.[voucherKey] || 0)));
    const looseCharges = Math.max(0, Math.floor(Number(Neo.player.forgeVoucherCharges || 0)));
    return looseCharges + voucherStacks * getForgeVoucherStepValue();
  }

  function getAnvilStagedStepCount() {
    return Object.values(Neo.anvilStagedUpgrades || {}).reduce((total, count) => (
      total + Math.max(0, Math.floor(Number(count) || 0))
    ), 0);
  }

  // Total cost of all staged upgrades, charged entirely in the selected
  // currency (XP or gold). The other currency is always 0.
  function getAnvilTotalCost() {
    let total = 0;
    let freeStepsRemaining = getForgeVoucherFreeSteps();
    let voucherStepsUsed = 0;
    let stagedSteps = 0;
    for (const [key, count] of Object.entries(Neo.anvilStagedUpgrades)) {
      if (count === 0) continue;
      const [itemType, , statKey] = key.split(':');
      const schema = itemType === 'weapon' ? Neo.WEAPON_UPGRADEABLE_STATS : Neo.MOVE_UPGRADEABLE_STATS;
      const stepCount = Math.max(0, Math.floor(Number(count) || 0));
      stagedSteps += stepCount;
      const freeSteps = Math.min(stepCount, freeStepsRemaining);
      freeStepsRemaining -= freeSteps;
      voucherStepsUsed += freeSteps;
      total += Math.max(0, stepCount - freeSteps) * getAnvilStepCost(schema[statKey]);
    }
    return Neo.anvilPayCurrency === 'gold'
      ? { xp: 0, gold: total, voucherSteps: voucherStepsUsed, stagedSteps }
      : { xp: total, gold: 0, voucherSteps: voucherStepsUsed, stagedSteps };
  }

export function renderAnvilPanel() {
    if (!isPanelOpen(Neo.ui.anvilPanel) || !Neo.player) return;

    // XP display (current XP, not total)
    if (Neo.ui.anvilXp) Neo.ui.anvilXp.textContent = Neo.player.xp ?? 0;
    if (Neo.ui.anvilCoins) Neo.ui.anvilCoins.textContent = Neo.player.coins ?? 0;
    if (Neo.ui.anvilCoinIcon && typeof Neo.drawPixelIcon === 'function') {
      Neo.drawPixelIcon(Neo.ui.anvilCoinIcon, '#ffd15a', [
        [2, 1], [3, 1], [4, 1],
        [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
        [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
        [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
        [2, 5], [3, 5], [4, 5],
      ]);
    }

    // Tab visibility
    const isWeapons = Neo.activeAnvilTab === 'weapons';
    Neo.ui.anvilWeaponsTab?.classList.toggle('hidden', !isWeapons);
    Neo.ui.anvilMovesTab?.classList.toggle('hidden', isWeapons);
    Neo.ui.anvilTabs.forEach(t => t.classList.toggle('active', t.dataset.anvilTab === Neo.activeAnvilTab));

    if (isWeapons) renderAnvilItemList('weapon');
    else renderAnvilItemList('move');

    renderAnvilStatPanel();
    renderAnvilFooter();
  }

export function renderAnvilItemList(itemType) {
    const listEl = itemType === 'weapon' ? Neo.ui.anvilWeaponList : Neo.ui.anvilMoveList;
    if (!listEl) return;

    let keys = [];
    if (itemType === 'weapon') {
      keys = Object.keys(Neo.player.ownedWeapons || {}).filter(k => Neo.WEAPON_BASE_STATS[k] && Neo.player.ownedWeapons[k]);
    } else {
      keys = Object.keys(Neo.player.ownedMoves || {}).filter(k => Neo.MOVE_BASE_STATS[k] && Neo.player.ownedMoves[k]);
    }

    if (keys.length === 0) {
      listEl.innerHTML = `<p style="color:#91a8be;font-size:calc(13px * var(--font-scale, 1));padding:8px">No ${itemType}s owned.</p>`;
      return;
    }

    listEl.innerHTML = keys.map(key => {
      const def = itemType === 'weapon' ? Neo.WEAPON_DEFS[key] : Neo.MOVE_DEFS[key];
      const name = def?.name || key;
      const isActive = Neo.anvilSelectedItem === `${itemType}:${key}`;
      return `<button class="anvil-item-btn${isActive ? ' is-active' : ''}" data-item="${Neo.escapeHtml(key)}" data-item-type="${itemType}">
        <canvas class="anvil-item-icon" data-anvil-item-icon="${Neo.escapeHtml(key)}" data-anvil-item-icon-type="${itemType}" width="38" height="38" aria-hidden="true"></canvas>
        <span class="anvil-item-name" style="color:${Neo.getRarityNameColor(def?.rarity || def?.category)}">${Neo.escapeHtml(name)}</span>
      </button>`;
    }).join('');
    hydrateAnvilItemIcons(listEl);
  }

  function hydrateAnvilItemIcons(root) {
    root?.querySelectorAll('[data-anvil-item-icon]').forEach(canvas => {
      const key = canvas.dataset.anvilItemIcon;
      if (canvas.dataset.anvilItemIconType === 'weapon') {
        const weapon = Neo.WEAPON_DEFS[key];
        if (weapon) Neo.drawWeaponToastIcon(canvas, weapon);
      } else {
        const move = Neo.MOVE_DEFS[key];
        if (move) Neo.drawMoveToastIcon(canvas, move);
      }
    });
  }

export function renderAnvilStatPanel() {
    if (!Neo.anvilSelectedItem) {
      if (Neo.ui.anvilWeaponStats) Neo.ui.anvilWeaponStats.classList.add('hidden');
      if (Neo.ui.anvilMoveStats) Neo.ui.anvilMoveStats.classList.add('hidden');
      return;
    }
    const [itemType, itemKey] = Neo.anvilSelectedItem.split(':');
    const statEl = itemType === 'weapon' ? Neo.ui.anvilWeaponStats : Neo.ui.anvilMoveStats;
    const otherEl = itemType === 'weapon' ? Neo.ui.anvilMoveStats : Neo.ui.anvilWeaponStats;
    if (!statEl) return;
    statEl.classList.remove('hidden');
    if (otherEl) otherEl.classList.add('hidden');

    const def = itemType === 'weapon' ? Neo.WEAPON_DEFS[itemKey] : Neo.MOVE_DEFS[itemKey];
    const stats = getAnvilStatSchema(itemKey, itemType);
    const schema = itemType === 'weapon' ? Neo.WEAPON_UPGRADEABLE_STATS : Neo.MOVE_UPGRADEABLE_STATS;

    const rows = stats.map(({ statKey, label, min, max, xpPerStep, goldPerStep, format }) => {
      const cur = getAnvilCurrentValue(itemKey, statKey, itemType);
      const staged = getAnvilStagedValue(itemKey, statKey, itemType);
      const step = schema[statKey].step;
      const stagedCount = Neo.anvilStagedUpgrades[`${itemType}:${itemKey}:${statKey}`] ?? 0;

      // next value after pressing +: staged + step
      const nextVal = staged + step;
      const withinCap = step > 0 ? nextVal <= max : nextVal >= min;
      // The + must also reflect affordability, or it looks clickable but the
      // click handler silently rejects it (no feedback = "anvil is broken").
      const payGold = Neo.anvilPayCurrency === 'gold';
      // Use the shared cost chokepoint so the per-step label, the affordability
      // gate, and the actual spend all agree (gold is charged at goldPerStep*2).
      const stepCost = getAnvilStepCost(schema[statKey]);
      const wallet = payGold ? (Neo.player?.coins ?? 0) : (Neo.player?.xp ?? 0);
      const cost = getAnvilTotalCost();
      const spent = payGold ? cost.gold : cost.xp;
      const canUseVoucher = getAnvilStagedStepCount() < getForgeVoucherFreeSteps();
      const canAfford = canUseVoucher || spent + stepCost <= wallet;
      const canIncrease = withinCap && canAfford;
      const canDecrease = stagedCount > 0;

      const stagedDisplay = staged !== cur
        ? `<span class="anvil-stat-staged">&rarr; ${format(staged)}</span>`
        : '';
      const costDisplay = stepCost > 0
        ? `<span class="anvil-stat-cost">${payGold ? `&#9670;${stepCost}` : `${stepCost} XP`}/step</span>`
        : '';

      const statIcon = statKey === 'damage' || statKey === 'knockback'
        ? 'attack'
        : statKey === 'range'
          ? 'range'
          : statKey === 'critChance'
            ? 'crit'
            : 'speed';

      return `<div class="anvil-stat-row">
        <canvas class="anvil-stat-icon" data-inv-ui-icon="${statIcon}" width="34" height="34" aria-hidden="true"></canvas>
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

    statEl.innerHTML = `<div class="anvil-stat-title">
      <canvas class="anvil-stat-title__icon" data-anvil-item-icon="${Neo.escapeHtml(itemKey)}" data-anvil-item-icon-type="${itemType}" width="48" height="48" aria-hidden="true"></canvas>
      <span style="color:${Neo.getRarityNameColor(def?.rarity || def?.category)}">${Neo.escapeHtml(def?.name || itemKey)}</span>
    </div>${rows.join('')}`;
    hydrateAnvilItemIcons(statEl);
    statEl.querySelectorAll('[data-inv-ui-icon]').forEach(canvas => {
      Neo.drawInventoryUiIcon?.(canvas, canvas.dataset.invUiIcon);
    });
  }

  function renderAnvilFooter() {
    const cost = getAnvilTotalCost();
    const xp = Neo.player?.xp ?? 0;
    const coins = Neo.player?.coins ?? 0;
    const payGold = Neo.anvilPayCurrency === 'gold';
    const total = payGold ? cost.gold : cost.xp;
    const wallet = payGold ? coins : xp;
    const affordable = wallet >= total;
    const stagedSteps = cost.stagedSteps || 0;
    const voucherSteps = cost.voucherSteps || 0;

    // Reflect the active currency in the toggle buttons.
    Neo.ui.anvilPayXp?.classList.toggle('is-active', !payGold);
    Neo.ui.anvilPayGold?.classList.toggle('is-active', payGold);

    if (Neo.ui.anvilCostSummary) {
      if (stagedSteps === 0) {
        Neo.ui.anvilCostSummary.textContent = 'Select stats above and press + to stage upgrades.';
        Neo.ui.anvilCostSummary.style.color = '';
      } else if (total === 0 && voucherSteps > 0) {
        Neo.ui.anvilCostSummary.textContent = `Total: ${voucherSteps} Forge Voucher upgrade${voucherSteps === 1 ? '' : 's'}`;
        Neo.ui.anvilCostSummary.style.color = '#ffcf76';
      } else {
        const label = payGold
          ? `<span style="color:${affordable ? '#ffd15a' : '#ff7c88'}">&#9670; ${total} gold (${coins})</span>`
          : `<span style="color:${affordable ? '#7eff9e' : '#ff7c88'}">${total} XP (${xp})</span>`;
        const voucherLabel = voucherSteps > 0
          ? ` + <span style="color:#ffcf76">${voucherSteps} voucher</span>`
          : '';
        Neo.ui.anvilCostSummary.innerHTML = `Total: ${label}${voucherLabel}`;
        Neo.ui.anvilCostSummary.style.color = affordable ? '#7eff9e' : '#ff7c88';
      }
    }
    if (Neo.ui.anvilConfirm) {
      Neo.ui.anvilConfirm.disabled = stagedSteps === 0 || !affordable;
    }
  }

  function handleAnvilItemSelect(event) {
    const btn = event.target.closest('[data-item]');
    if (!btn) return;
    const itemKey = btn.dataset.item;
    const itemType = btn.dataset.itemType;
    Neo.anvilSelectedItem = `${itemType}:${itemKey}`;
    renderAnvilPanel();
  }

  // Flash a short rejection message in the anvil footer (in-modal, so it's
  // visible even though the panel covers the game canvas), then restore it.
  let anvilRejectToastTimer = null;
  function anvilRejectToast(message) {
    const el = Neo.ui.anvilCostSummary;
    if (!el) return;
    if (anvilRejectToastTimer) clearTimeout(anvilRejectToastTimer);
    el.textContent = message;
    el.style.color = '#ff7c88';
    anvilRejectToastTimer = setTimeout(() => {
      anvilRejectToastTimer = null;
      renderAnvilFooter();
    }, 1100);
  }

  function handleAnvilStatClick(event) {
    const btn = event.target.closest('[data-stat]');
    if (!btn || btn.disabled) return;
    const statKey = btn.dataset.stat;
    const itemKey = btn.dataset.item;
    const itemType = btn.dataset.itemType;
    const dir = Number(btn.dataset.dir);
    const stageKey = `${itemType}:${itemKey}:${statKey}`;
    const schema = itemType === 'weapon' ? Neo.WEAPON_UPGRADEABLE_STATS : Neo.MOVE_UPGRADEABLE_STATS;
    const statDef = schema[statKey];
    if (!statDef) return;

    const currentStaged = Neo.anvilStagedUpgrades[stageKey] ?? 0;

    if (dir === 1) {
      // Check cap
      const newVal = getAnvilStagedValue(itemKey, statKey, itemType) + statDef.step;
      const capped = statDef.step > 0 ? newVal > statDef.max : newVal < statDef.min;
      if (capped) {
        anvilRejectToast('MAXED OUT');
        return;
      }
      // Check if we could afford one more step in the selected currency.
      const payGold = Neo.anvilPayCurrency === 'gold';
      const nextCost = getAnvilTotalCost();
      const spent = payGold ? nextCost.gold : nextCost.xp;
      const wallet = payGold ? (Neo.player?.coins ?? 0) : (Neo.player?.xp ?? 0);
      const canUseVoucher = getAnvilStagedStepCount() < getForgeVoucherFreeSteps();
      if (!canUseVoucher && spent + getAnvilStepCost(statDef) > wallet) {
        anvilRejectToast(payGold ? 'NEED MORE GOLD' : 'NEED MORE XP');
        return;
      }
      Neo.anvilStagedUpgrades[stageKey] = currentStaged + 1;
    } else {
      // Remove a staged step (can't undo already-committed upgrades)
      if (currentStaged <= 0) return;
      Neo.anvilStagedUpgrades[stageKey] = currentStaged - 1;
    }
    renderAnvilPanel();
  }

export function confirmAnvilUpgrades() {
    const cost = getAnvilTotalCost();
    if (!Neo.player || (cost.stagedSteps || 0) <= 0) return;
    if (Neo.player.xp < cost.xp || (Neo.player.coins ?? 0) < cost.gold) return;

    Neo.player.xp -= cost.xp;
    Neo.player.coins = (Neo.player.coins ?? 0) - cost.gold;
    consumeForgeVoucherSteps(cost.voucherSteps || 0);

    if (!Neo.player.anvilUpgrades) Neo.player.anvilUpgrades = { weapon: {}, move: {} };

    for (const [key, count] of Object.entries(Neo.anvilStagedUpgrades)) {
      if (count === 0) continue;
      const [itemType, itemKey, statKey] = key.split(':');
      if (!Neo.player.anvilUpgrades[itemType]) Neo.player.anvilUpgrades[itemType] = {};
      if (!Neo.player.anvilUpgrades[itemType][itemKey]) Neo.player.anvilUpgrades[itemType][itemKey] = {};
      Neo.player.anvilUpgrades[itemType][itemKey][statKey] =
        (Neo.player.anvilUpgrades[itemType][itemKey][statKey] ?? 0) + count;
    }

    Neo.anvilStagedUpgrades = {};
    markInventoryPanelDirty();
    Neo.scheduleRunSave();
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 26, life: 1.0, text: 'UPGRADED!', c: '#ffb840' });
    renderAnvilPanel();
    Neo.updateHud();
  }

  function consumeForgeVoucherSteps(steps) {
    let remaining = Math.max(0, Math.floor(Number(steps) || 0));
    if (!Neo.player || remaining <= 0) return 0;
    const voucherKey = Neo.FORGE_VOUCHER_KEY || 'forge_voucher';
    const stepValue = getForgeVoucherStepValue();
    let looseCharges = Math.max(0, Math.floor(Number(Neo.player.forgeVoucherCharges || 0)));
    const looseUsed = Math.min(looseCharges, remaining);
    looseCharges -= looseUsed;
    remaining -= looseUsed;

    if (remaining > 0) {
      let vouchers = Math.max(0, Math.floor(Number(Neo.player.items?.[voucherKey] || 0)));
      const vouchersUsed = Math.min(vouchers, Math.ceil(remaining / stepValue));
      vouchers -= vouchersUsed;
      const openedCharges = vouchersUsed * stepValue;
      const openedUsed = Math.min(openedCharges, remaining);
      remaining -= openedUsed;
      looseCharges += Math.max(0, openedCharges - openedUsed);
      if (Neo.player.items) Neo.player.items[voucherKey] = vouchers;
    }

    Neo.player.forgeVoucherCharges = looseCharges;
    return Math.max(0, Math.floor(Number(steps) || 0)) - remaining;
  }

// Returns the anvil bonus for a given weapon stat (additive delta)
export function getAnvilWeaponBonus(weaponKey, statKey) {
    const upgrades = Neo.player?.anvilUpgrades?.weapon?.[weaponKey]?.[statKey] ?? 0;
    if (upgrades === 0) return 0;
    return upgrades * (Neo.WEAPON_UPGRADEABLE_STATS[statKey]?.step ?? 0);
  }

// Returns the anvil bonus for a given move stat
export function getAnvilMoveBonus(moveKey, statKey) {
    const upgrades = Neo.player?.anvilUpgrades?.move?.[moveKey]?.[statKey] ?? 0;
    if (upgrades === 0) return 0;
    return upgrades * (Neo.MOVE_UPGRADEABLE_STATS[statKey]?.step ?? 0);
  }

export function isWizardPawOpen() {
    return !!Neo.wizardPawSelection && isPanelOpen(Neo.ui.wizardPawModal);
  }

export function isScrollControlOpen() {
    return !!Neo.scrollControlSelection && isPanelOpen(Neo.ui.scrollControlModal);
  }

export function isExtraBatteryOpen() {
    return isPanelOpen(Neo.ui.extraBatteryModal);
  }

export function setExtraBatteryModalOpen(open, options = {}) {
    if (!Neo.ui.extraBatteryModal) return;
    const animateClose = options.animateClose !== false;
    const effectTarget = Neo.ui.extraBatteryModal.querySelector('.modal-box') || Neo.ui.extraBatteryModal;
    if (effectTarget instanceof HTMLElement) effectTarget.dataset.panelFxKey = 'extra-battery-modal';
    if (open) {
      clearPanelCloseEffect(effectTarget);
      Neo.ui.extraBatteryModal.classList.remove('hidden');
      Neo.ui.extraBatteryModal.setAttribute('aria-hidden', 'false');
      Neo.drawItemIconCanvases?.(Neo.ui.extraBatteryModal, 'data-item-icon');
      return;
    }
    if (animateClose && isPanelOpen(Neo.ui.extraBatteryModal)) playPanelCloseEffect(effectTarget);
    else clearPanelCloseEffect(effectTarget);
    Neo.ui.extraBatteryModal.classList.add('hidden');
    Neo.ui.extraBatteryModal.setAttribute('aria-hidden', 'true');
  }

export function setWizardPawModalOpen(open, options = {}) {
    if (!Neo.ui.wizardPawModal) return;
  const animateClose = options.animateClose !== false;
    const effectTarget = Neo.ui.wizardPawModal.querySelector('.modal-box') || Neo.ui.wizardPawModal;
    if (effectTarget instanceof HTMLElement) effectTarget.dataset.panelFxKey = 'wizard-paw-modal';
    if (open) {
      clearPanelCloseEffect(effectTarget);
      Neo.ui.wizardPawModal.classList.remove('hidden');
      Neo.ui.wizardPawModal.setAttribute('aria-hidden', 'false');
      Neo.drawItemIconCanvases?.(Neo.ui.wizardPawModal, 'data-item-icon');
      return;
    }
    if (animateClose && isPanelOpen(Neo.ui.wizardPawModal)) playPanelCloseEffect(effectTarget);
    else clearPanelCloseEffect(effectTarget);
    Neo.ui.wizardPawModal.classList.add('hidden');
    Neo.ui.wizardPawModal.setAttribute('aria-hidden', 'true');
  }

export function setScrollControlModalOpen(open, options = {}) {
    if (!Neo.ui.scrollControlModal) return;
  const animateClose = options.animateClose !== false;
    const effectTarget = Neo.ui.scrollControlModal.querySelector('.modal-box') || Neo.ui.scrollControlModal;
    if (effectTarget instanceof HTMLElement) effectTarget.dataset.panelFxKey = 'scroll-control-modal';
    if (open) {
      clearPanelCloseEffect(effectTarget);
      Neo.ui.scrollControlModal.classList.remove('hidden');
      Neo.ui.scrollControlModal.setAttribute('aria-hidden', 'false');
      Neo.ui.scrollControlSearch?.focus?.();
      return;
    }
    if (animateClose && isPanelOpen(Neo.ui.scrollControlModal)) playPanelCloseEffect(effectTarget);
    else clearPanelCloseEffect(effectTarget);
    Neo.ui.scrollControlModal.classList.add('hidden');
    Neo.ui.scrollControlModal.setAttribute('aria-hidden', 'true');
  }

export function isVoucherModalOpen() {
    return !!Neo.voucherRedeemOpen && isPanelOpen(Neo.ui.voucherModal);
  }

export function setVoucherModalOpen(open, options = {}) {
    if (!Neo.ui.voucherModal) return;
    const animateClose = options.animateClose !== false;
    const effectTarget = Neo.ui.voucherModal.querySelector('.modal-box') || Neo.ui.voucherModal;
    if (effectTarget instanceof HTMLElement) effectTarget.dataset.panelFxKey = 'voucher-modal';
    if (open) {
      clearPanelCloseEffect(effectTarget);
      Neo.ui.voucherModal.classList.remove('hidden');
      Neo.ui.voucherModal.setAttribute('aria-hidden', 'false');
      Neo.ui.voucherSearch?.focus?.();
      return;
    }
    if (animateClose && isPanelOpen(Neo.ui.voucherModal)) playPanelCloseEffect(effectTarget);
    else clearPanelCloseEffect(effectTarget);
    Neo.ui.voucherModal.classList.add('hidden');
    Neo.ui.voucherModal.setAttribute('aria-hidden', 'true');
  }

export function isOverlayBlockingInput() {
    return isPanelOpen(Neo.ui.shopPanel) || isPanelOpen(Neo.ui.invPanel) || isPanelOpen(Neo.ui.anvilPanel) || isWizardPawOpen() || isExtraBatteryOpen() || isScrollControlOpen() || isVoucherModalOpen();
  }

export function isGodSweepUnlocked() {
    return Number(Neo.metaProgress.godsKilled || 0) > 0 && Number(Neo.metaProgress.loopCrystals || 0) >= 5;
  }

export function getShopMoveOffers() {
    if (!Neo.currentRoom || Neo.currentRoom.type !== 'shop') return [];
    if (!Array.isArray(Neo.currentRoom.shopMoveOffers) || Neo.currentRoom.shopMoveOffers.length === 0) {
      const shopRandom = Neo.createRoomRandom(Neo.currentRoom, 'shop:move-offers');
      const seen = new Set(Object.keys(Neo.player?.ownedMoves || {}));
      const allowedCharacter = Neo.player?.character || Neo.chosenCharacter;
      const pool = Neo.SHOP_MOVE_POOL.filter(key => key !== 'god_sweep' && !seen.has(key) && Neo.isMoveAllowedForCharacter(key, allowedCharacter));
      const shuffledPool = Neo.shuffleWithRandom(pool, shopRandom);
      const offers = shuffledPool.slice(0, 4).map((moveKey, index) => ({
        type: 'move',
        key: moveKey,
        bought: false,
        cost: Neo.getShopMoveCost(index),
      }));
      if (isGodSweepUnlocked() && !seen.has('god_sweep') && shopRandom() < 0.12) {
        const insertIndex = Math.min(offers.length, Math.floor(shopRandom() * (Math.min(offers.length, 3) + 1)));
        offers.splice(insertIndex, 0, {
          type: 'move',
          key: 'god_sweep',
          bought: false,
          cost: Neo.getShopGodSweepCost(),
        });
      }
      Neo.currentRoom.shopMoveOffers = offers.slice(0, 4);
    } else {
      const allowedCharacter = Neo.player?.character || Neo.chosenCharacter;
      Neo.currentRoom.shopMoveOffers = Neo.currentRoom.shopMoveOffers.filter(offer => offer.type !== 'move' || Neo.isMoveAllowedForCharacter(offer.key, allowedCharacter));
    }
    Neo.refreshRoomShopCosts(Neo.currentRoom);
    return Neo.currentRoom.shopMoveOffers;
  }

export function getShopWeaponOffers() {
    if (!Neo.currentRoom || Neo.currentRoom.type !== 'shop') return [];
    if (!Array.isArray(Neo.currentRoom.shopWeaponOffers) || Neo.currentRoom.shopWeaponOffers.length === 0) {
      const shopRandom = Neo.createRoomRandom(Neo.currentRoom, 'shop:weapon-offers');
      const owned = new Set(Object.keys(Neo.player?.ownedWeapons || {}).filter(key => Neo.player?.ownedWeapons?.[key]));
      const pool = [];
      if (Neo.floor >= 1) pool.push(...Neo.WHITE_WEAPON_POOL);
      if (Neo.floor >= 4) pool.push(...Neo.PURPLE_WEAPON_POOL);
      if (Neo.floor >= 7) pool.push(...Neo.RED_WEAPON_POOL);
      const filtered = pool.filter(key => !owned.has(key));
      const shuffledFiltered = Neo.shuffleWithRandom(filtered, shopRandom);
      const offers = shuffledFiltered.slice(0, 3).map((weaponKey, index) => ({
        type: 'weapon',
        key: weaponKey,
        bought: false,
        cost: Neo.getShopWeaponCost(Neo.WEAPON_DEFS[weaponKey]?.rarity || 'knight', index, Neo.getShopProgressionDepth?.() ?? Neo.floor, Neo.selectedDifficulty, weaponKey),
      }));
      const projectilePool = Neo.getProjectileWeaponKeys?.(filtered) || [];
      if (offers.length > 0 && projectilePool.length > 0 && !offers.some(offer => Neo.isProjectileWeaponKey?.(offer.key))) {
        const projectileKey = Neo.shuffleWithRandom(projectilePool, shopRandom)[0];
        offers[offers.length - 1] = {
          type: 'weapon',
          key: projectileKey,
          bought: false,
          cost: Neo.getShopWeaponCost(Neo.WEAPON_DEFS[projectileKey]?.rarity || 'knight', offers.length - 1, Neo.getShopProgressionDepth?.() ?? Neo.floor, Neo.selectedDifficulty, projectileKey),
        };
      }
      Neo.currentRoom.shopWeaponOffers = offers;
    }
    Neo.refreshRoomShopCosts(Neo.currentRoom);
    return Neo.currentRoom.shopWeaponOffers;
  }

  function getShopPurchaseState(offer, { owned = false, blocked = false } = {}) {
    const canAfford = !!Neo.player && Neo.player.coins >= Number(offer?.cost || 0);
    const bought = !!offer?.bought;
    const disabled = bought || owned || blocked || !canAfford;
    const showUnaffordable = !canAfford && !owned && !bought;
    const status = bought || owned ? 'owned' : blocked ? 'locked' : showUnaffordable ? 'short' : 'available';
    const statusLabel = bought || owned ? 'Owned' : blocked ? 'Locked' : showUnaffordable ? 'Need coins' : 'Ready';
    return { canAfford, bought, disabled, showUnaffordable, status, statusLabel };
  }

  function escapeShopText(value) {
    return Neo.escapeHtml ? Neo.escapeHtml(value) : String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function formatShopStatValue(value, suffix = '') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '';
    const formatted = Math.abs(numeric) >= 100 ? String(Math.round(numeric)) : String(Math.round(numeric * 10) / 10);
    return `${formatted}${suffix}`;
  }

  function renderShopChips(chips = []) {
    const seen = new Set();
    return chips
      .filter(Boolean)
      .map(chip => {
        const label = typeof chip === 'string' ? chip : chip.label;
        if (!label) return '';
        const labelKey = String(label).toLowerCase();
        if (seen.has(labelKey)) return '';
        seen.add(labelKey);
        const toneKey = typeof chip === 'object' && chip.tone ? String(chip.tone).replace(/[^a-z0-9_-]/gi, '') : '';
        const tone = toneKey ? ` shop-card__chip--${escapeShopText(toneKey)}` : '';
        return `<span class="shop-card__chip${tone}">${escapeShopText(label)}</span>`;
      })
      .join('');
  }

  function renderShopStats(stats = []) {
    const rows = stats
      .filter(stat => stat && stat.label && stat.value !== undefined && stat.value !== null && stat.value !== '')
      .slice(0, 3)
      .map(stat => `<span class="shop-card__stat"><span>${escapeShopText(stat.label)}</span><b>${escapeShopText(stat.value)}</b></span>`)
      .join('');
    return rows ? `<div class="shop-card__stats">${rows}</div>` : '';
  }

  function buildWeaponShopChips(weaponKey, weapon) {
    const chips = [{ label: weapon?.rarity || 'weapon', tone: 'rarity' }];
    const projectileConfig = Neo.buildWeaponProjectileConfig?.(weaponKey);
    if (projectileConfig) {
      chips.push({ label: 'Projectile', tone: 'projectile' });
      if (projectileConfig.burstCount > 1) chips.push({ label: 'Burst', tone: 'projectile' });
      if (projectileConfig.pierceCount > 0) chips.push({ label: 'Pierce', tone: 'projectile' });
    } else if (weaponKey === 'lazer_glasses') {
      chips.push({ label: 'Beam', tone: 'magic' });
    } else {
      chips.push({ label: 'Melee', tone: 'melee' });
    }
    return chips;
  }

  function buildWeaponShopStats(weaponKey) {
    const base = Neo.WEAPON_BASE_STATS?.[weaponKey] || {};
    const projectileConfig = Neo.buildWeaponProjectileConfig?.(weaponKey);
    const range = Number(base.range ?? (projectileConfig ? projectileConfig.speed * projectileConfig.life : 0));
    return [
      base.damage ? { label: 'DMG', value: formatShopStatValue(base.damage) } : null,
      base.cooldown ? { label: 'CD', value: Number(base.cooldown).toFixed(2) + 's' } : null,
      range ? { label: 'RNG', value: formatShopStatValue(range) } : null,
    ];
  }

  function buildMoveShopStats(moveKey) {
    const base = Neo.MOVE_BASE_STATS?.[moveKey] || {};
    return [
      base.damage ? { label: 'DMG', value: formatShopStatValue(base.damage) } : null,
      base.cooldown ? { label: 'CD', value: Number(base.cooldown).toFixed(2) + 's' } : null,
      base.duration
        ? { label: 'DUR', value: formatShopStatValue(base.duration, 's') }
        : base.range
          ? { label: 'AOE', value: formatShopStatValue(base.range) }
          : null,
    ];
  }

  function buildDescriptorChips(key, description, { slot = '', kind = '' } = {}) {
    const chips = [];
    const text = `${String(key || '')} ${String(description || '')}`.toLowerCase();
    if (text.includes('bleed')) chips.push({ label: 'Bleed', tone: 'status' });
    if (text.includes('fire') || text.includes('burn')) chips.push({ label: 'Fire', tone: 'status' });
    if (text.includes('poison')) chips.push({ label: 'Poison', tone: 'status' });
    if (text.includes('stun') || text.includes('slow')) chips.push({ label: 'Status', tone: 'status' });
    if (text.includes('beam')) chips.push({ label: 'Beam', tone: 'projectile' });
    if (text.includes('aoe') || text.includes('area') || text.includes('explosion')) chips.push({ label: 'AOE', tone: 'item' });
    if (text.includes('charge')) chips.push({ label: 'Charge', tone: 'item' });
    if (text.includes('projectile')) chips.push({ label: 'Projectile', tone: 'projectile' });
    if (text.includes('homing')) chips.push({ label: 'Homing', tone: 'projectile' });
    if (text.includes('burst')) chips.push({ label: 'Burst', tone: 'projectile' });
    if (text.includes('defense') || text.includes('shield') || text.includes('block') || text.includes('armor')) chips.push({ label: 'Defense', tone: 'defense' });
    if (text.includes('heal') || text.includes('regen') || text.includes('recovery')) chips.push({ label: 'Heal', tone: 'heal' });
    if (text.includes('magnet')) chips.push({ label: 'Magnet', tone: 'item' });
    if (slot) chips.push({ label: `Slot: ${Neo.SLOT_LABELS?.[slot] || slot}`, tone: 'move' });
    if (kind === 'weapon' && Neo.isProjectileWeaponKey?.(key)) chips.push({ label: 'Projectile', tone: 'projectile' });
    return chips;
  }

  function normalizeOfferTag(label) {
    const value = String(label || '').toLowerCase();
    if (value.includes('bleed')) return 'bleed';
    if (value.includes('fire') || value.includes('burn')) return 'fire';
    if (value.includes('poison')) return 'poison';
    if (value.includes('status') || value.includes('stun') || value.includes('slow')) return 'status';
    if (value.includes('projectile') || value.includes('homing') || value.includes('burst') || value.includes('missile')) return 'projectile';
    if (value.includes('beam')) return 'beam';
    if (value.includes('heal') || value.includes('recovery') || value.includes('regen')) return 'heal';
    if (value.includes('charge')) return 'charge';
    if (value.includes('aoe')) return 'aoe';
    if (value.includes('defense')) return 'defense';
    if (value.includes('speed')) return 'speed';
    return value.replace(/[^a-z0-9_]+/g, '_');
  }

  function getOfferSynergyTags(kind, key, chips = []) {
    const tags = new Set();
    if (kind === 'item') {
      const itemTags = Neo.ITEM_DEFS?.[key]?.tags || Neo.itemRegistry?.get?.(key)?.tags || [];
      const tagList = itemTags instanceof Set ? [...itemTags] : itemTags;
      if (Array.isArray(tagList)) tagList.forEach(tag => tags.add(normalizeOfferTag(tag)));
    }
    if (kind === 'weapon' && Neo.isProjectileWeaponKey?.(key)) tags.add('projectile');
    chips.forEach(chip => {
      const tag = normalizeOfferTag(chip?.label);
      if (tag) tags.add(tag);
    });
    return tags;
  }

  function getOfferBuildMatch(kind, key, chips = []) {
    const activeTags = Neo.getActiveBuildTags?.(Neo.player, 2) || [];
    if (!activeTags.length) return null;
    const offerTags = getOfferSynergyTags(kind, key, chips);
    const match = activeTags.find(entry => offerTags.has(normalizeOfferTag(entry.tag)));
    return match || null;
  }

  function buildOfferBuildChip(kind, key, chips = []) {
    const match = getOfferBuildMatch(kind, key, chips);
    if (!match) return null;
    return { label: `${match.tag.replace(/_/g, ' ')} build`, tone: 'item' };
  }

  function isOfferRecommended(kind, key, chips = []) {
    if (!Neo.player) return false;
    const itemStats = Neo.getItemStats?.() || {};
    const projectileBuild = !!Neo.isProjectileWeaponKey?.(Neo.player.equippedWeapon)
      || Number(itemStats.projectileHomingStrength || 0) > 0
      || Number(itemStats.projectileCountBonus || 0) > 0;
    const labels = chips.map(chip => String(chip?.label || '').toLowerCase());
    if (getOfferBuildMatch(kind, key, chips)) return true;
    if (projectileBuild && kind === 'weapon' && Neo.isProjectileWeaponKey?.(key)) return true;
    if (projectileBuild && labels.some(label => label.includes('magnet') || label.includes('homing') || label.includes('projectile'))) return true;
    if (kind === 'move') {
      const slot = Neo.MOVE_DEFS?.[key]?.slot;
      if (slot && !Neo.player.equippedMoves?.[slot]) return true;
    }
    return false;
  }

  function getShopTradeState(tradeOffer, noItemsChallenge = false) {
    if (!tradeOffer || tradeOffer.unavailable || !tradeOffer.key) {
      return {
        canAfford: false,
        disabled: true,
        showUnaffordable: false,
        status: 'locked',
        statusLabel: 'No trade',
        bought: !!tradeOffer?.bought,
      };
    }
    const costKeys = Array.isArray(tradeOffer.costKeys) ? tradeOffer.costKeys : [];
    const hasCosts = costKeys.length >= 2 && costKeys.every(key => Number(Neo.player?.items?.[key] || 0) > 0);
    const disabled = !!tradeOffer.bought || noItemsChallenge || !hasCosts;
    return {
      canAfford: hasCosts && !noItemsChallenge && !tradeOffer.bought,
      disabled,
      showUnaffordable: !hasCosts && !tradeOffer.bought,
      status: tradeOffer.bought ? 'owned' : noItemsChallenge ? 'locked' : hasCosts ? 'available' : 'short',
      statusLabel: tradeOffer.bought ? 'Done' : noItemsChallenge ? 'Locked' : hasCosts ? 'Ready' : 'Missing relic',
      bought: !!tradeOffer.bought,
    };
  }

  function renderShopTradeCard(noItemsChallenge = false) {
    const tradeOffer = Neo.ensureShopTradeOffer?.(Neo.currentRoom) || Neo.currentRoom?.shopTradeOffer;
    if (!tradeOffer || tradeOffer.unavailable || !tradeOffer.key) return '';
    const item = Neo.itemRegistry.get(tradeOffer.key) || Neo.ITEM_DEFS[tradeOffer.key];
    const costKeys = Array.isArray(tradeOffer.costKeys) ? tradeOffer.costKeys.slice(0, 2) : [];
    const costNames = costKeys.map(key => Neo.itemRegistry.get(key)?.name || Neo.titleCase?.(key) || key);
    const state = getShopTradeState(tradeOffer, noItemsChallenge);
    const description = noItemsChallenge
      ? 'No Items challenge is active. Trades are disabled for this run.'
      : `Hand over ${costNames.join(' + ')} to receive this higher-rarity relic.`;
    const buttonText = noItemsChallenge
      ? 'Trades Locked'
      : tradeOffer.bought
        ? 'Traded'
        : state.canAfford
          ? 'Trade Relics'
          : 'Missing Relics';
    // Visual "give -> get" exchange row so it is obvious which relics you hand over.
    const giveTiles = costKeys.map(key => {
      const giveItem = Neo.itemRegistry.get(key) || Neo.ITEM_DEFS[key];
      const giveName = giveItem?.name || Neo.titleCase?.(key) || key;
      const owned = Number(Neo.player?.items?.[key] || 0) > 0;
      const tone = giveItem?.rarity || giveItem?.category || '';
      const accent = tone ? Neo.getRarityNameColor(tone) : '';
      const accentStyle = accent ? ` style="--shop-card-accent:${escapeShopText(accent)}"` : '';
      return `<div class="shop-trade__tile${owned ? '' : ' shop-trade__tile--missing'}"${accentStyle}>
        <canvas class="shop-trade__icon" data-item-icon="${escapeShopText(key)}" width="34" height="34"></canvas>
        <span class="shop-trade__tile-name">${escapeShopText(giveName)}</span>
      </div>`;
    }).join('<span class="shop-trade__plus">+</span>');
    const getItem = item;
    const getAccent = Neo.getRarityNameColor(getItem?.rarity || getItem?.category) || '';
    const getAccentStyle = getAccent ? ` style="--shop-card-accent:${escapeShopText(getAccent)}"` : '';
    const getTile = `<div class="shop-trade__tile shop-trade__tile--get"${getAccentStyle}>
      <canvas class="shop-trade__icon" data-item-icon="${escapeShopText(tradeOffer.key)}" width="34" height="34"></canvas>
      <span class="shop-trade__tile-name">${escapeShopText(getItem?.name || 'Relic')}</span>
    </div>`;
    const footerExtra = noItemsChallenge ? '' : `<div class="shop-trade">
      <div class="shop-trade__side shop-trade__side--give">
        <span class="shop-trade__label">You give</span>
        <div class="shop-trade__tiles">${giveTiles}</div>
      </div>
      <span class="shop-trade__arrow" aria-hidden="true">➜</span>
      <div class="shop-trade__side shop-trade__side--get">
        <span class="shop-trade__label">You get</span>
        <div class="shop-trade__tiles">${getTile}</div>
      </div>
    </div>`;
    return renderShopCard({
      rarityLabel: 'Trade',
      iconAttr: 'data-item-icon',
      iconKey: tradeOffer.key,
      title: item?.name || 'Trade Relic',
      titleColor: Neo.getRarityNameColor(item?.rarity || item?.category),
      descColor: Neo.getRarityNameColor(item?.rarity || item?.category),
      accentColor: Neo.getRarityNameColor(item?.rarity || item?.category),
      cost: costNames.join(' + '),
      description,
      chips: [
        { label: 'Merchant', tone: 'item' },
        item?.rarity ? { label: Neo.getRarityDisplayName?.(item.rarity) || item.rarity, tone: 'rarity' } : null,
        { label: '2-for-1', tone: 'item' },
      ].filter(Boolean),
      footerExtra,
      recommended: true,
      kind: 'trade',
      state,
      buttonText,
      soldStateText: 'TRADED',
    });
  }



  function renderShopCard({
    rarityLabel,
    iconAttr,
    iconKey,
    title,
    titleColor,
    descColor = '', // description text stays white regardless of rarity
    cost,
    description,
    footerExtra = '',
    chips = [],
    stats = [],
    accentColor = '',
    iconSize = 40,
    recommended = false,
    soldStateText = 'SOLD',
    kind,
    index,
    state,
    buttonText,
    buttonExtraAttrs = '',
  }) {
    const safeKind = escapeShopText(kind || 'offer');
    const safeIconAttr = escapeShopText(iconAttr);
    const indexAttr = Number.isInteger(index) ? ` data-index="${index}"` : '';
    const styleAttr = accentColor ? ` style="--shop-card-accent:${escapeShopText(accentColor)}"` : '';
    const titleStyle = titleColor ? ` style="color:${escapeShopText(titleColor)}"` : '';
    const descStyle = ' style="color:#ffffff"'; // descriptions always render white; rarity only colors the title
    const status = state.status || 'available';
    const statusLabel = state.statusLabel || '';
    const chipHtml = renderShopChips(chips.length ? chips : [rarityLabel]);
    const statsHtml = renderShopStats(stats);
    return `<div class="shop-card shop-card--${safeKind} shop-card--status-${escapeShopText(status)}${state.showUnaffordable ? ' shop-card--unaffordable' : ''}${state.canAfford && !state.disabled ? ' shop-card--affordable' : ''}${recommended ? ' shop-card--recommended' : ''}${state.bought ? ' shop-card--just-bought' : ''}"${styleAttr}>
      <div class="shop-card__top">
        <span class="shop-card__icon-frame">
          <canvas class="shop-card__icon" ${safeIconAttr}="${escapeShopText(iconKey)}" width="${iconSize}" height="${iconSize}"></canvas>
        </span>
        <div class="shop-card__heading">
          <span class="shop-card__eyebrow">${escapeShopText(rarityLabel)}</span>
          <h4${titleStyle}>${escapeShopText(title)}</h4>
        </div>
        <span class="shop-card__price">${escapeShopText(cost)}</span>
      </div>

      <div class="shop-card__copy">
        <p${descStyle}>${escapeShopText(description)}</p>
      </div>
      ${statsHtml}
      ${footerExtra}
      <div class="shop-card__footer">
        <button class="shop-buy${state.showUnaffordable ? ' shop-buy--unaffordable' : ''}" data-kind="${safeKind}"${indexAttr} ${buttonExtraAttrs} ${state.disabled ? 'disabled' : ''}>${escapeShopText(buttonText)}</button>
      </div>
      ${(state.bought || status === 'owned') ? `<span class="shop-card__stamp">${escapeShopText(soldStateText)}</span>` : ''}
    </div>`;
  }

  function drawShopIcons(container, dataAttr, drawIcon, resolveDef) {
    container?.querySelectorAll(`[${dataAttr}]`).forEach(canvas => {
      const key = canvas.getAttribute(dataAttr);
      drawIcon(canvas, resolveDef(key));
    });
  }

  function ensurePanelRenderCache() {
    if (!Neo._uiPanelRenderCache || typeof Neo._uiPanelRenderCache !== 'object') {
      Neo._uiPanelRenderCache = {
        shop: { tabSigs: {} },
        inventory: { tabSigs: {}, buildSummarySig: '' },
      };
    }
    return Neo._uiPanelRenderCache;
  }

  function hasRenderedChildren(node) {
    return !!node && node.childElementCount > 0;
  }

  function getTruthyKeys(map) {
    if (!map || typeof map !== 'object') return '';
    const keys = [];
    for (const key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key) && map[key]) keys.push(key);
    }
    return keys.join(',');
  }

  function getCountedKeys(map) {
    if (!map || typeof map !== 'object') return '';
    const entries = [];
    for (const key in map) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
      const amount = Number(map[key] || 0);
      if (amount > 0) entries.push(`${key}:${Math.round(amount)}`);
    }
    return entries.join(',');
  }

  function getShopTabContainer(tabKey) {
    if (tabKey === 'items') return Neo.ui.shopItems;
    if (tabKey === 'weapons') return Neo.ui.shopWeapons;
    if (tabKey === 'moves') return Neo.ui.shopMoves;
    if (tabKey === 'trades') return Neo.ui.shopTrades;
    return Neo.ui.shopHeals;
  }

  function buildShopTabSignature(tabKey, noItemsChallenge) {
    const coins = Number(Neo.player?.coins || 0);
    if (tabKey === 'items') {
      const offers = (Neo.shopOffers || []).filter(offer => offer.type === 'item');
      return `items|${coins}|${noItemsChallenge ? 1 : 0}|held:${getCountedKeys(Neo.player?.items)}|${offers.map(o => `${o.key}:${o.cost}:${o.bought ? 1 : 0}`).join(';')}`;
    }
    if (tabKey === 'trades') {
      const trade = Neo.currentRoom?.shopTradeOffer || {};
      const tradeSig = `${trade.key || ''}:${(trade.costKeys || []).join(',')}:${trade.bought ? 1 : 0}:${trade.unavailable ? 1 : 0}`;
      return `trades|${coins}|${noItemsChallenge ? 1 : 0}|held:${getCountedKeys(Neo.player?.items)}|trade:${tradeSig}`;
    }
    if (tabKey === 'weapons') {
      const offers = Neo.currentRoom?.shopWeaponOffers || [];
      return `weapons|${coins}|${getTruthyKeys(Neo.player?.ownedWeapons)}|${offers.map(o => `${o.key}:${o.cost}:${o.bought ? 1 : 0}`).join(';')}`;
    }
    if (tabKey === 'moves') {
      const offers = Neo.currentRoom?.shopMoveOffers || [];
      return `moves|${coins}|${Neo.player?.character || ''}|${getTruthyKeys(Neo.player?.ownedMoves)}|${offers.map(o => `${o.key}:${o.cost}:${o.bought ? 1 : 0}`).join(';')}`;
    }
    const potionCap = Number(Neo.getPotionCarryCap?.() || 0);
    const storedPotions = Number(Neo.player?.storedPotions || 0);
    const hp = Math.round(Number(Neo.player?.hp || 0));
    const maxHp = Math.round(Number(Neo.player?.maxHp || 1));
    return `heals|${coins}|${hp}|${maxHp}|${potionCap}|${storedPotions}|${Neo.getShopHealCost('small')}|${Neo.getShopHealCost('major')}`;
  }

  function getInventoryTabContainer(tabKey) {
    const id = tabKey === 'stats'
      ? 'invTabStats'
      : tabKey === 'items'
        ? 'invTabItems'
        : tabKey === 'tools'
          ? 'invTabTools'
          : tabKey === 'weapons'
            ? 'invTabWeapons'
            : tabKey === 'rivals'
              ? 'invTabRivals'
              : 'invTabEquipped';
    return document.getElementById(id);
  }

  function buildInventoryBuildSummarySignature(playerRef) {
    if (!playerRef) return 'build:none';
    const moveSig = (Neo.MOVE_SLOTS || [])
      .map(slot => `${slot}:${playerRef.equippedMoves?.[slot] || ''}`)
      .join('|');
    return `build|p:${Neo.activeInvPlayer}|w:${playerRef.equippedWeapon || ''}|m:${moveSig}`;
  }

  function buildInventoryTabSignature(tabKey, playerRef, extraBatteryPendingCount) {
    if (!playerRef) return `tab:${tabKey}:none`;
    const equippedWeapon = playerRef.equippedWeapon || '';
    if (tabKey === 'stats') {
      return [
        'stats',
        Number(playerRef.level || 1),
        equippedWeapon,
        Math.round(Number(playerRef.hp || 0)),
        Math.round(Number(playerRef.maxHp || 0)),
        Math.round(Number(playerRef.attackPower || 0)),
        Number(Neo.getAttackSpeedValue?.() || 1).toFixed(3),
        getCountedKeys(playerRef.items),
      ].join('|');
    }
    if (tabKey === 'items') {
      const pending = (Neo.getPendingUiItems?.(playerRef) || []).map(entry => `${entry.key}:${entry.count}`).join(',');
      return `items|${getCountedKeys(playerRef.items)}|${playerRef.character || ''}|pending:${pending}`;
    }
    if (tabKey === 'tools') {
      const order = Array.isArray(playerRef.equipmentSlots) ? playerRef.equipmentSlots.join(',') : '';
      return `tools|${getCountedKeys(playerRef.items)}|order:${order}`;
    }
    if (tabKey === 'weapons') {
      return `weapons|eq:${playerRef.equippedWeapon || ''}|owned:${getTruthyKeys(playerRef.ownedWeapons)}`;
    }
    if (tabKey === 'rivals') {
      const live = (Neo.rivals || []).map(rival => rival && !rival.dead
        ? `${rival.rivalId}:${rival.level}:${rival.lives}:${Math.round(rival.hp)}:${(rival.relationship || 0).toFixed(1)}:${rival.friend ? 1 : 0}:${rival.vendetta ? 1 : 0}:${Number(rival.aggroTimer || 0) > 0 ? 1 : 0}:${Array.isArray(rival.loot) ? rival.loot.length : 0}`
        : '').join(',');
      const pending = (Neo.pendingRivalReturns || []).map(entry => `${entry?.rival?.rivalId || ''}@${entry?.returnFloor || 0}:${Array.isArray(entry?.rival?.loot) ? entry.rival.loot.length : 0}`).join(',');
      return `rivals|${live}|ret:${pending}|slain:${(Neo.slainRivalKeys || []).join(',')}`;
    }
    const ownedMoves = getTruthyKeys(playerRef.ownedMoves);
    const equipped = (Neo.MOVE_SLOTS || []).map(slot => `${slot}:${playerRef.equippedMoves?.[slot] || ''}`).join(',');
    return `equipped|w:${equippedWeapon}|owned:${ownedMoves}|eq:${equipped}|slot:${Neo.activeInventorySlot || ''}|bat:${Math.max(0, Math.floor(Number(extraBatteryPendingCount || 0)))}`;
  }

export function renderShopPanel() {
    if (!Neo.ui.shopPanel || !Neo.player) return;
  if (!isPanelOpen(Neo.ui.shopPanel)) return;
    Neo.refreshShopVoucherBanner?.();
    Neo.refreshRoomShopCosts(Neo.currentRoom);
    Neo.shopOffers = Neo.currentRoom?.shopOffers || Neo.shopOffers;
    const noItemsChallenge = Neo.isChallengeActive('no_items');
    Neo.ui.shopTabs.forEach(tab => {
      const isActive = tab.dataset.tab === Neo.activeShopTab;
      tab.classList.toggle('active', isActive);
    });
    Neo.ui.shopItems.classList.toggle('hidden', Neo.activeShopTab !== 'items');
    Neo.ui.shopWeapons?.classList.toggle('hidden', Neo.activeShopTab !== 'weapons');
    Neo.ui.shopMoves.classList.toggle('hidden', Neo.activeShopTab !== 'moves');
    Neo.ui.shopTrades?.classList.toggle('hidden', Neo.activeShopTab !== 'trades');
    Neo.ui.shopHeals.classList.toggle('hidden', Neo.activeShopTab !== 'heals');
    const panelRenderCache = ensurePanelRenderCache();
    const activeShopTab = Neo.activeShopTab || 'items';
    const activeShopTabContainer = getShopTabContainer(activeShopTab);
    const activeShopSig = buildShopTabSignature(activeShopTab, noItemsChallenge);
    if (panelRenderCache.shop.tabSigs[activeShopTab] === activeShopSig && hasRenderedChildren(activeShopTabContainer)) {
      Neo.shopPanelDirty = false;
      return;
    }
    if (Neo.activeShopTab === 'items') {
      const itemCards = Neo.shopOffers
        .filter(offer => offer.type === 'item')
        .map((offer, index) => {
          const item = Neo.itemRegistry.get(offer.key) || Neo.ITEM_DEFS[offer.key];
          const state = getShopPurchaseState(offer, { blocked: noItemsChallenge });
          const description = noItemsChallenge
            ? 'No Items challenge is active. Relic buys are disabled for this run.'
            : item?.description || 'No details available.';
          const descriptorChips = buildDescriptorChips(offer.key, description, { kind: 'item' });
          const baseChips = [
            item?.tool ? { label: 'Tool', tone: 'tool' } : { label: 'Relic', tone: 'rarity' },
            item?.rarity ? { label: Neo.getRarityDisplayName?.(item.rarity) || item.rarity, tone: 'rarity' } : null,
            item?.category ? { label: Neo.getRarityDisplayName?.(item.category) || item.category, tone: 'item' } : null,
            ...descriptorChips,
          ].filter(Boolean);
          const chips = [
            ...baseChips,
            buildOfferBuildChip('item', offer.key, baseChips),
          ].filter(Boolean).slice(0, 5);
          const buttonText = noItemsChallenge ? 'Relics Locked' : state.bought ? 'Sold' : !state.canAfford ? 'Too Expensive' : 'Buy Relic';
          return renderShopCard({
            rarityLabel: 'Relic',
            iconAttr: 'data-item-icon',
            iconKey: offer.key,
            title: item?.name || 'Item',
            titleColor: Neo.getRarityNameColor(item?.rarity || item?.category),
            descColor: Neo.getRarityNameColor(item?.rarity || item?.category),
            accentColor: Neo.getRarityNameColor(item?.rarity || item?.category),
            cost: offer.cost,
            description,
            chips,
            recommended: isOfferRecommended('item', offer.key, chips),
            kind: 'item',
            index,
            state,
            buttonText,
            soldStateText: 'OWNED',
          });
        })
        .join('');
      Neo.ui.shopItems.innerHTML = itemCards || '<div class="shop-card shop-empty"><p>Every relic here is already yours. Clear the floor or check the move shelf.</p></div>';
      Neo.drawItemIconCanvases?.(Neo.ui.shopItems, 'data-item-icon');
      panelRenderCache.shop.tabSigs.items = activeShopSig;
    } else if (Neo.activeShopTab === 'trades') {
      const tradeCard = renderShopTradeCard(noItemsChallenge);
      Neo.ui.shopTrades.innerHTML = tradeCard || '<div class="shop-card shop-empty"><p>No relic trade is on offer in this shop.</p></div>';
      Neo.drawItemIconCanvases?.(Neo.ui.shopTrades, 'data-item-icon');
      panelRenderCache.shop.tabSigs.trades = activeShopSig;
    } else if (Neo.activeShopTab === 'weapons') {
      const weaponOffers = getShopWeaponOffers();
      const weaponCards = weaponOffers
        .map((offer, index) => {
          const weapon = Neo.WEAPON_DEFS[offer.key];
          const owned = !!Neo.player.ownedWeapons?.[offer.key];
          const state = getShopPurchaseState(offer, { owned });
          const description = weapon?.description || 'No weapon description available.';
          const baseChips = [
            ...buildWeaponShopChips(offer.key, weapon),
            ...buildDescriptorChips(offer.key, description, { kind: 'weapon' }),
          ];
          const chips = [
            ...baseChips,
            buildOfferBuildChip('weapon', offer.key, baseChips),
          ].filter(Boolean).slice(0, 5);
          const buttonText = state.bought || owned ? 'Owned' : !state.canAfford ? 'Too Expensive' : 'Buy Weapon';
          return renderShopCard({
            rarityLabel: weapon?.rarity || 'weapon',
            iconAttr: 'data-weapon-icon',
            iconKey: offer.key,
            title: weapon?.name || offer.key,
            titleColor: Neo.getRarityNameColor(weapon?.rarity),
            descColor: Neo.getRarityNameColor(weapon?.rarity),
            accentColor: Neo.getRarityNameColor(weapon?.rarity),
            cost: offer.cost,
            description,
            chips,
            stats: buildWeaponShopStats(offer.key),
            recommended: isOfferRecommended('weapon', offer.key, chips),
            kind: 'weapon',
            index,
            state,
            buttonText,
            soldStateText: 'OWNED',
          });
        })
        .join('');
      if (Neo.ui.shopWeapons) {
        Neo.ui.shopWeapons.innerHTML = weaponCards || '<div class="shop-card shop-empty"><p>No weapons in stock right now.</p></div>';
        drawShopIcons(Neo.ui.shopWeapons, 'data-weapon-icon', Neo.drawWeaponToastIcon, key => Neo.WEAPON_DEFS[key]);
      }
      panelRenderCache.shop.tabSigs.weapons = activeShopSig;
    } else if (Neo.activeShopTab === 'moves') {
      const moveOffers = getShopMoveOffers();
      const moveCards = moveOffers
        .map((offer, index) => {
          const def = Neo.MOVE_DEFS[offer.key];
          const owned = !!Neo.player.ownedMoves?.[offer.key];
          const state = getShopPurchaseState(offer, { owned });
          const slotLabel = Neo.SLOT_LABELS[def?.slot] || def?.slot || 'move';
          const currentMoveKey = Neo.player.equippedMoves?.[def?.slot];
          const currentMoveName = currentMoveKey ? (Neo.MOVE_DEFS[currentMoveKey]?.name || currentMoveKey) : null;
          const descriptorChips = buildDescriptorChips(offer.key, def?.desc || '', { slot: def?.slot, kind: 'move' });
          const moveChips = [
            { label: slotLabel, tone: 'move' },
            def?.exclusiveCharacter ? { label: def.exclusiveCharacter, tone: 'exclusive' } : null,
            ...descriptorChips,
          ].filter(Boolean);
          const chips = [
            ...moveChips,
            buildOfferBuildChip('move', offer.key, moveChips),
          ].filter(Boolean).slice(0, 5);
          const buttonText = state.bought || owned ? 'Owned' : !state.canAfford ? 'Too Expensive' : 'Buy Move';
          return renderShopCard({
            rarityLabel: slotLabel,
            iconAttr: 'data-move-icon',
            iconKey: offer.key,
            title: def?.name || offer.key,
            cost: offer.cost,
            description: def?.desc || 'No move description available.',
            chips,
            stats: buildMoveShopStats(offer.key),
            recommended: isOfferRecommended('move', offer.key, chips),
            kind: 'move',
            index,
            state,
            buttonText,
            soldStateText: 'OWNED',
          });
        })
        .join('');
      Neo.ui.shopMoves.innerHTML = moveCards || '<div class="shop-card shop-empty"><p>No new techniques are on the rack right now.</p></div>';
      drawShopIcons(Neo.ui.shopMoves, 'data-move-icon', Neo.drawMoveToastIcon, key => Neo.MOVE_DEFS[key]);
      panelRenderCache.shop.tabSigs.moves = activeShopSig;
    } else if (Neo.activeShopTab === 'heals') {
      const heals = [
        { id: 'small', name: 'Minor Heal', heal: Neo.scalePotionHealing(45, 24), cost: Neo.getShopHealCost('small') },
        { id: 'major', name: 'Major Heal', heal: Neo.scalePotionHealing(100, 52), cost: Neo.getShopHealCost('major') },
      ];
      const potionCap = Neo.getPotionCarryCap();
      const storedPotions = Number(Neo.player.storedPotions || 0);
      const canHealNow = Neo.player.hp < Neo.player.maxHp;
      const canStorePotion = !canHealNow && potionCap > 0 && storedPotions < potionCap;
      const healCards = heals
        .map(heal => {
          const canAfford = Neo.player.coins >= heal.cost;
          const canUseRecovery = canHealNow || canStorePotion;
          const disabled = !canAfford || !canUseRecovery;
          const copy = canHealNow
            ? `Restore ${heal.heal} HP and stabilize before the next encounter.`
            : canStorePotion
              ? `Store one potion in Mateo's Bag (${storedPotions}/${potionCap}).`
              : 'Already at full health.';
          const buttonText = !canAfford ? 'Too Expensive' : canHealNow ? 'Buy Heal' : canStorePotion ? 'Store Potion' : 'Full Health';
          const state = {
            canAfford,
            disabled,
            showUnaffordable: !canAfford,
            status: !canAfford ? 'short' : disabled ? 'locked' : 'available',
            statusLabel: !canAfford ? 'Need coins' : disabled ? 'Full' : 'Ready',
          };
          return renderShopCard({
            rarityLabel: 'Recovery',
            iconAttr: 'data-heal-icon',
            iconKey: heal.id,
            title: heal.name,
            cost: heal.cost,
            description: copy,
            chips: [
              { label: 'Recovery', tone: 'heal' },
              canStorePotion ? { label: 'Store', tone: 'heal' } : null,
            ],
            stats: [{ label: 'HP', value: `+${heal.heal}` }],
            kind: 'heal',
            state,
            buttonText,
            buttonExtraAttrs: `data-heal="${heal.heal}" data-cost="${heal.cost}"`,
          });
        })
        .join('');
      Neo.ui.shopHeals.innerHTML = healCards;
      Neo.ui.shopHeals.querySelectorAll('[data-heal-icon]').forEach(canvas => {
        Neo.drawHealToastIcon(canvas, canvas.dataset.healIcon);
      });
      panelRenderCache.shop.tabSigs.heals = activeShopSig;
    }
    Neo.shopPanelDirty = false;
  }

export function renderInventoryPanel() {
    if (!Neo.ui.invPanel || !Neo.player) return;
  if (!isPanelOpen(Neo.ui.invPanel)) return;

    // Resolve which player to display
    const _invPlayers = [Neo.player, Neo.player2, Neo.player3, Neo.player4];
    const _invP = _invPlayers[Neo.activeInvPlayer - 1] || Neo.player;
  const extraBatteryPendingCount = Math.max(0, Math.floor(Number(_invP.extraBatteryPendingCount || 0)));

    if (Neo.gameMode === 'coop' && (Neo.player2 || Neo.player3 || Neo.player4)) updateInvPlayerTabVisibility();

    Neo.ui.invTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.invTab === Neo.activeInvTab);
    });
    const tabPanels = { stats: 'invTabStats', items: 'invTabItems', tools: 'invTabTools', weapons: 'invTabWeapons', equipped: 'invTabEquipped', rivals: 'invTabRivals' };
    Object.entries(tabPanels).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', key !== Neo.activeInvTab);
    });

    const panelRenderCache = ensurePanelRenderCache();

    if (Neo.ui.invBuildSummary) {
      const buildSummarySig = buildInventoryBuildSummarySignature(_invP);
      const weaponKey = _invP.equippedWeapon || '';
      const weapon = Neo.WEAPON_DEFS[weaponKey];
      if (panelRenderCache.inventory.buildSummarySig !== buildSummarySig || !hasRenderedChildren(Neo.ui.invBuildSummary)) {
        const weaponIcon = weaponKey
          ? `<canvas class="inv-build-card__icon" data-weapon-icon="${weaponKey}" width="32" height="32"></canvas>`
          : '<canvas class="inv-build-card__icon inv-build-card__icon--empty" data-inv-ui-icon="empty-weapon" width="32" height="32"></canvas>';
        const weaponCard = `<button class="inv-build-card inv-build-card--weapon${weapon ? '' : ' is-empty'}" type="button" data-inv-tab-jump="weapons">
          ${weaponIcon}
          <span class="inv-build-card__meta">
            <span class="inv-build-card__label">Weapon</span>
            <b style="color:${Neo.getRarityNameColor(weapon?.rarity)}">${weapon?.name || 'Default Melee'}</b>
          </span>
        </button>`;
        const moveCards = Neo.MOVE_SLOTS.map(slot => {
          const moveKey = _invP.equippedMoves?.[slot] || '';
          const def = Neo.MOVE_DEFS[moveKey];
          const slotLabel = Neo.SLOT_LABELS[slot] || slot;
          const slotKey = Neo.getSlotKeyLabel(slot);
          const icon = moveKey
            ? `<canvas class="inv-build-card__icon" data-move-icon="${moveKey}" width="32" height="32"></canvas>`
            : '<canvas class="inv-build-card__icon inv-build-card__icon--empty" data-inv-ui-icon="empty-move" width="32" height="32"></canvas>';
          return `<button class="inv-build-card${def ? '' : ' is-empty'}" type="button" data-build-slot="${slot}" data-inv-tab-jump="equipped">
            ${icon}
            <span class="inv-build-card__meta">
              <span class="inv-build-card__label">${slotLabel}${slotKey ? ` / ${slotKey}` : ''}</span>
              <b>${def?.name || 'Empty Slot'}</b>
            </span>
          </button>`;
        }).join('');
        Neo.ui.invBuildSummary.innerHTML = weaponCard + moveCards;
        Neo.ui.invBuildSummary.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
          Neo.drawWeaponToastIcon(canvas, Neo.WEAPON_DEFS[canvas.dataset.weaponIcon]);
        });
        Neo.ui.invBuildSummary.querySelectorAll('[data-move-icon]').forEach(canvas => {
          Neo.drawMoveToastIcon(canvas, Neo.MOVE_DEFS[canvas.dataset.moveIcon]);
        });
        Neo.ui.invBuildSummary.querySelectorAll('[data-inv-ui-icon]').forEach(canvas => {
          Neo.drawInventoryUiIcon?.(canvas, canvas.dataset.invUiIcon);
        });
        panelRenderCache.inventory.buildSummarySig = buildSummarySig;
      }
    }

    const activeInvTab = Neo.activeInvTab || 'stats';
    const activeInvSig = buildInventoryTabSignature(activeInvTab, _invP, extraBatteryPendingCount);
    const activeInvTabContainer = getInventoryTabContainer(activeInvTab);
    if (panelRenderCache.inventory.tabSigs[activeInvTab] === activeInvSig && hasRenderedChildren(activeInvTabContainer)) {
      Neo.inventoryPanelDirty = false;
      return;
    }

    if (Neo.activeInvTab === 'stats') {
      const stats = Neo.getItemStats();
      const hpPct = Math.round(_invP.hp) / Math.round(_invP.maxHp);
      const hpColor = hpPct > 0.6 ? '#6dde88' : hpPct > 0.3 ? '#f5c842' : '#ff6b6b';
      const critPct = Math.round(Number(stats.displayedCritChance ?? stats.critChance ?? 0) * 100);
      const critColor = critPct >= 30 ? '#f5a623' : critPct >= 10 ? '#e8f4ff' : '#8ca8c0';
      const atkSpeed = Neo.getAttackSpeedValue();
      const atkSpeedColor = atkSpeed >= 2 ? '#6dde88' : atkSpeed >= 1.2 ? '#e8f4ff' : '#8ca8c0';
      const dmgReduction = Math.round(stats.damageReduction * 100);
      const flatDmgReduction = Math.round(Number(stats.flatDamageReduction || 0));
      const bleedResistance = Math.round((stats.bleedResistance || 0) * 100);
      const displayedBleedChance = Number(stats.displayedBleedChance ?? stats.bleedChance ?? 0);
      const barrier = Math.round(Number(_invP.overhealBarrier || 0));
      const activeBuildTags = (stats.buildTags || []).slice(0, 3).map(entry => `${entry.tag.replace(/_/g, ' ')} ${entry.count}`).join(' / ');
      Neo.ui.invStats.innerHTML = [
        `<div class="inv-stat-row inv-stat-row--bar"><canvas class="inv-stat-row__icon" data-inv-ui-icon="hp" width="36" height="36" aria-hidden="true"></canvas><div class="inv-stat-row__body"><span class="inv-stat-row__label">HP</span><span class="inv-stat-row__value" style="color:${hpColor}">${Math.round(_invP.hp)} <span class="inv-stat-row__sub">/ ${Math.round(_invP.maxHp)}</span></span></div><div class="inv-stat-row__bar"><div class="inv-stat-row__bar-fill" style="width:${Math.round(hpPct*100)}%;background:${hpColor}"></div></div></div>`,
        barrier > 0 ? `<div class="inv-stat-row"><canvas class="inv-stat-row__icon" data-inv-ui-icon="defense" width="36" height="36" aria-hidden="true"></canvas><div class="inv-stat-row__body"><span class="inv-stat-row__label">Overheal Barrier</span><span class="inv-stat-row__value" style="color:#9cefff">${barrier}</span></div></div>` : '',
        `<div class="inv-stat-row"><canvas class="inv-stat-row__icon" data-inv-ui-icon="attack" width="36" height="36" aria-hidden="true"></canvas><div class="inv-stat-row__body"><span class="inv-stat-row__label">Attack Power</span><span class="inv-stat-row__value">${_invP.attackPower}</span></div></div>`,
        `<div class="inv-stat-row"><canvas class="inv-stat-row__icon" data-inv-ui-icon="speed" width="36" height="36" aria-hidden="true"></canvas><div class="inv-stat-row__body"><span class="inv-stat-row__label">Attack Speed</span><span class="inv-stat-row__value" style="color:${atkSpeedColor}">${atkSpeed.toFixed(2)}x</span></div></div>`,
        `<div class="inv-stat-row"><canvas class="inv-stat-row__icon" data-inv-ui-icon="crit" width="36" height="36" aria-hidden="true"></canvas><div class="inv-stat-row__body"><span class="inv-stat-row__label">Crit Chance</span><span class="inv-stat-row__value" style="color:${critColor}">${critPct}%</span></div></div>`,
        dmgReduction > 0 ? `<div class="inv-stat-row"><canvas class="inv-stat-row__icon" data-inv-ui-icon="defense" width="36" height="36" aria-hidden="true"></canvas><div class="inv-stat-row__body"><span class="inv-stat-row__label">Damage Reduction</span><span class="inv-stat-row__value" style="color:#6dde88">${dmgReduction}%</span></div></div>` : '',
        flatDmgReduction > 0 ? `<div class="inv-stat-row"><canvas class="inv-stat-row__icon" data-inv-ui-icon="defense" width="36" height="36" aria-hidden="true"></canvas><div class="inv-stat-row__body"><span class="inv-stat-row__label">Flat Damage Reduction</span><span class="inv-stat-row__value" style="color:#6dde88">${flatDmgReduction}</span></div></div>` : '',
        bleedResistance > 0 ? `<div class="inv-stat-row"><canvas class="inv-stat-row__icon" data-inv-ui-icon="bleed" width="36" height="36" aria-hidden="true"></canvas><div class="inv-stat-row__body"><span class="inv-stat-row__label">Bleed Resistance</span><span class="inv-stat-row__value" style="color:#f0a080">${bleedResistance}%</span></div></div>` : '',
        displayedBleedChance > 0 ? `<div class="inv-stat-row"><canvas class="inv-stat-row__icon" data-inv-ui-icon="bleed" width="36" height="36" aria-hidden="true"></canvas><div class="inv-stat-row__body"><span class="inv-stat-row__label">Bleed Chance</span><span class="inv-stat-row__value" style="color:#e05c5c">${Math.round(displayedBleedChance * 100)}%</span></div></div>` : '',
        activeBuildTags ? `<div class="inv-stat-row"><canvas class="inv-stat-row__icon" data-inv-ui-icon="item" width="36" height="36" aria-hidden="true"></canvas><div class="inv-stat-row__body"><span class="inv-stat-row__label">Build Tags</span><span class="inv-stat-row__value">${activeBuildTags}</span></div></div>` : '',
      ].join('');
      Neo.ui.invStats.querySelectorAll('[data-inv-ui-icon]').forEach(canvas => {
        Neo.drawInventoryUiIcon?.(canvas, canvas.dataset.invUiIcon);
      });
    } else if (Neo.activeInvTab === 'items') {
      Neo.ui.invItemsList.innerHTML = Object.keys(_invP.items || {})
        .filter(key => Number(_invP.items?.[key] || 0) > 0)
        .filter(key => Neo.itemRegistry?.get?.(key))
        .map(key => {
          const item = Neo.itemRegistry.get(key);
          const safeKey = Neo.escapeHtml(key);
          const pendingCount = Neo.getPendingUiItemCount?.(key, _invP) || 0;
          return `<div class="inv-card${pendingCount > 0 ? ' inv-card--unread' : ''}">
            <span class="inv-card__eyebrow">${item?.tool ? 'Tool' : 'Relic'}</span>
            <div class="inv-card__title-row">
              <span class="inv-card__icon-wrap">
                <canvas class="inv-card__icon" data-item-icon="${safeKey}" width="40" height="40"></canvas>
                ${pendingCount > 0 ? '<span class="inv-card__unread-dot" aria-hidden="true"></span>' : ''}
              </span>
              <h4 style="color:${Neo.getRarityNameColor(item?.rarity || item?.category)}">${item?.name || key}${item?.tool ? '<span class="item-tool-badge">TOOL</span>' : ''}</h4>
              <span class="inv-card__count">x${_invP.items[key]}</span>
            </div>
            <p style="color:#ffffff">${item?.description || 'No item description available.'}</p>
            ${pendingCount > 0
              ? `<button class="inv-card__open" type="button" data-open-ui-item="${safeKey}" aria-label="Open ${Neo.escapeHtml(item?.name || key)}, ${pendingCount} pending">
                  <span class="inv-card__open-dot" aria-hidden="true"></span>
                  OPEN${pendingCount > 1 ? ` (${pendingCount})` : ''}
                </button>`
              : ''}
          </div>`;
        })
        .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No relics yet</h4><p>Your pockets are clear. Loot rooms or buy from the shop to start a build.</p></div>';

      Neo.drawItemIconCanvases?.(Neo.ui.invItemsList, 'data-item-icon');
    } else if (Neo.activeInvTab === 'tools') {
      const toolKeys = Neo.getEquippedToolKeys?.() || [];
      const slotKeys = Neo.EQUIPMENT_SLOT_KEYS || [];
      if (Neo.ui.invToolsList) {
        Neo.ui.invToolsList.innerHTML = toolKeys
          .map((key, idx) => {
            const item = Neo.itemRegistry.get(key);
            const hotkey = slotKeys[idx] || '';
            const rarityColor = Neo.getRarityNameColor(item?.rarity || item?.category);
            const count = Number(_invP.items?.[key] || 0);
            return `<div class="inv-tool-card" draggable="true" data-tool-key="${key}" data-tool-idx="${idx}">
              <span class="inv-tool-card__key">${hotkey}</span>
              <canvas class="inv-tool-card__icon" data-item-icon="${key}" width="36" height="36"></canvas>
              <div class="inv-tool-card__meta">
                <b style="color:${rarityColor}">${item?.name || key}<span class="item-tool-badge">TOOL</span>${count > 1 ? ` <span class="inv-tool-card__count">x${count}</span>` : ''}</b>
                <p>${item?.description || 'No item description available.'}</p>
              </div>
              <div class="inv-tool-card__reorder">
                <button class="inv-tool-card__move" type="button" data-tool-move="up" data-tool-idx="${idx}" aria-label="Move up" ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button class="inv-tool-card__move" type="button" data-tool-move="down" data-tool-idx="${idx}" aria-label="Move down" ${idx === toolKeys.length - 1 ? 'disabled' : ''}>▼</button>
              </div>
            </div>`;
          })
          .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No tools yet</h4><p>Tools are activatable relics like Pew Pew Box or Zap to the Extreme. Their position here sets which hotkey (F, G, H…) fires them.</p></div>';
        Neo.drawItemIconCanvases?.(Neo.ui.invToolsList, 'data-item-icon');
      }
    } else if (Neo.activeInvTab === 'weapons') {
      const ownedWeapons = Neo.WEAPON_KEYS
        .filter(key => _invP.ownedWeapons?.[key])
        .sort((a, b) => {
          const order = { knight: 1, white: 1, wizard: 2, purple: 2, god: 3, red: 3 };
          const rarityA = order[Neo.WEAPON_DEFS[a]?.rarity] || 99;
          const rarityB = order[Neo.WEAPON_DEFS[b]?.rarity] || 99;
          if (rarityA !== rarityB) return rarityA - rarityB;
          return (Neo.WEAPON_DEFS[a]?.name || a).localeCompare(Neo.WEAPON_DEFS[b]?.name || b);
        });
      if (Neo.ui.invWeaponsList) {
        Neo.ui.invWeaponsList.innerHTML = ownedWeapons
          .map(key => {
            const def = Neo.WEAPON_DEFS[key];
            const equipped = _invP.equippedWeapon === key;
            return `<button class="inv-move-chip${equipped ? ' is-equipped-weapon' : ''}" data-weapon="${key}" type="button" aria-pressed="${equipped ? 'true' : 'false'}">
              <canvas class="inv-chip__icon" data-weapon-icon="${key}" width="30" height="30"></canvas>
              <div class="inv-move-chip__meta">
                <b style="color:${Neo.getRarityNameColor(def?.rarity)}">${def?.name || key}</b>
                <span class="inv-move-chip__slot">${def?.rarity || 'weapon'}</span>
              </div>
              <p>${def?.description || 'No weapon description available.'}</p>
              <div class="inv-chip-footer">
                <span class="inv-move-chip__hint">${equipped ? 'Active weapon' : 'Left-click weapon'}</span>
                <span class="inv-chip-action${equipped ? ' inv-chip-action--equipped' : ''}">${equipped ? 'Unequip' : 'Equip'}</span>
              </div>
            </button>`;
          })
          .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No weapons owned</h4><p>Buy weapons in the shop to unlock left-click weapon loadouts.</p></div>';
        Neo.ui.invWeaponsList.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
          Neo.drawWeaponToastIcon(canvas, Neo.WEAPON_DEFS[canvas.dataset.weaponIcon]);
        });
      }
    } else if (Neo.activeInvTab === 'rivals') {
      const container = document.getElementById('invRivalsList');
      if (container) {
        const relationLabel = rival => rival.friend ? 'FRIEND'
          : rival.vendetta ? 'VENDETTA'
          : Number(rival.relationship || 0) < 0 ? 'GRUDGE'
          : 'NEUTRAL';
        const relationClass = rival => rival.friend ? 'inv-rival__status--friend'
          : (rival.vendetta || Number(rival.relationship || 0) < 0) ? 'inv-rival__status--hostile'
          : '';
        const heartRow = rival => {
          const lives = Math.max(0, Number(rival.lives ?? 2));
          return '♥'.repeat(lives) + '♡'.repeat(Math.max(0, 2 - lives));
        };
        // Each rival curses the next floor when killed or when it descends alive.
        const RIVAL_SIGNATURES = {
          princess: 'Curse: 40% chance to cloud your whole map next floor.',
          thorn_knight: 'Curse: halves your crit rate & bleed chance next floor.',
          metao: 'Curse: cuts potion drops by 60% next floor.',
          gelleh: 'Curse: plants hostile holy turrets across the next floor.',
          mooggy: 'Curse: seeds the next floor with blood thorn traps.',
        };
        const signatureLine = rival => rival && !rival.friend && RIVAL_SIGNATURES[rival.characterKey]
          ? `<p class="inv-rival__signature">${RIVAL_SIGNATURES[rival.characterKey]}</p>`
          : '';
        const liveCards = (Neo.rivals || []).filter(rival => rival && !rival.dead).map(rival => {
          const activity = rival.friend ? 'Travelling with you'
            : rival.vendetta ? 'Hunting you with god gear'
            : Number(rival.aggroTimer || 0) > 0 ? 'Hunting you'
            : 'Roaming the floor';
          return `<div class="inv-card inv-rival" style="--rival-color:${rival.color}">
            <div class="inv-card__title-row">
              <span class="inv-card__eyebrow" style="color:${rival.color}">${rival.name}</span>
              <span class="inv-rival__status ${relationClass(rival)}">${relationLabel(rival)}</span>
            </div>
            <div class="inv-rival__rows">
              <span>LV ${rival.level || 1} — ${Math.max(0, Math.round(rival.hp))}/${Math.round(rival.max)} HP</span>
              <span>LIVES <b class="inv-rival__hearts">${heartRow(rival)}</b></span>
              <span>PACK ×${Array.isArray(rival.loot) ? rival.loot.length : 0} ITEMS</span>
              <span>RELATIONSHIP ${Number(rival.relationship || 0).toFixed(1)}</span>
            </div>
            <p>${activity}.</p>
            ${signatureLine(rival)}
          </div>`;
        });
        const returnCards = (Neo.pendingRivalReturns || []).filter(entry => entry?.rival).map(entry => {
          const rival = entry.rival;
          return `<div class="inv-card inv-rival inv-rival--returning" style="--rival-color:${rival.color || '#c9aaff'}">
            <div class="inv-card__title-row">
              <span class="inv-card__eyebrow" style="color:${rival.color || '#c9aaff'}">${rival.name || 'Rival'}</span>
              <span class="inv-rival__status inv-rival__status--return">RETURNS FLOOR ${entry.returnFloor}</span>
            </div>
            <div class="inv-rival__rows">
              <span>LV ${rival.level || 1}</span>
              <span>LIVES <b class="inv-rival__hearts">${heartRow(rival)}</b></span>
              <span>PACK ×${Array.isArray(rival.loot) ? rival.loot.length : 0} ITEMS</span>
              <span>RELATIONSHIP ${Number(rival.relationship || 0).toFixed(1)}</span>
            </div>
            <p>${Number(rival.relationship || 0) < 0 ? 'Holds a grudge — will return armed for revenge.' : 'Licking their wounds on a floor below.'}</p>
            ${signatureLine(rival)}
          </div>`;
        });
        const slainCards = (Neo.slainRivalKeys || []).map(key => {
          const def = Neo.RIVAL_DEFS?.[key];
          return `<div class="inv-card inv-rival inv-rival--slain">
            <div class="inv-card__title-row">
              <span class="inv-card__eyebrow">${def?.name || key}</span>
              <span class="inv-rival__status">SLAIN</span>
            </div>
            <p>All lives taken. They will not come after you again.</p>
          </div>`;
        });
        container.innerHTML = [...liveCards, ...returnCards, ...slainCards].join('')
          || '<div class="inv-card"><span class="inv-card__eyebrow">All clear</span><h4>No rivals detected</h4><p>Rival adventurers occasionally enter the dungeon to compete for loot. Their movements show up here.</p></div>';
      }
    } else if (Neo.activeInvTab === 'equipped') {
      const equippedMoveKeys = new Set(Object.values(_invP.equippedMoves || {}).filter(Boolean));
      const allOwnedMoves = Object.keys(_invP.ownedMoves || {})
        .filter(key => _invP.ownedMoves[key] && Neo.MOVE_DEFS[key] && Neo.isMoveAllowedForCharacter(key, _invP.character))
        .sort((a, b) => Neo.MOVE_DEFS[a].slot.localeCompare(Neo.MOVE_DEFS[b].slot));
      const extraBatteryNotice = extraBatteryPendingCount > 0
        ? `<div class="inv-card inv-card--battery">
            <span class="inv-card__stamp" aria-hidden="true">
              <canvas class="inv-card__stamp-icon" data-item-icon="extra_battery" width="40" height="40"></canvas>
            </span>
            <div class="inv-card__title-row">
              <span class="inv-card__eyebrow">Extra Battery</span>
              <span class="inv-card__count">${extraBatteryPendingCount} pending</span>
            </div>
            <h4>Add an extra charge to a move</h4>
            <ol class="inv-battery-steps">
              <li>Pick a move from the list below.</li>
              <li>It gains <b>+1 max charge</b> — one more use before the cooldown.</li>
              <li>Watch for the new charge pip on that move's skill card.</li>
            </ol>
          </div>`
        : '';
      const moveCards = allOwnedMoves
        .map(key => {
          const def = Neo.MOVE_DEFS[key];
          const isEquipped = equippedMoveKeys.has(key);
          const isBatterySelectable = extraBatteryPendingCount > 0;
          const isMatch = !isBatterySelectable && !isEquipped && Neo.activeInventorySlot && Neo.activeInventorySlot === def.slot;
          // The melee `slash` chip stands in for the equipped weapon: batteries
          // land on the weapon-charge pool, so show that count for it.
          const meleeWeapon = key === 'slash' ? Neo.WEAPON_DEFS?.[_invP.equippedWeapon] : null;
          const currentMaxStacks = meleeWeapon
            ? (Neo.getWeaponMaxCharges?.(meleeWeapon.key, _invP) || 1)
            : Neo.getMoveMaxStacks(key, _invP.character, _invP);
          const slotLabel = Neo.SLOT_LABELS[def.slot] || def.slot;
          const hintText = isBatterySelectable
            ? `Charges ${currentMaxStacks} → ${currentMaxStacks + 1}`
            : (isEquipped ? `${slotLabel} slot` : (isMatch ? 'Selected slot' : `Fits ${slotLabel}`));
          const actionText = isBatterySelectable
            ? '+1 Charge'
            : (isEquipped ? 'Equipped' : (isMatch ? 'Equip Here' : 'Equip'));
          return `<div class="inv-move-chip${(isEquipped && !isBatterySelectable) ? ' is-equipped-move' : ''}${(isMatch || isBatterySelectable) ? ' is-match' : ''}" role="button" tabindex="${isEquipped && !isBatterySelectable ? '-1' : '0'}" ${(isEquipped || isBatterySelectable) ? '' : `draggable="true"`} data-move="${key}" data-slot-type="${def.slot}">
            <canvas class="inv-chip__icon" data-move-icon="${key}" width="30" height="30"></canvas>
            <div class="inv-move-chip__meta">
              <b>${def.name}</b>
              <span class="inv-move-chip__slot">${slotLabel}</span>
            </div>
            <p>${def.desc}</p>
            <div class="inv-chip-footer">
              <span class="inv-move-chip__hint">${hintText}</span>
              <span class="inv-chip-action${isEquipped && !isBatterySelectable ? ' inv-chip-action--disabled' : ''}">${actionText}</span>
            </div>
          </div>`;
        })
        .join('');
      Neo.ui.invMovesList.innerHTML = extraBatteryNotice + (moveCards || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No moves owned</h4><p>Buy moves from the shop to build your kit.</p></div>');
      Neo.ui.invMovesList.querySelectorAll('[data-move-icon]').forEach(canvas => {
        Neo.drawMoveToastIcon(canvas, Neo.MOVE_DEFS[canvas.dataset.moveIcon]);
      });
      Neo.drawItemIconCanvases?.(Neo.ui.invMovesList, 'data-item-icon');

      Neo.MOVE_SLOTS.forEach(slot => {
        const node = Neo.ui.invSlots[slot];
        if (!node) return;
        const moveKey = _invP.equippedMoves?.[slot];
        const def = Neo.MOVE_DEFS[moveKey];
        const isSelected = Neo.activeInventorySlot === slot;
        const hasSpareMove = hasSpareMoveForSlot(_invP, slot);
        node.dataset.move = moveKey || '';
        node.dataset.slotType = slot;
        node.draggable = !!moveKey;
        node.classList.toggle('is-equipped', !!moveKey);
        node.classList.toggle('is-selected', isSelected);
        node.classList.toggle('is-swap-ready', hasSpareMove);
        const slotLabel = Neo.SLOT_LABELS[slot] || slot;
        const slotKey = Neo.getSlotKeyLabel(slot);
        const iconHtml = moveKey ? `<canvas class="inv-slot__icon" data-move-icon="${moveKey}" width="36" height="36"></canvas>` : `<canvas class="inv-slot__icon inv-slot__icon--empty" data-inv-ui-icon="empty-move" width="36" height="36"></canvas>`;
        const statusText = isSelected ? 'Swap Ready' : (def ? 'Equipped' : 'Empty');
        const hintText = isSelected
          ? 'Matching spare moves highlighted below.'
          : hasSpareMove
            ? (def?.desc || 'Click to show spare moves for this slot.')
            : (def ? `${def.desc} No spare ${slotLabel.toLowerCase()} moves owned.` : `No spare ${slotLabel.toLowerCase()} moves owned.`);
        node.innerHTML = `<div class="inv-slot__top"><span class="inv-slot__kicker">${slotLabel}</span><div class="inv-slot__top-right">${slotKey ? `<span class="inv-slot__key">${slotKey}</span>` : ''}<span class="inv-slot__status">${statusText}</span></div></div><div class="inv-slot__main">${iconHtml}<div class="inv-slot__move-wrap"><div class="inv-slot__move">${def?.name || 'No move equipped'}</div><p class="inv-slot__hint">${hintText}</p></div></div>`;
      });
      Neo.ui.invSlots && Object.values(Neo.ui.invSlots).forEach(node => {
        node.querySelectorAll('[data-move-icon]').forEach(canvas => {
          Neo.drawMoveToastIcon(canvas, Neo.MOVE_DEFS[canvas.dataset.moveIcon]);
        });
        node.querySelectorAll('[data-inv-ui-icon]').forEach(canvas => {
          Neo.drawInventoryUiIcon?.(canvas, canvas.dataset.invUiIcon);
        });
      });
      if (Neo.ui.invWeaponSlot) {
        const weapon = Neo.WEAPON_DEFS[_invP.equippedWeapon];
        Neo.ui.invWeaponSlot.dataset.rarity = weapon?.rarity || '';
        const wIconHtml = weapon ? `<canvas class="inv-slot__icon" data-weapon-icon="${_invP.equippedWeapon}" width="36" height="36"></canvas>` : `<canvas class="inv-slot__icon inv-slot__icon--empty" data-inv-ui-icon="empty-weapon" width="36" height="36"></canvas>`;
        Neo.ui.invWeaponSlot.innerHTML = `<div class="inv-slot__top"><span class="inv-slot__kicker">weapon</span><span class="inv-slot__status">${weapon ? 'Equipped Now' : 'No Weapon'}</span></div><div class="inv-slot__main">${wIconHtml}<div class="inv-slot__move-wrap"><div class="inv-slot__move" style="color:${Neo.getRarityNameColor(weapon?.rarity)}">${weapon?.name || 'Default Melee Active'}</div><p class="inv-slot__hint">${weapon ? `${weapon.description} Click to unequip.` : 'Open Weapons tab and click a weapon to equip it.'}</p></div></div>`;
        Neo.ui.invWeaponSlot.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
          Neo.drawWeaponToastIcon(canvas, Neo.WEAPON_DEFS[canvas.dataset.weaponIcon]);
        });
        Neo.ui.invWeaponSlot.querySelectorAll('[data-inv-ui-icon]').forEach(canvas => {
          Neo.drawInventoryUiIcon?.(canvas, canvas.dataset.invUiIcon);
        });
      }
    }
    panelRenderCache.inventory.tabSigs[activeInvTab] = activeInvSig;
    Neo.inventoryPanelDirty = false;
  }

export function equipMove(slot, moveKey) {
    if (!Neo.player || !Neo.MOVE_DEFS[moveKey]) return;
    if (Neo.MOVE_DEFS[moveKey].slot !== slot) return;
    if (!Neo.isMoveAllowedForCharacter(moveKey, Neo.player.character)) return;
    if (!Neo.player.ownedMoves?.[moveKey]) return;
    Neo.player.equippedMoves[slot] = moveKey;
    Neo.cooldowns[slot] = Neo.createCooldownEntry(slot, Neo.player, Neo.cooldowns[slot]);
    markInventoryPanelDirty();
    renderInventoryPanel();
    Neo.updateHud();
    Neo.scheduleRunSave();
  }

export function equipWeapon(weaponKey) {
    if (!Neo.player) return;
    if (!weaponKey) {
      Neo.player.equippedWeapon = '';
      Neo.player.weaponCooldown = 0;
      Neo.player.weaponBeamTime = 0;
      Neo.player.weaponBeamTick = 0;
    } else {
      if (!Neo.WEAPON_DEFS[weaponKey]) return;
      if (!Neo.player.ownedWeapons?.[weaponKey]) return;
      Neo.player.equippedWeapon = weaponKey;
      Neo.player.weaponCooldown = 0;
      Neo.player.weaponBeamTime = 0;
      Neo.player.weaponBeamTick = 0;
    }
    markInventoryPanelDirty();
    renderInventoryPanel();
    Neo.updateHud();
    Neo.scheduleRunSave();
  }

  function handleInventoryWeaponSelect(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-weapon]') : null;
    const weaponKey = target?.dataset?.weapon || '';
    if (!weaponKey || !Neo.WEAPON_DEFS[weaponKey]) return;
    equipWeapon(Neo.player?.equippedWeapon === weaponKey ? '' : weaponKey);
  }

export function spendCoins(cost) {
    if (Neo.player.coins < cost) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.7, text: 'Not enough coins!', c: '#ff4455' });
      return false;
    }
    Neo.player.coins -= cost;
    Neo.metaProgress.coins = Math.max(0, Neo.metaProgress.coins - cost);
    Neo.persistMetaSoon();
    return true;
  }

  function playShopPurchaseFeedback(button, cost) {
    const card = button?.closest('.shop-card');
    if (card) {
      card.classList.add('shop-card--flash-buy');
      const burst = document.createElement('div');
      burst.className = 'shop-card__coin-burst';
      for (let index = 0; index < 6; index += 1) {
        const node = document.createElement('span');
        node.style.setProperty('--burst-index', String(index));
        burst.appendChild(node);
      }
      card.appendChild(burst);
      window.setTimeout(() => burst.remove(), 550);
      window.setTimeout(() => card.classList.remove('shop-card--flash-buy'), 460);
    }
    Neo.playSfx?.('buy_sell');
    if (Neo.player && Number.isFinite(Number(cost))) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.72, text: `-${Math.round(Number(cost))} COINS`, c: '#ffd987' });
    }
  }

export function handleShopBuyClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('.shop-buy');
    if (!button || !Neo.player) return;
    const kind = button.dataset.kind;
    if (kind === 'item') {
      if (Neo.isChallengeActive('no_items')) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.8, text: 'No Items challenge', c: '#ff8894' });
        return;
      }
      const offerIndex = Number(button.dataset.index || -1);
      const itemOffers = Neo.shopOffers.filter(offer => offer.type === 'item');
      const offer = itemOffers[offerIndex];
      if (!offer || offer.bought) return;
      if (!spendCoins(offer.cost)) return;
      offer.bought = true;
      Neo.collectItem(offer.key);
      playShopPurchaseFeedback(button, offer.cost);
      window.achievementEvents?.emit('shop:bought');
    } else if (kind === 'trade') {
      if (Neo.isChallengeActive('no_items')) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.8, text: 'No Items challenge', c: '#ff8894' });
        return;
      }
      const tradeOffer = Neo.ensureShopTradeOffer?.(Neo.currentRoom) || Neo.currentRoom?.shopTradeOffer;
      const state = getShopTradeState(tradeOffer, false);
      if (!tradeOffer || tradeOffer.bought || !state.canAfford) return;
      // Trade must be atomic: confirm the reward relic can actually be granted
      // before consuming the cost relics, otherwise a missing/unresolvable target
      // would silently take the player's items and give nothing back.
      const rewardItem = Neo.itemRegistry?.get?.(tradeOffer.key) || Neo.ITEM_DEFS?.[tradeOffer.key];
      if (!rewardItem) return;
      const costKeys = Array.isArray(tradeOffer.costKeys) ? tradeOffer.costKeys.slice(0, 2) : [];
      costKeys.forEach(key => {
        Neo.player.items[key] = Math.max(0, Number(Neo.player.items[key] || 0) - 1);
        if (Neo.player.items[key] <= 0) delete Neo.player.items[key];
      });
      tradeOffer.bought = true;
      Neo.collectItem(tradeOffer.key);
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.85, text: 'TRADE MADE', c: '#d7f6ff' });
      Neo.playSfx?.('buy_sell');
      window.achievementEvents?.emit('shop:bought');
    } else if (kind === 'move') {
      const offerIndex = Number(button.dataset.index || -1);
      const moveOffers = getShopMoveOffers();
      const offer = moveOffers[offerIndex];
      if (!offer || offer.bought || Neo.player.ownedMoves?.[offer.key] || !Neo.isMoveAllowedForCharacter(offer.key, Neo.player.character)) return;
      if (!spendCoins(offer.cost)) return;
      offer.bought = true;
      Neo.player.ownedMoves[offer.key] = true;
      playShopPurchaseFeedback(button, offer.cost);
      markInventoryPanelDirty();
      Neo.pushMoveNotification(offer.key, 1);
      window.achievementEvents?.emit('shop:bought');
    } else if (kind === 'weapon') {
      const offerIndex = Number(button.dataset.index || -1);
      const weaponOffers = getShopWeaponOffers();
      const offer = weaponOffers[offerIndex];
      if (!offer || offer.bought || Neo.player.ownedWeapons?.[offer.key]) return;
      if (!spendCoins(offer.cost)) return;
      offer.bought = true;
      Neo.player.ownedWeapons[offer.key] = true;
      playShopPurchaseFeedback(button, offer.cost);
      if (!Neo.player.equippedWeapon) equipWeapon(offer.key);
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.8, text: `${Neo.WEAPON_DEFS[offer.key]?.name || 'Weapon'} acquired`, c: Neo.WEAPON_DEFS[offer.key]?.color || '#d9e8ff' });
      Neo.pushWeaponNotification(offer.key);
      markInventoryPanelDirty();
      window.achievementEvents?.emit('shop:bought');
    } else if (kind === 'heal') {
      const heal = Number(button.dataset.heal || 0);
      const cost = Number(button.dataset.cost || 0);
      if (!heal || !cost) return;
      const potionCap = Neo.getPotionCarryCap();
      const stored = Number(Neo.player.storedPotions || 0);
      const canHealNow = Neo.player.hp < Neo.player.maxHp;
      const canStorePotion = !canHealNow && potionCap > 0 && stored < potionCap;
      if (!canHealNow && !canStorePotion) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.7, text: 'Already full health', c: '#a0ffa0' });
        return;
      }
      if (!spendCoins(cost)) return;
      playShopPurchaseFeedback(button, cost);
      if (canHealNow) {
        const scaledHeal = Neo.scalePlayerHealing?.(heal, heal) ?? heal;
        const gained = Neo.applyPlayerHealing?.(scaledHeal) ?? 0;
        if (gained > 0) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-10, 10), Neo.player.y - 20, gained);
      } else {
        Neo.player.storedPotions = stored + 1;
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: `POTION STORED (${Neo.player.storedPotions}/${potionCap})`, c: '#a0e8ff' });
      }
      window.achievementEvents?.emit('shop:bought');
    }
    markShopPanelDirty();
    markInventoryPanelDirty();
    renderShopPanel();
    renderInventoryPanel();
    Neo.scheduleRunSave();
    Neo.syncCurrentRoomState();
    Neo.updateHud();
  }

  // Expose on Neo
  Neo.bindInput = bindInput;
  Neo.clearGameplayInput = clearGameplayInput;
  Neo.bindPanelInput = bindPanelInput;
  Neo.clearInventoryDragState = clearInventoryDragState;
  Neo.isPanelOpen = isPanelOpen;
  Neo.clearPanelCloseEffect = clearPanelCloseEffect;
  Neo.markShopPanelDirty = markShopPanelDirty;
  Neo.markInventoryPanelDirty = markInventoryPanelDirty;
  Neo.playPanelCloseEffect = playPanelCloseEffect;
  Neo.setShopPanelOpen = setShopPanelOpen;
  Neo.setInventoryPanelOpen = setInventoryPanelOpen;
  Neo.toggleShopPanel = toggleShopPanel;
  Neo.toggleInventoryPanel = toggleInventoryPanel;
  Neo.setAnvilPanelOpen = setAnvilPanelOpen;
  Neo.toggleAnvilPanel = toggleAnvilPanel;
  Neo.isWizardPawOpen = isWizardPawOpen;
  Neo.isExtraBatteryOpen = isExtraBatteryOpen;
  Neo.setExtraBatteryModalOpen = setExtraBatteryModalOpen;
  Neo.isScrollControlOpen = isScrollControlOpen;
  Neo.isVoucherModalOpen = isVoucherModalOpen;
  Neo.setVoucherModalOpen = setVoucherModalOpen;
  Neo.setWizardPawModalOpen = setWizardPawModalOpen;
  Neo.setScrollControlModalOpen = setScrollControlModalOpen;
  Neo.isOverlayBlockingInput = isOverlayBlockingInput;
  Neo.getShopMoveOffers = getShopMoveOffers;
  Neo.getShopWeaponOffers = getShopWeaponOffers;
  Neo.renderShopPanel = renderShopPanel;
  Neo.renderInventoryPanel = renderInventoryPanel;
  Neo.equipMove = equipMove;
  Neo.equipWeapon = equipWeapon;
  Neo.spendCoins = spendCoins;
  Neo.handleShopBuyClick = handleShopBuyClick;
  Neo.getAnvilWeaponBonus = getAnvilWeaponBonus;
  Neo.getAnvilMoveBonus = getAnvilMoveBonus;
  Neo.isGodSweepUnlocked = isGodSweepUnlocked;
  Neo.confirmAnvilUpgrades = confirmAnvilUpgrades;
  Neo.renderAnvilPanel = renderAnvilPanel;
  Neo.renderAnvilItemList = renderAnvilItemList;
  Neo.renderAnvilStatPanel = renderAnvilStatPanel;
  Neo.updateInvPlayerTabVisibility = updateInvPlayerTabVisibility;
