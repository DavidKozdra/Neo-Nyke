const fs = require('node:fs');
const path = require('node:path');

describe('rival and mirror arm sprites', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/draw/entities.js'), 'utf8');

  test('draws character sheet arm frames for enemy character copies', () => {
    expect(source).toContain('function drawEnemyArmIndicator(enemy, spriteKey, drawSize, facing, attackProgress)');
    expect(source).toContain('Neo.SPRITE_ATLAS?.frames?.[`${spriteKey}:arm`]');
    expect(source).toContain('drawEnemyArmIndicator(enemy, spriteKey, drawSize, facing, mooggyArmProgress);');
  });

  test('aims rival and mirror arms using combat-facing angles', () => {
    const helperBlock = source.slice(
      source.indexOf('function getEnemyAimAngle'),
      source.indexOf('function drawSpriteFrame'),
    );

    expect(helperBlock).toContain('enemy?.beamAngle');
    expect(helperBlock).toContain('enemy?.dashAngle');
    expect(helperBlock).toContain('enemy?.swingA');
    expect(helperBlock).toContain('Math.atan2(Neo.player.y - enemy.y, Neo.player.x - enemy.x)');
  });
});
