const fs = require('node:fs');
const path = require('node:path');

describe('Charged Adapter recharge', () => {
  test('uses the doubled 20-kill base requirement everywhere', () => {
    const playerSource = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');
    const sharedSource = fs.readFileSync(path.join(__dirname, '../js/simulation/SharedEventItemSystem.js'), 'utf8');
    const updateSource = fs.readFileSync(path.join(__dirname, '../js/core/update.js'), 'utf8');
    const hudSource = fs.readFileSync(path.join(__dirname, '../js/game/hud.js'), 'utf8');

    expect(playerSource).toContain('simulation.applyCampaignKillCharge');
    expect(sharedSource).toContain("'charged_adapter', 'escapeChargeKills', 'escapeReady', chargeRequirement(player, 20, stats)");
    expect(updateSource).toContain('const needed = Neo.getChargeRequirement(20)');
    expect(hudSource.match(/const needed = Neo\.getChargeRequirement\(20\)/g)).toHaveLength(2);
  });

  test('keeps Keen Eye on its separate 10-kill base requirement', () => {
    const playerSource = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');
    const sharedSource = fs.readFileSync(path.join(__dirname, '../js/simulation/SharedEventItemSystem.js'), 'utf8');

    expect(playerSource).toContain('simulation.applyCampaignKillCharge');
    expect(sharedSource).toContain("'keen_eye', 'keenEyeChargeKills', 'keenEyeReady', chargeRequirement(player, 10, stats)");
  });
});
