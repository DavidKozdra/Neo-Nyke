const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
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
  return source.slice(start, end + 1);
}

describe('Crit roll-back system', () => {
  const mathSource = fs.readFileSync(path.join(__dirname, '../js/core/math-utils.js'), 'utf8');
  // eslint-disable-next-line no-eval
  const applyCritRollback = eval(`(${extractFunction(mathSource, 'applyCritRollback')})`);
  // eslint-disable-next-line no-eval
  const applyProcRollback = eval(`(${extractFunction(mathSource, 'applyProcRollback')})`);

  test('leaves sub-100% chance and multiplier untouched', () => {
    const { critChance, critMultiplier } = applyCritRollback(0.6, 1.6);
    expect(critChance).toBeCloseTo(0.6, 5);
    expect(critMultiplier).toBeCloseTo(1.6, 5);
  });

  test('at 100% rolls chance back to 75% and ×1.5 the crit damage', () => {
    const { critChance, critMultiplier } = applyCritRollback(1.0, 1.6);
    expect(critChance).toBeCloseTo(0.75, 5);
    expect(critMultiplier).toBeCloseTo(1.6 * 1.5, 5);
  });

  test('a single big jump past 100% can roll over more than once (stacking ×1.5)', () => {
    // 1.3 → -0.25 → 1.05 (still ≥1) → -0.25 → 0.80, two ×1.5 applications.
    const { critChance, critMultiplier } = applyCritRollback(1.3, 2.0);
    expect(critChance).toBeCloseTo(0.8, 5);
    expect(critMultiplier).toBeCloseTo(2.0 * 1.5 * 1.5, 5);
  });

  test('guards against runaway loops on absurd input', () => {
    const { critChance, critMultiplier } = applyCritRollback(1000, 1.6);
    expect(Number.isFinite(critChance)).toBe(true);
    expect(Number.isFinite(critMultiplier)).toBe(true);
  });

  test('status proc rollback uses 100% -> 80% and increases effect power', () => {
    const { procChance, effectMultiplier } = applyProcRollback(1.0, 1);
    expect(procChance).toBeCloseTo(0.8, 5);
    expect(effectMultiplier).toBeCloseTo(1.5, 5);
  });

  test('status proc rollback can roll over multiple times', () => {
    const { procChance, effectMultiplier } = applyProcRollback(1.3, 2);
    expect(procChance).toBeCloseTo(0.9, 5);
    expect(effectMultiplier).toBeCloseTo(2 * 1.5 * 1.5, 5);
  });
});

describe('Enemy time-based crit aggression', () => {
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const { resolveCampaignEnemyTimeAggression } = require('../js/simulation/SharedEliteSystem');

  test('combat.js defines and exposes getEnemyTimeAggression', () => {
    expect(combatSource).toContain('function getEnemyTimeAggression()');
    expect(combatSource).toContain('Neo.getEnemyTimeAggression = getEnemyTimeAggression');
  });

  test('aggression ramps every 5 minutes by 5% per axis', () => {
    const fn = extractFunction(combatSource, 'getEnemyTimeAggression');
    expect(fn).toContain('resolveCampaignEnemyTimeAggression');
    expect(resolveCampaignEnemyTimeAggression({ elapsedSeconds: 300 })).toEqual({
      steps: 1, critChance: 0.05, critMultiplier: 1.55, damageMultiplier: 1.05,
    });
    const reduced = resolveCampaignEnemyTimeAggression({ elapsedSeconds: 300, overclockedWatchAggressionCut: 0.3 });
    expect(reduced).toEqual(expect.objectContaining({ steps: 1 }));
    expect(reduced.critChance).toBeCloseTo(0.035);
    expect(reduced.critMultiplier).toBeCloseTo(1.535);
    expect(reduced.damageMultiplier).toBeCloseTo(1.035);
  });
});
