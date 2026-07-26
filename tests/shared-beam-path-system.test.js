const {
  buildCampaignRicochetBeamPath,
  campaignBeamPathHitsCircle,
  campaignBeamPathHitsRect,
  getCampaignPlayerBeamBounceCount,
} = require('../js/simulation/SharedBeamPathSystem');

describe('shared campaign beam path', () => {
  test('reflects from the nearest finite rectangle and preserves remaining range', () => {
    const path = buildCampaignRicochetBeamPath({
      originX: 10, originY: 50, angle: 0, range: 100, maxBounces: 1,
      rects: [{ x: 50, y: 0, w: 10, h: 100 }],
    });
    expect(path).toHaveLength(2);
    expect(path[0]).toEqual(expect.objectContaining({ x1: 10, y1: 50, x2: 50, y2: 50, angle: 0, hitWall: true }));
    expect(path[1]).toEqual(expect.objectContaining({ x1: 49.35, x2: -10, angle: Math.PI, hitWall: false }));
    expect(path[1].y1).toBeCloseTo(50);
    expect(path[1].y2).toBeCloseTo(50);
    expect(path.totalLength).toBeCloseTo(99.35);
  });

  test('uses the same finite path for enemy circles and padded props', () => {
    const path = buildCampaignRicochetBeamPath({ originX: 0, originY: 0, angle: 0, range: 100, rects: [] });
    expect(campaignBeamPathHitsCircle(path, 60, 5, 5)).toEqual(path[0]);
    expect(campaignBeamPathHitsCircle(path, 60, 5.1, 5)).toBeNull();
    expect(campaignBeamPathHitsRect(path, { x: 70, y: 1, w: 8, h: 8 }, 2)).toEqual(path[0]);
    expect(campaignBeamPathHitsRect(path, { x: 70, y: 10, w: 8, h: 8 }, 1)).toBeNull();
  });

  test('uses campaign bounce tiers for ordinary and heavy player beams', () => {
    expect(getCampaignPlayerBeamBounceCount('beam')).toBe(2);
    expect(getCampaignPlayerBeamBounceCount('thorn_blood_beams')).toBe(2);
    expect(getCampaignPlayerBeamBounceCount('blood_beam')).toBe(2);
    expect(getCampaignPlayerBeamBounceCount('wizard_lazer')).toBe(1);
  });
});
