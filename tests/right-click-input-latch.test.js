const fs = require('node:fs');
const path = require('node:path');

describe('right-click input latch safety', () => {
  const panelsSource = fs.readFileSync(path.join(__dirname, '../js/ui/panels.js'), 'utf8');
  const updateSource = fs.readFileSync(path.join(__dirname, '../js/core/update.js'), 'utf8');

  test('clears mouse-held state when browser button state or focus is lost', () => {
    expect(panelsSource).toContain("if ((event.buttons & 2) === 0) Neo.mouse.right = false");
    expect(panelsSource).toContain('Neo._laserWasHeld = false');
    expect(panelsSource).toContain("window.addEventListener('mousemove', syncMouseButtons");
    expect(panelsSource).toContain("window.addEventListener('pointercancel', clearMouseButtons)");
    expect(panelsSource).toContain("window.addEventListener('blur', clearMouseButtons)");
    expect(panelsSource).toContain("document.addEventListener('visibilitychange'");
  });

  test('prevents native secondary-click actions on the game canvas', () => {
    expect(panelsSource).toContain("Neo.canvas.addEventListener('contextmenu', event => event.preventDefault())");
    expect(panelsSource).toContain("Neo.canvas.addEventListener('auxclick'");
    expect(panelsSource).toContain("if (event.button === 0 || event.button === 2) event.preventDefault()");
  });

  test('ends sustained beam recoil when the laser input is released', () => {
    expect(updateSource).toContain("if (!laserHeld && Neo.laserActive && !Neo.isInstantLaserMove?.()) Neo.endActiveLaser?.()");
  });
});
