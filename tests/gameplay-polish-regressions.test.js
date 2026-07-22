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

  test('non-God bosses gain level-driven attack milestones', () => {
    expect(enemies).toContain('function rollEnemyEncounterLevel(baseLevel)');
    expect(enemies).toContain('function getBossStatusStacks(enemy, baseStacks = 1)');
    expect(enemies).toContain("specialType = 'boss_spawner'");
    expect(enemies).toContain("specialType = 'summoner'");
    expect(enemies).toContain("enemy.state = 'antonyMouthBeam'");
    expect(enemies).toContain('const count = enemy.level >= 25 ? 3 : enemy.level >= 10 ? 2 : 1');
    expect(enemies).toContain('const swordCount = Math.min(16, 8 + tier * 2)');
    expect(enemies).toContain('const boltCount = Math.min(9, 5 + getBossTier(enemy))');
  });

  test('3D potions reuse their authored 2D art and loose loot floats above the floor', () => {
    expect(renderer3d).toContain("const FLOATING_BAKED_PICKUP_TYPES = new Set(['coin', 'item', 'potion'])");
    expect(renderer3d).not.toContain("bottle.name = 'potion3d'");
    expect(renderer3d).toContain('floating ? worldSize * 0.5 + bob : floorLift');
  });

  test('3D rune and bomb trial targets are lifted above the floor', () => {
    expect(renderer3d).toMatch(/BAKED_PICKUP_FLOOR_LIFT = \{\s*challengeRune: 16,\s*challengeBomb: 24,/);
    expect(renderer3d).toContain(': BAKED_PICKUP_FLOOR_LIFT[pickup.type] || 1;');
  });

  test('3D post-boss reward choices are raised above the arena floor', () => {
    expect(renderer3d).toContain('const BOSS_REWARD_CHOICE_FLOOR_LIFT = 24;');
    expect(renderer3d).toContain("String(pickup.groupId || '').startsWith('boss:')");
    expect(renderer3d).toContain('? BOSS_REWARD_CHOICE_FLOOR_LIFT');
  });

  test('3D chests contain only the authored chest sprite', () => {
    const start = renderer3d.indexOf('function syncChests()');
    const end = renderer3d.indexOf('\nfunction syncDestructibles()', start);
    const syncChests = renderer3d.slice(start, end);
    expect(syncChests).toContain("sprite.name = 'body'");
    expect(syncChests).not.toContain('makeGroundedBillboard');
  });
});
