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

describe('drain balance', () => {
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');

  test('Tooth of Thorn drain can proc for non-Thorn characters', () => {
    const Neo = {
      player: { character: 'princess', hp: 5, maxHp: 10, x: 100, y: 100 },
      getItemStats: () => ({ drainChance: 1 }),
      nextRandom: () => 0,
      scalePlayerHealing: value => value,
      applyPlayerHealing: jest.fn(value => {
        Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + value);
        return value;
      }),
      spawnHealPopup: jest.fn(),
      rand: () => 0,
    };
    const rollToothOfThornDrain = new Function(
      'Neo',
      `${extractFunction(combatSource, 'rollToothOfThornDrain')}; return rollToothOfThornDrain;`,
    )(Neo);

    // Proc steals a flat 1 HP plus 1% of the enemy's max HP (200 -> +2 -> 3 total).
    rollToothOfThornDrain({ type: 'hunter', max: 200 });

    expect(Neo.applyPlayerHealing).toHaveBeenCalledWith(3);
    expect(Neo.player.hp).toBe(8);
    // The proc also arms the lingering per-second drain heal.
    expect(Neo.player.thornDrainTime).toBeGreaterThan(0);
    expect(Neo.player.thornDrainRate).toBeGreaterThan(0);
  });

  test('drain bonuses do nothing without Tooth of Thorn base chance', () => {
    const Neo = {
      player: { character: 'mooggy', hp: 5, maxHp: 10, x: 100, y: 100 },
      getItemStats: () => ({ drainChance: 0, meleeDrainChance: 0 }),
      nextRandom: () => 0,
      applyPlayerHealing: jest.fn(),
    };
    const rollToothOfThornDrain = new Function(
      'Neo',
      `${extractFunction(combatSource, 'rollToothOfThornDrain')}; return rollToothOfThornDrain;`,
    )(Neo);

    rollToothOfThornDrain({ type: 'hunter' }, null, 0.05);

    expect(Neo.applyPlayerHealing).not.toHaveBeenCalled();
  });

  test('Power Disks and shards add a 5% drain chance while preserving Metao fire', () => {
    const spawned = [];
    const Neo = {
      player: { character: 'metao', x: 20, y: 30 },
      spawnProjectile: projectile => spawned.push(projectile),
    };
    const spawnPlayerDiskBurst = new Function(
      'Neo',
      `${extractFunction(combatSource, 'spawnPlayerDiskBurst')}; return spawnPlayerDiskBurst;`,
    )(Neo);

    spawnPlayerDiskBurst();

    expect(spawned).toHaveLength(8);
    expect(spawned[0].hitOptions).toMatchObject({ drainChanceBonus: 0.05, fireChance: 0.4 });
    expect(spawned[0].subSpawn.hitOptions).toMatchObject({ drainChanceBonus: 0.05, fireChance: 0.25 });
  });

  test('Nail Shot carries Tooth of Thorn drain bonus on every nail', () => {
    const spawned = [];
    const Neo = {
      player: { character: 'mooggy', x: 20, y: 30, equippedMoves: { laser: 'nail_shot' } },
      MOVE_DEFS: { nail_shot: { slot: 'laser' } },
      getDefaultMovesForCharacter: () => ({ laser: 'nail_shot' }),
      getItemStats: () => ({ projectileSpeedMultiplier: 1, projectileBounces: 0 }),
      getAnvilMoveBonus: () => 0,
      rollRicoceteBounces: () => 0,
      rng: () => 0,
      spawnProjectile: projectile => spawned.push(projectile),
      ringBurst: jest.fn(),
    };
    const getEquippedMoveDecl = extractFunction(combatSource, 'getEquippedMove');
    const castNailShot = new Function(
      'Neo',
      `${getEquippedMoveDecl}\n${extractFunction(combatSource, 'castNailShot')}; return castNailShot;`,
    )(Neo);

    castNailShot();

    expect(spawned).toHaveLength(12);
    spawned.forEach(projectile => {
      expect(projectile.kind).toBe('nail');
      expect(projectile.hitOptions).toMatchObject({ bleedChance: 0.08, drainChanceBonus: 0.05 });
    });
  });
});
