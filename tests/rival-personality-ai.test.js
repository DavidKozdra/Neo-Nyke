const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);
  const signatureEnd = source.indexOf(') {', start);
  if (signatureEnd < 0) throw new Error(`Missing body for ${functionName}`);
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

describe('living rival personality AI', () => {
  const inputSource = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');
  const roomsSource = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');

  test.each([
    ['princess', 'honorable'],
    ['thorn_knight', 'relentless'],
    ['metao', 'opportunist'],
    ['gelleh', 'guardian'],
    ['mooggy', 'volatile'],
    ['turtle_boy', 'sentinel'],
  ])('%s defines a complete %s personality', (character, archetype) => {
    const start = inputSource.indexOf(`    ${character}: {`);
    const end = inputSource.indexOf('\n    },', start);
    const block = inputSource.slice(start, end);
    expect(block).toContain(`archetype: '${archetype}'`);
    expect(block).toContain('initialStance:');
    expect(block).toContain('reactionDelay:');
    expect(block).toContain('prediction:');
    expect(block).toContain('retreatHp:');
    expect(block).toContain('objectiveWeights:');
    expect(block).toContain('combos:');
    expect(block).toContain('barks:');
  });

  function makeDispositionHarness(personality) {
    const Neo = { floor: 3, gameElapsedTime: 0, pickups: [] };
    const getRivalPersonality = () => personality;
    const setRivalOutcome = jest.fn((rival, outcome) => { rival.brain.lastOutcome = outcome; });
    const setRivalHostile = jest.fn((rival) => {
      rival.brain.stance = 'hostile';
      rival.brain.intention = 'engage';
      return true;
    });
    const getRivalRoomKey = () => '1,1';
    const emitRivalBark = jest.fn();
    const updateRivalDisposition = new Function(
      'Neo', 'getRivalPersonality', 'setRivalOutcome', 'setRivalHostile', 'getRivalRoomKey', 'emitRivalBark',
      `${extractFunction(roomsSource, 'updateRivalDisposition')}; return updateRivalDisposition;`,
    )(Neo, getRivalPersonality, setRivalOutcome, setRivalHostile, getRivalRoomKey, emitRivalBark);
    const rival = {
      friend: false,
      vendetta: false,
      weapons: [],
      memory: { warningsGiven: 0 },
      brain: { stance: 'neutral', intention: 'observe', retreatFloor: -1, warningUntil: 0 },
    };
    const enemy = { rivalData: rival, rivalClaimedPickup: null };
    return { Neo, rival, enemy, updateRivalDisposition, setRivalHostile };
  }

  test('a guarded rival warns before becoming hostile', () => {
    const harness = makeDispositionHarness({
      archetype: 'honorable', warningDistance: 180, triggerDistance: 120, retreatHp: 0,
    });
    const perception = { distance: 110, hasLineOfSight: true, hpRatio: 1, playerHpRatio: 1, playerItemCount: 0 };

    expect(harness.updateRivalDisposition(harness.enemy, perception)).toBe('observe');
    expect(harness.rival.brain.stance).toBe('warning');
    expect(harness.rival.memory.warningsGiven).toBe(1);
    expect(harness.setRivalHostile).not.toHaveBeenCalled();

    harness.Neo.gameElapsedTime = 3;
    harness.updateRivalDisposition(harness.enemy, perception);
    expect(harness.setRivalHostile).toHaveBeenCalledWith(harness.rival, harness.enemy, 'ignored_warning');
    expect(harness.rival.brain.stance).toBe('hostile');
  });

  test('the opportunist attacks a visibly weakened player', () => {
    const harness = makeDispositionHarness({
      archetype: 'opportunist', warningDistance: 155, triggerDistance: 100, retreatHp: 0,
    });
    const perception = { distance: 250, hasLineOfSight: true, hpRatio: 1, playerHpRatio: 0.4, playerItemCount: 0 };

    harness.updateRivalDisposition(harness.enemy, perception);
    expect(harness.setRivalHostile).toHaveBeenCalledWith(harness.rival, harness.enemy, 'opportunity');
  });

  test('a wounded hostile rival chooses retreat only once per floor', () => {
    const harness = makeDispositionHarness({ archetype: 'guardian', retreatHp: 0.25 });
    harness.rival.brain.stance = 'hostile';
    const perception = { distance: 180, hasLineOfSight: true, hpRatio: 0.2, playerHpRatio: 1, playerItemCount: 0 };

    expect(harness.updateRivalDisposition(harness.enemy, perception)).toBe('retreat');
    expect(harness.rival.brain.stance).toBe('retreating');

    harness.rival.brain.stance = 'hostile';
    harness.rival.brain.retreatFloor = 3;
    expect(harness.updateRivalDisposition(harness.enemy, perception)).toBe('engage');
  });

  test('retreat transfers rooms without spending a life', () => {
    const rival = {
      hp: 20, hpSnapshot: 20, lives: 2, roomGx: 0, roomGy: 0, moveInterval: 8,
      route: ['e'], color: '#fff', vendetta: false,
      brain: { stance: 'retreating', intention: 'retreat' },
      memory: { retreats: 0 },
    };
    const enemy = {
      x: 100, y: 100, r: 16, hp: 17, rivalData: rival,
      rivalRetreatExit: { point: { x: 100, y: 100 }, room: { gx: 2, gy: 3, type: 'combat' } },
    };
    const Neo = {
      floor: 4,
      enemies: [enemy],
      steerEnemy: jest.fn(),
      spawnParticle: jest.fn(),
      scheduleRunSave: jest.fn(),
      markInventoryPanelDirty: jest.fn(),
    };
    const updateRivalRetreat = new Function(
      'Neo', 'chooseRivalRetreatExit', 'setRivalOutcome', 'emitRivalBark',
      `${extractFunction(roomsSource, 'updateRivalRetreat')}; return updateRivalRetreat;`,
    )(
      Neo,
      jest.fn(),
      (target, outcome) => { target.brain.lastOutcome = outcome; target.memory.lastOutcome = outcome; },
      jest.fn(),
    );

    expect(updateRivalRetreat(enemy, 0.016, 100)).toBe(true);
    expect(Neo.enemies).toHaveLength(0);
    expect(rival).toMatchObject({ hp: 17, hpSnapshot: 17, lives: 2, roomGx: 2, roomGy: 3 });
    expect(rival.memory.retreats).toBe(1);
  });

  test('perception reads observed state rather than controls', () => {
    const perceptionSource = extractFunction(roomsSource, 'getRivalPerception');
    expect(perceptionSource).toContain('player.vx');
    expect(perceptionSource).toContain('player.vy');
    expect(perceptionSource).not.toMatch(/Neo\.(keys|input|mouse|controls)/);
  });

  test('older saves receive safe memory and brain defaults', () => {
    const createDefaultRivalMemory = new Function(
      `${extractFunction(roomsSource, 'createDefaultRivalMemory')}; return createDefaultRivalMemory;`,
    )();
    const normalizeRivalMemory = new Function(
      'createDefaultRivalMemory',
      `${extractFunction(roomsSource, 'normalizeRivalMemory')}; return normalizeRivalMemory;`,
    )(createDefaultRivalMemory);
    const getRivalPersonality = () => ({ initialStance: 'guarded' });
    const createDefaultRivalBrain = new Function(
      'getRivalPersonality',
      `${extractFunction(roomsSource, 'createDefaultRivalBrain')}; return createDefaultRivalBrain;`,
    )(getRivalPersonality);
    const normalizeRivalBrain = new Function(
      'createDefaultRivalBrain',
      `${extractFunction(roomsSource, 'normalizeRivalBrain')}; return normalizeRivalBrain;`,
    )(createDefaultRivalBrain);

    expect(normalizeRivalMemory({ playerSightings: 2 })).toMatchObject({
      playerSightings: 2,
      encounters: 0,
      warningsGiven: 0,
      provocations: 0,
      retreats: 0,
      lastOutcome: 'No encounter yet',
      recentMoves: [],
    });
    expect(normalizeRivalBrain(null, 'princess')).toMatchObject({
      stance: 'neutral',
      intention: 'observe',
      retreatFloor: -1,
      claimedLoot: null,
    });
  });
});
