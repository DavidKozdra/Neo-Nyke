const { RandomService } = require('../js/simulation/RandomService');
const { applySpecialRoomChoice, CHOICE_IDS } = require('../js/simulation/SharedSpecialRoomSystem');

function harness(type, player = {}) {
  const room = { id: type, gx: 1, gy: 1, type, serviceUsed: false };
  const rooms = [room, { id: 'combat', gx: 2, gy: 1, type: 'combat', visited: false, explored: false }, { id: 'exit', gx: 3, gy: 1, type: 'ladder', visited: false, explored: false }];
  return {
    state: { floorNumber: 4, runLoopIndex: 19, floorState: { runLoopIndex: 19, layout: { rooms } }, matchRules: {} }, room,
    player: { hp: 100, maxHp: 120, coins: 500, xp: 0, xpToNext: 20, attackPower: 10, items: { neo_knife: 2, tough_bandaid: 1 }, ...player },
    random: new RandomService({ matchSeed: `special-${type}` }).stream('choice'),
  };
}

describe('shared special-room choices', () => {
  test.each(Object.entries(CHOICE_IDS).map(([type, choices]) => [type, choices[0]]))('%s resolves through the shared operation', (type, choiceId) => {
    const h = harness(type);
    const result = applySpecialRoomChoice(h.state, h.room, h.player, choiceId, h.random);
    expect(result.ok).toBe(true);
    expect(h.room).toMatchObject({ serviceUsed: true, serviceResult: expect.any(String) });
  });

  test('a consumed service cannot be applied twice', () => {
    const h = harness('prison');
    expect(applySpecialRoomChoice(h.state, h.room, h.player, 'medic', h.random).ok).toBe(true);
    expect(applySpecialRoomChoice(h.state, h.room, h.player, 'veteran', h.random)).toMatchObject({ ok: false });
  });

  test('returns Reliquary XP for the caller to run through campaign progression', () => {
    const h = harness('reliquary', { xp: 19, xpToNext: 20, items: { neo_knife: 1 } });

    const result = applySpecialRoomChoice(h.state, h.room, h.player, 'distill', h.random);

    expect(result).toMatchObject({ ok: true, xp: 15 });
    expect(h.player.xp).toBe(19);
  });

  test('oracle map vision dispels the Princess map curse', () => {
    const h = harness('oracle');
    h.state.floorState.curses = { obscureMap: true };
    h.state.matchRules = {
      obscureMap: true,
      rivalCurses: { obscureMap: true, reducePotions: true },
    };

    expect(applySpecialRoomChoice(h.state, h.room, h.player, 'map', h.random).ok).toBe(true);
    expect(h.state.floorState.curses.obscureMap).toBe(false);
    expect(h.state.matchRules.obscureMap).toBe(false);
    expect(h.state.matchRules.rivalCurses).toMatchObject({ obscureMap: false, reducePotions: true });
    expect(h.state.floorState.layout.rooms.filter(room => !room.secret).every(room => room.explored)).toBe(true);
  });

  test('portal vault follows an active bounty target before treasure and service rooms', () => {
    const h = harness('portal', { activeBounty: { targetRoomKey: '7,4' } });
    h.state.floorState.layout.rooms.splice(
      1,
      0,
      { id: 'service', gx: 4, gy: 4, type: 'prison', visited: false },
      { id: 'treasure', gx: 5, gy: 4, type: 'treasure', visited: false },
      { id: 'quarry', gx: 7, gy: 4, type: 'combat', visited: true },
    );

    expect(applySpecialRoomChoice(h.state, h.room, h.player, 'vault', h.random)).toMatchObject({
      ok: true,
      transitionToRoomId: 'quarry',
      result: 'Portal locked onto the quarry',
    });
  });

  test('portal vault prefers treasure, then an unvisited service, and otherwise rejects', () => {
    const treasure = harness('portal');
    treasure.state.floorState.layout.rooms.splice(
      1,
      0,
      { id: 'service', gx: 4, gy: 4, type: 'oracle', visited: false },
      { id: 'treasure', gx: 5, gy: 4, type: 'treasure', visited: false },
    );
    expect(applySpecialRoomChoice(treasure.state, treasure.room, treasure.player, 'vault', treasure.random)).toMatchObject({
      ok: true,
      transitionToRoomId: 'treasure',
    });

    const service = harness('portal');
    service.state.floorState.layout.rooms.splice(
      1,
      service.state.floorState.layout.rooms.length - 1,
      { id: 'visited-treasure', gx: 5, gy: 4, type: 'treasure', visited: true },
      { id: 'service', gx: 4, gy: 4, type: 'oracle', visited: false },
    );
    expect(applySpecialRoomChoice(service.state, service.room, service.player, 'vault', service.random)).toMatchObject({
      ok: true,
      transitionToRoomId: 'service',
    });

    const nowhere = harness('portal');
    nowhere.state.floorState.layout.rooms.splice(1);
    expect(applySpecialRoomChoice(nowhere.state, nowhere.room, nowhere.player, 'vault', nowhere.random)).toEqual({
      ok: false,
      reason: 'NO_DESTINATION',
    });
    expect(nowhere.room.serviceUsed).toBe(false);
  });

  test('portal vault uses visitedRoomIds to exclude visited treasure and service destinations', () => {
    const h = harness('portal');
    h.state.floorState.layout.rooms.splice(
      1,
      h.state.floorState.layout.rooms.length - 1,
      { id: 'treasure', gx: 5, gy: 4, type: 'treasure', visited: false },
      { id: 'service', gx: 4, gy: 4, type: 'oracle', visited: false },
    );
    h.state.floorState.visitedRoomIds = [h.room.id, 'treasure', 'service'];

    expect(applySpecialRoomChoice(h.state, h.room, h.player, 'vault', h.random)).toEqual({
      ok: false,
      reason: 'NO_DESTINATION',
    });
    expect(h.room.serviceUsed).toBe(false);
  });
});
