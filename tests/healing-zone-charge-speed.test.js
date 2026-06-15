const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  return source.slice(start, end + 1);
}

describe('Healing Zone charge speed', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const declaration = extractFunction(source, 'updateHealingZoneCharge');

  function chargeForOneSecond(attackSpeed) {
    const castHealingZone = jest.fn();
    const Neo = {
      healingZoneCharging: true,
      healingZoneChargeTime: 0,
      player: {},
      gameState: 'play',
      smashHeld: true,
      getAttackSpeedValue: () => attackSpeed,
      nextRandom: () => 1,
    };
    const updateHealingZoneCharge = new Function(
      'Neo',
      'HEALING_ZONE_MAX_CHARGE',
      'castHealingZone',
      `${declaration}; return updateHealingZoneCharge;`,
    )(Neo, 5, castHealingZone);

    updateHealingZoneCharge(1);
    return { charge: Neo.healingZoneChargeTime, castHealingZone };
  }

  test('accumulates charge using effective attack speed', () => {
    expect(chargeForOneSecond(0.5).charge).toBeCloseTo(0.5);
    expect(chargeForOneSecond(1).charge).toBeCloseTo(1);
    expect(chargeForOneSecond(2).charge).toBeCloseTo(2);
  });

  test('auto-releases at the full-charge threshold', () => {
    const result = chargeForOneSecond(8);

    expect(result.castHealingZone).toHaveBeenCalledWith(1);
    expect(result.charge).toBe(0);
  });
});
