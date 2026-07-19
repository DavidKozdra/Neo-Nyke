# Neo Nyke Editor Guide

## What this project is

**Neo Nyke: Dungeon God** is a static, canvas-rendered browser roguelite. The
frontend is plain JavaScript and CSS—there is no bundler, framework, or
TypeScript compilation step. It runs from `index.html`, stores local progress
in browser storage, and optionally talks to a Cloudflare Worker for the weekly
competitive seed, leaderboard, and notices.

The repository has three main parts:

| Area | Responsibility |
| --- | --- |
| `index.html`, `js/`, `css/`, `assets/` | The playable browser client and its UI. |
| `Koz_Engine_Lib/` | A transitional collection of reusable engine modules, exposed to the browser through a global bridge. |
| `server/` + `wrangler.toml` | Cloudflare Worker API backed by the `STORE` KV namespace. |

The root `README.md` is the player-facing overview. This file is the
implementation-oriented map for editors.

## Turning Neo Nyke into a $9.99 premium product

### Product assumption

This plan assumes a **one-time $9.99 desktop release on Steam**, with no
microtransactions, while keeping the browser build as a demo, preview, or
community edition. If the intended product is browser-only, skip the desktop
wrapper and Steam integration work, but keep the same quality, save, content,
accessibility, and release gates.

The price does not come from adding a certain number of rooms or relics. A $10
game earns its price by feeling complete: a clear promise, a satisfying first
session, reliable controls and saves, coherent art/audio/UI, meaningful replay
value, and no sense that the customer bought a beta.

### Recommended product promise

Position it as a compact, character-driven action roguelite:

> Master distinct heroes, build strange relic combinations, and survive a
> ten-floor dungeon that changes every run—then return for challenges, loops,
> local co-op, and weekly seeded competition.

That promise should determine the scope. The campaign, hero kits, build
crafting, and combat feel are the product. Sandbox, practice, endless, boss
rush, treasure hunt, custom characters, and the many special rooms are valuable
only when the core is already excellent. Cut, hide, or postpone any mode that
cannot meet the same quality bar by launch.

### Honest assessment of the current repository

The project is beyond a prototype. It already contains a full run structure,
multiple heroes and inputs, a large item/move/enemy catalog, tutorials,
accessibility settings, audio routing, alternate modes, achievements, local
progression, deterministic seeds, tests, PWA support, and a small competitive
backend. That is a strong content base for a $10 game.

It is not yet a premium release build. The largest gaps are:

| Area | Current condition | Paid-release requirement |
| --- | --- | --- |
| Product identity | The app still says `Beta 2.0`; README and shipped roster terminology are not fully synchronized. | One accurate 1.0 identity, feature list, roster, credits, and store promise. |
| Architecture | Large modules coordinate through mutable globals and DOM contracts. | Stabilize boundaries and tests around risky systems; do not rewrite working code merely for elegance. |
| Packaging | The root build produces static web files only. | Signed, installable desktop builds with correct versioning, icons, crash handling, and update/rollback procedures. |
| Saves | Progress is browser-storage-first. | Versioned disk saves with atomic writes, backups, corruption recovery, migration fixtures, and optional cloud sync. |
| QA | Jest coverage is broad but many tests extract functions/source instead of running the shipped game. | Unit + integration + packaged-build smoke + performance/soak + device/input testing. |
| Competitive integrity | The Worker validates submitted fields and seed, but the client reports its own result and time. | Treat the board as friendly/untrusted, or add identity and replay verification; never market it as cheat-proof. |
| Content quality | There is breadth, but breadth is not evidence that every build, hero, room, and mode is fun or readable. | Structured playtesting, balance telemetry, difficulty targets, and deliberate cuts. |
| Release operations | No desktop CI/release channel, crash pipeline, storefront assets, or support workflow is present. | Reproducible builds, release branches, staged rollout, support docs, and ownership. |

There is also a concrete integration mismatch to resolve before release:
`server/server.js` accepts only five values in `VALID_CHARACTERS`, while the
character-select UI exposes additional built-in heroes. A winning competitive
run with an unlisted hero can be rejected. Make the server consume a shared,
versioned competitive roster or test that both lists remain identical.

### Team shape and ownership

A practical expert team is four to seven people for roughly six to nine months
after scope is frozen. That is a planning range, not an estimate until the team
has profiled the build and watched external players use it.

- Product/creative lead: owns the promise, scope, difficulty, cuts, and release
  criteria.
- Technical lead: owns runtime boundaries, desktop platform, saves, builds,
  performance, and code review.
- Gameplay engineer/designer: owns combat, enemies, hero kits, items, economy,
  and deterministic balance tools.
- UI/UX engineer or designer: owns onboarding, controller navigation,
  accessibility, HUD/panels, and resolution support.
- Art/animation lead: owns visual direction, sprite readability, effects,
  capsules, trailer capture, and asset consistency.
- Audio designer/composer: owns mix targets, feedback priority, looping,
  licensing, and mastering.
- QA/release/community owner: owns test matrices, bug triage, playtest builds,
  storefront checklists, patch notes, and support.

People can cover multiple roles, but each responsibility needs exactly one
final owner. “Everyone owns QA” is useful only after one person owns the QA
process.

### Phase 0 — prove the product before expanding it

Spend two to three weeks establishing evidence and freezing scope.

1. Create a release candidate from the current game and record its boot time,
   frame-time distribution, memory growth, save size, crash/error rate, and run
   completion time on low-, mid-, and high-spec target machines.
2. Run 12–20 observed playtests with players who like action roguelites. Do not
   coach them. Record where they fail to understand goals, controls, damage,
   item choices, rooms, progression, and death consequences.
3. Define three product pillars, such as **responsive combat**, **wild but
   legible builds**, and **distinct heroes**. Every launch feature must support
   at least one pillar.
4. Inventory every mode, room, character, enemy, item, move, setting, and
   achievement. Label each `ship`, `repair`, `hide`, or `post-launch`.
5. Choose target operating systems and minimum hardware. A sensible first scope
   is Windows plus Linux/Steam Deck; add macOS only when the team owns its
   signing, notarization, and QA cost.
6. Turn findings into a severity-ranked backlog. Fixing the first ten minutes
   and the most common run-ending defects comes before adding content.

Exit gate: new players can state the goal, enter a run, use all four skills,
understand their first item choice, and explain death/progression without help.

### Phase 1 — build one premium-quality vertical slice

Polish the title flow, tutorial, first hero, first three floors, representative
special rooms, one challenge, and a boss to final quality. This slice defines
the production standard for the rest of the game.

- Combat inputs must buffer predictably, respect remapping, and show clear
  wind-up, active, hit, cooldown, and damage feedback.
- Enemy attacks need readable silhouettes, telegraphs, impact language, and
  consistent danger colors that still work without relying on color alone.
- Item choices must communicate the actual mechanical change. Generated text
  and behavior should share the same values or tests.
- The HUD should show only decisions needed during combat. Secondary systems
  belong in pause/inventory screens.
- Death should identify the cause, show the achieved progress, apply rewards
  once, and return the player to a meaningful next choice quickly.
- Music, ambience, SFX priority, hit feedback, controller rumble, screen shake,
  and accessibility reductions should feel like one authored system.
- Replace placeholder, inconsistent, or unreadable art only after the art lead
  establishes a palette, scale, outline, lighting, animation, and VFX guide.

Exit gate: the slice can be given to press or a paying customer without a
verbal disclaimer. If it is not compelling, revise the core before multiplying
the same issues across ten floors.

### Phase 2 — harden the software without rewriting the game

The right strategy is incremental isolation around `window.Neo`, not a new
engine. A ground-up rewrite would spend the budget rediscovering working combat
and content behavior.

#### Create explicit seams

Introduce small adapters for:

- `Platform`: app version, quit/restart, fullscreen, locale, user identity.
- `Persistence`: read/write/list/delete/export/import, with web and desktop
  implementations.
- `Achievements`: local achievements plus an optional Steam mirror.
- `Competitive`: seed, submission, leaderboard, and offline state.
- `Telemetry`: disabled-by-default event/crash reporting with a documented
  privacy policy.
- `Audio`, `Input`, and `Clock`: retain current implementations, but make their
  dependencies injectable in new code.

New gameplay modules should receive the state they need or export pure
functions. Existing global users can migrate only when touched. Freeze and
validate content definitions at startup so duplicate keys, missing icons,
invalid rarity/slot values, and broken character loadouts fail in development
instead of reaching customers.

#### Split by risk, not file size alone

Start with boundaries that prevent expensive regressions:

1. Save schemas and migrations.
2. Run lifecycle/reward application.
3. Content registries and balance calculations.
4. Competitive payloads.
5. Input actions and UI navigation.
6. Room generation and deterministic RNG streams.

Do not mechanically split a large file if the result is the same hidden global
coupling spread across more files.

#### Establish engineering controls

- Add linting, formatting, JSDoc types, and `tsc --checkJs` before considering a
  TypeScript conversion. Convert only modules where types remove real risk.
- Add a generated asset/content manifest and tests for every referenced file.
- Produce one version from source control and inject it into the title screen,
  save schema, Worker compatibility response, crash report, and package name.
- Use a release branch and immutable tagged builds; retain the prior depot/build
  for immediate rollback.
- Add CI jobs for checks, Jest, browser smoke, desktop packaging, and artifact
  checksums. A release must be reproducible from a clean checkout.

### Desktop packaging recommendation

Electron is the lowest-risk first desktop target because the game already
depends on Chromium behavior, Canvas, Web Audio, browser gamepads, and DOM UI.
Electron's documentation recommends packaging with Electron Forge. Use a local
custom protocol such as `app://`, since this project cannot run correctly from
`file://` and Electron also recommends avoiding `file://` for stronger security.
[Electron packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution)

The desktop shell should:

- package only local, versioned game assets;
- use `nodeIntegration: false`, `contextIsolation: true`, renderer sandboxing,
  strict navigation/window allowlists, and a narrow validated preload API;
- define a restrictive Content Security Policy and remove the need for inline
  `unsafe-inline` scripts/styles over time;
- disable the web service worker in desktop builds so an old cache cannot mask
  packaged files;
- store saves outside the install directory using the OS user-data location;
- make writes atomic (`temp` → flush → rename), retain rolling backups, and
  recover visibly instead of silently resetting progress;
- sign production executables/installers and test installation, upgrade,
  uninstall, and rollback on clean machines.

Keep Electron current and follow its full security checklist; a desktop wrapper
can access the filesystem and must not be treated like an ordinary browser tab.
[Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)

### Save and platform progression plan

Create a compact, human-inspectable `save.json` containing a schema version,
game version, checksum, meta progress, settings that should roam, achievements,
and run history. Keep an active run in a separate file so corruption or a crash
cannot destroy permanent progress. Machine-specific graphics/audio settings
should remain local.

On first desktop launch, offer an explicit import from a browser export; do not
scrape arbitrary browser data. Maintain a fixture corpus for every shipped save
version and test forward migration, unknown keys, partial writes, invalid JSON,
and downgrade behavior.

Steam Auto-Cloud can synchronize ordinary save files without direct Cloud API
code, but paths and quotas must be configured and cross-platform roots planned.
[Steam Cloud documentation](https://partner.steamgames.com/doc/features/cloud)

Mirror the existing local achievements to Steam through a narrow platform
adapter. Keep the local achievement system authoritative when offline and make
Steam calls idempotent. Steam achievement IDs must never be renamed after
release without a migration strategy.
[Steam Stats and Achievements](https://partner.steamgames.com/doc/features/achievements)

### Phase 3 — content, balance, and value

Once the vertical slice and platform foundation are stable, bring the remaining
content up to the same standard.

#### Campaign and replay structure

- Make floors 1–10 form an authored difficulty arc even when room layout is
  procedural: introduce mechanics, combine them, test mastery, then climax.
- Give each hero a clear strength, weakness, learning curve, and at least two
  viable build identities. Avoid a roster where one hero is a strict upgrade.
- Ensure item rarity changes possibility or play style, not just number size.
- Control build dilution: every item offered should be usable, understandable,
  and relevant often enough to deserve its slot in the pool.
- Balance around run data distributions, not the best internal player. Track
  damage taken by source, pick/win rate by item and hero, room deaths, economy,
  floor time, and abandoned runs in consenting test builds.
- Give the first clear win a satisfying ending and credits. Loops and alternate
  modes are replay value, not substitutes for an ending.

#### Fair premium progression

At $9.99, progression should reward mastery and discovery rather than pad
playtime. No paid currency, ads, daily chores, energy, or deliberately painful
grind. Unlocks should arrive often in early sessions, then become goal-driven.
Difficulty modes should describe what changes and preserve achievements fairly.

The team should choose a target value envelope from playtests, for example:

- a polished first run within minutes, not after settings/setup friction;
- a complete campaign with a satisfying ending;
- multiple viable heroes/builds for repeat runs;
- optional challenges, local co-op, seeded runs, and alternate modes that add
  depth after the core campaign.

Do not advertise a fixed number of hours until external playtest distributions
support it.

### Accessibility, input, and hardware gates

The current settings are a good base. A premium release should additionally
verify:

- full menu and gameplay operation with keyboard/mouse, controller, and touch
  wherever that platform is advertised;
- correct live prompt switching and no keyboard-only modal or text field;
- remapping conflict detection, reset defaults, and persistence per device;
- scalable HUD/text, readable pixel fonts, safe areas, 16:9/16:10/ultrawide,
  windowed/fullscreen, and high-DPI behavior;
- color-independent status/danger communication;
- independent screen shake, rumble, flashes, blood, particles, music, SFX, and
  dialogue controls;
- pause during single-player focus loss, with intentional local-co-op behavior;
- 30/60+ FPS modes with stable frame pacing and no simulation dependence on
  frame rate.

Request Steam Deck compatibility review when the candidate is stable. Valve's
criteria include controller operation, legibility, performance, launchers, and
platform behavior; the result is customer-visible.
[Steam hardware compatibility review](https://partner.steamgames.com/doc/steamhardware/compat)

### Testing strategy for a paid build

Keep the existing focused Jest suite, then add these layers:

1. **Pure unit tests:** damage, status, economy, rarity, scaling, RNG, migration,
   and content validators with no DOM/global extraction.
2. **Browser integration tests:** boot the actual `index.html`, start each mode,
   enter rooms, acquire/equip content, die, win, save, reload, and inspect
   console/network failures.
3. **Deterministic run tests:** fixed seeds assert generation invariants and
   record replayable input/event logs; avoid pixel-perfect snapshots for random
   effects.
4. **Packaged smoke tests:** install and launch the exact Windows/Linux artifact,
   verify user-data paths, offline start, controller, audio, save, upgrade, and
   uninstall behavior.
5. **Migration corpus:** load every historical and malformed save fixture and
   prove earned unlocks cannot disappear.
6. **Performance/soak:** repeated runs and two-hour sessions track frame-time,
   heap, audio nodes, timers, DOM nodes, and entity cleanup.
7. **Human matrix:** low-spec hardware, high refresh rate, multiple controller
   brands, Steam Deck, display scaling, audio-device loss, suspend/resume, and
   network loss.

Release with zero known crash/save-loss/blocker issues. Lower-severity issues
need an owner, reproducible case, documented customer impact, and explicit
ship/defer decision.

### Competitive mode decision

A local JavaScript client can always be modified, so a globally trusted
leaderboard is a separate product/security project. Choose one honest model:

- **Friendly board:** clearly label it as community competition, bind entries to
  a platform identity, prevent duplicates/spam, moderate names, and accept that
  determined cheating is possible.
- **Verified board:** upload a compact deterministic replay/event log and build
  version, re-simulate or validate it server-side, reject unsupported mods, and
  retain audit data. This requires strict deterministic simulation and ongoing
  backend operations.
- **Local/friends only:** remove the public integrity claim and make seeded runs
  shareable without maintaining a global ranking.

At minimum, add bounded KV retention, per-account limits, profanity/moderation
tools, schema/build versions, shared roster validation, abuse monitoring, and a
privacy/retention policy. IP-only in-memory rate limiting is not a durable abuse
control.

### Storefront and launch preparation

Do Steam onboarding early. Steam Direct currently charges $100 per app, has a
30-day waiting period after paying the fee, and requires a public Coming Soon
page for at least two weeks. The fee is recoupable after $1,000 adjusted gross
revenue.
[Steam Direct](https://partner.steamgames.com/steamdirect/)

An expert team should still put the Coming Soon page live months—not merely two
weeks—before launch so wishlists, playtests, and messaging can mature. Prepare:

- a final logo and key art that remain readable at small capsule sizes;
- truthful gameplay-only screenshots and a short trailer that shows combat in
  its first seconds;
- a one-sentence hook, concise description, feature list, system requirements,
  supported languages, controller/local-co-op declarations, and accessibility
  notes that match the build exactly;
- Steam library art, achievement icons, app/shortcut icons, press kit, creator
  build, support email/page, privacy policy, credits, and third-party licenses;
- a polished demo only if it represents final quality and ends on a strong
  desire to continue. A demo can use a separate linked Steam App ID.

Use Valve's current templates rather than copying old dimensions from a blog;
Steam requires several store and library capsules plus 16:9 gameplay
screenshots.
[Steam graphical assets](https://partner.steamgames.com/doc/store/assets)

Submit a near-final store page and build early. Valve says reviews typically
take 3–5 business days and asks developers to allow at least seven business
days for each, including time for required changes.
[Steam review process](https://partner.steamgames.com/doc/store/review_process)

Keep the base price at $9.99 only if blinded playtests consistently say the
game feels complete and the store promise matches the experience. Use Steam's
regional pricing tools and research instead of hand-converting USD. Do not use
the price to compensate for unclear scope.

### Legal, privacy, and support

Before accepting money:

- document ownership or commercial licenses for every sprite, `.ase` source,
  font, sound, music track, photo, logo, and third-party code dependency;
- replace any asset whose commercial rights are ambiguous;
- make credits accurate and accessible from the main menu;
- decide whether names, birthdays, IP addresses, crash reports, run histories,
  and leaderboard data are necessary; collect less, disclose it, secure it,
  define retention/deletion, and obtain qualified legal review;
- add a support contact, known-issues process, refund/support response policy,
  save-location documentation, and a way for users to export diagnostics
  without exposing private data.

### Priority backlog

**P0 — required to charge money**

- Freeze the 1.0 product promise and cut list.
- Fix crash, soft-lock, save-loss, duplicate-reward, and input-trap defects.
- Complete a premium vertical slice and external playtest loop.
- Build signed desktop artifacts and robust versioned disk saves.
- Make all advertised modes work offline unless explicitly marked online.
- Achieve full controller navigation and target-hardware performance.
- Synchronize content/roster/save/backend contracts.
- Complete rights, credits, privacy, storefront, support, and release tooling.
- Replace `Beta 2.0` with one generated release version only when all gates pass.

**P1 — high-value launch features**

- Steam Cloud and mirrored Steam achievements.
- Steam Deck review readiness.
- A polished demo and browser-to-desktop save import.
- Localization infrastructure and one or more fully QA'd translations based on
  audience evidence.
- Friendly leaderboard hardening or verified replay design.
- Post-launch crash/feedback pipeline and staged patch channel.

**P2 — defer unless it is central to the promise**

- Online co-op, Workshop/mod support, cross-platform accounts, DLC, large new
  modes, more heroes, or an engine rewrite.

These can each consume the schedule of the base game. Ship a coherent 1.0
before creating a service burden.

### Final release gates

The product is ready to sell only when all of these are true:

- The first 30 minutes and complete campaign have passed repeated blind tests.
- Every store claim is present in the candidate build.
- No known P0/P1 defect can crash, block progress, lose saves, mis-award
  progression, or trap an input method.
- Old and corrupt saves recover without silent loss; cloud conflict behavior is
  tested.
- Every built-in hero can start, finish, save, resume, die, win, unlock
  achievements, and submit any supported competitive result.
- All advertised inputs, resolutions, OSes, offline behavior, suspend/resume,
  and local co-op combinations pass the release matrix.
- Frame-time and memory stay within the measured target during representative
  and soak runs.
- Installers are signed, versioned, reproducible, scanned, and tested from a
  clean machine; rollback is rehearsed.
- Credits/licenses, privacy, support, storefront assets, trailer, screenshots,
  localization, and platform declarations are final.
- At least one release candidate has spent a full week in an external beta
  without a newly discovered blocker.
- The team has a day-one monitoring owner, hotfix process, patch notes, and a
  sustainable post-launch plan.

The commercial goal should be: **make the existing game feel authored,
trustworthy, and complete**. More content is useful only after that is true.

## Run, verify, and ship

```sh
npm install
npm start                 # http://localhost:5173
npm test
npm run build             # writes deployable static assets to dist/
```

- Do not use `file://`; modules, the engine bridge, and service worker need
  HTTP(S).
- `npm install` installs a tracked pre-commit hook which runs `npm test`.
- The test runner tries the Worker endpoints at `http://localhost:8787/api`
  for informational output, then still runs Jest if they are unavailable.
- `npm run build` copies static files; it does not transpile or bundle them.
- Deploy from the repository root, where `wrangler.toml` points at
  `server/server.js` and `dist/`.

## Frontend boot sequence and architecture

`index.html` is both the page shell and a substantial UI template. It loads,
in the required order:

1. `Koz_Engine_Lib/Core/koz-engine.global.js`, which exposes engine APIs under
   `window.KozEngine`.
2. Sprite definition scripts under `assets/sprites/`, which create
   `window.NeoNykeSpriteDefs`, `window.NeoNykeEnvironmentTileDefs`, and
   `window.NeoNykeIconDefs`.
3. Supporting classic scripts (achievements, data adapter, touch/gamepad,
   `js/core/neo.js`). `neo.js` creates the shared mutable `window.Neo` object.
4. `js/main.js`, the ES-module entry point. Its imports establish dependency
   order for game logic, rendering, and UI modules.
5. Settings, menu-background, and credits classic scripts.

Do not casually reorder these scripts or turn only part of the project into
imports: many modules depend on globals created earlier in the sequence.
`js/main.js` is the best quick map of module load order.

The game renders through the main `<canvas id="c">` while HTML overlays handle
menus, panels, settings, tutorial, notifications, and touch controls. Canvas
coordinates and core constants start in `js/core/game-core.js`; the main shared
state object begins in `js/core/neo.js`.

### Important shared contracts

- `window.Neo` is the live runtime namespace. Modules import constants and
  helpers where practical, but also read/write `Neo` for players, entities,
  run state, UI handles, content registries, and callbacks.
- `window.KozEngine` is the transitional engine bridge, not a stable package
  API. Its source is `Koz_Engine_Lib/Core/koz-engine.global.js`.
- `window.NeoSettings`, `window.NeoTouch`, and `window.NeoGamepad` are created
  by their respective input/settings scripts and are used throughout gameplay.
- DOM IDs and `data-*` attributes in `index.html` are queried directly from
  UI modules. Renaming or removing markup requires updating every matching
  selector and usually its CSS and tests.
- Sprite and icon keys are data contracts. A new character, item, move, or
  weapon usually needs both a definition in game data and a matching entry in
  `assets/sprites/combatants.js` or `assets/sprites/icons.js`.

## Where to edit common things

| Change | Primary files | Also check |
| --- | --- | --- |
| Core constants, character definitions, scaling, challenges | `js/core/game-core.js` | `js/core/neo.js`, related gameplay and tests |
| Moves, weapons, relics/items, pools, upgrade stats | `js/ui/input.js` | icon definitions, shops, effects, saved-key migration |
| Player state, rewards, equipment, item effects | `js/game/player.js` | `js/game/combat.js`, `js/game/hud.js`, panels |
| Enemy definitions, AI, scaling, bosses | `js/game/enemies.js` | `js/game/combat.js`, rendering, focused tests |
| Combat, collision, projectiles, status effects | `js/game/combat.js`, `js/game/projectile-types.js`, `js/core/status.js` | `js/core/math-utils.js`, enemies/player |
| Floor generation and normal rooms | `js/game/rooms.js`, `js/game/roomTemplates.js` | minimap and room tests |
| Special-room services | `js/game/specialRooms.js` | `js/game/rooms.js`, HUD/props, `tests/special-rooms.test.js` |
| Run lifecycle, meta progress, save/load, leaderboard client | `js/core/game-state.js`, `js/core/save-store.js` | migrations and save-preservation tests |
| Keyboard/mouse input | `js/ui/input.js` | `js/core/update.js`, `js/gamepadControls.js`, `js/touchControls.js` |
| HTML panels and inventory/shop/anvil behavior | `index.html`, `js/ui/panels.js`, `js/ui/controller.js` | `css/style.css`, `css/panel-borders.css` |
| Settings/accessibility/control remapping | `js/ui/settings-ui.js` | settings markup and input consumers |
| Canvas rendering | `js/draw/` | `js/game/world.js`, `js/core/perf.js` |
| HUD data/behavior | `js/game/hud.js`, `js/draw/hud.js` | relevant elements in `index.html` |
| Tutorial | `js/tutorial/scenes.js`, `js/ui/tutorial-controller.js`, `css/tutorial.css` | `js/tutorial/README.md` |
| Music and one-shot sound | `js/core/music.js`, `js/core/sfx.js` | `assets/sounds/`, settings/audio tests |
| Menu and credits | `js/ui/menu-background.js`, `js/ui/credits.js` | matching `index.html` sections and CSS |
| Mobile layout/touch UI | `css/mobile.css`, `css/touch-controls.css`, `js/touchControls.js` | viewport and touch settings |

## Content-editing checklist

For a new or renamed content key (character, relic, move, weapon, room,
challenge), search the whole repository for the existing key first. Content is
intentionally cross-wired: definitions are only one part of the change.

Typical follow-up work includes:

1. Add/adjust the canonical definition and pools/eligibility rules.
2. Add icon/sprite data and any draw code or fallback behavior.
3. Wire acquisition, effects, shop/anvil/inventory presentation, and text.
4. Preserve old saved keys with a migration/normalization path in
   `js/core/game-state.js`; do not silently filter earned content away.
5. Add or update a focused Jest test under `tests/`.
6. Manually verify the relevant menu/panel and an actual run on desktop; verify
   mobile/controller behavior when input or UI placement changed.

The roster source of truth is `CHARACTER_DEFS` in `js/core/game-core.js`.
Player-facing documentation can become stale, so prefer source over README
claims when editing available characters or systems.

## Persistence and compatibility

Progress is local-first. `js/core/save-store.js` provides the save abstraction;
the app uses `neonyke:`-prefixed local storage plus IndexedDB through
`js/dataAdapter.js` (stores `saves` and `achievements`). Settings have their
own local-storage state. The settings UI can export, import, and erase the
player's data.

Treat saves as a compatibility surface:

- Keep normalizers and migration helpers in `js/core/game-state.js` when keys
  change or structures evolve.
- Retain unknown/legacy unlock keys when possible. Existing code deliberately
  avoids dropping earned content simply because a current registry changed.
- Test that adding content does not change existing unlocks; see
  `tests/add-character-unlock-safety.test.js` and
  `tests/save-unlock-preservation.test.js`.
- Avoid putting ephemeral render state, DOM nodes, functions, audio objects, or
  timers into persistent snapshots.

## Assets, CSS, and offline behavior

`assets/` contains pixel sprites, fonts, sound effects, music, and app icons.
The JavaScript sprite definition files are source data, while `.ase` files are
editable art sources and `.png` files are runtime assets.

CSS is deliberately split by concern:

- `css/style.css`: shared desktop/base game UI
- `css/theme-princess.css`: character/theme overrides
- `css/mobile.css`: responsive layout
- `css/touch-controls.css`: touch UI
- `css/panel-borders.css`: panel decoration
- `css/tutorial.css`: tutorial presentation

The PWA service worker is `sw.js`. When adding a boot-critical asset or script,
add it to `PRECACHE` as appropriate and bump `CACHE_VERSION`; otherwise users
with a prior install may not receive the change promptly. `manifest.json` and
the icon links in `index.html` must remain consistent for installability.

## Koz Engine library

`Koz_Engine_Lib/` is a work-in-progress engine extraction, not an isolated
dependency. Most files are CommonJS-friendly for tests and are exposed in the
browser by the bridge. Before moving game code into it, read:

- `Koz_Engine_Lib/README.md`
- `Koz_Engine_Lib/docs/new-user-guide.md`
- `Koz_Engine_Lib/docs/module-catalog.md`

The intended boundary is one-way: game code may depend on the engine, while
engine code should not depend on Neo Nyke globals, game content, DOM wiring, or
specific screens. Some existing modules still violate the target boundary; do
not use their presence as precedent for new coupling.

## Backend and deployment

`server/server.js` is a Cloudflare Worker. It handles CORS, lightweight
per-isolate rate limiting, weekly seed creation/reset, leaderboard validation,
notices, and health/version responses. The active routes are served with or
without the `/api` prefix and include `/health`, `/server-info-testing`,
`/version`, `/notices`, `/seed`, and `/leaderboard` (GET/POST).

- `wrangler.toml` is the active root configuration and declares `STORE` KV.
- Keep Worker payload validation aligned with the client submission code in
  `js/core/game-state.js`.
- Do not commit a replacement KV namespace ID without deliberate deployment
  coordination.
- `server/package.json` is for Worker development/deployment; root scripts are
  the usual project entry point.

## Tests and review expectations

Tests live in `tests/` and run with Jest. They commonly inspect real source,
extract focused functions, or assert source-level integration contracts rather
than booting the entire game. Follow the nearby test style and name a new test
after the feature/bug it protects.

Before handing off an edit:

1. Run the smallest relevant test, then `npm test` for behavior changes.
2. Run `npm run build` for changes that affect what ships.
3. Load the game over HTTP and check the changed UI/run flow for console errors.
4. If an offline-critical file changed, verify the service-worker update path.
5. Keep unrelated existing worktree changes untouched.

## Practical cautions

- The repository is large and several gameplay files are intentionally long;
  search by the content key or exported function instead of rewriting broad
  areas.
- Existing comments often document balance rationale. Preserve or update them
  when changing numeric progression values.
- Right-click is gameplay input and native context menus are intentionally
  blocked in `index.html`; do not remove that behavior without auditing input.
- Maintain 2D canvas pixel-art conventions (`imageSmoothingEnabled = false`) and
  test UI changes at multiple viewport sizes.
- `game.html` is only a redirect to `index.html`; edit `index.html` for the
  actual application.
