// status.js — status-effect helpers and walls constant.

export function createStatusMap() {
  return globalThis.NeoNyke.simulation.createCampaignStatusMap();
}

export function ensureStatuses(entity) {
  if (!entity || typeof entity !== 'object') return createStatusMap();
  const existing = entity.statuses;
  if (existing && typeof existing === 'object' && existing._normalized) return existing;
  const statuses = globalThis.NeoNyke.simulation.ensureCampaignStatuses(entity);
  // Non-enumerable so it never leaks into save serialization or key iteration.
  Object.defineProperty(statuses, '_normalized', { value: true, writable: true, configurable: true });
  return statuses;
}

export function getStatusState(entity, key) {
  return ensureStatuses(entity)[key];
}

export function getStatusStacks(entity, key) {
  ensureStatuses(entity);
  return globalThis.NeoNyke.simulation.getCampaignStatusStacks(entity, key);
}

export function getActiveStatusCount(entity) {
  const statuses = ensureStatuses(entity);
  return Neo.STATUS_KEYS.reduce((total, key) => total + (Number(statuses?.[key]?.stacks || 0) > 0 ? 1 : 0), 0);
}

// The severity multiplier only applies to the player (their items can worsen
// incoming statuses); enemies always take the base debuff.
function getEntityStatusSeverity(entity) {
  return entity === Neo.player
    ? Number(Neo.getItemStats?.()?.negativeStatusMultiplier || 1)
    : 1;
}

export function getSlowMultiplier(entity) {
  return globalThis.NeoNyke.simulation.getCampaignSlowMultiplier(
    getStatusStacks(entity, 'slow'),
    getEntityStatusSeverity(entity),
  );
}

// Poison weakens the victim's strikes: each stack shaves ~1% off outgoing
// damage (player-side, scaled by negativeStatusMultiplier severity). Mirrors the
// slow/brittle debuff multipliers. Floored so a full 6-stack stays a soft ~6%
// rather than gutting damage.
export function getPoisonDamageMultiplier(entity) {
  return globalThis.NeoNyke.simulation.getCampaignPoisonDamageMultiplier(
    getStatusStacks(entity, 'poison'),
    getEntityStatusSeverity(entity),
  );
}

// Cold/brittle: each slow (cold) stack strips a quarter of the target's defense,
// so it takes more damage. 4+ stacks remove all defense (multiplier 0).
export function getBrittleDefenseMultiplier(entity) {
  return globalThis.NeoNyke.simulation.getCampaignBrittleDefenseMultiplier(
    getStatusStacks(entity, 'slow'),
    getEntityStatusSeverity(entity),
  );
}

export function getPlayerNegativeStatusProcChance(chance) {
  const severity = Number(Neo.getItemStats?.()?.negativeStatusMultiplier || 1);
  return Math.max(0, Number(chance || 0) * severity);
}

export function clearStatus(entity, key) {
  globalThis.NeoNyke.simulation.clearCampaignStatus(entity, key);
  const state = getStatusState(entity, key);
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
  if (!entity || entity === Neo.player) return 0;
  // Time owns "resistances": the base difficulty scale ramps up over the run,
  // capped so a slow player plateaus instead of facing ever-climbing immunity.
  return globalThis.NeoNyke.simulation.getCampaignGenericStatusResistance(key, {
    statusResistScale: Number(Neo.getDifficultyDef?.()?.statusResistScale || 0),
    elapsedSeconds: Number(Neo.gameElapsedTime || 0),
  });
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
export const COLD_SECONDS_PER_STACK = globalThis.NeoNyke.simulation.COLD_SECONDS_PER_STACK;

export function getColdStacksFromDuration(duration) {
  return globalThis.NeoNyke.simulation.getColdStacksFromDuration(duration);
}

export function applyStatus(entity, key, stacks, duration, source = null) {
  if (!entity || !Neo.STATUS_KEYS.includes(key)) return;
  if (entity[`${key}Immune`]) return;
  // Mateo's Potion Bath grants the player temporary resistance to all incoming
  // statuses.
  if (entity === Neo.player && Number(Neo.player.statusResistTime || 0) > 0) return;
  const state = getStatusState(entity, key);
  // The numeric mutation (resistance-scaled stacks/duration, the 6-stack cap
  // with max-duration merge, the player's cold budget) is the shared campaign
  // operation; browser-only attribution and signals stay here.
  const result = globalThis.NeoNyke.simulation.applyCampaignStatus(entity, key, stacks, duration, {
    resistance: getStatusResistance(entity, key),
    severity: entity === Neo.player
      ? Number(Neo.getItemStats?.()?.negativeStatusMultiplier || 1)
      : 1,
    playerColdBudget: entity === Neo.player,
  });
  const addedStacks = Number(result?.addedStacks || 0);
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
  if (entity !== Neo.player) window.achievementEvents?.emit('status:applied', { key, entityId: entity.id });
  // Tutorial status lesson: advances on the first status the player lands on the
  // dummy. signal() no-ops outside the tutorial, so this is free in real runs.
  // The tutorial's own pre-applied demo bleed (source.tutorialDemo) is excluded
  // so it can keep the dummy visibly bleeding without insta-completing the step.
  const isTutorialDemo = typeof source === 'object' && source?.tutorialDemo;
  if (entity !== Neo.player && addedStacks > 0 && !isTutorialDemo) Neo.tutorialController?.signal?.('status-applied', { key });
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
