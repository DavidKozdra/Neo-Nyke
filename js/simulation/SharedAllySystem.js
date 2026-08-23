(function initializeSharedAllySystem(root, factory) {
  const moveApi = typeof require === 'function'
    ? require('./SharedMoveContent.js')
    : (root.NeoNyke?.content || {});
  const api = factory(moveApi);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.content = namespace.content || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.content, {
    ALLY_ARCHETYPES: api.ALLY_ARCHETYPES,
    ALLY_SHOP_CHANCE: api.ALLY_SHOP_CHANCE,
    ALLY_RECRUIT_CAP: api.ALLY_RECRUIT_CAP,
  });
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedAllySystemApi(moveApi) {
  'use strict';

  // Kept deliberately high while the feature is being tuned. This is a single
  // roll when a stock event is created, never when the panel is reopened.
  const ALLY_SHOP_CHANCE = 0.70;
  const ALLY_RECRUIT_CAP = 3;
  const ITEM_ALLY_RESPAWN_SECONDS = 15;
  const BUG_CARD_GUARANTEED_ALLY_COUNT = 3;
  const ALLY_TICK_RATE = 20;

  const ALLY_ARCHETYPES = Object.freeze({
    guardian: Object.freeze({
      key: 'guardian', label: 'Guardian', hpRatio: 1.10, basicDamageRatio: 0.35,
      speed: 150, attackRange: 52, attackInterval: 0.78, behavior: 'guard', attack: 'melee',
      movePool: Object.freeze(['wall_of_toph', 'shield_guard', 'princess_shield']),
      tags: Object.freeze(['role:guardian', 'attack:melee', 'behavior:guard', 'trait:taunt']),
    }),
    brawler: Object.freeze({
      key: 'brawler', label: 'Brawler', hpRatio: 0.80, basicDamageRatio: 0.55,
      speed: 188, attackRange: 58, attackInterval: 0.58, behavior: 'rush', attack: 'melee',
      movePool: Object.freeze(['crimson_smash', 'kicky_kick', 'knight_slash_dash']),
      tags: Object.freeze(['role:brawler', 'attack:melee', 'behavior:rush']),
    }),
    ranger: Object.freeze({
      key: 'ranger', label: 'Ranger', hpRatio: 0.65, basicDamageRatio: 0.42,
      speed: 172, attackRange: 390, attackInterval: 0.72, behavior: 'kite', attack: 'ranged',
      movePool: Object.freeze(['turtle_wave', 'power_disks', 'nail_shot', 'hammer_throw']),
      tags: Object.freeze(['role:ranger', 'attack:ranged', 'behavior:kite']),
    }),
    mystic: Object.freeze({
      key: 'mystic', label: 'Mystic', hpRatio: 0.70, basicDamageRatio: 0.34,
      speed: 158, attackRange: 335, attackInterval: 0.86, behavior: 'support', attack: 'ranged',
      movePool: Object.freeze(['chaos_burst', 'lightning_columns', 'fire_circle', 'healing_zone']),
      tags: Object.freeze(['role:mystic', 'attack:ranged', 'behavior:support']),
    }),
    scout: Object.freeze({
      key: 'scout', label: 'Scout', hpRatio: 0.60, basicDamageRatio: 0.40,
      speed: 225, attackRange: 240, attackInterval: 0.62, behavior: 'flank', attack: 'ranged',
      movePool: Object.freeze(['warp', 'zip_lightning', 'dash', 'random_pounce']),
      tags: Object.freeze(['role:scout', 'attack:ranged', 'behavior:flank']),
    }),
  });

  const NAME_PREFIXES = Object.freeze([
    'Star', 'Storm', 'Moon', 'Sun', 'Iron', 'Void', 'Sea', 'Sky', 'Bug', 'Dino',
    'Fire', 'Frost', 'Thunder', 'Shadow', 'Gold', 'Neon', 'Rune', 'Crystal', 'Wild', 'Royal',
  ]);
  const NAME_CORES = Object.freeze([
    'man', 'king', 'guard', 'fang', 'heart', 'paw', 'blade', 'knight', 'eye', 'horn',
    'fin', 'claw', 'wing', 'walker', 'mage', 'runner', 'smith', 'warden', 'spark', 'beast',
  ]);
  const NAME_SUFFIXES = Object.freeze([
    'X', 'Prime', 'Jr.', 'the Bold', 'the Weird', 'the Great', 'XYZ', '777',
    'Max', 'Zero', 'Nova', 'Two', 'Ultra', 'the Small', 'the Loud', 'the Last',
    'Blue', 'Red', 'Green', 'Omega',
  ]);
  const ALLY_PALETTES = Object.freeze([
    Object.freeze(['#70e1ff', '#2458aa', '#e9fbff']),
    Object.freeze(['#ff708d', '#8e2444', '#fff0f3']),
    Object.freeze(['#8dff9f', '#267b4f', '#effff1']),
    Object.freeze(['#ffc65c', '#9a5c20', '#fff4d5']),
    Object.freeze(['#c29aff', '#603f9b', '#f5edff']),
    Object.freeze(['#ff995c', '#9e3526', '#fff0e7']),
    Object.freeze(['#80e8d3', '#236f70', '#e9fffb']),
    Object.freeze(['#e4e7ef', '#596275', '#ffffff']),
  ]);

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function integer(value, fallback = 0) {
    return Math.max(0, Math.floor(number(value, fallback)));
  }

  function nextRandom(random) {
    if (typeof random === 'function') return Math.max(0, Math.min(0.999999999, number(random(), 0)));
    if (typeof random?.next === 'function') return Math.max(0, Math.min(0.999999999, number(random.next(), 0)));
    // Shared simulation must never depend on ambient entropy. Callers that
    // stock campaign content provide the run RNG; direct/content-only callers
    // get a stable midpoint fallback.
    return 0.5;
  }

  function seedRandom(seed) {
    let value = (integer(seed, 1) || 1) >>> 0;
    return function randomFromSeed() {
      value += 0x6D2B79F5;
      let mixed = value;
      mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
      return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
    };
  }

  function choose(values, random) {
    return values[Math.floor(nextRandom(random) * values.length)] || values[0];
  }

  function titleCaseFragment(value) {
    const text = String(value || '').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  function generateAllyName(seed, existingNames = []) {
    const used = new Set((existingNames || []).map(name => String(name || '').trim().toLowerCase()).filter(Boolean));
    const random = seedRandom(seed);
    let candidate = 'Starman';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const prefix = choose(NAME_PREFIXES, random);
      const core = choose(NAME_CORES, random);
      const grammar = Math.floor(random() * 3);
      if (grammar === 0) candidate = `${prefix}${core}`;
      else if (grammar === 1) candidate = `${prefix} ${titleCaseFragment(core)}`;
      else candidate = `${prefix} ${titleCaseFragment(core)} ${choose(NAME_SUFFIXES, random)}`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
    const numerals = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
    return `${candidate} ${numerals[integer(seed) % numerals.length]}`;
  }

  function generateAllyAppearance(seed, archetypeKey = 'ranger') {
    const random = seedRandom((integer(seed, 1) ^ 0xA11E5) >>> 0);
    return {
      body: Math.floor(random() * 5),
      head: Math.floor(random() * 7),
      eyes: Math.floor(random() * 6),
      accessory: Math.floor(random() * 9),
      emblem: Object.keys(ALLY_ARCHETYPES).indexOf(archetypeKey),
      palette: Math.floor(random() * ALLY_PALETTES.length),
    };
  }

  function normalizeTags(tags = []) {
    return [...new Set((Array.isArray(tags) ? tags : []).map(tag => String(tag || '').trim().toLowerCase()).filter(Boolean))].sort();
  }

  function allySourceTags(source = {}) {
    const kind = ['shop', 'item', 'rival', 'move'].includes(source.kind) ? source.kind : 'shop';
    const tags = [`source:${kind}`];
    if (kind === 'item') tags.push('trait:respawning');
    if (kind === 'move') tags.push('trait:temporary');
    return tags;
  }

  function generateAllyOffer(options = {}) {
    const random = options.random;
    const seed = Math.max(1, Math.floor(nextRandom(random) * 0x7fffffff));
    const local = seedRandom(seed);
    const archetypeKey = choose(Object.keys(ALLY_ARCHETYPES), local);
    const archetype = ALLY_ARCHETYPES[archetypeKey];
    const nativeMoveKey = choose(archetype.movePool, local);
    const name = generateAllyName(seed, options.existingNames);
    return {
      id: String(options.id || `ally-offer:${seed.toString(36)}`),
      seed,
      name,
      archetypeKey,
      nativeMoveKey,
      appearance: generateAllyAppearance(seed, archetypeKey),
      tags: normalizeTags([...archetype.tags, 'source:shop']),
      bought: false,
      cost: Math.max(0, integer(options.cost)),
    };
  }

  function getAllyCollection(state) {
    if (!state || typeof state !== 'object') return {};
    if (!state.allies || typeof state.allies !== 'object' || Array.isArray(state.allies)) state.allies = {};
    return state.allies;
  }

  function getPlayerRecruitIds(player) {
    if (!player || typeof player !== 'object') return [];
    if (!Array.isArray(player.recruitedAllyIds)) player.recruitedAllyIds = [];
    player.recruitedAllyIds = [...new Set(player.recruitedAllyIds.map(String).filter(Boolean))];
    return player.recruitedAllyIds;
  }

  function countActiveRecruits(state, player) {
    const allies = getAllyCollection(state);
    return getPlayerRecruitIds(player).filter(id => allies[id]?.status !== 'dead').length;
  }

  function allocateAllyId(state, prefix = 'ally') {
    if (typeof state?.allocateEntityId === 'function') return state.allocateEntityId(prefix);
    const next = Math.max(1, integer(state?.nextEntityId, 1));
    if (state) state.nextEntityId = next + 1;
    return `${prefix}-${next}`;
  }

  function ownerMaxHealth(owner) {
    return Math.max(1, number(owner?.maxHp ?? owner?.maxHealth ?? owner?.max, 100));
  }

  function ownerBaseDamage(owner) {
    return Math.max(1, number(owner?.baseDamage ?? owner?.damage ?? owner?.dmg ?? owner?.itemStats?.damage, 24));
  }

  function resolveAllyStats(ally, owner) {
    const archetype = ALLY_ARCHETYPES[ally?.archetypeKey] || ALLY_ARCHETYPES.ranger;
    const maxHealth = Math.max(35, Math.round(ownerMaxHealth(owner) * archetype.hpRatio));
    const basicDamage = Math.max(4, Math.round(ownerBaseDamage(owner) * archetype.basicDamageRatio));
    return {
      maxHealth,
      basicDamage,
      speed: archetype.speed,
      attackRange: archetype.attackRange,
      attackInterval: archetype.attackInterval,
      critChance: Math.max(0, number(owner?.itemStats?.critChance ?? owner?.critChance, 0) * 0.5),
      bleedChance: Math.max(0, number(owner?.itemStats?.bleedChance ?? owner?.bleedChance, 0) * 0.5),
    };
  }

  function normalizeAllyRecord(source = {}, owner = null) {
    const sourceKind = ['shop', 'item', 'rival', 'move'].includes(source.source?.kind)
      ? source.source.kind
      : ['shop', 'item', 'rival', 'move'].includes(source.sourceKind) ? source.sourceKind : 'shop';
    const archetypeKey = ALLY_ARCHETYPES[source.archetypeKey] ? source.archetypeKey : 'ranger';
    const seed = Math.max(1, integer(source.seed, 1));
    const record = {
      id: String(source.id || `ally:${seed.toString(36)}`),
      seed,
      name: String(source.name || generateAllyName(seed)),
      ownerId: String(source.ownerId || owner?.id || ''),
      teamId: String(source.teamId || owner?.teamId || 'players'),
      roomId: String(source.roomId || owner?.roomId || ''),
      source: {
        kind: sourceKind,
        key: String(source.source?.key || source.sourceKey || ''),
      },
      archetypeKey,
      nativeMoveKey: String(source.nativeMoveKey || ''),
      spriteKey: String(source.spriteKey || ''),
      allyIndex: integer(source.allyIndex),
      fireBug: !!source.fireBug,
      transferredMove: source.transferredMove?.key ? {
        key: String(source.transferredMove.key),
        ownerId: String(source.transferredMove.ownerId || source.ownerId || owner?.id || ''),
      } : null,
      appearance: source.appearance && typeof source.appearance === 'object'
        ? { ...source.appearance }
        : generateAllyAppearance(seed, archetypeKey),
      tags: normalizeTags([
        ...(ALLY_ARCHETYPES[archetypeKey]?.tags || []),
        ...allySourceTags({ kind: sourceKind }),
        ...(source.tags || []),
      ]),
      x: number(source.x, number(owner?.x, 0)),
      y: number(source.y, number(owner?.y, 0)),
      vx: number(source.vx),
      vy: number(source.vy),
      radius: Math.max(8, number(source.radius ?? source.r, 13)),
      status: ['active', 'respawning', 'dead'].includes(source.status) ? source.status : 'active',
      respawnRemaining: Math.max(0, number(source.respawnRemaining)),
      expiresRemaining: sourceKind === 'move' ? Math.max(0, number(source.expiresRemaining ?? source.duration, 0)) : 0,
      attackCooldown: Math.max(0, number(source.attackCooldown)),
      moveCooldowns: { ...(source.moveCooldowns || {}) },
      giftedMoveCharges: Math.max(0, integer(source.giftedMoveCharges)),
      temporary: sourceKind === 'move',
    };
    const stats = resolveAllyStats(record, owner);
    record.maxHealth = Math.max(1, number(source.maxHealth ?? source.maxHp ?? source.max, stats.maxHealth));
    record.health = Math.max(0, Math.min(record.maxHealth, number(source.health ?? source.hp, record.maxHealth)));
    record.basicDamage = Math.max(1, number(source.basicDamage, stats.basicDamage));
    record.speed = Math.max(1, number(source.speed, stats.speed));
    record.attackRange = Math.max(1, number(source.attackRange, stats.attackRange));
    record.attackInterval = Math.max(0.1, number(source.attackInterval, stats.attackInterval));
    record.critChance = Math.max(0, number(source.critChance, stats.critChance));
    record.bleedChance = Math.max(0, number(source.bleedChance, stats.bleedChance));
    if (record.status === 'active' && record.health <= 0) record.health = record.maxHealth;
    return record;
  }

  function recruitAlly(state, player, offer, options = {}) {
    if (!state || !player || !offer || offer.bought) return { ok: false, reason: 'INVALID_OFFER' };
    if (countActiveRecruits(state, player) >= ALLY_RECRUIT_CAP) return { ok: false, reason: 'ALLY_ROSTER_FULL' };
    const id = allocateAllyId(state, 'ally');
    const ally = normalizeAllyRecord({
      ...offer,
      id,
      ownerId: player.id,
      teamId: player.teamId || 'players',
      source: { kind: 'shop', key: offer.id || '' },
      x: number(options.x, number(player.x)),
      y: number(options.y, number(player.y)),
      status: 'active',
    }, player);
    getAllyCollection(state)[id] = ally;
    getPlayerRecruitIds(player).push(id);
    return { ok: true, ally };
  }

  function returnTransferredMove(ally, playersById, options = {}) {
    const attachment = ally?.transferredMove;
    if (!attachment?.key) return { ok: false, reason: 'NO_TRANSFERRED_MOVE' };
    const player = playersById?.[attachment.ownerId]
      || (playersById?.id === attachment.ownerId ? playersById : null)
      || options.player;
    if (!player) return { ok: false, reason: 'OWNER_NOT_FOUND' };
    player.ownedMoves = player.ownedMoves || {};
    player.ownedMoves[attachment.key] = true;
    ally.transferredMove = null;
    ally.giftedMoveCharges = 0;
    return { ok: true, moveKey: attachment.key, playerId: player.id };
  }

  function transferMoveToAlly(state, player, allyId, moveKey, content = moveApi) {
    const ally = getAllyCollection(state)[String(allyId || '')];
    const key = String(moveKey || '');
    if (!ally || ally.status === 'dead' || ally.ownerId !== String(player?.id || '')) return { ok: false, reason: 'ALLY_NOT_FOUND' };
    if (ally.source.kind !== 'shop') return { ok: false, reason: 'ALLY_CANNOT_RECEIVE_MOVE' };
    if (!key || !player?.ownedMoves?.[key] || !content?.MOVE_SLOT_BY_KEY?.[key]) return { ok: false, reason: 'MOVE_NOT_OWNED' };
    if (Object.values(player.equippedMoves || {}).includes(key)) return { ok: false, reason: 'MOVE_EQUIPPED' };
    let returnedMoveKey = '';
    if (ally.transferredMove?.key) {
      const returned = returnTransferredMove(ally, { [player.id]: player });
      if (!returned.ok) return returned;
      returnedMoveKey = returned.moveKey;
    }
    delete player.ownedMoves[key];
    ally.transferredMove = { key, ownerId: String(player.id) };
    ally.giftedMoveCharges = Math.max(1, integer(content.getMoveBaseCharges?.(key, player?.character), 1)
      + integer(player?.moveStackOverrides?.[key], 0));
    return { ok: true, allyId: ally.id, moveKey: key, returnedMoveKey };
  }

  function recallAllyMove(state, player, allyId) {
    const ally = getAllyCollection(state)[String(allyId || '')];
    if (!ally || ally.ownerId !== String(player?.id || '')) return { ok: false, reason: 'ALLY_NOT_FOUND' };
    return returnTransferredMove(ally, { [player.id]: player });
  }

  function removeRecruitId(player, allyId) {
    if (!Array.isArray(player?.recruitedAllyIds)) return;
    player.recruitedAllyIds = player.recruitedAllyIds.filter(id => String(id) !== String(allyId));
  }

  function damageAlly(state, allyId, damage, options = {}) {
    const ally = getAllyCollection(state)[String(allyId || '')];
    if (!ally || ally.status !== 'active' || number(damage) <= 0) return { ok: false, reason: 'INVALID_TARGET' };
    const dealt = Math.min(ally.health, Math.max(0, number(damage)));
    ally.health = Math.max(0, ally.health - dealt);
    if (ally.health > 0) return { ok: true, dealt, died: false, ally };
    if (ally.source.kind === 'item') {
      ally.status = 'respawning';
      ally.respawnRemaining = ITEM_ALLY_RESPAWN_SECONDS;
    } else {
      ally.status = 'dead';
      const owner = options.playersById?.[ally.ownerId] || options.owner;
      if (ally.transferredMove) returnTransferredMove(ally, options.playersById, { player: owner });
      if (ally.source.kind === 'shop') removeRecruitId(owner, ally.id);
    }
    return { ok: true, dealt, died: true, ally, respawning: ally.status === 'respawning' };
  }

  function healAlly(state, allyId, amount) {
    const ally = getAllyCollection(state)[String(allyId || '')];
    if (!ally || ally.status !== 'active' || number(amount) <= 0) return { ok: false, reason: 'INVALID_TARGET' };
    const healed = Math.min(ally.maxHealth - ally.health, Math.max(0, number(amount)));
    ally.health += healed;
    return { ok: true, healed, ally };
  }

  function dismissAlly(state, player, allyId) {
    const allies = getAllyCollection(state);
    const ally = allies[String(allyId || '')];
    if (!ally || ally.source.kind !== 'shop' || ally.ownerId !== String(player?.id || '')) return { ok: false, reason: 'ALLY_NOT_FOUND' };
    let returnedMoveKey = '';
    if (ally.transferredMove) returnedMoveKey = returnTransferredMove(ally, { [player.id]: player }).moveKey || '';
    removeRecruitId(player, ally.id);
    ally.status = 'dead';
    delete allies[ally.id];
    return { ok: true, allyId: ally.id, returnedMoveKey };
  }

  function scaleAllyWithOwner(ally, owner) {
    if (!ally || !owner || ally.status === 'dead') return ally;
    const previousMax = Math.max(1, number(ally.maxHealth, 1));
    const ratio = ally.status === 'active' ? ally.health / previousMax : 1;
    const stats = resolveAllyStats(ally, owner);
    ally.maxHealth = stats.maxHealth;
    ally.health = ally.status === 'active' ? Math.max(1, Math.min(ally.maxHealth, ally.maxHealth * ratio)) : 0;
    Object.assign(ally, stats);
    return ally;
  }

  function advanceAllies(state, deltaSeconds, playersById = state?.players || {}) {
    const events = [];
    const delta = Math.max(0, number(deltaSeconds));
    Object.values(getAllyCollection(state)).forEach(ally => {
      const owner = playersById?.[ally.ownerId];
      if (owner) scaleAllyWithOwner(ally, owner);
      ally.attackCooldown = Math.max(0, number(ally.attackCooldown) - delta);
      Object.keys(ally.moveCooldowns || {}).forEach(key => {
        ally.moveCooldowns[key] = Math.max(0, number(ally.moveCooldowns[key]) - delta);
      });
      if (ally.status === 'respawning') {
        ally.respawnRemaining = Math.max(0, number(ally.respawnRemaining) - delta);
        // Fixed-step totals can land a few quadrillionths above zero (for
        // example 15 - 14.95 - 0.05). Treat that as the elapsed boundary.
        if (ally.respawnRemaining <= 1e-9 && owner && !owner.downed) {
          ally.respawnRemaining = 0;
          ally.status = 'active';
          ally.health = ally.maxHealth;
          ally.x = number(owner.x);
          ally.y = number(owner.y);
          events.push({ type: 'ALLY_RESPAWNED', allyId: ally.id, playerId: ally.ownerId });
        }
      }
      if (ally.source.kind === 'move' && ally.status !== 'dead') {
        ally.expiresRemaining = Math.max(0, number(ally.expiresRemaining) - delta);
        if (ally.expiresRemaining <= 0) {
          ally.status = 'dead';
          events.push({ type: 'ALLY_EXPIRED', allyId: ally.id, playerId: ally.ownerId });
        }
      }
    });
    Object.entries(getAllyCollection(state)).forEach(([id, ally]) => {
      if (ally.status === 'dead' && ally.source.kind === 'move') delete state.allies[id];
    });
    return events;
  }

  function createSourcedAlly(state, owner, options = {}) {
    const id = String(options.id || allocateAllyId(state, 'ally'));
    const ally = normalizeAllyRecord({
      ...options,
      id,
      ownerId: owner?.id,
      teamId: owner?.teamId || 'players',
      source: { kind: options.sourceKind || options.source?.kind || 'item', key: options.sourceKey || options.source?.key || '' },
    }, owner);
    getAllyCollection(state)[id] = ally;
    return ally;
  }

  // Item summons are promises, not best-effort spawns. Reconcile by stable slot
  // index so losing the middle bug cannot make a length-based loop overwrite a
  // surviving slot forever. This also repairs dead/corrupt item records and
  // removes duplicates while safely returning any move attached to one.
  function reconcileGuaranteedItemAllies(state, owner, options = {}) {
    const allies = getAllyCollection(state);
    const ownerId = String(owner?.id || '');
    const sourceKey = String(options.sourceKey || '');
    const count = Math.max(0, integer(options.count, BUG_CARD_GUARANTEED_ALLY_COUNT));
    if (!ownerId || !sourceKey || count <= 0) return { allies: [], created: [], removed: [] };
    const idForIndex = typeof options.idForIndex === 'function'
      ? options.idForIndex
      : index => `item-ally-${sourceKey}-${ownerId}-${index}`;
    const optionsForIndex = typeof options.optionsForIndex === 'function'
      ? options.optionsForIndex
      : () => ({});
    const candidates = Object.entries(allies).filter(([, ally]) => (
      ally?.source?.kind === 'item'
      && ally.source.key === sourceKey
      && String(ally.ownerId || '') === ownerId
    ));
    const keptIds = new Set();
    const guaranteed = [];
    const created = [];

    for (let index = 0; index < count; index += 1) {
      const preferredId = String(idForIndex(index));
      let entry = candidates.find(([id]) => id === preferredId && !keptIds.has(id));
      if (!entry) entry = candidates.find(([id, ally]) => !keptIds.has(id) && integer(ally.allyIndex, -1) === index);
      let ally = entry?.[1] || null;
      if (!ally) {
        let id = preferredId;
        if (allies[id]) id = `${preferredId}:repair`;
        ally = createSourcedAlly(state, owner, {
          ...optionsForIndex(index),
          id,
          sourceKind: 'item',
          sourceKey,
          allyIndex: index,
        });
        created.push(ally);
      }
      ally.ownerId = ownerId;
      ally.teamId = String(owner.teamId || ally.teamId || 'players');
      ally.roomId = String(owner.roomId || ally.roomId || '');
      ally.source = { kind: 'item', key: sourceKey };
      ally.allyIndex = index;
      ally.tags = normalizeTags([...(ally.tags || []), 'source:item', 'trait:respawning']);
      if (ally.status === 'dead' || (ally.status === 'active' && number(ally.health) <= 0)) {
        ally.status = 'respawning';
        ally.health = 0;
        ally.respawnRemaining = number(ally.respawnRemaining) > 0
          ? number(ally.respawnRemaining)
          : ITEM_ALLY_RESPAWN_SECONDS;
      }
      keptIds.add(ally.id);
      guaranteed.push(ally);
    }

    const removed = [];
    candidates.forEach(([id, ally]) => {
      if (keptIds.has(id)) return;
      if (ally.transferredMove) returnTransferredMove(ally, state?.players, { player: owner });
      removeRecruitId(owner, id);
      delete allies[id];
      removed.push(id);
    });
    return { allies: guaranteed, created, removed };
  }

  return {
    ALLY_SHOP_CHANCE,
    ALLY_RECRUIT_CAP,
    ITEM_ALLY_RESPAWN_SECONDS,
    BUG_CARD_GUARANTEED_ALLY_COUNT,
    ALLY_TICK_RATE,
    ALLY_ARCHETYPES,
    ALLY_PALETTES,
    NAME_PREFIXES,
    NAME_CORES,
    NAME_SUFFIXES,
    normalizeTags,
    generateAllyName,
    generateAllyAppearance,
    generateAllyOffer,
    normalizeAllyRecord,
    resolveAllyStats,
    getAllyCollection,
    getPlayerRecruitIds,
    countActiveRecruits,
    recruitAlly,
    transferMoveToAlly,
    recallAllyMove,
    returnTransferredMove,
    damageAlly,
    healAlly,
    dismissAlly,
    scaleAllyWithOwner,
    advanceAllies,
    createSourcedAlly,
    reconcileGuaranteedItemAllies,
  };
});
