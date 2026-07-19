(function initializeSharedRoomLifecycleSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedRoomLifecycleApi() {
  'use strict';

  const CHALLENGE_PICKUP_TYPES = Object.freeze([
    'challengeBomb', 'challengeRune', 'challengeStarter', 'challengeItemChoice', 'challengeSwitch',
  ]);
  const CAMPAIGN_CHALLENGE_TYPES = Object.freeze(['mirror', 'circuit', 'bomb', 'survival', 'runes', 'storm']);

  function rollCampaignChallengeType(floorNumber, random = Math.random) {
    const floor = Math.max(1, Number(floorNumber || 1));
    const maximumIndex = floor <= 2 ? 2 : floor <= 4 ? 4 : CAMPAIGN_CHALLENGE_TYPES.length - 1;
    return CAMPAIGN_CHALLENGE_TYPES[Math.floor(Number(random()) * (maximumIndex + 1))] || CAMPAIGN_CHALLENGE_TYPES[0];
  }

  function finishCampaignChallenge(room, outcome, options = {}) {
    if (!room || room.type !== 'challenge' || !['completed', 'failed'].includes(outcome)) {
      return { ok: false, reason: 'INVALID_CHALLENGE_OUTCOME' };
    }
    const challengeType = room.challengeType || 'mirror';
    const rewardKey = String(room.challengeData?.rewardKey || '');
    const completed = outcome === 'completed';
    room.cleared = true;
    room.challengeFailed = !completed;
    room.challengeRewardSpawned = completed ? !!room.challengeRewardSpawned : true;
    room.challengeTimer = 0;
    room.challengeTick = 0;
    room.challengeLifecycleState = outcome;
    room.challengeData = {};
    return {
      ok: true,
      type: completed ? 'CHALLENGE_COMPLETED' : 'CHALLENGE_FAILED',
      outcome,
      challengeType,
      achievementType: challengeType === 'stillness' ? 'circuit' : challengeType,
      text: String(options.text || (completed ? 'TRIAL CLEARED' : 'TRIAL FAILED')),
      rewardKey,
      removePickupTypes: CHALLENGE_PICKUP_TYPES.slice(),
      spawnReward: completed,
    };
  }

  function resolveCampaignChallengePickup(room, pickup, options = {}) {
    if (!room || room.type !== 'challenge' || !room.challengeStarted || room.cleared || !pickup) {
      return { ok: false, reason: 'CHALLENGE_NOT_ACTIVE' };
    }
    room.challengeData = room.challengeData || {};
    if (pickup.type === 'challengeRune') {
      room.challengeData.runesLeft = Math.max(0, Number(room.challengeData.runesLeft || 1) - 1);
      const timerRefund = Math.max(0, Number(options.timerRefund ?? 2));
      room.challengeTimer = Number(room.challengeTimer || 0) + timerRefund;
      return { ok: true, type: 'CHALLENGE_RUNE_CLAIMED', removePickup: true, timerRefund, remaining: room.challengeData.runesLeft, complete: room.challengeData.runesLeft <= 0 };
    }
    if (pickup.type === 'challengeBomb') {
      if (pickup.safe) {
        const remaining = Math.max(0, Number(options.remainingSafeBombs || 0));
        return { ok: true, type: 'CHALLENGE_BOMB_DEFUSED', removePickup: true, remaining, complete: remaining <= 0 };
      }
      return {
        ok: true, type: 'CHALLENGE_BOMB_FAILED', removePickup: !!options.tutorial,
        fail: !options.tutorial, damage: options.tutorial ? 1 : Math.max(0, Number(options.damage || 28)),
        spawnFailureHazard: !options.tutorial,
      };
    }
    if (pickup.type === 'challengeSwitch') {
      const sequence = Array.isArray(room.challengeData.sequence) ? room.challengeData.sequence : [];
      const progress = Math.max(0, Number(room.challengeData.progress || 0));
      if (!Number.isInteger(pickup.switchIndex) || sequence.length === 0) return { ok: false, reason: 'INVALID_CHALLENGE_SWITCH' };
      pickup.armed = false;
      if (pickup.switchIndex === sequence[progress]) {
        room.challengeData.progress = progress + 1;
        room.challengeData.flash = 0.28;
        return { ok: true, type: 'CHALLENGE_SWITCH_CORRECT', progress: progress + 1, total: sequence.length, complete: progress + 1 >= sequence.length };
      }
      const penalty = Math.max(0, Number(room.challengeData.wrongPressPenalty || options.wrongPressPenalty || 2));
      room.challengeData.progress = 0;
      room.challengeData.wrongFlash = 0.5;
      room.challengeTimer = Math.max(0, Number(room.challengeTimer || 0) - penalty);
      return { ok: true, type: 'CHALLENGE_SWITCH_WRONG', progress: 0, total: sequence.length, penalty };
    }
    return { ok: false, reason: 'UNSUPPORTED_CHALLENGE_PICKUP' };
  }

  function updateCampaignGardenNode(room, node, elapsedSeconds) {
    if (!room || !node) return { ok: false, reason: 'INVALID_GARDEN_NODE' };
    room.pickups = Array.isArray(room.pickups) ? room.pickups : [];
    const active = room.pickups.some(pickup => ['apple', 'fruit'].includes(pickup?.type) && pickup.gardenNodeId === node.id);
    node.fruitSpawned = active;
    if (active || Number(elapsedSeconds || 0) < Number(node.respawnAt || 0)) return { ok: true, spawned: false };
    const pickup = {
      x: Number(node.x), y: Number(node.y) - 8, type: 'apple', heal: Number(node.heal || 20),
      gardenNodeId: node.id, roomGx: room.gx, roomGy: room.gy,
      respawnAt: Number(node.respawnAt || 0), grownAt: Number(elapsedSeconds || 0), ripe: true,
    };
    room.pickups.push(pickup);
    node.fruitSpawned = true;
    return { ok: true, spawned: true, pickup };
  }

  function collectCampaignGardenFruit(room, pickup, elapsedSeconds, options = {}) {
    const node = room?.gardenFruitNodes?.find(candidate => candidate?.id === pickup?.gardenNodeId);
    if (!node) return { ok: false, reason: 'GARDEN_NODE_NOT_FOUND' };
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const minimum = Math.max(0, Number(options.minimumRespawnSeconds ?? 12));
    const spread = Math.max(0, Number(options.respawnSpreadSeconds ?? 10));
    node.respawnAt = Number(elapsedSeconds || 0) + minimum + random() * spread;
    node.fruitSpawned = false;
    return { ok: true, type: 'GARDEN_FRUIT_COLLECTED', heal: Math.max(0, Number(pickup.heal || node.heal || 20)), respawnAt: node.respawnAt };
  }

  function advanceCampaignMovingWorldEntity(entity, deltaSeconds, bounds = {}) {
    if (!entity) return { ok: false, reason: 'INVALID_MOVING_ENTITY' };
    const dt = Math.max(0, Number(deltaSeconds || 0));
    const margin = Math.max(0, Number(bounds.margin || 0));
    const width = Math.max(margin * 2, Number(bounds.width || 900));
    const height = Math.max(margin * 2, Number(bounds.height || 700));
    entity.x = Number(entity.x || 0) + Number(entity.vx || 0) * dt;
    entity.y = Number(entity.y || 0) + Number(entity.vy || 0) * dt;
    let bouncedX = false;
    let bouncedY = false;
    if (entity.x < margin) { entity.x = margin; entity.vx = Math.abs(Number(entity.vx || 0)); bouncedX = true; }
    else if (entity.x > width - margin) { entity.x = width - margin; entity.vx = -Math.abs(Number(entity.vx || 0)); bouncedX = true; }
    if (entity.y < margin) { entity.y = margin; entity.vy = Math.abs(Number(entity.vy || 0)); bouncedY = true; }
    else if (entity.y > height - margin) { entity.y = height - margin; entity.vy = -Math.abs(Number(entity.vy || 0)); bouncedY = true; }
    return { ok: true, x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy, bouncedX, bouncedY };
  }

  function purchaseCampaignSecretVendor(state, room, player, offer) {
    if (!state || !room || !player || !offer || offer.type !== 'secretVendor' || offer.bought) return { ok: false, reason: 'INVALID_SECRET_VENDOR_OFFER' };
    const cost = Math.max(1, Number(offer.cost || 1));
    const usesCoins = offer.offerKind === 'xp';
    const wallet = usesCoins ? Number(player.coins || 0) : Number(state.loopCrystals ?? state.metaProgress?.loopCrystals ?? 0);
    if (wallet < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS', cost, usesCoins };
    if (usesCoins) player.coins = wallet - cost;
    else if (state.metaProgress) state.metaProgress.loopCrystals = wallet - cost;
    else state.loopCrystals = wallet - cost;
    offer.bought = true;
    const result = { ok: true, type: 'SECRET_VENDOR_PURCHASED', offerKind: offer.offerKind, cost, usesCoins, rewardKey: '' };
    if (offer.offerKind === 'relic') result.rewardKey = String(offer.rewardKey || '');
    else if (offer.offerKind === 'vitality') { player.maxHp = Number(player.maxHp || 0) + 20; result.heal = 60; }
    else if (offer.offerKind === 'xp') result.xp = Math.max(1, Number(offer.xpValue || 1));
    else result.coins = Math.max(0, Number(offer.coinValue || 90 + Number(state.floorNumber ?? state.floor ?? 1) * 12));
    room.secretVendorUsed = true;
    return result;
  }

  function rollDistinctCampaignReward(rollReward, previousRewardKey = '', maxRerolls = 6) {
    if (typeof rollReward !== 'function') return '';
    const previous = String(previousRewardKey || '');
    let rewardKey = rollReward();
    for (let attempt = 0; rewardKey === previous && attempt < maxRerolls; attempt += 1) rewardKey = rollReward();
    return rewardKey;
  }

  function createCampaignSecretRoomPlan(room, options = {}) {
    if (!room || room.type !== 'secret') return { ok: false, reason: 'INVALID_SECRET_ROOM', pickups: [] };
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const floor = Math.max(1, Number(options.floorNumber || 1));
    const maxFloor = Math.max(floor, Number(options.maxFloor || 10));
    const width = Math.max(1, Number(options.width || 900));
    const height = Math.max(1, Number(options.height || 700));
    const shuffle = values => {
      const result = values.slice();
      for (let index = result.length - 1; index > 0; index -= 1) {
        const other = Math.floor(Number(random()) * (index + 1));
        [result[index], result[other]] = [result[other], result[index]];
      }
      return result;
    };
    if (room.secretKind === 'warp') {
      const deltas = floor <= 2 ? [1, 2] : floor >= maxFloor - 1 ? [-2, -1] : [-2, -1, 1, 2];
      const delta = deltas[Math.floor(Number(random()) * deltas.length)] || 1;
      return { ok: true, secretKind: 'warp', pickups: [{ x: width / 2, y: height / 2, type: 'secretWarp', delta, targetFloor: Math.max(1, Math.min(maxFloor, floor + delta)) }] };
    }
    const regular = shuffle(['relic', 'vitality', 'wealth']);
    const kinds = shuffle(['xp', regular[0], regular[1]]);
    const positions = [[width / 2 - 110, height / 2 + 26], [width / 2, height / 2 - 18], [width / 2 + 110, height / 2 + 26]];
    const pickups = kinds.map((kind, index) => {
      const offer = { x: positions[index][0], y: positions[index][1], type: 'secretVendor', offerKind: kind, cost: kind === 'xp' ? Math.max(1, Number(options.xpCost || 30)) : kind === 'wealth' ? 2 : 1, label: kind };
      if (kind === 'relic') offer.rewardKey = String(rollDistinctCampaignReward(
        () => options.rollEliteItem?.(random) || '', options.previousRewardKey,
      ));
      if (kind === 'xp') offer.xpValue = Math.max(1, Number(options.xpValue || 40 + floor * 5));
      if (kind === 'wealth') offer.coinValue = 90 + floor * 12;
      return offer;
    });
    return { ok: true, secretKind: 'vendor', pickups };
  }

  function lootCampaignSecretBossChest(state, room, player, chest, options = {}) {
    if (!state || !room || !player || !chest || chest.type !== 'secret_boss_chest' || room.secretChestLooted) return { ok: false, reason: 'SECRET_CHEST_UNAVAILABLE' };
    room.secretChestLooted = true;
    const coins = Math.max(0, Number(options.coins ?? 60 + Number(state.floorNumber ?? state.floor ?? 1) * 8));
    return { ok: true, type: 'SECRET_BOSS_CHEST_LOOTED', rewardKey: String(options.rewardKey || chest.rewardKey || ''), coins };
  }

  function useCampaignLadder(runState, options = {}) {
    if (!runState) return { ok: false, reason: 'INVALID_RUN' };
    const floor = Math.max(1, Number(runState.floorNumber ?? runState.floor ?? 1));
    const maxFloor = Math.max(floor, Number(options.maxFloor || 10));
    if (options.gameMode === 'treasure_hunt' && floor >= maxFloor) return { ok: true, type: 'RUN_WON', floorNumber: floor };
    const nextFloor = Math.min(maxFloor, floor + 1);
    if ('floorNumber' in runState) runState.floorNumber = nextFloor;
    if ('floor' in runState) runState.floor = nextFloor;
    return { ok: true, type: 'LADDER_USED', previousFloor: floor, floorNumber: nextFloor };
  }

  return {
    CHALLENGE_PICKUP_TYPES,
    CAMPAIGN_CHALLENGE_TYPES,
    rollCampaignChallengeType,
    finishCampaignChallenge,
    resolveCampaignChallengePickup,
    updateCampaignGardenNode,
    collectCampaignGardenFruit,
    advanceCampaignMovingWorldEntity,
    purchaseCampaignSecretVendor,
    rollDistinctCampaignReward,
    createCampaignSecretRoomPlan,
    lootCampaignSecretBossChest,
    useCampaignLadder,
  };
});
