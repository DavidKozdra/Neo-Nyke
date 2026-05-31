// panels.js — Input binding and UI panel rendering.
export function bindInput() {
    Neo.canvas.addEventListener('contextmenu', event => event.preventDefault());
    Neo.canvas.addEventListener('mousemove', event => {
      const rect = Neo.canvas.getBoundingClientRect();
      Neo.mouse.x = (event.clientX - rect.left) * (Neo.canvas.width / rect.width);
      Neo.mouse.y = (event.clientY - rect.top) * (Neo.canvas.height / rect.height);
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
      if (isWizardPawOpen()) {
        if (event.key === 'Escape') event.preventDefault();
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
      if (key === 'e' && Neo.gameState === 'play') {
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
      }
      if (key === inventoryKey && (Neo.gameState === 'play' || isPanelOpen(Neo.ui.invPanel)) && !Neo.invKeyLatch) {
        toggleInventoryPanel();
        Neo.invKeyLatch = true;
      }
      if (b && key === b.smash && Neo.gameState === 'play') Neo.trySmash();
      else if (!b && key === 'r' && Neo.gameState === 'play') Neo.trySmash();
      if (Neo.gameState === 'play' && Neo.EQUIPMENT_SLOT_KEYS?.includes(key.toUpperCase())) {
        if (!Neo.equipKeyLatch) Neo.equipKeyLatch = {};
        const letter = key.toUpperCase();
        if (!Neo.equipKeyLatch[letter]) {
          Neo.equipKeyLatch[letter] = true;
          if (Neo.activateEquipmentSlotKey?.(letter)) event.preventDefault();
        }
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
      if (key === 'e') { Neo.shopKeyLatch = false; Neo.anvilKeyLatch = false; }
      if (key === ' ') Neo.ladderUseKeyLatch = false;
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
      onCharacterSelect(characterKey, button) {
        if (Neo.charSelectPhase === 'p2') { Neo.chosenCharacter2 = characterKey; }
        else if (Neo.charSelectPhase === 'p3') { Neo.chosenCharacter3 = characterKey; }
        else if (Neo.charSelectPhase === 'p4') { Neo.chosenCharacter4 = characterKey; }
        else { Neo.chosenCharacter = characterKey; Neo.metaProgress.selectedCharacter = Neo.chosenCharacter; Neo.persistMetaSoon(); }
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
      onSkipTutorial() {
        Neo.skipFirstRunTutorial();
      },
      onPlayTutorial() {
        try {
          localStorage.setItem(Neo.REPLAY_TUTORIAL_KEY, '1');
        } catch {}
        Neo.gameMode = 'normal';
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
      onOpenCharacterSelect() { Neo.gameMode = 'normal'; Neo.charSelectPhase = null; Neo.setGameState('charselect'); Neo.updateCharacterSelectionUI(); },
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
        Neo.gameMode = mode;
        if (mode === 'coop' || mode === 'pvp') {
          Neo.openMpLobby(mode);
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
    Neo.ui.shopClose?.addEventListener('click', () => setShopPanelOpen(false));
    Neo.ui.invClose?.addEventListener('click', () => setInventoryPanelOpen(false));
    Neo.ui.anvilClose?.addEventListener('click', () => setAnvilPanelOpen(false));
    Neo.ui.anvilCancel?.addEventListener('click', () => { Neo.anvilStagedUpgrades = {}; setAnvilPanelOpen(false); });
    Neo.ui.anvilConfirm?.addEventListener('click', confirmAnvilUpgrades);
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
      });
    });
    Neo.ui.invPlayerTabBtns.forEach(tab => {
      tab.addEventListener('click', () => {
        Neo.activeInvPlayer = Number(tab.dataset.invPlayer) || 1;
        renderInventoryPanel();
      });
    });
    Neo.ui.shopItems?.addEventListener('click', handleShopBuyClick);
    Neo.ui.shopWeapons?.addEventListener('click', handleShopBuyClick);
    Neo.ui.shopMoves?.addEventListener('click', handleShopBuyClick);
    Neo.ui.shopHeals?.addEventListener('click', handleShopBuyClick);
    Neo.bindEquipmentSlotClicks?.();
    Neo.ui.invMovesList?.addEventListener('click', handleInventoryMoveSelect);
    Neo.ui.invWeaponsList?.addEventListener('click', handleInventoryWeaponSelect);
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
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 46, life: 0.8, text: `${Neo.MOVE_DEFS[moveKey].name.toUpperCase()} +1`, c: '#cfd7ff' });
        markInventoryPanelDirty();
        renderInventoryPanel();
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

  const PANEL_CLOSE_EFFECT_DURATION_MS = 640;
  const PANEL_CLOSE_EFFECT_SETTLE_MS = 260;

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

  function makeFractureClip(row, col, rows, cols) {
    const topCut = row === 0 ? 0 : 5 + Math.random() * 14;
    const rightCut = col === cols - 1 ? 0 : 5 + Math.random() * 14;
    const bottomCut = row === rows - 1 ? 0 : 5 + Math.random() * 14;
    const leftCut = col === 0 ? 0 : 5 + Math.random() * 14;
    const notchA = 18 + Math.random() * 24;
    const notchB = 58 + Math.random() * 24;
    return `polygon(${leftCut}% 0%, ${notchA}% ${topCut}%, 100% ${rightCut}%, ${100 - rightCut}% ${notchB}%, 100% ${100 - bottomCut}%, ${notchB}% 100%, ${leftCut}% ${100 - leftCut}%, 0% ${100 - leftCut}%, ${topCut}% ${notchA}%)`;
  }

  function getPanelCloseGrid(rect) {
    const targetTiles = Math.max(24, Math.min(32, Math.round((rect.width * rect.height) / 22000)));
    const aspect = rect.width / Math.max(1, rect.height);
    let cols = Math.max(4, Math.min(8, Math.round(Math.sqrt(targetTiles * aspect))));
    let rows = Math.max(3, Math.min(6, Math.ceil(targetTiles / cols)));

    while (cols * rows > 32 && rows > 3) rows -= 1;
    while (cols * rows > 32 && cols > 4) cols -= 1;
    return { cols, rows };
  }

  function addPanelCloseSparks(ghost, rect, origin, maxDelay) {
    const area = rect.width * rect.height;
    const sparkCount = Math.max(20, Math.min(40, Math.round(area / 15000)));
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
      const drift = 70 + Math.random() * 150;
      const delay = Math.round((len / maxRadius) * Math.min(maxDelay + 120, 360) + Math.random() * 110);

      spark.style.left = `${x.toFixed(1)}px`;
      spark.style.top = `${y.toFixed(1)}px`;
      spark.style.setProperty('--panel-fx-delay', `${delay}ms`);
      spark.style.setProperty('--panel-fx-dx', `${((vx / len) * drift + (Math.random() - 0.5) * 42).toFixed(1)}px`);
      spark.style.setProperty('--panel-fx-dy', `${((vy / len) * drift - 24 + (Math.random() - 0.5) * 58).toFixed(1)}px`);
      spark.style.setProperty('--panel-fx-scale', (0.35 + Math.random() * 0.85).toFixed(2));
      ghost.appendChild(spark);
    }
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

    const flash = document.createElement('div');
    flash.className = 'panel-disintegrate-fx__flash';
    ghost.appendChild(flash);

    const origin = getPanelCloseOrigin(element, rect);
    ghost.style.setProperty('--panel-fx-origin-x', `${origin.x}px`);
    ghost.style.setProperty('--panel-fx-origin-y', `${origin.y}px`);

    const { cols, rows } = getPanelCloseGrid(rect);
    const tileWidth = rect.width / cols;
    const tileHeight = rect.height / rows;
    const maxRadius = Math.max(1, Math.hypot(rect.width, rect.height));
    let maxDelay = 0;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = Math.round(col * tileWidth);
        const y = Math.round(row * tileHeight);
        const width = col === cols - 1 ? Math.max(1, Math.round(rect.width - x)) : Math.ceil(tileWidth);
        const height = row === rows - 1 ? Math.max(1, Math.round(rect.height - y)) : Math.ceil(tileHeight);
        const cx = x + width / 2;
        const cy = y + height / 2;
        const vx = cx - origin.x;
        const vy = cy - origin.y;
        const distance = Math.hypot(vx, vy);
        const len = distance || 1;
        const nx = vx / len;
        const ny = vy / len;
        const tangent = Math.random() < 0.5 ? -1 : 1;
        const force = 86 + (distance / maxRadius) * 170 + Math.random() * 54;
        const delay = Math.round(70 + (distance / maxRadius) * 280 + Math.random() * 90);
        const tile = document.createElement('div');
        tile.className = 'panel-disintegrate-fx__tile';
        tile.style.left = `${x}px`;
        tile.style.top = `${y}px`;
        tile.style.width = `${width}px`;
        tile.style.height = `${height}px`;
        maxDelay = Math.max(maxDelay, delay);
        tile.style.setProperty('--panel-fx-delay', `${delay}ms`);
        tile.style.setProperty('--panel-fx-dx', `${(nx * force + -ny * tangent * Math.random() * 34).toFixed(1)}px`);
        tile.style.setProperty('--panel-fx-dy', `${(ny * force + nx * tangent * Math.random() * 34 - 26).toFixed(1)}px`);
        tile.style.setProperty('--panel-fx-rot', `${((Math.random() - 0.5) * 34 + tangent * distance / maxRadius * 20).toFixed(1)}deg`);
        tile.style.setProperty('--panel-fx-scale', (0.46 + Math.random() * 0.16).toFixed(2));
        tile.style.setProperty('--panel-fx-bright', (1.12 + Math.random() * 0.26).toFixed(2));
        const clipPath = makeFractureClip(row, col, rows, cols);
        tile.style.clipPath = clipPath;
        tile.style.webkitClipPath = clipPath;

        const clone = element.cloneNode(true);
        applyGhostSurfaceStyle(element, clone, rect, x, y);
        copyCanvasBitmaps(element, clone);
        tile.appendChild(clone);
        ghost.appendChild(tile);
      }
    }

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
  }

export function setInventoryPanelOpen(open, options = {}) {
    if (!Neo.ui.invPanel) return;
    const animateClose = options.animateClose !== false;
    if (open) clearPanelCloseEffect(Neo.ui.invPanel);
    else if (animateClose && isPanelOpen(Neo.ui.invPanel)) playPanelCloseEffect(Neo.ui.invPanel);
    else clearPanelCloseEffect(Neo.ui.invPanel);
    Neo.ui.invPanel.classList.toggle('hidden', !open);
    Neo.ui.invPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (!open) {
      Neo.activeInventorySlot = '';
      if (Neo.inventoryPauseActive) {
        Neo.inventoryPauseActive = false;
        if (Neo.gameState === 'pause') Neo.resumeGame();
      }
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

  function getAnvilTotalCost() {
    let xp = 0;
    let gold = 0;
    for (const [key, count] of Object.entries(Neo.anvilStagedUpgrades)) {
      if (count === 0) continue;
      const [itemType, , statKey] = key.split(':');
      const schema = itemType === 'weapon' ? Neo.WEAPON_UPGRADEABLE_STATS : Neo.MOVE_UPGRADEABLE_STATS;
      const steps = Math.abs(count);
      xp += steps * (schema[statKey]?.xpPerStep ?? 0);
      gold += steps * (schema[statKey]?.goldPerStep ?? 0);
    }
    return { xp, gold };
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
      listEl.innerHTML = `<p style="color:#91a8be;font-size:13px;padding:8px">No ${itemType}s owned.</p>`;
      return;
    }

    listEl.innerHTML = keys.map(key => {
      const def = itemType === 'weapon' ? Neo.WEAPON_DEFS[key] : Neo.MOVE_DEFS[key];
      const name = def?.name || key;
      const color = def?.color || '#9ec6ff';
      const isActive = Neo.anvilSelectedItem === `${itemType}:${key}`;
      return `<button class="anvil-item-btn${isActive ? ' is-active' : ''}" data-item="${key}" data-item-type="${itemType}">
        <span class="anvil-item-dot" style="background:${color}"></span>
        <span style="color:${Neo.getRarityNameColor(def?.rarity || def?.category)}">${name}</span>
      </button>`;
    }).join('');
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
      const canIncrease = step > 0 ? nextVal <= max : nextVal >= min;
      const canDecrease = stagedCount > 0;

      const stagedDisplay = staged !== cur
        ? `<span class="anvil-stat-staged">&rarr; ${format(staged)}</span>`
        : '';
      const costDisplay = xpPerStep > 0
        ? `<span class="anvil-stat-cost">${xpPerStep} XP + &#9670;${goldPerStep ?? 0}/step</span>`
        : '';

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

    statEl.innerHTML = `<div class="anvil-stat-title" style="color:${Neo.getRarityNameColor(def?.rarity || def?.category)}">${def?.name || itemKey}</div>${rows.join('')}`;
  }

  function renderAnvilFooter() {
    const cost = getAnvilTotalCost();
    const xp = Neo.player?.xp ?? 0;
    const coins = Neo.player?.coins ?? 0;
    if (Neo.ui.anvilCostSummary) {
      if (cost.xp === 0 && cost.gold === 0) {
        Neo.ui.anvilCostSummary.textContent = 'Select stats above and press + to stage upgrades.';
      } else {
        Neo.ui.anvilCostSummary.innerHTML =
          `Total: <span style="color:${xp >= cost.xp ? '#7eff9e' : '#ff7c88'}">${cost.xp} XP (${xp})</span>` +
          ` + <span style="color:${coins >= cost.gold ? '#ffd15a' : '#ff7c88'}">&#9670; ${cost.gold} gold (${coins})</span>`;
        Neo.ui.anvilCostSummary.style.color = xp >= cost.xp && coins >= cost.gold ? '#7eff9e' : '#ff7c88';
      }
    }
    if (Neo.ui.anvilConfirm) {
      Neo.ui.anvilConfirm.disabled = (cost.xp === 0 && cost.gold === 0) || xp < cost.xp || coins < cost.gold;
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
      if (capped) return;
      // Check if we could afford one more step
      const nextCost = getAnvilTotalCost();
      if (nextCost.xp + statDef.xpPerStep > (Neo.player?.xp ?? 0)) return;
      if (nextCost.gold + (statDef.goldPerStep ?? 0) > (Neo.player?.coins ?? 0)) return;
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
    if (!Neo.player || (cost.xp === 0 && cost.gold === 0)) return;
    if (Neo.player.xp < cost.xp || (Neo.player.coins ?? 0) < cost.gold) return;

    Neo.player.xp -= cost.xp;
    Neo.player.coins = (Neo.player.coins ?? 0) - cost.gold;

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

export function setWizardPawModalOpen(open, options = {}) {
    if (!Neo.ui.wizardPawModal) return;
  const animateClose = options.animateClose !== false;
    const effectTarget = Neo.ui.wizardPawModal.querySelector('.modal-box') || Neo.ui.wizardPawModal;
    if (effectTarget instanceof HTMLElement) effectTarget.dataset.panelFxKey = 'wizard-paw-modal';
    if (open) {
      clearPanelCloseEffect(effectTarget);
      Neo.ui.wizardPawModal.classList.remove('hidden');
      Neo.ui.wizardPawModal.setAttribute('aria-hidden', 'false');
      return;
    }
    if (animateClose && isPanelOpen(Neo.ui.wizardPawModal)) playPanelCloseEffect(effectTarget);
    else clearPanelCloseEffect(effectTarget);
    Neo.ui.wizardPawModal.classList.add('hidden');
    Neo.ui.wizardPawModal.setAttribute('aria-hidden', 'true');
  }

export function isOverlayBlockingInput() {
    return isPanelOpen(Neo.ui.shopPanel) || isPanelOpen(Neo.ui.invPanel) || isPanelOpen(Neo.ui.anvilPanel) || isWizardPawOpen();
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
        cost: Neo.getShopWeaponCost(Neo.WEAPON_DEFS[weaponKey]?.rarity || 'knight', index, Neo.floor, Neo.selectedDifficulty, weaponKey),
      }));
      Neo.currentRoom.shopWeaponOffers = offers;
    }
    Neo.refreshRoomShopCosts(Neo.currentRoom);
    return Neo.currentRoom.shopWeaponOffers;
  }

export function renderShopPanel() {
    if (!Neo.ui.shopPanel || !Neo.player) return;
    Neo.refreshRoomShopCosts(Neo.currentRoom);
    Neo.shopOffers = Neo.currentRoom?.shopOffers || Neo.shopOffers;
    Neo.ui.shopCoins.textContent = String(Neo.player.coins);
    const noItemsChallenge = Neo.isChallengeActive('no_items');
    Neo.ui.shopTabs.forEach(tab => {
      const isActive = tab.dataset.tab === Neo.activeShopTab;
      tab.classList.toggle('active', isActive);
    });
    Neo.ui.shopItems.classList.toggle('hidden', Neo.activeShopTab !== 'items');
    Neo.ui.shopWeapons?.classList.toggle('hidden', Neo.activeShopTab !== 'weapons');
    Neo.ui.shopMoves.classList.toggle('hidden', Neo.activeShopTab !== 'moves');
    Neo.ui.shopHeals.classList.toggle('hidden', Neo.activeShopTab !== 'heals');

    const itemCards = Neo.shopOffers
      .filter(offer => !offer.bought && offer.type === 'item')
      .map((offer, index) => {
        const item = Neo.itemRegistry.get(offer.key);
        const canAfford = Neo.player.coins >= offer.cost;
        const blocked = noItemsChallenge || !canAfford;
        return `<div class="shop-card${blocked ? ' shop-card--unaffordable' : ''}">
          <span class="shop-card__eyebrow">Relic</span>
          <div class="shop-card__title-row">
            <canvas class="shop-card__icon" data-item-icon="${offer.key}" width="30" height="30"></canvas>
            <h4 style="color:${Neo.getRarityNameColor(item?.rarity || item?.category)}">${item?.name || 'Item'}</h4>
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
    Neo.ui.shopItems.innerHTML = itemCards || '<div class="shop-card shop-empty"><p>Every relic here is already yours. Clear the floor or check the move shelf.</p></div>';
    Neo.ui.shopItems.querySelectorAll('[data-item-icon]').forEach(canvas => {
      Neo.drawItemToastIcon(canvas, Neo.itemRegistry.get(canvas.dataset.itemIcon) || Neo.ITEM_DEFS[canvas.dataset.itemIcon]);
    });

    const weaponOffers = getShopWeaponOffers();
    const weaponCards = weaponOffers
      .map((offer, index) => {
        const weapon = Neo.WEAPON_DEFS[offer.key];
        const owned = !!Neo.player.ownedWeapons?.[offer.key];
        const canAfford = Neo.player.coins >= offer.cost;
        const disabled = offer.bought || owned || !canAfford;
        return `<div class="shop-card${!canAfford && !owned && !offer.bought ? ' shop-card--unaffordable' : ''}">
          <span class="shop-card__eyebrow">${weapon?.rarity || 'weapon'}</span>
          <div class="shop-card__title-row">
            <canvas class="shop-card__icon" data-weapon-icon="${offer.key}" width="30" height="30"></canvas>
            <h4 style="color:${Neo.getRarityNameColor(weapon?.rarity)}">${weapon?.name || offer.key}</h4>
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
    if (Neo.ui.shopWeapons) {
      Neo.ui.shopWeapons.innerHTML = weaponCards || '<div class="shop-card shop-empty"><p>No weapons in stock right now.</p></div>';
      Neo.ui.shopWeapons.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
        Neo.drawWeaponToastIcon(canvas, Neo.WEAPON_DEFS[canvas.dataset.weaponIcon]);
      });
    }

    const moveOffers = getShopMoveOffers();
    const moveCards = moveOffers
      .map((offer, index) => {
        const def = Neo.MOVE_DEFS[offer.key];
        const owned = !!Neo.player.ownedMoves?.[offer.key];
        const canAfford = Neo.player.coins >= offer.cost;
        const disabled = offer.bought || owned || !canAfford;
        const slotLabel = Neo.SLOT_LABELS[def?.slot] || def?.slot || 'move';
        const currentMoveKey = Neo.player.equippedMoves?.[def?.slot];
        const currentMoveName = currentMoveKey ? (Neo.MOVE_DEFS[currentMoveKey]?.name || currentMoveKey) : null;
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
    Neo.ui.shopMoves.innerHTML = moveCards || '<div class="shop-card shop-empty"><p>No new techniques are on the rack right now.</p></div>';
    Neo.ui.shopMoves.querySelectorAll('[data-move-icon]').forEach(canvas => {
      Neo.drawMoveToastIcon(canvas, Neo.MOVE_DEFS[canvas.dataset.moveIcon]);
    });

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
        return `<div class="shop-card${disabled ? ' shop-card--unaffordable' : ''}">
        <span class="shop-card__eyebrow">Recovery</span>
        <div class="shop-card__title-row">
          <canvas class="shop-card__icon" data-heal-icon="${heal.id}" width="30" height="30"></canvas>
          <h4>${heal.name}</h4>
          <span class="shop-card__price">${heal.cost}</span>
        </div>
        <div class="shop-card__copy">
          <p>${copy}</p>
        </div>
        <div class="shop-card__footer">
          <button class="shop-buy${disabled ? ' shop-buy--unaffordable' : ''}" data-kind="heal" data-heal="${heal.heal}" data-cost="${heal.cost}" ${disabled ? 'disabled' : ''}>${buttonText}</button>
        </div>
      </div>`;
      })
      .join('');
    Neo.ui.shopHeals.innerHTML = healCards;
    Neo.ui.shopHeals.querySelectorAll('[data-heal-icon]').forEach(canvas => {
      Neo.drawHealToastIcon(canvas, canvas.dataset.healIcon);
    });
    Neo.shopPanelDirty = false;
  }

export function renderInventoryPanel() {
    if (!Neo.ui.invPanel || !Neo.player) return;

    // Resolve which player to display
    const _invPlayers = [Neo.player, Neo.player2, Neo.player3, Neo.player4];
    const _invP = _invPlayers[Neo.activeInvPlayer - 1] || Neo.player;
  const extraBatteryPendingCount = Math.max(0, Math.floor(Number(_invP.extraBatteryPendingCount || 0)));

    if (Neo.gameMode === 'coop' && (Neo.player2 || Neo.player3 || Neo.player4)) updateInvPlayerTabVisibility();

    Neo.ui.invTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.invTab === Neo.activeInvTab);
    });
    const tabPanels = { stats: 'invTabStats', items: 'invTabItems', weapons: 'invTabWeapons', equipped: 'invTabEquipped' };
    Object.entries(tabPanels).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', key !== Neo.activeInvTab);
    });

    const stats = Neo.getItemStats();
    const hpPct = Math.round(_invP.hp) / Math.round(_invP.maxHp);
    const hpColor = hpPct > 0.6 ? '#6dde88' : hpPct > 0.3 ? '#f5c842' : '#ff6b6b';
    const critPct = Math.round(stats.critChance * 100);
    const critColor = critPct >= 30 ? '#f5a623' : critPct >= 10 ? '#e8f4ff' : '#8ca8c0';
    const atkSpeed = Neo.getAttackSpeedValue();
    const atkSpeedColor = atkSpeed >= 2 ? '#6dde88' : atkSpeed >= 1.2 ? '#e8f4ff' : '#8ca8c0';
    const dmgReduction = Math.round(stats.damageReduction * 100);
    Neo.ui.invStats.innerHTML = [
      `<div class="inv-stat-row inv-stat-row--bar"><div class="inv-stat-row__icon inv-stat-row__icon--hp">♥</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">HP</span><span class="inv-stat-row__value" style="color:${hpColor}">${Math.round(_invP.hp)} <span class="inv-stat-row__sub">/ ${Math.round(_invP.maxHp)}</span></span></div><div class="inv-stat-row__bar"><div class="inv-stat-row__bar-fill" style="width:${Math.round(hpPct*100)}%;background:${hpColor}"></div></div></div>`,
      `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--atk">⚔</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Attack Power</span><span class="inv-stat-row__value">${_invP.attackPower}</span></div></div>`,
      `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--spd">⚡</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Attack Speed</span><span class="inv-stat-row__value" style="color:${atkSpeedColor}">${atkSpeed.toFixed(2)}x</span></div></div>`,
      `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--crit">◎</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Crit Chance</span><span class="inv-stat-row__value" style="color:${critColor}">${critPct}%</span></div></div>`,
      dmgReduction > 0 ? `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--def">⛨</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Damage Reduction</span><span class="inv-stat-row__value" style="color:#6dde88">${dmgReduction}%</span></div></div>` : '',
      stats.bleedChance > 0 ? `<div class="inv-stat-row"><div class="inv-stat-row__icon inv-stat-row__icon--bleed">✦</div><div class="inv-stat-row__body"><span class="inv-stat-row__label">Bleed Chance</span><span class="inv-stat-row__value" style="color:#e05c5c">${Math.round(stats.bleedChance * 100)}%</span></div></div>` : '',
    ].join('');

    Neo.ui.invItemsList.innerHTML = Neo.ITEM_KEYS
      .filter(key => Number(_invP.items?.[key] || 0) > 0)
      .map(key => {
        const item = Neo.itemRegistry.get(key);
        return `<div class="inv-card">
          <span class="inv-card__eyebrow">Relic</span>
          <div class="inv-card__title-row">
            <canvas class="inv-card__icon" data-item-icon="${key}" width="30" height="30"></canvas>
            <h4 style="color:${Neo.getRarityNameColor(item?.rarity || item?.category)}">${item?.name || key}</h4>
            <span class="inv-card__count">x${_invP.items[key]}</span>
          </div>
          <p>${item?.description || 'No item description available.'}</p>
        </div>`;
      })
      .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No relics yet</h4><p>Your pockets are clear. Loot rooms or buy from the shop to start a build.</p></div>';

    Neo.ui.invItemsList.querySelectorAll('[data-item-icon]').forEach(canvas => {
      Neo.drawItemToastIcon(canvas, Neo.itemRegistry.get(canvas.dataset.itemIcon) || Neo.ITEM_DEFS[canvas.dataset.itemIcon]);
    });

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
            <span class="inv-move-chip__hint">${equipped ? 'Equipped On Left Click' : 'Click To Equip On Left Click'}</span>
          </button>`;
        })
        .join('') || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No weapons owned</h4><p>Buy weapons in the shop to unlock left-click weapon loadouts.</p></div>';
      Neo.ui.invWeaponsList.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
        Neo.drawWeaponToastIcon(canvas, Neo.WEAPON_DEFS[canvas.dataset.weaponIcon]);
      });
    }

    const equippedMoveKeys = new Set(Object.values(_invP.equippedMoves || {}).filter(Boolean));
    const allOwnedMoves = Object.keys(_invP.ownedMoves || {})
      .filter(key => _invP.ownedMoves[key] && Neo.MOVE_DEFS[key] && Neo.isMoveAllowedForCharacter(key, _invP.character))
      .sort((a, b) => Neo.MOVE_DEFS[a].slot.localeCompare(Neo.MOVE_DEFS[b].slot));
    const extraBatteryNotice = extraBatteryPendingCount > 0
      ? `<div class="inv-card"><span class="inv-card__eyebrow">Extra Battery</span><h4>${extraBatteryPendingCount} selection${extraBatteryPendingCount === 1 ? '' : 's'} pending</h4><p>Click a move below to grant it +1 max stack.</p></div>`
      : '';
    const moveCards = allOwnedMoves
      .map(key => {
        const def = Neo.MOVE_DEFS[key];
        const isEquipped = equippedMoveKeys.has(key);
        const isBatterySelectable = extraBatteryPendingCount > 0;
        const isMatch = !isBatterySelectable && !isEquipped && Neo.activeInventorySlot && Neo.activeInventorySlot === def.slot;
        const currentMaxStacks = Neo.getMoveMaxStacks(key, _invP.character, _invP);
        const slotLabel = Neo.SLOT_LABELS[def.slot] || def.slot;
        const hintText = isBatterySelectable
          ? `Click to add +1 max stack. Current ${currentMaxStacks}.`
          : (isEquipped ? 'Equipped' : (isMatch ? 'Click or drag to equip' : `Drag to ${slotLabel} slot`));
        return `<div class="inv-move-chip${(isEquipped && !isBatterySelectable) ? ' is-equipped-move' : ''}${(isMatch || isBatterySelectable) ? ' is-match' : ''}" ${(isEquipped || isBatterySelectable) ? '' : `draggable="true"`} data-move="${key}" data-slot-type="${def.slot}">
          <canvas class="inv-chip__icon" data-move-icon="${key}" width="30" height="30"></canvas>
          <div class="inv-move-chip__meta">
            <b>${def.name}</b>
            <span class="inv-move-chip__slot">${slotLabel}</span>
          </div>
          <p>${def.desc}</p>
          <span class="inv-move-chip__hint">${hintText}</span>
        </div>`;
      })
      .join('');
    Neo.ui.invMovesList.innerHTML = extraBatteryNotice + (moveCards || '<div class="inv-card"><span class="inv-card__eyebrow">Empty</span><h4>No moves owned</h4><p>Buy moves from the shop to build your kit.</p></div>');
    Neo.ui.invMovesList.querySelectorAll('[data-move-icon]').forEach(canvas => {
      Neo.drawMoveToastIcon(canvas, Neo.MOVE_DEFS[canvas.dataset.moveIcon]);
    });

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
      const iconHtml = moveKey ? `<canvas class="inv-slot__icon" data-move-icon="${moveKey}" width="36" height="36"></canvas>` : `<div class="inv-slot__icon inv-slot__icon--empty"></div>`;
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
    });
    if (Neo.ui.invWeaponSlot) {
      const weapon = Neo.WEAPON_DEFS[_invP.equippedWeapon];
      Neo.ui.invWeaponSlot.dataset.rarity = weapon?.rarity || '';
      const wIconHtml = weapon ? `<canvas class="inv-slot__icon" data-weapon-icon="${_invP.equippedWeapon}" width="36" height="36"></canvas>` : `<div class="inv-slot__icon inv-slot__icon--empty">⚔️</div>`;
      Neo.ui.invWeaponSlot.innerHTML = `<div class="inv-slot__top"><span class="inv-slot__kicker">weapon</span><span class="inv-slot__status">${weapon ? 'Equipped Now' : 'No Weapon'}</span></div><div class="inv-slot__main">${wIconHtml}<div class="inv-slot__move-wrap"><div class="inv-slot__move" style="color:${Neo.getRarityNameColor(weapon?.rarity)}">${weapon?.name || 'Default Melee Active'}</div><p class="inv-slot__hint">${weapon ? `${weapon.description} Click to unequip.` : 'Open Weapons tab and click a weapon to equip it.'}</p></div></div>`;
      Neo.ui.invWeaponSlot.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
        Neo.drawWeaponToastIcon(canvas, Neo.WEAPON_DEFS[canvas.dataset.weaponIcon]);
      });
    }
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
    equipWeapon(weaponKey);
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
      const itemOffers = Neo.shopOffers.filter(offer => !offer.bought && offer.type === 'item');
      const offer = itemOffers[offerIndex];
      if (!offer || offer.bought) return;
      if (!spendCoins(offer.cost)) return;
      offer.bought = true;
      Neo.collectItem(offer.key);
      window.achievementEvents?.emit('shop:bought');
    } else if (kind === 'move') {
      const offerIndex = Number(button.dataset.index || -1);
      const moveOffers = getShopMoveOffers();
      const offer = moveOffers[offerIndex];
      if (!offer || offer.bought || Neo.player.ownedMoves?.[offer.key] || !Neo.isMoveAllowedForCharacter(offer.key, Neo.player.character)) return;
      if (!spendCoins(offer.cost)) return;
      offer.bought = true;
      Neo.player.ownedMoves[offer.key] = true;
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
      if (canHealNow) {
        const before = Neo.player.hp;
        Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + heal);
        const gained = Neo.player.hp - before;
        if (gained > 0) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-10, 10), Neo.player.y - 20, gained);
        if (gained > 0) window.achievementEvents?.emit('heal:applied', { amount: gained });
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
  Neo.setWizardPawModalOpen = setWizardPawModalOpen;
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
