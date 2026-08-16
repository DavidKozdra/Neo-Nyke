(function initializeSharedChaosSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedChaosSystemApi() {
  'use strict';

  const MOVE_SLOTS = Object.freeze(['melee', 'laser', 'smash', 'dash']);

  function pick(values, random) {
    if (!Array.isArray(values) || values.length === 0) return '';
    const index = Math.floor(Number(random()) * values.length);
    return values[Math.max(0, Math.min(values.length - 1, index))];
  }

  // Shapeshifter: pick a different character than the one currently worn, so a
  // reroll always visibly changes something. With a single candidate the current
  // character is kept rather than forcing an impossible swap.
  function rollChaosCharacter(options = {}) {
    const current = String(options.currentCharacter || '');
    const candidates = (Array.isArray(options.candidates) ? options.candidates : [])
      .map(String)
      .filter(Boolean);
    const others = candidates.filter(key => key !== current);
    const pool = others.length > 0 ? others : candidates;
    if (pool.length === 0) return current;
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    return pick(pool, random) || current;
  }

  // Loose Grip: reroll every slot from the moves the player owns, filtered to
  // what the (possibly just-rerolled) character may legally equip. A slot with no
  // legal candidate keeps whatever it already had rather than emptying out.
  function rollChaosLoadout(options = {}) {
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    const equipped = options.equippedMoves && typeof options.equippedMoves === 'object' ? options.equippedMoves : {};
    const ownedMoves = Array.isArray(options.ownedMoves) ? options.ownedMoves.map(String).filter(Boolean) : [];
    const slotOf = typeof options.slotOf === 'function' ? options.slotOf : () => '';
    const isAllowed = typeof options.isAllowed === 'function' ? options.isAllowed : () => true;
    const next = {};
    MOVE_SLOTS.forEach(slot => {
      const candidates = ownedMoves.filter(key => slotOf(key) === slot && isAllowed(key));
      next[slot] = candidates.length > 0 ? (pick(candidates, random) || equipped[slot] || '') : (equipped[slot] || '');
    });
    return next;
  }

  // Lottery Levels: a level anywhere in [1, cap] with no relation to depth. The
  // cap still climbs with progression so late floors can roll high, but the low
  // end never lifts off 1 — that flatness is the point of the mod.
  function rollChaosEnemyLevel(options = {}) {
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    const depth = Math.max(1, Math.trunc(Number(options.progressionDepth || 1)));
    const cap = Math.max(1, Math.trunc(Number(options.maxLevel || depth * 3 + 5)));
    return Math.max(1, Math.min(cap, 1 + Math.floor(Number(random()) * cap)));
  }

  // Reincarnation converts a death into a respawn as an enemy. It is allowed
  // once per floor: `usedOnFloor` is the floor a respawn was last spent on, so
  // descending re-arms it and dying twice on one floor still ends the run.
  function resolveChaosReincarnation(options = {}) {
    if (!options.active) return { ok: false, reason: 'CHAOS_REINCARNATION_INACTIVE' };
    const floor = Math.max(1, Math.trunc(Number(options.floor || 1)));
    if (Math.trunc(Number(options.usedOnFloor || 0)) === floor) {
      return { ok: false, reason: 'CHAOS_REINCARNATION_SPENT' };
    }
    const roster = (Array.isArray(options.roster) ? options.roster : []).map(String).filter(Boolean);
    if (roster.length === 0) return { ok: false, reason: 'CHAOS_REINCARNATION_NO_ROSTER' };
    const random = typeof options.random === 'function' ? options.random : () => 0.5;
    return {
      ok: true,
      characterKey: pick(roster, random),
      floor,
      // Respawns come back hurt, not fresh: a full-health revive would make the
      // mod a strict upgrade over playing carefully.
      hpFraction: 0.5,
    };
  }

  // Architect: convert a validated player-drawn plan into the room list the
  // generator would otherwise produce. Doors are opened between orthogonally
  // adjacent placed cells, matching the generator's edge-to-edge connectivity.
  function createChaosFirstFloorLayout(plan, options = {}) {
    if (!plan || !Array.isArray(plan.cells) || plan.cells.length === 0) return null;
    const gridSize = Math.max(3, Math.min(9, Math.trunc(Number(plan.gridSize)) || 9));
    const runLoopIndex = Math.max(0, Math.trunc(Number(options.runLoopIndex || 0)));
    const byKey = new Map();
    const rooms = plan.cells.map(cell => {
      const gx = Math.trunc(Number(cell.gx));
      const gy = Math.trunc(Number(cell.gy));
      const planType = String(cell.type || 'combat');
      const room = {
        id: `room-${gx}-${gy}`,
        gx,
        gy,
        // start/exit are placement roles in the editor, not room types: both are
        // ordinary combat rooms, distinguished by startRoomId/exitRoomId below.
        type: planType === 'start' || planType === 'exit' ? 'combat' : planType,
        layoutArchetype: 'open',
        layoutChambers: [],
        doors: { n: false, s: false, e: false, w: false },
        secretPassages: {},
        secret: false,
        explored: false,
        visited: false,
        cleared: false,
        bossStarted: false,
        challengeStarted: false,
        challengeLifecycleState: 'ready',
        challengeRewardSpawned: false,
        challengeFailed: false,
        loopUnlock: runLoopIndex,
      };
      byKey.set(`${gx},${gy}`, room);
      return room;
    });
    rooms.forEach(room => {
      if (byKey.has(`${room.gx},${room.gy - 1}`)) room.doors.n = true;
      if (byKey.has(`${room.gx},${room.gy + 1}`)) room.doors.s = true;
      if (byKey.has(`${room.gx + 1},${room.gy}`)) room.doors.e = true;
      if (byKey.has(`${room.gx - 1},${room.gy}`)) room.doors.w = true;
    });
    const startCell = plan.cells.find(cell => String(cell.type) === 'start');
    const exitCell = plan.cells.find(cell => String(cell.type) === 'exit');
    if (!startCell || !exitCell) return null;
    const startRoom = byKey.get(`${Math.trunc(Number(startCell.gx))},${Math.trunc(Number(startCell.gy))}`);
    const exitRoom = byKey.get(`${Math.trunc(Number(exitCell.gx))},${Math.trunc(Number(exitCell.gy))}`);
    if (!startRoom || !exitRoom) return null;
    startRoom.cleared = true;
    return {
      generationVersion: 'chaos-architect-1',
      contentVersion: options.contentVersion,
      matchSeed: options.matchSeed,
      floorSeed: options.floorSeed,
      floorNumber: 1,
      runLoopIndex,
      loopMilestone: options.loopMilestone || null,
      gridSize,
      startRoomId: startRoom.id,
      exitRoomId: exitRoom.id,
      rooms,
      hideExitOnMinimap: false,
      authoredByPlayer: true,
    };
  }

  return {
    CHAOS_MOVE_SLOTS: MOVE_SLOTS,
    rollChaosCharacter,
    rollChaosLoadout,
    rollChaosEnemyLevel,
    resolveChaosReincarnation,
    createChaosFirstFloorLayout,
  };
});
