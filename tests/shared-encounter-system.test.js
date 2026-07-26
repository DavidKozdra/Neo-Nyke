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

  test('shares Endless wave growth and every-tenth-wave boss composition', () => {
    expect([1, 2, 3, 4, 10].map(encounter.getCampaignEndlessWaveSize)).toEqual([5, 5, 6, 8, 16]);
    const bossWave = encounter.createCampaignEndlessWavePlan(10, { floorNumber: 1, random: () => 0 });
    expect(bossWave).toHaveLength(4);
    expect(bossWave[0]).toBe('queen_cult');
  });

  test('persists campaign boss reward choices, group identity and pick count', () => {
    const room = { type: 'boss', gx: 3, gy: 7 };
    const plan = encounter.createCampaignBossRewardPlan(room, {
      floorNumber: 5, difficultyKey: 'hard', centerX: 450, centerY: 418,
      createChoices: () => ['a', 'b', 'c', 'd', 'e'],
    });
    expect(plan).toEqual(expect.objectContaining({ ok: true, groupId: 'boss:3:7:5', picksRemaining: 3 }));
    expect(plan.pickups).toEqual(expect.arrayContaining([
      expect.objectContaining({ x: 306, y: 418, key: 'a', label: '3/5' }),
      expect.objectContaining({ x: 594, y: 418, key: 'e', label: '3/5' }),
    ]));
    expect(room).toEqual(expect.objectContaining({ bossRewardSpawned: true, bossRewardChoices: ['a', 'b', 'c', 'd', 'e'] }));
    expect(encounter.createCampaignBossRewardPlan(room)).toEqual(expect.objectContaining({ ok: false }));
  });
});
