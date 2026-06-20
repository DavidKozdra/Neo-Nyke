const fs = require('node:fs');
const path = require('node:path');

// Extract a top-level function declaration by name, resolving its free
// variables from the supplied dependency map (same approach as the other
// source-extraction tests in this suite).
function extractFunction(sourcePath, functionName, dependencies = {}) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const exportPrefix = `export function ${functionName}`;
  const plainPrefix = `function ${functionName}`;
  const start = source.indexOf(exportPrefix) >= 0
    ? source.indexOf(exportPrefix)
    : source.indexOf(plainPrefix);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  // Start the brace scan at the function body, not at a `{}` default parameter
  // (e.g. `options = {}`) in the signature — match the `{` after the params' `)`.
  const paramsEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', paramsEnd);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }

  const declaration = source.slice(start, end + 1).replace('export function', 'function');
  const names = Object.keys(dependencies);
  const values = Object.values(dependencies);
  return new Function(...names, `${declaration}; return ${functionName};`)(...values);
}

describe('createCooldownEntry hold-to-charge restore', () => {
  const gameStatePath = path.join(__dirname, '../js/game/../core/game-state.js');

  function makeEntry({ player = { equippedMoves: { smash: 'healing_zone' } }, source = null, options = {} } = {}) {
    const Neo = {
      player,
      chosenCharacter: 'metao',
      getAttackSpeedValue: () => 1,
    };
    const createCooldownEntry = extractFunction(gameStatePath, 'createCooldownEntry', {
      Neo,
      getMoveMaxStacks: () => 1,
      getSlotCooldownDuration: () => 5,
    });
    return createCooldownEntry('smash', player, source, options);
  }

  test('a saved hold becomes a real recharge timer (no permanently-locked pip)', () => {
    // What the snapshot looks like when the player quit mid-charge: the charge
    // was spent with a deferred timer, so it persisted as `holding` with no timer.
    const entry = makeEntry({
      source: { charges: 0, maxCharges: 1, timers: [], holding: 1 },
      options: { fromSnapshot: true },
    });

    expect(entry.charges).toBe(0);
    expect(entry.holding).toBe(0);          // hold must not survive the restore
    expect(entry.timers).toEqual([5]);      // converted into a recoverable timer
  });

  test('a live rebuild keeps the hold intact (its charging session is still live)', () => {
    const entry = makeEntry({
      source: { charges: 0, maxCharges: 1, timers: [], holding: 1 },
      options: {}, // not fromSnapshot
    });

    expect(entry.charges).toBe(0);
    expect(entry.holding).toBe(1);          // live hold preserved
    expect(entry.timers).toEqual([]);
  });

  test('a full restored slot still reads as ready', () => {
    const entry = makeEntry({
      source: { charges: 1, maxCharges: 1, timers: [], holding: 0 },
      options: { fromSnapshot: true },
    });

    expect(entry.charges).toBe(1);
    expect(entry.holding).toBe(0);
    expect(entry.timers).toEqual([]);
  });
});
