const M = require('../js/simulation/SharedProgressionSystem');

describe('level milestone registry', () => {
  test('milestones land on the every-7 cadence', () => {
    expect(M.LEVEL_MILESTONE_LEVELS).toEqual([7, 14, 21, 28]);
  });

  test('not every milestone grants a charge — 7 and 21 do, 14 and 28 are stat/speed spikes', () => {
    expect(M.getLevelMilestone(7, 'thorn_knight').moveCharge).toBeTruthy();
    expect(M.getLevelMilestone(21, 'thorn_knight').moveCharge).toBeTruthy();
    expect(M.getLevelMilestone(14, 'thorn_knight').moveCharge).toBeFalsy();
    expect(M.getLevelMilestone(28, 'thorn_knight').moveCharge).toBeFalsy();
    // Stat/speed spikes carry move speed; charge milestones do not.
    expect(M.getLevelMilestone(14, 'thorn_knight').moveSpeed).toBeGreaterThan(0);
    expect(M.getLevelMilestone(28, 'thorn_knight').moveSpeed).toBeGreaterThan(0);
  });

  test('default mobility charge applies to the equipped dash move and is cumulative', () => {
    // Below the first charge milestone: no bonus.
    expect(M.getMilestoneChargeBonus('dash', 'dash', 'thorn_knight', 6)).toBe(0);
    // At 7: +1 to whatever dash move is equipped.
    expect(M.getMilestoneChargeBonus('dash', 'dash', 'thorn_knight', 7)).toBe(1);
    // Laser charge lands at 21, not before.
    expect(M.getMilestoneChargeBonus('laser', 'blood_beam', 'thorn_knight', 20)).toBe(0);
    expect(M.getMilestoneChargeBonus('laser', 'blood_beam', 'thorn_knight', 21)).toBe(1);
  });

  test('Gelleh override pins the dash charge to Zip Lightning specifically', () => {
    // Equipped Zip Lightning gets the level-7 charge.
    expect(M.getMilestoneChargeBonus('dash', 'zip_lightning', 'gelleh', 7)).toBe(1);
    // A different dash move does not (override requires the specific moveKey).
    expect(M.getMilestoneChargeBonus('dash', 'warp', 'gelleh', 7)).toBe(0);
  });

  test('each character pins its level-7 charge to its signature mobility move', () => {
    const sigDash = {
      princess: 'flying_unhitable',
      metao: 'warp',
      gelleh: 'zip_lightning',
      mooggy: 'mooggy_zoomies',
      thorn_knight: 'dash',
    };
    for (const [character, moveKey] of Object.entries(sigDash)) {
      expect(M.getMilestoneChargeBonus('dash', moveKey, character, 7)).toBe(1);
      // A non-signature dash move earns nothing from the override (thorn's bare
      // 'dash' slot charge applies to whatever dash it has, so skip that case).
      if (character !== 'thorn_knight') {
        expect(M.getMilestoneChargeBonus('dash', 'some_other_dash', character, 7)).toBe(0);
      }
    }
  });

  test('each character pins its level-21 charge to its signature laser', () => {
    const sigLaser = {
      princess: 'love_beam',
      thorn_knight: 'blood_beam',
      metao: 'power_disks',
      gelleh: 'blade_justice',
      mooggy: 'nail_shot',
    };
    for (const [character, moveKey] of Object.entries(sigLaser)) {
      expect(M.getMilestoneChargeBonus('laser', moveKey, character, 20)).toBe(0);
      expect(M.getMilestoneChargeBonus('laser', moveKey, character, 21)).toBe(1);
      // An alt-kit laser does not inherit the signature charge.
      expect(M.getMilestoneChargeBonus('laser', 'some_alt_laser', character, 21)).toBe(0);
    }
  });

  test('move-speed bonus accumulates across the stat-spike milestones', () => {
    expect(M.getLevelMoveSpeedBonus('thorn_knight', 13)).toBe(0);
    expect(M.getLevelMoveSpeedBonus('thorn_knight', 14)).toBeCloseTo(0.03);
    expect(M.getLevelMoveSpeedBonus('thorn_knight', 28)).toBeCloseTo(0.07);
  });

  test('non-milestone levels resolve to no milestone', () => {
    expect(M.getLevelMilestone(8, 'thorn_knight')).toBeNull();
    expect(M.getLevelMilestone(1, 'gelleh')).toBeNull();
  });
});
