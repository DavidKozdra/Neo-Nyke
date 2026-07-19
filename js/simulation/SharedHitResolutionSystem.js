(function initializeSharedHitResolutionSystem(root, factory) {
  const itemEffects = typeof require === 'function' ? require('./SharedItemEffectSystem.js') : (root.NeoNyke?.simulation || {});
  const api = factory(itemEffects);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedHitResolutionApi(itemEffects) {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const next = random => {
    if (typeof random === 'function') return random();
    if (typeof random?.next === 'function') return random.next();
    return 1;
  };

  function applyProcRollback(procChance, effectMultiplier = 1) {
    let chance = Number(procChance) || 0;
    let multiplier = Number(effectMultiplier) || 1;
    for (let guard = 0; chance >= 1 && guard < 20; guard += 1) {
      multiplier *= 1.5;
      chance -= 0.2;
    }
    return { procChance: chance, effectMultiplier: multiplier };
  }

  function resolveCampaignCrit(options = {}) {
    const stats = options.itemStats || {};
    const rolled = itemEffects.applyCritRollback?.(
      Number(stats.critChance || 0) + Number(options.critBonus || 0),
      Number(stats.critMultiplier || 1.6),
    ) || { critChance: Number(stats.critChance || 0), critMultiplier: Number(stats.critMultiplier || 1.6) };
    const chance = clamp(rolled.critChance, 0, 1);
    const forced = !!options.forced;
    return {
      isCrit: forced || (chance > 0 && next(options.random) < chance),
      forced,
      critChance: chance,
      critMultiplier: Math.max(1, Number(rolled.critMultiplier || 1)),
    };
  }

  function resolveCampaignProc(chance, options = {}) {
    const rolled = applyProcRollback(chance, options.baseMultiplier || 1);
    const procChance = clamp(rolled.procChance, 0, 0.999);
    const effectMultiplier = Math.max(1, Number(rolled.effectMultiplier || 1));
    return {
      triggered: procChance > 0 && next(options.random) < procChance,
      procChance,
      effectMultiplier,
      durationMultiplier: options.durationScales === false ? 1 : effectMultiplier,
    };
  }

  return { applyProcRollback, resolveCampaignCrit, resolveCampaignProc };
});
