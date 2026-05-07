(function Settings() {
  const STORE_KEY = 'neonyke:settings';
  const REPLAY_TUTORIAL_KEY = 'neonyke:replayTutorialNextRun';

  const DEFAULT_BINDINGS = { up:'w', down:'s', left:'a', right:'d', dash:'shift', inventory:'i', smash:'r', slash:'lmb', laser:'rmb' };
  const DEFAULT_TOUCH_BINDINGS = { touchA:'slash', touchB:'laser', touchY:'smash', touchX:'ascend', touchDash:'dash' };
  const DEFAULT_VOLUME   = { master:80, sfx:80, music:60 };
  const DEFAULT_ACCESS   = { reduceFlash:false, reduceMotion:false, reduceParticles:false, highContrast:false, screenShake:true };

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
  let volume   = { ...DEFAULT_VOLUME };
  let access   = { ...DEFAULT_ACCESS };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!s) return;
      if (s.bindings)     bindings     = { ...DEFAULT_BINDINGS, ...s.bindings };
      if (s.touchBindings) touchBindings = { ...DEFAULT_TOUCH_BINDINGS, ...s.touchBindings };
      if (s.volume)       volume       = { ...DEFAULT_VOLUME,   ...s.volume };
      if (s.access)       access       = { ...DEFAULT_ACCESS,   ...s.access };
      if (s.activeTheme)  activeTheme  = s.activeTheme;
      if (s.savedThemes && typeof s.savedThemes === 'object') savedThemes = s.savedThemes;
      if (s.customThemeVars && typeof s.customThemeVars === 'object') customThemeVars = { ...customThemeVars, ...s.customThemeVars };
    } catch {}
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify({ bindings, touchBindings, volume, access, activeTheme, savedThemes, customThemeVars }));
    window.dispatchEvent(new CustomEvent('neo:settings-changed'));
  }

  function applyAccess() {
    document.documentElement.classList.toggle('acc-reduce-flash',    access.reduceFlash);
    document.documentElement.classList.toggle('acc-reduce-motion',   access.reduceMotion);
    document.documentElement.classList.toggle('acc-high-contrast',   access.highContrast);
  }

  // ── Mobile detection ─────────────────────────────────────────────────────────
  function isTouchDevice() {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0);
  }

  function applyControlsSectionVisibility() {
    const isTouch = isTouchDevice();
    const desktopSec = document.querySelector('.controls-desktop-section');
    const mobileSec  = document.querySelector('.controls-mobile-section');
    if (desktopSec) desktopSec.style.display = isTouch ? 'none' : '';
    if (mobileSec)  mobileSec.style.display  = isTouch ? '' : 'none';
  }

  load();
  applyAccess();
  applyControlsSectionVisibility();
  // Apply saved theme on boot (before any UI is queried)
  if (activeTheme && (PRESET_THEMES[activeTheme] || savedThemes[activeTheme])) {
    applyThemeVars((PRESET_THEMES[activeTheme] || savedThemes[activeTheme]).vars);
  } else if (activeTheme === '_custom') {
    applyThemeVars(customThemeVars);
  }

  window.NeoSettings = {
    getBindings: () => bindings,
    getTouchBindings: () => touchBindings,
    getAccess: () => access,
    getVolume: () => volume,
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

  function label(action) {
    const v = bindings[action];
    return v === 'lmb' ? 'LMB' : v === 'rmb' ? 'RMB' : v.toUpperCase();
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

  [['accReduceFlash','reduceFlash'],['accReduceMotion','reduceMotion'],['accReduceParticles','reduceParticles'],['accHighContrast','highContrast'],['accScreenShake','screenShake']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    el.checked = access[key];
    el.addEventListener('change', () => { access[key] = el.checked; save(); applyAccess(); });
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

  document.getElementById('dataExport').addEventListener('click', async () => {
    const store = window._neoSaveStore;
    const [meta, run] = await Promise.all([
      store ? store.get('meta') : Promise.resolve(null),
      store ? store.get('run')  : Promise.resolve(null),
    ]);
    const blob = new Blob([JSON.stringify({ meta, run }, null, 2)], { type: 'application/json' });
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
      const store = window._neoSaveStore;
      if (!store) { alert('Save system not ready. Start a game first.'); return; }
      if (data.meta) await store.put('meta', data.meta);
      if (data.run)  await store.put('run',  data.run);
      alert('Save imported. Reload the page to apply.');
    } catch {
      alert('Invalid save file.');
    }
    e.target.value = '';
  });

  document.getElementById('dataDelete').addEventListener('click', async () => {
    if (!confirm('Delete ALL save data? This cannot be undone.')) return;
    const store = window._neoSaveStore;
    if (store) {
      await Promise.all([store.delete('meta'), store.delete('run')]);
    }
    localStorage.removeItem('neonyke:meta');
    localStorage.removeItem('neonyke:run');
    alert('Save data deleted. Reload the page.');
  });
})();
