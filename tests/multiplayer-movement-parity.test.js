const fs = require('node:fs');
const path = require('node:path');
const rules = require('../js/simulation/CampaignMovementRules');
const interior = require('../js/simulation/SharedRoomInteriorSystem');
const { createCampaignMovementSystem } = require('../js/simulation/CampaignSimulation');
const { NetworkGameView, predictPosition } = require('../js/rendering/NetworkGameView');

const geometry = { width: 900, height: 700, wallThickness: 28, doorWidth: 140 };
const dt = 0.05;

// Execute the actual single-player velocity branch and moveCircle adapter.
// Comparing two instances of the headless authority would miss campaign drift.
const updateSource = fs.readFileSync(path.join(__dirname, '../js/core/update.js'), 'utf8');
const velocityStart = updateSource.indexOf('    if (playerStunned) {\n      Neo.player.dashTime = 0;');
const velocityEnd = updateSource.indexOf('    // Water is impassable', velocityStart);
if (velocityStart < 0 || velocityEnd < 0) throw new Error('Campaign movement branch is unavailable');
const campaignStep = new Function('Neo', 'simulationApi', 'dt', 'itemStats', 'moveX', 'moveY', `
  const playerStunned = Number(Neo.player.stun || 0) > 0;
  ${updateSource.slice(velocityStart, velocityEnd)}
  ${updateSource.match(/Neo\.player\.stun = [^;]+;/)[0]}
`);
const enemiesSource = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');
const circleStart = enemiesSource.indexOf('  function getRoomMoveBounds(');
const circleEnd = enemiesSource.indexOf('  // Expose on Neo', circleStart);
const campaignCircle = new Function('Neo', `${enemiesSource.slice(circleStart, circleEnd)}; return moveCircle;`);

function player(extra = {}) {
  return {
    id: 'p1', roomId: 'r1', x: 450, y: 350, vx: 0, vy: 0, radius: 14,
    moveSpeed: 228, itemStats: { moveSpeedMultiplier: 1 }, ...extra,
  };
}

describe('single-player and multiplayer movement parity', () => {
  test.each([
    ['start, stop, turn, diagonal and analog', {}],
    ['stun preserves knockback and cancels dash', { vx: 120, vy: -70, stunnedUntilTick: 4, dashUntilTick: 12, dashVx: 500 }],
    ['slow affects a dash and its recovery', { dashUntilTick: 4, dashVx: 300, statuses: { slow: { stacks: 3 } } }],
    ['flight, items and beam weight', { statusUntilTick: { flying_unhitable: 6 }, beamChannel: {}, itemStats: { moveSpeedMultiplier: 1.4, laserWeightMultiplier: 0.5 } }],
    ['ordinary wall collision', { x: 850, y: 240 }],
    ['pillar collision and sliding', { x: 475, y: 425 }],
    ['overlap recovery', { x: 505, y: 424 }],
  ])('%s follows the rendered campaign controller', (_name, extra) => {
    const room = { id: 'r1', doors: {}, structures: [{ kind: 'pillar', x: 510, y: 400, w: 48, h: 64 }], destructibles: [] };
    const floorState = { ...geometry, layout: { rooms: [room] } };
    const authoritative = player(structuredClone(extra));
    let predicted = structuredClone(authoritative);
    const local = {
      ...structuredClone(authoritative), r: 14, inv: 0,
      stun: (extra.stunnedUntilTick || 0) * dt,
      dashTime: (extra.dashUntilTick || 0) * dt, dashX: extra.dashVx || 0, dashY: extra.dashVy || 0,
      princessFlightTime: (extra.statusUntilTick?.flying_unhitable || 0) * dt,
    };
    const walls = interior.getCampaignRoomWallRects(geometry);
    const neo = {
      player: local, currentRoom: room, ROOM_W: 900, ROOM_H: 700, WALL: 28, DOOR: 140,
      PLAYER_BASE_MOVE_SPEED: 228, nextRandom: () => 1, laserActive: !!extra.beamChannel,
      getSlowMultiplier: actor => rules.getCampaignPlayerSlowMultiplier(actor),
      isBlocked: (x, y, radius) => walls.some(wall => {
        const nx = Math.max(wall.x, Math.min(x, wall.x + wall.w));
        const ny = Math.max(wall.y, Math.min(y, wall.y + wall.h));
        return Math.hypot(x - nx, y - ny) < radius;
      }) || interior.getRoomObstacles(room).some(obstacle => interior.circleIntersectsRoomObstacle(x, y, radius, obstacle)),
    };
    neo.moveCircle = campaignCircle(neo);
    const state = { tick: 0, players: { p1: authoritative }, floorState };
    const system = createCampaignMovementSystem();
    for (let tick = 0; tick < 32; tick += 1) {
      const input = tick < 8 ? { moveX: 1, moveY: 0 }
        : tick < 12 ? { moveX: -1, moveY: 0 }
          : tick < 17 ? { moveX: 0, moveY: 1 }
            : tick < 22 ? { moveX: Math.SQRT1_2, moveY: Math.SQRT1_2 }
              : tick < 27 ? { moveX: 0.25, moveY: -0.5 } : { moveX: 0, moveY: 0 };
      campaignStep(neo, rules, dt, local.itemStats, input.moveX, input.moveY);
      system({ state, inputs: { p1: input }, fixedDelta: dt });
      predicted = predictPosition(predicted, input, dt, floorState, tick);
      for (const key of ['x', 'y', 'vx', 'vy']) {
        expect(authoritative[key]).toBeCloseTo(local[key], 8);
        expect(predicted[key]).toBeCloseTo(local[key], 8);
      }
      local.princessFlightTime = Math.max(0, local.princessFlightTime - dt - 1e-10);
      state.tick += 1;
    }
  });
});

describe('local movement presentation under snapshots', () => {
  let now;
  let originalPerformance;
  beforeEach(() => {
    now = 1000;
    originalPerformance = globalThis.performance;
    globalThis.performance = { now: () => now };
  });
  afterEach(() => { globalThis.performance = originalPerformance; });

  function setup(extra = {}) {
    let sequence = 0;
    const session = { playerId: 'p1', status: 'running', sendInput: jest.fn(() => sequence++) };
    const view = new NetworkGameView({ session, neo: {} });
    view.active = true;
    view._onSnapshot({ playerId: 'p1', snapshotSequence: 0, gameState: {
      tick: 20, floorNumber: 1, floorState: geometry, players: { p1: player(extra) },
    } });
    return view;
  }

  test('keyboard changes are sent immediately and preserve fractional displayed motion', () => {
    const view = setup();
    const event = { code: 'KeyD', key: 'd', preventDefault() {} };
    view._onKey(event, true);
    expect(view.session.sendInput).toHaveBeenLastCalledWith(expect.objectContaining({ moveX: 1 }));
    now += 33;
    const before = view._renderedPlayers(now).p1;
    expect(before.x).toBeGreaterThan(450);
    view._onKey(event, false);
    const stopped = view._renderedPlayers(now).p1;
    expect(stopped.x).toBeCloseTo(before.x, 10);
    expect(view.session.sendInput).toHaveBeenLastCalledWith(expect.objectContaining({ moveX: 0 }));
    expect(view.pendingInputHistory[0].durationMs).toBeCloseTo(33);
    now += 17;
    expect(view._renderedPlayers(now).p1.x).toBeCloseTo(stopped.x, 10);
  });

  test.each([30, 60, 120, 144])('renders a linear campaign step at %s fps', fps => {
    const view = setup({ vx: 228 });
    view.keys.add('KeyD');
    view._sendInput();
    const end = now + 1000;
    const start = now;
    while (now < end) {
      now = Math.min(end, now + 1000 / fps);
      const rendered = view._renderedPlayers(now).p1;
      expect(rendered.x).toBeCloseTo(450 + 228 * (now - start) / 1000, 8);
    }
  });

  test('a matching delayed snapshot adds no correction or second fractional movement', () => {
    const view = setup({ vx: 228 });
    view.keys.add('KeyD');
    view._sendInput();
    now = 1125;
    const before = view._renderedPlayers(now).p1;
    view._onSnapshot({ playerId: 'p1', snapshotSequence: 1, lastAcknowledgedInput: 0, snapshotAgeMs: 25,
      gameState: { tick: 22, floorNumber: 1, floorState: geometry, players: { p1: player({ x: 472.8, vx: 228 }) } },
    });
    expect(view.reconciliationOffset).toBeNull();
    expect(view._renderedPlayers(now).p1.x).toBeCloseTo(before.x, 8);
  });

  test.each([
    ['right', 1, 30, 50],
    ['left', -1, 60, 100],
    ['right', 1, 120, 150],
    ['left', -1, 144, 50],
    ['right then left', 1, 60, 100, true],
    ['left then right', -1, 144, 100, true],
  ])('%s stops without delayed travel (axis %s, %s fps, %s ms one-way latency)', (
    _name, direction, fps, latencyMs, reverse = false,
  ) => {
    const view = setup();
    view.session.client = { diagnostics: { rttMs: latencyMs * 2 } };
    const state = { tick: 20, floorState: geometry, players: { p1: player() } };
    const movement = createCampaignMovementSystem();
    const inputs = [];
    const snapshots = [];
    let sequence = 0;
    let snapshotSequence = 0;
    let acknowledged = -1;
    let serverInput = { moveX: 0, moveY: 0 };
    let nextFrame = now;
    let releasedX;
    let maxTravelAfterRelease = 0;
    let previousX = 450;
    let maxBackwardStep = 0;
    view.session.sendInput = input => {
      inputs.push({ at: now + latencyMs, input, sequence });
      return sequence++;
    };
    const key = value => ({
      code: value > 0 ? 'KeyD' : 'KeyA', key: value > 0 ? 'd' : 'a', preventDefault() {},
    });

    // Run the real authority controller on its own 20 Hz clock. Commands and
    // 10 Hz snapshots each cross a delayed link; rendering uses a separate clock.
    // Both keyboard edges fall between server ticks and presentation frames.
    for (now = 1001; now <= 2500; now += 1) {
      if (now === 1111) view._onKey(key(direction), true);
      if (reverse && now === 1411) {
        view._onKey(key(direction), false);
        view._onKey(key(-direction), true);
      }
      if (now === 1711) {
        view._onKey(key(reverse ? -direction : direction), false);
        releasedX = view._renderedPlayers(now).p1.x;
      }
      while (inputs.length && inputs[0].at <= now) {
        const received = inputs.shift();
        serverInput = received.input;
        acknowledged = received.sequence;
      }
      if (now % 50 === 0) {
        movement({ state, inputs: { p1: serverInput }, fixedDelta: dt });
        state.tick += 1;
      }
      if (now % 100 === 0) {
        snapshots.push({
          at: now + latencyMs, playerId: 'p1', snapshotSequence: ++snapshotSequence,
          lastAcknowledgedInput: acknowledged, snapshotAgeMs: latencyMs,
          gameState: structuredClone(state),
        });
      }
      while (snapshots.length && snapshots[0].at <= now) view._onSnapshot(snapshots.shift());
      if (now >= nextFrame) {
        nextFrame += 1000 / fps;
        view._sendInput();
        const x = view._renderedPlayers(now).p1.x;
        if (!reverse && now > 1200 && now < 1711) {
          maxBackwardStep = Math.max(maxBackwardStep, (previousX - x) * direction);
        }
        if (releasedX != null) maxTravelAfterRelease = Math.max(maxTravelAfterRelease, Math.abs(x - releasedX));
        previousX = x;
      }
    }

    // Tick sampling can leave a small fractional-step correction. It must not
    // cause the old latency-sized slide or reverse a held direction.
    expect(maxBackwardStep).toBeLessThan(0.1);
    expect(maxTravelAfterRelease).toBeLessThan(4);
    expect(view._renderedPlayers(now).p1.x).toBeCloseTo(state.players.p1.x, 8);
  });

  test('an acknowledged release retires older movement even when the clock estimate trails it', () => {
    const view = setup({ vx: 228 });
    view.session.client = { diagnostics: { rttMs: 200 } };
    const key = { code: 'KeyD', key: 'd', preventDefault() {} };
    view._onKey(key, true);
    now = 1100;
    view._onKey(key, false);
    now = 1150;
    view._onSnapshot({
      playerId: 'p1', snapshotSequence: 1, lastAcknowledgedInput: 1, snapshotAgeMs: 100,
      gameState: { tick: 23, floorState: geometry, players: { p1: player({ x: 472.8 }) } },
    });
    expect(view.pendingInputHistory.every(entry => entry.input.moveX === 0)).toBe(true);
    now = 1500;
    expect(view._renderedPlayers(now).p1.x).toBeCloseTo(472.8, 8);
  });

  test('a newer server tick cannot erase a direction change still in transit', () => {
    const view = setup();
    view.keys.add('KeyD');
    view._sendInput();
    now = 1100;
    view._renderedPlayers(now);
    view._onSnapshot({ playerId: 'p1', snapshotSequence: 1, lastAcknowledgedInput: -1, snapshotAgeMs: 50,
      gameState: { tick: 23, floorNumber: 1, floorState: geometry, players: { p1: player() } },
    });
    expect(view.pendingInputHistory).toHaveLength(2);
    expect(view.localPredictedPlayer.x).toBeGreaterThan(465);
  });

  test('a 144 Hz stick remains responsive without flooding the 20 Hz input channel', () => {
    const view = setup();
    let x = 0.2;
    view._readMovement = () => ({ moveX: x, moveY: 0 });
    view._sendInput();
    for (let frame = 1; frame <= 144; frame += 1) {
      now = 1000 + frame * 1000 / 144;
      x = 0.2 + 0.6 * Math.abs(Math.sin(frame / 30));
      view._sendInput();
      expect(view.lastLocalPredictionInput.moveX).toBe(x);
    }
    expect(view.localPredictedPlayer.x).toBeGreaterThan(500);
    expect(view.session.sendInput.mock.calls.length).toBeLessThanOrEqual(22);
    expect(view.pendingInputHistory.filter(entry => entry.durationMs === 50)).toHaveLength(20);
  });

  test('touch has the same final movement deadzone as the campaign', () => {
    expect(rules.resolveCampaignMovementInput(0.09, 0)).toEqual({ moveX: 0, moveY: 0 });
    expect(rules.resolveCampaignMovementInput(0.12, 0)).toEqual({ moveX: 0.12, moveY: 0 });
  });

  test.each(['dash', 'warp'])('an older world sample cannot undo a pending %s', abilityId => {
    const view = setup();
    const cast = view._predictLocalAbility(abilityId, 'dash', { dashMoveX: 1, targetX: 600, targetY: 350 });
    now = 1100;
    const before = view._renderedPlayers(now).p1;
    view._onSnapshot({ playerId: 'p1', snapshotSequence: 1, lastAcknowledgedInput: -1,
      gameState: { tick: 22, floorState: geometry, players: { p1: player({ hp: 75 }) } },
    });
    expect(view._renderedPlayers(now).p1.x).toBeCloseTo(before.x, 8);
    expect(view.localPredictedPlayer.hp).toBe(75);
    const dashUntil = view.localPredictedPlayer.dashUntilTick;
    view._consumeGameplayEvents([{
      eventId: 'confirmed-cast', tick: 23, eventType: 'PLAYER_ABILITY_USED',
      data: { ...cast.event.data, predictionId: cast.event.eventId },
    }], 23);
    expect(view.localPredictedPlayer.dashUntilTick).toBe(dashUntil);
    expect(view._renderedPlayers(now).p1.x).toBeCloseTo(before.x, 8);
    expect(view.pendingMovementPrediction.confirmedTick).toBe(23);
  });

  test('a rejected dash cannot continue its speculative glide', () => {
    const view = setup();
    const cast = view._predictLocalAbility('dash', 'dash', { dashMoveX: 1 });
    view._rejectPredictedCombatEvent(cast.event.eventId);
    expect(view.pendingMovementPrediction).toBeNull();
    now = 1100;
    expect(view._renderedPlayers(now).p1.x).toBe(450);
  });

  test.each(['flying_unhitable', 'mooggy_zoomies', 'turtle_powerup'])('%s changes movement on the input frame', abilityId => {
    const view = setup();
    view._predictLocalAbility(abilityId, 'dash', { chargeRatio: 1 });
    view.keys.add('KeyD');
    view._sendInput();
    now = 1050;
    expect(view._renderedPlayers(now).p1.x).toBeGreaterThan(450 + 228 * 0.7 * dt);
  });

  test('a provisional beam applies campaign movement weight before confirmation', () => {
    const view = setup();
    view._startPredictedBeamPresentation('blood_beam');
    view.keys.add('KeyD');
    view.keyboardLaserHeld = true;
    view._sendInput();
    now = 1050;
    expect(view._renderedPlayers(now).p1.x).toBeCloseTo(450 + 228 * 0.4 * 0.7 * dt);
  });

  test('paused and downed heroes cannot accumulate speculative travel', () => {
    const view = setup({ downed: true, vx: 228 });
    view.lastLocalPredictionInput = { moveX: 1 };
    now = 1200;
    expect(view._renderedPlayers(now).p1.x).toBe(450);
    view.paused = true;
    const tick = view.localPredictionTick;
    now = 5000;
    expect(view._renderedPlayers(now).p1.x).toBe(450);
    expect(view.localPredictionTick).toBe(tick);
  });

  test('floor changes discard old movement even when room ids are reused', () => {
    const view = setup();
    view.keys.add('KeyD');
    view._sendInput();
    now = 1100;
    view._renderedPlayers(now);
    view._onSnapshot({ playerId: 'p1', snapshotSequence: 1, lastAcknowledgedInput: -1,
      gameState: { tick: 23, floorNumber: 2, floorState: geometry, players: { p1: player({ x: 100 }) } },
    });
    expect(view.pendingInputHistory).toHaveLength(0);
    expect(view.reconciliationOffset).toBeNull();
    expect(view._renderedPlayers(now).p1.x).toBe(100);
  });

  test('snapshot correction does not animate an idle local hero as running', () => {
    const view = setup();
    const state = view.currentSample.state;
    view._syncCampaignPresentationEntities({ p1: player({ vx: 228 }) }, {}, 'p1', state, 1 / 60);
    expect(view.presentationPlayerActors.get('p1').vx).toBe(228);
    view._syncCampaignPresentationEntities({ p1: player({ x: 455, vx: 0 }) }, {}, 'p1', state, 1 / 60);
    expect(view.presentationPlayerActors.get('p1').vx).toBe(0);
  });
});
