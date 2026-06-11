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

describe('character info page', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/ui/controller.js'), 'utf8');

  function getLockNote(metaProgress) {
    return extractFunction(source, 'getCharacterInfoLockNote', {
      Neo: { metaProgress },
    });
  }

  test('does not show a lock note for unlocked characters', () => {
    const note = getLockNote({ unlockedCharacters: ['princess', 'gelleh'] });
    expect(note('gelleh')).toBe('');
  });

  test('shows character-specific unlock requirements', () => {
    const note = getLockNote({
      unlockedCharacters: ['princess', 'thorn_knight', 'metao'],
      mooggyDefeats: 2,
    });

    expect(note('gelleh')).toContain('Defeat GOD');
    expect(note('mooggy')).toContain('2/3');
  });

  test('defines the lock note before rendering each character card', () => {
    const characterBranch = source.slice(
      source.indexOf("} else if (tab === 'characters')"),
      source.indexOf("} else if (tab === 'meta')"),
    );

    expect(characterBranch).toContain('const lockNote = getCharacterInfoLockNote(c.key)');
    expect(characterBranch).toContain('${lockNote}');
  });
});
