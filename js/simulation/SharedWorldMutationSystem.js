(function initializeSharedWorldMutationSystem(root, factory) {
  const definitions = typeof require === 'function' ? require('./SharedItemDefinitions.js') : (root.NeoNyke?.content || {});
  const api = factory(definitions);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedWorldMutationApi(definitions) {
  'use strict';

  const GREEN_DROP_CHANCE = 0.1;
  const GREEN_ITEM_POOL = Object.freeze(Object.entries(definitions.ITEM_DEFS || {})
    .filter(([, item]) => item?.rarity === 'green').map(([key]) => key).sort());

  function applyCampaignDestructibleDamage(prop, damage, options = {}) {
    if (!prop || prop.broken || prop.hidden) return { ok: false, reason: 'NOT_DAMAGEABLE', drops: [] };
    const numericDamage = Math.max(0, Number(damage || 0));
    const dealt = Math.max(0, Math.round(numericDamage));
    if (!Number.isFinite(prop.maxHp) || prop.maxHp <= 0) prop.maxHp = Math.max(1, Number(prop.hp || 0), dealt || 1);
    prop.hp = Number(prop.hp || prop.maxHp) - numericDamage;
    if (prop.hp > 0) return { ok: true, broken: false, dealt, health: prop.hp, drops: [] };
    prop.hp = 0;
    prop.broken = true;
    prop.breakAge = 0;
    const drops = [];
    const greenRandom = typeof options.greenRandom === 'function' ? options.greenRandom : Math.random;
    const potRandom = typeof options.potRandom === 'function' ? options.potRandom : Math.random;
    if (['barrel', 'pot'].includes(prop.kind) && Number(options.runLoopIndex || 0) >= 1
      && GREEN_ITEM_POOL.length && greenRandom() < GREEN_DROP_CHANCE) {
      drops.push({ type: 'item', key: GREEN_ITEM_POOL[Math.floor(greenRandom() * GREEN_ITEM_POOL.length)] || GREEN_ITEM_POOL[0], source: 'green' });
    }
    if (prop.kind === 'pot') {
      const chance = Math.max(0, Math.min(1, Number(options.itemChance ?? 0.12)));
      drops.push(potRandom() < chance
        ? { type: 'item', key: options.rollItem?.(potRandom) || '', source: 'pot' }
        : { type: 'coin', amount: 6 + Math.max(1, Number(options.floorNumber || 1)), source: 'pot' });
    }
    const revealed = [];
    if (prop.kind === 'wall') {
      (options.destructibles || []).forEach(other => {
        if (!other?.hidden) return;
        if ((prop.revealGroup && other.revealGroup === prop.revealGroup)
          || (!prop.revealGroup && Math.hypot(Number(other.x) - Number(prop.x), Number(other.y) - Number(prop.y)) <= 220)) {
          other.hidden = false;
          revealed.push(other);
        }
      });
    }
    if (prop.kind === 'secret_wall') prop.secretRevealed = true;
    return {
      ok: true, broken: true, dealt, health: 0, drops, revealed,
      blast: prop.kind === 'barrel' ? { radius: 130, damage: 55 } : null,
      secretDirection: prop.kind === 'secret_wall' ? prop.secretDir || '' : '',
    };
  }

  return { GREEN_DROP_CHANCE, GREEN_ITEM_POOL, applyCampaignDestructibleDamage };
});
