const fs = require('node:fs');
const path = require('node:path');

describe('beam struggles', () => {
  const mathSource = fs.readFileSync(path.join(__dirname, '../js/core/math-utils.js'), 'utf8');
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const updateSource = fs.readFileSync(path.join(__dirname, '../js/core/update.js'), 'utf8');
  const environmentSource = fs.readFileSync(path.join(__dirname, '../js/draw/environment.js'), 'utf8');
  const entitiesSource = fs.readFileSync(path.join(__dirname, '../js/draw/entities.js'), 'utf8');
  const threeSource = fs.readFileSync(path.join(__dirname, '../js/draw/three-renderer.js'), 'utf8');

  function loadContactFunction() {
    const match = mathSource.match(/export function findOpposingBeamPathContact[\s\S]*?\n}\n\nexport function getBeamPathLength/);
    if (!match) throw new Error('findOpposingBeamPathContact source not found');
    const functionSource = match[0]
      .replace(/^export /, '')
      .replace(/\n\nexport function getBeamPathLength$/, '');
    return new Function('clamp', `${functionSource}; return findOpposingBeamPathContact;`)(
      (value, low, high) => Math.max(low, Math.min(high, value)),
    );
  }

  test('detects opposing overlapping beams and rejects co-directional crossings', () => {
    const findContact = loadContactFunction();
    const right = [{ x1: 0, y1: 0, x2: 100, y2: 0 }];
    const left = [{ x1: 100, y1: 0, x2: 0, y2: 0 }];
    const sameDirection = [{ x1: 20, y1: 0, x2: 120, y2: 0 }];

    const contact = findContact(right, left, 2);
    expect(contact).toEqual(expect.objectContaining({ distance: 0, directionDot: -1 }));
    expect(contact.x).toBeCloseTo(50);
    expect(findContact(right, sameDirection, 2)).toBeNull();
  });

  test('detects near-touching opposing beams within authored width tolerance', () => {
    const findContact = loadContactFunction();
    const first = [{ x1: 0, y1: 0, x2: 60, y2: 0 }];
    const second = [{ x1: 100, y1: 8, x2: 62, y2: 8 }];
    expect(findContact(first, second, 10)).toEqual(expect.objectContaining({ distance: expect.any(Number) }));
    expect(findContact(first, second, 6)).toBeNull();
  });

  test('owns mash input, damage suppression, and both outcomes', () => {
    expect(combatSource).toContain('function tryStartBeamStruggle(playerPaths)');
    expect(combatSource).toContain('function registerBeamStruggleMash()');
    expect(combatSource).toContain('struggle.progress - struggle.enemyPressure * dt');
    expect(combatSource).toContain('if (isBeamStruggleParticipant(enemy)) return false;');
    expect(combatSource).toContain('resolveBeamStruggle(true)');
    expect(combatSource).toContain('resolveBeamStruggle(false)');
    expect(updateSource).toContain('Neo.registerBeamStruggleMash?.();');
    expect(updateSource).toContain('Releasing the laser control must not end the channel');
  });

  test('draws a shared HUD and terminates 2D/3D beams at the clash point', () => {
    expect(environmentSource).toContain('function drawBeamStruggleHud()');
    expect(environmentSource).toContain('MASH [${String(laserHint).toUpperCase()}]');
    expect(entitiesSource).toContain('Neo.beamStruggle?.active && Neo.beamStruggle.enemy === enemy');
    expect(threeSource).toContain('Neo.beamStruggle?.active && Neo.beamStruggle.enemy === enemy');
  });
});
