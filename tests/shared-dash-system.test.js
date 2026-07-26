const {
  findCampaignNearestDashTarget,
  planCampaignZipLightning,
  planCampaignKnightSlashDash,
  resolveCampaignPrincessShield,
  shouldAutoCastCampaignPrincessShield,
} = require('../js/simulation/SharedDashSystem');

describe('shared campaign dash planning', () => {
  test('uses cursor-biased deterministic Zip Lightning hops and level-seven range scaling', () => {
    const enemies = [
      { id: 'near-origin', x: 140, y: 0, r: 20, hp: 100 },
      { id: 'cursor-target', x: 420, y: 0, r: 20, hp: 100 },
      { id: 'chain', x: 620, y: 0, r: 20, hp: 100 },
    ];
    expect(findCampaignNearestDashTarget(enemies, 400, 0, 60)?.id).toBe('cursor-target');
    const plan = planCampaignZipLightning({
      entities: enemies, originX: 0, originY: 0, targetX: 400, targetY: 0,
      fallbackAngle: 0, playerRadius: 18, level: 7,
      resolveLanding: point => point,
    });

    expect(plan.rangeMultiplier).toBe(1.5);
    expect(plan.hops.map(hop => hop.targetId)).toEqual(['cursor-target', 'near-origin']);
    expect(plan.hops[0].x).toBeCloseTo(374);
  });

  test('uses the same safe fallback blink when no chain target exists', () => {
    const plan = planCampaignZipLightning({
      entities: [], originX: 100, originY: 100, fallbackAngle: 0,
      playerRadius: 18, level: 1, resolveLanding: point => point,
    });
    expect(plan.hops).toEqual([]);
    expect(plan.fallback).toEqual(expect.objectContaining({ x: 290, y: 100 }));
  });

  test('plans Knight Slash Dash beyond targets and retains its longer fallback', () => {
    const target = { id: 'knight-target', x: 120, y: 0, r: 20, hp: 100 };
    const plan = planCampaignKnightSlashDash({
      entities: [target], originX: 0, originY: 0, targetX: 120, targetY: 0,
      fallbackAngle: 0, playerRadius: 18, resolveLanding: point => point,
    });
    expect(plan.hops[0]).toEqual(expect.objectContaining({ targetId: 'knight-target', x: 164, y: 0 }));

    const fallback = planCampaignKnightSlashDash({
      entities: [], originX: 100, originY: 100, fallbackAngle: 0,
      playerRadius: 18, resolveLanding: point => point,
    });
    expect(fallback.fallback).toEqual(expect.objectContaining({ x: 310, y: 100 }));
  });

  test('stacks Princess Shield and gates its campaign low-health auto-cast', () => {
    expect(resolveCampaignPrincessShield({ maxHp: 138, barrier: 17 })).toEqual({
      barrierGain: 55,
      barrier: 72,
      barrierRatio: 0.4,
    });
    expect(shouldAutoCastCampaignPrincessShield({
      characterKey: 'princess', dashMove: 'princess_shield', hp: 20, maxHp: 138,
    })).toBe(true);
    expect(shouldAutoCastCampaignPrincessShield({
      characterKey: 'princess', dashMove: 'princess_shield', hp: 20, maxHp: 138, isDashing: true,
    })).toBe(false);
    expect(shouldAutoCastCampaignPrincessShield({
      characterKey: 'princess', dashMove: 'flying_unhitable', hp: 20, maxHp: 138,
    })).toBe(false);
  });
});
