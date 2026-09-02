// enemies.js — standalone IIFE. Enemy spawning, AI, boss logic.

  const BREAKABLE_OBSTACLE_KINDS = new Set(['cover_wall', 'wall', 'secret_wall']);
  const MINOR_PACK_ENEMY_TYPES = new Set(['hunter', 'charger', 'laser', 'cult_follower']);
  const MINOR_PACK_RADIUS = 260;
  const MINOR_PACK_MAX_ALLIES = 3;
  const BULK_GOLEM_KNOCKBACK_MULTIPLIER = Number(
    globalThis.NeoNyke?.simulation?.BULK_GOLEM_KNOCKBACK_MULTIPLIER || 3,
  );

  function updateMinorEnemyPackPressure(enemy) {
    const eligible = enemy
      && MINOR_PACK_ENEMY_TYPES.has(enemy.type)
      && !enemy.elite
      && !enemy.miniBoss
      && !enemy.dead;
    if (!eligible) {
      if (enemy) {
        enemy.minorPackStacks = 0;
        enemy.minorPackSpeedMultiplier = 1;
        enemy.minorPackCooldownRate = 1;
        enemy.minorPackDamageMultiplier = 1;
      }
      return 0;
    }

    let nearbyAllies = 0;
    // Query the shared enemy spatial index (radius is small relative to the room,
    // so this visits only nearby cells instead of every enemy — O(N·k) total over
    // the loop instead of O(N²)). When no index is available for this frame the
    // helper falls back to a fresh build; that's the same cost the old nested loop
    // paid, so we never regress.
    const visitAlly = ally => {
      if (nearbyAllies >= MINOR_PACK_MAX_ALLIES
        || ally === enemy
        || !ally
        || ally.dead
        || ally.elite
        || ally.miniBoss
        || Number(ally.spawnT || 0) > 0
        || !MINOR_PACK_ENEMY_TYPES.has(ally.type)) {
        return;
      }
      // forEachEnemyNearCircle bounds the search by cell, so re-check the exact
      // circle radius (cells are square and slightly larger than the radius).
      if (Neo.dist(enemy.x, enemy.y, ally.x, ally.y) <= MINOR_PACK_RADIUS) nearbyAllies += 1;
    };
    if (typeof Neo.forEachEnemyNearCircle === 'function') {
      Neo.forEachEnemyNearCircle(enemy.x, enemy.y, MINOR_PACK_RADIUS, visitAlly, { excludeEnemy: enemy });
    } else {
      for (const ally of Neo.enemies || []) {
        if (nearbyAllies >= MINOR_PACK_MAX_ALLIES) break;
        visitAlly(ally);
      }
    }

    const stacks = Math.min(MINOR_PACK_MAX_ALLIES, nearbyAllies);
    enemy.minorPackStacks = stacks;
    enemy.minorPackSpeedMultiplier = 1 + stacks * 0.04;
    enemy.minorPackCooldownRate = 1 + stacks * 0.06;
    enemy.minorPackDamageMultiplier = 1 + stacks * 0.03;
    return stacks;
  }

  function findSafeEnemySpawnPoint(preferredX, preferredY, radius = 18) {
    const isSpawnUsable = (x, y) => !Neo.isBlocked(x, y, radius) && hasNavigableSpawnSpace(x, y, radius, Neo.player);
    if (isSpawnUsable(preferredX, preferredY)) {
      return { x: preferredX, y: preferredY };
    }
    
    const searchAngles = 16;
    const maxAttempts = 40;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = (attempt / searchAngles) * Math.PI * 2;
      const searchRadius = 30 + (attempt % 4) * 40;
      const x = Neo.clamp(preferredX + Math.cos(angle) * searchRadius, Neo.WALL + radius, Neo.ROOM_W - Neo.WALL - radius);
      const y = Neo.clamp(preferredY + Math.sin(angle) * searchRadius, Neo.WALL + radius, Neo.ROOM_H - Neo.WALL - radius);
      if (isSpawnUsable(x, y)) {
        return { x, y };
      }
    }
    
    return null;
  }

  // Margin keeping summoned minions clear of the room edge, and the spawn-clearance
  // radius used when validating their landing spot.
  const SUMMON_SPAWN_MARGIN = 90;
  const SUMMON_SPAWN_RADIUS = 15;

  // Clamp a desired summon position inside the safe interior, then resolve it to a
  // usable spawn point. Shared by the minion-summoning enemies.
  function findSafeSummonSpawnPoint(px, py) {
    return findSafeEnemySpawnPoint(
      Neo.clamp(px, SUMMON_SPAWN_MARGIN, Neo.ROOM_W - SUMMON_SPAWN_MARGIN),
      Neo.clamp(py, SUMMON_SPAWN_MARGIN, Neo.ROOM_H - SUMMON_SPAWN_MARGIN),
      SUMMON_SPAWN_RADIUS,
    );
  }

  // Reuse the authority-safe signature controller in campaign play. Only the
  // world adapters differ; move thresholds and attack payloads stay shared.
  const npcSignatureController = globalThis.NeoNyke?.simulation?.createCampaignEnemyBehaviors?.({
    getPlayer: () => Neo.player,
    getTuning: () => Neo.getEnemyDifficultyTuning(),
    scaleEnemyLaserDamage: damage => Neo.scaleEnemyLaserDamage(damage),
    random: scope => Neo.nextRandom(scope || 'encounter'),
    spawnProjectile(enemy, descriptor) {
      Neo.spawnProjectile({
        ...descriptor,
        enemy: true,
        owner: enemy,
        source: descriptor.source || descriptor.kind || enemy.type,
      });
    },
    spawnMinion(enemy, type, x, y) {
      const safeSpawn = findSafeSummonSpawnPoint(x, y);
      if (safeSpawn) spawnEnemy(type, safeSpawn.x, safeSpawn.y, false, { level: enemy.level });
    },
    spawnHazard(enemy, hazard) {
      Neo.hazards.push({ ...hazard, ownerEnemy: enemy });
    },
    grantBarrier(_enemy, target, amount) {
      target.barrier = Math.max(Number(target.barrier || 0), Math.max(0, Math.round(Number(amount || 0))));
      target.barrierAge = 0;
    },
    emit(eventType, data) {
      if (eventType !== 'ENEMY_TELEGRAPH') return;
      const enemy = Neo.enemies.find(candidate => candidate?.id === data?.enemyId);
      if (!enemy) return;
      const label = Neo.MOVE_DEFS?.[data.attackKind]?.name || String(data.attackKind || 'SIGNATURE');
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 14, life: 0.55, text: label.toUpperCase(), c: '#f4d7ff' });
      Neo.ringBurst(enemy.x, enemy.y, enemy.r + 24, '#c68cff', 0.35);
    },
  });

  function withNpcEnemySignatures(update) {
    return (enemy, dt) => {
      if (npcSignatureController?.updateNpcEnemySignatureMoves?.(enemy, dt)) return;
      update(enemy, dt);
    };
  }

  function compactEnemyList() {
    if (!Array.isArray(Neo.enemies) || Neo.enemies.length === 0) return;
    const frame = Number(Neo.simulationTick || 0);
    const nextScanFrame = Number(Neo._nextEnemyCompactionScanFrame || 0);
    if (frame < nextScanFrame) return;
    Neo._nextEnemyCompactionScanFrame = frame + 4;
    let needsCompaction = false;
    for (let index = 0; index < Neo.enemies.length; index += 1) {
      const enemy = Neo.enemies[index];
      if (!enemy || typeof enemy !== 'object') {
        needsCompaction = true;
        break;
      }
    }
    if (!needsCompaction) return;
    const before = Neo.enemies.length;
    Neo.enemies = Neo.enemies.filter(enemy => enemy && typeof enemy === 'object');
    if (Neo.enemies.length !== before) {
      Neo._nextEnemyCompactionScanFrame = frame + 1;
      Neo.syncCurrentRoomState();
    }
  }

  let _coverObstacleCache = null;
  let _coverObstacleFrame = -1;
  function getCoverObstacles() {
    // Cover geometry only changes when a wall breaks, which already happens via
    // gameplay events — not within a single frame. Rebuilding the rect list once
    // per frame (instead of once per ranged enemy per LOS check) cuts the
    // allocation + map/forEach work by ~10x with a roomful of shooters.
    const frame = Number(Neo.simulationTick || 0);
    if (_coverObstacleFrame === frame && _coverObstacleCache) return _coverObstacleCache;
    const obstacleRects = Neo.structures.map(structure => Neo.getStructureCollisionRect(structure));
    Neo.destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      if (prop.kind !== 'wall' && prop.kind !== 'secret_wall' && prop.kind !== 'cover_wall') return;
      obstacleRects.push(Neo.getDestructibleRect(prop));
    });
    _coverObstacleCache = obstacleRects;
    _coverObstacleFrame = frame;
    return obstacleRects;
  }

  function lineIntersectsRect(x1, y1, x2, y2, rect, padding = 0) {
    const minX = rect.x - padding;
    const minY = rect.y - padding;
    const maxX = rect.x + rect.w + padding;
    const maxY = rect.y + rect.h + padding;
    const dx = x2 - x1;
    const dy = y2 - y1;
    let t0 = 0;
    let t1 = 1;
    const checks = [
      [-dx, x1 - minX],
      [dx, maxX - x1],
      [-dy, y1 - minY],
      [dy, maxY - y1],
    ];
    for (const [p, q] of checks) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const ratio = q / p;
      if (p < 0) {
        if (ratio > t1) return false;
        if (ratio > t0) t0 = ratio;
      } else {
        if (ratio < t0) return false;
        if (ratio < t1) t1 = ratio;
      }
    }
    return true;
  }

  function hasLineOfSight(ax, ay, bx, by) {
    return !getCoverObstacles().some(rect => lineIntersectsRect(ax, ay, bx, by, rect, 3));
  }

  function findEnemyCoverTarget(enemy, preferredRange = 250) {
    if (!enemy || !Neo.player) return null;
    const obstacles = getCoverObstacles();
    if (!obstacles.length) return null;
    let best = null;
    obstacles.forEach(rect => {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const awayX = cx - Neo.player.x;
      const awayY = cy - Neo.player.y;
      const awayLength = Math.hypot(awayX, awayY) || 1;
      const nx = awayX / awayLength;
      const ny = awayY / awayLength;
      const px = -ny;
      const py = nx;
      const baseOffset = Math.max(rect.w, rect.h) * 0.55 + enemy.r + 18;
      const sideOffset = Math.min(Math.max(rect.w, rect.h) * 0.32, 22);
      [
        { side: 0, depth: baseOffset },
        { side: sideOffset, depth: baseOffset + 8 },
        { side: -sideOffset, depth: baseOffset + 8 },
      ].forEach(sample => {
        const targetX = Neo.clamp(cx + nx * sample.depth + px * sample.side, Neo.WALL + enemy.r, Neo.ROOM_W - Neo.WALL - enemy.r);
        const targetY = Neo.clamp(cy + ny * sample.depth + py * sample.side, Neo.WALL + enemy.r, Neo.ROOM_H - Neo.WALL - enemy.r);
        if (Neo.isBlocked(targetX, targetY, enemy.r)) return;
        if (!lineIntersectsRect(Neo.player.x, Neo.player.y, targetX, targetY, rect, 6)) return;
        const enemyDistance = Neo.dist(enemy.x, enemy.y, targetX, targetY);
        const playerDistance = Neo.dist(Neo.player.x, Neo.player.y, targetX, targetY);
        if (enemyDistance > 360) return;
        const score = enemyDistance + Math.abs(playerDistance - preferredRange) * 0.55;
        if (!best || score < best.score) {
          best = { x: targetX, y: targetY, score };
        }
      });
    });
    return best;
  }

  function trySteerEnemyToCover(enemy, dt, preferredRange = 250, accel = 3.2) {
    if (!enemy || !Neo.player) return false;
    enemy.coverCheckCd = Math.max(0, Number(enemy.coverCheckCd || 0) - dt);
    const hasSight = hasLineOfSight(enemy.x, enemy.y, Neo.player.x, Neo.player.y);
    const coverTarget = enemy.coverTarget;
    const needsNewTarget = !coverTarget
      || enemy.coverCheckCd <= 0
      || Neo.dist(enemy.x, enemy.y, coverTarget.x, coverTarget.y) < 18
      || !hasSight;
    if (needsNewTarget) {
      enemy.coverCheckCd = 0.35;
      enemy.coverTarget = hasSight ? findEnemyCoverTarget(enemy, preferredRange) : null;
    }
    if (!enemy.coverTarget) return false;
    const dx = enemy.coverTarget.x - enemy.x;
    const dy = enemy.coverTarget.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance < 16) {
      enemy.vx *= 0.8;
      enemy.vy *= 0.8;
      return true;
    }
    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, accel, dt);
    return true;
  }

  function hasNavigableSpawnSpace(x, y, radius, target = Neo.player) {
    const probeStep = Math.max(18, radius + 10);
    const directions = 8;
    let openPaths = 0;
    let hasProgressTowardTarget = !target;
    const targetDistance = target ? Neo.dist(x, y, target.x, target.y) : 0;

    for (let index = 0; index < directions; index += 1) {
      const angle = (index / directions) * Math.PI * 2;
      const px = x + Math.cos(angle) * probeStep;
      const py = y + Math.sin(angle) * probeStep;
      if (Neo.isBlocked(px, py, radius)) continue;
      openPaths += 1;
      if (target && Neo.dist(px, py, target.x, target.y) < targetDistance - 2) {
        hasProgressTowardTarget = true;
      }
    }

    return openPaths >= 2 && hasProgressTowardTarget;
  }

  function findBlockingBreakableDestructible(x, y, r) {
    return Neo.destructibles.find(prop => {
      if (!prop || prop.broken || prop.hidden) return false;
      if (!BREAKABLE_OBSTACLE_KINDS.has(prop.kind)) return false;
      return Neo.destructibleIntersectsCircle(prop, x, y, r);
    }) || null;
  }

  function enemyTryBreakBlockingObstacle(enemy, dt) {
    if (!enemy || enemy.stun > 0) return;
    enemy.obstacleHitCd = Math.max(0, Number(enemy.obstacleHitCd || 0) - dt);
    if (enemy.obstacleHitCd > 0) return;

    const speed = Math.hypot(Number(enemy.vx || 0), Number(enemy.vy || 0));
    let dirX = speed > 4 ? enemy.vx / speed : 0;
    let dirY = speed > 4 ? enemy.vy / speed : 0;
    if ((Math.abs(dirX) + Math.abs(dirY)) < 0.05 && Neo.player) {
      const dx = Neo.player.x - enemy.x;
      const dy = Neo.player.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      dirX = dx / d;
      dirY = dy / d;
    }

    const probeDistance = Math.max(enemy.r + 10, 22);
    const probeX = enemy.x + dirX * probeDistance;
    const probeY = enemy.y + dirY * probeDistance;
    let blocker = findBlockingBreakableDestructible(probeX, probeY, Math.max(10, enemy.r * 0.92));
    if (!blocker) {
      blocker = findBlockingBreakableDestructible(enemy.x, enemy.y, enemy.r + 3);
    }
    if (!blocker) return;

    const baseDamage = Math.max(1, Math.round((enemy.dmg || 10) / 14));
    const heavyBonus = enemy.type === 'golem' || enemy.type === 'bulk_golem' || enemy.type === 'charger' ? 1 : 0;
    Neo.damageDestructible(blocker, baseDamage + heavyBonus);
    enemy.obstacleHitCd = heavyBonus ? 0.22 : 0.38;
  }

  function getMiniBossSpawnChance(roomType = 'combat') {
    if (Neo.floor < 5) return 0;
    const difficulty = Neo.getDifficultyDef();
    const baseChance = Neo.clamp(0.08 + (Neo.floor - 5) * 0.02, 0.08, 0.34);
    const scaledChance = baseChance * difficulty.miniBossChanceMultiplier;
    if (roomType === 'ladder') return Math.min(0.95, scaledChance * 3);
    return Math.min(0.8, scaledChance);
  }

  function getWaveCount(baseOffset) {
    return globalThis.NeoNyke.simulation.getCampaignWaveCount(
      Neo.floor,
      baseOffset,
      Neo.getDifficultyDef(),
      Neo.isChallengeActive('swarm_rooms') ? 2 : 0,
      () => Neo.nextRandom('encounter'),
    );
  }

  function rollEnemyType() {
    return globalThis.NeoNyke.simulation.rollCampaignEnemyType(
      Neo.floor,
      Neo.getDifficultyDef().roomWeightBonus,
      () => Neo.nextRandom('encounter'),
    );
  }

  function getFloorBossType() {
    const bossRandom = Neo.createScopedRandom('floor-boss:type');
    return globalThis.NeoNyke.simulation.getCampaignFloorBossType(Neo.floor, bossRandom);
  }

  function rollChallengeTrialType(room = Neo.currentRoom) {
    const random = room ? Neo.createRoomRandom(room, 'challenge:type') : () => Neo.nextRandom('world');
    return globalThis.NeoNyke.simulation.rollCampaignChallengeType(Neo.floor, random);
  }

  function getChallengeTrialLabel(type) {
    if (type === 'mirror') return 'MIRROR';
    if (type === 'circuit' || type === 'stillness') return 'CIRCUIT';
    if (type === 'bomb') return 'BOMB';
    if (type === 'survival') return 'PROTECT';
    if (type === 'runes') return 'RUNES';
    if (type === 'storm') return 'STORM';
    return 'TRIAL';
  }

  const CHALLENGE_CLEAR_RATE_TARGETS = {
    bomb: { min: 0.55, max: 0.65 },
    survival: { min: 0.6, max: 0.7 },
    runes: { min: 0.5, max: 0.6 },
    storm: { min: 0.45, max: 0.55 },
    mirror: { min: 0.5, max: 0.6 },
    circuit: { min: 0.45, max: 0.6 },
  };

  function getChallengeTrialTuning(type) {
    const floor = Math.max(1, Number(Neo.floor || 1));
    if (type === 'bomb') {
      const resolver = globalThis.NeoNyke?.simulation?.getCampaignChallengeTrialTuning;
      if (typeof resolver === 'function') return resolver('bomb', { floorNumber: floor, scaleTimer: Neo.scaleChallengeTimer });
      return { timer: Neo.scaleChallengeTimer(17), tick: Math.max(1.2, 2.4 - floor * 0.1), spawnCount: floor >= 7 ? 2 : 1 };
    }
    if (type === 'storm') {
      return globalThis.NeoNyke.simulation.getCampaignChallengeTrialTuning('storm', {
        floorNumber: floor,
        scaleEnduranceTimer: Neo.scaleChallengeEnduranceTimer,
      });
    }
    if (type === 'survival') {
      return globalThis.NeoNyke.simulation.getCampaignChallengeTrialTuning('survival', {
        floorNumber: floor,
        scaleEnduranceTimer: Neo.scaleChallengeEnduranceTimer,
      });
    }
    if (type === 'runes') {
      const resolver = globalThis.NeoNyke?.simulation?.getCampaignChallengeTrialTuning;
      if (typeof resolver === 'function') return resolver('runes', { floorNumber: floor, scaleTimer: Neo.scaleChallengeTimer });
      return { timer: Neo.scaleChallengeTimer(20), tick: Math.max(2.0, 2.9 - floor * 0.06), spawnCount: 1 };
    }
    if (type === 'circuit' || type === 'stillness') {
      const resolver = globalThis.NeoNyke?.simulation?.getCampaignChallengeTrialTuning;
      if (typeof resolver === 'function') {
        return resolver('circuit', {
          scaleTimer: Neo.scaleChallengeTimer,
          difficultyStatMultiplier: Neo.getDifficultyDef()?.statMultiplier,
        });
      }
      return { timer: Neo.scaleChallengeTimer(18), sequenceLength: 4, wrongPressPenalty: 2 };
    }
    return {};
  }

  function getStormChallengeStrikePoint(index) {
    const resolver = globalThis.NeoNyke?.simulation?.getCampaignStormStrikePoint;
    if (typeof resolver === 'function') {
      return resolver(index, Neo.player, {
        width: Neo.ROOM_W, height: Neo.ROOM_H, random: () => Neo.nextRandom('world'),
      });
    }
    // Kept as a narrow standalone fallback for legacy embedding/tests that
    // evaluate this campaign helper before the shared simulation namespace.
    const margin = 110;
    const leadSeconds = 0.42;
    const targetX = Neo.clamp(Number(Neo.player?.x || 0) + Number(Neo.player?.vx || 0) * leadSeconds, margin, Neo.ROOM_W - margin);
    const targetY = Neo.clamp(Number(Neo.player?.y || 0) + Number(Neo.player?.vy || 0) * leadSeconds, margin, Neo.ROOM_H - margin);
    if (index === 0) return { x: targetX, y: targetY };
    const angle = Neo.nextRandom('world') * Math.PI * 2;
    const distance = 90 + Neo.nextRandom('world') * 170;
    return { x: Neo.clamp(targetX + Math.cos(angle) * distance, margin, Neo.ROOM_W - margin), y: Neo.clamp(targetY + Math.sin(angle) * distance, margin, Neo.ROOM_H - margin) };
  }

  // Obelisk HP scales with floor only. It used to also divide by the game
  // difficulty's statMultiplier, which meant harder difficulties shrank the
  // obelisk's HP pool on top of the adds already hitting faster/harder from
  // difficulty scaling elsewhere — a double penalty. Difficulty pressure now
  // comes entirely from the enemy side (spawn density, drain-per-attacker),
  // leaving the obelisk's own HP a stable, floor-only curve.
  function getChallengeObeliskMaxHp(floorValue = Neo.floor) {
    return globalThis.NeoNyke.simulation.getCampaignChallengeObeliskMaxHp(floorValue);
  }

  function buildWavePlan(count, roomType = 'combat') {
    return globalThis.NeoNyke.simulation.buildCampaignWavePlan(count, {
      floorNumber: Neo.floor,
      roomType,
      roomWeightBonus: Neo.getDifficultyDef().roomWeightBonus,
      random: {
        next: () => Neo.nextRandom('encounter'),
        int: (min, max) => Neo.irand(min, max, 'encounter'),
      },
    });
  }

  function spawnMiniBoss(roomType = 'combat') {
    const chance = getMiniBossSpawnChance(roomType);
    const miniBossRandom = Neo.createRoomRandom(Neo.currentRoom, `mini-boss:${roomType}`);
    if (chance <= 0 || miniBossRandom() > chance) return;

    const pool = roomType === 'ladder'
      ? ['golem', 'knave', 'cult_mage', 'sniper']
      : ['knave', 'cult_mage', 'sniper', 'golem'];
    const type = pool[Math.floor(miniBossRandom() * pool.length)] || pool[0];
    const angle = miniBossRandom() * Math.PI * 2;
    const radius = 120 + miniBossRandom() * 180;
    const x = Neo.clamp(Neo.ROOM_W / 2 + Math.cos(angle) * radius, 80, Neo.ROOM_W - 80);
    const y = Neo.clamp(Neo.ROOM_H / 2 + Math.sin(angle) * radius, 80, Neo.ROOM_H - 80);
    const safeSpawn = findSafeEnemySpawnPoint(x, y, 18);
    if (!safeSpawn) return;

    const miniBoss = spawnEnemy(type, safeSpawn.x, safeSpawn.y, canSpawnEliteEnemies());
    miniBoss.hp = Math.round(miniBoss.hp * 1.9);
    miniBoss.speed *= 0.94;
    miniBoss.r = Math.round(miniBoss.r * 1.08);
    miniBoss.miniBoss = true;
    Neo.spawnParticle({ x: miniBoss.x, y: miniBoss.y - 26, life: 0.7, text: 'MINI BOSS', c: '#ffb347' });
  }

  function spawnWave(count, roomType = 'combat', options = {}) {
    // Optional template-authored encounter (see roomTemplates.js spawnHint). When
    // absent, every branch below collapses to the original behaviour and draws the
    // exact same 'encounter' RNG sequence, so non-hinted rooms are unchanged.
    const hint = options.ignoreSpawnHint ? null : ((Neo.currentRoom && Neo.currentRoom.spawnHint) || null);
    const effectiveCount = hint && Number.isFinite(hint.count) ? Math.max(1, Math.floor(hint.count)) : count;
    const plan = hint && Array.isArray(hint.types) && hint.types.length
      ? buildHintedWavePlan(effectiveCount, hint.types)
      : buildWavePlan(effectiveCount, roomType);
    const chambers = hint && hint.inChambers && Array.isArray(Neo.currentRoom.layoutChambers) && Neo.currentRoom.layoutChambers.length
      ? Neo.currentRoom.layoutChambers
      : null;

    for (let index = 0; index < plan.length; index += 1) {
      const type = plan[index] || rollEnemyType();
      const eliteChance = Neo.getDifficultyDef().eliteChance
        + (Neo.isChallengeActive('elite_hunt') ? 0.18 : 0)
        + getEliteLoopBonus();
      const baseElite = options.forceElite
        ? true
        : !options.suppressElite && canSpawnEliteEnemies() && Neo.nextRandom('encounter') < Math.min(0.85, eliteChance);
      const eliteRoll = options.forceElite ? true : (hint && hint.elite) ? canSpawnEliteEnemies() : baseElite;
      const angle = Neo.nextRandom('encounter') * Math.PI * 2;
      const radius = 140 + Neo.nextRandom('encounter') * 170;
      // Preferred point: inside a designated chamber when the template asks for it,
      // otherwise the original centre-ring placement. The two RNG draws above are
      // always consumed (identical order) so chamber mode doesn't desync the stream.
      let preferredX = Neo.clamp(Neo.ROOM_W / 2 + Math.cos(angle) * radius, 90, Neo.ROOM_W - 90);
      let preferredY = Neo.clamp(Neo.ROOM_H / 2 + Math.sin(angle) * radius, 90, Neo.ROOM_H - 90);
      if (chambers) {
        const chamber = chambers[index % chambers.length];
        preferredX = Neo.clamp(chamber.x + Math.cos(angle) * Math.min(radius, chamber.w / 2 - 24), 90, Neo.ROOM_W - 90);
        preferredY = Neo.clamp(chamber.y + Math.sin(angle) * Math.min(radius, chamber.h / 2 - 24), 90, Neo.ROOM_H - 90);
      }
      const safeSpawn = findSafeEnemySpawnPoint(preferredX, preferredY, 15)
        || findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 15);
      if (!safeSpawn) continue;
      // Deep-loop danger: a regular wave enemy can spawn as a random boss instead
      // (loop 5+, see rollWaveBossUpgrade). A boss-upgraded spawn is never also an
      // elite — boss stat code handles its scaling on its own.
      const bossUpgrade = options.forceElite || options.suppressBossUpgrade ? null : rollWaveBossUpgrade(type);
      if (bossUpgrade) {
        spawnEnemy(bossUpgrade, safeSpawn.x, safeSpawn.y, false);
      } else {
        spawnEnemy(type, safeSpawn.x, safeSpawn.y, eliteRoll, { forceElite: !!options.forceElite });
      }
    }
    if (!options.suppressMiniBoss) spawnMiniBoss(roomType);
  }

  // Builds a wave plan from a template-authored type pool, cycling through the
  // listed types so the designer controls the composition. Unknown types fall
  // through to rollEnemyType at spawn time (the `|| rollEnemyType()` guard above).
  function buildHintedWavePlan(count, types) {
    const plan = [];
    for (let index = 0; index < count; index += 1) {
      plan.push(types[index % types.length]);
    }
    return plan;
  }

  function spawnFloorBoss() {
    const bossType = getFloorBossType();
    const safeSpawn = findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2 - 40, 15);
    if (!safeSpawn) return null;
    const boss = spawnEnemy(bossType, safeSpawn.x, safeSpawn.y, false);
    const playedCutscene = tryPlayBossIntroCutscene(boss, bossType);
    const line = Neo.BOSS_OPENING_DIALOGUE[bossType];
    if (!playedCutscene && boss && line) sayOverEntity(boss, line);
    return boss;
  }

  // True when an endless wave should be a boss encounter (every 10th wave).
  function isEndlessBossWave(waveNumber) {
    return Number(waveNumber) > 0 && Number(waveNumber) % 10 === 0;
  }

  // Spawns the enemies for a single endless wave. `waveNumber` is the wave the
  // player is about to fight (1-based). Every 10th wave is a boss wave (the
  // floor boss plus a small honor-guard pack); other waves spawn a normal wave
  // of the given size. Centralized so the first-wave (rooms.js) and respawn
  // (combat.js) paths stay in sync.
  function spawnEndlessWave(waveNumber, count) {
    if (isEndlessBossWave(waveNumber)) {
      spawnFloorBoss();
      // A handful of adds so the boss room isn't a pure duel.
      spawnWave(Math.min(2 + Math.floor(waveNumber / 10), 6), 'combat');
      Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 70, life: 1.6, text: 'BOSS WAVE', c: '#ff5a5a' });
      return;
    }
    spawnWave(count, 'combat');
  }

  function getEnemyDifficultyMultiplier() {
    const gameMinutes = Neo.gameElapsedTime / 60;
    return 1 + gameMinutes * Neo.floor * 0.15;
  }

  function canSpawnEliteEnemies() {
    // Endless mode pins floor at 1, so the floor-based gate never opens. Gate on
    // the wave counter instead: elites start appearing once a few waves are done.
    if (Neo.gameMode === 'endless') return Number(Neo.endlessWave || 0) >= 2;
    // Elites normally only show up in the last floors of a loop (>= eliteFloor).
    // Deeper loops open that gate earlier: each completed loop lowers the elite
    // floor by 2 (min 1), so loop 2+ keeps elite pressure across the whole loop
    // instead of giving the player elite-free breather floors at the start.
    const loopNumber = Math.max(1, Math.floor((getProgressionDepth() - 1) / Neo.MAX_FLOOR) + 1);
    const eliteFloor = Math.max(1, Neo.getDifficultyDef().eliteFloor - (loopNumber - 1) * 2);
    return Neo.floor >= eliteFloor && Neo.floor <= Neo.MAX_FLOOR;
  }

  function rollEliteInventory() {
    const roll = globalThis.NeoNyke.simulation.rollCampaignEliteInventory;
    if (typeof roll !== 'function') throw new Error('Shared elite inventory rules are unavailable');
    return roll(() => Neo.nextRandom('encounter'), Neo.ELITE_INVENTORY_POOL);
  }

  function rollBlessedEliteInventory() {
    const roll = globalThis.NeoNyke.simulation.rollCampaignBlessedEliteInventory;
    if (typeof roll !== 'function') throw new Error('Shared blessed elite inventory rules are unavailable');
    return roll(() => Neo.nextRandom('encounter'), { whiteItemPool: Neo.WHITE_ITEM_POOL });
  }

  function rollEliteTypes(enemy) {
    const roll = globalThis.NeoNyke.simulation.rollCampaignEliteTypes;
    if (typeof roll !== 'function') throw new Error('Shared elite token rules are unavailable');
    return roll(Math.max(1, Number(enemy?.level) || getEnemyProgressionLevel(enemy)), () => Neo.nextRandom('encounter'));
  }

  function applyEliteTypes(enemy) {
    if (!enemy?.elite) return;
    const resolve = globalThis.NeoNyke.simulation.resolveCampaignEliteProfile;
    if (typeof resolve !== 'function') throw new Error('Shared elite profile rules are unavailable');
    const profile = resolve({
      maxHealth: enemy.max, health: enemy.hp, damage: enemy.dmg, moveSpeed: enemy.speed,
      radius: enemy.r, attackCooldown: enemy.attackCd, statusResistances: enemy.statusResistances,
      stunResistance: enemy.stunResistance, bleedResistance: enemy.bleedResistance,
      defenseMultiplier: enemy.defenseMultiplier,
    }, {
      level: Math.max(1, Number(enemy.level) || getEnemyProgressionLevel(enemy)),
      tokens: enemy.eliteTypes,
      inventory: enemy.eliteInventory,
      random: () => Neo.nextRandom('encounter'),
      inventoryPool: Neo.ELITE_INVENTORY_POOL,
      whiteItemPool: Neo.WHITE_ITEM_POOL,
      statusKeys: Neo.STATUS_KEYS,
      eliteHpMultiplier: Neo.getDifficultyDef()?.eliteHpMultiplier,
      knightSpeedCap: Neo.ELITE_KNIGHT_SPEED_CAP,
    });
    Object.assign(enemy, {
      hp: profile.health, max: profile.maxHealth, dmg: profile.damage, speed: profile.moveSpeed,
      r: profile.radius, attackCd: profile.attackCooldown, statusResistances: profile.statusResistances,
      stunResistance: profile.stunResistance, bleedResistance: profile.bleedResistance,
      defenseMultiplier: profile.defenseMultiplier, eliteTypes: profile.eliteTypes,
      eliteInventory: profile.eliteInventory, eliteBody: profile.eliteBody,
      eliteKnightMult: profile.eliteKnightMult, eliteUnfazed: profile.eliteUnfazed,
      elitePowers: profile.elitePowers, eliteProcs: profile.eliteProcs,
      eliteDurabilityV2: profile.eliteDurabilityV2,
    });
    if (profile.eliteLaserCd !== undefined) enemy.eliteLaserCd = profile.eliteLaserCd;
    if (profile.eliteLaserModeIndex !== undefined) enemy.eliteLaserModeIndex = profile.eliteLaserModeIndex;
    if (profile.eliteCrit !== undefined) enemy.eliteCrit = profile.eliteCrit;
  }


  // Encounter level is cumulative-floor pressure plus a small deterministic XP
  // roll from elapsed run time. Time grants XP, not raw levels, so slow runs get
  // variation without suddenly jumping dozens of levels.
  function rollEnemyEncounterLevel(baseLevel) {
    // Lottery Levels severs the depth-to-level link entirely: the roll spans the
    // whole range every time, so a floor-1 room can hold a level-20 enemy and a
    // floor-9 room can hold a level-1 one.
    if (Neo.isChaosActive?.('random_enemy_levels')) {
      const chaosLevel = globalThis.NeoNyke?.simulation?.rollChaosEnemyLevel?.({
        progressionDepth: getProgressionDepth(),
        random: () => Neo.nextRandom('encounter'),
      });
      if (Number.isFinite(Number(chaosLevel))) return Math.max(1, Math.trunc(Number(chaosLevel)));
    }
    let level = Math.max(1, Math.floor(Number(baseLevel || 1)));
    let xp = Neo.nextRandom('encounter') * Math.max(0, Neo.gameElapsedTime / 60) * 8;
    while (xp >= 8 + level * 2) {
      xp -= 8 + level * 2;
      level += 1;
    }
    return level;
  }

  function getBossTier(enemy, interval = 5) {
    return Math.max(0, Math.floor(Math.max(1, Number(enemy?.level || 1)) / interval));
  }

  // Status growth is deliberately linear: base, 2x at level 3, 3x at level 6.
  // Exponential repeated doubling would make late status hits unsurvivable.
  function getBossStatusStacks(enemy, baseStacks = 1) {
    if (!enemy || enemy.type === 'god') return Math.max(1, Math.round(baseStacks));
    return Math.max(1, Math.round(baseStacks * (1 + Math.floor(Math.max(1, Number(enemy.level || 1)) / 3))));
  }
  Neo.getBossTier = getBossTier;
  Neo.getBossStatusStacks = getBossStatusStacks;


  // Cumulative floor depth that drives enemy scaling: the number of floors the
  // player has actually entered this run (across loops, excluding skipped floors).
  // Falls back to `floor` for safety if the counter is ever unset.
  function getProgressionDepth() {
    return Math.max(1, Number(Neo.floorsEntered) || Number(Neo.floor) || 1);
  }
  Neo.getProgressionDepth = getProgressionDepth;

  // Looping makes elites more common: +10% (absolute) elite spawn chance per
  // completed loop. Loop number is derived from cumulative floor depth so it
  // matches HP/damage scaling and survives the per-loop `floor` reset. Loop 1
  // adds nothing; loop 2 adds 0.10, loop 3 adds 0.20, etc.
  function getEliteLoopBonus() {
    const loopNumber = Math.max(1, Math.floor((getProgressionDepth() - 1) / Neo.MAX_FLOOR) + 1);
    return (loopNumber - 1) * 0.10;
  }
  Neo.getEliteLoopBonus = getEliteLoopBonus;

  // Roamable bosses a regular wave enemy can be upgraded into deep in a run.
  // Excludes 'god' (the final boss) so it never appears as a random spawn.
  const RANDOM_BOSS_POOL = ['queen_cult', 'bulk_golem', 'artificer_knave', 'bowman_bane', 'antony_blemmye', 'handsome_devil'];

  // Past loop 4, regular wave enemies can spawn as a random boss instead. Chance
  // starts at 40% on loop 5 and climbs +10% per loop, capped at 60%. Returns the
  // chosen boss type, or null to leave the enemy as its rolled type. Bosses, the
  // god type, and already-boss requests are never upgraded.
  function rollWaveBossUpgrade(type) {
    if (isBossType(type) || type === 'mooggy') return null;
    const loopNumber = Math.max(1, Math.floor((getProgressionDepth() - 1) / Neo.MAX_FLOOR) + 1);
    if (loopNumber < 5) return null;
    const chance = Math.min(0.60, 0.40 + (loopNumber - 5) * 0.10);
    if (Neo.nextRandom('encounter') >= chance) return null;
    return RANDOM_BOSS_POOL[Neo.irand(0, RANDOM_BOSS_POOL.length - 1, 'encounter')];
  }

  function scaleEnemyStats(baseStats, type) {
    const sharedScaleEnemyStats = globalThis.NeoNyke?.simulation?.scaleCampaignEnemyStats;
    if (typeof sharedScaleEnemyStats !== 'function') {
      throw new Error('Shared campaign enemy scaling is unavailable');
    }
    const scaled = sharedScaleEnemyStats({
      ...baseStats,
      maxHealth: baseStats.max,
      health: baseStats.hp,
      contactDamage: baseStats.dmg,
      moveSpeed: baseStats.speed,
    }, {
      type,
      isBoss: isBossType(type),
      progressionDepth: getProgressionDepth(),
      enemyLevel: baseStats.level,
      elapsedSeconds: Neo.gameElapsedTime,
      gameMode: Neo.gameMode,
      endlessWave: Neo.endlessWave,
      maxFloor: Neo.MAX_FLOOR,
      difficulty: Neo.getDifficultyDef(),
      scaling: Neo.ENEMY_SCALING,
      sandbox: Neo.getActiveSandboxSettings(),
    });
    return {
      ...baseStats,
      hp: scaled.maxHealth,
      max: scaled.maxHealth,
      dmg: scaled.contactDamage,
      speed: scaled.moveSpeed,
      enemyLevelAttackSpeedMultiplier: scaled.enemyLevelAttackSpeedMultiplier,
    };
  }

  function getGodRunPressure(elapsedSeconds = Neo.gameElapsedTime) {
    const minutes = Math.max(0, Number(elapsedSeconds || 0) / 60);
    return {
      minutes,
      damageMultiplier: Math.min(1.9, 1.18 + minutes * 0.045),
      cadenceMultiplier: Math.max(0.48, 0.9 - minutes * 0.035),
      partitionLaserCount: minutes >= 8 ? 5 : 4,
      partitionRotationSpeed: Math.min(1.05, 0.52 + minutes * 0.035),
    };
  }

  function getMooggyAssassinStats() {
    const player = Neo.player || {};
    const itemStats = Neo.getItemStats?.() || {};
    const attackSpeed = Neo.getAttackSpeedValue?.() || 1;
    const baseDamage = Neo.getPlayerBaseDamage?.() || 24;
    const moveSpeed = (Neo.PLAYER_BASE_MOVE_SPEED || 228) * (itemStats.moveSpeedMultiplier || 1) * (Neo.godTimer > 0 ? 1.25 : 1);
    const hp = Math.max(120, Math.round(Number(player.maxHp || 120)));
    return {
      r: 15,
      hp,
      max: hp,
      speed: Math.max(120, moveSpeed),
      dmg: Math.max(14, Math.round(baseDamage * 0.7)),
      beamDamage: Math.max(5, Math.round(baseDamage * 0.22)),
      attackCd: 0.2,
      attackSpeed,
      bleedImmune: true,
      fireImmune: false,
      poisonImmune: false,
      dark_drainImmune: false,
      mooggyItems: { ...(player.items || {}) },
      mooggyBleedStacks: 1,
      mooggyLaserCooldown: 0.2,
      mooggyLaserTick: 0.055,
    };
  }

  // Per-type spawn stats. Each value is either a flat object of overrides applied
  // verbatim onto the base enemy, or a factory `(base) => overrides` for the few
  // types whose stats depend on run state (floor) or a roll. Adding an enemy type
  // is now a single row here instead of another branch in spawnEnemy. The trailing
  // generic elite-scaling fallback (for types with no row) lives in spawnEnemy.
  const ENEMY_STATS = {
    mooggy: () => getMooggyAssassinStats(),
    god: {
      r: 34, hp: 920, max: 920, speed: 108, dmg: 18, attackCd: 1.4,
      beamRange: 620, sweepDir: 1, sweepSpeed: 0, phase: 1,
      rebirthUsed: false, phase3Triggered: false, phase4Triggered: false, phase5Triggered: false,
      novaCd: 2.4, judgementCd: 4.2, stunResistance: 5, maxStunDuration: 0.18,
      statusResistance: 0.45,
      statusResistances: { bleed: 0.72, fire: 0.5, poison: 0.68, dark_drain: 0.75, slow: 0.7, static: 0.6 },
      bleedResistance: 0.55,
      partitionAngles: [], partitionAngle: 0, partitionRotationDir: 1, partitionRotationSpeed: 0,
    },
    cult_mage: { r: 17, hp: 84, max: 84, speed: 58, dmg: 18, attackCd: 1.8, novaCd: 3, novaTimer: 0 },
    knave: { r: 16, hp: 68, max: 68, speed: 118, dmg: 14, attackCd: 1.3 },
    sniper: () => {
      // Roll a personality: aggressive snipers close in and shoot, staybacks
      // hold their distance (classic sniper), and meleers prefer the rifle butt.
      const behaviorRoll = Neo.nextRandom('encounter');
      return {
        r: 15, hp: 58, max: 58, speed: 104, dmg: 12, attackCd: 1.55,
        sniperBehavior: behaviorRoll < 1 / 3 ? 'aggressive' : behaviorRoll < 2 / 3 ? 'stayback' : 'melee',
      };
    },
    machine_gunner: { r: 17, hp: 96, max: 96, speed: 112, dmg: 8, attackCd: 1.15, burstShots: 0, burstDelay: 0, burstAngle: 0 },
    golem: { r: 20, hp: 132, max: 132, speed: 70, dmg: 18, attackCd: 1.9, bleedImmune: true },
    cult_follower: { r: 12, hp: 34, max: 34, speed: 138, dmg: 8, attackCd: 0.85 },
    summoner: { r: 18, hp: 120, max: 120, speed: 66, dmg: 12, attackCd: 1.5, summonCd: 4.4 },
    shield_unit: { r: 22, hp: 210, max: 210, speed: 52, dmg: 10, attackCd: 1.4, bleedImmune: true, supportCd: 2.8 },
    healer: () => {
      const hp = Neo.floor >= 4 ? 260 : 150;
      return { r: 19, hp, max: hp, speed: 64, dmg: 10, attackCd: 1.2, supportCd: Neo.floor >= 4 ? 2.2 : 3 };
    },
    boss_spawner: {
      // A dedicated runner: fast enough to keep its distance while it counts
      // down the boss summon, but still catchable with commitment.
      r: 24, hp: 300, max: 300, speed: 96, dmg: 8, attackCd: 1.8, bleedImmune: true,
      bossSpawnTimer: 30, bossSpawnWarnAt: 30, shoveCd: 3, shoveTimer: 0,
    },
    queen_cult: { r: 38, hp: 912, max: 912, speed: 96, dmg: 20, attackCd: 1.2, summonCd: 2.4 },
    bulk_golem: { r: 58, hp: 1280, max: 1280, speed: 88, dmg: 31, attackCd: 1.6, bleedImmune: true, splitReady: true, aoeTime: 3, jumpCd: 1.2 },
    artificer_knave: { r: 30, hp: 1880, max: 1880, speed: 124, dmg: 20, attackCd: 1.2, phase: 1 },
    bowman_bane: { r: 36, hp: 2400, max: 2400, speed: 80, dmg: 50, attackCd: 1.4, phase: 1, bleedImmune: true, columnCd: 0, burstCd: 0, bowmanWarpCd: 2.8, thunderSmashCd: 0.6 },
    antony_blemmye: { r: 42, hp: 1250, max: 1250, speed: 78, dmg: 24, attackCd: 1.35, phase: 1, bleedImmune: true, hammerCd: 1.55, biteCd: 1.15, slashCd: 2.05, deathBallCd: 5.4 },
    handsome_devil: { r: 34, hp: 1700, max: 1700, speed: 104, dmg: 50, attackCd: 1.1, phase: 1, fireImmune: true, spikeCd: 0.9, lavaGridCd: 2.4, devilLaserCd: 1.6, clawCd: 0.4, giantLaserCd: 3.6, beamRange: 560 },
    ent_of_pestilence: { r: 48, hp: 2050, max: 2050, speed: 82, dmg: 28, attackCd: 1.15, summonCd: 1.8, poisonImmune: true },
    t_rex: { r: 58, hp: 2600, max: 2600, speed: 336, dmg: 42, attackCd: 1.05, phase: 1, bleedImmune: true, roarCd: 2.5 },
    sea_snake: { r: 38, hp: 2350, max: 2350, speed: 156, dmg: 34, attackCd: 0.9, seaSnakeEntryTime: 2.4, seaSnakeCoilAngle: -Math.PI / 2, seaSnakeContactCd: 0 },
  };

  // Resolve a type's stat overrides: invoke the factory or return the flat object.
  // null means "no dedicated row" — spawnEnemy applies generic elite scaling instead.
  function resolveEnemyStats(type, base) {
    const entry = ENEMY_STATS[type];
    if (!entry) return null;
    return typeof entry === 'function' ? entry(base) : entry;
  }

  function spawnEnemy(type, x, y, elite = false, options = {}) {
    const sandbox = Neo.getActiveSandboxSettings();
    // The sandbox allowedEnemies list governs the *wave* enemy pool only. Bosses
    // (and the mooggy assassin) are spawned by dedicated story/secret logic —
    // e.g. spawnBowmanBane in a revisited secret room — and must keep their real
    // type. Rewriting them to allowedEnemies[0] used to spawn a 15px "little guy"
    // with the boss's death hooks intact, which still cleared the room and farmed
    // the secret-boss reward chest.
    if (sandbox && !sandbox.allowedEnemies.includes(type) && !isBossType(type) && type !== 'mooggy') {
      type = sandbox.allowedEnemies[0] || 'hunter';
    }
    const eliteAllowed = !!elite && (options.forceElite || canSpawnEliteEnemies());
    const requestedLevel = Number(options.level);
    const enemyLevel = options.level !== undefined && Number.isFinite(requestedLevel)
      ? Math.max(1, Math.floor(requestedLevel))
      : rollEnemyEncounterLevel(Math.max(getProgressionDepth(), Number(Neo.player?.level) || 1));
    // Stable per-enemy identity, used by status tracking / achievements to tell
    // "4 statuses on one enemy" apart from "1 status on 4 enemies".
    Neo.enemyIdSeq = Math.max(0, Number(Neo.enemyIdSeq || 0)) + 1;
    const base = {
      id: Neo.enemyIdSeq,
      type,
      x,
      y,
      level: enemyLevel,
      vx: 0,
      vy: 0,
      r: 15,
      hp: 52,
      max: 52,
      speed: 96,
      dmg: 12,
      elite: eliteAllowed,
      stun: 0,
      inv: 0,
      attackCd: Neo.rand(0.2, 0.9, 'encounter'),
      statuses: Neo.createStatusMap(),
      windup: 0,
      beamTime: 0,
      beamTick: 0,
      beamAngle: 0,
      dashTime: 0,
      dashAngle: 0,
      dashHit: false,
      swingTime: 0,
      summonCd: 0,
      supportCd: 0,
      barrier: 0,
      bossSpawnTimer: 0,
      bossSpawnWarnAt: 0,
      aoeTime: 0,
      phase: 1,
      splitReady: false,
      spawnedFromBulk: false,
      bleedImmune: false,
      fireImmune: false,
      poisonImmune: false,
      dark_drainImmune: false,
      state: 'idle',
      dead: false,
      spawnT: 0.72,
      animSeed: (String(type).length * 0.67 + Math.round(x) * 0.013 + Math.round(y) * 0.017) % (Math.PI * 2),
      attackAnimT: 0,
    };
    const roomPart = Neo.currentRoom
      ? `room:${Neo.currentRoom.gx},${Neo.currentRoom.gy}|type:${Neo.currentRoom.type || 'room'}`
      : 'room:none';
    if (Neo.currentRoom) Neo.currentRoom.enemySpawnSerial = Math.max(0, Number(Neo.currentRoom.enemySpawnSerial || 0)) + 1;
    base.lootSeed = `${Neo.getFloorSeed()}|${roomPart}|enemy:${type}:${Math.round(x)},${Math.round(y)}:${Neo.currentRoom?.enemySpawnSerial || 0}|loot`;

    const stats = resolveEnemyStats(type, base);
    if (stats) {
      Object.assign(base, stats);
    } else if (eliteAllowed) {
      // No dedicated stat row: generic elite scaling on the default base.
      base.hp = Math.round(base.hp * 1.35);
      base.max = base.hp;
      base.speed *= 1.08;
      base.r = 17;
    }

    const scaled = type === 'mooggy' ? { ...base } : scaleEnemyStats(base, type);
    base.hp = scaled.hp;
    base.max = scaled.max;
    base.dmg = scaled.dmg;
    base.speed = scaled.speed;
    base.enemyLevelAttackSpeedMultiplier = scaled.enemyLevelAttackSpeedMultiplier;

    const difficultyTuning = Neo.getEnemyDifficultyTuning();
    if (!isBossType(type) && Neo.floor >= 4) {
      // Deeper loops shield more enemies, with bigger barriers: +12% (absolute)
      // barrier chance and +20% barrier size per completed loop. This rewards
      // burst damage over chip/DoT late in a run since a held barrier blocks the
      // first slice of every hit (see hitEnemy in combat.js).
      const loopNumber = Math.max(1, Math.floor((getProgressionDepth() - 1) / Neo.MAX_FLOOR) + 1);
      const loopChanceBonus = (loopNumber - 1) * 0.12;
      const loopSizeMult = 1 + (loopNumber - 1) * 0.20;
      const barrierChance = type === 'shield_unit'
        ? 1
        : (type === 'healer' || type === 'summoner' || type === 'laser' || type === 'sniper' || type === 'machine_gunner')
          ? 0.12 * difficultyTuning.supportPower + loopChanceBonus
          : 0.05 * Math.max(1, difficultyTuning.supportPower - 0.02) + loopChanceBonus;
      if (Neo.nextRandom('encounter') < barrierChance) {
        const baseFraction = type === 'shield_unit' ? 0.24 : 0.12 * difficultyTuning.supportPower;
        base.barrier = Math.round(base.max * baseFraction * loopSizeMult);
      }
    }


    if (base.elite) applyEliteTypes(base);

    // collect: build and return the enemy without adding it to the live
    // Neo.enemies list, so the caller can place it into a specific room's
    // enemies array (used to seed Gelleh's turrets across a fresh floor).
    if (options.collect) return base;

    Neo.enemies.push(base);
    return base;
  }

  // Builds one of Gelleh's retaliation turrets: a stationary (speed 0) stayback
  // sniper that holds its post and fires on the player, has real HP, and is
  // flagged so its death drops a potion 50% of the time (see onEnemyDie). Built
  // detached (collect) so the caller can drop it into a chosen room's enemies.
  function makeGellehTurret(room, floorScale = 1) {
    const x = Neo.WALL + 70 + Neo.nextRandom('world') * (Neo.ROOM_W - Neo.WALL * 2 - 140);
    const y = Neo.WALL + 70 + Neo.nextRandom('world') * (Neo.ROOM_H - Neo.WALL * 2 - 140);
    const turret = spawnEnemy('sniper', x, y, false, { collect: true });
    if (!turret) return null;
    turret.sniperBehavior = 'stayback';
    turret.speed = 0;
    turret.hp = Math.round(70 * floorScale);
    turret.max = turret.hp;
    turret.dmg = Math.round(11 * floorScale);
    turret.color = '#a8aaff';
    turret.rivalTurret = true;          // 50% potion on death (onEnemyDie)
    turret.gellehTurret = true;         // flavor / future hooks
    return turret;
  }

  function spawnGodBoss() {
    const existing = Neo.enemies.find(enemy => enemy.type === 'god');
    if (existing) return existing;
    const safeSpawn = findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2 - 40, 15);
    if (!safeSpawn) return null;
    return spawnEnemy('god', safeSpawn.x, safeSpawn.y, false);
  }

  const BLACK_ITEM_BOSS_BY_KEY = Object.freeze({
    bug_card: 'ent_of_pestilence',
    dino_tooth: 't_rex',
    heart_of_the_ocean: 'sea_snake',
  });

  function spawnBlackItemBoss(itemKey) {
    const type = BLACK_ITEM_BOSS_BY_KEY[String(itemKey || '')];
    if (!type || !Neo.player) return null;
    const preferredX = type === 'sea_snake' ? Neo.ROOM_W / 2 : Neo.ROOM_W / 2;
    const preferredY = type === 'sea_snake' ? Neo.WALL + 32 : Neo.ROOM_H / 2 - 70;
    const safeSpawn = findSafeEnemySpawnPoint(preferredX, preferredY, type === 't_rex' ? 58 : 42)
      || findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 38);
    if (!safeSpawn) return null;
    const boss = spawnEnemy(type, safeSpawn.x, safeSpawn.y, false, { level: Math.max(1, Number(Neo.player.level || 1)) });
    if (!boss) return null;
    boss.blackItemBoss = true;
    boss.blackItemSource = itemKey;
    boss.displayName = type === 'ent_of_pestilence'
      ? 'Ent of Pestilence'
      : type === 't_rex' ? 'T-Rex' : 'The Snake of the Sea';
    if (type === 'sea_snake') {
      boss.seaSnakeHole = { x: safeSpawn.x, y: Neo.WALL + 12, radius: 58 };
      boss.seaSnakeSegments = Array.from({ length: 18 }, () => ({ x: safeSpawn.x, y: Neo.WALL + 12, r: 20 }));
      // Shared swept-projectile collision treats these circles as extra hit
      // bodies for the head entity, so any visible part of the snake can be hit.
      boss.collisionCircles = boss.seaSnakeSegments;
    }
    if (Neo.currentRoom) Neo.currentRoom.cleared = false;
    Neo.spawnParticle({
      x: boss.x, y: boss.y - boss.r - 28, life: 1.8,
      text: `BLACK RELIC BOSS: ${boss.displayName.toUpperCase()}`, c: '#b7c4d8',
    });
    const line = Neo.BOSS_OPENING_DIALOGUE?.[type];
    if (line) Neo.sayOverEntity?.(boss, line, { speaker: boss.displayName, tone: 'boss', holdTime: 2.1, offsetY: boss.r + 36 });
    Neo.updateObjective?.();
    Neo.scheduleRunSave?.();
    return boss;
  }

  // Black relics are a permanent debt, not a one-time toll: every floor the
  // owner enters re-summons the boss bound to each black relic they hold. The
  // pickup itself spawns the first one (applyBlackItemPickup), so this fires
  // from generateFloor for every floor *after* the one it was collected on.
  // Stacks do not multiply the debt — one boss per distinct relic owned.
  function spawnBlackItemFloorBosses() {
    if (!Neo.player) return [];
    // The tutorial teaches basics with an authored encounter set; dropping a
    // black boss into it would break that script.
    if (Neo.isTutorialRun?.()) return [];
    const spawned = [];
    for (const itemKey of Object.keys(BLACK_ITEM_BOSS_BY_KEY)) {
      if ((Neo.getItemCount?.(itemKey) || 0) <= 0) continue;
      const boss = spawnBlackItemBoss(itemKey);
      if (boss) spawned.push(boss);
    }
    return spawned;
  }

  function tryAwakenBlackBugAllies(enemy, dealtDamage) {
    const stacks = Neo.getItemCount?.('bug_card') || 0;
    if (!Neo.player || stacks <= 0 || Neo.player.blackBugAlliesAwakened || !enemy) return false;
    const getThreshold = globalThis.NeoNyke?.simulation?.getBugCardHeavyHitThreshold;
    const threshold = typeof getThreshold === 'function'
      ? getThreshold(stacks)
      : Math.max(0.01, 0.11 - stacks * 0.01);
    const targetMaxHp = Math.max(1, Number(enemy.max || enemy.maxHealth || enemy.hp || 1));
    if (Number(dealtDamage || 0) < targetMaxHp * threshold) return false;
    Neo.player.blackBugAlliesAwakened = true;
    Neo.player.blackBugAllyCount = 3;
    Neo.itemStatsCacheFrame = -1;
    ensureBlackBugAllies();
    Neo.spawnParticle?.({
      x: Neo.player.x, y: Neo.player.y - 36, life: 1.2,
      text: `BUG SWARM! ${Math.round(threshold * 100)}% HIT`, c: '#a7ff4f',
    });
    Neo.scheduleRunSave?.();
    return true;
  }

  function ensureBlackBugAllies() {
    const ownsCard = (Neo.getItemCount?.('bug_card') || 0) > 0;
    const awakened = ownsCard && !!Neo.player?.blackBugAlliesAwakened;
    Neo.allies = Neo.allies && typeof Neo.allies === 'object' && !Array.isArray(Neo.allies) ? Neo.allies : {};
    const ownerId = String(Neo.player?.id || 'local-player-1');
    const current = Object.values(Neo.allies).filter(ally => ally?.source?.kind === 'item'
      && ally.source.key === 'bug_card' && ally.ownerId === ownerId);
    if (!awakened) {
      current.forEach(ally => { delete Neo.allies[ally.id]; });
      if (Neo.player) {
        Neo.player.blackBugAllyCount = 0;
        Neo.player.blackBugTeamAllyCount = 0;
      }
      (Neo.getActivePlayerSlots?.() || []).forEach(slot => {
        const actor = slot.getEntity?.();
        if (!actor) return;
        actor.blackBugAllyCount = 0;
        actor.blackBugTeamAllyCount = 0;
      });
      Neo.blackBugAllies = [];
      return [];
    }
    const reconcile = globalThis.NeoNyke?.simulation?.reconcileGuaranteedItemAllies;
    if (typeof reconcile !== 'function') throw new Error('Shared guaranteed item-ally rules are unavailable');
    const state = { allies: Neo.allies, players: { [ownerId]: Neo.player }, nextEntityId: Neo.allyIdSeq || 1 };
    const result = reconcile(state, Neo.player, {
      sourceKey: 'bug_card',
      count: 3,
      idForIndex: index => `black_bug_${ownerId}_${index}`,
      optionsForIndex: index => {
        const angle = (index / 3) * Math.PI * 2;
        return {
          seed: 7100 + index,
          name: `Pestilent Bug ${index + 1}`,
          archetypeKey: 'brawler',
          x: Neo.player.x + Math.cos(angle) * 44,
          y: Neo.player.y + Math.sin(angle) * 44,
          radius: 10,
          attackCooldown: index * 0.18,
          fireBug: Neo.nextRandom?.('encounter') < 0.05,
          tags: ['species:bug', 'source:item'],
        };
      },
    });
    Neo.allies = state.allies;
    Neo.allyIdSeq = Math.max(Number(Neo.allyIdSeq || 1), Number(state.nextEntityId || 1));
    const allyCount = result.allies.filter(ally => ally?.status === 'active').length;
    Neo.player.blackBugAllyCount = allyCount;
    Neo.player.blackBugTeamAllyCount = 0;
    const slots = Neo.getActivePlayerSlots?.() || [];
    slots.forEach(slot => {
      const actor = slot.getEntity?.();
      if (!actor) return;
      if (actor === Neo.player) actor.blackBugAllyCount = allyCount;
      else actor.blackBugTeamAllyCount = allyCount;
    });
    Neo.blackBugAllies = [];
    return result.allies;
  }

  function updateBlackBugAllies(dt) {
    ensureBlackBugAllies();
  }

  function updateEntOfPestilence(enemy, dt) {
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    enemy.summonCd = Math.max(0, Number(enemy.summonCd || 0) - dt);
    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.4, dt);
    if (enemy.summonCd <= 0) {
      for (let index = 0; index < 3; index += 1) {
        const angle = (index / 3) * Math.PI * 2 + Neo.nextRandom('encounter') * 0.4;
        const preferredX = enemy.x + Math.cos(angle) * 72;
        const preferredY = enemy.y + Math.sin(angle) * 72;
        // A brood cast guarantees all three grubs. If room geometry exhausts
        // the safe-point search, use a wall-clamped fallback; normal movement
        // collision resolves the minion out of nearby obstacles next tick.
        const spawn = findSafeSummonSpawnPoint(preferredX, preferredY) || {
          x: Neo.clamp(preferredX, Neo.WALL + SUMMON_SPAWN_RADIUS, Neo.ROOM_W - Neo.WALL - SUMMON_SPAWN_RADIUS),
          y: Neo.clamp(preferredY, Neo.WALL + SUMMON_SPAWN_RADIUS, Neo.ROOM_H - Neo.WALL - SUMMON_SPAWN_RADIUS),
        };
        const grub = spawnEnemy('cult_follower', spawn.x, spawn.y, false, { level: enemy.level });
        grub.displayName = 'Pestilent Grub';
        grub.pestilentGrub = true;
        grub.spriteKey = 'ent_boss';
      }
      enemy.summonCd = 5.2;
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r, life: 0.8, text: 'BROOD!', c: '#a7ff4f' });
      return;
    }
    if (enemy.attackCd <= 0) {
      const aim = Math.atan2(dy, dx);
      for (let spread = -1; spread <= 1; spread += 1) {
        const angle = aim + spread * 0.22;
        Neo.spawnProjectile({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 310, vy: Math.sin(angle) * 310, r: 7, life: 2.2, enemy: true, owner: enemy, kind: 'pestilence_spit', source: enemy.type, damage: Math.round(enemy.dmg * 0.75), statusEffects: [{ key: 'poison', stacks: 2, duration: 5 }] });
      }
      enemy.attackCd = 1.7;
    }
  }

  function updateTRexBoss(enemy, dt) {
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    enemy.roarCd = Math.max(0, Number(enemy.roarCd || 0) - dt);
    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.72; enemy.vy *= 0.72;
      if (enemy.windup <= 0) {
        enemy.dashTime = 0.72;
        enemy.dashHit = false;
        enemy.dashHasMoved = false;
      }
      return;
    }
    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      const simulation = globalThis.NeoNyke?.simulation;
      if (simulation?.isTRexChargeWallImpact?.(enemy, {
        wall: Neo.WALL,
        width: Neo.ROOM_W,
        height: Neo.ROOM_H,
      })) {
        simulation.createTRexWallRockDescriptors(enemy).forEach(rock => {
          Neo.spawnProjectile({ ...rock, enemy: true, owner: enemy });
        });
        Neo.ringBurst(enemy.x, enemy.y, enemy.r + 30, '#b99a72', 0.45);
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r, life: 0.65, text: 'CRASH!', c: '#d6b88a' });
        enemy.dashTime = 0;
        enemy.dashHasMoved = false;
        enemy.vx = -Math.cos(enemy.dashAngle) * 140;
        enemy.vy = -Math.sin(enemy.dashAngle) * 140;
        enemy.attackCd = Math.max(Number(enemy.attackCd || 0), 1.4);
        return;
      }
      const chargeSpeed = Math.max(610, Number(enemy.speed || 0) * 2);
      enemy.vx = Math.cos(enemy.dashAngle) * chargeSpeed;
      enemy.vy = Math.sin(enemy.dashAngle) * chargeSpeed;
      enemy.dashHasMoved = true;
      if (!enemy.dashHit && distance < enemy.r + Neo.player.r + 16) {
        enemy.dashHit = true;
        Neo.damagePlayer(enemy.dmg + 22, enemy.dashAngle, 520, enemy.type, { attacker: enemy });
        Neo.applyBleed?.(Neo.player, 3, 5, enemy);
      }
      return;
    }
    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.2, dt);
    if (distance < enemy.r + Neo.player.r + 18 && enemy.attackCd <= 0) {
      Neo.damagePlayer(enemy.dmg, Math.atan2(dy, dx), 360, enemy.type, { attacker: enemy });
      enemy.swingTime = 0.3;
      enemy.attackCd = 0.9;
    } else if (enemy.roarCd <= 0 && distance < 240) {
      Neo.damagePlayer(Math.round(enemy.dmg * 0.45), Math.atan2(dy, dx), 440, enemy.type, { attacker: enemy });
      Neo.ringBurst(enemy.x, enemy.y, 230, '#ffcf72', 0.55);
      enemy.roarCd = 4.4;
    } else if (enemy.attackCd <= 0 && distance > enemy.r + Neo.player.r + 40) {
      const predictedX = Neo.player.x + Number(Neo.player.vx || 0) * 0.25;
      const predictedY = Neo.player.y + Number(Neo.player.vy || 0) * 0.25;
      enemy.dashAngle = Math.atan2(predictedY - enemy.y, predictedX - enemy.x);
      enemy.windup = 0.55;
      enemy.dashHasMoved = false;
      enemy.attackCd = 1.8;
    }
  }

  function updateSeaSnakeSegments(enemy, dt) {
    const advanceBody = globalThis.NeoNyke?.simulation?.advanceCampaignSeaSnakeBody;
    if (typeof advanceBody !== 'function') throw new Error('Shared sea-snake body rules are unavailable');
    const { segments } = advanceBody(enemy, dt);
    if (!segments.length) return;
    const contacts = enemy.seaSnakeContactCooldowns || (enemy.seaSnakeContactCooldowns = {});
    Object.keys(contacts).forEach(id => { contacts[id] = Math.max(0, Number(contacts[id] || 0) - dt); });
    const slots = Neo.getLocalCoopSlots?.({ livingOnly: true }) || [{ id: 1, getEntity: () => Neo.player }];
    slots.forEach(slot => {
      if (Number(contacts[slot.id] || 0) > 0) return;
      const actor = slot.getEntity?.();
      if (!actor) return;
      const actorRadius = Number(actor.r || 14);
      const touched = segments.find(segment => (
        Neo.dist(segment.x, segment.y, actor.x, actor.y) <= Number(segment.r || 20) + actorRadius
      ));
      if (!touched) return;
      const angle = Math.atan2(actor.y - touched.y, actor.x - touched.x);
      const damageOptions = { attacker: enemy, sourceLabel: 'Snake of the Sea — Body' };
      if (typeof Neo.damagePlayerSlot === 'function') {
        Neo.damagePlayerSlot(slot, Math.round(enemy.dmg * 0.7), angle, 180, 'sea_snake_body', damageOptions);
      } else {
        Neo.damagePlayer(Math.round(enemy.dmg * 0.7), angle, 180, 'sea_snake_body', damageOptions);
      }
      contacts[slot.id] = 0.48;
    });
  }

  function updateSeaSnakeBoss(enemy, dt) {
    enemy.seaSnakeEntryTime = Math.max(0, Number(enemy.seaSnakeEntryTime || 0) - dt);
    enemy.seaSnakeCoilAngle = Number(enemy.seaSnakeCoilAngle || 0) + dt * (enemy.hp < enemy.max * 0.5 ? 1.45 : 1.05);
    const elapsed = Math.max(0, 2.4 - enemy.seaSnakeEntryTime);
    const constrictRadius = Math.max(48, 230 - elapsed * 9 - (1 - enemy.hp / Math.max(1, enemy.max)) * 95);
    const targetX = Neo.player.x + Math.cos(enemy.seaSnakeCoilAngle) * constrictRadius;
    const targetY = Neo.player.y + Math.sin(enemy.seaSnakeCoilAngle) * constrictRadius * 0.72;
    const dx = targetX - enemy.x;
    const dy = targetY - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed + Math.min(90, elapsed * 5), 5.2, dt);
    updateSeaSnakeSegments(enemy, dt);
    const playerDistance = Neo.dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y);
    if (playerDistance < enemy.r + Neo.player.r + 10 && enemy.attackCd <= 0) {
      Neo.damagePlayer(enemy.dmg, Math.atan2(Neo.player.y - enemy.y, Neo.player.x - enemy.x), 260, enemy.type, { attacker: enemy });
      enemy.attackCd = 0.72;
    }
  }

  function playGodDialogue(phase) {
    const line = Neo.GOD_PHASE_DIALOGUE[phase];
    if (!line) return false;
    Neo.setShopPanelOpen(false);
    Neo.setInventoryPanelOpen(false);
    Neo.clearGameplayInput();
    return Neo.uiController.playDialogue([{ speaker: 'GOD', text: line }], { returnState: 'play' });
  }

  // Cutscenes read best when the speakers share the frame, so when a boss intro
  // plays we pull the player in just below the boss (the boss faces "up" toward
  // the camera) instead of leaving them stranded at the entry door.
  function positionPlayerNearEntity(entity, options = {}) {
    if (!entity || !Neo.player) return;
    const gap = Number(options.gap ?? 70);
    const radius = Number(Neo.player.r || 14);
    const preferredX = entity.x;
    const preferredY = entity.y + (Number(entity.r || 24) + gap);
    const spot = findSafeEnemySpawnPoint(preferredX, preferredY, radius)
      || findSafeEnemySpawnPoint(entity.x, entity.y + gap, radius);
    if (!spot) return;
    Neo.player.x = spot.x;
    Neo.player.y = spot.y;
    Neo.player.vx = 0;
    Neo.player.vy = 0;
  }

  // Shared boss-intro launcher. Tries to start the dialogue FIRST; only if it
  // actually begins do we run the freeze/positioning setup and invoke onPlayed
  // (which is where the caller flips its one-time "played" flag). This prevents a
  // specific cutscene from being marked played — and thus skipped forever, with
  // only the generic line showing next time — when the dialogue can't open
  // because another one is already on screen.
  function startBossCutscene(enemy, lines, onPlayed) {
    if (Neo.uiController.isDialogueOpen && Neo.uiController.isDialogueOpen()) return false;
    const started = Neo.uiController.playDialogue(lines, { returnState: 'play' });
    if (!started) return false;
    Neo.clearGameplayInput();
    Neo.setShopPanelOpen(false);
    Neo.setInventoryPanelOpen(false);
    positionPlayerNearEntity(enemy);
    enemy.attackCd = Math.max(Number(enemy.attackCd || 0), 1.4);
    enemy.stun = Math.max(Number(enemy.stun || 0), 0.25);
    if (onPlayed) onPlayed();
    Neo.scheduleRunSave();
    return true;
  }

  function getPlayedBossIntroKeys(enemy) {
    return [
      Neo.knaveKnightCutscenePlayed && 'knave_knight',
      Neo.queenMetaoCutscenePlayed && 'queen_metao',
      enemy?.thornIntroPlayed && 'bulk_golem_thorn',
      Neo.handsomeDevilCutscenePlayed && 'handsome_devil_thorn_knight',
      Neo.handsomeDevilCutscenePlayed && 'handsome_devil_princess',
      Neo.handsomeDevilCutscenePlayed && 'handsome_devil_gelleh',
      Neo.handsomeDevilCutscenePlayed && 'handsome_devil_mooggy',
      Neo.antonyBlemmyeCutscenePlayed && 'antony_blemmye',
      enemy?.genericIntroPlayed && `generic_${enemy?.type || ''}`,
    ].filter(Boolean);
  }

  function markBossIntroPlayed(enemy, key) {
    if (key === 'knave_knight') Neo.knaveKnightCutscenePlayed = true;
    else if (key === 'queen_metao') Neo.queenMetaoCutscenePlayed = true;
    else if (key === 'bulk_golem_thorn') enemy.thornIntroPlayed = true;
    else if (key.startsWith('handsome_devil_')) Neo.handsomeDevilCutscenePlayed = true;
    else if (key === 'antony_blemmye') Neo.antonyBlemmyeCutscenePlayed = true;
    else if (key.startsWith('generic_')) enemy.genericIntroPlayed = true;
  }

  function tryPlaySharedBossIntro(enemy, enemyType, expectedKey = null) {
    if (!enemy || !enemyType || !Neo.player) return false;
    const resolve = globalThis.NeoNyke?.simulation?.resolveCampaignBossIntro;
    if (typeof resolve !== 'function') return false;
    const intro = resolve({
      enemyType,
      characterKey: Neo.player.character,
      playedKeys: getPlayedBossIntroKeys(enemy),
    });
    if (!intro || (expectedKey && intro.key !== expectedKey)) return false;
    return startBossCutscene(enemy, intro.lines, () => markBossIntroPlayed(enemy, intro.key));
  }

  function tryPlayKnaveKnightCutscene(enemy, enemyType) {
    return tryPlaySharedBossIntro(enemy, enemyType, 'knave_knight');
  }

  function tryPlayQueenMetaoCutscene(enemy, enemyType) {
    return tryPlaySharedBossIntro(enemy, enemyType, 'queen_metao');
  }

  function tryPlayBulkGolemThornCutscene(enemy, enemyType) {
    return tryPlaySharedBossIntro(enemy, enemyType, 'bulk_golem_thorn');
  }

  function tryPlayHandsomeDevilCharacterCutscene(enemy, enemyType) {
    return tryPlaySharedBossIntro(enemy, enemyType);
  }

  function tryPlayAntonyBlemmyeCutscene(enemy, enemyType) {
    return tryPlaySharedBossIntro(enemy, enemyType, 'antony_blemmye');
  }

  function tryPlayGenericBossOpening(enemy, enemyType) {
    return tryPlaySharedBossIntro(enemy, enemyType, `generic_${enemyType}`);
  }

  function tryPlayBossIntroCutscene(enemy, enemyType) {
    return tryPlaySharedBossIntro(enemy, enemyType);
  }

  function sayOverEntity(entity, text, options = {}) {
    if (!entity || !text) return null;
    const tone = options.tone || 'boss';
    const bubbleId = Neo.uiController.sayAtWorldAnchor({
      anchor: () => Neo.enemies.includes(entity) ? { x: entity.x, y: entity.y } : null,
      speaker: options.speaker || Neo.getBossLabel(entity.type),
      text,
      offsetY: options.offsetY ?? (entity.r ? entity.r + 26 : 56),
      tone,
      typeSpeed: options.typeSpeed,
      holdTime: options.holdTime,
    });
    if (bubbleId && tone === 'boss' && Neo.gameState === 'play') {
      const typeSeconds = String(text).length * Math.max(0.01, Number(options.typeSpeed) || 0.024);
      const holdSeconds = Math.max(0.4, Number(options.holdTime) || 1.55);
      Neo.musicMix?.duckFor?.(`boss-dialogue:${bubbleId}`, 0, (typeSeconds + holdSeconds) * 1000);
    }
    return bubbleId;
  }

  function sayAtPosition(x, y, text, options = {}) {
    if (!text) return null;
    return Neo.uiController.sayAtWorldAnchor({
      anchor: () => ({ x, y }),
      speaker: options.speaker || '',
      text,
      offsetY: options.offsetY ?? 54,
      tone: options.tone || 'warning',
      typeSpeed: options.typeSpeed,
      holdTime: options.holdTime,
    });
  }

  function clonePlainObject(value) {
    if (!value || typeof value !== 'object') return {};
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return { ...value };
    }
  }

  function createMirrorInventorySnapshot() {
    const player = Neo.player || {};
    const character = player.character || Neo.chosenCharacter || 'thorn_knight';
    const equippedMoves = {
      ...Neo.getDefaultMovesForCharacter(character),
      ...(player.equippedMoves || {}),
    };
    const items = clonePlainObject(player.items);
    Neo.ITEM_KEYS.forEach(key => { items[key] = Number(items[key] || 0); });
    const ownedMoves = clonePlainObject(player.ownedMoves);
    Object.values(equippedMoves).forEach(key => { if (key) ownedMoves[key] = true; });
    const ownedWeapons = clonePlainObject(player.ownedWeapons);
    if (player.equippedWeapon) ownedWeapons[player.equippedWeapon] = true;
    return {
      playerState: clonePlainObject(player),
      character,
      level: Number(player.level || 1),
      xp: Number(player.xp || 0),
      xpToNext: Number(player.xpToNext || 20),
      hp: Number(player.hp || player.maxHp || 120),
      maxHp: Number(player.maxHp || 120),
      attackPower: Number(player.attackPower || 0),
      attackSpeed: Number(player.attackSpeed || 1),
      critCharmBuffTime: Number(player.critCharmBuffTime || 0),
      keenEyeBuffTime: Number(player.keenEyeBuffTime || 0),
      chronoSpringBuffTime: Number(player.chronoSpringBuffTime || 0),
      robotArmReady: !!player.robotArmReady,
      storedPotions: Number(player.storedPotions || 0),
      items,
      ownedMoves,
      ownedWeapons,
      equippedMoves,
      equippedWeapon: player.equippedWeapon || '',
      anvilUpgrades: clonePlainObject(player.anvilUpgrades || { weapon: {}, move: {} }),
      statuses: clonePlainObject(player.statuses),
      inv: Math.max(0, Number(player.inv || 0)),
      overhealBarrier: Math.max(0, Number(player.overhealBarrier || 0)),
      overhealBarrierMax: Math.max(0, Number(player.overhealBarrierMax || 0)),
      moveStackOverrides: clonePlainObject(player.moveStackOverrides),
      weaponChargeOverrides: clonePlainObject(player.weaponChargeOverrides),
    };
  }

  function getMirrorInventoryItemStats(inventory) {
    const items = inventory?.items || {};
    const count = key => Number(items[key] || 0);
    const godItemStacks = Neo.ITEM_KEYS
      .filter(key => Neo.isGodTier?.(Neo.ITEM_DEFS[key]?.rarity) && !Neo.ITEM_DEFS[key]?.voucher)
      .reduce((total, key) => total + count(key), 0);
    const xpProgress = Neo.clamp((inventory?.xpToNext || 0) > 0 ? Number(inventory.xp || 0) / Number(inventory.xpToNext || 1) : 0, 0, 1);
    const characterDef = Neo.CHARACTER_DEFS?.[inventory?.character] || {};
    const attackServo = count('attack_servo');
    const robotArm = count('robot_arm');
    const chronoSpringBonus = Number(inventory?.chronoSpringBuffTime || 0) > 0 ? count('chrono_spring') * 0.16 : 0;
    const keenEyeActive = Number(inventory?.keenEyeBuffTime || 0) > 0;
    let critChance = count('crit_charm') * 0.025 + (Number(inventory?.critCharmBuffTime || 0) > 0 ? count('crit_charm') * 0.04 : 0);
    critChance += keenEyeActive ? count('keen_eye') * 0.2 : 0;
    critChance += count('pendant_of_kronos') * godItemStacks * 0.05;
    if (count('oracles_lens') > 0) critChance *= 2;
    critChance = Math.max(0.01, critChance);
    // Mirror the player's crit roll-back: chance over 100% converts to ×1.5 crit
    // damage and rolls back to 75% (see applyCritRollback).
    const baseMirrorCritMultiplier = 1.6 + (count('oracles_lens') > 0 ? critChance * 2.2 : critChance * 0.6)
      + (keenEyeActive ? count('keen_eye') * 0.025 : 0);
    const mirrorCritRollback = Neo.applyCritRollback(critChance, baseMirrorCritMultiplier);
    critChance = Neo.clamp(mirrorCritRollback.critChance, 0.01, 1);
    const mirrorCritMultiplier = mirrorCritRollback.critMultiplier;
    return {
      bleedChance: count('neo_knife') * 0.10 + count('tough_bandaid') * 0.02,
      bleedResistance: Neo.clamp(count('tough_bandaid') * 0.1, 0, 0.8),
      scarfBleedsOnHit: count('hemes_scarf'),
      snakeKnifePoisonChance: count('snake_knife') * 0.10,
      weaponFatigueChance: count('weapon_fatigue') * 0.05,
      weaponFatigueFreezeChance: count('weapon_fatigue') * 0.02,
      confuseRayStunChance: Neo.clamp(count('confuse_ray') * 0.15, 0, 0.75),
      confuseRayBlindChance: count('confuse_ray') > 0 ? 0.05 : 0,
      overstimulateStunChance: count('overstimulate') * 0.2,
      homingMissileChance: count('homing_missile') * 0.15,
      critChance,
      critMultiplier: mirrorCritMultiplier,
      attackSpeedMultiplier: robotArm > 0 && inventory?.robotArmReady
        ? 8 * (1 + attackServo * 0.08 + chronoSpringBonus)
        : 1 + attackServo * 0.08 + chronoSpringBonus,
      moveSpeedMultiplier: 1 + count('turtle_shell') * 0.05,
      levelEdgeDamageMultiplier: 1 + count('scholar_cap') * xpProgress * 0.45,
      knockbackMultiplier: 1 + count('push_man') * 0.18,
      aoeRadiusMultiplier: (1 + count('explosive_jelly') * 0.2) * Number(characterDef.aoeRadiusMultiplier || 1),
      aoeDamageMultiplier: Number(characterDef.aoeDamageMultiplier || 1),
      beamDamageMultiplier: 1 + count('dragon_orb') * 0.35,
      projectileBounces: count('ricocete'),
      projectileHomingStrength: count('enemy_magnet') * 0.15 + count('enemy_magnet') ** 2 * 0.02 + count('mooggy_zoomies') * 0.02,
      projectileSpeedMultiplier: 1 + count('mooggy_zoomies') * 0.12,
      projectileLifeMultiplier: 1 + count('mooggy_zoomies') * 0.10,
      healingMultiplier: 1 + count('drink_master') * 0.2,
      itemDropChanceBonus: Math.min(0.3, count('rich_mans_luck') * 0.05),
      shopExtraItemOffers: Math.min(3, count('rich_mans_luck')),
    };
  }

  function scaleMirrorItemStats(inventory, itemStats) {
    const simulation = globalThis.NeoNyke?.simulation;
    if (typeof simulation?.scaleCampaignItemEffects !== 'function') {
      throw new Error('Shared mirror item scaling is unavailable');
    }
    const level = Math.max(1, Number(inventory?.level || 1));
    const levelSpeedBonus = (level >= 14 ? 0.03 : 0) + (level >= 28 ? 0.04 : 0);
    const characterDef = Neo.CHARACTER_DEFS?.[inventory?.character] || {};
    return simulation.scaleCampaignItemEffects(
      itemStats,
      simulation.MIRROR_ITEM_EFFECT_STRENGTH,
      {
        aoeRadiusMultiplier: Number(characterDef.aoeRadiusMultiplier || 1),
        aoeDamageMultiplier: Number(characterDef.aoeDamageMultiplier || 1),
        moveSpeedMultiplier: 1 + levelSpeedBonus,
        weaponBleedChance: Number(itemStats?.weaponBleedChance || 0),
        weaponCritChance: Number(itemStats?.weaponCritChance || 0),
      },
    );
  }

  function getMirrorAnvilBonus(inventory, itemType, itemKey, statKey) {
    return Number(inventory?.anvilUpgrades?.[itemType]?.[itemKey]?.[statKey] || 0)
      * Number((itemType === 'weapon' ? Neo.WEAPON_UPGRADEABLE_STATS : Neo.MOVE_UPGRADEABLE_STATS)?.[statKey]?.step || 0);
  }

  function getMirrorWeaponCooldown(inventory, weaponKey) {
    const base = Number(Neo.WEAPON_BASE_STATS[weaponKey]?.cooldown || 0.5);
    return Math.max(base * 0.5, base + getMirrorAnvilBonus(inventory, 'weapon', weaponKey, 'cooldown'));
  }

  function getMirrorBaseDamage(inventory, itemStats) {
    const characterMultiplier = Number(Neo.CHARACTER_DEFS?.[inventory?.character]?.damageMultiplier || 1);
    const flatHitBonus = Math.max(0, Number(itemStats?.flatHitDamageBonus || 0));
    const poisonMultiplier = Neo.getPoisonDamageMultiplier?.(Neo.player) ?? 1;
    return Math.max(1, (Neo.ATTACKS.melee.damage + Number(inventory?.attackPower || 0) + flatHitBonus) * characterMultiplier * poisonMultiplier);
  }

  function getMirrorAttackSpeed(inventory, itemStats) {
    const simulation = globalThis.NeoNyke?.simulation || {};
    const robotArmMultiplier = itemStats?.hasRobotArm && inventory?.robotArmReady
      ? 1 + 7 * Number(simulation.MIRROR_ITEM_EFFECT_STRENGTH || 0.88)
      : 1;
    return Math.max(0.2, Number(inventory?.attackSpeed || 1) * Number(itemStats.attackSpeedMultiplier || 1) * robotArmMultiplier);
  }

  function getMirrorChampionStats() {
    const inventory = createMirrorInventorySnapshot();
    const rawItemStats = clonePlainObject(Neo.getItemStats?.() || getMirrorInventoryItemStats(inventory));
    const itemStats = scaleMirrorItemStats(inventory, rawItemStats);
    const attackSpeed = getMirrorAttackSpeed(inventory, itemStats);
    const baseDamage = getMirrorBaseDamage(inventory, itemStats);
    const equippedMoves = { ...inventory.equippedMoves };
    const meleeMove = equippedMoves.melee || 'slash';
    const laserMove = equippedMoves.laser || 'blood_beam';
    const smashMove = equippedMoves.smash || 'crimson_smash';
    const dashMove = equippedMoves.dash || 'dash';
    const weaponKey = inventory.equippedWeapon || '';
    const getMoveDamage = moveKey => Math.max(1, Math.round(
      ((Neo.MOVE_BASE_STATS[moveKey]?.damage ?? baseDamage)
        + getMirrorAnvilBonus(inventory, 'move', moveKey, 'damage')
        + Number(inventory.attackPower || 0))
      * Number(itemStats.levelEdgeDamageMultiplier || 1)
    ));
    const getMoveCooldown = (moveKey, slot) => {
      const base = Neo.MOVE_BASE_STATS[moveKey]?.cooldown ?? null;
      const characterMult = slot === 'laser' ? Number(Neo.CHARACTER_DEFS?.[inventory.character]?.laserCooldownMultiplier || 1) : 1;
      if (base !== null) return (Math.max(base * 0.5, base + getMirrorAnvilBonus(inventory, 'move', moveKey, 'cooldown')) / attackSpeed) * characterMult;
      if (slot === 'laser') {
        if (moveKey === 'turtle_wave') return (3 / attackSpeed) * characterMult;
        if (moveKey === 'blade_justice') return (5.1 / attackSpeed) * characterMult;
        if (moveKey === 'lightning_columns') return (4.8 / attackSpeed) * characterMult;
        if (moveKey === 'god_sweep') return (7.2 / attackSpeed) * characterMult;
        return (Neo.ATTACKS.laser.baseCooldown / attackSpeed) * characterMult;
      }
      if (slot === 'dash') {
        if (moveKey === 'warp') return 2.8 / attackSpeed;
        if (moveKey === 'nimrod_stomp') return 4.2 / attackSpeed;
        if (moveKey === 'zip_lightning') return 2.0 / attackSpeed;
        if (moveKey === 'cowards_way') return 6 / attackSpeed;
        return 3.2 / attackSpeed;
      }
      if (slot === 'smash') return Neo.ATTACKS.smash.baseCooldown / attackSpeed;
      if (moveKey === 'slash') return 0.4 / attackSpeed;
      return Neo.ATTACKS.melee.baseCooldown / attackSpeed;
    };
    const moveStats = {};
    Object.entries(equippedMoves).forEach(([slot, moveKey]) => {
      if (!moveKey || !Neo.MOVE_BASE_STATS[moveKey]) return;
      moveStats[moveKey] = {
        damage: getMoveDamage(moveKey),
        cooldown: getMoveCooldown(moveKey, slot),
        duration: Math.max(0, Number(Neo.MOVE_BASE_STATS[moveKey]?.duration || 0) + getMirrorAnvilBonus(inventory, 'move', moveKey, 'duration')),
        range: Math.max(0, Number(Neo.MOVE_BASE_STATS[moveKey]?.range || 0) + getMirrorAnvilBonus(inventory, 'move', moveKey, 'range')),
      };
    });
    const weaponStats = weaponKey ? {
      damage: Math.max(1, Math.round(
        (weaponKey === 'excalibur'
          ? baseDamage * 7.77
          : (Neo.WEAPON_BASE_STATS[weaponKey]?.damage ?? baseDamage))
        + getMirrorAnvilBonus(inventory, 'weapon', weaponKey, 'damage')
      )),
      range: Math.max(40, Math.round((Neo.WEAPON_BASE_STATS[weaponKey]?.range ?? Neo.ATTACKS.melee.range) + getMirrorAnvilBonus(inventory, 'weapon', weaponKey, 'range'))),
      knockback: Math.max(0, Math.round((Neo.WEAPON_BASE_STATS[weaponKey]?.knockback ?? Neo.ATTACKS.melee.push) + getMirrorAnvilBonus(inventory, 'weapon', weaponKey, 'knockback'))),
      cooldown: Math.max(0.12, Number(Neo.getWeaponBaseCooldown?.(weaponKey) || getMirrorWeaponCooldown(inventory, weaponKey)) / attackSpeed),
    } : null;
    const meleeDamage = weaponStats
      ? weaponStats.damage
      : getMoveDamage(meleeMove);
    const beamDamage = Math.round(getMoveDamage(laserMove) * Number(itemStats.beamDamageMultiplier || 1));
    const smashDamage = Math.round(getMoveDamage(smashMove) * Number(itemStats.aoeDamageMultiplier || 1));
    const flightBoost = Number(inventory.playerState?.princessFlightTime || 0) > 0 ? 2 : 1;
    const zoomiesBoost = Number(inventory.playerState?.mooggyZoomiesTime || 0) > 0 ? 5 : 1;
    const godBoost = Neo.godTimer > 0 ? 1.25 : 1;
    const laserWeight = Math.max(0, Number(itemStats.laserWeightMultiplier ?? 1));
    const laserSlow = Neo.laserActive ? 1 - 0.6 * laserWeight : 1;
    const moveSpeed = (Neo.PLAYER_BASE_MOVE_SPEED || 228) * flightBoost * zoomiesBoost * godBoost * Number(itemStats.moveSpeedMultiplier || 1) * laserSlow;
    const maxHp = Math.max(1, Number(inventory.maxHp || 120));
    const hp = Neo.clamp(Number(inventory.hp || maxHp), 1, maxHp);
    const currentCooldowns = {};
    ['melee', 'laser', 'smash', 'dash'].forEach(slot => {
      currentCooldowns[slot] = Math.max(0, Number(Neo.getSkillCooldownInfo?.(slot, attackSpeed)?.current || 0));
    });
    return {
      hp,
      maxHp,
      dmg: Math.max(1, meleeDamage),
      beamDamage: Math.max(1, beamDamage),
      smashDamage: Math.max(1, smashDamage),
      speed: Math.max(0, moveSpeed),
      attackCd: Math.max(0, Number(inventory.playerState?.weaponCooldown || currentCooldowns.melee || 0)),
      attackSpeed,
      inventory,
      itemStats,
      equippedMoves,
      equippedWeapon: weaponKey,
      weaponStats,
      moveStats,
      mirrorCooldowns: {
        melee: weaponStats ? weaponStats.cooldown : Math.max(0.12, Number(Neo.getSlotCooldownDuration?.('melee', meleeMove, attackSpeed) || getMoveCooldown(meleeMove, 'melee'))),
        laser: Math.max(0.12, Number(Neo.getSlotCooldownDuration?.('laser', laserMove, attackSpeed) || getMoveCooldown(laserMove, 'laser'))),
        smash: Math.max(0.12, Number(Neo.getSlotCooldownDuration?.('smash', smashMove, attackSpeed) || getMoveCooldown(smashMove, 'smash'))),
        dash: Math.max(0.12, Number(Neo.getSlotCooldownDuration?.('dash', dashMove, attackSpeed) || getMoveCooldown(dashMove, 'dash'))),
      },
      currentCooldowns,
      spriteKey: inventory.character,
    };
  }

  function spawnMirrorChampion() {
    const safeSpawn = findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2 - 150, 18);
    if (!safeSpawn) return null;
    const stats = getMirrorChampionStats();
    Neo.enemyIdSeq = Math.max(0, Number(Neo.enemyIdSeq || 0)) + 1;
    const mirror = {
      id: Neo.enemyIdSeq,
      type: 'mirror_knight',
      x: safeSpawn.x,
      y: safeSpawn.y,
      vx: 0,
      vy: 0,
      r: 16,
      hp: stats.hp,
      max: stats.maxHp,
      speed: stats.speed,
      dmg: stats.dmg,
      beamDamage: stats.beamDamage,
      smashDamage: stats.smashDamage,
      elite: false,
      stun: 0,
      inv: stats.inventory.inv,
      attackCd: stats.attackCd,
      statuses: { ...Neo.createStatusMap(), ...stats.inventory.statuses },
      windup: 0,
      beamTime: 0,
      beamTick: 0,
      beamAngle: 0,
      dashTime: 0,
      dashAngle: 0,
      dashHit: false,
      swingTime: 0,
      summonCd: 0,
      supportCd: 0,
      barrier: stats.inventory.overhealBarrier * Number(globalThis.NeoNyke.simulation.MIRROR_ITEM_EFFECT_STRENGTH || 0.88),
      bossSpawnTimer: 0,
      bossSpawnWarnAt: 0,
      aoeTime: 0,
      phase: 1,
      splitReady: false,
      spawnedFromBulk: false,
      bleedImmune: false,
      bleedResistance: Number(stats.itemStats.bleedResistance || 0),
      fireImmune: false,
      poisonImmune: false,
      dark_drainImmune: false,
      state: 'idle',
      spriteKey: stats.spriteKey,
      mirrorInventory: stats.inventory,
      mirrorPlayerState: stats.inventory.playerState,
      mirrorExactCopy: true,
      mirrorItems: stats.inventory.items,
      mirrorOwnedMoves: stats.inventory.ownedMoves,
      mirrorOwnedWeapons: stats.inventory.ownedWeapons,
      mirrorAnvilUpgrades: stats.inventory.anvilUpgrades,
      mirrorItemStats: stats.itemStats,
      mirrorMoves: stats.equippedMoves,
      mirrorWeapon: stats.equippedWeapon,
      mirrorWeaponStats: stats.weaponStats,
      mirrorMoveStats: stats.moveStats,
      mirrorCooldowns: stats.mirrorCooldowns,
      mirrorLaserCd: stats.currentCooldowns.laser,
      mirrorSmashCd: stats.currentCooldowns.smash,
      mirrorDashCd: stats.currentCooldowns.dash,
      defenseMultiplier: 1 / Math.max(0.01, 1 - Neo.clamp(Number(stats.itemStats.damageReduction || 0), 0, 0.99)),
      flatDamageReduction: Math.max(0, Number(stats.itemStats.flatDamageReduction || 0)),
      stunResistance: Math.max(0, Number(stats.itemStats.stunResistance || 0)),
    };
    Neo.enemies.push(mirror);
    Neo.spawnParticle({ x: mirror.x, y: mirror.y - 28, life: 1, text: 'MIRROR CHAMPION', c: '#d7f6ff' });
    sayOverEntity(mirror, 'I know every move you make.', { speaker: 'MIRROR', tone: 'mirror', holdTime: 1.9 });
    return mirror;
  }

  function spawnMooggyAssassin(preferredX = Neo.ROOM_W / 2, preferredY = Neo.ROOM_H / 2 - 110) {
    if (!Neo.player || Neo.enemies.some(enemy => enemy?.type === 'mooggy')) return null;
    const safeSpawn = findSafeEnemySpawnPoint(preferredX, preferredY, 16)
      || findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2 - 120, 16);
    if (!safeSpawn) return null;
    const mooggy = spawnEnemy('mooggy', safeSpawn.x, safeSpawn.y, false);
    mooggy.assassin = true;
    mooggy.spawnT = Math.max(Number(mooggy.spawnT || 0), 0.9);
    Neo.spawnParticle({ x: mooggy.x, y: mooggy.y - 30, life: 1.5, text: 'MOOGGY HUNTS YOU', c: '#ff3348' });
    sayOverEntity(mooggy, 'Mrow.', { speaker: 'MOOGGY', tone: 'boss', holdTime: 1.4, offsetY: mooggy.r + 34 });
    return mooggy;
  }

  function spawnChallengeStarter(room) {
    if (!room || room.type !== 'challenge') return;
    const existing = Neo.pickups.find(pickup => pickup?.type === 'challengeStarter');
    if (existing) return;
    const tutorialChallenge = Neo.isTutorialRun?.() && room.tutorialLesson === 'challenge';
    Neo.pickups.push({
      x: Neo.ROOM_W / 2,
      y: Neo.ROOM_H / 2 + (tutorialChallenge ? 110 : 0),
      type: 'challengeStarter',
      trial: room.challengeType || 'mirror',
    });
  }

  const CHALLENGE_BOMB_SAFE_COUNT = 3;
  const CHALLENGE_BOMB_UNSAFE_COUNT = 2;
  const CHALLENGE_BOMB_DRIFT_SPEED = 26;

  function spawnChallengeBombs(room) {
    if (!room || room.type !== 'challenge') return;
    if (Neo.pickups.some(pickup => pickup?.type === 'challengeBomb')) return;
    // 3 safe (blue) + 2 unsafe (red) bombs scattered at random spots. The trial
    // only clears once every blue bomb is defused; grabbing any red one fails it.
    const tutorialBombs = Neo.isTutorialRun?.() && room.tutorialLesson === 'challenge';
    const safeCount = tutorialBombs ? 2 : CHALLENGE_BOMB_SAFE_COUNT;
    const unsafeCount = tutorialBombs ? 1 : CHALLENGE_BOMB_UNSAFE_COUNT;
    const total = safeCount + unsafeCount;
    const safeFlags = Array.from({ length: total }, (_, index) => index < safeCount);
    // Fisher-Yates shuffle so which spawns are safe is randomized each trial.
    for (let i = safeFlags.length - 1; i > 0; i -= 1) {
      const j = Neo.irand(0, i, 'loot');
      [safeFlags[i], safeFlags[j]] = [safeFlags[j], safeFlags[i]];
    }
    const margin = 90;
    safeFlags.forEach(safe => {
      let x = Neo.ROOM_W / 2;
      let y = Neo.ROOM_H / 2;
      // Bombs have a real pickup radius and must not overlap solid pillars,
      // walls, furniture, the player, or one another. Probe deterministic
      // random candidates before falling back to the shared safe-point search.
      const bombRadius = 22;
      let found = false;
      for (let attempt = 0; attempt < 32; attempt += 1) {
        const candidateX = Neo.rand(Neo.ROOM_W - margin, margin, 'loot');
        const candidateY = Neo.rand(Neo.ROOM_H - margin, margin, 'loot');
        const overlapsBomb = Neo.pickups.some(pickup => pickup?.type === 'challengeBomb'
          && Math.hypot(pickup.x - candidateX, pickup.y - candidateY) < bombRadius * 3);
        const overlapsPlayer = Neo.player
          && Math.hypot(Neo.player.x - candidateX, Neo.player.y - candidateY) < bombRadius + Neo.player.r + 36;
        if (!Neo.isBlocked(candidateX, candidateY, bombRadius) && !overlapsBomb && !overlapsPlayer) {
          x = candidateX;
          y = candidateY;
          found = true;
          break;
        }
      }
      if (!found) {
        const fallback = findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2, bombRadius);
        if (fallback) ({ x, y } = fallback);
      }
      const heading = Neo.nextRandom('loot') * Math.PI * 2;
      Neo.pickups.push({
        x,
        y,
        vx: Math.cos(heading) * (tutorialBombs ? 0 : CHALLENGE_BOMB_DRIFT_SPEED),
        vy: Math.sin(heading) * (tutorialBombs ? 0 : CHALLENGE_BOMB_DRIFT_SPEED),
        type: 'challengeBomb',
        safe,
      });
    });
  }

  // A failed bomb defusal leaves a telegraphed blast that detonates after a
  // short fuse. Runtime hazard scaling adds cumulative-floor and elapsed-time
  // pressure when it actually explodes.
  const BOMB_FAIL_AOE_FUSE = 3;
  const BOMB_FAIL_AOE_RADIUS = 150;
  function spawnBombFailAoe(x = Neo.ROOM_W / 2, y = Neo.ROOM_H / 2) {
    Neo.hazards.push({
      kind: 'bomb_aoe',
      source: 'challenge_bomb',
      x,
      y,
      r: BOMB_FAIL_AOE_RADIUS,
      blastRadius: BOMB_FAIL_AOE_RADIUS,
      fuse: BOMB_FAIL_AOE_FUSE,
      fuseDuration: BOMB_FAIL_AOE_FUSE,
      baseDamage: 250,
      sparkTick: 0,
    });
    Neo.spawnParticle({ x, y: y - 20, life: 0.6, text: 'DETONATING', c: '#ff7a66', size: 12 });
  }

  function spawnChallengeRunes(room) {
    const count = 5;
    room.challengeData = { runesLeft: count };
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Neo.nextRandom('world') * 0.18;
      const driftAngle = angle + Math.PI / 2 + Neo.rand(-0.55, 0.55, 'world');
      const driftSpeed = Neo.rand(82, 56, 'world');
      Neo.pickups.push({
        x: Neo.ROOM_W / 2 + Math.cos(angle) * 160,
        y: Neo.ROOM_H / 2 + Math.sin(angle) * 160,
        type: 'challengeRune',
        vx: Math.cos(driftAngle) * driftSpeed,
        vy: Math.sin(driftAngle) * driftSpeed,
      });
    }
  }

  function ensureChallengeCircuitData(room) {
    if (!room || room.type !== 'challenge') return false;
    const started = globalThis.NeoNyke?.simulation?.startCampaignCircuitChallenge?.(room, {
      tuning: getChallengeTrialTuning('circuit'),
      random: Neo.createRoomRandom(room, 'challenge:circuit-sequence'),
    });
    return !!started?.ok;
  }

  function spawnChallengeCircuitSwitches(room) {
    if (!room || room.type !== 'challenge') return;
    const started = globalThis.NeoNyke?.simulation?.startCampaignCircuitChallenge?.(room, {
      tuning: getChallengeTrialTuning('circuit'),
      random: Neo.createRoomRandom(room, 'challenge:circuit-sequence'),
    });
    if (!started?.ok) return;
    Neo.pickups = Neo.pickups.filter(pickup => !['challengeItemChoice', 'challengeSwitch'].includes(pickup?.type));
    // Shared descriptors retain type: 'challengeSwitch'; campaign only owns
    // local pickup materialization and the renderer's normal presentation.
    started.switches.forEach(switchDef => Neo.pickups.push({ ...switchDef }));
  }

  function pressChallengeCircuitSwitch(pickup) {
    const room = Neo.currentRoom;
    if (!room || room.type !== 'challenge' || !['circuit', 'stillness'].includes(room.challengeType || 'mirror')) return false;
    if (!room.challengeStarted || room.cleared || pickup?.type !== 'challengeSwitch') return false;
    const result = globalThis.NeoNyke.simulation.resolveCampaignChallengePickup(room, pickup);
    if (!result.ok) return false;
    if (result.type === 'CHALLENGE_SWITCH_CORRECT') {
      Neo.spawnParticle({ x: pickup.x, y: pickup.y - 26, life: 0.45, text: `${result.progress}/${result.total}`, c: pickup.color });
      if (result.complete) {
        completeChallengeTrial('CIRCUIT SOLVED');
      }
      return true;
    }
    Neo.spawnParticle({ x: pickup.x, y: pickup.y - 26, life: 0.65, text: `WRONG -${result.penalty}S`, c: '#ff667d' });
    return true;
  }

  function spawnTrialEnemyWave(count = 1) {
    // In the Protect trial the adds prioritise the ward rune over the player, so
    // tag each spawn here when that trial is active.
    const seeksObelisk = Neo.currentRoom?.type === 'challenge'
      && Neo.currentRoom?.challengeType === 'survival'
      && !!Neo.currentRoom?.challengeData?.obelisk;
    const plan = globalThis.NeoNyke.simulation.createCampaignTrialEnemyWavePlan(count, {
      floorNumber: Neo.floor, width: Neo.ROOM_W, height: Neo.ROOM_H, random: () => Neo.nextRandom('encounter'),
    });
    plan.forEach(descriptor => {
      const safeSpawn = findSafeEnemySpawnPoint(descriptor.x, descriptor.y, 15);
      if (!safeSpawn) return;
      const enemy = spawnEnemy(descriptor.type, safeSpawn.x, safeSpawn.y, false);
      if (enemy && seeksObelisk) enemy.obeliskSeeker = true;
    });
  }

  function beginChallengeTrial(room) {
    if (!room || room.type !== 'challenge' || room.challengeStarted) return;
    room.challengeStarted = true;
    room.challengeTick = 0;
    room.challengeData = {};
    room.challengeFailed = false;
    Neo.pickups = Neo.pickups.filter(pickup => pickup?.type !== 'challengeStarter');
    const type = room.challengeType || 'mirror';
    Neo.gameEvents.emit('challenge:started', { room, challengeType: type });
    if (type === 'mirror') {
      spawnMirrorChampion();
    } else if (type === 'circuit' || type === 'stillness') {
      spawnChallengeCircuitSwitches(room);
      sayAtPosition(Neo.ROOM_W / 2, 130, 'Touch the switches in the light order.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'bomb') {
      const tuning = getChallengeTrialTuning('bomb');
      const tutorialBombs = Neo.isTutorialRun?.() && room.tutorialLesson === 'challenge';
      room.challengeTimer = tutorialBombs ? 90 : Number(tuning.timer || 0);
      room.challengeTick = Number(tuning.tick || 1.8);
      room.challengeData.maxTimer = room.challengeTimer;
      room.challengeData.spawnCount = Number(tuning.spawnCount || 1);
      room.challengeData.targetClearRate = CHALLENGE_CLEAR_RATE_TARGETS.bomb;
      spawnChallengeBombs(room);
      // Five snipers ring the bomb floor; each rolls its own behaviour on spawn.
      for (let index = 0; index < (tutorialBombs ? 0 : 5); index += 1) {
        const angle = (Math.PI * 2 * index) / 5 + Neo.nextRandom('encounter') * 0.4;
        const radius = 200 + Neo.nextRandom('encounter') * 70;
        const safeSpawn = findSafeEnemySpawnPoint(
          Neo.clamp(Neo.ROOM_W / 2 + Math.cos(angle) * radius, 90, Neo.ROOM_W - 90),
          Neo.clamp(Neo.ROOM_H / 2 + Math.sin(angle) * radius, 90, Neo.ROOM_H - 90),
          15,
        );
        if (!safeSpawn) continue;
        spawnEnemy('sniper', safeSpawn.x, safeSpawn.y, false);
      }
      sayAtPosition(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 'Disarm all blue bombs. Red bombs explode.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'survival') {
      const tuning = getChallengeTrialTuning('survival');
      globalThis.NeoNyke.simulation.startCampaignSurvivalChallenge(room, {
        tuning, floorNumber: Neo.floor, width: Neo.ROOM_W, height: Neo.ROOM_H,
      });
      // First wave matches the trial's own spawnCount (used to be forced to a
      // minimum of 3, which meant floor 1-5 always opened with more adds than
      // the tuning intended). Floor 6+'s spawnCount of 6 already provides the
      // ramp-up; no need to also floor the early-floor waves.
      spawnTrialEnemyWave(Math.max(1, Number(room.challengeData.spawnCount || 1)));
      sayAtPosition(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 'Protect the central ward rune.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'runes') {
      const tuning = getChallengeTrialTuning('runes');
      const started = globalThis.NeoNyke.simulation.startCampaignRuneChallenge(room, {
        tuning, width: Neo.ROOM_W, height: Neo.ROOM_H, random: () => Neo.nextRandom('world'),
      });
      started.runes.forEach(rune => Neo.pickups.push(rune));
      sayAtPosition(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 'Claim every rune.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'storm') {
      globalThis.NeoNyke.simulation.startCampaignStormChallenge(room, {
        tuning: getChallengeTrialTuning('storm'),
      });
      Neo.playSfxLoop?.('lightning_storm_loop');
      sayAtPosition(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 'Do not stop moving.', { speaker: 'TRIAL', tone: 'warning' });
    }
    Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 46, life: 0.95, text: getChallengeTrialLabel(type), c: '#d7f6ff' });
  }

  function spawnChallengeReward(text = 'TRIAL CLEARED', authoredRewardKey = '') {
    if (!Neo.currentRoom || Neo.currentRoom.type !== 'challenge' || Neo.currentRoom.challengeRewardSpawned) return;
    Neo.currentRoom.challengeRewardSpawned = true;
    const rewardRandom = Neo.createRoomRandom(Neo.currentRoom, 'challenge:reward');
    const scrollRandom = Neo.createRoomRandom(Neo.currentRoom, 'challenge:scroll-reward');
    const weaponRandom = Neo.createRoomRandom(Neo.currentRoom, 'challenge:weapon-reward');
    const weaponPool = [...Neo.WHITE_WEAPON_POOL, ...(Neo.floor >= 4 ? Neo.PURPLE_WEAPON_POOL : []), ...(Neo.floor >= 7 ? Neo.RED_WEAPON_POOL : [])];
    const plan = globalThis.NeoNyke.simulation.createCampaignChallengeRewardPlan({
      floorNumber: Neo.floor, centerX: Neo.ROOM_W / 2, centerY: Neo.ROOM_H / 2,
      authoredRewardKey: authoredRewardKey || Neo.currentRoom.challengeData?.rewardKey,
      random: rewardRandom, scrollRandom, rollScroll: Neo.rollScrollOfControl,
      scrollChanceMultiplier: Neo.hasLegacy?.('scroll_scholar') ? 1.5 : 1,
      rollEliteItem: random => Neo.rollItemDrop({ elite: true, random }),
      weaponPool, ownedWeapons: Neo.player?.ownedWeapons || {}, weaponRandom,
    });
    if (!plan.ok) return;
    Neo.pickups = Neo.pickups.filter(pickup => !['challengeBomb', 'challengeRune', 'challengeStarter', 'challengeItemChoice', 'challengeSwitch'].includes(pickup?.type));
    plan.pickups.forEach(pickup => {
      if (pickup.type === 'coin') Neo.dropCoins(pickup.x, pickup.y, pickup.amount);
      else Neo.pickups.push({ ...pickup });
    });
    Neo.grantXp(plan.xp);
    if (plan.weaponKey && Neo.player) {
      Neo.player.ownedWeapons[plan.weaponKey] = true;
      const wName = Neo.WEAPON_DEFS[plan.weaponKey]?.name || plan.weaponKey;
      Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 68, life: 1.4, text: `+ ${wName}`, c: '#ffd700' });
    }
    Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 52, life: 1.05, text, c: '#d7f6ff' });
  }

  function completeChallengeTrial(text = 'TRIAL CLEARED') {
    if (!Neo.currentRoom || Neo.currentRoom.type !== 'challenge') return;
    if ((Neo.currentRoom.challengeType || 'mirror') === 'storm') Neo.stopSfxLoop?.('lightning_storm_loop');
    const result = globalThis.NeoNyke.simulation.finishCampaignChallenge(Neo.currentRoom, 'completed', { text });
    if (!result.ok) return;
    const completedType = result.challengeType;
    Neo.gameEvents.emit('challenge:completed', {
      room: Neo.currentRoom,
      challengeType: completedType,
      text: result.text,
    });
    // 'stillness' is a legacy alias for the circuit trial — normalize so the
    // Trial Master achievement counts it as the same type.
    window.achievementEvents?.emit('challenge:beaten', {
      challengeType: result.achievementType,
    });
    spawnChallengeReward(result.text, result.rewardKey);
    Neo.ensureChallengePracticeReturnPortal?.(Neo.currentRoom);
    Neo.updateObjective();
    Neo.scheduleRunSave();
  }

  function failChallengeTrial(text = 'TRIAL FAILED') {
    if (!Neo.currentRoom || Neo.currentRoom.type !== 'challenge') return;
    if ((Neo.currentRoom.challengeType || 'mirror') === 'storm') Neo.stopSfxLoop?.('lightning_storm_loop');
    const result = globalThis.NeoNyke.simulation.finishCampaignChallenge(Neo.currentRoom, 'failed', { text });
    if (!result.ok) return;
    Neo.gameEvents.emit('challenge:failed', {
      room: Neo.currentRoom,
      challengeType: result.challengeType,
      text: result.text,
    });
    Neo.pickups = Neo.pickups.filter(pickup => !result.removePickupTypes.includes(pickup?.type));
    Neo.ensureChallengePracticeReturnPortal?.(Neo.currentRoom);
    Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 52, life: 1.05, text: result.text, c: '#ff8b98' });
    Neo.updateObjective();
    Neo.scheduleRunSave();
  }

  function isBossType(type) {
    return Neo.BOSS_TYPES.has(type);
  }

  function getEnemyProgressionLevel(enemy) {
    if (enemy?.bossRushBoss) {
      return Math.max(1, Math.floor(Number(enemy.level) || 1));
    }
    return Math.max(
      1,
      Number(enemy?.level) || 0,
      Number(enemy?.rivalData?.level) || 0,
      Number(Neo.player?.level) || 0,
      Number(Neo.getProgressionDepth?.()) || 0,
      Number(Neo.floorsEntered) || 0,
      Number(Neo.floor) || 0,
    );
  }

  function getEnemyEvadeDifficultyLevel() {
    const difficulty = Neo.getDifficultyDef?.() || {};
    const key = String(difficulty.key || Neo.selectedDifficulty || 'easy');
    const fixedRanks = { easy: 0, medium: 1, hard: 2, impossible: 3, god: 4 };
    if (Object.prototype.hasOwnProperty.call(fixedRanks, key)) return fixedRanks[key];
    // Fallback only for `custom`. Thresholds track the post-redesign flat HP
    // multipliers (easy 1.0 → god 1.5), not the old brute 2.72 god value.
    const statMultiplier = Math.max(1, Number(difficulty.statMultiplier || 1));
    if (statMultiplier >= 1.45) return 4;
    if (statMultiplier >= 1.28) return 3;
    if (statMultiplier >= 1.14) return 2;
    if (statMultiplier >= 1.04) return 1;
    return 0;
  }

  function getEnemyProjectileEvadeChance(enemy) {
    if (!enemy || enemy.type === 'rival' && enemy.rivalData?.friend) return 0;
    const difficultyRank = getEnemyEvadeDifficultyLevel();
    const level = getEnemyProgressionLevel(enemy);
    const difficultyBonus = [0, 0.06, 0.14, 0.23, 0.33][difficultyRank] || 0;
    const roleBonus = enemy.type === 'handsome_devil'
      ? 0.34
      : isBossType(enemy.type)
        ? 0.2
        : enemy.type === 'rival'
          ? 0.14
          : enemy.elite
            ? 0.08
            : 0;
    // On Easy (rank 0), plain enemies should not dodge the player's shots at all —
    // it reads as "my hits don't connect" and undercuts the forgiving fantasy.
    // Bosses/rivals/elites still juke via roleBonus; everyone else gets a clean 0.
    if (difficultyRank <= 0 && roleBonus <= 0) return 0;
    // Knave body rolls make an elite harder to perceive/bait: +2% dodge per roll.
    const unfazedBonus = (Number(enemy.eliteUnfazed) || 0) * 0.02;
    return Neo.clamp(0.02 + (level - 1) * 0.018 + difficultyBonus + roleBonus + unfazedBonus, 0.02, 0.9);
  }

  function getEnemyIncomingThreat(enemy, padding = 30) {
    if (!enemy) return null;
    if (Neo.laserActive && Array.isArray(Neo.activeBeamPaths)) {
      for (const path of Neo.activeBeamPaths) {
        if (!Array.isArray(path)) continue;
        const segment = Neo.beamPathHitsCircle(path, enemy.x, enemy.y, enemy.r + padding);
        if (segment) return { segment, source: 'player_beam', timeToImpact: 0 };
      }
    }

    let best = null;
    const projectiles = Array.isArray(Neo.projectiles) ? Neo.projectiles : [];
    for (const projectile of projectiles) {
      if (!projectile || projectile.enemy || projectile.life <= 0) continue;
      const vx = Number(projectile.vx || 0);
      const vy = Number(projectile.vy || 0);
      const speedSq = vx * vx + vy * vy;
      if (speedSq < 1600) continue;
      const dx = enemy.x - projectile.x;
      const dy = enemy.y - projectile.y;
      const toward = dx * vx + dy * vy;
      if (toward <= 0) continue;
      const horizon = Math.min(0.7, Math.max(0.12, Number(projectile.life || 0)));
      const timeToImpact = Neo.clamp(toward / speedSq, 0, horizon);
      if (timeToImpact <= 0 || timeToImpact >= horizon) continue;
      const projectedX = projectile.x + vx * timeToImpact;
      const projectedY = projectile.y + vy * timeToImpact;
      const dangerRadius = enemy.r + Number(projectile.r || 0) + padding;
      if (Neo.dist(projectedX, projectedY, enemy.x, enemy.y) > dangerRadius) continue;
      if (!best || timeToImpact < best.timeToImpact) {
        best = {
          segment: {
            x1: projectile.x,
            y1: projectile.y,
            x2: projectile.x + vx * horizon,
            y2: projectile.y + vy * horizon,
          },
          source: projectile,
          timeToImpact,
        };
      }
    }
    return best;
  }

  function isPointThreatenedByPlayerBeam(x, y, radius = 24) {
    if (!Neo.laserActive || !Array.isArray(Neo.activeBeamPaths)) return false;
    return Neo.activeBeamPaths.some(path =>
      Array.isArray(path) && Neo.beamPathHitsCircle(path, x, y, radius));
  }

  function findEnemyEvadeDashAngle(enemy, threatSegment, dashDistance = 190) {
    if (!enemy || !threatSegment) return null;
    const beamAngle = Math.atan2(
      threatSegment.y2 - threatSegment.y1,
      threatSegment.x2 - threatSegment.x1,
    );
    const awayFromPlayer = Neo.angleBetween(Neo.player, enemy);
    const candidates = [
      beamAngle + Math.PI / 2,
      beamAngle - Math.PI / 2,
      awayFromPlayer,
      beamAngle + Math.PI / 2 + 0.42,
      beamAngle + Math.PI / 2 - 0.42,
      beamAngle - Math.PI / 2 + 0.42,
      beamAngle - Math.PI / 2 - 0.42,
    ];
    let best = null;
    candidates.forEach(angle => {
      const targetX = Neo.clamp(
        enemy.x + Math.cos(angle) * dashDistance,
        Neo.WALL + enemy.r,
        Neo.ROOM_W - Neo.WALL - enemy.r,
      );
      const targetY = Neo.clamp(
        enemy.y + Math.sin(angle) * dashDistance,
        Neo.WALL + enemy.r,
        Neo.ROOM_H - Neo.WALL - enemy.r,
      );
      if (Neo.isBlocked(targetX, targetY, enemy.r)) return;
      if (Neo.beamHitsCircle?.(
        threatSegment.x1,
        threatSegment.y1,
        threatSegment.x2,
        threatSegment.y2,
        targetX,
        targetY,
        enemy.r + 12,
      )) return;
      if (isPointThreatenedByPlayerBeam(targetX, targetY, enemy.r + 12)) return;
      const travel = Neo.dist(enemy.x, enemy.y, targetX, targetY);
      const playerDistance = Neo.dist(Neo.player.x, Neo.player.y, targetX, targetY);
      const score = travel + playerDistance * 0.18;
      if (!best || score > best.score) best = { angle, score };
    });
    return best?.angle ?? null;
  }

  function findBowmanWarpDestination(enemy) {
    if (!enemy || !Neo.player) return null;
    const baseAngle = Neo.angleBetween(Neo.player, enemy);
    const idealRange = enemy.phase >= 2 ? 300 : 270;
    let best = null;
    for (let index = 0; index < 12; index += 1) {
      const angle = baseAngle + Math.PI + (index / 12) * Math.PI * 2;
      const range = idealRange + (index % 3 - 1) * 46;
      const preferredX = Neo.clamp(
        Neo.player.x + Math.cos(angle) * range,
        Neo.WALL + enemy.r,
        Neo.ROOM_W - Neo.WALL - enemy.r,
      );
      const preferredY = Neo.clamp(
        Neo.player.y + Math.sin(angle) * range,
        Neo.WALL + enemy.r,
        Neo.ROOM_H - Neo.WALL - enemy.r,
      );
      const landing = findSafeEnemySpawnPoint(preferredX, preferredY, enemy.r);
      if (!landing || isPointThreatenedByPlayerBeam(landing.x, landing.y, enemy.r + 18)) continue;
      const playerDistance = Neo.dist(Neo.player.x, Neo.player.y, landing.x, landing.y);
      const travel = Neo.dist(enemy.x, enemy.y, landing.x, landing.y);
      if (travel < 120) continue;
      const score = travel - Math.abs(playerDistance - idealRange) * 1.4;
      if (!best || score > best.score) best = { ...landing, score };
    }
    return best;
  }

  function warpBowmanBane(enemy) {
    const landing = findBowmanWarpDestination(enemy);
    if (!landing) return false;
    const fromX = enemy.x;
    const fromY = enemy.y;
    enemy.x = landing.x;
    enemy.y = landing.y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.windup = 0;
    enemy.beamTime = 0;
    enemy.beamTick = 0;
    enemy.inv = Math.max(Number(enemy.inv || 0), 0.2);
    enemy.projectileEvadeCd = 2.4;
    enemy.bowmanWarpCd = enemy.phase >= 2 ? 3.2 : 4.4;
    Neo.ringBurst(fromX, fromY, 48, '#c9aaff', 0.28);
    Neo.ringBurst(enemy.x, enemy.y, 62, '#8dd4ff', 0.34);
    Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 12, life: 0.5, text: 'WARP', c: '#c9aaff' });
    return true;
  }

  function updateEnemyProjectileEvade(enemy, dt) {
    const evadeChance = getEnemyProjectileEvadeChance(enemy);
    if (evadeChance <= 0) return false;
    enemy.projectileEvadeCd = Math.max(0, Number(enemy.projectileEvadeCd || 0) - dt);

    if (enemy.projectileEvadeTime > 0) {
      enemy.projectileEvadeTime = Math.max(0, enemy.projectileEvadeTime - dt);
      const dashSpeed = enemy.type === 'bulk_golem'
        ? 610
        : isBossType(enemy.type)
          ? 720
          : enemy.type === 'rival'
            ? 660
            : 580;
      enemy.vx = Math.cos(enemy.projectileEvadeAngle) * dashSpeed;
      enemy.vy = Math.sin(enemy.projectileEvadeAngle) * dashSpeed;
      if (Neo.nextRandom('fx') < dt * 24) {
        Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.16, c: '#9fe8ff', size: 3 });
      }
      if (enemy.projectileEvadeTime <= 0) {
        enemy.vx *= 0.45;
        enemy.vy *= 0.45;
      }
      return true;
    }

    if (enemy.projectileEvadeCd > 0
      || enemy.stun > 0
      || enemy.airborne
      || enemy.queenFinisherActive
      || enemy.spawnT > 0) {
      return false;
    }

    const threat = getEnemyIncomingThreat(enemy);
    if (!threat) {
      enemy.lastProjectileEvadeThreat = null;
      return false;
    }
    if (enemy.lastProjectileEvadeThreat === threat.source) return false;
    enemy.lastProjectileEvadeThreat = threat.source;
    enemy.projectileEvadeCd = 0.18;
    if (Neo.nextRandom('encounter') >= evadeChance) return false;
    if (enemy.type === 'bowman_bane') return warpBowmanBane(enemy);

    const evadeAngle = findEnemyEvadeDashAngle(
      enemy,
      threat.segment,
      enemy.type === 'bulk_golem' ? 150 : 205,
    );
    if (evadeAngle == null) return false;
    enemy.windup = 0;
    enemy.beamTime = 0;
    enemy.beamTick = 0;
    enemy.dashTime = 0;
    enemy.state = 'idle';
    enemy.projectileEvadeAngle = evadeAngle;
    enemy.projectileEvadeTime = enemy.type === 'bulk_golem' ? 0.22 : 0.27;
    enemy.projectileEvadeCd = enemy.type === 'god'
      ? 1.8
      : enemy.type === 'handsome_devil'
        ? 1.5
        : enemy.type === 'rival'
          ? 2.2
          : isBossType(enemy.type)
            ? 2.6
            : 3.2;
    enemy.inv = Math.max(Number(enemy.inv || 0), 0.1);
    Neo.ringBurst(enemy.x, enemy.y, enemy.r + 18, '#9fe8ff', 0.24);
    return true;
  }


  function updateHunterEnemy(enemy, dt) {
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }
    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
    if (distance < enemy.r + Neo.player.r + 10 && enemy.attackCd <= 0) {
      const angle = Math.atan2(dy, dx);
      enemy.attackAnimT = 0.24;
      Neo.damagePlayer(enemy.dmg, angle, 160, enemy.type, { attacker: enemy });
      enemy.attackCd = 1.05;
    }
  }

  function updateCultMageEnemy(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    const hpPct = enemy.hp / enemy.max;
    const desired = hpPct < 0.35 ? 360 : 270;
    const retreat = hpPct < 0.35 && distance < desired ? -1 : 1;
    const direction = distance < desired - 24 ? -retreat : distance > desired + 24 ? retreat : 0;
    if (enemy.attackCd > 0.45 && trySteerEnemyToCover(enemy, dt, desired, 2.6)) {
      // Hold cover while the beam is unavailable instead of idling in open sight.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.5, dt);
    }

    // Close-range AOE nova: when the player crowds the mage it stops being a
    // helpless kiter and detonates a knockback burst to make space. Charges a
    // brief telegraph, then blasts. Only the standard cult_mage uses this —
    // bosses borrowing this function (the Queen) keep their own kit.
    if (enemy.type === 'cult_mage') {
      const wasChargingNova = Number(enemy.novaTimer || 0) > 0;
      enemy.novaTimer = Math.max(0, Number(enemy.novaTimer || 0) - dt);
      enemy.novaCd = Math.max(0, Number(enemy.novaCd || 0) - dt);
      if (wasChargingNova) {
        enemy.vx *= 0.84;
        enemy.vy *= 0.84;
        const charge = 1 - enemy.novaTimer / 0.5;
        Neo.ringBurst(enemy.x, enemy.y, 120 * charge, '#c77bff', 0.14);
        if (enemy.novaTimer <= 0) {
          Neo.blastRadius(enemy.x, enemy.y, 120, Math.round(enemy.dmg * 1.1), '#c77bff', enemy, 300);
        }
        return;
      }
      if (enemy.novaCd <= 0 && enemy.windup <= 0 && enemy.beamTime <= 0 && distance < 150) {
        enemy.novaTimer = 0.5 / tuning.reaction;
        enemy.novaCd = 4.4 * tuning.rangedCadence;
        return;
      }
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      Neo.aimEnemyBeam(enemy, dt, 2.9 * tuning.reaction);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.2, c: '#b455ff' });
      if (enemy.windup <= 0) {
        enemy.beamTime = 0.58;
        enemy.beamTick = 0;
      }
      return;
    }

    if (enemy.beamTime > 0) {
      Neo.tickEnemyBeam(enemy, dt, {
        tick: 0.1,
        range: 460,
        knockback: 145,
        damage: enemy.dmg,
        speedDamp: 0.84,
        turnRate: 1.8,
      });
      return;
    }

    if (enemy.attackCd <= 0 && distance < 430) {
      enemy.windup = 0.86 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + Neo.rollEnemyBeamBias(enemy, 0.18);
      enemy.attackCd = 2.9 * tuning.rangedCadence;
    }
  }

  function updateKnaveEnemy(enemy, dt) {
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      return;
    }

    // Reach of the Knave Blade: the swing connects from a full sword's length
    // away so he no longer has to crowd the player to land a hit.
    const KNAVE_BLADE_REACH = enemy.r + Neo.player.r + 56;
    const KNAVE_BLADE_ARC = 1.15;

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.76;
      enemy.vy *= 0.76;
      // Track the player through the wind-up so the blade lands where they are.
      if (enemy.state !== 'charge') enemy.swingA = Math.atan2(dy, dx);
      if (enemy.windup <= 0) {
        if (enemy.state === 'charge') {
          enemy.dashTime = 0.3;
          enemy.dashHit = false;
        } else {
          // Telegraph + launch the Knave Blade arc (read by the renderer).
          enemy.swingTime = 0.26;
          enemy.bladeHit = false;
          Neo.ringBurst(enemy.x, enemy.y, KNAVE_BLADE_REACH, '#ff8e6c', 0.22);
        }
      }
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 450;
      enemy.vy = Math.sin(enemy.dashAngle) * 450;
      if (!enemy.dashHit && Neo.dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 7) {
        enemy.dashHit = true;
        Neo.damagePlayer(enemy.dmg + 6, enemy.dashAngle, 260, enemy.type, { attacker: enemy });
      }
      return;
    }

    if (enemy.swingTime > 0) {
      enemy.swingTime -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      // Connect once when the arc reaches its apex: a wide forward swipe that
      // hits anything inside the blade's reach and arc, not just on contact.
      if (!enemy.bladeHit && enemy.swingTime <= 0.12) {
        const toPlayer = Math.atan2(dy, dx);
        const angleDiff = Math.abs(Math.atan2(Math.sin(toPlayer - enemy.swingA), Math.cos(toPlayer - enemy.swingA)));
        if (distance < KNAVE_BLADE_REACH && angleDiff < KNAVE_BLADE_ARC) {
          enemy.bladeHit = true;
          Neo.damagePlayer(enemy.dmg + 5, toPlayer, 240, enemy.type, { attacker: enemy });
        }
      }
      return;
    }

    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.8, dt);

    if (enemy.attackCd <= 0) {
      if (distance > 190) {
        enemy.state = 'charge';
        enemy.windup = 0.46;
        enemy.dashAngle = Math.atan2(dy, dx);
        enemy.attackCd = 1.9;
      } else {
        // Knave Blade: a telegraphed sword swing with real reach.
        enemy.state = 'blade';
        enemy.swingA = Math.atan2(dy, dx);
        enemy.windup = 0.28;
        enemy.attackCd = 1.05;
      }
    }
  }

  function updateSniperEnemy(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      Neo.aimEnemyBeam(enemy, dt, 2.6 * tuning.reaction);
      if (enemy.windup <= 0) {
        const angle = enemy.beamAngle;
        const projectileSpeed = 360 * Math.min(1.4, tuning.reaction);
        Neo.spawnProjectile({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * projectileSpeed,
          vy: Math.sin(angle) * projectileSpeed,
          r: 5,
          life: 1.6,
          enemy: true,
          owner: enemy,
          kind: 'sniper_round',
          source: 'sniper_projectile',
          damage: enemy.dmg + 5,
        });
      }
      return;
    }

    if (enemy.swingTime > 0) {
      enemy.swingTime -= dt;
      enemy.vx *= 0.75;
      enemy.vy *= 0.75;
      if (enemy.swingTime <= 0 && distance < enemy.r + Neo.player.r + 20) {
        Neo.damagePlayer(enemy.dmg + 2, Math.atan2(dy, dx), 170, enemy.type, { attacker: enemy });
      }
      return;
    }

    const behavior = enemy.sniperBehavior || 'stayback';

    if (behavior === 'melee') {
      // Closes the gap and favours the weaker melee swing; only falls back to a
      // ranged shot when the player keeps it at arm's length.
      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.6, dt);
      if (enemy.attackCd <= 0) {
        if (distance <= enemy.r + Neo.player.r + 22) {
          enemy.swingTime = 0.16;
          enemy.attackCd = 0.9 * tuning.rangedCadence;
        } else if (distance < 520) {
          enemy.windup = 0.6 / tuning.reaction;
          enemy.beamAngle = Math.atan2(dy, dx);
          enemy.attackCd = 2.2 * tuning.rangedCadence;
        }
      }
      return;
    }

    // Aggressive snipers march into mid-range to fire; staybacks hold a long
    // line and relocate to cover between shots.
    const desired = behavior === 'aggressive' ? 150 : 290;
    const direction = distance < desired - 20 ? -1 : distance > desired + 20 ? 1 : 0;
    if (behavior === 'stayback' && enemy.attackCd > 0.35 && trySteerEnemyToCover(enemy, dt, desired, 3.8)) {
      // Snipers should relocate behind obstacles between shots.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.6, dt);
    }

    if (enemy.attackCd <= 0) {
      if (distance <= 74) {
        enemy.swingTime = 0.16;
        enemy.attackCd = 0.95 * tuning.rangedCadence;
      } else if (distance < 520) {
        enemy.windup = 0.6 / tuning.reaction;
        enemy.beamAngle = Math.atan2(dy, dx);
        enemy.attackCd = 2.2 * tuning.rangedCadence;
      }
    }
  }

  function updateMachineGunnerEnemy(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      Neo.aimEnemyBeam(enemy, dt, 3.2 * tuning.reaction);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.12, c: '#ffb55c' });
      if (enemy.windup <= 0) {
        enemy.burstShots = tuning.supportPower >= 1.22 ? 6 : 5;
        enemy.burstDelay = 0;
        enemy.burstAngle = enemy.beamAngle;
      }
      return;
    }

    if ((enemy.burstShots || 0) > 0) {
      enemy.burstDelay -= dt;
      enemy.vx *= 0.8;
      enemy.vy *= 0.8;
      if (enemy.burstDelay <= 0) {
        enemy.burstDelay = 0.085 * Math.max(0.72, tuning.rangedCadence);
        enemy.burstShots -= 1;
        enemy.attackAnimT = 0.24;
        const baseAngle = Neo.angleBetween(enemy, Neo.player);
        enemy.burstAngle = Neo.turnAngleToward(enemy.burstAngle || baseAngle, baseAngle, 0.22 * tuning.reaction);
        const spread = ((Neo.nextRandom('encounter') - 0.5) * 0.18) / Math.max(0.92, tuning.reaction);
        const fireAngle = enemy.burstAngle + spread;
        const projectileSpeed = 300 * Math.min(1.45, tuning.reaction + 0.06);
        Neo.spawnProjectile({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(fireAngle) * projectileSpeed,
          vy: Math.sin(fireAngle) * projectileSpeed,
          r: 4,
          life: 1.45,
          enemy: true,
          owner: enemy,
          kind: 'machine_round',
          source: 'machine_gunner_projectile',
          damage: enemy.dmg + 2,
        });
        Neo.spawnParticle({ x: enemy.x + Math.cos(fireAngle) * 10, y: enemy.y + Math.sin(fireAngle) * 10, life: 0.12, c: '#ffcf7a' });
      }
      return;
    }

    const desired = 250;
    const direction = distance < desired - 24 ? -1 : distance > desired + 18 ? 1 : 0;
    if (enemy.attackCd > 0.3 && trySteerEnemyToCover(enemy, dt, desired, 4.1)) {
      // Machine gunners should burst, then duck back toward hard cover.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.9, dt);
    }

    if (enemy.attackCd <= 0) {
      if (distance < 90) {
        enemy.swingTime = 0.16;
        enemy.attackCd = 0.88 * tuning.rangedCadence;
      } else if (distance < 460) {
        enemy.windup = 0.38 / tuning.reaction;
        enemy.beamAngle = Math.atan2(dy, dx);
        enemy.attackCd = 2.45 * tuning.rangedCadence;
      }
    }

    if (enemy.swingTime > 0) {
      enemy.swingTime -= dt;
      enemy.vx *= 0.78;
      enemy.vy *= 0.78;
      if (enemy.swingTime <= 0 && distance < enemy.r + Neo.player.r + 18) {
        Neo.damagePlayer(enemy.dmg + 3, Math.atan2(dy, dx), 180, enemy.type, { attacker: enemy });
      }
    }
  }

  function updateGolemEnemy(enemy, dt) {
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    if (enemy.spitWindup > 0) {
      enemy.spitWindup -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      if (enemy.spitWindup <= 0) {
        const angle = Neo.angleBetween(enemy, Neo.player);
        Neo.spawnProjectile({
          x: enemy.x + Math.cos(angle) * (enemy.r + 6),
          y: enemy.y + Math.sin(angle) * (enemy.r + 6),
          vx: Math.cos(angle) * 300,
          vy: Math.sin(angle) * 300,
          r: 9,
          life: 2.2,
          enemy: true,
          owner: enemy,
          kind: 'golem_spit',
          source: 'golem_projectile',
          damage: enemy.dmg + 4,
          knockback: 120 * (enemy.type === 'bulk_golem' ? BULK_GOLEM_KNOCKBACK_MULTIPLIER : 1),
          statusEffects: [{ key: 'poison', chance: 1, stacks: 1, duration: 4.2 }],
        });
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 20, life: 0.5, text: 'SPIT', c: '#9bb05a' });
      }
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      if (enemy.windup <= 0) {
        enemy.dashTime = 0.34;
        enemy.dashHit = false;
      }
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 390;
      enemy.vy = Math.sin(enemy.dashAngle) * 390;
      if (!enemy.dashHit && Neo.dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 10) {
        enemy.dashHit = true;
        Neo.damagePlayer(
          enemy.dmg + 6,
          enemy.dashAngle,
          280 * (enemy.type === 'bulk_golem' ? BULK_GOLEM_KNOCKBACK_MULTIPLIER : 1),
          enemy.type,
          { attacker: enemy },
        );
      }
      return;
    }

    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.1, dt);
    if (enemy.attackCd <= 0) {
      if (distance < 460) {
        enemy.windup = 0.62;
        enemy.dashAngle = Math.atan2(dy, dx);
        enemy.attackCd = 2.6;
      } else {
        // Too far to close the gap with a dash — hurl a sludge spit instead.
        enemy.spitWindup = 0.7;
        enemy.attackCd = 2.6;
      }
    }
  }

  function updateSummonerEnemy(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    const desired = 260;
    const direction = distance < desired - 30 ? -1 : distance > desired + 20 ? 1 : 0;
    if (enemy.attackCd > 0.4 && trySteerEnemyToCover(enemy, dt, desired, 3.2)) {
      // Summoners get time to reposition while their beam is cooling down.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.1, dt);
    }

    enemy.summonCd = Math.max(0, enemy.summonCd - dt);
    if (enemy.summonCd <= 0) {
      enemy.summonCd = (Neo.floor >= 4 ? 4.2 : 5) * Math.max(0.72, tuning.rangedCadence);
      enemy.attackAnimT = 0.24;
      const summonCount = Neo.floor >= 4 && tuning.supportPower >= 1.22 ? 3 : 2;
      for (let index = 0; index < summonCount; index += 1) {
        const angle = Neo.nextRandom('encounter') * Math.PI * 2;
        const px = enemy.x + Math.cos(angle) * (40 + index * 18);
        const py = enemy.y + Math.sin(angle) * (40 + index * 18);
        const safeSpawn = findSafeSummonSpawnPoint(px, py);
        if (safeSpawn) spawnEnemy('cult_follower', safeSpawn.x, safeSpawn.y, false);
      }
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - 18, life: 0.7, text: 'SUMMON', c: '#d59bff' });
    }

    if (enemy.attackCd <= 0 && distance < 360) {
      enemy.windup = 0.6 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + Neo.rollEnemyBeamBias(enemy, 0.17);
      enemy.attackCd = 2.6 * tuning.rangedCadence;
    }

    if (enemy.windup > 0 || enemy.beamTime > 0) {
      updateCultMageEnemy(enemy, dt);
    }
  }

  function updateShieldUnitEnemy(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    const desired = 180;
    const direction = distance < desired - 18 ? -1 : distance > desired + 24 ? 1 : 0;
    steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.6, dt);

    // Taking damage opens a lockout window (set in hitEnemy): while it's active
    // the unit can't reapply shields and its cooldown is held reset, so it can't
    // re-shield itself the instant it's hit.
    enemy._shieldHitLockout = Math.max(0, (enemy._shieldHitLockout || 0) - dt);
    enemy.supportCd = Math.max(0, enemy.supportCd - dt);
    if (enemy._shieldHitLockout > 0) {
      enemy.supportCd = Math.max(enemy.supportCd, 0.5);
    } else if (enemy.supportCd <= 0) {
      enemy.supportCd = 2.9 * Math.max(0.76, tuning.rangedCadence);
      enemy.attackAnimT = 0.24;
      Neo.enemies.forEach(other => {
        if (!other || other === enemy) return;
        if (Neo.dist(enemy.x, enemy.y, other.x, other.y) > 170) return;
        other.barrier = Math.max(other.barrier || 0, Math.round(other.max * 0.22 * tuning.supportPower));
      });
      enemy.barrier = Math.max(enemy.barrier || 0, Math.round(enemy.max * 0.14 * tuning.supportPower));
      Neo.ringBurst(enemy.x, enemy.y, 82, '#7ed6ff', 0.55);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - 18, life: 0.65, text: 'SHIELD', c: '#7ed6ff' });
    }

    if (enemy.attackCd <= 0 && distance < enemy.r + Neo.player.r + 22) {
      enemy.attackAnimT = 0.24;
      Neo.damagePlayer(enemy.dmg, Math.atan2(dy, dx), 170, enemy.type, { attacker: enemy });
      enemy.attackCd = 1.05 * tuning.rangedCadence;
    }
  }

  function updateHealerEnemy(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const nearestWounded = Neo.enemies.reduce((best, candidate) => {
      if (candidate === enemy || candidate.hp >= candidate.max) return best;
      const d = Neo.dist(enemy.x, enemy.y, candidate.x, candidate.y);
      if (!best || d < best.distance) return { enemy: candidate, distance: d };
      return best;
    }, null);
    const target = nearestWounded?.enemy || Neo.player;
    // No wounded ally and no player (e.g. the post-death frame) — nothing to move toward.
    if (!target) { enemy.vx *= 0.9; enemy.vy *= 0.9; return; }
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    const desired = nearestWounded ? 120 : 260;
    const direction = distance < desired - 18 ? -1 : distance > desired + 24 ? 1 : 0;
    if (!nearestWounded && enemy.attackCd > 0.4 && trySteerEnemyToCover(enemy, dt, 250, 2.9)) {
      // Healers without an active support target can play safer angles.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.8, dt);
    }

    enemy.supportCd = Math.max(0, enemy.supportCd - dt);
    if (enemy.supportCd <= 0) {
      enemy.supportCd = (Neo.floor >= 4 ? 2.1 : 2.8) * Math.max(0.74, tuning.rangedCadence);
      let healedAny = false;
      Neo.enemies.forEach(other => {
        if (!other || other === enemy) return;
        if (Neo.dist(enemy.x, enemy.y, other.x, other.y) > 170) return;
        const heal = Math.max(8, Math.round(other.max * (Neo.floor >= 4 ? 0.08 : 0.05) * tuning.supportPower));
        const nextHp = Math.min(other.max, other.hp + heal);
        if (nextHp !== other.hp) {
          other.hp = nextHp;
          healedAny = true;
          Neo.spawnParticle({ x: other.x, y: other.y - 16, life: 0.6, text: `+${heal}`, c: '#79f7bf' });
        }
      });
      if (healedAny) {
        enemy.attackAnimT = 0.24;
        Neo.ringBurst(enemy.x, enemy.y, 76, '#79f7bf', 0.55);
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 18, life: 0.65, text: 'HEAL', c: '#79f7bf' });
      }
    }

    if (enemy.attackCd <= 0 && !nearestWounded && distance < 350) {
      enemy.windup = 0.54 / tuning.reaction;
      enemy.beamAngle = Neo.angleBetween(enemy, Neo.player) + Neo.rollEnemyBeamBias(enemy, 0.16);
      enemy.attackCd = 2.8 * tuning.rangedCadence;
    }

    if (enemy.windup > 0 || enemy.beamTime > 0) {
      updateLaserEnemy(enemy, dt);
    }
  }

  function updateBossSpawnerEnemy(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    // Big telegraphed knockback shockwave: the spawner's only direct defence.
    // Charges briefly, then detonates a wide burst that flings the player far
    // away so it can keep running and finish its summon.
    if (enemy.shoveTimer > 0) {
      enemy.shoveTimer -= dt;
      enemy.vx *= 0.8;
      enemy.vy *= 0.8;
      const charge = 1 - enemy.shoveTimer / 0.7;
      Neo.ringBurst(enemy.x, enemy.y, 200 * charge, '#ff9b5e', 0.14);
      if (enemy.shoveTimer <= 0) {
        Neo.ringBurst(enemy.x, enemy.y, 200, '#ff9b5e', 0.7);
        Neo.blastRadius(enemy.x, enemy.y, 200, Math.round(enemy.dmg * 1.4), '#ff9b5e', enemy, 760);
        Neo.addTrauma(0.5, Neo.angleBetween(enemy, Neo.player), 8);
      }
      return;
    }

    if (enemy.stun > 0) {
      enemy.vx *= 0.92;
      enemy.vy *= 0.92;
    } else {
      // Always flee from the player rather than holding a set range — the
      // spawner is a runner whose job is to survive until the boss arrives.
      const fleeX = -dx / distance;
      const fleeY = -dy / distance;
      if (enemy.attackCd > 0.45 && distance > 280 && trySteerEnemyToCover(enemy, dt, 420, 2.6)) {
        // Break line of sight behind cover when it already has breathing room;
        // when the player is close it commits to a straight sprint away.
      } else {
        steerEnemy(enemy, fleeX, fleeY, enemy.speed, 2.6, dt);
      }
      // Trigger the shove when cornered: the player is close and a hit is ready.
      if (enemy.shoveCd <= 0 && distance < 170) {
        enemy.shoveTimer = 0.7 / tuning.reaction;
        enemy.shoveCd = 5 * tuning.rangedCadence;
        return;
      }
    }
    enemy.shoveCd = Math.max(0, Number(enemy.shoveCd || 0) - dt);

    enemy.bossSpawnTimer = Math.max(0, enemy.bossSpawnTimer - dt);
    const wholeSeconds = Math.ceil(enemy.bossSpawnTimer);
    if (wholeSeconds > 0 && wholeSeconds <= 10 && wholeSeconds !== enemy.bossSpawnWarnAt) {
      enemy.bossSpawnWarnAt = wholeSeconds;
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - 20, life: 0.85, text: `BOSS ${wholeSeconds}`, c: '#ff8e6c' });
    }

    if (enemy.bossSpawnTimer <= 0) {
      const bossType = getFloorBossType();
      const safeSpawn = findSafeEnemySpawnPoint(enemy.x, enemy.y, 18);
      const bossSpawnerIdx = Neo.enemies.indexOf(enemy);
      if (bossSpawnerIdx >= 0) Neo.enemies.splice(bossSpawnerIdx, 1);
      Neo.ringBurst(enemy.x, enemy.y, 120, '#ff9b5e', 0.8);
      if (safeSpawn) {
        const spawnedBoss = spawnEnemy(bossType, safeSpawn.x, safeSpawn.y, false);
        spawnedBoss.hp = Math.round(spawnedBoss.hp * (enemy.queenSummon ? 0.65 : 0.72));
        spawnedBoss.max = spawnedBoss.hp;
        Neo.spawnParticle({ x: spawnedBoss.x, y: spawnedBoss.y - 24, life: 1, text: 'BOSS SPAWNED', c: '#ffb07b' });
      }
      return;
    }

    if (enemy.attackCd <= 0 && distance < 420) {
      enemy.windup = 0.68 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + Neo.rollEnemyBeamBias(enemy, 0.16);
      enemy.attackCd = 3.1 * tuning.rangedCadence;
    }

    if (enemy.windup > 0 || enemy.beamTime > 0) {
      updateLaserEnemy(enemy, dt);
    }
  }

  // Telegraph + detonation radius for the Queen's dying desperation blast.
  // Exposed on Neo so onEnemyDie (combat.js) can trigger the same windup.
  const QUEEN_FINISHER_WINDUP = 1.6;
  // Small, punchy detonation: tight blast radius but big knockback to fling the
  // player away. +400 damage resistance while she charges so she can still be
  // hit (and chunked) but mostly tanks through the windup instead of being fully
  // immune.
  const QUEEN_FINISHER_RADIUS = 190;
  const QUEEN_FINISHER_KNOCKBACK = 820;
  const QUEEN_FINISHER_RESISTANCE = 400;
  Neo.QUEEN_FINISHER_WINDUP = QUEEN_FINISHER_WINDUP;
  Neo.QUEEN_FINISHER_RADIUS = QUEEN_FINISHER_RADIUS;

  function updateCultQueenBoss(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const bossTier = getBossTier(enemy);
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    // Death-defying finisher. Triggered two ways: proactively once she drops
    // below 5% HP, or as a catch-all from onEnemyDie if a single blow would have
    // killed her outright. She holds in place, immune, charging a telegraphed
    // AOE, then detonates with distance-scaled damage and dies with the blast.
    if (!enemy.queenFinisherActive && !enemy.queenFinisherDone && enemy.hp <= enemy.max * 0.05) {
      enemy.queenFinisherActive = true;
      enemy.queenFinisherTimer = QUEEN_FINISHER_WINDUP;
      enemy.hp = Math.max(1, enemy.hp);
      sayOverEntity(enemy, 'Then burn with me!', { holdTime: 1.6 });
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 12, life: 0.6, text: 'CHARGING', c: '#ff6ad5' });
    }
    if (enemy.queenFinisherActive && !enemy.queenFinisherDone) {
      // Hold her in place while the blast charges. She is no longer fully
      // immune — instead she gains +400 damage resistance so the player can
      // still chip her, but she reliably tanks the windup to her detonation.
      enemy.inv = 0;
      enemy.defenseMultiplier = Math.max(Number(enemy.defenseMultiplier || 1), QUEEN_FINISHER_RESISTANCE);
      enemy.hp = Math.max(1, enemy.hp);
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.stun = 0;
      enemy.queenFinisherTimer = Math.max(0, Number(enemy.queenFinisherTimer || 0) - dt);
      // Growing telegraph ring so the player can read the danger zone.
      const charge = 1 - enemy.queenFinisherTimer / QUEEN_FINISHER_WINDUP;
      Neo.ringBurst(enemy.x, enemy.y, QUEEN_FINISHER_RADIUS * charge, '#ff6ad5', 0.16);
      // Her body convulses harder as the blast nears (read at draw time), and the
      // screen builds a low rumble that crescendos into the detonation.
      enemy.queenFinisherShake = 3 + charge * charge * 11;
      // Hold a low rumble that builds with the charge; trauma decays each frame so
      // we top it up rather than letting it stack to full instantly.
      Neo.addTrauma((0.12 + charge * charge * 0.45) * dt * 4);
      if (enemy.queenFinisherTimer <= 0) {
        enemy.queenFinisherDone = true;
        enemy.queenFinisherShake = 0;
        const blastDamage = Math.round(enemy.dmg);
        Neo.ringBurst(enemy.x, enemy.y, QUEEN_FINISHER_RADIUS, '#ff6ad5', 0.7);
        // The telegraph is also the damage ruler: 5x her normal attack at the
        // center, falling linearly to 1x at the indicated outer edge.
        Neo.blastRadius(
          enemy.x,
          enemy.y,
          QUEEN_FINISHER_RADIUS,
          blastDamage,
          '#ff6ad5',
          enemy,
          QUEEN_FINISHER_KNOCKBACK,
          { playerDamageFalloff: { centerMultiplier: 5, edgeMultiplier: 1 } },
        );
        Neo.addTrauma(0.95, Neo.angleBetween(enemy, Neo.player), 12);
        Neo.addHitstop(0.08);
        // Take herself out with the blast.
        enemy.defenseMultiplier = 1;
        enemy.hp = 0;
        Neo.onEnemyDie(enemy);
      }
      return;
    }

    enemy.queenMissileCd = Math.max(0, Number(enemy.queenMissileCd || 0) - dt);
    if (enemy.queenMissileCd <= 0 && distance > 95 && distance < 580 && enemy.stun <= 0) {
      spawnCultQueenMissile(enemy, tuning);
      enemy.queenMissileCd = 3.4 * Math.max(0.78, tuning.rangedCadence) * Math.max(0.52, 1 - bossTier * 0.08);
    }

    enemy.summonCd = Math.max(0, enemy.summonCd - dt);
    if (enemy.summonCd <= 0) {
      enemy.summonCd = 4.6 * Math.max(0.74, tuning.rangedCadence);
      enemy.attackAnimT = 0.24;
      if (!enemy.queenSummonLineShown) {
        enemy.queenSummonLineShown = true;
        sayOverEntity(enemy, 'Come forth, faithful.', { holdTime: 1.7 });
      }
      const summonCount = tuning.supportPower >= 1.22 ? 4 : 3;
      const golemChance = Neo.clamp(0.12 + bossTier * 0.05, 0.12, 0.4);
      const eliteChance = Neo.clamp(0.18 + bossTier * 0.06, 0.18, 0.5);
      const summonerChance = enemy.level >= 10 ? Math.min(0.45, 0.15 + Math.floor((enemy.level - 10) / 5) * 0.05) : 0;
      const spawnerChance = enemy.level >= 20 ? Math.min(0.22, 0.10 + Math.floor((enemy.level - 20) / 5) * 0.03) : 0;
      const hasQueenSpawner = Neo.enemies.some(active => active.type === 'boss_spawner' && active.queenSummon);
      let specialType = null;
      const specialRoll = Neo.nextRandom('encounter');
      if (!hasQueenSpawner && specialRoll < spawnerChance) specialType = 'boss_spawner';
      else if (specialRoll < spawnerChance + summonerChance) specialType = 'summoner';
      for (let index = 0; index < summonCount; index += 1) {
        const angle = (Math.PI * 2 * index) / summonCount + Neo.rng() * 0.8;
        const px = enemy.x + Math.cos(angle) * 54;
        const py = enemy.y + Math.sin(angle) * 54;
        const safeSpawn = findSafeSummonSpawnPoint(px, py);
        if (!safeSpawn) continue;
        const summonType = index === 0 && specialType
          ? specialType
          : Neo.nextRandom('encounter') < golemChance ? 'golem' : 'cult_follower';
        const summonElite = Neo.nextRandom('encounter') < eliteChance;
        const summoned = spawnEnemy(summonType, safeSpawn.x, safeSpawn.y, summonElite && !specialType);
        if (summoned && summonType === 'boss_spawner') {
          summoned.queenSummon = true;
          summoned.bossSpawnTimer = 35;
          summoned.bossSpawnWarnAt = 35;
        }
      }
    }

    updateCultMageEnemy(enemy, dt);
    if (enemy.attackCd <= 0 && distance < enemy.r + Neo.player.r + 18) {
      enemy.attackAnimT = 0.24;
      Neo.damagePlayer(enemy.dmg + 4, Math.atan2(dy, dx), 250, enemy.type, { attacker: enemy });
      enemy.attackCd = 0.95 * tuning.rangedCadence;
    }
  }

  function spawnCultQueenMissile(enemy, tuning = Neo.getEnemyDifficultyTuning()) {
    if (!enemy || !Neo.player) return;
    enemy.attackAnimT = 0.24;
    const tier = getBossTier(enemy);
    const count = Math.min(6, (tuning.supportPower >= 1.22 ? 2 : 1) + tier);
    // Missiles get faster with each floor (the Queen's "level"), capped so they
    // stay dodgeable. Scales both travel speed and homing pursuit speed.
    const floorSpeed = Math.min(1.65, 1 + tier * 0.1);
    const travelSpeed = 165 * floorSpeed;
    const damage = Math.round(enemy.dmg * 0.78);
    const baseAngle = Neo.angleBetween(enemy, Neo.player);
    for (let index = 0; index < count; index += 1) {
      // Fan the volley out symmetrically around the aim direction.
      const spread = count === 1 ? 0 : ((index - (count - 1) / 2) / Math.max(1, count - 1)) * 0.44;
      const angle = baseAngle + spread + (Neo.nextRandom('encounter') - 0.5) * 0.24;
      Neo.spawnProjectile({
        x: enemy.x + Math.cos(angle) * (enemy.r + 8),
        y: enemy.y + Math.sin(angle) * (enemy.r + 8),
        vx: Math.cos(angle) * travelSpeed,
        vy: Math.sin(angle) * travelSpeed,
        r: 8,
        life: 2.45,
        enemy: true,
        bossProjectile: true,
        kind: 'cult_missile',
        source: 'queen_cult_projectile',
        damage,
        knockback: 155,
        color: '#b455ff',
        homing: true,
        homingTurnRate: 2.15 * Math.min(1.24, tuning.reaction),
        homingSpeed: 235 * Math.min(1.18, tuning.reaction) * floorSpeed,
        homingAccel: 3.2,
        // Drain: inflict Dark Drain DoT on the player and heal the Queen on hit
        // (mirrors Thorn's lifesteal). Heal scales with the missile's damage.
        owner: enemy,
        drainHeal: Math.max(2, Math.round(damage * 0.5)),
        statusEffects: [{ key: 'dark_drain', stacks: getBossStatusStacks(enemy, 1), duration: 3.5, chance: 1 }],
      });
    }
    Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 12, life: 0.55, text: 'MISSILE', c: '#d59bff' });
  }

  function updateBulkGolemBoss(enemy, dt) {
    const tier = getBossTier(enemy);
    enemy.speed = 78 * Math.min(1.2, 1 + tier * 0.025);
    enemy.jumpCd = Math.max(0, Number(enemy.jumpCd || 0) - dt);

    if (enemy.bulkJumpTime > 0) {
      enemy.bulkJumpTime = Math.max(0, enemy.bulkJumpTime - dt);
      const duration = Math.max(0.01, Number(enemy.bulkJumpDuration || 0.82));
      const progress = Neo.clamp(1 - enemy.bulkJumpTime / duration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      enemy.x = Number(enemy.bulkJumpStartX || enemy.x) + (Number(enemy.bulkJumpTargetX || enemy.x) - Number(enemy.bulkJumpStartX || enemy.x)) * eased;
      enemy.y = Number(enemy.bulkJumpStartY || enemy.y) + (Number(enemy.bulkJumpTargetY || enemy.y) - Number(enemy.bulkJumpStartY || enemy.y)) * eased;
      enemy.jumpZ = Math.sin(progress * Math.PI) * 92;
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.airborne = true;
      if (progress > 0.62 && !enemy.bulkJumpWarned) {
        enemy.bulkJumpWarned = true;
        Neo.ringBurst(enemy.bulkJumpTargetX, enemy.bulkJumpTargetY, 76, '#ff8844', 0.32);
      }
      if (enemy.bulkJumpTime <= 0) {
        enemy.x = Number(enemy.bulkJumpTargetX || enemy.x);
        enemy.y = Number(enemy.bulkJumpTargetY || enemy.y);
        enemy.jumpZ = 0;
        enemy.airborne = false;
        enemy.bulkJumpWarned = false;
        enemy.jumpCd = 2.4;
        const impactRadius = Math.min(215, 150 + tier * 10);
        Neo.ringBurst(enemy.x, enemy.y, impactRadius, '#ff8844', 0.55);
        Neo.shake = Math.max(Neo.shake, 10);
        Neo.shakeT = Math.max(Neo.shakeT, 0.18);
        if (Neo.dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < impactRadius + Neo.player.r) {
          Neo.damagePlayer(
            Math.round(enemy.dmg * 0.85),
            Neo.angleBetween(enemy, Neo.player),
            330 * BULK_GOLEM_KNOCKBACK_MULTIPLIER,
            enemy.type,
            { attacker: enemy },
          );
        }
        if (enemy.level >= 10) {
          Neo.hazards.push({
            kind: 'bomb_aoe', enemy: true, ownerEnemy: enemy, source: enemy.type,
            x: enemy.x, y: enemy.y, blastRadius: impactRadius + 24,
            fuse: 0.55, fuseDuration: 0.55, ttl: 0.7,
            baseDamage: Math.round(enemy.dmg * 0.62), sparkTick: 0,
            knockback: 240 * BULK_GOLEM_KNOCKBACK_MULTIPLIER,
          });
        }
      }
      return;
    }

    enemy.airborne = false;
    enemy.jumpZ = 0;
    enemy.aoeTime = Math.max(0, enemy.aoeTime - dt);
    if (enemy.aoeTime <= 0) {
      enemy.aoeTime = 3;
      if (!enemy.bulkNovaLineShown) {
        enemy.bulkNovaLineShown = true;
        sayOverEntity(enemy, 'Break under the weight.', { holdTime: 1.7 });
      }
      const aoeRadius = Math.min(225, 173 + tier * 9);
      const aoeDamage = Math.round(enemy.dmg * 0.864);
      Neo.ringBurst(enemy.x, enemy.y, aoeRadius, '#ff8844', 0.5);
      Neo.blastRadius(
        enemy.x,
        enemy.y,
        aoeRadius,
        aoeDamage,
        '#ff8844',
        enemy,
        200 * BULK_GOLEM_KNOCKBACK_MULTIPLIER,
      );
      Neo.shake = 12;
      Neo.shakeT = 0.2;
    }
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nextX = enemy.x + (dx / distance) * enemy.speed * 0.25;
    const nextY = enemy.y + (dy / distance) * enemy.speed * 0.25;
    const pathBlocked = Neo.isBlocked(nextX, enemy.y, enemy.r) && Neo.isBlocked(enemy.x, nextY, enemy.r);
    if (enemy.jumpCd <= 0 && (pathBlocked || distance > 230)) {
      const angle = Math.atan2(dy, dx);
      const targetDistance = Neo.clamp(distance - 84, 80, 260);
      const preferredX = Neo.player.x - Math.cos(angle) * targetDistance + Neo.rand(-34, 34, 'encounter');
      const preferredY = Neo.player.y - Math.sin(angle) * targetDistance + Neo.rand(-34, 34, 'encounter');
      const landing = findSafeEnemySpawnPoint(
        Neo.clamp(preferredX, Neo.WALL + enemy.r, Neo.ROOM_W - Neo.WALL - enemy.r),
        Neo.clamp(preferredY, Neo.WALL + enemy.r, Neo.ROOM_H - Neo.WALL - enemy.r),
        enemy.r,
      );
      if (landing) {
        enemy.bulkJumpDuration = 0.82;
        enemy.bulkJumpTime = enemy.bulkJumpDuration;
        enemy.bulkJumpStartX = enemy.x;
        enemy.bulkJumpStartY = enemy.y;
        enemy.bulkJumpTargetX = landing.x;
        enemy.bulkJumpTargetY = landing.y;
        enemy.windup = 0;
        enemy.dashTime = 0;
        enemy.jumpCd = 99;
        Neo.ringBurst(enemy.x, enemy.y, 64, '#ffb067', 0.35);
        return;
      }
      enemy.jumpCd = 0.8;
    }
    updateGolemEnemy(enemy, dt);
  }

  function spawnPhaseSwords(count, damage, source = 'god_projectile', radius = 190) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Neo.rng() * 0.25;
      const sx = Neo.player.x + Math.cos(angle) * radius;
      const sy = Neo.player.y + Math.sin(angle) * radius;
      const travel = Math.atan2(Neo.player.y - sy, Neo.player.x - sx);
      // Telegraph each blade's origin so the convergence reads before it fires.
      Neo.ringBurst(sx, sy, 18, '#d8c7ff', 0.4);
      Neo.spawnProjectile({
        x: sx,
        y: sy,
        vx: Math.cos(travel) * 260,
        vy: Math.sin(travel) * 260,
        r: 7,
        life: 1.25,
        enemy: true,
        bossProjectile: true,
        kind: 'sword',
        source,
        damage,
        // Converging blades home in so the ring closes on the player.
        homing: true,
        homingTurnRate: 1.6,
        homingSpeed: 280,
        homingAccel: 2.2,
      });
    }
  }

  function spawnGodSwordRing(enemy, count = 10, damage = 26) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Neo.nextRandom('encounter') * 0.18;
      const sx = enemy.x + Math.cos(angle) * 52;
      const sy = enemy.y + Math.sin(angle) * 52;
      Neo.spawnProjectile({
        x: sx,
        y: sy,
        vx: Math.cos(angle) * 280,
        vy: Math.sin(angle) * 280,
        r: 8,
        life: 1.5,
        enemy: true,
        owner: enemy,
        bossProjectile: true,
        kind: 'god_sword',
        source: 'god_projectile',
        damage,
        // The holy blades curve toward the player so the ring can't just be
        // sidestepped — gentle turn rate keeps them dodgeable with movement.
        homing: true,
        homingTurnRate: 1.7,
        homingSpeed: 300,
        homingAccel: 2.4,
      });
    }
  }

  function setGodPartitionAngles(enemy, count) {
    const beamCount = Math.max(4, Math.min(5, Math.round(Number(count || 4))));
    enemy.partitionAngles = Array.from(
      { length: beamCount },
      (_, index) => enemy.partitionAngle + (Math.PI * 2 * index) / beamCount,
    );
  }

  function tickGodPartitionLasers(enemy, dt, runPressure, phaseLevel, tuning, cadenceMult) {
    enemy.beamTime -= dt;
    enemy.beamTick -= dt;
    enemy.vx *= 0.78;
    enemy.vy *= 0.78;
    enemy.partitionAngle += enemy.partitionRotationDir * enemy.partitionRotationSpeed * dt;
    setGodPartitionAngles(enemy, enemy.partitionAngles?.length || runPressure.partitionLaserCount);

    if (enemy.beamTick <= 0) {
      enemy.beamTick = 0.1 * Math.max(0.68, tuning.rangedCadence * cadenceMult);
      const range = Math.hypot(Neo.ROOM_W, Neo.ROOM_H) * 1.15;
      let hitSegment = null;
      for (let index = 0; index < enemy.partitionAngles.length; index += 1) {
        const beamPath = Neo.buildRicochetBeamPath(enemy.x, enemy.y, enemy.partitionAngles[index], range, 0);
        hitSegment = Neo.beamPathHitsCircle(beamPath, Neo.player.x, Neo.player.y, Neo.player.r + 7);
        if (hitSegment) break;
      }
      if (hitSegment) {
        const rawDamage = Math.round(enemy.dmg * (phaseLevel >= 5 ? 0.42 : phaseLevel >= 4 ? 0.36 : 0.3));
        const damage = Neo.scaleEnemyLaserDamage(rawDamage);
        Neo.damagePlayer(damage, hitSegment.angle, phaseLevel >= 4 ? 230 : 190, 'God Beam', { sourceKey: 'god', attacker: enemy });
      }
    }

    if (enemy.beamTime <= 0) {
      enemy.partitionAngles = [];
      enemy.attackCd = 1.15 * tuning.rangedCadence * cadenceMult;
      return true;
    }
    return false;
  }

  function triggerGodPhase(enemy, phase, title, color = '#fff4b8') {
    enemy.phase = phase;
    enemy.windup = 0;
    enemy.beamTime = 0;
    enemy.beamTick = 0;
    enemy.dashTime = 0;
    enemy.swingTime = 0;
    enemy.partitionAngles = [];
    enemy.attackCd = Math.min(enemy.attackCd || 99, 0.7);

    const phaseInv = 1 + Neo.nextRandom('encounter') * 2; // 1-3s invulnerability on phase shift
    enemy.inv = Math.max(enemy.inv || 0, phaseInv);

    // On phase shift, reposition the god away from the player to reset spacing.
    if (Neo.player) {
      const dx = enemy.x - Neo.player.x;
      const dy = enemy.y - Neo.player.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const jumpDistance = Neo.rand(320, 200, 'encounter');
      const targetX = Neo.clamp(enemy.x + nx * jumpDistance, Neo.WALL + enemy.r, Neo.ROOM_W - Neo.WALL - enemy.r);
      const targetY = Neo.clamp(enemy.y + ny * jumpDistance, Neo.WALL + enemy.r, Neo.ROOM_H - Neo.WALL - enemy.r);
      const landing = findSafeEnemySpawnPoint(targetX, targetY, Math.max(18, enemy.r || 18));
      if (landing) {
        Neo.ringBurst(enemy.x, enemy.y, 44, '#ffffff', 0.28);
        enemy.x = landing.x;
        enemy.y = landing.y;
        enemy.vx = 0;
        enemy.vy = 0;
        Neo.ringBurst(enemy.x, enemy.y, 58, '#ffffff', 0.34);
      }
    }

    enemy.state = `godPhase${phase}`;
    Neo.shake = Math.max(Neo.shake, 18 + phase * 2);
    Neo.shakeT = Math.max(Neo.shakeT, 0.34);
    Neo.ringBurst(enemy.x, enemy.y, 150 + phase * 14, color, 1);
    Neo.spawnParticle({ x: enemy.x, y: enemy.y - 34, life: 1.2, text: `PHASE ${phase}`, c: color });
    Neo.spawnParticle({ x: enemy.x, y: enemy.y - 14, life: 1, text: title, c: '#ffffff' });
  }

  function spawnGodCouncil(enemy) {
    const bossTypes = ['queen_cult', 'bulk_golem', 'artificer_knave', 'antony_blemmye'];
    const spawnAngles = [-Math.PI * 0.5, 0, Math.PI * 0.5, Math.PI];
    bossTypes.forEach((type, index) => {
      const angle = spawnAngles[index] || ((Math.PI * 2 * index) / bossTypes.length);
      const px = Neo.clamp(enemy.x + Math.cos(angle) * 220, 110, Neo.ROOM_W - 110);
      const py = Neo.clamp(enemy.y + Math.sin(angle) * 220, 110, Neo.ROOM_H - 110);
      const safeSpawn = findSafeEnemySpawnPoint(px, py, 18) || findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 18);
      if (!safeSpawn) return;
      const boss = spawnEnemy(type, safeSpawn.x, safeSpawn.y, false);
      boss.hp = Math.round(boss.hp * 0.85);
      boss.max = boss.hp;
      boss.attackCd = Math.min(boss.attackCd, 0.8);
      Neo.spawnParticle({ x: boss.x, y: boss.y - 24, life: 1.05, text: Neo.getBossLabel(type), c: '#ffcf8a' });
    });
  }

  function updateArtificerBoss(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const tier = getBossTier(enemy);
    const hpPct = enemy.hp / enemy.max;
    const previousPhase = enemy.phase || 1;
    if (hpPct < 0.34) enemy.phase = 3;
    else if (hpPct < 0.67) enemy.phase = 2;
    else enemy.phase = 1;
    if (enemy.phase >= 2 && previousPhase < 2 && !enemy.artificerPhaseLineShown) {
      enemy.artificerPhaseLineShown = true;
      sayOverEntity(enemy, 'Then bleed trying.', { holdTime: 1.7 });
    }

    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.artificerEchoSwords) {
      enemy.artificerEchoSwords.timer -= dt;
      if (enemy.artificerEchoSwords.timer <= 0) {
        spawnPhaseSwords(enemy.artificerEchoSwords.count, Math.round(enemy.dmg * 0.52), 'artificer_knave_projectile');
        enemy.artificerEchoSwords = null;
      }
    }

    if (enemy.phase === 1) {
      enemy.speed = 132;
      updateKnaveEnemy(enemy, dt);
      return;
    }

    if (enemy.phase === 2) {
      enemy.speed = 120;
      if (enemy.attackCd <= 0) {
        const swordCount = Math.min(16, 8 + tier * 2);
        spawnPhaseSwords(swordCount, Math.round(enemy.dmg * 0.7), 'artificer_knave_projectile');
        if (enemy.level >= 10) enemy.artificerEchoSwords = { timer: 0.55, count: swordCount };
        enemy.attackCd = 2.35 * tuning.rangedCadence;
      }
      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
      if (distance < enemy.r + Neo.player.r + 14 && enemy.swingTime <= 0) {
        enemy.swingTime = 0.2;
        enemy.swingA = Math.atan2(dy, dx);
      }
      if (enemy.swingTime > 0) {
        enemy.swingTime -= dt;
        if (enemy.swingTime <= 0 && distance < enemy.r + Neo.player.r + 24) {
          Neo.damagePlayer(enemy.dmg + 3, Math.atan2(dy, dx), 210, enemy.type, { attacker: enemy });
        }
      }
      return;
    }

    enemy.speed = 62;
    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.2, dt);
    if (enemy.attackCd <= 0) {
      enemy.windup = 0.72 / tuning.reaction;
      enemy.state = 'phase3_swing';
      enemy.attackCd = 6 * tuning.rangedCadence;
    }
    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.74;
      enemy.vy *= 0.74;
      enemy.swingA = Math.atan2(dy, dx);
      if (enemy.windup <= 0) {
        const angle = enemy.swingA;
        if (distance < enemy.r + Neo.player.r + 54) {
          Neo.damagePlayer(enemy.dmg + 16, angle, 340, enemy.type, { attacker: enemy });
        }
        Neo.ringBurst(enemy.x, enemy.y, 86, '#ffd27d', 0.6);
      }
    }
  }

  function spawnBowmanBane() {
    const existing = Neo.enemies.find(enemy => enemy.type === 'bowman_bane');
    if (existing) return existing;
    const safeSpawn = findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2 - 40, 20);
    if (!safeSpawn) return null;
    const boss = spawnEnemy('bowman_bane', safeSpawn.x, safeSpawn.y, false);
    const line = Neo.BOSS_OPENING_DIALOGUE['bowman_bane'];
    if (boss && Neo.player?.character === 'thorn_knight') {
      const encounterRoom = Neo.currentRoom;
      if (encounterRoom) encounterRoom.baneEscapeWarningPlayed = true;
      positionPlayerNearEntity(boss);
      boss.attackCd = Math.max(Number(boss.attackCd || 0), 2);
      boss.stun = Math.max(Number(boss.stun || 0), 0.4);
      Neo.uiController.playDialogue([
        { speaker: 'BOWMAN BANE', text: 'Run, Thorn!!' },
        { speaker: 'BOWMAN BANE', text: 'You cannot win this fight. The entrance is sealed. Find the hidden door and escape!' },
        { speaker: 'THORN', text: 'Thank you, Sarge.' },
      ], {
        returnState: 'play',
        onComplete: () => Neo.revealBowmanBaneEscape?.(encounterRoom),
      });
    } else if (boss && line) {
      sayOverEntity(boss, line);
    }
    Neo.spawnParticle({ x: boss.x, y: boss.y - boss.r - 14, life: 1.1, text: "BOWMAN'S BANE", c: '#c9aaff' });
    return boss;
  }

  // Thunder smash: no-windup melee arc for players who close the gap through a
  // warp cooldown. Bowman's Bane had no answer to being hugged besides
  // teleporting away; this punishes sticking to him directly.
  function spawnBowmanThunderSmash(enemy) {
    const angle = Neo.angleBetween(enemy, Neo.player);
    const reach = enemy.r + Neo.player.r + 70;
    const halfArc = 0.9;
    const damage = Math.round(enemy.dmg * 1.1);
    enemy.attackAnimT = 0.3;
    enemy.swingTime = 0.32;

    const arcMotes = 10;
    for (let i = 0; i < arcMotes; i += 1) {
      const t = i / (arcMotes - 1) - 0.5;
      const a = angle + t * 2 * halfArc;
      const reachAt = reach * (0.7 + 0.3 * (1 - Math.abs(t) * 1.4));
      Neo.spawnParticle({
        x: enemy.x + Math.cos(a) * reachAt,
        y: enemy.y + Math.sin(a) * reachAt,
        life: 0.24,
        c: '#8dd4ff',
        size: 3.6,
      });
    }

    if (Neo.player) {
      const pdx = Neo.player.x - enemy.x;
      const pdy = Neo.player.y - enemy.y;
      const pDist = Math.hypot(pdx, pdy) || 1;
      let delta = Math.abs(Math.atan2(pdy, pdx) - angle);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      if (pDist <= reach && delta <= halfArc) {
        Neo.damagePlayer(damage, Math.atan2(pdy, pdx), 300, enemy.type, { attacker: enemy });
        Neo.applyStatus?.(Neo.player, 'slow', 1, 2.4, enemy.type);
      }
    }
    Neo.playSfx?.('lightning_charge');
    Neo.shake = Math.max(Neo.shake, 9);
    Neo.shakeT = Math.max(Neo.shakeT, 0.16);
  }

  function updateBowmanBane(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const tier = getBossTier(enemy);
    const hpPct = enemy.hp / enemy.max;
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (hpPct < 0.5 && enemy.phase === 1) {
      enemy.phase = 2;
      sayOverEntity(enemy, 'JUSTICE OF SONICHU!', { holdTime: 1.8 });
      spawnJusticeOfSonichu(enemy);
      enemy.sonichuCd = 6.5;
    }

    if (hpPct <= 0.22 && enemy.phase === 2) {
      enemy.phase = 3;
      enemy.dmg = Math.round(enemy.dmg * 1.15);
      sayOverEntity(enemy, "You've seen nothing yet!", { holdTime: 1.7 });
      spawnJusticeOfSonichu(enemy);
      enemy.sonichuCd = 4.6;
      Neo.ringBurst(enemy.x, enemy.y, 140, '#8dd4ff', 0.8);
    }

    // Phase 2+: re-cast the room-spanning lightning barrage on a cooldown,
    // faster once phase 3 kicks in.
    if (enemy.phase >= 2) {
      enemy.sonichuCd = Math.max(0, Number(enemy.sonichuCd || 0) - dt);
      if (enemy.sonichuCd <= 0 && enemy.stun <= 0) {
        enemy.sonichuCd = (enemy.phase >= 3 ? 5.2 : 7.5) * tuning.rangedCadence;
        sayOverEntity(enemy, 'JUSTICE OF SONICHU!', { holdTime: 1.2 });
        spawnJusticeOfSonichu(enemy);
      }
    }

    enemy.bowmanWarpCd = Math.max(0, Number(enemy.bowmanWarpCd || 0) - dt);
    enemy.thunderSmashCd = Math.max(0, Number(enemy.thunderSmashCd || 0) - dt);
    // Thunder smash: melee punish for players who stick to him through a warp
    // cooldown instead of respecting his range — otherwise he has no answer to
    // being hugged besides teleporting away.
    if (enemy.thunderSmashCd <= 0 && enemy.attackCd <= 0 && enemy.stun <= 0
      && distance < enemy.r + Neo.player.r + 74) {
      spawnBowmanThunderSmash(enemy);
      enemy.thunderSmashCd = 2.1 * tuning.rangedCadence;
      enemy.attackCd = 0.9;
      return;
    }

    enemy.columnCd = Math.max(0, Number(enemy.columnCd || 0) - dt);
    if (enemy.columnCd <= 0 && enemy.stun <= 0) {
      enemy.columnCd = enemy.phase >= 3 ? 2.0 * tuning.rangedCadence : enemy.phase >= 2 ? 2.8 * tuning.rangedCadence : 4.2 * tuning.rangedCadence;
      const columnCount = Math.min(8, (enemy.phase >= 3 ? 5 : enemy.phase >= 2 ? 4 : 2) + tier);
      const predicted = { x: Neo.player.x + (Neo.player.vx || 0) * 0.55, y: Neo.player.y + (Neo.player.vy || 0) * 0.55 };
      for (let index = 0; index < columnCount; index += 1) {
        const spread = (index - (columnCount - 1) / 2) * 72;
        const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
        const cx = Neo.clamp(predicted.x + Math.cos(perpAngle) * spread + Neo.rand(-30, 30, 'encounter'), 80, Neo.ROOM_W - 80);
        const cy = Neo.clamp(predicted.y + Math.sin(perpAngle) * spread + Neo.rand(-30, 30, 'encounter'), 80, Neo.ROOM_H - 80);
        Neo.hazards.push({
          kind: 'lightning_column',
          enemy: true,
          ownerEnemy: enemy,
          source: 'bowman_bane',
          x: cx,
          y: cy,
          r: 44,
          ttl: enemy.phase >= 2 ? 3.4 : 2.6,
          tick: 0.15,
          interval: 0.38,
          damage: Math.round(enemy.dmg * 0.95),
        });
        Neo.ringBurst(cx, cy, 22, '#8dd4ff', 0.45);
      }
      Neo.playSfx?.('lightning_charge');
    }

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.82;
      enemy.vy *= 0.82;
      Neo.aimEnemyBeam(enemy, dt, 2.8 * tuning.reaction);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.14, c: '#8dd4ff' });
      if (enemy.windup <= 0) {
        enemy.beamTime = enemy.phase >= 2 ? 0.72 : 0.52;
        enemy.beamTick = 0;
      }
      return;
    }

    if (enemy.beamTime > 0) {
      Neo.tickEnemyBeam(enemy, dt, {
        tick: 0.1 * Math.max(0.72, tuning.rangedCadence),
        range: 480,
        knockback: 170,
        damage: Math.round(enemy.dmg * (enemy.phase >= 3 ? 1.4 : 1.25)),
        speedDamp: 0.82,
        turnRate: enemy.phase >= 2 ? 2.8 * tuning.reaction : 2.2 * tuning.reaction,
      });
      return;
    }

    if (enemy.bowmanWarpCd <= 0
      && (distance < 170 || distance > 390 || enemy.phase >= 2)
      && warpBowmanBane(enemy)) {
      return;
    }

    const desired = enemy.phase >= 2 ? 200 : 260;
    const direction = distance < desired - 30 ? -1 : distance > desired + 30 ? 1 : 0;
    steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.4, dt);

    if (enemy.attackCd <= 0 && distance < 420) {
      enemy.windup = (enemy.phase >= 3 ? 0.42 : enemy.phase >= 2 ? 0.54 : 0.72) / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + Neo.rollEnemyBeamBias(enemy, 0.18);
      enemy.attackCd = (enemy.phase >= 3 ? 1.9 : enemy.phase >= 2 ? 2.4 : 3.2) * tuning.rangedCadence;
    }
  }

  // "Justice of Sonichu": Bowman's Bane's phase-2 ultimate. Calls down a fan of
  // room-spanning lightning bolts that streak across the arena like lasers. Each
  // bolt telegraphs along its line for a beat, then strikes. One bolt is aimed
  // through the player's position; the rest sweep the room at staggered angles.
  function spawnJusticeOfSonichu(enemy) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const cx = Neo.ROOM_W / 2;
    const cy = Neo.ROOM_H / 2;
    // Long enough to always span the whole room from the center pivot.
    const reach = Math.hypot(Neo.ROOM_W, Neo.ROOM_H);
    const boltCount = Math.min(9, 5 + getBossTier(enemy));
    const aimAngle = Math.atan2(Neo.player.y - cy, Neo.player.x - cx);
    for (let index = 0; index < boltCount; index += 1) {
      // Spread the bolts evenly around the room, anchored on the player's bearing.
      const angle = aimAngle + (index - (boltCount - 1) / 2) * (Math.PI / boltCount);
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      // Stagger the strikes so they cascade rather than all landing at once.
      const warn = (0.7 + index * 0.16) / Math.max(0.6, tuning.reaction);
      Neo.hazards.push({
        kind: 'lightning_strike_line',
        enemy: true,
        source: 'justice_of_sonichu',
        x1: cx - dirX * reach,
        y1: cy - dirY * reach,
        x2: cx + dirX * reach,
        y2: cy + dirY * reach,
        r: 30,
        warn,
        warnTick: 0,
        tick: 0,
        interval: 0.12,
        // ~0.55s active strike window after the telegraph.
        ttl: warn + 0.55,
        damage: Math.round(enemy.dmg * 1.15),
      });
    }
    Neo.ringBurst(enemy.x, enemy.y, 60, '#bfe4ff', 0.5);
    Neo.shake = Math.max(Neo.shake, 9);
    Neo.shakeT = Math.max(Neo.shakeT, 0.18);
  }

  // Directional hammer shockwave: a wave of damage that travels forward in the
  // facing direction instead of a full circle. Implemented as a series of
  // advancing damage arcs spawned over a few frames via a lightweight pulse.
  function spawnAntonyHammerSwing(enemy) {
    const angle = Number.isFinite(enemy.antonyHammerAngle)
      ? enemy.antonyHammerAngle
      : Neo.angleBetween(enemy, Neo.player);
    enemy.antonyShockwave = {
      angle,
      damage: Math.round(enemy.dmg * 0.7),
      // Wave geometry: travels `range` px outward, only hits within `halfArc`
      // of the facing direction, in a band `bandWidth` thick.
      range: 320,
      speed: 620,
      travelled: enemy.r + 12,
      halfArc: 0.54,
      bandWidth: 56,
      hit: false,
    };
    Neo.ringBurst(enemy.x, enemy.y, 70, '#ffcf8a', 0.34);
    Neo.shake = Math.max(Neo.shake, 13);
    Neo.shakeT = Math.max(Neo.shakeT, 0.22);
  }

  // Advance the active directional shockwave: move the wave front outward, draw
  // a crescent of motes along it, and damage the player when the front reaches
  // them inside the arc. Returns true while the wave is still alive.
  function updateAntonyShockwave(enemy, dt) {
    const wave = enemy.antonyShockwave;
    if (!wave) return false;
    const prev = wave.travelled;
    wave.travelled += wave.speed * dt;
    const front = wave.travelled;

    // Telegraph / visual: scatter motes along the advancing crescent.
    const moteCount = 7;
    for (let i = 0; i < moteCount; i += 1) {
      const a = wave.angle + (i / (moteCount - 1) - 0.5) * 2 * wave.halfArc;
      Neo.spawnParticle({
        x: enemy.x + Math.cos(a) * front,
        y: enemy.y + Math.sin(a) * front,
        life: 0.22,
        c: '#ffcf8a',
        size: 3.2,
      });
    }

    if (!wave.hit && Neo.player) {
      const pdx = Neo.player.x - enemy.x;
      const pdy = Neo.player.y - enemy.y;
      const pDist = Math.hypot(pdx, pdy) || 1;
      const pAngle = Math.atan2(pdy, pdx);
      let delta = Math.abs(pAngle - wave.angle);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      const inArc = delta <= wave.halfArc;
      // The band swept this frame, padded by the player radius.
      const reached = pDist >= prev - wave.bandWidth / 2 - Neo.player.r
        && pDist <= front + wave.bandWidth / 2 + Neo.player.r;
      if (inArc && reached) {
        wave.hit = true;
        Neo.damagePlayer(wave.damage, pAngle, 320, enemy.type, { attacker: enemy });
      }
    }

    if (wave.travelled >= wave.range) {
      enemy.antonyShockwave = null;
      return false;
    }
    return true;
  }

  // Close-range sweeping slash: a wide melee arc in front of the boss, distinct
  // from the short bite. Hits anything inside a forward cone within reach.
  function spawnAntonySlash(enemy) {
    const angle = Neo.angleBetween(enemy, Neo.player);
    const reach = enemy.r + Neo.player.r + 66;
    const halfArc = 0.82;
    const damage = Math.round(enemy.dmg * 0.92);
    enemy.attackAnimT = 0.3;
    enemy.swingTime = 0.32;

    // Slash arc visual.
    const arcMotes = 9;
    for (let i = 0; i < arcMotes; i += 1) {
      const t = i / (arcMotes - 1) - 0.5;
      const a = angle + t * 2 * halfArc;
      const reachAt = reach * (0.7 + 0.3 * (1 - Math.abs(t) * 1.4));
      Neo.spawnParticle({
        x: enemy.x + Math.cos(a) * reachAt,
        y: enemy.y + Math.sin(a) * reachAt,
        life: 0.26,
        c: '#fff0c4',
        size: 3.6,
      });
    }

    if (Neo.player) {
      const pdx = Neo.player.x - enemy.x;
      const pdy = Neo.player.y - enemy.y;
      const pDist = Math.hypot(pdx, pdy) || 1;
      let delta = Math.abs(Math.atan2(pdy, pdx) - angle);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      if (pDist <= reach && delta <= halfArc) {
        Neo.damagePlayer(damage, Math.atan2(pdy, pdx), 300, enemy.type, { attacker: enemy });
      }
    }
    Neo.shake = Math.max(Neo.shake, 7);
    Neo.shakeT = Math.max(Neo.shakeT, 0.12);
  }

  // Charged "cold death ball": a fast, heavy frost orb fired after a windup.
  function spawnAntonyDeathBall(enemy) {
    const baseAngle = Number.isFinite(enemy.antonyDeathBallAngle)
      ? enemy.antonyDeathBallAngle
      : Neo.angleBetween(enemy, Neo.player);
    const count = enemy.level >= 25 ? 3 : enemy.level >= 10 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const angle = baseAngle + (index - (count - 1) / 2) * 0.24;
      const coldStacks = getBossStatusStacks(enemy, 1);
      Neo.spawnProjectile({
        x: enemy.x + Math.cos(angle) * (enemy.r + 14),
        y: enemy.y + Math.sin(angle) * (enemy.r + 14),
        vx: Math.cos(angle) * 525,
        vy: Math.sin(angle) * 525,
        r: 38, life: 3.4, enemy: true, owner: enemy, bossProjectile: true,
        kind: 'cold_death', source: 'antony_death_ball',
        damage: Math.round(enemy.dmg * 1.1), knockback: 230, color: '#9fe8ff',
        statusEffects: [{ key: 'slow', chance: 1, stacks: coldStacks, duration: 4 }],
        enemyBlast: { radius: enemy.level >= 5 ? 145 : 120, damage: Math.round(enemy.dmg * 0.65), color: '#9fe8ff', statusKey: 'slow', statusStacks: coldStacks, statusDuration: 3 },
        homing: true, homingTurnRate: 0.65, homingSpeed: 570, homingAccel: 1.1,
      });
    }
    Neo.ringBurst(enemy.x, enemy.y, 46, '#9fe8ff', 0.45);
    Neo.shake = Math.max(Neo.shake, 9);
    Neo.shakeT = Math.max(Neo.shakeT, 0.16);
  }

  function updateAntonyBlemmyeBoss(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    enemy.hammerCd = Math.max(0, Number(enemy.hammerCd || 0) - dt);
    enemy.biteCd = Math.max(0, Number(enemy.biteCd || 0) - dt);
    enemy.slashCd = Math.max(0, Number(enemy.slashCd || 0) - dt);
    enemy.deathBallCd = Math.max(0, Number(enemy.deathBallCd || 0) - dt);
    enemy.antonyComboTimer = Math.max(0, Number(enemy.antonyComboTimer || 0) - dt);
    enemy.biteAnimT = Math.max(0, Number(enemy.biteAnimT || 0) - dt);

    if (enemy.beamTime > 0 && enemy.state === 'antonyMouthBeam') {
      Neo.tickEnemyBeam(enemy, dt, {
        tick: 0.085 * Math.max(0.7, tuning.rangedCadence), range: 610,
        knockback: 210, damage: Math.round(enemy.dmg * 0.72), speedDamp: 0.8,
        turnRate: 1.45 * tuning.reaction, damageSource: 'antony_mouth_beam',
        onHit: () => {
          if (Neo.nextRandom('encounter') < 0.28) Neo.applyFire?.(Neo.player, getBossStatusStacks(enemy, 1), 3.2, enemy.type);
        },
        onEnd: activeEnemy => { activeEnemy.state = null; activeEnemy.attackCd = 1.2; },
      });
      return;
    }

    if (enemy.level >= 20 && enemy.antonyComboTimer <= 0 && enemy.antonyComboQueued) {
      enemy.antonyComboQueued = false;
      enemy.state = 'antonyMouthBeam';
      enemy.windup = 0.62 / tuning.reaction;
      enemy.beamAngle = Neo.angleBetween(enemy, Neo.player);
    }

    // Drive an in-flight directional hammer shockwave independent of windup.
    if (enemy.antonyShockwave) updateAntonyShockwave(enemy, dt);

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      // Telegraph charging attacks toward the locked facing direction.
      if (enemy.state === 'antonyHammer' && Number.isFinite(enemy.antonyHammerAngle)) {
        const a = enemy.antonyHammerAngle;
        Neo.spawnParticle({ x: enemy.x + Math.cos(a) * (enemy.r + 30), y: enemy.y + Math.sin(a) * (enemy.r + 30), life: 0.18, c: '#ffcf8a', size: 3 });
      } else if (enemy.state === 'antonyDeathBall') {
        Neo.spawnParticle({ x: enemy.x + Neo.rand(-14, 14), y: enemy.y + Neo.rand(-14, 14), life: 0.2, c: '#9fe8ff', size: 3 });
      } else {
        Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.16, c: '#ffcf8a' });
      }
      if (enemy.windup <= 0) {
        if (enemy.state === 'antonyHammer') {
          spawnAntonyHammerSwing(enemy);
          enemy.attackCd = 1.35 * tuning.rangedCadence;
        } else if (enemy.state === 'antonyDeathBall') {
          spawnAntonyDeathBall(enemy);
          enemy.attackCd = 1.2 * tuning.rangedCadence;
        } else if (enemy.state === 'antonyMouthBeam') {
          enemy.beamTime = 1.05;
          enemy.beamTick = 0;
          return;
        }
        enemy.state = null;
      }
      return;
    }

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    const desired = 92;
    const direction = distance < desired - 24 ? -0.6 : 1;
    steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.7, dt);

    // Bite: very short range life-drain chomp (unchanged).
    if (enemy.biteCd <= 0 && distance < enemy.r + Neo.player.r + 26) {
      const angle = Math.atan2(dy, dx);
      const biteDamage = Math.round(enemy.dmg * 0.82);
      enemy.attackAnimT = 0.28;
      enemy.biteAnimT = 0.8;
      Neo.damagePlayer(biteDamage, angle, 240, enemy.type, { attacker: enemy });
      if (enemy.level >= 20) {
        enemy.antonyComboQueued = true;
        enemy.antonyComboTimer = 0.48;
      }
      if (Neo.nextRandom('encounter') < 0.35) {
        // Owner reference lets the dark_drain DoT siphon HP back to Antony over
        // its duration (mirrors how the player's drain heals off the DoT).
        Neo.applyDarkDrain?.(Neo.player, 2, 4.2, { sourceKey: enemy.type, owner: enemy });
        const heal = Math.round(biteDamage * 0.35);
        enemy.hp = Math.min(enemy.max, enemy.hp + heal);
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 12, life: 0.55, text: `+${heal}`, c: '#b48cff' });
      }
      enemy.biteCd = 1.9 * tuning.rangedCadence;
      enemy.attackCd = Math.max(enemy.attackCd, 0.55);
      return;
    }

    // Slash: wide sweeping melee arc when the player is close (longer reach than
    // the bite, no windup so it punishes hugging the boss).
    if (enemy.slashCd <= 0 && enemy.attackCd <= 0 && distance < enemy.r + Neo.player.r + 70) {
      spawnAntonySlash(enemy);
      enemy.slashCd = 2.45 * tuning.rangedCadence;
      enemy.attackCd = 0.85;
      if (!enemy.antonySlashLineShown) {
        enemy.antonySlashLineShown = true;
        sayOverEntity(enemy, 'Carve you open.', { holdTime: 1.4 });
      }
      return;
    }

    // Cold death ball: charged frost orb fired at mid/long range.
    if (enemy.deathBallCd <= 0 && enemy.attackCd <= 0 && distance > enemy.r + Neo.player.r + 40) {
      enemy.state = 'antonyDeathBall';
      enemy.windup = 1.05 / tuning.reaction;
      enemy.antonyDeathBallAngle = Math.atan2(dy, dx);
      enemy.deathBallCd = 7.2 * tuning.rangedCadence;
      enemy.attackCd = 1.2;
      if (!enemy.antonyDeathBallLineShown) {
        enemy.antonyDeathBallLineShown = true;
        sayOverEntity(enemy, 'Feel the cold.', { holdTime: 1.5 });
      }
      return;
    }

    // Hammer: directional shockwave that travels forward (no longer a circle).
    if (enemy.hammerCd <= 0 && distance < 320 && enemy.attackCd <= 0) {
      enemy.state = 'antonyHammer';
      enemy.windup = 0.9 / tuning.reaction;
      enemy.antonyHammerAngle = Math.atan2(dy, dx);
      enemy.hammerCd = 4.1 * tuning.rangedCadence;
      enemy.attackCd = 1.0;
      if (!enemy.antonyHammerLineShown) {
        enemy.antonyHammerLineShown = true;
        sayOverEntity(enemy, 'Open wide.', { holdTime: 1.5 });
      }
    }
  }

  // Claw slash: no-windup melee punish for players who close the distance,
  // mirrors spawnAntonySlash's arc-check but burns + bleeds on hit.
  function spawnDevilClawSlash(enemy) {
    const angle = Neo.angleBetween(enemy, Neo.player);
    const reach = enemy.r + Neo.player.r + 64;
    const halfArc = 0.86;
    const damage = Math.round(enemy.dmg * 1.05);
    enemy.attackAnimT = 0.28;
    enemy.swingTime = 0.3;

    const arcMotes = 9;
    for (let i = 0; i < arcMotes; i += 1) {
      const t = i / (arcMotes - 1) - 0.5;
      const a = angle + t * 2 * halfArc;
      const reachAt = reach * (0.7 + 0.3 * (1 - Math.abs(t) * 1.4));
      Neo.spawnParticle({
        x: enemy.x + Math.cos(a) * reachAt,
        y: enemy.y + Math.sin(a) * reachAt,
        life: 0.26,
        c: '#ff3348',
        size: 3.8,
      });
    }

    if (Neo.player) {
      const pdx = Neo.player.x - enemy.x;
      const pdy = Neo.player.y - enemy.y;
      const pDist = Math.hypot(pdx, pdy) || 1;
      let delta = Math.abs(Math.atan2(pdy, pdx) - angle);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      if (pDist <= reach && delta <= halfArc) {
        Neo.damagePlayer(damage, Math.atan2(pdy, pdx), 260, enemy.type, { attacker: enemy });
        Neo.applyFire?.(Neo.player, getBossStatusStacks(enemy, 1), 2.8, enemy.type);
      }
    }
    Neo.shake = Math.max(Neo.shake, 7);
    Neo.shakeT = Math.max(Neo.shakeT, 0.12);
  }

  function spawnDevilRedSpikes(enemy, count = 5) {
    if (!Neo.player) return;
    const baseAngle = Neo.angleBetween(enemy, Neo.player);
    const predictedX = Neo.player.x + Number(Neo.player.vx || 0) * 0.42;
    const predictedY = Neo.player.y + Number(Neo.player.vy || 0) * 0.42;
    for (let index = 0; index < count; index += 1) {
      const spread = (index - (count - 1) / 2) * 42;
      const forward = 18 + Math.abs(index - (count - 1) / 2) * 16;
      const perp = baseAngle + Math.PI / 2;
      const x = Neo.clamp(predictedX + Math.cos(perp) * spread + Math.cos(baseAngle) * forward + Neo.rand(-18, 18, 'encounter'), 80, Neo.ROOM_W - 80);
      const y = Neo.clamp(predictedY + Math.sin(perp) * spread + Math.sin(baseAngle) * forward + Neo.rand(-18, 18, 'encounter'), 80, Neo.ROOM_H - 80);
      Neo.hazards.push({
        kind: 'red_spikes',
        enemy: true,
        ownerEnemy: enemy,
        source: 'handsome_devil',
        x,
        y,
        r: 34,
        ttl: 1.1,
        armTime: 0.48,
        damage: globalThis.NeoNyke.simulation.getHandsomeDevilSpikeDamage(enemy.dmg),
        knockback: 260,
        statusKey: 'bleed',
        statusStacks: getBossStatusStacks(enemy, 2),
        statusDuration: 3.4,
        hit: false,
      });
      Neo.spawnParticle({ x, y, life: 0.35, ring: 18, c: '#ff3348' });
    }
  }

  function spawnDevilLavaGrid(enemy) {
    const tier = getBossTier(enemy);
    const tile = 64;
    const thickness = 22;
    const margin = Neo.WALL + 38;
    const verticalOffsets = tier >= 3 ? [-1.5, -0.5, 0.5, 1.5] : [-1, 0, 1];
    const horizontalOffsets = tier >= 3 ? [-1, 0, 1] : [-1, 1];
    const verticals = verticalOffsets.map(offset => Neo.clamp(Neo.player.x + offset * 120 + Neo.rand(-34, 34, 'encounter'), margin, Neo.ROOM_W - margin));
    const horizontals = horizontalOffsets.map(offset => Neo.clamp(Neo.player.y + offset * 110 + Neo.rand(-28, 28, 'encounter'), margin, Neo.ROOM_H - margin));
    verticals.forEach((x, index) => {
      const top = Neo.WALL + tile;
      const h = Neo.ROOM_H - Neo.WALL * 2 - tile * 2;
      Neo.hazards.push({
        kind: 'lava',
        shape: 'rect',
        enemy: true,
        ownerEnemy: enemy,
        source: 'handsome_devil',
        x,
        y: top + h / 2,
        left: x - thickness / 2,
        top,
        w: thickness,
        h,
        ttl: 4.2,
        phase: index * 0.7,
        pulse: 1.9,
        statusStacks: getBossStatusStacks(enemy, 1),
        playerDamagePerSecond: globalThis.NeoNyke.simulation.getHandsomeDevilLavaDamagePerSecond(enemy.dmg),
      });
    });
    horizontals.forEach((y, index) => {
      const left = Neo.WALL + tile;
      const w = Neo.ROOM_W - Neo.WALL * 2 - tile * 2;
      Neo.hazards.push({
        kind: 'lava',
        shape: 'rect',
        enemy: true,
        ownerEnemy: enemy,
        source: 'handsome_devil',
        x: left + w / 2,
        y,
        left,
        top: y - thickness / 2,
        w,
        h: thickness,
        ttl: 4.2,
        phase: index * 0.9 + 1.3,
        pulse: 1.9,
        statusStacks: getBossStatusStacks(enemy, 1),
        playerDamagePerSecond: globalThis.NeoNyke.simulation.getHandsomeDevilLavaDamagePerSecond(enemy.dmg),
      });
    });
    Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 12, life: 0.58, text: 'LAVA GRID', c: '#ff7a32' });
  }

  function updateHandsomeDevilBoss(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const tier = getBossTier(enemy);
    const hpPct = enemy.hp / enemy.max;
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (hpPct <= 0.5 && enemy.phase === 1) {
      enemy.phase = 2;
      enemy.attackCd = Math.min(enemy.attackCd, 0.65);
      enemy.devilLaserCd = 0.6;
      sayOverEntity(enemy, 'Look into my eyes.', { holdTime: 1.7 });
      Neo.ringBurst(enemy.x, enemy.y, 124, '#ff3348', 0.8);
    }

    enemy.spikeCd = Math.max(0, Number(enemy.spikeCd || 0) - dt);
    enemy.lavaGridCd = Math.max(0, Number(enemy.lavaGridCd || 0) - dt);
    enemy.devilLaserCd = Math.max(0, Number(enemy.devilLaserCd || 0) - dt);
    enemy.clawCd = Math.max(0, Number(enemy.clawCd || 0) - dt);
    enemy.giantLaserCd = Math.max(0, Number(enemy.giantLaserCd ?? 3) - dt);

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.76;
      enemy.vy *= 0.76;
      if (enemy.state === 'devilLaser' || enemy.state === 'devilGiantLaser') {
        Neo.aimEnemyBeam(enemy, dt, (enemy.state === 'devilGiantLaser' ? 1.4 : 3.2) * tuning.reaction);
      }
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.14, c: '#ff3348' });
      if (enemy.windup <= 0 && enemy.state === 'devilLaser') {
        enemy.beamTime = 0.86;
        enemy.beamTick = 0;
      }
      if (enemy.windup <= 0 && enemy.state === 'devilGiantLaser') {
        enemy.beamTime = 1.3;
        enemy.beamTick = 0;
        Neo.shake = Math.max(Neo.shake, 9);
        Neo.shakeT = Math.max(Neo.shakeT, 0.2);
      }
      return;
    }

    if (enemy.beamTime > 0) {
      const isGiant = enemy.state === 'devilGiantLaser';
      Neo.tickEnemyBeam(enemy, dt, {
        tick: (isGiant ? 0.09 : 0.075) * Math.max(0.68, tuning.rangedCadence),
        range: isGiant ? 900 : (enemy.beamRange || 560),
        knockback: isGiant ? 260 : 180,
        damage: Math.round(enemy.dmg * (isGiant ? 1.35 : 0.72)),
        speedDamp: 0.84,
        turnRate: (isGiant ? 0.4 : 1.8) * tuning.reaction,
        damageSource: 'handsome_devil',
        onHit: () => {
          Neo.applyFire?.(Neo.player, getBossStatusStacks(enemy, isGiant ? 2 : 1), isGiant ? 3.6 : 2.8, enemy.type);
        },
        onEnd: activeEnemy => {
          activeEnemy.attackCd = (isGiant ? 1.4 : 1.1) * tuning.rangedCadence;
          activeEnemy.giantLaserWidth = 0;
        },
      });
      return;
    }

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    // Claw slash: punishes players who close to melee range, on both phases.
    if (enemy.clawCd <= 0 && enemy.attackCd <= 0 && distance < enemy.r + Neo.player.r + 70) {
      spawnDevilClawSlash(enemy);
      enemy.clawCd = 1.9 * tuning.rangedCadence;
      enemy.attackCd = 0.8;
      return;
    }

    // Giant red laser: heavy long-range punish when the player keeps their
    // distance instead of engaging.
    if (enemy.giantLaserCd <= 0 && distance > 420) {
      enemy.state = 'devilGiantLaser';
      enemy.windup = 0.85 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + Neo.rollEnemyBeamBias(enemy, 0.05);
      enemy.giantLaserWidth = 22;
      enemy.giantLaserCd = 5.4 * tuning.rangedCadence;
      if (!enemy.devilGiantLaserLineShown) {
        enemy.devilGiantLaserLineShown = true;
        sayOverEntity(enemy, "Can't hide forever.", { holdTime: 1.6 });
      }
      return;
    }

    if (enemy.phase === 1) {
      if (enemy.spikeCd <= 0) {
        spawnDevilRedSpikes(enemy, Math.min(9, 5 + tier));
        enemy.spikeCd = 2.2 * tuning.rangedCadence;
      }
      if (enemy.lavaGridCd <= 0) {
        spawnDevilLavaGrid(enemy);
        enemy.lavaGridCd = 6.6 * tuning.rangedCadence;
      }
    } else if (enemy.devilLaserCd <= 0 && distance < 620) {
      enemy.state = 'devilLaser';
      enemy.windup = 0.56 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + Neo.rollEnemyBeamBias(enemy, 0.09);
      enemy.devilLaserCd = 2.35 * tuning.rangedCadence;
      return;
    }

    const desired = enemy.phase >= 2 ? 250 : 170;
    const direction = distance < desired - 32 ? -1 : distance > desired + 36 ? 1 : 0.2;
    const strafe = enemy.phase >= 2 && distance < 520 ? 0.38 : 0.18;
    steerEnemy(
      enemy,
      dx / distance * direction + -dy / distance * strafe,
      dy / distance * direction + dx / distance * strafe,
      enemy.speed,
      enemy.phase >= 2 ? 5.2 : 4.1,
      dt
    );

    if (distance < enemy.r + Neo.player.r + 12 && enemy.attackCd <= 0) {
      const angle = Math.atan2(dy, dx);
      Neo.damagePlayer(enemy.dmg, angle, 210, enemy.type, { attacker: enemy });
      Neo.applyFire?.(Neo.player, getBossStatusStacks(enemy, 1), 2.8, enemy.type);
      enemy.attackAnimT = 0.24;
      enemy.attackCd = 0.95 * tuning.rangedCadence;
    }
  }

  function updateLaserEnemy(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      Neo.aimEnemyBeam(enemy, dt, 3.3 * tuning.reaction);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.16, c: '#aa66ff' });
      if (enemy.windup <= 0) {
        enemy.beamTime = 0.46;
        enemy.beamTick = 0;
      }
      return;
    }

    if (enemy.beamTime > 0) {
      Neo.tickEnemyBeam(enemy, dt, {
        tick: 0.11 * Math.max(0.74, tuning.rangedCadence),
        range: 430,
        knockback: 130,
        damage: enemy.dmg,
        speedDamp: 0.84,
        turnRate: 2.3 * tuning.reaction,
      });
      return;
    }

    const desired = 230;
    const direction = distance < desired - 25 ? -1 : distance > desired + 25 ? 1 : 0;
    if (enemy.attackCd > 0.35 && trySteerEnemyToCover(enemy, dt, desired, 3.3)) {
      // Laser units should search for cover when their firing lane is not active.
    } else {
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.2, dt);
    }
    if (enemy.attackCd <= 0 && distance < 390) {
      enemy.windup = 0.78 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + Neo.rollEnemyBeamBias(enemy, 0.2);
      enemy.attackCd = 2.8 * tuning.rangedCadence;
    }
  }

  const ELITE_CONTINUOUS_BEAM_PROFILES = Object.freeze({
    blood_beam: { duration: 0.56, tick: 0.1, range: 430, knockback: 125, turnRate: 2.6, damageScale: 1 },
    love_beam: { duration: 0.82, tick: 0.075, range: 450, knockback: 105, turnRate: 3.2, damageScale: 0.82 },
    turtle_wave: { duration: 0.9, tick: 0.08, range: 620, knockback: 190, turnRate: 2.6, damageScale: 0.72, damageBonus: 14 },
    wizard_lazer: { duration: 0.88, tick: 0.08, range: 500, knockback: 170, turnRate: 2.1, damageScale: 0.68 },
    mooggy_blood_beam: { duration: 0.7, tick: 0.08, range: 520, knockback: 135, turnRate: 4.2, damageScale: 0.88 },
    thorn_blood_beams: { duration: 0.76, tick: 0.1, range: 440, knockback: 105, turnRate: 2.5, damageScale: 0.7, fan: [-0.32, -0.11, 0.11, 0.32] },
    holy_eye_beams: { duration: 0.74, tick: 0.09, range: 470, knockback: 120, turnRate: 3, damageScale: 0.78, fan: [-0.07, 0.07] },
    god_sweep: { duration: 1.4, tick: 0.055, range: 560, knockback: 145, turnRate: 0, damageScale: 0.62, damageBonus: 8, sweep: true },
  });

  function updateEliteEnemyTraits(enemy, dt) {
    if (!enemy?.elite || !Array.isArray(enemy.eliteTypes)) return false;
    const distanceToPlayer = Neo.player ? Neo.dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) : Infinity;

    if (enemy.eliteTypes.includes('burning')) {
      enemy.burningTick = Math.max(0, Number(enemy.burningTick || 0) - dt);
      if (enemy.burningTick <= 0) {
        enemy.burningTick = 1.15;
        Neo.spawnParticle({ x: enemy.x + Neo.rand(-10, 10, 'fx'), y: enemy.y + Neo.rand(-10, 10, 'fx'), life: 0.24, c: '#ff9a3c' });
        if (distanceToPlayer < enemy.r + Neo.player.r + 34) Neo.applyFire(Neo.player, 1, 2.8, enemy.type);
      }
    }

    if (enemy.eliteTypes.includes('bleeding')) {
      enemy.bleedingTick = Math.max(0, Number(enemy.bleedingTick || 0) - dt);
      if (enemy.bleedingTick <= 0) {
        enemy.bleedingTick = 1.25;
        Neo.spawnParticle({ x: enemy.x + Neo.rand(-8, 8, 'fx'), y: enemy.y + Neo.rand(-8, 8, 'fx'), life: 0.22, c: '#ff4256' });
        if (distanceToPlayer < enemy.r + Neo.player.r + 28) Neo.applyStatus(Neo.player, 'bleed', 1, 2.2, enemy.type);
      }
    }

    if (!enemy.eliteTypes.includes('lasered') && !enemy.eliteTypes.includes('lazered')) return false;
    // Beam struggles terminate the enemy channel directly, bypassing
    // tickEnemyBeam's onEnd callback. Release the sentinel cooldown here so a
    // gauntlet user can recover and challenge the player again afterward.
    if (enemy.state === 'elite_laser' && !(enemy.beamTime > 0) && Number(enemy.eliteLaserCd || 0) >= 90) {
      enemy.state = 'idle';
      enemy.beamFan = null;
      enemy.beamRange = 0;
      enemy.eliteLaserCd = enemy.beamPracticeUser ? 0.72 : 1.35;
    }
    if (enemy.beamTime > 0 && enemy.state === 'elite_laser') {
      const profile = ELITE_CONTINUOUS_BEAM_PROFILES[enemy.eliteLaserMode]
        || ELITE_CONTINUOUS_BEAM_PROFILES.blood_beam;
      Neo.tickEnemyBeam(enemy, dt, {
        tick: profile.tick,
        range: profile.range,
        knockback: profile.knockback,
        damage: enemy.beamPracticeUser
          ? Math.max(1, Math.round(Number(enemy.dmg || 1) * profile.damageScale))
          : Math.max(1, Math.round(Number(enemy.dmg || 1) + Number(profile.damageBonus || 0))),
        speedDamp: 0.84,
        turnRate: profile.turnRate,
        fan: profile.fan || [0],
        onTick: (activeEnemy, activeDt) => {
          if (profile.sweep) activeEnemy.beamAngle += Number(activeEnemy.eliteSweepSpeed || 3.8) * activeDt;
        },
        onEnd: activeEnemy => {
          activeEnemy.state = 'idle';
          activeEnemy.beamFan = null;
          activeEnemy.beamRange = 0;
          activeEnemy.eliteLaserCd = activeEnemy.beamPracticeUser ? 0.72 : 1.35;
        },
      });
      return true;
    }

    enemy.eliteLaserCd = Math.max(0, Number(enemy.eliteLaserCd || 0) - dt);
    if (enemy.eliteLaserCd > 0 || distanceToPlayer > 520) {
      if (!enemy.beamPracticeUser || !Neo.player) return false;
      const dx = Neo.player.x - enemy.x;
      const dy = Neo.player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const direction = distance < 245 ? -1 : distance > 330 ? 1 : 0;
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.4, dt);
      return true;
    }

    const modes = Array.isArray(enemy.beamPracticeModes) && enemy.beamPracticeModes.length
      ? enemy.beamPracticeModes
      : ['blood_beam', 'turtle_wave', 'power_disks', 'blade_justice', 'lightning_columns', 'god_sweep'];
    const mode = modes[Number(enemy.eliteLaserModeIndex || 0) % modes.length];
    enemy.eliteLaserModeIndex = Number(enemy.eliteLaserModeIndex || 0) + 1;
    const angle = Neo.angleBetween(enemy, Neo.player);

    if (mode === 'power_disks') {
      for (let index = 0; index < 5; index += 1) {
        const spread = (index - 2) * 0.16;
        Neo.spawnProjectile({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle + spread) * 360,
          vy: Math.sin(angle + spread) * 360,
          r: 7,
          life: 1.15,
          enemy: true,
          owner: enemy,
          kind: 'power_disk',
          source: `${enemy.type || 'laser'}_projectile`,
          damage: Math.round(enemy.dmg * 0.72),
          color: '#d890ff',
          knockback: 110,
        });
      }
      enemy.eliteLaserCd = 1.4;
      return false;
    }

    if (mode === 'blade_justice') {
      if (distanceToPlayer < 150) Neo.damagePlayer(enemy.dmg + 10, angle, 240, 'elite_blade_justice', { attacker: enemy });
      Neo.ringBurst(enemy.x, enemy.y, 112, '#ffffff', 0.34);
      enemy.eliteLaserCd = 1.2;
      return false;
    }

    if (mode === 'lightning_columns') {
      for (let index = 0; index < 2; index += 1) {
        const px = Neo.clamp(Neo.player.x + Neo.rand(-70, 70, 'encounter'), Neo.WALL + 60, Neo.ROOM_W - Neo.WALL - 60);
        const py = Neo.clamp(Neo.player.y + Neo.rand(-70, 70, 'encounter'), Neo.WALL + 60, Neo.ROOM_H - Neo.WALL - 60);
        Neo.hazards.push({ kind: 'lightning_column', x: px, y: py, r: 46, ttl: 1.25, tick: 0, interval: 0.36, damage: Math.round(enemy.dmg * 0.78), enemy: true, ownerEnemy: enemy, source: enemy.type || 'lightning_column' });
        Neo.ringBurst(px, py, 18, '#8dd4ff', 0.28);
      }
      enemy.eliteLaserCd = 1.6;
      return false;
    }

    const profile = ELITE_CONTINUOUS_BEAM_PROFILES[mode] || ELITE_CONTINUOUS_BEAM_PROFILES.blood_beam;
    enemy.state = 'elite_laser';
    enemy.eliteLaserMode = ELITE_CONTINUOUS_BEAM_PROFILES[mode] ? mode : 'blood_beam';
    enemy.beamAngle = angle;
    enemy.beamTime = profile.duration;
    enemy.beamTick = 0;
    enemy.beamFan = profile.fan || [0];
    enemy.beamRange = profile.range;
    enemy.eliteSweepSpeed = (Neo.nextRandom('encounter') < 0.5 ? -1 : 1) * 4.1;
    enemy.eliteLaserCd = 99;
    Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 14, life: 0.45, text: Neo.MOVE_DEFS[mode]?.name || 'LASER', c: '#8dd4ff' });
    return true;
  }

  function updateChargerEnemy(enemy, dt) {
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.86;
      enemy.vy *= 0.86;
      return;
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.14, c: '#ff8844' });
      if (enemy.windup <= 0) {
        enemy.dashTime = 0.32;
        enemy.dashHit = false;
      }
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      const signatureRush = !!enemy.npcSignatureRush;
      const dashSpeed = signatureRush ? 820 : 430;
      enemy.vx = Math.cos(enemy.dashAngle) * dashSpeed;
      enemy.vy = Math.sin(enemy.dashAngle) * dashSpeed;
      if (!enemy.dashHit && Neo.dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 6) {
        enemy.dashHit = true;
        Neo.damagePlayer(
          signatureRush ? Math.round(enemy.dmg * 1.45) : enemy.dmg + 4,
          enemy.dashAngle,
          signatureRush ? 520 : 240,
          signatureRush ? 'charger_rush' : enemy.type,
          { attacker: enemy },
        );
      }
      if (enemy.dashTime <= 0) enemy.npcSignatureRush = false;
      return;
    }

    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.1, dt);
    if (enemy.attackCd <= 0 && distance < 420) {
      enemy.windup = 0.52;
      enemy.dashAngle = Math.atan2(dy, dx);
      enemy.attackCd = 2.4;
    }
  }

  function getMirrorMove(enemy, slot) {
    const fallback = slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : slot === 'smash' ? 'crimson_smash' : 'dash';
    const key = enemy?.mirrorMoves?.[slot] || fallback;
    return Neo.MOVE_DEFS[key]?.slot === slot ? key : fallback;
  }

  function getMirrorSkillCooldown(enemy, slot) {
    const cooldowns = enemy?.mirrorCooldowns || {};
    if (Number.isFinite(cooldowns[slot])) return Math.max(0.12, cooldowns[slot]);
    const attackSpeed = Math.max(0.5, enemy?.attackSpeed || 1);
    if (slot === 'laser') return Math.max(0.75, 3.2 / attackSpeed);
    if (slot === 'smash') return Math.max(1.1, 4.2 / attackSpeed);
    if (slot === 'dash') return Math.max(0.55, 1.8 / attackSpeed);
    return Math.max(0.18, 0.42 / attackSpeed);
  }

  function getMirrorMoveDamage(enemy, moveKey, fallback) {
    if (Number.isFinite(enemy?.mirrorMoveStats?.[moveKey]?.damage)) {
      return Math.max(1, Math.round(enemy.mirrorMoveStats[moveKey].damage));
    }
    const base = Neo.MOVE_BASE_STATS[moveKey]?.damage ?? fallback;
    const powerBonus = Math.max(0, Number(enemy?.dmg || 0) - 18) * 0.35;
    return Math.max(1, Math.round(base + powerBonus));
  }

  function rollMirrorDamage(enemy, damage, options = {}) {
    const stats = enemy?.mirrorItemStats || {};
    let amount = Number(damage || 0);
    if (options.beam) amount *= Number(stats.beamDamageMultiplier || 1);
    if (options.aoe) amount *= Number(stats.aoeDamageMultiplier || 1);
    const critRollback = Neo.applyCritRollback(Number(stats.critChance || 0) + Number(options.critBonus || 0), Number(stats.critMultiplier || 1.6));
    const critChance = Neo.clamp(critRollback.critChance, 0, 1);
    const crit = critChance > 0 && Neo.nextRandom('encounter') < critChance;
    if (crit) amount *= critRollback.critMultiplier;
    return { amount: Math.max(1, Math.round(amount)), crit };
  }

  function getMirrorStatusEffects(enemy, options = {}) {
    const stats = enemy?.mirrorItemStats || {};
    const effects = [];
    const bleedChance = Number(options.bleedChance || 0)
      + Number(stats.bleedChance || 0)
      + Math.min(0.35, Number(stats.scarfBleedsOnHit || 0) * 0.08);
    if (bleedChance > 0) effects.push({ key: 'bleed', chance: bleedChance, stacks: 1, duration: 4.2 });
    const poisonChance = Number(stats.snakeKnifePoisonChance || 0);
    if (poisonChance > 0) effects.push({ key: 'poison', chance: poisonChance, stacks: 1, duration: 4.2 });
    const slowChance = Number(stats.weaponFatigueChance || 0);
    if (slowChance > 0) effects.push({ key: 'slow', chance: slowChance, stacks: 1, duration: 4 });
    const stunChance = Number(stats.confuseRayStunChance || 0)
      + Number(stats.weaponFatigueFreezeChance || 0)
      + (Number(stats.overstimulateStunChance || 0) > 0 && Neo.getActiveStatusCount?.(Neo.player) >= 2 ? Number(stats.overstimulateStunChance || 0) : 0);
    if (stunChance > 0) effects.push({ key: 'stun', chance: stunChance, stacks: 1, duration: 0.55 });
    if (Number(options.fireStacks || 0) > 0) {
      effects.push({ key: 'fire', chance: 1, stacks: Number(options.fireStacks || 1), duration: Number(options.fireDuration || 3.2) });
    }
    return effects;
  }

  function applyMirrorStatusEffects(enemy, options = {}) {
    const effects = options.statusEffects || getMirrorStatusEffects(enemy, options);
    effects.forEach(effect => {
      if (!effect?.key) return;
      const rawChance = Neo.getPlayerNegativeStatusProcChance?.(effect.chance ?? 1)
        ?? Number(effect.chance ?? 1);
      const rolled = Neo.applyProcRollback?.(rawChance, 1) || { procChance: rawChance, effectMultiplier: 1 };
      const procChance = Neo.clamp(Number(rolled.procChance || 0), 0, 0.999);
      const effectMultiplier = Math.max(1, Number(rolled.effectMultiplier || 1));
      if (Neo.nextRandom('encounter') <= procChance) {
        if (effect.key === 'stun') {
          const severity = Number(Neo.getItemStats?.()?.negativeStatusMultiplier || 1);
          Neo.player.stun = Math.max(Number(Neo.player.stun || 0), Number(effect.duration || 0.55) * severity * effectMultiplier);
        } else {
          Neo.applyStatus(Neo.player, effect.key, Number(effect.stacks || 1), Number(effect.duration || 3) * effectMultiplier, enemy?.type || 'mirror_knight');
          const state = Neo.getStatusState?.(Neo.player, effect.key);
          if (state && effectMultiplier > 1) state.damageMultiplier = Math.max(Number(state.damageMultiplier || 1), effectMultiplier);
        }
      }
    });
  }

  function mirrorDamagePlayer(enemy, damage, angle, knockback, source, options = {}) {
    const rolled = rollMirrorDamage(enemy, damage, options);
    const knockbackMultiplier = Number(enemy?.mirrorItemStats?.knockbackMultiplier || 1);
    Neo.damagePlayer(rolled.amount, angle, Number(knockback || 0) * knockbackMultiplier, source, {
      ...options,
      sourceKey: enemy?.type || 'mirror_knight',
      attacker: options.attacker || enemy,
      // The mirror knight rolls its own (player-mirrored) crit above, so it opts
      // out of the global time-based enemy crit aggression to avoid double-critting.
      noEnemyAggression: true,
    });
    applyMirrorStatusEffects(enemy, options);
    if (rolled.crit) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.42, text: 'CRIT', c: '#ff9f1c' });
    }
    return true;
  }

  function getPredictedPlayerPoint(lead = 0.22) {
    return {
      x: Neo.clamp(Neo.player.x + Number(Neo.player.vx || 0) * lead, Neo.WALL + Neo.player.r, Neo.ROOM_W - Neo.WALL - Neo.player.r),
      y: Neo.clamp(Neo.player.y + Number(Neo.player.vy || 0) * lead, Neo.WALL + Neo.player.r, Neo.ROOM_H - Neo.WALL - Neo.player.r),
    };
  }

  function mirrorHitArc(enemy, angle, range, arc, damage, knockback, source = 'mirror_knight', options = {}) {
    const d = Neo.dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y);
    if (d > range + Neo.player.r) return false;
    const targetAngle = Neo.angleBetween(enemy, Neo.player);
    const diff = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
    if (diff > arc) return false;
    return mirrorDamagePlayer(enemy, damage, angle, knockback, source, options);
  }

  function mirrorBlastPlayer(enemy, radius, damage, knockback, color, source = 'mirror_knight', options = {}) {
    Neo.ringBurst(enemy.x, enemy.y, radius, color, 0.42);
    if (Neo.dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) > radius + Neo.player.r) return false;
    const angle = Neo.angleBetween(enemy, Neo.player);
    return mirrorDamagePlayer(enemy, damage, angle, knockback, source, options);
  }

  function fireMirrorProjectiles(enemy, angle, count, spread, speed, damage, options = {}) {
    const projectileSpeedMultiplier = Math.max(0.1, Number(enemy?.mirrorItemStats?.projectileSpeedMultiplier || 1));
    const projectileSpeed = speed * projectileSpeedMultiplier;
    const homingStrength = Math.max(0, Number(enemy?.mirrorItemStats?.projectileHomingStrength || 0));
    const grantedHoming = homingStrength > 0 && !Object.prototype.hasOwnProperty.call(options, 'homing');
    for (let index = 0; index < count; index += 1) {
      const offset = count === 1 ? 0 : (index - (count - 1) / 2) * spread;
      const a = angle + offset;
      Neo.spawnProjectile({
        x: enemy.x + Math.cos(a) * (enemy.r + 7),
        y: enemy.y + Math.sin(a) * (enemy.r + 7),
        vx: Math.cos(a) * projectileSpeed,
        vy: Math.sin(a) * projectileSpeed,
        r: options.r || 6,
        life: options.life || 1.25,
        enemy: true,
        bossProjectile: true,
        kind: options.kind || 'mirror_shot',
        source: options.source || 'mirror_knight_projectile',
        color: options.color || '#d7f6ff',
        damage: rollMirrorDamage(enemy, damage, options).amount,
        knockback: (options.knockback || 120) * Number(enemy?.mirrorItemStats?.knockbackMultiplier || 1),
        statusEffects: options.statusEffects || getMirrorStatusEffects(enemy, options),
        homing: Object.prototype.hasOwnProperty.call(options, 'homing') ? !!options.homing : grantedHoming,
        homingSpeed: options.homingSpeed ?? (grantedHoming ? projectileSpeed : undefined),
        homingTurnRate: options.homingTurnRate ?? (grantedHoming ? 0.75 + homingStrength * 3.5 : undefined),
        homingAccel: options.homingAccel ?? (grantedHoming ? 1.2 + homingStrength * 6 : undefined),
        homingRadius: options.homingRadius ?? (grantedHoming ? 220 + homingStrength * 1400 : undefined),
        bouncesRemaining: globalThis.NeoNyke.simulation.resolveFractionalItemEffectCount(
          enemy?.mirrorItemStats?.projectileBounces,
          () => Neo.nextRandom('encounter'),
        ),
      });
    }
  }

  function startMirrorMelee(enemy, angleToPlayer) {
    const weaponKey = enemy.mirrorWeapon || '';
    if (weaponKey && Neo.WEAPON_DEFS[weaponKey]) {
      const weaponStats = enemy.mirrorWeaponStats || {};
      const damage = Math.max(1, Math.round(weaponStats.damage || enemy.dmg || Neo.ATTACKS.melee.damage));
      const range = Math.max(40, Number(weaponStats.range || Neo.ATTACKS.melee.range));
      const knockback = Math.max(0, Number(weaponStats.knockback || Neo.ATTACKS.melee.push));
      enemy.swingTime = Neo.ATTACKS.melee.active;
      enemy.attackCd = getMirrorSkillCooldown(enemy, 'melee');
      if (weaponKey === 'hunters_bow' || weaponKey === 'magenta_degale' || weaponKey === 'void_piercer' || weaponKey === 'gelleh_lightning_spear' || weaponKey === 'princess_wand') {
        fireMirrorProjectiles(enemy, angleToPlayer, 1, 0, weaponKey === 'magenta_degale' ? 880 : 760, damage, {
          kind: weaponKey,
          color: Neo.WEAPON_DEFS[weaponKey]?.color || '#d7f6ff',
          r: weaponKey === 'magenta_degale' ? 7 : 6,
          life: weaponKey === 'void_piercer' ? 1.2 : 0.9,
          critBonus: weaponKey === 'hunters_bow' ? 0.1 : weaponKey === 'void_piercer' ? 0.2 : 0,
          knockback,
        });
        return true;
      }
      if (weaponKey === 'metao_fire_staff') {
        fireMirrorProjectiles(enemy, angleToPlayer, 3, 0.18, 345, damage, { kind: 'fireball', color: '#ffb874', r: 8, life: 1.4, knockback, fireStacks: 1, fireDuration: 3.2 });
        return true;
      }
      if (weaponKey === 'magenta_p90') {
        fireMirrorProjectiles(enemy, angleToPlayer, 5, 0.08, 880, Math.max(6, damage), { kind: 'magenta_p90', color: '#ff9dd7', r: 4, life: 0.75, knockback });
        return true;
      }
      if (weaponKey === 'lazer_glasses') {
        enemy.state = 'mirrorLaser';
        enemy.windup = 0.22;
        enemy.beamAngle = angleToPlayer;
        enemy.beamDamage = Math.max(enemy.beamDamage || 0, Math.round(damage * 0.55));
        return true;
      }
      mirrorHitArc(enemy, angleToPlayer, range + 10, weaponKey === 'excalibur' ? Math.PI : Neo.ATTACKS.melee.arc + 0.18, damage, knockback, `mirror_${weaponKey}`, {
        bleedChance: weaponKey === 'thorns_bleed_blade' ? 0.1 : 0,
      });
      return true;
    }
    const move = getMirrorMove(enemy, 'melee');
    const damage = getMirrorMoveDamage(enemy, move, enemy.dmg || Neo.ATTACKS.melee.damage);
    enemy.swingTime = Neo.ATTACKS.melee.active;
    enemy.attackCd = getMirrorSkillCooldown(enemy, 'melee');
    if (move === 'fire_balls') {
      fireMirrorProjectiles(enemy, angleToPlayer, 3, 0.16, 340, Math.max(14, damage - 4), { kind: 'fireball', color: '#ff8844', r: 8, life: 1.45, knockback: 110, fireStacks: 1, fireDuration: 3.2 });
      return true;
    }
    if (move === 'narwal_fight') {
      mirrorHitArc(enemy, angleToPlayer, 138, 1.45, Math.max(22, damage + 4), 300);
      fireMirrorProjectiles(enemy, angleToPlayer, 1, 0, 740, Math.max(16, damage - 8), { kind: 'narwal_fight', color: '#ffd1ea', r: 6, life: 0.9, knockback: 190 });
      return true;
    }
    if (move === 'smite') {
      const didHit = mirrorHitArc(enemy, angleToPlayer, Neo.ATTACKS.melee.range + 18, Neo.ATTACKS.melee.arc + 0.18, damage, Neo.ATTACKS.melee.push);
      if (didHit) mirrorDamagePlayer(enemy, Math.max(8, Math.round(damage * 0.45)), angleToPlayer, 70, 'mirror_smite');
      Neo.ringBurst(Neo.player.x, Neo.player.y, 18, '#eaf2ff', 0.24);
      return true;
    }
    mirrorHitArc(enemy, angleToPlayer, Neo.ATTACKS.melee.range + 10, Neo.ATTACKS.melee.arc + 0.12, damage, Neo.ATTACKS.melee.push);
    return true;
  }

  function startMirrorLaser(enemy, angleToPlayer, distance) {
    const move = getMirrorMove(enemy, 'laser');
    const predicted = getPredictedPlayerPoint(0.32);
    const aimedAngle = Neo.angleBetween(enemy, predicted);
    enemy.attackCd = 0.42;
    enemy.mirrorLaserCd = getMirrorSkillCooldown(enemy, 'laser');
    if (move === 'power_disks') {
      for (let index = 0; index < 8; index += 1) {
        const a = index * (Math.PI * 2 / 8);
        fireMirrorProjectiles(enemy, a, 1, 0, 300, getMirrorMoveDamage(enemy, move, 20), { kind: 'disk', color: '#d7f6ff', r: 7, life: 1.1, knockback: 110 });
      }
      return true;
    }
    if (move === 'blade_justice') {
      mirrorHitArc(enemy, aimedAngle, 124, 1.35, getMirrorMoveDamage(enemy, move, 34), 280, 'mirror_blade');
      Neo.ringBurst(enemy.x, enemy.y, 36, '#fff6a3', 0.44);
      return true;
    }
    if (move === 'lightning_columns') {
      [-38, 38].forEach(offset => {
        const ox = Math.cos(aimedAngle + Math.PI / 2) * offset;
        const oy = Math.sin(aimedAngle + Math.PI / 2) * offset;
        Neo.hazards.push({
          kind: 'lightning_column',
          enemy: true,
          ownerEnemy: enemy,
          source: 'mirror_lightning',
          x: predicted.x + ox,
          y: predicted.y + oy,
          r: 48,
          ttl: 3.6,
          tick: 0.18,
          interval: 0.42,
          damage: getMirrorMoveDamage(enemy, move, 18),
        });
        Neo.ringBurst(predicted.x + ox, predicted.y + oy, 24, '#8dd4ff', 0.45);
      });
      return true;
    }
    enemy.state = 'mirrorLaser';
    enemy.windup = move === 'god_sweep' ? 0.36 : distance < 150 ? 0.34 : 0.46;
    enemy.beamAngle = aimedAngle + Neo.rollEnemyBeamBias(enemy, move === 'god_sweep' ? 0.08 : 0.1);
    return true;
  }

  function startMirrorSmash(enemy, angleToPlayer) {
    const move = getMirrorMove(enemy, 'smash');
    const damage = getMirrorMoveDamage(enemy, move, enemy.smashDamage || Neo.ATTACKS.smash.damage);
    const itemStats = enemy?.mirrorItemStats || {};
    enemy.attackCd = 0.6;
    enemy.mirrorSmashCd = getMirrorSkillCooldown(enemy, 'smash');
    if (Number(itemStats.homingMissileChance || 0) > 0 && Neo.nextRandom('encounter') < Number(itemStats.homingMissileChance || 0)) {
      const stacks = Math.max(1, Math.floor(Number(itemStats.homingMissileStacks || 1)));
      const missileCount = stacks * 2 + Math.floor(Math.max(1, Number(enemy.level || 1)) / 10);
      const missileLifetime = 5 + stacks;
      for (let index = 0; index < missileCount; index += 1) {
        const missileAngle = angleToPlayer + (index - (missileCount - 1) / 2) * 0.12;
        fireMirrorProjectiles(enemy, missileAngle, 1, 0, 780, 20, {
          kind: 'homing_missile',
          color: '#ffe06f',
          r: 6,
          life: missileLifetime,
          knockback: 120,
          homing: true,
          homingSpeed: 1290,
          homingAccel: 3.8,
          homingTurnRate: 3.5,
          homingRadius: 960,
          // 5% chance to ignite the player on hit (mirrors the player-side buff).
          statusEffects: [{ key: 'fire', chance: 0.05, stacks: 1, duration: 2.8 }],
        });
      }
    }
    if (move === 'kicky_kick') {
      mirrorBlastPlayer(enemy, 142, Math.max(damage, 84), 680, '#ff7fc2', 'mirror_kick', { aoe: true });
      enemy.vx -= Math.cos(angleToPlayer) * 210;
      enemy.vy -= Math.sin(angleToPlayer) * 210;
      return true;
    }
    if (move === 'chaos_burst') {
      for (let index = 0; index < 4; index += 1) {
        const a = angleToPlayer + (index - 1.5) * 0.38;
        const px = Neo.player.x + Math.cos(a) * Neo.rand(46, -46, 'encounter');
        const py = Neo.player.y + Math.sin(a) * Neo.rand(46, -46, 'encounter');
        Neo.ringBurst(px, py, 36, '#c971ff', 0.38);
        if (Neo.dist(Neo.player.x, Neo.player.y, px, py) <= 58 + Neo.player.r) {
          mirrorDamagePlayer(enemy, Math.max(16, Math.round(damage * 0.62)), Math.atan2(Neo.player.y - py, Neo.player.x - px), 120, 'mirror_chaos', { aoe: true });
        }
      }
      return true;
    }
    if (move === 'healing_zone') {
      enemy.hp = Math.min(enemy.max, enemy.hp + enemy.max * 0.08);
      mirrorBlastPlayer(enemy, 118, Math.max(10, damage), 120, '#35ff6f', 'mirror_zone', { aoe: true });
      return true;
    }
    if (move === 'fire_circle' || move === 'floor_lava') {
      mirrorBlastPlayer(enemy, move === 'floor_lava' ? 156 : 108, Math.max(12, damage), 150, '#ff7b32', 'mirror_fire', { aoe: true, fireStacks: move === 'floor_lava' ? 2 : 1, fireDuration: 3.2 });
      Neo.applyFire(Neo.player, move === 'floor_lava' ? 2 : 1, 3.2, enemy?.type || 'mirror_knight');
      return true;
    }
    enemy.mirrorSmashColor = move === 'crimson_smash'
      ? '#ff3048'
      : move === 'chaos_burst'
        ? '#a857ff'
        : '#ff6dc7';
    enemy.state = 'mirrorSmash';
    enemy.windup = 0.38;
    return true;
  }

  function startMirrorDash(enemy, angleToPlayer, distance) {
    const move = getMirrorMove(enemy, 'dash');
    const predicted = getPredictedPlayerPoint(0.28);
    enemy.attackCd = 0.34;
    enemy.mirrorDashCd = getMirrorSkillCooldown(enemy, 'dash');
    if (move === 'warp') {
      const backAngle = angleToPlayer + Math.PI;
      const safePoint = Neo.findSafePointNearTarget(predicted.x + Math.cos(backAngle) * 72, predicted.y + Math.sin(backAngle) * 72, enemy.r, 130, 16);
      if (safePoint) {
        enemy.x = safePoint.x;
        enemy.y = safePoint.y;
        enemy.inv = Math.max(enemy.inv || 0, 0.22);
        Neo.ringBurst(enemy.x, enemy.y, 22, '#b99cff', 0.3);
      }
      return true;
    }
    if (move === 'nimrod_stomp') {
      const safePoint = Neo.findSafePointNearTarget(predicted.x, predicted.y, enemy.r, 90, 14);
      if (safePoint) {
        enemy.x = safePoint.x;
        enemy.y = safePoint.y;
      }
      mirrorBlastPlayer(enemy, 112, getMirrorMoveDamage(enemy, move, 46), 310, '#ffe67a', 'mirror_stomp');
      return true;
    }
    if (move === 'zip_lightning') {
      enemy.dashAngle = angleToPlayer;
      enemy.dashTime = 0.16;
      enemy.dashHit = false;
      enemy.mirrorDashMove = 'zip_lightning';
      return true;
    }
    if (move === 'cowards_way' || move === 'flying_unhitable') {
      enemy.inv = Math.max(enemy.inv || 0, move === 'flying_unhitable' ? 1.2 : 0.7);
      enemy.speed = Math.max(enemy.speed || 0, 260);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - 18, life: 0.55, text: move === 'flying_unhitable' ? 'FLY HIGH' : "COWARD'S WAY", c: '#8dffcf' });
      return true;
    }
    enemy.state = 'mirrorDash';
    enemy.windup = distance > 260 ? 0.08 : 0.14;
    enemy.dashAngle = angleToPlayer;
    return true;
  }

  function updateMirrorChampion(enemy, dt) {
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const angleToPlayer = Math.atan2(dy, dx);

    enemy.mirrorLaserCd = Math.max(0, (enemy.mirrorLaserCd || 0) - dt);
    enemy.mirrorSmashCd = Math.max(0, (enemy.mirrorSmashCd || 0) - dt);
    enemy.mirrorDashCd = Math.max(0, (enemy.mirrorDashCd || 0) - dt);

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.78;
      enemy.vy *= 0.78;
      if (enemy.state === 'mirrorLaser') Neo.aimEnemyBeam(enemy, dt, 3.4);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.16, c: '#d7f6ff' });
      if (enemy.windup <= 0) {
        if (enemy.state === 'mirrorLaser') {
          const laserMove = getMirrorMove(enemy, 'laser');
          enemy.beamTime = laserMove === 'god_sweep'
            ? 1.05
            : laserMove === 'turtle_wave'
              ? 0.86
              : laserMove === 'love_beam'
                ? 0.92
                : 0.64;
          enemy.beamTick = 0;
        } else if (enemy.state === 'mirrorDash') {
          enemy.dashTime = 0.18;
          enemy.dashHit = false;
        } else if (enemy.state === 'mirrorSmash') {
          mirrorBlastPlayer(enemy, Neo.ATTACKS.smash.radius + 8, enemy.smashDamage || enemy.dmg + 18, 300, enemy.mirrorSmashColor || '#ff6dc7');
          enemy.attackCd = 0.75;
        }
      }
      return;
    }

    if (enemy.beamTime > 0) {
      const laserMove = getMirrorMove(enemy, 'laser');
      Neo.tickEnemyBeam(enemy, dt, {
        tick: laserMove === 'god_sweep' ? 0.06 : laserMove === 'love_beam' ? 0.07 : 0.08,
        range: laserMove === 'god_sweep' ? 360 : laserMove === 'turtle_wave' ? 440 : Neo.ATTACKS.laser.range,
        knockback: laserMove === 'turtle_wave' ? 145 : 95,
        damage: laserMove === 'turtle_wave'
          ? Math.max(enemy.beamDamage || enemy.dmg, 32)
          : laserMove === 'god_sweep'
            ? Math.max(10, Math.round((enemy.beamDamage || enemy.dmg) * 0.55))
            : enemy.beamDamage || enemy.dmg,
        speedDamp: 0.84,
        turnRate: laserMove === 'god_sweep' ? 5.8 : 3.5,
        onTick: activeEnemy => {
          if (laserMove === 'god_sweep') activeEnemy.beamAngle += 4.4 * dt;
        },
        onHit: activeEnemy => applyMirrorStatusEffects(activeEnemy, { beam: true }),
        onEnd: activeEnemy => {
          activeEnemy.attackCd = 0.62;
          activeEnemy.mirrorLaserCd = getMirrorSkillCooldown(activeEnemy, 'laser');
        },
      });
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      const dashMove = enemy.mirrorDashMove || getMirrorMove(enemy, 'dash');
      const dashSpeed = dashMove === 'zip_lightning' ? 700 : 600;
      enemy.vx = Math.cos(enemy.dashAngle) * dashSpeed;
      enemy.vy = Math.sin(enemy.dashAngle) * dashSpeed;
      if (!enemy.dashHit && Neo.dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 6) {
        enemy.dashHit = true;
        Neo.damagePlayer(enemy.dmg + (dashMove === 'zip_lightning' ? 18 : 8), enemy.dashAngle, dashMove === 'zip_lightning' ? 300 : 240, enemy.type, { attacker: enemy });
      }
      if (enemy.dashTime <= 0) {
        enemy.attackCd = 0.45;
        enemy.mirrorDashCd = getMirrorSkillCooldown(enemy, 'dash');
        enemy.mirrorDashMove = '';
      }
      return;
    }

    if (enemy.stun > 0) {
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      return;
    }

    const tactics = globalThis.NeoNyke?.simulation?.planCampaignMirrorTactics?.({
      distance, angle: angleToPlayer,
      laserMove: getMirrorMove(enemy, 'laser'), smashMove: getMirrorMove(enemy, 'smash'), dashMove: getMirrorMove(enemy, 'dash'),
      weaponKey: enemy.mirrorWeapon, weaponRange: enemy.mirrorWeaponStats?.range,
      targetRadius: Neo.player.r, meleeRange: Neo.ATTACKS.melee.range,
      attackCooldown: enemy.attackCd, laserCooldown: enemy.mirrorLaserCd,
      smashCooldown: enemy.mirrorSmashCd, dashCooldown: enemy.mirrorDashCd,
    });
    if (!tactics) throw new Error('Shared mirror tactics policy is unavailable');
    steerEnemy(
      enemy,
      tactics.moveX,
      tactics.moveY,
      enemy.speed,
      6.2,
      dt
    );
    if (tactics.action === 'smash') {
      startMirrorSmash(enemy, angleToPlayer);
      return;
    }
    if (tactics.action === 'laser') {
      startMirrorLaser(enemy, angleToPlayer, distance);
      return;
    }
    if (tactics.action === 'dash') {
      startMirrorDash(enemy, angleToPlayer, distance);
      return;
    }
    if (tactics.action === 'weapon' || tactics.action === 'melee') {
      startMirrorMelee(enemy, angleToPlayer);
      return;
    }
    if (tactics.action === 'recover') enemy.attackCd = 0.18;
  }

  // Mooggy claw swing: a single swingTime timer (like the player's own melee
  // swing, Neo.ATTACKS.melee.active) rather than a separate windup phase, so
  // getArmSpriteMotion's thorn_knight/sarge-style arc easing drives the arm
  // through one continuous swing with no discontinuity.
  const MOOGGY_CLAW_SWING = 0.22;
  const MOOGGY_CLAW_REACH_PAD = 34;
  const MOOGGY_CLAW_ARC = 1.0;

  function updateMooggyEnemy(enemy, dt) {
    if (!Neo.player) return;
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const clawReach = enemy.r + Neo.player.r + MOOGGY_CLAW_REACH_PAD;

    if (enemy.beamTime > 0) {
      Neo.tickEnemyBeam(enemy, dt, {
        tick: Number(enemy.mooggyLaserTick || 0.055),
        range: 520,
        knockback: 96,
        damage: enemy.beamDamage || enemy.dmg,
        speedDamp: 0.88,
        turnRate: 8.8,
        damageSource: 'mooggy',
        onHit: () => {
          Neo.applyBleed?.(Neo.player, Number(enemy.mooggyBleedStacks || 1), 3.2, enemy.type);
        },
        onEnd: activeEnemy => {
          activeEnemy.attackCd = Number(activeEnemy.mooggyLaserCooldown || 0.2);
        },
      });
      return;
    }

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    if (enemy.swingTime > 0) {
      enemy.swingTime -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      // Claw lands at the apex of the swing, mirroring the player melee hit
      // timing (roughly mid-way through the active window).
      if (!enemy.clawHit && enemy.swingTime <= MOOGGY_CLAW_SWING * 0.5) {
        const toPlayer = Math.atan2(dy, dx);
        const angleDiff = Math.abs(Math.atan2(Math.sin(toPlayer - enemy.swingA), Math.cos(toPlayer - enemy.swingA)));
        if (distance < clawReach && angleDiff < MOOGGY_CLAW_ARC) {
          enemy.clawHit = true;
          Neo.damagePlayer(enemy.dmg, toPlayer, 190, 'mooggy', { attacker: enemy });
          Neo.applyBleed?.(Neo.player, Number(enemy.mooggyBleedStacks || 1), 3.2, enemy.type);
        }
      }
      return;
    }

    const desired = 220;
    const direction = distance < desired - 34 ? -1 : distance > desired + 42 ? 1 : 0.15;
    const strafe = distance < 420 ? 0.44 : 0;
    steerEnemy(
      enemy,
      dx / distance * direction + -dy / distance * strafe,
      dy / distance * direction + dx / distance * strafe,
      enemy.speed,
      6.4,
      dt
    );

    if (distance < clawReach && enemy.attackCd <= 0) {
      // Telegraph + launch the claw swing (read by the renderer/arm indicator).
      enemy.swingA = Math.atan2(dy, dx);
      enemy.swingTime = MOOGGY_CLAW_SWING;
      enemy.clawHit = false;
      enemy.attackAnimT = 0.24;
      enemy.attackCd = 0.5;
      Neo.ringBurst(enemy.x, enemy.y, clawReach, '#ff3348', 0.18);
      return;
    }

    if (enemy.attackCd <= 0 && distance < 560) {
      enemy.beamAngle = Math.atan2(dy, dx) + Neo.rollEnemyBeamBias(enemy, 0.035);
      enemy.beamTime = 0.16;
      enemy.beamTick = 0;
      enemy.attackCd = Number(enemy.mooggyLaserCooldown || 0.2);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - 18, life: 0.28, c: '#ff3348', ring: 14 });
    }
  }

  function updateChallengeRoomState(dt) {
    if (!Neo.currentRoom || Neo.currentRoom.type !== 'challenge' || Neo.currentRoom.cleared || !Neo.currentRoom.challengeStarted) return;
    const type = Neo.currentRoom.challengeType || 'mirror';

    if (type === 'circuit' || type === 'stillness') {
      if (!Neo.currentRoom.challengeData || !Array.isArray(Neo.currentRoom.challengeData.sequence)) {
        ensureChallengeCircuitData(Neo.currentRoom);
      }
      const circuit = globalThis.NeoNyke?.simulation?.advanceCampaignCircuitChallenge?.(Neo.currentRoom, dt);
      if (circuit?.failed) failChallengeTrial('CIRCUIT TIMED OUT');
      return;
    }

    if (type === 'bomb') {
      const bomb = globalThis.NeoNyke.simulation.advanceCampaignBombChallenge(Neo.currentRoom, dt, {
        tuning: getChallengeTrialTuning('bomb'), floorNumber: Neo.floor,
      });
      // Drift each bomb through the shared world-entity operation so authority
      // snapshots and local campaign use identical boundary reflection.
      for (const pickup of Neo.pickups) {
        if (pickup?.type !== 'challengeBomb' || pickup.vx === undefined) continue;
        const previousX = pickup.x;
        const previousY = pickup.y;
        globalThis.NeoNyke.simulation.advanceCampaignMovingWorldEntity(pickup, dt, {
          width: Neo.ROOM_W, height: Neo.ROOM_H, margin: 90,
        });
        // Boundary reflection alone lets drifting bombs pass through pillars.
        // Resolve each axis against the same collision geometry the player uses,
        // then reverse the blocked velocity component.
        if (Neo.isBlocked(pickup.x, pickup.y, 22)) {
          const canMoveX = !Neo.isBlocked(pickup.x, previousY, 22);
          const canMoveY = !Neo.isBlocked(previousX, pickup.y, 22);
          if (canMoveX && !canMoveY) {
            pickup.y = previousY;
            pickup.vy = -pickup.vy;
          } else if (!canMoveX && canMoveY) {
            pickup.x = previousX;
            pickup.vx = -pickup.vx;
          } else {
            pickup.x = previousX;
            pickup.y = previousY;
            pickup.vx = -pickup.vx;
            pickup.vy = -pickup.vy;
          }
        }
      }
      if (bomb.spawnCount > 0) spawnTrialEnemyWave(bomb.spawnCount);
      if (bomb.failed) {
        spawnBombFailAoe();
        failChallengeTrial('BOMB DETONATED');
      }
      return;
    }

    if (type === 'survival') {
      const survival = globalThis.NeoNyke.simulation.advanceCampaignSurvivalChallenge(Neo.currentRoom, dt, {
        tuning: getChallengeTrialTuning('survival'), floorNumber: Neo.floor, enemies: Neo.enemies,
      });
      if (survival.spawnCount > 0) spawnTrialEnemyWave(survival.spawnCount);
      if (survival.failed) {
        const obelisk = survival.obelisk;
          Neo.ringBurst(obelisk.x, obelisk.y, 40, '#ff5566', 0.6);
          Neo.shake = Math.max(Neo.shake || 0, 14);
          Neo.shakeT = Math.max(Neo.shakeT || 0, 0.3);
          failChallengeTrial('RUNE DESTROYED');
          return;
      }
      if (survival.complete) {
        Neo.enemies.splice(0, Neo.enemies.length);
        completeChallengeTrial('SURVIVED');
      }
      return;
    }

    if (type === 'runes') {
      const runes = globalThis.NeoNyke.simulation.advanceCampaignRuneChallenge(Neo.currentRoom, dt, { tuning: getChallengeTrialTuning('runes') });
      if (runes.spawnCount > 0) spawnTrialEnemyWave(runes.spawnCount);
      if (runes.failed) {
        failChallengeTrial('RUNES FADING');
      }
      return;
    }

    if (type === 'storm') {
      const storm = globalThis.NeoNyke.simulation.advanceCampaignStormChallenge(Neo.currentRoom, dt, {
        tuning: getChallengeTrialTuning('storm'), target: Neo.player,
        width: Neo.ROOM_W, height: Neo.ROOM_H, random: () => Neo.nextRandom('world'),
      });
      storm.strikes.forEach(strike => {
          Neo.hazards.push({
            kind: 'lightning_column',
            x: strike.x,
            y: strike.y,
            r: 52,
            ttl: 1.9,
            warn: 0.48,
            tick: 0,
            interval: 0.42,
            damage: 18 + Neo.floor,
            enemy: true,
            source: 'storm',
          });
          Neo.ringBurst(strike.x, strike.y, 18, '#8dd4ff', 0.35);
      });
      if (storm.complete) completeChallengeTrial('STORM ENDED');
    }
  }

  function updateGod(enemy, dt) {
    const tuning = Neo.getEnemyDifficultyTuning();
    const runPressure = getGodRunPressure();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const hpPct = enemy.hp / enemy.max;

    if (enemy.rebirthUsed && !enemy.phase3Triggered && hpPct <= 0.2) {
      enemy.phase3Triggered = true;
      enemy.dmg = Math.round(enemy.dmg * 1.2);
      enemy.speed *= 1.08;
      enemy.novaCd = 1.9 * runPressure.cadenceMultiplier;
      triggerGodPhase(enemy, 3, 'COUNCIL OF BOSSES', '#ffd27d');
      spawnGodCouncil(enemy);
      playGodDialogue(3);
      return;
    } else if (enemy.rebirthUsed && enemy.phase3Triggered && !enemy.phase4Triggered && hpPct <= 0.12) {
      enemy.phase4Triggered = true;
      enemy.dmg = Math.round(enemy.dmg * 1.16);
      enemy.speed *= 1.06;
      enemy.novaCd = 1.25 * runPressure.cadenceMultiplier;
      enemy.judgementCd = 2.7 * runPressure.cadenceMultiplier;
      triggerGodPhase(enemy, 4, 'HOLY ONSLAUGHT', '#ff9f6e');
      spawnGodSwordRing(enemy, 24, Math.round(enemy.dmg * 1.05));
      playGodDialogue(4);
      return;
    } else if (enemy.rebirthUsed && enemy.phase4Triggered && !enemy.phase5Triggered && hpPct <= 0.06) {
      enemy.phase5Triggered = true;
      enemy.dmg = Math.round(enemy.dmg * 1.22);
      enemy.speed *= 1.08;
      enemy.novaCd = 0.78 * runPressure.cadenceMultiplier;
      enemy.judgementCd = 1.45 * runPressure.cadenceMultiplier;
      triggerGodPhase(enemy, 5, 'LAST JUDGEMENT', '#ff5a5a');
      spawnGodSwordRing(enemy, 32, Math.round(enemy.dmg * 1.15));
      playGodDialogue(5);
      return;
    }

    const phaseLevel = enemy.phase || 1;
    const phaseTwo = phaseLevel >= 2;
    const phaseFour = phaseLevel >= 4;
    const phaseFive = phaseLevel >= 5;
    const phaseCadenceMult = phaseFive ? 0.42 : phaseFour ? 0.52 : phaseLevel >= 3 ? 0.6 : phaseTwo ? 0.68 : 1;
    const cadenceMult = phaseCadenceMult * runPressure.cadenceMultiplier;
    const reactionMult = phaseFive ? 1.45 : phaseFour ? 1.34 : phaseLevel >= 3 ? 1.28 : phaseTwo ? 1.22 : 1;
    const desired = phaseFive ? 138 : phaseFour ? 146 : phaseTwo ? 156 : 190;
    enemy.stun = Math.min(Number(enemy.stun || 0), Number(enemy.maxStunDuration || 0.18));

    if (phaseFour) {
      enemy.novaCd = Math.max(0, (enemy.novaCd || 0) - dt);
      if (enemy.novaCd <= 0) {
        const swordCount = phaseFive ? 20 : 14;
        const swordDamage = Math.round(enemy.dmg * (phaseFive ? 1.08 : 0.92));
        spawnGodSwordRing(enemy, swordCount, swordDamage);
        enemy.novaCd = (phaseFive ? 0.78 : 1.25) * runPressure.cadenceMultiplier;
      }
    }

    if (phaseFive) {
      enemy.judgementCd = Math.max(0, (enemy.judgementCd || 0) - dt);
      if (enemy.judgementCd <= 0) {
        spawnPhaseSwords(16, Math.round(enemy.dmg * 0.82));
        Neo.ringBurst(Neo.player.x, Neo.player.y, 118, '#ff7a7a', 0.42);
        enemy.judgementCd = 1.45 * runPressure.cadenceMultiplier;
      }
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.74;
      enemy.vy *= 0.74;
      if (enemy.state === 'godLaser') Neo.aimEnemyBeam(enemy, dt, (1.05 + (tuning.reaction - 1) * 3.6) * reactionMult);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.18, c: '#ffffff' });
      if (enemy.windup <= 0) {
        if (enemy.state === 'godLaser') {
          enemy.beamTime = phaseTwo ? 0.98 : 0.78;
          enemy.beamTick = 0;
        }
        if (enemy.state === 'godSweep') {
          enemy.beamTime = phaseFour ? 2.7 : phaseTwo ? 2.35 : 1.9;
          enemy.beamTick = 0;
          enemy.sweepSpeed = 3.9 * reactionMult * (enemy.sweepDir || 1);
        }
        if (enemy.state === 'godPartition') {
          enemy.beamTime = phaseFive ? 3.4 : phaseFour ? 3.1 : 2.7;
          enemy.beamTick = 0;
          enemy.partitionRotationSpeed = runPressure.partitionRotationSpeed * (phaseFive ? 1.35 : phaseFour ? 1.2 : 1);
        }
        if (enemy.state === 'godCharge') {
          enemy.dashTime = phaseFour ? 0.76 : phaseTwo ? 0.62 : 0.48;
          enemy.dashHit = false;
        }
        if (enemy.state === 'godSwordRing') {
          const swordCount = phaseFive ? 30 : phaseFour ? 24 : phaseTwo ? 18 : 12;
          const swordDamage = Math.round(enemy.dmg * (phaseFour ? 1.02 : phaseTwo ? 0.95 : 0.82));
          spawnGodSwordRing(enemy, swordCount, swordDamage);
          enemy.attackCd = 1.2 * tuning.rangedCadence * cadenceMult;
        }
      }
      return;
    }

    if (enemy.beamTime > 0) {
      if (enemy.state === 'godPartition') {
        tickGodPartitionLasers(enemy, dt, runPressure, phaseLevel, tuning, cadenceMult);
        return;
      }
      const isSweep = enemy.state === 'godSweep';
      Neo.tickEnemyBeam(enemy, dt, {
        tick: (isSweep ? 0.045 : 0.08) * Math.max(0.64, tuning.rangedCadence * cadenceMult),
        range: enemy.beamRange || 620,
        knockback: isSweep ? (phaseFour ? 260 : 210) : (phaseFour ? 180 : 150),
        damage: isSweep ? enemy.dmg + (phaseFive ? 38 : phaseTwo ? 28 : 18) : Math.round((enemy.dmg + (phaseFour ? 18 : phaseTwo ? 12 : 6)) * 0.25),
        speedDamp: 0.86,
        turnRate: isSweep ? 0 : (0.58 + (tuning.reaction - 1) * 2.8) * reactionMult,
        onTick: isSweep
          ? activeEnemy => {
            activeEnemy.beamAngle += activeEnemy.sweepSpeed * 0.045;
          }
          : null,
        onEnd: activeEnemy => {
          activeEnemy.attackCd = (isSweep ? 1.45 : 1) * tuning.rangedCadence * cadenceMult;
        },
      });
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      const dashSpeed = phaseFive ? 710 : phaseFour ? 660 : phaseTwo ? 620 : 500;
      enemy.vx = Math.cos(enemy.dashAngle) * dashSpeed;
      enemy.vy = Math.sin(enemy.dashAngle) * dashSpeed;
      if (!enemy.dashHit && Neo.dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 10) {
        enemy.dashHit = true;
        Neo.damagePlayer(enemy.dmg + (phaseFive ? 34 : phaseTwo ? 24 : 12), enemy.dashAngle, phaseFour ? 410 : phaseTwo ? 360 : 300, enemy.type, { attacker: enemy });
      }
      if (enemy.dashTime <= 0) enemy.attackCd = 1.1 * tuning.rangedCadence * cadenceMult;
      return;
    }

    if (enemy.stun > 0) {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      return;
    }

    const direction = distance < desired - 10 ? -1 : distance > desired + 20 ? 1 : 0.5;
    steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, phaseFour ? 6.2 : phaseTwo ? 5.5 : 4.6, dt);

    if (distance < enemy.r + Neo.player.r + 12 && enemy.attackCd <= 0) {
      const angle = Math.atan2(dy, dx);
      Neo.damagePlayer(enemy.dmg + (phaseFive ? 26 : phaseTwo ? 18 : 10), angle, phaseFour ? 370 : phaseTwo ? 320 : 260, enemy.type, { attacker: enemy });
      enemy.attackCd = 0.8 * tuning.rangedCadence * cadenceMult;
      return;
    }

    if (enemy.attackCd <= 0) {
      const roll = Neo.nextRandom('encounter');
      const partitionChance = phaseFive ? 0.32 : phaseFour ? 0.27 : phaseLevel >= 3 ? 0.23 : phaseTwo ? 0.19 : runPressure.minutes >= 6 ? 0.14 : 0;
      if (roll < partitionChance) {
        enemy.state = 'godPartition';
        enemy.windup = 1.05 / (tuning.reaction * reactionMult);
        enemy.partitionAngle = Math.atan2(dy, dx);
        enemy.partitionRotationDir = Neo.nextRandom('encounter') < 0.5 ? -1 : 1;
        const laserCount = phaseFour ? 5 : runPressure.partitionLaserCount;
        setGodPartitionAngles(enemy, laserCount);
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.9, text: `${laserCount} FOLD JUDGEMENT`, c: '#fff1a8' });
      } else if ((phaseTwo && distance > 250 && roll > (phaseFour ? 0.46 : 0.52)) || (!phaseTwo && distance > 300 && roll > 0.68)) {
        enemy.state = 'godSweep';
        enemy.windup = 1.15 / (tuning.reaction * reactionMult);
        enemy.beamAngle = Math.atan2(dy, dx) + Neo.rollEnemyBeamBias(enemy, 0.1);
        enemy.sweepDir = Neo.nextRandom('encounter') < 0.5 ? -1 : 1;
      } else if (roll > (phaseFive ? 0.16 : phaseTwo ? 0.26 : 0.42)) {
        enemy.state = 'godLaser';
        enemy.windup = 0.82 / (tuning.reaction * reactionMult);
        enemy.beamAngle = Math.atan2(dy, dx) + Neo.rollEnemyBeamBias(enemy, phaseFour ? 0.16 : phaseTwo ? 0.13 : 0.11);
      } else if (roll > (phaseFour ? 0.04 : phaseTwo ? 0.08 : 0.18)) {
        enemy.state = 'godSwordRing';
        enemy.windup = 0.6 / (tuning.reaction * reactionMult);
      } else {
        enemy.state = 'godCharge';
        enemy.windup = 0.44 / (tuning.reaction * reactionMult);
        enemy.dashAngle = Math.atan2(dy, dx);
      }
      enemy.attackCd = 1.7 * tuning.rangedCadence * cadenceMult;
    }
  }

  // Enemy types that fight at range. When blinded (player hidden) these fire scattered
  // suppressing shots in random directions; everything else falls back to blind melee
  // swings. Bosses/special-AI types are excluded — they keep their own behaviours.
  const BLIND_RANGED_TYPES = new Set([
    'cult_mage', 'sniper', 'machine_gunner', 'summoner', 'healer', 'cult_follower',
  ]);

  // Suppressing fire / flailing defense while an enemy can't see the player. The shot
  // or swing goes toward a random point in the room, so it only connects if the player
  // happens to be in the way — enough to make hiding feel risky, not a free pass.
  function blindDefendEnemy(enemy, dt) {
    if (Neo.BOSS_TYPES.has(enemy.type)) return; // bosses run their own scripted AI
    if (enemy.stun > 0 || enemy.airborne) return;
    enemy.attackCd = Math.max(0, Number(enemy.attackCd || 0) - dt);

    // Resolve an in-progress blind melee swing (may catch a player who wandered close).
    if (enemy.swingTime > 0) {
      enemy.swingTime -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      if (enemy.swingTime <= 0 && Neo.dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 20) {
        const angle = Neo.angleBetween(enemy, Neo.player);
        Neo.damagePlayer(enemy.dmg, angle, 180, enemy.type, { attacker: enemy });
      }
      return;
    }
    if (enemy.attackCd > 0) return;

    const angle = Neo.rand(0, Math.PI * 2);
    if (BLIND_RANGED_TYPES.has(enemy.type)) {
      const tuning = Neo.getEnemyDifficultyTuning();
      const speed = 260;
      Neo.spawnProjectile({
        x: enemy.x + Math.cos(angle) * (enemy.r + 4),
        y: enemy.y + Math.sin(angle) * (enemy.r + 4),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 4,
        life: 1.3,
        enemy: true,
        owner: enemy,
        kind: 'enemy_shot',
        source: `${enemy.type}_blind_shot`,
        damage: enemy.dmg,
      });
      Neo.spawnParticle({ x: enemy.x + Math.cos(angle) * 10, y: enemy.y + Math.sin(angle) * 10, life: 0.14, c: '#ffce8a' });
      enemy.attackCd = Neo.rand(1.6, 2.6) * (tuning?.rangedCadence || 1);
    } else {
      // Melee flail: lunge a touch in the swing direction so it can clip a close player.
      enemy.swingTime = 0.18;
      steerEnemy(enemy, Math.cos(angle), Math.sin(angle), (enemy.speed || 60) * 0.6, 3.0, dt);
      enemy.attackCd = Neo.rand(1.4, 2.4);
    }
  }

  // When the player is hidden (cape/flying/warp), enemies have no target. Instead of
  // freezing in place, they pick random points in the room and amble toward them so the
  // room still feels alive. Targets are re-rolled on arrival or after a short timer.
  // They also keep up a blind defense — scattered shots or flailing swings.
  function wanderEnemy(enemy, dt) {
    if (enemy.beamTime > 0) { enemy.beamTime = 0; if (enemy.state === 'elite_laser') enemy.state = 'idle'; }
    blindDefendEnemy(enemy, dt);
    // A mid-swing flail handles its own micro-movement; don't fight it with wander steer.
    if (enemy.swingTime > 0) return;
    enemy.wanderT = Math.max(0, (enemy.wanderT || 0) - dt);
    const margin = (enemy.r || 8) + Neo.WALL + 4;
    const reached = enemy.wanderTx != null
      && Math.hypot(enemy.wanderTx - enemy.x, enemy.wanderTy - enemy.y) < 16;
    if (enemy.wanderTx == null || reached || enemy.wanderT <= 0) {
      enemy.wanderTx = Neo.rand(margin, Neo.ROOM_W - margin);
      enemy.wanderTy = Neo.rand(margin, Neo.ROOM_H - margin);
      enemy.wanderT = Neo.rand(1.4, 3.2);
    }
    const dx = enemy.wanderTx - enemy.x;
    const dy = enemy.wanderTy - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 1) {
      // Wander at a relaxed pace, not full chase speed.
      const speed = Math.max(20, (enemy.speed || 60) * 0.45);
      steerEnemy(enemy, dx / distance, dy / distance, speed, 2.0, dt);
    } else {
      enemy.vx *= Math.pow(0.0001, dt);
      enemy.vy *= Math.pow(0.0001, dt);
    }
  }

  // Survive-trial adds tagged `obeliskSeeker` ignore the player and converge on
  // the central obelisk. Called from the enemy update loop AFTER the type AI has
  // set velocity toward the player, so this pull overrides it and wins out.
  function applyObeliskSeekerSteering(enemy, dt) {
    return globalThis.NeoNyke.simulation.applyCampaignObeliskSeekerSteering(
      enemy, Neo.currentRoom?.challengeData?.obelisk, dt, { speed: enemy?.speed || 90 },
    );
  }

  function steerEnemy(enemy, dirX, dirY, maxSpeed, accel, dt) {
    const slowMultiplier = Neo.getSlowMultiplier?.(enemy) || 1;
    const packSpeedMultiplier = Math.max(1, Number(enemy?.minorPackSpeedMultiplier || 1));
    const signatureSpeedMultiplier = Math.max(1, Number(enemy?.signatureSpeedMultiplier || 1));
    const adjustedSpeed = maxSpeed * slowMultiplier * packSpeedMultiplier * signatureSpeedMultiplier;
    enemy.vx += (dirX * adjustedSpeed - enemy.vx) * accel * dt;
    enemy.vy += (dirY * adjustedSpeed - enemy.vy) * accel * dt;
  }

  // Player-only: when the player is lined up with an open doorway, let them walk
  // out through the wall band to the room edge (the "back" of the doorway) so the
  // room transition only fires once they've actually stepped into the tunnel,
  // rather than the instant they brush the inner wall. Returns clamp bounds.
  function getRoomMoveBounds(entity) {
    if (Neo.gameMode === 'survival' && Neo.currentRoom?.survivalSurface) {
      return { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };
    }
    let minX = Neo.WALL + entity.r;
    let maxX = Neo.ROOM_W - Neo.WALL - entity.r;
    let minY = Neo.WALL + entity.r;
    let maxY = Neo.ROOM_H - Neo.WALL - entity.r;
    if (entity !== Neo.player || !Neo.currentRoom) return { minX, maxX, minY, maxY };
    const hasExit = dir => typeof Neo.hasRoomExit === 'function'
      ? Neo.hasRoomExit(Neo.currentRoom, dir)
      : !!Neo.currentRoom?.doors?.[dir];
    const alignedV = Math.abs(entity.x - Neo.ROOM_W / 2) < Neo.DOOR / 2 - entity.r;
    const alignedH = Math.abs(entity.y - Neo.ROOM_H / 2) < Neo.DOOR / 2 - entity.r;
    if (alignedV && hasExit('n')) minY = entity.r;
    if (alignedV && hasExit('s')) maxY = Neo.ROOM_H - entity.r;
    if (alignedH && hasExit('w')) minX = entity.r;
    if (alignedH && hasExit('e')) maxX = Neo.ROOM_W - entity.r;
    return { minX, maxX, minY, maxY };
  }

  function moveCircle(entity, dt) {
    if (entity.airborne) {
      const b = getRoomMoveBounds(entity);
      entity.x = Neo.clamp(entity.x, b.minX, b.maxX);
      entity.y = Neo.clamp(entity.y, b.minY, b.maxY);
      return;
    }
    const slowMultiplier = Neo.getSlowMultiplier?.(entity) || 1;
    // If the entity is already overlapping a wall (e.g. teleported there by a
    // cutscene), axis-separated movement would block on both axes and trap it
    // forever. Push it toward the nearest free spot instead of freezing.
    if (Neo.isBlocked(entity.x, entity.y, entity.r)) {
      const escape = unstickCircle(entity);
      if (escape) {
        // Ease toward freedom rather than snapping, but always make progress so
        // the entity never stays wedged.
        const ex = escape.x - entity.x;
        const ey = escape.y - entity.y;
        const dist = Math.hypot(ex, ey) || 1;
        const stepDist = Math.min(dist, Math.max(220 * dt, 6));
        entity.x += (ex / dist) * stepDist;
        entity.y += (ey / dist) * stepDist;
        entity.vx = 0;
        entity.vy = 0;
        return;
      }
    }
    const nextX = entity.x + entity.vx * dt * slowMultiplier;
    const nextY = entity.y + entity.vy * dt * slowMultiplier;
    if (!Neo.isBlocked(nextX, entity.y, entity.r)) entity.x = nextX;
    else entity.vx *= -0.4;
    if (!Neo.isBlocked(entity.x, nextY, entity.r)) entity.y = nextY;
    else entity.vy *= -0.4;
    const bounds = getRoomMoveBounds(entity);
    entity.x = Neo.clamp(entity.x, bounds.minX, bounds.maxX);
    entity.y = Neo.clamp(entity.y, bounds.minY, bounds.maxY);
  }

  // Spiral outward from a stuck position to find the closest unblocked spot so a
  // wedged entity can climb back into open floor over a few frames.
  function unstickCircle(entity) {
    const rings = [8, 16, 26, 38, 52, 70];
    const steps = 12;
    for (const ring of rings) {
      for (let step = 0; step < steps; step += 1) {
        const angle = (step / steps) * Math.PI * 2;
        const x = Neo.clamp(entity.x + Math.cos(angle) * ring, Neo.WALL + entity.r, Neo.ROOM_W - Neo.WALL - entity.r);
        const y = Neo.clamp(entity.y + Math.sin(angle) * ring, Neo.WALL + entity.r, Neo.ROOM_H - Neo.WALL - entity.r);
        if (!Neo.isBlocked(x, y, entity.r)) return { x, y };
      }
    }
    return null;
  }

  // Expose on Neo
  Neo.findSafeEnemySpawnPoint = findSafeEnemySpawnPoint;
  Neo.compactEnemyList = compactEnemyList;
  Neo.getCoverObstacles = getCoverObstacles;
  Neo.lineIntersectsRect = lineIntersectsRect;
  Neo.hasLineOfSight = hasLineOfSight;
  Neo.findEnemyCoverTarget = findEnemyCoverTarget;
  Neo.trySteerEnemyToCover = trySteerEnemyToCover;
  Neo.hasNavigableSpawnSpace = hasNavigableSpawnSpace;
  Neo.findBlockingBreakableDestructible = findBlockingBreakableDestructible;
  Neo.enemyTryBreakBlockingObstacle = enemyTryBreakBlockingObstacle;
  Neo.updateMinorEnemyPackPressure = updateMinorEnemyPackPressure;
  Neo.getMiniBossSpawnChance = getMiniBossSpawnChance;
  Neo.getWaveCount = getWaveCount;
  Neo.rollEnemyType = rollEnemyType;
  Neo.getFloorBossType = getFloorBossType;
  Neo.rollChallengeTrialType = rollChallengeTrialType;
  Neo.getChallengeTrialLabel = getChallengeTrialLabel;
  Neo.buildWavePlan = buildWavePlan;
  Neo.spawnMiniBoss = spawnMiniBoss;
  Neo.spawnWave = spawnWave;
  Neo.spawnFloorBoss = spawnFloorBoss;
  Neo.spawnEndlessWave = spawnEndlessWave;
  Neo.isEndlessBossWave = isEndlessBossWave;
  Neo.getEnemyDifficultyMultiplier = getEnemyDifficultyMultiplier;
  Neo.canSpawnEliteEnemies = canSpawnEliteEnemies;
  Neo.rollEliteInventory = rollEliteInventory;
  Neo.rollBlessedEliteInventory = rollBlessedEliteInventory;
  Neo.rollEliteTypes = rollEliteTypes;
  Neo.applyEliteTypes = applyEliteTypes;
  Neo.getEnemyLevelStatMultipliers = globalThis.NeoNyke.simulation.getEnemyLevelStatMultipliers;
  Neo.scaleEnemyStats = scaleEnemyStats;
  Neo.spawnEnemy = spawnEnemy;
  Neo.makeGellehTurret = makeGellehTurret;
  Neo.spawnGodBoss = spawnGodBoss;
  Neo.spawnBlackItemBoss = spawnBlackItemBoss;
  Neo.spawnBlackItemFloorBosses = spawnBlackItemFloorBosses;
  Neo.ensureBlackBugAllies = ensureBlackBugAllies;
  Neo.tryAwakenBlackBugAllies = tryAwakenBlackBugAllies;
  Neo.updateBlackBugAllies = updateBlackBugAllies;
  Neo.updateEntOfPestilence = updateEntOfPestilence;
  Neo.updateTRexBoss = updateTRexBoss;
  Neo.updateSeaSnakeBoss = updateSeaSnakeBoss;
  Neo.playGodDialogue = playGodDialogue;
  Neo.tryPlayKnaveKnightCutscene = tryPlayKnaveKnightCutscene;
  Neo.tryPlayQueenMetaoCutscene = tryPlayQueenMetaoCutscene;
  Neo.tryPlayHandsomeDevilCharacterCutscene = tryPlayHandsomeDevilCharacterCutscene;
  Neo.tryPlayBossIntroCutscene = tryPlayBossIntroCutscene;
  Neo.sayOverEntity = sayOverEntity;
  Neo.sayAtPosition = sayAtPosition;
  Neo.getMirrorChampionStats = getMirrorChampionStats;
  Neo.spawnMirrorChampion = spawnMirrorChampion;
  Neo.spawnMooggyAssassin = spawnMooggyAssassin;
  Neo.spawnChallengeStarter = spawnChallengeStarter;
  Neo.spawnChallengeBombs = spawnChallengeBombs;
  Neo.spawnBombFailAoe = spawnBombFailAoe;
  Neo.spawnChallengeRunes = spawnChallengeRunes;
  Neo.spawnChallengeCircuitSwitches = spawnChallengeCircuitSwitches;
  Neo.pressChallengeCircuitSwitch = pressChallengeCircuitSwitch;
  Neo.getChallengeObeliskMaxHp = getChallengeObeliskMaxHp;
  Neo.spawnTrialEnemyWave = spawnTrialEnemyWave;
  Neo.beginChallengeTrial = beginChallengeTrial;
  Neo.spawnChallengeReward = spawnChallengeReward;
  Neo.completeChallengeTrial = completeChallengeTrial;
  Neo.failChallengeTrial = failChallengeTrial;
  Neo.isBossType = isBossType;
  Neo.getEnemyProgressionLevel = getEnemyProgressionLevel;
  Neo.getEnemyEvadeDifficultyLevel = getEnemyEvadeDifficultyLevel;
  Neo.getEnemyProjectileEvadeChance = getEnemyProjectileEvadeChance;
  Neo.getEnemyIncomingThreat = getEnemyIncomingThreat;
  Neo.findEnemyEvadeDashAngle = findEnemyEvadeDashAngle;
  Neo.updateEnemyProjectileEvade = updateEnemyProjectileEvade;
  Neo.spawnBowmanBane = spawnBowmanBane;
  Neo.updateBowmanBane = updateBowmanBane;
  Neo.updateAntonyBlemmyeBoss = updateAntonyBlemmyeBoss;
  Neo.updateHandsomeDevilBoss = updateHandsomeDevilBoss;
  Neo.updateHunterEnemy = withNpcEnemySignatures(updateHunterEnemy);
  Neo.updateCultMageEnemy = withNpcEnemySignatures(updateCultMageEnemy);
  Neo.updateCultQueenBoss = withNpcEnemySignatures(updateCultQueenBoss);
  Neo.updateBulkGolemBoss = updateBulkGolemBoss;
  Neo.updateArtificerBoss = updateArtificerBoss;
  Neo.updateKnaveEnemy = updateKnaveEnemy;
  Neo.updateSniperEnemy = withNpcEnemySignatures(updateSniperEnemy);
  Neo.updateMachineGunnerEnemy = withNpcEnemySignatures(updateMachineGunnerEnemy);
  Neo.updateGolemEnemy = updateGolemEnemy;
  Neo.updateSummonerEnemy = withNpcEnemySignatures(updateSummonerEnemy);
  Neo.updateShieldUnitEnemy = withNpcEnemySignatures(updateShieldUnitEnemy);
  Neo.updateHealerEnemy = updateHealerEnemy;
  Neo.updateBossSpawnerEnemy = withNpcEnemySignatures(updateBossSpawnerEnemy);
  Neo.updateLaserEnemy = withNpcEnemySignatures(updateLaserEnemy);
  Neo.updateEliteEnemyTraits = updateEliteEnemyTraits;
  Neo.updateChargerEnemy = withNpcEnemySignatures(updateChargerEnemy);
  Neo.getMirrorMove = getMirrorMove;
  Neo.getMirrorSkillCooldown = getMirrorSkillCooldown;
  Neo.getMirrorMoveDamage = getMirrorMoveDamage;
  Neo.getPredictedPlayerPoint = getPredictedPlayerPoint;
  Neo.mirrorHitArc = mirrorHitArc;
  Neo.mirrorBlastPlayer = mirrorBlastPlayer;
  Neo.fireMirrorProjectiles = fireMirrorProjectiles;
  Neo.startMirrorMelee = startMirrorMelee;
  Neo.startMirrorLaser = startMirrorLaser;
  Neo.startMirrorSmash = startMirrorSmash;
  Neo.startMirrorDash = startMirrorDash;
  Neo.updateMirrorChampion = updateMirrorChampion;
  Neo.updateMooggyEnemy = updateMooggyEnemy;
	  Neo.updateChallengeRoomState = updateChallengeRoomState;
	  Neo.applyObeliskSeekerSteering = applyObeliskSeekerSteering;
	  Neo.triggerGodPhase = triggerGodPhase;
	  Neo.updateGod = updateGod;
	  Neo.getGodRunPressure = getGodRunPressure;
  Neo.steerEnemy = steerEnemy;
  Neo.wanderEnemy = wanderEnemy;
  Neo.moveCircle = moveCircle;
