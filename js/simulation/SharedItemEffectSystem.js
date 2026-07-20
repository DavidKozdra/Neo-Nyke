(function initializeSharedItemEffectSystem(root, factory) {
  const definitions = typeof require === 'function' ? require('./SharedItemDefinitions.js') : (root.NeoNyke?.content || {});
  const api = factory(definitions);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedItemEffectApi(definitions) {
  'use strict';

  const ITEM_DEFS = definitions.ITEM_DEFS || {};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const count = (player, key) => Math.max(0, Number(player?.items?.[key] || 0));

  function getItemTagCounts(player) {
    const counts = {};
    Object.keys(ITEM_DEFS).forEach(key => {
      const stacks = count(player, key);
      if (stacks <= 0) return;
      (ITEM_DEFS[key]?.tags || []).forEach(tag => { counts[tag] = Number(counts[tag] || 0) + stacks; });
    });
    return counts;
  }

  function getActiveBuildTags(player, minimumStacks = 3) {
    return Object.entries(getItemTagCounts(player))
      .filter(([, stacks]) => stacks >= minimumStacks)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, stacks]) => ({ tag, count: stacks }));
  }

  function applyCritRollback(critChance, critMultiplier) {
    let chance = Number(critChance) || 0;
    let multiplier = Number(critMultiplier) || 1;
    for (let guard = 0; chance >= 1 && guard < 20; guard += 1) {
      multiplier *= 1.5;
      chance -= 0.25;
    }
    return { critChance: chance, critMultiplier: multiplier };
  }

  function deriveCampaignItemStats(player, options = {}) {
    const tagCounts = getItemTagCounts(player);
    const stacks = key => count(player, key);
    const equippedWeaponKey = String(player?.equippedWeapon || '');
    const godItemStacks = Object.keys(ITEM_DEFS).reduce((total, key) => (
      total + (ITEM_DEFS[key]?.rarity === 'god' && !ITEM_DEFS[key]?.voucher ? stacks(key) : 0)
    ), 0);
    const ownedToolStacks = Object.keys(ITEM_DEFS).reduce((total, key) => (
      total + (ITEM_DEFS[key]?.tool && !ITEM_DEFS[key]?.voucher ? stacks(key) : 0)
    ), 0);
    const ownedToolCount = Object.keys(ITEM_DEFS).filter(key => stacks(key) > 0 && ITEM_DEFS[key]?.tool && !ITEM_DEFS[key]?.voucher).length;
    const healingTagStacks = Number(tagCounts.heal || 0) + Number(tagCounts.healing || 0);
    const otherHealStacks = Math.max(0, healingTagStacks - stacks('generic_health_item'));
    const overhealUnlocked = stacks('generic_health_item') > 0 && otherHealStacks > 0;
    const rivalCombatCurse = options.lowerCombatCurse ? 0.5 : 1;
    const keenEyeActive = Number(player?.keenEyeBuffUntilTick || 0) > Number(options.currentTick || 0)
      || Number(player?.keenEyeBuffTime || 0) > 0;
    const chronoActive = Number(player?.chronoSpringBuffUntilTick || 0) > Number(options.currentTick || 0)
      || Number(player?.chronoSpringBuffTime || 0) > 0;
    const critCharmActive = Number(player?.critCharmBuffUntilTick || 0) > Number(options.currentTick || 0)
      || Number(player?.critCharmBuffTime || 0) > 0;
    const critCharmBonus = stacks('crit_charm') * 0.025 + (critCharmActive ? stacks('crit_charm') * 0.04 : 0);
    const keenEyeBonus = keenEyeActive ? stacks('keen_eye') * 0.2 : 0;
    const keenEyeCritDamageBonus = keenEyeActive ? stacks('keen_eye') * 0.025 : 0;
    const princesGlasses = stacks('princes_glasses');
    const princesGlassesCrit = princesGlasses > 0 ? 0.05 + (princesGlasses - 1) * 0.02 : 0;
    const princesGlassesDefense = princesGlasses > 0 ? 0.10 + (princesGlasses - 1) * 0.02 : 0;
    let critChance = (critCharmBonus + keenEyeBonus + stacks('pendant_of_kronos') * godItemStacks * 0.05 + princesGlassesCrit) * rivalCombatCurse;
    if (stacks('oracles_lens') > 0) critChance *= 2;
    critChance = Math.max(0.01, critChance);
    const rollback = applyCritRollback(critChance, 1.6 + (stacks('oracles_lens') > 0 ? critChance * 2.2 : critChance * 0.6) + keenEyeCritDamageBonus);
    critChance = clamp(rollback.critChance, 0.01, 1);
    const legacyGoldVac = player?.equipmentEffects?.gold_vac || {};
    const activeGoldVacStacks = (
      Number(player?.equipmentEffectsUntilTick?.gold_vac || 0) > Number(options.currentTick || 0)
      || Number(legacyGoldVac.time || 0) > 0
    ) ? Math.max(1, Math.floor(Number(legacyGoldVac.stacks || stacks('gold_vac') || 1))) : 0;
    const level = Math.max(1, Number(player?.level || 1));
    const levelSpeedBonus = (level >= 14 ? 0.03 : 0) + (level >= 28 ? 0.04 : 0);
    const genericHealthStacks = stacks('generic_health_item');
    const cloakStacks = stacks('cloak_of_naked_king');
    const bleedChance = (stacks('neo_knife') * 0.10 + stacks('tough_bandaid') * 0.02) * rivalCombatCurse;
    const weaponBleedChance = (equippedWeaponKey === 'claw_gauntlets' ? 0.22 : equippedWeaponKey === 'thorns_bleed_blade' ? 0.10 : 0) * rivalCombatCurse;
    const weaponCritChance = (equippedWeaponKey === 'hunters_bow' ? 0.10 : equippedWeaponKey === 'void_piercer' ? 0.20 : 0) * rivalCombatCurse;
    return {
      bleedChance,
      weaponBleedChance,
      displayedBleedChance: bleedChance + weaponBleedChance,
      weaponCritChance,
      displayedCritChance: critChance + weaponCritChance,
      // Quadratic term kept in step with js/game/player.js: 1.8%, down from 2.5%.
      drainChance: stacks('tooth_of_thorn') * 0.045 + stacks('tooth_of_thorn') ** 2 * 0.018,
      meleeDrainChance: stacks('tooth_of_thorn') * 0.08 + stacks('tooth_of_thorn') ** 2 * 0.018,
      bleedResistance: clamp(stacks('tough_bandaid') * 0.1, 0, 0.8),
      fireResistance: 0.5,
      bleedDurationDecayMultiplier: clamp(1 + stacks('tough_bandaid') * 0.2, 1, 3),
      weaponFatigueChance: stacks('weapon_fatigue') * 0.05,
      weaponFatigueFreezeChance: stacks('weapon_fatigue') * 0.02,
      genericHealthItemHealRatio: genericHealthStacks * 0.05,
      snakeKnifePoisonChance: stacks('snake_knife') * 0.10,
      confuseRayStunChance: stacks('confuse_ray') * 0.15,
      confuseRayBlindChance: stacks('confuse_ray') > 0 ? 0.05 : 0,
      overclockedWatchChance: stacks('overclocked_watch') * 0.2,
      overclockedWatchAggressionCut: clamp(stacks('overclocked_watch') * 0.02, 0, 0.3),
      overstimulateStunChance: stacks('overstimulate') * 0.2,
      graveZoneStacks: stacks('grave_zone'),
      graveZoneChance: stacks('grave_zone') >= 4 ? 0.8 : stacks('grave_zone') * 0.25,
      graveZoneDamageTakenMultiplier: 1 + stacks('grave_zone') * 0.08,
      coldDamageTakenMultiplier: stacks('grave_zone') >= 4 ? 1.5 : 1,
      homingMissileChance: stacks('homing_missile') * 0.15,
      procyPickleSpreadChance: clamp(stacks('procy_pickle') * 0.05, 0, 0.6),
      procyPickleToolPoisonChance: clamp(stacks('procy_pickle') * 0.02 * ownedToolCount, 0, 0.75),
      bleedDamageMultiplier: stacks('orb_of_blood') > 0 ? 1 + stacks('orb_of_blood') : 1,
      bleedHealScale: stacks('hemes_scarf'), passiveBleedStacks: stacks('hemes_scarf'), scarfBleedsOnHit: stacks('hemes_scarf'),
      pickupVacuumRange: activeGoldVacStacks > 0 ? 9999 : 0,
      coinPickupMultiplier: activeGoldVacStacks > 0 ? 2 + (activeGoldVacStacks - 1) * 0.5 : 1,
      potionDoubleChance: clamp(stacks('drink_master') * 0.5, 0, 1),
      itemDuplicateChance: clamp(stacks('copycat_charm') * 0.3, 0, 0.75),
      critChance, critMultiplier: rollback.critMultiplier,
      kronosDamageMultiplier: 1 + stacks('pendant_of_kronos') * godItemStacks * 0.025,
      kronosBossDamageMultiplier: 1 + stacks('pendant_of_kronos') * 0.05,
      rockDamageMultiplier: 1 + stacks('pendant_of_rock') * 0.02,
      flatHitDamageBonus: stacks('foleys_irish_newyork_charm'),
      attackSpeedMultiplier: 1 + stacks('attack_servo') * 0.08 + (chronoActive ? stacks('chrono_spring') * 0.16 : 0),
      hasRobotArm: stacks('robot_arm') > 0,
      moveSpeedMultiplier: 1 + stacks('turtle_shell') * 0.05 + levelSpeedBonus
        + (Number(player?.equipmentEffectsUntilTick?.el_bartos_cape || 0) > Number(options.currentTick || 0) || Number(player?.equipmentEffects?.el_bartos_cape?.time || 0) > 0 ? 0.2 : 0),
      laserWeightMultiplier: Math.max(0, 1 - stacks('turtle_shell') * 0.01),
      xpGainMultiplier: 1 + stacks('scholar_seal') * 0.15,
      levelEdgeDamageMultiplier: 1 + stacks('scholar_cap') * clamp(Number(player?.xp || 0) / Math.max(1, Number(player?.xpToNext || 1)), 0, 1) * 0.45,
      knockbackMultiplier: 1 + stacks('push_man') * 0.18,
      aoeRadiusMultiplier: (1 + stacks('explosive_jelly') * 0.2) * (stacks('artificer_charger') > 0 ? 1.267 : 1) * Number(options.aoeRadiusMultiplier || 1),
      aoeDamageMultiplier: Number(options.aoeDamageMultiplier || 1),
      playerSpriteScale: stacks('artificer_charger') > 0 ? 1.267 : 1,
      beamWidthMultiplier: stacks('artificer_charger') > 0 ? 1.05 : 1,
      beamDamageMultiplier: 1 + stacks('dragon_orb') * 0.35,
      beamChainTargets: stacks('dragon_orb') > 0 ? Math.min(2, stacks('dragon_orb')) : 0,
      beamChainDamageMultiplier: stacks('dragon_orb') > 0 ? 0.6 + (stacks('dragon_orb') - 1) * 0.15 : 0,
      projectileBounces: stacks('ricocete'),
      projectilePierceBonus: tagCounts.projectile >= 9 ? 2 : tagCounts.projectile >= 4 ? 1 : 0,
      projectileHomingStrength: stacks('enemy_magnet') * 0.15 + stacks('enemy_magnet') ** 2 * 0.02 + stacks('mooggy_zoomies') * 0.02,
      projectileSpeedMultiplier: 1 + stacks('mooggy_zoomies') * 0.12,
      projectileLifeMultiplier: 1 + stacks('mooggy_zoomies') * 0.10,
      healingMultiplier: 1 + stacks('drink_master') * 0.2,
      storedPotionHealingMultiplier: 1 + stacks('mateos_bag') * 0.10,
      overhealBarrierChance: overhealUnlocked ? clamp(0.15 * healingTagStacks, 0, 0.75) : 0,
      overhealBarrierRatio: overhealUnlocked ? 0.35 : 0,
      overhealBarrierCapRatio: overhealUnlocked ? (healingTagStacks >= 6 ? 0.28 : 0.16) : 0,
      itemDropChanceBonus: Math.min(0.3, stacks('rich_mans_luck') * 0.05),
      shopExtraItemOffers: Math.min(3, stacks('rich_mans_luck')),
      damageReduction: clamp(stacks('tough_bandaid') * 0.005 + stacks('shield_of_aegis') * 0.2 + princesGlassesDefense + stacks('pendant_of_rock') * 0.01, 0, 0.85),
      flatDamageReduction: cloakStacks > 0 ? cloakStacks * 10 + ownedToolStacks : 0,
      negativeStatusMultiplier: 1 + cloakStacks * 0.2,
      ownedToolStacks, stunResistance: stacks('anchor_charm'),
      anchorKnockbackResist: clamp(stacks('anchor_charm') * 0.12, 0, 0.65),
      hasIronLung: stacks('iron_lung') > 0, hasPrincesGlasses: princesGlasses > 0,
      tagCounts,
      bleedCritChance: tagCounts.bleed >= 8 ? 0.18 : tagCounts.bleed >= 3 ? 0.08 : 0,
      bleedSplashStacks: tagCounts.bleed >= 5 ? Math.min(3, 1 + Math.floor((tagCounts.bleed - 5) / 4)) : 0,
      statusDurationMultiplier: tagCounts.wizard >= 4 ? 1.18 : 1,
      aoeStatusDurationMultiplier: tagCounts.wizard >= 7 ? 1.28 : tagCounts.wizard >= 4 ? 1.14 : 1,
      chargeSynergyReduction: tagCounts.charge >= 6 ? 2 : tagCounts.charge >= 3 ? 1 : 0,
      buildTags: getActiveBuildTags(player),
    };
  }

  function syncCampaignItemStats(state, options = {}) {
    for (const player of Object.values(state?.players || {})) {
      if (!player) continue;
      player.itemStats = deriveCampaignItemStats(player, {
        ...options,
        currentTick: Number(state?.tick || 0),
        lowerCombatCurse: !!state?.floorState?.rivalCurses?.lowerCombat,
      });
    }
    return state;
  }

  return { getItemTagCounts, getActiveBuildTags, applyCritRollback, deriveCampaignItemStats, syncCampaignItemStats };
});
