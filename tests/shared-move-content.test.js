const {
  MOVE_BASE_STATS,
  FLYING_UNTOUCHABLE_DURATION_SECONDS,
  MOVE_PRESENTATION_DEFS,
  MOVE_SLOT_KEYS,
  DEFAULT_MOVE_LOADOUTS,
  KIT_ALTERNATIVES,
  BEAM_CHANNEL_PROFILES,
  isContinuousBeamMove,
  getDefaultMoveLoadout,
  getMoveSlot,
  createPowerDiskBurstDescriptors,
} = require('../js/simulation/SharedMoveContent');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

describe('shared Neo Nyke move content', () => {
  test('caps Flying Untouchable at five seconds', () => {
    expect(FLYING_UNTOUCHABLE_DURATION_SECONDS).toBe(5);
    expect(MOVE_BASE_STATS.flying_unhitable.duration).toBe(5);
  });

  test('keeps the five-percent Love Beam damage nerf aligned across runtimes', () => {
    expect(MOVE_BASE_STATS.love_beam.damage).toBeCloseTo(13.3);
    expect(BEAM_CHANNEL_PROFILES.love_beam.tickDamage).toBeCloseTo(13.3);

    const browserCombat = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
    const browserInput = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');
    expect(browserCombat).toMatch(/love_beam:\s+\{ base: 13\.3,/);
    expect(browserCombat).toMatch(/loveBeamActive\s*\n\s*\? 13\.3/);
    expect(browserInput).toMatch(/love_beam:\s+\{ damage: 13\.3,/);
  });

  test('catalogs every authored move exactly once for headless authorities', () => {
    const catalog = Object.values(MOVE_SLOT_KEYS).flat();
    expect(catalog).toHaveLength(67);
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
    expect(Object.keys(DEFAULT_MOVE_LOADOUTS)).toHaveLength(8);
    expect(getDefaultMoveLoadout('princess')).toEqual({
      melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'flying_unhitable',
    });
    Object.entries(KIT_ALTERNATIVES).forEach(([characterKey, slots]) => {
      Object.entries(slots).forEach(([slot, options]) => {
        expect(options[0]).toBe(DEFAULT_MOVE_LOADOUTS[characterKey][slot]);
        options.forEach(moveKey => expect(getMoveSlot(moveKey)).toBe(slot));
      });
    });
    expect(KIT_ALTERNATIVES.mooggy.laser).toEqual(['nail_shot', 'mooggy_blood_beam']);
    expect(KIT_ALTERNATIVES.mooggy.smash).toEqual([
      'random_pounce', 'intense_biscuits', 'mooggy_hairball',
    ]);
  });

  test('distinguishes channelled beams from other laser-slot moves', () => {
    ['blood_beam', 'love_beam', 'turtle_wave', 'holy_eye_beams', 'mooggy_blood_beam', 'thorn_blood_beams', 'wizard_lazer']
      .forEach(moveKey => expect(isContinuousBeamMove(moveKey)).toBe(true));
    ['power_disks', 'blade_justice', 'nail_shot', 'hammer_throw', 'love_bomb_laser', 'ghost_ball', 'intense_biscuits']
      .forEach(moveKey => expect(isContinuousBeamMove(moveKey)).toBe(false));
  });

  test('defines Intense Biscuits as Mooggy\'s compact alternative smash with its own drawn icon', () => {
    expect(MOVE_BASE_STATS.intense_biscuits).toEqual({
      damage: 28, cooldown: 4.2, range: 105,
    });
    expect(MOVE_SLOT_KEYS.smash).toContain('intense_biscuits');
    expect(MOVE_SLOT_KEYS.laser).not.toContain('intense_biscuits');
    expect(MOVE_PRESENTATION_DEFS.intense_biscuits).toEqual(expect.objectContaining({
      kind: 'aoe', color: '#ffc95a', style: 'normal',
    }));
    const context = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/sprites/icons.js'), 'utf8'), context);
    expect(context.window.NeoNykeIconDefs.moves.intense_biscuits).toEqual(expect.objectContaining({
      color: '#d99032', accent: '#ffe29a', pixels: expect.any(Array), accentPixels: expect.any(Array),
    }));
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
