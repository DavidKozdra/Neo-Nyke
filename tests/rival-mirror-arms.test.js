const fs = require('node:fs');
const path = require('node:path');

describe('rival and mirror arm sprites', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/draw/entities.js'), 'utf8');

  test('draws character sheet arm frames for enemy character copies', () => {
    expect(source).toContain('function drawEnemyArmIndicator(enemy, spriteKey, drawSize, facing, attackProgress)');
    expect(source).toContain('Neo.SPRITE_ATLAS?.frames?.[`${spriteKey}:arm`]');
    expect(source).toContain('drawEnemyArmIndicator(enemy, spriteKey, drawSize, facing, enemyArmProgress);');
  });

  test('swings Knave and charged Artificer arms only during their actual melee strike', () => {
    expect(source).toContain("['thorn_knight', 'sarge', 'mooggy', 'knave', 'artificer_knave'].includes(spriteKey)");
    expect(source).toContain('function getEnemyArmAttackProgress(enemy, fallbackProgress = 0)');
    expect(source).toContain("enemy?.type !== 'knave' && enemy?.type !== 'artificer_knave'");
    expect(source).toContain('getAttackProgress(swingTime, swingDuration)');
    expect(source).toContain("enemy.state === 'phase3_swing'");
  });

  test('aims rival and mirror arms using combat-facing angles', () => {
    const helperBlock = source.slice(
      source.indexOf('function getEnemyAimAngle'),
      source.indexOf('function drawSpriteFrame'),
    );

    expect(helperBlock).toContain('enemy?.beamAngle');
    expect(helperBlock).toContain('enemy?.dashAngle');
    expect(helperBlock).toContain('enemy?.swingA');
    expect(helperBlock).toContain('const beamActive = Number(enemy?.beamTime || 0) > 0');
    expect(helperBlock).toContain('const bladeWindup = Number(enemy?.windup || 0) > 0');
    expect(helperBlock).toContain('Math.atan2(Neo.player.y - enemy.y, Neo.player.x - enemy.x)');
  });
});
