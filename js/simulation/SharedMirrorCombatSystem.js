(function initializeSharedMirrorCombatSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedMirrorCombatApi() {
  'use strict';

  const RANGED_MIRROR_WEAPONS = new Set([
    'hunters_bow', 'metao_fire_staff', 'magenta_degale', 'magenta_p90',
    'gelleh_lightning_spear', 'void_piercer', 'lazer_glasses', 'princess_wand',
  ]);

  // This is the action-selection tail of campaign updateMirrorChampion. It is
  // intentionally state-free: browser and authority own their effects, while
  // this policy decides the exact priority, range posture and next action.
  function planCampaignMirrorTactics(options = {}) {
    const distance = Math.max(0, Number(options.distance || 0));
    const angle = Number(options.angle || 0);
    const laserMove = String(options.laserMove || 'blood_beam');
    const smashMove = String(options.smashMove || 'crimson_smash');
    const dashMove = String(options.dashMove || 'dash');
    const weaponKey = String(options.weaponKey || '');
    const weaponRange = Math.max(0, Number(options.weaponRange || 0));
    const targetRadius = Math.max(0, Number(options.targetRadius || 18));
    const meleeRange = Math.max(0, Number(options.meleeRange || 72));
    const smashReady = Number(options.smashCooldown || 0) <= 0;
    const laserReady = Number(options.laserCooldown || 0) <= 0;
    const dashReady = Number(options.dashCooldown || 0) <= 0;
    const basicReady = Number(options.attackCooldown || 0) <= 0;
    const desiredRange = smashReady
      ? (smashMove === 'kicky_kick' ? 126 : 118)
      : laserReady && laserMove !== 'blade_justice'
        ? 230
        : 112;
    const preferred = distance > desiredRange + 24 ? 1 : distance < desiredRange - 26 ? -1 : 0.2;
    const strafe = distance < 300 ? 0.34 : 0;
    const moveX = Math.cos(angle) * preferred - Math.sin(angle) * strafe;
    const moveY = Math.sin(angle) * preferred + Math.cos(angle) * strafe;
    let action = 'wait';
    if (basicReady) {
      if (smashReady && distance < 178) action = 'smash';
      else if (laserReady && (distance > 96 || laserMove === 'blade_justice')) action = 'laser';
      else if (dashReady && (distance > 170 || dashMove === 'warp')) action = 'dash';
      else if (weaponKey && (RANGED_MIRROR_WEAPONS.has(weaponKey)
        ? distance < 520 : distance < weaponRange + targetRadius + 14)) action = 'weapon';
      else if (distance < meleeRange + targetRadius + 6) action = 'melee';
      else action = 'recover';
    }
    return {
      action, laserMove, smashMove, dashMove, desiredRange,
      preferred, strafe, moveX, moveY,
      rangedWeapon: RANGED_MIRROR_WEAPONS.has(weaponKey),
    };
  }

  return { RANGED_MIRROR_WEAPONS, planCampaignMirrorTactics };
});
