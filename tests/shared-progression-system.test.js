const {
  applyCampaignLevelUp,
  getEntityLevelKnockbackMultiplier,
  getLevelMilestone,
  getMilestoneChargeBonus,
  getLevelMoveSpeedBonus,
  resolveCampaignExperienceGain,
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

  test('adds two percent outgoing knockback for every level gained', () => {
    expect(getEntityLevelKnockbackMultiplier(1)).toBe(1);
    expect(getEntityLevelKnockbackMultiplier({ level: 2 })).toBeCloseTo(1.02);
    expect(getEntityLevelKnockbackMultiplier({ level: 11 })).toBeCloseTo(1.2);
    expect(getEntityLevelKnockbackMultiplier({ rivalData: { level: 26 } })).toBeCloseTo(1.5);
    expect(getEntityLevelKnockbackMultiplier({ level: Number.NaN })).toBe(1);
  });
  test.each([
    ['zero base amount', 0, { statMultiplier: 1 }, 0, 1, 1],
    ['below the base rounding boundary', 1.49, { statMultiplier: 1 }, 0, 1, 1],
    ['at the base rounding boundary', 1.5, { statMultiplier: 1 }, 0, 1, 2],
    ['difficulty pressure', 6, { statMultiplier: 1.5 }, 0, 1, 7],
    ['before an elapsed-time step', 10, { statMultiplier: 1 }, 299, 1, 10],
    ['at an elapsed-time step', 10, { statMultiplier: 1 }, 300, 1, 11],
    ['recipient XP penalty', 10, { statMultiplier: 1 }, 0, 0.75, 8],
    ['recipient XP bonus', 10, { statMultiplier: 1 }, 0, 1.15, 12],
    ['combined multipliers', 6, { statMultiplier: 1.5 }, 600, 1.15, 9],
  ])('resolves %s with one final rounding operation', (
    _label,
    baseAmount,
    difficulty,
    elapsedSeconds,
    xpGainMultiplier,
    expected,
  ) => {
    const roundSpy = jest.spyOn(Math, 'round');
    const amount = resolveCampaignExperienceGain(baseAmount, {
      difficulty,
      elapsedSeconds,
      xpGainMultiplier,
    });
    const roundCalls = roundSpy.mock.calls.length;
    roundSpy.mockRestore();

    expect(amount).toBe(expected);
    expect(roundCalls).toBe(1);
  });

  test('browser couch co-op resolves the item multiplier separately for each recipient', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const progressionApi = require('../js/simulation/SharedProgressionSystem');
    const { deriveCampaignItemStats } = require('../js/simulation/SharedItemEffectSystem');
    const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
    const primary = {
      level: 1, xp: 0, xpToNext: 100, hp: 100, maxHp: 100,
      attackPower: 0, attackSpeed: 1, items: { scholar_seal: 1 },
    };
    const teammate = {
      level: 1, xp: 0, xpToNext: 100, hp: 100, maxHp: 100,
      attackPower: 0, attackSpeed: 1, items: {},
    };
    const Neo = {
      player: primary,
      gameMode: 'coop',
      gameElapsedTime: 0,
      getDifficultyDef: () => ({ statMultiplier: 1 }),
      getItemStats: () => deriveCampaignItemStats(primary),
      getActivePlayerSlots: () => [
        { id: 1, color: '#fff', getEntity: () => primary },
        { id: 2, color: '#0ff', getEntity: () => teammate },
      ],
    };
    const previousNamespace = globalThis.NeoNyke;
    globalThis.NeoNyke = {
      simulation: { ...progressionApi, deriveCampaignItemStats },
    };
    try {
      new Function('Neo', 'window', combatSource)(Neo, { achievementEvents: { emit: jest.fn() } });
      Neo.grantXp(10);
    } finally {
      globalThis.NeoNyke = previousNamespace;
    }

    expect(primary.xp).toBe(12);
    expect(teammate.xp).toBe(10);
  });
});
