const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName, dependencies = {}) {
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

  const names = Object.keys(dependencies);
  const values = Object.values(dependencies);
  const declaration = source.slice(start, end + 1);
  return new Function(...names, `${declaration}; return ${functionName};`)(...values);
}

describe('enemy projectile evasion', () => {
  const enemiesSource = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');
  const updateSource = fs.readFileSync(path.join(__dirname, '../js/core/update.js'), 'utf8');

  test('detects active beams and incoming player projectiles', () => {
    const pathSegment = { x1: 0, y1: 100, x2: 500, y2: 100 };
    const Neo = {
      laserActive: true,
      activeBeamPaths: [[pathSegment]],
      projectiles: [],
      beamPathHitsCircle: (beamPath, x, y, radius) => (
        Math.abs(y - beamPath[0].y1) <= radius ? beamPath[0] : null
      ),
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    };
    const getEnemyIncomingThreat = extractFunction(
      enemiesSource,
      'getEnemyIncomingThreat',
      { Neo },
    );

    expect(getEnemyIncomingThreat({ x: 250, y: 112, r: 30 }).segment).toBe(pathSegment);

    Neo.laserActive = false;
    const incoming = { x: 0, y: 100, vx: 500, vy: 0, r: 5, life: 1, enemy: false };
    Neo.projectiles = [incoming];
    expect(getEnemyIncomingThreat({ x: 250, y: 100, r: 20 }).source).toBe(incoming);

    incoming.vx = -500;
    expect(getEnemyIncomingThreat({ x: 250, y: 100, r: 20 })).toBeNull();
  });

  test('runs shared evasion before enemy AI dispatch', () => {
    const evadeIndex = updateSource.indexOf('Neo.updateEnemyProjectileEvade?.(enemy, dt)');
    const dispatchIndex = updateSource.indexOf('const methodName = ENEMY_UPDATE_METHOD_BY_TYPE');

    expect(evadeIndex).toBeGreaterThan(-1);
    expect(evadeIndex).toBeLessThan(dispatchIndex);
  });

  test('rolls once per distinct incoming threat', () => {
    const threatSource = {};
    let rolls = 0;
    const Neo = {
      nextRandom: stream => {
        if (stream === 'encounter') rolls += 1;
        return 0.99;
      },
    };
    const updateEnemyProjectileEvade = extractFunction(
      enemiesSource,
      'updateEnemyProjectileEvade',
      {
        Neo,
        getEnemyProjectileEvadeChance: () => 0.5,
        getEnemyIncomingThreat: () => ({
          source: threatSource,
          segment: { x1: 0, y1: 0, x2: 100, y2: 0 },
        }),
        warpBowmanBane: () => false,
        findEnemyEvadeDashAngle: () => 0,
        isBossType: () => false,
      },
    );
    const enemy = { type: 'hunter', stun: 0, spawnT: 0 };

    expect(updateEnemyProjectileEvade(enemy, 0.1)).toBe(false);
    expect(updateEnemyProjectileEvade(enemy, 0.2)).toBe(false);
    expect(rolls).toBe(1);
  });

  test('increases evade chance with level, difficulty, and enemy role', () => {
    const Neo = {
      selectedDifficulty: 'easy',
      getDifficultyDef() {
        return { key: this.selectedDifficulty, statMultiplier: 1 };
      },
      progressionDepth: 1,
      getProgressionDepth() {
        return this.progressionDepth;
      },
      player: { level: 1 },
      BOSS_TYPES: new Set(['god']),
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    };
    const isBossType = type => Neo.BOSS_TYPES.has(type);
    const getEnemyProgressionLevel = extractFunction(
      enemiesSource,
      'getEnemyProgressionLevel',
      { Neo },
    );
    const getEnemyEvadeDifficultyLevel = extractFunction(
      enemiesSource,
      'getEnemyEvadeDifficultyLevel',
      { Neo },
    );
    const getEnemyProjectileEvadeChance = extractFunction(
      enemiesSource,
      'getEnemyProjectileEvadeChance',
      { Neo, isBossType, getEnemyProgressionLevel, getEnemyEvadeDifficultyLevel },
    );

    const earlyEasy = getEnemyProjectileEvadeChance({ type: 'hunter', level: 1 });
    const lateEasy = getEnemyProjectileEvadeChance({ type: 'hunter', level: 20 });
    expect(lateEasy).toBeGreaterThan(earlyEasy);

    Neo.selectedDifficulty = 'hard';
    const hardChance = getEnemyProjectileEvadeChance({ type: 'hunter', level: 20 });
    expect(hardChance).toBeGreaterThan(lateEasy);
    expect(getEnemyProjectileEvadeChance({ type: 'god', level: 20 })).toBeGreaterThan(hardChance);
    expect(getEnemyProjectileEvadeChance({ type: 'rival', level: 20, rivalData: { friend: false, level: 20 } })).toBeGreaterThan(hardChance);
    expect(getEnemyProjectileEvadeChance({ type: 'rival', rivalData: { friend: true } })).toBe(0);
    expect(getEnemyProjectileEvadeChance({ type: 'god', level: 999 })).toBeLessThan(1);
  });

  test("gives Bowman's Bane warp movement and much higher attack damage", () => {
    // Per-type stats now live in the ENEMY_STATS registry rather than an inline
    // `if (type === 'bowman_bane')` branch. Inspect that table row.
    const bowmanBlock = enemiesSource.slice(
      enemiesSource.indexOf('bowman_bane: {'),
      enemiesSource.indexOf('antony_blemmye:'),
    );

    expect(bowmanBlock).toContain('dmg: 36');
    expect(enemiesSource).toContain("if (enemy.type === 'bowman_bane') return warpBowmanBane(enemy)");
    expect(enemiesSource).toContain('damage: Math.round(enemy.dmg * 1.25)');
    expect(enemiesSource).toContain('damage: Math.round(enemy.dmg * 1.15)');
  });
});
