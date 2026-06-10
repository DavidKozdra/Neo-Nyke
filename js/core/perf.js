// perf.js — performance monitoring and boot() entry point.

export function createPerfState() {
  let enabled = false;
  try { enabled = new URLSearchParams(window.location.search).has('perf'); } catch { enabled = false; }
  return {
    enabled, overlay: null,
    averages: Object.create(null), sections: Object.create(null),
    fps: 0, rafMs: 0, workMs: 0, lastRafTimestamp: 0, lastOverlayAt: 0,
    totalFrames: 0, slowFrames: 0, worstFrameMs: 0,
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
  if (!perfState.enabled) return 0;
  perfState.sections = Object.create(null);
  if (perfState.lastRafTimestamp) {
    const rafMs = Math.max(0, timestamp - perfState.lastRafTimestamp);
    perfState.rafMs = rafMs;
    if (rafMs > 0) {
      const fps = 1000 / rafMs;
      perfState.fps = perfState.fps ? perfState.fps + (fps - perfState.fps) * Neo.PERF_AVG_WEIGHT : fps;
    }
  }
  perfState.lastRafTimestamp = timestamp;
  return performance.now();
}

export function perfEndFrame(frameStartTime) {
  if (!perfState.enabled || !frameStartTime) return;
  const workMs = performance.now() - frameStartTime;
  perfState.workMs = workMs;
  perfState.totalFrames += 1;
  if (workMs > Neo.PERF_BUDGET_60FPS) perfState.slowFrames += 1;
  perfState.worstFrameMs = Math.max(perfState.worstFrameMs, workMs);
  perfSample('frame.work', workMs);
  Object.entries(perfState.sections).forEach(([name, value]) => perfSample(name, value));
  updatePerfOverlay(false);
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
    `slow>${formatPerfMs(Neo.PERF_BUDGET_60FPS)} ${slowPct.toFixed(1)}% | worst ${formatPerfMs(perfState.worstFrameMs)}`,
    `totals  update ${formatPerfMs(avg.update)} | draw ${formatPerfMs(avg['Neo.draw'])} | ui/dom ${formatPerfMs(avg['Neo.ui'])}`,
    `update  player ${formatPerfMs(avg['update.player'])} | enemies ${formatPerfMs(avg['update.enemies'])} | projectiles ${formatPerfMs(avg['update.projectiles'])} | world ${formatPerfMs(avg['update.world'])}`,
    `update  pickups ${formatPerfMs(avg['update.pickups'])} | corpses ${formatPerfMs(avg['update.corpses'])} | particles ${formatPerfMs(avg['update.particles'])} | transitions ${formatPerfMs(avg['update.transitions'])}`,
    `draw    room ${formatPerfMs(avg['draw.room'])} | items ${formatPerfMs(avg['draw.items'])} | entities ${formatPerfMs(avg['draw.entities'])} | particles ${formatPerfMs(avg['draw.particles'])}`,
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
        averages: { ...perfState.averages }, counts: getPerfCounts(),
      };
    },
  };
  if (perfState.enabled) ensurePerfOverlay();
}

export async function boot() {
  Neo.uiController = Neo.createUIController(Neo.ui);
  Neo.saveStore = Neo.createSaveStore();
  window._neoSaveStore = Neo.saveStore;
  Neo.itemRegistry = Neo.createItemRegistry();

  installPerfDebugApi();
  if (Neo.gameStateManager) Neo.gameStateManager.setState(Neo.gameState);
  else Neo.uiController.setState(Neo.gameState);
  Neo.uiController.setHudUpdateHook(() => {
    if (Neo.gameState !== 'play' || !Neo.player) return;
    const hudPerfStart = perfStart();
    Neo.updateObjective();
    Neo.updateHud();
    perfEnd('Neo.ui.hud', hudPerfStart);
  });
  if (!Neo.metaProgress) Neo.metaProgress = Neo.createDefaultMeta();
  await Neo.preloadCharacterSheets?.();
  Neo.SPRITE_ATLAS = Neo.buildSpriteAtlas();
  Neo.ENV_TILE_ATLAS = Neo.buildEnvironmentTileAtlas();
  Neo.bindCanvasRecovery?.();
  Neo.bindInput();
  Neo.bindPanelInput();
  Neo.drawActionIcons();
  Neo.drawDifficultyIcons();
  await Neo.loadPersistedState();
  Neo.updateCharacterSelectionUI();
  Neo.refreshMenuState();
  Neo.draw();
  hideBootLoading();
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
Neo.installPerfDebugApi = installPerfDebugApi;
Neo.boot = boot;

boot();
