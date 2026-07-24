const fs = require('node:fs');
const path = require('node:path');

const {
  createCampaignSecretRoomPlan,
} = require('../js/simulation/SharedRoomLifecycleSystem');

describe('secret-room mystery lady', () => {
  test('uses the exact 5% boundary and pre-rolls one claimable item', () => {
    const rare = createCampaignSecretRoomPlan(
      { type: 'secret', secretKind: 'warp' },
      { floorNumber: 3, random: () => 0.049, rollItem: () => 'neo_knife' },
    );
    expect(rare).toEqual(expect.objectContaining({
      ok: true,
      secretKind: 'mystery_lady',
      pickups: [expect.objectContaining({ type: 'secretLady', rewardKey: 'neo_knife' })],
    }));

    const normal = createCampaignSecretRoomPlan(
      { type: 'secret', secretKind: 'warp' },
      { floorNumber: 3, random: () => 0.05, rollItem: () => 'neo_knife' },
    );
    expect(normal).toEqual(expect.objectContaining({ secretKind: 'warp' }));
    expect(normal.pickups[0]).toEqual(expect.objectContaining({ type: 'secretWarp' }));
  });

  test('falls back to a normal secret room without a valid reward and has an authority claim path', () => {
    const fallback = createCampaignSecretRoomPlan(
      { type: 'secret', secretKind: 'vendor' },
      { floorNumber: 3, random: () => 0, rollItem: () => '' },
    );
    expect(fallback).toEqual(expect.objectContaining({ secretKind: 'vendor' }));
    expect(fallback.pickups).toHaveLength(3);

    const authority = fs.readFileSync(path.join(__dirname, '..', 'js/simulation/NetworkCombatSystem.js'), 'utf8');
    expect(authority).toContain("if (pickup.type === 'secretLady')");
    expect(authority).toContain("emitEvent('SECRET_LADY_GIFTED'");
  });
});
