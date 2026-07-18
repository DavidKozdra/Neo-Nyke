# Neo Nyke gameplay protocol v1

Status: versioned runtime contract with validation, a fault-injected local-loopback proof, and a Cloudflare Durable Object room/movement proof. The complete campaign message surface remains incremental; every transport carries this same envelope.

## Envelope

```js
{
  protocolVersion: 1,
  type: "PLAYER_INPUT",
  sequence: 412,
  tick: 920,
  payload: {}
}
```

Rules:

- `protocolVersion` is exactly `1`.
- `type` is an allow-listed message type.
- `sequence` is a non-negative safe integer scoped to sender and direction. Reliable control events must be unique; replaceable inputs with an old/duplicate sequence are discarded.
- `tick` is a non-negative safe integer. For client intent it is the client's target/estimated authority tick; it is never accepted as proof of an outcome.
- `payload` is a plain JSON object. Unknown properties are rejected for security-sensitive messages and ignored only where a schema explicitly allows forward-compatible metadata.
- Incoming encoded messages have a hard byte limit before JSON parsing. Initial target limits are 16 KiB client-to-authority, 256 KiB full initial state, and 64 KiB regular authority messages. These become measured constants with the protocol implementation.
- Strings are length bounded and normalized. Numbers must be finite. No `NaN`, infinity, functions, binary/native handles, or platform-specific identity objects appear in common payloads.

Transport metadata is out of band:

```js
transport.send(peerId, envelope, {
  reliability: "unreliable",
  channel: "simulation",
  replaceable: true
});
```

## Handshake and compatibility

`CLIENT_HELLO.payload`:

```js
{
  buildVersion: "1.0.0",
  generationVersion: 1,
  contentHash: "sha256:...",
  requestedIdentityProvider: "guest"
}
```

`SERVER_HELLO.payload` repeats authority versions and advertises limits/capabilities. The authority rejects incompatible protocol, build, generation, or content before join. Build policy may allow patch differences only when content hash and protocol compatibility are explicitly known safe.

Authentication is provider-specific but resolves to a generic session identity. `AUTHENTICATE` carries a short-lived provider credential appropriate to the connection; logs and gameplay snapshots never include it. A claimed player or Steam ID in ordinary payload data is not authentication.

The protocol's co-op match is entered from the separate `MULTIPLAYER` flow. Legacy same-device player slots and alternate local-controller bindings are not represented as network peers.

## Client-to-authority messages

| Type | Reliability/channel | Payload purpose and authority checks |
| --- | --- | --- |
| `CLIENT_HELLO` | reliable/control | Version/capability negotiation. First message only. |
| `AUTHENTICATE` | reliable/control | Establish connection identity through configured identity provider. |
| `JOIN_MATCH` | reliable/control | Room/session locator plus reconnect proof when applicable. Authority checks room status/capacity/identity. |
| `PLAYER_READY` | reliable/control | Boolean lobby readiness for sender-owned player. Waiting state only. |
| `PLAYER_INPUT` | unreliable, replaceable/simulation | Normalized movement vector, aim angle, held-button bitset, and input sequence. Authority clamps magnitude and orders/deduplicates. |
| `PLAYER_ACTION` | reliable for discrete actions or unreliable for repeatable input/simulation | Attack/ability intent, input sequence, aim direction, equipped slot/item reference. Authority checks ownership, cooldown, status, range, and match state. |
| `INTERACT_REQUEST` | reliable/gameplay | Target entity ID and input sequence. Authority checks existence, distance, ownership/state, and one-winner races. |
| `UPGRADE_SELECTION` | reliable/gameplay | Authority-issued selection event ID plus option ID. Authority checks eligibility and whether already resolved. |
| `LEAVE_MATCH` | reliable/control | Graceful leave reason code. Authority owns cleanup. |
| `PING` | unreliable/control | Opaque bounded nonce and client send timestamp used only for diagnostics. |

No client message can directly specify damage, hit success, enemy death, pickup ownership, currency balance, shop inventory, random result, boss phase, or floor completion.

Representative input:

```js
{
  protocolVersion: 1,
  type: "PLAYER_ACTION",
  sequence: 413,
  tick: 920,
  payload: {
    action: "ATTACK",
    inputSequence: 412,
    aimDirection: 1.82,
    equippedItemId: "weapon-8"
  }
}
```

## Authority-to-client messages

| Type | Reliability/channel | Payload purpose |
| --- | --- | --- |
| `SERVER_HELLO` | reliable/control | Negotiated versions, authority identity, limits, heartbeat/reconnect policy. |
| `JOIN_ACCEPTED` | reliable/control | Match/player IDs, reconnect token handled as sensitive session data, lobby state. |
| `JOIN_REJECTED` | reliable/control | Stable reason code and safe human-readable message. |
| `LOBBY_STATE` | reliable/control | Members, ready flags, host marker, mode, capacity, joinability. |
| `MATCH_STARTING` | reliable/gameplay | Start tick/time, match/floor seeds, generation/content versions. |
| `INITIAL_STATE` | reliable/snapshot | Full serializable `GameState`, authority tick, per-player input acknowledgements. |
| `WORLD_SNAPSHOT` | unreliable, replaceable/snapshot | Snapshot sequence, server tick, acknowledgements, changed entity state, additions/removals, optional full-correction marker. |
| `ENTITY_SPAWNED` | reliable/gameplay | Stable ID, kind, authoritative initial data when spawn cannot wait for snapshot. |
| `ENTITY_REMOVED` | reliable/gameplay | Stable ID and removal reason. |
| `GAMEPLAY_EVENT` | reliable/gameplay | Event ID plus typed outcome such as hit, pickup, purchase, death, revive, or choice resolved. Clients deduplicate event IDs. |
| `FLOOR_TRANSITION` | reliable/gameplay | New floor number/seed, transition tick, spawn points, generation/content versions. |
| `RUN_ENDED` | reliable/gameplay | Result, authority reason, synchronized summary, leaderboard eligibility. |
| `PLAYER_DISCONNECTED` | reliable/control | Player ID, reason, reconnect deadline if reserved. |
| `ERROR` | reliable/control | Stable safe code, message, whether connection closes. Never includes secrets/internal stack. |
| `PONG` | unreliable/control | Echoed nonce plus authority receive/send tick/time for diagnostics. |

## Snapshot shape

Initial shape (delta encoding may later use arrays/bitmasks without changing semantics):

```js
{
  snapshotSequence: 55,
  serverTick: 920,
  full: false,
  lastProcessedInput: {
    "player-1": 412,
    "player-2": 388
  },
  entities: {
    players: {},
    enemies: {},
    projectiles: {},
    pickups: {},
    interactables: {}
  },
  removedEntityIds: [],
  floorState: null,
  bossState: null
}
```

Static floor geometry is sent once in `INITIAL_STATE` or generated from the validated floor seed/version. It is not repeated in ordinary snapshots. A periodic reliable or recoverable full correction prevents permanent drift after lost unreliable snapshots.

## Ordering, acknowledgement, and deduplication

- Each sender increments its own message sequence. Sequence wrap is not supported in v1; reconnect starts a new connection sequence space.
- Authority processes player inputs in order, ignores duplicates/old sequences, and bounds how far ahead a client may queue.
- Snapshot sequence orders replaceable world views. Clients discard snapshots older than the newest accepted sequence.
- `lastProcessedInput[playerId]` drives local reconciliation and removal of acknowledged inputs.
- Reliable gameplay events carry an authority-generated `eventId`; clients keep a bounded recent-ID cache so sounds/effects/rewards play once.
- Entity spawn/removal is idempotent by stable entity ID.

## Lobby and lifecycle state machine

```text
connected
→ hello
→ authenticated
→ joined/waiting
→ ready
→ starting
→ running ↔ transitioning
→ ended
→ left/disconnected
```

Messages illegal for the current state count as validation failures. Repeated invalid messages are rate-limited and can close the connection. A match already running rejects a new player unless the identity owns a reconnect reservation. Browser reconnect reservations initially last 45 seconds and require the authenticated session proof issued on the original connection.

## Error codes

Initial stable codes include `VERSION_MISMATCH`, `AUTH_REQUIRED`, `AUTH_FAILED`, `INVALID_MESSAGE`, `MESSAGE_TOO_LARGE`, `RATE_LIMITED`, `INVALID_SESSION`, `ROOM_FULL`, `MATCH_STARTED`, `NOT_READY`, `NOT_OWNER`, `ILLEGAL_ACTION`, `RECONNECT_EXPIRED`, and `AUTHORITY_DISCONNECTED`.

Version mismatch copy for incompatible Steam builds:

> This lobby is using a different Neo Nyke build. Update the game through Steam and try again.

## Evolution policy

Protocol v1 remains transport-independent. Adding optional presentation fields may be backward compatible only when schemas mark them optional and gameplay outcome is unchanged. Changing authority semantics, deterministic generation, required content, identity proof, or payload meaning requires a protocol/generation/content version change and compatibility rejection rather than best-effort desynchronization.
