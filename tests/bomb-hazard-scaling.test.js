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

describe('bomb hazard scaling', () => {
  const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
  const roomSource = fs.readFileSync(path.join(__dirname, '../js/game/roomTemplates.js'), 'utf8');
  const getBombHazardDamageDeclaration = extractFunction(worldSource, 'getBombHazardDamage');

  function damageAt({ depth = 1, elapsedSeconds = 0, baseDamage = 20 } = {}) {
    const Neo = {
      floorsEntered: depth,
      floor: ((depth - 1) % 10) + 1,
      gameElapsedTime: elapsedSeconds,
      BOMB_HAZARD_SCALING: { floor: 0.07, minute: 0.04 },
      getProgressionDepth: () => depth,
    };
    const getBombHazardDamage = new Function(
      'Neo',
      `${getBombHazardDamageDeclaration}; return getBombHazardDamage;`,
    )(Neo);
    return getBombHazardDamage(baseDamage);
  }

  test('keeps first-floor, start-of-run damage at its authored baseline', () => {
    expect(damageAt()).toBe(20);
  });

  test('increases bomb damage with cumulative floor depth', () => {
    expect(damageAt({ depth: 10 })).toBe(33);
    expect(damageAt({ depth: 11 })).toBeGreaterThan(damageAt({ depth: 10 }));
  });

  test('increases bomb damage with elapsed run time', () => {
    expect(damageAt({ elapsedSeconds: 600 })).toBe(28);
    expect(damageAt({ depth: 10, elapsedSeconds: 600 })).toBe(41);
  });

  test('normalizes authored traps into unscaled base damage', () => {
    expect(roomSource).toContain('out.baseDamage = out.damage ?? 18');
    expect(roomSource).toContain('out.baseDamage = out.damage ?? 20');
  });
});
