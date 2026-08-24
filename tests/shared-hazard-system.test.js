const {
  campaignCircleHazardHitsEntity,
  campaignRectHazardHitsEntity,
  campaignHazardHitsEntity,
  campaignLavaHitsEntity,
  advanceCampaignExplosiveTrap,
  advanceCampaignLavaContact,
} = require('../js/simulation/SharedHazardSystem');

describe('shared campaign hazard geometry', () => {
  test('uses entity radius for circular explosions and trigger zones', () => {
    const entity = { x: 110, y: 100, radius: 12 };
    expect(campaignCircleHazardHitsEntity({ x: 100, y: 100 }, entity, 0)).toBe(true);
    expect(campaignCircleHazardHitsEntity({ x: 123, y: 100 }, entity, 0)).toBe(false);
  });

  test('uses closest-point circle/rectangle intersection for persistent zones', () => {
    const hazard = { shape: 'rect', x: 100, y: 100, w: 40, h: 20 };
    expect(campaignRectHazardHitsEntity(hazard, { x: 125, y: 110, radius: 6 })).toBe(true);
    expect(campaignHazardHitsEntity(hazard, { x: 140, y: 110, radius: 6 })).toBe(false);
  });

  test('uses one deterministic arm, fuse, and explosion lifecycle for explosive traps', () => {
    const trap = { kind: 'explosive_trap' };

    expect(advanceCampaignExplosiveTrap(trap, { triggered: false })).toEqual({ armed: true });
    expect(advanceCampaignExplosiveTrap(trap, { triggered: true })).toEqual(expect.objectContaining({
      armed: true, triggered: true, justTriggered: true, fuse: 0.75,
    }));
    expect(advanceCampaignExplosiveTrap(trap, { delta: 0.5 })).toEqual(expect.objectContaining({
      triggered: true, fuse: 0.25,
    }));
    expect(advanceCampaignExplosiveTrap(trap, { delta: 0.25 })).toEqual(expect.objectContaining({
      exploded: true, justExploded: true, fuse: 0,
    }));
    expect(advanceCampaignExplosiveTrap(trap, { delta: 1 })).toEqual(expect.objectContaining({
      exploded: true, alreadyExploded: true,
    }));
  });

  test('uses continuous no-i-frame lava damage and one shared burn cadence', () => {
    const lava = { kind: 'lava', statusTick: 0, playerDamagePerSecond: 6 };

    expect(advanceCampaignLavaContact(lava, { delta: 0.05 })).toEqual(expect.objectContaining({
      applyFire: true, statusInterval: 0.45,
    }));
    expect(advanceCampaignLavaContact({ kind: 'lava', playerDamagePerSecond: 6 }, { delta: 0.05 }).damage).toBeCloseTo(0.3);
    expect(advanceCampaignLavaContact({ kind: 'lava', playerDamagePerSecond: 20 }, { delta: 0.05 }).damage).toBeCloseTo(1);
    expect(lava.statusTick).toBe(0.45);
    expect(advanceCampaignLavaContact(lava, { delta: 0.05 })).toEqual(expect.objectContaining({
      applyFire: false, statusInterval: 0.45,
    }));
  });

  test('preserves the campaign lava edge forgiveness for circular and rectangular zones', () => {
    expect(campaignLavaHitsEntity(
      { kind: 'lava', x: 0, y: 0, r: 20 },
      { x: 29, y: 0, radius: 18 },
    )).toBe(false);
    expect(campaignLavaHitsEntity(
      { kind: 'lava', shape: 'rect', left: 0, top: 0, w: 20, h: 20 },
      { x: 23, y: 10, radius: 10 },
    )).toBe(true);
    expect(campaignLavaHitsEntity(
      { kind: 'lava', x: 0, y: 0, r: 20 },
      { x: 31, y: 0, radius: 18 },
      { targetKind: 'enemy' },
    )).toBe(true);
  });
});
