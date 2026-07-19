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

  function finishCampaignChallenge(room, outcome, options = {}) {
    if (!room || room.type !== 'challenge' || !['completed', 'failed'].includes(outcome)) {
      return { ok: false, reason: 'INVALID_CHALLENGE_OUTCOME' };
    }
    const challengeType = room.challengeType || 'mirror';
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

  function purchaseCampaignSecretVendor(state, room, player, offer) {
    if (!state || !room || !player || !offer || offer.type !== 'secretVendor' || offer.bought) return { ok: false, reason: 'INVALID_SECRET_VENDOR_OFFER' };
    const cost = Math.max(1, Number(offer.cost || 1));
    const usesCoins = offer.offerKind === 'xp';
    const wallet = usesCoins ? Number(player.coins || 0) : Number(state.loopCrystals ?? state.metaProgress?.loopCrystals || 0);
    if (wallet < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS', cost, usesCoins };
    if (usesCoins) player.coins = wallet - cost;
    else if (state.metaProgress) state.metaProgress.loopCrystals = wallet - cost;
    else state.loopCrystals = wallet - cost;
    offer.bought = true;
    const result = { ok: true, type: 'SECRET_VENDOR_PURCHASED', offerKind: offer.offerKind, cost, usesCoins, rewardKey: '' };
    if (offer.offerKind === 'relic') result.rewardKey = String(offer.rewardKey || '');
    else if (offer.offerKind === 'vitality') { player.maxHp = Number(player.maxHp || 0) + 20; result.heal = 60; }
    else if (offer.offerKind === 'xp') { result.xp = Math.max(1, Number(offer.xpValue || 1)); player.xp = Number(player.xp || 0) + result.xp; }
    else { result.coins = Math.max(0, Number(offer.coinValue || 90 + Number(state.floorNumber ?? state.floor || 1) * 12)); player.coins = Number(player.coins || 0) + result.coins; }
    room.secretVendorUsed = true;
    return result;
  }

  function lootCampaignSecretBossChest(state, room, player, chest, options = {}) {
    if (!state || !room || !player || !chest || chest.type !== 'secret_boss_chest' || room.secretChestLooted) return { ok: false, reason: 'SECRET_CHEST_UNAVAILABLE' };
    room.secretChestLooted = true;
    const coins = Math.max(0, Number(options.coins ?? 60 + Number(state.floorNumber ?? state.floor || 1) * 8));
    player.coins = Number(player.coins || 0) + coins;
    return { ok: true, type: 'SECRET_BOSS_CHEST_LOOTED', rewardKey: String(options.rewardKey || chest.rewardKey || ''), coins };
  }

  function useCampaignLadder(runState, options = {}) {
    if (!runState) return { ok: false, reason: 'INVALID_RUN' };
    const floor = Math.max(1, Number(runState.floorNumber ?? runState.floor || 1));
    const maxFloor = Math.max(floor, Number(options.maxFloor || 10));
    if (options.gameMode === 'treasure_hunt' && floor >= maxFloor) return { ok: true, type: 'RUN_WON', floorNumber: floor };
    const nextFloor = Math.min(maxFloor, floor + 1);
    if ('floorNumber' in runState) runState.floorNumber = nextFloor;
    if ('floor' in runState) runState.floor = nextFloor;
    return { ok: true, type: 'LADDER_USED', previousFloor: floor, floorNumber: nextFloor };
  }

  return {
    CHALLENGE_PICKUP_TYPES,
    finishCampaignChallenge,
    resolveCampaignChallengePickup,
    updateCampaignGardenNode,
    collectCampaignGardenFruit,
    purchaseCampaignSecretVendor,
    lootCampaignSecretBossChest,
    useCampaignLadder,
  };
});
