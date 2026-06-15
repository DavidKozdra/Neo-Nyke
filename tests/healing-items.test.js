const fs = require('node:fs');
const path = require('node:path');

function extractFunction(sourcePath, functionName, dependencies = {}) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const start = source.indexOf(`export function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const bodyStart = source.indexOf(') {', start) + 2;
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }

  const declaration = source
    .slice(start, end + 1)
    .replace('export function', 'function');
  return new Function(
    ...Object.keys(dependencies),
    `${declaration}; return ${functionName};`,
  )(...Object.values(dependencies));
}

function loadItemDefs() {
  const source = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');
  const dataSource = source
    .slice(0, source.indexOf('export const ui ='))
    .replace(/\bexport\s+/g, '');
  return new Function(
    'Neo',
    `${dataSource}; return ITEM_DEFS;`,
  )({
    buildWeightTable(entries) {
      return entries;
    },
  });
}

describe('healing relics', () => {
  test('overhealing does not grant another relic stack', () => {
    const collectItem = jest.fn();
    const Neo = {
      player: {
        hp: 100,
        maxHp: 100,
        character: 'thorn_knight',
        overhealBarrier: 0,
      },
      frameId: 0,
      collectItem,
      getItemCount: () => 99,
      getItemStats: () => ({}),
      rng: () => 0,
    };
    const applyPlayerHealing = extractFunction(
      path.join(__dirname, '../js/game/player.js'),
      'applyPlayerHealing',
      { Neo, window: { achievementEvents: null } },
    );

    expect(applyPlayerHealing(50)).toBe(0);
    expect(collectItem).not.toHaveBeenCalled();
  });


});
