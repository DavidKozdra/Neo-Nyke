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
const {
  MAX_SMOOTH_RECONCILIATION_PX,
  NetworkGameView,
  predictPosition,
} = require('../js/rendering/NetworkGameView');

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

function runRemoteSmoothness(snapshotIntervalMs, durationMs = 4_000) {
  const speed = 228;
  const frameMs = 1000 / 60;
  const view = new NetworkGameView({
    session: { playerId: 'local-player', status: 'running' },
    neo: {},
  });
  const sample = receivedAt => ({
    tick: Math.round(receivedAt / 50),
    receivedAt,
    state: {
      players: {
        'remote-player': {
          id: 'remote-player',
          roomId: 'room-a',
          x: speed * receivedAt / 1000,
          y: 200,
          vx: speed,
          vy: 0,
        },
      },
    },
  });
  view.previousSample = sample(0);
  view.currentSample = sample(0);
  let nextSnapshotAt = snapshotIntervalMs;
  let previousX = null;
  let movingFrames = 0;
  let stalledFrames = 0;
  let maximumStep = 0;
  for (let now = 0; now <= durationMs; now += frameMs) {
    while (nextSnapshotAt <= now) {
      view.previousSample = view.currentSample;
      view.currentSample = sample(nextSnapshotAt);
      nextSnapshotAt += snapshotIntervalMs;
    }
    const x = view._renderedPlayers(now)['remote-player'].x;
    if (previousX !== null && now > snapshotIntervalMs + 100) {
      const step = Math.abs(x - previousX);
      movingFrames += 1;
      if (step < speed * frameMs / 1000 * 0.1) stalledFrames += 1;
      maximumStep = Math.max(maximumStep, step);
    }
    previousX = x;
  }
  return {
    snapshotIntervalMs,
    stallRatio: movingFrames ? stalledFrames / movingFrames : 0,
    maximumStep,
    expectedStep: speed * frameMs / 1000,
  };
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
    unreliablePacketLoss: options.unreliablePacketLoss || 0,
    duplicateMessageRate: options.duplicateMessageRate || 0,
    bytesPerSecond: options.bytesPerSecond,
    seed: options.seed || 'latency-benchmark',
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
    snapshot: () => ({ status: client.status, playerId: client.playerId, lastAcknowledgedInput: client.lastAcknowledgedInput }),
    sendInput: input => client.sendInput(input),
  };
  const view = new NetworkGameView({ session, neo: {} });
  view.active = true;
  let currentInput = { moveX: 1, moveY: 0, aimDirection: 0, buttons: 0 };
  view._readMovement = () => ({ moveX: currentInput.moveX, moveY: currentInput.moveY });
  view._isInputBlocked = () => false;
  view._onSnapshot({ gameState: client.getStateSnapshot(), playerId: client.playerId });

  const corrections = [];
  const correctionDetails = [];
  const snapshotAgeMs = [];
  const snapshotIntervalsMs = [];
  let observedSnapshots = 0;
  let lastObservedAt = null;
  let measurementStartMs = Infinity;
  let measurementStartTick = 0;
  clientTransport.onMessage((_peerId, message) => {
    if (message.type !== 'WORLD_SNAPSHOT' || !client.state) return;
    observedSnapshots += 1;
    if (lastObservedAt !== null) snapshotIntervalsMs.push(Math.max(0, clock.now() - lastObservedAt));
    lastObservedAt = clock.now();
    const authorityPlayer = client.state.players[client.playerId];
    const previousPredicted = view.localPredictedPlayer && { ...view.localPredictedPlayer };
    view._onSnapshot({ gameState: client.getStateSnapshot(), playerId: client.playerId });
    const reconciledPlayer = view.localPredictedPlayer;
    if (authorityPlayer && previousPredicted && reconciledPlayer && clock.now() >= measurementStartMs) {
      const distance = Math.hypot(
        Number(previousPredicted.x || 0) - Number(reconciledPlayer.x || 0),
        Number(previousPredicted.y || 0) - Number(reconciledPlayer.y || 0),
      );
      corrections.push(distance);
      correctionDetails.push({
        distance,
        serverTick: Number(message.payload.serverTick || 0),
        authority: { x: authorityPlayer.x, y: authorityPlayer.y, roomId: authorityPlayer.roomId },
        predictedBefore: { x: previousPredicted.x, y: previousPredicted.y, roomId: previousPredicted.roomId },
        reconciled: { x: reconciledPlayer.x, y: reconciledPlayer.y, roomId: reconciledPlayer.roomId },
        packedPlayers: message.payload.packedDynamic?.packed?.players,
        packedIds: message.payload.packedDynamic?.dictionaries?.ids,
        snapshotSequence: message.payload.snapshotSequence,
        baselineSequence: message.payload.baselineSequence,
        clientSequence: client.latestSnapshotSequence,
        pendingResync: client.pendingSnapshotResync,
        messageBytes: Buffer.byteLength(JSON.stringify(message), 'utf8'),
        entityBytes: Buffer.byteLength(JSON.stringify(message.payload.entities), 'utf8'),
        packedBytes: Buffer.byteLength(JSON.stringify(message.payload.packedDynamic || {}), 'utf8'),
      });
      snapshotAgeMs.push(Math.max(0, clock.now() - (measurementStartMs
        + (Number(message.payload.serverTick || 0) - measurementStartTick) * 50)));
    }
  });
  return {
    authority,
    client,
    clock,
    network,
    view,
    corrections,
    correctionDetails,
    snapshotAgeMs,
    snapshotIntervalsMs,
    getObservedSnapshots: () => observedSnapshots,
    setInput: input => { currentInput = { ...currentInput, ...input }; },
    setMeasurementStart: (tick) => {
      measurementStartMs = clock.now();
      measurementStartTick = tick;
      lastObservedAt = null;
    },
  };
}

async function runScenario(options) {
  const harness = await createHarness(options);
  const {
    authority, client, clock, view, corrections, correctionDetails,
    snapshotAgeMs, snapshotIntervalsMs, network, getObservedSnapshots,
    setInput, setMeasurementStart,
  } = harness;
  const originalPerformance = globalThis.performance;
  globalThis.performance = { now: () => clock.now() };
  try {
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
      setInput(input);
      view._sendInput();
      advanceBusyState(authority, client.playerId, authority.pendingInputs[client.playerId] || input);
      if ((tick + 1) % SNAPSHOT_INTERVAL_TICKS === 0) authority._publishSnapshot(false);
      clock.advanceBy(50);
    }
    clock.runAll();
    corrections.length = 0;
    snapshotAgeMs.length = 0;
    snapshotIntervalsMs.length = 0;
    setMeasurementStart(state.tick);

    const measuredTicks = 240;
    const directions = [
      { moveX: 1, moveY: 0 },
      { moveX: 0, moveY: 1 },
      { moveX: -1, moveY: 0 },
      { moveX: 0, moveY: -1 },
    ];
    const turnIntervalTicks = Math.max(4, Math.trunc(Number(options.turnIntervalTicks) || 30));
    for (let tick = 0; tick < measuredTicks; tick += 1) {
      const measuredInput = {
        ...input,
        ...directions[Math.floor(tick / turnIntervalTicks) % directions.length],
      };
      setInput(measuredInput);
      view._sendInput();
      advanceBusyState(authority, client.playerId, authority.pendingInputs[client.playerId] || input);
      if ((tick + 1) % SNAPSHOT_INTERVAL_TICKS === 0) authority._publishSnapshot(false);
      clock.advanceBy(50);
    }
    clock.runAll();
    const smoothedCorrectionVelocity = corrections
      .filter(distance => distance > 0.01 && distance < MAX_SMOOTH_RECONCILIATION_PX)
      .map(distance => distance / (Math.max(120, Math.min(240, distance * 3)) / 1000));
    return {
      correction: summary(corrections),
      smoothedCorrectionVelocity: summary(smoothedCorrectionVelocity),
      hardCorrections: corrections.filter(distance => distance >= MAX_SMOOTH_RECONCILIATION_PX).length,
      correctionSamples: corrections.slice(),
      correctionDetails: correctionDetails.slice(),
      snapshotAge: summary(snapshotAgeMs),
      snapshotAgeSamples: snapshotAgeMs.slice(),
      snapshotInterval: summary(snapshotIntervalsMs),
      metrics: network.getMetrics(),
      observedSnapshots: getObservedSnapshots(),
      resyncRequests: client.diagnostics.resyncRequests,
      acceptedInputs: authority.metrics.acceptedInputs,
    };
  } finally {
    globalThis.performance = originalPerformance;
  }
}

function printScenario(name, result) {
  process.stdout.write(`${name}\n`);
  process.stdout.write(`  snapshot age: p50 ${metric(result.snapshotAge.p50)} ms | p95 ${metric(result.snapshotAge.p95)} ms | max ${metric(result.snapshotAge.max)} ms\n`);
  process.stdout.write(`  visual correction: p50 ${metric(result.correction.p50)} px | p95 ${metric(result.correction.p95)} px | max ${metric(result.correction.max)} px (${result.correction.count} snapshots)\n`);
  process.stdout.write(`  correction blend: p95 ${metric(result.smoothedCorrectionVelocity.p95)} px/s | hard snaps ${result.hardCorrections}\n`);
  process.stdout.write(`  snapshot gap: p95 ${metric(result.snapshotInterval.p95)} ms | max ${metric(result.snapshotInterval.max)} ms | resyncs ${result.resyncRequests}\n`);
  process.stdout.write(`  delivered: ${result.metrics.delivered} messages, ${Math.round(result.metrics.bytes / 1024)} KiB serialized (${result.observedSnapshots} snapshots observed)\n`);
}

async function main() {
  const shared = { oneWayLatencyMs: 50, jitterMs: 20, bytesPerSecond: 125_000 };
  const legacy = await runScenario({ ...shared, enableSnapshotPacking: false });
  const packed = await runScenario({ ...shared, enableSnapshotPacking: true });
  const constrained = await runScenario({ oneWayLatencyMs: 80, jitterMs: 30, bytesPerSecond: 31_250, enableSnapshotPacking: true });
  const adverse = await runScenario({
    oneWayLatencyMs: 70,
    jitterMs: 60,
    bytesPerSecond: 62_500,
    unreliablePacketLoss: 0.08,
    duplicateMessageRate: 0.05,
    turnIntervalTicks: 20,
    enableSnapshotPacking: true,
    seed: 'latency-benchmark-adverse',
  });
  const remoteAt5Hz = runRemoteSmoothness(200);
  const remoteAt2_5Hz = runRemoteSmoothness(400);

  process.stdout.write('Multiplayer latency/correction benchmark (synthetic 3-room combat: 90 enemies, 180 projectiles)\n');
  process.stdout.write('Movement is predicted with NetworkGameView; snapshots are server-authoritative. Delay is one-way.\n\n');
  printScenario('Legacy global snapshots — 100 ms RTT, 1 Mbps', legacy);
  printScenario('Packed room snapshots — 100 ms RTT, 1 Mbps', packed);
  printScenario('Packed room snapshots — 160 ms RTT, 250 kbps', constrained);
  printScenario('Packed room snapshots — 140 ms RTT, 60 ms jitter, 8% loss', adverse);
  process.stdout.write('Remote presentation continuity (60 fps, steady 228 px/s actor)\n');
  process.stdout.write(`  5 Hz: ${(remoteAt5Hz.stallRatio * 100).toFixed(1)}% stalled frames | max step ${metric(remoteAt5Hz.maximumStep)} px\n`);
  process.stdout.write(`  2.5 Hz: ${(remoteAt2_5Hz.stallRatio * 100).toFixed(1)}% stalled frames | max step ${metric(remoteAt2_5Hz.maximumStep)} px\n`);
  const gates = {
    normalSnapshotP95Under180Ms: packed.snapshotAge.p95 < 180,
    normalCorrectionP95Under28Px: packed.correction.p95 < 28,
    constrainedSnapshotP95Under300Ms: constrained.snapshotAge.p95 < 300,
    constrainedReceivesUpdates: constrained.snapshotAge.count >= 12,
    adverseSnapshotP95Under350Ms: adverse.snapshotAge.p95 < 350,
    adverseCorrectionP95Under96Px: adverse.correction.p95 < MAX_SMOOTH_RECONCILIATION_PX,
    adverseCorrectionBlendUnder400PxPerSecond: adverse.smoothedCorrectionVelocity.p95 < 400,
    adverseHasNoHardSnaps: adverse.hardCorrections === 0,
    adverseSnapshotGapP95Under700Ms: adverse.snapshotInterval.p95 < 700,
    adverseSnapshotGapMaxUnder1000Ms: adverse.snapshotInterval.max < 1000,
    adverseReceivesUpdates: adverse.snapshotAge.count >= 20,
    adverseAvoidsResyncStorm: adverse.resyncRequests <= 1,
    remote5HzStallFramesUnder1Percent: remoteAt5Hz.stallRatio < 0.01,
    remote2_5HzStallFramesUnder1Percent: remoteAt2_5Hz.stallRatio < 0.01,
    remote2_5HzStepUnder8Px: remoteAt2_5Hz.maximumStep < 8,
  };
  process.stdout.write(`\nAcceptance: ${JSON.stringify(gates)}\n`);
  if (process.argv.includes('--enforce') && Object.values(gates).includes(false)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { percentile, summary, runRemoteSmoothness, runScenario };
