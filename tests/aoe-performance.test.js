const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const between = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end);
};

describe('AOE performance safeguards', () => {
  const combat = read('js/game/combat.js');
  const world = read('js/game/world.js');

  test('reuses spatial indexes across damage and status radius passes in one frame', () => {
    const enemyCircle = between(world, 'function forEachEnemyNearCircle(', '\n  function forEachEnemyNearRect');
    const destructibleCircle = between(world, 'function forEachDestructibleNearCircle(', '\n  function forEachDestructibleNearRect');
    expect(enemyCircle).toContain('|| ensureEnemySpatialIndex()');
    expect(destructibleCircle).toContain('|| ensureDestructibleSpatialIndex()');
  });

  test('does not layer a second full shockwave over blastRadius AOEs', () => {
    [
      ['function castWallOfToph()', '\n  // Laser Shockwave'],
      ['function castRandomPounce()', '\n  function castMooggyZoomies'],
      ['function applyTurtlePowerUp(', '\n  function castFireCircle'],
      ['function castMooggyHairball()', '\n  function castPotionBath'],
    ].forEach(([start, end]) => {
      const cast = between(combat, start, end);
      expect(cast).toContain('blastRadius(');
      expect(cast).not.toContain('spawnAoeShockwave(');
    });
  });

  test('keeps Random Pounce fangs on selected targets and lowers path refresh frequency', () => {
    const pounce = between(combat, 'function castRandomPounce()', '\n  function castMooggyZoomies');
    expect(pounce).toContain('homingTargetRef: target');
    expect(pounce).toContain('homingTargetTimer: 1.1');
    expect(pounce).toContain('homingPathRefreshInterval: 0.45');
    expect(world).toContain('p.homingTargetRef = props.homingTargetRef ?? null');
    expect(world).toContain('projectile.homingPathRefreshInterval || 0.16');
  });

  test('budgets per-target blast cosmetics and adapts explosion particle counts', () => {
    const blast = between(world, 'function blastRadius(', '\n  // Detonates an enemy projectile');
    const shockwave = between(world, 'function spawnAoeShockwave(', '\n  function recordProjectileTrail');
    expect(blast).toContain('const targetFxBudget = performanceMode');
    expect(blast).toContain('CULLED_AOE_HIT_OPTIONS');
    expect(shockwave).toContain('const adaptiveQuality = Neo.getAdaptiveQualityLevel?.() || 0');
    expect(shockwave).toContain('const visibleEmberCount = adaptiveQuality >= 1');
  });

  test('uses squared-distance checks for local and authoritative radius targets', () => {
    const authority = read('js/simulation/NetworkCombatSystem.js');
    const blast = between(world, 'function blastRadius(', '\n  // Detonates an enemy projectile');
    const authorityRadius = between(authority, 'function abilityTargetsInRadius(', '\n  function abilityTargetsInBeam');
    expect(blast).toContain('enemyDx * enemyDx + enemyDy * enemyDy > enemyReach * enemyReach');
    expect(authorityRadius).toContain('dx * dx + dy * dy <= reach * reach');
    expect(authorityRadius).not.toContain('Math.hypot');
  });
});
