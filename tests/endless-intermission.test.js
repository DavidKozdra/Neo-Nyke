const {
  rollChestPrice,
  chestEliteChance,
  createEndlessIntermissionChests,
  purchaseEndlessChest,
} = require('../js/simulation/SharedEndlessIntermissionSystem.js');
const { RandomStream } = require('../js/simulation/RandomService.js');

describe('SharedEndlessIntermissionSystem', () => {
  test('chest prices are random per chest and scale with the wave counter', () => {
    const early = createEndlessIntermissionChests({ waveNumber: 1 }, new RandomStream(7));
    const late = createEndlessIntermissionChests({ waveNumber: 20 }, new RandomStream(7));
    expect(early).toHaveLength(3);
    // Same seed, later wave: every price is strictly higher, so late-wave coin
    // piles keep meaning something.
    early.forEach((chest, index) => expect(late[index].price).toBeGreaterThan(chest.price));
    // Prices vary within a single intermission rather than being one flat rate.
    expect(new Set(early.map(chest => chest.price)).size).toBeGreaterThan(1);
  });

  test('chests spawn sealed so they cannot be opened by walking over them', () => {
    const chests = createEndlessIntermissionChests({ waveNumber: 4 }, new RandomStream(11));
    chests.forEach(chest => {
      expect(chest).toMatchObject({ open: false, locked: true, endlessShopChest: true });
      expect(chest.price).toBeGreaterThan(0);
    });
  });

  test('a pricier chest carries better elite odds than a cheap one', () => {
    expect(chestEliteChance(rollChestPrice(1, new RandomStream(1)), 1)).toBeGreaterThanOrEqual(0.1);
    const cheap = chestEliteChance(55, 1);
    const premium = chestEliteChance(125, 1);
    expect(premium).toBeGreaterThan(cheap);
    expect(premium).toBeLessThanOrEqual(0.55);
  });

  test('buying a chest charges the player and unseals it for the normal open path', () => {
    const [chest] = createEndlessIntermissionChests({ waveNumber: 2, chestCount: 1 }, new RandomStream(3));
    const player = { coins: chest.price + 40 };
    const result = purchaseEndlessChest(player, chest, {
      random: new RandomStream(5),
      rollItem: () => 'neo_knife',
    });
    expect(result).toMatchObject({ ok: true, price: chest.price, rewardKey: 'neo_knife' });
    expect(player.coins).toBe(40);
    // Unsealed but not opened: updateChests still runs the ordinary open path.
    expect(chest).toMatchObject({ locked: false, open: false, purchased: true, rewardKey: 'neo_knife' });
  });

  test('an unaffordable chest is refused without charging or unsealing', () => {
    const [chest] = createEndlessIntermissionChests({ waveNumber: 9, chestCount: 1 }, new RandomStream(4));
    const player = { coins: chest.price - 1 };
    const result = purchaseEndlessChest(player, chest, { rollItem: () => 'neo_knife' });
    expect(result).toMatchObject({ ok: false, reason: 'INSUFFICIENT_FUNDS', price: chest.price });
    expect(player.coins).toBe(chest.price - 1);
    expect(chest.locked).toBe(true);
  });

  test('a chest cannot be bought twice', () => {
    const [chest] = createEndlessIntermissionChests({ waveNumber: 2, chestCount: 1 }, new RandomStream(6));
    const player = { coins: chest.price * 3 };
    expect(purchaseEndlessChest(player, chest, { rollItem: () => 'neo_knife' }).ok).toBe(true);
    const spentOnce = player.coins;
    expect(purchaseEndlessChest(player, chest, { rollItem: () => 'neo_knife' })).toMatchObject({
      ok: false, reason: 'CHEST_UNAVAILABLE',
    });
    expect(player.coins).toBe(spentOnce);
  });

  test('ordinary chests are never treated as paid intermission chests', () => {
    const plain = { id: 'treasure', x: 0, y: 0, open: false };
    expect(purchaseEndlessChest({ coins: 9999 }, plain, { rollItem: () => 'neo_knife' })).toMatchObject({
      ok: false, reason: 'NOT_A_SHOP_CHEST',
    });
  });

  // The endless room keeps its 'combat' type, but the shared shop operations
  // guard on room.type === 'shop'. The browser passes a shop-typed view of the
  // room (see resolveLocalCampaignShopPurchase); offers are shared by reference,
  // so purchases still land on the real room's stock.
  test('a shop-typed view of a combat room lets intermission purchases resolve', () => {
    const { stockCampaignShop, purchaseCampaignShop } = require('../js/simulation/SharedShopSystem.js');
    const room = { id: 'endless', type: 'combat' };
    const player = { coins: 100000, items: {}, ownedMoves: {}, ownedWeapons: {}, hp: 10, maxHp: 100 };
    const state = { floorNumber: 5, elapsedSeconds: 0, matchRules: { shopItemOffers: 3 } };

    stockCampaignShop(state, { ...room, type: 'shop' }, player, new RandomStream(21));
    expect(room.shopOffers).toBeUndefined();

    // Stock onto the room the way openEndlessIntermission does.
    const stocked = { ...room, type: 'shop' };
    stockCampaignShop(state, stocked, player, new RandomStream(21));
    room.shopOffers = stocked.shopOffers;
    room.shopMoveOffers = stocked.shopMoveOffers;
    room.shopWeaponOffers = stocked.shopWeaponOffers;

    // A raw combat room is refused...
    expect(purchaseCampaignShop(state, room, player, { kind: 'item', offerIndex: 0 })).toMatchObject({
      ok: false, reason: 'NOT_IN_SHOP',
    });
    // ...while the shop-typed view resolves and marks the real room's offer.
    const itemOffer = room.shopOffers.filter(offer => offer.type === 'item')[0];
    expect(purchaseCampaignShop(state, { ...room, type: 'shop' }, player, { kind: 'item', offerIndex: 0 }).ok).toBe(true);
    expect(itemOffer.bought).toBe(true);
  });

  test('a reward roll that comes back empty refuses the sale rather than taking coins', () => {
    const [chest] = createEndlessIntermissionChests({ waveNumber: 3, chestCount: 1 }, new RandomStream(8));
    const player = { coins: 5000 };
    expect(purchaseEndlessChest(player, chest, { rollItem: () => '' })).toMatchObject({
      ok: false, reason: 'NO_CHEST_REWARD',
    });
    expect(player.coins).toBe(5000);
    expect(chest.locked).toBe(true);
  });
});
