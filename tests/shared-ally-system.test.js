const {
  ALLY_SHOP_CHANCE,
  ALLY_RECRUIT_CAP,
  ITEM_ALLY_RESPAWN_SECONDS,
  generateAllyName,
  generateAllyAppearance,
  generateAllyOffer,
  recruitAlly,
  transferMoveToAlly,
  recallAllyMove,
  damageAlly,
  advanceAllies,
  createSourcedAlly,
} = require('../js/simulation/SharedAllySystem');
const { stockCampaignShop, purchaseCampaignShop } = require('../js/simulation/SharedShopSystem');

function player(overrides = {}) {
  return {
    id: 'p1', teamId: 'players', x: 100, y: 120, roomId: 'room',
    maxHp: 100, hp: 100, baseDamage: 30, level: 1, coins: 10000,
    ownedMoves: { power_disks: true, turtle_wave: true },
    equippedMoves: { laser: 'turtle_wave' },
    moveStackOverrides: { power_disks: 2 },
    recruitedAllyIds: [],
    ...overrides,
  };
}

function offer(index = 0) {
  return generateAllyOffer({
    id: `offer-${index}`,
    random: { next: () => 0.12 + index * 0.03 },
    cost: 100,
  });
}

describe('shared ally generation and lifecycle', () => {
  test('uses the temporary 70% shop visibility chance', () => {
    expect(ALLY_SHOP_CHANCE).toBe(0.70);
  });

  test('names and layered appearances are deterministic and collision-safe', () => {
    expect(generateAllyName(777)).toBe(generateAllyName(777));
    expect(generateAllyAppearance(777, 'ranger')).toEqual(generateAllyAppearance(777, 'ranger'));
    const first = generateAllyName(777);
    expect(generateAllyName(777, [first])).not.toBe(first);
  });

  test('caps purchased recruits at three per player', () => {
    const owner = player();
    const state = { allies: {}, players: { p1: owner }, nextEntityId: 1 };
    for (let index = 0; index < ALLY_RECRUIT_CAP; index += 1) {
      expect(recruitAlly(state, owner, offer(index)).ok).toBe(true);
    }
    expect(recruitAlly(state, owner, offer(9))).toEqual(expect.objectContaining({ ok: false, reason: 'ALLY_ROSTER_FULL' }));
  });

  test('transfers only unequipped moves and returns the full ownership on recall', () => {
    const owner = player();
    const state = { allies: {}, players: { p1: owner }, nextEntityId: 1 };
    const ally = recruitAlly(state, owner, offer()).ally;
    expect(transferMoveToAlly(state, owner, ally.id, 'turtle_wave')).toEqual(expect.objectContaining({ ok: false, reason: 'MOVE_EQUIPPED' }));
    expect(transferMoveToAlly(state, owner, ally.id, 'power_disks')).toEqual(expect.objectContaining({ ok: true, moveKey: 'power_disks' }));
    expect(owner.ownedMoves.power_disks).toBeUndefined();
    expect(ally.transferredMove).toEqual({ key: 'power_disks', ownerId: 'p1' });
    expect(ally.giftedMoveCharges).toBeGreaterThanOrEqual(3);
    expect(recallAllyMove(state, owner, ally.id).ok).toBe(true);
    expect(owner.ownedMoves.power_disks).toBe(true);
    expect(ally.transferredMove).toBeNull();
  });

  test('shop recruits die permanently and atomically return transferred moves', () => {
    const owner = player();
    const state = { allies: {}, players: { p1: owner }, nextEntityId: 1 };
    const ally = recruitAlly(state, owner, offer()).ally;
    transferMoveToAlly(state, owner, ally.id, 'power_disks');
    const result = damageAlly(state, ally.id, 9999, { playersById: state.players });
    expect(result).toEqual(expect.objectContaining({ died: true, respawning: false }));
    expect(ally.status).toBe('dead');
    expect(owner.ownedMoves.power_disks).toBe(true);
    expect(owner.recruitedAllyIds).not.toContain(ally.id);
  });

  test('item allies respawn after fifteen active seconds while move allies expire', () => {
    const owner = player();
    const state = { allies: {}, players: { p1: owner }, nextEntityId: 1 };
    const itemAlly = createSourcedAlly(state, owner, {
      id: 'bug', sourceKind: 'item', sourceKey: 'bug_card', archetypeKey: 'brawler',
    });
    damageAlly(state, itemAlly.id, 9999, { playersById: state.players });
    expect(itemAlly.status).toBe('respawning');
    expect(itemAlly.respawnRemaining).toBe(ITEM_ALLY_RESPAWN_SECONDS);
    advanceAllies(state, 14.95, state.players);
    expect(itemAlly.status).toBe('respawning');
    const events = advanceAllies(state, 0.05, state.players);
    expect(itemAlly.status).toBe('active');
    expect(itemAlly.health).toBe(itemAlly.maxHealth);
    expect(events).toContainEqual(expect.objectContaining({ type: 'ALLY_RESPAWNED', allyId: 'bug' }));

    createSourcedAlly(state, owner, {
      id: 'summon', sourceKind: 'move', sourceKey: 'summon_cult_followers',
      archetypeKey: 'brawler', expiresRemaining: 1,
    });
    expect(advanceAllies(state, 1, state.players)).toContainEqual(expect.objectContaining({ type: 'ALLY_EXPIRED', allyId: 'summon' }));
    expect(state.allies.summon).toBeUndefined();
  });
});

describe('ally shop stock and authority purchase', () => {
  test('stocks three ally offers below the 70% boundary and recruits through the shared purchase', () => {
    const owner = player();
    const state = { allies: {}, players: { p1: owner }, nextEntityId: 1, floorNumber: 3, elapsedSeconds: 0, matchRules: {} };
    const room = { id: 'shop', type: 'shop' };
    stockCampaignShop(state, room, owner, { next: () => 0.69 });
    expect(room.shopHasAllies).toBe(true);
    expect(room.shopAllyOffers).toHaveLength(3);
    const before = owner.coins;
    const result = purchaseCampaignShop(state, room, owner, { kind: 'ally', offerIndex: 0 });
    expect(result).toEqual(expect.objectContaining({ ok: true, kind: 'ally', allyId: expect.any(String) }));
    expect(owner.coins).toBe(before - room.shopAllyOffers[0].cost);
    expect(state.allies[result.allyId]).toEqual(expect.objectContaining({ ownerId: 'p1', source: expect.objectContaining({ kind: 'shop' }) }));
  });

  test('does not stock the tab at the exact exclusive boundary', () => {
    const owner = player();
    const state = { allies: {}, nextEntityId: 1, floorNumber: 1, elapsedSeconds: 0, matchRules: {} };
    const room = { id: 'shop-no-allies', type: 'shop' };
    stockCampaignShop(state, room, owner, { next: () => 0.70 });
    expect(room.shopHasAllies).toBe(false);
    expect(room.shopAllyOffers).toEqual([]);
  });
});
