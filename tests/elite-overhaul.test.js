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

const enemiesSource = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');
const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
const gameStateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');

const ELITE_POWER_POOL = ['lazered', 'enflamed', 'breezy', 'gross', 'nothing', 'giant', 'blessed'];
const STATUS_KEYS = ['bleed', 'fire', 'poison', 'dark_drain', 'slow', 'static'];

function baseNeo(overrides = {}) {
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    rand: (a, b) => a,
    ELITE_KNIGHT_SPEED_CAP: 1.6,
    STATUS_KEYS,
    ...overrides,
  };
}

// Build rollEliteTypes + applyEliteTypes together so applyEliteTypes can call the
// roller and share ELITE_POWER_POOL / getEnemyProgressionLevel.
function buildElite(Neo, { irandSeq = [], nextRandomSeq = [] } = {}) {
  let irandI = 0;
  let nextI = 0;
  Neo.irand = (lo, hi) => {
    const v = irandSeq.length ? irandSeq[irandI % irandSeq.length] : lo;
    irandI += 1;
    return v;
  };
  Neo.nextRandom = () => {
    const v = nextRandomSeq.length ? nextRandomSeq[nextI % nextRandomSeq.length] : 0;
    nextI += 1;
    return v;
  };
  const rollDecl = extractFunction(enemiesSource, 'rollEliteTypes');
  const applyDecl = extractFunction(enemiesSource, 'applyEliteTypes');
  const factory = new Function(
    'Neo', 'ELITE_POWER_POOL', 'getEnemyProgressionLevel', 'applyEliteInventory', 'rollBlessedEliteInventory',
    `${rollDecl}\n${applyDecl}\nreturn { rollEliteTypes, applyEliteTypes };`,
  );
  return factory(
    Neo,
    ELITE_POWER_POOL,
    enemy => Math.max(1, Number(enemy?.level) || 1),
    () => {},
    () => ({}),
  );
}

describe('elite body rolls (Knight / Knave)', () => {
  test('rolls one body token per level plus level % 3 powers', () => {
    const Neo = baseNeo();
    // nextRandom < 0.5 => knight; force all knight. irand for power picks -> index 4 (nothing)
    const { rollEliteTypes } = buildElite(Neo, { nextRandomSeq: [0], irandSeq: [4] });
    const tokens = rollEliteTypes({ level: 4 });
    const body = tokens.filter(t => t === 'knight' || t === 'knave');
    const powers = tokens.filter(t => ELITE_POWER_POOL.includes(t));
    expect(body).toHaveLength(4);
    expect(powers).toHaveLength(4 % 3); // 1
  });

  test('all-Knight scales hp and damage by 1.2^knight', () => {
    const Neo = baseNeo();
    const { applyEliteTypes } = buildElite(Neo, { nextRandomSeq: [0] }); // all knight, level%3=0 -> no powers at level 5? 5%3=2
    // level 5 -> 5 body + 2 powers; force powers to 'nothing' (index 4)
    const elite = buildElite(baseNeo(), { nextRandomSeq: [0], irandSeq: [4] });
    const enemy = { elite: true, level: 5, hp: 100, max: 100, dmg: 10, speed: 100, r: 16 };
    elite.applyEliteTypes(enemy);
    expect(enemy.eliteBody.knight).toBe(5);
    expect(enemy.eliteBody.knave).toBe(0);
    expect(enemy.eliteKnightMult).toBeCloseTo(Math.pow(1.2, 5), 5);
    // base elite doubles HP, then knight mult on top
    expect(enemy.max).toBe(Math.round(100 * 2 * Math.pow(1.2, 5)));
    expect(enemy.dmg).toBe(Math.round(10 * Math.pow(1.2, 5)));
  });

  test('speed multiplier is clamped to ELITE_KNIGHT_SPEED_CAP', () => {
    const elite = buildElite(baseNeo(), { nextRandomSeq: [0], irandSeq: [4] });
    const enemy = { elite: true, level: 12, hp: 100, max: 100, dmg: 10, speed: 100, r: 16 };
    elite.applyEliteTypes(enemy);
    // 1.2^12 ~ 8.9, but speed should be clamped at 1.6x
    expect(enemy.speed).toBeCloseTo(100 * 1.6, 5);
  });

  test('all-Knave grants unfazed count and accumulates +1% status resist', () => {
    // nextRandom >= 0.5 => knave; force all knave. irand for status keys + power picks.
    const elite = buildElite(baseNeo(), { nextRandomSeq: [0.9], irandSeq: [0] });
    const enemy = { elite: true, level: 5, hp: 100, max: 100, dmg: 10, speed: 100, r: 16 };
    elite.applyEliteTypes(enemy);
    expect(enemy.eliteBody.knave).toBe(5);
    expect(enemy.eliteUnfazed).toBe(5);
    // irand=0 -> status key 'bleed' picked every time -> 5 * 0.01
    expect(enemy.statusResistances.bleed).toBeCloseTo(0.05, 5);
  });
});

describe('elite power rolls', () => {
  test('duplicate Enflamed stacks the fire proc chance', () => {
    // level 2 -> 2 body + (2%3=2) powers; force powers to enflamed (index 1)
    const elite = buildElite(baseNeo(), { nextRandomSeq: [0], irandSeq: [1] });
    const enemy = { elite: true, level: 2, hp: 100, max: 100, dmg: 10, speed: 100, r: 16 };
    elite.applyEliteTypes(enemy);
    expect(enemy.elitePowers.filter(p => p === 'enflamed')).toHaveLength(2);
    expect(enemy.eliteProcs.fire).toBeCloseTo(0.30, 5);
  });

  test('giant adds 50% HP and a larger radius; blessed sets crit', () => {
    // level 2 -> 2 powers; alternate giant(5) then blessed(6)
    const elite = buildElite(baseNeo(), { nextRandomSeq: [0], irandSeq: [5, 6] });
    const enemy = { elite: true, level: 2, hp: 100, max: 100, dmg: 10, speed: 100, r: 20 };
    elite.applyEliteTypes(enemy);
    expect(enemy.elitePowers).toEqual(expect.arrayContaining(['giant', 'blessed']));
    expect(enemy.eliteCrit).toBe(0.25);
    expect(enemy.r).toBe(Math.round(20 * 1.6));
  });

  test('breezy reduces cold (slow) effectiveness against the elite', () => {
    const elite = buildElite(baseNeo(), { nextRandomSeq: [0], irandSeq: [2] }); // breezy index 2
    const enemy = { elite: true, level: 2, hp: 100, max: 100, dmg: 10, speed: 100, r: 16 };
    elite.applyEliteTypes(enemy);
    expect(enemy.eliteProcs.cold).toBeCloseTo(0.30, 5);
    expect(enemy.statusResistances.slow).toBeCloseTo(0.60, 5); // 2 breezy * 0.30
  });
});

describe('applyEliteProcsToPlayer', () => {
  function buildProcs(Neo) {
    const decl = extractFunction(combatSource, 'applyEliteProcsToPlayer');
    return new Function(
      'Neo', 'applyFire', 'applyPoison',
      `${decl}; return applyEliteProcsToPlayer;`,
    )(Neo, Neo.applyFire, Neo.applyPoison);
  }

  test('rolls each proc against its chance and applies the matching status', () => {
    const calls = [];
    const Neo = baseNeo({
      player: { id: 'player' },
      nextRandom: () => 0.1, // below all proc chances -> all fire
      applyFire: (...a) => calls.push(['fire', ...a]),
      applyPoison: (...a) => calls.push(['poison', ...a]),
      applyStatus: (...a) => calls.push(['status', ...a]),
    });
    const fn = buildProcs(Neo);
    fn({ type: 'hunter', eliteProcs: { fire: 0.15, poison: 0.15, cold: 0.15 } });
    expect(calls.map(c => c[0])).toEqual(['fire', 'poison', 'status']);
    expect(calls.find(c => c[0] === 'status')[2]).toBe('slow');
  });

  test('does nothing when chances are zero', () => {
    const calls = [];
    const Neo = baseNeo({
      player: { id: 'player' },
      nextRandom: () => 0.0,
      applyFire: () => calls.push('fire'),
      applyPoison: () => calls.push('poison'),
      applyStatus: () => calls.push('status'),
    });
    const fn = buildProcs(Neo);
    fn({ type: 'hunter', eliteProcs: { fire: 0, poison: 0, cold: 0 } });
    expect(calls).toHaveLength(0);
  });
});

describe('getEliteEnemyLabel', () => {
  function buildLabel(eliteDefs) {
    const decl = extractFunction(gameStateSource, 'getEliteEnemyLabel');
    return new Function(
      'Neo', 'getEnemyLabel', 'titleCase', 'ELITE_COUNT_WORDS',
      `${decl}; return getEliteEnemyLabel;`,
    )(
      { ELITE_TYPE_DEFS: eliteDefs },
      type => type.charAt(0).toUpperCase() + type.slice(1),
      s => s.charAt(0).toUpperCase() + s.slice(1),
      { 2: 'twice', 3: 'thrice' },
    );
  }

  const defs = {
    lazered: { label: 'Lazered' },
    enflamed: { label: 'Enflamed' },
    breezy: { label: 'Breezy' },
    gross: { label: 'Gross' },
    nothing: { label: 'Nothing' },
  };

  test('shows power words with Elite but omits body rolls, counting duplicates', () => {
    const enemy = {
      elite: true,
      type: 'golem',
      eliteTypes: ['knave', 'knight', 'breezy', 'gross', 'gross', 'enflamed'],
      eliteBody: { knight: 1, knave: 1 },
      elitePowers: ['breezy', 'gross', 'gross', 'enflamed'],
    };
    expect(buildLabel(defs)(enemy)).toBe('Breezy Gross twice Enflamed Elite Golem');
  });

  test('shows Nothing power and Elite for a plain elite (no body word)', () => {
    const enemy = {
      elite: true,
      type: 'summoner',
      eliteTypes: ['knave', 'nothing'],
      eliteBody: { knight: 0, knave: 1 },
      elitePowers: ['nothing'],
    };
    expect(buildLabel(defs)(enemy)).toBe('Nothing Elite Summoner');
  });

  test('elite with no power rolls is just "Elite <Name>"', () => {
    const enemy = {
      elite: true,
      type: 'hunter',
      eliteTypes: ['knight', 'knave', 'knight'],
      eliteBody: { knight: 2, knave: 1 },
      elitePowers: [],
    };
    expect(buildLabel(defs)(enemy)).toBe('Elite Hunter');
  });
});
