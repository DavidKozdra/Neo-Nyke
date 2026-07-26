// projectile-types.js — projectile presets and weapon projectile attack data.

const sharedCombatContent = globalThis.NeoNyke?.content || {};
const PROJECTILE_TYPE_DEFS = sharedCombatContent.PROJECTILE_TYPE_DEFS || {};
const WEAPON_PROJECTILE_ATTACKS = sharedCombatContent.WEAPON_PROJECTILE_ATTACKS || {};

function getWeaponProjectileAttack(weaponKey) {
  return WEAPON_PROJECTILE_ATTACKS[weaponKey] || null;
}

function isProjectileWeaponKey(weaponKey) {
  return !!getWeaponProjectileAttack(weaponKey);
}

function getProjectileWeaponKeys(pool = null) {
  const keys = Array.isArray(pool) ? pool : Object.keys(WEAPON_PROJECTILE_ATTACKS);
  return keys.filter(isProjectileWeaponKey);
}

function buildWeaponProjectileConfig(weaponKey, overrides = {}) {
  return sharedCombatContent.buildCampaignWeaponProjectileConfig?.(weaponKey, overrides) || null;
}

Neo.PROJECTILE_TYPE_DEFS = PROJECTILE_TYPE_DEFS;
Neo.WEAPON_PROJECTILE_ATTACKS = WEAPON_PROJECTILE_ATTACKS;
Neo.getWeaponProjectileAttack = getWeaponProjectileAttack;
Neo.isProjectileWeaponKey = isProjectileWeaponKey;
Neo.getProjectileWeaponKeys = getProjectileWeaponKeys;
Neo.buildWeaponProjectileConfig = buildWeaponProjectileConfig;
