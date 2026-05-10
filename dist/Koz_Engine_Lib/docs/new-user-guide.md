# Koz Engine New User Guide

This guide is for developers who want to understand or reuse parts of `Koz_Engine_Lib` without first reverse-engineering the whole Bargain Quest codebase.

## What This Library Is

`Koz_Engine_Lib` is a **transitional engine extraction**, not a published package with a frozen API.

Use it as:

- a collection of reusable modules you can copy or require directly
- a reference for how the game is separating engine logic from game logic
- a source of tested helpers for state, save/load, world editing, timers, and similar systems

Do not assume:

- all modules are renderer-agnostic
- all modules are standalone
- all modules share one import style
- all modules are ready for reuse in another project

## Start With These Modules

These are the clearest entry points for new users:

- `Core/gameStateManager.js`
- `Core/spatialGrid.js`
- `Core/uiScreenController.js`
- `SaveLoad/saveApi.js`
- `SaveLoad/storageDrivers.js`
- `SaveLoad/schemaRegistry.js`
- `Time/countdownTimer.js`
- `Time/dayNightCore.js`
- `Events/eventEngine.js`
- `Events/notificationCenter.js`
- `Events/tipTracker.js`
- `UI/mobileInput.js`
- `World/seededRng.js`
- `World/worldSpace.js`
- `World/worldEditor.js`
- `World/worldGenerators.js`
- `World/dungeonMaze.js`
- `Economy/stagedAcquisition.js`
- `Items/itemFactory.js`
- `Audio/musicSystem.js`
- `Audio/soundRegistry.js`
- `VisualFX/particleSystemCore.js`

## Avoid Starting With These

These modules still carry significant host, DOM, p5, or Bargain Quest coupling:

- `Events/eventSystem.js`
- `Events/notificationManager.js`
- `Time/dayNightCycle.js`
- `Minigames/minigamesRuntime.js`
- `Assets/atlasHelper.js`
- `VisualFX/particleSystem.js`
- `VisualFX/flightPath.js`
- `AI/AI.js`
- `AI/Charictar_controller.js`
- `Core/GameObject.js`

`AI/astar.js` sits in the middle: it is reusable in concept, but its current implementation still assumes Bargain Quest-style grid cells and global terrain cost data.

## How To Load Modules

### Preferred Current Pattern: CommonJS-style direct require

Most tested modules are consumed this way:

```js
const { GameStateManager } = require("./Koz_Engine_Lib/Core/gameStateManager");
const { createWorldSpace } = require("./Koz_Engine_Lib/World/worldSpace");
const { SaveAPI } = require("./Koz_Engine_Lib/SaveLoad/saveApi");
const { createMemoryDriver } = require("./Koz_Engine_Lib/SaveLoad/storageDrivers");
```

This matches the test suite in `tests/lib/`.

### Browser Global Bridge: Transitional Only

If you need browser globals, load [`Core/koz-engine.global.js`](/home/davidk/Documents/CODE/GITHUB/Bargain-Quest/Koz_Engine_Lib/Core/koz-engine.global.js). It registers modules under `window.KozEngine` and also publishes some legacy globals.

Example:

```html
<script src="Koz_Engine_Lib/Core/koz-engine.global.js"></script>
<script>
  const { GameStateManager } = window.KozEngine.Core.gameStateManager;
  const gsm = new GameStateManager();
</script>
```

Prefer direct module loading when possible. The global bridge exists as host glue while the engine extraction is still in progress.

## Best Usage Examples

For concrete examples, read the tests:

- [`tests/lib/gameStateManager.test.js`](/home/davidk/Documents/CODE/GITHUB/Bargain-Quest/tests/lib/gameStateManager.test.js)
- [`tests/lib/saveApi.test.js`](/home/davidk/Documents/CODE/GITHUB/Bargain-Quest/tests/lib/saveApi.test.js)
- [`tests/lib/worldSpace.test.js`](/home/davidk/Documents/CODE/GITHUB/Bargain-Quest/tests/lib/worldSpace.test.js)
- [`tests/lib/worldEditor.test.js`](/home/davidk/Documents/CODE/GITHUB/Bargain-Quest/tests/lib/worldEditor.test.js)
- [`tests/lib/mobileInput.test.js`](/home/davidk/Documents/CODE/GITHUB/Bargain-Quest/tests/lib/mobileInput.test.js)
- [`tests/lib/itemFactory.test.js`](/home/davidk/Documents/CODE/GITHUB/Bargain-Quest/tests/lib/itemFactory.test.js)

## Read The Docs In This Order

1. [`README.md`](/home/davidk/Documents/CODE/GITHUB/Bargain-Quest/Koz_Engine_Lib/README.md) for project status and boundaries
2. [`docs/module-catalog.md`](/home/davidk/Documents/CODE/GITHUB/Bargain-Quest/Koz_Engine_Lib/docs/module-catalog.md) for per-module guidance
3. [`docs/migration-roadmap.md`](/home/davidk/Documents/CODE/GITHUB/Bargain-Quest/Koz_Engine_Lib/docs/migration-roadmap.md) for architecture direction
4. [`docs/class-to-lib-status.md`](/home/davidk/Documents/CODE/GITHUB/Bargain-Quest/Koz_Engine_Lib/docs/class-to-lib-status.md) for extraction status

## Current Caveats

- The library is not versioned or packaged independently yet.
- Most modules use CommonJS-style exports, but not every file is consistent yet.
- Some files are still prototypes parked in the engine folder while they await cleanup.
- Some docs describe the target architecture, not just the current state. When that matters, prefer the module catalog and the tests.
