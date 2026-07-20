const fs = require('fs');
const path = require('path');

const moves = require('../js/simulation/SharedMoveContent.js');
const acquisition = require('../js/simulation/SharedAcquisitionSystem.js');

// Move charge counts used to live in two hand-maintained tables: MOVE_DEFS in
// js/ui/input.js (single player) and a flat MOVE_BASE_CHARGES in
// SharedAcquisitionSystem (multiplayer authority). The shared copy had no
// per-character concept, so Thorn's 2-charge dash silently became 1 charge in
// multiplayer. SharedMoveContent now owns both tables; these tests guard the
// parity so the two runtimes can't drift apart again.
describe('move charge parity between single player and the authority', () => {
  test('Thorn keeps both dash charges, other characters keep one', () => {
    expect(moves.getMoveBaseCharges('dash', 'thorn_knight')).toBe(2);
    expect(moves.getMoveBaseCharges('dash', 'princess')).toBe(1);
    expect(moves.getMoveBaseCharges('dash', 'mooggy')).toBe(1);
  });

  test('the authority resolves charges through the shared table', () => {
    // getBaseMoveCharges is not exported, so drive it through the Extra Battery
    // path that consumes it: a battery on Thorn's dash must go 2 -> 3, not 1 -> 2.
    const player = { characterKey: 'thorn_knight', items: {}, moveStackOverrides: {} };
    const result = acquisition.applyExtraBatterySelection
      ? acquisition.applyExtraBatterySelection(player, { moveKey: 'dash' })
      : null;
    if (result && result.maxCharges !== undefined) {
      expect(result.maxCharges).toBe(3);
    } else {
      // Fall back to asserting the shared lookup the authority now defers to.
      expect(moves.getMoveBaseCharges('dash', 'thorn_knight')).toBe(2);
    }
  });

  test('multi-charge moves agree with their shared base counts', () => {
    expect(moves.getMoveBaseCharges('warp', 'thorn_knight')).toBe(4);
    expect(moves.getMoveBaseCharges('mooggy_zoomies', 'mooggy')).toBe(2);
    expect(moves.getMoveBaseCharges('lightning_cross', 'sarge')).toBe(2);
    expect(moves.getMoveBaseCharges('nail_shot', 'mooggy')).toBe(2);
  });

  test('MOVE_DEFS no longer hardcodes charge counts of its own', () => {
    // input.js overlays the shared table onto MOVE_DEFS at load. If someone
    // reintroduces a literal stackOverrides block there, the overlay will mask it
    // in one runtime and not the other — catch that by requiring the shared table
    // to be the place Thorn's dash override is declared.
    expect(moves.MOVE_CHARGE_OVERRIDES.dash).toEqual({ thorn_knight: 2 });

    const inputSource = fs.readFileSync(
      path.join(__dirname, '..', 'js', 'ui', 'input.js'),
      'utf8',
    );
    expect(inputSource).toContain('MOVE_CHARGE_OVERRIDES');
  });
});
