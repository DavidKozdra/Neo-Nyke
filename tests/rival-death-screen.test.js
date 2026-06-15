const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
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
  return source.slice(start, end + 1);
}

describe('rival death screen attribution', () => {
  const gameStateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');
  const roomsSource = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');
  const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
  const controllerSource = fs.readFileSync(path.join(__dirname, '../js/ui/controller.js'), 'utf8');

  test('resolves rival character keys and legacy rival labels to the correct portrait', () => {
    const Neo = {
      SPRITE_DEFS: {
        princess: {},
        thorn_knight: {},
        metao: {},
        gelleh: {},
        mooggy: {},
      },
      RIVAL_DEFS: {
        princess: { name: 'Rival Princess' },
        thorn_knight: { name: 'Rival Thorn' },
        metao: { name: 'Rival Metao' },
        gelleh: { name: 'Rival Gelleh' },
        mooggy: { name: 'Rival Mooggy' },
      },
    };
    const killerSpriteMap = {};
    const resolveKillerSprite = new Function(
      'Neo',
      'killerSpriteMap',
      `${extractFunction(gameStateSource, 'resolveKillerSprite')}; return resolveKillerSprite;`,
    )(Neo, killerSpriteMap);

    expect(resolveKillerSprite('princess')).toBe('princess');
    expect(resolveKillerSprite('Rival Princess')).toBe('princess');
    expect(resolveKillerSprite('Rival Thorn')).toBe('thorn_knight');
    expect(resolveKillerSprite('Rival Metao')).toBe('metao');
    expect(controllerSource).toContain('Neo.resolveKillerSprite(killerLookup)');
  });

  test('records rival character keys separately from display names', () => {
    const rivalBlock = roomsSource.slice(
      roomsSource.indexOf('function updateRivalEnemy'),
      roomsSource.indexOf('// ── End Rival System'),
    );

    expect(rivalBlock).toContain('sourceKey: rival.characterKey');
    expect(rivalBlock).toContain('sourceLabel: rival.name');
    expect(rivalBlock).toContain("source: rival.characterKey || 'rival_projectile'");
  });

  test('passes a projectile source label through to player damage', () => {
    const collisionStart = worldSource.indexOf('const projectileSource = getProjectileDamageSource(projectile);');
    const projectileHitBlock = worldSource.slice(
      collisionStart,
      worldSource.indexOf('applyProjectileStatusEffectsToPlayer(projectile)', collisionStart),
    );

    expect(projectileHitBlock).toContain("sourceLabel: projectile.sourceLabel || ''");
  });
});
