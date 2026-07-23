# Neo Nyke multiplayer architecture

Status: playable authoritative network-run slice. Cloudflare rooms now support 2–4 player Co-op Expedition and Rival Expedition rules, independent occupied-room simulation, ten deterministic floors, group-gated co-op floor exits, bosses and terminal victory/defeat, down/revive, Rival PvP/respawn, shared combat XP/levels, seeded relic chests with server-validated choices, reliable floor transitions, background-tab heartbeats, and 30-minute reconnect/empty-room grace periods. Full legacy item/shop/forge parity, authored per-boss scripting, production deployment, Electron, and Steamworks are not implemented yet.

## Required layering

```text
Rendering / UI / device input
             │ input commands + presentation events
Shared GameSimulation + serializable GameState
             │ protocol v1 messages
Session / authority
             │ generic identity + delivery intent
NetworkTransport
     ┌───────┼──────────────┬──────────────────────────┐
 Offline  LocalLoopback  CloudflareWebSocket       Steam (later)
```

The simulation and protocol layers may not import DOM, Canvas, Web Audio, Electron, Steamworks, WebSocket, or Worker APIs. Transports carry validated protocol envelopes. They never decide combat and never accept client-authored outcomes.

Only authority and transport change by mode:

- Single-player: local browser authority plus `OfflineTransport`.
- Browser multiplayer: Cloudflare Durable Object authority plus WebSockets.
- Initial Steam multiplayer: the same Cloudflare Durable Object authority and WebSocket gameplay transport; Steam adds identity, lobbies, friends, and invitations.
- Optional later Steam networking: `SteamTransport` may be evaluated only after the Cloudflare-backed Steam version works.

## Player-facing mode boundary and feature flag

The main menu always shows distinct `SINGLE PLAYER` and `MULTIPLAYER` buttons. Networking remains disabled by default in production through `js/config/FeatureFlags.js`. Localhost enables the development room controls automatically; opening the panel alone still does not create a session or WebSocket.

The supported local room workflow is:

```text
npm run multiplayer:dev
open http://127.0.0.1:8787 in two browser windows
Multiplayer → choose Co-op or Rival → Create Room / Join Room → Ready
```

To opt into the same development flag on another explicitly trusted development origin, use the browser console:

```js
developer_mode = true;
NeoNyke.features.setDevelopmentFlag('multiplayer', true);
```

Create Room and Join Room are active only when that flag is enabled. Create calls the Worker room route and then connects; Join validates a short code and connects to the same Durable Object. The existing same-device `coop` and `pvp` modes remain labeled Local Play and are not network multiplayer.

## Foundation modules

- `js/simulation/GameState.js`: versioned JSON-safe authority state, ID-keyed entity maps, and stable monotonic entity ID allocation.
- `js/simulation/RandomService.js`: explicit deterministic streams for floor generation, enemy spawning, loot, shops, combat variance, and boss patterns, including serializable stream state.
- `js/simulation/DeterministicFloorGenerator.js`: a pure seeded floor-layout proof. It is not yet a replacement for the content-rich legacy generator.
- `js/simulation/NetworkCombatSystem.js`: headless seeded room encounters, enemy chase AI, player projectile attacks, contact damage, death, room clear, one-time drops, and pickup currency.
- `js/simulation/SharedCombatContent.js`: canonical weapon stats and default primary-attack behavior shared by offline play and authority.
- `js/simulation/SharedMoveContent.js`: all 47 authored move IDs/base stats, slots, hero defaults, and alternate kits.
- `js/simulation/SharedEnemyContent.js`: all 13 standard enemies, 7 bosses, special opponents, elite powers, base stats, roles, and boss pattern names.
- `js/simulation/GameSimulation.js`: headless `updateGame(inputs, fixedDelta)` boundary. Systems receive `{state, inputs, fixedDelta, random}` and cannot reach browser globals.
- `js/simulation/FixedTickRunner.js`: initial 20 Hz accumulator shared by browser runtime and headless tests.
- `js/multiplayer/NetworkTransport.js`: platform-neutral lifecycle, identity, message, peer, and delivery-intent contract.
- `js/multiplayer/OfflineTransport.js`: asynchronous same-process delivery with no network dependency.
- `js/multiplayer/OfflineGameSession.js`: creates the local single-player session and its serializable local authority state.
- `js/multiplayer/LocalLoopbackTransport.js`: deterministic latency, jitter, packet-loss, duplicate, and disconnect simulation for local proof tests.
- `js/multiplayer/CloudflareWebSocketTransport.js`: browser HTTP room operations plus a protocol-envelope WebSocket connection to the room authority.
- `js/multiplayer/BrowserMultiplayerSession.js`: UI-facing create/join/ready/input session facade using the shared multiplayer client.
- `js/rendering/NetworkGameView.js`: browser-only presentation adapter and input sampler. It reuses the campaign floor, decoration, enemy, pickup, player, projectile, particle, audio, minimap, HUD, and camera seams while applying prediction/reconciliation and remote interpolation. It never runs in the Durable Object or offline authority.
- `js/protocol/ProtocolV1.js`: runtime message definitions and validation shared by every transport.

These files use a small universal wrapper because Neo Nyke has no bundler: the browser registers APIs under `globalThis.NeoNyke`, while Jest and future Worker tests can `require()` the same sources.

## Current transitional boundary

The browser's legacy `Neo` runtime still owns most production gameplay objects and several gameplay functions still read browser input or emit presentation effects directly. The new `GameSimulation` is genuinely headless and tested. It drives seeded rooms, movement/traversal, every hero's default primary plus equipped laser/smash/dash actions, the full enemy data catalog, generic authority behavior roles, damage/death, drops, and currency. Unique enemy/boss scripts, charge/hold/release nuances for every move, inventory/progression, and the complete campaign still need extraction.

Offline runs now create an `OfflineGameSession`, and its serializable authority clock advances on the same 20 Hz fixed steps as the legacy local authority. This preserves the playable game while systems are extracted incrementally. It must not be represented as full campaign extraction yet.

Extraction order is static floor data, player command/movement, collision, enemy AI, projectiles/combat, items/shops/upgrades, floor transitions, bosses, and run completion. Presentation effects, audio, DOM, saving, and leaderboards consume emitted events outside authority.

## Authority pipeline

The common match authority will perform:

```text
receive validated input
→ authenticate sender and ownership
→ order/deduplicate by input sequence
→ select inputs for the next 20 Hz tick
→ updateGame(authoritativeState, inputs, 1/20)
→ emit reliable gameplay events
→ publish 10–20 snapshots per second
```

Authority owns player legality, positions, enemy AI, collisions, attacks, damage, death/revive, projectiles, drops, item ownership, shops/currency, upgrades, floor transitions, bosses, and run completion. Clients own device sampling, local presentation, prediction history, interpolation buffers, audio, visual-only particles, menus, and accessibility settings.

All gameplay entities receive stable IDs. Decorative particles do not. A client sends intent such as movement or attack aim; it never sends damage, currency, pickup success, random outcomes, or floor completion.

Ability activation follows the same boundary. For example, Crimson Smash sends only the equipped move ID and aim direction. The authority validates the slot/cooldown, resolves the AOE at a fixed origin, applies hits, and creates eight rock projectile entities with authoritative positions, velocities, damage, pierce count, and expiry ticks. The reliable `PLAYER_ABILITY_USED` event gives every client the resolved presentation key/origin/radius and initial projectile trajectories; subsequent snapshots reconcile the rock entities. Clients render the shockwave and rock art but never report rock behavior or hits back to the authority.

The sending client does not start a combat animation merely because its button was pressed. Accepted `PLAYER_ATTACKED` and `PLAYER_ABILITY_USED` events puppet the campaign character renderer and presentation hooks on every observing client, including the sender. Rejected, unequipped, downed, or cooldown-blocked commands therefore produce no false local cast. Movement may be predicted for responsiveness, but predicted position is presentation-only and is continuously reconciled to authority snapshots.

All 47 authored moves have a headless-safe shared presentation definition (`kind`, campaign colour, impact style, and sound). The authority chooses the definition after validating the equipped slot and includes only the resolved key/kind/style in its event; clients with the matching content hash replay it through the campaign shockwave, particle, player, projectile, world-prop, and structure render passes. Default weapon sweeps, double-swipes, smites, volleys, beams, crosses, AOEs, supports, summons, statuses, shields, warps, and dashes therefore use one accepted event and one presentation vocabulary across every peer.

Long-lived move effects are authority entities rather than client timers. Healing Zone, Fire Circle, Floor Is Lava, Chaos Burst, Holy Turrets, and Lightning Columns synchronize their owner/room, campaign hazard kind, position/radius, pulse schedule, targets, damage/healing, and expiry. The browser maps those records back into `Neo.hazards`, so single-player and multiplayer use the same world-prop art while the server alone applies their mechanics. Server status timers also drive Zoomies/Turtle Power-Up movement, flight/Coward/Potion invulnerability, Hammer Smash stun, fire, poison, bleed, freeze, and the corresponding campaign status visuals.

There is no separate multiplayer world renderer when the campaign renderer is available. `NetworkGameView` hydrates authoritative players, enemies, projectiles, pickups, interactables, hazards, statuses, rooms, and animation clocks into the campaign presentation model, then calls the same `drawWorldViewport` used by single-player. `drawWorldViewport` obtains server-backed player slots while a network view is active; otherwise its single-player behavior is unchanged. The fallback drawing code exists only for headless/minimal test environments without the campaign renderer.

## Transport contract

The current generic contract is:

```js
initialize()
createSession(options)
joinSession(sessionId)
leaveSession()
send(peerId, message, deliveryOptions)
broadcast(message, deliveryOptions)
onMessage(handler)
onPeerConnected(handler)
onPeerDisconnected(handler)
getLocalIdentity()
dispose()
```

Generic identity is `{provider: "guest" | "account" | "steam", id, displayName}`. Common game code does not interpret Steam IDs, native handles, auth tickets, or Cloudflare bindings.

Planned transports:

| Transport | Role |
| --- | --- |
| `OfflineTransport` | Offline single-player through the common session seam. |
| `LocalLoopbackTransport` | One local authority and multiple protocol clients with fault injection. |
| `CloudflareWebSocketTransport` | Browser or Electron renderer client to a room Durable Object. |
| `SteamTransport` | Optional later gameplay transport; not required for the first Steam release. |

## Cloudflare browser multiplayer

```text
Cloudflare Worker
        │ POST/GET room routes + WebSocket upgrade
        ▼
Durable Object selected by room ID
        ├── WebSocket → player 1
        ├── WebSocket → player 2
        ├── WebSocket → player 3
        └── WebSocket → player 4
```

The Worker implements room creation/lookup/socket routing. One Durable Object currently owns membership, ready state, input queues, authoritative `GameState`, 20 Hz simulation ticks, and snapshots. It is an authority, not a relay: clients submit normalized input and never positions. Reconnect reservations and complete-run lifecycle state are still future milestones.

Implemented routes are:

```text
POST /api/multiplayer/rooms
GET  /api/multiplayer/rooms/:code
GET  /api/multiplayer/rooms/:code/socket
```

Lobby hosts can copy a same-origin invite URL in the form `?join=:code`. Opening a valid invite URL brings up the multiplayer flow and joins that authoritative room automatically. Join from Clipboard accepts either that URL or a plain room code; malformed and ambiguous room codes are ignored client-side.

D1 may store match history and leaderboard metadata. Queues may process post-match analytics. R2 may store replays/diagnostics. None of D1, Queues, or R2 may carry live movement or combat.

The room uses the Durable Object WebSocket Hibernation API. Lobby and empty rooms keep no simulation interval, so the object can be evicted while accepted sockets stay connected; a 20 Hz interval exists only while a match is running and at least one peer is present. Serializable socket attachments plus the persisted authority/runtime checkpoint rebuild peer ownership, input sequencing, reconnect reservations, and simulation state after a cold wake. Empty rooms receive a cleanup alarm and expire after ten minutes.

Cost controls deliberately separate hot simulation from persistence and delivery. A running room checkpoints at most every 15 seconds, plus forced checkpoints at lifecycle/floor/save-revision boundaries; unchanged waiting ticks never write. Input changes are sent immediately, but unchanged controls use a 250 ms heartbeat and aim-only changes are capped at 10 Hz. Snapshots send entity deltas between periodic full corrections, and each broadcast envelope is serialized once before being fanned out to sockets. These controls reduce billed active duration, incoming WebSocket messages, storage row writes, and per-peer JSON work without lowering the 20 Hz authority tick.

## Determinism, snapshots, and responsiveness

- Authority simulation begins at 20 Hz (`1/20` second); increase toward 30 only after profiling.
- Initial snapshots target 10 Hz and may be tuned within 10–20 Hz.
- Normal play and all four network clients resolve normalized first-person movement through the same camera-relative movement rule before prediction or authority submission.
- Match metadata includes `matchSeed`, `floorSeed`, `generationVersion`, and `contentVersion`.
- Static geometry may be regenerated locally only after compatibility validation. Dynamic outcomes always come from authority.
- Named RNG streams prevent a loot draw from changing floor topology or boss patterns.
- Snapshot acknowledgements drive local prediction reconciliation.
- Remote players and enemies render from a buffered interpolation window, initially about 80–120 ms.
- Floor entry, respawn, spawn, movement-mode change, and large correction teleport rather than interpolate.

The implementation target is immediate local input response and low perceived latency, not literal zero latency. Debug UI will expose round-trip time, jitter, correction rate, snapshot rate/size, bandwidth, and authority tick overruns.

## Co-op lifecycle and safety

Initial co-op supports 2–4 players. Room location is per player: one player crossing a door never teleports the party. `player.roomId` selects that client's camera/presentation while `floorState.encounters[roomId]` retains the shared authoritative enemies, drops, clear state, and other room outcomes. Every occupied room simulates concurrently; a later visitor receives its current shared state. Discovered room IDs are currently shared on the party minimap. Suggested rules remain configurable: personal gold, shared XP, no friendly fire, no player collision, revive enabled, and an explicit co-op rule for final floor advancement.

When a player is downed, their camera follows a living teammate by default. The spectator strip can select any connected player, including another downed player or the local player's fallen body/location, and clicking the dungeon cycles targets. Down, revive, and respawn notices are party-wide even when teammates occupy different rooms. A party wipe or completed expedition opens synchronized run results; Play Again is a rematch-ready vote and recreates the authoritative simulation in the existing room after every connected player agrees.

Pressing T opens authority-routed party chat. Messages are sanitized, limited to 180 characters, rate-limited by the authority, and attributed from server-owned player identity rather than client-supplied names. Opening chat releases gameplay input and pointer lock until the form closes.

The normal multiplayer screen uses the campaign HUD rather than a separate always-on debug HUD. Escape opens a local multiplayer menu (the authority keeps running) with Resume, Info, Settings, and Leave Server. Network diagnostics will return as an opt-in debug overlay rather than replacing gameplay presentation.

Upgrade choices never globally pause multiplayer. Treasure chests publish a personal authoritative choice in player state; the receiving player selects with 1–3 while every occupied room continues simulating. Offline single-player retains its current pause behavior.

Reconnect reservations initially last 30–60 seconds and bind to authenticated session identity, never only to a client-provided player ID. Authority validates protocol/build/generation/content version, message size/type/rate, sender/room membership, sequence, movement limits, cooldowns, interaction range, item eligibility, and currency transitions. Repeatedly invalid clients are rate-limited and disconnected.

## Electron and Steam boundary

Electron begins only after a Cloudflare browser match completes a full run. The first Electron package must continue using `CloudflareWebSocketTransport`. Its renderer receives a narrow preload API with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`; it never receives `require`, raw IPC, arbitrary filesystem APIs, or the complete Steam native module.

The first Steam milestone adds identity, overlay, lobbies, friends, invitations, join-from-invite handling, and build compatibility. Lobby metadata points invited players to the already-created Cloudflare room. Steam publisher credentials never enter browser or Electron renderer code.

Steam Networking Sockets/SDR is a later alternate transport only. It would change authority to a player host and introduce host migration, cheating, quality, and reconnect risks, so it is outside the initial Steam release path.

## Current milestone and next gate

Milestones A–D now have a playable network-run proof: room creation/joining, selectable Co-op/Rival rules, hero choice, ready state, 2–4 authoritative players, seeded multi-floor encounters, campaign-parity door rules (ordinary combat is escapable while challenge/boss commitments lock), players splitting across persistent rooms, complete input slots, server combat/PvP, shared XP and automatic levels, exactly-once coins and relic claims, authored campaign chest/ladder presentation, party-gated stairs, down/revive or Rival respawn, run results, campaign presentation reuse, prediction/interpolation, and reconnect recovery. Automated tests cover catalog completeness, protocol validation, progression races, floor consensus, fault-injected convergence, PvP, and reconnect identity continuity.

The next gate is content fidelity and operations: port each move's hold/charge/channel rules and each catalog enemy's authored AI script; extract the full legacy relic, shop, forge, structure, hazard, challenge, and boss systems; then load-test CPU, bandwidth, snapshot size, hibernation wake/reconnect, storage cadence, and abuse limits. The current run lifecycle is real, but it must not be represented as complete legacy-campaign parity until those ports land. Electron and Steam remain out of scope until the Cloudflare run survives that gate.
