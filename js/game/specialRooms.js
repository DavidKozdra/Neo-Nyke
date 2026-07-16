// specialRooms.js — run-shaping service rooms beyond Shop, Forge, and Trials.

export const SPECIAL_ROOM_DEFS = Object.freeze({
  shrine: {
    name: 'God Altar',
    shortName: 'Shrine',
    glyph: 'SH',
    color: '#d8a4ff',
    subtitle: 'Choose one costly blessing.',
  },
  bounty: {
    name: 'Bounty Board',
    shortName: 'Bounty',
    glyph: 'BO',
    color: '#ff9d66',
    subtitle: 'Take one contract this floor.',
  },
  reliquary: {
    name: 'Reliquary',
    shortName: 'Reliquary',
    glyph: 'RE',
    color: '#c98cff',
    subtitle: 'Reshape one of your relics.',
  },
  oracle: {
    name: 'Oracle',
    shortName: 'Oracle',
    glyph: 'OR',
    color: '#79dfff',
    subtitle: 'Reveal or rewrite this floor.',
  },
  portal: {
    name: 'Portal Chamber',
    shortName: 'Portal',
    glyph: 'PO',
    color: '#8e9dff',
    subtitle: 'Choose your next destination.',
  },
  prison: {
    name: 'Prison',
    shortName: 'Prison',
    glyph: 'PR',
    color: '#efc982',
    subtitle: 'Free one prisoner.',
  },
  wishing_well: {
    name: 'Wishing Well',
    shortName: 'Well',
    glyph: 'WW',
    color: '#ffd86b',
    subtitle: 'Pay for an unknown reward.',
  },
});

export const SPECIAL_ROOM_ORDER = Object.freeze(Object.keys(SPECIAL_ROOM_DEFS));
export const SPECIAL_ROOM_TYPES = new Set(SPECIAL_ROOM_ORDER);

// Reuse the established Inventory/Shop pixel-icon vocabulary so service cards
// read like the rest of the game UI instead of falling back to text-only tiles.
const SPECIAL_CHOICE_ICON_KEYS = Object.freeze({
  'shrine:blood': 'bleed',
  'shrine:relic': 'item',
  'shrine:covenant': 'role-god',
  'bounty:elite_hunter': 'attack',
  'bounty:elite_charger': 'speed',
  'bounty:elite_sniper': 'range',
  'reliquary:fuse': 'tab-relics',
  'reliquary:distill': 'role-wizard',
  'reliquary:echo': 'item',
  'oracle:map': 'range',
  'oracle:secret': 'role-assassin',
  'oracle:transmute': 'role-wizard',
  'portal:threshold': 'range',
  'portal:vault': 'tab-relics',
  'portal:descend': 'speed',
  'prison:scout': 'role-assassin',
  'prison:medic': 'hp',
  'prison:veteran': 'role-knight',
  'wishing_well:small': 'item',
  'wishing_well:deep': 'role-god',
  'wishing_well:blood': 'bleed',
});

export function getScheduledSpecialRoomType(floor = 1, loopIndex = 0) {
  const depth = Math.max(0, Math.floor(Number(floor || 1)) - 1 + Math.max(0, Math.floor(Number(loopIndex || 0))) * 3);
  return SPECIAL_ROOM_ORDER[depth % SPECIAL_ROOM_ORDER.length];
}

function isSpecialRoom(room = Neo.currentRoom) {
  return !!room && SPECIAL_ROOM_TYPES.has(room.type);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function roomKey(room) {
  return room ? `${room.gx},${room.gy}` : '';
}

function itemName(key) {
  return Neo.itemRegistry?.get?.(key)?.name || Neo.ITEM_DEFS?.[key]?.name || Neo.titleCase?.(key) || key;
}

function isMutableRelic(key) {
  const item = Neo.itemRegistry?.get?.(key) || Neo.ITEM_DEFS?.[key];
  return !!item && !item.voucher && !Neo.isScrollControlItem?.(key);
}

function ownedRelics() {
  return Object.entries(Neo.player?.items || {})
    .filter(([key, count]) => Number(count || 0) > 0 && isMutableRelic(key))
    .map(([key, count]) => ({ key, count: Math.floor(Number(count || 0)), name: itemName(key) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function removeRelic(key, amount = 1) {
  if (!Neo.player?.items || Number(Neo.player.items[key] || 0) < amount) return false;
  Neo.player.items[key] = Math.max(0, Number(Neo.player.items[key] || 0) - amount);
  if (Neo.player.items[key] <= 0) delete Neo.player.items[key];
  Neo.syncEquipmentSlotsFromInventory?.();
  Neo.markInventoryPanelDirty?.();
  return true;
}

function spendCoins(cost) {
  const amount = Math.max(0, Math.round(Number(cost || 0)));
  if (!Neo.player || Number(Neo.player.coins || 0) < amount) return false;
  Neo.player.coins -= amount;
  if (Neo.metaProgress) Neo.metaProgress.coins = Math.max(0, Number(Neo.metaProgress.coins || 0) - amount);
  Neo.persistMetaSoon?.();
  return true;
}

function grantForgeVouchers(amount = 1) {
  const count = Math.max(1, Math.floor(Number(amount || 1)));
  const key = Neo.FORGE_VOUCHER_KEY || 'forge_voucher';
  Neo.player.items[key] = Math.max(0, Number(Neo.player.items[key] || 0)) + count;
  Neo.markInventoryPanelDirty?.();
  Neo.pushItemNotification?.(key, count);
}

function getRoomRewardKey(room, rewardId, { elite = false } = {}) {
  room.serviceRewards = room.serviceRewards && typeof room.serviceRewards === 'object' ? room.serviceRewards : {};
  if (Neo.ITEM_DEFS?.[room.serviceRewards[rewardId]]) return room.serviceRewards[rewardId];
  const random = Neo.createRoomRandom?.(room, `special:${rewardId}`) || Neo.rng;
  const key = Neo.rollItemDrop?.({ elite, random });
  if (key) room.serviceRewards[rewardId] = key;
  return key || '';
}

function grantRelic(room, rewardId, { elite = false } = {}) {
  const key = getRoomRewardKey(room, rewardId, { elite });
  if (!key) return '';
  Neo.collectItem?.(key);
  return key;
}

const SPECIAL_CHOICE_POSITIONS = Object.freeze([
  { x: -138, y: 42 },
  { x: 0, y: -28 },
  { x: 138, y: 42 },
]);

function serviceChoicePickups(room) {
  return getChoices(room).map((choice, index) => {
    const position = SPECIAL_CHOICE_POSITIONS[index] || { x: (index - 1) * 138, y: 42 };
    return {
      x: Neo.ROOM_W / 2 + position.x,
      y: Neo.ROOM_H / 2 + position.y,
      type: 'specialChoice',
      serviceType: room.type,
      choiceId: choice.id,
    };
  });
}

export function assignSpecialServiceRoom(pool = []) {
  if (!Array.isArray(pool) || Neo.isTutorialRun?.() || Neo.gameMode === 'treasure_hunt') return null;
  const candidate = pool.find(room => room?.type === 'combat');
  if (!candidate) return null;
  candidate.type = getScheduledSpecialRoomType(Neo.floor, Neo.runLoopIndex);
  return candidate;
}

export function prepareSpecialRoom(room) {
  if (!isSpecialRoom(room)) return false;
  room.cleared = true;
  room.serviceUsed = !!room.serviceUsed;
  room.pickups = Array.isArray(room.pickups) ? room.pickups : [];
  // Replace the legacy floating room orb with one stable world prop per choice.
  // Rebuild these on entry because costs and availability can depend on the
  // player's current inventory, HP, coins, or active bounty.
  room.pickups = room.pickups.filter(pickup => !['specialService', 'specialChoice'].includes(pickup?.type));
  if (!room.serviceUsed) room.pickups.push(...serviceChoicePickups(room));
  return true;
}

function consumeService(room, result) {
  room.serviceUsed = true;
  room.serviceResult = String(result || 'The room falls silent.');
  room.pickups = (room.pickups || []).filter(pickup => !['specialService', 'specialChoice'].includes(pickup?.type));
  if (room === Neo.currentRoom) Neo.pickups = Neo.pickups.filter(pickup => !['specialService', 'specialChoice'].includes(pickup?.type));
  Neo.playSfx?.('buy_sell');
  Neo.spawnParticle?.({
    x: Neo.player?.x || Neo.ROOM_W / 2,
    y: (Neo.player?.y || Neo.ROOM_H / 2) - 28,
    life: 1,
    text: room.serviceResult.toUpperCase(),
    c: SPECIAL_ROOM_DEFS[room.type]?.color || '#d7f6ff',
  });
  Neo.markInventoryPanelDirty?.();
  Neo.updateHud?.();
  Neo.updateObjective?.();
  Neo.syncCurrentRoomState?.();
  Neo.scheduleRunSave?.();
}

function makeChoice(id, title, description, cost, apply, enabled = true, disabledReason = '') {
  return { id, title, description, cost, apply, enabled, disabledReason };
}

function shrineChoices(room) {
  const relics = ownedRelics();
  const sacrifice = relics[relics.length - 1];
  const noItems = Neo.isChallengeActive?.('no_items');
  const hpCost = Math.max(12, Math.round(Number(Neo.player?.maxHp || 120) * 0.12));
  const attackGain = 3 + Math.ceil(Number(Neo.floor || 1) / 2);
  const activeHunt = Neo.player?.activeBounty;
  return [
    makeChoice('blood', 'Blood Offering', `-${hpCost} max HP. +${attackGain} attack.`, `${hpCost} MAX HP`, () => {
      if (Neo.player.maxHp - hpCost < 30) return false;
      Neo.player.maxHp -= hpCost;
      Neo.player.hp = Math.min(Neo.player.hp, Neo.player.maxHp);
      Neo.player.attackPower += attackGain;
      consumeService(room, `Blood accepted: +${attackGain} attack`);
      return true;
    }, Number(Neo.player?.maxHp || 0) - hpCost >= 30, 'Maximum HP is already too low.'),
    makeChoice('relic', sacrifice ? `Sacrifice ${sacrifice.name}` : 'Relic Sacrifice', 'Trade one relic for an elite relic.', '1 RELIC', () => {
      if (!sacrifice || !removeRelic(sacrifice.key, 1)) return false;
      const reward = grantRelic(room, 'shrine-sacrifice', { elite: true });
      consumeService(room, reward ? `${itemName(reward)} bestowed` : 'The offering was accepted');
      return true;
    }, !!sacrifice && !noItems, noItems ? 'Disabled by No Items.' : 'No relic available.'),
    makeChoice('covenant', 'Dark Covenant', `Hide the map. Gain an elite relic + voucher.${activeHunt ? ' Double hunt payout.' : ''}`, 'CURSE', () => {
      Neo.floorRivalCurses = Neo.floorRivalCurses || {};
      Neo.floorRivalCurses.obscureMap = true;
      Neo.pendingRivalCurses = Neo.pendingRivalCurses || {};
      Neo.pendingRivalCurses.obscureMap = true;
      if (Neo.player.activeBounty) {
        Neo.player.activeBounty.rewardMultiplier = Math.max(1, Number(Neo.player.activeBounty.rewardMultiplier || 1)) * 2;
        Neo.player.activeBounty.huntCovenant = true;
      }
      const reward = grantRelic(room, 'shrine-covenant', { elite: true });
      grantForgeVouchers(1);
      consumeService(room, reward ? `Covenant sealed: ${itemName(reward)}` : 'Covenant sealed');
      return true;
    }, !noItems, 'Disabled by No Items.'),
  ];
}

const BOUNTY_DEFS = {
  elite_hunter: {
    title: 'Elite Hunter',
    enemyType: 'hunter',
    contractType: 'execution',
    reward: '90 coins',
    description: 'Kill the marked target.',
  },
  elite_charger: {
    title: 'Elite Charger',
    enemyType: 'charger',
    contractType: 'capture',
    reward: 'Forge Voucher + XP',
    description: 'Weaken it, then capture it.',
  },
  elite_sniper: {
    title: 'Elite Sniper',
    enemyType: 'sniper',
    contractType: 'theft',
    reward: 'Elite relic',
    description: 'Weaken it and steal its relic.',
  },
};

const BOUNTY_NAMES = Object.freeze({
  hunter: ['Vexa', 'Orin', 'Mara', 'Calder', 'Nyx'],
  charger: ['Brakk', 'Iona', 'Rook', 'Tarn', 'Sable'],
  sniper: ['Silas', 'Kestrel', 'Morrow', 'Vale', 'Ash'],
});
const BOUNTY_EPITHETS = Object.freeze(['the Relentless', 'the Unbroken', 'Godmarked', 'the Red Hand', 'Last of the Host']);
const BOUNTY_WEAKNESSES = Object.freeze(['bleed', 'fire', 'poison', 'slow', 'static']);

function getBountyProfile(room, kind) {
  const def = BOUNTY_DEFS[kind];
  if (!def) return null;
  room.bountyProfiles = room.bountyProfiles && typeof room.bountyProfiles === 'object' ? room.bountyProfiles : {};
  if (room.bountyProfiles[kind]?.name) return room.bountyProfiles[kind];
  const random = Neo.createRoomRandom?.(room, `bounty-profile:${kind}`) || Neo.rng;
  const names = BOUNTY_NAMES[def.enemyType] || BOUNTY_NAMES.hunter;
  const profile = {
    name: names[Math.floor(random() * names.length)] || names[0],
    epithet: BOUNTY_EPITHETS[Math.floor(random() * BOUNTY_EPITHETS.length)] || BOUNTY_EPITHETS[0],
    weakness: BOUNTY_WEAKNESSES[Math.floor(random() * BOUNTY_WEAKNESSES.length)] || 'bleed',
    contractType: def.contractType,
    enemyType: def.enemyType,
  };
  room.bountyProfiles[kind] = profile;
  return profile;
}

function createBountyToastIcon(enemyType, accent = '#ffb070') {
  const icon = document.createElement('canvas');
  icon.width = 44;
  icon.height = 44;
  if (typeof Neo.drawSpriteToCanvas === 'function') {
    Neo.drawSpriteToCanvas(icon, enemyType || 'hunter', 40, { tint: accent });
  } else {
    Neo.drawInventoryUiIcon?.(icon, 'attack');
  }
  return icon;
}

function pushBountyToast(bounty, { label = 'Bounty', text = '', accent = '#ffb070', holdMs = 3000 } = {}) {
  const def = BOUNTY_DEFS[bounty?.kind] || {};
  Neo.pushStatusToast?.({
    label,
    text: text || bounty?.targetName || def.title || 'Contract updated',
    accent,
    iconCanvas: createBountyToastIcon(def.enemyType, accent),
    holdMs,
  });
}

function acceptBounty(room, kind) {
  const def = BOUNTY_DEFS[kind];
  const profile = getBountyProfile(room, kind);
  if (!def || !profile || Neo.player.activeBounty) return false;
  Neo.player.activeBounty = {
    kind,
    acceptedDepth: Math.max(1, Number(Neo.floorsEntered || Neo.floor || 1)),
    enemyType: def.enemyType,
    targetName: profile.name,
    epithet: profile.epithet,
    weakness: profile.weakness,
    contractType: profile.contractType,
    targetId: `bounty:${Math.max(1, Number(Neo.floorsEntered || Neo.floor || 1))}:${roomKey(room)}:${kind}`,
    targetSpawned: false,
    targetRoomKey: '',
    returnDepth: 0,
    escapes: 0,
    rewardMultiplier: 1,
    rivalPressure: 0,
  };
  consumeService(room, `${profile.name} ${profile.epithet} accepted`);
  pushBountyToast(Neo.player.activeBounty, {
    label: 'Bounty Accepted',
    text: `${profile.name} ${profile.epithet} will enter your next combat room`,
  });
  return true;
}

function bountyChoices(room) {
  const active = Neo.player?.activeBounty;
  return Object.entries(BOUNTY_DEFS).map(([kind, def]) => {
    const profile = getBountyProfile(room, kind);
    const contractLabel = String(def.contractType || 'execution').toUpperCase();
    const weaknessLabel = Neo.titleCase?.(profile?.weakness || 'bleed') || profile?.weakness || 'Bleed';
    const choice = makeChoice(
      kind,
      `${profile.name} ${profile.epithet}`,
      `${def.description} Weak: ${weaknessLabel}. Reward: ${def.reward}.`,
      active ? 'ACTIVE CONTRACT' : 'ELITE TARGET',
      () => acceptBounty(room, kind),
      !active,
      active ? 'Finish the active bounty first.' : '',
    );
    choice.enemyType = def.enemyType;
    choice.contractLabel = contractLabel;
    return choice;
  });
}

function reliquaryChoices(room) {
  const relics = ownedRelics();
  const duplicate = relics.find(entry => entry.count >= 2);
  const distill = relics[relics.length - 1];
  const echo = relics[0];
  const echoCost = 70 + Number(Neo.floor || 1) * 8;
  const noItems = Neo.isChallengeActive?.('no_items');
  const trophies = Math.max(0, Math.floor(Number(Neo.player?.bountyTrophies || 0)));
  return [
    makeChoice('fuse', duplicate ? `Ascend ${duplicate.name}` : 'Ascend a Duplicate', 'Trade 2 stacks for an elite relic.', '2 STACKS', () => {
      if (!duplicate || !removeRelic(duplicate.key, 2)) return false;
      const reward = grantRelic(room, 'reliquary-fuse', { elite: true });
      consumeService(room, reward ? `${itemName(reward)} ascended` : 'Relic ascended');
      return true;
    }, !!duplicate && !noItems, noItems ? 'Disabled by No Items.' : 'No relic has two stacks.'),
    makeChoice('distill', distill ? `Distill ${distill.name}` : 'Distill a Relic', 'Trade 1 relic for 75% of a level.', '1 RELIC', () => {
      if (!distill || !removeRelic(distill.key, 1)) return false;
      const xp = Math.max(10, Math.round(Number(Neo.player.xpToNext || 20) * 0.75));
      Neo.grantXp?.(xp);
      consumeService(room, `${distill.name} distilled into XP`);
      return true;
    }, !!distill, 'No relic available.'),
    trophies > 0
      ? makeChoice('echo', 'Temper Hunt Trophy', '+5 max HP, +2 attack, and a voucher.', '1 TROPHY', () => {
        if (Number(Neo.player.bountyTrophies || 0) < 1) return false;
        Neo.player.bountyTrophies -= 1;
        Neo.player.maxHp += 5;
        Neo.player.hp += 5;
        Neo.player.attackPower += 2;
        grantForgeVouchers(1);
        consumeService(room, 'Hunt trophy tempered');
        return true;
      })
      : makeChoice('echo', echo ? `Echo ${echo.name}` : 'Echo a Relic', `Buy another ${echo?.name || 'relic'} stack.`, `${echoCost} COINS`, () => {
        if (!echo || !spendCoins(echoCost)) return false;
        Neo.collectItem?.(echo.key);
        consumeService(room, `${echo.name} echoed`);
        return true;
      }, !!echo && Number(Neo.player?.coins || 0) >= echoCost && !noItems, noItems ? 'Disabled by No Items.' : !echo ? 'No relic available.' : 'Not enough coins.'),
  ];
}

function findSecretPassage() {
  for (const source of Neo.rooms || []) {
    for (const [direction, passage] of Object.entries(source.secretPassages || {})) {
      const target = Neo.findRoomAt?.(passage.targetGx, passage.targetGy);
      if (target?.secret && !passage.open) return { source, direction, target };
    }
  }
  return null;
}

function oracleChoices(room) {
  const hiddenRooms = (Neo.rooms || []).filter(candidate => !candidate.secret && !candidate.explored);
  const secret = findSecretPassage();
  const transmute = (Neo.rooms || []).find(candidate => candidate.type === 'combat' && !candidate.visited);
  const activeHunt = Neo.player?.activeBounty;
  return [
    makeChoice('map', activeHunt ? 'Divine the Quarry' : 'Complete Map', activeHunt ? 'Reveal the floor. +25% hunt payout.' : 'Reveal all rooms and services.', 'ONE VISION', () => {
      Neo.rooms.forEach(candidate => { if (!candidate.secret) candidate.explored = true; });
      if (Neo.player.activeBounty) {
        Neo.player.activeBounty.oracleMarked = true;
        Neo.player.activeBounty.rewardMultiplier = Math.max(1, Number(Neo.player.activeBounty.rewardMultiplier || 1)) + 0.25;
      }
      Neo.minimapLegendDirty = true;
      consumeService(room, 'The floor is revealed');
      return true;
    }, hiddenRooms.length > 0, 'The floor is already revealed.'),
    makeChoice('secret', 'Whispered Door', 'Open the hidden passage.', 'ONE VISION', () => {
      const passage = findSecretPassage();
      if (!passage) return false;
      Neo.setSecretPassageOpen?.(passage.source, passage.direction, true);
      passage.target.explored = true;
      consumeService(room, 'A secret passage opens');
      return true;
    }, !!secret, 'No sealed secret passage remains.'),
    makeChoice('transmute', 'Rewrite Fate', 'Turn a combat room into Treasure.', 'ONE VISION', () => {
      const target = (Neo.rooms || []).find(candidate => candidate.type === 'combat' && !candidate.visited);
      if (!target) return false;
      target.type = 'treasure';
      Neo.decorateRoomData?.(target);
      target.explored = true;
      Neo.minimapLegendDirty = true;
      consumeService(room, 'Combat rewritten as treasure');
      return true;
    }, !!transmute, 'No unvisited combat room remains.'),
  ];
}

function moveThroughPortal(room, target, result) {
  if (!target) return false;
  consumeService(room, result);
  setSpecialRoomPanelOpen(false);
  Neo.enterRoom?.(target);
  return true;
}

function portalChoices(room) {
  const ladder = (Neo.rooms || []).find(candidate => candidate.type === 'ladder' || candidate.type === 'boss' || candidate.type === 'god');
  const treasure = (Neo.rooms || []).find(candidate => candidate !== room && candidate.type === 'treasure' && !candidate.visited);
  const service = (Neo.rooms || []).find(candidate => candidate !== room && isSpecialRoom(candidate) && !candidate.visited);
  const bounty = Neo.player?.activeBounty;
  const huntRoom = bounty?.targetRoomKey
    ? (Neo.rooms || []).find(candidate => roomKey(candidate) === bounty.targetRoomKey)
    : (Neo.rooms || []).find(candidate => candidate.type === 'combat' && !candidate.visited);
  const thresholdCost = Math.max(10, Math.round(Number(Neo.player?.coins || 0) * 0.25));
  const canDescend = Number(Neo.floor || 1) < Number(Neo.MAX_FLOOR || 10);
  return [
    makeChoice('threshold', 'Exit Threshold', 'Teleport to the exit.', `${thresholdCost} COINS`, () => {
      if (!ladder || !spendCoins(thresholdCost)) return false;
      return moveThroughPortal(room, ladder, 'Portal opened to the exit');
    }, !!ladder && Number(Neo.player?.coins || 0) >= thresholdCost, ladder ? 'Not enough coins.' : 'No exit is available.'),
    makeChoice('vault', bounty && huntRoom ? 'Hunt Gate' : treasure ? 'Treasure Gate' : service ? `Gate to ${SPECIAL_ROOM_DEFS[service.type].shortName}` : 'Treasure Gate', bounty && huntRoom ? `Teleport toward ${bounty.targetName || 'the quarry'}.` : treasure ? 'Teleport to Treasure.' : 'Teleport to a service room.', 'NO COST', () => moveThroughPortal(room, (bounty && huntRoom) || treasure || service, bounty && huntRoom ? 'Portal locked onto the quarry' : 'Portal route changed'), !!((bounty && huntRoom) || treasure || service), 'No eligible destination remains.'),
    makeChoice('descend', 'Blind Descent', 'Skip this floor and descend.', 'REMAINING ROOMS', () => {
      if (!canDescend) return false;
      consumeService(room, 'The floor is left behind');
      setSpecialRoomPanelOpen(false);
      Neo.floor = Math.min(Neo.MAX_FLOOR, Number(Neo.floor || 1) + 1);
      Neo.refreshFloorChargeStates?.();
      Neo.metaProgress.bestFloor = Math.max(Number(Neo.metaProgress.bestFloor || 1), Neo.floor);
      Neo.showFloorTransition = true;
      Neo.floorTransitionTime = 0;
      Neo._carriedRivals = (Neo.rivals || []).filter(rival => !rival.dead && rival.hp > 0);
      Neo.generateFloor?.();
      return true;
    }, canDescend, 'There is nowhere deeper to skip to.'),
  ];
}

function prisonChoices(room) {
  const activeHunt = Neo.player?.activeBounty;
  return [
    makeChoice('scout', activeHunt ? 'Free the Informant' : 'Free the Scout', activeHunt ? 'Reveal routes. Delay rival hunters.' : 'Reveal the exit and services.', 'ONE KEY', () => {
      Neo.rooms.forEach(candidate => {
        if (candidate.type === 'ladder' || candidate.type === 'boss' || candidate.type === 'god' || isSpecialRoom(candidate) || ['shop', 'anvil'].includes(candidate.type)) candidate.explored = true;
      });
      Neo.player.rescuedPrisoners = Math.max(0, Number(Neo.player.rescuedPrisoners || 0)) + 1;
      if (Neo.player.activeBounty) {
        Neo.player.activeBounty.rivalPressure = -35;
        Neo.player.activeBounty.informant = true;
      }
      consumeService(room, 'Scout rescued: routes marked');
      return true;
    }),
    makeChoice('medic', 'Free the Medic', '+15 max HP. Fully heal.', 'ONE KEY', () => {
      Neo.player.maxHp += 15;
      Neo.player.hp = Neo.player.maxHp;
      Neo.player.rescuedPrisoners = Math.max(0, Number(Neo.player.rescuedPrisoners || 0)) + 1;
      consumeService(room, 'Medic rescued: +15 max HP');
      return true;
    }),
    makeChoice('veteran', 'Free the Veteran', 'Gain attack and XP.', 'ONE KEY', () => {
      const attack = 3 + Math.ceil(Number(Neo.floor || 1) / 3);
      Neo.player.attackPower += attack;
      Neo.grantXp?.(20 + Number(Neo.floor || 1) * 5);
      Neo.player.rescuedPrisoners = Math.max(0, Number(Neo.player.rescuedPrisoners || 0)) + 1;
      consumeService(room, `Veteran rescued: +${attack} attack`);
      return true;
    }),
  ];
}

function getWellOutcome(room, wishId, outcomes) {
  room.wellOutcomes = room.wellOutcomes && typeof room.wellOutcomes === 'object' ? room.wellOutcomes : {};
  if (!Number.isInteger(room.wellOutcomes[wishId])) {
    const random = Neo.createRoomRandom?.(room, `well:${wishId}`) || Neo.rng;
    room.wellOutcomes[wishId] = Math.floor(random() * outcomes.length);
  }
  return outcomes[room.wellOutcomes[wishId] % outcomes.length];
}

function wellChoices(room) {
  const smallCost = 25;
  const deepCost = 75;
  const hpCost = Math.max(10, Math.round(Number(Neo.player?.maxHp || 120) * 0.1));
  const noItems = Neo.isChallengeActive?.('no_items');
  return [
    makeChoice('small', 'Cast a Coin', 'Random: heal, XP, coins, or relic.', `${smallCost} COINS`, () => {
      if (!spendCoins(smallCost)) return false;
      const outcome = getWellOutcome(room, 'small', ['heal', 'xp', 'coins', 'relic']);
      let result = 'The well stays quiet';
      if (outcome === 'heal') { Neo.player.hp = Neo.player.maxHp; result = 'The well restores your health'; }
      else if (outcome === 'xp') { Neo.grantXp?.(45 + Neo.floor * 4); result = 'The well grants XP'; }
      else if (outcome === 'coins') { Neo.addCoins?.(60); result = 'The well returns 60 coins'; }
      else if (!noItems) { const key = grantRelic(room, 'well-small'); result = key ? `The well grants ${itemName(key)}` : result; }
      else { Neo.grantXp?.(60); result = 'The well grants XP'; }
      consumeService(room, result);
      return true;
    }, Number(Neo.player?.coins || 0) >= smallCost, 'Not enough coins.'),
    makeChoice('deep', 'Golden Wish', 'Random: elite relic, HP, vouchers, or nothing.', `${deepCost} COINS`, () => {
      if (!spendCoins(deepCost)) return false;
      const outcome = getWellOutcome(room, 'deep', ['relic', 'vitality', 'vouchers', 'dry']);
      let result = 'The well is dry';
      if (outcome === 'relic' && !noItems) { const key = grantRelic(room, 'well-deep', { elite: true }); result = key ? `The well grants ${itemName(key)}` : result; }
      else if (outcome === 'vitality') { Neo.player.maxHp += 20; Neo.player.hp += 20; result = 'The well grants +20 max HP'; }
      else if (outcome === 'vouchers') { grantForgeVouchers(2); result = 'The well grants 2 Forge Vouchers'; }
      else if (outcome === 'relic') { Neo.grantXp?.(90); result = 'The well grants XP'; }
      consumeService(room, result);
      return true;
    }, Number(Neo.player?.coins || 0) >= deepCost, 'Not enough coins.'),
    makeChoice('blood', 'Blood Wish', `-${hpCost} max HP for an elite relic.`, `${hpCost} MAX HP`, () => {
      if (Neo.player.maxHp - hpCost < 30) return false;
      Neo.player.maxHp -= hpCost;
      Neo.player.hp = Math.min(Neo.player.hp, Neo.player.maxHp);
      const key = grantRelic(room, 'well-blood', { elite: true });
      consumeService(room, key ? `Blood answered with ${itemName(key)}` : 'Blood wish answered');
      return true;
    }, Number(Neo.player?.maxHp || 0) - hpCost >= 30 && !noItems, noItems ? 'Disabled by No Items.' : 'Maximum HP is already too low.'),
  ];
}

function getChoices(room) {
  if (!room || room.serviceUsed) return [];
  if (room.type === 'shrine') return shrineChoices(room);
  if (room.type === 'bounty') return bountyChoices(room);
  if (room.type === 'reliquary') return reliquaryChoices(room);
  if (room.type === 'oracle') return oracleChoices(room);
  if (room.type === 'portal') return portalChoices(room);
  if (room.type === 'prison') return prisonChoices(room);
  if (room.type === 'wishing_well') return wellChoices(room);
  return [];
}

export function getSpecialRoomChoiceView(choiceId, room = Neo.currentRoom) {
  if (!isSpecialRoom(room) || room.serviceUsed) return null;
  const choice = getChoices(room).find(entry => entry.id === choiceId);
  if (!choice) return null;
  return {
    id: choice.id,
    title: choice.title,
    description: choice.description,
    cost: choice.cost,
    enabled: !!choice.enabled,
    disabledReason: choice.disabledReason || '',
    enemyType: choice.enemyType || '',
    iconKey: SPECIAL_CHOICE_ICON_KEYS[`${room.type}:${choice.id}`] || 'item',
    color: SPECIAL_ROOM_DEFS[room.type]?.color || '#d7f6ff',
  };
}

export function getNearestSpecialRoomChoice(maxDistance = 118) {
  if (!isSpecialRoom() || Neo.currentRoom?.serviceUsed || !Neo.player) return null;
  let nearest = null;
  let nearestDistance = Math.max(0, Number(maxDistance || 0));
  for (const pickup of Neo.pickups || []) {
    if (pickup?.type !== 'specialChoice') continue;
    const distance = Neo.dist(Neo.player.x, Neo.player.y, pickup.x, pickup.y);
    if (distance > nearestDistance) continue;
    const choice = getSpecialRoomChoiceView(pickup.choiceId);
    if (!choice) continue;
    nearest = { pickup, choice, distance };
    nearestDistance = distance;
  }
  return nearest;
}

export function getSpecialRoomChoiceInteractLabel() {
  const nearest = getNearestSpecialRoomChoice(92);
  if (!nearest) return '';
  return nearest.choice.enabled
    ? `Choose ${nearest.choice.title} — ${nearest.choice.cost}`
    : `${nearest.choice.title} unavailable`;
}

export function trySpecialRoomChoiceInteract() {
  const nearest = getNearestSpecialRoomChoice(92);
  if (!nearest || Neo.currentRoom?.serviceUsed) return false;
  const choice = getChoices(Neo.currentRoom).find(entry => entry.id === nearest.choice.id);
  if (!choice) return false;
  if (!choice.enabled) {
    Neo.spawnParticle?.({
      x: nearest.pickup.x,
      y: nearest.pickup.y - 46,
      life: 1,
      text: String(choice.disabledReason || 'UNAVAILABLE').toUpperCase(),
      c: '#ff8b98',
    });
    Neo.playSfx?.('menu_error');
    return true;
  }
  return !!choice.apply();
}

function renderSpecialRoomPanel() {
  const panel = document.getElementById('specialRoomPanel');
  const title = document.getElementById('specialRoomTitle');
  const kicker = document.getElementById('specialRoomKicker');
  const subtitle = document.getElementById('specialRoomSubtitle');
  const resources = document.getElementById('specialRoomResources');
  const list = document.getElementById('specialRoomChoices');
  const room = Neo.currentRoom;
  if (!panel || !title || !list || !isSpecialRoom(room)) return;
  const def = SPECIAL_ROOM_DEFS[room.type];
  panel.style.setProperty('--special-room-accent', def.color);
  kicker.textContent = def.shortName;
  title.textContent = def.name.toUpperCase();
  subtitle.textContent = def.subtitle;
  const trophyChip = Number(Neo.player.bountyTrophies || 0) > 0 ? `<span>TROPHIES <b>${Math.floor(Neo.player.bountyTrophies)}</b></span>` : '';
  const huntChip = Neo.player.activeBounty ? `<span>HUNT <b>${escapeHtml(Neo.player.activeBounty.targetName || 'ACTIVE')}</b></span>` : '';
  resources.innerHTML = `<span>HP <b>${Math.ceil(Neo.player.hp)}/${Math.ceil(Neo.player.maxHp)}</b></span><span>COINS <b>${Math.floor(Neo.player.coins)}</b></span>${trophyChip}${huntChip}`;
  if (room.serviceUsed) {
    list.innerHTML = `<div class="special-room-result"><span>CHOICE SEALED</span><strong>${escapeHtml(room.serviceResult || 'This room has already been used.')}</strong></div>`;
    return;
  }
  const choices = getChoices(room);
  list.innerHTML = choices.map(choice => {
    const disabled = !choice.enabled;
    const reason = disabled && choice.disabledReason ? `<small>${escapeHtml(choice.disabledReason)}</small>` : '';
    const iconKey = SPECIAL_CHOICE_ICON_KEYS[`${room.type}:${choice.id}`] || 'item';
    const iconCanvas = choice.enemyType
      ? `<canvas class="shop-card__icon special-room-card__icon special-room-card__icon--enemy" data-special-enemy-icon="${escapeHtml(choice.enemyType)}" width="56" height="56" aria-hidden="true"></canvas>`
      : `<canvas class="shop-card__icon special-room-card__icon" data-inv-ui-icon="${escapeHtml(iconKey)}" width="48" height="48" aria-hidden="true"></canvas>`;
    return `<article class="special-room-card${choice.enemyType ? ' special-room-card--bounty-target' : ''}${disabled ? ' is-disabled' : ''}" style="--card-accent:${escapeHtml(def.color)}">
      <div class="special-room-card__top">
        <span class="shop-card__icon-frame special-room-card__icon-frame">
          ${iconCanvas}
        </span>
        <div class="special-room-card__heading">
          ${choice.enemyType ? `<span class="special-room-card__eyebrow">${escapeHtml(choice.contractLabel || 'Elite Target')}</span>` : ''}
          <h4>${escapeHtml(choice.title)}</h4>
        </div>
        <span class="special-room-card__cost">${escapeHtml(choice.cost)}</span>
      </div>
      <p>${escapeHtml(choice.description)}</p>
      ${reason}
      <button class="shop-buy special-room-choose" type="button" data-special-choice="${escapeHtml(choice.id)}" ${disabled ? 'disabled' : ''}>CHOOSE</button>
    </article>`;
  }).join('') || '<div class="special-room-result"><strong>No choice is currently available.</strong></div>';
  list.querySelectorAll('[data-inv-ui-icon]').forEach(canvas => {
    Neo.drawInventoryUiIcon?.(canvas, canvas.dataset.invUiIcon);
  });
  list.querySelectorAll('[data-special-enemy-icon]').forEach(canvas => {
    Neo.drawSpriteToCanvas?.(canvas, canvas.dataset.specialEnemyIcon, 52);
  });
}

export function setSpecialRoomPanelOpen(open) {
  const panel = document.getElementById('specialRoomPanel');
  if (!panel) return;
  const shouldOpen = !!open && isSpecialRoom();
  if (!shouldOpen) {
    const active = document.activeElement;
    if (active && panel.contains(active)) active.blur();
  }
  panel.classList.toggle('hidden', !shouldOpen);
  panel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  if (shouldOpen) {
    Neo.setShopPanelOpen?.(false, { animateClose: false });
    Neo.setAnvilPanelOpen?.(false, { animateClose: false });
    Neo.setInventoryPanelOpen?.(false, { animateClose: false, suppressPanelItemSelection: true });
    renderSpecialRoomPanel();
  } else {
    Neo.requestPanelItemSelection?.({ suppressBatteryOpen: true });
  }
}

export function toggleSpecialRoomPanel() {
  if (!isSpecialRoom()) return;
  const panel = document.getElementById('specialRoomPanel');
  setSpecialRoomPanelOpen(panel?.classList.contains('hidden'));
}

function handleChoiceClick(event) {
  const button = event.target instanceof Element ? event.target.closest('[data-special-choice]') : null;
  if (!button || !isSpecialRoom() || Neo.currentRoom.serviceUsed) return;
  const choice = getChoices(Neo.currentRoom).find(entry => entry.id === button.dataset.specialChoice);
  if (!choice?.enabled) return;
  const applied = choice.apply();
  if (applied && isSpecialRoom() && !document.getElementById('specialRoomPanel')?.classList.contains('hidden')) renderSpecialRoomPanel();
}

function completeBounty(bounty, result) {
  const kind = bounty.kind;
  const room = Neo.currentRoom || (Neo.rooms || [])[0];
  const rewardMultiplier = Math.max(1, Number(bounty.rewardMultiplier || 1));
  const trophyCount = Math.max(1, 1 + Math.floor(Number(bounty.escapes || 0)));
  if (kind === 'elite_hunter') Neo.addCoins?.(Math.round(90 * rewardMultiplier));
  else if (kind === 'elite_charger') {
    grantForgeVouchers(Math.max(1, Math.floor(rewardMultiplier)));
    Neo.grantXp?.(Math.round((35 + Number(Neo.floor || 1) * 5) * rewardMultiplier));
  } else if (kind === 'elite_sniper') {
    if (!Neo.isChallengeActive?.('no_items')) grantRelic(room, `bounty:${bounty.acceptedDepth}`, { elite: true });
    if (bounty.escapes > 0) Neo.addCoins?.(Math.round(60 * rewardMultiplier));
    if (Neo.isChallengeActive?.('no_items')) Neo.addCoins?.(Math.round(140 * rewardMultiplier));
  }
  Neo.player.bountyTrophies = Math.max(0, Number(Neo.player.bountyTrophies || 0)) + trophyCount;
  const def = BOUNTY_DEFS[kind] || {};
  pushBountyToast(bounty, {
    label: 'Bounty Complete',
    text: `${bounty.targetName || def.title || 'Elite'} resolved — ${trophyCount} hunt troph${trophyCount === 1 ? 'y' : 'ies'}`,
    accent: '#78ef9c',
    holdMs: 4000,
  });
  Neo.player.lastBountyStatus = `COMPLETE: ${def.title || 'Bounty'}`;
  Neo.player.activeBounty = null;
  Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 42, life: 1.4, text: result || 'BOUNTY COMPLETE', c: '#ffb070' });
  Neo.playSfx?.('item_collect');
  Neo.scheduleRunSave?.();
  Neo.updateObjective?.();
}

function failBounty(bounty, reason = 'Target escaped when you left the floor') {
  const def = BOUNTY_DEFS[bounty?.kind] || {};
  pushBountyToast(bounty, {
    label: 'Bounty Failed',
    text: `${bounty.targetName || def.title || 'Elite target'}: ${reason}`,
    accent: '#ff7185',
    holdMs: 4200,
  });
  Neo.player.lastBountyStatus = `FAILED: ${bounty.targetName || def.title || 'Bounty'}`;
  Neo.player.activeBounty = null;
  Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 34, life: 1, text: 'BOUNTY FAILED', c: '#ff7185' });
  Neo.scheduleRunSave?.();
  Neo.updateObjective?.();
}

function spawnAcceptedBountyTarget(bounty, room) {
  if (!bounty || bounty.targetSpawned || !room || room.type !== 'combat' || room.cleared) return false;
  const depth = Math.max(1, Number(Neo.floorsEntered || Neo.floor || 1));
  if (Number(bounty.returnDepth || 0) > depth) return false;
  const def = BOUNTY_DEFS[bounty.kind];
  if (!def) return false;
  const existing = (Neo.enemies || []).find(enemy => enemy?.bountyTargetId === bounty.targetId && !enemy.dead);
  if (existing) {
    bounty.targetSpawned = true;
    bounty.targetRoomKey = roomKey(room);
    return true;
  }
  const random = Neo.createRoomRandom?.(room, `bounty-target:${bounty.targetId}`) || Neo.rng;
  const angle = random() * Math.PI * 2;
  const radius = 180 + random() * 90;
  const preferredX = Neo.clamp(Neo.ROOM_W / 2 + Math.cos(angle) * radius, 90, Neo.ROOM_W - 90);
  const preferredY = Neo.clamp(Neo.ROOM_H / 2 + Math.sin(angle) * radius, 90, Neo.ROOM_H - 90);
  const safeSpawn = Neo.findSafeEnemySpawnPoint?.(preferredX, preferredY, 18)
    || Neo.findSafeEnemySpawnPoint?.(Neo.ROOM_W / 2, Neo.ROOM_H / 2 - 90, 18);
  if (!safeSpawn) return false;
  const enemy = Neo.spawnEnemy?.(def.enemyType, safeSpawn.x, safeSpawn.y, true, { forceElite: true });
  if (!enemy) return false;
  enemy.bountyTarget = true;
  enemy.bountyTargetId = bounty.targetId;
  enemy.bountyContractKind = bounty.kind;
  enemy.bountyName = bounty.targetName || def.title;
  enemy.bountyEpithet = bounty.epithet || '';
  enemy.bountyWeakness = bounty.weakness || 'bleed';
  enemy.bountyContractType = bounty.contractType || def.contractType;
  enemy.bountyEscapes = Math.max(0, Number(bounty.escapes || 0));
  const escalation = 1 + enemy.bountyEscapes * 0.35;
  enemy.max = Math.max(1, Math.round(Number(enemy.max || enemy.hp || 1) * escalation));
  enemy.hp = enemy.max;
  enemy.dmg = Math.max(1, Math.round(Number(enemy.dmg || 1) * (1 + enemy.bountyEscapes * 0.22)));
  bounty.targetSpawned = true;
  bounty.targetRoomKey = roomKey(room);
  room.bountyTargetId = bounty.targetId;
  Neo.spawnParticle?.({ x: enemy.x, y: enemy.y - enemy.r - 34, life: 1.5, text: 'BOUNTY TARGET', c: '#ffb070' });
  pushBountyToast(bounty, {
    label: 'Target Entered',
    text: `${enemy.bountyName} ${enemy.bountyEpithet} joined this combat`,
    accent: '#ffb070',
  });
  Neo.scheduleRunSave?.();
  Neo.updateObjective?.();
  return true;
}

function removeLivingBountyTarget(enemy) {
  const index = Neo.enemies.indexOf(enemy);
  if (index >= 0) Neo.enemies.splice(index, 1);
  enemy.dead = true;
  enemy.hp = Math.max(1, Number(enemy.hp || 1));
  Neo.minimapLegendDirty = true;
  if (Neo.currentRoom) {
    Neo.currentRoom.enemies = Neo.enemies;
    if (!Neo.enemies.some(other => other && !other.dead && other.type !== 'rival')) Neo.currentRoom.cleared = true;
  }
  Neo.syncCurrentRoomState?.();
  Neo.updateObjective?.();
}

function escapeBountyTarget(enemy) {
  const bounty = Neo.player?.activeBounty;
  if (!bounty || enemy?.bountyTargetId !== bounty.targetId) return false;
  const depth = Math.max(1, Number(Neo.floorsEntered || Neo.floor || 1));
  bounty.escapes = Math.max(0, Number(bounty.escapes || 0)) + 1;
  bounty.rewardMultiplier = 1 + bounty.escapes * 0.5;
  bounty.targetSpawned = false;
  bounty.targetRoomKey = '';
  bounty.returnDepth = depth + 1;
  bounty.acceptedDepth = depth + 1;
  bounty.rivalPressure = 0;
  bounty.rivalPressureStage = 0;
  removeLivingBountyTarget(enemy);
  Neo.spawnParticle?.({ x: enemy.x, y: enemy.y, life: 1.2, text: 'TARGET ESCAPED', c: '#b58cff' });
  pushBountyToast(bounty, {
    label: 'Target Escaped',
    text: `${bounty.targetName || 'The target'} returns stronger next floor — payout ×${bounty.rewardMultiplier.toFixed(1)}`,
    accent: '#b58cff',
    holdMs: 4200,
  });
  Neo.scheduleRunSave?.();
  return true;
}

export function updateBountyTarget(enemy, dt = 0.016) {
  const bounty = Neo.player?.activeBounty;
  if (!bounty || !enemy?.bountyTarget || enemy.bountyTargetId !== bounty.targetId || enemy.dead) return false;
  const hpRatio = Number(enemy.hp || 0) / Math.max(1, Number(enemy.max || 1));
  const contractType = bounty.contractType || enemy.bountyContractType || 'execution';
  if (contractType === 'capture' && hpRatio <= 0.22 && !enemy.bountyCaptureReady) {
    enemy.bountyCaptureReady = true;
    enemy.bountyEscapeTimer = Math.max(Number(enemy.bountyEscapeTimer || 0), 6);
    pushBountyToast(bounty, { label: 'Capture Ready', text: `Interact near ${bounty.targetName} before the escape`, accent: '#83f0b0' });
  }
  if (contractType === 'theft' && hpRatio <= 0.45 && !enemy.bountyTheftReady) {
    enemy.bountyTheftReady = true;
    enemy.bountyEscapeTimer = Math.max(Number(enemy.bountyEscapeTimer || 0), 5.5);
    pushBountyToast(bounty, { label: 'Relic Exposed', text: `Interact near ${bounty.targetName} to steal it`, accent: '#ffd86b' });
  }
  const escapeThreshold = contractType === 'theft' ? 0.45 : contractType === 'capture' ? 0.22 : 0.18;
  if (hpRatio <= escapeThreshold && !Number.isFinite(Number(enemy.bountyEscapeTimer))) enemy.bountyEscapeTimer = 5;
  if (hpRatio <= escapeThreshold && Number(enemy.bountyEscapeTimer || 0) <= 0) enemy.bountyEscapeTimer = 5;
  if (Number(enemy.bountyEscapeTimer || 0) > 0) {
    if (enemy.bountyCaptureReady || Number(enemy.stun || 0) <= 0) enemy.bountyEscapeTimer = Math.max(0, enemy.bountyEscapeTimer - Math.max(0, Number(dt || 0)));
    if (enemy.bountyEscapeTimer <= 0) return escapeBountyTarget(enemy);
  }

  // Rivals create visible pressure without simulating an opaque off-screen duel:
  // every 35 seconds they land one strike, accelerating the player's decision.
  bounty.rivalPressure = Math.max(0, Number(bounty.rivalPressure || 0)) + Math.max(0, Number(dt || 0));
  const pressureStage = Math.floor(bounty.rivalPressure / 35);
  if (pressureStage > Math.max(0, Number(bounty.rivalPressureStage || 0))) {
    bounty.rivalPressureStage = pressureStage;
    if (pressureStage >= 3) {
      removeLivingBountyTarget(enemy);
      failBounty(bounty, 'A rival hunter claimed the target first');
      return true;
    }
    enemy.hp = Math.max(1, Number(enemy.hp || 1) - Math.max(1, Math.round(Number(enemy.max || 1) * 0.1)));
    pushBountyToast(bounty, { label: 'Rival Strike', text: `Another hunter wounded ${bounty.targetName}`, accent: '#ff8a6a' });
  }

  if (enemy.bountyCaptureReady) {
    enemy.stun = Math.max(Number(enemy.stun || 0), 0.2);
    enemy.vx *= 0.75;
    enemy.vy *= 0.75;
    return true;
  }
  return false;
}

export function handleBountyTargetLethal(enemy) {
  const bounty = Neo.player?.activeBounty;
  if (!bounty || !enemy?.bountyTarget || enemy.bountyTargetId !== bounty.targetId) return false;
  if (bounty.contractType !== 'capture') return false;
  enemy.hp = Math.max(1, Math.round(Number(enemy.max || 1) * 0.08));
  enemy.bountyCaptureReady = true;
  enemy.bountyEscapeTimer = Math.max(Number(enemy.bountyEscapeTimer || 0), 6);
  enemy.stun = Math.max(Number(enemy.stun || 0), 0.4);
  pushBountyToast(bounty, { label: 'Capture Ready', text: `Interact near ${bounty.targetName} now`, accent: '#83f0b0' });
  return true;
}

export function tryBountyTargetInteract() {
  const bounty = Neo.player?.activeBounty;
  if (!bounty || !Neo.player) return false;
  const enemy = (Neo.enemies || []).find(candidate => candidate?.bountyTargetId === bounty.targetId && !candidate.dead);
  if (!enemy || Neo.dist(Neo.player.x, Neo.player.y, enemy.x, enemy.y) > 82) return false;
  if (bounty.contractType === 'capture' && enemy.bountyCaptureReady) {
    removeLivingBountyTarget(enemy);
    completeBounty(bounty, 'TARGET CAPTURED');
    return true;
  }
  if (bounty.contractType === 'theft' && enemy.bountyTheftReady) {
    removeLivingBountyTarget(enemy);
    completeBounty(bounty, 'RELIC STOLEN');
    return true;
  }
  return false;
}

export function getBountyTargetInteractLabel() {
  const bounty = Neo.player?.activeBounty;
  if (!bounty || !Neo.player) return '';
  const enemy = (Neo.enemies || []).find(candidate => candidate?.bountyTargetId === bounty.targetId && !candidate.dead);
  if (!enemy || Neo.dist(Neo.player.x, Neo.player.y, enemy.x, enemy.y) > 110) return '';
  if (bounty.contractType === 'capture' && enemy.bountyCaptureReady) return `Capture ${bounty.targetName || 'target'}`;
  if (bounty.contractType === 'theft' && enemy.bountyTheftReady) return `Steal relic from ${bounty.targetName || 'target'}`;
  return '';
}

export function notifyBountyEnemyKilled(enemy) {
  const bounty = Neo.player?.activeBounty;
  if (!bounty || !enemy?.bountyTargetId || enemy.bountyTargetId !== bounty.targetId) return false;
  if (bounty.contractType === 'execution') completeBounty(bounty, 'ELITE BOUNTY COMPLETE');
  else failBounty(bounty, bounty.contractType === 'capture' ? 'Target was killed instead of captured' : 'Target was killed before its relic was stolen');
  return true;
}

export function updateSpecialRoomProgress() {
  const bounty = Neo.player?.activeBounty;
  if (!bounty || !BOUNTY_DEFS[bounty.kind]) return;
  const depth = Math.max(1, Number(Neo.floorsEntered || Neo.floor || 1));
  if (depth > Number(bounty.acceptedDepth || depth)) {
    failBounty(bounty);
    return;
  }
  const current = Neo.currentRoom;
  if (!current || current.type !== 'combat') return;
  spawnAcceptedBountyTarget(bounty, current);
}

export function getActiveBountyObjective() {
  const bounty = Neo.player?.activeBounty;
  const def = BOUNTY_DEFS[bounty?.kind];
  if (!bounty || !def) return '';
  const depth = Math.max(1, Number(Neo.floorsEntered || Neo.floor || 1));
  if (Number(bounty.returnDepth || 0) > depth) return `Hunt: ${bounty.targetName} escaped and returns next floor`;
  const target = (Neo.enemies || []).find(enemy => enemy?.bountyTargetId === bounty.targetId && !enemy.dead);
  if (target?.bountyCaptureReady) return `Hunt: interact to capture ${bounty.targetName} (${Math.ceil(target.bountyEscapeTimer || 0)}s)`;
  if (target?.bountyTheftReady) return `Hunt: steal ${bounty.targetName}'s relic (${Math.ceil(target.bountyEscapeTimer || 0)}s)`;
  if (bounty.targetSpawned) return `Hunt: ${String(bounty.contractType || 'execution').toUpperCase()} ${bounty.targetName || def.title}`;
  return `Hunt: ${bounty.targetName || def.title} enters the next combat`;
}

function bindSpecialRoomUi() {
  document.getElementById('specialRoomClose')?.addEventListener('click', () => setSpecialRoomPanelOpen(false));
  document.getElementById('specialRoomChoices')?.addEventListener('click', handleChoiceClick);
}

bindSpecialRoomUi();

Neo.SPECIAL_ROOM_DEFS = SPECIAL_ROOM_DEFS;
Neo.SPECIAL_ROOM_ORDER = SPECIAL_ROOM_ORDER;
Neo.SPECIAL_ROOM_TYPES = SPECIAL_ROOM_TYPES;
Neo.isSpecialRoom = isSpecialRoom;
Neo.assignSpecialServiceRoom = assignSpecialServiceRoom;
Neo.prepareSpecialRoom = prepareSpecialRoom;
Neo.renderSpecialRoomPanel = renderSpecialRoomPanel;
Neo.setSpecialRoomPanelOpen = setSpecialRoomPanelOpen;
Neo.toggleSpecialRoomPanel = toggleSpecialRoomPanel;
Neo.getSpecialRoomChoiceView = getSpecialRoomChoiceView;
Neo.getNearestSpecialRoomChoice = getNearestSpecialRoomChoice;
Neo.getSpecialRoomChoiceInteractLabel = getSpecialRoomChoiceInteractLabel;
Neo.trySpecialRoomChoiceInteract = trySpecialRoomChoiceInteract;
Neo.updateSpecialRoomProgress = updateSpecialRoomProgress;
Neo.updateBountyTarget = updateBountyTarget;
Neo.handleBountyTargetLethal = handleBountyTargetLethal;
Neo.tryBountyTargetInteract = tryBountyTargetInteract;
Neo.getBountyTargetInteractLabel = getBountyTargetInteractLabel;
Neo.notifyBountyEnemyKilled = notifyBountyEnemyKilled;
Neo.getActiveBountyObjective = getActiveBountyObjective;
