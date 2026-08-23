const fs = require('node:fs');
const path = require('node:path');

const {
  CAMPAIGN_ENEMY_DIFFICULTY_PRESETS,
  getCampaignEnemyLaserDamageMultiplier,
  scaleCampaignEnemyLaserDamage,
} = require('../js/simulation/SharedEnemyScalingSystem.js');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('enemy laser damage scaling', () => {
  test('reduces lasers by 40% on Easy, 35% on Medium, and 20% otherwise', () => {
    expect(getCampaignEnemyLaserDamageMultiplier('easy')).toBe(0.6);
    expect(getCampaignEnemyLaserDamageMultiplier('medium')).toBe(0.65);
    ['hard', 'impossible', 'god', 'custom'].forEach(difficulty => {
      expect(getCampaignEnemyLaserDamageMultiplier(difficulty)).toBe(0.8);
    });

    expect(scaleCampaignEnemyLaserDamage(100, CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.easy)).toBe(60);
    expect(scaleCampaignEnemyLaserDamage(100, CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.medium)).toBe(65);
    expect(scaleCampaignEnemyLaserDamage(100, CAMPAIGN_ENEMY_DIFFICULTY_PRESETS.hard)).toBe(80);
  });

  test('covers ordinary, boss, partition, and beam-struggle laser hits', () => {
    const sharedBehavior = read('js/simulation/SharedEnemyBehaviorSystem.js');
    const campaignCombat = read('js/game/combat.js');
    const campaignEnemies = read('js/game/enemies.js');
    const networkCombat = read('js/simulation/NetworkCombatSystem.js');

    expect(sharedBehavior).toContain('ctx.scaleEnemyLaserDamage?.(damage) ?? damage');
    expect(sharedBehavior).toContain('ctx.scaleEnemyLaserDamage?.(rawDamage) ?? rawDamage');
    expect(campaignCombat).toContain('Neo.damagePlayer(scaleEnemyLaserDamage(damage)');
    expect(campaignEnemies).toContain('scaleEnemyLaserDamage: damage => Neo.scaleEnemyLaserDamage(damage)');
    expect(campaignEnemies).toContain('const damage = Neo.scaleEnemyLaserDamage(rawDamage);');
    expect(networkCombat).toContain('scaleCampaignEnemyLaserDamage(damage, state.matchRules?.difficulty)');
  });
});
