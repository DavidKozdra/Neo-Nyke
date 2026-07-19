(function initializeSharedProgressionSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedProgressionApi() {
  'use strict';

  const DEFAULT_LEVEL_MILESTONES = Object.freeze({
    7:  Object.freeze({ moveCharge: 'dash', stat: Object.freeze({ maxHp: 10, attackPower: 2 }), label: '+1 MOBILITY CHARGE' }),
    14: Object.freeze({ stat: Object.freeze({ maxHp: 20, attackPower: 3, attackSpeed: 0.03 }), moveSpeed: 0.03, label: 'STAT SURGE' }),
    21: Object.freeze({ moveCharge: 'laser', stat: Object.freeze({ maxHp: 14, attackPower: 3 }), label: '+1 LASER CHARGE' }),
    28: Object.freeze({ stat: Object.freeze({ maxHp: 30, attackPower: 5, attackSpeed: 0.04 }), moveSpeed: 0.04, label: 'MAJOR STAT SURGE' }),
  });
  const CHARACTER_LEVEL_MILESTONES = Object.freeze({
    princess: Object.freeze({
      7: Object.freeze({ moveCharge: Object.freeze({ slot: 'dash', moveKey: 'flying_unhitable' }), stat: Object.freeze({ maxHp: 10, attackPower: 2 }), label: 'FLYING +1 CHARGE' }),
      21: Object.freeze({ moveCharge: Object.freeze({ slot: 'laser', moveKey: 'love_beam' }), stat: Object.freeze({ maxHp: 14, attackPower: 3 }), label: 'PETAL BEAM +1 CHARGE' }),
    }),
    thorn_knight: Object.freeze({
      7: Object.freeze({ moveCharge: 'dash', stat: Object.freeze({ maxHp: 10, attackPower: 2 }), label: 'DASH +1 CHARGE' }),
      21: Object.freeze({ moveCharge: Object.freeze({ slot: 'laser', moveKey: 'blood_beam' }), stat: Object.freeze({ maxHp: 14, attackPower: 3 }), label: 'BLOOD BEAM +1 CHARGE' }),
    }),
    metao: Object.freeze({
      7: Object.freeze({ moveCharge: Object.freeze({ slot: 'dash', moveKey: 'warp' }), stat: Object.freeze({ maxHp: 10, attackPower: 2 }), label: 'WARP +1 CHARGE' }),
      21: Object.freeze({ moveCharge: Object.freeze({ slot: 'laser', moveKey: 'power_disks' }), stat: Object.freeze({ maxHp: 14, attackPower: 3 }), label: 'POWER DISKS +1 CHARGE' }),
    }),
    gelleh: Object.freeze({
      7: Object.freeze({ moveCharge: Object.freeze({ slot: 'dash', moveKey: 'zip_lightning' }), stat: Object.freeze({ maxHp: 10, attackPower: 2 }), label: 'ZIP LIGHTNING +1 CHARGE' }),
      21: Object.freeze({ moveCharge: Object.freeze({ slot: 'laser', moveKey: 'blade_justice' }), stat: Object.freeze({ maxHp: 14, attackPower: 3 }), label: 'BLADE JUSTICE +1 CHARGE' }),
    }),
    mooggy: Object.freeze({
      7: Object.freeze({ moveCharge: Object.freeze({ slot: 'dash', moveKey: 'mooggy_zoomies' }), stat: Object.freeze({ maxHp: 10, attackPower: 2 }), label: 'ZOOMIES +1 CHARGE' }),
      21: Object.freeze({ moveCharge: Object.freeze({ slot: 'laser', moveKey: 'nail_shot' }), stat: Object.freeze({ maxHp: 14, attackPower: 3 }), label: 'NAIL SHOT +1 CHARGE' }),
    }),
  });
  const LEVEL_MILESTONE_LEVELS = Object.freeze(Object.keys(DEFAULT_LEVEL_MILESTONES).map(Number).sort((a, b) => a - b));

  function getArtificerLevelGains(stacks = 0) {
    const active = Math.max(0, Number(stacks) || 0) > 0;
    return { maxHp: active ? 16 : 15, attackPower: active ? 4 : 3, attackSpeed: active ? 0.02 : 0.01 };
  }

  function getLevelMilestone(level, characterKey) {
    const numericLevel = Math.floor(Number(level) || 0);
    return CHARACTER_LEVEL_MILESTONES[characterKey]?.[numericLevel]
      || DEFAULT_LEVEL_MILESTONES[numericLevel]
      || null;
  }

  function milestoneChargesMove(milestone, slot, moveKey) {
    const target = milestone?.moveCharge;
    if (!target) return false;
    if (typeof target === 'string') return target === slot;
    return (!target.slot || target.slot === slot) && (!target.moveKey || target.moveKey === moveKey);
  }

  function getMilestoneChargeBonus(slot, moveKey, characterKey, level) {
    return LEVEL_MILESTONE_LEVELS.reduce((bonus, milestoneLevel) => {
      if (Number(level || 1) < milestoneLevel) return bonus;
      return bonus + (milestoneChargesMove(getLevelMilestone(milestoneLevel, characterKey), slot, moveKey) ? 1 : 0);
    }, 0);
  }

  function getLevelMoveSpeedBonus(characterKey, level) {
    return LEVEL_MILESTONE_LEVELS.reduce((bonus, milestoneLevel) => (
      Number(level || 1) < milestoneLevel
        ? bonus
        : bonus + Number(getLevelMilestone(milestoneLevel, characterKey)?.moveSpeed || 0)
    ), 0);
  }

  function applyCampaignLevelUp(player, options = {}) {
    if (!player) return null;
    player.level = Math.max(1, Math.floor(Number(player.level || 1))) + 1;
    player.xpToNext = Math.max(1, Math.round(Number(player.xpToNext || 20) * 1.22));
    const artificerStacks = Math.max(0, Number(options.artificerStacks ?? player.items?.artificer_charger) || 0);
    const gains = getArtificerLevelGains(artificerStacks);
    const milestone = getLevelMilestone(player.level, player.character || player.characterKey);
    const stat = milestone?.stat || {};
    const maxHpGain = gains.maxHp + Number(stat.maxHp || 0);
    player.maxHp = Math.max(1, Number(player.maxHp || 100)) + maxHpGain;
    player.hp = Math.min(player.maxHp, Number(player.hp || 0) + maxHpGain);
    player.attackPower = Number(player.attackPower || 0) + gains.attackPower + Number(stat.attackPower || 0);
    player.attackSpeed = Number(player.attackSpeed || 1) + gains.attackSpeed + Number(stat.attackSpeed || 0);
    return { level: player.level, maxHpGain, gains, milestone };
  }

  return {
    DEFAULT_LEVEL_MILESTONES,
    CHARACTER_LEVEL_MILESTONES,
    LEVEL_MILESTONE_LEVELS,
    getArtificerLevelGains,
    getLevelMilestone,
    getMilestoneChargeBonus,
    getLevelMoveSpeedBonus,
    applyCampaignLevelUp,
  };
});
