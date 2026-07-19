const {
  applyCampaignLevelUp,
  getLevelMilestone,
  getMilestoneChargeBonus,
  getLevelMoveSpeedBonus,
} = require('../js/simulation/SharedProgressionSystem');

describe('shared campaign progression', () => {
  test('applies the campaign per-level gains without replacing character damage', () => {
    const player = {
      character: 'princess', level: 1, xpToNext: 20,
      hp: 100, maxHp: 138, attackPower: 0, attackSpeed: 1,
      damageMultiplier: 1.2, items: {},
    };
    applyCampaignLevelUp(player);
    expect(player).toEqual(expect.objectContaining({
      level: 2, xpToNext: 24, hp: 115, maxHp: 153,
      attackPower: 3, attackSpeed: 1.01, damageMultiplier: 1.2,
    }));
  });

  test('applies Artificer gains and authored character milestones once', () => {
    const player = {
      characterKey: 'gelleh', level: 6, xpToNext: 60,
      hp: 100, maxHp: 120, attackPower: 0, attackSpeed: 1,
      items: { artificer_charger: 1 },
    };
    const result = applyCampaignLevelUp(player);
    expect(result.milestone.label).toBe('ZIP LIGHTNING +1 CHARGE');
    expect(player).toEqual(expect.objectContaining({
      level: 7, xpToNext: 73, hp: 126, maxHp: 146,
      attackPower: 6, attackSpeed: 1.02,
    }));
    expect(getMilestoneChargeBonus('dash', 'zip_lightning', 'gelleh', 7)).toBe(1);
  });

  test('uses the shared stat-surge and move-speed milestone registry', () => {
    expect(getLevelMilestone(14, 'princess')).toEqual(expect.objectContaining({ label: 'STAT SURGE' }));
    expect(getLevelMoveSpeedBonus('princess', 28)).toBeCloseTo(0.07);
  });

  test('both browser campaign and authority invoke the same level operation', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const local = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
    const authority = fs.readFileSync(path.join(__dirname, '../js/simulation/NetworkCombatSystem.js'), 'utf8');
    expect(local).toContain('applyCampaignLevelUp?.(Neo.player)');
    expect(authority).toContain('applyCampaignLevelUp(player);');
    expect(authority).not.toContain('player.damageMultiplier = 1 + (player.level - 1) * 0.08');
  });
});
