(function Settings() {
  const STORE_KEY = 'neonyke:settings';

  const DEFAULT_BINDINGS = { up:'w', down:'s', left:'a', right:'d', dash:'shift', inventory:'i', smash:'r', slash:'lmb', laser:'rmb' };
  const DEFAULT_VOLUME   = { master:80, sfx:80, music:60 };
  const DEFAULT_ACCESS   = { reduceFlash:false, highContrast:false, screenShake:true };

  let bindings = { ...DEFAULT_BINDINGS };
  let volume   = { ...DEFAULT_VOLUME };
  let access   = { ...DEFAULT_ACCESS };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!s) return;
      if (s.bindings) bindings = { ...DEFAULT_BINDINGS, ...s.bindings };
      if (s.volume)   volume   = { ...DEFAULT_VOLUME,   ...s.volume };
      if (s.access)   access   = { ...DEFAULT_ACCESS,   ...s.access };
    } catch {}
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify({ bindings, volume, access }));
  }

  function applyAccess() {
    document.documentElement.classList.toggle('acc-reduce-flash',  access.reduceFlash);
    document.documentElement.classList.toggle('acc-high-contrast', access.highContrast);
  }

  load();
  applyAccess();

  window.NeoSettings = { getBindings: () => bindings, getAccess: () => access, getVolume: () => volume };

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

  function stopListening() {
    if (!listeningBtn) return;
    listeningBtn.classList.remove('listening');
    listeningBtn = null;
    refreshBindButtons();
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

  [['accReduceFlash','reduceFlash'],['accHighContrast','highContrast'],['accScreenShake','screenShake']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    el.checked = access[key];
    el.addEventListener('change', () => { access[key] = el.checked; save(); applyAccess(); });
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
