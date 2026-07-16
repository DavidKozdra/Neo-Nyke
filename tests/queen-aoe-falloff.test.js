const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const worldSource = fs.readFileSync(path.join(root, 'js/game/world.js'), 'utf8');
const enemiesSource = fs.readFileSync(path.join(root, 'js/game/enemies.js'), 'utf8');

function extractFunction(source, name, context = {}) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let end = brace;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return vm.runInNewContext(`(${source.slice(start, end + 1)})`, context);
}

describe("Cult Queen finisher AOE", () => {
  test('falls from five times damage at center to normal damage at the ring', () => {
    const getDamage = extractFunction(worldSource, 'getRadialFalloffDamage', {
      Neo: { clamp: (value, min, max) => Math.max(min, Math.min(max, value)) },
    });

    expect(getDamage(20, 0, 190, 5, 1)).toBe(100);
    expect(getDamage(20, 95, 190, 5, 1)).toBe(60);
    expect(getDamage(20, 190, 190, 5, 1)).toBe(20);
  });

  test('configures the Queen blast to use the telegraph-distance falloff', () => {
    expect(enemiesSource).toContain('{ playerDamageFalloff: { centerMultiplier: 5, edgeMultiplier: 1 } }');
  });
});
