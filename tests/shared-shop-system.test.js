const { RandomService } = require('../js/simulation/RandomService');
const {
  ALLY_RECRUIT_PRICE_MULTIPLIER,
  stockCampaignShop,
  purchaseCampaignShop,
} = require('../js/simulation/SharedShopSystem');
const { isMoveAllowedForCharacter } = require('../js/simulation/SharedMoveContent');
const { WEAPON_PROJECTILE_ATTACKS } = require('../js/simulation/SharedCombatContent');
const fs = require('fs');
const path = require('path');

const panelSource = fs.readFileSync(path.join(__dirname, '../js/ui/panels.js'), 'utf8');

function createShopPanelHarness({ networkActive = true } = {}) {
  class TestElement {
    constructor() {
      this.dataset = {};
      this.textContent = '';
      this.childElementCount = 0;
      this.classList = {
        contains: jest.fn(() => false),
        toggle: jest.fn(),
        add: jest.fn(),
        remove: jest.fn(),
      };
    }

    set innerHTML(value) {
      this._innerHTML = String(value);
      this.childElementCount = this._innerHTML ? 1 : 0;
    }

    get innerHTML() {
      return this._innerHTML || '';
    }

    querySelectorAll() {
      return [];
    }

    querySelector() {
      return null;
    }

    closest() {
      return this;
    }
  }

  const room = {
    id: 'authority-shop',
    type: 'shop',
    shopStocked: true,
    shopOffers: [{ id: 'authority:item:0', type: 'item', key: 'iron_lung', cost: 731, bought: false }],
    shopMoveOffers: [{ id: 'authority:move:0', type: 'move', key: 'dash', cost: 509, bought: false }],
    shopWeaponOffers: [{ id: 'authority:weapon:0', type: 'weapon', key: 'neo_blade', cost: 887, bought: false }],
    shopTradeOffer: {
      id: 'authority:trade',
      type: 'trade',
      key: 'authority_prize',
      costKeys: ['iron_lung', 'tough_bandaid'],
      unavailable: false,
      bought: false,
    },
  };
  const refreshRoomShopCosts = jest.fn(targetRoom => {
    [
      ...(targetRoom.shopOffers || []),
      ...(targetRoom.shopMoveOffers || []),
      ...(targetRoom.shopWeaponOffers || []),
    ].forEach(offer => { offer.cost = 42; });
  });
  const ensureShopHasMinimumItemOffers = jest.fn();
  const ensureShopTradeOffer = jest.fn(targetRoom => targetRoom.shopTradeOffer);
  const sendShopPurchase = jest.fn();
  const purchaseCampaignShop = jest.fn(() => ({ ok: true }));
  const ui = {
    shopPanel: new TestElement(),
    shopCoins: new TestElement(),
    shopItems: new TestElement(),
    shopWeapons: new TestElement(),
    shopMoves: new TestElement(),
    shopTrades: new TestElement(),
    shopHeals: new TestElement(),
    shopTabs: ['items', 'weapons', 'moves', 'trades', 'heals'].map(tab => {
      const element = new TestElement();
      element.dataset.tab = tab;
      return element;
    }),
  };
  const Neo = {
    ui,
    player: {
      coins: 1000,
      hp: 100,
      maxHp: 100,
      items: { iron_lung: 1, tough_bandaid: 1 },
      ownedMoves: {},
      ownedWeapons: {},
      equippedMoves: {},
    },
    currentRoom: room,
    shopOffers: room.shopOffers,
    activeShopTab: 'items',
    multiplayerGameView: { active: networkActive },
    gameSession: { sendShopPurchase },
    isShopRoomActive: jest.fn(() => true),
    refreshRoomShopCosts,
    ensureShopHasMinimumItemOffers,
    ensureShopTradeOffer,
    refreshShopVoucherBanner: jest.fn(),
    isChallengeActive: jest.fn(() => false),
    itemRegistry: new Map([
      ['iron_lung', { name: 'Iron Lung', rarity: 'knight', category: 'relic', description: 'Authority item.' }],
      ['tough_bandaid', { name: 'Tough Bandaid', rarity: 'knight', category: 'relic' }],
      ['authority_prize', { name: 'Authority Prize', rarity: 'wizard', category: 'relic' }],
    ]),
    ITEM_DEFS: {},
    MOVE_DEFS: { dash: { name: 'Dash', slot: 'dash', desc: 'Authority move.' } },
    MOVE_BASE_STATS: {},
    WEAPON_DEFS: { neo_blade: { name: 'Neo Blade', rarity: 'knight', description: 'Authority weapon.' } },
    WEAPON_BASE_STATS: {},
    SLOT_LABELS: { dash: 'Dash' },
    VOUCHER_TYPES: [],
    getActiveBuildTags: jest.fn(() => []),
    getRarityNameColor: jest.fn(() => '#ffffff'),
    getRarityDisplayName: jest.fn(value => value),
    drawItemIconCanvases: jest.fn(),
  };
  const windowObject = {
    addEventListener: jest.fn(),
    achievementEvents: { emit: jest.fn() },
  };
  const documentObject = {
    addEventListener: jest.fn(),
    getElementById: jest.fn(() => null),
    activeElement: null,
    hidden: false,
  };
  const globalObject = { NeoNyke: { simulation: { purchaseCampaignShop } } };
  const source = panelSource.replace(/\bexport\s+/g, '');
  const api = new Function(
    'Neo',
    'window',
    'document',
    'Element',
    'HTMLElement',
    'globalThis',
    `${source}; return { getShopMoveOffers, getShopWeaponOffers, renderShopPanel, handleShopBuyClick };`,
  )(Neo, windowObject, documentObject, TestElement, TestElement, globalObject);
  return {
    ...api,
    Neo,
    room,
    TestElement,
    refreshRoomShopCosts,
    ensureShopHasMinimumItemOffers,
    ensureShopTradeOffer,
    sendShopPurchase,
    purchaseCampaignShop,
  };
}

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

  test('doubles every generated ally recruitment price before difficulty scaling', () => {
    expect(ALLY_RECRUIT_PRICE_MULTIPLIER).toBe(2);
    const state = { floorNumber: 1, elapsedSeconds: 0, matchRules: {} };
    const room = { id: 'ally-price-shop', type: 'shop' };
    const player = { items: {}, ownedMoves: {}, ownedWeapons: {}, xp: 0, xpToNext: 20 };
    stockCampaignShop(state, room, player, { next: () => 0 });
    expect(room.shopAllyOffers.map(offer => offer.cost)).toEqual([180, 196, 212]);
  });

  test('reads authority shop pressure from the canonical nested difficulty', () => {
    const player = { items: {}, ownedMoves: {}, ownedWeapons: {}, xp: 0, xpToNext: 20 };
    const easyRoom = { id: 'easy-shop', type: 'shop' };
    const godRoom = { id: 'god-shop', type: 'shop' };
    stockCampaignShop(
      { floorNumber: 1, elapsedSeconds: 0, matchRules: { difficulty: { shopPriceMultiplier: 1, shopItemOffers: 3 } } },
      easyRoom,
      player,
      new RandomService({ matchSeed: 'nested-shop' }).stream('shop'),
    );
    stockCampaignShop(
      { floorNumber: 1, elapsedSeconds: 0, matchRules: { difficulty: { shopPriceMultiplier: 1.42, shopItemOffers: 1 } } },
      godRoom,
      player,
      new RandomService({ matchSeed: 'nested-shop' }).stream('shop'),
    );
    expect(godRoom.shopOffers.filter(offer => offer.type === 'item')).toHaveLength(1);
    expect(godRoom.shopOffers.find(offer => offer.type === 'item').cost)
      .toBeGreaterThan(easyRoom.shopOffers.find(offer => offer.type === 'item').cost);
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

  test('multiplayer shop rendering and reads preserve every authority-projected offer', () => {
    const harness = createShopPanelHarness({ networkActive: true });
    const authorityStock = JSON.parse(JSON.stringify(harness.room));
    const moveOffers = harness.room.shopMoveOffers;
    const weaponOffers = harness.room.shopWeaponOffers;

    expect(harness.getShopMoveOffers()).toBe(moveOffers);
    expect(harness.getShopWeaponOffers()).toBe(weaponOffers);
    harness.renderShopPanel();
    expect(harness.Neo.ui.shopItems.innerHTML).toContain('731');

    harness.Neo.activeShopTab = 'trades';
    harness.renderShopPanel();
    expect(harness.Neo.ui.shopTrades.innerHTML).toContain('Authority Prize');

    expect(harness.room).toEqual(authorityStock);
    expect(harness.ensureShopHasMinimumItemOffers).not.toHaveBeenCalled();
    expect(harness.ensureShopTradeOffer).not.toHaveBeenCalled();
    expect(harness.refreshRoomShopCosts).not.toHaveBeenCalled();
  });

  test('the non-network shop read and render path still runs campaign stock and cost refreshes', () => {
    const harness = createShopPanelHarness({ networkActive: false });

    expect(harness.getShopMoveOffers()[0].cost).toBe(42);
    expect(harness.getShopWeaponOffers()[0].cost).toBe(42);
    harness.renderShopPanel();
    expect(harness.Neo.ui.shopItems.innerHTML).toContain('42');
    harness.Neo.activeShopTab = 'trades';
    harness.renderShopPanel();

    expect(harness.ensureShopHasMinimumItemOffers).toHaveBeenCalledTimes(2);
    expect(harness.ensureShopTradeOffer).toHaveBeenCalledTimes(1);
    expect(harness.refreshRoomShopCosts).toHaveBeenCalledTimes(4);
  });

  test('multiplayer shop purchase clicks still route to the authority', () => {
    const harness = createShopPanelHarness({ networkActive: true });
    const button = new harness.TestElement();
    button.dataset.kind = 'weapon';
    button.dataset.index = '0';

    harness.handleShopBuyClick({ target: button });

    expect(harness.sendShopPurchase).toHaveBeenCalledWith('weapon', { offerIndex: 0 });
    expect(harness.purchaseCampaignShop).not.toHaveBeenCalled();
  });
});
