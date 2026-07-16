const fs = require('node:fs');
const path = require('node:path');

function loadItemDescriptions() {
  const source = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');
  const dataSource = source
    .slice(0, source.indexOf('export const ui ='))
    .replace(/\bexport\s+/g, '');
  return new Function(
    'Neo',
    `${dataSource}; return {
      ITEM_DEFS,
      ITEM_SHORT_DESCRIPTIONS,
      getItemShortDescription,
    };`,
  )({
    buildWeightTable(entries) {
      return entries;
    },
  });
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
