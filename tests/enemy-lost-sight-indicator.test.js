const fs = require('fs');
const path = require('path');

function loadExportedFunction(sourcePath, functionName) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const start = source.indexOf(`export function ${functionName}`);
  if (start < 0) throw new Error(`Missing exported function ${functionName}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }

  const declaration = source
    .slice(start, end + 1)
    .replace('export function', 'function');
  return new Function(`${declaration}; return ${functionName};`)();
}

describe('enemy lost-sight indicator', () => {
  const updatePath = path.join(__dirname, '../js/core/update.js');
  const drawPath = path.join(__dirname, '../js/draw/entities.js');
  const updateEnemyLostSightState = loadExportedFunction(
    updatePath,
    'updateEnemyLostSightState',
  );
  const isEnemyBlindedByHiddenPlayer = loadExportedFunction(
    updatePath,
    'isEnemyBlindedByHiddenPlayer',
  );
  const advancePrincessFlightState = loadExportedFunction(
    updatePath,
    'advancePrincessFlightState',
  );

  test('tracks how long an enemy has lost sight of the player', () => {
    const enemy = {};

    expect(updateEnemyLostSightState(enemy, true, 0.1)).toBe(true);
    expect(enemy.playerLostSight).toBe(true);
    expect(enemy.playerLostSightAge).toBeCloseTo(0.1);

    updateEnemyLostSightState(enemy, true, 0.25);
    expect(enemy.playerLostSightAge).toBeCloseTo(0.35);
  });

  test('clears the indicator as soon as the player is visible', () => {
    const enemy = { playerLostSight: true, playerLostSightAge: 2 };

    expect(updateEnemyLostSightState(enemy, false, 0.1)).toBe(false);
    expect(enemy.playerLostSight).toBe(false);
    expect(enemy.playerLostSightAge).toBe(0);
  });

  test('God retains sight while the player is hidden', () => {
    expect(isEnemyBlindedByHiddenPlayer({ type: 'god' }, true)).toBe(false);
    expect(isEnemyBlindedByHiddenPlayer({ type: 'hunter' }, true)).toBe(true);
    expect(isEnemyBlindedByHiddenPlayer({ type: 'god' }, false)).toBe(false);
  });

  test('Princess Flying Untouchable expires during active play', () => {
    const player = { princessFlightTime: 5 };
    for (let tick = 0; tick < 100; tick += 1) {
      advancePrincessFlightState(player, 0.05);
    }

    expect(player.princessFlightTime).toBe(0);
    expect(advancePrincessFlightState(player, 0.05)).toBe(false);
    expect(fs.readFileSync(updatePath, 'utf8')).toContain('advancePrincessFlightState(Neo.player, dt);');
  });

  test('enemy rendering includes the lost-sight question mark', () => {
    const source = fs.readFileSync(drawPath, 'utf8');

    expect(source).toContain('function drawEnemyLostSightMark(enemy, drawY)');
    expect(source).toContain("Neo.ctx.fillText('?', 0, -1)");
    expect(source).toContain('drawEnemyLostSightMark(enemy, drawY);');
  });
});
