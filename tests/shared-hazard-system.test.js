const {
  campaignCircleHazardHitsEntity,
  campaignRectHazardHitsEntity,
  campaignHazardHitsEntity,
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
});
