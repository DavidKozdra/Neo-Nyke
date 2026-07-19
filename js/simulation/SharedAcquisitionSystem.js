(function initializeSharedAcquisitionSystem(root, factory) {
  const definitions = typeof require === 'function' ? require('./SharedItemDefinitions.js') : (root.NeoNyke?.content || {});
  const inventory = typeof require === 'function' ? require('./SharedInventorySystem.js') : (root.NeoNyke?.simulation || {});
  const moves = typeof require === 'function' ? require('./SharedMoveContent.js') : (root.NeoNyke?.content || {});
  const combat = typeof require === 'function' ? require('./SharedCombatContent.js') : (root.NeoNyke?.content || {});
  const api = factory(definitions, inventory, moves, combat);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedAcquisitionApi(definitions, inventory, moves, combat) {
  'use strict';

  const WIZARD_PAW_STATS = Object.freeze(['maxHp', 'attackPower', 'attackSpeed']);
  const VOUCHER_RARITY = Object.freeze({
    voucher_white: 'knight',
    voucher_purple: 'wizard',
    voucher_yellow: 'god',
  });
  const MOVE_BASE_CHARGES = Object.freeze({
    lightning_cross: 2,
    nail_shot: 2,
    dash: 1,
    warp: 4,
    mooggy_zoomies: 2,
    knight_slash_dash: 1,
  });

  const itemCount = (player, key) => Math.max(0, Math.floor(Number(player?.items?.[key] || 0)));
  const SCROLL_KEYS = new Set(['scroll_reroll', 'scroll_branching', 'scroll_replace', 'scroll_abundance', 'scroll_pool_weight', 'scroll_ego']);

  function getScrollItemPool(options = {}) {
    const excluded = new Set(options.exclude || []);
    const owned = options.player?.items || {};
    return Object.entries(definitions.ITEM_DEFS || {})
      .filter(([key, item]) => item && !SCROLL_KEYS.has(key) && !item.voucher && item.rarity !== 'blue' && !excluded.has(key))
      .filter(([key]) => !options.ownedOnly || itemCount({ items: owned }, key) > 0)
      .filter(([, item]) => !options.rarity || String(item.rarity || item.category || 'knight').toLowerCase() === options.rarity)
      .map(([key]) => key)
      .sort();
  }

  function getScrollChoiceRarity(key) {
    const item = definitions.ITEM_DEFS?.[key];
    return String(item?.rarity || item?.category || 'knight').toLowerCase();
  }

  function getSameRarityCampaignItem(sourceKey, random = Math.random) {
    const sameRarity = getScrollItemPool({ rarity: getScrollChoiceRarity(sourceKey), exclude: [sourceKey] });
    const fallback = getScrollItemPool({ exclude: [sourceKey] });
    const pool = sameRarity.length ? sameRarity : fallback;
    return pool[Math.floor(Number(random()) * pool.length)] || 'neo_knife';
  }

  function createCampaignScrollPoolChoices(random = Math.random, count = 4) {
    const pool = getScrollItemPool();
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Number(random()) * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    return pool.slice(0, Math.max(0, Number(count || 0)));
  }

  function applyCampaignScrollSelection(player, scrollKey, picks, options = {}) {
    const key = String(scrollKey || '');
    const selected = Array.isArray(picks) ? [...new Set(picks.map(String))] : [];
    const fromKeys = Array.isArray(options.fromKeys) ? [...new Set(options.fromKeys.map(String))].slice(0, 3) : [];
    const floor = Math.max(1, Number(options.floorNumber || 1));
    const random = typeof options.random === 'function' ? options.random : Math.random;
    if (!player || !SCROLL_KEYS.has(key) || itemCount(player, key) <= 0) return { ok: false, reason: 'INVALID_SCROLL_SELECTION' };
    const allItems = new Set(getScrollItemPool());
    const limits = {
      scroll_reroll: [1, 1], scroll_branching: [1, 3], scroll_replace: [1, 1],
      scroll_abundance: [2, 2], scroll_pool_weight: [1, 1], scroll_ego: [0, 0],
    }[key];
    if (selected.length < limits[0] || selected.length > limits[1] || selected.some(itemKey => !allItems.has(itemKey))) {
      return { ok: false, reason: 'INVALID_SCROLL_SELECTION' };
    }
    if (key === 'scroll_reroll' && itemCount(player, selected[0]) <= 0) return { ok: false, reason: 'SCROLL_ITEM_NOT_OWNED' };
    if (key === 'scroll_replace' && (!fromKeys.length || fromKeys.some(itemKey => !allItems.has(itemKey))
      || fromKeys.some(itemKey => getScrollChoiceRarity(itemKey) !== getScrollChoiceRarity(selected[0])))) {
      return { ok: false, reason: 'INVALID_SCROLL_REPLACEMENT' };
    }
    player.items[key] -= 1;
    if (player.items[key] <= 0) delete player.items[key];
    if (Array.isArray(player.scrollPendingQueue)) {
      const pendingIndex = player.scrollPendingQueue.indexOf(key);
      if (pendingIndex >= 0) player.scrollPendingQueue.splice(pendingIndex, 1);
    }
    player.scrollUseSerial = Math.max(0, Math.floor(Number(player.scrollUseSerial || 0))) + 1;
    let rewardKey = '';
    if (key === 'scroll_reroll') {
      const oldKey = selected[0];
      rewardKey = getSameRarityCampaignItem(oldKey, random);
      player.items[oldKey] -= 1;
      if (player.items[oldKey] <= 0) delete player.items[oldKey];
      const collect = options.collectItem || inventory.collectCampaignItem;
      const result = collect?.(player, rewardKey);
      if (result === false || result?.ok === false) return { ok: false, reason: 'ITEM_COLLECTION_FAILED' };
    } else if (key === 'scroll_branching') {
      player.scrollBranchingTargets = { ...(player.scrollBranchingTargets || {}) };
      selected.forEach(itemKey => { player.scrollBranchingTargets[getScrollChoiceRarity(itemKey)] = itemKey; });
    } else if (key === 'scroll_replace') {
      player.scrollReplaceMap = { ...(player.scrollReplaceMap || {}) };
      fromKeys.forEach(itemKey => { player.scrollReplaceMap[itemKey] = selected[0]; });
    } else if (key === 'scroll_abundance') {
      player.scrollAbundance = { items: selected.slice(0, 2), nextCheckFloor: floor + 2, expiresFloor: floor + 8 };
    } else if (key === 'scroll_pool_weight') {
      const buffs = Array.isArray(player.scrollPoolWeights) ? player.scrollPoolWeights : [];
      player.scrollPoolWeights = [...buffs, { itemKey: selected[0], expiresFloor: floor + 3 }].slice(-4);
    } else if (key === 'scroll_ego') {
      player.scrollEgoFloor = floor;
    }
    inventory.syncEquipmentSlots?.(player);
    return { ok: true, type: 'SCROLL_APPLY', scrollKey: key, picks: selected, fromKeys, rewardKey };
  }

  function applyJestersDiceAcquisition(runState, player, collectCount, options = {}) {
    const copies = Math.max(0, Math.floor(Number(collectCount || 0)));
    if (!runState || !player || copies <= 0) return { ok: false, reason: 'INVALID_JESTER_ACQUISITION', bonusItemCounts: {} };
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const rollItem = typeof options.rollItem === 'function'
      ? options.rollItem
      : () => '';
    runState.floorSkipPending = Math.max(0, Number(runState.floorSkipPending || 0)) + 3 * copies;
    const bonusItemCounts = {};
    for (let index = 0; index < 10 * copies; index += 1) {
      const key = String(rollItem(random, ['jesters_dice']) || '');
      if (!key || key === 'jesters_dice' || !definitions.ITEM_DEFS?.[key]) continue;
      const collected = inventory.collectCampaignItem(player, key);
      if (!collected?.ok) continue;
      bonusItemCounts[key] = Number(bonusItemCounts[key] || 0) + 1;
    }
    return { ok: true, type: 'JESTER_ACQUIRED', copies, skipFloors: 3 * copies, bonusItemCounts };
  }

  // The one canonical item-pickup transaction. It owns duplication, inventory
  // mutation, pending selection debts, and Jester's chained grants. Callers only
  // materialize notifications/achievements or authority events from the result.
  function collectCampaignPickup(runState, player, itemKey, options = {}) {
    const key = String(itemKey || '');
    if (!runState || !player || !definitions.ITEM_DEFS?.[key]) return { ok: false, reason: 'INVALID_ITEM' };
    if (options.noItems) return { ok: false, reason: 'ITEMS_DISABLED' };
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const duplicateChance = Math.max(0, Math.min(0.75, Number(options.duplicateChance || 0)));
    const canDuplicate = options.canDuplicate !== false && key !== 'artificer_charger';
    const duplicated = canDuplicate && duplicateChance > 0 && random() < duplicateChance;
    const amount = Math.max(1, Math.floor(Number(options.amount || 1))) * (duplicated ? 2 : 1);
    const collected = inventory.collectCampaignItem(player, key, { amount });
    if (!collected?.ok) return collected;
    const jester = key === 'jesters_dice'
      ? applyJestersDiceAcquisition(runState, player, amount, options)
      : null;
    return {
      ok: true,
      type: 'ITEM_PICKUP_ACQUIRED',
      itemKey: key,
      amount,
      duplicated,
      previousCount: collected.previousCount,
      jester,
    };
  }

  function createCampaignJesterGate(runState, options = {}) {
    const currentFloor = Math.max(1, Math.floor(Number(options.floorNumber ?? runState?.floorNumber ?? runState?.floor ?? 1)));
    const maxFloor = Math.max(currentFloor, Math.floor(Number(options.maxFloor || 10)));
    const pending = Math.max(0, Math.floor(Number(runState?.floorSkipPending || 0)));
    if (!runState || pending <= 0 || currentFloor >= maxFloor || options.hasExistingGate) {
      return { ok: false, reason: 'JESTER_GATE_UNAVAILABLE' };
    }
    const skipFloors = Math.min(pending, maxFloor - currentFloor);
    runState.floorSkipPending = 0;
    return {
      ok: true,
      type: 'JESTER_GATE_CREATED',
      gate: {
        type: 'jesterPortal',
        x: Number(options.x || 0),
        y: Number(options.y || 0),
        skipFloors,
        spawnT: 0,
        activateAt: Math.max(0, Number(options.activateAt || 0)),
        active: Number(options.activateAt || 0) <= 0,
      },
    };
  }

  function useCampaignJesterGate(runState, gate, options = {}) {
    const currentFloor = Math.max(1, Math.floor(Number(runState?.floorNumber ?? runState?.floor ?? 1)));
    const maxFloor = Math.max(currentFloor, Math.floor(Number(options.maxFloor || 10)));
    const skipFloors = Math.min(Math.max(0, Math.floor(Number(gate?.skipFloors || 0))), maxFloor - currentFloor);
    if (!runState || !gate || skipFloors <= 0) return { ok: false, reason: 'JESTER_GATE_UNAVAILABLE' };
    const nextFloor = currentFloor + skipFloors;
    if ('floorNumber' in runState) runState.floorNumber = nextFloor;
    if ('floor' in runState) runState.floor = nextFloor;
    return { ok: true, type: 'JESTER_GATE_USED', previousFloor: currentFloor, floorNumber: nextFloor, skipFloors };
  }

  function applyWizardPawStat(player, stat) {
    if (!player || !WIZARD_PAW_STATS.includes(stat)) return false;
    if (stat === 'maxHp') {
      const previousMaxHp = Math.max(1, Number(player.maxHp || 120));
      player.maxHp = Math.round(previousMaxHp * 1.5);
      player.hp = Math.min(player.maxHp, Math.round(Number(player.hp || previousMaxHp) * 1.5));
    } else if (stat === 'attackPower') {
      player.attackPower = Math.max(3, Math.round(Number(player.attackPower || 0) * 1.5));
    } else {
      player.attackSpeed = Math.max(0.2, Number(player.attackSpeed || 1) * 1.5);
    }
    return true;
  }

  function applyWizardPawSelection(player, picks) {
    const selected = Array.isArray(picks) ? [...new Set(picks.map(String))] : [];
    if (!player || Math.floor(Number(player.wizardPawPendingCount || 0)) <= 0
      || selected.length !== 2 || selected.some(key => !WIZARD_PAW_STATS.includes(key))) {
      return { ok: false, reason: 'INVALID_WIZARD_PAW_SELECTION' };
    }
    selected.forEach(stat => applyWizardPawStat(player, stat));
    player.wizardPawPendingCount = Math.max(0, Math.floor(Number(player.wizardPawPendingCount || 0)) - 1);
    return { ok: true, type: 'WIZARD_PAW_SELECT', picks: selected };
  }

  function getBaseMoveCharges(moveKey, characterKey) {
    if (moveKey === 'dash' && characterKey === 'thorn_knight') return 2;
    return Math.max(1, Number(MOVE_BASE_CHARGES[moveKey] || 1));
  }

  function getBaseWeaponCharges(weaponKey) {
    return Math.max(1, Number(combat.WEAPON_BASE_STATS?.[weaponKey]?.maxCharges || 1));
  }

  function applyExtraBatterySelection(player, moveKey) {
    const key = String(moveKey || '');
    const owned = !!player?.ownedMoves?.[key] || Object.values(player?.equippedMoves || {}).includes(key);
    if (!player || Math.floor(Number(player.extraBatteryPendingCount || 0)) <= 0 || !moves.MOVE_SLOT_BY_KEY?.[key] || !owned) {
      return { ok: false, reason: 'INVALID_EXTRA_BATTERY_SELECTION' };
    }
    const weaponKey = key === 'slash' && player.equippedWeapon ? String(player.equippedWeapon) : '';
    let maxCharges;
    if (weaponKey) {
      player.weaponChargeOverrides = player.weaponChargeOverrides || {};
      const current = Math.max(getBaseWeaponCharges(weaponKey), Number(player.weaponChargeOverrides[weaponKey] || 0));
      maxCharges = current + 1;
      player.weaponChargeOverrides[weaponKey] = maxCharges;
    } else {
      player.moveStackOverrides = player.moveStackOverrides || {};
      const current = Math.max(getBaseMoveCharges(key, player.characterKey || player.character), Number(player.moveStackOverrides[key] || 0));
      maxCharges = current + 1;
      player.moveStackOverrides[key] = maxCharges;
    }
    player.extraBatteryPendingCount = Math.max(0, Math.floor(Number(player.extraBatteryPendingCount || 0)) - 1);
    return { ok: true, type: 'EXTRA_BATTERY_SELECT', moveKey: key, weaponKey, maxCharges };
  }

  function getVoucherItemPool(voucherKey) {
    const rarity = VOUCHER_RARITY[String(voucherKey || '')];
    if (!rarity) return [];
    return Object.entries(definitions.ITEM_DEFS || {})
      .filter(([key, item]) => !VOUCHER_RARITY[key] && !item?.voucher && !item?.scroll
        && String(item?.rarity || item?.category || 'knight').toLowerCase() === rarity)
      .map(([key]) => key)
      .sort();
  }

  function redeemCampaignVoucher(player, voucherKey, itemKey, options = {}) {
    const voucher = String(voucherKey || '');
    const reward = String(itemKey || '');
    if (!player || options.inShop === false || itemCount(player, voucher) <= 0 || !getVoucherItemPool(voucher).includes(reward)) {
      return { ok: false, reason: 'INVALID_VOUCHER_REDEMPTION' };
    }
    player.items[voucher] -= 1;
    if (player.items[voucher] <= 0) delete player.items[voucher];
    inventory.syncEquipmentSlots?.(player);
    const collected = inventory.collectCampaignItem?.(player, reward);
    if (!collected?.ok) {
      player.items[voucher] = itemCount(player, voucher) + 1;
      return { ok: false, reason: collected?.reason || 'ITEM_COLLECTION_FAILED' };
    }
    return { ok: true, type: 'VOUCHER_REDEEM', voucherKey: voucher, itemKey: reward };
  }

  function applyAcquisitionCommand(player, command, args = {}, context = {}) {
    if (command === 'WIZARD_PAW_SELECT') return applyWizardPawSelection(player, args.picks);
    if (command === 'EXTRA_BATTERY_SELECT') return applyExtraBatterySelection(player, args.moveKey);
    if (command === 'VOUCHER_REDEEM') return redeemCampaignVoucher(player, args.voucherKey, args.itemKey, context);
    if (command === 'SCROLL_APPLY') return applyCampaignScrollSelection(player, args.scrollKey, args.picks, { ...context, fromKeys: args.fromKeys });
    return { ok: false, reason: 'UNKNOWN_ACQUISITION_COMMAND' };
  }

  return {
    WIZARD_PAW_STATS,
    VOUCHER_RARITY,
    MOVE_BASE_CHARGES,
    SCROLL_KEYS,
    applyWizardPawStat,
    applyWizardPawSelection,
    applyExtraBatterySelection,
    getVoucherItemPool,
    redeemCampaignVoucher,
    getScrollItemPool,
    getScrollChoiceRarity,
    getSameRarityCampaignItem,
    createCampaignScrollPoolChoices,
    applyCampaignScrollSelection,
    applyJestersDiceAcquisition,
    collectCampaignPickup, createCampaignJesterGate, useCampaignJesterGate,
    applyAcquisitionCommand,
  };
});
