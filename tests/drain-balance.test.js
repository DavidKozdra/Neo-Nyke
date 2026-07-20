const fs = require('node:fs');
const path = require('node:path');
require('../js/simulation/SharedMoveContent');

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

    // The instant proc is a flat 1 HP nibble that does NOT scale with the target's
    // max HP — a 200-HP enemy pays the same as a 20-HP one. The drain's real payoff
    // is the lingering over-time heal armed below, not this bite.
    rollToothOfThornDrain({ type: 'hunter', max: 200 });

    expect(Neo.applyPlayerHealing).toHaveBeenCalledWith(1);
    expect(Neo.player.hp).toBe(6);
    // The proc also arms the lingering per-second drain heal.
    expect(Neo.player.thornDrainTime).toBeGreaterThan(0);
    expect(Neo.player.thornDrainRate).toBeGreaterThan(0);
  });

  // The lingering drain used to be capped at enemyMax * 0.04, so a boss fight
  // trickled ~16 HP/s indefinitely (every proc also refreshed the window). The
  // rate now comes from stacks alone, which is what keeps drain from running away
  // against exactly the tanky enemies that give it the most time to tick.
  test('lingering drain rate scales with stacks, not with the target', () => {
    const makeNeo = stacks => ({
      player: { character: 'thorn_knight', hp: 5, maxHp: 120, x: 100, y: 100 },
      getItemStats: () => ({ drainChance: 1 }),
      getItemCount: key => (key === 'tooth_of_thorn' ? stacks : 0),
      nextRandom: () => 0,
      scalePlayerHealing: value => value,
      applyPlayerHealing: value => value,
      spawnHealPopup: () => {},
      spawnParticle: () => {},
      rand: () => 0,
    });
    const run = (neo, enemy) => {
      const roll = new Function(
        'Neo',
        `${extractFunction(combatSource, 'rollToothOfThornDrain')}; return rollToothOfThornDrain;`,
      )(neo);
      roll(enemy);
      return neo.player.thornDrainRate;
    };

    // A 10x tankier target must not change the rate at all.
    const weak = run(makeNeo(2), { type: 'hunter', max: 60 });
    const boss = run(makeNeo(2), { type: 'boss', max: 600 });
    expect(boss).toBe(weak);

    // Stacking Tooth is what increases it, linearly.
    expect(run(makeNeo(4), { type: 'hunter', max: 60 })).toBeCloseTo(weak * 2);

    // And the boss-fight runaway is gone: the old formula reached 600 * 0.04 = 24 HP/s.
    expect(boss).toBeLessThan(5);
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
      getItemStats: () => ({}),
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

  test('Metao can visibly proc Tooth at full HP and bank its lingering drain', () => {
    const Neo = {
      player: { character: 'metao', hp: 10, maxHp: 10, x: 100, y: 100 },
      getItemStats: () => ({ drainChance: 0.19 }),
      getEnemyProgressionLevel: () => 1,
      nextRandom: () => 0,
      scalePlayerHealing: value => value,
      applyPlayerHealing: jest.fn(() => 0),
      spawnParticle: jest.fn(),
      spawnHealPopup: jest.fn(),
    };
    const rollToothOfThornDrain = new Function(
      'Neo',
      `${extractFunction(combatSource, 'rollToothOfThornDrain')}; return rollToothOfThornDrain;`,
    )(Neo);

    rollToothOfThornDrain({ type: 'hunter', max: 200, x: 50, y: 50, r: 12 });

    expect(Neo.spawnParticle).toHaveBeenCalledWith(expect.objectContaining({ text: 'DRAIN' }));
    // A proc extends the heal window by 1s toward a 2.5s cap rather than resetting
    // it, so a single proc from cold arms 1s of drain.
    expect(Neo.player.thornDrainTime).toBe(1);
    expect(Neo.player.thornDrainRate).toBeGreaterThan(0);
  });

  test('late-game drain resistance cannot suppress more than 60% of the chance', () => {
    const Neo = {
      player: { character: 'metao', hp: 5, maxHp: 10, x: 100, y: 100 },
      getItemStats: () => ({ drainChance: 0.19 }),
      getEnemyProgressionLevel: () => 100,
      // Two Teeth plus Power Disks: (19% + 5%) * 40% = 9.6% at the cap.
      nextRandom: () => 0.095,
      scalePlayerHealing: value => value,
      applyPlayerHealing: jest.fn(value => value),
      spawnParticle: jest.fn(),
      spawnHealPopup: jest.fn(),
      rand: () => 0,
    };
    const rollToothOfThornDrain = new Function(
      'Neo',
      `${extractFunction(combatSource, 'rollToothOfThornDrain')}; return rollToothOfThornDrain;`,
    )(Neo);

    rollToothOfThornDrain({ type: 'god', max: 1000, x: 50, y: 50, r: 30 }, null, 0.05);

    expect(Neo.applyPlayerHealing).toHaveBeenCalled();
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
