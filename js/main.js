// main.js — ES module entry point. Imports all game modules in dependency order.
// Each import runs the module's top-level code, wiring functions and constants
// onto the Neo global.

(function () {
	let __dev = false;
	Object.defineProperty(globalThis, 'developer_mode', {
		get() { return __dev; },
		set(value) {
			const v = !!value;
			if (v === __dev) return;
			__dev = v;
			try {
				window.dispatchEvent(new CustomEvent('developer-mode-changed', { detail: __dev }));
			} catch (e) { /* ignore */ }
		},
		configurable: true,
		enumerable: true,
	});
})();

// Platform-neutral foundations load before the legacy browser runtime. They use
// no DOM APIs and can also be required directly by Node-based authorities/tests.
import './config/FeatureFlags.js';
import './simulation/RandomService.js';
import './simulation/SharedCombatContent.js';
import './simulation/SharedMoveContent.js';
import './simulation/SharedEnemyContent.js';
import './simulation/GameState.js';
import './simulation/GameSimulation.js';
import './simulation/FixedTickRunner.js';
import './simulation/DeterministicFloorGenerator.js';
import './simulation/NetworkCombatSystem.js';
import './multiplayer/NetworkTransport.js';
import './multiplayer/OfflineTransport.js';
import './multiplayer/OfflineGameSession.js';
import './multiplayer/LocalLoopbackTransport.js';
import './protocol/ProtocolV1.js';
import './multiplayer/LocalMultiplayerSession.js';
import './multiplayer/CloudflareWebSocketTransport.js';
import './multiplayer/BrowserMultiplayerSession.js';
import './rendering/NetworkGameView.js';

import './core/game-core.js';
import './core/math-utils.js';
import './core/sfx.js';
import './core/music.js';
import './ui/input.js';
import './core/status.js';
import './ui/notifications.js';
import './ui/unlock-banner.js';
import './ui/panels.js';
import './ui/tutorial-controller.js';
import './core/game-state.js';
import './game/roomTemplates.js';
import './game/rooms.js';
import './game/enemies.js';
import './game/player.js';
import './game/specialRooms.js';
import './game/projectile-types.js';
import './game/combat.js';
import './core/update.js';
import './game/world.js';
import './game/hud.js';
import './draw/viewport.js';
import './draw/image-assets.js';
import './draw/environment.js';
import './draw/lighting.js';
import './draw/props.js';
import './draw/atlas.js';
import './draw/character-sheets.js';
import './draw/entities.js';
import './draw/hud.js';
import './draw/three-renderer.js';
import './core/canvas-recovery.js';
import './ui/sprite-editor.js';
import './ui/move-preview.js';
import './ui/controller.js';
import './core/save-store.js';
import './core/perf.js';
