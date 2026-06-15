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
  const declaration = source.slice(start, end + 1);
  return new Function(...names, `${declaration}; return ${functionName};`)(...values);
}

describe('golem blood visuals', () => {
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const propsSource = fs.readFileSync(path.join(__dirname, '../js/draw/props.js'), 'utf8');

  test('does not spawn blood spray for either golem type', () => {
    let particleCount = 0;
    const Neo = {
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      rand: () => 0,
      irand: () => 0,
      BLEED_BLOOD_COLORS: ['#a5001e'],
      spawnParticle: () => { particleCount += 1; },
    };
    const spawnBleedSpray = extractFunction(
      combatSource,
      'spawnBleedSpray',
      { Neo, getBloodMultiplier: () => 1 },
    );

    spawnBleedSpray({ x: 0, y: 0, r: 20, type: 'golem', bleedImmune: true }, 2, 1);
    spawnBleedSpray({ x: 0, y: 0, r: 40, type: 'bulk_golem', bleedImmune: true }, 2, 1);
    expect(particleCount).toBe(0);

    spawnBleedSpray({ x: 0, y: 0, r: 20, type: 'hunter', bleedImmune: false }, 1, 1);
    expect(particleCount).toBeGreaterThan(0);
  });

  test('uses debris colors and marks golem corpses as unable to leave blood pools', () => {
    expect(combatSource).toContain("enemy.type === 'bulk_golem' ? '#8a735d' : '#777b80'");
    expect(combatSource).toContain("leavesBloodPool: enemy.type !== 'golem' && enemy.type !== 'bulk_golem'");
    expect(combatSource).toContain("bloodColor: enemy.type === 'golem' || enemy.type === 'bulk_golem'");
  });

  test('rejects blood pools for current and legacy golem corpses', () => {
    const corpseLeavesBloodPool = extractFunction(propsSource, 'corpseLeavesBloodPool');

    expect(corpseLeavesBloodPool({ type: 'golem' })).toBe(false);
    expect(corpseLeavesBloodPool({ type: 'bulk_golem' })).toBe(false);
    expect(corpseLeavesBloodPool({ type: 'hunter', leavesBloodPool: false })).toBe(false);
    expect(corpseLeavesBloodPool({ type: 'hunter', bloodColor: '' })).toBe(false);
    expect(corpseLeavesBloodPool({ type: 'hunter', bloodColor: '#8d0018' })).toBe(true);
  });
});
