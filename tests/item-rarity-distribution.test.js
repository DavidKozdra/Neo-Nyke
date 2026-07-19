const fs = require('node:fs');
const path = require('node:path');

function loadItemData() {
  const source = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');
  const dataSource = source
    .slice(0, source.indexOf('export const ui ='))
    .replace(/\bexport\s+/g, '');
  return new Function(
    'Neo',
    'globalThis',
    `${dataSource}; return {
      ITEM_DEFS,
      ITEM_DROP_TABLE,
      ELITE_ITEM_DROP_TABLE,
      ITEM_RARITY_DROP_WEIGHTS,
      ELITE_ITEM_RARITY_DROP_WEIGHTS,
    };`,
  )({
    buildWeightTable(entries) {
      return entries;
    },
  }, { NeoNyke: { content: { ...require('../js/simulation/SharedItemContent'), ...require('../js/simulation/SharedItemDefinitions') } } });
}

describe('relic rarity distribution', () => {
  const data = loadItemData();
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const playerSource = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');
  const roomsSource = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');

  test('keeps purple rare and yellow rarest for normal and elite rolls', () => {
    expect(data.ITEM_RARITY_DROP_WEIGHTS).toEqual({
      knight: 80,
      wizard: 15,
      god: 5,
    });
    expect(data.ELITE_ITEM_RARITY_DROP_WEIGHTS).toEqual({
      knight: 65,
      wizard: 25,
      god: 10,
    });
  });

  test('normalizes exported flat tables to the configured tier chances', () => {
    const totalByRarity = entries => entries.reduce((totals, [key, weight]) => {
      const rarity = data.ITEM_DEFS[key]?.rarity || 'knight';
      totals[rarity] = (totals[rarity] || 0) + weight;
      return totals;
    }, {});

    expect(totalByRarity(data.ITEM_DROP_TABLE)).toEqual(expect.objectContaining({
      knight: expect.closeTo(80),
      wizard: expect.closeTo(15),
      god: expect.closeTo(5),
    }));
    expect(totalByRarity(data.ELITE_ITEM_DROP_TABLE)).toEqual(expect.objectContaining({
      knight: expect.closeTo(65),
      wizard: expect.closeTo(25),
      god: expect.closeTo(10),
    }));
  });

  test('routes random bonus and rival relics through the shared roller', () => {
    const acquisitionSource = fs.readFileSync(path.join(__dirname, '../js/simulation/SharedAcquisitionSystem.js'), 'utf8');
    expect(acquisitionSource).toContain("rollItem(random, ['jesters_dice'])");
    expect(combatSource).toContain('collectCampaignPickup?.(runState, Neo.player, itemKey');
    expect(combatSource).not.toContain('const rewardPool = Neo.ITEM_KEYS.filter');
    expect(roomsSource).toContain("rarities: godTier ? ['god'] : ['knight', 'wizard']");
    expect(roomsSource).toContain('excludeKeys: Neo.VOUCHER_KEYS || []');
    expect(playerSource).toContain('Neo.rollItemDrop({ random })');
    expect(playerSource).not.toContain('randomPool[Math.floor(random() * randomPool.length)]');
  });
});
