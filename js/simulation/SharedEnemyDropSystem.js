(function initializeSharedEnemyDropSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEnemyDropApi() {
  'use strict';

  function getCampaignItemDropChance(baseChance, maximumChance = 1, options = {}) {
    const difficultyMultiplier = Math.max(0, Number(options.difficultyMultiplier ?? 1));
    const itemBonus = Math.max(0, Number(options.itemDropChanceBonus || 0));
    return Math.max(0, Math.min(Number(maximumChance || 1), (Math.max(0, Number(baseChance || 0)) + itemBonus) * difficultyMultiplier));
  }

  function getCampaignEnemyCoinReward(enemy) {
    if (!enemy || enemy.tutorialDummy) return 0;
    return enemy.boss || enemy.isBoss ? 40 : enemy.elite ? 10 : 5;
  }

  // XP belongs to the same death-reward transaction as coins and loot. The
  // tutorial dummy deliberately grants its relic only; it must not become a
  // free level on the authority merely because network recipients are looped.
  function getCampaignEnemyExperienceReward(enemy) {
    if (!enemy || enemy.tutorialDummy) return 0;
    return enemy.boss || enemy.isBoss ? 40 : enemy.elite ? 12 : 6;
  }

  function createCampaignCoinDropPlan(x, y, amount, options = {}) {
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const modeMultiplier = options.gameMode === 'treasure_hunt' ? 3 : 1;
    let remaining = Math.max(1, Math.round(Number(amount || 0)
      * Math.max(0, Number(options.coinRewardMultiplier ?? 1)) * modeMultiplier));
    const pickups = [];
    while (remaining > 0) {
      const roll = Number(random());
      let value = 1;
      if (remaining >= 15 && roll < 0.05) value = 15;
      else if (remaining >= 10 && roll < 0.12) value = 10;
      else if (remaining >= 5 && roll < 0.28) value = 5;
      const spread = value >= 15 ? 26 : value >= 10 ? 22 : value >= 5 ? 18 : 14;
      pickups.push({
        type: 'coin', value,
        x: Number(x || 0) + (Number(random()) * 2 - 1) * spread,
        y: Number(y || 0) + (Number(random()) * 2 - 1) * spread,
      });
      remaining -= value;
    }
    return pickups;
  }

  // Picks the campaign enemy-loot branch but intentionally does not create an
  // item key. The campaign and authority each use their own acquisition/ID
  // materialization while sharing branch priority, chance math and random use.
  function resolveCampaignEnemyDrop(enemy, options = {}) {
    if (!enemy) return null;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const tutorialDummy = !!options.tutorialDummy;
    if (tutorialDummy) return { type: 'item', elite: false, tutorial: true };
    if (enemy.rivalTurret) return random() < 0.5 ? { type: 'potion', source: 'rival_turret' } : null;
    if (enemy.type === 'rival') return null;
    const itemDropChanceBonus = Math.max(0, Number(options.itemDropChanceBonus || 0));
    const difficultyMultiplier = Math.max(0, Number(options.difficultyMultiplier ?? 1));
    if (enemy.elite && random() < getCampaignItemDropChance(0.18, 0.65, { itemDropChanceBonus, difficultyMultiplier })) {
      return { type: 'item', elite: true };
    }
    if (!enemy.elite && random() < getCampaignItemDropChance(0, 0.35, { itemDropChanceBonus, difficultyMultiplier })) {
      return { type: 'item', elite: false };
    }
    const potionDropChance = 0.1 * Math.max(0, Number(options.potionDropMultiplier ?? 1));
    return random() < potionDropChance ? { type: 'potion', source: 'enemy' } : null;
  }

  // Boss vouchers are an all-or-nothing branch: the god relic can only roll
  // after the voucher succeeds. Keep that ordering shared so consuming random
  // values cannot change a subsequent campaign drop.
  function resolveCampaignBossBonusDrops(enemy, options = {}) {
    if (!enemy || !options.isBoss || options.tutorialDummy || options.forceDeath || options.practice || options.noItems) return [];
    const random = typeof options.random === 'function' ? options.random : Math.random;
    if (Number(random()) >= 0.65) return [];
    const drops = [{ type: 'item', key: 'forge_voucher', source: 'boss_voucher' }];
    if (Number(random()) < 0.12) drops.push({ type: 'god_item', source: 'boss_voucher' });
    return drops;
  }

  function rollCampaignGodItem(itemDefinitions = {}, random = Math.random) {
    const keys = Object.entries(itemDefinitions)
      .filter(([, item]) => String(item?.rarity || '').toLowerCase() === 'god' && !item?.voucher)
      .map(([key]) => key);
    return keys[Math.max(0, Math.min(keys.length - 1, Math.floor(Number(random()) * keys.length)))] || '';
  }

  function resolveCampaignRivalKillReward(options = {}) {
    const floorNumber = Math.max(1, Number(options.floorNumber || 1));
    const finalDeath = !!options.finalDeath;
    const stolenLootCount = Math.max(0, Math.floor(Number(options.stolenLootCount || 0)));
    const baseCoins = 18 + floorNumber * 4 + (finalDeath ? stolenLootCount * 8 : 0);
    const coins = Math.round(baseCoins * (options.rivalBounty ? 1.5 : 1));
    return { coins, experience: 20 + floorNumber * 3, finalRelic: finalDeath };
  }

  function rollCampaignFinalRivalRelic(itemDefinitions = {}, random = Math.random) {
    const keys = Object.entries(itemDefinitions)
      .filter(([, item]) => String(item?.rarity || '').toLowerCase() === 'blue')
      .map(([key]) => key);
    return keys[Math.max(0, Math.min(keys.length - 1, Math.floor(Number(random()) * keys.length)))] || '';
  }

  return {
    getCampaignItemDropChance, getCampaignEnemyCoinReward, getCampaignEnemyExperienceReward,
    createCampaignCoinDropPlan, resolveCampaignEnemyDrop, resolveCampaignBossBonusDrops, rollCampaignGodItem,
    resolveCampaignRivalKillReward, rollCampaignFinalRivalRelic,
  };
});
