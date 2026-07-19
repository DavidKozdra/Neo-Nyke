const { applyCampaignDestructibleDamage, GREEN_ITEM_POOL } = require('../js/simulation/SharedWorldMutationSystem.js');

describe('SharedWorldMutationSystem', () => {
  test('chips fractional campaign health and only breaks at zero', () => {
    const prop = { kind: 'table', x: 1, y: 2, hp: 2, maxHp: 2 };
    expect(applyCampaignDestructibleDamage(prop, 0.75)).toMatchObject({ ok: true, broken: false, health: 1.25 });
    expect(applyCampaignDestructibleDamage(prop, 1.25)).toMatchObject({ ok: true, broken: true, health: 0 });
  });

  test('pot and post-loop green drops are decided by the same transaction', () => {
    const prop = { kind: 'pot', x: 10, y: 20, hp: 1 };
    const result = applyCampaignDestructibleDamage(prop, 1, {
      floorNumber: 4, runLoopIndex: 1, itemChance: 1,
      greenRandom: () => 0,
      potRandom: () => 0,
      rollItem: () => 'neo_knife',
    });
    expect(result.drops).toEqual([
      { type: 'item', key: GREEN_ITEM_POOL[0], source: 'green' },
      { type: 'item', key: 'neo_knife', source: 'pot' },
    ]);
  });

  test('wall reveal and secret passage mutation are canonical', () => {
    const hidden = { kind: 'chest', x: 20, y: 20, hidden: true, revealGroup: 'a' };
    const wall = { kind: 'wall', x: 0, y: 0, hp: 1, revealGroup: 'a' };
    expect(applyCampaignDestructibleDamage(wall, 1, { destructibles: [wall, hidden] }).revealed).toEqual([hidden]);
    expect(hidden.hidden).toBe(false);
    const secret = { kind: 'secret_wall', secretDir: 'e', hp: 1 };
    expect(applyCampaignDestructibleDamage(secret, 1)).toMatchObject({ secretDirection: 'e' });
    expect(secret.secretRevealed).toBe(true);
  });
});
