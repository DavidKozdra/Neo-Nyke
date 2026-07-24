// three-loader.js — keeps the optional Three.js renderer out of the default
// 2D startup path. Existing players who selected 3D still load it immediately;
// everyone else loads it only when they request a 3D view.

const RENDER3D_STORE_KEY = 'neonyke:render3d';
const CAMERA_MODE_STORE_KEY = 'neonyke:camera3d';
const VIEW_MODE_LABELS = { '2d': '2D VIEW', third: 'THIRD PERSON', fp: 'FIRST PERSON' };

let rendererLoadPromise = null;
let rendererLoaded = false;
let viewRequest = 0;

function readStoredValue(key, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function writeStoredValue(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

function preferred3dMode() {
  return readStoredValue(CAMERA_MODE_STORE_KEY) === 'fp' && !Neo.isSplitScreen?.() ? 'fp' : 'third';
}

function announceViewChange(mode) {
  if (!Neo.player) return;
  Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 40, life: 1.4, text: VIEW_MODE_LABELS[mode], c: '#8df0ff' });
}

function loadThreeRenderer() {
  if (rendererLoadPromise) return rendererLoadPromise;
  rendererLoadPromise = import('./three-renderer.js')
    .then(module => {
      rendererLoaded = true;
      window.removeEventListener('keydown', onViewModeKeydown);
      return module;
    })
    .catch(error => {
      rendererLoadPromise = null;
      Neo.render3D = false;
      writeStoredValue(RENDER3D_STORE_KEY, '0');
      document.body.classList.remove('render3d');
      window.dispatchEvent(new CustomEvent('neo-view-mode-changed', { detail: '2d' }));
      console.warn('[3D] Renderer could not load; continuing in 2D.', error);
      throw error;
    });
  return rendererLoadPromise;
}

async function setViewMode(mode) {
  const requestId = ++viewRequest;
  const requested = mode === 'third' || mode === 'fp' ? mode : '2d';
  if (requested === '2d' && !rendererLoaded) {
    Neo.render3D = false;
    writeStoredValue(RENDER3D_STORE_KEY, '0');
    document.body.classList.remove('render3d');
    window.dispatchEvent(new CustomEvent('neo-view-mode-changed', { detail: '2d' }));
    return '2d';
  }

  if (requested !== '2d') writeStoredValue(RENDER3D_STORE_KEY, '1');
  await loadThreeRenderer();
  // Ignore a completed 3D import if the player changed their mind while it was
  // loading (for example, toggling F4 twice on a slow connection).
  if (requestId !== viewRequest) return Neo.getViewMode();
  // three-renderer replaces this lightweight loader with its synchronous
  // implementation once it has finished loading.
  Neo.setViewMode(requested);
  return Neo.getViewMode();
}

function getViewMode() {
  if (rendererLoaded) return Neo.threeRenderer?.getViewMode?.() || '2d';
  return Neo.render3D ? preferred3dMode() : '2d';
}

async function onViewModeKeydown(event) {
  if (event.repeat) return;
  if (event.code === 'F4') {
    event.preventDefault();
    const mode = Neo.render3D ? '2d' : preferred3dMode();
    try { announceViewChange(await setViewMode(mode)); } catch { /* 2D fallback is already applied */ }
  }
}

// Match the renderer's persisted preference before other runtime modules read
// Neo.render3D. A stored 3D preference opts into the full renderer immediately.
Neo.render3D = readStoredValue(RENDER3D_STORE_KEY, '0') === '1';
Neo.getViewMode = getViewMode;
Neo.setViewMode = setViewMode;
window.addEventListener('keydown', onViewModeKeydown);

if (Neo.render3D) await loadThreeRenderer();
