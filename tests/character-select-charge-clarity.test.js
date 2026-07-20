const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('character-select kit clarity', () => {
  const controller = read('js/ui/controller.js');
  const panels = read('js/ui/panels.js');
  const gameState = read('js/core/game-state.js');
  const css = read('css/character-select.css');

  test('shows the hovered move charge count compactly in the skill readout', () => {
    expect(controller).toContain('Neo.getMoveMaxStacks?.(moveKey, selected, null)');
    expect(controller).toContain('hero-detail-charge-meter');
    expect(controller).toContain('data-starting-charges="${startingChargeCount(optKey)}"');
    expect(controller).toContain('data-starting-charges="${startingChargeCount(moveKey)}"');
    expect(controller).toContain('data-skill-readout-charges');
    expect(controller).toContain("chargeCount === 1 ? '1 CHARGE' : `${chargeCount} CHARGES`");
    expect(controller).toContain("pip.className = 'hero-detail-charge-pip'");
    expect(css).toContain('#charSelect .hero-detail-charge-pip');
    expect(css).toContain('#charSelect .hero-detail-skill-readout-head');
  });

  test('cancels a dedicated tutorial selection when leaving or choosing another mode', () => {
    expect(panels).toContain('Neo.tutorialLaunchPending = true');
    expect(panels).not.toMatch(/onPlayTutorial\(\) \{[\s\S]*?localStorage\.setItem/);
    expect(panels).toMatch(/onOpenCharacterSelect\(\) \{[\s\S]*?Neo\.tutorialLaunchPending = false/);
    expect(panels).toMatch(/onCloseCharacterSelect\(\) \{[\s\S]*?if \(Neo\.tutorialLaunchPending\)/);
    expect(panels).toMatch(/onOpenAltModeCharSelect\(mode\) \{[\s\S]*?Neo\.tutorialLaunchPending = false/);
    expect(panels).toMatch(/onStartSandbox\(\) \{[\s\S]*?Neo\.tutorialLaunchPending = false/);
    expect(gameState).toContain('const menuTutorialLaunch = !resume && Neo.tutorialLaunchPending === true');
    expect(gameState).toContain('Neo.tutorialLaunchPending = false');
    expect(gameState).toContain('const forceTutorialReplay = menuTutorialLaunch || savedTutorialReplay');
  });
});
