const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const playerSource = fs.readFileSync(path.join(root, 'js/game/player.js'), 'utf8');
const updateSource = fs.readFileSync(path.join(root, 'js/core/update.js'), 'utf8');
const gameStateSource = fs.readFileSync(path.join(root, 'js/core/game-state.js'), 'utf8');

describe("Heme's Scarf charge and healing balance", () => {
  test('starts uncharged and requires ten kill-charge steps', () => {
    expect(gameStateSource).toContain('scarfHealReady: false');
    expect(gameStateSource).toContain('scarfHealTime: 0');
    expect(playerSource).toContain('playerData.scarfHealReady = playerData.scarfHealReady === true');
    expect(playerSource).toContain('getChargeRequirement(10)');
  });

  test('low health cannot arm the scarf without kills', () => {
    expect(updateSource).not.toContain('if (Neo.player.hp < 50) Neo.player.scarfHealReady = true');
    expect(updateSource).toContain('&& Neo.player.scarfHealReady');
  });

  test('uses the reduced heal rate and caps extreme bleed healing', () => {
    expect(updateSource).toContain('Neo.player.maxHp * 0.0003 * totalBleed * itemStats.bleedHealScale * dt');
    expect(updateSource).toContain('Math.min(rawHeal, Neo.player.maxHp * 0.025 * dt)');
  });

  test('spends the charge up front and limits each discharge to three seconds', () => {
    const spendAt = updateSource.indexOf("Neo.consumeCharge('hemes_scarf')");
    const startAt = updateSource.indexOf('Neo.player.scarfHealTime = 3', spendAt);
    const healAt = updateSource.indexOf('const rawHeal =', startAt);
    expect(spendAt).toBeGreaterThan(-1);
    expect(startAt).toBeGreaterThan(spendAt);
    expect(healAt).toBeGreaterThan(startAt);
    expect(playerSource).toContain('&& Number(Neo.player.scarfHealTime || 0) <= 0');
  });
});
