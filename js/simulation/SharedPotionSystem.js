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
  function resolveCampaignPotionBaseHeal(options = {}) {
    const base = Math.max(0, Number(options.baseHeal ?? 40));
    const difficulty = options.difficulty || {};
    // Campaign defaults to Medium (stat multiplier 1.06). A supplied runtime
    // multiplier wins; otherwise derive game-state's difficulty pressure curve.
    const statMultiplier = Math.max(0, Number(difficulty.statMultiplier ?? options.statMultiplier ?? 1.06));
    const pressure = Math.max(0, Math.min(1, (statMultiplier - 1) / 0.52));
    const difficultyMultiplier = Math.max(0, Number(options.difficultyPotionHealMultiplier ?? (1 - pressure * 0.16)));
    const healingMultiplier = Math.max(0.05, Number(options.healingMultiplier ?? 1));
    return Math.max(Number(options.minimumAmount ?? 24), Math.round(base * difficultyMultiplier * healingMultiplier));
  }

  // Mateo's Bag is the only campaign source of stored-potion capacity. Keep
  // this small rule shared because room entry, walk-over potion pickups, the
  // HUD, and the authoritative use action all need to agree on it.
  function getCampaignPotionCarryCap(player) {
    const stacks = Math.max(0, Math.floor(Number(player?.items?.mateos_bag || 0)));
    return stacks > 0 ? 3 + (stacks - 1) : 0;
  }

  // Walk-over potions heal immediately when the hero is hurt. Mateo's Bag makes
  // that immediate heal 10% stronger per stack; at full health the potion is
  // stored instead, never beyond the bag's exact capacity. Stored potions use
  // the separate, stronger stored-potion multiplier when consumed.
  function resolveCampaignPotionPickup(player, options = {}) {
    if (!player || player.downed) return { ok: false, reason: 'UNAVAILABLE' };
    const maximumHealth = Math.max(1, Number(player.maxHp || 100));
    const healthBefore = Math.max(0, Number(player.hp || 0));
    const stats = options.itemStats || player.itemStats || {};
    const chance = Math.max(0, Math.min(1, Number(stats.potionDoubleChance || 0)));
    const random = typeof options.random === 'function' ? options.random : () => 1;
    const doubled = chance > 0 && Number(random()) < chance;
    const applications = doubled ? 2 : 1;
    if (healthBefore < maximumHealth) {
      const pickupMultiplier = Math.max(1, Number(stats.potionPickupHealingMultiplier || 1));
      const requestedHeal = Math.max(0, Number(options.baseHeal ?? 40)) * pickupMultiplier * applications;
      let healedAmount;
      if (typeof options.heal === 'function') {
        healedAmount = Math.max(0, Number(options.heal(requestedHeal) || 0));
      } else {
        player.hp = Math.min(maximumHealth, healthBefore + requestedHeal);
        healedAmount = Math.max(0, player.hp - healthBefore);
      }
      return { ok: true, kind: 'heal', doubled, applications, requestedHeal, healedAmount, storedPotions: Number(player.storedPotions || 0) };
    }
    const potionCap = Math.max(0, Number((typeof options.getPotionCarryCap === 'function'
      ? options.getPotionCarryCap(player)
      : getCampaignPotionCarryCap(player)) || 0));
    const stored = Math.max(0, Math.floor(Number(player.storedPotions || 0)));
    if (potionCap <= stored) return { ok: false, reason: 'UNUSABLE', doubled, potionCap, storedPotions: stored };
    const storedGain = Math.min(applications, potionCap - stored);
    player.storedPotions = stored + storedGain;
    return { ok: true, kind: 'stored', doubled, applications, storedGain, potionCap, storedPotions: player.storedPotions, healedAmount: 0 };
  }

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

  return { resolveCampaignPotionBaseHeal, getCampaignPotionCarryCap, resolveCampaignPotionPickup, resolveCampaignStoredPotion };
});
