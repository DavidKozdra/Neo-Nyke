const { RandomService } = require('../js/simulation/RandomService');
const { applySpecialRoomChoice, CHOICE_IDS } = require('../js/simulation/SharedSpecialRoomSystem');

function harness(type, player = {}) {
  const room = { id: type, gx: 1, gy: 1, type, serviceUsed: false };
  const rooms = [room, { id: 'combat', gx: 2, gy: 1, type: 'combat', visited: false, explored: false }, { id: 'exit', gx: 3, gy: 1, type: 'ladder', visited: false, explored: false }];
  return {
    state: { floorNumber: 4, floorState: { layout: { rooms } }, matchRules: {} }, room,
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
});
