(function initializeSharedPlayerDamageSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedPlayerDamageApi() {
  'use strict';

  // The authoritative and browser campaigns deliberately share this small,
  // side-effect-free policy. Callers own input validity, invulnerability,
  // animation and death presentation; this module owns the part that must
  // never drift: mitigation, barriers, per-hit caps and the one-shot guard.
  function resolveCampaignPlayerDamage(options = {}) {
    const maximumHealth = Math.max(1, Number(options.maxHp || options.health || 1));
    const healthBefore = Math.max(0, Number(options.health || 0));
    const rawDamage = Math.max(0, Number(options.damage || 0));
    const multiplier = Math.max(0, Number(options.damageMultiplier ?? 1));
    const reduction = Math.max(0, Math.min(0.85, Number(options.damageReduction || 0)));
    const flatReduction = Math.max(0, Number(options.flatDamageReduction || 0));
    const barrierBefore = Math.max(0, Number(options.barrier || 0));

    let incoming = Math.max(0, rawDamage * multiplier * (1 - reduction) - flatReduction);
    if (options.ironLungApplies && !options.ignoreDamageCaps) {
      incoming = Math.min(incoming, maximumHealth * 0.2);
    }
    const absorbed = Math.min(incoming, barrierBefore);
    const barrier = Math.max(0, barrierBefore - absorbed);
    let dealt = Math.max(0, incoming - absorbed);

    if (options.applyDamageCaps !== false && !options.ignoreDamageCaps && !options.ignoreOneShotGuard) {
      const defaultRatio = options.bossLike ? 0.62 : 0.48;
      const maxHitRatio = Number.isFinite(Number(options.maxHitRatio))
        ? Math.max(0, Math.min(1, Number(options.maxHitRatio)))
        : defaultRatio;
      dealt = Math.min(dealt, Math.max(18, maximumHealth * maxHitRatio));
      if (healthBefore > maximumHealth * 0.35 && healthBefore - dealt <= 0) {
        dealt = Math.max(0, healthBefore - 1);
      }
    } else if (Number.isFinite(Number(options.maxHitRatio))) {
      dealt = Math.min(dealt, maximumHealth * Math.max(0, Math.min(1, Number(options.maxHitRatio))));
    }

    return {
      healthBefore,
      health: Math.max(0, healthBefore - dealt),
      maximumHealth,
      incoming,
      absorbed,
      barrier,
      dealt,
      fullyAbsorbed: incoming > 0 && dealt <= 0,
    };
  }

  return { resolveCampaignPlayerDamage };
});
