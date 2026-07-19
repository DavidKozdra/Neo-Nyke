const { RandomService } = require('../js/simulation/RandomService');
const { ensureFeaturedGodOffer } = require('../js/simulation/SharedShopSystem');

describe('shared shop featured god offer', () => {
  const state = { floorNumber: 4, elapsedSeconds: 0, matchRules: {} };
  const player = { items: {}, xp: 0, xpToNext: 20 };
  const commonShop = () => ({
    type: 'shop',
    shopOffers: [
      { type: 'item', key: 'neo_knife', cost: 50, bought: false },
      { type: 'item', key: 'tough_bandaid', cost: 50, bought: false },
      { type: 'item', key: 'attack_servo', cost: 50, bought: false },
    ],
  });

  test('converts one slot to a premium god item without inflating the offer count', () => {
    const room = commonShop();
    const random = { next: jest.fn().mockReturnValueOnce(0.2).mockReturnValueOnce(0) };
    const featured = ensureFeaturedGodOffer(state, room, player, random);
    expect(featured).toEqual(expect.objectContaining({ featuredGod: true }));
    expect(featured.cost).toBeGreaterThan(50);
    expect(room.shopOffers).toHaveLength(3);
  });

  test('does nothing when chance fails or a god item already exists', () => {
    const failed = commonShop();
    expect(ensureFeaturedGodOffer(state, failed, player, { next: () => 0.9 })).toBeNull();
    expect(failed.shopOffers.some(offer => offer.featuredGod)).toBe(false);

    const natural = commonShop();
    natural.shopOffers[1].key = 'iron_lung';
    expect(ensureFeaturedGodOffer(state, natural, player, new RandomService({ matchSeed: 1 }).stream('shop'))).toBeNull();
  });

  test('is idempotent after the first conversion', () => {
    const room = commonShop();
    ensureFeaturedGodOffer(state, room, player, { next: jest.fn().mockReturnValueOnce(0.2).mockReturnValueOnce(0) });
    expect(ensureFeaturedGodOffer(state, room, player, { next: () => 0 })).toBeNull();
    expect(room.shopOffers.filter(offer => offer.featuredGod)).toHaveLength(1);
  });
});
