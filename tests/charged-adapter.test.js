const fs = require('node:fs');
const path = require('node:path');

describe('Charged Adapter recharge', () => {
  test('uses the doubled 20-kill base requirement everywhere', () => {
    const playerSource = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');
    const updateSource = fs.readFileSync(path.join(__dirname, '../js/core/update.js'), 'utf8');
    const hudSource = fs.readFileSync(path.join(__dirname, '../js/game/hud.js'), 'utf8');

    expect(playerSource).toContain('escapeChargeKills >= getChargeRequirement(20)');
    expect(updateSource).toContain('const needed = Neo.getChargeRequirement(20)');
    expect(hudSource.match(/const needed = Neo\.getChargeRequirement\(20\)/g)).toHaveLength(2);
  });

  test('keeps Keen Eye on its separate 10-kill base requirement', () => {
    const playerSource = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');

    expect(playerSource).toContain('keenEyeChargeKills >= getChargeRequirement(10)');
  });
});
