(function initializeSharedRunServiceSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedRunServiceApi() {
  'use strict';

  function ensureAuthorityRunServices(state) {
    state.runServices = state.runServices && typeof state.runServices === 'object' ? state.runServices : {};
    const services = state.runServices;
    services.saveRevision = Math.max(0, Number(services.saveRevision || 0));
    services.lastSavedTick = Math.max(0, Number(services.lastSavedTick || 0));
    services.achievementsByPlayer = services.achievementsByPlayer || {};
    services.tutorialByPlayer = services.tutorialByPlayer || {};
    services.unlocksByPlayer = services.unlocksByPlayer || {};
    services.challengeModifiers = services.challengeModifiers || { ...(state.matchRules?.challengeModifiers || {}) };
    services.alternateMode = services.alternateMode || { mode: String(state.gameMode || 'normal') };
    return services;
  }

  function applyAuthorityRunEvent(state, eventType, data = {}) {
    if (!state) return { ok: false, reason: 'INVALID_RUN_STATE' };
    const services = ensureAuthorityRunServices(state);
    const type = String(eventType || 'UNKNOWN');
    const playerId = String(data.playerId || data.sourcePlayerId || '');
    const achievements = playerId ? (services.achievementsByPlayer[playerId] ||= {}) : null;
    const tutorial = playerId ? (services.tutorialByPlayer[playerId] ||= {}) : null;
    if (type === 'ENEMY_DEFEATED' && achievements) achievements.enemyKills = Number(achievements.enemyKills || 0) + 1;
    if (type === 'PLAYER_LEVELED' && achievements) achievements.highestLevel = Math.max(Number(achievements.highestLevel || 1), Number(data.level || 1));
    if (type === 'PICKUP_COLLECTED' && achievements) {
      if (data.itemKey) achievements.itemsCollected = Number(achievements.itemsCollected || 0) + Math.max(1, Number(data.amount || 1));
      if (tutorial && data.itemKey) tutorial.relicCollected = true;
    }
    if (type === 'CHEST_OPENED' && tutorial) tutorial.chestOpened = true;
    if (type === 'SHOP_PURCHASED' && tutorial) tutorial.shopPurchased = true;
    if (type === 'FORGE_COMMITTED' && tutorial) tutorial.forgeCommitted = true;
    if (type === 'PLAYER_ABILITY_USED' && tutorial && ['dash', 'warp', 'dash_aoe'].includes(data.presentation?.kind || data.mode)) tutorial.dashed = true;
    if (type === 'FLOOR_ADVANCED') {
      services.highestFloor = Math.max(Number(services.highestFloor || 1), Number(data.floorNumber || state.floorNumber || 1));
      Object.values(services.tutorialByPlayer).forEach(progress => { progress.ladderUsed = true; });
    }
    if (type === 'CHALLENGE_COMPLETED') services.challengesCompleted = Number(services.challengesCompleted || 0) + 1;
    if (type === 'RUN_ENDED') services.runResult = { result: data.result, reason: data.reason, floorNumber: data.floorNumber };
    const persistentEvent = !['ENEMY_TELEGRAPH', 'ENEMY_ATTACKED', 'ENEMY_HIT', 'PLAYER_HIT', 'PROJECTILE_BOUNCED'].includes(type);
    if (persistentEvent) {
      services.saveRevision += 1;
      services.lastSavedTick = Math.max(0, Number(state.tick || 0));
    }
    return { ok: true, services, persistentEvent };
  }

  function getClientRunServiceIntents(eventType, data = {}, localPlayerId = '') {
    const type = String(eventType || '');
    const local = !data.playerId || data.playerId === localPlayerId;
    const intents = [];
    if (type === 'ENEMY_DEFEATED' && data.playerId === localPlayerId) intents.push({ kind: 'achievement', name: 'enemy:killed', data });
    if (type === 'PLAYER_LEVELED' && local) intents.push({ kind: 'achievement', name: 'player:leveled', data });
    if (type === 'PICKUP_COLLECTED' && local && data.itemKey) {
      intents.push({ kind: 'achievement', name: 'item:collected', data: { key: data.itemKey, amount: data.amount } });
      intents.push({ kind: 'tutorial', name: 'relic-collected', data: { key: data.itemKey } });
    }
    if (type === 'PICKUP_COLLECTED' && local && Number(data.healedAmount || 0) > 0) intents.push({ kind: 'achievement', name: 'heal:applied', data: { amount: data.healedAmount } });
    if (type === 'CHEST_OPENED' && local) intents.push({ kind: 'tutorial', name: 'chest-open', data });
    if (type === 'SHOP_PURCHASED' && local) {
      intents.push({ kind: 'achievement', name: 'shop:bought', data });
      intents.push({ kind: 'tutorial', name: 'shop-purchase', data });
    }
    if (type === 'FORGE_COMMITTED' && local) intents.push({ kind: 'tutorial', name: 'forge-confirm', data });
    if (type === 'FLOOR_ADVANCED') {
      intents.push({ kind: 'achievement', name: 'floor:reached', data: { floor: data.floorNumber } });
      intents.push({ kind: 'tutorial', name: 'ladder-use', data });
    }
    if (type === 'CHALLENGE_COMPLETED') intents.push({ kind: 'achievement', name: 'challenge:beaten', data: { challengeType: data.achievementType || data.challengeType } });
    if (type === 'SPECIAL_ROOM_CHOICE_APPLIED' && local && data.roomType === 'reliquary') {
      intents.push({ kind: 'achievement', name: 'reliquary:used', data: { service: data.choiceId } });
    }
    if (type === 'RUN_ENDED' && data.result === 'victory') intents.push({ kind: 'achievement', name: 'run:won', data });
    return intents;
  }

  return { ensureAuthorityRunServices, applyAuthorityRunEvent, getClientRunServiceIntents };
});
