const fs = require('node:fs');
const path = require('node:path');

describe('beam struggles', () => {
  const mathSource = fs.readFileSync(path.join(__dirname, '../js/core/math-utils.js'), 'utf8');
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
  const updateSource = fs.readFileSync(path.join(__dirname, '../js/core/update.js'), 'utf8');
  const environmentSource = fs.readFileSync(path.join(__dirname, '../js/draw/environment.js'), 'utf8');
  const viewportSource = fs.readFileSync(path.join(__dirname, '../js/draw/viewport.js'), 'utf8');
  const entitiesSource = fs.readFileSync(path.join(__dirname, '../js/draw/entities.js'), 'utf8');
  const threeSource = fs.readFileSync(path.join(__dirname, '../js/draw/three-renderer.js'), 'utf8');
  const networkSource = fs.readFileSync(path.join(__dirname, '../js/simulation/NetworkCombatSystem.js'), 'utf8');
  const networkViewSource = fs.readFileSync(path.join(__dirname, '../js/rendering/NetworkGameView.js'), 'utf8');

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
    expect(combatSource).toContain('function registerBeamStruggleMash(playerNumber = 1)');
    expect(combatSource).toContain("opponentPlayer: options.opponentPlayer || null");
    expect(worldSource).toContain('Neo.registerBeamStruggleMash?.(2)');
    expect(combatSource).toContain('struggle.progress - struggle.enemyPressure * dt');
    expect(combatSource).toContain('if (isBeamStruggleParticipant(enemy)) return false;');
    expect(combatSource).toContain('resolveBeamStruggle(true)');
    expect(combatSource).toContain('resolveBeamStruggle(false)');
    expect(updateSource).toContain('Neo.registerBeamStruggleMash?.();');
    expect(updateSource).toContain('Releasing the laser control must not end the channel');
  });

  test('makes real losses devastating while keeping training modes forgiving', () => {
    expect(combatSource).toContain("const trainingSafe = Neo.gameMode === 'practice' || Neo.isTutorialRun?.()");
    expect(combatSource).toContain('attackerBeamPower + playerBeamPower');
    expect(combatSource).toContain('maxHitRatio: 0.6');
    expect(combatSource).toContain("text: devastatingLoss ? 'BEAM BREAK!' : 'OVERPOWERED!'");
    expect(networkSource).toContain('winner?.beamDamage || 0) + Number(loser.beamDamage || 0)');
    expect(networkSource).toContain('knockback: 560, ignoreInv: true, maxHitRatio: 0.6');
  });

  test('draws a beam-colored shared HUD and a mixed clash sphere in 2D and 3D', () => {
    expect(environmentSource).toContain('function drawBeamStruggleHud()');
    expect(environmentSource).toContain('MASH [${String(laserHint).toUpperCase()}]');
    expect(environmentSource).toContain('Neo.getBeamStruggleVisualColors?.(struggle)');
    expect(combatSource).toContain('function getBeamVisualColor(');
    expect(combatSource).toContain('function getEnemyBeamVisualColor(enemy)');
    expect(entitiesSource).toContain('function drawBeamStruggleClash(');
    expect(entitiesSource).toContain("pressureGradient.addColorStop(0, playerColor)");
    expect(entitiesSource).toContain("pressureGradient.addColorStop(1, opponentColor)");
    expect(viewportSource).toContain('Neo.drawBeamStruggleClash?.()');
    expect(threeSource).toContain('function syncBeamStruggleClash()');
    expect(entitiesSource).toContain('Neo.beamStruggle?.active && Neo.beamStruggle.enemy === enemy');
    expect(threeSource).toContain('Neo.beamStruggle?.active && Neo.beamStruggle.enemy === enemy');
  });

  test('owns multiplayer beam struggles on the authority and projects them to the shared HUD', () => {
    expect(networkSource).toContain('function tryStartNetworkBeamStruggle');
    expect(networkSource).toContain('function registerNetworkBeamMash');
    expect(networkSource).toContain("emitEvent('BEAM_STRUGGLE_RESOLVED'");
    expect(networkViewSource).toContain("this.session.sendAction('BEAM_MASH'");
    expect(networkViewSource).toContain('this.neo.beamStruggle = authorityStruggle');
  });
});
