(function initializeSharedShopSystem(root, factory) {
  const itemApi = typeof require === 'function'
    ? { ...require('./SharedItemContent.js'), ...require('./SharedItemDefinitions.js') }
    : (root.NeoNyke?.content || {});
  const moveApi = typeof require === 'function' ? require('./SharedMoveContent.js') : (root.NeoNyke?.content || {});
  const combatApi = typeof require === 'function' ? require('./SharedCombatContent.js') : (root.NeoNyke?.content || {});
  const inventoryApi = typeof require === 'function' ? require('./SharedInventorySystem.js') : (root.NeoNyke?.simulation || {});
  const api = factory(itemApi, moveApi, combatApi, inventoryApi);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedShopSystemApi(itemApi, moveApi, combatApi, inventoryApi) {
  'use strict';

  const SHOP_MOVE_POOL = Object.freeze([
    'blood_beam', 'love_beam', 'turtle_wave', 'power_disks', 'blade_justice', 'lightning_columns',
    'god_sweep', 'nail_shot', 'laser_shockwave', 'crimson_smash', 'wall_of_toph', 'kicky_kick',
    'chaos_burst', 'healing_zone', 'fire_circle', 'floor_lava', 'random_pounce', 'dash',
    'nimrod_stomp', 'warp', 'zip_lightning', 'flying_unhitable', 'cowards_way', 'mooggy_zoomies',
  ]);
  const WHITE_WEAPON_POOL = Object.freeze(['extending_staff', 'hunters_bow', 'thorns_bleed_blade', 'claw_gauntlets']);
  const PURPLE_WEAPON_POOL = Object.freeze(['lazer_glasses', 'metao_fire_staff', 'magenta_degale', 'magenta_p90']);
  const GOD_WEAPON_POOL = Object.freeze(['gelleh_lightning_spear', 'excalibur', 'katana_excalibur_777x', 'golden_fleece', 'void_piercer']);
  const SCROLL_KEYS = Object.freeze(['scroll_reroll', 'scroll_branching', 'scroll_replace', 'scroll_abundance', 'scroll_pool_weight', 'scroll_ego']);
  const rarityOf = key => itemApi.ITEM_DEFS?.[key]?.rarity
    || itemApi.SCROLL_DEFS?.[key]?.rarity
    || itemApi.ITEM_RARITY_BY_KEY?.[key]
    || 'knight';
  const rarityRank = key => {
    const rarity = String(rarityOf(key)).toLowerCase();
    if (rarity === 'green') return 5;
    if (rarity === 'blue') return 4;
    if (rarity === 'god' || rarity === 'red') return 3;
    if (rarity === 'wizard' || rarity === 'purple') return 2;
    return 1;
  };
  const shuffle = (values, random) => {
    const copy = values.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  function shopPrice(baseCost, state, player) {
    const depth = Math.max(1, Number(state.floorNumber || 1));
    const minutes = Math.max(0, Number(state.elapsedSeconds || 0) / 60);
    const difficultyMultiplier = Number(state.matchRules?.shopPriceMultiplier || 1);
    const cursedMultiplier = state.matchRules?.cursedShops ? 1.5 : 1;
    const sealDiscount = Number(player?.items?.scholar_seal || 0) > 0
      ? Math.max(0, Math.min(1, Number(player.xp || 0) / Math.max(1, Number(player.xpToNext || 1)))) * 0.1
      : 0;
    return Math.max(1, Math.round(Number(baseCost) * (1 + (depth - 1) * 0.03 + minutes * 0.02) * difficultyMultiplier * cursedMultiplier * (1 - sealDiscount)));
  }

  function itemCost(state, player, index, key) {
    const multiplier = rarityOf(key) === 'god' ? 4.75 : rarityOf(key) === 'wizard' ? 2.15 : 1;
    return shopPrice((32 + Number(state.floorNumber || 1) * 4 + index * 6) * multiplier, state, player);
  }

  function getShopItemSlot(index, total, geometry = {}) {
    const width = Number(geometry.width || 900);
    const height = Number(geometry.height || 700);
    const columns = 4;
    const columnSpacing = 150;
    const rowSpacing = 76;
    const count = Math.max(1, Math.floor(Number(total) || 1));
    const itemIndex = Math.max(0, Math.min(Math.floor(Number(index) || 0), count - 1));
    const cols = Math.min(columns, count);
    const rows = Math.ceil(count / cols);
    const row = Math.floor(itemIndex / cols);
    const itemsInRow = Math.min(cols, count - row * cols);
    const column = itemIndex - row * cols;
    return {
      x: width / 2 + (column - (itemsInRow - 1) / 2) * columnSpacing,
      y: height / 2 - 16 + (row - (rows - 1) / 2) * rowSpacing,
    };
  }

  function layoutShopItemOffers(room, geometry = {}) {
    const offers = (room?.shopOffers || []).filter(offer => offer?.type === 'item');
    offers.forEach((offer, index) => Object.assign(offer, getShopItemSlot(index, offers.length, geometry)));
    return offers;
  }

  function ensureFeaturedGodOffer(state, room, player, random) {
    const offers = (room?.shopOffers || []).filter(offer => offer?.type === 'item' && !offer.scrollOffer);
    if (!offers.length || offers.some(offer => rarityRank(offer.key) === 3)) return null;
    if (random.next() >= 0.5) return null;
    const occupied = new Set(offers.map(offer => offer.key));
    const gods = itemApi.ITEM_DROP_ENTRIES
      .filter(([key, weight]) => weight > 0 && rarityRank(key) === 3 && !occupied.has(key))
      .map(([key]) => key);
    if (!gods.length) return null;
    const key = gods[Math.floor(random.next() * gods.length)];
    const target = [...offers].reverse().find(offer => !offer.bought);
    if (!target) return null;
    const index = offers.indexOf(target);
    target.key = key;
    target.cost = Math.round(itemCost(state, player, index, key) * 1.6);
    target.featuredGod = true;
    return target;
  }

  function stockCampaignShop(state, room, player, random) {
    if (!room || room.type !== 'shop' || !random) return null;
    if (room.shopStocked) return room;
    const baseItems = Math.max(0, Math.floor(Number(state.matchRules?.shopItemOffers ?? 3)));
    const extraItems = Math.min(3, Math.max(0, Math.floor(Number(
      player?.itemStats?.shopExtraItemOffers ?? player?.items?.rich_mans_luck ?? 0,
    ))));
    const itemKeys = itemApi.createCampaignItemChoices(baseItems + extraItems, random);
    room.shopOffers = itemKeys.map((key, index) => ({
      id: `shop:${room.id}:item:${index}`, type: 'item', key,
      cost: itemCost(state, player, index, key), bought: false,
      ...getShopItemSlot(index, itemKeys.length, state.floorState),
      featuredGod: false,
      scrollOffer: SCROLL_KEYS.includes(key),
    }));
    ensureFeaturedGodOffer(state, room, player, random);
    room.shopOffers.push({ id: `shop:${room.id}:potion`, type: 'potion', cost: shopPrice(18 + Number(state.floorNumber || 1) * 2, state, player), x: 450, y: 438, bought: false });

    const ownedMoves = player?.ownedMoves || {};
    const characterKey = player?.characterKey || player?.character || 'thorn_knight';
    const ordinaryMovePool = SHOP_MOVE_POOL.filter(key => key !== 'god_sweep' && !ownedMoves[key]
      && moveApi.MOVE_SLOT_BY_KEY?.[key] && (moveApi.isMoveAllowedForCharacter?.(key, characterKey) ?? true));
    room.shopMoveOffers = shuffle(ordinaryMovePool, random)
      .slice(0, 4).map((key, index) => ({ id: `shop:${room.id}:move:${index}`, type: 'move', key, bought: false, cost: shopPrice(34 + Number(state.floorNumber || 1) * 6 + index * 4, state, player) }));
    if (state.matchRules?.godSweepUnlocked && !ownedMoves.god_sweep && random.next() < 0.12) {
      const insertIndex = Math.min(room.shopMoveOffers.length, Math.floor(random.next() * (Math.min(room.shopMoveOffers.length, 3) + 1)));
      room.shopMoveOffers.splice(insertIndex, 0, {
        id: `shop:${room.id}:move:god-sweep`, type: 'move', key: 'god_sweep', bought: false,
        cost: shopPrice(140 + Number(state.floorNumber || 1) * 12, state, player),
      });
      room.shopMoveOffers = room.shopMoveOffers.slice(0, 4);
    }
    const weaponPool = [...WHITE_WEAPON_POOL, ...(state.floorNumber >= 4 ? PURPLE_WEAPON_POOL : []), ...(state.floorNumber >= 7 ? GOD_WEAPON_POOL : [])];
    const availableWeapons = weaponPool.filter(key => !player?.ownedWeapons?.[key] && combatApi.WEAPON_BASE_STATS?.[key]);
    const weaponKeys = shuffle(availableWeapons, random).slice(0, 3);
    const projectileWeapons = availableWeapons.filter(key => combatApi.WEAPON_PROJECTILE_ATTACKS?.[key]);
    if (weaponKeys.length && projectileWeapons.length && !weaponKeys.some(key => combatApi.WEAPON_PROJECTILE_ATTACKS?.[key])) {
      weaponKeys[weaponKeys.length - 1] = shuffle(projectileWeapons, random)[0];
    }
    room.shopWeaponOffers = weaponKeys.map((key, index) => {
        const rarity = GOD_WEAPON_POOL.includes(key) ? 'god' : PURPLE_WEAPON_POOL.includes(key) ? 'wizard' : 'knight';
        let base = rarity === 'god' ? (180 + state.floorNumber * 14 + index * 10) * 3
          : rarity === 'wizard' ? 88 + state.floorNumber * 9 + index * 8 : 52 + state.floorNumber * 5 + index * 6;
        if (['excalibur', 'katana_excalibur_777x'].includes(key)) base *= 1.25;
        return { id: `shop:${room.id}:weapon:${index}`, type: 'weapon', key, bought: false, cost: shopPrice(base, state, player) };
      });
    const tradePool = Object.keys(player?.items || {}).filter(key => Number(player.items[key]) > 0 && rarityRank(key) < 3);
    if (tradePool.length >= 2) {
      const costKeys = shuffle(tradePool, random).slice(0, 2);
      const targetRank = Math.min(3, Math.max(...costKeys.map(rarityRank)) + 1);
      const normalPool = itemApi.ITEM_DROP_ENTRIES.filter(([key, weight]) => weight > 0 && rarityRank(key) < 4 && !costKeys.includes(key)).map(([key]) => key);
      const targetPool = normalPool.filter(key => rarityRank(key) === targetRank);
      room.shopTradeOffer = { type: 'trade', key: shuffle(targetPool.length ? targetPool : normalPool, random)[0] || '', costKeys, unavailable: false, bought: false };
    } else room.shopTradeOffer = { type: 'trade', unavailable: true, bought: false };
    room.shopStocked = true;
    return room;
  }

  function purchaseCampaignShop(state, room, player, command = {}, options = {}) {
    if (!room || room.type !== 'shop' || !player) return { ok: false, reason: 'NOT_IN_SHOP' };
    const kind = String(command.kind || '');
    let offers;
    if (kind === 'item') offers = room.shopOffers?.filter(offer => offer.type === 'item');
    else if (kind === 'move') offers = room.shopMoveOffers;
    else if (kind === 'weapon') offers = room.shopWeaponOffers;
    if (offers) {
      const offer = offers[Math.max(0, Math.trunc(Number(command.offerIndex) || 0))];
      if (!offer || offer.bought) return { ok: false, reason: 'INVALID_OFFER' };
      // Stock is authority-owned, so its recorded price is canonical. Recomputing
      // item prices here created a second pricing path and made browser purchases
      // disagree with authority after difficulty/progression adjustments.
      const cost = Math.max(0, Number(offer.cost || 0));
      if (Number(player.coins || 0) < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
      if (kind === 'move' && player.ownedMoves?.[offer.key]) return { ok: false, reason: 'ALREADY_OWNED' };
      if (kind === 'weapon' && player.ownedWeapons?.[offer.key]) return { ok: false, reason: 'ALREADY_OWNED' };
      player.coins -= cost;
      offer.cost = cost;
      offer.bought = true;
      if (kind === 'item') {
        const collection = typeof options.collectItem === 'function'
          ? options.collectItem(offer.key, 1)
          : inventoryApi.collectCampaignItem(player, offer.key);
        if (collection === false || collection?.ok === false) {
          player.coins += cost;
          offer.bought = false;
          return { ok: false, reason: 'COLLECTION_REJECTED' };
        }
      }
      else if (kind === 'move') (player.ownedMoves || (player.ownedMoves = {}))[offer.key] = true;
      else (player.ownedWeapons || (player.ownedWeapons = {}))[offer.key] = true;
      return { ok: true, kind, key: offer.key, cost };
    }
    if (kind === 'trade') {
      const offer = room.shopTradeOffer;
      if (!offer || offer.unavailable || offer.bought || !offer.key || !offer.costKeys?.every(key => Number(player.items?.[key] || 0) > 0)) return { ok: false, reason: 'INVALID_TRADE' };
      offer.costKeys.forEach(key => { player.items[key] -= 1; if (player.items[key] <= 0) delete player.items[key]; });
      offer.bought = true;
      const collection = typeof options.collectItem === 'function'
        ? options.collectItem(offer.key, 1)
        : inventoryApi.collectCampaignItem(player, offer.key);
      if (collection === false || collection?.ok === false) {
        offer.costKeys.forEach(key => { player.items[key] = Number(player.items[key] || 0) + 1; });
        offer.bought = false;
        return { ok: false, reason: 'COLLECTION_REJECTED' };
      }
      return { ok: true, kind, key: offer.key, costKeys: offer.costKeys };
    }
    if (kind === 'heal') {
      const major = command.healKind === 'major';
      const potionCap = Math.max(0, Math.floor(Number(options.potionCap || 0)));
      const canHeal = Number(player.hp || 0) < Number(player.maxHp || 1);
      const canStore = !canHeal && potionCap > Number(player.storedPotions || 0);
      if (!canHeal && !canStore) return { ok: false, reason: 'FULL_HEALTH' };
      const requestedCost = Number(command.cost);
      const cost = Number.isFinite(requestedCost) && requestedCost >= 0
        ? requestedCost
        : shopPrice((major ? 34 : 16) + Number(state.floorNumber || 1) * (major ? 4 : 2), state, player);
      if (Number(player.coins || 0) < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
      player.coins -= cost;
      if (canHeal) {
        const baseHealing = Math.max(0, Number(command.healAmount || (major ? 100 : 45)));
        const healing = typeof options.applyHealing === 'function'
          ? Math.max(0, Number(options.applyHealing(baseHealing) || 0))
          : (() => {
              const before = Number(player.hp || 0);
              player.hp = Math.min(Number(player.maxHp || 100), before + baseHealing * Math.max(1, Number(player.itemStats?.healingMultiplier || 1)));
              return player.hp - before;
            })();
        return { ok: true, kind, healKind: command.healKind, cost, healing, stored: false };
      }
      player.storedPotions = Number(player.storedPotions || 0) + 1;
      return { ok: true, kind, healKind: command.healKind, cost, healing: 0, stored: true, storedPotions: player.storedPotions };
    }
    return { ok: false, reason: 'UNKNOWN_PURCHASE' };
  }

  return {
    SHOP_MOVE_POOL, WHITE_WEAPON_POOL, PURPLE_WEAPON_POOL, GOD_WEAPON_POOL, SCROLL_KEYS,
    shopPrice, itemCost, getShopItemSlot, layoutShopItemOffers, ensureFeaturedGodOffer,
    stockCampaignShop, purchaseCampaignShop,
  };
});
