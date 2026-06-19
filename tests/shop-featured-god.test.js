const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  return source.slice(start, end + 1);
}

describe('Shop featured god offer', () => {
  const roomsSource = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');

  function loadEnsureFeaturedGodOffer(Neo) {
    return new Function(
      'Neo',
      `${extractFunction(roomsSource, 'ensureFeaturedGodOffer')}; return ensureFeaturedGodOffer;`,
    )(Neo);
  }

  // A standard 3-item shop where every base offer is a common (knight) item, so
  // the feature has a slot to convert. The seeded RNG returns a fixed sequence.
  function makeNeo(rolls, overrides = {}) {
    let i = 0;
    return {
      ROOM_W: 900,
      ROOM_H: 700,
      floor: 4,
      selectedDifficulty: 'medium',
      SHOP_FEATURED_GOD_CHANCE: 0.5,
      SHOP_FEATURED_GOD_PRICE_PREMIUM: 1.6,
      createRoomRandom: () => () => (i < rolls.length ? rolls[i++] : 0),
      isGodTier: (rarity) => rarity === 'god' || rarity === 'red',
      rollItemDrop: () => 'sun_relic',
      itemRegistry: new Map([['sun_relic', { rarity: 'god' }]]),
      ITEM_DEFS: { common_a: { rarity: 'knight' }, common_b: { rarity: 'knight' }, common_c: { rarity: 'knight' } },
      getShopProgressionDepth: () => 4,
      getShopItemCost: () => 100,
      ...overrides,
    };
  }

  function commonShop() {
    return {
      type: 'shop',
      shopOffers: [
        { type: 'item', key: 'common_a', cost: 50, bought: false },
        { type: 'item', key: 'common_b', cost: 50, bought: false },
        { type: 'item', key: 'common_c', cost: 50, bought: false },
      ],
    };
  }

  test('converts a slot to a premium god item when the roll passes', () => {
    const room = commonShop();
    // First roll (0.2) < 0.5 chance → feature fires; later rolls feed rollItemDrop.
    const Neo = makeNeo([0.2]);
    loadEnsureFeaturedGodOffer(Neo)(room);

    const featured = room.shopOffers.find(o => o.featuredGod);
    expect(featured).toBeTruthy();
    expect(featured.key).toBe('sun_relic');
    // 100 base god cost * 1.6 premium = 160, and the offer count is unchanged.
    expect(featured.cost).toBe(160);
    expect(room.shopOffers.filter(o => o.type === 'item')).toHaveLength(3);
  });

  test('does nothing when the chance roll fails', () => {
    const room = commonShop();
    const Neo = makeNeo([0.9]); // 0.9 >= 0.5 → skip
    loadEnsureFeaturedGodOffer(Neo)(room);

    expect(room.shopOffers.some(o => o.featuredGod)).toBe(false);
    expect(room.shopOffers.map(o => o.key)).toEqual(['common_a', 'common_b', 'common_c']);
  });

  test('skips when a god item already rolled in naturally', () => {
    const room = {
      type: 'shop',
      shopOffers: [
        { type: 'item', key: 'common_a', cost: 50, bought: false },
        { type: 'item', key: 'sun_relic', cost: 400, bought: false },
      ],
    };
    const Neo = makeNeo([0.1]); // would fire, but a god offer already exists
    loadEnsureFeaturedGodOffer(Neo)(room);

    expect(room.shopOffers.filter(o => o.featuredGod)).toHaveLength(0);
    expect(room.shopOffers.find(o => o.key === 'sun_relic').cost).toBe(400);
  });

  test('is idempotent across repeat calls (no second conversion)', () => {
    const room = commonShop();
    const Neo = makeNeo([0.2]);
    const fn = loadEnsureFeaturedGodOffer(Neo);
    fn(room);
    fn(room);

    expect(room.shopOffers.filter(o => o.featuredGod)).toHaveLength(1);
  });
});
