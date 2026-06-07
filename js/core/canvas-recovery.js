// canvas-recovery.js — recover canvas rendering after browser/GPU idle resets.

function resetMainCanvasContext() {
  if (!Neo.canvas) return null;
  const nextCtx = Neo.canvas.getContext('2d');
  if (!nextCtx) return null;
  nextCtx.imageSmoothingEnabled = false;
  Neo.ctx = nextCtx;
  return nextCtx;
}

function resetRenderCaches() {
  if (typeof Neo.buildSpriteAtlas === 'function') Neo.SPRITE_ATLAS = Neo.buildSpriteAtlas();
  if (typeof Neo.buildEnvironmentTileAtlas === 'function') Neo.ENV_TILE_ATLAS = Neo.buildEnvironmentTileAtlas();
  Neo.environmentBackgroundCache = { key: '', canvas: null };
  Neo.minimapLegendCache = null;
  Neo.minimapLegendDirty = true;
}

export function recoverCanvasRendering() {
  const ctx = resetMainCanvasContext();
  if (!ctx) return false;
  resetRenderCaches();
  Neo.lastTime = 0;
  Neo.perfState && (Neo.perfState.lastRafTimestamp = 0);
  Neo.drawActionIcons?.();
  Neo.drawDifficultyIcons?.();
  Neo.draw?.();
  return true;
}

function scheduleRecover() {
  requestAnimationFrame(() => recoverCanvasRendering());
}

export function bindCanvasRecovery() {
  if (!Neo.canvas || Neo.canvasRecoveryBound) return;
  Neo.canvasRecoveryBound = true;

  Neo.canvas.addEventListener('contextlost', event => {
    event.preventDefault();
    Neo.canvasContextLost = true;
  });

  Neo.canvas.addEventListener('contextrestored', () => {
    Neo.canvasContextLost = false;
    scheduleRecover();
  });

  window.addEventListener('pageshow', scheduleRecover);
  window.addEventListener('focus', scheduleRecover);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRecover();
  });
}

Neo.recoverCanvasRendering = recoverCanvasRendering;
Neo.bindCanvasRecovery = bindCanvasRecovery;
