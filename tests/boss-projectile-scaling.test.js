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

describe('boss projectile speed scaling', () => {
  const worldPath = path.join(__dirname, '../js/game/world.js');
  const source = fs.readFileSync(worldPath, 'utf8');
  const declaration = extractFunction(source, 'getProjectileSpeedMultiplier');

  function getMultiplier({
    difficultyMultiplier = 1,
    speedMultiplier = 1,
    elapsedSeconds = 0,
    bossProjectile = true,
  } = {}) {
    const Neo = {
      selectedDifficulty: 'medium',
      gameElapsedTime: elapsedSeconds,
      ENEMY_SCALING: { speedMinute: 0.018 },
      getDifficultyDef: () => ({
        ...(difficultyMultiplier == null ? {} : { bossProjectileSpeedMultiplier: difficultyMultiplier }),
        speedMultiplier,
      }),
      isBossType: type => type === 'god',
    };
    const getProjectileSpeedMultiplier = new Function(
      'Neo',
      `${declaration}; return getProjectileSpeedMultiplier;`,
    )(Neo);

    return getProjectileSpeedMultiplier({ bossProjectile }, true, {});
  }

  test('increases boss projectile speed as elapsed run time grows', () => {
    expect(getMultiplier({ elapsedSeconds: 0 })).toBeCloseTo(1);
    expect(getMultiplier({ elapsedSeconds: 600 })).toBeCloseTo(1.18);
  });

  test('increases boss projectile speed with the difficulty multiplier', () => {
    const medium = getMultiplier({ difficultyMultiplier: 1 });
    const impossible = getMultiplier({ difficultyMultiplier: 1.3 });
    const god = getMultiplier({ difficultyMultiplier: 1.4 });

    expect(impossible).toBeGreaterThan(medium);
    expect(god).toBeGreaterThan(impossible);
  });

  test('uses the general speed multiplier when a custom difficulty has no boss override', () => {
    expect(getMultiplier({ difficultyMultiplier: null, speedMultiplier: 1.25 })).toBeCloseTo(1.25);
  });

  test('does not add elapsed-time scaling to regular enemy projectiles', () => {
    expect(getMultiplier({ elapsedSeconds: 600, bossProjectile: false })).toBeCloseTo(1);
  });
});
