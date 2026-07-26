(function initializeSharedEncounterSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEncounterApi() {
  'use strict';

  const CAMPAIGN_BOSS_POOL = Object.freeze(['queen_cult', 'bulk_golem', 'artificer_knave', 'antony_blemmye']);

  function next(random) {
    if (typeof random === 'function') return Number(random());
    if (typeof random?.next === 'function') return Number(random.next());
    return 0.5;
  }

  function int(random, min, max) {
    if (typeof random?.int === 'function') return random.int(min, max);
    return Math.floor(next(random) * (max - min + 1)) + min;
  }

  function getCampaignWaveCount(floorNumber, baseOffset, difficulty = {}, challengeBonus = 0, random = Math.random) {
    return Math.max(1, Math.floor(Number(baseOffset || 0) + Number(floorNumber || 1)
      + Number(difficulty.waveBonus || 0) + Number(challengeBonus || 0) + int(random, 0, 1)));
  }

  function rollCampaignEnemyType(floorNumber, roomWeightBonus = 0, random = Math.random) {
    const floor = Math.max(1, Number(floorNumber || 1));
    const bonus = Number(roomWeightBonus || 0);
    const roll = next(random);
    if (floor >= 7 && roll > 0.9 - bonus * 0.92) return 'machine_gunner';
    if (roll > 0.84 - bonus * 0.9) return 'golem';
    if (roll > 0.68 - bonus * 0.82) return 'sniper';
    if (roll > 0.5 - bonus * 0.68) return 'knave';
    if (roll > 0.32 - bonus * 0.54) return 'cult_mage';
    if (roll > 0.16 - bonus * 0.4) return 'charger';
    if (roll > 0.08 - bonus * 0.24) return 'laser';
    return 'hunter';
  }

  function buildCampaignWavePlan(count, options = {}) {
    const floor = Math.max(1, Number(options.floorNumber || 1));
    const roomType = options.roomType || 'combat';
    const random = options.random || Math.random;
    const roomWeightBonus = Number(options.roomWeightBonus || 0);
    if (floor < 4) {
      return Array.from({ length: count }, () => rollCampaignEnemyType(floor, roomWeightBonus, random));
    }
    const squads = [
      ['hunter', 'hunter', 'charger'],
      ['hunter', 'laser', 'shield_unit'],
      ['golem', 'healer', 'hunter'],
      ['knave', 'charger', 'healer'],
      ['sniper', 'shield_unit', 'hunter'],
      ['cult_mage', 'summoner', 'hunter'],
    ];
    if (floor >= 7) squads.push(
      ['machine_gunner', 'shield_unit', 'hunter'],
      ['machine_gunner', 'healer', 'charger'],
      ['sniper', 'machine_gunner', 'hunter'],
    );
    const plan = [];
    let safety = 0;
    while (plan.length < count && safety < 12) {
      safety += 1;
      squads[int(random, 0, squads.length - 1)].forEach(type => {
        if (plan.length < count) plan.push(type);
      });
    }
    if (roomType === 'ladder' && !plan.includes('shield_unit') && count >= 3) plan[Math.max(1, count - 2)] = 'shield_unit';
    if (count >= 5 && !plan.includes('healer')) plan[count - 2] = 'healer';
    if (count >= 6 && !plan.includes('summoner') && next(random) < 0.55) plan[count - 3] = 'summoner';
    if (count >= 6 && roomType === 'combat' && floor >= 4 && next(random) < 0.22) plan[count - 1] = 'boss_spawner';
    return plan.slice(0, count);
  }

  function getCampaignFloorBossType(floorNumber, random = Math.random) {
    if (Number(floorNumber) === 6 && next(random) < 0.66) return 'handsome_devil';
    return CAMPAIGN_BOSS_POOL[Math.floor(next(random) * CAMPAIGN_BOSS_POOL.length)] || CAMPAIGN_BOSS_POOL[0];
  }

  function getCampaignEndlessWaveSize(waveNumber) {
    const wave = Math.max(1, Math.floor(Number(waveNumber) || 1));
    // The campaign opens on five enemies (4 + floor one), then grows from the
    // completed-wave counter: 5, 6, 8, 9, 10… capped at 18.
    return Math.min(18, Math.max(5, 3 + wave + Math.floor((wave - 1) / 3)));
  }

  function createCampaignEndlessWavePlan(waveNumber, options = {}) {
    const wave = Math.max(1, Math.floor(Number(waveNumber) || 1));
    const random = options.random || Math.random;
    if (wave % 10 === 0) {
      const addCount = Math.min(2 + Math.floor(wave / 10), 6);
      return [getCampaignFloorBossType(options.floorNumber, random), ...buildCampaignWavePlan(addCount, { ...options, roomType: 'combat' })];
    }
    return buildCampaignWavePlan(getCampaignEndlessWaveSize(wave), { ...options, roomType: 'combat' });
  }

  function getCampaignBossRewardPickCount(floorNumber = 1, room = null, options = {}) {
    const floorPickBonus = Math.floor(Math.max(0, Number(floorNumber || 1) - 1) / 4);
    const bossBonus = room?.type === 'god' ? 1 : 0;
    const difficultyBonus = { easy: 0, normal: 0, hard: 1, nightmare: 1 }[String(options.difficultyKey || '').toLowerCase()] || 0;
    return Math.max(1, Math.min(3, 1 + floorPickBonus + bossBonus + difficultyBonus));
  }

  // Item choice generation is injected from SharedItemContent, while the
  // campaign and authority share the persisted choices, pick count, group ID
  // and spatial layout.
  function createCampaignBossRewardPlan(room, options = {}) {
    if (!room || room.bossRewardSpawned) return { ok: false, reason: 'REWARD_ALREADY_SPAWNED', pickups: [] };
    const createChoices = typeof options.createChoices === 'function' ? options.createChoices : () => [];
    const choices = Array.isArray(room.bossRewardChoices) && room.bossRewardChoices.length >= 5
      ? room.bossRewardChoices.slice(0, 5)
      : Array.from(createChoices(5) || []).slice(0, 5);
    room.bossRewardSpawned = true;
    room.bossRewardChoices = choices;
    const picksRemaining = getCampaignBossRewardPickCount(options.floorNumber, room, options);
    const groupId = room.bossRewardGroupId || `boss:${room.gx ?? 0}:${room.gy ?? 0}:${Math.max(1, Number(options.floorNumber || 1))}`;
    room.bossRewardGroupId = groupId;
    const centerX = Number(options.centerX ?? 450);
    const centerY = Number(options.centerY ?? 418);
    const offsets = [-144, -72, 0, 72, 144];
    return {
      ok: true, choices, picksRemaining, groupId,
      pickups: choices.map((key, index) => ({
        x: centerX + offsets[index], y: centerY, type: 'rewardChoice', key, groupId,
        picksRemaining, label: `${picksRemaining}/5`, source: 'boss_reward',
      })),
    };
  }

  function getCampaignEncounterPlan(room, options = {}) {
    if (!room) return [];
    if (room.type === 'god') return ['god'];
    if (room.type === 'boss') return [getCampaignFloorBossType(options.floorNumber, options.random)];
    // Network runs retain the campaign's tutorial/start-room sentinel encounter
    // when no authored elite ambush exists. It is an actual campaign enemy, not
    // a network-only archetype, and keeps the authority lifecycle initialized.
    if (room.type === 'start') return Number(room.startRoomEliteCount || 0) > 0
      ? buildCampaignWavePlan(Number(room.startRoomEliteCount), { ...options, roomType: 'combat' })
      : ['cult_follower'];
    const baseOffset = room.type === 'ladder' ? 4 : room.type === 'challenge' ? 3 : 3;
    const count = getCampaignWaveCount(options.floorNumber, baseOffset, options.difficulty, options.challengeBonus, options.random);
    return buildCampaignWavePlan(count, { ...options, roomType: room.type });
  }

  return {
    CAMPAIGN_BOSS_POOL,
    getCampaignWaveCount,
    rollCampaignEnemyType,
    buildCampaignWavePlan,
    getCampaignFloorBossType,
    getCampaignEndlessWaveSize,
    createCampaignEndlessWavePlan,
    getCampaignBossRewardPickCount,
    createCampaignBossRewardPlan,
    getCampaignEncounterPlan,
  };
});
