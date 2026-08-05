const fs = require('node:fs');
const path = require('node:path');

const gameStateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');

function functionBody(name) {
  const signature = `function ${name}(`;
  const start = gameStateSource.indexOf(signature);
  if (start < 0) throw new Error(`Missing ${name}`);
  const objectStart = gameStateSource.indexOf('{', start);
  let depth = 0;
  let end = objectStart;
  for (; end < gameStateSource.length; end += 1) {
    if (gameStateSource[end] === '{') depth += 1;
    if (gameStateSource[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  return gameStateSource.slice(objectStart + 1, end);
}

describe('alternate-mode seed policy', () => {
  test('the configured run seed keeps entered values and randomizes only blank inputs', () => {
    const body = functionBody('getConfiguredRunSeed');
    expect(body).toContain("String(Neo.ui.seed?.value || '').trim()");
    expect(body).toContain('return enteredSeed || createRandomSeed();');

    const createRandomSeed = jest.fn(() => 'GENERATED-SEED');
    const resolve = Neo => new Function('Neo', 'createRandomSeed', body)(Neo, createRandomSeed);
    expect(resolve({ ui: { seed: { value: '  ALT-SEED  ' } } })).toBe('ALT-SEED');
    expect(createRandomSeed).not.toHaveBeenCalled();
    expect(resolve({ ui: { seed: { value: '   ' } } })).toBe('GENERATED-SEED');
    expect(createRandomSeed).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['standard, Treasure Hunt, and Sandbox', 'startGame'],
    ['local co-op', 'startCoop'],
    ['local PvP', 'startPvp'],
    ['Endless', 'startEndless'],
    ['Practice variants', 'startPractice'],
    ['Boss Rush', 'startBossRush'],
    ['Rival Rumble', 'startRivalRumble'],
  ])('%s starts from the configured seed', (_mode, functionName) => {
    const body = functionBody(functionName);
    expect(body).toContain('getConfiguredRunSeed()');
    expect(body).not.toContain('Neo.baseSeedStr = createRandomSeed();');
  });

  test('mode-specific random outcomes use named or scoped seeded streams', () => {
    const core = gameStateSource;
    const combat = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
    const rooms = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');

    expect(core).toContain("createScopedRandom('boss-rush:starting-items')");
    expect(core).toContain('createScopedRandom(`boss-rush:stage:${Neo.bossRushStage}:reward`)');
    expect(core).toContain("createScopedRandom('rival-rumble:order')");
    expect(functionBody('getRivalRumbleOrder')).toContain('Neo.shuffleWithRandom(roster, order)');
    expect(core).toContain("createScopedRandom('rival-rumble:starting-items')");
    expect(core).toContain('createScopedRandom(`rival-rumble:stage:${Neo.rivalRumbleStage}:reward`)');
    expect(combat).toContain('createScopedRandom(`endless:wave:${Neo.endlessWave}:reward`)');
    expect(combat).toContain('createScopedRandom(`endless:intermission:${wave}`)');
    expect(rooms).toContain("createRoomRandom(room, 'treasure-hunt:exit-chest')");
    expect(rooms).toContain("nextRandom('encounter')");

    const authority = fs.readFileSync(path.join(__dirname, '../js/simulation/NetworkCombatSystem.js'), 'utf8');
    expect(authority).toContain('random: () => runeStream.next()');
    expect(authority).toContain('random: () => bombStream.next()');
    expect(authority).not.toMatch(/random:\s*\(\)\s*=>\s*random\.scoped\(/);
    expect(authority).toContain('const authorityFallbackRandom = () => 0.5;');
    expect(authority).not.toContain('Math.random');
  });

  test('online alternate modes derive their authority seed from the stable room code', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
    expect(server).toContain('matchSeed: `cloudflare-${this.roomCode}`');
  });

  test('shared gameplay simulation never falls through to ambient randomness', () => {
    const simulationDirectory = path.join(__dirname, '../js/simulation');
    const gameplayFiles = fs.readdirSync(simulationDirectory)
      .filter(fileName => fileName === 'NetworkCombatSystem.js' || /^Shared.*\.js$/.test(fileName));
    expect(gameplayFiles.length).toBeGreaterThan(1);
    gameplayFiles.forEach(fileName => {
      const source = fs.readFileSync(path.join(simulationDirectory, fileName), 'utf8');
      expect(source).not.toContain('Math.random');
    });
  });
});
