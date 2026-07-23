(function initializeSharedStatusSystem(root, factory) {
  const hitResolution = typeof require === 'function' ? require('./SharedHitResolutionSystem.js') : (root.NeoNyke?.simulation || {});
  const api = factory(hitResolution);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedStatusApi(hitResolution) {
  'use strict';

  // The campaign's canonical status-effect rules, extracted DOM-free so the
  // browser campaign and the server authority mutate the exact same model:
  // one statuses map shape, one application rule set (stack cap, duration
  // merge, resistance, the player's cold budget), one DoT cadence/damage
  // table, and one bleed-resistance divisor. Presentation (popups, sprays,
  // spread FX) stays with each caller.

  const STATUS_EFFECT_KEYS = ['bleed', 'fire', 'poison', 'dark_drain', 'slow', 'static'];
  const MAX_STATUS_STACKS = 6;
  const COLD_SECONDS_PER_STACK = 15;
  const FIRE_FREEZE_DURATION_MULTIPLIER = 0.5;

  // Mirrors BLEED_RESIST_SCALING / STATUS_RESIST_SCALING in game-core.js. The
  // browser re-exports these same objects, so there is one set of numbers.
  const CAMPAIGN_BLEED_RESIST_SCALING = Object.freeze({
    floorInLoop: 0.16,
    loop: 0.95,
    elite: 0.45,
    miniBoss: 0.4,
    boss: 1.1,
    rival: 0.75,
  });
  const CAMPAIGN_STATUS_RESIST_SCALING = Object.freeze({
    minute: 0.05,
    timeCap: 0.6,
    max: 0.85,
  });

  // Canonical DoT cadence and damage shapes (combat.js updateEnemyStatuses):
  // bleed/fire deal authored flat-per-stack damage that then goes through the
  // shared damage pipeline; poison/dark_drain/static deal a fraction of the
  // victim's max HP per stack so they stay relevant against tanky foes.
  const CAMPAIGN_STATUS_TICKS = Object.freeze({
    bleed: Object.freeze({ interval: 0.5, baseDamage: stacks => 1.8 + Math.max(1, Number(stacks || 1)) * 2.2 }),
    fire: Object.freeze({ interval: 0.45, baseDamage: stacks => 1.5 + Number(stacks || 0) * 1.8 }),
    poison: Object.freeze({ interval: 0.7, maxHpFraction: 0.008 }),
    dark_drain: Object.freeze({ interval: 0.6, maxHpFraction: 0.006, healScale: 0.2 }),
    static: Object.freeze({ interval: 0.5, maxHpFraction: 0.007 }),
    slow: Object.freeze({ interval: 0.32 }),
  });

  function createCampaignStatusMap() {
    return Object.fromEntries(STATUS_EFFECT_KEYS.map(key => [key, { stacks: 0, duration: 0, tick: 0 }]));
  }

  function ensureCampaignStatuses(entity) {
    if (!entity || typeof entity !== 'object') return createCampaignStatusMap();
    if (!entity.statuses || typeof entity.statuses !== 'object') entity.statuses = createCampaignStatusMap();
    STATUS_EFFECT_KEYS.forEach(key => {
      const state = entity.statuses[key];
      if (!state || typeof state !== 'object') entity.statuses[key] = { stacks: 0, duration: 0, tick: 0 };
      entity.statuses[key].stacks = Math.max(0, Number(entity.statuses[key].stacks || 0));
      entity.statuses[key].duration = Math.max(0, Number(entity.statuses[key].duration || 0));
      entity.statuses[key].tick = Number(entity.statuses[key].tick || 0);
    });
    return entity.statuses;
  }

  function getCampaignStatusStacks(entity, key) {
    return Math.max(0, Number(entity?.statuses?.[key]?.stacks || 0));
  }

  function clearCampaignStatus(entity, key) {
    const state = ensureCampaignStatuses(entity)[key];
    if (!state) return;
    state.stacks = 0;
    state.duration = 0;
    state.tick = 0;
    state.damageMultiplier = 1;
    state.ownerId = null;
  }

  function getColdStacksFromDuration(duration) {
    return Math.min(MAX_STATUS_STACKS, Math.max(0, Math.ceil((Number(duration || 0) - 0.001) / COLD_SECONDS_PER_STACK)));
  }

  // The numeric core of the campaign's applyStatus (core/status.js): immunity,
  // resistance-scaled stacks/duration, the 6-stack cap with max-duration merge,
  // and the player's cold stack-time budget. `options.resistance` is the
  // realized 0..0.95 resistance the caller looked up; `severity` is the
  // player's negativeStatusMultiplier (1 for enemies).
  function applyCampaignStatus(entity, key, stacks, duration, options = {}) {
    if (!entity || !STATUS_EFFECT_KEYS.includes(key)) return null;
    if (entity[`${key}Immune`]) return null;
    const statuses = ensureCampaignStatuses(entity);
    const state = statuses[key];
    const resistanceMultiplier = 1 - Math.max(0, Math.min(0.95, Number(options.resistance || 0)));
    const addedStacks = Math.max(0, Number(stacks || 0)) * resistanceMultiplier;
    const severity = Math.max(0, Number(options.severity ?? 1));
    const adjustedDuration = Math.max(0, Number(duration || 0)) * severity * resistanceMultiplier;
    if (key === 'slow' && options.playerColdBudget) {
      const existingBudget = Number(state.duration || 0) > 0
        ? Number(state.duration || 0)
        : Math.max(0, Number(state.stacks || 0)) * COLD_SECONDS_PER_STACK;
      state.duration = Math.min(
        MAX_STATUS_STACKS * COLD_SECONDS_PER_STACK * severity,
        existingBudget + addedStacks * COLD_SECONDS_PER_STACK * severity,
      );
      state.stacks = getColdStacksFromDuration(state.duration);
    } else {
      state.stacks = Math.min(MAX_STATUS_STACKS, Math.max(Number(state.stacks || 0), 0) + addedStacks);
      state.duration = Math.max(Number(state.duration || 0), adjustedDuration);
    }
    // Fire thaws an existing freeze/frostbite effect by cutting its remaining
    // duration in half. Player cold uses duration as a stack-time budget, so
    // refresh its visible stack count immediately after the reduction.
    if (key === 'fire' && addedStacks > 0) {
      const freeze = statuses.slow;
      if (Number(freeze.stacks || 0) > 0 && Number(freeze.duration || 0) > 0) {
        freeze.duration *= FIRE_FREEZE_DURATION_MULTIPLIER;
        if (options.playerColdBudget) freeze.stacks = getColdStacksFromDuration(freeze.duration);
      }
    }
    if (options.ownerId != null && addedStacks > 0) state.ownerId = options.ownerId;
    if (Number(options.damageMultiplier || 1) > 1 && Number(state.stacks || 0) > 0) {
      state.damageMultiplier = Math.max(Number(state.damageMultiplier || 1), Number(options.damageMultiplier));
    }
    return { addedStacks, stacks: state.stacks, duration: state.duration };
  }

  // Campaign bleed resistance divisor (combat.js getEnemyBleedResistance):
  // grows with floor-in-loop and loop count, plus flat bumps for elites,
  // mini-bosses, bosses and rivals. Mirror-exact copies resist nothing.
  function getCampaignBleedResistance(target = {}, progression = {}) {
    if (target.mirrorExactCopy) return 1;
    const depth = Math.max(1, Number(progression.progressionDepth || progression.floorNumber || 1));
    const maxFloor = Math.max(1, Number(progression.maxFloor || 10));
    const loopNumber = Math.max(1, Math.floor((depth - 1) / maxFloor) + 1);
    const floorInLoop = ((depth - 1) % maxFloor) + 1;
    const scaling = CAMPAIGN_BLEED_RESIST_SCALING;
    let resistance = 1;
    resistance += Math.max(0, floorInLoop - 1) * scaling.floorInLoop;
    resistance += Math.max(0, loopNumber - 1) * scaling.loop;
    if (target.elite) resistance += scaling.elite;
    if (target.miniBoss) resistance += scaling.miniBoss;
    if (target.boss || target.type === 'god') resistance += scaling.boss;
    if (target.type === 'rival' || target.type === 'mirror_knight') resistance += scaling.rival;
    return Math.max(1, resistance);
  }

  // Generic (non-bleed) enemy status resistance ramp (core/status.js): the
  // difficulty's statusResistScale grows with elapsed run time, capped.
  function getCampaignGenericStatusResistance(key, options = {}) {
    if (key === 'bleed') return 0;
    const scale = Number(options.statusResistScale || 0);
    if (scale <= 0) return 0;
    const cfg = CAMPAIGN_STATUS_RESIST_SCALING;
    const minutes = Math.max(0, Number(options.elapsedSeconds || 0) / 60);
    const timeRamp = Math.min(cfg.timeCap, minutes * cfg.minute);
    return Math.max(0, Math.min(cfg.max, scale * (1 + timeRamp)));
  }

  function getCampaignStatusTickDamage(key, stacks, maxHp, options = {}) {
    const count = Math.max(0, Number(stacks || 0));
    const maximum = Math.max(1, Number(maxHp || 1));
    if (options.targetKind === 'player') {
      if (key === 'bleed') return 1.2 + count * 1.3;
      if (key === 'fire') return (1 + count * 1.6) * Math.max(0.2, 1 - Math.max(0, Number(options.fireResistance || 0)));
      if (key === 'poison') return maximum * (0.004 + count * 0.0025);
      if (key === 'dark_drain') return maximum * (0.003 + count * 0.002);
      if (key === 'static') return maximum * (0.004 + count * 0.003);
      return 0;
    }
    const config = CAMPAIGN_STATUS_TICKS[key];
    if (!config) return 0;
    if (config.baseDamage) return config.baseDamage(count);
    if (config.maxHpFraction) {
      return Math.max(1, maximum * config.maxHpFraction * count);
    }
    return 0;
  }

  // Advance every DoT on an entity by dt, in the campaign's order (bleed →
  // fire → poison → dark_drain → static → slow decay). The caller owns damage
  // delivery and presentation through hooks:
  //   dealDamage(key, rawDamage, state) → actually applied damage (scaling,
  //     popups, death handling). Return value is echoed in the results.
  //   isDead() → stop ticking further statuses once the victim died mid-tick.
  //   onTick(key, state) → per-tick side effects (poison/static spread).
  function tickCampaignStatuses(entity, dt, hooks = {}) {
    const statuses = ensureCampaignStatuses(entity);
    const results = [];
    const isDead = () => (typeof hooks.isDead === 'function' ? hooks.isDead() : !!entity.dead);
    const requestedKeys = Array.isArray(hooks.keys) ? new Set(hooks.keys) : null;
    for (const key of ['bleed', 'fire', 'poison', 'dark_drain', 'static']) {
      if (requestedKeys && !requestedKeys.has(key)) continue;
      const state = statuses[key];
      if (Number(state.stacks || 0) <= 0) continue;
      if (entity[`${key}Immune`]) {
        clearCampaignStatus(entity, key);
        continue;
      }
      const durationDecay = typeof hooks.getDurationDecay === 'function'
        ? Math.max(0, Number(hooks.getDurationDecay(key, state) || 0))
        : 1;
      state.duration -= dt * durationDecay;
      state.tick -= dt;
      if (state.tick <= 0) {
        state.tick = CAMPAIGN_STATUS_TICKS[key].interval;
        const raw = getCampaignStatusTickDamage(key, state.stacks, hooks.maxHp ?? entity.maxHp ?? entity.maxHealth ?? entity.max, {
          targetKind: hooks.targetKind,
          fireResistance: hooks.fireResistance,
        })
          * Math.max(1, Number(state.damageMultiplier || 1));
        const dealt = typeof hooks.dealDamage === 'function' ? hooks.dealDamage(key, raw, state) : 0;
        results.push({ key, dealt, stacks: state.stacks, state });
        if (isDead()) return results;
        if (typeof hooks.onTick === 'function') hooks.onTick(key, state, dealt);
      }
      if (state.duration <= 0) clearCampaignStatus(entity, key);
    }
    const slow = statuses.slow;
    if (requestedKeys && !requestedKeys.has('slow')) return results;
    if (Number(slow.stacks || 0) > 0) {
      slow.duration -= dt;
      slow.tick -= dt;
      if (slow.tick <= 0) {
        slow.tick = CAMPAIGN_STATUS_TICKS.slow.interval;
        if (typeof hooks.onTick === 'function') hooks.onTick('slow', slow);
      }
      if (slow.duration <= 0) clearCampaignStatus(entity, 'slow');
      else if (hooks.playerColdBudget) slow.stacks = getColdStacksFromDuration(slow.duration);
    }
    return results;
  }

  // Derived debuff multipliers (core/status.js). `severity` is the player's
  // negativeStatusMultiplier; enemies always pass 1.
  function getCampaignSlowMultiplier(stacks, severity = 1) {
    const applied = Math.max(0, Number(stacks || 0));
    if (applied <= 0) return 1;
    return Math.max(0.35, 1 - applied * 0.1 * Math.max(0, Number(severity || 1)));
  }

  function getCampaignPoisonDamageMultiplier(stacks, severity = 1) {
    const applied = Math.max(0, Number(stacks || 0));
    if (applied <= 0) return 1;
    return Math.max(0.85, 1 - applied * 0.01 * Math.max(0, Number(severity || 1)));
  }

  function getCampaignBrittleDefenseMultiplier(stacks, severity = 1) {
    const applied = Math.max(0, Number(stacks || 0));
    if (applied <= 0) return 1;
    return Math.max(0, 1 - applied * 0.25 * Math.max(0, Number(severity || 1)));
  }

  // The itemStats-driven on-hit status procs from the campaign's hitEnemy():
  // authored weapon bleed/fire, item bleed, Snake Knife poison, Weapon Fatigue
  // chill/freeze, Confuse Ray stun, Overstimulate stun and lightning Static.
  // Returns a list of applications; the caller applies each with its own
  // status/stun machinery and presentation.
  function resolveCampaignOnHitStatusProcs(context = {}) {
    const stats = context.itemStats || {};
    const options = context.hitOptions || {};
    const random = context.random;
    const procs = [];
    const roll = chance => hitResolution.resolveCampaignProc(chance, { random });
    const pushStatus = (key, chance, stacks, duration) => {
      if (!(Number(chance || 0) > 0)) return;
      const rolled = roll(chance);
      if (!rolled.triggered) return;
      procs.push({
        kind: 'status',
        key,
        stacks,
        duration: Number(duration || 0) * rolled.durationMultiplier,
        damageMultiplier: rolled.effectMultiplier,
      });
    };
    // Keep this order identical to the campaign hitEnemy operation. Seeded
    // encounter RNG must be consumed in the same order locally and remotely.
    if (Number(stats.confuseRayStunChance || 0) > 0) {
      const rolled = roll(stats.confuseRayStunChance);
      if (rolled.triggered) procs.push({ kind: 'stun', presentation: 'stun', seconds: 0.55 * rolled.effectMultiplier });
    }
    if (context.canBlind !== false && Number(stats.confuseRayBlindChance || 0) > 0) {
      const rolled = roll(stats.confuseRayBlindChance);
      if (rolled.triggered) procs.push({ kind: 'blind', presentation: 'blind', seconds: 1.6 * rolled.effectMultiplier });
    }
    pushStatus('poison', stats.snakeKnifePoisonChance, 1, 4);
    pushStatus('slow', stats.weaponFatigueChance, 1, 4);
    if (Number(stats.weaponFatigueFreezeChance || 0) > 0) {
      const rolled = roll(stats.weaponFatigueFreezeChance);
      if (rolled.triggered) {
        procs.push({ kind: 'freeze', seconds: 0.6 * rolled.effectMultiplier, slowStacks: 1, slowDuration: 4 * rolled.effectMultiplier });
      }
    }
    if (Number(stats.overstimulateStunChance || 0) > 0 && Number(context.activeStatusCount || 0) >= 2) {
      const rolled = roll(stats.overstimulateStunChance);
      if (rolled.triggered) procs.push({ kind: 'stun', presentation: 'stimulated', seconds: 1.4 * rolled.effectMultiplier });
    }
    if (options.lightning && Number(context.targetSlowStacks || 0) > 0) {
      const rolled = roll(0.35);
      if (rolled.triggered) procs.push({ kind: 'stun', presentation: 'shock', seconds: 0.62 });
    }
    if (options.lightning && !options.noStatic) {
      procs.push({ kind: 'status', key: 'static', stacks: 1 + Math.max(0, Number(context.copperPennyStacks || 0)), duration: 4, damageMultiplier: 1 });
    }
    pushStatus('bleed', options.bleedChance, Number(options.bleedStacks || 1), Number(options.bleedDuration || 4));
    pushStatus('fire', options.fireChance, Number(options.fireStacks || 1), Number(options.fireDuration || 2.8));
    // Item bleed is not implicit: campaign weapon paths decide whether the hit
    // type can proc it and opt in. This prevents projectiles from gaining a proc
    // that the single-player operation never supplied.
    pushStatus('bleed', options.itemBleedChance, 1, 5);
    return procs;
  }

  return {
    STATUS_EFFECT_KEYS,
    MAX_STATUS_STACKS,
    COLD_SECONDS_PER_STACK,
    FIRE_FREEZE_DURATION_MULTIPLIER,
    CAMPAIGN_STATUS_TICKS,
    CAMPAIGN_BLEED_RESIST_SCALING,
    CAMPAIGN_STATUS_RESIST_SCALING,
    createCampaignStatusMap,
    ensureCampaignStatuses,
    getCampaignStatusStacks,
    clearCampaignStatus,
    getColdStacksFromDuration,
    applyCampaignStatus,
    getCampaignBleedResistance,
    getCampaignGenericStatusResistance,
    getCampaignStatusTickDamage,
    tickCampaignStatuses,
    getCampaignSlowMultiplier,
    getCampaignPoisonDamageMultiplier,
    getCampaignBrittleDefenseMultiplier,
    resolveCampaignOnHitStatusProcs,
  };
});
