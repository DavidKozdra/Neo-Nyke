const {
  ENEMY_CATALOG,
  STANDARD_ENEMY_TYPES,
  BOSS_ENEMY_TYPES,
  ELITE_POWER_TYPES,
  BOSS_RUSH_START_LEVEL,
  getEnemyDefinition,
  getBossRushBossLevel,
} = require('../js/simulation/SharedEnemyContent');

describe('shared Neo Nyke enemy content', () => {
  test('catalogs the complete authored standard and boss roster', () => {
    expect(STANDARD_ENEMY_TYPES).toHaveLength(13);
    expect(BOSS_ENEMY_TYPES).toEqual([
      'queen_cult', 'bulk_golem', 'artificer_knave', 'bowman_bane', 'antony_blemmye', 'handsome_devil',
      'ent_of_pestilence', 't_rex', 'sea_snake', 'god',
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

  test('Artificer Charged Knave reuses Knave art with a larger body', () => {
    const knave = getEnemyDefinition('knave');
    const artificer = getEnemyDefinition('artificer_knave');
    expect(artificer.spriteKey).toBe('knave');
    expect(artificer.radius).toBeGreaterThan(knave.radius);
  });
  test('uses dedicated Laser Unit art while Boss Spawners retain Cult Mage art', () => {
    expect(getEnemyDefinition('laser').spriteKey).toBe('laser');
    expect(getEnemyDefinition('boss_spawner').spriteKey).toBe('cult_mage');
  });


  test('Boss Rush bosses start at level two and rise one level per stage', () => {
    expect(BOSS_RUSH_START_LEVEL).toBe(2);
    expect([0, 1, 2, 3, 4, 5].map(getBossRushBossLevel)).toEqual([2, 3, 4, 5, 6, 7]);
  });
});
