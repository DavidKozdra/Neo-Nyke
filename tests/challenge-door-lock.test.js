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

  const declaration = source.slice(start, end + 1);
  return new Function(
    ...Object.keys(dependencies),
    `${declaration}; return ${functionName};`,
  )(...Object.values(dependencies));
}

describe('challenge door lock lifecycle', () => {
  const roomsSource = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');
  const enemiesSource = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');
  const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
  const gameStateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');
  const environmentSource = fs.readFileSync(path.join(__dirname, '../js/draw/environment.js'), 'utf8');
  const Neo = { CHALLENGE_ROOM_TYPES: new Set(['challenge']) };

  const deriveChallengeLifecycleState = extractFunction(
    roomsSource,
    'deriveChallengeLifecycleState',
    { Neo },
  );
  const setChallengeLifecycleState = extractFunction(
    roomsSource,
    'setChallengeLifecycleState',
    { Neo },
  );
  const isChallengeRoomLocked = extractFunction(
    roomsSource,
    'isChallengeRoomLocked',
    { Neo, deriveChallengeLifecycleState },
  );

  test('locks on start and unlocks on every terminal challenge event', () => {
    const handlers = {};
    const eventBus = {
      on(event, handler) {
        handlers[event] = handler;
      },
    };
    const registerChallengeLifecycleLockEvents = extractFunction(
      roomsSource,
      'registerChallengeLifecycleLockEvents',
      { Neo, setChallengeLifecycleState },
    );
    const room = {
      type: 'challenge',
      challengeStarted: false,
      cleared: false,
      challengeFailed: false,
      challengeLifecycleState: 'ready',
    };

    registerChallengeLifecycleLockEvents(eventBus);

    room.challengeStarted = true;
    handlers['challenge:started']({ room });
    expect(room.challengeLifecycleState).toBe('active');
    expect(isChallengeRoomLocked(room)).toBe(true);

    room.cleared = true;
    room.challengeFailed = false;
    handlers['challenge:completed']({ room });
    expect(room.challengeLifecycleState).toBe('completed');
    expect(isChallengeRoomLocked(room)).toBe(false);

    room.cleared = false;
    room.challengeFailed = false;
    room.challengeStarted = true;
    handlers['challenge:started']({ room });
    room.cleared = true;
    room.challengeFailed = true;
    handlers['challenge:failed']({ room });
    expect(room.challengeLifecycleState).toBe('failed');
    expect(isChallengeRoomLocked(room)).toBe(false);

    room.cleared = false;
    room.challengeFailed = false;
    room.challengeStarted = false;
    handlers['challenge:reset']({ room });
    expect(room.challengeLifecycleState).toBe('ready');
    expect(isChallengeRoomLocked(room)).toBe(false);
  });

  test('keeps active legacy challenge saves locked', () => {
    const room = {
      type: 'challenge',
      challengeStarted: true,
      cleared: false,
      challengeFailed: false,
    };

    expect(deriveChallengeLifecycleState(room)).toBe('active');
    expect(isChallengeRoomLocked(room)).toBe(true);
  });

  test('self-corrects stale challenge lifecycle state from room flags', () => {
    const room = {
      type: 'challenge',
      challengeStarted: true,
      cleared: false,
      challengeFailed: false,
      challengeLifecycleState: 'ready',
    };

    expect(isChallengeRoomLocked(room)).toBe(true);
    expect(room.challengeLifecycleState).toBe('active');

    room.cleared = true;
    expect(isChallengeRoomLocked(room)).toBe(false);
    expect(room.challengeLifecycleState).toBe('completed');
  });

  test('invalidates the room background cache when challenge doors lock or unlock', () => {
    const room = {
      gx: 2,
      gy: 3,
      type: 'challenge',
      secretKind: '',
      doors: { n: true, s: false, e: true, w: false },
      challengeStarted: false,
      cleared: false,
    };
    const cacheNeo = {
      currentRoom: room,
      DIRECTIONS: ['n', 's', 'e', 'w'],
      floor: 4,
      enemies: [],
      hasVisibleRoomExit: (activeRoom, dir) => Boolean(activeRoom?.doors?.[dir]),
      isRoomLocked: () => room.challengeStarted && !room.cleared,
    };
    const getEnvironmentBackgroundCacheKey = extractFunction(
      environmentSource,
      'getEnvironmentBackgroundCacheKey',
      {
        Neo: cacheNeo,
        getStaticRoomLavaHazards: () => [],
      },
    );

    const readyKey = getEnvironmentBackgroundCacheKey();
    room.challengeStarted = true;
    const activeKey = getEnvironmentBackgroundCacheKey();
    room.cleared = true;
    const completedKey = getEnvironmentBackgroundCacheKey();

    expect(activeKey).not.toBe(readyKey);
    expect(completedKey).toBe(readyKey);
  });

  test('routes all challenge outcomes and door checks through lifecycle events', () => {
    expect(enemiesSource).toContain("Neo.gameEvents.emit('challenge:started'");
    expect(enemiesSource).toContain("Neo.gameEvents.emit('challenge:completed'");
    expect(enemiesSource).toContain("Neo.gameEvents.emit('challenge:failed'");
    expect(gameStateSource).toContain("Neo.gameEvents.emit('challenge:reset'");
    expect(worldSource.match(/Neo\.isChallengeRoomLocked\?\.\(Neo\.currentRoom\)/g)).toHaveLength(2);
  });
});
