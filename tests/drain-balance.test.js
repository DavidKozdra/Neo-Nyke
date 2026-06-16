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

    rollToothOfThornDrain({ type: 'hunter' });

    expect(Neo.applyPlayerHealing).toHaveBeenCalledWith(1);
    expect(Neo.player.hp).toBe(6);
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
});
