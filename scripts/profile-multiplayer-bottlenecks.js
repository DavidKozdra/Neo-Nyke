#!/usr/bin/env node
'use strict';

// Pipeline profiler for the actual multiplayer authority/client protocol. It
// answers "what is slow?" rather than merely reporting that a synthetic swarm
// completed: each simulated tick is attributed to input serialization, inbound
// delivery, authoritative simulation, and outbound snapshot/client delivery.

const { performance } = require('node:perf_hooks');
const {
  VirtualNetworkClock,
  LocalLoopbackNetwork,
  LocalLoopbackTransport,
} = require('../js/multiplayer/LocalLoopbackTransport');
const {
  LocalMultiplayerAuthority,
  LocalMultiplayerClient,
} = require('../js/multiplayer/LocalMultiplayerSession');

function option(name, fallback, minimum, maximum) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = Math.trunc(Number(process.argv[index + 1]));
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`--${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function summarize(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    meanMs: Number((total / Math.max(1, values.length)).toFixed(3)),
    p50Ms: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    p99Ms: Number(percentile(values, 0.99).toFixed(3)),
    maxMs: Number((values.length ? Math.max(...values) : 0).toFixed(3)),
  };
}

function makeTransport(network, id) {
  return new LocalLoopbackTransport({
    network,
    identity: { provider: 'guest', id, displayName: id },
  });
}

async function createRoom(index, players) {
  const roomCode = `PROFILE${index.toString(36).toUpperCase()}`;
  const clock = new VirtualNetworkClock();
  const network = new LocalLoopbackNetwork({
    clock,
    latencyMs: 55,
    jitterMs: 20,
    unreliablePacketLoss: 0.03,
    duplicateMessageRate: 0.01,
    bytesPerSecond: 125_000,
    seed: `profile-${index}`,
  });
  const authority = new LocalMultiplayerAuthority({
    transport: makeTransport(network, `${roomCode}-authority`),
    sessionId: roomCode,
    matchSeed: `profile-seed-${index}`,
    minPlayers: players,
    maxPlayers: players,
  });
  const clients = Array.from({ length: players }, (_unused, playerIndex) => new LocalMultiplayerClient({
    transport: makeTransport(network, `${roomCode}-player-${playerIndex}`),
  }));
  const admissionStartedAt = performance.now();
  await authority.start();
  await Promise.all(clients.map(client => client.connect(roomCode)));
  clock.runAll();
  clients.forEach(client => client.sendReady(true));
  clock.runAll();
  if (authority.simulation.state.status !== 'running') throw new Error(`${roomCode} did not start`);
  return {
    roomCode, clock, network, authority, clients,
    admissionMs: performance.now() - admissionStartedAt,
    authoritySamples: [],
  };
}

function phaseDuration(samples, name, operation) {
  const startedAt = performance.now();
  operation();
  const elapsed = performance.now() - startedAt;
  samples[name].push(elapsed);
  return elapsed;
}

function driveTick(room, tick, samples) {
  phaseDuration(samples, 'input', () => {
    room.clients.forEach((client, playerIndex) => {
      const angle = ((tick * 0.15) + playerIndex * (Math.PI / 2)) % (Math.PI * 2);
      client.sendInput({ moveX: Math.cos(angle), moveY: Math.sin(angle), aimDirection: angle, buttons: 0 });
    });
  });
  phaseDuration(samples, 'inboundDelivery', () => room.clock.runAll());
  const authorityStartedAt = performance.now();
  room.authority.step(1);
  const authorityMs = performance.now() - authorityStartedAt;
  samples.authority.push(authorityMs);
  room.authoritySamples.push(authorityMs);
  phaseDuration(samples, 'outboundDelivery', () => room.clock.runAll());
}

function verifyRoom(room, expectedTick) {
  room.authority.sendFullCorrection();
  room.clock.runAll();
  const authoritativePlayers = room.authority.simulation.state.snapshot().players;
  const invalid = room.clients.find(client => client.status !== 'running'
    || client.state?.tick !== expectedTick
    || JSON.stringify(client.state?.players) !== JSON.stringify(authoritativePlayers));
  if (invalid) throw new Error(`${room.roomCode} diverged for ${invalid.playerId || 'unidentified client'}`);
}

async function main() {
  const rooms = option('rooms', 25, 1, 100);
  const players = option('players', 4, 1, 4);
  const ticks = option('ticks', 180, 20, 10_000);
  const enforce = process.argv.includes('--enforce');
  const beforeMemory = process.memoryUsage();
  const startedAt = performance.now();
  const instances = await Promise.all(Array.from({ length: rooms }, (_unused, index) => createRoom(index, players)));
  const admissionMs = performance.now() - startedAt;
  const samples = { input: [], inboundDelivery: [], authority: [], outboundDelivery: [] };
  for (let tick = 0; tick < ticks; tick += 1) instances.forEach(room => driveTick(room, tick, samples));
  instances.forEach(room => verifyRoom(room, ticks));
  const afterMemory = process.memoryUsage();
  const network = instances.reduce((total, room) => {
    const metrics = room.network.getMetrics();
    total.sent += metrics.sent;
    total.delivered += metrics.delivered;
    total.dropped += metrics.dropped;
    total.superseded += metrics.superseded;
    total.bytes += metrics.bytes;
    return total;
  }, { sent: 0, delivered: 0, dropped: 0, superseded: 0, bytes: 0 });
  const recovery = instances.reduce((total, room) => {
    total.snapshotAcks += room.authority.metrics.snapshotAcks;
    total.snapshotResyncs += room.authority.metrics.snapshotResyncs;
    total.snapshotBytes += room.authority.metrics.snapshotBytes;
    total.maxSnapshotBytes = Math.max(total.maxSnapshotBytes, room.authority.metrics.maxSnapshotBytes);
    total.degradedSnapshotSkips += room.authority.metrics.degradedSnapshotSkips;
    return total;
  }, {
    snapshotAcks: 0, snapshotResyncs: 0, snapshotBytes: 0, maxSnapshotBytes: 0, degradedSnapshotSkips: 0,
  });
  const phases = Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, summarize(values)]));
  const logicalSeconds = ticks / 20;
  const slowestRooms = instances.map(room => ({ room: room.roomCode, authority: summarize(room.authoritySamples) }))
    .sort((left, right) => right.authority.p95Ms - left.authority.p95Ms).slice(0, 5);
  const bottleneck = Object.entries(phases)
    .sort(([, left], [, right]) => right.p95Ms - left.p95Ms)[0]?.[0] || 'unknown';
  const report = {
    rooms,
    playersPerRoom: players,
    totalPlayers: rooms * players,
    ticksPerRoom: ticks,
    admissionMs: Number(admissionMs.toFixed(1)),
    phases,
    bottleneck,
    network: {
      ...network,
      aggregateBytesPerSecond: Math.round(network.bytes / logicalSeconds),
      bytesPerPlayerPerSecond: Math.round(network.bytes / logicalSeconds / (rooms * players)),
    },
    recovery,
    memory: {
      heapDeltaMiB: Number(((afterMemory.heapUsed - beforeMemory.heapUsed) / 1024 / 1024).toFixed(1)),
      rssDeltaMiB: Number(((afterMemory.rss - beforeMemory.rss) / 1024 / 1024).toFixed(1)),
    },
    slowestRooms,
    slo: {
      authorityP95Under25Ms: phases.authority.p95Ms < 25,
      outboundP95Under25Ms: phases.outboundDelivery.p95Ms < 25,
      bandwidthPerPlayerUnder80KiB: Math.round(network.bytes / logicalSeconds / (rooms * players)) < 80 * 1024,
      converged: true,
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (enforce && Object.values(report.slo).includes(false)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { percentile, summarize, phaseDuration };
