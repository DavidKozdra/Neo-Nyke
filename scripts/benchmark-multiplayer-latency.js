#!/usr/bin/env node
'use strict';

// Reproducible correction benchmark. It drives the same client movement
// predictor used by NetworkGameView, then delivers authoritative snapshots
// through a virtual link with configurable latency, jitter and bandwidth.
// This is deliberately a transport/feel measurement, not a claim that the
// server-authoritative combat timeline has changed.

const {
  VirtualNetworkClock,
  LocalLoopbackNetwork,
  LocalLoopbackTransport,
} = require('../js/multiplayer/LocalLoopbackTransport');
const {
  LocalMultiplayerAuthority,
  LocalMultiplayerClient,
} = require('../js/multiplayer/LocalMultiplayerSession');
const { NetworkGameView, predictPosition } = require('../js/rendering/NetworkGameView');

const FIXED_DELTA_SECONDS = 1 / 20;
const SNAPSHOT_INTERVAL_TICKS = 2;

function transport(network, id) {
  return new LocalLoopbackTransport({
    network,
    identity: { provider: 'guest', id, displayName: id },
  });
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function summary(values) {
  return {
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length ? Math.max(...values) : 0,
  };
}

function metric(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}`;
}

function addBusyRoomState(authority, roomIds) {
  const state = authority.simulation.state;
  for (let index = 0; index < 90; index += 1) {
    const roomId = roomIds[index % roomIds.length];
    state.enemies[`latency-enemy-${index}`] = {
      id: `latency-enemy-${index}`, roomId, type: index % 5 === 0 ? 'elite_blade_justice' : 'cult_follower',
      x: 80 + (index * 37) % 760, y: 80 + (index * 53) % 540,
      vx: index % 2 ? 36 : -36, vy: index % 3 ? 24 : -24,
      radius: 20, hp: 120, max: 120, dmg: 14,
      behavior: 'chase', action: 'idle', actionTick: 0, statuses: {}, statusUntilTick: {},
    };
  }
  for (let index = 0; index < 180; index += 1) {
    const roomId = roomIds[index % roomIds.length];
    state.projectiles[`latency-projectile-${index}`] = {
      id: `latency-projectile-${index}`, roomId, kind: index % 3 ? 'fireball' : 'death_ball',
      ownerId: 'player-1', x: 60 + (index * 29) % 820, y: 60 + (index * 41) % 580,
      vx: 260, vy: index % 2 ? 120 : -120, radius: index % 3 ? 7 : 28,
      damage: 28, hostile: false, pierce: 0, expiresTick: state.tick + 10_000,
      hitIds: [], trail: [], behavior: 'straight', spawnedBy: 'latency-benchmark',
    };
  }
}

function advanceBusyState(authority, playerId, input) {
  const state = authority.simulation.state;
  state.tick += 1;
  const player = state.players[playerId];
  state.players[playerId] = predictPosition(player, input, FIXED_DELTA_SECONDS, state.floorState, state.tick);
  for (const collection of ['enemies', 'projectiles']) {
    Object.values(state[collection]).forEach(entity => {
      entity.x += entity.vx * FIXED_DELTA_SECONDS;
      entity.y += entity.vy * FIXED_DELTA_SECONDS;
    });
  }
}

async function createHarness(options) {
  const clock = new VirtualNetworkClock();
  const network = new LocalLoopbackNetwork({
    clock,
    latencyMs: options.oneWayLatencyMs,
    jitterMs: options.jitterMs,
    unreliablePacketLoss: 0,
    duplicateMessageRate: 0,
    bytesPerSecond: options.bytesPerSecond,
    seed: 'latency-benchmark',
  });
  const authorityTransport = transport(network, 'authority');
  const clientTransport = transport(network, 'client');
  const authority = new LocalMultiplayerAuthority({
    transport: authorityTransport,
    sessionId: 'LATENCY-BENCH',
    matchSeed: 42,
    minPlayers: 1,
    enableSnapshotPacking: options.enableSnapshotPacking,
  });
  const client = new LocalMultiplayerClient({ transport: clientTransport });
  await authority.start();
  await client.connect('LATENCY-BENCH');
  clock.runAll();
  client.sendReady();
  clock.runAll();

  const session = {
    get status() { return client.status; },
    snapshot: () => ({ status: client.status, playerId: client.playerId }),
    sendInput: input => client.sendInput(input),
  };
  const view = new NetworkGameView({ session, neo: {} });
  view.active = true;
  view._readMovement = () => ({ moveX: 1, moveY: 0 });
  view._isInputBlocked = () => false;
  view._onSnapshot({ gameState: client.getStateSnapshot(), playerId: client.playerId });

  const corrections = [];
  const snapshotAgeMs = [];
  let observedSnapshots = 0;
  let measurementStartMs = Infinity;
  let measurementStartTick = 0;
  clientTransport.onMessage((_peerId, message) => {
    if (message.type !== 'WORLD_SNAPSHOT' || !client.state) return;
    observedSnapshots += 1;
    const authorityPlayer = client.state.players[client.playerId];
    if (authorityPlayer && view.localPredictedPlayer && clock.now() >= measurementStartMs) {
      corrections.push(Math.hypot(
        Number(authorityPlayer.x || 0) - Number(view.localPredictedPlayer.x || 0),
        Number(authorityPlayer.y || 0) - Number(view.localPredictedPlayer.y || 0),
      ));
      snapshotAgeMs.push(Math.max(0, clock.now() - (measurementStartMs
        + (Number(message.payload.serverTick || 0) - measurementStartTick) * 50)));
    }
    view._onSnapshot({ gameState: client.getStateSnapshot(), playerId: client.playerId });
  });
  return { authority, client, clock, network, view, corrections, snapshotAgeMs, getObservedSnapshots: () => observedSnapshots, setMeasurementStart: (tick) => {
    measurementStartMs = clock.now();
    measurementStartTick = tick;
  } };
}

async function runScenario(options) {
  const harness = await createHarness(options);
  const { authority, client, clock, view, corrections, snapshotAgeMs, network, getObservedSnapshots, setMeasurementStart } = harness;
  const state = authority.simulation.state;
  const roomIds = state.floorState.layout.rooms.slice(0, 3).map(room => room.id);
  addBusyRoomState(authority, roomIds);
  // Establish static entity data before measurement. The subsequent snapshot
  // stream contains the high-frequency transforms that the packed format is
  // designed to shrink.
  authority._publishSnapshot(true);
  clock.runAll();
  view._onSnapshot({ gameState: client.getStateSnapshot(), playerId: client.playerId });

  const input = { moveX: 1, moveY: 0, aimDirection: 0, buttons: 0 };
  const warmupTicks = 40;
  for (let tick = 0; tick < warmupTicks; tick += 1) {
    view.lastTransmittedInput = null;
    view._sendInput();
    advanceBusyState(authority, client.playerId, input);
    if ((tick + 1) % SNAPSHOT_INTERVAL_TICKS === 0) authority._publishSnapshot(false);
    clock.advanceBy(50);
  }
  clock.runAll();
  corrections.length = 0;
  snapshotAgeMs.length = 0;
  setMeasurementStart(state.tick);

  const measuredTicks = 240;
  for (let tick = 0; tick < measuredTicks; tick += 1) {
    view.lastTransmittedInput = null;
    view._sendInput();
    advanceBusyState(authority, client.playerId, input);
    if ((tick + 1) % SNAPSHOT_INTERVAL_TICKS === 0) authority._publishSnapshot(false);
    clock.advanceBy(50);
  }
  clock.runAll();
  return { correction: summary(corrections), snapshotAge: summary(snapshotAgeMs), metrics: network.getMetrics(), observedSnapshots: getObservedSnapshots() };
}

function printScenario(name, result) {
  process.stdout.write(`${name}\n`);
  process.stdout.write(`  snapshot age: p50 ${metric(result.snapshotAge.p50)} ms | p95 ${metric(result.snapshotAge.p95)} ms | max ${metric(result.snapshotAge.max)} ms\n`);
  process.stdout.write(`  visual correction: p50 ${metric(result.correction.p50)} px | p95 ${metric(result.correction.p95)} px | max ${metric(result.correction.max)} px (${result.correction.count} snapshots)\n`);
  process.stdout.write(`  delivered: ${result.metrics.delivered} messages, ${Math.round(result.metrics.bytes / 1024)} KiB serialized (${result.observedSnapshots} snapshots observed)\n`);
}

async function main() {
  const shared = { oneWayLatencyMs: 50, jitterMs: 20, bytesPerSecond: 125_000 };
  const legacy = await runScenario({ ...shared, enableSnapshotPacking: false });
  const packed = await runScenario({ ...shared, enableSnapshotPacking: true });
  const constrained = await runScenario({ oneWayLatencyMs: 80, jitterMs: 30, bytesPerSecond: 31_250, enableSnapshotPacking: true });

  process.stdout.write('Multiplayer latency/correction benchmark (synthetic 3-room combat: 90 enemies, 180 projectiles)\n');
  process.stdout.write('Movement is predicted with NetworkGameView; snapshots are server-authoritative. Delay is one-way.\n\n');
  printScenario('Legacy global snapshots — 100 ms RTT, 1 Mbps', legacy);
  printScenario('Packed room snapshots — 100 ms RTT, 1 Mbps', packed);
  printScenario('Packed room snapshots — 160 ms RTT, 250 kbps', constrained);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
