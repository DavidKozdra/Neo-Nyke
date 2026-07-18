const {
  ENEMY_CATALOG,
  STANDARD_ENEMY_TYPES,
  BOSS_ENEMY_TYPES,
  ELITE_POWER_TYPES,
  getEnemyDefinition,
} = require('../js/simulation/SharedEnemyContent');

describe('shared Neo Nyke enemy content', () => {
  test('catalogs the complete authored standard and boss roster', () => {
    expect(STANDARD_ENEMY_TYPES).toHaveLength(13);
    expect(BOSS_ENEMY_TYPES).toEqual([
      'queen_cult', 'bulk_golem', 'artificer_knave', 'bowman_bane', 'antony_blemmye', 'handsome_devil', 'god',
    ]);
    [...STANDARD_ENEMY_TYPES, ...BOSS_ENEMY_TYPES, 'mirror_knight', 'mooggy'].forEach(type => {
      expect(ENEMY_CATALOG[type]).toEqual(expect.objectContaining({ type, behavior: expect.any(String), maxHealth: expect.any(Number) }));
    });
    expect(getEnemyDefinition('missing')).toBe(ENEMY_CATALOG.hunter);
  });

  test('shares all elite power rolls and authored boss patterns', () => {
    expect(ELITE_POWER_TYPES).toEqual(['lazered', 'enflamed', 'breezy', 'gross', 'nothing', 'giant', 'blessed']);
    BOSS_ENEMY_TYPES.forEach(type => expect(ENEMY_CATALOG[type].patterns.length).toBeGreaterThan(1));
  });
});
