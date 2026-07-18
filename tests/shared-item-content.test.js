const fs = require('node:fs');
const path = require('node:path');
const {
  ITEM_DROP_ENTRIES,
  ITEM_DROP_WEIGHTS,
  ITEM_RARITY_BY_KEY,
  rollCampaignItem,
  createCampaignItemChoices,
  createTreasureChestPlan,
} = require('../js/simulation/SharedItemContent');

describe('shared campaign item content', () => {
  test('publishes the complete normal-campaign drop table without network-only substitutes', () => {
    const keys = ITEM_DROP_ENTRIES.map(([key]) => key);

    expect(keys).toHaveLength(50);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ITEM_DROP_WEIGHTS.map(([key]) => key)).toEqual(keys);
    expect(Object.keys(ITEM_RARITY_BY_KEY)).toEqual(keys);
    expect(keys).not.toEqual(expect.arrayContaining(['coin_charm', 'war_sigil']));
  });

  test('rolls deterministic, unique choices from that shared table', () => {
    const values = [0.1, 0.2, 0.9, 0.8, 0.4, 0.6];
    let index = 0;
    const random = () => values[(index++) % values.length];
    const choices = createCampaignItemChoices(3, random);

    expect(choices).toHaveLength(3);
    expect(new Set(choices).size).toBe(3);
    choices.forEach(key => expect(ITEM_RARITY_BY_KEY[key]).toBeDefined());
    expect(rollCampaignItem(() => 0)).toBe('neo_knife');
  });

  test('network authority imports shared content instead of defining a private item pool', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../js/simulation/NetworkCombatSystem.js'),
      'utf8',
    );

    expect(source).toContain("require('./SharedItemContent.js')");
    expect(source).not.toMatch(/CAMPAIGN_CHEST_ITEMS|NETWORK_(?:ITEMS|RELICS)|coin_charm|war_sigil/);
  });

  test('single-player and authority consume one complete treasure chest plan', () => {
    const values = Array.from({ length: 100 }, (_, index) => ((index * 37) % 97) / 97);
    const makeRandom = () => {
      let index = 0;
      return () => values[(index++) % values.length];
    };
    const browserPlan = createTreasureChestPlan({ random: makeRandom(), floorNumber: 6, itemChance: 0.9 });
    const authorityRandom = makeRandom();
    const authorityPlan = createTreasureChestPlan({ random: { next: authorityRandom }, floorNumber: 6, itemChance: 0.9 });
    expect(authorityPlan).toEqual(browserPlan);
    expect(browserPlan).toHaveLength(1);
    expect(browserPlan[0]).toEqual(expect.objectContaining({
      x: expect.any(Number), y: expect.any(Number), choiceType: expect.any(String),
      rewardType: expect.stringMatching(/^(item|potion)$/), rewardChoices: expect.any(Array),
    }));

    const browserSource = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');
    const authoritySource = fs.readFileSync(path.join(__dirname, '../js/simulation/NetworkCombatSystem.js'), 'utf8');
    expect(browserSource).toContain('createTreasureChestPlan');
    expect(authoritySource).toContain('createTreasureChestPlan({');
    expect(authoritySource).not.toContain('const chestCount = 1 + stream.int(0, 1)');
  });
});
