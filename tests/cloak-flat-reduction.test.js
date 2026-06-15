const fs = require('node:fs');
const path = require('node:path');

describe('Cloak of the Naked King flat damage reduction', () => {
  const playerSource = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');
  const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
  const inputSource = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');

  test('publishes flat reduction separately from percentage reduction', () => {
    expect(playerSource).toContain('const flatDamageReduction = getCloakFlatDamageReduction(nakedKingCloak, ownedToolStacks)');
    expect(playerSource).toContain('flatDamageReduction,');
    expect(playerSource).not.toContain('standardDamageReduction + getCloak');
  });

  test('subtracts flat reduction after percentage mitigation', () => {
    const percentageIndex = worldSource.indexOf("let finalAmount = numericAmount * (Neo.isChallengeActive('glass_cannon')");
    const flatIndex = worldSource.indexOf('finalAmount - Math.max(0, Number(itemStats.flatDamageReduction || 0))');

    expect(percentageIndex).toBeGreaterThan(-1);
    expect(flatIndex).toBeGreaterThan(percentageIndex);
  });

  test('describes 100 flat points per cloak stack', () => {
    expect(inputSource).toContain('Reduce incoming damage by 100 points per stack');
    expect(inputSource).toContain('plus 1 point per owned tool stack');
  });
});
