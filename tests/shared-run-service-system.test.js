const { GameState } = require('../js/simulation/GameState');
const { applyAuthorityRunEvent, getClientRunServiceIntents } = require('../js/simulation/SharedRunServiceSystem');

describe('SharedRunServiceSystem', () => {
  test('serializes authority-owned achievements, tutorial progress and save revision', () => {
    const state = new GameState({ status: 'running', players: { p1: { id: 'p1' } } });
    applyAuthorityRunEvent(state, 'PICKUP_COLLECTED', { playerId: 'p1', itemKey: 'neo_knife', amount: 2 });
    applyAuthorityRunEvent(state, 'FLOOR_ADVANCED', { floorNumber: 2 });
    const restored = GameState.deserialize(state.serialize());
    expect(restored.runServices).toMatchObject({
      saveRevision: 2,
      highestFloor: 2,
      achievementsByPlayer: { p1: { itemsCollected: 2 } },
      tutorialByPlayer: { p1: { relicCollected: true, ladderUsed: true } },
    });
  });

  test('maps authority events to the existing campaign achievement/tutorial services', () => {
    expect(getClientRunServiceIntents('SHOP_PURCHASED', { playerId: 'p1' }, 'p1')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'achievement', name: 'shop:bought' }),
      expect.objectContaining({ kind: 'tutorial', name: 'shop-purchase' }),
    ]));
  });

  test('maps successful Reliquary choices to achievement progress for the acting player', () => {
    expect(getClientRunServiceIntents('SPECIAL_ROOM_CHOICE_APPLIED', {
      playerId: 'p1',
      roomType: 'reliquary',
      choiceId: 'distill',
    }, 'p1')).toContainEqual({
      kind: 'achievement',
      name: 'reliquary:used',
      data: { service: 'distill' },
    });
    expect(getClientRunServiceIntents('SPECIAL_ROOM_CHOICE_APPLIED', {
      playerId: 'p2',
      roomType: 'reliquary',
      choiceId: 'distill',
    }, 'p1')).toEqual([]);
  });
});
