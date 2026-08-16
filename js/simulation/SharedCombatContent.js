(function initializeSharedCombatContent(root, factory) {
  let enemyContent = root.NeoNyke?.content || null;
  if (typeof module !== 'undefined' && module.exports) {
    try {
      enemyContent = require('./SharedEnemyContent');
    } catch {
      enemyContent = null;
    }
  }
  const api = factory(enemyContent || {});
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.content = namespace.content || {};
  Object.assign(namespace.content, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedCombatContentApi(enemyContent) {
  'use strict';

  const CAMPAIGN_HERO_STAT_BASES = Object.freeze({
    maxHp: 120,
    moveSpeed: 228,
  });

  const DEFAULT_BUILT_IN_HERO_COMBAT_PROFILE = Object.freeze({
    damageMultiplier: 1,
    hpMultiplier: 1,
    moveSpeedMultiplier: 1,
    aoeRadiusMultiplier: 1,
    aoeDamageMultiplier: 1,
    laserCooldownMultiplier: 1,
  });

  const builtInHeroCombatProfile = overrides => Object.freeze({
    ...DEFAULT_BUILT_IN_HERO_COMBAT_PROFILE,
    ...overrides,
  });

  // Canonical headless-safe combat tuning for the built-in campaign heroes.
  // Presentation, unlocks, custom characters, and selectable-roster policy stay
  // in their existing adapters; both adapters consume these exact multipliers.
  const BUILT_IN_HERO_COMBAT_PROFILES = Object.freeze({
    princess: builtInHeroCombatProfile({
      damageMultiplier: 1.14,
      hpMultiplier: 1.0925,
      moveSpeedMultiplier: 0.95,
      aoeRadiusMultiplier: 0.95,
    }),
    thorn_knight: builtInHeroCombatProfile({ damageMultiplier: 1.08 }),
    metao: builtInHeroCombatProfile({
      damageMultiplier: 0.5,
      aoeRadiusMultiplier: 1.2,
      aoeDamageMultiplier: 1.35,
      laserCooldownMultiplier: 1.2,
    }),
    gelleh: builtInHeroCombatProfile({}),
    mooggy: builtInHeroCombatProfile({
      damageMultiplier: 0.6,
      hpMultiplier: 1.08,
    }),
    turtle_boy: builtInHeroCombatProfile({
      damageMultiplier: 0.8,
      hpMultiplier: 1.2,
    }),
    sarge: builtInHeroCombatProfile({
      damageMultiplier: 1.05,
      hpMultiplier: 0.9,
    }),
    knave: builtInHeroCombatProfile({
      damageMultiplier: 0.95,
      hpMultiplier: 0.82,
      moveSpeedMultiplier: 1.18,
    }),
  });

  function getBuiltInHeroCombatProfile(characterKey) {
    return Object.prototype.hasOwnProperty.call(BUILT_IN_HERO_COMBAT_PROFILES, characterKey)
      ? BUILT_IN_HERO_COMBAT_PROFILES[characterKey]
      : null;
  }

  // This is the canonical, headless-safe source for weapon values used by both
  // the legacy browser game and multiplayer authority. Keep presentation out.
  const WEAPON_BASE_STATS = Object.freeze({
    extending_staff: Object.freeze({ damage: 38, cooldown: 0.77, range: 130, knockback: 500 }),
    hunters_bow: Object.freeze({ damage: 28, cooldown: 0.40, knockback: 180 }),
    thorns_bleed_blade: Object.freeze({ damage: 32, cooldown: 0.35, range: 90, knockback: 120 }),
    claw_gauntlets: Object.freeze({ damage: 26, cooldown: 0.38, range: 85, knockback: 90 }),
    lazer_glasses: Object.freeze({ damage: 18, cooldown: 3.60, knockback: 80 }),
    metao_fire_staff: Object.freeze({ damage: 22, cooldown: 1.75, range: 200, knockback: 100, maxCharges: 2 }),
    magenta_degale: Object.freeze({ damage: 108, cooldown: 1.50, knockback: 480, maxCharges: 3 }),
    magenta_p90: Object.freeze({ damage: 22, cooldown: 1.80, knockback: 140, maxCharges: 5 }),
    gelleh_lightning_spear: Object.freeze({ damage: 45, cooldown: 0.75, knockback: 200 }),
    excalibur: Object.freeze({ damage: 202, cooldown: 1.554, range: 120, knockback: 600 }),
    katana_excalibur_777x: Object.freeze({ damage: 202, cooldown: 0.777, range: 130, knockback: 380, maxCharges: 2 }),
    golden_fleece: Object.freeze({ damage: 20, cooldown: 0.50, range: 80, knockback: 80 }),
    void_piercer: Object.freeze({ damage: 55, cooldown: 0.80, knockback: 160 }),
    princess_wand: Object.freeze({ damage: 30, cooldown: 0.77, range: 120, knockback: 160, maxCharges: 3 }),
    sarges_hammer: Object.freeze({ damage: 64, cooldown: 0.70, range: 120, knockback: 520 }),
    knave_blade: Object.freeze({ damage: 36, cooldown: 0.35, range: 96, knockback: 240 }),
    shield_bash: Object.freeze({ damage: 34, cooldown: 0.62, range: 100, knockback: 420 }),
    stone_fists: Object.freeze({ damage: 42, cooldown: 0.75, range: 105, knockback: 460 }),
  });

  const PROJECTILE_TYPE_DEFS = Object.freeze({
    arrow: Object.freeze({ kind: 'hunters_bow', color: '#f0fbff', speed: 820, r: 4, life: 0.9, pierceCount: 1, hitOptions: Object.freeze({ critBonus: 0.1 }) }),
    heavy_slug: Object.freeze({ kind: 'magenta_degale', color: '#ff8bd2', speed: 1240, r: 7, life: 0.9, recoil: 280 }),
    burst_round: Object.freeze({ kind: 'magenta_p90', color: '#ff9dd7', speed: 1200, r: 4, life: 0.8, recoil: 55 }),
    void_lance: Object.freeze({ kind: 'void_piercer', color: '#ffd2c0', speed: 760, r: 6, life: 1.2, pierceCount: 4, hitOptions: Object.freeze({ ignoreBarrier: true, critBonus: 0.2 }) }),
    royal_bolt: Object.freeze({ kind: 'princess_wand', color: '#ff9de8', speed: 680, r: 5, life: 1, pierceCount: 1, muzzleRing: 10, recoil: 160 }),
    sarges_hammer: Object.freeze({ kind: 'sarges_hammer', color: '#7da3ff', speed: 720, r: 11, life: 0.75, pierceCount: 0 }),
  });

  const WEAPON_PROJECTILE_ATTACKS = Object.freeze({
    hunters_bow: Object.freeze({ projectileType: 'arrow' }),
    magenta_degale: Object.freeze({ projectileType: 'heavy_slug' }),
    magenta_p90: Object.freeze({ projectileType: 'burst_round', burstCount: 5, burstDelay: 0.08, spread: 0.05 }),
    void_piercer: Object.freeze({ projectileType: 'void_lance' }),
    princess_wand: Object.freeze({ projectileType: 'royal_bolt' }),
  });

  const CHARACTER_DEFAULT_WEAPONS = Object.freeze({
    princess: 'princess_wand',
    thorn_knight: 'thorns_bleed_blade',
    metao: 'metao_fire_staff',
    gelleh: 'gelleh_lightning_spear',
    mooggy: 'claw_gauntlets',
    turtle_boy: 'extending_staff',
    sarge: 'sarges_hammer',
    knave: 'knave_blade',
  });

  // Matches the starter inventory assigned by the campaign's
  // createDefaultPlayer(). The authority must create the same selected hero,
  // not an empty network-only version of one.
  const CHARACTER_STARTING_ITEMS = Object.freeze({
    princess: Object.freeze({ princes_glasses: 1 }),
    thorn_knight: Object.freeze({ neo_knife: 1, tooth_of_thorn: 2, tough_bandaid: 2 }),
    metao: Object.freeze({ mateos_bag: 1, drink_master: 1 }),
    gelleh: Object.freeze({ zap_to_extreme: 1 }),
    mooggy: Object.freeze({ hemes_scarf: 1, mooggy_zoomies: 1, churu_stick: 1 }),
    turtle_boy: Object.freeze({ turtle_shell: 1, dragon_orb: 1 }),
    sarge: Object.freeze({ copper_penny: 1 }),
    // Pendant of Rock softens his paper-thin health, and the Artificer Charger
    // (the Knave's own cult tooling) doubles his level and widens his AOEs.
    knave: Object.freeze({ pendant_of_rock: 1, artificer_charger: 1 }),
  });

  // Exact default-weapon behavior authored in combat.js, represented without
  // browser effects so the authority can resolve the same attack.
  const DEFAULT_WEAPON_ATTACKS = Object.freeze({
    princess_wand: Object.freeze({ mode: 'projectile', projectileType: 'royal_bolt' }),
    thorns_bleed_blade: Object.freeze({ mode: 'sweep', arc: 1.04, color: '#ff6e8b', bleedChance: 0.10, bleedStacks: 1, bleedDuration: 5 }),
    metao_fire_staff: Object.freeze({ mode: 'volley', kind: 'fireball', count: 3, spread: 0.18, speed: 560, radius: 8, life: 1.6, splash: 48, splashDamage: 14, fireStacks: 2, fireDuration: 3.4, color: '#ff8a3d' }),
    gelleh_lightning_spear: Object.freeze({ mode: 'smite', stabDamage: 20, stabRange: 90, stabArc: 0.45, bladeDamage: 18, bladeSpeed: 820, bladeRadius: 7, bladeLife: 0.5, bladePierce: 99, chainRange: 280, chainJumpRange: 170, chainCount: 5, chainBaseDamage: 18, chainStepDamage: 4, color: '#bfe4ff' }),
    claw_gauntlets: Object.freeze({ mode: 'double_sweep', arc: Math.PI * 0.7, secondDelay: 0.12, angleOffsets: Object.freeze([-0.18, 0.18]), color: '#ff7a9a', bleedChance: 0.22, bleedStacks: 1, bleedDuration: 5 }),
    extending_staff: Object.freeze({ mode: 'sweep', arc: 1.45, color: '#ff3333' }),
    // The hammer lodges its first target in lightning, then recalls to Sarge.
    sarges_hammer: Object.freeze({ mode: 'projectile', projectileType: 'sarges_hammer', returning: true, lightning: true }),
    // Thorn's blade sharpened for an assassin: tighter arc, faster swing, and a
    // far higher bleed chance carrying two stacks instead of one.
    knave_blade: Object.freeze({ mode: 'sweep', arc: 1.10, color: '#ff4d6d', bleedChance: 0.35, bleedStacks: 2, bleedDuration: 5 }),
    shield_bash: Object.freeze({ mode: 'sweep', arc: 1.35, color: '#9cefff' }),
    stone_fists: Object.freeze({ mode: 'sweep', arc: 1.5, color: '#a8875e' }),
  });

  function getCharacterDefaultWeapon(characterKey) {
    return enemyContent.getPlayableEnemyDefinition?.(characterKey)?.defaultWeapon
      || CHARACTER_DEFAULT_WEAPONS[characterKey]
      || CHARACTER_DEFAULT_WEAPONS.thorn_knight;
  }

  function getCharacterStartingItems(characterKey) {
    const items = enemyContent.getPlayableEnemyDefinition?.(characterKey)?.startingItems
      || CHARACTER_STARTING_ITEMS[characterKey];
    return { ...(items || {}) };
  }

  function getDefaultWeaponAttack(characterKey) {
    const weaponKey = getCharacterDefaultWeapon(characterKey);
    return { weaponKey, stats: WEAPON_BASE_STATS[weaponKey], behavior: DEFAULT_WEAPON_ATTACKS[weaponKey] };
  }

  function mergeProjectileHitOptions(...sources) {
    const merged = {};
    sources.forEach(source => {
      if (source && typeof source === 'object') Object.assign(merged, source);
    });
    return Object.keys(merged).length ? merged : null;
  }

  // Both campaign and the multiplayer authority create these projectiles.  A
  // single factory is important: weapon-level tuning must override a reusable
  // projectile type, and an upgrade may override either without losing the
  // type's authored on-hit effects.
  function buildCampaignWeaponProjectileConfig(weaponKey, overrides = {}) {
    const attack = WEAPON_PROJECTILE_ATTACKS[weaponKey] || {};
    const projectileType = overrides.projectileType ?? attack.projectileType;
    if (!projectileType) return null;
    const type = PROJECTILE_TYPE_DEFS[projectileType] || {};
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
      hitOptions: mergeProjectileHitOptions(type.hitOptions, attack.hitOptions, overrides.hitOptions),
      recoil: Number(overrides.recoil ?? attack.recoil ?? type.recoil ?? 0),
      muzzleRing: Number(overrides.muzzleRing ?? attack.muzzleRing ?? type.muzzleRing ?? 0),
      burstCount: Number(overrides.burstCount ?? attack.burstCount ?? type.burstCount ?? 1),
      burstDelay: Number(overrides.burstDelay ?? attack.burstDelay ?? type.burstDelay ?? 0),
      spread: Number(overrides.spread ?? attack.spread ?? type.spread ?? 0),
    };
  }

  return {
    CAMPAIGN_HERO_STAT_BASES,
    BUILT_IN_HERO_COMBAT_PROFILES,
    getBuiltInHeroCombatProfile,
    WEAPON_BASE_STATS,
    PROJECTILE_TYPE_DEFS,
    WEAPON_PROJECTILE_ATTACKS,
    CHARACTER_DEFAULT_WEAPONS,
    CHARACTER_STARTING_ITEMS,
    DEFAULT_WEAPON_ATTACKS,
    getCharacterDefaultWeapon,
    getCharacterStartingItems,
    getDefaultWeaponAttack,
    buildCampaignWeaponProjectileConfig,
  };
});
