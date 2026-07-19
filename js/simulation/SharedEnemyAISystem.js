(function initializeSharedEnemyAISystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEnemyAIApi() {
  'use strict';
  const ENEMY_UPDATE_METHOD_BY_TYPE = Object.freeze({
    god: 'updateGod', queen_cult: 'updateCultQueenBoss', bulk_golem: 'updateBulkGolemBoss', artificer_knave: 'updateArtificerBoss',
    bowman_bane: 'updateBowmanBane', antony_blemmye: 'updateAntonyBlemmyeBoss', handsome_devil: 'updateHandsomeDevilBoss',
    mirror_knight: 'updateMirrorChampion', mooggy: 'updateMooggyEnemy', rival: 'updateRivalEnemy', cult_mage: 'updateCultMageEnemy',
    knave: 'updateKnaveEnemy', sniper: 'updateSniperEnemy', machine_gunner: 'updateMachineGunnerEnemy', golem: 'updateGolemEnemy',
    summoner: 'updateSummonerEnemy', shield_unit: 'updateShieldUnitEnemy', healer: 'updateHealerEnemy',
    boss_spawner: 'updateBossSpawnerEnemy', laser: 'updateLaserEnemy', charger: 'updateChargerEnemy',
  });
  const RANGED_BEHAVIORS = new Set(['ranged', 'sniper', 'beam', 'burst', 'summoner', 'healer', 'shield', 'boss_spawner', 'boss']);
  const SPAWN_LOCK_TICKS = 15;
  function enemyUpdateMethod(type) { return ENEMY_UPDATE_METHOD_BY_TYPE[String(type || '').toLowerCase()] || 'updateHunterEnemy'; }
  function invokeCampaignEnemyAI(enemy, fixedDelta, context) {
    if (!enemy || !context) return false;
    if (context.updateEnemyProjectileEvade?.(enemy, fixedDelta)) return true;
    const handler = context[enemyUpdateMethod(enemy.type)];
    if (typeof handler !== 'function') return false;
    handler(enemy, fixedDelta);
    return true;
  }
  return { ENEMY_UPDATE_METHOD_BY_TYPE, RANGED_BEHAVIORS, SPAWN_LOCK_TICKS, enemyUpdateMethod, invokeCampaignEnemyAI };
});
