(function initializeSharedDamageSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedDamageSystemApi() {
  'use strict';

  function getCampaignEnemyDamageTakenMultiplier(enemy, options = {}) {
    if (enemy?.mirrorExactCopy) return 1;
    const eliteFactor = enemy?.elite ? 0.95 : 1;
    const completedLoops = Math.max(0, Math.floor(Number(options.loopNumber || 1)) - 1);
    const reductionPerLoop = Math.max(0, Number(options.enemyLoopDamageReduction || 0));
    return eliteFactor * (1 - Math.min(0.95, completedLoops * reductionPerLoop));
  }

  function scaleCampaignDamage(options = {}) {
    const enemy = options.enemy || {};
    const stats = options.itemStats || {};
    const rawDamage = Math.max(0, Number(options.damage || 0));
    const defenseMultiplier = Math.max(1, Number(enemy.defenseMultiplier || 1));
    const flatReduction = Math.max(0, Number(enemy.flatDamageReduction || 0));
    const damageTakenMultiplier = getCampaignEnemyDamageTakenMultiplier(enemy, options);
    if (options.raw) {
      return Math.max(0, Math.round(rawDamage * damageTakenMultiplier / defenseMultiplier - flatReduction));
    }
    const bossMultiplier = options.isBoss ? Math.max(0, Number(stats.kronosBossDamageMultiplier || 1)) : 1;
    const bleedMultiplier = options.applyBleedBonus !== false && options.hasBleed
      ? Math.max(1, Number(stats.bleedDamageMultiplier || 1)) : 1;
    const powered = (rawDamage + Math.max(0, Number(options.attackPower || 0)))
      * Math.max(0, Number(options.attackerDamageMultiplier || 1))
      * Math.max(0, Number(options.poisonDamageMultiplier || 1))
      * Math.max(0, Number(stats.levelEdgeDamageMultiplier || 1))
      * Math.max(0, Number(stats.kronosDamageMultiplier || 1))
      * bossMultiplier
      * Math.max(0, Number(options.bountyWeaknessMultiplier || 1))
      * (options.glassCannon ? 1.25 : 1)
      * bleedMultiplier;
    return Math.max(0, Math.round(powered * damageTakenMultiplier / defenseMultiplier - flatReduction));
  }

  return { getCampaignEnemyDamageTakenMultiplier, scaleCampaignDamage };
});
