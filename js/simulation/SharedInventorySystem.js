(function initializeSharedInventorySystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  namespace.content = namespace.content || {};
  Object.assign(namespace.simulation, api);
  Object.assign(namespace.content, { EQUIPMENT_ACTIVE_DEFS: api.EQUIPMENT_ACTIVE_DEFS, ACTIVATABLE_ITEM_KEYS: api.ACTIVATABLE_ITEM_KEYS });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedInventorySystemApi() {
  'use strict';

  const EQUIPMENT_ACTIVE_DEFS = Object.freeze({
    charged_adapter: Object.freeze({ kind: 'ladder_warp' }),
    mateos_bag: Object.freeze({ kind: 'potion' }),
    pew_pew_box: Object.freeze({ cooldown: 34, duration: 8, durationPerStack: 1.5, kind: 'missiles' }),
    skizzard_tail: Object.freeze({ cooldown: 38, duration: 5, durationPerStack: 1.5, kind: 'regen' }),
    zap_to_extreme: Object.freeze({ cooldown: 42, duration: 10, durationPerStack: 2, kind: 'lightning' }),
    panic_button: Object.freeze({ cooldown: 52, duration: 0, kind: 'panic' }),
    mid_sweepy_box: Object.freeze({ cooldown: 36, duration: 6, durationPerStack: 1.5, kind: 'mines' }),
    el_bartos_cape: Object.freeze({ cooldown: 25, duration: 10, durationPerStack: 5, kind: 'cape' }),
    sparkle_charm: Object.freeze({ cooldown: 40, duration: 0, kind: 'sparkle' }),
    churu_stick: Object.freeze({ cooldown: 40, minimumCooldown: 20, cooldownReductionPerStack: 4, duration: 0, kind: 'heal' }),
    iron_helm: Object.freeze({ cooldown: 60, duration: 0, kind: 'shield' }),
    gold_vac: Object.freeze({ cooldown: 40, duration: 120, durationPerStack: 30, kind: 'vacuum' }),
  });
  const ACTIVATABLE_ITEM_KEYS = Object.freeze(Object.keys(EQUIPMENT_ACTIVE_DEFS));
  const MOVE_SLOTS = new Set(['melee', 'laser', 'smash', 'dash']);
  const SCROLL_ITEM_KEYS = new Set(['scroll_reroll', 'scroll_branching', 'scroll_replace', 'scroll_abundance', 'scroll_pool_weight', 'scroll_ego']);
  const count = (player, key) => Math.max(0, Math.floor(Number(player?.items?.[key] || 0)));

  function syncEquipmentSlots(player) {
    if (!player) return [];
    const existing = Array.isArray(player.equipmentSlots) ? player.equipmentSlots : [];
    player.equipmentSlots = existing.filter((key, index) => (
      ACTIVATABLE_ITEM_KEYS.includes(key) && count(player, key) > 0 && existing.indexOf(key) === index
    )).slice(0, 8);
    ACTIVATABLE_ITEM_KEYS.forEach(key => {
      if (count(player, key) > 0 && !player.equipmentSlots.includes(key) && player.equipmentSlots.length < 8) player.equipmentSlots.push(key);
    });
    return player.equipmentSlots;
  }

  function collectCampaignItem(player, itemKey, options = {}) {
    if (!player || !itemKey) return { ok: false, reason: 'INVALID_ITEM', events: [] };
    const amount = Math.max(1, Math.floor(Number(options.amount) || 1));
    const previousCount = count(player, itemKey);
    player.items = player.items || {};
    player.items[itemKey] = previousCount + amount;
    for (let index = 0; index < amount; index += 1) {
      if (itemKey === 'titan_heart') {
        player.maxHp = Math.max(120, Math.round(Number(player.maxHp || 100) * 1.08));
        player.hp = Math.min(player.maxHp, Math.round(Number(player.hp || 0) * 1.08));
      } else if (itemKey === 'veggys_pendant') {
        const previousMax = Number(player.maxHp || 1);
        player.maxHp = Math.max(1, Math.round(previousMax * 1.04));
        player.hp = Math.min(player.maxHp, Math.round(Number(player.hp || 0) + player.maxHp - previousMax));
      } else if (itemKey === 'foleys_irish_newyork_charm') {
        player.maxHp = Math.max(1, Math.round(Number(player.maxHp || 1) + 15));
        player.hp = Math.min(player.maxHp, Math.round(Number(player.hp || 0) + 15));
      }
    }
    if (itemKey === 'robot_arm' && previousCount === 0) player.robotArmReady = true;
    if (itemKey === 'wizards_paw') player.wizardPawPendingCount = Math.max(0, Number(player.wizardPawPendingCount || 0)) + amount;
    if (itemKey === 'extra_battery') player.extraBatteryPendingCount = Math.max(0, Number(player.extraBatteryPendingCount || 0)) + amount;
    if (SCROLL_ITEM_KEYS.has(itemKey)) {
      player.scrollPendingQueue = Array.isArray(player.scrollPendingQueue) ? player.scrollPendingQueue : [];
      for (let index = 0; index < amount; index += 1) player.scrollPendingQueue.push(itemKey);
    }
    syncEquipmentSlots(player);
    return { ok: true, itemKey, amount, previousCount, events: [{ type: 'ITEM_COLLECTED', itemKey, amount }] };
  }

  function applyInventoryCommand(player, command = {}, content = {}) {
    if (!player) return { ok: false, reason: 'NO_PLAYER' };
    if (command.type === 'EQUIP_MOVE') {
      const slot = String(command.slot || '');
      const moveKey = String(command.moveKey || '');
      if (!MOVE_SLOTS.has(slot) || !moveKey || !player.ownedMoves?.[moveKey] || content.MOVE_SLOT_BY_KEY?.[moveKey] !== slot) {
        return { ok: false, reason: 'INVALID_MOVE' };
      }
      player.equippedMoves = player.equippedMoves || {};
      player.equippedMoves[slot] = moveKey;
      player.moveCooldownUntilTick = player.moveCooldownUntilTick || {};
      player.moveCooldownUntilTick[moveKey] = 0;
      return { ok: true, type: command.type, slot, moveKey };
    }
    if (command.type === 'EQUIP_WEAPON') {
      const weaponKey = String(command.weaponKey || '');
      if (weaponKey && (!player.ownedWeapons?.[weaponKey] || !content.WEAPON_BASE_STATS?.[weaponKey])) return { ok: false, reason: 'INVALID_WEAPON' };
      player.equippedWeapon = weaponKey;
      player.attackCooldownUntilTick = 0;
      return { ok: true, type: command.type, weaponKey };
    }
    if (command.type === 'REORDER_EQUIPMENT') {
      const slots = syncEquipmentSlots(player);
      const fromIndex = Math.trunc(Number(command.fromIndex));
      const toIndex = Math.trunc(Number(command.toIndex));
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= slots.length || toIndex >= slots.length || fromIndex === toIndex) {
        return { ok: false, reason: 'INVALID_SLOT' };
      }
      const [itemKey] = slots.splice(fromIndex, 1);
      slots.splice(toIndex, 0, itemKey);
      return { ok: true, type: command.type, itemKey, fromIndex, toIndex };
    }
    return { ok: false, reason: 'UNKNOWN_INVENTORY_COMMAND' };
  }

  function activateEquipment(player, itemKey, currentTick = 0, tickRate = 20) {
    syncEquipmentSlots(player);
    const key = String(itemKey || '');
    const definition = EQUIPMENT_ACTIVE_DEFS[key];
    if (!definition || !player.equipmentSlots.includes(key) || count(player, key) <= 0) return { ok: false, reason: 'NOT_EQUIPPED' };
    player.equipmentCooldownUntilTick = player.equipmentCooldownUntilTick || {};
    player.equipmentEffectsUntilTick = player.equipmentEffectsUntilTick || {};
    const now = Math.max(0, Math.floor(Number(currentTick) || 0));
    if (now < Number(player.equipmentCooldownUntilTick[key] || 0)) return { ok: false, reason: 'COOLDOWN' };
    const stacks = Math.max(1, count(player, key));
    const cooldown = key === 'churu_stick'
      ? Math.max(definition.minimumCooldown, definition.cooldown - (stacks - 1) * definition.cooldownReductionPerStack)
      : Number(definition.cooldown || 0);
    player.equipmentCooldownUntilTick[key] = now + Math.round(cooldown * tickRate);
    const duration = Number(definition.duration || 0) + (stacks - 1) * Number(definition.durationPerStack || 0);
    if (duration > 0) {
      player.equipmentEffectsUntilTick[key] = now + Math.round(duration * tickRate);
      player.equipmentEffectStartedTick = player.equipmentEffectStartedTick || {};
      player.equipmentEffectNextPulseTick = player.equipmentEffectNextPulseTick || {};
      player.equipmentEffectStartedTick[key] = now;
      player.equipmentEffectNextPulseTick[key] = now;
    }
    if (key === 'el_bartos_cape') player.elBartoAmbushReady = true;
    if (key === 'churu_stick') player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + Number(player.maxHp || 100) * 0.3);
    if (key === 'iron_helm') player.barrier = Math.max(Number(player.barrier || 0), Math.round(Number(player.maxHp || 100) * 0.5));
    if (key === 'panic_button') player.invulnerableUntilTick = Math.max(Number(player.invulnerableUntilTick || 0), now + Math.round((1.5 + (stacks - 1) * 0.35) * tickRate));
    return { ok: true, type: 'ACTIVATE_EQUIPMENT', itemKey: key, kind: definition.kind, stacks, duration, cooldown };
  }

  function updateEquipmentEffects(player, currentTick = 0, tickRate = 20) {
    if (!player) return [];
    const now = Math.max(0, Math.floor(Number(currentTick) || 0));
    const intents = [];
    player.equipmentEffectsUntilTick = player.equipmentEffectsUntilTick || {};
    player.equipmentEffectNextPulseTick = player.equipmentEffectNextPulseTick || {};
    Object.entries(player.equipmentEffectsUntilTick).forEach(([key, untilTick]) => {
      if (now >= Number(untilTick || 0)) {
        delete player.equipmentEffectsUntilTick[key];
        delete player.equipmentEffectNextPulseTick[key];
        if (key === 'gold_vac') player.pickupRadius = 0;
        return;
      }
      const stacks = Math.max(1, count(player, key));
      if (key === 'el_bartos_cape') {
        const started = Number(player.equipmentEffectStartedTick?.[key] || now);
        const concealedUntil = started + Math.round((Number(untilTick) - started) / 2);
        if (now < concealedUntil) player.invulnerableUntilTick = Math.max(Number(player.invulnerableUntilTick || 0), now + 2);
      }
      if (key === 'gold_vac') player.pickupRadius = Math.max(Number(player.pickupRadius || 0), 900);
      const interval = key === 'zap_to_extreme' ? 9
        : key === 'mid_sweepy_box' ? 8
          : ['pew_pew_box', 'skizzard_tail'].includes(key) ? 10 : 0;
      if (!interval || now < Number(player.equipmentEffectNextPulseTick[key] || 0)) return;
      player.equipmentEffectNextPulseTick[key] = now + interval;
      if (key === 'skizzard_tail') {
        const amount = Number(player.maxHp || 100) * 0.025 * (1 + (stacks - 1) * 0.45);
        player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + amount);
      } else {
        intents.push({ kind: EQUIPMENT_ACTIVE_DEFS[key].kind, itemKey: key, stacks });
      }
    });
    return intents;
  }

  return { EQUIPMENT_ACTIVE_DEFS, ACTIVATABLE_ITEM_KEYS, syncEquipmentSlots, collectCampaignItem, applyInventoryCommand, activateEquipment, updateEquipmentEffects };
});
