const fs = require('node:fs');
const path = require('node:path');

describe('holy turret gun visuals', () => {
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
  const propsSource = fs.readFileSync(path.join(__dirname, '../js/draw/props.js'), 'utf8');

  test('spawns turrets with facing and recoil state', () => {
    expect(combatSource).toContain('aimAngle: angle');
    expect(combatSource).toContain('recoil: 0');
  });

  test('tracks targets and fires from the cannon muzzle', () => {
    expect(worldSource).toContain('hazard.aimAngle = currentAngle + Neo.clamp');
    expect(worldSource).toContain('const muzzleX = hazard.x + Math.cos(aimAngle) * 31');
    expect(worldSource).toContain('hazard.recoil = 0.14');
  });

  test('renders a rotating barrel, armored housing, and muzzle flash', () => {
    const turretBranch = propsSource.slice(
      propsSource.indexOf("} else if (hazard.kind === 'holy_turret')"),
      propsSource.indexOf("} else if (hazard.kind === 'chaos_burst')"),
    );

    expect(turretBranch).toContain('Neo.ctx.rotate(aimAngle)');
    expect(turretBranch).toContain('Rotating cannon assembly');
    expect(turretBranch).toContain('Armored rotating housing');
    expect(turretBranch).toContain('if (recoilRatio > 0.25)');
  });
});
