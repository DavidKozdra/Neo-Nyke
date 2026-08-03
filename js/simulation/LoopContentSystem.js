(function initializeLoopContentSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLoopContentSystemApi() {
  'use strict';

  // The first run is Loop 1; runLoopIndex is the number of crowns the current
  // run has already refused. These twenty beats turn deep looping into an
  // authored campaign instead of twenty repetitions of the same ten floors.
  const LOOP_CAMPAIGN_LENGTH = 20;
  const LOOP_MILESTONES = Object.freeze([
    { number: 1, title: 'THE WAKING DUNGEON', color: '#d7f6ff', feature: 'The original dungeon stirs.' },
    { number: 2, title: 'ECHOES ANSWER', color: '#bda7ff', feature: 'Chronicles and Echo Caches can appear.' },
    { number: 3, title: 'GILDED VEINS', color: '#ffd36d', feature: 'Larger treasure routes enter the rotation.' },
    { number: 4, title: 'THE WAR FOUNDRY', color: '#ff9b72', feature: 'Armories and Blood Forges unlock.' },
    { number: 5, title: 'TWIN PATHS', color: '#7fffd4', feature: 'Floors can hold two service rooms.' },
    { number: 6, title: 'THE HOURGLASS CRACKS', color: '#8edfff', feature: 'Time Capsules begin bending floors.' },
    { number: 7, title: 'ABERRANT BLOOM', color: '#a8ff7a', feature: 'Mutation Labs join the dungeon.' },
    { number: 8, title: 'SECRET CONSTELLATIONS', color: '#d4b4ff', feature: 'Two hidden rooms can exist on one floor.' },
    { number: 9, title: 'THE HUNGRY TREASURE', color: '#ff7f9f', feature: 'Mimic Dens enter the secret rotation.' },
    { number: 10, title: 'EYES ABOVE', color: '#8ab9ff', feature: 'Astral Observatories unlock.' },
    { number: 11, title: 'DEAD-END KINGDOM', color: '#c4e5ff', feature: 'The dungeon grows broader and stranger.' },
    { number: 12, title: 'STARFALL', color: '#fff09a', feature: 'Star Shrines hide beyond false walls.' },
    { number: 13, title: 'TRINITY FLOOR', color: '#f1a7ff', feature: 'Three service rooms can share a floor.' },
    { number: 14, title: 'THE VOID BAZAAR', color: '#be7dff', feature: 'Void Markets open for impossible trades.' },
    { number: 15, title: 'BLACK GEOMETRY', color: '#a4a8d8', feature: 'Late-loop floors reach their full size.' },
    { number: 16, title: 'NOTHING HAS A NAME', color: '#d8d8ff', feature: 'Null Chambers enter the secret rotation.' },
    { number: 17, title: 'THREE HIDDEN TRUTHS', color: '#9ef5ff', feature: 'Up to three secrets can haunt one floor.' },
    { number: 18, title: 'THE ASCENDANT HUNT', color: '#ffb06b', feature: 'Deep-loop reward selections widen.' },
    { number: 19, title: 'FINAL OMEN', color: '#ff768d', feature: 'The full dungeon protocol is active.' },
    { number: 20, title: 'GODLOOP', color: '#ffffff', feature: 'Reach GOD at the end of the twenty-loop saga.' },
  ].map(Object.freeze));

  const BASE_SERVICE_TYPES = Object.freeze(['shrine', 'bounty', 'reliquary', 'oracle', 'portal', 'prison', 'wishing_well']);
  const SERVICE_UNLOCKS = Object.freeze([
    Object.freeze({ type: 'chronicle', loopIndex: 1 }),
    Object.freeze({ type: 'armory', loopIndex: 3 }),
    Object.freeze({ type: 'mutation_lab', loopIndex: 6 }),
    Object.freeze({ type: 'observatory', loopIndex: 9 }),
    Object.freeze({ type: 'void_market', loopIndex: 13 }),
  ]);
  const SECRET_UNLOCKS = Object.freeze([
    Object.freeze({ type: 'vendor', loopIndex: 0 }),
    Object.freeze({ type: 'warp', loopIndex: 0 }),
    Object.freeze({ type: 'echo_cache', loopIndex: 1 }),
    Object.freeze({ type: 'blood_forge', loopIndex: 3 }),
    Object.freeze({ type: 'time_capsule', loopIndex: 5 }),
    Object.freeze({ type: 'mimic_den', loopIndex: 8 }),
    Object.freeze({ type: 'star_shrine', loopIndex: 11 }),
    Object.freeze({ type: 'null_chamber', loopIndex: 15 }),
  ]);

  const normalizeLoopIndex = value => Math.max(0, Math.trunc(Number(value) || 0));

  function getLoopMilestone(runLoopIndex = 0) {
    const loopIndex = normalizeLoopIndex(runLoopIndex);
    if (loopIndex < LOOP_MILESTONES.length) return LOOP_MILESTONES[loopIndex];
    return Object.freeze({
      number: loopIndex + 1,
      title: 'BEYOND GODLOOP',
      color: '#ffffff',
      feature: 'The twenty-loop saga is complete. The descent remains endless.',
    });
  }

  function getUnlockedLoopRoomTypes(runLoopIndex = 0) {
    const loopIndex = normalizeLoopIndex(runLoopIndex);
    return [...BASE_SERVICE_TYPES, ...SERVICE_UNLOCKS.filter(entry => loopIndex >= entry.loopIndex).map(entry => entry.type)];
  }

  function getUnlockedSecretKinds(runLoopIndex = 0) {
    const loopIndex = normalizeLoopIndex(runLoopIndex);
    return SECRET_UNLOCKS.filter(entry => loopIndex >= entry.loopIndex).map(entry => entry.type);
  }

  function getLoopFloorPlan(runLoopIndex = 0) {
    const loopIndex = normalizeLoopIndex(runLoopIndex);
    return Object.freeze({
      loopIndex,
      loopNumber: loopIndex + 1,
      extraRooms: Math.min(4, Math.floor((loopIndex + 1) / 5)),
      serviceRoomCount: loopIndex >= 12 ? 3 : loopIndex >= 4 ? 2 : 1,
      secretRoomCount: loopIndex >= 16 ? 3 : loopIndex >= 7 ? 2 : 1,
      rewardOptions: loopIndex >= 17 ? 6 : loopIndex >= 9 ? 5 : loopIndex >= 4 ? 4 : 3,
      rewardPicks: loopIndex >= 9 ? 2 : 1,
      recoveryFraction: Math.min(0.5, 0.2 + Math.floor(loopIndex / 5) * 0.08),
    });
  }

  function getScheduledLoopRoomTypes(floorNumber = 1, runLoopIndex = 0, count = 1) {
    const pool = getUnlockedLoopRoomTypes(runLoopIndex);
    const wanted = Math.max(0, Math.min(pool.length, Math.trunc(Number(count) || 0)));
    if (!wanted) return [];
    const floor = Math.max(1, Math.trunc(Number(floorNumber) || 1));
    const loopIndex = normalizeLoopIndex(runLoopIndex);
    // The newest unlock leads floor one of its debut loop, so new content is
    // encountered promptly rather than being lost in a growing random pool.
    const debut = SERVICE_UNLOCKS.find(entry => entry.loopIndex === loopIndex)?.type;
    const result = [];
    if (debut && floor === 1) result.push(debut);
    let cursor = (floor - 1 + loopIndex * 3) % pool.length;
    while (result.length < wanted) {
      const type = pool[cursor % pool.length];
      if (!result.includes(type)) result.push(type);
      cursor += Math.max(1, Math.ceil(pool.length / wanted));
    }
    return result;
  }

  function getScheduledSecretKinds(floorNumber = 1, runLoopIndex = 0, count = 1) {
    const pool = getUnlockedSecretKinds(runLoopIndex);
    const wanted = Math.max(0, Math.min(pool.length, Math.trunc(Number(count) || 0)));
    if (!wanted) return [];
    const floor = Math.max(1, Math.trunc(Number(floorNumber) || 1));
    const loopIndex = normalizeLoopIndex(runLoopIndex);
    const debut = SECRET_UNLOCKS.find(entry => entry.loopIndex === loopIndex)?.type;
    const result = [];
    if (debut && !['vendor', 'warp'].includes(debut) && floor === 1) result.push(debut);
    let cursor = (floor - 1 + loopIndex * 2) % pool.length;
    while (result.length < wanted) {
      const type = pool[cursor % pool.length];
      if (!result.includes(type)) result.push(type);
      cursor += Math.max(1, Math.ceil(pool.length / wanted));
    }
    return result;
  }

  return {
    LOOP_CAMPAIGN_LENGTH,
    LOOP_MILESTONES,
    BASE_SERVICE_TYPES,
    SERVICE_UNLOCKS,
    SECRET_UNLOCKS,
    getLoopMilestone,
    getUnlockedLoopRoomTypes,
    getUnlockedSecretKinds,
    getLoopFloorPlan,
    getScheduledLoopRoomTypes,
    getScheduledSecretKinds,
  };
});
