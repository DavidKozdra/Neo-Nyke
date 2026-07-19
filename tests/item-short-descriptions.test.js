const fs = require('node:fs');
const path = require('node:path');

function loadItemDescriptions() {
  return require('../js/simulation/SharedItemDefinitions');
}

describe('item short descriptions', () => {
  const data = loadItemDescriptions();
  const gameStateSource = fs.readFileSync(
    path.join(__dirname, '../js/core/game-state.js'),
    'utf8',
  );

  test('gives every non-green relic concise gameplay copy', () => {
    Object.values(data.ITEM_DEFS).forEach(item => {
      if (item.rarity === 'green' || item.category === 'green') return;
      expect(data.ITEM_SHORT_DESCRIPTIONS[item.key]).toBeTruthy();
      expect(data.getItemShortDescription(item).length).toBeLessThanOrEqual(90);
    });
  });

  test('keeps green relic descriptions unchanged', () => {
    Object.values(data.ITEM_DEFS)
      .filter(item => item.rarity === 'green' || item.category === 'green')
      .forEach(item => {
        expect(data.ITEM_SHORT_DESCRIPTIONS[item.key]).toBeUndefined();
        expect(item.shortDescription).toBe(item.description);
        expect(data.getItemShortDescription(item)).toBe(item.description);
      });
  });

  test('preserves full copy while runtime item UI receives short copy', () => {
    expect(gameStateSource).toContain("fullDescription: definition.description || ''");
    expect(gameStateSource).toContain('description: Neo.getItemShortDescription?.(definition)');
  });
});
