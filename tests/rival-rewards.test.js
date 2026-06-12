const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const signatureEnd = source.indexOf(') {', start);
  if (signatureEnd < 0) throw new Error(`Missing body for function ${functionName}`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  return source.slice(start, end + 1);
}

describe('rival defeat rewards', () => {
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');

  test('a final rival defeat drops exactly one blue relic', () => {
    const Neo = {
      ITEM_DEFS: {
        knight_item: { rarity: 'knight' },
        blue_item: { rarity: 'blue' },
        another_blue_item: { rarity: 'BLUE' },
      },
      pickups: [],
      nextRandom: () => 0.99,
    };
    const dropFinalRivalRelic = new Function(
      'Neo',
      `${extractFunction(combatSource, 'dropFinalRivalRelic')}; return dropFinalRivalRelic;`,
    )(Neo);

    expect(dropFinalRivalRelic({ x: 120, y: 80 })).toBe('another_blue_item');
    expect(Neo.pickups).toEqual([
      { x: 120, y: 72, type: 'item', key: 'another_blue_item' },
    ]);
  });

  test('rival packs stay off the ground and random enemy relic rolls exclude rivals', () => {
    const onEnemyDieSource = extractFunction(combatSource, 'onEnemyDie');

    expect(onEnemyDieSource).toContain("enemy.type !== 'rival'");
    expect(onEnemyDieSource).toContain('dropFinalRivalRelic(enemy)');
    expect(onEnemyDieSource).not.toContain('stolenLoot.forEach');
    expect(onEnemyDieSource).toContain('Neo.grantRivalItems?.(other, 10)');
  });
});
