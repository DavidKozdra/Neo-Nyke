# Neo Nyke multiplayer architecture

Status: playable local Cloudflare exploration vertical slice. Room routes, a room-authoritative Durable Object, browser WebSockets, authority-validated character selection, two-client ready state, a shared deterministic floor layout, seeded door traversal, party room transitions, real character rendering, normal movement controls, local prediction, remote interpolation, and synchronized headless movement are implemented. Enemies/combat and the complete campaign, production deployment, reconnect, Electron, and Steamworks are not implemented yet.

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
Multiplayer → Create Room / Join Room → Ready
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
- `js/simulation/GameSimulation.js`: headless `updateGame(inputs, fixedDelta)` boundary. Systems receive `{state, inputs, fixedDelta, random}` and cannot reach browser globals.
- `js/simulation/FixedTickRunner.js`: initial 20 Hz accumulator shared by browser runtime and headless tests.
- `js/multiplayer/NetworkTransport.js`: platform-neutral lifecycle, identity, message, peer, and delivery-intent contract.
- `js/multiplayer/OfflineTransport.js`: asynchronous same-process delivery with no network dependency.
- `js/multiplayer/OfflineGameSession.js`: creates the local single-player session and its serializable local authority state.
- `js/multiplayer/LocalLoopbackTransport.js`: deterministic latency, jitter, packet-loss, duplicate, and disconnect simulation for local proof tests.
- `js/multiplayer/CloudflareWebSocketTransport.js`: browser HTTP room operations plus a protocol-envelope WebSocket connection to the room authority.
- `js/multiplayer/BrowserMultiplayerSession.js`: UI-facing create/join/ready/input session facade using the shared multiplayer client.
- `js/rendering/NetworkGameView.js`: browser-only multiplayer canvas renderer, input sampling, basic prediction/reconciliation, and remote interpolation. It never runs in the Durable Object or offline authority.
- `js/protocol/ProtocolV1.js`: runtime message definitions and validation shared by every transport.

These files use a small universal wrapper because Neo Nyke has no bundler: the browser registers APIs under `globalThis.NeoNyke`, while Jest and future Worker tests can `require()` the same sources.

## Current transitional boundary

The browser's legacy `Neo` runtime still owns most production gameplay objects and several gameplay functions still read browser input or emit presentation effects directly. The new `GameSimulation` is genuinely headless and tested. It now drives a playable shared start chamber and deterministic floor map, but not yet enemies, room traversal, combat, items, or the complete campaign.

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

D1 may store match history and leaderboard metadata. Queues may process post-match analytics. R2 may store replays/diagnostics. None of D1, Queues, or R2 may carry live movement or combat.

The development authority currently uses the standard Durable Object WebSocket API and an active interval because its 20 Hz simulation must remain awake. Hibernation, alarm-based lifecycle work, reconnect persistence, production deployment, and measured CPU/bandwidth tuning remain separate follow-up work.

## Determinism, snapshots, and responsiveness

- Authority simulation begins at 20 Hz (`1/20` second); increase toward 30 only after profiling.
- Initial snapshots target 10 Hz and may be tuned within 10–20 Hz.
- Match metadata includes `matchSeed`, `floorSeed`, `generationVersion`, and `contentVersion`.
- Static geometry may be regenerated locally only after compatibility validation. Dynamic outcomes always come from authority.
- Named RNG streams prevent a loot draw from changing floor topology or boss patterns.
- Snapshot acknowledgements drive local prediction reconciliation.
- Remote players and enemies render from a buffered interpolation window, initially about 80–120 ms.
- Floor entry, respawn, spawn, movement-mode change, and large correction teleport rather than interpolate.

The implementation target is immediate local input response and low perceived latency, not literal zero latency. Debug UI will expose round-trip time, jitter, correction rate, snapshot rate/size, bandwidth, and authority tick overruns.

## Co-op lifecycle and safety

Initial co-op supports 2–4 players. Suggested rules remain configurable: personal gold, shared XP, no friendly fire, no player collision, revive enabled, and all living players at the exit to advance.

Upgrade and Scroll choices cannot globally pause active multiplayer combat. Initial multiplayer choices should occur in an inter-floor safe state. Offline single-player retains its current pause behavior.

Reconnect reservations initially last 30–60 seconds and bind to authenticated session identity, never only to a client-provided player ID. Authority validates protocol/build/generation/content version, message size/type/rate, sender/room membership, sequence, movement limits, cooldowns, interaction range, item eligibility, and currency transitions. Repeatedly invalid clients are rate-limited and disconnected.

## Electron and Steam boundary

Electron begins only after a Cloudflare browser match completes a full run. The first Electron package must continue using `CloudflareWebSocketTransport`. Its renderer receives a narrow preload API with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`; it never receives `require`, raw IPC, arbitrary filesystem APIs, or the complete Steam native module.

The first Steam milestone adds identity, overlay, lobbies, friends, invitations, join-from-invite handling, and build compatibility. Lobby metadata points invited players to the already-created Cloudflare room. Steam publisher credentials never enter browser or Electron renderer code.

Steam Networking Sockets/SDR is a later alternate transport only. It would change authority to a player host and introduce host migration, cheating, quality, and reconnect risks, so it is outside the initial Steam release path.

## Current milestone and next gate

Milestone A's playable proof now supports room creation, joining, authority-validated hero choice, ready state, two authoritative players, a seeded 8–10-room floor layout, valid-door collision and shared party traversal, visited-room mapping, Neo Nyke character sprites, WASD/arrows/gamepad movement, snapshots, prediction/interpolation, a leave-room path, and disconnect cleanup in local development. It has automated protocol/transport/rendering tests and a repeatable two-browser exploration smoke command.

The next gate is the first authoritative enemy/combat vertical slice: one real enemy, one real player attack, server-owned damage/death, and a synchronized drop. Latency diagnostics, stronger reconciliation, reconnect reservations, complete enemy/item/floor systems, and a complete run remain required before Cloudflare multiplayer can be called proven. Electron and Steam remain out of scope until then.
