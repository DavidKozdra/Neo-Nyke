const fs = require('node:fs');
const path = require('node:path');

describe('laser gauntlet practice variant', () => {
  const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const html = read('index.html');
  const gameStateSource = read('js/core/game-state.js');
  const enemiesSource = read('js/game/enemies.js');
  const combatSource = read('js/game/combat.js');
  const entitiesSource = read('js/draw/entities.js');
  const panelsSource = read('js/ui/panels.js');
  const controllerSource = read('js/ui/controller.js');
  const updateSource = read('js/core/update.js');

  test('routes the alt-mode card into an isolated practice variant', () => {
    expect(html).toContain('id="altModeBeamPracticeBtn"');
    expect(html).toContain('LASER GAUNTLET');
    expect(panelsSource).toContain("mode === 'beam_practice' ? 'beams' : 'standard'");
    expect(controllerSource).toContain("handlers.onOpenAltModeCharSelect('beam_practice')");
    expect(controllerSource).toContain("Neo.practiceVariant === 'standard'");
  });

  test('spawns escalating hard-mode waves made only of stronger elite laser users', () => {
    expect(gameStateSource).toContain("Neo.practiceVariant === 'beams' ? 'hard' : 'easy'");
    expect(gameStateSource).toContain("enemy.eliteTypes = ['knight', 'knight', 'lazered']");
    expect(gameStateSource).toContain('enemy.beamPracticeUser = true');
    expect(gameStateSource).toContain('const strength = 1 + Math.max(0, wave - 1) * 0.12');
    expect(gameStateSource).toContain('function updateBeamPractice(dt)');
    expect(updateSource).toContain('Neo.updateBeamPractice?.(dt)');
  });

  test('cycles every continuous authored beam with matching fan geometry and visuals', () => {
    const modes = [
      'blood_beam', 'love_beam', 'turtle_wave', 'wizard_lazer',
      'mooggy_blood_beam', 'thorn_blood_beams', 'holy_eye_beams', 'god_sweep',
    ];
    modes.forEach(mode => {
      expect(gameStateSource).toContain(`'${mode}'`);
      expect(enemiesSource).toContain(`${mode}: {`);
    });
    expect(enemiesSource).toContain('fan: [-0.32, -0.11, 0.11, 0.32]');
    expect(enemiesSource).toContain('fan: [-0.07, 0.07]');
    expect(combatSource).toContain('const offsets = Array.isArray(fan) && fan.length ? fan : [0]');
    expect(entitiesSource).toContain('Array.isArray(enemy.beamFan) && enemy.beamFan.length');
  });
});
