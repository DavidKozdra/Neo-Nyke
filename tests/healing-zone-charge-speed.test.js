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
  const healingZoneDeclaration = extractFunction(source, 'updateHealingZoneCharge');
  const deathBallDeclaration = extractFunction(source, 'updateDeathBallCharge');
  const getChargeSpeedAttackBonusDeclaration = extractFunction(source, 'getChargeSpeedAttackBonus');
  const spawnChargeMotesDeclaration = extractFunction(source, 'spawnChargeMotes');

  function chargeHealingZone(dt, attackSpeed) {
    const castHealingZone = jest.fn();
    const Neo = {
      healingZoneCharging: true,
      healingZoneChargeTime: 0,
      player: {},
      gameState: 'play',
      smashHeld: true,
      getAttackSpeedValue: () => attackSpeed,
      nextRandom: () => 1,
      spawnParticle: () => {},
    };
    const updateHealingZoneCharge = new Function(
      'Neo',
      'HEALING_ZONE_MAX_CHARGE',
      'HEALING_ZONE_CHARGE_SPEED_MULTIPLIER',
      'CHARGE_SPEED_ATTACK_SPEED_DAMPING',
      'castHealingZone',
      `${getChargeSpeedAttackBonusDeclaration}
       ${spawnChargeMotesDeclaration}
       ${healingZoneDeclaration}
       return updateHealingZoneCharge;`,
    )(Neo, 5, 4, 0.4, castHealingZone);

    updateHealingZoneCharge(dt);
    return { charge: Neo.healingZoneChargeTime, castHealingZone };
  }

  function chargeDeathBall(dt, { attackSpeed = 1, powerUp = false } = {}) {
    const applyTurtlePowerUp = jest.fn();
    const castDeathBall = jest.fn();
    const Neo = {
      deathBallCharging: true,
      deathBallChargeTime: 0,
      deathBallPowerUp: powerUp,
      player: {},
      gameState: 'play',
      smashHeld: true,
      getAttackSpeedValue: () => attackSpeed,
      nextRandom: () => 1,
      spawnParticle: () => {},
    };
    const updateDeathBallCharge = new Function(
      'Neo',
      'DEATH_BALL_MAX_CHARGE',
      'TURTLE_POWERUP_CHARGE_SPEED_MULTIPLIER',
      'CHARGE_SPEED_ATTACK_SPEED_DAMPING',
      'applyTurtlePowerUp',
      'castDeathBall',
      `${getChargeSpeedAttackBonusDeclaration}
       ${spawnChargeMotesDeclaration}
       ${deathBallDeclaration}
       return updateDeathBallCharge;`,
    )(Neo, 5, 4, 0.4, applyTurtlePowerUp, castDeathBall);

    updateDeathBallCharge(dt);
    return { charge: Neo.deathBallChargeTime, applyTurtlePowerUp, castDeathBall };
  }

  test('accumulates Healing Zone charge faster using effective attack speed', () => {
    // Attack speed's effect on charge rate is damped by CHARGE_SPEED_ATTACK_SPEED_DAMPING
    // (0.4), so bonus = 1 + (attackSpeed - 1) * 0.4, then charge/frame = bonus * multiplier.
    expect(chargeHealingZone(0.25, 0.5).charge).toBeCloseTo(0.8);
    expect(chargeHealingZone(0.25, 1).charge).toBeCloseTo(1);
    expect(chargeHealingZone(0.25, 2).charge).toBeCloseTo(1.4);
  });

  test('auto-releases Healing Zone at the tuned full-charge threshold', () => {
    const result = chargeHealingZone(1.25, 1);

    expect(result.castHealingZone).toHaveBeenCalledWith(1);
    expect(result.charge).toBe(0);
  });

  test('only Turtle Power-Up gets the faster Death Ball charge path', () => {
    expect(chargeDeathBall(0.25, { powerUp: false }).charge).toBeCloseTo(0.25);
    expect(chargeDeathBall(0.25, { powerUp: true }).charge).toBeCloseTo(1);
  });

  test('auto-releases Turtle Power-Up at the tuned full-charge threshold', () => {
    const result = chargeDeathBall(1.25, { powerUp: true });

    expect(result.applyTurtlePowerUp).toHaveBeenCalledWith(1);
    expect(result.castDeathBall).not.toHaveBeenCalled();
    expect(result.charge).toBe(0);
  });
});
