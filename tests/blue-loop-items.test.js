const fs = require('node:fs');
const path = require('node:path');

function loadInputData() {
  const source = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');
  const dataSource = source
    .slice(0, source.indexOf('export const ui ='))
    .replace(/\bexport\s+/g, '');
  return new Function(
    'Neo',
    `${dataSource}; return { ITEM_DEFS, ITEM_DROP_WEIGHTS, ELITE_INVENTORY_POOL, BLUE_ITEM_POOL, getRarityDisplayName };`,
  )({
    buildWeightTable(entries) {
      return entries;
    },
  });
}

function extractFunction(sourcePath, functionName, dependencies = {}) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const exportPrefix = `export function ${functionName}`;
  const plainPrefix = `function ${functionName}`;
  const start = source.indexOf(exportPrefix) >= 0
    ? source.indexOf(exportPrefix)
    : source.indexOf(plainPrefix);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }

  const declaration = source
    .slice(start, end + 1)
    .replace('export function', 'function');
  const names = Object.keys(dependencies);
  const values = Object.values(dependencies);
  return new Function(...names, `${declaration}; return ${functionName};`)(...values);
}

describe('loop-exclusive Blue relics', () => {
  const inputData = loadInputData();
  const playerPath = path.join(__dirname, '../js/game/player.js');
  const worldPath = path.join(__dirname, '../js/game/world.js');
  const combatPath = path.join(__dirname, '../js/game/combat.js');
  const statusPath = path.join(__dirname, '../js/core/status.js');

  test('defines exactly the requested three-item Blue choice pool', () => {
    expect(inputData.BLUE_ITEM_POOL).toEqual(expect.arrayContaining([
      'artificer_charger',
      'rich_mans_blues',
      'cloak_of_naked_king',
    ]));
    expect(inputData.BLUE_ITEM_POOL).toHaveLength(3);
    inputData.BLUE_ITEM_POOL.forEach(key => {
      expect(inputData.ITEM_DEFS[key]?.rarity).toBe('blue');
      expect(inputData.ITEM_DROP_WEIGHTS.some(([dropKey]) => dropKey === key)).toBe(false);
      expect(inputData.ELITE_INVENTORY_POOL).not.toContain(key);
    });
  });

  test("keeps Rich Man's Luck separate from Rich Man's Blues", () => {
    const luck = inputData.ITEM_DEFS.rich_mans_luck;
    const blues = inputData.ITEM_DEFS.rich_mans_blues;

    expect(luck).toEqual(expect.objectContaining({
      name: "Rich Man's Luck",
      rarity: 'god',
      shortName: 'Shop + Drops',
    }));
    expect(blues).toEqual(expect.objectContaining({
      name: "Rich Man's Blues",
      rarity: 'blue',
      shortName: 'Loop Crystals',
    }));
    expect(inputData.ITEM_DROP_WEIGHTS).toContainEqual(['rich_mans_luck', 5]);
    expect(inputData.ITEM_DROP_WEIGHTS.some(([key]) => key === 'rich_mans_blues')).toBe(false);
    expect(inputData.ELITE_INVENTORY_POOL).toContain('rich_mans_luck');
    expect(inputData.ELITE_INVENTORY_POOL).not.toContain('rich_mans_blues');
  });

  test('labels the internal Blue rarity as Artificer', () => {
    expect(inputData.getRarityDisplayName('blue')).toBe('Artificer');
    inputData.BLUE_ITEM_POOL.forEach(key => {
      expect(inputData.ITEM_DEFS[key]?.category).toBe('artificer');
      expect(inputData.ITEM_DEFS[key]?.tags).toContain('artificer');
      expect(inputData.ITEM_DEFS[key]?.tags).not.toContain('blue');
    });
  });

  test('spawns one choice group containing all three Blue relics each loop', () => {
    const Neo = {
      BLUE_ITEM_POOL: inputData.BLUE_ITEM_POOL,
      currentRoom: {},
      pickups: [],
      runLoopIndex: 2,
      ROOM_W: 960,
      ROOM_H: 540,
      createScopedRandom: jest.fn(() => () => 0.5),
      shuffleWithRandom: items => items.slice(),
      spawnParticle: jest.fn(),
    };
    const spawnChoices = extractFunction(worldPath, 'spawnLoopBlueRewardChoices', { Neo });

    spawnChoices();

    expect(Neo.pickups).toHaveLength(3);
    expect(Neo.pickups.every(pickup => (
      pickup.type === 'rewardChoice'
      && pickup.picksRemaining === 1
      && pickup.groupId === 'loop-blue:2'
    ))).toBe(true);
    expect(Neo.pickups.map(pickup => pickup.key)).toEqual(inputData.BLUE_ITEM_POOL);
    expect(Neo.spawnParticle).toHaveBeenCalledWith(expect.objectContaining({
      text: 'CHOOSE 1 ARTIFICER RELIC',
    }));
  });

  test('uses the requested Artificer and cloak scaling formulas', () => {
    const getArtificerLevelGains = extractFunction(playerPath, 'getArtificerLevelGains');
    const getCloakDamageReductionBonus = extractFunction(playerPath, 'getCloakDamageReductionBonus');
    const countOwnedToolStacks = extractFunction(playerPath, 'countOwnedToolStacks');

    expect(getArtificerLevelGains(1)).toEqual({
      maxHp: 16,
      attackPower: 4,
      attackSpeed: 0.02,
    });
    expect(countOwnedToolStacks(
      { equipped_tool: 1, unequipped_tool: 2, relic: 9 },
      { equipped_tool: { tool: true }, unequipped_tool: { tool: true }, relic: {} },
    )).toBe(3);
    expect(getCloakDamageReductionBonus(1, 3)).toBeCloseTo(0.53);
    expect(getCloakDamageReductionBonus(2, 3)).toBeCloseTo(1.03);
  });

  test("calculates Rich Man's Blues pickup crystals from floor and stacks", () => {
    const getReward = extractFunction(playerPath, 'getRichMansBluesCrystalReward');

    expect(getReward(1, 1)).toBe(27);
    expect(getReward(10, 2)).toBe(90);
  });

  test("routes only Rich Man's Blues into crystal rewards", () => {
    const source = fs.readFileSync(combatPath, 'utf8');

    expect(source).toContain("Neo.getItemCount('rich_mans_blues')");
    expect(source).toContain("if (itemKey === 'rich_mans_blues') grantRichMansBluesPickupCrystals(collectCount)");
    expect(source).not.toContain("if (itemKey === 'rich_mans_luck') grantRichMansBluesPickupCrystals");
  });

  test('final God death force-kills surviving bosses without room-clear rewards', () => {
    const source = fs.readFileSync(combatPath, 'utf8');

    expect(source).toContain("if (Neo.currentRoom?.type === 'god')");
    expect(source).toContain('const survivingBosses = Neo.enemies.filter');
    expect(source).toContain("onEnemyDie(other, { forceDeath: true, suppressRoomClear: true });");
  });

  test('wires Artificer size scaling and lethal second-stack behavior', () => {
    const playerSource = fs.readFileSync(playerPath, 'utf8');
    const combatSource = fs.readFileSync(combatPath, 'utf8');

    expect(playerSource).toContain('(artificerCharger > 0 ? 1.267 : 1)');
    expect(playerSource).toContain('beamWidthMultiplier: artificerCharger > 0 ? 1.05 : 1');
    expect(combatSource).toContain('if (previousCount + collectCount >= 2)');
    expect(combatSource).toContain("Neo.lastDamageSourceKey = 'artificer_charger'");
  });

  test('makes negative status proc chance 20% worse per cloak stack', () => {
    const Neo = {
      getItemStats: () => ({ negativeStatusMultiplier: 1.2 }),
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    };
    const getProcChance = extractFunction(
      statusPath,
      'getPlayerNegativeStatusProcChance',
      { Neo },
    );

    expect(getProcChance(0.5)).toBeCloseTo(0.6);
    expect(getProcChance(1)).toBe(1);
  });
});
