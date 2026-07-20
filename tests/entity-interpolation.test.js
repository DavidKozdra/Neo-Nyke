const fs = require('node:fs');
const path = require('node:path');

// The simulation steps at a fixed 20Hz but the game draws at 60-144Hz, so every
// entity used to hold one position for 3-7 frames and then jump.
// simulationInterpolationAlpha was computed for exactly this and consumed
// nowhere. Positions are now blended for the frame and restored immediately
// after, so the simulation never observes an interpolated coordinate.
describe('render-rate entity interpolation', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'js/core/update.js'),
    'utf8',
  );

  test('the computed alpha is actually consumed', () => {
    expect(source).toContain('applyInterpolation(Neo.simulationInterpolationAlpha)');
  });

  test('positions are snapshotted before the fixed step, not after', () => {
    // Capturing after the step would blend from the position we just moved to,
    // which is a no-op.
    const tickBody = source.slice(
      source.indexOf('legacyFixedTickRunner.advance('),
      source.indexOf('Neo.simulationInterpolationAlpha = advanceResult'),
    );
    expect(tickBody.indexOf('captureInterpolationSnapshot()'))
      .toBeLessThan(tickBody.indexOf('update(fixedDelta)'));
  });

  test('the authoritative position is restored even if drawing throws', () => {
    // Without the finally, one thrown draw would leave every entity parked at a
    // blended coordinate and the simulation would continue from there.
    const drawBlock = source.slice(source.indexOf('const drawPerfStart'));
    expect(drawBlock).toMatch(/finally\s*\{[^}]*restoreInterpolation\(\)/);
  });

  test('the camera tracks inside the blended window', () => {
    // trackCameras follows the player's drawn position; reading the raw 20Hz
    // one would leave the view a frame behind the sprite it is centred on.
    const drawBlock = source.slice(
      source.indexOf('const drawPerfStart'),
      source.indexOf("Neo.perfEnd('Neo.draw'"),
    );
    expect(drawBlock).toContain('trackCameras(dt)');
  });

  test('networked play is excluded so it is not interpolated twice', () => {
    // NetworkGameView already smooths between authority samples.
    expect(source).toMatch(/interpolate = canAdvanceSimulation && !Neo\.multiplayerGameView\?\.active/);
  });

  test('teleports are not blended', () => {
    // Blending a room change or respawn would drag the entity across the room
    // over several frames.
    expect(source).toContain('INTERPOLATION_TELEPORT_DISTANCE');
    const guard = source.match(/if \(Math\.hypot\(dx, dy\) > INTERPOLATION_TELEPORT_DISTANCE\) return;/);
    expect(guard).not.toBeNull();
  });
});
