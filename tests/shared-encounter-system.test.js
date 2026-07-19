const encounter = require('../js/simulation/SharedEncounterSystem.js');
const { RandomStream } = require('../js/simulation/RandomService.js');

describe('SharedEncounterSystem campaign construction', () => {
  test('builds identical seeded plans for browser and authority callers', () => {
    const first = encounter.getCampaignEncounterPlan({ type: 'combat' }, {
      floorNumber: 7,
      random: new RandomStream(1234),
      difficulty: { waveBonus: 1, roomWeightBonus: 0.05 },
      roomWeightBonus: 0.05,
    });
    const second = encounter.getCampaignEncounterPlan({ type: 'combat' }, {
      floorNumber: 7,
      random: new RandomStream(1234),
      difficulty: { waveBonus: 1, roomWeightBonus: 0.05 },
      roomWeightBonus: 0.05,
    });
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(11);
  });

  test('preserves the authored ladder post-processing order', () => {
    const plan = encounter.buildCampaignWavePlan(7, { floorNumber: 5, roomType: 'ladder', random: new RandomStream(99) });
    expect(plan).toEqual(['hunter', 'hunter', 'charger', 'knave', 'summoner', 'healer', 'hunter']);
  });

  test('uses the exact floor-six boss branch', () => {
    expect(encounter.getCampaignFloorBossType(6, () => 0.2)).toBe('handsome_devil');
    const rolls = [0.9, 0.1];
    expect(encounter.getCampaignFloorBossType(6, () => rolls.shift())).toBe('queen_cult');
  });
});
