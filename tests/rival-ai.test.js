const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);
  const signatureEnd = source.indexOf(') {', start);
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

describe('rival full-kit tactical AI', () => {
  const inputSource = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');
  const roomsSource = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');

  const Neo = { clamp: (value, min, max) => Math.max(min, Math.min(max, value)) };
  const scoreRivalWeapon = new Function(
    'Neo',
    `${extractFunction(roomsSource, 'scoreRivalWeapon')}; return scoreRivalWeapon;`,
  )(Neo);

  test.each([
    ['princess', 'flying_unhitable'],
    ['thorn_knight', "key: 'dash'"],
    ['metao', 'warp'],
    ['gelleh', 'healing_zone'],
    ['mooggy', 'mooggy_zoomies'],
    ['turtle_boy', 'death_ball'],
  ])('%s has its previously missing fourth kit move', (character, move) => {
    const start = inputSource.indexOf(`    ${character}: [`);
    const end = inputSource.indexOf('\n    ],', start);
    expect(start).toBeGreaterThan(-1);
    expect(inputSource.slice(start, end)).toContain(move);
    expect(inputSource.slice(start, end).match(/slot: '(melee|laser|smash|dash)'/g)).toHaveLength(4);
  });

  test('prefers a clear ranged shot over firing into a wall', () => {
    const ranged = { key: 'beam', class: 'ranged', preferredRange: 250 };
    const clear = scoreRivalWeapon(ranged, { distance: 250, hpRatio: 1, hasLineOfSight: true });
    const blocked = scoreRivalWeapon(ranged, { distance: 250, hpRatio: 1, hasLineOfSight: false });
    expect(blocked - clear).toBe(520);
  });

  test('reserves healing for low health and discourages repeating a move', () => {
    const heal = { key: 'healing_zone', class: 'heal', preferredRange: 210 };
    expect(scoreRivalWeapon(heal, { distance: 210, hpRatio: 0.4 })).toBeLessThan(100);
    expect(scoreRivalWeapon(heal, { distance: 210, hpRatio: 0.9 })).toBe(10000);

    const melee = { key: 'slash', class: 'melee', preferredRange: 100 };
    const fresh = scoreRivalWeapon(melee, { distance: 100, hpRatio: 1 });
    const repeated = scoreRivalWeapon(melee, { distance: 100, hpRatio: 1, lastWeaponKey: 'slash' });
    expect(repeated - fresh).toBe(70);
  });

  test('migrates stored rivals through the slot-aware loadout normalizer', () => {
    expect(roomsSource).toContain('weapons: normalizeRivalLoadout(source.characterKey, source.weapons)');
    expect(roomsSource).toContain("return ['melee', 'laser', 'smash', 'dash']");
  });
});
