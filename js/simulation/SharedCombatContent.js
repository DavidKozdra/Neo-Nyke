(function initializeSharedCombatContent(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.content = namespace.content || {};
  Object.assign(namespace.content, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedCombatContentApi() {
  'use strict';

  // This is the canonical, headless-safe source for weapon values used by both
  // the legacy browser game and multiplayer authority. Keep presentation out.
  const WEAPON_BASE_STATS = Object.freeze({
    extending_staff: Object.freeze({ damage: 38, cooldown: 0.55, range: 130, knockback: 500 }),
    hunters_bow: Object.freeze({ damage: 28, cooldown: 0.40, knockback: 180 }),
    thorns_bleed_blade: Object.freeze({ damage: 32, cooldown: 0.55, range: 90, knockback: 120 }),
    claw_gauntlets: Object.freeze({ damage: 26, cooldown: 0.38, range: 85, knockback: 90 }),
    lazer_glasses: Object.freeze({ damage: 18, cooldown: 3.60, knockback: 80 }),
    metao_fire_staff: Object.freeze({ damage: 22, cooldown: 0.75, range: 200, knockback: 100 }),
    magenta_degale: Object.freeze({ damage: 108, cooldown: 1.50, knockback: 480 }),
    magenta_p90: Object.freeze({ damage: 22, cooldown: 1.80, knockback: 140 }),
    gelleh_lightning_spear: Object.freeze({ damage: 45, cooldown: 2.00, knockback: 200 }),
    excalibur: Object.freeze({ damage: 202, cooldown: 2.00, range: 120, knockback: 600 }),
    katana_excalibur_777x: Object.freeze({ damage: 202, cooldown: 0.777, range: 130, knockback: 380 }),
    golden_fleece: Object.freeze({ damage: 20, cooldown: 0.50, range: 80, knockback: 80 }),
    void_piercer: Object.freeze({ damage: 55, cooldown: 0.80, knockback: 160 }),
    princess_wand: Object.freeze({ damage: 30, cooldown: 0.77, range: 120, knockback: 160 }),
    sarges_hammer: Object.freeze({ damage: 64, cooldown: 0.70, range: 120, knockback: 520 }),
  });

  const PROJECTILE_TYPE_DEFS = Object.freeze({
    arrow: Object.freeze({ kind: 'hunters_bow', color: '#f0fbff', speed: 820, r: 4, life: 0.9, pierceCount: 1, hitOptions: Object.freeze({ critBonus: 0.1 }) }),
    heavy_slug: Object.freeze({ kind: 'magenta_degale', color: '#ff8bd2', speed: 1240, r: 7, life: 0.9, recoil: 280 }),
    burst_round: Object.freeze({ kind: 'magenta_p90', color: '#ff9dd7', speed: 1200, r: 4, life: 0.8, recoil: 55 }),
    void_lance: Object.freeze({ kind: 'void_piercer', color: '#ffd2c0', speed: 760, r: 6, life: 1.2, pierceCount: 4, hitOptions: Object.freeze({ ignoreBarrier: true, critBonus: 0.2 }) }),
    royal_bolt: Object.freeze({ kind: 'princess_wand', color: '#ff9de8', speed: 680, r: 5, life: 1, pierceCount: 1, muzzleRing: 10, recoil: 160 }),
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
  });

  // Matches the starter inventory assigned by the campaign's
  // createDefaultPlayer(). The authority must create the same selected hero,
  // not an empty network-only version of one.
  const CHARACTER_STARTING_ITEMS = Object.freeze({
    princess: Object.freeze({ princes_glasses: 1 }),
    thorn_knight: Object.freeze({ neo_knife: 1, tooth_of_thorn: 2, tough_bandaid: 1 }),
    metao: Object.freeze({ mateos_bag: 1 }),
    gelleh: Object.freeze({ zap_to_extreme: 1 }),
    mooggy: Object.freeze({ hemes_scarf: 1, mooggy_zoomies: 1, churu_stick: 1 }),
    turtle_boy: Object.freeze({ turtle_shell: 1, dragon_orb: 1 }),
    sarge: Object.freeze({ copper_penny: 1 }),
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
    sarges_hammer: Object.freeze({ mode: 'sweep', arc: Math.PI * 0.9, color: '#7da3ff', shockRing: 44 }),
  });

  function getCharacterDefaultWeapon(characterKey) {
    return CHARACTER_DEFAULT_WEAPONS[characterKey] || CHARACTER_DEFAULT_WEAPONS.thorn_knight;
  }

  function getDefaultWeaponAttack(characterKey) {
    const weaponKey = getCharacterDefaultWeapon(characterKey);
    return { weaponKey, stats: WEAPON_BASE_STATS[weaponKey], behavior: DEFAULT_WEAPON_ATTACKS[weaponKey] };
  }

  return {
    WEAPON_BASE_STATS,
    PROJECTILE_TYPE_DEFS,
    WEAPON_PROJECTILE_ATTACKS,
    CHARACTER_DEFAULT_WEAPONS,
    CHARACTER_STARTING_ITEMS,
    DEFAULT_WEAPON_ATTACKS,
    getCharacterDefaultWeapon,
    getDefaultWeaponAttack,
  };
});
