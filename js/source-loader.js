(() => {
  const SOURCE_VERSION = '2026-05-11-001';
  const GAME_SOURCE_FILES = [
    'js/core/game-core.js',
    'js/core/math-utils.js',
    'js/ui/input.js',
    'js/core/status.js',
    'js/ui/notifications.js',
    'js/ui/panels.js',
    'js/core/game-state.js',
    'js/game/rooms.js',
    'js/game/enemies.js',
    'js/game/player.js',
    'js/game/combat.js',
    'js/core/update.js',
    'js/game/world.js',
    'js/game/hud.js',
    'js/draw/viewport.js',
    'js/draw/environment.js',
    'js/draw/lighting.js',
    'js/draw/props.js',
    'js/draw/atlas.js',
    'js/draw/entities.js',
    'js/draw/hud.js',
    'js/ui/controller.js',
    'js/core/save-store.js',
    'js/core/perf.js',
  ];

  function unwrapIife(source, file) {
    const prefix = '(() => {';
    const suffix = '})();';
    const start = source.indexOf(prefix);
    const end = source.lastIndexOf(suffix);
    if (start === -1 || end === -1 || end < start) {
      throw new Error(`Expected ${file} to be wrapped in ${prefix} ... ${suffix}`);
    }
    return source.slice(start + prefix.length, end);
  }

  async function loadGameSources() {
    const parts = await Promise.all(GAME_SOURCE_FILES.map(async file => {
      const sourceUrl = `${file}?v=${SOURCE_VERSION}`;
      const response = await fetch(sourceUrl, { cache: 'reload' });
      if (!response.ok) throw new Error(`Failed to load ${file}: ${response.status}`);
      return `\n// ${file}\n${unwrapIife(await response.text(), file)}\n`;
    }));

    const script = document.createElement('script');
    script.textContent = `"use strict";\n${parts.join('\n')}\n//# sourceURL=neonyke-sources.js`;
    document.head.appendChild(script);
  }

  loadGameSources().catch(error => {
    console.error(error);
    const bootLoading = document.getElementById('bootLoading');
    if (bootLoading) {
      bootLoading.querySelector('.boot-loading__hint').textContent = 'Failed to load game sources';
    }
  });
})();
