const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);
  const signatureEnd = source.indexOf(') {', start);
  if (signatureEnd < 0) throw new Error(`Missing body for function ${functionName}`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  return source.slice(start, end + 1);
}

describe('rival health progression', () => {
  const roomsSource = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');

  function makeApplyRivalLevelStats() {
    const Neo = {
      RIVAL_LEVEL_CAP: 9,
      rivals: [],
      enemies: [],
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    };
    const applyRivalLevelStats = new Function(
      'Neo',
      'countRivalGodItems',
      'RIVAL_STARTING_LIVES',
      'RIVAL_HP_PER_LEVEL',
      'RIVAL_RETURN_HP_MULTIPLIER',
      `${extractFunction(roomsSource, 'applyRivalLevelStats')}; return applyRivalLevelStats;`,
    )(Neo, () => 0, 2, 0.12, 1.35);
    return { Neo, applyRivalLevelStats };
  }

  test('adds 12% base health for every rival level after level one', () => {
    const { applyRivalLevelStats } = makeApplyRivalLevelStats();
    const rival = { baseHp: 100, baseDmg: 10, baseSpeed: 100, baseAttackCd: 1, level: 5, lives: 2, hp: 100, max: 100 };

    applyRivalLevelStats(rival, { syncLiveEnemy: false, keepHpRatio: false });

    expect(rival.max).toBe(148);
  });

  test('ordinary carried items contribute to rival combat stats', () => {
    const { applyRivalLevelStats } = makeApplyRivalLevelStats();
    const rival = {
      baseHp: 100, baseDmg: 10, baseSpeed: 100, baseAttackCd: 1,
      level: 1, lives: 2, hp: 100, max: 100,
      loot: [{ type: 'item', key: 'one' }, { type: 'item', key: 'two' }],
    };

    applyRivalLevelStats(rival, { syncLiveEnemy: false, keepHpRatio: false });

    expect(rival.max).toBe(103);
    expect(rival.dmg).toBe(10);
  });

  test('adds the reduced return health bonus once without compounding on recalculation', () => {
    const { applyRivalLevelStats } = makeApplyRivalLevelStats();
    const rival = { baseHp: 100, baseDmg: 10, baseSpeed: 100, baseAttackCd: 1, level: 5, lives: 1, hp: 100, max: 100 };

    applyRivalLevelStats(rival, { syncLiveEnemy: false, keepHpRatio: false });
    expect(rival.max).toBe(200);

    applyRivalLevelStats(rival, { syncLiveEnemy: false, keepHpRatio: false });
    expect(rival.max).toBe(200);
  });

  test('prepares returns from both direct combat and off-screen defeats', () => {
    expect(combatSource.match(/Neo\.prepareRivalReturn\?\.\(rival\)/g)).toHaveLength(2);
  });
});
