(function initializeSharedEliteSystem(root, factory) {
  const definitions = typeof require === 'function' ? require('./SharedItemDefinitions.js') : (root.NeoNyke?.content || {});
  const api = factory(definitions);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEliteApi(definitions) {
  'use strict';

  // This is the campaign's enemy-held relic pool, extracted from ui/input.js.
  // It intentionally excludes loop-only Blue relics and vouchers.
  const CAMPAIGN_ELITE_INVENTORY_POOL = Object.freeze([
    'neo_knife', 'tooth_of_thorn', 'tough_bandaid', 'gold_vac', 'copycat_charm',
    'orb_of_blood', 'insurance', 'crit_charm', 'attack_servo', 'enemy_magnet',
    'scholar_cap', 'charged_adapter', 'explosive_jelly', 'dragon_orb', 'ricocete',
    'drink_master', 'turtle_shell', 'anchor_charm', 'iron_lung', 'iron_helm',
    'oracles_lens', 'shield_of_aegis', 'pendant_of_kronos', 'rich_mans_luck',
    'extra_battery', 'el_bartos_cape',
  ]);
  const ELITE_POWER_TYPES = Object.freeze(['lazered', 'enflamed', 'breezy', 'gross', 'nothing', 'giant', 'blessed']);
  const STATUS_KEYS = Object.freeze(['bleed', 'fire', 'poison', 'dark_drain', 'slow', 'static']);
  const ENEMY_AGGRESSION_EXEMPT_SOURCES = Object.freeze([
    'lava', 'thorn_mine', 'bomb_aoe', 'explosive_trap', 'red_spikes',
    'lightning_column', 'justice_of_sonichu', 'pvp_p2', 'pvp_p2_beam',
  ]);

  function randomValue(random) {
    if (typeof random === 'function') return Math.max(0, Math.min(0.999999999, Number(random()) || 0));
    if (typeof random?.next === 'function') return Math.max(0, Math.min(0.999999999, Number(random.next()) || 0));
    throw new TypeError('A deterministic random function or stream is required for elite construction');
  }

  function randomInteger(random, minimum, maximum) {
    return Math.floor(minimum + randomValue(random) * (maximum - minimum + 1));
  }

  function shuffleCampaignPool(pool, random) {
    const copy = [...pool];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(randomValue(random) * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function getCampaignWhiteItemPool(options = {}) {
    if (Array.isArray(options.whiteItemPool) && options.whiteItemPool.length) return options.whiteItemPool;
    const itemDefs = options.itemDefinitions || definitions.ITEM_DEFS || {};
    return Object.keys(itemDefs).filter(key => itemDefs[key]?.rarity === 'knight' && !itemDefs[key]?.voucher);
  }

  function rollCampaignEliteInventory(random, pool = CAMPAIGN_ELITE_INVENTORY_POOL) {
    const inventory = {};
    const shuffled = shuffleCampaignPool(pool, random);
    const slots = randomInteger(random, 1, 3);
    for (let index = 0; index < slots; index += 1) {
      const key = shuffled[index];
      if (!key) continue;
      inventory[key] = 1 + (randomValue(random) < 0.28 ? 1 : 0);
    }
    return inventory;
  }

  function rollCampaignBlessedEliteInventory(random, options = {}) {
    const inventory = {};
    const pool = getCampaignWhiteItemPool(options);
    const rolls = randomInteger(random, 10, 15);
    for (let index = 0; index < rolls; index += 1) {
      const key = pool[randomInteger(random, 0, Math.max(0, pool.length - 1))];
      if (key) inventory[key] = Number(inventory[key] || 0) + 1;
    }
    return inventory;
  }

  function rollCampaignEliteTypes(level, random) {
    const tokens = [];
    const normalizedLevel = Math.max(1, Math.floor(Number(level || 1)));
    for (let index = 0; index < Math.floor(normalizedLevel / 3); index += 1) {
      tokens.push(randomValue(random) < 0.5 ? 'knight' : 'knave');
    }
    for (let index = 0; index < normalizedLevel % 3; index += 1) {
      tokens.push(ELITE_POWER_TYPES[randomInteger(random, 0, ELITE_POWER_TYPES.length - 1)]);
    }
    return tokens;
  }

  // Returns the complete campaign elite state using normalized simulation field
  // names. Callers retain only their object-shape adapter (hp/max/dmg in the
  // browser, health/maxHealth/contactDamage on the authority).
  function resolveCampaignEliteProfile(base = {}, options = {}) {
    const random = options.random;
    const level = Math.max(1, Math.floor(Number(options.level || 1)));
    const suppliedTokens = Array.isArray(options.tokens) && options.tokens.length ? options.tokens : null;
    const tokens = suppliedTokens ? [...suppliedTokens] : rollCampaignEliteTypes(level, random);
    const countToken = token => tokens.filter(candidate => candidate === token).length;
    const inventory = options.inventory
      ? { ...options.inventory }
      : tokens.includes('blessed')
        ? rollCampaignBlessedEliteInventory(random, options)
        : rollCampaignEliteInventory(random, options.inventoryPool || CAMPAIGN_ELITE_INVENTORY_POOL);
    const stacks = key => Math.max(0, Number(inventory[key] || 0));
    const profile = {
      maxHealth: Math.max(1, Number(base.maxHealth || base.health || 1)),
      health: Math.max(1, Number(base.health || base.maxHealth || 1)),
      damage: Math.max(0, Number(base.damage || 0)),
      moveSpeed: Math.max(0, Number(base.moveSpeed || 0)),
      radius: Math.max(1, Number(base.radius || 1)),
      attackCooldown: Math.max(0, Number(base.attackCooldown || 0)),
      statusResistances: { ...(base.statusResistances || {}) },
      stunResistance: Math.max(0, Number(base.stunResistance || 0)),
      bleedResistance: Math.max(0, Number(base.bleedResistance || 0)),
      defenseMultiplier: Math.max(1, Number(base.defenseMultiplier || 1)),
      eliteTypes: tokens,
      eliteInventory: inventory,
    };

    const hpInventoryMultiplier = 1 + stacks('insurance') * 0.16 + stacks('turtle_shell') * 0.1 + stacks('iron_lung') * 0.24;
    const damageInventoryMultiplier = 1 + stacks('neo_knife') * 0.08 + stacks('orb_of_blood') * 0.14 + stacks('crit_charm') * 0.12 + stacks('oracles_lens') * 0.2;
    profile.maxHealth = Math.round(profile.maxHealth * hpInventoryMultiplier);
    profile.health = profile.maxHealth;
    profile.damage = Math.round(profile.damage * damageInventoryMultiplier);
    profile.moveSpeed *= 1 + stacks('attack_servo') * 0.08 + stacks('turtle_shell') * 0.04;
    profile.attackCooldown *= Math.max(0.52, 1 - stacks('charged_adapter') * 0.1);
    profile.radius = Math.round(profile.radius * (1 + stacks('iron_lung') * 0.04));
    profile.stunResistance = Math.max(profile.stunResistance, stacks('anchor_charm'));
    profile.bleedResistance = Math.max(profile.bleedResistance, Math.min(0.8, stacks('tough_bandaid') * 0.1));

    const eliteHpMultiplier = Number(options.eliteHpMultiplier ?? 1);
    profile.maxHealth = Math.round(profile.maxHealth * (1 + 0.75 * eliteHpMultiplier));
    profile.health = profile.maxHealth;
    profile.defenseMultiplier = Math.max(2, profile.defenseMultiplier);
    profile.eliteDurabilityV2 = true;

    const knight = countToken('knight');
    const knave = countToken('knave');
    profile.eliteBody = { knight, knave };
    profile.eliteKnightMult = Math.pow(1.15, knight);
    profile.maxHealth = Math.round(profile.maxHealth * profile.eliteKnightMult);
    profile.health = profile.maxHealth;
    profile.damage = Math.round(profile.damage * profile.eliteKnightMult);
    profile.moveSpeed *= Math.min(Number(options.knightSpeedCap ?? 1.45), profile.eliteKnightMult);
    profile.eliteUnfazed = knave;
    const statusKeys = Array.isArray(options.statusKeys) && options.statusKeys.length ? options.statusKeys : STATUS_KEYS;
    for (let index = 0; index < knave; index += 1) {
      const key = statusKeys[randomInteger(random, 0, statusKeys.length - 1)];
      profile.statusResistances[key] = Math.min(0.95, Math.max(0, Number(profile.statusResistances[key] || 0) + 0.01));
    }

    const enflamed = countToken('enflamed');
    const breezy = countToken('breezy');
    const gross = countToken('gross');
    profile.elitePowers = tokens.filter(token => ELITE_POWER_TYPES.includes(token));
    profile.eliteProcs = {
      fire: Math.min(0.95, enflamed * 0.12),
      cold: Math.min(0.95, breezy * 0.12),
      poison: Math.min(0.95, gross * 0.12),
    };
    if (breezy > 0) profile.statusResistances.slow = Math.min(0.95, Math.max(0, Number(profile.statusResistances.slow || 0) + breezy * 0.22));
    if (tokens.includes('lazered')) {
      profile.eliteLaserCd = 0.8 + randomValue(random) * 1.1;
      profile.eliteLaserModeIndex = 0;
    }
    if (tokens.includes('giant')) {
      profile.maxHealth = Math.round(profile.maxHealth * 1.35);
      profile.health = profile.maxHealth;
      profile.radius = Math.round(profile.radius * 1.45);
      profile.moveSpeed *= 0.84;
      profile.damage = Math.round(profile.damage * 1.1);
    }
    if (tokens.includes('blessed')) profile.eliteCrit = 0.18;
    return profile;
  }

  function applyProcRollback(chance, effectMultiplier = 1) {
    let rolledChance = Math.max(0, Number(chance || 0));
    let multiplier = Math.max(1, Number(effectMultiplier || 1));
    for (let guard = 0; rolledChance >= 1 && guard < 20; guard += 1) {
      rolledChance -= 0.2;
      multiplier *= 1.5;
    }
    return { procChance: Math.max(0, Math.min(0.999, rolledChance)), effectMultiplier: multiplier };
  }

  function resolveCampaignEliteCrit(enemy, options = {}) {
    const chance = Math.max(0, Math.min(0.95, Number(enemy?.elite ? enemy.eliteCrit : 0) || 0));
    if (chance <= 0) return { isCrit: false, chance: 0, multiplier: 1 };
    const isCrit = randomValue(options.random) < chance;
    return { isCrit, chance, multiplier: isCrit ? 1.4 : 1 };
  }

  // Enflamed/Gross/Breezy are status applications triggered by every damaging
  // elite hit. Keep their proc roll-back and the player-side status severity
  // common; runtime adapters only apply the returned status state and FX.
  function resolveCampaignElitePlayerHitProcs(enemy, player, options = {}) {
    const powers = enemy?.eliteProcs || {};
    const severity = Math.max(0, Number(options.negativeStatusMultiplier ?? player?.itemStats?.negativeStatusMultiplier ?? 1));
    const random = options.random;
    const results = [];
    [
      ['fire', powers.fire, 1, 2.8],
      ['poison', powers.poison, 1, 4.2],
      ['slow', powers.cold, 1, 4],
    ].forEach(([key, chance, stacks, duration]) => {
      if (!(Number(chance || 0) > 0)) return;
      const rolled = applyProcRollback(Number(chance || 0) * severity);
      if (randomValue(random) >= rolled.procChance) return;
      results.push({
        key, stacks, duration: duration * rolled.effectMultiplier,
        damageMultiplier: rolled.effectMultiplier,
      });
    });
    return results;
  }

  function applyCampaignCritRollback(critChance, critMultiplier) {
    let chance = Math.max(0, Number(critChance || 0));
    let multiplier = Math.max(1, Number(critMultiplier || 1));
    for (let guard = 0; chance >= 1 && guard < 20; guard += 1) {
      chance -= 0.25;
      multiplier *= 1.5;
    }
    return { critChance: chance, critMultiplier: multiplier };
  }

  function resolveCampaignEnemyTimeAggression(options = {}) {
    const minutes = Math.max(0, Number(options.elapsedSeconds || 0) / 60);
    const steps = Math.floor(minutes / 5);
    const aggressionCut = Math.max(0, Math.min(0.9, Number(options.overclockedWatchAggressionCut || 0)));
    const perStep = 0.05 * (1 - aggressionCut);
    const rolled = applyCampaignCritRollback(steps * perStep, 1.5 + steps * perStep);
    return {
      steps,
      critChance: Math.max(0, Math.min(1, rolled.critChance)),
      critMultiplier: rolled.critMultiplier,
      damageMultiplier: 1 + steps * perStep,
    };
  }

  function resolveCampaignEnemyAggressionHit(options = {}) {
    const sourceKey = String(options.sourceKey || '').toLowerCase();
    const enemy = options.enemy;
    const exempt = options.noEnemyAggression
      || ENEMY_AGGRESSION_EXEMPT_SOURCES.includes(sourceKey)
      || (enemy?.elite && Number(enemy.eliteCrit || 0) > 0);
    const aggression = resolveCampaignEnemyTimeAggression({
      elapsedSeconds: options.elapsedSeconds,
      overclockedWatchAggressionCut: options.overclockedWatchAggressionCut,
    });
    const baseDamage = Math.max(0, Number(options.damage || 0));
    if (exempt || aggression.steps <= 0 || baseDamage <= 0) {
      return { damage: baseDamage, isCrit: false, applied: false, aggression };
    }
    const isCrit = aggression.critChance > 0 && randomValue(options.random) < aggression.critChance;
    return {
      damage: baseDamage * aggression.damageMultiplier * (isCrit ? aggression.critMultiplier : 1),
      isCrit, applied: true, aggression,
    };
  }

  return {
    CAMPAIGN_ELITE_INVENTORY_POOL, ELITE_POWER_TYPES,
    rollCampaignEliteInventory, rollCampaignBlessedEliteInventory, rollCampaignEliteTypes,
    resolveCampaignEliteProfile, resolveCampaignEliteCrit, resolveCampaignElitePlayerHitProcs,
    applyCampaignCritRollback, resolveCampaignEnemyTimeAggression, resolveCampaignEnemyAggressionHit,
  };
});
