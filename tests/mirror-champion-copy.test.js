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

describe('mirror champion exact copy', () => {
  const enemiesSource = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');

  test('copies current player stats instead of applying champion boosts', () => {
    const declarations = [
      'clonePlainObject',
      'createMirrorInventorySnapshot',
      'getMirrorInventoryItemStats',
      'getMirrorAnvilBonus',
      'getMirrorWeaponCooldown',
      'getMirrorBaseDamage',
      'getMirrorAttackSpeed',
      'getMirrorChampionStats',
    ].map(name => extractFunction(enemiesSource, name)).join('\n');
    const player = {
      character: 'thorn_knight',
      hp: 37,
      maxHp: 100,
      level: 9,
      attackPower: 12,
      attackSpeed: 1.5,
      princessFlightTime: 2,
      mooggyZoomiesTime: 0,
      weaponCooldown: 0.7,
      inv: 0.2,
      overhealBarrier: 14,
      statuses: { bleed: { stacks: 2, time: 3 } },
      items: {},
      ownedMoves: {},
      ownedWeapons: {},
      equippedWeapon: '',
      equippedMoves: {
        melee: 'slash',
        laser: 'blood_beam',
        smash: 'crimson_smash',
        dash: 'dash',
      },
      anvilUpgrades: { weapon: {}, move: {} },
    };
    const cooldowns = { melee: 0.4, laser: 3.2, smash: 4.5, dash: 3.2 };
    const current = { melee: 0.15, laser: 1.1, smash: 2.2, dash: 0 };
    const Neo = {
      player,
      chosenCharacter: player.character,
      ITEM_KEYS: [],
      ITEM_DEFS: {},
      CHARACTER_DEFS: { thorn_knight: { damageMultiplier: 1 } },
      MOVE_BASE_STATS: {
        slash: { damage: 24, cooldown: 0.4 },
        blood_beam: { damage: 12, cooldown: 3.2 },
        crimson_smash: { damage: 38, cooldown: 4.5 },
        dash: { damage: 8, cooldown: 3.2 },
      },
      WEAPON_BASE_STATS: {},
      WEAPON_UPGRADEABLE_STATS: {},
      MOVE_UPGRADEABLE_STATS: {},
      ATTACKS: {
        melee: { damage: 24, range: 90, push: 180, baseCooldown: 0.5 },
        laser: { baseCooldown: 3.2 },
        smash: { baseCooldown: 4.5 },
      },
      getDefaultMovesForCharacter: () => ({ ...player.equippedMoves }),
      getItemStats: () => ({
        moveSpeedMultiplier: 1.5,
        attackSpeedMultiplier: 1.2,
        beamDamageMultiplier: 1,
        aoeDamageMultiplier: 1,
        damageReduction: 0.25,
        stunResistance: 2,
      }),
      getAttackSpeedValue: () => 1.8,
      getPlayerBaseDamage: () => 36,
      getSlotCooldownDuration: slot => cooldowns[slot],
      getSkillCooldownInfo: slot => ({ current: current[slot] }),
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      godTimer: 0,
      laserActive: false,
    };
    const getStats = new Function('Neo', `${declarations}; return getMirrorChampionStats;`)(Neo);

    const stats = getStats();

    expect(stats.hp).toBe(37);
    expect(stats.maxHp).toBe(100);
    expect(stats.speed).toBe(684);
    expect(stats.attackSpeed).toBe(1.8);
    expect(stats.attackCd).toBe(0.7);
    expect(stats.mirrorCooldowns).toEqual(cooldowns);
    expect(stats.currentCooldowns).toEqual(current);
    expect(stats.inventory.playerState).toEqual(player);
  });

  test('does not apply generic enemy progression resistance to an exact mirror', () => {
    const getEnemyDamageTakenMultiplier = new Function(
      'Neo',
      `${extractFunction(combatSource, 'getEnemyDamageTakenMultiplier')}; return getEnemyDamageTakenMultiplier;`,
    )({
      getDifficultyDef: () => ({ enemyLoopDamageReduction: 0.1 }),
    });

    expect(getEnemyDamageTakenMultiplier({ mirrorExactCopy: true })).toBe(1);

    const getEnemyCcLevel = new Function(
      'Neo',
      `${extractFunction(combatSource, 'getEnemyCcLevel')}; return getEnemyCcLevel;`,
    )({
      getDifficultyDef: () => ({ ccResistScale: 1 }),
      getProgressionDepth: () => 100,
      MAX_FLOOR: 10,
      gameElapsedTime: 3600,
    });

    expect(getEnemyCcLevel({ mirrorExactCopy: true })).toBe(0);
  });

  test('spawns with copied defenses, barrier, status, and current cooldowns', () => {
    const spawnBlock = enemiesSource.slice(
      enemiesSource.indexOf('function spawnMirrorChampion'),
      enemiesSource.indexOf('function spawnMooggyAssassin'),
    );

    expect(spawnBlock).toContain('max: stats.maxHp');
    expect(spawnBlock).toContain('barrier: stats.inventory.overhealBarrier');
    expect(spawnBlock).toContain('statuses: { ...Neo.createStatusMap(), ...stats.inventory.statuses }');
    expect(spawnBlock).toContain('mirrorLaserCd: stats.currentCooldowns.laser');
    expect(spawnBlock).toContain('mirrorExactCopy: true');
    expect(spawnBlock).not.toContain('stats.mirrorCooldowns.laser * 0.45');
  });
});
