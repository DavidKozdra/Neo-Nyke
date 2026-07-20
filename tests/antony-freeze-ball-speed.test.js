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

describe("Antony's freeze ball speed", () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');

  test('adds freeze projectiles at Antony level milestones', () => {
    const spawned = [];
    const Neo = {
      player: { x: 100, y: 0 },
      spawnProjectile: projectile => spawned.push(projectile),
      spawnParticle: jest.fn(),
      ringBurst: jest.fn(),
      shake: 0,
      shakeT: 0,
    };
    const spawnAntonyDeathBall = new Function(
      'Neo',
      'getBossStatusStacks',
      `${extractFunction(source, 'spawnAntonyDeathBall')}; return spawnAntonyDeathBall;`,
    )(Neo, () => 1);

    spawnAntonyDeathBall({
      x: 0,
      y: 0,
      r: 20,
      dmg: 30,
      level: 10,
      antonyDeathBallAngle: 0,
    });

    expect(spawned).toHaveLength(2);
    expect(Math.hypot(spawned[0].vx, spawned[0].vy)).toBeCloseTo(525);
    expect(spawned[0].homingSpeed).toBe(570);
  });
});
