const {
  getCampaignItemDropChance,
  getCampaignEnemyCoinReward,
  getCampaignEnemyExperienceReward,
  createCampaignCoinDropPlan,
  resolveCampaignEnemyDrop,
  resolveCampaignBossBonusDrops,
  rollCampaignGodItem,
  resolveCampaignRivalKillReward,
  rollCampaignFinalRivalRelic,
} = require('../js/simulation/SharedEnemyDropSystem');

describe('SharedEnemyDropSystem', () => {
  test('uses the campaign item-chance curve with difficulty and Rich Man\'s Luck bonus', () => {
    expect(getCampaignItemDropChance(0.18, 0.65, { difficultyMultiplier: 0.5, itemDropChanceBonus: 0.1 })).toBeCloseTo(0.14);
    expect(getCampaignItemDropChance(0.9, 0.98, { difficultyMultiplier: 2 })).toBe(0.98);
  });

  test('builds the campaign coin-value plan for normal, elite, boss and treasure rewards', () => {
    expect(getCampaignEnemyCoinReward({ type: 'hunter' })).toBe(5);
    expect(getCampaignEnemyCoinReward({ type: 'hunter', elite: true })).toBe(10);
    expect(getCampaignEnemyCoinReward({ type: 'queen', boss: true })).toBe(40);
    expect(getCampaignEnemyCoinReward({ type: 'dummy', tutorialDummy: true })).toBe(0);
    expect(getCampaignEnemyExperienceReward({ type: 'hunter' })).toBe(6);
    expect(getCampaignEnemyExperienceReward({ type: 'hunter', elite: true })).toBe(12);
    expect(getCampaignEnemyExperienceReward({ type: 'queen', boss: true })).toBe(40);
    expect(getCampaignEnemyExperienceReward({ type: 'dummy', tutorialDummy: true })).toBe(0);
    const plan = createCampaignCoinDropPlan(100, 200, 5, { random: () => 0 });
    expect(plan).toEqual([{ type: 'coin', value: 5, x: 82, y: 182 }]);
    expect(createCampaignCoinDropPlan(0, 0, 5, { gameMode: 'treasure_hunt', random: () => 0 })
      .reduce((total, pickup) => total + pickup.value, 0)).toBe(15);
  });

  test('preserves tutorial, turret, elite-item, normal-item and potion branch priority', () => {
    const rolls = values => () => values.shift();
    expect(resolveCampaignEnemyDrop({ type: 'hunter' }, { tutorialDummy: true })).toEqual({ type: 'item', elite: false, tutorial: true });
    expect(resolveCampaignEnemyDrop({ type: 'turret', rivalTurret: true }, { random: () => 0.49 })).toEqual({ type: 'potion', source: 'rival_turret' });
    expect(resolveCampaignEnemyDrop({ type: 'hunter', elite: true }, { random: () => 0, itemDropChanceBonus: 0 })).toEqual({ type: 'item', elite: true });
    expect(resolveCampaignEnemyDrop({ type: 'hunter', elite: false }, { random: () => 0, itemDropChanceBonus: 0.1 })).toEqual({ type: 'item', elite: false });
    expect(resolveCampaignEnemyDrop({ type: 'hunter', elite: false }, { random: rolls([0.5, 0.05]), potionDropMultiplier: 1 })).toEqual({ type: 'potion', source: 'enemy' });
    expect(resolveCampaignEnemyDrop({ type: 'hunter', elite: false }, { random: rolls([0.5, 0.05]), potionDropMultiplier: 0.4 })).toBeNull();
  });

  test('uses the campaign boss voucher gate before its optional god-relic roll', () => {
    const rolls = values => () => values.shift();
    const boss = { type: 'queen_cult', boss: true };
    expect(resolveCampaignBossBonusDrops(boss, { isBoss: true, random: rolls([0, 0]) })).toEqual([
      { type: 'item', key: 'forge_voucher', source: 'boss_voucher' },
      { type: 'god_item', source: 'boss_voucher' },
    ]);
    expect(resolveCampaignBossBonusDrops(boss, { isBoss: true, random: () => 0.65 })).toEqual([]);
    ['tutorialDummy', 'forceDeath', 'practice', 'noItems'].forEach(blocker => {
      expect(resolveCampaignBossBonusDrops(boss, { isBoss: true, [blocker]: true, random: () => 0 })).toEqual([]);
    });
    expect(rollCampaignGodItem({ first: { rarity: 'god' }, voucher: { rarity: 'god', voucher: true }, normal: { rarity: 'rare' } }, () => 0)).toBe('first');
  });

  test('keeps campaign rival bonus rewards and final-blue selection deterministic', () => {
    expect(resolveCampaignRivalKillReward({ floorNumber: 2, finalDeath: false })).toEqual({ coins: 26, experience: 26, finalRelic: false });
    expect(resolveCampaignRivalKillReward({ floorNumber: 2, finalDeath: true, stolenLootCount: 2, rivalBounty: true }))
      .toEqual({ coins: 63, experience: 26, finalRelic: true });
    expect(rollCampaignFinalRivalRelic({ first: { rarity: 'blue' }, other: { rarity: 'god' } }, () => 0)).toBe('first');
  });
});
