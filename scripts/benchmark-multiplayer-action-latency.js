#!/usr/bin/env node
'use strict';

// Measures the action path separately from snapshot throughput: immediate
// client presentation (time zero), authority acceptance, and reliable result
// delivery. The authority remains the only source of damage/outcomes.

const {
  VirtualNetworkClock,
  LocalLoopbackNetwork,
  LocalLoopbackTransport,
} = require('../js/multiplayer/LocalLoopbackTransport');
const { LocalMultiplayerAuthority, LocalMultiplayerClient } = require('../js/multiplayer/LocalMultiplayerSession');

const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
};

function transport(network, id) {
  return new LocalLoopbackTransport({ network, identity: { provider: 'guest', id, displayName: id } });
}

async function runScenario({ oneWayLatencyMs, jitterMs, bytesPerSecond }) {
  const clock = new VirtualNetworkClock();
  const network = new LocalLoopbackNetwork({ clock, latencyMs: oneWayLatencyMs, jitterMs, bytesPerSecond, seed: 'action-latency' });
  const authorityTransport = transport(network, 'authority');
  const clientTransport = transport(network, 'client');
  const authority = new LocalMultiplayerAuthority({ transport: authorityTransport, sessionId: 'ACTION-BENCH', minPlayers: 1, matchSeed: 42 });
  const client = new LocalMultiplayerClient({ transport: clientTransport });
  await authority.start();
  await client.connect('ACTION-BENCH');
  clock.runAll();
  client.sendReady();
  clock.runAll();

  const startedAt = new Map();
  const acceptedAt = new Map();
  const confirmedAt = new Map();
  clientTransport.onMessage((_peerId, message) => {
    if (message.type !== 'GAMEPLAY_EVENT' || message.payload?.eventType !== 'PLAYER_ATTACKED') return;
    const predictionId = message.payload.data?.predictionId;
    if (predictionId) confirmedAt.set(predictionId, clock.now());
  });

  let previousAccepted = authority.metrics.acceptedActions;
  for (let tick = 0; tick < 260; tick += 1) {
    if (tick % 20 === 0) {
      const predictionId = `bench:${tick}`;
      startedAt.set(predictionId, clock.now());
      client.sendAction('ATTACK', 0, { predictionId, originServerTick: client.state.tick });
    }
    clock.advanceBy(50);
    authority.step(1);
    if (authority.metrics.acceptedActions > previousAccepted) {
      const newest = [...startedAt.keys()].find(id => !acceptedAt.has(id));
      if (newest) acceptedAt.set(newest, clock.now());
      previousAccepted = authority.metrics.acceptedActions;
    }
  }
  clock.runAll();
  const acceptance = [...acceptedAt].map(([id, at]) => at - startedAt.get(id));
  const confirmation = [...confirmedAt].map(([id, at]) => at - startedAt.get(id));
  const format = values => `p50 ${percentile(values, 0.5).toFixed(1)} ms | p95 ${percentile(values, 0.95).toFixed(1)} ms | max ${Math.max(0, ...values).toFixed(1)} ms`;
  return { acceptance, confirmation, format, count: startedAt.size };
}

async function main() {
  const result = await runScenario({ oneWayLatencyMs: 75, jitterMs: 20, bytesPerSecond: 125_000 });
  process.stdout.write('Multiplayer action-latency benchmark (150 ms RTT / 1 Mbps, 20 ms one-way jitter)\n');
  process.stdout.write(`Predicted local presentation: 0 ms (same input frame; visual-only)\n`);
  process.stdout.write(`Authority action acceptance: ${result.format(result.acceptance)}\n`);
  process.stdout.write(`Authoritative confirmation: ${result.format(result.confirmation)}\n`);
  process.stdout.write(`Actions issued: ${result.count}\n`);
  const gates = {
    allActionsAccepted: result.acceptance.length === result.count,
    allActionsConfirmed: result.confirmation.length === result.count,
    authorityAcceptanceP95Under125Ms: percentile(result.acceptance, 0.95) < 125,
    authoritativeConfirmationP95Under250Ms: percentile(result.confirmation, 0.95) < 250,
  };
  process.stdout.write(`Acceptance: ${JSON.stringify(gates)}\n`);
  if (process.argv.includes('--enforce') && Object.values(gates).includes(false)) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
