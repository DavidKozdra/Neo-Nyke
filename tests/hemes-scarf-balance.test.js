const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const playerSource = fs.readFileSync(path.join(root, 'js/game/player.js'), 'utf8');
const updateSource = fs.readFileSync(path.join(root, 'js/core/update.js'), 'utf8');
const gameStateSource = fs.readFileSync(path.join(root, 'js/core/game-state.js'), 'utf8');
const sharedEventSource = fs.readFileSync(path.join(root, 'js/simulation/SharedEventItemSystem.js'), 'utf8');
const authoritySource = fs.readFileSync(path.join(root, 'js/simulation/NetworkCombatSystem.js'), 'utf8');
const { advanceCampaignHemesScarfDrain } = require('../js/simulation/SharedEventItemSystem.js');

describe("Heme's Scarf charge and healing balance", () => {
  test('starts uncharged and requires ten kill-charge steps', () => {
    expect(gameStateSource).toContain('scarfHealReady: false');
    expect(gameStateSource).toContain('scarfHealTime: 0');
    expect(playerSource).toContain('playerData.scarfHealReady = playerData.scarfHealReady === true');
    expect(sharedEventSource).toContain("'hemes_scarf', 'scarfChargeKills', 'scarfHealReady', chargeRequirement(player, 10, stats)");
  });

  test('low health cannot arm the scarf without kills', () => {
    expect(updateSource).not.toContain('if (Neo.player.hp < 50) Neo.player.scarfHealReady = true');
    expect(updateSource).toContain('advanceCampaignHemesScarfDrain');
    expect(sharedEventSource).toContain('player.scarfHealReady');
  });

  test('uses the reduced heal rate and caps extreme bleed healing', () => {
    expect(sharedEventSource).toContain('maxHp || 0) * 0.0003 * bleed');
    expect(sharedEventSource).toContain('maxHp || 0) * 0.025 * delta');
  });

  test('spends the charge up front and limits each discharge to three seconds', () => {
    const player = { hp: 49, maxHp: 100, scarfHealReady: true, scarfHealTime: 0, itemStats: { bleedHealScale: 1 } };
    const started = advanceCampaignHemesScarfDrain(player, 3, 0.05);
    expect(started.started).toBe(true);
    expect(player.scarfHealReady).toBe(false);
    expect(player.scarfHealTime).toBeCloseTo(2.95);
    expect(authoritySource).toContain('advanceCampaignHemesScarfDrain(player, totalBleed, fixedDelta');
  });
});
