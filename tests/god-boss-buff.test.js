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

describe('God boss buffs', () => {
  const root = path.resolve(__dirname, '..');
  const enemySource = fs.readFileSync(path.join(root, 'js/game/enemies.js'), 'utf8');
  const statusSource = fs.readFileSync(path.join(root, 'js/core/status.js'), 'utf8');

  test('adds damage, cadence, and a fifth partition laser as run time grows', () => {
    const declaration = extractFunction(enemySource, 'getGodRunPressure');
    const getGodRunPressure = new Function(
      'Neo',
      `${declaration}; return getGodRunPressure;`,
    )({ gameElapsedTime: 0 });

    const opening = getGodRunPressure(0);
    const late = getGodRunPressure(600);

    expect(late.damageMultiplier).toBeGreaterThan(opening.damageMultiplier);
    expect(late.cadenceMultiplier).toBeLessThan(opening.cadenceMultiplier);
    expect(opening.partitionLaserCount).toBe(4);
    expect(late.partitionLaserCount).toBe(5);
    expect(late.partitionRotationSpeed).toBeGreaterThan(opening.partitionRotationSpeed);
  });

  test('gives God broad status resistance and strong stun resistance', () => {
    const godBlock = enemySource.slice(
      enemySource.indexOf("} else if (type === 'god') {"),
      enemySource.indexOf("} else if (type === 'cult_mage') {"),
    );

    expect(godBlock).toContain('base.stunResistance = 5');
    expect(godBlock).toContain('base.statusResistance = 0.45');
    expect(godBlock).toContain('dark_drain: 0.75');
    expect(godBlock).toContain('slow: 0.7');
    expect(godBlock).toContain('static: 0.6');
  });

  test('status resistance reduces both incoming stacks and duration', () => {
    const declaration = extractFunction(statusSource, 'getStatusResistance');
    const getStatusResistance = new Function(
      `${declaration}; return getStatusResistance;`,
    )();

    expect(getStatusResistance({ statusResistance: 0.45, statusResistances: { slow: 0.7 } }, 'slow')).toBe(0.7);
    expect(getStatusResistance({ statusResistance: 0.45, statusResistances: { fire: 0.2 } }, 'fire')).toBe(0.45);
    expect(statusSource).toContain('const resistanceMultiplier = 1 - getStatusResistance(entity, key)');
    expect(statusSource).toContain('Number(stacks || 0)) * resistanceMultiplier');
    expect(statusSource).toContain('durationSeverity * resistanceMultiplier');
  });

  test('partition attack uses four or five rotating beams with a windup preview', () => {
    expect(enemySource).toContain("enemy.state = 'godPartition'");
    expect(enemySource).toContain('setGodPartitionAngles(enemy, laserCount)');
    expect(enemySource).toContain('tickGodPartitionLasers(enemy, dt, runPressure');
    expect(enemySource).toContain('Math.max(4, Math.min(5');
  });
});
