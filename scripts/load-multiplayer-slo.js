#!/usr/bin/env node
'use strict';

// Deterministic capacity gate for the actual authority/client protocol. It is
// intentionally not a replacement for a deployed Cloudflare load test: it
// catches simulation, snapshot and convergence regressions before a build ever
// reaches staging. The default is 100 simultaneous four-player expeditions.

const {
  VirtualNetworkClock,
  LocalLoopbackNetwork,
  LocalLoopbackTransport,
} = require('../js/multiplayer/LocalLoopbackTransport');
const {
  LocalMultiplayerAuthority,
  LocalMultiplayerClient,
} = require('../js/multiplayer/LocalMultiplayerSession');

function readIntegerOption(name, fallback, minimum, maximum) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = Math.trunc(Number(process.argv[index + 1]));
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`--${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function createTransport(network, id) {
  return new LocalLoopbackTransport({
    network,
    identity: { provider: 'guest', id, displayName: id },
  });
}

async function createRoom(index, players) {
  const clock = new VirtualNetworkClock();
  const network = new LocalLoopbackNetwork({
    clock,
    latencyMs: 55,
    jitterMs: 20,
    unreliablePacketLoss: 0.05,
    duplicateMessageRate: 0.01,
    bytesPerSecond: 125_000,
    seed: `production-load-${index}`,
  });
  const roomId = `LOAD${index.toString(36).toUpperCase()}`;
  const authority = new LocalMultiplayerAuthority({
    transport: createTransport(network, `${roomId}-authority`),
    sessionId: roomId,
    matchSeed: `load-seed-${index}`,
    minPlayers: players,
    maxPlayers: players,
  });
  const clients = Array.from({ length: players }, (_unused, playerIndex) => new LocalMultiplayerClient({
    transport: createTransport(network, `${roomId}-player-${playerIndex}`),
  }));
  await authority.start();
  await Promise.all(clients.map(client => client.connect(roomId)));
  clock.runAll();
  clients.forEach(client => client.sendReady(true));
  clock.runAll();
  if (authority.simulation.state.status !== 'running') throw new Error(`${roomId} did not start`);
  return { authority, clients, clock, network, roomId };
}

function driveRoom(room, tick) {
  room.clients.forEach((client, playerIndex) => {
    const angle = ((tick + playerIndex * 7) % 40) * (Math.PI / 20);
    client.sendInput({
      moveX: Math.cos(angle), moveY: Math.sin(angle), aimDirection: angle, buttons: 0,
    });
  });
  room.clock.runAll();
  room.authority.step(1);
  room.clock.runAll();
}

function verifyRoom(room, expectedTicks) {
  room.authority.sendFullCorrection();
  room.clock.runAll();
  const authorityPlayers = room.authority.simulation.state.snapshot().players;
  const invalidClient = room.clients.find(client => client.status !== 'running'
    || client.state?.tick !== expectedTicks
    || JSON.stringify(client.state?.players) !== JSON.stringify(authorityPlayers));
  if (invalidClient) throw new Error(`${room.roomId} failed convergence for ${invalidClient.playerId || 'unidentified client'}`);
}

async function main() {
  // This is intentionally bounded to one local process's proven preflight
  // range. Higher concurrency belongs in a distributed staging run, where DO
  // rooms are actually isolated across the platform.
  const roomCount = readIntegerOption('rooms', 100, 1, 250);
  const playerCount = readIntegerOption('players', 4, 1, 4);
  const ticks = readIntegerOption('ticks', 120, 10, 10_000);
  const maxMeanTickMs = readIntegerOption('max-mean-tick-ms', 25, 1, 10_000);
  const startedAt = performance.now();
  const rooms = await Promise.all(Array.from({ length: roomCount }, (_unused, index) => createRoom(index, playerCount)));
  const admissionMs = performance.now() - startedAt;
  const simulationStartedAt = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) rooms.forEach(room => driveRoom(room, tick));
  const simulationMs = performance.now() - simulationStartedAt;
  rooms.forEach(room => verifyRoom(room, ticks));
  const network = rooms.reduce((total, room) => {
    const metrics = room.network.getMetrics();
    total.sent += metrics.sent;
    total.delivered += metrics.delivered;
    total.dropped += metrics.dropped;
    total.bytes += metrics.bytes;
    return total;
  }, { sent: 0, delivered: 0, dropped: 0, bytes: 0 });
  const meanTickMs = simulationMs / (roomCount * ticks);
  const report = {
    ok: meanTickMs <= maxMeanTickMs,
    rooms: roomCount,
    playersPerRoom: playerCount,
    totalPlayers: roomCount * playerCount,
    ticksPerRoom: ticks,
    admissionMs: Number(admissionMs.toFixed(1)),
    simulationMs: Number(simulationMs.toFixed(1)),
    meanTickMs: Number(meanTickMs.toFixed(3)),
    maxMeanTickMs,
    network,
    note: 'Deterministic local preflight. Run deployed Worker load tests before production admission.',
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { createRoom, driveRoom, verifyRoom };
