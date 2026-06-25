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

describe('storm challenge hazards', () => {
  const enemiesSource = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');
  const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');

  test('aims the first strike at the player projected position', () => {
    const Neo = {
      ROOM_W: 960,
      ROOM_H: 540,
      player: { x: 400, y: 250, vx: 100, vy: -50 },
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      nextRandom: () => 0.5,
    };
    const getStormChallengeStrikePoint = extractFunction(
      enemiesSource,
      'getStormChallengeStrikePoint',
      { Neo },
    );

    expect(getStormChallengeStrikePoint(0)).toEqual({ x: 442, y: 229 });
  });

  test('telegraphs storm columns before enabling their damage ticks', () => {
    expect(enemiesSource).toContain('warn: 0.48');
    expect(worldSource).toContain('hazard.warn = Math.max(0, Number(hazard.warn || 0) - dt)');
    expect(worldSource).toContain('if (hazard.warn <= 0) {');
  });

  test('uses the dedicated storm loop and lightning impact sound', () => {
    const sfxSource = fs.readFileSync(path.join(__dirname, '../js/core/sfx.js'), 'utf8');
    const roomsSource = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');
    const hudSource = fs.readFileSync(path.join(__dirname, '../js/game/hud.js'), 'utf8');
    expect(sfxSource).toContain("id: 'lightning_storm_loop', path: 'assets/sounds/sf_Lightning Charge_looped.wav'");
    expect(sfxSource).toContain("id: 'lightning_charge', path: 'assets/sounds/sf_Lightning Charge.wav'");
    expect(sfxSource).toContain('source.loop = true');
    expect(enemiesSource).toContain("Neo.playSfxLoop?.('lightning_storm_loop')");
    expect(enemiesSource).toContain("Neo.stopSfxLoop?.('lightning_storm_loop')");
    expect(roomsSource).toContain("Neo.playSfxLoop?.('lightning_storm_loop')");
    expect(roomsSource).toContain("Neo.stopSfxLoop?.('lightning_storm_loop')");
    expect(hudSource).toContain("Neo.stopSfxLoop?.('lightning_storm_loop')");
    expect(worldSource).toContain("if (hazard.source === 'storm'");
    expect(worldSource).toContain("Neo.playSfx?.('lightning_charge')");
  });
});
