const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const coreSource = fs.readFileSync(path.join(root, 'js/core/game-core.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(root, 'js/ui/controller.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(root, 'js/core/game-state.js'), 'utf8');
const updateSource = fs.readFileSync(path.join(root, 'js/core/update.js'), 'utf8');

function matchBraces(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openIndex, index + 1);
  }
  throw new Error('Unbalanced braces');
}

function objectLiteral(marker) {
  const start = coreSource.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  return matchBraces(coreSource, coreSource.indexOf('{', start));
}

function functionDeclaration(name) {
  const start = coreSource.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const bodyStart = coreSource.indexOf('{', start);
  return coreSource.slice(start, bodyStart) + matchBraces(coreSource, bodyStart);
}

function loadCharacterStatResolver() {
  return new Function('globalThis', `
    const CHARACTER_DEFS = ${objectLiteral('export const CHARACTER_DEFS =')};
    const CHARACTER_STAT_COLORS = ${objectLiteral('const CHARACTER_STAT_COLORS = Object.freeze(')};
    const PLAYER_BASE_MAX_HP = 120;
    const PLAYER_BASE_MOVE_SPEED = 228;
    ${functionDeclaration('getCharacterStatDef')}
    ${functionDeclaration('getCharacterDisplayStats')}
    return getCharacterDisplayStats;
  `)({ Neo: {} });
}

describe('character stat bars', () => {
  const getStats = loadCharacterStatResolver();
  const byLabel = character => Object.fromEntries(getStats(character).map(stat => [stat.label, stat]));

  test.each([
    ['princess', 138, '1.20×', '1.00×'],
    ['thorn_knight', 120, '1.00×', '1.00×'],
    ['metao', 120, '0.50×', '1.20×'],
    ['gelleh', 120, '1.00×', '1.00×'],
    ['mooggy', 130, '0.60×', '1.00×'],
    ['turtle_boy', 144, '1.00×', '1.00×'],
    ['sarge', 108, '1.05×', '1.00×'],
  ])('%s reports gameplay-derived HP, damage, and AOE', (character, hp, damage, aoe) => {
    const stats = byLabel(character);
    expect(Number(stats.HP.value)).toBe(hp);
    expect(stats.DMG.value).toBe(damage);
    expect(stats.MOVE.value).toBe('1.00×');
    expect(stats.AOE.value).toBe(aoe);
  });

  test('bar widths are normalized from those same values', () => {
    expect(byLabel('turtle_boy').HP.pct).toBe(100);
    expect(byLabel('sarge').HP.pct).toBe(75);
    expect(byLabel('princess').DMG.pct).toBe(100);
    expect(byLabel('metao').DMG.pct).toBe(41.7);
    expect(byLabel('metao').AOE.pct).toBe(100);
    expect(byLabel('thorn_knight').AOE.pct).toBe(83.3);
  });

  test('character selection and the Archive info panel use the same resolver', () => {
    expect((controllerSource.match(/Neo\.getCharacterDisplayStats\(/g) || [])).toHaveLength(2);
    expect(controllerSource).not.toContain('display.stats');
    expect(controllerSource).not.toContain('disp.stats');
    expect(controllerSource).toContain('info-char-stat__value');
  });

  test('gameplay consumes the shared base health and movement constants', () => {
    expect(stateSource).toContain('(Neo.PLAYER_BASE_MAX_HP || 120) * (character.hpMultiplier || 1)');
    expect(updateSource).toContain('(Neo.PLAYER_BASE_MOVE_SPEED || 228) * flightBoost');
  });
});
