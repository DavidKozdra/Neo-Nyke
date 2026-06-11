const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName, dependencies = {}) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }

  const names = Object.keys(dependencies);
  const values = Object.values(dependencies);
  return new Function(
    ...names,
    `${source.slice(start, end + 1)}; return ${functionName};`,
  )(...values);
}

describe('Scroll of Pool Weight', () => {
  const playerSource = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const inputSource = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');

  test('offers exactly four distinct seeded relic choices', () => {
    const choices = ['a', 'b', 'c', 'd', 'e', 'f'].map(key => ({ key }));
    const getScrollChoiceItems = () => choices.map(choice => ({ ...choice }));
    const Neo = { rng: () => 0 };
    const createChoices = extractFunction(playerSource, 'createScrollPoolWeightChoiceKeys', {
      Neo,
      getScrollChoiceItems,
    });

    const offered = createChoices(() => 0.42);

    expect(offered).toHaveLength(4);
    expect(new Set(offered).size).toBe(4);
    expect(offered.every(key => choices.some(choice => choice.key === key))).toBe(true);
  });

  test('describes an item choice instead of a tag choice', () => {
    const definition = inputSource.slice(
      inputSource.indexOf('scroll_pool_weight: {'),
      inputSource.indexOf('scroll_ego: {'),
    );

    expect(definition).toContain('Choose one of 4 relics');
    expect(definition).not.toContain('item tag');
    expect(definition).toContain("tags: ['scroll', 'control', 'choice']");
  });

  test('stores and applies weighting by item key only', () => {
    expect(playerSource).toContain("buffs.push({ itemKey: state.picks[0], expiresFloor: Neo.floor + 3 })");
    expect(playerSource).not.toContain("buffs.push({ tag: state.picks[0]");
    expect(combatSource).toContain('if (buff.itemKey !== key) return;');
    expect(combatSource).not.toContain('tags.includes(buff.tag)');
  });
});
