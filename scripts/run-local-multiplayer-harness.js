const {
  VirtualNetworkClock,
  LocalLoopbackNetwork,
  LocalLoopbackTransport,
} = require('../js/multiplayer/LocalLoopbackTransport');
const {
  LocalMultiplayerAuthority,
  LocalMultiplayerClient,
} = require('../js/multiplayer/LocalMultiplayerSession');

function makeTransport(network, id, displayName) {
  return new LocalLoopbackTransport({
    network,
    identity: { provider: 'guest', id, displayName },
  });
}

async function main() {
  const clock = new VirtualNetworkClock();
  const network = new LocalLoopbackNetwork({
    latencyMs: 100,
    jitterMs: 30,
    unreliablePacketLoss: 0.05,
    duplicateMessageRate: 0.02,
    seed: 'neo-local-harness',
    clock,
  });
  const authority = new LocalMultiplayerAuthority({
    transport: makeTransport(network, 'host-authority', 'Host'),
    sessionId: 'LOCAL',
    matchSeed: 20260717,
  });
  const clientA = new LocalMultiplayerClient({ transport: makeTransport(network, 'client-a', 'Client A') });
  const clientB = new LocalMultiplayerClient({ transport: makeTransport(network, 'client-b', 'Client B') });

  await authority.start();
  await Promise.all([clientA.connect('LOCAL'), clientB.connect('LOCAL')]);
  clock.runAll();
  clientA.sendReady();
  clientB.sendReady();
  clock.runAll();

  for (let index = 0; index < 10; index += 1) {
    clientA.sendInput({ moveX: 1, moveY: 0, aimDirection: 0 });
    clientB.sendInput({ moveX: -1, moveY: 0, aimDirection: Math.PI });
  }
  clock.runAll();
  authority.step(60);
  clock.runAll();
  authority.sendFullCorrection();
  clock.runAll();

  const authorityPlayers = authority.simulation.state.snapshot().players;
  const converged = JSON.stringify(clientA.state?.players) === JSON.stringify(authorityPlayers)
    && JSON.stringify(clientB.state?.players) === JSON.stringify(authorityPlayers);
  const report = {
    topology: ['Host authority', 'Client A', 'Client B'],
    sessionId: authority.sessionId,
    tick: authority.simulation.state.tick,
    clients: { clientA: clientA.status, clientB: clientB.status },
    players: authorityPlayers,
    network: network.getMetrics(),
    authority: authority.metrics,
    converged,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!converged) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main };
