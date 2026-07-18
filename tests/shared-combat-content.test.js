const fs = require('node:fs');
const path = require('node:path');
const content = require('../js/simulation/SharedCombatContent');
const { getHeroPrimaryAttack } = require('../js/simulation/NetworkCombatSystem');

describe('shared Neo Nyke combat content', () => {
  test('keeps the existing character defaults and authored weapon values authoritative', () => {
    expect(content.CHARACTER_DEFAULT_WEAPONS).toEqual({
      princess: 'princess_wand',
      thorn_knight: 'thorns_bleed_blade',
      metao: 'metao_fire_staff',
      gelleh: 'gelleh_lightning_spear',
      mooggy: 'claw_gauntlets',
      turtle_boy: 'extending_staff',
      sarge: 'sarges_hammer',
    });
    expect(content.WEAPON_BASE_STATS.princess_wand).toEqual({ damage: 30, cooldown: 0.77, range: 120, knockback: 160 });
    expect(content.DEFAULT_WEAPON_ATTACKS.metao_fire_staff).toEqual(expect.objectContaining({
      mode: 'volley', count: 3, spread: 0.18, speed: 560, splash: 48, fireStacks: 2,
    }));
    expect(content.DEFAULT_WEAPON_ATTACKS.gelleh_lightning_spear).toEqual(expect.objectContaining({
      mode: 'smite', stabDamage: 20, bladeDamage: 18, chainCount: 5,
    }));
    expect(getHeroPrimaryAttack('sarge')).toEqual(expect.objectContaining({
      weaponKey: 'sarges_hammer', damage: 64, cooldownTicks: 14, arc: Math.PI * 0.9,
    }));
  });

  test('offline browser modules consume the same shared tables instead of copies', () => {
    const root = path.join(__dirname, '..');
    const input = fs.readFileSync(path.join(root, 'js/ui/input.js'), 'utf8');
    const projectileTypes = fs.readFileSync(path.join(root, 'js/game/projectile-types.js'), 'utf8');
    const player = fs.readFileSync(path.join(root, 'js/game/player.js'), 'utf8');
    expect(input).toContain('NeoNyke?.content?.WEAPON_BASE_STATS');
    expect(projectileTypes).toContain('sharedCombatContent.PROJECTILE_TYPE_DEFS');
    expect(player).toContain('NeoNyke?.content?.getCharacterDefaultWeapon');
  });
});
