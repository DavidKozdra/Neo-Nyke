const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('gameplay polish regressions', () => {
  const enemies = read('js/game/enemies.js');
  const world = read('js/game/world.js');
  const renderer3d = read('js/draw/three-renderer.js');
  const viewport = read('js/draw/viewport.js');

  test('defuse bombs avoid and bounce off solid room geometry', () => {
    expect(enemies).toMatch(/function spawnChallengeBombs[\s\S]*?!Neo\.isBlocked\(candidateX, candidateY, bombRadius\)/);
    expect(enemies).toMatch(/if \(Neo\.isBlocked\(pickup\.x, pickup\.y, 22\)\)[\s\S]*?pickup\.vx = -pickup\.vx/);
    expect(enemies).toMatch(/if \(Neo\.isBlocked\(pickup\.x, pickup\.y, 22\)\)[\s\S]*?pickup\.vy = -pickup\.vy/);
  });

  test('furniture hits use physical feedback without misleading health numbers', () => {
    const start = world.indexOf('function damageDestructible');
    const end = world.indexOf('\n  function revealSecretWall', start);
    const damageDestructible = world.slice(start, end);
    expect(damageDestructible).not.toContain('spawnDamagePopup');
    expect(damageDestructible).toContain('spawnDestructibleHitFx');
  });

  test('camera shake is coherent and does not randomise the view every frame', () => {
    expect(renderer3d).toContain('function getCameraShakeAxes(nowMs)');
    expect(renderer3d).toContain('eyeX + jx + Math.cos(fpYaw)');
    expect(renderer3d).toContain('camera.lookAt(lookX + shakeX, 12, lookZ + shakeZ)');
    expect(viewport).toContain('const _shakePhase = performance.now() * 0.018');
    expect(viewport).not.toMatch(/const s[XY] = \(Neo\.nextRandom/);
  });
});
