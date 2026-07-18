const {
  MOVE_BASE_STATS,
  MOVE_PRESENTATION_DEFS,
  MOVE_SLOT_KEYS,
  DEFAULT_MOVE_LOADOUTS,
  KIT_ALTERNATIVES,
  getDefaultMoveLoadout,
  getMoveSlot,
  createPowerDiskBurstDescriptors,
} = require('../js/simulation/SharedMoveContent');
const fs = require('node:fs');
const path = require('node:path');

describe('shared Neo Nyke move content', () => {
  test('catalogs every authored move exactly once for headless authorities', () => {
    const catalog = Object.values(MOVE_SLOT_KEYS).flat();
    expect(catalog).toHaveLength(47);
    expect(new Set(catalog).size).toBe(catalog.length);
    expect(Object.keys(MOVE_BASE_STATS).sort()).toEqual(catalog.slice().sort());
    expect(Object.keys(MOVE_PRESENTATION_DEFS).sort()).toEqual(catalog.slice().sort());
    Object.values(MOVE_PRESENTATION_DEFS).forEach(presentation => {
      expect(presentation).toEqual(expect.objectContaining({
        kind: expect.any(String), color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        style: expect.stringMatching(/^(light|normal|heavy)$/), sound: expect.any(String),
      }));
    });
    catalog.forEach(moveKey => expect(getMoveSlot(moveKey)).toBeTruthy());
  });

  test('shares every hero default and selectable alternate kit', () => {
    expect(Object.keys(DEFAULT_MOVE_LOADOUTS)).toHaveLength(7);
    expect(getDefaultMoveLoadout('princess')).toEqual({
      melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'flying_unhitable',
    });
    Object.entries(KIT_ALTERNATIVES).forEach(([characterKey, slots]) => {
      Object.entries(slots).forEach(([slot, options]) => {
        expect(options[0]).toBe(DEFAULT_MOVE_LOADOUTS[characterKey][slot]);
        options.forEach(moveKey => expect(getMoveSlot(moveKey)).toBe(slot));
      });
    });
  });

  test('defines Power Disks once as the campaign radial burst with shard emitters', () => {
    const disks = createPowerDiskBurstDescriptors({ characterKey: 'metao', damageMultiplier: 1 });
    expect(disks).toHaveLength(8);
    expect(disks.map(disk => disk.angle)).toEqual(Array.from({ length: 8 }, (_, index) => index * Math.PI * 2 / 8));
    expect(disks[0]).toEqual(expect.objectContaining({
      kind: 'disk', speed: 440, radius: 7, lifeSeconds: 1.8, damage: 20,
      hitOptions: expect.objectContaining({ drainChanceBonus: 0.05, fireChance: 0.4 }),
      subSpawn: expect.objectContaining({
        kind: 'disk_shard', intervalSeconds: 0.18, speed: 620, radius: 4,
        lifeSeconds: 0.7, damage: 8, count: 2,
        hitOptions: expect.objectContaining({ drainChanceBonus: 0.05, fireChance: 0.25 }),
      }),
    }));

    const browserCombat = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
    const authorityCombat = fs.readFileSync(path.join(__dirname, '../js/simulation/NetworkCombatSystem.js'), 'utf8');
    expect(browserCombat).toContain('createPowerDiskBurstDescriptors');
    expect(authorityCombat).toContain('createPowerDiskBurstDescriptors({ characterKey: player.characterKey || player.character })');
    expect(authorityCombat).not.toContain("moveKey === 'power_disks' ? 6");
  });
});
