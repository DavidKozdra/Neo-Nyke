const { scaleCampaignDamage } = require('../js/simulation/SharedDamageSystem');

describe('shared campaign damage operation', () => {
  test('applies campaign item, boss, bleed, defense, elite, and flat-reduction rules once', () => {
    expect(scaleCampaignDamage({
      damage: 20,
      attackPower: 2,
      attackerDamageMultiplier: 1.2,
      enemy: { elite: true, defenseMultiplier: 2, flatDamageReduction: 3 },
      itemStats: {
        levelEdgeDamageMultiplier: 1.1,
        kronosDamageMultiplier: 1.2,
        kronosBossDamageMultiplier: 1.1,
        bleedDamageMultiplier: 2,
      },
      isBoss: true,
      hasBleed: true,
      glassCannon: true,
      bountyWeaknessMultiplier: 1.35,
    })).toBe(58);
  });

  test('raw status damage still shares elite, loop, defense, and flat reduction', () => {
    expect(scaleCampaignDamage({
      damage: 100,
      enemy: { elite: true, defenseMultiplier: 2, flatDamageReduction: 5 },
      raw: true,
      loopNumber: 3,
      enemyLoopDamageReduction: 0.1,
    })).toBe(33);
  });
});
