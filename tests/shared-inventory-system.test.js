const inventory = require('../js/simulation/SharedInventorySystem');
const { MOVE_SLOT_BY_KEY } = require('../js/simulation/SharedMoveContent');
const { WEAPON_BASE_STATS } = require('../js/simulation/SharedCombatContent');
const networkCombat = require('../js/simulation/NetworkCombatSystem');

function player(overrides = {}) {
  return {
    hp: 100, maxHp: 100, items: {}, equipmentSlots: [],
    ownedMoves: { blood_beam: true, dash: true },
    ownedWeapons: { thorns_bleed_blade: true },
    equippedMoves: {}, ...overrides,
  };
}

describe('shared campaign inventory operations', () => {
  test('network combat cannot overwrite the canonical collection transaction', () => {
    expect(networkCombat.collectCampaignItem).toBeUndefined();
    expect(inventory.collectCampaignItem(player(), 'neo_knife')).toEqual(expect.objectContaining({ ok: true, amount: 1 }));
  });

  test('pickup hooks use the canonical hp/maxHp state and tool slots', () => {
    const actor = player();
    inventory.collectCampaignItem(actor, 'titan_heart');
    expect(actor).toMatchObject({ hp: 108, maxHp: 120, items: { titan_heart: 1 } });
    inventory.collectCampaignItem(actor, 'gold_vac');
    expect(actor.equipmentSlots).toContain('gold_vac');
  });

  test('the same command equips moves and weapons', () => {
    const actor = player();
    expect(inventory.applyInventoryCommand(actor, { type: 'EQUIP_MOVE', slot: 'laser', moveKey: 'blood_beam' }, { MOVE_SLOT_BY_KEY }).ok).toBe(true);
    expect(inventory.applyInventoryCommand(actor, { type: 'EQUIP_WEAPON', weaponKey: 'thorns_bleed_blade' }, { WEAPON_BASE_STATS }).ok).toBe(true);
    expect(actor).toMatchObject({ equippedMoves: { laser: 'blood_beam' }, equippedWeapon: 'thorns_bleed_blade' });
  });

  test('equipment activation is state-only and authority-clocked', () => {
    const actor = player({ items: { churu_stick: 2 }, hp: 20, maxHp: 100 });
    inventory.syncEquipmentSlots(actor);
    const result = inventory.activateEquipment(actor, 'churu_stick', 200);
    expect(result).toMatchObject({ ok: true, kind: 'heal', stacks: 2, cooldown: 36 });
    expect(actor.hp).toBe(50);
    expect(actor.equipmentCooldownUntilTick.churu_stick).toBe(920);
  });

  test('Charged Adapter shares its validated delayed-portal and charge-spend transaction', () => {
    const actor = player({ items: { charged_adapter: 1 }, escapeReady: true, escapeChargeKills: 12 });
    const portal = inventory.prepareCampaignChargedAdapterWarp(actor, {
      hasCurrentRoom: true, roomType: 'combat', hasTargetRoom: true, targetRoomId: 'ladder', targetGx: 3, targetGy: 4,
      x: 280, y: 190, activateAt: 0.75, activateDelayTicks: 15,
    });
    expect(portal).toMatchObject({ ok: true, type: 'adapterPortal', targetRoomId: 'ladder', active: false, activateDelayTicks: 15 });
    expect(actor).toMatchObject({ escapeReady: false, escapeChargeKills: 0 });
    expect(inventory.prepareCampaignChargedAdapterWarp(actor, { hasCurrentRoom: true, roomType: 'combat', hasTargetRoom: true })).toEqual({ ok: false, reason: 'ADAPTER_CHARGING' });
  });
});

describe('shared timed equipment effects', () => {
  test('emits authoritative missile pulses and expires pickup vacuum state', () => {
    const actor = player({ items: { pew_pew_box: 2, gold_vac: 1 }, equipmentSlots: ['pew_pew_box', 'gold_vac'] });
    expect(inventory.activateEquipment(actor, 'pew_pew_box', 100)).toEqual(expect.objectContaining({ ok: true, kind: 'missiles', stacks: 2 }));
    expect(inventory.updateEquipmentEffects(actor, 100)).toEqual([{ kind: 'missiles', itemKey: 'pew_pew_box', stacks: 2 }]);
    expect(inventory.updateEquipmentEffects(actor, 101)).toEqual([]);
    inventory.activateEquipment(actor, 'gold_vac', 100);
    inventory.updateEquipmentEffects(actor, 100);
    expect(actor.pickupRadius).toBe(900);
    inventory.updateEquipmentEffects(actor, actor.equipmentEffectsUntilTick.gold_vac);
    expect(actor.pickupRadius).toBe(0);
  });

  test('runs regen and cape concealment as shared state transitions', () => {
    const actor = player({ hp: 20, items: { skizzard_tail: 1, el_bartos_cape: 1 }, equipmentSlots: ['skizzard_tail', 'el_bartos_cape'] });
    inventory.activateEquipment(actor, 'skizzard_tail', 20);
    inventory.activateEquipment(actor, 'el_bartos_cape', 20);
    inventory.updateEquipmentEffects(actor, 20);
    expect(actor.hp).toBeGreaterThan(20);
    expect(actor.invulnerableUntilTick).toBeGreaterThan(20);
  });
});
