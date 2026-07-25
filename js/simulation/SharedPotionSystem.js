(function initializeSharedPotionSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedPotionApi() {
  'use strict';

  // Presentation and rival-befriending belong to each runtime. This shared
  // policy owns the stored-potion contract: availability, Drink Master's
  // deterministic double roll, healing amount and consumption.
  function resolveCampaignStoredPotion(player, options = {}) {
    if (!player || player.downed) return { ok: false, reason: 'UNAVAILABLE' };
    const stored = Math.max(0, Math.floor(Number(player.storedPotions || 0)));
    if (stored <= 0) return { ok: false, reason: 'EMPTY', storedPotions: stored };
    const maximumHealth = Math.max(1, Number(player.maxHp || 100));
    const healthBefore = Math.max(0, Number(player.hp || 0));
    if (healthBefore >= maximumHealth) return { ok: false, reason: 'FULL_HP', storedPotions: stored };
    const stats = options.itemStats || {};
    const chance = Math.max(0, Math.min(1, Number(stats.potionDoubleChance || 0)));
    const roll = typeof options.random === 'function' ? Number(options.random()) : 1;
    const doubled = chance > 0 && roll < chance;
    const baseHeal = Math.max(0, Number(options.baseHeal ?? 40));
    const storedMultiplier = Math.max(1, Number(stats.storedPotionHealingMultiplier || 1));
    const requestedHeal = baseHeal * storedMultiplier * (doubled ? 2 : 1);
    player.storedPotions = stored - 1;
    player.hp = Math.min(maximumHealth, healthBefore + requestedHeal);
    return {
      ok: true,
      reason: 'USED',
      doubled,
      requestedHeal,
      healedAmount: Math.max(0, player.hp - healthBefore),
      storedPotions: player.storedPotions,
    };
  }

  return { resolveCampaignStoredPotion };
});
