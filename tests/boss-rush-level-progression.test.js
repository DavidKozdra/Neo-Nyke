const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('Boss Rush level progression', () => {
  test('solo bosses use the shared stage level when they spawn', () => {
    const gameState = read('js/core/game-state.js');
    const enemies = read('js/game/enemies.js');

    expect(gameState).toContain('getBossRushBossLevel(Neo.bossRushStage)');
    expect(gameState).toContain("Neo.spawnEnemy('knave', safeSpawn.x, safeSpawn.y, false, { level: bossLevel })");
    expect(gameState).toContain('Neo.spawnEnemy(bossType, safeSpawn.x, safeSpawn.y, false, { level: bossLevel })');
    expect(enemies).toContain('options.level !== undefined && Number.isFinite(requestedLevel)');
    expect(enemies).toContain('if (enemy?.bossRushBoss)');
  });

  test('Boss Rush nameplates display the authored boss level', () => {
    const entities = read('js/draw/entities.js');

    expect(entities).toContain('const displayedLevel = enemy.bossRushBoss');
    expect(entities).toContain('Math.max(1, Math.floor(Number(enemy.level) || 1))');
  });
});
