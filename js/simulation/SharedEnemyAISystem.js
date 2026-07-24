(function initializeSharedEnemyAISystem(root, factory) {
  const agentApi = typeof require === 'function'
    ? { ...require('../../Koz_Engine_Lib/AI/agentDispatcher.js'), ...require('../../Koz_Engine_Lib/AI/actorStateMachine.js') }
    : { ...(root.KozEngine?.AI?.agentDispatcher || {}), ...(root.KozEngine?.AI?.actorStateMachine || {}) };
  const api = factory(agentApi);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEnemyAIApi(agentApi) {
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
  const dispatcher = agentApi?.createTypedAgentDispatcher?.({
    updateMethodByType: ENEMY_UPDATE_METHOD_BY_TYPE,
    fallbackUpdateMethod: 'updateHunterEnemy',
    beforeUpdate: (enemy, fixedDelta, context) => context.updateEnemyProjectileEvade?.(enemy, fixedDelta) === true,
  });
  const actorsByEnemy = new WeakMap();
  function enemyUpdateMethod(type) { return dispatcher?.updateMethodForType(type) || 'updateHunterEnemy'; }
  function invokeCampaignEnemyAI(enemy, fixedDelta, context) {
    if (!enemy || !dispatcher || typeof agentApi?.createAgentActor !== 'function') return false;
    let actor = actorsByEnemy.get(enemy);
    if (!actor) {
      actor = agentApi.createAgentActor({
        entity: enemy,
        update: (entity, delta, host) => dispatcher.update(entity, delta, host),
      });
      actorsByEnemy.set(enemy, actor);
    }
    return actor.update(fixedDelta, context);
  }
  return { ENEMY_UPDATE_METHOD_BY_TYPE, RANGED_BEHAVIORS, SPAWN_LOCK_TICKS, enemyUpdateMethod, invokeCampaignEnemyAI };
});
