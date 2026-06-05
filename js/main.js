// main.js — ES module entry point. Imports all game modules in dependency order.
// Each import runs the module's top-level code, wiring functions and constants
// onto the Neo global.

import './core/game-core.js';
import './core/math-utils.js';
import './core/sfx.js';
import './core/music.js';
import './ui/input.js';
import './core/status.js';
import './ui/notifications.js';
import './ui/panels.js';
import './core/game-state.js';
import './game/roomTemplates.js';
import './game/rooms.js';
import './game/enemies.js';
import './game/player.js';
import './game/projectile-types.js';
import './game/combat.js';
import './core/update.js';
import './game/world.js';
import './game/hud.js';
import './draw/viewport.js';
import './draw/environment.js';
import './draw/lighting.js';
import './draw/props.js';
import './draw/atlas.js';
import './draw/entities.js';
import './draw/hud.js';
import './core/canvas-recovery.js';
import './ui/controller.js';
import './core/save-store.js';
import './core/perf.js';
