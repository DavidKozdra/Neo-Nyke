// status.js — status-effect helpers and walls constant.

export function createStatusMap() {
  return {
    bleed: { stacks: 0, duration: 0, tick: 0 },
    fire: { stacks: 0, duration: 0, tick: 0 },
    poison: { stacks: 0, duration: 0, tick: 0 },
    dark_drain: { stacks: 0, duration: 0, tick: 0 },
    slow: { stacks: 0, duration: 0, tick: 0 },
    static: { stacks: 0, duration: 0, tick: 0 },
  };
}

// Fully normalize a status map's shape + numeric fields. Only worth running once
// per map (fresh entity, or a map rehydrated from a save where fields may be
// strings); after that the map is mutated exclusively through numeric writes, so
// re-coercing every key on every read is pure waste.
function normalizeStatusMap(statuses) {
  Neo.STATUS_KEYS.forEach(key => {
    const state = statuses[key];
    if (!state || typeof state !== 'object') statuses[key] = { stacks: 0, duration: 0, tick: 0 };
    statuses[key].stacks = Number(statuses[key].stacks || 0);
    statuses[key].duration = Number(statuses[key].duration || 0);
    statuses[key].tick = Number(statuses[key].tick || 0);
  });
  // Non-enumerable so it never leaks into save serialization or key iteration.
  Object.defineProperty(statuses, '_normalized', { value: true, writable: true, configurable: true });
  return statuses;
}

export function ensureStatuses(entity) {
  if (!entity || typeof entity !== 'object') return createStatusMap();
  const existing = entity.statuses;
  if (existing && typeof existing === 'object' && existing._normalized) return existing;
  if (!existing || typeof existing !== 'object') entity.statuses = createStatusMap();
  return normalizeStatusMap(entity.statuses);
}

export function getStatusState(entity, key) {
  return ensureStatuses(entity)[key];
}

export function getStatusStacks(entity, key) {
  return Number(getStatusState(entity, key).stacks || 0);
}

export function getActiveStatusCount(entity) {
  const statuses = ensureStatuses(entity);
  return Neo.STATUS_KEYS.reduce((total, key) => total + (Number(statuses?.[key]?.stacks || 0) > 0 ? 1 : 0), 0);
}

export function getSlowMultiplier(entity) {
  const stacks = Math.max(0, Number(getStatusStacks(entity, 'slow') || 0));
  if (stacks <= 0) return 1;
  const severity = entity === Neo.player
    ? Number(Neo.getItemStats?.()?.negativeStatusMultiplier || 1)
    : 1;
  return Math.max(0.35, 1 - stacks * 0.1 * severity);
}

// Poison weakens the victim's strikes: each stack shaves ~1% off outgoing
// damage (player-side, scaled by negativeStatusMultiplier severity). Mirrors the
// slow/brittle debuff multipliers. Floored so a full 6-stack stays a soft ~6%
// rather than gutting damage.
export function getPoisonDamageMultiplier(entity) {
  const stacks = Math.max(0, Number(getStatusStacks(entity, 'poison') || 0));
  if (stacks <= 0) return 1;
  const severity = entity === Neo.player
    ? Number(Neo.getItemStats?.()?.negativeStatusMultiplier || 1)
    : 1;
  return Math.max(0.85, 1 - stacks * 0.01 * severity);
}

// Cold/brittle: each slow (cold) stack strips a quarter of the target's defense,
// so it takes more damage. 4+ stacks remove all defense (multiplier 0).
export function getBrittleDefenseMultiplier(entity) {
  const stacks = Math.max(0, Number(getStatusStacks(entity, 'slow') || 0));
  if (stacks <= 0) return 1;
  const severity = entity === Neo.player
    ? Number(Neo.getItemStats?.()?.negativeStatusMultiplier || 1)
    : 1;
  return Math.max(0, 1 - stacks * 0.25 * severity);
}

export function getPlayerNegativeStatusProcChance(chance) {
  const severity = Number(Neo.getItemStats?.()?.negativeStatusMultiplier || 1);
  return Math.max(0, Number(chance || 0) * severity);
}

export function clearStatus(entity, key) {
  const state = getStatusState(entity, key);
  state.stacks = 0;
  state.duration = 0;
  state.tick = 0;
  state.sourceKey = '';
  state.sourceLabel = '';
  state.owner = null;
}

// Difficulty/time-scaled resistance floor for the non-bleed statuses
// (fire/poison/slow/static/dark_drain). Enemies only; bleed is excluded because
// it has its own dedicated damage-divisor system. Returns 0 on Easy/custom
// (statusResistScale 0), on the player, or for bleed. See STATUS_RESIST_SCALING
// and the difficulty defs' statusResistScale in game-core.js.
function getEnemyGenericStatusResistance(entity, key) {
  if (key === 'bleed') return 0;
  if (!entity || entity === Neo.player) return 0;
  const scale = Number(Neo.getDifficultyDef?.()?.statusResistScale || 0);
  if (scale <= 0) return 0;
  const cfg = Neo.STATUS_RESIST_SCALING || {};
  const minutes = Math.max(0, Number(Neo.gameElapsedTime || 0) / 60);
  // Time owns "resistances": the base difficulty scale ramps up over the run,
  // capped so a slow player plateaus instead of facing ever-climbing immunity.
  const timeRamp = Math.min(Number(cfg.timeCap ?? 0.6), minutes * Number(cfg.minute ?? 0.05));
  return Math.max(0, Math.min(Number(cfg.max ?? 0.85), scale * (1 + timeRamp)));
}

export function getStatusResistance(entity, key) {
  if (!entity || typeof entity !== 'object') return 0;
  const general = Number(entity.statusResistance || 0);
  const keyed = Number(entity.statusResistances?.[key] || 0);
  const ramped = getEnemyGenericStatusResistance(entity, key);
  return Math.max(0, Math.min(0.95, Math.max(general, keyed, ramped)));
}

// Player cold (slow) uses duration as a stack-time budget: each stack is 15s.
// The update loop recomputes visible stacks from the remaining budget so one
// stack falls off every 15s instead of all stacks sticking until the end.
export const COLD_SECONDS_PER_STACK = 15;

export function getColdStacksFromDuration(duration) {
  return Math.min(6, Math.max(0, Math.ceil((Number(duration || 0) - 0.001) / COLD_SECONDS_PER_STACK)));
}

export function applyStatus(entity, key, stacks, duration, source = null) {
  if (!entity || !Neo.STATUS_KEYS.includes(key)) return;
  if (entity[`${key}Immune`]) return;
  // Mateo's Potion Bath grants the player temporary resistance to all incoming
  // statuses.
  if (entity === Neo.player && Number(Neo.player.statusResistTime || 0) > 0) return;
  const state = getStatusState(entity, key);
  const resistanceMultiplier = 1 - getStatusResistance(entity, key);
  const addedStacks = Math.max(0, Number(stacks || 0)) * resistanceMultiplier;
  const durationSeverity = entity === Neo.player
    ? Number(Neo.getItemStats?.()?.negativeStatusMultiplier || 1)
    : 1;
  const adjustedDuration = Math.max(0, Number(duration || 0)) * durationSeverity * resistanceMultiplier;
  // Remember who inflicted a damaging status on the player so the death screen
  // can attribute a DoT kill (bleed/poison/fire) to the enemy, not the tick.
  if (entity === Neo.player && source && addedStacks > 0) {
    const rawKey = String(source.sourceKey ?? source.key ?? source.type ?? source ?? '').trim();
    if (rawKey) {
      state.sourceKey = rawKey;
      state.sourceLabel = String(source.sourceLabel ?? Neo.getDamageSourceLabel?.(rawKey) ?? rawKey);
    }
    // Dark Drain siphons HP back to the enemy that inflicted it (mirrors the
    // player's drain). Remember the owning enemy so the per-tick DoT can heal it.
    if (key === 'dark_drain' && typeof source === 'object' && source.owner) {
      state.owner = source.owner;
    }
  }
  if (key === 'slow' && entity === Neo.player) {
    const existingBudget = Number(state.duration || 0) > 0
      ? Number(state.duration || 0)
      : Math.max(0, Number(state.stacks || 0)) * COLD_SECONDS_PER_STACK;
    state.duration = Math.min(
      6 * COLD_SECONDS_PER_STACK * durationSeverity,
      existingBudget + addedStacks * COLD_SECONDS_PER_STACK * durationSeverity,
    );
    state.stacks = getColdStacksFromDuration(state.duration);
  } else {
    state.stacks = Math.min(6, Math.max(state.stacks, 0) + addedStacks);
    state.duration = Math.max(state.duration, adjustedDuration);
  }
  if (entity !== Neo.player) window.achievementEvents?.emit('status:applied', { key, entityId: entity.id });
  // Tutorial status lesson: advances on the first status the player lands on the
  // dummy. signal() no-ops outside the tutorial, so this is free in real runs.
  if (entity !== Neo.player && addedStacks > 0) Neo.tutorialController?.signal?.('status-applied', { key });
}

export const walls = (() => {
  const hw = (Neo.ROOM_W - Neo.DOOR) / 2;
  const hh = (Neo.ROOM_H - Neo.DOOR) / 2;
  return [
    { x: 0, y: 0, w: hw, h: Neo.WALL },
    { x: Neo.ROOM_W - hw, y: 0, w: hw, h: Neo.WALL },
    { x: 0, y: Neo.ROOM_H - Neo.WALL, w: hw, h: Neo.WALL },
    { x: Neo.ROOM_W - hw, y: Neo.ROOM_H - Neo.WALL, w: hw, h: Neo.WALL },
    { x: 0, y: 0, w: Neo.WALL, h: hh },
    { x: 0, y: Neo.ROOM_H - hh, w: Neo.WALL, h: hh },
    { x: Neo.ROOM_W - Neo.WALL, y: 0, w: Neo.WALL, h: hh },
    { x: Neo.ROOM_W - Neo.WALL, y: Neo.ROOM_H - hh, w: Neo.WALL, h: hh },
  ];
})();

Neo.walls = walls;
Neo.createStatusMap = createStatusMap;
Neo.ensureStatuses = ensureStatuses;
Neo.getStatusState = getStatusState;
Neo.getStatusStacks = getStatusStacks;
Neo.getActiveStatusCount = getActiveStatusCount;
Neo.getSlowMultiplier = getSlowMultiplier;
Neo.getPoisonDamageMultiplier = getPoisonDamageMultiplier;
Neo.getBrittleDefenseMultiplier = getBrittleDefenseMultiplier;
Neo.getPlayerNegativeStatusProcChance = getPlayerNegativeStatusProcChance;
Neo.clearStatus = clearStatus;
Neo.getStatusResistance = getStatusResistance;
Neo.applyStatus = applyStatus;
Neo.COLD_SECONDS_PER_STACK = COLD_SECONDS_PER_STACK;
Neo.getColdStacksFromDuration = getColdStacksFromDuration;
