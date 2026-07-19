(function initializeSharedChestSystem(root, factory) {
  const items = typeof require === 'function' ? require('./SharedItemContent.js') : (root.NeoNyke?.content || {});
  const api = factory(items);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedChestApi(items) {
  'use strict';

  function openCampaignChest(chest, options = {}) {
    if (!chest || chest.open || chest.opened || chest.activated) return { ok: false, reason: 'CHEST_UNAVAILABLE' };
    const random = options.random;
    const floor = Math.max(1, Number(options.floorNumber || 1));
    chest.open = true;
    chest.opened = false;
    chest.activated = true;
    const result = {
      ok: true,
      type: 'CHEST_OPENED',
      coinAmount: Math.max(0, Number(chest.coinAmount ?? 12 + floor * 2)),
      pickups: [],
      selection: null,
      revealExit: !!chest.treasureHuntExitChest,
    };
    if ((chest.rewardType || 'item') === 'potion') {
      result.pickups.push({ type: 'potion', x: chest.x, y: Number(chest.y) - 20 });
      chest.opened = true;
      return result;
    }
    if (chest.choiceType === 'ab') {
      const hasAuthoredChoices = Array.isArray(chest.rewardChoices) && chest.rewardChoices.length >= 2;
      const choices = hasAuthoredChoices
        ? chest.rewardChoices.slice(0, 2)
        : items.createCampaignItemChoices(2, random, { excludeKeys: chest.rewardKey ? [chest.rewardKey] : [] });
      // rewardKey is a seed for generated legacy A/B chests. Never overwrite an
      // authored or authority-replicated option list with that stale seed.
      if (!hasAuthoredChoices && chest.rewardKey && !choices.includes(chest.rewardKey)) choices[0] = chest.rewardKey;
      chest.rewardChoices = [...new Set(choices)].slice(0, 2);
      if (chest.rewardChoices.length < 2) return { ok: false, reason: 'NO_CHEST_CHOICES' };
      chest.choiceGroupId = chest.choiceGroupId || String(options.groupId || chest.id || `chest:${Math.round(chest.x)}:${Math.round(chest.y)}`);
      result.selection = { selectionEventId: chest.choiceGroupId, optionIds: chest.rewardChoices.slice(), picksRemaining: 1 };
      return result;
    }
    const rewardKey = chest.rewardKey || items.rollCampaignItem(random);
    if (rewardKey) result.pickups.push({ type: 'item', key: rewardKey, x: chest.x, y: Number(chest.y) - 20 });
    chest.opened = true;
    return result;
  }

  function claimCampaignChestSelection(chest, optionId) {
    const key = String(optionId || '');
    if (!chest || chest.opened || !chest.activated || !Array.isArray(chest.rewardChoices) || !chest.rewardChoices.includes(key)) {
      return { ok: false, reason: 'INVALID_CHEST_SELECTION' };
    }
    chest.opened = true;
    chest.open = true;
    chest.claimedRewardKey = key;
    return { ok: true, type: 'CHEST_REWARD_SELECTED', itemKey: key, selectionEventId: chest.choiceGroupId || chest.id };
  }

  return { openCampaignChest, claimCampaignChestSelection };
});
