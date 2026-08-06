const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const paramsStart = source.indexOf('(', start);
  let paramsDepth = 0;
  let paramsEnd = paramsStart;
  for (; paramsEnd < source.length; paramsEnd += 1) {
    if (source[paramsEnd] === '(') paramsDepth += 1;
    if (source[paramsEnd] === ')') paramsDepth -= 1;
    if (paramsDepth === 0) break;
  }
  const bodyStart = source.indexOf('{', paramsEnd);
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
    expect(controllerSource).toContain('const killer = Neo.resolveKillerPresentation(entry)');
    expect(controllerSource).toContain('Neo.drawKillerPresentation(view.deadKillerCanvas, killer, 120)');
    expect(controllerSource).toContain('view.deadKillerName.textContent = killer.label');
  });

  test('resolves the label and portrait from one canonical killer presentation', () => {
    const Neo = {
      SPRITE_DEFS: { hunter: {}, sniper: {}, bulk_golem: {}, thorn_knight: {}, mooggy: {} },
      RIVAL_DEFS: {},
    };
    const killerSpriteMap = {
      mirror_beam: 'thorn_knight',
      blood_thorn: 'mooggy',
      'Bulk Golem': 'bulk_golem',
    };
    const killerHazardIconMap = {
      lava: 'lava',
      enemy_projectile: 'enemy_projectile',
    };
    const getDamageSourceLabel = key => ({
      lava: 'Lava',
      elite_blade_justice: 'Elite Blade Justice',
      sniper_projectile: 'Sniper Projectile',
    }[key] || 'Unknown');
    const resolveKillerPresentation = new Function(
      'Neo',
      'killerSpriteMap',
      'killerHazardIconMap',
      'getDamageSourceLabel',
      `${extractFunction(gameStateSource, 'resolveKillerSprite')}
       ${extractFunction(gameStateSource, 'resolveKillerHazardIcon')}
       ${extractFunction(gameStateSource, 'getAttackerSpriteKey')}
       ${extractFunction(gameStateSource, 'resolveKillerPresentation')}
       return resolveKillerPresentation;`,
    )(Neo, killerSpriteMap, killerHazardIconMap, getDamageSourceLabel);

    expect(resolveKillerPresentation('elite_blade_justice', 'Elite Blade Justice', { type: 'bulk_golem' })).toEqual({
      sourceKey: 'elite_blade_justice',
      label: 'Elite Blade Justice',
      spriteKey: 'bulk_golem',
      hazardIcon: '',
    });
    expect(resolveKillerPresentation('sniper_projectile', 'Sniper Projectile', { type: 'sniper' }).spriteKey).toBe('sniper');
    expect(resolveKillerPresentation('lava')).toEqual({
      sourceKey: 'lava',
      label: 'Lava',
      spriteKey: '',
      hazardIcon: 'lava',
    });
    expect(resolveKillerPresentation('unmapped_attack').spriteKey).toBe('');
    expect(resolveKillerPresentation('unmapped_attack').hazardIcon).toBe('unknown');
  });

  test('records the actual attacker sprite independently from the attack label', () => {
    const Neo = {
      getDamageSourceLabel: key => key,
      resolveKillerPresentation: (key, label, attacker) => ({
        sourceKey: key,
        label,
        spriteKey: attacker.type,
        hazardIcon: '',
      }),
    };
    const recordLastDamageSource = new Function(
      'Neo',
      `${extractFunction(worldSource, 'recordLastDamageSource')}; return recordLastDamageSource;`,
    )(Neo);

    recordLastDamageSource('elite_blade_justice', {
      sourceLabel: 'Elite Blade Justice',
      attacker: { type: 'bulk_golem' },
    });

    expect(Neo.lastDamageSource).toBe('Elite Blade Justice');
    expect(Neo.lastDamageSourceKey).toBe('elite_blade_justice');
    expect(Neo.lastDamageSourceSpriteKey).toBe('bulk_golem');
    expect(Neo.lastDamageSourceHazardIcon).toBe('');
    expect(gameStateSource).toContain('killerSpriteKey: result === \'win\' ? \'\' : killer.spriteKey');
    expect(gameStateSource).toContain('killerHazardIcon: result === \'win\' ? \'\' : killer.hazardIcon');
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

  test('attributes a local co-op wipe to the enemy that downs the final teammate', () => {
    const playerNBlock = extractFunction(worldSource, 'damagePlayerN');
    const player2Block = extractFunction(worldSource, 'damagePlayer2');

    expect(playerNBlock).toContain('recordLastDamageSource(source, options)');
    expect(player2Block).toContain('recordLastDamageSource(source, options)');
    expect(worldSource).toContain("damagePlayer2(enemy.dmg || 10, Math.atan2(dy, dx), 220, enemy.type, { attacker: enemy })");
    expect(worldSource).toContain("damagePlayerN(pn, n, enemy.dmg || 10, Neo.angleBetween(enemy, pn), 220, enemy.type, { attacker: enemy })");
  });
});
