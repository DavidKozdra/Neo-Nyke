const { applyCampaignKillCharge, chargeRequirement } = require('../js/simulation/SharedEventItemSystem.js');

describe('SharedEventItemSystem kill transactions', () => {
  test('advances every campaign charge item from one kill event', () => {
    const player = {
      hp: 50, maxHp: 100,
      items: { insurance: 1, keen_eye: 1, chrono_spring: 1, charged_adapter: 1, robot_arm: 1, hemes_scarf: 1 },
      insuranceChargeKills: 7,
      keenEyeChargeKills: 8,
      chronoSpringChargeKills: 5,
      escapeChargeKills: 18,
      robotArmChargeKills: 6,
      scarfChargeKills: 8,
    };
    const result = applyCampaignKillCharge(player, {
      itemStats: { overclockedWatchChance: 1, chargeSynergyReduction: 0 },
      random: () => 0,
    });
    expect(result.steps).toBe(2);
    expect(result.intents.filter(intent => intent.kind === 'ready').map(intent => intent.itemKey)).toEqual(
      ['insurance', 'keen_eye', 'chrono_spring', 'charged_adapter', 'robot_arm', 'hemes_scarf'],
    );
  });

  test('applies kill healing and difficulty-scaled crit surge canonically', () => {
    const player = { hp: 40, maxHp: 100, items: { generic_health_item: 2, crit_charm: 1 }, critCharmChargeKills: 2 };
    const result = applyCampaignKillCharge(player, {
      itemStats: { genericHealthItemHealRatio: 0.1, healingMultiplier: 1.5 },
      difficulty: 'easy', currentTick: 20, tickRate: 20, random: () => 1,
    });
    expect(player.hp).toBe(46);
    expect(player.critCharmBuffTime).toBe(4);
    expect(player.critCharmBuffUntilTick).toBe(100);
    expect(result.intents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'heal', amount: 6 }),
      expect.objectContaining({ kind: 'surge', itemKey: 'crit_charm' }),
    ]));
  });

  test('charge requirement shares adapter and tag synergy reductions', () => {
    expect(chargeRequirement({ items: { charged_adapter: 2 } }, 10, { chargeSynergyReduction: 2 })).toBe(6);
  });
});
