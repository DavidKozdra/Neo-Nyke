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
  const names = Object.keys(dependencies);
  const values = Object.values(dependencies);
  return new Function(...names, `${declaration}; return ${functionName};`)(...values);
}

describe('rune challenge movement', () => {
  const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const enemiesSource = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');

  test('caps rune movement at 1.2 times base player speed', () => {
    const getChallengeRuneMaxSpeed = extractFunction(worldSource, 'getChallengeRuneMaxSpeed');

    expect(getChallengeRuneMaxSpeed()).toBeCloseTo(228 * 1.2);
    expect(getChallengeRuneMaxSpeed(300)).toBeCloseTo(360);
  });

  test('keeps the standard dash faster than a fleeing rune', () => {
    const getChallengeRuneMaxSpeed = extractFunction(worldSource, 'getChallengeRuneMaxSpeed');
    const dashSpeedMatch = combatSource.match(/const dashSpeed = \((\d+) \+ Neo\.player\.attackSpeed/);

    expect(dashSpeedMatch).not.toBeNull();
    expect(Number(dashSpeedMatch[1])).toBeGreaterThan(getChallengeRuneMaxSpeed());
  });

  test('caps combined rune drift and flee movement', () => {
    const getChallengeRuneMaxSpeed = extractFunction(worldSource, 'getChallengeRuneMaxSpeed');
    const getChallengeRuneTriggerRadius = extractFunction(worldSource, 'getChallengeRuneTriggerRadius');
    const Neo = {
      pickups: [{ type: 'challengeRune', x: 600, y: 300, vx: 82, vy: 0 }],
      player: { x: 500, y: 300 },
      currentRoom: {},
      WALL: 50,
      ROOM_W: 1200,
      ROOM_H: 700,
      JESTER_PORTAL_TRIGGER_RADIUS: 42,
      LADDER_TRIGGER_RADIUS: 64,
      getItemStats: () => ({}),
      getPotionCarryCap: () => 0,
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      rand: () => 0,
    };
    const updatePickups = extractFunction(worldSource, 'updatePickups', {
      Neo,
      getChallengeRuneMaxSpeed,
      getChallengeRuneTriggerRadius,
    });
    const startX = Neo.pickups[0].x;
    const dt = 0.1;

    updatePickups(dt);

    const movementSpeed = (Neo.pickups[0].x - startX) / dt;
    expect(movementSpeed).toBeCloseTo(getChallengeRuneMaxSpeed());
  });

  test('shortens the rune timer as difficulty increases', () => {
    const Neo = {
      floor: 5,
      difficultyMultiplier: 1,
      scaleChallengeTimer(baseSeconds) {
        return Math.round(baseSeconds * this.difficultyMultiplier);
      },
    };
    const getChallengeTrialTuning = extractFunction(
      enemiesSource,
      'getChallengeTrialTuning',
      { Neo },
    );

    Neo.difficultyMultiplier = 1;
    expect(getChallengeTrialTuning('runes').timer).toBe(20);
    Neo.difficultyMultiplier = 0.95;
    expect(getChallengeTrialTuning('runes').timer).toBe(19);
    Neo.difficultyMultiplier = 0.9;
    expect(getChallengeTrialTuning('runes').timer).toBe(18);
    Neo.difficultyMultiplier = 0.85;
    expect(getChallengeTrialTuning('runes').timer).toBe(17);
    Neo.difficultyMultiplier = 0.8;
    expect(getChallengeTrialTuning('runes').timer).toBe(16);
  });
});
