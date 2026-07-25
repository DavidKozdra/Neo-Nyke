# Production multiplayer research and decision

Research date: 2026-07-25.

## Decision

Use **Cloudflare Workers + one authoritative Durable Object (DO) per 2–4 player
expedition** for the browser and first Electron/Steam release. Keep the existing
headless simulation, protocol and renderer seams; do not replace them with a
relay, peer host, or a generic multiplayer SDK.

This is the best production fit for Neo Nyke today. A room is small, session
based, and already has a deterministic 20 Hz authority. DOs give it a single
serial state owner and globally reachable WebSocket endpoint without operating a
fleet. Cloudflare documents hibernatable WebSockets as the recommended API for
DO WebSocket servers, and explicitly lists multiplayer rooms as a use case.
[Cloudflare WebSockets documentation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

This is not a claim that the current implementation is ready to enable for every
player. It is a decision to harden the existing approach in stages instead of
paying the large rewrite and operations cost of a dedicated-server platform
before the game needs one.

## Current position

The repository is well beyond a prototype. It already has:

- one DO per short room code, authoritative input/action validation, 20 Hz
  simulation, snapshot deltas/full corrections and a serializable checkpoint;
- hibernating WebSocket acceptance, socket attachments, room cleanup alarms,
  rate limits, message-size limits, a handshake timeout and reconnect support;
- client prediction/reconciliation, remote interpolation and a shared
  simulation/content boundary; and
- a campaign renderer reused by multiplayer rather than a reduced second game.

The architecture and parity audits remain the source of truth for gameplay
extraction: [multiplayer architecture](multiplayer-architecture.md) and
[parity audit](multiplayer-parity-audit.md).

The material gaps for a public production release are different: current
connections are issued server-side guest IDs, reconnect is principally a bearer
token, region placement is a host-provided initial hint rather than a
party-latency decision, snapshots are JSON over a reliable ordered transport,
and no repeatable capacity/SLO gate is yet checked into the project.

The first operations hardening slice is now implemented: validated Cloudflare
region hints are persisted with newly created rooms, congestion coalesces
replaceable snapshots and disconnects an irrecoverably slow receiver, active
rooms collect bounded tick-drift/catch-up metrics, checkpoints carry a version
and accidental-corruption checksum, and per-client snapshot sequence/acknowledge
watermarks repair a skipped delta with one scoped full resync. The remaining
work is to tune those thresholds with real load and secure identity and ranking
evidence.

## Recommended production shape

```text
Browser / Electron client
  authenticated session + signed room ticket
                |
Cloudflare Worker: auth verification, party/invite API, admission/rate limits
                |
party or matchmaking DO  -- chooses a room region from party latency
                |
match DO: one authoritative 2–4 player expedition
  fixed-step simulation | snapshot/event publication | checkpoint/recovery
                |
SQLite DO storage: active checkpoint, reservations, audit metadata
                |
async only: D1 match history / R2 replay evidence / analytics / moderation
```

The match DO remains the only writer of live gameplay state. D1, KV, Queues and
R2 must not sit on the per-tick path. A Worker/API layer should reject malformed,
expired or over-quota admission before it invokes a room wherever possible.

### Identity and admission (P0)

Before a public beta, replace anonymous ownership with an authenticated account
subject and a short-lived, audience-bound, signed room ticket. The WebSocket
upgrade must validate the ticket server-side, bind its account ID, match ID,
build/content version and expiry to the socket attachment, and reject reuse or a
different room. Rotate the reconnect secret on every successful reconnect and
store only its hash in the checkpoint.

Guest play can remain, but it needs a server-issued anonymous account session;
it must not treat a client-generated `guest-*` value as an identity. Guest rooms
should be unranked and have tighter creation/chat limits. A later Steam login
should exchange a verified Steam ticket for the same first-party session shape,
not reach the simulation directly.

Use unguessable invite tokens in addition to human-readable room codes. A code
is for display and manual entry; the signed invite is the authorization grant.
Enforce exact `Origin`, `Host`, cookie/token and build compatibility checks on
the upgrade route. Never log tokens, complete room IDs plus account IDs, chat
content, or raw IPs in gameplay telemetry.

### Region placement (P0)

A DO normally stays near where it is first created. Cloudflare supports a
best-effort `locationHint` only on the first `get()`; it does not move existing
objects. Create a new room only after enough party members have reported a
coarse latency/region estimate, then choose the median/minimax region and pass a
hint. Do not pre-create rooms from an administrative region.
[Cloudflare data location documentation](https://developers.cloudflare.com/durable-objects/reference/data-location/)

Start with party-selected region and a clear ping estimate in the lobby. For a
four-player private co-op game, a predictable party choice is better than hidden
"smart" placement that disadvantages one member. Record each peer's RTT and
provide a support-visible chosen-region field.

### Authority timing and recovery (P0)

Keep the 20 Hz authoritative tick initially. The current `setInterval` is
appropriate only while a running match is deliberately active: scheduled
callbacks prevent DO hibernation, so there is an expected active-match duration
cost. Waiting lobbies should retain the existing hibernating socket/alarm model.
[DO lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)

Treat the timer as a scheduling signal, not an exact real-time clock. Persist a
`nextTickAt`/monotonic scheduling value and measure drift. On a delayed callback,
run a bounded catch-up (for example, at most 2–3 ticks), publish the resulting
authoritative tick, and expose an overrun counter. Do not run an unbounded
catch-up loop. The current one-step-per-callback approach is safe from spirals
but silently slows the match under contention; production needs that condition
to be measurable and explicitly handled.

Checkpoint at lifecycle boundaries immediately and at a bounded cadence during a
run (the existing 15-second goal is a sensible starting point). Store an
integrity/version envelope with the state and runtime checkpoint, restore it
before accepting inputs after a cold wake, and exercise both hibernation and
process-restart recovery in automated tests. Socket attachments are limited to
16,384 bytes and disappear when the socket closes, so they may carry only
connection metadata; durable recovery data belongs in DO storage.
[Hibernation attachment limits](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

### Network publication and slow clients (P0)

WebSockets are reliable and ordered. The protocol's "unreliable/replaceable"
intent therefore has to be implemented by the application: retain at most the
latest unsent snapshot per client/channel, coalesce it, and drop intermediate
snapshots. Reliable events must retain sequence IDs and be replayable from a
small per-match event ring until acknowledged or superseded by a full state.

Add per-socket outbound accounting and a policy such as:

1. Normal: send room-interest delta snapshots at 10 Hz plus reliable events.
2. Degraded: when queued bytes/ack age crosses a measured threshold, coalesce to
   5 Hz and send a warning diagnostic.
3. Resync: when the client has fallen beyond the retained delta base, send one
   full snapshot rather than replaying every delta.
4. Protect the room: after a fixed maximum queue/ack age, close with a retryable
   slow-client reason. Never let one receiver retain unbounded memory or block
   the match loop.

Interest management is the largest bandwidth win available now: each client gets
its current room, immediately adjacent doors/telegraphs if required, party-wide
minimal state (health/down/revive/location), and reliable global run events.
It should not receive every enemy, projectile and decorative detail in remote
rooms. Add a baseline hash and snapshot sequence to make delta loss/resync
unambiguous. Profile JSON first; move the hot input/snapshot payload to a small
versioned binary codec only if the load test shows encoding, bandwidth or GC is
the limiting factor. Keep messages schema-versioned either way.

Cloudflare also recommends batching high-frequency WebSocket state updates into
50–100 ms frames to reduce runtime context switches; the intended 10 Hz snapshot
cadence already fits that guidance.
[Cloudflare batching guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

### Security and integrity (P0)

The server-authoritative model is correct; preserve it rigorously. Clients send
intent only. The room validates identity, membership, versions, sequences,
cadence, state/cooldown/ownership, spatial range, target visibility and all
currency/inventory transitions. Keep a compact rolling history of canonical
transforms for bounded lag compensation; reject actions outside the window
instead of trusting a client timestamp.

Add a deterministic per-match audit trail: seed, content hash, server build,
join/leave/reconnect, accepted commands, terminal result and periodic state
hashes. Upload it asynchronously for suspicious or leaderboard-eligible runs.
Do not make public rankings available until this trail, authenticated identity,
server-only rewards and a review/invalidating workflow are in place.

Use the already-configured route limits as a first layer, but add account,
room and socket-level quotas with escalating disconnects. Cloudflare notes that
an overloaded DO can queue requests and eventually return overload errors; room
health must therefore be measured rather than assumed.
[Durable Object limits and overload behavior](https://developers.cloudflare.com/durable-objects/platform/limits/)

### Operations and observability (P0)

Define these match metrics with a `matchId` hash as the sampling key:

- tick duration and p50/p95/p99 scheduling drift; ticks skipped/caught up;
- simulation CPU and entity counts by room; active/hibernated room counts;
- input, reliable-event and snapshot bytes/messages per player/minute;
- snapshot encode time/size, full-resync count, outbound queue/ack age;
- RTT, jitter, correction distance/rate, disconnect/reconnect success;
- checkpoint latency/failures, cold-wake restore time and state-hash mismatch;
- rejected command reason, rate-limit action and protocol/build mismatch.

Use Workers Analytics Engine for aggregated high-cardinality operational metrics:
writes are non-blocking and it retains data for three months. Use sampled
structured Workers Logs/traces for diagnosis, with an error-triggered sampling
increase and a privacy review. Cloudflare documents both Analytics Engine and
Workers logging configuration.
[Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/get-started/),
[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

Set alerting/runbooks for: sustained tick p99 above the tick budget, checkpoint
failure, DO overload, resync/slow-client spikes, join failure, protocol mismatch,
and a regional RTT regression. Every production deployment needs a compatibility
policy: current rooms finish on their pinned simulation/content version; new
rooms are created only on the new compatible version; incompatible clients get a
clear update prompt.

## Platform comparison

| Option | Fit for Neo Nyke now | Decision |
| --- | --- | --- |
| Cloudflare DO authoritative rooms | Direct fit for 2–4 browser players, existing code, WebSockets, checkpoints and no fleet operations. | **Adopt and harden.** |
| Nakama authoritative matches | A capable server-authoritative match loop with matchmaking/social features, but requires a rewrite into its runtime and operating/deploying Nakama. | Revisit only if social/matchmaking/backend scope outgrows Workers. [Nakama authoritative matches](https://heroiclabs.com/docs/nakama/concepts/multiplayer/authoritative/) |
| Agones/GameLift dedicated servers | Strong fit for latency-sensitive, high-player-count UDP games and regional server fleets, but adds container/Kubernetes or fleet operations and does not improve this four-player WebSocket game enough today. | Defer until profiling proves DO CPU, placement or transport is the bottleneck. [Agones overview](https://agones.dev/site/docs/overview/), [GameLift Servers](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-intro.html) |
| P2P / Steam Networking as authority | Cheap hosting but adds host migration, NAT/relay variability and an unacceptable trust boundary for progression/PvP. | Do not use for ranked or canonical runs; keep only as a possible future unranked/local option. |

Do not use Amazon GameLift Realtime as an authority substitute: AWS describes it
as a relay by default, so it does not itself validate or resolve gameplay.
[GameLift Realtime behavior](https://docs.aws.amazon.com/gameliftservers/latest/realtimeguide/realtime-howitworks-servers.html)

## Release gates

### Internal alpha

- Finish the known gameplay-parity blockers for the intended expedition slice.
- Add ticket authentication, signed invites, party-latency region selection,
  and structured failure reasons; tune the initial coalescing, telemetry and
  scheduler limits against measured load.
- Check in a headless multi-client load harness capable of deterministic normal,
  latency, jitter, loss, duplicate, reconnect, malicious-input and slow-reader
  scenarios.
- Run `npm run multiplayer:load` as the local 100-room/400-player convergence
  preflight. It is intentionally a pre-deploy simulation gate, not a substitute
  for the regional Worker load test below.
- Run `npm run multiplayer:profile` before changing multiplayer performance
  code. It drives 25 four-player rooms through the real local authority/client
  protocol and emits JSON with p50/p95/p99 time for input, inbound delivery,
  authority simulation, and outbound snapshot/client delivery, along with
  snapshot-ack/resync totals. Treat the
  largest p95 phase as the optimization target; retain the JSON as a CI artifact
  so regressions are attributable instead of anecdotal. The command fails if
  authority or outbound p95 exceeds the initial 25 ms tick-work budget or a
  final correction does not converge.
- The 10,000-player target is 2,500 rooms of four players, never one giant
  room. It must run against a staged distributed Worker deployment in every
  launch region; a single Node process is deliberately only a 100-room local
  preflight and must not be presented as 10K proof.
- For local browser load proof, run `npm run multiplayer:dev:load` in one
  terminal and `npm run multiplayer:playwright:100` in another. The commands
  share a development-only token automatically. Against staging, configure the
  `MULTIPLAYER_LOAD_TEST_TOKEN` secret and pass the matching
  `NEONYKE_MULTIPLAYER_LOAD_TOKEN`; it starts 100 isolated browser players in
  25 rooms, has each player use normal browser movement, and verifies the active
  game view plus authority snapshots on every page.
- Run hibernation/cold-wake/checkpoint corruption/recovery tests in a deployed
  staging Worker, not only Miniflare.

### Closed beta

- Set explicit initial SLOs and publish the supported regions. A reasonable
  initial target is p95 tick work below 25 ms at 20 Hz, zero state-hash
  divergence, p95 reconnect under 10 seconds, and bounded memory/queue behavior
  when one client is intentionally throttled. Validate the exact values against
  measured game load before promising them publicly.
- Load test at least 2× the expected concurrent rooms in each launch region,
  using worst-case authored bosses/effects and four active players per room.
- Conduct an abuse review: ticket replay, reconnect-token theft, cross-room
  input, message flood, invite guessing, malformed binary/JSON, version skew,
  chat and leaderboard forgery.
- Perform a restore drill and a rollback drill for every schema/content change.

### Public launch

- Turn on production feature flags only by region/cohort; maintain a server-side
  kill switch that stops new room admission without terminating active rooms.
- Keep ranked/weekly rewards disabled until the integrity audit path has been
  exercised in beta.
- On-call owners have dashboard links, rollout/rollback steps and player-facing
  status/error copy for admission, region and version failures.

## Re-evaluation triggers

Revisit the hosting decision only when measured evidence shows one of these:

- the p99 simulation workload cannot meet its tick budget after interest
  management and profiling;
- 20–30 Hz WebSocket play remains unacceptable in target regions despite party
  placement and prediction;
- the game requires large sessions, dedicated UDP transport, authoritative
  physics beyond Workers CPU limits, or dozens/hundreds of entities visible to
  every player; or
- cross-match social, matchmaking and account services become the dominant
  engineering problem.

At that point, migrate the existing headless `GameSimulation` and protocol to a
dedicated server process behind Agones/GameLift (or adopt Nakama for its backend
services). The current simulation/transport boundary is specifically what makes
that a planned migration rather than a rewrite.
