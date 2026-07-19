const { openCampaignChest, claimCampaignChestSelection } = require('../js/simulation/SharedChestSystem.js');
const { RandomStream } = require('../js/simulation/RandomService.js');

describe('SharedChestSystem', () => {
  test('opens direct item and potion chests through one descriptor transaction', () => {
    const item = { id: 'a', x: 100, y: 100, rewardType: 'item', rewardKey: 'neo_knife' };
    expect(openCampaignChest(item, { floorNumber: 3, random: new RandomStream(1) })).toMatchObject({
      ok: true, coinAmount: 18, pickups: [{ type: 'item', key: 'neo_knife', x: 100, y: 80 }],
    });
    expect(item).toMatchObject({ open: true, opened: true, activated: true });
    const potion = { id: 'b', x: 20, y: 30, rewardType: 'potion' };
    expect(openCampaignChest(potion, { floorNumber: 1, random: new RandomStream(2) }).pickups).toEqual([{ type: 'potion', x: 20, y: 10 }]);
  });

  test('A/B offers and claims are validated canonically', () => {
    const chest = { id: 'choice', x: 100, y: 100, choiceType: 'ab', rewardChoices: ['neo_knife', 'anchor_charm'] };
    const opened = openCampaignChest(chest, { floorNumber: 5, random: new RandomStream(3) });
    expect(opened.selection).toEqual({ selectionEventId: 'choice', optionIds: ['neo_knife', 'anchor_charm'], picksRemaining: 1 });
    expect(claimCampaignChestSelection(chest, 'missing')).toMatchObject({ ok: false });
    expect(claimCampaignChestSelection(chest, 'anchor_charm')).toMatchObject({ ok: true, itemKey: 'anchor_charm' });
    expect(chest.opened).toBe(true);
  });

  test('treasure-hunt exit reveal is part of the chest outcome', () => {
    const chest = { id: 'exit', x: 1, y: 2, rewardKey: 'neo_knife', treasureHuntExitChest: true };
    expect(openCampaignChest(chest, { floorNumber: 2, random: new RandomStream(4) }).revealExit).toBe(true);
  });
});
