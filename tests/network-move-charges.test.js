const { FIXED_DELTA_SECONDS } = require('../js/simulation/GameSimulation');
const { createCampaignSimulation, createCampaignPlayer } = require('../js/simulation/CampaignSimulation');
const { readMoveChargeState } = require('../js/simulation/NetworkCombatSystem');

// The authority used to model every move as one binary cooldown
// (moveCooldownUntilTick[moveKey]), so multi-charge moves collapsed to a single
// charge in multiplayer: Thorn's 2-charge dash, Warp's 4, Zoomies/Lightning
// Cross/Nail Shot's 2. It now carries a real { charges, maxCharges, timers[] }
// pool per move, mirroring the campaign's model in game-state.js.
function run(characterKey = 'thorn_knight') {
  const simulation = createCampaignSimulation({
    matchId: 'charge-run',
    matchSeed: 'charge-seed',
    floorSeed: 'charge-seed|floor:1',
    contentVersion: 'charge-parity',
  });
  simulation.state.players.p1 = createCampaignPlayer({
    id: 'p1', characterKey, roomId: simulation.state.floorState.currentRoomId,
  });
  const player = simulation.state.players.p1;
  player.x = 450;
  player.y = 350;
  return { simulation, player };
}

const dashInput = { actions: [{ action: 'DASH', abilityId: 'dash', aimDirection: 0 }] };

// Step one tick with no input so a queued action isn't repeated.
function idle(simulation) {
  simulation.updateGame({ p1: {} }, FIXED_DELTA_SECONDS);
}

describe('authority move charges', () => {
  test('Thorn can spend two dash charges back to back', () => {
    const { simulation, player } = run('thorn_knight');

    simulation.updateGame({ p1: dashInput }, FIXED_DELTA_SECONDS);
    const pool = player.moveChargeState?.dash;
    expect(pool).toBeDefined();
    expect(pool.maxCharges).toBe(2);
    expect(pool.charges).toBe(1); // one spent, one still in hand

    // The second dash must be accepted immediately — this is the bug that made
    // Thorn feel like he only had one dash in multiplayer.
    simulation.updateGame({ p1: dashInput }, FIXED_DELTA_SECONDS);
    expect(player.moveChargeState.dash.charges).toBe(0);

    // With the pool empty the third dash is refused.
    simulation.updateGame({ p1: dashInput }, FIXED_DELTA_SECONDS);
    expect(player.moveChargeState.dash.charges).toBe(0);
    expect(player.moveChargeState.dash.timers.length).toBe(2);
  });

  test('the same dash move on another character stays single-charge', () => {
    // Turtle Boy equips the identical 'dash' move, so this isolates the
    // per-character override that multiplayer previously ignored entirely.
    const { simulation, player } = run('turtle_boy');

    simulation.updateGame({ p1: dashInput }, FIXED_DELTA_SECONDS);
    const pool = player.moveChargeState?.dash;
    expect(pool.maxCharges).toBe(1);
    expect(pool.charges).toBe(0);
  });

  test('Warp carries all four of its charges', () => {
    const { simulation, player } = run('metao');
    const warpInput = { actions: [{ action: 'DASH', abilityId: 'warp', aimDirection: 0 }] };

    for (let cast = 0; cast < 4; cast += 1) {
      simulation.updateGame({ p1: warpInput }, FIXED_DELTA_SECONDS);
      idle(simulation);
    }
    const pool = player.moveChargeState?.warp;
    expect(pool.maxCharges).toBe(4);
    expect(pool.charges).toBe(0);
    expect(pool.timers.length).toBe(4);
  });

  test('charges refill one at a time as their timers expire', () => {
    const { simulation, player } = run('thorn_knight');

    simulation.updateGame({ p1: dashInput }, FIXED_DELTA_SECONDS);
    idle(simulation);
    simulation.updateGame({ p1: dashInput }, FIXED_DELTA_SECONDS);

    const pool = player.moveChargeState.dash;
    expect(pool.charges).toBe(0);
    expect(pool.timers.length).toBe(2);

    // The two timers were started a tick apart, so the first charge must come
    // back before the second — not both at once.
    const [firstReady, secondReady] = [...pool.timers].sort((a, b) => a - b);
    expect(firstReady).toBeLessThan(secondReady);

    let sawPartialRefill = false;
    for (let step = 0; step < 400; step += 1) {
      idle(simulation);
      if (pool.charges === 1 && pool.timers.length === 1) sawPartialRefill = true;
      if (pool.charges >= 2) break;
    }
    expect(sawPartialRefill).toBe(true);
    expect(pool.charges).toBe(2);
    expect(pool.timers.length).toBe(0);
  });

  test('an Extra Battery bought mid-run grows the pool and is spendable', () => {
    const { simulation, player } = run('thorn_knight');
    player.moveStackOverrides = { dash: 3 };

    const spentAt = [];
    for (let cast = 0; cast < 5; cast += 1) {
      simulation.updateGame({ p1: dashInput }, FIXED_DELTA_SECONDS);
      spentAt.push(player.moveChargeState.dash.timers.length);
      idle(simulation);
    }
    const pool = player.moveChargeState.dash;
    expect(pool.maxCharges).toBe(3);
    // Three casts landed, the two beyond the pool were refused.
    expect(spentAt).toEqual([1, 2, 3, 3, 3]);
    expect(pool.charges).toBe(0);
  });

  // Pools are created lazily on first cast, so a never-cast move has no stored
  // pool. Readers that index player.moveChargeState directly see undefined and
  // fall back to single-charge, which made Thorn's dash render 1 pip at spawn and
  // grow to 2 after his first dash. readMoveChargeState derives the real values
  // for a move that has never been used.
  describe('reading charges before a move has ever been cast', () => {
    test('Thorn reads a full 2/2 dash at spawn, not 1/1', () => {
      const { player } = run('thorn_knight');
      expect(player.moveChargeState.dash).toBeUndefined(); // no pool yet

      const pool = readMoveChargeState(player, 'dash');
      expect(pool.maxCharges).toBe(2);
      expect(pool.charges).toBe(2);
      expect(pool.timers).toEqual([]);
    });

    test('capacity does not change shape once the move is cast', () => {
      const { simulation, player } = run('thorn_knight');
      const before = readMoveChargeState(player, 'dash').maxCharges;

      simulation.updateGame({ p1: dashInput }, FIXED_DELTA_SECONDS);
      const after = readMoveChargeState(player, 'dash');

      expect(after.maxCharges).toBe(before); // the HUD pip count must stay put
      expect(after.charges).toBe(1);
    });

    test('a never-cast Warp reads all four charges', () => {
      const { player } = run('metao');
      expect(readMoveChargeState(player, 'warp')).toMatchObject({ charges: 4, maxCharges: 4 });
    });

    test('reading does not create or mutate the stored pool', () => {
      const { player } = run('thorn_knight');
      readMoveChargeState(player, 'dash');
      // A client rendering a snapshot must never write authority state.
      expect(player.moveChargeState.dash).toBeUndefined();
    });

    test('an Extra Battery is reflected before the next cast', () => {
      const { player } = run('thorn_knight');
      player.moveStackOverrides = { dash: 3 };
      expect(readMoveChargeState(player, 'dash')).toMatchObject({ charges: 3, maxCharges: 3 });
    });
  });

  test('the cooldown mirror reads ready while a charge is in hand', () => {
    const { simulation, player } = run('thorn_knight');

    simulation.updateGame({ p1: dashInput }, FIXED_DELTA_SECONDS);
    // One charge spent, one left: anything gating on moveCooldownUntilTick must
    // still see the move as available.
    expect(player.moveChargeState.dash.charges).toBe(1);
    expect(Number(player.moveCooldownUntilTick.dash || 0)).toBe(0);

    idle(simulation);
    simulation.updateGame({ p1: dashInput }, FIXED_DELTA_SECONDS);
    // Pool empty: the mirror now points at the soonest timer.
    expect(player.moveChargeState.dash.charges).toBe(0);
    expect(Number(player.moveCooldownUntilTick.dash || 0)).toBeGreaterThan(simulation.state.tick);
  });
});
