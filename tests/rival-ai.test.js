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
  const drawSource = fs.readFileSync(path.join(__dirname, '../js/draw/entities.js'), 'utf8');
  const propsSource = fs.readFileSync(path.join(__dirname, '../js/draw/props.js'), 'utf8');

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

  test('never selects a kit slot that is still cooling down', () => {
    const ready = { key: 'blade_justice', slot: 'laser', class: 'melee', preferredRange: 105 };
    expect(scoreRivalWeapon(ready, { distance: 105, slotCooldown: 0 })).toBeLessThan(100);
    expect(scoreRivalWeapon(ready, { distance: 105, slotCooldown: 2.4 })).toBeGreaterThan(20000);
  });

  test('Rival Rumble duelists spawn hostile and Gelleh carries accurate Blade Justice', () => {
    const stateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');
    expect(stateSource).toContain("stance: 'hostile', intention: 'engage'");
    const gellehStart = inputSource.indexOf('    gelleh: [');
    const gellehEnd = inputSource.indexOf('\n    ],', gellehStart);
    const gellehKit = inputSource.slice(gellehStart, gellehEnd);
    expect(gellehKit).toContain("key: 'blade_justice'");
    expect(gellehKit).toContain('cooldown: 3.8');
    expect(stateSource).toContain('const startingLoot = Neo.createRivalStartingLoot?.(resolvedKey) || []');
    expect(stateSource).toContain('const progressionItems = Math.floor(Math.max(0, level - 1) / 2)');
    expect(stateSource).toContain('rival.hpSnapshot = rival.max');
  });

  test('migrates stored rivals through the slot-aware loadout normalizer', () => {
    expect(roomsSource).toContain('weapons: normalizeRivalLoadout(source.characterKey, source.weapons)');
    expect(roomsSource).toContain("return ['melee', 'laser', 'smash', 'dash']");
  });

  test('shared rivals persist tactical cooldowns, stay in live rooms, and use potions', () => {
    expect(roomsSource).toContain('rivalSlotCooldowns: { ...(rival.slotCooldowns || {}) }');
    expect(roomsSource).toContain('rival.slotCooldowns = { ...enemy.rivalSlotCooldowns }');
    expect(roomsSource).toContain('if (liveEnemy) continue;');
    expect(roomsSource).toContain('rival.loot.splice(potionIndex, 1)');
  });

  test('rival blood beams use sustained player-style beam geometry and rendering', () => {
    expect(roomsSource).toContain("blood_beam: { color: '#ff00aa', glow: '#f0f', width: 8");
    expect(roomsSource).toContain("thorn_blood_beams: { color: '#ff3b5c'");
    expect(roomsSource).toContain("fan: [-0.32, -0.11, 0.11, 0.32]");
    expect(roomsSource).toContain('Neo.buildRicochetBeamPath(');
    expect(drawSource).toContain("enemy.type === 'rival' ? (enemy.rivalBeamColor || '#ff00aa')");
    expect(drawSource).toContain('enemy.rivalBeamFan.map(offset => enemy.beamAngle + offset)');
  });

  test('Gelleh uses the same three orbiting Blade Justice sword render', () => {
    expect(roomsSource).toContain('function startRivalJusticeBlades');
    expect(roomsSource).toContain('enemy.rivalJusticeBlades = Array.from({ length: 3 }');
    expect(roomsSource).toContain('blade.swingPhase += dt * 7.5');
    expect(propsSource).toContain('enemy?.rivalJusticeBlades');
  });

  test.each([
    'kicky_kick', 'crimson_smash', 'chaos_burst', 'random_pounce',
    'power_disks', 'nail_shot', 'death_ball', 'love_bomb_laser',
    'healing_zone', 'mooggy_hairball', 'holy_turrets', 'excalibur_strike',
    'potion_bath', 'turtle_powerup', 'warp', 'flying_unhitable',
    'princess_shield', 'mooggy_zoomies', 'zip_lightning', 'knight_slash_dash',
  ])('%s has move-specific rival choreography instead of the generic fallback', move => {
    const signatureSource = extractFunction(roomsSource, 'castRivalSignatureMove');
    expect(signatureSource).toContain(`key === '${move}'`);
  });
});
