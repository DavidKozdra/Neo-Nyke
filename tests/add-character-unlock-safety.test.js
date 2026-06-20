const fs = require('node:fs');
const path = require('node:path');

// Brace-matches a `{ ... }` block starting at `openIndex` (which must point at the `{`).
function matchBraces(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(openIndex, i + 1);
  }
  throw new Error('Unbalanced braces');
}

// Pulls a top-level `function name(...) { ... }` out of a module-wrapped source file.
function extractFunction(source, functionName, deps = {}) {
  const start = source.indexOf(`function ${functionName}(`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);
  const body = matchBraces(source, source.indexOf('{', start));
  const declaration = source.slice(start, source.indexOf('{', start)) + body;
  return new Function(...Object.keys(deps), `${declaration}; return ${functionName};`)(
    ...Object.values(deps),
  );
}

// Evaluates the real `export const CHARACTER_DEFS = { ... }` literal from game-core.js
// so the test runs against the actual shipped roster, not a hand-written fake.
function loadRealCharacterDefs() {
  const source = fs.readFileSync(path.join(__dirname, '../js/core/game-core.js'), 'utf8');
  const marker = 'export const CHARACTER_DEFS =';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Missing CHARACTER_DEFS');
  const literal = matchBraces(source, source.indexOf('{', start));
  return new Function(`return ${literal};`)();
}

describe('adding a character does not delete existing unlocks', () => {
  const stateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');

  // The earned (non-starter) characters whose unlock must survive a roster change.
  const SAVED_UNLOCKS = ['princess', 'thorn_knight', 'metao', 'gelleh', 'mooggy'];

  function normalizeWith(characterDefs) {
    const Neo = {
      CHARACTER_DEFS: characterDefs,
      // LEGACY_CHARACTER_KEYS lives in the migrateCharacterKey closure; normalize calls
      // migrateCharacterKey, so provide a pass-through stub for it.
    };
    // normalizeUnlockedCharacters closes over migrateCharacterKey; inject a no-op version
    // by exposing it on the function's scope via the deps object.
    return extractFunction(stateSource, 'normalizeUnlockedCharacters', {
      Neo,
      migrateCharacterKey: key => key,
    });
  }

  test('temp character added to the roster, earned unlocks unchanged, temp removed', () => {
    const realDefs = loadRealCharacterDefs();
    const tempKey = '__temp_test_char__';
    expect(realDefs[tempKey]).toBeUndefined();

    // Baseline: normalize the save against the real roster.
    const before = normalizeWith(realDefs)(SAVED_UNLOCKS);
    for (const key of SAVED_UNLOCKS) expect(before).toContain(key);

    // Add a temporary character to the roster (simulating shipping a new character).
    const extendedDefs = { ...realDefs, [tempKey]: { skills: {} } };
    const afterAdd = normalizeWith(extendedDefs)(SAVED_UNLOCKS);

    // Every previously-earned unlock must still be present after the roster grew.
    for (const key of SAVED_UNLOCKS) expect(afterAdd).toContain(key);
    // The set of the player's earned unlocks is unchanged (the temp char isn't in the
    // save, so it should NOT appear just from being in the roster).
    expect(afterAdd).not.toContain(tempKey);
    expect(new Set(afterAdd.filter(k => SAVED_UNLOCKS.includes(k))))
      .toEqual(new Set(before.filter(k => SAVED_UNLOCKS.includes(k))));

    // Remove the temp character; the result must match the original baseline exactly.
    const afterRemove = normalizeWith(realDefs)(SAVED_UNLOCKS);
    expect(afterRemove).toEqual(before);

    // And the roster object we mutated never leaked the temp key back into reality.
    expect(loadRealCharacterDefs()[tempKey]).toBeUndefined();
  });

  test('warnIfUnlocksDropped fires when an earned key is lost on load', () => {
    const errors = [];
    const console_ = { error: (...a) => errors.push(a) };
    const warn = extractFunction(stateSource, 'warnIfUnlocksDropped', {
      migrateCharacterKey: key => key,
      console: console_,
    });
    // Saved gelleh, but the loaded list lost it -> must warn.
    warn('unlockedCharacters', ['thorn_knight', 'gelleh'], ['thorn_knight']);
    expect(errors).toHaveLength(1);
    expect(errors[0].join(' ')).toContain('gelleh');

    // Nothing lost -> silent.
    errors.length = 0;
    warn('unlockedCharacters', ['thorn_knight'], ['thorn_knight', 'sarge']);
    expect(errors).toHaveLength(0);
  });
});
