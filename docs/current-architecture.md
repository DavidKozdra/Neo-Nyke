# Neo Nyke current architecture

Audit date: 2026-07-17. This document records the browser runtime as it existed at the start of Milestone 1 and identifies the seams now being introduced. It is not a claim that the legacy game is already headless or network-ready.

## Runtime and entry points

- `index.html` is the application shell. It contains the canvas and most menus/HUD markup, loads legacy globals with deferred scripts, then loads `js/main.js` as the ES-module entry point.
- `game.html` only redirects to `index.html`.
- `js/core/neo.js` runs before the module graph and creates `window.Neo`, the shared mutable runtime object.
- `js/main.js` imports modules in dependency order. Most modules export selected helpers for tests but also attach their runtime functions to `Neo`.
- `js/core/game-core.js` obtains the canvas and 2D context at module load time, defines content/configuration constants, and exposes the Koz Engine APIs used by the game.
- The application is plain JavaScript. npm/package-lock are used; there is no transpiler or bundler. `npm run build` copies the static files to `dist/`.

At the start of the audit, gameplay and presentation were not separate layers: `Neo` contains players, entities, cameras, input, timers, UI state, save state, sprite references, and caches.

## Menu and mode selection

- The primary new-run action is now labeled `SINGLE PLAYER`. Selecting it creates an `OfflineGameSession` immediately, then opens the existing character selection flow.
- `MULTIPLAYER` is a separate visible primary action. The production flag remains off, while localhost automatically enables Create Room and Join Room for the development room proof. Neither the menu nor the disabled production controls initialize a network service.
- Existing same-device `coop` and `pvp` remain under `ALT MODES` → `LOCAL PLAY`; they are not treated as network sessions.
- `CONTINUE`, tutorial, competitive, alternate modes, archive, settings, and credits retain their existing paths.

## Frame and update loop

`js/core/update.js` owns `loop(timestamp)`. At audit start it calculated a render-frame delta capped at 33 ms, ran `update(dt)` once per animation frame, ticked UI, and drew. This made simulation frequency dependent on `requestAnimationFrame` frequency even though most movement and timers use seconds-based deltas.

Milestone 1 now loads `js/simulation/FixedTickRunner.js` before the legacy runtime and feeds the legacy `update` function 20 Hz fixed deltas through an accumulator. Rendering, UI animation, performance measurement, and death presentation remain render-frame driven. `Neo.simulationTick` and `Neo.simulationInterpolationAlpha` expose the transitional tick state. The legacy `update` function still reads DOM/input globals, so it is not yet the future server simulation.

## Controls and players

- `js/ui/input.js`, `js/touchControls.js`, and `js/gamepadControls.js` collect keyboard, mouse, touch, and controller state into `Neo.keys`, `Neo.mouse`, `NeoTouch`, and `NeoGamepad`.
- `update()` converts those device states directly into movement/actions. This is the main input/simulation coupling to remove in Milestone 2.
- `js/game/player.js` defines player data migration, player abilities, items, equipment, and Scroll control UI/behavior.
- The repository already has local split-screen `coop` and `pvp` modes for up to four local player slots. These are same-process modes, not network multiplayer and are not the UX or simulation model for the planned feature. Players 2–4 are updated from alternate keyboard/gamepad bindings.

## Gameplay systems

| Area | Current owner and behavior | Multiplayer extraction risk |
| --- | --- | --- |
| Collision | `js/core/math-utils.js` supplies circle/rectangle, door, wall, structure, and destructible tests; `moveCircle` resolves actors. | Functions read `Neo.currentRoom` and global entity arrays. |
| Enemy spawning/AI | `js/game/enemies.js` creates enemies and implements type-specific AI and bosses. `update.js` dispatches enemy updates and movement. | AI directly targets global player state and emits presentation effects. Authority-only execution is required. |
| Combat | `js/game/combat.js` owns attacks, damage, statuses, item procs, deaths, drops, rewards, and many projectile constructors. | Outcomes, particles, sound, achievements, and HUD changes occur in the same functions. |
| Projectiles/world damage | `js/game/world.js` creates/updates projectiles, hazards, pickups, room transitions, and player damage. | Entity IDs are not universally stable; several arrays use object identity/index removal. |
| Floor generation | `js/game/rooms.js` grows a connected 9x9 room graph, assigns exit/reward/special rooms, decorates rooms, and enters the start room. | Generation also moves the player, spawns rivals, emits events, opens UI, and updates the HUD. Static layout generation must be extracted from these side effects. |
| Rooms | `js/game/roomTemplates.js`, `rooms.js`, and `specialRooms.js` define room data, decoration, entry, challenges, services, and special rewards. | Static data and live encounter state are mixed in room objects. |
| Items/upgrades | `game-core.js` contains much content data; `player.js`, `combat.js`, `rooms.js`, and `ui/panels.js` apply items, drops, shops, Forge upgrades, and reward choices. | Purchases and selections currently originate in DOM handlers and mutate `Neo.player` directly. |
| Shops | Shop inventory is stored on rooms and in `Neo.shopOffers`; panels perform purchases and price display. | Inventory roll, validation, currency mutation, and UI need separate authority commands/events. |
| Scrolls | Scrolls of reroll, branching, replace, abundance, pool weight, and ego are present in `player.js`/`combat.js`. Pending selections are stored on the player; the modal pauses/blocks normal local input. | Network co-op must not inherit this single-player pause implicitly. The planned rule is selection in safe inter-floor state or personal protection without global pause. |
| Floor transitions | `rooms.js` enters rooms; `world.js` handles ladder/warp/loop transitions and calls `generateFloor`. | Transitions mutate floor, player position, RNG, rooms, persistence, audio, and HUD together. |
| Bosses | Boss selection/spawn and AI live primarily in `enemies.js`; rewards and death hooks live in `combat.js`; boss-room flow lives in `rooms.js`. | Phase state is embedded in enemy objects and must become serializable authority state. |

## State, persistence, and IDs

- `window.Neo` is the live state container. Entities are mostly arrays of mutable objects; not every network-relevant object has a stable ID.
- `js/game/hud.js` implements `serializeRun()`. It saves floor/rooms, players, enemies, projectiles, pickups, hazards, shops, cooldowns, run timers, rivals, RNG consumption, and other run data.
- `js/core/game-state.js` implements restore/migration and meta-progression defaults.
- `js/core/save-store.js` uses IndexedDB through the Koz save API when available and a localStorage driver as fallback. Settings/tutorial flags also use localStorage directly.
- Existing run snapshots are useful migration input but are not a network snapshot contract: they include presentation state such as camera and omit a universal entity-ID policy.
- Milestone 1 adds `js/simulation/GameState.js`, a versioned plain-data state with maps for network entities, stable monotonic ID allocation, JSON round trips, and rejection of functions/cycles. It does not replace legacy saves yet. Normal runs now create an `OfflineGameSession` backed by `OfflineTransport`; its serializable local authority clock advances beside the legacy campaign authority.

## Randomness and determinism

The existing game already has good groundwork:

- `Koz_Engine_Lib/World/seededRng.js` provides seeded streams.
- `game-state.js` derives per-floor `world`, `loot`, `encounter`, and `fx` streams and serializes their consumption counts.
- `rooms.js` uses `world`; loot and combat generally use their named streams; scoped room/entity random functions reduce call-order coupling.

The audit found these randomness boundaries:

- `applyPlayerHealing` used `Math.random()` for the gameplay-affecting overheal barrier chance. Milestone 1 now routes it through the seeded encounter stream.
- Random run seeds and non-gameplay record IDs appropriately use wall-clock/unseeded randomness but must be authority-provided in network matches.
- Projectile animation seeds and charge particles use `Math.random()` for presentation only; they must remain unable to affect outcomes.
- Draw code consumes the separate `fx` stream. It is isolated from gameplay streams, but a headless authority must never require it.
- Some arrays are randomized with comparator sorting. Although seeded, Fisher-Yates is preferred for cross-runtime clarity.

Milestone 1 adds `RandomService` with explicit `floor-generation`, `enemy-spawning`, `loot`, `shop-inventory`, `combat-variance`, and `boss-patterns` streams plus serializable stream state. `DeterministicFloorGenerator` proves a headless static room representation can be reproduced from the same seed/version. It is not yet substituted for the content-rich legacy generator.

## Wall-clock and frame-timing audit

Milestone 1 moved the main offline update and gameplay caches/proc cooldowns to simulation ticks. Sarge's two-kill Hammer window now uses simulation elapsed time instead of `performance.now()`. Remaining legacy timing dependencies are catalogued for extraction:

- Boss Rush and Rival Rumble between-wave scheduling uses `Date.now()` and `setTimeout`; the Artificer transformation sequence also changes gameplay state from timeouts.
- Local split-screen respawn/end sequences use `setTimeout`.
- Special-room interaction key latches use short timeouts. These are local input/UI gates, but network input must use ordered action edges instead.
- Low-health flash, secret-vendor denial feedback, music, audio variation, HUD animation, saving debounce, network fetch timeout, performance instrumentation, tutorial recency, and record timestamps use wall clock for presentation/persistence and do not determine normal-run combat.
- Corpse launch presentation uses recent-hit `performance.now()` data; the actual kill/damage outcome is already complete before it runs.

These remaining paths stay in the legacy browser layer for this milestone. They must not be called by the headless `GameSimulation`; relevant alternate-mode gameplay timers will be converted to serialized tick countdowns when those modes enter the authoritative system.

## Rendering and audio

- The main renderer is Canvas 2D across `js/draw/*`. An optional Three.js renderer is implemented in `js/draw/three-renderer.js`.
- Cameras and split-screen viewports are updated in the legacy simulation function; drawing reads `Neo` directly.
- Visual particles are live entities in `Neo.particles` and update in the gameplay update function even though they are decorative.
- `js/core/sfx.js` uses Web Audio buffers/one-shots and the Koz mixer; `js/core/music.js` uses Web Audio plus HTML Audio fallbacks. Both depend on browser APIs and must stay outside headless authority code.

## Backend, leaderboard, and deployment

- `server/server.js` is a Cloudflare Worker. In addition to health, version, notices, weekly seed, leaderboard, and weekly cron behavior, it now routes multiplayer room creation, lookup, and WebSocket upgrades to one `MultiplayerRoom` Durable Object per room code.
- The initial room Durable Object is authoritative for lobby membership, ready state, a 20 Hz headless movement simulation, input validation, and snapshots. It uses the shared protocol and simulation modules rather than accepting client positions. It is a milestone-A proof, not yet the complete campaign authority.
- The leaderboard accepts winning weekly-seed runs and stores ranked entries in KV. The current client/server trust model is not sufficient to certify network runs; multiplayer leaderboard eligibility needs an explicit later rule.
- `wrangler.toml` serves `dist/` static assets, routes `/api/*` to the Worker, and binds the `MULTIPLAYER_ROOMS` Durable Object namespace. The browser WebSocket transport uses the current origin under Wrangler or port 8787 when the static site is served separately on localhost.
- `sw.js` supplies offline caching/PWA behavior.

## Tests and verified baseline

- Jest 30 is invoked by `scripts/run-tests.js`. Tests are predominantly unit/source-contract tests; several extract functions from modules rather than booting the full game.
- Playwright and canvas are development dependencies, but there was no general browser smoke-test script at audit time.
- Final `npm run build`: passed.
- Final headless Chromium single-player smoke: menu → character select → `play` passed; both legacy and serializable session clocks reached tick 15, the session used `OfflineTransport`, no WebSocket was constructed, and no JavaScript page/console error occurred.
- Two-context headless Chromium multiplayer smoke: one browser created a short-code room, a second joined, both became ready, the Durable Object began its 20 Hz authority loop, opposing movement commands were validated, and both clients converged on the same tick-12 player snapshot without browser errors.
- `npm run multiplayer:smoke` makes that two-browser room proof repeatable against a running local Wrangler server.
- The previous full test baseline was 469 of 470 tests across 94 suites; the only failure was the pre-existing live `tests/ping-prod.test.js` production fetch in the restricted environment. The current verification count should be read from the latest test run rather than treated as a permanent repository total.

## Extraction order

The safe incremental path is:

1. Keep the browser and legacy `Neo` runtime playable while fixing the tick rate.
2. Establish plain state, deterministic services, transport contracts, and headless tests beside it.
3. Convert device input to per-player input commands.
4. Extract static floor generation, player movement/collision, enemies, projectiles/combat, then pickups/transitions into headless systems.
5. Move effects, audio, achievements, persistence, and DOM updates behind events emitted by simulation.
6. Only then run the same complete simulation in a Cloudflare room Durable Object and remote clients.
