// projectile-types.js — projectile presets and weapon projectile attack data.

const PROJECTILE_TYPE_DEFS = {
  arrow: {
    kind: 'hunters_bow',
    color: '#f0fbff',
    speed: 820,
    r: 4,
    life: 0.9,
    pierceCount: 1,
    hitOptions: { critBonus: 0.1 },
  },
  heavy_slug: {
    kind: 'magenta_degale',
    color: '#ff8bd2',
    speed: 1240,
    r: 7,
    life: 0.9,
    recoil: 280,
  },
  burst_round: {
    kind: 'magenta_p90',
    color: '#ff9dd7',
    speed: 1200,
    r: 4,
    life: 0.8,
    recoil: 55,
  },
  void_lance: {
    kind: 'void_piercer',
    color: '#ffd2c0',
    speed: 760,
    r: 6,
    life: 1.2,
    pierceCount: 4,
    hitOptions: { ignoreBarrier: true, critBonus: 0.2 },
  },
  royal_bolt: {
    kind: 'princess_wand',
    color: '#ff9de8',
    speed: 680,
    r: 5,
    life: 1,
    pierceCount: 1,
    muzzleRing: 10,
    recoil: 160,
  },
};

const WEAPON_PROJECTILE_ATTACKS = {
  hunters_bow: { projectileType: 'arrow' },
  magenta_degale: { projectileType: 'heavy_slug' },
  magenta_p90: {
    projectileType: 'burst_round',
    burstCount: 5,
    burstDelay: 0.04,
    spread: 0.05,
  },
  void_piercer: { projectileType: 'void_lance' },
  princess_wand: { projectileType: 'royal_bolt' },
};

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
