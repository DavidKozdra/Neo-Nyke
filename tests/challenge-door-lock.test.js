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

    handlers['challenge:started']({ room });
    expect(room.challengeLifecycleState).toBe('active');
    expect(isChallengeRoomLocked(room)).toBe(true);

    handlers['challenge:completed']({ room });
    expect(room.challengeLifecycleState).toBe('completed');
    expect(isChallengeRoomLocked(room)).toBe(false);

    handlers['challenge:started']({ room });
    handlers['challenge:failed']({ room });
    expect(room.challengeLifecycleState).toBe('failed');
    expect(isChallengeRoomLocked(room)).toBe(false);

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

  test('routes all challenge outcomes and door checks through lifecycle events', () => {
    expect(enemiesSource).toContain("Neo.gameEvents.emit('challenge:started'");
    expect(enemiesSource).toContain("Neo.gameEvents.emit('challenge:completed'");
    expect(enemiesSource).toContain("Neo.gameEvents.emit('challenge:failed'");
    expect(gameStateSource).toContain("Neo.gameEvents.emit('challenge:reset'");
    expect(worldSource.match(/Neo\.isChallengeRoomLocked\?\.\(Neo\.currentRoom\)/g)).toHaveLength(2);
  });
});
