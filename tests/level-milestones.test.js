const fs = require('node:fs');
const path = require('node:path');

// The level-milestone registry and its helpers live as a self-contained block
// in player.js (the const tables plus the pure getter functions). Evaluate that
// block in isolation so we can exercise the cadence without booting the game.
function loadMilestoneHelpers() {
  const source = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');
  const start = source.indexOf('const DEFAULT_LEVEL_MILESTONES = {');
  // Grab from the registry tables through the end of the last helper
  // (getLevelMoveSpeedBonus), whose body ends at the first `}` after its
  // `return bonus;`.
  const lastFn = source.indexOf('export function getLevelMoveSpeedBonus');
  const tail = source.indexOf('}', source.indexOf('return bonus;', lastFn)) + 1;
  const block = source.slice(start, tail).replace(/export /g, '');
  return new Function(`${block}
    return {
      getLevelMilestone,
      getMilestoneChargeBonus,
      getLevelMoveSpeedBonus,
      LEVEL_MILESTONE_LEVELS,
      DEFAULT_LEVEL_MILESTONES,
      CHARACTER_LEVEL_MILESTONES,
    };`)();
}

describe('level milestone registry', () => {
  const M = loadMilestoneHelpers();

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
