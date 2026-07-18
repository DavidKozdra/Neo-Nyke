(function initializeSharedForgeSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  namespace.content = namespace.content || {};
  Object.assign(namespace.simulation, api);
  Object.assign(namespace.content, {
    WEAPON_UPGRADEABLE_STATS: api.WEAPON_UPGRADEABLE_STATS,
    MOVE_UPGRADEABLE_STATS: api.MOVE_UPGRADEABLE_STATS,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedForgeSystemApi() {
  'use strict';

  const FORGE_COST_GROWTH = 0.05;
  const FORGE_VOUCHER_KEY = 'forge_voucher';
  const FORGE_VOUCHER_UPGRADE_STEPS = 5;
  const WEAPON_UPGRADEABLE_STATS = Object.freeze({
    damage: Object.freeze({ step: 5, min: 5, max: 9999, xpPerStep: 15, goldPerStep: 45 }),
    cooldown: Object.freeze({ step: -0.05, min: 0.05, max: 9999, xpPerStep: 20, goldPerStep: 60 }),
    range: Object.freeze({ step: 10, min: 10, max: 9999, xpPerStep: 13, goldPerStep: 39 }),
    knockback: Object.freeze({ step: 30, min: 0, max: 9999, xpPerStep: 10, goldPerStep: 30 }),
  });
  const MOVE_UPGRADEABLE_STATS = Object.freeze({
    damage: Object.freeze({ step: 5, min: 5, max: 9999, xpPerStep: 15, goldPerStep: 45 }),
    cooldown: Object.freeze({ step: -0.05, min: 0.05, max: 9999, xpPerStep: 20, goldPerStep: 60 }),
    duration: Object.freeze({ step: 0.1, min: 0.1, max: 30, xpPerStep: 13, goldPerStep: 39 }),
    range: Object.freeze({ step: 10, min: 10, max: 9999, xpPerStep: 13, goldPerStep: 39 }),
    critChance: Object.freeze({ step: 0.05, min: 0, max: 1, xpPerStep: 25, goldPerStep: 75 }),
  });

  const integer = value => Math.max(0, Math.floor(Number(value) || 0));
  const schemaFor = itemType => itemType === 'weapon'
    ? WEAPON_UPGRADEABLE_STATS
    : itemType === 'move' ? MOVE_UPGRADEABLE_STATS : null;

  function normalizeForgeSteps(staged = {}) {
    if (!staged || typeof staged !== 'object' || Array.isArray(staged)) return [];
    return Object.entries(staged).map(([key, count]) => {
      const [itemType, itemKey, statKey, extra] = String(key).split(':');
      return { itemType, itemKey, statKey, count: extra === undefined ? integer(count) : 0 };
    }).filter(step => step.count > 0);
  }

  function voucherFreeSteps(player) {
    const loose = integer(player?.forgeVoucherCharges);
    const stacks = integer(player?.items?.[FORGE_VOUCHER_KEY]);
    return loose + stacks * FORGE_VOUCHER_UPGRADE_STEPS;
  }

  function quoteForgeCommand(player, command = {}, content = {}) {
    const currency = command.currency === 'gold' ? 'gold' : 'xp';
    const steps = normalizeForgeSteps(command.staged);
    const weaponStats = content.WEAPON_BASE_STATS || {};
    const moveStats = content.MOVE_BASE_STATS || {};
    const ownedWeapons = player?.ownedWeapons || {};
    const ownedMoves = player?.ownedMoves || {};
    const applied = integer(player?.forgeUpgradesApplied);
    let free = voucherFreeSteps(player);
    let voucherSteps = 0;
    let total = 0;
    let index = applied;
    const accepted = [];

    for (const step of steps) {
      const schema = schemaFor(step.itemType);
      const definition = schema?.[step.statKey];
      const base = step.itemType === 'weapon' ? weaponStats[step.itemKey] : moveStats[step.itemKey];
      const owned = step.itemType === 'weapon' ? ownedWeapons[step.itemKey] : ownedMoves[step.itemKey];
      if (!definition || !base || !owned || !(step.statKey in base)) {
        return { ok: false, reason: 'INVALID_UPGRADE', currency, xp: 0, gold: 0, stagedSteps: 0, voucherSteps: 0, steps: [] };
      }
      const currentCount = integer(player?.anvilUpgrades?.[step.itemType]?.[step.itemKey]?.[step.statKey]);
      const floor = step.statKey === 'cooldown'
        ? Math.max(Number(definition.min), Number(base[step.statKey]) * 0.5)
        : Number(definition.min);
      const finalValue = Number(base[step.statKey]) + (currentCount + step.count) * Number(definition.step);
      if ((definition.step > 0 && finalValue > definition.max) || (definition.step < 0 && finalValue < floor - 1e-9)) {
        return { ok: false, reason: 'UPGRADE_CAP', currency, xp: 0, gold: 0, stagedSteps: 0, voucherSteps: 0, steps: [] };
      }
      accepted.push(step);
      for (let n = 0; n < step.count; n += 1) {
        if (free > 0) {
          free -= 1;
          voucherSteps += 1;
        } else {
          const baseCost = currency === 'gold' ? Number(definition.goldPerStep) * 2 : Number(definition.xpPerStep);
          total += Math.ceil(baseCost * Math.pow(1 + FORGE_COST_GROWTH, index));
        }
        index += 1;
      }
    }
    const stagedSteps = accepted.reduce((sum, step) => sum + step.count, 0);
    if (!stagedSteps) return { ok: false, reason: 'NO_UPGRADES', currency, xp: 0, gold: 0, stagedSteps: 0, voucherSteps: 0, steps: [] };
    const xp = currency === 'xp' ? total : 0;
    const gold = currency === 'gold' ? total : 0;
    if (Number(player?.xp || 0) < xp || Number(player?.coins || 0) < gold) {
      return { ok: false, reason: 'INSUFFICIENT_FUNDS', currency, xp, gold, stagedSteps, voucherSteps, steps: accepted };
    }
    return { ok: true, reason: null, currency, xp, gold, stagedSteps, voucherSteps, steps: accepted };
  }

  function consumeForgeVouchers(player, requestedSteps) {
    let remaining = integer(requestedSteps);
    const original = remaining;
    let loose = integer(player.forgeVoucherCharges);
    const looseUsed = Math.min(loose, remaining);
    loose -= looseUsed;
    remaining -= looseUsed;
    if (remaining > 0) {
      const items = player.items || (player.items = {});
      let stacks = integer(items[FORGE_VOUCHER_KEY]);
      const usedStacks = Math.min(stacks, Math.ceil(remaining / FORGE_VOUCHER_UPGRADE_STEPS));
      stacks -= usedStacks;
      const opened = usedStacks * FORGE_VOUCHER_UPGRADE_STEPS;
      const used = Math.min(opened, remaining);
      remaining -= used;
      loose += opened - used;
      items[FORGE_VOUCHER_KEY] = stacks;
    }
    player.forgeVoucherCharges = loose;
    return original - remaining;
  }

  function applyForgeCommand(player, command = {}, content = {}) {
    const quote = quoteForgeCommand(player, command, content);
    if (!quote.ok) return quote;
    player.xp = Number(player.xp || 0) - quote.xp;
    player.coins = Number(player.coins || 0) - quote.gold;
    consumeForgeVouchers(player, quote.voucherSteps);
    const upgrades = player.anvilUpgrades || (player.anvilUpgrades = { weapon: {}, move: {} });
    quote.steps.forEach(step => {
      const type = upgrades[step.itemType] || (upgrades[step.itemType] = {});
      const item = type[step.itemKey] || (type[step.itemKey] = {});
      item[step.statKey] = integer(item[step.statKey]) + step.count;
    });
    player.forgeUpgradesApplied = integer(player.forgeUpgradesApplied) + quote.stagedSteps;
    return quote;
  }

  return {
    FORGE_COST_GROWTH,
    FORGE_VOUCHER_KEY,
    FORGE_VOUCHER_UPGRADE_STEPS,
    WEAPON_UPGRADEABLE_STATS,
    MOVE_UPGRADEABLE_STATS,
    normalizeForgeSteps,
    voucherFreeSteps,
    quoteForgeCommand,
    applyForgeCommand,
  };
});
