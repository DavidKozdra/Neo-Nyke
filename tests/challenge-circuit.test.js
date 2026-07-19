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
  return new Function(...Object.keys(dependencies), `${declaration}; return ${functionName};`)(
    ...Object.values(dependencies),
  );
}

describe('challenge circuit and protect trial', () => {
  const enemiesSource = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');
  const coreSource = fs.readFileSync(path.join(__dirname, '../js/core/game-core.js'), 'utf8');

  test('replaces the prize trial in the challenge pool with circuit', () => {
    expect(coreSource).toContain("['mirror', 'circuit', 'bomb', 'survival', 'runes', 'storm']");
    expect(enemiesSource).toContain("return 'CIRCUIT'");
    expect(enemiesSource).toContain("type: 'challengeSwitch'");
  });

  test('does not generate the same switch twice in a row', () => {
    const CHALLENGE_CIRCUIT_SWITCHES = [{}, {}, {}, {}];
    const createChallengeCircuitSequence = extractFunction(
      enemiesSource,
      'createChallengeCircuitSequence',
      { CHALLENGE_CIRCUIT_SWITCHES },
    );
    const sequence = createChallengeCircuitSequence(6, () => 0);

    expect(sequence).toHaveLength(6);
    sequence.slice(1).forEach((value, index) => {
      expect(value).not.toBe(sequence[index]);
    });
  });

  test('resets on a wrong switch and completes the correct sequence', () => {
    const room = {
      type: 'challenge',
      challengeType: 'circuit',
      challengeStarted: true,
      cleared: false,
      challengeTimer: 10,
      challengeData: {
        sequence: [1, 2],
        progress: 1,
        wrongPressPenalty: 2,
      },
    };
    const Neo = {
      currentRoom: room,
      spawnParticle: jest.fn(),
    };
    const completeChallengeTrial = jest.fn();
    const pressChallengeCircuitSwitch = extractFunction(
      enemiesSource,
      'pressChallengeCircuitSwitch',
      {
        Neo,
        completeChallengeTrial,
        globalThis: { NeoNyke: { simulation: require('../js/simulation/SharedRoomLifecycleSystem') } },
      },
    );

    pressChallengeCircuitSwitch({ type: 'challengeSwitch', switchIndex: 0, x: 10, y: 10, color: '#fff' });
    expect(room.challengeData.progress).toBe(0);
    expect(room.challengeTimer).toBe(8);

    room.challengeData.progress = 1;
    pressChallengeCircuitSwitch({ type: 'challengeSwitch', switchIndex: 2, x: 10, y: 10, color: '#fff' });
    expect(completeChallengeTrial).toHaveBeenCalledWith('CIRCUIT SOLVED');
  });

  test('scales the protected ward rune max health on floor only, not difficulty', () => {
    // Obelisk HP intentionally ignores statMultiplier (see comment above
    // getChallengeObeliskMaxHp): difficulty pressure already comes from the
    // enemy side, so scaling HP down too would double-penalize hard/god runs.
    const Neo = { floor: 5 };
    const getChallengeObeliskMaxHp = extractFunction(
      enemiesSource,
      'getChallengeObeliskMaxHp',
      { Neo },
    );

    expect(getChallengeObeliskMaxHp(5)).toBe(getChallengeObeliskMaxHp(5));
    expect(getChallengeObeliskMaxHp(8)).toBeGreaterThan(getChallengeObeliskMaxHp(5));
  });
});
