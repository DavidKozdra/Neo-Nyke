(function initializeSharedSpecialRoomSystem(root, factory) {
  const itemApi = typeof require === 'function' ? require('./SharedItemContent.js') : (root.NeoNyke?.content || {});
  const inventoryApi = typeof require === 'function' ? require('./SharedInventorySystem.js') : (root.NeoNyke?.simulation || {});
  const api = factory(itemApi, inventoryApi);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedSpecialRoomSystemApi(itemApi, inventoryApi) {
  'use strict';
  const SPECIAL_ROOM_TYPES = Object.freeze(['shrine', 'bounty', 'reliquary', 'oracle', 'portal', 'prison', 'wishing_well']);
  const CHOICE_IDS = Object.freeze({
    shrine: ['blood', 'relic', 'covenant'], bounty: ['elite_hunter', 'elite_charger', 'elite_sniper'],
    reliquary: ['fuse', 'distill', 'echo'], oracle: ['map', 'secret', 'transmute'],
    portal: ['threshold', 'vault', 'descend'], prison: ['scout', 'medic', 'veteran'],
    wishing_well: ['small', 'deep', 'blood'],
  });
  const amount = (player, key) => Math.max(0, Math.floor(Number(player?.items?.[key] || 0)));
  const spend = (player, cost) => {
    const value = Math.max(0, Math.round(Number(cost || 0)));
    if (Number(player.coins || 0) < value) return false;
    player.coins -= value;
    return true;
  };
  const removeItem = (player, key, count = 1) => {
    if (amount(player, key) < count) return false;
    player.items[key] -= count;
    if (player.items[key] <= 0) delete player.items[key];
    inventoryApi.syncEquipmentSlots(player);
    return true;
  };
  const mutableRelics = player => Object.entries(player?.items || {})
    .filter(([key, value]) => Number(value) > 0 && !key.startsWith('voucher_') && !key.startsWith('scroll_') && key !== 'forge_voucher')
    .map(([key, value]) => ({ key, count: Math.floor(Number(value)) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const grantItem = (player, random, elite = false, excludeKeys = []) => {
    const key = itemApi.rollCampaignItem(random, { elite, excludeKeys });
    if (key) inventoryApi.collectCampaignItem(player, key);
    return key;
  };
  const grantXp = (player, value) => { player.xp = Math.max(0, Number(player.xp || 0) + Math.max(0, Number(value || 0))); };
  const roomsOf = state => state.floorState?.layout?.rooms || [];
  const roomKey = room => `${room?.gx},${room?.gy}`;

  function applySpecialRoomChoice(state, room, player, choiceId, random) {
    if (!state || !room || !player || room.serviceUsed || !SPECIAL_ROOM_TYPES.includes(room.type) || !CHOICE_IDS[room.type]?.includes(choiceId)) {
      return { ok: false, reason: 'INVALID_SPECIAL_CHOICE' };
    }
    const floor = Math.max(1, Number(state.floorNumber || 1));
    const relics = mutableRelics(player);
    let result = '';
    let rewardKey = '';
    let transitionToRoomId = '';
    let advanceFloor = false;

    if (room.type === 'shrine') {
      if (choiceId === 'blood') {
        const cost = Math.max(12, Math.round(Number(player.maxHp || 120) * 0.12));
        if (player.maxHp - cost < 30) return { ok: false, reason: 'LOW_MAX_HP' };
        player.maxHp -= cost; player.hp = Math.min(player.hp, player.maxHp); player.attackPower = Number(player.attackPower || 0) + 3 + Math.ceil(floor / 2);
        result = 'Blood offering accepted';
      } else if (choiceId === 'relic') {
        const relic = relics[relics.length - 1];
        if (!relic || !removeItem(player, relic.key)) return { ok: false, reason: 'NO_RELIC' };
        rewardKey = grantItem(player, random, true, [relic.key]); result = 'Relic ascended';
      } else {
        state.floorState.curses = { ...(state.floorState.curses || {}), obscureMap: true };
        if (player.activeBounty) player.activeBounty.rewardMultiplier = Math.max(1, Number(player.activeBounty.rewardMultiplier || 1)) * 2;
        rewardKey = grantItem(player, random, true);
        inventoryApi.collectCampaignItem(player, 'forge_voucher'); result = 'Covenant sealed';
      }
    } else if (room.type === 'bounty') {
      if (player.activeBounty) return { ok: false, reason: 'ACTIVE_BOUNTY' };
      const target = { elite_hunter: 'hunter', elite_charger: 'charger', elite_sniper: 'sniper' }[choiceId];
      player.activeBounty = {
        kind: choiceId, enemyType: target, targetName: target.toUpperCase(), targetId: `bounty:${floor}:${roomKey(room)}:${choiceId}`,
        contractType: choiceId === 'elite_hunter' ? 'execution' : choiceId === 'elite_charger' ? 'capture' : 'theft',
        acceptedDepth: floor, targetSpawned: false, targetRoomKey: '', returnDepth: 0, escapes: 0, rewardMultiplier: 1, rivalPressure: 0,
      };
      result = 'Bounty accepted';
    } else if (room.type === 'reliquary') {
      if (choiceId === 'fuse') {
        const relic = relics.find(entry => entry.count >= 2);
        if (!relic || !removeItem(player, relic.key, 2)) return { ok: false, reason: 'NO_DUPLICATE' };
        rewardKey = grantItem(player, random, true, [relic.key]); result = 'Relic ascended';
      } else if (choiceId === 'distill') {
        const relic = relics[relics.length - 1];
        if (!relic || !removeItem(player, relic.key)) return { ok: false, reason: 'NO_RELIC' };
        grantXp(player, Math.max(10, Math.round(Number(player.xpToNext || 20) * 0.75))); result = 'Relic distilled';
      } else if (Number(player.bountyTrophies || 0) > 0) {
        player.bountyTrophies -= 1; player.maxHp += 5; player.hp += 5; player.attackPower = Number(player.attackPower || 0) + 2;
        inventoryApi.collectCampaignItem(player, 'forge_voucher'); result = 'Trophy tempered';
      } else {
        const relic = relics[0]; const cost = 70 + floor * 8;
        if (!relic || !spend(player, cost)) return { ok: false, reason: relic ? 'INSUFFICIENT_FUNDS' : 'NO_RELIC' };
        inventoryApi.collectCampaignItem(player, relic.key); rewardKey = relic.key; result = 'Relic echoed';
      }
    } else if (room.type === 'oracle') {
      const rooms = roomsOf(state);
      if (choiceId === 'map') {
        rooms.filter(candidate => !candidate.secret).forEach(candidate => { candidate.explored = true; });
        // A paid oracle vision outranks the Princess's current-floor map curse.
        // Keep every representation used by campaign and authoritative sessions
        // in sync so the revealed rooms are actually visible to their clients.
        if (state.floorState?.curses) state.floorState.curses.obscureMap = false;
        if (state.matchRules) {
          state.matchRules.obscureMap = false;
          if (state.matchRules.rivalCurses) state.matchRules.rivalCurses.obscureMap = false;
        }
        if (player.activeBounty) player.activeBounty.rewardMultiplier = Math.max(1, Number(player.activeBounty.rewardMultiplier || 1)) + 0.25;
        result = 'The floor is revealed';
      } else if (choiceId === 'secret') {
        let opened = false;
        for (const candidate of rooms) for (const passage of Object.values(candidate.secretPassages || {})) {
          if (!passage.open) { passage.open = true; opened = true; break; }
        }
        if (!opened) return { ok: false, reason: 'NO_SECRET' };
        result = 'A secret passage opens';
      } else {
        const target = rooms.find(candidate => candidate.type === 'combat' && !candidate.visited);
        if (!target) return { ok: false, reason: 'NO_COMBAT_ROOM' };
        target.type = 'treasure'; target.explored = true; result = 'Combat rewritten as treasure';
      }
    } else if (room.type === 'portal') {
      const rooms = roomsOf(state);
      if (choiceId === 'threshold') {
        const target = rooms.find(candidate => ['ladder', 'boss', 'god'].includes(candidate.type));
        const cost = Math.max(10, Math.round(Number(player.coins || 0) * 0.25));
        if (!target || !spend(player, cost)) return { ok: false, reason: target ? 'INSUFFICIENT_FUNDS' : 'NO_EXIT' };
        transitionToRoomId = target.id; result = 'Portal opened to the exit';
      } else if (choiceId === 'vault') {
        const target = rooms.find(candidate => candidate !== room && ((candidate.type === 'treasure' && !candidate.visited) || (SPECIAL_ROOM_TYPES.includes(candidate.type) && !candidate.visited)));
        if (!target) return { ok: false, reason: 'NO_DESTINATION' };
        transitionToRoomId = target.id; result = 'Portal route changed';
      } else {
        if (floor >= 10) return { ok: false, reason: 'MAX_FLOOR' };
        advanceFloor = true; result = 'The floor is left behind';
      }
    } else if (room.type === 'prison') {
      player.rescuedPrisoners = Math.max(0, Number(player.rescuedPrisoners || 0)) + 1;
      if (choiceId === 'scout') {
        roomsOf(state).filter(candidate => ['ladder', 'boss', 'god', 'shop', 'anvil', ...SPECIAL_ROOM_TYPES].includes(candidate.type)).forEach(candidate => { candidate.explored = true; });
        result = 'Scout rescued';
      } else if (choiceId === 'medic') { player.maxHp += 15; player.hp = player.maxHp; result = 'Medic rescued'; }
      else { player.attackPower = Number(player.attackPower || 0) + 3 + Math.ceil(floor / 3); grantXp(player, 20 + floor * 5); result = 'Veteran rescued'; }
    } else {
      const smallCost = 25; const deepCost = 75; const hpCost = Math.max(10, Math.round(Number(player.maxHp || 120) * 0.1));
      if (choiceId === 'small') {
        if (!spend(player, smallCost)) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
        const roll = Math.floor(random.next() * 4);
        if (roll === 0) player.hp = player.maxHp;
        else if (roll === 1) grantXp(player, 45 + floor * 4);
        else if (roll === 2) player.coins += 60;
        else rewardKey = grantItem(player, random, false);
        result = 'The well answers';
      } else if (choiceId === 'deep') {
        if (!spend(player, deepCost)) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
        const roll = Math.floor(random.next() * 4);
        if (roll === 0) rewardKey = grantItem(player, random, true);
        else if (roll === 1) { player.maxHp += 20; player.hp += 20; }
        else if (roll === 2) inventoryApi.collectCampaignItem(player, 'forge_voucher', { amount: 2 });
        result = roll === 3 ? 'The well is dry' : 'The well answers';
      } else {
        if (player.maxHp - hpCost < 30) return { ok: false, reason: 'LOW_MAX_HP' };
        player.maxHp -= hpCost; player.hp = Math.min(player.hp, player.maxHp); rewardKey = grantItem(player, random, true); result = 'Blood wish answered';
      }
    }
    room.serviceUsed = true;
    room.serviceResult = result;
    return { ok: true, roomType: room.type, choiceId, result, rewardKey, transitionToRoomId, advanceFloor };
  }

  return { SPECIAL_ROOM_TYPES, CHOICE_IDS, applySpecialRoomChoice };
});
