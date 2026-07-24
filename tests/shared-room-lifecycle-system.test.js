const {
  rollCampaignChallengeType,
  finishCampaignChallenge,
  resolveCampaignChallengePickup,
  updateCampaignGardenNode,
  collectCampaignGardenFruit,
  advanceCampaignMovingWorldEntity,
  purchaseCampaignSecretVendor,
  createCampaignSecretRoomPlan,
  lootCampaignSecretBossChest,
  useCampaignLadder,
} = require('../js/simulation/SharedRoomLifecycleSystem');

describe('SharedRoomLifecycleSystem', () => {
  test('selects seeded floor-appropriate challenge types and owns completion state', () => {
    expect(rollCampaignChallengeType(1, () => 0.99)).toBe('bomb');
    expect(rollCampaignChallengeType(8, () => 0.99)).toBe('storm');
    const room = { type: 'challenge', challengeType: 'stillness', challengeStarted: true, challengeData: { rewardKey: 'neo_knife' } };
    expect(finishCampaignChallenge(room, 'completed')).toMatchObject({ ok: true, achievementType: 'circuit', rewardKey: 'neo_knife' });
    expect(room).toMatchObject({ cleared: true, challengeFailed: false, challengeTimer: 0, challengeLifecycleState: 'completed' });
  });

  test('resolves circuit, rune and bomb mutations once', () => {
    const circuit = { type: 'challenge', challengeStarted: true, cleared: false, challengeTimer: 10, challengeData: { sequence: [2], progress: 0, wrongPressPenalty: 2 } };
    expect(resolveCampaignChallengePickup(circuit, { type: 'challengeSwitch', switchIndex: 2 })).toMatchObject({ complete: true, progress: 1 });
    const runes = { type: 'challenge', challengeStarted: true, cleared: false, challengeTimer: 5, challengeData: { runesLeft: 1 } };
    expect(resolveCampaignChallengePickup(runes, { type: 'challengeRune' })).toMatchObject({ complete: true, timerRefund: 2 });
    expect(runes.challengeTimer).toBe(7);
    expect(resolveCampaignChallengePickup({ type: 'challenge', challengeStarted: true, cleared: false }, { type: 'challengeBomb', safe: false }, { damage: 30 })).toMatchObject({ fail: true, damage: 30 });
  });

  test('grows and consumes garden fruit with one respawn clock', () => {
    const node = { id: 'node', x: 100, y: 120, heal: 24, respawnAt: 5 };
    const room = { gx: 1, gy: 2, pickups: [], gardenFruitNodes: [node] };
    const grown = updateCampaignGardenNode(room, node, 5);
    expect(grown).toMatchObject({ spawned: true, pickup: { type: 'apple', gardenNodeId: 'node', heal: 24 } });
    expect(collectCampaignGardenFruit(room, grown.pickup, 10, { random: () => 0.5 })).toMatchObject({ ok: true, respawnAt: 27 });
    expect(node.fruitSpawned).toBe(false);
  });

  test('moves hazards and pickups with canonical boundary reflection', () => {
    const entity = { x: 95, y: 50, vx: 20, vy: 0 };
    expect(advanceCampaignMovingWorldEntity(entity, 1, { width: 100, height: 100, margin: 10 })).toMatchObject({ x: 90, vx: -20, bouncedX: true });
  });

  test('owns secret trades, secret-boss claims and ladder outcomes', () => {
    const state = { floor: 3, metaProgress: { loopCrystals: 2 } };
    const room = {};
    const player = { coins: 10, maxHp: 100 };
    expect(purchaseCampaignSecretVendor(state, room, player, { type: 'secretVendor', offerKind: 'vitality', cost: 1 })).toMatchObject({ ok: true, heal: 60 });
    expect(player.maxHp).toBe(120);
    expect(state.metaProgress.loopCrystals).toBe(1);
    expect(lootCampaignSecretBossChest(state, room, player, { type: 'secret_boss_chest' }, { rewardKey: 'neo_knife' })).toMatchObject({ ok: true, coins: 84, rewardKey: 'neo_knife' });
    const run = { floor: 3 };
    expect(useCampaignLadder(run, { maxFloor: 10 })).toMatchObject({ type: 'LADDER_USED', floorNumber: 4 });
    expect(useCampaignLadder({ floor: 10 }, { maxFloor: 10, gameMode: 'treasure_hunt' })).toMatchObject({ type: 'RUN_WON' });
  });

  test('creates the same secret vendor and warp descriptors for either runtime', () => {
    const vendor = createCampaignSecretRoomPlan({ type: 'secret', secretKind: 'vendor' }, {
      floorNumber: 4, random: () => 0.25, rollEliteItem: () => 'neo_knife', xpCost: 20, xpValue: 60,
    });
    expect(vendor.pickups).toHaveLength(3);
    expect(vendor.pickups.map(pickup => pickup.offerKind)).toContain('xp');
    const warp = createCampaignSecretRoomPlan({ type: 'secret', secretKind: 'warp' }, { floorNumber: 1, random: () => 0.25, maxFloor: 10 });
    expect(warp).toMatchObject({ ok: true, pickups: [{ type: 'secretWarp', targetFloor: 2 }] });
    const lady = createCampaignSecretRoomPlan({ type: 'secret', secretKind: 'vendor' }, { floorNumber: 1, random: () => 0, rollItem: () => 'neo_knife' });
    expect(lady).toMatchObject({ ok: true, secretKind: 'mystery_lady', pickups: [{ type: 'secretLady', rewardKey: 'neo_knife' }] });
    const noReward = createCampaignSecretRoomPlan({ type: 'secret', secretKind: 'vendor' }, { floorNumber: 1, random: () => 0, rollItem: () => '' });
    expect(noReward).toMatchObject({ ok: true, secretKind: 'vendor' });
    expect(noReward.pickups).toHaveLength(3);
  });
});
