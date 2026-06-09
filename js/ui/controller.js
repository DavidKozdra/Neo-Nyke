// controller.js — UI controller factory.

export function createUIController(view) {
    const UIManagerCtor = window.KozEngine?.UI?.uiManager?.UIManager || window.UIManager || null;
    const manager = typeof UIManagerCtor === 'function' ? new UIManagerCtor({ autoRuntimeInit: false }) : null;
    const DialogueManagerCtor = Neo.KozDialogueApi.TypewriterDialogueManager || window.TypewriterDialogueManager || null;
    const WorldSpeechBubbleCtor = Neo.KozWorldSpeechApi.WorldSpeechBubbleManager || window.WorldSpeechBubbleManager || null;
    const dialogueRuntime = typeof DialogueManagerCtor === 'function'
      ? new DialogueManagerCtor({
        gameStateManager: Neo.gameStateManager,
        defaultSpeaker: 'GOD',
        typeSpeed: 0.028,
        autoAdvanceDelay: 1.35,
        autoAdvanceEnabled: () => window.NeoSettings?.shouldAutoAdvanceCutscenes?.() === true,
        onOpen: () => Neo.clearGameplayInput(),
        onClose: () => Neo.clearGameplayInput(),
      })
      : null;
    const worldSpeechRuntime = typeof WorldSpeechBubbleCtor === 'function'
      ? new WorldSpeechBubbleCtor({ typeSpeed: 0.024, holdTime: 1.55, maxBubbles: 8 })
      : null;
    let menuBound = false;
    let restartBound = false;
    let activeState = 'menu';
    let hudUpdateHook = null;
    let challengePanelOpen = false;
    let runHistoryOpen = false;
    let syncSandboxPanelFieldsHook = null;
    let runHistoryPage = 0;
    let runHistoryEntries = [];
    let runHistoryModeFilter = 'all';
    let selectedRunHistoryId = '';
    let activeRunHistoryTab = 'stats';
    let tutorialBannerCache = { open: null, text: null, hint: null, prevDisabled: null, nextDisabled: null };
    let objectiveEntriesCache = [];
    let objectiveTrackerVisible = false;
    let objectiveCompactMode = false;
    let objectiveExpanded = true;
    let tutorialMenuOfferVisible = false;
    let objectiveLayoutCache = null;
    const dialogueRenderCache = { active: null, speaker: null, text: null, hint: null, portraitKey: null };
    const entityDialogueNodes = new Map();
    const hudRenderCache = {
      floor: null,
      level: null,
      xpText: null,
      gameTime: null,
      difficultyName: null,
      character: null,
      hpWidth: null,
      hpText: null,
      itemRarityWhite: null,
      itemRarityPurple: null,
      itemRarityRed: null,
      cdM: null,
      cdL: null,
      cdS: null,
      cdD: null,
      skills: { melee: null, laser: null, smash: null, dash: null },
    };
    const runHistoryPageSize = 8;

    const LC = `<span class="lc-icon">◆</span>`;

    function ensureRunHistoryPanelCanOverlayGame() {
      if (!view.runHistoryPanel || view.runHistoryPanel.parentElement === document.body) return;
      document.body.appendChild(view.runHistoryPanel);
    }

    function bindPracticePanelDrag() {
      const panel = view.practicePanel;
      const handle = panel?.querySelector('.practice-head');
      if (!panel || !handle || panel.dataset.dragBound === 'true') return;
      panel.dataset.dragBound = 'true';
      let drag = null;
      const clampPanel = (left, top) => {
        const rect = panel.getBoundingClientRect();
        const margin = 8;
        return {
          left: Neo.clamp(left, margin, Math.max(margin, window.innerWidth - rect.width - margin)),
          top: Neo.clamp(top, margin, Math.max(margin, window.innerHeight - rect.height - margin)),
        };
      };
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest('button, input, select, textarea, a')) return;
        const rect = panel.getBoundingClientRect();
        drag = {
          pointerId: event.pointerId,
          dx: event.clientX - rect.left,
          dy: event.clientY - rect.top,
        };
        panel.classList.add('is-dragging');
        panel.style.right = 'auto';
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });
      handle.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const next = clampPanel(event.clientX - drag.dx, event.clientY - drag.dy);
        panel.style.left = `${next.left}px`;
        panel.style.top = `${next.top}px`;
      });
      const endDrag = event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag = null;
        panel.classList.remove('is-dragging');
      };
      handle.addEventListener('pointerup', endDrag);
      handle.addEventListener('pointercancel', endDrag);
      window.addEventListener('resize', () => {
        if (panel.classList.contains('hidden') || panel.style.left === '') return;
        const rect = panel.getBoundingClientRect();
        const next = clampPanel(rect.left, rect.top);
        panel.style.left = `${next.left}px`;
        panel.style.top = `${next.top}px`;
      });
    }

    function getChallengeAccent(def) {
      const accent = String(def?.accent || '#8dd4ff').trim();
      return /^#[0-9a-f]{3,8}$/i.test(accent) ? accent : '#8dd4ff';
    }

    function getChallengeStatus(def, state) {
      if (!state.isUnlocked) return `LOCKED UNTIL ${def.unlockLoops} ${LC}`;
      if (state.isOwned) return state.isSelected ? 'ACTIVE THIS RUN' : 'OWNED';
      return `BUY ${def.cost} ${LC}`;
    }

    function renderChallengeButtonContent(def, state) {
      const status = getChallengeStatus(def, state);
      const accent = getChallengeAccent(def);
      return `
        <span class="challenge-btn__icon" style="--challenge-accent:${accent}">${Neo.escapeHtml(def.icon || '!')}</span>
        <span class="challenge-btn__content">
          <span class="challenge-btn__top">
            <b>${Neo.escapeHtml(def.name)}</b>
            <em>${status}</em>
          </span>
          <span class="challenge-btn__meta">${Neo.escapeHtml(def.theme || 'Challenge')}</span>
          <span class="challenge-btn__desc">${Neo.escapeHtml(def.description)}</span>
          <span class="challenge-btn__reward">${Neo.escapeHtml(def.reward || 'Challenge reward')}</span>
        </span>
      `;
    }

    function getMetaChallengeContext() {
      const loopCrystals = Math.max(0, Number(Neo.metaProgress?.loopCrystals || 0));
      const unlocked = typeof Neo.getUnlockedChallengeSet === 'function'
        ? Neo.getUnlockedChallengeSet()
        : new Set((Neo.CHALLENGE_ORDER || []).filter(key => loopCrystals >= Number(Neo.CHALLENGE_DEFS[key]?.unlockLoops || 0)));
      const owned = typeof Neo.getOwnedChallengeSet === 'function'
        ? Neo.getOwnedChallengeSet()
        : new Set(Neo.normalizeChallengeSelection?.(Neo.metaProgress?.unlockedChallenges || []) || []);
      const selected = new Set(Neo.normalizeChallengeSelection?.(Neo.selectedChallenges || []) || []);
      return { loopCrystals, unlocked, owned, selected };
    }

    function renderMetaChallengeCard(key, context) {
      const def = Neo.CHALLENGE_DEFS[key];
      if (!def) return '';
      const isUnlocked = context.unlocked.has(key);
      const isOwned = context.owned.has(key);
      const isSelected = context.selected.has(key);
      const status = getChallengeStatus(def, { isUnlocked, isOwned, isSelected });
      const className = [
        'meta-challenge-card',
        !isUnlocked ? 'meta-challenge-card--locked' : '',
        isOwned ? 'meta-challenge-card--owned' : '',
        isSelected ? 'meta-challenge-card--active' : '',
      ].filter(Boolean).join(' ');
      return `<div class="${className}" style="--challenge-accent:${getChallengeAccent(def)}">
        <span class="meta-challenge-card__icon">${Neo.escapeHtml(def.icon || '!')}</span>
        <div class="meta-challenge-card__body">
          <div class="meta-challenge-card__top">
            <b>${Neo.escapeHtml(def.name)}</b>
            <em>${status}</em>
          </div>
          <div class="meta-challenge-card__tags">
            <span>${Neo.escapeHtml(def.theme || 'Challenge')}</span>
            <span>${Neo.escapeHtml(def.reward || 'Challenge reward')}</span>
          </div>
          <p>${Neo.escapeHtml(def.description)}</p>
        </div>
      </div>`;
    }

    function renderMetaProgressionInfo() {
      const context = getMetaChallengeContext();
      const selectedCount = context.selected.size;
      const ownedCount = context.owned.size;
      const challengeBonus = Math.max(0, Math.round(Neo.getActiveChallengeCrystalBonusMultiplier?.() || 0));
      const ownedLegacy = new Set(Neo.metaProgress?.unlockedLegacy || []);
      const legacyOrder = Neo.LEGACY_ORDER || [];
      const legacyCards = legacyOrder.map(key => {
        const def = Neo.LEGACY_UPGRADES[key];
        if (!def) return '';
        const isOwned = ownedLegacy.has(key);
        const status = isOwned ? 'UNLOCKED' : context.loopCrystals >= def.cost ? `BUY ${def.cost} ${LC}` : `NEED ${def.cost} ${LC}`;
        return `<div class="meta-legacy-card${isOwned ? ' meta-legacy-card--owned' : ''}">
          <span class="meta-legacy-card__sigil lc-icon">◆</span>
          <div>
            <div class="meta-legacy-card__top">
              <b>${Neo.escapeHtml(def.name)}</b>
              <em>${status}</em>
            </div>
            <p>${Neo.escapeHtml(def.effect || def.description || '')}</p>
          </div>
        </div>`;
      }).join('');
      return `<div class="meta-info-layout">
        <div class="meta-info-summary">
          <div class="meta-info-summary__stat"><span>Loop Crystals</span><b>${context.loopCrystals}</b></div>
          <div class="meta-info-summary__stat"><span>Challenges Owned</span><b>${ownedCount}/${(Neo.CHALLENGE_ORDER || []).length}</b></div>
          <div class="meta-info-summary__stat"><span>Active Bonus</span><b>+${challengeBonus} ${LC}</b></div>
        </div>
        <section class="meta-info-section">
          <div class="meta-info-section__head">
            <h3>Challenge Shop</h3>
            <span>${selectedCount} active</span>
          </div>
          <div class="meta-challenge-grid">
            ${(Neo.CHALLENGE_ORDER || []).map(key => renderMetaChallengeCard(key, context)).join('')}
          </div>
        </section>
        <section class="meta-info-section">
          <div class="meta-info-section__head">
            <h3>Permanent Upgrades</h3>
            <span>${ownedLegacy.size}/${legacyOrder.length} unlocked</span>
          </div>
          <div class="meta-legacy-grid">${legacyCards}</div>
        </section>
      </div>`;
    }

    function isCompactObjectiveViewport() {
      return window.innerWidth <= 920;
    }

    function getObjectiveCompactSummary(entries = []) {
      if (!entries.length) return 'No objectives';
      const doneCount = entries.filter(entry => String(entry?.state || '') === 'done').length;
      const primary = entries.find(entry => String(entry?.state || '') !== 'done') || entries[0];
      const primaryText = String(primary?.text || '').trim();
      return `${doneCount}/${entries.length} done${primaryText ? ` • ${primaryText}` : ''}`;
    }

    function syncObjectiveTrackerCompactState() {
      if (!view.objectiveTracker) return;
      const compact = isCompactObjectiveViewport();
      if (compact !== objectiveCompactMode) {
        objectiveCompactMode = compact;
        objectiveExpanded = compact ? false : true;
      }

      if (!objectiveTrackerVisible) {
        view.objectiveTracker.classList.remove('objective-tracker--compact', 'objective-tracker--expanded');
        if (view.objectiveSummary) view.objectiveSummary.classList.add('hidden');
        if (view.objectiveList) view.objectiveList.classList.remove('hidden');
        if (view.objectiveToggle) {
          view.objectiveToggle.classList.add('hidden');
          view.objectiveToggle.setAttribute('aria-expanded', 'false');
        }
        return;
      }

      view.objectiveTracker.classList.toggle('objective-tracker--compact', objectiveCompactMode);
      view.objectiveTracker.classList.toggle('objective-tracker--expanded', !objectiveCompactMode || objectiveExpanded);
      if (view.objectiveToggle) {
        const showToggle = objectiveCompactMode;
        view.objectiveToggle.classList.toggle('hidden', !showToggle);
        view.objectiveToggle.setAttribute('aria-expanded', objectiveExpanded ? 'true' : 'false');
        view.objectiveToggle.textContent = objectiveExpanded ? 'Hide' : 'Show';
      }
      if (view.objectiveSummary) {
        const showSummary = objectiveCompactMode && !objectiveExpanded;
        view.objectiveSummary.classList.toggle('hidden', !showSummary);
        view.objectiveSummary.textContent = showSummary ? getObjectiveCompactSummary(objectiveEntriesCache) : '';
      }
      if (view.objectiveList) {
        view.objectiveList.classList.toggle('hidden', objectiveCompactMode && !objectiveExpanded);
      }
    }

    function setObjectiveLayout(layout) {
      if (!view.objectiveTracker) return;
      if (!layout) {
        if (objectiveLayoutCache !== null) {
          view.objectiveTracker.style.removeProperty('top');
          view.objectiveTracker.style.removeProperty('right');
          view.objectiveTracker.style.removeProperty('width');
          view.objectiveTracker.style.removeProperty('max-height');
          view.objectiveTracker.style.removeProperty('overflow-y');
          objectiveLayoutCache = null;
        }
        return;
      }

      const margin = 8;
      const gap = window.innerWidth <= 920 ? 16 : 24;
      const trackerWidth = Math.round(Neo.clamp(window.innerWidth <= 920 ? 248 : 284, 216, window.innerWidth - margin * 2));
      let right = Math.round(Neo.clamp(window.innerWidth - layout.left + gap, margin, window.innerWidth - trackerWidth - margin));
      let top = Math.max(margin, Math.round(layout.top));
      let maxHeight = Math.floor(window.innerHeight - top - margin);

      // Keep objectives beside the minimap when possible; if vertical space is
      // too tight, drop below the map as the fallback.
      if (maxHeight < 184) {
        top = Math.max(margin, Math.round(layout.bottom + gap));
        right = Math.round(Neo.clamp(window.innerWidth - layout.right, margin, window.innerWidth - trackerWidth - margin));
        maxHeight = Math.floor(window.innerHeight - top - margin);
      }

      const nextLayout = {
        top,
        right,
        width: trackerWidth,
        maxHeight: Math.max(148, maxHeight),
      };
      if (!objectiveLayoutCache
        || objectiveLayoutCache.top !== nextLayout.top
        || objectiveLayoutCache.right !== nextLayout.right
        || objectiveLayoutCache.width !== nextLayout.width
        || objectiveLayoutCache.maxHeight !== nextLayout.maxHeight) {
        view.objectiveTracker.style.top = `${nextLayout.top}px`;
        view.objectiveTracker.style.right = `${nextLayout.right}px`;
        view.objectiveTracker.style.width = `${nextLayout.width}px`;
        view.objectiveTracker.style.maxHeight = `${nextLayout.maxHeight}px`;
        view.objectiveTracker.style.overflowY = 'auto';
        objectiveLayoutCache = nextLayout;
      }
      syncObjectiveTrackerCompactState();
    }

    if (view.objectiveToggle) {
      view.objectiveToggle.addEventListener('click', () => {
        if (!objectiveCompactMode || !objectiveTrackerVisible) return;
        objectiveExpanded = !objectiveExpanded;
        syncObjectiveTrackerCompactState();
      });
    }

    if (view.objectiveClose) {
      // Closing the panel turns off the "Objective panel" gameplay setting, so it
      // stays hidden (and persists) until re-enabled from Settings.
      view.objectiveClose.addEventListener('click', () => {
        if (window.NeoSettings?.setShowObjectivePanel) {
          window.NeoSettings.setShowObjectivePanel(false);
        } else {
          objectiveTrackerVisible = false;
          view.objectiveTracker?.classList.add('hidden');
          view.objectiveTracker?.setAttribute('aria-hidden', 'true');
          syncObjectiveTrackerCompactState();
        }
      });
    }

    window.addEventListener('resize', () => {
      syncObjectiveTrackerCompactState();
    });

    function getVisibleRunHistoryEntries() {
      if (runHistoryModeFilter === 'all') return runHistoryEntries;
      return runHistoryEntries.filter(entry => Neo.normalizeGameMode(entry.mode) === runHistoryModeFilter);
    }

    function setTextIfChanged(node, nextValue) {
      if (!node) return;
      const value = String(nextValue ?? '');
      if (node.textContent !== value) node.textContent = value;
    }

    function getSkillCacheValue(skill) {
      if (!skill) return null;
      const timers = Array.isArray(skill.timers) ? skill.timers.join(',') : '';
      return `${skill.current}|${skill.max}|${!!skill.active}|${skill.charges}|${skill.maxCharges}|${timers}`;
    }

    function updateSkillCardIfChanged(name, skill) {
      if (!skill) return;
      const nextCache = getSkillCacheValue(skill);
      if (hudRenderCache.skills[name] === nextCache) return;
      hudRenderCache.skills[name] = nextCache;
      setSkillCard(name, skill.current, skill.max, !!skill.active, skill.charges, skill.maxCharges, skill.timers);
    }

    function renderRunHistoryModeTabs() {
      view.runHistoryModeTabs.forEach(tab => {
        const tabMode = tab.dataset.mode || 'all';
        const active = tabMode === runHistoryModeFilter;
        tab.classList.toggle('active', active);
      });
    }

    function makeContainer(element, visibleDisplay = '') {
      return {
        show() {
          if (!element) return;
          element.classList.remove('hidden');
          element.style.display = visibleDisplay;
        },
        hide() {
          if (!element) return;
          element.classList.add('hidden');
          element.style.display = 'none';
        },
      };
    }

    function setSkillCard(name, current, max, active = false, charges = 0, maxCharges = 1, timers = null) {
      const fill = name === 'melee' ? view.fillMelee
        : name === 'laser' ? view.fillLaser
          : name === 'smash' ? view.fillSmash
            : view.fillDash;
      const time = name === 'melee' ? view.timeMelee
        : name === 'laser' ? view.timeLaser
          : name === 'smash' ? view.timeSmash
            : view.timeDash;
      const card = view.actionCards[name];
      const ready = charges > 0 && !active;
      // One fill fraction per recovering charge, derived from its own timer, so a
      // freshly-spent pip starts near empty instead of inheriting the progress of
      // an earlier in-flight timer (which made extra charges look auto-loaded).
      const pipFills = computePipFills(charges, maxCharges, max, current, timers);
      const partialCharge = pipFills[charges] || 0;
      const ratio = maxCharges <= 0 ? 0 : Neo.clamp((charges + partialCharge) / maxCharges, 0, 1);
      if (fill) fill.style.height = `${ratio * 100}%`;
      if (time) {
        time.textContent = active
          ? 'CAST'
          : maxCharges > 1 && charges > 0
            ? `${charges}/${maxCharges}`
            : ready
              ? 'READY'
              : current.toFixed(1);
      }
      if (card) {
        card.classList.toggle('ready', ready);
        updateSkillCharges(card, charges, maxCharges, pipFills);
      }
    }

    // Build a per-pip fill array of length maxCharges: charges in hand read full,
    // each recovering charge reads the progress of its own timer. Timers are
    // sorted most-progressed first so pips fill left-to-right as charges return.
    function computePipFills(charges, maxCharges, max, current, timers) {
      const fills = new Array(Math.max(0, maxCharges)).fill(0);
      for (let i = 0; i < charges && i < fills.length; i += 1) fills[i] = 1;
      if (max <= 0) return fills;
      const list = Array.isArray(timers) && timers.length
        ? timers.slice()
        : (current > 0 ? [current] : []);
      // Least time remaining first -> fullest pip first, placed after the held charges.
      list.sort((a, b) => a - b);
      for (let i = 0; i < list.length && charges + i < fills.length; i += 1) {
        fills[charges + i] = Neo.clamp(1 - (list[i] / max), 0, 1);
      }
      return fills;
    }

    // Render one pip per charge so skills with extra charges read at a glance:
    // filled pips = charges in hand, recovering pips fill from their own timers.
    function updateSkillCharges(card, charges, maxCharges, pipFills) {
      let pips = card.querySelector('.skill-charges');
      if (maxCharges <= 1) {
        if (pips) pips.remove();
        return;
      }
      if (!pips || pips.childElementCount !== maxCharges) {
        if (!pips) {
          pips = document.createElement('div');
          pips.className = 'skill-charges';
          card.appendChild(pips);
        }
        pips.replaceChildren();
        for (let i = 0; i < maxCharges; i += 1) {
          pips.appendChild(document.createElement('i'));
        }
      }
      const dots = pips.children;
      for (let i = 0; i < dots.length; i += 1) {
        const value = pipFills[i] || 0;
        const filled = i < charges;
        const filling = !filled && value > 0;
        dots[i].classList.toggle('full', filled);
        dots[i].classList.toggle('charging', filling);
        dots[i].style.setProperty('--pip', value);
      }
    }

    function resolveDialoguePortraitKey(speaker = '') {
      const raw = String(speaker || '').trim();
      if (!raw) return Neo.getPlayerSpriteKey();
      const normalized = raw
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalized) return Neo.getPlayerSpriteKey();

      const directKey = normalized.replace(/ /g, '_');
      if (Neo.SPRITE_DEFS[directKey]) return directKey;

      const noRival = normalized.replace(/^rival\s+/, '');
      const noRivalKey = noRival.replace(/ /g, '_');
      if (Neo.SPRITE_DEFS[noRivalKey]) return noRivalKey;

      if (normalized.includes('knight')) return 'thorn_knight';
      if (normalized.includes('knave')) return 'artificer_knave';
      if (normalized.includes('thorn')) return 'thorn_knight';
      if (normalized.includes('princess')) return 'princess';
      // The Metao hero is sometimes addressed as "Mateo" in dialogue — accept
      // both spellings so the portrait still resolves to the metao sprite.
      if (normalized.includes('metao') || normalized.includes('mateo')) return 'metao';
      if (normalized.includes('gelleh') || normalized.includes('granialla')) return 'gelleh';
      if (normalized.includes('mooggy')) return 'mooggy';
      if (normalized.includes('queen')) return 'queen_cult';
      if (normalized.includes('bulk') && normalized.includes('golem')) return 'bulk_golem';
      if (normalized.includes('artificer')) return 'artificer_knave';
      if (normalized.includes('antony') || normalized.includes('blemmye')) return 'antony_blemmye';
      if (normalized.includes('handsome') && normalized.includes('devil')) return 'handsome_devil';
      if (normalized.includes('golem')) return 'golem';
      if (normalized.includes('god')) return 'god';
      if (normalized.includes('mirror')) return Neo.getPlayerSpriteKey();
      return 'hunter';
    }

    function renderDialogue() {
      if (!view.dialogueOverlay || !view.dialogueSpeaker || !view.dialogueText) return;
      const snapshot = dialogueRuntime?.getSnapshot?.() || { active: false, speaker: 'GOD', visibleText: '', isFullyTyped: false };
      if (dialogueRenderCache.active !== snapshot.active) {
        view.dialogueOverlay.classList.toggle('hidden', !snapshot.active);
        view.dialogueOverlay.style.display = snapshot.active ? 'flex' : 'none';
        view.dialogueOverlay.setAttribute('aria-hidden', snapshot.active ? 'false' : 'true');
        dialogueRenderCache.active = snapshot.active;
      }
      if (!snapshot.active) {
        dialogueRenderCache.portraitKey = null;
        if (view.dialoguePortrait instanceof HTMLCanvasElement) {
          const portraitCtx = view.dialoguePortrait.getContext('2d');
          portraitCtx?.clearRect(0, 0, view.dialoguePortrait.width, view.dialoguePortrait.height);
        }
        return;
      }
      const speaker = snapshot.speaker || 'GOD';
      const text = snapshot.visibleText || '';
      if (dialogueRenderCache.speaker !== speaker) {
        view.dialogueSpeaker.textContent = speaker;
        dialogueRenderCache.speaker = speaker;
      }
      if (dialogueRenderCache.text !== text) {
        view.dialogueText.textContent = text;
        dialogueRenderCache.text = text;
      }
      if (view.dialoguePortrait instanceof HTMLCanvasElement) {
        const spriteKey = resolveDialoguePortraitKey(speaker);
        if (dialogueRenderCache.portraitKey !== spriteKey) {
          Neo.drawSpriteToCanvas(view.dialoguePortrait, spriteKey, view.dialoguePortrait.width);
          dialogueRenderCache.portraitKey = spriteKey;
        }
      }
      if (view.dialogueHint) {
        const hint = snapshot.isFullyTyped ? 'ENTER TO CONTINUE' : 'ENTER TO SKIP';
        if (dialogueRenderCache.hint !== hint) {
          view.dialogueHint.textContent = hint;
          dialogueRenderCache.hint = hint;
        }
      }
    }

    function renderEntityDialogue() {
      const layer = view.entityDialogueLayer;
      if (!layer) return;
      const bubbles = worldSpeechRuntime?.getActive?.() || [];
      layer.classList.toggle('hidden', bubbles.length === 0);
      layer.style.display = bubbles.length ? 'block' : 'none';
      layer.setAttribute('aria-hidden', bubbles.length ? 'false' : 'true');
      if (!bubbles.length) {
        if (entityDialogueNodes.size) {
          entityDialogueNodes.forEach(node => node.el.remove());
          entityDialogueNodes.clear();
        }
        return;
      }
      const rect = Neo.canvas.getBoundingClientRect();
      const scaleX = rect.width / Neo.canvas.width;
      const scaleY = rect.height / Neo.canvas.height;
      const activeKeys = new Set();
      bubbles.forEach((bubble, index) => {
        const key = String(bubble.id || `${bubble.speaker || ''}:${index}`);
        activeKeys.add(key);
        const screenX = (bubble.anchor.x - Neo.camera.x) * scaleX;
        const screenY = (bubble.anchor.y - Neo.camera.y - (bubble.offsetY || 48)) * scaleY;
        let node = entityDialogueNodes.get(key);
        if (!node) {
          const el = document.createElement('div');
          el.className = 'entity-dialogue-bubble';
          const textNode = document.createElement('div');
          textNode.className = 'entity-dialogue-text';
          el.appendChild(textNode);
          node = { el, textNode, nameNode: null, visible: false };
          entityDialogueNodes.set(key, node);
        }
        if (screenX < -140 || screenX > rect.width + 140 || screenY < -140 || screenY > rect.height + 80) {
          if (node.visible) {
            node.el.style.display = 'none';
            node.visible = false;
          }
          return;
        }
        const tone = bubble.tone || 'boss';
        if (node.el.dataset.tone !== tone) node.el.dataset.tone = tone;
        const left = `${screenX}px`;
        const top = `${screenY}px`;
        if (node.el.style.left !== left) node.el.style.left = left;
        if (node.el.style.top !== top) node.el.style.top = top;
        if (!node.visible) {
          node.el.style.display = '';
          node.visible = true;
        }
        const speaker = bubble.speaker || '';
        if (speaker) {
          if (!node.nameNode) {
            const name = document.createElement('div');
            name.className = 'entity-dialogue-name';
            node.nameNode = name;
            node.el.insertBefore(name, node.textNode);
          }
          if (node.nameNode.textContent !== speaker) node.nameNode.textContent = speaker;
        } else if (node.nameNode) {
          node.nameNode.remove();
          node.nameNode = null;
        }
        const text = bubble.visibleText || '';
        if (node.textNode.textContent !== text) node.textNode.textContent = text;
        if (!node.el.isConnected) layer.appendChild(node.el);
      });
      entityDialogueNodes.forEach((node, key) => {
        if (activeKeys.has(key)) return;
        node.el.remove();
        entityDialogueNodes.delete(key);
      });
    }

    function fallbackState(state) {
      const show = state || 'menu';
      function setVisible(element, visible, displayValue = '') {
        if (!element) return;
        element.classList.toggle('hidden', !visible);
        element.style.display = visible ? displayValue : 'none';
      }
      view.start.classList.toggle('hidden',     show !== 'menu');
      view.charSelect?.classList.toggle('hidden', show !== 'charselect');
      view.dead.classList.toggle('hidden',      show !== 'dead');
      view.win.classList.toggle('hidden',       show !== 'win');
      const inventoryPause = !!Neo.inventoryPauseActive && !!view.invPanel && !view.invPanel.classList.contains('hidden');
      const pauseVisible = show === 'pause' && !inventoryPause;
      if (view.pause) {
        if (pauseVisible) {
          Neo.clearPanelCloseEffect?.(view.pause);
          view.pause.classList.remove('hidden');
          view.pause.setAttribute('aria-hidden', 'false');
          // Replay the same cinematic title component the main menu uses.
          // (The animator clears prior letters, so it's safe to call every time
          // the pause overlay opens — no wasHidden gate needed.)
          window.NeoAnimateMenuTitle?.(
            document.getElementById('pauseMenuLetters'),
            document.getElementById('pauseMenuSubtitle')
          );
        } else {
          if (!inventoryPause && !view.pause.classList.contains('hidden')) Neo.playPanelCloseEffect?.(view.pause);
          else if (inventoryPause) Neo.clearPanelCloseEffect?.(view.pause);
          view.pause.classList.add('hidden');
          view.pause.setAttribute('aria-hidden', 'true');
        }
      }
      const inPlay = show === 'play' || show === 'pause' || show === 'dialogue' || show === 'dying';
      setVisible(view.hud, false, 'none');
      setVisible(view.actionBar, show === 'play' || show === 'pause' || show === 'dying', '');
      setVisible(view.hudLower, show === 'play' || show === 'pause', '');
      setVisible(view.equipmentSlots, show === 'play' || show === 'pause', '');
      setVisible(view.playerStats, inPlay, '');
      setVisible(view.coinDisplay, inPlay, 'flex');
      setVisible(view.centerDisplay, inPlay, '');
      setVisible(view.objectiveTracker, inPlay, '');
      setVisible(view.dialogueOverlay, show === 'dialogue', 'flex');
      if (show !== 'play') setVisible(view.tutorialOverlay, false, 'flex');
      setVisible(view.entityDialogueLayer, inPlay, 'block');
      if (!inPlay && view.challengeStatus) {
        view.challengeStatus.classList.add('hidden');
        view.challengeStatus.setAttribute('aria-hidden', 'true');
      }
      if (show !== 'charselect') { setChallengePanelOpen(false); setLegacyPanelOpen(false); }
      if (show !== 'menu' && show !== 'pause') setRunHistoryOpen(false);
      if (show !== 'menu') { setAltModesPanelOpen(false); setCompetitivePanelOpen(false); setSandboxPanelOpen(false); }
      if (show !== 'menu') tutorialMenuOfferVisible = false;
      setVisible(view.endlessHud, inPlay && Neo.gameMode === 'endless', 'flex');
      setVisible(
        view.practicePanel,
        inPlay && Neo.gameMode === 'practice' && Neo.practiceVariant !== 'challenges' && show !== 'dying',
        'block',
      );
      const isBossRush = Neo.gameMode === 'boss_rush';
      if (view.timerFloorSlot) view.timerFloorSlot.style.display = isBossRush ? 'none' : '';
      if (view.timerBossSlot) view.timerBossSlot.style.display = isBossRush ? '' : 'none';
    }

    function setChallengePanelOpen(open) {
      challengePanelOpen = !!open;
      view.challengePanel?.classList.toggle('hidden', !challengePanelOpen);
      view.challengePanel?.setAttribute('aria-hidden', challengePanelOpen ? 'false' : 'true');
      view.challengeToggle?.setAttribute('aria-expanded', challengePanelOpen ? 'true' : 'false');
    }

    let legacyPanelOpen = false;
    function setLegacyPanelOpen(open) {
      legacyPanelOpen = !!open;
      view.legacyPanel?.classList.toggle('hidden', !legacyPanelOpen);
      view.legacyPanel?.setAttribute('aria-hidden', legacyPanelOpen ? 'false' : 'true');
      view.legacyToggle?.setAttribute('aria-expanded', legacyPanelOpen ? 'true' : 'false');
    }

    let runHistoryView = 'info';
    let activeInfoTab = 'items';
    const infoSearchQueries = { items: '', scrolls: '', weapons: '', moves: '', enemies: '' };
    const searchableInfoTabs = new Set(['items', 'scrolls', 'weapons', 'moves', 'enemies']);

    function setRunHistoryOpen(open) {
      ensureRunHistoryPanelCanOverlayGame();
      runHistoryOpen = !!open;
      view.runHistoryPanel?.classList.toggle('hidden', !runHistoryOpen);
      view.runHistoryPanel?.setAttribute('aria-hidden', runHistoryOpen ? 'false' : 'true');
      if (view.runHistoryBtn) {
        view.runHistoryBtn.textContent = runHistoryOpen ? 'HIDE INFO' : 'INFO';
        view.runHistoryBtn.setAttribute('aria-expanded', runHistoryOpen ? 'true' : 'false');
      }
      if (open) setRunHistoryView('info');
    }

    function setRunHistoryView(view_) {
      runHistoryView = view_;
      const showAch     = view_ === 'achievements';
      const showProfile = view_ === 'profile';
      const showInfo    = view_ === 'info';
      const showBlog    = view_ === 'blog';
      const showRuns    = !showAch && !showProfile && !showInfo && !showBlog;
      view.runHistoryBody?.classList.toggle('hidden', !showRuns);
      view.runHistoryEmpty?.classList.toggle('hidden', true);
      view.achievementsList?.classList.toggle('hidden', !showAch);
      view.rhProfilePanel?.classList.toggle('hidden', !showProfile);
      view.rhInfoPanel?.classList.toggle('hidden', !showInfo);
      view.rhBlogPanel?.classList.toggle('hidden', !showBlog);
      const titles = { achievements: 'ACHIEVEMENTS', profile: 'PROFILE', runs: 'RUN HISTORY', info: 'INFO', blog: 'BLOG' };
      if (view.runHistoryPanelTitle) view.runHistoryPanelTitle.textContent = titles[view_] ?? 'INFO';
      view.runHistoryViewTabs?.forEach(t => t.classList.toggle('active', t.dataset.view === view_));
      if (showAch) populateAchievementsPanel();
      else if (showProfile) {
        if (view.rhBankCoins)  view.rhBankCoins.textContent  = Neo.metaProgress.coins ?? 0;
        if (view.rhLoopCount)  view.rhLoopCount.textContent  = Neo.metaProgress.loopCrystals ?? 0;
        if (view.rhBestFloor)  view.rhBestFloor.textContent  = Neo.metaProgress.bestFloor ?? 1;
        if (view.rhSaveState)  view.rhSaveState.textContent  = view.saveState?.textContent ?? '—';
      }
      else if (showInfo) populateInfoPanel(activeInfoTab);
      else if (showBlog) window.dispatchEvent(new CustomEvent('neo:blog-tab-opened'));
      else { view.runHistoryEmpty?.classList.toggle('hidden', Neo.runHistory.length > 0); renderRunHistoryPage(); }
    }

    const ENEMY_INFO = [
      { key: 'hunter',          label: 'Hunter',          boss: false, hp: 52,   dmg: 12, speed: 96,  attackStyle: 'melee',   immunities: [],                                    desc: 'Relentless tracker that closes in fast and slashes. Low HP but high pressure.' },
      { key: 'charger',         label: 'Charger',         boss: false, hp: 68,   dmg: 14, speed: 118, attackStyle: 'dash',    immunities: [],                                    desc: 'Winds up then dashes straight at the player for heavy knockback damage.' },
      { key: 'laser',           label: 'Laser Unit',      boss: false, hp: 52,   dmg: 12, speed: 96,  attackStyle: 'ranged',  immunities: [],                                    desc: 'Fires a precision beam from range. Keeps distance and punishes slow movement.' },
      { key: 'knave',           label: 'Knave',           boss: false, hp: 68,   dmg: 14, speed: 118, attackStyle: 'melee',   immunities: [],                                    desc: 'Fast melee fighter with erratic movement. Hard to read at close range.' },
      { key: 'sniper',          label: 'Sniper',          boss: false, hp: 58,   dmg: 12, speed: 104, attackStyle: 'ranged',  immunities: [],                                    desc: 'Long-range shooter that aims carefully before firing a high-damage shot.' },
      { key: 'machine_gunner',  label: 'Machine Gunner',  boss: false, hp: 96,   dmg: 8,  speed: 112, attackStyle: 'burst',   immunities: [],                                    desc: 'Sprays bullets in rapid bursts. Low per-shot damage but overwhelming volume.' },
      { key: 'golem',           label: 'Golem',           boss: false, hp: 132,  dmg: 18, speed: 70,  attackStyle: 'melee',   immunities: ['bleed'],                             desc: 'Slow stone tank immune to bleed. High HP and damage make it dangerous up close.' },
      { key: 'cult_mage',       label: 'Cult Mage',       boss: false, hp: 84,   dmg: 18, speed: 58,  attackStyle: 'ranged',  immunities: [],                                    desc: 'Slow-moving caster that hurls powerful projectiles. Prioritise from a distance.' },
      { key: 'cult_follower',   label: 'Cult Follower',   boss: false, hp: 34,   dmg: 8,  speed: 138, attackStyle: 'melee',   immunities: [],                                    desc: 'Frail but extremely fast swarmer. Dangerous in groups.' },
      { key: 'summoner',        label: 'Summoner',        boss: false, hp: 120,  dmg: 12, speed: 66,  attackStyle: 'summon',  immunities: [],                                    desc: 'Hangs back and periodically summons reinforcements. Kill it first.' },
      { key: 'shield_unit',     label: 'Shield Unit',     boss: false, hp: 210,  dmg: 10, speed: 52,  attackStyle: 'melee',   immunities: ['bleed'],                             desc: 'Heavy armoured tank with a barrier. Bleed immune. Can boost nearby allies.' },
      { key: 'healer',          label: 'Healer',          boss: false, hp: 150,  dmg: 10, speed: 64,  attackStyle: 'support', immunities: [],                                    desc: 'Restores HP to nearby enemies on a cooldown. Eliminate it before it undoes your damage.' },
      { key: 'boss_spawner',    label: 'Boss Spawner',    boss: false, hp: 300,  dmg: 8,  speed: 42,  attackStyle: 'summon',  immunities: ['bleed'],                             desc: 'Immobile spawner that releases enemies on a timer. Destroy it before the countdown ends.' },
      { key: 'bulk_golem',      label: 'Bulk Golem',      boss: true,  hp: 1280, dmg: 31, speed: 88,  attackStyle: 'melee',   immunities: ['bleed'],                             desc: 'Boss. Massive golem that splits into smaller golems at low HP. Ground-slam AOE attack.' },
      { key: 'artificer_knave', label: 'Artificer Knave', boss: true,  hp: 1880, dmg: 20, speed: 124, attackStyle: 'melee',   immunities: [],                                    desc: 'Boss. High-speed multi-phase fighter. Becomes more aggressive at each phase threshold.' },
      { key: 'queen_cult',      label: 'Queen Cult',      boss: true,  hp: 912,  dmg: 20, speed: 96,  attackStyle: 'summon',  immunities: [],                                    desc: 'Boss. Cult leader that summons followers and mages while striking with projectiles.' },
      { key: 'antony_blemmye',  label: 'Antony Blemmyae',  boss: true,  hp: 1250, dmg: 24, speed: 78,  attackStyle: 'melee',   immunities: ['bleed'],                             desc: 'Boss. Chest-faced bruiser. Up close he bites to drain HP or sweeps a wide slash; his hammer sends a shockwave forward and he charges a cold death ball at range.' },
      { key: 'handsome_devil',  label: 'Handsome Devil',  boss: true,  hp: 1700, dmg: 23, speed: 104, attackStyle: 'hazard',  immunities: ['fire'],                              desc: 'Floor 6 boss. Phase 1 raises red floor spikes and lava grids. Phase 2 fires red laser eyes.' },
      { key: 'bowman_bane',     label: "Bowman's Bane",   boss: true,  hp: 2400, dmg: 22, speed: 80,  attackStyle: 'beam',    immunities: [],                                    desc: 'Secret boss. Found by revisiting a cleared secret room. Drops lightning columns and sweeps a tracking beam. At half HP he unleashes Justice of Sonichu — a fan of room-spanning lightning bolts that strike across the arena.' },
      { key: 'mirror_knight',   label: 'Mirror Champion', boss: true,  hp: 0,    dmg: 0,  speed: 0,   attackStyle: 'mirror',  immunities: [],                                    desc: 'Elite. Copies the player\'s equipped moves and items. The perfect counter to your build.' },
      { key: 'mooggy',          label: 'Mooggy',          boss: false, hp: 0,    dmg: 0,  speed: 0,   attackStyle: 'assassin',immunities: ['bleed'],                             desc: 'White and black assassin cat with a red aura. Mirrors your stats and items, then fires rapid bleed-stacking eye lasers.' },
      { key: 'god',             label: 'GOD',             boss: true,  hp: 920,  dmg: 18, speed: 108, attackStyle: 'beam',    immunities: ['bleed', 'fire', 'poison', 'dark'],   desc: 'Final boss. Multi-phase deity with beam sweeps, nova blasts, and judgement strikes. Immune to all status effects.' },
    ];

    function getCharacterStartingItems(characterKey) {
      return Neo.getCharacterStartingItems?.(characterKey) || {};
    }

    function normalizeInfoSearch(value) {
      return String(value || '').trim().toLowerCase();
    }

    function infoSearchMatches(entry, fields) {
      const query = normalizeInfoSearch(infoSearchQueries[activeInfoTab]);
      if (!query) return true;
      return fields(entry)
        .filter(value => value !== undefined && value !== null)
        .some(value => String(value).toLowerCase().includes(query));
    }

    function renderInfoEmpty(label) {
      const query = infoSearchQueries[activeInfoTab] || '';
      return `<div class="info-empty">No ${label} match "${Neo.escapeHtml(query)}".</div>`;
    }

    function syncInfoSearchControl(tab) {
      if (!view.rhInfoSearch) return;
      const searchable = searchableInfoTabs.has(tab);
      view.rhInfoSearch.classList.toggle('hidden', !searchable);
      view.rhInfoSearch.disabled = !searchable;
      if (!searchable) {
        view.rhInfoSearch.value = '';
        return;
      }
      const label = tab === 'items' ? 'items' : tab === 'scrolls' ? 'scrolls' : tab === 'weapons' ? 'weapons' : tab === 'moves' ? 'moves' : 'enemies';
      view.rhInfoSearch.placeholder = `Search ${label}...`;
      view.rhInfoSearch.setAttribute('aria-label', `Search ${label}`);
      view.rhInfoSearch.value = infoSearchQueries[tab] || '';
    }

    function populateInfoPanel(tab) {
      activeInfoTab = tab;
      if (!view.rhInfoContent) return;
      view.rhInfoTabs?.forEach(t => t.classList.toggle('active', t.dataset.infoTab === tab));
      syncInfoSearchControl(tab);

      if (tab === 'items') {
        const rarityOrder = ['knight', 'wizard', 'god', 'blue'];
        const sorted = Object.values(Neo.ITEM_DEFS).sort((a, b) => {
          const ri = rarityOrder.indexOf(a.rarity ?? a.category) - rarityOrder.indexOf(b.rarity ?? b.category);
          return ri !== 0 ? ri : (a.name || '').localeCompare(b.name || '');
        }).filter(item => infoSearchMatches(item, item_ => [
          item_.name,
          item_.key,
          item_.rarity,
          item_.category,
          item_.description,
        ]));
        view.rhInfoContent.innerHTML = sorted.length ? `<div class="info-grid">${sorted.map(item => {
          const rarity = item.rarity || item.category || 'knight';
          const rarityLabel = Neo.getRarityDisplayName?.(rarity) || rarity;
          return `<div class="info-card">
            <div class="info-card__header">
              <canvas class="info-card__icon" data-info-item="${item.key}" width="32" height="32"></canvas>
              <span class="info-card__name">${item.name}</span>
              <span class="info-card__tag info-card__tag--${rarity}">${rarityLabel}</span>
            </div>
            <div class="info-card__desc">${item.description || ''}</div>
          </div>`;
        }).join('')}</div>` : renderInfoEmpty('items');
        Neo.drawItemIconCanvases?.(view.rhInfoContent, 'data-info-item');

      } else if (tab === 'scrolls') {
        // Scrolls are their own system (Neo.SCROLL_DEFS), shown on a dedicated tab
        // rather than mixed into the relic Items tab.
        const scrolls = Object.values(Neo.SCROLL_DEFS || {})
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          .filter(scroll => infoSearchMatches(scroll, s => [s.name, s.key, s.description]));
        view.rhInfoContent.innerHTML = scrolls.length ? `<div class="info-grid">${scrolls.map(scroll => {
          return `<div class="info-card">
            <div class="info-card__header">
              <canvas class="info-card__icon" data-info-item="${scroll.key}" width="32" height="32"></canvas>
              <span class="info-card__name">${scroll.name}</span>
              <span class="info-card__tag info-card__tag--knight">scroll</span>
            </div>
            <div class="info-card__desc">${scroll.description || ''}</div>
          </div>`;
        }).join('')}</div>` : renderInfoEmpty('scrolls');
        Neo.drawItemIconCanvases?.(view.rhInfoContent, 'data-info-item');

      } else if (tab === 'weapons') {
        const rarityOrder = ['knight', 'wizard', 'god'];
        const sorted = Object.values(Neo.WEAPON_DEFS).sort((a, b) => {
          const ri = rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
          return ri !== 0 ? ri : (a.name || '').localeCompare(b.name || '');
        }).filter(w => infoSearchMatches(w, weapon => [
          weapon.name,
          weapon.key,
          weapon.rarity,
          weapon.description,
        ]));
        view.rhInfoContent.innerHTML = sorted.length ? `<div class="info-grid">${sorted.map(w => {
          return `<div class="info-card">
            <div class="info-card__header">
              <canvas class="info-card__icon" data-info-weapon="${w.key}" width="32" height="32"></canvas>
              <span class="info-card__name">${w.name}</span>
              <span class="info-card__tag info-card__tag--${w.rarity}">${w.rarity}</span>
            </div>
            <div class="info-card__desc">${w.description || ''}</div>
          </div>`;
        }).join('')}</div>` : renderInfoEmpty('weapons');
        view.rhInfoContent.querySelectorAll('[data-info-weapon]').forEach(el => {
          const w = Neo.WEAPON_DEFS[el.dataset.infoWeapon];
          if (w) Neo.drawWeaponToastIcon(el, w);
        });

      } else if (tab === 'moves') {
        const slotOrder = ['melee', 'laser', 'smash', 'dash'];
        const sorted = Object.values(Neo.MOVE_DEFS).sort((a, b) => {
          const si = slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot);
          return si !== 0 ? si : (a.name || '').localeCompare(b.name || '');
        }).filter(m => infoSearchMatches(m, move => [
          move.name,
          move.key,
          move.slot,
          Neo.SLOT_LABELS[move.slot],
          move.exclusiveCharacter,
          move.desc,
        ]));
        view.rhInfoContent.innerHTML = sorted.length ? `<div class="info-grid">${sorted.map(m => {
          const slotLabel = Neo.SLOT_LABELS[m.slot] || m.slot;
          const exclusive = m.exclusiveCharacter
            ? `<br><em style="color:rgba(200,200,255,0.5)">${Neo.titleCase(m.exclusiveCharacter.replace(/_/g, ' '))} only</em>`
            : '';
          return `<div class="info-card">
            <div class="info-card__header">
              <canvas class="info-card__icon" data-info-move="${m.key}" width="32" height="32"></canvas>
              <span class="info-card__name">${m.name}</span>
              <span class="info-card__tag info-card__tag--${m.slot}">${slotLabel}</span>
            </div>
            <div class="info-card__desc">${m.desc || ''}${exclusive}</div>
          </div>`;
        }).join('')}</div>` : renderInfoEmpty('moves');
        view.rhInfoContent.querySelectorAll('[data-info-move]').forEach(el => {
          const move = Neo.MOVE_DEFS[el.dataset.infoMove];
          if (move) Neo.drawMoveToastIcon(el, move);
        });

      } else if (tab === 'enemies') {
        const attackStyleLabel = { melee: 'Melee', dash: 'Dash', ranged: 'Ranged', burst: 'Burst', summon: 'Summoner', support: 'Support', mirror: 'Mirror', assassin: 'Assassin', beam: 'Beam' };
        const filteredEnemies = ENEMY_INFO.filter(e => infoSearchMatches(e, enemy => [
          enemy.label,
          enemy.key,
          enemy.boss ? 'boss' : 'enemy',
          enemy.attackStyle,
          attackStyleLabel[enemy.attackStyle],
          enemy.immunities.join(' '),
          enemy.hp,
          enemy.dmg,
          enemy.speed,
          enemy.desc,
        ]));
        view.rhInfoContent.innerHTML = `
          <div class="info-enemy-layout">
            <div class="info-enemy-grid">${filteredEnemies.length ? filteredEnemies.map(e => {
              const tagClass = e.boss ? 'info-enemy-card__tag--boss' : 'info-enemy-card__tag--normal';
              return `<div class="info-enemy-card" data-enemy-select="${e.key}" tabindex="0">
                <canvas class="info-enemy-card__sprite" data-info-enemy="${e.key}" width="52" height="52"></canvas>
                <div class="info-enemy-card__name">${e.label}</div>
                <span class="info-enemy-card__tag ${tagClass}">${e.boss ? 'Boss' : 'Enemy'}</span>
              </div>`;
            }).join('') : renderInfoEmpty('enemies')}</div>
            <div class="info-enemy-detail hidden" id="infoEnemyDetail">
              <canvas class="info-enemy-detail__sprite" id="infoEnemySprite" width="80" height="80"></canvas>
              <div class="info-enemy-detail__name" id="infoEnemyName"></div>
              <div class="info-enemy-detail__tag-row" id="infoEnemyTagRow"></div>
              <div class="info-enemy-detail__stats" id="infoEnemyStats"></div>
              <div class="info-enemy-detail__desc" id="infoEnemyDesc"></div>
            </div>
          </div>`;
        view.rhInfoContent.querySelectorAll('[data-info-enemy]').forEach(el => {
          Neo.drawSpriteToCanvas(el, el.dataset.infoEnemy, 48);
        });
        const showEnemyDetail = (key) => {
          const e = ENEMY_INFO.find(x => x.key === key);
          if (!e) return;
          const detail = document.getElementById('infoEnemyDetail');
          const sprite = document.getElementById('infoEnemySprite');
          if (!detail || !sprite) return;
          detail.classList.remove('hidden');
          Neo.drawSpriteToCanvas(sprite, key, 76);
          document.getElementById('infoEnemyName').textContent = e.label;
          const isBoss = e.boss;
          const tagCls = isBoss ? 'info-enemy-card__tag--boss' : 'info-enemy-card__tag--normal';
          const styleLbl = attackStyleLabel[e.attackStyle] || e.attackStyle;
          document.getElementById('infoEnemyTagRow').innerHTML =
            `<span class="info-enemy-card__tag ${tagCls}">${isBoss ? 'Boss' : 'Enemy'}</span>` +
            `<span class="info-enemy-detail__style-tag">${styleLbl}</span>`;
          const immHtml = e.immunities.length
            ? e.immunities.map(im => `<span class="info-enemy-detail__imm">${im}</span>`).join('')
            : '<span class="info-enemy-detail__imm info-enemy-detail__imm--none">None</span>';
          const hpRow    = e.hp    ? `<div class="ied-stat"><span class="ied-stat__label">HP</span><span class="ied-stat__value">${e.hp}</span></div>` : '';
          const dmgRow   = e.dmg   ? `<div class="ied-stat"><span class="ied-stat__label">DMG</span><span class="ied-stat__value">${e.dmg}</span></div>` : '';
          const spdRow   = e.speed ? `<div class="ied-stat"><span class="ied-stat__label">SPD</span><span class="ied-stat__value">${e.speed}</span></div>` : '';
          document.getElementById('infoEnemyStats').innerHTML =
            `<div class="ied-stats-row">${hpRow}${dmgRow}${spdRow}</div>` +
            `<div class="ied-imm-row"><span class="ied-imm-label">Immune:</span>${immHtml}</div>`;
          document.getElementById('infoEnemyDesc').textContent = e.desc || '';
          view.rhInfoContent.querySelectorAll('[data-enemy-select]').forEach(card => {
            card.classList.toggle('info-enemy-card--selected', card.dataset.enemySelect === key);
          });
        };
        view.rhInfoContent.querySelectorAll('[data-enemy-select]').forEach(card => {
          card.addEventListener('click', () => showEnemyDetail(card.dataset.enemySelect));
          card.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') showEnemyDetail(card.dataset.enemySelect); });
        });
        if (filteredEnemies.length) showEnemyDetail(filteredEnemies[0].key);

      } else if (tab === 'characters') {
        view.rhInfoContent.innerHTML = `<div class="info-char-grid">${Object.values(Neo.CHARACTER_DEFS).map(c => {
          const display = Neo.HERO_DISPLAY[c.key] || {};
          const statBars = (display.stats || []).map(s =>
            `<div class="info-char-stat">
              <span class="info-char-stat__label">${s.label}</span>
              <div class="info-char-stat__bar"><div class="info-char-stat__fill" style="width:${s.pct}%;background:${s.color}"></div></div>
            </div>`
          ).join('');
          return `<div class="info-char-card">
            <canvas class="info-char-card__sprite" data-info-char="${c.key}" width="64" height="64"></canvas>
            <div class="info-char-card__body">
              <div class="info-char-card__name">${c.name.toUpperCase()}</div>
              <div class="info-char-card__lore">${display.lore || ''}</div>
              <div class="info-char-card__stats">${statBars}</div>
              ${lockNote}
            </div>
          </div>`;
        }).join('')}</div>`;
        view.rhInfoContent.querySelectorAll('[data-info-char]').forEach(el => {
          Neo.drawSpriteToCanvas(el, el.dataset.infoChar, 60);
        });
      } else if (tab === 'meta') {
        view.rhInfoContent.innerHTML = renderMetaProgressionInfo();
      }
    }

    async function populateAchievementsPanel() {
      if (!view.achievementsList) return;
      view.achievementsList.innerHTML = '<div class="ach-loading">Loading…</div>';
      const progressSnapshot = typeof window.achievementManager?.getProgressSnapshot === 'function'
        ? await window.achievementManager.getProgressSnapshot()
        : {};
      progressSnapshot.metaCoins = Math.max(
        Math.max(0, Number(progressSnapshot.metaCoins) || 0),
        Math.max(0, Number(Neo.metaProgress?.coins) || 0)
      );
      const cards = await Promise.all((window.ACHIEVEMENTS || []).map(async a => {
        const unlocked = await window.achievementManager?.isUnlocked(a.id);
        const progressDef = window.ACHIEVEMENT_PROGRESS?.[a.id];
        const progressMarkup = !unlocked && progressDef
          ? renderAchievementProgress(progressDef, progressSnapshot)
          : '';
        return `<div class="ach-card${unlocked ? '' : ' ach-card--locked'}">
          <canvas class="ach-icon" data-achievement-icon="${Neo.escapeHtml(a.id)}" width="44" height="44" aria-hidden="true"></canvas>
          <div>
            <div class="ach-name">${a.name}</div>
            <div class="ach-desc">${a.desc}</div>
            ${progressMarkup}
            <div class="${unlocked ? 'ach-unlocked-badge' : 'ach-locked-badge'}">${unlocked ? '✓ Unlocked  +1 ◆' : '— Locked'}</div>
          </div>
        </div>`;
      }));
      view.achievementsList.innerHTML = cards.join('');
      drawAchievementIcons(view.achievementsList);
    }

    function drawAchievementIcons(root) {
      root?.querySelectorAll?.('[data-achievement-icon]').forEach(canvas => {
        drawAchievementIcon(canvas, canvas.dataset.achievementIcon);
      });
    }

    const ACHIEVEMENT_ICON_REFS = {
      one_punch_man: { type: 'move', key: 'nimrod_stomp' },
      the_avatar: { type: 'item', key: 'overstimulate' },
      rival_rumble: { type: 'weapon', key: 'thorns_bleed_blade' },
      gotta_meet_god: { type: 'move', key: 'turtle_wave' },
      yeshua_is_king: { type: 'item', key: 'drink_master' },
      unkillable: { type: 'item', key: 'veggys_pendant' },
      hoarder: { type: 'item', key: 'wizards_paw' },
      glass_cannon: { type: 'pixel', color: '#e6fbff', pixels: [[3,0],[2,1],[4,1],[1,2],[5,2],[2,3],[3,3],[4,3],[2,4],[4,4],[1,5],[5,5],[3,6]] },
      floor_muncher: { type: 'pixel', color: '#8dd4ff', pixels: [[3,1],[2,2],[3,2],[4,2],[1,3],[3,3],[5,3],[3,4],[3,5],[3,6]] },
      overleveled: { type: 'pixel', color: '#f0c040', pixels: [[3,0],[2,2],[3,2],[4,2],[1,3],[2,3],[3,3],[4,3],[5,3],[2,4],[4,4],[1,6],[2,6],[3,6],[4,6],[5,6]] },
      shopping_spree: { type: 'item', key: 'rich_mans_luck' },
      loop_lord: { type: 'item', key: 'jesters_dice' },
      coin_goblin: { type: 'pixel', color: '#ffd15a', pixels: [[2,1],[3,1],[4,1],[1,2],[2,2],[3,2],[4,2],[5,2],[1,3],[2,3],[3,3],[4,3],[5,3],[1,4],[2,4],[3,4],[4,4],[5,4],[2,5],[3,5],[4,5]] },
      god_slayer: { type: 'enemy', key: 'god' },
      extinction: { type: 'enemy', key: 'hunter' },
      double_bane: { type: 'enemy', key: 'bowman_bane' },
    };

    function drawAchievementIcon(canvas, achievementId) {
      const ref = ACHIEVEMENT_ICON_REFS[achievementId] || { type: 'pixel', color: '#f0c040', pixels: [[3,1],[2,2],[3,2],[4,2],[1,3],[2,3],[3,3],[4,3],[5,3],[2,4],[3,4],[4,4],[3,5]] };
      if (ref.type === 'item' && Neo.ITEM_DEFS?.[ref.key]) {
        Neo.drawItemIconByKey?.(canvas, ref.key);
        return;
      }
      if (ref.type === 'move' && Neo.MOVE_DEFS?.[ref.key]) {
        Neo.drawMoveToastIcon?.(canvas, Neo.MOVE_DEFS[ref.key]);
        return;
      }
      if (ref.type === 'weapon' && Neo.WEAPON_DEFS?.[ref.key]) {
        Neo.drawWeaponToastIcon?.(canvas, Neo.WEAPON_DEFS[ref.key]);
        return;
      }
      if (ref.type === 'enemy') {
        Neo.drawSpriteToCanvas?.(canvas, ref.key, 40);
        return;
      }
      Neo.drawPixelIcon?.(canvas, ref.color || '#f0c040', ref.pixels || []);
    }

    function renderAchievementProgress(progressDef, progressSnapshot) {
      const target = Math.max(1, Number(progressDef.target) || 1);
      const rawValue = Math.max(0, Number(progressSnapshot?.[progressDef.key]) || 0);
      const value = Math.min(rawValue, target);
      const percent = Math.max(0, Math.min(100, (value / target) * 100));
      return `<div class="ach-progress" aria-label="${Neo.escapeHtml(progressDef.label)} ${value} of ${target}">
        <div class="ach-progress__meta">
          <span>${Neo.escapeHtml(progressDef.label)}</span>
          <b>${value.toLocaleString()} / ${target.toLocaleString()}</b>
        </div>
        <div class="ach-progress__track"><i style="width:${percent.toFixed(2)}%"></i></div>
      </div>`;
    }

    function setAchievementsPanelOpen(open) {
      setRunHistoryOpen(open);
      if (open) setRunHistoryView('achievements');
    }

    function setCreditsPanelOpen(open) {
      const panel = view.creditsPanel;
      // Full-screen page swap: hide the main menu while credits is up.
      view.start?.classList.toggle('hidden', open);
      panel?.classList.toggle('hidden', !open);
      panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
      view.creditsBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');

      if (open) {
        // Remove then re-add .is-open on the next frame so the fly-in
        // keyframes replay every time the page is opened.
        panel?.classList.remove('is-open');
        requestAnimationFrame(() => {
          panel?.classList.add('is-open');
          view.creditsClose?.focus({ preventScroll: true });
        });
      } else {
        panel?.classList.remove('is-open');
        view.creditsBtn?.focus({ preventScroll: true });
      }
    }

    function setAltModesPanelOpen(open) {
      view.altModesPanel?.classList.toggle('hidden', !open);
      view.altModesPanel?.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    function setCompetitivePanelOpen(open) {
      view.competitivePanel?.classList.toggle('hidden', !open);
      view.competitivePanel?.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) {
        setAltModesPanelOpen(false);
        initCompetitiveLeaderboard();
      }
    }

    // --- Competitive leaderboard ---
    let lbPage = 1;
    let lbLoading = false;
    let lbHasMore = true;
    let lbDebounceTimer = null;

    function initCompetitiveLeaderboard() {
      lbPage = 1;
      lbHasMore = true;
      const listEl = document.getElementById('competitiveLbList');
      const moreBtn = document.getElementById('competitiveLbMoreBtn');
      if (listEl) listEl.textContent = 'Loading...';
      if (moreBtn) moreBtn.style.display = 'none';
      renderCompetitiveServerStatus(Neo._competitiveServerState || { state: 'checking' });
      Neo.refreshCompetitiveSeed?.().catch(() => {});
      debouncedLoadLb(true);
    }

    function debouncedLoadLb(immediate) {
      clearTimeout(lbDebounceTimer);
      lbDebounceTimer = setTimeout(loadLbPage, immediate ? 0 : 300);
    }

    function loadLbPage() {
      if (lbLoading || !lbHasMore) return;
      lbLoading = true;
      const statusEl = document.getElementById('competitiveLbStatus');
      if (statusEl) statusEl.textContent = 'Loading...';
      Neo.fetchCompetitiveJson(`/leaderboard?page=${lbPage}`)
        .then(data => {
          const listEl = document.getElementById('competitiveLbList');
          const moreBtn = document.getElementById('competitiveLbMoreBtn');
          if (!listEl) return;
          if (lbPage === 1) listEl.innerHTML = '';
          const entries = (Array.isArray(data.data) ? data.data : []).filter(entry => entry?.result === 'win' && Number(entry.floor) >= 10);
          if (entries.length === 0) {
            if (lbPage === 1) listEl.textContent = 'No runs this week — be the first!';
          } else {
            const startRank = (lbPage - 1) * data.pageSize + 1;
            entries.forEach((entry, i) => {
              const rank = startRank + i;
              const charDef = Neo.CHARACTER_DEFS?.[entry.character];
              const charName = charDef ? escHtml(charDef.name) : '';
              const row = document.createElement('div');
              row.style.cssText = 'display:flex;gap:8px;align-items:baseline;border-bottom:1px solid rgba(255,255,255,0.06);padding:2px 0';
              row.innerHTML = `<span style="width:24px;text-align:right;color:#ffe566;font-weight:bold">${rank}.</span><span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(entry.name)}</span>${charName ? `<span style="color:#7fb8ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px">${charName}</span>` : ''}<span style="color:#aaa">Fl.${entry.floor}</span>`;
              listEl.appendChild(row);
            });
          }
          lbHasMore = !!data.hasMore;
          lbPage += 1;
          if (moreBtn) moreBtn.style.display = lbHasMore ? '' : 'none';
          if (statusEl) statusEl.textContent = data.totalEntries ? `${data.totalEntries} entries total` : '';
        })
        .catch(error => {
          const listEl = document.getElementById('competitiveLbList');
          if (listEl && lbPage === 1) listEl.textContent = 'Server connection required to show competitive runs.';
          if (statusEl) statusEl.textContent = error?.message || '';
        })
        .finally(() => { lbLoading = false; });
    }

    function escHtml(str) {
      return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function renderCompetitiveServerStatus(status = {}) {
      const state = status.state || 'checking';
      const statusEl = view.competitiveServerStatus || document.getElementById('competitiveServerStatus');
      const retryBtn = view.competitiveServerRetryBtn || document.getElementById('competitiveServerRetryBtn');
      const banner = document.getElementById('seedErrorBanner');
      const btn = view.altModeCompetitiveBtn || document.getElementById('altModeCompetitiveBtn');
      if (statusEl) {
        statusEl.className = `competitive-server-status competitive-server-status--${state}`;
        if (state === 'online') statusEl.textContent = status.seed ? `Server online - seed ${status.seed}` : 'Server online';
        else if (state === 'offline') statusEl.textContent = 'Server connection required';
        else statusEl.textContent = 'Checking server...';
      }
      if (banner) banner.classList.toggle('hidden', state !== 'offline');
      if (retryBtn) retryBtn.classList.toggle('hidden', state !== 'offline');
      if (btn) {
        btn.disabled = state !== 'online';
        btn.textContent = state === 'checking' ? 'CHECKING...' : state === 'offline' ? 'SERVER OFFLINE' : 'COMPETE';
      }
    }

    function setSandboxPanelOpen(open) {
      // Refresh fields from current settings each time the panel opens (settings
      // may have loaded from saved meta after initial wiring).
      if (open) syncSandboxPanelFieldsHook?.();
      view.sandboxPanel?.classList.toggle('hidden', !open);
      view.sandboxPanel?.classList.toggle('sandbox-panel--open', open);
      view.sandboxPanel?.setAttribute('aria-hidden', open ? 'false' : 'true');
      view.altModesPanel?.classList.toggle('altmodes-panel--sandbox-open', open);
      view.altModeSandboxConfigBtn?.classList.toggle('is-active', open);
      document.getElementById('altModeSandboxCard')?.classList.toggle('altmode-card--configuring', open);
    }

    function renderRunHistoryDetail() {
      const visibleEntries = getVisibleRunHistoryEntries();
      const selected = visibleEntries.find(entry => entry.id === selectedRunHistoryId) || visibleEntries[0] || null;
      view.runHistoryTabs.forEach(tab => {
        const active = (tab.dataset.tab || 'stats') === activeRunHistoryTab;
        tab.classList.toggle('active', active);
      });
      if (!selected) {
        if (view.runHistoryHero) view.runHistoryHero.innerHTML = '';
        if (view.runHistoryTabPanel) view.runHistoryTabPanel.innerHTML = '';
        return;
      }
      if (view.runHistoryHero) {
        view.runHistoryHero.innerHTML = Neo.renderRunHistoryHero(selected);
        Neo.hydrateRunHistorySprites(view.runHistoryHero);
      }
      if (view.runHistoryTabPanel) {
        view.runHistoryTabPanel.innerHTML = Neo.renderRunHistoryTabContent(selected, activeRunHistoryTab);
        Neo.hydrateRunHistorySprites(view.runHistoryTabPanel);
      }
    }

    function renderRunHistoryPage() {
      renderRunHistoryModeTabs();
      const visibleEntries = getVisibleRunHistoryEntries();
      const totalPages = Math.max(1, Math.ceil(visibleEntries.length / runHistoryPageSize));
      runHistoryPage = Neo.clamp(runHistoryPage, 0, totalPages - 1);
      const start = runHistoryPage * runHistoryPageSize;
      const visiblePageEntries = visibleEntries.slice(start, start + runHistoryPageSize);
      if (!visibleEntries.some(entry => entry.id === selectedRunHistoryId)) {
        selectedRunHistoryId = visibleEntries[0]?.id || '';
      }
      if (view.runHistoryEmpty) view.runHistoryEmpty.classList.toggle('hidden', visibleEntries.length > 0);
      if (view.runHistoryList) {
        view.runHistoryList.innerHTML = visiblePageEntries.map(entry => Neo.renderRunHistoryListEntry(entry, entry.id === selectedRunHistoryId)).join('');
        view.runHistoryList.classList.toggle('hidden', visibleEntries.length === 0);
        view.runHistoryList.scrollTop = 0;
        Neo.hydrateRunHistorySprites(view.runHistoryList);
      }
      renderRunHistoryDetail();
      if (view.runHistoryPageLabel) {
        view.runHistoryPageLabel.textContent = visibleEntries.length
          ? `Page ${runHistoryPage + 1} / ${totalPages}`
          : 'Page 0 / 0';
      }
      if (view.runHistoryPrev) view.runHistoryPrev.disabled = runHistoryPage <= 0;
      if (view.runHistoryNext) view.runHistoryNext.disabled = runHistoryPage >= totalPages - 1 || visibleEntries.length === 0;
    }

    if (manager && typeof manager.registerScreen === 'function') {
      manager.registerScreen('coinDisplay', {
        create: () => makeContainer(view.coinDisplay, 'flex'),
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('centerDisplay', {
        create: () => makeContainer(view.centerDisplay, ''),
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('playerStats', {
        create: () => makeContainer(view.playerStats, ''),
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('actionBar', {
        create: () => makeContainer(view.actionBar, ''),
        validStates: ['play', 'pause'],
      });
      manager.registerScreen('hudLower', {
        create: () => makeContainer(view.hudLower, ''),
        validStates: ['play', 'pause'],
      });
      manager.registerScreen('equipmentSlots', {
        create: () => makeContainer(view.equipmentSlots, ''),
        validStates: ['play', 'pause'],
      });
      manager.registerScreen('dialogue', {
        create: () => makeContainer(view.dialogueOverlay, 'flex'),
        show: renderDialogue,
        update: renderDialogue,
        validStates: ['dialogue'],
      });
      manager.registerScreen('entityDialogue', {
        create: () => makeContainer(view.entityDialogueLayer, 'block'),
        show: renderEntityDialogue,
        update: renderEntityDialogue,
        validStates: ['play', 'pause', 'dialogue'],
      });
      manager.registerScreen('start', { create: () => makeContainer(view.start, ''), validStates: ['menu'] });
      manager.registerScreen('charSelect', { create: () => makeContainer(view.charSelect, ''), validStates: ['charselect'] });
      manager.registerScreen('dead', { create: () => makeContainer(view.dead, ''), validStates: ['dead'] });
      manager.registerScreen('win', { create: () => makeContainer(view.win, ''), validStates: ['win'] });
      manager.registerScreen('pause', { create: () => makeContainer(view.pause, ''), validStates: ['pause'] });
      if (Neo.gameStateManager && typeof manager.bindToStateManager === 'function') {
        manager.bindToStateManager(Neo.gameStateManager, { initialSync: true });
      }
    }

    if (Neo.gameStateManager && typeof Neo.gameStateManager.onChange === 'function') {
      Neo.gameStateManager.onChange((_from, to) => {
        activeState = to || 'menu';
        Neo.gameState = activeState;
        fallbackState(activeState);
      });
    }

    return {
      setState(state) {
        activeState = state || 'menu';
        if (Neo.gameStateManager && typeof Neo.gameStateManager.getState === 'function' && Neo.gameStateManager.getState() !== state) {
          Neo.gameStateManager.setState(state);
          return;
        }
        if (manager && typeof manager.onGameStateChange === 'function') manager.onGameStateChange(state);
        fallbackState(state);
      },
      setHudUpdateHook(hook) {
        hudUpdateHook = typeof hook === 'function' ? hook : null;
      },
      tick(dt = 0) {
        if (dialogueRuntime?.update) dialogueRuntime.update(dt);
        if (worldSpeechRuntime?.update) worldSpeechRuntime.update(dt);
        if (manager && typeof manager.updateAll === 'function') {
          manager.updateAll();
        } else {
          renderDialogue();
          renderEntityDialogue();
        }
        if ((activeState === 'play' || activeState === 'dying') && hudUpdateHook) hudUpdateHook();
      },
      bindMenuActions(handlers) {
        if (menuBound) return;
        ensureRunHistoryPanelCanOverlayGame();
        view.charButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onCharacterSelect(button.dataset.char || '', button);
          });
        });

        // Carousel prev/next arrows
        const carouselPrev = document.getElementById('carouselPrev');
        const carouselNext = document.getElementById('carouselNext');
        const charOrder = ['princess', 'thorn_knight', 'metao', 'gelleh', 'mooggy'];
        function carouselStep(delta) {
          const currentIndex = charOrder.indexOf(handlers._getChosenCharacter ? handlers._getChosenCharacter() : 'princess');
          const nextIndex = currentIndex + delta;
          if (nextIndex >= 0 && nextIndex < charOrder.length) {
            const nextKey = charOrder[nextIndex];
            const btn = view.charButtons.find(b => b.dataset.char === nextKey);
            if (btn) handlers.onCharacterSelect(nextKey, btn);
          }
        }
        carouselPrev?.addEventListener('click', () => carouselStep(-1));
        carouselNext?.addEventListener('click', () => carouselStep(1));

        // Touch swipe on carousel viewport
        const viewport = document.querySelector('.char-carousel-viewport');
        if (viewport) {
          let touchStartX = 0;
          viewport.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
          viewport.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 40) carouselStep(dx < 0 ? 1 : -1);
          }, { passive: true });
        }

        view.difficultyButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onDifficultySelect(button.dataset.difficulty || '', button);
          });
        });

        // Sandbox Lab panel: visual "game hacking" controls moved to Alt Modes.
        function getSandboxEnemySpriteKey(type) {
          if (type === 'boss_spawner') return 'cult_follower';
          return type;
        }

        const sandboxSearch = { enemies: '', items: '', startItems: '' };

        function normalizeSandboxSearchValue(value) {
          return String(value || '').trim().toLowerCase();
        }

        function enemyMatchesSandboxSearch(type, query) {
          if (!query) return true;
          const key = String(type || '').toLowerCase();
          const label = String(Neo.getEnemyLabel(type) || type).toLowerCase();
          return key.includes(query) || label.includes(query);
        }

        function itemMatchesSandboxSearch(key, query) {
          if (!query) return true;
          const item = Neo.itemRegistry.get(key) || Neo.ITEM_DEFS[key] || {};
          const label = String(item.name || key).toLowerCase();
          const rarity = String(item.rarity || '').toLowerCase();
          const idKey = String(key || '').toLowerCase();
          return label.includes(query) || idKey.includes(query) || rarity.includes(query);
        }

        function renderSandboxEmptyState(text) {
          return `<div class="sandbox-empty">${Neo.escapeHtml(text)}</div>`;
        }

        function hydrateSandboxTokenIcons() {
          view.sandboxEnemyList?.querySelectorAll('[data-sbox-enemy-icon]').forEach(el => {
            const key = String(el.dataset.sboxEnemyIcon || 'hunter');
            Neo.drawSpriteToCanvas(el, getSandboxEnemySpriteKey(key), 22);
          });
          Neo.drawItemIconCanvases?.(view.sandboxItemList, 'data-sbox-item-icon');
          Neo.drawItemIconCanvases?.(view.sandboxStartItemList, 'data-sbox-start-item-icon');
        }

        function renderSandboxTokenLists() {
          const enemyQuery = normalizeSandboxSearchValue(sandboxSearch.enemies);
          const itemQuery = normalizeSandboxSearchValue(sandboxSearch.items);
          const startItemQuery = normalizeSandboxSearchValue(sandboxSearch.startItems);

          if (view.sandboxEnemyList) {
            const filteredEnemies = Neo.SANDBOX_ENEMY_TYPES.filter(type => enemyMatchesSandboxSearch(type, enemyQuery));
            view.sandboxEnemyList.innerHTML = filteredEnemies.length
              ? filteredEnemies.map(type => {
              const active = Neo.sandboxSettings.allowedEnemies.includes(type);
              const label = Neo.getEnemyLabel(type);
              return `<button class="sandbox-token${active ? ' is-active' : ''}" data-sbox-enemy="${type}" type="button">`
                + `<canvas class="sandbox-token__icon" data-sbox-enemy-icon="${Neo.escapeHtml(type)}" width="28" height="28" aria-hidden="true"></canvas>`
                + `<span class="sandbox-token__label">${Neo.escapeHtml(label)}</span>`
                + `</button>`;
            }).join('')
              : renderSandboxEmptyState('No enemy types match your search.');
          }
          if (view.sandboxItemList) {
            const filteredItems = Neo.ITEM_KEYS.filter(key => itemMatchesSandboxSearch(key, itemQuery));
            view.sandboxItemList.innerHTML = filteredItems.length
              ? filteredItems.map(key => {
              const active = Neo.sandboxSettings.allowedItems.includes(key);
              const item = Neo.itemRegistry.get(key) || Neo.ITEM_DEFS[key];
              const label = item?.name || key.replace(/_/g, ' ');
              const rarity = String(item?.rarity || 'knight');
              return `<button class="sandbox-token sandbox-token--item sandbox-token--${Neo.escapeHtml(rarity)}${active ? ' is-active' : ''}" data-sbox-item="${key}" type="button">`
                + `<canvas class="sandbox-token__icon sandbox-token__icon--item" data-sbox-item-icon="${Neo.escapeHtml(key)}" width="26" height="26" aria-hidden="true"></canvas>`
                + `<span class="sandbox-token__label">${Neo.escapeHtml(label)}</span>`
                + `</button>`;
            }).join('')
              : renderSandboxEmptyState('No items match your search.');
          }
          if (view.sandboxStartItemList) {
            const startingItems = Neo.sandboxSettings.startingItems && typeof Neo.sandboxSettings.startingItems === 'object'
              ? Neo.sandboxSettings.startingItems
              : {};
            const filteredStartItems = Neo.ITEM_KEYS.filter(key => itemMatchesSandboxSearch(key, startItemQuery));
            view.sandboxStartItemList.innerHTML = filteredStartItems.length
              ? filteredStartItems.map(key => {
              const count = Math.max(0, Math.min(99, Math.round(Number(startingItems[key]) || 0)));
              const active = count > 0;
              const item = Neo.itemRegistry.get(key) || Neo.ITEM_DEFS[key];
              const label = item?.name || key.replace(/_/g, ' ');
              const rarity = String(item?.rarity || 'knight');
              const safeKey = Neo.escapeHtml(key);
              // Tooltip parity with the death screen: title + aria-label + data-tooltip
              // carry the item description (with the same fallback text).
              const tooltipText = item?.description || 'No item description available.';
              const safeTooltip = Neo.escapeHtml(tooltipText);
              const safeAria = Neo.escapeHtml(`${label}. ${tooltipText}`);
              return `<div class="sandbox-token sandbox-token--item sandbox-token--stepper sandbox-token--${Neo.escapeHtml(rarity)}${active ? ' is-active' : ''}" data-sbox-start-item="${safeKey}" title="${safeTooltip}" aria-label="${safeAria}" data-tooltip="${safeTooltip}">`
                + `<canvas class="sandbox-token__icon sandbox-token__icon--item" data-sbox-start-item-icon="${safeKey}" width="26" height="26" aria-hidden="true"></canvas>`
                + `<span class="sandbox-token__label">${Neo.escapeHtml(label)}</span>`
                + `<div class="sandbox-token__stepper">`
                  + `<button class="sandbox-token__step" data-sbox-start-step="-1" data-sbox-start-item-key="${safeKey}" type="button" aria-label="Decrease ${Neo.escapeHtml(label)}">−</button>`
                  + `<span class="sandbox-token__count" data-sbox-start-count>${count}</span>`
                  + `<button class="sandbox-token__step" data-sbox-start-step="1" data-sbox-start-item-key="${safeKey}" type="button" aria-label="Increase ${Neo.escapeHtml(label)}">+</button>`
                + `</div>`
                + `</div>`;
              }).join('')
                : renderSandboxEmptyState('No starting items match your search.');
          }
          hydrateSandboxTokenIcons();
        }

        // Move-loadout options are static; build the visible button groups once.
        function buildSandboxMoveLoadoutOptions() {
          if (!view.sandboxMoveLoadout) return;
          view.sandboxMoveLoadout.querySelectorAll('[data-sbox-move-options]').forEach(group => {
            const slot = group.dataset.sboxMoveOptions;
            const moves = Object.keys(Neo.MOVE_DEFS).filter(key => Neo.MOVE_DEFS[key].slot === slot);
            group.innerHTML = `<button class="sandbox-move-option sandbox-move-option--default" data-sbox-move-option="" data-sbox-move-option-slot="${Neo.escapeHtml(slot)}" type="button" aria-pressed="false">Default</button>`
              + moves.map(key => {
                const move = Neo.MOVE_DEFS[key];
                const name = move.name || key;
                return `<button class="sandbox-move-option" data-sbox-move-option="${Neo.escapeHtml(key)}" data-sbox-move-option-slot="${Neo.escapeHtml(slot)}" type="button" aria-pressed="false" title="${Neo.escapeHtml(move.desc || name)}">`
                  + `<canvas class="sandbox-move-option__icon" data-sbox-move-option-icon="${Neo.escapeHtml(key)}" width="22" height="22" aria-hidden="true"></canvas>`
                  + `<span class="sandbox-move-option__label">${Neo.escapeHtml(name)}</span>`
                  + `</button>`;
              }).join('');
            group.querySelectorAll('[data-sbox-move-option-icon]').forEach(canvas => {
              const move = Neo.MOVE_DEFS[canvas.dataset.sboxMoveOptionIcon];
              if (move) Neo.drawMoveToastIcon(canvas, move);
            });
          });
        }

        function syncSandboxPanelFields() {
          document.querySelectorAll('#sandboxGrid .sandbox-row').forEach(row => {
            const param = row.dataset.sboxParam;
            if (!param) return;
            const slider = row.querySelector('.sandbox-slider');
            const numInput = row.querySelector('.sandbox-num');
            const value = Neo.sandboxSettings[param];
            if (slider && value !== undefined) slider.value = value;
            if (numInput && value !== undefined) numInput.value = value;
          });
          if (view.sandboxGodMode) view.sandboxGodMode.checked = !!Neo.sandboxSettings.godMode;
          if (view.sandboxUnlockEverything) view.sandboxUnlockEverything.checked = !!Neo.sandboxSettings.unlockEverything;
          view.sandboxMoveLoadout?.querySelectorAll('[data-sbox-move-slot]').forEach(slotNode => {
            const slot = slotNode.dataset.sboxMoveSlot;
            const selectedKey = Neo.sandboxSettings.moveLoadout?.[slot] || '';
            const selectedMove = Neo.MOVE_DEFS[selectedKey];
            const selectedLabel = slotNode.querySelector('[data-sbox-move-slot-selected]');
            if (selectedLabel) selectedLabel.textContent = selectedMove?.name || 'Default';
            slotNode.querySelectorAll('[data-sbox-move-option]').forEach(button => {
              const active = button.dataset.sboxMoveOption === selectedKey;
              button.classList.toggle('is-active', active);
              button.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
          });
          if (view.sandboxEnemySearch) view.sandboxEnemySearch.value = sandboxSearch.enemies;
          if (view.sandboxItemSearch) view.sandboxItemSearch.value = sandboxSearch.items;
          if (view.sandboxStartItemSearch) view.sandboxStartItemSearch.value = sandboxSearch.startItems;
          renderSandboxTokenLists();
        }
        buildSandboxMoveLoadoutOptions();
        syncSandboxPanelFieldsHook = syncSandboxPanelFields;

        document.querySelectorAll('#sandboxGrid .sandbox-row').forEach(row => {
          const param = row.dataset.sboxParam;
          if (!param) return;
          const slider = row.querySelector('.sandbox-slider');
          const numInput = row.querySelector('.sandbox-num');
          const integerParam = param === 'startingCoins' || param === 'startingLevel';
          function applyValue(raw) {
            const parsed = integerParam ? parseInt(raw, 10) : parseFloat(raw);
            const min = Number(slider?.min ?? 0);
            const max = Number(slider?.max ?? 1);
            const fallback = Number(slider?.value ?? 0);
            const clamped = Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback));
            const rounded = integerParam ? Math.round(clamped) : Math.round(clamped * 100) / 100;
            if (slider) slider.value = String(rounded);
            if (numInput) numInput.value = String(rounded);
            Neo.sandboxSettings[param] = rounded;
            Neo.persistMetaSoon();
          }
          slider?.addEventListener('input', () => applyValue(slider.value));
          numInput?.addEventListener('change', () => applyValue(numInput.value));
        });

        view.sandboxGodMode?.addEventListener('change', () => {
          Neo.sandboxSettings.godMode = !!view.sandboxGodMode?.checked;
          Neo.persistMetaSoon();
        });

        view.sandboxUnlockEverything?.addEventListener('change', () => {
          Neo.sandboxSettings.unlockEverything = !!view.sandboxUnlockEverything?.checked;
          Neo.persistMetaSoon();
        });

        view.sandboxMoveLoadout?.addEventListener('click', event => {
          const button = event.target instanceof Element ? event.target.closest('[data-sbox-move-option]') : null;
          if (!button) return;
          const slot = button.dataset.sboxMoveOptionSlot;
          if (!Neo.sandboxSettings.moveLoadout || typeof Neo.sandboxSettings.moveLoadout !== 'object') {
            Neo.sandboxSettings.moveLoadout = { melee: '', laser: '', smash: '', dash: '' };
          }
          Neo.sandboxSettings.moveLoadout[slot] = button.dataset.sboxMoveOption || '';
          Neo.sandboxSettings = Neo.normalizeSandboxSettings(Neo.sandboxSettings);
          syncSandboxPanelFields();
          Neo.persistMetaSoon();
        });

        view.sandboxEnemySearch?.addEventListener('input', () => {
          sandboxSearch.enemies = String(view.sandboxEnemySearch?.value || '');
          renderSandboxTokenLists();
        });

        view.sandboxItemSearch?.addEventListener('input', () => {
          sandboxSearch.items = String(view.sandboxItemSearch?.value || '');
          renderSandboxTokenLists();
        });

        view.sandboxStartItemSearch?.addEventListener('input', () => {
          sandboxSearch.startItems = String(view.sandboxStartItemSearch?.value || '');
          renderSandboxTokenLists();
        });

        view.sandboxEnemyList?.addEventListener('click', event => {
          const btn = event.target instanceof Element ? event.target.closest('[data-sbox-enemy]') : null;
          if (!btn) return;
          const type = String(btn.dataset.sboxEnemy || '');
          if (!Neo.SANDBOX_ENEMY_TYPES.includes(type)) return;
          if (Neo.sandboxSettings.allowedEnemies.includes(type)) {
            Neo.sandboxSettings.allowedEnemies = Neo.sandboxSettings.allowedEnemies.filter(key => key !== type);
          } else {
            Neo.sandboxSettings.allowedEnemies = [...Neo.sandboxSettings.allowedEnemies, type];
          }
          Neo.sandboxSettings = Neo.normalizeSandboxSettings(Neo.sandboxSettings);
          syncSandboxPanelFields();
          Neo.persistMetaSoon();
        });

        view.sandboxItemList?.addEventListener('click', event => {
          const btn = event.target instanceof Element ? event.target.closest('[data-sbox-item]') : null;
          if (!btn) return;
          const key = String(btn.dataset.sboxItem || '');
          if (!Neo.ITEM_KEYS.includes(key)) return;
          if (Neo.sandboxSettings.allowedItems.includes(key)) {
            Neo.sandboxSettings.allowedItems = Neo.sandboxSettings.allowedItems.filter(itemKey => itemKey !== key);
          } else {
            Neo.sandboxSettings.allowedItems = [...Neo.sandboxSettings.allowedItems, key];
          }
          Neo.sandboxSettings = Neo.normalizeSandboxSettings(Neo.sandboxSettings);
          syncSandboxPanelFields();
          Neo.persistMetaSoon();
        });

        view.sandboxEnemiesAll?.addEventListener('click', () => {
          Neo.sandboxSettings.allowedEnemies = Neo.SANDBOX_ENEMY_TYPES.slice();
          syncSandboxPanelFields();
          Neo.persistMetaSoon();
        });
        view.sandboxEnemiesNone?.addEventListener('click', () => {
          Neo.sandboxSettings.allowedEnemies = [];
          Neo.sandboxSettings = Neo.normalizeSandboxSettings(Neo.sandboxSettings);
          syncSandboxPanelFields();
          Neo.persistMetaSoon();
        });
        view.sandboxItemsAll?.addEventListener('click', () => {
          Neo.sandboxSettings.allowedItems = Neo.ITEM_KEYS.slice();
          syncSandboxPanelFields();
          Neo.persistMetaSoon();
        });
        view.sandboxItemsNone?.addEventListener('click', () => {
          Neo.sandboxSettings.allowedItems = [];
          Neo.sandboxSettings = Neo.normalizeSandboxSettings(Neo.sandboxSettings);
          syncSandboxPanelFields();
          Neo.persistMetaSoon();
        });
        view.sandboxStartItemList?.addEventListener('click', event => {
          const stepBtn = event.target instanceof Element ? event.target.closest('[data-sbox-start-step]') : null;
          if (!stepBtn) return;
          const key = String(stepBtn.dataset.sboxStartItemKey || '');
          if (!Neo.ITEM_KEYS.includes(key)) return;
          const delta = parseInt(stepBtn.dataset.sboxStartStep, 10) || 0;
          const current = Neo.sandboxSettings.startingItems && typeof Neo.sandboxSettings.startingItems === 'object'
            ? { ...Neo.sandboxSettings.startingItems }
            : {};
          const next = Math.max(0, Math.min(99, (Math.round(Number(current[key]) || 0)) + delta));
          if (next > 0) current[key] = next; else delete current[key];
          Neo.sandboxSettings.startingItems = current;
          Neo.sandboxSettings = Neo.normalizeSandboxSettings(Neo.sandboxSettings);
          syncSandboxPanelFields();
          Neo.persistMetaSoon();
        });
        view.sandboxStartItemsAll?.addEventListener('click', () => {
          const map = {};
          for (const key of Neo.ITEM_KEYS) map[key] = 1;
          Neo.sandboxSettings.startingItems = map;
          syncSandboxPanelFields();
          Neo.persistMetaSoon();
        });
        view.sandboxStartItemsNone?.addEventListener('click', () => {
          Neo.sandboxSettings.startingItems = {};
          syncSandboxPanelFields();
          Neo.persistMetaSoon();
        });
        view.sandboxReset?.addEventListener('click', () => {
          Neo.sandboxSettings = Neo.normalizeSandboxSettings(Neo.SANDBOX_DEFAULT_SETTINGS);
          syncSandboxPanelFields();
          Neo.persistMetaSoon();
        });
        view.sandboxSaveClose?.addEventListener('click', handlers.onCloseSandboxConfig);
        view.sandboxClose?.addEventListener('click', handlers.onCloseSandboxConfig);
        view.sandboxPanelBackdrop?.addEventListener('click', handlers.onCloseSandboxConfig);
        syncSandboxPanelFields();

        view.challengeButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onChallengeSelect(button.dataset.challenge || '', button);
          });
        });
        view.challengeToggle?.addEventListener('click', handlers.onToggleChallenges);
        view.challengeClose?.addEventListener('click', () => setChallengePanelOpen(false));
        view.legacyButtons.forEach(button => {
          button.addEventListener('click', () => {
            handlers.onLegacySelect(button.dataset.legacy || '');
          });
        });
        view.legacyToggle?.addEventListener('click', handlers.onToggleLegacy);
        view.legacyClose?.addEventListener('click', () => setLegacyPanelOpen(false));
        view.runHistoryBtn?.addEventListener('click', handlers.onToggleRunHistory);
        view.runHistoryClose?.addEventListener('click', () => setRunHistoryOpen(false));
        view.runHistoryViewTabs?.forEach(tab => {
          tab.addEventListener('click', () => setRunHistoryView(tab.dataset.view || 'info'));
        });
        view.rhInfoTabs?.forEach(tab => {
          tab.addEventListener('click', () => populateInfoPanel(tab.dataset.infoTab || 'items'));
        });
        view.rhInfoSearch?.addEventListener('input', () => {
          if (!searchableInfoTabs.has(activeInfoTab)) return;
          infoSearchQueries[activeInfoTab] = view.rhInfoSearch.value || '';
          populateInfoPanel(activeInfoTab);
        });
        view.infoTutorialBtn?.addEventListener('click', () => {
          localStorage.setItem(Neo.REPLAY_TUTORIAL_KEY, '1');
          view.infoTutorialBtn.textContent = '✓ Set for next run';
          view.infoTutorialBtn.disabled = true;
          setTimeout(() => {
            if (view.infoTutorialBtn) {
              view.infoTutorialBtn.textContent = '▶ Tutorial';
              view.infoTutorialBtn.disabled = false;
            }
          }, 2200);
        });
        view.runHistoryPrev?.addEventListener('click', () => {
          runHistoryPage = Math.max(0, runHistoryPage - 1);
          renderRunHistoryPage();
        });
        view.runHistoryNext?.addEventListener('click', () => {
          runHistoryPage += 1;
          renderRunHistoryPage();
        });
        view.runHistoryList?.addEventListener('click', event => {
          const target = event.target instanceof Element ? event.target.closest('[data-run-id]') : null;
          if (!target) return;
          selectedRunHistoryId = target.dataset.runId || '';
          renderRunHistoryPage();
        });
        view.runHistoryHero?.addEventListener('click', event => {
          const btn = event.target instanceof Element ? event.target.closest('[data-rerun-id]') : null;
          if (!btn) return;
          handlers.onRerunFromHistory(btn.dataset.rerunId);
        });
        view.runHistoryTabs.forEach(tab => {
          tab.addEventListener('click', () => {
            activeRunHistoryTab = tab.dataset.tab || 'stats';
            renderRunHistoryDetail();
          });
        });
        view.runHistoryModeTabs.forEach(tab => {
          tab.addEventListener('click', () => {
            const mode = tab.dataset.mode || 'all';
            runHistoryModeFilter = mode === 'all' ? 'all' : Neo.normalizeGameMode(mode);
            runHistoryPage = 0;
            renderRunHistoryPage();
          });
        });
        view.go.addEventListener('click', handlers.onStartNew);
        view.seed.addEventListener('keydown', event => {
          if (event.key === 'Enter') handlers.onStartNew();
        });
        view.continueBtn?.addEventListener('click', handlers.onContinue);
        view.deleteRunBtn?.addEventListener('click', handlers.onDeleteRun);
        view.dialogueOverlay?.addEventListener('click', handlers.onAdvanceDialogue);
        view.tutorialPrevBtn?.addEventListener('click', handlers.onTutorialPrev);
        view.tutorialNextBtn?.addEventListener('click', handlers.onTutorialNext);
        view.tutorialSkipBtn?.addEventListener('click', handlers.onSkipTutorial);
        view.tutorialMenuBtn?.addEventListener('click', handlers.onPlayTutorial);
        view.firstTipBtn?.addEventListener('click', handlers.onDismissFirstTip);
        // New main-menu nav
        view.mainCompetitiveBtn?.addEventListener('click', () => {
          setCompetitivePanelOpen(true);
        });
        view.newRunBtn?.addEventListener('click', handlers.onOpenCharacterSelect);
        view.charBackBtn?.addEventListener('click', handlers.onCloseCharacterSelect);
        // Alt modes panel
        view.altModesBtn?.addEventListener('click', () => setAltModesPanelOpen(true));
        view.altModesClose?.addEventListener('click', () => setAltModesPanelOpen(false));
        view.competitiveClose?.addEventListener('click', () => setCompetitivePanelOpen(false));
        view.creditsBtn?.addEventListener('click', () => setCreditsPanelOpen(true));
        view.creditsClose?.addEventListener('click', () => setCreditsPanelOpen(false));
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && view.creditsPanel && !view.creditsPanel.classList.contains('hidden')) {
            setCreditsPanelOpen(false);
          }
        });
        view.altModeEndlessBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('endless');
        });
        view.altModePracticeBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('practice');
        });
        view.altModeChallengePracticeBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('challenge_practice');
        });
        view.altModeBossRushBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('boss_rush');
        });
        view.altModeCoopBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('coop');
        });
        view.altModePvpBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onOpenAltModeCharSelect('pvp');
        });
        view.altModeCompetitiveBtn?.addEventListener('click', () => {
          setCompetitivePanelOpen(false);
          handlers.onOpenAltModeCharSelect('competitive');
        });
        view.competitiveServerRetryBtn?.addEventListener('click', () => {
          renderCompetitiveServerStatus({ state: 'checking' });
          initCompetitiveLeaderboard();
        });
        document.getElementById('competitiveLbMoreBtn')?.addEventListener('click', () => debouncedLoadLb(true));
        view.mpLobbyBack?.addEventListener('click', () => {
          Neo.closeMpLobby();
          setAltModesPanelOpen(true);
        });
        view.mpLobby1Btn?.addEventListener('click', () => {
          Neo.mpPlayerCount = 1;
          Neo.closeMpLobby();
          Neo.charSelectPhase = 'p1';
          Neo.setGameState('charselect');
          Neo.updateCharacterSelectionUI();
        });
        view.mpLobby2Btn?.addEventListener('click', () => {
          Neo.mpPlayerCount = 2;
          Neo.closeMpLobby();
          Neo.charSelectPhase = 'p1';
          Neo.setGameState('charselect');
          Neo.updateCharacterSelectionUI();
        });
        document.getElementById('mpLobby3Btn')?.addEventListener('click', () => {
          Neo.mpPlayerCount = 3;
          Neo.closeMpLobby();
          Neo.charSelectPhase = 'p1';
          Neo.setGameState('charselect');
          Neo.updateCharacterSelectionUI();
        });
        document.getElementById('mpLobby4Btn')?.addEventListener('click', () => {
          Neo.mpPlayerCount = 4;
          Neo.closeMpLobby();
          Neo.charSelectPhase = 'p1';
          Neo.setGameState('charselect');
          Neo.updateCharacterSelectionUI();
        });
        // Alt modes tabs
        document.querySelectorAll('.altmodes-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            document.querySelectorAll('.altmodes-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.altmodes-tab-panel').forEach(p => p.classList.add('hidden'));
            tab.classList.add('active');
            const panel = document.querySelector(`.altmodes-tab-panel[data-panel="${tab.dataset.tab}"]`);
            if (panel) panel.classList.remove('hidden');
          });
        });
        view.altModeSandboxConfigBtn?.addEventListener('click', handlers.onOpenSandboxConfig);
        view.altModeSandboxBtn?.addEventListener('click', () => {
          setAltModesPanelOpen(false);
          handlers.onStartSandbox();
        });
        // Practice panel toggle
        view.practicePanelToggle?.addEventListener('click', () => {
          view.practicePanelBody?.classList.toggle('hidden');
        });
        bindPracticePanelDrag();
        view.practiceMaxHpSlider?.addEventListener('input', () => {
          Neo.setPracticeMaxHp(view.practiceMaxHpSlider.value);
        });
        view.practiceMaxHpNum?.addEventListener('change', () => {
          Neo.setPracticeMaxHp(view.practiceMaxHpNum.value);
        });
        view.practiceClearBtn?.addEventListener('click', () => { Neo.enemies.length = 0; });
        view.practiceHealBtn?.addEventListener('click', () => {
          if (!Neo.player) return;
          Neo.player.hp = Neo.player.maxHp;
          Neo.updateHud();
        });
        view.practiceGiveItemBtn?.addEventListener('click', () => {
          if (!Neo.player) return;
          const key = Neo.rollItemDrop({ elite: true, stream: 'loot' });
          if (key) Neo.collectItem(key);
        });
        if (view.practiceEnemyGrid) Neo.buildPracticeEnemyGrid();
        menuBound = true;
      },
      bindRestartActions(actions) {
        if (restartBound) return;
        const defaultRestart = typeof actions === 'function' ? actions : actions?.onWinRestart;
        view.deadRestart?.addEventListener('click', defaultRestart);
        view.winRestart?.addEventListener('click', defaultRestart);
        view.deadActions?.forEach(button => {
          button.addEventListener('click', () => {
            const action = button.dataset.deadAction || 'retry-current';
            if (typeof actions === 'function') actions();
            else actions?.onDeadAction?.(action);
          });
        });
        view.winActions?.forEach(button => {
          button.addEventListener('click', () => {
            const action = button.dataset.winAction || 'new-seed';
            if (typeof actions === 'function') actions();
            else actions?.onWinAction?.(action);
          });
        });
        restartBound = true;
      },
      playDialogue(lines, options) {
        const started = dialogueRuntime?.start?.(lines, options);
        renderDialogue();
        return !!started;
      },
      advanceDialogue() {
        const advanced = dialogueRuntime?.advance?.();
        renderDialogue();
        return !!advanced;
      },
      isDialogueOpen() {
        return !!dialogueRuntime?.isOpen?.();
      },
      resolveDialoguePortraitKey,
      sayAtWorldAnchor(input) {
        const id = worldSpeechRuntime?.say?.(input);
        renderEntityDialogue();
        return id || null;
      },
      setSaveState(text) { view.saveState.textContent = text; },
      setChallengePanelOpen,
      setLegacyPanelOpen,
      setRunHistoryOpen,
      setSandboxPanelOpen,
      setAchievementsPanelOpen,
      setMenuMeta(coins, bestFloor, loopCrystals, saveState) {
        view.bankCoins.textContent = coins;
        view.bestFloor.textContent = bestFloor;
        if (view.loopCount) view.loopCount.textContent = loopCrystals;
        view.saveState.textContent = saveState;
        // Keep the CTA stable for the current menu view, but only offer it once
        // per 30-day window across visits.
        const canOfferTutorial = activeState === 'menu' && (tutorialMenuOfferVisible || !!Neo.shouldOfferTutorialButton?.());
        if (activeState === 'menu' && canOfferTutorial && !tutorialMenuOfferVisible) {
          tutorialMenuOfferVisible = true;
          Neo.markTutorialButtonOfferedNow?.();
        }
        view.tutorialMenuBtn?.classList.toggle('hidden', !canOfferTutorial);
      },
      showFirstTip(tip) {
        if (!view.firstTipOverlay || !tip) return;
        if (view.firstTipIcon) view.firstTipIcon.textContent = tip.icon || '★';
        if (view.firstTipTitle) view.firstTipTitle.textContent = tip.title || 'TIP';
        if (view.firstTipBody) view.firstTipBody.textContent = tip.body || '';
        view.firstTipOverlay.classList.remove('hidden');
        view.firstTipOverlay.setAttribute('aria-hidden', 'false');
        view.firstTipBtn?.focus?.();
      },
      hideFirstTip() {
        if (!view.firstTipOverlay) return;
        view.firstTipOverlay.classList.add('hidden');
        view.firstTipOverlay.setAttribute('aria-hidden', 'true');
      },
      setRunSummary(summary) {
        const hasRun = !!summary;
        // Main menu: show/hide Continue button
        view.continueBtn?.classList.toggle('hidden', !hasRun);
        view.runSummary.textContent = summary || '';
      },
      setRunHistory(entries) {
        runHistoryEntries = Neo.normalizeRunHistory(entries);
        runHistoryPage = 0;
        runHistoryModeFilter = 'all';
        selectedRunHistoryId = runHistoryEntries[0]?.id || '';
        activeRunHistoryTab = 'stats';
        renderRunHistoryPage();
      },
      updateCharacterSelection(unlocked, selected) {
        const CHAR_ORDER = ['princess', 'thorn_knight', 'metao', 'gelleh', 'mooggy'];
        const ROLE_LABELS = {
          princess: 'Starter',
          thorn_knight: 'Bleed melee',
          metao: 'Range caster',
          gelleh: 'Divine hybrid',
          mooggy: 'Fast assassin',
        };
        const unlockText = (itemKey) => {
          if (unlocked.has(itemKey)) return ROLE_LABELS[itemKey] || 'Ready';
          if (itemKey === 'gelleh') return 'Unlock: beat GOD';
          if (itemKey === 'mooggy') {
            const mooggyProgress = Math.max(0, Math.min(3, Number(Neo.metaProgress?.mooggyDefeats || 0)));
            return `Unlock: Mooggy ${mooggyProgress}/3`;
          }
          return 'Locked';
        };

        view.charButtons.forEach(button => {
          const itemKey = button.dataset.char;
          const hint = button.querySelector('small');
          const spriteCanvas = button.querySelector('[data-char-sprite]');
          button.classList.toggle('locked', !unlocked.has(itemKey));
          button.classList.toggle('sel', selected === itemKey);
          button.disabled = !unlocked.has(itemKey);
          if (hint) hint.textContent = unlockText(itemKey);
          if (spriteCanvas) {
            Neo.drawSpriteToCanvas(spriteCanvas, itemKey, 76, {
              alpha: unlocked.has(itemKey) ? 1 : 0.42,
            });
          }
          button.querySelectorAll('[data-inv-ui-icon]').forEach(canvas => {
            Neo.drawInventoryUiIcon?.(canvas, canvas.dataset.invUiIcon);
          });
        });

        // The roster is now a fixed grid; clear old carousel offsets from prior builds.
        const track = document.getElementById('choose');
        if (track) track.style.transform = '';

        // ── Arrow disabled state ─────────────────────────────
        const carouselPrev = document.getElementById('carouselPrev');
        const carouselNext = document.getElementById('carouselNext');
        const currentPos = CHAR_ORDER.indexOf(selected);
        if (carouselPrev) carouselPrev.disabled = currentPos <= 0;
        if (carouselNext) carouselNext.disabled = currentPos >= CHAR_ORDER.length - 1;

        // ── Go button: disable if selected character is locked ─
        const goBtn = document.getElementById('go');
        if (goBtn) goBtn.disabled = !unlocked.has(selected);

        // ── Hero detail panel ────────────────────────────────
        const detail = document.getElementById('heroDetail');
        const disp = Neo.HERO_DISPLAY[selected];
        if (detail && disp) {
          const STAT_ICON_KEYS = { HP: 'hp', ATK: 'attack', DMG: 'attack', SPD: 'speed', RANGE: 'range', RNG: 'range', CTRL: 'crit' };
          const statsHtml = disp.stats.map(s =>
            `<div class="char-stat-row"><canvas class="char-stat-icon" data-inv-ui-icon="${Neo.escapeHtml(STAT_ICON_KEYS[s.label] || 'crit')}" width="24" height="24" aria-hidden="true"></canvas><span class="stat-label">${s.label}</span>` +
            `<div class="stat-bar"><div class="stat-fill" style="width:${s.pct}%;background:${s.color}"></div></div></div>`
          ).join('');
          const defaultMoves = Neo.getDefaultMovesForCharacter(selected);
          const defaultWeapon = Neo.getDefaultWeaponForCharacter(selected);
          const slots = ['melee', 'laser', 'smash', 'dash'];
          const skillsHtml = slots.map(slot => {
            const slotLabel = Neo.SLOT_LABELS[slot] || Neo.titleCase(slot);
            // The melee (M1) slot is driven by the equipped weapon — characters
            // start with their signature weapon, so show that here rather than the
            // bare-hands `slash` fallback the move slot defaults to.
            if (slot === 'melee' && defaultWeapon) {
              const weaponDef = Neo.WEAPON_DEFS[defaultWeapon] || {};
              const weaponLabel = weaponDef.name || defaultWeapon || 'Unknown';
              return `<span class="hero-detail-skill-pip">
              <canvas class="hero-detail-skill-icon" data-hero-weapon="${Neo.escapeHtml(defaultWeapon)}" width="24" height="24" aria-hidden="true"></canvas>
              <span class="hero-detail-skill-text">${Neo.escapeHtml(slotLabel)}: ${Neo.escapeHtml(weaponLabel)}</span>
            </span>`;
            }
            const moveKey = String(defaultMoves[slot] || '');
            const moveDef = Neo.MOVE_DEFS[moveKey] || {};
            const moveLabel = moveDef.name || moveKey || 'Unknown';
            return `<span class="hero-detail-skill-pip">
              <canvas class="hero-detail-skill-icon" data-hero-move="${Neo.escapeHtml(moveKey)}" width="24" height="24" aria-hidden="true"></canvas>
              <span class="hero-detail-skill-text">${Neo.escapeHtml(slotLabel)}: ${Neo.escapeHtml(moveLabel)}</span>
            </span>`;
          }).join('');
          const startingItems = getCharacterStartingItems(selected);
          const inventoryKeys = Object.keys(startingItems).filter(key => Number(startingItems[key] || 0) > 0);
          const inventoryHtml = inventoryKeys.length
            ? inventoryKeys.map(key => {
              const count = Math.max(1, Math.round(Number(startingItems[key]) || 0));
              const item = Neo.ITEM_DEFS[key] || {};
              const itemName = item.name || Neo.titleCase(String(key || '').replace(/_/g, ' '));
              const countText = count > 1 ? ` x${count}` : '';
              // Tooltip parity with the death screen: description on hover/focus.
              const tooltipText = item.description || 'No item description available.';
              const safeTooltip = Neo.escapeHtml(tooltipText);
              const safeAria = Neo.escapeHtml(`${itemName}${countText}. ${tooltipText}`);
              return `<span class="hero-detail-item-pip" tabindex="0" title="${safeTooltip}" aria-label="${safeAria}" data-tooltip="${safeTooltip}">
                <canvas class="hero-detail-item-icon" data-hero-item="${Neo.escapeHtml(key)}" width="20" height="20" aria-hidden="true"></canvas>
                <span>${Neo.escapeHtml(itemName)}${Neo.escapeHtml(countText)}</span>
              </span>`;
            }).join('')
            : '<span class="hero-detail-item-empty">No starter items</span>';
          const charDef = Neo.CHARACTER_DEFS[selected] || {};
          detail.innerHTML =
            `<div class="hero-detail-portrait"><canvas id="heroDetailSprite" width="128" height="128" aria-hidden="true"></canvas></div>` +
            `<div class="hero-detail-head"><span class="hero-detail-name">${Neo.escapeHtml(charDef.name || selected)}</span></div>` +
            `<p class="hero-detail-lore">${disp.lore}</p>` +
            `<div class="hero-detail-stats"><div class="hero-detail-section-label">Stats</div>${statsHtml}</div>` +
            `<div class="hero-detail-skills"><div class="hero-detail-section-label">Kit</div>${skillsHtml}</div>` +
            `<div class="hero-detail-inventory"><span class="hero-detail-inventory-label">Starting Inventory</span>${inventoryHtml}</div>`;
          Neo.drawSpriteToCanvas(document.getElementById('heroDetailSprite'), selected, 104);
          detail.querySelectorAll('[data-hero-move]').forEach(el => {
            const move = Neo.MOVE_DEFS[el.dataset.heroMove];
            if (move) Neo.drawMoveToastIcon(el, move);
          });
          detail.querySelectorAll('[data-hero-weapon]').forEach(el => {
            const weapon = Neo.WEAPON_DEFS[el.dataset.heroWeapon];
            if (weapon) Neo.drawWeaponToastIcon(el, weapon);
          });
          Neo.drawItemIconCanvases?.(detail, 'data-hero-item');
          detail.querySelectorAll('[data-inv-ui-icon]').forEach(el => {
            Neo.drawInventoryUiIcon?.(el, el.dataset.invUiIcon);
          });
        }
      },
      updateDifficultySelection(unlocked, selected, loopCrystals) {
        const selectedDef = Neo.getDifficultyDef(selected);
        view.difficultyButtons.forEach(button => {
          const key = button.dataset.difficulty === 'custom' ? 'custom' : Neo.normalizeDifficulty(button.dataset.difficulty || '');
          const def = Neo.getDifficultyDef(key);
          const isUnlocked = unlocked.has(key);
          button.classList.toggle('sel', selected === key);
          button.classList.toggle('locked', !isUnlocked);
          button.disabled = !isUnlocked;
          button.title = isUnlocked ? def.description : `Unlock at ${def.unlockLoops} Loop Crystals`;
        });
      
      },
      updateChallengeSelection(unlocked, owned, selected, loopCrystals, bankCoins) {
        view.challengeButtons.forEach(button => {
          const key = button.dataset.challenge || '';
          const def = Neo.CHALLENGE_DEFS[key];
          if (!def) return;
          const isUnlocked = unlocked.has(key);
          const isOwned = owned.has(key);
          const isSelected = selected.includes(key);
          button.style.setProperty('--challenge-accent', getChallengeAccent(def));
          button.classList.toggle('locked', !isUnlocked);
          button.classList.toggle('purchased', isOwned);
          button.classList.toggle('sel', isSelected);
          button.disabled = !isUnlocked;
          button.title = !isUnlocked
            ? `Unlock at ${def.unlockLoops} Loop Crystals`
            : isOwned
              ? def.description
              : `${def.description} Cost: ${def.cost} Loop Crystals`;
          button.innerHTML = renderChallengeButtonContent(def, { isUnlocked, isOwned, isSelected });
        });
        if (view.challengeHint) {
          const activeCount = selected.length;
          const bonusCrystals = Math.max(0, Math.round(Neo.getActiveChallengeCrystalBonusMultiplier()));
          view.challengeHint.innerHTML = `${LC} ${loopCrystals} — Buy run types once, then toggle them. Active: ${activeCount}. Loop bonus: +${bonusCrystals} ${LC}.`;
        }
        if (activeInfoTab === 'meta' && view.rhInfoContent) view.rhInfoContent.innerHTML = renderMetaProgressionInfo();
      },
      updateLegacySelection(owned, loopCrystals) {
        view.legacyButtons.forEach(button => {
          const key = button.dataset.legacy || '';
          const def = Neo.LEGACY_UPGRADES[key];
          if (!def) return;
          const isOwned = owned.has(key);
          const canAfford = loopCrystals >= def.cost;
          button.classList.toggle('owned', isOwned);
          button.disabled = isOwned;
          const status = isOwned ? 'UNLOCKED' : canAfford ? `BUY ${def.cost} ${LC}` : `NEED ${def.cost} ${LC}`;
          button.innerHTML = `
            <span class="legacy-btn__top">
              <b>${Neo.escapeHtml(def.name)}</b>
              <em>${status}</em>
            </span>
            <span class="legacy-btn__desc">${Neo.escapeHtml(def.description)}</span>
            <span class="legacy-btn__effect">${Neo.escapeHtml(def.effect)}</span>
          `;
        });
        if (view.legacyHint) {
          const ownedCount = Neo.LEGACY_ORDER.filter(k => owned.has(k)).length;
          view.legacyHint.innerHTML = `${LC} ${loopCrystals} — Unlocked: ${ownedCount} / ${Neo.LEGACY_ORDER.length}. Upgrades are permanent and apply to all future runs.`;
        }
        if (activeInfoTab === 'meta' && view.rhInfoContent) view.rhInfoContent.innerHTML = renderMetaProgressionInfo();
      },
      setItemStatus(items) {
        Neo.ITEM_KEYS.forEach(key => {
          const count = Number(items[key] || 0);
          view.itemSlots[key]?.classList.toggle('on', count > 0);
          if (view.itemCounts[key]) view.itemCounts[key].textContent = String(count);
        });
      },
      setObjective(text) { view.objective.textContent = text; },
      setTutorialBanner(text, visible) {
        const open = !!visible && !!text && Neo.gameState === 'play';
        if (view.tutorialOverlay && tutorialBannerCache.open !== open) {
          view.tutorialOverlay.classList.toggle('hidden', !open);
          view.tutorialOverlay.setAttribute('aria-hidden', open ? 'false' : 'true');
          view.tutorialOverlay.style.display = open ? 'flex' : 'none';
          tutorialBannerCache.open = open;
        }
        if (view.tutorialSpeaker && open && view.tutorialSpeaker.textContent !== 'TUTORIAL') {
          view.tutorialSpeaker.textContent = 'TUTORIAL';
        }
        const nextText = open ? String(text || '') : '';
        if (view.tutorialText && tutorialBannerCache.text !== nextText) {
          view.tutorialText.textContent = nextText;
          tutorialBannerCache.text = nextText;
        }
        const nextHint = open ? 'Use Previous/Next. Press K or click Skip Tutorial' : '';
        if (view.tutorialHint && tutorialBannerCache.hint !== nextHint) {
          view.tutorialHint.textContent = nextHint;
          tutorialBannerCache.hint = nextHint;
        }
        const stepOrder = Neo.getTutorialStepOrder();
        const stepIndex = stepOrder.indexOf(Neo.tutorialState?.step || 'move');
        const prevDisabled = !open || stepIndex <= 0;
        const nextDisabled = !open || stepIndex < 0 || stepIndex >= (stepOrder.length - 1);
        if (view.tutorialPrevBtn && tutorialBannerCache.prevDisabled !== prevDisabled) {
          view.tutorialPrevBtn.disabled = prevDisabled;
          tutorialBannerCache.prevDisabled = prevDisabled;
        }
        if (view.tutorialNextBtn && tutorialBannerCache.nextDisabled !== nextDisabled) {
          view.tutorialNextBtn.disabled = nextDisabled;
          tutorialBannerCache.nextDisabled = nextDisabled;
        }
      },
      setObjectiveList(roomLabel, entries = []) {
        if (!view.objectiveTracker || !view.objectiveList) return;
        const panelEnabled = window.NeoSettings?.showObjectivePanel?.() !== false;
        const visible = panelEnabled && Neo.gameState === 'play' && entries.length > 0;
        objectiveTrackerVisible = visible;
        objectiveEntriesCache = Array.isArray(entries) ? entries.slice() : [];
        view.objectiveTracker.classList.toggle('hidden', !visible);
        view.objectiveTracker.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (view.objectiveRoomLabel) view.objectiveRoomLabel.textContent = String(roomLabel || 'ROOM').toUpperCase();
        view.objectiveList.innerHTML = entries.map(entry => (
          `<li data-state="${Neo.escapeHtml(entry.state || 'todo')}">${Neo.escapeHtml(entry.text || '')}</li>`
        )).join('');
        syncObjectiveTrackerCompactState();
      },
      setObjectiveLayout,
      setHudValues(payload) {
        if (hudRenderCache.floor !== payload.floor) {
          hudRenderCache.floor = payload.floor;
          setTextIfChanged(view.fl, payload.floor);
        }
        if (hudRenderCache.level !== payload.level) {
          hudRenderCache.level = payload.level;
          setTextIfChanged(view.lv, payload.level);
        }
        if (hudRenderCache.xpText !== payload.xpText) {
          hudRenderCache.xpText = payload.xpText;
          setTextIfChanged(view.xp, payload.xpText);
        }
        if (view.gameTime && hudRenderCache.gameTime !== payload.gameTime) {
          hudRenderCache.gameTime = payload.gameTime;
          setTextIfChanged(view.gameTime, payload.gameTime);
        }
        const difficultyName = String(payload.difficultyName || '').toUpperCase();
        if (hudRenderCache.difficultyName !== difficultyName) {
          hudRenderCache.difficultyName = difficultyName;
          if (view.difficultyLabel) setTextIfChanged(view.difficultyLabel, difficultyName);
          else if (view.difficultyDisplay) setTextIfChanged(view.difficultyDisplay, difficultyName);
        }
        if (view.itemRarityCounts && payload.itemRarityCounts) {
          const white = view.itemRarityCounts.querySelector('.rarity-count--white');
          const purple = view.itemRarityCounts.querySelector('.rarity-count--purple');
          const red = view.itemRarityCounts.querySelector('.rarity-count--red');
          const whiteValue = String(payload.itemRarityCounts.white || 0);
          const purpleValue = String(payload.itemRarityCounts.purple || 0);
          const redValue = String(payload.itemRarityCounts.red || 0);
          if (hudRenderCache.itemRarityWhite !== whiteValue) {
            hudRenderCache.itemRarityWhite = whiteValue;
            setTextIfChanged(white, whiteValue);
          }
          if (hudRenderCache.itemRarityPurple !== purpleValue) {
            hudRenderCache.itemRarityPurple = purpleValue;
            setTextIfChanged(purple, purpleValue);
          }
          if (hudRenderCache.itemRarityRed !== redValue) {
            hudRenderCache.itemRarityRed = redValue;
            setTextIfChanged(red, redValue);
          }
        }
        if (hudRenderCache.character !== payload.character) {
          hudRenderCache.character = payload.character;
          setTextIfChanged(view.charName, payload.character);
        }
        const hpWidth = `${Math.max(0, payload.hp / payload.maxHp) * 100}%`;
        if (hudRenderCache.hpWidth !== hpWidth) {
          hudRenderCache.hpWidth = hpWidth;
          if (view.hpFill && view.hpFill.style.width !== hpWidth) view.hpFill.style.width = hpWidth;
        }
        const hpText = String(Math.ceil(payload.hp));
        if (hudRenderCache.hpText !== hpText) {
          hudRenderCache.hpText = hpText;
          setTextIfChanged(view.hpTxt, hpText);
        }
        const cdM = payload.meleeCd.toFixed(1);
        const cdL = payload.laserCd.toFixed(1);
        const cdS = payload.smashCd.toFixed(1);
        const cdD = payload.dashCd.toFixed(1);
        if (view.cdM && hudRenderCache.cdM !== cdM) {
          hudRenderCache.cdM = cdM;
          setTextIfChanged(view.cdM, cdM);
        }
        if (view.cdL && hudRenderCache.cdL !== cdL) {
          hudRenderCache.cdL = cdL;
          setTextIfChanged(view.cdL, cdL);
        }
        if (view.cdS && hudRenderCache.cdS !== cdS) {
          hudRenderCache.cdS = cdS;
          setTextIfChanged(view.cdS, cdS);
        }
        if (view.cdD && hudRenderCache.cdD !== cdD) {
          hudRenderCache.cdD = cdD;
          setTextIfChanged(view.cdD, cdD);
        }
        if (payload.skills) {
          updateSkillCardIfChanged('melee', payload.skills.melee);
          updateSkillCardIfChanged('laser', payload.skills.laser);
          updateSkillCardIfChanged('smash', payload.skills.smash);
          updateSkillCardIfChanged('dash', payload.skills.dash);
        }
      },
      setCompetitiveServerStatus(status) {
        renderCompetitiveServerStatus(status);
      },
      setCompetitivePanelOpen(open) {
        setCompetitivePanelOpen(open);
      },
      setCompetitiveSubmitStatus(status = {}) {
        const el = view.deadCompetitiveStatus || document.getElementById('deadCompetitiveStatus');
        if (!el) return;
        const state = status.state || 'idle';
        el.className = `competitive-submit-status competitive-submit-status--${state}`;
        el.classList.toggle('hidden', state === 'idle');
        if (state === 'submitting') el.textContent = 'Submitting competitive run to the server...';
        else if (state === 'ok') el.textContent = status.rank ? `Competitive run submitted - rank #${status.rank}.` : 'Competitive run submitted.';
        else if (state === 'error') el.textContent = status.message || 'Could not submit competitive run. Server connection is required for leaderboard credit.';
        else el.textContent = '';
      },
      setDeadScreen(entry) {
        const fmt = (n) => String(n ?? '—');
        const fmtTime = (s) => {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return `${m}:${sec.toString().padStart(2, '0')}`;
        };
        if (view.deadKillerCanvas) {
          const killerLookup = entry.killerKey || entry.killedBy || '';
          const hazardIcon = Neo.resolveKillerHazardIcon?.(killerLookup);
          if (hazardIcon && typeof Neo.drawHazardKillerIcon === 'function') {
            Neo.drawHazardKillerIcon(view.deadKillerCanvas, hazardIcon);
          } else {
            Neo.drawSpriteToCanvas(view.deadKillerCanvas, Neo.resolveKillerSprite(entry.killerKey || ''), 120);
          }
        }
        if (view.deadKillerName) view.deadKillerName.textContent = entry.killedBy || 'Unknown';
        // Endless mode is single-floor, so the FLOOR stat is repurposed to show
        // the wave reached — the meaningful score for that mode.
        const isEndlessEntry = entry.mode === 'endless';
        if (view.deadFloorLabel) view.deadFloorLabel.textContent = isEndlessEntry ? 'WAVE' : 'FLOOR';
        if (view.deadFloor) view.deadFloor.textContent = isEndlessEntry ? fmt(entry.endlessWave) : `${fmt(entry.floor)}/10`;
        if (view.deadLevel) view.deadLevel.textContent = fmt(entry.level);
        if (view.deadKills) view.deadKills.textContent = fmt(entry.kills);
        if (view.deadTime) view.deadTime.textContent = fmtTime(entry.elapsedSeconds || 0);
        if (view.deadCoins) view.deadCoins.textContent = fmt(entry.coins);
        if (view.deadCoinIcon && typeof Neo.drawPixelIcon === 'function') {
          Neo.drawPixelIcon(view.deadCoinIcon, '#ffd15a', [
            [2, 1], [3, 1], [4, 1],
            [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
            [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
            [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
            [2, 5], [3, 5], [4, 5],
          ]);
        }
        if (view.deadLoopCrystals) view.deadLoopCrystals.textContent = fmt(Number(Neo.metaProgress?.loopCrystals || 0));
        if (view.deadLoopIcon && typeof Neo.drawPixelIcon === 'function') {
          Neo.drawPixelIcon(view.deadLoopIcon, '#83f3ff', [
            [2, 1], [3, 1], [4, 1],
            [1, 2], [5, 2],
            [1, 3], [5, 3],
            [1, 4], [5, 4],
            [2, 5], [3, 5], [4, 5],
            [2, 2], [4, 2], [2, 4], [4, 4],
            [3, 3],
          ]);
        }
        if (view.deadDifficulty) view.deadDifficulty.textContent = (entry.difficultyName || entry.difficulty || '—').toUpperCase();
        if (view.deadDifficultyIcon && typeof Neo.drawDifficultyIconOn === 'function') {
          const difficultyKey = String(entry.difficulty || Neo.selectedDifficulty || 'easy').toLowerCase();
          Neo.drawDifficultyIconOn(view.deadDifficultyIcon, difficultyKey);
        }
        this.setCompetitiveSubmitStatus(Neo.gameMode === 'competitive' ? (Neo._competitiveSubmitStatus || { state: 'idle' }) : { state: 'idle' });
        const reviveButton = view.deadActions?.find(button => button.dataset.deadAction === 'revive');
        if (reviveButton) {
          const cost = Neo.getReviveCost();
          const crystals = Number(Neo.metaProgress.loopCrystals || 0);
          reviveButton.innerHTML = cost > 0
            ? `REVIVE ${cost} <canvas class="dead-action-lc-icon" width="20" height="20"></canvas>`
            : 'REVIVE FREE';
          const reviveIcon = reviveButton.querySelector('.dead-action-lc-icon');
          if (reviveIcon && typeof Neo.drawPixelIcon === 'function') {
            Neo.drawPixelIcon(reviveIcon, '#83f3ff', [
              [2, 1], [3, 1], [4, 1],
              [1, 2], [5, 2],
              [1, 3], [5, 3],
              [1, 4], [5, 4],
              [2, 5], [3, 5], [4, 5],
              [2, 2], [4, 2], [2, 4], [4, 4],
              [3, 3],
            ]);
          }
          reviveButton.disabled = crystals < cost;
          reviveButton.title = cost === 0
            ? 'Free revive'
            : crystals < cost
              ? `Need ${cost} Loop Crystal${cost === 1 ? '' : 's'}`
              : `Spend ${cost} Loop Crystal${cost === 1 ? '' : 's'} to revive`;
        }

        // ── Records row ────────────────────────────────────────────────────
        if (view.deadRecords) {
          const nr = entry._newRecords || {};
          const records = Neo.deriveRunRecords(Neo.runHistory, Neo.metaProgress);
          // Endless mode swaps the FLOOR best for the WAVE best — floor is always 1.
          const progressBest = entry.mode === 'endless'
            ? { label: 'WAVE', val: fmt(records.endlessWave), isNew: nr.endlessWave }
            : { label: 'FLOOR', val: `${records.floor}/10`, isNew: nr.floor };
          const bests = [
            progressBest,
            { label: 'KILLS',  val: fmt(records.kills),            isNew: nr.kills },
            { label: 'LEVEL',  val: fmt(records.level),            isNew: nr.level },
            { label: 'TIME',   val: fmtTime(records.time),         isNew: nr.time  },
            { label: 'COINS',  val: fmt(records.coins),            isNew: nr.coins },
          ];
          view.deadRecords.innerHTML = bests.map(b =>
            `<div class="dead-record${b.isNew ? ' dead-record--new' : ''}">
              <span class="dead-record-label">${b.label}</span>
              <span class="dead-record-val">${b.val}</span>
              ${b.isNew ? '<span class="dead-record-badge">NEW</span>' : ''}
            </div>`
          ).join('');
        }

        // ── Item icon cards with pagination ────────────────────────────────
        if (view.deadItems) {
          const items = Array.isArray(entry.items) ? entry.items : [];
          const PAGE_SIZE = 5;
          let itemPage = 0;
          const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

          const renderItemPage = () => {
            view.deadItems.innerHTML = '';
            if (items.length === 0) {
              view.deadItems.innerHTML = '<span class="dead-items-empty">None</span>';
            } else {
              const slice = items.slice(itemPage * PAGE_SIZE, itemPage * PAGE_SIZE + PAGE_SIZE);
              slice.forEach(item => {
                const itemDef = Neo.itemRegistry?.get(item.key) || Neo.ITEM_DEFS[item.key] || {};
                const rc = { knight: 'knight', white: 'knight', wizard: 'wizard', purple: 'wizard', god: 'god', red: 'god', blue: 'blue' }[item.rarity] || 'knight';
                const card = document.createElement('div');
                card.className = `dead-item-card dead-item-card--${rc}`;
                card.tabIndex = 0;
                const cnv = document.createElement('canvas');
                cnv.width = 32;
                cnv.height = 32;
                cnv.className = 'dead-item-icon';
                Neo.drawItemToastIcon(cnv, { ...itemDef, key: item.key, rarity: item.rarity, color: itemDef.color, accent: itemDef.accent });
                const label = document.createElement('span');
                label.className = 'dead-item-name';
                const itemName = item.name || itemDef.name || item.key || 'Unknown';
                const labelText = item.count > 1 ? `${itemName} ×${item.count}` : itemName;
                const tooltipText = itemDef.description || item.description || 'No item description available.';
                label.textContent = labelText;
                card.title = tooltipText;
                card.setAttribute('aria-label', `${labelText}. ${tooltipText}`);
                card.dataset.tooltip = tooltipText;
                card.appendChild(cnv);
                card.appendChild(label);
                view.deadItems.appendChild(card);
              });
            }
            if (view.deadItemsPage) view.deadItemsPage.textContent = totalPages > 1 ? `${itemPage + 1}/${totalPages}` : '';
            if (view.deadItemsPrev) view.deadItemsPrev.disabled = itemPage <= 0;
            if (view.deadItemsNext) view.deadItemsNext.disabled = itemPage >= totalPages - 1;
            if (view.deadItemsPrev) view.deadItemsPrev.classList.toggle('hidden', totalPages <= 1);
            if (view.deadItemsNext) view.deadItemsNext.classList.toggle('hidden', totalPages <= 1);
            if (view.deadItemsPage) view.deadItemsPage.classList.toggle('hidden', totalPages <= 1);
          };

          if (view.deadItemsPrev) {
            view.deadItemsPrev.onclick = () => { itemPage = Math.max(0, itemPage - 1); renderItemPage(); };
          }
          if (view.deadItemsNext) {
            view.deadItemsNext.onclick = () => { itemPage = Math.min(totalPages - 1, itemPage + 1); renderItemPage(); };
          }
          renderItemPage();
        }
      },
      setWinInfo(text) { if (view.winInfo) view.winInfo.textContent = text; },
      setWinScreen(entry) {
        const fmt = (n) => String(n ?? '—');
        const fmtTime = (s) => {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return `${m}:${sec.toString().padStart(2, '0')}`;
        };
        if (view.winFloor) view.winFloor.textContent = `${fmt(entry.floor)}/10`;
        if (view.winLevel) view.winLevel.textContent = fmt(entry.level);
        if (view.winKills) view.winKills.textContent = fmt(entry.kills);
        if (view.winTime) view.winTime.textContent = fmtTime(entry.elapsedSeconds || 0);
        if (view.winCoins) view.winCoins.textContent = fmt(entry.coins);
        if (view.winCoinIcon && typeof Neo.drawPixelIcon === 'function') {
          Neo.drawPixelIcon(view.winCoinIcon, '#ffd15a', [
            [2, 1], [3, 1], [4, 1],
            [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
            [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
            [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
            [2, 5], [3, 5], [4, 5],
          ]);
        }
        if (view.winDifficulty) view.winDifficulty.textContent = (entry.difficultyName || entry.difficulty || '—').toUpperCase();

        const earned = Number(entry.loopCrystalsEarned || 0);
        const totalAfter = Number(Neo.metaProgress?.loopCrystals || 0);
        if (view.winCrystalsEarned) view.winCrystalsEarned.textContent = `+${earned}`;
        if (view.winCrystalsTotal) view.winCrystalsTotal.textContent = String(totalAfter);

        if (view.winItems) {
          const items = Array.isArray(entry.items) ? entry.items : [];
          const PAGE_SIZE = 5;
          let itemPage = 0;
          const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

          const renderItemPage = () => {
            view.winItems.innerHTML = '';
            if (items.length === 0) {
              view.winItems.innerHTML = '<span class="dead-items-empty">None</span>';
            } else {
              const slice = items.slice(itemPage * PAGE_SIZE, itemPage * PAGE_SIZE + PAGE_SIZE);
              slice.forEach(item => {
                const itemDef = Neo.ITEM_DEFS[item.key] || {};
                const rc = { knight: 'knight', white: 'knight', wizard: 'wizard', purple: 'wizard', god: 'god', red: 'god', blue: 'blue' }[item.rarity] || 'knight';
                const card = document.createElement('div');
                card.className = `dead-item-card dead-item-card--${rc}`;
                const cnv = document.createElement('canvas');
                cnv.width = 32;
                cnv.height = 32;
                cnv.className = 'dead-item-icon';
                Neo.drawItemToastIcon(cnv, { ...itemDef, key: item.key, rarity: item.rarity, color: itemDef.color, accent: itemDef.accent });
                const label = document.createElement('span');
                label.className = 'dead-item-name';
                label.textContent = item.count > 1 ? `${item.name} ×${item.count}` : item.name;
                card.appendChild(cnv);
                card.appendChild(label);
                view.winItems.appendChild(card);
              });
            }
            if (view.winItemsPage) view.winItemsPage.textContent = totalPages > 1 ? `${itemPage + 1}/${totalPages}` : '';
            if (view.winItemsPrev) view.winItemsPrev.disabled = itemPage <= 0;
            if (view.winItemsNext) view.winItemsNext.disabled = itemPage >= totalPages - 1;
            if (view.winItemsPrev) view.winItemsPrev.classList.toggle('hidden', totalPages <= 1);
            if (view.winItemsNext) view.winItemsNext.classList.toggle('hidden', totalPages <= 1);
            if (view.winItemsPage) view.winItemsPage.classList.toggle('hidden', totalPages <= 1);
          };

          if (view.winItemsPrev) view.winItemsPrev.onclick = () => { itemPage = Math.max(0, itemPage - 1); renderItemPage(); };
          if (view.winItemsNext) view.winItemsNext.onclick = () => { itemPage = Math.min(totalPages - 1, itemPage + 1); renderItemPage(); };
          renderItemPage();
        }
      },
    };
  }

Neo.createUIController = createUIController;
