const {
  MOVE_BASE_STATS,
  MOVE_PRESENTATION_DEFS,
  MOVE_SLOT_KEYS,
  DEFAULT_MOVE_LOADOUTS,
  KIT_ALTERNATIVES,
  getDefaultMoveLoadout,
  getMoveSlot,
} = require('../js/simulation/SharedMoveContent');

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
});
