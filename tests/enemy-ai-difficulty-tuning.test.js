const fs = require('node:fs');
const path = require('node:path');

const {
  CAMPAIGN_ENEMY_DIFFICULTY_PRESETS,
  resolveCampaignEnemyDifficulty,
} = require('../js/simulation/SharedEnemyScalingSystem.js');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Easy and Medium enemy AI tuning', () => {
  test.each(['easy', 'medium'])('%s has 20% lower reaction and 20% longer attack cadence', difficultyKey => {
    const preset = CAMPAIGN_ENEMY_DIFFICULTY_PRESETS[difficultyKey];
    expect(preset.enemyReactionMultiplier).toBe(0.8);
    expect(preset.rangedCadenceMultiplier).toBe(1.2);
    expect(resolveCampaignEnemyDifficulty({ key: difficultyKey })).toEqual(expect.objectContaining({
      enemyReactionMultiplier: 0.8,
      rangedCadenceMultiplier: 1.2,
    }));
  });

  test('browser and network AI both consume the shared reaction and cadence values', () => {
    const gameState = read('js/core/game-state.js');
    const network = read('js/simulation/NetworkCombatSystem.js');
    const behavior = read('js/simulation/SharedEnemyBehaviorSystem.js');

    expect(gameState).toContain('reaction: difficulty.enemyReactionMultiplier || 1');
    expect(gameState).toContain('rangedCadence: difficulty.rangedCadenceMultiplier || 1');
    expect(network).toContain('reaction: Number(difficulty.enemyReactionMultiplier || 1)');
    expect(network).toContain('rangedCadence: Number(difficulty.rangedCadenceMultiplier || 1)');
    expect(behavior).toContain('enemy.windup = 0.6 / tuning.reaction;');
    expect(behavior).toContain('enemy.attackCd = 2.2 * tuning.rangedCadence;');
    expect(behavior).toContain('aimEnemyBeam(enemy, dt, 3.2 * tuning.reaction);');
  });
});
