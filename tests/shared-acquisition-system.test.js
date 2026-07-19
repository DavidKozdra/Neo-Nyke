const fs = require('node:fs');
const path = require('node:path');
const {
  applyWizardPawSelection,
  applyExtraBatterySelection,
  getVoucherItemPool,
  redeemCampaignVoucher,
  createCampaignScrollPoolChoices,
  applyCampaignScrollSelection,
} = require('../js/simulation/SharedAcquisitionSystem');

function player(overrides = {}) {
  return {
    hp: 80, maxHp: 100, attackPower: 10, attackSpeed: 1,
    character: 'thorn_knight', characterKey: 'thorn_knight',
    equippedWeapon: 'thorns_bleed_blade',
    equippedMoves: { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' },
    ownedMoves: { slash: true, blood_beam: true, crimson_smash: true, dash: true },
    items: {}, equipmentSlots: [], ...overrides,
  };
}

describe('shared campaign acquisition transactions', () => {
  test('Wizard Paw validates exactly two choices and applies campaign math once', () => {
    const target = player({ wizardPawPendingCount: 1 });
    expect(applyWizardPawSelection(target, ['maxHp'])).toMatchObject({ ok: false });
    expect(applyWizardPawSelection(target, ['maxHp', 'attackPower'])).toEqual({
      ok: true, type: 'WIZARD_PAW_SELECT', picks: ['maxHp', 'attackPower'],
    });
    expect(target).toEqual(expect.objectContaining({ hp: 120, maxHp: 150, attackPower: 15, wizardPawPendingCount: 0 }));
    expect(applyWizardPawSelection(target, ['maxHp', 'attackSpeed'])).toMatchObject({ ok: false });
  });

  test('Extra Battery mutates the canonical weapon or move override and consumes one debt', () => {
    const weaponTarget = player({ extraBatteryPendingCount: 1 });
    expect(applyExtraBatterySelection(weaponTarget, 'slash')).toMatchObject({ ok: true, weaponKey: 'thorns_bleed_blade', maxCharges: 2 });
    expect(weaponTarget.weaponChargeOverrides).toEqual({ thorns_bleed_blade: 2 });
    const moveTarget = player({ extraBatteryPendingCount: 1 });
    expect(applyExtraBatterySelection(moveTarget, 'dash')).toMatchObject({ ok: true, moveKey: 'dash', maxCharges: 3 });
    expect(moveTarget.moveStackOverrides).toEqual({ dash: 3 });
  });

  test('voucher redemption validates rarity, shop context and consumes exactly one voucher', () => {
    expect(getVoucherItemPool('voucher_white')).toContain('neo_knife');
    expect(getVoucherItemPool('voucher_purple')).not.toContain('neo_knife');
    const target = player({ items: { voucher_white: 1 } });
    expect(redeemCampaignVoucher(target, 'voucher_white', 'neo_knife', { inShop: false })).toMatchObject({ ok: false });
    expect(redeemCampaignVoucher(target, 'voucher_white', 'neo_knife', { inShop: true })).toMatchObject({ ok: true, itemKey: 'neo_knife' });
    expect(target.items).toEqual({ neo_knife: 1 });
  });

  test('scroll acquisition and application are one authority-safe transaction', () => {
    const target = player({
      items: { scroll_abundance: 1 },
      scrollPendingQueue: ['scroll_abundance'],
    });
    expect(applyCampaignScrollSelection(target, 'scroll_abundance', ['neo_knife'], { floorNumber: 4 })).toMatchObject({ ok: false });
    const result = applyCampaignScrollSelection(target, 'scroll_abundance', ['neo_knife', 'anchor_charm'], { floorNumber: 4 });
    expect(result).toMatchObject({ ok: true, type: 'SCROLL_APPLY' });
    expect(target.items.scroll_abundance).toBeUndefined();
    expect(target.scrollPendingQueue).toEqual([]);
    expect(target.scrollAbundance).toEqual({ items: ['neo_knife', 'anchor_charm'], nextCheckFloor: 6, expiresFloor: 12 });
  });

  test('scroll reroll consumes the owned relic and grants a same-rarity replacement', () => {
    const target = player({ items: { scroll_reroll: 1, neo_knife: 1 }, scrollPendingQueue: ['scroll_reroll'] });
    const result = applyCampaignScrollSelection(target, 'scroll_reroll', ['neo_knife'], { floorNumber: 2, random: () => 0 });
    expect(result).toMatchObject({ ok: true, scrollKey: 'scroll_reroll' });
    expect(result.rewardKey).not.toBe('neo_knife');
    expect(target.items.neo_knife).toBeUndefined();
    expect(target.items[result.rewardKey]).toBe(1);
  });

  test('scroll pool choices are deterministic', () => {
    const rolls = Array(200).fill(0.25);
    expect(createCampaignScrollPoolChoices(() => rolls.shift(), 4)).toEqual(
      createCampaignScrollPoolChoices(() => 0.25, 4),
    );
  });

  test('browser and authority both invoke the shared acquisition operations', () => {
    const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const browser = read('js/game/player.js');
    const authority = read('js/simulation/NetworkCombatSystem.js');
    expect(browser).toContain('simulation?.applyWizardPawSelection?.');
    expect(browser).toContain('simulation?.applyExtraBatterySelection?.');
    expect(browser).toContain('simulation?.redeemCampaignVoucher?.');
    expect(browser).toContain('simulation.applyCampaignScrollSelection');
    expect(authority).toContain('applyAcquisitionCommand(player, action.action, action, {');
  });
});
