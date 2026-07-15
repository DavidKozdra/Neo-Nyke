const fs = require('node:fs');
const path = require('node:path');

describe('Unkillable achievement God-fight scope', () => {
  const definitions = fs.readFileSync(path.join(__dirname, '../js/achievements.js'), 'utf8');
  const manager = fs.readFileSync(path.join(__dirname, '../js/achievementManager.js'), 'utf8');
  const world = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
  const english = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/i18n/en.json'), 'utf8'));

  test('description explicitly limits the requirement to the God fight', () => {
    const description = 'Defeat God without taking damage during the God fight';
    expect(definitions).toContain(`desc: '${description}'`);
    expect(english['achievements.unkillable.desc']).toBe(description);
  });

  test('damage events identify damage taken while God is alive', () => {
    expect(world).toContain("Neo.currentRoom?.type === 'god'");
    expect(world).toContain("enemy.type === 'god' && Number(enemy.hp || 0) > 0");
    expect(world).toContain("emit('damage:taken', { amount: finalAmount, duringGodFight })");
  });

  test('only God-fight damage controls the unlock', () => {
    expect(manager).toContain('if (duringGodFight) godFightDamageTaken += amount');
    expect(manager).toContain("achievementEvents.on('god:killed', async () => {");
    expect(manager).toContain("if (godFightDamageTaken === 0) await unlock('unkillable')");
    expect(manager).not.toContain("if (runDamageTaken === 0) await unlock('unkillable')");
  });
});
