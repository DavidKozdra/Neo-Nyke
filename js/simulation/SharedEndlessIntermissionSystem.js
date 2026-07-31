(function initializeSharedEndlessIntermissionSystem(root, factory) {
  const itemApi = typeof require === 'function'
    ? { ...require('./SharedItemContent.js'), ...require('./SharedItemDefinitions.js') }
    : (root.NeoNyke?.content || {});
  const shopApi = typeof require === 'function' ? require('./SharedShopSystem.js') : (root.NeoNyke?.simulation || {});
  const api = factory(itemApi, shopApi);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEndlessIntermissionApi(itemApi, shopApi) {
  'use strict';

  // Endless intermissions run between waves: the room stocks a full shop and a
  // row of sealed chests the player pays to open. Nothing here auto-advances —
  // the player leaves by taking the exit pickup, so pacing is theirs to set.
  const INTERMISSION_CHEST_COUNT = 3;
  // Chest prices are rolled per intermission rather than fixed per tier, so two
  // chests side by side are a real spend decision instead of a lookup table.
  const CHEST_PRICE_BASE = 55;
  const CHEST_PRICE_SPREAD = 70;
  const CHEST_PRICE_WAVE_GROWTH = 0.09;

  // Coins accumulate fast in late waves, so prices track the wave counter. The
  // elite chance rides along with price: a chest the player scraped to afford
  // should be worth the scrape.
  function rollChestPrice(waveNumber, random) {
    const wave = Math.max(1, Number(waveNumber) || 1);
    const roll = typeof random?.next === 'function' ? random.next() : 0.5;
    const base = CHEST_PRICE_BASE + roll * CHEST_PRICE_SPREAD;
    return Math.max(1, Math.round(base * (1 + (wave - 1) * CHEST_PRICE_WAVE_GROWTH)));
  }

  // A chest's premium over the cheapest possible roll drives its elite odds, so
  // price and payoff stay legible without exposing a separate rarity label.
  function chestEliteChance(price, waveNumber) {
    const wave = Math.max(1, Number(waveNumber) || 1);
    const floorPrice = CHEST_PRICE_BASE * (1 + (wave - 1) * CHEST_PRICE_WAVE_GROWTH);
    const ceilingPrice = (CHEST_PRICE_BASE + CHEST_PRICE_SPREAD) * (1 + (wave - 1) * CHEST_PRICE_WAVE_GROWTH);
    const span = Math.max(1, ceilingPrice - floorPrice);
    const premium = Math.max(0, Math.min(1, (Number(price) - floorPrice) / span));
    return 0.1 + premium * 0.45;
  }

  // Builds the sealed chest row. Chests are inert until purchased: `locked` keeps
  // the walk-over open path in updateChests from firing, and `price` is what the
  // interact handler charges.
  function createEndlessIntermissionChests(state = {}, random) {
    const wave = Math.max(1, Number(state.waveNumber) || 1);
    const modeKey = String(state.modeKey || 'endless').replace(/[^a-z0-9_-]+/gi, '-') || 'endless';
    const count = Math.max(1, Math.floor(Number(state.chestCount ?? INTERMISSION_CHEST_COUNT)));
    const width = Number(state.geometry?.width || 900);
    const height = Number(state.geometry?.height || 700);
    const spacing = 132;
    const chests = [];
    for (let index = 0; index < count; index += 1) {
      const price = rollChestPrice(wave, random);
      chests.push({
        id: `${modeKey}:${wave}:chest:${index}`,
        x: width / 2 + (index - (count - 1) / 2) * spacing,
        y: height / 2 + 96,
        open: false,
        locked: true,
        intermissionShopChest: true,
        endlessShopChest: modeKey === 'endless',
        bossRushShopChest: modeKey === 'boss-rush' || modeKey === 'boss_rush',
        price,
        rewardType: 'item',
        eliteChance: chestEliteChance(price, wave),
      });
    }
    return chests;
  }

  // Charges the player and unseals the chest. The reward roll happens here so a
  // paid chest can never resolve to nothing; the caller turns `rewardKey` into a
  // pickup through the ordinary chest-open path.
  function purchaseEndlessChest(player, chest, options = {}) {
    if (!player) return { ok: false, reason: 'NO_PLAYER' };
    if (!chest || !(chest.intermissionShopChest || chest.endlessShopChest || chest.bossRushShopChest)) {
      return { ok: false, reason: 'NOT_A_SHOP_CHEST' };
    }
    if (chest.open || !chest.locked) return { ok: false, reason: 'CHEST_UNAVAILABLE' };
    const price = Math.max(0, Number(chest.price || 0));
    if (Number(player.coins || 0) < price) return { ok: false, reason: 'INSUFFICIENT_FUNDS', price };
    const random = options.random;
    const elite = (typeof random?.next === 'function' ? random.next() : 1) < Number(chest.eliteChance || 0);
    const rewardKey = typeof options.rollItem === 'function'
      ? options.rollItem({ elite })
      : itemApi.rollCampaignItem?.(random);
    if (!rewardKey) return { ok: false, reason: 'NO_CHEST_REWARD' };
    player.coins = Number(player.coins || 0) - price;
    chest.locked = false;
    chest.rewardKey = rewardKey;
    chest.purchased = true;
    return { ok: true, type: 'ENDLESS_CHEST_PURCHASED', price, rewardKey, elite };
  }

  return {
    INTERMISSION_CHEST_COUNT,
    CHEST_PRICE_BASE,
    CHEST_PRICE_SPREAD,
    CHEST_PRICE_WAVE_GROWTH,
    rollChestPrice,
    chestEliteChance,
    createEndlessIntermissionChests,
    purchaseEndlessChest,
  };
});
