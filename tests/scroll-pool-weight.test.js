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
const inputSource = fs.readFileSync(path.join(__dirname, '../js/simulation/SharedItemDefinitions.js'), 'utf8');
const acquisitionSource = fs.readFileSync(path.join(__dirname, '../js/simulation/SharedAcquisitionSystem.js'), 'utf8');
const { createCampaignScrollPoolChoices } = require('../js/simulation/SharedAcquisitionSystem.js');

  test('offers exactly four distinct seeded relic choices', () => {
    const offered = createCampaignScrollPoolChoices(() => 0.42, 4);

    expect(offered).toHaveLength(4);
    expect(new Set(offered).size).toBe(4);
    expect(offered.every(key => typeof key === 'string' && key.length > 0)).toBe(true);
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
    expect(acquisitionSource).toContain("{ itemKey: selected[0], expiresFloor: floor + 3 }");
    expect(acquisitionSource).not.toContain("{ tag: selected[0]");
    expect(combatSource).toContain('if (buff.itemKey !== key) return;');
    expect(combatSource).not.toContain('tags.includes(buff.tag)');
  });
});
