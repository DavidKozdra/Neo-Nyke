(function Settings() {
  const STORE_KEY = 'neonyke:settings';
  const REPLAY_TUTORIAL_KEY = 'neonyke:replayTutorialNextRun';

  const DEFAULT_EQUIPMENT_SLOT_KEYS = ['f', 'g', 'h', 'j', 'k', 'l', 'u', 'i'];
  const DEFAULT_BINDINGS = {
    up:'w', down:'s', left:'a', right:'d', dash:'shift', inventory:'i', interact:'e', ascend:' ', smash:'r', slash:'lmb', laser:'rmb',
    activateAll:' ',
    tool1:'f', tool2:'g', tool3:'h', tool4:'j', tool5:'k', tool6:'l', tool7:'u', tool8:'i',
  };
  const DEFAULT_TOUCH_BINDINGS = { touchA:'slash', touchB:'laser', touchY:'smash', touchX:'ascend', touchDash:'dash' };
  const DEFAULT_GAMEPAD_BINDINGS = {
    0:'slash', 1:'dash', 2:'laser', 3:'smash',
    4:'inventory', 5:'dash', 6:'activateAll', 7:'interact',
    8:'inventory', 9:'pause', 10:'ascend', 11:'interact',
  };
  const GAMEPAD_ACTIONS = [
    ['none', 'None'], ['slash', 'Slash'], ['laser', 'Laser'], ['smash', 'Smash'], ['dash', 'Dash'],
    ['ascend', 'Climb / Exit'], ['interact', 'Interact'], ['inventory', 'Inventory'],
    ['activateAll', 'Activate All Tools'], ['pause', 'Pause'],
    ['tool1', 'Tool Slot 1'], ['tool2', 'Tool Slot 2'], ['tool3', 'Tool Slot 3'], ['tool4', 'Tool Slot 4'],
    ['tool5', 'Tool Slot 5'], ['tool6', 'Tool Slot 6'], ['tool7', 'Tool Slot 7'], ['tool8', 'Tool Slot 8'],
  ];
  const DEFAULT_VOLUME   = { master:20, sfx:80, music:20 };
  const DEFAULT_ACCESS   = { reduceFlash:false, reduceMotion:false, reduceParticles:false, highContrast:false, screenShake:true, rumble:true, shopCanAfford:'#4caf50', shopCantAfford:'#e05555', hudScale:1, fontScale:1 };
  const DEFAULT_GAMEPLAY = { pauseInventory:true, pauseOnBlur:true, bloodMultiplier:1, bloodOnHit:true, performanceMode:true, objectivePanel:true, cutsceneAutoAdvance:false };
  const BLOOD_MULTIPLIER_MIN = 1;
  const BLOOD_MULTIPLIER_MAX = 10;

  function normalizeBloodMultiplier(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_GAMEPLAY.bloodMultiplier;
    return Math.max(BLOOD_MULTIPLIER_MIN, Math.min(BLOOD_MULTIPLIER_MAX, Math.round(n)));
  }

  const HUD_SCALE_MIN = 0.5;
  const HUD_SCALE_MAX = 2.0;
  const HUD_SCALE_STEP = 0.1;
  function normalizeHudScale(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_ACCESS.hudScale;
    return Math.max(HUD_SCALE_MIN, Math.min(HUD_SCALE_MAX, Math.round(n / HUD_SCALE_STEP) * HUD_SCALE_STEP));
  }

  const FONT_SCALE_MIN = 0.8;
  const FONT_SCALE_MAX = 1.6;
  const FONT_SCALE_STEP = 0.05;
  function normalizeFontScale(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_ACCESS.fontScale;
    return Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, Math.round(n / FONT_SCALE_STEP) * FONT_SCALE_STEP));
  }

  // ── Per-element HUD layout ────────────────────────────────────────────────────
  // The six widgets the legacy global HUD-scale slider drove. Each gets its own
  // scale + visibility now; the global slider is kept as the fallback default so
  // old saves and the "everything" knob still work. `cssVar` feeds a transform in
  // style.css; `hideClass` toggles a body class that hides just that widget.
  const HUD_ELEMENTS = [
    { key: 'coins',      label: 'Coins & Loop',     cssVar: '--hud-scale-coins',      xVar: '--hud-x-coins',      yVar: '--hud-y-coins',      hideClass: 'hud-hide-coins' },
    { key: 'center',     label: 'Timer / Floor',    cssVar: '--hud-scale-center',     xVar: '--hud-x-center',     yVar: '--hud-y-center',     hideClass: 'hud-hide-center' },
    { key: 'objectives', label: 'Objective Panel',  cssVar: '--hud-scale-objectives', xVar: '--hud-x-objectives', yVar: '--hud-y-objectives', hideClass: 'hud-hide-objectives' },
    { key: 'stats',      label: 'Player Stats',     cssVar: '--hud-scale-stats',      xVar: '--hud-x-stats',      yVar: '--hud-y-stats',      hideClass: 'hud-hide-stats' },
    { key: 'actions',    label: 'Action Bar',       cssVar: '--hud-scale-actions',    xVar: '--hud-x-actions',    yVar: '--hud-y-actions',    hideClass: 'hud-hide-actions' },
    { key: 'equipment',  label: 'Tool Slots',       cssVar: '--hud-scale-equipment',  xVar: '--hud-x-equipment',  yVar: '--hud-y-equipment',  hideClass: 'hud-hide-equipment' },
    // The minimap is drawn on the canvas, not a DOM widget, so it has no CSS vars.
    // drawMinimap() reads its scale/visibility/offsets from getHudElements().
    { key: 'minimap',    label: 'Minimap',          cssVar: null, xVar: null, yVar: null, hideClass: null, canvas: true },
  ];

  // Per-element movement range, in screen pixels. Large enough to place any
  // anchor anywhere on current desktop/mobile screens; drag remains the primary
  // precise control while sliders provide numeric adjustment.
  const HUD_OFFSET_MIN = -4096;
  const HUD_OFFSET_MAX = 4096;
  const HUD_OFFSET_STEP = 2;
  function normalizeHudOffset(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(HUD_OFFSET_MIN, Math.min(HUD_OFFSET_MAX, Math.round(n / HUD_OFFSET_STEP) * HUD_OFFSET_STEP));
  }

  const HUD_PREVIEW_SCALE_FACTORS = {
    stats: 2,
    actions: 1.5,
  };

  function defaultHudElements() {
    const out = {};
    HUD_ELEMENTS.forEach(el => { out[el.key] = { scale: null, visible: true, x: 0, y: 0 }; });
    return out;
  }

  // scale === null means "inherit the global HUD scale". Otherwise clamp it.
  function normalizeHudElement(entry) {
    const scale = entry?.scale === null || entry?.scale === undefined
      ? null
      : normalizeHudScale(entry.scale);
    return {
      scale,
      visible: entry?.visible !== false,
      x: normalizeHudOffset(entry?.x),
      y: normalizeHudOffset(entry?.y),
    };
  }

  function normalizeHudElements(raw) {
    const out = defaultHudElements();
    if (raw && typeof raw === 'object') {
      HUD_ELEMENTS.forEach(el => {
        if (raw[el.key]) out[el.key] = normalizeHudElement(raw[el.key]);
      });
    }
    return out;
  }

  // ── Theme system ─────────────────────────────────────────────────────────────

  const THEME_VARS = [
    { key: '--menu-bg-deep',          label: 'Background Deep',    type: 'color' },
    { key: '--menu-bg-soft',          label: 'Background Soft',    type: 'color' },
    { key: '--menu-surface',          label: 'Surface',            type: 'color' },
    { key: '--menu-surface-strong',   label: 'Surface Strong',     type: 'color' },
    { key: '--menu-border',           label: 'Border',             type: 'color' },
    { key: '--menu-border-strong',    label: 'Border Strong',      type: 'color' },
    { key: '--menu-text',             label: 'Text',               type: 'color' },
    { key: '--menu-text-muted',       label: 'Text Muted',         type: 'color' },
    { key: '--menu-text-soft',        label: 'Text Soft',          type: 'color' },
    { key: '--menu-accent',           label: 'Accent',             type: 'color' },
    { key: '--menu-accent-strong',    label: 'Accent Strong',      type: 'color' },
    { key: '--menu-glow',             label: 'Glow',               type: 'color' },
    { key: '--menu-shadow',           label: 'Shadow',             type: 'color' },
    { key: '--menu-danger',           label: 'Danger',             type: 'color' },
  ];

  const PRESET_THEMES = {
    dark: {
      name: 'Dark',
      vars: {
        '--menu-bg-deep':         'rgba(15,18,24,.97)',
        '--menu-bg-soft':         'rgba(23,29,39,.95)',
        '--menu-surface':         'rgba(30,38,52,.92)',
        '--menu-surface-strong':  'rgba(38,48,66,.97)',
        '--menu-border':          'rgba(100,140,200,.30)',
        '--menu-border-strong':   'rgba(140,180,240,.55)',
        '--menu-text':            '#e8eaf6',
        '--menu-text-muted':      '#9ab0cc',
        '--menu-text-soft':       '#7090b0',
        '--menu-accent':          '#5b8dd9',
        '--menu-accent-strong':   '#a8c8ff',
        '--menu-glow':            'rgba(80,120,200,.30)',
        '--menu-shadow':          'rgba(4,8,18,.60)',
        '--menu-danger':          '#e05555',
      },
    },
    light: {
      name: 'Parchment',
      vars: {
        '--menu-bg-deep':         'rgba(42,32,18,.97)',
        '--menu-bg-soft':         'rgba(58,44,26,.95)',
        '--menu-surface':         'rgba(78,58,34,.92)',
        '--menu-surface-strong':  'rgba(98,74,42,.97)',
        '--menu-border':          'rgba(210,165,80,.38)',
        '--menu-border-strong':   'rgba(240,200,110,.65)',
        '--menu-text':            '#fdf3dc',
        '--menu-text-muted':      '#e8c97a',
        '--menu-text-soft':       '#c4a055',
        '--menu-accent':          '#d4a830',
        '--menu-accent-strong':   '#f5d060',
        '--menu-glow':            'rgba(210,168,48,.32)',
        '--menu-shadow':          'rgba(20,12,4,.58)',
        '--menu-danger':          '#e06030',
      },
    },
    princess: {
      name: 'Princess',
      vars: {
        '--menu-bg-deep':         'rgba(34,10,28,.97)',
        '--menu-bg-soft':         'rgba(52,18,46,.95)',
        '--menu-surface':         'rgba(72,26,62,.92)',
        '--menu-surface-strong':  'rgba(92,34,76,.97)',
        '--menu-border':          'rgba(245,126,189,.36)',
        '--menu-border-strong':   'rgba(255,180,220,.66)',
        '--menu-text':            '#fff0f8',
        '--menu-text-muted':      '#ffc2e0',
        '--menu-text-soft':       '#d98bb8',
        '--menu-accent':          '#f47ebd',
        '--menu-accent-strong':   '#ffd1ea',
        '--menu-glow':            'rgba(245,126,189,.34)',
        '--menu-shadow':          'rgba(28,4,22,.52)',
        '--menu-danger':          '#ff6f9f',
      },
    },
    nature: {
      name: 'Nature',
      vars: {
        '--menu-bg-deep':         'rgba(8,16,10,.97)',
        '--menu-bg-soft':         'rgba(14,26,17,.95)',
        '--menu-surface':         'rgba(20,38,24,.92)',
        '--menu-surface-strong':  'rgba(26,50,30,.97)',
        '--menu-border':          'rgba(80,180,100,.30)',
        '--menu-border-strong':   'rgba(120,220,140,.55)',
        '--menu-text':            '#e8f5e9',
        '--menu-text-muted':      '#a5d6a7',
        '--menu-text-soft':       '#70b872',
        '--menu-accent':          '#4caf50',
        '--menu-accent-strong':   '#a5d6a7',
        '--menu-glow':            'rgba(76,175,80,.30)',
        '--menu-shadow':          'rgba(2,10,4,.60)',
        '--menu-danger':          '#ef5350',
      },
    },
  };

  let activeTheme = 'dark';
  let customThemeVars = { ...PRESET_THEMES.dark.vars };
  let savedThemes = {};

  function resolveColor(cssVal) {
    // Convert rgba(...) to #rrggbb hex for color inputs (alpha is dropped for simplicity)
    const m = cssVal.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return '#' + [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
    if (cssVal.startsWith('#') && cssVal.length === 7) return cssVal;
    if (cssVal.startsWith('#') && cssVal.length === 4) {
      return '#' + cssVal.slice(1).split('').map(c => c+c).join('');
    }
    return '#888888';
  }

  function applyThemeVars(vars) {
    const root = document.documentElement;
    THEME_VARS.forEach(({ key }) => {
      if (vars[key] !== undefined) root.style.setProperty(key, vars[key]);
    });
  }

  function applyTheme(key) {
    activeTheme = key;
    if (PRESET_THEMES[key]) {
      customThemeVars = { ...PRESET_THEMES[key].vars };
      applyThemeVars(PRESET_THEMES[key].vars);
    } else if (savedThemes[key]) {
      customThemeVars = { ...savedThemes[key].vars };
      applyThemeVars(savedThemes[key].vars);
    }
    refreshThemeUI();
  }

  function refreshThemeUI() {
    // Preset cards
    const presetsEl = document.getElementById('themePresets');
    if (!presetsEl) return;
    const allThemes = { ...PRESET_THEMES, ...savedThemes };
    presetsEl.innerHTML = '';
    Object.entries(allThemes).forEach(([key, def]) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'theme-card' + (activeTheme === key ? ' theme-card--active' : '');
      card.dataset.themeKey = key;
      const swatch = Object.values(def.vars).slice(6, 10).map(c =>
        `<span class="theme-swatch" style="background:${c}"></span>`
      ).join('');
      card.innerHTML = `<span class="theme-card-name">${def.name}</span><span class="theme-card-swatches">${swatch}</span>`;
      card.addEventListener('click', () => {
        applyTheme(key);
        save();
      });
      presetsEl.appendChild(card);
    });

    // Color pickers
    const varsEl = document.getElementById('themeVars');
    if (!varsEl) return;
    varsEl.innerHTML = '';
    THEME_VARS.forEach(({ key, label }) => {
      const row = document.createElement('div');
      row.className = 'theme-var-row';
      const hexVal = resolveColor(customThemeVars[key] || '#888888');
      row.innerHTML =
        `<label class="theme-var-label">${label}</label>` +
        `<input type="color" class="theme-var-picker" data-var="${key}" value="${hexVal}">` +
        `<span class="theme-var-hex">${hexVal}</span>`;
      row.querySelector('.theme-var-picker').addEventListener('input', e => {
        const hex = e.target.value;
        customThemeVars[key] = hex;
        row.querySelector('.theme-var-hex').textContent = hex;
        document.documentElement.style.setProperty(key, hex);
        // If a preset was active, switch to custom mode
        if (PRESET_THEMES[activeTheme]) activeTheme = '_custom';
        refreshPresetCards();
      });
      varsEl.appendChild(row);
    });

    // Name input reflects active theme if it's a saved one
    const nameInput = document.getElementById('themeNameInput');
    if (nameInput && savedThemes[activeTheme]) nameInput.value = savedThemes[activeTheme].name;
    else if (nameInput && PRESET_THEMES[activeTheme]) nameInput.value = '';
  }

  function refreshPresetCards() {
    document.querySelectorAll('.theme-card').forEach(card => {
      card.classList.toggle('theme-card--active', card.dataset.themeKey === activeTheme);
    });
  }

  // ── State ─────────────────────────────────────────────────────────────────────

  let bindings = { ...DEFAULT_BINDINGS };
  let touchBindings = { ...DEFAULT_TOUCH_BINDINGS };
  let gamepadBindings = { ...DEFAULT_GAMEPAD_BINDINGS };
  let controlMode = null;
  let touchControlsEnabled = null;
  let volume   = { ...DEFAULT_VOLUME };
  let access   = { ...DEFAULT_ACCESS };
  let gameplay = { ...DEFAULT_GAMEPLAY };
  let hudElements = defaultHudElements();

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!s) return;
      if (s.bindings)     bindings     = { ...DEFAULT_BINDINGS, ...s.bindings };
      if (s.touchBindings) touchBindings = { ...DEFAULT_TOUCH_BINDINGS, ...s.touchBindings };
      if (s.gamepadBindings) gamepadBindings = { ...DEFAULT_GAMEPAD_BINDINGS, ...s.gamepadBindings };
      if (s.controlMode === 'desktop' || s.controlMode === 'mobile') controlMode = s.controlMode;
      if (s.touchControlsEnabled !== undefined) touchControlsEnabled = s.touchControlsEnabled !== false;
      if (s.volume)       volume       = { ...DEFAULT_VOLUME,   ...s.volume };
      if (s.access)       access       = { ...DEFAULT_ACCESS,   ...s.access };
      if (s.gameplay)     gameplay     = { ...DEFAULT_GAMEPLAY, ...s.gameplay };
      if (s.hudElements)  hudElements  = normalizeHudElements(s.hudElements);
      if (s.access?.bloodMultiplier !== undefined && s.gameplay?.bloodMultiplier === undefined) {
        gameplay.bloodMultiplier = s.access.bloodMultiplier;
      }
      gameplay.bloodMultiplier = normalizeBloodMultiplier(gameplay.bloodMultiplier);
      delete access.bloodMultiplier;
      if (s.activeTheme)  activeTheme  = s.activeTheme;
      if (s.savedThemes && typeof s.savedThemes === 'object') savedThemes = s.savedThemes;
      if (s.customThemeVars && typeof s.customThemeVars === 'object') customThemeVars = { ...customThemeVars, ...s.customThemeVars };
    } catch {}
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      bindings, touchBindings, gamepadBindings, controlMode, touchControlsEnabled,
      volume, access, gameplay, hudElements, activeTheme, savedThemes, customThemeVars,
    }));
    window.dispatchEvent(new CustomEvent('neo:settings-changed'));
  }

  function applyAccess() {
    document.documentElement.classList.toggle('acc-reduce-flash',    access.reduceFlash);
    document.documentElement.classList.toggle('acc-reduce-motion',   access.reduceMotion);
    document.documentElement.classList.toggle('acc-high-contrast',   access.highContrast);
    const root = document.documentElement;
    root.style.setProperty('--shop-can-afford',  access.shopCanAfford  || DEFAULT_ACCESS.shopCanAfford);
    root.style.setProperty('--shop-cant-afford', access.shopCantAfford || DEFAULT_ACCESS.shopCantAfford);
    root.style.setProperty('--hud-scale', String(normalizeHudScale(access.hudScale)));
    root.style.setProperty('--font-scale', String(normalizeFontScale(access.fontScale)));
  }

  // Push each HUD element's per-widget scale + visibility to the DOM. A null
  // scale removes the override so the widget falls back to the global --hud-scale.
  function applyHudElements() {
    const root = document.documentElement;
    HUD_ELEMENTS.forEach(el => {
      const entry = hudElements[el.key] || {};
      // Canvas-drawn widgets (minimap) have no CSS vars — drawMinimap() reads
      // their scale/visibility from getHudElements() each frame instead.
      if (el.canvas) return;
      if (entry.scale === null || entry.scale === undefined) {
        root.style.removeProperty(el.cssVar);
      } else {
        root.style.setProperty(el.cssVar, String(normalizeHudScale(entry.scale)));
      }
      const x = normalizeHudOffset(entry.x);
      const y = normalizeHudOffset(entry.y);
      if (x) root.style.setProperty(el.xVar, `${x}px`); else root.style.removeProperty(el.xVar);
      if (y) root.style.setProperty(el.yVar, `${y}px`); else root.style.removeProperty(el.yVar);
      root.classList.toggle(el.hideClass, entry.visible === false);
    });
  }

  // ── Mobile detection ─────────────────────────────────────────────────────────
  function isTouchDevice() {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0);
  }

  function applyControlsSectionVisibility() {
    const mode = controlMode || (isTouchDevice() ? 'mobile' : 'desktop');
    const desktopSec = document.querySelector('.controls-desktop-section');
    const mobileSec  = document.querySelector('.controls-mobile-section');
    if (desktopSec) desktopSec.style.display = mode === 'desktop' ? '' : 'none';
    if (mobileSec)  mobileSec.style.display  = mode === 'mobile' ? '' : 'none';
    document.querySelectorAll('.control-profile-btn').forEach(btn => {
      const active = btn.dataset.controlProfile === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  load();
  if (!controlMode) controlMode = isTouchDevice() ? 'mobile' : 'desktop';
  if (touchControlsEnabled === null) touchControlsEnabled = controlMode === 'mobile';
  applyAccess();
  applyHudElements();
  applyControlsSectionVisibility();
  // Apply saved theme on boot (before any UI is queried)
  if (activeTheme && (PRESET_THEMES[activeTheme] || savedThemes[activeTheme])) {
    applyThemeVars((PRESET_THEMES[activeTheme] || savedThemes[activeTheme]).vars);
  } else if (activeTheme === '_custom') {
    applyThemeVars(customThemeVars);
  }

  // Equipment tool slot keys, in slot order, honoring custom bindings.
  // Falls back to the default letter for any slot left unbound.
  function getEquipmentSlotKeys() {
    return DEFAULT_EQUIPMENT_SLOT_KEYS.map((def, i) => {
      const v = bindings['tool' + (i + 1)];
      return String(v || def).toUpperCase();
    });
  }

  window.NeoSettings = {
    getBindings: () => bindings,
    getTouchBindings: () => touchBindings,
    getGamepadBindings: () => ({ ...gamepadBindings }),
    getControlMode: () => controlMode,
    isTouchControlsEnabled: () => touchControlsEnabled,
    getEquipmentSlotKeys,
    getActivateAllKey: () => String(bindings.activateAll || ' '),
    // Display label for a bound action (e.g. 'smash' -> 'R'), honoring rebinds.
    getBindingLabel: action => keyLabel(bindings[action]),
    getAccess: () => access,
    getGameplay: () => gameplay,
    shouldPauseInventory: () => gameplay.pauseInventory !== false,
    shouldPauseOnBlur: () => gameplay.pauseOnBlur !== false,
    getBloodMultiplier: () => normalizeBloodMultiplier(gameplay.bloodMultiplier),
    shouldBloodOnHit: () => gameplay.bloodOnHit !== false,
    isPerformanceMode: () => gameplay.performanceMode !== false,
    showObjectivePanel: () => gameplay.objectivePanel !== false,
    shouldAutoAdvanceCutscenes: () => gameplay.cutsceneAutoAdvance === true,
    setShowObjectivePanel: on => {
      gameplay.objectivePanel = !!on;
      const el = document.getElementById('gameplayObjectivePanel');
      if (el) el.checked = !!on;
      save();
      window.Neo?.refreshObjectiveTracker?.();
    },
    getVolume: () => volume,
    getHudElements: () => hudElements,
    getHudElementDefs: () => HUD_ELEMENTS.map(el => ({ key: el.key, label: el.label })),
  };

  const modal = document.getElementById('settingsModal');
  const SettingsUIManagerCtor = window.KozEngine?.UI?.uiManager?.UIManager || window.UIManager || null;
  const settingsUi = SettingsUIManagerCtor ? new SettingsUIManagerCtor({ autoRuntimeInit: false }) : null;
  let settingsOpen = false;

  if (settingsUi && typeof settingsUi.registerScreen === 'function') {
    const modalScreen = {
      show() {
        modal.classList.remove('hidden');
        modal.style.pointerEvents = 'auto';
        settingsOpen = true;
      },
      hide() {
        modal.classList.add('hidden');
        modal.style.pointerEvents = '';
        settingsOpen = false;
        save();
      },
    };
    settingsUi.registerScreen('settingsModal', {
      create: () => modalScreen,
      validStates: [],
    });
    modalScreen.hide();
  }

  function openSettings() {
    stopListening();
    refreshGamepadStatus();
    if (settingsUi && typeof settingsUi.showScreen === 'function') {
      settingsUi.showScreen('settingsModal');
    }
    else {
      settingsOpen = true;
      modal.classList.remove('hidden');
      modal.style.pointerEvents = 'auto';
    }
  }

  function closeSettings() {
    stopListening();
    if (settingsUi && typeof settingsUi.hideScreen === 'function') {
      settingsUi.hideScreen('settingsModal');
    }
    else {
      settingsOpen = false;
      modal.classList.add('hidden');
      modal.style.pointerEvents = '';
      save();
    }
  }

  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsClose').addEventListener('click', closeSettings);
  modal.addEventListener('click', e => { if (e.target === modal) closeSettings(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && settingsOpen) closeSettings(); });

  modal.querySelectorAll('.stab').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
      modal.querySelectorAll('.stab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById('stab-' + btn.dataset.tab).classList.remove('hidden');
      if (btn.dataset.tab === 'theme') refreshThemeUI();
      if (btn.dataset.tab === 'controls') applyControlsSectionVisibility();
    });
  });

  let listeningBtn = null;

  function keyLabel(v) {
    v = String(v ?? '');
    if (v === 'lmb') return 'LMB';
    if (v === 'rmb') return 'RMB';
    if (v === ' ') return 'SPACE';
    if (v === 'shift')   return 'SHIFT';
    if (v === 'control') return 'CTRL';
    if (v === 'arrowup')    return '↑';
    if (v === 'arrowdown')  return '↓';
    if (v === 'arrowleft')  return '←';
    if (v === 'arrowright') return '→';
    return v.toUpperCase();
  }

  function label(action) {
    return keyLabel(bindings[action]);
  }

  function refreshBindButtons() {
    modal.querySelectorAll('.bind-btn').forEach(b => { b.textContent = label(b.dataset.action); });
  }

  function refreshTouchBindControls() {
    modal.querySelectorAll('.mobile-bind-select').forEach(select => {
      const key = select.dataset.touchbind;
      if (!key) return;
      select.value = touchBindings[key] || DEFAULT_TOUCH_BINDINGS[key] || 'slash';
    });
  }

  function stopListening() {
    if (!listeningBtn) return;
    listeningBtn.classList.remove('listening');
    listeningBtn = null;
    refreshBindButtons();
  }

  refreshTouchBindControls();

  const touchControlsEnabledEl = document.getElementById('touchControlsEnabled');
  if (touchControlsEnabledEl) {
    touchControlsEnabledEl.checked = touchControlsEnabled;
    touchControlsEnabledEl.addEventListener('change', () => {
      touchControlsEnabled = touchControlsEnabledEl.checked;
      save();
    });
  }

  modal.querySelectorAll('.control-profile-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.controlProfile;
      if (next !== 'desktop' && next !== 'mobile') return;
      controlMode = next;
      applyControlsSectionVisibility();
      save();
    });
  });

  function refreshGamepadBindControls() {
    modal.querySelectorAll('.gamepad-bind-select').forEach(select => {
      if (!select.options.length) {
        GAMEPAD_ACTIONS.forEach(([value, text]) => select.add(new Option(text, value)));
      }
      select.value = gamepadBindings[select.dataset.gamepadButton] || 'none';
    });
  }

  refreshGamepadBindControls();

  function refreshGamepadStatus() {
    const status = document.getElementById('gamepadStatus');
    if (!status) return;
    const pads = window.NeoGamepad?.getConnectedPads?.() || [];
    if (!pads.length) {
      status.textContent = 'No gamepad detected. Press any button after connecting one.';
      return;
    }
    status.textContent = pads
      .map(pad => `P${Number(pad.index ?? 0) + 1}: ${pad.id || 'Gamepad'} (${pad.mapping === 'standard' ? 'standard mapping' : 'non-standard mapping — using compatibility layout'})`)
      .join('  ·  ');
  }

  refreshGamepadStatus();
  window.addEventListener('neo:gamepad-changed', refreshGamepadStatus);
  window.setInterval(refreshGamepadStatus, 1000);

  modal.querySelectorAll('.gamepad-bind-select').forEach(select => {
    select.addEventListener('change', () => {
      gamepadBindings[select.dataset.gamepadButton] = String(select.value || 'none');
      refreshGamepadMapperActions();
      save();
    });
  });

  document.getElementById('resetGamepadBindings')?.addEventListener('click', () => {
    gamepadBindings = { ...DEFAULT_GAMEPAD_BINDINGS };
    refreshGamepadBindControls();
    refreshGamepadMapperActions();
    save();
  });

  modal.querySelectorAll('.mobile-bind-select').forEach(select => {
    select.addEventListener('change', () => {
      const key = select.dataset.touchbind;
      if (!key) return;
      touchBindings[key] = String(select.value || DEFAULT_TOUCH_BINDINGS[key] || 'slash');
      save();
    });
  });

  document.getElementById('resetTouchBindings')?.addEventListener('click', () => {
    touchBindings = { ...DEFAULT_TOUCH_BINDINGS };
    refreshTouchBindControls();
    save();
  });

  const pauseInventoryEl = document.getElementById('gameplayPauseInventory');
  if (pauseInventoryEl) {
    pauseInventoryEl.checked = gameplay.pauseInventory !== false;
    pauseInventoryEl.addEventListener('change', () => {
      gameplay.pauseInventory = pauseInventoryEl.checked;
      save();
    });
  }

  const pauseOnBlurEl = document.getElementById('gameplayPauseOnBlur');
  if (pauseOnBlurEl) {
    pauseOnBlurEl.checked = gameplay.pauseOnBlur !== false;
    pauseOnBlurEl.addEventListener('change', () => {
      gameplay.pauseOnBlur = pauseOnBlurEl.checked;
      save();
    });
  }

  const bloodSlider = document.getElementById('gameplayBloodMultiplier');
  const bloodVal    = document.getElementById('gameplayBloodMultiplierVal');
  if (bloodSlider && bloodVal) {
    gameplay.bloodMultiplier = normalizeBloodMultiplier(gameplay.bloodMultiplier);
    bloodSlider.value = gameplay.bloodMultiplier;
    bloodVal.textContent = `${gameplay.bloodMultiplier}×`;
    bloodSlider.addEventListener('input', () => {
      gameplay.bloodMultiplier = normalizeBloodMultiplier(bloodSlider.value);
      bloodSlider.value = gameplay.bloodMultiplier;
      bloodVal.textContent = `${gameplay.bloodMultiplier}×`;
      save();
    });
  }

  const bloodOnHitEl = document.getElementById('gameplayBloodOnHit');
  if (bloodOnHitEl) {
    bloodOnHitEl.checked = gameplay.bloodOnHit !== false;
    bloodOnHitEl.addEventListener('change', () => {
      gameplay.bloodOnHit = bloodOnHitEl.checked;
      save();
    });
  }

  const performanceModeEl = document.getElementById('gameplayPerformanceMode');
  if (performanceModeEl) {
    performanceModeEl.checked = gameplay.performanceMode !== false;
    performanceModeEl.addEventListener('change', () => {
      gameplay.performanceMode = performanceModeEl.checked;
      save();
    });
  }

  const objectivePanelEl = document.getElementById('gameplayObjectivePanel');
  if (objectivePanelEl) {
    objectivePanelEl.checked = gameplay.objectivePanel !== false;
    objectivePanelEl.addEventListener('change', () => {
      gameplay.objectivePanel = objectivePanelEl.checked;
      save();
      // Apply immediately so the panel hides/shows without needing a room change.
      window.Neo?.refreshObjectiveTracker?.();
    });
  }

  const cutsceneAutoAdvanceEl = document.getElementById('gameplayCutsceneAutoAdvance');
  if (cutsceneAutoAdvanceEl) {
    cutsceneAutoAdvanceEl.checked = gameplay.cutsceneAutoAdvance === true;
    cutsceneAutoAdvanceEl.addEventListener('change', () => {
      gameplay.cutsceneAutoAdvance = cutsceneAutoAdvanceEl.checked;
      save();
    });
  }

  refreshBindButtons();

  modal.querySelectorAll('.bind-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (listeningBtn === btn) { stopListening(); return; }
      stopListening();
      listeningBtn = btn;
      btn.classList.add('listening');
      btn.textContent = '...';
    });
  });

  window.addEventListener('keydown', e => {
    if (!listeningBtn) return;
    if (e.key === 'Escape') { stopListening(); return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    bindings[listeningBtn.dataset.action] = e.key.toLowerCase();
    stopListening();
    save();
  }, true);

  document.getElementById('stab-controls').addEventListener('mousedown', e => {
    if (!listeningBtn) return;
    const action = listeningBtn.dataset.action;
    if (action !== 'slash' && action !== 'laser') return;
    e.preventDefault();
    bindings[action] = e.button === 2 ? 'rmb' : 'lmb';
    stopListening();
    save();
  }, true);

  document.getElementById('resetBindings').addEventListener('click', () => {
    bindings = { ...DEFAULT_BINDINGS };
    stopListening();
    save();
  });

  [['volMaster','volMasterVal','master'],['volSfx','volSfxVal','sfx'],['volMusic','volMusicVal','music']].forEach(([id, valId, key]) => {
    const el = document.getElementById(id), val = document.getElementById(valId);
    el.value = volume[key];
    val.textContent = volume[key];
    el.addEventListener('input', () => { volume[key] = Number(el.value); val.textContent = el.value; save(); });
  });

  [['accReduceFlash','reduceFlash'],['accReduceMotion','reduceMotion'],['accReduceParticles','reduceParticles'],['accHighContrast','highContrast'],['accScreenShake','screenShake'],['accRumble','rumble']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = access[key] !== false;
    el.addEventListener('change', () => {
      access[key] = el.checked;
      // Turning rumble off mid-game should silence any motor immediately.
      if (key === 'rumble' && !el.checked) window.Neo?.stopRumble?.();
      save();
      applyAccess();
    });
  });

  [['accShopCanAfford','shopCanAfford'],['accShopCantAfford','shopCantAfford']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = access[key] || DEFAULT_ACCESS[key];
    el.addEventListener('input', () => { access[key] = el.value; save(); applyAccess(); });
  });

  const hudScaleSlider = document.getElementById('accHudScale');
  const hudScaleVal    = document.getElementById('accHudScaleVal');
  if (hudScaleSlider && hudScaleVal) {
    const fmt = v => `${Math.round(normalizeHudScale(v) * 100)}%`;
    hudScaleSlider.value = normalizeHudScale(access.hudScale);
    hudScaleVal.textContent = fmt(access.hudScale);
    hudScaleSlider.addEventListener('input', () => {
      access.hudScale = normalizeHudScale(hudScaleSlider.value);
      hudScaleVal.textContent = fmt(access.hudScale);
      save();
      applyAccess();
      // Rows/preview on "Auto" inherit this value, so refresh their readouts.
      HUD_ELEMENTS.forEach(el => refreshHudElementRow(el.key));
      refreshHudPreviewBoxes();
    });
  }

  const fontScaleSlider = document.getElementById('accFontScale');
  const fontScaleVal    = document.getElementById('accFontScaleVal');
  if (fontScaleSlider && fontScaleVal) {
    const fmt = v => `${Math.round(normalizeFontScale(v) * 100)}%`;
    fontScaleSlider.value = normalizeFontScale(access.fontScale);
    fontScaleVal.textContent = fmt(access.fontScale);
    fontScaleSlider.addEventListener('input', () => {
      access.fontScale = normalizeFontScale(fontScaleSlider.value);
      fontScaleVal.textContent = fmt(access.fontScale);
      save();
      applyAccess();
    });
  }

  // ── Per-element HUD layout rows + schematic preview ─────────────────────────
  // Each row carries a scale slider (50–200%, plus an "Auto" floor that inherits
  // the global HUD scale) and a show/hide toggle. The preview overlay mirrors the
  // same state on labelled boxes so the player sees the result before closing.
  const hudRowEls = {};

  function effectiveHudScale(key) {
    const entry = hudElements[key] || {};
    return entry.scale === null || entry.scale === undefined
      ? normalizeHudScale(access.hudScale)
      : normalizeHudScale(entry.scale);
  }

  function effectiveHudPreviewScale(key, viewportScale = 1) {
    return effectiveHudScale(key) * (HUD_PREVIEW_SCALE_FACTORS[key] || 1) * viewportScale;
  }

  function formatHudElementScale(entry) {
    if (!entry || entry.scale === null || entry.scale === undefined) return 'Auto';
    return `${Math.round(normalizeHudScale(entry.scale) * 100)}%`;
  }

  function getHudPreviewRatios(frame = document.getElementById('hudPreviewFrame')) {
    const rect = frame?.getBoundingClientRect?.();
    const width = rect?.width || frame?.clientWidth || 0;
    const height = rect?.height || frame?.clientHeight || 0;
    return {
      x: width ? width / Math.max(1, window.innerWidth) : 0.5,
      y: height ? height / Math.max(1, window.innerHeight) : 0.5,
    };
  }

  function syncHudPreviewFrameSize() {
    const frame = document.getElementById('hudPreviewFrame');
    if (!frame) return;
    const gap = window.innerWidth <= 720 ? 96 : 140;
    const viewportW = Math.max(1, window.innerWidth);
    const viewportH = Math.max(1, window.innerHeight);
    const availableW = Math.max(260, viewportW * 0.92);
    const availableH = Math.max(180, viewportH - gap);
    const previewScale = Math.min(1, availableW / viewportW, availableH / viewportH);
    const width = viewportW * previewScale;
    const height = viewportH * previewScale;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
  }

  function setHudPreviewAnchor(box, key, ratio) {
    box.dataset.previewSizedFromBounds = 'false';
    box.style.top = '';
    box.style.right = '';
    box.style.bottom = '';
    box.style.left = '';
    if (key !== 'minimap') {
      box.style.width = '';
      box.style.height = '';
    }
    if (key === 'coins') {
      box.style.top = `${16 * ratio.y}px`;
      box.style.left = `${16 * ratio.x}px`;
    } else if (key === 'center') {
      box.style.top = '0px';
      box.style.left = '50%';
    } else if (key === 'objectives') {
      // Mirror the live HUD: objectives sit to the LEFT of the top-right minimap
      // (see .objective-tracker right: 206px in style.css).
      box.style.top = `${154 * ratio.y}px`;
      box.style.right = `${206 * ratio.x}px`;
    } else if (key === 'stats') {
      box.style.bottom = `${10 * ratio.y}px`;
      box.style.left = `${10 * ratio.x}px`;
    } else if (key === 'actions') {
      box.style.bottom = `${18 * ratio.y}px`;
      box.style.left = '50%';
    } else if (key === 'equipment') {
      box.style.top = '50%';
      box.style.right = '0px';
    } else if (key === 'minimap') {
      const bounds = window.Neo?.minimapLayoutState?.viewportBounds || null;
      const layoutOffsetX = Number(window.Neo?.minimapLayoutState?.offsetX);
      const layoutOffsetY = Number(window.Neo?.minimapLayoutState?.offsetY);
      const entry = hudElements.minimap || {};
      const offsetX = Number.isFinite(layoutOffsetX) ? normalizeHudOffset(layoutOffsetX) : normalizeHudOffset(entry.x);
      const offsetY = Number.isFinite(layoutOffsetY) ? normalizeHudOffset(layoutOffsetY) : normalizeHudOffset(entry.y);
      if (bounds
        && Number.isFinite(bounds.top)
        && Number.isFinite(bounds.right)
        && Number.isFinite(bounds.bottom)
        && Number.isFinite(bounds.left)) {
        box.style.top = `${(bounds.top - offsetY) * ratio.y}px`;
        box.style.right = `${(window.innerWidth - (bounds.right - offsetX)) * ratio.x}px`;
        box.style.width = `${Math.max(24, (bounds.right - bounds.left) * ratio.x)}px`;
        box.style.height = `${Math.max(24, (bounds.bottom - bounds.top) * ratio.y)}px`;
        box.dataset.previewSizedFromBounds = 'true';
      } else {
        box.style.top = `${(window.innerWidth <= 920 ? 96 : 72) * ratio.y}px`;
        box.style.right = `${(window.innerWidth <= 920 ? 8 : 16) * ratio.x}px`;
        box.style.width = '';
        box.style.height = '';
      }
    }
  }

  function refreshHudPreviewBoxes() {
    // The preview frame stands in for the whole screen. Convert real HUD pixel
    // nudges into frame-local pixels per axis so dragging matches the sliders.
    syncHudPreviewFrameSize();
    const frame = document.getElementById('hudPreviewFrame');
    const ratio = getHudPreviewRatios(frame);
    const viewportScale = Math.min(ratio.x || 1, ratio.y || 1);
    HUD_ELEMENTS.forEach(el => {
      const box = document.querySelector(`.hud-preview-box[data-preview="${el.key}"]`);
      if (!box) return;
      setHudPreviewAnchor(box, el.key, ratio);
      const entry = hudElements[el.key] || {};
      const hidden = entry.visible === false;
      box.classList.toggle('hud-preview-box--hidden', hidden);
      // Compose the per-element scale + offset onto whatever centering transform
      // the anchor already applies, so the box moves/grows like the real widget.
      // Stats and actions include their fixed live HUD multipliers here too.
      const base = box.classList.contains('hud-preview-box--center') || box.classList.contains('hud-preview-box--actions')
        ? 'translateX(-50%) '
        : box.classList.contains('hud-preview-box--equipment')
          ? 'translateY(-50%) '
          : '';
      const ox = normalizeHudOffset(entry.x) * ratio.x;
      const oy = normalizeHudOffset(entry.y) * ratio.y;
      const nudge = (ox || oy) ? `translate(${ox}px, ${oy}px) ` : '';
      const scale = box.dataset.previewSizedFromBounds === 'true'
        ? 1
        : effectiveHudPreviewScale(el.key, viewportScale);
      box.style.transform = `${base}${nudge}scale(${scale})`;
    });
  }

  function formatHudOffset(value) {
    const n = normalizeHudOffset(value);
    return n === 0 ? '0' : `${n > 0 ? '+' : ''}${n}`;
  }

  function refreshHudElementRow(key) {
    const refs = hudRowEls[key];
    if (!refs) return;
    const entry = hudElements[key] || {};
    const hidden = entry.visible === false;
    refs.row.classList.toggle('hud-element-row--hidden', hidden);
    refs.slider.value = entry.scale === null || entry.scale === undefined
      ? HUD_SCALE_MIN
      : normalizeHudScale(entry.scale);
    refs.val.textContent = formatHudElementScale(entry);
    if (refs.xSlider) {
      refs.xSlider.value = normalizeHudOffset(entry.x);
      refs.xVal.textContent = formatHudOffset(entry.x);
      refs.ySlider.value = normalizeHudOffset(entry.y);
      refs.yVal.textContent = formatHudOffset(entry.y);
    }
    refs.vis.setAttribute('aria-pressed', hidden ? 'false' : 'true');
    refs.vis.textContent = hidden ? 'Hidden' : 'Shown';
  }

  function buildHudElementRows() {
    const host = document.getElementById('hudElementRows');
    if (!host || host.childElementCount) return;
    HUD_ELEMENTS.forEach(el => {
      const row = document.createElement('div');
      row.className = 'hud-element-row';
      const name = document.createElement('span');
      name.className = 'hud-element-row__name';
      name.textContent = el.label;
      const scaleCap = document.createElement('span');
      scaleCap.className = 'hud-element-row__cap';
      scaleCap.textContent = 'Scale';
      // Slider min is one step below HUD_SCALE_MIN so the leftmost notch means
      // "Auto" (inherit global scale) rather than a fixed 50%.
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'hud-element-row__slider';
      slider.min = String(HUD_SCALE_MIN - HUD_SCALE_STEP);
      slider.max = String(HUD_SCALE_MAX);
      slider.step = String(HUD_SCALE_STEP);
      const val = document.createElement('span');
      val.className = 'hud-element-row__val';
      const vis = document.createElement('button');
      vis.type = 'button';
      vis.className = 'hud-element-row__vis';

      // Second line: X/Y position sliders (screen pixels, applied before scale).
      const offsetRow = document.createElement('div');
      offsetRow.className = 'hud-element-row__offsets';
      const makeOffset = (axisLabel) => {
        const wrap = document.createElement('label');
        wrap.className = 'hud-element-offset';
        const cap = document.createElement('span');
        cap.className = 'hud-element-offset__axis';
        cap.textContent = axisLabel;
        const sl = document.createElement('input');
        sl.type = 'range';
        sl.className = 'hud-element-offset__slider';
        sl.min = String(HUD_OFFSET_MIN);
        sl.max = String(HUD_OFFSET_MAX);
        sl.step = String(HUD_OFFSET_STEP);
        const rv = document.createElement('span');
        rv.className = 'hud-element-offset__val';
        wrap.append(cap, sl, rv);
        offsetRow.appendChild(wrap);
        return { sl, rv };
      };
      const xOff = makeOffset('X');
      const yOff = makeOffset('Y');

      const rowChildren = [name, scaleCap, slider, val, vis];
      rowChildren.push(offsetRow);
      row.append(...rowChildren);
      host.appendChild(row);
      hudRowEls[el.key] = {
        row, slider, val, vis,
        xSlider: xOff?.sl || null, xVal: xOff?.rv || null,
        ySlider: yOff?.sl || null, yVal: yOff?.rv || null,
      };

      slider.addEventListener('input', () => {
        const raw = Number(slider.value);
        hudElements[el.key].scale = raw < HUD_SCALE_MIN ? null : normalizeHudScale(raw);
        applyHudElements();
        refreshHudElementRow(el.key);
        refreshHudPreviewBoxes();
        save();
      });
      const onOffset = (axis, sliderEl) => () => {
        hudElements[el.key][axis] = normalizeHudOffset(sliderEl.value);
        applyHudElements();
        refreshHudElementRow(el.key);
        refreshHudPreviewBoxes();
        save();
      };
      xOff?.sl.addEventListener('input', onOffset('x', xOff.sl));
      yOff?.sl.addEventListener('input', onOffset('y', yOff.sl));
      vis.addEventListener('click', () => {
        hudElements[el.key].visible = hudElements[el.key].visible === false;
        applyHudElements();
        refreshHudElementRow(el.key);
        refreshHudPreviewBoxes();
        save();
      });
      refreshHudElementRow(el.key);
    });
  }
  buildHudElementRows();

  // Fill the preview mock widgets from save data so "Preview layout" shows the
  // player's real numbers (current run when one exists, otherwise meta records).
  // Field markers are data-preview-field="..." inside each .hud-preview-box--mock.
  function populateHudPreviewContent() {
    const frame = document.getElementById('hudPreviewFrame');
    if (!frame) return;
    const meta = Neo.metaProgress || {};
    const run = Neo.activeRun || null;
    const runPlayer = run?.player || null;
    const setField = (key, value) => {
      const el = frame.querySelector(`[data-preview-field="${key}"]`);
      if (el) el.textContent = String(value);
    };

    // Coins & Loop — current run coins if mid-run, else lifetime/meta coins.
    setField('coins', Number(runPlayer?.coins ?? meta.coins ?? 0));
    setField('loop', Number(meta.loopCrystals || 0));

    // Timer / Floor row.
    const floor = Number(run?.floor ?? meta.bestFloor ?? 1);
    setField('floor', floor);
    setField('timer', runPlayer ? (Neo.ui?.timerDisplay?.textContent || '0:00') : '0:00');
    const diffKey = run?.difficulty || meta.selectedDifficulty || Neo.selectedDifficulty;
    setField('difficulty', String(Neo.getDifficultyDef?.(diffKey)?.name || diffKey || 'EASY').toUpperCase());
    const rarity = Neo.getItemRarityCounts?.(runPlayer || { items: {} }) || { white: 0, purple: 0, red: 0 };
    setField('rarityWhite', rarity.white);
    setField('rarityPurple', rarity.purple);
    setField('rarityRed', rarity.red);

    // Objective panel room label.
    const roomLabel = run && Neo.currentRoom ? Neo.getRoomLabel?.(Neo.currentRoom.type) : 'ROOM';
    setField('roomLabel', String(roomLabel || 'ROOM').toUpperCase());

    // Player stats card.
    const charKey = runPlayer?.character || meta.selectedCharacter || Neo.chosenCharacter;
    const charDef = Neo.CHARACTER_DEFS?.[charKey] || Neo.CHARACTER_DEFS?.thorn_knight || {};
    setField('character', String(charDef.name || charKey || 'CHARACTER').toUpperCase());
    if (runPlayer) {
      setField('hp', Neo.formatHpText?.(runPlayer.hp, runPlayer.maxHp) || `${runPlayer.hp}/${runPlayer.maxHp}`);
      setField('level', `Lv.${runPlayer.level || 1}`);
      setField('xp', `${runPlayer.xp || 0}/${runPlayer.xpToNext || 0}`);
    }

    // Pixel icons for the coin/loop canvases (same art as the live HUD).
    if (typeof Neo.drawPixelIcon === 'function') {
      const coinPx = [[2,1],[3,1],[4,1],[1,2],[2,2],[3,2],[4,2],[5,2],[1,3],[2,3],[3,3],[4,3],[5,3],[1,4],[2,4],[3,4],[4,4],[5,4],[2,5],[3,5],[4,5]];
      const loopPx = [[2,1],[3,1],[4,1],[1,2],[5,2],[1,3],[5,3],[1,4],[5,4],[2,5],[3,5],[4,5],[2,2],[4,2],[2,4],[4,4],[3,3]];
      const coinIcon = frame.querySelector('[data-preview-coin-icon]');
      const loopIcon = frame.querySelector('[data-preview-loop-icon]');
      if (coinIcon) Neo.drawPixelIcon(coinIcon, '#ffd15a', coinPx);
      if (loopIcon) Neo.drawPixelIcon(loopIcon, '#83f3ff', loopPx);
    }

    // Tool slots — show the live run's equipped tools when present, else placeholders.
    const equipHost = frame.querySelector('[data-preview-equipment]');
    if (equipHost) {
      const keys = ['F', 'G', 'H', 'J'];
      const slots = Array.isArray(runPlayer?.equipmentSlots) ? runPlayer.equipmentSlots : [];
      equipHost.querySelectorAll('.equip-slot').forEach((slot, idx) => {
        const itemKey = slots[idx] || '';
        const def = itemKey ? (Neo.itemRegistry?.get?.(itemKey) || Neo.ITEM_DEFS?.[itemKey]) : null;
        slot.classList.toggle('is-empty', !def);
        const keyEl = slot.querySelector('.equip-slot__key');
        if (keyEl) keyEl.textContent = keys[idx] || '';
      });
    }
  }

  document.getElementById('hudLayoutResetBtn')?.addEventListener('click', () => {
    hudElements = defaultHudElements();
    applyHudElements();
    HUD_ELEMENTS.forEach(el => refreshHudElementRow(el.key));
    refreshHudPreviewBoxes();
    save();
  });

  document.getElementById('hudLayoutPreviewBtn')?.addEventListener('click', () => {
    const overlay = document.getElementById('hudPreviewOverlay');
    if (!overlay) return;
    populateHudPreviewContent();
    // Reveal first so the frame has real layout — refreshHudPreviewBoxes() measures
    // getBoundingClientRect() to derive the preview scale/offset ratios, which read
    // as zero while the overlay is still display:none. Re-render after a frame so
    // the boxes sync to the correct scale on open instead of waiting for a resize.
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    refreshHudPreviewBoxes();
    requestAnimationFrame(refreshHudPreviewBoxes);
  });
  const hudPreviewClose = () => {
    const overlay = document.getElementById('hudPreviewOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  };
  document.getElementById('hudPreviewClose')?.addEventListener('click', hudPreviewClose);
  document.getElementById('hudPreviewOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'hudPreviewOverlay') hudPreviewClose();
  });
  window.addEventListener('resize', refreshHudPreviewBoxes);

  // ── Controller mapper / detector overlay ──────────────────────────────────
  // Live diagram that confirms the pad is detected and lights up each physical
  // button as it's pressed, with its current bound action shown beneath. Reads
  // straight from window.NeoGamepad (slot 0 — the first connected pad) while the
  // overlay is open. The overlay counts as a blocking panel, so gamepadControls
  // is already in UI-navigation mode and won't fire game actions while we test.
  const gamepadActionLabel = value => {
    const found = GAMEPAD_ACTIONS.find(([v]) => v === String(value));
    return found ? found[1] : '—';
  };

  function refreshGamepadMapperActions() {
    document.querySelectorAll('[data-gp-act]').forEach(el => {
      const action = gamepadBindings[el.dataset.gpAct] || DEFAULT_GAMEPAD_BINDINGS[el.dataset.gpAct] || 'none';
      el.textContent = action === 'none' ? '' : gamepadActionLabel(action);
    });
  }

  let gamepadMapperRaf = null;
  function pollGamepadMapper() {
    const overlay = document.getElementById('gamepadMapperOverlay');
    if (!overlay || overlay.classList.contains('hidden')) { gamepadMapperRaf = null; return; }

    const pads = window.NeoGamepad || [];
    const slot = Array.prototype.find.call(pads, s => s?.connected) || null;
    const status = document.getElementById('gamepadMapperStatus');
    if (status) {
      if (slot) {
        const standard = slot.mapping === 'standard';
        status.textContent = `Detected: ${slot.id || 'Gamepad'} (${standard ? 'standard mapping' : 'non-standard — using compatibility layout'})`;
        status.classList.add('is-connected');
      } else {
        status.textContent = 'No controller detected. Connect one and press any button.';
        status.classList.remove('is-connected');
      }
    }

    // Light pressed buttons (buttonStates is indexed by standard slot).
    overlay.querySelectorAll('[data-gp-button]').forEach(el => {
      const pressed = !!slot?.buttonStates?.[Number(el.dataset.gpButton)];
      el.classList.toggle('lit', pressed);
    });

    // Nudge the stick hats so the sticks visibly respond.
    const setHat = (sel, x, y) => {
      const hat = overlay.querySelector(`${sel} .gp-stick__hat`);
      if (hat) hat.style.transform = `translate(${(x || 0) * 18}px, ${(y || 0) * 18}px)`;
    };
    setHat('.gp-stick--l', slot?.moveX, slot?.moveY);
    setHat('.gp-stick--r', slot?.aimX, slot?.aimY);

    gamepadMapperRaf = requestAnimationFrame(pollGamepadMapper);
  }

  document.getElementById('gamepadMapperBtn')?.addEventListener('click', () => {
    const overlay = document.getElementById('gamepadMapperOverlay');
    if (!overlay) return;
    refreshGamepadMapperActions();
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    if (!gamepadMapperRaf) gamepadMapperRaf = requestAnimationFrame(pollGamepadMapper);
  });
  const gamepadMapperClose = () => {
    const overlay = document.getElementById('gamepadMapperOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    if (gamepadMapperRaf) { cancelAnimationFrame(gamepadMapperRaf); gamepadMapperRaf = null; }
  };
  document.getElementById('gamepadMapperClose')?.addEventListener('click', gamepadMapperClose);
  document.getElementById('gamepadMapperOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'gamepadMapperOverlay') gamepadMapperClose();
  });

  function setHudElementOffset(key, x, y) {
    if (!hudElements[key]) return;
    hudElements[key].x = normalizeHudOffset(x);
    hudElements[key].y = normalizeHudOffset(y);
    applyHudElements();
    refreshHudElementRow(key);
    refreshHudPreviewBoxes();
    save();
  }

  function setHudElementScale(key, scale) {
    if (!hudElements[key]) return;
    hudElements[key].scale = normalizeHudScale(scale);
    applyHudElements();
    refreshHudElementRow(key);
    refreshHudPreviewBoxes();
    save();
  }

  function getHudPreviewResizeDirection(key) {
    if (key === 'objectives' || key === 'equipment' || key === 'minimap') return { x: -1, y: 1 };
    if (key === 'stats' || key === 'actions') return { x: 1, y: -1 };
    return { x: 1, y: 1 };
  }

  // Drag a widget directly in the preview to set the same X/Y offsets exposed by
  // the sliders. Drag the corner grip to set scale. Visibility is toggled only via
  // the dedicated eye button (added below), never by clicking the box body.
  let hudPreviewDrag = null;
  let hudPreviewResize = null;
  document.querySelectorAll('.hud-preview-box').forEach(box => {
    if (!box.querySelector('.hud-preview-resize')) {
      const resize = document.createElement('span');
      resize.className = 'hud-preview-resize';
      resize.setAttribute('aria-hidden', 'true');
      box.appendChild(resize);
    }

    // Dedicated visibility toggle: an eye button (with a red strike when hidden).
    // Only this button toggles the element on/off, so dragging or tapping the box
    // body can't accidentally turn a HUD widget off.
    if (!box.querySelector('.hud-preview-eye')) {
      const eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'hud-preview-eye';
      eye.innerHTML = '<span class="hud-preview-eye__icon" aria-hidden="true"></span>';
      box.appendChild(eye);
      const toggleVisibility = e => {
        e.preventDefault();
        e.stopPropagation();
        const key = box.dataset.preview;
        if (!hudElements[key]) return;
        hudElements[key].visible = hudElements[key].visible === false;
        applyHudElements();
        refreshHudElementRow(key);
        refreshHudPreviewBoxes();
        save();
      };
      // Stop pointer events from starting a drag/resize on the box underneath.
      eye.addEventListener('pointerdown', e => e.stopPropagation());
      eye.addEventListener('click', toggleVisibility);
    }

    const resizeHandle = box.querySelector('.hud-preview-resize');
    resizeHandle?.addEventListener('pointerdown', e => {
      const key = box.dataset.preview;
      if (!hudElements[key]) return;
      if (e.button !== undefined && e.button !== 0) return;
      const rect = box.getBoundingClientRect();
      box.setPointerCapture?.(e.pointerId);
      box.classList.add('hud-preview-box--resizing');
      hudPreviewResize = {
        key,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startScale: effectiveHudScale(key),
        direction: getHudPreviewResizeDirection(key),
        startDiagonal: Math.max(32, Math.hypot(rect.width, rect.height)),
        moved: false,
      };
      e.preventDefault();
      e.stopPropagation();
    });

    box.addEventListener('pointerdown', e => {
      if (e.target?.classList?.contains('hud-preview-resize')) return;
      const key = box.dataset.preview;
      const def = HUD_ELEMENTS.find(el => el.key === key);
      if (!hudElements[key] || !def) return;
      if (e.button !== undefined && e.button !== 0) return;
      const entry = hudElements[key] || {};
      box.setPointerCapture?.(e.pointerId);
      box.classList.add('hud-preview-box--dragging');
      hudPreviewDrag = {
        key,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: normalizeHudOffset(entry.x),
        startY: normalizeHudOffset(entry.y),
        moved: false,
      };
      e.preventDefault();
    });

    box.addEventListener('pointermove', e => {
      if (hudPreviewResize && hudPreviewResize.pointerId === e.pointerId && hudPreviewResize.key === box.dataset.preview) {
        const dx = e.clientX - hudPreviewResize.startClientX;
        const dy = e.clientY - hudPreviewResize.startClientY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hudPreviewResize.moved = true;
        const dir = hudPreviewResize.direction || { x: 1, y: 1 };
        const drag = (dx * dir.x + dy * dir.y) / Math.SQRT2;
        const nextScale = hudPreviewResize.startScale + (drag / hudPreviewResize.startDiagonal) * hudPreviewResize.startScale;
        setHudElementScale(hudPreviewResize.key, nextScale);
        e.preventDefault();
        return;
      }
      if (!hudPreviewDrag || hudPreviewDrag.pointerId !== e.pointerId || hudPreviewDrag.key !== box.dataset.preview) return;
      const frame = document.getElementById('hudPreviewFrame');
      const ratio = getHudPreviewRatios(frame);
      const dx = ratio.x ? (e.clientX - hudPreviewDrag.startClientX) / ratio.x : 0;
      const dy = ratio.y ? (e.clientY - hudPreviewDrag.startClientY) / ratio.y : 0;
      if (Math.abs(e.clientX - hudPreviewDrag.startClientX) > 3 || Math.abs(e.clientY - hudPreviewDrag.startClientY) > 3) {
        hudPreviewDrag.moved = true;
      }
      setHudElementOffset(hudPreviewDrag.key, hudPreviewDrag.startX + dx, hudPreviewDrag.startY + dy);
      e.preventDefault();
    });

    const endDrag = e => {
      if (hudPreviewResize && hudPreviewResize.pointerId === e.pointerId && hudPreviewResize.key === box.dataset.preview) {
        box.releasePointerCapture?.(e.pointerId);
        box.classList.remove('hud-preview-box--resizing');
        hudPreviewResize = null;
        e.preventDefault();
        return;
      }
      if (!hudPreviewDrag || hudPreviewDrag.pointerId !== e.pointerId || hudPreviewDrag.key !== box.dataset.preview) return;
      box.releasePointerCapture?.(e.pointerId);
      box.classList.remove('hud-preview-box--dragging');
      hudPreviewDrag = null;
      e.preventDefault();
    };
    box.addEventListener('pointerup', endDrag);
    box.addEventListener('pointercancel', endDrag);

  });

  const replayTutorialEl = document.getElementById('accReplayTutorial');
  if (replayTutorialEl) {
    replayTutorialEl.checked = localStorage.getItem(REPLAY_TUTORIAL_KEY) === '1';
    replayTutorialEl.addEventListener('change', () => {
      if (replayTutorialEl.checked) localStorage.setItem(REPLAY_TUTORIAL_KEY, '1');
      else localStorage.removeItem(REPLAY_TUTORIAL_KEY);
    });
  }

  // ── Theme save / delete ───────────────────────────────────────────────────────
  document.getElementById('themeSaveBtn').addEventListener('click', () => {
    const nameInput = document.getElementById('themeNameInput');
    const name = (nameInput.value || '').trim();
    if (!name) { nameInput.focus(); return; }
    const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    savedThemes[slug] = { name, vars: { ...customThemeVars } };
    activeTheme = slug;
    save();
    refreshThemeUI();
  });

  document.getElementById('themeDeleteBtn').addEventListener('click', () => {
    if (!savedThemes[activeTheme]) return;
    delete savedThemes[activeTheme];
    activeTheme = 'princess';
    applyTheme('princess');
    save();
    refreshThemeUI();
  });

  const usernameInput = document.getElementById('usernameInput');
  if (usernameInput) {
    const syncUsername = () => {
      if (window.Neo?.metaProgress) {
        usernameInput.value = window.Neo.metaProgress.username || '';
      }
    };
    syncUsername();
    window.addEventListener('neo:meta-loaded', syncUsername);
    usernameInput.addEventListener('input', () => {
      const val = usernameInput.value.trim().slice(0, 24);
      if (window.Neo?.metaProgress) {
        window.Neo.metaProgress.username = val;
        window.Neo.persistMetaSoon?.();
      }
    });
  }

  const birthdayInput = document.getElementById('birthdayInput');
  if (birthdayInput) {
    const syncBirthday = () => {
      if (window.Neo?.metaProgress)
        birthdayInput.value = window.Neo.metaProgress.birthday || '';
    };
    syncBirthday();
    window.addEventListener('neo:meta-loaded', syncBirthday);
    birthdayInput.addEventListener('change', () => {
      if (window.Neo?.metaProgress) {
        window.Neo.metaProgress.birthday = birthdayInput.value || '';
        window.Neo.persistMetaSoon?.();
        window._checkSpecialDaysNow?.();
      }
    });
  }

  // ── Special days + birthday modal ─────────────────────────────
  (function initSpecialDays() {
    const bdModal  = document.getElementById('birthdayModal');
    const bdClose  = document.getElementById('birthdayClose');
    const bdDismiss = document.getElementById('birthdayDismiss');
    const bdMonsters = document.getElementById('birthdayMonsters');
    const banner   = document.getElementById('specialDayBanner');
    const bannerIcon = document.getElementById('specialDayIcon');
    const bannerText = document.getElementById('specialDayText');

    // Hardcoded special days (mirrors server NOTICES for offline use)
    const SPECIAL_DAYS = [
      { id: 'kiah-birthday', type: 'birthday', mmdd: '04-06', title: "Happy Birthday, Kiah!", icon: '🎂', accent: '#f47ebd' },
      { id: 'christmas',     type: 'holiday',  mmdd: '12-25', title: "Merry Christmas!",      icon: '🎄', accent: '#4caf50' },
      { id: 'festival-of-lights', type: 'holiday', mmdd: '12-01', mmddEnd: '12-08', title: "Festival of Lights", icon: '🕎', accent: '#4fc3f7' },
    ];

    function todayMmdd() {
      const d = new Date();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${mm}-${dd}`;
    }

    function mmddToNum(s) { const [m, d] = s.split('-'); return Number(m) * 100 + Number(d); }

    function matchesDay(entry) {
      const today = mmddToNum(todayMmdd());
      const start = mmddToNum(entry.mmdd);
      const end   = entry.mmddEnd ? mmddToNum(entry.mmddEnd) : start;
      return today >= start && today <= end;
    }

    function isUserBirthday(storedValue) {
      if (!storedValue) return false;
      const [, mm, dd] = storedValue.split('-');
      return `${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}` === todayMmdd();
    }

    // Birthday modal monsters
    const MONSTER_KEYS = ['hunter','cult_follower','cult_mage','sniper','knave','charger','laser','golem','bulk_golem','queen_cult','artificer_knave','antony_blemmye','handsome_devil','god'];
    const MONSTER_NAMES = { hunter:'Hunter', cult_follower:'Cultist', cult_mage:'Mage', sniper:'Sniper', knave:'Knave', charger:'Charger', laser:'Laser', golem:'Golem', bulk_golem:'Bulk Golem', queen_cult:'Queen', artificer_knave:'Artificer', antony_blemmye:'Antony', handsome_devil:'Devil', god:'GOD' };

    function populateMonsters() {
      if (!bdMonsters || bdMonsters.childElementCount > 0) return;
      MONSTER_KEYS.forEach(key => {
        const wrap = document.createElement('div');
        wrap.className = 'bd-monster';
        const cv = document.createElement('canvas');
        cv.width = 48; cv.height = 48;
        cv.className = 'bd-monster__canvas';
        const label = document.createElement('span');
        label.className = 'bd-monster__name';
        label.textContent = MONSTER_NAMES[key] || key;
        wrap.appendChild(cv);
        wrap.appendChild(label);
        bdMonsters.appendChild(wrap);
        if (window.Neo?.drawSpriteToCanvas) window.Neo.drawSpriteToCanvas(cv, key, 48);
      });
    }

    function openBirthdayModal() {
      if (!bdModal) return;
      populateMonsters();
      bdModal.classList.remove('hidden');
      bdModal.setAttribute('aria-hidden', 'false');
    }

    function closeBirthdayModal() {
      if (!bdModal) return;
      bdModal.classList.add('hidden');
      bdModal.setAttribute('aria-hidden', 'true');
    }

    bdClose?.addEventListener('click', closeBirthdayModal);
    bdDismiss?.addEventListener('click', closeBirthdayModal);
    bdModal?.addEventListener('click', e => { if (e.target === bdModal) closeBirthdayModal(); });

    function showBanner(entry, label) {
      if (!banner) return;
      banner.style.setProperty('--special-day-accent', entry.accent || '#a8c8ff');
      if (bannerIcon) bannerIcon.textContent = entry.icon || '★';
      if (bannerText) bannerText.textContent = label;
      banner.classList.remove('hidden');
    }

    let checked = false;
    function checkAndShow(force = false) {
      if (checked && !force) return;
      checked = true;
      const meta = window.Neo?.metaProgress;

      // User's own birthday
      if (isUserBirthday(meta?.birthday)) {
        const name = meta?.username?.trim();
        openBirthdayModal();
        showBanner(
          { icon: '🎂', accent: '#ffd700' },
          name ? `HAPPY BIRTHDAY, ${name.toUpperCase()}!` : 'HAPPY BIRTHDAY, DUNGEON GOD!'
        );
        return;
      }

      // Global special days
      for (const entry of SPECIAL_DAYS) {
        if (matchesDay(entry)) {
          showBanner(entry, entry.title.toUpperCase());
          return;
        }
      }
    }

    window.addEventListener('neo:meta-loaded', checkAndShow);
    if (window.Neo?.metaProgress) checkAndShow();
    window._checkSpecialDaysNow = () => checkAndShow(true);
  })();

  // ── Blog / notices panel ───────────────────────────────────────
  (function initBlogPanel() {
    const SERVER = window.NEO_SERVER_URL || 'https://neonyke.davidkozdra.workers.dev/api';
    const blogList = document.getElementById('rhBlogList');
    let loaded = false;

    function renderNotices(notices) {
      if (!blogList) return;
      if (!notices || notices.length === 0) {
        blogList.innerHTML = '<p class="rh-blog-empty">No posts yet.</p>';
        return;
      }
      // Separate special days from updates/events
      const today = (() => { const d = new Date(); return (d.getMonth()+1)*100 + d.getDate(); })();
      const active = notices.filter(n => {
        if (!n.mmdd) return true; // blog posts always show
        const s = n.mmdd.split('-'); const start = Number(s[0])*100+Number(s[1]);
        if (n.mmddEnd) { const e = n.mmddEnd.split('-'); const end = Number(e[0])*100+Number(e[1]); return today >= start && today <= end; }
        return today === start;
      });
      const rest = notices.filter(n => !n.mmdd);
      const toShow = [...active, ...rest.filter(n => !active.includes(n))];

      blogList.innerHTML = toShow.map(n => `
        <div class="rh-blog-card" style="--blog-accent:${n.accent || '#a8c8ff'}">
          <div class="rh-blog-card__head">
            <span class="rh-blog-card__icon">${n.icon || '📌'}</span>
            <span class="rh-blog-card__title">${n.title}</span>
            ${n.date ? `<span class="rh-blog-card__date">${n.date}</span>` : ''}
          </div>
          <p class="rh-blog-card__body">${n.body || ''}</p>
        </div>
      `).join('');
    }

    function loadBlog() {
      if (loaded) return;
      loaded = true;
      if (!blogList) return;
      blogList.innerHTML = '<p class="rh-blog-empty">Loading…</p>';
      fetch(`${SERVER}/notices`, { signal: AbortSignal.timeout(4000) })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(data => renderNotices(data.notices || []))
        .catch(() => {
          blogList.innerHTML = '<p class="rh-blog-empty">Could not load updates (server offline?).</p>';
        });
    }

    // Load when blog tab is clicked
    window.addEventListener('neo:blog-tab-opened', loadBlog);
    window._loadBlogPanel = loadBlog;
  })();

  document.getElementById('dataExport').addEventListener('click', async () => {
    if (!window.NeoDataAdapter) { alert('Data system not ready.'); return; }
    const data = await window.NeoDataAdapter.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `neonyke-save-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('dataImport').addEventListener('click', () => {
    document.getElementById('dataImportFile').click();
  });

  document.getElementById('dataImportFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!window.NeoDataAdapter) { alert('Data system not ready.'); return; }
      await window.NeoDataAdapter.importAll(data);
      window.location.reload();
    } catch {
      alert('Invalid save file.');
    }
    e.target.value = '';
  });

  document.getElementById('dataDelete').addEventListener('click', async () => {
    if (!confirm('Delete ALL save data? This cannot be undone.')) return;
    const button = document.getElementById('dataDelete');
    if (button) {
      button.disabled = true;
      button.textContent = 'Deleting...';
    }
    try {
      if (!window.NeoDataAdapter) throw new Error('Data system not ready.');
      await window.NeoDataAdapter.deleteAll();
      window.location.reload();
    } catch (error) {
      console.error('Failed to delete save data', error);
      alert('Could not delete all save data. Check the console for details.');
      if (button) {
        button.disabled = false;
        button.textContent = 'Delete';
      }
    }
  });
})();
