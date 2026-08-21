const {
  hazardHasPhysics,
  advanceCampaignHazardPhysics,
  applyCampaignHazardBeamPush,
} = require('../js/simulation/SharedHazardSystem.js');
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const spike = (overrides = {}) => ({ kind: 'red_spikes', x: 400, y: 300, r: 34, armTime: 0, ...overrides });
const ROOM = { width: 1200, height: 800 };

describe('blood spike physics', () => {
  test('only blood spikes are physical objects', () => {
    expect(hazardHasPhysics(spike())).toBe(true);
    expect(hazardHasPhysics({ kind: 'lava' })).toBe(false);
    expect(hazardHasPhysics({ kind: 'thorn_mine' })).toBe(false);
    expect(hazardHasPhysics(null)).toBe(false);
  });

  test('leaves non-physical hazards untouched', () => {
    const lava = { kind: 'lava', x: 10, y: 10 };
    expect(advanceCampaignHazardPhysics(lava, { delta: 0.05 }).ignored).toBe(true);
    expect(applyCampaignHazardBeamPush(lava, 0, 900, { delta: 0.05 }).ignored).toBe(true);
    expect(lava.x).toBe(10);
  });

  test('a beam shoves a spike along the beam direction', () => {
    const hazard = spike();
    applyCampaignHazardBeamPush(hazard, 0, 935, { delta: 0.05 });
    expect(hazard.vx).toBeGreaterThan(0);
    expect(hazard.vy).toBeCloseTo(0);
    advanceCampaignHazardPhysics(hazard, { delta: 0.05, ...ROOM });
    expect(hazard.x).toBeGreaterThan(400);
  });

  test('a sustained beam slides a spike well past its own radius', () => {
    const hazard = spike();
    for (let t = 0; t < 0.56; t += 0.05) {
      applyCampaignHazardBeamPush(hazard, 0, 170 * 5.5, { delta: 0.05 });
      advanceCampaignHazardPhysics(hazard, { delta: 0.05, ...ROOM });
    }
    expect(hazard.x - 400).toBeGreaterThan(hazard.r);
  });

  test('drag brings a shoved spike to a full stop', () => {
    const hazard = spike({ vx: 400, vy: 0 });
    for (let tick = 0; tick < 200 && hazard.vx !== 0; tick += 1) {
      advanceCampaignHazardPhysics(hazard, { delta: 0.05, ...ROOM });
    }
    expect(hazard.vx).toBe(0);
    expect(hazard.vy).toBe(0);
  });

  test('bounces off the room edge instead of burying itself in a wall', () => {
    const hazard = spike({ x: 1150, vx: 900 });
    advanceCampaignHazardPhysics(hazard, { delta: 0.05, ...ROOM });
    expect(hazard.x).toBeLessThanOrEqual(ROOM.width - hazard.r);
    expect(hazard.vx).toBeLessThan(0);
  });

  test('reports movement so callers can invalidate beam geometry', () => {
    expect(advanceCampaignHazardPhysics(spike({ vx: 200 }), { delta: 0.05, ...ROOM }).moved).toBe(true);
    expect(advanceCampaignHazardPhysics(spike(), { delta: 0.05, ...ROOM }).moved).toBe(false);
  });
});

describe('blood spikes as a beam reflection surface', () => {
  const mathUtils = read('js/core/math-utils.js');

  test('armed spikes join the beam reflect rects', () => {
    expect(mathUtils).toContain('function hazardReflectsBeams');
    expect(mathUtils).toContain('if (!hazardReflectsBeams(hazard)) return;');
  });

  test('unarmed telegraph spikes do not reflect', () => {
    expect(mathUtils).toContain("&& Number(hazard.armTime || 0) <= 0");
  });

  test('a moving spike is part of the geometry cache key', () => {
    expect(mathUtils).toContain('getBeamReflectHazardSignature');
    expect(mathUtils).toContain('beamReflectHazardSignature === hazardSignature');
  });

  test('an absent hazard list keeps a stable identity so the cache still holds', () => {
    expect(mathUtils).toContain('BEAM_REFLECT_NO_HAZARDS');
    expect(mathUtils).not.toContain('Array.isArray(Neo.hazards) ? Neo.hazards : []');
  });
});

describe('runtime wiring', () => {
  test('campaign integrates spike physics and invalidates beam paths on movement', () => {
    const world = read('js/game/world.js');
    expect(world).toContain('advanceCampaignHazardPhysics?.(hazard, {');
    expect(world).toContain('if (physics?.moved) Neo.invalidateBeamReflectGeometry?.();');
  });

  test('campaign beams push spikes down the segment that hit them', () => {
    const combat = read('js/game/combat.js');
    expect(combat).toContain('pushHazardsWithBeamPath(path, beamKnockback, beamTickInterval)');
    expect(combat).toContain('applyCampaignHazardBeamPush(hazard, segment.angle, force');
  });

  test('the authority runs the same integrator so clients agree on spike position', () => {
    const authority = read('js/simulation/NetworkCombatSystem.js');
    expect(authority).toContain('advanceCampaignHazardPhysics = () => ({ ignored: true, moved: false })');
    expect(authority).toContain('advanceCampaignHazardPhysics(hazard, {');
  });

  test('spikes keep their authored contact knockback', () => {
    expect(read('js/game/world.js')).toContain("Number(hazard.knockback || 170), hazard.source || 'red_spikes'");
    expect(read('js/simulation/NetworkCombatSystem.js')).toContain('knockback: Number(hazard.knockback || 170)');
  });
});
