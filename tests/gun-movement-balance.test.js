const fs = require('node:fs');
const path = require('node:path');
const { WEAPON_BASE_STATS, WEAPON_PROJECTILE_ATTACKS } = require('../js/simulation/SharedCombatContent');

function loadMovingGunPenalty(Neo) {
  const source = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const constantsStart = source.indexOf('  const MOVING_GUN_PENALTIES');
  const functionStart = source.indexOf('  function getMovingGunPenalty');
  const functionEnd = source.indexOf('\n  function fireConfiguredWeaponProjectile', functionStart);
  if (constantsStart < 0 || functionStart < 0 || functionEnd < 0) {
    throw new Error('Could not isolate moving gun penalty logic');
  }
  const constantsEnd = source.indexOf('\n\n', constantsStart);
  const block = `${source.slice(constantsStart, constantsEnd)}\n${source.slice(functionStart, functionEnd)}`;
  return new Function('Neo', `${block}; return getMovingGunPenalty;`)(Neo);
}

describe('Degale and P90 movement balance', () => {
  test('uses the reduced base damage values', () => {
    expect(WEAPON_BASE_STATS.magenta_degale.damage).toBe(108);
    expect(WEAPON_BASE_STATS.magenta_p90.damage).toBe(22);
  });

  test('spaces P90 rounds through a readable burst', () => {
    expect(WEAPON_PROJECTILE_ATTACKS.magenta_p90).toEqual(expect.objectContaining({
      burstCount: 5,
      burstDelay: 0.08,
    }));
  });

  test('keeps stationary shots accurate with normal recoil', () => {
    const Neo = {
      player: { vx: 0, vy: 0 },
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    };
    const getMovingGunPenalty = loadMovingGunPenalty(Neo);

    expect(getMovingGunPenalty('magenta_degale')).toEqual({ spread: 0, recoilMultiplier: 1 });
    expect(getMovingGunPenalty('magenta_p90')).toEqual({ spread: 0, recoilMultiplier: 1 });
  });

  test('adds substantial spread and recoil at normal full movement speed', () => {
    const Neo = {
      player: { vx: 228, vy: 0 },
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    };
    const getMovingGunPenalty = loadMovingGunPenalty(Neo);

    expect(getMovingGunPenalty('magenta_degale')).toEqual({ spread: 0.18, recoilMultiplier: 2.4 });
    expect(getMovingGunPenalty('magenta_p90')).toEqual({ spread: 0.14, recoilMultiplier: 2 });
  });
});
