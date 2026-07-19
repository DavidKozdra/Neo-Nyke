const {
  applyProcRollback,
  resolveCampaignCrit,
  resolveCampaignProc,
} = require('../js/simulation/SharedHitResolutionSystem');

describe('shared campaign hit resolution', () => {
  test('resolves ordinary and forced crits from the same campaign stats', () => {
    expect(resolveCampaignCrit({
      itemStats: { critChance: 0.25, critMultiplier: 1.8 },
      random: () => 0.2,
    })).toEqual({
      isCrit: true,
      forced: false,
      critChance: 0.25,
      critMultiplier: 1.8,
    });
    expect(resolveCampaignCrit({
      itemStats: { critChance: 0, critMultiplier: 1.8 },
      forced: true,
      random: () => 1,
    })).toEqual(expect.objectContaining({ isCrit: true, forced: true, critMultiplier: 1.8 }));
  });

  test('uses campaign crit rollback when hit-time bonuses exceed 100 percent', () => {
    const result = resolveCampaignCrit({
      itemStats: { critChance: 0.9, critMultiplier: 2 },
      critBonus: 0.4,
      random: () => 0.79,
    });
    expect(result.critChance).toBeCloseTo(0.8);
    expect(result.critMultiplier).toBeCloseTo(4.5);
    expect(result.isCrit).toBe(true);
  });

  test('returns the same proc rollback multiplier for status strength and duration', () => {
    expect(applyProcRollback(1.2, 1)).toEqual({ procChance: 0.8, effectMultiplier: 2.25 });
    expect(resolveCampaignProc(1.2, { random: () => 0.7 })).toEqual({
      triggered: true,
      procChance: 0.8,
      effectMultiplier: 2.25,
      durationMultiplier: 2.25,
    });
    expect(resolveCampaignProc(1.2, { random: () => 0.7, durationScales: false }).durationMultiplier).toBe(1);
  });

  test('both local campaign and authority call the shared crit operation', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const local = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
    const authority = fs.readFileSync(path.join(__dirname, '../js/simulation/NetworkCombatSystem.js'), 'utf8');
    expect(local).toContain('simulation.resolveCampaignCrit({');
    expect(authority).toContain('const crit = resolveCampaignCrit({');
  });
});
