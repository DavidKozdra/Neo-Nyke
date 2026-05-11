// status.js — standalone IIFE. Status-effect helpers and walls constant.
(() => {
  function createStatusMap() {
    return {
      bleed: { stacks: 0, duration: 0, tick: 0 },
      fire: { stacks: 0, duration: 0, tick: 0 },
      poison: { stacks: 0, duration: 0, tick: 0 },
      dark_drain: { stacks: 0, duration: 0, tick: 0 },
    };
  }

  function ensureStatuses(entity) {
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

  function getStatusState(entity, key) {
    return ensureStatuses(entity)[key];
  }

  function getStatusStacks(entity, key) {
    return Number(getStatusState(entity, key).stacks || 0);
  }

  function clearStatus(entity, key) {
    const state = getStatusState(entity, key);
    state.stacks = 0;
    state.duration = 0;
    state.tick = 0;
  }

  function applyStatus(entity, key, stacks, duration) {
    if (!entity || !Neo.STATUS_KEYS.includes(key)) return;
    if (entity[`${key}Immune`]) return;
    const state = getStatusState(entity, key);
    state.stacks = Math.min(6, Math.max(state.stacks, 0) + Math.max(0, Number(stacks || 0)));
    state.duration = Math.max(state.duration, Number(duration || 0));
    if (entity !== Neo.player) achievementEvents.emit('status:applied', { key });
  }

  const walls = (() => {
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

  // Expose on Neo
  Neo.walls = walls;
  Neo.createStatusMap = createStatusMap;
  Neo.ensureStatuses = ensureStatuses;
  Neo.getStatusState = getStatusState;
  Neo.getStatusStacks = getStatusStacks;
  Neo.clearStatus = clearStatus;
  Neo.applyStatus = applyStatus;
})();
