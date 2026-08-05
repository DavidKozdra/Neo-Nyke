(function initializeSharedRivalSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedRivalSystemApi() {
  'use strict';

  const deterministicRandom = () => 0.5;
  // Rival personality is gameplay data, not browser-only dialogue metadata.
  // Campaign and authority both consume this table to decide warning, aggression
  // and retreat behavior. Dialogue text remains in the UI content definition.
  const RIVAL_PERSONALITIES = Object.freeze({
    princess: Object.freeze({ archetype: 'honorable', initialStance: 'guarded', aggression: 0.3, reactionDelay: 0.28, prediction: 0.16, retreatHp: 0.2, warningDistance: 185, triggerDistance: 125 }),
    thorn_knight: Object.freeze({ archetype: 'relentless', initialStance: 'aggressive', aggression: 1, reactionDelay: 0.12, prediction: 0.1, retreatHp: 0, warningDistance: 0, triggerDistance: 0 }),
    metao: Object.freeze({ archetype: 'opportunist', initialStance: 'opportunistic', aggression: 0.45, reactionDelay: 0.34, prediction: 0.42, retreatHp: 0.35, warningDistance: 155, triggerDistance: 100 }),
    gelleh: Object.freeze({ archetype: 'guardian', initialStance: 'guarded', aggression: 0.22, reactionDelay: 0.3, prediction: 0.2, retreatHp: 0.22, warningDistance: 205, triggerDistance: 135 }),
    mooggy: Object.freeze({ archetype: 'volatile', initialStance: 'volatile', aggression: 0.65, reactionDelay: 0.18, prediction: 0.08, retreatHp: 0.12, warningDistance: 135, triggerDistance: 95 }),
    turtle_boy: Object.freeze({ archetype: 'sentinel', initialStance: 'territorial', aggression: 0.18, reactionDelay: 0.42, prediction: 0.14, retreatHp: 0.15, warningDistance: 220, triggerDistance: 145 }),
  });
  const FALLBACK_PERSONALITY = Object.freeze({ archetype: 'wanderer', initialStance: 'guarded', aggression: 0.35, reactionDelay: 0.3, prediction: 0.15, retreatHp: 0.2, warningDistance: 175, triggerDistance: 115 });
  const RIVAL_DEFAULT_KIT_CHANCE = 0.8;
  const RIVAL_LOADOUTS = Object.freeze({
    princess: Object.freeze([
      { key: 'princess_wand', slot: 'melee', class: 'ranged', range: 380, preferredRange: 230, damageMult: 0.9, cooldownMult: 1.05, projectileCount: 1, spread: 0.05, projectileSpeed: 380 },
      { key: 'love_beam', slot: 'laser', class: 'ranged', range: 430, preferredRange: 210, damageMult: 1, cooldownMult: 1 }, { key: 'kicky_kick', slot: 'smash', class: 'melee', range: 60, preferredRange: 110, damageMult: 1.4, cooldownMult: 1.5, knockback: 620, roomLaunchChance: 0.1 }, { key: 'flying_unhitable', slot: 'dash', class: 'mobility', range: 340, preferredRange: 135, cooldownMult: 2.4, dashSpeed: 760, dashDuration: 0.32, invTime: 0.8 },
    ]),
    thorn_knight: Object.freeze([
      { key: 'thorns_bleed_blade', slot: 'melee', class: 'melee', range: 56, preferredRange: 120, damageMult: 1, cooldownMult: 0.84, knockback: 320 }, { key: 'blood_beam', slot: 'laser', class: 'ranged', range: 430, preferredRange: 270, damageMult: 0.86, cooldownMult: 1 }, { key: 'crimson_smash', slot: 'smash', class: 'melee', range: 92, preferredRange: 105, damageMult: 1.3, cooldownMult: 1.35, knockback: 430 }, { key: 'dash', slot: 'dash', class: 'dash', range: 250, preferredRange: 165, damageMult: 0.9, cooldownMult: 1, knockback: 300 },
    ]),
    metao: Object.freeze([
      { key: 'metao_fire_staff', slot: 'melee', class: 'ranged', range: 470, preferredRange: 300, damageMult: 0.92, cooldownMult: 1.14, projectileCount: 1, spread: 0.02, projectileSpeed: 460 }, { key: 'power_disks', slot: 'laser', class: 'burst', range: 390, preferredRange: 250, damageMult: 0.72, cooldownMult: 1, projectileCount: 8, spread: 0.16, projectileSpeed: 360 }, { key: 'chaos_burst', slot: 'smash', class: 'burst', range: 340, preferredRange: 220, damageMult: 0.85, cooldownMult: 1.12, projectileCount: 3, spread: 0.18, projectileSpeed: 380 }, { key: 'warp', slot: 'dash', class: 'mobility', range: 420, preferredRange: 150, cooldownMult: 1.9, dashSpeed: 920, dashDuration: 0.2, invTime: 0.5 },
    ]),
    gelleh: Object.freeze([
      { key: 'gelleh_lightning_spear', slot: 'melee', class: 'ranged', range: 420, preferredRange: 260, damageMult: 0.94, cooldownMult: 1, projectileCount: 2, spread: 0.08, projectileSpeed: 390 }, { key: 'blade_justice', slot: 'laser', class: 'melee', range: 124, preferredRange: 105, damageMult: 1.12, cooldown: 3.8, knockback: 320 }, { key: 'healing_zone', slot: 'smash', class: 'heal', preferredRange: 210, cooldownMult: 2.1, healRatio: 0.14 }, { key: 'zip_lightning', slot: 'dash', class: 'dash', range: 245, preferredRange: 160, damageMult: 1.08, cooldownMult: 1.1, knockback: 300, dashSpeed: 700 },
    ]),
    mooggy: Object.freeze([
      { key: 'claw_gauntlets', slot: 'melee', class: 'melee', range: 48, preferredRange: 110, damageMult: 1.05, cooldownMult: 0.7, knockback: 260 }, { key: 'nail_shot', slot: 'laser', class: 'ranged', range: 460, preferredRange: 230, damageMult: 0.85, cooldownMult: 0.9, projectileCount: 3, spread: 0.22, projectileSpeed: 420 }, { key: 'random_pounce', slot: 'smash', class: 'dash', range: 245, preferredRange: 150, damageMult: 1.1, cooldownMult: 1, knockback: 320 }, { key: 'mooggy_zoomies', slot: 'dash', class: 'mobility', range: 360, preferredRange: 145, cooldownMult: 2, dashSpeed: 840, dashDuration: 0.38, hasteTime: 3.5 },
    ]),
    turtle_boy: Object.freeze([
      { key: 'extending_staff', slot: 'melee', class: 'melee', range: 130, preferredRange: 120, damageMult: 1.15, cooldownMult: 1.1, knockback: 500 }, { key: 'turtle_wave', slot: 'laser', class: 'ranged', range: 480, preferredRange: 280, damageMult: 0.9, cooldownMult: 1.25, projectileCount: 1, spread: 0, projectileSpeed: 420 }, { key: 'death_ball', slot: 'smash', class: 'burst', range: 360, preferredRange: 235, damageMult: 1.05, cooldownMult: 1.55, projectileCount: 1, spread: 0, projectileSpeed: 300 }, { key: 'dash', slot: 'dash', class: 'dash', range: 240, preferredRange: 160, damageMult: 1, cooldownMult: 1, knockback: 320 },
    ]),
  });
  const RIVAL_LOADOUT_ALTERNATIVES = Object.freeze({
    princess: Object.freeze([{ key: 'love_bomb_laser', slot: 'laser', class: 'burst', range: 420, preferredRange: 250, damageMult: 1, cooldownMult: 1 }, { key: 'princess_shield', slot: 'dash', class: 'mobility', range: 420, preferredRange: 160, cooldownMult: 1 }]),
    thorn_knight: Object.freeze([{ key: 'thorn_blood_beams', slot: 'laser', class: 'ranged', range: 450, preferredRange: 250, damageMult: 0.8, cooldownMult: 0.92, projectileCount: 2, spread: 0.1, projectileSpeed: 430 }, { key: 'knight_slash_dash', slot: 'dash', class: 'dash', range: 260, preferredRange: 170, damageMult: 1.2, cooldownMult: 1.05, knockback: 340 }]),
    metao: Object.freeze([{ key: 'wizard_lazer', slot: 'laser', class: 'ranged', range: 500, preferredRange: 320, damageMult: 1.1, cooldownMult: 1.3, projectileCount: 1, spread: 0, projectileSpeed: 520 }, { key: 'potion_bath', slot: 'smash', class: 'heal', preferredRange: 190, cooldownMult: 1.8, healRatio: 0.1 }]),
    gelleh: Object.freeze([{ key: 'excalibur_strike', slot: 'smash', class: 'burst', range: 360, preferredRange: 230, damageMult: 1, cooldownMult: 1.2, projectileCount: 3, spread: 0.12, projectileSpeed: 380 }, { key: 'holy_turrets', slot: 'smash', class: 'burst', range: 360, preferredRange: 240, damageMult: 0.8, cooldownMult: 1 }]),
    mooggy: Object.freeze([{ key: 'mooggy_blood_beam', slot: 'laser', class: 'ranged', range: 480, preferredRange: 250, damageMult: 0.95, cooldownMult: 1.1, projectileCount: 1, spread: 0.02, projectileSpeed: 480 }, { key: 'mooggy_hairball', slot: 'smash', class: 'burst', range: 330, preferredRange: 200, damageMult: 0.9, cooldownMult: 1.1, projectileCount: 4, spread: 0.2, projectileSpeed: 360 }]),
    turtle_boy: Object.freeze([{ key: 'turtle_powerup', slot: 'smash', class: 'mobility', range: 420, preferredRange: 180, cooldownMult: 1 }]),
  });

  function getCampaignRivalPersonality(characterKey) {
    return RIVAL_PERSONALITIES[String(characterKey || '')] || FALLBACK_PERSONALITY;
  }

  function createCampaignRivalBrain(characterKey = '') {
    const personality = getCampaignRivalPersonality(characterKey);
    const hostile = personality.initialStance === 'aggressive';
    return {
      stance: hostile ? 'hostile' : 'neutral', intention: hostile ? 'engage' : 'observe',
      decisionCd: 0, warningUntil: 0, warnedRoomKey: '', lastBarkAt: -999,
      lastEncounterRoomKey: '', retreatFloor: -1, claimedLoot: null,
      lastOutcome: 'No encounter yet', recentMoves: [],
    };
  }

  function getCampaignRivalLoadout(characterKey, options = {}) {
    const base = (RIVAL_LOADOUTS[String(characterKey || '')] || []).map(entry => ({ ...entry }));
    const alternatives = RIVAL_LOADOUT_ALTERNATIVES[String(characterKey || '')] || [];
    const random = typeof options.random === 'function' ? options.random : deterministicRandom;
    const defaultChance = Number.isFinite(Number(options.defaultChance)) ? Number(options.defaultChance) : RIVAL_DEFAULT_KIT_CHANCE;
    if (!base.length || !alternatives.length || Number(random()) < defaultChance) return base;
    const alternative = alternatives[Math.max(0, Math.min(alternatives.length - 1, Math.floor(Number(random()) * alternatives.length)))];
    const index = base.findIndex(entry => entry.slot === alternative.slot);
    if (index >= 0) base[index] = { ...alternative };
    return base;
  }

  // Pure shared stance transition. World code owns barks, particles and the
  // actual doorway traversal, but cannot substitute a different decision tree.
  function resolveCampaignRivalDisposition(options = {}) {
    const characterKey = options.characterKey || options.rivalCharacterKey;
    const personality = options.personality || getCampaignRivalPersonality(characterKey);
    const brain = options.brain || createCampaignRivalBrain(characterKey);
    const perception = options.perception || {};
    const floorNumber = Math.max(0, Number(options.floorNumber || 0));
    const elapsedSeconds = Math.max(0, Number(options.elapsedSeconds || 0));
    const hasHealingWeapon = !!options.hasHealingWeapon;
    const claimedPickupPresent = !!options.claimedPickupPresent;
    let transition = '';
    let reason = '';

    if (options.friend) {
      transition = brain.stance === 'friendly' && brain.intention === 'travel' ? '' : 'friendly';
      brain.stance = 'friendly'; brain.intention = 'travel';
      return { brain, personality, transition, reason: 'befriended' };
    }
    if (options.vendetta) {
      transition = brain.stance === 'hostile' && brain.intention === 'engage' ? '' : 'hostile';
      brain.stance = 'hostile'; brain.intention = 'engage';
      return { brain, personality, transition, reason: 'vendetta' };
    }
    if (brain.stance === 'retreating') {
      brain.intention = 'retreat';
      return { brain, personality, transition: '', reason: 'retreating' };
    }

    const hpRatio = Math.max(0, Math.min(1, Number(perception.hpRatio ?? 1)));
    const retreatAllowed = options.rivalRumbleStage == null
      && Number(personality.retreatHp || 0) > 0
      && Number(brain.retreatFloor) !== floorNumber
      && hpRatio <= Number(personality.retreatHp || 0);
    if (brain.stance === 'hostile' && retreatAllowed) {
      brain.stance = 'retreating'; brain.intention = 'retreat';
      return { brain, personality, transition: 'retreat', reason: 'low_health' };
    }
    if (brain.stance === 'hostile') {
      brain.intention = hpRatio < 0.72 && hasHealingWeapon ? 'recover' : 'engage';
      return { brain, personality, transition, reason };
    }

    if (brain.claimedLoot && !claimedPickupPresent) {
      brain.claimedLoot = null;
      brain.stance = 'hostile'; brain.intention = 'engage';
      return { brain, personality, transition: 'hostile', reason: 'claimed_loot' };
    }
    if (personality.archetype === 'opportunist' && perception.hasLineOfSight
      && Number(perception.distance || Infinity) < 290
      && (Number(perception.playerHpRatio ?? 1) < 0.5 || Number(perception.playerItemCount || 0) >= 12)) {
      brain.stance = 'hostile'; brain.intention = 'engage';
      return { brain, personality, transition: 'hostile', reason: 'opportunity' };
    }

    const warningDistance = Number(personality.warningDistance || 0);
    const triggerDistance = Number(personality.triggerDistance || warningDistance * 0.7);
    if (brain.stance === 'neutral' && warningDistance > 0 && perception.hasLineOfSight
      && Number(perception.distance || Infinity) <= warningDistance) {
      brain.stance = 'warning'; brain.intention = 'observe'; brain.warningUntil = elapsedSeconds + 2.2;
      return { brain, personality, transition: 'warning', reason: 'proximity' };
    }
    if (brain.stance === 'warning') {
      if (Number(perception.distance || Infinity) > warningDistance + 70) {
        brain.stance = 'neutral'; brain.intention = brain.claimedLoot ? 'claim_loot' : 'observe';
        return { brain, personality, transition: 'neutral', reason: 'warning_respected' };
      }
      if (elapsedSeconds >= Number(brain.warningUntil || 0) && Number(perception.distance || Infinity) <= triggerDistance) {
        brain.stance = 'hostile'; brain.intention = 'engage';
        return { brain, personality, transition: 'hostile', reason: 'ignored_warning' };
      }
      return { brain, personality, transition, reason };
    }
    brain.intention = brain.claimedLoot ? 'claim_loot' : 'observe';
    return { brain, personality, transition, reason };
  }

  return { RIVAL_PERSONALITIES, RIVAL_LOADOUTS, RIVAL_LOADOUT_ALTERNATIVES, RIVAL_DEFAULT_KIT_CHANCE, getCampaignRivalPersonality, createCampaignRivalBrain, getCampaignRivalLoadout, resolveCampaignRivalDisposition };
});
