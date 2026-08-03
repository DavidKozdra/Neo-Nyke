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
  const SPECIAL_ROOM_TYPES = Object.freeze([
    'shrine', 'bounty', 'reliquary', 'oracle', 'portal', 'prison', 'wishing_well',
    'chronicle', 'armory', 'mutation_lab', 'observatory', 'void_market',
  ]);
  const CHOICE_IDS = Object.freeze({
    shrine: ['blood', 'relic', 'covenant'], bounty: ['elite_hunter', 'elite_charger', 'elite_sniper'],
    reliquary: ['fuse', 'distill', 'echo'], oracle: ['map', 'secret', 'transmute'],
    portal: ['threshold', 'vault', 'descend'], prison: ['scout', 'medic', 'veteran'],
    wishing_well: ['small', 'deep', 'blood'],
    chronicle: ['recall', 'atlas', 'revision'], armory: ['edge', 'plate', 'arsenal'],
    mutation_lab: ['fury', 'regeneration', 'adaptation'], observatory: ['chart', 'star', 'orbit'],
    void_market: ['purchase', 'sell_life', 'entropy'],
  });
  const LOOP_ROOM_UNLOCKS = Object.freeze({ chronicle: 1, armory: 3, mutation_lab: 6, observatory: 9, void_market: 13 });
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
    const loopIndex = Math.max(0, Math.trunc(Number(state.runLoopIndex ?? state.floorState?.runLoopIndex) || 0));
    if (LOOP_ROOM_UNLOCKS[room.type] != null && loopIndex < LOOP_ROOM_UNLOCKS[room.type]) {
      return { ok: false, reason: 'LOOP_CONTENT_LOCKED' };
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
    } else if (room.type === 'wishing_well') {
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
    } else if (room.type === 'chronicle') {
      if (choiceId === 'recall') {
        grantXp(player, Math.max(30, Math.round(Number(player.xpToNext || 20) * 1.5)));
        result = 'Every battle remembered';
      } else if (choiceId === 'atlas') {
        roomsOf(state).forEach(candidate => {
          if (!candidate.secret) candidate.explored = true;
          Object.values(candidate.secretPassages || {}).forEach(passage => { passage.open = true; });
        });
        result = 'Every door receives its name';
      } else {
        if (state.floorState) state.floorState.curses = {};
        if (state.matchRules) { state.matchRules.obscureMap = false; state.matchRules.rivalCurses = {}; }
        player.hp = Math.min(player.maxHp, Number(player.hp || 0) + Number(player.maxHp || 0) * 0.5);
        result = 'The wound is revised';
      }
    } else if (room.type === 'armory') {
      if (choiceId === 'edge') {
        player.attackPower = Number(player.attackPower || 0) + 4 + Math.floor((loopIndex + 1) / 4);
        result = 'The God-Edge is honed';
      } else if (choiceId === 'plate') {
        player.maxHp = Number(player.maxHp || 0) + 20; player.hp = Math.min(player.maxHp, Number(player.hp || 0) + 20);
        result = 'Living plate fitted';
      } else {
        inventoryApi.collectCampaignItem(player, 'forge_voucher', { amount: 2 });
        grantXp(player, Math.max(20, Number(player.xpToNext || 20)));
        result = 'The arsenal is yours';
      }
    } else if (room.type === 'mutation_lab') {
      if (choiceId === 'fury') {
        const cost = Math.max(10, Math.round(Number(player.maxHp || 120) * 0.08));
        if (player.maxHp - cost < 30) return { ok: false, reason: 'LOW_MAX_HP' };
        player.maxHp -= cost; player.hp = Math.min(player.hp, player.maxHp);
        player.attackPower = Number(player.attackPower || 0) + 6 + Math.floor((loopIndex + 1) / 5);
        result = 'Fury spliced';
      } else if (choiceId === 'regeneration') {
        player.maxHp = Number(player.maxHp || 0) + 25; player.hp = player.maxHp; result = 'Regeneration spliced';
      } else {
        rewardKey = grantItem(player, random, true); result = 'Adaptation spliced';
      }
    } else if (room.type === 'observatory') {
      if (choiceId === 'chart') {
        roomsOf(state).forEach(candidate => {
          candidate.explored = true;
          Object.values(candidate.secretPassages || {}).forEach(passage => { passage.open = true; });
        });
        result = 'The unseen is charted';
      } else if (choiceId === 'star') {
        rewardKey = grantItem(player, random, true); result = 'A dead star is caught';
      } else {
        player.moveSpeed = Number(player.moveSpeed || 228) + 12;
        grantXp(player, 40);
        result = 'Fast orbit achieved';
      }
    } else if (room.type === 'void_market') {
      if (choiceId === 'purchase') {
        const cost = 120 + floor * 10;
        if (!spend(player, cost)) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
        rewardKey = grantItem(player, random, true); result = 'The impossible changes hands';
      } else if (choiceId === 'sell_life') {
        if (Number(player.maxHp || 0) < 46) return { ok: false, reason: 'LOW_MAX_HP' };
        player.maxHp -= 15; player.hp = player.maxHp; player.coins = Number(player.coins || 0) + 200;
        result = 'Fifteen years sold';
      } else {
        const relic = relics[relics.length - 1];
        if (!relic || !removeItem(player, relic.key)) return { ok: false, reason: 'NO_RELIC' };
        inventoryApi.collectCampaignItem(player, 'forge_voucher', { amount: 3 });
        grantXp(player, Math.max(20, Number(player.xpToNext || 20)));
        result = 'A relic is unmade';
      }
    }
    room.serviceUsed = true;
    room.serviceResult = result;
    return { ok: true, roomType: room.type, choiceId, result, rewardKey, transitionToRoomId, advanceFloor };
  }

  return { SPECIAL_ROOM_TYPES, CHOICE_IDS, applySpecialRoomChoice };
});
