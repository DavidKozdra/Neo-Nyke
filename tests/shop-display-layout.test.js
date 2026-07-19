const { getShopItemSlot, layoutShopItemOffers } = require('../js/simulation/SharedShopSystem');

describe('shop display layout', () => {
  const ROOM_W = 900;
  const ROOM_H = 700;
  const WALL = 28;
  const DISPLAY_HALF = 26; // shop display box is 52px square (see draw/props.js)
  const geometry = { width: ROOM_W, height: ROOM_H };

  // The bug: a fixed 6-slot table left a 7th (rich-man's-luck extras + scroll)
  // display stacked at center or jammed past the visible area. Every display must
  // sit fully inside the room interior for any plausible count.
  test('keeps every display inside the room interior for 1..8 offers', () => {
    for (let total = 1; total <= 8; total += 1) {
      for (let index = 0; index < total; index += 1) {
        const { x, y } = getShopItemSlot(index, total, geometry);
        expect(x - DISPLAY_HALF).toBeGreaterThanOrEqual(WALL);
        expect(x + DISPLAY_HALF).toBeLessThanOrEqual(ROOM_W - WALL);
        expect(y - DISPLAY_HALF).toBeGreaterThanOrEqual(WALL);
        expect(y + DISPLAY_HALF).toBeLessThanOrEqual(ROOM_H - WALL);
      }
    }
  });

  test('gives each display a distinct position (no overlap stacking)', () => {
    for (let total = 1; total <= 8; total += 1) {
      const seen = new Set();
      for (let index = 0; index < total; index += 1) {
        const { x, y } = getShopItemSlot(index, total, geometry);
        const key = `${Math.round(x)},${Math.round(y)}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  test('layoutShopItemOffers re-slots only item offers, leaving the potion put', () => {
    const room = {
      type: 'shop',
      shopOffers: [
        { type: 'potion', x: ROOM_W / 2, y: ROOM_H / 2 + 88 },
        { type: 'item', key: 'a', x: 9999, y: 9999 },
        { type: 'item', key: 'b', x: -9999, y: -9999 },
        { type: 'item', key: 'c', scrollOffer: true, x: 5000, y: 5000 },
      ],
    };
    layoutShopItemOffers(room, geometry);
    const potion = room.shopOffers[0];
    expect(potion.x).toBe(ROOM_W / 2);
    expect(potion.y).toBe(ROOM_H / 2 + 88);
    room.shopOffers.filter(o => o.type === 'item').forEach(offer => {
      expect(offer.x - DISPLAY_HALF).toBeGreaterThanOrEqual(WALL);
      expect(offer.x + DISPLAY_HALF).toBeLessThanOrEqual(ROOM_W - WALL);
      expect(offer.y - DISPLAY_HALF).toBeGreaterThanOrEqual(WALL);
      expect(offer.y + DISPLAY_HALF).toBeLessThanOrEqual(ROOM_H - WALL);
    });
  });
});
