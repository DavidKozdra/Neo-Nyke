const fs = require('node:fs');
const path = require('node:path');
const { RandomService } = require('../js/simulation/RandomService');
const { stockCampaignShop } = require('../js/simulation/SharedShopSystem');

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

describe('God difficulty progression rules', () => {
  const coreSource = fs.readFileSync(path.join(__dirname, '../js/core/game-core.js'), 'utf8');
  const gameStateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');
  const roomsSource = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');
  const enemiesSource = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');

  test('defines the post-Impossible scarcity and progression settings', () => {
    const godBlock = coreSource.slice(
      coreSource.indexOf('  god: {'),
      coreSource.indexOf('  custom: {'),
    );

    expect(godBlock).toContain('itemDropChanceMultiplier: 0.3');
    expect(godBlock).toContain('shopItemOffers: 1');
    expect(godBlock).toContain('startRoomEliteCount: 2');
    expect(godBlock).toContain('rivalItemsPerFloor: 5');
    expect(godBlock).toContain('rivalLevelBonusPerFloor: 2');
  });

  test('reduces random relic chances to 30% while retaining item bonuses', () => {
    const Neo = {
      getDifficultyDef: () => ({ itemDropChanceMultiplier: 0.3 }),
      getItemStats: () => ({ itemDropChanceBonus: 0.08 }),
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    };
    const getRandomItemDropChance = new Function(
      'Neo',
      `${extractFunction(gameStateSource, 'getRandomItemDropChance')}; return getRandomItemDropChance;`,
    )(Neo);

    expect(getRandomItemDropChance(0.12, 0.5)).toBeCloseTo(0.06);
    expect(getRandomItemDropChance(0.9, 0.98)).toBeCloseTo(0.294);
  });

  test('creates one base relic offer in God shops', () => {
    const room = { id: 'god-shop', type: 'shop' };
    stockCampaignShop(
      { floorNumber: 1, elapsedSeconds: 0, matchRules: { shopItemOffers: 1 } },
      room,
      { items: {}, itemStats: { shopExtraItemOffers: 0 }, ownedMoves: {}, ownedWeapons: {} },
      new RandomService({ matchSeed: 'god-shop' }).stream('shop'),
    );

    expect(room.shopOffers.filter(offer => offer.type === 'item')).toHaveLength(1);
  });

  test('marks every generated start room for a two-elite ambush', () => {
    const room = { type: 'start', cleared: true };
    const Neo = {
      getDifficultyDef: () => ({ startRoomEliteCount: 2 }),
    };
    const configureStartRoomDifficultyEncounter = new Function(
      'Neo',
      `${extractFunction(roomsSource, 'configureStartRoomDifficultyEncounter')}; return configureStartRoomDifficultyEncounter;`,
    )(Neo);

    expect(configureStartRoomDifficultyEncounter(room)).toBe(2);
    expect(room).toMatchObject({ cleared: false, startRoomEliteCount: 2 });
    expect(roomsSource).toContain("Neo.spawnWave(Number(room.startRoomEliteCount), 'combat', { forceElite: true, suppressMiniBoss: true })");
    expect(enemiesSource).toContain('options.forceElite || canSpawnEliteEnemies()');
  });

  test('grants every active rival five items and two capped levels per floor', () => {
    const Neo = {
      RIVAL_LEVEL_CAP: 9,
      rivals: [
        { level: 3, xp: 5, dead: false },
        { level: 8, xp: 5, dead: false },
        { level: 2, xp: 5, dead: true },
      ],
      getDifficultyDef: () => ({
        rivalItemsPerFloor: 5,
        rivalLevelBonusPerFloor: 2,
      }),
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    };
    const applyRivalLevelStats = jest.fn();
    const grantRivalItems = jest.fn();
    const applyRivalDifficultyFloorBonuses = new Function(
      'Neo',
      'applyRivalLevelStats',
      'grantRivalItems',
      `${extractFunction(roomsSource, 'applyRivalDifficultyFloorBonuses')}; return applyRivalDifficultyFloorBonuses;`,
    )(Neo, applyRivalLevelStats, grantRivalItems);

    applyRivalDifficultyFloorBonuses();

    expect(Neo.rivals.map(rival => rival.level)).toEqual([5, 9, 2]);
    expect(Neo.rivals[1].xp).toBe(0);
    expect(grantRivalItems).toHaveBeenCalledTimes(2);
    expect(grantRivalItems).toHaveBeenNthCalledWith(1, Neo.rivals[0], 5, { syncLiveEnemy: false });
    expect(grantRivalItems).toHaveBeenNthCalledWith(2, Neo.rivals[1], 5, { syncLiveEnemy: false });
  });
});
