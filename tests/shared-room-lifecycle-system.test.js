const {
  rollCampaignChallengeType,
  getCampaignChallengeTrialTuning,
  createCampaignCircuitSequence,
  startCampaignCircuitChallenge,
  advanceCampaignCircuitChallenge,
  createCampaignChallengeRewardPlan,
  getCampaignStormStrikePoint,
  startCampaignStormChallenge,
  advanceCampaignStormChallenge,
  getCampaignChallengeObeliskMaxHp,
  createCampaignTrialEnemyWavePlan,
  startCampaignSurvivalChallenge,
  advanceCampaignSurvivalChallenge,
  applyCampaignObeliskSeekerSteering,
  createCampaignRuneSpawnPlan,
  startCampaignRuneChallenge,
  advanceCampaignRuneChallenge,
  advanceCampaignChallengeRune,
  createCampaignBombSpawnPlan,
  startCampaignBombChallenge,
  advanceCampaignBombChallenge,
  finishCampaignChallenge,
  resolveCampaignChallengePickup,
  updateCampaignGardenNode,
  collectCampaignGardenFruit,
  advanceCampaignMovingWorldEntity,
  purchaseCampaignSecretVendor,
  createCampaignSecretRoomPlan,
  lootCampaignSecretBossChest,
  prepareCampaignBowmanBaneEscape,
  revealCampaignBowmanBaneEscape,
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

  test('owns circuit sequence, switch layout, timing, and timeout state', () => {
    const room = { type: 'challenge', challengeType: 'circuit', challengeStarted: true, cleared: false, challengeData: {} };
    const tuning = getCampaignChallengeTrialTuning('circuit', {
      scaleTimer: seconds => seconds,
      difficultyStatMultiplier: 1.52,
    });
    expect(tuning).toEqual({ timer: 18, sequenceLength: 6, wrongPressPenalty: 2 });
    expect(createCampaignCircuitSequence(6, () => 0).every((entry, index, sequence) => index === 0 || entry !== sequence[index - 1])).toBe(true);
    const started = startCampaignCircuitChallenge(room, { tuning, random: () => 0 });
    expect(started).toMatchObject({ ok: true, timer: 18, switches: expect.any(Array) });
    expect(started.switches).toHaveLength(4);
    expect(started.switches[0]).toEqual(expect.objectContaining({ type: 'challengeSwitch', switchIndex: 0, armed: true, x: 230, y: 245 }));
    expect(room.challengeData).toEqual(expect.objectContaining({ phase: 'solve', progress: 0, maxTimer: 18, wrongPressPenalty: 2 }));
    expect(advanceCampaignCircuitChallenge(room, 18)).toEqual(expect.objectContaining({ ok: true, failed: true, timer: 0 }));
  });

  test('creates the complete campaign challenge reward transaction', () => {
    const plan = createCampaignChallengeRewardPlan({
      floorNumber: 4, centerX: 450, centerY: 350, random: () => 0,
      scrollRandom: () => 0, weaponRandom: () => 0,
      rollEliteItem: () => 'neo_knife', rollScroll: () => 'scroll_reroll',
      weaponPool: ['hunters_bow', 'claw_gauntlets'], ownedWeapons: { hunters_bow: true },
    });
    expect(plan).toEqual(expect.objectContaining({ ok: true, rewardKey: 'scroll_reroll', xp: 48, weaponKey: 'claw_gauntlets' }));
    expect(plan.pickups).toEqual([
      expect.objectContaining({ type: 'item', key: 'scroll_reroll', x: 450, y: 334 }),
      expect.objectContaining({ type: 'potion', x: 450, y: 386 }),
      expect.objectContaining({ type: 'coin', amount: 135, x: 450, y: 354 }),
    ]);
  });

  test('owns the Storm trial timer, cadence, predictive first strike, and deterministic burst', () => {
    const room = { type: 'challenge', challengeType: 'storm', challengeStarted: true, cleared: false, challengeData: {} };
    const tuning = getCampaignChallengeTrialTuning('storm', { floorNumber: 4, scaleTimer: seconds => seconds });
    expect(tuning).toEqual(expect.objectContaining({ timer: 17, burstCount: 3 }));
    expect(tuning.tick).toBeCloseTo(0.97);
    expect(startCampaignStormChallenge(room, { tuning })).toMatchObject({ ok: true, timer: 17, burstCount: 3 });
    const result = advanceCampaignStormChallenge(room, tuning.tick, {
      tuning, target: { x: 300, y: 200, vx: 100, vy: -50 }, width: 900, height: 700,
      random: () => 0.25,
    });
    expect(result.strikes).toHaveLength(3);
    expect(result.strikes[0]).toEqual({ x: 342, y: 179 });
    expect(result.strikes[1]).toEqual(getCampaignStormStrikePoint(1, { x: 300, y: 200, vx: 100, vy: -50 }, {
      width: 900, height: 700, random: () => 0.25,
    }));
    expect(result.nextTick).toBeCloseTo(tuning.tick);
  });

  test('owns Protect ward health, capped seeker pressure, wave plan, and steering', () => {
    const room = { type: 'challenge', challengeType: 'survival', challengeStarted: true, cleared: false, challengeData: {} };
    const tuning = getCampaignChallengeTrialTuning('survival', { floorNumber: 6, scaleTimer: seconds => seconds });
    expect(tuning).toEqual({ timer: 24, tickStart: 2.2, tickEnd: 1.35, spawnCount: 6 });
    const started = startCampaignSurvivalChallenge(room, { tuning, floorNumber: 6, width: 900, height: 700 });
    expect(started.obelisk.maxHp).toBe(getCampaignChallengeObeliskMaxHp(6));
    room.challengeTick = 0;
    const seekers = Array.from({ length: 8 }, (_, index) => ({ id: index, obeliskSeeker: true, x: 450, y: 350, radius: 12, dead: false }));
    const pressure = advanceCampaignSurvivalChallenge(room, 0.05, { tuning, floorNumber: 6, enemies: seekers });
    expect(pressure).toMatchObject({ spawnCount: 0, attackers: 8, failed: false });
    expect(pressure.obelisk.hp).toBeLessThan(pressure.obelisk.maxHp);
    const plan = createCampaignTrialEnemyWavePlan(2, { floorNumber: 6, random: () => 0.5, width: 900, height: 700 });
    expect(plan).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'charger' })]));
    expect(plan[0].x).toBeCloseTo(235);
    expect(plan[0].y).toBeCloseTo(350);
    const enemy = { obeliskSeeker: true, x: 100, y: 350, vx: 0, vy: 0, moveSpeed: 100 };
    expect(applyCampaignObeliskSeekerSteering(enemy, pressure.obelisk, 0.1)).toBe(true);
    expect(enemy.vx).toBeGreaterThan(0);
  });

  test('owns Rune trial spawn, timer pressure, and fleeing movement', () => {
    const room = { type: 'challenge', challengeType: 'runes', challengeStarted: true, cleared: false, challengeData: {} };
    const tuning = getCampaignChallengeTrialTuning('runes', { floorNumber: 5, scaleTimer: seconds => seconds });
    const started = startCampaignRuneChallenge(room, { tuning, width: 900, height: 700, random: () => 0.5 });
    expect(started.runes).toHaveLength(5);
    expect(room.challengeData.runesLeft).toBe(5);
    room.challengeTick = 0;
    expect(advanceCampaignRuneChallenge(room, 0.05, { tuning })).toMatchObject({ spawnCount: 1, failed: false });
    const rune = { ...createCampaignRuneSpawnPlan({ count: 1, random: () => 0.5 })[0] };
    const before = rune.x;
    advanceCampaignChallengeRune(rune, { x: before - 80, y: rune.y }, 0.1, { width: 900, height: 700, wallThickness: 28, radius: 16, playerMoveSpeed: 228 });
    expect(rune.x).toBeGreaterThan(before);
  });

  test('owns Bomb trial safe/unsafe composition and timed pressure', () => {
    const room = { type: 'challenge', challengeType: 'bomb', challengeStarted: true, cleared: false, challengeData: {} };
    const tuning = getCampaignChallengeTrialTuning('bomb', { floorNumber: 7, scaleTimer: seconds => seconds });
    const bombs = createCampaignBombSpawnPlan({ floorNumber: 7, random: () => 0.5, width: 900, height: 700 });
    expect(bombs).toHaveLength(5);
    expect(bombs.filter(bomb => bomb.safe)).toHaveLength(3);
    expect(startCampaignBombChallenge(room, { tuning, floorNumber: 7, random: () => 0.5 })).toMatchObject({ ok: true, timer: 17 });
    room.challengeTick = 0;
    expect(advanceCampaignBombChallenge(room, 0.05, { tuning })).toMatchObject({ spawnCount: 2, failed: false });
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
    expect(purchaseCampaignSecretVendor(state, room, player, { type: 'secretVendor', offerKind: 'relic', rewardKey: 'neo_knife', cost: 1 })).toMatchObject({ ok: true, rewardKey: 'neo_knife' });
    expect(player.lastSecretVendorRewardKey).toBe('neo_knife');
    expect(lootCampaignSecretBossChest(state, room, player, { type: 'secret_boss_chest' }, { rewardKey: 'neo_knife' })).toMatchObject({ ok: true, coins: 84, rewardKey: 'neo_knife' });
    const run = { floor: 3 };
    expect(useCampaignLadder(run, { maxFloor: 10 })).toMatchObject({ type: 'LADDER_USED', floorNumber: 4 });
    expect(useCampaignLadder({ floor: 10 }, { maxFloor: 10, gameMode: 'treasure_hunt' })).toMatchObject({ type: 'RUN_WON' });
  });

  test('owns Bowman Bane hidden-exit topology and reveal state', () => {
    const room = {
      secret: true, secretKind: 'bowman_bane', doors: { n: false, s: false, e: false, w: false },
      secretPassages: { n: { targetGx: 3, targetGy: 4, open: true } },
    };
    expect(prepareCampaignBowmanBaneEscape(room, 'thorn_knight')).toMatchObject({ ok: true, direction: 's', created: true });
    expect(room.secretPassages.s).toEqual(expect.objectContaining({ open: false, baneEscape: true }));
    expect(revealCampaignBowmanBaneEscape(room, 'thorn_knight')).toMatchObject({ ok: true, direction: 's', revealed: true });
    expect(room.secretPassages.n.open).toBe(false);
    expect(room.secretPassages.s.open).toBe(true);
  });

  test('creates the same secret vendor and warp descriptors for either runtime', () => {
    const vendor = createCampaignSecretRoomPlan({ type: 'secret', secretKind: 'vendor' }, {
      floorNumber: 4, random: () => 0.25, rollEliteItem: () => 'neo_knife', xpCost: 20, xpValue: 60,
    });
    expect(vendor.pickups).toHaveLength(3);
    expect(vendor.pickups.map(pickup => pickup.offerKind)).toContain('xp');
    let rewardRoll = 0;
    let planRoll = 0;
    const distinctVendor = createCampaignSecretRoomPlan({ type: 'secret', secretKind: 'vendor' }, {
      floorNumber: 4, random: () => (planRoll++ === 0 ? 0.25 : 0.9), previousRewardKey: 'neo_knife',
      rollEliteItem: () => ['neo_knife', 'tough_bandaid'][rewardRoll++] || 'tough_bandaid', xpCost: 20, xpValue: 60,
    });
    expect(distinctVendor.pickups.find(pickup => pickup.offerKind === 'relic')?.rewardKey).toBe('tough_bandaid');
    const warp = createCampaignSecretRoomPlan({ type: 'secret', secretKind: 'warp' }, { floorNumber: 1, random: () => 0.25, maxFloor: 10 });
    expect(warp).toMatchObject({ ok: true, pickups: [{ type: 'secretWarp', targetFloor: 2 }] });
    const lady = createCampaignSecretRoomPlan({ type: 'secret', secretKind: 'vendor' }, { floorNumber: 1, random: () => 0, rollItem: () => 'neo_knife' });
    expect(lady).toMatchObject({ ok: true, secretKind: 'mystery_lady', pickups: [{ type: 'secretLady', rewardKey: 'neo_knife' }] });
    const noReward = createCampaignSecretRoomPlan({ type: 'secret', secretKind: 'vendor' }, { floorNumber: 1, random: () => 0, rollItem: () => '' });
    expect(noReward).toMatchObject({ ok: true, secretKind: 'vendor' });
    expect(noReward.pickups).toHaveLength(3);
  });
});
