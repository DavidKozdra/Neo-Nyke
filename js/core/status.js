// status.js — status-effect helpers and walls constant.

export function createStatusMap() {
  return {
    bleed: { stacks: 0, duration: 0, tick: 0 },
    fire: { stacks: 0, duration: 0, tick: 0 },
    poison: { stacks: 0, duration: 0, tick: 0 },
    dark_drain: { stacks: 0, duration: 0, tick: 0 },
    slow: { stacks: 0, duration: 0, tick: 0 },
  };
}

export function ensureStatuses(entity) {
  if (!entity || typeof entity !== 'object') return createStatusMap();
  if (!entity.statuses || typeof entity.statuses !== 'object') entity.statuses = createStatusMap();
  Neo.STATUS_KEYS.forEach(key => {
    const state = entity.statuses[key];
    if (!state || typeof state !== 'object') entity.statuses[key] = { stacks: 0, duration: 0, tick: 0 };
    entity.statuses[key].stacks = Number(entity.statuses[key].stacks || 0);
    entity.statuses[key].duration = Number(entity.statuses[key].duration || 0);
    entity.statuses[key].tick = Number(entity.statuses[key].tick || 0);
  });
  return entity.statuses;
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
  return Math.max(0.45, 1 - stacks * 0.1);
}

// Cold/brittle: each slow (cold) stack strips a quarter of the target's defense,
// so it takes more damage. 4+ stacks remove all defense (multiplier 0).
export function getBrittleDefenseMultiplier(entity) {
  const stacks = Math.max(0, Number(getStatusStacks(entity, 'slow') || 0));
  if (stacks <= 0) return 1;
  return Math.max(0, 1 - stacks * 0.25);
}

export function clearStatus(entity, key) {
  const state = getStatusState(entity, key);
  state.stacks = 0;
  state.duration = 0;
  state.tick = 0;
}

// Cold (slow) lasts a long time and scales with stacks: 15s per stack, total.
export const COLD_SECONDS_PER_STACK = 15;

export function applyStatus(entity, key, stacks, duration) {
  if (!entity || !Neo.STATUS_KEYS.includes(key)) return;
  if (entity[`${key}Immune`]) return;
  const state = getStatusState(entity, key);
  state.stacks = Math.min(6, Math.max(state.stacks, 0) + Math.max(0, Number(stacks || 0)));
  if (key === 'slow' && entity === Neo.player) {
    // Cold on the player tracks total stacks (15s each); enemy "slow" procs
    // (e.g. weapon fatigue) keep their own short explicit duration.
    state.duration = Math.max(state.duration, state.stacks * COLD_SECONDS_PER_STACK);
  } else {
    state.duration = Math.max(state.duration, Number(duration || 0));
  }
  if (entity !== Neo.player) window.achievementEvents?.emit('status:applied', { key, entityId: entity.id });
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
Neo.getBrittleDefenseMultiplier = getBrittleDefenseMultiplier;
Neo.clearStatus = clearStatus;
Neo.applyStatus = applyStatus;
