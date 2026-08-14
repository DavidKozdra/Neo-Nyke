// perf.js — performance monitoring and boot() entry point.

export function createPerfState() {
  let enabled = false;
  try { enabled = new URLSearchParams(window.location.search).has('perf'); } catch { enabled = false; }
  return {
    enabled, overlay: null,
    averages: Object.create(null), sections: Object.create(null),
    fps: 0, rafMs: 0, workMs: 0, lastRafTimestamp: 0, lastOverlayAt: 0,
    totalFrames: 0, slowFrames: 0, worstFrameMs: 0,
    frameWorkSamples: [], rafSamples: [],
    adaptiveQualityLevel: 0, adaptiveSlowFrames: 0, adaptiveHealthyFrames: 0,
    adaptiveCooldownFrames: 0,
  };
}

const perfState = createPerfState();
Neo.perfState = perfState;

export function resetPerfStats() {
  perfState.averages = Object.create(null);
  perfState.sections = Object.create(null);
  perfState.fps = 0; perfState.rafMs = 0; perfState.workMs = 0;
  perfState.lastRafTimestamp = 0; perfState.lastOverlayAt = 0;
  perfState.totalFrames = 0; perfState.slowFrames = 0; perfState.worstFrameMs = 0;
  perfState.frameWorkSamples = []; perfState.rafSamples = [];
  perfState.adaptiveQualityLevel = 0; perfState.adaptiveSlowFrames = 0;
  perfState.adaptiveHealthyFrames = 0; perfState.adaptiveCooldownFrames = 0;
  Neo.invalidateMinimapCache?.();
}

export function setPerfEnabled(enabled) {
  const nextEnabled = !!enabled;
  if (nextEnabled === perfState.enabled) return perfState.enabled;
  perfState.enabled = nextEnabled;
  if (nextEnabled) { resetPerfStats(); ensurePerfOverlay(); updatePerfOverlay(true); }
  else if (perfState.overlay) { perfState.overlay.remove(); perfState.overlay = null; }
  return perfState.enabled;
}

export function perfStart() {
  return perfState.enabled ? performance.now() : 0;
}

export function perfEnd(name, startTime) {
  if (!perfState.enabled || !startTime) return;
  const elapsed = performance.now() - startTime;
  perfState.sections[name] = (perfState.sections[name] || 0) + elapsed;
}

export function perfSample(name, value) {
  const previous = perfState.averages[name];
  perfState.averages[name] = previous === undefined
    ? value
    : previous + (value - previous) * Neo.PERF_AVG_WEIGHT;
}

export function perfBeginFrame(timestamp) {
  if (perfState.enabled) perfState.sections = Object.create(null);
  if (perfState.lastRafTimestamp) {
    const rafMs = Math.max(0, timestamp - perfState.lastRafTimestamp);
    perfState.rafMs = rafMs;
    perfState.rafSamples.push(rafMs);
    if (perfState.rafSamples.length > 600) perfState.rafSamples.shift();
    if (rafMs > 0) {
      const fps = 1000 / rafMs;
      perfState.fps = perfState.fps ? perfState.fps + (fps - perfState.fps) * Neo.PERF_AVG_WEIGHT : fps;
    }
  }
  perfState.lastRafTimestamp = timestamp;
  return performance.now();
}

function setAdaptiveQualityLevel(level) {
  const nextLevel = Neo.clamp(Math.round(Number(level) || 0), 0, 2);
  if (nextLevel === perfState.adaptiveQualityLevel) return;
  perfState.adaptiveQualityLevel = nextLevel;
  perfState.adaptiveSlowFrames = 0;
  perfState.adaptiveHealthyFrames = 0;
  perfState.adaptiveCooldownFrames = 120;
  Neo.invalidateMinimapCache?.();
  window.dispatchEvent?.(new CustomEvent('neo-adaptive-quality', { detail: { level: nextLevel } }));
}

export function getAdaptiveQualityLevel() {
  return perfState.adaptiveQualityLevel;
}

function updateAdaptiveQuality(workMs) {
  const performanceMode = window.NeoSettings?.isPerformanceMode?.() !== false;
  if (!performanceMode) {
    setAdaptiveQualityLevel(0);
    return;
  }
  if (document.hidden || Neo.windowBlurred || Neo.gameState !== 'play') {
    perfState.adaptiveSlowFrames = 0;
    perfState.adaptiveHealthyFrames = 0;
    return;
  }
  if (perfState.adaptiveCooldownFrames > 0) perfState.adaptiveCooldownFrames -= 1;

  // Leave headroom for canvas compositing and the browser itself. RAF cadence is
  // included because GPU/compositor stalls are not visible in JS work time.
  const rafMs = Number(perfState.rafMs || 0);
  const slow = workMs > 12 || (rafMs > 19 && workMs > 4);
  const healthy = workMs < 9 && rafMs > 0 && rafMs < 18.5;
  if (slow) {
    perfState.adaptiveSlowFrames += 1;
    perfState.adaptiveHealthyFrames = 0;
  } else if (healthy) {
    perfState.adaptiveHealthyFrames += 1;
    perfState.adaptiveSlowFrames = Math.max(0, perfState.adaptiveSlowFrames - 2);
  } else {
    perfState.adaptiveSlowFrames = Math.max(0, perfState.adaptiveSlowFrames - 1);
    perfState.adaptiveHealthyFrames = 0;
  }

  if (perfState.adaptiveCooldownFrames > 0) return;
  const degradeThreshold = perfState.adaptiveQualityLevel === 0 ? 18 : 30;
  if (perfState.adaptiveQualityLevel < 2 && perfState.adaptiveSlowFrames >= degradeThreshold) {
    setAdaptiveQualityLevel(perfState.adaptiveQualityLevel + 1);
  } else if (perfState.adaptiveQualityLevel > 0 && perfState.adaptiveHealthyFrames >= 240) {
    setAdaptiveQualityLevel(perfState.adaptiveQualityLevel - 1);
  }
}

export function perfEndFrame(frameStartTime) {
  if (!frameStartTime) return;
  const workMs = performance.now() - frameStartTime;
  perfState.workMs = workMs;
  perfState.frameWorkSamples.push(workMs);
  if (perfState.frameWorkSamples.length > 600) perfState.frameWorkSamples.shift();
  updateAdaptiveQuality(workMs);
  if (!perfState.enabled) return;
  perfState.totalFrames += 1;
  if (workMs > Neo.PERF_BUDGET_60FPS) perfState.slowFrames += 1;
  perfState.worstFrameMs = Math.max(perfState.worstFrameMs, workMs);
  perfSample('frame.work', workMs);
  Object.entries(perfState.sections).forEach(([name, value]) => perfSample(name, value));
  updatePerfOverlay(false);
}

function percentile(samples, ratio) {
  if (!samples.length) return 0;
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function formatPerfMs(value) {
  const n = Number(value || 0);
  return `${n >= 10 ? n.toFixed(1) : n.toFixed(2)}ms`;
}

function formatPerfFps(value) {
  const n = Number(value || 0);
  return n > 0 ? n.toFixed(1) : '--';
}

function ensurePerfOverlay() {
  if (perfState.overlay) return perfState.overlay;
  const existing = document.getElementById('perfOverlay');
  if (existing) { perfState.overlay = existing; return existing; }
  const overlay = document.createElement('pre');
  overlay.id = 'perfOverlay';
  overlay.className = 'perf-overlay';
  overlay.setAttribute('aria-live', 'off');
  overlay.title = 'Press F3 to hide. Use NeoPerf.snapshot() in the console for raw values.';
  (document.getElementById('wrap') || document.body).appendChild(overlay);
  perfState.overlay = overlay;
  return overlay;
}

function getPerfCounts() {
  return {
    state: Neo.gameState, floor: Neo.floor,
    enemies: Neo.enemies.length, bodies: Neo.deadBodies.length,
    projectiles: Neo.projectiles.length, particles: Neo.particles.length,
    pickups: Neo.pickups.length, hazards: Neo.hazards.length,
    destructibles: Neo.destructibles.length, rooms: Neo.rooms.length,
  };
}

function getTopPerfSections(limit = 4) {
  const ignored = new Set(['frame.work', 'update', 'Neo.draw', 'Neo.ui']);
  return Object.entries(perfState.averages)
    .filter(([name, value]) => !ignored.has(name) && Number(value) > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function updatePerfOverlay(force) {
  if (!perfState.enabled) return;
  const now = performance.now();
  if (!force && now - perfState.lastOverlayAt < Neo.PERF_OVERLAY_INTERVAL) return;
  perfState.lastOverlayAt = now;
  const overlay = ensurePerfOverlay();
  const avg = perfState.averages;
  const counts = getPerfCounts();
  const slowPct = perfState.totalFrames ? (perfState.slowFrames / perfState.totalFrames) * 100 : 0;
  const top = getTopPerfSections().map(([name, value]) => `${name} ${formatPerfMs(value)}`).join(' | ') || 'collecting...';
  overlay.textContent = [
    'NEO PERF  F3 toggles  console: NeoPerf.snapshot()',
    `fps ${formatPerfFps(perfState.fps)} | raf ${formatPerfMs(perfState.rafMs)} | work avg ${formatPerfMs(avg['frame.work'])} last ${formatPerfMs(perfState.workMs)}`,
    `quality auto ${perfState.adaptiveQualityLevel}/2 | p95 ${formatPerfMs(percentile(perfState.frameWorkSamples, 0.95))} | p99 ${formatPerfMs(percentile(perfState.frameWorkSamples, 0.99))}`,
    `slow>${formatPerfMs(Neo.PERF_BUDGET_60FPS)} ${slowPct.toFixed(1)}% | worst ${formatPerfMs(perfState.worstFrameMs)}`,
    `totals  update ${formatPerfMs(avg.update)} | draw ${formatPerfMs(avg['Neo.draw'])} | ui/dom ${formatPerfMs(avg['Neo.ui'])}`,
    `update  player ${formatPerfMs(avg['update.player'])} | enemies ${formatPerfMs(avg['update.enemies'])} | projectiles ${formatPerfMs(avg['update.projectiles'])} | world ${formatPerfMs(avg['update.world'])}`,
    `update  pickups ${formatPerfMs(avg['update.pickups'])} | corpses ${formatPerfMs(avg['update.corpses'])} | particles ${formatPerfMs(avg['update.particles'])} | transitions ${formatPerfMs(avg['update.transitions'])}`,
    `draw    room ${formatPerfMs(avg['draw.room'])} | items ${formatPerfMs(avg['draw.items'])} | shots ${formatPerfMs(avg['draw.projectiles'])} | entities ${formatPerfMs(avg['draw.entities'])} | particles ${formatPerfMs(avg['draw.particles'])}`,
    `draw    minimap ${formatPerfMs(avg['draw.minimap'])} | overlays ${formatPerfMs(avg['draw.overlays'])} | prompts ${formatPerfMs(avg['draw.prompts'])}`,
    `counts  state ${counts.state} | floor ${counts.floor} | enemies ${counts.enemies} | bodies ${counts.bodies} | shots ${counts.projectiles} | fx ${counts.particles} | pickups ${counts.pickups}`,
    `top     ${top}`,
  ].join('\n');
}

function installPerfDebugApi() {
  window.NeoPerf = {
    enable() { return setPerfEnabled(true); },
    disable() { return setPerfEnabled(false); },
    toggle() { return setPerfEnabled(!perfState.enabled); },
    reset() { resetPerfStats(); updatePerfOverlay(true); },
    snapshot() {
      return {
        enabled: perfState.enabled, fps: perfState.fps, rafMs: perfState.rafMs,
        workMs: perfState.workMs, slowFrames: perfState.slowFrames,
        totalFrames: perfState.totalFrames, worstFrameMs: perfState.worstFrameMs,
        adaptiveQualityLevel: perfState.adaptiveQualityLevel,
        percentiles: {
          workP95: percentile(perfState.frameWorkSamples, 0.95),
          workP99: percentile(perfState.frameWorkSamples, 0.99),
          rafP95: percentile(perfState.rafSamples, 0.95),
          rafP99: percentile(perfState.rafSamples, 0.99),
        },
        averages: { ...perfState.averages }, counts: getPerfCounts(),
      };
    },
  };
  if (perfState.enabled) ensurePerfOverlay();
}

function installBootFailureHandlers() {
  if (window.__neoBootFailureHandlersInstalled) return;
  window.__neoBootFailureHandlersInstalled = true;

  const handleError = (errorLike) => {
    const reason = errorLike?.error || errorLike?.reason || errorLike?.message || errorLike || 'Unknown error';
    showBootError(reason);
  };

  window.addEventListener('error', (event) => {
    if (event && event.error) {
      handleError(event.error);
    } else if (event && event.message) {
      handleError(event.message);
    } else {
      handleError('A runtime error stopped the game.');
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    handleError(event?.reason || 'An unhandled promise rejection stopped the game.');
  });
}

function safePhase(label, fn) {
  try {
    return fn();
  } catch (error) {
    console.warn(`[Neo Nyke] Boot phase failed: ${label}`, error);
    return undefined;
  }
}

async function safePhaseAsync(label, fn) {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[Neo Nyke] Boot phase failed: ${label}`, error);
    return undefined;
  }
}

function showBootError(error) {
  const bootLoading = document.getElementById('bootLoading');
  if (!bootLoading) return;

  const box = bootLoading.querySelector('.boot-loading__box');
  if (!box) return;

  const hint = box.querySelector('.boot-loading__hint');
  if (hint) hint.textContent = 'Startup hit an error on mobile. Using a recovery path.';
  const message = String(error?.message || error || 'Unknown boot error');
  const existing = box.querySelector('.boot-loading__error');
  if (existing) existing.remove();

  const pre = document.createElement('pre');
  pre.className = 'boot-loading__error';
  pre.style.cssText = 'margin:10px 0 0; text-align:left; max-width:calc(100vw - 38px); white-space:pre-wrap; font-size:11px; color:#ffd3d3;';
  pre.textContent = message;
  box.appendChild(pre);

  bootLoading.classList.remove('boot-loading--done');

  if (!box.querySelector('[data-neo-reload]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.neoReload = '1';
    button.style.cssText = 'margin-top:14px; font:inherit; font-weight:700; min-height:38px; width:100%;';
    button.textContent = 'Reload game';
    button.addEventListener('click', () => window.location.reload());
    box.appendChild(button);
  }
}

async function runSafeBootFallback(error) {
  try { console.warn('[Neo Nyke] Entering safe boot fallback', error); } catch {}
  showBootError(error);
  try {
    if (typeof Neo.createUIController === 'function') {
      Neo.uiController = Neo.createUIController(Neo.ui);
    }
    if (Neo.gameStateManager) Neo.gameStateManager.setState(Neo.gameState);
    else Neo.uiController?.setState?.(Neo.gameState);
    Neo.uiController?.setHudUpdateHook?.(() => {});
    Neo.bindInput?.();
    Neo.draw?.();
    Neo.drawDifficultyIcons?.();
    Neo.refreshMenuState?.();
    hideBootLoading();
  } catch (fallbackError) {
    console.error('[Neo Nyke] Safe boot fallback failed', fallbackError);
    showBootError(fallbackError);
  }
}

export async function boot() {
  const defaultHideBootLoading = () => {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const bootLoading = document.getElementById('bootLoading');
    if (!bootLoading) return;
    bootLoading.classList.add('boot-loading--done');
    setTimeout(() => bootLoading.remove(), 320);
  };

  const fallbackSafePhase = (label, fn) => {
    if (typeof safePhase === 'function') return safePhase(label, fn);
    try {
      return fn();
    } catch (error) {
      console.warn(`[Neo Nyke] Boot phase failed: ${label}`, error);
      return undefined;
    }
  };

  const fallbackSafePhaseAsync = async (label, fn) => {
    if (typeof safePhaseAsync === 'function') return safePhaseAsync(label, fn);
    try {
      return await fn();
    } catch (error) {
      console.warn(`[Neo Nyke] Boot phase failed: ${label}`, error);
      return undefined;
    }
  };

  const fallbackShowBootError = (error) => {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
      console.warn('[Neo Nyke] Boot error:', error);
      return;
    }
    if (typeof showBootError === 'function') return showBootError(error);
    const bootLoading = document.getElementById('bootLoading');
    if (!bootLoading) return;
    const box = bootLoading.querySelector('.boot-loading__box');
    if (!box) return;
    box.querySelector('.boot-loading__hint')?.remove();
    const message = String(error?.message || error || 'Unknown boot error');
    const pre = document.createElement('pre');
    pre.className = 'boot-loading__error';
    pre.style.cssText = 'margin:10px 0 0; text-align:left; max-width:calc(100vw - 38px); white-space:pre-wrap; font-size:11px; color:#ffd3d3;';
    pre.textContent = message;
    box.appendChild(pre);
  };

  const fallbackInstallBootFailureHandlers = () => {
    if (typeof installBootFailureHandlers === 'function') return installBootFailureHandlers();
    const hostWindow = typeof window === 'undefined' ? null : window;
    if (!hostWindow || typeof hostWindow.addEventListener !== 'function') {
      return;
    }
    if (hostWindow.__neoBootFailureHandlersInstalled) return;
    hostWindow.__neoBootFailureHandlersInstalled = true;
    if (typeof hostWindow.addEventListener === 'function') {
      hostWindow.addEventListener('error', fallbackShowBootError);
      hostWindow.addEventListener('unhandledrejection', fallbackShowBootError);
    }
  };

  const fallbackRunSafeBootFallback = async (error) => {
    if (typeof runSafeBootFallback === 'function') return runSafeBootFallback(error);
    try { console.warn('[Neo Nyke] Entering safe boot fallback', error); } catch {}
    fallbackShowBootError(error);
    try {
      if (typeof Neo.createUIController === 'function') {
        Neo.uiController = Neo.createUIController(Neo.ui);
      }
      if (Neo.gameStateManager) Neo.gameStateManager.setState(Neo.gameState);
      else Neo.uiController?.setState?.(Neo.gameState);
      Neo.uiController?.setHudUpdateHook?.(() => {});
      Neo.bindInput?.();
      Neo.draw?.();
      Neo.drawDifficultyIcons?.();
      Neo.refreshMenuState?.();
      (typeof hideBootLoading === 'function' ? hideBootLoading : defaultHideBootLoading)();
    } catch (fallbackError) {
      console.error('[Neo Nyke] Safe boot fallback failed', fallbackError);
      fallbackShowBootError(fallbackError);
    }
  };

  try {
    fallbackInstallBootFailureHandlers();
    Neo.uiController = fallbackSafePhase('createUIController', () => Neo.createUIController(Neo.ui));
    Neo.tutorialController = fallbackSafePhase('createTutorialController', () => Neo.createTutorialController?.());
    Neo.saveStore = fallbackSafePhase('createSaveStore', () => Neo.createSaveStore());
    window._neoSaveStore = Neo.saveStore;
    Neo.itemRegistry = fallbackSafePhase('createItemRegistry', () => Neo.createItemRegistry());

    if (typeof installPerfDebugApi === 'function') {
      installPerfDebugApi();
    }
    if (Neo.gameStateManager) Neo.gameStateManager.setState(Neo.gameState);
    else Neo.uiController?.setState?.(Neo.gameState);

    Neo.uiController?.setHudUpdateHook?.(() => {
      if (Neo.gameState !== 'play' || !Neo.player) return;
      const hudPerfStart = perfStart();
      Neo.updateObjective?.();
      Neo.updateHud?.();
      perfEnd('Neo.ui.hud', hudPerfStart);
    });

    if (!Neo.metaProgress) Neo.metaProgress = Neo.createDefaultMeta?.();
    await Promise.all([
      fallbackSafePhaseAsync('preloadCharacterSheets', () => Neo.preloadCharacterSheets?.()),
      fallbackSafePhaseAsync('preloadEnvironmentImages', () => Neo.preloadEnvironmentImages?.()),
    ]);
    await fallbackSafePhaseAsync('preloadCustomCharacterSprites', () => Neo.preloadCustomCharacterSprites?.());
    Neo.SPRITE_ATLAS = fallbackSafePhase('buildSpriteAtlas', () => Neo.buildSpriteAtlas?.());
    Neo.ENV_TILE_ATLAS = fallbackSafePhase('buildEnvironmentTileAtlas', () => Neo.buildEnvironmentTileAtlas?.());
    fallbackSafePhase('bindCanvasRecovery', () => Neo.bindCanvasRecovery?.());
    fallbackSafePhase('bindInput', () => Neo.bindInput?.());
    fallbackSafePhase('bindPanelInput', () => Neo.bindPanelInput?.());
    fallbackSafePhase('drawActionIcons', () => Neo.drawActionIcons?.());
    await fallbackSafePhaseAsync('loadPersistedState', () => Neo.loadPersistedState?.());
    fallbackSafePhase('syncTutorialState', () => Neo.tutorialController?.syncFromState?.());
    fallbackSafePhase('drawDifficultyIcons', () => Neo.drawDifficultyIcons?.());
    fallbackSafePhase('updateCharacterSelectionUI', () => Neo.updateCharacterSelectionUI?.());
    fallbackSafePhase('refreshMenuState', () => Neo.refreshMenuState?.());
    fallbackSafePhase('drawFrame', () => Neo.draw?.());
    fallbackSafePhase('installLazyPanels', () => Neo.installLazyPanels?.());
    (typeof hideBootLoading === 'function' ? hideBootLoading : defaultHideBootLoading)();
  } catch (error) {
    await fallbackRunSafeBootFallback(error);
  }
}

function hideBootLoading() {
  const bootLoading = document.getElementById('bootLoading');
  if (!bootLoading) return;
  bootLoading.classList.add('boot-loading--done');
  setTimeout(() => bootLoading.remove(), 320);
}

Neo.createPerfState = createPerfState;
Neo.resetPerfStats = resetPerfStats;
Neo.setPerfEnabled = setPerfEnabled;
Neo.perfStart = perfStart;
Neo.perfEnd = perfEnd;
Neo.perfSample = perfSample;
Neo.perfBeginFrame = perfBeginFrame;
Neo.perfEndFrame = perfEndFrame;
Neo.getAdaptiveQualityLevel = getAdaptiveQualityLevel;
Neo.installPerfDebugApi = installPerfDebugApi;
Neo.boot = boot;

boot();
