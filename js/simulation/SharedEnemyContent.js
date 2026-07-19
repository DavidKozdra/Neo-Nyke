(function initializeSharedEnemyContent(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.content = namespace.content || {};
  Object.assign(namespace.content, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEnemyContentApi() {
  'use strict';

  const enemy = (type, behavior, stats = {}, extra = {}) => Object.freeze({
    type,
    spriteKey: extra.spriteKey || type,
    behavior,
    radius: 15,
    maxHealth: 52,
    moveSpeed: 96,
    contactDamage: 12,
    attackCooldown: 1,
    ...stats,
    ...extra,
  });

  // Values come from the browser game's ENEMY_STATS/spawnEnemy catalog. The
  // authority consumes the same names, base bodies, roles and boss phases.
  const ENEMY_CATALOG = Object.freeze({
    hunter: enemy('hunter', 'chaser'),
    charger: enemy('charger', 'charger'),
    laser: enemy('laser', 'beam'),
    knave: enemy('knave', 'skirmisher', { radius: 16, maxHealth: 68, moveSpeed: 118, contactDamage: 14, attackCooldown: 1.3 }),
    sniper: enemy('sniper', 'sniper', { radius: 15, maxHealth: 58, moveSpeed: 104, contactDamage: 12, attackCooldown: 1.55 }),
    machine_gunner: enemy('machine_gunner', 'burst', { radius: 17, maxHealth: 96, moveSpeed: 112, contactDamage: 8, attackCooldown: 1.15 }),
    golem: enemy('golem', 'heavy', { radius: 20, maxHealth: 132, moveSpeed: 70, contactDamage: 18, attackCooldown: 1.9 }, { bleedImmune: true }),
    cult_mage: enemy('cult_mage', 'beam', { radius: 17, maxHealth: 84, moveSpeed: 58, contactDamage: 18, attackCooldown: 1.8 }),
    cult_follower: enemy('cult_follower', 'chaser', { radius: 12, maxHealth: 34, moveSpeed: 138, contactDamage: 8, attackCooldown: 0.85 }),
    summoner: enemy('summoner', 'summoner', { radius: 18, maxHealth: 120, moveSpeed: 66, contactDamage: 12, attackCooldown: 1.5 }),
    shield_unit: enemy('shield_unit', 'shield', { radius: 22, maxHealth: 210, moveSpeed: 52, contactDamage: 10, attackCooldown: 1.4 }, { spriteKey: 'golem', bleedImmune: true }),
    healer: enemy('healer', 'healer', { radius: 19, maxHealth: 150, moveSpeed: 64, contactDamage: 10, attackCooldown: 1.2 }, { spriteKey: 'cult_follower' }),
    boss_spawner: enemy('boss_spawner', 'boss_spawner', { radius: 24, maxHealth: 300, moveSpeed: 96, contactDamage: 8, attackCooldown: 1.8 }, { spriteKey: 'laser', bleedImmune: true }),
    queen_cult: enemy('queen_cult', 'boss', { radius: 38, maxHealth: 912, moveSpeed: 96, contactDamage: 20, attackCooldown: 1.2 }, { boss: true, patterns: Object.freeze(['summon', 'beam', 'nova']) }),
    bulk_golem: enemy('bulk_golem', 'boss', { radius: 58, maxHealth: 1280, moveSpeed: 88, contactDamage: 31, attackCooldown: 1.6 }, { boss: true, bleedImmune: true, patterns: Object.freeze(['jump', 'aoe', 'split']) }),
    artificer_knave: enemy('artificer_knave', 'boss', { radius: 30, maxHealth: 1880, moveSpeed: 124, contactDamage: 20, attackCooldown: 1.2 }, { boss: true, patterns: Object.freeze(['blade', 'dash', 'turrets']) }),
    bowman_bane: enemy('bowman_bane', 'boss', { radius: 36, maxHealth: 2400, moveSpeed: 80, contactDamage: 50, attackCooldown: 1.4 }, { boss: true, bleedImmune: true, patterns: Object.freeze(['columns', 'burst', 'warp', 'thunder_smash']) }),
    antony_blemmye: enemy('antony_blemmye', 'boss', { radius: 42, maxHealth: 1250, moveSpeed: 78, contactDamage: 24, attackCooldown: 1.35 }, { boss: true, bleedImmune: true, patterns: Object.freeze(['hammer', 'bite', 'slash', 'death_ball']) }),
    handsome_devil: enemy('handsome_devil', 'boss', { radius: 34, maxHealth: 1700, moveSpeed: 104, contactDamage: 50, attackCooldown: 1.1 }, { boss: true, fireImmune: true, patterns: Object.freeze(['spikes', 'lava_grid', 'laser', 'claw']) }),
    god: enemy('god', 'boss', { radius: 34, maxHealth: 4600, moveSpeed: 108, contactDamage: 40, attackCooldown: 1.4 }, { boss: true, patterns: Object.freeze(['laser', 'sweep', 'partition', 'charge', 'sword_ring']) }),
    mirror_knight: enemy('mirror_knight', 'mirror', { radius: 18, maxHealth: 180, moveSpeed: 180, contactDamage: 20, attackCooldown: 0.8 }, { spriteKey: 'thorn_knight' }),
    rival: enemy('rival', 'mirror', { radius: 18, maxHealth: 220, moveSpeed: 228, contactDamage: 22, attackCooldown: 0.7 }, { spriteKey: 'thorn_knight' }),
    mooggy: enemy('mooggy', 'assassin', { radius: 15, maxHealth: 120, moveSpeed: 228, contactDamage: 14, attackCooldown: 0.2 }),
  });

  const STANDARD_ENEMY_TYPES = Object.freeze([
    'hunter', 'charger', 'laser', 'knave', 'sniper', 'machine_gunner', 'golem', 'cult_mage',
    'cult_follower', 'summoner', 'shield_unit', 'healer', 'boss_spawner',
  ]);
  const BOSS_ENEMY_TYPES = Object.freeze(['queen_cult', 'bulk_golem', 'artificer_knave', 'bowman_bane', 'antony_blemmye', 'handsome_devil', 'god']);
  const ELITE_POWER_TYPES = Object.freeze(['lazered', 'enflamed', 'breezy', 'gross', 'nothing', 'giant', 'blessed']);

  function getEnemyDefinition(type) {
    return ENEMY_CATALOG[type] || ENEMY_CATALOG.hunter;
  }

  return { ENEMY_CATALOG, STANDARD_ENEMY_TYPES, BOSS_ENEMY_TYPES, ELITE_POWER_TYPES, getEnemyDefinition };
});
