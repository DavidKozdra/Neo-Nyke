// projectile-types.js — projectile presets and weapon projectile attack data.

const sharedCombatContent = globalThis.NeoNyke?.content || {};
const PROJECTILE_TYPE_DEFS = sharedCombatContent.PROJECTILE_TYPE_DEFS || {};
const WEAPON_PROJECTILE_ATTACKS = sharedCombatContent.WEAPON_PROJECTILE_ATTACKS || {};

function mergeHitOptions(...sources) {
  const merged = {};
  sources.forEach(source => {
    if (source && typeof source === 'object') Object.assign(merged, source);
  });
  return Object.keys(merged).length > 0 ? merged : null;
}

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
  const attack = getWeaponProjectileAttack(weaponKey);
  if (!attack) return null;
  const type = PROJECTILE_TYPE_DEFS[attack.projectileType] || {};
  const hitOptions = mergeHitOptions(type.hitOptions, attack.hitOptions, overrides.hitOptions);
  return {
    angle: Number(overrides.angle || 0),
    speed: Number(overrides.speed ?? attack.speed ?? type.speed ?? 520),
    damage: Number(overrides.damage ?? attack.damage ?? type.damage ?? 18),
    knockback: Number(overrides.knockback ?? attack.knockback ?? type.knockback ?? 140),
    r: Number(overrides.r ?? attack.r ?? type.r ?? 5),
    life: Number(overrides.life ?? attack.life ?? type.life ?? 1.2),
    kind: overrides.kind ?? attack.kind ?? type.kind ?? 'weapon_shot',
    color: overrides.color ?? attack.color ?? type.color ?? '#ffd7aa',
    pierceCount: Number(overrides.pierceCount ?? attack.pierceCount ?? type.pierceCount ?? 0),
    hitOptions,
    recoil: Number(overrides.recoil ?? attack.recoil ?? type.recoil ?? 0),
    muzzleRing: Number(overrides.muzzleRing ?? attack.muzzleRing ?? type.muzzleRing ?? 0),
    burstCount: Number(overrides.burstCount ?? attack.burstCount ?? type.burstCount ?? 1),
    burstDelay: Number(overrides.burstDelay ?? attack.burstDelay ?? type.burstDelay ?? 0),
    spread: Number(overrides.spread ?? attack.spread ?? type.spread ?? 0),
  };
}

Neo.PROJECTILE_TYPE_DEFS = PROJECTILE_TYPE_DEFS;
Neo.WEAPON_PROJECTILE_ATTACKS = WEAPON_PROJECTILE_ATTACKS;
Neo.getWeaponProjectileAttack = getWeaponProjectileAttack;
Neo.isProjectileWeaponKey = isProjectileWeaponKey;
Neo.getProjectileWeaponKeys = getProjectileWeaponKeys;
Neo.buildWeaponProjectileConfig = buildWeaponProjectileConfig;
