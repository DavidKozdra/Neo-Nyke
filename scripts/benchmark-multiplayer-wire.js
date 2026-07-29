#!/usr/bin/env node
'use strict';

// Reproducible wire-size benchmark for the campaign authority. It deliberately
// measures the serialized envelopes used by the current transport, then models
// two safe protocol candidates: room interest filtering and compact dynamic
// entity records. It does not change simulation or transport behaviour.

const { gzipSync } = require('node:zlib');
const {
  VirtualNetworkClock,
  LocalLoopbackNetwork,
  LocalLoopbackTransport,
} = require('../js/multiplayer/LocalLoopbackTransport');
const {
  LocalMultiplayerAuthority,
  LocalMultiplayerClient,
} = require('../js/multiplayer/LocalMultiplayerSession');

const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const gzipBytes = value => gzipSync(JSON.stringify(value)).byteLength;
const percent = (saved, total) => total ? `${(saved / total * 100).toFixed(1)}%` : '0.0%';

function transport(network, id) {
  return new LocalLoopbackTransport({
    network,
    identity: { provider: 'guest', id, displayName: id },
  });
}

async function createRunningHarness() {
  const clock = new VirtualNetworkClock();
  const network = new LocalLoopbackNetwork({ clock, latencyMs: 0, jitterMs: 0, unreliablePacketLoss: 0 });
  const authorityTransport = transport(network, 'authority');
  const clientTransport = transport(network, 'client');
  const authority = new LocalMultiplayerAuthority({
    transport: authorityTransport, sessionId: 'WIRE-BENCH', matchSeed: 42, minPlayers: 1,
  });
  const client = new LocalMultiplayerClient({ transport: clientTransport });
  await authority.start();
  await client.connect('WIRE-BENCH');
  clock.runAll();
  client.sendReady();
  clock.runAll();
  return { authority, client, clientTransport, clock };
}

function addBusyRoomState(authority, roomIds) {
  const state = authority.simulation.state;
  for (let index = 0; index < 90; index += 1) {
    const roomId = roomIds[index % roomIds.length];
    state.enemies[`benchmark-enemy-${index}`] = {
      id: `benchmark-enemy-${index}`, roomId, type: index % 5 === 0 ? 'elite_blade_justice' : 'cult_follower',
      x: 80 + (index * 37) % 760, y: 80 + (index * 53) % 540,
      vx: 0, vy: 0, radius: 20, hp: 120, max: 120, dmg: 14,
      behavior: 'chase', action: 'idle', actionTick: 0, statuses: {}, statusUntilTick: {},
    };
  }
  for (let index = 0; index < 180; index += 1) {
    const roomId = roomIds[index % roomIds.length];
    state.projectiles[`benchmark-projectile-${index}`] = {
      id: `benchmark-projectile-${index}`, roomId, kind: index % 3 ? 'fireball' : 'death_ball',
      ownerId: 'player-1', x: 60 + (index * 29) % 820, y: 60 + (index * 41) % 580,
      vx: 260, vy: index % 2 ? 120 : -120, radius: index % 3 ? 7 : 28,
      damage: 28, hostile: false, pierce: 0, expiresTick: state.tick + 32,
      hitIds: [], trail: [], behavior: 'straight', spawnedBy: 'benchmark',
    };
  }
}

function filterToRoom(payload, roomId) {
  const entities = Object.fromEntries(Object.entries(payload.entities).map(([collection, records]) => {
    if (collection === 'players') return [collection, records];
    return [collection, Object.fromEntries(Object.entries(records).filter(([, entity]) => entity.roomId === roomId))];
  }));
  return { ...payload, entities };
}

function compactDynamicRecords(payload) {
  const compact = structuredClone(payload);
  const transform = entity => ({
    id: entity.id, roomId: entity.roomId, kind: entity.kind || entity.type,
    x: Math.round(Number(entity.x || 0) * 8), y: Math.round(Number(entity.y || 0) * 8),
    vx: Math.round(Number(entity.vx || 0) * 8), vy: Math.round(Number(entity.vy || 0) * 8),
    r: Math.round(Number(entity.radius || entity.r || 0) * 8),
    hp: Math.round(Number(entity.hp || 0)), expiresTick: entity.expiresTick,
  });
  ['enemies', 'projectiles', 'abilityEntities'].forEach(collection => {
    compact.entities[collection] = Object.fromEntries(Object.entries(compact.entities[collection] || {})
      .map(([id, entity]) => [id, transform(entity)]));
  });
  return compact;
}

// Candidate binary/array-schema shape expressed as JSON for a conservative
// estimate. The real protocol would send these arrays as a binary frame, so
// this deliberately understates its eventual win. Only dynamic render fields
// travel; static content is already shared by the client build.
function packedDynamicRecords(payload) {
  const dictionaries = { rooms: [], kinds: [], ids: [] };
  const indexOf = (list, value) => {
    const normalized = String(value || '');
    let index = list.indexOf(normalized);
    if (index < 0) { index = list.length; list.push(normalized); }
    return index;
  };
  const pack = entity => [
    indexOf(dictionaries.ids, entity.id),
    indexOf(dictionaries.rooms, entity.roomId),
    indexOf(dictionaries.kinds, entity.kind || entity.type),
    Math.round(Number(entity.x || 0) * 8), Math.round(Number(entity.y || 0) * 8),
    Math.round(Number(entity.vx || 0) * 8), Math.round(Number(entity.vy || 0) * 8),
    Math.round(Number(entity.radius || entity.r || 0) * 8), Math.round(Number(entity.hp || 0)),
    Math.round(Number(entity.max || entity.maxHp || 0)), Math.round(Number(entity.expiresTick || 0)),
    entity.hostile ? 1 : 0,
  ];
  return {
    q: payload.snapshotSequence, t: payload.serverTick, f: payload.full ? 1 : 0,
    a: payload.lastProcessedInput,
    e: {
      p: Object.values(payload.entities.players || {}).map(pack),
      n: Object.values(payload.entities.enemies || {}).map(pack),
      j: Object.values(payload.entities.projectiles || {}).map(pack),
      a: Object.values(payload.entities.abilityEntities || {}).map(pack),
      k: Object.values(payload.entities.pickups || {}).map(pack),
      i: Object.values(payload.entities.interactables || {}).map(pack),
    },
    d: dictionaries,
  };
}

function printRow(name, value, baseline) {
  const saved = Math.max(0, baseline - value);
  process.stdout.write(`${name.padEnd(40)} ${String(value).padStart(8)} B  save ${String(saved).padStart(8)} B (${percent(saved, baseline)})\n`);
}

function emptyEntityCollections() {
  return { players: {}, enemies: {}, projectiles: {}, abilityEntities: {}, pickups: {}, interactables: {} };
}

async function main() {
  const { authority, client, clientTransport, clock } = await createRunningHarness();
  const roomIds = authority.simulation.state.floorState.layout.rooms.slice(0, 3).map(room => room.id);
  addBusyRoomState(authority, roomIds);
  const snapshots = [];
  clientTransport.onMessage((_peerId, message) => {
    if (message.type === 'WORLD_SNAPSHOT') snapshots.push(message.payload);
  });

  authority._publishSnapshot(true);
  clock.runAll();
  const scopedBootstrap = snapshots.at(-1);
  Object.values(authority.simulation.state.projectiles).forEach(projectile => { projectile.x += projectile.vx / 20; });
  authority._publishSnapshot(false);
  clock.runAll();
  const packedProjectileDelta = snapshots.at(-1);

  const playerRoomId = authority.simulation.state.players[client.playerId].roomId;
  const allEntities = Object.fromEntries(['players', 'enemies', 'projectiles', 'abilityEntities', 'pickups', 'interactables']
    .map(collection => [collection, authority.simulation.state[collection] || {}]));
  const legacyFull = { ...scopedBootstrap, packedDynamic: undefined, entities: allEntities };
  const legacyProjectileDelta = {
    ...packedProjectileDelta,
    packedDynamic: undefined,
    entities: { ...emptyEntityCollections(), projectiles: authority.simulation.state.projectiles },
  };
  const scopedLegacyDelta = filterToRoom(legacyProjectileDelta, playerRoomId);
  const scenarios = [
    ['Legacy full snapshot, JSON', bytes(legacyFull)],
    ['Scoped full bootstrap, JSON', bytes(scopedBootstrap)],
    ['Legacy full, gzip estimate', gzipBytes(legacyFull)],
    ['Legacy delta (180 moving projectiles)', bytes(legacyProjectileDelta)],
    ['Legacy delta, local-room interest', bytes(scopedLegacyDelta)],
    ['Implemented packed local-room delta', bytes(packedProjectileDelta)],
    ['Legacy delta, gzip estimate', gzipBytes(legacyProjectileDelta)],
  ];

  process.stdout.write('Multiplayer wire benchmark (synthetic 3-room combat: 90 enemies, 180 projectiles)\n');
  process.stdout.write(`Player room: ${playerRoomId}; snapshot rate: 10 Hz\n\n`);
  process.stdout.write(`Measured delta: full=${packedProjectileDelta.full}, entities=${bytes(packedProjectileDelta.entities)} B, packed=${bytes(packedProjectileDelta.packedDynamic || {})} B, floor=${bytes(packedProjectileDelta.floorState)} B\n\n`);
  const fullBaseline = scenarios[0][1];
  scenarios.slice(0, 3).forEach(([name, value]) => printRow(name, value, fullBaseline));
  process.stdout.write('\n');
  const deltaBaseline = scenarios[3][1];
  scenarios.slice(3).forEach(([name, value]) => printRow(name, value, deltaBaseline));
  const packedDeltaBytes = scenarios[5][1];
  const gates = {
    scopedBootstrapSmallerThanLegacy: scenarios[1][1] < fullBaseline,
    packedDeltaUnder8KiB: packedDeltaBytes < 8 * 1024,
    packedDeltaSavesAtLeast80Percent: 1 - packedDeltaBytes / deltaBaseline >= 0.8,
  };
  process.stdout.write(`\nAcceptance: ${JSON.stringify(gates)}\n`);
  if (process.argv.includes('--enforce') && Object.values(gates).includes(false)) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
