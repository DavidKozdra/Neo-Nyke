(function initializeSharedRoomLifecycleSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedRoomLifecycleApi() {
  'use strict';

  const CHALLENGE_PICKUP_TYPES = Object.freeze([
    'challengeBomb', 'challengeRune', 'challengeStarter', 'challengeItemChoice', 'challengeSwitch',
  ]);
  const CAMPAIGN_CHALLENGE_TYPES = Object.freeze(['mirror', 'circuit', 'bomb', 'survival', 'runes', 'storm']);
  const CHALLENGE_CLEAR_RATE_TARGETS = Object.freeze({
    bomb: Object.freeze({ min: 0.55, max: 0.65 }),
    survival: Object.freeze({ min: 0.6, max: 0.7 }),
    runes: Object.freeze({ min: 0.5, max: 0.6 }),
    storm: Object.freeze({ min: 0.45, max: 0.55 }),
    mirror: Object.freeze({ min: 0.5, max: 0.6 }),
    circuit: Object.freeze({ min: 0.45, max: 0.6 }),
  });
  const CHALLENGE_CIRCUIT_SWITCHES = Object.freeze([
    Object.freeze({ x: 230, y: 245, color: '#ff667d', label: '1' }),
    Object.freeze({ x: 670, y: 245, color: '#68a7ff', label: '2' }),
    Object.freeze({ x: 230, y: 475, color: '#ffd45d', label: '3' }),
    Object.freeze({ x: 670, y: 475, color: '#70e09a', label: '4' }),
  ]);

  function rollCampaignChallengeType(floorNumber, random = Math.random) {
    const floor = Math.max(1, Number(floorNumber || 1));
    const maximumIndex = floor <= 2 ? 2 : floor <= 4 ? 4 : CAMPAIGN_CHALLENGE_TYPES.length - 1;
    return CAMPAIGN_CHALLENGE_TYPES[Math.floor(Number(random()) * (maximumIndex + 1))] || CAMPAIGN_CHALLENGE_TYPES[0];
  }

  function getCampaignChallengeTrialTuning(type, options = {}) {
    const floor = Math.max(1, Number(options.floorNumber || 1));
    const scaleTimer = typeof options.scaleTimer === 'function'
      ? options.scaleTimer : seconds => Math.max(6, Math.round(Number(seconds || 0)));
    if (type === 'storm') {
      return {
        timer: scaleTimer(17),
        tick: Math.max(0.68, 1.05 - floor * 0.02),
        burstCount: floor >= 7 ? 4 : floor >= 4 ? 3 : 2,
      };
    }
    if (type === 'survival') {
      return {
        timer: scaleTimer(24),
        tickStart: 2.2,
        tickEnd: 1.35,
        spawnCount: floor >= 6 ? 6 : 3,
      };
    }
    if (type === 'runes') {
      return { timer: scaleTimer(20), tick: Math.max(2.0, 2.9 - floor * 0.06), spawnCount: 1 };
    }
    if (type === 'bomb') return { timer: scaleTimer(17), tick: Math.max(1.2, 2.4 - floor * 0.1), spawnCount: floor >= 7 ? 2 : 1 };
    if (type === 'circuit' || type === 'stillness') {
      const pressure = Math.max(0, Math.min(1, (Number(options.difficultyStatMultiplier || 1) - 1) / 0.52));
      return { timer: scaleTimer(18), sequenceLength: 4 + Math.round(pressure * 2), wrongPressPenalty: 2 };
    }
    return {};
  }

  function createCampaignCircuitSequence(length, random = Math.random) {
    const sequence = [];
    const count = Math.max(3, Math.floor(Number(length || 4)));
    for (let index = 0; index < count; index += 1) {
      let switchIndex = Math.floor(Number(random()) * CHALLENGE_CIRCUIT_SWITCHES.length);
      if (switchIndex === sequence[index - 1]) switchIndex = (switchIndex + 1) % CHALLENGE_CIRCUIT_SWITCHES.length;
      sequence.push(switchIndex);
    }
    return sequence;
  }

  function startCampaignCircuitChallenge(room, options = {}) {
    if (!room || room.type !== 'challenge') return { ok: false, reason: 'INVALID_CHALLENGE_ROOM', switches: [] };
    const tuning = options.tuning || getCampaignChallengeTrialTuning('circuit', options);
    const existingSequence = Array.isArray(room.challengeData?.sequence)
      ? room.challengeData.sequence.filter(index => Number.isInteger(index) && index >= 0 && index < CHALLENGE_CIRCUIT_SWITCHES.length)
      : [];
    const resetTimer = existingSequence.length < 3;
    const sequence = resetTimer
      ? createCampaignCircuitSequence(tuning.sequenceLength, options.random)
      : existingSequence;
    room.challengeType = 'circuit';
    room.challengeTimer = resetTimer
      ? Math.max(0, Number(tuning.timer || 0))
      : Math.max(0, Number(room.challengeTimer || tuning.timer || 0));
    room.challengeData = {
      ...(room.challengeData || {}), phase: 'solve', sequence,
      progress: resetTimer ? 0 : Math.max(0, Math.min(sequence.length, Number(room.challengeData?.progress || 0))),
      maxTimer: resetTimer ? room.challengeTimer : Math.max(room.challengeTimer, Number(room.challengeData?.maxTimer || room.challengeTimer)),
      wrongPressPenalty: Number(tuning.wrongPressPenalty || 2),
      targetClearRate: CHALLENGE_CLEAR_RATE_TARGETS.circuit,
    };
    return {
      ok: true, timer: room.challengeTimer, sequence: sequence.slice(),
      switches: CHALLENGE_CIRCUIT_SWITCHES.map((switchDef, switchIndex) => ({ ...switchDef, type: 'challengeSwitch', switchIndex, armed: true })),
    };
  }

  function advanceCampaignCircuitChallenge(room, deltaSeconds) {
    if (!room || room.type !== 'challenge' || !['circuit', 'stillness'].includes(room.challengeType)
      || !room.challengeStarted || room.cleared) return { ok: false, failed: false };
    const delta = Math.max(0, Number(deltaSeconds || 0));
    room.challengeTimer = Math.max(0, Number(room.challengeTimer || 0) - delta);
    room.challengeData = room.challengeData || {};
    room.challengeData.flash = Math.max(0, Number(room.challengeData.flash || 0) - delta);
    room.challengeData.wrongFlash = Math.max(0, Number(room.challengeData.wrongFlash || 0) - delta);
    return { ok: true, timer: room.challengeTimer, failed: room.challengeTimer <= 0 };
  }

  function getCampaignChallengeObeliskMaxHp(floorNumber = 1) {
    const floor = Math.max(1, Number(floorNumber || 1));
    return Math.max(28, Math.round((90 + floor * 17.5) / 2 * 1.4));
  }

  function createCampaignTrialEnemyWavePlan(count = 1, options = {}) {
    const floor = Math.max(1, Number(options.floorNumber || 1));
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const width = Math.max(1, Number(options.width || 900));
    const height = Math.max(1, Number(options.height || 700));
    const pool = floor >= 6 ? ['hunter', 'laser', 'charger', 'knave'] : ['hunter', 'laser', 'charger'];
    return Array.from({ length: Math.max(0, Math.floor(Number(count || 0))) }, () => {
      const angle = Number(random()) * Math.PI * 2;
      const radius = 170 + Number(random()) * 90;
      const type = pool[Math.max(0, Math.min(pool.length - 1, Math.floor(Number(random()) * pool.length)))];
      return { type, x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius };
    });
  }

  function startCampaignSurvivalChallenge(room, options = {}) {
    if (!room || room.type !== 'challenge') return { ok: false, reason: 'INVALID_CHALLENGE_ROOM' };
    const tuning = options.tuning || getCampaignChallengeTrialTuning('survival', options);
    const maxHp = getCampaignChallengeObeliskMaxHp(options.floorNumber);
    room.challengeTimer = Math.max(0, Number(tuning.timer || 0));
    room.challengeTick = Math.max(0, Number(tuning.tickStart || 2.2));
    room.challengeData = {
      ...(room.challengeData || {}), maxTimer: room.challengeTimer,
      spawnCount: Math.max(1, Number(tuning.spawnCount || 1)),
      tickStart: Number(tuning.tickStart || 2.2), tickEnd: Number(tuning.tickEnd || 1.35),
      targetClearRate: CHALLENGE_CLEAR_RATE_TARGETS.survival,
      obelisk: { x: Number(options.width || 900) / 2, y: Number(options.height || 700) / 2, r: 22, hp: maxHp, maxHp, hitFlash: 0, guardRange: 96 },
    };
    return { ok: true, timer: room.challengeTimer, tick: room.challengeTick, obelisk: room.challengeData.obelisk };
  }

  function advanceCampaignSurvivalChallenge(room, deltaSeconds, options = {}) {
    if (!room || room.type !== 'challenge' || room.challengeType !== 'survival' || !room.challengeStarted || room.cleared) {
      return { ok: false, spawnCount: 0, failed: false, complete: false };
    }
    const delta = Math.max(0, Number(deltaSeconds || 0));
    const tuning = options.tuning || getCampaignChallengeTrialTuning('survival', options);
    const enemies = Array.isArray(options.enemies) ? options.enemies : [];
    const obelisk = room.challengeData?.obelisk;
    room.challengeTimer = Math.max(0, Number(room.challengeTimer || 0) - delta);
    room.challengeTick = Math.max(0, Number(room.challengeTick || 0) - delta);
    let spawnCount = 0;
    if (room.challengeTick <= 0) {
      const maximum = Math.max(1, Number(room.challengeData?.maxTimer || room.challengeTimer || 1));
      const ratio = Math.max(0, Math.min(1, room.challengeTimer / maximum));
      const start = Number(room.challengeData?.tickStart || tuning.tickStart || 2.2);
      const end = Number(room.challengeData?.tickEnd || tuning.tickEnd || 1.35);
      room.challengeTick = end + (start - end) * ratio;
      const liveSeekers = enemies.filter(enemy => enemy && !enemy.dead && enemy.obeliskSeeker).length;
      const capacity = Math.max(0, 8 - liveSeekers);
      spawnCount = Math.min(Math.max(0, Number(room.challengeData?.spawnCount || tuning.spawnCount || 1)), capacity);
    }
    let attackers = 0;
    if (obelisk) {
      obelisk.hitFlash = Math.max(0, Number(obelisk.hitFlash || 0) - delta);
      attackers = enemies.filter(enemy => enemy && !enemy.dead
        && Math.hypot(Number(enemy.x || 0) - obelisk.x, Number(enemy.y || 0) - obelisk.y) < Number(obelisk.guardRange || 96) + Number(enemy.radius || enemy.r || 12)).length;
      if (attackers > 0) {
        const floor = Math.max(1, Number(options.floorNumber || 1));
        obelisk.hp = Math.max(0, Number(obelisk.hp || 0) - Math.sqrt(attackers) * (5 + floor * 0.6) * delta);
        obelisk.hitFlash = 0.18;
      }
    }
    return { ok: true, spawnCount, attackers, failed: !!obelisk && obelisk.hp <= 0, complete: room.challengeTimer <= 0, obelisk };
  }

  function applyCampaignObeliskSeekerSteering(enemy, obelisk, deltaSeconds, options = {}) {
    if (!enemy || !enemy.obeliskSeeker || enemy.dead || !obelisk || Number(enemy.stun || 0) > 0 || enemy.airborne) return false;
    const dx = Number(obelisk.x) - Number(enemy.x);
    const dy = Number(obelisk.y) - Number(enemy.y);
    const distance = Math.hypot(dx, dy) || 1;
    const holdRange = Number(obelisk.guardRange || 96) - 8;
    if (distance <= holdRange) { enemy.vx = Number(enemy.vx || 0) * 0.82; enemy.vy = Number(enemy.vy || 0) * 0.82; return true; }
    const delta = Math.max(0, Number(deltaSeconds || 0));
    const speed = Math.max(0, Number(options.speed ?? enemy.speed ?? enemy.moveSpeed ?? 90));
    const acceleration = Math.max(0, Number(options.acceleration ?? 5.2));
    enemy.vx = Number(enemy.vx || 0) + (dx / distance * speed - Number(enemy.vx || 0)) * acceleration * delta;
    enemy.vy = Number(enemy.vy || 0) + (dy / distance * speed - Number(enemy.vy || 0)) * acceleration * delta;
    return true;
  }

  function createCampaignRuneSpawnPlan(options = {}) {
    const count = Math.max(1, Math.floor(Number(options.count || 5)));
    const width = Math.max(1, Number(options.width || 900));
    const height = Math.max(1, Number(options.height || 700));
    const random = typeof options.random === 'function' ? options.random : Math.random;
    return Array.from({ length: count }, (_, index) => {
      const angle = Math.PI * 2 * index / count + Number(random()) * 0.18;
      const driftAngle = angle + Math.PI / 2 + (-0.55 + Number(random()) * 1.1);
      const speed = 56 + Number(random()) * 26;
      return { type: 'challengeRune', x: width / 2 + Math.cos(angle) * 160, y: height / 2 + Math.sin(angle) * 160, vx: Math.cos(driftAngle) * speed, vy: Math.sin(driftAngle) * speed };
    });
  }

  function startCampaignRuneChallenge(room, options = {}) {
    if (!room || room.type !== 'challenge') return { ok: false, reason: 'INVALID_CHALLENGE_ROOM', runes: [] };
    const tuning = options.tuning || getCampaignChallengeTrialTuning('runes', options);
    const runes = createCampaignRuneSpawnPlan(options);
    room.challengeTimer = Math.max(0, Number(tuning.timer || 0));
    room.challengeTick = Math.max(0, Number(tuning.tick || 0));
    room.challengeData = { ...(room.challengeData || {}), runesLeft: runes.length, maxTimer: room.challengeTimer, spawnCount: Math.max(1, Number(tuning.spawnCount || 1)), targetClearRate: CHALLENGE_CLEAR_RATE_TARGETS.runes };
    return { ok: true, runes, timer: room.challengeTimer, tick: room.challengeTick };
  }

  function advanceCampaignRuneChallenge(room, deltaSeconds, options = {}) {
    if (!room || room.type !== 'challenge' || room.challengeType !== 'runes' || !room.challengeStarted || room.cleared) return { ok: false, spawnCount: 0, failed: false };
    const tuning = options.tuning || getCampaignChallengeTrialTuning('runes', options);
    const delta = Math.max(0, Number(deltaSeconds || 0));
    room.challengeTimer = Math.max(0, Number(room.challengeTimer || 0) - delta);
    room.challengeTick = Math.max(0, Number(room.challengeTick || 0) - delta);
    let spawnCount = 0;
    if (room.challengeTick <= 0) { room.challengeTick = Math.max(1.45, Number(tuning.tick || 2.5)); spawnCount = Math.max(1, Number(room.challengeData?.spawnCount || tuning.spawnCount || 1)); }
    return { ok: true, spawnCount, failed: room.challengeTimer <= 0, timer: room.challengeTimer };
  }

  function advanceCampaignChallengeRune(rune, target, deltaSeconds, options = {}) {
    if (!rune) return { ok: false };
    const width = Math.max(1, Number(options.width || 900)); const height = Math.max(1, Number(options.height || 700));
    const wall = Math.max(0, Number(options.wallThickness || 28)); const radius = Math.max(0, Number(options.radius || 16));
    const minX = wall + radius; const maxX = width - wall - radius; const minY = wall + radius; const maxY = height - wall - radius;
    let moveX = Number(rune.vx || 0); let moveY = Number(rune.vy || 0);
    const dx = Number(rune.x || 0) - Number(target?.x || 0); const dy = Number(rune.y || 0) - Number(target?.y || 0); const distance = Math.hypot(dx, dy);
    if (distance < 150 && distance > 0.001) { const speed = 250 + (1 - distance / 150) * 260; moveX += dx / distance * speed; moveY += dy / distance * speed; }
    const maxSpeed = Math.max(0, Number(options.playerMoveSpeed || 228) * 1.2); const speed = Math.hypot(moveX, moveY);
    if (speed > maxSpeed) { moveX *= maxSpeed / speed; moveY *= maxSpeed / speed; }
    const delta = Math.max(0, Number(deltaSeconds || 0)); rune.x = Number(rune.x || 0) + moveX * delta; rune.y = Number(rune.y || 0) + moveY * delta;
    if (rune.x <= minX || rune.x >= maxX) { rune.x = Math.max(minX, Math.min(maxX, rune.x)); rune.vx = -Number(rune.vx || 0); }
    if (rune.y <= minY || rune.y >= maxY) { rune.y = Math.max(minY, Math.min(maxY, rune.y)); rune.vy = -Number(rune.vy || 0); }
    return { ok: true, x: rune.x, y: rune.y, vx: rune.vx, vy: rune.vy };
  }

  function createCampaignBombSpawnPlan(options = {}) {
    const tutorial = !!options.tutorial;
    const safeCount = tutorial ? 2 : 3; const unsafeCount = tutorial ? 1 : 2;
    const flags = Array.from({ length: safeCount + unsafeCount }, (_, index) => index < safeCount);
    const random = typeof options.random === 'function' ? options.random : Math.random;
    for (let index = flags.length - 1; index > 0; index -= 1) { const other = Math.floor(Number(random()) * (index + 1)); [flags[index], flags[other]] = [flags[other], flags[index]]; }
    const width = Math.max(1, Number(options.width || 900)); const height = Math.max(1, Number(options.height || 700)); const margin = 90;
    return flags.map(safe => {
      const heading = Number(random()) * Math.PI * 2;
      return { type: 'challengeBomb', safe, x: margin + Number(random()) * (width - margin * 2), y: margin + Number(random()) * (height - margin * 2), vx: Math.cos(heading) * (tutorial ? 0 : 26), vy: Math.sin(heading) * (tutorial ? 0 : 26) };
    });
  }

  function startCampaignBombChallenge(room, options = {}) {
    if (!room || room.type !== 'challenge') return { ok: false, bombs: [] };
    const tuning = options.tuning || getCampaignChallengeTrialTuning('bomb', options);
    const bombs = createCampaignBombSpawnPlan(options);
    room.challengeTimer = Math.max(0, Number(tuning.timer || 0)); room.challengeTick = Math.max(0, Number(tuning.tick || 0));
    room.challengeData = { ...(room.challengeData || {}), maxTimer: room.challengeTimer, spawnCount: Math.max(1, Number(tuning.spawnCount || 1)), targetClearRate: CHALLENGE_CLEAR_RATE_TARGETS.bomb };
    return { ok: true, bombs, timer: room.challengeTimer, tick: room.challengeTick };
  }

  function advanceCampaignBombChallenge(room, deltaSeconds, options = {}) {
    if (!room || room.type !== 'challenge' || room.challengeType !== 'bomb' || !room.challengeStarted || room.cleared) return { ok: false, spawnCount: 0, failed: false };
    const tuning = options.tuning || getCampaignChallengeTrialTuning('bomb', options); const delta = Math.max(0, Number(deltaSeconds || 0));
    room.challengeTimer = Math.max(0, Number(room.challengeTimer || 0) - delta); room.challengeTick = Math.max(0, Number(room.challengeTick || 0) - delta);
    let spawnCount = 0; if (room.challengeTick <= 0) { room.challengeTick = Math.max(1.1, Number(tuning.tick || 1.8)); spawnCount = Math.max(1, Number(room.challengeData?.spawnCount || tuning.spawnCount || 1)); }
    return { ok: true, spawnCount, failed: room.challengeTimer <= 0, timer: room.challengeTimer };
  }

  function getCampaignStormStrikePoint(index, target, options = {}) {
    const width = Math.max(1, Number(options.width || 900));
    const height = Math.max(1, Number(options.height || 700));
    const margin = Math.max(0, Number(options.margin || 110));
    const leadSeconds = Math.max(0, Number(options.leadSeconds ?? 0.42));
    const player = target || {};
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
    const targetX = clamp(Number(player.x || width / 2) + Number(player.vx || 0) * leadSeconds, margin, width - margin);
    const targetY = clamp(Number(player.y || height / 2) + Number(player.vy || 0) * leadSeconds, margin, height - margin);
    if (Number(index) === 0) return { x: targetX, y: targetY };
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const angle = Number(random()) * Math.PI * 2;
    const distance = 90 + Number(random()) * 170;
    return {
      x: clamp(targetX + Math.cos(angle) * distance, margin, width - margin),
      y: clamp(targetY + Math.sin(angle) * distance, margin, height - margin),
    };
  }

  function startCampaignStormChallenge(room, options = {}) {
    if (!room || room.type !== 'challenge') return { ok: false, reason: 'INVALID_CHALLENGE_ROOM' };
    const tuning = options.tuning || getCampaignChallengeTrialTuning('storm', options);
    room.challengeTimer = Math.max(0, Number(tuning.timer || 0));
    room.challengeTick = Math.max(0, Number(tuning.tick || 0));
    room.challengeData = {
      ...(room.challengeData || {}),
      maxTimer: room.challengeTimer,
      burstCount: Math.max(2, Number(tuning.burstCount || 3)),
      targetClearRate: CHALLENGE_CLEAR_RATE_TARGETS.storm,
    };
    return { ok: true, timer: room.challengeTimer, tick: room.challengeTick, burstCount: room.challengeData.burstCount };
  }

  // Mutates only campaign room state and returns declarative strike positions.
  // The campaign creates its presentation hazards; authority materializes live
  // hazards from the exact same plan.
  function advanceCampaignStormChallenge(room, deltaSeconds, options = {}) {
    if (!room || room.type !== 'challenge' || room.challengeType !== 'storm' || !room.challengeStarted || room.cleared) {
      return { ok: false, reason: 'STORM_NOT_ACTIVE', strikes: [], complete: false };
    }
    const delta = Math.max(0, Number(deltaSeconds || 0));
    room.challengeTimer = Math.max(0, Number(room.challengeTimer || 0) - delta);
    room.challengeTick = Math.max(0, Number(room.challengeTick || 0) - delta);
    const strikes = [];
    if (room.challengeTick <= 0) {
      const tuning = options.tuning || getCampaignChallengeTrialTuning('storm', options);
      room.challengeTick = Math.max(0.64, Number(tuning.tick || 0.85));
      const burstCount = Math.max(2, Number(room.challengeData?.burstCount || tuning.burstCount || 3));
      for (let index = 0; index < burstCount; index += 1) {
        strikes.push(getCampaignStormStrikePoint(index, options.target, options));
      }
    }
    return { ok: true, strikes, complete: room.challengeTimer <= 0, timer: room.challengeTimer, nextTick: room.challengeTick };
  }

  function finishCampaignChallenge(room, outcome, options = {}) {
    if (!room || room.type !== 'challenge' || !['completed', 'failed'].includes(outcome)) {
      return { ok: false, reason: 'INVALID_CHALLENGE_OUTCOME' };
    }
    const challengeType = room.challengeType || 'mirror';
    const rewardKey = String(room.challengeData?.rewardKey || '');
    const completed = outcome === 'completed';
    room.cleared = true;
    room.challengeFailed = !completed;
    room.challengeRewardSpawned = completed ? !!room.challengeRewardSpawned : true;
    room.challengeTimer = 0;
    room.challengeTick = 0;
    room.challengeLifecycleState = outcome;
    room.challengeData = {};
    return {
      ok: true,
      type: completed ? 'CHALLENGE_COMPLETED' : 'CHALLENGE_FAILED',
      outcome,
      challengeType,
      achievementType: challengeType === 'stillness' ? 'circuit' : challengeType,
      text: String(options.text || (completed ? 'TRIAL CLEARED' : 'TRIAL FAILED')),
      rewardKey,
      removePickupTypes: CHALLENGE_PICKUP_TYPES.slice(),
      spawnReward: completed,
    };
  }

  // Campaign challenge completion is one transaction: it selects the relic (or
  // control scroll), creates the physical pickups, grants XP, and rolls an
  // unowned weapon. Both callers supply their canonical content rollers; this
  // operation owns the ordering and all authored reward amounts.
  function createCampaignChallengeRewardPlan(options = {}) {
    const floor = Math.max(1, Number(options.floorNumber || 1));
    const centerX = Number(options.centerX || 450);
    const centerY = Number(options.centerY || 350);
    const authoredRewardKey = String(options.authoredRewardKey || '');
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const scrollRandom = typeof options.scrollRandom === 'function' ? options.scrollRandom : random;
    const weaponRandom = typeof options.weaponRandom === 'function' ? options.weaponRandom : random;
    const rollEliteItem = typeof options.rollEliteItem === 'function' ? options.rollEliteItem : () => '';
    const rollScroll = typeof options.rollScroll === 'function' ? options.rollScroll : () => '';
    const scrollReward = !authoredRewardKey && floor > 3 && Number(scrollRandom()) < 0.2
      ? String(rollScroll(scrollRandom) || '') : '';
    const rewardKey = authoredRewardKey || scrollReward || String(rollEliteItem(random) || '');
    const weaponPool = Array.isArray(options.weaponPool) ? options.weaponPool : [];
    const ownedWeapons = options.ownedWeapons || {};
    const availableWeapons = weaponPool.filter(key => key && !ownedWeapons[key]);
    const weaponKey = availableWeapons.length
      ? String(availableWeapons[Math.max(0, Math.min(availableWeapons.length - 1, Math.floor(Number(weaponRandom()) * availableWeapons.length)))] || '')
      : '';
    return {
      ok: !!rewardKey,
      rewardKey,
      xp: 28 + floor * 5,
      weaponKey,
      pickups: [
        { type: 'item', key: rewardKey, x: centerX, y: centerY - 16 },
        { type: 'potion', x: centerX, y: centerY + 36 },
        { type: 'coin', amount: 75 + floor * 15, x: centerX, y: centerY + 4 },
      ],
    };
  }

  function resolveCampaignChallengePickup(room, pickup, options = {}) {
    if (!room || room.type !== 'challenge' || !room.challengeStarted || room.cleared || !pickup) {
      return { ok: false, reason: 'CHALLENGE_NOT_ACTIVE' };
    }
    room.challengeData = room.challengeData || {};
    if (pickup.type === 'challengeRune') {
      room.challengeData.runesLeft = Math.max(0, Number(room.challengeData.runesLeft || 1) - 1);
      const timerRefund = Math.max(0, Number(options.timerRefund ?? 2));
      room.challengeTimer = Number(room.challengeTimer || 0) + timerRefund;
      return { ok: true, type: 'CHALLENGE_RUNE_CLAIMED', removePickup: true, timerRefund, remaining: room.challengeData.runesLeft, complete: room.challengeData.runesLeft <= 0 };
    }
    if (pickup.type === 'challengeBomb') {
      if (pickup.safe) {
        const remaining = Math.max(0, Number(options.remainingSafeBombs || 0));
        return { ok: true, type: 'CHALLENGE_BOMB_DEFUSED', removePickup: true, remaining, complete: remaining <= 0 };
      }
      return {
        ok: true, type: 'CHALLENGE_BOMB_FAILED', removePickup: !!options.tutorial,
        fail: !options.tutorial, damage: options.tutorial ? 1 : Math.max(0, Number(options.damage || 28)),
        spawnFailureHazard: !options.tutorial,
      };
    }
    if (pickup.type === 'challengeSwitch') {
      const sequence = Array.isArray(room.challengeData.sequence) ? room.challengeData.sequence : [];
      const progress = Math.max(0, Number(room.challengeData.progress || 0));
      if (!Number.isInteger(pickup.switchIndex) || sequence.length === 0) return { ok: false, reason: 'INVALID_CHALLENGE_SWITCH' };
      pickup.armed = false;
      if (pickup.switchIndex === sequence[progress]) {
        room.challengeData.progress = progress + 1;
        room.challengeData.flash = 0.28;
        return { ok: true, type: 'CHALLENGE_SWITCH_CORRECT', progress: progress + 1, total: sequence.length, complete: progress + 1 >= sequence.length };
      }
      const penalty = Math.max(0, Number(room.challengeData.wrongPressPenalty || options.wrongPressPenalty || 2));
      room.challengeData.progress = 0;
      room.challengeData.wrongFlash = 0.5;
      room.challengeTimer = Math.max(0, Number(room.challengeTimer || 0) - penalty);
      return { ok: true, type: 'CHALLENGE_SWITCH_WRONG', progress: 0, total: sequence.length, penalty };
    }
    return { ok: false, reason: 'UNSUPPORTED_CHALLENGE_PICKUP' };
  }

  function updateCampaignGardenNode(room, node, elapsedSeconds) {
    if (!room || !node) return { ok: false, reason: 'INVALID_GARDEN_NODE' };
    room.pickups = Array.isArray(room.pickups) ? room.pickups : [];
    const active = room.pickups.some(pickup => ['apple', 'fruit'].includes(pickup?.type) && pickup.gardenNodeId === node.id);
    node.fruitSpawned = active;
    if (active || Number(elapsedSeconds || 0) < Number(node.respawnAt || 0)) return { ok: true, spawned: false };
    const pickup = {
      x: Number(node.x), y: Number(node.y) - 8, type: 'apple', heal: Number(node.heal || 20),
      gardenNodeId: node.id, roomGx: room.gx, roomGy: room.gy,
      respawnAt: Number(node.respawnAt || 0), grownAt: Number(elapsedSeconds || 0), ripe: true,
    };
    room.pickups.push(pickup);
    node.fruitSpawned = true;
    return { ok: true, spawned: true, pickup };
  }

  function collectCampaignGardenFruit(room, pickup, elapsedSeconds, options = {}) {
    const node = room?.gardenFruitNodes?.find(candidate => candidate?.id === pickup?.gardenNodeId);
    if (!node) return { ok: false, reason: 'GARDEN_NODE_NOT_FOUND' };
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const minimum = Math.max(0, Number(options.minimumRespawnSeconds ?? 12));
    const spread = Math.max(0, Number(options.respawnSpreadSeconds ?? 10));
    node.respawnAt = Number(elapsedSeconds || 0) + minimum + random() * spread;
    node.fruitSpawned = false;
    return { ok: true, type: 'GARDEN_FRUIT_COLLECTED', heal: Math.max(0, Number(pickup.heal || node.heal || 20)), respawnAt: node.respawnAt };
  }

  function advanceCampaignMovingWorldEntity(entity, deltaSeconds, bounds = {}) {
    if (!entity) return { ok: false, reason: 'INVALID_MOVING_ENTITY' };
    const dt = Math.max(0, Number(deltaSeconds || 0));
    const margin = Math.max(0, Number(bounds.margin || 0));
    const width = Math.max(margin * 2, Number(bounds.width || 900));
    const height = Math.max(margin * 2, Number(bounds.height || 700));
    entity.x = Number(entity.x || 0) + Number(entity.vx || 0) * dt;
    entity.y = Number(entity.y || 0) + Number(entity.vy || 0) * dt;
    let bouncedX = false;
    let bouncedY = false;
    if (entity.x < margin) { entity.x = margin; entity.vx = Math.abs(Number(entity.vx || 0)); bouncedX = true; }
    else if (entity.x > width - margin) { entity.x = width - margin; entity.vx = -Math.abs(Number(entity.vx || 0)); bouncedX = true; }
    if (entity.y < margin) { entity.y = margin; entity.vy = Math.abs(Number(entity.vy || 0)); bouncedY = true; }
    else if (entity.y > height - margin) { entity.y = height - margin; entity.vy = -Math.abs(Number(entity.vy || 0)); bouncedY = true; }
    return { ok: true, x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy, bouncedX, bouncedY };
  }

  function purchaseCampaignSecretVendor(state, room, player, offer) {
    if (!state || !room || !player || !offer || offer.type !== 'secretVendor' || offer.bought) return { ok: false, reason: 'INVALID_SECRET_VENDOR_OFFER' };
    const cost = Math.max(1, Number(offer.cost || 1));
    const usesCoins = offer.offerKind === 'xp';
    const wallet = usesCoins ? Number(player.coins || 0) : Number(state.loopCrystals ?? state.metaProgress?.loopCrystals ?? 0);
    if (wallet < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS', cost, usesCoins };
    if (usesCoins) player.coins = wallet - cost;
    else if (state.metaProgress) state.metaProgress.loopCrystals = wallet - cost;
    else state.loopCrystals = wallet - cost;
    offer.bought = true;
    const result = { ok: true, type: 'SECRET_VENDOR_PURCHASED', offerKind: offer.offerKind, cost, usesCoins, rewardKey: '' };
    if (offer.offerKind === 'relic') {
      result.rewardKey = String(offer.rewardKey || '');
      if (result.rewardKey) player.lastSecretVendorRewardKey = result.rewardKey;
    }
    else if (offer.offerKind === 'vitality') { player.maxHp = Number(player.maxHp || 0) + 20; result.heal = 60; }
    else if (offer.offerKind === 'xp') result.xp = Math.max(1, Number(offer.xpValue || 1));
    else result.coins = Math.max(0, Number(offer.coinValue || 90 + Number(state.floorNumber ?? state.floor ?? 1) * 12));
    room.secretVendorUsed = true;
    return result;
  }

  function rollDistinctCampaignReward(rollReward, previousRewardKey = '', maxRerolls = 6) {
    if (typeof rollReward !== 'function') return '';
    const previous = String(previousRewardKey || '');
    let rewardKey = rollReward();
    for (let attempt = 0; rewardKey === previous && attempt < maxRerolls; attempt += 1) rewardKey = rollReward();
    return rewardKey;
  }

  function createCampaignSecretRoomPlan(room, options = {}) {
    if (!room || room.type !== 'secret') return { ok: false, reason: 'INVALID_SECRET_ROOM', pickups: [] };
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const floor = Math.max(1, Number(options.floorNumber || 1));
    const maxFloor = Math.max(floor, Number(options.maxFloor || 10));
    const width = Math.max(1, Number(options.width || 900));
    const height = Math.max(1, Number(options.height || 700));
    const loopIndex = Math.max(0, Math.trunc(Number(options.runLoopIndex) || 0));
    const shuffle = values => {
      const result = values.slice();
      for (let index = result.length - 1; index > 0; index -= 1) {
        const other = Math.floor(Number(random()) * (index + 1));
        [result[index], result[other]] = [result[other], result[index]];
      }
      return result;
    };
    // A rare, free mystery blessing: the lady's question-mark box contains one
    // normally rolled item. Roll it during room construction so re-entering or
    // reconnecting cannot reroll the reward.
    if (Number(random()) < 0.05) {
      const rewardKey = String(options.rollItem?.(random) || options.rollEliteItem?.(random) || '');
      // Do not create an interaction that multiplayer cannot resolve if item
      // content is temporarily unavailable. Fall through to the normal room.
      if (rewardKey) {
        return {
          ok: true,
          secretKind: 'mystery_lady',
          pickups: [{ x: width / 2, y: height / 2, type: 'secretLady', rewardKey }],
        };
      }
    }
    const rollRewards = (count, elite = false) => {
      const rewards = [];
      let guard = 0;
      while (rewards.length < count && guard < count * 8) {
        guard += 1;
        const key = String((elite ? options.rollEliteItem?.(random) : options.rollItem?.(random)) || options.rollEliteItem?.(random) || '');
        if (key && !rewards.includes(key)) rewards.push(key);
      }
      return rewards;
    };
    if (room.secretKind === 'echo_cache') {
      const rewards = rollRewards(3, false);
      if (rewards.length) {
        const groupId = `echo-cache:${loopIndex}:${floor}`;
        return {
          ok: true,
          secretKind: 'echo_cache',
          pickups: rewards.map((key, index) => ({
            x: width / 2 + (index - (rewards.length - 1) / 2) * 110,
            y: height / 2 + (index === 1 ? -24 : 28),
            type: 'rewardChoice', key, groupId, picksRemaining: 1, label: '1/3', source: 'echo_cache',
          })),
        };
      }
    }
    if (room.secretKind === 'blood_forge') {
      const rewardKey = String(options.rollEliteItem?.(random) || '');
      const hpCost = Math.max(1, Math.min(3, 1 + Math.floor(loopIndex / 8)));
      return {
        ok: true,
        secretKind: 'blood_forge',
        pickups: [
          { x: width / 2 - 120, y: height / 2 + 34, type: 'secretVendor', offerKind: 'vitality', cost: hpCost, label: 'vitality' },
          { x: width / 2, y: height / 2 - 24, type: 'secretVendor', offerKind: 'relic', rewardKey, cost: Math.max(1, hpCost - 1), label: 'blood relic' },
          { x: width / 2 + 120, y: height / 2 + 34, type: 'secretVendor', offerKind: 'xp', cost: Math.max(20, Number(options.xpCost || 30)), xpValue: Math.max(80, Number(options.xpValue || 40) * 2), label: 'forbidden xp' },
        ],
      };
    }
    if (room.secretKind === 'time_capsule') {
      const direction = floor >= maxFloor - 2 ? -1 : 1;
      const distance = floor <= 2 || floor >= maxFloor - 2 ? 2 : (Number(random()) < 0.5 ? 2 : 3);
      const delta = direction * distance;
      return {
        ok: true,
        secretKind: 'time_capsule',
        pickups: [{ x: width / 2, y: height / 2, type: 'secretWarp', delta, targetFloor: Math.max(1, Math.min(maxFloor, floor + delta)), label: 'time capsule' }],
      };
    }
    if (room.secretKind === 'mimic_den') {
      return {
        ok: true,
        secretKind: 'mimic_den',
        pickups: [{
          x: width / 2, y: height / 2, type: 'secret_boss_chest',
          rewardKey: String(options.rollEliteItem?.(random) || ''),
          label: 'sleeping mimic',
        }],
      };
    }
    if (room.secretKind === 'star_shrine') {
      const rewardKey = String(options.rollEliteItem?.(random) || options.rollItem?.(random) || '');
      if (rewardKey) {
        return {
          ok: true,
          secretKind: 'star_shrine',
          pickups: [{ x: width / 2, y: height / 2, type: 'secretLady', rewardKey, label: 'fallen star' }],
        };
      }
    }
    if (room.secretKind === 'null_chamber') {
      const rewards = rollRewards(5, true);
      if (rewards.length) {
        const groupId = `null-chamber:${loopIndex}:${floor}`;
        const radius = 145;
        return {
          ok: true,
          secretKind: 'null_chamber',
          pickups: rewards.map((key, index) => {
            const angle = -Math.PI / 2 + index * Math.PI * 2 / rewards.length;
            return {
              x: width / 2 + Math.cos(angle) * radius,
              y: height / 2 + Math.sin(angle) * radius * 0.62,
              type: 'rewardChoice', key, groupId, picksRemaining: 2, label: '2/5', source: 'null_chamber',
            };
          }),
        };
      }
    }
    if (room.secretKind === 'warp') {
      const deltas = floor <= 2 ? [1, 2] : floor >= maxFloor - 1 ? [-2, -1] : [-2, -1, 1, 2];
      const delta = deltas[Math.floor(Number(random()) * deltas.length)] || 1;
      return { ok: true, secretKind: 'warp', pickups: [{ x: width / 2, y: height / 2, type: 'secretWarp', delta, targetFloor: Math.max(1, Math.min(maxFloor, floor + delta)) }] };
    }
    const regular = shuffle(['relic', 'vitality', 'wealth']);
    const kinds = shuffle(['xp', regular[0], regular[1]]);
    const positions = [[width / 2 - 110, height / 2 + 26], [width / 2, height / 2 - 18], [width / 2 + 110, height / 2 + 26]];
    const pickups = kinds.map((kind, index) => {
      const offer = { x: positions[index][0], y: positions[index][1], type: 'secretVendor', offerKind: kind, cost: kind === 'xp' ? Math.max(1, Number(options.xpCost || 30)) : kind === 'wealth' ? 2 : 1, label: kind };
      if (kind === 'relic') offer.rewardKey = String(rollDistinctCampaignReward(
        () => options.rollEliteItem?.(random) || '', options.previousRewardKey,
      ));
      if (kind === 'xp') offer.xpValue = Math.max(1, Number(options.xpValue || 40 + floor * 5));
      if (kind === 'wealth') offer.coinValue = 90 + floor * 12;
      return offer;
    });
    return { ok: true, secretKind: 'vendor', pickups };
  }

  function lootCampaignSecretBossChest(state, room, player, chest, options = {}) {
    if (!state || !room || !player || !chest || chest.type !== 'secret_boss_chest' || room.secretChestLooted) return { ok: false, reason: 'SECRET_CHEST_UNAVAILABLE' };
    room.secretChestLooted = true;
    const coins = Math.max(0, Number(options.coins ?? 60 + Number(state.floorNumber ?? state.floor ?? 1) * 8));
    return { ok: true, type: 'SECRET_BOSS_CHEST_LOOTED', rewardKey: String(options.rewardKey || chest.rewardKey || ''), coins };
  }

  function prepareCampaignBowmanBaneEscape(room, characterKey = '') {
    if (!room?.secret || room.secretKind !== 'bowman_bane' || characterKey !== 'thorn_knight') return { ok: false, reason: 'BANE_ESCAPE_UNAVAILABLE' };
    const passages = room.secretPassages || (room.secretPassages = {});
    if (room.baneEscapeDirection && passages[room.baneEscapeDirection]) return { ok: true, direction: room.baneEscapeDirection, created: false };
    const entrance = Object.entries(passages).find(([, passage]) => passage && !passage.baneEscape);
    if (!entrance) return { ok: false, reason: 'BANE_ENTRANCE_UNAVAILABLE' };
    const [entranceDirection, target] = entrance;
    const opposite = { n: 's', s: 'n', e: 'w', w: 'e' };
    const directions = ['n', 's', 'e', 'w'];
    const candidates = [opposite[entranceDirection], ...directions.filter(direction => direction !== entranceDirection)];
    const direction = candidates.find(candidate => candidate && candidate !== entranceDirection && !room.doors?.[candidate] && !passages[candidate]);
    if (!direction) return { ok: false, reason: 'BANE_ESCAPE_DIRECTION_UNAVAILABLE' };
    room.baneEntranceDirection = entranceDirection;
    room.baneEscapeDirection = direction;
    room.baneEscapeRevealed = false;
    passages[direction] = { targetGx: target.targetGx, targetGy: target.targetGy, open: false, baneEscape: true };
    return { ok: true, direction, created: true };
  }

  function revealCampaignBowmanBaneEscape(room, characterKey = '') {
    const prepared = prepareCampaignBowmanBaneEscape(room, characterKey);
    if (!prepared.ok) return prepared;
    Object.entries(room.secretPassages || {}).forEach(([direction, passage]) => {
      if (direction !== prepared.direction && passage?.open) passage.open = false;
    });
    room.secretPassages[prepared.direction].open = true;
    room.baneEscapeRevealed = true;
    return { ...prepared, revealed: true };
  }

  function useCampaignLadder(runState, options = {}) {
    if (!runState) return { ok: false, reason: 'INVALID_RUN' };
    const floor = Math.max(1, Number(runState.floorNumber ?? runState.floor ?? 1));
    const maxFloor = Math.max(floor, Number(options.maxFloor || 10));
    if (options.gameMode === 'treasure_hunt' && floor >= maxFloor) return { ok: true, type: 'RUN_WON', floorNumber: floor };
    const nextFloor = Math.min(maxFloor, floor + 1);
    if ('floorNumber' in runState) runState.floorNumber = nextFloor;
    if ('floor' in runState) runState.floor = nextFloor;
    return { ok: true, type: 'LADDER_USED', previousFloor: floor, floorNumber: nextFloor };
  }

  return {
    CHALLENGE_PICKUP_TYPES,
    CAMPAIGN_CHALLENGE_TYPES,
    CHALLENGE_CLEAR_RATE_TARGETS,
    CHALLENGE_CIRCUIT_SWITCHES,
    rollCampaignChallengeType,
    getCampaignChallengeTrialTuning,
    createCampaignCircuitSequence,
    startCampaignCircuitChallenge,
    advanceCampaignCircuitChallenge,
    getCampaignChallengeObeliskMaxHp,
    createCampaignTrialEnemyWavePlan,
    startCampaignSurvivalChallenge,
    advanceCampaignSurvivalChallenge,
    applyCampaignObeliskSeekerSteering,
    createCampaignRuneSpawnPlan,
    startCampaignRuneChallenge,
    advanceCampaignRuneChallenge,
    advanceCampaignChallengeRune,
    createCampaignBombSpawnPlan,
    startCampaignBombChallenge,
    advanceCampaignBombChallenge,
    getCampaignStormStrikePoint,
    startCampaignStormChallenge,
    advanceCampaignStormChallenge,
    finishCampaignChallenge,
    createCampaignChallengeRewardPlan,
    resolveCampaignChallengePickup,
    updateCampaignGardenNode,
    collectCampaignGardenFruit,
    advanceCampaignMovingWorldEntity,
    purchaseCampaignSecretVendor,
    rollDistinctCampaignReward,
    createCampaignSecretRoomPlan,
    lootCampaignSecretBossChest,
    prepareCampaignBowmanBaneEscape,
    revealCampaignBowmanBaneEscape,
    useCampaignLadder,
  };
});
