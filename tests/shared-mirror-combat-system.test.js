const { planCampaignMirrorTactics } = require('../js/simulation/SharedMirrorCombatSystem');

describe('shared campaign mirror tactics', () => {
  const base = {
    angle: 0, laserMove: 'blood_beam', smashMove: 'crimson_smash', dashMove: 'dash',
    weaponKey: 'thorns_bleed_blade', weaponRange: 90, targetRadius: 18, meleeRange: 72,
  };

  test('uses campaign priority: smash, laser, dash, then weapon/melee', () => {
    expect(planCampaignMirrorTactics({ ...base, distance: 120, attackCooldown: 0, smashCooldown: 0, laserCooldown: 0, dashCooldown: 0 }))
      .toEqual(expect.objectContaining({ action: 'smash', desiredRange: 118 }));
    expect(planCampaignMirrorTactics({ ...base, distance: 240, attackCooldown: 0, smashCooldown: 4, laserCooldown: 0, dashCooldown: 0 }))
      .toEqual(expect.objectContaining({ action: 'laser', desiredRange: 230 }));
    expect(planCampaignMirrorTactics({ ...base, distance: 180, attackCooldown: 0, smashCooldown: 4, laserCooldown: 4, dashCooldown: 0 }))
      .toEqual(expect.objectContaining({ action: 'dash' }));
    expect(planCampaignMirrorTactics({ ...base, distance: 90, attackCooldown: 0, smashCooldown: 4, laserCooldown: 4, dashCooldown: 4 }))
      .toEqual(expect.objectContaining({ action: 'weapon' }));
  });

  test('uses campaign strafe posture and waits while the basic cadence is cooling down', () => {
    const plan = planCampaignMirrorTactics({ ...base, distance: 200, attackCooldown: 0.2, smashCooldown: 4, laserCooldown: 4, dashCooldown: 4 });
    expect(plan).toEqual(expect.objectContaining({ action: 'wait', strafe: 0.34, preferred: 1 }));
    expect(plan.moveX).toBeCloseTo(1);
    expect(plan.moveY).toBeCloseTo(0.34);
  });
});
