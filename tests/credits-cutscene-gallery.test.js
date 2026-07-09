const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('credits cutscene gallery data', () => {
  test('keeps generated rival encounter dialogue in the gallery', () => {
    const creditsSource = fs.readFileSync(path.join(root, 'js/ui/credits.js'), 'utf8');

    expect(creditsSource).toContain('Object.entries(Neo.RIVAL_DEFS');
    expect(creditsSource).toContain('Entrance and defeat dialogue');
    expect(creditsSource).toContain('entries = [...storyEntries, ...tauntEntries, ...rivalEntries];');
  });

  test('archives God phase dialogue as the separate live cutscenes', () => {
    const coreSource = fs.readFileSync(path.join(root, 'js/core/game-core.js'), 'utf8');

    expect(coreSource).not.toContain("id: 'god_phases'");
    for (let phase = 1; phase <= 5; phase += 1) {
      expect(coreSource).toContain(`id: 'god_phase_${phase}'`);
      expect(coreSource).toContain(`{ speaker: 'GOD', text: GOD_PHASE_DIALOGUE[${phase}] }`);
    }
  });
});
