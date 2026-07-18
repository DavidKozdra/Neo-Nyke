(function initializeSharedItemContent(root, factory) {
  const worldContent = typeof require === 'function' ? require('./SharedWorldContent.js') : (root.NeoNyke?.content || {});
  const api = factory(worldContent);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.content = namespace.content || {};
  Object.assign(namespace.content, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedItemContentApi(worldContent) {
  'use strict';

  // Canonical normal-campaign drop content. Browser loot and remote authority
  // import this exact table; there is deliberately no multiplayer item pool.
  const ITEM_DROP_ENTRIES = Object.freeze([
    ['neo_knife', 60, 'knight'], ['tooth_of_thorn', 24, 'knight'],
    ['tough_bandaid', 22, 'knight'], ['orb_of_blood', 28, 'wizard'],
    ['hemes_scarf', 12, 'god'], ['insurance', 18, 'knight'],
    ['gold_vac', 12, 'knight'], ['copycat_charm', 12, 'god'],
    ['crit_charm', 24, 'knight'], ['attack_servo', 22, 'knight'],
    ['enemy_magnet', 28, 'knight'], ['keen_eye', 20, 'knight'],
    ['chrono_spring', 20, 'knight'], ['scholar_seal', 18, 'knight'],
    ['scholar_cap', 12, 'wizard'], ['push_man', 18, 'knight'],
    ['titan_heart', 18, 'knight'], ['charged_adapter', 18, 'wizard'],
    ['pew_pew_box', 18, 'wizard'], ['skizzard_tail', 12, 'wizard'],
    ['zap_to_extreme', 10, 'wizard'], ['panic_button', 10, 'wizard'],
    ['mid_sweepy_box', 12, 'wizard'], ['churu_stick', 10, 'wizard'],
    ['explosive_jelly', 12, 'wizard'], ['dragon_orb', 14, 'wizard'],
    ['ricocete', 20, 'wizard'], ['drink_master', 14, 'wizard'],
    ['turtle_shell', 24, 'knight'], ['anchor_charm', 18, 'knight'],
    ['iron_lung', 10, 'god'], ['iron_helm', 6, 'god'],
    ['oracles_lens', 8, 'god'], ['homing_missile', 10, 'god'],
    ['wizards_paw', 6, 'god'], ['jesters_dice', 4, 'god'],
    ['shield_of_aegis', 4, 'god'], ['pendant_of_kronos', 5, 'god'],
    ['robot_arm', 3, 'god'], ['rich_mans_luck', 5, 'god'],
    ['princes_glasses', 14, 'wizard'], ['procy_pickle', 5, 'god'],
    ['veggys_pendant', 0, 'wizard'], ['mateos_bag', 10, 'wizard'],
    ['extra_battery', 10, 'wizard'], ['mooggy_zoomies', 14, 'wizard'],
    ['el_bartos_cape', 6, 'god'], ['voucher_white', 5, 'knight'],
    ['voucher_purple', 2, 'wizard'], ['voucher_yellow', 1, 'god'],
  ].map(entry => Object.freeze(entry)));
  const ITEM_DROP_WEIGHTS = Object.freeze(ITEM_DROP_ENTRIES.map(([key, weight]) => Object.freeze([key, weight])));
  const ITEM_RARITY_BY_KEY = Object.freeze(Object.fromEntries(ITEM_DROP_ENTRIES.map(([key, , rarity]) => [key, rarity])));
  const ITEM_RARITY_DROP_WEIGHTS = Object.freeze({ knight: 80, wizard: 15, god: 5 });
  const ELITE_ITEM_RARITY_DROP_WEIGHTS = Object.freeze({ knight: 65, wizard: 25, god: 10 });

  function nextRandom(random) {
    if (typeof random === 'function') return random();
    if (typeof random?.next === 'function') return random.next();
    throw new TypeError('A deterministic random function or stream is required');
  }

  function weightedPick(entries, random) {
    const usable = entries.filter(([, weight]) => Number(weight) > 0);
    const total = usable.reduce((sum, [, weight]) => sum + Number(weight), 0);
    if (total <= 0) return '';
    let roll = nextRandom(random) * total;
    for (const [key, weight] of usable) {
      roll -= Number(weight);
      if (roll < 0) return key;
    }
    return usable[usable.length - 1]?.[0] || '';
  }

  function rollCampaignItem(random, options = {}) {
    const excluded = new Set(options.excludeKeys || []);
    const entries = ITEM_DROP_ENTRIES.filter(([key, weight]) => weight > 0 && !excluded.has(key));
    const byRarity = new Map();
    entries.forEach(([key, weight, rarity]) => {
      if (!byRarity.has(rarity)) byRarity.set(rarity, []);
      byRarity.get(rarity).push([key, weight]);
    });
    const rarityWeights = options.elite ? ELITE_ITEM_RARITY_DROP_WEIGHTS : ITEM_RARITY_DROP_WEIGHTS;
    const rarity = weightedPick(Object.entries(rarityWeights).filter(([key]) => byRarity.has(key)), random);
    return weightedPick(byRarity.get(rarity) || [], random);
  }

  function createCampaignItemChoices(count, random, options = {}) {
    const target = Math.max(1, Math.trunc(Number(count) || 1));
    const choices = [];
    const seen = new Set();
    for (let guard = 0; choices.length < target && guard < target * 18; guard += 1) {
      const key = rollCampaignItem(random, { ...options, excludeKeys: [...seen, ...(options.excludeKeys || [])] });
      if (key && !seen.has(key)) { seen.add(key); choices.push(key); }
    }
    return choices;
  }

  function createTreasureChestPlan(options = {}) {
    const random = options.random;
    const geometry = options.geometry || worldContent.CAMPAIGN_ROOM_GEOMETRY;
    if (!geometry) throw new Error('Shared campaign room geometry is unavailable');
    const width = Number(geometry.width);
    const height = Number(geometry.height);
    const wall = Number(geometry.wallThickness);
    const tutorial = !!options.tutorial;
    const floorNumber = Math.max(1, Number(options.floorNumber || 1));
    const itemChance = Math.max(0, Math.min(1, Number(options.itemChance ?? 0.9)));
    const chestCount = tutorial ? 1 : 1 + Math.floor(nextRandom(random) * 2);
    const insetX = wall + 88;
    const insetY = wall + 76;
    const placed = [];
    const chests = [];

    for (let index = 0; index < chestCount; index += 1) {
      const choiceType = !tutorial && floorNumber > 4 && nextRandom(random) < 0.2 ? 'ab' : '';
      const rewardsItem = tutorial || choiceType === 'ab' || nextRandom(random) < itemChance;
      let x = width / 2 + (chestCount === 1 ? 0 : (index - (chestCount - 1) / 2) * 150);
      let y = height / 2 + (index % 2 === 0 ? -36 : 36);
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidateX = insetX + nextRandom(random) * Math.max(1, width - insetX * 2);
        const candidateY = insetY + nextRandom(random) * Math.max(1, height - insetY * 2);
        if (placed.every(point => Math.hypot(point.x - candidateX, point.y - candidateY) >= 132)) {
          x = candidateX;
          y = candidateY;
          break;
        }
      }
      placed.push({ x, y });
      chests.push({
        x,
        y,
        choiceType,
        rewardType: rewardsItem ? 'item' : 'potion',
        rewardKey: rewardsItem && choiceType !== 'ab' ? rollCampaignItem(random) : '',
        rewardChoices: choiceType === 'ab' ? createCampaignItemChoices(2, random) : [],
        tutorialTreasureChest: tutorial,
      });
    }
    return chests;
  }

  return {
    ITEM_DROP_ENTRIES,
    ITEM_DROP_WEIGHTS,
    ITEM_RARITY_BY_KEY,
    ITEM_RARITY_DROP_WEIGHTS,
    ELITE_ITEM_RARITY_DROP_WEIGHTS,
    rollCampaignItem,
    createCampaignItemChoices,
    createTreasureChestPlan,
  };
});
