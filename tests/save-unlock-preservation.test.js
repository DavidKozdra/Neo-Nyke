const fs = require('node:fs');
const path = require('node:path');

// Pulls a top-level `function name(...) { ... }` declaration out of game-state.js
// (which is wrapped in a module IIFE) so we can exercise the normalizer in isolation.
function extractFunction(source, functionName) {
  const marker = `function ${functionName}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing function ${functionName}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  return source.slice(start, end + 1);
}

function loadNormalizer(name, NeoStub = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');
  const fnSource = extractFunction(source, name);
  // normalizeUnlockedItems references a `migrateCharacterKey`-style migration inline,
  // so provide any helpers the body might close over via the Neo stub.
  return new Function('Neo', `${fnSource}; return ${name};`)(NeoStub);
}

describe('save unlock preservation across content changes', () => {
  test('normalizeUnlockedItems keeps keys not in the current ITEM_KEYS (rename-safe)', () => {
    // Neo.ITEM_KEYS deliberately does NOT contain the saved keys: a renamed/removed item
    // must not erase the unlock from an existing save.
    const normalizeUnlockedItems = loadNormalizer('normalizeUnlockedItems', { ITEM_KEYS: [] });
    const result = normalizeUnlockedItems(['some_future_relic', 'another_unknown_item']);
    expect(result).toEqual(expect.arrayContaining(['some_future_relic', 'another_unknown_item']));
  });

  test('normalizeUnlockedItems still applies the legacy key migrations', () => {
    const normalizeUnlockedItems = loadNormalizer('normalizeUnlockedItems', { ITEM_KEYS: [] });
    const result = normalizeUnlockedItems(['thorn', 'hemo', 'leech']);
    expect(result).toEqual(expect.arrayContaining(['neo_knife', 'orb_of_blood', 'hemes_scarf']));
    expect(result).not.toContain('thorn');
  });

  test('normalizeUnlockedItems dedupes and drops non-string junk', () => {
    const normalizeUnlockedItems = loadNormalizer('normalizeUnlockedItems', { ITEM_KEYS: [] });
    const result = normalizeUnlockedItems(['a', 'a', '', null, undefined, 'b']);
    expect(result.sort()).toEqual(['a', 'b']);
  });

  test('normalizeUnlockedItems returns [] for non-array input', () => {
    const normalizeUnlockedItems = loadNormalizer('normalizeUnlockedItems', { ITEM_KEYS: [] });
    expect(normalizeUnlockedItems(undefined)).toEqual([]);
    expect(normalizeUnlockedItems(null)).toEqual([]);
  });

  test('normalizeLegacySelection keeps purchased keys not in LEGACY_UPGRADES (rename-safe)', () => {
    const normalizeLegacySelection = loadNormalizer('normalizeLegacySelection', { LEGACY_UPGRADES: {} });
    const result = normalizeLegacySelection(['renamed_upgrade', 'unknown_legacy']);
    expect(result).toEqual(expect.arrayContaining(['renamed_upgrade', 'unknown_legacy']));
  });

  test('normalizeLegacySelection dedupes and drops junk', () => {
    const normalizeLegacySelection = loadNormalizer('normalizeLegacySelection', { LEGACY_UPGRADES: {} });
    expect(normalizeLegacySelection(['x', 'x', '', null]).sort()).toEqual(['x']);
    expect(normalizeLegacySelection('nope')).toEqual([]);
  });
});
