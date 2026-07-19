const { RandomService } = require('../js/simulation/RandomService');
const { stockCampaignShop, purchaseCampaignShop } = require('../js/simulation/SharedShopSystem');
const { isMoveAllowedForCharacter } = require('../js/simulation/SharedMoveContent');
const { WEAPON_PROJECTILE_ATTACKS } = require('../js/simulation/SharedCombatContent');
const fs = require('fs');
const path = require('path');

describe('shared complete campaign shop', () => {
  test('stocks every campaign offer family from one deterministic operation', () => {
    const state = { floorNumber: 7, elapsedSeconds: 0, matchRules: {} };
    const room = { id: 'shop', type: 'shop' };
    const player = { coins: 2000, xp: 0, xpToNext: 20, items: { neo_knife: 1, tough_bandaid: 1 }, ownedMoves: {}, ownedWeapons: {} };
    const random = new RandomService({ matchSeed: 'shop-test' }).stream('shop');
    stockCampaignShop(state, room, player, random);
    expect(room.shopOffers.filter(offer => offer.type === 'item')).toHaveLength(3);
    expect(room.shopOffers).toContainEqual(expect.objectContaining({ type: 'potion' }));
    expect(room.shopMoveOffers).toHaveLength(4);
    expect(room.shopWeaponOffers).toHaveLength(3);
    expect(room.shopTradeOffer).toEqual(expect.objectContaining({ type: 'trade', unavailable: false }));
  });

  test('one purchase resolver owns items, moves, weapons, trades, and healing', () => {
    const state = { floorNumber: 7, elapsedSeconds: 0, matchRules: {} };
    const room = { id: 'shop', type: 'shop' };
    const player = { coins: 10000, hp: 20, maxHp: 100, xp: 0, xpToNext: 20, items: { neo_knife: 1, tough_bandaid: 1 }, ownedMoves: {}, ownedWeapons: {} };
    stockCampaignShop(state, room, player, new RandomService({ matchSeed: 'shop-buy' }).stream('shop'));
    expect(purchaseCampaignShop(state, room, player, { kind: 'item', offerIndex: 0 }).ok).toBe(true);
    expect(purchaseCampaignShop(state, room, player, { kind: 'move', offerIndex: 0 }).ok).toBe(true);
    expect(purchaseCampaignShop(state, room, player, { kind: 'weapon', offerIndex: 0 }).ok).toBe(true);
    expect(purchaseCampaignShop(state, room, player, { kind: 'trade' }).ok).toBe(true);
    expect(purchaseCampaignShop(state, room, player, { kind: 'heal', healKind: 'small' }).ok).toBe(true);
  });

  test('stocks only character-legal moves and guarantees a projectile weapon when available', () => {
    const state = { floorNumber: 7, elapsedSeconds: 0, matchRules: {} };
    const room = { id: 'thorn-shop', type: 'shop' };
    const player = { characterKey: 'thorn_knight', items: {}, ownedMoves: {}, ownedWeapons: {} };
    stockCampaignShop(state, room, player, new RandomService({ matchSeed: 'legal-shop' }).stream('shop'));
    expect(room.shopMoveOffers.every(offer => isMoveAllowedForCharacter(offer.key, 'thorn_knight'))).toBe(true);
    expect(room.shopWeaponOffers.some(offer => WEAPON_PROJECTILE_ATTACKS[offer.key])).toBe(true);
  });

  test('uses the stocked authority price and supports the campaign stored-potion result', () => {
    const state = { floorNumber: 7, elapsedSeconds: 0, matchRules: {} };
    const room = { id: 'priced-shop', type: 'shop' };
    const player = { coins: 1000, hp: 100, maxHp: 100, storedPotions: 0, items: {}, ownedMoves: {}, ownedWeapons: {} };
    stockCampaignShop(state, room, player, new RandomService({ matchSeed: 'priced-shop' }).stream('shop'));
    const price = room.shopOffers.find(offer => offer.type === 'item').cost;
    const before = player.coins;
    expect(purchaseCampaignShop(state, room, player, { kind: 'item', offerIndex: 0 }).ok).toBe(true);
    expect(player.coins).toBe(before - price);
    expect(purchaseCampaignShop(state, room, player, { kind: 'heal', healKind: 'small', cost: 17 }, { potionCap: 2 }))
      .toEqual(expect.objectContaining({ ok: true, stored: true, storedPotions: 1, cost: 17 }));
  });

  test('browser shop panel and room stock delegate mutations to the shared operation', () => {
    const rooms = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');
    const panels = fs.readFileSync(path.join(__dirname, '../js/ui/panels.js'), 'utf8');
    expect(rooms).toContain('globalThis.NeoNyke?.simulation?.stockCampaignShop');
    expect(panels).toContain('globalThis.NeoNyke?.simulation?.purchaseCampaignShop');
    expect(panels).not.toContain('Neo.player.ownedMoves[offer.key] = true');
    expect(panels).not.toContain('Neo.player.ownedWeapons[offer.key] = true');
  });
});
