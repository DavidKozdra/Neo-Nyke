const fs = require('node:fs');
const path = require('node:path');
const { applyFirstPersonLookDelta } = require('../js/core/first-person-look');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('first-person mobile controls', () => {
  const renderer = read('js/draw/three-renderer.js');
  const touchControls = read('js/touchControls.js');
  const styles = read('css/touch-controls.css');

  test('converts touch drags into yaw and clamped pitch', () => {
    const look = applyFirstPersonLookDelta(1, 0, 100, -50);
    expect(look.yaw).toBeCloseTo(1.55);
    expect(look.pitch).toBeCloseTo(0.225);
    expect(applyFirstPersonLookDelta(0, 0.4, 0, -100).pitch).toBe(0.45);
    expect(applyFirstPersonLookDelta(0, -0.5, 0, 100).pitch).toBe(-0.55);
  });

  test('sanitizes unusable deltas instead of poisoning the camera', () => {
    expect(applyFirstPersonLookDelta(0.4, -0.1, Number.NaN, Infinity)).toEqual({
      yaw: 0.4,
      pitch: -0.1,
    });
  });

  test('does not disable first person merely because touch controls are active', () => {
    const start = renderer.indexOf('function isFirstPersonActive()');
    const end = renderer.indexOf('\n}', start) + 2;
    expect(renderer.slice(start, end)).not.toContain('NeoTouch');
    expect(renderer).not.toContain("cameraMode === 'fp' && !window.NeoTouch?.active");
  });

  test('provides a multitouch look surface and consumes its camera deltas', () => {
    expect(touchControls).toContain("const lookZone = mkEl('div', 'touch-look-zone')");
    expect(touchControls).toContain('NT.lookDeltaX += deltaX');
    expect(touchControls).toContain('NT.lookDeltaY += deltaY');
    expect(touchControls).toContain("document.addEventListener('touchmove', event => {");
    expect(touchControls).toContain("'#interactPrompt, [data-no-touch-look]'");
    expect(renderer).toContain('applyFirstPersonLookDelta(fpYaw, fpPitch, touchLookX, touchLookY)');
    expect(styles).toContain('#touch-overlay.touch-overlay--fps .touch-look-zone');
  });

  test('keeps browser pointer lock away from touch gestures', () => {
    expect(renderer).toContain("if (event.pointerType === 'touch') return;");
    expect(renderer).toContain('const touchLookActive = !!window.NeoTouch?.active');
  });
});
